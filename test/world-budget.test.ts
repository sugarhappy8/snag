// R2-L17 (K.6 b): the budget meter, the world step and the 50-year size probe. The world is metered (nodes, bytes, and the one
// timer the world step reports through), it gets one yearly hook that runs last, and a long life with many companies proves that the
// registry stays inside its budget: 55,000 nodes, 800,000 bytes (R4-P2 raised them from 25,000 and 450,000, X47), a world step far
// under a tap's patience, and the books still balance.
//
// No pinned seed: the lives are a tuple (the first of the conservation probe's forty is the same life, R2-L5).
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { checkLedger, LEDGER_CAPS, peekLedger } from '../src/game/kernel/ledger'
import { REASONS } from '../src/game/kernel/reasons'
import type { GameState } from '../src/game/types'
import { WORLD_BUDGET, budgetReport, resetBudgetReport, timed, worldBudget } from '../src/game/world/budget'
import { EDGE_CAPS, FRONTIER_CAPS, HOLDING_ROWS_CAP, LOD_CAPS, MET_CAPS, WORLD_ALLOTMENT, WORLD_DROP_FIRST, WORLD_KEEP_LAST, WORLD_NODE_CAP } from '../src/game/world/caps'
import { normalizeEdges } from '../src/game/world/edges'
import { FIELD_IDS, FIELDS } from '../src/game/world/frontier-fields'
import { normalizeFrontier } from '../src/game/world/frontier'
import { worldProblems } from '../src/game/world/invariants'
import { normalizeMet } from '../src/game/world/met'
import '../src/game/world/shards'
import { normalizeSocial } from '../src/game/world/social'
import { normalizeWorld, readWorld, registerShard } from '../src/game/world/state'
import { yearlyWorld } from '../src/game/world/yearly'
import { K_ID, loadSources } from './scan-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { playLife } from './play-kit'
import { probeLife } from './probe-life'
import { findSeed } from './seed-kit'
import { agingNames, withAging } from './kernel-kit'

/** The probe life: seed and birth year. The same life as the first of the conservation probe's forty (LEDGER_SEEDS[4]). */
const LIFE = [105, 1975] as const

const json = (x: unknown): string => JSON.stringify(x)
/** Stores a world as a hostile save would hold it: raw, with no reader in between. */
const setWorld = (g: GameState, raw: unknown): void => {
  ;(g as { world?: unknown }).world = raw
}
const pad = (n: number, w = 3): string => String(n).padStart(w, '0')

/** A state with a small, well-formed world: something in every index and a booking in the ledger. */
function stamped(): GameState {
  const g = makeTestGame(7, { age: 40, money: 50_000 })
  yearlyWorld(g)
  return g
}

describe('the world step', () => {
  it('is the last of the aging entries, named yearly.world', () => {
    const names = agingNames()
    expect(names[names.length - 1]).toBe('world')
    expect(names.filter((n) => n === 'world')).toHaveLength(1)
    // It reads the year's closing records, so every module that books money comes before it.
    for (const before of ['business', 'investments', 'finance', 'assets', 'advisors', 'milestones']) expect(names.indexOf(before), before).toBeLessThan(names.indexOf('world'))
  })

  it('stamps the world with the year, and a second call in the same year changes nothing', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    expect(readWorld(g).y).toBeUndefined()
    yearlyWorld(g)
    expect(readWorld(g).y).toBe(g.year)
    const once = json(g)
    yearlyWorld(g)
    expect(json(g)).toBe(once)
    // Nothing is written the second time: a world frozen all the way down is left alone.
    deepFreeze(g.world)
    expect(() => yearlyWorld(g)).not.toThrow()
    expect(json(g)).toBe(once)
  })

  it('writes new roots and never edits a shard in place (the next year, shards frozen one by one)', () => {
    const g = stamped()
    const w = g.world as Record<string, unknown>
    // The ledger is the one in-place shard, so it stays writable; the container too.
    for (const name of Object.keys(w)) if (name !== 'v' && name !== 'y' && name !== 'ledger' && typeof w[name] === 'object' && w[name] !== null) deepFreeze(w[name])
    g.year += 1
    expect(() => yearlyWorld(g)).not.toThrow()
    expect(readWorld(g).y).toBe(g.year)
  })

  it('draws nothing: g.rng is where it was', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    const before = g.rng
    yearlyWorld(g)
    g.year += 1
    yearlyWorld(g)
    expect(g.rng).toBe(before)
  })

  it('runs inside ageUp, once, and is skipped when the character dies earlier in the same hook loop', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    g.queue = []
    resetBudgetReport()
    ageUp(g)
    expect(readWorld(g).y).toBe(g.year)
    expect(budgetReport().find((r) => r.label === 'world')?.calls).toBe(1)

    const h = makeTestGame(8, { age: 40, money: 50_000 })
    h.queue = []
    withAging(
      (es) => [
        ...es.slice(0, -1),
        {
          seam: 'aging',
          phase: 'settle',
          order: 5,
          run: (gg) => {
            gg.character.alive = false
          },
        },
        es[es.length - 1]!,
      ],
      () => ageUp(h),
    )
    expect(h.character.alive).toBe(false)
    expect(readWorld(h).y).toBeUndefined()
  })
})

describe('the budget meter', () => {
  it('pins the budget: 55,000 nodes, 800,000 bytes, a 60 ms world step', () => {
    expect(WORLD_BUDGET).toEqual({ nodes: 55_000, bytes: 800_000, stepMs: 60 })
  })

  it('reads an absent world as the empty root, on a frozen state, and writes nothing', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    expect(g.world).toBeUndefined()
    const b = worldBudget(deepFreeze(g))
    expect(b).toEqual({ nodes: {}, total: 2, bytes: 7, over: [] })
    expect(g.world).toBeUndefined()
  })

  it('counts every value as a node: the shards, the root, and a total that is their sum', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    setWorld(g, { v: 1, y: 2030, junk: [1, 2, 3], more: { a: 1, b: [1] } })
    const b = worldBudget(g)
    expect(b.nodes).toEqual({ junk: 4, more: 4 })
    expect(b.total).toBe(3 + 4 + 4)
    expect(b.bytes).toBe(json(g.world).length)
    expect(b.over).toEqual([])
  })

  it('is pure: the same state gives the same answer, and the state is untouched', () => {
    const g = stamped()
    const before = json(g)
    const a = worldBudget(g)
    expect(worldBudget(g)).toEqual(a)
    expect(json(g)).toBe(before)
    for (const name of Object.keys(a.nodes)) expect(a.nodes[name], name).toBeGreaterThan(0)
  })

  it('names every breach: the node total, the bytes, a shard over its cap, a ledger over its caps', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    setWorld(g, { v: 1, junk: Array.from({ length: WORLD_BUDGET.nodes + 100 }, () => 1) })
    expect(worldBudget(g).over.some((line) => /nodes/.test(line))).toBe(true)

    setWorld(g, { v: 1, junk: 'x'.repeat(WORLD_BUDGET.bytes + 10) })
    const heavy = worldBudget(g)
    expect(heavy.over.some((line) => /bytes/.test(line))).toBe(true)
    expect(heavy.over.some((line) => /nodes/.test(line))).toBe(false)

    const rows = <T>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i))
    setWorld(g, {
      v: 1,
      people: { v: 1, rows: rows(LOD_CAPS.people + 1, (i) => ({ id: `person:p${i}`, seen: 2020 })), over: 0 },
      firms: { v: 1, rows: rows(LOD_CAPS.firms + 1, (i) => ({ id: `firm:f${i}`, form: 'biz', owner: 'person:p0', seen: 2020 })), over: 0 },
      homes: { v: 1, rows: rows(LOD_CAPS.homes + 1, (i) => ({ id: `home:h${i}`, owner: 'person:p0', seen: 2020 })), over: 0 },
      holdings: { v: 1, y: 2020, rows: rows(HOLDING_ROWS_CAP + 1, (i) => ['person:p0', `home:h${i}`, 1]) },
    })
    const over = worldBudget(g).over
    for (const name of ['people', 'firms', 'homes', 'holdings']) expect(over.some((line) => line.startsWith(name)), name).toBe(true)

    const accounts = Object.fromEntries(rows(LEDGER_CAPS.accounts + 5, (i): [string, number] => [`person:a${i}`, 1]))
    setWorld(g, { v: 1, ledger: { v: 1, y: 2020, a: accounts, m: {}, b: {}, ym: {}, yb: {}, f: {}, r: [], c: [], l: [], k: 0 } })
    expect(worldBudget(g).over.some((line) => line.startsWith('ledger') && /accounts/.test(line))).toBe(true)
  })

  it('reads garbage as the empty world and never throws', () => {
    for (const bad of [5, 'x', null, [1, 2], { v: 2, a: 1 }]) {
      const g = makeTestGame(7, { age: 40, money: 50_000 })
      setWorld(g, bad)
      const b = worldBudget(g)
      expect(b.total, String(bad)).toBe(2)
      expect(b.over).toEqual([])
    }
  })
})

describe('timed', () => {
  it('returns what the function returns and records the call', () => {
    resetBudgetReport()
    expect(timed('probe-a', () => 41 + 1)).toBe(42)
    expect(timed('probe-a', () => 'x')).toBe('x')
    const rows = budgetReport().filter((r) => r.label === 'probe-a')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.calls).toBe(2)
    expect(rows[0]!.ms).toBeGreaterThanOrEqual(0)
    expect(rows[0]!.max).toBeLessThanOrEqual(rows[0]!.ms + 1e-9)
  })

  it('records a call that throws, and lets the error through', () => {
    resetBudgetReport()
    expect(() =>
      timed('probe-b', () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(budgetReport().find((r) => r.label === 'probe-b')?.calls).toBe(1)
  })

  it('keeps the report sorted by label, hands out copies, and resets', () => {
    resetBudgetReport()
    timed('zeta', () => 1)
    timed('alpha', () => 1)
    const rows = budgetReport()
    expect(rows.map((r) => r.label)).toEqual(['alpha', 'zeta'])
    rows[0]!.calls = 99
    expect(budgetReport()[0]!.calls).toBe(1)
    resetBudgetReport()
    expect(budgetReport()).toEqual([])
  })

  it('keeps a bounded table, however many labels are asked for', () => {
    resetBudgetReport()
    for (let i = 0; i < 500; i++) timed(`label-${i}`, () => i)
    expect(budgetReport().length).toBeLessThanOrEqual(64)
    resetBudgetReport()
  })

  it('is the only world file that reads the clock', () => {
    const files = loadSources().filter((s) => s.path.startsWith('src/game/world/'))
    expect(files.map((s) => s.path)).toContain('src/game/world/budget.ts')
    const measuring = files.filter((s) => s.toks.some((t) => t.k === K_ID && t.v === 'performance')).map((s) => s.path)
    expect(measuring).toEqual(['src/game/world/budget.ts'])
  })

  it('is not saved and not read by the game: two runs of a life give the same JSON although their timings differ', () => {
    const play = (): GameState => probeLife({ seed: LIFE[0], birthYear: LIFE[1], businesses: 1, years: 4, keepAlive: true })
    resetBudgetReport()
    const a = play()
    const first = budgetReport().find((r) => r.label === 'world')!
    expect(first.calls).toBe(4)

    // A clock that runs 7 ms on every reading: each timed call measures exactly 7 ms, whatever the machine does.
    let t = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (t += 7))
    resetBudgetReport()
    let b: GameState
    try {
      b = play()
    } finally {
      clock.mockRestore()
    }
    const second = budgetReport().find((r) => r.label === 'world')!
    expect(second.max).toBe(7)
    expect(second.ms).toBe(28)
    expect(second.max).not.toBe(first.max)
    expect(json(b)).toBe(json(a))
    expect(json(a)).not.toMatch(/"calls"|"stepMs"/)
  }, 60_000)
})

/** A world at every cap at once: 80 people, 20 firms, 150 homes, 1,200 holding rows, 500 accounts, 480 flow rows, 40 log rows, 600 tokens. */
function maximalWorld(year: number): Record<string, unknown> {
  const person = (i: number): string => `person:p${pad(i)}`
  const people = { v: 1, rows: Array.from({ length: LOD_CAPS.intimate }, (_, i) => ({ id: person(i), seen: year })), over: 0 }
  const firms = { v: 1, rows: Array.from({ length: LOD_CAPS.fullFirms }, (_, i) => ({ id: `firm:f${pad(i)}`, form: 'biz', owner: person(0), seen: year })), over: 0 }
  const homes = { v: 1, rows: Array.from({ length: LOD_CAPS.homes }, (_, i) => ({ id: `home:h${pad(i)}`, owner: person(0), seen: year })), over: 0 }

  // 150 assets (the 20 firms and 130 homes), 8 rows each: seven people and the outside, an eighth of the equity apiece.
  const assets = [...firms.rows.map((r) => r.id), ...homes.rows.slice(0, 130).map((r) => r.id)]
  const held: [string, string, number][] = []
  assets.forEach((asset, k) => {
    for (let j = 0; j < 7; j++) held.push([person((k + j) % LOD_CAPS.intimate), asset, 0.125])
    held.push(['pool:outside', asset, 0.125])
  })
  held.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const holdings = { v: 1, y: year, rows: held }

  // 499 people and the pool of others, ten dollars each, all of it minted as lending: the books balance.
  const a: Record<string, number> = { 'pool:other': 10 }
  for (let i = 0; i < LEDGER_CAPS.accounts - 1; i++) a[`person:a${pad(i)}`] = 10
  const countries = ['us', 'uk', 'de', 'fr', 'jp', 'ca', 'au', 'br']
  const reasons = Object.keys(REASONS).slice(0, LEDGER_CAPS.flowRows / countries.length)
  const f: Record<string, number[]> = {}
  for (const country of countries) for (const reason of reasons) f[`${year}:${country}:${reason}`] = [5, 0, 0, 0, -5, 0, 0, 0]
  const ledger = {
    v: 1,
    y: year,
    a,
    m: { lending: 10 * LEDGER_CAPS.accounts },
    b: {},
    ym: { lending: 10 * LEDGER_CAPS.accounts },
    yb: {},
    f,
    r: Array.from({ length: LEDGER_CAPS.receipts }, (_, i) => `tok:${year}:${i}`),
    c: [1, 2, 3, 4].map((back): [number, number, number, number] => [year - back, 0, 0, 0]).reverse(),
    l: Array.from({ length: LEDGER_CAPS.logRows }, (_, i) => [year, 'fold', `n${i}`, 10]),
    k: 100_000,
  }
  return { v: 1, y: year, ledger, people, firms, homes, holdings }
}

describe('a synthetic world at every cap', () => {
  it('fits the node and byte budget, is sound, and loses no row to the reader', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    setWorld(g, maximalWorld(g.year))
    const b = worldBudget(g)
    console.info('R2-L17 maximal world', json({ nodes: b.nodes, total: b.total, bytes: b.bytes }))
    expect(b.over).toEqual([])
    expect(b.total).toBeLessThan(WORLD_BUDGET.nodes)
    expect(b.bytes).toBeLessThan(WORLD_BUDGET.bytes)
    // The synthetic world is itself valid, so the reader keeps all of it.
    expect(normalizeWorld(JSON.parse(json(g.world)))).toEqual(g.world)
    expect(worldProblems(g, { live: false })).toEqual([])
    const ledger = checkLedger(g)
    expect(ledger.ok, ledger.problems.join('; ')).toBe(true)
    expect(ledger.accounts).toBe(LEDGER_CAPS.accounts)
    expect(ledger.flowRows).toBe(LEDGER_CAPS.flowRows)
    const w = normalizeWorld(g.world) as Record<string, { rows: unknown[] }>
    expect(w.people!.rows).toHaveLength(LOD_CAPS.intimate)
    expect(w.firms!.rows).toHaveLength(LOD_CAPS.fullFirms)
    expect(w.homes!.rows).toHaveLength(LOD_CAPS.homes)
    expect(w.holdings!.rows).toHaveLength(HOLDING_ROWS_CAP)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// R4-P2 (X47): the world at the caps of the whole of R4
//
// `met` is the real shard since R4-S4 (`metAtCaps`), and `edges` and `social` are the real shards since R4-E6b (`edgesAtCaps`,
// `socialAtCaps`): each builder holds its shard at its caps, valid, so its reader returns it as itself and nothing in the group is
// a stand-in any more. The R2 `maximalWorld` builder is unchanged on purpose (S4 left it alone for the same reason: its "keep only the
// books" case would otherwise change); `r4Worst` is the builder that holds every cap at once.

/** Real-length names, so the bytes are a real figure and not a minimum. */
const FIRST = ['Maribel', 'Okonkwo', 'Takeshi', 'Ingrid', 'Rashid', 'Bao', 'Odalys', 'Lennart']
const LAST = ['Okonkwo-Reyes', 'Nakamura', 'Lindqvist', 'Abdelrahman', 'Castellanos', 'Whitfield']

/**
 * The real Met shard at its caps (R4-S4): 400 records of 22 nodes (the record, 12 plain fields, the axes list with its five numbers,
 * and the died year, the role tag and the job ref) and 200 tombstones of 8, and the map root: 10,401 nodes. Keys ascend, as the reader
 * writes them, so `normalizeMet` returns it as itself.
 */
function metAtCaps(year: number): Record<string, unknown> {
  const entries: [string, unknown][] = []
  for (let i = 0; i < MET_CAPS.records; i++) {
    entries.push([
      `cls.us.${1950 + (i % 60)}.${i}`,
      { f: FIRST[i % FIRST.length], l: LAST[i % LAST.length], g: i % 2, b: 1950 + (i % 60), c: 'us', k: i % 9, a: [50, 40, 60, 30, 70], y: year - 30, s: year, w: i % 10, fl: i % 64, gr: i % 100, ob: (i % 200) - 100, d: year - 2, r: 'banker', j: `firm:f${1000 + i}` },
    ])
  }
  for (let i = 0; i < MET_CAPS.tombs; i++) entries.push([`actor.us.${1950 + (i % 60)}.${i}`, [year - 5, 20, -10, 3, FIRST[i % FIRST.length], LAST[i % LAST.length], 3_949]])
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return Object.fromEntries(entries)
}

/**
 * The real edge map at its caps (R4-E6b): 1,200 edges of 8 nodes (an edge and its seven numbers), 1,200 memory arrays with 4,000 memories
 * in all, `n` and `d` on the 120 most salient edges (16 nodes each), 12 feuds, 40 debts, and the 40 secrets that live in the same map
 * (13 nodes each): 17,529 nodes. This is the model of the plan's allotment; the larger worst case, with a link kind and a call-in stamp
 * on every edge, is 19,929 and is counted in test/world-edges.test.ts and test/world-edge-slice.test.ts. Keys ascend, so `normalizeEdges`
 * returns it as itself.
 */
function edgesAtCaps(year: number): Record<string, unknown> {
  const kinds = ['gift_given', 'loan_given', 'told_gently', 'kept_secret']
  const entries: [string, unknown][] = []
  for (let i = 0; i < EDGE_CAPS.edges; i++) {
    const strong = i < EDGE_CAPS.talkEdges
    const e: Record<string, unknown> = {
      t: 55,
      f: strong ? 100 : 40 + (i % 60),
      r: 48,
      s: strong ? 100 : i % 7,
      o: (i % 21) - 10,
      y: year - 20,
      l: year,
      m: Array.from({ length: i < 400 ? 4 : 3 }, (_, j) => `${kinds[j]}.${year - 40 + j * 2}.1.e`),
    }
    if (strong) {
      e.n = Array.from({ length: 6 }, (_, k) => `cb${k}`)
      e.d = Array.from({ length: 8 }, (_, k) => k + 1)
    }
    if (i < EDGE_CAPS.feuds) e.q = [1 + (i % 4), year - 3, 5]
    if (i < EDGE_CAPS.debts) e.dv = [12_000 + i, 5, year - 2, i % 2, 3_000]
    entries.push([`person:p${pad(i, 4)}>person:p${pad((i + 1) % EDGE_CAPS.edges, 4)}`, e])
  }
  for (let i = 0; i < EDGE_CAPS.secrets; i++) entries.push([`secret:${i}`, { a: `person:p${pad(i, 4)}`, k: i % 2 === 0 ? 'debt' : 'affair', v: 1 + (i % 5), h: Array.from({ length: EDGE_CAPS.holders }, (_, k) => `person:p${pad(k, 4)}`), y: year - 5, p: year - 1 }])
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return Object.fromEntries(entries)
}

/** The real social stamp at its caps (R4-E6b): v, on, y, fy, ay, and three mentor pairs: 16 nodes. */
function socialAtCaps(year: number): Record<string, unknown> {
  return { v: 1, on: 1, y: year, fy: year - 30, ay: year, ms: [['person:p0001', 41.5], ['person:p0002', 55], ['person:p0003', 63.25]] }
}

function r4StandIns(year: number): Record<string, unknown> {
  return { met: metAtCaps(year), edges: edgesAtCaps(year), social: socialAtCaps(year) }
}

/** The worst case of the whole of R4: the R2 maximal world, the frontier, the facts and the lod shard of R3, and the real `met`, `edges` and `social` at their caps. */
function r4Worst(year: number): Record<string, unknown> {
  const frontier: { v: 1; y: number; f: Record<string, unknown> } = { v: 1, y: 2035, f: {} }
  for (const id of FIELD_IDS) {
    const lead = FIELDS[id].lead
    const rows: { y: number; w: string; m: string; d: number; o: string; f: number }[] = []
    for (let m = 0; m < FRONTIER_CAPS.marketsPerField; m++) for (let i = 0; i < FRONTIER_CAPS.rowsPerMarket; i++) rows.push({ y: 2030 + i, w: i % 2 ? 'you' : 'rival', m: `m${m}`, d: lead ? 50 : 0, o: `${m}${i}x`, f: 1 })
    rows.sort((a, b) => a.y - b.y)
    frontier.f[id] = lead ? { fold: 0, pub: 180, ly: 2035, yg: 200, rows } : { fold: 0, pub: 180, ly: 2035, rows }
  }
  const rows = Array.from({ length: 400 }, (_, i) => ({ k: 'company.failed', y: year - 59 + (i % 60), c: `company:${i}`, a: `person:p${pad(i)}`, v: 1_000 + i, s: 50 }))
  rows.sort((a, b) => a.y - b.y)
  return {
    ...maximalWorld(year),
    lod: { v: 1, y: year, pooled: { person: 12, firm: 3, home: 7 }, demoted: 40 },
    facts: { v: 1, rows },
    frontier,
    ...r4StandIns(year),
  }
}

/** A shard that keeps whatever it is given and is in neither class: it stands for a shard of a later release (R5, R6) that the order has no name for. */
const STRAY = { normalize: (raw: unknown): unknown => raw }

describe('the world at the caps of R4 (R4-P2, X47)', () => {
  const measured = (): ReturnType<typeof worldBudget> => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    setWorld(g, r4Worst(g.year))
    return worldBudget(g)
  }

  it('has met at its caps (10,401 nodes), edges and secrets at theirs (17,529) and social at its own (16): the real shards, no stand-in', () => {
    const b = measured()
    expect(b.nodes.met).toBe(10_401)
    expect(b.nodes.edges).toBe(17_529)
    expect(b.nodes.social).toBe(16)
  })

  it('measures the whole worst case, and the budget is that measurement plus 15%', () => {
    const b = measured()
    console.info('R4-P2 maximal world', json({ total: b.total, bytes: b.bytes, nodes: b.nodes }))
    expect(b.over).toEqual([])
    // The starting numbers are 55,000 nodes and 800,000 bytes; the budget is the larger of those and the measurement plus 15%.
    expect(WORLD_BUDGET.nodes).toBeGreaterThanOrEqual(Math.ceil(b.total * 1.15))
    expect(WORLD_BUDGET.bytes).toBeGreaterThanOrEqual(Math.ceil(b.bytes * 1.15))
    expect(b.total).toBeLessThan(WORLD_BUDGET.nodes)
    expect(b.bytes).toBeLessThan(WORLD_BUDGET.bytes)
  })

  it('has an allotment: R4 about 29,000 nodes, R5 and R6 6,000 each, all of it under the cap beside the shards of v5.2.0', () => {
    expect(WORLD_ALLOTMENT).toEqual({ r4: 29_000, r5: 6_000, r6: 6_000 })
    const b = measured()
    const r4 = (b.nodes.met ?? 0) + (b.nodes.edges ?? 0) + (b.nodes.social ?? 0)
    expect(r4).toBeLessThanOrEqual(WORLD_ALLOTMENT.r4)
    const today = b.total - r4
    expect(today).toBeGreaterThan(15_000)
    expect(today + WORLD_ALLOTMENT.r4 + WORLD_ALLOTMENT.r5 + WORLD_ALLOTMENT.r6).toBeLessThan(WORLD_NODE_CAP)
    // The worst case of R4 is under the cap and the budget by itself; the old cap of 40,000 was passed by it.
    expect(b.total).toBeLessThan(WORLD_NODE_CAP)
    expect(b.total).toBeGreaterThan(40_000)
  })

  it('is read whole by the shards that exist: the frontier, the facts, the lod shard, met, edges and social come back as themselves', () => {
    const raw = r4Worst(2030)
    expect(normalizeFrontier(raw.frontier)).toBe(raw.frontier)
    expect(normalizeMet(raw.met)).toBe(raw.met)
    expect(normalizeEdges(raw.edges)).toBe(raw.edges)
    expect(normalizeSocial(raw.social)).toBe(raw.social)
    const out = normalizeWorld(JSON.parse(json(raw)))
    for (const name of ['ledger', 'people', 'firms', 'homes', 'holdings', 'lod', 'facts', 'frontier', 'met', 'edges', 'social']) expect(out[name], name).toEqual(raw[name])
  })

  it('puts every shard of v5.2.0 in a class of the over-cap order', () => {
    const ordered = [...WORLD_DROP_FIRST, ...WORLD_KEEP_LAST]
    for (const name of ['ledger', 'people', 'firms', 'homes', 'holdings', 'lod', 'facts', 'frontier']) expect(ordered, name).toContain(name)
    expect(new Set(ordered).size).toBe(ordered.length)
  })

  it('over the cap, the indexes go first, then the stray; the ledger and the holdings stay whole, whatever is largest', () => {
    registerShard('stray', STRAY)
    const world: Record<string, unknown> = { ...maximalWorld(2030), stray: Array.from({ length: WORLD_NODE_CAP }, () => 1) }
    const out = normalizeWorld(world)
    expect(Object.keys(out).sort()).toEqual(['holdings', 'ledger', 'v', 'y'])
    expect(out.ledger).toEqual(world.ledger)
    expect(out.holdings).toEqual(world.holdings)
    // The books of the world that is left are sound.
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    setWorld(g, out)
    expect(worldBudget(g).total).toBeLessThan(WORLD_NODE_CAP)
    expect(worldProblems(g, { live: false })).toEqual([])
  })
})

describe('the real met shard over the cap (R4-S4, X47)', () => {
  it('goes with the books and the holdings, never with the stray shard nor the indexes: it comes through whole at its caps', () => {
    registerShard('stray', STRAY)
    const met = metAtCaps(2030)
    const world: Record<string, unknown> = { ...maximalWorld(2030), met, stray: Array.from({ length: WORLD_NODE_CAP }, () => 1) }
    const out = normalizeWorld(world)
    expect(Object.keys(out).sort()).toEqual(['holdings', 'ledger', 'met', 'v', 'y'])
    expect(out.met).toBe(met)
    // With the stray gone and the indexes kept, the world fits, and the shard is still all there.
    const fits = normalizeWorld({ ...maximalWorld(2030), met })
    expect(Object.keys(fits).sort()).toEqual(['firms', 'holdings', 'homes', 'ledger', 'met', 'people', 'v', 'y'])
    expect(fits.met).toBe(met)
  })
})

describe('the real edges and social shards over the cap (R4-E6b, X47)', () => {
  it('go with the books and the holdings, never with the stray shard nor the indexes: they come through whole at their caps', () => {
    registerShard('stray', STRAY)
    const edges = edgesAtCaps(2030)
    const social = socialAtCaps(2030)
    const world: Record<string, unknown> = { ...maximalWorld(2030), edges, social, stray: Array.from({ length: WORLD_NODE_CAP }, () => 1) }
    const out = normalizeWorld(world)
    expect(Object.keys(out).sort()).toEqual(['edges', 'holdings', 'ledger', 'social', 'v', 'y'])
    expect(out.edges).toBe(edges)
    expect(out.social).toBe(social)
    // With the stray gone and the indexes kept, the world fits, and both shards are still all there.
    const fits = normalizeWorld({ ...maximalWorld(2030), edges, social })
    expect(Object.keys(fits).sort()).toEqual(['edges', 'firms', 'holdings', 'homes', 'ledger', 'people', 'social', 'v', 'y'])
    expect(fits.edges).toBe(edges)
    expect(fits.social).toBe(social)
  })

  it('stay under the budget with met beside them, and the meter finds nothing over', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    setWorld(g, { ...maximalWorld(g.year), met: metAtCaps(g.year), edges: edgesAtCaps(g.year), social: socialAtCaps(g.year) })
    const b = worldBudget(g)
    expect(b.over).toEqual([])
    expect(b.nodes.edges).toBe(17_529)
    expect(b.total).toBeLessThan(WORLD_BUDGET.nodes)
  })
})

describe('the 50 year probe: twelve companies, one founder', () => {
  let g: GameState
  let years = 0
  /** The largest world of any year end, and the year ends that were over budget (the walk is read-only, so the life is the same life). */
  let peak = 0
  const breaches: string[] = []

  beforeAll(() => {
    resetBudgetReport()
    g = probeLife({
      seed: LIFE[0],
      birthYear: LIFE[1],
      businesses: 12,
      years: 50,
      keepAlive: true,
      onYear: (state, played) => {
        const b = worldBudget(state)
        peak = Math.max(peak, b.total)
        for (const line of b.over) breaches.push(`year ${played}: ${line}`)
      },
    })
    years = g.year - (LIFE[1] + 30)
  }, 600_000)

  it('plays all fifty years', () => {
    expect(g.character.alive).toBe(true)
    expect(years).toBe(50)
  })

  it('keeps the world inside its budget: nodes, bytes, the ledger, the flow rows', () => {
    const b = worldBudget(g)
    const ledger = checkLedger(g)
    console.info('R2-L17 world after 50 years, 12 companies', json({ nodes: b.nodes, total: b.total, bytes: b.bytes, accounts: ledger.accounts, flowRows: ledger.flowRows, bookings: ledger.bookings }))
    expect(b.over).toEqual([])
    expect(breaches).toEqual([])
    expect(peak).toBeLessThanOrEqual(WORLD_BUDGET.nodes)
    expect(b.total).toBeLessThanOrEqual(WORLD_BUDGET.nodes)
    expect(b.bytes).toBeLessThanOrEqual(WORLD_BUDGET.bytes)
    expect(b.nodes.ledger ?? 0).toBeLessThanOrEqual(9_000)
    expect(ledger.flowRows).toBeLessThanOrEqual(600)
    expect(ledger.ok, ledger.problems.join('; ')).toBe(true)
    expect(worldProblems(g)).toEqual([])
    expect(readWorld(g).y).toBe(g.year)
  })

  it('steps the world once a year, each step far under a tap', () => {
    const row = budgetReport().find((r) => r.label === 'world')
    expect(row).toBeDefined()
    console.info('R2-L17 world step', json({ calls: row!.calls, totalMs: Math.round(row!.ms * 10) / 10, maxMs: Math.round(row!.max * 10) / 10, budgetMs: WORLD_BUDGET.stepMs }))
    expect(row!.calls).toBe(years)
    // Four times the budget of 60 ms, so a loaded CI machine does not make it flake; the real figure is printed above.
    expect(row!.max).toBeLessThanOrEqual(WORLD_BUDGET.stepMs * 4)
  })
})

describe('a lived life: a rich family from birth, every year end', () => {
  it('stays inside the budget and keeps the world sound, from birth to seventy', () => {
    const over: string[] = []
    let peak = 0
    // The life is found, not pinned: the merge of the quiet track moved the event picks, and the one born rich in 1990 from LIFE[0] now
    // dies at 36, before the forty the test asks of a life. The first seed from there on that reaches forty is the life of this test.
    const seed = findSeed((s) => playLife({ seed: s, birthYear: 1990, untilAge: 40, rich: true }).g.character.age >= 40, {
      from: LIFE[0],
      label: 'a rich family born 1990 that reaches forty',
    })
    const { g } = playLife({
      seed,
      birthYear: 1990,
      untilAge: 70,
      rich: true,
      onYear: (state, played) => {
        const b = worldBudget(state)
        peak = Math.max(peak, b.total)
        for (const line of b.over) over.push(`year ${played}: ${line}`)
      },
    })
    const b = worldBudget(g)
    console.info('R2-L17 lived life', json({ age: g.character.age, peak, total: b.total, bytes: b.bytes, nodes: b.nodes }))
    expect(g.character.age).toBeGreaterThanOrEqual(40)
    expect(over).toEqual([])
    expect(b.total).toBeLessThanOrEqual(WORLD_BUDGET.nodes)
    expect(checkLedger(g).ok).toBe(true)
    expect(worldProblems(g, { live: false })).toEqual([])
  }, 120_000)
})

describe('a light life: the ledger does not slow the year', () => {
  it('books at most 1,500 times a year with no companies', () => {
    const light = probeLife({ seed: LIFE[0], birthYear: LIFE[1], businesses: 0, years: 20, keepAlive: true })
    const bookings = peekLedger(light).k
    console.info('R2-L17 light life', json({ bookings, perYear: Math.round(bookings / 20) }))
    expect(bookings / 20).toBeLessThanOrEqual(1_500)
    expect(worldBudget(light).over).toEqual([])
    expect(checkLedger(light).ok).toBe(true)
  }, 120_000)
})
