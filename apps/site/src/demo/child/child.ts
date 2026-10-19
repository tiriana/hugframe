import { el } from '@/demo/dom'
import { createHugFrameChild } from 'hugframe/child'
import { makeInitialThreads, makeThread } from './data'
import { createStatusApp, type StatusApp } from './status'
import { createThreadApp, type ThreadApp, type ThreadAppState } from './thread'

type ChildView = 'workspace' | 'status'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readView(): ChildView {
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'status' ? 'status' : 'workspace'
}

export function mountChild(container: HTMLElement): void {
  const view = readView()

  // A thread is selected from the start: the composer refuses to send without
  // one, and a framed page has no way to pick one from outside, so an embed
  // whose list is not clickable would look broken.
  const threads = makeInitialThreads(3)
  const state: ThreadAppState = {
    mode: 'inline',
    threads,
    selectedId: threads[0]?.id ?? null,
  }

  let threadApp: ThreadApp | null = null
  let statusApp: StatusApp | null = null

  const shell = el('div', { class: 'child-shell', dataset: { mode: 'inline', view } })

  const child = createHugFrameChild({
    targetOrigin: window.location.origin,
    onModeChange: (mode) => {
      state.mode = mode
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

  if (view === 'status') {
    statusApp = createStatusApp({ framed, child })
    shell.append(statusApp.root)
  } else {
    threadApp = createThreadApp({ framed, child, onSelect: selectThread, onSend: sendReply })
    shell.append(threadApp.root)
  }

  container.append(shell)

  function render(): void {
    shell.dataset.mode = state.mode
    if (statusApp) statusApp.render(state.mode)
    if (threadApp) threadApp.render(state)
  }

  function selectThread(id: number): void {
    state.selectedId = id
    state.threads = state.threads.map((thread) =>
      thread.id === id ? { ...thread, unread: false } : thread,
    )
    render()
  }

  function sendReply(threadId: number, text: string): void {
    const trimmed = text.trim()
    if (trimmed === '') return
    state.threads = state.threads.map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            messages: [...thread.messages, { author: 'You', text: trimmed, time: 'now' }],
            preview: trimmed,
            time: 'now',
            unread: false,
          }
        : thread,
    )
    render()
  }

  function handleMessage(payload: unknown): void {
    if (!isRecord(payload)) return
    const action = payload.action

    if (action === 'add-thread') {
      if (state.threads.length >= 6) return
      const nextId = state.threads.reduce((max, thread) => Math.max(max, thread.id), -1) + 1
      state.threads = [...state.threads, makeThread(nextId)]
      render()
      return
    }

    if (action === 'remove-thread') {
      const removed = state.threads[state.threads.length - 1]
      if (state.threads.length <= 1 || !removed) return
      state.threads = state.threads.slice(0, -1)
      if (state.selectedId === removed.id) state.selectedId = null
      render()
      return
    }

    if (action === 'select-thread') {
      if (state.threads.length === 0) return
      const index =
        state.selectedId === null
          ? -1
          : state.threads.findIndex((thread) => thread.id === state.selectedId)
      const next = state.threads[(index + 1) % state.threads.length]
      if (!next) return
      selectThread(next.id)
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || state.mode !== 'expanded') return
    child.requestCollapse()
  })

  render()
}
