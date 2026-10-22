import { el } from '@/demo/dom'

const LINE_WIDTHS: readonly number[] = [100, 92, 74, 86, 58]
const CORNERS: readonly string[] = ['tl', 'tr', 'bl', 'br']

// Placeholder shapes stand in for a document: no copy, no controls, nothing that
// reads as a product.
export function wireCard(): HTMLElement {
  const lines = LINE_WIDTHS.map((width) =>
    el('span', { class: 'wire-line', attrs: { style: `width:${width}%` } }),
  )
  return el('div', { class: 'wire-card', attrs: { 'aria-hidden': 'true' } }, [
    el('span', { class: 'wire-card__title' }),
    el('div', { class: 'wire-lines' }, lines),
  ])
}

export function wireFrame(): HTMLElement {
  const corners = CORNERS.map((corner) =>
    el('span', { class: `wire-frame__corner wire-frame__corner--${corner}` }),
  )
  return el('div', { class: 'wire-frame', attrs: { 'aria-hidden': 'true' } }, [
    el('span', { class: 'wire-frame__inner' }),
    ...corners,
  ])
}

export function growBlock(): HTMLElement {
  return el('div', { class: 'block', attrs: { 'aria-hidden': 'true' } }, [
    el('span', { class: 'block__box' }),
    el('span', { class: 'block__lines' }, [
      el('span', { class: 'block__line' }),
      el('span', { class: 'block__line block__line--short' }),
    ]),
  ])
}
