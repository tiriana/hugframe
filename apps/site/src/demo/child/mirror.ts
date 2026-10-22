import { el } from '@/demo/dom'
import type { HugFrameChild } from 'hugframe/child'
import type { HugFrameMode } from 'hugframe'
import { createModeButton } from './modeButton'
import { wireCard } from './wire'

export interface MirrorAppHost {
  framed: boolean
  child: HugFrameChild
}

export interface MirrorApp {
  readonly root: HTMLElement
  render(mode: HugFrameMode): void
}

// The demo puts two frames on one page, so the second document is deliberately
// shorter: each frame is exactly as tall as its own content.
export function createMirror(host: MirrorAppHost): MirrorApp {
  const modeButton = createModeButton(host.child)

  const appBar = el('header', { class: 'app-bar' }, [
    el('div', { class: 'app-bar__identity' }, [
      el('span', { class: 'app-bar__glyph', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'app-bar__name', text: 'iframe' }),
      el('span', { class: 'app-bar__meta', text: 'the second frame' }),
    ]),
    modeButton,
  ])

  const body = el('div', { class: 'doc__body' }, [
    el('p', { class: 'doc__say', text: 'This is in an iframe too' }),
    el('section', { class: 'panel panel--content', attrs: { 'aria-label': 'Frame content' } }, [
      wireCard(),
      el('span', { class: 'panel__tag', text: 'content' }),
    ]),
  ])

  const root = el('div', { class: 'mirror', dataset: { mode: 'inline' } }, [appBar, body])

  function render(mode: HugFrameMode): void {
    const expanded = mode === 'expanded'
    root.dataset.mode = mode

    if (host.framed && !expanded) {
      if (modeButton.parentElement !== appBar) appBar.append(modeButton)
    } else {
      modeButton.remove()
    }
  }

  return { root, render }
}
