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
// R3-G8 adds the hazards: the odds a screen cannot know (a coup, a charge, a scheme's risk, a bank's borrower pulling through) read
// through the same helper. The owner of a screen says what the number is and how to find its truth (registerOddsOwner), so the
// `odds` key kind, which Look closer and the Intelligence Briefing ask, has one registration here and many owners; a read bought
// at the Look closer row of a screen is a read of that screen's keys. A chance that moves with a slider (how greedy a scheme is)
// keeps one key and one reading: the reading's error is carried to the chance the slider asks about (`base`).
//
// Pure: nothing here draws a random number, writes the game or reads a year after g.year. The noise is a hash of (life, key,
// year) inside know(), so the same call twice in a year is the same text.
import { bindRevealPolicy, EXACT_POLICY, type RevealPolicy } from '../../effort/hooks'
import type { TermKey } from '../../effort/types'
import { isExact, know, lookCloser, readKnow, registerKeyKind } from '../../knowledge/contract'
import { HINT_EMOJI, hasTalent } from '../../talents'
import type { GameState, MenuGroup } from '../../types'

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
 *
 * `base` is for a chance that moves with a slider while its key stays one: the true chance at the key's own setting (the one a
 * purchase reads). The reading is made there, and its error (what the player believes less what is true) is carried to `p`, so a
 * reading bought once stays the same mistake all along the slider and more greed never reads as less risk.
 */
export function oddsView(g: GameState, key: string, p: number, domain: string = 'Business', base?: number): OddsView {
  if (isExact()) return { text: exactOddsText(p), mid: unit(p), percent: true, exact: true }
  const truth = unit(p)
  const pc = Math.round(truth * 100)
  if (pc >= 99 || pc <= 1) return { text: exactOddsText(truth), mid: truth, percent: false, exact: false }
  const anchor = base === undefined ? truth : unit(base)
  const est = know(g, key, anchor)
  if (est.exact) return { text: oddsWord(truth), mid: truth, percent: false, exact: false }
  const mid = base === undefined ? est.mid : unit(truth + (est.mid - anchor))
  const percent = hasTalent(g, domain) || hasOddsRead(g, key)
  return { text: percent ? percentText(mid) : oddsWord(mid), mid, percent, exact: false }
}

/** The text of oddsView: what a hint or a caption prints for these odds. */
export function oddsRead(g: GameState, key: string, p: number, domain: string = 'Business', base?: number): string {
  return oddsView(g, key, p, domain, base).text
}

/**
 * A chance for a row that prints a bare percent today (R3-G8): Exact mode gives that percent, `digits` decimals as the row always
 * had, character for character; Realistic gives oddsRead (a word, or "about N%" with the talent or a read). The caller picks the
 * sentence around it with isExact(), because "25% chance they notice" and "chance they notice: unlikely" are not the same words.
 */
export function chanceRead(g: GameState, key: string, p: number, domain: string = 'Business', opts: { digits?: number; base?: number } = {}): string {
  if (isExact()) return `${(p * 100).toFixed(opts.digits ?? 0)}%`
  return oddsRead(g, key, p, domain, opts.base)
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
// How much evidence there is (R3-G8)

export type EvidenceWord = 'thin' | 'some' | 'solid' | 'heavy'

/** [upper bound (exclusive), word], rising. The last word catches the rest. */
const EVIDENCE_LADDER: ReadonlyArray<readonly [number, EvidenceWord]> = [
  [0.2, 'thin'],
  [0.45, 'some'],
  [0.7, 'solid'],
]

/** How damning a file is, as a word: 0 to 1 becomes thin, some, solid or heavy. */
export function evidenceWord(e: number): EvidenceWord {
  const v = unit(e)
  for (const [cut, word] of EVIDENCE_LADDER) if (v < cut) return word
  return 'heavy'
}

/**
 * The evidence of a case file (or what a scheme leaves behind), 0 to 1, as the player may read it. Exact mode gives today's percent;
 * Realistic gives the word, or "about N%" (nearest 5, from an honest estimate, so it can be wrong) with the talent or after a read of
 * this key. It is not a chance, so it has its own words, but it is read the way a chance is: same rule row, same key family.
 */
export function evidenceRead(g: GameState, key: string, e: number, domain: string = 'Business', base?: number): string {
  const truth = unit(e)
  if (isExact()) return `${(truth * 100).toFixed(0)}%`
  const anchor = base === undefined ? truth : unit(base)
  const est = know(g, key, anchor)
  if (est.exact) return evidenceWord(truth)
  const mid = base === undefined ? est.mid : unit(truth + (est.mid - anchor))
  if (!(hasTalent(g, domain) || hasOddsRead(g, key))) return evidenceWord(mid)
  return `about ${Math.min(95, Math.max(5, Math.round(mid * 20) * 5))}%`
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Owners of odds keys (R3-G8)

/** One kind of hidden chance: what it is called and what its true value is today. */
export interface OddsOwner {
  /** The words the Briefing prints for the key (a menu cuts it to 60 characters). */
  label(g: GameState, id: string): string
  /** The true chance now, 0 to 1, or null when there is nothing to read (the case closed, the office was lost). Never draws, never writes. */
  truth(g: GameState, id: string): number | null
  /** How big the thing read is (1 a business, 2 a country, 3 the world): it prices a source. Default 1. */
  tier?: 1 | 2 | 3
}

const owners = new Map<string, OddsOwner>()
const OWNER_HOOKS = ['label', 'truth', 'tier'] as const

function fingerprint(o: OddsOwner): string {
  return OWNER_HOOKS.map((h) => String(o[h])).join('\u0001')
}

/**
 * Register the owner of the odds keys `odds:<id>:<kind>:p`. Registering the same code twice is fine (a reloaded module); another
 * owner for a taken kind throws, so two screens can never claim one kind.
 */
export function registerOddsOwner(kind: string, owner: OddsOwner): void {
  if (!/^[A-Za-z0-9._~-]{1,20}$/.test(kind)) throw new Error(`registerOddsOwner: ${String(kind)} cannot be a kind of odds key`)
  if (typeof owner !== 'object' || owner === null || typeof owner.label !== 'function' || typeof owner.truth !== 'function') {
    throw new Error(`registerOddsOwner: ${kind} needs a label and a truth`)
  }
  const held = owners.get(kind)
  if (held === undefined) {
    owners.set(kind, owner)
    return
  }
  if (held === owner || fingerprint(held) === fingerprint(owner)) return
  throw new Error(`registerOddsOwner: ${kind} is already registered with a different owner`)
}

/** The owner and the id of a well-formed odds key `odds:<id>:<kind>:p`, or null (no such owner, or a key of another shape). */
function ownerOf(key: string): { owner: OddsOwner; id: string } | null {
  const parts = typeof key === 'string' ? key.split(':') : []
  if (parts.length !== 4 || parts[0] !== 'odds' || parts[3] !== 'p') return null
  const owner = owners.get(parts[2]!)
  return owner ? { owner, id: parts[1]! } : null
}

/** An owner's hook; one that throws or answers badly is one with no answer. */
function ask<T>(f: () => T): T | null {
  try {
    return f()
  } catch {
    return null
  }
}

// The one `odds` key kind. Research odds (`odds:rd:<id>:p`) and a board's votes have no owner here, so they have no truth to buy yet.
registerKeyKind({
  kind: 'odds',
  label(g, key) {
    const hit = ownerOf(key)
    const text = hit ? ask(() => hit.owner.label(g, hit.id)) : null
    return typeof text === 'string' && text.trim() !== '' ? text : key
  },
  truth(g, key) {
    const hit = ownerOf(key)
    const v = hit ? ask(() => hit.owner.truth(g, hit.id)) : null
    return typeof v === 'number' && Number.isFinite(v) ? unit(v) : null
  },
  scope(_g, key) {
    const hit = ownerOf(key)
    return { tier: hit?.owner.tier ?? 1 }
  },
})

/**
 * The Look closer group of a screen of hazards, with the screen's own name for it ("Commission a risk briefing"), or null: in Exact
 * mode, when no key has an owner that can read it, or when every source is blocked (lookCloser says which).
 */
export function oddsLook(g: GameState, spec: { id: string; keys: readonly string[]; label: string }): MenuGroup | null {
  const group = lookCloser(g, { id: spec.id, keys: spec.keys })
  return group === null ? null : { ...group, label: spec.label }
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
