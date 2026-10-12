// Book value an old save's company still holds from the retired invention factories: the paid
// fab and upgrade capital (equipment) and unsold product stock. The products themselves now sell
// as Workshop "made in my company" inventions; these readers only keep the company's books from
// collapsing (or jumping) when the old system went away. Dependency-free and pure.
import type { Json } from '../types'

const SPEC: Record<string, { price: number; cost: number }> = {
  small: { price: 100, cost: 55 }, middle: { price: 350, cost: 200 }, big: { price: 1_500, cost: 900 }, generational: { price: 5_000, cost: 3_200 },
}
const FIELDS = ['energy', 'materials', 'computing', 'health', 'food', 'transport', 'consumer']
const record = (v: Json): Record<string, Json> => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const finite = (v: Json | undefined, fallback = 0, max = 1e15): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback)

function rows(b: { inventionProducts?: Json }): Record<string, Json>[] {
  const ids = new Set<string>()
  return (Array.isArray(b.inventionProducts) ? b.inventionProducts : []).map(record).filter((p) => {
    if (typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !FIELDS.includes(String(p.field)) || !Object.hasOwn(SPEC, String(p.kind))) return false
    ids.add(p.id)
    return true
  })
}

/** Gross paid factory and upgrade capital of old invention lines (economy.equipmentValue adds it). */
export function legacyInventionCapital(b: { inventionProducts?: Json }): number {
  return Math.round(rows(b).reduce((sum, p) => sum + finite(p.fabInvested) + finite(p.upgradeInvested), 0))
}

/** Recoverable value of old unsold invention stock (economy.valuationOf's floor adds it). */
export function legacyInventionStock(b: { inventionProducts?: Json }): number {
  return Math.round(rows(b).reduce((sum, p) => {
    const spec = SPEC[String(p.kind)]
    const cost = finite(p.unitCost, spec.cost, 1e9) * Math.pow(0.97, Math.floor(finite(p.upgradeLevel, 0, 20)))
    return sum + Math.floor(finite(p.inventory, 0, 1e9)) * Math.min(cost, finite(p.price, spec.price, 1e12)) * 0.4
  }, 0))
}
