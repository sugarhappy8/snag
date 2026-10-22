// R3-H2 (H.1): the estimate core. know(g, key, truth) turns a hidden number into what the player is allowed to read: a reading, an
// 80% band, a confidence and the words a menu prints. Honest, stable and pure:
//
//   honest  the reading is the truth plus a noise draw of the sd the band is built from, and the band is +-BAND_Z sd around it, so
//           the truth lies inside with probability .80 (the draw is a unit-variance, near-normal sum: normal.ts). The sd comes
//           from the rule table (keys.ts), is sharpened by a talent and by exposure, and is floored at SD_MIN.
//   stable  the draw is a hash of (life, key, year, source): the same read twice in a year is the same number, another year or
//           another source another one.
//   pure    nothing is written and g.rng is never read. The truth is an argument; nothing here reads a market, a roll or a year
//           after g.year. In Exact mode, for an own: key and for a truth that cannot be fogged, the answer is the truth itself.
//
// A stored reading (a bought report, kept by record.ts) is passed as `row`; know() finds it in the record. It ages with
// sqrt(sd^2 + drift^2 years) and is shown instead of the passive read when its aged sd is the lower one. That choice looks at sd
// and never at the truth, so coverage holds.
//
// Scales. money, count and pct are noisy on a log scale (a relative sd, the band is a ratio); score (0..100), odds (0..1) and delta
// (a signed amount, sd x scale) are additive. At the edge of a bounded scale the band is clipped, which only ever makes it hold
// the truth a little more than 80% of the time.
import { hasMainCharacter, hasTalent } from '../talents'
import type { GameState } from '../types'
import { exactWords, wordsFor } from './format'
import { isExactKey, ruleOf } from './keys'
import { isExact } from './mode'
import { zOf } from './normal'
import { storedRow } from './rows'
import type { Estimate, EstimateOpts, StoredRow, Unit } from './types'

/** The half width of the 80% band in sd, for the unit-variance draw of normal.ts (the exact point is 1.2969). */
export const BAND_Z = 1.298
/** No merged or shown band is sharper than 3%. */
export const SD_MIN = 0.03

const PASSIVE_TALENT = 0.6
const SOURCE_TALENT = 0.8
/** Full exposure (the player's own presence) cuts the passive sd by this much. */
const EXPOSURE = 0.4
const EPS = 1e-9

const isLog = (u: Unit): boolean => u === 'money' || u === 'count' || u === 'pct'
const finite = (v: number): number => (Number.isFinite(v) ? v : 0)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** The sd of a reading after it has aged `years`: the truth drifts `drift` a year and the drifts add as a random walk. */
export function agedSd(sd: number, drift: number, years: number): number {
  const s = Number.isFinite(sd) && sd > 0 ? sd : 0
  const d = Number.isFinite(drift) && drift > 0 ? drift : 0
  const y = Number.isFinite(years) && years > 0 ? years : 0
  return Math.sqrt(s * s + d * d * y)
}

interface Reading {
  mid: number
  sd: number
}

const readable = (r: Reading, log: boolean): boolean => Number.isFinite(r.mid) && Number.isFinite(r.sd) && r.sd > 0 && (!log || r.mid > 0)

/**
 * Two independent readings of one number, as one: inverse variance in the scale of the unit (geometric on a log unit), the sd
 * floored at SD_MIN. A reading that cannot be used leaves the other one.
 */
export function mergeReadings(a: Reading, b: Reading, unit: Unit): Reading {
  const log = isLog(unit)
  const okA = readable(a, log)
  const okB = readable(b, log)
  if (!okA && !okB) return { mid: finite(a.mid), sd: 1 }
  if (!okA) return { mid: b.mid, sd: Math.max(SD_MIN, b.sd) }
  if (!okB) return { mid: a.mid, sd: Math.max(SD_MIN, a.sd) }
  const wa = 1 / (a.sd * a.sd)
  const wb = 1 / (b.sd * b.sd)
  const sd = Math.max(SD_MIN, 1 / Math.sqrt(wa + wb))
  if (!log) return { mid: (a.mid * wa + b.mid * wb) / (wa + wb), sd }
  return { mid: Math.exp((Math.log(a.mid) * wa + Math.log(b.mid) * wb) / (wa + wb)), sd }
}

/**
 * How much this character's talents narrow the sd of a read on this key: x.6 for the passive read, x.8 for a purchased source,
 * 1 when no talent applies. The kind's talents (keys.ts) count, a `hint:` key counts the caller's `talent`, and Main Character
 * counts for every key. An own: key or a key with no row is never sharpened.
 */
export function sharpFactor(g: GameState, key: string, role: 'passive' | 'source', talent?: string): number {
  const rule = ruleOf(key)
  if (!rule) return 1
  const sharp =
    hasMainCharacter(g) || rule.talents.some((t) => hasTalent(g, t)) || (rule.byOpts === true && talent !== undefined && hasTalent(g, talent))
  return sharp ? (role === 'passive' ? PASSIVE_TALENT : SOURCE_TALENT) : 1
}

/** The 80% band round a reading: +-BAND_Z sd in the scale of the unit, clipped to the range of a bounded unit. */
function bandOf(unit: Unit, mid: number, sd: number, span: number): { lo: number; hi: number } {
  const half = BAND_Z * sd
  if (isLog(unit)) return { lo: mid * Math.exp(-half), hi: mid * Math.exp(half) }
  const lo = mid - span * half
  const hi = mid + span * half
  if (unit === 'score') return { lo: clamp(lo, 0, 100), hi: clamp(hi, 0, 100) }
  if (unit === 'odds') return { lo: clamp(lo, 0, 1), hi: clamp(hi, 0, 1) }
  return { lo, hi }
}

const confOf = (sd: number): 0 | 1 | 2 | 3 => (sd <= 0.06 + EPS ? 3 : sd <= 0.15 + EPS ? 2 : sd <= 0.3 + EPS ? 1 : 0)

/** The estimate of a number that is not fogged: the truth, with no band. */
function exactEstimate(g: GameState, key: string, unit: Unit, truth: number): Estimate {
  const t = finite(truth)
  return { key, mid: t, lo: t, hi: t, sd: 0, conf: 3, y: g.year, src: 'exact', exact: true, words: exactWords(unit, t) }
}

/** A stored row that can be used today: finite, positive where the scale is a log, and not from a year after g.year. */
function usableRow(g: GameState, row: StoredRow | null | undefined, log: boolean): StoredRow | null {
  if (!row || typeof row !== 'object') return null
  if (!readable({ mid: row.mid, sd: row.sd }, log)) return null
  if (!Number.isFinite(row.y) || row.y > g.year || typeof row.src !== 'string') return null
  return row
}

/** The width of one unit of sd, in the unit of the truth; null when the truth cannot be read on this unit's scale. */
export function spanOf(unit: Unit, truth: number, scale: number | undefined): number | null {
  switch (unit) {
    case 'money':
    case 'count':
    case 'pct':
      return truth > 0 ? 1 : null
    case 'score':
      return 100
    case 'odds':
      return 1
    case 'delta': {
      const s = typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : Math.abs(truth)
      return s > 0 ? s : null
    }
  }
}

/**
 * A reading of `truth`: the truth plus one unit-variance draw `z` of relative sd `sd`, on the scale of the unit (a ratio on a log
 * unit, `span` hundredths on a bounded or signed one), kept inside the range of a bounded unit. The one place a noisy read is made:
 * the passive read here and every purchased source (intel.ts) use it, so they cannot drift apart. `span` is spanOf(unit, ...).
 */
export function applyNoise(unit: Unit, truth: number, sd: number, z: number, span: number): number {
  const noise = sd * z
  if (isLog(unit)) return truth * Math.exp(noise)
  const lo = unit === 'score' || unit === 'odds' ? 0 : Number.NEGATIVE_INFINITY
  const hi = unit === 'score' ? 100 : unit === 'odds' ? 1 : Number.POSITIVE_INFINITY
  return clamp(clamp(truth, lo, hi) + span * noise, lo, hi)
}

/**
 * The estimate of `truth` for `key`, with the stored reading `opts.row` explicit (tests and tools; know() reads the record).
 * The unit comes from the rule row, or `opts.unit` when given.
 */
export function estimate(g: GameState, key: string, truth: number, opts: EstimateOpts & { row?: StoredRow | null } = {}): Estimate {
  const rule = isExactKey(key) ? null : ruleOf(key)
  const unit: Unit = opts.unit ?? rule?.unit ?? 'money'
  if (isExact() || !rule || !Number.isFinite(truth)) return exactEstimate(g, key, unit, truth)
  const span = spanOf(unit, truth, opts.scale)
  if (span === null) return exactEstimate(g, key, unit, truth)

  const log = isLog(unit)
  const bounded: [number, number] | null = unit === 'score' ? [0, 100] : unit === 'odds' ? [0, 1] : null

  const exposure = clamp(finite(opts.exp ?? 0), 0, 1)
  const passiveSd = Math.max(SD_MIN, rule.sd0 * sharpFactor(g, key, 'passive', opts.talent) * (1 - EXPOSURE * exposure))
  const row = usableRow(g, opts.row, log)
  const rowSd = row ? Math.max(SD_MIN, agedSd(row.sd, rule.drift, g.year - row.y)) : Number.POSITIVE_INFINITY

  let sd = passiveSd
  let mid: number
  let y = g.year
  let src = 'passive'
  let asOf: number | undefined
  if (row && rowSd < passiveSd) {
    sd = rowSd
    mid = row.mid
    y = row.y
    src = row.src
    if (g.year - row.y >= 2) asOf = row.y
  } else {
    mid = applyNoise(unit, truth, sd, zOf(g, key, g.year, 'passive'), span)
  }

  // A bounded scale keeps the reading inside its range; the band follows the kept reading and is clipped to the range.
  if (bounded) mid = clamp(mid, bounded[0], bounded[1])
  const { lo, hi } = bandOf(unit, mid, sd, span)
  if (![mid, lo, hi, sd].every(Number.isFinite)) return exactEstimate(g, key, unit, truth)

  const conf = confOf(sd)
  return {
    key,
    mid,
    lo,
    hi,
    sd,
    conf,
    y,
    src,
    exact: false,
    ...(asOf !== undefined ? { asOf } : {}),
    words: wordsFor(unit, { mid, lo, hi, conf }, opts.ladder),
  }
}

/**
 * The call most screens make: what the player is allowed to read for `key` whose real value is `truth`. In Exact mode, for an own:
 * key and for a truth that cannot be fogged, the Estimate is exact (`exact: true`) and the caller keeps its old text.
 */
export function know(g: GameState, key: string, truth: number, opts: EstimateOpts = {}): Estimate {
  // Exact mode and an own: key never show a stored reading, so the record is not even opened for them.
  const row = isExact() || isExactKey(key) ? null : storedRow(g, key, opts.unit)
  return estimate(g, key, truth, row ? { ...opts, row } : opts)
}

/**
 * What a stored reading says on its own, aged to g.year, with no truth to compare it to (the Briefing hub lists these). Null when
 * the key has no rule, no unit (a hint key without `opts.unit`), or the row cannot be used today. A delta is measured against
 * `opts.scale`, else the size of the reading itself.
 */
export function rowEstimate(g: GameState, key: string, row: StoredRow, opts: EstimateOpts = {}): Estimate | null {
  const rule = isExactKey(key) ? null : ruleOf(key)
  const unit: Unit | null = rule ? (opts.unit ?? rule.unit) : null
  if (!rule || unit === null || !usableRow(g, row, isLog(unit))) return null
  const span = spanOf(unit, row.mid, opts.scale)
  if (span === null) return null
  const sd = Math.max(SD_MIN, agedSd(row.sd, rule.drift, g.year - row.y))
  const mid = unit === 'score' ? clamp(row.mid, 0, 100) : unit === 'odds' ? clamp(row.mid, 0, 1) : row.mid
  const { lo, hi } = bandOf(unit, mid, sd, span)
  if (![mid, lo, hi, sd].every(Number.isFinite)) return null
  const conf = confOf(sd)
  return {
    key,
    mid,
    lo,
    hi,
    sd,
    conf,
    y: row.y,
    src: row.src,
    exact: false,
    ...(g.year - row.y >= 2 ? { asOf: row.y } : {}),
    words: wordsFor(unit, { mid, lo, hi, conf }, opts.ladder),
  }
}

/** know(...).mid: the number a hint helper ranks on. */
export function readValue(g: GameState, key: string, truth: number, opts: EstimateOpts = {}): number {
  return know(g, key, truth, opts).mid
}
