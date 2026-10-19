import { clear, el } from '@/demo/dom'
import type { HugFrameChild } from '@/lib/child'
import type { HugFrameMode } from '@/lib/protocol'
import { SERVICES, type ServiceState } from './data'
import { createModeButton } from './modeButton'

export interface StatusAppHost {
  framed: boolean
  child: HugFrameChild
}

export interface StatusApp {
  readonly root: HTMLElement
  render(mode: HugFrameMode): void
}

const STATE_LABEL: Record<ServiceState, string> = {
  ok: 'Operational',
  warn: 'Degraded',
  down: 'Down',
}

const INCIDENTS: ReadonlyArray<{ title: string; when: string; state: ServiceState }> = [
  { title: 'Mail delivery timeouts', when: 'Opened 24m ago', state: 'down' },
  { title: 'Queue backlog above threshold', when: 'Opened 1h ago', state: 'warn' },
  { title: 'Replica lag recovered', when: 'Resolved yesterday', state: 'ok' },
]

export function createStatusApp(host: StatusAppHost): StatusApp {
  let sideCol: HTMLDivElement | null = null

  const modeButton = createModeButton(host.child)
  const degraded = SERVICES.filter((service) => service.state !== 'ok').length
  const appBar = el('header', { class: 'app-bar' }, [
    el('div', { class: 'app-bar__identity' }, [
      el('span', { class: 'app-bar__name', text: 'Service status' }),
      el('span', {
        class: 'app-bar__meta',
        text: degraded === 0 ? 'all systems normal' : `${degraded} needing attention`,
      }),
    ]),
    modeButton,
  ])

  const serviceList = el(
    'ul',
    { class: 'service-list', attrs: { 'aria-label': 'Services' } },
    SERVICES.map((service) =>
      el('li', { class: 'service' }, [
        el('span', { class: `dot dot--${service.state}`, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'service__label' }, [
          el('span', { class: 'service__name', text: service.name }),
          el('span', { class: 'service__detail', text: service.detail }),
        ]),
        el('span', { class: 'service__latency', text: service.latency }),
        el('span', {
          class: `service__state service__state--${service.state}`,
          text: STATE_LABEL[service.state],
        }),
      ]),
    ),
  )

  const listCol = el('div', { class: 'list-col' }, [serviceList])
  const workspace = el('div', { class: 'workspace' }, [listCol])
  const root = el('div', { class: 'status-app', dataset: { mode: 'inline', side: 'false' } }, [
    appBar,
    workspace,
  ])

  function buildIncidents(): HTMLElement {
    return el('section', { class: 'incidents', attrs: { 'aria-label': 'Recent incidents' } }, [
      el('h3', { class: 'incidents__title', text: 'Recent incidents' }),
      el(
        'ul',
        { class: 'incidents__list' },
        INCIDENTS.map((incident) =>
          el('li', { class: 'incident' }, [
            el('span', { class: `dot dot--${incident.state}`, attrs: { 'aria-hidden': 'true' } }),
            el('span', { class: 'incident__title', text: incident.title }),
            el('span', { class: 'incident__when', text: incident.when }),
          ]),
        ),
      ),
    ])
  }

  function render(mode: HugFrameMode): void {
    const expanded = mode === 'expanded'
    root.dataset.mode = mode
    root.dataset.side = expanded ? 'true' : 'false'

    if (host.framed && !expanded) {
      if (modeButton.parentElement !== appBar) appBar.append(modeButton)
    } else {
      modeButton.remove()
    }

    if (expanded) {
      if (!sideCol) {
        sideCol = el('div', { class: 'side-col' })
        workspace.append(sideCol)
      }
      clear(sideCol)
      sideCol.append(buildIncidents())
    } else {
      sideCol?.remove()
      sideCol = null
    }
  }

  return { root, render }
}
