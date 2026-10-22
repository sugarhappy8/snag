// The people index (R2-L14, design 13.2): which people the world knows by name. The Person stays in g.people; the index keeps one
// row { id, seen } for each of the LOD_CAPS.intimate (80) who matter most, and counts the rest in `over`. A stranger (a classmate
// who left, a rival, a candidate) is only seeded data until something touches it: nothing here makes a row for an id that is not
// already a person of the game.
//
//   personRef(p)      person:<data.sid> when that is a text an account can be called, else person:<id>: the same account the ledger
//                     uses for that person (cash.ts), so the books and the index name one person one way
//   playerRef(g)      the player's account, person:<character id>
//   readPeople(g)     pure; absent reads as { v: 1, rows: [], over: 0 }
//   syncPeople(g)     the writer: idempotent, and it replaces the shard root only when the index changed
//
// readPeople reads through the registered reader, so a caller imports world/shards for its effect (world/sync.ts does).
import { parseRef, type EntityRef } from '../kernel/ids'
import { playerAcct } from '../kernel/ledger'
import type { GameState, Person } from '../types'
import { LOD_CAPS } from './caps'
import { commitShard, isPlain, mergeRows, normalizeIndex, refOfKind, seenOf } from './rows'
import { worldShard } from './state'
import type { PeopleShard, PersonRow } from './types'

const EMPTY: Readonly<PeopleShard> = Object.freeze({ v: 1, rows: Object.freeze([]) as unknown as PersonRow[], over: 0 })

/** `kind:key` when that is a valid name, else null. A bad name would make the ledger refuse the booking, so it is not a ref here either. */
function named(kind: string, key: unknown): EntityRef | null {
  if (typeof key !== 'string') return null
  const r = `${kind}:${key}`
  return parseRef(r) !== null ? (r as EntityRef) : null
}

/** person:<sid> for a person with a text `sid` in its data, else person:<id>; pool:other for a person whose id is no name at all (never a person row). */
export function personRef(p: Pick<Person, 'id' | 'data'>): EntityRef {
  return named('person', p.data?.sid) ?? named('person', p.id) ?? 'pool:other'
}

/** The player's account as a ref: person:<character id>. An heir keeps the id of the child, so the history is already under it. */
export function playerRef(g: GameState): EntityRef {
  return playerAcct(g) as EntityRef
}

/** The id of the old NPC firm a person keeps inside their own record (`data.npcCompany`), read raw: no clone, no normalizeBiz. Null when there is none. */
export function npcFirmId(p: Pick<Person, 'data'>): string | null {
  const raw: unknown = p.data?.npcCompany
  if (!isPlain(raw)) return null
  const id = raw.id
  return typeof id === 'string' && id !== '' ? id : null
}

function personRow(x: unknown): PersonRow | null {
  if (!isPlain(x)) return null
  const id = refOfKind(x.id, 'person')
  const seen = seenOf(x.seen)
  return id !== null && seen !== null ? { id, seen } : null
}

/** Makes any value into a valid people shard (at most LOD_CAPS.people rows, a valid person ref and a year each, sorted by id). Total. */
export function normalizePeople(raw: unknown): PeopleShard {
  return normalizeIndex(raw, LOD_CAPS.people, personRow)
}

/** The people index of this game. Pure: an absent or garbage shard reads as empty. */
export function readPeople(g: GameState): Readonly<PeopleShard> {
  return worldShard<PeopleShard>(g, 'people') ?? EMPTY
}

interface Candidate {
  id: EntityRef
  /** 0 for an owner of an old NPC firm, 1 for everyone else. */
  rank: number
  relationship: number
}

/** Who is ranked first: owners of an NPC company, then the closest, then by id. */
function before(a: Candidate, b: Candidate): number {
  return a.rank - b.rank || b.relationship - a.relationship || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Brings the index up to date. Every person of g.people except a pet is a candidate; the first 80 by [owns an NPC company, closeness,
 * id] get a row stamped with this year, the rest are counted in `over` and have none. A row whose person is gone is kept as it was.
 * Nothing is copied from a person and nothing about a person is changed.
 */
export function syncPeople(g: GameState): void {
  const found = new Map<EntityRef, Candidate>()
  for (const p of g.people) {
    if (p.relation === 'pet') continue
    const id = refOfKind(personRef(p), 'person')
    if (id === null || found.has(id)) continue
    found.set(id, { id, rank: npcFirmId(p) !== null ? 0 : 1, relationship: Number.isFinite(p.relationship) ? p.relationship : 0 })
  }
  const ranked = [...found.values()].sort(before)
  const chosen = ranked.slice(0, LOD_CAPS.intimate)
  const fresh = chosen.map((c): PersonRow => ({ id: c.id, seen: g.year }))
  const rows = mergeRows(readPeople(g).rows, new Set(found.keys()), fresh)
  commitShard(g, 'people', normalizePeople({ v: 1, rows, over: ranked.length - chosen.length }), EMPTY)
}
