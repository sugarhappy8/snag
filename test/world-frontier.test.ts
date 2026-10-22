// ci: fast
// R3-F1 (C.6 a): the world frontier shard (src/game/world/frontier.ts): g.world.frontier, a bounded, versioned, registered shard with a
// total reader and one writer, applyDisclosure. Nothing calls the writer yet, so no life changes.
//
// What this file pins: the hostile reads (a valid shard comes back as itself, anything else as a valid one, never more than the node
// cap, never a throw), the order of the writer's refusals and that a refusal writes nothing, the caps (2 years in a year, 12 years in
// all, 6 points of spill a disclosure, 18 held), luck that is a pure function of the life, the year and the origin, the fold of old
// rows into `fold` with the lead kept, the writer on a deep-frozen shard root, reads that touch nothing, the world invariant and the
// budget, and the stream row the first draw needs. No g.rng is drawn anywhere.
import { describe, expect, it, vi } from 'vitest'
import { hashKey } from '../src/game/kernel/streams'
import type { GameState } from '../src/game/types'
import { FRONTIER_CAPS } from '../src/game/world/caps'
import { worldBudget } from '../src/game/world/budget'
import {
  applyDisclosure,
  frontierLead,
  frontierProblems,
  frontierRows,
  frontierSpill,
  gainLuck,
  lastPush,
  normalizeFrontier,
  originKey,
  readFrontier,
  type Disclosure,
  type FieldRec,
  type FrontierRow,
  type FrontierShard,
} from '../src/game/world/frontier'
import { FIELDS, FIELD_IDS, type FieldId } from '../src/game/world/frontier-fields'
import { worldProblems } from '../src/game/world/invariants'
import '../src/game/world/shards'
import { nodeCount, normalizeWorld, readWorld, shardNames } from '../src/game/world/state'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { STREAM_SLICES } from './stream-tap'

/** A fresh state in `year` (the writer refuses a year after g.year). */
function life(year = 2030, lifeId = 'test-life'): GameState {
  const g = makeTestGame(1)
  g.year = year
  g.lifeId = lifeId
  return g
}

/** A fresh state whose `world` is exactly `{ v: 1, frontier }`. */
function lifeWith(frontier: unknown, year = 2030): GameState {
  const g = life(year)
  ;(g as { world?: unknown }).world = { v: 1, frontier }
  return g
}

const disc = (over: Partial<Disclosure> = {}): Disclosure => ({ field: 'fusion', year: 2030, size: 0.5, origin: 'wave:a', by: 'you', ...over })
const row = (y: number, o: string, over: Partial<FrontierRow> = {}): FrontierRow => ({ y, w: 'you', m: 'world', d: 50, o, ...over })
const rec = (over: Partial<FieldRec> = {}): FieldRec => ({ fold: 0, pub: 0, ly: 2030, rows: [], ...over })
const shardOf = (f: FrontierShard['f'], y = 0): FrontierShard => ({ v: 1, y, f })

const nodes = (x: unknown): number => nodeCount(x, 1_000_000)
const recOf = (g: GameState, field: FieldId): FieldRec | undefined => readFrontier(g).f[field]
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

/** The most nodes a shard may have after normalization (the plan's 20 fields x 24 rows, each row 7 nodes at most). */
const NODES_MAX = 3_600

/** The rest of a state, without the world: what a refusal and a read must not touch. */
const withoutWorld = (g: GameState): string => JSON.stringify({ ...g, world: undefined })

describe('the constants', () => {
  it('names the caps in one place', () => {
    expect(FRONTIER_CAPS).toEqual({ leadYears: 12, yearYears: 2, spillPoints: 18, spillPerDisclosure: 6, rowsPerMarket: 6, marketsPerField: 4, fields: 32 })
  })

  it('registers the shard, and the hub has it', () => {
    expect(shardNames()).toContain('frontier')
  })
})

describe('readFrontier on an absent or hostile world', () => {
  it('reads an absent shard as an empty one, frozen, and creates no world', () => {
    const g = life()
    expect(readFrontier(g)).toEqual({ v: 1, y: 0, f: {} })
    expect(Object.isFrozen(readFrontier(g))).toBe(true)
    expect(g.world).toBeUndefined()
    expect(frontierLead(g, 'fusion')).toBe(0)
    expect(frontierSpill(g, 'fusion')).toBe(0)
    expect(frontierRows(g, 'fusion')).toEqual([])
    expect(lastPush(g, 'fusion')).toBe(0)
    expect(g.world).toBeUndefined()
  })

  it('reads a field that is not one as zero, and a world with no shard as empty', () => {
    const g = lifeWith(undefined)
    for (const f of ['constructor', '__proto__', 'nope', '', 'toString']) {
      expect(frontierLead(g, f as FieldId), f).toBe(0)
      expect(frontierSpill(g, f as FieldId), f).toBe(0)
      expect(frontierRows(g, f as FieldId), f).toEqual([])
      expect(lastPush(g, f as FieldId), f).toBe(0)
    }
    expect(readFrontier(g)).toEqual({ v: 1, y: 0, f: {} })
  })

  const big = 'x'.repeat(10_000)
  const hostile: [string, unknown][] = [
    ['a number', 7],
    ['null', null],
    ['a string', 'frontier'],
    ['a list', [rec()]],
    ['a shard of another version', { v: 2, y: 0, f: { fusion: rec({ fold: 100 }) } }],
    ['no version', { y: 0, f: { fusion: rec({ fold: 100 }) } }],
    ['f as a list', { v: 1, y: 0, f: [rec({ fold: 100 })] }],
    ['f as a string', { v: 1, y: 0, f: 'fusion' }],
    ['f missing', { v: 1, y: 0 }],
    ['unknown field ids', { v: 1, y: 0, f: { nope: rec({ fold: 100 }), constructor: rec({ fold: 100 }), toString: rec({ fold: 100 }), 'ai.': rec({ fold: 100 }) } }],
    ['a field record that is a number', { v: 1, y: 0, f: { fusion: 5, chips: null, ai: 'x', space: [] } }],
    ['a year of x', { v: 1, y: 'x', f: { fusion: rec({ fold: 100 }) } }],
    ['rows with NaN and infinities', { v: 1, y: 0, f: { fusion: { fold: NaN, pub: Infinity, ly: -Infinity, rows: [row(NaN, 'a'), row(2030, 'b', { d: NaN }), row(2030, 'c', { d: Infinity }), row(2030.5, 'd')] } } }],
    ['rows dated 1999 and 2020', { v: 1, y: 0, f: { fusion: rec({ fold: 0, rows: [row(1999, 'a'), row(2020, 'b'), row(2026, 'c'), row(2027, 'd')] }) } }],
    ['a d of 1e9 and a fold of 1e9', { v: 1, y: 0, f: { fusion: { fold: 1e9, pub: 1e9, ly: 2030, rows: [row(2030, 'a', { d: 1e9 }), row(2031, 'b', { d: 1e9 })] } } }],
    ['negative numbers', { v: 1, y: 0, f: { fusion: { fold: -5, pub: -5, ly: -5, rows: [row(2030, 'a', { d: -50 })] } } }],
    ['10,000 rows', { v: 1, y: 0, f: { fusion: rec({ rows: Array.from({ length: 10_000 }, (_, i) => row(2027 + (i % 50), `o${i}`, { m: `m${i % 9}` })) }) } }],
    ['strings of 10,000 characters', { v: 1, y: 0, f: { fusion: rec({ rows: [row(2030, big), row(2030, 'a', { m: big }), { y: 2030, w: big, m: 'world', d: 5, o: 'b' } as unknown as FrontierRow] }) } }],
    ['rows that are not a list', { v: 1, y: 0, f: { fusion: { fold: 0, pub: 0, ly: 2030, rows: 'nope' } } }],
    ['a list of holes', { v: 1, y: 0, f: { fusion: { fold: 50, pub: 0, ly: 2030, rows: new Array(1000) } } }],
    ['rows that are not objects', { v: 1, y: 0, f: { fusion: rec({ fold: 50, rows: [null, 3, 'a', [], [row(2030, 'a')]] as unknown as FrontierRow[] }) } }],
    ['markets of the wrong shape', { v: 1, y: 0, f: { fusion: rec({ rows: [row(2030, 'a', { m: 'World' }), row(2030, 'b', { m: '1x' }), row(2030, 'c', { m: 'a b' }), row(2030, 'd', { m: '' })] }) } }],
    ['a deep nest', { v: 1, y: 0, f: { fusion: rec({ rows: [{ y: 2030, w: 'you', m: 'world', d: 5, o: 'a', extra: { a: { b: { c: [big, big] } } } }] as unknown as FrontierRow[] }) } }],
  ]
  for (const [name, raw] of hostile) {
    it(`reads ${name} as a valid shard, bounded, and never throws`, () => {
      const g = lifeWith(raw)
      let shard: Readonly<FrontierShard> | undefined
      expect(() => {
        shard = readFrontier(g)
      }).not.toThrow()
      expect(frontierProblems(shard)).toEqual([])
      expect(nodes(shard)).toBeLessThanOrEqual(NODES_MAX)
      // Idempotent: reading what a read gave changes nothing, and the same stored object reads as the same shard.
      expect(normalizeFrontier(shard)).toBe(shard)
      expect(readFrontier(g)).toBe(shard)
      for (const id of FIELD_IDS) {
        expect(frontierLead(g, id), id).toBeLessThanOrEqual(12)
        expect(frontierSpill(g, id), id).toBeLessThanOrEqual(18)
        expect(frontierRows(g, id).length, id).toBeLessThanOrEqual(FRONTIER_CAPS.rowsPerMarket * FRONTIER_CAPS.marketsPerField)
      }
    })
  }

  it('keeps a known field and leaves Object.prototype alone when a save carries __proto__', () => {
    const raw = JSON.parse('{"v":1,"y":0,"f":{"__proto__":{"fold":5,"pub":5,"ly":2030,"rows":[]},"fusion":{"fold":100,"pub":0,"ly":2030,"rows":[]}}}') as unknown
    const g = lifeWith(raw)
    const shard = readFrontier(g)
    expect(Object.keys(shard.f)).toEqual(['fusion'])
    expect(frontierLead(g, 'fusion')).toBe(1)
    expect(({} as Record<string, unknown>).fold).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(shard.f, '__proto__')).toBe(false)
  })

  it('drops the rows that are not valid and keeps the others', () => {
    const g = lifeWith(shardOf({ fusion: rec({ rows: [row(1999, 'a'), row(2020, 'b'), row(2026, 'c'), row(2027, 'd'), row(2031, 'e')] }) }))
    expect(frontierRows(g, 'fusion').map((r) => r.o)).toEqual(['d', 'e'])
  })

  it('cuts a d of 1e9 and a fold of 1e9 to a lead of 12 years, and pub to 18 points', () => {
    const g = lifeWith({ v: 1, y: 0, f: { fusion: { fold: 1e9, pub: 1e9, ly: 2030, rows: [row(2030, 'a', { d: 1e9 })] } } })
    expect(frontierLead(g, 'fusion')).toBe(12)
    expect(frontierSpill(g, 'fusion')).toBe(18)
    expect(recOf(g, 'fusion')!.pub).toBe(180)
  })

  it('returns 24 rows of a 10,000-row list: 6 in each of the 4 newest markets, the rest folded into fold', () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => row(2027 + (i % 50), `o${i}`, { m: `m${i % 9}`, d: 0 }))
    const g = lifeWith(shardOf({ fusion: rec({ rows }) }))
    expect(frontierRows(g, 'fusion').length).toBeLessThanOrEqual(24)
    const markets = new Set(frontierRows(g, 'fusion').map((r) => r.m))
    expect(markets.size).toBeLessThanOrEqual(4)
  })

  it('forces d to 0 and fold to 0 on a field that has no lead (the AI capabilities), and keeps its pub', () => {
    const g = lifeWith(shardOf({ 'ai.coding': rec({ fold: 500, pub: 20, rows: [row(2030, 'a', { d: 300 })] }) }))
    const r = recOf(g, 'ai.coding')!
    expect(r.fold).toBe(0)
    expect(r.rows.map((x) => x.d)).toEqual([0])
    expect(r.pub).toBe(20)
    expect(frontierLead(g, 'ai.coding')).toBe(0)
    expect(frontierSpill(g, 'ai.coding')).toBe(2)
  })

  it('drops an empty field, dedupes a year and an origin, and sorts the rows by year', () => {
    const g = lifeWith(shardOf({ chips: rec({ ly: 0 }), fusion: rec({ rows: [row(2032, 'b'), row(2030, 'a'), row(2030, 'a', { d: 99 }), row(2031, 'a')] }) }))
    expect(Object.keys(readFrontier(g).f)).toEqual(['fusion'])
    expect(frontierRows(g, 'fusion').map((r) => [r.y, r.o, r.d])).toEqual([
      [2030, 'a', 50],
      [2031, 'a', 50],
      [2032, 'b', 50],
    ])
  })

  it('keeps ly at or after the newest row', () => {
    const g = lifeWith(shardOf({ fusion: rec({ ly: 2028, rows: [row(2031, 'a')] }) }))
    expect(lastPush(g, 'fusion')).toBe(2031)
  })

  it('does not change what is stored, and creates nothing', () => {
    const raw = { v: 1, y: 0, f: { fusion: rec({ rows: [row(2032, 'b'), row(1999, 'a')] }) } }
    const g = lifeWith(raw)
    const before = JSON.stringify(g.world)
    readFrontier(g)
    frontierLead(g, 'fusion')
    expect(JSON.stringify(g.world)).toBe(before)
  })
})

describe('a valid shard comes back as itself', () => {
  it('returns the stored object for what the writer wrote, so a read costs nothing', () => {
    const g = life()
    expect(applyDisclosure(g, disc())).toMatchObject({ applied: true })
    const stored = readWorld(g).frontier
    expect(normalizeFrontier(stored)).toBe(stored)
    expect(readFrontier(g)).toBe(stored)
  })

  it('does not care about the order of keys in a valid shard', () => {
    const raw = { f: { fusion: { rows: [{ o: 'a', d: 50, m: 'world', w: 'you', y: 2030 }], ly: 2030, pub: 20, fold: 10 } }, y: 0, v: 1 }
    expect(normalizeFrontier(raw)).toBe(raw)
  })

  it('returns a copy, not the input, when anything in it had to change', () => {
    const raw = shardOf({ fusion: rec({ pub: 999 }) })
    const out = normalizeFrontier(raw)
    expect(out).not.toBe(raw)
    expect(out.f.fusion!.pub).toBe(180)
    expect(raw.f.fusion!.pub).toBe(999)
  })
})

describe('applyDisclosure refuses, in order, and writes nothing', () => {
  const refused = (g: GameState, d: Disclosure, why: string): void => {
    const before = JSON.stringify(g)
    const rng = g.rng
    const id = g.nextId
    expect(applyDisclosure(g, d)).toEqual({ applied: false, why })
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(id)
  }

  it('says bad for a field that is not one, a size that is not a number, an origin that is empty or long, a market that does not fit, a year that is not whole', () => {
    const bad: Partial<Disclosure>[] = [
      { field: 'nope' as FieldId },
      { field: 'constructor' as FieldId },
      { field: '__proto__' as FieldId },
      { field: 3 as unknown as FieldId },
      { size: NaN },
      { size: Infinity },
      { size: -Infinity },
      { size: '0.5' as unknown as number },
      { origin: '' },
      { origin: 'x'.repeat(65) },
      { origin: 5 as unknown as string },
      { market: 'World' },
      { market: '1x' },
      { market: 'a b' },
      { market: 'x'.repeat(17) },
      { market: '' },
      { market: 3 as unknown as string },
      { year: 2030.5 },
      { year: NaN },
      { year: '2030' as unknown as number },
      { by: 'me' as 'you' },
      { shield: 'junk' as 'open' },
    ]
    for (const over of bad) refused(life(), disc(over), 'bad')
    refused(life(), null as unknown as Disclosure, 'bad')
    refused(life(), 'x' as unknown as Disclosure, 'bad')
  })

  it('takes an origin of 64 characters and a market of 16', () => {
    const g = life()
    expect(applyDisclosure(g, disc({ origin: 'x'.repeat(64), market: 'a'.repeat(16) }))).toMatchObject({ applied: true })
  })

  it('says history for 2026 and every year before it: history stays fixed', () => {
    for (const year of [2026, 2025, 2020, 1999, 1900]) refused(life(2030), disc({ year }), 'history')
    refused(life(2026), disc({ year: 2026 }), 'history')
  })

  it('says future for a year after g.year: no foresight', () => {
    refused(life(2030), disc({ year: 2031 }), 'future')
    refused(life(2030), disc({ year: 2100 }), 'future')
  })

  it('says secret for a secret disclosure, and the secret is refused before the repeat', () => {
    refused(life(), disc({ shield: 'secret' }), 'secret')
    const g = life()
    expect(applyDisclosure(g, disc())).toMatchObject({ applied: true })
    refused(g, disc({ shield: 'secret' }), 'secret')
  })

  it('says repeat for the same year and origin, in any market, and takes the same origin for another field or another year', () => {
    const g = life()
    expect(applyDisclosure(g, disc())).toMatchObject({ applied: true })
    refused(g, disc(), 'repeat')
    refused(g, disc({ size: 1, market: 'us' }), 'repeat')
    refused(g, disc({ by: 'rival' }), 'repeat')
    expect(applyDisclosure(g, disc({ field: 'chips' }))).toMatchObject({ applied: true })
    g.year = 2031
    expect(applyDisclosure(g, disc({ year: 2031 }))).toMatchObject({ applied: true })
  })

  it('checks bad before history, history before future, future before secret', () => {
    refused(life(2030), disc({ field: 'nope' as FieldId, year: 2020 }), 'bad')
    refused(life(2020), disc({ year: 2025, shield: 'secret' }), 'history')
    refused(life(2030), disc({ year: 2031, shield: 'secret' }), 'future')
  })

  it('creates no world on a refusal (an old save and a life up to 2026 have no frontier key)', () => {
    const g = life(2026)
    for (const d of [disc({ year: 2026 }), disc({ field: 'x' as FieldId }), disc({ shield: 'secret' })]) applyDisclosure(g, d)
    expect(g.world).toBeUndefined()
  })
})

describe('applyDisclosure writes one row, and one luck draw makes its lead', () => {
  it('creates the world and the shard on the first push, and reports what it added', () => {
    const g = life()
    const r = applyDisclosure(g, disc({ size: 0.5, shield: 'open' }))
    expect(r.applied).toBe(true)
    const w = g.world!
    expect(Object.keys(w).sort()).toEqual(['frontier', 'v'])
    const shard = readFrontier(g)
    expect(shard.v).toBe(1)
    expect(shard.y).toBe(0)
    expect(Object.keys(shard.f)).toEqual(['fusion'])
    const f = shard.f.fusion!
    expect(f.rows).toEqual([{ y: 2030, w: 'you', m: 'world', d: f.rows[0]!.d, o: originKey('wave:a') }])
    expect(f.ly).toBe(2030)
    if (r.applied) {
      expect(r.lead).toBe(f.rows[0]!.d)
      expect(r.spill).toBe(f.pub)
    }
  })

  it('uses hashKey in base 36 for the origin, so the same text is the same row', () => {
    expect(originKey('wave:a')).toBe(hashKey('wave:a').toString(36))
    expect(originKey('wave:a')).toMatch(/^[a-z0-9-]{1,8}$/)
    expect(originKey('wave:a')).not.toBe(originKey('wave:b'))
  })

  it('makes the lead round(base x size x (0.8 + 0.4 u)) centi-years, base 200 for you and 150 for a rival', () => {
    for (const [by, base] of [['you', 200], ['rival', 150]] as const) {
      for (const size of [0.05, 0.2, 0.35, 0.5, 0.75, 1]) {
        const g = life()
        const u = gainLuck(g, 'fusion', originKey('o1'), 2030)
        const r = applyDisclosure(g, disc({ origin: 'o1', size, by }))
        const want = Math.min(200, Math.round(base * size * (0.8 + 0.4 * u)))
        expect(r, `${by} ${size}`).toMatchObject({ applied: true, lead: want })
        expect(frontierLead(g, 'fusion')).toBe(want / 100)
        expect(want).toBeGreaterThanOrEqual(Math.min(200, Math.round(base * size * 0.8)))
        expect(want).toBeLessThanOrEqual(Math.min(200, Math.round(base * size * 1.2)))
      }
    }
  })

  it('treats a size above 1 as 1 and a size below 0 as 0', () => {
    const a = life()
    const b = life()
    applyDisclosure(a, disc({ size: 7 }))
    applyDisclosure(b, disc({ size: 1 }))
    expect(readFrontier(a)).toEqual(readFrontier(b))
    const c = life()
    expect(applyDisclosure(c, disc({ size: -3 }))).toMatchObject({ applied: true, lead: 0 })
    expect(frontierRows(c, 'fusion').map((r) => r.d)).toEqual([0])
  })

  it('writes the row even when it adds no lead (d is 0), and a repeat of it is refused', () => {
    const g = life()
    expect(applyDisclosure(g, disc({ size: 0 }))).toMatchObject({ applied: true, lead: 0 })
    expect(frontierRows(g, 'fusion')).toHaveLength(1)
    expect(applyDisclosure(g, disc({ size: 0 }))).toEqual({ applied: false, why: 'repeat' })
  })

  it('defaults the market to world and keeps the one it is given', () => {
    const g = life()
    applyDisclosure(g, disc({ origin: 'a' }))
    applyDisclosure(g, disc({ origin: 'b', market: 'us' }))
    expect(frontierRows(g, 'fusion').map((r) => r.m).sort()).toEqual(['us', 'world'])
  })

  it('records who pushed: you or a rival', () => {
    const g = life()
    applyDisclosure(g, disc({ origin: 'a', by: 'you' }))
    applyDisclosure(g, disc({ origin: 'b', by: 'rival' }))
    expect(frontierRows(g, 'fusion').map((r) => r.w).sort()).toEqual(['rival', 'you'])
  })

  it('gives a field with no lead (an AI capability) spill and a row, and no lead', () => {
    const g = life()
    const r = applyDisclosure(g, disc({ field: 'ai.reasoning', size: 1, shield: 'open' }))
    expect(r).toEqual({ applied: true, lead: 0, spill: 60 })
    expect(frontierLead(g, 'ai.reasoning')).toBe(0)
    expect(frontierSpill(g, 'ai.reasoning')).toBe(6)
    expect(frontierRows(g, 'ai.reasoning').map((x) => x.d)).toEqual([0])
    expect(recOf(g, 'ai.reasoning')!.fold).toBe(0)
    expect(FIELDS['ai.reasoning'].lead).toBe(false)
  })

  it('leaves shard.y alone (the yearly step stamps it), and the world root y too', () => {
    const g = life()
    applyDisclosure(g, disc())
    expect(readFrontier(g).y).toBe(0)
    expect(readWorld(g).y).toBeUndefined()
  })

  it('writes in field order, so a shard it wrote is a shard the reader keeps as it is', () => {
    const g = life()
    for (const field of ['quantum', 'ai', 'fusion', 'chips'] as const) applyDisclosure(g, disc({ field }))
    expect(Object.keys(readFrontier(g).f)).toEqual(FIELD_IDS.filter((id) => ['quantum', 'ai', 'fusion', 'chips'].includes(id)))
  })

  it('draws nothing from g.rng, the clock or Math.random, and changes nothing but g.world', () => {
    const g = life()
    const spy = vi.spyOn(Math, 'random')
    try {
      const rng = g.rng
      const id = g.nextId
      const rest = withoutWorld(g)
      applyDisclosure(g, disc())
      expect(g.rng).toBe(rng)
      expect(g.nextId).toBe(id)
      expect(withoutWorld(g)).toBe(rest)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('takes a push dated in an earlier year than the last one, and keeps ly at the newest', () => {
    const g = life(2032)
    applyDisclosure(g, disc({ year: 2032, origin: 'late' }))
    expect(applyDisclosure(g, disc({ year: 2030, origin: 'early' }))).toMatchObject({ applied: true })
    expect(lastPush(g, 'fusion')).toBe(2032)
    expect(frontierRows(g, 'fusion').map((r) => r.y)).toEqual([2030, 2032])
  })
})

describe('the caps', () => {
  it('gives a field at most 2.00 years in a year, however many disclosures there are', () => {
    const g = life()
    let total = 0
    for (let i = 0; i < 100; i++) {
      const r = applyDisclosure(g, disc({ origin: `o${i}`, size: 1 }))
      if (r.applied) total += r.lead
      expect(frontierLead(g, 'fusion'), `after ${i + 1}`).toBeLessThanOrEqual(2)
    }
    expect(frontierLead(g, 'fusion')).toBe(2)
    expect(total).toBe(200)
  })

  it('holds that cap when every disclosure is in one market and the rows fold (the room does not come back)', () => {
    const g = life()
    for (let i = 0; i < 40; i++) applyDisclosure(g, disc({ origin: `o${i}`, size: 1, market: 'us' }))
    expect(frontierRows(g, 'fusion').length).toBeLessThanOrEqual(6)
    expect(frontierLead(g, 'fusion')).toBe(2)
  })

  it('holds that cap when the disclosures spread over six markets, so a whole market folds away in the year', () => {
    const g = life()
    for (let i = 0; i < 60; i++) applyDisclosure(g, disc({ origin: `o${i}`, size: 1, market: `m${i % 6}` }))
    expect(new Set(frontierRows(g, 'fusion').map((r) => r.m)).size).toBeLessThanOrEqual(4)
    expect(frontierLead(g, 'fusion')).toBe(2)
  })

  it('shares the year between you and a rival', () => {
    const g = life()
    applyDisclosure(g, disc({ origin: 'a', size: 1 }))
    applyDisclosure(g, disc({ origin: 'b', size: 1 }))
    expect(applyDisclosure(g, disc({ origin: 'c', size: 1, by: 'rival' }))).toMatchObject({ applied: true, lead: 0 })
    expect(frontierLead(g, 'fusion')).toBe(2)
  })

  it('gives another field its own 2.00', () => {
    const g = life()
    for (let i = 0; i < 10; i++) applyDisclosure(g, disc({ field: 'fusion', origin: `o${i}`, size: 1 }))
    for (let i = 0; i < 10; i++) applyDisclosure(g, disc({ field: 'quantum', origin: `o${i}`, size: 1 }))
    expect(frontierLead(g, 'fusion')).toBe(2)
    expect(frontierLead(g, 'quantum')).toBe(2)
  })

  it('opens the room again the next year, and stops at 12.00 years over twenty years and more', () => {
    const g = life(2027)
    let last = 0
    for (let year = 2027; year <= 2050; year++) {
      g.year = year
      for (let i = 0; i < 100; i++) applyDisclosure(g, disc({ year, origin: `o${year}-${i}`, size: 1 }))
      const lead = frontierLead(g, 'fusion')
      expect(lead - last, String(year)).toBeLessThanOrEqual(2)
      expect(lead, String(year)).toBeLessThanOrEqual(12)
      expect(lead, String(year)).toBeGreaterThanOrEqual(last)
      last = lead
    }
    expect(last).toBe(12)
    expect(frontierRows(g, 'fusion').length).toBeLessThanOrEqual(24)
    expect(frontierProblems(readWorld(g).frontier)).toEqual([])
  })

  it('cuts a gain to the room under 12.00, so the lead lands on 12.00 and not over it', () => {
    const g = life(2027)
    for (let year = 2027; year <= 2033; year++) {
      g.year = year
      for (let i = 0; i < 4; i++) applyDisclosure(g, disc({ year, origin: `o${year}-${i}`, size: 1 }))
    }
    expect(frontierLead(g, 'fusion')).toBe(12)
    g.year = 2034
    expect(applyDisclosure(g, disc({ year: 2034, origin: 'more', size: 1 }))).toMatchObject({ applied: true, lead: 0 })
    expect(frontierLead(g, 'fusion')).toBe(12)
  })

  it('gives at most 6 points of spill to one disclosure, over a grid of sizes and the three shields', () => {
    for (let n = 1; n <= 20; n++) {
      const size = n / 20
      for (const shield of ['open', 'patent', undefined] as const) {
        const g = life()
        const r = applyDisclosure(g, disc({ size, shield }))
        const factor = shield === 'open' ? 1 : 0.5
        const want = Math.round(10 * (1 + 5 * size) * factor)
        expect(r, `${size} ${String(shield)}`).toMatchObject({ applied: true, spill: want })
        expect(want).toBeLessThanOrEqual(60)
        expect(recOf(g, 'fusion')!.pub).toBe(want)
        expect(frontierSpill(g, 'fusion')).toBeLessThanOrEqual(6)
      }
    }
  })

  it('holds 18 points of public research and no more, and the writer says what it really added', () => {
    const g = life()
    let total = 0
    for (let i = 0; i < 100; i++) {
      const r = applyDisclosure(g, disc({ origin: `o${i}`, size: 1, shield: 'open' }))
      if (r.applied) total += r.spill
      expect(recOf(g, 'fusion')!.pub).toBeLessThanOrEqual(180)
    }
    expect(recOf(g, 'fusion')!.pub).toBe(180)
    expect(total).toBe(180)
    expect(frontierSpill(g, 'fusion')).toBe(18)
  })
})

describe('luck is a pure function of the family, the year and the origin', () => {
  it('gives the same gain on two clones, and on an heir of the same family', () => {
    const g = life()
    const a = structuredClone(g)
    const b = structuredClone(g)
    const heir = life(2030, 'test-life-g2')
    for (const x of [a, b, heir]) applyDisclosure(x, disc({ size: 0.5 }))
    expect(readFrontier(a)).toEqual(readFrontier(b))
    expect(readFrontier(heir)).toEqual(readFrontier(a))
  })

  it('gives another life another gain, at least sometimes', () => {
    const gains = new Set<number>()
    for (let i = 0; i < 12; i++) {
      const g = life(2030, `life-${i}`)
      const r = applyDisclosure(g, disc({ size: 0.5 }))
      if (r.applied) gains.add(r.lead)
    }
    expect(gains.size).toBeGreaterThan(1)
    for (const d of gains) {
      expect(d).toBeGreaterThanOrEqual(80)
      expect(d).toBeLessThanOrEqual(120)
    }
  })

  it('gives another origin, field and year another number', () => {
    const g = life()
    const draws = new Set<number>()
    for (const [field, o, year] of [['fusion', 'a', 2030], ['fusion', 'b', 2030], ['chips', 'a', 2030], ['fusion', 'a', 2029], ['fusion', 'a', 2031]] as const) draws.add(gainLuck(g, field, originKey(o), year))
    expect(draws.size).toBe(5)
    for (const d of draws) {
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThan(1)
    }
  })

  it('gives the same number twice for the same arguments, and draws nothing from g.rng', () => {
    const g = life()
    const rng = g.rng
    expect(gainLuck(g, 'fusion', 'abc', 2030)).toBe(gainLuck(g, 'fusion', 'abc', 2030))
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(0)
  })

  it('re-rolls the year a Time Machine jump lands in and the years after it, and keeps every year that was finished before it', () => {
    const plain = life(2031)
    const forked = life(2031)
    forked.flags.timelineForks = [{ year: 2030, salt: 'abc' }]
    const origins = Array.from({ length: 8 }, (_, i) => originKey(`o${i}`))
    const draws = (g: GameState, year: number): number[] => origins.map((o) => gainLuck(g, 'fusion', o, year))
    // A year before the jump point keeps its luck.
    expect(draws(forked, 2029)).toEqual(draws(plain, 2029))
    // The year of the jump and the one after it do not.
    expect(draws(forked, 2030)).not.toEqual(draws(plain, 2030))
    expect(draws(forked, 2031)).not.toEqual(draws(plain, 2031))
    // And the writer sees it: the same disclosure makes another gain for at least one origin.
    const gains = (g: GameState): number[] =>
      Array.from({ length: 8 }, (_, i) => {
        const x = structuredClone(g)
        const r = applyDisclosure(x, disc({ year: 2031, origin: `o${i}`, size: 0.5 }))
        return r.applied ? r.lead : -1
      })
    expect(gains(forked)).not.toEqual(gains(plain))
    const finished = (g: GameState): number[] =>
      Array.from({ length: 8 }, (_, i) => {
        const x = structuredClone(g)
        const r = applyDisclosure(x, disc({ year: 2029, origin: `o${i}`, size: 0.5 }))
        return r.applied ? r.lead : -1
      })
    expect(finished(forked)).toEqual(finished(plain))
  })
})

describe('old rows fold into fold, and the lead is never lost', () => {
  /** One disclosure a year in one market, 2030 on. */
  function run(years: number, market = 'world'): GameState {
    const g = life(2030)
    for (let i = 0; i < years; i++) {
      g.year = 2030 + i
      applyDisclosure(g, disc({ year: 2030 + i, origin: `o${i}`, size: 0.5, market }))
    }
    return g
  }

  it('keeps 6 rows of a market, folds the 7th into fold, and leaves the lead as it was', () => {
    const six = run(6)
    const seven = run(7)
    expect(frontierRows(six, 'fusion')).toHaveLength(6)
    expect(recOf(six, 'fusion')!.fold).toBe(0)
    expect(frontierRows(seven, 'fusion')).toHaveLength(6)
    const first = frontierRows(six, 'fusion')[0]!
    expect(frontierRows(seven, 'fusion').map((r) => r.y)).toEqual([2031, 2032, 2033, 2034, 2035, 2036])
    expect(recOf(seven, 'fusion')!.fold).toBe(first.d)
    // The lead of seven is the six plus the seventh gain: nothing folded was lost.
    const total = sum(frontierRows(seven, 'fusion').map((r) => r.d)) + recOf(seven, 'fusion')!.fold
    expect(frontierLead(seven, 'fusion') * 100).toBe(total)
    expect(frontierLead(seven, 'fusion')).toBeGreaterThan(frontierLead(six, 'fusion'))
  })

  it('keeps 4 markets of a field, newest by year, and folds the 5th into fold with the lead kept', () => {
    const g = life(2030)
    const gains: number[] = []
    for (let i = 0; i < 5; i++) {
      g.year = 2030 + i
      const r = applyDisclosure(g, disc({ year: 2030 + i, origin: `o${i}`, size: 0.5, market: `m${i}` }))
      if (r.applied) gains.push(r.lead)
    }
    const rows = frontierRows(g, 'fusion')
    expect(rows.map((r) => r.m)).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(recOf(g, 'fusion')!.fold).toBe(gains[0])
    expect(frontierLead(g, 'fusion') * 100).toBe(sum(gains))
  })

  it('keeps the lead of a long run of pushes in one field exactly: fold plus rows', () => {
    const g = run(20)
    const r = recOf(g, 'fusion')!
    expect(r.rows.length).toBeLessThanOrEqual(6)
    expect(frontierLead(g, 'fusion')).toBeLessThanOrEqual(12)
    expect(frontierLead(g, 'fusion') * 100).toBe(r.fold + sum(r.rows.map((x) => x.d)))
    expect(frontierProblems(readWorld(g).frontier)).toEqual([])
  })

  it('never has more than 24 rows in a field however the pushes are spread', () => {
    const g = life(2030)
    for (let i = 0; i < 200; i++) {
      g.year = 2030 + Math.floor(i / 5)
      applyDisclosure(g, disc({ year: g.year, origin: `o${i}`, size: 0.3, market: `m${i % 7}` }))
    }
    expect(frontierRows(g, 'fusion').length).toBeLessThanOrEqual(24)
    expect(new Set(frontierRows(g, 'fusion').map((r) => r.m)).size).toBeLessThanOrEqual(4)
    expect(frontierProblems(readWorld(g).frontier)).toEqual([])
  })
})

describe('the writer replaces the root and never edits it', () => {
  it('works on a state whose shard root is deep-frozen, and the old root is untouched', () => {
    const g = life()
    applyDisclosure(g, disc({ origin: 'a' }))
    const root = readWorld(g).frontier as FrontierShard
    deepFreeze(root)
    const before = JSON.stringify(root)
    expect(() => applyDisclosure(g, disc({ origin: 'b', year: 2030 }))).not.toThrow()
    expect(JSON.stringify(root)).toBe(before)
    expect(readWorld(g).frontier).not.toBe(root)
    expect(frontierRows(g, 'fusion')).toHaveLength(2)
  })

  it('works when a row folds out of a frozen root', () => {
    const g = life()
    for (let i = 0; i < 6; i++) {
      g.year = 2030 + i
      applyDisclosure(g, disc({ year: g.year, origin: `o${i}`, size: 0.5 }))
    }
    deepFreeze(readWorld(g).frontier)
    g.year = 2036
    expect(applyDisclosure(g, disc({ year: 2036, origin: 'o6', size: 0.5 }))).toMatchObject({ applied: true })
    expect(frontierRows(g, 'fusion')).toHaveLength(6)
  })

  it('writes nothing when it refuses, even on a frozen root', () => {
    const g = life()
    applyDisclosure(g, disc())
    deepFreeze(readWorld(g).frontier)
    const before = JSON.stringify(g)
    expect(applyDisclosure(g, disc())).toEqual({ applied: false, why: 'repeat' })
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('reads touch nothing', () => {
  it('reads a deep-frozen state with a shard without a write, and g.rng, g.nextId and g.world stay', () => {
    const g = life()
    for (const field of ['fusion', 'chips', 'ai.coding'] as const) applyDisclosure(g, disc({ field }))
    const frozen = deepFreeze(structuredClone(g))
    const json = JSON.stringify(frozen)
    const rng = frozen.rng
    const id = frozen.nextId
    for (const id2 of FIELD_IDS) {
      expect(() => {
        readFrontier(frozen)
        frontierLead(frozen, id2)
        frontierSpill(frozen, id2)
        frontierRows(frozen, id2)
        lastPush(frozen, id2)
      }, id2).not.toThrow()
    }
    expect(frozen.rng).toBe(rng)
    expect(frozen.nextId).toBe(id)
    expect(JSON.stringify(frozen)).toBe(json)
  })

  it('reads a deep-frozen state with no world and does not make one', () => {
    const frozen = deepFreeze(life())
    expect(frontierLead(frozen, 'fusion')).toBe(0)
    expect(readFrontier(frozen)).toEqual({ v: 1, y: 0, f: {} })
    expect(frozen.world).toBeUndefined()
  })

  it('reads the same numbers twice (same source, same number)', () => {
    const g = life()
    applyDisclosure(g, disc())
    expect([frontierLead(g, 'fusion'), frontierSpill(g, 'fusion'), lastPush(g, 'fusion')]).toEqual([frontierLead(g, 'fusion'), frontierSpill(g, 'fusion'), lastPush(g, 'fusion')])
    expect(frontierRows(g, 'fusion')).toBe(frontierRows(g, 'fusion'))
  })

  it('reads the lead in years with two places, the spill in whole points', () => {
    const g = lifeWith(shardOf({ fusion: rec({ fold: 123, pub: 77, rows: [row(2030, 'a', { d: 7 })] }) }))
    expect(frontierLead(g, 'fusion')).toBe(1.3)
    expect(Number.isInteger(frontierSpill(g, 'fusion'))).toBe(true)
    expect(frontierSpill(g, 'fusion')).toBe(8)
  })
})

describe('frontierProblems', () => {
  it('has nothing to say about an absent shard, an empty one, or one the writer wrote', () => {
    expect(frontierProblems(undefined)).toEqual([])
    expect(frontierProblems(shardOf({}))).toEqual([])
    const g = life()
    for (let i = 0; i < 9; i++) applyDisclosure(g, disc({ origin: `o${i}`, size: 1, market: `m${i % 3}` }))
    applyDisclosure(g, disc({ field: 'ai.coding' }))
    expect(frontierProblems(readWorld(g).frontier)).toEqual([])
  })

  it('names a lead over 12, a row in 2020, and a 7th row of a market', () => {
    const lead = frontierProblems(shardOf({ fusion: rec({ fold: 1300 }) }))
    expect(lead.some((p) => /fusion/.test(p) && /13\.00/.test(p) && /12/.test(p))).toBe(true)
    const old = frontierProblems(shardOf({ fusion: rec({ rows: [row(2020, 'a')] }) }))
    expect(old.some((p) => /fusion/.test(p) && /2020/.test(p))).toBe(true)
    const seven = frontierProblems(shardOf({ fusion: rec({ rows: Array.from({ length: 7 }, (_, i) => row(2030 + i, `o${i}`, { d: 1 })) }) }))
    expect(seven.some((p) => /fusion/.test(p) && /7 rows/.test(p) && /6/.test(p))).toBe(true)
  })

  it('names a 5th market, a pub over 18 points, an unknown field, a bad row, a repeated origin, rows out of order, and lead on an AI capability', () => {
    const markets = frontierProblems(shardOf({ fusion: rec({ rows: ['a', 'b', 'c', 'd', 'e'].map((m, i) => row(2030 + i, `o${i}`, { m, d: 1 })) }) }))
    expect(markets.some((p) => /5 markets/.test(p))).toBe(true)
    expect(frontierProblems(shardOf({ fusion: rec({ pub: 200 }) })).some((p) => /pub 200/.test(p))).toBe(true)
    expect(frontierProblems(shardOf({ nope: rec() } as unknown as FrontierShard['f'])).some((p) => /unknown field/.test(p) && /nope/.test(p))).toBe(true)
    expect(frontierProblems(shardOf({ fusion: rec({ rows: [{ y: 2030 } as FrontierRow] }) })).some((p) => /row 0/.test(p))).toBe(true)
    expect(frontierProblems(shardOf({ fusion: rec({ rows: [row(2030, 'a'), row(2030, 'a', { m: 'us' })] }) })).some((p) => /repeats/.test(p))).toBe(true)
    expect(frontierProblems(shardOf({ fusion: rec({ rows: [row(2031, 'a'), row(2030, 'b')] }) })).some((p) => /order/.test(p))).toBe(true)
    expect(frontierProblems(shardOf({ 'ai.coding': rec({ fold: 100 }) })).some((p) => /ai\.coding/.test(p) && /no lead/.test(p))).toBe(true)
  })

  it('names a shard that is not one, and a hostile one without throwing or listing more than a few dozen lines', () => {
    expect(frontierProblems(7).length).toBeGreaterThan(0)
    expect(frontierProblems([]).length).toBeGreaterThan(0)
    expect(frontierProblems({ v: 2, y: 0, f: {} }).length).toBeGreaterThan(0)
    expect(frontierProblems({ v: 1, y: 0, f: 'x' }).length).toBeGreaterThan(0)
    const hostile = shardOf({ fusion: rec({ rows: Array.from({ length: 10_000 }, (_, i) => row(2020, `o${i}`)) }) })
    let lines: string[] = []
    expect(() => {
      lines = frontierProblems(hostile)
    }).not.toThrow()
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThanOrEqual(64)
    for (const l of lines) expect(l.length).toBeLessThan(200)
  })

  it('feeds worldProblems, as "frontier: ..." lines, and a clean world has none', () => {
    const g = life()
    applyDisclosure(g, disc())
    expect(worldProblems(g).filter((p) => p.startsWith('frontier'))).toEqual([])
    ;(g.world as Record<string, unknown>).frontier = shardOf({ fusion: rec({ fold: 1300, rows: [row(2020, 'a')] }) })
    const lines = worldProblems(g).filter((p) => p.startsWith('frontier: '))
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })
})

describe('the world around the shard', () => {
  /** The plan's worst case: every field at its caps. Lead fields: 4 markets of 6 rows at 50 centi-years (12.00 years), every row followed. */
  function worst(): FrontierShard {
    const f: FrontierShard['f'] = {}
    for (const id of FIELD_IDS) {
      const lead = FIELDS[id].lead
      const rows: FrontierRow[] = []
      for (let m = 0; m < 4; m++) for (let i = 0; i < 6; i++) rows.push({ y: 2030 + i, w: i % 2 ? 'you' : 'rival', m: `m${m}`, d: lead ? 50 : 0, o: `${m}${i}x`, f: 1 })
      rows.sort((a, b) => a.y - b.y)
      f[id] = lead ? { fold: 0, pub: 180, ly: 2035, yg: 200, rows } : { fold: 0, pub: 180, ly: 2035, rows }
    }
    return { v: 1, y: 2035, f }
  }

  it('keeps a 20-field worst case as it is, in at most 3,600 nodes', () => {
    const shard = worst()
    expect(normalizeFrontier(shard)).toBe(shard)
    expect(frontierProblems(shard)).toEqual([])
    expect(nodes(shard)).toBeLessThanOrEqual(NODES_MAX)
    expect(nodes(shard)).toBeGreaterThan(3_000)
    for (const id of FIELD_IDS) expect(frontierLead(lifeWith(shard), id)).toBe(FIELDS[id].lead ? 12 : 0)
  })

  it('stays inside the world budget, and normalizeWorld keeps the shard whole', () => {
    const shard = worst()
    const g = lifeWith(shard)
    const b = worldBudget(g)
    expect(b.over).toEqual([])
    expect(b.nodes.frontier).toBe(nodes(shard))
    expect(b.total).toBeLessThan(25_000)
    expect(normalizeWorld(g.world).frontier).toEqual(shard)
    expect(worldProblems(g).filter((p) => p.startsWith('frontier'))).toEqual([])
  })

  it('reports a shard written around its reader that has too many rows', () => {
    const g = lifeWith(shardOf({ fusion: rec({ rows: Array.from({ length: 800 }, (_, i) => row(2030, `o${i}`)) }) }))
    expect(worldBudget(g).over.some((l) => /frontier/.test(l) && /rows/.test(l))).toBe(true)
  })

  it('keeps nothing when a world is normalized without a frontier key, and a hostile one comes out valid', () => {
    expect(Object.keys(normalizeWorld({ v: 1 }))).toEqual(['v'])
    const n = normalizeWorld({ v: 1, frontier: { v: 1, y: 0, f: { fusion: { fold: 1e9, pub: 1e9, ly: 2030, rows: [] } } } })
    expect(frontierProblems(n.frontier)).toEqual([])
  })

  it('has a field of the table for every key a shard keeps', () => {
    const g = life()
    for (const id of FIELD_IDS) applyDisclosure(g, disc({ field: id, origin: `o-${id}` }))
    expect(Object.keys(readFrontier(g).f)).toEqual([...FIELD_IDS])
  })
})

describe('the stream row', () => {
  it('has a row for the frontier tag in the stream table, driven, with the slices its output will reach', () => {
    const row = STREAM_SLICES.frontier
    expect(row).toBeDefined()
    expect(row!.driven).toBe(true)
    expect(row!.slices).toEqual(['world', 'flagsPersonal', 'text'])
    expect(row!.why.length).toBeGreaterThanOrEqual(12)
  })
})
