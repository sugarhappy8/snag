// The advisor's findings: six facts about the player's money, read from the state and never a forecast.
// Everything here is pure (no writes, no g.rng), so the menu, the yearly statement and the tests can all call
// it, and it renders from a deep-frozen state. A better advisor shows more of the list, never a different one.
import { payoutCash, runningCosts } from '../business/board-vote'
import { groupIdOf } from '../business/conglomerate-state'
import { businessAssets, readBiz } from '../business/state'
import { coinTargets, stockTargets } from '../computer/money-stocks'
import { formatMoney, netWorth } from '../core'
import { economyOf } from '../economy'
import { typicalIncome } from '../events/wealth-core'
import { companyKey } from '../invest/engine'
import { freshShare, investmentHoldings, liveDepositRate } from '../investments'
import { officeView } from '../nation/office'
import type { Asset, GameState, Loan } from '../types'

export interface Finding {
  id: 'insider' | 'loan' | 'concentration' | 'company-cash' | 'idle-cash' | 'losses'
  weight: number
  text: string
}

/** Every finding stays under this many characters (VOICE: a scene or outcome line). */
const MAX_TEXT = 140

/** Weights of the findings with a fixed one. `concentration` is round(60 + 40 x share). */
const WEIGHT = { insider: 95, loan: 70, companyCash: 50, idleCash: 40, losses: 30 } as const

/** A loan counts when it costs this much more than a savings account pays. */
const LOAN_GAP = 0.03
/** A holding or company this share of net worth is a concentration. */
const CONCENTRATION_AT = 0.4

const LOAN_KINDS: readonly string[] = ['student', 'personal', 'car', 'business']
/** Investment types that are not one name's risk: a broad fund, a government bond, a bank deposit. */
const BROAD: readonly string[] = ['index', 'bond', 'savings']
const OFFICE_WORD = { school: 'an office holder', mayor: 'Mayor', governor: 'Governor', leader: 'Leader' } as const

const money = formatMoney

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Unsigned percent with no trailing zeros: 0.026 gives '2.6%', 0.08 gives '8%'. */
function pct(x: number, digits = 1): string {
  const v = Number.isFinite(x) ? Math.min(Math.abs(x), 1e7) * 100 : 0
  return `${Number(v.toFixed(digits))}%`
}

/** A name for a sentence: control characters and runs of spaces gone. */
function tidy(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim() : ''
  return s || fallback
}

/** `name` cut to `room` characters, ending in an ellipsis when it was cut. */
function fit(name: string, room: number): string {
  if (name.length <= room) return name
  return room > 1 ? `${name.slice(0, room - 1).trimEnd()}…` : ''
}

/** A sentence built around one name: the name is cut when the sentence would pass the limit. */
function around(name: string, make: (n: string) => string): string {
  return make(fit(name, MAX_TEXT - make('').length))
}

function byValue(a: Asset, b: Asset): number {
  return num(b.value) - num(a.value)
}

// ---------------------------------------------------------------------------
// The six findings

/**
 * Made-up listed companies (and, at rank 2, coins) the office holder can move, held with units bought this year
 * or last: the same targets and the same window as the insider rule in special/politics.ts, so the warning is exact.
 */
function insider(g: GameState): Finding | null {
  const office = officeView(g)
  if (!office || office.rank < 1) return null
  const holdings = investmentHoldings(g)
  if (!holdings.length) return null
  const stocks = new Map(stockTargets(g).map((t) => [t.secId, t.name]))
  const coins = office.rank >= 2 ? new Map(coinTargets(g).map((t) => [t.secId, t.name])) : new Map<string, string>()
  const picks = new Map<string, { name: string; value: number }>()
  for (const a of holdings) {
    const secId = a.details.secId
    if (typeof secId !== 'string') continue
    const name = stocks.get(secId) ?? coins.get(secId)
    if (name === undefined || !(freshShare(a, g.year) > 0)) continue
    const row = picks.get(secId) ?? { name: tidy(name, 'a company'), value: 0 }
    row.value += Math.max(0, num(a.value))
    picks.set(secId, row)
  }
  if (!picks.size) return null
  const names = [...picks.values()].sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((p) => p.name)
  return { id: 'insider', weight: WEIGHT.insider, text: insiderText(tidy(office.title, OFFICE_WORD[office.office]), names) }
}

/** 'As Mayor you can move A and 2 others, and you bought them in the last two years. That counts as insider timing.' */
function insiderText(title: string, names: string[]): string {
  const n = names.length
  const tail = n === 1 ? '' : n === 2 ? ` and ${names[1]}` : ` and ${n - 1} others`
  const short = n === 2 ? ' and 1 other' : tail
  const make = (who: string, lead: string, rest: string) =>
    `As ${who} you can move ${lead}${rest}, and you bought ${n === 1 ? 'it' : 'them'} in the last two years. That counts as insider timing.`
  // Try the plain wording, then a shorter tail, then a generic title; keep at least 14 characters of the first name.
  for (const who of [title, OFFICE_WORD.school]) {
    for (const rest of [tail, short]) {
      const room = MAX_TEXT - make(who, '', rest).length
      if (room >= Math.min(names[0].length, 14)) return make(who, fit(names[0], room), rest)
    }
  }
  return make(OFFICE_WORD.school, fit(names[0], MAX_TEXT - make(OFFICE_WORD.school, '', short).length), short)
}

/** The costliest loan that cash on hand could clear, when it costs 3 points over savings. */
function loanFinding(g: GameState, T: number, cash: number): Finding | null {
  const sr = liveDepositRate(g, g.character.countryId, 'savings')
  let best: Loan | null = null
  for (const l of g.character.loans) {
    const rate = l.rate, balance = l.balance
    if (!Number.isFinite(rate) || !Number.isFinite(balance)) continue
    if (rate - sr < LOAN_GAP - 1e-9 || balance < 2 * T || cash < balance) continue
    if (!best || rate > best.rate) best = l
  }
  if (!best) return null
  const kind = LOAN_KINDS.includes(best.kind) ? `${best.kind} loan` : 'loan'
  return { id: 'loan', weight: WEIGHT.loan, text: `Your ${kind} costs ${pct(best.rate)} a year on ${money(best.balance)}. Your bank account holds ${money(cash)}.` }
}

/**
 * One company, or one name's holding, that is 40% or more of net worth. Companies count by id and investments by
 * the company behind `details.secId` (companyKey), so two lines of one security and two listed classes of one
 * company add up. Broad funds, bonds and deposits are not a name's risk.
 */
function concentration(g: GameState, T: number, nw: number): Finding | null {
  if (!(nw > 0)) return null
  const groups = new Map<string, { name: string; value: number; top: number }>()
  const add = (key: string, a: Asset): void => {
    const v = Math.max(0, num(a.value))
    const row = groups.get(key) ?? { name: tidy(a.name, 'A holding'), value: 0, top: -1 }
    if (v > row.top) {
      row.top = v
      row.name = tidy(a.name, 'A holding')
    }
    row.value += v
    groups.set(key, row)
  }
  for (const a of businessAssets(g)) add(`biz:${a.id}`, a)
  for (const a of [...investmentHoldings(g)].sort(byValue)) {
    if (BROAD.includes(String(a.details.type))) continue
    const secId = typeof a.details.secId === 'string' ? a.details.secId : ''
    add(`sec:${secId ? companyKey(secId) : a.id}`, a)
  }
  let top: { name: string; value: number } | null = null
  for (const row of groups.values()) if (!top || row.value > top.value) top = row
  if (!top) return null
  const raw = top.value / nw
  if (!(raw >= CONCENTRATION_AT) || top.value < 5 * T) return null
  const share = Math.min(1, raw)
  return { id: 'concentration', weight: Math.round(60 + 40 * share), text: around(top.name, (n) => `${n} is ${pct(share, 0)} of your net worth.`) }
}

/** A company the player owns a part of (and does not run in a group) that holds cash well past 18 months of costs. */
function companyCash(g: GameState, T: number): Finding | null {
  let best: { name: string; share: number; idle: number } | null = null
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    if (groupIdOf(b) || !(b.share >= 0.05)) continue
    const idle = payoutCash(a, b) - Math.round(1.5 * runningCosts(b))
    if (!Number.isFinite(idle) || idle < 2 * T) continue
    if (!best || idle > best.idle) best = { name: tidy(a.name, 'A company'), share: Math.min(1, b.share), idle }
  }
  if (!best) return null
  const { idle, share } = best
  // Where the cash comes out: a sole owner has no "Pay a Dividend" (the same row reads "Withdraw Profits",
  // business/manage.ts), and both have the standing rule, Yearly Dividend. All of it sits under Money.
  const rows = share < 1 ? 'Pay a Dividend and Yearly Dividend' : 'Yearly Dividend and Withdraw Profits'
  const yours = share < 1 ? money(idle * share) : 'all'
  return {
    id: 'company-cash',
    weight: WEIGHT.companyCash,
    text: around(best.name, (n) => `${n} holds ${money(idle)} past 18 months of costs, ${yours} yours before tax. Money has ${rows}.`),
  }
}

/** Plenty of cash in the bank account while a manager is not running it. */
function idleCash(g: GameState, T: number, nw: number, cash: number): Finding | null {
  if (cash < Math.max(10 * T, 0.1 * Math.max(0, nw))) return null
  const sr = liveDepositRate(g, g.character.countryId, 'savings')
  const infl = economyOf(g).inflation
  const move = Number.isFinite(infl) && infl < 0 ? 'fall' : 'rise'
  return { id: 'idle-cash', weight: WEIGHT.idleCash, text: `${money(cash)} sits in your bank account. Savings pay ${pct(sr)} and prices ${move} ${pct(infl)} a year.` }
}

/** Investment losses carried forward that shelter later gains. */
function losses(g: GameState, T: number): Finding | null {
  const carry = num(g.flags.investLossCarry)
  if (carry < T) return null
  return { id: 'losses', weight: WEIGHT.losses, text: `You carry ${money(carry)} of investment losses. Gains up to that size owe no tax.` }
}

// ---------------------------------------------------------------------------
// The list

/**
 * Every finding that applies, heaviest first (ties by id). With a `managed` book the idle-cash finding is
 * left out: the manager is already putting that cash to work.
 */
export function findings(g: GameState, managed: boolean): Finding[] {
  const T = typicalIncome(g)
  const nwRaw = netWorth(g)
  const nw = Number.isFinite(nwRaw) ? nwRaw : 0
  const cash = num(g.character.money)
  const out = [insider(g), loanFinding(g, T, cash), concentration(g, T, nw), companyCash(g, T), managed ? null : idleCash(g, T, nw, cash), losses(g, T)]
  return out.filter((f): f is Finding => f !== null).sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** How many findings an advisor of this skill shows: 2 at the bottom, 5 at 80 and up. */
export function shownCount(skill: number): number {
  const s = Number.isFinite(skill) ? skill : 50
  return Math.min(5, Math.max(2, 1 + Math.floor(s / 20)))
}

/** The top findings this advisor sees, and how many there were in all. */
export function shownFindings(g: GameState, skill: number, managed: boolean): { shown: Finding[]; total: number } {
  const all = findings(g, managed)
  return { shown: all.slice(0, shownCount(skill)), total: all.length }
}
