# Docs

The guides for interactive-demo live on the docs site:
**[docs.inklyai.dev/open-source](https://docs.inklyai.dev/open-source/overview)**.

| | |
|---|---|
| [Quickstart](https://docs.inklyai.dev/open-source/quickstart) | scaffold, capture, write it up, ship |
| [Use your agent](https://docs.inklyai.dev/open-source/agent-skill) | the [skill](../skills/interactive-demo/SKILL.md), and how to hand an agent the job |
| [Capture](https://docs.inklyai.dev/open-source/capture) | the CLI recorder, video steps, logins, the Chrome extension |
| [Authoring](https://docs.inklyai.dev/open-source/authoring) | project layout, steps, hotspots, captions, voiceover, the theme |
| [The editor](https://docs.inklyai.dev/open-source/editor) | what you can change, autosave, how edits land in your files |
| [Publish and self-host](https://docs.inklyai.dev/open-source/publish-and-self-host) | `publish` to a link, or `build` a folder for any static host |
| [Sharing and embedding](https://docs.inklyai.dev/open-source/embedding) | link, iframe, pop-up or React |
| [CLI reference](https://docs.inklyai.dev/open-source/cli) | every command, flag and default |
| [Runtime and React API](https://docs.inklyai.dev/open-source/runtime) | `<Demo>`, `<DemoModal>`, events, the page contract, the theme |

## What stays in this folder

- [`schema.md`](schema.md) — every field of `demo.config.json`. Generated from
  the schema by `node scripts/docs-schema.mjs`, and CI fails if it drifts; do
  not edit it by hand.
- [`architecture.md`](architecture.md) — for working on this repo: what each
  package is responsible for, the build graph, the testbed, and the checks a
  change has to pass. See also [CONTRIBUTING](../CONTRIBUTING.md).
- `images/` — the README's images.
