import { describe, expect, it } from 'vitest'
import { simulateFinanceYear } from '../src/game/business/finance-firm'
import { financeView, saveFinance } from '../src/game/business/finance-firm-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { normalizeBiz, readBiz, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { marketOf, type Industry } from '../src/game/data/markets'
import { ensureEconomy } from '../src/game/economy'
import { economyState, storeEconomy } from '../src/game/economy/model'
import { initializeNpc, npcBusinessYear, npcCompany } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import type { Json } from '../src/game/types'
import { makeTestGame } from './helpers'

function institution(industry: Industry = 'bank') {
  const g = makeTestGame(641, { age: 40, money: 1e9, countryId: 'us', city: 'Chicago' })
  g.year = 2032
  const b = newBiz(g, industry, 'us', 'Chicago', { cash: 50_000_000, founded: 2020, ownerSalary: 0 })
  b.openFraction = 1
  const a = createBusinessAsset(g, 'Connected Bank', b, b.cash)
  g.assets.push(a)
  ensureEconomy(g)
  return { g, a, b: a.details as unknown as BizState, fiscal: g.year - 1 }
}
function gdp(country: string) { const m = marketOf(country); return Math.max(1e9, m.populationM * 1e6 * m.gdpPerCapita) }
function balanced(b: BizState) {
  const f = financeView(b)
  expect(f.loanBook + f.bonds + f.reserves).toBeCloseTo(f.deposits, 5)
  expect(b.inventory).toBe(0)
  return f
}

describe('World 2: actual bank settlements and lagged feedback', () => {
  it('forecast clones return actual-book telemetry without emitting world events, moving client principal, or consuming RNG', () => {
    const x = institution(), before = JSON.stringify(x.g), opening = financeView(x.b)
    const clone = structuredClone(x.b), cash = clone.cash, debt = clone.debt
    const result = simulateFinanceYear(x.g, clone, x.fiscal, 0)
    const closing = balanced(clone)
    expect(result.bank).toEqual({ bankLoss: closing.lastDefaults, bankRun: closing.lastRun ? closing.lastWithdrawals : 0, bankLending: closing.loanBook - opening.loanBook })
    expect(result.bank!.bankLoss).toBeGreaterThan(0)
    expect(clone.cash).toBeCloseTo(cash + result.stmt.net + clone.yearCosts - clone.yearIncome + clone.debt - debt, 0)
    expect(JSON.stringify(x.g)).toBe(before)
    expect(economyState(x.g)!.pending).toEqual([])
    expect(economyState(x.g)!.receipts).toEqual([])
    const second = structuredClone(x.b)
    expect(simulateFinanceYear(x.g, second, x.fiscal, 0)).toEqual(result)
    const settled = JSON.stringify(clone)
    expect(simulateFinanceYear(x.g, clone, x.fiscal, 0).bank).toBeUndefined()
    expect(JSON.stringify(clone)).toBe(settled)
  })

  it('counts only run-driven withdrawals and keeps emergency funding repayable in the same ledger', () => {
    const x = institution('onlineBank')
    const base = financeView(x.b)
    base.confidence = 5; base.reserveRatio = .1; base.controls = 10
    base.loanBook = base.deposits * .8; base.bonds = base.deposits * .1; base.reserves = base.deposits * .1
    saveFinance(x.b, base)
    let runs = 0, ordinary = 0
    for (let i = 0; i < 24; i++) {
      const g = { ...x.g, lifeId: `bank-withdrawal-${i}` }, clone = structuredClone(x.b)
      clone.cash = 4_000_000
      const cash = clone.cash, debt = clone.debt
      const result = simulateFinanceYear(g, clone, x.fiscal, 0), f = balanced(clone)
      expect(f.lastWithdrawals).toBeGreaterThan(0)
      if (f.lastRun) { runs++; expect(result.bank!.bankRun).toBe(f.lastWithdrawals) }
      else { ordinary++; expect(result.bank!.bankRun).toBe(0) }
      expect(clone.cash).toBeCloseTo(cash + result.stmt.net + clone.yearCosts - clone.yearIncome + clone.debt - debt, 0)
      expect(clone.debt - debt).toBeGreaterThanOrEqual(0)
    }
    expect(runs).toBeGreaterThan(0)
    expect(ordinary).toBeGreaterThan(0)
  })

  it('actual player bank settlement queues normalized observations once without treating lost revenue as another default', () => {
    const x = institution()
    // A previous unusually high fee year is not itself a new credit loss.
    const previous = simulateFinanceYear(x.g, structuredClone(x.b), x.fiscal - 1, 0).stmt
    x.b.last = { ...previous, revenue: 1e12 }
    const opening = financeView(x.b), countries = JSON.stringify(economyState(x.g)!.countries)
    yearlyBusinessImpl(x.g)
    const b = readBiz(x.g, x.a), closing = balanced(b)
    const feedback = economyState(x.g)!.pending.find(p => p.country === 'us' && p.sector === 'finance')!
    expect(feedback.bankLoss).toBeCloseTo(closing.lastDefaults / gdp('us'), 14)
    expect(feedback.bankRun).toBeCloseTo((closing.lastRun ? closing.lastWithdrawals : 0) / gdp('us'), 14)
    expect(feedback.bankLending).toBeCloseTo((closing.loanBook - opening.loanBook) / gdp('us'), 14)
    expect(feedback.failure).toBe(Math.max(0, -b.cash - closing.lastDefaults) / gdp('us'))
    expect(feedback.failure).toBe(0)
    expect(JSON.stringify(economyState(x.g)!.countries)).toBe(countries)
    const pending = JSON.stringify(economyState(x.g)!.pending), receipts = [...economyState(x.g)!.receipts], settledCash = b.cash
    yearlyBusinessImpl(x.g)
    expect(JSON.stringify(economyState(x.g)!.pending)).toBe(pending)
    expect(economyState(x.g)!.receipts).toEqual(receipts)
    expect(readBiz(x.g, x.a).cash).toBe(settledCash)
  })

  it('actual NPC bank settlement uses the same telemetry and remains idempotent', () => {
    const x = institution(), p = createPerson(x.g, { relation: 'friend', age: 40, money: 2e6 }), life = initializeNpc(x.g, p)
    life.skill = 50; life.country = 'us'; life.city = 'Chicago'
    x.b.ceo = 'manager'; x.b.manager = { firstName: p.firstName, lastName: p.lastName, gender: p.gender, skill: life.skill, salary: 0, since: 2020 }
    p.data.npcCompany = x.a as unknown as Json
    x.g.assets = []
    const opening = financeView(x.b)
    npcBusinessYear(x.g, p, life)
    const company = npcCompany(p, x.g.year)!, closing = balanced(company.b)
    const feedback = economyState(x.g)!.pending.find(p => p.country === 'us' && p.sector === 'finance')!
    expect(feedback.bankLoss).toBeCloseTo(closing.lastDefaults / gdp('us'), 14)
    expect(feedback.bankRun).toBeCloseTo((closing.lastRun ? closing.lastWithdrawals : 0) / gdp('us'), 14)
    expect(feedback.bankLending).toBeCloseTo((closing.loanBook - opening.loanBook) / gdp('us'), 14)
    expect(feedback.failure).toBe(0)
    const before = JSON.stringify(x.g)
    npcBusinessYear(x.g, p, life)
    expect(JSON.stringify(x.g)).toBe(before)
  })

  it('NPC bank insolvency reports realized credit losses once and only the remaining non-credit shortfall as generic failure', () => {
    const x = institution(), p = createPerson(x.g, { relation: 'friend', age: 40, money: 1e6 }), life = initializeNpc(x.g, p)
    life.skill = 35; life.country = 'us'; life.city = 'Chicago'
    x.b.cash = 0; x.b.openFraction = 1
    const f = financeView(x.b); f.strategy = 'aggressive'; f.controls = 0; saveFinance(x.b, f)
    p.data.npcCompany = x.a as unknown as Json; x.g.assets = []
    const preview = structuredClone(x.b), expected = simulateFinanceYear(x.g, preview, x.fiscal, 0)
    expect(preview.cash).toBeLessThan(0)
    npcBusinessYear(x.g, p, life, true)
    expect(npcCompany(p, x.g.year)).toBeNull()
    const feedback = economyState(x.g)!.pending.find(p => p.country === 'us' && p.sector === 'finance')!
    expect(feedback.bankLoss).toBeCloseTo(expected.bank!.bankLoss / gdp('us'), 14)
    expect(feedback.failure).toBeCloseTo(Math.max(0, -preview.cash - expected.bank!.bankLoss) / gdp('us'), 14)
    const before = JSON.stringify(x.g)
    npcBusinessYear(x.g, p, life, true)
    expect(JSON.stringify(x.g)).toBe(before)
  })

  it('investment firms emit no bank feedback and normalized saves do not re-emit settled observations', () => {
    const investment = institution('investmentFirm')
    expect(simulateFinanceYear(investment.g, structuredClone(investment.b), investment.fiscal, 0).bank).toBeUndefined()
    yearlyBusinessImpl(investment.g)
    const fundFeedback = economyState(investment.g)!.pending.find(p => p.sector === 'finance')!
    expect(fundFeedback.bankLoss).toBeUndefined()
    expect(fundFeedback.bankRun).toBeUndefined()
    expect(fundFeedback.bankLending).toBeUndefined()
    const x = institution()
    yearlyBusinessImpl(x.g)
    const restored = JSON.parse(JSON.stringify(x.g)) as typeof x.g
    const loadedAsset = restored.assets.find(a => a.id === x.a.id)!
    loadedAsset.details = normalizeBiz(loadedAsset.details, restored.year) as unknown as Record<string, Json>
    storeEconomy(restored, economyState(restored)!)
    const pending = JSON.stringify(economyState(restored)!.pending)
    expect(simulateFinanceYear(restored, readBiz(restored, loadedAsset), x.fiscal, 0).bank).toBeUndefined()
    yearlyBusinessImpl(restored)
    expect(JSON.stringify(economyState(restored)!.pending)).toBe(pending)
    expect(economyState(restored)!.receipts).toEqual(economyState(x.g)!.receipts)
  })
})
