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
[apps/site/docs/api.md](https://github.com/tiriana/hugframe/blob/main/apps/site/docs/api.md) and rendered
at build time.

This package is one workspace of the
[hugframe repository](https://github.com/tiriana/hugframe#readme), which also holds the demo, the
playground and the API reference.

## License

MIT.
