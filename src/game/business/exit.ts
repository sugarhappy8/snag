// Leaving a business: selling it, listing it on a stock exchange, selling shares, going bankrupt.
import { addMoney, addStat, count, endJob, formatMoney, log, moneyWith, notice, remember } from '../core'
import { exchangeFor, marketOf } from '../data/markets'
import { recordMissedPayment } from '../finance'
import { bell } from '../rng'
import { saleImpact } from '../invest/liquidity'
import type { Asset, GameState } from '../types'
import { afterMemberGone } from './conglomerate-state'
import { deepTechIpoThreshold } from './deeptech-state'
import { refreshValue, valuationOf } from './economy'
import { recordCompanyShock } from './dynamics'
import { industryDef } from './industries'
import { newTicker } from './listing-id'
import { ceoJob, diluteBusinessEquity, stakeValue, type BizState } from './state'
import { clampN, industryNoun, money, pct } from './util'
import { supplyInventoryValue } from './supply'
import { bankAdvanceOf } from './bank-state'
import { cashOutFamilyHolders, payFamilyBusinessProceeds } from './dynasty-ownership'
import { clampFounders } from './share-classes'
import { FLOAT_DEFAULT, ipoPlan, retailDepth, retailVerdict, shareCountOf, shareCountText } from './share-structure'
import { listingMood } from '../history/market-events'
import { personalTax } from '../nation/effects'

/**
 * IPO threshold: last year's net profit. Set where a successful mid-size company gets to (about
 * $25M a year: a regional chain, a busy factory, a strong software house); the board still has to
 * agree. Game studios and deep tech keep their own rules (ipoThreshold).
 */
export const IPO_PROFIT = 25_000_000

/**
 * Chance the underwriters' due diligence finds cooked books before a listing (an IPO is audited
 * harder than a private sale, whose buyers find them 40% of the time). With the bar at $25M this is
 * what stops "cook the books, then sell a quarter of the company at the inflated price".
 */
export const IPO_COLLAPSE = 0.5

/** Capital gains tax rate on selling a business or shares where the owner lives. */
export function capitalGainsRate(g: GameState): number {
  const m = marketOf(g.character.countryId)
  const change = personalTax(g, 'capitalGains') / 100
  return change ? clampN(m.corporateTax * 0.8 + change, 0, 0.6) : clampN(m.corporateTax * 0.8, 0, 0.3)
}

/** Tax owed on proceeds above the owner's cost basis (scaled to the share sold). */
export function capitalGainsTax(g: GameState, proceeds: number, basis: number): number {
  const gain = proceeds - Math.max(0, basis)
  return gain > 0 ? Math.round(gain * capitalGainsRate(g)) : 0
}

function removeBusiness(g: GameState, a: Asset): void {
  g.assets = g.assets.filter((x) => x.id !== a.id)
  if (ceoJob(g, a.id)) endJob(g, 'job', 'other')
  // A group carries on without it, or winds up when only one company is left.
  afterMemberGone(g, a.details, a.name)
}

/** Pay off the founding loan linked to this business from the proceeds, if any. */
function settleFoundingLoan(g: GameState, b: BizState, proceeds: number): number {
  if (!b.loanId) return 0
  const loan = g.character.loans.find((l) => l.id === b.loanId)
  if (!loan) return 0
  const paid = Math.min(loan.balance, Math.max(0, proceeds))
  loan.balance -= paid
  if (loan.balance === 0) g.character.loans = g.character.loans.filter((l) => l.id !== loan.id)
  return paid
}

/** Sell the owner's whole stake for `price` (the price of 100% of the company). */
/**
 * The owner's cut of a sale or closure worth `total` for the whole company: outside investors
 * take back their preference first (or their share, if that's more), the owner keeps the rest.
 */
export function ownerProceeds(b: BizState, total: number): number {
  const t = Math.max(0, total)
  const investors = b.share >= 1 ? 0 : Math.min(t, Math.max(b.pref ?? 0, t * (1 - b.share)))
  return Math.round(t - investors)
}

export function sellBusiness(g: GameState, a: Asset, b: BizState, price: number, buyer: string): void {
  const gross = ownerProceeds(b, price)
  const tax = capitalGainsTax(g, gross, b.invested)
  const loan = settleFoundingLoan(g, b, gross - tax)
  const net = gross - tax - loan
  addMoney(g, net)
  payFamilyBusinessProceeds(g, b, price)
  removeBusiness(g, a)
  count(g, 'businessesSold')
  const profit = gross - b.invested
  if (profit > 0) count(g, 'businessSaleProfit', profit)
  addStat(g, 'happiness', profit > 0 ? 12 : 2)
  const stake = b.share < 1 ? ` for your ${pct(b.share)} stake` : ''
  let text = `You sold ${a.name} to ${buyer}${stake}: ${formatMoney(gross)}.`
  if (tax > 0) text += ` Capital gains tax took ${formatMoney(tax)}.`
  if (loan > 0) text += ` ${formatMoney(loan)} went toward the business loan you took to start it.`
  const remaining = g.character.loans.find((l) => l.id === b.loanId)?.balance ?? 0
  if (remaining > 0) text += ` You still owe ${formatMoney(remaining)} on that personal loan.`
  text += ` You walked away with ${formatMoney(net)}.`
  if (profit > 0) text += ` Not bad for a company you put ${formatMoney(b.invested)} into.`
  else if (profit < 0) text += ` You put ${formatMoney(b.invested)} into it, so this one is a lesson, not a payday.`
  log(g, `I sold my company, ${a.name}, for ${money(gross)}.`, profit >= 0 ? 'good' : 'neutral')
  remember(g, `Sold ${a.name} (${industryNoun(industryDef(b.industry).label)}) for ${money(gross)}.`)
  notice(g, 'Company Sold!', text, { emoji: '\u{1F91D}', tone: profit >= 0 ? 'good' : 'neutral' })
}

/** The company goes under: closed, debts wiped (limited liability), personal guarantees stay. */
export function declareBankruptcy(g: GameState, a: Asset, b: BizState, why: string): void {
  recordCompanyShock(g, b, b.last?.revenue ?? 0, 0, a.id)
  removeBusiness(g, a)
  count(g, 'bankruptcies')
  recordMissedPayment(g)
  recordMissedPayment(g)
  addStat(g, 'happiness', -20)
  const personal = b.loanId ? g.character.loans.find((l) => l.id === b.loanId) : undefined
  let text = `${why} ${a.name} filed for bankruptcy. The doors are closed, the staff are gone and the creditors are splitting whatever is left.`
  if (b.debt > 0) text += ` The company's ${formatMoney(b.debt)} of debt dies with it.`
  if (personal) text += ` The ${formatMoney(personal.balance)} business loan you personally guaranteed is still yours to repay.`
  text += ' Your credit score took a beating.'
  log(g, `My company, ${a.name}, went bankrupt.`, 'bad')
  remember(g, `${a.name} went bankrupt.`)
  notice(g, 'Bankrupt', text, { emoji: '\u{1F4C9}', tone: 'bad' })
}

/** Close in an orderly way. `liquidation` is the existing equipment/finished-goods
 * quote; funded raw inputs are recovered separately, once, at their conservative value. */
export function closeBusiness(g: GameState, a: Asset, b: BizState, liquidation: number): void {
  if (!g.assets.some(x => x.id === a.id)) return
  // A bank's run-time advance comes back out of its client book as the savers are paid off.
  const proceeds = Math.round(Math.max(0, liquidation) + supplyInventoryValue(b) + b.cash - b.debt + bankAdvanceOf(b))
  if (proceeds < 0) {
    declareBankruptcy(g, a, b, 'There was not enough left to pay the creditors, so')
    return
  }
  const mine = ownerProceeds(b, proceeds)
  addMoney(g, mine)
  payFamilyBusinessProceeds(g, b, proceeds)
  removeBusiness(g, a)
  log(g, `I closed ${a.name} for good.`, 'neutral')
  notice(
    g,
    'Closed for Good',
    `You closed ${a.name}, sold off the equipment and paid every creditor. ${mine > 0 ? `${formatMoney(mine)} was left for you.` : 'Nothing was left, but you owe nothing.'}`,
    { emoji: '\u{1F6AA}' },
  )
}

// ---------------------------------------------------------------------------
// Going public

/**
 * Yearly profit an exchange wants before listing this company. Game studios list on hits and
 * franchises long before they earn like a conglomerate (studios have gone public on far less).
 */
export function ipoThreshold(b: BizState): number {
  return b.industry === 'gameStudio' ? 25_000_000 : (deepTechIpoThreshold(b) ?? IPO_PROFIT)
}

export function canIpo(b: BizState): string | null {
  if (b.public) return 'It is already listed.'
  const last = b.history[b.history.length - 1]
  const need = ipoThreshold(b)
  if (!last || last.profit < need) return `Exchanges want at least ${money(need)} of yearly profit. Last year: ${money(last?.profit ?? 0)}.`
  return null
}

/**
 * List the company, floating `floatPct` percent of it as new shares (5-60, 25 by default). The
 * money goes to the company. Demand from retail investors (an affordable share price) and the
 * market's mood price the offer up or down and decide how much of it sells.
 */
export function goPublic(g: GameState, a: Asset, b: BizState, floatPct = FLOAT_DEFAULT): void {
  const ex = exchangeFor(b.countryId)
  const pre = Math.max(1, valuationOf(b))
  const plan = ipoPlan(pre, shareCountOf(b), floatPct, listingMood(b.industry, b.countryId, g.year))
  // Day one: the usual noise, plus a pop when the offer was heavily oversubscribed.
  const pop = clampN(1 + bell(g, -150, 300) / 1000 + 0.06 * Math.max(0, Math.min(3, plan.coverage) - 1), 0.8, 1.45)
  b.sharesOut = plan.sharesOut
  b.sharePrice = Math.round(plan.price * pop * 100) / 100
  b.cash += plan.raise - plan.fees
  b.share = clampN(b.share * plan.retain, b.familyShares?.length ? 0 : .01, 1)
  diluteBusinessEquity(b, plan.retain)
  delete b.shareCount
  // Preferred shares convert to ordinary ones at the listing.
  b.pref = 0
  b.public = true
  b.exchange = ex.code
  b.ipoYear = g.year
  b.ticker = newTicker(g, a, b)
  // A price that rounds to nothing is not kept: "since the IPO" would divide by it.
  const offer = Math.round(plan.price * 100) / 100
  if (offer > 0) b.ipoPrice = offer
  b.valuation = Math.round(b.sharePrice * b.sharesOut)
  refreshValue(a, b)
  count(g, 'businessIpos')
  addStat(g, 'happiness', 15)
  const price = (x: number) => moneyWith(x, (v) => v.toFixed(2))
  const demand = plan.coverage >= 1
    ? `Orders covered the offer ${plan.coverage.toFixed(1)} times over, so it priced ${pct(plan.premium)} above the base price at ${price(plan.price)} a share`
    : `Only ${pct(plan.sold / plan.offered)} of the shares on offer found buyers, at ${price(plan.price)} a share`
  const text = `${a.name} rang the opening bell on the ${ex.name} (${ex.code}). ${demand} (${retailVerdict(plan.basePrice)}). The IPO raised ${money(plan.raise)} for the company (underwriters kept ${money(plan.fees)}), and the shares ${pop >= 1.05 ? 'popped' : pop <= 0.95 ? 'slid' : 'traded flat'} on day one at ${price(b.sharePrice)}. ${shareCountText(b.sharesOut)} shares are listed; your ${pct(b.share)} stake is worth ${money(stakeValue(b))}.`
  log(g, `I took ${a.name} public on the ${ex.code}.`, 'good')
  remember(g, `Took ${a.name} public on the ${ex.name}.`)
  notice(g, 'IPO Day!', text, { emoji: '\u{1F514}', tone: 'good' })
}

/** The IPO slider's preview: what floating `floatPct` percent would do today (pure). */
export function ipoPreview(g: GameState, b: BizState, floatPct: number): string {
  const plan = ipoPlan(Math.max(1, valuationOf(b)), shareCountOf(b), floatPct, listingMood(b.industry, b.countryId, g.year))
  const price = (x: number) => moneyWith(x, (v) => v.toFixed(2))
  const keep = b.share * plan.retain
  const fill = plan.coverage >= 1 ? `orders should cover it about ${plan.coverage.toFixed(1)} times` : `only about ${pct(Math.min(1, plan.coverage))} of it would sell`
  return `${shareCountText(plan.offered)} new shares at about ${price(plan.price)} (${retailVerdict(plan.basePrice)}): ${fill}, raising about ${money(plan.raise - plan.fees)} for the company after fees. You'd keep ${pct(keep, 1)}.${keep < 0.5 && b.share >= 0.5 ? ' Under half: outside shareholders would control the board.' : ''}`
}

/** "Your sister keeps her shares…": what happened to the relatives' part when you sold out. */
export function familyNote(names: string[]): string {
  if (!names.length) return ''
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return ` ${who} ${names.length === 1 ? 'keeps' : 'keep'} their family shares, now part of their own wealth.`
}

/**
 * A listed company you no longer own any of leaves your hands: relatives' family shares stay
 * theirs (joining their own wealth at market value) and the company leaves your assets. Returns
 * the living relatives' names.
 */
export function leaveListedCompany(g: GameState, a: Asset, b: BizState, why: 'quit' | 'other' = 'other'): string[] {
  const relatives = b.familyShares?.length ? cashOutFamilyHolders(g, b.familyShares, b.sharesOut * b.sharePrice, `${a.name}'s family shares`) : []
  delete b.familyShares
  g.assets = g.assets.filter((x) => x.id !== a.id)
  if (ceoJob(g, a.id)) endJob(g, 'job', why)
  afterMemberGone(g, a.details, a.name)
  return relatives
}

/** Sell a fraction (0-1) of the owner's shares on the market. */
export function sellShares(g: GameState, a: Asset, b: BizState, fraction: number): void {
  const f = clampN(fraction, 0, 1)
  if (!b.public || f <= 0) return
  const stake = b.share
  const sold = stake * f
  const order = saleImpact(sold, retailDepth(b.sharePrice))
  const gross = Math.round(b.sharesOut * b.sharePrice * order.proceeds)
  const basis = b.invested * f
  const tax = capitalGainsTax(g, gross, basis)
  addMoney(g, gross - tax)
  b.invested = Math.round(b.invested * (1 - f))
  b.share = stake - sold
  clampFounders(b)
  b.sharePrice = Math.max(.01, Math.round(b.sharePrice * order.end * 100) / 100)
  b.valuation = Math.round(b.sharePrice * b.sharesOut)
  if (f >= 0.999 || b.share < 0.005) {
    const relatives = leaveListedCompany(g, a, b, 'quit')
    log(g, `I sold the last of my ${a.name} shares.`, 'good')
    notice(g, 'Sold Out', `You sold all your remaining shares of ${a.name} for ${formatMoney(gross)}${tax ? ` (${formatMoney(tax)} capital gains tax)` : ''}. It's somebody else's company now.${familyNote(relatives)}`, { emoji: '\u{1F4B8}', tone: 'good' })
    count(g, 'businessesSold')
    return
  }
  refreshValue(a, b)
  log(g, `I sold ${pct(sold, 1)} of ${a.name} on the stock market.`, 'good')
  notice(
    g,
    'Shares Sold',
    `You sold ${pct(sold, 1)} of ${a.name} for ${formatMoney(gross)}${tax ? `; capital gains tax took ${formatMoney(tax)}` : ''}. The share price dipped to ${moneyWith(b.sharePrice, (x) => x.toFixed(2))} on the news. You still own ${pct(b.share, 1)}.`,
    { emoji: '\u{1F4C8}', tone: 'good' },
  )
}
