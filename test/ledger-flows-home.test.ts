// R2-L6 (A.K1 e): migration 1, the home, family, love and NPC-life files. Every scenario plays one real flow of the batch through
// its public function and then asserts the three things the batch owes: the player's cash and the player's account never part
// (driftSince), the reason rows and the class of the counterparty are the ones the plan names (flowTotal), and the books balance
// (expectConserved). Not in the fast tier.
import { describe, expect, it } from 'vitest'
import {
  buyCar,
  buyHouse,
  carListings,
  CAR_PLANS,
  findAsset,
  giftAsset,
  houseListings,
  makeOffers,
  MORTGAGE_PLANS,
  mortgageDecision,
  rentalListings,
  rentApartment,
  sellAsset,
  yearlyAssets,
} from '../src/game/assets'
import { initializeBirthParent } from '../src/game/birth-background'
import { cancelDevelopment, financeDevelopment, startDevelopment } from '../src/game/development'
import { annualLearningCost, setLifePriority, yearlyHousehold } from '../src/game/household'
import { offerCitizenship } from '../src/game/immigration'
import { divorce } from '../src/game/love'
import { initializeNpc, investInNpc, npcBusinessYear, npcCompany, startNpcCompany, yearlyNpcLife } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import { personActions, yearlyRelationships } from '../src/game/relationships'
import { royalRule, royalStatus, yearlyRoyalty, type RoyalStatus } from '../src/game/royalty'
import { runScript } from '../src/game/scripts'
import { acctBalance, flowsOf, playerAcct } from '../src/game/kernel/ledger'
import { SPREADS } from '../src/game/kernel/spreads'
import type { AcctRef } from '../src/game/kernel/ledger'
import type { ChoiceModal, GameState, Job, Json, MenuAction, Person } from '../src/game/types'
import { acctOf, booksOf, driftSince, expectConserved, flowTotal } from './ledger-kit'
import { makeTestGame } from './helpers'

function job(salary: number): Job {
  return { defId: 'test', title: 'Engineer', company: 'Test Co', category: 'fulltime', salary, level: 0, performance: 60, yearsInRole: 3, yearsAtCompany: 3, data: {} }
}

function adult(money: number, salary = 90_000, age = 30): GameState {
  const g = makeTestGame(7, { age, money })
  g.character.job = job(salary)
  return g
}

function action(g: GameState, p: Person, id: string): MenuAction {
  const a = personActions(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === id)
  if (!a) throw new Error(`no action ${id} for ${p.relation}`)
  return a
}

const personAcct = (p: Person): AcctRef => `person:${p.id}`
const rows = (g: GameState, reason: string): number => flowsOf(g).filter((r) => r.reason === reason).length

describe('R2-L6: the home books under reasons', () => {
  it('1. a mortgage purchase: the down payment is property.buy, the loan is the lending mint, the seller gets the price', () => {
    const g = adult(200_000, 150_000)
    const listing = houseListings(g, 'residential')[0]
    const plan = MORTGAGE_PLANS.find((p) => p.id === 'm20_30')!
    const d = mortgageDecision(g, listing.price, plan)
    expect(d.ok).toBe(true)
    const before = booksOf(g)
    expect(buyHouse(g, listing, plan)).toBe(true)
    expect(driftSince(g, before)).toBe(0)
    expect(g.character.money).toBe(200_000 - d.down)
    expect(flowTotal(g, 'property.buy', 'person')).toBe(-d.down)
    expect(flowTotal(g, 'property.buy', 'pool')).toBe(d.down)
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-d.principal)
    expect(flowTotal(g, 'loan.principal', 'pool')).toBe(d.principal)
    expect(acctOf(g, 'pool:sellers')).toBe(listing.price)
    expect(flowTotal(g, 'unreasoned', 'person')).toBe(0)
    expectConserved(g)
  })

  it('1b. a cash purchase books the whole price as property.buy', () => {
    const g = adult(5_000_000)
    const listing = houseListings(g, 'residential')[0]
    const before = booksOf(g)
    expect(buyHouse(g, listing, null)).toBe(true)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'property.buy', 'person')).toBe(-listing.price)
    expect(acctOf(g, 'pool:sellers')).toBe(listing.price)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('2. a year of yearlyAssets with that mortgage: loan.repay moves money from the person to the banks', () => {
    const g = adult(200_000, 150_000)
    const listing = houseListings(g, 'residential')[0]
    expect(buyHouse(g, listing, MORTGAGE_PLANS.find((p) => p.id === 'm20_30')!)).toBe(true)
    g.year += 1
    const before = booksOf(g)
    yearlyAssets(g)
    expect(driftSince(g, before)).toBe(0)
    const repaid = flowTotal(g, 'loan.repay', 'pool')
    expect(repaid).toBeGreaterThan(0)
    expect(flowTotal(g, 'loan.repay', 'person')).toBe(-repaid)
    expect(acctOf(g, 'pool:banks')).toBe(repaid)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('3. sellAsset of the house: property.sell pays the player the net of what was owed', () => {
    const g = adult(300_000, 150_000)
    const listing = houseListings(g, 'residential')[0]
    expect(buyHouse(g, listing, MORTGAGE_PLANS[1])).toBe(true)
    const house = g.assets[0]!
    const owed = house.mortgage!.balance
    const before = booksOf(g)
    expect(sellAsset(g, house.id, house.value, 'a buyer')).toBe(true)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'property.sell', 'person')).toBe(house.value - owed)
    expect(flowTotal(g, 'property.sell', 'pool')).toBe(-(house.value - owed))
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('3b. selling a car books asset.sell, and renting books rent', () => {
    const g = adult(100_000, 80_000)
    const car = carListings(g, 'main')[0]!
    expect(buyCar(g, car, null)).toBe(true)
    const before = booksOf(g)
    const a = g.assets[0]!
    expect(sellAsset(g, a.id, a.value, 'a buyer')).toBe(true)
    expect(flowTotal(g, 'asset.sell', 'person')).toBe(a.value)
    const rent = rentalListings(g)[0]!
    const cash = g.character.money
    expect(rentApartment(g, rent)).toBe(true)
    const paid = cash - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(flowTotal(g, 'rent', 'person')).toBe(-paid)
    expect(flowTotal(g, 'rent', 'pool')).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('4. the housing spread: a house bought this year never sells for more than 97 percent of its price', () => {
    const g = adult(5_000_000)
    const listing = houseListings(g, 'residential')[0]
    expect(buyHouse(g, listing, null)).toBe(true)
    const house = g.assets[0]!
    const cap = Math.round(house.purchasePrice * (1 - SPREADS.sellers))
    let best = 0
    for (let i = 0; i < 300; i++) for (const o of makeOffers(g, house)) best = Math.max(best, o.amount)
    expect(best).toBeLessThanOrEqual(cap)
    expect(best).toBeGreaterThan(0)
  })

  it('4b. an older house keeps its offers: at least one of 300 is above 97 percent of the value', () => {
    const g = adult(5_000_000)
    const listing = houseListings(g, 'residential')[0]
    expect(buyHouse(g, listing, null)).toBe(true)
    const house = g.assets[0]!
    house.purchasedAge = g.character.age - 3
    let best = 0
    for (let i = 0; i < 300; i++) for (const o of makeOffers(g, house)) best = Math.max(best, o.amount)
    expect(best).toBeGreaterThan(Math.round(house.value * (1 - SPREADS.sellers)))
  })

  it('4c. a same-year flip loses money: buying then selling the best offer ends below the start', () => {
    const g = adult(5_000_000)
    const listing = houseListings(g, 'residential')[0]
    const start = g.character.money
    expect(buyHouse(g, listing, null)).toBe(true)
    const house = g.assets[0]!
    const best = Math.max(...Array.from({ length: 300 }, () => Math.max(...makeOffers(g, house).map((o) => o.amount))))
    expect(sellAsset(g, house.id, best, 'a flipper')).toBe(true)
    expect(g.character.money).toBeLessThan(start)
    expect(start - g.character.money).toBeGreaterThanOrEqual(Math.round(listing.price * SPREADS.sellers) - 1)
  })

  it('7. a car bought with a loan: the dealer pool gets the down payment plus the lending mint, the whole price', () => {
    const g = adult(30_000, 80_000)
    const l = carListings(g, 'main')[0]!
    const before = booksOf(g)
    expect(buyCar(g, l, CAR_PLANS.find((p) => p.id === 'f10_5') ?? { id: 'f10_5', down: 0.1, years: 5 })).toBe(true)
    expect(driftSince(g, before)).toBe(0)
    const loan = g.character.loans[0]!
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-loan.balance)
    expect(flowTotal(g, 'asset.buy', 'person')).toBe(-(l.price - loan.balance))
    // down payment plus the mint is exactly the price, and it all lands in one pool
    expect(acctOf(g, 'pool:retail')).toBe(l.price)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })
})

describe('R2-L6: the family books under reasons', () => {
  function family(g: GameState): { mom: Person; dad: Person } {
    const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 55, lastName: 'Player', relationship: 95, livesWithPlayer: true, money: 400_000 })
    const dad = createPerson(g, { relation: 'parent', gender: 'male', age: 57, lastName: 'Player', relationship: 95, livesWithPlayer: true, money: 400_000 })
    return { mom, dad }
  }

  it('5. giving money to a person is one gift row: the person gains what the player lost', () => {
    const g = makeTestGame(21, { age: 30, money: 1_000_000 })
    const { mom } = family(g)
    const before = booksOf(g)
    const momBefore = mom.money
    action(g, mom, 'giveMoney').run(g, '5000')
    expect(g.character.money).toBe(995_000)
    expect(mom.money).toBe(momBefore + 5000)
    expect(driftSince(g, before)).toBe(0)
    expect(acctOf(g, personAcct(mom))).toBe(5000)
    expect(acctOf(g, playerAcct(g))).toBe(-5000)
    expect(rows(g, 'gift')).toBe(1)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('5b. a person giving money to the player books the opposite', () => {
    const g = makeTestGame(21, { age: 16, money: 0 })
    const { dad } = family(g)
    const before = booksOf(g)
    const dadBefore = dad.money
    let given = false
    for (let i = 0; i < 80 && !given; i++) {
      g.yearActions = {}
      const cash = g.character.money
      action(g, dad, 'askMoney').run(g)
      given = g.character.money > cash
    }
    expect(given).toBe(true)
    const got = g.character.money
    expect(dadBefore - dad.money).toBe(got)
    expect(driftSince(g, before)).toBe(0)
    expect(acctOf(g, personAcct(dad))).toBe(-got)
    expect(acctOf(g, playerAcct(g))).toBe(got)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('5c. giving an asset away credits the person from the family pool and the player pays nothing', () => {
    const g = adult(5_000_000)
    const { mom } = family(g)
    const listing = houseListings(g, 'residential')[0]
    expect(buyHouse(g, listing, null)).toBe(true)
    const house = g.assets[0]!
    const before = booksOf(g)
    const momBefore = mom.money
    expect(giftAsset(g, house.id, mom.id)).toBe(true)
    expect(findAsset(g, house.id)).toBeUndefined()
    expect(mom.money).toBe(Math.round(momBefore + house.value))
    expect(driftSince(g, before)).toBe(0)
    expect(Math.abs(acctOf(g, personAcct(mom)) - (mom.money - momBefore))).toBeLessThanOrEqual(1)
    expect(flowTotal(g, 'gift', 'pool')).toBeLessThan(0)
    expectConserved(g)
  })
})

describe('R2-L6: NPC lives book their own money', () => {
  function friend(): { g: GameState; p: Person } {
    const g = makeTestGame(52, { age: 35, money: 20_000_000 })
    const p = createPerson(g, { relation: 'friend', firstName: 'Adam', age: 30, money: 3_000_000, occupation: 'Engineer', relationship: 90, stats: { smarts: 88 }, traits: ['ambitious', 'loyal'] })
    initializeNpc(g, p)
    return { g, p }
  }

  it('6. a founded company: the capital goes to the firms, the fee to the government, and the books balance', () => {
    const { g, p } = friend()
    const start = p.money
    expect(startNpcCompany(g, p, 'cafe')).toBe(true)
    const spent = start - p.money
    expect(spent).toBeGreaterThan(0)
    // every change of the founder's money has a row: the person's account moved by what the record moved, to the dollar
    expect(Math.abs(acctOf(g, personAcct(p)) + spent)).toBeLessThanOrEqual(1)
    const capital = flowTotal(g, 'inject', 'pool', g.year, g.character.countryId)
    expect(capital).toBeGreaterThan(0)
    expect(flowTotal(g, 'inject', 'person', g.year, g.character.countryId)).toBe(-capital)
    const fees = -flowTotal(g, 'fee.gov', 'person', g.year, g.character.countryId)
    expect(fees).toBeGreaterThan(0)
    expect(acctBalance(g, 'pool:firms')).toBe(capital)
    // what the founder paid went to the pool of firms and the government and nowhere else
    expect(Math.abs(spent - capital - fees)).toBeLessThanOrEqual(1)
    expect(flowTotal(g, 'unreasoned', 'person')).toBe(0)
    expectConserved(g)
  })

  it('6b. a company year: every change of the founder\'s money has a row and the books balance', () => {
    const { g, p } = friend()
    expect(startNpcCompany(g, p, 'cafe')).toBe(true)
    const company = npcCompany(p, g.year)!
    company.b.cash = 20_000_000
    company.b.brand = 95
    company.b.quality = 95
    g.year += 1
    const l = initializeNpc(g, p)
    const money = p.money
    const acct = acctOf(g, personAcct(p))
    npcBusinessYear(g, p, l)
    const moved = p.money - money
    expect(moved).not.toBe(0)
    expect(Math.abs(acctOf(g, personAcct(p)) - acct - moved)).toBeLessThanOrEqual(2)
    expect(flowTotal(g, 'unreasoned', 'person')).toBe(0)
    expect(flowTotal(g, 'unreasoned', 'firm')).toBe(0)
    expectConserved(g)
  })

  it('6c. a year of an NPC life books wages and spending against the person account, not as unreasoned', () => {
    const { g, p } = friend()
    p.occupation = 'Engineer'
    g.year += 1
    const money = p.money
    const acct = acctOf(g, personAcct(p))
    yearlyNpcLife(g, p)
    expect(Math.abs(acctOf(g, personAcct(p)) - acct - (p.money - money))).toBeLessThanOrEqual(3)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })
})

describe('R2-L6: the rest of the batch books under reasons', () => {
  function spouseGame(me: number, spouse: number): { g: GameState; sp: Person } {
    const g = makeTestGame(21, { age: 40, money: me })
    const sp = createPerson(g, { relation: 'spouse', gender: 'female', age: 38, relationship: 60, money: spouse, livesWithPlayer: true })
    return { g, sp }
  }

  it('8. a divorce settlement the player pays is one divorce move from the player to the ex', () => {
    const { g, sp } = spouseGame(2_000_000, 0)
    const before = booksOf(g)
    divorce(g, sp, 'player')
    const paid = 2_000_000 - g.character.money
    expect(paid).toBeGreaterThan(0)
    expect(sp.money).toBe(paid)
    expect(driftSince(g, before)).toBe(0)
    expect(acctOf(g, personAcct(sp))).toBe(paid)
    expect(acctOf(g, playerAcct(g))).toBe(-paid)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('8b. a settlement the ex pays comes out of the ex, to the dollar, and is booked the other way', () => {
    const { g, sp } = spouseGame(0, 5_000_000)
    const before = booksOf(g)
    divorce(g, sp, 'them')
    const got = g.character.money
    expect(got).toBeGreaterThan(0)
    expect(sp.money).toBe(5_000_000 - got)
    expect(driftSince(g, before)).toBe(0)
    expect(acctOf(g, personAcct(sp))).toBe(-got)
    expect(rows(g, 'unreasoned')).toBe(0)
    expectConserved(g)
  })

  it('9. a parent who dies: the player inherits, the other parent gets the rest, and the dead keep nothing', () => {
    const g = makeTestGame(9, { age: 40, money: 10_000 })
    const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 104, relationship: 100, money: 800_000 })
    const dad = createPerson(g, { relation: 'parent', gender: 'male', age: 45, relationship: 100, money: 100_000 })
    const before = booksOf(g)
    for (let i = 0; i < 25 && mom.alive; i++) yearlyRelationships(g)
    expect(mom.alive).toBe(false)
    const got = g.character.money - 10_000
    expect(got).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    expect(mom.money).toBe(0)
    expect(dad.money).toBeGreaterThan(100_000)
    // each person's account moved by what the record moved, to the dollar
    expect(Math.abs(acctOf(g, personAcct(mom)) + 800_000)).toBeLessThanOrEqual(1)
    expect(Math.abs(acctOf(g, personAcct(dad)) - (dad.money - 100_000))).toBeLessThanOrEqual(1)
    expect(acctOf(g, playerAcct(g))).toBeGreaterThanOrEqual(got - 1)
    expect(flowTotal(g, 'unreasoned', 'person')).toBe(0)
    expectConserved(g)
  })

  it('10. a stake in a family firm: the player pays the firm, or the founder, and the books name both', () => {
    const g = makeTestGame(52, { age: 35, money: 20_000_000 })
    const p = createPerson(g, { relation: 'friend', firstName: 'Adam', age: 30, money: 3_000_000, occupation: 'Engineer', relationship: 90, stats: { smarts: 88 }, traits: ['ambitious', 'loyal'] })
    initializeNpc(g, p)
    expect(startNpcCompany(g, p, 'cafe')).toBe(true)
    const company = npcCompany(p, g.year)!
    const before = booksOf(g)
    const amount = Math.round(company.b.valuation * 0.1)
    expect(investInNpc(g, p.id, amount)).toBe(true)
    expect(driftSince(g, before)).toBe(0)
    expect(acctOf(g, `firm:${company.a.id}`)).toBe(amount)
    expect(flowTotal(g, 'inject', 'firm')).toBe(amount)
    g.year += 1
    g.yearActions = {}
    const founder = p.money
    const acct = acctOf(g, personAcct(p))
    const mark = booksOf(g)
    expect(investInNpc(g, p.id, 1, true)).toBe(true)
    expect(driftSince(g, mark)).toBe(0)
    expect(p.money).toBeGreaterThan(founder)
    expect(Math.abs(acctOf(g, personAcct(p)) - acct - (p.money - founder))).toBeLessThanOrEqual(1)
    expect(flowTotal(g, 'firm.sale', 'pool')).toBe(0)
    expectConserved(g)
  })

  it('11. a rented-out house pays rent: the households pool pays the landlord', () => {
    const g = adult(5_000_000)
    const listing = houseListings(g, 'residential')[0]
    expect(buyHouse(g, listing, null)).toBe(true)
    const house = g.assets[0]!
    g.character.residence = { status: 'parents' }
    house.rentedOutFor = 24_000
    house.details.tenant = 'Pat Doe'
    house.details.tenantRisk = 0
    house.details.tenantLate = 0
    g.flags.taxableIncome = 0
    g.year += 1
    const before = booksOf(g)
    yearlyAssets(g)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'rent', 'person')).toBe(24_000)
    expect(acctOf(g, `pool:hh:${g.character.countryId}`)).toBe(-24_000)
    expectConserved(g)
  })

  it('12. a development: the loan is the lending mint, and cancelling sells the site back as property.sell', () => {
    const g = makeTestGame(8, { age: 35, money: 10_000_000 })
    const before = booksOf(g)
    const a = startDevelopment(g, 'residential')!
    expect(financeDevelopment(g, a.id)).toBe(true)
    const principal = a.mortgage!.balance
    expect(flowTotal(g, 'loan.principal', 'mint')).toBe(-principal)
    const cash = g.character.money
    expect(cancelDevelopment(g, a.id)).toBe(true)
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(flowTotal(g, 'property.sell', 'person')).toBe(g.character.money - cash)
    expect(driftSince(g, before)).toBe(0)
    expectConserved(g)
  })

  it('13. royal duties pay a benefit from the government, and the household learning budget is tuition', () => {
    const g = makeTestGame(1, { age: 18, countryId: 'gb', money: 0 })
    g.year = 2001
    const royal: RoyalStatus = { country: 'gb', house: royalRule('gb', 2000)?.house ?? 'Windsor', territory: '', title: 'Prince', born: 1980, rank: 'child', line: 1, maleLine: true, status: 'active', reputation: 80, duties: 3, lastYear: 2000, predecessorAge: 60, parentId: 'father', allowance: 0 }
    g.flags.royalty = royal as unknown as Json
    const before = booksOf(g)
    yearlyRoyalty(g)
    const allowance = royalStatus(g)!.allowance
    expect(allowance).toBeGreaterThan(0)
    expect(g.character.money).toBe(allowance)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'benefit', 'person', g.year, 'gb')).toBe(allowance)
    expect(flowTotal(g, 'benefit', 'gov', g.year, 'gb')).toBe(-allowance)
    // the learning priority books its yearly cost as tuition
    g.character.money += 0
    const h = makeTestGame(3, { age: 30, money: 1_000_000 })
    expect(setLifePriority(h, 'learning')).toBe(true)
    const start = booksOf(h)
    yearlyHousehold(h)
    expect(flowTotal(h, 'tuition', 'person')).toBe(-annualLearningCost(h))
    expect(driftSince(h, start)).toBe(0)
  })

  it('14. a citizenship application fee is a government fee, and a birth parent starts with an endowment from the family', () => {
    const g = makeTestGame(3, { age: 40, countryId: 'us', birthCountryId: 'fr', money: 100_000 })
    g.character.citizenships = ['fr']
    g.character.immigration = { countryId: 'us', status: 'permanent', since: 2005 }
    offerCitizenship(g)
    const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'imm.citizenship')!
    const before = booksOf(g)
    runScript(g, 'imm.citizenship', 'wing', modal.data, modal)
    const fee = 100_000 - g.character.money
    expect(fee).toBeGreaterThan(0)
    expect(driftSince(g, before)).toBe(0)
    expect(flowTotal(g, 'fee.gov', 'person')).toBe(-fee)
    expect(flowTotal(g, 'fee.gov', 'gov')).toBe(fee)
    const k = makeTestGame(5, { age: 0 })
    k.flags.birthBackground = 4
    const parent = createPerson(k, { relation: 'parent', age: 30, money: 0 })
    initializeBirthParent(k, parent)
    expect(parent.money).toBeGreaterThan(0)
    expect(Math.abs(acctOf(k, personAcct(parent)) - parent.money)).toBeLessThanOrEqual(1)
    expect(flowTotal(k, 'gift', 'pool')).toBeLessThan(0)
    expectConserved(k)
  })
})
