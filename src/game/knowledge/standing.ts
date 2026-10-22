// R3-H5 (H.2): standing orders. A dial from 0 to 3 that keeps what the player researched fresh on a budget, so a briefing does not
// go stale because the player forgot to renew it. The dial lives in the record (flags.know.d); the yearly step (module.ts) runs the
// orders once a year, in either information mode, so a setting can never change a replay.
//
//   level 0  nothing
//   level 1  the trade press for every tracked key it reads (one fee per 12 keys, at most ten)
//   level 2  level 1, and an analyst for the 3 stalest keys
//   level 3  level 1, and the desk (an analyst on retainer, .6 of the fee, a little less sharp) for the 8 stalest keys
//
// "Tracked" is every row of the record whose key kind has an owner (kinds.ts), stalest first. The orders are worked out before any is
// bought, so the stalest keys are the ones that were stale when the year began. A fee is the scope of the keys and the wealth of the
// country read (sources.ts priceOf), never the player's cash: a hundred times the money pays the same. Each fee goes through
// buyIntel's path (reason `intel`, a token of source, year and keys), so a replayed year books nothing twice.
//
// A player who cannot pay lapses: nothing is charged, one line says so, and the rest of the orders wait for next year. A player who
// pays gets one line for the year, not one per purchase.
import { log, shortMoney } from '../core'
import { pickLine } from '../text/pick'
import type { GameState } from '../types'
import { INTEL_WHY, MAX_KEYS, buyIntel, quoteIntel } from './intel'
import { kindOfKey } from './kinds'
import { parseKey } from './keys'
import { recordFor, storedEstimates, tidyRecord } from './record'
import { DIAL_MAX, dialOf, rawRec } from './rows'
import { reads, type SourceId } from './sources'

/** The analyst of level 2 reads this many of the stalest keys, the desk of level 3 this many. */
export const ANALYST_KEYS = 3
export const DESK_KEYS = 8
/** The press is bought once for every 12 keys; past ten fees (120 rows, the cap of the record) a key waits. */
export const PRESS_FEES_MAX = 10

/** One purchase of the standing orders. */
export interface Order {
  src: SourceId
  keys: string[]
}

/** What the year's orders cost: the sum of the fees, and each purchase with its fee and the refusal it would meet now (or null). */
export interface OrderQuote {
  fee: number
  orders: Array<Order & { price: number; why: string | null }>
}

// The line the orders write when they paid, and when they could not: 90 characters at most (the fee in), three wordings each, each pool
// its own const so the pickline era guard (test/r2-pickline-era-guard.test.ts) can read it.
export const STANDING_LINES = [
  'My standing orders kept my numbers fresh this year for {fee}.',
  'The briefing was renewed on schedule. It cost me {fee}.',
  'I paid {fee} to keep my briefing up to date.',
] as const
export const LAPSE_LINES = [
  "I couldn't pay for my standing orders this year. My numbers are going stale.",
  'No money for the briefing this year. What I know is getting old.',
  'I let my standing orders lapse. I just had no cash for them.',
] as const

/** The dial now: 0 when there is no record, or the record has none. */
export function dialOfPlayer(g: GameState): number {
  const rec = rawRec(g)
  return rec ? (dialOf(rec.d) ?? 0) : 0
}

const asLevel = (level: unknown): number => (typeof level === 'number' && Number.isFinite(level) ? Math.min(DIAL_MAX, Math.max(0, Math.round(level))) : 0)

/** Set the dial (a number held to 0..3; anything that is not a number is 0). Level 0 takes the dial out, and an emptied record goes with it. */
export function setDial(g: GameState, level: number): void {
  const n = asLevel(level)
  if (n === 0) {
    const rec = rawRec(g)
    if (!rec || rec.d === undefined) return
    delete recordFor(g).d
    tidyRecord(g)
    return
  }
  recordFor(g).d = n
}

/** The keys the orders keep fresh: every row of the record whose kind has an owner, stalest first. Pure. */
export function trackedKeys(g: GameState): string[] {
  return storedEstimates(g)
    .map((e) => e.key)
    .filter((key) => kindOfKey(key) !== null)
}

const chunks = <T>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * The purchases of a level, in the order they are bought (the press first). Pure; empty for level 0, and for a level with nothing a
 * source can read. The keys of each source are the stalest of those it covers.
 */
export function ordersFor(g: GameState, level: number): Order[] {
  const n = asLevel(level)
  if (n === 0) return []
  const tracked = trackedKeys(g)
  const covered = (src: SourceId): string[] => tracked.filter((key) => reads(src, parseKey(key)?.kind ?? ''))
  const out: Order[] = []
  for (const keys of chunks(covered('press'), MAX_KEYS).slice(0, PRESS_FEES_MAX)) out.push({ src: 'press', keys })
  if (n === 2) out.push({ src: 'analyst', keys: covered('analyst').slice(0, ANALYST_KEYS) })
  if (n >= 3) out.push({ src: 'desk', keys: covered('desk').slice(0, DESK_KEYS) })
  return out.filter((o) => o.keys.length > 0)
}

/** What a level would cost a year: the fees of its purchases as they are priced now. Pure; the same prices buyIntel books. */
export function quoteOrders(g: GameState, level: number): OrderQuote {
  const orders = ordersFor(g, level).map((o) => {
    const q = quoteIntel(g, o.src, o.keys, { standing: true })
    return { ...o, price: q.price, why: q.why }
  })
  return { fee: orders.reduce((sum, o) => sum + o.price, 0), orders }
}

const NAMES = [
  'No standing orders. Nothing is kept fresh for you',
  'The trade press for every number you track',
  'The press, and an analyst on the 3 stalest numbers',
  'The press, and the desk on the 8 stalest numbers',
] as const

/** The live caption of the slider: what a level does and what it costs a year. Pure. */
export function describeOrders(g: GameState, level: number): string {
  const n = asLevel(level)
  if (n === 0) return `${NAMES[0]}.`
  const q = quoteOrders(g, n)
  return q.orders.length === 0 ? `${NAMES[n]}, but there is nothing to keep fresh yet.` : `${NAMES[n]}, about ${shortMoney(q.fee)} a year.`
}

/**
 * Run the orders of this year: buy each purchase of the dial's level in turn. Returns what was paid and whether the player lapsed (could
 * not pay: the rest wait). A key read this year, with no truth to read or no source for it, is skipped without a word. Writes one line
 * to the log: the lapse, or the fee when anything was paid. Idempotent only through the caller's year stamp (module.ts).
 */
export function runOrders(g: GameState): { paid: number; lapsed: boolean } {
  const level = dialOfPlayer(g)
  if (level === 0) return { paid: 0, lapsed: false }
  let paid = 0
  let lapsed = false
  for (const o of ordersFor(g, level)) {
    const fee = quoteIntel(g, o.src, o.keys, { standing: true }).price
    const r = buyIntel(g, o.src, o.keys, { standing: true })
    if (r.ok) paid += fee
    else if (r.why === INTEL_WHY.cash) {
      lapsed = true
      break
    }
  }
  if (lapsed) log(g, pickLine(g, LAPSE_LINES))
  else if (paid > 0) log(g, pickLine(g, STANDING_LINES).replace('{fee}', shortMoney(paid)))
  return { paid, lapsed }
}
