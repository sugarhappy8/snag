import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { economyOf, economyState, ensureEconomy, yearlyEconomy, initialCountry, lendingConditions, recordEconomicActivity, enactEconomicPolicy, industryConditions, economyMarketFactor } from '../src/game/economy'
import { storeEconomy, SECTORS, type CountryEconomy } from '../src/game/economy/model'
import { advanceCountry, worldConditions } from '../src/game/economy/simulation'
import { addLoan, creditScore, refinanceDebt, refinanceQuote, yearlyFinance, offeredRate, gameIncomeTax } from '../src/game/finance'
import { moneyContextOf } from '../src/game/core'
import { economyMenu, bankingMenu } from '../src/game/economy/menu'
import { householdEffects, householdView, lifePrioritiesMenu, setLifePriority, yearlyHousehold } from '../src/game/household'
import type { GameState, MenuNode } from '../src/game/types'

function next(g: GameState) { g.year++; g.character.age++; g.yearActions = {}; yearlyEconomy(g) }
function changed(g: GameState, patch: Partial<CountryEconomy>) {
  ensureEconomy(g)
  const state = economyState(g)!, country = g.character.countryId
  storeEconomy(g, { ...state, countries: { ...state.countries, [country]: { ...state.countries[country], ...patch } } })
}
function step(old: CountryEconomy, world = worldConditions({ us: initialCountry('us', 2030) })) {
  return advanceCountry(old, 'us', old.year + 1, 'causal-test', world)
}
function menus(g: GameState, nodes: MenuNode[]) {
  for (const node of nodes) {
    if ('subtitle' in node && typeof node.subtitle === 'function') node.subtitle(g)
    if ('disabledReason' in node) node.disabledReason?.(g)
    if ('header' in node) node.header?.(g)
    if ('confirm' in node) node.confirm?.(g)
    if (node.type === 'menu') menus(g, node.children(g))
  }
}

describe('one shared, persistent economy', () => {
  it('initializes old saves without cash, RNG changes or retroactive payments; reads are pure', () => {
    const g = makeTestGame(57, { age: 30, money: 2000 }), original = JSON.stringify(g)
    menus(g, [economyMenu, bankingMenu, lifePrioritiesMenu])
    expect(JSON.stringify(g)).toBe(original)
    ensureEconomy(g)
    expect(g.character.money).toBe(2000); expect(g.rng).toBe(57)
    const initialized = JSON.stringify(g)
    yearlyEconomy(g); yearlyEconomy(g)
    expect(JSON.stringify(g)).toBe(initialized)
    next(g)
    expect(g.character.money).toBe(2000); expect(g.rng).toBe(57)
    expect(economyState(g)?.previous.us.year).toBe(2026)
  })

  it('higher interest tightens credit, reduces spending and housing, and raises defaults together', () => {
    const base = initialCountry('us', 2030), high = { ...base, rate: .18 }
    const normal = step(base), tight = step(high)
    expect(tight.credit).toBeLessThan(normal.credit)
    expect(tight.spending).toBeLessThan(normal.spending)
    expect(tight.housingReturn).toBeLessThan(normal.housingReturn)
    expect(tight.defaults).toBeGreaterThan(normal.defaults)
    expect(tight.unemployment).toBeGreaterThan(normal.unemployment)
    expect(tight.sectors.housing.demand).toBeLessThan(normal.sectors.housing.demand)
    const g = makeTestGame(1, { age: 30, money: 100000 })
    const before = offeredRate(g, 'mortgage')
    changed(g, { ...tight, year: g.year })
    expect(offeredRate(g, 'mortgage')).toBeGreaterThan(before)
    expect(lendingConditions(g).maxDti).toBeLessThan(.45)
  })

  it('recovers invalid or future-dated world state and bounds malformed imported aggregates', () => {
    const g = makeTestGame()
    g.flags.worldEconomy = { v: 1, year: 99999, countries: { us: { rate: 99 } } }
    expect(economyState(g)).toBeNull(); ensureEconomy(g)
    expect(economyState(g)?.year).toBe(g.year)
    g.flags.worldEconomy = { v: 1, year: g.year, countries: { us: { year: g.year, unemployment: 500, sectors: { industry: { costs: -50 } } } } }
    expect(economyOf(g).unemployment).toBe(.4)
    expect(industryConditions(g, 'manufacturing').costs).toBe(.4)
    next(g); expect(economyOf(g).rate).toBeLessThan(.29)
  })

  it('supply shortages propagate through input costs, prices and foreign trade', () => {
    const base = initialCountry('us', 2030), normal = step(base)
    const shortage = step({ ...base, supply: .45 })
    expect(shortage.sectors.industry.costs).toBeGreaterThan(normal.sectors.industry.costs)
    expect(shortage.inflation).toBeGreaterThan(normal.inflation)
    expect(shortage.trade).toBeLessThan(normal.trade)
    const overseas = step(base, { growth: -.08, demand: .6, supply: .4, rate: .12 })
    expect(overseas.trade).toBeLessThan(normal.trade)
    expect(overseas.growth).toBeLessThan(normal.growth)
  })

  it('deployed innovation increases productivity, lowers costs and disrupts jobs with one-year lag', () => {
    const g = makeTestGame(), control = makeTestGame()
    g.year = control.year = 2030; ensureEconomy(g); ensureEconomy(control)
    const initial = industryConditions(g, 'manufacturing')
    recordEconomicActivity(g, 'production:a:2030', 'us', 'manufacturing', { innovation: .3, jobs: 10000, investment: 1e9 })
    const once = JSON.stringify(economyState(g)?.pending)
    recordEconomicActivity(g, 'production:a:2030', 'us', 'manufacturing', { innovation: .3, jobs: 10000 })
    expect(JSON.stringify(economyState(g)?.pending)).toBe(once)
    expect(industryConditions(g, 'manufacturing')).toEqual(initial)
    next(g); next(control)
    const tech = industryConditions(g, 'manufacturing'), ordinary = industryConditions(control, 'manufacturing')
    expect(tech.productivity).toBeGreaterThan(ordinary.productivity)
    expect(tech.costs).toBeLessThan(ordinary.costs)
    expect(tech.disruption).toBeGreaterThan(ordinary.disruption)
    expect(economyState(g)?.pending).toEqual([])
  })

  it('public education trades government borrowing for better skills and services; tax laws affect actual bills', () => {
    const g = makeTestGame(), control = makeTestGame()
    g.year = control.year = 2030; ensureEconomy(g); ensureEconomy(control)
    enactEconomicPolicy(g, 'Schools', 'education', 3)
    enactEconomicPolicy(g, 'Schools', 'education', 3)
    expect(economyState(g)?.policies).toHaveLength(1)
    for (let y = 0; y < 5; y++) { next(g); next(control) }
    expect(economyOf(g).skills).toBeGreaterThan(economyOf(control).skills)
    expect(economyOf(g).services).toBeGreaterThan(economyOf(control).services)
    expect(economyOf(g).governmentDebt).toBeGreaterThan(economyOf(control).governmentDebt)
    const tax = gameIncomeTax(g, 100000)
    enactEconomicPolicy(g, 'Tax cut', 'taxCut', 3); next(g)
    expect(gameIncomeTax(g, 100000)).toBeLessThan(tax)
    for (let y = 0; y < 5; y++) next(g)
    expect(economyOf(g).taxShift).toBe(0)
  })

  it('a credit/housing bubble bust can recover without permanent collapse', () => {
    let e = initialCountry('us', 2030)
    e = { ...e, rate: .18, credit: .7, bubble: .55, housing: 2, defaults: .1, unemployment: .15 }
    const crash = step(e)
    expect(crash.housingReturn).toBeLessThan(0)
    for (let y = 0; y < 35; y++) e = step(e)
    expect(e.credit).toBeGreaterThan(.75)
    expect(e.unemployment).toBeLessThan(.12)
    expect(e.growth).toBeGreaterThan(-.01)
  })

  it('remains deterministic, finite and bounded for 120 years across all countries, including a reload', () => {
    const g = makeTestGame(), copy = makeTestGame()
    ensureEconomy(g); ensureEconomy(copy)
    for (let y = 0; y < 120; y++) {
      next(g); next(copy)
      if (y === 60) copy.flags = JSON.parse(JSON.stringify(copy.flags))
      for (const e of Object.values(economyState(g)!.countries)) {
        expect(e.unemployment).toBeLessThan(.36); expect(e.rate).toBeLessThan(.29)
        expect(e.inflation).toBeGreaterThan(-.04); expect(e.inflation).toBeLessThan(.19)
        for (const s of SECTORS) expect(Number.isFinite(e.sectors[s].costs)).toBe(true)
      }
    }
    expect(economyState(g)).toEqual(economyState(copy))
    expect(economyState(g)?.history.us).toHaveLength(32)
    expect(JSON.stringify(g).length).toBeLessThan(3000000)
    expect(economyOf(g).unemployment).toBeLessThan(.15)
    expect(economyMarketFactor(g, 'us', g.year)).toBe(economyOf(g).market)
    expect(economyMarketFactor(g, 'us', g.year - 1)).toBe(economyState(g)?.previous.us.market)
    expect(economyMarketFactor(g, 'us', g.year + 1)).toBe(economyOf(g).market)
    // 240 whole-world transitions: sized for a 2-core CI runner.
  }, 300_000)

  it('cash, debt and nominal local prices use the same future inflation; historical Korea stays historical', () => {
    const g = makeTestGame(1, { countryId: 'kr', birthCountryId: 'kr', money: 2000 })
    g.year = 1963; ensureEconomy(g)
    const baseline = initialCountry('kr', 1963)
    expect(economyOf(g).inflation).toBe(baseline.inflation)
    next(g); expect(g.character.money).toBe(2000)
    const future = makeTestGame()
    future.year = 2030; changed(future, { inflation: .08, priceScale: 1.4 })
    future.character.age = 20
    future.character.education.current = { level: 'university', school: 'U', year: 1, totalYears: 4, grades: 70, data: {} }
    const loan = addLoan(future, { kind: 'student', lender: 'A', principal: 10000, years: 10, rate: 0 })
    yearlyFinance(future)
    expect(loan.balance).toBe(Math.round(10000 / 1.08))
    expect(moneyContextOf(future).nominalScale).toBe(1.4)
  })
})

describe('financial and household choices', () => {
  it('emigrating does not change the inflation applied to an existing foreign loan or mortgage', () => {
    const g = makeTestGame(1, { age: 20, money: 100000 })
    g.year = 2030; changed(g, { inflation: .02 })
    g.character.education.current = { level: 'university', school: 'U', year: 1, totalYears: 4, grades: 70, data: {} }
    const loan = addLoan(g, { kind: 'student', lender: 'US bank', principal: 10000, years: 10, rate: 0 })
    g.assets.push({ id: 'house', kind: 'house', name: 'Home', emoji: '🏠', value: 300000, purchasePrice: 300000, condition: 100, purchasedAge: 20, upkeep: 0, details: { countryId: 'us' }, mortgage: { lender: 'US bank', balance: 200000, yearlyPayment: 10000, rate: 0, yearsLeft: 20 } })
    g.character.countryId = 'kr'; changed(g, { inflation: .18 })
    yearlyFinance(g)
    expect(loan.balance).toBe(Math.round(10000 / 1.02))
    expect(g.assets[0].mortgage!.balance).toBe(Math.round(200000 / 1.02))
  })

  it('refinancing preserves principal, charges fees once and reprices only variable debt', () => {
    const g = makeTestGame(1, { age: 30, money: 1000000 })
    const fixed = addLoan(g, { kind: 'personal', lender: 'A', principal: 10000, years: 5, rate: .1 })
    const variable = addLoan(g, { kind: 'personal', lender: 'B', principal: 10000, years: 5, rate: .1 })
    const q = refinanceQuote(g, variable.id, false, true, 5), cash = g.character.money
    expect(q.ok).toBe(true); expect(q.stressPayment).toBeGreaterThan(q.payment)
    expect(refinanceDebt(g, variable.id, false, true, 5)).toBe(true)
    expect(variable.balance).toBe(10000); expect(g.character.money).toBe(cash - q.fee)
    expect(refinanceDebt(g, variable.id, false, true, 5)).toBe(false)
    const rate = variable.rate
    changed(g, { rate: .18 }); yearlyFinance(g)
    expect(variable.rate).toBeGreaterThan(rate); expect(fixed.rate).toBe(.1)
    const score = creditScore(g); g.flags.creditDefaults = 1
    expect(creditScore(g)).toBeLessThan(score)
  })

  it('learning spends once per year, improves transferable skills and cannot be farmed by toggling', () => {
    const g = makeTestGame(1, { age: 25, money: 10000 })
    expect(setLifePriority(g, 'learning')).toBe(true)
    const cash = g.character.money; yearlyHousehold(g)
    expect(g.character.money).toBeLessThan(cash)
    expect(householdView(g).training).toBeGreaterThan(0)
    const settled = { money: g.character.money, stats: { ...g.character.stats }, effects: householdEffects(g) }
    setLifePriority(g, 'ambition'); yearlyHousehold(g)
    expect(g.character.money).toBe(settled.money); expect(g.character.stats).toEqual(settled.stats)
    expect(householdEffects(g)).toEqual(settled.effects)
    g.generation++; expect(householdView(g).training).toBe(0)
  })

  it('overwork has persistent fatigue and recovery has a performance trade-off', () => {
    const g = makeTestGame(1, { age: 25 })
    g.character.job = { defId: 'accountant', title: 'Accountant', company: 'A', category: 'fulltime', salary: 50000, performance: 60, yearsInRole: 0, yearsAtCompany: 0, level: 0, data: { weeklyHours: 70 } }
    setLifePriority(g, 'ambition')
    for (let y = 0; y < 8; y++) { g.year++; yearlyHousehold(g) }
    expect(householdView(g).fatigue).toBeGreaterThan(65)
    const fatigue = householdView(g).fatigue
    g.character.job.data.weeklyHours = 40; setLifePriority(g, 'recovery')
    for (let y = 0; y < 3; y++) { g.year++; yearlyHousehold(g) }
    expect(householdView(g).fatigue).toBeLessThan(fatigue)
    expect(householdEffects(g).work).toBeLessThan(0)
  })
})
