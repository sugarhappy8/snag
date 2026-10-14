// Part A (A5): a hired CEO's yearly letter is short and sounds like the manager who wrote it. Every
// bullet is one action in 12 words or fewer, with no colon join and with its numbers kept, and each
// style signs the first cut, opening or build with a coda of its own: never more than one a letter,
// picked from the year and the company, never from the RNG.
import { beforeAll, describe, expect, it } from 'vitest'
import { hasColonJoin } from '../scripts/voice/rules.mjs'
import { boardOf } from '../src/game/business/board-state'
import { askingSalary, becomeCeo, ceoLetter, MEMO_LINES, STYLE_INFO, stepDown } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, type BizState, type CeoStyle } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import { bundleCeoLetters, yearlyBusinessImpl } from '../src/game/business/yearly'
import { notice } from '../src/game/core'
import type { Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState, NoticeModal } from '../src/game/types'
import { getCountry } from '../src/game/world'

const STYLES: readonly CeoStyle[] = ['grower', 'costCutter', 'steady', 'visionary']

/** Words in a bullet: runs of non-space ("$60,000" and "Front-of-House" are one word each). */
function words(line: string): number {
  return line.trim().split(/\s+/).length
}

interface Case {
  label: string
  industry: Industry
  countryId: string
  skill: number
  cash: number
  /** Sites at the start, all in the biggest city (one for studios and deep tech). */
  sites: number
  /** What the case needs on top of a plain company. */
  setup?: (b: BizState) => void
}

/** Two bookkeepers who cost far more than they bring in: a smart CEO lets them go. */
function deadweight(b: BizState): void {
  for (const [i, [firstName, lastName]] of [['Rex', 'Idle'], ['Max', 'Slack']].entries()) {
    b.staff.push({ id: `dead${i}`, firstName, lastName, gender: 'male', age: 50, role: 'Bookkeeper', focus: 'finance', skill: 5, salary: 400_000, trait: 'steady', morale: 70, years: 3 })
  }
}

/** Dear debt and a cash mandate: the CEO repays and pays a dividend (outside investors own 40%). */
function cashMandate(b: BizState): void {
  b.debt = 600_000
  b.debtRate = 0.12
  b.share = 0.6
  boardOf(b).mandate = 'cash'
}

const CASES: readonly Case[] = [
  { label: 'restaurants, skill 88', industry: 'restaurant', countryId: 'us', skill: 88, cash: 1_500_000, sites: 6 },
  { label: 'bakeries, skill 95', industry: 'bakery', countryId: 'fr', skill: 95, cash: 3_000_000, sites: 6 },
  { label: 'restaurants, skill 100', industry: 'restaurant', countryId: 'us', skill: 100, cash: 2_000_000, sites: 6 },
  { label: 'restaurants with deadweight, skill 88', industry: 'restaurant', countryId: 'us', skill: 88, cash: 400_000, sites: 6, setup: deadweight },
  { label: 'bakeries with debt on a cash mandate, skill 85', industry: 'bakery', countryId: 'fr', skill: 85, cash: 5_000_000, sites: 6, setup: cashMandate },
  { label: 'bakeries, skill 60', industry: 'bakery', countryId: 'fr', skill: 60, cash: 1_500_000, sites: 6 },
  { label: 'a game studio, skill 88', industry: 'gameStudio', countryId: 'us', skill: 88, cash: 20_000_000, sites: 1 },
  { label: 'a chip designer, skill 85', industry: 'semiconductor', countryId: 'tw', skill: 85, cash: 50_000_000, sites: 1 },
  { label: 'a chip designer short of cash, skill 85', industry: 'semiconductor', countryId: 'tw', skill: 85, cash: 1_500_000, sites: 1 },
]

/** A company just handed to a hired CEO of this style, before its first year under them. */
function company(c: Case, style: CeoStyle, seed: number): { g: GameState; a: Asset } {
  const g = createNewLife({ seed, year: 1990, countryId: c.countryId })
  g.queue = []
  g.character.age = 36
  g.year = 2026
  g.character.money = 1_000_000
  g.character.talent = null
  g.character.talents = []
  const city = getCountry(c.countryId).cities[0]
  const b0 = newBiz(g, c.industry, c.countryId, city, { cash: c.cash, founded: 2020, outlets: [{ countryId: c.countryId, city, count: c.sites, opened: 2020 }] })
  const a = createBusinessAsset(g, 'Test Co', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const b = bizOf(g, a)
  const plan = bestPlan(g, b)
  b.price = plan.price
  b.production = plan.production
  c.setup?.(b)
  stepDown(g, a, b, { firstName: 'Pat', lastName: 'Lee', gender: 'female', skill: c.skill, salary: askingSalary(b, c.skill), since: g.year, style, integrity: 100 })
  g.queue = []
  return { g, a }
}

interface Letter {
  label: string
  style: CeoStyle
  g: GameState
  a: Asset
  /** The popup's text when the letter was one. */
  popup: string | null
  /** Every bullet: the popup's, or the memo the company screen keeps when the letter went to the life log. */
  bullets: string[]
}

/** One business year under the CEO, and the letter they wrote. */
function yearOf(c: Case, style: CeoStyle, seed: number): Letter {
  const { g, a } = company(c, style, seed)
  yearlyBusinessImpl(g)
  const label = `${c.label}, ${style}`
  const st = boardOf(bizOf(g, a))
  expect(st.letter, `${label}: a letter this year`).toBe(g.year)
  const popup = g.queue.find((m): m is NoticeModal => m.kind === 'notice' && m.title === `${a.name}: Letter from the CEO`)
  // A letter that went to the log is read from the memo, so it must fit there whole.
  if (!popup) expect(st.memo.length, `${label}: the whole letter is in the memo`).toBeLessThan(MEMO_LINES)
  const bullets = popup ? popup.text.split('\n').filter((x) => x.startsWith('\u{2022} ')).map((x) => x.slice(2)) : [...st.memo]
  return { label, style, g, a, popup: popup?.text ?? null, bullets }
}

/** The codas a letter's bullets end on, with the style each belongs to. */
function codasIn(bullets: readonly string[]): { style: CeoStyle; coda: string }[] {
  return bullets.flatMap((x) => STYLES.flatMap((style) => STYLE_INFO[style].coda.filter((coda) => x.endsWith(` ${coda}`)).map((coda) => ({ style, coda }))))
}

let LETTERS: Letter[] = []

beforeAll(() => {
  // The same seed for the four styles of a case, so the style is all that differs.
  LETTERS = CASES.flatMap((c, i) => STYLES.map((style) => yearOf(c, style, 101 + i)))
}, 300_000)

describe('CEO letters in the manager\u{2019}s voice', () => {
  it('every bullet is 12 words or fewer', () => {
    for (const l of LETTERS) {
      expect(l.bullets.length, l.label).toBeGreaterThan(0)
      for (const x of l.bullets) expect(words(x), `${l.label}: ${x}`).toBeLessThanOrEqual(12)
    }
    // The seeded companies wrote every kind of bullet there is to check.
    const kinds = new Set(LETTERS.flatMap((l) => l.bullets.map((x) => x.split(' ')[0])))
    for (const k of ['Skill', 'Forecast', 'Hired', 'Let', 'Raised', 'Switched', 'Resilience', 'Put', 'Opened', 'Built', 'Repaid', 'Paid', 'Next', 'Kept', 'Greenlit', 'Started', 'Nothing']) {
      expect([...kinds], k).toContain(k)
    }
  })

  it('no bullet has a colon join', () => {
    for (const l of LETTERS) {
      for (const x of l.bullets) {
        // A game's title is a name: "Bus Driver Simulator: Lima" keeps its colon.
        expect(hasColonJoin(x.replace(/"[^"]*"/g, '"Title"')), `${l.label}: ${x}`).toBe(false)
      }
    }
  })

  it('no letter has more than one coda', () => {
    for (const l of LETTERS) expect(codasIn(l.bullets).length, l.label).toBeLessThanOrEqual(1)
    // Three bullets that cut, opened and built something: only the first of them gets a coda.
    for (const style of STYLES) {
      const { g, a } = company(CASES[0], style, 7)
      const b = bizOf(g, a)
      const lines = ['Skill 88/100, competent.', 'Hired Ana Lee, Sommelier. $60,000 a year.', 'Let Rex Idle (Bookkeeper) go.', 'Opened 3 restaurants in Boston for $1.4M.', 'Built 2 oven lines for $243K.']
      ceoLetter(g, a, b, lines, true)
      const memo = boardOf(b).memo
      expect(codasIn(memo), style).toHaveLength(1)
      expect(STYLE_INFO[style].coda.map((c) => `${lines[2]} ${c}`), style).toContain(memo[2])
      expect([memo[0], memo[1], memo[3], memo[4]]).toEqual([lines[0], lines[1], lines[3], lines[4]])
    }
  })

  it('the four styles produce different codas', () => {
    const seen = new Map(STYLES.map((s) => [s, new Set<string>()] as const))
    for (const l of LETTERS) {
      for (const t of codasIn(l.bullets)) {
        expect(t.style, `${l.label}: ${t.coda}`).toBe(l.style)
        seen.get(l.style)?.add(t.coda)
      }
    }
    for (const s of STYLES) expect(seen.get(s)?.size ?? 0, s).toBeGreaterThan(0)
    // Two or three codas a style, none shared.
    const all = STYLES.flatMap((s) => STYLE_INFO[s].coda)
    expect(new Set(all).size).toBe(all.length)
    for (const s of STYLES) {
      expect(STYLE_INFO[s].coda.length, s).toBeGreaterThanOrEqual(2)
      expect(STYLE_INFO[s].coda.length, s).toBeLessThanOrEqual(3)
    }
  })

  it('bullets keep their numbers', () => {
    let hires = 0
    for (const l of LETTERS) {
      const b = bizOf(l.g, l.a)
      for (const x of l.bullets) {
        if (x.startsWith('Hired ')) {
          const s = b.staff.find((k) => x.startsWith(`Hired ${k.firstName} ${k.lastName}, ${k.role}. `))
          expect(s, `${l.label}: ${x}`).toBeDefined()
          if (s) expect(x).toContain(`${money(s.salary)} a year.`)
          hires++
        }
        if (/^(?:Opened|Built|Put|Repaid|Paid) /.test(x)) expect(x, l.label).toMatch(/\$\d/)
        if (/^(?:Raised|Cut) (?:pay|marketing) /.test(x)) expect(x, l.label).toMatch(/\d%/)
      }
    }
    expect(hires).toBeGreaterThan(0)
  })

  it('keeps the salutation and the signature', () => {
    const popups = LETTERS.filter((l) => l.popup !== null)
    expect(popups.length).toBeGreaterThan(10)
    for (const l of popups) {
      const text = l.popup ?? ''
      expect(text.startsWith(`Dear ${l.g.character.firstName},\n`), l.label).toBe(true)
      expect(text.split('\n').at(-1), l.label).toBe(`\u{2014} Pat Lee, CEO (${STYLE_INFO[l.style].label.toLowerCase()})`)
    }
  })

  it('picks the coda from the year and the company, never the RNG', () => {
    for (const style of STYLES) {
      const write = (year: number): string => {
        const { g, a } = company(CASES[0], style, 7)
        g.year = year
        const b = bizOf(g, a)
        const rng = g.rng
        ceoLetter(g, a, b, ['Opened 3 restaurants in Boston for $1.4M.'], false)
        expect(g.rng, `${style}: no draw`).toBe(rng)
        return boardOf(b).memo[0]
      }
      expect(write(2026)).toBe(write(2026))
      // Over ten years the company uses every coda of its style.
      const used = new Set(Array.from({ length: 10 }, (_, i) => write(2026 + i).replace('Opened 3 restaurants in Boston for $1.4M. ', '')))
      expect([...used].sort(), style).toEqual([...STYLE_INFO[style].coda].sort())
    }
  })

  it('the bundle of letters opens with the year', () => {
    const g = createNewLife({ seed: 5, year: 1990, countryId: 'us' })
    g.queue = []
    for (const name of ['A Co', 'B Co', 'C Co']) notice(g, `${name}: Letter from the CEO`, `Dear Sam,\n\u{2022} Opened 2 caf\u{E9}s in Lyon for $300K.\n\u{2014} Pat Lee, CEO (grower)`)
    bundleCeoLetters(g, 0)
    expect(g.queue).toHaveLength(1)
    const text = (g.queue[0] as NoticeModal).text
    expect(text.split('\n')[0]).toBe(`Letters from your CEOs, ${g.year}.`)
    expect(text).not.toContain('Dear ')
  })
})
