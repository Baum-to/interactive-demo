/**
 * The design of the starter's placeholder screen: a neutral wireframe of a
 * generic web app, as a 1920x1080 SVG. `build-placeholder.mjs` rasterises it
 * into `src/template/placeholder.png`, which is what `init` scaffolds.
 *
 * It used to live in src/starter.ts as a template literal the build script
 * pulled out with a regex. A wireframe is drawn with loops and data, which
 * that regex cannot evaluate, and the CLI never needs the SVG at run time —
 * so the design moved here, beside the only script that reads it.
 *
 * The starter demo's hotspot, area, blur and zoom are placed on the elements
 * listed in TARGETS. src/starter.ts carries them as fractions of the image;
 * tests/init.test.ts checks each one still lands on its element, so moving
 * something here without moving its annotation fails the suite.
 */

export const WIDTH = 1920;
export const HEIGHT = 1080;

const FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

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
  good: '#15803d',
  goodSoft: '#e7f6ec',
  bad: '#b91c1c',
  badSoft: '#fdecec',
};

const SIDEBAR_W = 300;
const HEADER_H = 96;
const LEFT = 348;
const RIGHT = 1872;
const GAP = 24;
const COL_W = (RIGHT - LEFT - 3 * GAP) / 4; // 363
const col = (i) => LEFT + i * (COL_W + GAP);

const STATS_Y = 128;
const STATS_H = 160;
const LOWER_Y = 320;
const LOWER_H = 680;

const CUSTOMER_ROW_Y = 400;
const CUSTOMER_ROW_H = 96;
const CUSTOMERS = [
  ['Maya Chen', 'maya.chen@example.com'],
  ['Luis Ortega', 'luis.ortega@example.org'],
  ['Priya Nair', 'priya.nair@example.net'],
  ['Tom Becker', 'tom.becker@example.com'],
  ['Ana Silva', 'ana.silva@example.org'],
  ['Jonah Park', 'jonah.park@example.net'],
];

/**
 * Pixel boxes of the elements the starter demo points at, in image space.
 * `focus` is the window the "Focus and hide" step zooms to.
 */
export const TARGETS = {
  newReport: { x: 1648, y: 26, w: 224, h: 44 },
  stats: { x: LEFT, y: STATS_Y, w: RIGHT - LEFT, h: STATS_H },
  chart: { x: col(0), y: LOWER_Y, w: 2 * COL_W + GAP, h: LOWER_H },
  customers: { x: col(2), y: LOWER_Y, w: COL_W, h: LOWER_H },
  /** Names and emails of the customer list: what the blur covers. */
  customerDetails: {
    x: col(2) + 70,
    y: CUSTOMER_ROW_Y + 8,
    w: COL_W - 88,
    h: CUSTOMERS.length * CUSTOMER_ROW_H - 16,
  },
};

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function text(x, y, s, { size = 18, weight = 400, fill = C.text, anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}

function rect(x, y, w, h, { r = 0, fill = 'none', stroke, strokeWidth = 1.5, dash } = {}) {
  const s = stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : '';
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${s}${d}/>`;
}

const card = (x, y, w, h) => rect(x, y, w, h, { r: 16, fill: C.surface, stroke: C.border });

function sidebar() {
  const out = [
    rect(0, 0, SIDEBAR_W, HEIGHT, { fill: C.surface }),
    `<line x1="${SIDEBAR_W}" y1="0" x2="${SIDEBAR_W}" y2="${HEIGHT}" stroke="${C.border}" stroke-width="1.5"/>`,
    rect(40, 30, 40, 40, { r: 11, fill: C.accent }),
    text(96, 58, 'Your app', { size: 24, weight: 700, fill: C.strong }),
  ];
  const items = ['Overview', 'Customers', 'Reports', 'Billing', 'Settings'];
  items.forEach((label, i) => {
    const y = 124 + i * 56;
    const active = i === 0;
    if (active) out.push(rect(24, y, 252, 44, { r: 10, fill: C.accentSoft }));
    out.push(rect(44, y + 12, 20, 20, { r: 6, fill: active ? C.accent : '#cfd3de' }));
    out.push(text(80, y + 29, label, { size: 19, weight: active ? 600 : 500, fill: active ? C.accentText : C.text }));
  });

  // The one thing on the screen that is not a stand-in for real UI.
  out.push(rect(24, 976, 252, 72, { r: 12, fill: C.accentSoft, stroke: C.accent, dash: '6 5' }));
  out.push(text(150, 1006, 'Placeholder screen', { size: 17, weight: 700, fill: C.accentText, anchor: 'middle' }));
  out.push(text(150, 1031, 'Replace with your capture', { size: 15, weight: 500, fill: C.text, anchor: 'middle' }));
  return out.join('\n  ');
}

function header() {
  const b = TARGETS.newReport;
  return [
    rect(SIDEBAR_W, 0, WIDTH - SIDEBAR_W, HEADER_H, { fill: C.surface }),
    `<line x1="${SIDEBAR_W}" y1="${HEADER_H}" x2="${WIDTH}" y2="${HEADER_H}" stroke="${C.border}" stroke-width="1.5"/>`,
    text(LEFT, 59, 'Overview', { size: 30, weight: 700, fill: C.strong }),
    rect(560, 28, 420, 40, { r: 20, fill: '#f1f2f6' }),
    `<circle cx="588" cy="47" r="8" fill="none" stroke="${C.muted}" stroke-width="2.5"/>`,
    `<line x1="594" y1="53" x2="600" y2="59" stroke="${C.muted}" stroke-width="2.5" stroke-linecap="round"/>`,
    text(612, 54, 'Search', { size: 18, fill: C.muted }),
    `<circle cx="1600" cy="48" r="20" fill="#d9dce6"/>`,
    rect(b.x, b.y, b.w, b.h, { r: 10, fill: C.accent }),
    text(b.x + b.w / 2, b.y + 29, '+  New report', { size: 19, weight: 600, fill: '#ffffff', anchor: 'middle' }),
  ].join('\n  ');
}

function sparkline(x, y, w, h, values, color) {
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(x + i * step).toFixed(1)},${(y + h - v * h).toFixed(1)}`).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function stats() {
  const data = [
    ['Active users', '12,480', '+12%', true, [0.2, 0.35, 0.3, 0.5, 0.45, 0.7, 0.8]],
    ['Revenue', '$48.2k', '+8.4%', true, [0.3, 0.25, 0.45, 0.4, 0.6, 0.55, 0.75]],
    ['Conversion', '3.8%', '+0.6%', true, [0.4, 0.5, 0.45, 0.55, 0.5, 0.65, 0.7]],
    ['Churn', '1.2%', '-0.3%', false, [0.7, 0.6, 0.65, 0.5, 0.45, 0.4, 0.3]],
  ];
  const out = [];
  data.forEach(([label, value, delta, good, spark], i) => {
    const x = col(i);
    const y = STATS_Y;
    out.push(card(x, y, COL_W, STATS_H));
    out.push(text(x + 28, y + 46, label, { size: 18, weight: 500, fill: C.muted }));
    out.push(text(x + 28, y + 100, value, { size: 38, weight: 700, fill: C.strong }));
    out.push(rect(x + 28, y + 116, 72, 26, { r: 13, fill: good ? C.goodSoft : C.badSoft }));
    out.push(text(x + 64, y + 135, delta, { size: 15, weight: 600, fill: good ? C.good : C.bad, anchor: 'middle' }));
    out.push(sparkline(x + 210, y + 70, 124, 56, spark, i === 3 ? '#b8bdcb' : C.accent));
  });
  return out.join('\n  ');
}

function chart() {
  const { x, y, w, h } = TARGETS.chart;
  const out = [card(x, y, w, h)];
  out.push(text(x + 32, y + 48, 'Revenue', { size: 22, weight: 600, fill: C.strong }));
  out.push(text(x + 32, y + 100, '$48,210', { size: 40, weight: 700, fill: C.strong }));
  out.push(text(x + 210, y + 100, '+8.4% vs last month', { size: 17, weight: 600, fill: C.good }));

  // 7d / 30d / 90d toggle.
  const tx = x + w - 32 - 180;
  out.push(rect(tx, y + 26, 180, 38, { r: 10, fill: '#f1f2f6' }));
  out.push(rect(tx + 62, y + 30, 56, 30, { r: 8, fill: C.surface, stroke: C.border, strokeWidth: 1 }));
  ['7d', '30d', '90d'].forEach((label, i) => {
    out.push(text(tx + 30 + i * 60, y + 51, label, { size: 15, weight: i === 1 ? 600 : 500, fill: i === 1 ? C.strong : C.muted, anchor: 'middle' }));
  });

  const px0 = x + 32;
  const px1 = x + w - 32;
  const top = y + 170;
  const bottom = y + h - 80;
  for (let i = 0; i <= 4; i++) {
    const gy = top + ((bottom - top) * i) / 4;
    out.push(`<line x1="${px0}" y1="${gy}" x2="${px1}" y2="${gy}" stroke="#eef0f4" stroke-width="1.5"/>`);
  }
  const values = [0.3, 0.36, 0.33, 0.45, 0.42, 0.52, 0.49, 0.6, 0.57, 0.68, 0.74, 0.84];
  const step = (px1 - px0) / (values.length - 1);
  const pts = values.map((v, i) => [px0 + i * step, bottom - v * (bottom - top)]);
  const line = pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  out.push(`<polygon points="${px0},${bottom} ${line} ${px1},${bottom}" fill="url(#area)"/>`);
  out.push(`<polyline points="${line}" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
  const [lx, ly] = pts[pts.length - 1];
  out.push(`<circle cx="${lx}" cy="${ly}" r="9" fill="${C.surface}" stroke="${C.accent}" stroke-width="4"/>`);
  ['Sep 1', 'Sep 8', 'Sep 15', 'Sep 22', 'Sep 29'].forEach((label, i) => {
    const lxx = px0 + ((px1 - px0) * i) / 4;
    out.push(text(lxx, bottom + 40, label, { size: 15, fill: C.muted, anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }));
  });
  return out.join('\n  ');
}

function customers() {
  const { x, y, w, h } = TARGETS.customers;
  const out = [card(x, y, w, h)];
  out.push(text(x + 28, y + 48, 'New customers', { size: 22, weight: 600, fill: C.strong }));
  out.push(text(x + w - 28, y + 48, 'View all', { size: 16, weight: 600, fill: C.accentText, anchor: 'end' }));
  const tints = ['#dfe3ff', '#e3f1e8', '#fbe6dc', '#e6e1f7', '#dcefff', '#f6e3ee'];
  CUSTOMERS.forEach(([name, email], i) => {
    const ry = CUSTOMER_ROW_Y + i * CUSTOMER_ROW_H;
    if (i > 0) out.push(`<line x1="${x + 28}" y1="${ry}" x2="${x + w - 28}" y2="${ry}" stroke="#eef0f4" stroke-width="1.5"/>`);
    out.push(`<circle cx="${x + 48}" cy="${ry + 48}" r="20" fill="${tints[i]}"/>`);
    out.push(text(x + 48, ry + 54, name.split(' ').map((p) => p[0]).join(''), { size: 14, weight: 700, fill: C.text, anchor: 'middle' }));
    out.push(text(x + 82, ry + 42, name, { size: 18, weight: 600, fill: C.strong }));
    out.push(text(x + 82, ry + 68, email, { size: 16, fill: C.muted }));
  });
  return out.join('\n  ');
}

function activity() {
  const x = col(3);
  const out = [card(x, LOWER_Y, COL_W, LOWER_H)];
  out.push(text(x + 28, LOWER_Y + 48, 'Activity', { size: 22, weight: 600, fill: C.strong }));
  const widths = [236, 198, 252, 176, 220, 204];
  widths.forEach((bw, i) => {
    const ry = CUSTOMER_ROW_Y + i * CUSTOMER_ROW_H;
    out.push(`<circle cx="${x + 36}" cy="${ry + 36}" r="7" fill="${i < 2 ? C.accent : '#cfd3de'}"/>`);
    out.push(rect(x + 58, ry + 28, bw, 14, { r: 7, fill: C.bar }));
    out.push(rect(x + 58, ry + 54, bw - 90, 12, { r: 6, fill: C.barSoft }));
  });
  return out.join('\n  ');
}

export function placeholderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${C.accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${rect(0, 0, WIDTH, HEIGHT, { fill: C.canvas })}
  ${sidebar()}
  ${header()}
  ${stats()}
  ${chart()}
  ${customers()}
  ${activity()}
</svg>
`;
}
