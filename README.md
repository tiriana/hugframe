# hugframe

An iframe that hugs its content, then morphs into a chromeless full-window view.

No dependencies. No framework. Plain TypeScript over DOM APIs, usable from any page, with a
`<hug-frame>` element when you would rather write HTML.

## What it does

1. Sizes the iframe to the framed document's measured content height, exact to the pixel, and keeps it there as content changes.
2. Morphs that frame into a full-window, edge-to-edge view with a rounded-corner transition, without remounting or reloading the framed document.
3. Lets the host dictate the height instead (`height: '60vh'`), in which case the framed document scrolls inside the frame.
4. Reacts to the embedding layout resizing the frame: a layout-driven width change enters a short `resizing` phase that suspends content chasing, then settles onto the new content height, so a column change glides instead of jittering.
5. Never shows a scrollbar while the frame is content-sized. The framed document reports its height and the iframe takes it immediately while only the animating box transitions, so the frame is never smaller than its content.

Works cross-document over `postMessage`, with origin and window-identity checks on both sides.

## Install

```sh
npm install hugframe
```

The library ships its own stylesheet, which you import once:

```js
import 'hugframe/css'
```

## Use it from JavaScript

```js
import { createHugFrame } from 'hugframe'

const frame = createHugFrame({
  container: document.querySelector('#frame-slot'),
  src: '/embedded.html',
  title: 'Embedded app',
  minHeight: 220,
  maxHeight: 880,
  initialHeight: 380,
  height: 'content',
  onModeChange: (mode) => {},
  onReady: () => {},
  onMessage: (payload) => {},
})

frame.expand()
frame.sendMessage({ action: 'add-row' })
frame.getZIndex()
frame.update({ height: 'clamp(280px, 42vh, 460px)' })
frame.destroy()
```

Options:

1. `container`, `src`, `title` — required. The engine renders its own tree into `container`, and `title` labels the iframe and names the dialog when expanded.
2. `targetOrigin` — the origin expected from the framed document. Defaults to the current origin; `'*'` skips the check.
3. `initialMode` — `'inline'` (the default) or `'expanded'`.
4. `height` — `'content'` (the default) hugs the framed document; a number is px; any other string is used verbatim, so `'60vh'` and `'clamp(280px, 45vh, 460px)'` both work. Inline only: expanded always fills the window.
5. `minHeight`, `maxHeight`, `initialHeight` — bounds, and the height shown before the framed document first reports.
6. `collapseIcon`, `renderCollapse` — the expanded-mode affordance. `collapseIcon` replaces the glyph; `renderCollapse` replaces the whole control and receives `{ collapse }`; pass `null` to hide it and drive collapsing from your own chrome.
7. `className`, `style`, `iframeProps` — escape hatches.
8. `onModeChange`, `onPhaseChange`, `onSizingChange`, `onReady`, `onRequestClose`, `onMessage` — callbacks, mirrored as `hugframe:modechange`, `hugframe:phasechange`, `hugframe:sizingchange`, `hugframe:ready`, `hugframe:requestclose` and `hugframe:message` events dispatched on the root element.

Instance methods: `expand()`, `collapse()`, `toggle()`, `sendMessage(payload)`, `getIframe()`, `getMode()`, `getPhase()`, `getSizing()`, `getZIndex()`, `update(next)`, `destroy()`.

There is deliberately no controlled/uncontrolled mode prop and no render cycle: the engine owns its mode, you drive it with `expand()` and `collapse()`, and you observe the events. That removes a whole class of feedback loops.

`getZIndex()` returns the effective `--hug-z-index` applied to the expanded frame, so a host can layer its own chrome above with `getZIndex() + 1` instead of guessing.

## Use it from HTML

Importing the package registers the element:

```html
<link rel="stylesheet" href="node_modules/hugframe/dist/hugframe.css" />

<hug-frame src="/embedded.html" title="Embedded app" height="content"></hug-frame>

<script type="module">
  import 'hugframe'

  const el = document.querySelector('hug-frame')
  el.expand()
</script>
```

Attributes: `src`, `title`, `target-origin`, `mode` (read and write), `height`, `min-height`, `max-height`, `initial-height`. Properties carry what attributes cannot: `collapseIcon`, `renderCollapse`, `iframeProps`. It exposes the same methods as the instance.

One platform caveat, measured rather than assumed: moving a frame in the DOM detaches and re-inserts it, and the browser then destroys the iframe's browsing context, so the framed document reloads. The same iframe node and the same engine survive — nothing is rebuilt and no observer is duplicated — and the engine re-syncs on the reloaded document's `ready` message, re-announcing the mode and sizing, so a frame moved while expanded comes back expanded with the scroll lock intact. If framed-document state has to survive a move, move it with `Element.moveBefore()` rather than detaching it.

## Inside the framed document

The framed document needs one import, from the `./child` subpath:

```js
import { createHugFrameChild } from 'hugframe/child'

createHugFrameChild({
  targetOrigin: window.location.origin,
  onModeChange: (mode) => {},
  onSizingChange: (sizing) => {},
  onMessage: (payload) => {},
})
```

It exposes `mode`, `sizing`, `isFramed`, `resize()`, `suspend()`, `resume()`, `requestExpand()`, `requestCollapse()`, `requestClose()`, `sendMessage(payload)` and `destroy()`, and it is a safe no-op when the document is opened outside a frame.

The runtime writes `data-hug-sizing` (`'content'` or `'fixed'`) to the framed document's root, for the framed document's own CSS. Keying `overflow` off `data-hug-sizing="fixed"` is what lets a host-driven height scroll internally, while content sizing clips the single frame between content growth and the height report arriving. The mode reaches the framed document through `onModeChange`, so the app can carry it on its own shell element.

## Protocol

Child to parent: `ready`, `size` (height and width), `request` (`expand` / `collapse` / `close`), `custom`.

Parent to child: `mode`, `sizing`, `custom`.

Every message is a plain JSON-serializable object carrying `source: 'hugframe'`, validated by exported guards. Both sides check the origin, and the host additionally checks that `event.source` is the frame's own `contentWindow`.

## Theming

Set on the root element, or through `className`/`style`:

1. `--hug-duration`, `--hug-easing` — the morph.
2. `--hug-duration-fast` — radius, shadow and backdrop.
3. `--hug-duration-content`, `--hug-easing-content` — content growth and the resize settle.
4. `--hug-radius`, `--hug-shadow`, `--hug-surface`, `--hug-backdrop`, `--hug-backdrop-blur`, `--hug-line`, `--hug-text`, `--hug-accent` and friends.
5. `--hug-z-index` — the expanded frame's stacking level, defaulting to `HUGFRAME_Z_INDEX`.

The stylesheet follows `prefers-color-scheme`, and `prefers-reduced-motion: reduce` removes all transitions: the `resizing` phase is skipped and heights are applied instantly.

## Layout rules for credible framing

1. Never use `vh`/`dvh`/`vw` on the axis the host controls while content-sized. A `min-height: 100vh` in inline mode makes the frame report the viewport height, the host grows the frame, and the content grows again — a resize loop.
2. Do not give the framed document's `html` or `body` a `height: 100%`.
3. Use container queries, not media queries, inside the framed document: its width has nothing to do with the viewport.

## Working on this repository

```sh
npm install
npm run dev        # the demo on http://localhost:5176
npm run build      # library only: dist/index.js, dist/child.js, the declarations and the CSS
npm run build:demo # the demo documents, into .demo-dist
npm test           # builds, then runs the node:test suite
npm run lint       # prettier --check
```

`npm run build` produces what gets published: `files` is limited to `dist`, so the demo, the tests and the workflows never reach the tarball.

Releases are automated. Push Conventional Commits to `main`; semantic-release computes the version, tags it and opens a GitHub Release, and the publish workflow stamps that tag into the manifest, builds, tests and publishes to npm. The version lives in the tag — the manifest deliberately keeps a placeholder, so nothing is committed back to `main`.

## License

MIT.
