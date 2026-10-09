import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { becomeCeo } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, normalizeBiz } from '../src/game/business/state'
import { expansionOf, saveExpansion } from '../src/game/business/dynamics'
import { buildInventionFab, commitInventionProducts, effectiveInventionUnitCost, inventionDemandQuote, inventionFabCapacity, inventionFabQuote, inventionFabValue, inventionInventoryValue, inventionMarketDemand, inventionOutputPreview, inventionProductsOf, inventionUpgradeQuote, MAX_INVENTION_PRICE, newInventionProduct, ownedInventionProductNodes, prepareInventionWorkforce, saveInventionProducts, setInventionProduction, simulateInventionProducts, upgradeInventionFab } from '../src/game/business/invention-products'
import type { InventionTier } from '../src/game/business/inventions'
import type { Json } from '../src/game/types'

function fixture(kind: InventionTier = 'generational') {
  const g = makeTestGame(123, { age: 35, money: 1e9, countryId: 'us' })
  g.year = 2020
  const a = createBusinessAsset(g, 'Industrial Inventions', newBiz(g, 'manufacturing', 'us', 'Chicago', { cash: 1e10, founded: 2010 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  becomeCeo(g, a, b); b.employees = 100_000; b.quality = 100
  const p = newInventionProduct('product-1', 'A New Product', 'materials', kind, g.year)
  saveInventionProducts(b, [p])
  const x = expansionOf(b)
  x.patents.push({ id: p.id, name: p.name, kind, ownerId: a.id, launched: 2020, expires: 2040, protections: [{ country: 'us', filed: 2020, expires: 2040 }] })
  saveExpansion(b, x)
  return { g, a, b, p }
}

describe('paid invention industrialization', () => {
  it('requires a new paid fab, capitalizes exactly one payment and rejects replayed targets', () => {
    const { g, a, b, p } = fixture()
    expect(simulateInventionProducts(g, b, g.year).rows[0].produced).toBe(0)
    const original = JSON.stringify(g), q = inventionFabQuote(g, a.id, p.id, 10_000)
    expect(q.reason).toBeNull(); expect(q.cost).toBeGreaterThan(0)
    expect(JSON.stringify(g)).toBe(original)
    const cash = b.cash, money = g.character.money, costs = b.yearCosts
    expect(buildInventionFab(g, a.id, p.id, 10_000)).toBe(true)
    expect(b.cash).toBe(cash - q.cost); expect(b.yearCosts).toBe(costs)
    expect(g.character.money).toBe(money)
    expect(inventionFabValue(b)).toBe(q.cost)
    expect(inventionProductsOf(b)[0]).toMatchObject({ fabCapacity: 10_000, fabInvested: q.cost })
    expect(setInventionProduction(g, a.id, p.id, 10_000)).toBe(true)
    expect(simulateInventionProducts(g, b, g.year).rows[0].produced).toBe(10_000)
    const booked = JSON.stringify(g)
    expect(buildInventionFab(g, a.id, p.id, 10_000)).toBe(false)
    expect(JSON.stringify(g)).toBe(booked)
  })

  it('accepts free, below-cost and extremely high prices with actual elasticity, not a price-multiple cap', () => {
    const { g, a, b, p } = fixture()
    buildInventionFab(g, a.id, p.id, 100)
    for (const price of [0, .0001, p.unitCost * .01, p.price * 1000, MAX_INVENTION_PRICE]) {
      expect(setInventionProduction(g, a.id, p.id, price, true)).toBe(true)
      expect(inventionProductsOf(b)[0].price).toBe(price)
    }
    const absurd = inventionDemandQuote(g, b, inventionProductsOf(b)[0], g.year)
    expect(absurd.demand).toBe(0)
    setInventionProduction(g, a.id, p.id, 0, true)
    const free = simulateInventionProducts(g, b, g.year)
    expect(free.units).toBe(100); expect(free.revenue).toBe(0); expect(free.cogs).toBeGreaterThan(0)
    const before = JSON.stringify(g)
    for (const price of [-1, Number.NaN, Number.POSITIVE_INFINITY, MAX_INVENTION_PRICE + 1]) expect(setInventionProduction(g, a.id, p.id, price, true)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('uses output, construction and upgrade sliders with pure live previews and validated stale runs', () => {
    const { g, a, b, p } = fixture('small')
    buildInventionFab(g, a.id, p.id, 500)
    const nodes = ownedInventionProductNodes(g, a.id)
    for (const suffix of ['production', 'fab', 'upgrade']) {
      const n = nodes.find(n => n.id === `invention.sku.${suffix}.${a.id}.${p.id}`)
      if (!n || n.type !== 'action') throw new Error('Missing slider action')
      expect(n.input?.kind).toBe('slider'); expect(n.input?.preview).toBeTypeOf('function')
      const before = JSON.stringify(g)
      n.input!.preview!(g, suffix === 'upgrade' ? 2 : suffix === 'fab' ? 1000 : 300)
      expect(JSON.stringify(g)).toBe(before)
    }
    const preview = inventionOutputPreview(g, a.id, p.id, 300)
    expect(preview).toMatch(/300 units manufactured/)
    const production = nodes.find(n => n.id === `invention.sku.production.${a.id}.${p.id}`)!
    if (production.type !== 'action') throw new Error('Missing output action')
    expect(setInventionProduction(g, a.id, p.id, 501)).toBe(false)
    const saved = JSON.stringify(b)
    g.assets = g.assets.filter(asset => asset.id !== a.id)
    production.run(g, '250')
    expect(JSON.stringify(b)).toBe(saved)
    expect(buildInventionFab(g, a.id, p.id, 1000)).toBe(false)
    expect(upgradeInventionFab(g, a.id, p.id, 1)).toBe(false)
  })

  it('bounds manufacturing by paid capacity, shared staff and opening working capital', () => {
    const { g, a, b, p } = fixture('small')
    buildInventionFab(g, a.id, p.id, 1000)
    setInventionProduction(g, a.id, p.id, 1000)
    b.cash = 110
    const cashLimited = simulateInventionProducts(g, b, g.year)
    expect(cashLimited.rows[0]).toMatchObject({ produced: 2, cogs: 110 })
    b.cash = 1e6; b.employees = .001
    expect(simulateInventionProducts(g, b, g.year).rows[0].produced).toBe(10)
    b.employees = 0
    expect(simulateInventionProducts(g, b, g.year).rows[0].produced).toBe(0)
    b.employees = 100_000
    expect(simulateInventionProducts(g, b, g.year).rows[0].produced).toBe(1000)
  })

  it('does not overspend fractional opening cash when ledger costs round independently', () => {
    const { g, b, p } = fixture('small')
    saveInventionProducts(b, [{ ...p, fabCapacity: 100, unitCost: .4, production: 2 }])
    b.cash = 1.8
    const plan = simulateInventionProducts(g, b, g.year, 4_000)
    expect(plan.cogs + plan.wages).toBeLessThanOrEqual(b.cash)
    expect(plan.rows[0].produced).toBe(1)
  })

  it('recruits paid-fab workers within working capital without accumulating headcount every year', () => {
    const { g, a, b, p } = fixture()
    buildInventionFab(g, a.id, p.id, 1_000_000)
    setInventionProduction(g, a.id, p.id, 1_000_000)
    b.employees = 10
    prepareInventionWorkforce(g, b, g.year, 50_000)
    expect(b.inventionStaff).toBe(4_000); expect(b.employees).toBe(4_010)
    expect(simulateInventionProducts(g, b, g.year, 50_000).rows[0].produced).toBe(1_000_000)
    prepareInventionWorkforce(g, b, g.year + 1, 50_000)
    expect(b.inventionStaff).toBe(4_000); expect(b.employees).toBe(4_010)
    b.cash = 0
    prepareInventionWorkforce(g, b, g.year + 1, 50_000)
    expect(b.inventionStaff).toBe(0); expect(b.employees).toBe(10)
    b.inventionProducts = []
    prepareInventionWorkforce(g, b, g.year + 1, 50_000)
    expect(b.employees).toBe(10)
  })

  it('refreshes private equipment value without resetting a public share-price premium', () => {
    const { g, a, b, p } = fixture('small')
    b.public = true; b.sharesOut = 1_000_000; b.sharePrice = 100; b.valuation = 100_000_000
    expect(buildInventionFab(g, a.id, p.id, 100)).toBe(true)
    expect(b.valuation).toBe(100_000_000); expect(a.value).toBe(Math.round(b.valuation * b.share))
    expect(upgradeInventionFab(g, a.id, p.id, 1)).toBe(true)
    expect(b.valuation).toBe(100_000_000)
  })

  it('upgrades real product appeal, pricing, capacity and efficiency without restarting patents', () => {
    const { g, a, b, p } = fixture()
    buildInventionFab(g, a.id, p.id, 10_000)
    const before = inventionProductsOf(b)[0], demand = inventionDemandQuote(g, b, before, g.year)
    const q = inventionUpgradeQuote(g, a.id, p.id, 3), cash = b.cash, costs = b.yearCosts
    expect(upgradeInventionFab(g, a.id, p.id, 3)).toBe(true)
    const after = inventionProductsOf(b)[0], upgraded = inventionDemandQuote(g, b, after, g.year)
    expect(b.cash).toBe(cash - q.cost); expect(b.yearCosts).toBe(costs)
    expect(inventionFabValue(b)).toBe(after.fabInvested! + q.cost)
    expect(effectiveInventionUnitCost(after)).toBeLessThan(effectiveInventionUnitCost(before))
    expect(inventionFabCapacity(after)).toBeGreaterThan(inventionFabCapacity(before))
    expect(upgraded.demand).toBeGreaterThan(demand.demand); expect(upgraded.referencePrice).toBeGreaterThan(demand.referencePrice)
    expect(upgraded.patentRemaining).toBe(demand.patentRemaining)
    expect(expansionOf(b).patents[0].protections![0].expires).toBe(2040)
    const saved = JSON.stringify(g)
    expect(upgradeInventionFab(g, a.id, p.id, 3)).toBe(false)
    expect(JSON.stringify(g)).toBe(saved)
    expect(inventionProductsOf(normalizeBiz(JSON.parse(JSON.stringify(b)), g.year))[0]).toMatchObject({ fabCapacity: 10_000, upgradeLevel: 3, upgradeInvested: q.cost })
  })

  it('starts generational discoveries at millions of buyers and erodes pricing/profit before territorial expiry', () => {
    const { g, b, p } = fixture()
    const launch = inventionDemandQuote(g, b, p, 2020)
    expect(launch.demand).toBeGreaterThan(1_000_000); expect(launch.referencePrice).toBeGreaterThan(p.price * 4)
    const monopolyPrice = { ...p, price: launch.referencePrice }
    const early = inventionDemandQuote(g, b, monopolyPrice, 2020), middle = inventionDemandQuote(g, b, monopolyPrice, 2030), late = inventionDemandQuote(g, b, monopolyPrice, 2039), expired = inventionDemandQuote(g, b, monopolyPrice, 2040)
    expect(early.patentRemaining).toBe(20); expect(middle.patentRemaining).toBe(10); expect(expired.patentRemaining).toBe(0)
    expect(middle.referencePrice).toBeLessThan(early.referencePrice)
    expect(middle.demand).toBeLessThan(early.demand); expect(late.demand).toBeLessThan(middle.demand); expect(expired.demand).toBeLessThan(late.demand)
    expect(expired.demand).toBeLessThan(early.demand * .01)
    const overseas = inventionMarketDemand(g, p, 'jp', 2020, expansionOf(b).patents[0].protections!)
    expect(overseas.patentRemaining).toBe(0); expect(overseas.referencePrice).toBe(p.price)
    expect(overseas.demand).toBeLessThan(launch.demand)
    const revived = inventionDemandQuote(g, b, { ...p, upgradeLevel: 10 }, 2041)
    expect(revived.monopoly).toBe(0); expect(revived.referencePrice).toBeGreaterThan(p.price)
  })

  it('grandfathers only 100 units for legacy products and normalizes malformed fab records safely', () => {
    const { g, b, p } = fixture('small')
    const legacy = { ...p, production: 1e6 } as Record<string, unknown>
    delete legacy.fabCapacity; delete legacy.fabInvested; delete legacy.upgradeLevel; delete legacy.upgradeInvested
    b.inventionProducts = [legacy] as Json
    expect(inventionProductsOf(b)[0].fabCapacity).toBe(100)
    expect(simulateInventionProducts(g, b, g.year).rows[0].produced).toBe(100)
    b.inventionProducts = [{ ...legacy, price: Number.NaN, fabCapacity: Number.NaN, fabInvested: -10, upgradeLevel: Number.POSITIVE_INFINITY, upgradeInvested: 'broken' }, { ...legacy, id: p.id }] as Json
    const rows = inventionProductsOf(b)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ fabCapacity: 0, fabInvested: 0, upgradeLevel: 0, upgradeInvested: 0 })
    expect(simulateInventionProducts(g, b, g.year).rows[0].produced).toBe(0)
    expect(Number.isFinite(inventionFabValue(b))).toBe(true)
  })

  it('rejects cashless, unauthorized and expired-licence investment without side effects', () => {
    const { g, a, b, p } = fixture('small')
    b.cash = 0
    const snapshot = JSON.stringify(g)
    expect(buildInventionFab(g, a.id, p.id, 100)).toBe(false)
    expect(JSON.stringify(g)).toBe(snapshot)
    b.cash = 1e9; g.character.prison = { name: 'Prison', security: 'medium', crime: 'Fraud', sentenceYears: 2, yearsServed: 0, respect: 0, appealed: false, escapeAttempts: 0 }
    expect(buildInventionFab(g, a.id, p.id, 100)).toBe(false)
    g.character.prison = null
    saveInventionProducts(b, [{ ...p, rights: 'license', expires: g.year }])
    const expired = JSON.stringify(g)
    expect(buildInventionFab(g, a.id, p.id, 100)).toBe(false)
    expect(setInventionProduction(g, a.id, p.id, 0)).toBe(false)
    expect(JSON.stringify(g)).toBe(expired)
  })

  it('allocates shared production deterministically by ID and commits stock only once', () => {
    const { g, b, p } = fixture('small')
    const first = { ...p, id: 'a', ipId: 'a', fabCapacity: 100 }, second = { ...p, id: 'z', ipId: 'z', fabCapacity: 100 }
    saveInventionProducts(b, [second, first]); b.cash = 110
    const plan = simulateInventionProducts(g, b, g.year)
    expect(plan.rows[0]).toMatchObject({ id: 'a', produced: 2 })
    saveInventionProducts(b, [first, second])
    expect(simulateInventionProducts(g, b, g.year)).toEqual(plan)
    commitInventionProducts(g, b, g.year, plan)
    const done = JSON.stringify(b)
    commitInventionProducts(g, b, g.year, plan)
    expect(JSON.stringify(b)).toBe(done)
    expect(simulateInventionProducts(g, b, g.year).rows).toHaveLength(0)
    expect(inventionInventoryValue(b)).toBe(0)
  })
})
