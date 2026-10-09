import { describe, expect, it } from 'vitest'
import { assignPersonalInvention } from '../src/game/inventor'
import { readInventionIp } from '../src/game/inventor-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { becomeCeo } from '../src/game/business/career'
import { expansionOf, saveExpansion } from '../src/game/business/dynamics'
import { simulateStudioYear } from '../src/game/business/gamestudio'
import {
  externalInventionLicenseQuote,
  externalInventionLicenses,
  inventionLicenseBookedSales,
  signExternalInventionLicense,
  yearlyInventionLicenses,
  type InventionLicenseSource,
} from '../src/game/business/invention-licensing'
import { inventionProductsOf, newInventionProduct, saveInventionProducts } from '../src/game/business/invention-products'
import { bizOf, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { corporateTax } from '../src/game/data/markets'
import type { InventionField } from '../src/game/inventor-data'
import type { InventionTier, PatentProtection } from '../src/game/business/inventions'
import type { Asset, GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

function game(year = 2026): GameState {
  const g = makeTestGame(771, { age: 35, money: 5_000_000, countryId: 'us', talents: ['Inventor'] })
  g.year = year
  return g
}

function personalIp(
  g: GameState,
  opts: { id?: string; kind?: InventionTier; field?: InventionField; protections?: PatentProtection[] } = {},
): Asset {
  const id = opts.id ?? 'ip-personal'
  const kind = opts.kind ?? 'big'
  const field = opts.field ?? 'energy'
  const protections = opts.protections ?? [{ country: 'us', filed: g.year, expires: g.year + 20 }]
  const spec = kind === 'small' ? { price: 100, cost: 55, potential: 300 }
    : kind === 'middle' ? { price: 350, cost: 200, potential: 2_000 }
      : kind === 'big' ? { price: 1_500, cost: 900, potential: 10_000 }
        : { price: 5_000, cost: 3_200, potential: 50_000 }
  const a: Asset = {
    id,
    kind: 'invention',
    name: `Patent ${id}`,
    emoji: '💡',
    purchasePrice: 50_000,
    value: 25_000,
    condition: 100,
    purchasedAge: g.character.age,
    upkeep: 0,
    details: {
      inventorIp: {
        v: 1,
        topic: 'heat-recovery',
        field,
        kind,
        created: g.year,
        country: 'us',
        budget: 50_000,
        unitPrice: spec.price,
        unitCost: spec.cost,
        potential: spec.potential,
        protections,
      } as unknown as Json,
    },
  }
  g.assets.push(a)
  expect(readInventionIp(a)).not.toBeNull()
  return a
}

function companyWithIp(
  g: GameState,
  opts: { id?: string; industry?: 'energy' | 'gameStudio' | 'aiLab'; kind?: InventionTier; protections?: PatentProtection[]; cash?: number } = {},
): { a: Asset; b: BizState; source: InventionLicenseSource } {
  const id = opts.id ?? 'ip-company'
  const industry = opts.industry ?? 'energy'
  const kind = opts.kind ?? 'big'
  const protections = opts.protections ?? [{ country: 'us', filed: g.year, expires: g.year + 20 }]
  const a = createBusinessAsset(g, 'Licence Works', newBiz(g, industry, 'us', 'Chicago', {
    founded: g.year - 2,
    cash: opts.cash ?? 100_000_000,
    production: 0,
    ownerSalary: 0,
  }), 1_000_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  becomeCeo(g, a, b)
  const p = newInventionProduct(id, `Patent ${id}`, industry === 'gameStudio' || industry === 'aiLab' ? 'computing' : 'energy', kind, g.year)
  p.protections = protections.map(x => ({ ...x }))
  p.fabCapacity = 0
  p.production = 0
  saveInventionProducts(b, [p])
  const x = expansionOf(b)
  x.patents.push({ id, name: p.name, kind, launched: g.year, expires: protections[0]?.expires ?? g.year, ownerId: a.id, demand: 0, efficiency: 0, protections: protections.map(row => ({ ...row })) })
  saveExpansion(b, x)
  return { a, b, source: { assetId: a.id, inventionId: id } }
}

function nextFiscal(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
}

describe('external invention licensing', () => {
  it('normalizes duplicated manufacturing channels without duplicating their royalty payout', () => {
    const g = game(), ip = personalIp(g), source = { assetId: ip.id, inventionId: ip.id }
    expect(signExternalInventionLicense(g, source, 'specialist')).toBe(true)
    const contract = externalInventionLicenses(ip, g.year)[0]
    ip.details.inventionLicenses = [contract, { ...contract, id: 'duplicate-channel' }] as unknown as Json
    expect(externalInventionLicenses(ip, g.year)).toHaveLength(1)
    const money = g.character.money
    nextFiscal(g)
    const due = externalInventionLicenseQuote(g, source, 'specialist', g.year - 1)!.royalties
    yearlyInventionLicenses(g)
    expect(g.character.money).toBe(money + due)
    expect(externalInventionLicenses(ip, g.year)).toHaveLength(1)
  })

  it('signs a personal-IP contract without creating cash, then pays and taxes one fiscal royalty exactly once', () => {
    const g = game(), ip = personalIp(g), source = { assetId: ip.id, inventionId: ip.id }
    const beforeQuote = JSON.stringify(g)
    const quote = externalInventionLicenseQuote(g, source, 'specialist')!
    expect(quote.reason).toBeNull()
    expect(quote.royalties).toBeGreaterThan(0)
    expect(JSON.stringify(g)).toBe(beforeQuote)

    const money = g.character.money
    expect(signExternalInventionLicense(g, source, 'specialist')).toBe(true)
    expect(g.character.money).toBe(money)
    expect(g.flags.taxableIncome ?? 0).toBe(0)
    expect(externalInventionLicenses(ip, g.year)).toHaveLength(1)

    // The contract starts this year; the first call only closes the prior fiscal year.
    yearlyInventionLicenses(g)
    expect(g.character.money).toBe(money)
    nextFiscal(g)
    const due = externalInventionLicenseQuote(g, source, 'specialist', g.year - 1)!.royalties
    yearlyInventionLicenses(g)
    expect(g.character.money).toBe(money + due)
    expect(g.flags.taxableIncome).toBe(due)
    expect(externalInventionLicenses(ip, g.year)[0]).toMatchObject({ lastYear: g.year - 1, royalties: due })

    const settled = JSON.stringify(g)
    yearlyInventionLicenses(g)
    expect(JSON.stringify(g)).toBe(settled)
  })

  it('revalidates prison, duplicate, expiry, stale assets and actual IP ownership', () => {
    const g = game(), ip = personalIp(g), source = { assetId: ip.id, inventionId: ip.id }
    g.character.prison = { name: 'Prison', security: 'medium', crime: 'Fraud', sentenceYears: 2, yearsServed: 0, respect: 0, appealed: false, escapeAttempts: 0 }
    const jailed = JSON.stringify(g)
    expect(signExternalInventionLicense(g, source, 'specialist')).toBe(false)
    expect(JSON.stringify(g)).toBe(jailed)
    g.character.prison = null

    expect(signExternalInventionLicense(g, source, 'specialist')).toBe(true)
    const once = JSON.stringify(ip.details.inventionLicenses)
    expect(signExternalInventionLicense(g, source, 'specialist')).toBe(false)
    expect(JSON.stringify(ip.details.inventionLicenses)).toBe(once)

    const { a, b, source: companySource } = companyWithIp(g, { id: 'borrowed' })
    const borrowed = inventionProductsOf(b)[0]
    borrowed.rights = 'license'
    saveInventionProducts(b, [borrowed])
    expect(externalInventionLicenseQuote(g, companySource, 'industrial')).toBeNull()
    expect(signExternalInventionLicense(g, companySource, 'industrial')).toBe(false)

    g.assets = g.assets.filter(asset => asset.id !== a.id && asset.id !== ip.id)
    expect(signExternalInventionLicense(g, source, 'industrial')).toBe(false)
    expect(signExternalInventionLicense(g, companySource, 'industrial')).toBe(false)

    const expired = personalIp(g, { id: 'expired', protections: [{ country: 'us', filed: 2000, expires: g.year }] })
    const expiredSource = { assetId: expired.id, inventionId: expired.id }
    expect(externalInventionLicenseQuote(g, expiredSource, 'specialist')?.reason).toMatch(/active patent/i)
    expect(signExternalInventionLicense(g, expiredSource, 'specialist')).toBe(false)
  })

  it('pays company-owned IP into company cash without a fab or personal income, then books corporate tax once', () => {
    const g = game(), { a, b, source } = companyWithIp(g)
    expect(inventionProductsOf(b)[0].fabCapacity).toBe(0)
    const quote = externalInventionLicenseQuote(g, source, 'industrial')!
    expect(quote.royalties).toBeGreaterThan(0)
    const personal = g.character.money, cash = b.cash
    expect(signExternalInventionLicense(g, source, 'industrial')).toBe(true)
    expect(g.character.money).toBe(personal)
    expect(b.cash).toBe(cash)

    nextFiscal(g)
    const due = externalInventionLicenseQuote(g, source, 'industrial', g.year - 1)!.royalties
    yearlyInventionLicenses(g)
    expect(b.cash).toBe(cash + due)
    expect(b.yearIncome).toBe(due)
    expect(g.character.money).toBe(personal)
    expect(g.flags.taxableIncome ?? 0).toBe(0)
    expect(inventionLicenseBookedSales(a, g.year - 1)).toEqual({ us: due })

    yearlyBusinessImpl(g)
    expect(b.last?.otherIncome).toBe(due)
    expect(b.last?.corpTax).toBe(corporateTax('us', b.last?.pbt ?? 0))
    const settled = { cash: b.cash, money: g.character.money, history: JSON.stringify(b.history), contracts: JSON.stringify(a.details.inventionLicenses) }
    yearlyInventionLicenses(g)
    yearlyBusinessImpl(g)
    expect({ cash: b.cash, money: g.character.money, history: JSON.stringify(b.history), contracts: JSON.stringify(a.details.inventionLicenses) }).toEqual(settled)
  })

  it('moves existing contracts with an assigned patent and never pays both the former personal owner and company', () => {
    const g = game(), ip = personalIp(g, { id: 'transfer-ip' }), source = { assetId: ip.id, inventionId: ip.id }
    expect(signExternalInventionLicense(g, source, 'distribution')).toBe(true)
    const contract = externalInventionLicenses(ip, g.year)[0]
    const { a, b } = companyWithIp(g, { id: 'placeholder' })
    saveInventionProducts(b, [])
    saveExpansion(b, { ...expansionOf(b), patents: [] })

    expect(assignPersonalInvention(g, ip.id, a.id)).toBe(true)
    expect(g.assets.some(asset => asset.id === ip.id)).toBe(false)
    expect(externalInventionLicenses(a, g.year)).toEqual([contract])
    expect(inventionProductsOf(b)[0]).toMatchObject({ id: ip.id, rights: 'owned', fabCapacity: 0 })

    const personal = g.character.money, cash = b.cash
    nextFiscal(g)
    const companySource = { assetId: a.id, inventionId: ip.id }
    const due = externalInventionLicenseQuote(g, companySource, 'distribution', g.year - 1)!.royalties
    yearlyInventionLicenses(g)
    expect(b.cash).toBe(cash + due)
    expect(g.character.money).toBe(personal)
    expect(g.flags.taxableIncome ?? 0).toBe(0)
    expect(externalInventionLicenses(a, g.year)[0].royalties).toBe(due)
  })

  it('declines as a territorial patent approaches expiry', () => {
    const g = game(2026), ip = personalIp(g, { kind: 'generational', protections: [{ country: 'us', filed: 2026, expires: 2046 }] })
    const source = { assetId: ip.id, inventionId: ip.id }
    const launch = externalInventionLicenseQuote(g, source, 'industrial', 2026)!
    const late = externalInventionLicenseQuote(g, source, 'industrial', 2045)!
    expect(launch.patentRemaining).toBe(20)
    expect(late.patentRemaining).toBe(1)
    expect(launch.royalties).toBeGreaterThan(late.royalties)
    expect(late.royalties).toBeGreaterThanOrEqual(0)
  })

  it('attributes a foreign-market contract to that country for corporate tax, without a second settlement', () => {
    const g = game(), protections = [
      { country: 'us', filed: 2026, expires: 2046 },
      { country: 'jp', filed: 2026, expires: 2046 },
    ]
    const { a, b, source } = companyWithIp(g, { kind: 'generational', protections })
    a.details.inventionLicenses = [{ id: `${source.inventionId}:industrial:${g.year}`, inventionId: source.inventionId, partner: 'industrial', country: 'jp', started: g.year, expires: g.year + 5, lastYear: g.year - 1, units: 0, sales: 0, royalties: 0 }] as unknown as Json
    b.openFraction = 0
    nextFiscal(g)
    const due = externalInventionLicenseQuote(g, source, 'industrial', g.year - 1, 'jp')!.royalties
    yearlyInventionLicenses(g)
    expect(inventionLicenseBookedSales(a, g.year - 1)).toEqual({ jp: due })
    const cashAfterSettlement = b.cash
    yearlyBusinessImpl(g)
    expect(b.last!.pbt).toBeGreaterThan(0)
    expect(b.last!.corpTax).toBe(corporateTax('jp', b.last!.pbt))
    expect(externalInventionLicenses(a, g.year)[0]).toMatchObject({ lastYear: g.year - 1, royalties: due })
    yearlyInventionLicenses(g)
    expect(b.cash).toBeLessThanOrEqual(cashAfterSettlement)
    expect(externalInventionLicenses(a, g.year)[0].royalties).toBe(due)
  })

  it.each(['gameStudio', 'aiLab'] as const)('allocates foreign royalties for a %s through its specialty fiscal simulator', (industry) => {
    const g = game(), protections = [
      { country: 'us', filed: 2026, expires: 2046 },
      { country: 'jp', filed: 2026, expires: 2046 },
    ]
    const { a, b, source } = companyWithIp(g, { id: `${industry}-ip`, industry, kind: 'generational', protections })
    a.details.inventionLicenses = [{ id: `${source.inventionId}:industrial:${g.year}`, inventionId: source.inventionId, partner: 'industrial', country: 'jp', started: g.year, expires: g.year + 5, lastYear: g.year - 1, units: 0, sales: 0, royalties: 0 }] as unknown as Json
    b.openFraction = 0
    nextFiscal(g)
    yearlyInventionLicenses(g)
    const due = inventionLicenseBookedSales(a, g.year - 1).jp
    expect(due).toBeGreaterThan(0)
    yearlyBusinessImpl(g)
    expect(b.last!.otherIncome).toBe(due)
    expect(b.last!.pbt).toBeGreaterThan(0)
    expect(Math.abs(b.last!.corpTax - corporateTax('jp', b.last!.pbt))).toBeLessThanOrEqual(1)
    const settled = { cash: b.cash, history: JSON.stringify(b.history), licenses: JSON.stringify(a.details.inventionLicenses) }
    yearlyInventionLicenses(g)
    yearlyBusinessImpl(g)
    expect({ cash: b.cash, history: JSON.stringify(b.history), licenses: JSON.stringify(a.details.inventionLicenses) }).toEqual(settled)
  })

  it('does not count a prebooked studio royalty twice when deciding the owner salary', () => {
    const g = game(), { a, b } = companyWithIp(g, { industry: 'gameStudio', id: 'studio-ip', cash: 0 })
    const royalty = 10_000_000
    b.cash = royalty
    b.yearIncome = royalty
    b.ownerSalary = royalty * 2
    const result = simulateStudioYear(g, a, b, g.year - 1, b.ownerSalary)
    expect(result.stmt.ownerPay).toBeLessThan(royalty)
    expect(b.cash).toBeGreaterThanOrEqual(0)
    expect(result.stmt.otherIncome).toBe(royalty)
  })
})
