// Ecosystem companies: the operating system and its bounded lock-in. `osStrength` reads the best OS line (it ages), `osPull`
// only adds to the plain network pull and stops at the cap, and `marketCtxFor` swaps the pull for device companies alone.
import { describe, expect, it } from 'vitest'
import { marketDef } from '../src/game/business/competition-data'
import { marketOfBiz, saveMarket } from '../src/game/business/competition'
import { networkPull } from '../src/game/business/competition-roster'
import { DEVICE_NETWORK, OS_FAMILY, OS_PULL_CAP } from '../src/game/business/devices-data'
import { marketCtxFor, osPull, osStrength } from '../src/game/business/economy'
import { edgeOf } from '../src/game/business/product-market'
import { bizOf, type Product } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import { adult, company } from './market-kit'

const devices = (seed = 5, year = 2026) => {
  const g = adult(seed, year, 'us')
  const a = company(g, 'devices', { cash: 5e9 })
  return { g, a, b: bizOf(g, a) }
}

const line = (quality: number, launched: number, over: Partial<Product> = {}): Product => ({
  name: OS_FAMILY, launched, boost: 0, quality, family: OS_FAMILY, kind: 'core', ...over,
})

const holder = (products: Product[], industry: Industry = 'devices') => ({ industry, products })

describe('osStrength', () => {
  it('is 0 without an OS line, and for a trade other than devices', () => {
    expect(osStrength(holder([]), 2026)).toBe(0)
    expect(osStrength(holder([{ name: 'Smartphone', launched: 2026, boost: 0, quality: 90, family: 'Smartphone', kind: 'core' }]), 2026)).toBe(0)
    expect(osStrength(holder([line(100, 2026)], 'software'), 2026)).toBe(0)
    expect(osStrength(holder([line(100, 2026)], 'restaurant'), 2026)).toBe(0)
  })

  it('reads quality from 35 (nothing) to 80 (all of it)', () => {
    expect(osStrength(holder([line(35, 2026)]), 2026)).toBe(0)
    expect(osStrength(holder([line(57.5, 2026)]), 2026)).toBeCloseTo(0.5, 10)
    expect(osStrength(holder([line(80, 2026)]), 2026)).toBe(1)
    expect(osStrength(holder([line(100, 2026)]), 2026)).toBe(1)
    expect(osStrength(holder([line(10, 2026)]), 2026)).toBe(0)
  })

  it('ages 1.2 points a year after the first', () => {
    expect(osStrength(holder([line(80, 2020)]), 2030)).toBeCloseTo(0.76, 2)
    expect(osStrength(holder([line(80, 2026)]), 2027)).toBe(1)
    expect(osStrength(holder([line(80, 2026)]), 2026)).toBe(1)
    // an old line eventually falls to nothing, and never below it
    expect(osStrength(holder([line(40, 1990)]), 2026)).toBe(0)
  })

  it('counts the best line, a premium variant included, and no bundle or add-on', () => {
    const base = line(50, 2026)
    const premium = line(80, 2026, { name: `${OS_FAMILY} Pro`, kind: 'premium' })
    expect(osStrength(holder([base, premium]), 2026)).toBe(1)
    expect(osStrength(holder([premium, base]), 2026)).toBe(1)
    const bundle = line(95, 2026, { name: `${OS_FAMILY} & Smartphone Bundle`, kind: 'bundle' })
    const addon = line(95, 2026, { name: `${OS_FAMILY} Add-on`, kind: 'addon' })
    expect(osStrength(holder([base, bundle, addon]), 2026)).toBeCloseTo((50 - 35) / 45, 10)
    expect(osStrength(holder([bundle, addon]), 2026)).toBe(0)
  })
})

describe('osPull', () => {
  it('is the plain pull without an OS and the capped pull with a full one', () => {
    expect(osPull(0.8, 1)).toBe(OS_PULL_CAP)
    expect(osPull(0.5, 0)).toBeCloseTo(networkPull(0.5, DEVICE_NETWORK), 12)
    expect(osPull(0, 1)).toBe(1)
  })

  it('holds the table of the design', () => {
    expect(osPull(0.3, 1)).toBeCloseTo(1.54, 2)
    expect(osPull(0.5, 1)).toBeCloseTo(2.36, 2)
    expect(osPull(0.6, 1)).toBeCloseTo(2.94, 2)
    expect(osPull(0.3, 0)).toBeCloseTo(1.31, 2)
    expect(osPull(0.5, 0)).toBeCloseTo(1.71, 2)
    expect(osPull(0.6, 0)).toBeCloseTo(1.96, 2)
    expect(networkPull(0.3, DEVICE_NETWORK * 0.5)).toBeCloseTo(1.14, 2)
  })

  it('never falls below the plain pull, never passes the cap, and only grows with strength', () => {
    for (let i = 0; i <= 10; i++) {
      const base = i / 10
      const plain = networkPull(base, DEVICE_NETWORK)
      let prev = -Infinity
      for (let j = 0; j <= 10; j++) {
        const p = osPull(base, j / 10)
        expect(Number.isFinite(p)).toBe(true)
        expect(p).toBeGreaterThanOrEqual(plain)
        expect(p).toBeLessThanOrEqual(Math.max(plain, OS_PULL_CAP))
        expect(p).toBeGreaterThanOrEqual(prev)
        prev = p
      }
    }
  })
})

describe('marketCtxFor swaps only the pull, for device companies only', () => {
  it('lets a device company with an OS pull harder and moves nothing else', () => {
    const { g, b } = devices()
    const st = marketOfBiz(b)
    st.base = 0.6
    st.year = g.year - 1
    saveMarket(b, st)
    const none = marketCtxFor(g, b, g.year)
    expect(none.w).toBeCloseTo(networkPull(0.6, 1.5), 12)
    b.products.push({ name: OS_FAMILY, launched: g.year - 1, boost: 0, quality: 80, family: OS_FAMILY, kind: 'core' })
    const withOs = marketCtxFor(g, b, g.year)
    expect(withOs.w).toBeCloseTo(osPull(0.6, osStrength(b, g.year)), 12)
    expect(withOs.w).toBeGreaterThan(none.w)
    expect({ ...withOs, w: 0 }).toEqual({ ...none, w: 0 }) // nothing else moves
    expect(marketCtxFor(g, b, g.year)).toEqual(withOs) // and a repeat is equal
  })

  it('leaves a second device company without an OS on the plain pull (the cached context is never mutated)', () => {
    const { g, b } = devices()
    const st = marketOfBiz(b)
    st.base = 0.6
    st.year = g.year - 1
    saveMarket(b, st)
    b.products.push({ name: OS_FAMILY, launched: g.year - 1, boost: 0, quality: 80, family: OS_FAMILY, kind: 'core' })
    const withOs = marketCtxFor(g, b, g.year)
    const rival = company(g, 'devices', { cash: 5e9 })
    const rb = bizOf(g, rival)
    const rst = marketOfBiz(rb)
    rst.base = 0.6
    rst.year = g.year - 1
    saveMarket(rb, rst)
    const plain = marketCtxFor(g, rb, g.year)
    expect(plain.w).toBeCloseTo(networkPull(0.6, DEVICE_NETWORK), 12)
    expect(plain.w).toBeLessThan(withOs.w)
    // and the first company still gets what it got
    expect(marketCtxFor(g, b, g.year).w).toBeCloseTo(withOs.w, 12)
  })

  it('gives every other trade the plain pull of its own market, an OS line or not', () => {
    const g = adult(5, 2026, 'us')
    for (const id of ['restaurant', 'software'] as const) {
      const b = bizOf(g, company(g, id, { cash: 1e8 }))
      b.products.push({ name: OS_FAMILY, launched: g.year - 1, boost: 0, quality: 100, family: OS_FAMILY, kind: 'core' })
      const ctx = marketCtxFor(g, b, g.year)
      expect(ctx.w).toBeCloseTo(networkPull(ctx.base, marketDef(id).network), 12)
    }
  })
})

describe('quality still beats lock-in', () => {
  it('lets a rival 30 points better win share back even at the cap', () => {
    expect(OS_PULL_CAP * edgeOf(50, { offer: 1, quality: 80 })).toBeLessThan(1.2)
  })
})
