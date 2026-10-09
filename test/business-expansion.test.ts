import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, normalizeBiz, readBiz } from '../src/game/business/state'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { bestPlan, planFor, simulateYear } from '../src/game/business/economy'
import { businessEffects, expansionOf, nationalMarket, recordCompanyShock, recoverConfidence, saveExpansion, STRATEGIES } from '../src/game/business/dynamics'
import { adoptStrategy, inventionYear, inventorMenu, nationalStrategyMenu, startInvention, studyMarket } from '../src/game/business/expansion'
import { equityMenu, executiveOperations, executiveRetentionYear, grantCeoEquity, groupRetentionYear } from '../src/game/business/executive'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupsOf, liveGroup, readMembership, saveGroup } from '../src/game/business/conglomerate-state'
import { INDUSTRY_IDS, type Industry } from '../src/game/data/markets'
import { INDUSTRIES } from '../src/game/business/industries'
import { MARKETS } from '../src/game/business/competition-data'
import { buyImpact, saleImpact } from '../src/game/invest/liquidity'
import { buySecurity, investmentListing, sellHolding } from '../src/game/investments'
import { pruneMarketShocks, shockFactor } from '../src/game/invest/shocks'
import { yearlyConglomerates } from '../src/game/business/conglomerate'
import { declareBankruptcy } from '../src/game/business/exit'
import type { GameState, MenuNode } from '../src/game/types'

function fixture(industry: Industry = 'restaurant', seed = 45) {
  const g = makeTestGame(seed, { age: 35, money: 1e9, countryId: 'us', talent: null, talents: [] })
  g.year = 2026
  const b0 = newBiz(g, industry, 'us', g.character.city, { cash: 10_000_000, founded: 2020 })
  const a = createBusinessAsset(g, 'Test Company', b0, 1_000_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  becomeCeo(g, a, b)
  g.queue = []
  return { g, a, b }
}

describe('expanded company markets', () => {
  it('has 51 complete sectors with finite, playable economic plans', () => {
    expect(INDUSTRY_IDS).toHaveLength(51)
    for (const id of INDUSTRY_IDS) {
      expect(INDUSTRIES[id].id).toBe(id)
      expect(MARKETS[id]).toBeDefined()
    }
    for (const id of ['solar', 'battery', 'water', 'recycling', 'telecom', 'dataCenter', 'education', 'petCare', 'homeCare', 'packaging', 'furniture', 'travel'] as const) {
      const { g, b } = fixture(id)
      const p = bestPlan(g, b, { quick: true })
      expect(Number.isFinite(p.profit), id).toBe(true)
      expect(p.production, id).toBeGreaterThan(0)
      expect(normalizeBiz(b as never, g.year).industry).toBe(id)
    }
  })

  it('conditions vary by year, country and sector but are deterministic and read-only', () => {
    const { g } = fixture()
    const before = JSON.stringify(g)
    const n = nationalMarket(g, 'restaurant', 'us')
    expect(n).toEqual(nationalMarket(g, 'restaurant', 'us'))
    expect(n).not.toEqual(nationalMarket(g, 'restaurant', 'us', g.year + 1))
    expect(n).not.toEqual(nationalMarket(g, 'restaurant', 'ae'))
    expect(n).not.toEqual(nationalMarket(g, 'solar', 'us'))
    expect(JSON.stringify(g)).toBe(before)
  })

  it('charges for local programs, limits stacking, affects output, expires, and survives saves', () => {
    const { g, a, b } = fixture()
    const cash = b.cash, initial = planFor(g, b, g.year)
    expect(adoptStrategy(g, a.id, 'us', 'efficiency')).toBe(true)
    expect(b.cash).toBeLessThan(cash)
    expect(b.yearCosts).toBe(cash - b.cash)
    expect(planFor(g, b, g.year).unitCost).toBeLessThan(initial.unitCost)
    expect(planFor(g, b, g.year).capacity).toBeGreaterThan(initial.capacity)
    expect(adoptStrategy(g, a.id, 'us', 'efficiency')).toBe(false)
    expect(adoptStrategy(g, a.id, 'ae', 'value')).toBe(false)
    expect(adoptStrategy(g, a.id, 'us', 'service')).toBe(true)
    expect(adoptStrategy(g, a.id, 'us', 'local')).toBe(true)
    expect(adoptStrategy(g, a.id, 'us', 'training')).toBe(false)
    const loaded = normalizeBiz(JSON.parse(JSON.stringify(b)), g.year)
    expect(expansionOf(loaded).strategies).toHaveLength(3)
    expect(businessEffects(g, loaded, 'us', g.year + 5)).toMatchObject({ demand: 1, cost: 1, capacity: 1 })
    expect(STRATEGIES).toHaveLength(10)
  })

  it('a major company collapse dents sector confidence, which slowly recovers only once per year', () => {
    const { g, b } = fixture()
    recordCompanyShock(g, b, 1e9, 1e8)
    const hit = nationalMarket(g, b.industry, 'us').confidence
    expect(hit).toBeLessThan(1)
    expect(nationalMarket(g, b.industry, 'ae').confidence).toBe(1)
    recoverConfidence(g)
    const recovering = nationalMarket(g, b.industry, 'us').confidence
    expect(recovering).toBeGreaterThan(hit)
    recoverConfidence(g)
    expect(nationalMarket(g, b.industry, 'us').confidence).toBe(recovering)
  })

  it('bankruptcy triggers a market reaction, without double-counting an already reported decline', () => {
    const { g, a, b } = fixture()
    b.last = simulateYear(g, b, g.year - 1, 0, 1).stmt
    b.last.revenue = 1e9
    recordCompanyShock(g, b, 1e9, 0, a.id)
    const confidence = nationalMarket(g, b.industry, 'us').confidence
    declareBankruptcy(g, a, b, 'Unable to refinance.')
    expect(nationalMarket(g, b.industry, 'us').confidence).toBe(confidence)
    expect(g.assets.some(x => x.id === a.id)).toBe(false)
  })
})

describe('Inventor', () => {
  it('requires talent, a recent home study, funding and an empty lab', () => {
    const { g, a, b } = fixture('solar')
    expect(startInvention(g, a.id, 'early')).toBe(false)
    g.character.talents = ['Inventor']
    expect(startInvention(g, a.id, 'early')).toBe(false)
    expect(studyMarket(g, a.id, 'us')).toBe(true)
    expect(studyMarket(g, a.id, 'us')).toBe(false)
    expect(startInvention(g, a.id, 'frontier')).toBe(true)
    expect(expansionOf(b).research?.name).toMatch(/cold-fusion/)
    expect(startInvention(g, a.id, 'early')).toBe(false)
    expect(b.yearCosts).toBeGreaterThan(500_000)
  })

  it.each(['early', 'frontier'] as const)('%s project completes, stays exclusive for its term, and expires', kind => {
    const { g, a, b } = fixture('solar')
    g.character.talents = ['Inventor']
    studyMarket(g, a.id, 'us')
    startInvention(g, a.id, kind)
    const x = expansionOf(b)
    x.research!.odds = 1
    saveExpansion(b, x)
    const due = g.year + x.research!.years
    g.year = due - 1
    inventionYear(g, a, b)
    expect(expansionOf(b).patents).toHaveLength(0)
    g.year = due
    inventionYear(g, a, b)
    const patent = expansionOf(b).patents[0]
    expect(patent.expires).toBe(due + (kind === 'early' ? 15 : 20))
    expect(businessEffects(g, b, 'us', due).demand).toBe(1)
    const after = JSON.stringify(g)
    inventionYear(g, a, b)
    expect(JSON.stringify(g)).toBe(after)
    expect(businessEffects(g, b, 'us', patent.expires).demand).toBe(1)
    expect(expansionOf(normalizeBiz(JSON.parse(JSON.stringify(b)), due)).patents[0]).toEqual(patent)
  })

  it('legacy funded research completes without a success roll or taking more cash', () => {
    const { g, a, b } = fixture()
    g.character.talents = ['Inventor']
    studyMarket(g, a.id, 'us')
    startInvention(g, a.id, 'early')
    const x = expansionOf(b)
    x.research!.odds = 0
    saveExpansion(b, x)
    const cash = b.cash
    g.year += 3
    inventionYear(g, a, b)
    expect(expansionOf(b).research).toBeNull()
    expect(expansionOf(b).patents).toHaveLength(1)
    expect(b.cash).toBe(cash)
  })
})

describe('executive skill and ownership', () => {
  it('95-rated leadership improves demand, capacity, costs and profit over an ordinary manager', () => {
    const { g, b } = fixture()
    installManager(g, b, managerCandidate(g, b, 60))
    b.manager!.salary = 100_000
    const low = structuredClone(b)
    const high = structuredClone(b)
    high.manager!.skill = 95
    const pLow = planFor(g, low, g.year), pHigh = planFor(g, high, g.year)
    expect(pHigh.demand).toBeGreaterThan(pLow.demand)
    expect(pHigh.capacity).toBeGreaterThan(pLow.capacity)
    expect(pHigh.unitCost).toBeLessThan(pLow.unitCost)
    for (const bb of [low, high]) { const p = bestPlan(g, bb); bb.price = p.price; bb.production = p.production }
    const lo = simulateYear(structuredClone(g), low, g.year, 0, 1).stmt.net
    const hi = simulateYear(structuredClone(g), high, g.year, 0, 1).stmt.net
    expect(hi).toBeGreaterThan(lo)
    const bad = structuredClone(high)
    bad.production = 0
    executiveOperations(g, bad, g.year)
    expect(bad.production).toBeGreaterThan(0)
  })

  it('warns then loses an unretained star; a permanent grant reduces player ownership and avoids this resignation', () => {
    for (const grant of [false, true]) {
      const { g, a, b } = fixture()
      installManager(g, b, managerCandidate(g, b, 95))
      const original = b.manager!.firstName
      g.year += 3
      executiveRetentionYear(g, a, b)
      expect(b.manager!.equityAsked).toBe(g.year)
      if (grant) {
        const cash = b.cash
        expect(grantCeoEquity(g, a.id)).toBe(true)
        expect(b.share).toBeCloseTo(.9)
        expect(b.manager!.equity).toBe(.1)
        expect(b.cash).toBe(cash)
        expect(grantCeoEquity(g, a.id)).toBe(false)
        expect(readBiz(g, a).manager!.equity).toBe(.1)
      }
      g.year += 2
      executiveRetentionYear(g, a, b)
      if (grant) expect(b.manager!.firstName).toBe(original)
      else expect(b.manager!.skill).toBeLessThan(85)
    }
  })

  it('group equity changes every look-through stake and survives group save/load', () => {
    const { g, a } = fixture()
    const b2 = newBiz(g, 'cafe', 'us', g.character.city, { cash: 10_000_000 })
    const a2 = createBusinessAsset(g, 'Second', b2, 1e6)
    g.assets.push(a2)
    expect(formGroup(g, [a.id, a2.id], 'Holdings')).toBe(true)
    const id = groupsOf(g)[0].core.id
    const grp = liveGroup(g, id)!
    grp.core.ceo = 'manager'
    grp.core.manager = managerCandidate(g, grp.members[0].b, 95)
    grp.core.manager.since = g.year
    saveGroup(g, grp)
    expect(grantCeoEquity(g, id, true)).toBe(true)
    expect(groupsOf(g)[0].core.share).toBeCloseTo(.9)
    for (const aa of [a, a2]) expect(readBiz(g, aa).share).toBeCloseTo(.9)
    g.year += 7
    groupRetentionYear(g)
    expect(groupsOf(g)[0].core.manager!.equity).toBe(.1)
    const div = bizOf(g, a)
    installManager(g, div, managerCandidate(g, div, 90))
    expect(grantCeoEquity(g, a.id)).toBe(true)
    expect(readMembership(readBiz(g, a).group)!.own).toBeCloseTo(.95)
    expect(readBiz(g, a).share).toBeCloseTo(.855)
    expect(readBiz(g, a2).share).toBeCloseTo(.9)
  })

  it('a group CEO never replaces a division CEO with a lower-rated hire, and unretained group stars get an interim', () => {
    let hires = 0
    for (let seed = 10; seed < 35; seed++) {
      const { g, a, b } = fixture('restaurant', seed)
      const a2 = createBusinessAsset(g, 'Sister', newBiz(g, 'cafe', 'us', g.character.city, { cash: 1e8 }), 1e6)
      g.assets.push(a2)
      b.outlets[0].count = 50
      b.cash = 1e8
      installManager(g, b, managerCandidate(g, b, 55))
      b.last = simulateYear(g, b, g.year - 1, 0, 1).stmt
      expect(formGroup(g, [a.id, a2.id], 'Leadership Test')).toBe(true)
      const grp = liveGroup(g, groupsOf(g)[0].core.id)!
      grp.core.ceo = 'manager'
      grp.core.manager = managerCandidate(g, b, 90)
      grp.core.manager.since = g.year
      saveGroup(g, grp)
      yearlyConglomerates(g)
      const skill = readBiz(g, a).manager!.skill
      if (skill !== 55) { expect(skill).toBeGreaterThanOrEqual(90); hires++ }
      g.year += 3
      groupRetentionYear(g)
      g.year += 2
      groupRetentionYear(g)
      expect(groupsOf(g)[0].core.manager!.skill).toBeLessThan(85)
    }
    expect(hires).toBeGreaterThan(0)
  })
})

describe('order-book reaction', () => {
  it('split sales and single sales have equal execution and prices, and buying back cannot create cash', () => {
    const depth = 500_000_000, amount = 200_000_000
    const all = saleImpact(amount, depth)
    const first = saleImpact(amount / 2, depth)
    const second = saleImpact(amount / 2 * first.end, depth * first.end)
    expect(first.proceeds + second.proceeds).toBeCloseTo(all.proceeds, 5)
    expect(first.end * second.end).toBeCloseTo(all.end, 10)
    const buyback = buyImpact(all.proceeds, depth * all.end)
    expect(buyback.value).toBeCloseTo(amount * all.end, 5)
    expect(all.end * buyback.end).toBeCloseTo(1, 10)
  })

  it('large stock orders move the real listing and remaining holding, without profitable same-year round trips', () => {
    const { g } = fixture()
    const q = investmentListing(g).find(x => x.type === 'stock')!
    const money = g.character.money
    expect(buySecurity(g, q.secId, 100_000_000)).toBe(true)
    const a = g.assets.find(x => x.details.secId === q.secId)!
    expect(investmentListing(g).find(x => x.secId === q.secId)!.price).toBeGreaterThan(q.price)
    const peak = a.value
    expect(sellHolding(g, a.id, peak / 2)).toBe(true)
    expect(a.value).toBeLessThan(peak / 2)
    expect(sellHolding(g, a.id, 'all')).toBe(true)
    expect(g.character.money).toBeLessThanOrEqual(money)
    expect(shockFactor(g, q.secId, g.year)).toBeCloseTo(1, 5)
  })

  it('small permanent impacts survive annual pruning, and foreign holdings reprice immediately', () => {
    const { g } = fixture()
    const q = investmentListing(g).find(x => x.type === 'stock')!
    buySecurity(g, q.secId, 100_000)
    const a = g.assets.find(x => x.details.secId === q.secId)!
    const factor = shockFactor(g, q.secId, g.year)
    g.year++
    pruneMarketShocks(g, () => true)
    expect(shockFactor(g, q.secId, g.year)).toBe(factor)
    g.character.countryId = 'jp'
    const price = a.details.price as number
    sellHolding(g, a.id, a.value / 2)
    expect(a.details.price as number).toBeLessThan(price)
  })
})

it('new menus are pure, survive missing managers and expose actionable study/research gates', () => {
  const { g, a } = fixture()
  g.character.talents = ['Inventor']
  const before = JSON.stringify(g)
  const walk = (nodes: MenuNode[], gg: GameState) => {
    for (const n of nodes) {
      if ('subtitle' in n && typeof n.subtitle === 'function') n.subtitle(gg)
      if ('disabledReason' in n) n.disabledReason?.(gg)
      if (n.type === 'action' && typeof n.confirm === 'function') n.confirm(gg)
      if (n.type === 'menu') walk(n.children(gg), gg)
    }
  }
  walk([nationalStrategyMenu(a), inventorMenu(a), equityMenu(a.id)], g)
  expect(JSON.stringify(g)).toBe(before)
})
