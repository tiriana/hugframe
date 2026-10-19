export type ElChild = Node | string | null | undefined

export interface ElOptions {
  class?: string
  text?: string
  attrs?: Readonly<Record<string, string | number | boolean | undefined>>
  dataset?: Readonly<Record<string, string>>
  on?: Readonly<Record<string, (event: Event) => void>>
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: readonly ElChild[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  applyOptions(node, options)
  appendChildren(node, children)
  return node
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: readonly ElChild[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  applyOptions(node, options)
  appendChildren(node, children)
  return node
}

export function clear(node: Element): void {
  node.replaceChildren()
}

function applyOptions(node: Element, options: ElOptions): void {
  if (options.class !== undefined) node.setAttribute('class', options.class)
  if (options.text !== undefined) node.textContent = options.text
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value === undefined || value === false) continue
      node.setAttribute(name, value === true ? '' : String(value))
    }
  }
  if (options.dataset) {
    for (const [name, value] of Object.entries(options.dataset)) {
      node.setAttribute(`data-${name}`, value)
    }
  }
  if (options.on) {
    for (const [type, handler] of Object.entries(options.on)) {
      node.addEventListener(type, handler)
    }
  }
}

function appendChildren(node: Element, children: readonly ElChild[]): void {
  for (const child of children) {
    if (child === null || child === undefined) continue
    node.append(child)
  }
}
