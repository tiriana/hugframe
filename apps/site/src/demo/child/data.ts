export interface Message {
  author: string
  text: string
  time: string
}

export interface Thread {
  id: number
  initials: string
  name: string
  subject: string
  preview: string
  time: string
  unread: boolean
  messages: Message[]
}

export type ServiceState = 'ok' | 'warn' | 'down'

export interface Service {
  name: string
  detail: string
  state: ServiceState
  latency: string
}

const THREAD_AUTHORS: ReadonlyArray<{ initials: string; name: string }> = [
  { initials: 'MK', name: 'Mira Koval' },
  { initials: 'JT', name: 'Jonas Telle' },
  { initials: 'AR', name: 'Adaeze Rowan' },
  { initials: 'SL', name: 'Sam Lindqvist' },
  { initials: 'NB', name: 'Noa Berger' },
  { initials: 'DP', name: 'Dana Pike' },
  { initials: 'CR', name: 'Chris Ravel' },
  { initials: 'EK', name: 'Elif Karadag' },
]

const THREAD_SUBJECTS: ReadonlyArray<string> = [
  'Billing export is missing the March column',
  'Roll out the new onboarding checklist',
  'Two-factor reset questions from support',
  'Can we shorten the import step?',
  'Webhook retries are landing twice',
  'Draft copy for the release notes',
  'Search results skip archived items',
  'Timezone drift in the scheduler',
]

const THREAD_PREVIEWS: ReadonlyArray<string> = [
  'Confirmed on staging — the header row shows up once we reload.',
  'I moved the second item into the next sprint, it needs a design pass.',
  'Support logged eleven of these this week, all on older accounts.',
  'The shorter flow tested better with the first group.',
  'Looks like a duplicate delivery, not a retry loop.',
  'Added three options at the bottom, pick whichever reads best.',
]

const TIMES: ReadonlyArray<string> = ['09:12', '08:40', 'Yesterday', 'Mon', 'Sun', 'Fri']

export function makeThread(index: number): Thread {
  const author = THREAD_AUTHORS[index % THREAD_AUTHORS.length]
  const subject = THREAD_SUBJECTS[index % THREAD_SUBJECTS.length]
  if (!author || !subject) {
    return {
      id: index,
      initials: '??',
      name: 'Unknown',
      subject: 'Untitled thread',
      preview: '',
      time: '',
      unread: false,
      messages: [],
    }
  }
  const reply = THREAD_PREVIEWS[index % THREAD_PREVIEWS.length] ?? ''
  const replyTime = TIMES[index % TIMES.length] ?? ''
  const messages: Message[] = [
    { author: 'You', text: 'Noted — I will look at this today.', time: '09:05' },
    { author: author.name, text: reply, time: replyTime },
  ]
  return {
    id: index,
    initials: author.initials,
    name: author.name,
    subject,
    preview: reply,
    time: replyTime,
    unread: index % 3 === 0,
    messages,
  }
}

export function makeInitialThreads(count: number): Thread[] {
  return Array.from({ length: count }, (_, index) => makeThread(index))
}

export const SERVICES: ReadonlyArray<Service> = [
  { name: 'API gateway', detail: 'edge, 6 regions', state: 'ok', latency: '112 ms' },
  { name: 'Primary database', detail: 'replica lag 0.4 s', state: 'ok', latency: '38 ms' },
  { name: 'Job queue', detail: 'backlog rising', state: 'warn', latency: '2.1 s' },
  { name: 'Object storage', detail: 'eu-central', state: 'ok', latency: '74 ms' },
  { name: 'Mail delivery', detail: 'provider timeout', state: 'down', latency: '—' },
  { name: 'Search index', detail: 'reindex at 14:00', state: 'ok', latency: '96 ms' },
]
