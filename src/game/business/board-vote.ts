// Board votes. Big decisions (CEO pay above the norm, payouts above what the company can spare,
// spending past the CEO's budget, big loans, selling or listing the company, mergers, closing it,
// changing the CEO when the owner doesn't control the board, the mandate) go to the directors.
//
// Every director votes yes with a probability built from the same honest economics: what the
// proposal is worth to ALL the shareholders (merit), how much it favors the owner over the rest
// (self-dealing), the director's stance and their loyalty to the owner. The owner's own directors
// back the owner; investor directors and independents judge. On a listed company the independent
// directors (the pay and audit committees) can block blatant self-dealing even when the owner's
// seats would carry the vote, and minority shareholders sometimes sue over self-dealing that
// passes. passOdds() is the exact probability vote() rolls (the Business talent's hint).
import { addMoney, formatMoney, log, notice, remember } from '../core'
import { chance } from '../rng'
import type { Asset, GameState } from '../types'
import { boardExists, boardOf, boardView, controlsBoard, directorName, mandateDef, readBoard, recordVote, seatLabel, syncSeats, type BoardState, type Director, type Limits, type Mandate, type Stance } from './board-state'
import { ceoPayNorm } from './career'
import { readTech } from './deeptech-state'
import { equipmentValue, localEcon } from './economy'
import { earmarkedCash } from './gamestudio'
import { industryDef } from './industries'
import { runsIt, totalOutlets, type BizState } from './state'
import { clampN, money, pct } from './util'

export type ProposalKind =
  | 'ownerPay'
  | 'bonus'
  | 'dividend'
  | 'capex'
  | 'debt'
  | 'sell'
  | 'ipo'
  | 'merge'
  | 'close'
  | 'fire'
  | 'hire'
  | 'takeOver'
  | 'mandate'
  | 'limits'
  | 'ceoPay'

export interface Proposal {
  kind: ProposalKind
  /** What is being decided, for the record and the notice: 'Raise your salary to $480K'. */
  label: string
  /** Who puts it forward: the owner (the player), the hired CEO, or the board itself. */
  by: 'owner' | 'ceo' | 'board'
  /** Dollars at stake: yearly pay, payout, budget, loan, sale price, proceeds... */
  amount?: number
  /** Expected yearly profit an investment adds (capex), or the synergies of a merger. */
  gain?: number
  /** The CEO skill on the table (hire, take-over). */
  skill?: number
  mandate?: Mandate
  limits?: Limits
  /**
   * Value to all shareholders when the caller has already priced it on the company's own model
   * (mandates, limits, mergers), about -3..3. Hints and votes must pass the same number.
   */
  merit?: number
}

export interface Assessment {
  /** Value to all shareholders, about -3..3. */
  merit: number
  /** How much it favors the owner over the other shareholders, 0..3. */
  self: number
  /** Self-dealing the independent directors block outright on a listed company. */
  blatant: boolean
  /** The directors' reasoning in a few words ('' when unremarkable). */
  why: string
}

export interface VoteResult {
  passed: boolean
  yes: number
  no: number
  /** Blocked by the independent directors despite a majority. */
  vetoed: boolean
  /** True when no vote was needed (no board, or within the CEO's limits). */
  skipped: boolean
}

// ---------------------------------------------------------------------------
// The company's numbers the board looks at

/**
 * What can leave the company: cash beyond its loans and anything earmarked for unreleased games
 * (paying out borrowed money and then going bankrupt would keep the loan).
 */
export function payableCash(a: Asset, b: BizState): number {
  const v = b.cash - earmarkedCash(a) - b.debt
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
}

/** A year of the company's costs (last year's books, or an estimate before the first year). */
export function runningCosts(b: BizState): number {
  const s = b.last
  if (s) {
    const v = s.netRevenue + s.otherIncome - s.pbt
    if (Number.isFinite(v) && v > 0) return v
  }
  const def = industryDef(b.industry)
  const e = localEcon(b.industry, b.countryId, b.city)
  const v = totalOutlets(b) * (e.rent + e.capital * def.maint + def.staff * e.wage * b.wageLevel)
  return Number.isFinite(v) ? Math.max(0, v) : 0
}

/** The cash the CEO must keep. */
export function reserveDollars(b: BizState, st: BoardState): number {
  return Math.round((clampN(st.limits.reserve, 0, 24) / 12) * runningCosts(b))
}

/** What the company is worth to the board when budgeting (never less than its equipment and cash). */
function budgetBase(b: BizState): number {
  return Math.max(b.valuation, equipmentValue(b) + Math.max(0, b.cash), 1)
}

/** The yearly budget for new sites, capacity and R&D the CEO may spend without asking. */
export function capexBudget(b: BizState, st: BoardState): number {
  return Math.round(clampN(st.limits.capex, 0, 1) * budgetBase(b))
}

/** What is left of this year's budget. */
export function capexLeft(g: GameState, b: BizState, st: BoardState): number {
  const used = st.spentYear === g.year ? st.spent : 0
  return Math.max(0, capexBudget(b, st) - used)
}

/** Record spending against this year's budget. */
export function noteSpend(g: GameState, st: BoardState, amount: number): void {
  if (!(amount > 0)) return
  if (st.spentYear !== g.year) {
    st.spentYear = g.year
    st.spent = 0
  }
  st.spent = Math.round(st.spent + amount)
}

/** The most a CEO may earn a year (salary + bonus) without a vote. */
export function payCap(b: BizState, st: BoardState): number {
  return Math.round(clampN(st.limits.pay, 1, 5) * ceoPayNorm(b))
}

/** Dividends the board lets go without a vote: spare cash above the reserve. */
export function sustainablePayout(a: Asset, b: BizState, st: BoardState): number {
  return Math.max(0, payableCash(a, b) - reserveDollars(b, st))
}

/** Debt the board accepts without a vote: about a year and a half of profit, or a third of the company's value. */
export function debtComfort(b: BizState): number {
  const profit = Math.max(0, b.last?.net ?? 0)
  return Math.round(Math.max(profit * 1.5, b.valuation * 0.33, equipmentValue(b) * 0.25))
}

/**
 * How the company is doing, -1..1: margin and growth from the books (deep tech before it sells:
 * how far its milestones are slipping).
 */
export function performance(b: BizState): number {
  const s = b.last
  const h = b.history
  if (b.tech && (!s || s.revenue <= 0)) {
    const t = readTech(b.tech)
    return clampN((50 - t.pressure) / 50 - (t.stuck >= 2 ? 0.3 : 0), -1, 1)
  }
  if (!s || s.revenue <= 0) return 0
  const margin = s.net / s.revenue
  const prev = h.length >= 2 ? h[h.length - 2] : null
  const growth = prev && prev.revenue > 0 ? clampN(s.revenue / prev.revenue - 1, -0.5, 0.8) : 0
  const v = clampN(margin * 4 + growth * 1.5, -1, 1)
  return Number.isFinite(v) ? v : 0
}

// ---------------------------------------------------------------------------
// How a proposal looks to the directors

function payProposal(b: BizState, st: BoardState, total: number, perf: number, owner: boolean): Assessment {
  const norm = Math.max(1, ceoPayNorm(b))
  const cap = clampN(st.limits.pay, 1, 5)
  const r = Math.max(0, total) / norm
  const over = Math.max(0, r - cap)
  const merit = clampN(0.6 * perf - 0.9 * over, -3, 2)
  const self = owner ? clampN(over, 0, 3) : 0
  return { merit, self, blatant: owner && r >= cap * 2, why: over > 0 ? `${r.toFixed(1)}x the going rate for a CEO here` : '' }
}

/** What a proposal is worth to the shareholders, and how much it favors the owner (pure). */
export function assess(g: GameState, a: Asset, b: BizState, st: BoardState, p: Proposal): Assessment {
  const perf = performance(b)
  const value = Math.max(1, b.valuation)
  const amount = Math.max(0, p.amount ?? 0)
  const none: Assessment = { merit: 0, self: 0, blatant: false, why: '' }
  switch (p.kind) {
    case 'ownerPay':
      return payProposal(b, st, amount, perf, true)
    case 'bonus': {
      const as = payProposal(b, st, b.ownerSalary + amount, perf, true)
      const losing = (b.last?.net ?? 0) < 0
      return { ...as, merit: as.merit - (losing ? 1 : 0), self: clampN(as.self + (losing ? 0.6 : 0), 0, 3), why: losing ? 'a bonus after a losing year' : as.why }
    }
    case 'ceoPay': {
      const norm = Math.max(1, ceoPayNorm(b))
      const over = Math.max(0, amount / norm - clampN(st.limits.pay, 1, 5))
      const skill = p.skill ?? 60
      return { merit: clampN((skill - 70) / 15 - 0.9 * over, -3, 1.5), self: 0, blatant: false, why: over > 0 ? `${(amount / norm).toFixed(1)}x the going rate` : '' }
    }
    case 'dividend': {
      const spare = sustainablePayout(a, b, st)
      const excess = Math.max(0, amount - spare) / Math.max(1, b.cash)
      return { merit: clampN(0.3 - 2.5 * excess, -3, 1), self: 0, blatant: false, why: amount > spare ? 'it dips into the cash the company needs' : '' }
    }
    case 'capex': {
      const gain = p.gain ?? 0
      const years = gain > 0 ? amount / gain : Infinity
      const stretch = amount > Math.max(0, b.cash) * 0.8 ? 0.5 : 0
      const merit = gain > 0 ? clampN((5 - years) / 3, -2, 1.5) - stretch : -1 - stretch
      return { merit, self: 0, blatant: false, why: gain > 0 ? `pays back in about ${Math.max(1, Math.round(years))} years` : 'nobody can show it pays back' }
    }
    case 'debt': {
      const lev = (b.debt + amount) / value
      return { merit: clampN(0.3 - 2 * Math.max(0, lev - 0.3) + 0.4 * perf, -3, 1), self: 0, blatant: false, why: lev > 0.5 ? 'that is a lot of debt for this company' : '' }
    }
    case 'sell': {
      const prem = amount / value - 1
      const covers = (b.pref ?? 0) > 0 && amount >= (b.pref ?? 0) ? 0.4 : 0
      return { merit: clampN(prem * 5 + covers, -3, 2), self: 0, blatant: false, why: prem >= 0 ? `${pct(prem)} above what it is worth` : `${pct(-prem)} below what it is worth` }
    }
    case 'ipo':
      return { merit: 0.5 + 0.3 * perf, self: 0, blatant: false, why: '' }
    case 'merge':
    case 'mandate':
    case 'limits':
      return { merit: clampN(p.merit ?? 0, -3, 3), self: p.kind === 'limits' && runsIt(g, a) && p.limits && p.limits.pay > st.limits.pay ? clampN((p.limits.pay - st.limits.pay) * 0.8, 0, 3) : 0, blatant: false, why: '' }
    case 'close': {
      const prem = amount / value - 1
      return { merit: clampN(prem * 4, -3, 1), self: 0, blatant: false, why: prem < -0.2 ? 'closing destroys value' : '' }
    }
    case 'fire': {
      const skill = b.manager?.skill ?? 50
      const target = b.ceo === 'manager' ? skill : 55
      return { merit: clampN(-perf * 1.2 + st.misses * 0.4 + (55 - target) / 25 - st.churn * 0.3, -3, 3), self: 0, blatant: false, why: st.misses > 0 ? `${st.misses} missed year${st.misses === 1 ? '' : 's'}` : '' }
    }
    case 'hire': {
      const norm = Math.max(1, ceoPayNorm(b))
      const over = Math.max(0, amount / norm - clampN(st.limits.pay, 1, 5))
      return { merit: clampN(((p.skill ?? 60) - 60) / 20 - 0.9 * over - st.churn * 0.2, -3, 2), self: 0, blatant: false, why: '' }
    }
    case 'takeOver': {
      const cur = b.ceo === 'manager' && b.manager ? b.manager.skill : 50
      return { merit: clampN(((p.skill ?? 50) - cur) / 15, -3, 2), self: 0.3, blatant: false, why: '' }
    }
  }
  return none
}

/** How each stance leans on a kind of proposal (and on mandates, by which one). */
function stanceBias(s: Stance, p: Proposal, st: BoardState): number {
  switch (p.kind) {
    case 'capex':
      return s === 'growth' ? 0.8 : s === 'caution' ? -0.6 : 0
    case 'dividend':
      return s === 'profit' ? 0.6 : s === 'growth' ? -0.4 : -0.3
    case 'debt':
      return s === 'caution' ? -0.9 : s === 'growth' ? 0.3 : -0.2
    case 'sell':
      return s === 'caution' ? 0.2 : s === 'growth' ? -0.3 : 0
    case 'ipo':
      return s === 'growth' ? 0.5 : s === 'caution' ? -0.2 : 0.2
    case 'merge':
      return s === 'growth' ? 0.4 : s === 'caution' ? -0.3 : 0
    case 'close':
      return s === 'caution' ? 0.1 : -0.3
    case 'ownerPay':
    case 'bonus':
    case 'ceoPay':
      return s === 'profit' ? -0.3 : s === 'caution' ? -0.2 : 0
    case 'mandate': {
      const m = p.mandate ?? st.mandate
      const table: Record<Stance, Record<Mandate, number>> = {
        growth: { growth: 0.9, balanced: 0.2, profit: -0.2, cash: -0.6 },
        profit: { growth: -0.2, balanced: 0.1, profit: 0.6, cash: 0.4 },
        caution: { growth: -0.7, balanced: 0.2, profit: 0.2, cash: 0.4 },
      }
      return table[s][m]
    }
    case 'limits': {
      const l = p.limits ?? st.limits
      const more = l.capex - st.limits.capex
      const looser = st.limits.reserve - l.reserve
      return (s === 'growth' ? 1.2 * more : s === 'caution' ? -1.5 * more - 0.08 * looser : -0.5 * more) + (s === 'caution' ? -0.04 * looser : 0)
    }
    default:
      return 0
  }
}

function logistic(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

/** True when the proposal is aimed at the owner (the board moving to oust the owner as CEO). */
function againstOwner(g: GameState, a: Asset, p: Proposal): boolean {
  return p.kind === 'fire' && p.by === 'board' && runsIt(g, a)
}

/** The chance one director votes yes. */
export function yesOdds(g: GameState, a: Asset, st: BoardState, d: Director, p: Proposal, as: Assessment): number {
  if (d.seat === 'owner' || d.seat === 'group') {
    if (againstOwner(g, a, p)) return 0.05
    if (p.by === 'owner') return as.blatant ? 0.85 : 0.97
    // The CEO's or the board's own proposals: the owner's people judge them on the merits.
    return clampN(logistic(1.2 * as.merit + 0.5), 0.03, 0.97)
  }
  const selfWeight = d.seat === 'independent' ? 2.2 : 1.6
  const loyal = ((d.loyalty - 50) / 25) * (p.by === 'owner' ? 1 : 0.3)
  const z = 1.2 * as.merit + stanceBias(d.stance, p, st) + loyal - selfWeight * as.self + (p.by === 'board' ? 0.5 : 0)
  return clampN(logistic(z), 0.02, 0.98)
}

/** Independents can block blatant self-dealing on a listed company. */
function vetoApplies(b: BizState, st: BoardState, as: Assessment): boolean {
  return b.public && as.blatant && st.members.some((d) => d.seat === 'independent')
}

/**
 * 'Raise your salary…' → 'raise your salary…' (only the first letter: money like $480K keeps its
 * case, and so does an acronym such as 'CEO pay policy').
 */
export function lowerFirst(s: string): string {
  return s && !/^[A-Z]{2}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

/** Proposals about the owner's own pay, which minority shareholders can take to court. */
const SUABLE: ReadonlySet<ProposalKind> = new Set<ProposalKind>(['ownerPay', 'bonus', 'limits'])

/**
 * The chance minority shareholders take an approved self-dealing pay proposal of the owner's to
 * court and a judge blocks it (at most one suit a year). Pure.
 */
function suitOdds(g: GameState, b: BizState, st: BoardState, p: Proposal, as: Assessment): number {
  if (p.by !== 'owner' || !SUABLE.has(p.kind) || !(as.self > 0) || b.share >= 0.999 || st.sued === g.year) return 0
  return clampN(0.12 * as.self * (1 - b.share) + (b.public ? 0.05 : 0), 0, 0.6)
}

/** True when the board already turned down this kind of proposal from the owner this year (pure). */
export function refusedThisYear(g: GameState, b: BizState, kind: ProposalKind): boolean {
  if (!boardExists(g, b)) return false
  return readBoard(b.board).refused[kind] === g.year
}

/**
 * The exact chance a proposal passes (majority of the board, and on a listed company no veto by
 * a majority of the independents over blatant self-dealing). Pure: the board as it would sit now.
 */
export function passOdds(g: GameState, a: Asset, b: BizState, p: Proposal): number {
  if (!boardExists(g, b)) return 1
  const st = boardView(g, a, b)
  const n = st.members.length
  if (n === 0) return 1
  if (p.by === 'owner' && st.refused[p.kind] === g.year) return 0
  const as = assess(g, a, b, st, p)
  const indep = st.members.filter((d) => d.seat === 'independent').length
  // dp[yes][independent yes]
  let dp: number[][] = [[1]]
  for (const d of st.members) {
    const q = yesOdds(g, a, st, d, p, as)
    const isInd = d.seat === 'independent' ? 1 : 0
    const next: number[][] = []
    for (let y = 0; y < dp.length; y++) {
      for (let i = 0; i < dp[y].length; i++) {
        const pr = dp[y][i]
        if (!pr) continue
        next[y] ??= []
        next[y][i] = (next[y][i] ?? 0) + pr * (1 - q)
        next[y + 1] ??= []
        next[y + 1][i + isInd] = (next[y + 1][i + isInd] ?? 0) + pr * q
      }
    }
    dp = next
  }
  const veto = vetoApplies(b, st, as)
  let pass = 0
  for (let y = 0; y < dp.length; y++) {
    if (!dp[y] || y * 2 <= n) continue
    for (let i = 0; i < dp[y].length; i++) {
      const pr = dp[y][i] ?? 0
      if (!pr) continue
      if (veto && (indep - i) * 2 > indep) continue
      pass += pr
    }
  }
  // An approved self-dealing pay proposal can still be blocked in court.
  return clampN(pass * (1 - suitOdds(g, b, st, p, as)), 0, 1)
}

/**
 * Why this needs the board (null: the CEO may simply do it). The player is held to the same
 * limits as a hired CEO.
 */
export function needsVote(g: GameState, a: Asset, b: BizState, p: Proposal): string | null {
  if (!boardExists(g, b)) return null
  const st = boardView(g, a, b)
  if (st.members.length === 0) return null
  const amount = Math.max(0, p.amount ?? 0)
  switch (p.kind) {
    case 'ownerPay':
      return amount > payCap(b, st) ? `Pay above ${money(payCap(b, st))} a year needs the board.` : null
    case 'bonus':
      return b.ownerSalary + amount > payCap(b, st) ? `Salary and bonus above ${money(payCap(b, st))} a year need the board.` : null
    case 'ceoPay':
    case 'hire':
      return amount > payCap(b, st) ? `CEO pay above ${money(payCap(b, st))} a year needs the board.` : p.kind === 'hire' && !controlsBoard(st) ? 'Investors control the board: the CEO is theirs to appoint too.' : null
    case 'dividend':
      return amount > sustainablePayout(a, b, st) ? `Payouts above ${money(sustainablePayout(a, b, st))} (the cash above the reserve) need the board.` : null
    case 'capex':
      return amount > capexLeft(g, b, st) ? `Spending above this year's budget (${money(capexLeft(g, b, st))} left) needs the board.` : null
    case 'debt':
      return b.debt + amount > debtComfort(b) ? `Borrowing past ${money(debtComfort(b))} of debt needs the board.` : null
    case 'fire':
    case 'takeOver':
      return controlsBoard(st) ? null : 'Investors control the board: changing the CEO is their call too.'
    case 'close':
      return controlsBoard(st) ? null : 'Closing a company with outside owners needs the board.'
    case 'sell':
    case 'ipo':
    case 'merge':
    case 'mandate':
    case 'limits':
      return 'The board decides this.'
  }
  return null
}

function tallyText(st: BoardState, votes: boolean[]): string {
  const name = (d: Director) => `${directorName(d)} (${seatLabel(d.seat)})`
  const yes = st.members.filter((_d, i) => votes[i]).map(name)
  const no = st.members.filter((_d, i) => !votes[i]).map(name)
  return `${yes.length ? `For: ${yes.join(', ')}.` : 'Nobody voted for it.'}${no.length ? ` Against: ${no.join(', ')}.` : ''}`
}

/**
 * Put a proposal to the board now: every director votes (g's RNG), the result goes on record,
 * loyalties move and a notice shows the tally (unless `quiet`). Without a board it passes.
 */
export function vote(g: GameState, a: Asset, b: BizState, p: Proposal, opts: { quiet?: boolean } = {}): VoteResult {
  if (!boardExists(g, b)) return { passed: true, yes: 0, no: 0, vetoed: false, skipped: true }
  const st = boardOf(b)
  syncSeats(g, a, b, st)
  if (st.members.length === 0) return { passed: true, yes: 0, no: 0, vetoed: false, skipped: true }
  // One shot a year: a rejected proposal can't be put again and again until the dice say yes.
  if (p.by === 'owner' && st.refused[p.kind] === g.year) {
    if (!opts.quiet) notice(g, 'Not Again This Year', `${a.name}'s board already said no to a proposal like that this year. "${p.label}" will have to wait until next year.`, { emoji: '\u{1F3DB}\u{FE0F}', tone: 'bad' })
    return { passed: false, yes: 0, no: st.members.length, vetoed: false, skipped: false }
  }
  const as = assess(g, a, b, st, p)
  const votes = st.members.map((d) => chance(g, yesOdds(g, a, st, d, p, as)))
  const yes = votes.filter(Boolean).length
  const no = votes.length - yes
  const indep = st.members.map((d, i) => ({ d, v: votes[i] })).filter((x) => x.d.seat === 'independent')
  const indepNo = indep.filter((x) => !x.v).length
  const majority = yes * 2 > votes.length
  const vetoed = majority && vetoApplies(b, st, as) && indepNo * 2 > indep.length
  const approved = majority && !vetoed
  const note = vetoed ? 'the independent directors blocked it' : as.why
  recordVote(st, { year: g.year, what: p.label, yes, no, passed: approved, note })
  // Directors remember how they're treated: self-dealing costs goodwill, and so does being
  // outvoted. Backing a sound idea of the owner's that the others voted down earns a little.
  st.members.forEach((d, i) => {
    if (d.seat === 'owner' || d.seat === 'group') return
    let dl = 0
    if (p.by === 'owner') dl -= Math.round(4 * as.self)
    if (approved && !votes[i] && p.by === 'owner') dl -= 2
    if (!approved && votes[i] && p.by === 'owner' && as.merit > 0 && as.self <= 0) dl += 1
    d.loyalty = Math.round(clampN(d.loyalty + dl, 0, 100))
  })
  if (!opts.quiet) {
    const head = `${p.label}. The board of ${a.name} voted ${yes}\u{2013}${no}${vetoed ? ', but the independent directors on the pay committee blocked it as self-dealing' : approved ? ' in favor' : ' against'}${!vetoed && as.why ? ` (${as.why})` : ''}.`
    notice(g, approved ? 'Board Vote: Approved' : 'Board Vote: Rejected', `${head}\n${tallyText(st, votes)}`, { emoji: '\u{1F3DB}\u{FE0F}', tone: approved ? 'good' : 'bad' })
  }
  log(g, `${a.name}'s board ${approved ? 'approved' : 'rejected'}: ${lowerFirst(p.label)} (${yes}\u{2013}${no}).`, approved ? 'neutral' : 'bad')
  // Minority shareholders can take approved self-dealing to court (suitOdds; passOdds counts it).
  const sue = approved ? suitOdds(g, b, st, p, as) : 0
  const blocked = sue > 0 && chance(g, sue) && minoritySuit(g, a, b, st, p)
  const passed = approved && !blocked
  if (!passed && p.by === 'owner') st.refused[p.kind] = g.year
  return { passed, yes, no, vetoed, skipped: false }
}

/**
 * Minority shareholders sue over self-dealing pay the owner's seats pushed through: a judge blocks
 * it before any money moves, and the owner pays the legal costs from their own pocket.
 */
function minoritySuit(g: GameState, a: Asset, b: BizState, st: BoardState, p: Proposal): boolean {
  st.sued = g.year
  const amount = Math.max(0, p.amount ?? 0)
  const total = p.kind === 'bonus' ? b.ownerSalary + amount : amount
  const excess = Math.max(0, total - payCap(b, st))
  const costs = Math.round(Math.max(5_000, excess * 0.15) * clampN(localEcon(b.industry, b.countryId, b.city).level, 0.3, 2))
  addMoney(g, -costs)
  const last = st.votes[st.votes.length - 1]
  if (last && last.what === p.label && last.year === g.year) last.note = 'then blocked in court as self-dealing'
  log(g, `${a.name}'s minority shareholders sued me over my pay and a judge blocked it.`, 'bad')
  remember(g, `Was sued by ${a.name}'s minority shareholders over my pay.`)
  notice(g, 'Sued by Shareholders', `${a.name}'s board approved it, but the minority shareholders took you to court over "${lowerFirst(p.label)}". The judge called it self-dealing and blocked it, and you pay ${formatMoney(costs)} in legal costs. The board won't hear it again this year.`, { emoji: '\u{2696}\u{FE0F}', tone: 'bad' })
  return true
}

/**
 * The gate for decisions that may need the board: true when the CEO may go ahead (no board, within
 * limits, or the board approved). Capex that goes ahead is booked against the year's budget.
 */
export function boardAllows(g: GameState, a: Asset, b: BizState, p: Proposal): boolean {
  const why = needsVote(g, a, b, p)
  const ok = why === null ? true : vote(g, a, b, p).passed
  if (ok && p.kind === 'capex' && boardExists(g, b)) noteSpend(g, boardOf(b), Math.max(0, p.amount ?? 0))
  return ok
}

/** 'about 85%' for a hint. */
export function oddsText(p: number): string {
  const v = Math.round(clampN(p, 0, 1) * 100)
  return v >= 99 ? 'almost certain' : v <= 1 ? 'almost no chance' : `about ${v}%`
}

/** The mandate's one-line brief for the CEO with its limits in dollars. */
export function mandateLine(a: Asset, b: BizState, st: BoardState): string {
  const def = mandateDef(st.mandate)
  return `${def.emoji} ${def.label}: ${def.brief}. Budget ${money(capexBudget(b, st))} a year for new sites, capacity and R&D · keep at least ${money(reserveDollars(b, st))} in cash · CEO pay up to ${money(payCap(b, st))} a year${sustainablePayout(a, b, st) > 0 ? ` · ${money(sustainablePayout(a, b, st))} could be paid out now` : ''}`
}
