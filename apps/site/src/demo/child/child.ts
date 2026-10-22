import { el } from '@/demo/dom'
import { createHugFrameChild } from 'hugframe/child'
import type { HugFrameMode } from 'hugframe'
import { createDoc, type DocApp } from './doc'
import { createMirror, type MirrorApp } from './mirror'

type ChildView = 'doc' | 'second'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readView(): ChildView {
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'second' ? 'second' : 'doc'
}

export function mountChild(container: HTMLElement): void {
  const view = readView()
  let mode: HugFrameMode = 'inline'

  const shell = el('div', { class: 'child-shell', dataset: { mode: 'inline', view } })

  const child = createHugFrameChild({
    targetOrigin: window.location.origin,
    onModeChange: (next) => {
      mode = next
      render()
    },
    onMessage: handleMessage,
  })

  const framed = child.isFramed
  shell.dataset.framed = framed ? 'true' : 'false'

  if (!framed) {
    shell.append(
      el('p', {
        class: 'standalone-note',
        text: 'Standalone preview. Embed this document in a hugframe host to enable the expand control.',
      }),
    )
  }

  let doc: DocApp | null = null
  let mirror: MirrorApp | null = null

  if (view === 'second') {
    mirror = createMirror({ framed, child })
    shell.append(mirror.root)
  } else {
    doc = createDoc({ framed, child })
    shell.append(doc.root)
  }

  container.append(shell)

  function render(): void {
    shell.dataset.mode = mode
    doc?.render(mode)
    mirror?.render(mode)
  }

  function handleMessage(payload: unknown): void {
    if (!isRecord(payload)) return
    if (payload.action === 'grow') doc?.grow()
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || mode !== 'expanded') return
    child.requestCollapse()
  })

  render()
}
