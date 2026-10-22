// What the rest of the game may ask of the immigration domain without importing it (R2-K6, K.2a rule c).
//
// Moving the household abroad (activities/immigration-move.ts) spends money, so the money ratchet keeps it in its own file. The nation's
// consequences (nation/consequences.ts) end in exile for an official who flees, and importing the move from there closed an import cycle
// between the nation, the immigration code and the careers. The port is the call without the import: the immigration move binds
// itself when it loads, and the caller never learns where the move lives. Types only from the move, so this file adds no edge to it.
import { definePort } from '../kernel/ports'
import type { GameState } from '../types'
import type { Arrival, MoveHow, MoveText } from './immigration-move'

/**
 * Move the player (and the household) to another country with this status and this notice. Bound by activities/immigration-move.ts.
 * Unbound: does nothing, which is a test that never loaded the immigration code; the app loads it with `aging`.
 */
export const relocatePlayer = definePort('activities.relocate', (_g: GameState, _dest: string, _how: MoveHow, _arrival: Arrival, _text: MoveText): void => {})
