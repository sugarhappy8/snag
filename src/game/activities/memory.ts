// Mind & Body > Memory Test: a color-sequence memory game played through popups.
// Each round shows a sequence, then (in the next popup, once it's gone) asks which one you saw.
import { addStat, count, log, scriptChoice, useYearAction } from '../core'
import { randInt, shuffle } from '../rng'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuAction } from '../types'
import { gate, result } from './common'

const COLORS = ['\u{1F534}', '\u{1F7E2}', '\u{1F535}', '\u{1F7E1}']
const MAX_ROUNDS = 15

function randomSequence(g: GameState, len: number): number[] {
  return Array.from({ length: len }, () => randInt(g, 0, COLORS.length - 1))
}

function render(seq: number[]): string {
  return seq.map((i) => COLORS[i]).join(' ')
}

/** Three plausible wrong answers: swapped neighbors, one changed color, rotated. */
function distractors(g: GameState, seq: number[]): number[][] {
  const out: number[][] = []
  const key = (s: number[]) => s.join('')
  const seen = new Set([key(seq)])
  let guard = 0
  while (out.length < 3 && guard++ < 60) {
    const s = [...seq]
    const kind = randInt(g, 0, 2)
    if (kind === 0 && s.length > 1) {
      const i = randInt(g, 0, s.length - 2)
      ;[s[i], s[i + 1]] = [s[i + 1], s[i]]
    } else if (kind === 1) {
      const i = randInt(g, 0, s.length - 1)
      s[i] = (s[i] + randInt(g, 1, COLORS.length - 1)) % COLORS.length
    } else {
      const i = randInt(g, 0, s.length - 1)
      const j = randInt(g, 0, s.length - 1)
      s[i] = (s[i] + 1) % COLORS.length
      s[j] = (s[j] + 2) % COLORS.length
    }
    if (!seen.has(key(s))) {
      seen.add(key(s))
      out.push(s)
    }
  }
  return out
}

function showRound(g: GameState, round: number, score: number): void {
  const seq = randomSequence(g, round + 2)
  scriptChoice(g, SHOW, `Memory Test · Round ${round}`, `Memorize this sequence:\n\n${render(seq)}`, [{ id: 'ready', label: "Got it!", emoji: '\u{1F9E0}' }], {
    emoji: '\u{1F9E0}',
    data: { round, score, seq },
  })
}

function readData(data: Json | undefined): { round: number; score: number; seq: number[] } {
  const d = (data ?? {}) as Record<string, Json>
  const seq = Array.isArray(d.seq) ? d.seq.filter((x): x is number => typeof x === 'number') : []
  return { round: typeof d.round === 'number' ? d.round : 1, score: typeof d.score === 'number' ? d.score : 0, seq }
}

const SHOW = defineScript('act.memory.show', (g, _choice, data) => {
  const { round, score, seq } = readData(data)
  const options = shuffle(g, [seq, ...distractors(g, seq)])
  const correct = options.findIndex((o) => o.join('') === seq.join(''))
  scriptChoice(
    g,
    ASK,
    `Memory Test · Round ${round}`,
    'Which sequence did you just see?',
    options.map((o, i) => ({ id: String(i), label: render(o) })),
    { emoji: '\u{1F914}', data: { round, score, correct } },
  )
})

const ASK = defineScript('act.memory.ask', (g, choice, data) => {
  const d = (data ?? {}) as Record<string, Json>
  const round = typeof d.round === 'number' ? d.round : 1
  const score = typeof d.score === 'number' ? d.score : 0
  const correct = typeof d.correct === 'number' ? d.correct : -1
  if (choice === String(correct)) {
    const next = score + 1
    if (round >= MAX_ROUNDS) {
      finish(g, next, true)
      return
    }
    showRound(g, round + 1, next)
    return
  }
  finish(g, score, false)
})

function finish(g: GameState, score: number, perfect: boolean): void {
  count(g, 'memoryTests')
  const best = typeof g.flags.memoryBest === 'number' ? g.flags.memoryBest : 0
  if (score > best) g.flags.memoryBest = score
  let delta: number
  let verdict: string
  if (score >= 10) {
    delta = randInt(g, 6, 10)
    verdict = perfect ? 'A perfect run! The examiner checked your sleeves for notes.' : 'Your memory is borderline superhuman. The examiner asked for your autograph.'
  } else if (score >= 6) {
    delta = randInt(g, 3, 5)
    verdict = 'Impressive! Your memory is sharper than most.'
  } else if (score >= 3) {
    delta = randInt(g, 0, 2)
    verdict = 'A perfectly average memory. Nothing to write home about, assuming you remember where home is.'
  } else {
    delta = -randInt(g, 1, 3)
    verdict = 'Yikes. The examiner gently asked if you remember your own name.'
  }
  addStat(g, 'smarts', delta)
  log(g, `I took a memory test and scored ${score}.`, delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral')
  result(g, 'Memory Test Results', `You correctly repeated ${score} sequence${score === 1 ? '' : 's'}.\n\n${verdict}`, '\u{1F9E0}', delta > 0 ? 'good' : delta < 0 ? 'bad' : undefined)
}

export const memoryTestAction: MenuAction = {
  type: 'action',
  id: 'mb.memory',
  label: 'Memory Test',
  emoji: '\u{1F9E0}',
  subtitle: 'Have your memory evaluated',
  visible: (g) => !g.character.prison,
  disabledReason: (g) => gate(g, { minAge: 6 }),
  run: (g) => {
    if (!useYearAction(g, 'act.memory', 1)) {
      result(g, 'Memory Test', "You already took a memory test this year. The examiner remembers you, even if you don't remember them.", '\u{1F9E0}')
      return
    }
    showRound(g, 1, 0)
  },
}
