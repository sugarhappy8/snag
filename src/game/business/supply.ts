// Critical inputs are a bounded basket measured in units of finished-output equivalent.
// They are not finished goods and are never created by reading a menu or an old save.
// A basket preserves the annual-turn cost model without simulating individual shipments.
import { economyOf, industryConditions, sectorOf } from '../economy'
import { sectorTrade } from '../economy/trade'
import type { GameState, Json } from '../types'
import { marketStateOf } from './competition-core'
import type { BizState } from './state'
import { clampN, num, rec } from './util'
import { effectiveAutomation, effectiveTraining, readSupplyPolicy, supplierGrade, type SupplyPolicy } from './supply-policy-state'

export const SUPPLY_VERSION = 1
const LIMIT = 1e12
// A trillion units at at most a trillion dollars each. Writer and reader use the
// same ceiling so large, valid firms do not lose paid assets on their next read.
const VALUE_LIMIT = 1e24
export interface SupplyProfile { label: string; materialShare: number; spoilage: number }
const FOOD: SupplyProfile = { label: 'Ingredients & packaging', materialShare: .65, spoilage: .2 }
const GOODS: SupplyProfile = { label: 'Materials & components', materialShare: .7, spoilage: .025 }
const PROFILES: Record<string, SupplyProfile> = {
  foodTruck: FOOD, restaurant: FOOD, cafe: FOOD, bakery: FOOD,
  bar: { ...FOOD, spoilage: .05 }, brewery: { ...FOOD, spoilage: .08 },
  grocery: { label: 'Wholesale food & packaging', materialShare: .85, spoilage: .18 },
  farm: { label: 'Seed, feed & fertilizer', materialShare: .65, spoilage: .1 },
  manufacturing: GOODS, fashion: GOODS, beauty: GOODS, ecommerce: GOODS,
  battery: GOODS, recycling: GOODS, packaging: GOODS, furniture: GOODS,
  // Construction stores building materials, never completed projects. Repair shops
  // hold spare parts, not an inventory of completed appointments.
  construction: { ...GOODS, label: 'Building materials' }, autoShop: { ...GOODS, label: 'Spare parts' },
  semiconductor: GOODS, robotics: GOODS, electricVehicles: GOODS, devices: GOODS,
  biotech: { ...GOODS, label: 'Lab & pharmaceutical inputs', spoilage: .1 },
}

export function supplyProfile(industry: string): SupplyProfile | null { return PROFILES[industry] ?? null }
export interface SupplyRecord {
  year: number; requested: number; produced: number; inputShortfall: number; workforceShortfall: number
  availability: number; workforce: number; importedGap: number; purchased: number; purchaseCost: number; storageCost: number; spoilageCost: number
  target?: number; spotPrice?: number; inputPrice?: number; contractSaving?: number; trainingRecovery?: number; automationRecovery?: number
}
export interface SupplyState {
  v: number
  /** Input baskets, each sufficient for one unit of output. */
  stock: number
  /** Actual dollars paid for the remaining baskets; never marked up to today's price. */
  bookValue: number
  lastYear: number
  /** Last actual outcome, never replaced by a projection; supports causal reports. */
  last?: SupplyRecord
  policy?: SupplyPolicy
}

/** Safe read-only migration: no opening inventory, income, debt or cash is invented. */
export function readSupply(b: Pick<BizState, 'industry' | 'supply'>): SupplyState {
  const raw = supplyProfile(b.industry) ? rec(b.supply) : null
  const d = raw?.v === SUPPLY_VERSION ? raw : null
  const stock = clampN(num(d?.stock), 0, LIMIT)
  const r = rec(d?.last)
  const last: SupplyRecord | undefined = r ? {
    year: Math.round(num(r.year, -1)), requested: clampN(num(r.requested), 0, LIMIT), produced: clampN(num(r.produced), 0, LIMIT),
    inputShortfall: clampN(num(r.inputShortfall), 0, LIMIT), workforceShortfall: clampN(num(r.workforceShortfall), 0, LIMIT),
    availability: clampN(num(r.availability, 1), .1, 1), workforce: clampN(num(r.workforce, 1), .35, 1.15),
    importedGap: clampN(num(r.importedGap), 0, 1),
    purchased: clampN(num(r.purchased), 0, LIMIT), purchaseCost: clampN(num(r.purchaseCost), 0, VALUE_LIMIT),
    storageCost: clampN(num(r.storageCost), 0, VALUE_LIMIT), spoilageCost: clampN(num(r.spoilageCost), 0, VALUE_LIMIT),
    ...(r.target !== undefined ? { target: clampN(num(r.target), 0, .5), spotPrice: clampN(num(r.spotPrice), 0, LIMIT), inputPrice: clampN(num(r.inputPrice), 0, LIMIT),
      contractSaving: clampN(num(r.contractSaving), -VALUE_LIMIT, VALUE_LIMIT), trainingRecovery: clampN(num(r.trainingRecovery), 0, 1), automationRecovery: clampN(num(r.automationRecovery), 0, 1) } : {}),
  } : undefined
  const policy = rec(rec(b.supply)?.policy) ? readSupplyPolicy(b) : undefined
  return { v: SUPPLY_VERSION, stock, bookValue: stock > 0 ? clampN(num(d?.bookValue), 0, VALUE_LIMIT) : 0, lastYear: Math.round(num(d?.lastYear, -1)), ...(last ? { last } : {}), ...(policy ? { policy } : {}) }
}
export function saveSupply(b: BizState, s: SupplyState): void { b.supply = { ...s } as unknown as Json }

export interface SupplyConditions { availability: number; workforce: number; importedGap: number; diversified: boolean; trainingRecovery: number; automationRecovery: number }
/** Company procurement exposure, weighted by its real operating countries, not the whole world. */
export function supplyConditions(g: GameState, b: BizState, year: number): SupplyConditions {
  let availability = 0, workforce = 0, importedGap = 0, weight = 0, trainingRecovery = 0, automationRecovery = 0
  const policy = readSupplyPolicy(b), training = effectiveTraining(policy, year), automation = effectiveAutomation(policy, year)
  for (const o of b.outlets) {
    const s = industryConditions(g, b.industry, o.countryId, year)
    const trade = sectorTrade(economyOf(g, o.countryId, year).tradeNetwork, sectorOf(b.industry), year)
    const n = clampN(num(o.count), 0, LIMIT)
    const delivered = clampN(num(s.availability, 1), .15, 1)
    availability += delivered * n
    importedGap += Math.min(1 - delivered, clampN(num(trade.importedGap), 0, 1)) * n
    const macro = economyOf(g, o.countryId, year)
    const skilled = ['technology', 'care', 'public', 'finance', 'industry'].includes(sectorOf(b.industry)) ? 1 : .35
    const baseWorkforce = clampN(num(s.workforce, 1), .35, 1.15)
    // Training addresses qualification gaps only. Equipment can automate a bounded
    // part of remaining work, but neither action manufactures missing raw inputs.
    const qualificationGap = Math.min(Math.max(0, 1 - baseWorkforce), Math.max(0, .65 - macro.skills) * skilled * .5)
    const trained = qualificationGap * training, automated = Math.max(0, 1 - baseWorkforce - trained) * automation
    trainingRecovery += trained * n; automationRecovery += automated * n
    workforce += (baseWorkforce + trained + automated) * n
    weight += n
  }
  availability = weight ? availability / weight : 1
  workforce = weight ? workforce / weight : 1
  importedGap = weight ? importedGap / weight : 0
  trainingRecovery = weight ? trainingRecovery / weight : 0; automationRecovery = weight ? automationRecovery / weight : 0
  const diversified = (marketStateOf(b)?.supplyUntil ?? 0) >= year
  // Foreign second sources can rescue missing imports, not repair a domestic
  // power plant, reopen the firm's factory or conjure qualified workers.
  const recovery = (diversified ? .35 : 0) + (b.supplier === 'premium' ? .08 : b.supplier === 'budget' ? -.08 : 0)
  availability = clampN(availability + importedGap * recovery, .1, 1)
  return { availability, workforce, importedGap, diversified, trainingRecovery, automationRecovery }
}

export interface SupplyBook {
  produced: number
  capacity: number
  requested: number
  availability: number
  workforce: number
  importedGap: number
  spotPrice?: number
  inputPrice?: number
  contractSaving?: number
  purchased: number
  purchaseCost: number
  consumedCost: number
  spoiled: number
  spoilageCost: number
  storageCost: number
  /** Replaces the material share of generic production COGS. */
  materialsCost: number
  /** P&L consumption is non-cash; current procurement is cash but not immediately expense. */
  cashAdjustment: number
  next: SupplyState | null
}

/** Deliverable output, distinct from installed equipment capacity. Services are labor
 * constrained too, but their appointments, subscriptions and visits never become stock. */
export function supplyCapacity(g: GameState, b: BizState, year: number, equipmentCapacity: number): number {
  const capacity = Math.floor(clampN(equipmentCapacity, 0, LIMIT)), conditions = supplyConditions(g, b, year)
  const laborCapacity = Math.floor(capacity * Math.min(1, conditions.workforce))
  return supplyProfile(b.industry) ? Math.min(laborCapacity, Math.floor(readSupply(b).stock + capacity * conditions.availability)) : laborCapacity
}

/** Pure production/procurement settlement shared by actual years and their forecasts.
 * Ordinary just-in-time purchases retain the existing annual operating-payables model.
 * Extra strategic stock must be funded from opening cash, after current input commitments.
 */
/** `known`: this company's supplyConditions for `year`, when a plan search already read them. */
export function bookSupply(g: GameState, b: BizState, year: number, capacity: number, requested: number, unitCost: number, known?: SupplyConditions): SupplyBook {
  const profile = supplyProfile(b.industry)
  const capped = Math.floor(clampN(capacity, 0, LIMIT)), request = Math.floor(clampN(requested, 0, capped))
  const conditions = known ?? supplyConditions(g, b, year)
  const laborCapacity = Math.floor(capped * Math.min(1, conditions.workforce))
  const empty: SupplyBook = { produced: Math.min(request, laborCapacity), capacity: laborCapacity, requested: request, availability: 1, workforce: conditions.workforce, importedGap: conditions.importedGap, purchased: 0, purchaseCost: 0, consumedCost: 0, spoiled: 0, spoilageCost: 0, storageCost: 0, materialsCost: 0, cashAdjustment: 0, next: null }
  if (!profile) return empty
  const old = readSupply(b), policy = readSupplyPolicy(b)
  const deliveries = Math.floor(capped * conditions.availability)
  const realCapacity = Math.min(laborCapacity, Math.floor(old.stock + deliveries))
  const produced = Math.min(request, realCapacity)
  const spotPrice = clampN(unitCost, 0, LIMIT) * profile.materialShare
  const contract = policy.contract && policy.contract.from <= year && policy.contract.until >= year ? policy.contract : null
  const lockedPrice = contract ? Math.min(LIMIT, contract.price * supplierGrade(b.supplier) / supplierGrade(contract.supplier)) : spotPrice
  const costOf = (quantity: number) => contract ? Math.min(quantity, contract.quantity) * lockedPrice + Math.max(0, quantity - contract.quantity) * spotPrice : quantity * spotPrice
  const price = Math.max(spotPrice, lockedPrice)
  const required = Math.max(0, produced - old.stock)
  const storageLimit = Math.floor(capped * .5)
  const target = Math.min(storageLimit, Math.floor(produced * policy.target))
  const spareCash = Math.max(0, num(b.cash) - costOf(required))
  const reserveBudget = Math.min(spareCash * .2, policy.procurement?.year === year ? policy.procurement.limit : Infinity)
  const reservePurchase = Math.min(Math.max(0, target - Math.max(0, old.stock - produced)), price > 0 ? Math.floor(reserveBudget / price) : 0)
  const purchased = Math.min(deliveries, required + reservePurchase)
  const purchaseCost = Math.round(costOf(purchased))
  const contractSaving = contract ? Math.min(purchased, contract.quantity) * (spotPrice - lockedPrice) : 0
  const onHand = old.stock + purchased
  const value = old.bookValue + purchaseCost
  const consumedCost = onHand > 0 ? value * produced / onHand : 0
  const leftover = Math.max(0, onHand - produced)
  const stock = Math.min(storageLimit, Math.floor(leftover * (1 - profile.spoilage)))
  const spoiled = leftover - stock
  const spoilageCost = onHand > 0 ? value * spoiled / onHand : 0
  const bookValue = stock > 0 ? Math.max(0, value - consumedCost - spoilageCost) : 0
  const storageCost = Math.round((old.bookValue + bookValue) * .5 * .035)
  const last: SupplyRecord = { year, requested: request, produced, inputShortfall: Math.max(0, Math.min(request, laborCapacity) - produced),
    workforceShortfall: Math.max(0, request - laborCapacity), availability: conditions.availability, workforce: conditions.workforce, importedGap: conditions.importedGap,
    purchased, purchaseCost, storageCost, spoilageCost, target: policy.target, spotPrice, inputPrice: purchased > 0 ? purchaseCost / purchased : lockedPrice,
    contractSaving, trainingRecovery: conditions.trainingRecovery, automationRecovery: conditions.automationRecovery }
  return { produced, capacity: realCapacity, requested: request, availability: conditions.availability, workforce: conditions.workforce, importedGap: conditions.importedGap,
    purchased, purchaseCost, consumedCost, spoiled, spoilageCost, storageCost, spotPrice, inputPrice: last.inputPrice, contractSaving,
    materialsCost: consumedCost + spoilageCost,
    cashAdjustment: consumedCost + spoilageCost - purchaseCost,
    next: { v: SUPPLY_VERSION, stock, bookValue, lastYear: year, last, ...(old.policy ? { policy } : {}) } }
}

/** Conservative liquidation value, never spendable cash or operating revenue. */
export function supplyInventoryValue(b: Pick<BizState, 'industry' | 'supply'>): number { return readSupply(b).bookValue * .5 }
