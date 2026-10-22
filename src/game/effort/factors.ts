// The factors of a quote (R3-E3, C.1): the small pure pieces `quote` (engine.ts) puts together. Each takes numbers and returns a number
// or a short list of lines. Nothing here reads the game, makes a roll or moves money, so the same arguments always give the same answer.
//
//   moneyOdds    what the budget buys: `1 - (1 - base) * k^-oddsExp`, cut to the task's odds clamp (the shape of rd.ts, bit for bit)
//   *Pts         the odds points each deviation is worth, written once: tools, crew, know-how, a hard field, a tired maker
//   deviate      the deviations applied in logit space, so a term nudges the odds without ever pushing them past 0 or 1; the three
//                that carry a stated cap (know-how 15, public research 18, rival pressure 8) are added on top in odds points, so each
//                is worth exactly its points in the final odds however the other terms moved them (the R3-E9 probe)
//   attribute    the labelled lines: each term's own effect, rounded, with the rounding and the interactions put on the largest line
//   speedOf      how fast the work goes: crew, tools, ambition, fatigue and know-how, multiplied
//   risksOf      what a bold plan risks (reported, never rolled)
//
// At the neutral inputs (budget 1, ambition 50, steady, fatigue 0, no know-how, no tools, no crew) every deviation is exactly 0, the
// sum of the logit shifts is exactly 0, and the odds are the money odds untouched: an old formula routed through here gives the old
// answer bit for bit. The module-level consts below are literals (rule (d) of the layer ratchet); the limits are read inside functions.
import { CREW_PTS_MAX, EASY_FIELD_LABEL, HARD_PTS, OVERTIME_PAY, RISK_MAX, TERM_LABEL, TIRED_PTS, TOOLS_PTS } from './limits'
import { cutNum, hasOwn, isRecord } from './num'
import type { Posture, Reason, Task, TermKey } from './types'

/** The terms the engine works out itself, in the order their lines are attributed (the caller's own terms come first, then funding). */
export type DevKey = 'crew' | 'tools' | 'know' | 'hard' | 'rival' | 'spill' | 'bold' | 'tired'
export const DEV_ORDER: readonly DevKey[] = ['crew', 'tools', 'know', 'hard', 'rival', 'spill', 'bold', 'tired']

/** A probability is kept this far from 0 and 1 so its logit is finite. */
const P_EDGE = 1e-6
/** One term moves the logit by at most this much, whatever it is asked for. */
const STEP_MAX = 2
/** A bold plan pulls the logit of the odds toward 0 (even odds) by this share of itself, per unit of boldness. */
const BOLD_PULL = 0.25
/** The most terms the caller's own list may carry, and the longest label one may have. */
const BASE_TERMS_MAX = 12
const LABEL_MAX = 40

/** One line before rounding: a term and the odds points it moved, as a real number. */
export interface Piece {
  key: TermKey
  pts: number
}

/** Whether `v` names a term the odds line knows. */
export function isTermKey(v: unknown): v is TermKey {
  return typeof v === 'string' && hasOwn(TERM_LABEL, v)
}

/** `x` with the sign of zero dropped, so a quiet term is +0 and never -0 (which a deep equal tells apart). */
const nz = (x: number): number => (x === 0 ? 0 : x)

export function logit(p: number): number {
  const x = cutNum(p, P_EDGE, 1 - P_EDGE, 0.5)
  return Math.log(x / (1 - x))
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

/**
 * The odds that money buys: `1 - (1 - base) * k^-oddsExp`, cut to the task's `oddsLo..oddsHi`. With k = 1 the budget adds nothing, a
 * smaller budget costs odds, a larger one buys them with diminishing returns. Exactly the expression rd.ts uses for the product.
 */
export function moneyOdds(task: Pick<Task, 'oddsExp' | 'oddsLo' | 'oddsHi'>, base: number, k: number): number {
  const pk = 1 - (1 - base) * Math.pow(k, -task.oddsExp)
  return pk < task.oddsLo ? task.oddsLo : pk > task.oddsHi ? task.oddsHi : pk
}

/** Odds points good tools add: TOOLS_PTS at full (tools is 0..1, already cut). */
export function toolsPts(tools: number): number {
  return nz(TOOLS_PTS * tools)
}

/** Odds points the crew adds: `crewPts * log2(ratio)`, so a crew twice as fast adds `crewPts`, cut to plus or minus CREW_PTS_MAX. */
export function crewPtsOf(task: Pick<Task, 'crewPts'>, ratio: number): number {
  return nz(cutNum(task.crewPts * Math.log2(ratio), -CREW_PTS_MAX, CREW_PTS_MAX, 0))
}

/** Odds points a field's hardness costs (a field easier than most gives some back): `-HARD_PTS * (hardness - 1)`. */
export function hardPtsOf(hardness: number): number {
  return nz(-HARD_PTS * (hardness - 1))
}

/** Odds points a tired maker loses: `-TIRED_PTS * (1 - phi)` where phi is the pace fatigue leaves (1 when rested). */
export function tiredPtsOf(phi: number): number {
  return nz(-TIRED_PTS * (1 - phi))
}

/**
 * The logit shift that moves odds `pk` by `pts` odds points, exactly (so a term's line is the number it says), cut to plus or minus
 * 2 so a term near the edge of the range can't swing the odds. A shift never has the wrong sign. 0 for 0 points.
 */
function shiftFor(pts: number, pk: number, here: number): number {
  if (pts === 0) return 0
  const s = logit(pk + pts / 100) - here
  if (pts > 0) return s > 0 ? Math.min(s, STEP_MAX) : 0
  return s < 0 ? Math.max(s, -STEP_MAX) : 0
}

/** Whether a term is one of the three that carry a stated cap in odds points and so are added in points, not in logit space. */
const isFlat = (key: DevKey): key is 'know' | 'rival' | 'spill' => key === 'know' || key === 'rival' || key === 'spill'

/**
 * Applies the deviations to the money odds `pk`. `pts` holds the odds points of every term but `bold` (a bold plan is not worth
 * points: it pulls the logit toward even odds, so it costs a favourite and helps a long shot); `bold` is the boldness from `boldOf`.
 * Crew, tools, a hard field and tiredness are logit shifts that add up, so none can push the odds past 0 or 1. Know-how, rival
 * pressure and public research are added to that result in odds points instead: a logit shift sized at `pk` would grow when another
 * term pulled the odds toward even, and the stated caps (15, 8 and 18 points) would hold only for the term alone. Returns the odds,
 * cut to `lo..hi`, and each term's own effect in points (what it would move `pk` alone), in DEV_ORDER. With every term quiet the
 * shifts sum to exactly 0 and the odds are `pk` itself.
 */
export function deviate(pk: number, lo: number, hi: number, pts: Readonly<Record<Exclude<DevKey, 'bold'>, number>>, bold: number): { p: number; pieces: Piece[] } {
  const here = logit(pk)
  const pieces: Piece[] = []
  let sum = 0
  let flat = 0
  for (const key of DEV_ORDER) {
    if (isFlat(key)) {
      const v = pts[key]
      flat += v
      pieces.push({ key, pts: v === 0 ? 0 : (Math.min(1, Math.max(0, pk + v / 100)) - pk) * 100 })
      continue
    }
    const s = key === 'bold' ? (bold === 0 ? 0 : cutNum(-BOLD_PULL * bold * here, -STEP_MAX, STEP_MAX, 0)) : shiftFor(pts[key], pk, here)
    sum += s
    pieces.push({ key, pts: s === 0 ? 0 : (sigmoid(here + s) - pk) * 100 })
  }
  if (sum === 0 && flat === 0) return { p: pk, pieces }
  const p = (sum === 0 ? pk : sigmoid(here + sum)) + flat / 100
  return { p: p < lo ? lo : p > hi ? hi : p, pieces }
}

/** `x` rounded to a whole number of points, half away from zero (so +2.5 and -2.5 are 3 and -3). */
const roundPts = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x))

/** The words of a line: the term's label, or "easy field" for a hard-field line that came out positive. */
function labelOf(key: TermKey, pts: number): string {
  return key === 'hard' && pts > 0 ? EASY_FIELD_LABEL : TERM_LABEL[key]
}

/**
 * The labelled lines of the odds. Each piece is a term's own effect in points; each is rounded, then the lines are made to add up to
 * `round(p * 100) - round(base * 100)` exactly by putting what is left over (rounding, terms that interact, a clamp) on the line
 * whose own effect is the largest (the first, on a tie). A line that comes to 0 is left out. Pieces keep their order.
 */
export function attribute(base: number, p: number, pieces: readonly Piece[]): Reason[] {
  const lines = pieces.map((x) => roundPts(x.pts))
  const rest = Math.round(p * 100) - Math.round(base * 100) - lines.reduce((a, b) => a + b, 0)
  if (rest !== 0 && pieces.length > 0) {
    let at = 0
    for (let i = 1; i < pieces.length; i++) if (Math.abs(pieces[i]!.pts) > Math.abs(pieces[at]!.pts)) at = i
    lines[at] = lines[at]! + rest
  }
  const out: Reason[] = []
  pieces.forEach((x, i) => {
    const pts = lines[i]!
    if (pts !== 0) out.push({ key: x.key, label: labelOf(x.key, pts), pts })
  })
  return out
}

/**
 * The caller's own terms, cut to ones the odds line can print: at most BASE_TERMS_MAX rows, each with a known key, a finite number of
 * points (within plus or minus 100) and a label (the term's own when it has none). Fresh objects: nothing here aliases the caller's.
 */
export function cleanBaseTerms(raw: unknown): Reason[] {
  const out: Reason[] = []
  if (!Array.isArray(raw)) return out
  for (const r of raw as readonly unknown[]) {
    if (out.length >= BASE_TERMS_MAX) break
    if (!isRecord(r) || !isTermKey(r.key) || typeof r.pts !== 'number' || !Number.isFinite(r.pts)) continue
    const label = typeof r.label === 'string' && r.label !== '' ? r.label.slice(0, LABEL_MAX) : TERM_LABEL[r.key]
    out.push({ key: r.key, label, pts: nz(cutNum(r.pts, -100, 100, 0)) })
  }
  return out
}

/** The full-time people on a crew, as the crew ratio counts them: rows that are workers with some time, summed. */
export function totalFte(people: unknown): number {
  if (!Array.isArray(people)) return 0
  let fte = 0
  for (const w of people as readonly unknown[]) if (isRecord(w)) fte += cutNum(w.fte, 0, 1e6, 0)
  return fte
}

/**
 * How fast the work goes: the crew's pace, good tools (up to 30% faster), ambition's pace, the pace fatigue leaves, and know-how for
 * a task that speeds with it (`knowYears`, at most 15% at full know-how). 1 at the neutral inputs.
 */
export function speedOf(crew: number, tools: number, rho: number, phi: number, knowYears: number, know: number): number {
  return crew * (1 + 0.3 * tools) * rho * phi * (1 + (knowYears * know) / 100)
}

/**
 * What a bold plan risks, each at most RISK_MAX and all 0 for a plan that is not bold and not pushing: cutting a corner and a blow-up
 * grow with boldness (a blow-up with the field's hardness), and pushing carries a scandal risk of its own (overtime, burnt people).
 * Reported by `quote`, rolled by whoever migrates a system that wants it.
 */
export function risksOf(bold: number, hardness: number, posture: Posture): { shortcut: number; explosion: number; scandal: number } {
  const b = Math.max(0, bold)
  const cap = (x: number): number => Math.min(RISK_MAX, x)
  return { shortcut: cap(0.04 * b), explosion: cap(0.03 * b * hardness), scandal: posture === 'push' ? cap(0.02 + 0.02 * b) : 0 }
}

/** Payroll while pushing is 15% overtime; a steady or lean year pays as usual. */
export function payrollOf(posture: Posture): number {
  return posture === 'push' ? OVERTIME_PAY : 1
}
