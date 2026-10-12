// The new business events (business/events-extra.ts): they appear only where and when they make
// sense, every choice resolves, money moves once, the Business talent's hint costs no dice and
// points at the choice that works out best under the resolver's own odds.
import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { bizWorth, evolve, fxValue, recordYear, simulateYear, staffNet, startupCost, valuationOf, LASTING_YEARS, type BizFx } from '../src/game/business/economy'
import { businessEventInternals, eventChance, maybeBusinessEvent } from '../src/game/business/events'
import { EXTRA_EVENTS, equityGain, extraEventInternals, PITCH_PREMIUM_P, stakePrice, trendsFor } from '../src/game/business/events-extra'
import { franchiseFee, franchiseValue, ONBOARDING, readFranchise } from '../src/game/business/franchise'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { rdProjects } from '../src/game/business/rd'
import { bizOf, findBusiness, readBiz, totalOutlets, type BizState } from '../src/game/business/state'
import { applyPlan, autoPlan } from '../src/game/business/yearly'
import { anachronismsIn } from '../src/game/events/era'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'

interface Setup {
  id: string
  industry: string
  year?: number
  country?: string
  prep?: (b: BizState, g: GameState) => void
}

function company(seed: number, s: Setup, talent: boolean): { g: GameState; a: Asset; b: BizState } {
  const country = s.country ?? 'us'
  const g = createNewLife({ seed, year: 1960, countryId: country })
  g.queue = []
  g.year = (s.year ?? 2016) - 3
  const c = g.character
  c.age = 35
  c.money = 3_000_000
  c.talent = null
  c.talents = talent ? ['Business'] : undefined
  c.licenses = ['driver']
  const b0 = newBiz(g, s.industry as BizState['industry'], country, getCountry(country).cities[0], { cash: 600_000, brand: 55, quality: 65 })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < 3; y++) {
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    b.valuation = valuationOf(b)
    g.year += 1
    applyPlan(b, autoPlan(g, b, r.stmt.cycle))
  }
  b.brand = 55
  b.quality = 65
  if (b.last && b.last.net <= 0) b.last = { ...b.last, net: 25_000 }
  if (b.history.length && b.history[b.history.length - 1].profit <= 0) b.history[b.history.length - 1].profit = 25_000
  b.valuation = Math.max(b.valuation, 500_000)
  s.prep?.(b, g)
  g.queue = []
  return { g, a, b }
}

const SETUPS: Setup[] = [
  { id: 'franchisePitch', industry: 'restaurant' },
  { id: 'critic', industry: 'restaurant' },
  { id: 'influencer', industry: 'cafe', year: 2016 },
  { id: 'breach', industry: 'software', year: 2008 },
  { id: 'union', industry: 'restaurant', prep: (b) => { b.employees = 25; b.morale = 50 } },
  { id: 'bid', industry: 'construction' },
  { id: 'localCopycat', industry: 'restaurant' },
  { id: 'employeeIdea', industry: 'restaurant' },
  { id: 'rent', industry: 'restaurant' },
  { id: 'prime', industry: 'restaurant', prep: (b) => { b.cash = 3_000_000 } },
  { id: 'starInvestor', industry: 'restaurant' },
  { id: 'trend', industry: 'cafe', year: 2016 },
]

/** Events whose every effect is a plain BizFx (checked by simulation against the hint). */
const FX_ONLY = new Set(['critic', 'influencer', 'breach', 'union', 'bid', 'localCopycat', 'rent', 'trend'])

function lastChoice(g: GameState): ChoiceModal {
  const m = [...g.queue].reverse().find((x): x is ChoiceModal => x.kind === 'choice')
  if (!m) throw new Error('no choice queued')
  return m
}

function weightOf(g: GameState, b: BizState, id: string): number {
  return EXTRA_EVENTS.find((e) => e.id === id)!.weight(g, b)
}

/** What a resolved choice did, in the talent's dollars (the same yardstick as test/talent-business). */
function measure(g0: GameState, g1: GameState, assetId: string): number {
  const b0 = readBiz(g0, findBusiness(g0, assetId)!)
  const w = bizWorth(g0, b0)
  const b1 = readBiz(g1, findBusiness(g1, assetId)!)
  const fx: BizFx = {
    cash: b1.cash - b0.cash,
    brand: b1.brand - b0.brand,
    quality: b1.quality - b0.quality,
    morale: b1.morale - b0.morale,
    demandTo: b1.demandShock,
    capacityTo: b1.capacityLoss,
    costSet: b1.costShock,
    pressureTo: b1.pressure,
    wage: b1.wageLevel - b0.wageLevel,
    karma: g1.character.hidden.karma - g0.character.hidden.karma,
  }
  const team = (b: BizState) => b.staff.reduce((t, s) => t + staffNet(g0, b0, w, s), 0) * LASTING_YEARS
  return fxValue(g0, b0, w, fx) + team(b1) - team(b0)
}

describe('new business events: availability', () => {
  it('each event can happen in its setting and is registered with the yearly picker', () => {
    const ids = businessEventInternals.ids()
    for (const s of SETUPS) {
      expect(ids, s.id).toContain(s.id)
      const { g, b } = company(21, s, true)
      expect(weightOf(g, b, s.id), s.id).toBeGreaterThan(0)
    }
  }, 120_000)

  it('respects eras and industries', () => {
    const early = company(22, { id: 'influencer', industry: 'cafe', year: 2005 }, true)
    expect(weightOf(early.g, early.b, 'influencer')).toBe(0)
    const old = company(22, { id: 'breach', industry: 'software', year: 1985 }, true)
    expect(weightOf(old.g, old.b, 'breach')).toBe(0)
    const shop = company(22, { id: 'breach', industry: 'restaurant', year: 2015 }, true)
    expect(weightOf(shop.g, shop.b, 'breach')).toBe(0)
    expect(weightOf(shop.g, shop.b, 'bid')).toBe(0)
    const truck = company(22, { id: 'critic', industry: 'gym' }, true)
    expect(weightOf(truck.g, truck.b, 'critic')).toBe(0)
    const bank = company(22, { id: 'rent', industry: 'bank' }, true)
    for (const e of EXTRA_EVENTS) if (['franchisePitch', 'critic', 'influencer', 'breach', 'union', 'rent', 'prime', 'starInvestor', 'trend', 'employeeIdea', 'localCopycat', 'bid'].includes(e.id)) expect(e.weight(bank.g, bank.b), e.id).toBe(0)
    const seventies = company(22, { id: 'trend', industry: 'restaurant', year: 1972 }, true)
    expect(trendsFor(seventies.g, seventies.b).map((t) => t.label)).toContain('fondue parties')
    expect(trendsFor(seventies.g, seventies.b).map((t) => t.label)).not.toContain('plant-based eating')
  }, 120_000)

  it('gives banks and investment firms only industry-neutral generic events (they have their own sets)', () => {
    const neutral = new Set(['audit', 'strike', 'lawsuit', 'embezzle', 'disaster', 'tacos', 'poached'])
    for (const industry of ['bank', 'onlineBank', 'investmentFirm']) {
      const { g, a, b } = company(25, { id: 'x', industry, prep: (bb) => { bb.morale = 20; bb.staff.push({ id: 'k1', firstName: 'Robin', lastName: 'Vale', gender: 'female', age: 40, role: 'Risk Officer', focus: 'quality', skill: 60, salary: 90_000, trait: 'shady', morale: 50, years: 2 }) } }, true)
      const possible = businessEventInternals.possible(g, b)
      expect(possible.length, industry).toBeGreaterThan(0)
      for (const id of possible) expect(neutral.has(id), `${industry}: ${id}`).toBe(true)
      for (const id of ['viral', 'competitor', 'supplier', 'inspection', 'celebrity', 'buyout', 'currency']) expect(eventChance(g, b, id), `${industry}: ${id}`).toBe(0)
      // The yearly picker itself: whatever it queues comes from the neutral list.
      for (let i = 0; i < 60; i++) {
        const g1 = structuredClone(g)
        g1.rng = 900 + i * 31
        g1.queue = []
        const b1 = bizOf(g1, findBusiness(g1, a.id)!)
        b1.lastEvent = 0
        if (!maybeBusinessEvent(g1, findBusiness(g1, a.id)!, b1, g1.year - 1, false)) continue
        const m = lastChoice(g1)
        expect(m.scriptId?.replace('business.ev.', ''), `${industry}: ${m.title}`).toMatch(/^(audit|strike|lawsuit|embezzle|disaster|tacos|poached)$/)
      }
    }
  }, 120_000)

  it('keeps the overall popup rate: all event chances still add up to the same yearly roll', () => {
    const { g, b } = company(23, SETUPS[0], true)
    const total = businessEventInternals.ids().reduce((t, id, i, all) => (all.indexOf(id) === i ? t + eventChance(g, b, id) : t), 0)
    expect(total).toBeGreaterThan(0.29)
    expect(total).toBeLessThanOrEqual(0.3 + 1e-9)
  })

  it('uses only words that exist in the year and country it appears in', () => {
    for (const s of SETUPS) {
      const { g, a, b } = company(24, s, true)
      businessEventInternals.present(g, a, b, s.id)
      const m = lastChoice(g)
      const words = [m.title, m.text, ...m.choices.map((c) => c.label)]
      for (const c of m.choices) {
        const g1 = structuredClone(g)
        g1.queue = []
        runScript(g1, m.scriptId!, c.id, m.data, m)
        for (const n of g1.queue) if (n.kind === 'notice') words.push(n.text)
      }
      for (const t of words) expect(anachronismsIn(t, g.year, [b.countryId]), `${s.id}: ${t}`).toEqual([])
    }
  }, 120_000)
})

describe('new business events: the Business talent', () => {
  it('marks exactly one choice, only with the talent, and never changes the dice', () => {
    for (const s of SETUPS) {
      for (const talent of [false, true]) {
        const { g, a, b } = company(31, s, talent)
        expect(businessEventInternals.present(g, a, b, s.id), s.id).toBe(true)
        const hinted = lastChoice(g).choices.filter((c) => c.hint)
        if (!talent) expect(hinted, s.id).toHaveLength(0)
        else {
          expect(hinted, s.id).toHaveLength(1)
          expect(hinted[0].hint!.startsWith('\u{1F52E}')).toBe(true)
        }
      }
      const x = company(32, s, false)
      const y = company(32, s, true)
      x.g.rng = y.g.rng = 777
      businessEventInternals.present(x.g, x.a, x.b, s.id)
      businessEventInternals.present(y.g, y.a, y.b, s.id)
      expect(y.g.rng, s.id).toBe(x.g.rng)
    }
  }, 180_000)

  it("points at the choice that works out best under the resolvers' own odds", () => {
    const RUNS = 120
    for (const s of SETUPS.filter((x) => FX_ONLY.has(x.id))) {
      const { g, a, b } = company(41, s, true)
      businessEventInternals.present(g, a, b, s.id)
      const m = lastChoice(g)
      g.queue = []
      const means = new Map<string, number>()
      const vars = new Map<string, number>()
      for (const c of m.choices) {
        let sum = 0
        let sq = 0
        for (let i = 0; i < RUNS; i++) {
          const g1 = structuredClone(g)
          g1.rng = 1_000 + i * 7919
          runScript(g1, m.scriptId!, c.id, m.data, m)
          const v = measure(g, g1, a.id)
          sum += v
          sq += v * v
        }
        const mean = sum / RUNS
        means.set(c.id, mean)
        vars.set(c.id, Math.max(0, sq / RUNS - mean * mean))
      }
      const best = [...means.entries()].sort((p, q) => q[1] - p[1])[0]
      const pick = m.choices.find((c) => c.hint)!.id
      const se = Math.sqrt((vars.get(pick)! + vars.get(best[0])!) / RUNS)
      const scale = Math.max(...[...means.values()].map(Math.abs), 1)
      expect(means.get(pick)!, `${s.id}: hinted ${pick} ${Math.round(means.get(pick)!)} vs best ${best[0]} ${Math.round(best[1])}`).toBeGreaterThanOrEqual(best[1] - 3 * se - scale * 0.06)
    }
  }, 300_000)

  it('values a franchise pitch with the same franchise math the sale books', () => {
    const { g, a, b } = company(42, SETUPS[0], true)
    businessEventInternals.present(g, a, b, 'franchisePitch')
    const m = lastChoice(g)
    const fee = franchiseFee(b)
    const one = franchiseValue(g, b, 1)
    const values: Record<string, number> = { accept: one, premium: PITCH_PREMIUM_P * (one + Math.round(fee * 0.5 * (1 - ONBOARDING))), decline: 0 }
    const best = Object.entries(values).sort((x, y) => y[1] - x[1])[0][0]
    expect(m.choices.find((c) => c.hint)!.id).toBe(best)
    // Accepting sells one franchise and books its fee once.
    const g1 = structuredClone(g)
    g1.queue = []
    runScript(g1, m.scriptId!, 'accept', m.data, m)
    const b1 = readBiz(g1, findBusiness(g1, a.id)!)
    expect(readFranchise(b1).units).toBe(1)
    expect(b1.cash - b.cash).toBe(Math.round(fee * (1 - ONBOARDING)))
    expect(b1.yearIncome - b.yearIncome).toBe(Math.round(fee * (1 - ONBOARDING)))
  })

  it('values a celebrity investor by the owner’s stake before and after, and books equity, not income', () => {
    const { g, a, b } = company(43, SETUPS[10], true)
    businessEventInternals.present(g, a, b, 'starInvestor')
    const m = lastChoice(g)
    const d = m.data as { stake: number; pre: number }
    const w = bizWorth(g, b)
    const invest = stakePrice(d.stake, d.pre)
    const values: Record<string, number> = { accept: equityGain(g, b, w, d.stake, invest), half: 0.6 * equityGain(g, b, w, d.stake / 2, stakePrice(d.stake / 2, d.pre)), decline: 0 }
    const best = Object.entries(values).sort((x, y) => y[1] - x[1])[0][0]
    expect(m.choices.find((c) => c.hint)!.id).toBe(best)
    const g1 = structuredClone(g)
    g1.queue = []
    runScript(g1, m.scriptId!, 'accept', m.data, m)
    const b1 = readBiz(g1, findBusiness(g1, a.id)!)
    expect(b1.cash - b.cash).toBe(invest)
    expect(b1.yearIncome).toBe(b.yearIncome)
    expect(b1.share).toBeCloseTo(b.share * (1 - d.stake), 6)
    // The owner's stake gains exactly when the star pays above the company's value.
    const gain = b1.share * (b.valuation + invest) - b.share * b.valuation
    expect(gain).toBeCloseTo((b.share * invest * (d.pre - b.valuation)) / (d.pre + invest), -2)
    for (let i = 0; i < 12; i++) {
      const y = company(60 + i, SETUPS[10], true)
      businessEventInternals.present(y.g, y.a, y.b, 'starInvestor')
      const mm = lastChoice(y.g)
      const dd = mm.data as { stake: number; pre: number }
      const ww = bizWorth(y.g, y.b)
      const vals: Record<string, number> = { accept: equityGain(y.g, y.b, ww, dd.stake, stakePrice(dd.stake, dd.pre)), half: 0.6 * equityGain(y.g, y.b, ww, dd.stake / 2, stakePrice(dd.stake / 2, dd.pre)), decline: 0 }
      expect(mm.choices.find((c) => c.hint)!.id).toBe(Object.entries(vals).sort((x, z) => z[1] - x[1])[0][0])
    }
  })
})

describe('new business events: money moves once', () => {
  it('every choice books its cash through yearCosts/yearIncome (capital spending and equity aside)', () => {
    for (const s of SETUPS) {
      const { g, a, b } = company(51, s, true)
      businessEventInternals.present(g, a, b, s.id)
      const m = lastChoice(g)
      g.queue = []
      for (const c of m.choices) {
        for (const rng of [11, 222, 3333]) {
          const g1 = structuredClone(g)
          g1.rng = rng
          expect(() => runScript(g1, m.scriptId!, c.id, m.data, m), `${s.id}/${c.id}`).not.toThrow()
          const b1 = readBiz(g1, findBusiness(g1, a.id)!)
          const dCash = b1.cash - b.cash
          const booked = b1.yearIncome - b.yearIncome - (b1.yearCosts - b.yearCosts)
          expect(Number.isFinite(b1.cash), `${s.id}/${c.id}`).toBe(true)
          if (s.id === 'prime' && totalOutlets(b1) > totalOutlets(b)) {
            // The fit-out is capital spending (like opening any outlet); the key money is a cost.
            expect(dCash - booked, `${s.id}/${c.id}`).toBe(-startupCost(b.industry, b.countryId, String((m.data as { city: string }).city)).capital)
          } else if (s.id === 'starInvestor' && b1.share < b.share) {
            expect(booked, `${s.id}/${c.id}`).toBe(0)
            expect(dCash).toBeGreaterThan(0)
          } else expect(dCash, `${s.id}/${c.id}`).toBe(booked)
        }
      }
    }
  }, 300_000)

  it('funding an employee’s idea starts a real R&D project paid from company cash', () => {
    const { g, a, b } = company(52, SETUPS[7], true)
    businessEventInternals.present(g, a, b, 'employeeIdea')
    const m = lastChoice(g)
    expect(m.choices.some((c) => c.id === 'fund')).toBe(true)
    const g1 = structuredClone(g)
    g1.queue = []
    runScript(g1, m.scriptId!, 'fund', m.data, m)
    const b1 = readBiz(g1, findBusiness(g1, a.id)!)
    const budget = extraEventInternals.ideaBudget(b)
    expect(rdProjects(b1)).toHaveLength(rdProjects(b).length + 1)
    expect(b.cash - b1.cash).toBe(budget)
    expect(b1.yearCosts - b.yearCosts).toBe(budget)
  })
})
