// R1-C3: the three series fit the save's node budget (the loader allows 500,000 JSON values). Thirty companies each
// with thirty book rows, a twenty-year market ladder of eight rivals, and a 120-row life series cost about 29,900
// nodes more than v4.0.2 did, 6% of the cap. Counted with jsonNodes, the way the loader counts.
import { describe, expect, it } from 'vitest'
import { recordYear } from '../src/game/business/economy'
import { emptyMarket, TOP_RIVALS } from '../src/game/business/competition-state'
import type { BizState, Statement } from '../src/game/business/state'
import { LIFE_SERIES_ROWS, writeLifeRow } from '../src/game/life-series'
import type { Json } from '../src/game/types'
import { jsonNodes, statementSamples } from './charts-kit'
import { adult } from './market-kit'

interface Base {
  b: BizState
  s: Statement
}

function base(): Base {
  const x = statementSamples([1]).find((y) => y.industry === 'restaurant')!
  return { b: structuredClone(x.b), s: { ...x.s } }
}

/** `n` companies with 31 booked years each, as the player's companies are after thirty years. */
function companies(n: number, lean: boolean): BizState[] {
  const { b, s } = base()
  return Array.from({ length: n }, () => {
    const c = structuredClone(b)
    c.history = []
    for (let i = 0; i < 31; i++) recordYear(c, { ...s, year: 2000 + i }, lean ? { lean: true } : {})
    return c
  })
}

/** A market with 20 history rows, with or without the eight-rival list in each. */
function market(withTop: boolean): Json {
  const m = JSON.parse(JSON.stringify(emptyMarket('us'))) as Record<string, Json>
  m.history = Array.from({ length: 20 }, (_, i) => ({
    year: 2000 + i,
    share: 0.1,
    rank: 2,
    size: 1e9,
    lead: 0.2,
    hhi: 300,
    ...(withTop ? { top: Array.from({ length: TOP_RIVALS * 2 }, (_, k) => (k % 2 ? 0.01 + k / 1000 : `rival-${i}-${k}`)) } : {}),
  }))
  return m
}

function lifeSeriesNodes(): number {
  const g = adult(5, 2030, 'us')
  for (let a = 0; a < 130; a++) {
    g.character.age = a
    g.year = 1900 + a
    writeLifeRow(g)
  }
  return jsonNodes(g.flags.lifeSeries)
}

describe('state growth', () => {
  it('thirty companies: S1 about 18,600, S2 about 10,200, S3 about 1,100, the sum under 32,000', () => {
    const full = companies(30, false)
    const lean = companies(30, true)
    const s1 = jsonNodes(full.map((c) => c.history)) - jsonNodes(lean.map((c) => c.history))
    const s2 = 30 * (jsonNodes(market(true)) - jsonNodes(market(false)))
    const s3 = lifeSeriesNodes()
    expect(full[0]!.history).toHaveLength(30)
    expect(lean[0]!.history).toHaveLength(10)
    expect(s1).toBeLessThanOrEqual(20_000)
    expect(s1).toBeGreaterThan(18_000)
    expect(s2).toBeLessThanOrEqual(10_500)
    expect(s2).toBeGreaterThan(9_500)
    expect(s3).toBeLessThanOrEqual(1_200)
    expect(LIFE_SERIES_ROWS).toBe(120)
    expect(s1 + s2 + s3).toBeLessThanOrEqual(32_000)
  }, 20_000)

  it('a twelve-company game adds under 14,000 nodes', () => {
    const full = companies(12, false)
    const lean = companies(12, true)
    const s1 = jsonNodes(full.map((c) => c.history)) - jsonNodes(lean.map((c) => c.history))
    const s2 = 12 * (jsonNodes(market(true)) - jsonNodes(market(false)))
    expect(s1 + s2 + lifeSeriesNodes()).toBeLessThan(14_000)
  }, 20_000)
})
