// R3-Q1 (E.D1): the amount `a` and the weight `w` of a log line or popup, and the repair of a damaged save. A caller may add them
// (log's fifth argument, notice's options); a title in the weight table carries its weight; a value that is not what the game writes
// is dropped, and a key that is not set is not written.
import { describe, expect, it } from 'vitest'
import { addMoney, currentLogYear, log, notice } from '../src/game/core'
import { res, v } from '../src/game/events/helpers'
import { createNewLife } from '../src/game/life'
import { MINOR_NOTICE_TITLES, NOTICE_WEIGHTS, noticeWeightFor, noticeWeightOf } from '../src/game/notice-weights'
import { migrateLegacyAi, migrateSave } from '../src/game/save-schema'
import type { GameState, LogEntry, ModalItem, NoticeModal } from '../src/game/types'
import { findSeed } from './seed-kit'

function life(): GameState {
  const g = createNewLife({ seed: findSeed(() => true, { label: 'any life' }), year: 2000 })
  g.queue = []
  return g
}

function lastLine(g: GameState): LogEntry {
  const entries = currentLogYear(g).entries
  return entries[entries.length - 1]!
}

function lastPopup(g: GameState): NoticeModal {
  return g.queue[g.queue.length - 1] as NoticeModal
}

/** A value of the wrong type, as a damaged save could hold it. */
const wrong = (v: unknown) => v as never

describe('log: amount and weight', () => {
  it('stores a rounded to a whole number and the weight', () => {
    const g = life()
    log(g, 'x', 'neutral', undefined, { a: 1234.6, w: 1 })
    expect(lastLine(g).a).toBe(1235)
    expect(lastLine(g).w).toBe(1)
  })

  it('keeps a negative amount, zero, the bound, and turns -0 into 0', () => {
    const g = life()
    const cases: [number, number][] = [[-250.4, -250], [0, 0], [-0.4, 0], [1e15, 1e15], [-1e15, -1e15], [1e15 + 0.4, 1e15]]
    for (const [given, stored] of cases) {
      log(g, `a ${given}`, 'neutral', undefined, { a: given })
      expect(Object.is(lastLine(g).a, stored), `${given} stores ${stored}`).toBe(true)
    }
  })

  it('drops an amount that is not a finite number within 1e15', () => {
    const g = life()
    for (const a of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e16, -1e16, wrong('2'), wrong(null), wrong({}), wrong(true)]) {
      log(g, 'bad amount', 'neutral', undefined, { a })
      expect('a' in lastLine(g), String(a)).toBe(false)
    }
  })

  it('keeps the weights 0, 1, 2 and 3 and drops everything else', () => {
    const g = life()
    for (const w of [0, 1, 2, 3] as const) {
      log(g, `w ${w}`, 'neutral', undefined, { w })
      expect(lastLine(g).w).toBe(w)
    }
    for (const w of [wrong(7), wrong(-1), wrong('2'), wrong(1.5), wrong(Number.NaN), wrong(null), undefined]) {
      log(g, 'bad weight', 'neutral', undefined, { w })
      expect('w' in lastLine(g), String(w)).toBe(false)
    }
  })

  it('writes no key when nothing is set, so the saved line is what it always was', () => {
    const g = life()
    log(g, 'plain')
    log(g, 'empty options', 'good', undefined, {})
    for (const e of currentLogYear(g).entries.slice(-2)) {
      expect(Object.keys(e).sort()).toEqual(['id', 'text', 'tone'])
    }
  })

  it('still skips an empty line and still takes a given id', () => {
    const g = life()
    const before = currentLogYear(g).entries.length
    log(g, '   ', 'neutral', undefined, { a: 5, w: 1 })
    expect(currentLogYear(g).entries).toHaveLength(before)
    log(g, 'with id', 'neutral', 'my-id', { w: 2 })
    expect(lastLine(g).id).toBe('my-id')
  })
})

describe('notice: amount, weight and the title table', () => {
  it('stamps the amount and the weight the caller gives', () => {
    const g = life()
    notice(g, 'Some Title', 'x', { a: 1234.6, w: 3 })
    expect(lastPopup(g).a).toBe(1235)
    expect(lastPopup(g).w).toBe(3)
  })

  it('stamps the weight of a title in the table, and the caller wins over it', () => {
    const g = life()
    notice(g, 'Report Card', 'x')
    expect(lastPopup(g).w).toBe(1)
    expect(lastPopup(g).weight).toBe('minor')
    notice(g, 'Report Card', 'x', { w: 3 })
    expect(lastPopup(g).w).toBe(3)
    expect(lastPopup(g).weight).toBe('minor')
  })

  it('falls back to the table for a weight that is not 0 to 3, and writes none for a title the table does not know', () => {
    const g = life()
    notice(g, 'Report Card', 'x', { w: wrong(9) })
    expect(lastPopup(g).w).toBe(1)
    notice(g, 'Not In The Table', 'x', { w: wrong(9), a: Number.NaN })
    expect('w' in lastPopup(g)).toBe(false)
    expect('a' in lastPopup(g)).toBe(false)
  })

  it('writes no new key for a title the table does not know and no options: the popup is saved as before', () => {
    const g = life()
    notice(g, 'Not In The Table', 'x', { emoji: '\u{1F600}', tone: 'good' })
    const keys = Object.keys(lastPopup(g)).sort()
    expect(keys).toEqual(['emoji', 'id', 'kind', 'text', 'title', 'tone'])
  })

  it('leaves weight minor exactly as it was for the ten routine titles, and an explicit minor for any other title', () => {
    const g = life()
    expect(MINOR_NOTICE_TITLES.size).toBe(10)
    for (const title of MINOR_NOTICE_TITLES) {
      notice(g, title, 'x')
      expect(lastPopup(g).weight, title).toBe('minor')
      expect(noticeWeightFor(title)).toBe('minor')
    }
    notice(g, 'Not In The Table', 'x', { weight: 'minor' })
    expect(lastPopup(g).weight).toBe('minor')
    expect('w' in lastPopup(g)).toBe(false)
    expect(noticeWeightFor('Not In The Table')).toBeUndefined()
  })
})

describe('noticeWeightOf', () => {
  it('weighs every routine title 1 (the planner reads weight minor as 1 as well)', () => {
    for (const title of MINOR_NOTICE_TITLES) expect(NOTICE_WEIGHTS[title], title).toBe(1)
    expect(noticeWeightOf('Report Card')).toBe(1)
  })

  it('does not know a title that is not in the table, nor a property name of Object', () => {
    for (const title of ['not a title', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(noticeWeightOf(title), title).toBeUndefined()
    }
  })
})

describe('res: the amount and the weight of an event outcome', () => {
  it('puts the money an outcome moves on the popup and the line', () => {
    const g = life()
    res(g, null, { t: 'A Windfall', x: 'You found money.', l: 'I found money.', tone: 'good', fx: { money: 500 } })
    expect(lastPopup(g).a).toBe(500)
    expect(lastLine(g).a).toBe(500)
    expect('w' in lastPopup(g)).toBe(false)
    expect('w' in lastLine(g)).toBe(false)
  })

  it('counts a loss as applyFx books it: it stops at the cash on hand', () => {
    const g = life()
    addMoney(g, 300, 'luck')
    const cash = g.character.money
    expect(cash).toBeGreaterThan(0)
    res(g, null, { t: 'A Loss', x: 'You lost money.', l: 'I lost money.', tone: 'bad', fx: { money: -(cash + 5000) } })
    expect(lastPopup(g).a).toBe(Math.round(cash))
    expect(lastLine(g).a).toBe(Math.round(cash))
    expect(g.character.money).toBe(0)
  })

  it('writes no amount for an outcome that moves no money, and the weight of a tabled title on the line', () => {
    const g = life()
    res(g, null, { t: 'Report Card', x: 'Grades are in.', l: 'I got my grades.' })
    expect('a' in lastPopup(g)).toBe(false)
    expect(lastPopup(g).w).toBe(1)
    expect('a' in lastLine(g)).toBe(false)
    expect(lastLine(g).w).toBe(1)
    res(g, null, { t: 'Plain Outcome', x: 'Nothing moved.', l: 'Nothing moved.', fx: { happiness: 2 } })
    expect(Object.keys(lastLine(g)).sort()).toEqual(['id', 'text', 'tone'])
    expect(Object.keys(lastPopup(g)).sort()).toEqual(['emoji', 'id', 'kind', 'text', 'title', 'tone'])
  })

  it('draws nothing more than before: the title, the text and the line are picked in the same order', () => {
    const titles = ['One', 'Two', 'Three']
    const texts = ['Alpha.', 'Beta.', 'Gamma.']
    const lines = ['L one.', 'L two.', 'L three.']
    const a = life()
    const b = life()
    res(a, null, { t: titles, x: texts, l: lines, fx: { money: 40 } })
    // The same picks by hand, in the order res() has always made them.
    notice(b, v(b, titles), v(b, texts), { tone: 'neutral' })
    log(b, v(b, lines), 'neutral')
    addMoney(b, 40, 'luck')
    expect(a.rng).toBe(b.rng)
    expect(a.nextId).toBe(b.nextId)
    expect(lastPopup(a).title).toBe(lastPopup(b).title)
    expect(lastPopup(a).text).toBe(lastPopup(b).text)
    expect(lastLine(a).text).toBe(lastLine(b).text)
    expect(a.character.money).toBe(b.character.money)
  })
})

describe('repairing a damaged save', () => {
  const notices = (items: Record<string, unknown>[]): ModalItem[] =>
    items.map((extra, i) => ({ kind: 'notice', id: `n${i}`, title: `T${i}`, text: 'x', ...extra })) as unknown as ModalItem[]

  it('drops a bad s, a, w and digest from a queued popup and keeps the popup', () => {
    const g = life()
    const hostile: Record<string, unknown>[] = [
      { s: '' }, { s: 'x'.repeat(25) }, { s: 'Health' }, { s: 'has space' }, { s: 'a-b' }, { s: 5 }, { s: null }, { s: {} },
      { a: Number.NaN }, { a: Number.POSITIVE_INFINITY }, { a: 1e16 }, { a: -1e16 }, { a: 1.5 }, { a: '5' }, { a: null },
      { w: 4 }, { w: -1 }, { w: 1.5 }, { w: '2' }, { w: null },
      { digest: [] }, { digest: 'card' }, { digest: 7 }, { digest: null },
    ]
    g.queue = notices(hostile)
    migrateLegacyAi(g)
    expect(g.queue).toHaveLength(hostile.length)
    for (const m of g.queue as unknown as Record<string, unknown>[]) {
      for (const key of ['s', 'a', 'w', 'digest']) expect(key in m, `${String(m.id)} ${key}`).toBe(false)
    }
  })

  it('keeps a valid s, a, w and a digest that is a plain object', () => {
    const g = life()
    const card = { v: 1, year: 2001, age: 1, head: 'A year.', stories: [], groups: [] }
    const good: Record<string, unknown>[] = [
      { s: 'health', a: 1500, w: 2 }, { s: 'world.frontier', a: 0, w: 0 }, { s: `a${'b'.repeat(23)}`, a: -5, w: 3 }, { a: 1e15, w: 1 }, { digest: card },
    ]
    g.queue = notices(good)
    migrateLegacyAi(g)
    expect(g.queue).toHaveLength(good.length)
    g.queue.forEach((m, i) => expect(m).toMatchObject(good[i]!))
    expect((g.queue[4] as NoticeModal).digest).toEqual(card)
  })

  it('repairs a queued choice and the log entries the same way', () => {
    const g = life()
    const choice = (id: string, extra: Record<string, unknown>) => ({
      kind: 'choice', id, title: 't', text: 'x', choices: [{ id: 'a', label: 'A' }], source: 'script', scriptId: 'some.script', ...extra,
    })
    g.queue = [choice('c1', { s: 'bad name' }), choice('c2', { s: 'events' })] as unknown as ModalItem[]
    g.log = [
      {
        age: 0,
        year: g.year,
        entries: [
          { id: 'l1', text: 'bad', tone: 'neutral', s: 'Bad', a: 1e16, w: 9 },
          { id: 'l2', text: 'good', tone: 'good', s: 'health', a: -40, w: 0 },
          { id: 'l3', text: 'old', tone: 'ai' },
          null,
          'junk',
        ] as unknown as LogEntry[],
      },
    ]
    migrateLegacyAi(g)
    expect('s' in g.queue[0]!).toBe(false)
    expect((g.queue[1] as unknown as { s: string }).s).toBe('events')
    const [bad, good, old] = g.log[0]!.entries
    expect(Object.keys(bad!).sort()).toEqual(['id', 'text', 'tone'])
    expect(good).toEqual({ id: 'l2', text: 'good', tone: 'good', s: 'health', a: -40, w: 0 })
    expect(old!.tone).toBe('neutral')
  })

  it('is idempotent', () => {
    const g = life()
    g.queue = notices([{ s: 'Bad', a: 1e16, w: 9, digest: [] }, { s: 'health', a: 5, w: 1 }])
    migrateLegacyAi(g)
    const once = JSON.stringify(g)
    migrateLegacyAi(g)
    expect(JSON.stringify(g)).toBe(once)
  })

  it('migrateSave keeps the fields of a good save and repairs a damaged one', () => {
    const g = life()
    g.queue = notices([{ s: 'health', a: 1500, w: 2 }, { s: 'Bad Name', a: 1e16, w: 7, digest: 'x' }])
    log(g, 'good line', 'good', undefined, { a: 70, w: 1 })
    currentLogYear(g).entries.push({ id: 'bad-line', text: 'bad line', tone: 'neutral', s: '??', a: 2 ** 60, w: 8 } as unknown as LogEntry)
    const r = migrateSave(JSON.parse(JSON.stringify(g)))
    expect(r.kind).toBe('ready')
    if (r.kind !== 'ready') return
    expect(r.game.queue[0]).toMatchObject({ s: 'health', a: 1500, w: 2 })
    expect(Object.keys(r.game.queue[1]!).sort()).toEqual(['id', 'kind', 'text', 'title'])
    const entries = r.game.log[r.game.log.length - 1]!.entries
    expect(entries.find((e) => e.text === 'good line')).toMatchObject({ a: 70, w: 1 })
    expect(Object.keys(entries.find((e) => e.id === 'bad-line')!).sort()).toEqual(['id', 'text', 'tone'])
  })
})
