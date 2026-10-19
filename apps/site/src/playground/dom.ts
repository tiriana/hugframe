const SVG_NS = 'http://www.w3.org/2000/svg'

export type Child = Node | string | null | undefined

export interface ElOptions {
  class?: string
  text?: string
  attrs?: Record<string, string | number | boolean | undefined>
  on?: Record<string, EventListener>
}

function apply(node: Element, options: ElOptions): void {
  if (options.class !== undefined) node.setAttribute('class', options.class)
  if (options.text !== undefined) node.textContent = options.text
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value === undefined || value === false) continue
      node.setAttribute(name, value === true ? '' : String(value))
    }
  }
  if (options.on) {
    for (const [type, handler] of Object.entries(options.on)) node.addEventListener(type, handler)
  }
}

function append(node: Element, children: Child[]): void {
  for (const child of children) if (child != null) node.append(child)
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  apply(node, options)
  append(node, children)
  return node
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: Child[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  apply(node, options)
  append(node, children)
  return node
}
