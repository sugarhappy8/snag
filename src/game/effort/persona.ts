// The player's effort record (R3, C.2): flags['effort.you'], the hidden ambition that shows from 18, the yearly posture, the drive of a
// staff trait and the fatigue read. This is the one place that reads or writes the record; the engine, the focus weeks and the menus
// go through it.
//
// The record is personal and owner-stamped (the household.ts string), so an heir starts clean and a stale record reads as the defaults.
// It is created lazily: an untouched life has no key, and writing the defaults removes it, so no golden digest moves for a life that
// never picks a posture, never works overtime and never banks know-how. A save may hold anything, so every read cuts the record to its
// ranges and never throws; every write cuts it again.
//
// Ambition is not stored. It is derived from willpower, discipline, five talents and a shift that results give it (a win lifts it a
// little, a burnout lowers it), so it moves with the life and nothing here needs a migration. It shows as a word from 18.
//
// Nothing here draws a number or books a dollar. Layer 2: it reads the household's fatigue raw from flags.household because it may not
// import household.ts, and it knows the staff traits by id because it may not import business/ (a test keeps the table whole).
import { hasMainCharacter, hasTalent } from '../talents'
import type { GameState, Json } from '../types'
import { readKnowHow, knowHowOf } from './knowhow'
import { AGE_REVEAL, AMBITION_BASE, BURNOUT_F, BURNOUT_SHIFT, KNOW_HOW_FIELDS, OVERTIME_STRAIN, POSTURE_STRAIN, SHIFT_MAX, WIN_SHIFT } from './limits'
import { clampNum, hasOwn, isRecord, round2 } from './num'
import { isField } from './task'
import type { EffortInput, Posture } from './types'

/** The flags key. Personal: the heir starts without it (world-flags.ts). */
export const YOU_KEY = 'effort.you'

/** The most overtime weeks the record holds: a loose bound, since the focus pool refuses a week past FOCUS_OVERTIME_MAX over its 12. */
const OVER_MAX = 60
/** The most burnouts the record counts. */
const BURNOUTS_MAX = 999
/** The latest year a stamp may hold (a hostile save can't push one past it). */
const YEAR_MAX = 9999
/** A burnout asks for a notice only when the last one is at least this many years back. */
const NOTICE_GAP = 3

/** Ambition a talent adds, and the most the five together add; Main Character Syndrome adds its own flat figure. */
const TALENT_BONUS = 4
const TALENT_BONUS_MAX = 10
const MAIN_CHARACTER_BONUS = 8
const AMBITIOUS_TALENTS: readonly string[] = ['Inventor', 'Business', 'Leadership', 'Academics', 'Athletics']

/** What a stored hidden trait reads as when it is not a number. */
const HIDDEN_MID = 50

const POSTURES: readonly Posture[] = ['lean', 'steady', 'push']

/** The words on the three posture choices. Imperative and short, like every choice label. */
export const POSTURE_LABELS: Readonly<Record<Posture, string>> = Object.freeze({
  lean: 'Take it easy',
  steady: 'Keep a steady pace',
  push: 'Push hard',
})

export interface EffortYou {
  v: 1
  /** `${generation}:${character.id}`, the household.ts string. */
  owner: string
  /** What results have done to ambition: -SHIFT_MAX to SHIFT_MAX, two decimals. */
  shift: number
  /** The choice the player made. It takes effect at the next age-up. */
  posture: Posture
  /** The posture in force for the year. */
  effective: Posture
  /** Focus weeks worked past the pool this year, 0 to 60. */
  over: number
  /** Know-how by field (the player's own), at most KNOW_HOW_FIELDS keys. */
  fieldK: Record<string, number>
  /** The year each field was last stepped, at most KNOW_HOW_FIELDS keys. */
  at: Record<string, number>
  /** How many times the body gave out. */
  burnouts: number
  /** The year of the last burnout, -1 for never. */
  burnAt: number
  /** The year of the last yearly settle, -1 for never. */
  last: number
}

const ownerOf = (g: GameState): string => `${g.generation}:${g.character.id}`

const byKey = (a: [string, number], b: [string, number]): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)

const isPosture = (v: unknown): v is Posture => typeof v === 'string' && (POSTURES as readonly string[]).includes(v)

const int = (v: unknown, lo: number, hi: number, fallback: number): number => Math.round(clampNum(v, lo, hi, fallback))

/** The year stamps by field: valid keys, whole years, at most KNOW_HOW_FIELDS (the latest stay), keys sorted. */
function readAt(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(raw)) return out
  const rows: [string, number][] = []
  for (const key of Object.keys(raw)) {
    const v = raw[key]
    if (!isField(key) || typeof v !== 'number' || !Number.isFinite(v)) continue
    rows.push([key, int(v, 0, YEAR_MAX, 0)])
  }
  rows.sort((a, b) => b[1] - a[1] || byKey(a, b))
  for (const [key, year] of rows.slice(0, KNOW_HOW_FIELDS).sort(byKey)) out[key] = year
  return out
}

/** A record cut to its ranges, with the keys in one fixed order. Total: anything that is not a record becomes the defaults. */
function cleanYou(owner: string, raw: unknown): EffortYou {
  const r: Record<string, unknown> = isRecord(raw) ? raw : {}
  return {
    v: 1,
    owner,
    shift: round2(clampNum(r.shift, -SHIFT_MAX, SHIFT_MAX, 0)),
    posture: isPosture(r.posture) ? r.posture : 'steady',
    effective: isPosture(r.effective) ? r.effective : 'steady',
    over: round2(clampNum(r.over, 0, OVER_MAX, 0)),
    fieldK: readKnowHow(r.fieldK),
    at: readAt(r.at),
    burnouts: int(r.burnouts, 0, BURNOUTS_MAX, 0),
    burnAt: int(r.burnAt, -1, YEAR_MAX, -1),
    last: int(r.last, -1, YEAR_MAX, -1),
  }
}

/**
 * The player's record. Total and pure: a life that never touched it, another life's record, and anything a save may hold read as the
 * defaults or as a bounded version of what is there. Each call returns a fresh object, so a caller can edit it and `writeYou` it.
 */
export function readYou(g: GameState): EffortYou {
  const raw = g.flags[YOU_KEY]
  const owner = ownerOf(g)
  return cleanYou(owner, isRecord(raw) && raw.owner === owner ? raw : null)
}

/**
 * Stores the record, cut to its ranges and stamped with this life as the owner. A record that equals the defaults stores nothing and
 * removes the key, so a life that is back to untouched is byte for byte what it was before it ever looked.
 */
export function writeYou(g: GameState, y: EffortYou): void {
  const owner = ownerOf(g)
  const clean = cleanYou(owner, y)
  if (JSON.stringify(clean) === JSON.stringify(cleanYou(owner, null))) delete g.flags[YOU_KEY]
  else g.flags[YOU_KEY] = clean as unknown as Json
}

// --- Ambition -------------------------------------------------------------------------------------------------------------------

function hiddenOf(g: GameState, key: 'willpower' | 'discipline'): number {
  const hidden: Record<string, unknown> = isRecord(g.character.hidden) ? g.character.hidden : {}
  return clampNum(hidden[key], 0, 100, HIDDEN_MID)
}

/** What the five ambitious talents add: 4 each up to 10, or 8 flat for Main Character Syndrome (which borrows all five). */
function talentBonus(g: GameState): number {
  if (hasMainCharacter(g)) return MAIN_CHARACTER_BONUS
  let n = 0
  for (const id of AMBITIOUS_TALENTS) if (hasTalent(g, id)) n++
  return Math.min(TALENT_BONUS_MAX, TALENT_BONUS * n)
}

/**
 * How hard the player drives, 0 to 100: half willpower, three tenths discipline, a base of 6 (a mean life, 55 and 55, sits on 50),
 * the talents, and the shift that results gave it. Hidden: it shows as a word from 18 (`ambitionReveal`).
 */
export function ambitionOf(g: GameState): number {
  const raw = 0.5 * hiddenOf(g, 'willpower') + 0.3 * hiddenOf(g, 'discipline') + AMBITION_BASE + talentBonus(g) + readYou(g).shift
  return clampNum(raw, 0, 100, 0)
}

/** The word for an ambition: Easygoing under 25, Steady under 45, Driven under 65, Hungry under 85, else Relentless. */
export function ambitionWord(value: number): string {
  return value < 25 ? 'Easygoing' : value < 45 ? 'Steady' : value < 65 ? 'Driven' : value < 85 ? 'Hungry' : 'Relentless'
}

/**
 * What the player may see of their ambition. Under AGE_REVEAL nothing: no word and no number, so nothing can leak. From 18 the word,
 * and the rounded number (for a mode that shows exact figures), which always agree.
 */
export function ambitionReveal(g: GameState): { shown: boolean; word: string; value: number } {
  if (!(g.character.age >= AGE_REVEAL)) return { shown: false, word: '', value: 0 }
  const value = Math.round(ambitionOf(g))
  return { shown: true, word: ambitionWord(value), value }
}

// --- Posture --------------------------------------------------------------------------------------------------------------------

/** The posture in force this year. Steady under 18, and for a life that never chose. */
export function postureOf(g: GameState): Posture {
  return g.character.age >= AGE_REVEAL ? readYou(g).effective : 'steady'
}

/**
 * Sets the choice (from 18, for a living character). It takes effect at the next age-up, like the priorities in household.ts. Returns
 * whether the choice is now the player's; picking the one already there stores nothing.
 */
export function setPosture(g: GameState, p: Posture): boolean {
  if (!g.character.alive || !(g.character.age >= AGE_REVEAL) || !isPosture(p)) return false
  const y = readYou(g)
  if (y.posture === p) return true
  y.posture = p
  writeYou(g, y)
  return true
}

/**
 * Fatigue the closing year adds to the household: the posture strain of the year just lived (pushing builds it, a lean year rests)
 * plus 1.5 for each week of overtime. The posture counts from 18; overtime counts at any age.
 */
export function effortStrain(g: GameState): number {
  const y = readYou(g)
  const posture: Posture = g.character.age >= AGE_REVEAL ? y.effective : 'steady'
  return POSTURE_STRAIN[posture] + OVERTIME_STRAIN * y.over
}

// --- Fatigue --------------------------------------------------------------------------------------------------------------------

/** The household's fatigue, 0 to 100, read raw (effort may not import household.ts). Equal to `householdView(g).fatigue`. */
export function fatigueOf(g: GameState): number {
  const r = g.flags.household
  if (!isRecord(r) || r.owner !== ownerOf(g)) return 0
  return clampNum(r.fatigue, 0, 100, 0)
}

/** Whether the body is giving out: fatigue at BURNOUT_F or more. */
export function burnedOut(g: GameState): boolean {
  return fatigueOf(g) >= BURNOUT_F
}

// --- What results do ------------------------------------------------------------------------------------------------------------

/** A win lifts ambition by WIN_SHIFT, up to SHIFT_MAX. Returns what it actually added (0 once at the top). */
export function recordWin(g: GameState): number {
  const y = readYou(g)
  const next = round2(Math.min(SHIFT_MAX, y.shift + WIN_SHIFT))
  const gain = round2(next - y.shift)
  if (!(gain > 0)) return 0
  y.shift = next
  writeYou(g, y)
  return gain
}

export interface BurnoutResult {
  /** False when this year already holds a burnout: nothing changed. */
  recorded: boolean
  /** True when the player should be told: the last burnout is NOTICE_GAP years back or more, or there was none. */
  notice: boolean
}

/**
 * The body gave out this year: the shift drops by BURNOUT_SHIFT (down to -SHIFT_MAX), the count and the year are stamped, and the
 * posture in force is lean until the next settle. Once a year at most; the caller writes the notice when `notice` is true.
 */
export function recordBurnout(g: GameState): BurnoutResult {
  const y = readYou(g)
  if (y.burnAt === g.year) return { recorded: false, notice: false }
  const notice = y.burnAt < 0 || g.year - y.burnAt >= NOTICE_GAP
  y.shift = round2(Math.max(-SHIFT_MAX, y.shift + BURNOUT_SHIFT))
  y.burnouts = Math.min(BURNOUTS_MAX, y.burnouts + 1)
  y.burnAt = g.year
  y.effective = 'lean'
  writeYou(g, y)
  return { recorded: true, notice }
}

// --- Staff ----------------------------------------------------------------------------------------------------------------------

/**
 * How driven each kind of staff member is, 0 to 100 (50 is a neutral worker). Keyed by the ids of STAFF_TRAITS in business/flavor.ts;
 * test/effort-persona.test.ts holds the two lists equal. A worker's output moves by -10% to +10% across the whole range.
 */
export const STAFF_DRIVE: Readonly<Record<string, number>> = Object.freeze({
  workaholic: 85,
  visionary: 80,
  perfectionist: 70,
  overqualified: 62,
  shady: 58,
  charmer: 55,
  mentor: 55,
  steady: 50,
  pennyPincher: 48,
  gossip: 40,
  prankster: 38,
  nepo: 30,
  lazy: 15,
})

/** A staff trait's drive. A trait the table doesn't know (or anything that isn't an id) reads as neutral, 50. */
export function staffDrive(traitId: string | null | undefined): number {
  return typeof traitId === 'string' && hasOwn(STAFF_DRIVE, traitId) ? STAFF_DRIVE[traitId]! : 50
}

// --- What the engine asks -------------------------------------------------------------------------------------------------------

/** The actor part of a quote for the player's own work in `field`: ambition, the posture in force, fatigue and the field's know-how. */
export function youInput(g: GameState, field: string): Required<Pick<EffortInput, 'ambition' | 'posture' | 'fatigue' | 'knowledge'>> {
  return { ambition: ambitionOf(g), posture: postureOf(g), fatigue: fatigueOf(g), knowledge: knowHowOf(readYou(g).fieldK, field) }
}
