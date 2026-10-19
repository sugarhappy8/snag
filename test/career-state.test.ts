import { beforeEach, describe, expect, it } from 'vitest'
import { ownerKey } from '../src/game/special/common'
import {
  KIT_LIMITS,
  appointmentId,
  arr,
  cap,
  claimSettle,
  defineCareerState,
  flt,
  int,
  nextId,
  readMemory,
  readRows,
  rec,
  txt,
  type Stamped,
} from '../src/game/special/kit/state'
import type { GameState, Job } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

// A synthetic two-step career: v0 had `points`, v1 had `score`, v2 adds `tier`.
const store = defineCareerState({
  key: 'synth.sim',
  version: 2,
  start: 20,
  migrate: [
    (r) => ({ ...r, score: r.points ?? 0 }),
    (r) => ({ ...r, tier: Number(r.score) > 50 ? 2 : 1 }),
  ],
  extra: (r) => ({ score: int(r.score, 0, 0, 100), tier: int(r.tier, 1, 1, 3) }),
})

const FLAG = 'special.synth.sim'

/** Paths of every non-finite number in a value. */
function nonFinite(v: unknown, path = 'r'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path]
  if (Array.isArray(v)) return v.flatMap((x, i) => nonFinite(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => nonFinite(x, `${path}.${k}`))
  return []
}

/** Number of nodes (values, arrays and objects) in a value. */
function nodes(v: unknown): number {
  if (Array.isArray(v)) return 1 + v.reduce((n: number, x) => n + nodes(x), 0)
  if (v && typeof v === 'object') return 1 + Object.values(v).reduce((n: number, x) => n + nodes(x), 0)
  return 1
}

/** Longest string in a value, keys included. */
function longest(v: unknown): number {
  if (typeof v === 'string') return v.length
  if (Array.isArray(v)) return v.reduce((n: number, x) => Math.max(n, longest(x)), 0)
  if (v && typeof v === 'object') return Object.entries(v).reduce((n, [k, x]) => Math.max(n, k.length, longest(x)), 0)
  return 0
}

const big = (n: number): string => 'x'.repeat(n)
const bigRows = Array.from({ length: 500 }, (_, i) => ({ y: 1900 + i, income: 1e300, spent: -5, rank: 1e9, of: Infinity, standing: 1e9, note: big(10_000) }))
const bigMemory = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, name: big(10_000), met: 1e300, won: -4, lost: NaN, grudge: 1e9, last: Infinity }))
const bigCool = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}${big(200)}`, i]))

const JUNK: unknown[] = [
  null,
  [],
  'x',
  42,
  { rows: 'bad', memory: [1, {}], standing: NaN, cool: { a: 'x' }, done: [1] },
  { rows: [null, 3, 'x', {}, { y: NaN }], memory: [null, [], { id: 5 }, { id: '' }], cool: [1, 2], done: 'abc', peak: 'high', years: -5 },
  {
    v: 'two',
    owner: big(10_000),
    appt: big(10_000),
    standing: 1e300,
    peak: -Infinity,
    years: 1e300,
    seq: NaN,
    settledYear: 'x',
    score: Infinity,
    tier: big(10_000),
    rows: bigRows,
    memory: bigMemory,
    cool: bigCool,
    done: Array.from({ length: 500 }, (_, i) => big(10_000) + i),
  },
]

describe('career state store', () => {
  let g: GameState
  beforeEach(() => {
    g = makeTestGame(1, { age: 30 })
  })

  it('lifts v0, v1 and v2 shapes to one record, idempotently', () => {
    const a = store.read({ points: 60 }, g)
    expect([a.score, a.tier, a.v]).toEqual([60, 2, 2])
    expect(store.read({ v: 1, score: 60 }, g)).toEqual(a)
    expect(store.read({ v: 2, score: 60, tier: 2 }, g)).toEqual(a)
    expect(store.read(a, g)).toEqual(a)
  })

  it('keeps junk finite, capped and small [RF1]', () => {
    for (const junk of JUNK) {
      const r = store.read(junk, g)
      expect(nonFinite(r)).toEqual([])
      expect(r.rows.length).toBeLessThanOrEqual(KIT_LIMITS.rows)
      expect(r.memory.length).toBeLessThanOrEqual(KIT_LIMITS.memory)
      expect(Object.keys(r.cool).length).toBeLessThanOrEqual(KIT_LIMITS.cool)
      expect(r.done.length).toBeLessThanOrEqual(KIT_LIMITS.done)
      expect(nodes(r)).toBeLessThan(3000)
      expect(longest(r)).toBeLessThanOrEqual(KIT_LIMITS.line)
      expect(r.standing).toBeGreaterThanOrEqual(0)
      expect(r.standing).toBeLessThanOrEqual(100)
      expect(r.peak).toBeGreaterThanOrEqual(r.standing)
      expect(r.peak).toBeLessThanOrEqual(100)
      expect(store.read(r, g)).toEqual(r)
    }
  })

  it('keeps the newest rows and memory of a 500-row record', () => {
    const r = store.read({ rows: bigRows, memory: bigMemory }, g)
    expect(r.rows.map((x) => x.y)).toEqual(bigRows.slice(-KIT_LIMITS.rows).map((x) => x.y))
    expect(r.memory.map((x) => x.id)).toEqual(bigMemory.slice(-KIT_LIMITS.memory).map((x) => x.id))
    expect(r.rows.every((x) => x.note.length <= KIT_LIMITS.line)).toBe(true)
  })

  it('survives garbage in a saved flag: peek, view and mut never throw [RF1]', () => {
    for (const junk of JUNK) {
      const h = makeTestGame(2, { age: 30 })
      h.flags[FLAG] = (junk && typeof junk === 'object' && !Array.isArray(junk) ? { ...junk, owner: ownerKey(h) } : junk) as never
      expect(() => store.peek(h)).not.toThrow()
      expect(() => store.view(h)).not.toThrow()
      expect(nonFinite(store.view(h))).toEqual([])
      expect(() => store.mut(h)).not.toThrow()
      expect(nonFinite(h.flags[FLAG])).toEqual([])
      expect(longest(h.flags[FLAG])).toBeLessThanOrEqual(KIT_LIMITS.line)
    }
  })

  it('reads another owner as fresh and keeps the legacy owner match [RF2]', () => {
    g.flags[FLAG] = { owner: 'other', v: 2, score: 60, tier: 2 }
    expect(store.has(g)).toBe(false)
    expect(store.peek(g)).toBeNull()
    expect(store.view(g).standing).toBe(20)
    expect(store.view(g).score).toBe(0)

    const c = g.character
    g.flags[FLAG] = { owner: `${c.id}:${c.firstName}:${c.lastName}:${g.year - c.age}`, v: 2, score: 60, tier: 2 }
    expect(store.has(g)).toBe(true)
    c.firstName = 'Renamed'
    c.lastName = 'Spouse'
    expect(store.has(g)).toBe(true)
    expect(store.peek(g)?.score).toBe(60)
  })

  it('does not hand a new life the record of its parent [RF2]', () => {
    store.mut(g).score = 77
    g.generation += 1
    g.character.id = 'heir'
    expect(store.has(g)).toBe(false)
    expect(store.view(g).score).toBe(0)
    const s = store.mut(g)
    expect(s.score).toBe(0)
    expect(s.owner).toBe(ownerKey(g))
  })

  it('view never writes and survives a frozen state [RF5]', () => {
    const f = deepFreeze(structuredClone(g))
    expect(() => store.view(f)).not.toThrow()
    expect(() => store.peek(f)).not.toThrow()
    expect(JSON.stringify(f)).toBe(JSON.stringify(g))
    expect(Object.keys(g.flags)).toEqual([])

    store.mut(g)
    const f2 = deepFreeze(structuredClone(g))
    expect(() => store.view(f2)).not.toThrow()
    expect(JSON.stringify(f2)).toBe(JSON.stringify(g))
  })

  it('view lifts a legacy profile through migrate[0] without writing it', () => {
    const lifted = defineCareerState({
      key: 'lift.sim',
      version: 1,
      migrate: [(r, h) => ({ ...r, boost: (h.flags['special.lift'] as { boost?: number } | undefined)?.boost ?? 0 })],
      extra: (r) => ({ boost: int(r.boost, 0, 0, 100) }),
    })
    g.flags['special.lift'] = { boost: 33 }
    const before = JSON.stringify(g)
    expect(lifted.view(g).boost).toBe(33)
    expect(lifted.has(g)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
    expect(lifted.mut(g).boost).toBe(33)
    expect(g.flags['special.lift']).toEqual({ boost: 33 })
  })

  it('mut creates, stamps, migrates in place and prunes stale keys', () => {
    const fresh = store.mut(g)
    expect(g.flags[FLAG]).toBe(fresh)
    expect([fresh.v, fresh.owner, fresh.standing, fresh.score]).toEqual([2, ownerKey(g), 20, 0])

    g.flags[FLAG] = { owner: ownerKey(g), v: 1, score: 60, stale: 1 }
    const live = g.flags[FLAG]
    const s = store.mut(g)
    expect(s).toBe(live)
    expect(g.flags[FLAG]).toBe(s)
    expect([s.v, s.score, s.tier]).toEqual([2, 60, 2])
    expect('stale' in s).toBe(false)

    const once = JSON.stringify(g)
    store.mut(g)
    expect(JSON.stringify(g)).toBe(once)
  })

  it('mut upgrades a legacy owner key and keeps the record', () => {
    const c = g.character
    g.flags[FLAG] = { owner: `${c.id}:${c.firstName}:${c.lastName}:${g.year - c.age}`, v: 2, score: 41, tier: 1 }
    const s = store.mut(g)
    expect(s.owner).toBe(ownerKey(g))
    expect(s.score).toBe(41)
  })

  it('claimSettle is false the second time for one (year, age) [RF3]', () => {
    const s = store.mut(g)
    expect(claimSettle(s, g)).toBe(true)
    expect([s.settledYear, s.settledAge]).toEqual([g.year, g.character.age])
    expect(claimSettle(s, g)).toBe(false)
    expect(claimSettle(s, g)).toBe(false)
    g.year += 1
    expect(claimSettle(s, g)).toBe(true)
    expect(claimSettle(s, g)).toBe(false)
    g.character.age += 1
    expect(claimSettle(s, g)).toBe(true)
  })

  it('nextId increments and caps at 1e9; cap keeps the newest; appointmentId(null) is empty', () => {
    const s = { seq: 0 } as Stamped
    expect([nextId(s, 'p'), nextId(s, 'p'), s.seq]).toEqual(['p1', 'p2', 2])
    s.seq = 1e9
    nextId(s, 'p')
    expect(s.seq).toBe(1e9)
    expect(cap([1, 2, 3, 4, 5], 2)).toEqual([4, 5])
    expect(cap([1, 2], 5)).toEqual([1, 2])
    expect(cap([1, 2], 0)).toEqual([])
    expect(appointmentId(null)).toBe('')
    expect(appointmentId({ data: { appointmentId: 'job-7' } } as unknown as Job)).toBe('job-7')
    expect(appointmentId({ data: { appointmentId: 7 } } as unknown as Job)).toBe('')
    expect(appointmentId({} as Job)).toBe('')
  })
})

describe('career state readers', () => {
  it('rec and arr give empty containers for junk', () => {
    expect([rec(null), rec([]), rec('x'), rec({ a: 1 })]).toEqual([{}, {}, {}, { a: 1 }])
    expect([arr(null), arr({}), arr([1])]).toEqual([[], [], [1]])
  })

  it('int and flt round, clamp and fall back on junk', () => {
    expect([int('x', 5, 0, 10), int(NaN, 5, 0, 10), int(Infinity, 5, 0, 10), int(null, 5, 0, 10)]).toEqual([5, 5, 5, 5])
    expect([int(7.6, 0, 0, 10), int(-3, 0, 0, 10), int(1e9, 0, 0, 10)]).toEqual([8, 0, 10])
    expect([flt(0.25, 0, 0, 1), flt(5, 0, 0, 1), flt('x', 0.5, 0, 1)]).toEqual([0.25, 1, 0.5])
  })

  it('txt strips control characters, trims and cuts', () => {
    expect(txt('  a\u0000b\u0007c  ', 10)).toBe('abc')
    expect(txt(big(100), 10)).toBe(big(10))
    expect([txt(5, 10), txt(null, 10, 'd'), txt(undefined, 10)]).toEqual(['', 'd', ''])
    expect(txt('line\nbreak', 20)).toBe('linebreak')
  })

  it('readRows keeps well-formed rows only and readMemory dedupes by id', () => {
    expect(readRows('x')).toEqual([])
    expect(readRows([{ y: 2001, income: 5.6, spent: 2, rank: 3, of: 9, standing: 61, note: 'ok' }, { income: 1 }, 4])).toEqual([
      { y: 2001, income: 6, spent: 2, rank: 3, of: 9, standing: 61, note: 'ok' },
    ])
    const m = readMemory([{ id: 'a', name: 'A', met: 1 }, { id: 'a', name: 'A2', met: 3, grudge: 5 }, { id: 'b', name: 'B' }])
    expect(m.map((x) => [x.id, x.name, x.met, x.grudge])).toEqual([['a', 'A2', 3, 5], ['b', 'B', 0, 0]])
  })
})
