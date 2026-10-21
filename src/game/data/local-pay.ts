// What a job that pays a given US wage pays in another country. Moved verbatim out of business/economy.ts (R2-K5, cuts 6 and 7):
// the home computer (computer/dev-state.ts) and the game-making math (special/gamedev-core.ts) only wanted this one pure function,
// and importing it from the company economy tied them into the business import cycle. It reads only the market table, so it lives
// with the data. business/economy.ts imports it and re-exports it, so its other importers do not change.
import { marketOf } from './markets'

/** Clamp to [lo, hi]; NaN becomes lo. The same body as business/util.ts clampN, kept private so this file stays a leaf of the data layer. */
function clampN(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Local yearly pay for a job that pays `usPay` in the US. Skilled jobs (engineers, doctors,
 * executives) are priced closer to global rates than cooks and cleaners; never below the
 * minimum wage.
 */
export function localPay(countryId: string, usPay: number): number {
  const m = marketOf(countryId)
  const labor = clampN(m.laborCost, 0.05, 3)
  const skilled = clampN((usPay - 30_000) / 80_000, 0, 1)
  const f = labor <= 1 ? Math.pow(labor, 1 - 0.4 * skilled) : 1 + (labor - 1) * (1 - 0.7 * skilled)
  return Math.round(Math.max(usPay * f, Math.max(0, m.minWage)))
}
