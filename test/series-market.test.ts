// R1-C3 (S2): the market ladder history. Each booked year keeps the eight biggest rivals' shares as a flat
// [id, share, id, share, ...] list (17 nodes a row, so the 30-company budget holds), read back through a bounded reader.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { marketViewOf, refreshMarket } from '../src/game/business/competition'
import { marketKey } from '../src/game/business/competition-core'
import { emptyMarket, readMarket, TOP_RIVALS, topPairs, type MarketHistory } from '../src/game/business/competition-state'
import { businessAssets, readBiz } from '../src/game/business/state'
import { migrateSave } from '../src/game/save-schema'
import type { Json } from '../src/game/types'
import { statementSamples } from './charts-kit'

const KEY = 'us'

/** A stored market with the given history rows, read back through the real reader. */
function readRows(rows: Record<string, unknown>[]): MarketHistory[] {
  const raw = JSON.parse(JSON.stringify(emptyMarket(KEY))) as Record<string, Json>
  raw.history = rows as Json
  return readMarket(raw, KEY)!.history
}

const row = (extra: Record<string, unknown> = {}) => ({ year: 2030, share: 0.1, rank: 2, size: 1e9, ...extra })

describe('the writer', () => {
  it('1: a real yearly pass writes top as a flat, descending list of at most eight rounded shares', () => {
    const samples = statementSamples([1])
    let withTop = 0
    for (const x of samples) {
      const st = readMarket(x.b.market, marketKey(x.b))
      const h = st?.history[st.history.length - 1]
      if (!h?.top) continue
      withTop++
      const top = h.top
      expect(top.length % 2, x.industry).toBe(0)
      expect(top.length, x.industry).toBeLessThanOrEqual(TOP_RIVALS * 2)
      expect(top.length, x.industry).toBeGreaterThan(0)
      const pairs = topPairs(h)
      expect(pairs.length, x.industry).toBe(top.length / 2)
      expect(new Set(pairs.map((p) => p[0])).size, x.industry).toBe(pairs.length)
      for (let i = 0; i < pairs.length; i++) {
        const [id, share] = pairs[i]!
        expect(typeof id).toBe('string')
        expect(share).toBeGreaterThan(0)
        expect(share).toBeLessThanOrEqual(1)
        expect(Math.round(share * 1e6) / 1e6).toBe(share)
        if (i > 0) expect(share).toBeLessThanOrEqual(pairs[i - 1]![1])
      }
      // The view hands the same list on.
      const view = marketViewOf(x.g, x.b)
      expect(view.history[view.history.length - 1]!.top).toEqual(top)
    }
    expect(withTop).toBeGreaterThan(30)
  })

  it('the ids are the rivals the booking kept (the biggest, from its sorted list)', () => {
    const x = statementSamples([1]).find((y) => y.industry === 'restaurant')!
    const st = readMarket(x.b.market, marketKey(x.b))!
    const h = st.history[st.history.length - 1]!
    expect(topPairs(h)).toEqual(st.rivals.slice(0, TOP_RIVALS).filter((r) => r[1] > 0))
  })

  it('4: booking the same year twice leaves one row', () => {
    const x = statementSamples([1]).find((y) => y.industry === 'restaurant')!
    const before = JSON.stringify(readMarket(x.b.market, marketKey(x.b))!.history)
    refreshMarket(x.g, x.a, x.b, x.b.last!.year, x.b.last!, null)
    const st = readMarket(x.b.market, marketKey(x.b))!
    expect(JSON.stringify(st.history)).toBe(before)
    expect(new Set(st.history.map((h) => h.year)).size).toBe(st.history.length)
  })

  it('5: the history still keeps the newest twenty years, each with its list', () => {
    const x = statementSamples([1]).find((y) => y.industry === 'restaurant')!
    const stmt = x.b.last!
    for (let i = 1; i <= 25; i++) refreshMarket(x.g, x.a, x.b, stmt.year + i, { ...stmt, year: stmt.year + i }, null)
    const st = readMarket(x.b.market, marketKey(x.b))!
    expect(st.history).toHaveLength(20)
    expect(st.history[0]!.year).toBe(stmt.year + 6)
    expect(st.history[19]!.year).toBe(stmt.year + 25)
    expect(st.history.every((h) => h.top !== undefined && h.top.length > 0 && h.top.length <= 16)).toBe(true)
  })
})

describe('the reader', () => {
  it('3: rows without top read unchanged, and topPairs gives none', () => {
    const rows = readRows([row({ lead: 0.2, hhi: 300 })])
    expect(rows).toEqual([{ year: 2030, share: 0.1, rank: 2, size: 1e9, lead: 0.2, hhi: 300 }])
    expect('top' in rows[0]!).toBe(false)
    expect(topPairs(rows[0]!)).toEqual([])
    expect(topPairs({})).toEqual([])
  })

  it('3: the v4.0.2 fixture markets read with no top', () => {
    const raw = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
    const result = migrateSave(structuredClone(raw))
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    for (const a of businessAssets(result.game)) {
      const b = readBiz(result.game, a)
      const st = readMarket(b.market, marketKey(b))!
      expect(st.history.length).toBeGreaterThan(0)
      for (const h of st.history) {
        expect('top' in h).toBe(false)
        expect(topPairs(h)).toEqual([])
      }
    }
  })

  it('keeps a clean list as it is, and decodes it', () => {
    const rows = readRows([row({ top: ['a', 0.5, 'b', 0.25] })])
    expect(rows[0]!.top).toEqual(['a', 0.5, 'b', 0.25])
    expect(topPairs(rows[0]!)).toEqual([['a', 0.5], ['b', 0.25]])
  })

  it('2: a list that is not a bounded flat list of id and share is dropped, whole', () => {
    const bad: unknown[] = [
      'abc',
      { a: 1 },
      7,
      null,
      ['a', 0.5, 'b'],
      [1, 0.5],
      ['a', '0.5'],
      ['a', Number.NaN],
      ['a', Number.POSITIVE_INFINITY],
      ['a', 0.5, 'b', null],
      ['', 0.5],
      ['x'.repeat(61), 0.5],
      Array.from({ length: 80 }, (_, i) => (i % 2 ? 0.01 : `r${i}`)),
      Array.from({ length: 18 }, (_, i) => (i % 2 ? 0.01 : `r${i}`)),
    ]
    for (const top of bad) {
      const rows = readRows([row({ top })])
      expect(rows, JSON.stringify(top)).toHaveLength(1)
      expect('top' in rows[0]!, JSON.stringify(top)).toBe(false)
      expect(rows[0]!.share).toBe(0.1)
    }
  })

  it('2: shares are clamped to 0 to 1 and rounded, and entries at or below 0 and repeated ids are dropped', () => {
    expect(readRows([row({ top: ['a', 5] })])[0]!.top).toEqual(['a', 1])
    expect(readRows([row({ top: ['a', 1e300, 'b', 0.2] })])[0]!.top).toEqual(['a', 1, 'b', 0.2])
    expect(readRows([row({ top: ['a', -1, 'b', 0.2] })])[0]!.top).toEqual(['b', 0.2])
    expect(readRows([row({ top: ['a', 0, 'b', 0.2] })])[0]!.top).toEqual(['b', 0.2])
    expect(readRows([row({ top: ['a', 0.123456789] })])[0]!.top).toEqual(['a', 0.123457])
    expect(readRows([row({ top: ['a', 0.5, 'a', 0.3, 'b', 0.1] })])[0]!.top).toEqual(['a', 0.5, 'b', 0.1])
    // Nothing left means no key at all.
    for (const top of [[], ['a', -1], ['a', 0, 'b', -0.5]]) expect('top' in readRows([row({ top })])[0]!, JSON.stringify(top)).toBe(false)
  })

  it('exactly sixteen entries are accepted', () => {
    const top = Array.from({ length: 16 }, (_, i) => (i % 2 ? 0.01 : `r${i}`))
    expect(readRows([row({ top })])[0]!.top).toHaveLength(16)
  })
})
