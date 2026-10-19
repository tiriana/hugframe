# @hugframe/react

React bindings for [hugframe](https://github.com/tiriana/hugframe/tree/main/packages/hugframe) — an iframe
that hugs its content, then morphs into a chromeless full-window view.

React 18 and 19 both work, on the client and during a server render. The package ships ESM, CommonJS and
its own types.

## Install

```sh
npm install @hugframe/react hugframe
```

`react` is a peer dependency, so it stays yours.

## Use

```tsx
import { useRef } from 'react'
import { HugFrame, type HugFrameHandle } from '@hugframe/react'
import 'hugframe/css'

export function Embed() {
  const frame = useRef<HugFrameHandle>(null)

  return (
    <>
      <HugFrame ref={frame} src="/embedded.html" title="Embedded app" />
      <button onClick={() => frame.current?.expand()}>Expand</button>
    </>
  )
}
```

`HugFrame` takes every option `createHugFrame` takes except `container`, under the same name and with the
same meaning. The ref is the frame instance, so `expand()`, `collapse()`, `toggle()`, `sendMessage()`,
`getMode()` and `update()` behave exactly as the [API reference](https://tiriana.github.io/hugframe/api/)
describes.

`className` and `style` are the engine's options, so they style the frame itself. The component renders a
plain `<div>` to mount the frame into; wrap it if you want to place it in a layout.

## Reading the frame's state

Anything rendered as a child of `HugFrame` sits in the frame's context and can subscribe to it:

```tsx
import { HugFrame, useHugFrameMode } from '@hugframe/react'

function Status() {
  const mode = useHugFrameMode()
  return <span>{mode === 'expanded' ? 'Full window' : 'Inline'}</span>
}

export function Embed() {
  return (
    <HugFrame src="/embedded.html" title="Embedded app">
      <Status />
    </HugFrame>
  )
}
```

1. `useHugFrame()` — the frame instance, or null during the first render.
2. `useHugFrameMode()` — `'inline'` or `'expanded'`.
3. `useHugFramePhase()` — `'idle'`, `'expanding'`, `'collapsing'` or `'resizing'`.
4. `useHugFrameSizing()` — `'content'` or `'fixed'`.

Children render beside the frame rather than inside it. `useSyncExternalStore` does the subscribing, so a
reader re-renders only when the value it asked for changes.

## Notes

1. Changing `src` reloads the framed document, exactly as it does in the engine. Every other option is applied in place.
2. Callbacks may be written inline: the latest one is always the one that runs, and a new one never re-creates the frame.
3. On the server the component renders its container and nothing else, and the frame is created in a layout effect, so hydration matches.

## License

MIT.
