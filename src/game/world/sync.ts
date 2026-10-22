// The world's yearly index (R2-L15): one call that brings the people, firms, homes and holdings shards up to date with the records
// of the game, and stamps the world with the year. It is what continueAsChild calls after it has rebuilt the heir's people, and what
// the world step (R2-L17) calls once a year.
//
// It changes nothing about the game itself: it reads the records raw and writes only the shards of g.world (and its own `y`). It
// draws no luck and books no money. Idempotent: a second call in the same year writes nothing. Each shard is replaced, never edited
// in place; `y` is a number on the root, so a world whose shard roots are frozen can still be synced.
//
// Importing this file registers the world's shards (world/shards.ts), which the readers need to read through their normalizers.
import './shards'
import { syncFirms } from './firms'
import { syncHoldings } from './holdings'
import { syncHomes } from './homes'
import { syncPeople } from './people'
import { ensureWorld, readWorld } from './state'
import type { GameState } from '../types'

/** The year a world may be stamped with: an integer from 1900 to 100000 (state.ts drops any other `y` on a load). */
const stampable = (year: number): boolean => Number.isInteger(year) && year >= 1900 && year <= 100_000

/** Indexes people, firms and homes, then builds the holdings from them (in that order), and stamps world.y with this year. */
export function syncWorld(g: GameState): void {
  syncPeople(g)
  syncFirms(g)
  syncHomes(g)
  syncHoldings(g)
  if (stampable(g.year) && readWorld(g).y !== g.year) ensureWorld(g).y = g.year
}
