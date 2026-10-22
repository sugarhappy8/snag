// R3-Q5 (E.D2 c): the store-flow harness and the hard caps of the year close, on real lives.
//
// The store plays a year as ageUp followed by closeYear in one act(), and then the player answers the popups. test/play-kit.ts
// does the same with `close: true` and records what the close did (`PlayedYear.closed`); test/close-kit.ts reads that record. This file
// has two parts:
//
//   1. the kit itself: the numbers (`spread`, `popupsPerYear`), the checker (`closeProblems`, which must be able to fail, so every cap is
//      shown firing on a year that breaks it), and the flag that keeps the harness off for every other test;
//   2. the caps on real lives: 6 ordinary lives to age 80, 4 rich ones ($60M at 25), 3 founders of 6 companies (probeLife) played on to 80.
//      Per year: at most 3 choices nobody asked for (a choice the close may not defer is always kept and counted first), at most 5 kept
//      notices (plus the life-changing ones and the ones that explain a choice), one card, the card at most 8 lines with a money line that
//      equals the books, nothing the close dropped goes unrecorded, no kept notice is folded before its choice, no popup is lost, and the
//      books are clean at the end.
//
// R3-Q13 turns the numbers of the roadmap on, now that the pace and variant lanes are merged (part 3 below): popups a year counted as they
// arrive (ordinary p90 3 and max 5, $50M p90 4 and max 6, tycoon mean 4 plus the companies card; lead decision L1, the other readings are
// printed and not asserted), a tycoon's visible log at most 8 lines, and the repetition targets of the 13-life probe (part 4, decision L2:
// they measure the lines of the life log: repeated lines 5%, or 8% for a rich life, no line more than 3 times in a life, none told twice within
// 10 years, a state line once in 5 years; the scenes of the popups follow family pacing instead). A threshold is written as the roadmap writes
// it and is never loosened to fit a number: a miss is fixed at its source, in the text it comes from.
//
// Every life is found, not pinned (test/seed-kit.ts), and played once per run.
import { describe, expect, it } from 'vitest'
import { shortMoney } from '../src/game/core'
import { DEFERRABLE_SCRIPTS, type CloseReport } from '../src/game/hubs/year-close'
import { YEAR_LIMITS } from '../src/game/hubs/year-plan'
import { createNewLife } from '../src/game/life'
import type { ChoiceModal, GameState, LogEntry, ModalItem, NoticeModal, YearCard } from '../src/game/types'
import { EVENT_SCRIPT } from '../src/game/events/helpers'
import { ASK_FAMILIES } from '../src/game/events/ask-families'
import { readTextMem } from '../src/game/text/memory'
import { PACE, notePopup, paceKey } from '../src/game/text/pace'
import { STATE_LIMITS } from '../src/game/text/state'
import { STATE_TABLE } from '../src/game/text/state-table'
import { LOG_VISIBLE, viewYearLog } from '../src/ui/components/logModel'
import { makeTestGame } from './helpers'
import { closeProblems, foldRecords, ledgerClean, lifeProblems, popupsPerYear, spread, visibleLines } from './close-kit'
import { playLife, type ClosedYear, type PlayedYear } from './play-kit'
import { probeLife } from './probe-life'
import { findSeed, findSeeds } from './seed-kit'
import { DESIGN_THRESHOLDS, mergeMetrics, normalize, textMetrics, type LifeTrace, type TextMetrics } from './text-metrics'
import { PROBE_UNTIL_AGE, probeLives, type ProbeLife } from './text-probe'

const TIMEOUT = 900_000
const BIRTH_YEARS = [1950, 1975, 1990, 2005, 1925, 2026] as const
const UNTIL_AGE = 80

// ---------------------------------------------------------------------------------------------------------------
// 1. The kit

/** A notice in play (it has a source). */
function N(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id, title: `Title ${id}`, text: `Text of ${id}.`, s: 'health', ...extra }
}

/** A choice nobody asked for (it has a source). `scriptId` decides whether the close may defer it. */
function C(id: string, scriptId = EVENT_SCRIPT, extra: Partial<ChoiceModal> = {}): ChoiceModal {
  return {
    kind: 'choice',
    id,
    title: `Pick ${id}`,
    text: `Which one for ${id}?`,
    choices: [
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
    ],
    source: 'script',
    scriptId,
    s: 'events',
    ...extra,
  }
}

/** A choice the player asked for: no source. */
function mine(id: string): ChoiceModal {
  const m = C(id, 'some.script')
  delete m.s
  return m
}

/** The year card as the close queues it. */
function cardModal(card: YearCard, id = 'year-1-2000'): NoticeModal {
  return { kind: 'notice', id, title: `The Year You Turned ${card.age}`, text: card.head, tone: 'neutral', digest: card }
}

const CASH = 1_234_567

function card(extra: Partial<YearCard> = {}): YearCard {
  return { v: 1, year: 2000, age: 30, head: 'A quiet year.', stories: [], money: `Net worth ${shortMoney(5 * CASH)}. Cash ${shortMoney(CASH)}.`, groups: [], ...extra }
}

/** The report an honest close would give for these two queues: what it kept, folded and deferred. A test that wants a lying report passes one. */
function honest(before: readonly ModalItem[], after: readonly ModalItem[]): CloseReport {
  const kept = new Set(after.map((m) => m.id))
  const gone = before.filter((m) => !kept.has(m.id))
  const inPlay = (m: ModalItem) => m.kind === 'notice' && m.s !== undefined && m.support !== true && m.digest === undefined
  const waits = (m: ModalItem) => m.kind === 'choice' && m.s !== undefined && m.scriptId !== undefined && DEFERRABLE_SCRIPTS.has(m.scriptId)
  return { closed: true, kept: after.filter(inPlay).length, folded: gone.filter(inPlay).length, deferred: gone.filter(waits).length, requeued: 0, card: 'popup' }
}

/** A year that breaks no cap: two notices and a choice kept, the year event task resolved, the card last. */
function good(over: Partial<ClosedYear> = {}): ClosedYear {
  const task: ModalItem = { kind: 'aiTask', id: 'task1', task: { type: 'yearEvents' } }
  const c = card()
  const before: ModalItem[] = over.before ?? [N('n1'), N('n2', { s: 'career' }), C('c1', 'wealth.ask', { s: 'wealth' }), task]
  const after: ModalItem[] = over.after ?? [N('n1'), N('n2', { s: 'career' }), C('c1', 'wealth.ask', { s: 'wealth' }), cardModal(c)]
  return {
    alive: true,
    report: honest(before, after),
    lines: [{ id: 'l1', text: 'You went to the doctor.', tone: 'neutral', s: 'health' }],
    entries: [],
    cashBefore: CASH,
    cash: CASH,
    card: c,
    ...over,
    before,
    after,
  }
}

const withAfter = (extra: ModalItem[], over: Partial<ClosedYear> = {}): ClosedYear => {
  const base = good()
  const last = base.after[base.after.length - 1]!
  const after = [...base.after.slice(0, -1), ...extra, last]
  return good({ before: [...base.before.slice(0, -1), ...extra, base.before[base.before.length - 1]!], after, ...over })
}

describe('the caps the plan promises', () => {
  it('are the ones in the source: raising one there fails this file', () => {
    // Written out here on purpose. closeProblems reads YEAR_LIMITS, so a looser limit would loosen the checker with it.
    expect(YEAR_LIMITS).toMatchObject({ choices: 3, notices: 3, noticesMax: 5, lines: 8, head: 90, story: 90, stories: 3, people: 3, group: 90, groupLines: 6, pending: 6, pendingYears: 2, popupYears: 10 })
  })
})

describe('close kit: the numbers', () => {
  it('spread is the nearest-rank mean, p50, p90 and max of a list, and zeros for none', () => {
    expect(spread([])).toEqual({ mean: 0, p50: 0, p90: 0, max: 0 })
    expect(spread([3, 1, 2, 5, 4, 9, 8, 7, 6, 10])).toEqual({ mean: 5.5, p50: 5, p90: 9, max: 10 })
    expect(spread([4])).toEqual({ mean: 4, p50: 4, p90: 4, max: 4 })
  })

  it('popupsPerYear counts what the player saw each year, the card included unless it is asked to leave it out', () => {
    const popup = (card?: true) => ({ kind: 'notice' as const, title: 't', text: 'x', passive: true, item: N('i'), ...(card ? { card } : {}) })
    const years = [{ popups: [popup(), popup(), popup(true)] }, { popups: [] }, { popups: [popup(true)] }]
    expect(popupsPerYear(years)).toEqual([3, 0, 1])
    expect(popupsPerYear(years, { cards: false })).toEqual([2, 0, 0])
  })

  it('popupsPerYear can leave out the outcomes of the player\'s own answers: only the popups that arrived by themselves are left', () => {
    const popup = (passive: boolean, card?: true) => ({ kind: 'notice' as const, title: 't', text: 'x', passive, item: N('i'), ...(card ? { card } : {}) })
    const years = [{ popups: [popup(true), popup(false), popup(true, true), popup(false)] }, { popups: [popup(false)] }]
    expect(popupsPerYear(years)).toEqual([4, 1])
    expect(popupsPerYear(years, { asked: false })).toEqual([2, 0])
    expect(popupsPerYear(years, { asked: false, cards: false })).toEqual([1, 0])
    expect(popupsPerYear(years, { asked: true, cards: false })).toEqual([3, 1])
  })

  it('visibleLines counts the lines of weight 2 or more; a line with no weight counts as 2', () => {
    expect(visibleLines([{}, { w: 0 }, { w: 1 }, { w: 2 }, { w: 3 }])).toBe(3)
    expect(visibleLines([])).toBe(0)
  })
})

describe('close kit: closeProblems', () => {
  it('finds nothing wrong with a year that breaks no cap', () => {
    expect(closeProblems(good())).toEqual([])
  })

  it('an unrequested choice the close may defer is capped at 3, less one for every choice it may not defer', () => {
    const waiting = (n: number) => Array.from({ length: n }, (_, i) => C(`w${i}`))
    expect(closeProblems(withAfter(waiting(2)))).toEqual([]) // 1 of the base + 2 = 3
    expect(closeProblems(withAfter(waiting(3))).join('|')).toMatch(/choices/)
    // Four choices the close may not defer are all kept: they are a decision that cannot wait.
    const fixed = (n: number) => Array.from({ length: n }, (_, i) => C(`f${i}`, 'company.event'))
    const four = good({ before: [...fixed(4)], after: [...fixed(4), cardModal(card())] })
    expect(closeProblems(four)).toEqual([])
    // One of them leaves room for 2 of the other kind, not 3.
    const mixed = good({ before: [...fixed(1), ...waiting(3)], after: [...fixed(1), ...waiting(3), cardModal(card())] })
    expect(closeProblems(mixed).join('|')).toMatch(/choices/)
  })

  it('the room for notices is 3, grown by the life-changing ones to 5; a life-changing notice and the context of a choice may pass it', () => {
    const plain = (n: number, extra: Partial<NoticeModal> = {}) => Array.from({ length: n }, (_, i) => N(`p${i}`, { s: 'career', ...extra }))
    // The base year keeps 2 notices.
    expect(closeProblems(withAfter(plain(1)))).toEqual([])
    expect(closeProblems(withAfter(plain(2))).join('|')).toMatch(/notices were kept/)
    // Eight life-changing notices all stay: nothing folds them.
    const life = plain(8, { w: 3 })
    expect(closeProblems(good({ before: life, after: [...life, cardModal(card())] }))).toEqual([])
    // Two of them make room for a third notice, not a fourth; four of them leave no room at all.
    const two = plain(2, { w: 3 })
    expect(closeProblems(good({ before: [...two, N('f1', { s: 'career' })], after: [...two, N('f1', { s: 'career' }), cardModal(card())] }))).toEqual([])
    expect(closeProblems(good({ before: [...two, N('f1', { s: 'career' }), N('f2', { s: 'career' })], after: [...two, N('f1', { s: 'career' }), N('f2', { s: 'career' }), cardModal(card())] })).join('|')).toMatch(/notices were kept/)
    const four = plain(4, { w: 3 })
    expect(closeProblems(good({ before: [...four, N('f1', { s: 'career' })], after: [...four, N('f1', { s: 'career' }), cardModal(card())] })).join('|')).toMatch(/notices were kept/)
    // A notice right before a choice of its own source stays, and the room is counted without it.
    const ctx = [N('x1', { s: 'career' }), C('xc', 'company.event', { s: 'career' })]
    expect(closeProblems(withAfter(ctx))).toEqual([])
    expect(closeProblems(withAfter([...ctx, ...plain(1)])).join('|')).toMatch(/notices were kept/)
  })

  it('the report has to agree with the queue: notices kept and notices folded', () => {
    expect(closeProblems(good({ report: { closed: true, kept: 3, folded: 0, deferred: 0, requeued: 0, card: 'popup' } })).join('|')).toMatch(/report says 3 notices kept/)
    const folded = N('f1', { title: 'Odd Jobs Paid', s: 'career', w: 1 })
    const line: LogEntry = { id: 'fold-1-2000-f1', text: 'Odd Jobs Paid.', tone: 'neutral', s: 'career', w: 1 }
    expect(closeProblems(good({ before: [folded, ...good().before], lines: [line], report: { closed: true, kept: 2, folded: 0, deferred: 0, requeued: 0, card: 'popup' } })).join('|')).toMatch(/report says 0 folded/)
  })

  it('a notice of weight 0 or 1 stays only as the context of a choice', () => {
    expect(closeProblems(withAfter([N('t1', { w: 1, s: 'career' })])).join('|')).toMatch(/log-only/)
    expect(closeProblems(withAfter([N('t0', { w: 0, s: 'career' })])).join('|')).toMatch(/log-only/)
    const ok = withAfter([N('t2', { w: 1, s: 'career' }), C('tc', 'company.event', { s: 'career' })])
    expect(closeProblems(ok)).toEqual([])
  })

  it('there is one card, last, when the report says popup; none in the queue, and a stored inline card, when it says inline', () => {
    const c = card()
    const two = good({ after: [...good().after, cardModal(c, 'year-1-2001')] })
    expect(closeProblems(two).join('|')).toMatch(/card/)
    const early = good()
    const moved = good({ after: [early.after[early.after.length - 1]!, ...early.after.slice(0, -1)] })
    expect(closeProblems(moved).join('|')).toMatch(/last/)
    expect(closeProblems(good({ after: good().after.slice(0, -1) })).join('|')).toMatch(/card/)
    const inline = good({ report: { closed: true, kept: 2, folded: 0, deferred: 0, requeued: 0, card: 'inline' }, card: { ...c, inline: true }, after: good().after.slice(0, -1) })
    expect(closeProblems(inline)).toEqual([])
    expect(closeProblems({ ...inline, card: c }).join('|')).toMatch(/inline/)
    expect(closeProblems({ ...inline, after: good().after }).join('|')).toMatch(/card/)
  })

  it('the card is at most 8 lines, every string within its cap, and its money line equals the books', () => {
    const long = 'x'.repeat(91)
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `Story ${i}.`)
    const eight = card({ stories: lines(3), people: lines(3), world: 'The world moved.' }) // head + 3 + money + 3 + world = 9
    expect(closeProblems(good({ card: eight, after: [...good().after.slice(0, -1), cardModal(eight)] })).join('|')).toMatch(/lines/)
    const seven = card({ stories: lines(3), people: lines(2), world: 'The world moved.' })
    expect(closeProblems(good({ card: seven, after: [...good().after.slice(0, -1), cardModal(seven)] }))).toEqual([])
    for (const bad of [card({ head: long }), card({ stories: [long] }), card({ world: long }), card({ groups: [{ k: 'life', n: 1, lines: [long] }] }), card({ groups: [{ k: 'life', n: 7, lines: lines(7) }] })]) {
      expect(closeProblems(good({ card: bad, after: [...good().after.slice(0, -1), cardModal(bad)] })).join('|'), JSON.stringify(bad).slice(0, 60)).toMatch(/card/)
    }
    const off = card({ money: `Net worth $5M. Cash ${shortMoney(2 * CASH)}.` })
    expect(closeProblems(good({ card: off, after: [...good().after.slice(0, -1), cardModal(off)] })).join('|')).toMatch(/books/)
  })

  it('no popup is lost: only the year events task, a notice in play and a deferrable choice may leave the queue', () => {
    const lostMine = good({ before: [mine('m1'), ...good().before] })
    expect(closeProblems(lostMine).join('|')).toMatch(/lost/)
    const lostFixed = good({ before: [C('f1', 'company.event'), ...good().before] })
    expect(closeProblems(lostFixed).join('|')).toMatch(/lost/)
    const lostLife = good({ before: [N('big', { w: 3, s: 'health' }), ...good().before] })
    expect(closeProblems(lostLife).join('|')).toMatch(/life-changing/)
    const input: ModalItem = { kind: 'input', id: 'in1', title: 'Name it', text: 'Name?', input: 'text', scriptId: 'x.y' } as ModalItem
    expect(closeProblems(good({ before: [input, ...good().before] })).join('|')).toMatch(/lost/)
    // A deferred ask is allowed to leave, and the report has to say so.
    const deferred = good({ before: [C('d1'), ...good().before], report: { closed: true, kept: 2, folded: 0, deferred: 1, requeued: 0, card: 'popup' } })
    expect(closeProblems(deferred)).toEqual([])
    expect(closeProblems({ ...deferred, report: { ...deferred.report, deferred: 0 } }).join('|')).toMatch(/deferred/)
  })

  it('a folded notice leaves a record: a log line of its source, or its title on the card', () => {
    const folded = N('f1', { title: 'Odd Jobs Paid', s: 'career', w: 1 })
    const one = { closed: true, kept: 2, folded: 1, deferred: 0, requeued: 0, card: 'popup' } as const
    const base = good({ before: [folded, ...good().before], report: one })
    expect(closeProblems(base).join('|')).toMatch(/record/)
    const line: LogEntry = { id: 'fold-1-2000-f1', text: 'Odd Jobs Paid: Text of f1.', tone: 'neutral', s: 'career', w: 1 }
    expect(closeProblems({ ...base, lines: [...base.lines, line] })).toEqual([])
    const told = card({ groups: [{ k: 'work', n: 1, lines: ['Odd Jobs Paid: Text of f1.'] }] })
    expect(closeProblems({ ...base, card: told, after: [...base.after.slice(0, -1), cardModal(told)] })).toEqual([])
  })

  it('a notice in front of a choice of its own source is never folded', () => {
    const ctx = N('x1', { s: 'career', w: 1 })
    const choice = C('xc', 'company.event', { s: 'career' })
    const base = good({ before: [ctx, choice], after: [choice, cardModal(card())], lines: [{ id: 'l1', text: 'Odd.', tone: 'neutral', s: 'career' }], report: { closed: true, kept: 0, folded: 1, deferred: 0, requeued: 0, card: 'popup' } })
    expect(closeProblems(base).join('|')).toMatch(/before its choice/)
    expect(closeProblems({ ...base, after: [ctx, choice, cardModal(card())], report: { ...base.report, kept: 1, folded: 0 } })).toEqual([])
  })

  it('a close that was meant to run and did not is a problem; a dead character is not', () => {
    const not = { closed: false, kept: 0, folded: 0, deferred: 0, requeued: 0, card: 'none' } as const
    expect(closeProblems(good({ report: not, after: good().before, card: null })).join('|')).toMatch(/did not close/)
    expect(closeProblems(good({ alive: false, report: not, after: good().before, card: null }))).toEqual([])
  })

  it('the close moves no money', () => {
    expect(closeProblems(good({ cashBefore: CASH + 5 })).join('|')).toMatch(/money/)
  })
})

describe('close kit: the harness', () => {
  // A short life is enough to see the shape of a record; the long ones are below.
  const SEED = findSeed((s) => createNewLife({ seed: s, year: 1990 }).character.alive, { from: 41, tries: 20, label: 'quiet acceptance: a short life' })

  it('close is off by default: no year carries a record and the popups are not marked as cards', () => {
    const { years } = playLife({ seed: SEED, birthYear: 1990, untilAge: 12 })
    expect(years.every((y) => y.closed === undefined)).toBe(true)
    expect(years.flatMap((y) => y.popups).some((p) => p.card === true)).toBe(false)
  })

  it('close: true records every year after birth, the card is the last popup of its year, and the first 10 are popups', () => {
    const { years } = playLife({ seed: SEED, birthYear: 1990, untilAge: 14, close: true })
    expect(years[0]!.closed).toBeUndefined() // birth: nothing has aged
    const closed = years.slice(1)
    expect(closed.length).toBe(14)
    for (const y of closed) {
      expect(y.closed, `age ${y.age}`).toBeDefined()
      expect(y.closed!.report.closed, `age ${y.age}`).toBe(true)
      const cards = y.popups.filter((p) => p.card)
      const popup = y.closed!.report.card === 'popup'
      expect(cards.length, `age ${y.age}`).toBe(popup ? 1 : 0)
      if (popup) expect(y.popups[y.popups.length - 1]!.card, `age ${y.age}`).toBe(true)
    }
    expect(closed.slice(0, 10).every((y) => y.closed!.report.card === 'popup')).toBe(true)
    expect(closed.slice(10).every((y) => y.closed!.report.card === 'inline')).toBe(true)
    expect(lifeProblems(years)).toEqual([])
  })

  it('a record is a copy: playing on does not change a year that was recorded', () => {
    const { years } = playLife({ seed: SEED, birthYear: 1990, untilAge: 6, close: true })
    const y = years[2]!
    expect(y.closed!.after.length).toBeGreaterThan(0)
    expect(JSON.parse(JSON.stringify(y.closed))).toEqual(y.closed)
  })

  it('a rich life gives the close something to fold, and the report and the record agree in every year', () => {
    const rich = findSeed((s) => createNewLife({ seed: s, year: 1990 }).character.alive, { from: 701, tries: 20, label: 'quiet acceptance: a rich life to fold' })
    const { years } = playLife({ seed: rich, birthYear: 1990, untilAge: 40, rich: true, close: true })
    const closed = years.flatMap((y) => (y.closed ? [y.closed] : []))
    expect(closed.length).toBeGreaterThan(20)
    // Folded and kept add up to the notices in play in the queue ageUp left (the year events task can add notices of its own, never remove one).
    const inPlay = (q: readonly ModalItem[]) => q.filter((m) => m.kind === 'notice' && m.s !== undefined && m.support !== true && m.digest === undefined).length
    for (const c of closed) expect(c.report.kept + c.report.folded).toBeGreaterThanOrEqual(inPlay(c.before))
    expect(closed.reduce((n, c) => n + c.report.folded, 0)).toBeGreaterThan(0)
    expect(lifeProblems(years)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------
// 2. The hard caps on real lives

type Class = 'ordinary' | 'rich' | 'founder'

interface Life {
  label: string
  g: GameState
  years: PlayedYear[]
}

function pct(n: number): string {
  return n.toFixed(1)
}

/** One line of numbers a class prints: popups a year with and without the card, and the log lines the player would see. */
function print(cls: Class, lives: readonly Life[]): void {
  const all = lives.flatMap((l) => l.years.filter((y) => y.closed !== undefined))
  const withCard = spread(popupsPerYear(all))
  const without = spread(popupsPerYear(all, { cards: false }))
  const unasked = spread(popupsPerYear(all, { cards: false, asked: false }))
  const lines = spread(all.map((y) => y.closed!.entries.length))
  const seen = spread(all.map((y) => visibleLines(y.closed!.entries)))
  const unrequested = spread(all.map((y) => y.closed!.after.filter((m) => m.kind === 'choice' && m.s !== undefined).length))
  const kept = spread(all.map((y) => y.closed!.after.filter((m) => m.kind === 'notice' && m.s !== undefined && m.digest === undefined).length))
  const companies = all.filter((y) => y.closed!.card?.groups.some((x) => x.k === 'companies')).length
  const sum = (f: (c: ClosedYear) => number): number => all.reduce((n, y) => n + f(y.closed!), 0)
  const rec = all.map((y) => foldRecords(y.closed!))
  const recs = (k: 'folded' | 'text' | 'source' | 'none'): number => rec.reduce((n, r) => n + r[k], 0)
  const row = (s: ReturnType<typeof spread>): string => `mean ${pct(s.mean)} p90 ${s.p90} max ${s.max}`
  console.log(
    [
      `quiet acceptance, ${cls}: ${lives.length} lives, ${all.length} closed years`,
      `  popups a year with the card   ${row(withCard)}`,
      `  popups a year without it      ${row(without)}`,
      `  of them, unasked              ${row(unasked)}`,
      `  unrequested choices kept      ${row(unrequested)}`,
      `  notices in play kept          ${row(kept)}`,
      `  log lines a year              ${row(lines)}`,
      `  of weight 2 or more           ${row(seen)}`,
      `  years with a companies group  ${companies} of ${all.length}`,
      `  cards with a money line       ${all.filter((y) => y.closed!.card?.money !== undefined).length} of ${all.length}`,
      `  close: folded ${sum((c) => c.report.folded)}, deferred ${sum((c) => c.report.deferred)}, came back ${sum((c) => c.report.requeued)}, inline cards ${all.filter((y) => y.closed!.report.card === 'inline').length}`,
      `  folded notices on record: ${recs('folded')} (by title ${recs('text')}, by a line of their source ${recs('source')}, none ${recs('none')})`,
    ].join('\n'),
  )
}

/** The caps, life by life. Every message names the life and the age. */
function assertCaps(cls: Class, lives: readonly Life[]): void {
  for (const life of lives) {
    expect(lifeProblems(life.years), life.label).toEqual([])
    expect(ledgerClean(life.g), `${life.label}: the books`).toEqual([])
    expect(life.years.filter((y) => y.closed !== undefined).length, `${life.label}: years closed`).toBeGreaterThan(5)
  }
  // The sweep has to have met the work it checks: a close that never folded or deferred anything would pass every cap.
  const closed = lives.flatMap((l) => l.years.flatMap((y) => (y.closed ? [y.closed] : [])))
  expect(closed.reduce((n, c) => n + c.report.folded + c.report.deferred, 0), `${cls}: notices folded or choices deferred`).toBeGreaterThan(0)
  print(cls, lives)
}

const ordinary = (): number[] => {
  const countries = new Set<string>()
  return findSeeds(
    (s) => {
      const country = createNewLife({ seed: s, year: 1990 }).character.countryId
      if (countries.has(country)) return false
      countries.add(country)
      return true
    },
    6,
    { from: 951, tries: 200, label: 'quiet acceptance: ordinary lives in 6 countries' },
  )
}

/** Play the lives of a class, the way the store plays them. */
function play(cls: Class): Life[] {
  if (cls === 'ordinary') {
    return ordinary().map((seed, i) => {
      const { g, years } = playLife({ seed, birthYear: BIRTH_YEARS[i % BIRTH_YEARS.length]!, untilAge: UNTIL_AGE, close: true })
      return { label: `ordinary ${i} (seed ${seed})`, g, years }
    })
  }
  if (cls === 'rich') {
    const seeds = findSeeds((s) => createNewLife({ seed: s, year: 1990 }).character.alive, 4, { from: 701, tries: 20, label: 'quiet acceptance: rich lives' })
    return seeds.map((seed, i) => {
      const { g, years } = playLife({ seed, birthYear: BIRTH_YEARS[i % BIRTH_YEARS.length]!, untilAge: UNTIL_AGE, rich: true, close: true })
      return { label: `rich ${i} (seed ${seed})`, g, years }
    })
  }
  // A founder who can open six companies in the country they were born in (probeLife says so by throwing when it cannot).
  const seeds = findSeeds(
    (s) => {
      try {
        probeLife({ seed: s, birthYear: 1990, businesses: 6, years: 0 })
        return true
      } catch {
        return false
      }
    },
    3,
    { from: 801, tries: 120, label: 'quiet acceptance: founders of six companies' },
  )
  return seeds.map((seed, i) => {
    const start = probeLife({ seed, birthYear: 1990, businesses: 6, years: 0 })
    const { g, years } = playLife({ seed, birthYear: 1990, untilAge: UNTIL_AGE, close: true, from: start })
    return { label: `founder ${i} (seed ${seed})`, g, years }
  })
}

// A class is played once per run: the caps and the numbers of the roadmap read the same lives.
const played = new Map<Class, Life[]>()
function livesOf(cls: Class): Life[] {
  let lives = played.get(cls)
  if (!lives) {
    lives = play(cls)
    played.set(cls, lives)
  }
  return lives
}

describe('the hard caps on real lives, played the way the store plays them', () => {
  it('six ordinary lives to age 80', () => assertCaps('ordinary', livesOf('ordinary')), TIMEOUT)

  it('four rich lives ($60M at 25) to age 80', () => assertCaps('rich', livesOf('rich')), TIMEOUT)

  it('three founders of six companies, from 30 to 80', () => assertCaps('founder', livesOf('founder')), TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------
// 3. The numbers of the roadmap (R3-Q13)

/**
 * The roadmap, as it is written: "Popups a year: ordinary lives p90 3, max 5; $50M lives p90 4, max 6; tycoon mean 4 plus one 'Your companies'
 * card; a tycoon's visible log lines from 12.5 to 8". The thresholds are the roadmap's and are never loosened to fit a number.
 *
 * "Popups a year" counts what ARRIVES (lead decision L1): the modal popups that come by themselves after the store flow (closeYear, Quiet
 * Mode, the digest), which is what the year close budgets: 3 unrequested choices and 3 notices a year (YEAR_LIMITS). The outcome of a
 * choice the player answered is a reply to them, not an arrival, and the year card is the one popup the roadmap adds to the tycoon's four,
 * so neither is in the count. The other reading, which counts every popup the player sees as the audit did ("two popups per event"), is
 * measured and printed below, and the roadmap is NOT met on it: it is only guarded against growth (SEEN_GUARD), and docs/QUIET.md says what
 * is open. L1 is the lead's call, not the owner's. Every closed year of a life is counted, from age 1.
 */
const ROADMAP = { ordinary: { p90: 3, max: 5 }, rich: { p90: 4, max: 6 }, founder: { mean: 4, companiesCard: 0.9 }, visibleLog: 8 } as const

type Spread = ReturnType<typeof spread>

const closedYears = (lives: readonly Life[]): PlayedYear[] => lives.flatMap((l) => l.years.filter((y) => y.closed !== undefined))
const arriving = (lives: readonly Life[]): Spread => spread(popupsPerYear(closedYears(lives), { cards: false, asked: false }))
const show = (s: Spread): string => `mean ${s.mean.toFixed(2)}, p90 ${s.p90}, max ${s.max}`

describe('the popups a year of the roadmap, counted as they arrive (decision L1)', () => {
  it('ordinary lives: p90 at most 3 and max at most 5', () => {
    const s = arriving(livesOf('ordinary'))
    const misses = [...(s.p90 > ROADMAP.ordinary.p90 ? [`p90 ${s.p90} is over ${ROADMAP.ordinary.p90}`] : []), ...(s.max > ROADMAP.ordinary.max ? [`max ${s.max} is over ${ROADMAP.ordinary.max}`] : [])]
    expect(misses, `ordinary lives, popups that arrive a year: ${show(s)}`).toEqual([])
  })

  it('$50M lives: p90 at most 4 and max at most 6', () => {
    const s = arriving(livesOf('rich'))
    const misses = [...(s.p90 > ROADMAP.rich.p90 ? [`p90 ${s.p90} is over ${ROADMAP.rich.p90}`] : []), ...(s.max > ROADMAP.rich.max ? [`max ${s.max} is over ${ROADMAP.rich.max}`] : [])]
    expect(misses, `rich lives, popups that arrive a year: ${show(s)}`).toEqual([])
  })

  it('tycoons: a mean of at most 4 popups, and the year card carries the companies group', () => {
    const lives = livesOf('founder')
    const s = arriving(lives)
    const years = closedYears(lives)
    const withCompanies = years.filter((y) => y.closed!.card?.groups.some((g) => g.k === 'companies')).length
    const misses = [
      ...(s.mean > ROADMAP.founder.mean ? [`mean ${s.mean.toFixed(2)} is over ${ROADMAP.founder.mean}`] : []),
      ...(withCompanies < years.length * ROADMAP.founder.companiesCard ? [`${withCompanies} of ${years.length} cards carry a companies group, under ${ROADMAP.founder.companiesCard * 100}%`] : []),
    ]
    expect(misses, `tycoons, popups that arrive a year: ${show(s)}; companies on ${withCompanies} of ${years.length} cards`).toEqual([])
  })
})

describe('the popups a year, the other readings, measured and printed (decision L1)', () => {
  it('prints what the audit counted (every popup the player sees, the outcomes of their own answers included) and what ageUp queued before the close', () => {
    const rows = (['ordinary', 'rich', 'founder'] as const).map((cls) => {
      const lives = livesOf(cls)
      const years = closedYears(lives)
      const seen = spread(popupsPerYear(years, { cards: false }))
      const queued = spread(years.map((y) => y.closed!.before.filter((m) => m.kind !== 'aiTask').length))
      expect(years.length, `${cls}: closed years`).toBeGreaterThan(0)
      return `  ${cls.padEnd(8)} arrive ${show(arriving(lives))}; seen with outcomes ${show(seen)}; queued before the close ${show(queued)}`
    })
    console.log(['quiet acceptance, popups a year on the three readings (asserted: the first):', ...rows].join('\n'))
  }, TIMEOUT)
})

/**
 * What the player SEES, counted as the audit counted ("two popups per event"): every popup after the store flow, the outcome of a choice they
 * answered included, the card left out. This is NOT the roadmap's reading (decision L1 counts arrivals, above) and the roadmap's numbers are not
 * met on it: the year close budgets 3 unrequested choices and 3 notices, and each choice answered costs a second popup, so the design itself
 * allows 9 where the $50M target says 6. L1 was the lead's call and the owner has not signed it (whole-diff review, 2026-10-23). The numbers
 * today, from these lives, are in docs/QUIET.md with the options measured (choices 2 and 1, folding the outcomes of answered choices); until
 * the owner picks one the case below only keeps the player's year from getting noisier. The bounds are today's numbers with room for a draw
 * to move a life (p90 one step, max two, the tycoon's mean half a popup): a guard against growth, never the roadmap, and never to be read as met.
 */
const SEEN_GUARD = { ordinary: { p90: 5, max: 12 }, rich: { p90: 7, max: 12 }, founder: { mean: 7 } } as const

describe('the popups a year the player sees, the audit reading: guarded, not the roadmap (decision L1, owner sign-off pending)', () => {
  it('no class is noisier than today: ordinary and $50M p90 and max, the tycoon mean, every popup of the store flow counted', () => {
    const seen = (cls: Class): Spread => spread(popupsPerYear(closedYears(livesOf(cls)), { cards: false }))
    const ord = seen('ordinary')
    const rich = seen('rich')
    const founder = seen('founder')
    expect(
      [
        ...(ord.p90 > SEEN_GUARD.ordinary.p90 ? [`ordinary p90 ${ord.p90}`] : []),
        ...(ord.max > SEEN_GUARD.ordinary.max ? [`ordinary max ${ord.max}`] : []),
        ...(rich.p90 > SEEN_GUARD.rich.p90 ? [`rich p90 ${rich.p90}`] : []),
        ...(rich.max > SEEN_GUARD.rich.max ? [`rich max ${rich.max}`] : []),
        ...(founder.mean > SEEN_GUARD.founder.mean ? [`tycoon mean ${founder.mean.toFixed(2)}`] : []),
      ],
      `popups the player sees a year: ordinary ${show(ord)}; rich ${show(rich)}; tycoon ${show(founder)}`,
    ).toEqual([])
  })

  it('the answers are most of the gap: a choice answered costs one more popup, so the player sees more than arrives in every class', () => {
    for (const cls of ['ordinary', 'rich', 'founder'] as const) {
      const lives = livesOf(cls)
      expect(spread(popupsPerYear(closedYears(lives), { cards: false })).mean, cls).toBeGreaterThan(arriving(lives).mean)
    }
  })
})

describe('the log a tycoon sees', () => {
  it('a tycoon sees at most 8 lines of the log a year, from the 12.5 the audit found: every year, and on average', () => {
    const years = closedYears(livesOf('founder'))
    const shown = years.map((y) => viewYearLog(y.closed!.entries).shown.length)
    const written = years.map((y) => y.closed!.entries.length)
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
    console.log(`quiet acceptance, tycoon log: ${mean(written).toFixed(1)} lines written a year, ${mean(shown).toFixed(1)} in view (most ${Math.max(...shown)}); the audit had 12.5`)
    expect(Math.max(...shown), 'lines in view').toBeLessThanOrEqual(ROADMAP.visibleLog)
    expect(Math.max(...shown)).toBeLessThanOrEqual(LOG_VISIBLE)
    expect(mean(shown)).toBeLessThanOrEqual(ROADMAP.visibleLog)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// 4. The repetition targets, on the 13-life probe (R3-Q13, decisions D32 and L2)

/**
 * The 13 lives of test/text-probe.ts (seeds 101 to 113, six birth years in turn, every second life rich), played to 85 the way the store plays
 * them, and measured the way the text kit and R2's text-repeat probe measure them: the repetition targets are about the LINES of the life log
 * (decision L2), and a line is its normalized text (test/text-metrics.ts). A life repeats at most 5% of its lines (8% when rich), no line shows
 * up more than 3 times in a life, the same line is never told twice within 10 years, and a state line (text/state.ts) is not told twice
 * within the 5 years its row waits. Popup scenes are not lines: they follow family pacing. Where the rule is a bar it is asserted: an event
 * popup title at most 6 times a life (as test/pace-families.test.ts measures it), an ask family at most once in PACE.askGap (4) years, a
 * thread bar, and an ask family at most PACE.askLife (6) times in a life, the rich lives included (the fix of lead decision L2: the pace core
 * counts an ask family's tellings for the whole life, text/pace.ts askGapOk). Where the rule is a weight (events, company events, the career
 * kit) a family may come twice in 5 years, so those readings are printed for every engine and not asserted. The thresholds are the design's
 * and are never loosened to fit a number.
 */
interface ProbePlayed {
  spec: ProbeLife
  trace: LifeTrace
  metrics: TextMetrics
  /** The years each pace family spoke in the life, by memory key ('pop.ask.loan'), read from the text kit's family record after every year. */
  families: Map<string, number[]>
}

let probe: ProbePlayed[] | undefined
function probed(): ProbePlayed[] {
  probe ??= probeLives(13).map((spec) => {
    const families = new Map<string, number[]>()
    const { years } = playLife({
      seed: spec.seed,
      birthYear: spec.birthYear,
      untilAge: PROBE_UNTIL_AGE,
      rich: spec.rich,
      close: true,
      onYear: (g) => noteFamilies(g, families),
    })
    const trace: LifeTrace = { seed: spec.seed, birthYear: spec.birthYear, rich: spec.rich, years }
    return { spec, trace, metrics: textMetrics(trace), families }
  })
  return probe
}

/**
 * Read-only, after a year is played: a pace family that spoke this year has a new last year in the text kit's record (text/pace.ts notes
 * it where an engine presents). The record is a list of years, newest last, so a change of the last one is one more telling.
 */
function noteFamilies(g: GameState, into: Map<string, number[]>): void {
  for (const [key, record] of Object.entries(readTextMem(g).f)) {
    if (!key.startsWith('pop.')) continue
    const last = Number(record.split(',').pop())
    if (!Number.isInteger(last)) continue
    const told = into.get(key)
    if (!told) into.set(key, [last])
    else if (told[told.length - 1] !== last) told.push(last)
  }
}

/** The families a thread holds (a crisis, the will): the ask gap does not hold them back, so they may come twice within it. */
const STORYLINE_FAMILIES: ReadonlySet<string> = new Set(Object.values(ASK_FAMILIES).flatMap((a) => (a.storyline === true ? [paceKey('ask', a.family)] : [])))

/** Ask families that were offered again within `gap` years of the telling before, a thread bar: "pop.ask.loan (years 2040, 2042)". */
function askGapMisses(families: ReadonlyMap<string, readonly number[]>, gap: number): string[] {
  const out: string[] = []
  for (const [key, told] of families) {
    if (!key.startsWith('pop.ask.') || STORYLINE_FAMILIES.has(key)) continue
    for (let i = 1; i < told.length; i++) if (told[i]! - told[i - 1]! < gap) out.push(`${key} (years ${told[i - 1]}, ${told[i]})`)
  }
  return out
}

/**
 * Ask families told more than `max` times in a life, a bar of the whole life: a storyline family counts too, because a thread is let through
 * the gap and not past the cap. "pop.ask.loan (7 times, years 2030, 2034, ...)".
 */
function askLifeMisses(families: ReadonlyMap<string, readonly number[]>, max: number): string[] {
  const out: string[] = []
  for (const [key, told] of families) {
    if (key.startsWith('pop.ask.') && told.length > max) out.push(`${key} (${told.length} times, years ${told.slice(0, 8).join(', ')}${told.length > 8 ? ', ...' : ''})`)
  }
  return out
}

/** One engine's families over the lives: how many tellings, the most one family spoke in a life, how many went over 6 in a life, the closest two. */
function engineRow(lives: readonly ProbePlayed[], engine: 'ev' | 'ask' | 'biz' | 'kit'): string {
  let families = 0
  let most = 0
  let over = 0
  let closest: number | null = null
  for (const p of lives) {
    for (const [key, told] of p.families) {
      if (!key.startsWith(`pop.${engine}.`)) continue
      families++
      most = Math.max(most, told.length)
      if (told.length > DESIGN_THRESHOLDS.popupFamilyMax) over++
      for (let i = 1; i < told.length; i++) closest = closest === null ? told[i]! - told[i - 1]! : Math.min(closest, told[i]! - told[i - 1]!)
    }
  }
  return `${engine.padEnd(3)} ${families} family-lives, most times one spoke in a life ${most}, over ${DESIGN_THRESHOLDS.popupFamilyMax} in a life ${over}, closest two ${closest ?? 'none'} years apart`
}

const who = (p: ProbePlayed): string => `seed ${p.spec.seed}${p.spec.rich ? ' (rich)' : ''}`
const share = (n: number): string => `${(n * 100).toFixed(2)}%`

/** Every normalized line of a life with the years it was told in, in order. */
function tellings(trace: LifeTrace): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const y of trace.years) {
    for (const line of y.lines) {
      const key = normalize(line.text)
      const years = out.get(key)
      if (years) years.push(y.year)
      else out.set(key, [y.year])
    }
  }
  return out
}

const brief = (text: string): string => (text.length > 70 ? `${text.slice(0, 67)}...` : text)

/** The lines told again within `years` years of the telling before, as "<text> (told in years +0, +4)". */
function repeatsWithin(trace: LifeTrace, years: number): string[] {
  const out: string[] = []
  for (const [text, told] of tellings(trace)) {
    if (told.slice(1).some((y, i) => y - told[i]! <= years)) out.push(`${brief(text)} (${told.length}x, years +${told.map((y) => y - told[0]!).join(', +')})`)
  }
  return out
}

/** The lines told more than `times` times. */
function toldMoreThan(trace: LifeTrace, times: number): string[] {
  return [...tellings(trace)].filter(([, told]) => told.length > times).map(([text, told]) => `${brief(text)} (${told.length}x)`)
}

/** A row of the state table as a pattern over the raw line: its slots match anything. */
function statePatterns(): { key: string; re: RegExp }[] {
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Object.entries(STATE_TABLE).flatMap(([key, spec]) =>
    spec.variants.map((v) => ({ key, re: new RegExp(`^${v.split(/\{\w+\}/).map(escape).join('.*')}$`, 'su') })),
  )
}

/** State lines told twice within STATE_LIMITS.every years: the same normalized text of one row. */
function stateRepeats(trace: LifeTrace): string[] {
  const patterns = statePatterns()
  const seen = new Map<string, number>()
  const out: string[] = []
  for (const y of trace.years) {
    for (const line of y.lines) {
      const row = patterns.find((p) => p.re.test(line.text))
      if (!row) continue
      const key = `${row.key}|${normalize(line.text)}`
      const before = seen.get(key)
      if (before !== undefined && y.year - before < STATE_LIMITS.every) out.push(`${row.key}: ${brief(line.text)} (${y.year - before} years apart)`)
      seen.set(key, y.year)
    }
  }
  return out
}

/** The event library's popups that arrived by themselves, as test/pace-families.test.ts takes them: a passive choice of the random-event script. */
function eventScenes(trace: LifeTrace): PlayedYear[] {
  return trace.years.map((y) => ({ ...y, popups: y.popups.filter((p) => p.passive && p.item.kind === 'choice' && p.item.scriptId === EVENT_SCRIPT) }))
}

describe('repetition on the 13-life probe', () => {
  it('prints the numbers: the pooled share, the lines told again, the state lines and the popup families', () => {
    const lives = probed()
    const merge = (rich: boolean): TextMetrics => mergeMetrics(lives.filter((p) => p.spec.rich === rich).map((p) => p.metrics))
    const o = merge(false)
    const r = merge(true)
    const scenes = lives.map((p) => textMetrics({ ...p.trace, years: eventScenes(p.trace) }))
    console.log(
      [
        `quiet acceptance, repetition: 13 lives to ${PROBE_UNTIL_AGE}, ${lives.reduce((n, p) => n + p.metrics.lines, 0)} log lines`,
        `  repeated share   ordinary ${share(o.repeatedShare)} (target ${share(DESIGN_THRESHOLDS.repeatedShare)}), rich ${share(r.repeatedShare)} (target ${share(DESIGN_THRESHOLDS.repeatedShareRich)})`,
        `  a line told most in a life   ordinary ${o.over3.max}, rich ${r.over3.max} (target ${DESIGN_THRESHOLDS.over3Max})`,
        `  lines told twice within 10 years   ${lives.reduce((n, p) => n + p.metrics.sameWithin10, 0)} (target ${DESIGN_THRESHOLDS.sameWithin10})`,
        `  state lines told twice within ${STATE_LIMITS.every} years   ${lives.reduce((n, p) => n + stateRepeats(p.trace).length, 0)} (target 0)`,
        `  event popups by title   most in a life ${Math.max(...scenes.map((m) => m.popupFamilies.maxPerLife))}, titles over ${DESIGN_THRESHOLDS.popupFamilyMax} ${scenes.reduce((n, m) => n + m.popupFamilies.over6, 0)}`,
        `  pace families by engine (the record of text/pace.ts; events, company events and the kit are weighted, asks wait ${PACE.askGap} years):`,
        ...(['ev', 'ask', 'biz', 'kit'] as const).map((e) => `    ${engineRow(lives, e)}`),
        `  all popups by title (the cards, notices and asks too)   most in a life ${Math.max(o.popupFamilies.maxPerLife, r.popupFamilies.maxPerLife)}, titles over ${DESIGN_THRESHOLDS.popupFamilyMax} ${o.popupFamilies.over6 + r.popupFamilies.over6}`,
        ...lives.map((p) => `  ${who(p).padEnd(16)} share ${share(p.metrics.repeatedShare)}, most ${p.metrics.over3.max}x, within 10 years ${p.metrics.sameWithin10}`),
      ].join('\n'),
    )
    expect(lives).toHaveLength(13)
    expect(lives.filter((p) => p.spec.rich)).toHaveLength(6)
  }, TIMEOUT)

  it('a life repeats at most 5% of its lines, and a rich life at most 8%', () => {
    const misses = probed().flatMap((p) => {
      const limit = p.spec.rich ? DESIGN_THRESHOLDS.repeatedShareRich : DESIGN_THRESHOLDS.repeatedShare
      return p.metrics.repeatedShare > limit ? [`${who(p)}: ${share(p.metrics.repeatedShare)} is over ${share(limit)}`] : []
    })
    expect(misses).toEqual([])
  }, TIMEOUT)

  it('no line is told more than 3 times in a life', () => {
    const misses = probed().flatMap((p) => (p.metrics.over3.max > DESIGN_THRESHOLDS.over3Max ? [`${who(p)}: ${toldMoreThan(p.trace, DESIGN_THRESHOLDS.over3Max).join('; ')}`] : []))
    expect(misses).toEqual([])
  }, TIMEOUT)

  it('no line is told twice within 10 years', () => {
    const misses = probed().flatMap((p) => (p.metrics.sameWithin10 > DESIGN_THRESHOLDS.sameWithin10 ? [`${who(p)}: ${p.metrics.sameWithin10}: ${repeatsWithin(p.trace, 10).slice(0, 5).join('; ')}`] : []))
    expect(misses).toEqual([])
  }, TIMEOUT)

  it('a state line is told once in 5 years', () => {
    const misses = probed().flatMap((p) => {
      const again = stateRepeats(p.trace)
      return again.length > 0 ? [`${who(p)}: ${again.slice(0, 5).join('; ')}`] : []
    })
    expect(misses).toEqual([])
  }, TIMEOUT)

  it('no event popup title is shown more than 6 times in a life: the family pacing of the scenes', () => {
    const misses = probed().flatMap((p) => {
      const m = textMetrics({ ...p.trace, years: eventScenes(p.trace) })
      return m.popupFamilies.maxPerLife > DESIGN_THRESHOLDS.popupFamilyMax || m.popupFamilies.over6 > 0 ? [`${who(p)}: a title ${m.popupFamilies.maxPerLife} times, ${m.popupFamilies.over6} titles over ${DESIGN_THRESHOLDS.popupFamilyMax}`] : []
    })
    expect(misses).toEqual([])
  }, TIMEOUT)

  it('an ask family is offered at most once in PACE.askGap (4) years, a thread bar: the pacing of the asks, whoever asks', () => {
    const misses = probed().flatMap((p) => {
      const again = askGapMisses(p.families, PACE.askGap)
      return again.length > 0 ? [`${who(p)}: ${again.slice(0, 5).join('; ')}`] : []
    })
    expect(misses).toEqual([])
    // The probe has to have met asks, or the case above would pass on lives nobody asked anything of.
    const asked = probed().reduce((n, p) => n + [...p.families.keys()].filter((k) => k.startsWith('pop.ask.')).length, 0)
    expect(asked, 'ask families told in the 13 lives').toBeGreaterThan(20)
  }, TIMEOUT)
})

describe('the ask life cap, rich lives included (lead decision L2: a popup family at most 6 times a life)', () => {
  it('no ask family is offered more than PACE.askLife (6) times in a life, in the 6 rich lives of the probe as in the 7 ordinary ones', () => {
    const misses = probed().flatMap((p) => {
      const over = askLifeMisses(p.families, DESIGN_THRESHOLDS.popupFamilyMax)
      return over.length > 0 ? [`${who(p)}: ${over.slice(0, 5).join('; ')}`] : []
    })
    expect(misses).toEqual([])
    // The rule the pace core enforces is the roadmap's number, not a looser one.
    expect(PACE.askLife).toBe(DESIGN_THRESHOLDS.popupFamilyMax)
  }, TIMEOUT)

  it('the cap is met, not just never needed: a rich life is asked about one family as many times as the cap allows', () => {
    // The rich lives were asked about one family up to 15 times before the cap. If none of them reaches 6 now, the cap case above passes
    // on lives nobody asked enough of, so it holds nothing.
    const rich = probed().filter((p) => p.spec.rich)
    const most = Math.max(0, ...rich.flatMap((p) => [...p.families].filter(([k]) => k.startsWith('pop.ask.')).map(([, told]) => told.length)))
    const held = rich.flatMap((p) => [...p.families].filter(([k, told]) => k.startsWith('pop.ask.') && told.length === DESIGN_THRESHOLDS.popupFamilyMax).map(([k, told]) => `${who(p)} ${k.slice(8)} ${told[0]} to ${told[told.length - 1]}`))
    console.log(['quiet acceptance, ask families held at the cap in the rich lives (first and last telling):', ...held.map((h) => `  ${h}`)].join('\n'))
    expect(most, 'the most one ask family was told in a rich life').toBe(DESIGN_THRESHOLDS.popupFamilyMax)
  }, TIMEOUT)
})

describe('the ask life checker', () => {
  it('finds a family told more than the cap, a thread included, and leaves the other engines and a family at the cap alone', () => {
    const years = (n: number, from = 2000): number[] => Array.from({ length: n }, (_, i) => from + i * 4)
    const lives = new Map<string, number[]>([
      ['pop.ask.loan', years(7)],
      ['pop.ask.gifts', years(6)],
      ['pop.ask.crisis', years(9)],
      ['pop.ev.scam', years(9)],
    ])
    const found = askLifeMisses(lives, 6)
    expect(found).toEqual(['pop.ask.loan (7 times, years 2000, 2004, 2008, 2012, 2016, 2020, 2024)', 'pop.ask.crisis (9 times, years 2000, 2004, 2008, 2012, 2016, 2020, 2024, 2028, ...)'])
    expect(STORYLINE_FAMILIES.has('pop.ask.crisis')).toBe(true)
  })
})

describe('the ask gap checker', () => {
  it('finds a family told again inside the gap, and leaves a thread, a family that waited and another engine alone', () => {
    const lives = new Map<string, number[]>([
      ['pop.ask.loan', [2030, 2033]],
      ['pop.ask.gifts', [2030, 2034]],
      ['pop.ask.crisis', [2030, 2031]],
      ['pop.ev.scam', [2030, 2031]],
    ])
    expect(askGapMisses(lives, 4)).toEqual(['pop.ask.loan (years 2030, 2033)'])
    expect(STORYLINE_FAMILIES.has('pop.ask.crisis')).toBe(true)
    expect(STORYLINE_FAMILIES.has('pop.ask.loan')).toBe(false)
  })

  it('reads the family record of a life: a new last year is one more telling, and the same year is not told twice', () => {
    const g = makeTestGame(3, { age: 30 })
    const into = new Map<string, number[]>()
    const key = paceKey('ask', 'loan')
    notePopup(g, key)
    noteFamilies(g, into)
    noteFamilies(g, into)
    const first = g.year
    g.year += 5
    notePopup(g, key)
    noteFamilies(g, into)
    expect(into.get(key)).toEqual([first, first + 5])
  })
})
