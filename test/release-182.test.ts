import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { ageUp, YEARLY_HOOKS } from '../src/game/aging'
import { currencyInflation } from '../src/game/data/currencies'
import { earnIncome } from '../src/game/core'
import { incomeTax, settleIncomeTax, taxAdditionalIncome } from '../src/game/finance'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, diluteManagerEquity, readBiz } from '../src/game/business/state'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { equityDue, grantCeoEquity } from '../src/game/business/executive'
import { canIpo, goPublic } from '../src/game/business/exit'
import { payDividend } from '../src/game/business/board-menu'
import { businessView } from '../src/game/business/manage'
import { bookYear, planFor } from '../src/game/business/economy'
import { formGroup, groupIpo } from '../src/game/business/conglomerate-actions'
import { groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { closeRound } from '../src/game/business/deeptech-funding'
import { techOf } from '../src/game/business/deeptech-core'
import { buySecurity, investmentListing, liquidatePortfolio, sellHolding } from '../src/game/investments'
import { addMarketShock, indexShockFactor, shockFactor } from '../src/game/invest/shocks'
import type { GameState, MenuNode } from '../src/game/types'

function company() {
  const g = makeTestGame(45, { age: 35, money: 1e9, countryId: 'us' })
  g.year = 2026
  const a = createBusinessAsset(g, 'Regression Co', newBiz(g, 'restaurant', 'us', 'Chicago', { cash: 1e7, founded: 2020 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  becomeCeo(g, a, b)
  g.queue = []
  return { g, a, b }
}

function walk(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap(n => n.type === 'menu' && depth < 5 ? [n, ...walk(g, n.children(g), depth + 1)] : [n])
}

describe('v1.8.2 financial regressions', () => {
  it('settles manual dividends before the year resets, without taxing them twice', () => {
    const { g, a, b } = company()
    earnIncome(g, 100_000)
    settleIncomeTax(g)
    expect(payDividend(g, a, b, 1e6)).toBe(true)
    earnIncome(g, 20_000)
    taxAdditionalIncome(g, 20_000)
    const alreadyPaid = g.flags.taxesPaid as number
    const before = g.character.money
    // Isolate the year boundary from random events and the next year's new earnings.
    const hooks = YEARLY_HOOKS.splice(0)
    try { ageUp(g) } finally { YEARLY_HOOKS.push(...hooks) }
    expect(g.character.money).toBe((before - (incomeTax('us', 1_120_000) - alreadyPaid)) / (1 + currencyInflation('us', g.year)))
    expect(g.counters.taxesPaid).toBe(incomeTax('us', 1_120_000))
    expect(g.flags.taxableIncome).toBe(0)
    expect(g.flags.taxesPaid).toBe(0)
    expect(settleIncomeTax(g)).toBe(0)
  })

  it('settles unpaid income restored from a save and respects tax-free countries', () => {
    for (const countryId of ['us', 'ae']) {
      const g = makeTestGame(45, { age: 35, money: 1e7, countryId })
      earnIncome(g, 1e6)
      const saved = JSON.parse(JSON.stringify(g)) as GameState
      expect(settleIncomeTax(saved)).toBe(incomeTax(countryId, 1e6))
      expect(settleIncomeTax(saved)).toBe(0)
    }
  })

  it('books a manual bonus as an expense exactly once while charging cash once', () => {
    const { g, a, b } = company()
    const action = walk(g, businessView(g, a)).find(n => n.id === `biz.bonus.${a.id}`)
    expect(action?.type).toBe('action')
    if (action?.type !== 'action') throw new Error('Missing bonus action')
    const cash = b.cash, costs = b.yearCosts
    action.run(g, '10000')
    expect(bizOf(g, a).cash).toBe(cash - 10000)
    expect(bizOf(g, a).yearCosts).toBe(costs + 10000)
    action.run(g, '10000')
    expect(bizOf(g, a).yearCosts).toBe(costs + 10000)
    expect(readBiz(g, a).yearCosts).toBe(costs + 10000)
    const after = bizOf(g, a)
    const withoutBonus = structuredClone(after)
    withoutBonus.cash += 10000
    withoutBonus.yearCosts -= 10000
    const plan = planFor(g, after, g.year)
    const withBook = bookYear(g, after, g.year, plan, after.production, 0)
    const withoutBook = bookYear(g, withoutBonus, g.year, plan, after.production, 0)
    // After corporate tax relief, the bonus lowers both cash and profit by the same amount.
    expect(withoutBook.stmt.net - withBook.stmt.net).toBeGreaterThan(0)
    expect(withoutBook.cash - withBook.cash).toBeCloseTo(withoutBook.stmt.net - withBook.stmt.net, 0)
  })

  it('dilutes the CEO at IPO without requiring a fresh retention top-up', () => {
    const { g, a, b } = company()
    installManager(g, b, managerCandidate(g, b, 95))
    expect(grantCeoEquity(g, a.id)).toBe(true)
    b.manager!.equityAsked = g.year - 5
    b.history.push({ year: 2025, revenue: 1e9, profit: 400e6, tax: 0, units: 1e8, price: 10, staff: 100, valuation: 1e9, outlets: 100 })
    expect(canIpo(b)).toBeNull()
    goPublic(g, a, b)
    expect(b.share).toBeCloseTo(.675)
    expect(b.manager!.equity).toBeCloseTo(.075)
    expect(b.share + b.manager!.equity! + .25).toBeCloseTo(1)
    expect(equityDue(b.manager!)).toBe(0)
    expect(b.manager!.equityAsked).toBeUndefined()
    expect(grantCeoEquity(g, a.id)).toBe(false)
    expect(equityDue(b.manager!)).toBe(0)
    expect(b.share + b.manager!.equity! + .25).toBeCloseTo(1)
  })

  it('handles old CEOs without grants and repeated issuance without creating equity', () => {
    const { g, b } = company()
    const manager = managerCandidate(g, b, 95)
    diluteManagerEquity(manager, .75)
    expect(manager.equity ?? 0).toBe(0)
    manager.equity = .1
    diluteManagerEquity(manager, .8)
    diluteManagerEquity(manager, .75)
    expect(manager.equity).toBeCloseTo(.06)
    diluteManagerEquity(null, .75)
  })

  it('dilutes group CEO grants at the group IPO and preserves the grant on save/load', () => {
    const { g, a } = company()
    const sister = createBusinessAsset(g, 'Sister', newBiz(g, 'cafe', 'us', 'Chicago', { cash: 1e7 }), 1e6)
    g.assets.push(sister)
    expect(formGroup(g, [a.id, sister.id], 'Regression Holdings')).toBe(true)
    const id = groupsOf(g)[0].core.id
    const grp = liveGroup(g, id)!
    grp.core.ceo = 'manager'
    grp.core.manager = managerCandidate(g, grp.members[0].b, 95)
    for (const member of grp.members) {
      member.b.last = { ...bookYear(g, member.b, g.year, planFor(g, member.b, g.year), member.b.production, 0).stmt, net: 400e6, revenue: 1e9 }
      member.b.valuation = 2e9
    }
    saveGroup(g, grp)
    expect(grantCeoEquity(g, id, true)).toBe(true)
    expect(groupIpo(g, id)).toBe(true)
    const loaded = groupsOf(JSON.parse(JSON.stringify(g)) as GameState)[0]
    expect(loaded.core.manager!.equity).toBeCloseTo(.075)
    expect(loaded.core.share + loaded.core.manager!.equity! + .25).toBeCloseTo(1)
  })

  it('dilutes a deep-tech CEO when new venture shares are issued', () => {
    const { g } = company()
    const a = createBusinessAsset(g, 'Research', newBiz(g, 'aiLab', 'us', 'Chicago', { cash: 1e7 }), 1e6)
    g.assets.push(a)
    const b = bizOf(g, a)
    installManager(g, b, managerCandidate(g, b, 95))
    expect(grantCeoEquity(g, a.id)).toBe(true)
    closeRound(g, a, b, techOf(b), { series: 1, investor: 'Test Ventures', amount: 1e6, pre: 4e6, equity: .2, down: false, bridge: false })
    expect(b.manager!.equity).toBeCloseTo(.08)
    expect(b.share + b.manager!.equity! + .2).toBeCloseTo(1)
  })

  it('compounds each constituent before weighting market news into the index', () => {
    const { g } = company()
    const base = { asset: 'stock' as const, secId: 'fictional-test', exKey: 'test-exchange', slot: 0, name: 'Test', symbol: 'TST', cause: 'contract' as const, fade: 0, countryId: 'us' }
    addMarketShock(g, { ...base, year: 2026, mult: 2 })
    addMarketShock(g, { ...base, year: 2027, mult: .5 })
    expect(indexShockFactor(g, base.exKey, 2026)).toBeCloseTo(1.1)
    expect(shockFactor(g, base.secId, 2027)).toBe(1)
    expect(indexShockFactor(g, base.exKey, 2027)).toBe(1)
    addMarketShock(g, { ...base, secId: 'second-company', year: 2027, mult: 1.5 })
    expect(indexShockFactor(g, base.exKey, 2027)).toBeCloseTo(1.05)
  })

  it.each([[false, false], [true, false], [false, true], [true, true]])('blocks stock/index pumping (bulk %s, foreign %s), including stale saved NAVs', (bulk, foreign) => {
    const { g } = company()
    g.assets = []
    g.character.money = 1e12
    const quotes = investmentListing(g)
    const index = quotes.find(q => q.type === 'index')!
    const stock = quotes.find(q => q.type === 'stock')!
    expect(buySecurity(g, index.secId, 900e9)).toBe(true)
    expect(buySecurity(g, stock.secId, 1e9)).toBe(true)
    expect(investmentListing(g).find(q => q.secId === index.secId)!.price).toBe(index.price)
    expect(investmentListing(g).find(q => q.secId === stock.secId)!.price).toBeGreaterThan(stock.price)
    // Old saves can contain an already-inflated index valuation; sales must use today's NAV.
    const heldIndex = g.assets.find(a => a.details.secId === index.secId)!
    heldIndex.value *= 1.5
    heldIndex.details.price = (heldIndex.details.price as number) * 1.5
    if (foreign) g.character.countryId = 'jp'
    if (bulk) expect(liquidatePortfolio(g)).toBe(true)
    else {
      expect(sellHolding(g, heldIndex.id, 'all')).toBe(true)
      expect(sellHolding(g, g.assets.find(a => a.details.secId === stock.secId)!.id, 'all')).toBe(true)
    }
    expect(g.character.money).toBeLessThanOrEqual(1e12)
  })
})
