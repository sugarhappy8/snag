// Immigration: passports, visas, residency and citizenship. Where you can move depends on the
// passport(s) you hold, your net worth, your CV, your family and the era (free-movement blocs,
// golden visas, quotas and backlogs). Activities › Emigrate (activities/emigrate.ts) is the menu;
// this module owns the state helpers and the yearly visa/citizenship clock.
// CONTRACT STUB: the immigration builder owns this file (and data/immigration.ts) and fills it in.
import type { GameState } from './types'

/** Passports the character holds; old saves without the field hold their current country's. */
export function citizenshipsOf(g: GameState): string[] {
  const c = g.character
  return Array.isArray(c.citizenships) && c.citizenships.length ? c.citizenships : [c.countryId]
}

/** Yearly hook (aging.ts, after finance): visas expire or renew, residency → citizenship. */
export function yearlyImmigration(_g: GameState): void {}

/** One line for the AI prompt about passports and status ('' when a plain citizen at home). */
export function immigrationSummary(_g: GameState): string {
  return ''
}
