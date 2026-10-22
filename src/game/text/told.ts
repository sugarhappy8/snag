// What the life log said lately (R3-Q13): one ring of the sentences an event outcome wrote, each with the year it was written, so an
// outcome that would say the same sentence again within 10 years says nothing (the popup still shows, and the first telling stands).
// A line is compared the way the text kit's probes compare it (test/text-metrics.ts normalize): lower case, money symbols out, every
// run of digits one '#', white space collapsed, so "I lost $40." and "I lost $90." are one sentence. The key is 't' and 8 hex digits
// of that, then ':' and the year. Pure reads, no draw; a year after g.year is never read (no foresight). Imports the hash and the
// memory, nothing else, so it is a leaf of the text kit.
import type { GameState } from '../types'
import { fnv1a, mix32 } from './hash'
import { ringRead, ringWrite } from './memory'

const RING = 'told'
/** A ring holds 64 keys: at least 20 years of event lines, so the 10 years asked for are always inside. */
const RING_CAP = 64

/** Years a sentence is not told twice. */
export const TOLD_YEARS = 10

function lineKey(text: string): string {
  const folded = text.toLowerCase().replace(/\p{Sc}/gu, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
  return 't' + mix32(fnv1a(folded)).toString(16).padStart(8, '0')
}

/** Pure. Was this sentence written within `years` years (this year and the years before it)? */
export function toldLately(g: GameState, text: string, years: number = TOLD_YEARS): boolean {
  const ring = ringRead(g, RING)
  if (!ring) return false
  const head = lineKey(text) + ':'
  return ring.some((k) => {
    if (!k.startsWith(head)) return false
    const year = Number(k.slice(head.length))
    return Number.isInteger(year) && year <= g.year && g.year - year <= years
  })
}

/** Notes that this sentence was written this year (moves it to the newest end of the ring). */
export function noteTold(g: GameState, text: string): void {
  const head = lineKey(text) + ':'
  const ring = (ringRead(g, RING) ?? []).filter((k) => !k.startsWith(head))
  ring.push(head + g.year)
  ringWrite(g, RING, ring, RING_CAP)
}
