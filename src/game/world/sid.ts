// The sid: the name of a person who may not exist yet (R4-S3, D.1 b). A stranger is a slot, (kind, place, cohort, ord), and the text of a
// slot is the person's sid:
//
//   cls.us.2004.12        the 12th classmate of the 2004 school cohort in the US
//   actor.us.1985.0       the first actor rival of the 1985 cohort in the US (the ids rosterAt already makes are sids)
//
//   makeSid(slot)   the text of a slot; throws a RangeError for a slot that is not one (code only, never saved data)
//   parseSid(x)     the slot of a text, or null; total (any value in, null for what is not canonical text)
//   isSid(x)        parseSid(x) !== null
//
// The grammar is closed and canonical: one text for one slot, so makeSid(parseSid(x)) === x. The kind comes from a table of 18 that is
// append-only (R6 and R7 append, nobody renames); the place is 1 to 12 of letters, digits, underscore and dash (a country id, or a firm,
// school or town id); the cohort is 1850..2400 (the range rosterAt allows); the ord is 0..9999 (rosterAt numbers the rivals of a cohort
// from 0, so `actor.us.1985.0` is a real id); both numbers are plain decimal with no leading zero; the whole text is 40 characters at
// most (the longest possible is 32) and holds no colon, so `person:<sid>` is a valid ref. No sid is `p<n>`, `ks<n>`, `a<n>` or
// `out.*` (the nepo stand-in ids, which is why `out` is not a kind).
//
// The strict grammar is for the sids the registry mints and for Met keys. The reader of an account name stays lenient (kernel/person-ref
// validSid accepts `s77` and `s-42`), so an old save keeps reading. A sid is written to `Person.data.sid` by exactly two places (S8, L9).
//
// Pure: no import, no state, no draw. Layer 2, so the Met shard and the latent person can use it and a layer-3 file can read it.

/**
 * The closed table of kinds, in the order they were added. 7 careers (the ids of the career kit) and 11 roles: a classmate, a teacher, a
 * coworker, a boss, a dating candidate, a friend, a relative, a company director, a key staff member, an executive and a politician.
 * Append-only: R6 appends the kinds the inventory in docs/PEOPLE.md names, with new golden rows appended in the same commit.
 */
export const SID_KINDS = Object.freeze(['actor', 'model', 'music', 'astronaut', 'author', 'gamedev', 'sport', 'cls', 'tch', 'cow', 'boss', 'dat', 'frn', 'kin', 'dir', 'stf', 'exe', 'pol'] as const)
export type SidKind = (typeof SID_KINDS)[number]

/** Where a stranger is found: the kind, the place, the cohort (the year the slot belongs to) and the number within the cohort. */
export interface Slot {
  kind: SidKind
  place: string
  cohort: number
  ord: number
}

/** The limits of the grammar, stated once. L4 and S4 read them where they must refuse a year or a number before calling makeSid. */
export const SID_LIMITS = Object.freeze({ cohortMin: 1850, cohortMax: 2400, ordMax: 9999, placeMax: 12, lengthMax: 40 })

const KINDS: ReadonlySet<string> = new Set(SID_KINDS)
const PLACE = /^[A-Za-z0-9_-]{1,12}$/
/** A whole number in plain decimal: 0, or digits with no leading zero, at most four of them. */
const PLAIN = /^(?:0|[1-9][0-9]{0,3})$/

/** True when `v` is a whole number in `lo..hi`. */
function whole(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
}

/** The slot a text names, or null. Canonical text only: four parts, a kind of the table, a place, a plain cohort and a plain ord in range. */
export function parseSid(x: unknown): Slot | null {
  if (typeof x !== 'string' || x.length > SID_LIMITS.lengthMax) return null
  const parts = x.split('.')
  if (parts.length !== 4) return null
  const [kind, place, cohortText, ordText] = parts as [string, string, string, string]
  if (!KINDS.has(kind) || !PLACE.test(place) || !PLAIN.test(cohortText) || !PLAIN.test(ordText)) return null
  const cohort = Number(cohortText)
  const ord = Number(ordText)
  if (cohort < SID_LIMITS.cohortMin || cohort > SID_LIMITS.cohortMax || ord > SID_LIMITS.ordMax) return null
  return { kind: kind as SidKind, place, cohort, ord }
}

/** True for a text that parseSid accepts. */
export function isSid(x: unknown): x is string {
  return parseSid(x) !== null
}

/** The text of a slot: `<kind>.<place>.<cohort>.<ord>`. Throws a RangeError for a slot the grammar refuses; it is for code, never for saved data. */
export function makeSid(slot: Slot): string {
  const s = slot as unknown
  if (typeof s !== 'object' || s === null) throw new RangeError('makeSid: a slot is an object')
  const { kind, place, cohort, ord } = s as Record<string, unknown>
  if (typeof kind !== 'string' || !KINDS.has(kind)) throw new RangeError('makeSid: the kind is not in SID_KINDS')
  if (typeof place !== 'string' || !PLACE.test(place)) throw new RangeError('makeSid: the place is 1 to 12 of letters, digits, underscore and dash')
  if (!whole(cohort, SID_LIMITS.cohortMin, SID_LIMITS.cohortMax)) throw new RangeError('makeSid: the cohort is a whole year, 1850 to 2400')
  if (!whole(ord, 0, SID_LIMITS.ordMax)) throw new RangeError('makeSid: the ord is a whole number, 0 to 9999')
  const sid = `${kind}.${place}.${cohort}.${ord}`
  if (sid.length > SID_LIMITS.lengthMax) throw new RangeError('makeSid: the text is over 40 characters')
  return sid
}
