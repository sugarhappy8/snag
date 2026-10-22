// The odds terms and the words of the world frontier (R3-F6, C.6): the pure read API that the screens and the research odds use.
//
// Two things the frontier does to a research roll, and plain words for how far ahead it is:
//
//   frontierTerms(g, field)  { spill, rival, lead }. `spill` is public research, odds points 0 to 18: what other researchers have
//                            published in this field (and, for an AI capability, in `ai` above it). `rival` is rival pressure,
//                            odds points 0 to 8: 2 for each rival push of the field (and its parent) in the last 3 years. `lead`
//                            is the field's own lead in years. Effort migration passes the first two to `quote`, under the
//                            names in FRONTIER_REASONS ("public research +6", "rival pressure -4"); the fog layer wraps the words.
//   frontierWords(lead)      'on schedule' to 'far ahead of schedule', five steps.
//   fieldLine(g, field)      'Fusion power: ahead of schedule.' One line a screen can print as it is.
//
// Why it is safe:
//   - Zero at default. A life with no shard (every life up to 2026, and any life that never meets a push), a field that is not one
//     and any year up to 2026 give { spill: 0, rival: 0, lead: 0 }, so a research system that adds the two terms keeps the odds it
//     had before R3 (the parity grid of Effort migration).
//   - No foresight: `year` is cut to g.year, so nothing reads a year after the present. History is fixed: a year up to 2026 reads as
//     nothing, because no push can be dated there. The pool of public research is one number held now (it fades in the yearly step,
//     world/frontier-step.ts), so for an earlier `year` the spill is the pool as it stands and only the rival window moves.
//   - Pure. It reads the shard through readFrontier (an absent or hostile shard is an empty one, nothing is created or written),
//     draws no random number and reads no clock, so the same state gives the same numbers every time.
//   - Bounded. 18 and 8 are the caps `quote` applies to the two terms (Effort's SPILL_TERM_MAX and RIVAL_PTS); the 6 points a single
//     disclosure adds stay in FRONTIER_CAPS.
//
// The reasons are string literals on purpose: this file imports nothing from effort/, and a test of the Effort track checks that
// its labels are these two strings. It sits in layer 2 and imports only ./frontier, ./frontier-fields and the types.
import { PRESENT_YEAR } from '../history/timeline'
import type { GameState } from '../types'
import { frontierLead, frontierRows, frontierSpill } from './frontier'
import { fieldLabel, isFieldId, parentField, type FieldId } from './frontier-fields'

/** What a field's frontier does to a research roll: two odds terms and the lead, in years. */
export interface FrontierTerms {
  /** Public research, odds points, 0 to 18. */
  spill: number
  /** Rival pressure, odds points, 0 to 8: the size of the term, taken off the odds by the caller. */
  rival: number
  /** The field's own lead in years, 0 to 12, two places (not the parent's). */
  lead: number
}

/** The names of the two terms in an odds line: "public research +6", "rival pressure -4". Effort's TERM_LABEL carries the same strings. */
export const FRONTIER_REASONS = { spill: 'public research', rival: 'rival pressure' } as const

/** The most public research one odds line shows, odds points. */
const SPILL_MAX = 18
/** The most rival pressure one odds line shows, odds points, and what one rival push of the last 3 years is worth. */
const RIVAL_MAX = 8
const RIVAL_EACH = 2
/** A rival push counts from `year - 2` to `year`: three years. */
const WINDOW_YEARS = 3

const ZERO = (): FrontierTerms => ({ spill: 0, rival: 0, lead: 0 })

/** The year a read means: the one asked, cut to the present (no foresight), whole; an unreadable one is the present. */
function readYear(g: Pick<GameState, 'year'>, year: number | undefined): number {
  if (typeof year !== 'number' || Number.isNaN(year)) return g.year
  return Math.min(Math.trunc(year), g.year)
}

/** The rival rows of a field that fall in the three years ending at `year`. */
function rivalRows(g: Pick<GameState, 'world'>, field: FieldId, year: number): number {
  let n = 0
  for (const r of frontierRows(g, field)) if (r.w === 'rival' && r.y >= year - (WINDOW_YEARS - 1) && r.y <= year) n++
  return n
}

/**
 * The two odds terms and the lead of a field. A null or unknown field, a life with no shard and any year up to 2026 give zeros.
 * `spill` is the public research of the field and of its parent (an AI capability also sees `ai`), at most 18 points; `rival` is 2
 * points for each rival push of the field and its parent in the three years ending at `year`, at most 8; `lead` is the field's own.
 * `year` is cut to g.year. Pure: it reads, it never writes, and it draws nothing.
 */
export function frontierTerms(g: Pick<GameState, 'world' | 'year'>, field: FieldId | null, year?: number): FrontierTerms {
  if (field === null || !isFieldId(field)) return ZERO()
  const y = readYear(g, year)
  if (y <= PRESENT_YEAR) return ZERO()
  const parent = parentField(field)
  const spill = frontierSpill(g, field) + (parent === null ? 0 : frontierSpill(g, parent))
  const rows = rivalRows(g, field, y) + (parent === null ? 0 : rivalRows(g, parent, y))
  return { spill: Math.min(SPILL_MAX, spill), rival: Math.min(RIVAL_MAX, RIVAL_EACH * rows), lead: frontierLead(g, field) }
}

/**
 * How far ahead of the calendar a lead in years is, in words: under a quarter of a year 'on schedule', under 1 'a little ahead of
 * schedule', under 3 'ahead of schedule', under 6 'well ahead of schedule', else 'far ahead of schedule'. A negative or unreadable
 * lead is on schedule.
 */
export function frontierWords(lead: number): string {
  if (typeof lead !== 'number' || !(lead >= 0.25)) return 'on schedule'
  if (lead < 1) return 'a little ahead of schedule'
  if (lead < 3) return 'ahead of schedule'
  if (lead < 6) return 'well ahead of schedule'
  return 'far ahead of schedule'
}

/** One line for a screen: 'Fusion power: ahead of schedule.' (at most 90 characters). Empty for a field that is not one. */
export function fieldLine(g: Pick<GameState, 'world'>, field: FieldId): string {
  if (!isFieldId(field)) return ''
  const label = fieldLabel(field)
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${frontierWords(frontierLead(g, field))}.`
}
