// The year close (R3, E.D2 b): one call at the end of the store's year (ui/store.ts ageUpAction, with FLAGS.yearCard and Quiet Mode on).
// It turns the pile of popups a year leaves in the queue into a few that matter and one card:
//
//   1. It resolves the queued year events task itself (the same applyFallback the store would call when the task reaches the head), so
//      the flavor lines and the year's event choice exist before the budget. The player still sees the event after the hook popups.
//   2. It budgets the choices nobody asked for (a choice with a source `s`): YEAR_LIMITS.choices a year. A choice of any script outside
//      DEFERRABLE_SCRIPTS is always kept and counted first; the rest fill the room that is left, the asks that waited from earlier years
//      before this year's. What does not fit waits in flags.pendingAsks, at most 2 years and 6 at a time.
//   3. It plans the notices (year-plan.ts planNotices): the notices that matter stay popups, the small ones fold into one line of the log
//      (or a line of the card). Weight 0 and 1 outcomes are log-only. A notice right before a choice of its own source is never folded.
//   4. It queues the card last (a NoticeModal with `digest`), a popup for the first YEAR_LIMITS.popupYears years of a life and an inline
//      card after that (nothing queued, the Life tab draws it), and remembers it in flags.yearBook.
//
// Idempotent by year: the book remembers the last year it closed, and a second call for the same year changes nothing. It draws no number
// of its own (the year events task does, exactly as it does for the old order), moves no money, and reads nothing dated after g.year.
// It never throws: a step that fails puts the game back as it came in (the queue and the year events task in it, the log, the id counter,
// and every draw, counter and flag the year events step touched) and reports { closed: false }, so the store plays the year the old way
// and the task picks the very events it would have picked.
//
// Headless ageUp does not call this. Tests that read g.queue after ageUp see what they always saw, with `s`, `a` and `w` on top.
//
// Layer L4. No module-level const reads an import: DEFERRABLE_SCRIPTS is a set of literals (a test compares them with the script ids).
import { currentLogYear, validLogSource } from '../core'
import { applyFallback } from '../offline'
import { uid } from '../rng'
import type { ChoiceModal, GameState, LogEntry, ModalItem, NoticeModal, YearCard } from '../types'
import { readPending, readYearBook, writePending, writeYearBook, type PendingAsk } from './year-book'
import { YEAR_LIMITS, buildCard, foldLogEntries, planNotices, storyOf, type Story } from './year-plan'

/**
 * The scripts whose choices may wait for a year with room: a random event, one money ask, and the bundle of small asks. Every other
 * script (a company, a career, a crime, a nation) is kept and counted first, because it is a decision that cannot wait a year.
 * These are the script ids of events/helpers.ts EVENT_SCRIPT, events/wealth-resolve.ts ASK_SCRIPT and BUNDLE_SCRIPT.
 */
export const DEFERRABLE_SCRIPTS: ReadonlySet<string> = new Set(['events.random', 'wealth.ask', 'wealth.bundle'])

/**
 * What a close did. `closed` is false when it did nothing (already closed for this year, a dead character, a step failed).
 * kept and folded count notices (popups that stay, popups that became log lines or card lines), deferred the choices that went to
 * flags.pendingAsks, requeued the waiting asks that came back as popups. card: 'popup' (queued), 'inline' (kept in the book only), 'none'.
 */
export interface CloseReport {
  closed: boolean
  kept: number
  folded: number
  deferred: number
  requeued: number
  card: 'popup' | 'inline' | 'none'
}

const notClosed = (): CloseReport => ({ closed: false, kept: 0, folded: 0, deferred: 0, requeued: 0, card: 'none' })

const isYearEvents = (m: ModalItem): boolean => m.kind === 'aiTask' && m.task.type === 'yearEvents'

/** A choice the player did not ask for: it came out of a yearly hook (or the year events task), so it has a source. */
const isUnrequested = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && validLogSource(m.s)

const canWait = (m: { scriptId?: string }): boolean => typeof m.scriptId === 'string' && DEFERRABLE_SCRIPTS.has(m.scriptId)

/** The choice without its id, as a copy that shares nothing with the queue. */
function withoutId(m: ChoiceModal): Omit<ChoiceModal, 'id'> {
  const { id: _id, ...rest } = structuredClone(m)
  return rest
}

/** The year's own log lines: the entries of the log year the character is in, or none. A read; it makes no log year. */
function yearEntries(g: GameState): LogEntry[] {
  const tail = g.log[g.log.length - 1]
  return tail && tail.age === g.character.age ? tail.entries : []
}

/** The title of the card popup. A reader that ignores `digest` shows this and the headline. */
const cardTitle = (age: number): string => `The Year You Turned ${age}`

/**
 * What the year events task writes besides the queue and the log: the draws (`rng`), the counters and the flags (the event memory and
 * history, the text memory and its family record, the milestones told). A copy taken before the task runs, and put back in place when a
 * later step fails, so the task replayed by the store draws the same events and the first pick is not on cooldown.
 */
interface Undo {
  rng: number
  counters: GameState['counters']
  flags: GameState['flags']
}

const takeUndo = (g: GameState): Undo => ({ rng: g.rng, counters: structuredClone(g.counters), flags: structuredClone(g.flags) })

/** Put a copy back in the same objects (a key the step added goes, a key it removed comes back, in the order it had). */
function restoreInPlace<T extends object>(into: T, from: T): void {
  for (const k of Object.keys(into)) delete (into as Record<string, unknown>)[k]
  Object.assign(into, from)
}

function putBack(g: GameState, undo: Undo): void {
  g.rng = undo.rng
  restoreInPlace(g.counters, undo.counters)
  restoreInPlace(g.flags, undo.flags)
}

/** The close, step by step. Throws on a failure; closeYear catches it and puts the game back. */
function run(g: GameState, book: ReturnType<typeof readYearBook>, undo: { value?: Undo }): CloseReport {
  const L = YEAR_LIMITS

  // 1. The year events task: resolved here, so the flavor lines and the event choice are in the queue before the budget.
  const at = g.queue.findIndex(isYearEvents)
  if (at >= 0) {
    undo.value = takeUndo(g)
    const [task] = g.queue.splice(at, 1)
    if (task && task.kind === 'aiTask') applyFallback(g, task.task)
  }
  const queue = g.queue.slice()

  // 2. The choices. The ones nobody asked for are budgeted; the player's own are never counted or touched.
  const unrequested = queue.filter(isUnrequested)
  const fixed = unrequested.filter((m) => !canWait(m)).length
  let room = Math.max(0, L.choices - fixed)
  const comeBack: PendingAsk[] = []
  const stay: PendingAsk[] = []
  for (const p of readPending(g)) {
    // A waiting ask is a deferrable one by construction; a saved one that is not is dropped, never queued.
    if (!canWait(p.m)) continue
    if (room > 0) {
      room--
      comeBack.push(p)
    } else stay.push(p)
  }
  const deferred: ChoiceModal[] = []
  for (const m of unrequested) {
    if (!canWait(m)) continue
    if (room > 0) room--
    else deferred.push(m)
  }
  const deferredSet = new Set<ModalItem>(deferred)
  const afterChoices = queue.filter((m) => !deferredSet.has(m))

  // 3. The notices, planned on the queue as it stands now (a notice before a choice that waits is a plain notice again).
  const plan = planNotices(g, afterChoices)
  const foldIds = new Set(plan.fold.map((st) => st.id))
  const folded = new Set<ModalItem>(afterChoices.filter((m) => m.kind === 'notice' && foldIds.has(m.id)))
  const stays = afterChoices.filter((m) => !folded.has(m))
  const keptStories: Story[] = []
  for (const m of stays) if (m.kind === 'notice' && plan.keep.has(m.id)) keptStories.push(storyOf(m))
  const requeued: ChoiceModal[] = comeBack.map((p) => ({ ...structuredClone(p.m), id: uid(g, 'm') }))

  // 4. The log lines the folds leave behind, and the card (which reads the log with those lines in it).
  const lines = foldLogEntries(g, plan.merged, yearEntries(g))
  const card = buildCard(g, keptStories, plan.merged, [...yearEntries(g), ...lines])
  const popup = book.shown < L.popupYears
  const stored: YearCard = popup ? card : { ...card, inline: true }
  const cardId = `year-${g.generation}-${g.year}`
  const modal: NoticeModal = {
    kind: 'notice',
    id: cardId,
    title: cardTitle(card.age),
    emoji: '\u{1F4CB}',
    text: card.head,
    tone: 'neutral',
    // The queue holds its own copy: the book keeps the stored one.
    digest: JSON.parse(JSON.stringify(card)) as YearCard,
  }
  const next: ModalItem[] = [...stays, ...requeued]
  if (popup && !next.some((m) => m.id === cardId)) next.push(modal)

  // 5. Write. Everything above worked on copies; this is the only place the game changes (and none of it throws).
  const cards = [...book.cards.filter((c) => c.year !== g.year), stored]
  const waiting: PendingAsk[] = [...stay, ...deferred.map((m): PendingAsk => ({ y: g.year, m: withoutId(m) }))]
  g.queue = next
  if (lines.length > 0) currentLogYear(g).entries.push(...lines)
  writeYearBook(g, { v: 1, last: g.year, shown: book.shown + (popup ? 1 : 0), cards })
  writePending(g, waiting)
  return { closed: true, kept: keptStories.length, folded: plan.fold.length, deferred: deferred.length, requeued: requeued.length, card: popup ? 'popup' : 'inline' }
}

/**
 * Close the year of a game that has just aged: see the header. Mutates g (the store passes a draft inside act()). Never throws; when a
 * step fails the queue, the log and the book are put back as they were and the report says `closed: false`, so the year is played the old way.
 */
export function closeYear(g: GameState): CloseReport {
  if (!g.character.alive) return notClosed()
  const queue0 = g.queue.slice()
  const logs0 = g.log.length
  const lines0 = yearEntries(g).length
  const nextId0 = g.nextId
  const undo: { value?: Undo } = {}
  try {
    const book = readYearBook(g)
    if (book.last >= g.year) return notClosed()
    return run(g, book, undo)
  } catch (err) {
    console.error('Closing the year failed:', err)
    // Put back what a failed close may have touched: the queue, the log lines it added, the id counter, and what the year events task
    // wrote (draws, counters, flags). The book and the pending asks are written last, after every step that can fail, so they are never
    // half written.
    if (undo.value) putBack(g, undo.value)
    g.queue = queue0
    g.log.length = logs0
    const tail = g.log[g.log.length - 1]
    if (tail && tail.age === g.character.age && tail.entries.length > lines0) tail.entries.length = lines0
    g.nextId = nextId0
    return notClosed()
  }
}
