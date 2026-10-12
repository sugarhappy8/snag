import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { valuationOf } from '../src/game/business/economy'
import { executiveOperations } from '../src/game/business/executive'
import { closeBusiness, declareBankruptcy, goPublic, sellShares } from '../src/game/business/exit'
import { movableCash } from '../src/game/business/conglomerate-actions'
import type { GroupMember } from '../src/game/business/conglomerate-state'
import { createBusinessAsset, initialProduction, newBiz } from '../src/game/business/founding'
import { bankSettledYear } from '../src/game/business/bank'
import { runBankCampaign, setBankAppetite, setBankRate } from '../src/game/business/bank-actions'
import { LEND_LINES, loanTotal, readBank, saveBank, type BankBook } from '../src/game/business/bank-state'
import { financeEraBlock, financeNodes, simulateFinanceYear } from '../src/game/business/finance-firm'
import { initFund } from '../src/game/business/fund'
import { runCampaign, setFee } from '../src/game/business/fund-actions'
import { FUND_TYPES, readFund, saveFund } from '../src/game/business/fund-state'
import { bizOf, normalizeBiz, readBiz } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { corporateTax, type Industry } from '../src/game/data/markets'
import type { GameState, Json, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function institution(industry: Industry = 'investmentFirm', countryId = 'us') {
  const g = makeTestGame(3, { age: 30, money: 50_000_000, countryId, city: 'Chicago' })
  const b = newBiz(g, industry, countryId, 'Chicago', { cash: 5_000_000 })
  const a = createBusinessAsset(g, 'Test Financial', b, b.cash)
  g.assets.push(a)
  return { g, a, b: bizOf(g, a) }
}

/** Customers' side of a bank always balances: loans + workout + reserves + bonds = deposits + advance. */
function balanced(book: BankBook): void {
  expect(loanTotal(book) + book.badNet + book.reserves + book.bonds).toBeCloseTo(book.deposits + book.advance, 5)
}

function walk(g: GameState, nodes: MenuNode[], depth = 0): void {
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

describe('dedicated financial institutions', () => {
  it('starts segregated client books, not shareholder cash or goods', () => {
    for (const industry of ['investmentFirm', 'bank', 'onlineBank'] as const) {
      const { g, b } = institution(industry)
      expect(b.cash).toBe(5_000_000)
      expect(initialProduction(g, b)).toBe(0)
      expect(b.products).toEqual([])
      const value = valuationOf(b)
      if (industry === 'investmentFirm') {
        const f = readFund(b)
        expect(f.aum).toBeGreaterThan(0)
        f.aum *= 20; saveFund(b, f)
      } else {
        const book = readBank(b)
        expect(book.deposits).toBeGreaterThan(0)
        balanced(book)
        book.deposits *= 20; book.reserves *= 20; book.bonds *= 20
        for (const line of LEND_LINES) book.loans[line] *= 20
        saveBank(b, book)
      }
      expect(valuationOf(b)).toBe(value)
    }
  })

  it('scales the initial client economy locally and gates online banks by era', () => {
    const poor = institution('bank', 'ng'), rich = institution('bank', 'us')
    expect(readBank(poor.b).deposits).toBeLessThan(readBank(rich.b).deposits)
    expect(readFund(institution('investmentFirm', 'ng').b).aum).toBeLessThan(readFund(institution('investmentFirm', 'us').b).aum)
    const { g } = rich
    expect(financeEraBlock(g, 'onlineBank', 'us', 1980)).toBeTruthy()
    expect(financeEraBlock(g, 'onlineBank', 'us', 2026)).toBeNull()
    expect(financeEraBlock(g, 'bank', 'us', 1800)).toBeNull()
    expect(financeEraBlock(g, 'investmentFirm', 'us', 1800)).toBeNull()
  })

  it('loads malformed partial legacy bank saves without exposing client principal', () => {
    const { b } = institution('bank')
    const junk = { deposits: 1_000_000, loanBook: 3_000_000, bonds: -10, reserves: 'bad', controls: Infinity, reserveRatio: -5, confidence: NaN }
    b.financeFirm = { ...junk, lastYear: 2025 } as unknown as Json
    const before = JSON.stringify(b), cash = b.cash
    const book = readBank(b)
    expect(JSON.stringify(b)).toBe(before)
    expect(b.cash).toBe(cash)
    expect(book.deposits).toBe(1_000_000)
    expect(book.advance).toBe(0)
    balanced(book)
    expect(book.trust).toBeGreaterThanOrEqual(0); expect(book.trust).toBeLessThanOrEqual(100)
    expect(book.lastYear).toBe(2025)
    for (const v of [...Object.values(book.loans), book.reserves, book.bonds, book.badNet, book.trust, book.savingsGap, book.loanGap]) expect(Number.isFinite(v)).toBe(true)
    // A record that never booked a year opens fresh books (nothing to migrate, nothing to re-book).
    b.financeFirm = { ...junk, lastYear: NaN } as unknown as Json
    expect(readBank(b).lastYear).toBe(-1)
    balanced(readBank(b))
  })

  it('allocates prebooked foreign royalty income to the country that earned it', () => {
    const home = institution('investmentFirm', 'us')
    const foreign = institution('investmentFirm', 'us')
    const royalty = 10_000_000
    for (const x of [home, foreign]) {
      x.b.openFraction = 0
      x.b.cash = royalty
      x.b.yearIncome = royalty
    }
    const homeResult = simulateFinanceYear(home.g, home.b, home.g.year, 0, { us: royalty })
    const foreignResult = simulateFinanceYear(foreign.g, foreign.b, foreign.g.year, 0, { ae: royalty })
    expect(homeResult.stmt.otherIncome).toBe(royalty)
    expect(foreignResult.stmt.otherIncome).toBe(royalty)
    expect(homeResult.stmt.pbt).toBe(foreignResult.stmt.pbt)
    expect(homeResult.stmt.corpTax).toBe(corporateTax('us', homeResult.stmt.pbt))
    expect(foreignResult.stmt.corpTax).toBe(corporateTax('ae', foreignResult.stmt.pbt))
    const settled = JSON.stringify(foreign.b)
    simulateFinanceYear(foreign.g, foreign.b, foreign.g.year, 0, { ae: royalty })
    expect(JSON.stringify(foreign.b)).toBe(settled)
  })

  it('keeps unclassified one-off income at headquarters beside a partial foreign booking', () => {
    const { g, b } = institution('investmentFirm', 'us')
    const homeIncome = 10_000_000, foreignIncome = 10_000_000
    b.openFraction = 0
    b.cash = homeIncome + foreignIncome
    b.yearIncome = homeIncome + foreignIncome
    const result = simulateFinanceYear(g, b, g.year, 0, { ae: foreignIncome })
    const expected = corporateTax('us', result.stmt.pbt / 2) + corporateTax('ae', result.stmt.pbt / 2)
    expect(Math.abs(result.stmt.corpTax - Math.round(expected))).toBeLessThanOrEqual(1)
  })

  it('cannot turn repeated lever or campaign clicks into earnings and ignores stale actions', () => {
    for (const industry of ['investmentFirm', 'bank'] as const) {
      const { g, a } = institution(industry)
      const cash = readBiz(g, a).cash, personal = g.character.money
      if (industry === 'bank') { setBankRate(g, a.id, 'savings', NaN); setBankRate(g, a.id, 'loan', .3) }
      else { expect(setFee(g, a.id, NaN)).toBe(false); expect(setFee(g, a.id, .02)).toBe(true) }
      expect(readBiz(g, a).cash).toBe(cash)
      const campaign = () => industry === 'bank' ? runBankCampaign(g, a.id) : runCampaign(g, a.id)
      campaign()
      const after = readBiz(g, a).cash
      campaign()
      expect(readBiz(g, a).cash).toBe(after)
      expect(after).toBeLessThan(cash)
      expect(readBiz(g, a).yearCosts).toBe(cash - after)
      expect(g.character.money).toBe(personal)
      const saved = structuredClone(a)
      g.assets = []
      if (industry === 'bank') { setBankAppetite(g, a.id, 'highYield'); setBankRate(g, a.id, 'savings', .1); runBankCampaign(g, a.id) }
      else { setFee(g, a.id, .005); runCampaign(g, a.id) }
      expect(a).toEqual(saved)
    }
  })

  it('keeps financial menus pure and prevents high-rated CEOs planning manufactured units', () => {
    const { g, a, b } = institution('bank')
    const before = JSON.stringify(g)
    walk(g, financeNodes(g, a))
    walk(g, financeNodes(g, a))
    expect(JSON.stringify(g)).toBe(before)
    b.ceo = 'manager'
    b.manager = { firstName: 'Alex', lastName: 'Lee', gender: 'female', skill: 95, salary: 150_000, since: g.year }
    executiveOperations(g, b, 2026, a.id)
    expect(b.production).toBe(0)
    expect(b.price).toBe(0)
  })

  it('cannot pay an owner salary twice when the annual hook is retried', () => {
    const { g, a } = institution('bank')
    const b = bizOf(g, a)
    becomeCeo(g, a, b)
    bizOf(g, a).ownerSalary = 40_000
    g.year = 2027; g.character.age = 31
    yearlyBusinessImpl(g)
    const money = g.character.money, cash = readBiz(g, a).cash
    expect(bankSettledYear(readBiz(g, a))).toBe(2026)
    yearlyBusinessImpl(g)
    expect(g.character.money).toBe(money)
    expect(readBiz(g, a).cash).toBe(cash)
  })

  it('normalizes legacy finance calendar fields to whole years', () => {
    const { b } = institution('investmentFirm')
    b.financeFirm = { algoStarted: 2020.6, algoCompleted: 2022.6, algoResearching: true, lastYear: 2024.6 } as unknown as Json
    expect(readFund(b)).toMatchObject({ type: 'hedge', algoStart: 2021, algoDone: 2023, lastYear: 2025 })
    const bank = institution('bank').b
    bank.financeFirm = { deposits: 10_000_000, lastYear: 2024.6 } as unknown as Json
    expect(readBank(bank).lastYear).toBe(2025)
  })

  it('never pays client capital out through liquidation, bankruptcy, IPO, shares or group treasury', () => {
    const x = institution('bank'), y = institution('bank'), z = institution('bank')
    // Fifty times the savers, parked in reserves and bonds: no more cash may leave the company.
    const customer = readBank(y.b), extra = customer.deposits * 49
    customer.deposits += extra; customer.reserves += extra * .2; customer.bonds += extra * .8
    saveBank(y.b, customer)
    // Fifty times the loans needs more regulatory capital, so it can only shrink what may leave.
    const lender = readBank(z.b)
    lender.deposits *= 50; lender.loans.business *= 50; lender.reserves *= 50; lender.bonds *= 50
    saveBank(z.b, lender)
    const member = (w: typeof x) => ({ a: w.a, b: w.b, m: { own: 1 } }) as GroupMember
    expect(movableCash(x.g, member(x))).toBeGreaterThan(0)
    expect(movableCash(y.g, member(y))).toBe(movableCash(x.g, member(x)))
    expect(movableCash(z.g, member(z))).toBeLessThan(movableCash(x.g, member(x)))
    const beginning = x.g.character.money
    closeBusiness(x.g, x.a, x.b, 100_000); closeBusiness(y.g, y.a, y.b, 100_000)
    expect(x.g.character.money).toBe(beginning + 5_100_000)
    expect(y.g.character.money).toBe(x.g.character.money)
    const bankrupt = institution('bank'), before = bankrupt.g.character.money
    declareBankruptcy(bankrupt.g, bankrupt.a, bankrupt.b, 'Testing:')
    expect(bankrupt.g.character.money).toBe(before)
    const listed = institution('bank'), hugeClients = institution('bank')
    const f = readBank(hugeClients.b)
    f.deposits *= 50; f.loans.business *= 50; f.reserves *= 50; f.bonds *= 50
    saveBank(hugeClients.b, f)
    goPublic(listed.g, listed.a, listed.b); goPublic(hugeClients.g, hugeClients.a, hugeClients.b)
    expect(hugeClients.a.value).toBe(listed.a.value) // estate/inheritance carries only Asset.value
    expect(hugeClients.b.cash).toBe(listed.b.cash)
    sellShares(listed.g, listed.a, listed.b, .25); sellShares(hugeClients.g, hugeClients.a, hugeClients.b, .25)
    expect(hugeClients.g.character.money).toBe(listed.g.character.money)
  })

  it('a closed institution generates no fee/interest revenue', () => {
    for (const kind of ['bank', 'onlineBank', ...FUND_TYPES] as const) {
      const { g, b } = institution(kind === 'bank' || kind === 'onlineBank' ? kind : 'investmentFirm')
      if (kind !== 'bank' && kind !== 'onlineBank') initFund(g, b, kind)
      b.openFraction = 0
      expect(normalizeBiz(b as unknown as Record<string, Json>, g.year).openFraction).toBe(0)
      expect(simulateFinanceYear(g, b, g.year, 0).stmt.revenue).toBe(0)
    }
  })
})
