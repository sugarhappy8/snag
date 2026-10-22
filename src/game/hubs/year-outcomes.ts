// The outcome of a choice the player just answered (R3 fix, the owner's rule "weight 0 to 1 goes log-only" applied to a reply).
// The year close (year-close.ts) quiets what a year queues by itself; the popup that tells the outcome of an answered choice came after
// it and was left alone, so a player who answered 3 choices still saw 3 more popups. This is the same rule for those:
//
//   - a notice the answer queued is CALM when the weight the year close reads for it (year-plan.ts noticeWeight: its own `w`, else its
//     title's row in NOTICE_WEIGHTS, else 1 for `weight: 'minor'`, else 2) is 0 or 1, it is not a bad-tone notice, it carries no support
//     line and the money it is about is under LARGE_FIGURE. noticeWeight already lifts a notice the never-route policy blocks (a health or
//     legal word, a large figure, bad tone) to 2, so what hurts or costs a lot is never calm;
//   - a calm outcome does not pop up: it goes to the life log as one line (`title: text`, the way a folded notice does), unless the answer
//     already wrote a line of its own (events/helpers.ts res() writes one with the popup) or the same sentence was told within TOLD_YEARS
//     (text/told.ts), in which case that line is the record and none is added;
//   - an answer that leads on to another decision (a choice, an input, a minigame, a task: a second step of the event, a crisis, a
//     death) keeps every notice it queued, because they are the context of what comes next; a character who died keeps theirs too.
//
// The store calls it from the choice-answer path (ui/store.ts chooseOption) while the year card flag and Quiet Mode are both on, and
// test/play-kit.ts does the same under `close: true`. Headless ageUp and runScript never call it, so every test that reads g.queue after
// them sees what it always saw. It draws no number, moves no money, makes no id (a line takes the id `out-<generation>-<year>-<notice>`)
// and never throws: a failure leaves the queue and the log as the answer made them.
//
// Layer L4, like year-close.ts. No module-level const reads an import.
import { currentLogYear, validLogAmount } from '../core'
import { LARGE_FIGURE } from '../notice-policy'
import { noteTold, toldLately } from '../text/told'
import type { GameState, LogEntry, ModalItem, NoticeModal } from '../types'
import { clipText, storyLine, storyOf } from './year-plan'

/** The queue and the year's log as they stand right before a choice is answered (the modal being answered already taken out of the queue). */
export interface AnswerMark {
  /** The ids in the queue. What the answer adds is whatever is not here. */
  ids: ReadonlySet<string>
  /** The lines of this year's log. What the answer writes is whatever comes after them. */
  lines: number
}

/** The lines of the year the character is in, or none. A read: it makes no log year. */
function yearLines(g: GameState): readonly LogEntry[] {
  const tail = g.log[g.log.length - 1]
  return tail && tail.age === g.character.age ? tail.entries : []
}

/** Take the mark: call it right before the handler of an answered choice runs. */
export function markAnswer(g: GameState): AnswerMark {
  return { ids: new Set(g.queue.map((m) => m.id)), lines: yearLines(g).length }
}

/**
 * A notice that tells a calm outcome: weight 0 or 1 by the year close's own rule (noticeWeight), not bad, no support line, not a year card,
 * and under LARGE_FIGURE in money (an explicit amount counts, as a figure in the text does). Pure.
 */
export function calmOutcome(m: ModalItem): m is NoticeModal {
  if (m.kind !== 'notice' || m.support === true || m.digest !== undefined) return false
  const st = storyOf(m)
  return st.w <= 1 && st.tone !== 'bad' && Math.abs(st.a) < LARGE_FIGURE
}

/**
 * Settle an answered choice: take the calm outcomes it queued out of the queue and give each a line of the log, as the header says.
 * `mark` is the one markAnswer took before the handler ran. Returns how many popups went to the log (0 when it did nothing). Never throws.
 */
export function settleAnswer(g: GameState, mark: AnswerMark): number {
  try {
    if (!g.character.alive) return 0
    const added = g.queue.filter((m) => !mark.ids.has(m.id))
    if (added.length === 0 || added.some((m) => m.kind !== 'notice')) return 0
    const calm = added.filter(calmOutcome)
    if (calm.length === 0) return 0

    // The record. Every line the answer wrote counts as the line of one outcome (the first ones), and a sentence told lately is written once.
    const wrote = Math.max(0, yearLines(g).length - mark.lines)
    const have = new Set(yearLines(g).map((e) => e.id))
    const lines: LogEntry[] = []
    calm.forEach((m, i) => {
      const id = `out-${g.generation}-${g.year}-${m.id}`
      if (i < wrote || have.has(id)) return
      const st = storyOf(m)
      const text = clipText(storyLine(st), 90)
      if (!text || toldLately(g, text)) return
      lines.push({ id, text, tone: st.tone, w: st.w, ...(validLogAmount(m.a) && m.a !== 0 ? { a: m.a } : {}) })
    })

    // Write. Everything above worked on copies; this is the only place the game changes (and none of it throws). The queue goes last, so
    // a failure before it leaves the popups in place.
    if (lines.length > 0) {
      currentLogYear(g).entries.push(...lines)
      for (const l of lines) noteTold(g, l.text)
    }
    const gone = new Set<ModalItem>(calm)
    g.queue = g.queue.filter((m) => !gone.has(m))
    return calm.length
  } catch (err) {
    console.error('Settling the outcome of an answer failed:', err)
    return 0
  }
}
