// The Person bridge (R4-S8, D.1 g): a Met identity becomes a Person of g.people with no dice and no account surprise.
//
//   materializePerson(g, sid, opts)   the Person of a sid, made if there is none. Null for a sid that is not of the strict grammar, a
//                                     relation outside SID_RELATIONS, or a touch the registry refuses (every held record is protected)
//   personOfSid(g, sid)               the Person of g.people whose personKey is the sid, or undefined. Pure
//   SID_RELATIONS                     every relation except child, stepchild, grandchild and pet
//   heirUnsafe                        re-exported from kernel/person-ref.ts, where it is defined (layer 0) so world/ can name it
//
// What it does, in order: it returns the Person that already holds the sid (idempotent; this is also what lets the hand-over reset an
// existing holder of a sid instead of making a second one); else it touches the registry (touchMet: the record's own identity when
// there is one, latent and the name registry on a first sight, a tombstone wakes with its stored names), and builds the Person with
// createPerson, given EVERY field. createPerson rolls g.rng for a field left undefined (occupation, relationship, money, stats, traits,
// a name, a gender), so none is left: the occupation, relationship, money and livesWithPlayer a caller omits come from fixed defaults
// that draw nothing, the stats and the skin tone come from latent (the record stores neither), the traits from the record's axes, the
// name, gender, birth year and country from the record. g.rng does not move and g.nextId moves by one, for a new Person only.
//
// The opening money is the exempt balance of docs/LEDGER.md rule 6: it is the `money` literal of a new Person and is never booked, so
// the account person:<sid> starts at 0 beside a Person who may start with more, exactly as every Person createPerson has made.
//
// data.sid has two writers in the whole game: this function, and the heir-spouse rebuild of the hand-over (X15). It is written on a NEW
// Person with a relation of SID_RELATIONS only, never on an existing Person, a child, a stepchild, a grandchild, a pet or the former
// player, because the ledger already names person:<data.sid> (cash.ts) and a sid stamped later renames an account. The sid of the call
// is spread last, so a sid in opts.data never wins.
//
// A call is an action or a yearly step, never a read. A caller gates on the social stamp (X6); nothing here reads a flag.
//
// Layer 3, domain life (a root file with no folder of its name). It imports the root people.ts of its own domain, the kernel and the
// registry of world/, all of which sit below it.
import { personKey } from './kernel/person-ref'
import { worldSeed } from './kernel/streams'
import { createPerson } from './people'
import type { GameState, Json, Person, RelationKind } from './types'
import { AXIS_IDS, labelsFromAxes, type Axes } from './world/axes'
import { latent } from './world/latent'
import { metRecord } from './world/met'
import { touchMet } from './world/met-ops'
import { isSid, parseSid } from './world/sid'

export { heirUnsafe } from './kernel/person-ref'

/** What a caller may say about the Person it asks for. Only `relation` is needed; every other field has a fixed default. */
export interface MaterializeOpts {
  relation: RelationKind
  /** Whole years. Default: the game year less the record's birth year. */
  age?: number
  /** Default by age: None under 5, Student under 18, Retired from 67, else Unemployed (the literals randomOccupation returns before it rolls). */
  occupation?: string
  /** 0 to 100. Default 50. */
  relationship?: number
  /** The opening balance (docs/LEDGER.md rule 6), never booked. Default 0. */
  money?: number
  /** Default false. */
  livesWithPlayer?: boolean
  contextId?: string
  /** The country of an entity-placed slot (a firm id as the place of the sid), as touchMet and latent read it. */
  home?: string
  /** The role weight of the Met record, 0 to 9. */
  role?: number
  /** Extra Person.data. The `sid` key of it never wins. */
  data?: Record<string, Json>
}

/** Which relations may carry a sid. A table of the type, so a new RelationKind is a compile error here until it is decided. */
const CARRIES_SID: Record<RelationKind, boolean> = {
  parent: true,
  stepparent: true,
  sibling: true,
  halfSibling: true,
  stepsibling: true,
  grandparent: true,
  child: false,
  stepchild: false,
  grandchild: false,
  friend: true,
  bestFriend: true,
  enemy: true,
  classmate: true,
  teacher: true,
  coworker: true,
  boss: true,
  partner: true,
  fiance: true,
  spouse: true,
  ex: true,
  exSpouse: true,
  lover: true,
  cellmate: true,
  pet: false,
}

/**
 * Every relation except child, stepchild, grandchild and pet. A child, a stepchild or a grandchild is what the hand-over spreads into
 * the heir (a sid on one would rename the heir's account), and a pet has no ledger account of a stranger.
 */
export const SID_RELATIONS: ReadonlySet<RelationKind> = new Set((Object.keys(CARRIES_SID) as RelationKind[]).filter((k) => CARRIES_SID[k]))

/** The limits a caller's options are cut to. The ages are people's, the text limits keep a saved Person small. */
const LIMITS = Object.freeze({ ageMax: 150, openingMax: 1e12, textMax: 60, contextMax: 80 })

/** The occupation a Person of this age has when the caller says none: the literals randomOccupation returns before it rolls. */
function occupationAt(age: number): string {
  return age < 5 ? 'None' : age < 18 ? 'Student' : age >= 67 ? 'Retired' : 'Unemployed'
}

/** The number itself when it is a finite number, else undefined. */
function finite(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined
}

/** A whole number in lo..hi: the number made whole and cut into the range, or `fallback` when it is no finite number. */
function whole(x: unknown, lo: number, hi: number, fallback: number): number {
  const n = finite(x)
  return n === undefined ? fallback : Math.max(lo, Math.min(hi, Math.round(n)))
}

/** A non-empty text of at most `max` characters, else undefined. */
function text(x: unknown, max: number): string | undefined {
  return typeof x === 'string' && x.trim() !== '' ? x.slice(0, max) : undefined
}

/** The Person of g.people whose personKey is `sid` (a sid, or the id of a person made before sids existed), or undefined. Pure. */
export function personOfSid(g: Pick<GameState, 'people'>, sid: string): Person | undefined {
  if (typeof sid !== 'string' || sid === '' || !Array.isArray(g.people)) return undefined
  return g.people.find((p) => p !== null && typeof p === 'object' && personKey(p) === sid)
}

/**
 * The Person of a sid, made when there is none. See the header. An action or a yearly step only: it writes the Met store (touchMet)
 * and g.people. Returns the Person that already holds the sid when there is one (whatever its relation, and without a touch or a
 * write); null for a sid that is not of the strict grammar, a relation outside SID_RELATIONS, options that are no object, or a touch
 * the registry refuses (then nothing is created and nothing changes, so a living Person never holds a sid without a record).
 */
export function materializePerson(g: GameState, sid: string, opts: MaterializeOpts): Person | null {
  if (!isSid(sid) || opts === null || typeof opts !== 'object') return null
  const relation = opts.relation
  if (typeof relation !== 'string' || !SID_RELATIONS.has(relation)) return null
  const slot = parseSid(sid)
  if (slot === null) return null

  const held = personOfSid(g, sid)
  if (held !== undefined) return held

  const role = finite(opts.role)
  const home = typeof opts.home === 'string' ? opts.home : undefined
  if (!touchMet(g, sid, role === undefined ? undefined : { w: role }, home)) return null
  const rec = metRecord(g, sid)
  if (rec === null) return null

  // The record stores neither the stats nor the skin tone: both come from latent, for the record's own country.
  const lat = latent(worldSeed(g), slot, rec.c)
  const axes = {} as Axes
  AXIS_IDS.forEach((id, i) => {
    axes[id] = rec.a[i] ?? 50
  })
  const age = whole(opts.age, 0, LIMITS.ageMax, Math.max(0, Math.min(LIMITS.ageMax, g.year - rec.b)))
  const extra = opts.data !== null && typeof opts.data === 'object' && !Array.isArray(opts.data) ? opts.data : {}

  return createPerson(g, {
    relation,
    age,
    gender: rec.g === 1 ? 'male' : 'female',
    firstName: rec.f,
    lastName: rec.l,
    countryId: rec.c,
    occupation: text(opts.occupation, LIMITS.textMax) ?? occupationAt(age),
    traits: labelsFromAxes(axes),
    stats: lat.stats,
    relationship: whole(opts.relationship, 0, 100, 50),
    money: whole(opts.money, 0, LIMITS.openingMax, 0),
    skinTone: lat.skin,
    livesWithPlayer: opts.livesWithPlayer === true,
    contextId: text(opts.contextId, LIMITS.contextMax),
    data: { ...extra, sid },
  })
}
