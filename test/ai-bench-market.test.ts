import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAP_IDS } from '../src/game/business/ai-bench-data'
import { benchHard, benchScore, capBest, capOpen, capMilestone, capWeight, compositeRating } from '../src/game/business/ai-bench'
import { benchStats, bestRival, capFrontier, firstToLead, labLead, labStanding, marketYear, modelLead } from '../src/game/business/ai-bench-market'
import { marketDef } from '../src/game/business/competition-data'
import { activeRivals, rawPull, rosterOf } from '../src/game/business/competition-roster'
import type { AiModel } from '../src/game/business/deeptech-state'
import { lab, offBest, rated } from './ai-bench-kit'

const FAM = 'test-life', T = (...models: AiModel[]) => ({ models })
describe('capFrontier', () => {
  it('is null before a capability opens and puts the leader exactly on capBest, rows sorted, scored on the year\'s test', () => {
    expect([capFrontier(FAM, 'coding', 2020), capFrontier(FAM, 'language', 2011)]).toEqual([null, null])
    for (const c of CAP_IDS) for (const y of [2022, 2026, 2035, 2060]) if (capOpen(c) <= y) { const f = capFrontier(FAM, c, y)!
      expect([f.best, f.leader.rating, f.score]).toEqual([capBest(FAM, c, y), f.best, benchScore(f.best, benchHard(FAM, c, y))]); expect(f.rows[0]).toEqual(f.leader)
      f.rows.forEach((r, i) => { expect(Number.isInteger(r.rating) && r.rating >= 0 && r.rating <= f.best).toBe(true); if (i) expect(r.rating).toBeLessThanOrEqual(f.rows[i - 1].rating) }) }
  })
  it('lists only labs active that year with at least a tenth of the strongest pull, tags real labs modeled, drops exited ones, and different labs lead', () => {
    const d = marketDef('aiLab')
    for (const y of [2013, 2020, 2026, 2040]) { const roster = rosterOf(FAM, 'aiLab', 'world'), pulls = new Map(activeRivals(roster, y).map((r): [string, number] => [r.id, rawPull(d, r, y)])), top = Math.max(...pulls.values()), f = capFrontier(FAM, 'language', y)!
      for (const r of f.rows) { expect(pulls.get(r.id)!).toBeGreaterThanOrEqual(0.1 * top); expect(r.modeled).toBe(!!roster.byId.get(r.id)!.real) }
      expect(f.rows).toHaveLength([...pulls.values()].filter((w) => w >= 0.1 * top).length) }
    const names = (y: number) => capFrontier(FAM, 'language', y)!.rows.map((r) => r.name)
    expect(names(2020)).toContain('DeepMind'); expect(names(2026)).not.toContain('DeepMind'); expect(capFrontier(FAM, 'language', 2026)!.rows.find((r) => r.name === 'OpenAI')?.modeled).toBe(true)
    expect(capFrontier(FAM, 'language', 2026)!.rows.length).toBeGreaterThanOrEqual(15); expect(capFrontier(FAM, 'language', 2026)!.rows.length).toBeLessThanOrEqual(32)
    expect(new Set(CAP_IDS.map((c) => capFrontier(FAM, c, 2026)!.leader.id)).size).toBeGreaterThanOrEqual(2)
  })
  it('marketYear is the first year capBest reaches each milestone, inside the windows the spec expects', () => {
    for (const f of ['test-life', 'alpha', 'bravo', 'carol']) for (const c of CAP_IDS) { const ys = ([1, 2, 3] as const).map((k) => marketYear(f, c, k))
      ys.forEach((y, i) => { const m = capMilestone(c, (i + 1) as 1 | 2 | 3); expect(capBest(f, c, y)).toBeGreaterThanOrEqual(m); expect(capBest(f, c, y - 1)).toBeLessThan(m) })
      expect(ys[0]).toBeGreaterThanOrEqual(2027); expect(ys[0]).toBeLessThanOrEqual(2030); expect(ys[1]).toBeGreaterThanOrEqual(2029); expect(ys[1]).toBeLessThanOrEqual(2033); expect(ys[2]).toBeGreaterThanOrEqual(2032); expect(ys[2]).toBeLessThanOrEqual(2038) }
  })
})
describe('bestRival and catch-up', () => {
  const Y = 2027, ahead = (o: Partial<AiModel> = {}) => rated(FAM, 1, Y, { language: capBest(FAM, 'language', Y) + 400 }, o)
  const at = (y: number, o: Partial<AiModel> = {}) => bestRival(FAM, y, [ahead(o)])!.composite - bestRival(FAM, y, [])!.composite
  it('reports the strongest lab by composite, below the sum of the per-capability bests', () => {
    const r = bestRival(FAM, 2026, [])!; expect(r.composite).toBeGreaterThan(1100); expect(r.composite).toBeLessThanOrEqual(compositeRating(offBest(FAM, 2026, 0), 2026))
    expect([typeof r.leader, typeof r.modeled, r.score >= 0 && r.score <= 99]).toEqual(['string', 'boolean', true])
  })
  it('lifts every rival by floor minus leader from two years after a closed release, one after open weights, never for a held model', () => {
    const w = (y: number) => capWeight('language', y), lift = (y: number) => capBest(FAM, 'language', Y) + 330 - capBest(FAM, 'language', y)
    expect(at(Y + 1)).toBe(0); expect(at(Y + 2)).toBeCloseTo(w(Y + 2) * lift(Y + 2), 6); expect(at(Y, { open: true })).toBe(0); expect(at(Y + 1, { open: true })).toBeCloseTo(w(Y + 1) * lift(Y + 1), 6); expect(at(Y + 5, { held: true })).toBe(0)
  })
  it('keeps an older release\'s catch-up when a newer, weaker model arrives', () => {
    const old = ahead(), newer = rated(FAM, 2, Y + 1, { language: 1000 })
    expect(bestRival(FAM, Y + 2, [old, newer])!.composite).toBe(bestRival(FAM, Y + 2, [old])!.composite)
  })
})
describe('labStanding and labLead', () => {
  it('is null without a rated best model, before 2012, or when every model is dated after the year', () => {
    const un: AiModel = { gen: 1, name: 'N 1', score: 50, open: false, year: 2026 }
    expect([labStanding(FAM, T(), 2026), labStanding(FAM, T(un), 2026), labStanding(FAM, T(rated(FAM, 1, 2011, { language: 100 })), 2011), labStanding(FAM, T(rated(FAM, 1, 2026, offBest(FAM, 2026, 0))), 2025), labLead(FAM, T(), 2026)]).toEqual([null, null, null, null, null])
  })
  it('puts the lab on the same board: a row per open capability, rank by score, mine equals the model score at its own year, lead equals labLead', () => {
    const m = rated(FAM, 3, 2026, offBest(FAM, 2026, 50)), s = labStanding(FAM, T(m), 2026)!
    expect(s).toMatchObject({ year: 2026, model: 'Nova 3' }); expect(s.caps.map((r) => r.id)).toEqual(CAP_IDS.filter((c) => capOpen(c) <= 2026))
    expect([s.composite.mine, s.composite.rank, s.composite.of]).toEqual([m.score, 1, capFrontier(FAM, 'language', 2026)!.rows.length + 1]); expect(s.caps.every((r) => r.rank === 1)).toBe(true)
    expect(s.lead).toBeGreaterThan(0); expect(s.lead).toBe(labLead(FAM, T(m), 2026)); expect(s.leader).not.toBeNull()
    const behind = labStanding(FAM, T(rated(FAM, 3, 2026, offBest(FAM, 2026, -400))), 2026)!; expect(behind.composite.rank).toBe(behind.composite.of); expect(behind.lead).toBeLessThan(-300)
  })
  it('a model with no rating in a newer capability scores 0 there and ranks last, with no NaN', () => {
    const s = labStanding(FAM, T(rated(FAM, 1, 2016, { language: 700, vision: 800 })), 2026)!, c = s.caps.find((r) => r.id === 'coding')!
    expect([c.mine, c.rank]).toEqual([0, c.of]); expect(JSON.stringify(s)).not.toMatch(/NaN|null/)
  })
  it('trend compares the same lab one year earlier on this year\'s test, so a retired generation is not a fall and a new model reads as up', () => {
    let y = 2014; while (benchHard(FAM, 'language', y) <= benchHard(FAM, 'language', y - 1)) y++
    const m = rated(FAM, 1, y - 2, offBest(FAM, y - 2, 0)), row = (yr: number, ...ms: AiModel[]) => labStanding(FAM, T(...ms), yr)!.caps.find((r) => r.id === 'language')!
    expect(row(y, m).mine).toBeLessThan(row(y - 1, m).mine); expect(row(y, m).trend).toBe(0)
    expect(row(y, m, rated(FAM, 2, y, offBest(FAM, y, 40))).trend).toBe(1)
  })
})
describe('modelLead and firstToLead', () => {
  it('compare a model with the best rival of its own year, and only the first model that leads counts', () => {
    const lead = rated(FAM, 2, 2026, offBest(FAM, 2026, 60)), typical = rated(FAM, 1, 2025, offBest(FAM, 2025, -40)), second = rated(FAM, 3, 2027, offBest(FAM, 2027, 80))
    expect(modelLead(FAM, [lead], lead)).toBeCloseTo(compositeRating(lead.rating, 2026) - bestRival(FAM, 2026, [lead])!.composite, 6); expect(modelLead(FAM, [typical], typical)!).toBeLessThan(0)
    expect([firstToLead(FAM, [lead], lead), firstToLead(FAM, [lead, second], second), firstToLead(FAM, [typical], typical)]).toEqual([true, false, false])
    expect(firstToLead(FAM, [{ gen: 1, name: 'N 1', score: 99, open: false, year: 2026 }, lead], lead)).toBe(false)   // an earlier unrated model at the frontier counts
  })
})
describe('purity and cost', () => {
  it('reads leave the game and its random stream untouched', () => {
    const L = lab(); L.t.models = [rated(L.fam, 1, 2026, offBest(L.fam, 2026, 0))]; const before = JSON.stringify(L.g), rng = L.g.rng
    for (let y = 2012; y < 2040; y++) { labStanding(L.fam, L.t, y); labLead(L.fam, L.t, y); bestRival(L.fam, y, L.t.models); for (const c of CAP_IDS) capFrontier(L.fam, c, y) }
    expect([JSON.stringify(L.g), L.g.rng]).toEqual([before, rng])
  })
  it('1,000 leads build the board once, and the caches stay bounded at 600', () => {
    const m = rated('perf-fam', 1, 2031, offBest('perf-fam', 2031, 0)), n0 = benchStats().builds
    for (let i = 0; i < 1000; i++) labLead('perf-fam', T(m), 2031)
    expect(benchStats().builds - n0).toBe(1); for (let i = 0; i < 610; i++) bestRival(`flood${i}`, 2030, [])
    expect(benchStats().boards).toBeLessThanOrEqual(600); expect(benchStats().fronts).toBeLessThanOrEqual(600)
  })
  it('no pure bench file reads the game year, the random stream or the clock', () => {
    for (const f of ['scorecard', 'ai-bench-data', 'ai-bench', 'ai-bench-market']) expect(readFileSync(new URL(`../src/game/business/${f}.ts`, import.meta.url), 'utf8'), f).not.toMatch(/\bg\.(year|rng)\b|\brand\(|\bchance\(|Math\.random|Date\.now|from '\.\.\/rng'/)
  })
})
