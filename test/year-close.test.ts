// R3-Q4 (E.D2 b): closeYear (src/game/hubs/year-close.ts). One call at the end of the store's year: it resolves the year events task, budgets the
// unrequested choices (3 a year, the rest wait at most 2 years in flags.pendingAsks), folds the small notices into log lines and the card,
// queues the card last and remembers it in the year book. It is idempotent by year, never throws, and draws no number of its own.
//
// Most cases use a synthetic queue on a real life; a few play real years (ageUp, closeYear, the popups answered) to see it on live data.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { currentLogYear, shortMoney, withLogSource } from '../src/game/core'
import { FLAG_DEFS } from '../src/game/flags'
import { DEFERRABLE_SCRIPTS, closeYear } from '../src/game/hubs/year-close'
import { readPending, readYearBook, writePending, writeYearBook } from '../src/game/hubs/year-book'
import { YEAR_LIMITS, moneyFacts, moneyLine, noticeWeight } from '../src/game/hubs/year-plan'
import { createNewLife } from '../src/game/life'
import { acctBalance, playerAcct } from '../src/game/kernel/ledger'
import { EVENT_SCRIPT } from '../src/game/events/helpers'
import { presentAskDirect, ASK_SCRIPT, BUNDLE_SCRIPT } from '../src/game/events/wealth-resolve'
import { askDefs } from '../src/game/events/wealth-catalog'
import { applyFallback } from '../src/game/offline'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, InputModal, MinigameModal, ModalItem, NoticeModal, YearCard } from '../src/game/types'
import { drain } from './market-kit'
import { findSeed } from './seed-kit'

afterEach(() => {
  vi.restoreAllMocks()
})

function life(year = 2000, seed = findSeed(() => true, { label: 'any life' })): GameState {
  const g = createNewLife({ seed, year })
  g.queue = []
  return g
}

/** A notice in play (it has a source), a plain weight 2 title that no table knows unless `extra` says more. */
function N(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id, title: `Title ${id}`, text: `Text of ${id}.`, s: 'health', ...extra }
}

function C(id: string, scriptId = EVENT_SCRIPT, extra: Partial<ChoiceModal> = {}): ChoiceModal {
  return {
    kind: 'choice',
    id,
    title: `Pick ${id}`,
    text: `Which one for ${id}?`,
    choices: [
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
    ],
    source: 'script',
    scriptId,
    s: 'events',
    ...extra,
  }
}

/** A choice the player asked for: no source. */
function mine(id: string): ChoiceModal {
  const m = C(id, 'some.script')
  delete m.s
  return m
}

function T(id = 'task1'): ModalItem {
  return { kind: 'aiTask', id, task: { type: 'yearEvents' } }
}

const ids = (list: readonly { id: string }[]): string[] => list.map((m) => m.id)
const titles = (list: readonly ModalItem[]): string[] => list.filter((m) => m.kind === 'choice').map((m) => (m as ChoiceModal).title)

/** The year card at the end of the queue, if the last item is one. */
function lastCard(g: GameState): { modal: NoticeModal; card: YearCard } | null {
  const m = g.queue[g.queue.length - 1]
  return m && m.kind === 'notice' && m.digest ? { modal: m, card: m.digest } : null
}

/** One more year, as ageUp would leave the clock: the queue is empty (the player answered everything). */
function nextYear(g: GameState): void {
  g.queue = []
  g.year += 1
  g.character.age += 1
}

function cardLines(c: YearCard): number {
  return 1 + c.stories.length + (c.money ? 1 : 0) + (c.people?.length ?? 0) + (c.world ? 1 : 0)
}

// ---------------------------------------------------------------------------
describe('the flag and the table', () => {
  it('the flag is the ninth key: on since the release commit flipped it with the version', () => {
    expect(FLAG_DEFS.yearCard).toEqual({ default: true, ships: '5.1.0' })
  })

  it('only the three scripts of the plan may wait, and they are the real script ids', () => {
    expect([...DEFERRABLE_SCRIPTS].sort()).toEqual([ASK_SCRIPT, BUNDLE_SCRIPT, EVENT_SCRIPT].sort())
    expect([...DEFERRABLE_SCRIPTS].sort()).toEqual(['events.random', 'wealth.ask', 'wealth.bundle'])
  })
})

// ---------------------------------------------------------------------------
describe('the choice budget: three unrequested choices a year', () => {
  it('7 choices, 5 of them deferrable: the 2 others and 1 deferrable are kept, 4 wait', () => {
    const g = life()
    g.queue = [
      C('c1', EVENT_SCRIPT),
      C('c2', ASK_SCRIPT),
      C('c3', ASK_SCRIPT),
      C('c4', BUNDLE_SCRIPT),
      C('c5', EVENT_SCRIPT),
      C('x1', 'company.sell'),
      C('x2', 'career.offer'),
    ]
    const r = closeYear(g)
    expect(r).toMatchObject({ closed: true, deferred: 4, requeued: 0, card: 'popup' })
    expect(ids(g.queue.filter((m) => m.kind === 'choice'))).toEqual(['c1', 'x1', 'x2'])
    const pending = readPending(g)
    expect(pending.map((p) => p.m.title)).toEqual(['Pick c2', 'Pick c3', 'Pick c4', 'Pick c5'])
    for (const p of pending) expect(p.y).toBe(g.year)
    expect('id' in pending[0]!.m).toBe(false)
  })

  it('never defers a choice of any other script, however many there are', () => {
    const g = life()
    g.queue = [C('x1', 'company.sell'), C('x2', 'career.offer'), C('x3', 'crime.heist'), C('x4', 'nation.vote'), C('x5', 'company.hire'), C('d1', EVENT_SCRIPT), C('d2', ASK_SCRIPT)]
    const r = closeYear(g)
    expect(r.deferred).toBe(2)
    expect(ids(g.queue.filter((m) => m.kind === 'choice'))).toEqual(['x1', 'x2', 'x3', 'x4', 'x5'])
    expect(readPending(g)).toHaveLength(2)
  })

  it('counts only the choices nobody asked for: the player\'s own stay and take no room', () => {
    const g = life()
    g.queue = [mine('own1'), mine('own2'), mine('own3'), mine('own4'), C('d1'), C('d2'), C('d3'), C('d4')]
    closeYear(g)
    expect(ids(g.queue.filter((m) => m.kind === 'choice'))).toEqual(['own1', 'own2', 'own3', 'own4', 'd1', 'd2', 'd3'])
    expect(readPending(g).map((p) => p.m.title)).toEqual(['Pick d4'])
  })

  it('a year with at most 3 unrequested choices defers nothing', () => {
    const g = life()
    g.queue = [C('d1'), C('d2'), C('d3')]
    const r = closeYear(g)
    expect(r.deferred).toBe(0)
    expect(ids(g.queue.filter((m) => m.kind === 'choice'))).toEqual(['d1', 'd2', 'd3'])
    expect('pendingAsks' in g.flags).toBe(false)
  })

  it('re-queues the asks of earlier years first, with new ids, and leaves the rest waiting', () => {
    const g = life()
    g.queue = [C('d1'), C('d2'), C('d3'), C('d4'), C('d5')]
    closeYear(g)
    expect(readPending(g).map((p) => p.m.title)).toEqual(['Pick d4', 'Pick d5'])
    const firstYear = g.year
    nextYear(g)
    g.queue = [C('e1'), C('e2'), C('e3'), C('e4')]
    const r = closeYear(g)
    expect(r).toMatchObject({ closed: true, requeued: 2, deferred: 3 })
    const choices = g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')
    // Room for 3: the two old asks, then the first of this year's.
    expect(choices.map((m) => m.title).sort()).toEqual(['Pick d4', 'Pick d5', 'Pick e1'])
    const old = choices.filter((m) => m.title === 'Pick d4' || m.title === 'Pick d5')
    for (const m of old) {
      expect(m.id).toMatch(/^m\d+$/)
      expect(['d4', 'd5']).not.toContain(m.id)
      expect(m.scriptId).toBe(EVENT_SCRIPT)
    }
    expect(new Set(ids(g.queue)).size).toBe(g.queue.length)
    expect(readPending(g).map((p) => [p.m.title, p.y])).toEqual([['Pick e2', g.year], ['Pick e3', g.year], ['Pick e4', g.year]])
    expect(firstYear).toBeLessThan(g.year)
  })

  it('an ask waits at most 2 years: it stays while the budget is full and is dropped in the third', () => {
    const g = life()
    g.queue = [C('x1', 'company.a'), C('x2', 'company.b'), C('x3', 'company.c'), C('d1')]
    closeYear(g)
    expect(readPending(g).map((p) => p.m.title)).toEqual(['Pick d1'])
    for (let i = 0; i < 2; i++) {
      nextYear(g)
      g.queue = [C('x1', 'company.a'), C('x2', 'company.b'), C('x3', 'company.c')]
      const r = closeYear(g)
      expect(r.requeued).toBe(0)
      expect(readPending(g).map((p) => p.m.title)).toEqual(['Pick d1'])
    }
    nextYear(g)
    g.queue = []
    const r = closeYear(g)
    expect(r.requeued).toBe(0)
    expect(g.queue.filter((m) => m.kind === 'choice')).toHaveLength(0)
    expect('pendingAsks' in g.flags).toBe(false)
  })

  it('an ask that gets room in its second year is asked then', () => {
    const g = life()
    g.queue = [C('x1', 'company.a'), C('x2', 'company.b'), C('x3', 'company.c'), C('d1')]
    closeYear(g)
    nextYear(g)
    g.queue = [C('x1', 'company.a'), C('x2', 'company.b'), C('x3', 'company.c')]
    closeYear(g)
    nextYear(g)
    g.queue = []
    const r = closeYear(g)
    expect(r.requeued).toBe(1)
    expect(titles(g.queue)).toEqual(['Pick d1'])
    expect('pendingAsks' in g.flags).toBe(false)
  })

  it('holds at most 6 waiting asks and drops the oldest', () => {
    const g = life()
    const full = (prefix: string): ModalItem[] => [C('x1', 'company.a'), C('x2', 'company.b'), C('x3', 'company.c'), ...Array.from({ length: 5 }, (_, i) => C(`${prefix}${i}`))]
    g.queue = full('a')
    closeYear(g)
    expect(readPending(g)).toHaveLength(5)
    nextYear(g)
    g.queue = full('b')
    closeYear(g)
    expect(readPending(g).map((p) => p.m.title)).toEqual(['Pick a4', 'Pick b0', 'Pick b1', 'Pick b2', 'Pick b3', 'Pick b4'])
  })

  it('drops a waiting ask whose script may not wait', () => {
    const g = life()
    writePending(g, [{ y: g.year - 1, m: { kind: 'choice', title: 'Sell?', text: 't', choices: [{ id: 'a', label: 'A' }], source: 'script', scriptId: 'company.sell' } }])
    g.queue = []
    const r = closeYear(g)
    expect(r.requeued).toBe(0)
    expect(g.queue.filter((m) => m.kind === 'choice')).toHaveLength(0)
  })

  it('answering a deferred ask whose asker died does not throw', () => {
    const g = life()
    const sister = createPerson(g, { relation: 'sibling', age: 30, lastName: g.character.lastName, money: 100 })
    const def = askDefs()[0]!
    g.queue = [C('x1', 'company.a'), C('x2', 'company.b'), C('x3', 'company.c')]
    withLogSource('wealth', () =>
      presentAskDirect(g, { k: def.id, pid: sister.id, title: 'A Favor', emoji: '\u{1F4B5}', text: 'Can you help me out?', amt: 500, what: 'a favour' }),
    )
    closeYear(g)
    expect(readPending(g).map((p) => p.m.title)).toEqual(['A Favor'])
    const person = g.people.find((p) => p.id === sister.id)!
    person.alive = false
    nextYear(g)
    g.queue = []
    closeYear(g)
    const ask = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.title === 'A Favor')!
    expect(ask).toBeDefined()
    for (const option of ask.choices) {
      const copy = structuredClone(g)
      expect(() => runScript(copy, ASK_SCRIPT, option.id, ask.data, ask)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
describe('the year events task', () => {
  it('is resolved by the close: no task is left, the flavor lines and the event choice carry the source events', () => {
    const seed = findSeed(
      (s) => {
        const g = life(2005, s)
        const before = currentLogYear(g).entries.length
        g.queue = [T()]
        closeYear(g)
        return currentLogYear(g).entries.length > before && g.queue.some((m) => m.kind === 'choice' && m.scriptId === EVENT_SCRIPT)
      },
      { label: 'a year with flavor lines and an event' },
    )
    const g = life(2005, seed)
    const before = currentLogYear(g).entries.length
    g.queue = [T()]
    const r = closeYear(g)
    expect(r.closed).toBe(true)
    expect(g.queue.some((m) => m.kind === 'aiTask')).toBe(false)
    const fresh = currentLogYear(g).entries.slice(before)
    expect(fresh.length).toBeGreaterThan(0)
    for (const e of fresh) expect(e.s, e.text).toBe('events')
    const event = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === EVENT_SCRIPT)!
    expect(event.s).toBe('events')
    expect(lastCard(g)).not.toBeNull()
  })

  it('leaves other tasks alone and draws nothing when there is no year events task', () => {
    const g = life()
    const before = g.rng
    g.queue = [{ kind: 'aiTask', id: 'obit', task: { type: 'obituary' } }, N('n1', { w: 3 })]
    closeYear(g)
    expect(g.rng).toBe(before)
    expect(ids(g.queue).slice(0, 2)).toEqual(['obit', 'n1'])
  })

  it('a headless ageUp still queues the task last and writes no year book (the close is the store flow only)', () => {
    const g = life(2005)
    ageUp(g)
    const last = g.queue[g.queue.length - 1]
    expect(last?.kind === 'aiTask' && last.task.type === 'yearEvents').toBe(true)
    expect(g.queue.some((m) => m.kind === 'notice' && m.digest)).toBe(false)
    expect('yearBook' in g.flags).toBe(false)
    expect('pendingAsks' in g.flags).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('notices: fold the small ones, keep the rest', () => {
  it('folds weight 0 and 1 outcomes out of the queue and into the log: log-only', () => {
    const g = life()
    g.queue = [N('n1', { s: 'health', w: 1, title: 'Friendly Visit', text: 'A friend dropped by.' }), N('n2', { s: 'career', w: 0, title: 'Desk Plant', text: 'The desk plant is thriving.' })]
    const r = closeYear(g)
    expect(r).toMatchObject({ closed: true, kept: 0, folded: 2 })
    expect(g.queue.filter((m) => m.kind === 'notice' && !m.digest)).toHaveLength(0)
    const lines = currentLogYear(g).entries.filter((e) => e.id.startsWith('fold-'))
    expect(lines.map((e) => e.id)).toEqual([`fold-${g.generation}-${g.year}-n1`, `fold-${g.generation}-${g.year}-n2`])
    expect(lines[0]).toMatchObject({ s: 'health', w: 1, tone: 'neutral' })
    expect(lines[0]!.text).toContain('Friendly Visit')
    expect(lines[1]).toMatchObject({ s: 'career', w: 0 })
  })

  it('adds no log line for a folded notice whose source already wrote one this year', () => {
    const g = life()
    currentLogYear(g).entries.push({ id: 'l1', text: 'I caught a cold.', tone: 'neutral', s: 'health', w: 1 })
    g.queue = [N('n1', { s: 'health', w: 1, title: 'A Cold', text: 'You caught a cold.' })]
    closeYear(g)
    expect(currentLogYear(g).entries.filter((e) => e.id.startsWith('fold-'))).toEqual([])
    expect(g.queue.filter((m) => m.kind === 'notice' && !m.digest)).toHaveLength(0)
  })

  it('keeps the best 3 of a noisy year and puts the rest on the card', () => {
    const g = life()
    g.queue = Array.from({ length: 8 }, (_, i) => N(`n${i}`, { s: 'investments', a: (i + 1) * 1000 }))
    const r = closeYear(g)
    expect(r).toMatchObject({ kept: 3, folded: 5 })
    expect(ids(g.queue.filter((m) => m.kind === 'notice' && !m.digest))).toEqual(['n5', 'n6', 'n7'])
  })

  it('never folds a weight 3 notice, however many there are', () => {
    const g = life()
    g.queue = Array.from({ length: 6 }, (_, i) => N(`n${i}`, { w: 3, s: 'household', title: `Life Event ${i}` }))
    closeYear(g)
    expect(ids(g.queue.filter((m) => m.kind === 'notice' && !m.digest))).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5'])
  })

  it('keeps a notice that comes right before a choice of its own source, even at weight 1', () => {
    const g = life()
    g.queue = [N('ctx', { s: 'events', w: 1, title: 'Context' }), C('c1', EVENT_SCRIPT, { s: 'events' }), N('other', { s: 'events', w: 1, title: 'Other' })]
    closeYear(g)
    expect(ids(g.queue)).toEqual(['ctx', 'c1', `year-${g.generation}-${g.year}`])
  })

  it('a notice before a choice that waits is a plain notice again', () => {
    const g = life()
    g.queue = [C('c1'), C('c2'), C('c3'), N('ctx', { s: 'events', w: 1, title: 'Context' }), C('c4', ASK_SCRIPT, { s: 'events' })]
    closeYear(g)
    expect(ids(g.queue)).toEqual(['c1', 'c2', 'c3', `year-${g.generation}-${g.year}`])
    expect(readPending(g).map((p) => p.m.title)).toEqual(['Pick c4'])
  })

  it('leaves what is not in play where it is: no source, a support line, an input, a minigame, a task', () => {
    const g = life()
    const input: InputModal = { kind: 'input', id: 'in1', title: 'Name It', text: 'A name?', input: 'text', scriptId: 'x.y' } as InputModal
    const game: MinigameModal = { kind: 'minigame', id: 'mg1', game: 'slots', title: 'Slots', scriptId: 'x.z', data: {} }
    const own = N('own', { w: 1 })
    delete own.s
    const task: ModalItem = { kind: 'aiTask', id: 'obit', task: { type: 'obituary' } }
    g.queue = [own, N('help', { support: true, w: 1 }), input, game, task, N('small', { w: 1 })]
    closeYear(g)
    expect(ids(g.queue)).toEqual(['own', 'help', 'in1', 'mg1', 'obit', `year-${g.generation}-${g.year}`])
  })

  it('keeps a notice the never-route policy blocks, even at weight 1', () => {
    const g = life()
    g.queue = [N('bad', { w: 1, tone: 'bad', title: 'Bad News', text: 'Something went wrong.' })]
    const r = closeYear(g)
    expect(r.kept).toBe(1)
    expect(ids(g.queue)).toEqual(['bad', `year-${g.generation}-${g.year}`])
  })

  it('keeps the queue in its original relative order', () => {
    const g = life()
    g.queue = [N('a', { w: 3 }), C('c1'), N('b', { w: 3 }), mine('m1'), N('c', { w: 3 })]
    closeYear(g)
    expect(ids(g.queue)).toEqual(['a', 'c1', 'b', 'm1', 'c', `year-${g.generation}-${g.year}`])
  })
})

// ---------------------------------------------------------------------------
describe('the card', () => {
  it('is the last item of the queue, a notice with the digest, and the text is the headline', () => {
    const g = life()
    g.queue = [N('n1', { w: 3, title: 'Big News', text: 'It happened.' }), C('c1')]
    const r = closeYear(g)
    expect(r.card).toBe('popup')
    const last = lastCard(g)!
    expect(last.modal.id).toBe(`year-${g.generation}-${g.year}`)
    expect(last.modal.text).toBe(last.card.head)
    expect(last.modal.emoji).toBe('\u{1F4CB}')
    expect(last.modal.s).toBeUndefined()
    expect(last.card.year).toBe(g.year)
    expect(last.card.age).toBe(g.character.age)
    expect(last.card.head).toContain('Big News')
    expect(cardLines(last.card)).toBeLessThanOrEqual(YEAR_LIMITS.lines)
    expect(g.queue.filter((m) => m.kind === 'notice' && m.digest)).toHaveLength(1)
  })

  it('a quiet year still gets a card: the culture line or a plain line', () => {
    const g = life()
    g.queue = []
    const r = closeYear(g)
    expect(r.card).toBe('popup')
    expect(lastCard(g)!.card.head.length).toBeGreaterThan(0)
    expect(lastCard(g)!.card.head.length).toBeLessThanOrEqual(YEAR_LIMITS.head)
  })

  it('shows the folded stories: a folded notice is on the card or in the log, never lost', () => {
    const g = life()
    g.queue = [N('n1', { s: 'wealth', w: 1, title: 'Small Gift', text: 'A friend sent a small gift.' }), N('n2', { w: 3, s: 'household', title: 'A Birth' })]
    closeYear(g)
    const card = lastCard(g)!.card
    const text = JSON.stringify(card) + JSON.stringify(currentLogYear(g).entries)
    expect(text).toContain('Small Gift')
  })

  it('is remembered in the year book, with the year closed and one more popup counted', () => {
    const g = life()
    g.queue = [N('n1', { w: 3 })]
    closeYear(g)
    const book = readYearBook(g)
    expect(book.last).toBe(g.year)
    expect(book.shown).toBe(1)
    expect(book.cards).toHaveLength(1)
    expect(book.cards[0]!.year).toBe(g.year)
    expect(book.cards[0]!.inline).toBeUndefined()
    expect(book.cards[0]).toEqual(lastCard(g)!.card)
    // The card on the queue is its own copy.
    lastCard(g)!.card.head = 'Changed in the queue'
    expect(readYearBook(g).cards[0]!.head).not.toBe('Changed in the queue')
  })

  it('keeps the newest 3 cards of the book', () => {
    const g = life()
    for (let i = 0; i < 5; i++) {
      g.queue = []
      closeYear(g)
      nextYear(g)
    }
    const years = readYearBook(g).cards.map((c) => c.year)
    expect(years).toEqual([g.year - 3, g.year - 2, g.year - 1])
  })

  it('the 11th year makes an inline card: nothing is queued, and shown stops at 10', () => {
    const g = life()
    const kinds: string[] = []
    for (let i = 0; i < 12; i++) {
      g.queue = [N('n1', { w: 1 })]
      kinds.push(closeYear(g).card)
      if (i < 10) expect(lastCard(g)).not.toBeNull()
      else expect(g.queue.some((m) => m.kind === 'notice' && m.digest)).toBe(false)
      nextYear(g)
    }
    expect(kinds).toEqual([...Array.from({ length: 10 }, () => 'popup'), 'inline', 'inline'])
    const book = readYearBook(g)
    expect(book.shown).toBe(10)
    expect(book.cards[book.cards.length - 1]!.inline).toBe(true)
    expect(book.cards[book.cards.length - 1]!.year).toBe(g.year - 1)
  })

  it('writes an inline card with the folded stories still on it', () => {
    const g = life()
    writeYearBook(g, { v: 1, last: g.year - 1, shown: YEAR_LIMITS.popupYears, cards: [] })
    g.queue = [N('n1', { w: 1, s: 'wealth', title: 'Small Gift', text: 'A friend sent a gift.' })]
    const r = closeYear(g)
    expect(r).toMatchObject({ closed: true, card: 'inline', folded: 1 })
    expect(g.queue).toEqual([])
    const stored = readYearBook(g).cards[0]!
    expect(stored.inline).toBe(true)
    expect(JSON.stringify(stored)).toContain('Small Gift')
  })

  it('the money line is the books: cash from the player account, and the card line is the plan line', () => {
    const g = life(2000)
    for (let i = 0; i < 3; i++) {
      ageUp(g)
      drain(g)
    }
    ageUp(g)
    const cash = acctBalance(g, playerAcct(g))
    const facts = moneyFacts(g)!
    expect(facts.cash).toBe(cash)
    closeYear(g)
    const card = lastCard(g)!.card
    expect(card.money).toBe(moneyLine(facts))
    expect(card.money).toContain(`Cash ${shortMoney(cash)}`)
  })
})

// ---------------------------------------------------------------------------
describe('idempotent by year', () => {
  it('a second call changes nothing and says so', () => {
    const g = life()
    g.queue = [C('c1'), C('c2'), C('c3'), C('c4'), N('n1', { w: 1 }), N('n2', { w: 3 })]
    expect(closeYear(g).closed).toBe(true)
    const once = JSON.stringify(g)
    expect(closeYear(g)).toEqual({ closed: false, kept: 0, folded: 0, deferred: 0, requeued: 0, card: 'none' })
    expect(JSON.stringify(g)).toBe(once)
  })

  it('does not close a year the book already holds', () => {
    const g = life()
    writeYearBook(g, { v: 1, last: g.year, shown: 1, cards: [] })
    g.queue = [N('n1', { w: 1 })]
    const before = JSON.stringify(g)
    expect(closeYear(g).closed).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('closes the next year again', () => {
    const g = life()
    expect(closeYear(g).closed).toBe(true)
    nextYear(g)
    expect(closeYear(g).closed).toBe(true)
    expect(readYearBook(g).last).toBe(g.year)
  })

  it('has no foresight: a book from a later year is read as it was, so this year closes', () => {
    const g = life()
    const future = (y: number): YearCard => ({ v: 1, year: g.year + y, age: 30, head: `Later ${y}`, stories: [], groups: [] })
    g.flags.yearBook = { v: 1, last: g.year + 3, shown: 3, cards: [future(1), future(2), future(3)] } as never
    expect(closeYear(g).closed).toBe(true)
    const book = readYearBook(g)
    expect(book.last).toBe(g.year)
    expect(book.cards.map((c) => c.year)).toEqual([g.year])
  })

  it('a replay from an earlier state gives the same close: the same state in, the same state out', () => {
    const g = life()
    g.queue = [C('c1'), C('c2'), C('c3'), C('c4'), N('n1', { w: 1 }), N('n2', { w: 3 }), T()]
    const a = structuredClone(g)
    const b = structuredClone(g)
    closeYear(a)
    closeYear(b)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

// ---------------------------------------------------------------------------
describe('never throws, and leaves the game as it came in', () => {
  it('a queue with a hole in it: not closed, nothing changed, the error reported once', () => {
    const g = life()
    g.queue = [N('n1', { w: 1 }), null as unknown as ModalItem, N('n2', { w: 3 })]
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const before = JSON.stringify(g)
    let r: ReturnType<typeof closeYear> | undefined
    expect(() => {
      r = closeYear(g)
    }).not.toThrow()
    expect(r).toEqual({ closed: false, kept: 0, folded: 0, deferred: 0, requeued: 0, card: 'none' })
    expect(JSON.stringify(g)).toBe(before)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('a failure after the year events task ran puts the task back, so the year is played the old way', () => {
    const g = life()
    const lines = currentLogYear(g).entries.length
    g.queue = [T('t1'), null as unknown as ModalItem]
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = closeYear(g)
    expect(r.closed).toBe(false)
    expect(currentLogYear(g).entries).toHaveLength(lines)
    expect(g.queue[0]).toEqual(T('t1'))
    expect(g.queue).toHaveLength(2)
    expect('yearBook' in g.flags).toBe(false)
  })

  it('a failure after the year events task ran leaves every draw, memory and counter as it came in, so the task replays to the very year the old way plays', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let failures = 0
    for (const n of [1, 2, 3]) {
      const g = life(1990, findSeed(() => true, { from: n * 11, label: `failed close life ${n}` }))
      for (let year = 0; year < 12 && g.character.alive; year++) {
        ageUp(g)
        if (!g.character.alive || !g.queue.some((m) => m.kind === 'aiTask' && m.task.type === 'yearEvents')) break
        const before = JSON.stringify(g)
        // The old way: the task resolved where it stands (what the store does when the close did not run).
        const twin = JSON.parse(before) as GameState
        const task = twin.queue.find((m) => m.kind === 'aiTask')!
        twin.queue = twin.queue.filter((m) => m !== task)
        if (task.kind === 'aiTask') applyFallback(twin, task.task)
        // A close that fails after step 1 (a hole in the queue).
        g.queue.push(null as unknown as ModalItem)
        expect(closeYear(g).closed, `life ${n} year ${year}`).toBe(false)
        failures++
        g.queue.pop()
        expect(JSON.stringify(g), `life ${n} year ${year}: a failed close changes nothing`).toBe(before)
        // The store then resolves the task as it always did: the same year as the twin that never tried the close.
        const at = g.queue.findIndex((m) => m.kind === 'aiTask')
        const [again] = g.queue.splice(at, 1)
        if (again && again.kind === 'aiTask') applyFallback(g, again.task)
        expect(JSON.stringify(g), `life ${n} year ${year}: the replay is the old way`).toBe(JSON.stringify(twin))
        g.queue = []
      }
    }
    expect(failures).toBeGreaterThan(20)
  })

  it('does nothing for a character who is dead', () => {
    const g = life()
    g.character.alive = false
    g.queue = [N('n1', { w: 1 })]
    const before = JSON.stringify(g)
    expect(closeYear(g).closed).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------
describe('on real years', () => {
  it('3 seeded lives for 12 years: at most 3 unrequested choices, 5 kept notices and one card, a popup for 10 years and then inline', () => {
    const seeds = [1, 2, 3].map((n) => findSeed(() => true, { from: n * 7, label: `any life ${n}` }))
    for (const seed of seeds) {
      const g = life(1990, seed)
      for (let year = 0; year < 12; year++) {
        ageUp(g)
        if (!g.character.alive) break
        const r = closeYear(g)
        expect(r.closed, `seed ${seed} year ${year}`).toBe(true)
        expect(g.queue.some((m) => m.kind === 'aiTask' && m.task.type === 'yearEvents')).toBe(false)
        const unrequested = g.queue.filter((m) => m.kind === 'choice' && m.s !== undefined)
        expect(unrequested.length).toBeLessThanOrEqual(YEAR_LIMITS.choices)
        // Kept notices: the life-changing ones and the ones that explain a choice are never counted against the room of 5.
        const inPlay = g.queue.filter((m, i) => {
          if (m.kind !== 'notice' || m.digest || m.s === undefined) return false
          const next = g.queue[i + 1]
          return noticeWeight(m) < 3 && !(next && next.kind === 'choice' && next.s === m.s)
        })
        expect(inPlay.length).toBeLessThanOrEqual(YEAR_LIMITS.noticesMax)
        // The first 10 years of a life end with the card as a popup; after that it is inline, and the book holds it.
        const shown = year < YEAR_LIMITS.popupYears ? lastCard(g)?.card : readYearBook(g).cards[readYearBook(g).cards.length - 1]
        expect(shown, `seed ${seed} year ${year}`).toBeDefined()
        expect(r.card).toBe(year < YEAR_LIMITS.popupYears ? 'popup' : 'inline')
        expect(cardLines(shown!)).toBeLessThanOrEqual(YEAR_LIMITS.lines)
        if (shown!.money) expect(shown!.money).toContain(`Cash ${shortMoney(acctBalance(g, playerAcct(g)))}`)
        drain(g)
      }
    }
  })
})
