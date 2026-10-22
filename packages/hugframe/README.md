# hugframe

An iframe that hugs its content, then morphs into a chromeless full-window view.

It hugs the content you can put the child runtime into, not every URL: see
[What can and cannot be hugged](#what-can-and-cannot-be-hugged).

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

`hugframe/css` is the default: it loads the geometry and animation (`hugframe/css/core`) and the
default appearance (`hugframe/css/theme`) together. Import `hugframe/css/core` instead when you want
to own the look — it is the mechanism with no paint of its own, styled through the documented
`data-hug-part` hooks. Import `hugframe/css/theme` on its own only if you already load the core
mechanism separately.

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
outside a frame. Its `targetOrigin` defaults to `'*'` where the host's defaults to the host's own origin,
because a framed document cannot know which host embedded it; the wildcard relaxes only the origin check,
never the requirement that the message come from the parent window.

## What can and cannot be hugged

Hugging needs to know the framed document's height, and the engine has exactly one source for it: the
framed document reporting its own size over `postMessage`. Nothing else reads the document, so what can be
hugged falls into three tiers.

1. **Content you control hugs.** Same-origin pages, `srcdoc`, and anything you serve yourself: import
   `createHugFrameChild` from `hugframe/child` in the framed document, as above. A cross-origin page you
   control — your other app, your docs on another domain — hugs the same way, by including the child
   runtime. That is the library's headline capability, and it is unchanged.
2. **A third-party page you cannot modify cannot be hugged**, by this or any other library. The parent has
   no layout information about a cross-origin document: the same-origin policy makes
   `iframe.contentDocument` throw, no API exposes the inner document's size, and the framed page must run
   something to answer `postMessage`. Fetching the foreign page yourself fails too, because CORS blocks
   reading another origin's HTML. Give the frame a deliberate height instead — `height: 480`, or any CSS
   string, which is passed through verbatim, so `'clamp(280px, 45vh, 460px)'` works — or proxy the page
   onto your own origin and treat it as the first tier, remembering that a proxy drags in relative URLs,
   CSP, cookies and the other site's terms of service.
3. **A document that sizes itself to its viewport has no intrinsic height.** A framed document using
   `100vh`, or a `height: 100%` chain, derives its height from the frame while the frame derives its height
   from the document: there is no fixed point. The runtime already warns once when two consecutive size
   reports equal the frame's own height, which is that loop's signature. Let the host dictate the height
   instead, with `data-hug-sizing` and `suspend()`/`resume()`, described under
   [Sizing the framed document](#sizing-the-framed-document).

With no report at all the frame falls back to `initialHeight` — 240px by default, clamped by `maxHeight`.
Growing the frame until the inner scrollbar disappears is not a way out: watching that scrollbar needs the
same blocked access that measuring the document needs, so it works only where direct measurement already
works — and it is the scrollbar feedback loop itself, where a scrollbar takes width, the content reflows
taller, the frame grows, the scrollbar goes away and the content shrinks, which browsers mitigate with
`scrollbar-gutter: stable`. Where the frame is measurable, one `scrollHeight` read is both correct and
cheaper.

## Sizing the framed document

The frame hugs the framed document only while that document is laid out at its content size. A document
sized to its own frame — `height: 100vh`, or `height: 100%` on `html`/`body` — reports the frame's height
back to the host, the host grows the frame, and the document grows with it, so the frame never hugs
anything. The runtime warns once through `console.warn` when two consecutive reports equal the frame's
height. When the framed document really does have to fill the frame, hand the height to the host instead:
the runtime marks the document with `data-hug-sizing="fixed"`, and `suspend()`/`resume()` stop and restart
content chasing.

## Theming

The frame's colours are four custom properties — `--hug-line`, `--hug-surface`, `--hug-text` and
`--hug-accent` — and those four are the theming entry point. They ship a light and a dark value picked by
`prefers-color-scheme`, so a host that owns its own theme (MUI, a manual light/dark toggle, anything that
does not follow the system) should set all four on the frame's root through `className` or `style`, or the
frame will disagree with the app around it. The radius, the inset ring and the backdrop are literals in
the stylesheet: override them with your own unlayered rule, which wins without `!important`.

## Defaults

| Option                                            | Default          |
| ------------------------------------------------- | ---------------- |
| `height`                                          | `'content'`      |
| `minHeight`                                       | `0` px           |
| `maxHeight`                                       | `720` px         |
| `initialHeight`                                   | `240` px         |
| `initialMode`                                     | `'inline'`       |
| `resizeSettleMs` / `resizeSafetyMs`               | `120` / `400` ms |
| `morphSettleMarginMs`                             | `90` ms          |
| `lockScroll` / `manageFocus` / `collapseOnEscape` | `true`           |

`initialHeight` and `maxHeight` are demo-scale, so an app-sized or scrollable embed overrides both. Every
option, its default and its meaning is in the [API reference](https://tiriana.github.io/hugframe/api/).

## Documentation

The [API reference](https://tiriana.github.io/hugframe/api/) covers every option and its default, the
element's attributes and properties, the events and phases, both wire-protocol tables, the CSS custom
properties, and the layout rules that keep framing credible. It is written in
[apps/site/docs/api.md](https://github.com/tiriana/hugframe/blob/main/apps/site/docs/api.md) and rendered
at build time.

This package is one workspace of the
[hugframe repository](https://github.com/tiriana/hugframe#readme), which also holds the demo, the
playground and the API reference.

## License

MIT.
