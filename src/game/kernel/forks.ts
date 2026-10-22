// Timeline forks: the Time Machine's mark on the seeded rolls (moved here from timeMachine.ts in R2, which re-exports them).
//
// The engine rolls some things from seeds keyed by the family and the calendar year rather than
// from g.rng (stock, index, crypto and gold years; business and deep-tech cycles; stableRoll's
// hidden yearly trends), so that hints can be honest. Without a fork, a jump would replay those
// years exactly and turn the Time Machine into a crystal ball for the markets. Every jump to the
// start of year Y records a fork: seeded rolls for years after Y get the fork's salt, years up to
// Y keep the seeds they had (so prices, holdings and everything already lived stay the same).
// A life that never jumped has no forks, and every helper then returns its input unchanged.
// Kept in g.flags.timelineForks (plain JSON) so heirs can inherit the family's timeline.
//
// This file is part of the kernel (L0): it imports only types, so streams.ts can read the fork tag without a cycle.
import type { GameState, Json } from '../types'

/** Where a jump split the timeline: years after `year` are rolled with `salt`. */
export interface TimelineFork {
  year: number
  salt: string
}

export const FORKS_FLAG = 'timelineForks'

/**
 * The newest forks kept, when the flag is read and when a jump writes it. timelineForks runs on every text draw, so the list it walks
 * is bounded. A life holds one fork per start year (addFork) and an heir inherits the list, so a family reaches the bound only by
 * jumping in 128 different calendar years (Sandbox mode, or more than forty generations with the three jumps a life has): past it the
 * oldest fork is let go at the jump, and the years it governed roll as the original timeline does.
 */
export const FORKS_MAX = 128

function isObj(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The forks of this life's timeline, oldest jump first (years ascending). At most the newest 128. */
export function timelineForks(g: Pick<GameState, 'flags'>): TimelineFork[] {
  const raw = g.flags[FORKS_FLAG]
  if (!Array.isArray(raw)) return []
  const out: TimelineFork[] = []
  for (const f of raw.slice(-FORKS_MAX)) {
    if (!isObj(f)) continue
    const { year, salt } = f
    if (typeof year === 'number' && Number.isFinite(year) && typeof salt === 'string' && /^[a-z0-9]+$/.test(salt)) {
      out.push({ year: Math.floor(year), salt })
    }
  }
  return out
}

/** Seed tag for rolls of `year` under `forks`: '' when the year is shared with the original timeline. */
export function forkTag(forks: readonly TimelineFork[], year: number): string {
  if (!Number.isFinite(year)) return ''
  // Newest jump first: a year after it was lived in its timeline; one before it belongs to an
  // older timeline (or the original one).
  for (let i = forks.length - 1; i >= 0; i--) if (year > forks[i].year) return `~${forks[i].salt}`
  return ''
}

/**
 * Add to a per-year seed key of `g`'s life, e.g. `${g.lifeId}${timelineTag(g, year)}|...|${year}`.
 * '' for lives that never used the Time Machine (their seeds don't change).
 */
export function timelineTag(g: Pick<GameState, 'flags'>, year: number): string {
  return forkTag(timelineForks(g), year)
}

/**
 * timelineTag for a roll whose result only shows once `year` is over: the business cycle a
 * company's fiscal `year` is booked with at the next birthday, or a hidden trend of `year` that
 * decides how this year's attempts turn out. Unlike prices (on screen the moment the year
 * starts), these were never seen at the start of the year you jumped back to, so that year
 * rolls new dice too; otherwise a jump would tell you how the year ends. '' for lives that
 * never jumped, and for every year that ended before the latest jump.
 */
export function outcomeTag(g: Pick<GameState, 'flags'>, year: number): string {
  return Number.isFinite(year) ? forkTag(timelineForks(g), year + 1) : ''
}
