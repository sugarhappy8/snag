// Your listed companies in Investments > Stocks: the size tier a market cap falls in and the share of a
// company nobody inside it holds. Pure arithmetic, no game state and no randomness.
import { clampN } from './util'

export type CapTier = 'mega' | 'large' | 'mid' | 'small'

/**
 * Where each size tier starts, in internal constant-2026 US dollars (no inflation step). A market cap
 * exactly on a bound belongs to the larger tier. Anything under the Mid bound is Small.
 */
export const CAP_TIER_MIN: Readonly<Record<Exclude<CapTier, 'small'>, number>> = Object.freeze({
  mega: 200_000_000_000,
  large: 10_000_000_000,
  mid: 2_000_000_000,
})

/** The headings the engine's stock lists use (invest/real.ts SIZE_LABEL), plus the one every made-up company gets. */
export const TIER_LABEL: Readonly<Record<CapTier, string>> = Object.freeze({
  mega: 'Mega-cap',
  large: 'Large-cap',
  mid: 'Mid-cap',
  small: 'Small-cap',
})

/** The size tier of a market cap. NaN and anything negative or below the Mid bound is 'small'. */
export function capTier(marketCap: number): CapTier {
  if (marketCap >= CAP_TIER_MIN.mega) return 'mega'
  if (marketCap >= CAP_TIER_MIN.large) return 'large'
  if (marketCap >= CAP_TIER_MIN.mid) return 'mid'
  return 'small'
}

/** What the float needs from a holder of shares. A BizState and a GroupCore both fit, so neither needs a cast. */
export interface Holders {
  share: number
  executiveEquity?: number
  manager?: { equity?: number } | null
  familyShares?: { share: number }[]
}

/**
 * The part of the company held by outside shareholders: what is left after you, the executives and your
 * relatives. The executive slice is the larger of the recorded grant and the sitting manager's equity
 * (state.ts executiveEquity), and the remainder is the one equityQuote works out in rescue.ts.
 *
 * Always a finite number from 0 to 1. A stake that is not a finite number leaves no float anyone can
 * vouch for, so it is 0. A slice that is not a finite number counts as nothing.
 */
export function outsideFloat(h: Holders): number {
  if (!Number.isFinite(h.share)) return 0
  const owner = clampN(h.share, 0, 1)
  const executives = Math.max(clampN(h.executiveEquity ?? 0, 0, 1), clampN(h.manager?.equity ?? 0, 0, 1))
  let family = 0
  if (Array.isArray(h.familyShares)) {
    for (const holder of h.familyShares) {
      const slice = holder?.share
      if (typeof slice === 'number' && Number.isFinite(slice) && slice > 0) family += slice
    }
  }
  return Math.max(0, 1 - owner - executives - family)
}
