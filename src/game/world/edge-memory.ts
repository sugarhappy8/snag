// The memories an edge keeps (R4-E6a, D.3): the 40 kinds, what each one does to the edge the day it is made, and the string a memory
// is stored as. Pure data and two pure functions; nothing here stores, draws or reads the game.
//
//   MEMORY_KINDS     the 40 ids, in a fixed order, append-only: a stored memory carries its kind id, so an id is never renamed,
//                    reordered or removed. R6 appends after the 40th, and the phrase table of the people UI (U10) holds one phrase
//                    for every id, so a kind that is appended needs its phrase in the same commit.
//   MEMORY_FX        per kind { t, r, s, o, decay }: the one-time change `remember` (world/edge-write.ts, E6b) applies to the edge's
//                    trust, respect, resentment and obligation, and the years one point of weight lasts. A FROZEN TABLE (cross-check
//                    section 3.3, X57): a test proves its shape and only a reader can say whether its values are right. After R4 a
//                    changed value needs a RECORD_REASON, a row in moved-tests.md and the lead's OK, because it changes what every
//                    stored memory does.
//   PINNED_MEMORY_KINDS   betrayal, saved_me, cut_from_will, estranged and divorced: they never decay and they bind the edge.
//   parseMemory / formatMemory   the stored text 'kind.year.weight.by', for example 'betrayal.2031.3.e'.
//
// How to read a MEMORY_FX row. The edge is `first end > second end` and says what the first end feels about the second (in R4 the
// first end is a person and the second the player, the ego). A row is the change in the first end's trust (t), respect (r),
// resentment (s) and obligation (o, positive when the first end owes the second more) at the FULL weight of 3; `remember` scales it
// by weight / 3, so a weight 1 memory moves a third of it. The table is written for the usual direction of each kind and the side
// (`by`) does not flip it: `hired_me` and `fired_me` are what the first end felt when the ego hired or fired them, `loan_repaid`
// and `loan_unpaid` are what the first end feels about the loan it paid or missed, `kept_secret` and `leaked_secret` are felt the
// same way whichever side kept or leaked.
//
// Layer 2: it imports the year bounds of the world rows and nothing else.
import { SEEN_MAX, SEEN_MIN } from './rows'

const KINDS = [
  'loan_given', 'loan_repaid', 'loan_unpaid', 'loan_forgiven', 'gift_given', 'gift_refused', 'allowance_cut', 'bailed_out',
  'asked_too_often', 'cut_from_will', 'restored_to_will', 'told_gently', 'told_bluntly', 'olive_branch', 'took_my_side', 'estranged',
  'reconciled', 'betrayal', 'proposed_yes', 'proposed_no', 'broke_up', 'divorced', 'stood_by_me', 'saved_me',
  'covered_for_me', 'kept_secret', 'leaked_secret', 'gossiped_about_me', 'outed_me', 'reported_me', 'hired_me', 'fired_me',
  'promoted_me', 'demoted_me', 'passed_over', 'poached_me', 'signed_me', 'referred_me', 'mentored_me', 'beat_me',
] as const

export type MemoryKind = (typeof KINDS)[number]

/** The 40 kinds, in this order, append-only. */
export const MEMORY_KINDS: readonly MemoryKind[] = Object.freeze([...KINDS])

const KIND_SET: ReadonlySet<string> = new Set<string>(KINDS)

/** True for one of the 40 ids. Total: any value in, a boolean out. */
export function isMemoryKind(x: unknown): x is MemoryKind {
  return typeof x === 'string' && KIND_SET.has(x)
}

/** What a memory does to its edge at the full weight of 3 (integers, each of t, r, s, o within plus or minus 25), and the years one point of weight lasts (0: never). */
export interface MemoryFx {
  /** Trust, 0 to 100 on the edge. */
  readonly t: number
  /** Respect, 0 to 100. */
  readonly r: number
  /** Resentment, 0 to 100. */
  readonly s: number
  /** Obligation, -100 to 100: positive when the first end owes the second. */
  readonly o: number
  /** The years per one point of weight lost: 4 for most kinds, 2 for a petty one, 0 for the pinned five. */
  readonly decay: number
}

/*
 * The table. One line a kind, in the order of MEMORY_KINDS: { t, r, s, o, decay }.
 *
 * Money and favors:  a loan or a gift makes the first end owe more (o up) and trust a little; repaying lowers o; forgiving a loan
 *                    lowers o and earns the most goodwill of the group; a bailout is the one favor that moves o by the full 25.
 * Slights:           a refusal, a cut allowance, a gossip, a pass-over cost trust and respect and add resentment; they fade.
 * The pinned five:   betrayal, cut_from_will, estranged and divorced are the deepest breaks (trust down 18 to 25, resentment up 20
 *                    to 25) and saved_me is their mirror (trust up 25, resentment down 25). None of them decays.
 * Career:            hiring, signing, promoting, referring and mentoring earn respect and an obligation; firing, demoting,
 *                    reporting and outing cost trust and add resentment; a rival who beat or poached the first end earns respect
 *                    and resentment together.
 * Rule of the table: no row moves all four fields by the full 25 (at most two do), and every row moves something.
 */
const FX = {
  loan_given: { t: 6, r: 3, s: 0, o: 20, decay: 4 },
  loan_repaid: { t: 4, r: 4, s: -4, o: -20, decay: 4 },
  loan_unpaid: { t: -8, r: -5, s: 8, o: 0, decay: 4 },
  loan_forgiven: { t: 12, r: 8, s: -12, o: -10, decay: 4 },
  gift_given: { t: 8, r: 4, s: -4, o: 10, decay: 4 },
  gift_refused: { t: -5, r: -3, s: 6, o: 0, decay: 4 },
  allowance_cut: { t: -10, r: -6, s: 10, o: -8, decay: 4 },
  bailed_out: { t: 10, r: 6, s: -8, o: 25, decay: 4 },
  asked_too_often: { t: -2, r: -2, s: 4, o: 0, decay: 2 },
  cut_from_will: { t: -20, r: -12, s: 22, o: -10, decay: 0 },
  restored_to_will: { t: 10, r: 6, s: -12, o: 10, decay: 4 },
  told_gently: { t: 4, r: 4, s: -2, o: 0, decay: 4 },
  told_bluntly: { t: -3, r: 2, s: 5, o: 0, decay: 4 },
  olive_branch: { t: 6, r: 4, s: -10, o: 4, decay: 4 },
  took_my_side: { t: 10, r: 8, s: -6, o: 12, decay: 4 },
  estranged: { t: -22, r: -16, s: 20, o: -15, decay: 0 },
  reconciled: { t: 14, r: 8, s: -18, o: 6, decay: 4 },
  betrayal: { t: -25, r: -20, s: 25, o: -10, decay: 0 },
  proposed_yes: { t: 12, r: 10, s: -8, o: 0, decay: 4 },
  proposed_no: { t: -8, r: -2, s: 6, o: 0, decay: 4 },
  broke_up: { t: -14, r: -8, s: 14, o: -8, decay: 4 },
  divorced: { t: -18, r: -12, s: 20, o: -10, decay: 0 },
  stood_by_me: { t: 14, r: 12, s: -8, o: 14, decay: 4 },
  saved_me: { t: 25, r: 20, s: -25, o: 20, decay: 0 },
  covered_for_me: { t: 10, r: 6, s: -4, o: 16, decay: 4 },
  kept_secret: { t: 10, r: 6, s: -4, o: 6, decay: 4 },
  leaked_secret: { t: -18, r: -10, s: 16, o: -6, decay: 4 },
  gossiped_about_me: { t: -10, r: -8, s: 12, o: 0, decay: 4 },
  outed_me: { t: -18, r: -12, s: 20, o: -6, decay: 4 },
  reported_me: { t: -16, r: -10, s: 18, o: -4, decay: 4 },
  hired_me: { t: 10, r: 8, s: -6, o: 20, decay: 4 },
  fired_me: { t: -14, r: -10, s: 16, o: -12, decay: 4 },
  promoted_me: { t: 8, r: 10, s: -8, o: 14, decay: 4 },
  demoted_me: { t: -8, r: -10, s: 10, o: -4, decay: 4 },
  passed_over: { t: -6, r: -8, s: 10, o: 0, decay: 4 },
  poached_me: { t: -8, r: 4, s: 10, o: 0, decay: 4 },
  signed_me: { t: 10, r: 8, s: -4, o: 16, decay: 4 },
  referred_me: { t: 8, r: 6, s: -4, o: 12, decay: 4 },
  mentored_me: { t: 12, r: 14, s: -6, o: 14, decay: 4 },
  beat_me: { t: -2, r: 6, s: 8, o: 0, decay: 4 },
} as const satisfies Record<MemoryKind, MemoryFx>

function frozenTable(rows: Record<MemoryKind, MemoryFx>): Readonly<Record<MemoryKind, Readonly<MemoryFx>>> {
  for (const k of KINDS) Object.freeze(rows[k])
  return Object.freeze(rows)
}

/** The frozen effect table: one row for each of the 40 kinds (see the header for how to read it). */
export const MEMORY_FX: Readonly<Record<MemoryKind, Readonly<MemoryFx>>> = frozenTable({ ...FX })

/** The five kinds that never decay (decay 0 in MEMORY_FX) and that bind an edge while they are on it. */
export const PINNED_MEMORY_KINDS: ReadonlySet<MemoryKind> = new Set<MemoryKind>(['betrayal', 'saved_me', 'cut_from_will', 'estranged', 'divorced'])

/** True for one of the pinned five. Total. */
export function isPinnedKind(x: unknown): x is MemoryKind {
  return isMemoryKind(x) && PINNED_MEMORY_KINDS.has(x)
}

/** One memory, read: what happened, the year, the weight 1 to 3 (it decays to 0 and the memory goes) and who did it (the ego, the player, or they). */
export interface Memory {
  kind: MemoryKind
  year: number
  w: number
  by: 'ego' | 'them'
}

/** The longest text a memory can have: the longest kind id (17, gossiped_about_me), the longest year (6), a weight and a side, and three dots: 28 characters, with room to spare. */
const TEXT_MAX = 40
const YEAR_TEXT = /^[1-9][0-9]{3,5}$/

/**
 * Reads 'kind.year.weight.by' (by is e for the ego, t for they). Canonical text only: a known kind, a year from 1900 to 100000 with no
 * sign and no leading zero, a weight of 1, 2 or 3, a side of e or t, and nothing else. Anything that is not exactly that is null.
 */
export function parseMemory(s: unknown): Memory | null {
  if (typeof s !== 'string' || s.length > TEXT_MAX) return null
  const parts = s.split('.')
  if (parts.length !== 4) return null
  const [kind, y, w, by] = parts as [string, string, string, string]
  if (!isMemoryKind(kind) || !YEAR_TEXT.test(y)) return null
  const year = Number(y)
  if (year < SEEN_MIN || year > SEEN_MAX) return null
  if (w !== '1' && w !== '2' && w !== '3') return null
  if (by !== 'e' && by !== 't') return null
  return { kind, year, w: Number(w), by: by === 'e' ? 'ego' : 'them' }
}

/** The stored text of a memory. For code that knows what it writes: a RangeError for a kind, year, weight or side the reader would refuse. */
export function formatMemory(m: Memory): string {
  if (!isMemoryKind(m.kind)) throw new RangeError('formatMemory: unknown kind')
  if (!Number.isInteger(m.year) || m.year < SEEN_MIN || m.year > SEEN_MAX) throw new RangeError('formatMemory: bad year')
  if (m.w !== 1 && m.w !== 2 && m.w !== 3) throw new RangeError('formatMemory: bad weight')
  if (m.by !== 'ego' && m.by !== 'them') throw new RangeError('formatMemory: bad side')
  return `${m.kind}.${m.year}.${m.w}.${m.by === 'ego' ? 'e' : 't'}`
}
