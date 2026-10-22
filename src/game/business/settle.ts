// How a company's yearly simulation lands its closing cash in the books (R2-L12, design 4.2).
//
// The simulations (economy.ts simulateYear, bank.ts, fund-sim.ts, deeptech-sim.ts) work out the cash the company ends the year with and
// assign it. The year's one-off costs and income were already booked when they happened (each went through firmCash), so what is left
// is the operating result: one flow of the net, `sales` when the cash rose and `inputs` when it fell. The simulations keep one net
// number, so it is not split. Imports ../cash only (no business, no nation): it stays out of the import cycles.
import { firmCash, firmPurse } from '../cash'
import type { Reason } from '../kernel/reasons'
import type { GameState } from '../types'
import type { BizState } from './state'

/** The asset id of a company that is in the world (its record is the asset's details), so the books can name the firm. A copy, or a record kept elsewhere, has none. */
export function firmOf(g: GameState, b: BizState): string | undefined {
  return g.assets.find((a) => (a.details as unknown) === b)?.id
}

/**
 * A change of a company's own cash that the books follow, for code that may run on a record that is not in the world (the forecast of a new
 * division is a company that was never founded): that record only changes its cash, because its books are nobody's. Returns the change applied.
 */
export function worldCash(g: GameState, b: BizState, delta: number, why: Reason): number {
  const id = firmOf(g, b)
  return id === undefined ? firmPurse(b).add(delta) : firmCash(g, b, delta, why, id)
}

/**
 * The year closes and the company's cash becomes `next`. A company in the world books the change under `sales` or `inputs` (pass the
 * asset id when the asset is in scope, else the world is searched for the company, so the books name the firm). A company that is
 * not in the world (a listing for sale, a forecast of a new division, an NPC's firm) only changes its cash, so a projection on a copy
 * never touches the books. The cash lands exactly on `next`, bit for bit, as the plain assignment it replaces did. Returns the change
 * of cash.
 */
export function landCash(g: GameState, b: BizState, next: number, firm?: string): number {
  const before = b.cash
  if (!Number.isFinite(next) || !Number.isFinite(before)) return 0
  const delta = next - before
  const id = firm ?? firmOf(g, b)
  if (id !== undefined) firmCash(g, b, delta, delta > 0 ? 'sales' : 'inputs', id)
  else firmPurse(b).add(delta)
  // A float change can leave the cash an ulp off the number the simulation chose; the books cannot see a change under a dollar.
  if (b.cash !== next) firmPurse(b).add(next - b.cash)
  return b.cash - before
}
