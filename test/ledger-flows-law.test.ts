// R2-L7 (A.K1 e): migration 2, the body, law, work, workshop, nation and advisor files. Every scenario plays one real flow of the
// batch through its public function and then asserts the three things the batch owes: the player's cash and the player's account
// never part (driftSince), the reason rows and the class of the counterparty are the ones the plan names (flowTotal), and the books
// balance (expectConserved). Not in the fast tier.
import { describe, expect, it } from 'vitest'
import { yearlyAdvisors } from '../src/game/advisors/year'
import { buyCar, carListings, CAR_PLANS } from '../src/game/assets'
import { yearlyCareer } from '../src/game/careers'
import { earnIncome } from '../src/game/core'
import { arrestPlayer, yearlyCrime } from '../src/game/crime'
import { applyToUniversity } from '../src/game/education'
import { addLoan, payOffLoan, refinanceDebt, refinanceQuote, settleIncomeTax, taxAdditionalIncome, yearlyFinance } from '../src/game/finance'
import { buyLottery, LOTTERY_GAMES, settleBlackjack } from '../src/game/gambling'
import { doctorMenu } from '../src/game/health'
import { acctBalance, flowsOf } from '../src/game/kernel/ledger'
import { editPolicy, writePolicy } from '../src/game/nation/state'
import { yearlyNation } from '../src/game/nation/yearly'
import { createPerson } from '../src/game/people'
import { prisonLife, sendToPrison, yearlyPrison } from '../src/game/prison'
import { runScript } from '../src/game/scripts'
import { foundUnderground, fundUnderground, tradeUnderground } from '../src/game/underworld'
import { resolveBuild } from '../src/game/workshop/build'
import { acceptOffer, makeInCompany } from '../src/game/workshop/launch'
import { findInvention, mutWorkshop } from '../src/game/workshop/notebook'
import { settleInventions } from '../src/game/workshop/yearly'
import type { ChoiceModal, GameState, Job, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { client, withTeam } from './advisors-kit'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'
import { makeTestGame } from './helpers'
import { findSeed } from './seed-kit'
import { company, give, idea, inventor, nextYear } from './workshop-fixtures'

function job(salary: number): Job {
  return { defId: 'test', title: 'Engineer', company: 'Test Co', category: 'fulltime', salary, level: 0, performance: 60, yearsInRole: 3, yearsAtCompany: 3, data: {} }
}

function adult(money: number, age = 30): GameState {
  return makeTestGame(7, { age, money })
}

const rows = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length
const gov = (g: GameState): `gov:${string}` => `gov:${g.character.countryId}`

/** Nothing the scenario did went through the default reason, and the books balance. */
function clean(g: GameState): void {
  expect(rows(g, 'unreasoned')).toBe(0)
  expectConserved(g)
}

describe('R2-L7: tax, rent, living and loans book under reasons', () => {
  it('1. earnIncome then settleIncomeTax: tax.income takes from the person and pays the government', () => {
    const g = adult(0)
    const before = booksOf(g)
    earnIncome(g, 100_000, 'wage')
    const tax = settleIncomeTax(g)
    expect(tax).toBeGreaterThan(0)
    expect(g.character.money).toBe(100_000 - tax)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'tax.income', 'person')).toBe(-tax)
    expect(flowTotal(g, 'tax.income', 'gov')).toBe(tax)
    expect(acctOf(g, gov(g))).toBe(tax)
    clean(g)
  })

  it('1b. tax on income that arrived after the settlement is tax.income too', () => {
    const g = adult(0)
    earnIncome(g, 200_000, 'royalty')
    const before = booksOf(g)
    const tax = taxAdditionalIncome(g, 200_000)
    expect(tax).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'tax.income', 'gov')).toBe(tax)
    clean(g)
  })

  it('2. a year of finance for a renter: a rent row to the landlords and a living row to retail', () => {
    const g = adult(100_000)
    g.character.residence = { status: 'renting', rent: 12_000 }
    const before = booksOf(g)
    yearlyFinance(g)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'rent', 'person')).toBe(-12_000)
    expect(flowTotal(g, 'rent', 'pool')).toBe(12_000)
    expect(acctOf(g, 'pool:landlords')).toBe(12_000)
    const living = -flowTotal(g, 'living', 'person')
    expect(living).toBeGreaterThan(0)
    expect(acctOf(g, 'pool:retail')).toBe(living)
    clean(g)
  })

  it('3. a $20,000 loan: addLoan books the lending mint and the yearly payment is a loan.repay to the banks', () => {
    const g = adult(100_000)
    const loan = addLoan(g, { kind: 'personal', lender: 'First Bank', principal: 20_000, rate: 0.06, years: 5 })
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-20_000)
    const due = loan.yearlyPayment
    const before = booksOf(g)
    yearlyFinance(g)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'loan.repay', 'pool')).toBe(due)
    expect(flowTotal(g, 'loan.repay', 'person')).toBe(-due)
    expect(acctOf(g, 'pool:banks')).toBe(due)
    clean(g)
  })

  it('3b. paying a loan off books loan.repay, and refinancing books the closing fee as fee.bank', () => {
    const g = adult(500_000)
    const a = addLoan(g, { kind: 'personal', lender: 'First Bank', principal: 20_000, rate: 0.06, years: 5 })
    const b = addLoan(g, { kind: 'personal', lender: 'Second Bank', principal: 30_000, rate: 0.09, years: 6 })
    const before = booksOf(g)
    expect(payOffLoan(g, a.id)).toBe(true)
    expect(flowTotal(g, 'loan.repay', 'person')).toBe(-20_000)
    const q = refinanceQuote(g, b.id, false)
    expect(q.ok).toBe(true)
    expect(refinanceDebt(g, b.id, false)).toBe(true)
    expect(flowTotal(g, 'fee.bank', 'person')).toBe(-q.fee)
    expect(driftSince(g, before)).toBe(0)
    expect(acctOf(g, 'pool:banks')).toBe(20_000 + q.fee)
    clean(g)
  })

  function carWithLoan(): GameState {
    const g = adult(40_000)
    g.character.job = job(80_000)
    const listing = carListings(g, 'main')[0]!
    expect(buyCar(g, listing, CAR_PLANS.find((p) => p.id === 'f10_5') ?? { id: 'f10_5', down: 0.1, years: 5 })).toBe(true)
    expect(g.character.loans).toHaveLength(1)
    return g
  }

  it('4. a broke player whose car covers the loan: the seizure books the net proceeds as asset.sell and nothing is written off', () => {
    const g = carWithLoan()
    const car = g.assets[0]!
    const loan = g.character.loans[0]!
    loan.balance = 1_000
    loan.yearlyPayment = 50
    g.character.money = -50_000
    g.flags.brokeYears = 2
    const before = booksOf(g)
    yearlyFinance(g)
    expect(g.assets.find((x) => x.id === car.id)).toBeUndefined()
    expect(g.character.loans).toHaveLength(0)
    const net = Math.round(car.value * 0.7) - loan.balance
    expect(net).toBeGreaterThan(0)
    expect(flowTotal(g, 'asset.sell', 'person')).toBe(net)
    expect(flowTotal(g, 'asset.sell', 'pool')).toBe(-net)
    expect(driftSince(g, before)).toBe(0)
    expect(rows(g, 'writeoff')).toBe(0)
    clean(g)
  })

  it('4b. a car worth less than its loan: the shortfall comes out of the cash, so it is paid and not written off', () => {
    const g = carWithLoan()
    const car = g.assets[0]!
    const loan = g.character.loans[0]!
    loan.balance = Math.round(car.value * 3)
    loan.yearlyPayment = 100
    g.character.money = -50_000
    g.flags.brokeYears = 2
    const before = booksOf(g)
    yearlyFinance(g)
    expect(g.assets.find((x) => x.id === car.id)).toBeUndefined()
    const net = Math.round(car.value * 0.7) - loan.balance
    expect(net).toBeLessThan(0)
    expect(flowTotal(g, 'asset.sell', 'person')).toBe(net)
    expect(driftSince(g, before)).toBe(0)
    expect(rows(g, 'writeoff')).toBe(0)
    expect(flowTotal(g, 'writeoff', 'burn')).toBe(0)
    clean(g)
  })

  it('4d. a loan that still has a balance but no payment due is removed unpaid: a declared write-off burn from the banks', () => {
    const g = adult(100_000)
    const loan = addLoan(g, { kind: 'personal', lender: 'First Bank', principal: 5_000, rate: 0.05, years: 5 })
    loan.yearlyPayment = 0
    const before = booksOf(g)
    yearlyFinance(g)
    expect(g.character.loans).toHaveLength(0)
    expect(driftSince(g, before)).toBe(0)
    // The year's interest was added first, so what is written off is the balance the loan had when it went.
    expect(loan.balance).toBeGreaterThan(5_000)
    expect(flowTotal(g, 'writeoff', 'burn')).toBe(loan.balance)
    expect(acctOf(g, 'pool:banks')).toBe(-loan.balance)
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-5_000)
    clean(g)
  })

  it('4c. a repossession with a surplus pays the player the surplus as asset.sell', () => {
    const g = carWithLoan()
    const car = g.assets[0]!
    const loan = g.character.loans[0]!
    loan.balance = 1_000
    loan.yearlyPayment = 5_000
    g.character.money = 0
    const before = booksOf(g)
    yearlyFinance(g)
    g.year += 1
    yearlyFinance(g)
    expect(g.assets.find((x) => x.id === car.id)).toBeUndefined()
    expect(g.character.loans).toHaveLength(0)
    const surplus = flowTotal(g, 'asset.sell', 'person') + flowTotal(g, 'asset.sell', 'person', g.year - 1)
    expect(surplus).toBeGreaterThan(0)
    expect(surplus).toBeLessThanOrEqual(Math.round(car.value * 0.75))
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  describe('a parent bails the player out', () => {
    function broke(seed: number): { g: GameState; mom: ReturnType<typeof createPerson> } {
      const g = makeTestGame(seed, { age: 30, money: -8_000 })
      const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 58, lastName: 'Player', relationship: 95, money: 400_000 })
      return { g, mom }
    }
    const bailed = (g: GameState): boolean => g.queue.some((m) => m.kind === 'notice' && m.title === 'Bailed Out')

    it('5. the debt moves from the parent to the player as one gift row', () => {
      const seed = findSeed(
        (s) => {
          const { g } = broke(s)
          yearlyFinance(g)
          return bailed(g)
        },
        { label: 'a parent bails the player out' },
      )
      const { g, mom } = broke(seed)
      const before = booksOf(g)
      const momBefore = mom.money
      yearlyFinance(g)
      expect(bailed(g)).toBe(true)
      const gift = momBefore - mom.money
      expect(gift).toBeGreaterThan(0)
      expect(g.character.money).toBe(0)
      expect(driftSince(g, before)).toBe(0)
      expect(acctOf(g, `person:${mom.id}`)).toBe(-gift)
      expect(acctOf(g, `person:${g.character.id}`)).toBe(gift)
      expect(rows(g, 'gift')).toBe(1)
      clean(g)
    })
  })

  it('7. the student loan: the lending mint goes to the school pool, once at the start and once for every year that is added', () => {
    let g = adult(0, 18)
    for (let seed = 1; seed < 40; seed++) {
      g = makeTestGame(seed, { age: 18, money: 0 })
      g.character.stats.smarts = 95
      g.flags.lastGrades = 95
      g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High', age: 18 })
      g.character.education.completed.push('elementary', 'middle', 'high')
      applyToUniversity(g, 'Biology')
      if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'school.tuition')) break
    }
    const ask = [...g.queue].reverse().find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'school.tuition')!
    g.queue = g.queue.filter((m) => m.id !== ask.id)
    runScript(g, 'school.tuition', 'loans', ask.data, ask)
    const loan = g.character.loans[0]!
    expect(loan.kind).toBe('student')
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-loan.balance)
    expect(acctOf(g, 'pool:edu')).toBe(loan.balance)
    expect(g.character.money).toBe(0)
    expect(driftSince(g, { cash: 0, acct: 0 })).toBe(0)
    clean(g)
  })

  it('7b. paying tuition in cash books tuition to the school pool', () => {
    let g = adult(0, 18)
    for (let seed = 1; seed < 40; seed++) {
      g = makeTestGame(seed, { age: 18, money: 5_000_000 })
      g.character.stats.smarts = 95
      g.flags.lastGrades = 95
      g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High', age: 18 })
      g.character.education.completed.push('elementary', 'middle', 'high')
      applyToUniversity(g, 'Biology')
      if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'school.tuition')) break
    }
    const ask = [...g.queue].reverse().find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'school.tuition')!
    g.queue = g.queue.filter((m) => m.id !== ask.id)
    const before = booksOf(g)
    runScript(g, 'school.tuition', 'cash', ask.data, ask)
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'tuition', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:edu')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L7: work, body and law book under reasons', () => {
  it('8. a year of career: the salary is a wage from the employers', () => {
    const g = adult(0)
    g.character.job = job(80_000)
    const before = booksOf(g)
    yearlyCareer(g)
    expect(g.character.money).toBe(80_000)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'wage', 'person')).toBe(80_000)
    expect(acctOf(g, 'pool:employers')).toBe(-80_000)
    clean(g)
  })

  it('8b. a pension is paid by the government', () => {
    const g = adult(0, 70)
    g.character.retired = true
    g.character.pension = 24_000
    const before = booksOf(g)
    yearlyCareer(g)
    expect(g.character.money).toBe(24_000)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'pension', 'person')).toBe(24_000)
    expect(flowTotal(g, 'pension', 'gov')).toBe(-24_000)
    clean(g)
  })

  it('9. a doctor visit books health against the health pool', () => {
    const g = adult(100_000)
    const medical = doctorMenu.children(g).find((n): n is MenuGroup => n.type === 'menu' && n.id === 'doctor.medical')!
    const visit = medical.children(g).find((n: MenuNode): n is MenuAction => n.type === 'action' && n.id === 'doctor.medical.0')!
    const before = booksOf(g)
    visit.run(g)
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'health', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:health')).toBe(paid)
    clean(g)
  })

  it('10. a blackjack hand and a lottery ticket book gamble against the leisure pool', () => {
    const g = adult(10_000)
    const before = booksOf(g)
    settleBlackjack(g, 'win', { bet: 100, casino: 'The Test' })
    expect(g.character.money).toBe(10_100)
    expect(flowTotal(g, 'gamble', 'person')).toBe(100)
    settleBlackjack(g, 'lose', { bet: 300, casino: 'The Test' })
    expect(flowTotal(g, 'gamble', 'person')).toBe(-200)
    const game = LOTTERY_GAMES[0]!
    const cash = g.character.money
    expect(buyLottery(g, game.id, 1)).not.toBeNull()
    expect(flowTotal(g, 'gamble', 'person')).toBe(-200 + (g.character.money - cash))
    expect(acctOf(g, 'pool:leisure')).toBe(-(g.character.money - 10_000))
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('11. a crime family pays the member: crime.take against the crime pool', () => {
    const g = adult(0)
    g.flags.crimeFamily = { name: 'The Test Family', kind: 'Mafia', rank: 1, standing: 80, years: 0, oath: true, earnings: 0, card: 'ace', members: [], informant: null, joinedAge: 25 }
    const before = booksOf(g)
    yearlyCrime(g)
    expect(g.character.money).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'crime.take', 'person')).toBe(g.character.money)
    expect(acctOf(g, 'pool:crime')).toBe(-g.character.money)
    clean(g)
  })

  it('11b. a bribe to the arresting officer is a bribe row to the crime pool', () => {
    let seen = 0
    for (let seed = 1; seed <= 60 && seen === 0; seed++) {
      const g = makeTestGame(seed, { age: 30, money: 5_000_000 })
      arrestPlayer(g, 'Burglary', 3, { evidence: 0.9 })
      const arrest = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'crime.arrest')!
      g.queue = g.queue.filter((m) => m.id !== arrest.id)
      const before = booksOf(g)
      runScript(g, 'crime.arrest', 'bribe', arrest.data, arrest)
      const paid = before.cash - g.character.money
      if (paid <= 0) continue
      seen++
      expect(flowTotal(g, 'bribe', 'person')).toBe(-paid)
      expect(acctOf(g, 'pool:crime')).toBe(paid)
      expect(driftSince(g, before)).toBe(0)
      clean(g)
    }
    expect(seen).toBe(1)
  })

  it('12. a prison job pays a wage', () => {
    const g = adult(0)
    sendToPrison(g, 'Burglary', 3, { quiet: true })
    const pl = prisonLife(g)
    pl.job = 'kitchen'
    pl.jobWage = 1_800
    const before = booksOf(g)
    yearlyPrison(g)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'wage', 'person')).toBe(1_800)
    clean(g)
  })

  it('13. the underworld: what the player puts in is a crime.cost, a purchase of a lot too', () => {
    const g = adult(500_000)
    const before = booksOf(g)
    expect(foundUnderground(g, 'Night Owls')).toBe(true)
    expect(flowTotal(g, 'crime.cost', 'person')).toBe(-50_000)
    expect(fundUnderground(g, 25_000)).toBe(true)
    expect(flowTotal(g, 'crime.cost', 'person')).toBe(-75_000)
    expect(acctOf(g, 'pool:crime')).toBe(75_000)
    expect(tradeUnderground(g, 'street', true)).toBe(true)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})

describe('R2-L7: nation, workshop and advisors book under reasons', () => {
  it('14. a wealth tax is tax.property to the government', () => {
    const g = makeTestGame(15, { age: 40, money: 100_000_000, countryId: 'us' })
    const p = editPolicy(g, 'us')
    p.national.taxes.wealth = 2
    writePolicy(g, p)
    const before = booksOf(g)
    yearlyNation(g)
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'tax.property', 'person')).toBe(-paid)
    expect(flowTotal(g, 'tax.property', 'gov')).toBe(paid)
    clean(g)
  })

  it('15. a sold invention is a royalty from the markets, and a build is a purchase', () => {
    const g = inventor({ genius: true, year: 2000, money: 1_000_000 })
    give(g, 'cold-pack', 80)
    const before = booksOf(g)
    expect(acceptOffer(g, idea('cold-pack'), 'A buyer', 12_000)).toBe(true)
    expect(g.character.money).toBe(1_012_000)
    expect(flowTotal(g, 'royalty', 'person', 2000, 'us')).toBe(12_000)
    expect(driftSince(g, before)).toBe(0)
    give(g, 'robot-mower', 0)
    const cash = g.character.money
    expect(resolveBuild(g, idea('robot-mower'), 'safe')).not.toBeNull()
    const cost = cash - g.character.money
    expect(cost).toBeGreaterThan(0)
    expect(flowTotal(g, 'purchase', 'person', 2000, 'us')).toBe(-cost)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })

  it('15b. an invention made in the player\'s company pays the company, and the firm account holds the income', () => {
    const g = inventor({ genius: true, year: 2015, money: 2_000_000 })
    const c = company(g)
    give(g, 'pocket-tool', 85)
    const a = makeInCompany(g, idea('pocket-tool'), c.id)!
    nextYear(g)
    settleInventions(g, mutWorkshop(g))
    const earned = findInvention(g, a.id)!.inv.companyEarned
    expect(earned).toBeGreaterThan(0)
    expect(Math.abs(acctOf(g, `firm:${c.id}`) - earned)).toBeLessThanOrEqual(1)
    expect(flowTotal(g, 'royalty', 'firm', g.year, 'us')).toBe(acctOf(g, `firm:${c.id}`))
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('16. the advisor\'s retainer is a fee.bank to the banks', () => {
    const g = client(11, { money: 2_000_000 })
    withTeam(g, { advisor: { name: 'Ada Finch', skill: 70, since: g.year - 1 } })
    const before = booksOf(g)
    yearlyAdvisors(g)
    const paid = before.cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'fee.bank', 'person')).toBe(-paid)
    expect(acctBalance(g, 'pool:banks')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    clean(g)
  })
})
