// The one market clock's pure helpers (release 1b, plan P7). A leaf: it imports the Time Machine's family seed and nothing
// else, so the stock seam (wave-stocks.ts), the fund model and the player's listing can share one definition of "which
// market, which anchor, which year" without an import cycle. It takes no shock, macro or wave term.
import { timelineFamily } from '../timeMachine'
import type { GameState } from '../types'

/** The fiscal year booked at a birthday uses that birthday's market move (the next calendar year). */
export function marketYearOf(fiscal: number): number {
  return fiscal + 1
}

/** The investments module's family seed (prices the player can already see). */
export function marketFamily(g: GameState): string {
  return timelineFamily(g, (g.lifeId || 'life').replace(/-g\d+$/, ''))
}

/** The history anchor of the family market (the same as computer/money-common.ts `anchor`): the earliest ancestor's birth year or this life's, else this year. */
export function marketAnchor(g: GameState): number {
  const first = g.ancestors?.[0]?.bornYear
  const own = g.year - g.character.age
  const a = typeof first === 'number' && Number.isFinite(first) ? Math.min(first, own) : own
  return Number.isFinite(a) ? a : g.year
}
