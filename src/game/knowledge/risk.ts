// R3-H4 (H.2, owner decision D14): illegal intel is allowed, with a real risk. An informant or a hacker adds heat to the record
// (flags.know.h, 0 to 20); each year the heat is a hazard, and a hit puts an uncaught crime on the character's record, which the
// ordinary yearly crime step (crime.ts) then turns into an arrest at its own rate. There is no minigame: a yearly hazard only.
//
//   hazardOf    pure. p = min(.5, .05 + .06 heat), and the roll is a hashed draw of the named stream `intel.risk` (outcomeStream, year,
//               'you'), so the same life, year and heat always roll the same and nothing reads or moves g.rng. No heat, no roll.
//   settleHazard the yearly step. Idempotent by rec.sy (the year of the last settle, which this function writes). A hit adds a
//               'Corporate Espionage' CrimeRecord (not caught, not convicted), wantedLevel + 2 (cap 5), notoriety + 8, karma - 4, a
//               bad-tone notice and a line in the life log. The heat halves either way. It reads no information mode: Exact and
//               Realistic play the same years, so a setting can never change a replay.
//
// The record is the owner's: an heir has no heat (flags.know is personal), and a record of another owner reads as none.
import { addHidden, inPrison, log, notice } from '../core'
import { outcomeStream } from '../kernel/streams'
import { pickLine } from '../text/pick'
import type { GameState } from '../types'
import { recordFor } from './record'
import { heatOf, rawRec, stampOf } from './rows'

/** The most heat a record holds. A literal on purpose (a module-level read of an import fails the eager-read ratchet); the test pins it to KNOW_LIMITS.heat. */
export const HEAT_MAX = 20
/** What the police write down. crimeSeverity() rates a name it does not know as 2, which is the intent. */
export const HAZARD_CRIME = 'Corporate Espionage'

const BASE_P = 0.05
const HEAT_P = 0.06
const P_MAX = 0.5
const WANTED_UP = 2
const WANTED_MAX = 5
const NOTORIETY_UP = 8
const KARMA_DOWN = 4

/** At most 120 characters each (a notice) and 90 (a log line); three wordings so the line does not repeat. */
export const HIT_NOTES: readonly string[] = [
  'Someone you paid for information talked. The police have your name on a corporate spying file.',
  'Your informant sold you out. Investigators want to know how you learned what you learned.',
  "A rival saw their secrets in your hands and called the police. You're a person of interest.",
]
export const HIT_LOGS: readonly string[] = [
  "Word got out that I'd paid for secrets. The police are asking questions.",
  "Someone I paid talked. I'm on a police file for corporate spying now.",
  'A rival smelled a leak and pointed at me. I wait for a knock at the door.',
]
const HIT_TITLE = 'Word got out'

/** The chance a heat of `h` is found out in a year: 5% plus 6% a point, at most half. Nothing at no heat. */
export function hazardP(h: number): number {
  if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) return 0
  return Math.min(P_MAX, BASE_P + HEAT_P * Math.min(h, HEAT_MAX))
}

/** The roll of this year for a heat of `h`: true is found out. Pure: one hashed draw of the `intel.risk` stream, no state read or written. */
export function hazardRoll(g: Pick<GameState, 'lifeId' | 'flags' | 'year'>, h: number): boolean {
  const p = hazardP(h)
  if (p <= 0) return false
  return outcomeStream(g, 'intel.risk', g.year, 'you')() < p
}

/** The heat the character carries now, its chance this year, and whether this year's roll hits. Pure. */
export function hazardOf(g: GameState): { h: number; p: number; hit: boolean } {
  const rec = rawRec(g)
  const h = rec ? (heatOf(rec.h) ?? 0) : 0
  if (h <= 0) return { h: 0, p: 0, hit: false }
  return { h, p: hazardP(h), hit: hazardRoll(g, h) }
}

/** Heat from a purchase. Creates the record when there is none, and holds the heat to HEAT_MAX. */
export function addHeat(g: GameState, n: number): void {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return
  const rec = recordFor(g)
  rec.h = Math.min(HEAT_MAX, Math.round((heatOf(rec.h) ?? 0) + n))
}

function charge(g: GameState): void {
  const c = g.character
  c.criminalRecord.push({ crime: HAZARD_CRIME, age: c.age, caught: false, convicted: false })
  c.wantedLevel = Math.min(WANTED_MAX, c.wantedLevel + WANTED_UP)
  addHidden(g, 'notoriety', NOTORIETY_UP)
  addHidden(g, 'karma', -KARMA_DOWN)
  log(g, pickLine(g, HIT_LOGS), 'bad')
  notice(g, HIT_TITLE, pickLine(g, HIT_NOTES), { emoji: '\u{1F575}\u{FE0F}', tone: 'bad' })
}

/**
 * The yearly settle: rolls the heat once, charges on a hit, halves the heat, and stamps the year in rec.sy. A second call in the same
 * year returns null and writes nothing; so does a dead character, and a life with no record. A character in prison is not charged a
 * second time but the heat still cools. 'hit' and 'miss' say what a roll did; null says nothing was rolled (no heat, or already done).
 */
export function settleHazard(g: GameState): 'hit' | 'miss' | null {
  if (!g.character.alive) return null
  const before = rawRec(g)
  if (!before || stampOf(before.sy, g.year) === g.year) return null
  const rec = recordFor(g)
  const h = heatOf(rec.h) ?? 0
  let outcome: 'hit' | 'miss' | null = null
  if (h > 0) {
    const found = hazardRoll(g, h)
    if (found && !inPrison(g)) {
      charge(g)
      outcome = 'hit'
    } else outcome = 'miss'
    const left = Math.floor(h / 2)
    if (left > 0) rec.h = left
    else delete rec.h
  }
  rec.sy = g.year
  return outcome
}
