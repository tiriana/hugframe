import type { HugFrameMode, HugFrameSizing } from './protocol'
import type { HugFrameCollapseHandle, HugFrameOptions, HugFramePhase } from './types'
import { DEFAULT_INITIAL_HEIGHT, resolveFixedHeight } from './geometry'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

export interface HugFrameTemplate {
  readonly root: HTMLDivElement
  readonly backdrop: HTMLDivElement
  readonly box: HTMLDivElement
  readonly iframe: HTMLIFrameElement
  setMode(mode: HugFrameMode): void
  setPhase(phase: HugFramePhase): void
  setSizing(sizing: HugFrameSizing): void
  setReady(ready: boolean): void
  setTitle(title: string): void
  setClassName(className: string | undefined): void
  setStyle(style: Partial<CSSStyleDeclaration> | undefined): void
  setInitialHeightToken(value: string): void
  setIframeProps(props: HugFrameOptions['iframeProps']): void
  showCollapse(node: Node | null): void
}

function toKebabCase(name: string): string {
  if (name.startsWith('--')) return name
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}

export function applyElementStyle(
  element: HTMLElement,
  style: Partial<CSSStyleDeclaration> | undefined,
): void {
  if (!style) return
  for (const key of Object.keys(style)) {
    const value = style[key as keyof CSSStyleDeclaration]
    if (typeof value !== 'string') continue
    element.style.setProperty(toKebabCase(key), value)
  }
}

function composeRootClassName(className: string | undefined): string {
  return className ? `hug-root ${className}` : 'hug-root'
}

function composeFrameClassName(className: unknown): string {
  return typeof className === 'string' && className ? `hug-frame ${className}` : 'hug-frame'
}

function initialHeightToken(options: HugFrameOptions): string {
  return (
    resolveFixedHeight(options.height) ?? `${options.initialHeight ?? DEFAULT_INITIAL_HEIGHT}px`
  )
}

function createDefaultCollapseIcon(): SVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const path = document.createElementNS(SVG_NAMESPACE, 'path')
  path.setAttribute('d', 'M12 8h4V4M16 4l-5 5M8 12H4v4M4 16l5-5')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.6')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

export function buildCollapseAffordance(
  options: Pick<HugFrameOptions, 'collapseIcon' | 'renderCollapse'>,
  handle: HugFrameCollapseHandle,
): Node | null {
  if (options.renderCollapse === null) return null
  if (typeof options.renderCollapse === 'function') return options.renderCollapse(handle)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'hug-collapse'
  button.setAttribute('aria-label', 'Return to inline view')
  button.addEventListener('click', () => handle.collapse())
  const icon = options.collapseIcon
  if (typeof icon === 'string') button.textContent = icon
  else if (icon) button.appendChild(icon)
  else button.appendChild(createDefaultCollapseIcon())
  return button
}

export function createHugFrameTemplate(options: HugFrameOptions): HugFrameTemplate {
  const root = document.createElement('div')
  root.className = composeRootClassName(options.className)
  applyElementStyle(root, options.style)

  const backdrop = document.createElement('div')
  backdrop.className = 'hug-backdrop'
  backdrop.setAttribute('aria-hidden', 'true')

  const box = document.createElement('div')
  box.className = 'hug-box'

  const iframe = document.createElement('iframe')
  iframe.src = options.src
  iframe.title = options.title

  let title = options.title
  let appliedIframeProps: string[] = []
  let collapseNode: Node | null = null

  function setInitialHeightToken(value: string): void {
    root.style.setProperty('--hug-initial-height', value)
  }

  function setIframeProps(props: HugFrameOptions['iframeProps']): void {
    for (const name of appliedIframeProps) iframe.removeAttribute(name)
    appliedIframeProps = []
    iframe.className = composeFrameClassName(props?.className)
    iframe.style.cssText = typeof props?.style === 'string' ? props.style : ''
    if (!props) return
    for (const [key, value] of Object.entries(props)) {
      if (key === 'src' || key === 'title' || key === 'className' || key === 'style') continue
      if (value === false || value === null || value === undefined) continue
      iframe.setAttribute(key, value === true ? '' : String(value))
      appliedIframeProps.push(key)
    }
  }

  function setMode(mode: HugFrameMode): void {
    root.dataset.mode = mode
    if (mode === 'expanded') {
      box.setAttribute('role', 'dialog')
      box.setAttribute('aria-modal', 'true')
      box.setAttribute('aria-label', title)
      return
    }
    box.removeAttribute('role')
    box.removeAttribute('aria-modal')
    box.removeAttribute('aria-label')
  }

  function setPhase(phase: HugFramePhase): void {
    root.dataset.phase = phase
  }

  function setSizing(sizing: HugFrameSizing): void {
    root.dataset.sizing = sizing
  }

  function setReady(ready: boolean): void {
    root.dataset.ready = ready ? 'true' : 'false'
  }

  function setTitle(next: string): void {
    title = next
    iframe.title = next
    if (box.hasAttribute('role')) box.setAttribute('aria-label', next)
  }

  function setClassName(className: string | undefined): void {
    root.className = composeRootClassName(className)
  }

  function setStyle(style: Partial<CSSStyleDeclaration> | undefined): void {
    applyElementStyle(root, style)
  }

  function showCollapse(node: Node | null): void {
    if (collapseNode?.parentNode) collapseNode.parentNode.removeChild(collapseNode)
    collapseNode = node
    if (node) box.appendChild(node)
  }

  box.appendChild(iframe)
  root.appendChild(backdrop)
  root.appendChild(box)
  setInitialHeightToken(initialHeightToken(options))
  setIframeProps(options.iframeProps)

  return {
    root,
    backdrop,
    box,
    iframe,
    setMode,
    setPhase,
    setSizing,
    setReady,
    setTitle,
    setClassName,
    setStyle,
    setInitialHeightToken,
    setIframeProps,
    showCollapse,
  }
}
