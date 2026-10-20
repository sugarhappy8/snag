// R1-C1: shared helpers for the Charts track tests (not a test file; vitest only runs *.test.ts). Later tasks import
// from here: the builders' tests need real statements and real owner lives, the component tests need an SVG node
// count, and the hostile-input tests need a JSON node count that matches the save loader's.
//
// Flags are not set here. A test that depends on annualReport2 or chartKit wraps itself in withFlags.
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ageUp } from '../src/game/aging'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, type BizState, type Statement } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { INDUSTRY_IDS, type Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'

export { deepFreeze } from './fuzz-kit'

/**
 * How many values a JSON tree holds, counted the way the save loader counts them (save-schema.ts): the root, and every
 * array, object and primitive under it. The loader's cap is 500,000 and the Charts plan budgets state growth in these.
 */
export function jsonNodes(v: unknown): number {
  let nodes = 0
  const stack: unknown[] = [v]
  while (stack.length) {
    const item = stack.pop()
    nodes++
    if (item && typeof item === 'object') for (const child of Array.isArray(item) ? item : Object.values(item)) stack.push(child)
  }
  return nodes
}

const SVG_SHAPES = /<(rect|path|line|circle|polyline|polygon|text|g|use|tspan)\b/g

/** How many drawing elements sit inside <svg> in this markup (D.11.2 allows at most 150 a chart). */
export function countSvgNodes(html: string): number {
  let n = 0
  for (const svg of html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)) n += [...svg[0].matchAll(SVG_SHAPES)].length
  return n
}

/** The markup of an element, the way every UI test in this repo reads a component (no DOM, no jsdom). */
export function renderHtml(el: ReactElement): string {
  return renderToStaticMarkup(el)
}

/** An adult of 30 in 2030 with money, smarts and a licence, as test/talent-business.test.ts sets one up. */
function adult(seed: number): GameState {
  const g = createNewLife({ seed, year: 2000, countryId: 'us' })
  g.queue = []
  const c = g.character
  c.age = 30
  g.year = 2030
  c.money = 5_000_000
  c.talent = null
  c.stats.smarts = 65
  c.licenses = ['driver']
  return g
}

export interface StatementSample {
  seed: number
  industry: string
  g: GameState
  a: Asset
  b: BizState
  /** The company's first statement (a copy, so a later year cannot change it). */
  s: Statement
}

/**
 * One statement for every industry, for each seed: a company of each of the 56 industries, hired CEO, six years old,
 * with 10M in cash, put through one yearly step. Three seeds give 168 statements. The companies of one seed share a
 * game, so a test that wants a second consecutive statement runs `g.queue = []; g.year += 1; yearlyBusinessImpl(g)` and
 * reads `b.last` again.
 */
export function statementSamples(seeds: readonly number[]): StatementSample[] {
  const out: StatementSample[] = []
  for (const seed of seeds) {
    const g = adult(seed)
    const city = getCountry('us').cities[0]
    const made: { industry: Industry; a: Asset; b: BizState }[] = []
    for (const industry of INDUSTRY_IDS) {
      const b0 = newBiz(g, industry, 'us', city, { cash: 10_000_000, founded: g.year - 6 })
      const a = createBusinessAsset(g, industry, b0, 100_000)
      g.assets.push(a)
      const b = bizOf(g, a)
      installManager(g, b, managerCandidate(g, b, 70))
      made.push({ industry, a, b })
    }
    yearlyBusinessImpl(g)
    for (const { industry, a, b } of made) if (b.last) out.push({ seed, industry, g, a, b, s: { ...b.last } })
  }
  return out
}

export interface OwnerGameOptions {
  seed?: number
  industry?: Industry
  years?: number
  companies?: number
}

/**
 * An owner-CEO who has run a company for `years` (default 6) real years through ageUp. The first company is the
 * player's own (becomeCeo); the others (`companies` in all, default 1) are other industries under hired managers. The
 * popup queue is emptied before each year and kept after the last one, so a test can read the Annual Report waiting there.
 * Before each year the owner takes the optimizer's price and production (what accepting the suggested plan would do),
 * because a company left on its opening plan runs out of cash within four years and queues a Cash Crunch, not a report.
 */
export function ownerGame(o: OwnerGameOptions = {}): { g: GameState; a: Asset; b: BizState; others: Asset[] } {
  const { seed = 1, industry = 'restaurant', years = 6, companies = 1 } = o
  const g = adult(seed)
  const city = getCountry('us').cities[0]
  const make = (id: Industry): { a: Asset; b: BizState } => {
    const b0 = newBiz(g, id, 'us', city, { cash: 3_000_000, founded: g.year - 1 })
    const a = createBusinessAsset(g, id, b0, 100_000)
    g.assets.push(a)
    return { a, b: bizOf(g, a) }
  }
  const mine = make(industry)
  becomeCeo(g, mine.a, mine.b)
  const others: Asset[] = []
  const start = INDUSTRY_IDS.indexOf(industry)
  for (let i = 1; others.length < companies - 1 && i <= INDUSTRY_IDS.length; i++) {
    const id = INDUSTRY_IDS[(start + i) % INDUSTRY_IDS.length]!
    if (id === industry) continue
    const other = make(id)
    installManager(g, other.b, managerCandidate(g, other.b, 70))
    others.push(other.a)
  }
  for (let y = 0; y < years; y++) {
    g.queue = []
    const plan = bestPlan(g, mine.b)
    mine.b.price = plan.price
    mine.b.production = plan.production
    ageUp(g)
  }
  return { g, a: mine.a, b: mine.b, others }
}
