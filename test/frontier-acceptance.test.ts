// R3-F7 (C.6 g): the acceptance of the world frontier, run once on the merged track (F1 to F6). The 200-year probe at maximum
// inputs, the 100x ceiling rows, replay, heirs, old saves, history fixed, hostile shards and the docs. No single task owns any of it.
//
// The frontier half of the roadmap's 200-year probe: one founder with companies in five deep-tech trades plays the years 2027 to
// 2226 by direct steps (stepFrontier, advanceTechWaves, landRivalWaves, then 20 disclosures of size 1 by both sides over the 12
// lead fields and 5 calls of the port business.discloseResearch, a year). After every year the world is sound, no field is past
// its caps (12 years of lead and at most 2 gained in a year, 18 points of public research, 24 rows), at most 2 waves of the year
// came from the player's side, `g.rng` and `g.nextId` are where they started, every future idea's deadline is inside
// [from + 10, from + 40], and the frontier booked no money. At the end the shard is at most 3,600 nodes and the world is inside
// its budget, and the real rival landings of the run pushed the AI field. (The `k` and knowledge halves are Effort core's.)
//
// Then: the same run twice, a structuredClone continued and a JSON reload give equal JSON (the luck is the named stream, so a
// replay is exact); an heir keeps the shard; a life to 2026, a modern life with no company and every old fixture carry no
// `frontier` key (history is fixed, nothing exists until a push); twelve hostile shards load into the oldest fixture, three years
// play, every read stays valid and the first push writes a sound shard; the docs name every cap, who writes and who reads; and the
// two ceiling rows exist. The probe adds no pinned seed: states come from `adult(n, year, 'us')` and the kits' own seed lists.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { discloseResearch } from '../src/game/business/contract'
import { advanceTechWaves, landRivalWaves, readTechWaves, type TechWave } from '../src/game/business/tech-waves'
import { killCharacter } from '../src/game/death'
import { checkLedger, peekLedger } from '../src/game/kernel/ledger'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import type { GameState } from '../src/game/types'
import { ALL_IDEAS } from '../src/game/workshop/catalog'
import { raceYear } from '../src/game/workshop/market'
import { worldBudget } from '../src/game/world/budget'
import { FRONTIER_CAPS, WORLD_NODE_CAP } from '../src/game/world/caps'
import { applyDisclosure, frontierLead, frontierProblems, frontierRows, frontierSpill, normalizeFrontier, originKey, readFrontier } from '../src/game/world/frontier'
import { FIELD_IDS, FIELDS, fieldOfKind, type FieldId } from '../src/game/world/frontier-fields'
import { stepFrontier } from '../src/game/world/frontier-step'
import { frontierTerms } from '../src/game/world/frontier-terms'
import { worldProblems } from '../src/game/world/invariants'
import '../src/game/world/shards'
import { CEILING_PROBES } from './ceiling-kit'
import { LEDGER_SEEDS } from './ledger-probe'
import { adult, company } from './market-kit'
import { playLife } from './play-kit'
import { ROOT } from './scan-kit'

const START = 2027
/** The most rival pressure one odds line shows, odds points (world/frontier-terms.ts RIVAL_MAX, and Effort's RIVAL_PTS). */
const RIVAL_TERM_MAX = 8
const END = 2226
const TRADES = ['aiLab', 'fusion', 'quantum', 'drones', 'spaceTech'] as const
/** The 12 fields that can lead: the 12 future-facing wave kinds. The 8 AI capabilities are spill only. */
const LEAD_FIELDS: readonly FieldId[] = FIELD_IDS.filter((f) => FIELDS[f].lead)
const MARKETS = ['world', 'us', 'gb', 'm3', 'm4', 'm5'] as const
/** The five port calls of a year: two make a wave (size from 0.2), three are research too small for one. */
const RESEARCH: readonly { field: string; size: number; name: string }[] = [
  { field: 'chips', size: 0.6, name: 'A chip leap' },
  { field: 'drug', size: 0.5, name: 'A new drug' },
  { field: 'ai.reasoning', size: 0.1, name: 'A reasoning result' },
  { field: 'ai.coding', size: 0.15, name: 'A coding result' },
  { field: 'security', size: 0.1, name: 'A security result' },
]
const FUTURE_IDEAS = ALL_IDEAS.filter((d) => d.future === true)

/** One founder with a company in each of five deep-tech trades, the year the probe starts. */
function founder(): GameState {
  const g = adult(11, START, 'us')
  for (const trade of TRADES) company(g, trade)
  g.queue = []
  return g
}

interface Landing {
  landed: number
  pushed: number
  ai: number
}

/**
 * One year of the frontier, the way the aging seam runs it (the frontier step, the business year's wave step, the rival landings of
 * the `techWaves` hook), then the probe's own pushes: 20 disclosures of size 1 by both sides over the 12 lead fields and the 5 port
 * calls. It reports the rival landings the year made and how many of them pushed their field's row.
 */
function playYear(g: GameState, year: number): Landing {
  g.year = year
  stepFrontier(g)
  advanceTechWaves(g)
  const had = new Set(readTechWaves(g).map((w) => w.id))
  landRivalWaves(g)
  const landed: TechWave[] = readTechWaves(g).filter((w) => !had.has(w.id) && w.source === 'rival')
  const pushed = landed.filter((w) => {
    const field = fieldOfKind(w.kind)
    return field !== null && frontierRows(g, field).some((r) => r.w === 'rival' && r.y === year && r.o === originKey(w.id))
  })
  for (let i = 0; i < 20; i++) {
    applyDisclosure(g, {
      field: LEAD_FIELDS[i % LEAD_FIELDS.length]!,
      year,
      size: 1,
      origin: `probe|${year}|${i}`,
      by: i % 2 === 0 ? 'you' : 'rival',
      market: MARKETS[i % MARKETS.length],
      shield: i % 3 === 0 ? 'open' : 'patent',
    })
  }
  RESEARCH.forEach((r, i) => {
    discloseResearch(g, { field: r.field, name: r.name, size: r.size, origin: `r${i}|${year}`, market: i % 2 === 0 ? 'world' : 'us' })
  })
  return { landed: landed.length, pushed: pushed.length, ai: landed.filter((w) => w.kind === 'ai').length }
}

function playYears(g: GameState, from: number, to: number): Landing {
  const total: Landing = { landed: 0, pushed: 0, ai: 0 }
  for (let y = from; y <= to; y++) {
    const l = playYear(g, y)
    total.landed += l.landed
    total.pushed += l.pushed
    total.ai += l.ai
  }
  return total
}

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
function nodes(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const item = stack.pop()
    n++
    if (item !== null && typeof item === 'object') for (const kid of Array.isArray(item) ? item : Object.values(item)) stack.push(kid)
  }
  return n
}

/**
 * What is past its caps in the frontier as the readers see it, or nothing. The caps come from FRONTIER_CAPS, not from a copy of them.
 * `rate` (default on) also holds the writer's rate cap: at most 2 years gained in the year. A hostile save is held to the lead cap
 * (12 years in all) but not to that rate, which is the writer's (it cuts each push to the room the year has left).
 */
function overCaps(g: GameState, year: number, leadAtStart: Readonly<Record<string, number>>, rate = true): string[] {
  const out: string[] = []
  const rowsMax = FRONTIER_CAPS.rowsPerMarket * FRONTIER_CAPS.marketsPerField
  for (const id of FIELD_IDS) {
    const lead = frontierLead(g, id)
    if (lead > FRONTIER_CAPS.leadYears) out.push(`${id}: lead ${lead} is over ${FRONTIER_CAPS.leadYears}`)
    if (!FIELDS[id].lead && lead !== 0) out.push(`${id}: an AI capability has a lead of ${lead}`)
    if (rate && lead - (leadAtStart[id] ?? 0) > FRONTIER_CAPS.yearYears + 1e-9) out.push(`${id}: gained ${(lead - (leadAtStart[id] ?? 0)).toFixed(2)} years in ${year}`)
    if (frontierSpill(g, id) > FRONTIER_CAPS.spillPoints) out.push(`${id}: public research ${frontierSpill(g, id)} is over ${FRONTIER_CAPS.spillPoints}`)
    const rec = readFrontier(g).f[id]
    if (rec !== undefined && rec.pub > FRONTIER_CAPS.spillPoints * 10) out.push(`${id}: pub ${rec.pub} tenths is over ${FRONTIER_CAPS.spillPoints * 10}`)
    // The odds terms the research seam reads: inside their caps (18 and 8 odds points), and the same numbers the second time.
    const terms = frontierTerms(g, id)
    if (terms.spill > FRONTIER_CAPS.spillPoints || terms.rival > RIVAL_TERM_MAX || terms.lead > FRONTIER_CAPS.leadYears) out.push(`${id}: the odds terms ${JSON.stringify(terms)} are over their caps`)
    if (JSON.stringify(frontierTerms(g, id)) !== JSON.stringify(terms)) out.push(`${id}: the odds terms are not the same twice`)
    const rows = frontierRows(g, id)
    if (rows.length > rowsMax) out.push(`${id}: ${rows.length} rows are over ${rowsMax}`)
    const gained = rows.filter((r) => r.y === year).reduce((n, r) => n + r.d, 0)
    if (rate && gained > FRONTIER_CAPS.yearYears * 100) out.push(`${id}: rows of ${year} add ${gained} centi-years`)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The 200-year probe

describe('the 200-year probe at maximum inputs (the frontier half)', () => {
  it('keeps every field, wave, deadline and the state inside the caps for 200 years, books no money and draws no g.rng', () => {
    const g = founder()
    const rng0 = g.rng
    const nextId0 = g.nextId
    const money0 = g.character.money
    const books0 = JSON.stringify(peekLedger(g))
    const bad: string[] = []
    const total: Landing = { landed: 0, pushed: 0, ai: 0 }
    let widest = 0
    for (let year = START; year <= END && bad.length < 8; year++) {
      const lead0: Record<string, number> = {}
      for (const id of FIELD_IDS) lead0[id] = frontierLead(g, id)
      const l = playYear(g, year)
      total.landed += l.landed
      total.pushed += l.pushed
      total.ai += l.ai
      for (const line of overCaps(g, year, lead0)) bad.push(`${year} ${line}`)
      for (const line of worldProblems(g)) bad.push(`${year} world: ${line}`)
      const own = readTechWaves(g).filter((w) => w.source !== 'rival' && w.year === year).length
      if (own > 2) bad.push(`${year}: ${own} waves from the player's side`)
      widest = Math.max(widest, own)
      if (g.rng !== rng0) bad.push(`${year}: g.rng moved`)
      if (g.nextId !== nextId0) bad.push(`${year}: g.nextId moved`)
      for (const d of FUTURE_IDEAS) {
        const due = raceYear(g, d)
        if (due === null || due < d.from + 10 || due > d.from + 40) bad.push(`${year}: ${d.id} is due ${String(due)}, outside ${d.from + 10} to ${d.from + 40}`)
      }
    }
    expect(bad).toEqual([])
    // The run was real: the player's side hit the 2 a year cap, the shard is full, and the real rival landings pushed their fields.
    expect(widest).toBe(2)
    expect(frontierLead(g, 'fusion')).toBe(FRONTIER_CAPS.leadYears)
    expect(total.landed).toBeGreaterThan(5)
    expect(total.pushed).toBe(total.landed)
    expect(total.ai).toBeGreaterThan(0)
    // The end: at most 3,600 nodes, inside the budget, and not a dollar booked by the frontier.
    expect(nodes(readFrontier(g))).toBeLessThanOrEqual(3_600)
    expect(worldBudget(g).over).toEqual([])
    expect(g.character.money).toBe(money0)
    expect(JSON.stringify(peekLedger(g))).toBe(books0)
    expect(checkLedger(g).problems).toEqual([])
  }, 300_000)

  it('has every field at its caps at once and still at most 3,600 nodes', () => {
    const g = founder()
    g.year = START + 6
    for (let y = START; y <= g.year; y++) {
      for (const field of FIELD_IDS) {
        for (let m = 0; m < 5; m++) {
          for (let k = 0; k < 7; k++) applyDisclosure(g, { field, year: y, size: 1, origin: `${field}|${y}|${m}|${k}`, by: k % 2 === 0 ? 'you' : 'rival', market: `m${m}`, shield: 'open' })
        }
      }
    }
    expect(FIELD_IDS.every((f) => frontierRows(g, f).length === FRONTIER_CAPS.rowsPerMarket * FRONTIER_CAPS.marketsPerField)).toBe(true)
    expect(nodes(readFrontier(g))).toBeLessThanOrEqual(3_600)
    expect(worldBudget(g).over).toEqual([])
    expect(worldProblems(g)).toEqual([])
    expect(LEAD_FIELDS.every((f) => frontierLead(g, f) === FRONTIER_CAPS.leadYears)).toBe(true)
  }, 120_000)

  it('has teeth: a writer that broke a cap would show in worldProblems, which the probe reads every year', () => {
    const g = founder()
    expect(worldProblems(g)).toEqual([])
    // The reader repairs what it reads, so the probe's check is the invariant over the raw shard, as stored.
    g.world = { v: 1, frontier: { v: 1, y: 2027, f: { fusion: { fold: 1_300, pub: 190, ly: 2027, rows: [] } } } } as never
    const named = worldProblems(g).filter((p) => p.startsWith('frontier'))
    expect(named.join(' ')).toContain('fusion: fold')
    expect(named.join(' ')).toContain('pub 190 is over the cap of 180')
    expect(overCaps(g, 2027, {}).join(' ')).not.toContain('is over')
  })

  it('books no money: a long run of the frontier alone leaves the books and the player\'s cash as they were', () => {
    const g = founder()
    const books0 = JSON.stringify(peekLedger(g))
    const money0 = g.character.money
    for (let y = START; y <= START + 60; y++) {
      g.year = y
      stepFrontier(g)
      for (let i = 0; i < 12; i++) applyDisclosure(g, { field: LEAD_FIELDS[i]!, year: y, size: 0.8, origin: `alone|${y}|${i}`, by: i % 2 === 0 ? 'you' : 'rival' })
    }
    expect(readFrontier(g).y).toBe(START + 60)
    expect(g.character.money).toBe(money0)
    expect(JSON.stringify(peekLedger(g))).toBe(books0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Replay, clone and reload

describe('replay: the luck is the named stream, so a rerun, a clone and a reload agree', () => {
  const LAST = START + 59

  it('runs the same sixty years twice to the same JSON, the frontier and the waves included', () => {
    const a = founder()
    const b = founder()
    playYears(a, START, LAST)
    playYears(b, START, LAST)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    expect(Object.keys(readFrontier(a).f).length).toBeGreaterThan(10)
    expect(readTechWaves(a).length).toBeGreaterThan(0)
  }, 120_000)

  it('continues a structuredClone and a JSON reload of the state at year 30 to exactly the original\'s end', () => {
    const base = founder()
    playYears(base, START, START + 29)
    const clone = structuredClone(base)
    const reload = JSON.parse(JSON.stringify(base)) as GameState
    expect(JSON.stringify(reload)).toBe(JSON.stringify(base))
    playYears(base, START + 30, LAST)
    playYears(clone, START + 30, LAST)
    playYears(reload, START + 30, LAST)
    expect(JSON.stringify(clone)).toBe(JSON.stringify(base))
    expect(JSON.stringify(reload)).toBe(JSON.stringify(base))
    const whole = founder()
    playYears(whole, START, LAST)
    expect(JSON.stringify(whole)).toBe(JSON.stringify(base))
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. Heirs

describe('an heir keeps the frontier', () => {
  it('carries the shard to the next life and plays on inside the caps', () => {
    const g = founder()
    playYears(g, START, START + 14)
    g.character.age = 70
    const child = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, relationship: 80 })
    killCharacter(g, 'Old Age')
    g.queue = []
    const shard = JSON.stringify(readFrontier(g))
    expect(Object.keys(readFrontier(g).f).length).toBeGreaterThan(5)
    const heir = continueAsChild(g, child.id)
    expect(heir).not.toBe(g)
    expect(heir.generation).toBe(2)
    expect(JSON.stringify(readFrontier(heir))).toBe(shard)
    expect(heir.world?.frontier).toBeDefined()
    expect(worldProblems(heir)).toEqual([])
    // The family stream is shared with the heir, so the heir's years are the years the parent would have had.
    const lead0: Record<string, number> = {}
    for (const id of FIELD_IDS) lead0[id] = frontierLead(heir, id)
    heir.year = START + 15
    stepFrontier(heir)
    for (let i = 0; i < 12; i++) applyDisclosure(heir, { field: LEAD_FIELDS[i]!, year: heir.year, size: 1, origin: `heir|${i}`, by: 'you' })
    expect(overCaps(heir, heir.year, lead0)).toEqual([])
    expect(worldProblems(heir)).toEqual([])
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 4. Old saves and history fixed

const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')
const FIXTURES = readdirSync(FIXTURE_DIR).filter((name) => /^save-.*\.json\.gz$/.test(name)).sort()

function fixtureRaw(name: string): Record<string, unknown> {
  return JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()) as Record<string, unknown>
}

function loaded(raw: unknown): GameState {
  const result = migrateSave(raw)
  if (result.kind !== 'ready') throw new Error(`the save did not load: ${result.kind}`)
  return result.game
}

/** One year the way a test plays it: no popup in the way. */
function year(g: GameState): void {
  g.queue = []
  ageUp(g)
}

const hasFrontier = (g: GameState): boolean => Object.prototype.hasOwnProperty.call(g.world ?? {}, 'frontier')

describe('old saves and history: nothing exists until a push', () => {
  it('has fixtures to check', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(4)
  })

  it.each(FIXTURES)('%s migrates with no frontier key, and reads as an empty frontier', (name) => {
    const raw = fixtureRaw(name)
    expect(Object.prototype.hasOwnProperty.call((raw.world ?? {}) as object, 'frontier'), 'the fixture itself').toBe(false)
    const g = loaded(raw)
    expect(isLoadableGame(g)).toBe(true)
    expect(hasFrontier(g)).toBe(false)
    expect(readFrontier(g).f).toEqual({})
    for (const id of FIELD_IDS) {
      expect(frontierLead(g, id), id).toBe(0)
      expect(frontierSpill(g, id), id).toBe(0)
    }
    // Reading wrote nothing.
    expect(hasFrontier(g)).toBe(false)
  })

  it('leaves a plain life from 1990 to 2026 without a frontier', () => {
    const g = playLife({ seed: LEDGER_SEEDS[1]!, birthYear: 1990, untilAge: 36 }).g
    expect(g.year).toBeLessThanOrEqual(2026)
    expect(g.year).toBeGreaterThanOrEqual(2020)
    expect(hasFrontier(g)).toBe(false)
  }, 120_000)

  it('leaves a founder of five deep-tech companies without a frontier through every year up to 2026', () => {
    const g = adult(7, 2010, 'us')
    for (const trade of TRADES) company(g, trade)
    for (let y = 2010; y < 2026; y++) {
      year(g)
      expect(hasFrontier(g), `year ${g.year}`).toBe(false)
    }
    expect(g.year).toBe(2026)
    // And the writer refuses a push dated in the fixed past, from this very life.
    for (const past of [2026, 2025, 2000]) expect(applyDisclosure(g, { field: 'fusion', year: past, size: 1, origin: `past${past}`, by: 'you' })).toEqual({ applied: false, why: 'history' })
    expect(hasFrontier(g)).toBe(false)
  }, 120_000)

  it('leaves a modern life with no company without a frontier across 2026', () => {
    const g = playLife({ seed: LEDGER_SEEDS[2]!, birthYear: 2012, untilAge: 24 }).g
    expect(g.year).toBeGreaterThan(2030)
    expect(hasFrontier(g)).toBe(false)
  }, 120_000)

  it('has the first push make the shard and nothing before it', () => {
    const g = adult(9, 2030, 'us')
    expect(hasFrontier(g)).toBe(false)
    stepFrontier(g)
    expect(hasFrontier(g)).toBe(false)
    const r = applyDisclosure(g, { field: 'fusion', year: 2030, size: 0.5, origin: 'first', by: 'you' })
    expect(r.applied).toBe(true)
    expect(hasFrontier(g)).toBe(true)
    expect(worldProblems(g)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. Hostile shards

const rowOf = (i: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({ y: 2030 + (i % 5), w: i % 2 === 0 ? 'you' : 'rival', m: `m${i % 6}`, d: 40, o: `r${i}`, ...over })
const field = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ fold: 100, pub: 50, ly: 2031, rows: [rowOf(0), rowOf(1)], ...over })

/** A chain `depth` objects deep: the shape of a save made to break a recursive reader. (The loader refuses anything past 128 levels.) */
function deep(depth: number): unknown {
  let x: unknown = { end: true }
  for (let i = 0; i < depth; i++) x = { next: x }
  return x
}

interface Hostile {
  name: string
  make: () => unknown
}

const HOSTILE: Hostile[] = [
  { name: 'a number', make: () => 42 },
  { name: 'a string', make: () => 'a frontier that no game wrote' },
  { name: 'an array', make: () => [1, 2, { v: 1 }] },
  { name: 'a future version', make: () => ({ v: 2, y: 2030, f: { fusion: field() } }) },
  {
    name: 'unknown fields and a __proto__ key',
    make: () => JSON.parse('{"v":1,"y":2029,"f":{"warp":{"fold":900,"pub":0,"ly":2030,"rows":[]},"__proto__":{"fold":1,"pub":1,"ly":2030,"rows":[]},"constructor":{"fold":1,"pub":1,"ly":2030,"rows":[]},"fusion":{"fold":100,"pub":10,"ly":2028,"rows":[]}}}') as unknown,
  },
  {
    name: 'rows that are not rows',
    make: () => ({
      v: 1, y: 2029,
      f: {
        fusion: field({ rows: [null, 7, 'x', [], {}, rowOf(0, { y: '2030' }), rowOf(1, { m: 'WORLD' }), rowOf(2, { d: -5 }), rowOf(3, { d: 1.5 }), rowOf(4, { w: 'me' }), rowOf(5, { f: 2 }), rowOf(6, { o: 'x'.repeat(40) }), rowOf(7)] }),
        chips: field({ rows: 'many' }),
        drug: field({ rows: { length: 9 } }),
      },
    }),
  },
  { name: 'rows from 1999, 2020 and 2026', make: () => ({ v: 1, y: 2029, f: { fusion: field({ rows: [rowOf(0, { y: 1999 }), rowOf(1, { y: 2020 }), rowOf(2, { y: 2026 }), rowOf(3, { y: 0 }), rowOf(4, { y: -5 })] }) } }) },
  { name: 'a lead of a billion centi-years', make: () => ({ v: 1, y: 2029, f: { fusion: field({ fold: 1e9, pub: 1e9, yg: 1e9, rows: [rowOf(0, { d: 1e9 }), rowOf(1, { d: 1e300 })] }) } }) },
  { name: '10,000 rows in one field', make: () => ({ v: 1, y: 2029, f: { space: field({ rows: Array.from({ length: 10_000 }, (_, i) => rowOf(i, { y: 2030 + (i % 50), o: `o${i}` })) }) } }) },
  {
    name: 'strings of 10,000 characters',
    make: () => ({ v: 1, y: 2029, f: { ['k'.repeat(10_000)]: field(), fusion: field({ rows: [rowOf(0, { m: 'm'.repeat(10_000), o: 'o'.repeat(10_000) }), rowOf(1, { o: 'ok' })] }) } }),
  },
  {
    name: 'every field past every cap, and 40 more',
    make: () => ({
      v: 1, y: 2029,
      f: {
        ...Object.fromEntries(FIELD_IDS.map((id) => [id, field({ fold: 5_000, pub: 5_000, rows: Array.from({ length: 80 }, (_, i) => rowOf(i, { m: `m${i % 8}`, d: 300, o: `${id.length}${i}` })) })])),
        ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`extra${i}`, field()])),
      },
    }),
  },
  { name: 'records nested 100 deep', make: () => ({ v: 1, y: 2029, f: { fusion: field({ rows: [rowOf(0, { next: deep(100) }), rowOf(1)] }), chips: deep(100), drug: field({ next: deep(100) }) } }) },
]

describe('hostile frontier shards put into the oldest fixture', () => {
  it('has twelve of them', () => {
    expect(HOSTILE).toHaveLength(12)
  })

  it.each(HOSTILE.map((h) => [h.name, h] as const))('%s: loads, three years play, every read stays valid and the first push writes a sound shard', (_name, hostile) => {
    const raw = fixtureRaw('save-v1.json.gz')
    raw.world = { v: 1, frontier: hostile.make() }
    const g = loaded(raw)
    expect(isLoadableGame(g)).toBe(true)
    for (let i = 1; i <= 3; i++) {
      expect(() => year(g), `year ${i}`).not.toThrow()
      expect(g.character.alive, `alive after year ${i}`).toBe(true)
      expect(nodes(g.world), `world nodes after year ${i}`).toBeLessThan(WORLD_NODE_CAP)
      const shard = readFrontier(g)
      expect(frontierProblems(shard), `the read after year ${i}`).toEqual([])
      expect(nodes(shard), `shard nodes after year ${i}`).toBeLessThanOrEqual(3_600)
      expect(overCaps(g, g.year, {}, false), `caps after year ${i}`).toEqual([])
      expect(checkLedger(g, { allowHeal: true }).problems, `books after year ${i}`).toEqual([])
    }
    // Reads are valid for any shard; the first push replaces whatever was stored with a shard that is sound as stored.
    expect(normalizeFrontier(readFrontier(g))).toBe(readFrontier(g))
    const pushed = applyDisclosure(g, { field: 'fusion', year: g.year, size: 0.5, origin: 'after-hostile', by: 'you' })
    expect(pushed.applied).toBe(true)
    expect(frontierProblems(g.world?.frontier)).toEqual([])
    expect(worldProblems(g, { live: false }).filter((p) => p.startsWith('frontier'))).toEqual([])
    expect(FIELD_IDS.every((id) => frontierLead(g, id) <= FRONTIER_CAPS.leadYears)).toBe(true)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. The ceilings and the docs

describe('the ceiling rows', () => {
  const list = JSON.parse(readFileSync(join(ROOT, 'test', 'ceiling-list.json'), 'utf8')) as { id: string; file: string; token: string; cap: string }[]

  it('names the frontier caps and the waves a year in test/ceiling-list.json, with a probe row for each', () => {
    expect(list.find((c) => c.id === 'frontier-caps')).toMatchObject({ file: 'src/game/world/caps.ts', token: 'FRONTIER_CAPS' })
    expect(list.find((c) => c.id === 'waves-per-year')).toMatchObject({ file: 'src/game/business/tech-waves.ts', token: 'MAX_PER_YEAR' })
    const ids = CEILING_PROBES.map((p) => p.id)
    expect(ids).toContain('frontier-caps')
    expect(ids).toContain('waves-per-year')
  })

  it('presses every frontier cap at 100 times: the lead reaches 12 years, a year gains 2, and the waves of a year stop at 2', () => {
    const caps = CEILING_PROBES.find((p) => p.id === 'frontier-caps')!.run(100)
    expect(caps.value).toBeLessThanOrEqual(caps.limit)
    expect(caps.value).toBeGreaterThanOrEqual(caps.limit * 0.999)
    const waves = CEILING_PROBES.find((p) => p.id === 'waves-per-year')!.run(100)
    expect(waves).toMatchObject({ value: 2, limit: 2 })
  }, 120_000)
})

describe('the docs name the frontier', () => {
  const read = (name: string): string => (existsSync(join(ROOT, 'docs', name)) ? readFileSync(join(ROOT, 'docs', name), 'utf8') : '')
  const world = read('WORLD.md')
  const start = world.indexOf('## The frontier')
  const next = world.indexOf('\n## ', start + 1)
  const frontier = start < 0 ? '' : world.slice(start, next < 0 ? undefined : next)

  it('has the section', () => {
    expect(frontier.length).toBeGreaterThan(2_500)
  })

  it('names every cap number of FRONTIER_CAPS', () => {
    const c = FRONTIER_CAPS
    const wanted: [string, RegExp][] = [
      ['leadYears', new RegExp(`\\b${c.leadYears} years`)],
      ['yearYears', new RegExp(`\\b${c.yearYears} years a year`)],
      ['spillPoints', new RegExp(`\\b${c.spillPoints} points`)],
      ['spillPerDisclosure', new RegExp(`\\b${c.spillPerDisclosure} points`)],
      ['rowsPerMarket', new RegExp(`\\b${c.rowsPerMarket} rows`)],
      ['marketsPerField', new RegExp(`\\b${c.marketsPerField} markets`)],
      ['fields', new RegExp(`\\b${c.fields} fields`)],
    ]
    expect(wanted.filter(([, re]) => !re.test(frontier)).map(([key]) => key)).toEqual([])
    expect(frontier).toContain('3,600')
    expect(frontier).toContain('FRONTIER_CAPS')
  })

  it('says who writes: every wave, every rival landing and the disclose port, and the one writer', () => {
    for (const name of ['applyDisclosure', 'announceWave', 'landRivalWaves', 'discloseResearch', 'announceResearch', 'pushFromWave', 'effort']) expect(frontier, name).toContain(name)
  })

  it('says who reads: the Workshop race and the odds terms, and what does not read it', () => {
    for (const name of ['raceYear', 'raceShift', 'frontierTerms', 'frontierWords', 'public research', 'rival pressure', 'capBest']) expect(frontier, name).toContain(name)
  })

  it('says the load order, the probe and the old saves', () => {
    for (const name of ['world/shards.ts', 'test/frontier-acceptance.test.ts', 'no `frontier` key']) expect(frontier, name).toContain(name)
  })

  it('has no dash and no emoji', () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    const emoji = /\p{Extended_Pictographic}/u
    const lines = frontier.split('\n')
    expect(lines.filter((line) => dash.test(line) || emoji.test(line))).toEqual([])
  })
})
