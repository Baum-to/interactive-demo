/**
 * Drives the Interactive Demo Capture Chrome extension in a headless Chrome,
 * so its real panel and its real recording can be photographed.
 *
 * An unpacked build is loaded over CDP (`Extensions.loadUnpacked`, which
 * current Chrome allows only with --enable-unsafe-extension-debugging; the
 * old --load-extension flag no longer works in branded Chrome). A headless
 * Chrome has no toolbar to click, so the popup is opened with
 * `chrome.action.openPopup()` from the extension's own worker — the same
 * panel, over the same active tab, that a click on the icon opens.
 * Everything photographed — the panel, the in-page sheet, the recording and
 * its step counter — is the extension's own code; nothing is mocked.
 *
 * Only image steps record this way: video steps use tabCapture, which needs
 * the grant that a real click on the toolbar icon gives.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { findChrome, sleep } from './browser.mjs';

export async function launchWithExtension({ extensionDir, width = 1440, height = 900, scale = 2 }) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'interactive-demo-ext-'));
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--enable-unsafe-extension-debugging',
      `--window-size=${width},${height}`,
      // The popup cannot take a metrics override, so the pixel ratio is set
      // for the whole browser instead.
      `--force-device-scale-factor=${scale}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  const onExit = () => proc.kill('SIGKILL');
  process.once('exit', onExit);

  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(150);
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {
      /* not listening yet */
    }
  }
  if (!wsUrl) {
    proc.kill('SIGKILL');
    throw new Error('Chrome never exposed a debugging endpoint');
  }
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let nextId = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const waiting = msg.id != null && pending.get(msg.id);
    if (!waiting) return;
    pending.delete(msg.id);
    if (msg.error) waiting.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
    else waiting.resolve(msg.result);
  });
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { id: extensionId } = await call('Extensions.loadUnpacked', { path: extensionDir });

  /** A target, attached: evaluate, click and screenshot in it. */
  function wrap(targetId, sessionId) {
    return {
      targetId,
      async goto(url, settleMs = 1200) {
        await call('Page.navigate', { url }, sessionId);
        await sleep(settleMs);
      },
      async evaluate(expression) {
        const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        }
        return result.result?.value;
      },
      /**
       * The box of the first element matching `selector` (and `text`, a
       * pattern its text must match), searching open shadow roots too —
       * the extension's in-page sheet lives in one.
       */
      async boxOf(selector, text) {
        return this.evaluate(`(() => {
          const re = ${text ? `new RegExp(${JSON.stringify(text)})` : 'null'};
          const roots = [document, ...[...document.querySelectorAll('*')].map((e) => e.shadowRoot).filter(Boolean)];
          for (const root of roots) {
            const el = [...root.querySelectorAll(${JSON.stringify(selector)})].find((e) => !re || re.test(e.textContent));
            if (!el) continue;
            el.scrollIntoView({ block: 'nearest' });
            const r = el.getBoundingClientRect();
            // cx/cy are where to click now; pageCx/pageCy are where it sits
            // in the whole page, whatever the scroll.
            return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
              pageCx: Math.round(r.left + r.width / 2 + scrollX), pageCy: Math.round(r.top + r.height / 2 + scrollY),
              width: r.width, height: r.height };
          }
          return null;
        })()`);
      },
      async click(x, y, settleMs = 900) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
        for (const type of ['mousePressed', 'mouseReleased']) {
          await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId);
        }
        await sleep(settleMs);
      },
      async clickOn(selector, text, settleMs = 900) {
        const box = await this.boxOf(selector, text);
        if (!box) throw new Error(`extension: nothing matched ${selector}${text ? ` /${text}/` : ''}`);
        await this.click(box.cx, box.cy, settleMs);
        return box;
      },
      async activate() {
        await call('Target.activateTarget', { targetId });
      },
      async shot(clip) {
        const { data } = await call(
          'Page.captureScreenshot',
          // A clip may run past the viewport: a headless popup keeps the size
          // it opened at instead of growing to fit its panel.
          { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: !!clip },
          sessionId,
        );
        return Buffer.from(data, 'base64');
      },
    };
  }

  async function attachTo(predicate, timeoutMs = 5000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const { targetInfos } = await call('Target.getTargets');
      const info = targetInfos.find(predicate);
      if (info) {
        const { sessionId } = await call('Target.attachToTarget', { targetId: info.targetId, flatten: true });
        await call('Runtime.enable', {}, sessionId).catch(() => undefined);
        return { info, sessionId };
      }
      await sleep(150);
    }
    throw new Error('extension: target never appeared');
  }

  /** The tab the popup opens over. */
  let activeTab = null;

  return {
    extensionId,
    /** A new tab at `url`, made the active one, its viewport exactly `width` x `height`. */
    async page(url) {
      const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
      await call('Page.enable', {}, sessionId);
      await call('Runtime.enable', {}, sessionId);
      const { windowId, bounds } = await call('Browser.getWindowForTarget', { targetId });
      const inner = await call('Runtime.evaluate', { expression: '[innerWidth, innerHeight]', returnByValue: true }, sessionId);
      const [iw, ih] = inner.result.value;
      await call('Browser.setWindowBounds', {
        windowId,
        bounds: { width: bounds.width + width - iw, height: bounds.height + height - ih },
      });
      const tab = wrap(targetId, sessionId);
      await tab.activate();
      await tab.goto(url);
      activeTab = tab;
      return tab;
    },
    /**
     * The toolbar popup over the active tab. Resolves once the panel has
     * drawn; `height` is the panel's own height in CSS pixels.
     */
    async openPopup() {
      // An idle MV3 worker is stopped, and a stopped one has no `chrome` to
      // call: wake it by loading one of the extension's own pages, then ask
      // again.
      let said = null;
      for (let attempt = 0; attempt < 6 && said !== 'ok'; attempt++) {
        if (attempt > 0) {
          const { targetId } = await call('Target.createTarget', {
            url: `chrome-extension://${extensionId}/offscreen.html`,
            background: true,
          });
          await sleep(600);
          await call('Target.closeTarget', { targetId }).catch(() => undefined);
          await activeTab?.activate();
          await sleep(200);
        }
        const worker = await attachTo((t) => t.type === 'service_worker' && t.url.includes(extensionId));
        const opened = await call(
          'Runtime.evaluate',
          {
            expression: 'chrome.action.openPopup().then(() => "ok", (e) => String(e && e.message))',
            awaitPromise: true,
            returnByValue: true,
          },
          worker.sessionId,
        ).catch((error) => ({ result: { value: error.message } }));
        said = opened.result?.value ?? opened.result?.description ?? 'nothing';
        await call('Target.detachFromTarget', { sessionId: worker.sessionId }).catch(() => undefined);
      }
      if (said !== 'ok') throw new Error(`extension: openPopup said ${said}`);
      const popup = await attachTo((t) => t.type === 'page' && t.url.endsWith(`${extensionId}/popup.html`));
      await call('Page.enable', {}, popup.sessionId);
      const tab = wrap(popup.info.targetId, popup.sessionId);
      for (let i = 0; i < 50; i++) {
        if (await tab.evaluate("(document.querySelector('#root .page')?.children.length ?? 0) > 0").catch(() => false)) {
          break;
        }
        await sleep(100);
      }
      // The panel's own height, once it has stopped growing.
      const measure = () => tab.evaluate("Math.ceil(document.getElementById('root').getBoundingClientRect().bottom + scrollY)");
      let height = 0;
      for (let i = 0, steady = 0; i < 30 && steady < 4; i++) {
        await sleep(150);
        const next = await measure();
        steady = next === height ? steady + 1 : 0;
        height = next;
      }
      tab.height = height;
      return tab;
    },
    async close() {
      try {
        ws.close();
      } catch {
        /* already gone */
      }
      if (proc.exitCode === null) {
        proc.kill('SIGTERM');
        const timer = setTimeout(() => proc.kill('SIGKILL'), 5000);
        await exited;
        clearTimeout(timer);
      }
      process.off('exit', onExit);
      // Chrome's helpers can still be writing as it exits; a profile left in
      // the temp folder is not worth failing a shoot over.
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* left for the OS to clean up */
      }
    },
  };
}
