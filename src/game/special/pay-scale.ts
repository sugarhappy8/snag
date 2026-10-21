// What the same work pays here and now, against the US 2020s dollars every career table is written in.
// A leaf on purpose: it imports only wealth-core (and types), so a career file can scale its pay
// without pulling special/common into the import cycle that wealth-core already sits in.
import { typicalIncome, US_TYPICAL_INCOME } from '../events/wealth-core'
import type { GameState } from '../types'

/**
 * How a career's pay table (written in US 2020s dollars) compares with what the same work pays
 * here and now: a typical local income over the US one. Exactly 1 for the US from 2026, 0.3 in
 * 1930, 0.2 in Nigeria today; never above 1.6 (typicalIncome caps the country's wealth). Reads
 * only g.year and the country, draws nothing.
 */
export function payScale(g: GameState): number {
  const scale = typicalIncome(g) / US_TYPICAL_INCOME
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}
