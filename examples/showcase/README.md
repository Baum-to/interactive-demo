# showcase

Every feature of the demo format in one demo: a product tour of **Acme
Analytics**, the stand-in product in [`testbed/app/`](../../testbed/app),
written the way a team would write a tour of its own app.

```
npm --prefix ../.. run build      # build the CLI once
node ../../packages/cli/dist/cli.js dev
```

Then open the `acme-tour` demo. Its story: see your numbers, find the
drop-off in a funnel, break it down, save the audience, bring the team in —
then a form to book a walkthrough and a closing call to action.

## What each step shows

| step | what the viewer sees | features |
| --- | --- | --- |
| `cover-intro` | "Know exactly where your users drop off" | cover with a `headline` widget: `logo`, `image` (hero), a primary `next` button and a secondary button whose `chapter` action jumps to *Bring the team in* |
| `overview` | the dashboard, live | image step; `cursor` message (the one `capture` recorded, rewritten); `blur` over the report owners' names; `voiceover` + `captions` |
| `funnel` | where half the visitors leave | `transform` zoom onto the funnel; `pointer` message; `text` annotation; `voiceover` + `captions` |
| `breakdown` | scrolling to the breakdown by segment | **video** step (`capture` recorded the scroll before the click as a WebM with a poster); `cursor` message |
| `segments` | audiences Acme suggests | `area` message around the suggestions panel |
| `settings` | seats, roles and sources | `callout` message |
| `invite` | sending the invite | `cursor` message; `voiceover` + `captions` |
| `cover-form` | "Want a walkthrough on your own data?" | cover with a `form` widget: two required text fields and a `dropdown`, submit action `next` |
| `cover-outro` | "That's Acme in a minute" | headline with a hero image; a primary `url` button and a secondary `restart` |

Around the steps:

- **Chapters** — *See what's happening*, *Act on it*, *Bring the team in*.
  The intro's secondary button jumps to the last one.
- **Theme** — the player's default theme, untouched, with `theme.brand`
  naming the demo in the player header. The monochrome is the product's
  own: Acme's screens, not the player.
- **Page bar** — the project `brand` in `interactive-demo.json`: the Acme
  mark from `brand/`, a primary and a secondary CTA.
- **Chrome** — `autoplay: true` so narration starts as each narrated step
  opens (every step still waits for a click to move on), full controls, and
  the "Built with Inkly" badge.

The form has no `submitTo`, so submitting it only emits the player's
`form_submit` event and moves on. Set `submitTo` to a URL and the player
POSTs the fields there as JSON first — see
[docs/authoring.md](../../docs/authoring.md#form-submissions).

## How it was made

Like [`self-demo`](../self-demo), nothing here is a mockup. `node
testbed/shoot-showcase.mjs` at the repo root records `testbed/app/` with the
real `interactive-demo capture` command — clicks and a scroll driven over
the DevTools protocol — and writes:

- the screens into `demos/acme-tour/assets/` (WebP stills, a WebM clip and
  its poster);
- `demos/acme-tour/metrics.json`: where the captured cursors landed and the
  boxes of the things the tour points at, which is where the hotspot, blur
  and zoom coordinates in `demo.config.json` come from;
- with `INWORLD_API_KEY` set, the narration: each narrated step's `script`
  is read by [Inworld TTS](https://inworld.ai) (voice *Ashley*) into
  `vo-<step>.mp3`, and the step's `voiceover` duration and one caption per
  sentence, timed in proportion to its length (the rule the editor uses),
  are rewritten to match.

The copy, chapters, covers and hotspots are hand-written in
`demo.config.json` and a re-shoot never touches them; check the hotspots
still land after a UI change.

## How it differs from the other two

- **`init`'s starter** is a lesson in the editor: a short tour whose hotspots
  say which menu made them, there to be replaced by your own capture.
- **[`self-demo`](../self-demo)** is a tour *of* interactive-demo — the tool
  demoing itself.
- **`showcase`** is what a customer *makes* with it: a tour of their own
  product, using every part of the format.
