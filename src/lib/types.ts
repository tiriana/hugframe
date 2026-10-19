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
