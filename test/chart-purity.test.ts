// R1-C10: the purity gate of the Charts track. Every builder of C4 (Profit and Loss), C5 (books), C6 (market and ranks)
// and the report assembler runs on a deeply frozen copy of a real game: it must not throw, must return null or a spec
// that readChartSpec accepts, and must leave the generator and the whole state byte-for-byte as they were. A builder that
// wrote anything would throw on the frozen state; one that drew a random number would move g.rng. (R1-C15 adds
// netWorthSpec to this file.)
import { describe, expect, it } from 'vitest'
import { marketViewOf, type MarketView } from '../src/game/business/competition'
import { scoreRow } from '../src/game/business/scorecard'
import { businessAssets, readBiz, type BizState } from '../src/game/business/state'
import { cashLinesSpec, cashWalkSpec, companyKpis, companyStrip, costShareSpec, profitSpec } from '../src/game/charts/books'
import { marketLadderSpec, marketSizeSpec, shareSpec } from '../src/game/charts/market'
import { bridgeSpec, plSpec, plSteps, plSummarySpec, profitVerdict } from '../src/game/charts/pl'
import { approvalSpec, ladderSpec, scorecardSpec, standingSpec } from '../src/game/charts/ranks'
import { readReportCharts, reportCharts } from '../src/game/charts/report'
import { readChartSpec } from '../src/game/charts/spec'
import { toJson } from '../src/game/business/util'
import type { Asset, GameState } from '../src/game/types'
import { deepFreeze, ownerGame, statementSamples } from './charts-kit'

interface Result {
  name: string
  value: unknown
}

const DASH = /[\u2013\u2014]/

/** Every builder of the track, run once on one company of a frozen game. */
function runAll(g: GameState, a: Asset, b: BizState, view: MarketView | null): Result[] {
  const s = b.last
  const out: Result[] = [
    { name: 'plSpec', value: plSpec(g, b) },
    { name: 'plSummarySpec', value: plSummarySpec(g, b) },
    { name: 'bridgeSpec', value: bridgeSpec(g, b) },
    { name: 'profitSpec', value: profitSpec(g, b) },
    { name: 'costShareSpec', value: costShareSpec(g, b) },
    { name: 'cashWalkSpec', value: cashWalkSpec(g, b) },
    { name: 'cashLinesSpec', value: cashLinesSpec(g, b) },
  ]
  for (const [i, k] of companyKpis(g, b, view).entries()) out.push({ name: `companyKpis[${i}]`, value: k })
  if (view) {
    out.push({ name: 'shareSpec', value: shareSpec(g, view) })
    out.push({ name: 'marketSizeSpec', value: marketSizeSpec(g, view) })
    out.push({ name: 'marketLadderSpec', value: marketLadderSpec(g, view, a.name) })
    // The ranks builders take any list; feed them this company's market.
    const rows = [{ id: 'you', name: a.name, value: view.share, you: true }, ...view.rivals.map((r) => ({ id: r.id, name: r.name, value: r.share }))]
    out.push({ name: 'ladderSpec', value: ladderSpec({ title: 'Share', unit: 'pct', rows }) })
    out.push({ name: 'scorecardSpec', value: scorecardSpec('Standing', [scoreRow('share', 'Share', '%', view.share, view.rivals.map((r) => r.share))]) })
    out.push({ name: 'standingSpec', value: standingSpec('Rank', view.history.map((h) => ({ y: h.year, rank: h.rank, of: 1 + view.rivals.length }))) })
    out.push({ name: 'approvalSpec', value: approvalSpec(view.history.map((h) => ({ year: h.year, approval: h.share * 100 }))) })
  }
  const report = reportCharts(g, a, b, view)
  out.push({ name: 'reportCharts', value: report })
  out.push({ name: 'reportCharts(null view)', value: reportCharts(g, a, b, null) })
  if (s) out.push({ name: 'plSteps', value: plSteps(b, s) })
  out.push({ name: 'profitVerdict', value: profitVerdict(g, b) })
  out.push({ name: 'companyStrip', value: companyStrip(g) })
  return out
}

/** Each result is null, a spec the reader accepts, or one of the non-spec shapes below. */
function check(label: string, r: Result): void {
  const { name, value } = r
  const where = `${label} ${name}`
  if (value === null) return
  if (name === 'plSteps') {
    expect(Array.isArray(value), where).toBe(true)
    for (const step of value as { value: number }[]) expect(Number.isFinite(step.value), where).toBe(true)
    return
  }
  if (name === 'profitVerdict') {
    expect(typeof value, where).toBe('string')
    expect((value as string).length, where).toBeLessThanOrEqual(120)
    expect(DASH.test(value as string), where).toBe(false)
    return
  }
  if (name === 'companyStrip') {
    for (const row of value as { net: number; delta: number | null; spark: (number | null)[] }[]) {
      expect(Number.isFinite(row.net), where).toBe(true)
      expect(row.delta === null || Number.isFinite(row.delta), where).toBe(true)
      for (const v of row.spark) expect(v === null || Number.isFinite(v), where).toBe(true)
    }
    return
  }
  if (name.startsWith('reportCharts')) {
    // The assembler's value is not a spec; it must read back from its own JSON.
    expect(readReportCharts(toJson(value)), where).not.toBeNull()
    return
  }
  expect(readChartSpec(value), where).not.toBeNull()
}

/** Run every builder over every company of a game, on a frozen copy, and prove nothing moved. */
function gate(label: string, g: GameState): number {
  const frozen = deepFreeze(structuredClone(g))
  const before = JSON.stringify(frozen)
  const rng = frozen.rng
  let seen = 0
  for (const a of businessAssets(frozen)) {
    // The company as the books hand it over (a normalized copy) and as the yearly loop holds it (the stored object).
    const copies: [string, BizState][] = [
      ['normalized', deepFreeze(readBiz(frozen, a))],
      ['stored', a.details as unknown as BizState],
    ]
    for (const [how, b] of copies) {
      const view = deepFreeze(marketViewOf(frozen, b))
      const first = runAll(frozen, a, b, view)
      for (const r of first) check(`${label} ${a.name} ${how}`, r)
      // Twice gives the same answer: no counter, cache or clock inside a builder.
      expect(runAll(frozen, a, b, view), `${label} ${a.name} ${how} again`).toEqual(first)
    }
    seen++
  }
  expect(frozen.rng, label).toBe(rng)
  expect(JSON.stringify(frozen), `${label} state`).toBe(before)
  return seen
}

describe('the chart builders are pure', () => {
  it('over 56 companies, one of each industry (statementSamples)', { timeout: 300_000 }, () => {
    const samples = statementSamples([21])
    expect(samples.length).toBeGreaterThanOrEqual(50)
    const g = samples[0]!.g
    const rng = g.rng
    const text = JSON.stringify(g)
    expect(gate('samples', g)).toBe(businessAssets(g).length)
    // The original game was not touched either.
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(text)
  })

  it('over an owner-CEO with eight years of books and a second company', { timeout: 300_000 }, () => {
    const { g, a } = ownerGame({ years: 8, companies: 2 })
    expect(gate('owner', g)).toBe(2)
    const b = readBiz(g, a)
    const c = reportCharts(g, a, b, marketViewOf(g, b))
    expect(c).not.toBeNull()
    expect(c!.cash).toBeDefined()
    expect(c!.costs).toBeDefined()
    expect(c!.share).toBeDefined()
  })

  it('reportCharts agrees with its own reader on every company of the samples', { timeout: 300_000 }, () => {
    const { g } = statementSamples([21])[0]!
    let built = 0
    for (const a of businessAssets(g)) {
      const b = readBiz(g, a)
      const c = reportCharts(g, a, b, marketViewOf(g, b))
      if (!c) continue
      built++
      expect(readReportCharts(toJson(c)), a.name).toEqual(toJson(c))
    }
    expect(built).toBeGreaterThan(0)
  })
})
