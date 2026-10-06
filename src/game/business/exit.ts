// Leaving a business: selling it, listing it on a stock exchange, selling shares, going bankrupt.
import { addMoney, addStat, count, endJob, formatMoney, log, notice, remember } from '../core'
import { exchangeFor, marketOf } from '../data/markets'
import { recordMissedPayment } from '../finance'
import { bell } from '../rng'
import type { Asset, GameState } from '../types'
import { deepTechIpoThreshold } from './deeptech-state'
import { refreshValue, valuationOf } from './economy'
import { industryDef } from './industries'
import { ceoJob, stakeValue, type BizState } from './state'
import { clampN, money, pct } from './util'

/** IPO threshold: last year's net profit, like the original's ~$300M rule. */
export const IPO_PROFIT = 300_000_000

/** Capital gains tax rate on selling a business or shares where the owner lives. */
export function capitalGainsRate(g: GameState): number {
  const m = marketOf(g.character.countryId)
  return clampN(m.corporateTax * 0.8, 0, 0.3)
}

/** Tax owed on proceeds above the owner's cost basis (scaled to the share sold). */
export function capitalGainsTax(g: GameState, proceeds: number, basis: number): number {
  const gain = proceeds - Math.max(0, basis)
  return gain > 0 ? Math.round(gain * capitalGainsRate(g)) : 0
}

function removeBusiness(g: GameState, a: Asset): void {
  g.assets = g.assets.filter((x) => x.id !== a.id)
  if (ceoJob(g, a.id)) endJob(g, 'job', 'other')
}

/** Pay off the founding loan linked to this business from the proceeds, if any. */
function settleFoundingLoan(g: GameState, b: BizState): number {
  if (!b.loanId) return 0
  const loan = g.character.loans.find((l) => l.id === b.loanId)
  if (!loan) return 0
  const paid = loan.balance
  g.character.loans = g.character.loans.filter((l) => l.id !== loan.id)
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
  const loan = settleFoundingLoan(g, b)
  const net = gross - tax - loan
  addMoney(g, net)
  removeBusiness(g, a)
  count(g, 'businessesSold')
  const profit = gross - b.invested
  if (profit > 0) count(g, 'businessSaleProfit', profit)
  addStat(g, 'happiness', profit > 0 ? 12 : 2)
  const stake = b.share < 1 ? ` for your ${pct(b.share)} stake` : ''
  let text = `You sold ${a.name} to ${buyer}${stake}: ${formatMoney(gross)}.`
  if (tax > 0) text += ` Capital gains tax took ${formatMoney(tax)}.`
  if (loan > 0) text += ` ${formatMoney(loan)} went to pay off the business loan you took to start it.`
  text += ` You walked away with ${formatMoney(net)}.`
  if (profit > 0) text += ` Not bad for a company you put ${formatMoney(b.invested)} into.`
  else if (profit < 0) text += ` You put ${formatMoney(b.invested)} into it, so this one is a lesson, not a payday.`
  log(g, `I sold my company, ${a.name}, for ${money(gross)}.`, profit >= 0 ? 'good' : 'neutral')
  remember(g, `Sold ${a.name} (${industryDef(b.industry).label.toLowerCase()}) for ${money(gross)}.`)
  notice(g, 'Company Sold!', text, { emoji: '\u{1F91D}', tone: profit >= 0 ? 'good' : 'neutral', ai: { when: 'full', facts: text } })
}

/** The company goes under: closed, debts wiped (limited liability), personal guarantees stay. */
export function declareBankruptcy(g: GameState, a: Asset, b: BizState, why: string): void {
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
  notice(g, 'Bankrupt', text, { emoji: '\u{1F4C9}', tone: 'bad', ai: { when: 'full', facts: text } })
}

/** Close the business in an orderly way: sell off equipment, pay debts, keep what is left. */
export function closeBusiness(g: GameState, a: Asset, b: BizState, liquidation: number): void {
  const proceeds = Math.round(Math.max(0, liquidation) + b.cash - b.debt)
  if (proceeds < 0) {
    declareBankruptcy(g, a, b, 'There was not enough left to pay the creditors, so')
    return
  }
  const mine = ownerProceeds(b, proceeds)
  addMoney(g, mine)
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

export function goPublic(g: GameState, a: Asset, b: BizState): void {
  const ex = exchangeFor(b.countryId)
  const pre = Math.max(1, valuationOf(b))
  const raise = Math.round(pre / 3)
  const fees = Math.round(raise * 0.06)
  const pop = clampN(1 + bell(g, -150, 300) / 1000, 0.8, 1.35)
  const post = pre + raise
  b.sharesOut = Math.max(1000, Math.round(post / 25))
  b.sharePrice = Math.round((post / b.sharesOut) * pop * 100) / 100
  b.cash += raise - fees
  b.share = clampN(b.share * 0.75, 0.01, 1)
  // Preferred shares convert to ordinary ones at the listing.
  b.pref = 0
  b.public = true
  b.exchange = ex.code
  b.ipoYear = g.year
  b.valuation = Math.round(b.sharePrice * b.sharesOut)
  refreshValue(a, b)
  count(g, 'businessIpos')
  addStat(g, 'happiness', 15)
  const text = `${a.name} rang the opening bell on the ${ex.name} (${ex.code}). The IPO raised ${money(raise)} for the company (underwriters kept ${money(fees)}), and the shares ${pop >= 1.05 ? 'popped' : pop <= 0.95 ? 'slid' : 'traded flat'} on day one at $${b.sharePrice.toFixed(2)}. Your ${pct(b.share)} stake is worth ${money(stakeValue(b))}.`
  log(g, `I took ${a.name} public on the ${ex.code}.`, 'good')
  remember(g, `Took ${a.name} public on the ${ex.name}.`)
  notice(g, 'IPO Day!', text, { emoji: '\u{1F514}', tone: 'good', ai: { when: 'full', facts: text } })
}

/** Sell a fraction (0-1) of the owner's shares on the market. */
export function sellShares(g: GameState, a: Asset, b: BizState, fraction: number): void {
  const f = clampN(fraction, 0, 1)
  if (!b.public || f <= 0) return
  const stake = b.share
  const sold = stake * f
  const impact = clampN(sold * 0.6, 0, 0.25)
  const gross = Math.round(sold * b.sharesOut * b.sharePrice * (1 - impact))
  const basis = b.invested * f
  const tax = capitalGainsTax(g, gross, basis)
  addMoney(g, gross - tax)
  b.invested = Math.round(b.invested * (1 - f))
  b.share = stake - sold
  b.sharePrice = Math.round(b.sharePrice * (1 - impact / 2) * 100) / 100
  b.valuation = Math.round(b.sharePrice * b.sharesOut)
  if (f >= 0.999 || b.share < 0.005) {
    g.assets = g.assets.filter((x) => x.id !== a.id)
    if (ceoJob(g, a.id)) endJob(g, 'job', 'quit')
    log(g, `I sold the last of my ${a.name} shares.`, 'good')
    notice(g, 'Sold Out', `You sold all your remaining shares of ${a.name} for ${formatMoney(gross)}${tax ? ` (${formatMoney(tax)} capital gains tax)` : ''}. It's somebody else's company now.`, { emoji: '\u{1F4B8}', tone: 'good' })
    count(g, 'businessesSold')
    return
  }
  refreshValue(a, b)
  log(g, `I sold ${pct(sold, 1)} of ${a.name} on the stock market.`, 'good')
  notice(
    g,
    'Shares Sold',
    `You sold ${pct(sold, 1)} of ${a.name} for ${formatMoney(gross)}${tax ? `; capital gains tax took ${formatMoney(tax)}` : ''}. The share price dipped to $${b.sharePrice.toFixed(2)} on the news. You still own ${pct(b.share, 1)}.`,
    { emoji: '\u{1F4C8}', tone: 'good' },
  )
}
