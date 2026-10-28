// The world step (R2-L17, K.6 b): the one yearly hook of the world, last of the yearly registry, phase settle (src/game/modules/yearly-aging.ts).
//
// It runs after every yearly module that books money or changes a record, so it reads the year's closing state: it indexes the people,
// firms and homes, builds the holdings from them (syncWorld), and lets go of the rows that have sat idle for five years, folding their
// cash through the ledger (lodSweep). The next year reads what it wrote; nothing reads a later step's output of the same year. In R2 it
// only indexes, which is why it can sit at the end; the later world steps that read the opening frame come with their own releases.
//
// It is not the last thing of the year. ageUp ends by queueing the year's events (flavor lines and a random event), which offline.ts
// resolves on the spot, and then the player acts for the rest of the year. The index is stamped before all of that: it is the frame the
// year closed on, not a live view of the state. The events of the library add, remove and move none of the people, firms, homes and
// holdings it lists (test/world-acceptance.test.ts, "the year events leave the index as the year closed it"); what the player does
// later in the year shows in the index at the next step.
//
// Idempotent by the stamp world.y. It draws no luck and books nothing of its own. It does not run when the character dies inside the
// hook loop (the loop returns early); continueAsChild calls syncWorld for the heir instead. Its time goes to the budget meter
// (world/budget.ts), which nothing in the game reads.
//
// It also repairs a world that came in hostile (R2-L18, RF4). The save loader does not look inside g.world and every reader
// normalizes, so a key the game does not know (a shard of another build, a `__proto__` that rode in on a save) or a world past its
// node cap would otherwise sit in the save for good. A clean world is left exactly as it was: nothing is written.
import type { GameState } from '../types'
import { timed } from './budget'
import { WORLD_NODE_CAP } from './caps'
import { lodSweep } from './lod'
import { nodeCount, normalizeWorld, readWorld, shardNames } from './state'
import { syncWorld } from './sync'

/**
 * Replaces a world that is a world (a plain object with v 1) but holds a key that is not the root's own or a registered shard, or
 * more nodes than WORLD_NODE_CAP, with what normalizeWorld makes of it: the registered shards, each through its own reader (a valid
 * one comes back as itself), shards dropped in the fixed over-cap order (state.ts) while it is still over the cap. A garbage world (a number, an array, a wrong
 * version) is left to ensureWorld, which replaces it on the first write.
 */
function repairWorld(g: GameState): void {
  const raw: unknown = g.world
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || (raw as { v?: unknown }).v !== 1) return
  const known = new Set<string>(['v', 'y', ...shardNames()])
  const strange = Object.keys(raw).some((key) => !known.has(key))
  if (strange || nodeCount(raw, WORLD_NODE_CAP) > WORLD_NODE_CAP) g.world = normalizeWorld(raw)
}

/** Steps the world to this year, once: a no-op when it was already stamped with it (a hostile world is still repaired). */
export function yearlyWorld(g: GameState): void {
  if (readWorld(g).y === g.year) {
    repairWorld(g)
    return
  }
  timed('world', () => {
    repairWorld(g)
    syncWorld(g)
    lodSweep(g)
  })
}
