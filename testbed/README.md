# Testbed

A place to exercise the whole product — CLI, dev server, editor, capture,
static build and both embeds — without publishing anything or touching a
hosted backend.

Build first; everything here drives the built CLI, not the sources:

```
npm run build
```

## The automated pass

```
npm run testbed              # every phase
npm run testbed -- --keep    # leave the scratch project on disk
npm run testbed -- --only editor,capture
npm run testbed -- --verbose
```

`testbed/run.mjs` scaffolds a throwaway project in a temp folder and checks it
phase by phase. Each phase pulls in the ones it needs, so `--only capture`
still scaffolds and builds a project to capture.

| phase | what it covers |
| --- | --- |
| `cli` | `version`, `help`, `init`, `init --demo`, id minting, `validate --strict` |
| `dev` | the preview server: the index, a demo page, the page contract, `?embed=inline`, `/__demo/*`, 404s |
| `editor` | the editor bundle plus its API: read files, save a config to disk, upload/serve/delete an asset, embed snippets, path traversal |
| `build` | `dist/<slug>/` contents, the page contract, relative media paths, `embed.js`, `--out` |
| `host` | the stand-in website below: injected demo list, `embed.js`, the form endpoint |
| `capture` | a headless Chrome capture driven over CDP: record clicks, `stop`, import with `init --demo --from`, then validate |
| `failures` | `publish` without credentials, a missing media file, a legacy `asset:` pointer, a bad port |

The `capture` phase needs Chrome (or `CHROME_PATH`) on the machine. It fails
with a clear message where there is none; skip it with
`--only cli,dev,editor,build,failures`.

## The stand-in website

`testbed/host/` is what "your site" would be: a plain page that embeds a built
demo both ways and shows what comes back out of it.

```
node packages/cli/dist/cli.js build          # inside any project
node testbed/host/serve.mjs --dist examples/showcase/dist --port 4321
open http://localhost:4321/
```

It gives you:

- the **inline iframe**, sized the way `interactive-demo embed` sizes it;
- a **pop-up** button wired to `embed.js` and `InteractiveDemo.open()`;
- a live log of the **runtime events** the framed player relays to the host
  (`interactive-demo:event`);
- a **form endpoint** at `/api/form` and a panel showing what it received, so a
  form widget's `submitTo` can be tested end to end.

The page lists what to look for at the bottom — the parts that only a browser
can show (letterboxing, scroll locking, the overlay ratio).

## Re-shooting the showcase

`examples/showcase` is a one-minute demo of this product, made with this
product, and every screen in it is real. `testbed/shoot-showcase.mjs` produces
them in one run:

```
npm run build
node testbed/shoot-showcase.mjs --extension <dir>   # writes examples/showcase/demos/interactive-demo/assets/
node testbed/shoot-showcase.mjs --out /tmp/shots    # somewhere else, to compare first
node testbed/shoot-showcase.mjs --voice-only        # only read the scripts aloud again
node testbed/shoot-showcase.mjs --voice-only --narrate editor   # …or just one step's
```

In order, it:

1. replays an agent's capture of `testbed/app/` with the real `capture`
   command and puts the agent's own `demo.config.json` on top (see below),
   less the theme tokens and button colour it chose, so the player inside
   the screens is the stock one;
2. draws that agent session as a Claude Code terminal and films it filling
   in, line by line, as a video step;
3. films the Interactive Demo Capture extension really recording the same
   app — popup, Start Recording, three clicks, the popup counting three
   steps — as a video step. Only with `--extension <dir>`, the folder of an
   unpacked build of the extension; without it that clip is left as it is;
4. opens the demo in the real editor (`dev`) and photographs a hotspot being
   edited, framed with a margin so the step can zoom in on it cleanly;
5. builds it, photographs it playing for the cover, embeds it in the
   stand-in website (opened with `?film=1`, which
   drops the testbed's demo picker and leaves room under the embed), and
   records the scroll down to it as a video step, again with the real
   `capture`;
6. runs `init my-demos` and draws the command with what it printed, for the
   outro;
7. with `INWORLD_API_KEY` set, reads the `script` of each narrated step (the four between the covers) aloud with
   Inworld TTS (voice Reed, model `inworld-tts-2`) and rewrites that step's `voiceover` and `captions` to match
   (`--no-voice` skips this).

Needs Chrome and ffmpeg. Element positions land in `metrics.json` beside the
screens; the hotspot coordinates in `demo.config.json` come from there. A
re-shoot never touches the copy or the hotspots, so check they still land
where they should afterwards.

**The agent session is a recording, not a rerun.** An agent does not take the
same path twice, so one real Claude Code session — the skill in
`skills/interactive-demo/` installed in a scaffolded project, one prompt — was
recorded and stored, with the machine's paths taken out, in
`testbed/fixtures/claude-code-session.json`: the prompt, every tool call and
its output, the clicks the agent made, and the config it wrote. The clip shows
a short excerpt of it — the prompt, loading the skill, `capture start`,
`capture stop`, the write-up and `validate`, the closing message — with every
cut marked by an ellipsis and the calls in between counted (`EXCERPT` in the
script says which). To record a new one, run a
session and pass its transcript (a session `.jsonl`, or the output of
`claude -p … --output-format stream-json --verbose`) with
`--session <file> --session-project <the folder it worked in>`.

`node testbed/hero.mjs` (or `npm run hero`) then films the README's two
animations from the re-shot showcase — the built player stepping through it,
each step held long enough to read, into `docs/images/demo.webp`, the editor clicked through its filmstrip into
`docs/images/editor-anim.webp` (`--only demo` or `--only editor`, `--out <dir>`,
`--frames <dir>` to keep the frames).

## The manual pass

The automated run covers everything reachable over HTTP and the filesystem.
These need eyes:

1. `interactive-demo dev` in a project, then `/__demo/editor/` — move a
   hotspot, edit a caption, check the file on disk changed, and open the Share
   dialog (its snippets come from the same code the `embed` command uses).
2. The host page above — resize the window and watch the inline frame keep the
   demo's ratio; open the pop-up and close it with Escape and with a click
   outside.
3. A headed capture of a real site:
   `interactive-demo capture start https://example.com`, click a few times,
   `interactive-demo capture stop`.

Opening a demo in the editor leaves `demo.config.json` alone, and an edit
changes only what it touched: `$schema` stays first, key order is kept, and
unset defaults stay out (see [the editor guide](https://docs.inklyai.dev/open-source/editor#your-file-keeps-its-shape); the codec
tests hold the showcase's config to a byte-for-byte round trip). The manual
pass does edit files, though, so after poking at the example project restore
it:

```
git checkout -- examples/
```
