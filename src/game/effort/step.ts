// What a run comes to and what it taught (R3-E5, C.1). `quote` says the odds; the caller makes the one draw it has always made and
// hands it to `resolve`, which says how the run came out; `landQuality` turns a second draw into a quality; `step` books what the
// run taught. This file draws nothing and books no dollar: the draws and the money stay with the caller, so every old draw order is
// kept (a project still draws one number, and a second only when it works).
//
//   resolve        works exactly when the draw is under the odds (a strict test, the game's own roll test), a partial result in the
//                  band just above, otherwise a failure with the cause its quote points to
//   causeOf        the largest negative line of a quote, named (funding starved it, a rival got there first), else a dead end
//   landQuality    the quote's quality, moved by the caller's draw within the spread, plus a hit's bonus, cut to the bounds
//   step           books a result once a year: a failed project banks know-how (damped, at most 15 odds points in all), a win lifts the
//                  player's ambition a little, the project's `fx` is updated in place, one Reveal is returned and the sink is told
//
// Where know-how goes: an explicit map in the context (a company's `knowHow`, by reference) takes it; with none, the player's own
// record (`flags['effort.you']`) does when the context says `who: 'you'`. An owner-run company gives both: the company learns, and the
// player's ambition still moves. With neither, nothing is banked and the run still reveals.
//
// Once a year: a step is a replay when its `fx` was last stepped this year, or, with no `fx` and the player's own record as the target,
// when that field was stepped this year. A caller that steps one field more than once a year gives each piece of work its own `fx`.
// A replay changes nothing, returns `replay: true` and tells nobody. A company's map with no `fx` has no stamp, so its caller steps each
// piece of work once.
//
// Everything is total: a task, an outcome, a context or a record that is not what it should be changes nothing or reads as neutral.
import type { GameState } from '../types'
import { knowBank, knowGain } from './curves'
import { normalizeFx } from './fx'
import { revealedSink } from './hooks'
import { knowHowOf, learnKnowHow } from './knowhow'
import { K_MAX } from './limits'
import { clampNum, hasOwn, isRecord, round2 } from './num'
import { readYou, recordWin, writeYou } from './persona'
import type { EffortYou } from './persona'
import { isField } from './task'
import type { CauseKind, Fx, Outcome, OutcomeKind, Quote, Reason, Reveal, StepCtx, StepResult, Task, TermKey } from './types'

const OUTCOMES: readonly OutcomeKind[] = ['fail', 'partial', 'works', 'hit']

/** What the largest loss was, by the term that caused it. A term not listed (a hard field, a weak team) is a dead end. */
const CAUSE_OF: Readonly<Partial<Record<TermKey, CauseKind>>> = Object.freeze({
  funding: 'starved',
  crew: 'churn',
  rival: 'rival',
  tired: 'tired',
  bold: 'shortcut',
})

/** The latest year a stamp may hold (the same bound the player's record uses). */
const YEAR_MAX = 9999
/** The most focus weeks one step books, and the hours in one. */
const WEEKS_MAX = 52
const HOURS_PER_WEEK = 40
/** How far a run that failed is taken to have got when its caller doesn't say. */
const HALF_DONE = 0.5
/** What a reveal is worth: a failure shows a third of how far it got, a win half and then half of how far again. */
const FAIL_REVEAL = 0.35
const WIN_REVEAL = 0.5

export interface ResolveOpts {
  /** The second draw, called only when the run works and the quote has hit odds; a hit when it is under `hitP`. */
  drawHit?: () => number
  /** How far the work got, 0 to 1. A win is whole; a run that didn't work is taken as half done when this is left out. */
  done?: number
  /** The extra odds of a half result (the task's `partial`, 0 for none). */
  partial?: number
}

/**
 * The cause of a failure, from the lines of its quote alone: the largest negative one (the first, on a tie) decides. Funding is
 * starved, crew churn, rival, tired, a bold plan a shortcut; any other term, or no negative line, is a dead end. Pure.
 */
export function causeOf(reasons: readonly Reason[]): CauseKind {
  if (!Array.isArray(reasons)) return 'deadEnd'
  let worst = 0
  let cause: CauseKind = 'deadEnd'
  for (const r of reasons as readonly unknown[]) {
    if (!isRecord(r) || typeof r.pts !== 'number' || !Number.isFinite(r.pts) || !(r.pts < worst)) continue
    worst = r.pts
    cause = typeof r.key === 'string' && hasOwn(CAUSE_OF, r.key) ? CAUSE_OF[r.key as TermKey]! : 'deadEnd'
  }
  return cause
}

/**
 * How a run came out, from the caller's one draw `u` (0 to 1): it works exactly when `u < q.p`, the game's own roll test.
 * If it works and the quote has hit odds, `opts.drawHit()` is called, and only then, for the second draw. A draw in the
 * `opts.partial` band just over the odds is a partial result. Everything else is a failure with its cause. Draws nothing itself.
 */
export function resolve(q: Quote, u: number, opts?: ResolveOpts): Outcome {
  const p = isRecord(q) ? clampNum(q.p, 0, 1, 0) : 0
  const draw = typeof u === 'number' && Number.isFinite(u) ? u : 1
  const o: Partial<ResolveOpts> = isRecord(opts) ? opts : {}
  let kind: OutcomeKind
  if (draw < p) {
    const hitP = isRecord(q) ? clampNum(q.hitP, 0, 1, 0) : 0
    let hit = false
    if (hitP > 0 && typeof o.drawHit === 'function') {
      const second = o.drawHit()
      hit = typeof second === 'number' && second < hitP
    }
    kind = hit ? 'hit' : 'works'
  } else {
    kind = clampNum(o.partial, 0, 0.5, 0) > 0 && draw < p + clampNum(o.partial, 0, 0.5, 0) ? 'partial' : 'fail'
  }
  const won = kind === 'works' || kind === 'hit'
  const reasons: readonly Reason[] = isRecord(q) && Array.isArray(q.reasons) ? q.reasons : []
  return {
    kind,
    margin: (p - draw) * 100,
    cause: kind === 'fail' ? causeOf(reasons) : null,
    done: clampNum(o.done, 0, 1, won ? 1 : HALF_DONE),
  }
}

/**
 * The quality a run lands at: `round(clamp(q.quality + (2r - 1) * q.spread + (hit ? the task's hit bonus : 0), lo, hi))`, the launch
 * roll of rd.ts with the caller's draw `r` (0 to 1, the middle when it isn't a number). The bounds are the caller's, else the task's
 * quality curve, else 0 to 100. A quote with no quality lands 0. Draws nothing.
 */
export function landQuality(q: Quote, task: Task, r: number, hit: boolean, bounds?: { lo: number; hi: number }): number {
  if (!isRecord(q) || typeof q.quality !== 'number' || !Number.isFinite(q.quality)) return 0
  const spread = clampNum(q.spread, 0, 1000, 0)
  const draw = clampNum(r, 0, 1, 0.5)
  const curve = isRecord(task) && isRecord(task.quality) ? task.quality : null
  const bonus = hit && isRecord(task) && isRecord(task.hit) ? clampNum(task.hit.bonus, -1000, 1000, 0) : 0
  let lo = curve !== null ? clampNum(curve.lo, -1e6, 1e6, 0) : 0
  let hi = curve !== null ? clampNum(curve.hi, -1e6, 1e6, 100) : 100
  if (isRecord(bounds) && typeof bounds.lo === 'number' && typeof bounds.hi === 'number' && bounds.lo <= bounds.hi) {
    lo = clampNum(bounds.lo, -1e6, 1e6, lo)
    hi = clampNum(bounds.hi, -1e6, 1e6, hi)
  }
  return Math.round(clampNum(q.quality + (2 * draw - 1) * spread + bonus, lo, hi, lo))
}

const nothing = (): StepResult => ({ replay: false, knowledge: 0, learned: 0, shift: 0, reveals: [] })

/**
 * Books a result once: banks what it taught, lifts the player's ambition on a win, updates `ctx.fx` in place, hands the one Reveal
 * to the sink and returns it. `knowledge` is the know-how level in the field afterwards, `learned` the points this run banked and
 * `shift` the ambition it added.
 *
 * A project that did not work (a failure or a partial result) banks `knowBank` of how far it got, damped by what you already know, so
 * the odds it ever buys stay under 15 points. A win banks none; for the player it adds WIN_SHIFT to ambition. Study and practice teach
 * the task's `learn` whatever the outcome; intel reveals and banks nothing. A step with no task or outcome to read changes nothing.
 */
export function step(g: GameState, task: Task, outcome: Outcome, ctx: StepCtx): StepResult {
  if (!isRecord(task) || !isField(task.field) || !isRecord(outcome) || !OUTCOMES.includes(outcome.kind)) return nothing()
  const c: Partial<StepCtx> = isRecord(ctx) ? ctx : {}
  const field = task.field
  const kind = outcome.kind
  const won = kind === 'works' || kind === 'hit'
  const done = clampNum(outcome.done, 0, 1, won ? 1 : HALF_DONE)
  const year = Math.round(clampNum(c.year, 0, YEAR_MAX, clampNum(g.year, 0, YEAR_MAX, 0)))

  const fx: Fx | null = isRecord(c.fx) ? (c.fx as unknown as Fx) : null
  const cur = fx !== null ? normalizeFx(fx) : null
  const map: Record<string, number> | null = isRecord(c.know) ? (c.know as Record<string, number>) : null
  const you = c.who === 'you'
  // The player's own record is the target only when no company map was given.
  let rec: EffortYou | null = null
  let book: Record<string, number> | null = map
  if (map === null && you) {
    rec = readYou(g)
    book = rec.fieldK
  }

  const replay = cur !== null ? cur.last === year : rec !== null && hasOwn(rec.at, field) && rec.at[field] === year
  if (replay) return { replay: true, knowledge: knowHowOf(book, field), learned: 0, shift: 0, reveals: [] }

  const before = knowHowOf(book, field)
  let gain = 0
  if (task.mode === 'project') gain = won ? 0 : knowBank(before, done, task.learn)
  else if (task.mode === 'study' || task.mode === 'practice') gain = knowGain(before, task.learn)
  const after = book !== null && gain > 0 ? learnKnowHow(book, field, gain) : before
  const learned = Math.max(0, round2(after - before))

  if (rec !== null) {
    rec.at[field] = year
    writeYou(g, rec)
  }
  // A win lifts the player's ambition a little, whoever's know-how it taught (an owner-run company still moves its owner).
  const shift = you && won && task.mode === 'project' ? recordWin(g) : 0

  if (fx !== null && cur !== null) {
    const spent = clampNum(c.k, 0, K_MAX, 0) * clampNum(task.cost, 0, 1e13, 0)
    Object.assign(
      fx,
      normalizeFx({
        ...cur,
        progress: Math.max(cur.progress, done),
        quality: typeof c.quality === 'number' && Number.isFinite(c.quality) ? c.quality : cur.quality,
        spent: cur.spent + spent,
        hours: cur.hours + clampNum(c.weeks, 0, WEEKS_MAX, 0) * HOURS_PER_WEEK,
        setbacks: cur.setbacks + (won ? 0 : 1),
        insight: cur.insight + learned,
        last: year,
      }),
    )
  }

  const reveals: Reveal[] = [{ field, strength: clampNum(won ? WIN_REVEAL + WIN_REVEAL * done : FAIL_REVEAL * done, 0, 1, 0), kind }]
  revealedSink(g, reveals)
  return { replay: false, knowledge: after, learned, shift, reveals }
}
