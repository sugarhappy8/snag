// R1-T6 (G.11 step 2, D18 option b): Quiet Mode routing in the store. When FLAGS.quietInbox and the Quiet Mode setting
// are both on, processQueue moves routable notices (routesToInbox, nothing else decides) to the inbox in one act().
// This is the store flow only: headless ageUp and every g.queue reader never see routing. The real store is used with
// a localStorage shim, the way test/store.test.ts does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { notice } from '../src/game/core'
import { resetFlags, setFlags, withFlags } from '../src/game/flags'
import { INBOX_MAX, INBOX_TEXT_MAX, inboxUnread, readInbox } from '../src/game/inbox'
import { createNewLife } from '../src/game/life'
import type { ChoiceModal, GameState, InputModal, MinigameModal, ModalItem, NoticeModal } from '../src/game/types'
import { NEVER_ROUTE_TABLE, noticeOfRow } from './notice-table'

// Minimal in-memory localStorage, installed before the store loads its settings.
vi.hoisted(() => {
  const data = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
})

const store = await import('../src/ui/store')
const { loadGame } = await import('../src/game/save')

const job = { defId: 'cashier', title: 'Cashier', company: 'Corner Mart', salary: 24_000, category: 'fulltime' as const }

function game(): GameState {
  return store.getApp().game as GameState
}

function setQueue(items: ModalItem[]): void {
  store.act((g) => {
    g.queue = items
  })
}

function minor(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id, title: `Minor ${id}`, text: `Text of ${id}.`, tone: 'good', weight: 'minor', ...extra }
}

function plain(id: string): NoticeModal {
  return { kind: 'notice', id, title: `Plain ${id}`, text: `Text of ${id}.` }
}

function choice(id: string, extra: Record<string, unknown> = {}): ChoiceModal {
  return {
    kind: 'choice',
    id,
    title: `Pick ${id}`,
    text: 'Which one?',
    choices: [
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
    ],
    source: 'script',
    scriptId: 'none',
    ...extra,
  } as ChoiceModal
}

function ids(items: readonly { id: string }[]): string[] {
  return items.map((m) => m.id)
}

function inboxIds(): string[] {
  return ids(readInbox(game()).items)
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store.updateSettings({ quietMode: true })
  setFlags({ quietInbox: true })
  store.startNewLife({ seed: 3, year: 2026 })
  setQueue([])
})

afterEach(() => {
  resetFlags()
  store.updateSettings({ quietMode: true })
  vi.restoreAllMocks()
})

describe('routing a minor notice', () => {
  it('moves it to the inbox: the queue is empty, one row, the text clipped at 160, one unread', () => {
    const long = 'A very long story about nothing much at all. '.repeat(8).trim()
    setQueue([minor('m1', { title: 'Neighborhood news', text: long })])
    expect(game().queue).toEqual([])
    const inbox = readInbox(game())
    expect(inbox.items).toHaveLength(1)
    expect(inbox.items[0].id).toBe('m1')
    expect(inbox.items[0].t.length).toBeLessThanOrEqual(INBOX_TEXT_MAX)
    expect(inbox.items[0].t.endsWith('...')).toBe(true)
    expect(inbox.items[0].t.startsWith('Neighborhood news: ')).toBe(true)
    expect(inbox.total).toBe(1)
    expect(inboxUnread(game())).toBe(1)
  })

  it('keeps the year, the age and the tone of the row', () => {
    setQueue([minor('m1', { tone: 'event' })])
    const row = readInbox(game()).items[0]
    expect(row.y).toBe(game().year)
    expect(row.a).toBe(game().character.age)
    expect(row.k).toBe('event')
  })

  it('saves the inbox with the life, in the same commit', () => {
    setQueue([minor('m1'), minor('m2')])
    const saved = loadGame()
    expect(saved).not.toBeNull()
    expect(saved?.queue).toEqual([])
    expect(ids(readInbox(saved as GameState).items)).toEqual(['m1', 'm2'])
  })

  it('leaves a notice without the minor weight in the queue', () => {
    setQueue([plain('p1')])
    expect(ids(game().queue)).toEqual(['p1'])
    expect(game().flags.inbox).toBeUndefined()
  })

  it('routes a notice the real notice() marked minor, and not one that was not', () => {
    store.act((g) => {
      notice(g, 'A letter', 'A letter arrived from an old friend.', { weight: 'minor' })
      notice(g, 'Another letter', 'This one stays.')
    })
    expect(game().queue.map((m) => (m.kind === 'notice' ? m.title : m.kind))).toEqual(['Another letter'])
    expect(readInbox(game()).items.map((r) => r.t)).toEqual(['A letter: A letter arrived from an old friend.'])
  })

  it('carries a valid link to the row, and drops a damaged one', () => {
    setQueue([minor('m1', { link: 'assets/home/mortgage' }), minor('m2', { link: 'not a place key!' })])
    const rows = readInbox(game()).items
    expect(rows[0].l).toBe('assets/home/mortgage')
    expect(rows[1].l).toBeUndefined()
  })
})

describe('what never routes', () => {
  for (const row of NEVER_ROUTE_TABLE) {
    if (row.block === null) {
      it(`routes a minor notice like "${row.name}"`, () => {
        setQueue([noticeOfRow(row, 'r1', 'minor')])
        expect(game().queue).toEqual([])
        expect(inboxIds()).toEqual(['r1'])
      })
    } else {
      it(`keeps a minor notice like "${row.name}" a popup (${row.block})`, () => {
        setQueue([noticeOfRow(row, 'r1', 'minor')])
        expect(ids(game().queue)).toEqual(['r1'])
        expect(game().flags.inbox).toBeUndefined()
      })
    }
  }

  it('never routes a notice with the support line, even when it is minor', () => {
    setQueue([minor('s1', { support: true })])
    expect(ids(game().queue)).toEqual(['s1'])
  })

  it('never routes a bad-tone notice, even when it is minor', () => {
    setQueue([minor('b1', { tone: 'bad' })])
    expect(ids(game().queue)).toEqual(['b1'])
  })
})

describe('when it does nothing', () => {
  it('keeps every notice while Quiet Mode is off', () => {
    store.updateSettings({ quietMode: false })
    setQueue([minor('m1'), minor('m2')])
    expect(ids(game().queue)).toEqual(['m1', 'm2'])
    expect(game().flags.inbox).toBeUndefined()
  })

  it('keeps every notice while the quietInbox flag is off', () => {
    // Pinned off, so the case means the same thing before and after the release commit flips the default.
    setFlags({ quietInbox: false })
    setQueue([minor('m1'), minor('m2')])
    expect(ids(game().queue)).toEqual(['m1', 'm2'])
    expect(game().flags.inbox).toBeUndefined()
  })

  it('does not route a notice that was queued before Quiet Mode went on, until the next pass', () => {
    store.updateSettings({ quietMode: false })
    setQueue([minor('m1')])
    store.updateSettings({ quietMode: true })
    expect(ids(game().queue)).toEqual(['m1'])
    store.processQueue()
    expect(game().queue).toEqual([])
    expect(inboxIds()).toEqual(['m1'])
  })

  it('reads the flag at the time of the call, not when the module loaded', () => {
    withFlags({ quietInbox: false }, () => setQueue([minor('m1')]))
    expect(ids(game().queue)).toEqual(['m1'])
    withFlags({ quietInbox: true }, () => store.processQueue())
    expect(game().queue).toEqual([])
  })
})

describe('order', () => {
  it('routes from anywhere in the queue and keeps the order of the rest', () => {
    setQueue([minor('n1'), choice('c'), minor('n2'), plain('n3')])
    expect(ids(game().queue)).toEqual(['c', 'n3'])
    expect(inboxIds()).toEqual(['n1', 'n2'])
  })

  it('routes a minor notice that waits behind a choice', () => {
    setQueue([choice('c'), minor('n1')])
    expect(ids(game().queue)).toEqual(['c'])
    expect(inboxIds()).toEqual(['n1'])
  })

  it('lets a minor notice behind a built-in task route, and the task resolves with its own popups left alone', () => {
    setQueue([{ kind: 'aiTask', id: 't1', task: { type: 'interview', job } }, minor('n1')])
    expect(game().queue.some((m) => m.kind === 'aiTask')).toBe(false)
    expect(game().queue.some((m) => m.kind === 'choice' && m.title === 'Job Interview')).toBe(true)
    expect(game().queue.some((m) => m.id === 'n1')).toBe(false)
    expect(inboxIds()).toEqual(['n1'])
  })

  it('routes a minor notice in front of a task, then resolves the task', () => {
    setQueue([minor('n1'), { kind: 'aiTask', id: 't1', task: { type: 'interview', job } }])
    expect(game().queue.some((m) => m.kind === 'aiTask')).toBe(false)
    expect(game().queue.some((m) => m.kind === 'choice' && m.title === 'Job Interview')).toBe(true)
    expect(inboxIds()).toEqual(['n1'])
  })

  it('keeps a task that is not at the head waiting behind a popup, as before', () => {
    setQueue([plain('p1'), { kind: 'aiTask', id: 't1', task: { type: 'interview', job } }, minor('n1')])
    expect(game().queue.map((m) => m.id)).toEqual(['p1', 't1'])
    expect(inboxIds()).toEqual(['n1'])
    store.dismissNotice('p1')
    expect(game().queue.some((m) => m.kind === 'choice' && m.title === 'Job Interview')).toBe(true)
  })
})

describe('idempotent', () => {
  it('processQueue five times changes nothing after the first', () => {
    setQueue([minor('n1'), plain('p1'), minor('n2')])
    const after = game()
    for (let i = 0; i < 5; i++) store.processQueue()
    expect(game()).toBe(after)
    expect(inboxIds()).toEqual(['n1', 'n2'])
    expect(readInbox(game()).total).toBe(2)
  })

  it('a double call (StrictMode effects) routes each notice once', () => {
    store.act((g) => {
      g.queue = [minor('n1'), minor('n2')]
    })
    store.processQueue()
    store.processQueue()
    expect(inboxIds()).toEqual(['n1', 'n2'])
    expect(readInbox(game()).total).toBe(2)
  })

  it('does not write anything when nothing can route', () => {
    setQueue([plain('p1'), choice('c')])
    const after = game()
    store.processQueue()
    store.processQueue()
    expect(game()).toBe(after)
  })
})

describe('what is never routed or reordered', () => {
  it('a choice stays, even one that claims the minor weight', () => {
    const sneaky = choice('c', { weight: 'minor' })
    setQueue([minor('n1'), sneaky, minor('n2')])
    expect(ids(game().queue)).toEqual(['c'])
    expect(game().queue[0]).toEqual(sneaky)
  })

  it('an input and a minigame stay, even when they claim the minor weight', () => {
    const input = { kind: 'input', id: 'i1', title: 'Name it', text: 'What do you call it?', scriptId: 'none', weight: 'minor' } as unknown as InputModal
    const game1 = { kind: 'minigame', id: 'g1', title: 'Play', text: 'Go.', scriptId: 'none', minigame: 'none', weight: 'minor' } as unknown as MinigameModal
    setQueue([input, minor('n1'), game1])
    expect(ids(game().queue)).toEqual(['i1', 'g1'])
    expect(inboxIds()).toEqual(['n1'])
  })

  it('the 60-row cap holds after 70 routed notices, and the total is 70', () => {
    setQueue(Array.from({ length: 70 }, (_, i) => minor(`n${i + 1}`)))
    expect(game().queue).toEqual([])
    const inbox = readInbox(game())
    expect(inbox.items).toHaveLength(INBOX_MAX)
    expect(inbox.total).toBe(70)
    expect(inbox.items[0].id).toBe('n11')
    expect(inbox.items[INBOX_MAX - 1].id).toBe('n70')
    expect(inboxUnread(game())).toBe(INBOX_MAX)
  })

  it('stays within the cap across several passes', () => {
    for (let round = 0; round < 3; round++) setQueue(Array.from({ length: 30 }, (_, i) => minor(`r${round}n${i}`)))
    const inbox = readInbox(game())
    expect(inbox.items).toHaveLength(INBOX_MAX)
    expect(inbox.total).toBe(90)
  })
})

describe('markInboxSeen and clearInbox', () => {
  it('markInboxSeen zeroes the unread count and keeps the rows', () => {
    setQueue([minor('n1'), minor('n2'), minor('n3')])
    expect(inboxUnread(game())).toBe(3)
    store.markInboxSeen()
    expect(inboxUnread(game())).toBe(0)
    const inbox = readInbox(game())
    expect(inbox.items).toHaveLength(3)
    expect(inbox.seen).toBe(inbox.total)
  })

  it('markInboxSeen makes one act only when something is unread', () => {
    setQueue([minor('n1'), minor('n2')])
    const before = game()
    store.markInboxSeen()
    const after = game()
    expect(after).not.toBe(before)
    store.markInboxSeen()
    store.markInboxSeen()
    expect(game()).toBe(after)
  })

  it('markInboxSeen does nothing when there is no inbox at all', () => {
    const before = game()
    store.markInboxSeen()
    expect(game()).toBe(before)
  })

  it('a row routed after the sheet was seen is unread again', () => {
    setQueue([minor('n1')])
    store.markInboxSeen()
    setQueue([minor('n2')])
    expect(inboxUnread(game())).toBe(1)
  })

  it('clearInbox empties the rows, counts them as seen and keeps the total', () => {
    setQueue([minor('n1'), minor('n2')])
    store.clearInbox()
    const inbox = readInbox(game())
    expect(inbox.items).toEqual([])
    expect(inbox.total).toBe(2)
    expect(inboxUnread(game())).toBe(0)
  })

  it('both are safe with no game', () => {
    store.abandonLife()
    expect(store.getApp().game).toBeNull()
    expect(() => store.markInboxSeen()).not.toThrow()
    expect(() => store.clearInbox()).not.toThrow()
    expect(store.getApp().game).toBeNull()
  })
})

describe('headless play is untouched', () => {
  it('ageUp with the flag on gives the same life as with it off, and never writes an inbox', () => {
    const a = createNewLife({ seed: 3, year: 2026 })
    const b = structuredClone(a)
    withFlags({ quietInbox: true }, () => {
      notice(a, 'A letter', 'A letter arrived from an old friend.', { weight: 'minor' })
      ageUp(a)
    })
    withFlags({ quietInbox: false }, () => {
      notice(b, 'A letter', 'A letter arrived from an old friend.', { weight: 'minor' })
      ageUp(b)
    })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.flags.inbox).toBeUndefined()
    expect(a.queue.some((m) => m.kind === 'notice' && m.title === 'A letter')).toBe(true)
  })
})
