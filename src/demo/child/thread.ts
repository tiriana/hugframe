import { clear, el } from '@/demo/dom'
import type { HugFrameChild } from '@/lib/child'
import type { HugFrameMode } from '@/lib/protocol'
import type { Thread } from './data'
import { createModeButton } from './modeButton'

export interface ThreadAppState {
  mode: HugFrameMode
  threads: Thread[]
  selectedId: number | null
}

export interface ThreadAppHost {
  framed: boolean
  child: HugFrameChild
  onSelect: (id: number) => void
  onSend: (threadId: number, text: string) => void
}

export interface ThreadApp {
  readonly root: HTMLElement
  render(state: ThreadAppState): void
}

const PANEL_ID = 'thread-panel'
const TABS: readonly string[] = ['Inbox', 'Assigned', 'Archive']
const ACTIVITY: ReadonlyArray<{ who: string; what: string; when: string }> = [
  { who: 'Mira Koval', what: 'assigned a thread to you', when: '2m' },
  { who: 'Automation', what: 'closed three stale threads', when: '26m' },
  { who: 'Jonas Telle', what: 'commented on “Webhook retries”', when: '1h' },
  { who: 'Adaeze Rowan', what: 'moved a thread to Archive', when: '3h' },
]

export function createThreadApp(host: ThreadAppHost): ThreadApp {
  let state: ThreadAppState = { mode: 'inline', threads: [], selectedId: null }
  let activeTab = TABS[0] ?? 'Inbox'
  let sideCol: HTMLDivElement | null = null

  const modeButton = createModeButton(host.child)
  const openCount = el('span', { class: 'app-bar__meta', text: '0 open' })
  const appBar = el('header', { class: 'app-bar' }, [
    el('div', { class: 'app-bar__identity' }, [
      el('span', { class: 'app-bar__name', text: 'Threads' }),
      openCount,
    ]),
    modeButton,
  ])

  const tabButtons = TABS.map((tab) =>
    el(
      'button',
      {
        class: 'tabstrip__tab',
        attrs: { type: 'button', role: 'tab', id: `tab-${tab}`, 'aria-controls': PANEL_ID },
        on: { click: () => selectTab(tab) },
      },
      [tab],
    ),
  )
  const tabstrip = el(
    'div',
    { class: 'tabstrip', attrs: { role: 'tablist', 'aria-label': 'Thread filters' } },
    tabButtons,
  )

  const threadList = el('ul', { class: 'thread-list', attrs: { 'aria-label': 'Threads' } })
  const listCol = el('div', { class: 'list-col' }, [threadList])
  const workspace = el('div', {
    class: 'workspace',
    attrs: { id: PANEL_ID, role: 'tabpanel', 'aria-labelledby': `tab-${activeTab}` },
  })
  workspace.append(listCol)

  const composerInput = el('input', {
    class: 'composer__input',
    attrs: { type: 'text', 'aria-label': 'Write a reply' },
    on: { input: () => updateComposer() },
  })
  const sendButton = el('button', {
    class: 'composer__send',
    attrs: { type: 'submit' },
    text: 'Send',
  })
  const composer = el(
    'form',
    {
      class: 'composer',
      on: {
        submit: (event) => {
          event.preventDefault()
          submitReply()
        },
      },
    },
    [composerInput, sendButton],
  )

  const root = el('div', { class: 'thread-app', dataset: { mode: 'inline', side: 'false' } }, [
    appBar,
    tabstrip,
    workspace,
    composer,
  ])

  function selectTab(tab: string): void {
    activeTab = tab
    render(state)
  }

  function submitReply(): void {
    const selectedId = state.selectedId
    if (selectedId === null) return
    const text = composerInput.value.trim()
    if (text === '') return
    host.onSend(selectedId, text)
    composerInput.value = ''
    updateComposer()
  }

  function updateComposer(): void {
    const selected = state.threads.find((thread) => thread.id === state.selectedId) ?? null
    composerInput.placeholder = selected ? `Reply to ${selected.name}` : 'Select a thread to reply'
    sendButton.disabled = selected === null || composerInput.value.trim() === ''
  }

  function render(next: ThreadAppState): void {
    state = next
    const expanded = state.mode === 'expanded'
    const selected = state.threads.find((thread) => thread.id === state.selectedId) ?? null

    root.dataset.mode = state.mode
    root.dataset.side = expanded || selected !== null ? 'true' : 'false'
    openCount.textContent = `${state.threads.length} open`

    if (host.framed && !expanded) {
      if (modeButton.parentElement !== appBar) appBar.append(modeButton)
    } else {
      modeButton.remove()
    }

    for (const button of tabButtons) {
      const active = button.textContent === activeTab
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-selected', active ? 'true' : 'false')
      button.tabIndex = active ? 0 : -1
    }
    workspace.setAttribute('aria-labelledby', `tab-${activeTab}`)

    renderThreads()
    renderSide(selected, expanded)
    updateComposer()
  }

  function renderThreads(): void {
    const focusedIndex = readFocusedThreadIndex()
    clear(threadList)
    const buttons: HTMLButtonElement[] = []
    for (const thread of state.threads) {
      const button = buildThreadRow(thread, thread.id === state.selectedId)
      buttons.push(button)
      threadList.append(el('li', {}, [button]))
    }
    if (focusedIndex !== null) buttons[focusedIndex]?.focus()
  }

  function readFocusedThreadIndex(): number | null {
    const active = document.activeElement
    if (!(active instanceof HTMLButtonElement)) return null
    if (!threadList.contains(active)) return null
    const index = Array.from(threadList.querySelectorAll('button')).indexOf(active)
    return index === -1 ? null : index
  }

  function buildThreadRow(thread: Thread, selected: boolean): HTMLButtonElement {
    const classes = ['thread']
    if (thread.unread) classes.push('thread--unread')
    if (selected) classes.push('thread--selected')

    const attrs: Record<string, string> = { type: 'button' }
    if (selected) attrs['aria-current'] = 'true'

    return el(
      'button',
      {
        class: classes.join(' '),
        attrs,
        on: { click: () => host.onSelect(thread.id) },
      },
      [
        el('span', {
          class: 'thread__avatar',
          attrs: { 'aria-hidden': 'true' },
          text: thread.initials,
        }),
        el('span', { class: 'thread__body' }, [
          el('span', { class: 'thread__top' }, [
            el('span', { class: 'thread__name', text: thread.name }),
            el('span', { class: 'thread__time', text: thread.time }),
          ]),
          el('span', { class: 'thread__subject', text: thread.subject }),
          el('span', { class: 'thread__preview', text: thread.preview }),
        ]),
      ],
    )
  }

  function renderSide(selected: Thread | null, expanded: boolean): void {
    if (!expanded && selected === null) {
      sideCol?.remove()
      sideCol = null
      return
    }
    if (!sideCol) {
      sideCol = el('div', { class: 'side-col' })
      workspace.append(sideCol)
    }
    clear(sideCol)
    if (selected) sideCol.append(buildConversation(selected))
    if (expanded) sideCol.append(buildActivity())
  }

  function buildConversation(thread: Thread): HTMLElement {
    const messages = el(
      'ul',
      { class: 'messages' },
      thread.messages.map((message) =>
        el('li', { class: message.author === 'You' ? 'message message--mine' : 'message' }, [
          el('span', { class: 'message__head' }, [
            el('span', { class: 'message__author', text: message.author }),
            el('span', { class: 'message__time', text: message.time }),
          ]),
          el('span', { class: 'message__text', text: message.text }),
        ]),
      ),
    )
    return el(
      'section',
      { class: 'conversation', attrs: { 'aria-label': `Conversation with ${thread.name}` } },
      [el('h3', { class: 'conversation__title', text: thread.subject }), messages],
    )
  }

  function buildActivity(): HTMLElement {
    const exit = host.framed
      ? el('button', {
          class: 'activity__exit',
          attrs: { type: 'button' },
          text: 'Return to the inline view',
          on: { click: () => host.child.requestCollapse() },
        })
      : null
    return el('aside', { class: 'activity', attrs: { 'aria-label': 'Recent activity' } }, [
      el('h3', { class: 'activity__title', text: 'Recent activity' }),
      el(
        'ul',
        { class: 'activity__list' },
        ACTIVITY.map((item) =>
          el('li', { class: 'activity__item' }, [
            el('span', { class: 'activity__who', text: item.who }),
            el('span', { class: 'activity__what', text: item.what }),
            el('span', { class: 'activity__when', text: item.when }),
          ]),
        ),
      ),
      exit,
    ])
  }

  return { root, render }
}
