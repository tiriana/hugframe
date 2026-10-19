import type { HugFrameSizing } from './protocol'
import type { HugFrameHeight } from './types'

export const DEFAULT_INITIAL_HEIGHT = 240
export const DEFAULT_MAX_HEIGHT = 720
export const DEFAULT_MORPH_MS = 460

export interface InlineHeightBounds {
  initialHeight?: number
  minHeight?: number
  maxHeight?: number
}

export function readTokenMs(element: HTMLElement, token: string, fallback: number): number {
  const raw = getComputedStyle(element).getPropertyValue(token).trim()
  if (raw === '') return fallback
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return fallback
  if (raw.endsWith('ms')) return value
  if (raw.endsWith('s')) return value * 1000
  return value
}

export function resolveFixedHeight(height: HugFrameHeight | undefined): string | null {
  if (height === undefined || height === 'content') return null
  return typeof height === 'number' ? `${height}px` : height
}

export function resolveSizing(height: HugFrameHeight | undefined): HugFrameSizing {
  return resolveFixedHeight(height) === null ? 'content' : 'fixed'
}

export function clampInlineHeight(raw: number, bounds: InlineHeightBounds): number {
  const min = bounds.minHeight ?? 0
  const max = bounds.maxHeight ?? DEFAULT_MAX_HEIGHT
  return Math.min(Math.max(raw, min), max)
}

export function computeInlineHeight(
  contentHeight: number | null,
  bounds: InlineHeightBounds,
): number {
  const raw = contentHeight ?? bounds.initialHeight ?? DEFAULT_INITIAL_HEIGHT
  return clampInlineHeight(raw, bounds)
}

let scrollLockCount = 0
let previousDocumentOverflow = ''

export function lockDocumentScroll(): void {
  if (typeof document === 'undefined') return
  if (scrollLockCount === 0) {
    previousDocumentOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
  }
  scrollLockCount += 1
}

export function unlockDocumentScroll(): void {
  if (typeof document === 'undefined') return
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) {
    document.documentElement.style.overflow = previousDocumentOverflow
  }
}
