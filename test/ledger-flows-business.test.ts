// R2-L11 (A.K1 e): migration 6, the first half of the business directory. Every scenario plays one real flow of the batch through
// its public function (a menu action, a script, a yearly step) and then asserts the three things the batch owes: the player's cash
// and the player's account never part (driftSince), the company's cash and the company's account never part (firmDrift, which is
// the same check for a firm: the cash change minus the account change, held to the half dollar the books round away), the reason
// rows and the class of the counterparty are the ones the plan names (flowTotal), and the books balance (expectConserved).
// Not in the fast tier.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { forceBankEvent, resolveSeize, seizeNeed } from '../src/game/business/bank-events'
import { readBank, saveBank } from '../src/game/business/bank-state'
import { boardOf } from '../src/game/business/board-state'
import { smartManagerTurn } from '../src/game/business/board-ceo'
import { askingSalary, becomeCeo, installManager, managerCandidate, stepDown } from '../src/game/business/career'
import { dividendSplit, formGroup, groupDividend, moveCash as moveGroupCash, movableCash } from '../src/game/business/conglomerate-actions'
import { groupsOf, liveGroup } from '../src/game/business/conglomerate-state'
import { readFund, saveFund } from '../src/game/business/fund-state'
import { bestPlan, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { fireStaff } from '../src/game/business/staff'
import { fundOf, invite, payOutHolder, putIn, startFund } from '../src/game/business/hedge-fund'
import { hireRelative } from '../src/game/business/nepo-actions'
import { readJob } from '../src/game/business/nepo-job'
import { familyYear } from '../src/game/business/nepo-year'
import { severanceMonths } from '../src/game/business/flavor'
import { readLab } from '../src/game/business/lab-state'
import { bookLabYear } from '../src/game/business/lab-year'
import { runSupply } from '../src/game/business/market-strategy'
import { bizOf, type BizState, type KeyStaff } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { ensureEconomy } from '../src/game/economy'
import { economyState, storeEconomy } from '../src/game/economy/model'
import { acctBalance, flowsOf, peekLedger, type AcctRef } from '../src/game/kernel/ledger'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, Json, MenuNode, ModalItem } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'
import { patchLab } from './lab-kit'
import { firm } from './fund-fixtures'
import { kin, rich } from './hedge-kit'
import { drain, kid, world } from './nepo-kit'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'
import { businessAssetView } from '../src/game/business'

// A fixed life is written as a constant, never as a `seed: <digits>` pin (test/seed-pins.test.ts).
const LIFE = 7

const firmAcct = (a: Asset): AcctRef => `firm:${a.id}` as AcctRef

interface FirmBooks {
  cash: number
  acct: number
}

const firmBooks = (g: GameState, a: Asset, b: BizState): FirmBooks => ({ cash: b.cash, acct: acctBalance(g, firmAcct(a)) })

/** The company's cash change minus its account change since `before`: 0 (to the half dollar) when every change was booked. */
function firmDrift(g: GameState, a: Asset, b: BizState, before: FirmBooks): number {
  const now = firmBooks(g, a, b)
  return now.cash - before.cash - (now.acct - before.acct)
}

const rows = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length

/** Nothing the scenario did went through the default reason, and the books balance. */
function clean(g: GameState): void {
  expect(rows(g, 'unreasoned')).toBe(0)
  expectConserved(g)
}

interface Fixture {
  g: GameState
  a: Asset
  b: BizState
}

/** The player, 40 and rich, owns one company that holds `cash`. No year has been booked. */
function fixture(industry: Industry = 'restaurant', cash = 2_000_000, countryId = 'us'): Fixture {
  const city = getCountry(countryId).cities[0]
  const g = makeTestGame(LIFE, { age: 40, money: 5_000_000, countryId, city })
  const b0 = newBiz(g, industry, countryId, city, { cash, founded: g.year - 6, outlets: [{ countryId, city, count: 4, opened: g.year - 6 }] })
  const a = createBusinessAsset(g, 'Ledger Works', b0, 500_000)
  g.assets.push(a)
  return { g, a, b: bizOf(g, a) }
}

/** The run-it-yourself company: the player is the CEO and the plan is the optimizer's. */
function ownerRun(industry: Industry = 'restaurant', cash = 2_000_000): Fixture {
  const f = fixture(industry, cash)
  becomeCeo(f.g, f.a, f.b)
  const plan = bestPlan(f.g, f.b)
  f.b.price = plan.price
  f.b.production = plan.production
  return f
}

function nodesOf(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && depth < 6 ? [n, ...nodesOf(g, n.children(g), depth + 1)] : [n]))
}

/** Runs a script by id as the popup's button would (no popup is needed: the handlers read the data). */
function script(g: GameState, id: string, choice: string, data: Json): void {
  runScript(g, id, choice, data, undefined as unknown as ModalItem)
}

/** The company-screen action `biz.<key>.<asset id>`, run with `input`. */
function press(g: GameState, a: Asset, key: string, input?: string): void {
  const id = `biz.${key}.${a.id}`
  const node = nodesOf(g, businessAssetView(g, a)).find((n) => n.id === id)
  if (!node || node.type !== 'action') throw new Error(`no action ${id} on the company screen`)
  const why = node.disabledReason?.(g)
  if (why) throw new Error(`${id} is disabled: ${why}`)
  node.run(g, input)
}

describe('R2-L11: the owner and the company purse (manage.ts)', () => {
  it('1. investing your own money is one inject move: the player pays, the company receives, no pool', () => {
    const { g, a, b } = fixture()
    const me = booksOf(g)
    const co = firmBooks(g, a, b)
    press(g, a, 'inject', '250000')
    expect(g.character.money).toBe(4_750_000)
    expect(b.cash).toBe(2_250_000)
    expect(driftSince(g, me)).toBe(0)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'inject', 'person')).toBe(-250_000)
    expect(flowTotal(g, 'inject', 'firm')).toBe(250_000)
    expect(flowTotal(g, 'inject', 'pool')).toBe(0)
    expect(acctOf(g, firmAcct(a))).toBe(250_000)
    clean(g)
  })

  it('2. a bonus is a draw: the company pays, the owner earns it as taxed income, and the books name the draw on both sides', () => {
    const { g, a, b } = ownerRun()
    const me = booksOf(g)
    const co = firmBooks(g, a, b)
    const taxable = Number(g.flags.taxableIncome ?? 0)
    press(g, a, 'bonus', '100000')
    expect(b.cash).toBe(co.cash - 100_000)
    expect(g.character.money).toBe(me.cash + 100_000)
    expect(Number(g.flags.taxableIncome ?? 0) - taxable).toBe(100_000)
    expect(driftSince(g, me)).toBe(0)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'draw', 'firm')).toBe(-100_000)
    expect(flowTotal(g, 'draw', 'person')).toBe(100_000)
    expect(flowTotal(g, 'draw', 'pool')).toBe(0)
    clean(g)
  })

  it('3. a company loan is the lending mint into the company, and repaying it is loan.repay to the banks', () => {
    const { g, a, b } = ownerRun()
    const co = firmBooks(g, a, b)
    const debt = b.debt
    press(g, a, 'borrow', '100000')
    expect(b.cash).toBe(co.cash + 100_000)
    expect(b.debt).toBe(debt + 100_000)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-100_000)
    expect(flowTotal(g, 'loan.principal', 'firm')).toBe(100_000)
    const after = firmBooks(g, a, b)
    press(g, a, 'repay', '40000')
    expect(b.cash).toBe(after.cash - 40_000)
    expect(firmDrift(g, a, b, after)).toBe(0)
    expect(flowTotal(g, 'loan.repay', 'firm')).toBe(-40_000)
    expect(flowTotal(g, 'loan.repay', 'pool')).toBe(40_000)
    expect(acctOf(g, 'pool:banks')).toBe(40_000)
    clean(g)
  })

  it('4. a consultant is a cost of inputs paid to retail', () => {
    const { g, a, b } = ownerRun()
    const co = firmBooks(g, a, b)
    const costs = b.yearCosts
    press(g, a, 'consultant')
    const fee = b.yearCosts - costs
    expect(fee).toBeGreaterThan(0)
    expect(b.cash).toBe(co.cash - fee)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'inputs', 'firm')).toBe(-fee)
    expect(acctOf(g, 'pool:retail')).toBe(fee)
    clean(g)
  })
})

describe('R2-L11: a game studio\'s year (gamestudio.ts)', () => {
  function studio(): Fixture {
    const city = getCountry('us').cities[0]
    const g = makeTestGame(LIFE, { age: 40, money: 5_000_000 })
    const b0 = newBiz(g, 'gameStudio', 'us', city, { cash: 3_000_000, employees: 12, founded: g.year - 6, quality: 60, brand: 40, outlets: [{ countryId: 'us', city, count: 1, opened: g.year - 6 }] })
    const a = createBusinessAsset(g, 'Ledger Games', b0, 500_000)
    g.assets.push(a)
    return { g, a, b: bizOf(g, a) }
  }

  it('5. the year books one operating row, sales or inputs, and the company account follows its cash', () => {
    const { g, a, b } = studio()
    const co = firmBooks(g, a, b)
    g.year += 1
    yearlyBusinessImpl(g)
    expect(b.last).not.toBeNull()
    expect(b.cash).not.toBe(co.cash)
    expect(Math.abs(firmDrift(g, a, b, co))).toBeLessThanOrEqual(1)
    const operating = flowTotal(g, 'sales', 'firm') + flowTotal(g, 'inputs', 'firm')
    expect(operating).not.toBe(0)
    expect(rows(g, 'sales') + rows(g, 'inputs')).toBe(1)
    clean(g)
  })

  it('6. inflation on company cash is a declared burn equal to the statement\'s cashErosion', () => {
    const { g, a, b } = studio()
    inflate(g, 0.1, 0.02)
    const co = firmBooks(g, a, b)
    g.year += 1
    yearlyBusinessImpl(g)
    const eroded = b.last?.cashErosion ?? 0
    expect(eroded).toBeGreaterThan(0)
    expect(peekLedger(g).b.inflation).toBe(eroded)
    expect(flowTotal(g, 'inflation', 'burn')).toBe(eroded)
    expect(Math.abs(firmDrift(g, a, b, co))).toBeLessThanOrEqual(1)
    clean(g)
  })
})

/** The economy of this year, the one about to be booked: prices rise `inflation` while deposits pay `rate`. */
function inflate(g: GameState, inflation: number, rate: number): void {
  ensureEconomy(g)
  const next = structuredClone(economyState(g)!)
  next.year = g.year
  next.countries.us.year = g.year
  next.countries.us.inflation = inflation
  next.countries.us.rate = rate
  storeEconomy(g, next)
}

describe('R2-L11: the cash crunch (yearly.ts)', () => {
  function crunch(cash: number): Fixture {
    const f = fixture()
    f.b.cash = cash
    f.b.valuation = 5_000_000
    return f
  }

  it('7. covering a crunch from your own money is an inject move, and the company lands on exactly zero', () => {
    const { g, a, b } = crunch(-50_000.4)
    const me = booksOf(g)
    const co = firmBooks(g, a, b)
    script(g, 'business.crunch', 'cover', { assetId: a.id })
    expect(b.cash).toBe(0)
    expect(g.character.money).toBe(me.cash - 50_000)
    expect(driftSince(g, me)).toBe(0)
    expect(Math.abs(firmDrift(g, a, b, co))).toBeLessThanOrEqual(1)
    expect(flowTotal(g, 'inject', 'person')).toBe(-50_000)
    expect(flowTotal(g, 'inject', 'firm')).toBe(50_000)
    clean(g)
  })

  it('8. an emergency loan is the lending mint, and an investor\'s money is a firm.sale', () => {
    const loan = crunch(-80_000)
    const co = firmBooks(loan.g, loan.a, loan.b)
    script(loan.g, 'business.crunch', 'loan', { assetId: loan.a.id })
    expect(flowTotal(loan.g, 'loan.principal', 'mint')).toBe(-88_000)
    expect(flowTotal(loan.g, 'loan.principal', 'firm')).toBe(88_000)
    expect(firmDrift(loan.g, loan.a, loan.b, co)).toBe(0)
    clean(loan.g)

    const inv = crunch(-80_000)
    inv.b.share = 1
    const co2 = firmBooks(inv.g, inv.a, inv.b)
    script(inv.g, 'business.crunch', 'investor', { assetId: inv.a.id })
    expect(flowTotal(inv.g, 'firm.sale', 'firm')).toBe(100_000)
    expect(firmDrift(inv.g, inv.a, inv.b, co2)).toBe(0)
    clean(inv.g)
  })
})

describe('R2-L11: the rest of the company file set', () => {
  it('9. a market move with a supply contract is a cost of inputs', () => {
    const { g, a, b } = ownerRun('manufacturing', 5_000_000)
    const co = firmBooks(g, a, b)
    expect(runSupply(g, a, b)).toBe(true)
    const cost = co.cash - b.cash
    expect(cost).toBeGreaterThan(0)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'inputs', 'firm')).toBe(-cost)
    clean(g)
  })
})

describe('R2-L11: R&D, staff and competition', () => {
  it('10. a lab year books the credit and the grant as benefit from the state and the team as payroll', () => {
    const { g, a, b } = fixture('manufacturing', 5_000_000)
    patchLab(b, (d) => {
      d.team = [g.year - 5, g.year - 5]
      d.due.grant = 50_000
    })
    const co = firmBooks(g, a, b)
    bookLabYear(g, a, b, g.year - 1)
    const row = readLab(b).ledger.at(-1)!
    expect(row.grant).toBe(50_000)
    expect(row.payroll).toBeGreaterThan(0)
    expect(b.cash).toBe(co.cash + row.credit + row.grant + row.royalty - row.payroll)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'benefit', 'firm')).toBe(row.credit + row.grant)
    expect(flowTotal(g, 'benefit', 'gov')).toBe(-(row.credit + row.grant))
    expect(flowTotal(g, 'payroll', 'firm')).toBe(-row.payroll)
    expect(flowTotal(g, 'royalty', 'firm')).toBe(row.royalty)
    clean(g)
  })

  it('11. letting a key employee go pays severance as payroll, and a wrongful dismissal suit is legal', () => {
    const { g, a, b } = fixture('restaurant', 2_000_000, 'de')
    const s: KeyStaff = { id: 's1', firstName: 'Ada', lastName: 'Lee', gender: 'female', age: 40, role: 'Head of Sales', focus: 'sales', skill: 80, salary: 120_000, trait: 'steady', morale: 80, years: 3 }
    b.staff.push(s)
    const sev = Math.round((s.salary * severanceMonths('de')) / 12)
    expect(sev).toBeGreaterThan(0)
    const co = firmBooks(g, a, b)
    fireStaff(g, a, b, s)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'payroll', 'firm')).toBe(-sev)
    expect(flowTotal(g, 'payroll', 'pool')).toBe(sev)
    expect(flowTotal(g, 'payroll', 'firm') + flowTotal(g, 'legal', 'firm')).toBe(b.cash - co.cash)
    clean(g)
  })

  it('12. a copycat suit is legal cost, and the damages it wins are legal income', () => {
    const { g, a, b } = fixture('restaurant', 2_000_000)
    const co = firmBooks(g, a, b)
    script(g, 'business.comp.copycat', 'sue', { assetId: a.id, rival: 'Rival Co', rivalId: 'rival1', product: 'Widget' })
    expect(b.cash).not.toBe(co.cash)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'legal', 'firm')).toBe(b.cash - co.cash)
    expect(acctOf(g, 'pool:legal')).toBe(-(b.cash - co.cash))
    clean(g)
  })

  it('13. a defensive marketing move is a cost of marketing', () => {
    const { g, a, b } = fixture('restaurant', 2_000_000)
    const co = firmBooks(g, a, b)
    script(g, 'business.comp.priceWar', 'differentiate', { assetId: a.id, rival: 'Rival Co', rivalId: 'rival1' })
    expect(b.cash).toBeLessThan(co.cash)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'marketing', 'firm')).toBe(b.cash - co.cash)
    clean(g)
  })
})

describe('R2-L11: the family business and the hired CEO', () => {
  it('14. family payroll: the company pays it as payroll and the relative is paid, net of tax, as a wage', () => {
    const { g, a, b } = world(101)
    const p = kid(g, 25, { smarts: 70 })
    hireRelative(g, a, b, p, { rank: 1 }, { quiet: true })
    const pay = readJob(p)!.pay
    const cur = bizOf(g, a)
    const co = firmBooks(g, a, cur)
    const money = p.money
    const kinAcct = `person:${p.id}` as AcctRef
    const kin0 = acctOf(g, kinAcct)
    g.year += 1
    g.yearActions = {}
    familyYear(g)
    drain(g)
    const got = Math.round(p.money - money)
    expect(got).toBeGreaterThan(0)
    expect(flowTotal(g, 'payroll', 'firm')).toBeLessThanOrEqual(-pay)
    expect(acctOf(g, kinAcct) - kin0).toBe(got)
    expect(Math.abs(firmDrift(g, a, cur, co))).toBeLessThanOrEqual(1)
    clean(g)
  })

  it('15. a hired CEO on a cash mandate pays the dividend: the company pays all of it, the owner gets the owner\'s share', () => {
    const { g, a, b } = ownerRun('restaurant', 5_000_000)
    stepDown(g, a, b, { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill: 90, salary: askingSalary(b, 90), since: g.year, style: 'steady', integrity: 100 })
    g.queue = []
    boardOf(b).mandate = 'cash'
    boardOf(b).limits = { capex: 0.05, reserve: 2, pay: 1.25 }
    const me = booksOf(g)
    smartManagerTurn(g, a, b)
    const paid = g.character.money - me.cash
    expect(paid).toBeGreaterThan(0)
    expect(driftSince(g, me)).toBe(0)
    // The owner owns all of it, so the company paid exactly what the owner earned, and the pool took nothing.
    expect(b.share).toBe(1)
    expect(flowTotal(g, 'dividend', 'person')).toBe(paid)
    expect(flowTotal(g, 'dividend', 'firm')).toBe(-paid)
    expect(flowTotal(g, 'dividend', 'pool')).toBe(0)
    clean(g)
  })
})

describe('R2-L11: the hedge fund (hedge-fund.ts)', () => {
  it('16. opening a fund and putting more in is trade.buy from the player, and a relative joining is trade.buy from the relative', () => {
    const g = rich()
    const me = booksOf(g)
    expect(startFund(g, 'family', 1_000_000)).toBe(true)
    expect(g.character.money).toBe(me.cash - 1_000_000)
    expect(driftSince(g, me)).toBe(0)
    expect(flowTotal(g, 'trade.buy', 'person')).toBe(-1_000_000)
    const row = fundOf(g, 'family')!
    expect(putIn(g, row.a.id, 200_000)).toBe(true)
    expect(driftSince(g, me)).toBe(0)
    expect(flowTotal(g, 'trade.buy', 'person')).toBe(-1_200_000)
    const sis = kin(g, 'sibling', 2_000_000)
    const sis0 = sis.money
    const kinAcct = `person:${sis.id}` as AcctRef
    expect(invite(g, row.a.id, sis.id)).toBe(true)
    const put = sis0 - sis.money
    expect(put).toBeGreaterThan(0)
    expect(acctOf(g, kinAcct)).toBe(-Math.round(put))
    clean(g)
  })

  it('17. paying a relative out of the fund is trade.sell to the relative, one booking', () => {
    const g = rich()
    expect(startFund(g, 'family', 1_000_000)).toBe(true)
    const row = fundOf(g, 'family')!
    const sis = kin(g, 'sibling', 2_000_000)
    expect(invite(g, row.a.id, sis.id)).toBe(true)
    const kinAcct = `person:${sis.id}` as AcctRef
    const before = acctOf(g, kinAcct)
    const money = sis.money
    expect(payOutHolder(g, row.a.id, sis.id)).toBe(true)
    const back = sis.money - money
    expect(back).toBeGreaterThan(0)
    expect(acctOf(g, kinAcct) - before).toBe(Math.round(back))
    expect(flowTotal(g, 'trade.sell', 'person')).toBe(Math.round(back))
    clean(g)
  })
})

describe('R2-L11: a group of companies (conglomerate-actions.ts, conglomerate-year.ts)', () => {
  function group(...industries: Industry[]): { g: GameState; ids: string[]; groupId: string } {
    const g = createNewLife({ seed: LIFE, year: 1985, countryId: 'us' })
    g.queue = []
    g.year = 2024
    g.character.age = 39
    g.character.money = 5_000_000
    g.character.talent = null
    g.character.talents = []
    const ids = industries.map((industry, i) => {
      const city = getCountry('us').cities[i % 3]
      const b0 = newBiz(g, industry, 'us', city, { cash: 3_000_000, founded: 2018, outlets: [{ countryId: 'us', city, count: 6, opened: 2018 }] })
      const a = createBusinessAsset(g, `Co ${i + 1}`, b0, 200_000)
      g.assets.push(a)
      const b = bizOf(g, a)
      installManager(g, b, managerCandidate(g, b, 70))
      const plan = bestPlan(g, b)
      b.price = plan.price
      b.production = plan.production
      return a.id
    })
    for (let y = 0; y < 2; y++) {
      g.year += 1
      g.character.age += 1
      yearlyBusinessImpl(g)
      drain(g)
    }
    g.queue = []
    expect(formGroup(g, ids, 'Ledger Holdings')).toBe(true)
    drain(g)
    return { g, ids, groupId: groupsOf(g)[0]!.core.id }
  }

  it('18. moving cash between two divisions is one inject move between their accounts, and nothing else', () => {
    const { g, groupId } = group('restaurant', 'cafe', 'bar')
    const grp = liveGroup(g, groupId)!
    const [, y, z] = grp.members
    const spare = movableCash(g, y!)
    expect(spare).toBeGreaterThan(0)
    const yAcct = `firm:${y!.a.id}` as AcctRef
    const zAcct = `firm:${z!.a.id}` as AcctRef
    const y0 = acctOf(g, yAcct)
    const z0 = acctOf(g, zAcct)
    const cashY = bizOf(g, y!.a).cash
    const cashZ = bizOf(g, z!.a).cash
    const inject = flowTotal(g, 'inject', 'firm')
    expect(moveGroupCash(g, groupId, y!.a.id, z!.a.id, spare * 10)).toBe(true)
    drain(g)
    const moved = cashY - bizOf(g, y!.a).cash
    expect(moved).toBeGreaterThan(0)
    expect(bizOf(g, z!.a).cash - cashZ).toBe(moved)
    expect(acctOf(g, yAcct) - y0).toBe(-moved)
    expect(acctOf(g, zAcct) - z0).toBe(moved)
    expect(flowTotal(g, 'inject', 'firm') - inject).toBe(0)
    clean(g)
  })

  it('19. a group dividend is a dividend: each division pays its part, the owner earns the owner\'s share', () => {
    const { g, groupId } = group('restaurant', 'cafe')
    const grp = liveGroup(g, groupId)!
    const split = dividendSplit(g, grp, 1_000_000)
    expect(split.n).toBeGreaterThan(0)
    const me = booksOf(g)
    const before = new Map(grp.members.map((x) => [x.a.id, firmBooks(g, x.a, bizOf(g, x.a))]))
    const dividend = flowTotal(g, 'dividend', 'firm')
    expect(groupDividend(g, groupId, 1_000_000)).toBe(true)
    drain(g)
    expect(g.character.money - me.cash).toBe(split.mine)
    expect(driftSince(g, me)).toBe(0)
    for (const x of grp.members) expect(Math.abs(firmDrift(g, x.a, bizOf(g, x.a), before.get(x.a.id)!))).toBeLessThanOrEqual(1)
    expect(flowTotal(g, 'dividend', 'firm') - dividend).toBe(-split.n)
    expect(flowTotal(g, 'dividend', 'person')).toBe(split.mine)
    clean(g)
  })

  it('20. the first group year charges each new division an integration bill as inputs', () => {
    const { g } = group('restaurant', 'cafe')
    const before = flowTotal(g, 'inputs', 'firm')
    g.year += 1
    g.character.age += 1
    yearlyBusinessImpl(g)
    drain(g)
    expect(flowTotal(g, 'inputs', 'firm')).toBeLessThan(before)
    clean(g)
  })
})

describe('R2-L11: a bank\'s events (bank-events.ts)', () => {
  function bank(cash = 15_000_000, year = 2030): Fixture {
    const city = getCountry('us').cities[0]
    const g = makeTestGame(LIFE, { age: 40, money: 500_000_000, countryId: 'us', city })
    g.year = year
    const b0 = newBiz(g, 'bank', 'us', city, { cash, founded: year - 3, ownerSalary: 0 })
    b0.openFraction = 1
    const a = createBusinessAsset(g, 'Test Savings & Loan', b0, b0.cash)
    g.assets.push(a)
    const b = bizOf(g, a)
    const book = readBank(b)
    Object.assign(book, { deposits: 700_000_000, loans: { business: 0, mortgage: 600_000_000, auto: 0, cards: 0 }, reserves: 60_000_000, bonds: 40_000_000, badNet: 0 })
    saveBank(b, book)
    return { g, a, b }
  }

  function popup(g: GameState, scriptId: string): Json {
    const m = g.queue.find((x) => x.kind === 'choice' && x.scriptId === scriptId)
    if (!m || m.kind !== 'choice') throw new Error(`no ${scriptId} popup`)
    return m.data ?? {}
  }

  it('21. a fake-loan fraud is a write-off: the company loses the money and the lender\'s deposit is burned', () => {
    const { g, a, b } = bank()
    const co = firmBooks(g, a, b)
    expect(forceBankEvent(g, a, b, 'fraud')).toBe(true)
    const data = popup(g, 'bank.event') as Record<string, number>
    script(g, 'bank.event', 'confess', data as Json)
    const loss = Number(data.amount)
    expect(loss).toBeGreaterThan(0)
    expect(co.cash - b.cash).toBe(loss)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(peekLedger(g).b.writeoff).toBe(loss)
    expect(flowTotal(g, 'writeoff', 'firm')).toBe(-loss)
    expect(flowTotal(g, 'writeoff', 'burn')).toBe(loss)
    clean(g)
  })

  it('22. recapitalizing for the regulator from your own money is an inject move', () => {
    const { g, a, b } = bank(1_000_000)
    const book = readBank(b)
    book.seize = true
    saveBank(b, book)
    const need = seizeNeed(g, b, readBank(b))
    expect(need).toBeGreaterThan(0)
    const me = booksOf(g)
    const co = firmBooks(g, a, b)
    resolveSeize(g, a, bizOf(g, a), 'inject')
    expect(g.character.money).toBe(me.cash - need)
    expect(bizOf(g, a).cash).toBe(co.cash + need)
    expect(driftSince(g, me)).toBe(0)
    expect(firmDrift(g, a, bizOf(g, a), co)).toBe(0)
    expect(flowTotal(g, 'inject', 'person')).toBe(-need)
    expect(flowTotal(g, 'inject', 'firm')).toBe(need)
    clean(g)
  })

  it('23. a state rescue buys a stake: the money comes from the state as a firm.sale', () => {
    // A top-ten bank in 2009 (a crisis) with 150 billion of capital against 2.5 trillion of loans.
    const { g, a, b } = bank(1.5e11, 2009)
    const book = readBank(b)
    Object.assign(book, { deposits: 3e12, loans: { business: 2.5e12, mortgage: 0, auto: 0, cards: 0 }, bonds: 2e11, reserves: 3e11, badNet: 0 })
    saveBank(b, book)
    b.valuation = valuationOf(b)
    const co = firmBooks(g, a, b)
    const before = acctOf(g, 'gov:us')
    expect(forceBankEvent(g, a, b, 'tbtf')).toBe(true)
    const data = popup(g, 'bank.event') as Record<string, number>
    script(g, 'bank.event', 'accept', data as Json)
    const inject = Number(data.inject)
    expect(inject).toBeGreaterThan(0)
    expect(bizOf(g, a).cash - co.cash).toBe(inject)
    expect(firmDrift(g, a, bizOf(g, a), co)).toBe(0)
    expect(flowTotal(g, 'firm.sale', 'firm')).toBe(inject)
    expect(acctOf(g, 'gov:us') - before).toBe(-inject)
    clean(g)
  })
})

describe('R2-L11: an investment firm\'s trouble (fund-events.ts)', () => {
  function probe(): { g: GameState; a: Asset; b: BizState } {
    const x = firm('hedge', { cash: 2_000_000 })
    const f = readFund(x.b)
    f.probe = { year: x.g.year, crime: 'Securities Fraud', odds: 0.3, by: x.g.character.id }
    saveFund(x.b, f)
    return x
  }

  it('24. the firm pays the lawyers when it can: a legal cost from company cash', () => {
    const { g, a, b } = probe()
    const co = firmBooks(g, a, b)
    script(g, 'fund.probe', 'lawyer', { assetId: a.id })
    const fee = co.cash - b.cash
    expect(fee).toBeGreaterThan(0)
    expect(firmDrift(g, a, b, co)).toBe(0)
    expect(flowTotal(g, 'legal', 'firm')).toBe(-fee)
    expect(rows(g, 'unreasoned')).toBe(0)
  })

  it('25. when the firm cannot, you pay the lawyers yourself: legal, and the player\'s books stay whole', () => {
    const { g, a, b } = probe()
    b.cash = 0
    const me = booksOf(g)
    script(g, 'fund.probe', 'lawyer', { assetId: a.id })
    expect(g.character.money).toBeLessThan(me.cash)
    expect(driftSince(g, me)).toBe(0)
    expect(acctOf(g, 'pool:legal')).toBeGreaterThan(0)
    expect(rows(g, 'unreasoned')).toBe(0)
  })

  it('26. plugging a Ponzi hole with your own money is trade.buy from the player', () => {
    const { g, a, b } = probe()
    const f = readFund(b)
    f.probe = null
    f.ponzi = { since: g.year - 2, hole: 300_000, fees: 50_000, by: g.character.id }
    saveFund(b, f)
    const me = booksOf(g)
    script(g, 'fund.ponzi.end', 'cover', { assetId: a.id })
    expect(g.character.money).toBe(me.cash - 300_000)
    expect(driftSince(g, me)).toBe(0)
    expect(flowTotal(g, 'trade.buy', 'person')).toBe(-300_000)
    clean(g)
  })
})
