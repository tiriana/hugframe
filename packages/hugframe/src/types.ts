import type { HugFrameMode, HugFrameSizing } from './protocol'

export type HugFramePhase = 'idle' | 'expanding' | 'collapsing' | 'resizing'
export type HugFrameHeight = 'content' | number | string

export interface HugFrameCollapseHandle {
  collapse(): void
}

export type HugFrameRenderCollapse = (handle: HugFrameCollapseHandle) => Node

export interface HugFrameOptions {
  container: HTMLElement
  src: string
  title: string
  targetOrigin?: string
  initialMode?: HugFrameMode
  height?: HugFrameHeight
  minHeight?: number
  maxHeight?: number
  initialHeight?: number
  collapseIcon?: Node | string
  renderCollapse?: HugFrameRenderCollapse | null
  className?: string
  style?: Partial<CSSStyleDeclaration>
  iframeProps?: Record<string, string | number | boolean | null | undefined>
  /** Width quiescence, ms, the resizing phase waits for before settling; default 120 */
  resizeSettleMs?: number
  /** Ceiling, ms, on the resizing phase's wait; default 400 */
  resizeSafetyMs?: number
  /** Width change, px, below or at which a layout change is not treated as a resize; default 1 */
  resizeWidthEpsilon?: number
  /** Margin, ms, added to the morph duration for the transitionend fallback timer; default 90 */
  morphSettleMarginMs?: number
  /** Inline width written on the box once expanded; default '100vw' */
  expandedWidth?: string
  /** Inline height written on the box once expanded; default '100dvh' */
  expandedHeight?: string
  /** Ref-counted document scroll lock while expanded; default true */
  lockScroll?: boolean
  /** Move focus into the frame on expand and return it on collapse; default true */
  manageFocus?: boolean
  /** Escape in the host document collapses the frame; default true. A framed document that requests a collapse explicitly is honoured regardless. */
  collapseOnEscape?: boolean
  onModeChange?(mode: HugFrameMode): void
  onPhaseChange?(phase: HugFramePhase): void
  onSizingChange?(sizing: HugFrameSizing): void
  onReady?(): void
  onRequestClose?(): void
  onMessage?(payload: unknown): void
}

export interface HugFrameInstance {
  readonly element: HTMLElement
  getIframe(): HTMLIFrameElement | null
  getMode(): HugFrameMode
  getPhase(): HugFramePhase
  getSizing(): HugFrameSizing
  getZIndex(): number
  expand(): void
  collapse(): void
  toggle(): void
  sendMessage(payload: unknown): void
  update(next: Partial<HugFrameOptions>): void
  destroy(): void
}
