// Pace (R3-Q8, E.T5): one family rule for every popup engine. A popup family is a kind of thing the game keeps asking about (a
// scam call, a family loan, a company inspection). The rule has two forms. Events, company events and the career kit are weighted:
// a family that spoke within PACE.window years weighs a quarter as much (paceWeight). Asks wait: a family that spoke within
// PACE.askGap years is not offered again unless a storyline holds it (askGapOk).
//
// The memory is the text kit's family record (flags.textMem.f, see memory.ts), under keys 'pop.<engine>.<family>', so the rule adds
// no saved field. The memory keeps 120 families in all and the pools of the text kit share them: a track of this kind declares at
// most PACE.maxFamilies of its own (test/pace.test.ts and test/pace-families.test.ts count them), which leaves the rest for text.
//
// Every reader is pure (no g.rng draw, no write, nothing after g.year). notePopup is the one writer, and the engine calls it where
// it presents. Layer L1: it imports the memory and a type, nothing else.
import type { GameState } from '../types'
import { familyLast, isMemKey, noteFamily } from './memory'

export const PACE = Object.freeze({
  /** Years a family stays heavy after it spoke: the year it spoke and the 4 after it. */
  window: 5,
  /** The weight multiplier inside the window. */
  weight: 0.25,
  /** Years an ask family waits before it may be offered again. */
  askGap: 4,
  /** Families the pace engines declare in all (the text memory holds 120, pools and families together). */
  maxFamilies: 60,
} as const)

export type PaceEngine = 'ev' | 'ask' | 'biz' | 'kit'

const ENGINES: ReadonlySet<string> = new Set<PaceEngine>(['ev', 'ask', 'biz', 'kit'])
/** A family: a lower case letter, then letters, digits and dots, 40 characters at most, so 'pop.ev.' and it fit a memory key (48). */
const FAMILY_RE = /^[a-z][a-zA-Z0-9.]{0,39}$/
const KEY_RE = /^pop\.(?:ev|ask|biz|kit)\.[a-z][a-zA-Z0-9.]{0,39}$/

/** The memory key of a family: 'pop.ev.scam'. A bad engine or family throws, so a typo in a table fails when the table loads. */
export function paceKey(engine: PaceEngine, family: string): string {
  if (!ENGINES.has(engine)) throw new Error(`pace: unknown engine "${String(engine)}"`)
  if (typeof family !== 'string' || !FAMILY_RE.test(family)) throw new Error(`pace: bad family "${String(family)}" (a lower case letter, then letters, digits and dots, 40 at most)`)
  return `pop.${engine}.${family}`
}

/** Test seam (see withPaceOff): how many calls are inside it. Test code only; the game never sets one. */
let off = 0

/** Runs `fn` with the pace rule off: weights are the base, an ask is never held back and nothing is noted. Nests; turns back on when `fn` throws. */
export function withPaceOff<T>(fn: () => T): T {
  off++
  try {
    return fn()
  } finally {
    off--
  }
}

/** Notes that the family popped up this year. Once a year: the second note of a year changes nothing. A key that did not come from paceKey is ignored. */
export function notePopup(g: GameState, key: string): void {
  if (off > 0 || !isMemKey(key) || !KEY_RE.test(key)) return
  if (familyLast(g, key) === g.year) return
  noteFamily(g, key)
}

/** Pure. Did the family pop up within `years` years (default PACE.window): this year or the years - 1 before it. A later year is never read. */
export function popupSeen(g: GameState, key: string, years: number = PACE.window): boolean {
  if (off > 0) return false
  const last = familyLast(g, key)
  return last !== null && g.year - last < (Number.isFinite(years) ? years : PACE.window)
}

/** Pure. The base weight, times PACE.weight when the family popped up lately. No family, or a base of 0 or less, is the base. */
export function paceWeight(g: GameState, key: string | undefined, base: number): number {
  if (key === undefined || !(base > 0)) return base
  return popupSeen(g, key) ? base * PACE.weight : base
}

/** Pure. May an ask of this family be offered: false within PACE.askGap years of the last one, unless a storyline holds it. No family is always fine. */
export function askGapOk(g: GameState, key: string | undefined, storyline?: boolean): boolean {
  if (key === undefined || storyline === true || off > 0) return true
  const last = familyLast(g, key)
  return last === null || g.year - last >= PACE.askGap
}
