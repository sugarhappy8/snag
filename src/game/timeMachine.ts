// The Time Machine: BitLife's "go back a few years after a disaster".
//
// The store snapshots the life at the start of every year (right after the birthday, once its
// popups are dealt with) and save.ts keeps the last TIME_MACHINE_STOPS of them outside the main
// save. Travelling restores one of those snapshots exactly (people, money, flags, log, queue)
// with three deliberate differences:
//   - a log line and a memory say you came back;
//   - the jump is counted (TIME_MACHINE_JUMPS per life unless Sandbox mode is on);
//   - the dice are re-stirred, otherwise pressing "+ Age" would replay the very same disaster.
//     That covers g.rng; the engine's per-year seeded rolls (stock and crypto years, business
//     cycles, stableRoll) read the timeline forks below, so the years after the jump play out
//     afresh while every year up to it stays exactly as it was. Real history (eras, crashes,
//     wars) is the same in every timeline: knowing it is fair game, as in real life.
// Everything here is pure: no storage, no React, no Math.random.
import { log, remember, roleLabel } from './core'
import type { GameState, Json } from './types'

/** How many past years are kept (the start of each of the last N birthdays). */
export const TIME_MACHINE_STOPS = 10
/** Jumps per life (unlimited in Sandbox mode). */
export const TIME_MACHINE_JUMPS = 3

/** One year the Time Machine can go back to: the life right after that birthday. */
export interface TimeStop {
  age: number
  /** Calendar year of that birthday. */
  year: number
  /** Bank balance then (internal dollars) and what you were doing, for the list. */
  money: number
  role: string
  /** Country lived in then, so the balance is shown in that year's money (missing in old indexes). */
  countryId?: string
}

/** Summary of a start-of-year snapshot, kept in the snapshot index. */
export function stopOf(g: GameState): TimeStop {
  const money = Number.isFinite(g.character.money) ? Math.round(g.character.money) : 0
  return { age: g.character.age, year: g.year, money, role: roleLabel(g), countryId: g.character.countryId }
}

/**
 * The moment a start-of-year snapshot is owed: the store expects one at `pendingAge` (set when
 * the birthday happens) and takes it once the birthday's popups are gone and you're still alive.
 */
export function isStartOfYear(g: GameState, pendingAge: number | null): boolean {
  return pendingAge !== null && g.character.alive && g.character.age === pendingAge && g.queue.length === 0
}

function isObj(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Settings → "Sandbox: unlimited Time Machine". Read defensively: settings saved before the
 * option existed (or a Settings type without it) just mean "off".
 */
export function sandboxTimeMachine(settings: object | null | undefined): boolean {
  return !!settings && (settings as { sandboxTimeMachine?: unknown }).sandboxTimeMachine === true
}

/** Jumps this life has made (kept across jumps: travelling copies it forward). */
export function jumpsUsed(g: GameState): number {
  const tm = g.flags.timeMachine
  const used = isObj(tm) ? tm.used : undefined
  return typeof used === 'number' && Number.isFinite(used) && used > 0 ? Math.floor(used) : 0
}

/** Jumps left this life; Infinity in Sandbox mode. */
export function jumpsLeft(g: GameState, unlimited: boolean): number {
  return unlimited ? Infinity : Math.max(0, TIME_MACHINE_JUMPS - jumpsUsed(g))
}

/** "2 of 3 jumps left", for the sheet and buttons. */
export function jumpsText(g: GameState, unlimited: boolean): string {
  if (unlimited) return 'Sandbox mode: unlimited jumps'
  const left = jumpsLeft(g, false)
  if (left <= 0) return 'No jumps left this life'
  return `${left} of ${TIME_MACHINE_JUMPS} jumps left this life`
}

/** Snapshots this life can go back to, newest first: never the future. */
export function availableStops(g: GameState, stops: readonly TimeStop[]): TimeStop[] {
  const born = g.year - g.character.age
  return stops
    .filter((s) => s.age <= g.character.age && s.age >= 0 && s.year - s.age === born)
    .slice()
    .sort((a, b) => b.age - a.age)
}

/** True when going back to `stop` would only restart the year you're living right now. */
export function isRestart(g: GameState, stop: TimeStop): boolean {
  return g.character.alive && stop.age === g.character.age
}

/** "Go back to age 34 (2014)". */
export function stopLabel(g: GameState, stop: TimeStop): string {
  if (isRestart(g, stop)) return `Restart age ${stop.age} (${stop.year})`
  if (stop.age === 0) return `Go back to the day you were born (${stop.year})`
  return `Go back to age ${stop.age} (${stop.year})`
}

/** Why the Time Machine can't take you to `stop` right now ('' when it can). */
export function travelBlock(g: GameState, stop: TimeStop | undefined, unlimited: boolean): string {
  if (!stop) return 'That year has faded from the Time Machine.'
  if (stop.age > g.character.age || stop.year > g.year) return 'The Time Machine only goes backwards.'
  if (!availableStops(g, [stop]).length) return 'That year belongs to another life.'
  if (g.queue.length > 0) return 'Deal with what’s on screen first.'
  if (jumpsLeft(g, unlimited) <= 0) {
    return `The Time Machine is out of fuel: you've used all ${TIME_MACHINE_JUMPS} jumps this life.`
  }
  return ''
}

/** Mix the saved dice with the trip so the past can turn out differently (still deterministic). */
export function stirSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul((salt | 0) + 0x9e3779b9, 0x85ebca6b)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  h ^= h >>> 16
  // Never land on exactly the same dice as before.
  return h === seed ? (h + 1) | 0 : h | 0
}

// ---------------------------------------------------------------------------
// Timeline forks
//
// The engine rolls some things from seeds keyed by the family and the calendar year rather than
// from g.rng (stock, index, crypto and gold years; business and deep-tech cycles; stableRoll's
// hidden yearly trends), so that hints can be honest. Without a fork, a jump would replay those
// years exactly and turn the Time Machine into a crystal ball for the markets. Every jump to the
// start of year Y records a fork: seeded rolls for years after Y get the fork's salt, years up to
// Y keep the seeds they had (so prices, holdings and everything already lived stay the same).
// A life that never jumped has no forks, and every helper then returns its input unchanged.
// Kept in g.flags.timelineForks (plain JSON) so heirs can inherit the family's timeline.

/** Where a jump split the timeline: years after `year` are rolled with `salt`. */
export interface TimelineFork {
  year: number
  salt: string
}

const FORKS_FLAG = 'timelineForks'
/** Separates a family seed from its encoded forks in timelineFamily(). */
const FORK_MARK = '@'

/** The forks of this life's timeline, oldest jump first (years ascending). */
export function timelineForks(g: GameState): TimelineFork[] {
  const raw = g.flags[FORKS_FLAG]
  if (!Array.isArray(raw)) return []
  const out: TimelineFork[] = []
  for (const f of raw) {
    if (!isObj(f)) continue
    const { year, salt } = f
    if (typeof year === 'number' && Number.isFinite(year) && typeof salt === 'string' && /^[a-z0-9]+$/.test(salt)) {
      out.push({ year: Math.floor(year), salt })
    }
  }
  return out
}

/** The forks after one more jump to the start of `year` (forks at or after it no longer matter). */
export function addFork(forks: readonly TimelineFork[], year: number, salt: string): TimelineFork[] {
  return [...forks.filter((f) => f.year < year), { year, salt }]
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
export function timelineTag(g: GameState, year: number): string {
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
export function outcomeTag(g: GameState, year: number): string {
  return Number.isFinite(year) ? forkTag(timelineForks(g), year + 1) : ''
}

/**
 * The family seed (`base`, e.g. the lifeId without its generation) with this timeline's forks
 * encoded, for engines that take a family string and roll many years from it. `base` itself
 * when there are no forks. Inside such an engine, seed each year with familyAt(fam, year).
 */
export function timelineFamily(g: GameState, base: string): string {
  const forks = timelineForks(g)
  if (!forks.length || base.includes(FORK_MARK)) return base
  return `${base}${FORK_MARK}${forks.map((f) => `${f.year}~${f.salt}`).join(',')}`
}

/** The seed family for rolls of `year` (or for year-less rolls, e.g. a coin's launch price). */
export function familyAt(fam: string, year?: number): string {
  const at = fam.indexOf(FORK_MARK)
  if (at < 0) return fam
  const base = fam.slice(0, at)
  if (year === undefined) return base
  const forks: TimelineFork[] = []
  for (const part of fam.slice(at + 1).split(',')) {
    const m = /^(-?\d+)~([a-z0-9]+)$/.exec(part)
    if (m) forks.push({ year: Number(m[1]), salt: m[2] })
  }
  return `${base}${forkTag(forks, year)}`
}

/**
 * The life restored from `snapshot` (taken at the start of an earlier year) after travelling
 * from `from`. Pure: returns a new state; `from` and `snapshot` are not modified.
 */
export function arriveInPast(from: GameState, snapshot: GameState): GameState {
  const g = structuredClone(snapshot)
  const used = jumpsUsed(from) + 1
  g.flags.timeMachine = { used }
  g.rng = stirSeed(snapshot.rng, used * 7919 + from.year * 31 + from.character.age)
  // The years after this one roll new dice (see Timeline forks).
  const forks = addFork(timelineForks(from), snapshot.year, (g.rng >>> 0).toString(36))
  g.flags[FORKS_FLAG] = forks.map((f) => ({ year: f.year, salt: f.salt }))
  const fromYear = from.year
  log(g, `⏳ I used the Time Machine and went back to ${g.year}.`, 'event')
  remember(
    g,
    from.character.alive
      ? `Used a time machine to come back from ${fromYear}, knowing what happens next.`
      : `Died in ${fromYear}, then used a time machine to come back and try again.`,
  )
  return g
}
