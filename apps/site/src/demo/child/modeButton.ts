import { el, svg } from '@/demo/dom'
import type { HugFrameChild } from 'hugframe/child'

export function createModeButton(child: HugFrameChild): HTMLButtonElement {
  const icon = svg(
    'svg',
    {
      attrs: {
        viewBox: '0 0 20 20',
        width: 15,
        height: 15,
        'aria-hidden': 'true',
        focusable: 'false',
      },
    },
    [
      svg('path', {
        attrs: {
          d: 'M4 12h4v4M8 12l-4 4M16 8h-4V4M12 8l4-4',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.7,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
      }),
    ],
  )

  return el(
    'button',
    {
      class: 'mode-button',
      attrs: { type: 'button', 'aria-label': 'Expand to the full window' },
      on: { click: () => child.requestExpand() },
    },
    [icon, el('span', { text: 'Expand' })],
  )
}
