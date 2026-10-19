import {
  HUGFRAME_SOURCE,
  isHugFrameParentMessage,
  postHugFrameMessage,
  type HugFrameChildMessage,
  type HugFrameMode,
  type HugFrameRequestAction,
  type HugFrameSizing,
} from './protocol'

const ROOT_ELEMENT_SELECTOR = 'document.documentElement'

export interface HugFrameChildOptions {
  /** origin expected for the host document; default '*' (no check) */
  targetOrigin?: string
  /** element whose box height drives the frame; default 'document.documentElement' */
  sizeSelector?: string
  /** constant px added to every reported height; default 0 */
  offsetHeight?: number
  /** px deadband below which a measured size change is not reported; default 0.5 */
  reportEpsilon?: number
  onMessage?: (payload: unknown) => void
  onModeChange?: (mode: HugFrameMode) => void
  onSizingChange?: (sizing: HugFrameSizing) => void
}

export interface HugFrameChild {
  readonly isFramed: boolean
  readonly mode: HugFrameMode
  readonly sizing: HugFrameSizing
  resize(): void
  suspend(): void
  resume(): void
  requestExpand(): void
  requestCollapse(): void
  requestClose(): void
  sendMessage(payload: unknown): void
  destroy(): void
}

interface MeasuredSize {
  height: number
  width: number
}

function resolveSizeElement(selector: string): Element {
  if (selector === ROOT_ELEMENT_SELECTOR) return document.documentElement
  try {
    return document.querySelector(selector) ?? document.documentElement
  } catch {
    return document.documentElement
  }
}

let currentChild: HugFrameChild | undefined

export function createHugFrameChild(options: HugFrameChildOptions = {}): HugFrameChild {
  const {
    targetOrigin = '*',
    sizeSelector = ROOT_ELEMENT_SELECTOR,
    offsetHeight = 0,
    reportEpsilon = 0.5,
    onMessage,
    onModeChange,
    onSizingChange,
  } = options

  const isFramed = window.parent !== window
  const sizeElement = resolveSizeElement(sizeSelector)
  let mode: HugFrameMode = 'inline'
  let sizing: HugFrameSizing = 'content'
  let suspended = false
  let destroyed = false
  let frameHandle: number | null = null
  let lastSize: MeasuredSize | null = null
  let observer: ResizeObserver | null = null

  function post(message: HugFrameChildMessage): void {
    if (!isFramed || destroyed) return
    postHugFrameMessage(window.parent, message, targetOrigin)
  }

  function measure(): MeasuredSize {
    const rect = sizeElement.getBoundingClientRect()
    return {
      height: Math.max(0, Math.ceil(rect.height + offsetHeight)),
      width: Math.max(0, Math.ceil(rect.width)),
    }
  }

  function flush(force = false): void {
    frameHandle = null
    if (destroyed || suspended) return
    const next = measure()
    if (
      !force &&
      lastSize !== null &&
      Math.abs(next.height - lastSize.height) < reportEpsilon &&
      Math.abs(next.width - lastSize.width) < reportEpsilon
    ) {
      return
    }
    lastSize = next
    post({ source: HUGFRAME_SOURCE, type: 'size', height: next.height, width: next.width })
  }

  function cancelFrame(): void {
    if (frameHandle !== null) {
      window.cancelAnimationFrame(frameHandle)
      frameHandle = null
    }
  }

  function schedule(): void {
    if (destroyed || suspended || frameHandle !== null) return
    frameHandle = window.requestAnimationFrame(() => flush())
  }

  function resize(): void {
    if (destroyed) return
    cancelFrame()
    flush(true)
  }

  function suspend(): void {
    suspended = true
    cancelFrame()
  }

  function resume(): void {
    if (destroyed) return
    suspended = false
    resize()
  }

  function request(action: HugFrameRequestAction): void {
    post({ source: HUGFRAME_SOURCE, type: 'request', action })
  }

  function sendMessage(payload: unknown): void {
    post({ source: HUGFRAME_SOURCE, type: 'custom', payload })
  }

  function applySizing(next: HugFrameSizing): void {
    const changed = next !== sizing
    sizing = next
    if (changed) document.documentElement.dataset.hugSizing = next
    onSizingChange?.(next)
  }

  function handleMessage(event: MessageEvent): void {
    if (destroyed) return
    if (targetOrigin !== '*' && (event.origin !== targetOrigin || event.source !== window.parent)) {
      return
    }
    if (!isHugFrameParentMessage(event.data)) return
    const message = event.data
    if (message.type === 'mode') {
      mode = message.mode
      onModeChange?.(mode)
      return
    }
    if (message.type === 'sizing') {
      applySizing(message.sizing)
      return
    }
    onMessage?.(message.payload)
  }

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    cancelFrame()
    observer?.disconnect()
    observer = null
    window.removeEventListener('resize', schedule)
    window.removeEventListener('message', handleMessage)
    window.visualViewport?.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('scroll', schedule)
    if (currentChild === instance) currentChild = undefined
  }

  const instance: HugFrameChild = {
    isFramed,
    get mode() {
      return mode
    },
    get sizing() {
      return sizing
    },
    resize,
    suspend,
    resume,
    requestExpand: () => request('expand'),
    requestCollapse: () => request('collapse'),
    requestClose: () => request('close'),
    sendMessage,
    destroy,
  }

  document.documentElement.dataset.hugSizing = sizing

  if (isFramed) {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => schedule())
      observer.observe(sizeElement)
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('message', handleMessage)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    post({ source: HUGFRAME_SOURCE, type: 'ready' })
    resize()
  }

  currentChild = instance
  return instance
}

export function getHugFrameChild(): HugFrameChild | undefined {
  return currentChild
}
