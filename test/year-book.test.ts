// R3-Q4 (E.D2 b): the year book and the pending asks (src/game/hubs/year-book.ts). Both live in g.flags, so a hostile or damaged save can put
// anything there: every read repairs it to bounds, every write repairs first, and nothing here reads a year after g.year (no foresight).
// The heir starts without either key (both are personal flags, world-flags.ts).
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { readPending, readYearBook, writePending, writeYearBook, type PendingAsk, type YearBook } from '../src/game/hubs/year-book'
import { YEAR_LIMITS } from '../src/game/hubs/year-plan'
import { continueAsChild, createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { ChoiceModal, GameState, Json, YearCard } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'
import { deepFreeze } from './fuzz-kit'
import { adult } from './market-kit'
import { findSeed } from './seed-kit'

const J = (v: unknown): Json => v as Json

function life(year = 2000): GameState {
  const g = createNewLife({ seed: findSeed(() => true, { label: 'any life' }), year })
  g.queue = []
  return g
}

function card(year: number, extra: Partial<YearCard> = {}): YearCard {
  return { v: 1, year, age: 20, head: `Head of ${year}.`, stories: ['One story.'], groups: [], ...extra }
}

function ask(extra: Partial<Omit<ChoiceModal, 'id'>> = {}): Omit<ChoiceModal, 'id'> {
  return {
    kind: 'choice',
    title: 'A Cousin Asks',
    text: 'Can you help with rent?',
    choices: [
      { id: 'give', label: 'Give $500' },
      { id: 'no', label: 'Say no' },
    ],
    source: 'script',
    scriptId: 'wealth.ask',
    data: { ask: { k: 'rent', title: 'A Cousin Asks', what: 'rent', amt: 500 } },
    s: 'wealth',
    ...extra,
  }
}

// ---------------------------------------------------------------------------
describe('readYearBook and writeYearBook', () => {
  it('reads a life without a year book as an empty one, and the read writes nothing', () => {
    const g = life()
    expect(readYearBook(g)).toEqual({ v: 1, last: 0, shown: 0, cards: [] })
    expect('yearBook' in g.flags).toBe(false)
  })

  it('round trips what the close writes', () => {
    const g = life()
    const book: YearBook = {
      v: 1,
      last: g.year,
      shown: 4,
      cards: [
        card(g.year - 1, { money: 'Net worth $1.2K. Cash $300.', world: 'News.', people: ['Mum called.'], groups: [{ k: 'body', n: 2, lines: ['A cold.', 'A cough.'] }] }),
        card(g.year, { inline: true }),
      ],
    }
    writeYearBook(g, book)
    expect(readYearBook(g)).toEqual(book)
  })

  it('keeps the newest 3 cards, one for each year, and drops the older ones', () => {
    const g = life()
    const cards = [1, 2, 3, 4, 5].map((i) => card(g.year - 5 + i))
    writeYearBook(g, { v: 1, last: g.year, shown: 5, cards: [...cards, card(g.year, { head: 'The same year again.' })] })
    const read = readYearBook(g)
    expect(read.cards.map((c) => c.year)).toEqual([g.year - 2, g.year - 1, g.year])
    expect(read.cards[2]!.head).toBe('The same year again.')
  })

  it.each([null, 5, 'text', true, [], [1, 2, 3]])('reads %j as an empty book', (raw) => {
    const g = life()
    g.flags.yearBook = J(raw)
    expect(readYearBook(g)).toEqual({ v: 1, last: 0, shown: 0, cards: [] })
  })

  it('repairs 10,000 cards to the newest 3 and looks at no more than a short window of them', () => {
    const g = life()
    const cards = Array.from({ length: 10_000 }, (_, i) => card(g.year - (i % 50)))
    g.flags.yearBook = J({ v: 1, last: g.year, shown: 3, cards })
    const read = readYearBook(g)
    expect(read.cards.length).toBeLessThanOrEqual(3)
    for (const c of read.cards) expect(c.year).toBeLessThanOrEqual(g.year)
  })

  it('cuts 3 MB strings to the caps of a card, and every list to its length', () => {
    const g = life()
    const big = 'word '.repeat(600_000)
    const wild = {
      v: 1,
      year: g.year,
      age: 22,
      head: big,
      stories: [big, big, big, big, big],
      money: big,
      people: [big, big, big, big],
      world: big,
      groups: [{ k: 'body', n: 1e12, lines: Array.from({ length: 5000 }, () => big) }],
    }
    g.flags.yearBook = J({ v: 1, last: g.year, shown: 1, cards: [wild] })
    const read = readYearBook(g)
    expect(read.cards).toHaveLength(1)
    const c = read.cards[0]!
    const L = YEAR_LIMITS
    expect(c.head.length).toBeLessThanOrEqual(L.head)
    expect(c.stories.length).toBeLessThanOrEqual(L.stories)
    for (const s of c.stories) expect(s.length).toBeLessThanOrEqual(L.story)
    expect(c.money!.length).toBeLessThanOrEqual(L.head)
    expect(c.people!.length).toBeLessThanOrEqual(L.people)
    for (const s of c.people!) expect(s.length).toBeLessThanOrEqual(L.story)
    expect(c.world!.length).toBeLessThanOrEqual(L.head)
    expect(c.groups).toHaveLength(1)
    expect(c.groups[0]!.lines.length).toBeLessThanOrEqual(L.groupLines)
    for (const s of c.groups[0]!.lines) expect(s.length).toBeLessThanOrEqual(L.group)
    expect(c.groups[0]!.n).toBeLessThanOrEqual(9999)
    expect(JSON.stringify(read).length).toBeLessThan(20_000)
  })

  it('drops a card of the wrong shape and keeps the good ones next to it', () => {
    const g = life()
    const good = card(g.year - 1)
    const wrong = [
      { ...card(g.year - 2), v: 2 },
      { ...card(g.year - 3), head: '' },
      { ...card(g.year - 4), head: 7 },
      { ...card(g.year - 5), year: 'soon' },
      { ...card(g.year - 6), year: 12.5 },
      null,
      'card',
      [],
    ]
    g.flags.yearBook = J({ v: 1, last: g.year - 1, shown: 1, cards: [...wrong, good] })
    expect(readYearBook(g).cards).toEqual([good])
  })

  it('keeps the groups in display order, one for each kind, and drops unknown kinds', () => {
    const g = life()
    const groups = [
      { k: 'world', n: 2, lines: ['b'] },
      { k: 'nope', n: 1, lines: ['x'] },
      { k: 'people', n: 1, lines: ['a'] },
      { k: 'people', n: 9, lines: ['again'] },
      { k: 'body', n: -4, lines: [] },
      { k: 'constructor', n: 1, lines: [] },
    ]
    g.flags.yearBook = J({ v: 1, last: g.year, shown: 1, cards: [{ ...card(g.year), groups }] })
    const out = readYearBook(g).cards[0]!.groups
    expect(out.map((x) => x.k)).toEqual(['people', 'body', 'world'])
    expect(out[0]).toEqual({ k: 'people', n: 1, lines: ['a'] })
    expect(out[1]!.n).toBe(0)
  })

  it('keeps inline only when it is the value true', () => {
    const g = life()
    g.flags.yearBook = J({ v: 1, last: g.year, shown: 11, cards: [{ ...card(g.year - 1), inline: 'yes' }, { ...card(g.year), inline: true }] })
    const cards = readYearBook(g).cards
    expect('inline' in cards[0]!).toBe(false)
    expect(cards[1]!.inline).toBe(true)
  })

  it('has no foresight: a card dated after g.year is dropped, and a last year after g.year reads as the year before', () => {
    const g = life()
    g.flags.yearBook = J({ v: 1, last: g.year + 5, shown: 3, cards: [card(g.year - 1), card(g.year), card(g.year + 1), card(g.year + 4)] })
    const read = readYearBook(g)
    expect(read.cards.map((c) => c.year)).toEqual([g.year - 1, g.year])
    expect(read.last).toBe(g.year - 1)
    // A book that is right stays as it is.
    g.flags.yearBook = J({ v: 1, last: g.year, shown: 3, cards: [card(g.year)] })
    expect(readYearBook(g).last).toBe(g.year)
  })

  it('bounds last and shown to whole numbers', () => {
    const g = life()
    for (const [last, shown] of [[-3, -1], [1.5, 2.5], [Number.NaN, 'many'], [null, {}]] as const) {
      g.flags.yearBook = J({ v: 1, last, shown, cards: [] })
      const read = readYearBook(g)
      expect(Number.isInteger(read.last) && read.last >= 0 && read.last <= g.year).toBe(true)
      expect(Number.isInteger(read.shown) && read.shown >= 0).toBe(true)
    }
    g.flags.yearBook = J({ v: 1, last: g.year, shown: 1e18, cards: [] })
    expect(readYearBook(g).shown).toBeLessThanOrEqual(1_000_000)
  })

  it('never writes when it reads: a deep-frozen flag reads and a frozen game stays equal', () => {
    const g = life()
    g.flags.yearBook = J({ v: 1, last: g.year, shown: 2, cards: [card(g.year)] })
    const before = JSON.stringify(g.flags)
    deepFreeze(g.flags)
    expect(() => readYearBook(g)).not.toThrow()
    expect(JSON.stringify(g.flags)).toBe(before)
  })

  it('writes a repaired book: a hostile one handed to the writer comes back valid', () => {
    const g = life()
    writeYearBook(g, { v: 1, last: g.year + 9, shown: -5, cards: [card(g.year + 3), { ...card(g.year), head: 'x'.repeat(5000) }] } as YearBook)
    const read = readYearBook(g)
    expect(read.cards).toHaveLength(1)
    expect(read.cards[0]!.head.length).toBeLessThanOrEqual(YEAR_LIMITS.head)
    expect(read.shown).toBe(0)
    // What was stored is already the repaired form.
    expect(JSON.stringify(g.flags.yearBook)).toBe(JSON.stringify(read))
  })
})

// ---------------------------------------------------------------------------
describe('readPending and writePending', () => {
  it('reads a life without pending asks as none, and the read writes nothing', () => {
    const g = life()
    expect(readPending(g)).toEqual([])
    expect('pendingAsks' in g.flags).toBe(false)
  })

  it('round trips a good ask unchanged', () => {
    const g = life()
    const list: PendingAsk[] = [{ y: g.year - 1, m: ask() }, { y: g.year, m: ask({ title: 'Second', scriptId: 'wealth.bundle', emoji: '\u{1F4EC}', personId: 'p9' }) }]
    writePending(g, list)
    expect(readPending(g)).toEqual(list)
  })

  it.each([null, 5, 'text', true, {}, { 0: 1 }])('reads %j as none', (raw) => {
    const g = life()
    g.flags.pendingAsks = J(raw)
    expect(readPending(g)).toEqual([])
  })

  it('repairs 10,000 entries to at most 6, the newest', () => {
    const g = life()
    g.flags.pendingAsks = J(Array.from({ length: 10_000 }, (_, i) => ({ y: g.year, m: ask({ title: `Ask ${i}` }) })))
    const read = readPending(g)
    expect(read).toHaveLength(YEAR_LIMITS.pending)
    expect(read.map((p) => p.m.title)).toEqual(Array.from({ length: 6 }, (_, i) => `Ask ${9_994 + i}`))
  })

  it('drops an ask older than 2 years or dated after g.year, and keeps the rest', () => {
    const g = life()
    g.flags.pendingAsks = J([
      { y: g.year - 3, m: ask({ title: 'Too old' }) },
      { y: g.year - 2, m: ask({ title: 'Last chance' }) },
      { y: g.year - 1, m: ask({ title: 'Recent' }) },
      { y: g.year + 1, m: ask({ title: 'From the future' }) },
      { y: 'last year', m: ask({ title: 'No year' }) },
      { y: g.year - 0.5, m: ask({ title: 'Half a year' }) },
    ])
    expect(readPending(g).map((p) => p.m.title)).toEqual(['Last chance', 'Recent'])
  })

  it('repairs a choice with 500 options to at most 12 whole ones with different ids', () => {
    const g = life()
    const choices = Array.from({ length: 500 }, (_, i) => ({ id: `o${i % 40}`, label: `Option ${i}`, emoji: 'e'.repeat(300), hint: 'h'.repeat(5000) }))
    g.flags.pendingAsks = J([{ y: g.year, m: ask({ choices }) }])
    const read = readPending(g)
    expect(read).toHaveLength(1)
    const opts = read[0]!.m.choices
    expect(opts.length).toBeLessThanOrEqual(12)
    expect(new Set(opts.map((o) => o.id)).size).toBe(opts.length)
    for (const o of opts) {
      expect(o.label.length).toBeLessThanOrEqual(200)
      expect((o.emoji ?? '').length).toBeLessThanOrEqual(16)
      expect((o.hint ?? '').length).toBeLessThanOrEqual(400)
    }
  })

  it('drops options that are not whole and an ask left without any', () => {
    const g = life()
    g.flags.pendingAsks = J([
      { y: g.year, m: ask({ title: 'Mixed', choices: [{ id: 'give', label: 'Give' }, { id: 5, label: 'Bad id' }, { id: 'x' }, null, 'text'] as never }) },
      { y: g.year, m: ask({ title: 'None', choices: [{ label: 'No id' }] as never }) },
      { y: g.year, m: ask({ title: 'Empty', choices: [] }) },
      { y: g.year, m: ask({ title: 'Not a list', choices: 'give' as never }) },
    ])
    const read = readPending(g)
    expect(read.map((p) => p.m.title)).toEqual(['Mixed'])
    expect(read[0]!.m.choices).toEqual([{ id: 'give', label: 'Give' }])
  })

  it('cuts a 3 MB title and text to their caps', () => {
    const g = life()
    const big = 'x'.repeat(3_000_000)
    g.flags.pendingAsks = J([{ y: g.year, m: ask({ title: big, text: big, personId: big, emoji: big, s: big }) }])
    const m = readPending(g)[0]!.m
    expect(m.title.length).toBeLessThanOrEqual(120)
    expect(m.text.length).toBeLessThanOrEqual(2000)
    expect((m.personId ?? '').length).toBeLessThanOrEqual(40)
    expect((m.emoji ?? '').length).toBeLessThanOrEqual(16)
    expect(m.s).toBeUndefined()
  })

  it('drops an ask that is not a script choice', () => {
    const g = life()
    g.flags.pendingAsks = J([
      { y: g.year, m: ask({ title: 'Old narrator', source: 'ai', scriptId: undefined }) },
      { y: g.year, m: ask({ title: 'No script', scriptId: undefined }) },
      { y: g.year, m: ask({ title: 'Bad script', scriptId: 'Not A Script!' }) },
      { y: g.year, m: { ...ask({ title: 'A notice' }), kind: 'notice' } },
      { y: g.year, m: ask({ title: 'Good' }) },
    ])
    expect(readPending(g).map((p) => p.m.title)).toEqual(['Good'])
  })

  it('drops an ask whose data is too deep, too big or not JSON, and keeps a plain one', () => {
    const g = life()
    let deep: Json = 'leaf'
    for (let i = 0; i < 40; i++) deep = { next: deep }
    g.flags.pendingAsks = J([
      { y: g.year, m: ask({ title: 'Deep', data: deep }) },
      { y: g.year, m: ask({ title: 'Big', data: { text: 'x'.repeat(50_000) } }) },
      { y: g.year, m: ask({ title: 'Wide', data: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${i}`, i])) }) },
      { y: g.year, m: ask({ title: 'NaN', data: { n: Number.NaN } }) },
      { y: g.year, m: ask({ title: 'Plain', data: { eventId: 'kid.snowDay', n: 3, ok: true, list: ['a', 'b'], none: null } }) },
      { y: g.year, m: ask({ title: 'No data', data: undefined }) },
    ])
    const read = readPending(g)
    expect(read.map((p) => p.m.title)).toEqual(['Plain', 'No data'])
    expect(read[0]!.m.data).toEqual({ eventId: 'kid.snowDay', n: 3, ok: true, list: ['a', 'b'], none: null })
    expect('data' in read[1]!.m).toBe(false)
  })

  it('never writes when it reads', () => {
    const g = life()
    g.flags.pendingAsks = J([{ y: g.year, m: ask() }])
    const before = JSON.stringify(g.flags)
    deepFreeze(g.flags)
    expect(() => readPending(g)).not.toThrow()
    expect(JSON.stringify(g.flags)).toBe(before)
  })

  it('writes a repaired list, keeps the newest 6 and removes the key for an empty list', () => {
    const g = life()
    const many: PendingAsk[] = Array.from({ length: 9 }, (_, i) => ({ y: g.year, m: ask({ title: `Ask ${i}` }) }))
    writePending(g, many)
    expect(readPending(g).map((p) => p.m.title)).toEqual(['Ask 3', 'Ask 4', 'Ask 5', 'Ask 6', 'Ask 7', 'Ask 8'])
    expect(JSON.stringify(g.flags.pendingAsks)).toBe(JSON.stringify(readPending(g)))
    writePending(g, [])
    expect('pendingAsks' in g.flags).toBe(false)
    // A list of hostile entries is an empty list.
    writePending(g, [{ y: g.year - 9, m: ask() }, { y: g.year, m: ask({ choices: [] }) }])
    expect('pendingAsks' in g.flags).toBe(false)
  })

  it('does not share its objects with the list it was given', () => {
    const g = life()
    const list: PendingAsk[] = [{ y: g.year, m: ask() }]
    writePending(g, list)
    list[0]!.m.title = 'Changed afterwards'
    list[0]!.m.choices[0]!.label = 'Changed too'
    expect(readPending(g)[0]!.m.title).toBe('A Cousin Asks')
    expect(readPending(g)[0]!.m.choices[0]!.label).toBe('Give $500')
  })
})

// ---------------------------------------------------------------------------
describe('the heir starts without a year book or pending asks', () => {
  it('classifies both keys as personal', () => {
    expect(classifyFlag('yearBook')).toBe('personal')
    expect(classifyFlag('pendingAsks')).toBe('personal')
  })

  it('continueAsChild hands neither to the heir', () => {
    const g = adult(21, 2030, 'us')
    g.character.age = 70
    const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
    writeYearBook(g, { v: 1, last: g.year, shown: 7, cards: [card(g.year)] })
    writePending(g, [{ y: g.year, m: ask() }])
    expect(readYearBook(g).shown).toBe(7)
    killCharacter(g, 'Old Age')
    g.queue = []
    const n = continueAsChild(g, heir.id)
    expect(n).not.toBe(g)
    expect(n.generation).toBe(2)
    expect('yearBook' in n.flags).toBe(false)
    expect('pendingAsks' in n.flags).toBe(false)
    expect(readYearBook(n)).toEqual({ v: 1, last: 0, shown: 0, cards: [] })
    expect(readPending(n)).toEqual([])
  })
})
