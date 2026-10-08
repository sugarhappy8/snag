// Local markets in the shops, real estate, loans and living costs (assets.ts + finance.ts).
//
// The first part pins a few countries to synthetic market profiles (via the mock below) so the
// formulas can be checked exactly; the last part sweeps every real country profile.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketProfile } from '../src/game/data/markets'

const overrides = vi.hoisted(() => ({ map: {} as Record<string, Record<string, unknown>> }))

vi.mock('../src/game/data/markets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/data/markets')>()
  const marketOf = (id: string): MarketProfile => {
    const base = actual.marketOf(id)
    const o = overrides.map[id] as Partial<MarketProfile> | undefined
    return o ? { ...base, ...o, priceMult: { ...(o.priceMult ?? base.priceMult) } } : base
  }
  return {
    ...actual,
    marketOf,
    localMarket: (g: { character: { countryId: string } }) => marketOf(g.character.countryId),
    localPriceMult: (g: { character: { countryId: string } }, c: keyof MarketProfile['priceMult']) => marketOf(g.character.countryId).priceMult[c] ?? 1,
    salesTaxRate: (g: { character: { countryId: string } }) => marketOf(g.character.countryId).salesTax,
    hasMarketData: (id: string) => id in overrides.map || actual.hasMarketData(id),
  }
})

import {
  assetsMenu,
  buyCar,
  buyItem,
  buyVehicle,
  carDealersMenu,
  carListings,
  carPriceMult,
  collectibleListings,
  electronicsListings,
  findAsset,
  globalGoodsMult,
  goodsMult,
  houseListings,
  housingMult,
  jewelryListings,
  localGoodsMult,
  luxuryListings,
  MORTGAGE_PLANS,
  mortgageDecision,
  realEstateMenu,
  rentalListings,
  salesTaxNote,
  shoppingMenu,
  specialtyVehiclesMenu,
  vehicleListings,
  yearlyAssets,
} from '../src/game/assets'
import { marketOf } from '../src/game/data/markets'
import { baseLoanRate, costOfLiving, creditScore, livingCost, offeredRate } from '../src/game/finance'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, Job, MenuGroup, MenuNode } from '../src/game/types'
import { COUNTRIES, getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

function profile(id: string, o: Partial<MarketProfile>): void {
  overrides.map[id] = o as Record<string, unknown>
}

beforeEach(() => {
  overrides.map = {}
})

function job(salary: number): Job {
  return { defId: 'test', title: 'Engineer', company: 'Test Co', category: 'fulltime', salary, level: 0, performance: 60, yearsInRole: 3, yearsAtCompany: 3, data: {} }
}

function adult(countryId = 'us', money = 5_000_000, salary = 150_000): GameState {
  const c = getCountry(countryId)
  const g = makeTestGame(21, { age: 32, money, countryId, city: countryId === 'us' ? 'Chicago' : c.cities[c.cities.length - 1] })
  g.character.job = job(salary)
  return g
}

function lastNotice(g: GameState): { title: string; text: string } {
  const n = [...g.queue].reverse().find((m) => m.kind === 'notice')
  if (!n || n.kind !== 'notice') throw new Error('no notice')
  return n
}

function texts(g: GameState, nodes: MenuNode[], depth = 0): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    else if (n.type === 'heading') out.push(n.label)
    else {
      out.push(n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''), n.disabledReason?.(g) ?? '')
      if (n.type === 'action') out.push(n.confirm?.(g) ?? '')
      else {
        out.push(n.header?.(g) ?? '')
        if (depth < 5) out.push(...texts(g, n.children(g), depth + 1))
      }
    }
  }
  return out
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('local goods prices', () => {
  it('prices cars by the local car market (duties, registration taxes)', () => {
    profile('us', { priceMult: { car: 1 } })
    const cheap = adult('us')
    const normal = carListings(cheap, 'main')
    profile('us', { priceMult: { car: 2.8 } })
    const dear = carListings(adult('us'), 'main')
    // Same seed, same models: only the multiplier changed.
    expect(dear.map((l) => l.model)).toEqual(normal.map((l) => l.model))
    for (let i = 0; i < dear.length; i++) {
      expect(dear[i].price / normal[i].price).toBeGreaterThan(2.6)
      expect(dear[i].price / normal[i].price).toBeLessThan(3)
    }
  })

  it('softens prices of global goods in poorer countries, but only partly', () => {
    profile('in', { priceMult: { car: 1, electronics: 1, luxury: 1 } })
    const g = adult('in')
    // reach = floor + (1 - floor) × wealth (India's wealth is 0.25).
    expect(localGoodsMult(g, 'car')).toBeCloseTo(0.35 + 0.65 * 0.25, 5)
    expect(localGoodsMult(g, 'electronics')).toBeCloseTo(0.6 + 0.4 * 0.25, 5)
    expect(localGoodsMult(g, 'luxury')).toBeCloseTo(0.85 + 0.15 * 0.25, 5)
    // Food and fuel priceMults are already local price levels.
    profile('in', { priceMult: { food: 0.3, fuel: 1.3 } })
    expect(localGoodsMult(adult('in'), 'food')).toBeCloseTo(0.3, 5)
    expect(localGoodsMult(adult('in'), 'fuel')).toBeCloseTo(1.3, 5)
    // goodsMult with a category is the same thing; without one it's the old wealth-only scale.
    expect(goodsMult(adult('in'), 'fuel')).toBeCloseTo(1.3, 5)
    expect(goodsMult(adult('in'))).toBeCloseTo(0.55, 5)
  })

  it('keeps premium cars close to the world price where economy cars get cheaper local trims', () => {
    profile('in', { priceMult: { car: 1.5 } })
    const g = adult('in')
    expect(carPriceMult(g, 'economy')).toBeCloseTo(localGoodsMult(g, 'car'), 5)
    expect(carPriceMult(g, 'supercar')).toBeCloseTo(1.5 * (0.9 + 0.1 * 0.25), 5)
    expect(carPriceMult(g, 'luxury')).toBeGreaterThan(1.2)
    expect(carPriceMult(g, 'mystery-van')).toBeCloseTo(localGoodsMult(g, 'car'), 5)
    // Rich countries: every type follows priceMult exactly.
    profile('us', { priceMult: { car: 2 } })
    for (const t of ['economy', 'suv', 'luxury', 'supercar', 'classic']) expect(carPriceMult(adult('us'), t)).toBeCloseTo(2, 5)
  })

  it('clamps absurd multipliers and survives missing or broken data', () => {
    profile('us', { priceMult: { car: 50, electronics: 0, luxury: Number.NaN } })
    const g = adult('us')
    expect(localGoodsMult(g, 'car')).toBe(4.5)
    expect(localGoodsMult(g, 'electronics')).toBe(1)
    expect(localGoodsMult(g, 'luxury')).toBe(1)
    for (const l of [...carListings(g, 'main'), ...carListings(g, 'exotic')]) expect(Number.isFinite(l.price) && l.price > 0).toBe(true)
  })

  it('uses the electronics market for gadgets and the luxury market for jewelry and designer goods', () => {
    profile('us', { priceMult: {} })
    const base = adult('us')
    const phones = sum(electronicsListings(base).map((i) => i.price))
    const bags = sum(luxuryListings(base).map((i) => i.price))
    const rings = sum(jewelryListings(base, 'real').map((i) => i.price))
    const art = sum(collectibleListings(base, 'art').map((i) => i.price))
    const boats = sum(vehicleListings(base, 'boat').map((i) => i.price))
    profile('us', { priceMult: { electronics: 1.5, luxury: 1.4, car: 3 } })
    const g = adult('us')
    expect(sum(electronicsListings(g).map((i) => i.price)) / phones).toBeCloseTo(1.5, 1)
    expect(sum(luxuryListings(g).map((i) => i.price)) / bags).toBeCloseTo(1.4, 1)
    expect(sum(jewelryListings(g, 'real').map((i) => i.price)) / rings).toBeCloseTo(1.4, 1)
    // Art, collectibles, boats and planes trade globally.
    expect(sum(collectibleListings(g, 'art').map((i) => i.price))).toBe(art)
    expect(sum(vehicleListings(g, 'boat').map((i) => i.price))).toBe(boats)
    expect(globalGoodsMult(g)).toBe(1)
    expect(globalGoodsMult(adult('et'))).toBeGreaterThan(0.85)
  })

  it('charges car running costs by the local fuel price', () => {
    const upkeep = (fuel: number) => {
      profile('us', { priceMult: { fuel } })
      const g = adult('us')
      const l = carListings(g, 'main').find((x) => x.carType !== 'electric')!
      expect(buyCar(g, l, null)).toBe(true)
      return g.assets[0].upkeep
    }
    const cheapGas = upkeep(0.05)
    const usGas = upkeep(1)
    const pricyGas = upkeep(2.5)
    expect(cheapGas).toBeLessThan(usGas)
    expect(pricyGas).toBeGreaterThan(usGas * 1.4)
    // ...and follows the car to a new country at the next birthday.
    profile('us', { priceMult: { fuel: 2.5 } })
    const g = adult('us')
    buyCar(g, carListings(g, 'main').find((x) => x.carType !== 'electric')!, null)
    const car = g.assets[0]
    const before = car.upkeep
    profile('us', { priceMult: { fuel: 0.05 } })
    g.year += 1
    yearlyAssets(g)
    expect(findAsset(g, car.id)?.upkeep ?? 0).toBeLessThan(before)
  })
})

describe('consumption tax', () => {
  it('names the local tax and rate on every store purchase', () => {
    profile('gb', { salesTax: 0.2, salesTaxName: 'VAT' })
    const g = adult('gb')
    const item = electronicsListings(g)[0]
    expect(buyItem(g, item, 12)).not.toBeNull()
    const n = lastNotice(g)
    expect(n.text).toContain('Price includes 20% VAT (')
    const tax = Math.round(item.price - item.price / 1.2)
    expect(n.text).toContain(`$${tax.toLocaleString('en-US')}`)
  })

  it('keeps the price tax-inclusive in the US too and lowercases sales tax mid-sentence', () => {
    profile('us', { salesTax: 0.074, salesTaxName: 'Sales tax' })
    const g = adult('us')
    const l = carListings(g, 'main')[0]
    const before = g.character.money
    expect(buyCar(g, l, null)).toBe(true)
    expect(g.character.money).toBe(before - l.price)
    expect(lastNotice(g).text).toContain('Price includes 7.4% sales tax (')
    expect(salesTaxNote(g, 1_074)).toBe('Price includes 7.4% sales tax ($74).')
  })

  it('keeps local abbreviations and says nothing where there is no consumption tax', () => {
    profile('de', { salesTax: 0.19, salesTaxName: 'MwSt' })
    expect(salesTaxNote(adult('de'), 119)).toBe('Price includes 19% MwSt ($19).')
    profile('ae', { salesTax: 0, salesTaxName: 'VAT' })
    const g = adult('ae')
    expect(salesTaxNote(g, 50_000)).toBe('')
    const boat = vehicleListings(g, 'boat').find((l) => !l.license)
    if (boat) {
      expect(buyVehicle(g, boat, null)).toBe(true)
      expect(lastNotice(g).text).not.toContain('Price includes')
    }
    expect(texts(g, shoppingMenu.children(g)).join(' ')).not.toContain('Prices include')
  })

  it('shows the tax in store headers', () => {
    profile('fr', { salesTax: 0.2, salesTaxName: 'TVA' })
    const g = adult('fr')
    const all = texts(g, shoppingMenu.children(g)).join('\n')
    expect(all).toContain('Prices include 20% TVA (VAT).')
    profile('gb', { salesTax: 0.2, salesTaxName: 'VAT' })
    expect(shoppingMenu.header?.(adult('gb'))).toContain('Prices include 20% VAT.')
    profile('jp', { salesTax: 0.1, salesTaxName: 'Consumption tax' })
    expect(shoppingMenu.header?.(adult('jp'))).toContain('Prices include 10% consumption tax.')
  })
})

describe('loans follow the local central bank', () => {
  it('prices mortgages, car loans and personal loans off the policy rate', () => {
    profile('jp', { interestRate: 0.005 })
    profile('fr', { interestRate: 0.02 })
    profile('us', { interestRate: 0.045 })
    profile('br', { interestRate: 0.15 })
    profile('tr', { interestRate: 0.46 })
    expect(baseLoanRate('jp', 'mortgage')).toBeGreaterThan(0.01)
    expect(baseLoanRate('jp', 'mortgage')).toBeLessThan(0.025)
    expect(baseLoanRate('fr', 'mortgage')).toBeGreaterThan(0.03)
    expect(baseLoanRate('fr', 'mortgage')).toBeLessThan(0.042)
    expect(baseLoanRate('us', 'mortgage')).toBeGreaterThan(0.058)
    expect(baseLoanRate('us', 'mortgage')).toBeLessThan(0.07)
    expect(baseLoanRate('br', 'mortgage')).toBeGreaterThan(0.11)
    expect(baseLoanRate('tr', 'mortgage')).toBe(0.24)
    expect(baseLoanRate('tr', 'personal')).toBe(0.34)
    for (const id of ['jp', 'fr', 'us', 'br', 'tr']) {
      expect(baseLoanRate(id, 'car')).toBeGreaterThan(baseLoanRate(id, 'mortgage') - 0.0001)
      expect(baseLoanRate(id, 'personal')).toBeGreaterThan(baseLoanRate(id, 'car'))
    }
  })

  it('writes the local rate into the mortgage the player signs and shows it', () => {
    profile('jp', { interestRate: 0.005, nameWords: ['Sakura'] })
    const g = adult('jp', 2_000_000, 120_000)
    const listing = houseListings(g, 'residential')[0]
    const plan = MORTGAGE_PLANS.find((p) => p.id === 'm20_30')!
    const d = mortgageDecision(g, listing.price, plan)
    expect(d.ok).toBe(true)
    expect(d.rate).toBeLessThan(0.025)
    expect(d.rate).toBeGreaterThan(0.003)
    expect(realEstateMenu.header?.(g)).toContain(`${(d.rate * 100).toFixed(1)}%`)
    const broker = realEstateMenu.children(g).find((n) => n.id === 'broker-residential') as MenuGroup
    expect(broker.label).toBe('Sakura Realty')
    const action = broker.children(g).find((n) => n.type === 'action' && n.id === `listing-${listing.id}`)
    if (action?.type !== 'action') throw new Error('no listing')
    action.run(g)
    const modal = g.queue.pop() as ChoiceModal
    expect(modal.choices.find((c) => c.id === plan.id)?.label).toContain(`${(d.rate * 100).toFixed(2)}%`)
    runScript(g, modal.scriptId!, plan.id, modal.data, modal)
    const house = g.assets[0]
    expect(house.mortgage?.rate).toBe(d.rate)
    // A real bank that trades in Japan (home banks first), or a local-sounding last resort.
    expect(house.mortgage?.lender).toMatch(/Bank|Sakura|savings|building society|credit union|MUFG|Mizuho|SMBC|Resona/i)
  })

  it('makes credit matter but never goes below the bank’s floor', () => {
    profile('ch', { interestRate: 0 })
    const g = adult('ch', 2_000_000, 300_000)
    expect(creditScore(g)).toBeGreaterThanOrEqual(700)
    const r = offeredRate(g, 'mortgage')
    expect(r).toBeGreaterThan(0.004)
    expect(r).toBeLessThanOrEqual(baseLoanRate('ch', 'mortgage'))
    const broke = adult('ch', 0, 0)
    broke.character.job = null
    broke.flags.missedPayments = 4
    expect(offeredRate(broke, 'mortgage')).toBeGreaterThan(r + 0.03)
  })

  it('finances cars at the local auto-loan rate', () => {
    profile('jp', { interestRate: 0.005 })
    const g = adult('jp', 50_000, 80_000)
    const l = carListings(g, 'main')[0]
    expect(buyCar(g, l, { id: 'f10_5', down: 0.1, years: 5 })).toBe(true)
    expect(g.character.loans[0].rate).toBeLessThan(0.05)
    profile('br', { interestRate: 0.15 })
    const b = adult('br', 50_000, 80_000)
    expect(buyCar(b, carListings(b, 'main')[0], { id: 'f10_5', down: 0.1, years: 5 })).toBe(true)
    expect(b.character.loans[0].rate).toBeGreaterThan(0.12)
  })
})

describe('housing and living costs', () => {
  it('blends the local rent level into home prices and rents', () => {
    profile('fr', { rentCost: 0.5 })
    const low = adult('fr')
    const lowMult = housingMult(low)
    const lowRent = sum(rentalListings(low).map((l) => l.monthly))
    profile('fr', { rentCost: 2 })
    const high = adult('fr')
    expect(housingMult(high) / lowMult).toBeCloseTo(Math.pow(4, 0.4), 5)
    expect(sum(rentalListings(high).map((l) => l.monthly))).toBeGreaterThan(lowRent * 1.4)
    // With rents in line with wealth it stays close to the old wealth^1.1 curve.
    profile('us', { rentCost: 1 })
    const us = adult('us')
    us.character.city = 'Nowhereville'
    for (const id of ['in', 'br', 'jp', 'et']) {
      const wealth = getCountry(id).wealth
      profile(id, { rentCost: wealth })
      const g = adult(id)
      g.character.city = 'Nowhereville'
      const country = housingMult(g) / housingMult(us)
      expect(Math.abs(Math.log(country / Math.pow(wealth, 1.1)))).toBeLessThan(0.1)
    }
  })

  it('makes Switzerland-style groceries pricier and India-style ones cheaper', () => {
    profile('ch', { priceMult: { food: 1.6 } })
    profile('in', { priceMult: { food: 0.3 } })
    profile('us', { priceMult: {} })
    expect(costOfLiving('us')).toBeCloseTo(1, 5)
    expect(costOfLiving('ch')).toBeGreaterThan(1.3)
    expect(costOfLiving('in')).toBeLessThan(0.35)
    const g = adult('ch')
    g.character.residence = { status: 'renting', rent: 20_000 }
    expect(livingCost(g)).toBe(Math.round(3_000 * costOfLiving('ch')))
  })

  it('never lets dollar-priced groceries eat more than 1.8× the US share of a local wage', () => {
    // Venezuela-style: poor country, supermarket prices in dollars.
    profile('ve', { priceMult: { food: 1.4 } })
    expect(costOfLiving('ve')).toBeCloseTo(1.8 * 0.25, 5)
    for (const c of COUNTRIES) {
      const ratio = costOfLiving(c.id) / Math.max(0.25, c.wealth)
      expect(ratio, c.id).toBeLessThanOrEqual(1.8 + 1e-9)
      expect(ratio, c.id).toBeGreaterThan(0.4)
    }
  })
})

describe('local names and blurbs', () => {
  it('names dealers and shops after local words, falling back to the defaults', () => {
    profile('jp', { nameWords: ['Fuji'], priceMult: { car: 0.85, fuel: 1.3 } })
    const g = adult('jp')
    const labels = carDealersMenu.children(g).map((n) => ('label' in n ? n.label : ''))
    expect(labels).toContain('Fuji Motors')
    expect(labels).toContain('Second Chance Auto Sales')
    expect(specialtyVehiclesMenu.children(g).map((n) => ('label' in n ? n.label : ''))).toEqual(['Fuji Marine', 'Fuji Aviation'])
    profile('jp', { nameWords: [] })
    expect(carDealersMenu.children(adult('jp')).map((n) => ('label' in n ? n.label : ''))).toContain('Main Street Motors')
  })

  it('explains steep car prices and cheap gas in the headers', () => {
    profile('sg', { priceMult: { car: 2.8, fuel: 2.5 } })
    const sg = adult('sg')
    expect(carDealersMenu.header?.(sg)).toMatch(/cars here cost about 2\.8× what they do in the US/)
    expect(shoppingMenu.header?.(sg)).toContain('cars in Singapore cost about 2.8×')
    profile('ve', { priceMult: { fuel: 0.05 } })
    expect(shoppingMenu.header?.(adult('ve'))).toContain('practically free')
    // Duties that ordinary wages can't absorb read as a luxury, not a misleading multiple.
    profile('et', { priceMult: { car: 2.5 } })
    expect(carDealersMenu.header?.(adult('et'))).toContain('a luxury few locals can afford')
  })
})

describe('every country', () => {
  const ADULT_CHECKS = COUNTRIES.map((c) => c.id)

  it('prices everything sanely in all countries (real market data)', () => {
    for (const id of ADULT_CHECKS) {
      const g = adult(id)
      const prices = [
        ...carListings(g, 'used'),
        ...carListings(g, 'main'),
        ...carListings(g, 'exotic'),
        ...houseListings(g, 'residential'),
        ...houseListings(g, 'luxury'),
        ...electronicsListings(g),
        ...luxuryListings(g),
        ...jewelryListings(g, 'real'),
        ...vehicleListings(g, 'aircraft'),
      ].map((l) => l.price)
      for (const p of prices) {
        expect(Number.isFinite(p), `${id} price ${p}`).toBe(true)
        expect(p, id).toBeGreaterThan(0)
      }
      for (const r of rentalListings(g)) expect(r.monthly, id).toBeGreaterThanOrEqual(60)
      for (const kind of ['mortgage', 'car', 'personal', 'business', 'student'] as const) {
        const rate = offeredRate(g, kind)
        expect(rate, `${id} ${kind}`).toBeGreaterThan(0)
        expect(rate, `${id} ${kind}`).toBeLessThanOrEqual(0.4)
      }
      const living = livingCost({ ...g, character: { ...g.character, residence: { status: 'renting', rent: 1 } } })
      expect(Number.isFinite(living) && living > 0, id).toBe(true)
      // An economy car never costs more than a few years of a good local salary.
      const economy = carListings(g, 'main').filter((l) => l.carType === 'economy').map((l) => l.price)
      const salary = 60_000 * Math.max(0.25, getCountry(id).wealth)
      for (const p of economy) expect(p / salary, id).toBeLessThan(4)
    }
  })

  it('renders shop and asset menus everywhere without undefined or NaN', () => {
    for (const id of ADULT_CHECKS) {
      const g = adult(id)
      const all = [...texts(g, shoppingMenu.children(g)), ...texts(g, assetsMenu.children(g)), shoppingMenu.header?.(g) ?? '', assetsMenu.header?.(g) ?? ''].join('\n')
      expect(all, id).not.toMatch(/undefined|NaN|\{w\}|Infinity/)
      const tax = marketOf(id).salesTax
      if (tax > 0) expect(salesTaxNote(g, 1_000), id).toMatch(/^Price includes \d+(\.\d)?% .+ \(\$\d+\)\.$/)
    }
  })

  it('keeps kids, prisoners and the dead out of the shops', () => {
    const kid = makeTestGame(3, { age: 9, countryId: 'sg', city: 'Singapore' })
    expect(shoppingMenu.disabledReason?.(kid)).toBeTruthy()
    expect(carDealersMenu.disabledReason?.(kid)).toBeTruthy()
    const dead = adult('dk')
    dead.character.alive = false
    expect(realEstateMenu.disabledReason?.(dead)).toBeTruthy()
    const con = adult('br')
    con.character.prison = { name: 'Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(carDealersMenu.disabledReason?.(con)).toBeTruthy()
    expect(shoppingMenu.visible?.(con)).toBe(false)
  })

  it('keeps old saves working: cars without a type and loans from before', () => {
    const g = adult('no')
    g.assets.push({ id: 'old', kind: 'car', name: '1999 Volvo 240', emoji: '🚗', purchasePrice: 9_000, value: 2_000, condition: 40, purchasedAge: 20, upkeep: 1_200, details: {} })
    g.character.loans.push({ id: 'l0', kind: 'car', lender: 'Old Bank', balance: 1_000, yearlyPayment: 500, rate: 0.07 })
    g.year += 1
    yearlyAssets(g)
    const car = findAsset(g, 'old')
    if (car) {
      expect(car.upkeep).toBe(1_200)
      expect(Number.isFinite(car.value)).toBe(true)
    }
    expect(g.character.loans[0].rate).toBe(0.07)
  })
})
