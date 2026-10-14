// A company's cash at work in a hedge fund. The cash never leaves b.cash: each fiscal year, before the
// year is simulated, the company puts up to a target of its spare cash to work in the hedge-fund
// strategies and books the result through yearIncome (a gain) or yearCosts (a loss), the way
// bookFranchiseYear books royalties. The statement and the corporate tax count it once, and nothing
// else (valuation, loans, closure, sale, the cash crunch) needs to know. Nothing here reads or advances
// g.rng: the year's noise comes from fundRng, a seeded stream.
import { log, notice } from '../core'
import type { Asset, GameState } from '../types'
import { boardExists, boardView } from './board-state'
import { payableCash, payoutCash, reserveDollars, runningCosts } from './board-vote'
import { inGroup } from './conglomerate-state'
import { isFinanceFirm } from './finance-firm-state'
import { fundRng, leaderSkill } from './fund-model'
import type { HedgeStrategy, MacroCall } from './fund-state'
import { manageBlock } from './gate'
import { autoTerms, macroBlock, marketBlock, skillOf, strategyBlock, vehicleYear } from './hedge-model'
import { HEDGE_STRATEGY_IDS, MACRO_CALL_IDS, readCompanyHedge, type CompanyHedge } from './hedge-record'
import { bizOf, businessAssets, findBusiness, readBiz, runsIt, type BizState } from './state'
import { clampN, money } from './util'

/** Months of running costs a company keeps in cash before any goes to work. */
export const KEEP_MONTHS = 6

/** The most a target or a pot can be. */
const MONEY_MAX = 1e15
/** Most companies the list shows. */
const LIST_MAX = 20
const EMOJI = '🦈'

// ---------------------------------------------------------------------------
// Who can, and how much

/** Why this company can't put cash to work in a fund, or null. */
export function companyBlock(g: GameState, _a: Asset, b: BizState): string | null {
  if (b.industry === 'investmentFirm') return 'Its own fund is on its company screen.'
  if (isFinanceFirm(b)) return "A bank can't put its capital in a fund."
  if (inGroup(g, b)) return 'Its cash belongs to the group.'
  if (!(b.share > 1e-4)) return 'You own none of it.'
  return marketBlock(g, b.countryId)
}

/** The cash a company keeps: six months of running costs, or the board's reserve when that is more. */
export function companyFloor(g: GameState, a: Asset, b: BizState): number {
  const own = Math.round((KEEP_MONTHS / 12) * runningCosts(b))
  const board = boardExists(g, b) ? reserveDollars(b, boardView(g, a, b)) : 0
  return Math.max(own, board)
}

export interface CompanyQuote {
  /** The cash the company keeps. */
  floor: number
  /** What it could put to work: what it could pay out, less the floor. */
  spare: number
  /** What a target of this size really puts to work today. */
  work: number
  /** When a target is set but nothing can go to work: the first reason that applies. */
  why: string | null
}

/** What a target would put to work at the company's cash today. Pure. */
export function companyQuote(g: GameState, a: Asset, b: BizState, target: number): CompanyQuote {
  const floor = companyFloor(g, a, b)
  const payout = payoutCash(a, b)
  const spare = Math.max(0, payout - floor)
  const asked = clampN(target, 0, MONEY_MAX)
  const work = Math.floor(Math.min(asked, spare))
  let why: string | null = null
  if (asked > 0 && work < 1) {
    const payable = payableCash(a, b)
    if (b.debt > 0 && payable < 1) why = 'Its loans come first.'
    else if (payable >= 1 && payout < 1) why = 'Investors are paid back first.'
    else if (payout >= 1 && spare < 1) why = 'Its cash is at the floor.'
    else why = 'It has no spare cash.'
  }
  return { floor, spare, work, why }
}

/** The companies that can hold a fund, largest first, at most twenty. Each `b` is a read-only copy. */
export function eligibleCompanies(g: GameState): { a: Asset; b: BizState }[] {
  const out: { a: Asset; b: BizState }[] = []
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    if (!companyBlock(g, a, b)) out.push({ a, b })
  }
  const worth = (a: Asset): number => (Number.isFinite(a.value) ? a.value : 0)
  out.sort((x, y) => worth(y.a) - worth(x.a))
  return out.slice(0, LIST_MAX)
}

// ---------------------------------------------------------------------------
// Setting it

function refuse(g: GameState, reason: string): false {
  notice(g, 'Cash at Work', reason, { emoji: '🚫' })
  return false
}

const DEFAULTS: CompanyHedge = { v: 1, target: 0, strategy: 'longShort', call: 'flat', lev: 1, total: 0 }

/**
 * Changes a company's fund rule. `target` is the cash to put to work at year end; `strategy`, `call` and
 * `lev` are the strategy. A call or leverage means Macro; any other strategy puts the call back to flat and
 * leverage to 1x. Nothing changes when any part is refused. Moves no money.
 */
export function setCompanyFund(g: GameState, assetId: string, patch: { target?: number; strategy?: HedgeStrategy; call?: MacroCall; lev?: number }): boolean {
  const a = findBusiness(g, assetId)
  if (!a) return false
  const gate = manageBlock(g, a) ?? companyBlock(g, a, readBiz(g, a))
  if (gate) return refuse(g, gate)
  const b = bizOf(g, a)
  const now = readCompanyHedge(b.hedge)
  const next: CompanyHedge = { ...(now ?? DEFAULTS) }
  if (patch.target !== undefined) {
    if (typeof patch.target !== 'number' || !Number.isFinite(patch.target)) return refuse(g, 'Enter an amount.')
    next.target = Math.round(clampN(patch.target, 0, MONEY_MAX))
  }
  if (patch.strategy !== undefined) {
    if (!HEDGE_STRATEGY_IDS.includes(patch.strategy)) return false
    const block = strategyBlock(g, b.countryId, patch.strategy)
    if (block) return refuse(g, block)
    next.strategy = patch.strategy
    if (patch.strategy !== 'macro') {
      next.call = 'flat'
      next.lev = 1
    }
  }
  if (patch.call !== undefined || patch.lev !== undefined) {
    if (patch.call !== undefined && !MACRO_CALL_IDS.includes(patch.call)) return false
    const block = macroBlock(g)
    if (block) return refuse(g, block)
    next.strategy = 'macro'
    if (patch.call !== undefined) next.call = patch.call
    if (typeof patch.lev === 'number' && Number.isFinite(patch.lev)) next.lev = Math.round(clampN(patch.lev, 1, 3) * 2) / 2
  }
  b.hedge = readCompanyHedge(next) ?? next
  if (next.target !== (now?.target ?? 0)) {
    notice(g, 'Fund Set', next.target > 0 ? `${a.name} will put up to ${money(next.target)} to work at year end.` : `${a.name} stopped using a fund.`, { emoji: EMOJI })
  }
  return true
}

// ---------------------------------------------------------------------------
// The year

/** True when nobody at the wheel makes the call: the player doesn't run it, is gone, in prison or a minor. */
function autoRun(g: GameState, a: Asset): boolean {
  const c = g.character
  return !runsIt(g, a) || !c.alive || !!c.prison || !(c.age >= 18)
}

/**
 * The terms the year runs on. A hired CEO, or a player who is dead, in prison or under 18, runs the firm's
 * autopilot and leaves the owner's stored settings alone. Otherwise the stored terms, except that Macro
 * (and Quant where it isn't possible) falls back to Long/Short. Pure.
 */
export function companyTerms(g: GameState, a: Asset, b: BizState, h: CompanyHedge, work: number): { strategy: HedgeStrategy; call: MacroCall; lev: number; auto: boolean } {
  if (autoRun(g, a)) return { ...autoTerms({ countryId: b.countryId, lead: leaderSkill(g, b), nav: work, year: g.year }), auto: true }
  if (strategyBlock(g, b.countryId, h.strategy)) return { strategy: 'longShort', call: 'flat', lev: 1, auto: false }
  const macro = h.strategy === 'macro'
  return { strategy: h.strategy, call: macro ? h.call : 'flat', lev: macro ? h.lev : 1, auto: false }
}

/**
 * Puts a company's cash to work for one fiscal year, once. Called before the year is simulated, so the
 * result lands in that year's statement through yearIncome (a gain) or yearCosts (a loss) and b.cash
 * moves exactly once, here. At most 95% of the money at work can be lost, and what goes to work is
 * spare cash above the floor, so after the worst year the company is as liquid as the floor.
 */
export function bookHedgeYear(g: GameState, a: Asset, b: BizState, fiscal: number): void {
  if (!b.hedge) return
  const h = readCompanyHedge(b.hedge)
  if (!h || h.target <= 0) return
  if (h.last && h.last.year >= fiscal) return
  if (companyBlock(g, a, b)) return
  const q = companyQuote(g, a, b, h.target)
  if (q.work < 1) {
    // No cash to work with. An owner's Macro call was for this year and lapses with it.
    if (!autoRun(g, a) && h.strategy === 'macro') Object.assign(h, { strategy: 'longShort', call: 'flat', lev: 1 })
    h.last = { year: fiscal, work: 0, gross: 0, net: 0, market: 0, pnl: 0, ...(q.why ? { why: q.why } : {}) }
    b.hedge = readCompanyHedge(h) ?? h
    log(g, `${a.name} had no cash to put to work.`, 'neutral')
    return
  }
  const terms = companyTerms(g, a, b, h, q.work)
  const y = vehicleYear(g, { countryId: b.countryId, strategy: terms.strategy, call: terms.call, lev: terms.lev, nav: q.work, skill: skillOf(leaderSkill(g, b)), year: fiscal + 1 }, fundRng(g, b, fiscal, 'hedgeco'))
  const pnl = Math.round(q.work * y.net)
  if (pnl > 0) {
    b.cash += pnl
    b.yearIncome += pnl
  } else if (pnl < 0) {
    b.cash += pnl
    b.yearCosts += -pnl
  }
  h.total = clampN(h.total + pnl, -MONEY_MAX, MONEY_MAX)
  h.last = { year: fiscal, work: q.work, gross: y.gross, net: y.net, market: y.market, pnl }
  // The valuation takes this year's result out of the earnings it capitalizes: it is cash already (hedgeResultFor).
  h.marks = [...(h.marks ?? []).filter((m) => m.y !== fiscal), { y: fiscal, pnl }]
  // A Macro call lasts one year when the owner made it. An autopilot year leaves the owner's settings alone.
  if (!terms.auto && h.strategy === 'macro') Object.assign(h, { strategy: 'longShort', call: 'flat', lev: 1 })
  b.hedge = readCompanyHedge(h) ?? h
  log(g, `${a.name}'s fund ${pnl >= 0 ? 'made' : 'lost'} ${money(Math.abs(pnl))}.`, pnl >= 0 ? 'good' : 'bad')
}
