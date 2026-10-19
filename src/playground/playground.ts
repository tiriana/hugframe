import { createHugFrame } from '@/lib/core'
// The playground drives the engine through createHugFrame, but imports the element
// module the way a consumer's `import 'hugframe'` would, so <hug-frame> is registered too.
import '@/lib/element'
import type {
  HugFrameCollapseHandle,
  HugFrameHeight,
  HugFrameInstance,
  HugFramePhase,
} from '@/lib/types'
import type { HugFrameMode, HugFrameSizing } from '@/lib/protocol'
import { el, svg, type Child } from '@/playground/dom'
import {
  alphaColorControl,
  alphaColorCss,
  colorControl,
  numberControl,
  rangeControl,
  segmentedControl,
  selectControl,
  switchControl,
  textControl,
  type AlphaColor,
} from '@/playground/widgets'
import chromeHtml from '@/site/chrome.html?raw'

const BASE_URL = import.meta.env.BASE_URL
const CHILD_SRC = `${BASE_URL}child.html`
const ORIGIN = window.location.origin

interface Tokens {
  radius: number
  radiusExpanded: number
  borderWidth: number
  surface: string
  line: string
  text: string
  accent: string
  focusRingWidth: number
  focusRingOffset: number
  backdrop: AlphaColor
  backdropBlur: number
  backdropSaturate: number
  glass: AlphaColor
  glassLine: AlphaColor
  glassHover: AlphaColor
  duration: number
  durationFast: number
  durationContent: number
  easing: string
  easingContent: string
  collapseOffset: number
  collapseSize: number
  collapseRadius: number
  collapseBorderWidth: number
  collapseBlur: number
  collapseSaturate: number
  collapsePressScale: number
  collapseIconSize: number
  collapseIconStroke: number
  initialHeightToken: number
}

type TokenKey = keyof Tokens

interface PlaygroundState {
  columns: '1' | '2' | '3'
  heightMode: 'content' | 'fixed' | 'length'
  heightPx: number
  heightLength: string
  minHeight: number
  maxHeight: number
  initialHeight: number
  resizeSettleMs: number
  resizeSafetyMs: number
  resizeWidthEpsilon: number
  morphSettleMarginMs: number
  expandedWidth: string
  expandedHeight: string
  lockScroll: boolean
  manageFocus: boolean
  collapseOnEscape: boolean
  targetOrigin: string
  title: string
  affordance: 'default' | 'svg' | 'text' | 'custom' | 'hidden'
  tokens: Tokens
}

type TokenValue = number | string | AlphaColor

interface TokenDef {
  name: string
  css: (value: TokenValue) => string
}

const px = (value: TokenValue): string => `${value as number}px`
const raw = (value: TokenValue): string => String(value)
const alpha = (value: TokenValue): string => alphaColorCss(value as AlphaColor)

const TOKEN_VARS: Record<TokenKey, TokenDef> = {
  radius: { name: '--hug-radius', css: px },
  radiusExpanded: { name: '--hug-radius-expanded', css: px },
  borderWidth: { name: '--hug-border-width', css: px },
  surface: { name: '--hug-surface', css: raw },
  line: { name: '--hug-line', css: raw },
  text: { name: '--hug-text', css: raw },
  accent: { name: '--hug-accent', css: raw },
  focusRingWidth: { name: '--hug-focus-ring-width', css: px },
  focusRingOffset: { name: '--hug-focus-ring-offset', css: px },
  backdrop: { name: '--hug-backdrop', css: alpha },
  backdropBlur: { name: '--hug-backdrop-blur', css: px },
  backdropSaturate: { name: '--hug-backdrop-saturate', css: raw },
  glass: { name: '--hug-glass', css: alpha },
  glassLine: { name: '--hug-glass-line', css: alpha },
  glassHover: { name: '--hug-glass-hover', css: alpha },
  duration: { name: '--hug-duration', css: px },
  durationFast: { name: '--hug-duration-fast', css: px },
  durationContent: { name: '--hug-duration-content', css: px },
  easing: { name: '--hug-easing', css: raw },
  easingContent: { name: '--hug-easing-content', css: raw },
  collapseOffset: { name: '--hug-collapse-offset', css: px },
  collapseSize: { name: '--hug-collapse-size', css: px },
  collapseRadius: { name: '--hug-collapse-radius', css: px },
  collapseBorderWidth: { name: '--hug-collapse-border-width', css: px },
  collapseBlur: { name: '--hug-collapse-blur', css: px },
  collapseSaturate: { name: '--hug-collapse-saturate', css: raw },
  collapsePressScale: { name: '--hug-collapse-press-scale', css: raw },
  collapseIconSize: { name: '--hug-collapse-icon-size', css: px },
  collapseIconStroke: { name: '--hug-collapse-icon-stroke', css: raw },
  initialHeightToken: { name: '--hug-initial-height', css: px },
}

const COLUMN_WIDTHS: Record<
  PlaygroundState['columns'],
  { frame: string; side: string; gap: string }
> = {
  '1': { frame: '34%', side: 'calc(66% - 20px)', gap: '20px' },
  '2': { frame: '62%', side: 'calc(38% - 20px)', gap: '20px' },
  '3': { frame: '100%', side: '0px', gap: '0px' },
}

const EASING_OPTIONS = [
  { value: 'cubic-bezier(0.22, 1, 0.36, 1)', label: 'ease-out quint (default)' },
  { value: 'cubic-bezier(0.33, 1, 0.68, 1)', label: 'ease-out cubic' },
  { value: 'cubic-bezier(0.4, 0, 0.2, 1)', label: 'material standard' },
  { value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', label: 'soft overshoot' },
  { value: 'linear', label: 'linear' },
  { value: 'ease-in-out', label: 'ease-in-out' },
] as const

function defaults(): PlaygroundState {
  return {
    columns: '2',
    heightMode: 'content',
    heightPx: 360,
    heightLength: 'clamp(280px, 42vh, 460px)',
    minHeight: 0,
    maxHeight: 720,
    initialHeight: 240,
    resizeSettleMs: 120,
    resizeSafetyMs: 400,
    resizeWidthEpsilon: 1,
    morphSettleMarginMs: 90,
    expandedWidth: '100vw',
    expandedHeight: '100dvh',
    lockScroll: true,
    manageFocus: true,
    collapseOnEscape: true,
    targetOrigin: ORIGIN,
    title: 'Playground app',
    affordance: 'default',
    tokens: {
      radius: 14,
      radiusExpanded: 0,
      borderWidth: 1,
      surface: '#ffffff',
      line: '#dfe3ea',
      text: '#14171f',
      accent: '#4b46e0',
      focusRingWidth: 2,
      focusRingOffset: -2,
      backdrop: { hex: '#0c0f18', alpha: 44 },
      backdropBlur: 12,
      backdropSaturate: 0.82,
      glass: { hex: '#ffffff', alpha: 74 },
      glassLine: { hex: '#0f121e', alpha: 12 },
      glassHover: { hex: '#ffffff', alpha: 94 },
      duration: 460,
      durationFast: 300,
      durationContent: 260,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      easingContent: 'cubic-bezier(0.33, 1, 0.68, 1)',
      collapseOffset: 14,
      collapseSize: 40,
      collapseRadius: 999,
      collapseBorderWidth: 1,
      collapseBlur: 10,
      collapseSaturate: 1.1,
      collapsePressScale: 0.94,
      collapseIconSize: 18,
      collapseIconStroke: 1.6,
      initialHeightToken: 240,
    },
  }
}

function resolveHeight(state: PlaygroundState): HugFrameHeight {
  if (state.heightMode === 'fixed') return state.heightPx
  if (state.heightMode === 'length') return state.heightLength.trim() || 'content'
  return 'content'
}

function siteChrome(): { header: Element; footer: Element } {
  const markup = chromeHtml
    .replaceAll('{{home}}', '../')
    .replaceAll('{{api}}', '../api/')
    .replaceAll('{{demo-current}}', '')
    .replaceAll('{{api-current}}', '')

  const template = document.createElement('template')
  template.innerHTML = markup
  const header = template.content.querySelector('header')
  const footer = template.content.querySelector('footer')
  if (!header || !footer) throw new Error('site chrome is missing its header or footer')

  header
    .querySelector('.masthead__nav a[href$="playground/"]')
    ?.setAttribute('aria-current', 'page')
  return { header, footer }
}

function customCollapseIcon(): SVGElement {
  return svg(
    'svg',
    {
      attrs: {
        viewBox: '0 0 20 20',
        width: '18',
        height: '18',
        'aria-hidden': 'true',
        focusable: 'false',
      },
    },
    [
      svg('path', {
        attrs: {
          d: 'M6 3v11h11M17 3l-7 7',
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

function customCollapseControl(handle: HugFrameCollapseHandle): Node {
  return el(
    'button',
    {
      class: 'pg-collapse',
      attrs: { type: 'button', 'aria-label': 'Return to inline view' },
      on: { click: () => handle.collapse() },
    },
    [
      svg(
        'svg',
        {
          attrs: {
            viewBox: '0 0 20 20',
            width: '16',
            height: '16',
            'aria-hidden': 'true',
            focusable: 'false',
          },
        },
        [
          svg('path', {
            attrs: {
              d: 'M16 10H4M10 4l-6 6 6 6',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '1.7',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            },
          }),
        ],
      ),
      el('span', { text: 'Back to the page' }),
    ],
  )
}

interface MeterItem {
  root: HTMLElement
  label: HTMLElement
  value: HTMLElement
}

function meterItem(label: string): MeterItem {
  const labelEl = el('span', { class: 'pg-meter__label', text: label })
  const valueEl = el('span', { class: 'pg-meter__value' })
  return {
    root: el('span', { class: 'pg-meter__item' }, [labelEl, valueEl]),
    label: labelEl,
    value: valueEl,
  }
}

export function mountPlayground(container: HTMLElement): void {
  const state = defaults()
  let mode: HugFrameMode = 'inline'
  let phase: HugFramePhase = 'idle'
  let sizing: HugFrameSizing = 'content'
  let ready = false
  let measured: number | null = null
  let uiReady = false

  const syncHeightVisibility = (): void => {
    heightPxField.el.hidden = state.heightMode !== 'fixed'
    heightLengthField.el.hidden = state.heightMode !== 'length'
  }

  const commit = (): void => {
    applyAll()
  }

  const frameMount = el('div', { class: 'pg-frame' })
  const layout = el('div', { class: 'pg-layout' })

  const heightItem = meterItem('content height')
  const modeItem = meterItem('mode')
  const phaseItem = meterItem('phase')
  const sizingItem = meterItem('sizing')
  const readyItem = meterItem('status')
  const meter = el('div', { class: 'pg-meter', attrs: { 'aria-live': 'polite' } }, [
    heightItem.root,
    modeItem.root,
    phaseItem.root,
    sizingItem.root,
    readyItem.root,
  ])

  const frame: HugFrameInstance = createHugFrame({
    container: frameMount,
    src: CHILD_SRC,
    title: state.title,
    targetOrigin: state.targetOrigin,
    height: resolveHeight(state),
    minHeight: state.minHeight,
    maxHeight: state.maxHeight,
    initialHeight: state.initialHeight,
    onReady: () => {
      ready = true
      renderMeter()
    },
    onModeChange: (next) => {
      mode = next
      renderMeter()
      syncExpanded()
    },
    onPhaseChange: (next) => {
      phase = next
      renderMeter()
    },
    onSizingChange: (next) => {
      sizing = next
      renderMeter()
    },
  })

  function renderMeter(): void {
    heightItem.label.textContent = sizing === 'fixed' ? 'frame height' : 'content height'
    heightItem.value.textContent = measured === null ? 'measuring' : `${measured}px`
    modeItem.value.textContent = mode
    phaseItem.value.textContent = phase
    phaseItem.value.className = phase === 'idle' ? 'pill pill--ok' : 'pill pill--busy'
    sizingItem.value.textContent = sizing
    readyItem.value.textContent = ready ? 'ready' : 'waiting'
    readyItem.value.className = ready ? 'pill pill--ok' : 'pill pill--wait'
  }

  // ---- controls -------------------------------------------------------------------

  const heightMode = segmentedControl({
    id: 'pg-height-mode',
    label: 'Height source',
    value: state.heightMode,
    options: [
      { value: 'content', label: 'Hug content', title: 'The frame sizes to the framed document' },
      { value: 'fixed', label: 'Fixed px', title: 'The host drives a pixel height' },
      { value: 'length', label: 'CSS length', title: 'Any CSS length, used verbatim' },
    ],
    onInput: (value) => {
      state.heightMode = value as PlaygroundState['heightMode']
      commit()
    },
  })
  const heightPxField = numberControl({
    id: 'pg-height-px',
    label: 'Height (px)',
    value: state.heightPx,
    min: 80,
    max: 1200,
    step: 10,
    unit: 'px',
    hint: 'Used when the height source is a fixed px value.',
    onInput: (value) => {
      state.heightPx = value
      commit()
    },
  })
  const heightLengthField = textControl({
    id: 'pg-height-length',
    label: 'Height (CSS length)',
    value: state.heightLength,
    hint: "Used verbatim, so '70vh' or a clamp() both work.",
    onInput: (value) => {
      state.heightLength = value
      commit()
    },
  })
  const minHeightField = rangeControl({
    id: 'pg-min-height',
    label: 'minHeight',
    min: 0,
    max: 720,
    step: 10,
    value: state.minHeight,
    unit: 'px',
    onInput: (value) => {
      state.minHeight = value
      commit()
    },
  })
  const maxHeightField = rangeControl({
    id: 'pg-max-height',
    label: 'maxHeight',
    min: 0,
    max: 1200,
    step: 10,
    value: state.maxHeight,
    unit: 'px',
    onInput: (value) => {
      state.maxHeight = value
      commit()
    },
  })
  const initialHeightField = rangeControl({
    id: 'pg-initial-height',
    label: 'initialHeight',
    min: 0,
    max: 720,
    step: 10,
    value: state.initialHeight,
    unit: 'px',
    onInput: (value) => {
      state.initialHeight = value
      commit()
    },
  })
  const initialHeightTokenField = rangeControl({
    id: 'pg-token-initial-height',
    label: '--hug-initial-height',
    min: 60,
    max: 720,
    step: 10,
    value: state.tokens.initialHeightToken,
    unit: 'px',
    hint: 'The CSS height painted before scripts run; initialHeight is the value the engine applies once they do.',
    onInput: (value) => {
      state.tokens.initialHeightToken = value
      commit()
    },
  })

  const resizeSettleField = rangeControl({
    id: 'pg-resize-settle',
    label: 'resizeSettleMs',
    min: 0,
    max: 600,
    step: 10,
    value: state.resizeSettleMs,
    unit: 'ms',
    hint: 'Width quiescence the resizing phase waits for before settling.',
    onInput: (value) => {
      state.resizeSettleMs = value
      commit()
    },
  })
  const resizeSafetyField = rangeControl({
    id: 'pg-resize-safety',
    label: 'resizeSafetyMs',
    min: 0,
    max: 1200,
    step: 10,
    value: state.resizeSafetyMs,
    unit: 'ms',
    hint: "Ceiling on the resizing phase's wait.",
    onInput: (value) => {
      state.resizeSafetyMs = value
      commit()
    },
  })
  const resizeEpsilonField = rangeControl({
    id: 'pg-resize-epsilon',
    label: 'resizeWidthEpsilon',
    min: 0,
    max: 40,
    step: 1,
    value: state.resizeWidthEpsilon,
    unit: 'px',
    hint: 'Width change at or below which a layout change is not treated as a resize.',
    onInput: (value) => {
      state.resizeWidthEpsilon = value
      commit()
    },
  })
  const morphSettleField = rangeControl({
    id: 'pg-morph-settle',
    label: 'morphSettleMarginMs',
    min: 0,
    max: 400,
    step: 10,
    value: state.morphSettleMarginMs,
    unit: 'ms',
    hint: 'Added to the morph duration for the transitionend fallback timer.',
    onInput: (value) => {
      state.morphSettleMarginMs = value
      commit()
    },
  })
  const expandedWidthField = textControl({
    id: 'pg-expanded-width',
    label: 'expandedWidth',
    value: state.expandedWidth,
    hint: 'Written on the box once expanded and idle.',
    onInput: (value) => {
      state.expandedWidth = value
      commit()
    },
  })
  const expandedHeightField = textControl({
    id: 'pg-expanded-height',
    label: 'expandedHeight',
    value: state.expandedHeight,
    hint: 'Written on the box once expanded and idle.',
    onInput: (value) => {
      state.expandedHeight = value
      commit()
    },
  })
  const lockScrollField = switchControl({
    id: 'pg-lock-scroll',
    label: 'lockScroll',
    value: state.lockScroll,
    onInput: (value) => {
      state.lockScroll = value
      commit()
    },
  })
  const manageFocusField = switchControl({
    id: 'pg-manage-focus',
    label: 'manageFocus',
    value: state.manageFocus,
    onInput: (value) => {
      state.manageFocus = value
      commit()
    },
  })
  const collapseOnEscapeField = switchControl({
    id: 'pg-collapse-escape',
    label: 'collapseOnEscape',
    value: state.collapseOnEscape,
    onInput: (value) => {
      state.collapseOnEscape = value
      commit()
    },
  })
  const targetOriginField = textControl({
    id: 'pg-target-origin',
    label: 'targetOrigin',
    value: state.targetOrigin,
    hint: "Messages are accepted from this origin. Use '*' to skip the check; a wrong origin stops the framed document's reports.",
    onInput: (value) => {
      state.targetOrigin = value
      commit()
    },
  })
  const titleField = textControl({
    id: 'pg-title',
    label: 'title',
    value: state.title,
    hint: 'Labels the iframe and names the dialog when expanded.',
    onInput: (value) => {
      state.title = value
      commit()
    },
  })

  const radiusField = rangeControl({
    id: 'pg-radius',
    label: '--hug-radius',
    min: 0,
    max: 40,
    step: 1,
    value: state.tokens.radius,
    unit: 'px',
    onInput: (value) => {
      state.tokens.radius = value
      commit()
    },
  })
  const radiusExpandedField = rangeControl({
    id: 'pg-radius-expanded',
    label: '--hug-radius-expanded',
    min: 0,
    max: 40,
    step: 1,
    value: state.tokens.radiusExpanded,
    unit: 'px',
    onInput: (value) => {
      state.tokens.radiusExpanded = value
      commit()
    },
  })
  const borderWidthField = rangeControl({
    id: 'pg-border-width',
    label: '--hug-border-width',
    min: 0,
    max: 6,
    step: 0.5,
    value: state.tokens.borderWidth,
    unit: 'px',
    onInput: (value) => {
      state.tokens.borderWidth = value
      commit()
    },
  })
  const surfaceField = colorControl({
    id: 'pg-surface',
    label: '--hug-surface',
    value: state.tokens.surface,
    onInput: (value) => {
      state.tokens.surface = value
      commit()
    },
  })
  const lineField = colorControl({
    id: 'pg-line',
    label: '--hug-line',
    value: state.tokens.line,
    onInput: (value) => {
      state.tokens.line = value
      commit()
    },
  })
  const textField = colorControl({
    id: 'pg-text',
    label: '--hug-text',
    value: state.tokens.text,
    onInput: (value) => {
      state.tokens.text = value
      commit()
    },
  })
  const accentField = colorControl({
    id: 'pg-accent',
    label: '--hug-accent',
    value: state.tokens.accent,
    onInput: (value) => {
      state.tokens.accent = value
      commit()
    },
  })
  const focusRingWidthField = rangeControl({
    id: 'pg-focus-ring-width',
    label: '--hug-focus-ring-width',
    min: 0,
    max: 6,
    step: 0.5,
    value: state.tokens.focusRingWidth,
    unit: 'px',
    onInput: (value) => {
      state.tokens.focusRingWidth = value
      commit()
    },
  })
  const focusRingOffsetField = rangeControl({
    id: 'pg-focus-ring-offset',
    label: '--hug-focus-ring-offset',
    min: -8,
    max: 8,
    step: 1,
    value: state.tokens.focusRingOffset,
    unit: 'px',
    onInput: (value) => {
      state.tokens.focusRingOffset = value
      commit()
    },
  })
  const backdropField = alphaColorControl({
    id: 'pg-backdrop',
    label: '--hug-backdrop',
    value: state.tokens.backdrop,
    onInput: (value) => {
      state.tokens.backdrop = value
      commit()
    },
  })
  const backdropBlurField = rangeControl({
    id: 'pg-backdrop-blur',
    label: '--hug-backdrop-blur',
    min: 0,
    max: 40,
    step: 1,
    value: state.tokens.backdropBlur,
    unit: 'px',
    onInput: (value) => {
      state.tokens.backdropBlur = value
      commit()
    },
  })
  const backdropSaturateField = rangeControl({
    id: 'pg-backdrop-saturate',
    label: '--hug-backdrop-saturate',
    min: 0,
    max: 2,
    step: 0.05,
    value: state.tokens.backdropSaturate,
    onInput: (value) => {
      state.tokens.backdropSaturate = value
      commit()
    },
  })
  const glassField = alphaColorControl({
    id: 'pg-glass',
    label: '--hug-glass',
    value: state.tokens.glass,
    onInput: (value) => {
      state.tokens.glass = value
      commit()
    },
  })
  const glassLineField = alphaColorControl({
    id: 'pg-glass-line',
    label: '--hug-glass-line',
    value: state.tokens.glassLine,
    onInput: (value) => {
      state.tokens.glassLine = value
      commit()
    },
  })
  const glassHoverField = alphaColorControl({
    id: 'pg-glass-hover',
    label: '--hug-glass-hover',
    value: state.tokens.glassHover,
    onInput: (value) => {
      state.tokens.glassHover = value
      commit()
    },
  })

  const durationField = rangeControl({
    id: 'pg-duration',
    label: '--hug-duration',
    min: 0,
    max: 1200,
    step: 20,
    value: state.tokens.duration,
    unit: 'ms',
    onInput: (value) => {
      state.tokens.duration = value
      commit()
    },
  })
  const durationFastField = rangeControl({
    id: 'pg-duration-fast',
    label: '--hug-duration-fast',
    min: 0,
    max: 1200,
    step: 20,
    value: state.tokens.durationFast,
    unit: 'ms',
    onInput: (value) => {
      state.tokens.durationFast = value
      commit()
    },
  })
  const durationContentField = rangeControl({
    id: 'pg-duration-content',
    label: '--hug-duration-content',
    min: 0,
    max: 1200,
    step: 20,
    value: state.tokens.durationContent,
    unit: 'ms',
    onInput: (value) => {
      state.tokens.durationContent = value
      commit()
    },
  })
  const easingField = selectControl({
    id: 'pg-easing',
    label: '--hug-easing',
    value: state.tokens.easing,
    options: EASING_OPTIONS,
    onInput: (value) => {
      state.tokens.easing = value
      commit()
    },
  })
  const easingContentField = selectControl({
    id: 'pg-easing-content',
    label: '--hug-easing-content',
    value: state.tokens.easingContent,
    options: EASING_OPTIONS,
    onInput: (value) => {
      state.tokens.easingContent = value
      commit()
    },
  })

  const affordanceField = segmentedControl({
    id: 'pg-affordance',
    label: 'Collapse affordance',
    value: state.affordance,
    options: [
      { value: 'default', label: 'Default glyph', title: 'The built-in corner glyph' },
      { value: 'svg', label: 'Custom SVG', title: 'An inline SVG through collapseIcon' },
      { value: 'text', label: 'Text glyph', title: 'A text glyph through collapseIcon' },
      { value: 'custom', label: 'Custom control', title: 'A whole control through renderCollapse' },
      { value: 'hidden', label: 'Hidden', title: 'renderCollapse: null, collapsed from the page' },
    ],
    onInput: (value) => {
      state.affordance = value as PlaygroundState['affordance']
      commit()
    },
  })
  const collapseOffsetField = rangeControl({
    id: 'pg-collapse-offset',
    label: '--hug-collapse-offset',
    min: 0,
    max: 64,
    step: 1,
    value: state.tokens.collapseOffset,
    unit: 'px',
    onInput: (value) => {
      state.tokens.collapseOffset = value
      commit()
    },
  })
  const collapseSizeField = rangeControl({
    id: 'pg-collapse-size',
    label: '--hug-collapse-size',
    min: 20,
    max: 72,
    step: 1,
    value: state.tokens.collapseSize,
    unit: 'px',
    onInput: (value) => {
      state.tokens.collapseSize = value
      commit()
    },
  })
  const collapseRadiusField = rangeControl({
    id: 'pg-collapse-radius',
    label: '--hug-collapse-radius',
    min: 0,
    max: 999,
    step: 1,
    value: state.tokens.collapseRadius,
    unit: 'px',
    onInput: (value) => {
      state.tokens.collapseRadius = value
      commit()
    },
  })
  const collapseBorderWidthField = rangeControl({
    id: 'pg-collapse-border-width',
    label: '--hug-collapse-border-width',
    min: 0,
    max: 6,
    step: 0.5,
    value: state.tokens.collapseBorderWidth,
    unit: 'px',
    onInput: (value) => {
      state.tokens.collapseBorderWidth = value
      commit()
    },
  })
  const collapseBlurField = rangeControl({
    id: 'pg-collapse-blur',
    label: '--hug-collapse-blur',
    min: 0,
    max: 40,
    step: 1,
    value: state.tokens.collapseBlur,
    unit: 'px',
    onInput: (value) => {
      state.tokens.collapseBlur = value
      commit()
    },
  })
  const collapseSaturateField = rangeControl({
    id: 'pg-collapse-saturate',
    label: '--hug-collapse-saturate',
    min: 0,
    max: 2,
    step: 0.05,
    value: state.tokens.collapseSaturate,
    onInput: (value) => {
      state.tokens.collapseSaturate = value
      commit()
    },
  })
  const collapsePressScaleField = rangeControl({
    id: 'pg-collapse-press-scale',
    label: '--hug-collapse-press-scale',
    min: 0.8,
    max: 1,
    step: 0.01,
    value: state.tokens.collapsePressScale,
    onInput: (value) => {
      state.tokens.collapsePressScale = value
      commit()
    },
  })
  const collapseIconSizeField = rangeControl({
    id: 'pg-collapse-icon-size',
    label: '--hug-collapse-icon-size',
    min: 8,
    max: 32,
    step: 1,
    value: state.tokens.collapseIconSize,
    unit: 'px',
    onInput: (value) => {
      state.tokens.collapseIconSize = value
      commit()
    },
  })
  const collapseIconStrokeField = rangeControl({
    id: 'pg-collapse-icon-stroke',
    label: '--hug-collapse-icon-stroke',
    min: 0.5,
    max: 3,
    step: 0.1,
    value: state.tokens.collapseIconStroke,
    onInput: (value) => {
      state.tokens.collapseIconStroke = value
      commit()
    },
  })

  const columnsField = segmentedControl({
    id: 'pg-columns',
    label: 'Layout around the frame',
    value: state.columns,
    options: [
      { value: '1', label: '1 col', title: 'A narrow frame with a wide side panel' },
      { value: '2', label: '2 col', title: 'A wide frame with a narrow side panel' },
      { value: '3', label: '3 col', title: 'The frame fills the page' },
    ],
    onInput: (value) => {
      state.columns = value as PlaygroundState['columns']
      commit()
    },
  })

  // ---- apply ----------------------------------------------------------------------

  function applyLayout(): void {
    const widths = COLUMN_WIDTHS[state.columns]
    layout.style.setProperty('--frame-w', widths.frame)
    layout.style.setProperty('--side-w', widths.side)
    layout.style.setProperty('--side-gap', widths.gap)
    layout.dataset.cols = state.columns
  }

  function applyOptions(): void {
    frame.update({
      title: state.title,
      targetOrigin: state.targetOrigin.trim() === '' ? undefined : state.targetOrigin,
      height: resolveHeight(state),
      minHeight: state.minHeight,
      maxHeight: state.maxHeight,
      initialHeight: state.initialHeight,
      resizeSettleMs: state.resizeSettleMs,
      resizeSafetyMs: state.resizeSafetyMs,
      resizeWidthEpsilon: state.resizeWidthEpsilon,
      morphSettleMarginMs: state.morphSettleMarginMs,
      expandedWidth: state.expandedWidth.trim() || undefined,
      expandedHeight: state.expandedHeight.trim() || undefined,
      lockScroll: state.lockScroll,
      manageFocus: state.manageFocus,
      collapseOnEscape: state.collapseOnEscape,
    })
  }

  function applyCollapse(): void {
    switch (state.affordance) {
      case 'svg':
        frame.update({ collapseIcon: customCollapseIcon(), renderCollapse: undefined })
        return
      case 'text':
        frame.update({ collapseIcon: '×', renderCollapse: undefined })
        return
      case 'custom':
        frame.update({
          collapseIcon: undefined,
          renderCollapse: (handle) => customCollapseControl(handle),
        })
        return
      case 'hidden':
        frame.update({ collapseIcon: undefined, renderCollapse: null })
        return
      case 'default':
        frame.update({ collapseIcon: undefined, renderCollapse: undefined })
    }
  }

  function applyTokens(): void {
    for (const key of Object.keys(TOKEN_VARS) as TokenKey[]) {
      const def = TOKEN_VARS[key]
      frame.element.style.setProperty(def.name, def.css(state.tokens[key]))
    }
  }

  function applyAll(): void {
    applyOptions()
    applyCollapse()
    applyTokens()
    applyLayout()
    syncHeightVisibility()
    renderMeter()
  }

  // While expanded the frame is a full-window overlay, so the readout and the affordance
  // picker would be behind it. The dock lifts them above the frame (one level over its
  // z-index) for as long as it is expanded, then hands them back to the page.
  function syncExpanded(): void {
    if (!uiReady) return
    const expanded = mode === 'expanded'
    dock.hidden = !expanded
    if (expanded) {
      dock.style.zIndex = String(frame.getZIndex() + 1)
      dockBody.append(meter, affordanceField.el)
    } else {
      framePanel.append(meter)
      collapseGroupBody.prepend(affordanceField.el)
    }
  }

  // ---- chrome and stage -----------------------------------------------------------

  const { header, footer } = siteChrome()
  const main = el('main', { class: 'pg' })

  const expandButton = el('button', {
    class: 'btn btn--primary',
    attrs: { type: 'button' },
    text: 'Expand',
    on: { click: () => frame.expand() },
  })
  const collapseButton = el('button', {
    class: 'btn',
    attrs: { type: 'button' },
    text: 'Collapse',
    on: { click: () => frame.collapse() },
  })
  const resetButton = el('button', {
    class: 'btn',
    attrs: { type: 'button' },
    text: 'Reset all',
    on: {
      click: () => {
        Object.assign(state, defaults())
        syncControls()
        applyAll()
      },
    },
  })

  const driveRow = el('div', { class: 'pg-drive' })
  for (const action of [
    { label: 'Add a thread', payload: { action: 'add-thread' } },
    { label: 'Remove a thread', payload: { action: 'remove-thread' } },
    { label: 'Open a thread', payload: { action: 'select-thread' } },
  ]) {
    driveRow.append(
      el('button', {
        class: 'btn',
        attrs: { type: 'button' },
        text: action.label,
        on: { click: () => frame.sendMessage(action.payload) },
      }),
    )
  }

  const framePanel = el('div', { class: 'pg-frame-panel' }, [frameMount, meter])
  const sidePanel = el('aside', { class: 'pg-side' }, [
    el('div', { class: 'pg-card' }, [
      el('h3', { text: 'Change the framed content' }),
      el('p', {
        class: 'pg-card__note',
        text: 'These run inside the framed document. With a content height the frame glides to fit; with a fixed height it stays put and the document scrolls.',
      }),
      driveRow,
    ]),
    el('div', { class: 'pg-card' }, [
      el('h3', { text: 'Watch the phases' }),
      el('p', {
        class: 'pg-card__note',
        text: 'Switch the columns to change the width around the frame and the readout dips into the resizing phase. Expand or collapse to watch the morph and the settled state.',
      }),
    ]),
  ])

  layout.append(framePanel, sidePanel)

  const stage = el(
    'section',
    { class: 'pg-stage', attrs: { 'aria-labelledby': 'pg-stage-title' } },
    [
      el('div', { class: 'pg-stage__head' }, [
        el('div', {}, [
          el('h2', { attrs: { id: 'pg-stage-title' }, text: 'The frame, driven live' }),
          el('p', {
            class: 'pg-stage__note',
            text: 'Nothing here remounts the frame. Every control calls update() or writes a token, so the framed document keeps its state.',
          }),
        ]),
        el('div', { class: 'pg-stage__actions' }, [expandButton, collapseButton, resetButton]),
      ]),
      el('div', { class: 'pg-stage__bar' }, [
        columnsField.el,
        el('p', {
          class: 'pg-stage__bar-note',
          text: 'The frame is driven by the layout, not by a slider on its own width.',
        }),
      ]),
      layout,
    ],
  )

  const dockCollapseButton = el('button', {
    class: 'btn btn--primary',
    attrs: { type: 'button' },
    text: 'Collapse frame',
    on: { click: () => frame.collapse() },
  })
  const dockBody = el('div', { class: 'pg-dock__body' })
  const dock = el(
    'section',
    { class: 'pg-dock', attrs: { role: 'region', 'aria-label': 'Playground controls' } },
    [
      el('p', {
        class: 'pg-dock__hint',
        text: 'The frame is expanded over the page. The readout and the collapse picker move up here while it is open.',
      }),
      dockBody,
      el('div', { class: 'pg-dock__actions' }, [dockCollapseButton]),
    ],
  )
  dock.hidden = true

  function group(title: string, note: string, body: HTMLElement): HTMLElement {
    return el('section', { class: 'pg-group' }, [
      el('h3', { class: 'pg-group__title', text: title }),
      el('p', { class: 'pg-group__note', text: note }),
      body,
    ])
  }

  function groupBody(children: Child[]): HTMLElement {
    return el('div', { class: 'pg-group__body' }, children)
  }

  const collapseGroupBody = groupBody([
    affordanceField.el,
    collapseOffsetField.el,
    collapseSizeField.el,
    collapseRadiusField.el,
    collapseBorderWidthField.el,
    collapseBlurField.el,
    collapseSaturateField.el,
    collapsePressScaleField.el,
    collapseIconSizeField.el,
    collapseIconStrokeField.el,
  ])

  const groups = el('div', { class: 'pg-groups' }, [
    group(
      'Sizing',
      'What decides the inline height, and the bounds around it.',
      groupBody([
        heightMode.el,
        heightPxField.el,
        heightLengthField.el,
        minHeightField.el,
        maxHeightField.el,
        initialHeightField.el,
        initialHeightTokenField.el,
      ]),
    ),
    group(
      'Behaviour',
      'Timing, the expanded box and the host-side booleans.',
      groupBody([
        resizeSettleField.el,
        resizeSafetyField.el,
        resizeEpsilonField.el,
        morphSettleField.el,
        expandedWidthField.el,
        expandedHeightField.el,
        lockScrollField.el,
        manageFocusField.el,
        collapseOnEscapeField.el,
        targetOriginField.el,
        titleField.el,
        el('p', {
          class: 'pg-note',
          text: 'reportEpsilon belongs to the framed document: it is passed to createHugFrameChild() inside the frame, not to the host, so no control here can drive it.',
        }),
      ]),
    ),
    group(
      'Appearance',
      'The frame surface, its focus ring, the backdrop and the glass.',
      groupBody([
        radiusField.el,
        radiusExpandedField.el,
        borderWidthField.el,
        surfaceField.el,
        lineField.el,
        textField.el,
        accentField.el,
        focusRingWidthField.el,
        focusRingOffsetField.el,
        backdropField.el,
        backdropBlurField.el,
        backdropSaturateField.el,
        glassField.el,
        glassLineField.el,
        glassHoverField.el,
      ]),
    ),
    group(
      'Motion',
      'The three durations and the two easings.',
      groupBody([
        durationField.el,
        durationFastField.el,
        durationContentField.el,
        easingField.el,
        easingContentField.el,
      ]),
    ),
    group(
      'Collapse control',
      'Five ways to show the affordance. The picker moves into the dock while the frame is expanded, so you can swap the control and watch it happen without ever remounting the frame.',
      collapseGroupBody,
    ),
  ])

  const panels = el(
    'section',
    { class: 'pg-panels', attrs: { 'aria-labelledby': 'pg-controls-title' } },
    [
      el('h2', { attrs: { id: 'pg-controls-title' }, text: 'Every host-side setting, live' }),
      el('p', {
        class: 'pg-panels__note',
        text: 'Defaults are shown beside each control, so you can see what you drifted from. Reset all returns everything at once.',
      }),
      groups,
    ],
  )

  main.append(
    el('section', { class: 'pg-lead' }, [
      el('p', { class: 'pg-eyebrow', text: 'Playground' }),
      el('h1', { text: 'Play with the frame, then watch what it does.' }),
      el('p', {
        class: 'pg-lead__body',
        text: 'Expand and collapse it, change the layout around it, swap its height source, and turn every host option and theme token. The framed document is live the whole time.',
      }),
    ]),
    stage,
    panels,
    dock,
  )

  container.append(header, main, footer)

  // ---- refresh --------------------------------------------------------------------

  function syncControls(): void {
    heightMode.set(state.heightMode)
    heightPxField.set(state.heightPx)
    heightLengthField.set(state.heightLength)
    minHeightField.set(state.minHeight)
    maxHeightField.set(state.maxHeight)
    initialHeightField.set(state.initialHeight)
    initialHeightTokenField.set(state.tokens.initialHeightToken)
    resizeSettleField.set(state.resizeSettleMs)
    resizeSafetyField.set(state.resizeSafetyMs)
    resizeEpsilonField.set(state.resizeWidthEpsilon)
    morphSettleField.set(state.morphSettleMarginMs)
    expandedWidthField.set(state.expandedWidth)
    expandedHeightField.set(state.expandedHeight)
    lockScrollField.set(state.lockScroll)
    manageFocusField.set(state.manageFocus)
    collapseOnEscapeField.set(state.collapseOnEscape)
    targetOriginField.set(state.targetOrigin)
    titleField.set(state.title)
    affordanceField.set(state.affordance)
    radiusField.set(state.tokens.radius)
    radiusExpandedField.set(state.tokens.radiusExpanded)
    borderWidthField.set(state.tokens.borderWidth)
    surfaceField.set(state.tokens.surface)
    lineField.set(state.tokens.line)
    textField.set(state.tokens.text)
    accentField.set(state.tokens.accent)
    focusRingWidthField.set(state.tokens.focusRingWidth)
    focusRingOffsetField.set(state.tokens.focusRingOffset)
    backdropField.set(state.tokens.backdrop)
    backdropBlurField.set(state.tokens.backdropBlur)
    backdropSaturateField.set(state.tokens.backdropSaturate)
    glassField.set(state.tokens.glass)
    glassLineField.set(state.tokens.glassLine)
    glassHoverField.set(state.tokens.glassHover)
    durationField.set(state.tokens.duration)
    durationFastField.set(state.tokens.durationFast)
    durationContentField.set(state.tokens.durationContent)
    easingField.set(state.tokens.easing)
    easingContentField.set(state.tokens.easingContent)
    collapseOffsetField.set(state.tokens.collapseOffset)
    collapseSizeField.set(state.tokens.collapseSize)
    collapseRadiusField.set(state.tokens.collapseRadius)
    collapseBorderWidthField.set(state.tokens.collapseBorderWidth)
    collapseBlurField.set(state.tokens.collapseBlur)
    collapseSaturateField.set(state.tokens.collapseSaturate)
    collapsePressScaleField.set(state.tokens.collapsePressScale)
    collapseIconSizeField.set(state.tokens.collapseIconSize)
    collapseIconStrokeField.set(state.tokens.collapseIconStroke)
    columnsField.set(state.columns)
  }

  const iframe = frame.getIframe()
  if (iframe && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      measured = Math.round(iframe.getBoundingClientRect().height)
      renderMeter()
    })
    observer.observe(iframe)
  }

  uiReady = true
  applyAll()
  syncExpanded()
}
