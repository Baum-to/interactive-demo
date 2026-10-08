// Baum capture driver for Inkly interactive-demo (pinned CLI 0.1.7).
//
// Scripted clicks in a signed-in, headless Chrome become demo steps: the
// driver launches Chrome with a DevTools port, rehearses routes off camera,
// attaches `interactive-demo capture start --connect-to-browser`, performs
// each planned click and stops the capture into the caller's project folder.
// It is product-agnostic. Callers supply the session, tidy hooks and plan.
// Never use Inkly's hosted `login`, `publish` or `embed` from Baum tooling.
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
export const CLI = join(HERE, "node_modules/.bin/interactive-demo");
export const DEFAULT_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Runs the pinned CLI in a project folder and parses its JSON output. */
export async function cli(projectDir, args, env = {}, timeout = 180_000) {
  const { stdout } = await run(CLI, args, {
    cwd: projectDir,
    env: { ...process.env, SHARP_IGNORE_GLOBAL_LIBVIPS: "1", ...env },
    maxBuffer: 1 << 24,
    // A hung CLI must not hang the caller's capture run.
    timeout,
  });
  try {
    return JSON.parse(stdout);
  } catch {
    return { output: stdout };
  }
}

/**
 * Applies a Playwright storage state (cookies plus per-origin localStorage)
 * to a persistent context, which cannot take one at launch.
 */
async function applySession(context, session) {
  if (session?.cookies?.length) await context.addCookies(session.cookies);
  for (const origin of session?.origins ?? []) {
    await context.addInitScript(
      ({ origin: o, items }) => {
        if (location.origin !== o) return;
        for (const { name, value } of items) {
          try {
            localStorage.setItem(name, value);
          } catch {}
        }
      },
      { origin: origin.origin, items: origin.localStorage ?? [] },
    );
  }
}

/**
 * @param {object} opts
 * @param {string} opts.projectDir   Inkly project (has interactive-demo.json).
 * @param {string} opts.name         Demo title for the capture.
 * @param {string} opts.startUrl     Page the capture starts on.
 * @param {object} [opts.session]    Playwright storage state for the persona.
 * @param {Function[]} [opts.initScripts]  Page init scripts (tidy state).
 * @param {string[]} [opts.rehearse] URLs visited off camera first.
 * @param {(page, opts: {keys: boolean}) => Promise<unknown>} [opts.tidy]
 *        Dismisses first-run prompts. Steps it adds during the capture are
 *        undone. `keys: false` during capture, so no key presses are recorded.
 * @param {(page, label: string) => Promise<void>} [opts.assertTidy]
 * @param {{name: string, prepare?: Function, target: Function, center?: boolean, after?: Function}[]} opts.steps
 *        One capture step per entry. `prepare(page, vars)` runs before the
 *        click, `target(page, vars)` returns the locator to click, and
 *        `after(page, vars)` may record values (for example a path) in vars.
 * @param {(m: string) => void} [opts.log]
 * @returns {Promise<{ demoDir: string, slug: string }>}
 */
export async function captureDemo(opts) {
  const log = opts.log ?? (() => {});
  const tidy = opts.tidy ?? (async () => 0);
  const assertTidy = opts.assertTidy ?? (async () => {});
  const work = mkdtempSync(join(tmpdir(), "baum-capture-"));
  const env = { INTERACTIVE_DEMO_CAPTURE_HOME: join(work, "capture-home") };
  const call = (...args) => cli(opts.projectDir, args, env);
  const stepCount = async () =>
    (await call("capture", "status")).capture?.stepCount ?? NaN;
  let context;
  let started = false;
  try {
    context = await chromium.launchPersistentContext(join(work, "profile"), {
      executablePath:
        opts.chromePath ?? process.env.CHROME_PATH ?? DEFAULT_CHROME,
      headless: true,
      // Attached to Inkly's capture, Playwright's per-page emulation wins over
      // Inkly's and screenshots come out at 1x; size the window natively.
      viewport: null,
      reducedMotion: "reduce",
      colorScheme: "light",
      args: [
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        // A free port, read back from DevToolsActivePort: a fixed port could
        // attach to another Chrome or expose this session to other processes.
        "--remote-debugging-port=0",
        "--force-device-scale-factor=2",
        "--window-size=1440,900",
      ],
    });

    const portFile = join(work, "profile", "DevToolsActivePort");
    for (let i = 0; i < 40 && !existsSync(portFile); i++)
      await new Promise((r) => setTimeout(r, 100));
    const port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
    if (!port) throw new Error("Chrome did not report its DevTools port");
    await applySession(context, opts.session);
    for (const script of opts.initScripts ?? [])
      await context.addInitScript(script);
    const warm = context.pages()[0] ?? (await context.newPage());
    for (const url of opts.rehearse ?? [opts.startUrl]) {
      await warm.goto(url, { waitUntil: "networkidle" });
      await tidy(warm, { keys: true });
    }
    const known = new Set(context.pages());
    await call(
      "capture",
      "start",
      opts.startUrl,
      "--connect-to-browser",
      `http://127.0.0.1:${port}`,
      "--name",
      opts.name,
      "--no-video",
      "--compress-images",
    );
    started = true;
    let page;
    for (let i = 0; i < 40 && !page; i++) {
      page = context.pages().find((p) => !known.has(p));
      if (!page) await new Promise((r) => setTimeout(r, 250));
    }
    if (!page) throw new Error("could not find the capture tab");
    await page.waitForLoadState("networkidle");
    await warm.close();

    // Tidy-up clicks may or may not be recorded as steps (a prompt can close
    // before the recorder sees the click), so undo exactly the steps added.
    const tidyUndone = async () => {
      const before = await stepCount();
      await tidy(page, { keys: false });
      const extra = (await stepCount()) - before;
      for (let i = 0; i < extra; i++) await call("capture", "undo");
      if (extra > 0) log(`  undid ${extra} first-run dismissal step(s)`);
    };
    const vars = {};
    for (const step of opts.steps) {
      await tidyUndone();
      if (step.prepare) {
        await step.prepare(page, vars);
        await page.waitForLoadState("networkidle");
        await tidyUndone();
      }
      const before = await stepCount();
      await page.mouse.move(720, 450);
      await assertTidy(page, step.name);
      const target = step.target(page, vars);
      await target.waitFor({ timeout: 20_000 });
      if (step.center)
        await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
      else await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await target.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2500);
      const after = await stepCount();
      log(`step: ${step.name} (${before} -> ${after})`);
      if (after !== before + 1)
        throw new Error(
          `${step.name}: expected one new step, got ${after - before}`,
        );
      if (step.after) await step.after(page, vars);
    }
    const stopped = await call("capture", "stop");
    started = false;
    const demoDir = stopped.output?.demoDir;
    const slug = stopped.output?.slug;
    if (!demoDir)
      throw new Error(
        `capture stop returned no demo folder: ${JSON.stringify(stopped).slice(0, 300)}`,
      );
    return { demoDir, slug };
  } catch (error) {
    if (started) await call("capture", "cancel").catch(() => undefined);
    throw error;
  } finally {
    // The profile holds the signed-in session: remove it whatever happened.
    try {
      await context?.close();
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
}

/** Builds the self-hosted player folder for every demo in the project. */
export async function buildDemos(projectDir, outDir = "dist") {
  return cli(projectDir, ["build", "--out", outDir, "--force"]);
}
