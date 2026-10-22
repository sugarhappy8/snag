// ci: fast
// R3-F2 (C.6 b): the yearly step of the world frontier (src/game/world/frontier-step.ts): public research fades 10% a year, and a rival
// follows a player's disclosure with luck from the named stream `frontier`. One module, world.frontier, in the `frontier` phase of the
// aging seam, registered by one line in modules/index.ts.
//
// What this file pins: the step is a no-op up to 2026 and with no shard (and creates no world), it is idempotent by its year stamp,
// pub fades by floor(x 0.9), a player row of age 1 to 4 is followed at most once and never at age 0 or 5 (about 30% a year), a follow
// adds floor(d/2) cut to the 2 years a year and the 12 in all, an AI capability never has a lead to follow, luck replays (a clone, a
// JSON reload) and re-rolls only for a Time Machine jump, the step draws nothing from g.rng, logs nothing and works on a deep-frozen
// root, and the module is in the registry in its phase, before the history step. No `seed: <digits>` pin: a state is makeTestGame
// and a hand-built shard.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { getModule, registeredSlices, yearlyEntries } from '../src/game/kernel/registry'
import { followDraw, frontierModule, stepFrontier } from '../src/game/world/frontier-step'
import { FRONTIER_CAPS } from '../src/game/world/caps'
import { applyDisclosure, frontierLead, frontierProblems, frontierRows, frontierSpill, lastPush, normalizeFrontier, originKey, readFrontier, type FieldRec, type FrontierRow, type FrontierShard } from '../src/game/world/frontier'
import { FIELD_IDS, type FieldId } from '../src/game/world/frontier-fields'
import { worldProblems } from '../src/game/world/invariants'
import { readWorld } from '../src/game/world/state'
import type { GameState } from '../src/game/types'
import { readFileSync } from 'node:fs'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

/** A fresh state in `year` with a world whose only shard is `frontier`. */
function lifeWith(frontier: unknown, year = 2030, lifeId = 'test-life'): GameState {
  const g = makeTestGame(1)
  g.year = year
  g.lifeId = lifeId
  if (frontier !== undefined) (g as { world?: unknown }).world = { v: 1, frontier }
  return g
}

const row = (y: number, o: string, over: Partial<FrontierRow> = {}): FrontierRow => ({ y, w: 'you', m: 'world', d: 50, o, ...over })
const rec = (over: Partial<FieldRec> = {}): FieldRec => ({ fold: 0, pub: 0, ly: 2030, rows: [], ...over })
const shardOf = (f: FrontierShard['f'], y = 0): FrontierShard => ({ v: 1, y, f })
const rowsOf = (g: GameState, field: FieldId = 'fusion'): readonly FrontierRow[] => frontierRows(g, field)
const json = (g: GameState): string => JSON.stringify(g)

/** The first origin (p0, p1, ...) whose follow draw in `year` satisfies `want`. */
function originWhere(g: GameState, field: FieldId, year: number, want: (u: number) => boolean, skip = 0): string {
  let seen = 0
  for (let i = 0; i < 2000; i++) {
    const o = `p${i}`
    if (want(followDraw(g, field, o, year)) && seen++ >= skip) return o
  }
  throw new Error('no origin found')
}
const follows = (g: GameState, field: FieldId, year: number, skip = 0): string => originWhere(g, field, year, (u) => u < 0.3, skip)
const stays = (g: GameState, field: FieldId, year: number, skip = 0): string => originWhere(g, field, year, (u) => u >= 0.3, skip)

describe('the step does nothing when there is nothing to do', () => {
  it('leaves a life with no shard without a world, in 2030 and in every year up to 2026', () => {
    for (const year of [1900, 1990, 2025, 2026, 2027, 2030, 2100]) {
      const g = lifeWith(undefined, year)
      const before = json(g)
      stepFrontier(g)
      expect(g.world, String(year)).toBeUndefined()
      expect(json(g), String(year)).toBe(before)
    }
  })

  it('changes nothing in 2026 or before, even with a shard', () => {
    for (const year of [2000, 2025, 2026]) {
      const g = lifeWith(shardOf({ fusion: rec({ pub: 100, rows: [row(2028, 'a')] }) }), year)
      const before = json(g)
      stepFrontier(g)
      expect(json(g), String(year)).toBe(before)
    }
  })

  it('writes nothing for a shard with no field in it', () => {
    const g = lifeWith(shardOf({}, 0), 2030)
    const before = json(g)
    stepFrontier(g)
    expect(json(g)).toBe(before)
  })

  it('changes nothing a second time in a year (idempotent by shard.y), however the first call went', () => {
    const o = follows(lifeWith(undefined), 'fusion', 2031)
    const g = lifeWith(shardOf({ fusion: rec({ pub: 100, rows: [row(2030, o, { d: 100 })] }) }), 2031)
    stepFrontier(g)
    expect(readFrontier(g).y).toBe(2031)
    const once = json(g)
    stepFrontier(g)
    stepFrontier(g)
    expect(json(g)).toBe(once)
  })

  it('stamps shard.y with the year, and steps again the next year', () => {
    const g = lifeWith(shardOf({ fusion: rec({ pub: 100 }) }), 2030)
    stepFrontier(g)
    expect(readFrontier(g).y).toBe(2030)
    expect(frontierSpill(g, 'fusion')).toBe(9)
    g.year = 2031
    stepFrontier(g)
    expect(readFrontier(g).y).toBe(2031)
    expect(readFrontier(g).f.fusion!.pub).toBe(81)
  })

  it('heals a stamp from the future (a hostile save) by stepping once and stamping the real year', () => {
    const g = lifeWith(shardOf({ fusion: rec({ pub: 100 }) }, 2100), 2030)
    stepFrontier(g)
    expect(readFrontier(g).y).toBe(2030)
    expect(readFrontier(g).f.fusion!.pub).toBe(90)
    g.year = 2031
    stepFrontier(g)
    expect(readFrontier(g).f.fusion!.pub).toBe(81)
  })
})

describe('public research fades', () => {
  it('turns 100 tenths into 90 and 1 into 0, in every field, by floor(pub x 0.9)', () => {
    const cases: [number, number][] = [[180, 162], [100, 90], [37, 33], [10, 9], [2, 1], [1, 0]]
    for (const [pub, want] of cases) {
      const g = lifeWith(shardOf({ fusion: rec({ pub, rows: [row(2030, 'a')] }), 'ai.coding': rec({ pub, rows: [row(2030, 'b', { d: 0 })] }) }), 2031)
      stepFrontier(g)
      expect(readFrontier(g).f.fusion!.pub, `pub ${pub}`).toBe(want)
      expect(readFrontier(g).f['ai.coding']!.pub, `pub ${pub} ai.coding`).toBe(want)
    }
  })

  it('drops a field that has faded to nothing, so a valid shard stays valid', () => {
    const g = lifeWith(shardOf({ fusion: rec({ pub: 1 }), chips: rec({ pub: 100 }) }), 2031)
    stepFrontier(g)
    expect(Object.keys(readFrontier(g).f)).toEqual(['chips'])
    expect(frontierProblems(readWorld(g).frontier)).toEqual([])
  })

  it('keeps the lead when public research fades: fold and rows are untouched', () => {
    const g = lifeWith(shardOf({ fusion: rec({ fold: 120, pub: 100, rows: [row(2031, 'a', { d: 80 }), row(2030, 'b', { d: 40, w: 'rival' })] }) }), 2031)
    const lead = frontierLead(g, 'fusion')
    stepFrontier(g)
    expect(frontierLead(g, 'fusion')).toBe(lead)
  })

  it('fades once a call, not once for each year skipped', () => {
    const g = lifeWith(shardOf({ fusion: rec({ pub: 100 }) }, 2030), 2036)
    stepFrontier(g)
    expect(readFrontier(g).f.fusion!.pub).toBe(90)
  })
})

describe('a rival follows a disclosure of yours', () => {
  const g0 = lifeWith(undefined)

  it('draws from the named stream: below 0.3 in 25% to 35% of 2,000 origins, and the same number twice', () => {
    let below = 0
    for (let i = 0; i < 2000; i++) {
      const u = followDraw(g0, 'fusion', `o${i}`, 2031)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
      expect(followDraw(g0, 'fusion', `o${i}`, 2031)).toBe(u)
      if (u < 0.3) below++
    }
    expect(below / 2000).toBeGreaterThan(0.25)
    expect(below / 2000).toBeLessThan(0.35)
  })

  it('draws another number for another field, year and origin, and draws nothing from g.rng', () => {
    const g = lifeWith(undefined)
    const rng = g.rng
    const nextId = g.nextId
    const draws = new Set([followDraw(g, 'fusion', 'a', 2031), followDraw(g, 'chips', 'a', 2031), followDraw(g, 'fusion', 'a', 2032), followDraw(g, 'fusion', 'b', 2031)])
    expect(draws.size).toBe(4)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
  })

  it('follows a row of age 1 to 4 whose draw is below 0.3, adds a rival row of floor(d/2) in the same market, and marks the row', () => {
    for (const age of [1, 2, 3, 4]) {
      const year = 2034
      const o = follows(g0, 'fusion', year)
      const g = lifeWith(shardOf({ fusion: rec({ ly: year - age, rows: [row(year - age, o, { d: 101, m: 'us' })] }) }), year)
      stepFrontier(g)
      const rows = rowsOf(g)
      expect(rows, `age ${age}`).toHaveLength(2)
      expect(rows[0]).toEqual({ y: year - age, w: 'you', m: 'us', d: 101, o, f: 1 })
      expect(rows[1], `age ${age}`).toEqual({ y: year, w: 'rival', m: 'us', d: 50, o: `f${o}` })
      expect(lastPush(g, 'fusion')).toBe(year)
      expect(frontierLead(g, 'fusion')).toBe(1.51)
    }
  })

  it('never follows a row of age 0 or age 5 or more, whatever the draw', () => {
    const year = 2040
    for (const age of [0, 5, 6, 9]) {
      const o = follows(g0, 'fusion', year)
      const g = lifeWith(shardOf({ fusion: rec({ ly: year - age, rows: [row(year - age, o, { d: 100 })] }) }), year)
      stepFrontier(g)
      expect(rowsOf(g), `age ${age}`).toHaveLength(1)
      expect(rowsOf(g)[0]!.f, `age ${age}`).toBeUndefined()
    }
  })

  it('does not follow a row whose draw is 0.3 or more', () => {
    const year = 2034
    const o = stays(g0, 'fusion', year)
    const g = lifeWith(shardOf({ fusion: rec({ rows: [row(2033, o, { d: 100 })] }) }), year)
    stepFrontier(g)
    expect(rowsOf(g)).toEqual([row(2033, o, { d: 100 })])
  })

  it('follows a row at most once: the mark stops a second follow in a later year, whatever that year draws', () => {
    // An origin that follows in both 2034 and 2035.
    let o = ''
    for (let i = 0; i < 4000 && o === ''; i++) if (followDraw(g0, 'fusion', `q${i}`, 2034) < 0.3 && followDraw(g0, 'fusion', `q${i}`, 2035) < 0.3) o = `q${i}`
    expect(o).not.toBe('')
    const g = lifeWith(shardOf({ fusion: rec({ ly: 2033, rows: [row(2033, o, { d: 100 })] }) }), 2034)
    stepFrontier(g)
    expect(rowsOf(g).filter((r) => r.w === 'rival')).toHaveLength(1)
    g.year = 2035
    stepFrontier(g)
    expect(rowsOf(g).filter((r) => r.w === 'rival')).toHaveLength(1)
    expect(rowsOf(g).filter((r) => r.f === 1)).toHaveLength(1)
  })

  it('draws so that about 30% of rows are followed in a year and about 76% within the four years of ages 1 to 4', () => {
    const origins = Array.from({ length: 400 }, (_, i) => `r${i}`)
    // 400 rows would break the caps of one field, so count the draws the step makes, year by year.
    const year0 = 2030
    const left = new Set(origins)
    const share: number[] = []
    for (let age = 1; age <= 4; age++) {
      for (const o of [...left]) if (followDraw(g0, 'fusion', o, year0 + age) < 0.3) left.delete(o)
      share.push(1 - left.size / origins.length)
    }
    expect(share[0]!).toBeGreaterThan(0.22)
    expect(share[0]!).toBeLessThan(0.38)
    expect(share[3]!).toBeGreaterThan(0.68)
    expect(share[3]!).toBeLessThan(0.84)
  })

  it('follows a rival row never, and a row with no lead (d is 0) never', () => {
    const year = 2034
    const a = follows(g0, 'fusion', year)
    const b = follows(g0, 'fusion', year, 1)
    const g = lifeWith(shardOf({ fusion: rec({ rows: [row(2033, a, { w: 'rival', d: 100 }), row(2033, b, { d: 0 })] }) }), year)
    stepFrontier(g)
    expect(rowsOf(g)).toHaveLength(2)
    expect(rowsOf(g).every((r) => r.f === undefined)).toBe(true)
  })

  it('never follows a row of an AI capability: it has no lead', () => {
    const year = 2034
    const o = follows(g0, 'ai.coding', year)
    const g = lifeWith(shardOf({ 'ai.coding': rec({ pub: 50, rows: [row(2033, o, { d: 0 })] }) }), year)
    stepFrontier(g)
    expect(rowsOf(g, 'ai.coding')).toEqual([row(2033, o, { d: 0 })])
    expect(frontierLead(g, 'ai.coding')).toBe(0)
    expect(frontierSpill(g, 'ai.coding')).toBe(5)   // 50 tenths fade to 45, and 4.5 points round to 5
  })

  it('adds a lead of at least one centi-year: d of 1 gives a rival row of 1', () => {
    const year = 2034
    const o = follows(g0, 'fusion', year)
    const g = lifeWith(shardOf({ fusion: rec({ rows: [row(2033, o, { d: 1 })] }) }), year)
    stepFrontier(g)
    expect(rowsOf(g)[1]).toMatchObject({ w: 'rival', d: 1 })
  })

  it('adds no spill: public research only fades', () => {
    const year = 2034
    const o = follows(g0, 'fusion', year)
    const g = lifeWith(shardOf({ fusion: rec({ pub: 100, rows: [row(2033, o, { d: 100 })] }) }), year)
    stepFrontier(g)
    expect(readFrontier(g).f.fusion!.pub).toBe(90)
  })

  it('cuts the follow to the 2 years a year: a field that has gained 1.90 in the year gets 0.10 more', () => {
    const year = 2034
    const o = follows(g0, 'fusion', year)
    // A rival row of 190 already in this year (another origin), and a player row of age 1 to follow.
    const g = lifeWith(shardOf({ fusion: rec({ ly: year, yg: 190, rows: [row(2033, o, { d: 300 }), row(year, 'x', { w: 'rival', d: 190 })] }) }), year)
    stepFrontier(g)
    const mine = rowsOf(g).find((r) => r.o === `f${o}`)!
    expect(mine).toMatchObject({ y: year, w: 'rival', d: 10 })
    expect(rowsOf(g).filter((r) => r.y === year).reduce((n, r) => n + r.d, 0)).toBeLessThanOrEqual(200)
  })

  it('cuts the follow to the 12 years in all: a field at 11.70 gets 0.30 more, and a field at 12.00 gets a row of 0', () => {
    const year = 2034
    const o = follows(g0, 'fusion', year)
    // 870 + 300 = 1170 held: 30 left, a follow of 150 is cut to 30.
    const near = lifeWith(shardOf({ fusion: rec({ fold: 870, rows: [row(2033, o, { d: 300 })] }) }), year)
    expect(frontierLead(near, 'fusion')).toBe(11.7)
    stepFrontier(near)
    expect(rowsOf(near).find((r) => r.o === `f${o}`)).toMatchObject({ w: 'rival', d: 30 })
    expect(frontierLead(near, 'fusion')).toBe(12)
    const full = lifeWith(shardOf({ fusion: rec({ fold: 900, rows: [row(2033, o, { d: 300 })] }) }), year)
    expect(frontierLead(full, 'fusion')).toBe(12)
    stepFrontier(full)
    expect(frontierLead(full, 'fusion')).toBe(12)
    expect(rowsOf(full).find((r) => r.o === `f${o}`)).toMatchObject({ d: 0, w: 'rival' })
  })

  it('holds every cap when a whole field is followed: rows, markets, the year and the lead', () => {
    const year = 2034
    const rows: FrontierRow[] = []
    for (let m = 0; m < 4; m++) for (let i = 0; i < 6; i++) rows.push(row(2030 + i % 4, follows(g0, 'fusion', year, m * 6 + i), { m: `m${m}`, d: 40 }))
    const g = lifeWith(shardOf({ fusion: rec({ rows }) }), year)
    stepFrontier(g)
    expect(rowsOf(g).length).toBeLessThanOrEqual(FRONTIER_CAPS.rowsPerMarket * FRONTIER_CAPS.marketsPerField)
    expect(frontierLead(g, 'fusion')).toBeLessThanOrEqual(FRONTIER_CAPS.leadYears)
    expect(new Set(rowsOf(g).map((r) => r.m)).size).toBeLessThanOrEqual(FRONTIER_CAPS.marketsPerField)
    expect(rowsOf(g).filter((r) => r.y === year).reduce((n, r) => n + r.d, 0)).toBeLessThanOrEqual(FRONTIER_CAPS.yearYears * 100)
    expect(frontierProblems(readWorld(g).frontier)).toEqual([])
    expect(worldProblems(g)).toEqual([])
  })

  it('writes a rival row once when two rows share an origin hash in different years', () => {
    const year = 2034
    const o = follows(g0, 'fusion', year)
    const g = lifeWith(shardOf({ fusion: rec({ rows: [row(2031, o, { d: 100 }), row(2032, o, { d: 100 })] }) }), year)
    stepFrontier(g)
    expect(rowsOf(g).filter((r) => r.w === 'rival')).toHaveLength(1)
    expect(rowsOf(g).filter((r) => r.f === 1)).toHaveLength(2)
    expect(frontierProblems(readWorld(g).frontier)).toEqual([])
  })

  it('keeps the origin of the rival row valid: the writer\'s key with an f in front is at most 8 characters', () => {
    let made = 0
    for (let i = 0; i < 120; i++) {
      const o = originKey(`origin-${i}`)
      expect(o.length).toBeLessThanOrEqual(7)
      const g = lifeWith(shardOf({ fusion: rec({ rows: [row(2033, o, { d: 100 })] }) }), 2034, `fam-${i}`)
      stepFrontier(g)
      for (const r of rowsOf(g)) expect(r.o).toMatch(/^[a-z0-9-]{1,8}$/)
      expect(frontierProblems(readWorld(g).frontier)).toEqual([])
      made += rowsOf(g).filter((r) => r.w === 'rival').length
    }
    expect(made).toBeGreaterThan(10)
  })

  it('follows what the writer wrote: a disclosure in 2030 is followed in 2031 to 2034 with a rival row, and the result is a valid shard', () => {
    let followed = 0
    for (let i = 0; i < 12; i++) {
      const g = lifeWith(undefined, 2030, `fam-${i}`)
      expect(applyDisclosure(g, { field: 'fusion', year: 2030, size: 0.6, origin: `wave-${i}`, by: 'you' })).toMatchObject({ applied: true })
      for (let y = 2031; y <= 2034; y++) {
        g.year = y
        stepFrontier(g)
      }
      expect(frontierProblems(readWorld(g).frontier)).toEqual([])
      expect(normalizeFrontier(readWorld(g).frontier)).toBe(readWorld(g).frontier)
      const mine = rowsOf(g).filter((r) => r.w === 'you')
      const rivals = rowsOf(g).filter((r) => r.w === 'rival')
      expect(rivals.length).toBeLessThanOrEqual(1)
      expect(mine[0]!.f === 1).toBe(rivals.length === 1)
      if (rivals.length === 1) {
        followed++
        expect(rivals[0]!.y).toBeGreaterThanOrEqual(2031)
        expect(rivals[0]!.y).toBeLessThanOrEqual(2034)
        expect(rivals[0]!.d).toBe(Math.max(1, Math.floor(mine[0]!.d / 2)))
      }
      // After 2034 the row is age 4, and after 2035 it is age 5: never followed later.
      g.year = 2035
      const marked = mine[0]!.f === 1
      stepFrontier(g)
      expect(rowsOf(g).filter((r) => r.w === 'rival')).toHaveLength(marked ? 1 : 0)
    }
    expect(followed).toBeGreaterThan(3)
  })
})

describe('the step is replay-safe and draws no g.rng', () => {
  const setup = (year: number, fam = 'test-life'): GameState => {
    const g0 = lifeWith(undefined, year, fam)
    const rows = Array.from({ length: 20 }, (_, i) => row(year - 1 - (i % 3), `n${i}`, { m: `m${i % 4}`, d: 40 + i }))
    return lifeWith(shardOf({ fusion: rec({ pub: 90, rows }), chips: rec({ pub: 30, rows: [row(year - 1, follows(g0, 'chips', year), { d: 120 })] }) }), year, fam)
  }
  const flagged = (g: GameState): string[] => rowsOf(g).filter((r) => r.f === 1).map((r) => `${r.y}|${r.o}`)

  it('leaves g.rng, g.nextId and everything outside the world alone, the log and the queue included', () => {
    const g = setup(2031)
    const rng = g.rng
    const nextId = g.nextId
    const rest = (x: GameState): string => JSON.stringify({ ...x, world: undefined })
    const before = rest(g)
    stepFrontier(g)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
    expect(rest(g)).toBe(before)   // the log, the queue and every other key
  })

  it('gives the same shard on a structuredClone and on a JSON reload', () => {
    const g = setup(2031)
    const a = structuredClone(g)
    const b = JSON.parse(JSON.stringify(g)) as GameState
    stepFrontier(g)
    stepFrontier(a)
    stepFrontier(b)
    expect(json(a)).toBe(json(g))
    expect(JSON.stringify(readFrontier(b))).toBe(JSON.stringify(readFrontier(g)))
  })

  it('gives an heir of the same family the same follows, and another family other follows at least sometimes', () => {
    const a = setup(2031, 'fam-x')
    const b = setup(2031, 'fam-x-g2')
    const c = setup(2031, 'other-family')
    for (const g of [a, b, c]) stepFrontier(g)
    expect(flagged(b)).toEqual(flagged(a))
    expect(flagged(c)).not.toEqual(flagged(a))
  })

  it('re-rolls the year a Time Machine jump lands in, and keeps every year that was finished before it', () => {
    const plain = setup(2031)
    const landing = setup(2031)
    landing.flags.timelineForks = [{ year: 2031, salt: 'abc' }]
    const later = setup(2031)
    later.flags.timelineForks = [{ year: 2032, salt: 'abc' }]
    for (const g of [plain, landing, later]) stepFrontier(g)
    expect(flagged(landing)).not.toEqual(flagged(plain))
    expect(flagged(later)).toEqual(flagged(plain))
  })

  it('works on a deep-frozen shard root, and leaves the old root as it was', () => {
    const g = setup(2031)
    const root = readWorld(g).frontier as FrontierShard
    deepFreeze(root)
    const before = JSON.stringify(root)
    expect(() => stepFrontier(g)).not.toThrow()
    expect(JSON.stringify(root)).toBe(before)
    expect(readWorld(g).frontier).not.toBe(root)
    expect(readFrontier(g).y).toBe(2031)
  })
})

describe('the module is registered in the frontier phase, before the history step', () => {
  it('is world.frontier, layer 2, owning the slice world.frontier, with one aging entry in phase frontier at order 10', () => {
    expect(frontierModule.id).toBe('world.frontier')
    expect(frontierModule.layer).toBe(2)
    expect(frontierModule.slices).toEqual(['world.frontier'])
    expect(frontierModule.yearly).toEqual([{ seam: 'aging', phase: 'frontier', order: 10, run: stepFrontier }])
    const reg = getModule('world.frontier')
    expect(reg).toBeDefined()
    expect(reg!.yearly).toEqual([{ seam: 'aging', phase: 'frontier', order: 10, run: expect.any(Function) }])
  })

  it('has its slice in the registry, and its entry before yearly.history in the aging list', () => {
    expect(registeredSlices()).toContain('world.frontier')
    const ids = yearlyEntries('aging').map((e) => e.id)
    expect(ids).toContain('world.frontier')
    expect(ids.indexOf('world.frontier')).toBeLessThan(ids.indexOf('yearly.history'))
    expect(ids[0]).toBe('world.frontier')
  })

  it('runs inside ageUp: a life with a hand-built shard fades it in 2030, and stamps the year', () => {
    const g = makeTestGame(1, { age: 40, money: 50_000 })
    g.year = 2029
    ;(g as { world?: unknown }).world = { v: 1, frontier: shardOf({ fusion: rec({ pub: 100, ly: 2028, rows: [row(2028, 'a', { d: 50 })] }) }, 2029) }
    ageUp(g)
    expect(g.year).toBe(2030)
    expect(readFrontier(g).y).toBe(2030)
    expect(readFrontier(g).f.fusion!.pub).toBe(90)
    expect(frontierLead(g, 'fusion')).toBeGreaterThanOrEqual(0.5)
    expect(worldProblems(g)).toEqual([])
  })

  it('leaves an ordinary life without a frontier key after ageUp', () => {
    const g = makeTestGame(3, { age: 40, money: 50_000 })
    g.year = 2029
    ageUp(g)
    expect(g.year).toBe(2030)
    expect((g.world ?? {}) as Record<string, unknown>).not.toHaveProperty('frontier')
  })
})

describe('the docs and every field', () => {
  const doc = (f: string): string => readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8')

  it('names world.frontier 10 in the frontier row of the KERNEL phase table', () => {
    const line = doc('KERNEL.md')
      .split('\n')
      .find((l) => l.startsWith('| `frontier` |'))
    expect(line).toBeDefined()
    expect(line).toContain('world.frontier 10')
    expect(line).not.toContain('(empty)')
  })

  it('has a bullet in STREAMS.md for the frontier tag', () => {
    const text = doc('STREAMS.md')
    expect(text).toMatch(/`frontier`/)
    expect(text).toMatch(/frontier[^\n]*outcomeStream|outcomeStream[^\n]*frontier/)
  })

  it('covers every field in table order: all 20 fade, and the result is a shard the reader keeps as it is', () => {
    const f: FrontierShard['f'] = {}
    for (const id of FIELD_IDS) f[id] = rec({ pub: 100, rows: [row(2030, 'a', { d: id.startsWith('ai.') ? 0 : 20 })] })
    const g = lifeWith(shardOf(f), 2031)
    stepFrontier(g)
    expect(Object.keys(readFrontier(g).f)).toEqual([...FIELD_IDS])
    for (const id of FIELD_IDS) expect(readFrontier(g).f[id]!.pub, id).toBe(90)
    expect(normalizeFrontier(readWorld(g).frontier)).toBe(readWorld(g).frontier)
  })
})
