# @inkly-org/interactive-demo-editor

The local editor for demo configs. It is a single-page React app that
`interactive-demo dev` serves at `/__demo/editor/`; it is built into the CLI
package and is not published on its own.

## What it does

- Stage, step strip and inspectors for `demo.config.json`: add image or
  video steps, place and style hotspots, blur and text overlays, zoom
  regions, cover screens, and voiceover (record it, pick or upload an audio
  file, or generate it from the script when the host offers text-to-speech,
  which also writes the step's captions).
- Every edit is written straight back to the demo folder through the dev
  server's JSON API, debounced. There is no draft or publish step.

Open it from the demo list at `http://localhost:3000/` ("Edit"), or directly
at `/__demo/editor/#/<slug>`.

## How it is served

`vite build` writes `dist/` with `base: '/__demo/editor/'`. The CLI's build
copies that folder to `packages/cli/dist/editor/`, and `dev` serves it with a
single-page fallback so hash routes work on reload.

## Local development

Run a project's dev server on port 3000 in one terminal:

```sh
interactive-demo dev
```

Then start the editor with hot reload in another:

```sh
npm run dev -w @inkly-org/interactive-demo-editor
```

The Vite server (port 5175) proxies `/__demo/editor/demos`,
`/__demo/editor/capabilities`, `/__demo/demos`, `/__demo/player.js` and
`/__demo/player.css` to the dev server on port 3000.

## API it depends on

All under `/__demo/editor/demos/<slug>/`, provided by `packages/cli/src/dev/editor-api.ts`:

| method | path | purpose |
|---|---|---|
| GET | `files` | the demo's text files (`demo.config.json`, …); binary files by path only |
| PUT | `files` | write or delete files |
| GET | `assets` | every file directly under `assets/`, with a URL this server serves |
| POST | `assets?name=<file>[&kind=…]` | write the request body to `assets/<file>`; different bytes under a taken name land as `<name>-2.<ext>` |
| DELETE | `assets?name=<file>` | remove `assets/<file>` |
| GET | `embed` | the iframe and pop-up snippets the Share dialog shows |

`GET /__demo/demos` lists the project's demos for the picker.

`GET /__demo/editor/capabilities` says which optional features the host
offers; `dev` answers `{}`. A host that advertises `voiceover` must also
serve `POST /__demo/editor/demos/<slug>/voiceover` (text-to-speech into a
new audio asset); the CLI does not. Both are described in
[docs/editor.md](../../docs/editor.md#host-capabilities).
