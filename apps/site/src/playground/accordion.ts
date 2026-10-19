import { el, svg } from '@/playground/dom'

export interface AccordionItem {
  id: string
  title: string
  /** Shown on the collapsed header, so a closed group still says what is inside it. */
  summary: string
  body: HTMLElement
}

export interface Accordion {
  readonly root: HTMLElement
}

function chevron(): SVGElement {
  return svg(
    'svg',
    {
      class: 'pg-acc__chev',
      attrs: {
        viewBox: '0 0 16 16',
        width: '14',
        height: '14',
        'aria-hidden': 'true',
        focusable: 'false',
      },
    },
    [
      svg('path', {
        attrs: {
          d: 'M6 3.5 10.5 8 6 12.5',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.7',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
      }),
    ],
  )
}

export function createAccordion(items: AccordionItem[]): Accordion {
  let openId: string | null = null
  const triggers: HTMLButtonElement[] = []
  const entries: { id: string; trigger: HTMLButtonElement; panel: HTMLElement }[] = []

  const root = el('div', { class: 'pg-acc' })

  function open(id: string | null): void {
    openId = id
    for (const entry of entries) {
      const expanded = entry.id === openId
      entry.trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      entry.panel.hidden = !expanded
    }
  }

  for (const item of items) {
    const triggerId = `pg-acc-trigger-${item.id}`
    const panelId = `pg-acc-panel-${item.id}`
    const summaryId = `pg-acc-summary-${item.id}`
    const trigger = el(
      'button',
      {
        class: 'pg-acc__trigger',
        attrs: {
          type: 'button',
          id: triggerId,
          // The name stays the group's title; the summary is announced as its description.
          'aria-label': item.title,
          'aria-describedby': summaryId,
          'aria-expanded': 'false',
          'aria-controls': panelId,
        },
        on: { click: () => open(openId === item.id ? null : item.id) },
      },
      [
        el('span', { class: 'pg-acc__row' }, [
          el('span', { class: 'pg-acc__title', text: item.title }),
          chevron(),
        ]),
        el('span', { class: 'pg-acc__summary', attrs: { id: summaryId }, text: item.summary }),
      ],
    )
    const panel = el(
      'div',
      {
        class: 'pg-acc__panel',
        attrs: { id: panelId, role: 'region', 'aria-labelledby': triggerId },
      },
      [item.body],
    )
    panel.hidden = true
    triggers.push(trigger)
    entries.push({ id: item.id, trigger, panel })
    root.append(
      el('section', { class: 'pg-acc__item' }, [
        el('h3', { class: 'pg-acc__heading' }, [trigger]),
        panel,
      ]),
    )
  }

  // Walking the headers with the arrow keys is the disclosure pattern's keyboard contract.
  root.addEventListener('keydown', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const trigger = target.closest<HTMLButtonElement>('.pg-acc__trigger')
    if (!trigger) return
    const index = triggers.indexOf(trigger)
    if (index === -1) return
    const last = triggers.length - 1
    let next = -1
    if (event.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === -1) return
    event.preventDefault()
    triggers[next]?.focus()
  })

  return { root }
}
