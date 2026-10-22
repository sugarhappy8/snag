// R2-L12 (A.K1 e): migration 7, the second half of the business directory (bank, board, career, deeptech, events, exit, founding,
// franchise, funds, groups, nepo, rescue, sector, venues and the rest). Every scenario plays one real flow through its public function
// and asserts the three things the batch owes: the player's cash and the player's account never part (driftSince), the reason rows and
// the class of the counterparty are the ones the plan names (flowTotal), and the books balance (expectConserved). Not in the fast tier.
import { describe, expect, it } from 'vitest'
import { becomeCeo, ownerTakesOver } from '../src/game/business/career'
import { evolve, recordYear, simulateYear, startupCost, valuationOf } from '../src/game/business/economy'
import { closeBusiness, sellBusiness } from '../src/game/business/exit'
import { createBusinessAsset, listingsForSale, newBiz } from '../src/game/business/founding'
import { sellFranchises } from '../src/game/business/franchise'
import { runCampaign } from '../src/game/business/fund-actions'
import { simulateFinanceYear } from '../src/game/business/finance-firm'
import { payOut } from '../src/game/business/board-menu'
import { payFamilyBusinessProceeds } from '../src/game/business/dynasty-ownership'
import { simulateDeepTechYear } from '../src/game/business/deeptech'
import { transactEquity } from '../src/game/business/rescue'
import { bizOf, type BizState } from '../src/game/business/state'
import { applyPlan, autoPlan } from '../src/game/business/yearly'
import { addLoan } from '../src/game/finance'
import { flowsOf } from '../src/game/kernel/ledger'
import { createPerson } from '../src/game/people'
import type { Asset, GameState } from '../src/game/types'
import { adultIn, found } from './deeptech-kit'
import { firm } from './fund-fixtures'
import { makeTestGame } from './helpers'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'

const rows = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length

/** Nothing the scenario did went through the default reason, and the books balance. */
function clean(g: GameState): void {
  expect(rows(g, 'unreasoned')).toBe(0)
  expectConserved(g)
}

/** A rich owner and one company with cash in the bank. */
function owner(industry: BizState['industry'] = 'cafe') {
  const g = makeTestGame(32, { age: 35, money: 100_000_000 })
  const a = createBusinessAsset(g, 'Test company', newBiz(g, industry, 'us', 'Chicago', { cash: 8_000_000, founded: 2020 }), 8_000_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.valuation = valuationOf(b)
  return { g, a, b }
}

/** A company run by its owner for three booked years, the way the franchise tests make one (every year through simulateYear). */
function seasoned(industry: BizState['industry'] = 'cafe') {
  const { g, a, b } = owner(industry)
  becomeCeo(g, a, b)
  applyPlan(b, autoPlan(g, b, 1))
  for (let y = 0; y < 3; y++) {
    const r = simulateYear(g, b, g.year, b.ownerSalary)
    evolve(g, b, r.stmt, g.year)
    recordYear(b, r.stmt)
    b.valuation = valuationOf(b)
    g.year += 1
    applyPlan(b, autoPlan(g, b, r.stmt.cycle))
  }
  b.brand = 60
  b.quality = 70
  if (b.last && b.last.net <= 0) b.last = { ...b.last, net: 10_000 }
  g.queue = []
  return { g, a, b }
}

const firmAcct = (a: Asset): `firm:${string}` => `firm:${a.id}`

describe('R2-L12: selling and closing a company', () => {
  it('1. sellBusiness with a founding loan: the sale, the capital gains tax and the loan payoff are three reasons and the cash gain is their sum', () => {
    const { g, a, b } = owner()
    const loan = addLoan(g, { kind: 'business', lender: 'First Bank', principal: 100_000, rate: 0.06, years: 7 })
    b.loanId = loan.id
    b.invested = 200_000
    b.share = 1
    const before = booksOf(g)
    sellBusiness(g, a, b, 1_000_000, 'a buyer')
    const gain = g.character.money - before.cash
    expect(gain).toBeGreaterThan(0)
    const tax = flowTotal(g, 'tax.capgains', 'gov')
    expect(tax).toBeGreaterThan(0)
    expect(flowTotal(g, 'tax.capgains', 'person')).toBe(-tax)
    expect(flowTotal(g, 'firm.sale', 'person')).toBe(1_000_000)
    expect(flowTotal(g, 'loan.repay', 'person')).toBe(-100_000)
    expect(flowTotal(g, 'loan.repay', 'pool')).toBe(100_000)
    expect(gain).toBe(1_000_000 - tax - 100_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('1b. closing a company books what the owner is left with as firm.sale', () => {
    const { g, a, b } = owner()
    const before = booksOf(g)
    closeBusiness(g, a, b, 500_000)
    const gain = g.character.money - before.cash
    expect(gain).toBeGreaterThan(0)
    expect(flowTotal(g, 'firm.sale', 'person')).toBe(gain)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('1c. a dividend leaves the firm account and reaches the owner and a relative, less the tax withheld on the relative', () => {
    const { g, a, b } = owner()
    b.share = 0.5
    const kin = createPerson(g, { relation: 'sibling', age: 40, money: 0 })
    b.familyShares = [{ id: kin.id, share: 0.25 }]
    const cash = b.cash
    const before = booksOf(g)
    const mine = payOut(g, a, b, 400_000)
    expect(mine).toBe(200_000)
    expect(b.cash).toBe(cash - 400_000)
    expect(g.character.money - before.cash).toBe(200_000)
    expect(kin.money).toBeCloseTo(400_000 * 0.25 * 0.8, 6)
    expect(flowTotal(g, 'dividend', 'firm')).toBe(-400_000)
    expect(acctOf(g, firmAcct(a))).toBe(-400_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('1d. a sale paid to a relative books the proceeds as firm.sale to the person', () => {
    const { g, b } = owner()
    const kin = createPerson(g, { relation: 'child', age: 30, money: 0 })
    b.familyShares = [{ id: kin.id, share: 0.5 }]
    payFamilyBusinessProceeds(g, b, 1_000_000)
    expect(kin.money).toBe(500_000)
    expect(flowTotal(g, 'firm.sale', 'person')).toBe(500_000)
    clean(g)
  })
})

describe('R2-L12: founding a company', () => {
  it('2. founding with a bank loan: the lender creates the loan for the firms pool and the founder pays the rest in', () => {
    const g = adultIn('us', 5_000_000, 3, 90, 2010)
    const before = booksOf(g)
    found(g, 'cafe', ['loan', 'seed', 'cofounder', 'me', 'refuse', 'yes'])
    const loan = g.character.loans.find((l) => l.kind === 'business')
    expect(loan, 'the founder took the bank loan').toBeTruthy()
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-loan!.balance)
    expect(flowTotal(g, 'inject', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:firms')).toBe(loan!.balance + paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L12: a company moves its own cash', () => {
  it('3. selling franchises books the fees to the firm account once', () => {
    const { g, a, b } = seasoned()
    const cash = b.cash
    const account = acctOf(g, firmAcct(a))
    expect(sellFranchises(g, a, b, 1)).toBe(1)
    const net = b.cash - cash
    expect(net).toBeGreaterThan(0)
    expect(flowTotal(g, 'sales', 'firm')).toBeGreaterThanOrEqual(net)
    expect(acctOf(g, firmAcct(a)) - account).toBe(net)
    clean(g)
  })

  it('3b. an owner who puts money into the company moves both purses with one inject row (a rescue)', () => {
    const { g, a, b } = owner('cafe')
    b.share = 0.8
    const cash = b.cash
    const before = booksOf(g)
    expect(transactEquity(g, a.id, 'subscribe', 100_000)).toBe(true)
    expect(b.cash).toBe(cash + 100_000)
    expect(g.character.money).toBe(before.cash - 100_000)
    expect(flowTotal(g, 'inject', 'person')).toBe(-100_000)
    expect(flowTotal(g, 'inject', 'firm')).toBe(100_000)
    expect(acctOf(g, firmAcct(a))).toBe(100_000)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('3c. a campaign is marketing, paid out of the fund\'s own cash', () => {
    const { g, a, b } = firm('asset')
    const cash = b.cash
    expect(runCampaign(g, a.id)).toBe(true)
    const cost = cash - b.cash
    expect(cost).toBeGreaterThan(0)
    expect(flowTotal(g, 'marketing', 'firm', g.year, 'us')).toBe(-cost)
    expect(acctOf(g, firmAcct(a))).toBe(-cost)
    clean(g)
  })

  it('3d. the owner taking over from a hired CEO pays the severance out of company cash', () => {
    const { g, a, b } = owner('cafe')
    b.ceo = 'manager'
    b.manager = { firstName: 'Ada', lastName: 'Lee', gender: 'female', skill: 80, salary: 200_000, since: 2020 }
    const cash = b.cash
    const out = ownerTakesOver(g, b)
    expect(out.severance).toBeGreaterThan(0)
    expect(b.cash).toBe(cash - out.severance)
    expect(flowTotal(g, 'severance', 'firm')).toBe(-out.severance)
    expect(acctOf(g, firmAcct(a))).toBe(-out.severance)
    clean(g)
  })
})

describe('R2-L12: the year', () => {
  it('4. a year of simulateYear books the cash it changed to the firm account, sales when it rose and inputs when it fell', () => {
    const { g, a, b } = seasoned()
    // The three years of the fixture were booked as they went: the account follows the cash from the opening 8,000,000.
    expect(Math.abs(acctOf(g, firmAcct(a)) - (b.cash - 8_000_000))).toBeLessThanOrEqual(2)
    expect(rows(g, 'sales') + rows(g, 'inputs')).toBeGreaterThan(0)
    clean(g)
  })

  it('4b. a deep-tech year of inflation burns what the cash lost', () => {
    const g = adultIn('us', 5_000_000, 3, 90, 2023)
    const b0 = newBiz(g, 'cybersecurity', 'us', 'Chicago', { cash: 4_000_000, founded: 2018 })
    const a = createBusinessAsset(g, 'Test security', b0, 4_000_000)
    g.assets.push(a)
    const b = bizOf(g, a)
    b.valuation = valuationOf(b)
    const r = simulateDeepTechYear(g, a, b, 2022, 0)
    const lost = Math.round(r.stmt.cashErosion)
    expect(lost).toBeGreaterThan(0)
    expect(flowTotal(g, 'inflation', 'burn')).toBe(lost)
    expect(flowTotal(g, 'inflation', 'firm', g.year, 'us')).toBe(-lost)
    expect(Math.abs(acctOf(g, firmAcct(a)) - (b.cash - 4_000_000))).toBeLessThanOrEqual(1)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('4c. a projection on a copy of a company never writes the books', () => {
    const { g, a, b } = firm('hedge')
    const copy = structuredClone(b)
    const world = JSON.stringify(g.world ?? null)
    const cash = copy.cash
    simulateFinanceYear(g, copy, g.year - 1, 0)
    expect(copy.cash).not.toBe(cash)
    expect(JSON.stringify(g.world ?? null)).toBe(world)
    // The same year on the real company is booked, and the books follow its cash.
    const real = b.cash
    simulateFinanceYear(g, b, g.year - 1, 0)
    expect(b.cash).toBe(copy.cash)
    expect(acctOf(g, firmAcct(a))).toBe(b.cash - real)
    clean(g)
  })

  it('4d. listing the companies for sale is a pure read: the books stay as they were', () => {
    const g = adultIn('us', 5_000_000, 3, 90, 2010)
    const before = JSON.stringify(g.world ?? null)
    expect(listingsForSale(g).length).toBeGreaterThan(0)
    expect(JSON.stringify(g.world ?? null)).toBe(before)
    expect(startupCost('cafe', 'us', 'Chicago').total).toBeGreaterThan(0)
    expect(JSON.stringify(g.world ?? null)).toBe(before)
  })
})
