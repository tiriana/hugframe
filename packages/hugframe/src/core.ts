import {
  HUGFRAME_SOURCE,
  isHugFrameChildMessage,
  postHugFrameMessage,
  type HugFrameMode,
  type HugFrameParentMessage,
  type HugFrameRequestAction,
  type HugFrameSizing,
} from './protocol'
import {
  DEFAULT_INITIAL_HEIGHT,
  DEFAULT_MORPH_MS,
  clampInlineHeight,
  computeInlineHeight,
  lockDocumentScroll,
  readTokenMs,
  resolveFixedHeight,
  resolveSizing,
  unlockDocumentScroll,
} from './geometry'
import { buildCollapseAffordance, createHugFrameTemplate } from './template'
import type { HugFrameInstance, HugFrameOptions, HugFramePhase } from './types'

/** Default stacking level for the morph. Must match `--hug-z-index` in hugframe.css. */
// Few significant digits on purpose: CSS minifiers, Lightning CSS included, round
// longer numeric literals, which would leave the shipped stylesheet disagreeing
// with this constant. test/dist.test.js guards the pair.
export const HUGFRAME_Z_INDEX = 1000000000

const RESIZE_SETTLE_MS = 120
const RESIZE_SAFETY_MS = 400
const RESIZE_WIDTH_EPSILON = 1
const MORPH_SETTLE_MARGIN_MS = 90
const EXPANDED_WIDTH = '100vw'
const EXPANDED_HEIGHT = '100dvh'

export function createHugFrame(options: HugFrameOptions): HugFrameInstance {
  const template = createHugFrameTemplate(options)

  let opts = options
  let mode: HugFrameMode = options.initialMode ?? 'inline'
  let phase: HugFramePhase = 'idle'
  let appliedMode: HugFrameMode = 'inline'
  let sizing: HugFrameSizing = resolveSizing(options.height)
  let contentHeight: number | null = null
  let inlineHeight = clampInlineHeight(options.initialHeight ?? DEFAULT_INITIAL_HEIGHT, options)
  let locked = false
  let focusReturn: HTMLElement | null = null
  let lastWidth: number | null = null
  let settleCancel: (() => void) | null = null
  let rafId: number | null = null
  let resizeSettleTimer: number | null = null
  let resizeSafetyTimer: number | null = null
  let observer: ResizeObserver | null = null
  let motionQuery: MediaQueryList | null = null
  let prefersReducedMotion = false
  let escapeBound = false
  let initialized = false
  let destroyed = false

  function emit(type: string, detail: unknown): void {
    template.root.dispatchEvent(new CustomEvent(type, { detail, bubbles: false }))
  }

  function emitModeChange(next: HugFrameMode): void {
    emit('hugframe:modechange', { mode: next })
    opts.onModeChange?.(next)
  }

  function emitPhaseChange(next: HugFramePhase): void {
    emit('hugframe:phasechange', { phase: next })
    opts.onPhaseChange?.(next)
  }

  function emitSizingChange(next: HugFrameSizing): void {
    emit('hugframe:sizingchange', { sizing: next })
    opts.onSizingChange?.(next)
  }

  function emitReady(): void {
    emit('hugframe:ready', null)
    opts.onReady?.()
  }

  function emitRequestClose(): void {
    emit('hugframe:requestclose', null)
    opts.onRequestClose?.()
  }

  function emitMessage(payload: unknown): void {
    emit('hugframe:message', { payload })
    opts.onMessage?.(payload)
  }

  function postToChild(message: HugFrameParentMessage): void {
    const target = template.iframe.contentWindow
    if (!target) return
    postHugFrameMessage(target, message, opts.targetOrigin ?? window.location.origin)
  }

  function notifyMode(next: HugFrameMode): void {
    postToChild({ source: HUGFRAME_SOURCE, type: 'mode', mode: next })
  }

  function notifySizing(next: HugFrameSizing): void {
    postToChild({ source: HUGFRAME_SOURCE, type: 'sizing', sizing: next })
  }

  function sendMessage(payload: unknown): void {
    postToChild({ source: HUGFRAME_SOURCE, type: 'custom', payload })
  }

  function setPhase(next: HugFramePhase): void {
    if (phase === next) return
    phase = next
    template.setPhase(next)
    emitPhaseChange(next)
  }

  function syncCollapse(): void {
    if (mode !== 'expanded') {
      template.showCollapse(null)
      return
    }
    template.showCollapse(buildCollapseAffordance(opts, { collapse: () => requestMode('inline') }))
  }

  function setLock(next: boolean): void {
    if (locked === next) return
    locked = next
    if (next) lockDocumentScroll()
    else unlockDocumentScroll()
  }

  function applyInlineHeight(): void {
    if (destroyed) return
    if (mode !== 'inline' || phase !== 'idle') return
    const fixed = resolveFixedHeight(opts.height)
    if (fixed !== null) {
      template.box.style.height = fixed
      template.iframe.style.height = ''
      return
    }
    const next = computeInlineHeight(contentHeight, opts)
    inlineHeight = next
    template.box.style.height = `${next}px`
    template.iframe.style.height = `${next}px`
  }

  function pinBox(rect: DOMRect): void {
    const box = template.box
    box.style.position = 'fixed'
    box.style.margin = '0'
    box.style.top = `${rect.top}px`
    box.style.left = `${rect.left}px`
    box.style.right = 'auto'
    box.style.bottom = 'auto'
    box.style.width = `${rect.width}px`
    box.style.height = `${rect.height}px`
  }

  function cancelSettle(): void {
    settleCancel?.()
    settleCancel = null
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function clearResizeTimers(): void {
    if (resizeSettleTimer !== null) {
      window.clearTimeout(resizeSettleTimer)
      resizeSettleTimer = null
    }
    if (resizeSafetyTimer !== null) {
      window.clearTimeout(resizeSafetyTimer)
      resizeSafetyTimer = null
    }
  }

  function finishMorph(kind: HugFramePhase): void {
    if (destroyed) return
    if (kind === 'expanding' && mode !== 'expanded') return
    if (kind === 'collapsing' && mode !== 'inline') return
    const box = template.box
    const host = template.root
    if (kind === 'expanding') {
      box.style.top = '0px'
      box.style.left = '0px'
      box.style.width = opts.expandedWidth ?? EXPANDED_WIDTH
      box.style.height = opts.expandedHeight ?? EXPANDED_HEIGHT
      host.style.height = `${inlineHeight}px`
      setPhase('idle')
      if (opts.manageFocus !== false) template.iframe.focus()
      return
    }
    box.style.position = ''
    box.style.top = ''
    box.style.left = ''
    box.style.right = ''
    box.style.bottom = ''
    box.style.width = ''
    box.style.margin = ''
    host.style.height = ''
    setPhase('idle')
    applyInlineHeight()
    lastWidth = box.getBoundingClientRect().width
    const returnTo = focusReturn
    focusReturn = null
    if (opts.manageFocus !== false) returnTo?.focus()
  }

  function armSettle(kind: HugFramePhase): void {
    const box = template.box
    const duration = readTokenMs(box, '--hug-duration', DEFAULT_MORPH_MS)
    let settled = false

    function onTransitionEnd(event: TransitionEvent): void {
      if (event.target !== box || event.propertyName !== 'height') return
      settle()
    }

    function cleanup(): void {
      box.removeEventListener('transitionend', onTransitionEnd)
      window.clearTimeout(timer)
      if (settleCancel === cleanup) settleCancel = null
    }

    function settle(): void {
      if (settled) return
      settled = true
      cleanup()
      finishMorph(kind)
    }

    const timer = window.setTimeout(
      settle,
      duration + (opts.morphSettleMarginMs ?? MORPH_SETTLE_MARGIN_MS),
    )
    box.addEventListener('transitionend', onTransitionEnd)
    settleCancel = cleanup
  }

  function beginExpand(): void {
    if (destroyed) return
    cancelSettle()
    clearResizeTimers()
    appliedMode = 'expanded'
    const active = document.activeElement
    focusReturn = opts.manageFocus !== false && active instanceof HTMLElement ? active : null
    if (opts.lockScroll !== false) setLock(true)
    const rect = template.box.getBoundingClientRect()
    inlineHeight = rect.height
    template.root.style.height = `${rect.height}px`
    pinBox(rect)
    template.iframe.style.height = ''
    setPhase('expanding')
    if (prefersReducedMotion) {
      finishMorph('expanding')
      return
    }
    rafId = requestAnimationFrame(() => {
      rafId = null
      const box = template.box
      box.style.top = '0px'
      box.style.left = '0px'
      box.style.width = opts.expandedWidth ?? EXPANDED_WIDTH
      box.style.height = opts.expandedHeight ?? EXPANDED_HEIGHT
    })
    armSettle('expanding')
  }

  function beginCollapse(): void {
    if (destroyed) return
    cancelSettle()
    clearResizeTimers()
    appliedMode = 'inline'
    setLock(false)
    const current = template.box.getBoundingClientRect()
    const target = template.root.getBoundingClientRect()
    template.root.style.height = `${target.height}px`
    pinBox(current)
    template.iframe.style.height = ''
    setPhase('collapsing')
    if (prefersReducedMotion) {
      finishMorph('collapsing')
      return
    }
    rafId = requestAnimationFrame(() => {
      rafId = null
      const box = template.box
      box.style.top = `${target.top}px`
      box.style.left = `${target.left}px`
      box.style.width = `${target.width}px`
      box.style.height = `${target.height}px`
    })
    armSettle('collapsing')
  }

  function armResizeTimers(): void {
    if (resizeSettleTimer !== null) window.clearTimeout(resizeSettleTimer)
    resizeSettleTimer = window.setTimeout(settleResize, opts.resizeSettleMs ?? RESIZE_SETTLE_MS)
    if (resizeSafetyTimer === null) {
      resizeSafetyTimer = window.setTimeout(settleResize, opts.resizeSafetyMs ?? RESIZE_SAFETY_MS)
    }
  }

  function settleResize(): void {
    clearResizeTimers()
    if (phase !== 'resizing') return
    setPhase('idle')
    applyInlineHeight()
  }

  function beginResize(): void {
    if (phase !== 'idle' || mode !== 'inline' || appliedMode !== 'inline') return
    if (prefersReducedMotion) {
      applyInlineHeight()
      return
    }
    setPhase('resizing')
    armResizeTimers()
  }

  function onBoxResize(): void {
    const width = template.box.getBoundingClientRect().width
    const previous = lastWidth
    lastWidth = width
    if (
      previous === null ||
      Math.abs(width - previous) <= (opts.resizeWidthEpsilon ?? RESIZE_WIDTH_EPSILON)
    )
      return
    if (phase === 'resizing') armResizeTimers()
    else beginResize()
  }

  function onMotionChange(): void {
    if (motionQuery) prefersReducedMotion = motionQuery.matches
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (mode !== 'expanded') return
    if (event.key !== 'Escape') return
    event.preventDefault()
    requestMode('inline')
  }

  function bindEscape(active: boolean): void {
    if (escapeBound === active) return
    escapeBound = active
    if (active) document.addEventListener('keydown', onKeyDown)
    else document.removeEventListener('keydown', onKeyDown)
  }

  function handleRequest(action: HugFrameRequestAction): void {
    if (action === 'expand') requestMode('expanded')
    else if (action === 'collapse') requestMode('inline')
    else emitRequestClose()
  }

  function handleReady(): void {
    template.setReady(true)
    notifyMode(mode)
    notifySizing(sizing)
    emitReady()
  }

  function handleMessage(event: MessageEvent): void {
    if (destroyed) return
    if (event.source !== template.iframe.contentWindow) return
    if (!isHugFrameChildMessage(event.data)) return
    const targetOrigin = opts.targetOrigin ?? window.location.origin
    if (targetOrigin !== '*' && event.origin !== targetOrigin) return
    const message = event.data
    switch (message.type) {
      case 'ready':
        handleReady()
        return
      case 'size':
        contentHeight = message.height
        applyInlineHeight()
        return
      case 'request':
        handleRequest(message.action)
        return
      case 'custom':
        emitMessage(message.payload)
        return
    }
  }

  function requestMode(next: HugFrameMode): void {
    if (destroyed || mode === next) return
    mode = next
    template.setMode(next)
    syncCollapse()
    bindEscape(next === 'expanded' && opts.collapseOnEscape !== false)
    emitModeChange(next)
    if (next === 'expanded') beginExpand()
    else beginCollapse()
    notifyMode(next)
  }

  function update(next: Partial<HugFrameOptions>): void {
    if (destroyed) return
    function has(key: keyof HugFrameOptions): boolean {
      return Object.prototype.hasOwnProperty.call(next, key)
    }
    const previous = opts
    opts = { ...previous, ...next }

    if (has('src') && opts.src !== undefined) template.iframe.src = opts.src
    if (has('title')) template.setTitle(opts.title ?? '')
    if (has('className')) template.setClassName(opts.className)
    if (has('style')) template.setStyle(opts.style)
    if (has('iframeProps')) template.setIframeProps(opts.iframeProps)
    if (has('height') || has('initialHeight')) {
      template.setInitialHeightToken(
        resolveFixedHeight(opts.height) ?? `${opts.initialHeight ?? DEFAULT_INITIAL_HEIGHT}px`,
      )
    }

    const nextSizing = resolveSizing(opts.height)
    if (nextSizing !== sizing) {
      sizing = nextSizing
      template.setSizing(nextSizing)
      notifySizing(nextSizing)
      emitSizingChange(nextSizing)
    }

    if (has('collapseIcon') || has('renderCollapse')) syncCollapse()
    if (has('initialMode') && opts.initialMode !== undefined) requestMode(opts.initialMode)
    if (has('height') || has('minHeight') || has('maxHeight') || has('initialHeight')) {
      applyInlineHeight()
    }
    if (has('lockScroll')) setLock(mode === 'expanded' && opts.lockScroll !== false)
    if (has('collapseOnEscape')) {
      bindEscape(mode === 'expanded' && opts.collapseOnEscape !== false)
    }
    if (
      (has('expandedWidth') || has('expandedHeight')) &&
      mode === 'expanded' &&
      phase === 'idle'
    ) {
      template.box.style.width = opts.expandedWidth ?? EXPANDED_WIDTH
      template.box.style.height = opts.expandedHeight ?? EXPANDED_HEIGHT
    }
  }

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    cancelSettle()
    clearResizeTimers()
    setLock(false)
    observer?.disconnect()
    observer = null
    window.removeEventListener('message', handleMessage)
    bindEscape(false)
    motionQuery?.removeEventListener('change', onMotionChange)
    motionQuery = null
    focusReturn = null
    template.root.remove()
  }

  function getZIndex(): number {
    const raw = getComputedStyle(template.box).getPropertyValue('--hug-z-index').trim()
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : HUGFRAME_Z_INDEX
  }

  function init(): void {
    if (initialized || destroyed) return
    initialized = true

    template.setMode(mode)
    template.setPhase(phase)
    template.setSizing(sizing)
    template.setReady(false)
    opts.container.appendChild(template.root)

    // jsdom and other minimal DOMs leave matchMedia out; its absence means no
    // reduced-motion preference, not a broken environment.
    if (typeof window.matchMedia === 'function') {
      motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      prefersReducedMotion = motionQuery.matches
      motionQuery.addEventListener('change', onMotionChange)
    }

    if (typeof ResizeObserver !== 'undefined') {
      lastWidth = template.box.getBoundingClientRect().width
      observer = new ResizeObserver(onBoxResize)
      observer.observe(template.box)
    }

    window.addEventListener('message', handleMessage)
    bindEscape(mode === 'expanded' && opts.collapseOnEscape !== false)

    if (mode === 'expanded') {
      syncCollapse()
      beginExpand()
    } else {
      applyInlineHeight()
    }

    notifyMode(mode)
    notifySizing(sizing)
  }

  const instance: HugFrameInstance = {
    element: template.root,
    getIframe: () => template.iframe,
    getMode: () => mode,
    getPhase: () => phase,
    getSizing: () => sizing,
    getZIndex,
    expand: () => requestMode('expanded'),
    collapse: () => requestMode('inline'),
    toggle: () => requestMode(mode === 'expanded' ? 'inline' : 'expanded'),
    sendMessage,
    update,
    destroy,
  }

  init()
  return instance
}
