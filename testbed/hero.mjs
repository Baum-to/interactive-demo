#!/usr/bin/env node
/**
 * Films the README's two animations from the showcase.
 *
 *   node testbed/hero.mjs [--only demo,editor] [--out <dir>] [--frames <dir>]
 *
 *   demo    docs/images/demo.webp — the built showcase playing, cover to
 *           outro, driven through the player's own `window.__demo.controls`.
 *   editor  docs/images/editor-anim.webp — the editor open on the showcase,
 *           clicked through its filmstrip the way a person would, then a
 *           hotspot opened for editing.
 *
 * Both are photographs of the real thing: the showcase is built with the
 * built CLI and served from the testbed's stand-in site, the editor is the
 * one `interactive-demo dev` serves. Frames are taken in real time, identical
 * neighbours are merged into one longer frame, and the lot is encoded as a
 * looping animated WebP small enough for a README.
 *
 * Re-shoot the showcase first (`node testbed/shoot-showcase.mjs`) when the UI
 * has changed; this only films what is in examples/showcase.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { launch, sleep } from './lib/browser.mjs';
import { CLI, cli, freePort, repoRoot, startServer, stopAll } from './lib/procs.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const ONLY = new Set(flag('only', 'demo,editor').split(','));
const OUT = resolve(repoRoot, flag('out', 'docs/images'));
const FRAMES = flag('frames', null) && resolve(flag('frames'));
const SHOWCASE = join(repoRoot, 'examples/showcase');
const SLUG = 'interactive-demo';

/** Output width of both animations; the viewport is scaled down to it. */
const OUT_WIDTH = 1000;
/** Frame interval: 8 fps is smooth enough for UI and keeps the file small. */
const TICK = 125;

if (!existsSync(CLI)) {
  process.stderr.write('no built CLI — run `npm run build` first\n');
  process.exit(1);
}

const step = (text) => process.stdout.write(`\n\x1b[1m> ${text}\x1b[0m\n`);
const note = (text) => process.stdout.write(`  ${text}\n`);

/**
 * A reel of frames taken while the page does its thing. `hold(ms)` keeps
 * shooting at TICK for that long; whatever was triggered just before it
 * (a step change, a click) plays out on film.
 */
function reel(browser) {
  const frames = [];
  return {
    frames,
    async hold(ms, tick = TICK) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const at = Date.now();
        frames.push({ png: await browser.frame(), at });
        const left = tick - (Date.now() - at);
        if (left > 0) await sleep(left);
      }
    },
  };
}

/**
 * Scale each frame down, merge runs of identical frames into one longer frame,
 * and encode an animated WebP that loops forever.
 */
async function encode(frames, file, { quality, width: outWidth = OUT_WIDTH }) {
  const scaled = [];
  for (let i = 0; i < frames.length; i++) {
    const next = frames[i + 1]?.at ?? frames[i].at + TICK;
    // Delays land on the TICK grid, so the pacing is the same run to run
    // even when a screenshot took a little longer than a tick.
    const delay = Math.max(TICK, Math.round((next - frames[i].at) / TICK) * TICK);
    const raw = await sharp(frames[i].png)
      .resize({ width: outWidth, kernel: 'lanczos3' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const last = scaled[scaled.length - 1];
    if (last && last.data.equals(raw.data)) last.delay += delay;
    else scaled.push({ data: raw.data, info: raw.info, delay });
  }
  const { width, height } = scaled[0].info;
  if (FRAMES) {
    const dir = join(FRAMES, file.replace(/\.webp$/, ''));
    mkdirSync(dir, { recursive: true });
    for (const [i, frame] of scaled.entries()) {
      await sharp(frame.data, { raw: { width, height, channels: 3 } })
        .png()
        .toFile(join(dir, `${String(i).padStart(3, '0')}.png`));
    }
  }
  const inputs = await Promise.all(
    scaled.map((frame) => sharp(frame.data, { raw: { width, height, channels: 3 } }).png().toBuffer()),
  );
  const target = join(OUT, file);
  await sharp(inputs, { join: { animated: true } })
    .webp({ quality, effort: 6, loop: 0, delay: scaled.map((frame) => frame.delay), minSize: true })
    .toFile(target);
  const total = scaled.reduce((sum, frame) => sum + frame.delay, 0);
  note(
    `${file}  ${(statSync(target).size / 1024).toFixed(0)} KB  ${width}x${height}  ` +
      `${scaled.length} frames  ${(total / 1000).toFixed(1)} s`,
  );
}

/** Wait for the player (or the editor) to be ready and every image decoded. */
async function settle(browser, readyExpression) {
  for (let i = 0; i < 100; i++) {
    if (await browser.evaluate(`!!(${readyExpression})`)) break;
    await sleep(100);
  }
  await browser.evaluate(`(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
    return 1;
  })()`);
}

/**
 * Pull every image the demo references into the page's memory cache first,
 * so no step change is filmed half-loaded.
 */
async function preload(browser) {
  await browser.evaluate(`(async () => {
    const demo = window.__demo && window.__demo.demo;
    const srcs = new Set();
    const walk = (value) => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.src === 'string') srcs.add(value.src);
      for (const child of Object.values(value)) walk(child);
    };
    walk(demo);
    window.__heroPreload = await Promise.all(Array.from(srcs).map((src) => {
      const img = new Image();
      img.src = new URL(src, location.href).href;
      return img.decode().then(() => img, () => img);
    }));
    return window.__heroPreload.length;
  })()`);
}

const work = await mkdtemp(join(tmpdir(), 'interactive-demo-hero-'));
mkdirSync(OUT, { recursive: true });
let browser;

try {
  if (ONLY.has('demo')) {
    step('building the showcase and serving it');
    const dist = join(work, 'dist');
    await cli(['build', '--out', dist], { cwd: SHOWCASE });
    const port = await freePort();
    await startServer([join(repoRoot, 'testbed/host/serve.mjs'), '--dist', dist, '--port', String(port)], {
      needle: 'testbed host running',
      label: 'host',
    });
    const url = `http://127.0.0.1:${port}/demo/${SLUG}/`;
    note(url);

    step('filming the showcase playing');
    // 1280x760 scales to the 1000x594 frame the README has always had, and
    // lets the player fill most of it.
    browser = await launch({ width: 1280, height: 760, scale: 1 });
    await browser.goto(url, 800);
    await settle(browser, 'window.__demo && window.__demo.ready');
    await preload(browser);
    await sleep(600);

    const film = reel(browser);
    const steps = await browser.evaluate('window.__demo.stepIds.length');
    // Every step is held long enough to read it: this is a README picture,
    // and a viewer of the real demo sets their own pace with a click.
    const READ = 2800;
    // Half the usual rate: a pulsing hotspot makes every frame a new one.
    await film.hold(READ, TICK * 2);
    for (let i = 1; i < steps; i++) {
      await browser.evaluate('window.__demo.controls.next(); 1');
      const clip = await browser.evaluate(`(() => {
        const step = window.__demo.demo.steps[${i}];
        return step.background && step.background.type === 'video';
      })()`);
      if (clip) {
        // A clip's opening seconds, filmed at a third of the rate (every
        // frame of one is a new picture, the costly kind), then its last
        // frame, where the hotspot is.
        await film.hold(1300, TICK * 3);
        await browser.evaluate(`(() => {
          for (const v of document.querySelectorAll('video')) {
            if (v.duration && !v.paused) v.currentTime = Math.max(0, v.duration - 0.05);
          }
          return 1;
        })()`);
        await sleep(500);
        await film.hold(READ - 900, TICK * 2);
      } else {
        await film.hold(READ, TICK * 2);
      }
    }
    await browser.close();
    browser = undefined;
    // Six busy screens and a clip: a little narrower and softer than the
    // editor's film, to stay a README-sized file.
    await encode(film.frames, 'demo.webp', { quality: 52, width: 920 });
    await stopAll();
  }

  if (ONLY.has('editor')) {
    step('opening the showcase in the editor');
    const port = await freePort();
    await startServer([CLI, 'dev', '--port', String(port)], { cwd: SHOWCASE, needle: 'running at', label: 'dev' });
    const url = `http://127.0.0.1:${port}/__demo/editor/#/${SLUG}`;
    note(url);

    step('filming the editor being used');
    browser = await launch({ width: 1440, height: 861, scale: 1 });
    await browser.goto(url, 800);
    // One entry per step: the thumbnail's own button, not its menu or its dot.
    const thumbs = `Array.from(document.querySelectorAll('[class~="group/thumb"]'), (t) => t.querySelector('button'))`;
    await settle(browser, `${thumbs}.length > 3`);
    await sleep(1200);

    const film = reel(browser);
    await film.hold(900);
    // Steps two to four: the agent's session, the extension, the editor —
    // each picked the way a person would, pointer first.
    for (let i = 1; i <= 3; i++) {
      const box = await browser.evaluate(`(() => {
        const button = ${thumbs}[${i}];
        if (!button) return null;
        button.scrollIntoView({ block: 'nearest' });
        const r = button.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`);
      if (!box) throw new Error(`editor: no filmstrip thumbnail ${i + 1}`);
      await browser.hover(box.x, box.y);
      await film.hold(250);
      await browser.click(box.x, box.y, 0);
      await film.hold(1000);
    }
    // Then the hotspot on that step, which opens its panel for editing.
    const hotspot = await browser.boxOf('.demo-hotspot-label');
    if (!hotspot) throw new Error('editor: no hotspot to open on the fourth step');
    await browser.hover(hotspot.cx, hotspot.cy);
    await film.hold(250);
    await browser.click(hotspot.cx, hotspot.cy, 0);
    await film.hold(1800);
    await browser.close();
    browser = undefined;
    await encode(film.frames, 'editor-anim.webp', { quality: 72 });
  }

  step('done');
} finally {
  if (browser) await browser.close();
  await stopAll();
  await rm(work, { recursive: true, force: true });
}
