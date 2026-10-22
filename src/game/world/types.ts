// The shapes of g.world (R2, design 13.2). Types only: the readers and writers of each shard live in their own module (world/people,
// firms, homes, holdings, lod) and the root in world/state.ts. A shard is a bounded, versioned record; a row names its entities by
// EntityRef (kernel/ids.ts), never by object reference.
import type { EntityRef } from '../kernel/ids'
import type { LedgerShard } from '../kernel/ledger-types'

/** An indexed person: the Person stays in g.people, this row says the world knows about it. `seen` is the last year it was touched. */
export interface PersonRow {
  id: EntityRef
  seen: number
}
export interface PeopleShard {
  v: 1
  rows: PersonRow[]
  /** People past the cap that are counted, not indexed. */
  over: number
}

/** An indexed company: a player company ('biz') or an old NPC firm kept inside its owner's record ('npc'). */
export interface FirmRow {
  id: EntityRef
  form: 'biz' | 'npc'
  owner: EntityRef
  seen: number
}
export interface FirmsShard {
  v: 1
  rows: FirmRow[]
  over: number
}

export interface HomeRow {
  id: EntityRef
  owner: EntityRef
  seen: number
}
export interface HomesShard {
  v: 1
  rows: HomeRow[]
  over: number
}

/** Who owns how much of what: [owner, asset, share]. */
export type HoldingRow = [owner: EntityRef, asset: EntityRef, share: number]
export interface HoldingsShard {
  v: 1
  y: number
  rows: HoldingRow[]
}

export interface LodShard {
  v: 1
  y: number
  pooled: { person: number; firm: number; home: number }
  demoted: number
}

/**
 * The root of the world's state, saved as GameState.world. Absent means empty ({ v: 1 }); a garbage value reads as empty too.
 * The index signature is for shards other modules register (registerShard): the named ones stay typed.
 */
export interface WorldState {
  v: 1
  /** The year the world last stepped (an integer from 1900 to 100000, or absent). */
  y?: number
  ledger?: LedgerShard
  people?: PeopleShard
  firms?: FirmsShard
  homes?: HomesShard
  holdings?: HoldingsShard
  lod?: LodShard
  [other: string]: unknown
}
