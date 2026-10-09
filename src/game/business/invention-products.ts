// Concrete invention SKUs: manufacture units, carry inventory, and sell at a
// product-specific price. Planning is pure; corporate accounting books it once.
import { earnIncome, formatMoney, notice } from '../core'
import { seeded } from '../assets'
import { readInventionIp } from '../inventor-state'
import { isInventionField, type InventionField, PRODUCT_SPECS } from '../inventor-data'
import type { GameState, Json, MenuNode } from '../types'
import { isResearchKind, isInventionTier, nationalPatentLaw, type InventionTier, type PatentProtection } from './inventions'
import { expansionOf, nationalMarket, protectedIn } from './dynamics'
import { manageBlock } from './gate'
import { bizOf, findBusiness, readBiz, type BizState } from './state'

export interface InventionProduct { id: string; ipId: string; name: string; field: InventionField; kind: InventionTier; price: number; unitCost: number; potential: number; production: number; inventory: number; rights: 'owned' | 'license'; royalty: number; expires: number; protections: PatentProtection[]; started: number; lastYear: number; sold: number; revenue: number; costs: number }
export interface InventionProductYear { revenue: number; cogs: number; royalties: number; wages: number; staffUsed: number; units: number; rows: { id: string; produced: number; sold: number; inventoryEnd: number; revenue: number; cogs: number; royalties: number; wages: number }[] }
/** Workload, not free labour: larger inventions take more staff time per unit. */
const UNITS_PER_STAFF: Record<InventionTier, number> = { small: 10_000, middle: 3_000, big: 1_000, generational: 250 }
const rec = (value: Json): Record<string, Json> => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const num = (value: Json | undefined, fallback = 0, max = 1e15): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback

export function inventionProductsOf(b: BizState): InventionProduct[] {
  const ids = new Set<string>()
  return (Array.isArray(b.inventionProducts) ? b.inventionProducts : []).map(rec).filter(d => {
    if (typeof d.id !== 'string' || !d.id || ids.has(d.id) || typeof d.name !== 'string' || !isInventionField(d.field) || !isResearchKind(d.kind) || !isInventionTier(d.kind)) return false
    ids.add(d.id)
    return true
  }).map(d => ({
    id: String(d.id), ipId: typeof d.ipId === 'string' ? d.ipId : String(d.id), name: String(d.name), field: d.field as InventionField, kind: d.kind as InventionTier,
    price: num(d.price, 1, PRODUCT_SPECS[d.kind as InventionTier].price * 5), unitCost: num(d.unitCost, 1, 1e9), potential: num(d.potential, 0, 1e9), production: Math.floor(num(d.production, 100, 1e9)), inventory: Math.floor(num(d.inventory, 0, 1e9)), rights: d.rights === 'license' ? 'license' : 'owned', royalty: num(d.royalty, 0, .5), expires: num(d.expires),
    protections: Array.isArray(d.protections) ? d.protections.map(rec).filter(row => typeof row.country === 'string').map(row => ({ country: String(row.country), filed: num(row.filed), expires: num(row.expires) })) : (expansionOf(b).patents.find(p => p.id === d.id)?.protections ?? []).map(row => ({ ...row })),
    started: num(d.started), lastYear: typeof d.lastYear === 'number' && Number.isFinite(d.lastYear) ? d.lastYear : -1, sold: num(d.sold), revenue: num(d.revenue), costs: num(d.costs),
  }))
}
export function saveInventionProducts(b: BizState, products: InventionProduct[]): void { b.inventionProducts = products as unknown as Json }
export function newInventionProduct(id: string, name: string, field: InventionField, kind: InventionTier, year: number): InventionProduct {
  const spec = PRODUCT_SPECS[kind]
  return { id, ipId: id, name, field, kind, price: spec.price, unitCost: spec.cost, potential: spec.demand, production: 100, inventory: 0, rights: 'owned', royalty: 0, expires: 0, protections: [], started: year, lastYear: -1, sold: 0, revenue: 0, costs: 0 }
}

export function simulateInventionProducts(g: GameState, b: BizState, year: number, annualWage = 0): InventionProductYear {
  const out: InventionProductYear = { revenue: 0, cogs: 0, royalties: 0, wages: 0, staffUsed: 0, units: 0, rows: [] }
  if (/^(bank|onlineBank|investmentFirm)$/.test(b.industry)) return out
  const wage = Number.isFinite(annualWage) ? Math.max(0, annualWage) : 0
  let staff = Math.max(0, b.employees) * Math.max(0, 1 - b.capacityLoss) * Math.max(0, b.openFraction)
  let cash = Math.max(0, b.cash)
  for (const p of inventionProductsOf(b)) {
    if (p.lastYear >= year || p.started > year) continue
    const ipAsset = g.assets.find(a => a.id === p.ipId && a.kind === 'invention')
    // A company's paid licence survives the licensor leaving the playable
    // estate. The company still owes royalties, now to an external IP owner.
    if (p.rights === 'license' && p.expires <= year) continue
    const ip = ipAsset ? readInventionIp(ipAsset) : null
    const patent = expansionOf(b).patents.find(row => row.id === p.id)
    const licensedProtections = ip?.protections ?? p.protections
    const exclusive = p.rights === 'license' ? licensedProtections.some(t => t.country === b.countryId && t.filed <= year && t.expires > year) : patent ? protectedIn(patent, b.countryId, year) : false
    const exclusivity = .45 + (exclusive ? .55 * nationalPatentLaw(b.countryId, year).enforcement : 0)
    const demand = Math.floor(p.potential * (.8 + seeded(`${p.id}|sku|${b.countryId}|${year}`).next() * .4) * nationalMarket(g, b.industry, b.countryId, year).demand * exclusivity * Math.max(.1, Math.min(3, PRODUCT_SPECS[p.kind].price / Math.max(.01, p.price))))
    const rate = UNITS_PER_STAFF[p.kind] * Math.max(.2, b.quality / 100)
    const produced = Math.max(0, Math.min(Math.floor(staff * rate), p.production, Math.floor(cash / Math.max(.01, p.unitCost + wage / rate))))
    const cogs = Math.round(produced * p.unitCost)
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
    p.lastYear = year; p.inventory = row.inventoryEnd; p.sold += row.sold; p.revenue += row.revenue; p.costs += row.cogs + row.royalties + row.wages
    const ipAsset = g.assets.find(a => a.id === p.ipId && a.kind === 'invention'), ip = ipAsset ? readInventionIp(ipAsset) : null
    if (p.rights === 'license' && ip) p.protections = ip.protections.map(t => ({ ...t }))
    if (row.royalties > 0 && ip) earnIncome(g, row.royalties)
  }
  saveInventionProducts(b, products)
}

export function setInventionProduction(g: GameState, assetId: string, id: string, value: number, price = false): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a) || !Number.isFinite(value) || value < 0 || value > 1e9) return false
  const b = bizOf(g, a), products = inventionProductsOf(b), p = products.find(p => p.id === id)
  if (!p || (price && (value < p.unitCost * .5 || value > PRODUCT_SPECS[p.kind].price * 5))) return false
  if (price) p.price = Math.round(value * 100) / 100
  else p.production = Math.floor(value)
  saveInventionProducts(b, products)
  notice(g, 'Invention Production Plan', `${p.name}: target ${p.production.toLocaleString('en-US')} units/year at ${formatMoney(p.price)} each. Manufacturing costs ${formatMoney(p.unitCost)} per unit; staff capacity and cash can limit output. Unsold units remain inventory.`, { emoji: '🏭' })
  return true
}

export function ownedInventionProductNodes(g: GameState, assetId: string): MenuNode[] {
  const a = findBusiness(g, assetId)
  if (!a) return []
  const products = inventionProductsOf(readBiz(g, a))
  return products.flatMap((p): MenuNode[] => [{ type: 'info', id: `invention.sku.${assetId}.${p.id}`, emoji: '🏭', text: `${p.name}: ${p.rights === 'owned' ? 'company-owned IP' : `licensed until ${p.expires}; ${Math.round(p.royalty * 100)}% gross royalty`}. Price ${formatMoney(p.price)}; manufacturing ${formatMoney(p.unitCost)}/unit. Target ${p.production} units/year; inventory ${p.inventory}; ${p.sold} sold; lifetime sales ${formatMoney(p.revenue)}. This is a separate product, not a boost to unrelated sales.` },
    { type: 'action', id: `invention.sku.production.${assetId}.${p.id}`, label: `Production: ${p.name}`, emoji: '🏭', input: { kind: 'number', label: 'Annual Product Production', min: 0, max: 1e9, defaultValue: () => String(p.production) }, disabledReason: gg => manageBlock(gg, a), run: (gg, input) => { setInventionProduction(gg, assetId, p.id, Number(input)) } },
    { type: 'action', id: `invention.sku.price.${assetId}.${p.id}`, label: `Price: ${p.name}`, emoji: '🏷️', input: { kind: 'number', money: true, label: 'Product Unit Price', min: p.unitCost * .5, max: PRODUCT_SPECS[p.kind].price * 5, defaultValue: () => String(p.price) }, disabledReason: gg => manageBlock(gg, a), run: (gg, input) => { setInventionProduction(gg, assetId, p.id, Number(input), true) } }])
}
