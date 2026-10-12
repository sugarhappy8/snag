// Banking 2.0 player actions. Each one re-reads the live company, re-checks the gates the menu
// showed (ownership, age, prison, a hired CEO, era, cash) and moves company cash only through
// b.cash + b.yearCosts so the next settlement books it exactly once.
import { log, notice, useYearAction } from '../core'
import type { Asset, GameState } from '../types'
import { boardAllows } from './board-vote'
import { managerName } from './career'
import { manageBlock, noCash } from './gate'
import { APPETITES, PRODUCTS, hasProduct, isBankIndustry, readBank, saveBank, type Appetite, type BankBook, type ProductId } from './bank-state'
import { bankMarket, campaignCost, expectedProfitOf, headlineLoanRate, marketLoanRate, productGate, rateWord, setupCost, techHere } from './bank-model'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { clampN, money, pct } from './util'

/** Why the player can't pull the bank's levers right now (pure; menus and actions share it). */
export function bankLeverBlock(g: GameState, a: Asset): string | null {
  const why = manageBlock(g, a)
  if (why) return why
  const b = readBiz(g, a)
  if (!isBankIndustry(b.industry)) return 'This company is not a bank.'
  if (b.ceo === 'manager') return `${b.manager ? managerName(b.manager) : 'Your CEO'} runs the bank and sets this. Take over as CEO to decide.`
  return null
}

function live(g: GameState, assetId: string): { a: Asset; b: BizState; book: BankBook } | null {
  const a = findBusiness(g, assetId)
  if (!a || bankLeverBlock(g, a)) return null
  const b = bizOf(g, a)
  return { a, b, book: readBank(b) }
}

/** Set the savings rate (kind 'savings') or the headline business-loan rate ('loan'), as an absolute rate. */
export function setBankRate(g: GameState, assetId: string, kind: 'savings' | 'loan', rate: number): void {
  const x = live(g, assetId)
  if (!x || !Number.isFinite(rate)) return
  const m = bankMarket(g, x.b.countryId, g.year)
  if (kind === 'savings') x.book.savingsGap = clampN(rate - m.savings, -.03, .03)
  else x.book.loanGap = clampN(rate - marketLoanRate(m), -.03, .05)
  saveBank(x.b, x.book)
  const gap = kind === 'savings' ? x.book.savingsGap : x.book.loanGap
  const shown = kind === 'savings' ? Math.max(0, m.savings + gap) : headlineLoanRate(m, gap)
  log(g, `I set ${x.a.name}'s ${kind === 'savings' ? 'savings' : 'loan'} rate to ${pct(shown, 2)} (${rateWord(gap, kind)}).`)
}

export function setBankAppetite(g: GameState, assetId: string, appetite: Appetite): void {
  const x = live(g, assetId)
  if (!x || !(appetite in APPETITES)) return
  x.book.appetite = appetite
  saveBank(x.b, x.book)
  log(g, `I switched ${x.a.name} to ${APPETITES[appetite].label.toLowerCase()} lending.`)
}

/** Switch a product line on (paying its setup cost) or wind it down (no refund; loans run off). */
export function switchBankProduct(g: GameState, assetId: string, id: ProductId, on: boolean): void {
  const x = live(g, assetId)
  if (!x || !(id in PRODUCTS)) return
  const { a, b, book } = x
  if (!on) {
    if (!hasProduct(book, id) || id === 'business') return
    delete book.products[id]
    saveBank(b, book)
    log(g, `${a.name} stopped offering ${PRODUCTS[id].label.toLowerCase()}.`)
    return
  }
  if (hasProduct(book, id)) return
  const gate = productGate(b, book, id, g.year)
  if (!gate.ok) return notice(g, PRODUCTS[id].label, gate.why, { emoji: PRODUCTS[id].emoji })
  const cost = setupCost(b, book, id)
  if (b.cash < cost) return noCash(g, a, cost, `launching ${PRODUCTS[id].label.toLowerCase()}`)
  const gain = productGain(g, b, book, id)
  if (cost > 0 && !boardAllows(g, a, b, { kind: 'capex', by: 'owner', amount: cost, gain, label: `Launch ${PRODUCTS[id].label.toLowerCase()} for ${money(cost)}` })) return
  b.cash -= cost; b.yearCosts += cost
  book.products[id] = g.year
  saveBank(b, book)
  log(g, `${a.name} launched ${PRODUCTS[id].label.toLowerCase()}.`, 'good')
  notice(g, `${PRODUCTS[id].emoji} ${PRODUCTS[id].label}`, `${a.name} spent ${money(cost)} setting up ${PRODUCTS[id].label.toLowerCase()}. ${PRODUCTS[id].blurb}.`, { emoji: PRODUCTS[id].emoji, tone: 'good' })
}

/** One marketing campaign a year: more savers at the next settlement (online banks also widen their reach). */
export function runBankCampaign(g: GameState, assetId: string): void {
  const x = live(g, assetId)
  if (!x) return
  const { a, b, book } = x
  if (book.campaignYear >= g.year) return notice(g, 'Already Running', `${a.name} already ran a campaign this year.`, { emoji: '🎯' })
  const cost = campaignCost(b, book)
  if (b.cash < cost) return noCash(g, a, cost, 'a marketing campaign')
  if (!useYearAction(g, `bank.campaign.${a.id}`, 1)) return
  b.cash -= cost; b.yearCosts += cost
  book.campaignYear = g.year; book.campaignBoost = .2
  if (b.industry === 'onlineBank') book.reach += 1.5
  saveBank(b, book)
  log(g, `${a.name} ran a ${money(cost)} marketing campaign.`)
  const here = (tech: Parameters<typeof techHere>[1]) => techHere(b.countryId, tech, g.year)
  const how = here('socialMedia') ? 'Online ads, an influencer or two and a cash bonus for new savers' : here('tv') ? 'TV ads, billboards and a free toaster for new savers'
    : here('radio') ? 'Radio jingles, newspaper ads and a free piggy bank for every child' : 'Posters, newspaper ads and a free umbrella for new savers'
  notice(g, 'Campaign Launched', `${how}: ${money(cost)} well spent, you hope. Results show at the year's end.`, { emoji: '🎯' })
}

/** Five years of the extra expected profit a product would add under this year's model (pure). */
export function productGain(g: GameState, b: BizState, book: BankBook, id: ProductId): number {
  const withIt = structuredClone(book)
  withIt.products[id] = g.year
  return Math.max(0, 5 * (expectedProfitOf(g, b, withIt) - expectedProfitOf(g, b, book)))
}
