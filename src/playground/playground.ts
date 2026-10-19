import { createHugFrame } from '@/lib/core'
// The playground drives the engine through createHugFrame, but imports the element
// module the way a consumer's `import 'hugframe'` would, so <hug-frame> is registered too.
import '@/lib/element'
import type {
  HugFrameCollapseHandle,
  HugFrameHeight,
  HugFrameInstance,
  HugFrameOptions,
  HugFramePhase,
} from '@/lib/types'
import type { HugFrameMode, HugFrameSizing } from '@/lib/protocol'
import { buildCollapseAffordance } from '@/lib/template'
import { createAccordion } from '@/playground/accordion'
import { el, svg, type Child } from '@/playground/dom'
import {
  colorControl,
  numberControl,
  rangeControl,
  segmentedControl,
  selectControl,
  switchControl,
  textControl,
} from '@/playground/widgets'
import chromeHtml from '@/site/chrome.html?raw'

const BASE_URL = import.meta.env.BASE_URL
const CHILD_SRC = `${BASE_URL}child.html`
const ORIGIN = window.location.origin

/*
 * The library's public custom-property surface is seven tokens. Six of them are appearance
 * values and are driven from the Appearance and Motion groups; the seventh, --hug-z-index,
 * is engine-coupled (it must match HUGFRAME_Z_INDEX in core.ts) so it is read for the dock
 * and never written here. Everything else that used to be a token is a plain literal in the
 * library stylesheet now, and is restyled through the parts and state attributes instead —
 * see the recipes below.
 */
interface Tokens {
  surface: string
  line: string
  text: string
  accent: string
  duration: number
  initialHeightToken: number
}

type TokenKey = keyof Tokens

/*
 * The four colour tokens are theme-dependent: the library declares a light value and a
 * `prefers-color-scheme: dark` override on `.hug-root`. The page must not seed the controls
 * from fixed light literals, so the effective values are read off the mounted root and used
 * both as the controls' starting point and as the value Reset returns to.
 */
type ColourKey = 'surface' | 'line' | 'text' | 'accent'
const COLOUR_KEYS: readonly ColourKey[] = ['surface', 'line', 'text', 'accent']
type ThemeColours = Record<ColourKey, string>

// Only a fallback for the instant before the frame is mounted and its theme can be read.
const FALLBACK_THEME: ThemeColours = {
  surface: '#ffffff',
  line: '#dfe3ea',
  text: '#14171f',
  accent: '#4b46e0',
}

interface PlaygroundState {
  width: 'full' | 'wide' | 'half' | 'compact'
  recipe: RecipeId
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

type TokenValue = number | string

interface TokenDef {
  name: string
  css: (value: TokenValue) => string
}

const px = (value: TokenValue): string => `${value as number}px`
const ms = (value: TokenValue): string => `${value as number}ms`
const raw = (value: TokenValue): string => String(value)

// Every entry names the unit the token actually takes: lengths are px, a duration is ms, and
// the colour tokens pass through untouched. A token written with the wrong unit is silently
// dropped by CSS, which is why the unit lives next to the name.
const TOKEN_VARS: Record<TokenKey, TokenDef> = {
  surface: { name: '--hug-surface', css: raw },
  line: { name: '--hug-line', css: raw },
  text: { name: '--hug-text', css: raw },
  accent: { name: '--hug-accent', css: raw },
  duration: { name: '--hug-duration', css: ms },
  initialHeightToken: { name: '--hug-initial-height', css: px },
}

type RecipeId = 'none' | 'square' | 'flat' | 'outline' | 'tint'

interface Recipe {
  id: RecipeId
  label: string
  /** Shown to the reader verbatim, and injected into the page verbatim. */
  rules: string[]
}

/*
 * The demonstration that replaced the retired token half of the panel. Each recipe is a few
 * ordinary rules written against the parts (`data-hug-part`) and the state attributes
 * (`data-mode`), scoped to this frame by a class on its container. The library ships inside
 * `@layer hugframe`, so unlayered rules like these win with no `!important` — including the
 * expanded state. The strings below are both the copyable snippet and the CSS that runs.
 */
const RECIPES: Recipe[] = [
  {
    id: 'none',
    label: 'Library default',
    rules: [],
  },
  {
    id: 'square',
    label: 'Square frame',
    rules: [
      `.pg-recipe--square [data-hug-part='box'] {
  border-radius: 0;
}

.pg-recipe--square [data-hug-part='collapse'] > * {
  border-radius: 0;
}`,
    ],
  },
  {
    id: 'flat',
    label: 'Flat close control',
    rules: [
      `.pg-recipe--flat [data-hug-part='collapse'] > * {
  width: auto;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: var(--hug-accent);
  color: var(--hug-surface);
  font-family: var(--font-mono);
  font-size: 12px;
}

.pg-recipe--flat [data-hug-part='collapse-icon'] {
  width: 20px;
  height: 20px;
}`,
    ],
  },
  {
    id: 'outline',
    label: 'Wireframe',
    rules: [
      `.pg-recipe--outline [data-hug-part='box'] {
  border-radius: 4px;
  box-shadow: none;
  outline: 2px solid var(--hug-accent);
  outline-offset: 6px;
}`,
    ],
  },
  {
    id: 'tint',
    label: 'Accent tint',
    rules: [
      `.pg-recipe--tint [data-hug-part='box'] {
  background: color-mix(in srgb, var(--hug-accent) 7%, var(--hug-surface));
}

.pg-recipe--tint [data-hug-part='root'][data-mode='expanded'] [data-hug-part='box'] {
  border-radius: 18px;
  box-shadow: inset 0 0 0 3px var(--hug-accent);
}`,
    ],
  },
]

function recipeClass(id: RecipeId): string {
  return `pg-recipe--${id}`
}

const WIDTH_PRESETS: Record<PlaygroundState['width'], string> = {
  full: '100%',
  wide: '72%',
  half: '48%',
  compact: '340px',
}

function defaults(theme: ThemeColours): PlaygroundState {
  return {
    width: 'full',
    recipe: 'none',
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
      surface: theme.surface,
      line: theme.line,
      text: theme.text,
      accent: theme.accent,
      duration: 460,
      initialHeightToken: 240,
    },
  }
}

// getComputedStyle reports a custom property as the token stream it resolves to, which for
// the library is hex. A consumer's own value could arrive as rgb(), and a colour input only
// takes hex, so normalise before it reaches a control.
function cssColorToHex(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('')}`.toLowerCase()
  }
  const match = trimmed.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i)
  if (!match) return fallback
  const hex = match
    .slice(1, 4)
    .map((part) => Number.parseInt(part, 10).toString(16).padStart(2, '0'))
    .join('')
  return `#${hex}`
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
  const state = defaults(FALLBACK_THEME)
  // Colour tokens the reader has actually changed. Until one is touched the page writes
  // nothing, so the library's own value — and its dark-scheme override — governs the frame.
  const touchedColours = new Set<ColourKey>()
  let theme: ThemeColours = { ...FALLBACK_THEME }
  let mode: HugFrameMode = 'inline'
  let phase: HugFramePhase = 'idle'
  let sizing: HugFrameSizing = 'content'
  let ready = false
  let measured: number | null = null
  let uiReady = false

  // The recipe snippets are injected verbatim, so the selector shown beside the result is
  // literally the CSS that runs. Coming from an unlayered stylesheet, these rules beat the
  // library's @layer hugframe rules without needing !important.
  if (!document.getElementById('pg-recipes')) {
    document.head.append(
      el('style', {
        attrs: { id: 'pg-recipes' },
        text: RECIPES.flatMap((recipe) => recipe.rules).join('\n\n'),
      }),
    )
  }

  const syncHeightVisibility = (): void => {
    heightPxField.el.hidden = state.heightMode !== 'fixed'
    heightLengthField.el.hidden = state.heightMode !== 'length'
  }

  const commit = (): void => {
    applyAll()
  }

  const frameMount = el('div', { class: 'pg-frame' })

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
  const statusSlot = el('div', { class: 'pg-status' }, [meter])

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
      if (uiReady) modeField.set(next)
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

  // The mounted root has resolved the library's tokens for the active scheme, and the page
  // has not written a colour token yet, so this is the theme actually in effect.
  const readTheme = (): ThemeColours => {
    const computed = getComputedStyle(frame.element)
    return {
      surface: cssColorToHex(computed.getPropertyValue('--hug-surface'), FALLBACK_THEME.surface),
      line: cssColorToHex(computed.getPropertyValue('--hug-line'), FALLBACK_THEME.line),
      text: cssColorToHex(computed.getPropertyValue('--hug-text'), FALLBACK_THEME.text),
      accent: cssColorToHex(computed.getPropertyValue('--hug-accent'), FALLBACK_THEME.accent),
    }
  }

  // Adopt the active scheme for every colour the reader has not overridden, so the controls
  // start from what the library resolves to instead of a fixed light literal.
  const adoptTheme = (): void => {
    theme = readTheme()
    for (const key of COLOUR_KEYS) {
      if (touchedColours.has(key)) continue
      state.tokens[key] = theme[key]
    }
  }

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

  const surfaceField = colorControl({
    id: 'pg-surface',
    label: '--hug-surface',
    value: state.tokens.surface,
    onInput: (value) => {
      state.tokens.surface = value
      touchedColours.add('surface')
      commit()
    },
  })
  const lineField = colorControl({
    id: 'pg-line',
    label: '--hug-line',
    value: state.tokens.line,
    onInput: (value) => {
      state.tokens.line = value
      touchedColours.add('line')
      commit()
    },
  })
  const textField = colorControl({
    id: 'pg-text',
    label: '--hug-text',
    value: state.tokens.text,
    onInput: (value) => {
      state.tokens.text = value
      touchedColours.add('text')
      commit()
    },
  })
  const accentField = colorControl({
    id: 'pg-accent',
    label: '--hug-accent',
    value: state.tokens.accent,
    onInput: (value) => {
      state.tokens.accent = value
      touchedColours.add('accent')
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
  const modeField = segmentedControl({
    id: 'pg-mode',
    label: 'Frame mode',
    value: 'inline',
    meta: 'mirrors the frame',
    options: [
      { value: 'inline', label: 'Inline', title: 'The frame sits in the page and hugs the layout' },
      { value: 'expanded', label: 'Expanded', title: 'Morph to the chromeless full-window view' },
    ],
    onInput: (value) => {
      if (value === 'expanded') frame.expand()
      else frame.collapse()
    },
  })

  const widthField = segmentedControl({
    id: 'pg-width',
    label: 'Frame width',
    value: state.width,
    meta: 'drives a resize',
    options: [
      { value: 'full', label: '100%', title: 'The frame fills its column' },
      { value: 'wide', label: '72%', title: 'A narrower stage' },
      { value: 'half', label: '48%', title: 'Half the column' },
      { value: 'compact', label: '340px', title: 'A fixed narrow width' },
    ],
    onInput: (value) => {
      state.width = value as PlaygroundState['width']
      commit()
    },
  })

  const recipeField = selectControl({
    id: 'pg-recipe',
    label: 'Styling recipe',
    value: state.recipe,
    meta: 'copy the rule below',
    options: RECIPES.map((recipe) => ({ value: recipe.id, label: recipe.label })),
    onInput: (value) => {
      state.recipe = value as RecipeId
      commit()
    },
  })

  // ---- apply ----------------------------------------------------------------------

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

  function collapseOptions(): Pick<HugFrameOptions, 'collapseIcon' | 'renderCollapse'> {
    switch (state.affordance) {
      case 'svg':
        return { collapseIcon: customCollapseIcon(), renderCollapse: undefined }
      case 'text':
        return { collapseIcon: '×', renderCollapse: undefined }
      case 'custom':
        return {
          collapseIcon: undefined,
          renderCollapse: (handle) => customCollapseControl(handle),
        }
      case 'hidden':
        return { collapseIcon: undefined, renderCollapse: null }
      default:
        return { collapseIcon: undefined, renderCollapse: undefined }
    }
  }

  function applyCollapse(): void {
    const options = collapseOptions()
    frame.update(options)
    renderPreview(options)
  }

  function applyTokens(): void {
    for (const key of Object.keys(TOKEN_VARS) as TokenKey[]) {
      const def = TOKEN_VARS[key]
      const value = def.css(state.tokens[key])
      const isColour = COLOUR_KEYS.includes(key as ColourKey)
      // An untouched colour token is left to the library's own declaration, so the frame and
      // the preview keep following the active scheme; a touched one is written to both.
      const overridden = isColour && touchedColours.has(key as ColourKey)
      // The preview carries the same tokens, since it sits outside the frame's own tree but is
      // itself a `.hug-root`, so the library's declaration reaches it too.
      for (const node of [frame.element, previewSurface]) {
        if (isColour && !overridden) node.style.removeProperty(def.name)
        else node.style.setProperty(def.name, value)
      }
    }
  }

  // The recipe class rides on the two containers, never on .hug-root itself: the library owns
  // the root's class list, and a class on a stable ancestor is what a consumer would write.
  function applyRecipe(): void {
    const active = RECIPES.find((recipe) => recipe.id === state.recipe)
    for (const recipe of RECIPES) {
      if (recipe.rules.length === 0) continue
      const on = recipe === active
      const className = recipeClass(recipe.id)
      frameMount.classList.toggle(className, on)
      previewSurface.classList.toggle(className, on)
    }
    recipeCode.textContent =
      active?.rules.join('\n\n') || '/* no recipe: the frame as the library ships it */'
  }

  function applyWidth(): void {
    frameMount.style.width = WIDTH_PRESETS[state.width]
  }

  function applyAll(): void {
    applyOptions()
    applyCollapse()
    applyTokens()
    applyRecipe()
    applyWidth()
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
      statusSlot.append(meter)
      collapseGroupBody.prepend(affordanceField.el)
    }
  }

  // ---- chrome and stage -----------------------------------------------------------

  const { header, footer } = siteChrome()
  const main = el('main', { class: 'pg' })

  const resetButton = el('button', {
    class: 'btn',
    attrs: { type: 'button' },
    text: 'Reset all',
    on: {
      click: () => {
        // Drop the page's colour overrides first, so the theme is read from the library's own
        // declarations rather than from the values the reader had pinned.
        touchedColours.clear()
        applyTokens()
        adoptTheme()
        Object.assign(state, defaults(theme))
        syncControls()
        applyAll()
      },
    },
  })

  // The preview is a page-owned canvas, but it is given the library's `hug-root` class so the
  // four colour tokens and the dark-scheme override resolve on it exactly as they do on the
  // frame. It then paints the frame's own surface and edge instead of a hardcoded light panel.
  const previewSurface = el('div', { class: 'hug-root pg-preview__surface' })
  const previewNote = el('p', { class: 'pg-preview__note' })
  const preview = el(
    'section',
    { class: 'pg-preview', attrs: { 'aria-labelledby': 'pg-preview-title' } },
    [
      el('h3', {
        class: 'pg-preview__title',
        attrs: { id: 'pg-preview-title' },
        text: 'Collapse handle, live',
      }),
      previewSurface,
      previewNote,
    ],
  )

  // The handle is built exactly as the engine builds it and dropped into the same
  // [data-hug-part='collapse'] slot the box uses, so recipes that target the slot's child —
  // or the built-in glyph — apply here too.
  function renderPreview(options: Pick<HugFrameOptions, 'collapseIcon' | 'renderCollapse'>): void {
    const node = buildCollapseAffordance(options, { collapse: () => frame.collapse() })
    if (node) {
      const slot = el('div', { attrs: { 'data-hug-part': 'collapse' } }, [node])
      previewSurface.replaceChildren(slot)
    } else {
      previewSurface.replaceChildren()
    }
    previewNote.textContent = node
      ? 'The handle as the frame renders it, through the same slot. Style it with the recipes above; press it and the frame collapses.'
      : 'This mode renders no handle at all — the page collapses the frame instead.'
  }

  const title = el('h1', { class: 'pg-title', text: 'Playground' })

  const stage = el(
    'section',
    { class: 'pg-stage', attrs: { 'aria-labelledby': 'pg-stage-title' } },
    [
      el('div', { class: 'pg-stage__head' }, [
        el('h2', { attrs: { id: 'pg-stage-title' }, text: 'The frame, driven live' }),
        el('p', {
          class: 'pg-stage__note',
          text: 'Nothing here remounts the frame: every control calls update() or writes a token.',
        }),
      ]),
      statusSlot,
      frameMount,
      preview,
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

  function groupBody(children: Child[]): HTMLElement {
    return el('div', { class: 'pg-acc__body' }, children)
  }

  const recipeCode = el('pre', {
    class: 'pg-recipe__code',
    attrs: { tabindex: '0', 'aria-label': 'CSS for the selected recipe' },
  })

  const collapseGroupBody = groupBody([
    affordanceField.el,
    el('p', {
      class: 'pg-note',
      text: 'How the control looks is CSS now, not tokens. The Styling recipes in Appearance target the slot and the glyph the handle renders into.',
    }),
  ])

  const accordion = createAccordion([
    {
      id: 'sizing',
      title: 'Sizing',
      summary: 'What decides the inline height, and the bounds around it.',
      body: groupBody([
        heightMode.el,
        heightPxField.el,
        heightLengthField.el,
        minHeightField.el,
        maxHeightField.el,
        initialHeightField.el,
        initialHeightTokenField.el,
      ]),
    },
    {
      id: 'behaviour',
      title: 'Behaviour',
      summary: 'Timing, the expanded box and the host-side booleans.',
      body: groupBody([
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
    },
    {
      id: 'appearance',
      title: 'Appearance',
      summary: 'The four colour tokens, and recipes that restyle the frame with your own CSS.',
      body: groupBody([
        surfaceField.el,
        lineField.el,
        textField.el,
        accentField.el,
        el('p', {
          class: 'pg-note',
          text: 'Four of the seven public tokens are colours; --hug-duration lives in Motion and --hug-initial-height in Sizing. --hug-z-index is engine-coupled, so the page reads it but never writes it. Radius, borders, shadows, the backdrop, the glass and the close control are plain literals in the stylesheet now — style them through the parts below.',
        }),
        recipeField.el,
        recipeCode,
        el('p', {
          class: 'pg-note',
          text: 'Each recipe is ordinary CSS against data-hug-part and the state attributes, scoped to this frame by a class on its container. The library ships inside @layer hugframe, so unlayered rules like these win with no !important — the accent recipe also reaches the expanded state.',
        }),
      ]),
    },
    {
      id: 'motion',
      title: 'Motion',
      summary: 'The one duration token still left; the rest are literals in the stylesheet.',
      body: groupBody([
        durationField.el,
        el('p', {
          class: 'pg-note',
          text: 'The other durations and both easings were retired with the token surface; their values are literals in the stylesheet, so a control for them would write a property nothing reads.',
        }),
      ]),
    },
    {
      id: 'collapse',
      title: 'Collapse control',
      summary: 'Five ways to show the close control, previewed under the frame.',
      body: collapseGroupBody,
    },
  ])

  const sidebar = el('aside', { class: 'pg-sidebar', attrs: { 'aria-label': 'Frame settings' } }, [
    el('div', { class: 'pg-sidebar__inner' }, [
      el('div', { class: 'pg-sidebar__top' }, [
        modeField.el,
        widthField.el,
        el('div', { class: 'pg-sidebar__row' }, [
          el('p', { class: 'pg-sidebar__note', text: 'Defaults sit beside each control.' }),
          resetButton,
        ]),
      ]),
      accordion.root,
    ]),
  ])

  const body = el('div', { class: 'pg-body' }, [stage, sidebar])

  main.append(title, body, dock)

  container.append(header, main, footer)

  // The sidebar is capped to what is left of the viewport once the masthead, the page
  // title and the footer have taken their share, so a long control list scrolls inside
  // itself instead of stretching the document.
  const chromeParts = [header, title, footer]
  const measureChrome = (): void => {
    const height = chromeParts.reduce(
      (total, node) => total + node.getBoundingClientRect().height,
      0,
    )
    main.style.setProperty('--pg-chrome', `${Math.round(height)}px`)
  }
  if (typeof ResizeObserver !== 'undefined') {
    const chromeObserver = new ResizeObserver(measureChrome)
    for (const node of chromeParts) chromeObserver.observe(node)
  }
  measureChrome()

  // ---- refresh --------------------------------------------------------------------

  function syncControls(): void {
    widthField.set(state.width)
    recipeField.set(state.recipe)
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
    surfaceField.set(state.tokens.surface)
    lineField.set(state.tokens.line)
    textField.set(state.tokens.text)
    accentField.set(state.tokens.accent)
    durationField.set(state.tokens.duration)
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
  // The frame is in the document now, so its computed tokens are the theme in effect; seed
  // the colour controls from them before the first paint.
  adoptTheme()
  syncControls()
  applyAll()
  syncExpanded()

  // If the OS scheme changes while the page is open, re-read the library's values for every
  // colour the reader has not overridden, so an untouched panel keeps matching its theme.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    adoptTheme()
    surfaceField.set(state.tokens.surface)
    lineField.set(state.tokens.line)
    textField.set(state.tokens.text)
    accentField.set(state.tokens.accent)
    applyTokens()
  })
}
