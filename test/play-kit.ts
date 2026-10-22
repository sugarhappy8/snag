// Plays one seeded life through the real yearly loop and records every popup the player would have seen, so a test can
// count them (the notice probe, R1-T7) or replay them (the acceptance sweep, R1-T9). Each year is ageUp followed by a
// drain of the modal queue the way the store answers it: notices are just read, choices and inputs go to their script
// (or the offline fallback), minigames get a fixed result. The answers come from a small driver of their own, so they
// never depend on engine rolls. The same seed and options always give the same life.
//
// A popup the player asked for (the outcome of a choice, an input or a minigame they just answered) is marked
// `passive: false`. Everything else arrived by itself, which is what Quiet Mode could soften.
//
// With `close: true` a year is played the way the store plays it with the year card on (ui/store.ts ageUpAction): ageUp, then closeYear,
// then the popups are answered. `PlayedYear.closed` keeps what the close did (the queue before and after it, the year's log lines, the
// cash on both sides, the card), which is what test/close-kit.ts checks. Off by default, so every other test sees the harness as before.
// The store settles the outcome of an answered choice too (ui/store.ts chooseOption, src/game/hubs/year-outcomes.ts): a calm one goes to the
// life log and is no popup. `close: true` does the same, and `PlayedYear.logged` counts them, so the popups of a year are what the player sees.
//
// No vitest imports here: the same helper runs under vitest and as a bundled node script, like test/fuzz-kit.ts and
// test/probe-life.ts.
import { ageUp } from '../src/game/aging'
import { closeYear, type CloseReport } from '../src/game/hubs/year-close'
import { readYearBook } from '../src/game/hubs/year-book'
import { markAnswer, settleAnswer } from '../src/game/hubs/year-outcomes'
import { acctBalance, playerAcct } from '../src/game/kernel/ledger'
import { createNewLife } from '../src/game/life'
// Script handlers register as an import side effect. test/simulate.test.ts loads menus, so a life played here must too,
// or drain() could meet a script that no module on the aging path registered.
import '../src/game/menus'
import type { RouteBlock } from '../src/game/notice-policy'
import { applyFallback } from '../src/game/offline'
import { hasScript, runScript } from '../src/game/scripts'
import type { AnnualReportData, GameState, LogEntry, MinigameModal, ModalItem, Tone, YearCard } from '../src/game/types'

export interface PlayOptions {
  seed: number
  /** Calendar year of birth (createNewLife's `year`). Not read when `from` is set. */
  birthYear: number
  /**
   * A life the caller has made (a founder from test/probe-life.ts, say), played on from where it stands instead of from birth. The seed
   * then only drives the answers. The game is changed in place, as the life it came from would be.
   */
  from?: GameState
  /**
   * Play each year the way the store does with the year card on: ageUp, then closeYear (src/game/hubs/year-close.ts), then answer the
   * popups. Every year after birth then carries `closed`, and the year card is a popup marked `card: true`. Default false: the harness
   * is the headless loop every other test relies on.
   */
  close?: boolean
  /**
   * With `close: true`: what becomes of the outcome of an answered choice. 'log' (the default) is the store: a calm outcome goes to the life log
   * and is no popup (src/game/hubs/year-outcomes.ts). 'popup' is the flow before that rule, where every outcome pops up, kept so a measurement
   * can put the two side by side. Without `close` it is not read: the headless loop never moves an outcome.
   */
  outcomes?: 'log' | 'popup'
  /** Stop once the character is this old (default 90). A life that ends sooner stops sooner. */
  untilAge?: number
  /** A measurement aid: money is set to 60,000,000 the year the character first reaches 25 (default false). */
  rich?: boolean
  /** Called with 0 after birth, then 1, 2, ... after each year's popups are answered. Read-only: it must not change the life. */
  onYear?: (g: GameState, yearsPlayed: number) => void
}

export interface PlayedPopup {
  kind: 'notice' | 'choice' | 'input' | 'minigame'
  title: string
  /** The body text; empty for a minigame, which has none. */
  text: string
  tone?: Tone
  weight?: 'minor'
  support?: boolean
  /** true for the year card the close queued (a notice with `digest`). Only a game played with `close: true` has one. */
  card?: boolean
  /** false for a popup created while answering a choice, an input or a minigame (an outcome the player asked for). */
  passive: boolean
  /** structuredClone of the modal as it was queued. */
  item: ModalItem
}

/** One title in the counting probe's fixture (test/fixtures/notice-probe.json). Kept here, with the helper that feeds it,
 *  so a test can type-import it without loading the opt-in probe file. */
export type ProbeRow = {
  title: string
  count: number
  /** The tone of the first notice with this title; missing when it had none. */
  tone?: Tone
  /** The text of that first notice. */
  sample: string
  /** Set when that notice carried the support line. */
  support?: true
  /** neverRoute() of the sample: why it must stay a popup, or null. */
  never: RouteBlock | null
}

export type ProbeFile = {
  v: 1
  lives: number
  seeds: number[]
  untilAge: number
  passive: ProbeRow[]
  outcome: ProbeRow[]
  chosen: string[]
}

/**
 * What the year close did to one year (`PlayOptions.close`). Every list is a copy, so playing on cannot change it. The record is plain
 * JSON. test/close-kit.ts closeProblems reads it and nothing else.
 */
export interface ClosedYear {
  /** The character was alive when the close ran. A dead character is not closed (closeYear does nothing). */
  alive: boolean
  report: CloseReport
  /** The queue as ageUp left it: the popups the old flow would have shown, the year events task still in it. */
  before: ModalItem[]
  /** The queue the close left, before any popup is answered. */
  after: ModalItem[]
  /** The year's log lines right after the close (the lines a fold left are in). */
  lines: LogEntry[]
  /** The year's log lines at the end of the year, the player's answers included. */
  entries: LogEntry[]
  /** The player's cash from the books (acctBalance of playerAcct) just before the close and just after it. */
  cashBefore: number
  cash: number
  /** The card the year book holds for this year, popup or inline; null when there is none. */
  card: YearCard | null
}

export interface PlayedYear {
  age: number
  year: number
  popups: PlayedPopup[]
  /** The life log lines written during this year. */
  lines: { text: string; tone: Tone }[]
  /** Set for every year after birth of a game played with `close: true`. */
  closed?: ClosedYear
  /**
   * With `close: true`: how many calm outcomes of the choices answered in this year went to the life log instead of a popup, the way the store
   * does it. They are not in `popups`. Not set when the harness is not playing the store flow.
   */
  logged?: number
}

/** Tiny driver RNG, separate from the game's so the driver doesn't depend on engine rolls. */
function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  }
}
type Driver = ReturnType<typeof driver>

const TEXT_INPUTS = ['Go for a long run', 'Write a song about my cat', 'Steal a candy bar', 'Ask my boss for a raise', 'Alex']

const RICH_MONEY = 60_000_000

function minigameResult(m: MinigameModal, d: Driver): string {
  switch (m.game) {
    case 'blackjack':
      return d.pick(['win', 'lose', 'push', 'blackjack'])
    case 'horseRace':
    case 'slots':
    case 'nationReport':
      return 'done'
    case 'burglary':
      return JSON.stringify({ loot: d.int(0, 5000), caught: d.next() < 0.3 })
    case 'prisonEscape':
      return d.pick(['escaped', 'caught'])
    case 'pickpocket':
      return d.pick(['success', 'fail'])
    case 'annualReport': {
      if (d.next() < 0.2) return 'skip'
      const r = m.data as unknown as AnnualReportData
      return JSON.stringify({ price: d.int(r.minPrice, r.maxPrice), production: d.int(0, r.maxProduction) })
    }
  }
}

function inputValue(m: Extract<ModalItem, { kind: 'input' }>, d: Driver): string {
  if (m.input === 'number') {
    const lo = m.min ?? 1
    const hi = Math.min(m.max ?? lo + 1000, lo + 100000)
    return String(d.int(lo, Math.max(lo, hi)))
  }
  return m.defaultValue || d.pick(TEXT_INPUTS)
}

function played(m: Exclude<ModalItem, { kind: 'aiTask' }>, passive: boolean): PlayedPopup {
  const notice = m.kind === 'notice' ? m : null
  return {
    kind: m.kind,
    title: m.title,
    text: m.kind === 'minigame' ? '' : m.text,
    ...(notice?.tone ? { tone: notice.tone } : {}),
    ...(notice?.weight ? { weight: notice.weight } : {}),
    ...(notice?.support ? { support: true } : {}),
    ...(notice?.digest ? { card: true } : {}),
    passive,
    item: structuredClone(m),
  }
}

/**
 * Resolve the whole modal queue the way the store does (follow-ups jump to the front), recording each popup that
 * reaches the player. A popup that appears while a choice, input or minigame is being answered is an outcome. A
 * built-in task is never shown, and what its resolution queues counts as passive.
 */
function drain(g: GameState, d: Driver, out: PlayedPopup[], store?: { logged: number; settle: boolean }): void {
  const outcomes = new Set<string>()
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    const waiting = new Set(g.queue.map((q) => q.id))
    let answered = false
    switch (m.kind) {
      case 'notice':
        out.push(played(m, !outcomes.has(m.id)))
        break
      case 'choice': {
        out.push(played(m, !outcomes.has(m.id)))
        if (m.choices.length === 0) throw new Error(`choice "${m.title}" has no options`)
        const choice = d.pick(m.choices)
        answered = true
        // The store flow settles what the answer queued: a calm outcome goes to the log (chooseOption in ui/store.ts).
        const mark = store?.settle ? markAnswer(g) : null
        if (m.source === 'script') {
          if (!hasScript(m.scriptId!)) throw new Error(`missing script handler "${m.scriptId}" for choice "${m.title}"`)
          runScript(g, m.scriptId!, choice.id, m.data, m)
        } else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
        if (store && mark) store.logged += settleAnswer(g, mark)
        break
      }
      case 'input':
        out.push(played(m, !outcomes.has(m.id)))
        if (!hasScript(m.scriptId)) throw new Error(`missing script handler "${m.scriptId}" for input "${m.title}"`)
        answered = true
        runScript(g, m.scriptId, inputValue(m, d), m.data, m)
        break
      case 'minigame':
        out.push(played(m, !outcomes.has(m.id)))
        if (!hasScript(m.scriptId)) throw new Error(`missing script handler "${m.scriptId}" for minigame "${m.title}"`)
        answered = true
        runScript(g, m.scriptId, minigameResult(m, d), m.data, m)
        break
      case 'aiTask':
        applyFallback(g, m.task)
        break
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
    if (answered) for (const q of g.queue) if (!waiting.has(q.id)) outcomes.add(q.id)
  }
}

/** The log lines of the character's current age. */
function yearLines(g: GameState): PlayedYear['lines'] {
  const last = g.log[g.log.length - 1]
  if (!last || last.age !== g.character.age) return []
  return last.entries.map((e) => ({ text: e.text, tone: e.tone }))
}

/** The log entries of the character's current age, as copies; none when the year has no line yet. A read: it makes no log year. */
function yearEntries(g: GameState): LogEntry[] {
  const last = g.log[g.log.length - 1]
  return last && last.age === g.character.age ? last.entries.map((e) => ({ ...e })) : []
}

const cashOf = (g: GameState): number => acctBalance(g, playerAcct(g))

/**
 * Close the year of a game that has just aged, as the store does after ageUp, and record what the close did. This is the one call the
 * harness makes to closeYear: it keeps the queue before and after, the log lines and the cash on both sides, and the card the year book
 * holds. A close that does not run (a dead character, a failed step) is recorded as well, with its report.
 */
export function closeAndRecord(g: GameState): ClosedYear {
  const alive = g.character.alive
  const before = structuredClone(g.queue)
  const cashBefore = cashOf(g)
  const report = closeYear(g)
  const lines = yearEntries(g)
  const card = readYearBook(g).cards.find((c) => c.year === g.year) ?? null
  return { alive, report, before, after: structuredClone(g.queue), lines, entries: lines.map((e) => ({ ...e })), cashBefore, cash: cashOf(g), card: card ? structuredClone(card) : null }
}

/** Play from birth until the character dies or reaches `untilAge`, answering every popup. */
export function playLife(opts: PlayOptions): { g: GameState; years: PlayedYear[] } {
  const untilAge = opts.untilAge ?? 90
  const d = driver(opts.seed * 7919)
  const g = opts.from ?? createNewLife({ seed: opts.seed, year: opts.birthYear })
  const years: PlayedYear[] = []
  let rich = false
  let closed: ClosedYear | undefined
  const play = (): void => {
    const popups: PlayedPopup[] = []
    const store = opts.close ? { logged: 0, settle: opts.outcomes !== 'popup' } : undefined
    drain(g, d, popups, store)
    const year: PlayedYear = { age: g.character.age, year: g.year, popups, lines: yearLines(g), ...(store ? { logged: store.logged } : {}) }
    if (closed) {
      // The year is over: the lines now hold the player's answers as well. (A dead character's last year may have no log year at all.)
      closed.entries = yearEntries(g)
      year.closed = closed
      closed = undefined
    }
    years.push(year)
  }
  play()
  opts.onYear?.(g, 0)
  let yearsPlayed = 0
  while (g.character.alive && g.character.age < untilAge) {
    ageUp(g)
    // The store's order: the close comes straight after ageUp, in the same step, before anything is answered.
    if (opts.close) closed = closeAndRecord(g)
    if (opts.rich && !rich && g.character.age >= 25) {
      rich = true
      g.character.money = RICH_MONEY
    }
    play()
    opts.onYear?.(g, ++yearsPlayed)
  }
  return { g, years }
}
