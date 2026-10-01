/**
 * The design of the starter's placeholder screen, as a 1920x1080 SVG:
 * the two ways to record a first demo, side by side. On the left, a terminal
 * running `capture start` / `capture stop` and the same thing asked of an
 * agent; on the right, a Chrome window with the Interactive Demo Capture
 * extension's popup open, and the command that imports its download.
 * `build-placeholder.mjs` rasterises it into `src/template/placeholder.png`,
 * which is what `init` scaffolds.
 *
 * It used to live in src/starter.ts as a template literal the build script
 * pulled out with a regex. A design is drawn with loops and data, which that
 * regex cannot evaluate, and the CLI never needs the SVG at run time — so the
 * design lives here, beside the only script that reads it.
 *
 * The starter demo's hotspots are placed on the elements listed in TARGETS.
 * src/starter.ts carries them as fractions of the image; tests/init.test.ts
 * checks each one still lands on its element, so moving something here
 * without moving its hotspot fails the suite.
 */

export const WIDTH = 1920;
export const HEIGHT = 1080;

const FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "Menlo, 'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace";
/** Advance width of one Menlo glyph, in em. */
const MONO_ADVANCE = 0.602;

const C = {
  canvas: '#f4f5f9',
  surface: '#ffffff',
  border: '#e4e6ee',
  strong: '#1d2130',
  text: '#4a5063',
  muted: '#8a90a2',
  bar: '#dfe2ea',
  barSoft: '#eceef3',
  accent: '#5b6cff',
  accentSoft: '#eef0ff',
  accentText: '#4656f0',
  accentInk: '#2a3aaa',
  // The terminal.
  term: '#12141c',
  termBar: '#1b1e27',
  termText: '#e9ecf4',
  termDim: '#8a91a5',
  termGreen: '#7ee0a8',
  termAccent: '#a9b3ff',
  // The browser.
  chromeTabs: '#e8eaef',
  chromeBar: '#f7f8fa',
};

// Two columns, one per way to record.
const MARGIN = 96;
const GAP = 32;
const COL_W = (WIDTH - 2 * MARGIN - GAP) / 2; // 848
const LEFT_X = MARGIN;
const RIGHT_X = MARGIN + COL_W + GAP;
const CARD_Y = 186;
const CARD_H = 838;
const PAD = 32;

// The picture inside each column: the terminal, or the browser window.
const SHOT_Y = CARD_Y + 90;
const SHOT_H = 600;

// Terminal type.
const TERM_SIZE = 22;
const TERM_LINE = 40;
const termX = LEFT_X + PAD + 28;
const monoWidth = (s, size) => s.length * size * MONO_ADVANCE;

const COMMAND = 'npx interactive-demo capture start https://your.app';
const COMMAND_Y = SHOT_Y + 52 + 58; // baseline of the first terminal line

// The browser, and the extension popup hanging from its toolbar.
const BROWSER_X = RIGHT_X + PAD;
const BROWSER_W = COL_W - 2 * PAD;
const TABS_H = 46;
const TOOLBAR_H = 58;
const PAGE_Y = SHOT_Y + TABS_H + TOOLBAR_H;
const EXT_ICON = { cx: BROWSER_X + BROWSER_W - 40, cy: SHOT_Y + TABS_H + TOOLBAR_H / 2 };
const POPUP_W = 500;
const POPUP_X = BROWSER_X + BROWSER_W - POPUP_W - 12;
const POPUP_Y = PAGE_Y - 6;
const POPUP_H = 400;
const POPUP_PAD = 24;
const RECORD = { x: POPUP_X + POPUP_PAD, y: POPUP_Y + 268, w: POPUP_W - 2 * POPUP_PAD, h: 62 };

/**
 * Pixel boxes of the elements the starter demo points at, in image space.
 */
export const TARGETS = {
  /** The `capture start` command, prompt to end of the URL. */
  cliCommand: {
    x: termX,
    y: COMMAND_Y - TERM_SIZE,
    w: monoWidth(`$ ${COMMAND}`, TERM_SIZE),
    h: TERM_SIZE + 8,
  },
  /** The extension popup's Start Recording button. */
  recordButton: RECORD,
  /** The extension popup, whole. */
  popup: { x: POPUP_X, y: POPUP_Y, w: POPUP_W, h: POPUP_H },
};

const esc = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function text(x, y, s, { size = 18, weight = 400, fill = C.text, anchor = 'start', font = FONT, spacing } = {}) {
  const ls = spacing ? ` letter-spacing="${spacing}"` : '';
  return `<text x="${x}" y="${y}" font-family="${esc(font)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls} xml:space="preserve">${esc(s)}</text>`;
}

/** Monospace text in coloured runs: [[text, fill, weight?], …]. */
function mono(x, y, runs, size = TERM_SIZE) {
  let cx = x;
  return runs
    .map(([s, fill, weight = 400]) => {
      const out = text(cx, y, s, { size, weight, fill, font: MONO });
      cx += monoWidth(s, size);
      return out;
    })
    .join('');
}

function rect(x, y, w, h, { r = 0, fill = 'none', stroke, strokeWidth = 1.5, dash, filter } = {}) {
  const s = stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : '';
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  const f = filter ? ` filter="url(#${filter})"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${s}${d}${f}/>`;
}

function heading() {
  return [
    text(WIDTH / 2, 100, 'Capture your first demo', { size: 52, weight: 700, fill: C.strong, anchor: 'middle' }),
    text(WIDTH / 2, 146, 'Click through your product once. Every click becomes a step.', {
      size: 26,
      weight: 500,
      fill: C.muted,
      anchor: 'middle',
    }),
  ].join('\n  ');
}

/** A column: white card, numbered title. */
function column(x, n, title) {
  return [
    rect(x, CARD_Y, COL_W, CARD_H, { r: 22, fill: C.surface, stroke: C.border, filter: 'lift' }),
    `<circle cx="${x + PAD + 18}" cy="${CARD_Y + 52}" r="18" fill="${C.accentSoft}"/>`,
    text(x + PAD + 18, CARD_Y + 59, String(n), { size: 19, weight: 700, fill: C.accentText, anchor: 'middle' }),
    text(x + PAD + 50, CARD_Y + 61, title, { size: 26, weight: 700, fill: C.strong }),
  ].join('\n  ');
}

function terminal() {
  const x = LEFT_X + PAD;
  const w = COL_W - 2 * PAD;
  const out = [
    `<clipPath id="term-clip"><rect x="${x}" y="${SHOT_Y}" width="${w}" height="${SHOT_H}" rx="14"/></clipPath>`,
    `<g clip-path="url(#term-clip)">`,
    rect(x, SHOT_Y, w, SHOT_H, { fill: C.term }),
    rect(x, SHOT_Y, w, 52, { fill: C.termBar }),
    `<circle cx="${x + 26}" cy="${SHOT_Y + 26}" r="7" fill="#ff5f57"/>`,
    `<circle cx="${x + 50}" cy="${SHOT_Y + 26}" r="7" fill="#febc2e"/>`,
    `<circle cx="${x + 74}" cy="${SHOT_Y + 26}" r="7" fill="#28c840"/>`,
    text(x + w / 2, SHOT_Y + 33, 'your-demos', { size: 17, weight: 500, fill: C.termDim, anchor: 'middle' }),
    `</g>`,
  ];

  const prompt = (y, cmd) => mono(termX, y, [['$ ', C.termGreen, 700], [cmd, C.termText, 700]]);
  let y = COMMAND_Y;
  out.push(prompt(y, COMMAND));
  // Room under the command for its hotspot's card.
  y += TERM_LINE * 5;
  out.push(prompt(y, 'npx interactive-demo capture stop'));
  y += TERM_LINE;
  out.push(mono(termX, y, [['✓ ', C.termGreen, 700], ['demos/your-app  6 steps', C.termDim]]));
  y += TERM_LINE;
  out.push(prompt(y, 'npm run dev'));
  y += TERM_LINE;
  out.push(mono(termX, y, [['  editor: http://localhost:3000/__demo/editor/', C.termDim]]));
  return out.join('\n  ');
}

/** Under the terminal: the same capture, asked of an agent. */
function agent() {
  const x = LEFT_X + PAD;
  const w = COL_W - 2 * PAD;
  const y = SHOT_Y + SHOT_H + 28;
  return [
    rect(x, y, w, 92, { r: 14, fill: C.accentSoft }),
    text(x + 28, y + 38, '› or ask your agent', { size: 21, weight: 600, fill: C.accentText }),
    text(x + 28, y + 70, '“record a demo of https://your.app”', { size: 23, weight: 600, fill: C.strong }),
  ].join('\n  ');
}

/** The popup's settings cog. */
function gear(cx, cy) {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const p = (r) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    return `M${p(8.5)} L${p(12)}`;
  }).join(' ');
  return [
    `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#3a3a3a" stroke-width="2"/>`,
    `<circle cx="${cx}" cy="${cy}" r="3.2" fill="none" stroke="#3a3a3a" stroke-width="2"/>`,
    `<path d="${teeth}" stroke="#3a3a3a" stroke-width="3" stroke-linecap="round"/>`,
  ].join('');
}

/** The extension's mark: a small teal orb. */
function orb(cx, cy, r) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#orb)"/>`;
}

function browser() {
  const x = BROWSER_X;
  const w = BROWSER_W;
  const top = SHOT_Y;
  const out = [
    `<clipPath id="browser-clip"><rect x="${x}" y="${top}" width="${w}" height="${SHOT_H}" rx="14"/></clipPath>`,
    `<g clip-path="url(#browser-clip)">`,
    rect(x, top, w, SHOT_H, { fill: C.canvas }),
    // Tab strip with one tab.
    rect(x, top, w, TABS_H, { fill: C.chromeTabs }),
    `<circle cx="${x + 24}" cy="${top + 23}" r="6.5" fill="#ff5f57"/>`,
    `<circle cx="${x + 46}" cy="${top + 23}" r="6.5" fill="#febc2e"/>`,
    `<circle cx="${x + 68}" cy="${top + 23}" r="6.5" fill="#28c840"/>`,
    rect(x + 96, top + 8, 230, TABS_H, { r: 10, fill: C.chromeBar }),
    rect(x + 114, top + 20, 16, 16, { r: 4, fill: C.accent }),
    text(x + 140, top + 34, 'Your app', { size: 16, weight: 500, fill: C.text }),
    // Toolbar: arrows, address bar, extensions.
    rect(x, top + TABS_H, w, TOOLBAR_H, { fill: C.chromeBar }),
    `<line x1="${x}" y1="${PAGE_Y}" x2="${x + w}" y2="${PAGE_Y}" stroke="${C.border}" stroke-width="1.5"/>`,
    `<path d="M${x + 30} ${top + TABS_H + 29} l8 -8 M${x + 30} ${top + TABS_H + 29} l8 8 M${x + 30} ${top + TABS_H + 29} h16" stroke="${C.muted}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    `<path d="M${x + 78} ${top + TABS_H + 29} l-8 -8 M${x + 78} ${top + TABS_H + 29} l-8 8 M${x + 78} ${top + TABS_H + 29} h-16" stroke="#c3c7d2" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    rect(x + 100, top + TABS_H + 11, w - 210, 36, { r: 18, fill: '#eceef3' }),
    text(x + 124, top + TABS_H + 35, 'your.app', { size: 17, weight: 500, fill: C.strong }),
    // Puzzle-piece extensions button, then the pinned extension, open.
    rect(EXT_ICON.cx - 64, EXT_ICON.cy - 9, 18, 18, { r: 4, fill: 'none', stroke: C.muted, strokeWidth: 2 }),
    `<circle cx="${EXT_ICON.cx}" cy="${EXT_ICON.cy}" r="19" fill="${C.accentSoft}"/>`,
    orb(EXT_ICON.cx, EXT_ICON.cy, 11),
  ];

  // The page behind: a stand-in app, mostly under the popup.
  const py = PAGE_Y;
  out.push(rect(x, py, 150, SHOT_H, { fill: C.surface }));
  out.push(`<line x1="${x + 150}" y1="${py}" x2="${x + 150}" y2="${top + SHOT_H}" stroke="${C.border}" stroke-width="1.5"/>`);
  out.push(rect(x + 22, py + 24, 24, 24, { r: 7, fill: C.accent }));
  out.push(rect(x + 56, py + 30, 70, 12, { r: 6, fill: C.bar }));
  for (let i = 0; i < 5; i++) {
    out.push(rect(x + 22, py + 82 + i * 42, i === 0 ? 106 : 84 - (i % 2) * 18, 12, { r: 6, fill: i === 0 ? '#c9cff7' : C.barSoft }));
  }
  out.push(rect(x + 176, py + 26, 140, 18, { r: 9, fill: C.bar }));
  for (let i = 0; i < 3; i++) {
    out.push(rect(x + 176, py + 70 + i * 112, 260, 92, { r: 12, fill: C.surface, stroke: C.border }));
    out.push(rect(x + 196, py + 92 + i * 112, 90, 11, { r: 5, fill: C.bar }));
    out.push(rect(x + 196, py + 116 + i * 112, 150, 18, { r: 7, fill: '#d6dae4' }));
  }
  out.push(`</g>`);
  out.push(rect(x, top, w, SHOT_H, { r: 14, stroke: C.border }));
  out.push(popup());
  return out.join('\n  ');
}

/**
 * The Interactive Demo Capture popup, after the extension's own: the mark and
 * name, the step counter, Start Recording, and where the recording goes.
 */
function popup() {
  const x = POPUP_X;
  const y = POPUP_Y;
  const { w, h } = TARGETS.popup;
  const inner = w - 2 * POPUP_PAD;
  const r = RECORD;
  return [
    rect(x, y, w, h, { r: 14, fill: C.surface, stroke: '#d9d9d9', filter: 'popup' }),
    orb(x + POPUP_PAD + 10, y + 38, 10),
    text(x + POPUP_PAD + 28, y + 46, 'Interactive Demo Capture', { size: 23, weight: 600, fill: '#171717' }),
    rect(x + w - POPUP_PAD - 40, y + 18, 40, 40, { r: 10, fill: C.surface, stroke: '#e0e0e0' }),
    gear(x + w - POPUP_PAD - 20, y + 38),
    `<line x1="${x}" y1="${y + 76}" x2="${x + w}" y2="${y + 76}" stroke="#e6e6e6" stroke-width="1.5" stroke-dasharray="5 4"/>`,
    // The step counter.
    rect(x + POPUP_PAD, y + 98, inner, 148, { r: 14, fill: '#fafafa', stroke: '#e6e6e6' }),
    text(x + w / 2, y + 184, '0', { size: 66, weight: 700, fill: C.accentInk, anchor: 'middle' }),
    text(x + w / 2, y + 222, 'STEPS', { size: 16, weight: 500, fill: '#3a4ad9', anchor: 'middle', spacing: 1.5 }),
    // Start Recording.
    rect(r.x, r.y, r.w, r.h, { r: 14, fill: 'url(#primary)', stroke: '#3a4ad9', strokeWidth: 1.5 }),
    `<circle cx="${r.x + r.w / 2 - 104}" cy="${r.y + r.h / 2}" r="10" fill="none" stroke="#ffffff" stroke-width="2.4"/>`,
    `<circle cx="${r.x + r.w / 2 - 104}" cy="${r.y + r.h / 2}" r="4.5" fill="#ffffff"/>`,
    text(r.x + r.w / 2 + 14, r.y + 40, 'Start Recording', { size: 23, weight: 600, fill: '#ffffff', anchor: 'middle' }),
    text(x + POPUP_PAD, r.y + r.h + 42, 'When you stop: upload it, or download a ZIP.', { size: 18, fill: '#7a7a7a' }),
  ].join('\n  ');
}

/** Under the browser: what to do with the download. */
function download() {
  const x = RIGHT_X + PAD;
  const w = COL_W - 2 * PAD;
  const y = SHOT_Y + SHOT_H + 28;
  return [
    rect(x, y, w, 92, { r: 14, fill: '#f6f7fa', stroke: C.border }),
    text(x + 28, y + 38, 'Download the recording, then', { size: 21, weight: 600, fill: C.text }),
    mono(x + 28, y + 71, [['npx interactive-demo init --from capture.zip', C.strong, 700]], 21),
  ].join('\n  ');
}

/** The one element that says this screen is not the author's own. */
function badge() {
  const label = 'Replace this step with your capture';
  const w = 412;
  const x = WIDTH - MARGIN - w;
  const y = 40;
  return [
    rect(x, y, w, 46, { r: 23, fill: C.accentSoft, stroke: C.accent, dash: '6 5' }),
    text(x + w / 2, y + 30, label, { size: 19, weight: 600, fill: C.accentText, anchor: 'middle' }),
  ].join('\n  ');
}

export function placeholderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <filter id="lift" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#1d2130" flood-opacity="0.07"/>
    </filter>
    <filter id="popup" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#1d2130" flood-opacity="0.22"/>
    </filter>
    <linearGradient id="primary" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6c7cff"/>
      <stop offset="100%" stop-color="#5263f5"/>
    </linearGradient>
    <radialGradient id="orb" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#9fe3ea"/>
      <stop offset="55%" stop-color="#2fb3c4"/>
      <stop offset="100%" stop-color="#1f6f9a"/>
    </radialGradient>
  </defs>
  ${rect(0, 0, WIDTH, HEIGHT, { fill: C.canvas })}
  ${heading()}
  ${column(LEFT_X, 1, 'With the CLI, or your agent')}
  ${terminal()}
  ${agent()}
  ${column(RIGHT_X, 2, 'With the Chrome extension')}
  ${browser()}
  ${download()}
  ${badge()}
</svg>
`;
}
