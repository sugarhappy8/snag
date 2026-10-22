// Buying and selling your own listed company from Investments > Stocks.
//
// A buy is a market purchase from the outside float: no board vote, no board control needed, one a
// year per company (the same year key as Capital & Ownership's three moves). It is paid at the
// fundamental price plus 3% and an order-size premium, and it never writes the impact into the share
// price, so a buy can't pump your own stake.
//
// A sale is Exit > Sell Shares: the same sellShares, the same two sales a year, the same tax and the
// same hand-off when you sell out. This file only adds the door, its limits and its preview.
//
// Quotes, limits and previews are pure: they never write to the game and never touch g.rng. Only
// buyOwnShares and sellOwnShares change anything, and the buy doesn't touch g.rng either.
import { addMoney, formatMoney, formatPrice, log, notice, useYearAction, yearActionsUsed } from '../core'
import { exchangeName, exchangeStatus } from '../invest/engine'
import { buyImpact, saleImpact } from '../invest/liquidity'
import type { Asset, GameState } from '../types'
import { boardOf, controlsFor, syncSeats } from './board-state'
import { groupIdOf } from './conglomerate-state'
import { refreshValue, valuationOf } from './economy'
import { capitalGainsTax, sellShares } from './exit'
import { manageBlock } from './gate'
import { companyExchange, tickerOf } from './listing-id'
import { outsideFloat } from './own-listing'
import { equityYearKey } from './rescue'
import { activeClasses, CLASS_VOTES, classFactor, clampFounders, foundersCapped, ownerVotes } from './share-classes'
import { retailDepth, shareCountText } from './share-structure'
import { bizOf, findBusiness, isTicker, type BizState } from './state'
import { clampN, money, pct, plural } from './util'

/** What a buy pays over the fundamental price. */
export const BUY_PREMIUM = 0.03
/** The most of the company one buy can take, as a share of all of it. */
export const MAX_BUY_SHARE = 0.15
/** The part of the company that always stays with the public. */
export const MIN_OUTSIDE = 0.01

export interface BuyQuote {
  /** What was asked for: the amount if it is a positive number, otherwise 0. */
  dollars: number
  /** The price of one share before the size of the order counts. */
  basePrice: number
  /** What each share costs on average for this order. */
  avgPrice: number
  /** The part of the company this order buys (0 to maxFraction). */
  fraction: number
  shares: number
  /** Your stake after the buy. */
  newShare: number
  /** The most one buy can take, and the most it can cost. */
  maxFraction: number
  maxDollars: number
  controlsBefore: boolean
  controls: boolean
}

/**
 * Whether you'd control the board with this stake: the seats the stake calls for, the same count
 * the board itself uses, with no vote involved. Everything that asks "would I control it" goes
 * through here.
 */
export function controlsWith(g: GameState, b: BizState, share: number): boolean {
  // Shares bought are ordinary ones: a founders' class left above today's stake does not come back with them.
  return controlsFor(g, { ...foundersCapped(b), share })
}

function finite(x: number): number {
  return Number.isFinite(x) ? x : 0
}

/** "1 share", "2 shares", "10 million shares": a share count with the noun that goes with it. */
export function sharesText(n: number): string {
  const v = Math.max(0, Math.round(finite(n)))
  return v < 1e6 ? plural(v, 'share') : `${shareCountText(v)} shares`
}

/**
 * What an order of `dollars` buys. The price is the larger of the quote, the company's market cap per
 * share and its fundamental value per share, plus 3%. The order then walks up the same order book a
 * sale walks down (invest/liquidity.ts, in company-fraction units with this price's retail depth), so
 * a bigger order pays a higher average. The most it can take is 15% of the company, and never the last
 * 1% of the float.
 *
 * Always finite, for any amount and any record: a company with no shares or no price gives a quote
 * of zeros, with your stake unchanged.
 */
export function buyQuote(g: GameState, _a: Asset, b: BizState, dollars: number): BuyQuote {
  const d = Number.isFinite(dollars) && dollars > 0 ? dollars : 0
  const held = clampN(b.share, 0, 1)
  const controlsBefore = controlsWith(g, b, held)
  const none: BuyQuote = { dollars: d, basePrice: 0, avgPrice: 0, fraction: 0, shares: 0, newShare: held, maxFraction: 0, maxDollars: 0, controlsBefore, controls: controlsBefore }
  if (!(b.sharesOut > 0) || !(b.sharePrice > 0)) return none
  const basePrice = Math.max(b.sharePrice, finite(b.valuation / b.sharesOut), finite(valuationOf(b) / b.sharesOut) * classFactor(b)) * (1 + BUY_PREMIUM)
  const cap = basePrice * b.sharesOut
  if (!(basePrice > 0) || !Number.isFinite(basePrice) || !(cap > 0) || !Number.isFinite(cap)) return none
  const depth = retailDepth(basePrice)
  const maxFraction = clampN(Math.min(MAX_BUY_SHARE, outsideFloat(b) - MIN_OUTSIDE), 0, 1)
  // The inverse of buyImpact().value: the dollars that fill exactly maxFraction.
  const maxDollars = Math.max(0, finite(Math.floor(((cap * depth) / 0.6) * Math.expm1((0.6 * maxFraction) / depth))))
  const fraction = Math.min(maxFraction, buyImpact(d / cap, depth).value)
  const shares = fraction * b.sharesOut
  // An order over the limit is priced as the biggest order allowed, not as the whole amount spread over
  // the capped shares (buyOwnShares refuses it, and the preview must not show a made-up price). Never
  // under the base price, whatever the rounding.
  const avgPrice = fraction > 0 ? Math.max(basePrice, finite(Math.min(d, maxDollars) / shares)) : basePrice
  const newShare = clampN(held + fraction, 0, 1)
  return { dollars: d, basePrice, avgPrice, fraction, shares, newShare, maxFraction, maxDollars, controlsBefore, controls: controlsWith(g, b, newShare) }
}

/**
 * Why you can't buy more of this company right now, or null. Board control is not on the list: this is
 * a market purchase from the float, so it is allowed at any stake.
 */
export function buyLimit(g: GameState, a: Asset, b: BizState): string | null {
  const blocked = manageBlock(g, a)
  if (blocked) return blocked
  if (groupIdOf(b)) return "The group owns this division. Trade the group's shares from its screen."
  if (!b.public) return "It isn't listed."
  if (!(b.sharesOut > 0 && b.sharePrice > 0)) return "It isn't trading."
  const info = companyExchange(b)
  if (exchangeStatus(info, g.year) !== 'open') return `The ${exchangeName(info, g.year)} is closed this year.`
  if (yearActionsUsed(g, equityYearKey(a.id)) > 0) return "You've used this company's one ownership move this year, here or in Capital & Ownership."
  const q = buyQuote(g, a, b, 0)
  const oneShare = Math.ceil(q.basePrice)
  const cash = g.character.money
  if (q.maxDollars < oneShare && cash >= oneShare) return 'No outside shares left to buy. 1% stays with the public.'
  if (!(cash >= oneShare)) return "You can't afford one share."
  return null
}

/** What an order would do, in a line: shares, price, your new stake and what that does to the board. */
export function buyPreview(g: GameState, a: Asset, b: BizState, dollars: number): string {
  const q = buyQuote(g, a, b, dollars)
  let head = `${sharesText(q.shares)} at about ${formatPrice(q.avgPrice)} each (market ${formatPrice(b.sharePrice)}). You'd own ${pct(q.newShare, 1)}.`
  // With share classes, the shares you buy are the public's: say whether they vote and what that leaves you.
  // The founders' class stays as it is, so the new shares are ordinary ones (what buyOwnShares does).
  const plan = activeClasses(b)
  if (plan) {
    const weight = CLASS_VOTES[plan.kind].lo
    head += ` ${weight > 0 ? `These shares carry ${plural(weight, 'vote')}.` : 'These shares carry no vote.'} You'd hold ${pct(ownerVotes({ ...foundersCapped(b), share: q.newShare }), 0)} of the votes.`
  }
  if (!q.controls) return head
  return head + (q.controlsBefore ? ' You keep control of the board.' : ' This gives you control of the board.')
}

/**
 * Buy more of your own listed company. `b` is the live record (bizOf), as for every action. Whole
 * dollars only. Moves the cash into your stake: your share and cost basis go up, and the share count,
 * share price and valuation stay as the market had them. Every refusal posts a notice and uses
 * nothing up. Returns whether the buy went through.
 */
export function buyOwnShares(g: GameState, a: Asset, b: BizState, dollars: number): boolean {
  if (!Number.isFinite(dollars) || dollars < 1) return false
  dollars = Math.round(dollars)
  const q = buyQuote(g, a, b, dollars)
  const why = buyLimit(g, a, b)
  if (why) {
    notice(g, 'Buy Shares', why)
    return false
  }
  const cash = Number.isFinite(g.character.money) ? g.character.money : 0
  const most = Math.min(q.maxDollars, cash)
  if (dollars > most) {
    notice(g, 'Buy Shares', `You can buy up to ${money(most)} this year.`)
    return false
  }
  if (!useYearAction(g, equityYearKey(a.id), 1)) return false
  if (!isTicker(b.ticker)) b.ticker = tickerOf(g, a, b)
  addMoney(g, -dollars, 'trade.buy')
  b.invested += dollars
  // The shares bought are ordinary ones (share-classes.ts): the founders' class stays what it was.
  clampFounders(b)
  b.share = q.newShare
  syncSeats(g, a, b, boardOf(b))
  refreshValue(a, b)
  log(g, `I bought more of ${a.name} on the ${companyExchange(b).ex.code}. I own ${pct(q.newShare, 1)}.`)
  notice(g, 'Shares Bought', `You paid ${formatMoney(dollars)} for ${sharesText(q.shares)} of ${a.name}, about ${formatPrice(q.avgPrice)} each. You own ${pct(q.newShare, 1)}.`)
  return true
}

/** Sales of shares a year per company, Exit > Sell Shares and the Stocks row together. */
export const SHARE_SALES_PER_YEAR = 2

/** The year-action key Exit > Sell Shares counts its sales under. */
export function shareSaleKey(assetId: string): string {
  return `biz.shares.${assetId}`
}

/**
 * Why you can't sell shares of this company right now, or null. There is no exchange check: Exit >
 * Sell Shares has none, and the two doors are the same sale.
 */
export function sellLimit(g: GameState, a: Asset, b: BizState): string | null {
  const blocked = manageBlock(g, a)
  if (blocked) return blocked
  if (!b.public) return "It isn't listed."
  if (yearActionsUsed(g, shareSaleKey(a.id)) >= SHARE_SALES_PER_YEAR) return "You've sold shares twice this year."
  return null
}

/**
 * What selling `fraction` of your shares would do, in a line: the proceeds and tax the sale will use,
 * then whether it ends your ownership or the control of the board. Pure. `b` is the record the sale
 * will run on, so a stake stored under 1% is judged as it is stored.
 */
export function sellNote(g: GameState, a: Asset, b: BizState, fraction: number): string {
  const f = clampN(fraction, 0, 1)
  const order = saleImpact(b.share * f, retailDepth(b.sharePrice))
  const raw = Math.round(b.sharesOut * b.sharePrice * order.proceeds)
  const gross = Number.isFinite(raw) ? Math.max(0, raw) : 0
  const tax = capitalGainsTax(g, gross, b.invested * f)
  const head = tax > 0 ? `About ${money(gross)} before ${money(tax)} tax.` : `About ${money(gross)}.`
  const left = b.share * (1 - f)
  // The removal rule of sellShares. A sale of nothing removes nothing.
  if (f > 0 && (f >= 0.999 || left < 0.005)) return `${head} That's the last of your shares. ${a.name} leaves your companies.`
  if (controlsWith(g, b, b.share) && !controlsWith(g, b, left)) return `${head} You'd lose control of the board.`
  return head
}

/**
 * Sell a fraction (0 to 1) of your shares from the Stocks row. It is Exit > Sell Shares: the same
 * sellShares and the same two sales a year. Every refusal that has a reason posts a notice and uses
 * nothing up. Returns whether a sale ran.
 */
export function sellOwnShares(g: GameState, assetId: string, fraction: number): boolean {
  const a = findBusiness(g, assetId)
  if (!a) return false
  if (!Number.isFinite(fraction) || fraction <= 0) return false
  const b = bizOf(g, a)
  const why = sellLimit(g, a, b)
  if (why) {
    notice(g, 'Sell Shares', why)
    return false
  }
  if (!useYearAction(g, shareSaleKey(a.id), SHARE_SALES_PER_YEAR)) return false
  sellShares(g, a, b, clampN(fraction, 0, 1))
  return true
}
