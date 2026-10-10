// World-scoped commercial evidence survives changes of owner and playable generation.
import type { GameState, Json } from './types'

function book(g: GameState): Record<string, Json> {
  const raw = g.flags.inventionAdoption
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}
export function inventionAdoptedUnits(g: GameState, id: string, beforeYear = Infinity): number {
  const raw = book(g)[id]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0
  return Math.min(1e15, Object.entries(raw).reduce((sum, [year, units]) => Number(year) < beforeYear && typeof units === 'number' && Number.isFinite(units) ? sum + Math.max(0, units) : sum, 0))
}
/** The product or licence ledger must claim its fiscal year before calling this. */
export function recordInventionAdoption(g: GameState, id: string, units: number, year: number): void {
  if (!id || !Number.isFinite(units) || units <= 0 || !Number.isFinite(year)) return
  const rows = book(g), raw = rows[id], history = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const old = history[String(year)], previous = typeof old === 'number' && Number.isFinite(old) ? Math.max(0, old) : 0
  g.flags.inventionAdoption = { ...rows, [id]: { ...history, [String(year)]: Math.min(1e15, previous + units) } }
}
