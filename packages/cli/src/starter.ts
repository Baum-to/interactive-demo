import {
  DEMO_CONFIG_SCHEMA_URL,
  DemoSchema,
  generateDemoId,
} from '@inkly-org/interactive-demo/schema';
import { resolveTemplate } from './page.js';
import { PROJECT_FILE, ProjectSchema } from './project.js';

/**
 * Project skeleton — the starter file set every brand-new project begins
 * with, plus the starter demo `init --demo` scaffolds. The single source of
 * truth for what a fresh project looks like lives in this file.
 */

export const STARTER_SLUG = 'getting-started';

export interface SkeletonFile {
  /** Forward-slash path relative to the project root. */
  path: string;
  /** Text contents. Mutually exclusive with `copyFrom`. */
  contents?: string;
  /**
   * Absolute path of a file to copy verbatim. Used for binary template
   * assets, which cannot round-trip through a string.
   */
  copyFrom?: string;
}

/** Convert a kebab-case slug into a human-readable Title Case title. */
export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const DEFAULT_DEMO_THEME = {
  tokens: {
    primary: '#5b6cff',
    secondary: '#ebebeb',
    font: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
    radius: '10px',
  },
} as const;

const DEFAULT_DEMO_CHROME = {
  hideHeader: false,
  hideControls: false,
  controls: 'full',
  mobileFooterMessage: true,
  autoplay: false,
} as const;

/**
 * File name of the starter's placeholder shot under `assets/`.
 *
 * PNG, not SVG. The hosted service's asset allowlist takes images, video and
 * audio but refuses SVG, which can carry script — so a scaffold that shipped
 * an SVG could be built and served locally but never published, and the very
 * first thing a new user does (`init` then `publish`) failed on it.
 */
export const PLACEHOLDER_FILE = 'placeholder.png';
const PLACEHOLDER_WIDTH = 1920;
const PLACEHOLDER_HEIGHT = 1080;

/**
 * The placeholder is a neutral wireframe of a generic web app — sidebar,
 * header with a primary button, stat cards, a chart and a customer list —
 * so the starter's hotspot, area, blur and zoom land on plausible UI. Its
 * design is `placeholderSvg()` in scripts/placeholder.mjs, which also lists
 * the pixel box of every element the starter points at; regenerate the PNG
 * after changing it:
 *
 *   npm run build:placeholder -w @inkly-org/interactive-demo-cli
 *
 * The coordinates below are those boxes as fractions of the image, and
 * tests/init.test.ts holds the two together. The author swaps the
 * placeholder for a real capture (run `interactive-demo capture start <url>`,
 * or upload a screenshot in the editor and point the step at it).
 */
const PLACEHOLDER_BACKGROUND = {
  type: 'image',
  src: `assets/${PLACEHOLDER_FILE}`,
  naturalWidth: PLACEHOLDER_WIDTH,
  naturalHeight: PLACEHOLDER_HEIGHT,
  alt: 'Placeholder screen — replace with your capture',
  objectFit: 'cover',
} as const;

const DOCS_URL = 'https://github.com/inkly-ai/interactive-demo#readme';

/**
 * Starter demo: a short tour that shows what a demo can carry and names the
 * editor menu each piece comes from, so the first `npm run dev` teaches the
 * format before the author replaces it with a capture. An intro cover, three
 * content steps on the placeholder (a click, a callout and an area, a zoom
 * with a blur and a text label) and an outro cover. A fresh, opaque `id` is
 * minted via `generateDemoId()`; a demo's identity is permanent and
 * independent of its folder slug.
 */
export function starterDemoConfig(slug: string, title?: string): unknown {
  return {
    $schema: DEMO_CONFIG_SCHEMA_URL,
    id: generateDemoId(),
    version: 1,
    title: title ?? titleFromSlug(slug),
    theme: DEFAULT_DEMO_THEME,
    chrome: DEFAULT_DEMO_CHROME,
    chapters: [
      { id: 'walkthrough', title: 'Walkthrough', stepIds: ['shot-1', 'shot-2', 'shot-3'] },
    ],
    steps: [
      {
        kind: 'cover',
        id: 'cover-intro',
        widgets: [
          {
            type: 'headline',
            id: 'headline-intro',
            title: 'Your first interactive demo',
            description:
              'A short tour of what a demo can do: clicks, callouts, zoom and blur. Then make it yours.',
            textAlign: 'middle',
            cta: {
              label: 'Start the tour',
              action: { type: 'next' },
              animation: 'shimmer',
            },
            secondaryCta: {
              label: 'Read the docs',
              action: { type: 'url', href: DOCS_URL, target: '_blank' },
              animation: 'none',
              background: '#ffffff',
              textColor: '#1d2130',
            },
          },
        ],
        advance: { trigger: 'click' },
      },
      {
        kind: 'content',
        id: 'shot-1',
        label: 'Click-through',
        background: PLACEHOLDER_BACKGROUND,
        script:
          'Every click you record becomes a step like this one: your screen, with the cursor on what you clicked.',
        advance: { trigger: 'click' },
        annotations: [
          {
            // On the "New report" button in the header, right of its label
            // so the cursor doesn't cover it.
            id: 'shot-1-click',
            type: 'message',
            variant: 'cursor',
            x: 0.9542,
            y: 0.0481,
            anchor: 'bottom',
            showMessage: true,
            text: 'Every click you record becomes a step like this one, with the cursor on what you clicked. Click **New report** to go on.',
          },
        ],
      },
      {
        kind: 'content',
        id: 'shot-2',
        label: 'Explain',
        background: PLACEHOLDER_BACKGROUND,
        script: 'Areas and callouts explain what the viewer is looking at.',
        advance: { trigger: 'click' },
        annotations: [
          {
            // Around the row of four stat cards.
            id: 'shot-2-area',
            type: 'message',
            variant: 'area',
            x: 0.175,
            y: 0.1074,
            w: 0.8063,
            h: 0.1704,
            anchor: 'bottom',
            showNavigation: false,
            text: 'An **Area** frames a region, like these numbers.',
          },
          {
            // Over the chart, which this step isn't about.
            id: 'shot-2-callout',
            type: 'message',
            variant: 'callout',
            x: 0.3766,
            y: 0.6667,
            anchor: 'auto',
            text: 'A **Callout** pins a note anywhere. Add either one, or a Cursor or Pointer, from the editor\'s **Message** menu.',
          },
        ],
      },
      {
        kind: 'content',
        id: 'shot-3',
        label: 'Focus and hide',
        background: PLACEHOLDER_BACKGROUND,
        script: 'Zoom frames what matters, and blur hides anything private.',
        // Frames the chart and the customer list beside it at 1.5x.
        transform: { zoom: 1.5, x: 0.475, y: 0.8333 },
        advance: { trigger: 'click' },
        annotations: [
          {
            // The names and emails in the customer list.
            id: 'shot-3-blur',
            type: 'blur',
            x: 0.6208,
            y: 0.3778,
            w: 0.1432,
            h: 0.5185,
            intensity: 8,
          },
          {
            id: 'shot-3-label',
            type: 'text',
            x: 0.6924,
            y: 0.6370,
            text: '**Hidden with Blur**',
            fontSize: 16,
            color: '#4656f0',
          },
          {
            // In the empty top-left of the chart's plot, above the line.
            id: 'shot-3-callout',
            type: 'message',
            variant: 'callout',
            x: 0.33,
            y: 0.52,
            anchor: 'auto',
            text: 'The editor\'s **Annotate** menu adds these: **Zoom** to frame what matters, **Blur** to hide private data, **Text** for a label.',
          },
        ],
      },
      {
        kind: 'cover',
        id: 'cover-outro',
        widgets: [
          {
            type: 'headline',
            id: 'headline-outro',
            title: 'Your turn',
            description:
              'Replace these screens with your own: record your product with `npx interactive-demo capture start <url>`, then publish it for a link to share.',
            textAlign: 'middle',
            cta: {
              label: 'Read the docs',
              action: { type: 'url', href: DOCS_URL, target: '_blank' },
              animation: 'shimmer',
            },
            secondaryCta: {
              label: 'Replay',
              action: { type: 'restart' },
              animation: 'none',
              background: '#ffffff',
              textColor: '#1d2130',
            },
          },
        ],
        advance: { trigger: 'click' },
      },
    ],
  };
}

function projectConfig(name: string): unknown {
  return {
    name,
    brand: { name },
    demos: [STARTER_SLUG],
  };
}

const GITIGNORE = `node_modules/
dist/
`;

const CLI_PACKAGE = '@inkly-org/interactive-demo-cli';

function projectPackageJson(name: string, cliVersion: string): string {
  return (
    JSON.stringify(
      {
        name,
        private: true,
        scripts: {
          dev: 'interactive-demo dev',
          validate: 'interactive-demo validate',
          build: 'interactive-demo build',
        },
        devDependencies: {
          [CLI_PACKAGE]: cliVersion,
        },
      },
      null,
      2,
    ) + '\n'
  );
}

function projectReadme(name: string): string {
  return `# ${name}

Interactive product demos, built with \`interactive-demo\`.

Each folder under \`demos/\` is one demo: a \`demo.config.json\` describing
the steps, and the screenshots and recordings it references under
\`assets/\`. The project itself is configured by \`${PROJECT_FILE}\`.

\`\`\`bash
npm install
\`\`\`

## Record your product

Needs Google Chrome.

\`\`\`bash
npx interactive-demo capture start https://app.example.com
# click through the product in the window that opens
npx interactive-demo capture stop
\`\`\`

Every click becomes a step, with the pointer where you clicked. \`stop\`
writes the recording as a new demo under \`demos/\`.

## Preview and edit

\`\`\`bash
npm run dev
\`\`\`

Opens a local preview of every demo, with the editor at \`/__demo/editor/\`.
Edits are written straight to the files in this folder.

## Ship it

\`\`\`bash
npx interactive-demo login && npx interactive-demo publish
\`\`\`

Puts the demo online and prints its link. Publishing again updates the same
link, so embeds keep working. Once the project has more than one demo, name
it: \`npx interactive-demo publish demos/<slug>\`. \`npx interactive-demo embed\`
prints the embed snippet.

## Host it yourself instead

\`\`\`bash
npm run build
\`\`\`

Writes a self-contained static folder per demo under \`dist/\`. Deploy it to
any static host; the build prints the embed snippets, which are the same as
the published ones apart from the host.
`;
}

export interface ProjectSkeletonOptions {
  /** Value for the project's `name` and the README heading. */
  name: string;
  /**
   * Version range written for the CLI devDependency in the scaffolded
   * package.json (e.g. `^0.1.0`). Defaults to `latest`.
   */
  cliVersion?: string;
  /** Skip the starter demo. */
  noStarterDemo?: boolean;
}

/** The starter demo's file set, relative to the demo folder. */
export function starterDemoFiles(slug: string, title?: string): {
  files: SkeletonFile[];
  id: string;
} {
  const demoConfig = starterDemoConfig(slug, title);

  const demoParsed = DemoSchema.safeParse(demoConfig);
  if (!demoParsed.success) {
    throw new Error(
      `Internal error: scaffolded demo failed schema validation. ${demoParsed.error.message}`,
    );
  }
  return {
    id: demoParsed.data.id,
    files: [
      { path: 'demo.config.json', contents: JSON.stringify(demoConfig, null, 2) + '\n' },
      { path: `assets/${PLACEHOLDER_FILE}`, copyFrom: resolveTemplate(PLACEHOLDER_FILE) },
    ],
  };
}

/**
 * Render the full starter file set for a new project. Throws if the
 * generated project file or starter demo fails schema validation — that
 * means the schema package and this skeleton have drifted, and the fix is
 * here, not at the caller.
 */
export function getProjectSkeleton(options: ProjectSkeletonOptions): SkeletonFile[] {
  const { name } = options;

  const project = projectConfig(name);
  const projectParsed = ProjectSchema.safeParse(project);
  if (!projectParsed.success) {
    throw new Error(
      `Internal error: starter ${PROJECT_FILE} failed schema validation. ${projectParsed.error.message}`,
    );
  }

  const files: SkeletonFile[] = [
    { path: 'README.md', contents: projectReadme(name) },
    { path: '.gitignore', contents: GITIGNORE },
    { path: 'package.json', contents: projectPackageJson(name, options.cliVersion ?? 'latest') },
  ];

  if (options.noStarterDemo) {
    files.push({
      path: PROJECT_FILE,
      contents: JSON.stringify({ ...(project as object), demos: [] }, null, 2) + '\n',
    });
    return files;
  }

  files.push({ path: PROJECT_FILE, contents: JSON.stringify(project, null, 2) + '\n' });
  for (const file of starterDemoFiles(STARTER_SLUG, 'Getting Started').files) {
    // Spread, don't re-wrap: picking fields off by hand dropped `copyFrom`
    // and scaffolded a zero-byte placeholder.
    files.push({ ...file, path: `demos/${STARTER_SLUG}/${file.path}` });
  }
  return files;
}

