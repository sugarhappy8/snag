// Investment firms 2.0: the owner's levers. Every action re-reads the live company, checks control
// and era gates again, and moves money only as booked company costs (b.cash and b.yearCosts) or as
// client money inside the client books. Nothing here creates cash.
import { notice, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { chance } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent } from '../talents'
import type { Asset, GameState, Json } from '../types'
import { getCountry } from '../world'
import { manageBlock } from './gate'
import { CALLS, quantBlock, STRATEGIES, STYLES, styleBlock } from './fund-model'
import { clientAssets, readFund, saveFund, type FundState, type FundStyle, type HedgeStrategy, type MacroCall } from './fund-state'
import { ddCost, investingFund, newStartup, newVcFund, openPitches, proRata, raiseQuote, roman, stageLabel } from './fund-vc'
import { bizOf, findBusiness, type BizState } from './state'
import { clampN, money, num, rec, str } from './util'

/** The live company for an action, or null (sold, closed, not yours to run, in prison...). */
export function liveFund(g: GameState, assetId: string): { a: Asset; b: BizState; f: FundState } | null {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a)) return null
  const b = bizOf(g, a)
  if (b.industry !== 'investmentFirm') return null
  return { a, b, f: readFund(b) }
}

/** Direct portfolio controls belong to the hired CEO; owners steer them through the CEO mandate. */
function operatedFund(g: GameState, assetId: string): ReturnType<typeof liveFund> {
  const x = liveFund(g, assetId)
  return x && x.b.ceo !== 'manager' ? x : null
}

export function setStyle(g: GameState, assetId: string, style: FundStyle): boolean {
  const x = operatedFund(g, assetId)
  if (!x || x.f.type !== 'asset' || !(style in STYLES) || styleBlock(style, x.b.countryId, g.year)) return false
  x.f.style = style
  saveFund(x.b, x.f)
  return true
}

export function setFee(g: GameState, assetId: string, fee: number): boolean {
  const x = operatedFund(g, assetId)
  if (!x || x.f.type !== 'asset' || !Number.isFinite(fee)) return false
  x.f.fee = clampN(fee, .0005, .02)
  saveFund(x.b, x.f)
  return true
}

export function setStrategy(g: GameState, assetId: string, strategy: HedgeStrategy): boolean {
  const x = operatedFund(g, assetId)
  if (!x || x.f.type !== 'hedge' || !(strategy in STRATEGIES)) return false
  if (strategy === 'quant' && quantBlock(x.b.countryId, g.year)) return false
  x.f.strategy = strategy
  if (strategy !== 'macro') x.f.lev = 1
  saveFund(x.b, x.f)
  return true
}

export function setCall(g: GameState, assetId: string, call: MacroCall, lev?: number): boolean {
  const x = operatedFund(g, assetId)
  if (!x || x.f.type !== 'hedge' || !(call in CALLS)) return false
  x.f.strategy = 'macro'
  x.f.call = call
  if (lev !== undefined && Number.isFinite(lev)) x.f.lev = clampN(Math.round(lev * 2) / 2, 1, 3)
  saveFund(x.b, x.f)
  return true
}

export function setHedgeTerms(g: GameState, assetId: string, key: 'mgmt' | 'perf' | 'lev' | 'coinvest', value: number): boolean {
  const x = operatedFund(g, assetId)
  if (!x || x.f.type !== 'hedge' || !Number.isFinite(value)) return false
  if (key === 'mgmt') x.f.mgmt = clampN(value, 0, .03)
  else if (key === 'perf') x.f.perf = clampN(value, 0, .3)
  else if (key === 'lev') { if (x.f.strategy !== 'macro') return false; x.f.lev = clampN(Math.round(value * 2) / 2, 1, 3) }
  else x.f.coinvest = Math.round(clampN(value, 0, Math.max(0, x.b.cash)))
  saveFund(x.b, x.f)
  return true
}

export function setCommission(g: GameState, assetId: string, commission: number): boolean {
  const x = operatedFund(g, assetId)
  if (!x || x.f.type !== 'broker' || !Number.isFinite(commission)) return false
  x.f.commission = clampN(commission, 0, .02)
  saveFund(x.b, x.f)
  return true
}

/** One marketing push a year: firm cash, booked as a cost; clients decide at the next settlement. */
export function campaignCost(b: Pick<BizState, 'countryId' | 'outlets'>, f: FundState): number {
  const w = clampN(getCountry(b.countryId).wealth ?? 1, .3, 1.5)
  return Math.round(25_000 * w * Math.sqrt(Math.max(1, b.outlets.reduce((t, o) => t + o.count, 0))) * (1 + Math.log10(1 + clientAssets(f) / 1e7)) / 1000) * 1000
}

export function campaignBlock(g: GameState, assetId: string, b: BizState, f: FundState): string | null {
  if (yearActionsUsed(g, `fund.campaign.${assetId}`) > 0 || f.campaign >= g.year) return 'Already ran a campaign this year.'
  if (f.type === 'vc') return 'Venture firms win LPs with results, not ads.'
  const cost = campaignCost(b, f)
  if (b.cash < cost) return `Needs ${money(cost)} of company cash.`
  return null
}

export function runCampaign(g: GameState, assetId: string): boolean {
  const x = operatedFund(g, assetId)
  if (!x || campaignBlock(g, assetId, x.b, x.f) || !useYearAction(g, `fund.campaign.${assetId}`, 1)) return false
  const cost = campaignCost(x.b, x.f)
  x.b.cash -= cost; x.b.yearCosts += cost
  x.f.campaign = g.year
  x.f.boost = Math.min(.3, x.f.boost + (x.f.type === 'broker' ? .06 : .05))
  saveFund(x.b, x.f)
  notice(g, 'Campaign Launched', `${x.a.name} spent ${money(cost)} on ads and seminars. New clients decide when the year closes.`, { emoji: '📣' })
  return true
}

// ---------------------------------------------------------------------------
// Inventor talent: a trading algorithm (a decaying edge, never a sure thing)

export function algoCost(b: Pick<BizState, 'countryId'>): number {
  return Math.round(250_000 * clampN(getCountry(b.countryId).wealth ?? 1, .35, 1.6) / 1000) * 1000
}

export function algoBlock(g: GameState, b: BizState, f: FundState): string | null {
  if (f.type !== 'hedge') return 'Only a hedge fund can trade with it.'
  if (!hasTalent(g, 'Inventor')) return 'Only an inventor could build this.'
  if (quantBlock(b.countryId, g.year)) return 'There’s no way to run trading models here yet.'
  if (f.algoStart > 0 && f.algoDone < f.algoStart) return 'Your algorithm is still being built.'
  if (f.algoDone > 0 && f.algoEdge > .01) return 'Your current algorithm still has an edge.'
  if (b.cash < algoCost(b)) return `Needs ${money(algoCost(b))} of company cash.`
  return null
}

export function inventAlgorithm(g: GameState, assetId: string): boolean {
  const x = liveFund(g, assetId)
  if (!x || algoBlock(g, x.b, x.f)) return false
  const cost = algoCost(x.b)
  x.b.cash -= cost; x.b.yearCosts += cost
  x.f.algoStart = g.year
  saveFund(x.b, x.f)
  notice(g, 'Building an Algorithm', `You locked yourself in with the quants. ${money(cost)} spent; it’s ready in two years. It might be brilliant. It might be nothing. Rivals copy edges fast.`, { emoji: '🧠' })
  return true
}

// ---------------------------------------------------------------------------
// Venture capital

export function investInPitch(g: GameState, assetId: string, pitchId: string): boolean {
  const x = liveFund(g, assetId)
  if (!x || x.f.type !== 'vc') return false
  const p = openPitches(g, x.b, x.f, g.year).find(q => q.id === pitchId)
  const fund = investingFund(x.f, g.year)
  if (!p || !fund || fund.n !== p.fund || fund.dry < p.ask) return false
  fund.dry -= p.ask; fund.invested += p.ask
  x.f.cos.push(newStartup(p, g.year))
  markActed(x.f, g.year, pitchId)
  saveFund(x.b, x.f)
  return true
}

export function passPitch(g: GameState, assetId: string, pitchId: string): boolean {
  const x = liveFund(g, assetId)
  if (!x || x.f.type !== 'vc' || !openPitches(g, x.b, x.f, g.year).some(q => q.id === pitchId)) return false
  markActed(x.f, g.year, pitchId)
  saveFund(x.b, x.f)
  return true
}

function markActed(f: FundState, year: number, id: string): void {
  if (f.actYear !== year) { f.actYear = year; f.acted = []; f.dd = [] }
  if (!f.acted.includes(id)) f.acted.push(id)
}

export function diligence(g: GameState, assetId: string, pitchId: string): boolean {
  const x = liveFund(g, assetId)
  if (!x || x.f.type !== 'vc') return false
  const p = openPitches(g, x.b, x.f, g.year).find(q => q.id === pitchId)
  if (!p) return false
  if (x.f.actYear !== g.year) { x.f.actYear = g.year; x.f.acted = []; x.f.dd = [] }
  if (x.f.dd.includes(pitchId)) return false
  const cost = ddCost(x.b, p.ask)
  if (x.b.cash < cost) return false
  x.b.cash -= cost; x.b.yearCosts += cost
  x.f.dd.push(pitchId)
  saveFund(x.b, x.f)
  return true
}

export function setFollowOn(g: GameState, assetId: string, startupId: string, take: boolean): boolean {
  const x = liveFund(g, assetId)
  if (!x || x.f.type !== 'vc') return false
  const c = x.f.cos.find(s => s.id === startupId && s.status === 'live' && s.round)
  if (!c || !c.round) return false
  c.round.take = take ? 1 : 0
  saveFund(x.b, x.f)
  return true
}

export const FOLLOW_SCRIPT = defineScript('fund.vc.followOn', (g, choice, data) => {
  const d = rec(data)
  if (!d) return
  setFollowOn(g, str(d.assetId), str(d.startupId), choice === 'invest')
})

export function followOnPopup(g: GameState, a: Asset, f: FundState, startupId: string, hint: string): void {
  const c = f.cos.find(s => s.id === startupId)
  if (!c || !c.round) return
  const want = proRata(c, c.round)
  const fund = f.funds.find(x => x.n === c.fund)
  const can = !!fund && fund.dry >= want
  scriptChoice(g, FOLLOW_SCRIPT, `${c.emoji} ${c.name} Is Raising`,
    `${c.name} is raising a ${stageLabel(c.round.stage)} at ${money(c.round.pre)}. Fund ${roman(c.fund)} owns ${(c.own * 100).toFixed(1)}%. Keeping it costs ${money(want)} of the fund's money${can ? '' : ' (more than it has left)'}.`,
    [{ id: 'invest', label: can ? `Invest ${money(want)} to keep our stake` : 'Try to invest (not enough left)', emoji: '💰', ...(hint ? { hint } : {}) },
      { id: 'pass', label: 'Pass and get diluted', emoji: '👋' }],
    { emoji: c.emoji, data: { assetId: a.id, startupId } as Json })
}

export const RAISE_SCRIPT = defineScript('fund.vc.raise', (g, choice, data) => {
  const d = rec(data)
  if (!d || choice === 'later') return
  const x = liveFund(g, str(d.assetId))
  if (!x || x.f.type !== 'vc') return
  const q = raiseQuote(g, x.b, x.f, g.year)
  if (q.block || !(q.size > 0) || q.n !== num(d.n)) return
  if (!useYearAction(g, `fund.raise.${x.a.id}`, 1)) return
  let size = q.size
  let text: string
  if (choice === 'big') {
    // The ambitious target either lands or the market shrugs; the Business hint shows these odds.
    const landed = chance(g, clampN(q.odds, 0, 1))
    size = Math.round((landed ? q.size * 1.6 : q.size * .7) / 100_000) * 100_000
    text = landed ? `LPs piled in. Fund ${roman(q.n)} closed at ${money(size)}, well above target.` : `The roadshow fizzled. Fund ${roman(q.n)} closed small at ${money(size)}.`
  } else text = `Fund ${roman(q.n)} closed at ${money(size)}. The LPs' money stays theirs: you earn fees and a share of the profits.`
  x.f.funds.push(newVcFund(q.n, size, g.year))
  saveFund(x.b, x.f)
  notice(g, `Fund ${roman(q.n)} Closed`, text, { emoji: '🏦', tone: 'good' })
})

export function raisePopup(g: GameState, a: Asset, b: BizState, f: FundState, hint: string): void {
  const q = raiseQuote(g, b, f, g.year)
  if (q.block || !(q.size > 0)) return notice(g, 'Not Yet', q.block ?? 'LPs aren’t ready.', { emoji: '🏦' })
  const record = q.tvpi === null ? 'You have no track record yet.' : `Your funds are at ${q.tvpi.toFixed(1)}× so far.`
  scriptChoice(g, RAISE_SCRIPT, `Raise Fund ${roman(q.n)}`, `${record} LPs will commit about ${money(q.size)}. You earn 2% a year and 20% of profits.`,
    [{ id: 'safe', label: `Close at ${money(q.size)}`, emoji: '🤝' },
      { id: 'big', label: `Push for ${money(q.size * 1.6)} (risky)`, emoji: '🎲', ...(hint ? { hint } : {}) },
      { id: 'later', label: 'Not now', emoji: '⏳' }],
    { emoji: '🏦', data: { assetId: a.id, n: q.n } as Json })
}
