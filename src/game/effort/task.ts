// The task builder (R3, C.1). A Task says what a kind of work costs, how fast it goes and how its odds and quality respond to money,
// calibrated to today's numbers; `quote` (engine.ts) reads it and nothing else about the kind of work. Every migrated system builds
// its Task with `defineTask` from live numbers, so the builder refuses what it can't honestly use and cuts what is merely too big.
//
// Refused (it throws, a bug in the caller): a spec that is not an object; a `field` that fails FIELD_RE; a mode it doesn't know; a
// `cost` not above 0; a `kmax` outside K_MIN..K_MAX; a `hardness` outside 0.5..2; a `fteCap` not above 0 or above FTE_CAP_MAX; a
// number that is not a finite number; a range that runs backwards (minYears above maxYears, oddsLo above oddsHi, quality lo above
// hi); a `baseYears` not above 0. Cut to its documented range (the caller's computed odds may round just past an edge): p0, the two
// exponents, the odds clamps, the years, crewPts, spread, partial, learn, knowYears, and the parts of the crew, curve and hit.
//
// Build a task inside a function. A module-level `const T = defineTask(...)` reads an import while the module loads, and rule (d) of
// the layer ratchet holds that per file. The result is frozen: copy it with a spread to change a number.
import { CREW_PTS_MAX, FTE_CAP_MAX, K_MAX, K_MIN } from './limits'
import { clampNum, hasOwn, isRecord } from './num'
import type { EffortMode, QualityCurve, Task, TaskSpec } from './types'

/** A know-how key: a lower case letter, then letters, digits and dots, at most 40 characters in all ('dt.aiLab.cap.reasoning'). */
const FIELD_RE = /^[a-z][a-zA-Z0-9.]{0,39}$/
const MODES: readonly EffortMode[] = ['project', 'practice', 'study', 'intel']

/** Whether `v` is a string with the shape of a field key. */
export function isField(v: unknown): v is string {
  return typeof v === 'string' && FIELD_RE.test(v)
}

/** The value of an own key, or undefined (an inherited key, like a missing one, is not part of a spec). */
function own(o: Record<string, unknown>, key: string): unknown {
  return hasOwn(o, key) ? o[key] : undefined
}

/** A finite number from `o[key]`, or `dflt` when the key is missing or undefined. Anything else that is not a finite number throws. */
function numAt(o: Record<string, unknown>, key: string, dflt: number, label: string = key): number {
  const v = own(o, key)
  if (v === undefined) return dflt
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`defineTask: ${label} must be a finite number`)
  return v
}

/** A nested record, or null when the key is missing, undefined or null. Anything else that is not a plain object throws. */
function recordAt(o: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = own(o, key)
  if (v === undefined || v === null) return null
  if (!isRecord(v)) throw new Error(`defineTask: ${key} must be an object or null`)
  return v
}

function crewOf(s: Record<string, unknown>): Task['refCrew'] {
  const r = recordAt(s, 'refCrew')
  if (r === null) return null
  // A reference crew of 0 people or 0 skill would divide the crew ratio by zero, so both have a floor.
  return Object.freeze({ fte: clampNum(numAt(r, 'fte', 1, 'refCrew.fte'), 0.1, FTE_CAP_MAX), skill: clampNum(numAt(r, 'skill', 50, 'refCrew.skill'), 1, 100) })
}

function curveOf(s: Record<string, unknown>): QualityCurve | null {
  const r = recordAt(s, 'quality')
  if (r === null) return null
  const lo = numAt(r, 'lo', 0, 'quality.lo')
  const hi = numAt(r, 'hi', 100, 'quality.hi')
  if (lo > hi) throw new Error('defineTask: quality.lo is above quality.hi')
  return Object.freeze({
    up: clampNum(numAt(r, 'up', 0, 'quality.up'), 0, 1e6),
    down: clampNum(numAt(r, 'down', 0, 'quality.down'), 0, 1e6),
    exp: clampNum(numAt(r, 'exp', 1, 'quality.exp'), 0.05, 4),
    ceiling: numAt(r, 'ceiling', hi, 'quality.ceiling'),
    room: clampNum(numAt(r, 'room', 0, 'quality.room'), 0, 1e6),
    lo,
    hi,
  })
}

function hitOf(s: Record<string, unknown>): Task['hit'] {
  const r = recordAt(s, 'hit')
  if (r === null) return null
  return Object.freeze({ p: clampNum(numAt(r, 'p', 0, 'hit.p'), 0, 0.5), bonus: numAt(r, 'bonus', 0, 'hit.bonus') })
}

/**
 * Builds a Task from a spec: fills the defaults, checks the bounds, returns a frozen copy that shares nothing with the spec. Only
 * the spec's own keys count. See the header for what throws. Defaults: p0 .5, baseYears 2, hardness 1, minYears 1, maxYears 6,
 * kmax K_MAX, oddsExp .4, yearsExp .5, oddsLo .02, oddsHi .98, fteCap 6, crewPts 6, spread 8, partial 0, learn 12, knowYears 0,
 * and no crew, no quality curve and no hit.
 */
export function defineTask(spec: TaskSpec): Task {
  if (!isRecord(spec)) throw new Error('defineTask: the spec is not an object')
  const s = spec as unknown as Record<string, unknown>

  const field = own(s, 'field')
  if (!isField(field)) throw new Error(`defineTask: bad field ${typeof field === 'string' ? JSON.stringify(field.slice(0, 50)) : typeof field}`)
  const mode = own(s, 'mode')
  if (typeof mode !== 'string' || !MODES.includes(mode as EffortMode)) throw new Error('defineTask: unknown mode')

  const cost = numAt(s, 'cost', Number.NaN)
  if (!(cost > 0)) throw new Error('defineTask: cost must be above 0')
  const kmax = numAt(s, 'kmax', K_MAX)
  if (kmax > K_MAX || kmax < K_MIN) throw new Error(`defineTask: kmax must be ${K_MIN} to ${K_MAX}`)
  const hardness = numAt(s, 'hardness', 1)
  if (!(hardness >= 0.5 && hardness <= 2)) throw new Error('defineTask: hardness must be 0.5 to 2')
  const fteCap = numAt(s, 'fteCap', 6)
  if (!(fteCap > 0) || fteCap > FTE_CAP_MAX) throw new Error(`defineTask: fteCap must be above 0 and at most ${FTE_CAP_MAX}`)

  const baseYears = numAt(s, 'baseYears', 2)
  if (!(baseYears > 0)) throw new Error('defineTask: baseYears must be above 0')
  const minYears = clampNum(numAt(s, 'minYears', 1), 0, 50)
  const maxYears = clampNum(numAt(s, 'maxYears', 6), 0, 50)
  if (minYears > maxYears) throw new Error('defineTask: minYears is above maxYears')
  const oddsLo = clampNum(numAt(s, 'oddsLo', 0.02), 0, 1)
  const oddsHi = clampNum(numAt(s, 'oddsHi', 0.98), 0, 1)
  if (oddsLo > oddsHi) throw new Error('defineTask: oddsLo is above oddsHi')

  return Object.freeze({
    field,
    mode: mode as EffortMode,
    cost,
    hardness,
    baseYears: clampNum(baseYears, 0, 50),
    minYears,
    maxYears,
    kmax,
    p0: clampNum(numAt(s, 'p0', 0.5), 0, 1),
    oddsExp: clampNum(numAt(s, 'oddsExp', 0.4), 0, 2),
    yearsExp: clampNum(numAt(s, 'yearsExp', 0.5), 0, 2),
    oddsLo,
    oddsHi,
    fteCap,
    refCrew: crewOf(s),
    crewPts: clampNum(numAt(s, 'crewPts', 6), 0, CREW_PTS_MAX),
    quality: curveOf(s),
    hit: hitOf(s),
    spread: clampNum(numAt(s, 'spread', 8), 0, 50),
    partial: clampNum(numAt(s, 'partial', 0), 0, 0.5),
    learn: clampNum(numAt(s, 'learn', 12), 0, 50),
    knowYears: clampNum(numAt(s, 'knowYears', 0), 0, 0.15),
  })
}

/** A Task from anything (a record read back from JSON, a hostile value): the task `defineTask` would build, or null. Never throws. */
export function normalizeTask(raw: unknown): Task | null {
  if (!isRecord(raw)) return null
  try {
    return defineTask(raw as unknown as TaskSpec)
  } catch {
    return null
  }
}
