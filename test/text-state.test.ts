// State lines (R2-P8, E.T3 b): stateLine(g, key, value), a status line that speaks when its state crosses a threshold,
// or when it has been quiet for 5 years and the state still holds, in variants that never repeat the last two.
// The engine is stateLineWith(table, ...): these tests inject a table of their own, because the game's table starts empty
// (R2-P9 adds the rows) and its rows are linted by test/text-lines.test.ts.
// What they pin: the speak/quiet rule, the year stamp (idempotent), the variant cycle, no draw of any kind, no foresight,
// a hostile id or a hostile saved record never grows or breaks the memory, and an untouched life stays byte-identical.
import { describe, expect, it, vi } from 'vitest'
import { textCursor } from '../src/game/text/draw'
import { TEXT_MEM_LIMITS, readState, readTextMem, rememberState, writableTextMem, type TextMem } from '../src/game/text/memory'
import { STATE_LIMITS, bandBy, fillSlots, logBand, stateLineWith } from '../src/game/text/state'
import type { StateSpec } from '../src/game/text/state-table'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const A = ['Money is tight.', 'Money is still tight.', 'I count every dollar.'] as const
const TABLE = {
  a: { variants: A, band: bandBy(10, 100) },
  b: { variants: ['B one {n}.', 'B two {n}.', 'B three {n}.', 'B four.'], band: bandBy(1) },
  never: { variants: ['Once.', 'Only once.', 'One time.'], band: () => 0, every: 0 },
  loop3: { variants: ['L1.', 'L2.', 'L3.'], band: () => 0, every: 1 },
  loop6: { variants: ['M1.', 'M2.', 'M3.', 'M4.', 'M5.', 'M6.'], band: () => 0, every: 1 },
  wide: { variants: A, band: bandBy(10), gap: 4, every: 2 },
  low: { variants: A, band: () => -3, every: 1 },
  high: { variants: A, band: () => 500, every: 1 },
  odd: { variants: A, band: () => 2.7, every: 1 },
  nan: { variants: A, band: () => Number.NaN, every: 1 },
} as const satisfies Record<string, StateSpec>

const line = (g: GameState, key: string, value: number, opts?: { id?: string; slots?: Record<string, string> }): string | null =>
  stateLineWith(TABLE, g, key, value, opts)

function life(year = 2030, lifeId = 'state-life'): GameState {
  const g = makeTestGame(1)
  g.year = year
  g.lifeId = lifeId
  return g
}

/** One call a year from `from` to `to` (inclusive); the lines by year, null when quiet. */
function years(g: GameState, key: string, from: number, to: number, value: number | ((year: number) => number) = 5, opts?: { id?: string }): (string | null)[] {
  const out: (string | null)[] = []
  for (let y = from; y <= to; y++) {
    g.year = y
    out.push(line(g, key, typeof value === 'function' ? value(y) : value, opts))
  }
  return out
}

/** The stored record of a key: '<year>,<band>,<variant>,<previous or ->', or undefined. */
const record = (g: GameState, key: string): string | undefined => readTextMem(g).s?.[key]

const indexIn = (variants: readonly string[], text: string | null): number => (text === null ? -1 : variants.indexOf(text))

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

function nodeCount(value: unknown): number {
  let nodes = 0
  const stack: unknown[] = [value]
  while (stack.length) {
    const item = stack.pop()
    nodes++
    if (item && typeof item === 'object') for (const c of Array.isArray(item) ? item : Object.values(item)) stack.push(c)
  }
  return nodes
}

describe('the limits', () => {
  it('are the agreed numbers: 2 variants excluded, every 5 years, a 2 year gap, 120 records', () => {
    expect(STATE_LIMITS).toEqual({ exclude: 2, every: 5, gap: 2 })
    expect(TEXT_MEM_LIMITS.states).toBe(120)
  })
})

describe('when a state line speaks', () => {
  it('speaks the first time, and writes the record (and nothing else new)', () => {
    const g = life()
    const said = line(g, 'a', 5)
    expect(A).toContain(said)
    const rec = record(g, 'a')
    expect(rec).toMatch(/^2030,0,[0-2],-$/)
    expect(Number(rec!.split(',')[2])).toBe(indexIn(A, said))
    expect(Object.keys(readTextMem(g).s ?? {})).toEqual(['a'])
  })

  it('a second call in the same year is quiet: the year gap is 0, whatever the value', () => {
    const g = life()
    expect(line(g, 'a', 5)).not.toBeNull()
    const before = JSON.stringify(g.flags)
    expect(line(g, 'a', 5)).toBeNull()
    expect(line(g, 'a', 50)).toBeNull()
    expect(line(g, 'a', 5000)).toBeNull()
    expect(JSON.stringify(g.flags)).toBe(before)
  })

  it('an unchanged band is quiet for 4 years and speaks in the fifth', () => {
    const g = life()
    const got = years(g, 'a', 2030, 2040)
    expect(got.map((x) => x !== null)).toEqual([true, false, false, false, false, true, false, false, false, false, true])
  })

  it('every: 0 never speaks again', () => {
    const g = life()
    const got = years(g, 'never', 2030, 2160)
    expect(got[0]).not.toBeNull()
    expect(got.slice(1).every((x) => x === null)).toBe(true)
    expect(record(g, 'never')).toMatch(/^2030,0,/)
  })

  it('every: 0 still speaks when the band changes (it only turns the 5 year repeat off)', () => {
    const table = { once: { variants: A, band: bandBy(10), every: 0 } }
    const g = life(2030)
    expect(stateLineWith(table, g, 'once', 5)).not.toBeNull()
    g.year = 2060
    expect(stateLineWith(table, g, 'once', 5)).toBeNull()
    expect(stateLineWith(table, g, 'once', 50)).not.toBeNull()
  })

  it('a band change after 1 year is deferred, not lost: it speaks after 2, and the record kept the old band meanwhile', () => {
    const g = life(2030)
    expect(line(g, 'a', 5)).not.toBeNull()
    g.year = 2031
    expect(line(g, 'a', 50)).toBeNull()
    expect(record(g, 'a')).toMatch(/^2030,0,/)
    g.year = 2032
    expect(line(g, 'a', 50)).not.toBeNull()
    expect(record(g, 'a')).toMatch(/^2032,1,/)
  })

  it('a band change after 3 years speaks at once', () => {
    const g = life(2030)
    line(g, 'a', 5)
    g.year = 2033
    expect(line(g, 'a', 500)).not.toBeNull()
    expect(record(g, 'a')).toMatch(/^2033,2,/)
  })

  it('a deferred change that settles back to the old band stays quiet (the band is what counts, not the visit)', () => {
    const g = life(2030)
    line(g, 'a', 5)
    g.year = 2031
    expect(line(g, 'a', 50)).toBeNull()
    g.year = 2032
    // Back in the recorded band two years on: no change of state, so only the 5 year rule applies.
    expect(line(g, 'a', 5)).toBeNull()
    g.year = 2035
    expect(line(g, 'a', 5)).not.toBeNull()
  })

  it('a row can set its own every and gap', () => {
    const g = life(2030)
    line(g, 'wide', 5)
    // gap 4: a change at 3 years waits, at 4 years speaks.
    g.year = 2033
    expect(line(g, 'wide', 50)).toBeNull()
    g.year = 2034
    expect(line(g, 'wide', 50)).not.toBeNull()
    // every 2: the same band speaks again after 2 years, not after 1.
    g.year = 2035
    expect(line(g, 'wide', 50)).toBeNull()
    g.year = 2036
    expect(line(g, 'wide', 50)).not.toBeNull()
  })

  it('a missing, unknown or inherited key returns null and writes nothing', () => {
    const g = life()
    for (const key of ['nope', 'toString', 'constructor', '__proto__', 'hasOwnProperty', '']) expect(line(g, key, 5), key).toBeNull()
    expect(g.flags.textMem).toBeUndefined()
  })

  it('a quiet call writes nothing: a deeply frozen state does not throw', () => {
    const g = life()
    line(g, 'a', 5)
    deepFreeze(g.flags)
    g.year = 2031
    expect(() => line(g, 'a', 5)).not.toThrow()
    expect(line(g, 'a', 5)).toBeNull()
  })
})

describe('the band', () => {
  it('a non-finite value is band 0, and a band outside 0..99 is clamped to a whole number', () => {
    for (const [key, value, want] of [
      ['a', Number.NaN, 0],
      ['a', Number.POSITIVE_INFINITY, 0],
      ['a', Number.NEGATIVE_INFINITY, 0],
      ['low', 5, 0],
      ['high', 5, 99],
      ['odd', 5, 2],
      ['nan', 5, 0],
    ] as const) {
      const g = life()
      expect(line(g, key, value), `${key} ${value}`).not.toBeNull()
      expect(record(g, key), `${key} ${value}`).toMatch(new RegExp(`^2030,${want},`))
    }
  })

  it('bandBy counts the edges at or below the value', () => {
    const band = bandBy(1, 5)
    expect([0.5, 1, 4.99, 5, 6, -1, 0].map(band)).toEqual([0, 1, 1, 2, 2, 0, 0])
    expect(bandBy()(1e9)).toBe(0)
    expect(band(Number.NaN)).toBe(0)
    const many = bandBy(...Array.from({ length: 150 }, (_, i) => i))
    expect(many(1e6)).toBe(99)
  })

  it('logBand steps each time the value is multiplied by the ratio, and is 0 for nothing', () => {
    const band = logBand(2)
    expect([0, -4, Number.NaN].map(band)).toEqual([0, 0, 0])
    const bands = Array.from({ length: 31 }, (_, i) => band(2 ** i))
    expect(bands).toEqual(Array.from({ length: 31 }, (_, i) => i + 1))
    expect(band(3)).toBe(2)
    expect(band(7.99)).toBe(3)
    // The default ratio is 1.25, and a nonsense ratio falls back to it.
    expect(logBand()(1.24)).toBe(logBand(1.25)(1.24))
    expect(logBand()(10)).toBe(logBand(0.5)(10))
    expect(logBand(1)(10)).toBe(logBand()(10))
  })

  it('logBand is a whole number from 0 to 99 for any value, a fraction included', () => {
    for (const ratio of [1.1, 1.25, 2, 10]) {
      const band = logBand(ratio)
      for (const v of [0, 1e-9, 0.1, 0.5, 1, 1.5, 999, 1e6, 1e12, 1e300, Number.MAX_VALUE, Number.POSITIVE_INFINITY]) {
        const b = band(v)
        expect(Number.isInteger(b), `${ratio} ${v}`).toBe(true)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThanOrEqual(99)
      }
    }
  })
})

describe('the variants', () => {
  it('never repeat either of the last two used, and three variants cycle through all three (30 years)', () => {
    const g = life()
    const used = years(g, 'loop3', 2030, 2059).map((x) => indexIn(TABLE.loop3.variants, x))
    expect(used.every((i) => i >= 0)).toBe(true)
    for (let i = 1; i < used.length; i++) expect(used[i], `year ${i}`).not.toBe(used[i - 1])
    for (let i = 2; i < used.length; i++) expect(used[i], `year ${i}`).not.toBe(used[i - 2])
    expect(new Set(used).size).toBe(3)
    // With nothing else to exclude, the cycle is exact: every window of three holds each variant once.
    for (let i = 0; i + 2 < used.length; i++) expect(new Set(used.slice(i, i + 3)).size, `window ${i}`).toBe(3)
  })

  it('six variants: the same rule, and every variant gets used', () => {
    const g = life()
    const used = years(g, 'loop6', 2030, 2149).map((x) => indexIn(TABLE.loop6.variants, x))
    for (let i = 1; i < used.length; i++) expect(used[i]).not.toBe(used[i - 1])
    for (let i = 2; i < used.length; i++) expect(used[i]).not.toBe(used[i - 2])
    expect(new Set(used).size).toBe(6)
  })

  it('the record keeps the last variant and the one before it', () => {
    const g = life()
    const used = years(g, 'loop3', 2030, 2032).map((x) => indexIn(TABLE.loop3.variants, x))
    expect(record(g, 'loop3')).toBe(`2032,0,${used[2]},${used[1]}`)
  })

  it('fills the slots of the line it picked, and a missing slot leaves no brace', () => {
    const g = life()
    const said = line(g, 'b', 3, { slots: { n: 'seven' } })
    expect(said).toMatch(/^B (one|two|three) seven\.$|^B four\.$/)
    const h = life()
    expect(line(h, 'b', 3)).not.toMatch(/[{}]/)
  })

  it('a table with fewer than three variants still speaks and still avoids the last one', () => {
    const table = { two: { variants: ['One.', 'Two.'], band: () => 0, every: 1 }, one: { variants: ['Solo.'], band: () => 0, every: 1 } }
    const g = life()
    const two: (string | null)[] = []
    const solo: (string | null)[] = []
    for (let y = 2030; y < 2040; y++) {
      g.year = y
      two.push(stateLineWith(table, g, 'two', 0))
      solo.push(stateLineWith(table, g, 'one', 0))
    }
    for (let i = 1; i < two.length; i++) expect(two[i]).not.toBe(two[i - 1])
    expect(solo.every((x) => x === 'Solo.')).toBe(true)
  })
})

describe('no draw of any kind', () => {
  it('the same life, year and key give the same lines in a replay, in a structuredClone and after a reload', () => {
    const a = life(2030, 'replay-life')
    const b = life(2030, 'replay-life')
    expect(years(a, 'loop6', 2030, 2060)).toEqual(years(b, 'loop6', 2030, 2060))
    const c = life(2030, 'replay-life')
    const first = years(c, 'loop6', 2030, 2040)
    const d = structuredClone(c)
    const e = JSON.parse(JSON.stringify(c)) as GameState
    const rest = years(c, 'loop6', 2041, 2070)
    expect(years(d, 'loop6', 2041, 2070)).toEqual(rest)
    expect(years(e, 'loop6', 2041, 2070)).toEqual(rest)
    expect(first.every((x) => x !== null)).toBe(true)
  })

  it('the life id is what varies the lines, not a draw', () => {
    const lines = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map((id) => years(life(2030, 'life-' + id), 'loop6', 2030, 2035).join('|'))
    expect(new Set(lines).size).toBeGreaterThan(1)
  })

  it('g.rng, g.nextId, Math.random and the text cursor do not move over 200 calls', () => {
    const random = vi.spyOn(Math, 'random')
    try {
      const g = life()
      g.rng = 123456
      g.nextId = 77
      for (let i = 0; i < 200; i++) {
        g.year = 2030 + (i % 40)
        line(g, i % 2 ? 'loop3' : 'a', i, { id: i % 3 ? undefined : 'p' + (i % 7) })
      }
      expect(g.rng).toBe(123456)
      expect(g.nextId).toBe(77)
      expect(random).not.toHaveBeenCalled()
      expect(readTextMem(g).c).toBeUndefined()
      expect(textCursor(g).n).toBe(0)
    } finally {
      random.mockRestore()
    }
  })
})

describe('one row for one person: the id', () => {
  it('keeps two people independent', () => {
    const g = life()
    expect(line(g, 'a', 5, { id: 'p1' })).not.toBeNull()
    expect(line(g, 'a', 5, { id: 'p2' })).not.toBeNull()
    expect(line(g, 'a', 5, { id: 'p1' })).toBeNull()
    expect(line(g, 'a', 5)).not.toBeNull()
    expect(Object.keys(readTextMem(g).s ?? {}).sort()).toEqual(['a', 'a.p1', 'a.p2'])
    g.year = 2031
    // p3 has never been told, p1 spoke last year.
    expect(line(g, 'a', 5, { id: 'p3' })).not.toBeNull()
    expect(line(g, 'a', 5, { id: 'p1' })).toBeNull()
  })

  it('a hostile id returns null and writes nothing', () => {
    const g = life()
    for (const id of ['x y', 'x'.repeat(60), '__proto__', '', '1abc', 'a/b', 'a'.repeat(47), 'p1\n', '{x}', 'constructor.x y']) {
      expect(line(g, 'a', 5, { id }), JSON.stringify(id)).toBeNull()
    }
    expect(g.flags.textMem).toBeUndefined()
  })

  it('300 distinct ids leave at most 120 records, and the newest survive', () => {
    const g = life()
    for (let i = 0; i < 300; i++) expect(line(g, 'a', 5, { id: 'p' + i })).not.toBeNull()
    const keys = Object.keys(readTextMem(g).s ?? {})
    expect(keys).toHaveLength(120)
    expect(keys).toContain('a.p299')
    expect(keys).toContain('a.p180')
    expect(keys).not.toContain('a.p179')
    expect(keys).not.toContain('a.p0')
    // The same cap holds for the live memory.
    expect(Object.keys(writableTextMem(g).s ?? {})).toHaveLength(120)
  })

  it('a person who speaks again moves to the newest end, so they outlast the ones who stayed quiet', () => {
    const g = life()
    for (let i = 0; i < 120; i++) line(g, 'a', 5, { id: 'p' + i })
    g.year = 2036
    expect(line(g, 'a', 5, { id: 'p0' })).not.toBeNull()
    for (let i = 120; i < 130; i++) line(g, 'a', 5, { id: 'p' + i })
    const keys = Object.keys(readTextMem(g).s ?? {})
    expect(keys).toHaveLength(120)
    expect(keys).toContain('a.p0')
    expect(keys).not.toContain('a.p1')
  })
})

describe('no foresight', () => {
  it('a record from a year after g.year reads as none, and the line speaks and overwrites it', () => {
    const g = life(2030)
    g.flags.textMem = { v: 1, p: {}, f: {}, r: {}, s: { a: '2040,0,1,-' } }
    expect(readState(readTextMem(g), 'a', 2030)).toBeNull()
    expect(readState(readTextMem(g), 'a', 2040)).toEqual({ year: 2040, band: 0, v1: 1, v2: -1 })
    expect(line(g, 'a', 5)).not.toBeNull()
    // The future record is not a "previous variant": it is as if there had been none.
    expect(record(g, 'a')).toMatch(/^2030,0,[0-2],-$/)
  })

  it('a record from this very year counts as spoken', () => {
    const g = life(2030)
    g.flags.textMem = { v: 1, p: {}, f: {}, r: {}, s: { a: '2030,0,1,-' } }
    expect(line(g, 'a', 5)).toBeNull()
  })
})

describe('the record codec', () => {
  it('rememberState and readState round-trip, and the previous variant may be none', () => {
    const mem: TextMem = { v: 1, p: {}, f: {}, r: {} }
    expect(readState(mem, 'k', 2030)).toBeNull()
    rememberState(mem, 'k', { year: 2030, band: 7, v1: 2, v2: -1 })
    expect(mem.s).toEqual({ k: '2030,7,2,-' })
    expect(readState(mem, 'k', 2030)).toEqual({ year: 2030, band: 7, v1: 2, v2: -1 })
    rememberState(mem, 'k', { year: 2031, band: 7, v1: 0, v2: 2 })
    expect(mem.s).toEqual({ k: '2031,7,0,2' })
    expect(readState(mem, 'k', 2030)).toBeNull()
    expect(readState(mem, 'k', 2031)).toEqual({ year: 2031, band: 7, v1: 0, v2: 2 })
  })

  it('rememberState refuses a record or a key the reader would not accept', () => {
    const mem: TextMem = { v: 1, p: {}, f: {}, r: {} }
    rememberState(mem, 'bad key', { year: 2030, band: 0, v1: 0, v2: -1 })
    rememberState(mem, '1x', { year: 2030, band: 0, v1: 0, v2: -1 })
    rememberState(mem, 'k', { year: 2030.5, band: 0, v1: 0, v2: -1 })
    rememberState(mem, 'k', { year: -1, band: 0, v1: 0, v2: -1 })
    rememberState(mem, 'k', { year: 1_000_000, band: 0, v1: 0, v2: -1 })
    rememberState(mem, 'k', { year: 2030, band: 100, v1: 0, v2: -1 })
    rememberState(mem, 'k', { year: 2030, band: -1, v1: 0, v2: -1 })
    rememberState(mem, 'k', { year: 2030, band: 0, v1: 10, v2: -1 })
    rememberState(mem, 'k', { year: 2030, band: 0, v1: 0, v2: 10 })
    rememberState(mem, 'k', { year: 2030, band: 0, v1: 0, v2: -2 })
    expect(mem.s).toBeUndefined()
  })

  it('readState reads an own key only', () => {
    const mem: TextMem = { v: 1, p: {}, f: {}, r: {}, s: { k: '2030,0,0,-' } }
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) expect(readState(mem, key, 2040), key).toBeNull()
    expect(readState({ v: 1, p: {}, f: {}, r: {} }, 'k', 2040)).toBeNull()
  })
})

describe('a hostile or old save', () => {
  it('sanitizes textMem.s to valid records only, and readTextMem never throws', () => {
    const g = life()
    const s: Record<string, Json> = {
      good: '2030,0,1,-',
      both: '2030,5,1,3',
      num: 5,
      nul: null,
      arr: [],
      obj: {},
      short: '2030,0,1',
      band3: '2030,100,1,-',
      var2: '2030,0,10,-',
      year7: '1234567,0,1,-',
      neg: '-1,0,1,-',
      trail: '2030,0,1,-,',
      space: ' 2030,0,1,-',
      huge: '9'.repeat(10_000_000),
      'bad key': '2030,0,1,-',
      '1num': '2030,0,1,-',
      _x: '2030,0,1,-',
    }
    g.flags.textMem = { v: 1, p: {}, f: {}, r: {}, s }
    expect(() => readTextMem(g)).not.toThrow()
    expect(readTextMem(g).s).toEqual({ good: '2030,0,1,-', both: '2030,5,1,3' })
    expect(writableTextMem(g).s).toEqual({ good: '2030,0,1,-', both: '2030,5,1,3' })
  })

  it('trims a 500 key object to the newest 120 valid records', () => {
    const g = life()
    const s: Record<string, Json> = {}
    for (let i = 0; i < 500; i++) s['k' + i] = i % 10 === 0 ? 'bogus' : '2030,0,1,-'
    g.flags.textMem = { v: 1, p: {}, f: {}, r: {}, s }
    const keys = Object.keys(readTextMem(g).s ?? {})
    expect(keys).toHaveLength(120)
    expect(keys[119]).toBe('k499')
    expect(keys.every((k) => Number(k.slice(1)) % 10 !== 0)).toBe(true)
  })

  it('s that is not a plain object reads as no states at all', () => {
    for (const s of [null, 5, 'x', 'x'.repeat(1_000_000), true, [], ['2030,0,1,-'], undefined]) {
      const g = life()
      g.flags.textMem = { v: 1, p: {}, f: {}, r: {}, s: s as Json }
      const mem = readTextMem(g)
      expect(mem.s, JSON.stringify(s)?.slice(0, 20)).toBeUndefined()
      expect(Object.keys(mem)).toEqual(['v', 'p', 'f', 'r'])
    }
  })

  it('an old save has no s: it reads as empty and the first line adds it', () => {
    const g = life()
    g.flags.textMem = { v: 1, p: { x: 'b1.0' }, f: { y: '2020' }, r: { flavor: ['a'] } }
    expect(readTextMem(g).s).toBeUndefined()
    expect(line(g, 'a', 5)).not.toBeNull()
    const mem = readTextMem(g)
    expect(Object.keys(mem.s ?? {})).toEqual(['a'])
    expect(mem.p).toEqual({ x: 'b1.0' })
    expect(mem.f).toEqual({ y: '2020' })
    expect(mem.r).toEqual({ flavor: ['a'] })
  })

  it('stays a fixed point: a memory with states reads back equal, and is plain JSON', () => {
    const g = life()
    for (let i = 0; i < 30; i++) line(g, 'a', 5, { id: 'p' + i })
    expect(readTextMem(g)).toEqual(g.flags.textMem)
    expect(JSON.parse(JSON.stringify(g.flags.textMem))).toEqual(g.flags.textMem)
  })

  it('keeps the other fields and the cursor beside s', () => {
    const g = life()
    g.flags.textMem = { v: 1, p: { x: 'b1.0' }, f: {}, r: {}, c: '2030,4', s: { a: '2030,0,1,-' } }
    expect(readTextMem(g)).toEqual({ v: 1, p: { x: 'b1.0' }, f: {}, r: {}, c: '2030,4', s: { a: '2030,0,1,-' } })
    g.year = 2036
    line(g, 'a', 5)
    expect(readTextMem(g).c).toBe('2030,4')
  })
})

describe('an untouched life', () => {
  it('holds exactly { v: 1, p: {}, f: {}, r: {} }: s appears only when a state is first remembered', () => {
    const g = life()
    const mem = writableTextMem(g)
    expect(Object.keys(mem)).toEqual(['v', 'p', 'f', 'r'])
    expect(mem).toEqual({ v: 1, p: {}, f: {}, r: {} })
    // Calls that do not speak (an unknown key, a hostile id) leave it that way.
    line(g, 'nope', 5)
    line(g, 'a', 5, { id: 'bad id' })
    expect(Object.keys(writableTextMem(g))).toEqual(['v', 'p', 'f', 'r'])
  })

  it('a quiet call on a life with no memory does not create one', () => {
    const g = life()
    expect(line(g, 'nope', 5)).toBeNull()
    expect(g.flags.textMem).toBeUndefined()
  })
})

describe('size', () => {
  it('120 state records add 121 JSON nodes, so a full memory stays under 830', () => {
    const g = life()
    for (let i = 0; i < 300; i++) writableTextMem(g).p['pool' + i] = 'w1,2'
    for (let i = 0; i < 120; i++) writableTextMem(g).f['fam' + i] = '2030'
    for (const name of ['a', 'b', 'c', 'd']) writableTextMem(g).r[name] = Array.from({ length: 64 }, (_, i) => name + i)
    const before = nodeCount(g.flags.textMem)
    for (let i = 0; i < 300; i++) line(g, 'a', 5, { id: 'p' + i })
    const after = nodeCount(g.flags.textMem)
    expect(after - before).toBe(121)
    expect(after).toBeLessThanOrEqual(830)
  })
})

describe('fillSlots', () => {
  it('fills {name} from the slots and writes nothing for a missing one', () => {
    expect(fillSlots('{who} paid {money}.', { who: 'Sam', money: '$5' })).toBe('Sam paid $5.')
    expect(fillSlots('{who} paid {money}.', { who: 'Sam' })).toBe('Sam paid .')
    expect(fillSlots('{who} paid {money}.')).toBe(' paid .')
    expect(fillSlots('No slots here.', { who: 'x' })).toBe('No slots here.')
    expect(fillSlots('{a}{a}{b}', { a: '1', b: '2' })).toBe('112')
  })

  it('does not look inside a value it just put in, and ignores inherited names', () => {
    expect(fillSlots('{a} and {b}', { a: '{b}', b: 'two' })).toBe('{b} and two')
    expect(fillSlots('{a}', { a: '{a}' })).toBe('{a}')
    expect(fillSlots('{toString} {constructor} {__proto__}', {})).toBe('  ')
    expect(fillSlots('x {1}', { '1': 'one' })).toBe('x one')
  })
})
