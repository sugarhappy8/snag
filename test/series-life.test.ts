// R1-C3 (S3): the life series. One row an age (net worth, cash, debt, income, happiness, health), written at the end of
// ageUp, held in g.flags.lifeSeries, read back through a bounded reader. A life's series never reaches the heir; a
// graveyard entry keeps a 40-point trail of it (spark).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ageUp, YEARLY_HOOKS } from '../src/game/aging'
import { netWorth } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { continueAsChild } from '../src/game/life'
import {
  LIFE_SERIES_ROWS,
  lifeRows,
  lifeSpark,
  readLifeSeries,
  readSpark,
  writeLifeRow,
} from '../src/game/life-series'
import { createPerson } from '../src/game/people'
import { addToGraveyard, loadGraveyard, type GraveyardEntry } from '../src/game/save'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './charts-kit'
import { adult } from './market-kit'
import { memoryLocalStorage } from './save-kit'

afterEach(() => vi.unstubAllGlobals())

function life(seed = 5): GameState {
  const g = adult(seed, 2030, 'us')
  g.queue = []
  return g
}

function setSeries(g: GameState, value: unknown): void {
  g.flags.lifeSeries = value as Json
}

describe('writeLifeRow', () => {
  it('writes the row of the current age: net worth, cash, debt, income, happiness, health', () => {
    const g = life()
    const c = g.character
    c.money = 123_456.7
    g.flags.taxableIncome = 55_000.4
    c.stats.happiness = 71
    c.stats.health = 64
    writeLifeRow(g)
    const rows = readLifeSeries(g)
    expect(rows).toHaveLength(1)
    const [age, year, nw, cash, debt, income, happy, health] = rows[0]!
    expect(age).toBe(c.age)
    expect(year).toBe(g.year)
    expect(nw).toBe(netWorth(g))
    expect(cash).toBe(123_457)
    expect(debt).toBe(0)
    expect(income).toBe(55_000)
    expect([happy, health]).toEqual([71, 64])
    const s = g.flags.lifeSeries as { v: number; id: string }
    expect(s.v).toBe(1)
    expect(s.id).toBe(g.lifeId)
  })

  it('counts loans and mortgages as debt', () => {
    const g = life()
    g.character.loans.push({ id: 'ln1', kind: 'personal', lender: 'Bank', balance: 4_000, yearlyPayment: 100, rate: 0.05 } as never)
    g.assets.push({ id: 'h1', kind: 'home', name: 'Home', emoji: 'H', value: 100_000, upkeep: 0, details: {}, mortgage: { balance: 25_000 } } as never)
    writeLifeRow(g)
    expect(readLifeSeries(g)[0]![4]).toBe(29_000)
  })

  it('1: twice for one age leaves one row, the later values', () => {
    const g = life()
    writeLifeRow(g)
    g.character.money += 1000
    writeLifeRow(g)
    const rows = readLifeSeries(g)
    expect(rows).toHaveLength(1)
    expect(rows[0]![3]).toBe(Math.round(g.character.money))
  })

  it('3: 130 ages keep the newest 120', () => {
    const g = life()
    for (let a = 0; a < 130; a++) {
      g.character.age = a
      g.year = 1900 + a
      writeLifeRow(g)
    }
    const rows = readLifeSeries(g)
    expect(LIFE_SERIES_ROWS).toBe(120)
    expect(rows).toHaveLength(120)
    expect(rows[0]![0]).toBe(10)
    expect(rows[119]![0]).toBe(129)
    expect((g.flags.lifeSeries as { rows: unknown[] }).rows).toHaveLength(120)
  })

  it('holds every value to its range', () => {
    const g = life()
    const c = g.character
    c.money = 1e300
    c.stats.happiness = 400
    c.stats.health = -20
    g.flags.taxableIncome = -1e300
    writeLifeRow(g)
    const [, , nw, cash, , income, happy, health] = readLifeSeries(g)[0]!
    expect(cash).toBe(1e15)
    expect(income).toBe(-1e15)
    expect(nw).toBe(1e15)
    expect([happy, health]).toEqual([100, 0])
  })

  it('never throws, even on a damaged state, and never invents a row from NaN', () => {
    const g = life()
    g.character.money = Number.NaN
    expect(() => writeLifeRow(g)).not.toThrow()
    for (const row of readLifeSeries(g)) for (const n of row) expect(Number.isFinite(n)).toBe(true)
    const broken = { flags: null } as unknown as GameState
    expect(() => writeLifeRow(broken)).not.toThrow()
  })

  it('does not draw on the random stream', () => {
    const g = life()
    const rng = g.rng
    writeLifeRow(g)
    expect(g.rng).toBe(rng)
  })
})

describe('readLifeSeries and lifeRows', () => {
  const good = (age: number): number[] => [age, 2000 + age, 1000 + age, 500, 0, 10, 50, 60]

  it('4: a damaged series reads as nothing, or as its valid rows, and never throws', () => {
    const g = life()
    const cases: [string, unknown, number[]][] = [
      ['missing', undefined, []],
      ['not an object', 5, []],
      ['an array', [good(1)], []],
      ['wrong v', { v: 2, id: g.lifeId, rows: [good(1)] }, []],
      ['another life', { v: 1, id: 'someone-else', rows: [good(1)] }, []],
      ['rows not an array', { v: 1, id: g.lifeId, rows: 'x' }, []],
      ['rows an object', { v: 1, id: g.lifeId, rows: { 0: good(1) } }, []],
      ['strings in a row', { v: 1, id: g.lifeId, rows: [good(1), ['a', 1, 2, 3, 4, 5, 6, 7], good(3)] }, [1, 3]],
      ['NaN in a row', { v: 1, id: g.lifeId, rows: [good(1), [2, 2002, Number.NaN, 1, 1, 1, 1, 1], good(3)] }, [1, 3]],
      ['Infinity in a row', { v: 1, id: g.lifeId, rows: [good(1), [2, 2002, Number.POSITIVE_INFINITY, 1, 1, 1, 1, 1]] }, [1]],
      ['seven entries', { v: 1, id: g.lifeId, rows: [good(1), good(2).slice(0, 7), good(3)] }, [1, 3]],
      ['nine entries', { v: 1, id: g.lifeId, rows: [good(1), [...good(2), 0], good(3)] }, [1, 3]],
      ['null and objects as rows', { v: 1, id: g.lifeId, rows: [null, {}, 7, good(4)] }, [4]],
    ]
    for (const [name, value, ages] of cases) {
      setSeries(g, value)
      expect(readLifeSeries(g).map((r) => r[0]), name).toEqual(ages)
    }
  })

  it('4: 500 rows come back sorted, one an age, at most 120, whole and in range', () => {
    const g = life()
    const rows: number[][] = []
    for (let i = 0; i < 500; i++) rows.push([i % 160, 3000 + i, 1e30, -1e30, 7.6, 1, 300, -5])
    setSeries(g, { v: 1, id: g.lifeId, rows })
    const out = readLifeSeries(g)
    expect(out.length).toBeLessThanOrEqual(120)
    expect(out.length).toBeGreaterThan(100)
    for (let i = 0; i < out.length; i++) {
      const [age, year, nw, cash, debt, , happy, health] = out[i]!
      expect(age).toBeGreaterThanOrEqual(0)
      expect(age).toBeLessThanOrEqual(150)
      if (i > 0) expect(age).toBeGreaterThan(out[i - 1]![0])
      expect(year).toBeLessThanOrEqual(9999)
      expect(nw).toBe(1e15)
      expect(cash).toBe(-1e15)
      expect(debt).toBe(8)
      expect([happy, health]).toEqual([100, 0])
    }
  })

  it('a later row for the same age wins', () => {
    const g = life()
    setSeries(g, { v: 1, id: g.lifeId, rows: [[5, 2005, 1, 1, 1, 1, 1, 1], [6, 2006, 2, 2, 2, 2, 2, 2], [5, 2005, 9, 9, 9, 9, 9, 9]] })
    expect(readLifeSeries(g).map((r) => [r[0], r[2]])).toEqual([[5, 9], [6, 2]])
  })

  it('lifeRows gives the same rows as objects, oldest first', () => {
    const g = life()
    setSeries(g, { v: 1, id: g.lifeId, rows: [good(7), good(3)] })
    expect(lifeRows(g)).toEqual([
      { age: 3, year: 2003, netWorth: 1003, cash: 500, debt: 0 },
      { age: 7, year: 2007, netWorth: 1007, cash: 500, debt: 0 },
    ])
    expect(lifeRows(life())).toEqual([])
  })

  it('reads a frozen state (the readers are pure)', () => {
    const g = life()
    writeLifeRow(g)
    deepFreeze(g)
    expect(readLifeSeries(g)).toHaveLength(1)
    expect(lifeRows(g)).toHaveLength(1)
    expect(lifeSpark(g)).toHaveLength(1)
  })
})

describe('ageUp writes the row', () => {
  it('2: a replay of one age replaces its row, it does not add a second', () => {
    const g0 = life()
    const first = structuredClone(g0)
    first.rng = 111
    ageUp(first)
    const age = first.character.age
    expect(readLifeSeries(first).filter((r) => r[0] === age)).toHaveLength(1)
    const count = readLifeSeries(first).length
    const again = structuredClone(first)
    again.character.age -= 1
    again.year -= 1
    again.queue = []
    again.character.money = first.character.money * 3
    again.rng = 222
    ageUp(again)
    const rows = readLifeSeries(again)
    expect(again.character.age).toBe(age)
    expect(rows).toHaveLength(count)
    expect(rows.filter((r) => r[0] === age)).toHaveLength(1)
    // The replayed year's own values are the ones kept (three times the money, less a year of inflation).
    expect(rows.find((r) => r[0] === age)![3]).toBeGreaterThan(first.character.money * 2)
  })

  it('a year of ageUp adds exactly the row of the new age, with that year', () => {
    const g = life()
    ageUp(g)
    const rows = readLifeSeries(g)
    expect(rows).toHaveLength(1)
    expect(rows[0]![0]).toBe(g.character.age)
    expect(rows[0]![1]).toBe(g.year)
    ageUp(g)
    g.queue = []
    expect(readLifeSeries(g).map((r) => r[0])).toEqual([g.character.age - 1, g.character.age])
  })

  it('5: a death inside the hooks still writes the row of the year', () => {
    const g = life()
    const hook: [string, (x: GameState) => void] = ['test-kill', (x) => killCharacter(x, 'Test')]
    YEARLY_HOOKS.push(hook)
    try {
      ageUp(g)
    } finally {
      YEARLY_HOOKS.pop()
    }
    expect(g.character.alive).toBe(false)
    const rows = readLifeSeries(g)
    expect(rows).toHaveLength(1)
    expect(rows[0]![0]).toBe(g.character.age)
  })

  it('5: a death found by checkDeath after the hooks still writes the row of the year', () => {
    const g = life()
    const hook: [string, (x: GameState) => void] = ['test-fail', (x) => { x.character.stats.health = 0 }]
    YEARLY_HOOKS.push(hook)
    try {
      ageUp(g)
    } finally {
      YEARLY_HOOKS.pop()
    }
    expect(g.character.alive).toBe(false)
    const rows = readLifeSeries(g)
    expect(rows).toHaveLength(1)
    expect(rows[0]![0]).toBe(g.character.age)
    expect(rows[0]![7]).toBe(0)
  })
})

describe('heirs', () => {
  it('6: the series does not pass to the heir, and the heir starts a series of their own', () => {
    const g = life(21)
    g.character.age = 70
    const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
    writeLifeRow(g)
    expect(readLifeSeries(g)).toHaveLength(1)
    killCharacter(g, 'Old Age')
    g.queue = []
    const child = continueAsChild(g, heir.id)
    expect(child).not.toBe(g)
    expect(child.generation).toBe(2)
    expect('lifeSeries' in child.flags).toBe(false)
    expect(readLifeSeries(child)).toEqual([])
    // Even if a copy were carried over, it names another life and reads as nothing.
    child.flags.lifeSeries = g.flags.lifeSeries as Json
    expect(readLifeSeries(child)).toEqual([])
  })
})

describe('lifeSpark and readSpark', () => {
  function withRows(n: number): GameState {
    const g = life()
    setSeries(g, { v: 1, id: g.lifeId, rows: Array.from({ length: n }, (_, i) => [i, 1900 + i, i * 1000 + 0.4, 0, 0, 0, 50, 50]) })
    return g
  }

  it('7: at most 40 points, the first and the last kept, whole numbers', () => {
    const g = withRows(120)
    const s = lifeSpark(g)
    expect(s).toHaveLength(40)
    expect(s[0]).toBe(0)
    expect(s[39]).toBe(119 * 1000)
    expect(s.every(Number.isInteger)).toBe(true)
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]!)
  })

  it('7: a short series is returned whole, a smaller limit is honoured, and none gives none', () => {
    expect(lifeSpark(withRows(5))).toEqual([0, 1000, 2000, 3000, 4000])
    const ten = lifeSpark(withRows(120), 10)
    expect(ten).toHaveLength(10)
    expect([ten[0], ten[9]]).toEqual([0, 119_000])
    expect(lifeSpark(withRows(120), 500)).toHaveLength(40)
    expect(lifeSpark(withRows(1))).toEqual([0])
    expect(lifeSpark(life())).toEqual([])
  })

  it('readSpark keeps a clean trail, whole and clamped, and drops anything else', () => {
    expect(readSpark([1, 2.6, -3.4, 1e300])).toEqual([1, 3, -3, 1e15])
    expect(readSpark(Array.from({ length: 40 }, (_, i) => i))).toHaveLength(40)
    for (const bad of [undefined, null, 'x', 5, {}, [], [1], [1, 'a'], [1, null], [1, Number.NaN], [1, Number.POSITIVE_INFINITY], Array.from({ length: 41 }, (_, i) => i), Array.from({ length: 1000 }, (_, i) => i)]) {
      expect(readSpark(bad), JSON.stringify(bad)).toBeUndefined()
    }
  })
})

describe('the graveyard', () => {
  const entry = (lifeId: string, extra: Record<string, unknown> = {}): GraveyardEntry => ({
    lifeId,
    generation: 1,
    name: 'A B',
    gender: 'male',
    bornYear: 1960,
    diedYear: 2040,
    age: 80,
    causeOfDeath: 'Old Age',
    netWorth: 1000,
    occupation: 'Retired',
    ribbon: null,
    obituary: null,
    ...extra,
  } as GraveyardEntry)

  function stored(entries: unknown[]): Storage {
    const ls = memoryLocalStorage({ 'anotherlife.graveyard.v1': JSON.stringify(entries) })
    vi.stubGlobal('localStorage', ls)
    return ls
  }

  it('8: a clean spark survives a round trip', () => {
    vi.stubGlobal('localStorage', memoryLocalStorage())
    expect(addToGraveyard(entry('l1', { spark: [1, 2, 3] }))).not.toBeNull()
    expect(loadGraveyard()[0]!.spark).toEqual([1, 2, 3])
  })

  it('8: a hostile spark is dropped and the entry still loads', () => {
    const strings = ['a', 'b']
    const thousand = Array.from({ length: 1000 }, (_, i) => i)
    stored([
      entry('l1', { spark: strings }),
      entry('l2', { spark: thousand }),
      entry('l3', { spark: [1, null, 3] }),
      entry('l4', { spark: 'nope' }),
      entry('l5', { spark: { 0: 1 } }),
      entry('l6', { spark: [1e300, -1e300] }),
      entry('l7'),
    ])
    const out = loadGraveyard()
    expect(out.map((e) => e.lifeId)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'])
    for (const e of out.slice(0, 5)) expect('spark' in e, e.lifeId).toBe(false)
    expect(out[5]!.spark).toEqual([1e15, -1e15])
    expect('spark' in out[6]!).toBe(false)
  })
})
