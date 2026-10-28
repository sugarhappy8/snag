// The five axes of a person, and what they mean in words and in a voice (R4-S2, D.2 a). Four things, all pure, none read by a played
// life in R4 (the persona is stored but unwired, X18):
//
//   TRAIT_AXES / axesFromTraits    what each of the 30 trait words (and `spoiled`) means as numbers: ambition, honesty, empathy, risk,
//                                  steadiness, whole numbers 0 to 100 with 50 neutral. A word is a delta around 50; a person is 50 plus the
//                                  deltas of their words, cut to 5..95.
//   labelsFromAxes                 the way back: the words a set of axes wears, so a person made from a slot (Met record, R4-S3/S4) has
//                                  words every old reader (temper, driveOf, integrityFor, styleFor) already understands.
//   STAFF_AXES / axesFromStaff     the same for the 13 staff traits of business/flavor.ts. Ambition is STAFF_DRIVE (effort/persona.ts), read
//                                  when the function runs, never copied into a table here.
//   VOICES / voiceOf               six narrator voices, each a prototype in axis space; the nearest prototype speaks.
//   TRAIT_SETS                     the four trait sets that events/will-core.ts reads (forgiving, petulant, gossips, discreet), lifted word
//                                  for word; will-core reads them from here since R4-S10.
//   DRIVE_TRAITS / INTEGRITY_TRAITS  the drive table of business/nepo-model.ts and the integrity deltas of business/nepo-succession.ts,
//                                  moved here verbatim (same keys, same values, same order) by R4-S10; both readers read them from here.
//
// These tables are design data and freeze at the first recording (cross-check 3.3, X57): Met records store axis tuples built from
// them, and R5's composer picks a voice with voiceOf. AXIS_IDS and VOICES are frozen. A changed value afterwards needs a RECORD_REASON,
// a row in moved-tests.md and the lead's OK. test/world-axes.test.ts holds the shape: the 30 words equal TRAITS (the list is written out
// here because people.ts is layer 3 and this file is layer 2), every delta is whole and within 35, a single word comes back as its own
// label, a pair of words keeps one of its two words, and no voice holds more than 40% of the grid.
//
// Total on purpose: a caller may hand any of these anything (a word list read from a save, axes from a hostile record). A word nobody
// knows counts for nothing, a value that is not a number reads as 50, a number out of range is cut to the range, and nothing throws,
// reads the prototype chain, draws a random number or touches the game. Plain tables and numbers: nothing is stored, so nothing here
// can move a save, a seed or a golden digest.
//
// The only import is effort/persona (same layer); the module-level tables read nothing that is imported (rule (d) of the layers test).
import { staffDrive } from '../effort/persona'

// --- The axes -------------------------------------------------------------------------------------------------------------------------

/** The five axes in the order of every stored tuple (MetRecord.a). Frozen: R5 and R6 code against it. */
export const AXIS_IDS = Object.freeze(['ambition', 'honesty', 'empathy', 'risk', 'steadiness'] as const)
export type AxisId = (typeof AXIS_IDS)[number]
/** 0..100 and 50 neutral: whole numbers from the tables and in any stored tuple; the player's ambition is ambitionOf(g), which has two decimals. */
export type Axes = Record<AxisId, number>
/** The stored form, in AXIS_IDS order. */
export type AxisTuple = readonly [number, number, number, number, number]

const MID = 50
/** What `axesFromTraits` and `axesFromStaff` cut a sum to: a person is never a pure extreme, whatever the words stack up to. */
const SUM_LO = 5
const SUM_HI = 95

function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key)
}

/** `v` cut to `lo..hi`; anything that is not a finite number is `fallback`. */
function cutNum(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return v < lo ? lo : v > hi ? hi : v
}

/** One axis of a record that may be anything: its own number cut to 0..100, else 50. */
function axisOf(a: unknown, id: AxisId): number {
  if (typeof a !== 'object' || a === null || !hasOwn(a, id)) return MID
  return cutNum((a as Record<string, unknown>)[id], 0, 100, MID)
}

/** 50 plus a sum of deltas, per axis, whole and cut to 5..95. */
function fromSums(sums: readonly number[]): Axes {
  const at = (i: number): number => Math.round(cutNum(MID + (sums[i] ?? 0), SUM_LO, SUM_HI, MID))
  return { ambition: at(0), honesty: at(1), empathy: at(2), risk: at(3), steadiness: at(4) }
}

/** A table frozen to the bottom: the table and every row. */
function frozenTable<T extends Record<string, Partial<Axes>>>(t: T): Readonly<T> {
  for (const k of Object.keys(t)) Object.freeze(t[k])
  return Object.freeze(t)
}

// --- Words -> axes --------------------------------------------------------------------------------------------------------------------

/**
 * Deltas around 50 for the 30 words of TRAITS (people.ts), in TRAITS order, and `spoiled` (written by wealth-core.ts). 31 entries.
 * A delta is a whole number within 35; a word names only the axes it moves. Ambition: how hard the person drives. Honesty: how straight
 * they play. Empathy: how much they care how it lands on others. Risk: how much they gamble, speak up or act without a net. Steadiness:
 * how even they stay when it goes wrong.
 */
export const TRAIT_AXES: Readonly<Record<string, Partial<Axes>>> = frozenTable({
  kind: { honesty: 10, empathy: 16, risk: 2 },
  generous: { ambition: -3, empathy: 12, risk: 11 },
  stingy: { ambition: 10, empathy: -22, risk: -20 },
  'hot-headed': { honesty: 4, risk: 12, steadiness: -26 },
  calm: { steadiness: 22 },
  funny: { empathy: 5, risk: 15 },
  serious: { ambition: 16, steadiness: 12 },
  ambitious: { ambition: 22, risk: 3 },
  lazy: { ambition: -33 },
  jealous: { ambition: 3, honesty: -12, empathy: -20, steadiness: -24 },
  loyal: { honesty: 5, empathy: 5, steadiness: 20 },
  manipulative: { ambition: 10, honesty: -29, empathy: -6, risk: 1 },
  shy: { ambition: -11, risk: -28 },
  outgoing: { ambition: 5, empathy: 12, risk: 10, steadiness: 5 },
  nerdy: { ambition: 12, honesty: 6, risk: -16, steadiness: 12 },
  sporty: { risk: 14, steadiness: 10 },
  artistic: { ambition: 3, empathy: 9, risk: 13 },
  religious: { honesty: 13, empathy: 11, risk: -17 },
  rebellious: { risk: 16 },
  anxious: { ambition: -9, empathy: 2, risk: -13, steadiness: -29 },
  optimistic: { empathy: 6, risk: 11, steadiness: 11 },
  grumpy: { empathy: -30 },
  romantic: { honesty: 3, empathy: 8, risk: 13, steadiness: -2 },
  flirty: { honesty: -4, empathy: 10, risk: 12, steadiness: -2 },
  honest: { honesty: 26 },
  sneaky: { honesty: -33 },
  dramatic: { ambition: 5, risk: 5, steadiness: -27 },
  caring: { empathy: 22 },
  arrogant: { ambition: 14, honesty: -8, empathy: -26 },
  gullible: { honesty: 11, risk: 14 },
  spoiled: { ambition: -10, honesty: -6, empathy: -18, risk: 8, steadiness: -10 },
})

/** Whole numbers, 5..95: 50 plus the deltas of the person's words. A word nobody knows counts for nothing; a word listed twice counts once. */
export function axesFromTraits(traits: readonly string[]): Axes {
  const sums = [0, 0, 0, 0, 0]
  if (Array.isArray(traits)) {
    const seen = new Set<string>()
    const n = Math.min(traits.length, 64)
    for (let i = 0; i < n; i++) {
      const w: unknown = traits[i]
      if (typeof w !== 'string' || seen.has(w) || !hasOwn(TRAIT_AXES, w)) continue
      seen.add(w)
      const row = TRAIT_AXES[w]!
      AXIS_IDS.forEach((id, j) => {
        sums[j] = (sums[j] ?? 0) + (row[id] ?? 0)
      })
    }
  }
  return fromSums(sums)
}

// --- Axes -> words --------------------------------------------------------------------------------------------------------------------

/**
 * The least alignment a word needs to be worn (its deltas dotted with how far each axis is from 50). A neutral person scores 0 on every
 * word and wears none; a person a point or two off neutral scores under it too. A word's own deltas score their squared length, which
 * is over twice the floor for all 30.
 */
export const LABEL_FLOOR = 120

/** The 30 words that can be worn (not `spoiled`, which a wealth rule writes), in TRAITS order, with their deltas in AXIS_IDS order. */
const WORN: readonly (readonly [string, readonly number[]])[] = Object.keys(TRAIT_AXES)
  .filter((w) => w !== 'spoiled')
  .map((w) => [w, AXIS_IDS.map((id) => TRAIT_AXES[w]![id] ?? 0)] as const)

/**
 * At most `n` (2) of the 30 words, strongest alignment first, ties by TRAITS order. A word scores the dot product of its deltas with
 * how far each axis is from 50, and must score over LABEL_FLOOR; a neutral person has no label. `n` that is not a number is 2.
 */
export function labelsFromAxes(a: Axes, n = 2): string[] {
  const k = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(WORN.length, Math.floor(n))) : 2
  if (k === 0) return []
  const x = AXIS_IDS.map((id) => axisOf(a, id) - MID)
  const worn: { w: string; i: number; s: number }[] = []
  WORN.forEach(([w, d], i) => {
    let s = 0
    for (let j = 0; j < x.length; j++) s += (d[j] ?? 0) * (x[j] ?? 0)
    if (s > LABEL_FLOOR) worn.push({ w, i, s })
  })
  worn.sort((p, q) => q.s - p.s || p.i - q.i)
  return worn.slice(0, k).map((r) => r.w)
}

// --- Staff ----------------------------------------------------------------------------------------------------------------------------

/**
 * The 13 ids of STAFF_TRAITS (business/flavor.ts; test/world-axes.test.ts holds the lists equal). Honesty, empathy and steadiness are
 * chosen; risk leans on the trait's embezzlement weight, 12 points for each 1.0 above or below 0.5 (shady: 3 gives +30). There is no
 * ambition here: it is STAFF_DRIVE (effort/persona.ts), read by axesFromStaff when it runs.
 */
export const STAFF_AXES: Readonly<Record<string, Partial<Axes>>> = frozenTable({
  workaholic: { empathy: -6, steadiness: -12 },
  perfectionist: { honesty: 6, empathy: -8, steadiness: -4 },
  charmer: { honesty: -6, empathy: 14, risk: 6, steadiness: 4 },
  pennyPincher: { honesty: 6, empathy: -10, risk: -2, steadiness: 6 },
  visionary: { empathy: -4, risk: 4, steadiness: -10 },
  steady: { honesty: 6, steadiness: 24 },
  prankster: { honesty: -2, empathy: 6, risk: 2, steadiness: -8 },
  gossip: { honesty: -10, empathy: -4, risk: 6, steadiness: -6 },
  lazy: { honesty: -4, empathy: -2, risk: 4, steadiness: -2 },
  overqualified: { empathy: -8, steadiness: -4 },
  nepo: { honesty: -8, empathy: -2, risk: 8, steadiness: -2 },
  shady: { honesty: -34, empathy: -12, risk: 30, steadiness: -4 },
  mentor: { honesty: 10, empathy: 24, risk: -2, steadiness: 16 },
})

/** The axes of a staff trait: its ambition is staffDrive(id), the rest 50 plus its row. A trait nobody knows, or no trait, is 50 everywhere. */
export function axesFromStaff(traitId: string | null | undefined): Axes {
  const row = typeof traitId === 'string' && hasOwn(STAFF_AXES, traitId) ? STAFF_AXES[traitId] : undefined
  const sums = AXIS_IDS.map((id) => (id === 'ambition' ? 0 : (row?.[id] ?? 0)))
  const axes = fromSums(sums)
  axes.ambition = Math.round(cutNum(staffDrive(traitId), 0, 100, MID))
  return axes
}

// --- Voices ---------------------------------------------------------------------------------------------------------------------------

/** The six narrator voices, in this order (an exact tie goes to the earlier). Frozen: the composer of R5 picks a line pool by it. */
export const VOICES = Object.freeze(['warm', 'blunt', 'dry', 'anxious', 'grand', 'sly'] as const)
export type VoiceId = (typeof VOICES)[number]

/**
 * Where each voice sits in axis space, in AXIS_IDS order (ambition, honesty, empathy, risk, steadiness). Warm: caring, honest, steady.
 * Blunt: honest, cool, bold. Dry: even-keeled, cautious, a little cool (a neutral person speaks dry). Anxious: unsteady, careful,
 * kind enough to worry. Grand: driven, bold, cool. Sly: driven, bold, crooked.
 */
export const VOICE_PROTOTYPES: Readonly<Record<VoiceId, AxisTuple>> = Object.freeze({
  warm: Object.freeze([50, 75, 85, 45, 65] as const),
  blunt: Object.freeze([55, 90, 25, 65, 55] as const),
  dry: Object.freeze([40, 60, 40, 30, 70] as const),
  anxious: Object.freeze([35, 55, 60, 20, 15] as const),
  grand: Object.freeze([85, 40, 30, 65, 60] as const),
  sly: Object.freeze([70, 15, 30, 65, 45] as const),
})

/** The voice whose prototype is nearest the axes (squared distance); an exact tie goes to the earlier in VOICES. Pure, takes no state. */
export function voiceOf(a: Axes): VoiceId {
  const x = AXIS_IDS.map((id) => axisOf(a, id))
  let best: VoiceId = VOICES[0]
  let bestD = Infinity
  for (const v of VOICES) {
    const p = VOICE_PROTOTYPES[v]
    let d = 0
    for (let j = 0; j < x.length; j++) d += ((x[j] ?? MID) - (p[j] ?? MID)) ** 2
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  return best
}

// --- Trait sets -----------------------------------------------------------------------------------------------------------------------

/**
 * The four sets of events/will-core.ts (the "Personality" block), word for word: who shrugs anger off, who carries it, who talks, who
 * keeps quiet. will-core reads them from here inside its functions (a module-level copy would be an eager read of an import, which the
 * layers test refuses); test/world-axes.test.ts holds them equal to the literals of v5.2.0 and to what the readers answer.
 */
export const TRAIT_SETS: {
  readonly forgiving: ReadonlySet<string>
  readonly petulant: ReadonlySet<string>
  readonly gossips: ReadonlySet<string>
  readonly discreet: ReadonlySet<string>
} = Object.freeze({
  forgiving: new Set(['kind', 'caring', 'calm', 'optimistic', 'generous', 'loyal']),
  petulant: new Set(['hot-headed', 'jealous', 'arrogant', 'dramatic', 'grumpy', 'manipulative', 'rebellious', 'spoiled', 'stingy']),
  gossips: new Set(['jealous', 'manipulative', 'sneaky', 'dramatic', 'outgoing']),
  discreet: new Set(['loyal', 'honest', 'calm', 'shy', 'serious']),
})

// --- Drive and integrity --------------------------------------------------------------------------------------------------------------

/**
 * How a word moves a relative's drive (business/nepo-model.ts driveOf): added to 35 plus 40 times a stable roll. Moved here word for word
 * from nepo-model.ts, in the same order, by R4-S10; every key is a word of TRAITS. driveOf reads it as `DRIVE_TRAITS[t] ?? 0`.
 */
export const DRIVE_TRAITS: Readonly<Record<string, number>> = Object.freeze({
  ambitious: 12,
  serious: 6,
  sporty: 4,
  nerdy: 4,
  loyal: 3,
  honest: 2,
  optimistic: 3,
  calm: 2,
  lazy: -22,
  rebellious: -4,
  arrogant: -3,
  anxious: -3,
  dramatic: -2,
})

/**
 * How a word moves how straight a relative plays (business/nepo-succession.ts integrityFor): added to 62 plus 20 times a stable roll,
 * in this order. Moved here word for word from the inline object of integrityFor by R4-S10; every key is a word of TRAITS.
 */
export const INTEGRITY_TRAITS: Readonly<Record<string, number>> = Object.freeze({
  honest: 15,
  loyal: 6,
  kind: 3,
  caring: 3,
  sneaky: -20,
  manipulative: -15,
  arrogant: -8,
  jealous: -4,
})
