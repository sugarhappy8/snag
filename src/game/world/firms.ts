// The firms index (R2-L14, design 13.2, decision D3): which companies the world knows by name, without copying or rewriting any.
// A company the player owns is an Asset of kind 'business' (form 'biz'); an old NPC firm lives inside its owner's record, in
// Person.data.npcCompany (form 'npc'). The index holds one row { id, form, owner, seen } for each of the LOD_CAPS.fullFirms (20)
// most valuable and counts the rest in `over`. An old NPC firm is indexed in place: its record is read raw, never cloned, never
// run through normalizeBiz (npc-company-state.ts does both, so the index must not use it), and never written.
//
//   firmRef(assetId)   firm:<assetId>, the account the ledger uses for that company (cash.ts firmPurse)
//   readFirms(g)       pure; absent reads as { v: 1, rows: [], over: 0 }
//   syncFirms(g)       the writer: idempotent, and it replaces the shard root only when the index changed
//
// A company that is gone leaves its row behind with its old `seen`; the shard keeps up to LOD_CAPS.firms (60) rows, the later rows
// being the lite ones of the level-of-detail sweep. readFirms reads through the registered reader: import world/shards for effect.
import { num, rec } from '../business/util'
import { parseRef, type EntityRef } from '../kernel/ids'
import type { GameState } from '../types'
import { LOD_CAPS } from './caps'
import { npcFirmId, personRef, playerRef } from './people'
import { commitShard, isPlain, mergeRows, normalizeIndex, refOfKind, seenOf } from './rows'
import { worldShard } from './state'
import type { FirmRow, FirmsShard } from './types'

const EMPTY: Readonly<FirmsShard> = Object.freeze({ v: 1, rows: Object.freeze([]) as unknown as FirmRow[], over: 0 })

/** firm:<assetId> when that is a valid name, else pool:firms (where the ledger puts a company with no usable id; never a firm row). */
export function firmRef(assetId: string): EntityRef {
  const r = typeof assetId === 'string' ? `firm:${assetId}` : ''
  return parseRef(r) !== null ? (r as EntityRef) : 'pool:firms'
}

function firmRow(x: unknown): FirmRow | null {
  if (!isPlain(x)) return null
  const id = refOfKind(x.id, 'firm')
  const owner = refOfKind(x.owner, 'person')
  const seen = seenOf(x.seen)
  const form = x.form
  return id !== null && owner !== null && seen !== null && (form === 'biz' || form === 'npc') ? { id, form, owner, seen } : null
}

/** Makes any value into a valid firms shard (at most LOD_CAPS.firms rows: a valid firm ref, a form, a person for owner, a year; sorted by id). Total. */
export function normalizeFirms(raw: unknown): FirmsShard {
  return normalizeIndex(raw, LOD_CAPS.firms, firmRow)
}

/** The firms index of this game. Pure: an absent or garbage shard reads as empty. */
export function readFirms(g: GameState): Readonly<FirmsShard> {
  return worldShard<FirmsShard>(g, 'firms') ?? EMPTY
}

interface Candidate {
  id: EntityRef
  form: 'biz' | 'npc'
  owner: EntityRef
  value: number
}

const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

/** Own companies first, then the old NPC firms; inside each, the most valuable, then by id. */
function before(a: Candidate, b: Candidate): number {
  return (a.form === 'biz' ? 0 : 1) - (b.form === 'biz' ? 0 : 1) || b.value - a.value || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Brings the index up to date: a 'biz' row for each Asset of kind business (owner the player), an 'npc' row for each person with an old
 * NPC firm (owner that person), the first 20 by [own before NPC, value, id] stamped with this year, the rest counted in `over`.
 * A row whose company is gone is kept as it was. Nothing is copied from a record and no record is changed.
 */
export function syncFirms(g: GameState): void {
  const found: Candidate[] = []
  const me = refOfKind(playerRef(g), 'person')
  if (me !== null) {
    for (const a of g.assets) {
      if (a.kind !== 'business') continue
      const id = refOfKind(firmRef(a.id), 'firm')
      if (id !== null) found.push({ id, form: 'biz', owner: me, value: finite(a.value) })
    }
  }
  for (const p of g.people) {
    const key = npcFirmId(p)
    const owner = refOfKind(personRef(p), 'person')
    const id = key === null ? null : refOfKind(firmRef(key), 'firm')
    if (id !== null && owner !== null) found.push({ id, form: 'npc', owner, value: num(rec(p.data.npcCompany)?.value) })
  }
  found.sort(before)
  // One company is one row: the best ranked of the records that name it wins. `present` is every company there is, chosen or not.
  const present = new Set<EntityRef>()
  const ranked: Candidate[] = []
  for (const c of found) {
    if (present.has(c.id)) continue
    present.add(c.id)
    ranked.push(c)
  }
  const chosen = ranked.slice(0, LOD_CAPS.fullFirms)
  const fresh = chosen.map((c): FirmRow => ({ id: c.id, form: c.form, owner: c.owner, seen: g.year }))
  const rows = mergeRows(readFirms(g).rows, present, fresh)
  commitShard(g, 'firms', normalizeFirms({ v: 1, rows, over: ranked.length - chosen.length }), EMPTY)
}
