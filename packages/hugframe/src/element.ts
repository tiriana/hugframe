import { HUGFRAME_Z_INDEX, createHugFrame } from './core'
import type { HugFrameMode, HugFrameSizing } from './protocol'
import type { HugFrameHeight, HugFrameInstance, HugFrameOptions, HugFramePhase } from './types'

const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement

const OBSERVED_ATTRIBUTES = [
  'src',
  'title',
  'target-origin',
  'mode',
  'height',
  'min-height',
  'max-height',
  'initial-height',
  'resize-settle-ms',
  'resize-safety-ms',
  'resize-width-epsilon',
  'morph-settle-margin-ms',
  'expanded-width',
  'expanded-height',
]

function parseHeight(value: string | null): HugFrameHeight | undefined {
  if (value === null) return undefined
  if (value === 'content') return 'content'
  const numeric = Number(value)
  if (value.trim() !== '' && Number.isFinite(numeric)) return numeric
  return value
}

function parseNumber(value: string | null): number | undefined {
  if (value === null) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseMode(value: string | null): HugFrameMode | undefined {
  return value === 'expanded' || value === 'inline' ? value : undefined
}

export class HugFrameElement extends ElementBase {
  static readonly observedAttributes = OBSERVED_ATTRIBUTES

  #instance: HugFrameInstance | null = null
  #disconnectToken = 0
  #collapseIcon: Node | string | undefined = undefined
  #renderCollapse: HugFrameOptions['renderCollapse'] = undefined
  #iframeProps: HugFrameOptions['iframeProps'] = undefined
  #lockScroll: boolean | undefined = undefined
  #manageFocus: boolean | undefined = undefined
  #collapseOnEscape: boolean | undefined = undefined

  #onModeChangeEvent = (event: Event): void => {
    const detail = (event as CustomEvent<{ mode?: HugFrameMode }>).detail
    const next = detail?.mode
    if (next && this.getAttribute('mode') !== next) this.setAttribute('mode', next)
  }

  connectedCallback(): void {
    this.#disconnectToken += 1
    if (this.#instance) return
    const instance = createHugFrame(this.#readOptions())
    this.#instance = instance
    instance.element.addEventListener('hugframe:modechange', this.#onModeChangeEvent)
    if (!this.hasAttribute('mode')) this.setAttribute('mode', instance.getMode())
  }

  disconnectedCallback(): void {
    const token = (this.#disconnectToken += 1)
    queueMicrotask(() => {
      if (token !== this.#disconnectToken) return
      this.#teardown()
    })
  }

  attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
    const instance = this.#instance
    if (!instance) return
    switch (name) {
      case 'src':
        instance.update({ src: value ?? '' })
        return
      case 'title':
        instance.update({ title: value ?? '' })
        return
      case 'target-origin':
        instance.update({ targetOrigin: value ?? undefined })
        return
      case 'mode':
        if (value === 'expanded') instance.expand()
        else if (value === 'inline') instance.collapse()
        return
      case 'height':
        instance.update({ height: parseHeight(value) })
        return
      case 'min-height':
        instance.update({ minHeight: parseNumber(value) })
        return
      case 'max-height':
        instance.update({ maxHeight: parseNumber(value) })
        return
      case 'initial-height':
        instance.update({ initialHeight: parseNumber(value) })
        return
      case 'resize-settle-ms':
        instance.update({ resizeSettleMs: parseNumber(value) })
        return
      case 'resize-safety-ms':
        instance.update({ resizeSafetyMs: parseNumber(value) })
        return
      case 'resize-width-epsilon':
        instance.update({ resizeWidthEpsilon: parseNumber(value) })
        return
      case 'morph-settle-margin-ms':
        instance.update({ morphSettleMarginMs: parseNumber(value) })
        return
      case 'expanded-width':
        instance.update({ expandedWidth: value ?? undefined })
        return
      case 'expanded-height':
        instance.update({ expandedHeight: value ?? undefined })
        return
    }
  }

  get mode(): HugFrameMode {
    return this.getMode()
  }

  set mode(value: HugFrameMode) {
    if (value === 'expanded') this.expand()
    else this.collapse()
  }

  get resizeSettleMs(): number | undefined {
    return parseNumber(this.getAttribute('resize-settle-ms'))
  }

  set resizeSettleMs(value: number | undefined) {
    this.#writeAttribute('resize-settle-ms', value)
  }

  get resizeSafetyMs(): number | undefined {
    return parseNumber(this.getAttribute('resize-safety-ms'))
  }

  set resizeSafetyMs(value: number | undefined) {
    this.#writeAttribute('resize-safety-ms', value)
  }

  get resizeWidthEpsilon(): number | undefined {
    return parseNumber(this.getAttribute('resize-width-epsilon'))
  }

  set resizeWidthEpsilon(value: number | undefined) {
    this.#writeAttribute('resize-width-epsilon', value)
  }

  get morphSettleMarginMs(): number | undefined {
    return parseNumber(this.getAttribute('morph-settle-margin-ms'))
  }

  set morphSettleMarginMs(value: number | undefined) {
    this.#writeAttribute('morph-settle-margin-ms', value)
  }

  get expandedWidth(): string | undefined {
    return this.getAttribute('expanded-width') ?? undefined
  }

  set expandedWidth(value: string | undefined) {
    this.#writeAttribute('expanded-width', value)
  }

  get expandedHeight(): string | undefined {
    return this.getAttribute('expanded-height') ?? undefined
  }

  set expandedHeight(value: string | undefined) {
    this.#writeAttribute('expanded-height', value)
  }

  get lockScroll(): boolean {
    return this.#lockScroll ?? true
  }

  set lockScroll(value: boolean) {
    this.#lockScroll = value
    this.#instance?.update({ lockScroll: value })
  }

  get manageFocus(): boolean {
    return this.#manageFocus ?? true
  }

  set manageFocus(value: boolean) {
    this.#manageFocus = value
    this.#instance?.update({ manageFocus: value })
  }

  get collapseOnEscape(): boolean {
    return this.#collapseOnEscape ?? true
  }

  set collapseOnEscape(value: boolean) {
    this.#collapseOnEscape = value
    this.#instance?.update({ collapseOnEscape: value })
  }

  get collapseIcon(): Node | string | undefined {
    return this.#collapseIcon
  }

  set collapseIcon(value: Node | string | undefined) {
    this.#collapseIcon = value
    this.#instance?.update({ collapseIcon: value })
  }

  get renderCollapse(): HugFrameOptions['renderCollapse'] {
    return this.#renderCollapse
  }

  set renderCollapse(value: HugFrameOptions['renderCollapse']) {
    this.#renderCollapse = value
    this.#instance?.update({ renderCollapse: value })
  }

  get iframeProps(): HugFrameOptions['iframeProps'] {
    return this.#iframeProps
  }

  set iframeProps(value: HugFrameOptions['iframeProps']) {
    this.#iframeProps = value
    this.#instance?.update({ iframeProps: value })
  }

  expand(): void {
    this.#instance?.expand()
  }

  collapse(): void {
    this.#instance?.collapse()
  }

  toggle(): void {
    this.#instance?.toggle()
  }

  sendMessage(payload: unknown): void {
    this.#instance?.sendMessage(payload)
  }

  getIframe(): HTMLIFrameElement | null {
    return this.#instance?.getIframe() ?? null
  }

  getMode(): HugFrameMode {
    return this.#instance?.getMode() ?? 'inline'
  }

  getPhase(): HugFramePhase {
    return this.#instance?.getPhase() ?? 'idle'
  }

  getSizing(): HugFrameSizing {
    return this.#instance?.getSizing() ?? 'content'
  }

  getZIndex(): number {
    return this.#instance?.getZIndex() ?? HUGFRAME_Z_INDEX
  }

  update(next: Partial<HugFrameOptions>): void {
    this.#instance?.update(next)
  }

  destroy(): void {
    this.#teardown()
  }

  #teardown(): void {
    const instance = this.#instance
    if (!instance) return
    this.#instance = null
    instance.element.removeEventListener('hugframe:modechange', this.#onModeChangeEvent)
    instance.destroy()
  }

  #writeAttribute(name: string, value: number | string | undefined): void {
    if (value === undefined) this.removeAttribute(name)
    else this.setAttribute(name, String(value))
  }

  #readOptions(): HugFrameOptions {
    return {
      container: this,
      src: this.getAttribute('src') ?? '',
      title: this.getAttribute('title') ?? '',
      targetOrigin: this.getAttribute('target-origin') ?? undefined,
      initialMode: parseMode(this.getAttribute('mode')),
      height: parseHeight(this.getAttribute('height')),
      minHeight: parseNumber(this.getAttribute('min-height')),
      maxHeight: parseNumber(this.getAttribute('max-height')),
      initialHeight: parseNumber(this.getAttribute('initial-height')),
      resizeSettleMs: parseNumber(this.getAttribute('resize-settle-ms')),
      resizeSafetyMs: parseNumber(this.getAttribute('resize-safety-ms')),
      resizeWidthEpsilon: parseNumber(this.getAttribute('resize-width-epsilon')),
      morphSettleMarginMs: parseNumber(this.getAttribute('morph-settle-margin-ms')),
      expandedWidth: this.getAttribute('expanded-width') ?? undefined,
      expandedHeight: this.getAttribute('expanded-height') ?? undefined,
      lockScroll: this.#lockScroll,
      manageFocus: this.#manageFocus,
      collapseOnEscape: this.#collapseOnEscape,
      collapseIcon: this.#collapseIcon,
      renderCollapse: this.#renderCollapse,
      iframeProps: this.#iframeProps,
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hug-frame': HugFrameElement
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('hug-frame')) {
  customElements.define('hug-frame', HugFrameElement)
}
