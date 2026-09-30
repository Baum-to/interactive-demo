#!/usr/bin/env node
/**
 * Retakes the showcase: a product tour of the stand-in product in testbed/app.
 *
 *   node testbed/shoot-showcase.mjs [--out <dir>] [--keep] [--no-voice]
 *
 * The screens are recorded with the real `interactive-demo capture` command,
 * clicks and scrolling driven over CDP: each click becomes a screenshot step,
 * and the scroll before the third click becomes a video step. The screenshots are
 * stored as WebP, the clip is re-encoded small, and the positions of the
 * things the tour points at land in metrics.json beside the demo, which is
 * where the hotspot coordinates in demo.config.json come from.
 *
 * With INWORLD_API_KEY in the environment it also regenerates the narration:
 * each step in NARRATED is read aloud from its own `script`, and the step's
 * `voiceover` and `captions` are rewritten to match the new audio. Everything
 * else in demo.config.json — copy, hotspots, chapters, covers — is
 * hand-written and never touched here.
 *
 * Needs Chrome, and ffmpeg/ffprobe on PATH for the video step and durations.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { attach, sleep } from './lib/cdp.mjs';
import { CLI, cli, freePort, repoRoot, startServer, stopAll } from './lib/procs.mjs';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const KEEP = argv.includes('--keep');
const DEMO_DIR = join(repoRoot, 'examples/showcase/demos/acme-tour');
const OUT = resolve(repoRoot, flag('out', join(DEMO_DIR, 'assets')));
/** Only a run into the example itself rewrites its config. */
const IN_PLACE = OUT === join(DEMO_DIR, 'assets');
const VOICE = !argv.includes('--no-voice') && !!process.env.INWORLD_API_KEY;
const W = 1440;
const H = 900;

/** Steps whose `script` is read aloud, in the order they play. */
const NARRATED = ['overview', 'funnel', 'invite'];
const VOICE_ID = 'Ashley';
const TTS_MODEL = 'inworld-tts-1.5-mini';

if (!existsSync(CLI)) {
  process.stderr.write('no built CLI — run `npm run build` first\n');
  process.exit(1);
}

const step = (text) => process.stdout.write(`\n\x1b[1m> ${text}\x1b[0m\n`);
const note = (text) => process.stdout.write(`  ${text}\n`);

/**
 * The box of one element (or the union of several) as fractions of the
 * viewport: `left`/`top`/`w`/`h` for a region (blur, area), `cx`/`cy` for a
 * point (pointer, callout, text).
 */
const BOX = `(els) => {
  els = [].concat(els).filter(Boolean);
  if (!els.length) return null;
  const rs = els.map((e) => e.getBoundingClientRect());
  const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
  const r = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
  const f = (v, d) => +(v / d).toFixed(4);
  return { cx: f((l + r) / 2, innerWidth), cy: f((t + b) / 2, innerHeight),
    left: f(l, innerWidth), top: f(t, innerHeight), w: f(r - l, innerWidth), h: f(b - t, innerHeight) };
}`;
const panel = (title) =>
  `[...document.querySelectorAll('.panel')].find((p) => p.querySelector('.head b')?.textContent.trim() === ${JSON.stringify(title)})`;

/**
 * The click-through, one entry per step, in the order a new customer meets
 * the product. `anchors` are measured on the page just before its click, so
 * they describe the same pixels as the screenshot.
 */
const SHOTS = [
  {
    name: '01-overview',
    click: 'a.btn.primary', // New funnel
    anchors: {
      newFunnel: `document.querySelector('a.btn.primary')`,
      kpis: `document.querySelector('.cards')`,
      reportOwners: `[...${panel('Recent reports')}.querySelectorAll('tr td:nth-child(2)')]`,
    },
  },
  {
    name: '02-funnel',
    click: '.funnel-row:nth-child(2) .name', // Signed up — stays on the page
    anchors: {
      steps: `${panel('Steps')}`,
      signedUpBar: `document.querySelectorAll('.funnel-row .track i')[1]`,
      dropOff: `${panel('Biggest drop-off')}`,
      dropOffCopy: `${panel('Biggest drop-off')}.querySelector('.body > div:last-child')`,
    },
  },
  {
    name: '03-breakdown',
    // Scrolling before the click is what makes this a video step.
    scroll: { events: 100 },
    click: '.panel .head a.btn', // Save converters as a segment
    anchors: {
      save: `document.querySelector('.panel .head a.btn')`,
      weekly: `${panel('Sign-up rate by week')}`,
      bySegment: `${panel('By segment')}`,
    },
  },
  {
    name: '04-segments',
    click: 'a.btn.primary', // New segment
    anchors: {
      newSegment: `document.querySelector('a.btn.primary')`,
      suggested: `${panel('Suggested by Acme')}`,
    },
  },
  {
    name: '05-settings',
    click: 'a.btn.primary', // Invite teammates
    anchors: {
      invite: `document.querySelector('a.btn.primary')`,
      members: `${panel('Members')}`,
      sources: `${panel('Connected sources')}`,
    },
  },
  {
    name: '06-invite',
    click: '.modal .btn.primary', // Send invite
    anchors: {
      send: `document.querySelector('.modal .btn.primary')`,
      email: `document.querySelector('.modal input')`,
      modal: `document.querySelector('.modal')`,
    },
  },
];

const sizes = {};
const anchors = {};
const cursors = {};

async function toWebp(src, name) {
  const file = join(OUT, `${name}.webp`);
  const info = await sharp(src).webp({ quality: 82 }).toFile(file);
  sizes[`${name}.webp`] = { width: info.width, height: info.height, bytes: info.size };
  note(`${name}.webp  ${(info.size / 1024).toFixed(0)} KB  ${info.width}x${info.height}`);
}

/**
 * The capture encodes its clip for speed (VP9, realtime). This one ships in
 * the repo, so encode it again for size, at the viewport's width and a
 * quality that keeps the text crisp.
 */
async function toWebm(src, name) {
  const file = join(OUT, `${name}.webm`);
  await execFileAsync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', src,
    '-vf', `scale=${W}:-2:flags=lanczos`,
    '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-an',
    file,
  ]);
  const probe = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
  ]);
  const meta = JSON.parse(probe.stdout);
  const bytes = statSync(file).size;
  sizes[`${name}.webm`] = {
    width: meta.streams[0].width,
    height: meta.streams[0].height,
    durationMs: Math.round(Number(meta.format.duration) * 1000),
    bytes,
  };
  note(`${name}.webm  ${(bytes / 1024).toFixed(0)} KB  ${(Number(meta.format.duration)).toFixed(1)} s`);
}

/** Sentence split, the same rule the editor uses before building cues. */
function splitSentences(text) {
  const chunks = (text.match(/[^.!?…\n]+[.!?…]?[\s]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  return chunks.length > 0 ? chunks : [text.trim()];
}

/** One cue per sentence, timed in proportion to its length (editor's buildCaptionCues). */
function captionCues(stepId, sentences, durationMs) {
  const total = sentences.reduce((n, s) => n + Math.max(1, s.length), 0);
  let cursor = 0;
  return sentences.map((text, i) => {
    const start = cursor;
    cursor += (Math.max(1, text.length) / total) * durationMs;
    return { id: `${stepId}_c${i + 1}`, start: Math.round(start), end: Math.round(cursor), text };
  });
}

async function audioDurationMs(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  return Math.round(Number(stdout.trim()) * 1000);
}

async function synthesize(text) {
  const res = await fetch('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: { Authorization: `Basic ${process.env.INWORLD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceId: VOICE_ID,
      modelId: TTS_MODEL,
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 },
    }),
  });
  if (!res.ok) throw new Error(`Inworld TTS answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  if (!body.audioContent) throw new Error('Inworld TTS returned no audioContent');
  return Buffer.from(body.audioContent, 'base64');
}

const work = await mkdtemp(join(tmpdir(), 'interactive-demo-showcase-'));
// Keep the capture's session files in the scratch folder, not ~/.interactive-demo.
process.env.INTERACTIVE_DEMO_CAPTURE_HOME = join(work, 'capture-home');
mkdirSync(OUT, { recursive: true });

try {
  // ── 1. the stand-in product, served ───────────────────────────────────────
  step('serving the stand-in product');
  const emptyDist = join(work, 'dist');
  mkdirSync(emptyDist);
  const port = await freePort();
  await startServer([join(here, 'host/serve.mjs'), '--dist', emptyDist, '--port', String(port)], {
    needle: 'testbed host running',
    label: 'host',
  });
  const origin = `http://127.0.0.1:${port}`;
  note(`${origin}/app/`);

  // ── 2. record it with the real capture command ────────────────────────────
  step('recording the tour with `interactive-demo capture`');
  const started = await cli(
    [
      'capture', 'start', `${origin}/app/`,
      '--headless',
      // Zoom is authored per step in demo.config.json, not applied to every shot.
      '--no-zoom',
      '--name', 'Acme tour',
      '--window-size', `${W}x${H}`,
    ],
    { cwd: work },
  );
  const session = JSON.parse(started.stdout);
  if (/ffmpeg/.test(started.stderr)) note('(no ffmpeg: the breakdown step will be a still, not a video)');
  const tab = await attach(session.browser.webSocketDebuggerUrl, session.tab.targetId);
  await sleep(1200);

  for (const shot of SHOTS) {
    if (shot.scroll) {
      // A trackpad-like scroll to the bottom of the page: many small wheel
      // deltas on an ease-in-out curve. Headless Chrome paints one frame per
      // wheel event and the clip plays those frames back at 60 fps, so the
      // number of events, not the wall-clock time, sets the clip's length.
      const distance = await tab.evaluate('document.documentElement.scrollHeight - innerHeight');
      const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
      const n = shot.scroll.events;
      for (let i = 1; i <= n; i++) {
        await tab.scroll(W / 2, H / 2, distance * (ease(i / n) - ease((i - 1) / n)), 30);
      }
      await sleep(600);
    }
    anchors[shot.name] = {};
    for (const [key, expr] of Object.entries(shot.anchors)) {
      const box = await tab.evaluate(`(${BOX})(${expr})`);
      if (box) anchors[shot.name][key] = box;
      else note(`(no element for ${shot.name}.${key})`);
    }
    const target = await tab.centerOf(shot.click);
    if (!target) throw new Error(`capture: nothing matched ${shot.click} on ${shot.name}`);
    await tab.click(target.x, target.y, 2400);
    note(shot.name);
  }
  tab.close();

  const stopped = await cli(['capture', 'stop', '--session', session.session.id, '--out', join(work, 'out')], {
    cwd: work,
  });
  const captured = JSON.parse(stopped.stdout).output;
  const capturedDir = join(work, 'out', captured.slug);
  const config = JSON.parse(readFileSync(join(capturedDir, 'demo.config.json'), 'utf8'));
  if (config.steps.length !== SHOTS.length) {
    throw new Error(`expected ${SHOTS.length} captured steps, got ${config.steps.length}`);
  }

  // ── 3. the screens, stored small ──────────────────────────────────────────
  step('writing the screens');
  for (const [i, shot] of SHOTS.entries()) {
    const s = config.steps[i];
    const src = join(capturedDir, s.background.src);
    if (s.background.type === 'video') {
      await toWebm(src, shot.name);
      await toWebp(join(capturedDir, s.background.posterSrc), `${shot.name}-poster`);
    } else {
      if (shot.scroll) note(`(${shot.name} came back as a still — is ffmpeg on PATH?)`);
      await toWebp(src, shot.name);
    }
    const cursor = s.annotations.find((a) => a.variant === 'cursor');
    if (cursor) cursors[shot.name] = { x: cursor.x, y: cursor.y, text: cursor.text };
  }

  writeFileSync(
    join(OUT, '../metrics.json'),
    `${JSON.stringify({ takenAt: new Date().toISOString(), viewport: { width: W, height: H }, images: sizes, cursors, anchors }, null, 2)}\n`,
  );

  // ── 4. the narration ──────────────────────────────────────────────────────
  if (VOICE) {
    step(`narrating ${NARRATED.join(', ')} with Inworld TTS (${VOICE_ID})`);
    const configPath = join(DEMO_DIR, 'demo.config.json');
    const demo = JSON.parse(readFileSync(configPath, 'utf8'));
    let chars = 0;
    for (const id of NARRATED) {
      const s = demo.steps.find((candidate) => candidate.id === id);
      if (!s?.script) throw new Error(`no step "${id}" with a script to narrate`);
      chars += s.script.length;
      const file = `vo-${id}.mp3`;
      writeFileSync(join(OUT, file), await synthesize(s.script));
      const duration = await audioDurationMs(join(OUT, file));
      s.voiceover = { src: `assets/${file}`, duration };
      s.captions = captionCues(id, splitSentences(s.script), duration);
      note(`${file}  ${(statSync(join(OUT, file)).size / 1024).toFixed(0)} KB  ${(duration / 1000).toFixed(1)} s`);
    }
    note(`${chars} characters narrated`);
    if (IN_PLACE) writeFileSync(configPath, `${JSON.stringify(demo, null, 2)}\n`);
    else note('(--out given: demo.config.json left alone)');
  } else {
    note('\n(no INWORLD_API_KEY, or --no-voice: narration left as it is)');
  }

  step('done');
  for (const file of readdirSync(OUT).sort()) {
    note(`${file.padEnd(26)} ${(statSync(join(OUT, file)).size / 1024).toFixed(0)} KB`);
  }
  note(`anchors -> ${join(OUT, '../metrics.json')}`);
} finally {
  await stopAll();
  if (KEEP) process.stdout.write(`\nkept: ${work}\n`);
  else await rm(work, { recursive: true, force: true });
}
