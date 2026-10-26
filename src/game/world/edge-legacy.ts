// The two legacy records, read for the current ego (R4-E7, X22). Person.relationship, the money ties `data.w` (events/wealth-core.ts) and
// the will's feelings `data.wl` (events/will-core.ts) stay the authority through R4; the Edge mirrors them. The edge model and the
// society step must read what those records say, but readTies and readWl live in `events/`, which is layer 3, and `world/` and
// `society/` may not import `events/`. So the few numbers the Edge side needs are read here, from the raw record, by the same rules:
//
//   legacyTies(p, ego)   { owes, since }                  what the person still owes the player, and the year it began
//                        owes = max(0, round(data.w.owes)), since = data.w.owesSince, each 0 when it is not a finite number
//   legacyWl(p, ego)     { anger, cut, estr }             how angry the person is about the will (0 to 100), whether they were cut
//                        out, whether they are estranged (data.wl.cut === true, data.wl.estr === true)
//
// A record is the ego's when its `by` is the ego's character id (a stranger's record, an older generation's, a hostile one all read as
// blank: owes 0, anger 0, cut false, estr false), and the ego has to be a non-empty text. Both readers are TOTAL (any person, any data,
// a getter that throws: the blank comes back) and PURE (nothing is written, no number is drawn). They are the names E9's familyLive,
// E10a's broker, E12's will-owned test and E14's isBound import to read the cut-out and estranged flags without reaching into events/;
// test/world-edge-mirror.test.ts holds them equal to readTies and readWl on every record, valid or hostile.
//
// Layer 2: it imports types only.
import type { Person } from '../types'

/** What a person owes the player: the amount (a whole number, 0 or more) and the year it was first lent (0 when unknown). */
export interface LegacyTies {
  owes: number
  since: number
}

/** What the will's record says about a person: the anger (0 to 100), cut out, estranged. */
export interface LegacyWl {
  anger: number
  cut: boolean
  estr: boolean
}

/** The record `data[key]` when it is a plain object stamped by the ego, else null. Never throws. */
function recordOf(p: Pick<Person, 'data'>, key: 'w' | 'wl', ego: string): Record<string, unknown> | null {
  try {
    if (typeof ego !== 'string' || ego === '') return null
    const data: unknown = (p as { data?: unknown } | null | undefined)?.data
    if (data === null || typeof data !== 'object') return null
    const raw: unknown = (data as Record<string, unknown>)[key]
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const rec = raw as Record<string, unknown>
    return rec.by === ego ? rec : null
  } catch {
    return null
  }
}

/** A finite number, else 0 (wealth-core.ts num). */
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** What `p` owes the player under the ego's record `data.w`: the same two numbers readTies gives as owes and owesSince. */
export function legacyTies(p: Pick<Person, 'data'>, ego: string): LegacyTies {
  const rec = recordOf(p, 'w', ego)
  if (rec === null) return { owes: 0, since: 0 }
  try {
    return { owes: Math.max(0, Math.round(num(rec.owes))), since: num(rec.owesSince) }
  } catch {
    return { owes: 0, since: 0 }
  }
}

/** What the ego's record `data.wl` says about `p`: the same three values readWl gives as anger, cut and estr. */
export function legacyWl(p: Pick<Person, 'data'>, ego: string): LegacyWl {
  const rec = recordOf(p, 'wl', ego)
  if (rec === null) return { anger: 0, cut: false, estr: false }
  try {
    const a = rec.anger
    // will-core.ts n0(v, 0, 100): a finite number rounded and held between the bounds, else the low bound
    const anger = typeof a === 'number' && Number.isFinite(a) ? Math.max(0, Math.min(100, Math.round(a))) : 0
    return { anger, cut: rec.cut === true, estr: rec.estr === true }
  } catch {
    return { anger: 0, cut: false, estr: false }
  }
}
