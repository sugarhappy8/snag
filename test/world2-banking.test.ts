import { describe, expect, it } from 'vitest'
import { simulateFinanceYear } from '../src/game/business/finance-firm'
import { loanTotal, readBank, saveBank, type BankBook } from '../src/game/business/bank-state'
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
// Banking 2.0 client books: performing loans + loans in workout + reserves + bonds = deposits + advance.
function balanced(b: BizState): BankBook {
  const f = readBank(b)
  expect(loanTotal(f) + f.badNet + f.bonds + f.reserves).toBeCloseTo(f.deposits + f.advance, 3)
  expect(b.inventory).toBe(0)
  return f
}
const lent = (from: BankBook, to: BankBook) => loanTotal(to) - loanTotal(from)

describe('World 2: actual bank settlements and lagged feedback', () => {
  it('forecast clones return actual-book telemetry without emitting world events, moving client principal, or consuming RNG', () => {
    const x = institution(), before = JSON.stringify(x.g), opening = readBank(x.b)
    const clone = structuredClone(x.b), cash = clone.cash, debt = clone.debt
    const result = simulateFinanceYear(x.g, clone, x.fiscal, 0)
    const closing = balanced(clone)
    expect(result.bank).toEqual({ bankLoss: closing.last!.bankLoss, bankRun: closing.last!.runWithdrawals, bankLending: lent(opening, closing) })
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
    const base = readBank(x.b)
    // A distrusted, illiquid online bank: some years savers panic, some years they just drift away.
    base.trust = 5; base.savingsGap = -.03
    base.loans.business = base.deposits * .8; base.bonds = base.deposits * .1; base.reserves = base.deposits * .1; base.badNet = 0
    saveBank(x.b, base)
    let runs = 0, ordinary = 0
    for (let i = 0; i < 24; i++) {
      const g = { ...x.g, lifeId: `bank-withdrawal-${i}` }, clone = structuredClone(x.b)
      clone.cash = 4_000_000
      const cash = clone.cash, debt = clone.debt
      const result = simulateFinanceYear(g, clone, x.fiscal, 0), f = balanced(clone)
      expect(f.last!.withdrawals).toBeGreaterThan(0)
      expect(f.last!.withdrawals).toBeGreaterThanOrEqual(f.last!.runWithdrawals)
      if (f.last!.runWithdrawals > 0) { runs++; expect(result.bank!.bankRun).toBe(f.last!.runWithdrawals); expect(f.run).not.toBeNull() }
      else { ordinary++; expect(result.bank!.bankRun).toBe(0) }
      // Panicked savers are paid out of the client book; only booked losses touch shareholders' cash.
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
    const opening = readBank(x.b), countries = JSON.stringify(economyState(x.g)!.countries)
    yearlyBusinessImpl(x.g)
    const b = readBiz(x.g, x.a), closing = balanced(b)
    const feedback = economyState(x.g)!.pending.find(p => p.country === 'us' && p.sector === 'finance')!
    expect(feedback.bankLoss).toBeCloseTo(closing.last!.bankLoss / gdp('us'), 14)
    expect(feedback.bankRun).toBeCloseTo(closing.last!.runWithdrawals / gdp('us'), 14)
    expect(feedback.bankLending).toBeCloseTo(closing.last!.loanFlow / gdp('us'), 12)
    expect(closing.last!.loanFlow).toBeCloseTo(lent(opening, closing), -1)
    expect(feedback.failure).toBe(Math.max(0, -b.cash - closing.last!.bankLoss) / gdp('us'))
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
    const opening = readBank(x.b)
    npcBusinessYear(x.g, p, life)
    const company = npcCompany(p, x.g.year)!, closing = balanced(company.b)
    const feedback = economyState(x.g)!.pending.find(p => p.country === 'us' && p.sector === 'finance')!
    expect(feedback.bankLoss).toBeCloseTo(closing.last!.bankLoss / gdp('us'), 14)
    expect(feedback.bankRun).toBeCloseTo(closing.last!.runWithdrawals / gdp('us'), 14)
    expect(feedback.bankLending).toBeCloseTo(lent(opening, closing) / gdp('us'), 12)
    expect(feedback.failure).toBe(0)
    const before = JSON.stringify(x.g)
    npcBusinessYear(x.g, p, life)
    expect(JSON.stringify(x.g)).toBe(before)
  })

  it('NPC bank insolvency reports realized credit losses once and only the remaining non-credit shortfall as generic failure', () => {
    const x = institution(), p = createPerson(x.g, { relation: 'friend', age: 40, money: 1e6 }), life = initializeNpc(x.g, p)
    life.skill = 35; life.country = 'us'; life.city = 'Chicago'
    // Reckless lending on borrowed money: the year's credit losses and debt service sink the bank.
    x.b.cash = 0; x.b.openFraction = 1; x.b.debt = 30_000_000; x.b.debtRate = .12
    const f = readBank(x.b); f.appetite = 'highYield'; f.loans.business = f.deposits * .7; f.reserves = f.deposits * .2; f.bonds = f.deposits * .1; saveBank(x.b, f)
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
