// Ending a life. Called from anywhere the character can die (health, executions,
// accidents, event outcomes). The death screen appears once the modal queue drains.
import { endJob, log, queueAi, remember, roleLabel } from './core'
import { computeRibbon } from './ribbons'
import type { GameState } from './types'

/**
 * Kill the player character.
 * @param cause short noun phrase, capitalized, e.g. "Old Age", "Heart Attack", "Car Accident", "Execution".
 */
export function killCharacter(g: GameState, cause: string): void {
  const c = g.character
  if (!c.alive) return
  const occupation = roleLabel(g)
  c.alive = false
  c.causeOfDeath = cause
  g.flags.finalOccupation = occupation
  log(g, `I died from ${cause.toLowerCase()}.`, 'bad')
  remember(g, `Died from ${cause.toLowerCase()}.`)
  endJob(g, 'job', 'died')
  endJob(g, 'partTimeJob', 'died')
  // Nothing left to decide once you're dead: drop pending choices, keep notices.
  g.queue = g.queue.filter((m) => m.kind === 'notice')
  g.ribbon = computeRibbon(g)
  queueAi(g, { type: 'obituary' })
}
