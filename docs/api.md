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

| Option                | Type                                                               | Default          | Notes                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container`           | `HTMLElement`                                                      | —                | Required. The engine renders its own tree into this element.                                                                                                                                                                    |
| `src`                 | `string`                                                           | —                | Required. The framed document.                                                                                                                                                                                                  |
| `title`               | `string`                                                           | —                | Required. Labels the iframe, and names the dialog when expanded.                                                                                                                                                                |
| `targetOrigin`        | `string`                                                           | current origin   | Origin expected from the framed document. `'*'` skips the check.                                                                                                                                                                |
| `initialMode`         | `'inline' \| 'expanded'`                                           | `'inline'`       | The engine owns its mode; a host changes it with `expand()` / `collapse()`.                                                                                                                                                     |
| `height`              | `'content' \| number \| string`                                    | `'content'`      | `'content'` hugs the framed document; a number is px; any other string is used verbatim, so `'60vh'` and `'clamp(280px, 45vh, 460px)'` both work. Inline only — expanded always fills.                                          |
| `minHeight`           | `number`                                                           | `0`              | Inline-mode floor, px.                                                                                                                                                                                                          |
| `maxHeight`           | `number`                                                           | `720`            | Inline-mode ceiling, px.                                                                                                                                                                                                        |
| `initialHeight`       | `number`                                                           | `240`            | Inline-mode height before the framed document first reports.                                                                                                                                                                    |
| `collapseIcon`        | `Node \| string`                                                   | a built-in glyph | Replaces the glyph inside the default expanded-mode control.                                                                                                                                                                    |
| `renderCollapse`      | `((handle: HugFrameCollapseHandle) => Node) \| null`               | —                | Replaces the whole expanded-mode control. Receives `{ collapse }`. `null` hides it, which is how you drive collapsing from your own chrome.                                                                                     |
| `className`           | `string`                                                           | —                | Added to the root element, so `--hug-*` tokens set here win.                                                                                                                                                                    |
| `style`               | `Partial<CSSStyleDeclaration>`                                     | —                | Applied to the root element.                                                                                                                                                                                                    |
| `iframeProps`         | `Record<string, string \| number \| boolean \| null \| undefined>` | —                | Attributes applied to the created iframe.                                                                                                                                                                                       |
| `resizeSettleMs`      | `number`                                                           | `120`            | Width quiescence, ms, the `resizing` phase waits for before settling onto the newly reported height.                                                                                                                            |
| `resizeSafetyMs`      | `number`                                                           | `400`            | Ceiling, ms, on that wait.                                                                                                                                                                                                      |
| `resizeWidthEpsilon`  | `number`                                                           | `1`              | Width change, px, at or below which a layout change is not treated as a resize.                                                                                                                                                 |
| `morphSettleMarginMs` | `number`                                                           | `90`             | Margin, ms, added to the morph duration for the `transitionend` fallback timer.                                                                                                                                                 |
| `expandedWidth`       | `string`                                                           | `'100vw'`        | Width written on the box once expanded.                                                                                                                                                                                         |
| `expandedHeight`      | `string`                                                           | `'100dvh'`       | Height written on the box once expanded.                                                                                                                                                                                        |
| `lockScroll`          | `boolean`                                                          | `true`           | Ref-counted document scroll lock while expanded.                                                                                                                                                                                |
| `manageFocus`         | `boolean`                                                          | `true`           | Move focus into the framed document on expand and return it to the previously focused element on collapse.                                                                                                                      |
| `collapseOnEscape`    | `boolean`                                                          | `true`           | `Escape` in the host document collapses the frame. A framed document that handles `Escape` itself and calls `requestCollapse()` is making an explicit request rather than pressing this shortcut, so it is honoured either way. |
| `onModeChange`        | `(mode: HugFrameMode) => void`                                     | —                | Fires on every mode change, including ones the framed document requested.                                                                                                                                                       |
| `onPhaseChange`       | `(phase: HugFramePhase) => void`                                   | —                | Fires on phase transitions only, not on every frame.                                                                                                                                                                            |
| `onSizingChange`      | `(sizing: HugFrameSizing) => void`                                 | —                | Fires when the sizing mode actually changes.                                                                                                                                                                                    |
| `onReady`             | `() => void`                                                       | —                | The framed document has loaded and announced itself with `ready`.                                                                                                                                                               |
| `onRequestClose`      | `() => void`                                                       | —                | The framed document asked to be closed. Unmounting is the host's decision; the engine never removes itself.                                                                                                                     |
| `onMessage`           | `(payload: unknown) => void`                                       | —                | Arbitrary payload sent from the framed document with `sendMessage()`.                                                                                                                                                           |

### Instance

| Member                 | Type                                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `element`              | `HTMLElement` (read-only)                             | The root the engine rendered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `expand()`             | `void`                                                | Morphs to the full-window view.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `collapse()`           | `void`                                                | Returns to the inline slot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `toggle()`             | `void`                                                | Whichever of the two applies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sendMessage(payload)` | `void`                                                | Posts a `custom` message to the framed document.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `update(next)`         | `void`                                                | Merges the options and re-applies what depends on them, without remounting the frame. Options read at use time — `targetOrigin`, the `on*` callbacks, `resizeSettleMs`, `resizeSafetyMs`, `resizeWidthEpsilon` and `morphSettleMarginMs` — take effect immediately; `src`, `title`, `height`, `minHeight`, `maxHeight`, `initialHeight`, `collapseIcon`, `renderCollapse`, `className`, `style` and `iframeProps` are applied to the live frame; `lockScroll` and `collapseOnEscape` re-apply their live state, `expandedWidth` and `expandedHeight` re-render the expanded box when it is idle, and `initialMode` requests a mode change. |
| `getIframe()`          | `HTMLIFrameElement \| null`                           | The one iframe for the component's lifetime. It is never remounted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `getMode()`            | `'inline' \| 'expanded'`                              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `getPhase()`           | `'idle' \| 'expanding' \| 'collapsing' \| 'resizing'` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `getSizing()`          | `'content' \| 'fixed'`                                | Which of the two is driving the height.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `getZIndex()`          | `number`                                              | The effective `--hug-z-index` on the expanded frame, so a host can layer above it with `getZIndex() + 1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `destroy()`            | `void`                                                | Detaches every listener, observer and timer, releases the scroll lock, and removes the rendered tree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

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
120ms of width quiescence, or 400ms at the latest. Both waits are configurable with `resizeSettleMs` and
`resizeSafetyMs`. With `prefers-reduced-motion: reduce` the phase is skipped entirely and heights are
applied instantly.

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

| Attribute                | Notes                                                           |
| ------------------------ | --------------------------------------------------------------- |
| `src`                    | The framed document.                                            |
| `title`                  | Labels the iframe and names the dialog when expanded.           |
| `target-origin`          | Origin expected from the framed document.                       |
| `mode`                   | Read and write: `inline` or `expanded`. Reflects the live mode. |
| `height`                 | `content`, or a CSS length. A bare number is read as px.        |
| `min-height`             | Inline-mode floor, px.                                          |
| `max-height`             | Inline-mode ceiling, px.                                        |
| `initial-height`         | Inline-mode height before the first report, px.                 |
| `resize-settle-ms`       | Resizing settle delay, ms.                                      |
| `resize-safety-ms`       | Resizing safety ceiling, ms.                                    |
| `resize-width-epsilon`   | Width deadband for treating a layout change as a resize, px.    |
| `morph-settle-margin-ms` | Fallback margin added to the morph duration, ms.                |
| `expanded-width`         | Width written on the box once expanded.                         |
| `expanded-height`        | Height written on the box once expanded.                        |

### Properties

`collapseIcon` (`Node | string`), `renderCollapse` (`((handle) => Node) | null`) and `iframeProps` — the
options that cannot be expressed as attributes. There is deliberately no `collapse-icon` attribute: a glyph
is a `Node` or a string, and the element takes it as a property.

The behaviour switches `lockScroll`, `manageFocus` and `collapseOnEscape` are properties too, defaulting to
`true`. A boolean attribute's absence-versus-`false` semantics is a trap, so there are no corresponding
attributes. Every numeric and string knob above — `resizeSettleMs`, `resizeSafetyMs`, `resizeWidthEpsilon`,
`morphSettleMarginMs`, `expandedWidth` and `expandedHeight` — is attribute-backed and also readable and
writable as a property of the same name.

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

| Option           | Type                               | Default                    | Notes                                                           |
| ---------------- | ---------------------------------- | -------------------------- | --------------------------------------------------------------- |
| `targetOrigin`   | `string`                           | `'*'` (no check)           | Origin expected from the host.                                  |
| `sizeSelector`   | `string`                           | `document.documentElement` | Element whose box height drives the frame.                      |
| `offsetHeight`   | `number`                           | `0`                        | Constant px added to every reported height.                     |
| `reportEpsilon`  | `number`                           | `0.5`                      | Px deadband below which a measured size change is not reported. |
| `onMessage`      | `(payload: unknown) => void`       | —                          | Arbitrary payload sent from the host.                           |
| `onModeChange`   | `(mode: HugFrameMode) => void`     | —                          | The host entered `inline` or `expanded`.                        |
| `onSizingChange` | `(sizing: HugFrameSizing) => void` | —                          | The host started driving the height, or went back to content.   |

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

## Appearance: parts, state attributes and the layered stylesheet

The appearance API is three things: the four colour custom properties, the three
engine-coupled custom properties, and the stable `data-hug-part` hooks on every
element the engine generates. Every other visual value is a plain literal in the
rule that already used it, and the whole stylesheet is wrapped in
`@layer hugframe`.

### Custom properties

Set them on the root element — directly, or through `className`/`style`.

| Token                  | Default                          | Kept because                                                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hug-z-index`        | `1000000000`                     | The engine reads it in `getZIndex()`, and the exported `HUGFRAME_Z_INDEX` must match it. Kept to few significant digits deliberately: CSS minifiers, including the Lightning CSS that Vite builds with, round longer numeric literals, which would silently disagree with the export. |
| `--hug-initial-height` | `240px`                          | The engine writes it on every height update, before the framed document first reports.                                                                                                                                                                                                |
| `--hug-duration`       | `460ms`                          | The engine reads it to size the morph's `transitionend` fallback, and the morph transitions read it too, so one value drives both.                                                                                                                                                    |
| `--hug-surface`        | light `#ffffff` / dark `#171a20` | The frame's own background, so a box that is momentarily larger than the frame never shows the page through it.                                                                                                                                                                       |
| `--hug-text`           | light `#14171f` / dark `#ececea` | The frame's text colour, and the collapse glyph through `currentColor`.                                                                                                                                                                                                               |
| `--hug-line`           | light `#dfe3ea` / dark `#2b2f38` | Hairline borders and dividers.                                                                                                                                                                                                                                                        |
| `--hug-accent`         | light `#4b46e0` / dark `#9b94ff` | The focus ring.                                                                                                                                                                                                                                                                       |

The four colour tokens carry a library-owned light/dark pair and are the documented
colour path; the other three are coupled to the engine. These seven are the entire
token surface.

### Parts

Every element the engine generates carries a `data-hug-part` attribute. It is the
documented selector contract; the `.hug-*` classes remain on the same nodes, but new
CSS should key off the part.

| Part            | Element                                                          |
| --------------- | ---------------------------------------------------------------- |
| `root`          | The outer element the engine renders.                            |
| `backdrop`      | The scrim behind the expanded frame.                             |
| `box`           | The clipped box that holds the frame.                            |
| `frame`         | The `<iframe>`.                                                  |
| `collapse`      | The library-owned slot that positions the expanded-mode control. |
| `collapse-icon` | The built-in collapse glyph.                                     |

The node inside the `collapse` slot is not the library's: it is the built-in button,
or whatever `renderCollapse` returned (and nothing at all for `renderCollapse: null`).
The slot owns where the control sits; the node owns what it is.

State attributes sit on the root and are the other half of the contract: `data-mode`
(`inline` / `expanded`), `data-phase` (`idle` / `expanding` / `collapsing` /
`resizing`), `data-sizing` (`content` / `fixed`) and `data-ready`. The framed
document receives `data-hug-sizing` on its own root.

### `@layer` and overriding

The whole stylesheet ships inside `@layer hugframe { … }`. An unlayered consumer rule
therefore beats it whatever its specificity, so a consumer can override the expanded
state with a plain rule and no `!important`: a `.hug-box { … }` in your own stylesheet
wins over the library's `.hug-root[data-mode='expanded'] .hug-box`.

### Example: restyling the collapse control

The slot keeps the control's position; restyle the node inside it with ordinary,
unlayered CSS:

```css
/* your stylesheet */
[data-hug-part='collapse'] .hug-collapse {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #111;
  color: #fff;
}
```

## Layout rules for credible framing

1. Never use `vh`/`dvh`/`vw` on the axis the host controls while content-sized. A `min-height: 100vh` in inline mode makes the frame report the viewport height, the host grows the frame, and the content grows again — a resize loop.
2. Do not give the framed document's `html` or `body` a `height: 100%`.
3. Use container queries, not media queries, inside the framed document: its width has nothing to do with the viewport.

## Constraints worth knowing

1. The framed document is never remounted by a mode change, so its state survives the morph. Moving the frame in the DOM is different: that detaches and re-inserts it, and the browser destroys the iframe's browsing context, so the framed document reloads. The same iframe node and engine survive and re-sync on the next `ready`, but genuine state preservation across a move needs `Element.moveBefore()`.
2. The expanded view locks document scrolling while it is open, and the lock is ref-counted across frames. `lockScroll: false` opts a frame out.
3. `Escape` collapses, focus moves into the framed document on expand and returns to the element that was focused before it, and the expanded box carries `role="dialog"` with `aria-modal`. The first two are switchable with `collapseOnEscape` and `manageFocus`; the dialog semantics are not, and are an accessibility contract rather than a preference.
