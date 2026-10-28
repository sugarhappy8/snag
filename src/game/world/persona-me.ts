// The player's persona (R4-S9, D.2 b): the five axes of axes.ts for the player. Four are inferred from what the life has done, one is
// the hidden ambition that already exists, and a small stored record lets the composer of R5 lean an axis a little. Nothing in R4
// reads it (X18): inferAxes, personaOf and nudgePersona have no caller in a played life, so no seed, save or golden digest can move
// through this file. The player-facing half of D.2 (narrator pools, guilt costs, how NPCs read the player) is R5's.
//
//   inferAxes   honesty and empathy from karma, lowered by the lifetime counts of crimes, thefts, cheating, murders, fights, insults and
//               sabotage and raised by donating and saving lives; risk from craziness, lottery tickets and fights; steadiness from
//               discipline, willpower and the absence of craziness. Ambition is `ambitionOf(g)` exactly (effort/persona.ts), unrounded:
//               its shift carries two decimals, so this one axis can be fractional while the other four are whole numbers. Every count
//               is cut to a cap before it is used, so a counter of 1e9 moves nothing past its cap. Amounts (moneyStolen and the like)
//               are not used: they would let one rich life read as a saint or a thief.
//   nudges      flags['persona.me'], personal and owner-stamped like the effort record, so an heir starts clean and another life's
//               record reads as the defaults. At most one nudge a slot (the four axes but ambition), each within +-NUDGE_MAX in all,
//               each call 1 to NUDGE_STEP, once per (axis, reason, year), at most AT_MAX year stamps. Created lazily: an untouched
//               life has no key, and a record with nothing in it removes the key (effort/persona.ts `writeYou` does the same).
//   personaOf   inferAxes plus the nudges, cut to 0..100.
//
// `effort.you` is NOT moved into this record: the ambition axis reads `ambitionOf`, so that record and its tests stay put (X18).
//
// Every constant of the inference sits in the tables below and the tests assert direction and bounds, not their values. A save may
// hold anything, so every read is total: a record of the wrong shape, another life's, numbers out of range and 500 keys read as
// the defaults or as a bounded version of what is there, and nothing throws, draws or writes. Layer 2: the imports are effort/ and
// axes.ts (types only), and no module-level const reads an import (rule (d) of the layers test).
import { clampNum, hasOwn, isRecord } from '../effort/num'
import { ambitionOf } from '../effort/persona'
import type { GameState, Json } from '../types'
import type { Axes, AxisId } from './axes'

/** The flags key. Personal: the heir starts without it (world-flags.ts). Always read and written through this constant. */
export const PERSONA_KEY = 'persona.me'

/** The most a nudge adds up to on one axis, either way, all nudges together. The ceiling row `persona-nudge` names this constant. */
export const NUDGE_MAX = 15
/** The most one call moves an axis (and the least, 1): `by` is cut to a whole number within +-NUDGE_STEP. */
export const NUDGE_STEP = 3
/** The axes a nudge may move: all of them but ambition, which is ambitionOf. */
export const NUDGE_SLOTS = 4
/** The most (axis, reason) year stamps the record holds. */
export const AT_MAX = 40

/** A record read from a save looks at no more than this many stamp keys, whatever it holds. */
const AT_SCAN = 1000
/** The latest year a stamp may hold. */
const YEAR_MAX = 100_000
/** A reason is a short lower-case word, so a stamp key is bounded and the record cannot grow with free text. */
const REASON = /^[a-z][a-z0-9-]{0,15}$/
const STAMP = /^(honesty|empathy|risk|steadiness)\.[a-z][a-z0-9-]{0,15}$/

export type NudgeAxis = Exclude<AxisId, 'ambition'>

/** The four axes a nudge may move, in the order the record keeps them. */
export const NUDGE_AXES: readonly NudgeAxis[] = Object.freeze(['honesty', 'empathy', 'risk', 'steadiness'] as const)

export interface PersonaMe {
  v: 1
  /** `${generation}:${character.id}`, the household.ts string. */
  owner: string
  /** What the nudges added up to, by axis: whole numbers within +-NUDGE_MAX, a zero is not stored. At most NUDGE_SLOTS keys. */
  n: Partial<Record<NudgeAxis, number>>
  /** The year of the last nudge by `axis.reason`, whole years, at most AT_MAX keys, sorted. */
  at: Record<string, number>
}

// --- The inference --------------------------------------------------------------------------------------------------------------

type HiddenId = 'karma' | 'craziness' | 'willpower' | 'discipline'
type CountId =
  | 'crimes' | 'thefts' | 'cheated' | 'murders' | 'fights' | 'insults' | 'sabotage' | 'donated' | 'livesSaved' | 'lotteryTickets'

/**
 * What a hidden stat reads as when it is missing or not a number, and the point an axis is centred on: the middle of the starting
 * draw (life.ts: karma 30..80, craziness 0..70, willpower and discipline 10..100), so a mean newborn reads 50 on every axis.
 */
const HIDDEN_MID: Readonly<Record<HiddenId, number>> = Object.freeze({ karma: 55, craziness: 35, willpower: 55, discipline: 55 })

/**
 * The most each lifetime count counts for. The counters hold events (a donation is one, the amount is `moneyDonated`, which is not
 * read), and past its cap a count moves nothing more: 1e9 reads as the cap.
 */
const COUNT_CAP: Readonly<Record<CountId, number>> = Object.freeze({
  crimes: 20, thefts: 20, cheated: 10, murders: 5, fights: 20, insults: 30, sabotage: 10, donated: 20, livesSaved: 10, lotteryTickets: 50,
})

/** The most the counts together move one axis, either way. */
const COUNT_SWING = 40

interface Weights {
  /** Points per point of the stat above or below its middle. */
  readonly hidden: readonly (readonly [HiddenId, number])[]
  /** Points per counted event. */
  readonly counts: readonly (readonly [CountId, number])[]
}

/**
 * One row an axis. The signs are the plan's: karma lifts honesty and empathy, the seven bad counts lower them, donating and saving
 * lives raise them; craziness, lottery tickets and fights lift risk; discipline and willpower lift steadiness and craziness lowers it.
 * Honesty hears the crooked counts loudest, empathy the cruel ones.
 */
const WEIGHTS: Readonly<Record<NudgeAxis, Weights>> = Object.freeze({
  honesty: {
    hidden: [['karma', 0.6]],
    counts: [['crimes', -1.5], ['thefts', -1.5], ['cheated', -2], ['murders', -2], ['sabotage', -2], ['fights', -0.3], ['insults', -0.3], ['donated', 0.5], ['livesSaved', 0.5]],
  },
  empathy: {
    hidden: [['karma', 0.5]],
    counts: [['murders', -4], ['fights', -1], ['insults', -0.8], ['sabotage', -1], ['cheated', -1], ['crimes', -0.5], ['thefts', -0.5], ['donated', 1], ['livesSaved', 2]],
  },
  risk: {
    hidden: [['craziness', 0.5]],
    counts: [['lotteryTickets', 0.3], ['fights', 0.8]],
  },
  steadiness: {
    hidden: [['discipline', 0.3], ['willpower', 0.25], ['craziness', -0.4]],
    counts: [],
  },
})

const MID = 50

function hiddenRecord(g: GameState): Record<string, unknown> {
  const hidden: unknown = g.character.hidden
  return isRecord(hidden) ? hidden : {}
}

function hiddenOf(hidden: Record<string, unknown>, id: HiddenId): number {
  return hasOwn(hidden, id) ? clampNum(hidden[id], 0, 100, HIDDEN_MID[id]) : HIDDEN_MID[id]
}

/** A lifetime count cut to its cap: a whole number from 0 to the cap. Anything that is not a finite number counts for none. */
function countOf(g: GameState, id: CountId): number {
  const bag: unknown = g.counters
  if (!isRecord(bag) || !hasOwn(bag, id)) return 0
  const v = bag[id]
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0
  return Math.min(COUNT_CAP[id], Math.floor(v))
}

function inferOne(g: GameState, hidden: Record<string, unknown>, w: Weights): number {
  let v = MID
  for (const [id, per] of w.hidden) v += per * (hiddenOf(hidden, id) - HIDDEN_MID[id])
  let counts = 0
  for (const [id, per] of w.counts) counts += per * countOf(g, id)
  v += clampNum(counts, -COUNT_SWING, COUNT_SWING, 0)
  return Math.round(clampNum(v, 0, 100, MID))
}

/**
 * The player's five axes as the life has made them. Ambition is `ambitionOf(g)` exactly (two decimals at most, the number the player
 * sees is its rounding); honesty, empathy, risk and steadiness are whole numbers 0..100 with 50 neutral. Pure and total: it reads the
 * hidden stats and the lifetime counters and writes nothing. Takes the whole state because `ambitionOf` is typed on it.
 */
export function inferAxes(g: GameState): Axes {
  const hidden = hiddenRecord(g)
  return {
    ambition: ambitionOf(g),
    honesty: inferOne(g, hidden, WEIGHTS.honesty),
    empathy: inferOne(g, hidden, WEIGHTS.empathy),
    risk: inferOne(g, hidden, WEIGHTS.risk),
    steadiness: inferOne(g, hidden, WEIGHTS.steadiness),
  }
}

// --- The record -----------------------------------------------------------------------------------------------------------------

const ownerOf = (g: GameState): string => `${g.generation}:${g.character.id}`

/** The current year as a whole number in range (a hostile state can hold anything). */
const yearOf = (g: GameState): number => Math.floor(clampNum(g.year, 0, YEAR_MAX, 0))

const byKey = (a: [string, number], b: [string, number]): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)

/** The nudges: the four axes in one fixed order, each a whole number within +-NUDGE_MAX, zeros left out. */
function readNudges(raw: unknown): Partial<Record<NudgeAxis, number>> {
  const out: Partial<Record<NudgeAxis, number>> = {}
  if (!isRecord(raw)) return out
  for (const axis of NUDGE_AXES) {
    if (!hasOwn(raw, axis)) continue
    const v = Math.round(clampNum(raw[axis], -NUDGE_MAX, NUDGE_MAX, 0))
    if (v !== 0) out[axis] = v
  }
  return out
}

/**
 * The stamps: keys of the form `axis.reason`, whole years in range, at most AT_MAX (the latest stay, ties by key), keys sorted. Looks
 * at no more than AT_SCAN keys, so a hostile record costs a bounded amount.
 */
function readStamps(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(raw)) return out
  const keys = Object.keys(raw)
  const rows: [string, number][] = []
  for (let i = 0; i < keys.length && i < AT_SCAN; i++) {
    const key = keys[i] as string
    const v = raw[key]
    if (!STAMP.test(key) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > YEAR_MAX) continue
    rows.push([key, Math.round(v)])
  }
  rows.sort((a, b) => b[1] - a[1] || byKey(a, b))
  for (const [key, year] of rows.slice(0, AT_MAX).sort(byKey)) out[key] = year
  return out
}

/** A record cut to its ranges, with the keys in one fixed order. Total: anything that is not a record becomes the defaults. */
function cleanPersona(owner: string, raw: unknown): PersonaMe {
  const r: Record<string, unknown> = isRecord(raw) ? raw : {}
  return { v: 1, owner, n: readNudges(hasOwn(r, 'n') ? r.n : undefined), at: readStamps(hasOwn(r, 'at') ? r.at : undefined) }
}

/**
 * The player's record. Total and pure: a life that never nudged, another life's record and anything a save may hold read as the
 * defaults or as a bounded version of what is there. Each call returns a fresh object, so a caller can edit it and `writePersona` it.
 */
export function readPersona(g: GameState): PersonaMe {
  const raw = g.flags[PERSONA_KEY]
  const owner = ownerOf(g)
  return cleanPersona(owner, isRecord(raw) && raw.owner === owner ? raw : null)
}

/**
 * Stores the record, cut to its ranges and stamped with this life as the owner. A record with no nudge and no stamp stores nothing
 * and removes the key, so a life that is back to untouched is byte for byte what it was before it ever looked. A record whose
 * nudges cancel out but whose stamps remain stays: the stamps are what keep a reason from being nudged twice in a year.
 */
export function writePersona(g: GameState, p: PersonaMe): void {
  const clean = cleanPersona(ownerOf(g), p)
  if (Object.keys(clean.n).length === 0 && Object.keys(clean.at).length === 0) delete g.flags[PERSONA_KEY]
  else g.flags[PERSONA_KEY] = clean as unknown as Json
}

/** `by` as a whole step of 1 to NUDGE_STEP either way; 0 when it is nothing (not a number, not finite, or under a half). */
function stepOf(by: unknown): number {
  if (typeof by !== 'number' || !Number.isFinite(by)) return 0
  const whole = Math.round(by)
  if (whole === 0) return 0
  return whole < -NUDGE_STEP ? -NUDGE_STEP : whole > NUDGE_STEP ? NUDGE_STEP : whole
}

/**
 * Leans one axis of the player a little and returns what it added (0 when nothing changed). `by` is cut to a whole number within
 * +-NUDGE_STEP; the axis is one of NUDGE_AXES (never ambition); `why` is a short lower-case word. Refused, with nothing written,
 * for a dead character, a second call for the same (axis, reason, year), and a call that would add nothing because the axis is at
 * +-NUDGE_MAX. Only the stamp of the reason is kept, so the record stays small whatever is passed in. Draws nothing, books nothing.
 */
export function nudgePersona(g: GameState, axis: NudgeAxis, by: number, why: string): number {
  if (g.character.alive !== true) return 0
  if (typeof axis !== 'string' || !NUDGE_AXES.includes(axis)) return 0
  if (typeof why !== 'string' || !REASON.test(why)) return 0
  const step = stepOf(by)
  if (step === 0) return 0
  const year = yearOf(g)
  const rec = readPersona(g)
  const key = `${axis}.${why}`
  if (rec.at[key] === year) return 0
  const cur = rec.n[axis] ?? 0
  const next = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, cur + step))
  const added = next - cur
  if (added === 0) return 0
  // A full record gives up its oldest stamp for a new reason, but never one from this year or later: that would let the same
  // (axis, reason, year) be nudged twice. When every stamp is that fresh the call is refused.
  if (!hasOwn(rec.at, key) && Object.keys(rec.at).length >= AT_MAX) {
    const oldest = Object.entries(rec.at).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0] as [string, number]
    if (oldest[1] >= year) return 0
    delete rec.at[oldest[0]]
  }
  rec.at[key] = year
  if (next === 0) delete rec.n[axis]
  else rec.n[axis] = next
  writePersona(g, rec)
  return added
}

/**
 * The player's five axes: the inference plus the nudges, cut to 0..100. Ambition is `ambitionOf(g)` unrounded and carries no nudge
 * (a nudge never reaches it); the other four are whole numbers. Pure and total.
 */
export function personaOf(g: GameState): Axes {
  const base = inferAxes(g)
  const n = readPersona(g).n
  const lean = (id: NudgeAxis): number => Math.round(clampNum(base[id] + (n[id] ?? 0), 0, 100, MID))
  return { ambition: base.ambition, honesty: lean('honesty'), empathy: lean('empathy'), risk: lean('risk'), steadiness: lean('steadiness') }
}
