// R3-Q2 (E.D1 b): the 120-title weight table. src/game/notice-weights.ts gives a notice title a year weight: 0 trivia, 1 routine,
// 2 notable, 3 life-changing. notice() stamps it as `w`, and the year close (R3-Q3, R3-Q4) folds the low ones into the card and
// keeps the high ones as popups. The titles were picked from a counting probe of the notices that arrive on their own
// (test/notice-title-probe.test.ts, opt-in, fixture test/fixtures/notice-titles.json), and this file keeps the table and the
// fixture in step: the size, the coverage, the weights that must not drop below 2, the reviewed list of weight 3, and a title
// that is still written in the source. The rubric each weight follows is in the header of notice-weights.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { notice } from '../src/game/core'
import { createNewLife } from '../src/game/life'
import { MINOR_NOTICE_TITLES, NOTICE_WEIGHTS, noticeWeightFor, noticeWeightOf } from '../src/game/notice-weights'
import type { NoticeModal } from '../src/game/types'
import type { TitleFile } from './notice-title-probe.test'
import { findSeed } from './seed-kit'

const ROOT = join(__dirname, '..')
const fixture = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'notice-titles.json'), 'utf8')) as TitleFile

/** The weight 3 titles, reviewed by hand: a death, a birth, a wedding, a split, a diagnosis, a crime and its sentence, a collapse, a windfall, a public vote. A title joins this list on purpose, with a reason in the commit. */
const LIFE_CHANGING: readonly string[] = [
  'Arrested',
  'Bankrupt',
  'Company Sold!',
  'Death Row',
  'Diagnosis',
  'Divorce',
  'Evicted!',
  'Final Appeal Denied',
  'Free at Last',
  'Guilty',
  'IPO Day!',
  'Just Married!',
  'Locked Up',
  'Plea Accepted',
  'Pregnant!',
  'Sentence Commuted',
]

const MIN_TITLES = 120
/** The share of the notices that arrive by themselves (the ones the year close folds) that the table must weigh. */
const MIN_PASSIVE_COVERAGE = 0.85
/** The share of all notices, answers included. The long tail is hundreds of small outcomes, each seen a few times, so this only guards against the table shrinking. */
const MIN_COVERAGE = 0.35

/** Every .ts and .tsx source under a folder, as text, except the weight table itself (it names every title, so it proves nothing). */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.tsx?$/.test(name) && name !== 'notice-weights.ts') out.push(readFileSync(path, 'utf8'))
  }
  return out
}

/** The ways a title can sit in source as a string literal: quoted with ', " or `, with that quote escaped. */
function literals(title: string): string[] {
  return ["'", '"', '`'].map((q) => `${q}${title.replace(/\\/g, '\\\\').split(q).join(`\\${q}`)}${q}`)
}

function queued(title: string): NoticeModal {
  const g = createNewLife({ seed: findSeed(() => true, { label: 'any life' }), year: 2000 })
  g.queue = []
  notice(g, title, 'x')
  expect(g.queue).toHaveLength(1)
  return g.queue[0] as NoticeModal
}

const titles = Object.keys(NOTICE_WEIGHTS)
const rowOf = new Map(fixture.rows.map((r) => [r.title, r]))

describe('the title probe fixture', () => {
  it('parses: 24 ordinary, 6 rich and 4 founder lives, rows by count, unique titles', () => {
    expect(fixture.v).toBe(1)
    expect(fixture.untilAge).toBe(85)
    expect(fixture.seeds.ordinary).toHaveLength(24)
    expect(fixture.seeds.rich).toHaveLength(6)
    expect(fixture.seeds.founder).toHaveLength(4)
    expect(fixture.rows.length).toBeGreaterThan(MIN_TITLES)
    expect(fixture.titles).toBeGreaterThanOrEqual(fixture.rows.length)
    const counts = fixture.rows.map((r) => r.count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(new Set(fixture.rows.map((r) => r.title)).size).toBe(fixture.rows.length)
    const seen = counts.reduce((a, b) => a + b, 0)
    expect(seen).toBeLessThanOrEqual(fixture.notices)
    for (const r of fixture.rows) {
      expect(Number.isInteger(r.count) && r.count > 0, r.title).toBe(true)
      expect(r.bad, r.title).toBeLessThanOrEqual(r.count)
      expect(r.blocked, r.title).toBeLessThanOrEqual(r.count)
      expect(r.title + r.sample, r.title).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

describe('NOTICE_WEIGHTS', () => {
  it('has at least 120 titles, each a plain string with a weight of 0 to 3, and is frozen', () => {
    expect(titles.length).toBeGreaterThanOrEqual(MIN_TITLES)
    expect(Object.isFrozen(NOTICE_WEIGHTS)).toBe(true)
    for (const title of titles) {
      expect(title.trim(), JSON.stringify(title)).toBe(title)
      expect(title.length, title).toBeGreaterThan(0)
      expect([0, 1, 2, 3], title).toContain(NOTICE_WEIGHTS[title])
      expect(title, title).not.toMatch(/[\u2013\u2014]/)
    }
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('uses every weight, so the rubric is not one number', () => {
    for (const w of [0, 1, 2, 3] as const) {
      const n = titles.filter((t) => NOTICE_WEIGHTS[t] === w).length
      expect(n, `weight ${w}`).toBeGreaterThanOrEqual(w === 0 ? 5 : 10)
    }
  })

  it('names only titles that are a string literal somewhere in src/', () => {
    const files = sources(join(ROOT, 'src'))
    const missing = titles.filter((title) => !files.some((text) => literals(title).some((lit) => text.includes(lit))))
    expect(missing).toEqual([])
  })

  it('is picked from the probe: at least 100 of its titles are titles that arrived', () => {
    expect(titles.filter((t) => rowOf.has(t)).length).toBeGreaterThanOrEqual(100)
  })

  it('covers at least 85% of the notices that arrive by themselves, and a guard share of all of them', () => {
    const weighed = fixture.rows.filter((r) => noticeWeightOf(r.title) !== undefined)
    expect(weighed.reduce((n, r) => n + r.passive, 0) / fixture.passiveNotices).toBeGreaterThanOrEqual(MIN_PASSIVE_COVERAGE)
    expect(weighed.reduce((n, r) => n + r.count, 0) / fixture.notices).toBeGreaterThanOrEqual(MIN_COVERAGE)
  })

  it('weighs every routine-news title (R1) 1 or less', () => {
    for (const title of MINOR_NOTICE_TITLES) expect(NOTICE_WEIGHTS[title], title).toBeLessThanOrEqual(1)
  })

  // The R1 routine titles are exempt from the next two: the table keeps them at 1 (their notices carry weight minor), and the
  // planner (R3-Q3) raises one blocked or bad-tone notice of them to 2 instead of the whole title, e.g. a report card with a failing grade.
  it('never weighs a title below 2 when a notice with it was blocked by the never-route policy', () => {
    for (const r of fixture.rows) {
      const w = noticeWeightOf(r.title)
      if (w === undefined || MINOR_NOTICE_TITLES.has(r.title)) continue
      // The sample of the first notice, as the R1 policy saw it, and then any other notice of the title that the policy blocked.
      if (r.never !== null) expect(w, `${r.title} (sample blocked: ${r.never})`).toBeGreaterThanOrEqual(2)
      if (r.blocked > 0) expect(w, `${r.title} (${r.blocked} blocked)`).toBeGreaterThanOrEqual(2)
    }
  })

  it('never weighs a bad-tone title below 2', () => {
    for (const r of fixture.rows) {
      const w = noticeWeightOf(r.title)
      if (w === undefined || MINOR_NOTICE_TITLES.has(r.title)) continue
      if (r.tone === 'bad' || r.bad > 0) expect(w, `${r.title} (${r.bad} bad)`).toBeGreaterThanOrEqual(2)
    }
  })

  it('has the reviewed list of weight 3 titles and no other', () => {
    const three = titles.filter((t) => NOTICE_WEIGHTS[t] === 3).sort()
    expect(three).toEqual([...LIFE_CHANGING].sort())
  })

  it('does not know a title that is not in it, nor a property name of Object', () => {
    for (const title of ['not a title', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(noticeWeightOf(title), title).toBeUndefined()
    }
  })
})

describe('notice() and the table', () => {
  it('stamps the table weight on a popup with each of the titles, and leaves weight minor to the ten R1 titles', () => {
    for (const title of titles) {
      const m = queued(title)
      expect(m.w, title).toBe(NOTICE_WEIGHTS[title])
      if (MINOR_NOTICE_TITLES.has(title)) expect(m.weight, title).toBe('minor')
      else expect('weight' in m, title).toBe(false)
      expect(noticeWeightFor(title) === 'minor', title).toBe(MINOR_NOTICE_TITLES.has(title))
    }
  })

  it('leaves a title that is not in the table without a w key', () => {
    expect('w' in queued('A title nobody has ever used')).toBe(false)
  })
})
