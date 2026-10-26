// What a typical full-time year pays where the character lives, in this year's real terms. A leaf of the world layer (layer 2):
// it was born in events/wealth-core.ts, and moved down so that society/ can price a loan cap or a legal fee in typical incomes
// without reaching up into a domain. events/wealth-core.ts re-exports all three names, so every old import path still works.
//
// It reads nothing at load (the one constant is a literal) and draws no luck: the same country and year give the same figure.
import { realWealthFactor } from '../history/events-people'
import type { GameState } from '../types'
import { getCountry } from '../world'

/** A typical full-time yearly income in the US today (careers pay US salary x country wealth). */
export const US_TYPICAL_INCOME = 45_000

export function countryWealth(countryId: string): number {
  const w = getCountry(countryId).wealth
  return typeof w === 'number' && Number.isFinite(w) ? Math.max(0.08, w) : 1
}

/** A typical yearly income where the character lives, in this year's real terms (constant dollars). */
export function typicalIncome(g: GameState, countryId = g.character.countryId, year = g.year): number {
  return Math.max(1_000, Math.round(US_TYPICAL_INCOME * Math.min(1.6, countryWealth(countryId)) * realWealthFactor(year)))
}
