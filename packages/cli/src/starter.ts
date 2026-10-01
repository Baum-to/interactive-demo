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
 * The placeholder shows the two ways to record a first demo, side by side: a
 * terminal running `capture start` (or the same thing asked of an agent), and
 * Chrome with the Interactive Demo Capture extension's popup open. Its design
 * is `placeholderSvg()` in scripts/placeholder.mjs, which also lists the pixel
 * box of every element the starter points at; regenerate the PNG after
 * changing it:
 *
 *   npm run build:placeholder -w @inkly-org/interactive-demo-cli
 *
 * The coordinates below are those boxes as fractions of the image, and
 * tests/init.test.ts holds the two together. The author replaces the step
 * with a real capture.
 */
const PLACEHOLDER_BACKGROUND = {
  type: 'image',
  src: `assets/${PLACEHOLDER_FILE}`,
  naturalWidth: PLACEHOLDER_WIDTH,
  naturalHeight: PLACEHOLDER_HEIGHT,
  alt: 'Two ways to capture a demo: the interactive-demo CLI in a terminal, or the Interactive Demo Capture extension in Chrome',
  objectFit: 'cover',
} as const;

/**
 * Starter demo: one step, on how to capture the real thing. It is a demo, not
 * a lesson: the screen shows the CLI (which an agent can drive too) beside
 * the Chrome extension, with a hotspot on each, and the author's first
 * capture replaces it. A fresh, opaque `id` is minted via `generateDemoId()`;
 * a demo's identity is permanent and independent of its folder slug.
 */
export function starterDemoConfig(slug: string, title?: string): unknown {
  return {
    $schema: DEMO_CONFIG_SCHEMA_URL,
    id: generateDemoId(),
    version: 1,
    title: title ?? titleFromSlug(slug),
    theme: DEFAULT_DEMO_THEME,
    chrome: DEFAULT_DEMO_CHROME,
    steps: [
      {
        kind: 'content',
        id: 'capture',
        label: 'Capture your first demo',
        background: PLACEHOLDER_BACKGROUND,
        script: 'Record your product with the CLI, your agent or the Chrome extension.',
        advance: { trigger: 'click' },
        annotations: [
          {
            // On the prompt of the terminal's first command, so the command
            // itself stays readable; its card drops into the gap under it.
            id: 'capture-cli',
            type: 'message',
            variant: 'pointer',
            x: 0.0849,
            y: 0.3509,
            anchor: 'bottom',
            showNavigation: false,
            text: 'Run **capture start** with your app\'s URL, click through it, then **capture stop**.',
          },
          {
            // On the record glyph of the extension popup's Start Recording
            // button; its card hangs over the page below the popup.
            id: 'capture-extension',
            type: 'message',
            variant: 'pointer',
            x: 0.7417,
            y: 0.6231,
            anchor: 'bottom',
            showNavigation: false,
            text: 'Or record in your own Chrome with the extension, and download the ZIP.',
          },
        ],
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

/** Where the README and `init` send people for the Chrome extension. */
export const EXTENSION_DOCS_URL =
  'https://docs.inklyai.dev/open-source/capture#the-chrome-extension';
/** The agent skill that drives the CLI. */
export const SKILL_URL =
  'https://github.com/inkly-ai/interactive-demo/blob/main/skills/interactive-demo/SKILL.md';

function projectReadme(name: string): string {
  return `# ${name}

Interactive product demos, built with \`interactive-demo\`.

Each folder under \`demos/\` is one demo: a \`demo.config.json\` describing
the steps, and the screenshots and recordings it references under
\`assets/\`. The project itself is configured by \`${PROJECT_FILE}\`.

\`\`\`bash
npm install
\`\`\`

## Capture your product

Click through your product once; every click becomes a step. Pick a way:

- **The CLI.** Needs Google Chrome.

  \`\`\`bash
  npx interactive-demo capture start https://your.app
  # click through the product in the window that opens
  npx interactive-demo capture stop
  \`\`\`

  \`stop\` writes the recording as a new demo under \`demos/\`.

- **Your agent.** Point it at the [agent skill](${SKILL_URL}) and ask:
  "record a demo of https://your.app". It runs the same commands.

- **The [Chrome extension](${EXTENSION_DOCS_URL}).** Record in your own
  browser, download the ZIP, then:

  \`\`\`bash
  npx interactive-demo init --from ~/Downloads/<file>.zip
  \`\`\`

The \`getting-started\` demo is a one-step placeholder. Once you have your own,
delete its folder and its entry in \`${PROJECT_FILE}\`.

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

