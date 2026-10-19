export const HUGFRAME_SOURCE = 'hugframe'

export type HugFrameMode = 'inline' | 'expanded'
export type HugFrameRequestAction = 'expand' | 'collapse' | 'close'
export type HugFrameSizing = 'content' | 'fixed'

export type HugFrameChildMessage =
  | { source: 'hugframe'; type: 'ready' }
  | { source: 'hugframe'; type: 'size'; height: number; width: number }
  | { source: 'hugframe'; type: 'request'; action: HugFrameRequestAction }
  | { source: 'hugframe'; type: 'custom'; payload: unknown }

export type HugFrameParentMessage =
  | { source: 'hugframe'; type: 'mode'; mode: HugFrameMode }
  | { source: 'hugframe'; type: 'sizing'; sizing: HugFrameSizing }
  | { source: 'hugframe'; type: 'custom'; payload: unknown }

const REQUEST_ACTIONS: readonly string[] = ['expand', 'collapse', 'close']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRequestAction(value: unknown): value is HugFrameRequestAction {
  return typeof value === 'string' && REQUEST_ACTIONS.includes(value)
}

function isMode(value: unknown): value is HugFrameMode {
  return value === 'inline' || value === 'expanded'
}

function isSizing(value: unknown): value is HugFrameSizing {
  return value === 'content' || value === 'fixed'
}

export function isHugFrameChildMessage(value: unknown): value is HugFrameChildMessage {
  if (!isRecord(value) || value.source !== HUGFRAME_SOURCE) return false
  switch (value.type) {
    case 'ready':
      return true
    case 'size':
      return isFiniteNumber(value.height) && isFiniteNumber(value.width)
    case 'request':
      return isRequestAction(value.action)
    case 'custom':
      return 'payload' in value
    default:
      return false
  }
}

export function isHugFrameParentMessage(value: unknown): value is HugFrameParentMessage {
  if (!isRecord(value) || value.source !== HUGFRAME_SOURCE) return false
  switch (value.type) {
    case 'mode':
      return isMode(value.mode)
    case 'sizing':
      return isSizing(value.sizing)
    case 'custom':
      return 'payload' in value
    default:
      return false
  }
}

export function postHugFrameMessage(
  target: Window,
  message: HugFrameChildMessage | HugFrameParentMessage,
  targetOrigin: string,
): void {
  try {
    target.postMessage(message, targetOrigin)
  } catch {
    // structured clone rejects exotic payloads (functions, proxies); the channel is best-effort
  }
}
