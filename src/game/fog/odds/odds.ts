// R3-G7 (H.6): odds to words. One place decides how a chance is shown to the player.
//
//   Exact       today's text, "about 85%", character for character (the suite runs here, so every old assertion holds).
//   Realistic   words by default ("likely", "a long shot"); a percent to the nearest 5 ("about 65%") with the Business talent or
//               after a read of that very odds key. The percent is read off an honest estimate (know(), keys.ts row `odds.*`),
//               so it is fallible: the roll still uses the true chance, the player reads what they can know.
//
// A chance that is all but certain or impossible (99% and up, 1% and down, as it always printed) is shown as such in every
// mode: nothing hidden is left to guess.
//
// This file also binds the reveal policy of effort/hooks.ts, so the research lines ("Odds likely: team +9, funding +7, unknown
// factors") follow the same rule: the player's own terms always show, the field, the rivals and the public pool only with the
// talent or a stored read of research odds, and the chance is a word or "about N%".
//
// Pure: nothing here draws a random number, writes the game or reads a year after g.year. The noise is a hash of (life, key,
// year) inside know(), so the same call twice in a year is the same text.
import { bindRevealPolicy, EXACT_POLICY, type RevealPolicy } from '../../effort/hooks'
import type { TermKey } from '../../effort/types'
import { isExact, know, readKnow } from '../../knowledge/contract'
import { HINT_EMOJI, hasTalent } from '../../talents'
import type { GameState } from '../../types'

export type OddsWord = 'almost no chance' | 'a long shot' | 'unlikely' | 'even money' | 'likely' | 'very likely' | 'almost certain'

/** [upper bound (exclusive), word], rising. The last word catches the rest. */
const LADDER: ReadonlyArray<readonly [number, OddsWord]> = [
  [0.02, 'almost no chance'],
  [0.15, 'a long shot'],
  [0.38, 'unlikely'],
  [0.62, 'even money'],
  [0.85, 'likely'],
  [0.97, 'very likely'],
]

/** A chance as a number from 0 to 1; anything that is not a number reads as 0. */
const unit = (p: number): number => (Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0)

/** Seven words for a chance, from "almost no chance" to "almost certain". */
export function oddsWord(p: number): OddsWord {
  const v = unit(p)
  for (const [cut, word] of LADDER) if (v < cut) return word
  return 'almost certain'
}

/** Today's text for a chance: 'about 85%', or 'almost certain' from 99% and 'almost no chance' to 1%. */
export function exactOddsText(p: number): string {
  const v = Math.round(Math.min(1, Math.max(0, p)) * 100)
  return v >= 99 ? 'almost certain' : v <= 1 ? 'almost no chance' : `about ${v}%`
}

/** 'about 65%' for a reading, to the nearest 5; the edges of the scale read as the words they always did. */
function percentText(mid: number): string {
  const n = Math.round(unit(mid) * 20) * 5
  return n >= 100 ? 'almost certain' : n <= 0 ? 'almost no chance' : `about ${n}%`
}

const clean = (s: string, max: number): string => String(s).replace(/[^A-Za-z0-9._~-]/g, '_').slice(0, max) || 'x'

/**
 * The knowledge key of one vote or hazard: `odds:<id>:<kind>:p` (at most 56 characters; the id and kind are cleaned to the
 * characters a key allows). One key per company and kind of decision, so the reading of "will the board raise my pay" is the
 * same number whatever the amount, and a read bought for it is a read of that vote.
 */
export function oddsKey(id: string, kind: string): string {
  return `odds:${clean(id, 28)}:${clean(kind, 20)}:p`
}

/** Readings of the odds of research are kept under this prefix (`odds:rd:<id>:p`); one of them opens the research lines. */
export const RESEARCH_ODDS = 'odds:rd:'

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

/** True when the player holds a reading of this very key (a research report, an analyst: anything Knowledge kept). */
export function hasOddsRead(g: GameState, key: string): boolean {
  const rec = readKnow(g)
  return rec !== null && own(rec.k, key)
}

/** True when the player holds a reading of the odds of research (any key under RESEARCH_ODDS). */
function hasResearchRead(g: GameState): boolean {
  const rec = readKnow(g)
  return rec !== null && Object.keys(rec.k).some((k) => k.startsWith(RESEARCH_ODDS))
}

export interface OddsView {
  /** What a menu prints: 'likely', 'about 65%', or today's 'about 62%' in Exact mode. */
  text: string
  /** The chance the player believes, 0 to 1 (the truth in Exact mode and at the all-but-certain edges). */
  mid: number
  /** The text is a percent (or one of the two edge words that stand for one). */
  percent: boolean
  /** Exact mode: the truth, as it always printed. */
  exact: boolean
}

/**
 * The odds of `key` whose true chance is `p`, as the player may read them. `domain` is the talent that shows the percent
 * ('Business' for a board). An odds key the knowledge rules cannot fog still prints only a word, never the number.
 */
export function oddsView(g: GameState, key: string, p: number, domain: string = 'Business'): OddsView {
  if (isExact()) return { text: exactOddsText(p), mid: unit(p), percent: true, exact: true }
  const truth = unit(p)
  const pc = Math.round(truth * 100)
  if (pc >= 99 || pc <= 1) return { text: exactOddsText(truth), mid: truth, percent: false, exact: false }
  const est = know(g, key, truth)
  if (est.exact) return { text: oddsWord(truth), mid: truth, percent: false, exact: false }
  const percent = hasTalent(g, domain) || hasOddsRead(g, key)
  return { text: percent ? percentText(est.mid) : oddsWord(est.mid), mid: est.mid, percent, exact: false }
}

/** The text of oddsView: what a hint or a caption prints for these odds. */
export function oddsRead(g: GameState, key: string, p: number, domain: string = 'Business'): string {
  return oddsView(g, key, p, domain).text
}

/** True when the reading the player has is on the "yes" side of even money (the truth in Exact mode): "will likely say yes". */
export function oddsLean(g: GameState, key: string, p: number, domain: string = 'Business'): boolean {
  return oddsView(g, key, p, domain).mid >= 0.5
}

/**
 * The odds as a caption shows them, or null when the player may not see them. The talent shows them (marked with the crystal
 * ball, as before); in Realistic mode a stored read of this key shows them too (unmarked). `p` may be a function, so the chance
 * is worked out only when a caption will print it.
 */
export function oddsShown(g: GameState, key: string, p: number | (() => number), domain: string = 'Business'): string | null {
  const talent = hasTalent(g, domain)
  if (!talent && (isExact() || !hasOddsRead(g, key))) return null
  const text = oddsRead(g, key, typeof p === 'function' ? p() : p, domain)
  return talent ? `${HINT_EMOJI} ${text}` : text
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The reveal policy of the research lines (effort/hooks.ts, D8)

/** The terms of a piece of research the player always knows: their own team, money, crew, tools, know-how, rest and plan. */
const OWN_TERMS: ReadonlySet<string> = new Set<TermKey>(['team', 'funding', 'crew', 'tools', 'know', 'tired', 'bold', 'ceo'])

/**
 * What the player may see of the research odds. Exact mode: everything, as before. Realistic: the chance is a word, or
 * "about N%" to the nearest 5 with the Business talent or a stored read of research odds; the terms that are not the player's
 * own (the hardness of the field, rival pressure, the public pool) show only with the talent or a read, else as "unknown factors".
 */
export function oddsPolicy(g: GameState): RevealPolicy {
  if (isExact()) return EXACT_POLICY
  const sees = hasTalent(g, 'Business') || hasResearchRead(g)
  return {
    exact: false,
    knows: (term: TermKey): boolean => OWN_TERMS.has(term) || sees,
    band: (p: number): string => (sees ? percentText(p) : oddsWord(p)),
  }
}

// Bound once, when this file loads (a second bind of the same function is fine, a different one throws).
bindRevealPolicy(oddsPolicy)
