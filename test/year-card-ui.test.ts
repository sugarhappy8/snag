// R3-Q6 (E.D3 a): the year card. closeYear (R3-Q4) queues one NoticeModal with `digest` and, after ten popups, keeps
// the card as `inline` in flags.yearBook. This lane reads both as `unknown` (the types arrive with R3-Q1), so every
// reader here is total: hostile input is repaired or refused, never thrown on. The model (yearCardModel.ts) is pure;
// the card and the store's dismissNotice are tested with the real store, the way notice-digest.test.ts does.
import { readFileSync } from 'node:fs'
import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { resetFlags, withFlags } from '../src/game/flags'
import type { ChoiceModal, GameState, ModalItem, NoticeModal } from '../src/game/types'
import { headNoticeRun, mergeable, planHead } from '../src/ui/components/noticeModel'
import {
  CARD_LIMITS,
  GROUP_LABEL,
  GROUP_ORDER,
  cardLabel,
  cardOfModal,
  cardWhen,
  cleanCard,
  enterDismisses,
  groupMore,
  inlineCard,
} from '../src/ui/components/yearCardModel'
import { deepFreeze } from './fuzz-kit'

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

// The popup is called as a plain function in one case below (to read the ref of its button), so effects must not run.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useEffect: () => undefined }
})

const store = await import('../src/ui/store')
const { ModalHost, focusWithoutScroll } = await import('../src/ui/components/ModalHost')
const { YearCardInline, YearCardPopup } = await import('../src/ui/components/YearCard')

const src = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const DASH = /[\u2013\u2014]/
const count = (html: string, needle: string): number => html.split(needle).length - 1

/** A card as closeYear writes it (section 2 of the plan): 8 lines in all, six categories folded. */
function rawCard(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    year: 2031,
    age: 34,
    head: 'You sold the shop and moved to the coast.',
    stories: ['Your daughter started school.', 'The bakery lost $40K.', 'A mild flu kept you in bed.'],
    money: 'Net worth $1.2M (up $90K). Income $64K. Cash $210K.',
    people: ['Your sister got engaged.', 'Dad retired.'],
    world: 'Fuel prices fell for the third year.',
    groups: [
      { k: 'people', n: 3, lines: ['Aunt May sent a card.', 'An old friend called.', 'The neighbors moved.'] },
      { k: 'body', n: 1, lines: ['Your cholesterol is fine.'] },
      { k: 'work', n: 2, lines: ['A raise came through.', 'The team shipped a release.'] },
      { k: 'companies', n: 9, lines: ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'] },
      { k: 'money', n: 4, lines: ['The index rose.', 'Rent went up.'] },
      { k: 'life', n: 2, lines: ['A quiet spring.'] },
    ],
    ...extra,
  }
}

function N(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id, title: `Title ${id}`, text: `Text of ${id}.`, ...extra }
}

/** The popup form: a notice carrying the card. `digest` is typed by R3-Q1, so the cast keeps this file independent of it. */
function cardNotice(id: string, card: unknown = rawCard(), extra: Partial<NoticeModal> = {}): NoticeModal {
  return { ...N(id, { title: 'Your year', text: 'You sold the shop and moved to the coast.', emoji: '📋', ...extra }), digest: card } as unknown as NoticeModal
}

function C(id: string): ChoiceModal {
  return { kind: 'choice', id, title: `Pick ${id}`, text: 'Which one?', choices: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }], source: 'script', scriptId: 'none' }
}

function game(): GameState {
  return store.getApp().game as GameState
}

function setQueue(items: ModalItem[]): void {
  store.act((g) => {
    g.queue = items
  })
}

// Any life will do: nothing below reads what the seed makes, only the queue and the flags it is given.
const LIFE = [3, 2026] as const

beforeEach(() => {
  store.startNewLife({ seed: LIFE[0], year: LIFE[1] })
  setQueue([])
})

afterEach(() => {
  resetFlags()
})

describe('cleanCard', () => {
  it('reads a full card into the view and keeps every field', () => {
    const v = cleanCard(rawCard())
    expect(v).not.toBeNull()
    expect(v!.year).toBe(2031)
    expect(v!.age).toBe(34)
    expect(v!.head).toBe('You sold the shop and moved to the coast.')
    expect(v!.stories).toEqual(['Your daughter started school.', 'The bakery lost $40K.', 'A mild flu kept you in bed.'])
    expect(v!.money).toBe('Net worth $1.2M (up $90K). Income $64K. Cash $210K.')
    expect(v!.people).toEqual(['Your sister got engaged.', 'Dad retired.'])
    expect(v!.world).toBe('Fuel prices fell for the third year.')
    expect(v!.inline).toBe(false)
    expect(v!.lineCount).toBe(8)
    expect(v!.groups.map((g) => [g.k, g.label, g.n])).toEqual([
      ['people', 'People', 3],
      ['body', 'Health', 1],
      ['work', 'Work', 2],
      ['companies', 'Your companies', 9],
      ['money', 'Money', 4],
      ['life', 'Everyday', 2],
    ])
    expect(v!.groups[3].lines).toHaveLength(6)
  })

  it('a card without the optional parts is a headline and nothing else', () => {
    const v = cleanCard({ v: 1, year: 2040, age: 43, head: 'A quiet year.', stories: [], groups: [] })
    expect(v).toEqual({ year: 2040, age: 43, head: 'A quiet year.', stories: [], money: '', people: [], world: '', groups: [], inline: false, lineCount: 1 })
  })

  it('inline is true only for the boolean true', () => {
    expect(cleanCard(rawCard({ inline: true }))!.inline).toBe(true)
    for (const bad of [1, 'true', {}, [], null, false]) expect(cleanCard(rawCard({ inline: bad }))!.inline).toBe(false)
  })

  it('refuses what cannot be a card: not an object, a wrong version, no headline, no year or age', () => {
    for (const raw of [null, undefined, 0, 'card', true, [], [rawCard()], () => rawCard()]) expect(cleanCard(raw), String(raw)).toBeNull()
    for (const v of [0, 2, '1', null, undefined]) expect(cleanCard(rawCard({ v })), `v ${String(v)}`).toBeNull()
    for (const head of ['', '   ', 7, null, undefined, {}, ['x']]) expect(cleanCard(rawCard({ head })), `head ${String(head)}`).toBeNull()
    for (const year of [NaN, Infinity, 1.5, '2031', null, 999, 100001, undefined]) expect(cleanCard(rawCard({ year })), `year ${String(year)}`).toBeNull()
    for (const age of [NaN, -1, 1.5, '34', null, 10001, undefined]) expect(cleanCard(rawCard({ age })), `age ${String(age)}`).toBeNull()
  })

  it('cuts every string to 90 characters and collapses white space', () => {
    const long = 'word '.repeat(60)
    const v = cleanCard(
      rawCard({ head: long, stories: [long], money: long, people: [long], world: long, groups: [{ k: 'life', n: 1, lines: [long] }] }),
    )!
    for (const s of [v.head, ...v.stories, v.money, ...v.people, v.world, ...v.groups[0].lines]) {
      expect(s.length).toBeLessThanOrEqual(CARD_LIMITS.text)
      expect(s.length).toBeGreaterThan(80)
      expect(s).not.toMatch(/\s\s/)
    }
    expect(cleanCard(rawCard({ head: '  a\n\tb   c  ' }))!.head).toBe('a b c')
  })

  it('never cuts between the two halves of an emoji', () => {
    const v = cleanCard(rawCard({ head: `${'a'.repeat(89)}😀 tail` }))!
    expect(v.head).toBe('a'.repeat(89))
    expect(v.head.length).toBe(89)
  })

  it('bounds the lists: 3 stories, 3 people, 6 lines a group, and drops what is not a string', () => {
    const v = cleanCard(
      rawCard({
        stories: ['a', 'b', 7, null, '', '  ', 'c', 'd', 'e'],
        people: [{}, 'p1', 'p2', 'p3', 'p4'],
        groups: [{ k: 'law', n: 50, lines: ['1', '2', '3', '4', '5', '6', '7', '8', 9, null] }],
      }),
    )!
    expect(v.stories).toEqual(['a', 'b', 'c'])
    expect(v.people).toEqual(['p1', 'p2']) // the budget of 8 lines leaves room for 2 people beside the head, 3 stories, money and world
    expect(v.groups[0].lines).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(v.groups[0].n).toBe(50)
    expect(cleanCard(rawCard({ stories: 'not a list', people: 5, groups: 'x' }))!.stories).toEqual([])
  })

  it('the head, stories, money, people and world are at most 8 lines: people go first, then stories', () => {
    const v = cleanCard(rawCard({ people: ['p1', 'p2', 'p3'] }))!
    expect(v.lineCount).toBe(8)
    expect(v.people).toEqual(['p1', 'p2'])
    expect(v.stories).toHaveLength(3)
    const w = cleanCard(rawCard({ people: ['p1', 'p2', 'p3'], money: '', world: '' }))!
    expect(w.lineCount).toBe(7)
    expect(w.people).toEqual(['p1', 'p2', 'p3'])
    // Nothing but stories and a 3-line world and money: 1 + 3 + 1 + 1 = 6, no trimming.
    expect(cleanCard(rawCard({ people: [] }))!.lineCount).toBe(6)
  })

  it('100 groups are cut to the 8 known ones, each once, in display order; unknown kinds and empty groups are dropped', () => {
    const many: unknown[] = []
    for (let i = 0; i < 100; i++) many.push({ k: i % 2 ? 'life' : `weird${i}`, n: 2, lines: ['x'] })
    many.unshift({ k: 'world', n: 1, lines: ['w'] }, { k: 'people', n: 1, lines: ['p'] }, { k: 'companies', n: 0, lines: [] }, { k: 'people', n: 4, lines: ['dup'] })
    for (const k of GROUP_ORDER) many.push({ k, n: 1, lines: ['z'] })
    const v = cleanCard(rawCard({ groups: many }))!
    expect(v.groups.length).toBeLessThanOrEqual(8)
    const keys = v.groups.map((g) => g.k)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(GROUP_ORDER.filter((k) => keys.includes(k)))
    expect(v.groups.find((g) => g.k === 'people')!.lines).toEqual(['p'])
    expect(keys).not.toContain('weird0')
    // The same cap holds when the junk comes first and the real groups sit past the scan window.
    const junk = Array.from({ length: 10_000 }, (_, i) => ({ k: `junk${i}`, n: 1, lines: ['x'] }))
    expect(cleanCard(rawCard({ groups: junk }))!.groups).toEqual([])
  })

  it('repairs a bad count: the count is a whole number and never below the lines it shows', () => {
    const v = cleanCard(
      rawCard({
        groups: [
          { k: 'people', n: 'many', lines: ['a', 'b'] },
          { k: 'body', n: -3, lines: ['a'] },
          { k: 'work', n: 1.5, lines: ['a', 'b', 'c'] },
          { k: 'money', n: 1, lines: ['a', 'b', 'c'] },
          { k: 'law', n: 1e12, lines: ['a'] },
          { k: 'life', n: 4, lines: [] },
        ],
      }),
    )!
    // people, body, work, money, law, life: a bad count is the number of lines, a small one is lifted to it
    expect(v.groups.map((g) => g.n)).toEqual([2, 1, 3, 3, 1, 4])
    for (const g of v.groups) {
      expect(Number.isInteger(g.n)).toBe(true)
      expect(g.n).toBeGreaterThanOrEqual(g.lines.length)
    }
  })

  it('survives hostile shapes without throwing, and does not write what it reads', () => {
    const hostile = [
      rawCard({ groups: [null, 5, 'x', [], { k: 7 }, { k: 'people', lines: {} }] }),
      rawCard({ stories: new Array(100_000).fill('x') }),
      rawCard({ head: 'x'.repeat(3_000_000) }),
      { v: 1, year: 2031, age: 34, head: 'h', get stories() { return ['ok'] } },
      Object.create({ v: 1, year: 2031, age: 34, head: 'inherited' }),
    ]
    for (const raw of hostile) {
      expect(() => cleanCard(raw)).not.toThrow()
    }
    const frozen = deepFreeze(rawCard())
    const before = JSON.stringify(frozen)
    expect(() => cleanCard(frozen)).not.toThrow()
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('is pure: the same input gives equal output, and a view is a new object', () => {
    const raw = rawCard()
    expect(cleanCard(raw)).toEqual(cleanCard(raw))
    expect(cleanCard(raw)).not.toBe(cleanCard(raw))
  })
})

describe('labels', () => {
  it('names every group once, in the display order of the plan', () => {
    expect([...GROUP_ORDER]).toEqual(['people', 'body', 'work', 'companies', 'money', 'law', 'world', 'life'])
    expect(GROUP_LABEL).toEqual({
      people: 'People',
      body: 'Health',
      work: 'Work',
      companies: 'Your companies',
      money: 'Money',
      law: 'Law and order',
      world: 'The world',
      life: 'Everyday',
    })
  })

  it('every label, the aria text and the helper words pass the voice rules and carry no dash', () => {
    const v = cleanCard(rawCard())!
    const words = [...Object.values(GROUP_LABEL), cardLabel(v), cardWhen(v), 'OK', 'and 3 more']
    for (const w of words) {
      expect(unitFlags(w, 'tooltip'), w).toEqual([])
      expect(w).not.toMatch(DASH)
    }
    expect(cardLabel(v)).toBe('Your year, age 34')
    expect(cardWhen(v)).toBe('Age 34, 2031')
  })

  it('groupMore is what the card cannot list', () => {
    const v = cleanCard(rawCard())!
    expect(v.groups.map(groupMore)).toEqual([0, 0, 0, 3, 2, 1])
  })
})

describe('cardOfModal and inlineCard', () => {
  it('cardOfModal reads the digest of a notice, and nothing from anything else', () => {
    expect(cardOfModal(cardNotice('y'))!.head).toBe('You sold the shop and moved to the coast.')
    expect(cardOfModal(N('plain'))).toBeNull()
    expect(cardOfModal(C('c'))).toBeNull()
    expect(cardOfModal(cardNotice('bad', 'not a card'))).toBeNull()
    expect(cardOfModal(cardNotice('bad', { v: 2 }))).toBeNull()
    for (const m of [null, undefined, 3, 'x', [], {}]) expect(cardOfModal(m)).toBeNull()
  })

  it('inlineCard finds the newest inline card of the year in the year book', () => {
    const book = {
      v: 1,
      last: 2032,
      shown: 10,
      cards: [rawCard({ year: 2030, inline: true, head: 'Older' }), rawCard({ year: 2031, inline: true, head: 'Eleventh' }), rawCard({ year: 2032, head: 'A popup one' })],
    }
    expect(inlineCard(book, 2031)!.head).toBe('Eleventh')
    expect(inlineCard(book, 2031)!.inline).toBe(true)
    expect(inlineCard(book, 2030)!.head).toBe('Older')
    // A card that was a popup is not drawn inline, and a year with no card has none.
    expect(inlineCard(book, 2032)).toBeNull()
    expect(inlineCard(book, 2040)).toBeNull()
    expect(inlineCard(book, 2029)).toBeNull()
  })

  it('inlineCard also reads the record that holds the book, the way the plan words it', () => {
    const book = { cards: [rawCard({ inline: true, head: 'held' })] }
    expect(inlineCard({ yearBook: book }, 2031)!.head).toBe('held')
    expect(inlineCard({ yearBook: book, other: 1 }, 2030)).toBeNull()
  })

  it('inlineCard: the later of two cards for one year wins', () => {
    const book = { cards: [rawCard({ inline: true, head: 'first' }), rawCard({ inline: true, head: 'second' })] }
    expect(inlineCard(book, 2031)!.head).toBe('second')
  })

  it('inlineCard is total: hostile input gives null, and a huge card list is only scanned at its end', () => {
    for (const book of [null, undefined, 4, 'x', [], {}, { cards: null }, { cards: 5 }, { cards: 'x' }, { cards: [null, 3, {}] }, { yearBook: null }, { yearBook: 5 }, { yearBook: { cards: 'x' } }]) {
      expect(inlineCard(book, 2031), JSON.stringify(book)).toBeNull()
    }
    for (const year of [NaN, Infinity, -1, 0]) expect(inlineCard({ cards: [rawCard({ inline: true })] }, year)).toBeNull()
    const junk = Array.from({ length: 10_000 }, () => ({ nope: true }))
    const hit = inlineCard({ cards: [...junk, rawCard({ inline: true, head: 'last one' })] }, 2031)
    expect(hit!.head).toBe('last one')
    // The card at the front of 10,000 is out of reach by design: the book keeps the newest 3.
    expect(inlineCard({ cards: [rawCard({ inline: true }), ...junk] }, 2031)).toBeNull()
  })

  it('inlineCard does not read the future: only the card of the year asked for', () => {
    const book = { cards: [rawCard({ year: 2035, inline: true, head: 'from the future' })] }
    expect(inlineCard(book, 2031)).toBeNull()
  })
})

describe('the queue: a card is never part of a digest', () => {
  it('mergeable is false for a notice with a digest, even a broken one', () => {
    expect(mergeable(cardNotice('y'))).toBe(false)
    expect(mergeable(cardNotice('y', 'garbage'))).toBe(false)
    expect(mergeable(cardNotice('y', {}))).toBe(false)
    expect(mergeable(N('a'))).toBe(true)
  })

  it('headNoticeRun stops at the card: it is last in a run, and ahead of a run it leaves none', () => {
    const queue: ModalItem[] = [N('a'), N('b'), cardNotice('y'), N('c'), N('d')]
    expect(headNoticeRun(queue).map((m) => m.id)).toEqual(['a', 'b'])
    expect(headNoticeRun(queue.slice(2))).toEqual([])
    expect(headNoticeRun([N('a'), cardNotice('y')])).toEqual([])
  })

  it('planHead gives yearCard for a valid card at the head, whether or not the digest is on', () => {
    const card = cardNotice('y')
    for (const on of [true, false]) {
      expect(planHead([card], on)).toEqual({ kind: 'yearCard', modal: card })
      expect(planHead([card, N('a'), N('b')], on)).toEqual({ kind: 'yearCard', modal: card })
    }
  })

  it('a card that cannot be read is an ordinary single notice (its text is the headline)', () => {
    const broken = cardNotice('y', { v: 9 })
    expect(planHead([broken], true)).toEqual({ kind: 'single', modal: broken })
    expect(planHead([broken, N('a'), N('b')], true)).toEqual({ kind: 'single', modal: broken })
  })

  it('a digest ahead of the card is drawn first, then the card is the head', () => {
    const card = cardNotice('y')
    const queue: ModalItem[] = [N('a'), N('b'), card]
    const first = planHead(queue, true)
    expect(first.kind).toBe('digest')
    expect(planHead(queue.slice(2), true)).toEqual({ kind: 'yearCard', modal: card })
    // With the digest off, the two notices are single cards and the year card still waits at the end.
    expect(planHead(queue, false).kind).toBe('single')
    expect(planHead(queue.slice(2), false).kind).toBe('yearCard')
  })

  it('planning and reading survive a deep freeze and write nothing', () => {
    const queue: ModalItem[] = [cardNotice('y'), N('a'), C('c')]
    const before = JSON.stringify(queue)
    deepFreeze(queue)
    expect(() => {
      planHead(queue, true)
      planHead(queue, false)
      headNoticeRun(queue)
      cardOfModal(queue[0])
      mergeable(queue[0])
    }).not.toThrow()
    expect(JSON.stringify(queue)).toBe(before)
  })
})

describe('YearCardPopup', () => {
  const render = (modal: NoticeModal = cardNotice('y')): string => renderToStaticMarkup(createElement(YearCardPopup, { modal }))

  it('draws the headline, three stories, the money line, the people and the world line', () => {
    const html = render()
    expect(html).toContain('<h2 class="popup-title">You sold the shop and moved to the coast.</h2>')
    for (const s of ['Your daughter started school.', 'The bakery lost $40K.', 'A mild flu kept you in bed.']) expect(html).toContain(s)
    expect(html).toContain('Net worth $1.2M (up $90K). Income $64K. Cash $210K.')
    expect(html).toContain('Your sister got engaged.')
    expect(html).toContain('Dad retired.')
    expect(html).toContain('Fuel prices fell for the third year.')
    expect(html).toContain('Age 34, 2031')
    expect(count(html, '<li class="year-card-line')).toBe(7)
  })

  it('puts the headline first and the groups after the lines', () => {
    const html = render()
    expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('year-card-lines'))
    expect(html.indexOf('year-card-lines')).toBeLessThan(html.indexOf('year-card-groups'))
    expect(html.indexOf('year-card-groups')).toBeLessThan(html.indexOf('>OK</button>'))
    expect(html.indexOf('Dad retired.')).toBeLessThan(html.indexOf('Fuel prices fell'))
  })

  it('draws a closed group with its count for each category, and none for an empty one', () => {
    const html = render()
    expect(count(html, '<details')).toBe(6)
    expect(html).not.toContain('<details open')
    expect(html).not.toMatch(/<details[^>]* open/)
    expect(html).toMatch(/<summary[^>]*><span class="year-card-label">People<\/span> <span class="year-card-count">3<\/span><\/summary>/)
    expect(html).toMatch(/<summary[^>]*><span class="year-card-label">Your companies<\/span> <span class="year-card-count">9<\/span><\/summary>/)
    expect(html).toContain('Aunt May sent a card.')
    // A group of 9 with 6 lines says what is not listed.
    expect(html).toContain('and 3 more')
    expect(count(html, 'and 3 more')).toBe(1)

    const none = render(cardNotice('y', rawCard({ groups: [{ k: 'people', n: 0, lines: [] }, { k: 'law', n: 2, lines: ['A ticket.', 'A warning.'] }] })))
    expect(count(none, '<details')).toBe(1)
    expect(none).toContain('Law and order')
    expect(none).not.toContain('>People<')
    expect(count(render(cardNotice('y', rawCard({ groups: [] }))), '<details')).toBe(0)
    expect(render(cardNotice('y', rawCard({ groups: [] })))).not.toContain('year-card-groups')
  })

  it('has exactly one button, the OK, and it is a primary full-width one', () => {
    const html = render()
    expect(count(html, '<button')).toBe(1)
    expect(count(html, '>OK</button>')).toBe(1)
    expect(html).toContain('btn btn-primary btn-block')
  })

  it('is a labelled dialog and uses the emoji of the notice', () => {
    const html = render()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Your year, age 34"')
    expect(html).toContain('<span class="popup-emoji" aria-hidden="true">📋</span>')
    expect(render(cardNotice('y', rawCard(), { emoji: '🎂' }))).toContain('🎂')
    // An emoji that is not a short string is not trusted.
    expect(render(cardNotice('y', rawCard(), { emoji: 'x'.repeat(50) }))).not.toContain('xxxxx')
  })

  it('each line has its glyph hidden from a screen reader', () => {
    const html = render()
    expect(html).toContain('<span class="year-card-glyph" aria-hidden="true">💰</span>')
    expect(html).toContain('<span class="year-card-glyph" aria-hidden="true">🌍</span>')
  })

  it('escapes hostile text, and cuts what is too long', () => {
    const html = render(cardNotice('y', rawCard({ head: '<img src=x onerror=alert(1)>', stories: ['<script>alert(1)</script>'], groups: [{ k: 'life', n: 1, lines: ['<b>bold</b>'] }] })))
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    const long = render(cardNotice('y', rawCard({ head: 'x'.repeat(5000) })))
    expect(long.length).toBeLessThan(20_000)
  })

  it('renders nothing for a card it cannot read (the host never mounts it that way)', () => {
    expect(render(cardNotice('y', { v: 5 }))).toBe('')
    expect(render(N('plain'))).toBe('')
  })

  it('the markup has no dash and every visible word passes the voice rules', () => {
    const html = render()
    expect(html).not.toMatch(DASH)
    const words = [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter(Boolean)
    expect(words.length).toBeGreaterThan(10)
    for (const w of ['OK', 'People', 'Your companies', 'and 3 more', 'Age 34, 2031']) expect(words).toContain(w)
  })
})

describe('YearCardInline', () => {
  const view = cleanCard(rawCard({ inline: true }))!
  const render = (card: typeof view | null = view): string => renderToStaticMarkup(createElement(YearCardInline, { card }))

  it('draws the same card with no OK and no popup frame', () => {
    const html = render()
    expect(html).toContain('You sold the shop and moved to the coast.')
    expect(html).toContain('Net worth $1.2M')
    expect(html).toContain('Fuel prices fell for the third year.')
    expect(count(html, '<details')).toBe(6)
    expect(html).not.toContain('<button')
    expect(html).not.toContain('>OK<')
    expect(html).not.toContain('popup')
    expect(html).not.toContain('role="dialog"')
  })

  it('is a labelled region, with the headline as its heading', () => {
    const html = render()
    expect(html).toMatch(/^<section class="year-card is-inline" aria-label="Your year, age 34">/)
    expect(html).toContain('<h3 class="year-card-head">You sold the shop and moved to the coast.</h3>')
  })

  it('draws nothing without a card', () => {
    expect(render(null)).toBe('')
  })
})

describe('ModalHost and the store', () => {
  const host = (): string => renderToStaticMarkup(createElement(ModalHost))

  it('draws the year card for a card at the head, with the digest on or off', () => {
    for (const on of [true, false]) {
      withFlags({ noticeDigest: on }, () => {
        setQueue([cardNotice('y'), N('a'), N('b')])
        const html = host()
        expect(html).toContain('year-card')
        expect(html).toContain('You sold the shop and moved to the coast.')
        expect(html).not.toContain('digest-list')
        expect(html).not.toContain('Title a')
      })
    }
  })

  it('draws the digest of the two notices before it, and the card after they are gone', () => {
    withFlags({ noticeDigest: true }, () => {
      const card = cardNotice('y')
      setQueue([N('a', { title: 'Alpha' }), N('b', { title: 'Beta' }), card])
      expect(host()).toContain('2 updates')
      expect(host()).not.toContain('year-card')
      store.dismissNotices(['a', 'b'])
      expect(host()).toContain('year-card')
    })
  })

  it('a card that cannot be read is drawn as a plain notice with its title and text', () => {
    withFlags({ noticeDigest: true }, () => {
      setQueue([cardNotice('y', { v: 9 })])
      const html = host()
      expect(html).toContain('Your year')
      expect(html).toContain('You sold the shop and moved to the coast.')
      expect(html).not.toContain('year-card')
    })
  })

  it('dismissNotice clears the card and leaves what is behind it', () => {
    setQueue([cardNotice('y'), C('c')])
    store.dismissNotice('y')
    expect(game().queue.map((m) => m.id)).toEqual(['c'])
  })

  it('rendering the host with a card does not write the queue', () => {
    setQueue([cardNotice('y'), C('c')])
    const queue = game().queue
    const before = JSON.stringify(queue)
    deepFreeze(queue)
    expect(() => host()).not.toThrow()
    expect(JSON.stringify(game().queue)).toBe(before)
    expect(game().queue).toBe(queue)
  })
})

describe('Enter and the group rows', () => {
  it('Enter dismisses the card, except while a control that uses Enter has focus', () => {
    expect(enterDismisses('Enter', false, '')).toBe(true)
    expect(enterDismisses('Enter', false, 'BODY')).toBe(true)
    expect(enterDismisses('Enter', false, 'DIV')).toBe(true)
    // A summary row opens and closes its group on Enter: that is the control's job, not a dismissal.
    expect(enterDismisses('Enter', false, 'SUMMARY')).toBe(false)
    expect(enterDismisses('Enter', false, 'BUTTON')).toBe(false)
    expect(enterDismisses('Enter', false, 'INPUT')).toBe(false)
    expect(enterDismisses('Enter', false, 'TEXTAREA')).toBe(false)
    expect(enterDismisses('Enter', false, 'SELECT')).toBe(false)
    expect(enterDismisses('Enter', true, '')).toBe(false)
    expect(enterDismisses('a', false, '')).toBe(false)
    expect(enterDismisses(' ', false, '')).toBe(false)
  })

  it('the rows are native details and summary, so the keyboard works with no script', () => {
    const html = renderToStaticMarkup(createElement(YearCardPopup, { modal: cardNotice('y') }))
    expect(count(html, '<summary')).toBe(6)
    expect(count(html, '</details>')).toBe(6)
    expect(html).not.toContain('onclick')
  })
})

type Props = Record<string, unknown>

/** Every element in a tree of React elements whose type is the given tag. */
function findAll(node: ReactNode, tag: string, out: Props[] = []): Props[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ReactNode, tag, out)
  } else if (isValidElement(node)) {
    const props = node.props as Props
    if (node.type === tag) out.push(props)
    findAll(props.children as ReactNode, tag, out)
  }
  return out
}

describe('the OK button', () => {
  it('is focused through the shared focusWithoutScroll, once, and not through autoFocus', () => {
    const buttons = findAll(YearCardPopup({ modal: cardNotice('y') }), 'button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].ref).toBe(focusWithoutScroll)
    expect(buttons[0]).not.toHaveProperty('autoFocus')
    expect(buttons[0].children).toBe('OK')
  })
})

describe('the wiring and the stylesheet', () => {
  it('ModalHost draws the card before the digest, from planHead', () => {
    const host = src('src/ui/components/ModalHost.tsx')
    expect(host).toContain("plan?.kind === 'yearCard'")
    expect(host.indexOf("plan?.kind === 'yearCard'")).toBeLessThan(host.indexOf("plan?.kind === 'digest'"))
    expect(host).toContain('YearCardPopup')
  })

  it('the Life screen draws the inline card of this year just above the log', () => {
    const screen = src('src/ui/screens/GameScreen.tsx')
    expect(screen).toContain('<YearCardInline card={inlineCard(g.flags.yearBook, g.year)} />')
    expect(screen.indexOf('<YearCardInline')).toBeLessThan(screen.indexOf('<LifeLog'))
  })

  it('the popup opens at its heading: the OK takes focus without scrolling', () => {
    expect(src('src/ui/components/YearCard.tsx')).toContain('ref={focusWithoutScroll}')
  })

  it('the stylesheet uses tokens and no raw colours for the card, and keeps every row 44px tall', () => {
    const css = src('src/ui/styles/notices.css')
    const at = css.indexOf('/* Year card (R3-Q6)')
    expect(at).toBeGreaterThan(-1)
    // Up to the next block comment (the life log fold), so the other blocks' rules are not judged here.
    const block = css.slice(at, css.indexOf('/* Life log fold', at))
    expect(block).toContain('.year-card-group')
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/\brgba?\(/)
    expect(block).toContain('var(--hairline)')
    expect(block).toMatch(/\.year-card-group > summary \{[^}]*min-height: var\(--target\)/)
  })

  it('the new source files have no em-dash or en-dash', () => {
    for (const f of ['src/ui/components/yearCardModel.ts', 'src/ui/components/YearCard.tsx']) expect(src(f), f).not.toMatch(DASH)
    expect(src('src/ui/styles/notices.css')).not.toMatch(DASH)
  })

  it('the model is a leaf: it imports nothing', () => {
    expect(src('src/ui/components/yearCardModel.ts')).not.toMatch(/^\s*import\s/m)
  })
})
