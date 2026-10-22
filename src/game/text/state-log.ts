// R2-P9: the one way a state line reaches the log. A site that used to log a line every year its condition held calls this
// in exactly those years, with what stateLine returned (null when the state has nothing new to say).
//
// log() spends one uid per entry, and g.nextId is read by every later id and by every hashed pick that reads an id. The old
// line took its uid every such year, so a line that now goes quiet must take it too: otherwise how many lines print would move
// g.nextId, and with it ids and picks the line has nothing to do with (the golden digests of the simulation would move for a
// change of words). So this call takes exactly one uid, whether the line speaks or not. Imports core and rng, which import no
// text module, so it joins no cycle.
import { log } from '../core'
import { uid } from '../rng'
import type { GameState, Tone } from '../types'

/** Log the state line (one uid, as log does), or, when the line is null, take that one uid and say nothing. */
export function logStateLine(g: GameState, line: string | null, tone: Tone = 'neutral'): void {
  if (line) log(g, line, tone)
  else uid(g, 'l')
}
