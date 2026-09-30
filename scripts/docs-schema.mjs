// Renders docs/schema.md from the JSON schema the runtime build emits
// (packages/runtime/dist/schema/demo.config.json). Run after `npm run build`:
//   node scripts/docs-schema.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(
  readFileSync(join(root, 'packages/runtime/dist/schema/demo.config.json'), 'utf8'),
);

const sections = [];
const titles = [];
const seen = new Map();

function typeOf(s) {
  if (!s || typeof s !== 'object') return 'any';
  if (s.const !== undefined) return `\`${JSON.stringify(s.const)}\``;
  if (s.enum) return s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(' \\| ');
  if (s.anyOf) return s.anyOf.map(typeOf).join(' \\| ');
  if (s.type === 'array') return `${typeOf(s.items)}[]`;
  if (s.type === 'object') return 'object';
  if (Array.isArray(s.type)) return s.type.join(' \\| ');
  return s.type ?? 'any';
}

function describe(s) {
  const bits = [];
  if (s.description) bits.push(s.description.replace(/\s+/g, ' ').trim());
  if (s.default !== undefined) bits.push(`Default \`${JSON.stringify(s.default)}\`.`);
  if (s.minimum !== undefined || s.maximum !== undefined) {
    bits.push(`Range ${s.minimum ?? '…'}–${s.maximum ?? '…'}.`);
  }
  if (s.pattern) bits.push(`Pattern \`${s.pattern}\`.`);
  return bits.join(' ').replace(/\|/g, '\\|');
}

function objectSchemas(s) {
  if (!s || typeof s !== 'object') return [];
  if (s.type === 'object' && s.properties) return [s];
  if (s.anyOf) return s.anyOf.flatMap(objectSchemas);
  if (s.type === 'array') return objectSchemas(s.items);
  return [];
}

function variantTitle(s, fallback) {
  for (const key of ['kind', 'type', 'variant']) {
    const p = s.properties?.[key];
    if (p?.const !== undefined) return `${fallback} (${key} = \`${p.const}\`)`;
    if (p?.enum?.length === 1) return `${fallback} (${key} = \`${p.enum[0]}\`)`;
  }
  return fallback;
}

// GitHub's heading anchors (github-slugger): the heading's text — code spans
// keep their contents, the backticks go — lowercased, every character that is
// not a letter, digit, space, hyphen or underscore dropped, each space turned
// into a hyphen. Runs are NOT collapsed: `steps (kind = \`content\`)` is
// `steps-kind--content`. A repeated slug gets -1, -2 … in document order.
function githubSlugger() {
  const occurrences = new Map();
  return (heading) => {
    const base = heading
      .replace(/`/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-');
    let slug = base;
    while (occurrences.has(slug)) {
      occurrences.set(base, occurrences.get(base) + 1);
      slug = `${base}-${occurrences.get(base)}`;
    }
    occurrences.set(slug, 0);
    return slug;
  };
}

// Links are written as a placeholder naming the target section, and resolved
// once every heading exists: a heading's anchor depends on how many headings
// with the same text come before it, which is unknown mid-walk.
const link = (index) => `@@anchor:${index}@@`;

function emit(s, title, depth) {
  const sig = JSON.stringify(s);
  if (seen.has(sig)) return seen.get(sig);
  const index = sections.push('') - 1;
  seen.set(sig, { title, index });
  titles[index] = title;
  const required = new Set(s.required ?? []);
  const rows = [];
  for (const [name, prop] of Object.entries(s.properties ?? {})) {
    let type = typeOf(prop);
    const objs = objectSchemas(prop);
    if (objs.length && depth < 4) {
      const links = objs.map((o) => {
        const t = emit(o, variantTitle(o, objs.length > 1 ? name : name), depth + 1);
        return `[${t.title}](#${link(t.index)})`;
      });
      type = prop.type === 'array' ? `${links.join(' \\| ')}[]` : links.join(' \\| ');
    }
    rows.push(`| \`${name}\` | ${type} | ${required.has(name) ? 'yes' : ''} | ${describe(prop)} |`);
  }
  sections[index] =
    `${'#'.repeat(Math.min(depth + 2, 5))} ${title}\n\n${s.description ? s.description.replace(/\s+/g, ' ').trim() + '\n\n' : ''}| field | type | required | notes |\n|---|---|---|---|\n${rows.join('\n')}\n`;
  return { title, index };
}

emit(schema, 'Demo (demo.config.json)', 0);

const TITLE = 'demo.config.json reference';
const slug = githubSlugger();
slug(TITLE);
const anchors = titles.map((t) => slug(t));
const body = sections.join('\n').replace(/@@anchor:(\d+)@@/g, (_, i) => anchors[Number(i)]);

const out = `# ${TITLE}

Generated from the JSON schema published with \`@inkly-org/interactive-demo\`
(\`dist/schema/demo.config.json\`). Regenerate with \`node scripts/docs-schema.mjs\`.
Point editors at the schema with:

\`\`\`json
{ "$schema": "${schema.$id}" }
\`\`\`

${body}
> \`annotations[]\` and \`widgets[]\` also accept any object whose \`type\` is not one
> of the variants above; the player skips those (forward compatibility).
`;
writeFileSync(join(root, 'docs/schema.md'), out);
console.log(`docs/schema.md: ${sections.length} sections, ${out.split('\n').length} lines`);
