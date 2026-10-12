import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { initializeNpc, npcBusinessYear, npcCompany, npcLife, npcLifeNodes, startNpcCompany, yearlyNpcLife } from '../src/game/npc-lives'
import { saveNpcLife } from '../src/game/npc-state'
import { birthBackgroundFor, initializeBirthParent } from '../src/game/birth-background'
import { initialCountry, storeEconomy, type CountryEconomy } from '../src/game/economy/model'
import { educationAccess, householdPressure } from '../src/game/economy/cohorts'
import { beginLandlordLease, landlordMenu, landlordView, rentalMarket, yearlyLandlord } from '../src/game/landlord'
import { continueAsChild } from '../src/game/life'
import type { Asset, GameState, Json, Person } from '../src/game/types'

function fixture(): GameState {
  const g = makeTestGame(714, { age: 35, money: 100_000 })
  g.year = 2030; g.lifeId = 'world2-population'; g.log = [{ age: 35, year: 2030, entries: [] }]
  environment(g)
  return g
}

function environment(g: GameState, change: (e: CountryEconomy) => void = () => {}, year = g.year): void {
  const e = initialCountry('us', year)
  e.unemployment = .06
  change(e)
  storeEconomy(g, { v: 2, year, countries: { us: e }, previous: {}, history: {}, pending: [], policies: [], receipts: [], rivals: [], previousRivals: [] })
}

function publicEducation(e: CountryEconomy, strong: boolean): void {
  e.services = strong ? 1.5 : .45; e.mobility = strong ? .9 : .1
  e.cohorts.working.skill = strong ? .9 : .1
  e.cohorts.middle.skill = strong ? .9 : .2
}

function household(e: CountryEconomy, spending: number): void {
  e.cohorts.working.spending = spending; e.cohorts.middle.spending = spending
}

function contact(g: GameState, options: Partial<Person> = {}): Person {
  const p = createPerson(g, { relation: 'friend', age: 30, money: 0, occupation: 'Unemployed', stats: { smarts: 50 }, ...options })
  const l = initializeNpc(g, p)
  l.skill = 20; l.ambition = 40; l.investments = 0; l.housing = 0; l.debt = 0; l.education = 0
  saveNpcLife(p, l)
  return p
}

function rentals(g: GameState, occupied: boolean, count = 100): void {
  for (let i = 0; i < count; i++) {
    const a: Asset = { id: `rental-${i}`, kind: 'house', name: `Rental ${i}`, emoji: '🏠', purchasePrice: 300_000,
      value: 300_000, condition: 100, purchasedAge: 30, upkeep: 0, details: { countryId: 'us', tenant: 'Existing tenant', tenantRisk: 0 } }
    if (occupied) a.rentedOutFor = rentalMarket(a)
    g.assets.push(a)
    if (occupied) beginLandlordLease(g, a)
    else {
      const l = landlordView(a)
      l.listed = true; l.managerSkill = 90; l.managerFee = .12
      a.details.landlord = l as unknown as Json
    }
  }
}

describe('World Simulation 2.0: household and existing-person integration', () => {
  it('makes childhood learning respond to public education without inventing income or people', () => {
    const base = fixture(); contact(base, { age: 12, money: 20, occupation: 'Middle School Student' })
    const low = structuredClone(base), high = structuredClone(base)
    environment(low, e => publicEducation(e, false)); environment(high, e => publicEducation(e, true))
    const rng = base.rng, cash = base.character.money
    yearlyNpcLife(low, low.people[0]); yearlyNpcLife(high, high.people[0])
    expect(npcLife(high.people[0])!.skill).toBeGreaterThan(npcLife(low.people[0])!.skill)
    for (const g of [low, high]) {
      expect(g.people).toHaveLength(1); expect(g.people[0].money).toBe(20)
      expect(g.character.money).toBe(cash); expect(g.rng).toBe(rng)
      const before = JSON.stringify(g)
      yearlyNpcLife(g, g.people[0]); expect(JSON.stringify(g)).toBe(before)
    }
  })

  it('improves attainable university access, not automatic qualifications, using the same seeded applicants', () => {
    const base = fixture()
    for (let i = 0; i < 100; i++) contact(base, { age: 18, money: 100_000, occupation: 'High School Student' })
    const low = structuredClone(base), high = structuredClone(base)
    environment(low, e => publicEducation(e, false)); environment(high, e => publicEducation(e, true))
    for (const g of [low, high]) for (const p of g.people) yearlyNpcLife(g, p)
    const students = (g: GameState) => g.people.filter(p => p.occupation === 'University Student').length
    expect(students(high)).toBeGreaterThan(students(low))
    expect(students(high)).toBeLessThan(100)
    expect(high.people.every(p => npcLife(p)!.education === 0)).toBe(true)
    expect(high.people).toHaveLength(100); expect(high.rng).toBe(base.rng)
  })

  it('keeps degree duration and qualifications while education quality changes the earned skill', () => {
    const base = fixture(), p = contact(base, { age: 21, money: 30_000, occupation: 'University Student' })
    const l = npcLife(p)!; l.field = 'Engineering'; l.study = 3; saveNpcLife(p, l)
    const low = structuredClone(base), high = structuredClone(base)
    environment(low, e => publicEducation(e, false)); environment(high, e => publicEducation(e, true))
    for (const g of [low, high]) yearlyNpcLife(g, g.people[0])
    for (const g of [low, high]) {
      expect(npcLife(g.people[0])!.education).toBe(1)
      expect(npcLife(g.people[0])!.achievements).toContain("Bachelor's in Engineering")
      expect(npcLife(g.people[0])!.study).toBe(0)
    }
    expect(npcLife(high.people[0])!.skill).toBeGreaterThan(npcLife(low.people[0])!.skill)
  })

  it('charges the real essentials and rent basket once and never reapplies nominal inflation to NPC cash', () => {
    const base = fixture(); contact(base, { age: 70, occupation: 'Retired' })
    const normal = structuredClone(base), scarcity = structuredClone(base), nominal = structuredClone(base)
    environment(scarcity, e => { e.sectors.essentials.costs = 2; e.rent = 2 })
    environment(nominal, e => { e.inflation = 500; e.priceScale = 1e6 })
    for (const g of [normal, scarcity, nominal]) yearlyNpcLife(g, g.people[0])
    expect(npcLife(scarcity.people[0])!.debt).toBeGreaterThan(npcLife(normal.people[0])!.debt)
    expect(nominal.people).toEqual(normal.people)
    expect(scarcity.character.money).toBe(base.character.money)
    const reloaded = JSON.parse(JSON.stringify(scarcity)) as GameState, before = JSON.stringify(reloaded)
    yearlyNpcLife(reloaded, reloaded.people[0]); expect(JSON.stringify(reloaded)).toBe(before)
  })

  it('does not charge homeowner or live-at-home NPCs the independent renter index', () => {
    for (const homeOwner of [false, true]) {
      const base = fixture(), p = contact(base, { age: 70, occupation: 'Retired', livesWithPlayer: !homeOwner })
      if (homeOwner) { const l = npcLife(p)!; l.housing = 500_000; saveNpcLife(p, l) }
      const normal = structuredClone(base), expensive = structuredClone(base)
      environment(expensive, e => { e.rent = 3 })
      yearlyNpcLife(normal, normal.people[0]); yearlyNpcLife(expensive, expensive.people[0])
      expect(expensive.people).toEqual(normal.people)
    }
  })

  it('leaves family-company payroll authoritative during a household cost shock', () => {
    const g = fixture(), p = contact(g, { age: 30, money: 10_000, occupation: 'Engineer' })
    p.data.nepo = { assetId: 'boss', rank: 2, focus: 'ops', kind: 'real', title: 'Engineer', since: 2020,
      rankSince: 2020, pay: 100_000, skill: 75, mood: 80, perf: 70, raised: 0, unpaid: 0, part: false, groom: false, burn: 0 }
    environment(g, e => { e.rent = 3; e.sectors.essentials.costs = 2.5; household(e, .4) })
    yearlyNpcLife(g, p)
    expect(p.money).toBe(10_000); expect(npcLife(p)!.debt).toBe(0); expect(p.occupation).toBe('Engineer')
  })

  it('records actual NPC-company market share once for next-year rival reactions', () => {
    const g = fixture(), p = contact(g, { age: 30, money: 3_000_000 })
    expect(startNpcCompany(g, p, 'cafe')).toBe(true)
    const id = npcCompany(p, g.year)!.a.id
    g.year++
    const l = npcLife(p)!
    npcBusinessYear(g, p, l)
    const company = npcCompany(p, g.year)!
    expect(company.a.id).toBe(id)
    expect(company.b.market).toMatchObject({ year: g.year - 1 })
    expect(g.assets.some(a => a.id === id)).toBe(false)
    const before = JSON.stringify(g)
    npcBusinessYear(g, p, l); expect(JSON.stringify(g)).toBe(before)
  })

  it('gives two wealthy parents with one surname companies with different names', () => {
    // Playtest: "Ella: founded Cooper Café … Jamie: founded Cooper Café" in the birth log.
    const g = fixture()
    g.flags.birthBackground = 5
    const mom = createPerson(g, { relation: 'parent', age: 34, gender: 'female', firstName: 'Ella', lastName: 'Cooper', livesWithPlayer: true })
    const dad = createPerson(g, { relation: 'parent', age: 36, gender: 'male', firstName: 'Jamie', lastName: 'Cooper', livesWithPlayer: true })
    for (const p of [mom, dad]) { p.money = 50_000_000; initializeBirthParent(g, p) }
    const names = [mom, dad].map(p => npcCompany(p, g.year)?.a.name)
    expect(names).toEqual(['Cooper Café', 'Jamie Cooper Café'])
    expect(npcLife(dad)!.history.join('\n')).toContain('founded Jamie Cooper Café')
    // The sheet says what the big number counts, next to their cash on hand.
    const life = npcLifeNodes(g, dad)[0]
    expect(life.type === 'info' && typeof life.text === 'string' ? life.text : '').toMatch(/net worth incl\. property & companies about \$[\d.,]+[KMB]?/)
  })

  it('preserves deterministic decisions for the same contact after the family generation suffix changes', () => {
    const first = fixture(); contact(first, { age: 30, money: 30_000 })
    const heir = JSON.parse(JSON.stringify(first)) as GameState
    heir.lifeId += '-g2'; heir.generation++
    yearlyNpcLife(first, first.people[0]); yearlyNpcLife(heir, heir.people[0])
    expect(heir.people).toEqual(first.people)
    expect(heir.rng).toBe(first.rng)
  })

  it('shifts ordinary birth circumstances under hardship while keeping every rare-wealth tail unchanged', () => {
    const base = fixture(), strained = fixture()
    environment(strained, e => household(e, .4))
    const counts = (g: GameState) => {
      const result = Array<number>(8).fill(0)
      for (let i = 0; i < 20_000; i++) result[birthBackgroundFor(g, (i + .5) / 20_000)]++
      return result
    }
    const before = JSON.stringify(strained), ordinary = counts(base), hard = counts(strained)
    expect(hard[0]).toBeGreaterThan(ordinary[0]); expect(hard[4]).toBeLessThan(ordinary[4])
    expect(hard.slice(5)).toEqual(ordinary.slice(5))
    expect(JSON.stringify(strained)).toBe(before)
    expect(strained.character.money).toBe(base.character.money)
  })

  it('lowers rent collections and vacancy filling when ordinary households cannot afford their budgets', () => {
    for (const occupied of [false, true]) {
      const base = fixture(); rentals(base, occupied)
      const normal = structuredClone(base), hard = structuredClone(base)
      environment(hard, e => household(e, .4))
      normal.year++; hard.year++
      yearlyLandlord(normal); yearlyLandlord(hard)
      const gross = (g: GameState) => g.assets.reduce((sum, a) => sum + landlordView(a).lastGross, 0)
      expect(gross(hard)).toBeLessThan(gross(normal))
      if (!occupied) expect(hard.assets.filter(a => a.rentedOutFor).length).toBeLessThan(normal.assets.filter(a => a.rentedOutFor).length)
      else expect(hard.assets.reduce((sum, a) => sum + landlordView(a).arrears, 0)).toBeGreaterThan(normal.assets.reduce((sum, a) => sum + landlordView(a).arrears, 0))
      const before = JSON.stringify(hard)
      expect(yearlyLandlord(hard)).toBe(0); expect(JSON.stringify(hard)).toBe(before)
    }
  })

  it('does not stack an unemployment rental penalty on the same household-affordability shock', () => {
    const base = fixture(); rentals(base, true)
    const unemployment = structuredClone(base), combined = structuredClone(base)
    environment(unemployment, e => { e.unemployment = .3 })
    environment(combined, e => { e.unemployment = .3; household(e, .6) })
    unemployment.year++; combined.year++
    yearlyLandlord(unemployment); yearlyLandlord(combined)
    expect(combined.assets).toEqual(unemployment.assets)
    expect(combined.character.money).toBe(unemployment.character.money)
  })

  it('keeps household and life profile reads pure and retains the existing world and contacts across inheritance', () => {
    const g = fixture(), heir = contact(g, { relation: 'child', age: 25 }), friend = contact(g, { age: 30 })
    const l = npcLife(friend)!; l.history = ['2029: completed a qualification']; saveNpcLife(friend, l)
    rentals(g, true, 1)
    const before = JSON.stringify(g)
    for (let i = 0; i < 3; i++) {
      birthBackgroundFor(g, .5); npcLifeNodes(g, friend); landlordMenu(g.assets[0]).children(g)
      const e = initialCountry('us', g.year); educationAccess(e); householdPressure(e)
    }
    expect(JSON.stringify(g)).toBe(before)
    const world = JSON.stringify(g.flags.worldEconomy)
    g.character.alive = false
    const next = continueAsChild(g, heir.id)
    expect(JSON.stringify(next.flags.worldEconomy)).toBe(world)
    expect(new Set(next.people.map(p => p.id)).size).toBe(next.people.length)
    expect(next.people.filter(p => p.id === friend.id)).toHaveLength(1)
    expect(npcLife(next.people.find(p => p.id === friend.id)!)!.history).toContain('2029: completed a qualification')
  })
})
