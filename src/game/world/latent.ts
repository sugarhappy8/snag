// The latent person (R4-S3, D.1 b). A stranger is a pure function of the family seed and a slot; nothing is stored. The same banker is
// the same person in every year, fork and generation, because the person is read, not rolled:
//
//   latent(familySeed, slot, home?)   the person of a slot (sid.ts). familySeed is worldSeed(g): the life id without its `-g<n>`.
//   nameDraw(familySeed, sid, k, ...) the name of alternate k (0 is the latent name; 1 to 7 are the stored alternates of S6)
//   fromSeeded(seed, familySeed)      a LatentPerson for a name the caller already has (a rosterAt rival): the name is never regenerated
//   latentUnit(familySeed, sid, n)    the n-th unit of the key, for a task that needs a number beyond the 16 facets
//
// Every number comes from streamUnit(streamKey(familySeed, soc.latent, 0, sid), facet): a hash, not a generator, so there is no state to
// carry, no table row in test/stream-tap.ts and nothing taken from the game's own random numbers. This file takes no `g`, calls no rand
// or pick, and reads no clock (test/world-streams.test.ts guards it with every other file of world/). A call returns a new plain object.
//
// FACET numbers which unit feeds which field. It is append-only: a number that ever moves renames every person nobody has met yet.
//   0 gender   male when the unit is under 0.5, the rule of createPerson (`chance(g, 0.5) ? male : female`)
//   1 born     cohort minus an age drawn uniformly from the band of the kind (KIND_AGE)
//   2 first, 3 last   the name, from the pool of the home country (first names filtered by nameFitsYear, the whole pool when none fits)
//   4-8        the five axes in AXIS_IDS order, scaled onto 5..95 and whole (uniform: a stranger is as likely to be an extreme as a mean one)
//   9-12       the four stats in STAT_KEYS order, one draw each through a triangular transform over STAT_RANGE
//   13 skin    the tone itself, an element of the country's skinTones list (a tone 1 to 5, weighted by repetition), not an index
//   14 wealth  a band 0..9 (deciles, so uniform)
//   15 path    a 31 bit whole number. RESERVED: computed and pinned by the golden file, read by no R4 task (Life's ageTo uses
//              outcomeStream(g, life.path, y, sid); C34). It stays so a later release can use it without moving anyone.
// Units 16 and up are the name alternates (two for each k = 1..7: first at 16 + 2(k-1), last one above it) and whatever a later task
// takes next; a task that needs a unit records the number in docs/PEOPLE.md.
//
// KIND_AGE and FACET are design data and freeze at the first recording of test/fixtures/latent-golden.json (cross-check 3.3, X57): it
// is never re-recorded, so its first recording fixes `born` through the bands and every facet number for every person a seed will
// ever produce. A change afterwards needs LATENT_V 2, a RECORD_REASON, a moved-tests.md row and the lead's OK. Name tables change
// between releases; only a person nobody has met feels it, because the Met record (S4) stores the identity it resolved.
//
// Layer 2. Imports the stream keys, the name data and the pools of world.ts, and the sibling files; the module-level tables read nothing
// that is imported (rule (d) of the layers test).
import { nameFitsYear } from '../history/events-people'
import { streamKey, streamUnit } from '../kernel/streams'
import { STAT_KEYS, type Gender, type StatKey } from '../types'
import { COUNTRIES, getCountry, namePoolOf } from '../world'
import { AXIS_IDS, type Axes } from './axes'
import { makeSid, type SidKind, type Slot } from './sid'

/** The version of the facets. 1 in R4; a changed facet number or band is LATENT_V 2 with a new golden file. */
export const LATENT_V = 1

/** Which unit of the key feeds which field. Frozen: see the header. */
export const FACET = Object.freeze({
  gender: 0,
  born: 1,
  first: 2,
  last: 3,
  ambition: 4,
  honesty: 5,
  empathy: 6,
  risk: 7,
  steadiness: 8,
  happiness: 9,
  health: 10,
  smarts: 11,
  looks: 12,
  skin: 13,
  wealth: 14,
  path: 15,
} as const)

/** The first unit of the name alternates: k = 1 uses 16 and 17, k = 2 uses 18 and 19, up to k = 7 (28 and 29). Units 30 and up are free. */
export const NAME_ALT_UNIT = 16

/** The stream tag of the key. One tag, one module (docs/STREAMS.md). */
const TAG = 'soc.latent'

/** A table of rows frozen to the bottom: the table and every row. */
function frozenRows<T extends Record<string, readonly [number, number]>>(t: T): Readonly<T> {
  for (const k of Object.keys(t)) Object.freeze(t[k])
  return Object.freeze(t)
}

/**
 * The age band of each kind, [lo, hi], whole years, both ends reachable: a person of the kind is `cohort - age` born, age drawn
 * uniformly from lo..hi. The age is the person's age in the year the slot belongs to (its cohort).
 *   careers  the debut age of the career kit (rivals.ts planOf defaults to 18..30; ACTOR_SPEC 19-26, MODEL_SPEC 16-22, MUSIC_SPEC 17-28,
 *            ASTRO_SPEC 26-40), a little wider on both sides because a rival debuts up to four years after the cohort starts
 *   cls      a classmate of the cohort that starts school: 5 to 7
 *   tch      a teacher: 28 to 60
 *   cow      a coworker of working age: 20 to 60
 *   boss     a boss: 30 to 62
 *   dat      a dating candidate: 18 to 45
 *   frn      a friend: 14 to 60
 *   kin      a relative: 20 to 75
 *   dir      a company director: 40 to 70
 *   stf      key staff: 22 to 61, the range hiring rolls today (business/staff.ts)
 *   exe      an executive: 35 to 65
 *   pol      a politician: 30 to 70
 * The oldest hi is 75, so a person of the first cohort (1850) is born in 1775 at the earliest, above the 1700 floor of a Met record.
 */
export const KIND_AGE: Readonly<Record<SidKind, readonly [lo: number, hi: number]>> = frozenRows({
  actor: [18, 30],
  model: [15, 23],
  music: [17, 30],
  astronaut: [26, 42],
  author: [22, 50],
  gamedev: [20, 42],
  sport: [16, 32],
  cls: [5, 7],
  tch: [28, 60],
  cow: [20, 60],
  boss: [30, 62],
  dat: [18, 45],
  frn: [14, 60],
  kin: [20, 75],
  dir: [40, 70],
  stf: [22, 61],
  exe: [35, 65],
  pol: [30, 70],
} as const)

/** The range of each stat, the one createPerson and makeCandidate roll with (a person from a slot reads like a rolled one). */
export const STAT_RANGE: Readonly<Record<StatKey, readonly [lo: number, hi: number]>> = frozenRows({
  happiness: [30, 100],
  health: [50, 100],
  smarts: [10, 100],
  looks: [10, 100],
} as const)

/** A person who is not in g.people yet. Plain JSON; `path` is reserved (see the header). */
export interface LatentPerson {
  v: 1
  sid: string
  gender: Gender
  born: number
  country: string
  first: string
  last: string
  axes: Axes
  stats: Record<StatKey, number>
  skin: number
  wealth: number
  path: number
}

/** The name and identity a caller already has for a sid (a rosterAt rival): fromSeeded keeps them. */
export interface SeededIdentity {
  sid: string
  first: string
  last: string
  gender: Gender
  born: number
  country: string
}

// --- Units ----------------------------------------------------------------------------------------------------------------------------

/** The n-th unit, in [0, 1), of the key of one person. Pure: the same family, sid and n always give the same number. */
export function latentUnit(familySeed: string, sid: string, n: number): number {
  return streamUnit(streamKey(familySeed, TAG, 0, sid), n)
}

/** `u` in [0, 1) as an index into a list of `n` (n at least 1). */
function bucket(u: number, n: number): number {
  return Math.min(n - 1, Math.floor(u * n))
}

/** A symmetric triangular law over [0, 1] (mode 0.5) from one unit, by inverting its distribution: only a square root, so it is exact on every engine. */
function triangular(u: number): number {
  return u < 0.5 ? Math.sqrt(u / 2) : 1 - Math.sqrt((1 - u) / 2)
}

// --- Where, and what name -------------------------------------------------------------------------------------------------------------

let countryIds: ReadonlySet<string> | null = null

/** True for the id of a country of world.ts. `getCountry` falls back to the first country for an unknown id, so the test is explicit. */
function isCountry(id: unknown): id is string {
  if (typeof id !== 'string') return false
  countryIds ??= new Set(COUNTRIES.map((c) => c.id))
  return countryIds.has(id)
}

/** The home country: the one given for an entity-placed slot (a firm id), else the place when it is a country id, else the United States. */
function homeOf(slot: Slot, home: string | undefined): string {
  return isCountry(home) ? home : isCountry(slot.place) ? slot.place : 'us'
}

/**
 * The name of alternate `k` (0 to 7) of the person of `sid`: the first name from the home pool of the gender, filtered by nameFitsYear
 * (the whole pool when none fits, as rivals.ts does), the last name from the pool. k = 0 is the latent name (facets 2 and 3); k = 1..7
 * are the alternates S6 stores when a name is taken (units 16 and up). A country that is not a country id reads as the United States.
 * Throws a RangeError for any other k: S6 owns the hyphenated k = 8, and k comes from code, never from saved data.
 */
export function nameDraw(familySeed: string, sid: string, k: number, gender: Gender, born: number, country: string): { first: string; last: string } {
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 0 || k > 7) throw new RangeError('nameDraw: k is a whole number, 0 to 7')
  const pool = namePoolOf(isCountry(country) ? country : 'us')
  const all = gender === 'male' ? pool.male : pool.female
  const fitting = all.filter((n) => nameFitsYear(n, born))
  const firsts = fitting.length > 0 ? fitting : all
  const key = streamKey(familySeed, TAG, 0, sid)
  const unitFirst = k === 0 ? FACET.first : NAME_ALT_UNIT + 2 * (k - 1)
  const unitLast = k === 0 ? FACET.last : NAME_ALT_UNIT + 2 * (k - 1) + 1
  const first = firsts.length > 0 ? firsts[bucket(streamUnit(key, unitFirst), firsts.length)]! : gender === 'male' ? 'Alex' : 'Sam'
  const last = pool.last.length > 0 ? pool.last[bucket(streamUnit(key, unitLast), pool.last.length)]! : 'Doe'
  return { first, last }
}

// --- The person -----------------------------------------------------------------------------------------------------------------------

/** Everything but the name, the gender, the birth year and the country, which the caller decides: axes, stats, skin, wealth, path. */
function build(familySeed: string, sid: string, gender: Gender, born: number, country: string, first: string, last: string): LatentPerson {
  const key = streamKey(familySeed, TAG, 0, sid)
  const unit = (facet: number): number => streamUnit(key, facet)
  const axes = {} as Axes
  for (const id of AXIS_IDS) axes[id] = 5 + bucket(unit(FACET[id]), 91)
  const stats = {} as Record<StatKey, number>
  for (const k of STAT_KEYS) {
    const [lo, hi] = STAT_RANGE[k]
    stats[k] = Math.round(lo + triangular(unit(FACET[k])) * (hi - lo))
  }
  const tones = getCountry(isCountry(country) ? country : 'us').skinTones
  return {
    v: LATENT_V,
    sid,
    gender,
    born,
    country,
    first,
    last,
    axes,
    stats,
    skin: tones[bucket(unit(FACET.skin), tones.length)] ?? 3,
    wealth: bucket(unit(FACET.wealth), 10),
    path: Math.floor(unit(FACET.path) * 2 ** 31),
  }
}

/**
 * The person of a slot, for a family. Pure: no `g`, no draw, the same twice, after a JSON round trip, in any call order. `home` is the
 * country of an entity-placed slot (a firm id as the place); without it the place is the country when it is a country id, else `us`.
 * Throws a RangeError for a slot the grammar refuses (makeSid): a slot is built by code from a parsed sid, never from saved data.
 */
export function latent(familySeed: string, slot: Slot, home?: string): LatentPerson {
  const sid = makeSid(slot)
  const [lo, hi] = KIND_AGE[slot.kind]
  const gender: Gender = latentUnit(familySeed, sid, FACET.gender) < 0.5 ? 'male' : 'female'
  const born = slot.cohort - (lo + bucket(latentUnit(familySeed, sid, FACET.born), hi - lo + 1))
  const country = homeOf(slot, home)
  const { first, last } = nameDraw(familySeed, sid, 0, gender, born, country)
  return build(familySeed, sid, gender, born, country, first, last)
}

/**
 * A LatentPerson for a name the caller already has (a rosterAt rival, whose name rosterAt chose against its earlier rivals): the name,
 * gender, birth year and country are kept as given, and the axes, stats, skin, wealth and path come from the facets of the sid. It never
 * regenerates the name. Skin reads the tone list of the country given.
 */
export function fromSeeded(seed: SeededIdentity, familySeed: string): LatentPerson {
  return build(familySeed, seed.sid, seed.gender, seed.born, seed.country, seed.first, seed.last)
}
