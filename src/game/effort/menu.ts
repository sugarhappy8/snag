// The posture rows (R3, C.2): how hard the player drives this year, chosen in Life Priorities from 18. An info row says the ambition
// in a word, the pace in force and the focus weeks left; three actions set the pace for the years ahead. Like the priorities in
// household.ts the choice takes effect when you age up, and it holds until it is changed.
//
// Pure to read: the rows are built from the record and the pool without writing either, so walking the menu changes nothing. Only
// running an action writes (setPosture) and queues one notice. Layer 2: household.ts imports this file, not the other way round.
import { notice } from '../core'
import type { GameState, MenuAction, MenuNode } from '../types'
import { focusLeft } from './focus'
import { AGE_REVEAL, FOCUS_WEEKS } from './limits'
import { POSTURE_LABELS, ambitionReveal, readYou, setPosture } from './persona'
import type { Posture } from './types'

const ORDER: readonly Posture[] = ['lean', 'steady', 'push']

/** The pace in a word for the info row. */
const PACE_WORD: Readonly<Record<Posture, string>> = Object.freeze({ lean: 'easy', steady: 'steady', push: 'pushing' })

const EMOJI: Readonly<Record<Posture, string>> = Object.freeze({ lean: '\u{1F33F}', steady: '\u{2696}\u{FE0F}', push: '\u{1F525}' })

/** What each pace means, under its label. */
const SUBTITLE: Readonly<Record<Posture, string>> = Object.freeze({
  lean: 'An easier year. Fatigue eases, and results come a little slower.',
  steady: 'Your usual pace. No extra strain.',
  push: 'Longer hours. Results come faster, but fatigue builds and you can burn out.',
})

/** The notice that confirms a choice. */
const SET_TEXT: Readonly<Record<Posture, string>> = Object.freeze({
  lean: "You'll take it easy from next year. Fatigue eases, and results come a little slower.",
  steady: "You'll keep a steady pace from next year.",
  push: "You'll push hard from next year. Results come faster, but fatigue builds, and you can burn out.",
})

function infoText(g: GameState): string {
  const y = readYou(g)
  const now = g.character.age >= AGE_REVEAL ? y.effective : 'steady'
  const pending = y.posture !== now ? ` (${PACE_WORD[y.posture]} from next year)` : ''
  return `Ambition: ${ambitionReveal(g).word}. Pace: ${PACE_WORD[now]}${pending}. Focus weeks left this year: ${focusLeft(g)} of ${FOCUS_WEEKS}.`
}

function paceAction(g: GameState, p: Posture): MenuAction {
  return {
    type: 'action',
    id: `effort.posture.${p}`,
    label: `${POSTURE_LABELS[p]}${readYou(g).posture === p ? ' (current)' : ''}`,
    emoji: EMOJI[p],
    subtitle: SUBTITLE[p],
    disabledReason: (gg) => (readYou(gg).posture === p ? 'Your current pace.' : null),
    run: (gg) => {
      if (setPosture(gg, p)) notice(gg, 'Work Pace Set', SET_TEXT[p], { emoji: EMOJI[p] })
    },
  }
}

/** The rows for Life Priorities: nothing before 18, then the info row and the three paces. Pure. */
export function postureNodes(g: GameState): MenuNode[] {
  if (!(g.character.age >= AGE_REVEAL)) return []
  return [
    { type: 'info', id: 'effort.posture.info', text: infoText(g), emoji: '\u{1F3AF}' },
    ...ORDER.map((p) => paceAction(g, p)),
  ]
}
