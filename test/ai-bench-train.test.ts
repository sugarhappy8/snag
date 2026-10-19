import { describe, expect, it, vi } from 'vitest'
import { CAP_IDS, type CapMap } from '../src/game/business/ai-bench-data'
import { capBest, compositeRating, modelRating, modelScore, modelSpec } from '../src/game/business/ai-bench'
import { bestRival } from '../src/game/business/ai-bench-market'
import { bestTechPlan, competitiveness, demandScale, techPlan, techPremium, techPriceBounds } from '../src/game/business/deeptech-core'
import { frontierScore, programDef, type ProgCtx } from '../src/game/business/deeptech-data'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import { cycleOf } from '../src/game/business/economy'
import { advancePrograms } from '../src/game/business/deeptech-rd'
import { simulateDeepTechYearImpl } from '../src/game/business/deeptech-sim'
import { act, lab, priors, rated } from './ai-bench-kit'

const FAM = 'test-life', train = programDef('aiLab', 'train')!
const T = (p: Partial<TechState> = {}) => Object.assign(readTech(undefined), { level: 70, plant: 1, rented: 2, models: priors(5), ...p })
const last = (t: TechState) => t.models[t.models.length - 1]
const win = (t: TechState, o: Partial<ProgCtx> = {}) => train.win({ t, countryId: 'us', year: 2026, roll: () => 0.5, company: 'Test Lab', fam: FAM, rival: (y) => bestRival(FAM, y, t.models), ...o })
const withLead = (lead: number, fam = FAM) => { const r = Math.round(bestRival(fam, 2026, [])!.composite) + lead; return T({ stage: 3, models: [rated(fam, 1, 2026, Object.fromEntries(CAP_IDS.map((c) => [c, r])) as CapMap)] }) }
describe('trainWin on the rated path', () => {
  it('rates every open capability with one roll, stores the composite score, and keeps level +5 and stage 1', () => {
    const t = T(), roll = vi.fn(() => 0.5); win(t, { roll }); const m = last(t)
    expect(roll).toHaveBeenCalledTimes(1); expect(m).toMatchObject({ gen: 6, name: 'Nova 6', year: 2026, open: false }); expect(Object.keys(m.rating!).sort()).toEqual([...CAP_IDS].sort())
    for (const c of CAP_IDS) expect(m.rating![c]).toBe(modelRating({ cap: c, year: 2026, fam: FAM, gen: 6, level: 70, compute: 3.6, research: 0, spec: modelSpec(FAM, 6, c), roll: 0.5, released: 0 }))
    expect(m.score).toBe(Math.max(5, Math.min(99, modelScore(FAM, m.rating!, 2026)))); expect([t.level, t.stage]).toEqual([75, 1])
    const r = T({ caps: { coding: 4 } }); win(r); const d = last(r).rating!.coding! - m.rating!.coding!; expect(d).toBeGreaterThan(30); expect(d).toBeLessThanOrEqual(80)   // research feeds the next model, damped by the ceiling
  })
  it('caps a lead at 90 over the market on one model', () => {
    const t = T({ level: 100, plant: 6, rented: 0, caps: { language: 10 }, models: priors(7) }); win(t, { roll: () => 1 })
    expect(last(t).rating!.language! - capBest(FAM, 'language', 2026)).toBeLessThanOrEqual(90); expect(last(t).rating!.language! - capBest(FAM, 'language', 2026)).toBeGreaterThan(60)
  })
  it('sets hype by lead over the best rival and ends the line with the matching sentence (at most 120 characters)', () => {
    const probe = T(); win(probe); const C = compositeRating(last(probe).rating, 2026)
    const run = (gap: number) => { const t = T({ hype: 20 }), line = win(t, { rival: () => ({ composite: C + gap, score: 79, leader: 'OpenAI', modeled: true }) }); return { hype: t.hype - 20, line } }
    expect([run(-10).hype, run(40).hype, run(100).hype]).toEqual([20, 8, 2])
    expect(run(40).line).toBe(`Nova 6 finished training and scored ${last(probe).score}. The best rival scores 79. It's close to the best.`)
    expect(run(-10).line).toMatch(/It leads the field\.$/); expect(run(100).line).toMatch(/It trails the best\.$/); expect(run(40).line.length).toBeLessThanOrEqual(120)
  })
  it('advancePrograms hands the family and the board to a finished train program', () => {
    for (let seed = 1; seed < 30; seed++) { const L = lab({ stage: 3, models: priors(2) }, 2026, seed), before = L.t.hype
      L.t.programs = [{ id: 'train', key: 'train:1', name: 'Train', emoji: 'x', years: 1, progress: 1, cost: 0, odds: 0.98, started: 2025, spent: 0, target: '' }]
      const out = advancePrograms(L.g, L.a, L.b, L.t, 2026); if (!out.newModel) continue
      expect(last(L.t).rating).toBeDefined(); expect(L.t.hype).toBeGreaterThan(before); return }
    throw new Error('no seed trained a model')
  })
})
describe('legacy path (review focus 1)', () => {
  it('a lab with no rated model, or any lab before 2012, keeps today\'s numbers', () => {
    for (const [o, y] of [[{ fam: undefined, rival: undefined }, 2026], [{ year: 2011 }, 2011], [{ rival: undefined }, 2026]] as const) {
      const t = T(), roll = vi.fn(() => 0.5), line = win(t, { roll, ...o })
      expect(roll).toHaveBeenCalledTimes(1); expect('rating' in last(t)).toBe(false); expect(line).toMatch(/benchmark score \d+/); expect(last(t).score).toBe(Math.round(frontierScore(y) - 38 + 24.5 + 12 + 3.6))
    }
    const old = T({ stage: 3, models: [{ gen: 1, name: 'Nova 1', score: 80, open: false, year: 2026 }] })
    expect(competitiveness(old, 2026, FAM)).toBeCloseTo((80 - (frontierScore(2026) - 25)) / 25, 9); expect(competitiveness(T({ models: [] }), 2026, FAM)).toBe(0)
  })
})
describe('competitiveness, premium and demand from the lead', () => {
  const C = (l: number) => competitiveness(withLead(l), 2026, FAM)
  it('maps lead 0 to 1.0, +21 to 1.11, -130 to 0.32 and clamps at 1.6 and 0.05', () => {
    // withLead rounds the board's composite to a whole rating, so each lead is off by up to half a point: compare with 1 + lead / 190 within 0.005
    expect([C(0), C(21), C(-130)]).toEqual([expect.closeTo(1, 2), expect.closeTo(1.1105, 2), expect.closeTo(0.3158, 2)]); expect([C(500), C(-1100)]).toEqual([1.6, 0.05])
  })
  it('grades the premium by lead (1 up to 0, 1.075 at +75, 1.15 from +150) and keeps the frontier test for an unrated best model', () => {
    const { g, b, fam } = lab(), P = (t: TechState) => techPremium(b, t, 2026, true, g)
    expect(P(withLead(-50, fam))).toBeCloseTo(1, 2); expect(P(withLead(75, fam))).toBeCloseTo(1.075, 2); expect(P(withLead(300, fam))).toBeCloseTo(1.15, 2)
    const u = (score: number) => T({ models: [{ gen: 1, name: 'N 1', score, open: false, year: 2026 }] }); expect([P(u(70)), P(u(69))]).toEqual([expect.closeTo(1.15, 9), expect.closeTo(1, 9)])
  })
  it('demand follows the lead, takes x0.75 for an open best model, and is 0 with no unheld model', () => {
    const { b, fam } = lab(), D = (t: TechState) => demandScale(b, t, 2026, fam), t0 = withLead(0, fam)
    expect(D(withLead(100, fam))).toBeGreaterThan(D(withLead(-100, fam))); expect(D({ ...t0, models: [{ ...t0.models[0], open: true }] })).toBeCloseTo(D(t0) * 0.75, 9); expect(D({ ...t0, models: [{ ...t0.models[0], held: true as const }] })).toBe(0)
  })
  it('the pitch hint reads the same competitiveness as the pitch odds: lead -15 hints (0.92), lead -21 does not (0.89)', () => {
    const L = lab({ stage: 3 }); L.g.character.talents = ['Business']
    const hint = (lead: number) => { L.t.models = withLead(lead, L.fam).models; return act(L.g, L.a, 'dt.enterprise').hint?.(L.g) ?? null }
    expect(hint(-15)).toMatch(/probably win/); expect(hint(-21)).toBeNull()
  })
  it('calibrates a typical lab near 1, a maxed lab near the ceiling and a weak lab low (planning probe: 0.997, 1.486, 0.376)', () => {
    const at = (p: Partial<TechState>) => { const t = T({ stage: 3, ...p }); win(t); return competitiveness(t, 2026, FAM) }
    const typical = at({}), maxed = at({ level: 100, plant: 6, rented: 0, models: priors(7) }), weak = at({ level: 40, plant: 0, rented: 2, models: priors(3) })
    expect([typical >= 0.95 && typical <= 1.25, maxed >= 1.25 && maxed <= 1.6, weak >= 0.2 && weak <= 0.5]).toEqual([true, true, true])
  })
  it('keeps the calibration in real play: a model trained in year Y first sells in Y + 1, against the board it was rated on', () => {
    // Training ends fiscal year Y (the model is stamped Y) and the first yearly that sells it plans for Y + 1.
    for (const Y of [2016, 2020, 2022, 2024, 2025, 2026, 2030]) {
      const t = T({ stage: 3 }); win(t, { year: Y })
      const first = competitiveness(t, Y + 1, FAM)
      expect([Y, first >= 0.9 && first <= 1.25]).toEqual([Y, true]); expect(first).toBeCloseTo(competitiveness(t, Y, FAM), 9)
    }
    const t = T({ stage: 3 }); win(t, { year: 2026 })
    expect(competitiveness(t, 2028, FAM)).toBeLessThan(competitiveness(t, 2027, FAM))   // it still ages one board a year after that
  })
  it('keeps a lead of +150 worth the full premium in the first sales year, and the first-year demand near the old formula\'s', () => {
    const { g, b, fam } = lab({ stage: 3 }, 2027)
    expect(techPremium(b, withLead(150, fam), 2027, true, g)).toBeCloseTo(1.15, 2)
    const typical = T({ stage: 3 }); win(typical, { year: 2026 })
    const legacy = T({ stage: 3 }); win(legacy, { fam: undefined, rival: undefined, year: 2026 })
    expect(demandScale(b, typical, 2027, FAM) / demandScale(b, legacy, 2027, FAM)).toBeGreaterThan(0.85)
  })
})
describe('the hired manager plans for the year the yearly sells', () => {
  // A real yearly runs at g.year = fiscal + 1 and sells fiscal year F; the manager re-plans inside it.
  const managed = (F: number) => {
    const L = lab({ stage: 3, level: 70, plant: 1, rented: 2, models: priors(5) }, F + 1); L.g.character.job = null
    win(L.t, { year: F - 1, fam: L.fam, rival: (y) => bestRival(L.fam, y, L.t.models) })   // trained in the previous yearly, first sells now
    return L
  }
  it('bestTechPlan and techPriceBounds take the plan year, and default to g.year', () => {
    const L = managed(2024), at = (year?: number) => bestTechPlan(L.g, L.b, L.t, undefined, year)
    expect(at(2024)).not.toEqual(at(2025)); expect(at()).toEqual(at(2025)); expect(techPriceBounds(L.g, L.b, L.t, 2024).going).not.toBe(techPriceBounds(L.g, L.b, L.t).going)
    const plan = at(2024), sold = techPlan(L.g, L.b, L.t, 2024, { price: plan.price, calm: true })
    expect(plan.production).toBe(Math.round(Math.max(0, Math.min(sold.capacity, sold.demand))))
  })
  it('re-plans at the fiscal year, so what it makes meets the demand the yearly then sells at', () => {
    for (const F of [2020, 2022, 2024, 2026, 2030]) {
      const L = managed(F), { stmt } = simulateDeepTechYearImpl(L.g, L.a, L.b, F, 0)
      // What the plan could expect at F (a manager of skill 50 reads last year's cycle), not the cycle's luck on the day.
      const want = techPlan(L.g, L.b, L.t, F, { price: stmt.price, calm: true, cycle: cycleOf(L.g, L.b.countryId, F - 1) }).demand
      expect([F, stmt.produced > 0.8 * want, stmt.produced < 1.3 * want]).toEqual([F, true, true])
    }
  })
})
