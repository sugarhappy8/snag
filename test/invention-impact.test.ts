import { describe, expect, it } from 'vitest'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { updateSharePrice } from '../src/game/business/economy'
import { newInventionProduct, saveInventionProducts } from '../src/game/business/invention-products'
import { bizOf, readBiz } from '../src/game/business/state'
import { exchangeInfo, exchangeStatus } from '../src/game/invest/engine'
import { breakthroughIndexFactor, breakthroughStockFactor, indexShockFactor, marketBreakthroughs } from '../src/game/invest/shocks'
import { buySecurity, investmentHoldings, investmentListing, investmentsMenu, revalueHoldings, yearlyInvestments } from '../src/game/investments'
import { inventionImpactNodes, inventionImpactView, inventionLeakFactor, registerInventionBreakthrough, resolveInventionPressure, transferInventionImpact, yearlyInventionImpact } from '../src/game/invention-impact'
import { readInventionIp } from '../src/game/inventor-state'
import type { Asset, GameState, Json, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function game(year = 2026) {
  const g = makeTestGame(35, { age: 35, money: 50_000_000, countryId: 'us', city: 'Chicago' })
  g.lifeId = 'impact-test'; g.year = year
  return g
}
function ip(g: GameState, id = 'matter1', kind: 'generational' | 'big' = 'generational'): Asset {
  const a: Asset = { id, kind: 'invention', name: 'Programmable Matter Fabricator', emoji: '💡', purchasePrice: 5_000_000, value: 2_500_000, condition: 100, purchasedAge: g.character.age, upkeep: 0,
    details: { inventorIp: { v: 1, topic: 'matter-fabricator', field: 'materials', kind, created: g.year, country: 'us', budget: 5_000_000, unitPrice: 5_000, unitCost: 3_000, potential: 50_000, protections: [{ country: 'us', filed: g.year, expires: g.year + 20 }] } } }
  g.assets.push(a); return a
}
function register(g: GameState, id = 'matter1', kind: 'generational' | 'big' = 'generational') {
  return registerInventionBreakthrough(g, { id, name: 'Programmable Matter Fabricator', kind, field: 'materials', created: g.year, country: 'us' })
}
function next(g: GameState) { g.year++; g.character.age++; g.yearActions = {} }
function quote(g: GameState, kind: string) { return investmentListing(g).find(q => q.type === kind)! }
function walk(g: GameState, nodes: MenuNode[], depth = 0) {
  for (const n of nodes) {
    n.visible?.(g)
    if (n.type === 'info') { if (typeof n.text === 'function') n.text(g); continue }
    if (n.type === 'heading') continue
    if (typeof n.subtitle === 'function') n.subtitle(g)
    n.disabledReason?.(g)
    if (n.type === 'action') { n.confirm?.(g); n.input?.defaultValue?.(g) }
    else if (depth < 5) { n.header?.(g); walk(g, n.children(g), depth + 1) }
  }
}

describe('world-changing invention markets', () => {
  it('reprices every open exchange stock, penny and index quote12x once without giving cash or pumping nonstocks', () => {
    const g = game(), before = new Map<string, number>()
    for (const country of ['us', 'jp', 'gb', 'kr', 'ae', 'ng']) {
      g.character.countryId = country
      for (const q of investmentListing(g)) before.set(`${country}|${q.secId}`, q.price)
    }
    g.character.countryId = 'us'
    const cash = g.character.money, rng = g.rng
    expect(register(g)).toBe(true)
    expect(g.character.money).toBe(cash)
    expect(g.rng).toBe(rng)
    for (const country of ['us', 'jp', 'gb', 'kr', 'ae', 'ng']) {
      g.character.countryId = country
      for (const q of investmentListing(g)) expect(q.price / before.get(`${country}|${q.secId}`)!).toBeCloseTo(['stock', 'penny', 'index'].includes(q.type) ? 12 : 1, 8)
    }
    g.character.countryId = 'us'
    const saved = JSON.stringify(g)
    expect(register(g)).toBe(false)
    expect(JSON.stringify(g)).toBe(saved)
    expect(g.queue.filter(m => m.kind === 'notice' && m.title.includes('World-Changing'))).toHaveLength(1)
    expect(marketBreakthroughs(g)).toHaveLength(1)
  })

  it('marks domestic and foreign existing positions to the same quote, with unchanged units and basis', () => {
    const g = game()
    for (const country of ['us', 'jp']) {
      g.character.countryId = country
      for (const type of ['stock', 'penny', 'index']) expect(buySecurity(g, quote(g, type).secId, 10_000)).toBe(true)
    }
    g.character.countryId = 'us'
    const held = investmentHoldings(g).map(a => ({ id: a.id, price: Number(a.details.price), units: a.details.units, basis: a.details.basis }))
    const cash = g.character.money
    register(g)
    for (const old of held) {
      const a = g.assets.find(x => x.id === old.id)!
      expect(a.details.price).toBeCloseTo(old.price * 12, 8)
      expect(a.details.units).toBe(old.units)
      expect(a.details.basis).toBe(old.basis)
      expect(a.value).toBe(Math.round(Number(a.details.units) * Number(a.details.price)))
    }
    expect(g.character.money).toBe(cash)
    const marked = JSON.stringify(g)
    revalueHoldings(g)
    expect(JSON.stringify(g)).toBe(marked)
  })

  it('does not repay the breakthrough next year or reward buyers who entered after the repricing', () => {
    const g = game(), ordinary = structuredClone(g)
    expect(buySecurity(g, quote(g, 'index').secId, 100_000)).toBe(true)
    expect(buySecurity(ordinary, quote(ordinary, 'index').secId, 100_000)).toBe(true)
    register(g)
    next(g); next(ordinary)
    yearlyInvestments(g); yearlyInvestments(ordinary)
    expect(Number(investmentHoldings(g)[0].details.price) / Number(investmentHoldings(ordinary)[0].details.price)).toBeCloseTo(12, 8)
    expect(investmentHoldings(g)[0].value / investmentHoldings(ordinary)[0].value).toBeCloseTo(12, 3)
    const settled = JSON.stringify(g)
    yearlyInvestments(g)
    expect(JSON.stringify(g)).toBe(settled)
    const buyer = game(), control = game()
    register(buyer)
    buySecurity(buyer, quote(buyer, 'index').secId, 100_000)
    buySecurity(control, quote(control, 'index').secId, 100_000)
    next(buyer); next(control); yearlyInvestments(buyer); yearlyInvestments(control)
    expect(investmentHoldings(buyer)[0].value).toBe(investmentHoldings(control)[0].value)
  })

  it('does not retroactively pay12x dividends for a late announcement before annual settlement', () => {
    const g = game()
    buySecurity(g, quote(g, 'index').secId, 100_000)
    const ordinary = structuredClone(g)
    next(g); next(ordinary)
    register(g)
    const before = g.character.money, baseline = ordinary.character.money
    yearlyInvestments(g); yearlyInvestments(ordinary)
    expect(g.character.money - before).toBe(ordinary.character.money - baseline)
    expect(investmentHoldings(g)[0].value / investmentHoldings(ordinary)[0].value).toBeCloseTo(12, 3)
  })

  it('excludes closed/unopened exchanges and actual replacement generations or fund identities', () => {
    const g = game(1946)
    expect(exchangeStatus(exchangeInfo('jp'), g.year)).not.toBe('open')
    expect(exchangeStatus(exchangeInfo('ae'), g.year)).not.toBe('open')
    register(g)
    expect(breakthroughIndexFactor(g, exchangeInfo('jp').key, 1950)).toBe(1)
    expect(breakthroughIndexFactor(g, exchangeInfo('ae').key, 2026)).toBe(1)
    expect(breakthroughIndexFactor(g, exchangeInfo('cn').key, 1948)).toBe(12)
    expect(breakthroughIndexFactor(g, exchangeInfo('cn').key, 1991)).toBe(1) // new post-nationalization market
    const current = game()
    const stock = quote(current, 'stock')
    register(current)
    expect(breakthroughStockFactor(current, stock.secId, 2026)).toBe(12)
    expect(breakthroughStockFactor(current, stock.secId.replace(/g\d+$/, 'g999999'), 2027)).toBe(1)
    expect(indexShockFactor(current, exchangeInfo('us').key, 2026, 'replacement#fund')).toBe(1)
    expect(breakthroughStockFactor(current, stock.secId, 2025)).toBe(1)
  })

  it('keeps world repricing durable, snapshots independent, and menus/history state-aware and pure', () => {
    const g = game(), before = structuredClone(g)
    register(g)
    const restored = JSON.parse(JSON.stringify(g)) as GameState
    expect(quote(restored, 'stock').price).toBe(quote(g, 'stock').price)
    expect(quote(before, 'stock').price * 12).toBeCloseTo(quote(g, 'stock').price, 8)
    restored.lifeId += '-g2'; restored.character.id = 'heir'; restored.character.firstName = 'Heir'
    expect(register(restored)).toBe(false)
    const saved = JSON.stringify(g)
    walk(g, [investmentsMenu])
    expect(JSON.stringify(g)).toBe(saved)
    expect(investmentsMenu.header!(g)).toMatch(/\d{3,}%/)
    const news = investmentsMenu.children(g).find(n => n.id === 'inv-news')!
    if (news.type === 'menu') expect(news.children(g).map(n => n.type === 'info' && (typeof n.text === 'string' ? n.text : n.text(g))).join(' ')).toMatch(/1100|1,100|World-changing/)
  })

  it('immediately reprices owned public companies, preserves the factor annually, and excludes future IPOs', () => {
    const g = game(), baseline = game()
    const add = (gg: GameState, name: string) => {
      const b = newBiz(gg, 'manufacturing', 'us', 'Chicago', { cash: 1_000_000, public: true, sharesOut: 100_000, sharePrice: 25, valuation: 2_500_000 })
      const a = createBusinessAsset(gg, name, b, 1_000_000); gg.assets.push(a); return { a, b: bizOf(gg, a) }
    }
    const x = add(g, 'Public Fab'), normal = add(baseline, 'Public Fab')
    register(g)
    expect(x.b.sharePrice).toBe(300)
    expect(x.b.valuation).toBe(30_000_000)
    expect(x.a.value).toBe(30_000_000)
    next(g); next(baseline)
    const a = updateSharePrice(g, x.b, g.year - 1), b = updateSharePrice(baseline, normal.b, baseline.year - 1)
    expect(a / b).toBeCloseTo(12, 2)
    const later = add(g, 'Later IPO')
    expect(later.b.sharePrice).toBe(25)
  })
})

describe('government pressure on strategic IP', () => {
  it('offers a playable choice and cooperation permanently reduces exclusivity without touching IP or terms', () => {
    const g = game(), a = ip(g), protection = structuredClone(readInventionIp(a)!.protections)
    register(g)
    const event = inventionImpactView(g)[0], token = event.pending!.token, cash = g.character.money
    expect(event.pending?.owner).toBeTruthy()
    expect(inventionImpactNodes(g, a.id).filter(n => n.type === 'action')).toHaveLength(3)
    expect(resolveInventionPressure(g, a.id, token, 'cooperate')).toBe(true)
    expect(inventionLeakFactor(g, a.id, g.year - 1)).toBe(1)
    expect(inventionLeakFactor(g, a.id, g.year)).toBe(.7)
    expect(inventionLeakFactor(g, a.id, g.year + 30)).toBe(.7)
    expect(readInventionIp(a)!.protections).toEqual(protection)
    expect(g.assets.includes(a)).toBe(true)
    expect(g.character.money).toBe(cash)
    const settled = JSON.stringify(g)
    expect(resolveInventionPressure(g, a.id, token, 'security')).toBe(false)
    expect(JSON.stringify(g)).toBe(settled)
  })

  it('books security once against actual personal or company funds, never client balances', () => {
    const g = game(), a = ip(g)
    register(g)
    const token = inventionImpactView(g)[0].pending!.token, cash = g.character.money
    resolveInventionPressure(g, a.id, token, 'security')
    expect(g.character.money).toBe(cash - 200_000)
    expect(inventionImpactView(g)[0].securityUntil).toBe(g.year + 3)
    const company = game(), business = createBusinessAsset(company, 'Own IP Company', newBiz(company, 'manufacturing', 'us', 'Chicago', { cash: 1_000_000 }), 1_000_000)
    company.assets.push(business)
    const b = bizOf(company, business)
    saveInventionProducts(b, [newInventionProduct('owned1', 'Matter Fabricator', 'materials', 'generational', company.year)])
    register(company, 'owned1')
    const p = inventionImpactView(company)[0].pending!, personal = company.character.money
    expect(p.companyId).toBe(business.id)
    expect(resolveInventionPressure(company, 'owned1', p.token, 'security')).toBe(true)
    expect(readBiz(company, business).cash).toBe(800_000)
    expect(readBiz(company, business).yearCosts).toBe(200_000)
    expect(company.character.money).toBe(personal)
  })

  it('refusal can produce an actual persistent leak, but never deletes ownership or extends patents', () => {
    const base = game(), a = ip(base)
    register(base)
    let leaked = false
    for (let i = 0; i < 20; i++) {
      const g = structuredClone(base); g.lifeId = `refusal-${i}`
      const token = inventionImpactView(g)[0].pending!.token
      resolveInventionPressure(g, a.id, token, 'refuse')
      if (inventionLeakFactor(g, a.id, g.year) < 1) {
        leaked = true
        expect(inventionLeakFactor(g, a.id, g.year)).toBe(.5)
        expect(readInventionIp(g.assets[0])!.protections[0].expires).toBe(2046)
        expect(g.assets[0].kind).toBe('invention')
        break
      }
    }
    expect(leaked).toBe(true)
  })

  it('revalidates cash, ownership, owner identity, year and replay tokens on every choice', () => {
    const g = game(), a = ip(g)
    register(g)
    const token = inventionImpactView(g)[0].pending!.token
    expect(resolveInventionPressure(g, a.id, 'forged', 'cooperate')).toBe(false)
    expect(resolveInventionPressure(g, a.id, token, 'unknown')).toBe(false)
    g.character.money = 1
    expect(resolveInventionPressure(g, a.id, token, 'security')).toBe(false)
    expect(inventionImpactView(g)[0].pending).not.toBeNull()
    const heir = structuredClone(g); heir.character.id = 'heir'
    expect(resolveInventionPressure(heir, a.id, token, 'cooperate')).toBe(false)
    const sold = structuredClone(g); sold.assets = []
    expect(resolveInventionPressure(sold, a.id, token, 'cooperate')).toBe(false)
    next(g)
    expect(resolveInventionPressure(g, a.id, token, 'cooperate')).toBe(false)
    expect(inventionLeakFactor(g, a.id, g.year)).toBe(1)
  })

  it('annual pressure is deterministic, fiscal-guarded, owner-scoped, and menus do not mutate or roll', () => {
    const g = game(), a = ip(g)
    register(g)
    const before = JSON.stringify(g), rng = g.rng
    walk(g, inventionImpactNodes(g, a.id)); inventionLeakFactor(g, a.id, g.year)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    next(g)
    const copy = structuredClone(g)
    yearlyInventionImpact(g); yearlyInventionImpact(copy)
    expect(g).toEqual(copy)
    expect(inventionLeakFactor(g, a.id, g.year)).toBeLessThan(1) // an ignored request has consequences
    const settled = JSON.stringify(g)
    yearlyInventionImpact(g)
    expect(JSON.stringify(g)).toBe(settled)
    const heir = structuredClone(g)
    heir.character.id = 'heir'; heir.character.firstName = 'Heir'
    expect(inventionLeakFactor(heir, a.id, heir.year)).toBe(inventionLeakFactor(g, a.id, g.year))
    for (const n of inventionImpactNodes(heir, a.id)) if (n.type === 'action') expect(n.id).not.toContain('pressure')
  })

  it('drops requests for sold or uncontrolled products and handles malformed impact JSON safely', () => {
    const g = game(), a = ip(g)
    register(g); g.assets = []; next(g); yearlyInventionImpact(g)
    expect(inventionImpactView(g)[0].pending).toBeNull()
    expect(inventionLeakFactor(g, a.id, g.year)).toBe(1)
    g.flags.inventionImpact = { events: [{ id: 'bad', kind: 'fake' }, { id: 'safe', kind: 'big', created: NaN, leaks: [{ year: 2020, factor: -5 }], pending: [] }] } as unknown as Json
    const before = JSON.stringify(g)
    expect(inventionImpactView(g)).toHaveLength(1)
    expect(inventionLeakFactor(g, 'safe', 2026)).toBe(.2)
    expect(inventionLeakFactor(g, 'missing', 2026)).toBe(1)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('rebinds a pending personal request on real company assignment with a new funding-source token', () => {
    const g = game(), a = ip(g)
    register(g)
    const old = inventionImpactView(g)[0].pending!.token
    const business = createBusinessAsset(g, 'IP Buyer', newBiz(g, 'manufacturing', 'us', 'Chicago', { cash: 1_000_000 }), 1_000_000)
    g.assets.push(business)
    const b = bizOf(g, business)
    saveInventionProducts(b, [newInventionProduct(a.id, a.name, 'materials', 'generational', g.year)])
    g.assets = g.assets.filter(x => x !== a)
    expect(transferInventionImpact(g, a.id, business.id)).toBe(true)
    const p = inventionImpactView(g)[0].pending!
    expect(p.token).not.toBe(old)
    expect(p.companyId).toBe(business.id)
    expect(resolveInventionPressure(g, a.id, old, 'security')).toBe(false)
    expect(resolveInventionPressure(g, a.id, p.token, 'security')).toBe(true)
    expect(readBiz(g, business).cash).toBe(800_000)
  })
})
