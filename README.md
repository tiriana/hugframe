# hugframe

An iframe that hugs its content, then morphs into a chromeless full-window view.

No dependencies and no framework: plain TypeScript over DOM APIs, shipping its own types, with a
`<hug-frame>` element when you would rather write HTML than call a function.

1. [Live demo](https://tiriana.github.io/hugframe/) — the host page, the embedded app, the layout switcher and the host-driven height control.
2. [API reference](https://tiriana.github.io/hugframe/api/)

## What it does

1. Sizes the iframe to the framed document's measured content height, exact to the pixel, and keeps it there as the content changes.
2. Morphs it into a full-window, edge-to-edge view without remounting or reloading the framed document.
3. Lets the host dictate the height instead, in which case the framed document scrolls inside the frame.
4. Smooths an embedding layout that resizes the frame: a layout-driven width change enters a `resizing` phase that suspends content chasing, instead of chasing every reflow.
5. Never shows a scrollbar while the frame is content-sized: the iframe takes a reported height immediately while only the animating box transitions.

## Install

```sh
npm install hugframe
```

```js
import { createHugFrame } from 'hugframe'
import 'hugframe/css'

const frame = createHugFrame({
  container: document.querySelector('#slot'),
  src: '/embedded.html',
  title: 'Embedded app',
  onModeChange: (mode) => {},
})

frame.expand()
frame.sendMessage({ action: 'add-row' })
```

The engine owns its mode: drive it with `expand()`, `collapse()` and `sendMessage()`, and observe
`onModeChange` and `onPhaseChange`. There is no render cycle to keep in sync.

Importing the package also registers the element, so HTML works too:

```html
<hug-frame src="/embedded.html" title="Embedded app"></hug-frame>
<script type="module">
  import 'hugframe'
  document.querySelector('hug-frame').expand()
</script>
```

Inside the framed document, import `createHugFrameChild` from `hugframe/child`. It reports the frame's
size, answers the host's `mode` and `sizing` messages, and is a safe no-op when the document is opened
outside a frame.

## Documentation

The [API reference](https://tiriana.github.io/hugframe/api/) covers every option and its default, the
element's attributes and properties, the events and phases, both wire-protocol tables, the CSS custom
properties, and the layout rules that keep framing credible. It is written in
[docs/api.md](docs/api.md) and rendered at build time.

## Working on this repository

```sh
npm install
npx playwright install chromium   # once, for the end-to-end suite
npm run dev          # the demo on http://localhost:5176
npm run build        # the library: dist/index.js, dist/child.js, the declarations, the CSS
npm run build:pages  # the demo plus the API reference, assembled into .pages
npm test             # builds, then runs the node:test suite
npm run test:e2e     # builds the Pages site, serves it locally, and drives it in Chromium
npm run lint         # prettier --check
```

The end-to-end suite drives a real Chromium, so run `npx playwright install chromium` once.
`npm run test:e2e` builds the Pages output, serves it on a free port under the `/hugframe/` prefix, runs
every browser suite against that local build, and exits non-zero if any of them fails. Set `GF_BASE` to
point a suite at another deployment instead.

`files` is limited to `dist`, so the demo, the tests and the workflows never reach the tarball. Releases
are automated: push Conventional Commits to `main`, and semantic-release works out the version, tags it,
and dispatches the publish workflow. The version lives in the tag, so the manifest keeps a placeholder
`0.0.0` and nothing is ever committed back to `main`.

## License

MIT.
