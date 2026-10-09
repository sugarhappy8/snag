import { describe, expect, it } from 'vitest'
import { beginLandlordLease, hireRentalManager, landlordMenu, landlordView, listRental, rentalMarket, repairRental, setRentalMaintenance, setRentalRent, yearlyLandlord } from '../src/game/landlord'
import type { Asset, GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

function rental(occupied = true) {
  const g = makeTestGame(5, { age: 35, money: 100_000 })
  const a: Asset = { id: 'rental1', kind: 'house', name: 'Rental Home', emoji: '🏠', purchasePrice: 300_000, value: 300_000, condition: 90, purchasedAge: 30, upkeep: 0, details: { countryId: 'us', tenant: 'Pat Doe', tenantRisk: 0, tenantLate: 0 } }
  if (occupied) a.rentedOutFor = rentalMarket(a)
  g.assets.push(a)
  if (occupied) beginLandlordLease(g, a)
  return { g, a }
}

describe('landlord operations', () => {
  it('collects net rental receipts once, with service and manager costs visible', () => {
    const { g, a } = rental()
    hireRentalManager(g, a.id, 90)
    const before = g.character.money
    g.year++
    yearlyLandlord(g)
    const p = landlordView(a)
    expect(p.lastGross).toBeGreaterThan(0)
    expect(p.lastExpenses).toBeGreaterThanOrEqual(Math.round(p.lastGross * .12))
    expect(p.lastNet).toBe(p.lastGross - p.lastExpenses)
    expect(g.flags.taxableIncome).toBe(Math.max(0, p.lastNet))
    expect(g.character.money).toBeGreaterThan(before)
    const saved = JSON.stringify(g)
    expect(yearlyLandlord(g)).toBe(0)
    expect(JSON.stringify(g)).toBe(saved)
  })

  it('does not silently levy new service costs on the first legacy-save settlement', () => {
    const { g, a } = rental()
    delete a.details.landlord
    a.rentedOutFor = 24_000
    g.year++
    yearlyLandlord(g)
    expect(landlordView(a).lastGross).toBe(24_000)
    expect(landlordView(a).lastExpenses).toBe(0)
    expect(g.flags.taxableIncome).toBe(24_000)
    g.year++
    yearlyLandlord(g)
    expect(landlordView(a).lastExpenses).toBeGreaterThan(0)
  })

  it('respects a fixed lease and renews rent only once per year', () => {
    const { g, a } = rental()
    const original = a.rentedOutFor!
    setRentalRent(g, a.id, original * 1.2)
    expect(a.rentedOutFor).toBe(original)
    g.year += 2
    setRentalRent(g, a.id, original * 1.2)
    expect(a.rentedOutFor).toBe(Math.round(original * 1.2))
    expect(landlordView(a).leaseUntil).toBe(g.year + 2)
    setRentalRent(g, a.id, original * .85)
    expect(a.rentedOutFor).toBe(Math.round(original * 1.2))
  })

  it('charges manual repairs once, restores condition, and rejects stale actions', () => {
    const { g, a } = rental()
    const p = landlordView(a)
    p.issue = 'failed plumbing'; p.repairCost = 1_500
    a.details.landlord = p as unknown as Json
    const before = g.character.money, condition = a.condition
    repairRental(g, a.id)
    repairRental(g, a.id)
    expect(g.character.money).toBe(before - 1_500)
    expect(a.condition).toBe(condition + 5)
    expect(landlordView(a).issue).toBe('')
    expect(landlordView(a).repairCost).toBe(0)
    const saved = structuredClone(a)
    g.assets = []
    setRentalMaintenance(g, a.id, 'defer')
    hireRentalManager(g, a.id, 90)
    expect(a).toEqual(saved)
  })

  it('never rents the primary home or allows children to change lease policies', () => {
    const { g, a } = rental(false)
    const original = structuredClone(a)
    g.character.residence = { status: 'owned', assetId: a.id }
    listRental(g, a.id); hireRentalManager(g, a.id, 90); setRentalRent(g, a.id, rentalMarket(a))
    expect(a).toEqual(original)
    g.character.residence = { status: 'parents' }; g.character.age = 13
    setRentalMaintenance(g, a.id, 'defer'); setRentalRent(g, a.id, rentalMarket(a)); hireRentalManager(g, a.id, 90)
    expect(a).toEqual(original)
  })

  it('pays no vacant-property management fee and only fills advertised homes', () => {
    const { g, a } = rental(false)
    hireRentalManager(g, a.id, 90)
    g.year++
    expect(yearlyLandlord(g)).toBe(0)
    expect(a.rentedOutFor).toBeUndefined()
    expect(landlordView(a).lastExpenses).toBe(0)
    let filled = false
    for (let i = 0; i < 20; i++) {
      const x = rental(false)
      x.g.lifeId = `landlord-fill-${i}`
      hireRentalManager(x.g, x.a.id, 90); listRental(x.g, x.a.id); x.g.year++
      yearlyLandlord(x.g)
      if (x.a.rentedOutFor) {
        filled = true
        expect(landlordView(x.a).lastGross).toBeLessThan(x.a.rentedOutFor)
        expect(landlordView(x.a).lastGross).toBeGreaterThan(0)
        expect(x.a.details.tenantTrait).toMatch(/screened/)
        break
      }
    }
    expect(filled).toBe(true)
  })

  it('does not let a manager fund a large repair from hypothetical future rent', () => {
    const { g, a } = rental()
    hireRentalManager(g, a.id, 90)
    const p = landlordView(a)
    p.issue = 'a leaking roof'; p.repairCost = 10_000
    a.details.landlord = p as unknown as Json
    g.character.money = 0; g.year++
    yearlyLandlord(g)
    expect(landlordView(a).issue).toBe('a leaking roof')
    expect(landlordView(a).lastExpenses).toBeLessThan(10_000)
  })

  it('keeps menus and malformed-save readers deterministic and mutation-free', () => {
    const { g, a } = rental()
    a.details.landlord = { askingRent: NaN, managerFee: Infinity, satisfaction: -5, lastYear: 'bad', issue: 9 } as unknown as Json
    const before = JSON.stringify(g)
    const p = landlordView(a)
    expect(p.askingRent).toBe(a.rentedOutFor)
    expect(p.managerFee).toBe(0)
    expect(p.satisfaction).toBe(0)
    expect(p.lastYear).toBe(-1)
    const menu = landlordMenu(a)
    for (const n of menu.children(g)) {
      n.visible?.(g)
      if (n.type === 'info' || n.type === 'heading') continue
      if (typeof n.subtitle === 'function') n.subtitle(g)
      n.disabledReason?.(g)
    }
    expect(JSON.stringify(g)).toBe(before)
    setRentalRent(g, a.id, Infinity); setRentalRent(g, a.id, -1)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('round-trips leases, managers, arrears and its settlement guard through JSON saves', () => {
    const { g, a } = rental()
    hireRentalManager(g, a.id, 65); setRentalMaintenance(g, a.id, 'proactive')
    g.year++; yearlyLandlord(g)
    const restored = JSON.parse(JSON.stringify(g)) as GameState
    expect(landlordView(restored.assets[0])).toEqual(landlordView(a))
    const before = JSON.stringify(restored)
    yearlyLandlord(restored)
    expect(JSON.stringify(restored)).toBe(before)
  })
})
