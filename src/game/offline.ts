// Resolution of queued game tasks: the 'aiTask' modal kind (this year's events, the outcome of
// an event choice, "Do Anything", job interviews, application screening, the obituary).
// Everything is built in: the event library (events.ts), the scripted interview pool
// (careers.ts), the CV screener (cv.ts) and the obituary writer. Nothing here talks to a
// server; the store resolves a task synchronously the moment it reaches the head of the queue.
//
// The modal kind keeps its historical name ('aiTask') so saves with a task still queued load
// and resolve. Engine code queues tasks with core.queueAi.
import { applyScreening, fallbackInterviewQuestion, presentInterview } from './careers'
import { notice, useYearAction } from './core'
import { offlineScreen } from './cv'
import { fallbackChoiceOutcome, fallbackCustomAction, fallbackObituary, queueFallbackYearEvents } from './events'
import { pickLine } from './text/pick'
import type { AiTask, GameState } from './types'

/** How many "Do Anything" actions a character can take per year. */
export const MAX_CUSTOM_ACTIONS_PER_YEAR = 5
/** g.yearActions key that counts this year's "Do Anything" actions. */
export const CUSTOM_ACTION_KEY = 'doAnything'

const TOO_TIRED = [
  "You've done enough wild things for one year. Age up and try again.",
  "You're running on fumes. Whatever it is, it'll have to wait until next year.",
  'Your body files a formal complaint. No more spontaneous adventures this year.',
  "Even you need a break. You've hit your limit of bold moves for the year.",
]

/**
 * Resolve a queued task with the built-in systems. Mutates g (the store passes a draft). A dead
 * character only gets an obituary; every other task does nothing once the life is over.
 */
export function applyFallback(g: GameState, task: AiTask): void {
  switch (task.type) {
    case 'yearEvents':
      if (g.character.alive) queueFallbackYearEvents(g)
      return
    case 'resolveChoice':
      if (g.character.alive) fallbackChoiceOutcome(g, task.event, task.choiceId)
      return
    case 'customAction':
      if (!g.character.alive) return
      if (!useYearAction(g, CUSTOM_ACTION_KEY, MAX_CUSTOM_ACTIONS_PER_YEAR)) {
        notice(g, 'Exhausted', pickLine(g, TOO_TIRED), { emoji: '\u{1F634}' })
        return
      }
      fallbackCustomAction(g, task.text)
      return
    case 'interview':
      if (g.character.alive) presentInterview(g, task.job, fallbackInterviewQuestion(g, task.job))
      return
    case 'screenApplication':
      if (g.character.alive) applyScreening(g, task.app, offlineScreen(g, task.app))
      return
    case 'obituary':
      g.obituary = fallbackObituary(g)
      return
  }
}

/** The same resolver under its descriptive name. */
export const resolveTask = applyFallback
