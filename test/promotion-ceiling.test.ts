// X13: the stacked promotion terms in a company's appeal have a ceiling.
//
// appealOf (business/economy.ts) multiplies three promotion terms together:
//   marketingFactor(marketingLevel)  level clamped 0 to 3, so at most 1.321 times level 0
//   (1 + campaignBoost)              written with a 0 to 0.6 clamp, so at most 1.6
//   the brand term                   brand 0 to 100, industry growth up to 1, so at most 1.30
// Worst case against a firm with no marketing, no campaign and an average brand (50) is
// 1.321 * 1.6 * 1.30 = 2.75 at growth 1.0. These tests pin that the product stays under 2.8,
// including for a hostile save record, so the Show Circuit (R9) starts from a known baseline.
// The lower cap of 1.35 on the product is a balance change that ships with R9.
import { describe, expect, it } from 'vitest'
import { appealOf } from '../src/game/business/economy'
import { INDUSTRIES, industryDef } from '../src/game/business/industries'
import { normalizeBiz, type BizState } from '../src/game/business/state'
import type { Json } from '../src/game/types'
import { makeTestGame } from './helpers'

/** The most the three promotion terms may lift one firm over the same firm with none of them. */
const CEILING = 2.8

const ALL = Object.values(INDUSTRIES)
const TOP_GROWTH = Math.max(...ALL.map((d) => d.growth))
const TOP = ALL.find((d) => d.growth === TOP_GROWTH)!.id
/** Three trades: a low growth one, a mid one, and the highest growth in the game. */
const TRADES = ['restaurant', 'software', TOP] as const

/** A saved company record for `industry`, with the three promotion fields set as given. */
function record(industry: string, promo: { marketingLevel: number; campaignBoost: number; brand: number }): Record<string, Json> {
  return {
    industry, countryId: 'us', city: 'Chicago', founded: 2020,
    outlets: [{ countryId: 'us', city: 'Chicago', count: 1, opened: 2020 }],
    quality: 60, morale: 70, price: 20,
    ...promo,
  } as unknown as Record<string, Json>
}

/** The firm as the save loader reads it, so the hostile record meets the same clamps as a real one. */
function firm(industry: string, promo: { marketingLevel: number; campaignBoost: number; brand: number }): BizState {
  return normalizeBiz(record(industry, promo), 2026)
}

const BARE = { marketingLevel: 0, campaignBoost: 0, brand: 50 }
const FULL = { marketingLevel: 3, campaignBoost: 0.6, brand: 100 }

describe('the promotion ceiling (X13)', () => {
  it('uses growth 1 as the top of the industry range, which the 2.75 algebra assumes', () => {
    expect(TOP_GROWTH).toBe(1)
    for (const d of ALL) expect(d.growth).toBeLessThanOrEqual(1)
    expect(industryDef(TOP).growth).toBe(TOP_GROWTH)
  })

  for (const trade of TRADES) {
    describe(`${trade} (growth ${industryDef(trade).growth})`, () => {
      const g = makeTestGame()
      const bare = appealOf(g, firm(trade, BARE), g.year)

      it('has a real appeal to compare against', () => {
        expect(bare).toBeGreaterThan(0.1)
        expect(Number.isFinite(bare)).toBe(true)
      })

      it('lifts at most 2.8 times with marketing 3, campaign 0.6 and brand 100', () => {
        const ratio = appealOf(g, firm(trade, FULL), g.year) / bare
        expect(ratio).toBeGreaterThan(1.5)
        expect(ratio).toBeLessThanOrEqual(CEILING)
        // The baseline R9 starts from: 1.321 * 1.6 * (1 + 0.5 * (0.25 + 0.35 * growth)).
        const g1 = industryDef(trade).growth
        expect(ratio).toBeCloseTo(1.3207 * 1.6 * (1 + 0.5 * (0.25 + 0.35 * g1)), 2)
      })

      it('keeps each term inside its own share of the ceiling', () => {
        const marketing = appealOf(g, firm(trade, { ...BARE, marketingLevel: 3 }), g.year) / bare
        const campaign = appealOf(g, firm(trade, { ...BARE, campaignBoost: 0.6 }), g.year) / bare
        const brand = appealOf(g, firm(trade, { ...BARE, brand: 100 }), g.year) / bare
        expect(marketing).toBeLessThanOrEqual(1.33)
        expect(campaign).toBeLessThanOrEqual(1.6 + 1e-9)
        expect(brand).toBeLessThanOrEqual(1.3 + 1e-9)
      })

      it('gives a hostile record (marketing 300, campaign 60, brand 10000) the same bound', () => {
        const hostile = firm(trade, { marketingLevel: 300, campaignBoost: 60, brand: 10000 })
        expect(hostile.marketingLevel).toBe(3)
        expect(hostile.campaignBoost).toBe(0.6)
        expect(hostile.brand).toBe(100)
        const ratio = appealOf(g, hostile, g.year) / bare
        expect(Number.isFinite(ratio)).toBe(true)
        expect(ratio).toBeLessThanOrEqual(CEILING)
        // 100 times the clamps is no more than the clamps themselves.
        expect(ratio).toBeCloseTo(appealOf(g, firm(trade, FULL), g.year) / bare, 10)
      })

      it('gives a negative or non-finite hostile record no lift above a bare firm', () => {
        for (const bad of [-5, Number.NaN, Number.NEGATIVE_INFINITY, null, 'lots']) {
          const odd = firm(trade, { marketingLevel: bad as number, campaignBoost: bad as number, brand: bad as number })
          const ratio = appealOf(g, odd, g.year) / bare
          expect(Number.isFinite(ratio)).toBe(true)
          expect(ratio).toBeLessThanOrEqual(CEILING)
        }
      })
    })
  }

  it('stays under the ceiling even when the other appeal terms are strong', () => {
    // The ceiling is on the promotion terms alone: the same firm with and without them.
    const g = makeTestGame()
    const strong = { ...record(TOP, BARE), quality: 100, morale: 100 } as Record<string, Json>
    const lo = normalizeBiz(strong, g.year)
    const hi = normalizeBiz({ ...strong, ...FULL } as Record<string, Json>, g.year)
    expect(appealOf(g, hi, g.year) / appealOf(g, lo, g.year)).toBeLessThanOrEqual(CEILING)
  })
})
