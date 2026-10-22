// The world step (R2-L17, K.6 b): the one yearly hook of the world, last of the yearly registry, phase settle (src/game/modules/yearly-aging.ts).
//
// It runs after every module that books money or changes a record, so it reads the year's closing state: it indexes the people, firms
// and homes, builds the holdings from them (syncWorld), and lets go of the rows that have sat idle for five years, folding their cash
// through the ledger (lodSweep). The next year reads what it wrote; nothing reads a later step's output of the same year. In R2 it only
// indexes, which is why it can sit at the end; the later world steps that read the opening frame come with their own releases.
//
// Idempotent by the stamp world.y. It draws no luck and books nothing of its own. It does not run when the character dies inside the
// hook loop (the loop returns early); continueAsChild calls syncWorld for the heir instead. Its time goes to the budget meter
// (world/budget.ts), which nothing in the game reads.
import type { GameState } from '../types'
import { timed } from './budget'
import { lodSweep } from './lod'
import { readWorld } from './state'
import { syncWorld } from './sync'

/** Steps the world to this year, once: a no-op when it was already stamped with it. */
export function yearlyWorld(g: GameState): void {
  if (readWorld(g).y === g.year) return
  timed('world', () => {
    syncWorld(g)
    lodSweep(g)
  })
}
