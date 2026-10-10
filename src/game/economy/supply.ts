import { bound, SECTOR_RULES, STOCK_SECTORS, type CountryEconomy, type Sector, type SectorState } from './model'

export type SectorSupply = Pick<SectorState, 'availability' | 'stock' | 'backlog' | 'output' | 'workforce'>

/** Every supplier is read from the opening year. A shock travels one edge per year rather
 * than making results depend on sector iteration order. These are coverage indices, not
 * a second set of company inventory or financial transactions. */
export function sectorSupply(old: CountryEconomy, sector: Sector, demand: number, capacity: number, supply: number, credit: number, trade?: { dependence: number; importedGap: number }): SectorSupply {
  const prev = old.sectors[sector], rule = SECTOR_RULES[sector]
  let inputGap = 0, inputWeight = 0
  for (const [id, weight] of Object.entries(rule.inputs)) {
    const supplier = old.sectors[id as Sector]
    inputGap += weight * Math.max(0, 1 - supplier.output / Math.max(.25, supplier.demand))
    inputWeight += weight
  }
  const chainGap = inputWeight ? inputGap / inputWeight : 0
  const localGap = supply * (sector === 'energy' ? .8 : sector === 'logistics' ? .4 : .18)
  // Imported inputs replace part of domestic sourcing; count their missing deliveries
  // once, before buffers are drawn. There is no second blanket foreign-recession hit.
  const incoming = bound(1 - chainGap * .8 * (1 - (trade?.dependence ?? 0)) - localGap - (trade?.importedGap ?? 0) * .8, .15, 1)
  const physical = STOCK_SECTORS.includes(sector)
  const draw = physical ? Math.min(prev.stock, 1 - incoming) : 0
  const availability = bound(incoming + draw, .15, 1)
  // Surplus supply refills depleted reserves gradually; a credit freeze makes stock-building
  // harder. Service output has no warehouse or stockpile.
  const refill = physical ? Math.min(Math.max(0, .16 - prev.stock), Math.max(0, incoming - .92) * credit * .65) : 0
  const stock = physical ? bound((prev.stock - draw) * .94 + refill, 0, .8) : 0
  const skilled = ['technology', 'care', 'public', 'finance', 'industry'].includes(sector) ? 1 : .35
  const workforce = bound(1 - Math.max(0, .65 - old.skills) * skilled * .5 - Math.max(0, .045 - old.unemployment) * 1.5, .65, 1)
  const output = bound(Math.min(demand + prev.backlog * .12, capacity * availability * workforce), 0, 2.5)
  const backlog = bound(prev.backlog * .5 + Math.max(0, demand - output) / Math.max(.25, demand) - Math.max(0, output - demand), 0, 1.5)
  return { availability, stock, backlog, output, workforce }
}
