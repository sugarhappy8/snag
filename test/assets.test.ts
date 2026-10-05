import { describe, expect, it } from 'vitest'
import {
  assetsMenu,
  buyCar,
  buyHouse,
  buyItem,
  carListings,
  electronicsListings,
  hasLuckyCharm,
  HEIRLOOMS,
  houseListings,
  jewelryListings,
  MORTGAGE_PLANS,
  mortgageDecision,
  rentalListings,
  rentApartment,
  searchAttic,
  sellAsset,
  shoppingMenu,
  yearlyAssets,
} from '../src/game/assets'
import { annualPayment } from '../src/game/finance'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, Job, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function job(salary: number): Job {
  return { defId: 'test', title: 'Engineer', company: 'Test Co', category: 'fulltime', salary, level: 0, performance: 60, yearsInRole: 3, yearsAtCompany: 3, data: {} }
}

function adult(money: number, salary = 90_000, age = 30): GameState {
  const g = makeTestGame(7, { age, money })
  g.character.job = job(salary)
  return g
}

function notices(g: GameState): string[] {
  return g.queue.flatMap((m) => (m.kind === 'notice' ? [m.title] : []))
}

/** Walk every menu node (calling every dynamic function) to catch runtime errors. */
function walk(g: GameState, nodes: MenuNode[], depth = 0): number {
  let n = 0
  for (const node of nodes) {
    n++
    if (node.type === 'info') {
      if (typeof node.text === 'function') node.text(g)
      node.visible?.(g)
      continue
    }
    if (node.type === 'heading') {
      node.visible?.(g)
      continue
    }
    if (typeof node.subtitle === 'function') node.subtitle(g)
    node.visible?.(g)
    node.disabledReason?.(g)
    if (node.type === 'action') {
      node.confirm?.(g)
      node.input?.defaultValue?.(g)
    } else {
      node.header?.(g)
      if (depth < 6) n += walk(g, node.children(g), depth + 1)
    }
  }
  return n
}

describe('real estate', () => {
  it('lists houses that stay the same all year without touching the game RNG', () => {
    const g = adult(0)
    const rng = g.rng
    const a = houseListings(g, 'residential')
    const b = houseListings(g, 'residential')
    expect(a.length).toBeGreaterThan(0)
    expect(b).toEqual(a)
    expect(g.rng).toBe(rng)
    g.year += 1
    expect(houseListings(g, 'residential')).not.toEqual(a)
    const lux = houseListings(g, 'luxury')
    expect(lux.every((l) => ['penthouse', 'mansion', 'farm', 'ranch', 'villa', 'castle'].includes(l.typeId))).toBe(true)
  })

  it('scales prices with country wealth', () => {
    const rich = adult(0)
    const poor = adult(0)
    poor.character.countryId = 'in'
    poor.character.city = rich.character.city
    const avg = (g: GameState) => houseListings(g, 'residential').reduce((s, l) => s + l.price, 0)
    expect(avg(poor)).toBeLessThan(avg(rich))
  })

  it('buys a house with a mortgage: asset, residence and down payment', () => {
    const g = adult(200_000, 150_000)
    const listing = houseListings(g, 'residential')[0]
    const plan = MORTGAGE_PLANS.find((p) => p.id === 'm20_30')!
    const d = mortgageDecision(g, listing.price, plan)
    expect(d.ok).toBe(true)
    expect(buyHouse(g, listing, plan)).toBe(true)
    const house = g.assets[0]
    expect(house.kind).toBe('house')
    expect(house.mortgage?.balance).toBe(listing.price - d.down)
    expect(house.mortgage?.yearlyPayment).toBe(annualPayment(listing.price - d.down, d.rate, 30))
    expect(g.character.money).toBe(200_000 - d.down)
    expect(g.character.residence).toMatchObject({ status: 'owned', assetId: house.id })
    expect(g.counters.housesBought).toBe(1)
    // The same listing can't be bought twice this year.
    expect(houseListings(g, 'residential').some((l) => l.id === listing.id)).toBe(false)
  })

  it('buys through the listing popup script too', () => {
    const g = adult(100_000_000)
    const listing = houseListings(g, 'luxury')[0]
    const node = assetsMenu.children(g).find((n) => n.type === 'menu' && n.id === 'realEstate')
    expect(node?.type).toBe('menu')
    if (node?.type !== 'menu') return
    const broker = node.children(g).find((n) => n.id === 'broker-luxury')
    if (broker?.type !== 'menu') throw new Error('no broker')
    const action = broker.children(g).find((n) => n.type === 'action' && n.id === `listing-${listing.id}`)
    if (action?.type !== 'action') throw new Error('no listing action')
    action.run(g)
    const modal = g.queue.pop() as ChoiceModal
    expect(modal.kind).toBe('choice')
    expect(modal.choices.map((c) => c.id)).toContain('cash')
    expect(listing.price).toBeLessThan(g.character.money)
    runScript(g, modal.scriptId!, 'cash', modal.data, modal)
    expect(g.assets).toHaveLength(1)
    expect(g.character.money).toBe(100_000_000 - listing.price)
  })

  it('denies minors, the broke and the jobless', () => {
    const kid = makeTestGame(1, { age: 15, money: 10_000_000 })
    const listing = houseListings(kid, 'residential')[0]
    expect(buyHouse(kid, listing, null)).toBe(false)
    expect(kid.assets).toHaveLength(0)
    expect(mortgageDecision(kid, listing.price, MORTGAGE_PLANS[0]).ok).toBe(false)

    const broke = adult(1_000)
    expect(buyHouse(broke, houseListings(broke, 'residential')[0], null)).toBe(false)
    expect(notices(broke)).toContain('Insufficient Funds')

    const jobless = adult(60_000, 0)
    jobless.character.job = null
    const pricey = houseListings(jobless, 'residential').at(-1)!
    expect(mortgageDecision(jobless, pricey.price, MORTGAGE_PLANS[1]).ok).toBe(false)
  })

  it('amortizes a mortgage to zero over its term', () => {
    const g = adult(400_000, 200_000)
    const listing = houseListings(g, 'residential')[0]
    const plan = MORTGAGE_PLANS.find((p) => p.id === 'm20_15')!
    expect(buyHouse(g, listing, plan)).toBe(true)
    const house = g.assets[0]
    let last = house.mortgage!.balance
    for (let y = 0; y < plan.years - 1; y++) {
      g.character.money += 1_000_000 // keep paying on time
      g.year += 1
      yearlyAssets(g)
      expect(house.mortgage).toBeDefined()
      expect(house.mortgage!.balance).toBeLessThan(last)
      last = house.mortgage!.balance
    }
    g.character.money += 1_000_000
    yearlyAssets(g)
    expect(g.assets[0].mortgage).toBeUndefined()
    expect(notices(g)).toContain('Mortgage Paid Off!')
  })

  it('forecloses after two missed mortgage payments', () => {
    const g = adult(300_000, 150_000)
    createPerson(g, { relation: 'parent', age: 60, relationship: 90 })
    const listing = houseListings(g, 'residential')[0]
    expect(buyHouse(g, listing, MORTGAGE_PLANS[1])).toBe(true)
    g.character.money = 0
    yearlyAssets(g)
    expect(g.assets).toHaveLength(1)
    expect(notices(g)).toContain('Missed Mortgage Payment')
    g.character.money = 0
    yearlyAssets(g)
    expect(g.assets).toHaveLength(0)
    expect(notices(g)).toContain('Foreclosure')
    expect(g.character.residence.status).toBe('parents')
  })

  it('sells a mortgaged home, pays off the loan and moves you out', () => {
    const g = adult(300_000, 150_000)
    const listing = houseListings(g, 'residential')[0]
    buyHouse(g, listing, MORTGAGE_PLANS[1])
    const house = g.assets[0]
    const owed = house.mortgage!.balance
    const before = g.character.money
    expect(sellAsset(g, house.id, house.value, 'a buyer')).toBe(true)
    expect(g.assets).toHaveLength(0)
    expect(g.character.money).toBe(before + house.value - owed)
    expect(g.character.residence.status).not.toBe('owned')
  })

  it('collects rent from tenants as taxable income', () => {
    const g = adult(100_000)
    const listing = houseListings(g, 'residential')[0]
    g.character.money = listing.price + 100_000
    buyHouse(g, listing, null)
    const house = g.assets[0]
    g.character.residence = { status: 'parents' }
    house.rentedOutFor = 24_000
    house.details.tenant = 'Pat Doe'
    house.details.tenantRisk = 0
    house.details.tenantLate = 0
    g.flags.taxableIncome = 0
    yearlyAssets(g)
    expect(g.flags.taxableIncome).toBe(24_000)
  })
})

describe('rentals', () => {
  it('moves you out of your parents’ house into a rental', () => {
    const g = adult(20_000)
    const l = rentalListings(g)[0]
    expect(rentApartment(g, l)).toBe(true)
    expect(g.character.residence.status).toBe('renting')
    expect(g.character.residence.rent).toBe(l.monthly * 12)
    expect(g.character.money).toBe(20_000 - l.monthly * 2)
  })

  it('is for adults only', () => {
    const kid = makeTestGame(2, { age: 16, money: 50_000 })
    expect(rentApartment(kid, rentalListings(kid)[0])).toBe(false)
    expect(kid.character.residence.status).toBe('parents')
  })
})

describe('cars', () => {
  it('buys a car with an auto loan linked to the asset', () => {
    const g = adult(30_000, 80_000)
    const l = carListings(g, 'main')[0]
    expect(buyCar(g, l, { id: 'f10_5', down: 0.1, years: 5 })).toBe(true)
    const car = g.assets[0]
    expect(car.kind).toBe('car')
    expect(g.character.loans).toHaveLength(1)
    expect(g.character.loans[0].kind).toBe('car')
    expect(car.details.loanId).toBe(g.character.loans[0].id)
    expect(g.counters.carsBought).toBe(1)
    // No license needed to buy, but you're told about it.
    expect(g.queue.some((m) => m.kind === 'notice' && m.text.includes("driver's license"))).toBe(true)
  })

  it("won't sell cars to kids", () => {
    const g = makeTestGame(3, { age: 15, money: 1_000_000 })
    expect(buyCar(g, carListings(g, 'used')[0], null)).toBe(false)
    expect(g.assets).toHaveLength(0)
  })

  it('depreciates cars every year', () => {
    const g = adult(1_000_000)
    const l = carListings(g, 'prestige')[0]
    buyCar(g, l, null)
    const car = g.assets[0]
    const v0 = car.value
    g.year += 1
    yearlyAssets(g)
    expect(car.value).toBeLessThan(v0)
    expect(car.condition).toBeLessThan(100)
  })
})

describe('shopping', () => {
  it('turns purchases into assets with emoji and counts them', () => {
    const g = adult(100_000)
    const item = electronicsListings(g)[0]
    const a = buyItem(g, item, 12)
    expect(a).not.toBeNull()
    expect(a!.emoji).toBe(item.emoji)
    expect(g.character.money).toBe(100_000 - item.price)
    expect(g.counters.purchases).toBe(1)
  })

  it('sells engagement rings and refuses what you cannot afford', () => {
    const g = adult(10)
    const rings = jewelryListings(g, 'real').filter((i) => i.details.engagement === true)
    expect(rings.length).toBeGreaterThan(0)
    expect(buyItem(g, rings[0], 18)).toBeNull()
    expect(g.character.money).toBe(10)
    expect(notices(g)).toContain('Insufficient Funds')
  })
})

describe('heirlooms', () => {
  it('finds heirlooms in the attic once a year, flagged for the next generation', () => {
    let found: Asset | null = null
    for (let seed = 1; seed < 40 && !found; seed++) {
      const g = makeTestGame(seed, { age: 12 })
      found = searchAttic(g)
      if (found) {
        expect(found.details.heirloom).toBe(true)
        expect(HEIRLOOMS.some((h) => h.id === found!.details.heirloomId)).toBe(true)
        expect(g.counters.heirlooms).toBe(1)
        // Only one search per year.
        expect(searchAttic(g)).toBeNull()
        expect(g.assets).toHaveLength(1)
      }
    }
    expect(found).not.toBeNull()
  })

  it('makes the lucky dice a lucky charm', () => {
    const g = makeTestGame(1, { age: 30 })
    expect(hasLuckyCharm(g)).toBe(false)
    g.assets.push({ id: 'd', kind: 'collectible', name: 'Pair of Lucky Dice', emoji: '🎲', purchasePrice: 0, value: 1, condition: 80, purchasedAge: 12, upkeep: 0, details: { heirloom: true, heirloomId: 'dice', lucky: true, baseValue: 1 } })
    expect(hasLuckyCharm(g)).toBe(true)
  })
})

describe('menus', () => {
  it('build without errors for kids, adults with stuff, prisoners and the dead', () => {
    const kid = makeTestGame(4, { age: 8 })
    expect(walk(kid, assetsMenu.children(kid))).toBeGreaterThan(5)
    expect(shoppingMenu.disabledReason?.(kid)).toBeTruthy()

    const rich = adult(50_000_000, 500_000)
    buyHouse(rich, houseListings(rich, 'luxury')[0], null)
    buyCar(rich, carListings(rich, 'exotic')[0], null)
    buyItem(rich, jewelryListings(rich, 'real')[0])
    buyItem(rich, electronicsListings(rich)[0])
    rich.assets[0].rentedOutFor = 50_000
    expect(walk(rich, assetsMenu.children(rich))).toBeGreaterThan(50)
    expect(walk(rich, shoppingMenu.children(rich))).toBeGreaterThan(20)
    expect(JSON.parse(JSON.stringify(rich))).toEqual(rich)

    const con = adult(1_000)
    con.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(shoppingMenu.visible?.(con)).toBe(false)
    const realEstate = assetsMenu.children(con).find((n) => n.id === 'realEstate')
    expect(realEstate && 'disabledReason' in realEstate && realEstate.disabledReason?.(con)).toBeTruthy()
  })

  it('ages a pile of assets for decades without breaking', () => {
    const g = adult(100_000_000, 500_000)
    buyHouse(g, houseListings(g, 'residential')[0], MORTGAGE_PLANS[0])
    buyCar(g, carListings(g, 'used')[0], null)
    for (const i of jewelryListings(g, 'fake').slice(0, 2)) buyItem(g, i)
    for (let y = 0; y < 40; y++) {
      g.year += 1
      g.character.age += 1
      g.yearActions = {}
      yearlyAssets(g)
      for (const m of g.queue) if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[0].id, m.data, m)
      g.queue = []
    }
    for (const a of g.assets) {
      expect(Number.isFinite(a.value)).toBe(true)
      expect(a.value).toBeGreaterThan(0)
      expect(a.condition).toBeGreaterThanOrEqual(0)
    }
    expect(Number.isFinite(g.character.money)).toBe(true)
  })
})
