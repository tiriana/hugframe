import { el } from '@/demo/dom'
import type { HugFrameChild } from 'hugframe/child'
import type { HugFrameMode } from 'hugframe'
import { createModeButton } from './modeButton'
import { growBlock, wireCard, wireFrame } from './wire'

export interface DocAppHost {
  framed: boolean
  child: HugFrameChild
}

export interface DocApp {
  readonly root: HTMLElement
  render(mode: HugFrameMode): void
  grow(): void
}

const MAX_BLOCKS = 8

export function createDoc(host: DocAppHost): DocApp {
  const modeButton = createModeButton(host.child)

  const appBar = el('header', { class: 'app-bar' }, [
    el('div', { class: 'app-bar__identity' }, [
      el('span', { class: 'app-bar__glyph', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'app-bar__name', text: 'iframe' }),
      el('span', { class: 'app-bar__meta', text: 'a document in a frame' }),
    ]),
    modeButton,
  ])

  const more = el('div', { class: 'doc__more' })
  const contentPanel = el(
    'section',
    { class: 'panel panel--content', attrs: { 'aria-label': 'Document content' } },
    [
      wireCard(),
      el('div', { class: 'wire-media', attrs: { 'aria-hidden': 'true' } }),
      more,
      tag('content'),
    ],
  )
  const framePanel = el(
    'section',
    { class: 'panel panel--frame', attrs: { 'aria-label': 'Frame boundary' } },
    [wireFrame(), tag('frame')],
  )
  const split = el('div', { class: 'doc__split' }, [framePanel, contentPanel])

  const body = el('div', { class: 'doc__body' }, [
    el('p', { class: 'doc__say', text: 'This is in an iframe' }),
    split,
  ])

  const input = el('input', {
    class: 'doc__input',
    attrs: { type: 'text', id: 'doc-state', placeholder: 'Type here, then expand and collapse' },
  })
  const field = el('div', { class: 'doc__field' }, [
    el('label', {
      class: 'doc__label',
      attrs: { for: 'doc-state' },
      text: 'What you type stays put.',
    }),
    input,
  ])

  const root = el('div', { class: 'doc', dataset: { mode: 'inline' } }, [appBar, body, field])

  let aside: HTMLElement | null = null

  function render(mode: HugFrameMode): void {
    const expanded = mode === 'expanded'
    root.dataset.mode = mode

    if (host.framed && !expanded) {
      if (modeButton.parentElement !== appBar) appBar.append(modeButton)
    } else {
      modeButton.remove()
    }

    renderAside(expanded)
  }

  function renderAside(expanded: boolean): void {
    if (!expanded) {
      aside?.remove()
      aside = null
      return
    }
    if (aside) return
    const cells = Array.from({ length: 6 }, () => el('span', { class: 'wire-cell' }))
    aside = el('aside', { class: 'panel panel--extra', attrs: { 'aria-label': 'Outline' } }, [
      el('div', { class: 'wire-grid', attrs: { 'aria-hidden': 'true' } }, cells),
      tag('outline'),
    ])
    split.append(aside)
  }

  function grow(): void {
    if (more.childElementCount >= MAX_BLOCKS) return
    more.append(growBlock())
  }

  return { root, render, grow }
}

function tag(label: string): HTMLElement {
  return el('span', { class: 'panel__tag', text: label })
}
