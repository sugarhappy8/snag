// R3-Q3 (E.D2 a): the pure year planner (src/game/hubs/year-plan.ts). From a queue and a log it decides what stays a popup, what folds,
// what merges and what the year card says. It writes nothing to the game and draws nothing. These tests pin each rule on synthetic
// queues (a noisy tycoon year, a quiet year, a year of life events, a notice before its choice, a duplicate pair, a notice the
// never-route policy blocks, a support notice), then run a property loop over 200 random queues, then read the books on seeded lives.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { ageUp } from '../src/game/aging'
import { LOG_AMOUNT_MAX, shortMoney, sourceOf } from '../src/game/core'
import { cultureOf } from '../src/game/history/digest'
import {
  GROUP_OF_SOURCE,
  MERGE_TEMPLATES,
  YEAR_GROUP_ORDER,
  YEAR_LIMITS,
  buildCard,
  foldLogEntries,
  groupOf,
  headlineOf,
  moneyFacts,
  moneyLine,
  noticeWeight,
  planNotices,
  storyLine,
  storyOf,
  type Story,
} from '../src/game/hubs/year-plan'
import { acctBalance, playerAcct } from '../src/game/kernel/ledger'
import { yearlyEntries } from '../src/game/kernel/registry'
import { createNewLife } from '../src/game/life'
import { readLifeSeries } from '../src/game/life-series'
import { neverRoute } from '../src/game/notice-policy'
import type { ChoiceModal, GameState, LogEntry, LogWeight, ModalItem, NoticeModal, Tone, YearCard, YearGroup } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { playLife } from './play-kit'
import { findSeed, findSeeds } from './seed-kit'

const ROOT = join(__dirname, '..')
const DASHES = /[\u2013\u2014]/

function life(year = 2000): GameState {
  const g = createNewLife({ seed: findSeed(() => true, { label: 'any life' }), year })
  g.queue = []
  return g
}

/** A notice in play (it has a source): the defaults are a plain weight 2 title that no table knows. */
function N(id: string, extra: Partial<NoticeModal> = {}): NoticeModal {
  return { kind: 'notice', id, title: `Title ${id}`, text: `Text of ${id}.`, s: 'health', ...extra }
}

function C(id: string, extra: Partial<ChoiceModal> = {}): ChoiceModal {
  return { kind: 'choice', id, title: `Pick ${id}`, text: 'Which one?', choices: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }], source: 'script', scriptId: 'none', s: 'events', ...extra }
}

function T(id: string): ModalItem {
  return { kind: 'aiTask', id, task: { type: 'yearEvents' } }
}

function L(id: string, text: string, extra: Partial<LogEntry> = {}): LogEntry {
  return { id, text, tone: 'neutral', ...extra }
}

function S(id: string, extra: Partial<Story> = {}): Story {
  return { id, s: 'health', group: 'body', w: 2, a: 0, title: `Story ${id}`, text: `Text of ${id}.`, tone: 'neutral', ...extra }
}

const ids = (list: readonly { id: string }[]): string[] => list.map((m) => m.id)

/** A tiny seeded generator (mulberry32), the file's own so no game stream is touched. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every .ts and .tsx source under a folder, as text. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.tsx?$/.test(name)) out.push(readFileSync(path, 'utf8'))
  }
  return out
}

function literals(title: string): string[] {
  return ["'", '"', '`'].map((q) => `${q}${title.replace(/\\/g, '\\\\').split(q).join(`\\${q}`)}${q}`)
}

// ---------------------------------------------------------------------------
describe('the limits and the group table', () => {
  it('YEAR_LIMITS holds the numbers of the contract', () => {
    expect({ ...YEAR_LIMITS }).toEqual({
      choices: 3,
      notices: 3,
      noticesMax: 5,
      lines: 8,
      head: 90,
      story: 90,
      stories: 3,
      people: 3,
      group: 90,
      groupLines: 6,
      pending: 6,
      pendingYears: 2,
      popupYears: 10,
    })
    expect(Object.isFrozen(YEAR_LIMITS)).toBe(true)
  })

  it('maps the 36 yearly hooks, the year events and this release modules to the agreed groups', () => {
    const expected: Record<YearGroup, string[]> = {
      people: ['household', 'relationships', 'sharedProjects', 'background', 'royalty', 'royalCareers', 'familyUse', 'nepo', 'willFeuds', 'society.acts', 'world.edges', 'life.estates', 'life.kin'],
      body: ['health'],
      work: ['education', 'professions', 'career', 'special', 'advisors', 'effort.you'],
      companies: ['workshop', 'corruption', 'business', 'techWaves', 'hedge'],
      money: ['development', 'investments', 'shops', 'computer', 'finance', 'wealth', 'assets', 'knowledge.core'],
      law: ['immigration', 'crime', 'underworld', 'nation'],
      world: ['history', 'digest', 'world', 'world.frontier'],
      life: ['events', 'milestones', 'givingFund'],
    }
    const flat: Record<string, YearGroup> = {}
    for (const [group, names] of Object.entries(expected) as [YearGroup, string[]][]) for (const n of names) flat[n] = group
    expect({ ...GROUP_OF_SOURCE }).toEqual(flat)
    expect(Object.isFrozen(GROUP_OF_SOURCE)).toBe(true)
    for (const [name, group] of Object.entries(flat)) expect(groupOf(name), name).toBe(group)
  })

  it('names every yearly aging entry that is registered, so none lands in everyday by accident', () => {
    const entries = yearlyEntries('aging')
    expect(entries.length).toBeGreaterThanOrEqual(36)
    for (const e of entries) expect(Object.hasOwn(GROUP_OF_SOURCE, sourceOf(e.id)), e.id).toBe(true)
  })

  it('reads an unknown or missing source, and a name the object prototype has, as everyday', () => {
    for (const s of [undefined, '', 'nobody', 'Health', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(groupOf(s), String(s)).toBe('life')
    expect(YEAR_GROUP_ORDER).toEqual(['people', 'body', 'work', 'companies', 'money', 'law', 'world', 'life'])
  })
})

// ---------------------------------------------------------------------------
describe('noticeWeight', () => {
  it('takes the weight of the popup first, then the title table, then minor, then 2', () => {
    expect(noticeWeight(N('a', { w: 3, title: 'Admirer' }))).toBe(3)
    expect(noticeWeight(N('a', { title: 'Admirer' }))).toBe(0)
    expect(noticeWeight(N('a', { title: 'Report Card' }))).toBe(1)
    expect(noticeWeight(N('a', { title: 'Divorce' }))).toBe(3)
    expect(noticeWeight(N('a', { title: 'Not in any table', weight: 'minor' }))).toBe(1)
    expect(noticeWeight(N('a', { title: 'Not in any table' }))).toBe(2)
    expect(noticeWeight(N('a', { title: 'constructor' }))).toBe(2)
    expect(noticeWeight(N('a', { w: 0, title: 'Divorce' }))).toBe(0)
  })

  it('raises a weight under 2 to 2 when the never-route policy blocks the notice, and leaves 2 and 3 alone', () => {
    const bad = N('a', { title: 'Kindness', text: 'It went wrong.', tone: 'bad' })
    expect(neverRoute(bad)).not.toBeNull()
    expect(noticeWeight(bad)).toBe(2)
    expect(noticeWeight(N('a', { w: 0, text: 'The doctor called.' }))).toBe(2)
    expect(noticeWeight(N('a', { w: 1, text: 'A court date is set.' }))).toBe(2)
    expect(noticeWeight(N('a', { w: 1, text: 'You sold it for $20M.' }))).toBe(2)
    expect(noticeWeight(N('a', { w: 3, tone: 'bad' }))).toBe(3)
    expect(noticeWeight(N('a', { title: 'Admirer', text: 'A friendly wave.' }))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
describe('planNotices: what stays a popup', () => {
  const g = life()

  it('keeps a quiet year whole and folds the routine notice', () => {
    const queue = [N('a', { title: 'Promotion' }), N('b', { title: 'Report Card', s: 'education' })]
    const plan = planNotices(g, queue)
    expect([...plan.keep]).toEqual(['a'])
    expect(ids(plan.fold)).toEqual(['b'])
    expect(ids(plan.merged)).toEqual(['b'])
    expect(plan.fold[0]).toMatchObject({ id: 'b', s: 'education', group: 'work', w: 1, title: 'Report Card' })
  })

  it('keeps nothing of weight 0 or 1 and folds it, whatever the room', () => {
    const queue = [N('a', { w: 0 }), N('b', { w: 1 })]
    const plan = planNotices(g, queue)
    expect(plan.keep.size).toBe(0)
    expect(ids(plan.fold)).toEqual(['a', 'b'])
  })

  it('fills three popups with the best of weight 2 by weight, then the figure, then the queue order', () => {
    const queue = [
      N('a', { a: 500 }),
      N('b', { a: 90_000 }),
      N('c', { title: 'Rogue CEO Caught', text: 'It cost $2M.' }), // no amount: the largest figure of the text, 2,000,000
      N('d', { a: 500 }),
      N('e', { a: 3_000 }),
    ]
    const plan = planNotices(g, queue)
    expect([...plan.keep]).toEqual(['b', 'c', 'e'])
    expect(ids(plan.fold)).toEqual(['a', 'd'])
  })

  it('keeps every weight 3 notice and grows the room with their count, up to five', () => {
    const three = (id: string): NoticeModal => N(id, { w: 3 })
    const plan4 = planNotices(g, [three('a'), N('x'), three('b'), three('c'), N('y'), three('d')])
    expect([...plan4.keep]).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(plan4.fold)).toEqual(['x', 'y'])
    const plan1 = planNotices(g, [three('a'), N('x', { a: 3 }), N('y', { a: 2 }), N('z', { a: 1 })])
    expect([...plan1.keep]).toEqual(['a', 'x', 'y'])
    const plan2 = planNotices(g, [three('a'), three('b'), N('x', { a: 3 }), N('y', { a: 2 })])
    expect([...plan2.keep]).toEqual(['a', 'b', 'x'])
    const many = planNotices(g, [1, 2, 3, 4, 5, 6, 7].map((n) => three(`t${n}`)).concat([N('x')]))
    expect(many.keep.size).toBe(7)
    expect(ids(many.fold)).toEqual(['x'])
    const five = planNotices(g, [three('a'), three('b'), three('c'), three('d'), three('e'), N('x'), N('y')])
    expect(five.keep.size).toBe(5)
    expect(ids(five.fold)).toEqual(['x', 'y'])
  })

  it('never folds a notice that comes right before a choice of the same source', () => {
    const plan = planNotices(g, [N('a', { w: 0, s: 'events' }), C('c1', { s: 'events' })])
    expect([...plan.keep]).toEqual(['a'])
    expect(plan.fold).toEqual([])
    // A different source, a gap, or a notice that is not the one right before it: not context.
    expect(planNotices(g, [N('a', { w: 0, s: 'health' }), C('c1', { s: 'events' })]).keep.size).toBe(0)
    expect(planNotices(g, [N('a', { w: 0, s: 'events' }), N('b', { w: 0, s: 'events' }), C('c1', { s: 'events' })]).keep.has('a')).toBe(false)
    expect(planNotices(g, [N('a', { w: 0, s: 'events' }), N('b', { w: 0, s: 'events' }), C('c1', { s: 'events' })]).keep.has('b')).toBe(true)
    expect(planNotices(g, [N('a', { w: 0, s: 'events' }), C('c1', { s: undefined })]).keep.size).toBe(0)
    // The context notice counts toward the room, and a full room does not fold it.
    const full = planNotices(g, [N('a', { w: 3 }), N('b', { w: 3 }), N('c', { w: 3 }), N('d', { w: 0, s: 'events' }), C('c1', { s: 'events' }), N('e', { a: 9 })])
    expect([...full.keep]).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(full.fold)).toEqual(['e'])
  })

  it('raises a notice the never-route policy blocks to weight 2, so it can be kept and never goes log-only as trivia', () => {
    const queue = [N('a', { title: 'Kindness', tone: 'bad', text: 'It went wrong.' }), N('b', { w: 1, text: 'Your doctor wants a word.' })]
    const plan = planNotices(g, queue)
    expect([...plan.keep]).toEqual(['a', 'b'])
    expect(plan.fold).toEqual([])
  })

  it('leaves everything that is not a notice in play alone: no source, support, input, minigame, task, choice, a year card', () => {
    const queue: ModalItem[] = [
      N('own', { s: undefined, w: 0 }),
      N('sup', { w: 0, support: true }),
      { kind: 'input', id: 'in', title: 'Name it', text: '', placeholder: '', scriptId: 'none' } as unknown as ModalItem,
      { kind: 'minigame', id: 'mg', game: 'slots', title: 'Slots', scriptId: 'none', data: {} },
      T('task'),
      C('ch'),
      N('card', { w: 0, digest: { v: 1, year: 2000, age: 10, head: 'h', stories: [], groups: [] } }),
      N('badsrc', { w: 0, s: 'Bad Source!' }),
      N('inplay', { w: 0 }),
    ]
    const plan = planNotices(g, queue)
    expect(plan.keep.size).toBe(0)
    expect(ids(plan.fold)).toEqual(['inplay'])
  })

  it('does not change the queue or its items', () => {
    const queue = deepFreeze([N('a', { a: 5 }), N('b', { w: 0 }), N('c', { w: 0 }), C('d')])
    const before = JSON.stringify(queue)
    planNotices(g, queue)
    expect(JSON.stringify(queue)).toBe(before)
  })
})

describe('planNotices: what folds and what merges', () => {
  const g = life()

  it('cuts the title and the text of a folded story to 90 with the inbox rule', () => {
    const long = 'word '.repeat(60)
    const plan = planNotices(g, [N('a', { w: 0, title: `T ${long}`, text: `  ${long}\n\n${long}` })])
    const st = plan.fold[0]!
    expect(st.title.length).toBeLessThanOrEqual(90)
    expect(st.text.length).toBeLessThanOrEqual(90)
    expect(st.title.endsWith('...')).toBe(true)
    expect(st.text.endsWith('...')).toBe(true)
    expect(st.text).not.toMatch(/\s{2,}|\n/)
    expect(storyLine(st).length).toBeLessThanOrEqual(90)
  })

  it('merges two folded stories with the same source and title into one, "{title}, {n} times"', () => {
    const plan = planNotices(g, [N('a', { w: 1, title: 'Report Card', s: 'education' }), N('x', { w: 0 }), N('b', { w: 1, title: 'Report Card', s: 'education' })])
    expect(ids(plan.fold)).toEqual(['a', 'x', 'b'])
    expect(ids(plan.merged)).toEqual(['a', 'x'])
    const m = plan.merged[0]!
    expect(m).toMatchObject({ id: 'a', s: 'education', group: 'work', w: 1, title: 'Report Card, 2 times', text: '' })
    expect(storyLine(m)).toBe('Report Card, 2 times')
  })

  it('adds the summed amount as money only when every part has one', () => {
    const all = planNotices(g, [N('a', { w: 1, title: 'Kindness', a: 100 }), N('b', { w: 1, title: 'Kindness', a: 250 }), N('c', { w: 1, title: 'Kindness', a: 1_200_000 })])
    expect(all.merged).toHaveLength(1)
    expect(all.merged[0]).toMatchObject({ title: 'Kindness, 3 times', text: `${shortMoney(1_200_350)} in all`, a: 1_200_350 })
    const some = planNotices(g, [N('a', { w: 1, title: 'Kindness', a: 100 }), N('b', { w: 1, title: 'Kindness' })])
    expect(some.merged[0]).toMatchObject({ title: 'Kindness, 2 times', text: '' })
  })

  it('does not merge across sources or titles, and takes the worst tone and the highest weight', () => {
    const plan = planNotices(g, [
      N('a', { w: 1, title: 'Kindness', s: 'health' }),
      N('b', { w: 1, title: 'Kindness', s: 'education' }),
      N('c', { w: 1, title: 'Helpful', s: 'health' }),
    ])
    expect(plan.merged).toHaveLength(3)
    // Three life events fill the room, so both fold; the bad one counts as weight 2, so the join is a 2 and a bad one.
    const full = [N('k1', { w: 3 }), N('k2', { w: 3 }), N('k3', { w: 3 })]
    const mix = planNotices(g, [...full, N('a', { w: 0, title: 'Squabble', tone: 'good' }), N('b', { w: 1, title: 'Squabble', tone: 'bad', text: 'It went wrong.' })])
    expect(mix.merged).toHaveLength(1)
    expect(mix.merged[0]).toMatchObject({ title: 'Squabble, 2 times', w: 2, tone: 'bad' })
    const calm = planNotices(g, [...full, N('a', { w: 0, title: 'Squabble', tone: 'good' }), N('b', { w: 1, title: 'Squabble' })])
    expect(calm.merged[0]).toMatchObject({ w: 1, tone: 'good' })
  })

  it('writes the company line of a template for the titles that have one', () => {
    const loans = [100_000, 200_000, 300_000].map((a, i) => N(`l${i}`, { title: 'Emergency Loan', s: 'business', a }))
    const plan = planNotices(g, loans)
    expect(plan.keep.size).toBe(3) // three notices of weight 2 fit the room
    const folded = planNotices(g, [N('k', { w: 3 }), N('k2', { w: 3 }), N('k3', { w: 3 }), ...loans])
    expect(folded.merged).toHaveLength(1)
    expect(folded.merged[0]).toMatchObject({ id: 'l0', s: 'business', group: 'companies', title: `3 companies took emergency loans worth ${shortMoney(600_000)}`, text: '' })
    const noMoney = planNotices(g, [N('k', { w: 3 }), N('k2', { w: 3 }), N('k3', { w: 3 }), ...[1, 2].map((i) => N(`n${i}`, { title: 'Emergency Loan', s: 'business' }))])
    expect(noMoney.merged[0]!.title).toBe('2 companies took emergency loans')
  })

  it('has at most 6 templates, each for a title that is written in the source, and every line is plain and short', () => {
    const titles = Object.keys(MERGE_TEMPLATES)
    expect(titles.length).toBeGreaterThanOrEqual(1)
    expect(titles.length).toBeLessThanOrEqual(6)
    const all = sources(join(ROOT, 'src'))
    for (const title of titles) {
      expect(
        all.some((text) => literals(title).some((lit) => text.includes(lit))),
        `"${title}" is a string in src`,
      ).toBe(true)
      for (const [n, total] of [[2, undefined], [3, undefined], [3, 1_700_000], [12, 18_000_000_000], [40, -250_000]] as const) {
        const line = MERGE_TEMPLATES[title]!(n, total)
        expect(line.length, line).toBeGreaterThan(10)
        expect(line.length, line).toBeLessThanOrEqual(YEAR_LIMITS.story)
        expect(line, line).not.toMatch(DASHES)
        expect(unitFlags(line, 'log'), line).toEqual([])
        expect(line).toContain(String(n))
      }
    }
    expect(MERGE_TEMPLATES.constructor).toBe(Object) // inherited, not a title: planNotices must not call it
    const plan = planNotices(g, [N('a', { w: 0, title: 'constructor' }), N('b', { w: 0, title: 'constructor' })])
    expect(plan.merged[0]!.title).toBe('constructor, 2 times')
  })

  it('keeps the merged stories in the order of their first part', () => {
    const plan = planNotices(g, [N('a', { w: 0, title: 'Squabble' }), N('b', { w: 0, title: 'Oops' }), N('c', { w: 0, title: 'Squabble' }), N('d', { w: 0, title: 'Oops' })])
    expect(ids(plan.merged)).toEqual(['a', 'b'])
    expect(plan.merged.map((s) => s.title)).toEqual(['Squabble, 2 times', 'Oops, 2 times'])
  })

  it('gives the story of a kept notice the same shape (storyOf)', () => {
    const m = N('a', { title: 'Promotion', text: 'You got the job.', tone: 'good', a: 4_000, s: 'career' })
    expect(storyOf(m)).toEqual({ id: 'a', s: 'career', group: 'work', w: 2, a: 4_000, title: 'Promotion', text: 'You got the job.', tone: 'good' })
    const plain = storyOf(N('b', { title: 'Plain', text: 'It cost $3K.' }))
    expect(plain).toMatchObject({ a: 3_000, tone: 'neutral', group: 'body', w: 2 })
    // An amount outside the bound is not an amount: the largest figure of the text counts instead ("Text of c." has none).
    expect(storyOf(N('c', { a: 1e300, s: 'nobody' }))).toMatchObject({ a: 0, group: 'life' })
  })

  it('writes one log line for a folded story whose source has none this year, and none for one whose source has a line', () => {
    const merged = [S('a', { s: 'health', w: 1, tone: 'good', title: 'Checkup', text: 'All clear.' }), S('b', { s: 'career', w: 0, group: 'work' }), S('c', { s: 'education', group: 'work' })]
    const log = [L('l1', 'I saw the doctor.', { s: 'health' }), L('l2', 'I sat an exam.')]
    const lines = foldLogEntries(g, merged, log)
    expect(lines.map((e) => e.id)).toEqual([`fold-${g.generation}-${g.year}-b`, `fold-${g.generation}-${g.year}-c`])
    expect(lines[0]).toEqual({ id: `fold-${g.generation}-${g.year}-b`, text: 'Story b: Text of b.', tone: 'neutral', s: 'career', w: 0 })
    expect(lines[1]!.w).toBe(2)
    for (const e of lines) expect(e.text.length).toBeLessThanOrEqual(90)
    // A second pass, with the lines already in the log, adds nothing.
    expect(foldLogEntries(g, merged, [...log, ...lines])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
describe('planNotices: a noisy tycoon year', () => {
  it('keeps the life event and the two best of the rest, merges the three loans, folds the trivia', () => {
    const g = life()
    const queue: ModalItem[] = [
      N('sold', { title: 'Company Sold!', s: 'business', a: 25_000_000 }),
      N('l1', { title: 'Emergency Loan', s: 'business', a: 100_000 }),
      N('kind', { title: 'Kindness', s: 'events' }),
      N('l2', { title: 'Emergency Loan', s: 'business', a: 200_000 }),
      N('miss', { title: 'Missed Payment', s: 'finance', a: 1_000_000 }),
      N('adm', { title: 'Admirer', s: 'relationships' }),
      N('rogue', { title: 'Rogue CEO Caught', s: 'business', text: 'Your accountant found $2M of vanity projects.' }),
      N('l3', { title: 'Emergency Loan', s: 'business', a: 300_000 }),
      N('rc1', { title: 'Report Card', s: 'education' }),
      N('rc2', { title: 'Report Card', s: 'education' }),
      N('sq', { title: 'Squabble', s: 'relationships' }),
      N('oops', { title: 'Oops', s: 'events' }),
      N('wk', { title: 'Debt Collectors', s: 'finance', a: 5_000 }),
      N('ret', { title: 'Retired', s: 'career', a: 100 }),
    ]
    expect(queue).toHaveLength(14)
    const plan = planNotices(g, queue)
    expect([...plan.keep]).toEqual(['sold', 'miss', 'rogue'])
    expect(plan.fold).toHaveLength(11)
    // Three loans become one, two report cards become one.
    expect(plan.merged).toHaveLength(11 - 2 - 1)
    const titles = plan.merged.map((s) => s.title)
    expect(titles).toContain(`3 companies took emergency loans worth ${shortMoney(600_000)}`)
    expect(titles).toContain('Report Card, 2 times')
    expect(titles).not.toContain('Company Sold!')
    // Nothing is lost: every notice is kept or folded.
    expect([...plan.keep, ...ids(plan.fold)].sort()).toEqual(ids(queue).sort())
  })
})

// ---------------------------------------------------------------------------
describe('the year card', () => {
  it('names the top story, the next three, the money, the people, the news, and counts the rest by group', () => {
    const g = playLife({ seed: findSeed(() => true, { label: 'any life' }), birthYear: 1990, untilAge: 20 }).g
    const kept = [S('k1', { w: 3, a: 9_000, title: 'Just Married!', text: 'You said yes.', s: 'relationships', group: 'people' })]
    const folded = [
      S('f1', { w: 2, a: 5_000_000, title: 'Sold it', text: 'It went for $5M.', s: 'business', group: 'companies' }),
      S('f2', { w: 2, a: 1_000, title: 'Promotion', text: 'A raise.', s: 'career', group: 'work' }),
      S('f3', { w: 2, a: 10, title: 'Debt', text: 'Paid.', s: 'finance', group: 'money' }),
      S('f4', { w: 1, a: 0, title: 'Mom called', text: 'She misses you.', s: 'household', group: 'people' }),
      S('f5', { w: 1, a: 0, title: 'Dad called', text: 'He misses you.', s: 'household', group: 'people' }),
      S('f6', { w: 0, a: 0, title: 'Flu shot', text: 'Done.', s: 'health', group: 'body' }),
    ]
    const log = [L('n', '\u{1F4F0} 1999: Something happened far away.', { s: 'history', w: 0 }), L('x', 'I walked the dog.', { s: 'events', w: 0 })]
    const card = buildCard(g, kept, folded, log)
    expect(card.v).toBe(1)
    expect(card.year).toBe(g.year)
    expect(card.age).toBe(g.character.age)
    expect(card.head).toBe('You said yes.')
    expect(card.stories).toEqual(['Sold it: It went for $5M.', 'Promotion: A raise.', 'Debt: Paid.'])
    expect(card.world).toBe('1999: Something happened far away.')
    expect(card.money).toBe(moneyLine(moneyFacts(g)!))
    expect(card.people).toEqual(['Mom called: She misses you.', 'Dad called: He misses you.'])
    expect(card.groups.map((x) => x.k)).toEqual(['body', 'life'])
    expect(card.groups).toEqual([
      { k: 'body', n: 1, lines: ['Flu shot: Done.'] },
      { k: 'life', n: 1, lines: ['I walked the dog.'] },
    ])
    expect('inline' in card).toBe(false)
    expect(JSON.parse(JSON.stringify(card))).toEqual(card)
  })

  it('shows at most eight lines: people are trimmed first, then the stories', () => {
    const g = playLife({ seed: findSeed(() => true, { label: 'any life' }), birthYear: 1990, untilAge: 20 }).g
    const folded = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => S(`s${n}`, { a: 100 - n, group: n > 4 ? 'people' : 'work', s: n > 4 ? 'household' : 'career' }))
    const log = [L('n', '\u{1F4F0} 1999: News.', { s: 'history', w: 0 })]
    const card = buildCard(g, [], folded, log)
    expect(card.money).toBeDefined()
    expect(card.world).toBeDefined()
    expect(card.stories).toHaveLength(3)
    expect(card.people).toHaveLength(2)
    const lines = 1 + card.stories.length + 1 + (card.people?.length ?? 0) + 1
    expect(lines).toBe(8)
    // The trimmed person is counted in a group, not lost: eight stories, one head, three stories, two people, two left over.
    expect(card.groups).toEqual([{ k: 'people', n: 2, lines: ['Story s7: Text of s7.', 'Story s8: Text of s8.'] }])
  })

  it('leaves out the people, the money and the news when there are none', () => {
    const g = life()
    delete g.flags.lifeSeries
    const card = buildCard(g, [], [S('a')], [])
    expect(card.head).toBe('Text of a.')
    expect(card.stories).toEqual([])
    expect('people' in card).toBe(false)
    expect('world' in card).toBe(false)
    expect('money' in card).toBe(false)
    expect(card.groups).toEqual([])
  })

  it('falls back to the top log line by weight, then to the culture line, then to a plain line', () => {
    const g = life(1985)
    const log = [
      L('a', 'I painted a fence.', { s: 'events', w: 1 }),
      L('b', 'I lost my job.', { s: 'career', w: 3 }),
      L('c', 'I found a coin.', { s: 'events', w: 2 }),
      L('d', 'I walked.', { s: 'events', w: 0 }),
      L('e', '\u{1F4C5} 1985: culture and prices.', { s: 'digest' }),
      L('fold-1-1985-z', 'I paid the rent.', { s: 'career', w: 3 }),
    ]
    const withLines = buildCard(g, [], [], log)
    expect(withLines.head).toBe('I lost my job.')
    // The head line is not counted again; a fold line is a copy of a story, so it is never a line of its own.
    expect(withLines.groups.map((x) => [x.k, x.n])).toEqual([['world', 1], ['life', 3]])
    const culture = cultureOf(1985)
    expect(culture.length).toBeGreaterThan(10)
    const fromCulture = buildCard(g, [], [], []).head
    expect(fromCulture.length).toBeLessThanOrEqual(90)
    expect(culture.startsWith(fromCulture.replace(/\.\.\.$/, ''))).toBe(true)
    const far = life()
    far.year = 2600
    const plain = buildCard(far, [], [], [])
    expect(plain.head).toMatch(/quiet year/i)
    expect(plain.head).toContain(String(plain.age))
  })

  it('counts a group line for every remaining story and log line, in display order, six lines at most, none a duplicate', () => {
    const g = life()
    const folded = Array.from({ length: 9 }, (_, i) => S(`s${i}`, { group: 'companies', s: 'business', w: 1, a: i, title: `Deal ${i}`, text: `Closed ${i}.` }))
    const log = [
      L('l1', 'I signed a lease.', { s: 'business', w: 1 }),
      L('l2', 'Deal 0: Closed 0.', { s: 'business', w: 1 }), // the same words as a story: counted once
      L('l3', 'I met a neighbor.'),
      L('l4', 'x'.repeat(200), { s: 'health', w: 1 }),
    ]
    const card = buildCard(g, [], folded, log)
    expect(card.groups.map((x) => x.k)).toEqual(['body', 'companies', 'life'])
    const companies = card.groups.find((x) => x.k === 'companies')!
    // head takes the top story, stories the next three, so five stories and one log line remain here.
    expect(companies.n).toBe(5 + 1)
    expect(companies.lines.length).toBeLessThanOrEqual(YEAR_LIMITS.groupLines)
    const body = card.groups.find((x) => x.k === 'body')!
    expect(body.lines[0]!.length).toBeLessThanOrEqual(YEAR_LIMITS.group)
    expect(card.groups.find((x) => x.k === 'life')).toEqual({ k: 'life', n: 1, lines: ['I met a neighbor.'] })
  })

  it('counts every story exactly once: nothing is lost on the card', () => {
    const g = life()
    const kept = [S('a', { w: 3 }), S('b', { group: 'people', s: 'household' })]
    const folded = Array.from({ length: 10 }, (_, i) => S(`f${i}`, { w: (i % 3) as LogWeight, group: i % 2 ? 'money' : 'people', s: i % 2 ? 'finance' : 'household' }))
    const card = buildCard(g, kept, folded, [])
    const shown = 1 + card.stories.length + (card.people?.length ?? 0)
    expect(shown + card.groups.reduce((t, x) => t + x.n, 0)).toBe(kept.length + folded.length)
  })

  it('reads only this year and the years before it: a card never shows money from a year after g.year', () => {
    const g = life()
    g.flags.lifeSeries = { v: 1, id: g.lifeId, rows: [[10, 2010, 100, 50, 0, 10, 50, 50], [11, 2011, 300, 60, 0, 20, 50, 50], [12, 2050, 99_999_999, 1, 0, 1, 50, 50]] } as never
    g.year = 2011
    const facts = moneyFacts(g)!
    expect(facts).toMatchObject({ netWorth: 300, delta: 200, income: 20 })
    g.year = 2005
    expect(moneyFacts(g)).toBeNull()
    expect('money' in buildCard(g, [], [S('a')], [])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('the headline: one plain line, the story itself', () => {
  const YEAR = 2027
  /** The text the milestones popup writes (business/milestones.ts announce): the year, a line, then one line for each milestone. */
  const MILESTONES = `${YEAR}: A big day at the office.\n\u{1F4B0} Harbor Fashion: $1M in yearly sales`

  it('reads the Milestones popup as its story: no title, no colon, no year of the card, no emoji', () => {
    const g = life(YEAR)
    const st = storyOf(N('m', { title: 'Milestones!', s: 'business', tone: 'good', text: MILESTONES }))
    const want = 'A big day at the office. Harbor Fashion: $1M in yearly sales'
    expect(headlineOf(st, YEAR)).toBe(want)
    // As a kept popup and as a folded one, and through the planner the close uses.
    expect(buildCard(g, [st], [], []).head).toBe(want)
    expect(buildCard(g, [], [st], []).head).toBe(want)
    for (const w of [0, 2] as const) {
      const popup = N('m', { title: 'Milestones!', s: 'business', tone: 'good', text: MILESTONES, w })
      const plan = planNotices(g, [popup])
      const kept = plan.keep.has('m') ? [storyOf(popup)] : []
      expect(buildCard(g, kept, plan.merged, []).head, `weight ${w}`).toBe(want)
    }
  })

  it('never leaks "Title:" or "!:" into the headline, and keeps it one line of at most 90 characters', () => {
    const g = life(YEAR)
    const titles = ['Milestones!', 'Just Married!', 'You Won!!', 'Heads Up! Wait', 'Promotion', 'Big News', `T ${'word '.repeat(40)}`]
    const texts = [MILESTONES, 'You said yes.', '', `${YEAR}:   ${'word '.repeat(60)}`, '\u{1F389} It happened.\n\nTwice.', `${YEAR}: `, `   ${YEAR}:   ${YEAR} sales rose.`]
    let heads = 0
    for (const title of titles) {
      for (const text of texts) {
        const st = storyOf(N('x', { title, text, s: 'business' }))
        for (const card of [buildCard(g, [st], [], []), buildCard(g, [], [st], [])]) {
          const why = `${JSON.stringify(title.slice(0, 20))} ${JSON.stringify(text.slice(0, 20))}`
          expect(card.head, why).not.toContain(`${title}:`)
          expect(card.head, why).not.toContain(`${st.title}:`)
          expect(card.head, why).not.toMatch(/!:/)
          expect(card.head, why).not.toMatch(/!\s*$/)
          expect(card.head, why).not.toMatch(new RegExp(`^${YEAR}\\s*:`))
          expect(card.head, why).not.toMatch(/[\n\p{Extended_Pictographic}]/u)
          expect(card.head.length, why).toBeGreaterThan(0)
          expect(card.head.length, why).toBeLessThanOrEqual(YEAR_LIMITS.head)
          heads++
        }
      }
    }
    expect(heads).toBe(titles.length * texts.length * 2)
  })

  it('says a title alone without its exclamation mark, and the year of another year as it is', () => {
    const g = life(YEAR)
    expect(buildCard(g, [], [storyOf(N('a', { title: 'Just Married!', text: '' }))], []).head).toBe('Just Married')
    expect(headlineOf(storyOf(N('a', { title: 'News', text: '1999: Something happened far away.' })), YEAR)).toBe('1999: Something happened far away.')
    expect(headlineOf(storyOf(N('a', { title: 'News', text: `${YEAR} sales rose.` })), YEAR)).toBe(`${YEAR} sales rose.`)
  })

  it('tells a merged story by its own title, with the total as a second sentence', () => {
    const g = life(YEAR)
    const full = [N('k1', { w: 3 }), N('k2', { w: 3 }), N('k3', { w: 3 })]
    const plan = planNotices(g, [...full, N('a', { title: 'Kindness!', s: 'events', w: 1, a: 100 }), N('b', { title: 'Kindness!', s: 'events', w: 1, a: 1_200_250 })])
    expect(plan.merged).toHaveLength(1)
    expect(buildCard(g, [], plan.merged, []).head).toBe(`Kindness, 2 times. ${shortMoney(1_200_350)} in all.`)
    const loans = planNotices(g, [...full, ...[1, 2].map((i) => N(`l${i}`, { title: 'Emergency Loan', s: 'business' }))])
    expect(buildCard(g, [], loans.merged, []).head).toBe('2 companies took emergency loans')
  })

  it('does not count the headline again as a line of a group', () => {
    const g = life(YEAR)
    const st = storyOf(N('a', { title: 'Milestones!', s: 'business', text: `${YEAR}: Sales passed the mark.` }))
    const card = buildCard(g, [st], [], [L('x', 'Sales passed the mark.', { s: 'business', w: 2 }), L('y', 'I walked the dog.', { s: 'events', w: 0 })])
    expect(card.head).toBe('Sales passed the mark.')
    expect(card.groups).toEqual([{ k: 'life', n: 1, lines: ['I walked the dog.'] }])
  })

  it('leaves the story lines as they were: "title: text" is still how a story is listed', () => {
    const st = storyOf(N('a', { title: 'Promotion', text: 'A raise.' }))
    expect(storyLine(st)).toBe('Promotion: A raise.')
    expect(headlineOf(st, YEAR)).toBe('A raise.')
  })
})

// ---------------------------------------------------------------------------
describe('the money line', () => {
  it('has no row to read at birth, and then follows the life series', () => {
    const g = life()
    delete g.flags.lifeSeries
    expect(moneyFacts(g)).toBeNull()
  })

  it('writes the net worth, the move, the income and the cash in at most 90 characters', () => {
    const f = { cash: 8_400_000, netWorth: 52_300_000, delta: 4_100_000, income: 1_200_000 }
    expect(moneyLine(f)).toBe(`Net worth ${shortMoney(52_300_000)} (up ${shortMoney(4_100_000)}). Income ${shortMoney(1_200_000)}. Cash ${shortMoney(8_400_000)}.`)
    expect(moneyLine({ ...f, delta: -4_100_000 })).toContain(`(down ${shortMoney(4_100_000)})`)
    expect(moneyLine({ ...f, delta: 0 })).toBe(`Net worth ${shortMoney(52_300_000)}. Income ${shortMoney(1_200_000)}. Cash ${shortMoney(8_400_000)}.`)
    expect(moneyLine({ cash: -300, netWorth: -12_000, delta: -300, income: 0 })).toContain('Cash')
  })

  it('stays within 90 characters and under every voice cap for any figure, and plain for the usual ones', () => {
    const r = prng(7)
    for (let i = 0; i < 300; i++) {
      const mag = 10 ** Math.floor(r() * 30)
      const pick = () => Math.round((r() * 2 - 0.5) * mag)
      const line = moneyLine({ cash: pick(), netWorth: pick(), delta: pick(), income: pick() })
      expect(line.length, line).toBeLessThanOrEqual(90)
      expect(unitFlags(line, 'log'), line).not.toContain('over-cap')
      expect(line, line).not.toMatch(DASHES)
      expect(line).toMatch(/^Net worth /)
    }
    for (const f of [
      { cash: 8_400_000, netWorth: 52_300_000, delta: 4_100_000, income: 1_200_000 },
      { cash: 1_200, netWorth: 9_800, delta: 400, income: 31_000 },
      { cash: 4_000_000_000, netWorth: 132_400_000_000, delta: -12_400_000_000, income: 4_100_000_000 },
    ]) {
      const line = moneyLine(f)
      expect(unitFlags(line, 'log'), line).toEqual([])
    }
  })

  it('reads the cash from the books on 5 seeded lives, every year, and the rest from the life series', () => {
    const seeds = findSeeds(() => true, 5, { label: 'five lives' })
    let years = 0
    for (const seed of seeds) {
      playLife({
        seed,
        birthYear: 1995,
        untilAge: 30,
        onYear: (g) => {
          if (g.character.age < 1) return
          const f = moneyFacts(g)
          expect(f, `seed ${seed} age ${g.character.age}`).not.toBeNull()
          years++
          expect(f!.cash).toBe(acctBalance(g, playerAcct(g)))
          // In a played life the books and the wallet are the same money, so the line says what the player holds.
          expect(f!.cash).toBe(Math.round(g.character.money))
          const rows = readLifeSeries(g)
          const last = rows[rows.length - 1]!
          expect(f!.netWorth).toBe(last[2])
          expect(f!.income).toBe(last[5])
          expect(f!.delta).toBe(rows.length > 1 ? last[2] - rows[rows.length - 2]![2] : 0)
          expect(moneyLine(f!)).toContain(shortMoney(f!.cash))
        },
      })
    }
    expect(years).toBeGreaterThan(50)
  })

  it('reads a frozen game without writing', () => {
    const frozen = deepFreeze(structuredClone(life()))
    const before = JSON.stringify(frozen)
    moneyFacts(frozen)
    buildCard(frozen, [], [S('a')], [L('l', 'I did a thing.')])
    expect(JSON.stringify(frozen)).toBe(before)
  })
})

// ---------------------------------------------------------------------------
describe('the planner is pure and plain', () => {
  it('draws nothing and writes nothing: a frozen game, a plan and a card, the same state after', () => {
    const g = playLife({ seed: findSeed(() => true, { label: 'any life' }), birthYear: 2000, untilAge: 12 }).g
    ageUp(g)
    const frozen = deepFreeze(structuredClone(g))
    const before = JSON.stringify(frozen)
    const plan = planNotices(frozen, frozen.queue)
    const kept = frozen.queue.filter((m): m is NoticeModal => m.kind === 'notice' && plan.keep.has(m.id)).map(storyOf)
    const card = buildCard(frozen, kept, plan.merged, frozen.log[frozen.log.length - 1]?.entries ?? [])
    foldLogEntries(frozen, plan.merged, frozen.log[frozen.log.length - 1]?.entries ?? [])
    expect(card.head.length).toBeGreaterThan(0)
    expect(frozen.rng).toBe(g.rng)
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('plans a real year from a seeded life', () => {
    const g = playLife({ seed: findSeed(() => true, { label: 'any life' }), birthYear: 2000, untilAge: 20 }).g
    for (let i = 0; i < 3; i++) ageUp(g)
    const plan = planNotices(g, g.queue)
    const inPlay = g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.s !== undefined && !m.support)
    expect(plan.keep.size + plan.fold.length).toBe(inPlay.length)
  })

  it('has no en dash or em dash anywhere in the file', () => {
    const text = readFileSync(join(ROOT, 'src', 'game', 'hubs', 'year-plan.ts'), 'utf8')
    expect(text).not.toMatch(DASHES)
  })
})

// ---------------------------------------------------------------------------
describe('property loop: 200 random queues', () => {
  const SOURCES = ['health', 'career', 'business', 'finance', 'relationships', 'events', 'education', 'crime', 'history', 'knowledge.core', 'nobody']
  const TITLES = [
    'Admirer', 'Kindness', 'Report Card', 'Promotion', 'Divorce', 'Company Sold!', 'Emergency Loan', 'New Investor', 'Ready for Wall Street?',
    'No Longer Yours', 'CEO Poached', 'Rogue CEO Caught', 'Missed Payment', 'Unknown One', 'Unknown Two',
  ]
  const TONES: (Tone | undefined)[] = [undefined, 'good', 'bad', 'neutral', 'event']
  const TEXTS = ['Nothing much.', 'You got $12,500.', 'The doctor called.', 'It cost $2.5M.', 'A long day. '.repeat(30), '  spaced\n\nout  ']

  function randomQueue(r: () => number): ModalItem[] {
    const n = Math.floor(r() * 18)
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!
    const out: ModalItem[] = []
    for (let i = 0; i < n; i++) {
      const id = `m${i}`
      const roll = r()
      if (roll < 0.62) {
        const extra: Partial<NoticeModal> = { title: pick(TITLES), text: pick(TEXTS), s: r() < 0.9 ? pick(SOURCES) : undefined }
        const tone = pick(TONES)
        if (tone) extra.tone = tone
        if (r() < 0.3) extra.w = pick([0, 1, 2, 3] as const)
        if (r() < 0.4) extra.a = Math.round((r() - 0.3) * 10 ** Math.floor(r() * 9))
        if (r() < 0.05) extra.support = true
        out.push(N(id, extra))
      } else if (roll < 0.8) out.push(C(id, { s: r() < 0.8 ? pick(SOURCES) : undefined }))
      else if (roll < 0.9) out.push(T(id))
      else if (roll < 0.95) out.push({ kind: 'minigame', id, game: 'slots', title: 'Slots', scriptId: 'none', data: {} })
      else out.push({ kind: 'input', id, title: 'Name', text: '', placeholder: '', scriptId: 'none' } as unknown as ModalItem)
    }
    return out
  }

  const inPlay = (m: ModalItem): m is NoticeModal => m.kind === 'notice' && m.s !== undefined && /^[a-z][a-zA-Z0-9.]*$/.test(m.s) && !m.support

  it('keeps the contract on every queue: nothing lost, every weight 3 kept, no fold before a choice, the card at most 8 lines, every string capped', () => {
    const g = life(1990)
    const r = prng(20261022)
    for (let round = 0; round < 200; round++) {
      const queue = randomQueue(r)
      const frozen = deepFreeze(structuredClone(queue))
      const plan = planNotices(g, frozen)
      const again = planNotices(g, frozen)
      expect([[...plan.keep], plan.fold, plan.merged], `round ${round} is a pure function`).toEqual([[...again.keep], again.fold, again.merged])

      const play = queue.filter(inPlay)
      const untouched = queue.filter((m) => !inPlay(m))
      const foldedIds = ids(plan.fold)
      // Nothing is lost: kept + folded + untouched = input, and the three are disjoint.
      expect([...plan.keep, ...foldedIds, ...ids(untouched)].sort(), `round ${round}`).toEqual(ids(queue).sort())
      for (const id of plan.keep) expect(foldedIds).not.toContain(id)
      expect([...plan.keep].every((id) => play.some((m) => m.id === id))).toBe(true)
      // Weight 3 is never folded.
      for (const m of play) if (noticeWeight(m) === 3) expect(plan.keep.has(m.id), `round ${round} ${m.id}`).toBe(true)
      // No notice before its choice is folded.
      queue.forEach((m, i) => {
        const next = queue[i + 1]
        if (inPlay(m) && next && next.kind === 'choice' && next.s === m.s) expect(plan.keep.has(m.id), `round ${round} ${m.id}`).toBe(true)
      })
      // Room: the fill never passes the cap; only weight 3 and context can.
      const isContext = (m: NoticeModal): boolean => {
        const next = queue[queue.indexOf(m) + 1]
        return next?.kind === 'choice' && next.s === m.s
      }
      const must = play.filter((m) => noticeWeight(m) === 3 || isContext(m)).length
      expect(plan.keep.size).toBeLessThanOrEqual(Math.max(YEAR_LIMITS.noticesMax, must))
      // A kept notice under weight 2 is only ever context for a choice.
      for (const m of play) if (plan.keep.has(m.id) && noticeWeight(m) < 2) expect(isContext(m), `round ${round} ${m.id}`).toBe(true)
      // The merged list is the folded list with equal (source, title) pairs joined, in the order of the first part.
      const keys: string[] = []
      for (const st of plan.fold) {
        const key = `${st.s}|${st.title}`
        if (!keys.includes(key)) keys.push(key)
      }
      expect(plan.merged.length).toBe(keys.length)
      expect(ids(plan.merged)).toEqual(keys.map((k) => plan.fold.find((st) => `${st.s}|${st.title}` === k)!.id))
      for (const st of [...plan.fold, ...plan.merged]) {
        expect(st.title.length).toBeLessThanOrEqual(90)
        expect(st.text.length).toBeLessThanOrEqual(90)
        expect(storyLine(st).length).toBeLessThanOrEqual(90)
        expect(Number.isFinite(st.a)).toBe(true)
        expect(Math.abs(st.a)).toBeLessThanOrEqual(LOG_AMOUNT_MAX)
      }

      // The card.
      const kept = play.filter((m) => plan.keep.has(m.id)).map(storyOf)
      const logLines: LogEntry[] = []
      const count = Math.floor(r() * 14)
      for (let i = 0; i < count; i++) {
        logLines.push(L(`e${i}`, r() < 0.1 ? '\u{1F4F0} 1989: News of the year.' : `I did thing ${i}. ${'x'.repeat(Math.floor(r() * 130))}`, { s: r() < 0.7 ? SOURCES[Math.floor(r() * SOURCES.length)]! : undefined, ...(r() < 0.6 ? { w: (Math.floor(r() * 4)) as LogWeight } : {}) }))
      }
      const card = buildCard(g, kept, plan.merged, logLines)
      const shownLines = 1 + card.stories.length + (card.money ? 1 : 0) + (card.people?.length ?? 0) + (card.world ? 1 : 0)
      expect(shownLines, `round ${round}`).toBeLessThanOrEqual(YEAR_LIMITS.lines)
      expect(card.head.length).toBeLessThanOrEqual(YEAR_LIMITS.head)
      expect(card.head.length).toBeGreaterThan(0)
      expect(card.stories.length).toBeLessThanOrEqual(YEAR_LIMITS.stories)
      expect((card.people?.length ?? 0)).toBeLessThanOrEqual(YEAR_LIMITS.people)
      for (const line of [...card.stories, ...(card.people ?? []), ...(card.money ? [card.money] : []), ...(card.world ? [card.world] : [])]) {
        expect(line.length).toBeLessThanOrEqual(YEAR_LIMITS.story)
        expect(line).not.toMatch(/\n/)
      }
      let last = -1
      for (const grp of card.groups) {
        const at = YEAR_GROUP_ORDER.indexOf(grp.k)
        expect(at).toBeGreaterThan(last)
        last = at
        expect(grp.n).toBeGreaterThanOrEqual(1)
        expect(grp.lines.length).toBeLessThanOrEqual(YEAR_LIMITS.groupLines)
        expect(grp.lines.length).toBeLessThanOrEqual(grp.n)
        for (const line of grp.lines) expect(line.length).toBeLessThanOrEqual(YEAR_LIMITS.group)
      }
      const card2 = buildCard(g, kept, plan.merged, logLines)
      expect(card2).toEqual(card)
      expect(JSON.parse(JSON.stringify(card))).toEqual(card)
      // With no log lines, every story is on the card once: the head, the stories, the people, or a group count.
      const bare = buildCard(g, kept, plan.merged, [])
      const stories = kept.length + plan.merged.length
      if (stories > 0) expect(1 + bare.stories.length + (bare.people?.length ?? 0) + bare.groups.reduce((t, x) => t + x.n, 0)).toBe(stories)
      for (const key of Object.keys(card as YearCard)) expect(['v', 'year', 'age', 'head', 'stories', 'money', 'people', 'world', 'groups']).toContain(key)
    }
  })
})
