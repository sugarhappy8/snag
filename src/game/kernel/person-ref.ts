// The one rule for a person's key (R4-S1, D.1 a). The books (cash.ts) and the world index (world/people.ts) have to name a person
// the same way, and each used to carry its own copy of the rule. This is the only copy.
//
//   validSid(x)       the text itself when `person:<x>` is a ref (the test both old copies ran), else null
//   personSid(p)      validSid(p.data.sid): a file outside this one that needs a person's sid asks here (world/met.ts does)
//   personKey(p)      personSid(p) when there is one, else p.id
//   personEntity(p)   person:<personKey(p)>, or pool:other for a key that is no name at all (never a person row)
//   heirUnsafe(p)     a valid sid on a child, a stepchild or a grandchild: kin whose sid the hand-over would carry along
//
// A sid is any text a ref can carry. 's77', 's9' and 's-42' are sids, and so is 'cls.us.2004.12'; the stricter grammar that the
// registry mints (world/sid.ts) is for the sids it makes and never for what is accepted here, so an old save keeps reading. A person
// made before sids existed has none, and its key is its id.
//
// Pure: no luck, no write, no state. It reads `p.data?.sid` through an optional chain because a very old save can hold a person with
// no `data` at all. This is a kernel leaf: it imports ids and types only, so layer-2 files (world/) and the money layer can use it.
import type { Person } from '../types'
import { parseRef, type EntityRef } from './ids'

/** `x` when it is text that parses as `person:<x>` (a name an account can have), else null. Total: any value comes back as text or null. */
export function validSid(x: unknown): string | null {
  return typeof x === 'string' && parseRef(`person:${x}`) !== null ? x : null
}

/** A person's sid when it is a valid one, else null. The only read of `data.sid` in src/game; a person with no `data` has none. */
export function personSid(p: Pick<Person, 'data'>): string | null {
  return validSid(p.data?.sid)
}

/** A person's key: the sid when it is a valid one, else the id. This is the id of every person made before sids existed. */
export function personKey(p: Pick<Person, 'id' | 'data'>): string {
  return personSid(p) ?? p.id
}

/** person:<sid> for a person with a valid sid, else person:<id>; pool:other for one whose key is no name at all (an id of a hostile save). */
export function personEntity(p: Pick<Person, 'id' | 'data'>): EntityRef {
  const key: unknown = personKey(p)
  return typeof key === 'string' && parseRef(`person:${key}`) !== null ? (`person:${key}` as EntityRef) : 'pool:other'
}

/**
 * True for kin that carries a valid sid: a child, a stepchild or a grandchild. The hand-over spreads a person into the heir, so a sid on
 * one of them would travel with the record and rename the heir's account; no writer puts a sid on such a person. Defined here (layer 0)
 * so a layer-2 file can name it; the materializer re-exports it.
 */
export function heirUnsafe(p: Pick<Person, 'relation' | 'data'>): boolean {
  return (p.relation === 'child' || p.relation === 'stepchild' || p.relation === 'grandchild') && personSid(p) !== null
}
