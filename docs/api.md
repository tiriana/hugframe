# hugframe API reference

The complete public surface of `hugframe`. For a quick start, see the [README](https://github.com/tiriana/hugframe#readme).

Everything here is framework-free: plain TypeScript over DOM APIs, no runtime dependencies. The package
is ESM-only and browser-only, and it imports nothing.

## Package entry points

1. `hugframe` — the engine, the `<hug-frame>` element, the protocol guards and the types.
2. `hugframe/child` — the runtime that runs _inside_ the framed document.
3. `hugframe/css` — the stylesheet, imported once by the host page.

```js
import { createHugFrame } from 'hugframe'
import 'hugframe/css'
```

Importing `hugframe` also registers `<hug-frame>`, so importing it for the element alone is a legitimate
side effect and the package is not marked side-effect free.

## createHugFrame(options)

Creates a frame inside `container` and returns an instance.

```ts
function createHugFrame(options: HugFrameOptions): HugFrameInstance
```

### Options

| Option           | Type                                                               | Default          | Notes                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container`      | `HTMLElement`                                                      | —                | Required. The engine renders its own tree into this element.                                                                                                                           |
| `src`            | `string`                                                           | —                | Required. The framed document.                                                                                                                                                         |
| `title`          | `string`                                                           | —                | Required. Labels the iframe, and names the dialog when expanded.                                                                                                                       |
| `targetOrigin`   | `string`                                                           | current origin   | Origin expected from the framed document. `'*'` skips the check.                                                                                                                       |
| `initialMode`    | `'inline' \| 'expanded'`                                           | `'inline'`       | The engine owns its mode; a host changes it with `expand()` / `collapse()`.                                                                                                            |
| `height`         | `'content' \| number \| string`                                    | `'content'`      | `'content'` hugs the framed document; a number is px; any other string is used verbatim, so `'60vh'` and `'clamp(280px, 45vh, 460px)'` both work. Inline only — expanded always fills. |
| `minHeight`      | `number`                                                           | `0`              | Inline-mode floor, px.                                                                                                                                                                 |
| `maxHeight`      | `number`                                                           | `720`            | Inline-mode ceiling, px.                                                                                                                                                               |
| `initialHeight`  | `number`                                                           | `240`            | Inline-mode height before the framed document first reports.                                                                                                                           |
| `collapseIcon`   | `Node \| string`                                                   | a built-in glyph | Replaces the glyph inside the default expanded-mode control.                                                                                                                           |
| `renderCollapse` | `((handle: HugFrameCollapseHandle) => Node) \| null`               | —                | Replaces the whole expanded-mode control. Receives `{ collapse }`. `null` hides it, which is how you drive collapsing from your own chrome.                                            |
| `className`      | `string`                                                           | —                | Added to the root element, so `--hug-*` tokens set here win.                                                                                                                           |
| `style`          | `Partial<CSSStyleDeclaration>`                                     | —                | Applied to the root element.                                                                                                                                                           |
| `iframeProps`    | `Record<string, string \| number \| boolean \| null \| undefined>` | —                | Attributes applied to the created iframe.                                                                                                                                              |
| `onModeChange`   | `(mode: HugFrameMode) => void`                                     | —                | Fires on every mode change, including ones the framed document requested.                                                                                                              |
| `onPhaseChange`  | `(phase: HugFramePhase) => void`                                   | —                | Fires on phase transitions only, not on every frame.                                                                                                                                   |
| `onSizingChange` | `(sizing: HugFrameSizing) => void`                                 | —                | Fires when the sizing mode actually changes.                                                                                                                                           |
| `onReady`        | `() => void`                                                       | —                | The framed document has loaded and announced itself with `ready`.                                                                                                                      |
| `onRequestClose` | `() => void`                                                       | —                | The framed document asked to be closed. Unmounting is the host's decision; the engine never removes itself.                                                                            |
| `onMessage`      | `(payload: unknown) => void`                                       | —                | Arbitrary payload sent from the framed document with `sendMessage()`.                                                                                                                  |

### Instance

| Member                 | Type                                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `element`              | `HTMLElement` (read-only)                             | The root the engine rendered.                                                                                                                                                                                                                                                                                                                                                                          |
| `expand()`             | `void`                                                | Morphs to the full-window view.                                                                                                                                                                                                                                                                                                                                                                        |
| `collapse()`           | `void`                                                | Returns to the inline slot.                                                                                                                                                                                                                                                                                                                                                                            |
| `toggle()`             | `void`                                                | Whichever of the two applies.                                                                                                                                                                                                                                                                                                                                                                          |
| `sendMessage(payload)` | `void`                                                | Posts a `custom` message to the framed document.                                                                                                                                                                                                                                                                                                                                                       |
| `update(next)`         | `void`                                                | Merges the options and re-applies what depends on them, without remounting the frame. Options read at use time — `targetOrigin`, the `on*` callbacks — take effect immediately; `src`, `title`, `height`, `minHeight`, `maxHeight`, `initialHeight`, `collapseIcon`, `renderCollapse`, `className`, `style` and `iframeProps` are applied to the live frame, and `initialMode` requests a mode change. |
| `getIframe()`          | `HTMLIFrameElement \| null`                           | The one iframe for the component's lifetime. It is never remounted.                                                                                                                                                                                                                                                                                                                                    |
| `getMode()`            | `'inline' \| 'expanded'`                              |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `getPhase()`           | `'idle' \| 'expanding' \| 'collapsing' \| 'resizing'` |                                                                                                                                                                                                                                                                                                                                                                                                        |
| `getSizing()`          | `'content' \| 'fixed'`                                | Which of the two is driving the height.                                                                                                                                                                                                                                                                                                                                                                |
| `getZIndex()`          | `number`                                              | The effective `--hug-z-index` on the expanded frame, so a host can layer above it with `getZIndex() + 1`.                                                                                                                                                                                                                                                                                              |
| `destroy()`            | `void`                                                | Detaches every listener, observer and timer, releases the scroll lock, and removes the rendered tree.                                                                                                                                                                                                                                                                                                  |

### Events

Dispatched on the root element with `bubbles: false`, so listen on `instance.element` rather than on an ancestor.

| Event                   | `detail`      |
| ----------------------- | ------------- |
| `hugframe:modechange`   | `{ mode }`    |
| `hugframe:phasechange`  | `{ phase }`   |
| `hugframe:sizingchange` | `{ sizing }`  |
| `hugframe:ready`        | —             |
| `hugframe:requestclose` | —             |
| `hugframe:message`      | `{ payload }` |

### Phases

`idle` is the resting state. `expanding` and `collapsing` are the morph. `resizing` is entered when the
embedding layout changes the frame's width underneath it — the engine suspends content chasing, holds the
height so the framed document clips rather than jumps, and settles onto the newly reported height after
120ms of width quiescence, or 400ms at the latest. With `prefers-reduced-motion: reduce` the phase is
skipped entirely and heights are applied instantly.

## `<hug-frame>`

The same engine as an element. Register it by importing the package.

```html
<hug-frame src="/embedded.html" title="Embedded app" height="content"></hug-frame>
<script type="module">
  import 'hugframe'

  const el = document.querySelector('hug-frame')
  el.expand()
</script>
```

### Attributes

| Attribute        | Notes                                                           |
| ---------------- | --------------------------------------------------------------- |
| `src`            | The framed document.                                            |
| `title`          | Labels the iframe and names the dialog when expanded.           |
| `target-origin`  | Origin expected from the framed document.                       |
| `mode`           | Read and write: `inline` or `expanded`. Reflects the live mode. |
| `height`         | `content`, or a CSS length. A bare number is read as px.        |
| `min-height`     | Inline-mode floor, px.                                          |
| `max-height`     | Inline-mode ceiling, px.                                        |
| `initial-height` | Inline-mode height before the first report, px.                 |

### Properties

`collapseIcon` (`Node | string`), `renderCollapse` (`((handle) => Node) | null`) and `iframeProps` — the
options that cannot be expressed as attributes. There is deliberately no `collapse-icon` attribute: a glyph
is a `Node` or a string, and the element takes it as a property.

### Methods

The instance methods above, plus `destroy()`. `connectedCallback` creates the engine and
`disconnectedCallback` tears it down, but teardown is deferred by a microtask so that moving the element
within the DOM relocates it instead of rebuilding it.

## createHugFrameChild(options)

Import from the `hugframe/child` subpath, and call it inside the framed document.

```ts
function createHugFrameChild(options?: HugFrameChildOptions): HugFrameChild
function getHugFrameChild(): HugFrameChild | undefined
```

### Options

| Option           | Type                               | Default                    | Notes                                                         |
| ---------------- | ---------------------------------- | -------------------------- | ------------------------------------------------------------- |
| `targetOrigin`   | `string`                           | `'*'` (no check)           | Origin expected from the host.                                |
| `sizeSelector`   | `string`                           | `document.documentElement` | Element whose box height drives the frame.                    |
| `offsetHeight`   | `number`                           | `0`                        | Constant px added to every reported height.                   |
| `onMessage`      | `(payload: unknown) => void`       | —                          | Arbitrary payload sent from the host.                         |
| `onModeChange`   | `(mode: HugFrameMode) => void`     | —                          | The host entered `inline` or `expanded`.                      |
| `onSizingChange` | `(sizing: HugFrameSizing) => void` | —                          | The host started driving the height, or went back to content. |

### Instance

`isFramed`, `mode` and `sizing` are read-only. Methods: `resize()`, `suspend()`, `resume()`,
`requestExpand()`, `requestCollapse()`, `requestClose()`, `sendMessage(payload)`, `destroy()`.

The runtime is a safe no-op when the document is opened outside a frame, so a framed app can also be
previewed directly.

### Attributes the runtime writes

`data-hug-sizing` — `content` or `fixed` — on the framed document's root element, for the framed
document's own CSS. Keying `overflow` off `data-hug-sizing="fixed"` is what lets a host-driven height
scroll internally, while content sizing clips the single frame between content growth and the height
report arriving.

## The wire protocol

Every message is a plain JSON-serializable object carrying `source: 'hugframe'`, and every message is
validated by an exported guard.

### Framed document to host

| Message   | Shape                                                                    |
| --------- | ------------------------------------------------------------------------ |
| `ready`   | `{ source, type: 'ready' }`                                              |
| `size`    | `{ source, type: 'size', height: number, width: number }`                |
| `request` | `{ source, type: 'request', action: 'expand' \| 'collapse' \| 'close' }` |
| `custom`  | `{ source, type: 'custom', payload: unknown }`                           |

### Host to framed document

| Message  | Shape                                                      |
| -------- | ---------------------------------------------------------- |
| `mode`   | `{ source, type: 'mode', mode: 'inline' \| 'expanded' }`   |
| `sizing` | `{ source, type: 'sizing', sizing: 'content' \| 'fixed' }` |
| `custom` | `{ source, type: 'custom', payload: unknown }`             |

### Exported helpers

`HUGFRAME_SOURCE` (the string `'hugframe'`), `HUGFRAME_Z_INDEX`, `isHugFrameChildMessage(value)`,
`isHugFrameParentMessage(value)` and `postHugFrameMessage(target, message, targetOrigin)`.

Two checks matter and both are enforced. The host verifies that `event.source` is the frame's own
`contentWindow` as well as the origin, and the framed document verifies the origin and its parent window.
Trusting the `source` field inside the payload alone would be a security regression.

## CSS custom properties

Set them on the root element — directly, or through `className`/`style`.

| Token                                                  | Default                          | Purpose                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--hug-duration`                                       | `460ms`                          | The morph.                                                                                                                                                                                                                                             |
| `--hug-easing`                                         | `cubic-bezier(0.22, 1, 0.36, 1)` | The morph's easing.                                                                                                                                                                                                                                    |
| `--hug-duration-fast`                                  | `300ms`                          | Radius, shadow and backdrop.                                                                                                                                                                                                                           |
| `--hug-duration-content`                               | `260ms`                          | Content growth and the resize settle.                                                                                                                                                                                                                  |
| `--hug-easing-content`                                 | `cubic-bezier(0.33, 1, 0.68, 1)` | The easing for content growth.                                                                                                                                                                                                                         |
| `--hug-radius`                                         | `14px`                           | Inline corner radius.                                                                                                                                                                                                                                  |
| `--hug-radius-expanded`                                | `0`                              | Corner radius once expanded; `0` gives the chromeless edge-to-edge look.                                                                                                                                                                               |
| `--hug-border-width`                                   | `1px`                            | The hairline drawn as an inset ring, so it never eats layout.                                                                                                                                                                                          |
| `--hug-shadow`                                         | a two-part soft shadow           | Inline elevation.                                                                                                                                                                                                                                      |
| `--hug-shadow-expanded`                                | `none`                           | Elevation once expanded.                                                                                                                                                                                                                               |
| `--hug-initial-height`                                 | `240px`                          | The height shown before the framed document first reports. The engine sets it; overriding it changes only the first paint.                                                                                                                             |
| `--hug-z-index`                                        | `1000000000`                     | The expanded frame's stacking level. Kept to few significant digits deliberately: CSS minifiers, including the Lightning CSS that Vite builds with, round longer numeric literals, which would silently disagree with the exported `HUGFRAME_Z_INDEX`. |
| `--hug-surface`                                        | light: `#ffffff`                 | The frame's own background, so a box that is momentarily larger than the frame never shows the page through it.                                                                                                                                        |
| `--hug-line`                                           | light: `#dfe3ea`                 | Hairline borders and dividers.                                                                                                                                                                                                                         |
| `--hug-text`                                           | light: `#14171f`                 | The frame's text colour.                                                                                                                                                                                                                               |
| `--hug-accent`                                         | `#4b46e0`                        | The focus ring.                                                                                                                                                                                                                                        |
| `--hug-focus-ring-width`                               | `2px`                            | Focus ring width, on both the frame and the collapse control.                                                                                                                                                                                          |
| `--hug-focus-ring-offset`                              | `-2px`                           | Focus ring offset on the frame, drawn inside it so a clipped box still shows it.                                                                                                                                                                       |
| `--hug-backdrop`                                       | light: `rgb(12 15 24 / 44%)`     | The scrim behind the expanded frame.                                                                                                                                                                                                                   |
| `--hug-backdrop-blur`                                  | `12px`                           | Blur applied to that scrim.                                                                                                                                                                                                                            |
| `--hug-backdrop-saturate`                              | `0.82`                           | Saturation applied to that scrim.                                                                                                                                                                                                                      |
| `--hug-glass`, `--hug-glass-hover`, `--hug-glass-line` | light translucent whites         | The expanded view's floating collapse control.                                                                                                                                                                                                         |
| `--hug-collapse-offset`                                | `14px`                           | Inset of that control from the safe-area edges.                                                                                                                                                                                                        |
| `--hug-collapse-size`                                  | `40px`                           | Its width and height.                                                                                                                                                                                                                                  |
| `--hug-collapse-radius`                                | `999px`                          | Its corner radius; `999px` makes a pill.                                                                                                                                                                                                               |
| `--hug-collapse-border-width`                          | `1px`                            | Its border width.                                                                                                                                                                                                                                      |
| `--hug-collapse-z-index`                               | `2`                              | Its stacking level inside the frame.                                                                                                                                                                                                                   |
| `--hug-collapse-blur`                                  | `10px`                           | Its own glass blur.                                                                                                                                                                                                                                    |
| `--hug-collapse-saturate`                              | `1.1`                            | Its own glass saturation.                                                                                                                                                                                                                              |
| `--hug-collapse-press-scale`                           | `0.94`                           | How far it shrinks while pressed.                                                                                                                                                                                                                      |
| `--hug-collapse-focus-ring-offset`                     | `2px`                            | Focus ring offset on the control, drawn outside it.                                                                                                                                                                                                    |

Every token has a dark-theme value under `prefers-color-scheme: dark`. Every visual value in the stylesheet is reachable this way, and each one maps one-to-one onto a prop a wrapper can forward; values that are structural rather than visual — `position`, `display`, `inset: 0`, `width`/`height: 100%`, `overflow`, `cursor`, `pointer-events`, the `opacity` and `visibility` show/hide states, and the transition property lists — are deliberately not tokens. `test/tokens.test.js` fails if a visual value is hardcoded, or if a token is declared that nothing reads.

## Layout rules for credible framing

1. Never use `vh`/`dvh`/`vw` on the axis the host controls while content-sized. A `min-height: 100vh` in inline mode makes the frame report the viewport height, the host grows the frame, and the content grows again — a resize loop.
2. Do not give the framed document's `html` or `body` a `height: 100%`.
3. Use container queries, not media queries, inside the framed document: its width has nothing to do with the viewport.

## Constraints worth knowing

1. The framed document is never remounted by a mode change, so its state survives the morph. Moving the frame in the DOM is different: that detaches and re-inserts it, and the browser destroys the iframe's browsing context, so the framed document reloads. The same iframe node and engine survive and re-sync on the next `ready`, but genuine state preservation across a move needs `Element.moveBefore()`.
2. The expanded view locks document scrolling while it is open, and the lock is ref-counted across frames.
3. `Escape` collapses, focus moves into the framed document on expand and returns to the element that was focused before it, and the expanded box carries `role="dialog"` with `aria-modal`.
