// The spread of a leak (R4-E11, D.4, X27): who a holder tells when a secret gets out, and how far it goes. Two pure things.
//
//   spread(holder, contactsOf, skip)   the tellings of one leak: the holder tells at most TELLS[0] = 2 people (the best liked of their
//                      contacts), each of those at most TELLS[1] = 1 more, and it stops there (HOP_CAP 2). So a leak tells 4 people at
//                      most (MAX_TOLD), nobody twice, and never the holder or anyone in `skip` (the other holders, who know already).
//                      It is a function of the lists it is given, so the cap holds for any graph, a hostile one included: a list is
//                      read from its first SCAN entries only, and a repeat, the teller itself and anyone in `skip` are passed over.
//   tellings(g, holder, skip)   spread over the contacts of the game: the people told, with who told them and at which hop.
//   contactsOf(g, p)   the people `p` could tell, best liked first: the living people of the game, not pets, that `p` knows (the same
//                      circle: the family, the friends or the same school or firm, favor.ts `acquainted`). How much `p` likes one is
//                      the `f` of the edge p > that person when the map holds it, else a base for the circle (the family 55, friends 50,
//                      a school or firm 45: the model has no other acquaintance graph yet); ties go by person key, so the order is a
//                      function of the state and never of the order of g.people.
//
// Neither draws a number, writes a field or reads the clock. The leak itself, the odds and the damage are society/secret.ts.
//
// Layer 3 (society). It imports the kernel's person key, the edge reads and the favor circles.
import { personEntity, personKey } from '../kernel/person-ref'
import type { GameState, Person } from '../types'
import { readEdge } from '../world/edges'
import { acquainted, circleOf } from './favor'

/** The hops of a leak, and who is told at each: the holder tells 2, each of those tells 1 more. */
export const HOP_CAP = 2
export const TELLS: readonly [first: number, next: number] = Object.freeze([2, 1] as const)
/** The most people one leak tells: 2 at the first hop and 1 for each at the second. */
export const MAX_TOLD = 4
/** The first entries of a list of contacts that spread looks at. A real list is the people of one circle. */
const SCAN = 64

/** One telling: `who` was told by `from`, at hop 1 (by the holder) or 2 (by someone who was told). */
export interface Telling {
  who: string
  from: string
  hop: 1 | 2
}

/** The tellings of one leak (see the header). `contactsOf(id)` lists whom `id` would tell, best liked first. Pure. */
export function spread(holder: string, contactsOf: (id: string) => readonly string[], skip: ReadonlySet<string>): Telling[] {
  const known = new Set<string>(skip)
  known.add(holder)
  const out: Telling[] = []
  let tellers: readonly string[] = [holder]
  for (let hop = 1; hop <= HOP_CAP; hop++) {
    const room = TELLS[hop - 1]!
    const told: string[] = []
    for (const from of tellers) {
      const list = contactsOf(from)
      let n = 0
      for (let i = 0; i < list.length && i < SCAN && n < room; i++) {
        const who = list[i]!
        if (typeof who !== 'string' || known.has(who)) continue
        known.add(who)
        out.push({ who, from, hop: hop as 1 | 2 })
        told.push(who)
        n++
      }
    }
    tellers = told
  }
  return out
}

/** The base of how much someone likes a person they have no edge to, by the circle they share. */
function baseOf(q: Pick<Person, 'relation' | 'contextId'>): number {
  const c = circleOf(q)
  return c === 'family' ? 55 : c === 'friends' ? 50 : 45
}

const present = (p: Person): boolean => p.alive && p.relation !== 'pet'

/** The people `p` could tell, best liked first (see the header). A new list each call. Pure. */
export function contactsOf(g: Readonly<GameState>, p: Person): Person[] {
  const from = personEntity(p)
  const rows: { q: Person; f: number; key: string }[] = []
  for (const q of g.people) {
    if (q.id === p.id || !present(q) || !acquainted(p, q)) continue
    const e = readEdge(g, from, personEntity(q))
    rows.push({ q, f: e !== null && Number.isFinite(e.f) ? e.f : baseOf(q), key: personKey(q) })
  }
  rows.sort((a, b) => b.f - a.f || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return rows.map((r) => r.q)
}

/** One telling of a leak in a game: the people, not their ids. */
export interface PersonTelling {
  who: Person
  from: Person
  hop: 1 | 2
}

/**
 * The tellings of a leak that `holder` starts, in the game: spread over the contacts of each teller (`skip` is the ids of the people who know
 * already, the other holders). At most MAX_TOLD people, each once. Pure.
 */
export function tellings(g: Readonly<GameState>, holder: Person, skip: ReadonlySet<string>): PersonTelling[] {
  const byId = new Map<string, Person>([[holder.id, holder]])
  const lists = new Map<string, string[]>()
  const contacts = (id: string): readonly string[] => {
    const hit = lists.get(id)
    if (hit !== undefined) return hit
    const p = byId.get(id)
    const list = p === undefined ? [] : contactsOf(g, p)
    for (const q of list) byId.set(q.id, q)
    const ids = list.map((q) => q.id)
    lists.set(id, ids)
    return ids
  }
  return spread(holder.id, contacts, skip).map((t) => ({ who: byId.get(t.who)!, from: byId.get(t.from)!, hop: t.hop }))
}
