// R1-C6: the market and ladder builders (src/game/charts/market.ts and ranks.ts). A company's market history becomes a
// share line, a market size tile and a rival ladder; any list of scores becomes a ladder, a scorecard, a rank line or an
// approval line. Pure reads of settled years: nothing here draws a random number, writes state or reads the rival trend
// (which looks two years ahead).
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { marketViewOf, type MarketView } from '../src/game/business/competition'
import { topPairs } from '../src/game/business/competition-state'
import { scoreRow, type ScoreRow } from '../src/game/business/scorecard'
import { readBiz } from '../src/game/business/state'
import * as barrel from '../src/game/charts'
import { marketLadderSpec, marketSizeSpec, shareSpec } from '../src/game/charts/market'
import { approvalSpec, ladderSpec, rankChange, scorecardSpec, standingSpec, windowRows, type RankSource } from '../src/game/charts/ranks'
import { readChartSpec, type ChartSpec } from '../src/game/charts/spec'
import { moneyDisplay, setMoneyDisplay } from '../src/game/core'
import type { GameState } from '../src/game/types'
import { deepFreeze, ownerGame } from './charts-kit'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Fixtures

const savedDisplay = { ...moneyDisplay() }
beforeEach(() => setMoneyDisplay({ mode: 'usd', nominal: false }))
afterEach(() => setMoneyDisplay({ mode: savedDisplay.mode, nominal: savedDisplay.nominal }))

interface Hist {
  year: number
  share: number
  rank: number
  size: number
  lead?: number
  hhi?: number
  top?: (string | number)[]
}

/** A history row: a rank of 3 in a market of a billion, the biggest rival at 30%. */
function hist(year: number, share: number, over: Partial<Hist> = {}): Hist {
  return { year, share, rank: 3, size: 1_000_000_000 + (year - 2000) * 10_000_000, lead: 0.3, ...over }
}

/** A `top` list as the history keeps it, [id, share, id, share, ...]. */
function flat(pairs: readonly (readonly [string, number])[]): (string | number)[] {
  const out: (string | number)[] = []
  for (const [id, share] of pairs) out.push(id, share)
  return out
}

function rival(i: number, share: number): Record<string, unknown> {
  return { id: `r${i}`, name: `Rival ${i}`, hq: 'us', founded: 1990, share, quality: 50, tech: 50, trend: 0, legacy: false, real: false, tier: 'small' }
}

/** The same rival with a `trend` that throws if anyone reads it. */
function rivalNoTrend(i: number, share: number): Record<string, unknown> {
  const r = rival(i, share)
  delete r.trend
  Object.defineProperty(r, 'trend', {
    enumerable: true,
    get() {
      throw new Error('RivalView.trend was read')
    },
  })
  return r
}

/** A hand-built market view. Only the fields the builders read matter. */
function view(over: Record<string, unknown> = {}): MarketView {
  return {
    scope: 'national', noun: 'restaurant', place: 'the United States', year: 2030, booked: true, size: 1e9, growth: 0.03,
    share: 0.12, rank: 4, tier: 'startup', unmet: 0, base: 0, dominance: 0,
    rivals: Array.from({ length: 8 }, (_, i) => rival(i, 0.3 - i * 0.03)),
    fringe: 0.3, worldShare: 0.01, home: null,
    antitrust: { regime: 'none', p: 0, label: 'none', acquisitions: 0, regional: [] },
    history: [],
    ...over,
  } as unknown as MarketView
}

const SHARES = [0.05, 0.06, 0.07, 0.08, 0.09, 0.12]
const LEADS = [0.3, 0.29, 0.28, 0.27, 0.26, 0.25]

/** Six years ending in 2030: you from 5% to 12%, the biggest rival from 30% to 25%. */
function sixYears(): Hist[] {
  return SHARES.map((s, i) => hist(2025 + i, s, { lead: LEADS[i] }))
}

/**
 * Nine on the ladder, you seventh. This year: r0 30, r1 22, r2 15, r3 10, r4 8, r5 6, you 5, r6 4, r7 3. Last year, with
 * you at 6% and r7 out of the top: r1 28, r0 25, r2 14, r4 11, r3 9, you 6, r5 5, r6 3.5. So r0 up 1, r1 down 1, r2 and
 * r6 no change, r3 up 1, r4 down 1, r5 up 1, you down 1, r7 new.
 */
function ladderView(over: Record<string, unknown> = {}): MarketView {
  const now = [0.3, 0.22, 0.15, 0.1, 0.08, 0.06, 0.04, 0.03]
  const history = [
    hist(2028, 0.04, { rank: 8, top: flat([['r1', 0.27], ['r0', 0.24], ['r2', 0.13], ['r4', 0.12], ['r3', 0.08], ['r5', 0.05], ['r6', 0.03]]) }),
    hist(2029, 0.06, { rank: 6, top: flat([['r1', 0.28], ['r0', 0.25], ['r2', 0.14], ['r4', 0.11], ['r3', 0.09], ['r5', 0.05], ['r6', 0.035]]) }),
    hist(2030, 0.05, { rank: 7, top: flat(now.map((s, i) => [`r${i}`, s] as const)) }),
  ]
  return view({ share: 0.05, rank: 7, rivals: now.map((s, i) => rival(i, s)), history, ...over })
}

/** n rivals at distinct shares from 40% down, ids r0 to r(n-1). */
function field(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => rival(i, 0.4 * Math.pow(0.9, i)))
}

function strings(v: unknown, into: string[] = []): string[] {
  if (typeof v === 'string') into.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, into)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, into)
  return into
}

function numbers(v: unknown, into: number[] = []): number[] {
  if (typeof v === 'number') into.push(v)
  else if (Array.isArray(v)) for (const x of v) numbers(x, into)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) numbers(x, into)
  return into
}

/** A spec the reader accepts unchanged, with finite numbers, every string within the limits and no dash character. */
function expectValid(spec: ChartSpec | null, tag = ''): asserts spec is ChartSpec {
  expect(spec, tag).not.toBeNull()
  expect(readChartSpec(spec), tag).toEqual(spec)
  for (const n of numbers(spec)) expect(Number.isFinite(n), `${tag} ${n}`).toBe(true)
  for (const t of strings(spec)) {
    expect(t.length, `${tag} ${t}`).toBeLessThanOrEqual(120)
    expect(/[\u2013\u2014]/.test(t), `${tag} ${t}`).toBe(false)
  }
}

/** Either nothing or a valid spec (what a builder owes a hostile input). */
function expectSafe(spec: ChartSpec | null, tag = ''): void {
  if (spec !== null) expectValid(spec, tag)
}

const g0 = (): GameState => makeTestGame(1, { countryId: 'us' })

// ---------------------------------------------------------------------------
// One real company with six booked years

let owner: ReturnType<typeof ownerGame>
let real: MarketView
beforeAll(() => {
  owner = ownerGame({ years: 6 })
  real = marketViewOf(owner.g, readBiz(owner.g, owner.a))
}, 120_000)

describe('the barrel', () => {
  it('re-exports the builders', () => {
    expect(barrel.shareSpec).toBe(shareSpec)
    expect(barrel.marketSizeSpec).toBe(marketSizeSpec)
    expect(barrel.marketLadderSpec).toBe(marketLadderSpec)
    expect(barrel.ladderSpec).toBe(ladderSpec)
    expect(barrel.rankChange).toBe(rankChange)
    expect(barrel.scorecardSpec).toBe(scorecardSpec)
    expect(barrel.standingSpec).toBe(standingSpec)
    expect(barrel.approvalSpec).toBe(approvalSpec)
    expect(barrel.windowRows).toBe(windowRows)
  })
})

// ---------------------------------------------------------------------------
// 1: shareSpec and marketSizeSpec

describe('shareSpec', () => {
  it('draws you against the leader over six years', () => {
    const spec = shareSpec(g0(), view({ history: sixYears() }))
    expectValid(spec)
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('pct')
    expect(spec.x).toEqual([2025, 2026, 2027, 2028, 2029, 2030])
    expect(spec.series.map((s) => s.id)).toEqual(['you', 'leader'])
    expect(spec.series.map((s) => s.tone)).toEqual(['c1', 'c2'])
    expect(spec.series[0]!.values).toEqual(SHARES)
    expect(spec.series[1]!.values).toEqual(LEADS)
    expect(spec.summary).toBe("Your share 12%, the leader's 25%, from 2025 to 2030.")
    expect(spec.title.length).toBeLessThanOrEqual(60)
  })

  it('leaves the leader out (null) in rows that have no leader share', () => {
    const rows = sixYears().map((h, i) => (i < 3 ? { year: h.year, share: h.share, rank: h.rank, size: h.size } : h))
    const spec = shareSpec(g0(), view({ history: rows }))
    expectValid(spec)
    expect(spec.series[1]!.values).toEqual([null, null, null, 0.27, 0.26, 0.25])
    expect(spec.series[0]!.values).toEqual(SHARES)
  })

  it('says only your share when no row names a leader', () => {
    const rows = sixYears().map((h) => ({ year: h.year, share: h.share, rank: h.rank, size: h.size }))
    const spec = shareSpec(g0(), view({ history: rows }))
    expectValid(spec)
    expect(spec.series[1]!.values.every((v) => v === null)).toBe(true)
    expect(spec.summary).toBe('Your share 12%, from 2025 to 2030.')
  })

  it('keeps the last twenty of twenty-five years', () => {
    const rows = Array.from({ length: 25 }, (_, i) => hist(2006 + i, 0.01 + i * 0.004, { lead: 0.3 }))
    const spec = shareSpec(g0(), view({ history: rows }))
    expectValid(spec)
    expect(spec.x.length).toBe(20)
    expect(spec.x[0]).toBe(2011)
    expect(spec.x[19]).toBe(2030)
    for (const s of spec.series) expect(s.values.length).toBe(20)
  })

  it('needs two rows', () => {
    expect(shareSpec(g0(), view({ history: [] }))).toBeNull()
    expect(shareSpec(g0(), view({ history: [hist(2030, 0.1)] }))).toBeNull()
    expectValid(shareSpec(g0(), view({ history: [hist(2029, 0.1), hist(2030, 0.11)] })))
  })

  it('sorts by year, keeps the later of two rows for one year, and skips a row with no share', () => {
    const rows = [hist(2030, 0.2), hist(2028, 0.1), hist(2029, 0.15, { share: Number.NaN }), hist(2029, 0.16), hist(2029, 0.17)]
    const spec = shareSpec(g0(), view({ history: rows }))
    expectValid(spec)
    expect(spec.x).toEqual([2028, 2029, 2030])
    expect(spec.series[0]!.values).toEqual([0.1, 0.17, 0.2])
  })

  it('draws a real company with six booked years', () => {
    expect(real.booked).toBe(true)
    const spec = shareSpec(owner.g, real)
    expectValid(spec)
    expect(real.history.length).toBe(6)
    expect(spec.x).toEqual(real.history.map((h) => h.year))
    expect(spec.series[0]!.values).toEqual(real.history.map((h) => h.share))
    expect(spec.series[1]!.values).toEqual(real.history.map((h) => h.lead ?? null))
  })
})

describe('marketSizeSpec', () => {
  it('is a one-series KPI of the market size with the growth as its note', () => {
    const rows = sixYears()
    const spec = marketSizeSpec(g0(), view({ history: rows, growth: 0.03, noun: 'restaurant' }))
    expectValid(spec)
    expect(spec.kind).toBe('kpi')
    expect(spec.unit).toBe('money')
    expect(spec.series.length).toBe(1)
    expect(spec.series[0]!.id).toBe('size')
    expect(spec.series[0]!.values).toEqual(rows.map((h) => h.size))
    expect(spec.x).toEqual(rows.map((h) => h.year))
    expect(typeof spec.basis).toBe('number')
    expect(spec.note).toBe('growing 3% a year')
    expect(spec.summary).toContain('2030')
  })

  it('words the growth three ways', () => {
    const rows = sixYears()
    expect(marketSizeSpec(g0(), view({ history: rows, growth: -0.02 }))!.note).toBe('shrinking 2% a year')
    expect(marketSizeSpec(g0(), view({ history: rows, growth: 0.0001 }))!.note).toBe('flat')
    expect(marketSizeSpec(g0(), view({ history: rows, growth: 0.034 }))!.note).toBe('growing 3.4% a year')
    expectValid(marketSizeSpec(g0(), view({ history: rows, growth: Number.NaN })))
  })

  it('is null with no history, an unbooked market, or no size in the last year', () => {
    expect(marketSizeSpec(g0(), view({ history: [] }))).toBeNull()
    expect(marketSizeSpec(g0(), view({ history: sixYears(), booked: false }))).toBeNull()
    const rows = sixYears()
    rows[5] = { ...rows[5]!, size: Number.NaN }
    expect(marketSizeSpec(g0(), view({ history: rows }))).toBeNull()
  })

  it('draws a real company', () => {
    const spec = marketSizeSpec(owner.g, real)
    expectValid(spec)
    expect(spec.series[0]!.values.length).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// 2: marketLadderSpec

describe('marketLadderSpec', () => {
  it('lists you and eight rivals in share order, ranks 1 to 9', () => {
    const spec = marketLadderSpec(g0(), ladderView(), 'Pine Street Cafe')
    expectValid(spec)
    expect(spec.kind).toBe('ladder')
    expect(spec.unit).toBe('pct')
    expect(spec.title).toBe('Who holds the restaurant market')
    const rows = spec.rows!
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(rows.map((r) => r.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'you', 'r6', 'r7'])
    expect(rows.map((r) => r.value)).toEqual([0.3, 0.22, 0.15, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03])
    expect(rows[0]!.name).toBe('Rival 0')
  })

  it('marks your row, with the name the caller passes in', () => {
    const rows = marketLadderSpec(g0(), ladderView(), 'Pine Street Cafe')!.rows!
    const mine = rows.filter((r) => r.you)
    expect(mine.length).toBe(1)
    expect(mine[0]!.you).toBe(true)
    expect(mine[0]!.name).toBe('Pine Street Cafe')
    expect(mine[0]!.rank).toBe(7)
    expect(rows.filter((r) => !r.you).every((r) => r.you === undefined)).toBe(true)
  })

  it('reads the change against last year top eight only', () => {
    const rows = marketLadderSpec(g0(), ladderView(), 'Me')!.rows!
    const byId = new Map(rows.map((r) => [r.id, r]))
    const prevRank = (id: string) => byId.get(id)!.prevRank
    expect(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'you', 'r6', 'r7'].map(prevRank)).toEqual([2, 1, 3, 5, 4, 7, 6, 8, null])
    const prev = (id: string) => byId.get(id)!.prev
    expect(prev('r0')).toBe(0.25)
    expect(prev('r1')).toBe(0.28)
    expect(prev('r6')).toBe(0.035)
    expect(prev('you')).toBe(0.06)
    const text = (id: string) => rankChange(byId.get(id)!.rank, byId.get(id)!.prevRank).text
    expect(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'you', 'r6', 'r7'].map(text)).toEqual(['up 1', 'down 1', 'no change', 'up 1', 'down 1', 'up 1', 'down 1', 'no change', 'new'])
  })

  it('treats a rival that was not in last year top eight as new', () => {
    const r7 = marketLadderSpec(g0(), ladderView(), 'Me')!.rows!.find((r) => r.id === 'r7')!
    expect(r7.prev).toBeNull()
    expect(r7.prevRank).toBeNull()
    expect(rankChange(r7.rank, r7.prevRank)).toEqual({ dir: 0, text: 'new' })
  })

  it('takes the sparkline from the last history rows, null where a rival was not on the list', () => {
    const rows = marketLadderSpec(g0(), ladderView(), 'Me')!.rows!
    const spark = (id: string) => rows.find((r) => r.id === id)!.spark
    expect(spark('r0')).toEqual([0.24, 0.25, 0.3])
    expect(spark('r7')).toEqual([null, null, 0.03])
    expect(spark('you')).toEqual([0.04, 0.06, 0.05])
  })

  it('shows at most ten sparkline points however long the history', () => {
    const rows14 = Array.from({ length: 14 }, (_, i) => hist(2017 + i, 0.05, { rank: 7, top: flat([['r0', 0.3 - i * 0.001], ['r1', 0.2]]) }))
    const spec = marketLadderSpec(g0(), view({ share: 0.05, rank: 3, rivals: [rival(0, 0.3), rival(1, 0.2)], history: rows14 }), 'Me')
    expectValid(spec)
    for (const r of spec.rows!) expect(r.spark.length).toBe(10)
    expect(spec.rows!.find((r) => r.id === 'r0')!.spark[9]).toBeCloseTo(0.3 - 13 * 0.001, 9)
  })

  it('has no change to show in the first booked year, so every row reads new', () => {
    const only = [hist(2030, 0.05, { top: flat([['r0', 0.3]]) })]
    const spec = marketLadderSpec(g0(), view({ share: 0.05, rivals: [rival(0, 0.3)], history: only }), 'Me')
    expectValid(spec)
    for (const r of spec.rows!) {
      expect(r.prev).toBeNull()
      expect(r.prevRank).toBeNull()
    }
  })

  it('uses last year rank for you when you were outside the top eight list', () => {
    const rivals = field(12)
    const top = flat(rivals.slice(0, 8).map((r) => [r.id as string, r.share as number] as const))
    const history = [hist(2029, 0.001, { rank: 15, top }), hist(2030, 0.002, { rank: 14, top })]
    const spec = marketLadderSpec(g0(), view({ share: 0.002, rivals, history }), 'Me')
    expectValid(spec)
    const you = spec.rows!.find((r) => r.you)!
    expect(you.rank).toBe(13)
    expect(you.prevRank).toBe(15)
    expect(you.prev).toBe(0.001)
    expect(rankChange(you.rank, you.prevRank).text).toBe('up 2')
  })

  it('cuts a rival id longer than a row id may be, and still finds that rival in last year list', () => {
    const long = 'rv-mitsubishi-electric-robots'
    const rivals = [{ ...rival(0, 0.3), id: long }, rival(1, 0.2)]
    const prevTop = flat([['r1', 0.25], [long, 0.2]])
    const history = [hist(2029, 0.05, { rank: 3, top: prevTop }), hist(2030, 0.05, { rank: 3, top: flat([[long, 0.3], ['r1', 0.2]]) })]
    const spec = marketLadderSpec(g0(), view({ share: 0.05, rivals, history }), 'Me')
    expectValid(spec)
    const first = spec.rows![0]!
    expect(first.id).toBe(long.slice(0, 24))
    expect(first.prev).toBe(0.2)
    expect(first.prevRank).toBe(2)
    expect(first.spark).toEqual([0.2, 0.3])
    expect(new Set(spec.rows!.map((r) => r.id)).size).toBe(spec.rows!.length)
  })

  it('windows twenty rivals: the top five, you and two neighbours each side, at most twelve', () => {
    const rivals = field(20)
    // You at 12th: between rival 10 (index) and 11.
    const youShare = (rivals[10]!.share as number) * 0.5 + (rivals[11]!.share as number) * 0.5
    const history = [hist(2029, youShare), hist(2030, youShare)]
    const spec = marketLadderSpec(g0(), view({ share: youShare, rivals, history }), 'Me')
    expectValid(spec)
    const ranks = spec.rows!.map((r) => r.rank)
    expect(ranks).toEqual([1, 2, 3, 4, 5, 10, 11, 12, 13, 14])
    expect(spec.rows!.find((r) => r.you)!.rank).toBe(12)
    expect(spec.rows!.length).toBeLessThanOrEqual(12)
  })

  it('windows you at the top and at the bottom of twenty rivals', () => {
    const rivals = field(20)
    const top = marketLadderSpec(g0(), view({ share: 0.9, rivals, history: [hist(2029, 0.9), hist(2030, 0.9)] }), 'Me')
    expectValid(top)
    expect(top.rows!.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5])
    expect(top.rows![0]!.you).toBe(true)
    const bottom = marketLadderSpec(g0(), view({ share: 0.0001, rivals, history: [hist(2029, 0.0001), hist(2030, 0.0001)] }), 'Me')
    expectValid(bottom)
    expect(bottom.rows!.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 19, 20, 21])
    expect(bottom.rows![7]!.you).toBe(true)
  })

  it('puts you ahead of a rival on an equal share', () => {
    const spec = marketLadderSpec(g0(), view({ share: 0.1, rivals: [rival(0, 0.1), rival(1, 0.2)], history: [hist(2029, 0.1), hist(2030, 0.1)] }), 'Me')
    expectValid(spec)
    expect(spec.rows!.map((r) => r.id)).toEqual(['r1', 'you', 'r0'])
    expect(spec.rows!.find((r) => r.you)!.rank).toBe(2)
  })

  it('agrees with the view on your rank', () => {
    const spec = marketLadderSpec(owner.g, real, owner.a.name)
    expectValid(spec)
    const you = spec.rows!.find((r) => r.you)!
    expect(you.rank).toBe(real.rank)
    expect(you.name).toBe(owner.a.name.slice(0, 40))
    expect(you.value).toBeCloseTo(real.share, 6)
    expect(spec.rows!.length).toBeLessThanOrEqual(12)
  })

  it('reads the previous year of a real company from its history, not from a trend', () => {
    const spec = marketLadderSpec(owner.g, real, owner.a.name)
    expectValid(spec)
    const prev = real.history[real.history.length - 2]!
    const before = new Map(topPairs(prev))
    for (const r of spec.rows!) {
      if (r.you) {
        expect(r.prev).toBe(prev.share)
        expect(r.prevRank).toBe(prev.rank)
      } else if (before.has(r.id)) {
        expect(r.prev).toBe(before.get(r.id))
        expect(r.prevRank).not.toBeNull()
      } else {
        expect(r.prev).toBeNull()
        expect(r.prevRank).toBeNull()
      }
    }
  })

  it('cuts a long market noun so the title stays within sixty characters', () => {
    const spec = marketLadderSpec(g0(), ladderView({ noun: 'a very long market noun that goes on and on and on' }), 'Me')
    expectValid(spec)
    expect(spec.title.length).toBeLessThanOrEqual(60)
  })

  it('never reads RivalView.trend (a rival with a trend that throws is fine, and the source never says the word)', () => {
    const rivals = Array.from({ length: 8 }, (_, i) => rivalNoTrend(i, [0.3, 0.22, 0.15, 0.1, 0.08, 0.06, 0.04, 0.03][i]!))
    const v = ladderView({ rivals })
    expect(() => marketLadderSpec(g0(), v, 'Me')).not.toThrow()
    expectValid(marketLadderSpec(g0(), v, 'Me'))
    expectValid(shareSpec(g0(), v))
    expectValid(marketSizeSpec(g0(), v))
    const source = readFileSync(new URL('../src/game/charts/market.ts', import.meta.url), 'utf8')
    expect(source.toLowerCase()).not.toContain('trend')
  })

  it('says where you stand in the summary', () => {
    const spec = marketLadderSpec(g0(), ladderView(), 'Me')!
    expect(spec.summary).toContain('#7')
    expect(spec.summary).toContain('5%')
    const lead = marketLadderSpec(g0(), view({ share: 0.9, rivals: field(3), history: [hist(2029, 0.9), hist(2030, 0.9)] }), 'Me')!
    expect(lead.summary).toMatch(/lead/i)
  })
})

// ---------------------------------------------------------------------------
// 3: an unbooked market

describe('an unbooked market', () => {
  it('has no ladder, no share line and no size tile', () => {
    const unbooked = ladderView({ booked: false })
    expect(marketLadderSpec(g0(), unbooked, 'Me')).toBeNull()
    expect(shareSpec(g0(), unbooked)).toBeNull()
    expect(marketSizeSpec(g0(), unbooked)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4: ladderSpec and windowRows

const src = (id: string, value: number, over: Partial<RankSource> = {}): RankSource => ({ id, name: id.toUpperCase(), value, ...over })

describe('ladderSpec', () => {
  it('sorts high to low and ranks from 1', () => {
    const spec = ladderSpec({ title: 'Scores', unit: 'count', rows: [src('a', 5), src('b', 9), src('c', 7)] })
    expectValid(spec)
    expect(spec.kind).toBe('ladder')
    expect(spec.unit).toBe('count')
    expect(spec.title).toBe('Scores')
    expect(spec.rows!.map((r) => [r.id, r.rank, r.value])).toEqual([['b', 1, 9], ['c', 2, 7], ['a', 3, 5]])
    expect(spec.rows!.every((r) => r.prevRank === null && r.prev === null && r.spark.length === 0)).toBe(true)
    expect(spec.x).toEqual([])
    expect(spec.series).toEqual([])
  })

  it('breaks a tie with you first, then the order given', () => {
    const spec = ladderSpec({ title: 'Ties', unit: 'count', rows: [src('a', 10), src('b', 10, { you: true }), src('c', 10), src('d', 5)] })
    expectValid(spec)
    expect(spec.rows!.map((r) => [r.id, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 3], ['d', 4]])
    expect(spec.rows![0]!.you).toBe(true)
  })

  it('puts the lowest first when higher is not better', () => {
    const spec = ladderSpec({ title: 'Costs', unit: 'money', higherIsBetter: false, rows: [src('a', 30), src('b', 10), src('c', 20)] })
    expectValid(spec)
    expect(spec.rows!.map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(spec.rows!.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('takes last period ranks from prevRanks, and a row with none reads new', () => {
    const spec = ladderSpec({ title: 'Moves', unit: 'count', rows: [src('a', 9), src('b', 8), src('c', 7)], prevRanks: { a: 3, b: 1 } })
    expectValid(spec)
    expect(spec.rows!.map((r) => r.prevRank)).toEqual([3, 1, null])
    expect(spec.rows!.map((r) => rankChange(r.rank, r.prevRank).text)).toEqual(['up 2', 'down 1', 'new'])
  })

  it('ignores a prevRanks entry that is not a rank, and one that is only on the prototype', () => {
    const spec = ladderSpec({ title: 'Moves', unit: 'count', rows: [src('a', 9), src('toString', 8), src('c', 7)], prevRanks: { a: 0, c: Number.NaN } as Record<string, number> })
    expectValid(spec)
    expect(spec.rows!.map((r) => r.prevRank)).toEqual([null, null, null])
  })

  it('works out last period ranks from prev values among the rows that have one', () => {
    const spec = ladderSpec({ title: 'Moves', unit: 'count', rows: [src('a', 8, { prev: 9 }), src('b', 10, { prev: 5 }), src('c', 7)] })
    expectValid(spec)
    expect(spec.rows!.map((r) => [r.id, r.rank, r.prev, r.prevRank])).toEqual([['b', 1, 5, 2], ['a', 2, 9, 1], ['c', 3, null, null]])
    expect(spec.rows!.map((r) => rankChange(r.rank, r.prevRank).text)).toEqual(['up 1', 'down 1', 'new'])
  })

  it('works out last period ranks from prev values the same way when lower is better', () => {
    const spec = ladderSpec({ title: 'Moves', unit: 'count', higherIsBetter: false, rows: [src('a', 8, { prev: 9 }), src('b', 7, { prev: 5 })] })
    expectValid(spec)
    expect(spec.rows!.map((r) => [r.id, r.rank, r.prevRank])).toEqual([['b', 1, 1], ['a', 2, 2]])
  })

  it('draws a sparkline from the last ten points of the history, nulls kept', () => {
    const history = Array.from({ length: 14 }, (_, i) => (i === 12 ? null : i + 1))
    const spec = ladderSpec({ title: 'Trail', unit: 'count', rows: [src('a', 1, { history }), src('b', 0, { history: [1, 2] })] })
    expectValid(spec)
    expect(spec.rows![0]!.spark).toEqual([5, 6, 7, 8, 9, 10, 11, 12, null, 14])
    expect(spec.rows![1]!.spark).toEqual([1, 2])
  })

  it('caps forty rows at twelve, and keeps you with two neighbours each side', () => {
    const rows = Array.from({ length: 40 }, (_, i) => src(`p${i}`, 100 - i, i === 19 ? { you: true } : {}))
    const spec = ladderSpec({ title: 'Forty', unit: 'count', rows })
    expectValid(spec)
    expect(spec.rows!.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 18, 19, 20, 21, 22])
    expect(spec.rows!.find((r) => r.you)!.rank).toBe(20)
    const noYou = ladderSpec({ title: 'Forty', unit: 'count', rows: rows.map((r) => ({ ...r, you: undefined })) })
    expectValid(noYou)
    expect(noYou.rows!.length).toBe(12)
    expect(noYou.rows!.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('draws one row', () => {
    const spec = ladderSpec({ title: 'Alone', unit: 'count', rows: [src('solo', 3, { you: true })] })
    expectValid(spec)
    expect(spec.rows!.length).toBe(1)
    expect(spec.rows![0]).toEqual({ id: 'solo', name: 'SOLO', value: 3, rank: 1, prevRank: null, prev: null, spark: [], you: true })
  })

  it('is null for no rows', () => {
    expect(ladderSpec({ title: 'None', unit: 'count', rows: [] })).toBeNull()
  })

  it('uses the summary it is given, or says who is first and where you stand', () => {
    const given = ladderSpec({ title: 'T', unit: 'count', summary: 'A plain sentence.', rows: [src('a', 2), src('b', 1)] })
    expect(given!.summary).toBe('A plain sentence.')
    const mine = ladderSpec({ title: 'T', unit: 'count', rows: [src('a', 2), src('b', 1, { you: true })] })
    expect(mine!.summary).toBe("You're #2 of 2. A is first.")
    const first = ladderSpec({ title: 'T', unit: 'count', rows: [src('a', 2, { you: true }), src('b', 1)] })
    expect(first!.summary).toBe("You're first of 2. B is next.")
    const other = ladderSpec({ title: 'T', unit: 'count', rows: [src('a', 2), src('b', 1)] })
    expect(other!.summary).toBe('A is first of 2.')
    const alone = ladderSpec({ title: 'T', unit: 'count', rows: [src('a', 2)] })
    expect(alone!.summary).toBe('A is the only entry.')
    const me = ladderSpec({ title: 'T', unit: 'count', rows: [src('a', 2, { you: true })] })
    expect(me!.summary).toBe("You're the only entry.")
  })

  it('carries a price basis when the caller gives a sane year', () => {
    const rows = [src('a', 2), src('b', 1)]
    expect(ladderSpec({ title: 'T', unit: 'money', basis: 2026, rows })!.basis).toBe(2026)
    expect(ladderSpec({ title: 'T', unit: 'money', basis: 12, rows })!.basis).toBeUndefined()
    expect(ladderSpec({ title: 'T', unit: 'money', rows })!.basis).toBeUndefined()
  })
})

describe('windowRows', () => {
  const list = Array.from({ length: 30 }, (_, i) => i)
  const at = (n: number) => (x: number) => x === n

  it('keeps the top five and you with two neighbours each side', () => {
    expect(windowRows(list, at(14))).toEqual([0, 1, 2, 3, 4, 12, 13, 14, 15, 16])
  })

  it('merges the two ranges when they touch or overlap', () => {
    expect(windowRows(list, at(0))).toEqual([0, 1, 2, 3, 4])
    expect(windowRows(list, at(3))).toEqual([0, 1, 2, 3, 4, 5])
    expect(windowRows(list, at(7))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(windowRows(list, at(29))).toEqual([0, 1, 2, 3, 4, 27, 28, 29])
  })

  it('returns a short list whole', () => {
    expect(windowRows([1, 2, 3], at(2))).toEqual([1, 2, 3])
    expect(windowRows([], at(0))).toEqual([])
  })

  it('shows the head of the list, at most twelve, when nobody is you', () => {
    expect(windowRows(list, () => false)).toEqual(list.slice(0, 12))
    expect(windowRows([1, 2, 3], () => false)).toEqual([1, 2, 3])
  })

  it('never returns more than twelve and always keeps you', () => {
    const out = windowRows(list, at(25), 20, 5)
    expect(out.length).toBe(12)
    expect(out).toContain(25)
    expect([...out].sort((a, b) => a - b)).toEqual(out)
    const out2 = windowRows(list, at(29), 100, 100)
    expect(out2.length).toBe(12)
    expect(out2).toContain(29)
  })

  it('takes its own top and around', () => {
    expect(windowRows(list, at(20), 2, 1)).toEqual([0, 1, 19, 20, 21])
    expect(windowRows(list, at(20), 0, 0)).toEqual([20])
    expect(windowRows(list, at(20), Number.NaN, -3)).toEqual([0, 1, 2, 3, 4, 20])
  })

  it('keeps the first match when several rows are you, and writes nothing', () => {
    const copy = [...list]
    expect(windowRows(list, (x) => x === 10 || x === 20)).toEqual([0, 1, 2, 3, 4, 8, 9, 10, 11, 12])
    expect(list).toEqual(copy)
  })
})

// ---------------------------------------------------------------------------
// 5: rankChange

describe('rankChange', () => {
  it('reads up, down, no change and new', () => {
    expect(rankChange(1, 3)).toEqual({ dir: 1, text: 'up 2' })
    expect(rankChange(4, 3)).toEqual({ dir: -1, text: 'down 1' })
    expect(rankChange(2, 2)).toEqual({ dir: 0, text: 'no change' })
    expect(rankChange(2, null)).toEqual({ dir: 0, text: 'new' })
  })

  it('reads a number that is not a rank as new', () => {
    expect(rankChange(2, Number.NaN)).toEqual({ dir: 0, text: 'new' })
    expect(rankChange(Number.NaN, 2)).toEqual({ dir: 0, text: 'new' })
    expect(rankChange(2, undefined as unknown as number)).toEqual({ dir: 0, text: 'new' })
  })
})

// ---------------------------------------------------------------------------
// 6: scorecardSpec, standingSpec, approvalSpec

describe('scorecardSpec', () => {
  const field9 = [80, 75, 60, 50, 40, 30, 20, 10]
  const rows = (): ScoreRow[] => [
    scoreRow('code', 'Coding', 'pts', 71, field9),
    scoreRow('speed', 'Speed', 'pts', 90, field9),
    scoreRow('cost', 'Cost', 'pts', 5, field9),
  ]

  it('is a meter with the labels as x and three series, and the rank in the marks', () => {
    const set = rows()
    const spec = scorecardSpec('Where your best model stands', set)
    expectValid(spec)
    expect(spec.kind).toBe('meter')
    expect(spec.title).toBe('Where your best model stands')
    expect(spec.x).toEqual(['Coding', 'Speed', 'Cost'])
    expect(spec.series.map((s) => [s.id, s.label])).toEqual([['mine', 'Yours'], ['market', 'Market'], ['best', 'Best']])
    expect(spec.series[0]!.values).toEqual(set.map((r) => r.mine))
    expect(spec.series[1]!.values).toEqual(set.map((r) => r.market))
    expect(spec.series[2]!.values).toEqual(set.map((r) => r.best))
    expect(spec.marks).toEqual([{ at: 0, label: '3 of 9' }, { at: 1, label: '1 of 9' }, { at: 2, label: '9 of 9' }])
    expect(spec.series[0]!.values[0]).toBe(71)
    expect(spec.series[2]!.values[0]).toBe(80)
  })

  it('has a summary that says where you lead and where you trail', () => {
    const spec = scorecardSpec('Standing', rows())!
    expect(spec.summary).toBe('You rank first on 1 of 3. Weakest: Cost, 9 of 9.')
    const one = scorecardSpec('Standing', [rows()[0]!])!
    expect(one.summary).toBe('Coding: you rank 3 of 9.')
  })

  it('is null for no rows and keeps at most eight rows (one mark each)', () => {
    expect(scorecardSpec('None', [])).toBeNull()
    const many = Array.from({ length: 12 }, (_, i) => scoreRow(`k${i}`, `Skill ${i}`, 'pts', i, field9))
    const spec = scorecardSpec('Many', many)
    expectValid(spec)
    expect(spec.x.length).toBe(8)
    expect(spec.marks!.length).toBe(8)
  })

  it('handles a market with nobody else in it', () => {
    const spec = scorecardSpec('Alone', [scoreRow('a', 'Alpha', 'pts', 50, [])])
    expectValid(spec)
    expect(spec.marks).toEqual([{ at: 0, label: '1 of 1' }])
  })
})

describe('standingSpec', () => {
  it('draws rank by year as a line in the rank unit', () => {
    const spec = standingSpec('Your rank by year', [{ y: 2025, rank: 5, of: 12 }, { y: 2026, rank: 3, of: 12 }, { y: 2027, rank: 2, of: 11 }])
    expectValid(spec)
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('rank')
    expect(spec.x).toEqual([2025, 2026, 2027])
    expect(spec.series.length).toBe(1)
    expect(spec.series[0]!.values).toEqual([5, 3, 2])
    expect(spec.summary).toBe('You were #2 of 11 in 2027, from #5 of 12 in 2025.')
  })

  it('skips a year with no peers (rank 0 of 0) and needs two rows', () => {
    const spec = standingSpec('Your rank by year', [{ y: 2024, rank: 0, of: 0 }, { y: 2025, rank: 5, of: 12 }, { y: 2026, rank: 0, of: 0 }, { y: 2027, rank: 2, of: 11 }])
    expectValid(spec)
    expect(spec.x).toEqual([2025, 2027])
    expect(standingSpec('Your rank by year', [{ y: 2024, rank: 0, of: 0 }, { y: 2025, rank: 5, of: 12 }])).toBeNull()
    expect(standingSpec('Your rank by year', [])).toBeNull()
  })

  it('keeps the later row of one year and sorts by year', () => {
    const spec = standingSpec('Rank', [{ y: 2027, rank: 2, of: 11 }, { y: 2025, rank: 5, of: 12 }, { y: 2025, rank: 4, of: 12 }])
    expectValid(spec)
    expect(spec.x).toEqual([2025, 2027])
    expect(spec.series[0]!.values).toEqual([4, 2])
  })
})

describe('approvalSpec', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({ year: 2019 + i, approval: 40 + i * 2 }))

  it('draws twelve years of approval as a share', () => {
    const spec = approvalSpec(twelve)
    expectValid(spec)
    expect(spec.kind).toBe('line')
    expect(spec.unit).toBe('pct')
    expect(spec.x).toEqual(twelve.map((r) => r.year))
    expect(spec.series.length).toBe(1)
    expect(spec.series[0]!.values).toEqual([0.4, 0.42, 0.44, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6, 0.62])
    expect(spec.summary).toBe('Approval was 62% in 2030, from 40% in 2019.')
  })

  it('keeps the last twelve, holds a value to 0 to 100, and needs two years', () => {
    const more = Array.from({ length: 15 }, (_, i) => ({ year: 2016 + i, approval: i === 14 ? 140 : i === 0 ? -5 : 50 }))
    const spec = approvalSpec(more)
    expectValid(spec)
    expect(spec.x.length).toBe(12)
    expect(spec.series[0]!.values[11]).toBe(1)
    expect(approvalSpec([{ year: 2030, approval: 50 }])).toBeNull()
    expect(approvalSpec([])).toBeNull()
    const low = approvalSpec([{ year: 2029, approval: -5 }, { year: 2030, approval: 50 }])
    expect(low!.series[0]!.values[0]).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 7: hostile inputs

describe('hostile input', () => {
  const evil = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e300, -1e300]
  const names = ['', ' ', '\u0000\u0001', 'x'.repeat(500), '\u2014\u2013', '__proto__', 'constructor']

  it('ladderSpec gives a valid spec or null', () => {
    for (const bad of evil) {
      expectSafe(ladderSpec({ title: 'Evil', unit: 'count', rows: [src('a', bad), src('b', 3), src('c', bad)] }), `value ${bad}`)
      expectSafe(ladderSpec({ title: 'Evil', unit: 'count', rows: [src('a', 1, { prev: bad, history: [bad, 2, null, bad] }), src('b', 3)] }), `prev ${bad}`)
    }
    expect(ladderSpec({ title: 'Evil', unit: 'count', rows: [src('a', Number.NaN)] })).toBeNull()
    for (const name of names) {
      const spec = ladderSpec({ title: name, unit: 'count', rows: [src(name, 1, { name }), src('b', 2, { name }), src(name, 3)], summary: name })
      expectValid(spec, `name ${JSON.stringify(name)}`)
      for (const r of spec.rows!) {
        expect(r.name.length).toBeGreaterThan(0)
        expect(r.id.length).toBeGreaterThan(0)
        expect(['__proto__', 'constructor', 'prototype']).not.toContain(r.id)
      }
    }
  })

  it('ladderSpec gives every row a distinct id', () => {
    const spec = ladderSpec({ title: 'Same', unit: 'count', rows: [src('a', 3), src('a', 2), src('', 1), src('', 0)] })
    expectValid(spec)
    const ids = spec.rows!.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ladderSpec copes with five hundred rows and a hostile list', () => {
    const rows = Array.from({ length: 500 }, (_, i) => src(`id-${i}`, (i * 7919) % 1000, i === 250 ? { you: true } : {}))
    const spec = ladderSpec({ title: 'Five hundred', unit: 'count', rows })
    expectValid(spec)
    expect(spec.rows!.length).toBeLessThanOrEqual(12)
    expect(ladderSpec({ title: 'X', unit: 'count', rows: null as unknown as RankSource[] })).toBeNull()
    expectSafe(ladderSpec({ title: 'X', unit: 'count', rows: [null, undefined, 7, 'x', { value: 'a' }] as unknown as RankSource[] }))
  })

  it('marketLadderSpec gives a valid spec or null', () => {
    for (const bad of evil) {
      const rivals = [rival(0, bad), rival(1, 0.2), rival(2, 0.1)]
      expectSafe(marketLadderSpec(g0(), view({ share: bad, rivals, history: [hist(2029, bad), hist(2030, 0.1)] }), 'Me'), `share ${bad}`)
      expectSafe(marketLadderSpec(g0(), view({ share: 0.1, rivals, history: [hist(2029, 0.1, { rank: bad }), hist(2030, bad, { top: [`r1`, bad] })] }), 'Me'), `top ${bad}`)
    }
    for (const name of names) {
      const rivals = [{ ...rival(0, 0.3), name }, { ...rival(1, 0.2), name, id: name }, { ...rival(2, 0.1), id: 'you' }]
      const spec = marketLadderSpec(g0(), view({ rivals, noun: name, history: [hist(2029, 0.1), hist(2030, 0.1)] }), name)
      expectValid(spec, `name ${JSON.stringify(name)}`)
    }
  })

  it('marketLadderSpec copes with junk history, junk rivals and five hundred rivals', () => {
    const junkTops: unknown[] = [undefined, null, 'x', [], ['a'], ['a', 'b'], [1, 2], [{}, []], 'r0', 5]
    for (const top of junkTops) {
      expectSafe(marketLadderSpec(g0(), view({ history: [hist(2029, 0.1, { top: top as never }), hist(2030, 0.1, { top: top as never })] }), 'Me'))
    }
    expectSafe(marketLadderSpec(g0(), view({ history: null }), 'Me'))
    expectSafe(marketLadderSpec(g0(), view({ rivals: null, history: [hist(2029, 0.1), hist(2030, 0.1)] }), 'Me'))
    expectSafe(marketLadderSpec(g0(), view({ rivals: [null, 7, 'x', {}, rival(1, 0.1)], history: [hist(2029, 0.1), hist(2030, 0.1)] }), 'Me'))
    const big = Array.from({ length: 500 }, (_, i) => rival(i, 0.001 + (i % 50) * 0.001))
    const spec = marketLadderSpec(g0(), view({ share: 0.03, rivals: big, history: [hist(2029, 0.03), hist(2030, 0.03)] }), 'Me')
    expectValid(spec)
    expect(spec.rows!.length).toBeLessThanOrEqual(12)
    expect(spec.rows!.some((r) => r.you)).toBe(true)
  })

  it('shareSpec and marketSizeSpec give a valid spec or null', () => {
    for (const bad of evil) {
      const rows = [hist(2028, 0.1), hist(2029, bad, { lead: bad, size: bad }), hist(2030, 0.2, { lead: bad })]
      expectSafe(shareSpec(g0(), view({ history: rows })), `share ${bad}`)
      expectSafe(marketSizeSpec(g0(), view({ history: rows, growth: bad })), `size ${bad}`)
      expectSafe(shareSpec(g0(), view({ history: [hist(bad, 0.1), hist(2030, 0.1), hist(2029, 0.1)] })), `year ${bad}`)
    }
    expectSafe(shareSpec(g0(), view({ history: null })))
    expectSafe(shareSpec(g0(), view({ history: [null, 7, 'x', hist(2029, 0.1), hist(2030, 0.2)] })))
    expectSafe(shareSpec(g0(), view({ history: Array.from({ length: 500 }, (_, i) => hist(1600 + i, 0.1)) })))
    expectSafe(marketSizeSpec(g0(), view({ history: Array.from({ length: 500 }, (_, i) => hist(1600 + i, 0.1, { size: 1e300 })) })))
    expectSafe(marketSizeSpec(g0(), view({ history: sixYears(), noun: '' })))
  })

  it('scorecardSpec, standingSpec and approvalSpec give a valid spec or null', () => {
    for (const bad of evil) {
      const row: ScoreRow = { id: 'a', label: 'Alpha', unit: 'pts', mine: bad, market: bad, best: bad, rank: bad, of: bad, trend: 0 }
      expectSafe(scorecardSpec('Evil', [row, scoreRow('b', 'Beta', 'pts', 5, [1, 2])]), `score ${bad}`)
      expectSafe(standingSpec('Evil', [{ y: 2025, rank: bad, of: bad }, { y: 2026, rank: 3, of: 9 }, { y: 2027, rank: 2, of: 9 }]), `standing ${bad}`)
      expectSafe(standingSpec('Evil', [{ y: bad, rank: 3, of: 9 }, { y: 2026, rank: 3, of: 9 }, { y: 2027, rank: 2, of: 9 }]), `standing year ${bad}`)
      expectSafe(approvalSpec([{ year: 2025, approval: bad }, { year: 2026, approval: 50 }, { year: 2027, approval: 60 }]), `approval ${bad}`)
      expectSafe(approvalSpec([{ year: bad, approval: 50 }, { year: 2026, approval: 50 }, { year: 2027, approval: 60 }]), `approval year ${bad}`)
    }
    for (const name of names) {
      const row: ScoreRow = { id: name, label: name, unit: name, mine: 1, market: 1, best: 1, rank: 1, of: 1, trend: 0 }
      expectSafe(scorecardSpec(name, [row]), `score ${JSON.stringify(name)}`)
      expectSafe(standingSpec(name, [{ y: 2025, rank: 3, of: 9 }, { y: 2026, rank: 2, of: 9 }]), `standing ${JSON.stringify(name)}`)
    }
    expectSafe(standingSpec('Many', Array.from({ length: 500 }, (_, i) => ({ y: 1700 + i, rank: 1 + (i % 9), of: 10 }))))
    expectSafe(approvalSpec(Array.from({ length: 500 }, (_, i) => ({ year: 1700 + i, approval: i % 101 }))))
    expectSafe(scorecardSpec('Junk', [null, 7, 'x', {}] as unknown as ScoreRow[]))
    expectSafe(standingSpec('Junk', [null, 7, 'x', {}] as unknown as { y: number; rank: number; of: number }[]))
    expectSafe(approvalSpec([null, 7, 'x', {}] as unknown as { year: number; approval: number }[]))
  })
})

// ---------------------------------------------------------------------------
// Purity

describe('purity', () => {
  it('reads a deep-frozen view and game and gives the same answer as the live ones', () => {
    const frozenView = deepFreeze(structuredClone(real))
    const frozenGame = deepFreeze(structuredClone(owner.g))
    const rng = frozenGame.rng
    const before = JSON.stringify(frozenView) + JSON.stringify(frozenGame)
    const name = owner.a.name
    expect(shareSpec(frozenGame, frozenView)).toEqual(shareSpec(owner.g, real))
    expect(marketSizeSpec(frozenGame, frozenView)).toEqual(marketSizeSpec(owner.g, real))
    expect(marketLadderSpec(frozenGame, frozenView, name)).toEqual(marketLadderSpec(owner.g, real, name))
    // Fresh objects each call.
    const one = marketLadderSpec(frozenGame, frozenView, name)
    const two = marketLadderSpec(frozenGame, frozenView, name)
    expect(one).toEqual(two)
    expect(one).not.toBe(two)
    expect(one!.rows).not.toBe(two!.rows)
    expect(frozenGame.rng).toBe(rng)
    expect(JSON.stringify(frozenView) + JSON.stringify(frozenGame)).toBe(before)
  })

  it('reads a frozen hand-built view, frozen score rows and frozen ladder rows', () => {
    const v = deepFreeze(ladderView())
    expectValid(marketLadderSpec(g0(), v, 'Me'))
    expectValid(shareSpec(g0(), deepFreeze(view({ history: sixYears() }))))
    expectValid(marketSizeSpec(g0(), deepFreeze(view({ history: sixYears() }))))
    const rows = deepFreeze([src('a', 3, { history: [1, 2, 3], prev: 2 }), src('b', 2, { you: true })])
    expectValid(ladderSpec({ title: 'Frozen', unit: 'count', rows, prevRanks: deepFreeze({ a: 2 }) }))
    expectValid(scorecardSpec('Frozen', deepFreeze([scoreRow('a', 'Alpha', 'pts', 5, [1, 2, 3])])))
    expectValid(standingSpec('Frozen', deepFreeze([{ y: 2025, rank: 3, of: 9 }, { y: 2026, rank: 2, of: 9 }])))
    expectValid(approvalSpec(deepFreeze([{ year: 2025, approval: 50 }, { year: 2026, approval: 60 }])))
    expect(windowRows(deepFreeze([1, 2, 3, 4, 5, 6, 7, 8]), (x) => x === 7)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('draws no random number and edits nothing it reads', () => {
    const g = g0()
    const rng = g.rng
    const world = JSON.stringify(g)
    const v = ladderView()
    const stored = JSON.stringify(v)
    shareSpec(g, v)
    marketSizeSpec(g, v)
    marketLadderSpec(g, v, 'Me')
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(world)
    expect(JSON.stringify(v)).toBe(stored)
  })
})
