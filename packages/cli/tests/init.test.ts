import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { zipSync } from 'fflate';
import { DemoSchema, isValidDemoId } from '@inkly-org/interactive-demo/schema';
import { runAddDemo, runInit } from '../src/commands/init';
import { PROJECT_FILE, ProjectSchema } from '../src/project';
import { starterDemoConfig } from '../src/starter';

type Box = { x: number; y: number; w: number; h: number };

describe('runInit', () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-init-test-'));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('scaffolds a placeholder the hosted service will accept', async () => {
    const result = await runInit({ name: 'site', cwd: workdir, silent: true });
    const placeholder = join(result.dir, 'demos', 'getting-started', 'assets', 'placeholder.png');

    // Not just the extension: the bytes have to be a real PNG. An earlier
    // version copied the field list by hand, dropped `copyFrom`, and wrote a
    // zero-byte file that still ended in .png.
    const bytes = await readFile(placeholder);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // SVG is refused by the hosted allowlist — it can carry script — so a
    // scaffolded SVG could be built locally but never published.
    const files = await readdir(join(result.dir, 'demos', 'getting-started', 'assets'));
    expect(files.some((f) => f.endsWith('.svg'))).toBe(false);
  });

  it('scaffolds a project with a valid project file and starter demo', async () => {
    const result = await runInit({ name: 'sample', cwd: workdir, silent: true });

    expect(result.dir).toBe(join(workdir, 'sample'));
    expect(result.files.sort()).toEqual(
      [
        '.gitignore',
        'README.md',
        'package.json',
        PROJECT_FILE,
        join('demos', 'getting-started', 'demo.config.json'),
        join('demos', 'getting-started', 'assets', 'placeholder.png'),
      ].sort(),
    );

    for (const file of result.files) {
      const s = await stat(join(result.dir, file));
      expect(s.isFile()).toBe(true);
    }

    const project = JSON.parse(await readFile(join(result.dir, PROJECT_FILE), 'utf8'));
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(project.name).toBe('sample');
    expect(project).not.toHaveProperty('theme');
    expect(project.demos).toEqual(['getting-started']);
    expect(project.runtime).toBeUndefined();
    expect(project.collections).toBeUndefined();

    const demo = JSON.parse(
      await readFile(join(result.dir, 'demos', 'getting-started', 'demo.config.json'), 'utf8'),
    );
    expect(DemoSchema.safeParse(demo).success).toBe(true);
    // The starter demo's identity is a freshly-minted opaque id, not the
    // folder slug.
    expect(isValidDemoId(demo.id)).toBe(true);
    expect(demo.title).toBe('Getting Started');
    // One content step, on how to capture: a demo, not a lesson. No covers,
    // no chapters.
    expect(demo.steps).toHaveLength(1);
    const [step] = demo.steps;
    expect(step).toMatchObject({
      kind: 'content',
      label: 'Capture your first demo',
      background: { type: 'image', src: 'assets/placeholder.png' },
    });
    expect(demo.chapters ?? []).toEqual([]);
    // A pointer on each way to capture, one sentence apiece.
    const notes = step.annotations as Array<{ type: string; variant: string; text: string }>;
    expect(notes.map((a) => [a.type, a.variant])).toEqual([
      ['message', 'pointer'],
      ['message', 'pointer'],
    ]);
    expect(notes[0]!.text).toContain('capture start');
    expect(notes[1]!.text).toMatch(/extension/);
    for (const note of notes) expect(note.text.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length).toBe(1);
    expect(step.script.length).toBeLessThan(100);

    expect((await stat(join(result.dir, 'demos', 'getting-started', 'assets', 'placeholder.png'))).isFile()).toBe(true);

    // The README leads with the ways to capture — the CLI, an agent, the
    // extension — then edit, publish, and self-hosting beside it.
    const readme = await readFile(join(result.dir, 'README.md'), 'utf8');
    const order = [
      'npm install',
      'npx interactive-demo capture start',
      'npx interactive-demo capture stop',
      'skills/interactive-demo/SKILL.md',
      'docs.inklyai.dev/open-source/capture#the-chrome-extension',
      'npx interactive-demo init --from',
      'npm run dev',
      'npx interactive-demo login && npx interactive-demo publish',
      'npm run build',
    ].map((needle) => readme.indexOf(needle));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const ignore = await readFile(join(result.dir, '.gitignore'), 'utf8');
    expect(ignore).toContain('node_modules/');
    expect(ignore).toContain('dist/');
  });

  it('prints next steps that capture, preview, then publish', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      await runInit({ name: 'chatty', cwd: workdir });
    } finally {
      spy.mockRestore();
    }
    const text = writes.join('');
    const order = [
      'npm install',
      'npx interactive-demo capture start <url>',
      'npx interactive-demo capture stop',
      'ask your agent',
      'skills/interactive-demo/SKILL.md',
      'npx interactive-demo init --from <zip>',
      'https://docs.inklyai.dev/open-source/capture#the-chrome-extension',
      'npm run dev',
      'npx interactive-demo login && npx interactive-demo publish',
      'npm run build',
    ].map((needle) => text.indexOf(needle));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // And it says the starter is only a placeholder.
    expect(text).toContain('demos/getting-started/ is a one-step placeholder');
  });

  it('--no-starter-demo scaffolds an empty project with an empty demos list', async () => {
    const result = await runInit({ name: 'empty', cwd: workdir, silent: true, noStarterDemo: true });

    expect(result.files.some((f) => f.includes('getting-started'))).toBe(false);
    expect(result.files.sort()).toEqual(['.gitignore', 'README.md', 'package.json', PROJECT_FILE].sort());

    const project = JSON.parse(await readFile(join(result.dir, PROJECT_FILE), 'utf8'));
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    expect(project.demos).toEqual([]);
  });

  it('refuses to overwrite an existing directory', async () => {
    await runInit({ name: 'collide', cwd: workdir, silent: true });
    await expect(
      runInit({ name: 'collide', cwd: workdir, silent: true }),
    ).rejects.toThrow(/already exists/);
  });

  it('rejects invalid project names', async () => {
    await expect(
      runInit({ name: 'Bad_Name', cwd: workdir, silent: true }),
    ).rejects.toThrow();
  });
});

describe('starter demo on its placeholder', () => {
  it('lands each hotspot on the element it describes', async () => {
    // The placeholder is drawn by scripts/placeholder.mjs, which lists the
    // pixel box of each element the starter points at. The starter carries
    // them as fractions; moving one without the other fails here.
    const design = new URL('../scripts/placeholder.mjs', import.meta.url).href;
    const { WIDTH, HEIGHT, TARGETS } = (await import(design)) as {
      WIDTH: number;
      HEIGHT: number;
      TARGETS: Record<'cliCommand' | 'recordButton' | 'popup', Box>;
    };
    const norm = (b: Box): Box => ({ x: b.x / WIDTH, y: b.y / HEIGHT, w: b.w / WIDTH, h: b.h / HEIGHT });
    const slack = 0.002;
    const within = (inner: Box, outer: Box) =>
      inner.x >= outer.x - slack &&
      inner.y >= outer.y - slack &&
      inner.x + inner.w <= outer.x + outer.w + slack &&
      inner.y + inner.h <= outer.y + outer.h + slack;
    const point = (a: { x: number; y: number }): Box => ({ x: a.x, y: a.y, w: 0, h: 0 });

    const demo = starterDemoConfig('getting-started') as {
      steps: Array<{
        id: string;
        background?: { naturalWidth: number; naturalHeight: number };
        annotations?: Array<Box & { id: string; anchor: string }>;
      }>;
    };
    const step = demo.steps[0]!;
    expect(step.background).toMatchObject({ naturalWidth: WIDTH, naturalHeight: HEIGHT });
    const note = (id: string) => step.annotations!.find((a) => a.id === id)!;

    // One pointer on the `capture start` command, one on Start Recording.
    expect(within(point(note('capture-cli')), norm(TARGETS.cliCommand))).toBe(true);
    expect(within(point(note('capture-extension')), norm(TARGETS.recordButton))).toBe(true);
    expect(within(norm(TARGETS.recordButton), norm(TARGETS.popup))).toBe(true);
    // Both cards open downward, into room the design leaves for them, not
    // over the command or the popup's name and step count above.
    expect(note('capture-cli').anchor).toBe('bottom');
    expect(note('capture-extension').anchor).toBe('bottom');
  });
});

describe('runAddDemo', () => {
  let workdir: string;
  let projectDir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'interactive-demo-add-test-'));
    const init = await runInit({ name: 'myproject', cwd: workdir, silent: true });
    projectDir = init.dir;
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('scaffolds a new demo with a valid demo.config.json and registers it', async () => {
    const result = await runAddDemo({ slug: 'checkout', cwd: projectDir, silent: true });

    expect(result.demoDir).toBe(join(projectDir, 'demos', 'checkout'));
    const demo = JSON.parse(await readFile(join(result.demoDir, 'demo.config.json'), 'utf8'));
    expect(DemoSchema.safeParse(demo).success).toBe(true);
    expect(isValidDemoId(demo.id)).toBe(true);
    expect(demo.id).toBe(result.id);
    expect(demo.title).toBe('Checkout');
    expect(demo.steps).toHaveLength(1);
    expect((await stat(join(result.demoDir, 'assets', 'placeholder.png'))).isFile()).toBe(true);

    expect(result.registered).toBe(true);
    const project = JSON.parse(await readFile(join(projectDir, PROJECT_FILE), 'utf8'));
    expect(project.demos).toEqual(['getting-started', 'checkout']);
  });

  it('rejects reserved slugs with the validator reason', async () => {
    await expect(
      runAddDemo({ slug: '__demo', cwd: projectDir, silent: true }),
    ).rejects.toThrow(/reserved/);
  });

  it('rejects "assets" as a demo slug', async () => {
    await expect(
      runAddDemo({ slug: 'assets', cwd: projectDir, silent: true }),
    ).rejects.toThrow(/reserved/);
  });

  it('errors when the demo folder already exists', async () => {
    await expect(
      runAddDemo({ slug: 'getting-started', cwd: projectDir, silent: true }),
    ).rejects.toThrow(/already exists/);
  });

  it('errors when not inside a project', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'interactive-demo-add-outside-'));
    try {
      await expect(
        runAddDemo({ slug: 'foo', cwd: outside, silent: true }),
      ).rejects.toThrow(/Not inside a project/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('leaves the project file untouched when it keeps no demos list', async () => {
    const minimal = { name: 'myproject' };
    await writeFile(join(projectDir, PROJECT_FILE), JSON.stringify(minimal, null, 2) + '\n');
    const result = await runAddDemo({ slug: 'standalone', cwd: projectDir, silent: true });
    expect(result.registered).toBe(false);
    const project = JSON.parse(await readFile(join(projectDir, PROJECT_FILE), 'utf8'));
    expect(project).toEqual(minimal);
  });

  it('finds the project root from a nested cwd', async () => {
    const nested = join(projectDir, 'demos', 'getting-started');
    const result = await runAddDemo({ slug: 'nested-cwd', cwd: nested, silent: true });
    expect(result.projectRoot).toBe(projectDir);
  });

  async function writeCapturedFolder(dir: string): Promise<void> {
    await mkdir(join(dir, 'assets'), { recursive: true });
    await writeFile(
      join(dir, 'demo.config.json'),
      JSON.stringify({
        id: 'CaPtUrEd0001',
        version: 1,
        title: 'Captured Tour',
        steps: [
          {
            kind: 'content',
            id: 's1',
            background: { type: 'image', src: `assets/${'a'.repeat(64)}.png`, naturalWidth: 1440, naturalHeight: 900 },
            advance: { trigger: 'click' },
          },
        ],
      }),
    );
    await writeFile(join(dir, 'assets', `${'a'.repeat(64)}.png`), 'png-bytes');
  }

  it('imports an existing demo folder via --from, keeping its id and copying assets', async () => {
    const src = join(workdir, 'tour-export');
    await writeCapturedFolder(src);

    const result = await runAddDemo({ slug: 'tour', cwd: projectDir, from: src, silent: true });

    expect(result.id).toBe('CaPtUrEd0001'); // preserved, not re-minted
    const config = JSON.parse(await readFile(join(result.demoDir, 'demo.config.json'), 'utf8'));
    expect(DemoSchema.safeParse(config).success).toBe(true);
    expect(config.id).toBe('CaPtUrEd0001');
    expect((await stat(join(result.demoDir, 'assets', `${'a'.repeat(64)}.png`))).isFile()).toBe(true);
    const project = JSON.parse(await readFile(join(projectDir, PROJECT_FILE), 'utf8'));
    expect(project.demos).toContain('tour');
  });

  /** Zip a folder written by `writeCapturedFolder`, nested under `<slug>/` the
   *  way the capture extension downloads it. */
  async function zipCapturedFolder(srcDir: string, slug: string, zipPath: string) {
    const files: Record<string, Uint8Array> = {};
    for (const rel of ['demo.config.json', join('assets', `${'a'.repeat(64)}.png`)]) {
      files[`${slug}/${rel.split(sep).join('/')}`] = new Uint8Array(
        await readFile(join(srcDir, rel)),
      );
    }
    await writeFile(zipPath, Buffer.from(zipSync(files)));
  }

  it('imports a .zip of a demo folder via --from, without unzipping first', async () => {
    const src = join(workdir, 'zip-export');
    await writeCapturedFolder(src);
    const zipPath = join(workdir, 'my-capture-ab12cd.zip');
    await zipCapturedFolder(src, 'my-capture-ab12cd', zipPath);

    const result = await runAddDemo({
      slug: 'from-zip', cwd: projectDir, from: zipPath, silent: true,
    });

    expect(result.id).toBe('CaPtUrEd0001'); // preserved, as with a folder
    const config = JSON.parse(await readFile(join(result.demoDir, 'demo.config.json'), 'utf8'));
    expect(DemoSchema.safeParse(config).success).toBe(true);
    expect(
      (await stat(join(result.demoDir, 'assets', `${'a'.repeat(64)}.png`))).isFile(),
    ).toBe(true);
  });

  it('rejects a zip that holds no demo.config.json', async () => {
    const zipPath = join(workdir, 'junk.zip');
    await writeFile(
      zipPath,
      Buffer.from(zipSync({ 'notes.txt': new TextEncoder().encode('hi') })),
    );
    await expect(
      runAddDemo({ slug: 'x', cwd: projectDir, from: zipPath, silent: true }),
    ).rejects.toThrow(/not a demo zip/i);
  });

  it('rejects --from when the source has no demo.config.json', async () => {
    const src = join(workdir, 'not-a-demo');
    await mkdir(src, { recursive: true });
    await expect(runAddDemo({ slug: 'x', cwd: projectDir, from: src, silent: true })).rejects.toThrow(
      /not a demo folder/i,
    );
  });
});
