// The life path of a relative who exists only as a record (R4-L2, D.5 a). A relative's spouse and children are Met records, not
// Persons, and a record is never stepped. This file says, for any year, whether such a person is alive and whether they are unwell.
// It reads and writes nothing in the game; the callers that act on the answer are later tasks (L3 reads it for the views, L4 steps
// with it, L5 settles a death), and none of them exists yet.
//
//   ageTo(g, base, year, opts?)   the LifeState of a record in `year`: { age, alive, died, unwell }.
//   healthAt(base, age)           the health of the record at an age: the base health, 0.6 a year less after 45, cut to 0..100.
//   KinBase                       what a record gives: its sid, its birth year and its health (the caller makes health 35 + steadiness / 2).
//   LIFE_MAX_AGE                  130. The scan never asks for a year past birth + 130, and an age is never reported above it.
//
// The rule, for each year y after the birth (age = y - born, from 1):
//   u    = outcomeStream(g, 'life.path', y, sid)()                      the death roll
//   ill  = outcomeStream(g, 'life.path', y, sid + '|ill')() < clamp(0.02 + age / 1500, 0, 0.12)
//   dies when u < min(0.95, npcMortality(age, healthAt(base, age)) * (ill ? 2 : 1))
// The record is alive in `year` if it has not died in a year up to it. `unwell` is "ill in `year`, or health under 40 in `year`", and a
// record that has died is not unwell.
//
// Where the numbers come from, and why they are safe:
//   - the table is npcMortality (world/mortality.ts), the one every Person is judged by, so a record and a Person of the same age and
//     health face the same chance. 20,000 records at health 60: median age at death 76 to 80, p90 85 to 92, 0.5% to 1.5% die under 18;
//   - luck is a pure function of the family (the life id without its `-g<n>`), the tag, the year and the sid (kernel/streams.ts
//     outcomeStream): nothing is taken from the game's own random numbers or its id counter, nothing is written, no state is kept. A
//     reload, a clone, an heir and a second call see the same years. A Time Machine jump back to year Y re-rolls Y and every year
//     after it and keeps the years that ended before it;
//   - bounded: the loop runs from the year after `since` (or the birth) to the asked year, and never past birth + 130, so a call costs
//     at most 130 years of two draws, whatever year is asked (1e9 included) and whatever the record says. A scan from birth is about
//     30 microseconds (20,000 in 0.6 seconds); the yearly step of L4 keeps `kinY` and asks `since: kinY`, one year of draws a year;
//   - total: a base that is not one (not an object, a sid that is not in the strict grammar of sid.ts such as `__proto__`, a birth
//     outside 1700..2600 or not whole, a health that is not a number in 0..100) and a year that is not a finite number read as the
//     neutral living state { age: 0, alive: true, died: null, unwell: false }. So does a year before the birth or the birth year itself:
//     nobody has lived a year yet.
//
// The options:
//   died   the stored death year of the record (Met `d`). It wins over the scan: a record with one is dead from that year on, whatever
//          the draws say, and is alive (the scan is not read) before it. A value that cannot be a death year (not whole, before the
//          birth, past birth + 130) is not read;
//   since  a year the caller has already seen the record alive in (the anchor's `kinY`). Only the years after it are scanned. It is
//          trusted: it is the caller's word, so `since` at or past the asked year asks for no death roll at all. A value that is not a
//          finite number is not read.
// A dead record reports the age it died at (died - born), which is how a Person's age stops at death too.
//
// Facet 15 of the latent person ('path') is reserved and stays unused: the luck here is the stream above (C34).
//
// Layer 2. It imports the stream, the table, the sid grammar and a type, and draws only from the named stream
// (test/world-streams.test.ts guards every file of world/). The tag `life.path` has a row in test/stream-tap.ts and a driver in
// test/stream-isolation.test.ts, and docs/STREAMS.md has its bullet.
import { outcomeStream } from '../kernel/streams'
import type { GameState } from '../types'
import { npcMortality } from './mortality'
import { isSid } from './sid'

/** The oldest anyone gets. The scan stops at birth + this, and an age is cut to it. */
export const LIFE_MAX_AGE = 130

/** The births ageTo reads. Anything else is a hostile base. */
const BORN_MIN = 1700
const BORN_MAX = 2600

/** The health a base without a readable one has when healthAt is asked: the middle of the band the plan measured at. */
const HEALTH_NEUTRAL = 60
/** Health falls 0.6 a year from the age of 45. */
const HEALTH_FROM = 45
const HEALTH_FALL = 0.6
/** Under this health a record is unwell whatever the year held. */
const HEALTH_FRAIL = 40

/** What a record gives ageTo: who, when born and how sturdy (35 + the steadiness axis / 2 for a kin record). */
export interface KinBase {
  sid: string
  born: number
  health: number
}

/** A record in one year: its age (at death, for the dead), whether it lives, the year it died or null, and whether it is unwell. */
export interface LifeState {
  age: number
  alive: boolean
  died: number | null
  unwell: boolean
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/** The state of a record nobody has lived a year of, and of anything ageTo cannot read: a new object each time. */
const neutral = (): LifeState => ({ age: 0, alive: true, died: null, unwell: false })

/** The health of a record at an age: its base to 45, 0.6 a year less after it, cut to 0..100. Total: what is not a number reads as 60 (and age 0). */
export function healthAt(base: Pick<KinBase, 'health'>, age: number): number {
  const h = (base as { health?: unknown } | null | undefined)?.health
  const start = typeof h === 'number' && Number.isFinite(h) ? clamp(h, 0, 100) : HEALTH_NEUTRAL
  const a = typeof age === 'number' && Number.isFinite(age) ? age : 0
  return clamp(start - HEALTH_FALL * Math.max(0, a - HEALTH_FROM), 0, 100)
}

/** The base, read once and kept apart from the caller's object; null for a hostile one. */
function readBase(base: unknown): KinBase | null {
  if (typeof base !== 'object' || base === null) return null
  const { sid, born, health } = base as Record<string, unknown>
  if (!isSid(sid)) return null
  if (typeof born !== 'number' || !Number.isInteger(born) || born < BORN_MIN || born > BORN_MAX) return null
  if (typeof health !== 'number' || !(health >= 0 && health <= 100)) return null
  return { sid, born, health }
}

/** A year given as a finite number, floored; null for anything else. */
function wholeYear(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? Math.floor(x) : null
}

/** The stored death year, when it can be one: whole, from the birth year to birth + 130. */
function storedDeath(d: unknown, born: number): number | null {
  return typeof d === 'number' && Number.isInteger(d) && d >= born && d <= born + LIFE_MAX_AGE ? d : null
}

/** A record that died in `year`: the age it died at, and no illness. */
const gone = (born: number, year: number): LifeState => ({ age: year - born, alive: false, died: year, unwell: false })

/** Whether the record was ill in `year`: the chance is 0.02 + age / 1500, cut to 0..0.12. The id carries `|ill`, so it is not the death roll. */
function illIn(g: Pick<GameState, 'lifeId' | 'flags'>, b: KinBase, year: number): boolean {
  return outcomeStream(g, 'life.path', year, `${b.sid}|ill`)() < clamp(0.02 + (year - b.born) / 1500, 0, 0.12)
}

/**
 * The state of a record in `year`: see the header. Pure and total; it returns a new object and touches neither `g` nor its arguments.
 * `g` is read for the life id and the Time Machine forks only.
 */
export function ageTo(g: Pick<GameState, 'lifeId' | 'flags'>, base: KinBase, year: number, opts?: { since?: number; died?: number }): LifeState {
  const b = readBase(base)
  const y = wholeYear(year)
  if (b === null || y === null || y < b.born) return neutral()
  const stored = storedDeath(opts?.died, b.born)
  if (stored !== null && stored <= y) return gone(b.born, stored)
  if (y === b.born) return neutral()
  const last = Math.min(y, b.born + LIFE_MAX_AGE)
  // A stored death after the asked year: the record is alive in it, and no roll is read. Otherwise the scan starts after `since`.
  let from = last
  if (stored === null) {
    const s = wholeYear(opts?.since)
    from = s === null ? b.born : clamp(s, b.born, last)
  }
  for (let t = from + 1; t <= last; t++) {
    const age = t - b.born
    const u = outcomeStream(g, 'life.path', t, b.sid)()
    const risk = Math.min(0.95, npcMortality(age, healthAt(b, age)) * (illIn(g, b, t) ? 2 : 1))
    if (u < risk) return gone(b.born, t)
  }
  const age = last - b.born
  return { age, alive: true, died: null, unwell: illIn(g, b, last) || healthAt(b, age) < HEALTH_FRAIL }
}
