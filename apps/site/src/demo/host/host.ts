import { el } from '@/demo/dom'
import { createHugFrame } from 'hugframe'
import chromeHtml from '@/site/chrome.html?raw'

type HugFrameInstance = ReturnType<typeof createHugFrame>
type FrameWidth = '1/3' | '2/3' | 'full'

const BASE_URL = import.meta.env.BASE_URL
const CHILD_SRC = `${BASE_URL}child.html`
const SECOND_SRC = `${BASE_URL}child.html?view=second`
const FIXED_HEIGHT = 'clamp(280px, 42vh, 460px)'

const FRAME_WIDTHS: readonly FrameWidth[] = ['1/3', '2/3', 'full']
const WIDTH_SPANS: Record<FrameWidth, { frame: string; side: string; gap: string }> = {
  '1/3': { frame: '34%', side: 'calc(66% - 20px)', gap: '20px' },
  '2/3': { frame: '62%', side: 'calc(38% - 20px)', gap: '20px' },
  full: { frame: '100%', side: '100%', gap: '0px' },
}

const USAGE = `import { createHugFrame } from 'hugframe'
import 'hugframe/css'

const frame = createHugFrame({ container: el, src: '/app.html', title: 'App' })
frame.expand()`

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

function codeBlock(text: string): HTMLElement {
  return el('pre', { class: 'snippet__code' }, [el('code', { text })])
}

// The chrome links are absolute, built from Vite's base URL: `/` in dev, `/hugframe/`
// when deployed. Both pages share this markup; only the tokens and the current-section
// marker differ.
function siteChrome(): { header: Element; footer: Element } {
  const markup = chromeHtml
    .replaceAll('{{home}}', BASE_URL)
    .replaceAll('{{api}}', `${BASE_URL}api/`)
    .replaceAll('{{react}}', `${BASE_URL}react/`)
    .replaceAll('{{demo-current}}', ' aria-current="page"')
    .replaceAll('{{api-current}}', '')
    .replaceAll('{{react-current}}', '')

  const template = document.createElement('template')
  template.innerHTML = markup
  const header = template.content.querySelector('header')
  const footer = template.content.querySelector('footer')

  if (!header || !footer) throw new Error('site chrome is missing its header or footer')

  return { header, footer }
}

export function mountHost(container: HTMLElement): void {
  let frameWidth: FrameWidth = '2/3'
  let fixedHeight = false
  let measured: number | null = null
  let phase = 'idle'
  let sizing = 'content'
  let secondary: HugFrameInstance | null = null

  const primaryMount = el('div')
  const secondMount = el('div')

  const heightItem = meterItem('content height')
  const phaseItem = meterItem('phase')
  const meterbar = el('div', { class: 'meterbar', attrs: { 'aria-live': 'polite' } }, [
    heightItem.root,
    phaseItem.root,
  ])

  const heightRow = el('div', { class: 'controls' }, [
    el('span', { class: 'controls__label', text: 'Frame height' }),
  ])
  const driveRow = el('div', { class: 'controls' }, [
    el('span', { class: 'controls__label', text: 'Drive the framed app' }),
  ])

  const widthLabel = el('span', {
    class: 'controls__label',
    text: 'Frame width',
    attrs: { id: 'frame-width-label' },
  })
  const segmentedBox = el('div', {
    class: 'segmented',
    attrs: { role: 'group', 'aria-labelledby': 'frame-width-label' },
  })
  const headControls = el('div', { class: 'head-controls' }, [widthLabel, segmentedBox])

  const workbenchHead = el('div', { class: 'workbench__head' }, [
    el('div', {}, [
      el('h2', { text: 'The frame' }),
      el('p', {
        class: 'workbench__note',
        text: 'Set the frame width and it glides to the new size.',
      }),
    ]),
    headControls,
  ])

  const layout = el('div', { class: 'layout' })
  const framePanel = el('div', { class: 'frame-panel' }, [
    primaryMount,
    meterbar,
    heightRow,
    driveRow,
  ])

  const secondHead = el('div', { class: 'side-card__head' }, [el('h3', { text: 'A second frame' })])
  const sidePanel = el('aside', { class: 'side-panel' }, [
    el('div', { class: 'side-card' }, [
      secondHead,
      el('p', {
        class: 'side-card__note',
        text: 'A second frame on the same page. Only one opens at a time.',
      }),
      secondMount,
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
      el('h1', { class: 'lead__wordmark', text: 'hugframe' }),
      el('p', {
        class: 'lead__tagline',
        text: 'Iframes. Content fit. Smooth resize. Full window.',
      }),
      el('p', {
        class: 'lead__body',
        text: 'The headless, zero-dependency utility that hugs internal iframe dimensions and transitions smoothly into full-window mode without reloading the document. Lightweight, configurable, and built to integrate with any framework.',
      }),
      el('ul', { class: 'chips' }, [
        ...['Zero Dependencies', 'No Framework Required'].map((label) =>
          el('li', { class: 'chip', text: label }),
        ),
        el('li', {}, [
          el('a', {
            class: 'chip chip--link',
            attrs: { href: `${BASE_URL}react/` },
            text: 'React Wrapper Available',
          }),
        ]),
      ]),
      el('div', { class: 'snippet' }, [codeBlock('npm install hugframe'), codeBlock(USAGE)]),
    ]),
    workbench,
    el('p', { class: 'api-link' }, [
      'The wire protocol, every option and the CSS tokens are in the ',
      el('a', { attrs: { href: `${BASE_URL}api/` }, text: 'API reference' }),
      '.',
    ]),
  ])
  const page = el('div', { class: 'page' }, [main])
  const { header, footer } = siteChrome()

  container.append(header, page, footer)

  const primary = createHugFrame({
    container: primaryMount,
    src: CHILD_SRC,
    title: 'Framed document',
    minHeight: 220,
    maxHeight: 880,
    initialHeight: 380,
    height: 'content',
    onModeChange: (mode) => {
      if (mode === 'expanded') secondary?.collapse()
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
    container: secondMount,
    src: SECOND_SRC,
    title: 'Second framed document',
    minHeight: 160,
    maxHeight: 460,
    initialHeight: 220,
    onModeChange: (mode) => {
      if (mode === 'expanded') primary.collapse()
    },
  })

  phase = primary.getPhase()
  sizing = primary.getSizing()

  const segmentedItems = FRAME_WIDTHS.map((width) => ({
    width,
    element: el('button', {
      class: 'segmented__btn',
      attrs: { type: 'button' },
      text: width,
      on: {
        click: () => {
          frameWidth = width
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

  const secondExpand = el('button', {
    class: 'btn',
    attrs: { type: 'button' },
    text: 'Expand',
    on: { click: () => secondary?.expand() },
  })
  secondHead.append(secondExpand)

  driveRow.append(
    el('button', {
      class: 'btn',
      attrs: { type: 'button' },
      text: 'Grow the content',
      on: { click: () => primary.sendMessage({ action: 'grow' }) },
    }),
  )

  function applyHeight(): void {
    primary.update({ height: fixedHeight ? FIXED_HEIGHT : 'content' })
  }

  function render(): void {
    const widths = WIDTH_SPANS[frameWidth]
    layout.style.setProperty('--frame-w', widths.frame)
    layout.style.setProperty('--side-w', widths.side)
    layout.style.setProperty('--side-gap', widths.gap)
    layout.dataset.width = frameWidth

    for (const item of segmentedItems) {
      const active = item.width === frameWidth
      item.element.classList.toggle('is-active', active)
      item.element.setAttribute('aria-pressed', active ? 'true' : 'false')
    }

    hugButton.classList.toggle('btn--primary', !fixedHeight)
    hugButton.setAttribute('aria-pressed', fixedHeight ? 'false' : 'true')
    fixedButton.classList.toggle('btn--primary', fixedHeight)
    fixedButton.setAttribute('aria-pressed', fixedHeight ? 'true' : 'false')

    heightItem.label.textContent = sizing === 'fixed' ? 'frame height' : 'content height'
    heightItem.value.textContent = measured === null ? 'measuring' : `${measured}px`
    phaseItem.root.classList.toggle('is-idle', phase === 'idle')
    phaseItem.value.textContent = phase
    phaseItem.value.className = phase === 'idle' ? 'pill pill--ok' : 'pill pill--busy'
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
