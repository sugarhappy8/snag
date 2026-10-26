// Text kit, part 1 (R1-T1, E.T1): the memory in g.flags.textMem. Every value is a string or a string
// array, so a pool costs one JSON node. The reader is strict: anything that is not the exact codec reads as empty,
// and the writer trims a hostile save back inside the caps.
import { describe, expect, it } from 'vitest'
import {
  TEXT_MEM_LIMITS,
  familyStats,
  familyUses,
  noteFamily,
  readTextMem,
  recallPool,
  rememberPool,
  ringRead,
  ringWrite,
  writableTextMem,
  type TextMem,
} from '../src/game/text/memory'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const EMPTY: TextMem = { v: 1, p: {}, f: {}, r: {} }

function empty(): TextMem {
  return { v: 1, p: {}, f: {}, r: {} }
}

function game(year = 2030): GameState {
  const g = makeTestGame(1)
  g.year = year
  return g
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

describe('limits', () => {
  it('are the agreed caps', () => {
    expect(TEXT_MEM_LIMITS).toEqual({ pools: 300, families: 160, recent: 8, bag: 12, famYears: 12, famWindow: 10, rings: 4, ring: 64, ringKey: 80, states: 120 })
  })
})

describe('pool codecs', () => {
  it('round-trips a shuffle-bag: the mask of picked indexes and the last one', () => {
    const mem = empty()
    expect(recallPool(mem, 'bag', 5)).toEqual({ kind: 'bag', used: 0, last: -1 })
    rememberPool(mem, 'bag', 5, 2)
    expect(mem.p.bag).toBe('b4.2')
    rememberPool(mem, 'bag', 5, 4)
    expect(mem.p.bag).toBe('b20.4')
    expect(recallPool(mem, 'bag', 5)).toEqual({ kind: 'bag', used: 20, last: 4 })
  })

  it('starts a new bag cycle with just the new index once every index was used', () => {
    const mem = empty()
    for (const i of [0, 1, 2]) rememberPool(mem, 'bag', 3, i)
    expect(mem.p.bag).toBe('b7.2')
    rememberPool(mem, 'bag', 3, 1)
    expect(mem.p.bag).toBe('b2.1')
    expect(recallPool(mem, 'bag', 3)).toEqual({ kind: 'bag', used: 2, last: 1 })
  })

  it('round-trips a window: the last 8 indexes, oldest first', () => {
    const mem = empty()
    expect(recallPool(mem, 'win', 20)).toEqual({ kind: 'window', recent: [] })
    rememberPool(mem, 'win', 20, 3)
    rememberPool(mem, 'win', 20, 17)
    expect(mem.p.win).toBe('w3,17')
    expect(recallPool(mem, 'win', 20)).toEqual({ kind: 'window', recent: [3, 17] })
    for (let i = 0; i < 10; i++) rememberPool(mem, 'win', 20, i)
    expect(recallPool(mem, 'win', 20)).toEqual({ kind: 'window', recent: [2, 3, 4, 5, 6, 7, 8, 9] })
    expect(mem.p.win).toBe('w2,3,4,5,6,7,8,9')
  })

  it('treats 12 lines as a bag and 13 as a window', () => {
    expect(recallPool(empty(), 'k', 12).kind).toBe('bag')
    expect(recallPool(empty(), 'k', 13).kind).toBe('window')
    expect(recallPool(empty(), 'k', 2).kind).toBe('bag')
  })

  it('reads an invalid record as empty', () => {
    const bad = ['b5000', 'b4096', 'b1.12', 'b1.99', 'b-1', 'bx', 'b', 'b1.', 'b1.2.3', '', 'B1.0', 'b12345', 'b1 .0', ' b1.0', 'b1.0 ']
    for (const rec of bad) {
      const mem = empty()
      mem.p.k = rec
      expect(recallPool(mem, 'k', 5), rec).toEqual({ kind: 'bag', used: 0, last: -1 })
    }
    const badWin = ['w', 'w1,', 'w1,2,x', 'w-1', 'w1,2,3,4,5,6,7,8,9', 'w123456', 'w1;2', 'W1', 'w 1', '1,2']
    for (const rec of badWin) {
      const mem = empty()
      mem.p.k = rec
      expect(recallPool(mem, 'k', 20), rec).toEqual({ kind: 'window', recent: [] })
    }
  })

  it('reads a record of the wrong kind for the pool size as empty', () => {
    const mem = empty()
    mem.p.k = 'w1,2,3'
    expect(recallPool(mem, 'k', 5)).toEqual({ kind: 'bag', used: 0, last: -1 })
    mem.p.k = 'b3.1'
    expect(recallPool(mem, 'k', 20)).toEqual({ kind: 'window', recent: [] })
  })

  it('ignores indexes beyond the pool size when the pool changed size', () => {
    const mem = empty()
    mem.p.bag = 'b4095.11'
    expect(recallPool(mem, 'bag', 5)).toEqual({ kind: 'bag', used: 31, last: -1 })
    mem.p.win = 'w2,30,4,99'
    expect(recallPool(mem, 'win', 20)).toEqual({ kind: 'window', recent: [2, 4] })
  })

  it('rememberPool ignores an index outside the pool', () => {
    const mem = empty()
    rememberPool(mem, 'k', 5, 5)
    rememberPool(mem, 'k', 5, -1)
    rememberPool(mem, 'k', 5, 1.5)
    rememberPool(mem, 'k', 5, Number.NaN)
    expect(mem.p).toEqual({})
  })

  it('works for keys that look like Object.prototype members', () => {
    const mem = empty()
    expect(recallPool(mem, 'constructor', 5)).toEqual({ kind: 'bag', used: 0, last: -1 })
    expect(recallPool(mem, 'toString', 20)).toEqual({ kind: 'window', recent: [] })
    rememberPool(mem, 'constructor', 5, 2)
    expect(recallPool(mem, 'constructor', 5)).toEqual({ kind: 'bag', used: 4, last: 2 })
  })
})

describe('pool LRU', () => {
  it('evicts the oldest pool past 300', () => {
    const mem = empty()
    for (let i = 0; i <= 300; i++) rememberPool(mem, 'k' + i, 20, 1)
    const keys = Object.keys(mem.p)
    expect(keys).toHaveLength(300)
    expect(keys[0]).toBe('k1')
    expect(keys[299]).toBe('k300')
    expect(mem.p.k0).toBeUndefined()
  })

  it('keeps a touched key: it moves last', () => {
    const mem = empty()
    for (let i = 0; i < 300; i++) rememberPool(mem, 'k' + i, 20, 1)
    rememberPool(mem, 'k0', 20, 2)
    expect(Object.keys(mem.p)[299]).toBe('k0')
    rememberPool(mem, 'k300', 20, 1)
    expect(Object.keys(mem.p)).toHaveLength(300)
    expect(mem.p.k0).toBe('w1,2')
    expect(mem.p.k1).toBeUndefined()
  })
})

describe('families', () => {
  it('appends the year, prunes years 10 or more behind, and reports last and count10', () => {
    const g = game(2020)
    noteFamily(g, 'weather')
    g.year = 2023
    noteFamily(g, 'weather')
    expect(readTextMem(g).f.weather).toBe('2020,2023')
    expect(familyStats(g, 'weather')).toEqual({ last: 2023, count10: 2 })
    g.year = 2030
    noteFamily(g, 'weather')
    // 2020 is exactly 10 behind: out. 2023 stays.
    expect(readTextMem(g).f.weather).toBe('2023,2030')
    expect(familyStats(g, 'weather')).toEqual({ last: 2030, count10: 2 })
    g.year = 2032
    expect(familyStats(g, 'weather')).toEqual({ last: 2030, count10: 2 })
    g.year = 2033
    // The window is 2024..2033 now: 2023 is out of the count, 2030 is in.
    expect(familyStats(g, 'weather')).toEqual({ last: 2030, count10: 1 })
  })

  it('count10 counts the years y with year - 10 < y <= year', () => {
    const g = game(2040)
    g.flags.textMem = { v: 1, p: {}, f: { x: '2029,2030,2031,2032,2040' }, r: {} }
    expect(familyStats(g, 'x')).toEqual({ last: 2040, count10: 3 })
  })

  it('keeps at most 12 years, the newest', () => {
    const g = game(2030)
    for (let i = 0; i < 15; i++) {
      g.year = 2030 + (i >> 1)
      noteFamily(g, 'busy')
    }
    const years = readTextMem(g).f.busy.split(',').map(Number)
    expect(years).toHaveLength(12)
    expect(years).toEqual([...years].sort((a, b) => a - b))
    expect(years[11]).toBe(2037)
  })

  it('with lifetime it keeps the years 10 or more behind, still the newest 12 and none after the year (R3 decision L2: the ask families count their uses)', () => {
    const g = game(2020)
    for (const y of [2020, 2027, 2034, 2041]) {
      g.year = y
      noteFamily(g, 'asked', true)
    }
    expect(readTextMem(g).f.asked).toBe('2020,2027,2034,2041')
    expect(familyUses(g, 'asked')).toBe(4)
    // The same years, noted the way every other family is, leave the last two only.
    g.year = 2020
    for (const y of [2020, 2027, 2034, 2041]) {
      g.year = y
      noteFamily(g, 'weather')
    }
    expect(readTextMem(g).f.weather).toBe('2034,2041')
    // A year after the clock is dropped when the next one is noted, as for any family.
    g.flags.textMem = { v: 1, p: {}, f: { asked: '2020,2031,2033' }, r: {} }
    g.year = 2030
    noteFamily(g, 'asked', true)
    expect(readTextMem(g).f.asked).toBe('2020,2030')
    // The newest 12, however long the life.
    for (let i = 0; i < 20; i++) {
      g.year = 2031 + i * 3
      noteFamily(g, 'asked', true)
    }
    const years = readTextMem(g).f.asked.split(',').map(Number)
    expect(years).toHaveLength(12)
    expect(years[11]).toBe(2088)
  })

  it('reports no use for a family that was never noted', () => {
    const g = game()
    expect(familyStats(g, 'nothing')).toEqual({ last: null, count10: 0 })
    noteFamily(g, 'something')
    expect(familyStats(g, 'nothing')).toEqual({ last: null, count10: 0 })
  })

  it('ignores a year after the current one, and drops it when the clock went back', () => {
    const g = game(2030)
    g.flags.textMem = { v: 1, p: {}, f: { later: '2031,2033', mixed: '2026,2031' }, r: {} }
    expect(familyStats(g, 'later')).toEqual({ last: null, count10: 0 })
    expect(familyStats(g, 'mixed')).toEqual({ last: 2026, count10: 1 })
    noteFamily(g, 'mixed')
    expect(readTextMem(g).f.mixed).toBe('2026,2030')
  })

  it('evicts the oldest family past 160 and moves a noted family last', () => {
    const g = game()
    for (let i = 0; i <= 160; i++) noteFamily(g, 'fam' + i)
    let keys = Object.keys(readTextMem(g).f)
    expect(keys).toHaveLength(160)
    expect(keys[0]).toBe('fam1')
    noteFamily(g, 'fam1')
    keys = Object.keys(readTextMem(g).f)
    expect(keys[159]).toBe('fam1')
    noteFamily(g, 'fam161')
    keys = Object.keys(readTextMem(g).f)
    expect(keys).toHaveLength(160)
    expect(keys).toContain('fam1')
    expect(keys).not.toContain('fam2')
  })

  it('ignores a name that is not a valid key and writes nothing', () => {
    const g = game()
    for (const name of ['', '1abc', 'has space', '_x', 'a'.repeat(49), 'café', 'a/b']) noteFamily(g, name)
    expect(g.flags.textMem).toBeUndefined()
    expect(familyStats(g, '1abc')).toEqual({ last: null, count10: 0 })
    noteFamily(g, 'a'.repeat(48))
    expect(Object.keys(readTextMem(g).f)).toEqual(['a'.repeat(48)])
  })
})

describe('rings', () => {
  const keys = (n: number, prefix = 'k') => Array.from({ length: n }, (_, i) => prefix + i)

  it('return null for a ring that was never written, and a copy otherwise', () => {
    const g = game()
    expect(ringRead(g, 'flavor')).toBeNull()
    ringWrite(g, 'flavor', ['a:1', 'b:2'])
    const got = ringRead(g, 'flavor')
    expect(got).toEqual(['a:1', 'b:2'])
    got!.push('x')
    expect(ringRead(g, 'flavor')).toEqual(['a:1', 'b:2'])
  })

  it('keeps the newest 64 keys', () => {
    const g = game()
    ringWrite(g, 'flavor', keys(65))
    const ring = ringRead(g, 'flavor')!
    expect(ring).toHaveLength(64)
    expect(ring[0]).toBe('k1')
    expect(ring[63]).toBe('k64')
  })

  it('honours a smaller cap and never goes above 64', () => {
    const g = game()
    ringWrite(g, 'small', keys(10), 3)
    expect(ringRead(g, 'small')).toEqual(['k7', 'k8', 'k9'])
    ringWrite(g, 'big', keys(100), 1000)
    expect(ringRead(g, 'big')).toHaveLength(64)
  })

  it('drops a key longer than 80 characters and keeps one of exactly 80', () => {
    const g = game()
    ringWrite(g, 'r', ['x'.repeat(80), 'y'.repeat(81), 'ok'])
    expect(ringRead(g, 'r')).toEqual(['x'.repeat(80), 'ok'])
  })

  it('ignores a fifth ring, and still updates the four it has', () => {
    const g = game()
    for (const name of ['a', 'b', 'c', 'd']) ringWrite(g, name, [name + '1'])
    ringWrite(g, 'e', ['e1'])
    expect(ringRead(g, 'e')).toBeNull()
    expect(Object.keys(readTextMem(g).r)).toEqual(['a', 'b', 'c', 'd'])
    ringWrite(g, 'b', ['b1', 'b2'])
    expect(ringRead(g, 'b')).toEqual(['b1', 'b2'])
  })

  it('ignores a ring name that is not a valid key', () => {
    const g = game()
    ringWrite(g, '9bad', ['x'])
    ringWrite(g, 'bad name', ['x'])
    expect(ringRead(g, '9bad')).toBeNull()
    expect(readTextMem(g).r).toEqual({})
  })

  it('keeps pools and families when a ring is written', () => {
    const g = game()
    noteFamily(g, 'fam')
    const mem = writableTextMem(g)
    rememberPool(mem, 'pool', 20, 4)
    ringWrite(g, 'flavor', ['a'])
    const after = readTextMem(g)
    expect(after.p.pool).toBe('w4')
    expect(after.f.fam).toBe('2030')
    expect(after.r.flavor).toEqual(['a'])
  })
})

describe('readTextMem', () => {
  it('returns a valid empty memory for junk, and never writes', () => {
    const junk: unknown[] = [undefined, null, 'text', '', 5, Number.NaN, true, [], [1, 2], {}, { v: 2, p: {}, f: {}, r: {} }, { v: 1, p: 'x', f: 5, r: [] }, { p: { a: 'b1.0' } }, { v: '1' }]
    for (const value of junk) {
      const g = game()
      if (value !== undefined) g.flags.textMem = value as Json
      const before = JSON.stringify(g.flags)
      const mem = readTextMem(g)
      expect(mem, JSON.stringify(value)).toEqual(EMPTY)
      expect(JSON.stringify(g.flags)).toBe(before)
    }
  })

  it('keeps the valid entries of a half-damaged memory and drops the rest', () => {
    const g = game()
    g.flags.textMem = {
      v: 1,
      p: { good: 'b3.1', win: 'w1,2', num: 5, nul: null, arr: ['b1.0'], obj: {}, badcodec: 'b9999', 'bad key': 'b1.0', '1num': 'b1.0', _x: 'b1.0' },
      f: { fam: '2020,2025', badfam: '2025,x', toolong: '1,2,3,4,5,6,7,8,9,10,11,12,13', num: 7 },
      r: { flavor: ['a', 5, null, 'b', 'z'.repeat(81)], notarray: 'x', nested: [['a']], obj: { a: 1 } },
    }
    expect(readTextMem(g)).toEqual({
      v: 1,
      p: { good: 'b3.1', win: 'w1,2' },
      f: { fam: '2020,2025' },
      // A ring keeps its string keys of 80 characters or fewer; a ring that is not an array of strings is not a ring.
      r: { flavor: ['a', 'b'], nested: [] },
    })
  })

  it('returns a copy: changing it does not change the state', () => {
    const g = game()
    ringWrite(g, 'flavor', ['a', 'b'])
    const copy = readTextMem(g)
    copy.r.flavor.push('c')
    copy.p.x = 'b1.0'
    expect(ringRead(g, 'flavor')).toEqual(['a', 'b'])
    expect(readTextMem(g).p).toEqual({})
  })

  it('is a fixed point: a valid memory reads back equal', () => {
    const g = game()
    for (let i = 0; i < 30; i++) rememberPool(writableTextMem(g), 'p' + (i % 7), 20, i % 20)
    noteFamily(g, 'fam')
    ringWrite(g, 'flavor', ['a', 'b', 'c'])
    expect(readTextMem(g)).toEqual(g.flags.textMem)
  })
})

describe('writableTextMem', () => {
  it('creates the memory when missing and returns the object stored in the state', () => {
    const g = game()
    const mem = writableTextMem(g)
    expect(mem).toEqual(EMPTY)
    expect(g.flags.textMem).toBe(mem)
    mem.p.k = 'b1.0'
    expect(recallPool(writableTextMem(g), 'k', 5)).toEqual({ kind: 'bag', used: 1, last: 0 })
  })

  it('replaces junk with a valid empty memory', () => {
    const g = game()
    g.flags.textMem = 'x'.repeat(10_000)
    const mem = writableTextMem(g)
    expect(mem).toEqual(EMPTY)
    expect(g.flags.textMem).toBe(mem)
  })

  it('trims an oversize memory from the front and drops invalid entries', () => {
    const g = game()
    const p: Record<string, Json> = {}
    for (let i = 0; i < 5000; i++) p['k' + i] = i % 10 === 0 ? 'bogus' : 'w1,2'
    const f: Record<string, Json> = {}
    for (let i = 0; i < 500; i++) f['f' + i] = '2025'
    const r: Record<string, Json> = {}
    for (let i = 0; i < 10; i++) r['r' + i] = Array.from({ length: 200 }, (_, j) => 'k' + j)
    g.flags.textMem = { v: 1, p, f, r }
    const mem = writableTextMem(g)
    const pk = Object.keys(mem.p)
    expect(pk).toHaveLength(300)
    expect(pk[299]).toBe('k4999')
    expect(pk.every((k) => Number(k.slice(1)) % 10 !== 0)).toBe(true)
    const fk = Object.keys(mem.f)
    expect(fk).toHaveLength(160)
    expect(fk[159]).toBe('f499')
    expect(Object.keys(mem.r)).toEqual(['r0', 'r1', 'r2', 'r3'])
    for (const ring of Object.values(mem.r)) {
      expect(ring).toHaveLength(64)
      expect(ring[63]).toBe('k199')
    }
  })

  it('drops a 10 MB string and keeps the rest', () => {
    const g = game()
    g.flags.textMem = { v: 1, p: { huge: 'b'.repeat(10_000_000), ok: 'b1.0' }, f: { huge: '1'.repeat(10_000_000) }, r: { r: ['x'.repeat(10_000_000), 'ok'] } }
    expect(writableTextMem(g)).toEqual({ v: 1, p: { ok: 'b1.0' }, f: {}, r: { r: ['ok'] } })
  })
})

describe('size', () => {
  it('a full memory (300 pools, 160 families, 4 full rings) is at most 740 JSON nodes', () => {
    const g = game()
    for (let i = 0; i < 300; i++) rememberPool(writableTextMem(g), 'pool' + i, 20, i % 20)
    for (let i = 0; i < 160; i++) noteFamily(g, 'fam' + i)
    for (const name of ['a', 'b', 'c', 'd']) ringWrite(g, name, Array.from({ length: 64 }, (_, i) => name + i))
    const mem = readTextMem(g)
    expect(Object.keys(mem.p)).toHaveLength(300)
    expect(Object.keys(mem.f)).toHaveLength(160)
    expect(Object.values(mem.r).every((r) => r.length === 64)).toBe(true)
    const nodes = nodeCount(g.flags.textMem)
    expect(nodes).toBeGreaterThan(600)
    expect(nodes).toBeLessThanOrEqual(740)
  })

  it('stays plain JSON', () => {
    const g = game()
    for (let i = 0; i < 50; i++) rememberPool(writableTextMem(g), 'pool' + (i % 9), i % 2 ? 20 : 5, i % 5)
    noteFamily(g, 'fam')
    ringWrite(g, 'flavor', ['a'])
    expect(JSON.parse(JSON.stringify(g.flags.textMem))).toEqual(g.flags.textMem)
  })
})
