#!/usr/bin/env node
/**
 * Retakes the showcase: a one-minute demo of interactive-demo itself, made
 * with interactive-demo. Every screen in it is produced here.
 *
 *   node testbed/shoot-showcase.mjs [--out <dir>] [--keep] [--no-voice | --voice-only] [--narrate <step,…>]
 *                                   [--extension <dir>]
 *                                   [--session <transcript.jsonl> --session-project <dir>]
 *
 * The story is one demo being made: an agent records the stand-in product
 * in testbed/app, a person polishes it in the editor, and it ships on the
 * stand-in website in testbed/host. In order:
 *
 *   00-cover        the outcome, for the cover: a step of the agent's demo,
 *                   composed for the cover's hero frame
 *   01-agent        a video step: a Claude Code session making that demo
 *                   with the agent skill, drawn from a recorded transcript
 *                   (see below) and filmed filling in line by line
 *   02-extension    a video step: the Interactive Demo Capture extension
 *                   really recording the same app — its popup, the clicks,
 *                   its step counter (only with --extension)
 *   03-editor       the real editor, open on the agent's demo, a hotspot
 *                   being edited, framed with a margin to zoom into
 *   04-ship         a video step recorded with the real `capture`: the
 *                   built demo embedded in the stand-in website, scrolled to
 *   05-init         the outro's picture: `init my-demos`, with what the
 *                   command really printed
 *   vo-<step>.mp3   with INWORLD_API_KEY set, the narration of each step in
 *                   NARRATED, read from its `script`; the step's `voiceover`
 *                   and `captions` are rewritten to match
 *
 * The agent's session is not rerun here: an agent does not take the same
 * path twice, so it was recorded once and is stored, tidied, in
 * testbed/fixtures/claude-code-session.json. That file holds the prompt, the
 * tool calls and their output, the clicks the agent made and the
 * demo.config.json it wrote. This script replays the clicks with the real
 * `capture` (the screens are then today's) and puts the agent's config on
 * top, so the demo it edits and ships is the agent's own — except its theme
 * tokens and button colours, which are dropped to show the stock player. To record a new
 * session, run one (`claude -p … --output-format stream-json --verbose`
 * works, or a saved session transcript) in a project with the skill
 * installed and pass it with --session, plus that project's folder with
 * --session-project.
 *
 * The extension is Interactive Demo Capture; pass the folder
 * of an unpacked build of it with --extension. Without it 02-extension is
 * left as it is.
 *
 * Copy and hotspots in demo.config.json are hand-written and never touched
 * here; element positions land in metrics.json beside the demo, which is
 * where their coordinates come from. Needs Chrome, and ffmpeg/ffprobe.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { attach } from './lib/cdp.mjs';
import { launch, sleep } from './lib/browser.mjs';
import { launchWithExtension } from './lib/extension.mjs';
import { CLI, cli, freePort, repoRoot, startServer, stopAll } from './lib/procs.mjs';
import { claudeCodeCard } from './lib/terminal-card.mjs';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const KEEP = argv.includes('--keep');
const DEMO_DIR = join(repoRoot, 'examples/showcase/demos/interactive-demo');
const OUT = resolve(repoRoot, flag('out', join(DEMO_DIR, 'assets')));
/** Only a run into the example itself rewrites its config. */
const IN_PLACE = OUT === join(DEMO_DIR, 'assets');
const VOICE = !argv.includes('--no-voice') && !!process.env.INWORLD_API_KEY;
/** Skip the screens and only read the scripts aloud again, after a copy change. */
const VOICE_ONLY = argv.includes('--voice-only');
const EXTENSION = flag('extension', null) && resolve(flag('extension'));
const SESSION = flag('session', null) && resolve(flag('session'));
const SESSION_PROJECT = flag('session-project', null) && resolve(flag('session-project'));
const FIXTURE = join(here, 'fixtures/claude-code-session.json');
const W = 1440;
const H = 900;
/** The port the agent was pointed at; reused when free, so the replay matches. */
const APP_PORT = 4173;

/** Steps whose `script` is read aloud, in the order they play; --narrate <ids> reads only some of them again. */
const NARRATED = flag('narrate', null)?.split(',') ?? ['agent', 'extension', 'editor', 'ship'];
const VOICE_ID = 'Reed';
const TTS_MODEL = 'inworld-tts-2';

if (!existsSync(CLI)) {
  process.stderr.write('no built CLI — run `npm run build` first\n');
  process.exit(1);
}

const step = (text) => process.stdout.write(`\n\x1b[1m> ${text}\x1b[0m\n`);
const note = (text) => process.stdout.write(`  ${text}\n`);

const sizes = {};
const anchors = {};

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
  note(`${name}.webm  ${(bytes / 1024).toFixed(0)} KB  ${Number(meta.format.duration).toFixed(1)} s`);
}

/**
 * A clip from stills: `frames` is a list of [png, seconds]. Encoded like
 * the captured clips, at a steady rate so every player can seek it.
 */
async function framesToWebm(frames, name, { fps = 12 } = {}) {
  const list = join(dirname(frames[0][0]), `${name}.txt`);
  const last = frames[frames.length - 1][0];
  writeFileSync(
    list,
    // The concat demuxer drops the last entry's duration unless the file is named once more.
    `${frames.map(([file, seconds]) => `file '${file}'\nduration ${seconds}`).join('\n')}\nfile '${last}'\n`,
  );
  const file = join(OUT, `${name}.webm`);
  await execFileAsync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=${fps},scale=${W}:-2:flags=lanczos,format=yuv420p`,
    '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-g', String(fps * 10), '-an',
    file,
  ]);
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  const bytes = statSync(file).size;
  sizes[`${name}.webm`] = { width: W, height: H, durationMs: Math.round(Number(stdout.trim()) * 1000), bytes };
  note(`${name}.webm  ${(bytes / 1024).toFixed(0)} KB  ${Number(stdout.trim()).toFixed(1)} s`);
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

/** Mean volume of an audio file in dB, to tell a narration from a silent file. */
async function meanVolumeDb(file) {
  const { stderr } = await execFileAsync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1] ?? Number.NEGATIVE_INFINITY);
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
  // No quiet fallbacks: the audio has to come from the model that was asked for.
  if (body.usage?.modelId && body.usage.modelId !== TTS_MODEL) {
    throw new Error(`Inworld TTS answered with ${body.usage.modelId}, not ${TTS_MODEL}`);
  }
  return Buffer.from(body.audioContent, 'base64');
}

/** The box of an element as fractions of the viewport, for hotspots. */
const BOX = `(el) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const f = (v, d) => +(v / d).toFixed(4);
  return { cx: f(r.left + r.width / 2, innerWidth), cy: f(r.top + r.height / 2, innerHeight),
    left: f(r.left, innerWidth), top: f(r.top, innerHeight), w: f(r.width, innerWidth), h: f(r.height, innerHeight) };
}`;

// ── the recorded agent session ───────────────────────────────────────────────

/**
 * Turn a Claude Code transcript (a session's .jsonl, or the output of
 * `claude -p --output-format stream-json --verbose`) into the fixture: the
 * prompt, every tool call with its output, and the assistant's words, with
 * the machine's own paths taken out — this file ships in the repo.
 */
function recordSession(file, projectDir) {
  const events = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const textOf = (content) =>
    typeof content === 'string'
      ? content
      : (content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

  let framing = null;
  const entries = [];
  const byId = new Map();
  for (const event of events) {
    const content = event.message?.content;
    if (event.type === 'user' && framing === null && textOf(content).trim()) {
      framing = textOf(content);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (event.type === 'assistant' && block.type === 'text' && block.text.trim()) {
        entries.push({ kind: 'text', text: block.text.trim() });
      } else if (block.type === 'tool_use') {
        const entry = { kind: 'tool', name: block.name, input: block.input, output: '' };
        byId.set(block.id, entry);
        entries.push(entry);
      } else if (block.type === 'tool_result') {
        const entry = byId.get(block.tool_use_id);
        if (entry) {
          entry.output = textOf(block.content).slice(0, 1500);
          if (block.is_error) entry.error = true;
        }
      }
    }
  }

  // The user's words are the quoted lines of the first message, when the
  // session was started with a framing around them; otherwise all of it.
  const quoted = (framing ?? '').split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2));
  const prompt = quoted.length ? quoted.join('\n') : (framing ?? '').trim();

  const real = realpathSync(projectDir);
  const tidy = (text) => {
    let out = String(text);
    for (const dir of new Set([real, projectDir])) {
      out = out.split(`cd ${dir} && `).join('').split(`${dir}/`).join('').split(dir).join('.');
    }
    return out
      .split(homedir())
      .join('~')
      .split(userInfo().username)
      .join('user')
      .replace(/(^|[\s"'`=(>])\/(?:private\/)?(?:tmp|var\/folders)\b[^\s"'`]*/gm, '$1<tmp>');
  };
  const scrub = (value) =>
    typeof value === 'string'
      ? tidy(value)
      : Array.isArray(value)
        ? value.map(scrub)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]))
          : value;

  // The clicks: the arguments of the command that drove the page. Text
  // targets are written `text:<label>`, anything else is a selector.
  const drive = entries.find((e) => e.kind === 'tool' && /capture-drive\.mjs \S+ \S+ /.test(e.input?.command ?? ''));
  const driveLine = drive?.input.command.split('\n').find((l) => /capture-drive\.mjs \S+ \S+ /.test(l)) ?? '';
  const clicks = [...driveLine.matchAll(/"((?:text:)?[^"]+)"/g)].map((m) => m[1]);
  if (clicks.length === 0) throw new Error('could not find the clicks the agent made in the transcript');

  const stopped = entries.find((e) => /capture stop/.test(e.input?.command ?? '') && /"slug"/.test(e.output));
  const slug = stopped ? /"slug":\s*"([^"]+)"/.exec(stopped.output)[1] : null;
  if (!slug) throw new Error('could not find the demo the agent captured');
  const config = JSON.parse(readFileSync(join(projectDir, 'demos', slug, 'demo.config.json'), 'utf8'));

  return {
    note:
      'A Claude Code session recorded once and replayed by testbed/shoot-showcase.mjs. ' +
      '`framing` is the first message the session was given; `prompt` is the user request inside it.',
    recordedAt: new Date().toISOString(),
    framing: scrub([real, projectDir].reduce((text, dir) => text.split(dir).join('<project>'), framing ?? '')),
    prompt: scrub(prompt),
    entries: scrub(entries),
    clicks,
    slug,
    config: scrub(config),
  };
}

/**
 * What the card shows of the session, in order: the first call matching
 * each `call`, cut down to the part of the command that matches; with
 * `result`, the line of its output that matches; with `aside`, what the
 * assistant said just before it (less anything `asideCut` matches).
 * Everything in between is counted. This is tuned to the recording in the
 * fixture — a new recording wants a look at it.
 */
const EXCERPT = [
  { call: /SKILL\.md/ },
  { call: /capture start\b/ },
  { call: /capture stop\b/, result: /"stepCount"/ },
  { call: /validate --strict/, result: /validate passed/, aside: true, asideCut: / and theme\.$/ },
];

/**
 * The card's lines: the prompt, the calls in EXCERPT, the number of calls
 * left out between them, and the first line of the assistant's last message.
 * Nothing is reworded; every cut is marked with an ellipsis.
 */
function excerptLines(session) {
  const lines = [{ t: 'prompt', text: session.prompt }];
  const entries = session.entries;
  /** The part of a command that matches, with … where the rest was. */
  const focus = (command, re) => {
    const parts = command
      .replace(/<<'?(\w+)'?\n[\s\S]*?\n\1(\n|$)/g, '\n')
      .split(/\n|;\s+|\s+&&\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const at = parts.findIndex((part) => re.test(part));
    const text = parts[at].replace(/\s+2>&1$/, '');
    return `${at > 0 ? '… ' : ''}${text}${at < parts.length - 1 ? ' …' : ''}`;
  };
  const more = (n) => {
    if (n > 0) lines.push({ t: 'dim', text: `… ${n} more tool call${n === 1 ? '' : 's'}` });
  };
  const calls = (from, to) => entries.slice(from, to).filter((e) => e.kind === 'tool').length;

  let cursor = 0;
  for (const spec of EXCERPT) {
    const at = entries.findIndex(
      (e, i) => i >= cursor && e.kind === 'tool' && e.name === 'Bash' && spec.call.test(e.input?.command ?? '') && !/--help/.test(e.input.command),
    );
    if (at === -1) throw new Error(`the recorded session has no call matching ${spec.call}`);
    more(calls(cursor, at));
    const before = entries[at - 1];
    if (spec.aside && before?.kind === 'text') {
      const cut = spec.asideCut ? before.text.replace(spec.asideCut, ' …') : before.text;
      lines.push({ t: 'text', text: cut });
    }
    const entry = entries[at];
    lines.push({ t: 'tool', name: 'Bash', arg: focus(entry.input.command, spec.call) });
    if (spec.result) {
      const out = entry.output.split('\n').filter((l) => l.trim());
      const hit = out.findIndex((l) => spec.result.test(l));
      if (hit === -1) throw new Error(`no output line matching ${spec.result}`);
      const text = `${hit > 0 ? '… ' : ''}${out[hit].trim()}${hit < out.length - 1 ? ' …' : ''}`;
      lines.push({ t: 'result', first: true, text });
    }
    cursor = at + 1;
  }
  more(calls(cursor, entries.length));
  const last = entries.findLast((e) => e.kind === 'text');
  if (last) lines.push({ t: 'text', text: last.text.split('\n')[0] });
  return lines;
}

/**
 * The agent's demo, in the stock look. The agent picked its own theme
 * tokens and button colours; the showcase shows the player as it ships, so
 * those are taken out of the copy the screens are made from. The fixture
 * keeps what the agent wrote.
 */
function stockLook(config) {
  const copy = JSON.parse(JSON.stringify(config));
  if (copy.theme) {
    delete copy.theme.tokens;
    delete copy.theme.preset;
    if (Object.keys(copy.theme).length === 0) delete copy.theme;
  }
  delete copy.background;
  const strip = (value) => {
    if (Array.isArray(value)) return value.forEach(strip);
    if (!value || typeof value !== 'object') return;
    // A background object (a step's screen) stays; a colour string goes.
    for (const key of ['background', 'backgroundColor', 'textColor', 'titleColor', 'descriptionColor', 'color']) {
      if (typeof value[key] === 'string') delete value[key];
    }
    Object.values(value).forEach(strip);
  };
  strip(copy.steps);
  return copy;
}

// ── the run ──────────────────────────────────────────────────────────────────

const work = await mkdtemp(join(tmpdir(), 'interactive-demo-showcase-'));
// Keep the capture's session files in the scratch folder, not ~/.interactive-demo.
process.env.INTERACTIVE_DEMO_CAPTURE_HOME = join(work, 'capture-home');
mkdirSync(OUT, { recursive: true });
let browser;
let film;

try {
  if (SESSION) {
    if (!SESSION_PROJECT) throw new Error('--session needs --session-project <the folder the agent worked in>');
    step('recording the agent session into the fixture');
    mkdirSync(dirname(FIXTURE), { recursive: true });
    writeFileSync(FIXTURE, `${JSON.stringify(recordSession(SESSION, SESSION_PROJECT), null, 2)}\n`);
    note(FIXTURE);
  }
  const session = JSON.parse(readFileSync(FIXTURE, 'utf8'));

  if (!VOICE_ONLY) {
  // ── 1. the stand-in product, served ───────────────────────────────────────
  step('serving the stand-in product');
  const emptyDist = join(work, 'empty');
  mkdirSync(emptyDist);
  let appPort = APP_PORT;
  try {
    await startServer([join(here, 'host/serve.mjs'), '--dist', emptyDist, '--port', String(appPort)], {
      needle: 'testbed host running',
      label: 'host',
    });
  } catch {
    appPort = await freePort();
    await startServer([join(here, 'host/serve.mjs'), '--dist', emptyDist, '--port', String(appPort)], {
      needle: 'testbed host running',
      label: 'host',
    });
  }
  const appUrl = `http://localhost:${appPort}/app/`;
  note(appUrl);
  if (appPort !== APP_PORT) {
    note(`(port ${APP_PORT} is taken: these screens will say ${appPort} where the agent's session says ${APP_PORT} — free it and re-shoot)`);
  }

  // ── 2. the agent's demo, replayed ─────────────────────────────────────────
  step(`replaying the agent's capture (${session.clicks.length} clicks)`);
  const projectRoot = join(work, 'acme-demos');
  await cli(['init', 'acme-demos', '--no-starter-demo'], { cwd: work });
  const startArgs = ['capture', 'start', appUrl, '--name', 'Onboarding'];
  const started = await cli([...startArgs, '--headless'], { cwd: projectRoot });
  const capture = JSON.parse(started.stdout);
  const tab = await attach(capture.browser.webSocketDebuggerUrl, capture.tab.targetId);
  await sleep(1200);
  // The agent's own driver, in effect: a trusted mouse move, press and
  // release at the centre of the target, then a pause for the page.
  for (const spec of session.clicks) {
    const find = spec.startsWith('text:')
      ? `[...document.querySelectorAll('a,button')].find((e) => e.textContent.trim() === ${JSON.stringify(spec.slice(5))} && e.offsetParent !== null)`
      : `document.querySelector(${JSON.stringify(spec)})`;
    let point = null;
    for (let i = 0; i < 20 && !point; i++) {
      point = await tab.evaluate(`(() => { const el = ${find}; if (!el) return null;
        el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (!point) await sleep(250);
    }
    if (!point) throw new Error(`replay: nothing matched ${spec}`);
    await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await sleep(150);
    await tab.click(point.x, point.y, 2500);
    note(spec);
  }
  tab.close();
  const stopped = await cli(['capture', 'stop'], { cwd: projectRoot });
  const captured = JSON.parse(stopped.stdout).output;
  if (captured.slug !== session.slug) throw new Error(`replay wrote ${captured.slug}, the agent wrote ${session.slug}`);
  writeFileSync(
    join(projectRoot, 'demos', captured.slug, 'demo.config.json'),
    `${JSON.stringify(stockLook(session.config), null, 2)}\n`,
  );
  await cli(['validate', '--strict'], { cwd: projectRoot });
  note(`${captured.stepCount} screens + the agent's config, in the stock look -> demos/${captured.slug}/`);

  browser = await launch({ width: W, height: H, scale: 2 });
  const cardsDir = join(work, 'cards');
  mkdirSync(cardsDir, { recursive: true });

  // A second browser at the clips' own size, for filming.
  film = await launch({ width: W, height: H, scale: 1 });
  const framesDir = join(work, 'frames');
  mkdirSync(framesDir, { recursive: true });

  // ── 3. the agent at work: the session, filmed line by line ────────────────
  step('filming the Claude Code session');
  const lines = excerptLines(session);
  // When each line appears: the prompt is typed, then the calls, their
  // results and the assistant's lines follow at the pace of someone reading.
  const TYPING = 2.2;
  const PACE = { tool: 0.65, result: 0.3, dim: 0.35, text: 0.65 };
  let clock = 0.5 + TYPING + 0.5;
  const shownAt = lines.map((line, i) => {
    if (i === 0) return 0;
    clock += PACE[line.t] ?? 0.4;
    return +clock.toFixed(2);
  });
  const sessionSeconds = clock + 1.2;
  writeFileSync(
    join(cardsDir, 'agent.html'),
    claudeCodeCard({ title: 'acme-demos — claude', subtitle: 'Claude Code', cwd: '~/acme-demos', lines }).replace(
      '</body>',
      `<script>
  const items = [...document.querySelectorAll('.screen > :not(.welcome)')];
  const at = ${JSON.stringify(shownAt)};
  const typed = items[0].querySelector('span:last-child');
  const full = typed.textContent;
  // The picture at second t; Infinity is the finished session.
  window.__at = (t) => {
    const n = Math.max(0, Math.min(full.length, Math.round(((t - 0.5) / ${TYPING}) * full.length)));
    // The untyped rest stays in the box, unseen, so the box keeps its size.
    typed.innerHTML = '';
    typed.append(full.slice(0, n));
    if (n < full.length) {
      const caret = document.createElement('span');
      caret.textContent = '▌';
      caret.style.color = '#d97757';
      const rest = document.createElement('span');
      rest.textContent = full.slice(n);
      rest.style.visibility = 'hidden';
      typed.append(caret, rest);
    }
    items.forEach((el, i) => { if (i > 0) el.style.visibility = t >= at[i] ? 'visible' : 'hidden'; });
  };
</script></body>`,
    ),
  );
  await film.goto(pathToFileURL(join(cardsDir, 'agent.html')).href, 800);
  anchors['01-agent'] = {
    prompt: await film.evaluate(`(${BOX})(document.querySelector('.prompt'))`),
    window: await film.evaluate(`(${BOX})(document.querySelector('.window'))`),
    // At the window's edge, level with the prompt: where a pointer sits
    // beside it, its card in the empty third to the right.
    besidePrompt: await film.evaluate(`(() => {
      const p = document.querySelector('.prompt').getBoundingClientRect();
      const w = document.querySelector('.window').getBoundingClientRect();
      return { cx: +((w.right + 4) / innerWidth).toFixed(4), cy: +((p.top + p.height / 2) / innerHeight).toFixed(4) };
    })()`),
  };
  const overflow = await film.evaluate(
    "document.querySelector('.window').getBoundingClientRect().bottom - innerHeight",
  );
  if (overflow > 0) note(`(the session card overflows by ${Math.round(overflow)}px — trim the excerpt)`);
  const FPS = 10;
  const agentFrames = [];
  for (let i = 0; i <= Math.ceil(sessionSeconds * FPS); i++) {
    await film.evaluate(`window.__at(${i / FPS}); 1`);
    const file = join(framesDir, `agent-${String(i).padStart(4, '0')}.png`);
    await film.shot(file);
    agentFrames.push([file, 1 / FPS]);
  }
  await framesToWebm(agentFrames, '01-agent', { fps: FPS });
  // The poster is the finished session: what a still of this step shows.
  await film.evaluate('window.__at(Infinity); 1');
  await browser.goto(pathToFileURL(join(cardsDir, 'agent.html')).href, 800);
  await browser.evaluate('window.__at(Infinity); 1');
  await browser.shot(join(work, '01-agent-poster.png'));
  await toWebp(join(work, '01-agent-poster.png'), '01-agent-poster');

  // ── 4. recording it yourself: the Chrome extension, filmed ────────────────
  if (EXTENSION) {
    step('filming a recording with the Chrome extension');
    // The window is smaller than the picture, so everything in it — the
    // popup above all — is drawn larger: 1120 CSS pixels across 1440.
    const BAR = 54;
    const VIEW = { width: 1120, height: Math.round(((H - BAR) * 1120) / W) };
    const UP = W / VIEW.width;
    const chrome = await launchWithExtension({ extensionDir: EXTENSION, width: VIEW.width, height: VIEW.height, scale: 2 });
    const extFrames = [];
    let shotNo = 0;
    /**
     * One frame of the film: the page as it is now, in a browser frame,
     * with the popup under the toolbar icon when it is open and a ring
     * where the next click lands. The page and the popup are the
     * extension's and the app's own pixels; the frame and the ring are drawn.
     */
    const frame = async (seconds, { popup = null, ring = null, page = null } = {}) => {
      const n = String(shotNo++).padStart(3, '0');
      const pagePng = page ?? join(framesDir, `ext-page-${n}.png`);
      if (!page) writeFileSync(pagePng, await app.shot());
      let popupTag = '';
      if (popup) {
        const popupPng = join(framesDir, `ext-popup-${n}.png`);
        writeFileSync(popupPng, await popup.shot({ x: 0, y: 0, width: 360, height: popup.height }));
        popupTag = `<img class="popup" src="${pathToFileURL(popupPng).href}" alt="" />`;
      }
      const html = join(framesDir, `ext-${n}.html`);
      writeFileSync(
        html,
        `<!doctype html><html lang="en"><head><meta charset="utf-8" /><style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #fff;
    font: 15px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .bar { height: ${BAR}px; box-sizing: border-box; display: flex; align-items: center; gap: 9px; padding: 0 18px;
    background: #f1f1f3; border-bottom: 1px solid #dcdce2; }
  .bar i { width: 13px; height: 13px; border-radius: 99px; }
  .url { flex: 1; height: 32px; margin-left: 14px; border-radius: 9px; background: #fff; border: 1px solid #dcdce2;
    color: #5c6270; display: flex; align-items: center; padding: 0 14px; }
  .ext { width: 30px; height: 30px; margin-left: 8px; padding: 3px; border-radius: 8px;
    background: ${popup ? '#d5d8e6' : 'transparent'}; }
  .view { position: relative; height: ${H - BAR}px; overflow: hidden; }
  .page { width: ${W}px; display: block; }
  .popup { position: absolute; top: 0; right: 12px; width: ${Math.round(360 * UP)}px; border-radius: 0 0 14px 14px;
    box-shadow: 0 2px 6px rgba(14,16,24,.2), 0 26px 64px rgba(14,16,24,.3); }
  .ring { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 99px;
    border: 3px solid #5b6cff; background: rgba(91,108,255,.18); box-sizing: border-box; }
</style></head><body>
  <div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
    <span class="url">${appUrl.replace('http://', '')}</span>
    <img class="ext" src="${pathToFileURL(join(EXTENSION, 'assets/icon-48.png')).href}" alt="" /></div>
  <div class="view"><img class="page" src="${pathToFileURL(pagePng).href}" alt="" />
    ${ring ? `<span class="ring" style="left:${ring.x * UP}px; top:${ring.y * UP}px"></span>` : ''}${popupTag}</div>
</body></html>`,
      );
      await film.goto(pathToFileURL(html).href, 500);
      const out = join(framesDir, `ext-frame-${n}.png`);
      await film.shot(out);
      extFrames.push([out, seconds]);
      return pagePng;
    };
    let app;
    try {
      app = await chrome.page(appUrl);
      await sleep(800);
      await frame(0.7);
      // The popup, and its Start Recording.
      let popup = await chrome.openPopup();
      // A real popup's window is exactly its panel, so the panel's wash
      // (a fixed background) covers all of it; a headless one opens
      // shorter than its panel, so pin the wash to the panel instead.
      const pinWash = `(() => { const s = document.createElement('style');
        s.textContent = 'body::before { position: absolute !important; }';
        document.head.append(s); })()`;
      await popup.evaluate(pinWash);
      const start = await popup.boxOf('button', 'Start Recording');
      await frame(1.2, { popup });
      await popup.click(start.cx, start.cy, 1500);
      // The sheet it puts in the page, then the countdown.
      await frame(1.1);
      await app.clickOn('button', 'Start Recording', 250);
      for (let i = 0; i < 3; i++) {
        await frame(0.4);
        await sleep(850);
      }
      await sleep(1600);
      // The recording: a few clicks through the app, each one a step.
      for (const spec of session.clicks.slice(0, 3)) {
        const label = spec.startsWith('text:') ? spec.slice(5) : null;
        const target = label ? await app.boxOf('a,button', `^\\s*${label}\\s*$`) : await app.boxOf(spec);
        if (!target) throw new Error(`extension: nothing matched ${spec}`);
        const still = await frame(0.45);
        await frame(0.4, { ring: { x: target.cx, y: target.cy }, page: still });
        await app.click(target.cx, target.cy, 2600);
      }
      await frame(0.5);
      // The popup again: the counter, and Stop & save.
      popup = await chrome.openPopup();
      await popup.evaluate(pinWash);
      const steps = await popup.evaluate("document.querySelector('.rec-counter-value')?.textContent");
      if (steps !== '3') throw new Error(`the extension recorded ${steps} steps, not 3`);
      const counter = await popup.boxOf('.rec-counter-value');
      const stop = await popup.boxOf('button', 'Stop & save');
      await frame(1.6, { popup });
      const inPicture = (b) => ({
        cx: +((W - 12 - 360 * UP + b.pageCx * UP) / W).toFixed(4),
        cy: +((BAR + b.pageCy * UP) / H).toFixed(4),
      });
      anchors['02-extension'] = {
        counter: inPicture(counter),
        stop: inPicture(stop),
        // The popup's left edge, level with the counter: a pointer here
        // puts its card over the page, beside the popup.
        besideCounter: { cx: +((W - 12 - 360 * UP - 6) / W).toFixed(4), cy: inPicture(counter).cy },
        popup: {
          left: +((W - 12 - 360 * UP) / W).toFixed(4),
          top: +(BAR / H).toFixed(4),
          w: +((360 * UP) / W).toFixed(4),
          h: +((popup.height * UP) / H).toFixed(4),
        },
      };
    } finally {
      await chrome.close();
    }
    await framesToWebm(extFrames, '02-extension');
    await toWebp(extFrames[extFrames.length - 1][0], '02-extension-poster');
  } else {
    note('\n(no --extension: 02-extension left as it is)');
  }

  // ── 5. the editor, a hotspot being edited ─────────────────────────────────
  step('photographing the editor');
  const devPort = await freePort();
  await startServer([CLI, 'dev', '--port', String(devPort)], { cwd: projectRoot, needle: 'running at', label: 'dev' });
  // A smaller window than the other screens, at a higher pixel ratio, so
  // everything in it is a little larger — and a shorter one, so the picture
  // has an empty band under the editor for the step's caption.
  const EDITOR = { width: 1280, height: 700, scale: 2.25 };
  const editor = await launch(EDITOR);
  try {
    await editor.goto(`http://127.0.0.1:${devPort}/__demo/editor/#/${captured.slug}`, 3500);
    const thumbs = `Array.from(document.querySelectorAll('[class~="group/thumb"]'), (t) => t.querySelector('button'))`;
    // The third thumbnail: the funnel, the first screen with a decision on it.
    const thumb = await editor.evaluate(`(() => { const t = ${thumbs}[2]; if (!t) return null;
      t.scrollIntoView({ block: 'nearest' }); const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!thumb) throw new Error('editor: no third thumbnail');
    await editor.click(thumb.x, thumb.y, 1500);
    await editor.clickSelector('.demo-hotspot-label', 1500);
    // The panel's text box, caret at the end, the way it looks mid-edit.
    await editor.clickSelector('.md-editor', 600);
    await editor.key('End', 'End', 35, 400);
    anchors.editor = await editor.evaluate(`(() => { const box = ${BOX}; return {
      hotspot: box(document.querySelector('.demo-hotspot-label')),
      text: box(document.querySelector('.md-editor')),
    }; })()`);
    await editor.shot(join(work, 'editor.png'));
  } finally {
    await editor.close();
  }
  // Framed with a margin, so the step can push in on it (a `transform` zoom
  // of 1 / FRAME, from TOP, fills the screen's width) without cutting
  // anything mid-word, and set high, so the band under it stays clear.
  const FRAME = 0.88;
  const TOP = 0.03;
  const frameHeight = (FRAME * W * EDITOR.height) / EDITOR.width / H;
  writeFileSync(
    join(cardsDir, 'editor.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><style>
  html, body { height: 100%; margin: 0; }
  body { display: grid; justify-items: center; align-content: start; background:
    radial-gradient(1100px 620px at 18% -10%, #eef1ff 0%, rgba(238,241,255,0) 60%),
    radial-gradient(900px 560px at 105% 110%, #f4eeff 0%, rgba(244,238,255,0) 55%), #f7f8fb; }
  img { width: ${FRAME * 100}%; margin-top: ${TOP * H}px; display: block; border-radius: 12px;
    box-shadow: 0 0 0 1px rgba(14,16,24,.08), 0 30px 70px rgba(14,16,24,.2); }
</style></head><body><img src="${pathToFileURL(join(work, 'editor.png')).href}" alt="" /></body></html>`,
  );
  await browser.goto(pathToFileURL(join(cardsDir, 'editor.html')).href, 1200);
  const inFrame = (b) => ({
    cx: +((1 - FRAME) / 2 + b.cx * FRAME).toFixed(4),
    cy: +(TOP + b.cy * frameHeight).toFixed(4),
  });
  anchors['03-editor'] = {
    frame: await browser.evaluate(`(${BOX})(document.querySelector('img'))`),
    zoom: +(1 / FRAME).toFixed(3),
    // The zoom's origin that keeps the frame's top margin as it is.
    origin: { x: 0.5, y: +((TOP - 0.01) / (1 - FRAME)).toFixed(4) },
    hotspot: inFrame(anchors.editor.hotspot),
    text: inFrame(anchors.editor.text),
  };
  delete anchors.editor;
  await browser.shot(join(work, '03-editor.png'));
  await toWebp(join(work, '03-editor.png'), '03-editor');
  await stopAll();

  // ── 6. shipped: built, embedded, recorded scrolling to it ─────────────────
  step('building the demo and recording the stand-in website');
  const dist = join(work, 'dist');
  await cli(['build', '--out', dist], { cwd: projectRoot });
  const sitePort = await freePort();
  await startServer([join(here, 'host/serve.mjs'), '--dist', dist, '--port', String(sitePort)], {
    needle: 'testbed host running',
    label: 'site',
  });
  await film.close();
  film = undefined;

  // The cover's picture is the outcome: one step of the agent's demo, as a
  // viewer meets it — the product, a hotspot, its card. It is composed for
  // the slot it sits in. The cover's `hero` image on the right is a frame
  // 60% of the cover wide and 110% tall, hung from the middle and 10% down,
  // so it runs off the right and bottom edges: at every desktop width the
  // left 80.4% and the top 81.8% of it are in view, and its top-left corner
  // is what stays. The picture is made that frame's shape, of one calm
  // region of the app at a size that reads:
  //   - the app page is photographed again in the narrowest window it lays
  //     out cleanly in (720), tall enough to carry its sidebar down the
  //     frame, at 2.6 times the pixels;
  //   - everything under the page's first card is painted over with the
  //     page's own background, so the part in view holds the logo and nav,
  //     the title row and that card, and nothing else;
  //   - the frame is a little wider than the window (the last column is
  //     repeated), set so the edge of the part in view falls in the gap
  //     between the title row's two buttons: the first is whole, the second
  //     is out of view, and the card runs off the edge;
  //   - the real player, drawn at the frame's size without its own header,
  //     controls or badge, puts a hotspot with the agent's words for that
  //     step at the head of the funnel's last bar, the card below it —
  //     over the calm part, covering none of the funnel — and whole inside
  //     the part in view.
  step('composing the cover picture');
  const COVER = {
    step: 's2', scale: 2.6,
    app: { width: 720, height: 838 },
    frame: { width: 731, height: 838 }, // 0.873, the hero frame's shape
    inView: { width: 0.804, height: 0.818 },
  };
  const from = session.config.steps.find((candidate) => candidate.id === COVER.step);
  const hotspot = from.annotations.find((candidate) => candidate.type === 'message');
  const coverProject = join(work, 'cover-demo');
  await cli(['init', 'cover-demo', '--no-starter-demo'], { cwd: work });
  mkdirSync(join(coverProject, 'demos/cover/assets'), { recursive: true });
  const shoot = await launch({ ...COVER.app, scale: COVER.scale });
  let layout;
  try {
    // The website's server serves the stand-in product too.
    await shoot.goto(`http://localhost:${sitePort}${new URL(from.background.sourceUrl).pathname}`, 1500);
    layout = await shoot.evaluate(`(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      const panels = [...document.querySelectorAll('.panel')];
      const buttons = [...document.querySelectorAll('.rowline a.btn')];
      return {
        bar: box([...document.querySelectorAll('.funnel-row .track')].at(-1)),
        card: box(panels[0]),
        next: box(panels[1]),
        content: box(document.querySelector('main')),
        buttons: buttons.map(box),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    })()`);
    await shoot.shot(join(work, 'cover-app.png'));
  } finally {
    await shoot.close();
  }
  const edgeInView = COVER.frame.width * COVER.inView.width;
  if (
    layout.overflow > 0 || layout.buttons.length !== 2 ||
    layout.buttons[0].right > edgeInView - 4 || layout.buttons[1].left < edgeInView + 2
  ) {
    throw new Error(`cover: the app's layout has moved; recompose the picture (${JSON.stringify(layout.buttons)}, edge ${edgeInView})`);
  }
  const px = (css) => Math.round(css * COVER.scale);
  const framePx = { width: px(COVER.frame.width), height: px(COVER.frame.height) };
  const appPx = await sharp(join(work, 'cover-app.png')).metadata();
  // The row in the gap under the first card, stretched down over the rest of the page's column.
  const gapY = px((layout.card.bottom + layout.next.top) / 2);
  const contentX = px(layout.content.left) + 2;
  const strip = await sharp(join(work, 'cover-app.png'))
    .extract({ left: contentX, top: gapY, width: appPx.width - contentX, height: 1 })
    .resize({ width: appPx.width - contentX, height: appPx.height - gapY, fit: 'fill' })
    .toBuffer();
  await sharp(join(work, 'cover-app.png'))
    .composite([{ input: strip, left: contentX, top: gapY }])
    .toFile(join(work, 'cover-calm.png'));
  await sharp(join(work, 'cover-calm.png'))
    .extend({ right: Math.max(0, framePx.width - appPx.width), bottom: Math.max(0, framePx.height - appPx.height), extendWith: 'copy' })
    .toFile(join(coverProject, 'demos/cover/assets/screen.png'));
  const pointer = { x: layout.bar.left - 6, y: (layout.bar.top + layout.bar.bottom) / 2 };
  writeFileSync(
    join(coverProject, 'demos/cover/demo.config.json'),
    `${JSON.stringify(
      {
        id: 'coverPicture',
        version: 1,
        title: session.config.title,
        chrome: { hideHeader: true, hideControls: true, branding: false },
        steps: [
          {
            kind: 'content',
            id: from.id,
            background: { type: 'image', src: 'assets/screen.png', naturalWidth: framePx.width, naturalHeight: framePx.height },
            advance: { trigger: 'click' },
            // The agent's words for this step; where the pointer sits and
            // how its card hangs are chosen for this picture.
            annotations: [
              {
                id: hotspot.id,
                type: 'message',
                variant: 'pointer',
                x: +(pointer.x / COVER.frame.width).toFixed(4),
                y: +(pointer.y / COVER.frame.height).toFixed(4),
                text: hotspot.text,
                anchor: 'bottom',
                showNavigation: false,
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const coverProjectFile = join(coverProject, 'interactive-demo.json');
  writeFileSync(
    coverProjectFile,
    `${JSON.stringify({ ...JSON.parse(readFileSync(coverProjectFile, 'utf8')), demos: ['cover'] }, null, 2)}\n`,
  );
  await cli(['validate', '--strict'], { cwd: coverProject });
  await cli(['build'], { cwd: coverProject });
  const coverPort = await freePort();
  await startServer([join(here, 'host/serve.mjs'), '--dist', join(coverProject, 'dist'), '--port', String(coverPort)], {
    needle: 'testbed host running',
    label: 'cover',
  });
  const cover = await launch({ ...COVER.frame, scale: COVER.scale });
  let coverCard;
  try {
    await cover.goto(`http://localhost:${coverPort}/demo/cover/?embed=inline`, 2500);
    await sleep(2500);
    coverCard = await cover.evaluate(`(() => { const r = document.querySelector('.demo-hotspot-label')?.getBoundingClientRect();
      return r ? { left: +(r.left / innerWidth).toFixed(3), right: +(r.right / innerWidth).toFixed(3), bottom: +(r.bottom / innerHeight).toFixed(3) } : null; })()`);
    await cover.shot(join(work, '00-cover-full.png'));
  } finally {
    await cover.close();
  }
  if (!coverCard || coverCard.right > COVER.inView.width - 0.008 || coverCard.bottom > COVER.inView.height - 0.02) {
    throw new Error(`cover: the hotspot's card is not inside the part in view (${JSON.stringify(coverCard)})`);
  }
  // Less the hairline the player draws along its top and left. (Its rounded
  // top-left corner is rounded again by the cover's frame; the other
  // corners are in the part that runs off the cover.)
  const edge = Math.ceil(2 * COVER.scale);
  const shot = await sharp(join(work, '00-cover-full.png')).metadata();
  await sharp(join(work, '00-cover-full.png'))
    .extract({ left: edge, top: edge, width: shot.width - edge, height: shot.height - edge })
    .toFile(join(work, '00-cover.png'));
  await toWebp(join(work, '00-cover.png'), '00-cover');
  anchors['00-cover'] = { frame: COVER.frame, app: COVER.app, inView: COVER.inView, card: coverCard };

  const siteProject = join(work, 'site-capture');
  await cli(['init', 'site-capture', '--no-starter-demo'], { cwd: work });
  const siteStarted = JSON.parse(
    (
      await cli(
        // ?film=1: the page framed for filming (see testbed/host/index.html).
        ['capture', 'start', `http://localhost:${sitePort}/?film=1`, '--headless', '--no-zoom', '--name', 'Ship',
          '--window-size', `${W}x${H}`],
        { cwd: siteProject },
      )
    ).stdout,
  );
  if (siteStarted.capture.videoDisabledReason) throw new Error(`no video: ${siteStarted.capture.videoDisabledReason}`);
  const site = await attach(siteStarted.browser.webSocketDebuggerUrl, siteStarted.tab.targetId);
  await sleep(1500);
  // A trackpad-like scroll down to the embed: many small wheel deltas on an
  // ease-in-out curve. Headless Chrome paints a frame per wheel event and
  // the clip plays them back at 60 fps, so the event count sets its length.
  // Stop with the hero gone and the section's heading and whole embed in view.
  const distance = await site.evaluate("document.getElementById('demo').getBoundingClientRect().top - 24");
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const EVENTS = 110;
  for (let i = 1; i <= EVENTS; i++) {
    await site.scroll(W / 2, H / 2, distance * (ease(i / EVENTS) - ease((i - 1) / EVENTS)), 30);
  }
  await sleep(2500);
  anchors['04-ship'] = await site.evaluate(`(() => { const box = ${BOX}; return {
    embed: box(document.querySelector('#inline-host iframe')),
    heading: box(document.querySelector('#demo h2')),
  }; })()`);
  // The click that ends the clip: the section heading, which does nothing.
  const heading = await site.centerOf('#demo h2');
  await site.click(heading.x, heading.y, 1500);
  // The step is only there once its clip has been cut; stopping sooner
  // finds a session with nothing in it.
  for (let i = 0; i < 40; i++) {
    const status = JSON.parse((await cli(['capture', 'status'], { cwd: siteProject })).stdout);
    if (status.capture.stepCount > 0) break;
    await sleep(500);
  }
  site.close();
  const siteStopped = JSON.parse(
    (await cli(['capture', 'stop', '--out', join(work, 'site-out')], { cwd: siteProject })).stdout,
  ).output;
  const shipConfig = JSON.parse(
    readFileSync(join(work, 'site-out', siteStopped.slug, 'demo.config.json'), 'utf8'),
  );
  const clip = shipConfig.steps[0].background;
  if (clip.type !== 'video') throw new Error('the scroll came back as a still — is ffmpeg on PATH?');
  await toWebm(join(work, 'site-out', siteStopped.slug, clip.src), '04-ship');
  await toWebp(join(work, 'site-out', siteStopped.slug, clip.posterSrc), '04-ship-poster');

  // ── 7. the outro's picture: the first command, and what it printed ───────
  step('rendering the first command');
  const inited = await cli(['init', 'my-demos'], { cwd: work });
  const initOut = inited.stdout
    .split(realpathSync(work)).join('~').split(work).join('~')
    .split('\n');
  const upTo = initOut.findIndex((l) => /npm install/.test(l));
  const card = { width: 760, height: 264 };
  writeFileSync(
    join(cardsDir, 'init.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><style>
  html, body { margin: 0; background: #12141c; }
  .screen { width: ${card.width}px; height: ${card.height}px; box-sizing: border-box; padding: 30px 36px;
    font: 19px/1.7 ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; color: #98a0b4; white-space: pre; }
  .cmd { color: #f2f4fa; font-weight: 600; margin-bottom: 10px; }
  .cmd span { color: #7ee0a8; margin-right: 12px; }
  .ok { color: #7ee0a8; }
</style></head><body><div class="screen"><div class="cmd"><span>$</span>npx @inkly-org/interactive-demo-cli init my-demos</div>${initOut
      .slice(0, upTo + 1)
      .map((l, i) => `<div${i === 0 ? ' class="ok"' : ''}>${l.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`) || '&nbsp;'}</div>`)
      .join('')}</div></body></html>`,
  );
  await browser.goto(pathToFileURL(join(cardsDir, 'init.html')).href, 800);
  await browser.shot(join(work, 'init-full.png'));
  await sharp(join(work, 'init-full.png'))
    .extract({ left: 0, top: 0, width: card.width * 2, height: card.height * 2 })
    .toFile(join(work, '05-init.png'));
  await toWebp(join(work, '05-init.png'), '05-init');

  writeFileSync(
    join(OUT, '../metrics.json'),
    `${JSON.stringify({ takenAt: new Date().toISOString(), viewport: { width: W, height: H }, images: sizes, anchors }, null, 2)}\n`,
  );
  }

  // ── 8. the narration ──────────────────────────────────────────────────────
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
      const volume = await meanVolumeDb(join(OUT, file));
      if (!(volume > -45)) throw new Error(`${file} is silent (mean volume ${volume} dB)`);
      const voiceover = { src: `assets/${file}`, duration };
      const captions = captionCues(id, splitSentences(s.script), duration);
      if ('voiceover' in s) {
        Object.assign(s, { voiceover, captions });
      } else {
        // A step narrated for the first time: the two keys go after `script`.
        const rest = Object.entries(s);
        for (const key of Object.keys(s)) delete s[key];
        for (const [key, value] of rest) {
          if (key === 'captions') continue;
          s[key] = value;
          if (key === 'script') Object.assign(s, { voiceover, captions });
        }
      }
      // Worth knowing: a clip shorter than its narration holds its last frame while the voice finishes.
      const clipMs = s.background?.type === 'video' ? await audioDurationMs(join(DEMO_DIR, s.background.src)) : null;
      if (clipMs && clipMs < duration) note(`(${id}: the clip is ${clipMs} ms and its narration ${duration} ms — it holds its last frame for the rest)`);
      note(`${file}  ${(statSync(join(OUT, file)).size / 1024).toFixed(0)} KB  ${(duration / 1000).toFixed(1)} s  ${volume} dB mean`);
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
  if (browser) await browser.close();
  if (film) await film.close();
  // A run that threw mid-capture would leave its Chrome behind.
  for (const dir of ['acme-demos', 'site-capture']) {
    if (existsSync(join(work, dir))) await cli(['capture', 'cancel'], { cwd: join(work, dir) }).catch(() => undefined);
  }
  await stopAll();
  if (KEEP) process.stdout.write(`\nkept: ${work}\n`);
  else await rm(work, { recursive: true, force: true });
}
