// Your listed companies in Investments > Stocks: the size tier a market cap falls in, the share of a
// company nobody inside it holds, and the rows the Stocks screen shows for what you own. Everything
// here is a pure read of the game state: it never writes to it and never touches g.rng, so menus
// and previews can call it as often as they like.
import { exchangeName, type ExInfo } from '../invest/engine'
import type { Asset, GameState } from '../types'
import { groupIdOf, groupsOf, groupStake, sharePriceOf } from './conglomerate-state'
import { companyExchange, exchangeTickers, listedExchange, tickerOf } from './listing-id'
import { activeClasses, ownerVotes } from './share-classes'
import { BIZ_VERSION, businessAssets, executiveEquity, readBiz, stakeValue, type BizState, type ClassKind } from './state'
import { clampN, num } from './util'

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

/** The executive slice: the larger of the recorded grant and the sitting manager's equity, each from 0 to 1. */
function executiveSlice(h: Holders): number {
  return Math.max(clampN(h.executiveEquity ?? 0, 0, 1), clampN(h.manager?.equity ?? 0, 0, 1))
}

/** What relatives hold in all: the sum of the slices that are finite and positive. */
function familySlice(h: Holders): number {
  let family = 0
  if (Array.isArray(h.familyShares)) {
    for (const holder of h.familyShares) {
      const slice = holder?.share
      if (typeof slice === 'number' && Number.isFinite(slice) && slice > 0) family += slice
    }
  }
  return family
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
  return Math.max(0, 1 - clampN(h.share, 0, 1) - executiveSlice(h) - familySlice(h))
}

/** A stake below this is nothing: the yearly cleanup (yearly.ts leaveUnownedListed) takes the company off your hands. */
const OWNED = 1e-6

/** One thing you own that trades on an exchange: a company you took public, or a listed group. */
export interface OwnListing {
  kind: 'company' | 'group'
  /** The asset id, or the group id. */
  id: string
  name: string
  /** Null for a group: it has no ticker of its own. */
  ticker: string | null
  exKey: string
  exCode: string
  exName: string
  price: number
  marketCap: number
  tier: CapTier
  sharesOut: number
  stake: number
  /** The part of the votes you hold. A company with one class, and a group, vote as they hold: this is the stake. */
  votes: number
  /** The live share structure of a company, or null (one class, and always null for a group). */
  classKind: ClassKind | null
  stakeValue: number
  outside: number
  family: number
  executives: number
  ipoYear: number
  /** The offer price, or null on a save from before it was kept (and for a group). */
  ipoPrice: number | null
}

/**
 * The stake an action will see through bizOf. normalizeBiz floors a stake that has no family shares at
 * 1%, but bizOf leaves a current record as stored, so the 0.6% a sale leaves behind stays 0.6% for
 * sellShares and the yearly cleanup. A record bizOf would normalize first reads as readBiz reads it.
 */
export function rawStake(g: GameState, a: Asset): number {
  const d = a.details
  if (num(d.v) === BIZ_VERSION && Array.isArray(d.outlets) && typeof d.share === 'number' && Number.isFinite(d.share)) return clampN(d.share, 0, 1)
  return readBiz(g, a).share
}

function finite(x: number): number {
  return Number.isFinite(x) ? x : 0
}

/**
 * Every listed company and listed group you hold a stake in, biggest market cap first (then by id).
 *
 * A company is a row when it is public, stands alone, has shares and a price, and you hold some of it.
 * Its exchange is the one it trades on (listing-id.ts), whatever country you live in. A division of a
 * group never gets a row, whatever its own `public` says. A listed group gets one row, with the group's
 * market cap and your stake in the group, and no ticker.
 */
export function ownListings(g: GameState): OwnListing[] {
  const rows: OwnListing[] = []
  const tickers = new Map<string, Map<string, string>>()
  const tickersOn = (info: ExInfo): Map<string, string> => {
    let m = tickers.get(info.key)
    if (!m) tickers.set(info.key, (m = exchangeTickers(g, info)))
    return m
  }
  for (const a of businessAssets(g)) {
    // readBiz reads `public` as `=== true`; checking the raw field first skips normalizing a private company.
    if (a.details.public !== true) continue
    const v: BizState = { ...readBiz(g, a), share: rawStake(g, a) }
    if (!v.public || groupIdOf(v) || !(v.sharesOut > 0) || !(v.sharePrice > 0) || !(v.share > OWNED)) continue
    const info = companyExchange(v)
    const marketCap = finite(v.valuation)
    rows.push({
      kind: 'company',
      id: a.id,
      name: a.name,
      ticker: tickersOn(info).get(a.id) ?? tickerOf(g, a, v),
      exKey: info.key,
      exCode: info.ex.code,
      exName: exchangeName(info, g.year),
      price: v.sharePrice,
      marketCap,
      tier: capTier(marketCap),
      sharesOut: v.sharesOut,
      stake: v.share,
      votes: ownerVotes(v),
      classKind: activeClasses(v)?.kind ?? null,
      stakeValue: stakeValue(v),
      outside: outsideFloat(v),
      family: familySlice(v),
      executives: executiveEquity(v),
      ipoYear: v.ipoYear,
      ipoPrice: v.ipoPrice ?? null,
    })
  }
  for (const grp of groupsOf(g)) {
    const listing = grp.core.listing
    if (!listing || !(grp.core.share > OWNED)) continue
    const info = listedExchange(grp.members.map((x) => x.b.countryId), listing.exchange)
    const price = sharePriceOf(grp)
    const marketCap = finite(price * listing.sharesOut)
    rows.push({
      kind: 'group',
      id: grp.core.id,
      name: grp.core.name,
      ticker: null,
      exKey: info.key,
      exCode: info.ex.code,
      exName: exchangeName(info, g.year),
      price,
      marketCap,
      tier: capTier(marketCap),
      sharesOut: listing.sharesOut,
      stake: grp.core.share,
      votes: grp.core.share,
      classKind: null,
      stakeValue: groupStake(grp),
      outside: outsideFloat(grp.core),
      family: familySlice(grp.core),
      executives: executiveSlice(grp.core),
      ipoYear: listing.ipoYear,
      ipoPrice: null,
    })
  }
  return rows.sort((x, y) => y.marketCap - x.marketCap || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}
