// Share structure: how many shares a company is split into, what retail investors make of the
// price of one, and how an IPO of a chosen float prices and fills. Pure: no game RNG (the day-one
// move is rolled by goPublic). Prices are constant 2026 dollars, like all money.
import type { BizState } from './state'
import { clampN } from './util'

export const MIN_SHARES = 1_000
export const MAX_SHARES = 10_000_000_000
export const DEFAULT_SHARES = 10_000_000
/** Percent of the company an IPO floats (new shares). */
export const FLOAT_MIN = 5
export const FLOAT_MAX = 60
export const FLOAT_DEFAULT = 25
/** Underwriting fees, a share of the money raised. */
export const IPO_FEES = 0.06
/** Without a chosen share count (old saves, NPC companies), shares list at about this price. */
const LEGACY_PRICE = 25

/** A private company's chosen share count, or null for the old rule (about $25 a share at the IPO). */
export function shareCountOf(b: Pick<BizState, 'shareCount'>): number | null {
  const n = b.shareCount
  return typeof n === 'number' && Number.isFinite(n) && n >= MIN_SHARES ? Math.round(clampN(n, MIN_SHARES, MAX_SHARES)) : null
}

// Retail appeal against log10(price): a penny-stock look below $1, a sweet spot around $3-$30,
// fading as a single share gets expensive.
const APPEAL: readonly (readonly [number, number])[] = [[-2, 0.2], [0, 0.55], [0.48, 0.9], [0.9, 1], [1.48, 0.92], [2, 0.7], [3, 0.35], [4, 0.2]]

/** How much retail investors like a share at this price (0-1). */
export function retailAppeal(price: number): number {
  if (!(price > 0)) return APPEAL[0][1]
  const x = Math.log10(price)
  if (x <= APPEAL[0][0]) return APPEAL[0][1]
  for (let i = 1; i < APPEAL.length; i++) {
    const [x1, y1] = APPEAL[i]
    if (x <= x1) {
      const [x0, y0] = APPEAL[i - 1]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return APPEAL[APPEAL.length - 1][1]
}

/** Retail investors' verdict on a share price, for previews and notices. */
export function retailVerdict(price: number): string {
  const a = retailAppeal(price)
  if (price < 1) return 'it looks like a penny stock, which puts many buyers off'
  if (a >= 0.85) return 'retail investors love an affordable share'
  if (a >= 0.65) return 'retail investors are interested'
  if (a >= 0.4) return 'retail investors find one share pricey'
  return 'one share is too expensive for most retail investors'
}

const LEGACY_APPEAL = retailAppeal(LEGACY_PRICE)

/**
 * How deep the market is for selling your shares (1 at the old $25 listing price): more retail
 * buyers for an affordable share, fewer for an expensive one.
 */
export function retailDepth(price: number): number {
  return clampN(1 + (0.3 * (retailAppeal(price) - LEGACY_APPEAL)) / LEGACY_APPEAL, 0.8, 1.25)
}

export interface IpoPlan {
  /** Fraction of the company offered (0.05-0.6). */
  float: number
  /** Shares before the listing and their price at today's value. */
  baseShares: number
  basePrice: number
  appeal: number
  /** Orders for the offer, as a multiple of it (2 = twice oversubscribed). */
  coverage: number
  /** Price change against the base price from demand (+ above the range, - a discount). */
  premium: number
  offered: number
  sold: number
  /** IPO price per share (before the day-one move). */
  price: number
  raise: number
  fees: number
  sharesOut: number
  /** Everyone's ownership is multiplied by this (the shares before over the shares after). */
  retain: number
}

/**
 * An IPO of `floatPct` percent of a company worth `pre`: new shares at the base price (the value
 * over the share count), priced up when retail and institutions oversubscribe, down (and only
 * partly sold) when they don't. `mood` is the market's appetite (1 normal).
 */
export function ipoPlan(pre: number, shareCount: number | null, floatPct: number, mood = 1): IpoPlan {
  const value = Math.max(1, pre)
  const float = clampN((Number.isFinite(floatPct) ? floatPct : FLOAT_DEFAULT) / 100, FLOAT_MIN / 100, FLOAT_MAX / 100)
  const baseShares = shareCount ?? Math.max(MIN_SHARES, Math.round(value / LEGACY_PRICE))
  const basePrice = value / baseShares
  const appeal = retailAppeal(basePrice)
  // Retail buyers on top of the institutions; a bigger float is harder to fill.
  const coverage = Math.max(0.05, (0.55 + 0.9 * appeal) * Math.pow(0.25 / float, 0.35) * clampN(mood, 0.4, 2))
  const premium = coverage >= 1 ? Math.min(0.15, 0.12 * Math.log2(coverage)) : -0.12 * (1 - coverage)
  const price = basePrice * (1 + premium)
  const offered = Math.max(1, Math.round((baseShares * float) / (1 - float)))
  const sold = Math.max(1, Math.round(offered * Math.min(1, coverage)))
  const raise = Math.round(sold * price)
  const fees = Math.round(raise * IPO_FEES)
  const sharesOut = baseShares + sold
  return { float, baseShares, basePrice, appeal, coverage, premium, offered, sold, price, raise, fees, sharesOut, retain: baseShares / sharesOut }
}

/** "10 million", "1.2 billion", "25,000": a share count in words. */
export function shareCountText(n: number): string {
  const v = Math.max(0, Math.round(n))
  if (v >= 1e9) return `${Number((v / 1e9).toFixed(v >= 1e10 ? 0 : 1))} billion`
  if (v >= 1e6) return `${Number((v / 1e6).toFixed(v >= 1e7 ? 0 : 1))} million`
  return v.toLocaleString('en-US')
}
