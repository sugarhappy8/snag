// The focus weeks (R3, C.2): one pool of 12 weeks a year that Study Harder, club practice, lessons and tutorials draw on, in place of
// four counters that each had a cap of their own. Overdoing is fatigue now, not a refusal.
//
// The pool is derived, not stored. It is the sum of the yearActions counters of the focus keys, and aging.ts already empties yearActions
// at every age-up, so there is nothing new to save, reset or migrate (the golden `character` slice digests yearActions, which is why
// no key of its own is added: a counter of a focus key counts weeks). The one thing written is the week past the pool: it goes on the
// player's record as overtime, where the household turns it into fatigue at the year's end.
//
// What a week does:
//   - Within the key's own `full` (today's cap: study 3, a club 2, a lesson 3, tutorials 3) it is worth what it always was.
//   - Past `full` it still runs, at half value.
//   - Once the 12 weeks are used, each further week is overtime: it adds one week to `EffortYou.over` (1.5 fatigue at the next
//     settle, effort/persona.ts `effortStrain`).
//   - The 25th week is refused. A site tells the player "You can't fit another week into this year."
//
// A spend of several weeks (a workshop build takes three) is all or nothing. Nothing here draws a random number or books a dollar.
import type { GameState } from '../types'
import { FOCUS_OVERTIME_MAX, FOCUS_WEEKS } from './limits'
import { cutNum, isRecord, round2 } from './num'
import { readYou, writeYou } from './persona'

export { FOCUS_WEEKS }

/**
 * The counters that make up the pool. A key ending in ':' or '.' is a family (`practice:chess`, `act.lesson.acting`); any other is
 * one key. The Workshop's two (R3-M9) are listed here so its builds and brainstorms draw on the same pool.
 */
export const FOCUS_KEYS: readonly string[] = ['study', 'practice:', 'act.lesson.', 'computer.dev.tutorial', 'workshop.build', 'workshop.brainstorm']

/** What a site says when there is no week left. */
export const FOCUS_FULL_TEXT = "You can't fit another week into this year."

/** What a spend comes to. `mult` scales what the action gives (1, or a half for weeks past the key's own cap), `left` is the pool left after it. */
export interface FocusUse {
  ok: boolean
  mult: number
  left: number
  /** Weeks of this spend that fall past the 12 of the pool. */
  overtime: number
}

/** Whether `key` counts in the pool. A family needs an id after its prefix. */
export function isFocusKey(key: unknown): key is string {
  if (typeof key !== 'string') return false
  for (const k of FOCUS_KEYS) {
    const family = k.endsWith(':') || k.endsWith('.')
    if (family ? key.startsWith(k) && key.length > k.length : key === k) return true
  }
  return false
}

/** A counter as the game reads one (`yearActionsUsed`): a whole number from 0 up; anything else is 0. */
function counterOf(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0
}

/** Weeks used so far this year, across every focus key. Pure. */
export function focusUsed(g: GameState): number {
  const acts: unknown = g.yearActions
  if (!isRecord(acts)) return 0
  let used = 0
  for (const key of Object.keys(acts)) if (isFocusKey(key)) used += counterOf(acts[key])
  return used
}

/** Weeks left in the pool of this year, 0 to 12. Pure. */
export function focusLeft(g: GameState): number {
  return Math.max(0, FOCUS_WEEKS - focusUsed(g))
}

interface Plan {
  use: FocusUse
  weeks: number
  keyUsed: number
}

function plan(g: GameState, key: string, full: number, weeksRaw: number): Plan {
  const weeks = Math.floor(cutNum(weeksRaw, 1, FOCUS_WEEKS + FOCUS_OVERTIME_MAX, 1))
  const cap = Math.floor(cutNum(full, 0, 1e6, 0))
  const used = focusUsed(g)
  const refused = (): Plan => ({ use: { ok: false, mult: 0, left: Math.max(0, FOCUS_WEEKS - used), overtime: 0 }, weeks, keyUsed: 0 })
  if (!isFocusKey(key)) return refused()
  if (used + weeks > FOCUS_WEEKS + FOCUS_OVERTIME_MAX) return refused()
  const acts: unknown = g.yearActions
  const keyUsed = isRecord(acts) ? counterOf(acts[key]) : 0
  // The weeks that fall inside the key's own cap are worth 1, the rest a half; a spend of one week is exactly one or the other.
  const within = Math.min(weeks, Math.max(0, cap - keyUsed))
  const mult = round2((within + 0.5 * (weeks - within)) / weeks)
  const overtime = Math.max(0, used + weeks - FOCUS_WEEKS) - Math.max(0, used - FOCUS_WEEKS)
  return { use: { ok: true, mult, left: Math.max(0, FOCUS_WEEKS - used - weeks), overtime }, weeks, keyUsed }
}

/**
 * What spending `weeks` on `key` would come to, without spending it: the check behind a row's `disabledReason` and the one a site
 * makes before it takes payment. `full` is the key's own cap (what the old counter allowed). Pure; draws nothing.
 */
export function focusPreview(g: GameState, key: string, full: number, weeks = 1): FocusUse {
  return plan(g, key, full, weeks).use
}

/** The reason a row of `key` is greyed out (no week left), or null: the pure check for a `disabledReason`. */
export function focusReason(g: GameState, key: string, full: number, weeks = 1): string | null {
  return focusPreview(g, key, full, weeks).ok ? null : FOCUS_FULL_TEXT
}

/**
 * Spends `weeks` (default 1) of the pool on `key` and says what it came to. It records the use the way `useYearAction` did (the
 * counter goes up by the weeks), so a site within its old cap leaves the same counters as before. A refused spend (no room left, or
 * a key that is not a focus key) records nothing. Weeks past the pool go on the player's record as overtime.
 */
export function spendFocus(g: GameState, key: string, full: number, weeks = 1): FocusUse {
  const p = plan(g, key, full, weeks)
  if (!p.use.ok) return p.use
  if (!isRecord(g.yearActions)) g.yearActions = {}
  g.yearActions[key] = p.keyUsed + p.weeks
  if (p.use.overtime > 0) {
    const y = readYou(g)
    y.over = round2(y.over + p.use.overtime)
    writeYou(g, y)
  }
  return p.use
}
