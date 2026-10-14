// Market-cap tiers and the outside float of a listed company (your listed company in Stocks).
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { newBiz } from '../src/game/business/founding'
import { CAP_TIER_MIN, TIER_LABEL, capTier, outsideFloat, type CapTier } from '../src/game/business/own-listing'
import { readCore, type GroupCore } from '../src/game/business/conglomerate-state'
import type { BizState } from '../src/game/business/state'
import { SIZE_LABEL } from '../src/game/invest/real'

describe('cap tiers and the float', () => {
  it.each<[number, CapTier]>([
    [200e9, 'mega'], [200e9 - 1, 'large'],
    [10e9, 'large'], [10e9 - 1, 'mid'],
    [2e9, 'mid'], [2e9 - 1, 'small'],
    [0, 'small'], [-5, 'small'],
    [1e300, 'mega'], [Infinity, 'mega'],
    [NaN, 'small'], [-Infinity, 'small'],
  ])('uses the fixed thresholds, inclusive at the lower bound (%s is %s)', (value, tier) => {
    expect(capTier(value)).toBe(tier)
  })

  it('keeps the thresholds in today\'s money', () => {
    expect(CAP_TIER_MIN).toEqual({ mega: 200_000_000_000, large: 10_000_000_000, mid: 2_000_000_000 })
  })

  it('labels match the engine size headings', () => {
    expect(TIER_LABEL.mega).toBe(SIZE_LABEL.mega)
    expect(TIER_LABEL.large).toBe(SIZE_LABEL.large)
    expect(TIER_LABEL.mid).toBe(SIZE_LABEL.mid)
    expect(TIER_LABEL.small).toBe('Small-cap')
  })

  it('outside float is what nobody inside holds', () => {
    const g = makeTestGame(1, { age: 40 })
    const b = newBiz(g, 'software', 'us', 'Chicago')
    b.share = 0.6
    b.executiveEquity = 0.05
    b.familyShares = [{ id: 'p1', share: 0.3 }]
    expect(outsideFloat(b)).toBeCloseTo(0.05, 9)

    b.share = 1
    b.executiveEquity = 0
    b.familyShares = []
    expect(outsideFloat(b)).toBe(0)

    b.share = 0.9
    b.familyShares = [{ id: 'p1', share: 0.3 }]
    expect(outsideFloat(b)).toBe(0)

    // A plain object works too, which is how a group's core is read.
    expect(outsideFloat({ share: 0.5, executiveEquity: 0.1, manager: null, familyShares: [{ share: 0.2 }] })).toBeCloseTo(0.2, 9)
  })

  it('counts a hired manager\'s equity once, as the larger of the two executive slices', () => {
    expect(outsideFloat({ share: 0.5, executiveEquity: 0.1, manager: { equity: 0.25 } })).toBeCloseTo(0.25, 9)
    expect(outsideFloat({ share: 0.5, executiveEquity: 0.3, manager: { equity: 0.25 } })).toBeCloseTo(0.2, 9)
    expect(outsideFloat({ share: 0.5, manager: {} })).toBeCloseTo(0.5, 9)
    // An executive slice over 100% is clamped, not subtracted in full.
    expect(outsideFloat({ share: 0, executiveEquity: 5 })).toBe(0)
  })

  it('takes a GroupCore and a BizState without a cast', () => {
    // These two helpers are the check: they stop compiling if either type stops fitting Holders.
    const floatOfCore = (c: GroupCore): number => outsideFloat(c)
    const floatOfBiz = (b: BizState): number => outsideFloat(b)
    const core = readCore({ id: 'grp1', share: 0.6, executiveEquity: 0.05, familyShares: [{ id: 'p1', share: 0.1 }] })
    expect(core).not.toBeNull()
    expect(floatOfCore(core!)).toBeCloseTo(0.25, 9)
    const g = makeTestGame(1, { age: 40 })
    const b = newBiz(g, 'software', 'us', 'Chicago')
    b.share = 0.8
    expect(floatOfBiz(b)).toBeCloseTo(0.2, 9)
  })

  it('stays a finite number between 0 and 1 for hostile values', () => {
    const hostile = [
      { share: NaN }, { share: Infinity }, { share: -Infinity }, { share: -3 }, { share: 7 },
      { share: 0.5, executiveEquity: NaN }, { share: 0.5, executiveEquity: Infinity }, { share: 0.5, executiveEquity: -1 },
      { share: 0.5, manager: { equity: NaN } },
      { share: 0.5, familyShares: [{ share: NaN }] },
      { share: 0.5, familyShares: [{ share: Infinity }, { share: -Infinity }] },
      { share: 0.5, familyShares: [{ share: -0.9 }] },
      { share: 0.5, familyShares: [{ share: 0.2 }, { share: NaN }] },
    ]
    for (const h of hostile) {
      const f = outsideFloat(h)
      expect(Number.isFinite(f)).toBe(true)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
    // A stake that is not a number leaves no float anyone can vouch for.
    expect(outsideFloat({ share: NaN })).toBe(0)
    // A stray bad slice counts as nothing, a good one still counts.
    expect(outsideFloat({ share: 0.5, familyShares: [{ share: 0.2 }, { share: NaN }] })).toBeCloseTo(0.3, 9)
    // A negative slice cannot grow the float.
    expect(outsideFloat({ share: 0.5, familyShares: [{ share: -0.9 }] })).toBeCloseTo(0.5, 9)
  })

  it('does not change what it is given', () => {
    const h = { share: 0.6, executiveEquity: 0.05, manager: { equity: 0.02 }, familyShares: [{ share: 0.1 }] }
    const before = JSON.stringify(h)
    outsideFloat(h)
    outsideFloat(h)
    expect(JSON.stringify(h)).toBe(before)
  })
})
