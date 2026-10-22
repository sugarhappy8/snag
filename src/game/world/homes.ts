// The homes index (R2-L14, design 13.2): which properties the world knows by name. A home is an Asset of kind 'house' the player
// owns; the Asset stays in g.assets and the index keeps one row { id, owner, seen } for each of the LOD_CAPS.homes (150) most
// valuable, counting the rest in `over`.
//
//   homeRef(assetId)   home:<assetId>
//   readHomes(g)       pure; absent reads as { v: 1, rows: [], over: 0 }
//   syncHomes(g)       the writer: idempotent, and it replaces the shard root only when the index changed
//
// A house that is gone (sold, lost) leaves its row behind with its old `seen`. readHomes reads through the registered reader:
// import world/shards for its effect.
import { parseRef, type EntityRef } from '../kernel/ids'
import type { GameState } from '../types'
import { LOD_CAPS } from './caps'
import { playerRef } from './people'
import { commitShard, isPlain, mergeRows, normalizeIndex, refOfKind, seenOf } from './rows'
import { worldShard } from './state'
import type { HomeRow, HomesShard } from './types'

const EMPTY: Readonly<HomesShard> = Object.freeze({ v: 1, rows: Object.freeze([]) as unknown as HomeRow[], over: 0 })

/** home:<assetId> when that is a valid name, else pool:sellers (where a property trades; never a home row). */
export function homeRef(assetId: string): EntityRef {
  const r = typeof assetId === 'string' ? `home:${assetId}` : ''
  return parseRef(r) !== null ? (r as EntityRef) : 'pool:sellers'
}

function homeRow(x: unknown): HomeRow | null {
  if (!isPlain(x)) return null
  const id = refOfKind(x.id, 'home')
  const owner = refOfKind(x.owner, 'person')
  const seen = seenOf(x.seen)
  return id !== null && owner !== null && seen !== null ? { id, owner, seen } : null
}

/** Makes any value into a valid homes shard (at most LOD_CAPS.homes rows: a valid home ref, a person for owner, a year; sorted by id). Total. */
export function normalizeHomes(raw: unknown): HomesShard {
  return normalizeIndex(raw, LOD_CAPS.homes, homeRow)
}

/** The homes index of this game. Pure: an absent or garbage shard reads as empty. */
export function readHomes(g: GameState): Readonly<HomesShard> {
  return worldShard<HomesShard>(g, 'homes') ?? EMPTY
}

/** A house the ranking chose or considered. */
export interface HomePick {
  id: EntityRef
  owner: EntityRef
  value: number
}

export interface HomeRanking {
  /** The houses that get a row: the first LOD_CAPS.homes by [value, id]. */
  chosen: HomePick[]
  /** Every house there is, chosen or not. */
  present: Set<EntityRef>
  /** How many houses there are (chosen or not). */
  total: number
}

/** Which houses the world names right now: every Asset of kind house the player owns, the most valuable first, then by id. Pure. */
export function rankHomes(g: GameState): HomeRanking {
  const me = refOfKind(playerRef(g), 'person')
  const found: HomePick[] = []
  if (me !== null) {
    for (const a of g.assets) {
      if (a.kind !== 'house') continue
      const id = refOfKind(homeRef(a.id), 'home')
      if (id !== null) found.push({ id, owner: me, value: Number.isFinite(a.value) ? a.value : 0 })
    }
  }
  found.sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  // One house is one row. `present` is every house there is, chosen or not.
  const present = new Set<EntityRef>()
  const ranked: HomePick[] = []
  for (const c of found) {
    if (present.has(c.id)) continue
    present.add(c.id)
    ranked.push(c)
  }
  return { chosen: ranked.slice(0, LOD_CAPS.homes), present, total: ranked.length }
}

/**
 * Brings the index up to date: a row for each house the player owns, the 150 most valuable (then by id) stamped with this year, the
 * rest counted in `over`. A row whose house is gone is kept (a `seen` of this year goes back to last year). No asset is copied or changed.
 */
export function syncHomes(g: GameState): void {
  const { chosen, present, total } = rankHomes(g)
  const fresh = chosen.map((c): HomeRow => ({ id: c.id, owner: c.owner, seen: g.year }))
  const rows = mergeRows(readHomes(g).rows, present, fresh, g.year)
  commitShard(g, 'homes', normalizeHomes({ v: 1, rows, over: total - chosen.length }), EMPTY)
}
