// Concrete invention SKUs: manufacture units, carry inventory, and sell at a
// product-specific price. Planning is pure; corporate accounting books it once.
import { earnIncome, formatMoney, notice } from '../core'
import { seeded } from '../assets'
import { readInventionIp } from '../inventor-state'
import { isInventionField, type InventionField, PRODUCT_SPECS } from '../inventor-data'
import { inventionLeakFactor } from '../invention-impact'
import type { GameState, Json, MenuNode } from '../types'
import { isResearchKind, isInventionTier, nationalPatentLaw, type InventionTier, type PatentProtection } from './inventions'
import { expansionOf, nationalMarket, protectedIn } from './dynamics'
import { manageBlock } from './gate'
import { boardAllows } from './board-vote'
import { localEcon, refreshValue, valuationOf, yearFixed } from './economy'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
export { inventionFabValue, inventionInventoryValue } from './invention-fabs'

export interface InventionProduct { id: string; ipId: string; name: string; field: InventionField; kind: InventionTier; price: number; unitCost: number; potential: number; production: number; inventory: number; rights: 'owned' | 'license'; royalty: number; expires: number; protections: PatentProtection[]; started: number; lastYear: number; sold: number; revenue: number; costs: number; fabCapacity?: number; fabInvested?: number; upgradeLevel?: number; upgradeInvested?: number }
export interface InventionProductYear { revenue: number; cogs: number; royalties: number; wages: number; staffUsed: number; units: number; rows: { id: string; produced: number; sold: number; inventoryEnd: number; revenue: number; cogs: number; royalties: number; wages: number }[] }
export interface InventionDemandQuote { demand: number; patentRemaining: number; patentYears: number; referencePrice: number; monopoly: number; launchDemand: number }
/** Workload, not free labour: larger inventions take more staff time per unit. */
const UNITS_PER_STAFF: Record<InventionTier, number> = { small: 10_000, middle: 3_000, big: 1_000, generational: 250 }
const LAUNCH_DEMAND: Record<InventionTier, number> = { small: 5_000, middle: 100_000, big: 2_000_000, generational: 30_000_000 }
const MONOPOLY_PRICE: Record<InventionTier, number> = { small: 1, middle: 2, big: 3, generational: 5 }
const FAB_UNIT_CAPEX: Record<InventionTier, number> = { small: 12, middle: 70, big: 400, generational: 2_000 }
const FAB_SETUP: Record<InventionTier, number> = { small: 25_000, middle: 150_000, big: 1_000_000, generational: 10_000_000 }
/** Numerical ceilings only, not market-price rules. Actual sales fall to zero at absurd prices. */
export const MAX_INVENTION_PRICE = 1e12
export const MAX_INVENTION_OUTPUT = 1e9
const MAX_UPGRADES = 20
const rec = (value: Json): Record<string, Json> => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const num = (value: Json | undefined, fallback = 0, max = 1e15): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback
function affordableUnits(limit: number, cash: number, unitCost: number, wage: number, rate: number): number {
  const ceiling = Math.max(0, Math.floor(Math.min(limit, cash / Math.max(.01, unitCost + wage / rate))))
  const charge = (units: number) => Math.round(units * unitCost) + Math.round(units / rate * wage)
  if (charge(ceiling) <= cash) return ceiling
  // Independent rounded material/payroll ledger lines must also fit cash.
  // Binary search handles sub-cent payroll without a long decrement loop.
  let low = 0, high = ceiling
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (charge(middle) <= cash) low = middle
    else high = middle - 1
  }
  return low
}

export function inventionProductsOf(b: BizState): InventionProduct[] {
  const ids = new Set<string>()
  return (Array.isArray(b.inventionProducts) ? b.inventionProducts : []).map(rec).filter(d => {
    if (typeof d.id !== 'string' || !d.id || ids.has(d.id) || typeof d.name !== 'string' || !isInventionField(d.field) || !isResearchKind(d.kind) || !isInventionTier(d.kind)) return false
    ids.add(d.id)
    return true
  }).map(d => ({
    id: String(d.id), ipId: typeof d.ipId === 'string' ? d.ipId : String(d.id), name: String(d.name), field: d.field as InventionField, kind: d.kind as InventionTier,
    price: num(d.price, PRODUCT_SPECS[d.kind as InventionTier].price, MAX_INVENTION_PRICE), unitCost: num(d.unitCost, PRODUCT_SPECS[d.kind as InventionTier].cost, 1e9), potential: num(d.potential, 0, MAX_INVENTION_OUTPUT), production: Math.floor(num(d.production, 100, MAX_INVENTION_OUTPUT)), inventory: Math.floor(num(d.inventory, 0, MAX_INVENTION_OUTPUT)), rights: d.rights === 'license' ? 'license' : 'owned', royalty: num(d.royalty, 0, .5), expires: num(d.expires),
    protections: Array.isArray(d.protections) ? d.protections.map(rec).filter(row => typeof row.country === 'string').map(row => ({ country: String(row.country), filed: num(row.filed), expires: num(row.expires) })) : (expansionOf(b).patents.find(p => p.id === d.id)?.protections ?? []).map(row => ({ ...row })),
    started: num(d.started), lastYear: typeof d.lastYear === 'number' && Number.isFinite(d.lastYear) ? d.lastYear : -1, sold: num(d.sold), revenue: num(d.revenue), costs: num(d.costs),
    // Rows predating fabs retain only the old 100-unit starter operation. A new
    // product carries explicit zero capacity and must pay to build a factory.
    fabCapacity: Math.floor(num(d.fabCapacity, Object.hasOwn(d, 'fabCapacity') ? 0 : 100, MAX_INVENTION_OUTPUT)),
    fabInvested: num(d.fabInvested), upgradeLevel: Math.floor(num(d.upgradeLevel, 0, MAX_UPGRADES)), upgradeInvested: num(d.upgradeInvested),
  }))
}
export function saveInventionProducts(b: BizState, products: InventionProduct[]): void { b.inventionProducts = products as unknown as Json }
export function newInventionProduct(id: string, name: string, field: InventionField, kind: InventionTier, year: number): InventionProduct {
  const spec = PRODUCT_SPECS[kind]
  return { id, ipId: id, name, field, kind, price: spec.price, unitCost: spec.cost, potential: spec.demand, production: 100, inventory: 0, rights: 'owned', royalty: 0, expires: 0, protections: [], started: year, lastYear: -1, sold: 0, revenue: 0, costs: 0, fabCapacity: 0, fabInvested: 0, upgradeLevel: 0, upgradeInvested: 0 }
}

export function effectiveInventionUnitCost(p: InventionProduct): number {
  const cost = Number.isFinite(p.unitCost) ? Math.max(0, Math.min(1e9, p.unitCost)) : PRODUCT_SPECS[p.kind].cost
  const level = Number.isFinite(p.upgradeLevel) ? Math.max(0, Math.min(MAX_UPGRADES, p.upgradeLevel ?? 0)) : 0
  return Math.round(cost * Math.pow(.97, level) * 100) / 100
}
export function inventionFabCapacity(p: InventionProduct): number {
  const capacity = p.fabCapacity === undefined ? 100 : Number.isFinite(p.fabCapacity) ? Math.max(0, p.fabCapacity) : 0
  const level = Number.isFinite(p.upgradeLevel) ? Math.max(0, Math.min(MAX_UPGRADES, p.upgradeLevel ?? 0)) : 0
  return Math.min(MAX_INVENTION_OUTPUT, Math.floor(capacity * (1 + .1 * level)))
}

/** Shared national economics for player fabs and external manufacturing licences. */
export function inventionMarketDemand(g: GameState, p: InventionProduct, country: string, year: number, protections: PatentProtection[], industry: string = p.field): InventionDemandQuote {
  const protection = protections.find(t => t.country === country && t.filed <= year)
  const origin = Math.min(p.started > 0 ? p.started : year, ...protections.filter(t => t.filed > 0).map(t => t.filed))
  const patentYears = protection ? Math.max(1, Math.min(30, protection.expires - origin)) : nationalPatentLaw(country, year).term
  const patentRemaining = protection ? Math.max(0, Math.min(patentYears, protection.expires - year)) : 0
  const remaining = patentRemaining / patentYears
  const enforcement = nationalPatentLaw(country, year).enforcement
  const monopoly = Math.pow(remaining, .7) * enforcement * inventionLeakFactor(g, p.ipId, year)
  const upgrade = Number.isFinite(p.upgradeLevel) ? Math.max(0, Math.min(MAX_UPGRADES, p.upgradeLevel ?? 0)) : 0
  const referencePrice = PRODUCT_SPECS[p.kind].price * (1 + .035 * upgrade) * (1 + MONOPOLY_PRICE[p.kind] * monopoly)
  const launchDemand = Math.max(Number.isFinite(p.potential) ? Math.min(MAX_INVENTION_OUTPUT, Math.max(0, p.potential)) : 0, LAUNCH_DEMAND[p.kind])
  // Copying and competing alternatives grow during the patent, not overnight
  // on expiry. Keeping an old monopoly price eventually destroys most sales.
  const protectedDemand = .025 + .975 * Math.pow(remaining, 1.7) * enforcement * inventionLeakFactor(g, p.ipId, year)
  const price = Number.isFinite(p.price) ? Math.min(MAX_INVENTION_PRICE, Math.max(0, p.price)) : PRODUCT_SPECS[p.kind].price
  const ratio = price / Math.max(.01, referencePrice)
  const elasticity = ratio <= 1 ? Math.min(4, Math.pow(Math.max(.1, ratio), -.65)) : Math.pow(ratio, -(1.4 + 1.6 * (1 - monopoly)))
  const noise = .94 + seeded(`${p.id}|sku|${country}|${year}`).next() * .12
  const raw = launchDemand * (1 + .08 * upgrade) * noise * nationalMarket(g, industry, country, year).demand * protectedDemand * elasticity
  return { demand: Math.floor(Math.max(0, Math.min(MAX_INVENTION_OUTPUT, raw))), patentRemaining, patentYears, referencePrice, monopoly, launchDemand }
}

export function inventionDemandQuote(g: GameState, b: BizState, p: InventionProduct, year: number): InventionDemandQuote {
  const ipAsset = g.assets.find(a => a.id === p.ipId && a.kind === 'invention'), ip = ipAsset ? readInventionIp(ipAsset) : null
  const patent = expansionOf(b).patents.find(row => row.id === p.id)
  const protections = p.rights === 'license' ? ip?.protections ?? p.protections : patent?.protections ?? p.protections
  // Older worldwide grants have no national records; preserve the original
  // grant period while passing through the same time-decay/price model.
  const territorial = !protections.length && patent && !isInventionTier(patent.kind) && protectedIn(patent, b.countryId, year)
    ? [{ country: b.countryId, filed: patent.launched, expires: patent.expires }] : protections
  return inventionMarketDemand(g, p, b.countryId, year, territorial, b.industry)
}

function productNow(g: GameState, assetId: string, id: string) {
  const a = findBusiness(g, assetId)
  const b = a ? readBiz(g, a) : null
  const p = b ? inventionProductsOf(b).find(p => p.id === id) : null
  const reason = !a || !b ? 'This company is no longer yours.' : manageBlock(g, a)
    ?? (!p ? 'This invention product is no longer available.' : /^(bank|onlineBank|investmentFirm)$/.test(b.industry) ? 'Financial institutions cannot manufacture products.' : p.rights === 'license' && p.expires <= g.year ? 'Renew this product licence before investing or planning production.' : null)
  return { a, b, p, reason }
}

export function inventionFabQuote(g: GameState, assetId: string, id: string, targetCapacity: number) {
  const now = productNow(g, assetId, id), p = now.p
  const currentCapacity = p?.fabCapacity ?? 0
  const valid = Number.isFinite(targetCapacity) && Number.isInteger(targetCapacity) && targetCapacity >= 0 && targetCapacity <= MAX_INVENTION_OUTPUT
  const additionalCapacity = valid ? Math.max(0, targetCapacity - currentCapacity) : 0
  const setup = p && !(p.fabInvested! > 0) ? FAB_SETUP[p.kind] : 0
  const cost = p && additionalCapacity > 0 ? setup + additionalCapacity * FAB_UNIT_CAPEX[p.kind] : 0
  const maxCapacity = p && now.b ? Math.min(MAX_INVENTION_OUTPUT, currentCapacity + Math.max(0, Math.floor((now.b.cash - setup) / FAB_UNIT_CAPEX[p.kind]))) : currentCapacity
  const reason = now.reason ?? (!valid ? 'Choose a finite whole-unit factory capacity.' : !additionalCapacity ? 'That capacity is already built; choose a larger target.' : now.b!.cash < cost ? `The company needs ${formatMoney(cost)} in cash for this factory.` : null)
  return { currentCapacity, targetCapacity, additionalCapacity, cost, maxCapacity, reason }
}

export function buildInventionFab(g: GameState, assetId: string, id: string, targetCapacity: number): boolean {
  const quote = inventionFabQuote(g, assetId, id, targetCapacity), a = findBusiness(g, assetId)
  if (quote.reason || !a) return false
  const b = bizOf(g, a), products = inventionProductsOf(b), p = products.find(p => p.id === id)!
  const demand = inventionDemandQuote(g, b, p, g.year).demand
  const gain = Math.max(0, Math.min(demand, quote.additionalCapacity) * (p.price - effectiveInventionUnitCost(p)))
  if (!boardAllows(g, a, b, { kind: 'capex', by: 'owner', amount: quote.cost, gain, label: `Build ${p.name} fab capacity to ${targetCapacity} units/year` })) return false
  b.cash -= quote.cost; p.fabCapacity = targetCapacity; p.fabInvested = (p.fabInvested ?? 0) + quote.cost
  saveInventionProducts(b, products)
  b.valuation = b.public && b.sharesOut > 0 ? Math.round(b.sharePrice * b.sharesOut) : valuationOf(b); refreshValue(a, b)
  notice(g, 'Invention Fab Built', `${a.name} invested ${formatMoney(quote.cost)} of company cash in ${p.name}'s fab. Base capacity ${targetCapacity.toLocaleString('en-US')} units/year; upgraded capacity ${inventionFabCapacity(p).toLocaleString('en-US')}. This is equipment capital, not a second operating expense. Set annual output; materials, workers and cash still limit production.`, { emoji: '🏭' })
  return true
}

export function inventionUpgradeQuote(g: GameState, assetId: string, id: string, targetLevel: number) {
  const now = productNow(g, assetId, id), p = now.p, level = p?.upgradeLevel ?? 0
  const valid = Number.isFinite(targetLevel) && Number.isInteger(targetLevel) && targetLevel >= 1 && targetLevel <= MAX_UPGRADES
  const base = p ? Math.max(5_000, (p.fabCapacity ?? 0) * FAB_UNIT_CAPEX[p.kind] * .2) : 0
  let cost = 0
  if (valid) for (let i = level; i < targetLevel; i++) cost += Math.round(base * Math.pow(1.35, i))
  const reason = now.reason ?? (!valid ? `Choose an upgrade level from 1 to ${MAX_UPGRADES}.` : !(p!.fabInvested! > 0) ? 'Build a paid factory before upgrading it.' : targetLevel <= level ? 'Those upgrades are already installed.' : now.b!.cash < cost ? `The company needs ${formatMoney(cost)} for these upgrades.` : null)
  const upgraded = p ? { ...p, upgradeLevel: valid ? targetLevel : level } : null
  return { currentLevel: level, targetLevel, cost, capacity: upgraded ? inventionFabCapacity(upgraded) : 0, unitCost: upgraded ? effectiveInventionUnitCost(upgraded) : 0, reason }
}

export function upgradeInventionFab(g: GameState, assetId: string, id: string, targetLevel: number): boolean {
  const quote = inventionUpgradeQuote(g, assetId, id, targetLevel), a = findBusiness(g, assetId)
  if (quote.reason || !a) return false
  const b = bizOf(g, a), products = inventionProductsOf(b), p = products.find(p => p.id === id)!
  const gain = Math.max(0, effectiveInventionUnitCost(p) - quote.unitCost) * Math.min(p.production, inventionDemandQuote(g, b, p, g.year).demand)
  if (!boardAllows(g, a, b, { kind: 'capex', by: 'owner', amount: quote.cost, gain, label: `Upgrade ${p.name} fab to level ${targetLevel}` })) return false
  b.cash -= quote.cost; p.upgradeLevel = targetLevel; p.upgradeInvested = (p.upgradeInvested ?? 0) + quote.cost
  saveInventionProducts(b, products)
  b.valuation = b.public && b.sharesOut > 0 ? Math.round(b.sharePrice * b.sharesOut) : valuationOf(b); refreshValue(a, b)
  notice(g, 'Invention & Fab Upgraded', `${a.name} invested ${formatMoney(quote.cost)} of company cash. ${p.name}: upgrade level ${targetLevel}, capacity ${quote.capacity.toLocaleString('en-US')} units/year, material cost ${formatMoney(quote.unitCost)}/unit. Product appeal, acceptable pricing and worker productivity also improve. Patent expiry is unchanged: upgrades improve competitiveness but never recreate a monopoly or guarantee sales.`, { emoji: '⚙️' })
  return true
}

/** Annual staffing plan only; payroll is still charged once by the SKU ledger. */
export function prepareInventionWorkforce(g: GameState, b: BizState, year: number, annualWage = 0): void {
  const old = Number.isFinite(b.inventionStaff) ? Math.max(0, b.inventionStaff ?? 0) : 0
  const base = Math.max(0, b.employees - old)
  const products = /^(bank|onlineBank|investmentFirm)$/.test(b.industry) ? [] : inventionProductsOf(b)
  if (!products.length && !old) return
  const wage = Number.isFinite(annualWage) ? Math.max(0, annualWage) : 0
  const availability = Math.max(0, Math.min(1, (1 - b.capacityLoss) * b.openFraction))
  let cash = Math.min(1e15, Math.max(0, b.cash)), needed = 0
  for (const p of products.sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.lastYear >= year || p.started > year || (p.rights === 'license' && p.expires <= year) || availability <= 0) continue
    const rate = UNITS_PER_STAFF[p.kind] * Math.max(.2, b.quality / 100) * Math.pow(1.08, p.upgradeLevel ?? 0)
    const unitCost = effectiveInventionUnitCost(p)
    const units = affordableUnits(Math.min(p.production, inventionFabCapacity(p), MAX_INVENTION_OUTPUT - p.inventory), cash, unitCost, wage, rate)
    needed += Math.ceil(units / (rate * availability))
    cash -= Math.round(units * unitCost) + Math.round(units / rate * wage)
  }
  b.inventionStaff = needed
  b.employees = base + needed
  // g is deliberately accepted for a consistent annual planning hook; there
  // are no random draws, personal-money movements or notices in this planner.
  void g
}

export function simulateInventionProducts(g: GameState, b: BizState, year: number, annualWage = 0): InventionProductYear {
  const out: InventionProductYear = { revenue: 0, cogs: 0, royalties: 0, wages: 0, staffUsed: 0, units: 0, rows: [] }
  if (/^(bank|onlineBank|investmentFirm)$/.test(b.industry)) return out
  const wage = Number.isFinite(annualWage) ? Math.max(0, annualWage) : 0
  let staff = Math.max(0, b.employees) * Math.max(0, 1 - b.capacityLoss) * Math.max(0, b.openFraction)
  let cash = Math.min(1e15, Math.max(0, b.cash))
  // Stable IDs, not UI or save-array order, decide shared working-capital priority.
  for (const p of inventionProductsOf(b).sort((a, b) => a.id.localeCompare(b.id))) {
    if (p.lastYear >= year || p.started > year) continue
    // A company's paid licence survives the licensor leaving the playable
    // estate. The company still owes royalties, now to an external IP owner.
    if (p.rights === 'license' && p.expires <= year) continue
    const demand = inventionDemandQuote(g, b, p, year).demand
    const rate = UNITS_PER_STAFF[p.kind] * Math.max(.2, b.quality / 100) * Math.pow(1.08, p.upgradeLevel ?? 0)
    const unitCost = effectiveInventionUnitCost(p)
    const produced = affordableUnits(Math.min(inventionFabCapacity(p), MAX_INVENTION_OUTPUT - p.inventory, Math.floor(staff * rate), p.production), cash, unitCost, wage, rate)
    const cogs = Math.round(produced * unitCost)
    const staffUsed = produced / rate, wages = Math.round(staffUsed * wage)
    staff -= staffUsed; cash -= cogs + wages
    const sold = Math.min(p.inventory + produced, demand)
    const revenue = Math.round(sold * p.price)
    const royalties = p.rights === 'license' ? Math.round(revenue * p.royalty) : 0
    out.rows.push({ id: p.id, produced, sold, inventoryEnd: p.inventory + produced - sold, revenue, cogs, royalties, wages })
    out.revenue += revenue; out.cogs += cogs; out.royalties += royalties; out.wages += wages; out.staffUsed += staffUsed; out.units += sold
  }
  return out
}

/** Does not credit company cash: the corporate ledger must book net receipts. */
export function commitInventionProducts(g: GameState, b: BizState, year: number, result: InventionProductYear): void {
  const products = inventionProductsOf(b)
  for (const row of result.rows) {
    const p = products.find(product => product.id === row.id)
    if (!p || p.lastYear >= year) continue
    p.lastYear = year; p.inventory = Math.min(MAX_INVENTION_OUTPUT, row.inventoryEnd); p.sold += row.sold; p.revenue += row.revenue; p.costs += row.cogs + row.royalties + row.wages
    const ipAsset = g.assets.find(a => a.id === p.ipId && a.kind === 'invention'), ip = ipAsset ? readInventionIp(ipAsset) : null
    if (p.rights === 'license' && ip) p.protections = ip.protections.map(t => ({ ...t }))
    if (row.royalties > 0 && ip) earnIncome(g, row.royalties)
  }
  saveInventionProducts(b, products)
}

export function setInventionProduction(g: GameState, assetId: string, id: string, value: number, price = false): boolean {
  const live = productNow(g, assetId, id), a = live.a
  if (!a || live.reason || !Number.isFinite(value) || value < 0 || value > (price ? MAX_INVENTION_PRICE : MAX_INVENTION_OUTPUT)) return false
  const b = bizOf(g, a), products = inventionProductsOf(b), p = products.find(p => p.id === id)
  if (!p || (!price && value > inventionFabCapacity(p))) return false
  if (price) p.price = value
  else p.production = Math.floor(value)
  saveInventionProducts(b, products)
  notice(g, 'Invention Production Plan', `${p.name}: target ${p.production.toLocaleString('en-US')} units/year at ${formatMoney(p.price)} each. Material costs ${formatMoney(effectiveInventionUnitCost(p))} per unit, plus workers. Fab capacity, staff and cash can limit output. ${p.price < effectiveInventionUnitCost(p) ? 'This price is below material cost: every newly manufactured unit loses money before wages and tax. ' : ''}Unsold units remain inventory; high prices can leave you with no buyers.`, { emoji: '🏭' })
  return true
}

export function inventionOutputPreview(g: GameState, assetId: string, id: string, target: number): string {
  const live = productNow(g, assetId, id)
  if (live.reason || !live.b || !live.p) return live.reason ?? 'Product unavailable.'
  if (!Number.isFinite(target) || target < 0 || target > inventionFabCapacity(live.p)) return 'Choose output within the paid factory capacity.'
  const b = live.b, products = inventionProductsOf(b), p = products.find(p => p.id === id)!
  p.production = Math.floor(target); saveInventionProducts(b, products)
  const fixed = yearFixed(g, b), wage = localEcon(b.industry, b.countryId, b.city).wage * b.wageLevel * fixed.licence * fixed.finance * fixed.ceoEff
  prepareInventionWorkforce(g, b, g.year, wage)
  const plan = simulateInventionProducts(g, b, g.year, wage), row = plan.rows.find(row => row.id === id)
  const q = inventionDemandQuote(g, b, p, g.year)
  return row ? `${row.produced.toLocaleString('en-US')} units manufactured; ${row.sold.toLocaleString('en-US')} estimated sales of ${q.demand.toLocaleString('en-US')} wanted. Receipts ${formatMoney(row.revenue)}, materials ${formatMoney(row.cogs)}, wages ${formatMoney(row.wages)}, royalties ${formatMoney(row.royalties)}. Automatically recruits ${b.inventionStaff ?? 0} invention workers across all active products within company working capital. Paid fab, shared staff and cash all apply; estimates before sales/corporate taxes.` : 'No production: this product is not active in the planned year.'
}

export function ownedInventionProductNodes(g: GameState, assetId: string): MenuNode[] {
  const a = findBusiness(g, assetId)
  if (!a) return []
  const b = readBiz(g, a), products = inventionProductsOf(b)
  return products.flatMap((p): MenuNode[] => {
    const q = inventionDemandQuote(g, b, p, g.year), factory = inventionFabQuote(g, assetId, p.id, (p.fabCapacity ?? 0) + 1)
    const liveReason = (gg: GameState) => productNow(gg, assetId, p.id).reason
    return [{ type: 'info', id: `invention.sku.${assetId}.${p.id}`, emoji: '🏭', text: `${p.name}: ${p.rights === 'owned' ? 'company-owned IP' : `licensed until ${p.expires}; ${Math.round(p.royalty * 100)}% gross royalty`}. Price ${formatMoney(p.price)}; material cost ${formatMoney(effectiveInventionUnitCost(p))}/unit plus workers.\nFab ${inventionFabCapacity(p).toLocaleString('en-US')} units/year · upgrade ${p.upgradeLevel ?? 0}/${MAX_UPGRADES} · capital invested ${formatMoney((p.fabInvested ?? 0) + (p.upgradeInvested ?? 0))}. Target ${p.production.toLocaleString('en-US')} units/year; inventory ${p.inventory.toLocaleString('en-US')}; ${p.sold.toLocaleString('en-US')} sold; lifetime sales ${formatMoney(p.revenue)}.\nCurrent estimated demand ${q.demand.toLocaleString('en-US')} units at your price; market reference ${formatMoney(q.referencePrice)}. Local patent ${q.patentRemaining}/${q.patentYears} years remaining. Demand and monopoly pricing erode throughout the patent; old monopoly prices can stop selling. No sales are guaranteed.` },
      { type: 'action', id: `invention.sku.fab.${assetId}.${p.id}`, label: `${p.fabInvested ? 'Expand' : 'Build'} Fab: ${p.name}`, emoji: '🏗️', subtitle: 'Company-funded equipment capital; does not manufacture stock',
        input: { kind: 'slider', label: 'Base fab capacity (units/year)', min: p.fabCapacity ?? 0, max: factory.maxCapacity, step: 1, defaultValue: gg => { const current = productNow(gg, assetId, p.id).p; if (!current) return '0'; const quote = inventionFabQuote(gg, assetId, p.id, (current.fabCapacity ?? 0) + 100); return String(Math.min(quote.maxCapacity, (current.fabCapacity ?? 0) + 100)) }, preview: (gg, target) => { const quote = inventionFabQuote(gg, assetId, p.id, target); return `${quote.additionalCapacity.toLocaleString('en-US')} additional annual base units · ${formatMoney(quote.cost)} company cash. ${quote.reason ?? 'Materials, staff and annual working capital are separate.'}` } },
        disabledReason: gg => { const current = productNow(gg, assetId, p.id); return current.reason ?? inventionFabQuote(gg, assetId, p.id, (current.p?.fabCapacity ?? 0) + 1).reason },
        run: (gg, input) => { buildInventionFab(gg, assetId, p.id, Number(input)) } },
      { type: 'action', id: `invention.sku.upgrade.${assetId}.${p.id}`, label: `Upgrade Technology & Fabs: ${p.name}`, emoji: '⚙️', subtitle: 'Paid product appeal, pricing, capacity and efficiency; patents never extended',
        input: { kind: 'slider', label: 'Target upgrade level', min: p.upgradeLevel ?? 0, max: MAX_UPGRADES, step: 1, defaultValue: gg => String(Math.min(MAX_UPGRADES, (productNow(gg, assetId, p.id).p?.upgradeLevel ?? 0) + 1)), preview: (gg, level) => { const quote = inventionUpgradeQuote(gg, assetId, p.id, level); return `Level ${level}: ${formatMoney(quote.cost)} company cash · ${quote.capacity.toLocaleString('en-US')} units/year · ${formatMoney(quote.unitCost)} material cost/unit. ${quote.reason ?? ''}` } },
        disabledReason: gg => { const current = productNow(gg, assetId, p.id); return current.reason ?? inventionUpgradeQuote(gg, assetId, p.id, (current.p?.upgradeLevel ?? 0) + 1).reason },
        run: (gg, input) => { upgradeInventionFab(gg, assetId, p.id, Number(input)) } },
      { type: 'action', id: `invention.sku.production.${assetId}.${p.id}`, label: `Annual Output: ${p.name}`, emoji: '🏭', input: { kind: 'slider', label: 'Annual product production', min: 0, max: inventionFabCapacity(p), step: 1, defaultValue: gg => { const current = productNow(gg, assetId, p.id).p; return String(current ? Math.min(current.production, inventionFabCapacity(current)) : 0) }, preview: (gg, value) => inventionOutputPreview(gg, assetId, p.id, value) }, disabledReason: gg => liveReason(gg) ?? (inventionFabCapacity(productNow(gg, assetId, p.id).p!) <= 0 ? 'Build a fab before scheduling annual output.' : null), run: (gg, input) => { setInventionProduction(gg, assetId, p.id, Number(input)) } },
      { type: 'action', id: `invention.sku.price.${assetId}.${p.id}`, label: `Set Any Price: ${p.name}`, emoji: '🏷️', subtitle: 'Zero, below-cost and monopoly prices are allowed; customers can refuse', input: { kind: 'number', money: true, label: 'Product unit price (zero allowed)', min: 0, max: MAX_INVENTION_PRICE, defaultValue: gg => String(productNow(gg, assetId, p.id).p?.price ?? 0) }, disabledReason: liveReason, run: (gg, input) => { setInventionProduction(gg, assetId, p.id, Number(input), true) } }]
  })
}
