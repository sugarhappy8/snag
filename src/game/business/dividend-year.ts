// The yearly dividend rule at work: the cash floor, the quote (what a rule would pay, and why not),
// and the yearly payment. The floor and the quote are pure (no rng, no writes), so the menu's
// previews and the year step see the same numbers. The payment moves money only through payOut,
// the manual dividend's own move, and never past payoutCash minus the floor. It logs nothing and
// queues nothing here; the year step reports what it returns.
import { gameIncomeTax } from '../finance'
import type { Asset, GameState } from '../types'
import { boardExists, boardView } from './board-state'
import { payOut } from './board-menu'
import { payableCash, payoutCash, reserveDollars, runningCosts } from './board-vote'
import { inGroup } from './conglomerate-state'
import { readDividend, type DividendPolicy } from './dividend-policy'
import type { BizState, Statement } from './state'
import { clampN, num } from './util'

export interface DividendQuote {
  /** What the percentage applies to: the year's profit, or the spare cash. */
  basis: number
  /** Cash the company keeps. */
  floor: number
  /** Cash above the floor that may leave the company. */
  spare: number
  /** What the rule pays now (0 when it pays nothing). */
  pay: number
  /** Why nothing is paid; null when something is. */
  why: string | null
}

/**
 * The cash a company keeps before the rule pays: the player's months of running costs, or the board's
 * own reserve when a board exists, whichever is higher. Pure.
 */
export function dividendFloor(g: GameState, a: Asset, b: BizState, keep: number): number {
  const own = Math.round((clampN(keep, 0, 24) / 12) * runningCosts(b))
  const board = boardExists(g, b) ? reserveDollars(b, boardView(g, a, b)) : 0
  return Math.max(own, board)
}

/** What `p` would pay on a year of `profit` right now, and the one reason when it would pay nothing. Pure. */
export function dividendQuote(g: GameState, a: Asset, b: BizState, p: DividendPolicy, profit: number): DividendQuote {
  const net = Number.isFinite(profit) ? profit : 0
  const floor = dividendFloor(g, a, b, p.keep)
  const cash = payoutCash(a, b)
  const spare = Math.max(0, cash - floor)
  const basis = p.mode === 'profit' ? Math.max(0, net) : spare
  const want = Math.min(spare, Math.round(clampN(p.pct, 0, 1) * basis))
  const pay = want >= 1 ? want : 0
  if (pay >= 1) return { basis, floor, spare, pay, why: null }
  const room = payableCash(a, b)
  let why: string
  if (p.mode === 'profit' && !(net > 0)) why = 'It made no profit.'
  else if (b.debt > 0 && room <= 0) why = 'Its loans come first.'
  else if (room > 0 && cash <= 0) why = 'Investors are paid back first.'
  else if (cash > 0 && spare <= 0) why = 'Its cash is at the floor.'
  else why = 'It has no spare cash.'
  return { basis, floor, spare, pay: 0, why }
}

export interface DividendPaid {
  assetId: string
  name: string
  /** Total paid out by the company. */
  paid: number
  /** The player's part. */
  mine: number
  /** Relatives' part, before withholding. */
  family: number
  /** Everyone else's part: outside shareholders and executives. */
  rest: number
  /** The income tax the player's part adds, at the margin of the year's income so far. */
  tax: number
  /** The player's stake when it was paid. */
  share: number
  /** Dollars a listed share got; 0 for a private company. */
  perShare: number
  /** A listed company's share price after the payout; null for a private one. */
  price: number | null
}

export type DividendResult = { kind: 'paid'; paid: DividendPaid } | { kind: 'skipped'; name: string; why: string }

/**
 * The company's yearly dividend for fiscal year `s.year`. Null when there is nothing to do: no usable
 * rule, a division of a group (its cash is the group's), no stake, or this year already paid.
 * Otherwise it pays through payOut (cash out, the player's part taxed as income, relatives paid, a
 * listed price down by the payout per share), records the payment on the rule and returns the
 * amounts; or returns the reason nothing was paid. It uses no rng and no ids, and asks no board.
 */
export function autoDividendYear(g: GameState, a: Asset, b: BizState, s: Statement): DividendResult | null {
  const p = readDividend(b.dividend)
  if (!p || inGroup(g, b) || !(b.share > 1e-4) || (p.last && p.last.year >= s.year)) return null
  const q = dividendQuote(g, a, b, p, s.net)
  if (q.pay < 1 || Math.round(q.pay * b.share) < 1) return { kind: 'skipped', name: a.name, why: q.why ?? 'It has no spare cash.' }
  const pay = q.pay
  const mine = payOut(g, a, b, pay)
  const kin = (b.familyShares ?? []).reduce((sum, f) => sum + (f.share > 0 && Number.isFinite(f.share) ? f.share : 0), 0)
  const family = Math.round(pay * Math.min(1, kin))
  const rest = Math.max(0, pay - mine - family)
  const perShare = b.public && b.sharesOut > 0 ? Math.round((pay / b.sharesOut) * 1e6) / 1e6 : 0
  const T = num(g.flags.taxableIncome)
  const tax = Math.max(0, gameIncomeTax(g, T) - gameIncomeTax(g, Math.max(0, T - mine)))
  b.dividend = { ...p, last: { year: s.year, paid: pay, mine, perShare } }
  return { kind: 'paid', paid: { assetId: a.id, name: a.name, paid: pay, mine, family, rest, tax, share: b.share, perShare, price: b.public ? b.sharePrice : null } }
}
