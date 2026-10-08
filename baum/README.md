# Baum capture driver for Inkly interactive-demo

A small, product-agnostic package in the Baum fork of
[inkly-ai/interactive-demo](https://github.com/inkly-ai/interactive-demo)
(MIT). It pins the Inkly CLI and turns scripted clicks in a signed-in Chrome
into demo steps, so a product's own capture tooling can re-record demos
unattended.

- `captureDemo(opts)` launches headless Chrome with a DevTools port, applies a
  Playwright storage state, rehearses routes off camera, attaches
  `interactive-demo capture start --connect-to-browser`, performs each planned
  click and stops into the caller's Inkly project. A click that does not add
  exactly one step fails the capture; first-run dismissals reported by the
  caller's `tidy` hook are undone.
- `buildDemos(projectDir, outDir)` writes the self-hosted player folders.
- `cli(projectDir, args)` runs the pinned CLI and parses its JSON.

Install once per machine:

```bash
cd baum && SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install
```

Needs Google Chrome (or `CHROME_PATH`). Never use Inkly's hosted `login`,
`publish` or `embed` from Baum tooling; host the built folder yourself.

Consumers: Virtual CoSec's media kit (`media/demos`), which finds this package
through `INTERACTIVE_DEMO_HOME` (default `~/Tools/interactive-demo/baum`).
