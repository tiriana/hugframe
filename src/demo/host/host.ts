import { el } from '@/demo/dom'
import { createHugFrame } from '@/lib/core'
import type { HugFrameMode } from '@/lib/protocol'
import chromeHtml from '@/site/chrome.html?raw'

type HugFrameInstance = ReturnType<typeof createHugFrame>
type ColumnCount = 1 | 2 | 3
type CollapseStyle = 'default' | 'custom' | 'hidden'

const BASE_URL = import.meta.env.BASE_URL
const CHILD_SRC = `${BASE_URL}child.html`
const STATUS_SRC = `${BASE_URL}child.html?view=status`
const FIXED_HEIGHT = 'clamp(280px, 42vh, 460px)'

const COLUMNS: readonly ColumnCount[] = [1, 2, 3]
const COLLAPSE_STYLES: readonly CollapseStyle[] = ['default', 'custom', 'hidden']
const COLLAPSE_LABELS: Record<CollapseStyle, string> = {
  default: 'Default',
  custom: 'Custom icon',
  hidden: 'Hidden',
}
const COLUMN_WIDTHS: Record<ColumnCount, { frame: string; side: string; gap: string }> = {
  1: { frame: '34%', side: 'calc(66% - 20px)', gap: '20px' },
  2: { frame: '62%', side: 'calc(38% - 20px)', gap: '20px' },
  3: { frame: '100%', side: '0px', gap: '0px' },
}

interface MeterItem {
  root: HTMLElement
  label: HTMLElement
  value: HTMLElement
}

function meterItem(label: string): MeterItem {
  const labelEl = el('span', { class: 'meterbar__label', text: label })
  const valueEl = el('span', { class: 'meterbar__value' })
  return {
    root: el('span', { class: 'meterbar__item' }, [labelEl, valueEl]),
    label: labelEl,
    value: valueEl,
  }
}

function protocolRow(term: string, description: string): HTMLElement {
  return el('div', { class: 'protocol__row' }, [
    el('dt', {}, [el('code', { text: term })]),
    el('dd', { text: description }),
  ])
}

// The chrome links are absolute, built from Vite's base URL: `/` in dev, `/hugframe/`
// when deployed. Both pages share this markup; only the tokens and the current-section
// marker differ.
function siteChrome(): { header: Element; footer: Element } {
  const markup = chromeHtml
    .replaceAll('{{home}}', BASE_URL)
    .replaceAll('{{api}}', `${BASE_URL}api/`)
    .replaceAll('{{demo-current}}', ' aria-current="page"')
    .replaceAll('{{api-current}}', '')

  const template = document.createElement('template')
  template.innerHTML = markup
  const header = template.content.querySelector('header')
  const footer = template.content.querySelector('footer')

  if (!header || !footer) throw new Error('site chrome is missing its header or footer')

  return { header, footer }
}

export function mountHost(container: HTMLElement): void {
  let columns: ColumnCount = 2
  let fixedHeight = false
  let collapseStyle: CollapseStyle = 'default'
  let measured: number | null = null
  let ready = false
  let primaryMode: HugFrameMode = 'inline'
  let phase = 'idle'
  let sizing = 'content'
  let secondary: HugFrameInstance | null = null

  const primaryMount = el('div')
  const statusMount = el('div')

  const heightItem = meterItem('content height')
  const modeItem = meterItem('mode')
  const phaseItem = meterItem('phase')
  const sizingItem = meterItem('sizing')
  const readyItem = meterItem('status')
  const meterbar = el('div', { class: 'meterbar', attrs: { 'aria-live': 'polite' } }, [
    heightItem.root,
    modeItem.root,
    phaseItem.root,
    sizingItem.root,
    readyItem.root,
  ])

  const heightRow = el('div', { class: 'controls' }, [
    el('span', { class: 'controls__label', text: 'Frame height' }),
  ])
  const collapseRow = el('div', { class: 'controls' }, [
    el('span', { class: 'controls__label', text: 'Collapse control' }),
  ])
  const driveRow = el('div', { class: 'controls' }, [
    el('span', { class: 'controls__label', text: 'Drive the framed app' }),
  ])

  const segmentedBox = el('div', {
    class: 'segmented',
    attrs: { role: 'group', 'aria-label': 'Page columns' },
  })
  const headControls = el('div', { class: 'head-controls' }, [segmentedBox])

  const workbenchHead = el('div', { class: 'workbench__head' }, [
    el('div', {}, [
      el('h2', { text: 'Threads workspace' }),
      el('p', {
        class: 'workbench__note',
        text: 'Change the page columns and the frame glides into its new width.',
      }),
    ]),
    headControls,
  ])

  const layout = el('div', { class: 'layout' })
  const framePanel = el('div', { class: 'frame-panel' }, [
    primaryMount,
    meterbar,
    heightRow,
    collapseRow,
    driveRow,
  ])

  const statusHead = el('div', { class: 'side-card__head' }, [el('h3', { text: 'Service status' })])
  const sidePanel = el('aside', { class: 'side-panel' }, [
    el('div', { class: 'side-card' }, [
      statusHead,
      el('p', {
        class: 'side-card__note',
        text: 'A second frame on the same page. Only one opens at a time.',
      }),
      statusMount,
    ]),
    el('div', { class: 'side-card' }, [
      el('h3', { text: 'Several frames, one window' }),
      el('p', {
        class: 'side-card__note',
        text: 'Expanding either frame collapses the other. Both keep their state, because neither iframe is ever remounted.',
      }),
    ]),
  ])

  layout.append(framePanel, sidePanel)

  const workbench = el('section', { class: 'workbench', attrs: { id: 'workspace' } }, [
    workbenchHead,
    layout,
  ])

  const main = el('main', {}, [
    el('section', { class: 'lead', attrs: { id: 'top' } }, [
      el('p', { class: 'eyebrow', text: 'Embedded app windows' }),
      el('h1', { text: 'An iframe that fits its content, then opens into the whole window.' }),
      el('p', {
        class: 'lead__body',
        text: 'The framed document reports its own height, so the host wraps it exactly. Let the host drive the height instead and the frame becomes a fixed window the app scrolls inside. Either way it morphs into a chromeless full-window view and back without reloading.',
      }),
    ]),
    workbench,
    el('section', { class: 'how', attrs: { id: 'how' } }, [
      el('h2', { text: 'How it works' }),
      el('p', { class: 'how__body' }, [
        'The child document runs ',
        el('code', { text: 'createHugFrameChild()' }),
        ' and speaks a small message protocol with the host. The host sizes the frame, tells the child which mode it is in, and tells it whether the host is hugging its content or driving the height.',
      ]),
      el('dl', { class: 'protocol' }, [
        protocolRow('ready', 'The child loaded and attached its listeners.'),
        protocolRow('size', 'Measured height and width, reported on every content change.'),
        protocolRow('request', "Expand, collapse, or close, from the child's own controls."),
        protocolRow('mode', 'Inline or expanded, so the child adapts its own layout.'),
        protocolRow(
          'sizing',
          'Content-hugging or a host-driven height, so the child knows who is in charge.',
        ),
      ]),
    ]),
  ])
  const page = el('div', { class: 'page' }, [main])
  const { header, footer } = siteChrome()

  container.append(header, page, footer)

  const primary = createHugFrame({
    container: primaryMount,
    src: CHILD_SRC,
    title: 'Threads workspace',
    minHeight: 220,
    maxHeight: 880,
    initialHeight: 380,
    height: 'content',
    onReady: () => {
      ready = true
      render()
    },
    onModeChange: (mode) => {
      primaryMode = mode
      if (mode === 'expanded') secondary?.collapse()
      render()
    },
    onPhaseChange: (next) => {
      phase = next
      render()
    },
    onSizingChange: (next) => {
      sizing = next
      render()
    },
  })

  secondary = createHugFrame({
    container: statusMount,
    src: STATUS_SRC,
    title: 'Service status',
    minHeight: 160,
    maxHeight: 460,
    initialHeight: 220,
    onModeChange: (mode) => {
      if (mode === 'expanded') primary.collapse()
    },
  })

  primaryMode = primary.getMode()
  phase = primary.getPhase()
  sizing = primary.getSizing()

  const segmentedItems = COLUMNS.map((count) => ({
    count,
    element: el('button', {
      class: 'segmented__btn',
      attrs: { type: 'button' },
      text: `${count} col`,
      on: {
        click: () => {
          columns = count
          render()
        },
      },
    }),
  }))
  for (const item of segmentedItems) segmentedBox.append(item.element)

  const headExpand = el('button', {
    class: 'btn btn--primary',
    attrs: { type: 'button' },
    text: 'Expand',
    on: { click: () => primary.expand() },
  })
  headControls.append(headExpand)

  const hugButton = el('button', {
    class: 'btn',
    attrs: { type: 'button' },
    text: 'Hug content',
    on: {
      click: () => {
        fixedHeight = false
        applyHeight()
        render()
      },
    },
  })
  const fixedButton = el('button', {
    class: 'btn',
    attrs: { type: 'button' },
    text: 'Fixed height',
    on: {
      click: () => {
        fixedHeight = true
        applyHeight()
        render()
      },
    },
  })
  heightRow.append(hugButton, fixedButton)

  const collapseItems = COLLAPSE_STYLES.map((style) => ({
    style,
    element: el('button', {
      class: 'btn',
      attrs: { type: 'button' },
      text: COLLAPSE_LABELS[style],
      on: {
        click: () => {
          collapseStyle = style
          applyCollapse()
          render()
        },
      },
    }),
  }))
  for (const item of collapseItems) collapseRow.append(item.element)

  const statusExpand = el('button', {
    class: 'btn',
    attrs: { type: 'button' },
    text: 'Expand',
    on: { click: () => secondary?.expand() },
  })
  statusHead.append(statusExpand)

  const driveActions: ReadonlyArray<{ label: string; payload: unknown }> = [
    { label: 'Add a thread', payload: { action: 'add-thread' } },
    { label: 'Remove a thread', payload: { action: 'remove-thread' } },
    { label: 'Open a thread', payload: { action: 'select-thread' } },
  ]
  for (const action of driveActions) {
    driveRow.append(
      el('button', {
        class: 'btn',
        attrs: { type: 'button' },
        text: action.label,
        on: { click: () => primary.sendMessage(action.payload) },
      }),
    )
  }

  function applyHeight(): void {
    primary.update({ height: fixedHeight ? FIXED_HEIGHT : 'content' })
  }

  function applyCollapse(): void {
    primary.update({
      collapseIcon:
        collapseStyle === 'custom'
          ? el('span', { attrs: { 'aria-hidden': 'true' }, text: '×' })
          : undefined,
      renderCollapse: collapseStyle === 'hidden' ? null : undefined,
    })
  }

  function render(): void {
    const widths = COLUMN_WIDTHS[columns]
    layout.style.setProperty('--frame-w', widths.frame)
    layout.style.setProperty('--side-w', widths.side)
    layout.style.setProperty('--side-gap', widths.gap)
    layout.dataset.cols = String(columns)

    for (const item of segmentedItems) {
      const active = item.count === columns
      item.element.classList.toggle('is-active', active)
      item.element.setAttribute('aria-pressed', active ? 'true' : 'false')
    }

    hugButton.classList.toggle('btn--primary', !fixedHeight)
    hugButton.setAttribute('aria-pressed', fixedHeight ? 'false' : 'true')
    fixedButton.classList.toggle('btn--primary', fixedHeight)
    fixedButton.setAttribute('aria-pressed', fixedHeight ? 'true' : 'false')

    for (const item of collapseItems) {
      const active = item.style === collapseStyle
      item.element.classList.toggle('btn--primary', active)
      item.element.setAttribute('aria-pressed', active ? 'true' : 'false')
    }

    heightItem.label.textContent = sizing === 'fixed' ? 'frame height' : 'content height'
    heightItem.value.textContent = measured === null ? 'measuring' : `${measured}px`
    modeItem.value.textContent = primaryMode
    phaseItem.value.textContent = phase
    phaseItem.value.className = phase === 'idle' ? 'pill pill--ok' : 'pill pill--busy'
    sizingItem.value.textContent = sizing
    readyItem.value.textContent = ready ? 'ready' : 'waiting'
    readyItem.value.className = ready ? 'pill pill--ok' : 'pill pill--wait'
  }

  const iframe = primary.getIframe()
  if (iframe) {
    const observer = new ResizeObserver(() => {
      measured = Math.round(iframe.getBoundingClientRect().height)
      render()
    })
    observer.observe(iframe)
  }

  render()
}
