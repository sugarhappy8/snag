// Career test kit, first half: text, ledger, JSON and odds checks shared by the kit unit tests and, in
// the next task, the playthrough loop. No vitest import (like fuzz-kit and politics-kit): a check
// returns its problems, or throws, and the test decides what to do with them.
import { BANNED_ANYWHERE, LIMITS, staticLength, unitFlags } from '../scripts/voice/rules.mjs'
import { typicalIncome } from '../src/game/events/wealth-core'
import { optionOdds, rollOption, type CrisisDef, type Stance } from '../src/game/special/kit/crisis'
import type { CareerBase } from '../src/game/special/kit/state'
import type { AuditEvent } from '../src/game/special/kit/year'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

/** Text that must never reach the player: a stringified hole. */
export const BAD_TEXT = /\bNaN\b|\bundefined\b|\[object Object\]|-?Infinity|\d[eE]\+\d{2}/

const STANCES: readonly Stance[] = ['safe', 'bold', 'cash']

/** Plain JSON only, every number finite. Returns the first few offending paths (a local copy of fuzz-kit's scan). */
export function finiteJson(g: GameState): string[] {
  const bad: string[] = []
  const seen = new Set<object>()
  const walk = (v: unknown, path: string, depth: number): void => {
    if (bad.length >= 8) return
    if (depth > 120) {
      bad.push(`${path}: nesting deeper than 120`)
      return
    }
    switch (typeof v) {
      case 'number':
        if (!Number.isFinite(v)) bad.push(`${path} = ${v}`)
        return
      case 'string':
      case 'boolean':
      case 'undefined':
        return
      case 'object': {
        if (v === null) return
        if (seen.has(v)) {
          bad.push(`${path}: shared or cyclic reference`)
          return
        }
        seen.add(v)
        if (Array.isArray(v)) {
          v.forEach((x, i) => {
            if (x === undefined) bad.push(`${path}[${i}] = undefined in an array`)
            else walk(x, `${path}[${i}]`, depth + 1)
          })
        } else {
          const proto = Object.getPrototypeOf(v)
          if (proto === Object.prototype || proto === null) for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, depth + 1)
          else bad.push(`${path}: not plain JSON (${proto?.constructor?.name})`)
        }
        seen.delete(v)
        return
      }
      default:
        bad.push(`${path}: ${typeof v}`)
    }
  }
  walk(g, 'g', 0)
  return bad
}

const VOICE_FLAGS = new Set(['em-dash', 'chatbot', 'stock', 'no-contraction', 'nobody', 'everyone', 'disclaimer'])

/** The voice rules that apply to kit text: the caps with 30 characters of slack for names and money, plus the word lists. */
export function voiceProblems(text: string, role: 'log' | 'outcome' | 'scene' | 'title'): string[] {
  const out = unitFlags(text, role).filter((f) => VOICE_FLAGS.has(f))
  if (role !== 'title' && staticLength(text) > LIMITS[role] + 30) out.push('over-cap')
  for (const phrase of BANNED_ANYWHERE) if (text.includes(phrase)) out.push(`banned: ${phrase.trim()}`)
  return out
}

const REFERENCE = makeTestGame(1)

/**
 * Every `books` event must balance: |cash moved - booked| <= 1 + 0.5 x moves. An empty label or a non-finite
 * amount on a money event is a failure. A single earn over 400 x typicalIncome prints a `note-` line to
 * review, which a caller reports and does not fail on. `g` only sets the country and year of that yardstick.
 */
export function checkLedger(events: readonly AuditEvent[], g: GameState = REFERENCE): string[] {
  const out: string[] = []
  const windfall = 400 * typicalIncome(g)
  for (const e of events) {
    if (e.t === 'books') {
      const ok = Number.isFinite(e.delta) && Number.isFinite(e.booked) && Number.isFinite(e.moves)
      if (!ok || Math.abs(e.delta - e.booked) > 1 + 0.5 * e.moves) out.push(`books ${e.career}/${e.where}: cash moved ${e.delta}, booked ${e.booked} over ${e.moves} moves`)
    } else if (e.t === 'earn' || e.t === 'pay') {
      if (!e.label.trim()) out.push(`${e.t} ${e.career}: empty label`)
      if (!Number.isFinite(e.amount)) out.push(`${e.t} ${e.career}/${e.label}: amount ${e.amount}`)
      else if (e.t === 'earn' && e.amount > windfall) out.push(`note-windfall ${e.career}/${e.label}: ${e.amount}`)
    }
  }
  return out
}

/**
 * Rolls every rolled stance of a crisis def n times on clones of the state, one seed each, and throws when
 * the share of good outcomes is not within 0.045 of the odds() the hint prints. Fixed options are skipped.
 */
export function assertHonestOdds(def: CrisisDef<any, any>, mk: () => { g: GameState; s: CareerBase; d: unknown }, n = 1500): void {
  for (const stance of STANCES) {
    const opt = def.options[stance]
    if (!opt) continue
    const base = mk()
    const p = optionOdds(base.g, base.s, base.d, opt)
    if (p === null) continue
    let good = 0
    for (let seed = 1; seed <= n; seed++) {
      const c = structuredClone({ g: base.g, s: base.s })
      c.g.rng = seed
      if (rollOption(c.g, c.s, base.d, opt).good) good++
    }
    const rate = good / n
    if (!(Math.abs(rate - p) < 0.045)) throw new Error(`${def.id}/${stance}: the hint says ${p}, the roll gave ${rate} over ${n} seeds`)
  }
}
