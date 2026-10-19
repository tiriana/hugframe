import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import { createHugFrame } from 'hugframe'
import type {
  HugFrameInstance,
  HugFrameMode,
  HugFrameOptions,
  HugFramePhase,
  HugFrameSizing,
} from 'hugframe'

export type HugFrameProps = Omit<HugFrameOptions, 'container'> & {
  /**
   * Rendered next to the frame rather than inside it, but within the frame's context, so
   * a child can call `useHugFrameMode` and the other hooks.
   */
  children?: ReactNode
}
export type HugFrameHandle = HugFrameInstance

// A layout effect warns when it runs during a server render, and a frame can only be
// created in a browser, so the server render uses the passive effect instead.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// Everything the engine can be told to change after it was created. The callbacks are
// left out on purpose: they are read through a ref, so passing an inline handler
// neither re-creates the frame nor makes the engine rebind anything.
const SYNCED_KEYS = [
  'src',
  'title',
  'targetOrigin',
  'initialMode',
  'height',
  'minHeight',
  'maxHeight',
  'initialHeight',
  'collapseIcon',
  'renderCollapse',
  'className',
  'style',
  'iframeProps',
  'resizeSettleMs',
  'resizeSafetyMs',
  'resizeWidthEpsilon',
  'morphSettleMarginMs',
  'expandedWidth',
  'expandedHeight',
  'lockScroll',
  'manageFocus',
  'collapseOnEscape',
] as const

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype

// `style` and `iframeProps` are usually written inline, so comparing them by identity
// would report a change on every render and re-apply them to the engine each time.
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!isPlainObject(left) || !isPlainObject(right)) return false

  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.is(left[key], right[key]))
  )
}

interface HugFrameStore {
  subscribe(listener: () => void): () => void
  notify(): void
}

interface HugFrameContextValue {
  instance: HugFrameInstance | null
  store: HugFrameStore
}

const HugFrameContext = createContext<HugFrameContextValue | null>(null)

function useHugFrameContext(): HugFrameContextValue {
  const value = useContext(HugFrameContext)
  if (value === null) {
    throw new Error(
      'hugframe: this hook reads the frame it is rendered in, so it needs a <HugFrame> above it',
    )
  }
  return value
}

export const HugFrame = forwardRef<HugFrameHandle, HugFrameProps>(function HugFrame(
  { children, ...props },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<HugFrameInstance | null>(null)
  const appliedRef = useRef<HugFrameProps | null>(null)
  const [instance, setInstance] = useState<HugFrameInstance | null>(null)

  // Callbacks are read through this ref rather than handed to the engine as props, so an
  // inline handler is always the latest one without the frame being created again.
  const propsRef = useRef(props)
  propsRef.current = props

  const store = useMemo<HugFrameStore>(() => {
    const listeners = new Set<() => void>()
    return {
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      notify() {
        for (const listener of listeners) listener()
      },
    }
  }, [])

  const callbacks = useMemo(
    () => ({
      onModeChange: (mode: HugFrameMode) => {
        store.notify()
        propsRef.current.onModeChange?.(mode)
      },
      onPhaseChange: (phase: HugFramePhase) => {
        store.notify()
        propsRef.current.onPhaseChange?.(phase)
      },
      onSizingChange: (sizing: HugFrameSizing) => {
        store.notify()
        propsRef.current.onSizingChange?.(sizing)
      },
      onReady: () => propsRef.current.onReady?.(),
      onRequestClose: () => propsRef.current.onRequestClose?.(),
      onMessage: (payload: unknown) => propsRef.current.onMessage?.(payload),
    }),
    [store],
  )

  // Declared before the handle below: layout effects run in the order they are declared,
  // so the instance exists by the time the handle is built. StrictMode mounts, unmounts
  // and mounts again, and destroying in the cleanup keeps that to one frame.
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const frame = createHugFrame({ ...propsRef.current, ...callbacks, container })
    instanceRef.current = frame
    appliedRef.current = propsRef.current
    setInstance(frame)

    return () => {
      setInstance(null)
      instanceRef.current = null
      appliedRef.current = null
      frame.destroy()
    }
  }, [callbacks])

  useImperativeHandle(ref, () => instanceRef.current as HugFrameHandle, [])

  // Runs after every render and touches the engine only when a prop it owns really
  // changed: handing the engine the same `src` again would reload the framed document.
  useIsomorphicLayoutEffect(() => {
    const frame = instanceRef.current
    const applied = appliedRef.current
    if (frame === null || applied === null) return

    const changed: Record<string, unknown> = {}
    let count = 0

    for (const key of SYNCED_KEYS) {
      if (!sameValue(applied[key], props[key])) {
        changed[key] = props[key]
        count += 1
      }
    }

    appliedRef.current = props

    if (count > 0) frame.update(changed as Partial<HugFrameOptions>)
  })

  const value = useMemo(() => ({ instance, store }), [instance, store])

  return (
    <HugFrameContext.Provider value={value}>
      <div ref={containerRef} />
      {children}
    </HugFrameContext.Provider>
  )
})

/** The frame rendered by the nearest `<HugFrame>`, or null during the first render. */
export function useHugFrame(): HugFrameInstance | null {
  return useHugFrameContext().instance
}

function useHugFrameSelector<T>(select: (frame: HugFrameInstance) => T, fallback: T): T {
  const { instance, store } = useHugFrameContext()

  const getSnapshot = useCallback(
    () => (instance === null ? fallback : select(instance)),
    [instance, select, fallback],
  )
  const getServerSnapshot = useCallback(() => fallback, [fallback])

  return useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot)
}

const readMode = (frame: HugFrameInstance): HugFrameMode => frame.getMode()
const readPhase = (frame: HugFrameInstance): HugFramePhase => frame.getPhase()
const readSizing = (frame: HugFrameInstance): HugFrameSizing => frame.getSizing()

/** The frame's mode, re-rendering the component that reads it when it changes. */
export function useHugFrameMode(): HugFrameMode {
  return useHugFrameSelector(readMode, 'inline')
}

/** The frame's phase, re-rendering the component that reads it when it changes. */
export function useHugFramePhase(): HugFramePhase {
  return useHugFrameSelector(readPhase, 'idle')
}

/** The frame's sizing, re-rendering the component that reads it when it changes. */
export function useHugFrameSizing(): HugFrameSizing {
  return useHugFrameSelector(readSizing, 'content')
}
