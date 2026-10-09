// Dependency-neutral equipment/inventory values. The economy applies its usual
// equipment haircut once; capitalized values never include speculative sales.
import type { Json } from '../types'
import type { BizState } from './state'
import { PRODUCT_SPECS } from '../inventor-data'

const record = (v: Json): Record<string, Json> => v && typeof v === 'object' && !Array.isArray(v) ? v : {}
const finite = (v: Json | undefined, fallback = 0, maximum = 1e15): number => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(maximum, v)) : fallback
function rows(b: BizState): Record<string, Json>[] {
  const ids = new Set<string>()
  return (Array.isArray(b.inventionProducts) ? b.inventionProducts : []).map(record).filter(p => {
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !['energy', 'materials', 'computing', 'health', 'food', 'transport', 'consumer'].includes(String(p.field)) || !Object.hasOwn(PRODUCT_SPECS, String(p.kind))) return false
    ids.add(p.id); return true
  })
}
/** Gross paid equipment cost; equipmentValue's consumers apply their own haircuts. */
export function inventionFabValue(b: BizState): number {
  return Math.round(rows(b).reduce((sum, p) => sum + finite(p.fabInvested) + finite(p.upgradeInvested), 0))
}
/** Recoverable stock value, below both current selling price and manufacturing cost. */
export function inventionInventoryValue(b: BizState): number {
  return Math.round(rows(b).reduce((sum, p) => {
    const spec = PRODUCT_SPECS[p.kind as keyof typeof PRODUCT_SPECS]
    const cost = finite(p.unitCost, spec.cost, 1e9) * Math.pow(.97, Math.floor(finite(p.upgradeLevel, 0, 20)))
    return sum + Math.floor(finite(p.inventory, 0, 1e9)) * Math.min(cost, finite(p.price, spec.price, 1e12)) * .4
  }, 0))
}
