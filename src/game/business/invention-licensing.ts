// Nonexclusive manufacturing partners serve their own customer channels. Contracts
// pay royalties on simulated units sold, never an automatic signing windfall.
import { seeded } from '../assets'
import { recordEconomicActivity } from '../economy'
import { earnIncome, formatMoney, log, notice } from '../core'
import { personalInventions, readInventionIp } from '../inventor-state'
import { recordInventorAdoption } from '../inventor-career'
import { blocked } from '../special/common'
import type { Asset, GameState, Json, MenuNode } from '../types'
import { COUNTRIES, getCountry } from '../world'
import { expansionOf } from './dynamics'
import { ownerControls } from './board'
import { refreshValue, valuationOf } from './economy'
import { manageBlock } from './gate'
import { effectiveInventionUnitCost, inventionMarketDemand, inventionProductsOf, newInventionProduct, type InventionProduct } from './invention-products'
import type { PatentProtection } from './inventions'
import { bizOf, businessAssets, findBusiness, readBiz, runsIt } from './state'

export interface InventionLicenseSource { assetId: string; inventionId: string }
export interface ExternalInventionLicense {
  id: string; inventionId: string; partner: string; country: string; started: number; expires: number;
  lastYear: number; units: number; sales: number; royalties: number;
}
const PARTNERS = [
  { id: 'specialist', name: 'Specialist Manufacturer', share: .15, royalty: .12, capacity: .2 },
  { id: 'industrial', name: 'Industrial Consortium', share: .25, royalty: .08, capacity: 1 },
  { id: 'distribution', name: 'Mass-Market Manufacturing Partner', share: .35, royalty: .05, capacity: 3 },
] as const
const CAPACITY = { small: 2_000, middle: 25_000, big: 250_000, generational: 2_000_000 }
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const finite = (v: unknown, fallback = 0, max = 1e15): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback

/** Pure normalized view; contracts travel with the personal IP or company asset. */
export function externalInventionLicenses(a: Asset, year: number): ExternalInventionLicense[] {
  const raw = a.details.inventionLicenses
  const seen = new Set<string>()
  const channels = new Set<string>()
  return (Array.isArray(raw) ? raw : []).map(record).filter(d => {
    if (typeof d.id !== 'string' || seen.has(d.id) || typeof d.inventionId !== 'string' || !PARTNERS.some(p => p.id === d.partner) || !COUNTRIES.some(c => c.id === d.country)) return false
    const channel = `${d.inventionId}:${String(d.partner)}:${String(d.country)}`
    if (channels.has(channel)) return false
    seen.add(d.id); channels.add(channel); return true
  }).slice(-300).map(d => {
    const started = Math.floor(finite(d.started, year, year))
    return { id: String(d.id), inventionId: String(d.inventionId), partner: String(d.partner), country: String(d.country), started,
      expires: Math.floor(finite(d.expires, started, started + 5)), lastYear: Math.min(year - 1, typeof d.lastYear === 'number' && Number.isFinite(d.lastYear) ? Math.floor(d.lastYear) : started - 1),
      units: Math.floor(finite(d.units)), sales: finite(d.sales), royalties: finite(d.royalties) }
  })
}
function saveLicenses(a: Asset, contracts: ExternalInventionLicense[]): void { a.details.inventionLicenses = contracts as unknown as Json }

function sourceOf(g: GameState, source: InventionLicenseSource): { asset: Asset; product: InventionProduct; protections: PatentProtection[]; country: string; company: boolean } | null {
  const personal = personalInventions(g).find(a => a.id === source.assetId && a.id === source.inventionId)
  if (personal) {
    const ip = readInventionIp(personal)!
    if (ip.closedLoop) return null
    const product = newInventionProduct(personal.id, personal.name, ip.field, ip.kind, ip.created)
    Object.assign(product, { price: ip.unitPrice, unitCost: ip.unitCost, potential: ip.potential, protections: ip.protections, marketFit: ip.marketFit, reliability: ip.reliability, evidenceBased: ip.evidenceBased, inventor: ip.inventor, contributors: ip.contributors })
    return { asset: personal, product, protections: ip.protections, country: ip.country, company: false }
  }
  const company = findBusiness(g, source.assetId)
  if (!company) return null
  const b = readBiz(g, company), product = inventionProductsOf(b).find(p => p.id === source.inventionId && p.rights === 'owned')
  if (!product) return null // A licensee cannot sell somebody else's manufacturing rights.
  const patent = expansionOf(b).patents.find(p => p.id === product.id)
  const protections = patent?.protections ?? (patent && (patent.kind === 'early' || patent.kind === 'frontier') ? [{ country: b.countryId, filed: patent.launched, expires: patent.expires }] : product.protections)
  return { asset: company, product, protections, country: b.countryId, company: true }
}

export function externalInventionLicenseQuote(g: GameState, source: InventionLicenseSource, partnerId: string, year = g.year, marketCountry?: string) {
  const live = sourceOf(g, source), partner = PARTNERS.find(p => p.id === partnerId)
  if (!live || !partner) return null
  const country = marketCountry ?? live.country
  if (!COUNTRIES.some(c => c.id === country)) return null
  // The partner sets a competitive wholesale price; it does not inherit an
  // intentionally impossible retail price chosen for the player's own fab.
  const first = inventionMarketDemand(g, live.product, country, year, live.protections)
  const product = { ...live.product, price: Math.max(0, first.referencePrice * .8) }
  const market = inventionMarketDemand(g, product, country, year, live.protections)
  const demand = Math.floor(market.demand * partner.share)
  const capacity = Math.floor(CAPACITY[product.kind] * partner.capacity)
  const utilisation = .8 + seeded(`${product.ipId}|external-license|${partnerId}|${country}|${year}`).next() * .2
  // Manufacturing partners do not run a line at a loss just to create royalties.
  const units = product.price > effectiveInventionUnitCost(product) ? Math.max(0, Math.floor(Math.min(demand, capacity) * utilisation)) : 0
  const sales = Math.min(1e15, Math.round(units * product.price))
  const royalties = Math.round(sales * partner.royalty)
  const patent = live.protections.find(p => p.country === country && p.filed <= year && p.expires > year)
  const expires = Math.min(year + 5, patent?.expires ?? year)
  const existing = externalInventionLicenses(live.asset, g.year).find(c => c.inventionId === source.inventionId && c.partner === partnerId && c.expires > g.year)
  const reason = blocked(g, 18) ?? (live.company ? manageBlock(g, live.asset) ?? (!ownerControls(g, live.asset) && !runsIt(g, live.asset) ? 'Only the company CEO or a controlling owner can license its IP.' : null) : null) ?? (!patent ? 'An active patent in this licensing market is required.' : existing ? 'This partner already has an active contract.' : null)
  return { ...live, partner, country, units, sales, royalties, price: product.price, expires, patentRemaining: market.patentRemaining, reason }
}

export function signExternalInventionLicense(g: GameState, source: InventionLicenseSource, partnerId: string): boolean {
  const q = externalInventionLicenseQuote(g, source, partnerId)
  if (!q || q.reason) return false
  const contracts = externalInventionLicenses(q.asset, g.year).filter(c => !(c.inventionId === source.inventionId && c.partner === partnerId && c.expires <= g.year))
  contracts.push({ id: `${source.inventionId}:${partnerId}:${g.year}`, inventionId: source.inventionId, partner: partnerId, country: q.country, started: g.year, expires: q.expires,
    lastYear: g.year - 1, units: 0, sales: 0, royalties: 0 })
  saveLicenses(q.asset, contracts)
  notice(g, 'Manufacturing Licence Signed', `${q.partner.name} will fund its own manufacturing and serve a separate customer channel in ${getCountry(q.country).name}. You retain the IP. The contract pays ${Math.round(q.partner.royalty * 100)}% of actual partner sales, through ${q.expires - 1}; no signing income is created. Current estimated annual royalty ${formatMoney(q.royalties)} is not guaranteed and declines with the patent premium. ${q.company ? 'Royalties belong to the company and are taxable corporate income.' : 'Royalties go to your personal account and are taxable income.'}`, { emoji: '🤝' })
  return true
}

/** Fiscal settlement before company profit/tax; paid royalties are booked once. */
export function yearlyInventionLicenses(g: GameState): void {
  if (!g.character.alive) return
  const fiscal = g.year - 1
  for (const a of [...personalInventions(g), ...businessAssets(g)]) {
    if (!Array.isArray(a.details.inventionLicenses)) continue
    if (a.kind !== 'invention') {
      const b = readBiz(g, a)
      if (b.founded > fiscal || (b.last && b.last.year >= fiscal)) continue
    }
    const contracts = externalInventionLicenses(a, g.year)
    let total = 0
    const byCountry: Record<string, number> = {}
    for (const c of contracts) {
      if (c.lastYear >= fiscal || c.started > fiscal || c.expires <= fiscal) continue
      c.lastYear = fiscal
      const source = { assetId: a.id, inventionId: c.inventionId }
      const q = externalInventionLicenseQuote(g, source, c.partner, fiscal, c.country)
      if (!q || q.country !== c.country) continue
      // Signing eligibility (age/prison/active contract) does not cancel a paid
      // contract: only current IP ownership, term and sales determine settlement.
      const royalty = Math.min(1e15 - total, q.royalties)
      total += royalty; c.units += q.units; c.sales += q.sales; c.royalties += royalty
      recordInventorAdoption(g, c.inventionId, q.units, a.kind === 'invention' ? royalty : 0, q.product.evidenceBased, fiscal)
      if (q.units > 0) recordEconomicActivity(g, `licence:${c.id}:${fiscal}`, c.country, q.product.field, { innovation: Math.min(1, q.units / 50000) * (q.product.kind === 'generational' ? .2 : q.product.kind === 'big' ? .08 : .02) })
      byCountry[c.country] = (byCountry[c.country] ?? 0) + royalty
    }
    saveLicenses(a, contracts)
    if (total <= 0) continue
    if (a.kind === 'invention') earnIncome(g, total)
    else {
      const b = bizOf(g, a)
      b.cash += total; b.yearIncome += total
      a.details.inventionLicenseSettlement = { year: fiscal, byCountry }
      b.valuation = b.public && b.sharesOut > 0 ? Math.round(b.sharePrice * b.sharesOut) : valuationOf(b); refreshValue(a, b)
    }
    log(g, `${a.name} earned ${formatMoney(total)} from licensed manufacturing partners.`, 'good')
  }
}

/** Revenue-location weights for the ordinary corporate tax allocation. */
export function inventionLicenseBookedSales(a: Asset, fiscal: number): Record<string, number> {
  const d = record(a.details.inventionLicenseSettlement)
  if (d.year !== fiscal) return {}
  return Object.fromEntries(Object.entries(record(d.byCountry)).filter(([country]) => COUNTRIES.some(c => c.id === country)).map(([country, amount]) => [country, finite(amount)]))
}

/** Assignment transfers contracts with the IP; it never pays them out again. */
export function transferExternalInventionLicenses(g: GameState, from: Asset, to: Asset, inventionId: string): void {
  const moving = externalInventionLicenses(from, g.year).filter(c => c.inventionId === inventionId)
  if (!moving.length) return
  const existing = externalInventionLicenses(to, g.year)
  saveLicenses(to, [...existing.filter(c => !moving.some(m => m.id === c.id)), ...moving])
  saveLicenses(from, externalInventionLicenses(from, g.year).filter(c => c.inventionId !== inventionId))
}

export function externalInventionLicenseNodes(g: GameState, source: InventionLicenseSource): MenuNode[] {
  const live = sourceOf(g, source)
  if (!live) return []
  return [{ type: 'menu', id: `invention.external.${source.assetId}.${source.inventionId}`, label: 'License to Other Manufacturers', emoji: '🤝',
    subtitle: 'Retain ownership · partners fund their own fabs · actual-sales royalties',
    header: () => 'Three nonexclusive partners serve separate customer channels in the home patent market. Contracts last at most five years and cannot outlive the patent. Partners fund production themselves; demand, competition, theft and patent age affect actual royalties. Signing creates no free cash.',
    children: gg => PARTNERS.map(partner => {
      const q = externalInventionLicenseQuote(gg, source, partner.id)
      const existing = externalInventionLicenses(live.asset, gg.year).find(c => c.inventionId === source.inventionId && c.partner === partner.id && c.expires > gg.year)
      return { type: 'action', id: `invention.external.sign.${source.assetId}.${source.inventionId}.${partner.id}`, label: partner.name, emoji: '🤝',
        subtitle: existing ? `Active through ${existing.expires - 1} · royalties earned ${formatMoney(existing.royalties)}` : `${Math.round(partner.royalty * 100)}% royalty · estimated ${formatMoney(q?.royalties ?? 0)}/year`,
        disabledReason: ggg => externalInventionLicenseQuote(ggg, source, partner.id)?.reason ?? (!sourceOf(ggg, source) ? 'You no longer own this IP.' : null),
        confirm: ggg => { const current = externalInventionLicenseQuote(ggg, source, partner.id); return current ? `License ${current.product.name} nonexclusively to ${partner.name}, retaining ownership? Royalties follow actual partner sales until ${current.expires - 1}; you do not need to build its fabs.` : 'This IP is no longer available.' },
        run: ggg => { signExternalInventionLicense(ggg, source, partner.id) } }
    }) }]
}
