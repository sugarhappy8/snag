// Every money request the wealth system knows, by id (kids, family, the wider world).
import { FAMILY_ASKS } from './wealth-family'
import { KID_ASKS } from './wealth-kids'
import { WORLD_ASKS } from './wealth-world'
import type { AskDef } from './wealth-ask'

let all: readonly AskDef[] | null = null
let byId: Map<string, AskDef> | null = null

/** All catalog entries (built on first use so module load order never matters). */
export function askDefs(): readonly AskDef[] {
  if (!all) all = [...KID_ASKS, ...FAMILY_ASKS, ...WORLD_ASKS]
  return all
}

export function askDef(id: string): AskDef | undefined {
  if (!byId) byId = new Map(askDefs().map((d) => [d.id, d]))
  return byId.get(id)
}
