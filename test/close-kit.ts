// The year close seen from a test (R3-Q5, E.D2 c). test/play-kit.ts plays a life the way the store does (`close: true`: ageUp, then
// closeYear, then the player answers the popups) and keeps a `ClosedYear` for every year it closed. This file turns those records into
// numbers (`spread`, `popupsPerYear`, `visibleLines`) and into a verdict (`closeProblems`: the hard caps of one year, `lifeProblems`: the
// caps of a whole life, `ledgerClean`: the books at the end).
//
// A cap is stated here the way the code keeps it, and no looser:
//   - choices: a choice nobody asked for (it has a source) that the close may defer is kept while the kept choices are under
//     YEAR_LIMITS.choices; a choice of any other script is a decision that cannot wait, so it is always kept and counted first. So the
//     deferrable ones are at most max(0, 3 - the others), and a year with no such choice holds at most 3 in all.
//   - notices: the room is YEAR_LIMITS.notices (3), grown by the life-changing notices (weight 3) to YEAR_LIMITS.noticesMax (5). A weight 3
//     notice is never folded, so it can pass the room, and so can a notice that comes right before a choice of its own source (it is that
//     choice's context). Weight 0 and 1 are log-only: they stay only as that context. The report must agree with the queue.
//   - the card: one a year, last in the queue while it is a popup (the first YEAR_LIMITS.popupYears years of a life), stored inline after.
//   - nothing is lost: the only things that leave the queue are the year events task (the close resolves it), a notice in play (folded) and
//     a deferrable choice (deferred). A folded notice leaves a record: a log line of its source after the close, or its title on the card.
// No vitest imports: like test/play-kit.ts, this runs under vitest or as a bundled node script.
import { shortMoney, validLogSource } from '../src/game/core'
import { DEFERRABLE_SCRIPTS } from '../src/game/hubs/year-close'
import { YEAR_LIMITS, noticeWeight } from '../src/game/hubs/year-plan'
import { ledgerProblems } from '../src/game/kernel/ledger'
import type { ChoiceModal, GameState, ModalItem, NoticeModal, YearCard } from '../src/game/types'
import type { ClosedYear, PlayedYear } from './play-kit'
import type { Spread } from './text-metrics'

/** The mean and the nearest-rank p50, p90 and max of a list of counts; all 0 for an empty list (the rule of test/text-metrics.ts). */
export function spread(xs: readonly number[]): Spread {
  const n = xs.length
  if (n === 0) return { mean: 0, p50: 0, p90: 0, max: 0 }
  const sorted = [...xs].sort((a, b) => a - b)
  // p is a whole number, so p * n is exact and the division by 100 cannot round a whole rank up.
  const rank = (p: number): number => sorted[Math.min(n, Math.max(1, Math.ceil((p * n) / 100))) - 1]!
  let sum = 0
  for (const x of sorted) sum += x
  return { mean: sum / n, p50: rank(50), p90: rank(90), max: sorted[n - 1]! }
}

/**
 * The popups the player saw in each year, in year order. With `cards: false` the year card is left out, which is how the roadmap's
 * "tycoon mean 4 plus one card" reads. Birth counts like any other year, so a caller that wants closed years only filters first.
 */
export function popupsPerYear(years: readonly Pick<PlayedYear, 'popups'>[], opts: { cards?: boolean } = {}): number[] {
  const cards = opts.cards ?? true
  return years.map((y) => (cards ? y.popups.length : y.popups.filter((p) => p.card !== true).length))
}

/** The log lines a year shows without folding: weight 2 or more. A line with no weight (an old save, a player action) counts as 2. */
export function visibleLines(entries: readonly { w?: number }[]): number {
  return entries.filter((e) => (typeof e.w === 'number' ? e.w : 2) >= 2).length
}

/** The problems of the books (src/game/kernel/ledger.ts checkLedger); empty when the books are clean. The close moves no money. */
export function ledgerClean(g: GameState): string[] {
  return ledgerProblems(g)
}

// ---------------------------------------------------------------------------------------------------------------

/** A notice in play: made by a yearly hook, no support line, not a card. The year close plans exactly these. */
const inPlay = (m: ModalItem): m is NoticeModal => m.kind === 'notice' && m.support !== true && m.digest === undefined && validLogSource(m.s)

/** A choice nobody asked for: it came out of a yearly hook or the year events task, so it has a source. */
const unrequested = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && validLogSource(m.s)

const canWait = (m: ChoiceModal): boolean => typeof m.scriptId === 'string' && DEFERRABLE_SCRIPTS.has(m.scriptId)

const isCard = (m: ModalItem): m is NoticeModal => m.kind === 'notice' && m.digest !== undefined

const isYearEvents = (m: ModalItem): boolean => m.kind === 'aiTask' && m.task.type === 'yearEvents'

/** The notice that stands right before a choice of its own source in this queue: that choice's context. */
function contextOf(queue: readonly ModalItem[]): Set<string> {
  const out = new Set<string>()
  queue.forEach((m, i) => {
    const next = queue[i + 1]
    if (inPlay(m) && next !== undefined && next.kind === 'choice' && next.s === m.s) out.add(m.id)
  })
  return out
}

/** Every line of a card, in the order the player reads it. */
function cardLines(c: YearCard): string[] {
  return [c.head, ...c.stories, ...(c.money ? [c.money] : []), ...(c.people ?? []), ...(c.world ? [c.world] : [])]
}

/** All the text of a card, lower case, for a search. */
function cardText(c: YearCard): string {
  return [...cardLines(c), ...c.groups.flatMap((x) => x.lines)].join('\n').toLowerCase()
}

/** The caps of the card that is stored or queued (YEAR_LIMITS), as problems. */
function cardProblems(c: YearCard): string[] {
  const L = YEAR_LIMITS
  const out: string[] = []
  const lines = cardLines(c)
  if (lines.length > L.lines) out.push(`the card has ${lines.length} lines, more than ${L.lines}`)
  const long = (what: string, text: string): void => {
    if (text.length > 90) out.push(`the card ${what} is ${text.length} characters, more than 90`)
  }
  long('head', c.head)
  c.stories.forEach((s) => long('story', s))
  if (c.money) long('money line', c.money)
  ;(c.people ?? []).forEach((s) => long('person line', s))
  if (c.world) long('news line', c.world)
  if (c.stories.length > L.stories) out.push(`the card has ${c.stories.length} stories, more than ${L.stories}`)
  if ((c.people ?? []).length > L.people) out.push(`the card has ${c.people!.length} person lines, more than ${L.people}`)
  if (c.groups.length > 8) out.push(`the card has ${c.groups.length} groups, more than 8`)
  for (const x of c.groups) {
    if (x.lines.length > L.groupLines) out.push(`the card group ${x.k} has ${x.lines.length} lines, more than ${L.groupLines}`)
    x.lines.forEach((s) => long(`group ${x.k} line`, s))
  }
  return out
}

/**
 * What a folded notice left behind: its title in a line of the year's log or on the card ('text'), else a line of its source in the log,
 * which is the record the planner counts when a source already has one ('source'), else nothing ('none').
 */
function recordOf(c: ClosedYear, m: NoticeModal): 'text' | 'source' | 'none' {
  const title = m.title.toLowerCase()
  if ((c.card && cardText(c.card).includes(title)) || c.lines.some((e) => e.text.toLowerCase().includes(title))) return 'text'
  return c.lines.some((e) => e.s === m.s) ? 'source' : 'none'
}

/** How the notices a close folded are recorded: all of them, by their title, by a line of their source only, and not at all. */
export function foldRecords(c: ClosedYear): { folded: number; text: number; source: number; none: number } {
  const kept = new Set(c.after.map((m) => m.id))
  const out = { folded: 0, text: 0, source: 0, none: 0 }
  for (const m of c.before) {
    if (kept.has(m.id) || !inPlay(m)) continue
    out.folded++
    out[recordOf(c, m)]++
  }
  return out
}

/**
 * The hard caps of one closed year (see the header), as one sentence each. Empty when the year breaks none. It reads the record alone:
 * the queue before and after the close, the year's lines right after it, the cash on both sides, the report and the card.
 */
export function closeProblems(c: ClosedYear): string[] {
  const L = YEAR_LIMITS
  const out: string[] = []
  if (!c.alive) return out
  if (!c.report.closed) return [`the year did not close (a step failed or the book was already at this year); report ${JSON.stringify(c.report)}`]

  // Choices.
  const choices = c.after.filter(unrequested)
  const fixed = choices.filter((m) => !canWait(m)).length
  const waiting = choices.length - fixed
  if (waiting > Math.max(0, L.choices - fixed)) out.push(`${waiting} choices that may wait were kept next to ${fixed} that may not; the room is ${Math.max(0, L.choices - fixed)} (choices cap ${L.choices})`)

  // Notices: the room is YEAR_LIMITS.notices, grown by the life-changing ones to noticesMax. A life-changing notice and the context of a
  // choice are kept whatever the room, so they can pass it; the rest cannot.
  const notices = c.after.filter(inPlay)
  const context = contextOf(c.after)
  const life = notices.filter((m) => noticeWeight(m) === 3).length
  const must = notices.filter((m) => noticeWeight(m) === 3 || context.has(m.id)).length
  const room = Math.min(L.noticesMax, Math.max(L.notices, life))
  if (notices.length > Math.max(room, must)) out.push(`${notices.length} notices were kept; the room is ${room} (${life} life-changing), and ${must} had to stay`)
  for (const m of notices) {
    if (noticeWeight(m) < 2 && !context.has(m.id)) out.push(`"${m.title}" is weight ${noticeWeight(m)} and stayed a popup: it is log-only unless a choice needs it`)
  }
  if (c.report.kept !== notices.length) out.push(`the report says ${c.report.kept} notices kept and the queue holds ${notices.length}`)

  // The card.
  const cards = c.after.filter(isCard)
  if (cards.length > 1) out.push(`${cards.length} cards in the queue, one at most`)
  if (c.report.card === 'popup') {
    if (cards.length !== 1) out.push(`the report says popup and the queue holds ${cards.length} cards`)
    else if (c.after[c.after.length - 1] !== cards[0]) out.push('the card is not last in the queue')
    if (c.card === null) out.push('the report says popup and the year book has no card for the year')
  } else if (c.report.card === 'inline') {
    if (cards.length !== 0) out.push('the report says inline and a card was queued as a popup')
    if (c.card === null) out.push('the report says inline and the year book has no card for the year')
    else if (c.card.inline !== true) out.push('the stored card of an inline year is not marked inline')
  } else out.push(`the close ran and its report says card ${c.report.card}`)
  if (c.card) {
    out.push(...cardProblems(c.card))
    // The money line is the books: the cash of the player's account after the close (the close moves none).
    if (c.card.money !== undefined && !c.card.money.includes(`Cash ${shortMoney(c.cash)}.`)) out.push(`the money line "${c.card.money}" does not carry the books' cash ${shortMoney(c.cash)}`)
  }
  if (c.cashBefore !== c.cash) out.push(`the close moved money: cash ${c.cashBefore} before, ${c.cash} after`)

  // Nothing is lost: what left the queue is a thing the close may take.
  const kept = new Set(c.after.map((m) => m.id))
  const gone = c.before.filter((m) => !kept.has(m.id))
  const deferredIds = new Set<string>()
  for (const m of gone) {
    if (isYearEvents(m)) continue
    if (m.kind === 'choice' && unrequested(m) && canWait(m)) {
      deferredIds.add(m.id)
      continue
    }
    if (inPlay(m)) {
      if (noticeWeight(m) === 3) out.push(`"${m.title}" is life-changing (weight 3) and was folded`)
      continue
    }
    out.push(`a popup was lost: ${m.kind} "${'title' in m ? m.title : m.id}" left the queue and is neither folded nor deferred`)
  }
  if (deferredIds.size > c.report.deferred) out.push(`${deferredIds.size} choices left the queue and the report says ${c.report.deferred} deferred`)
  const foldedCount = gone.filter(inPlay).length
  if (foldedCount !== c.report.folded) out.push(`${foldedCount} notices left the queue and the report says ${c.report.folded} folded`)

  // A folded notice leaves a record, and a notice is never folded before its choice. The close plans on the queue without the year events
  // task and without the choices it defers (a notice before a choice that waits is a plain notice again), so the check reads that view.
  const view = c.before.filter((m) => !isYearEvents(m) && !deferredIds.has(m.id))
  const viewContext = contextOf(view)
  for (const m of gone) {
    if (!inPlay(m)) continue
    if (viewContext.has(m.id)) out.push(`"${m.title}" was folded right before its choice, which stayed`)
    if (recordOf(c, m) === 'none') out.push(`the folded "${m.title}" (${m.s}) has no record: no log line of its source after the close and no mention on the card`)
  }
  return out
}

/**
 * The caps of a whole life: every closed year's caps, with the age in front, then the rule of the card over the life (the first
 * YEAR_LIMITS.popupYears closes are popups, every one after is inline), then that every year of a living character was closed.
 */
export function lifeProblems(years: readonly PlayedYear[]): string[] {
  const out: string[] = []
  let closes = 0
  for (const y of years) {
    const c = y.closed
    if (c === undefined) continue
    for (const p of closeProblems(c)) out.push(`age ${y.age}: ${p}`)
    if (!c.alive || !c.report.closed) continue
    const want = closes < YEAR_LIMITS.popupYears ? 'popup' : 'inline'
    if (c.report.card !== want) out.push(`age ${y.age}: close number ${closes + 1} of the life made a ${c.report.card} card, a ${want} is the rule`)
    closes++
  }
  return out
}
