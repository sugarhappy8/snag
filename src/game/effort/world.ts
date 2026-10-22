// The terms of the odds that come from the world, not from the maker (R3-E2, C.1): public research that anyone can build on, rival
// pressure from the others in the field, and the ceiling a field's quality can reach. Each is a pure function of one number the
// caller hands in (Frontier works the numbers out; this file only bounds them), so a runaway world cannot move the odds past
// SPILL_TERM_MAX or RIVAL_PTS points. Nothing here reads the game, makes a roll or moves money.
import { RIVAL_PTS, SPILL_TERM_MAX } from './limits'
import { cutNum } from './num'

/** The most a ceiling can be, so a hostile number can't overflow. Real fields sit far under it (quality is 0 to 100, a tech lead under 1,200). */
export const CEILING_NUM_MAX = 1e6

/** Odds points public research gives: the pool as the caller measured it, cut to 0..SPILL_TERM_MAX (18). Not a number is none. */
export function spillPts(pool: number): number {
  return cutNum(pool, 0, SPILL_TERM_MAX, 0)
}

/** Odds points rival pressure takes: as the caller measured it, cut to 0..RIVAL_PTS (8). Not a number is none. */
export function rivalPts(pressure: number): number {
  return cutNum(pressure, 0, RIVAL_PTS, 0)
}

/**
 * The most a field's quality can be: where the world stands (`frontier`) plus the headroom one maker can add past it. Both are cut
 * to 0..CEILING_NUM_MAX. A task passes this as its quality curve's `ceiling`, so nobody outruns the world by more than the headroom.
 */
export function ceilingOf(frontier: number, headroom: number): number {
  return cutNum(frontier, 0, CEILING_NUM_MAX, 0) + cutNum(headroom, 0, CEILING_NUM_MAX, 0)
}
