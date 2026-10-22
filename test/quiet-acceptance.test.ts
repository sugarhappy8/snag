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
// The numeric targets (popups a year: ordinary p90 3 and max 5, $50M p90 4 and max 6, tycoon mean 4 plus the companies card) are NOT asserted
// here. The pace lane (R3-Q8 to R3-Q10) lowers the numbers and R3-Q13 turns the targets on once it is merged. This file prints them.
//
// Every life is found, not pinned (test/seed-kit.ts), and played once per run.
import { describe, expect, it } from 'vitest'
import { shortMoney } from '../src/game/core'
import { DEFERRABLE_SCRIPTS, type CloseReport } from '../src/game/hubs/year-close'
import { YEAR_LIMITS } from '../src/game/hubs/year-plan'
import { createNewLife } from '../src/game/life'
import type { ChoiceModal, GameState, LogEntry, ModalItem, NoticeModal, YearCard } from '../src/game/types'
import { EVENT_SCRIPT } from '../src/game/events/helpers'
import { closeProblems, foldRecords, ledgerClean, lifeProblems, popupsPerYear, spread, visibleLines } from './close-kit'
import { playLife, type ClosedYear, type PlayedYear } from './play-kit'
import { probeLife } from './probe-life'
import { findSeed, findSeeds } from './seed-kit'

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

describe('the hard caps on real lives, played the way the store plays them', () => {
  it(
    'six ordinary lives to age 80',
    () => {
      const lives: Life[] = ordinary().map((seed, i) => {
        const { g, years } = playLife({ seed, birthYear: BIRTH_YEARS[i % BIRTH_YEARS.length]!, untilAge: UNTIL_AGE, close: true })
        return { label: `ordinary ${i} (seed ${seed})`, g, years }
      })
      assertCaps('ordinary', lives)
    },
    TIMEOUT,
  )

  it(
    'four rich lives ($60M at 25) to age 80',
    () => {
      const seeds = findSeeds((s) => createNewLife({ seed: s, year: 1990 }).character.alive, 4, { from: 701, tries: 20, label: 'quiet acceptance: rich lives' })
      const lives: Life[] = seeds.map((seed, i) => {
        const { g, years } = playLife({ seed, birthYear: BIRTH_YEARS[i % BIRTH_YEARS.length]!, untilAge: UNTIL_AGE, rich: true, close: true })
        return { label: `rich ${i} (seed ${seed})`, g, years }
      })
      assertCaps('rich', lives)
    },
    TIMEOUT,
  )

  it(
    'three founders of six companies, from 30 to 80',
    () => {
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
      const lives: Life[] = seeds.map((seed, i) => {
        const start = probeLife({ seed, birthYear: 1990, businesses: 6, years: 0 })
        const { g, years } = playLife({ seed, birthYear: 1990, untilAge: UNTIL_AGE, close: true, from: start })
        return { label: `founder ${i} (seed ${seed})`, g, years }
      })
      assertCaps('founder', lives)
    },
    TIMEOUT,
  )
})
