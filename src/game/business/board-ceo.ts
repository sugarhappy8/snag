// Hired CEOs who actually run the company. A general manager above SMART_SKILL (75) works for profit
// like a real executive: every year they set price and production with the Annual Report's own
// optimizer (economy.bestPlan), pick the marketing budget, pay level and supplier by value, hire
// key staff for gaps and let deadweight go, retire faded product lines and fund R&D that pays,
// close loss-making sites and open new ones (or build capacity) when the payback is good, pay down
// expensive debt and keep a cash reserve. Their small mistakes shrink with skill: every estimate
// they act on is off by up to (100 - skill)%, so a 95 is near-optimal and a 76 is good.
//
// They obey the board's mandate and limits (business/board-state.ts): growth/balanced/profit/cash,
// a yearly budget for new sites, capacity and R&D, a minimum cash reserve. Each has a style
// (grower, cost-cutter, steady hand, visionary) that tips close calls, and writes the owner one
// short letter a year: a bullet per change, the numbers without the reasoning.
//
// The what-if evaluators here are pure (no g.rng): the Business talent's hints and the board's
// mandate assessment use them too, so a hint names exactly what a good CEO would do.
import { earnIncome } from '../core'
import { isIndustryLegal, marketOf } from '../data/markets'
import { bell, chance, rand, randInt, uid, weightedPick } from '../rng'
import type { Asset, GameState } from '../types'
import { COUNTRIES, getCountry, randomFirstName, randomLastName } from '../world'
import { boardOf, type BoardState, type Mandate } from './board-state'
import { capexBudget, capexLeft, noteSpend, payableCash, payoutCash, reserveDollars, runningCosts } from './board-vote'
import { ceoLetter, LETTER_WORDS, letterWords, SMART_SKILL, styleOf } from './career'
import { isDeepTech } from './deeptech-state'
import { readDividend } from './dividend-policy'

export { ceoLetter, ownerAvailable } from './career'
import { bestPlan, bookYear, planFor, bizWorth, fxValue, LASTING_YEARS, lineCost, linesOf, localEcon, localPay, marketCtxFor, maxProduction, priceBounds, refreshValue, startupCost, staffNet, valuationOf, type Worth } from './economy'
import { roleTitle } from './era'
import { laborProtection, severanceMonths, STAFF_TRAITS } from './flavor'
import { financeTarget } from './finance-leadership'
import { industryDef, lineOf, type RoleDef } from './industries'
import { complexityShare, productIdeas } from './products'
import { heavyOf } from './heavy-rd'
import { opsProgram } from './lab-data'
import { bestLabMove } from './lab-rules'
import { LAB_SAY } from './lab-text'
import { fileLabPatent, startOps } from './lab-year'
import { bestRdIdea, pullValue, rdOf, retireLines, retireOrder } from './rd'
import { fieldFor, lineInfo, productPull } from './product-market'
import { bestRole, hireValue, interviewFee, maxKeyStaff } from './staff'
import { sectorTurn } from './sector-ceo'
import { classFactor } from './share-classes'
import { totalOutlets, type BizState, type KeyStaff, type Manager, type Supplier } from './state'
import { clampN, money, plural, priceCapOf, round2, unitMoney, units } from './util'
import { bestResilienceMove } from './supply-resilience'
import { inputContractQuote, purchaseEquipmentUpgrade, purchaseInputContract, purchaseTraining } from './supply-policy'
import { readSupplyPolicy, saveSupplyPolicy } from './supply-policy-state'
import { inGroup } from './conglomerate-state'

/** Years an investment is counted for (the expansion hints use the same yardstick). */
export const MARGIN_YEARS = 5

/** Longest payback each mandate accepts for new sites and capacity. */
export const MAX_PAYBACK: Record<Mandate, number> = { growth: 6, balanced: 4.5, profit: 3, cash: 2.5 }

/**
 * How fast a CEO grows the network under each mandate: new sites a year as a share of the ones
 * the company has (hiring, training and fitting out take time; nobody sensible triples in a year).
 */
const GROWTH_PACE: Record<Mandate, number> = { growth: 0.5, balanced: 0.3, profit: 0.15, cash: 0.05 }

/** R&D projects a CEO may start in a year under each mandate. */
const RD_PER_YEAR: Record<Mandate, number> = { growth: 5, balanced: 3, profit: 2, cash: 1 }

/** Operations R&D programs and patents a CEO may start in a year under each mandate (a cost-cutter may add one cost program). */
const LAB_PER_YEAR: Record<Mandate, number> = { growth: 2, balanced: 1, profit: 1, cash: 0 }

/** A mistake model: an estimate as the CEO sees it (identity for hints). */
export type Judge = (v: number) => number

const exact: Judge = (v) => v


// ---------------------------------------------------------------------------
// What-ifs (pure)

/** Cost to open `n` sites in a city (capital, plus registration in a new country): manage.expansionCost. */
export function openCost(b: BizState, countryId: string, city: string, n: number): number {
  const cost = startupCost(b.industry, countryId, city)
  const newCountry = !b.outlets.some((o) => o.countryId === countryId)
  return Math.round(cost.capital * n + (newCountry ? cost.fee + cost.permits : Math.round(cost.fee * 0.2)))
}

/** The company with `n` more (or fewer) sites in a city: a copy for what-ifs. */
export function withOutlets(b: BizState, countryId: string, city: string, n: number, year: number): BizState {
  const outlets = b.outlets.some((o) => o.countryId === countryId && o.city === city)
    ? b.outlets.map((o) => (o.countryId === countryId && o.city === city ? { ...o, count: o.count + n } : o))
    : [...b.outlets, { countryId, city, count: n, opened: year }]
  return { ...b, outlets: outlets.filter((o) => o.count > 0) }
}

/** Next year's expected profit of a (what-if) company: the hints' central-scenario planner. */
function profitOf(g: GameState, b: BizState): number {
  const p = bestPlan(g, b, { fast: true }).profit
  return Number.isFinite(p) ? p : 0
}

export interface Move {
  kind: 'open' | 'lines' | 'close'
  countryId: string
  city: string
  n: number
  /** Up-front cost (negative: cash that comes back). */
  cost: number
  /** Expected yearly profit change. */
  gain: number
  /** gain over MARGIN_YEARS minus the cost (plus any refund). */
  value: number
}

const COUNT_GRID = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, 800, 1_200, 2_000, 5_000, 10_000]

/** Cities a CEO looks at: the home market's biggest, and (when thinking big) the best capitals abroad. */
function targetCities(b: BizState, abroad: boolean): { countryId: string; city: string }[] {
  const out = getCountry(b.countryId).cities.slice(0, 6).map((city) => ({ countryId: b.countryId, city }))
  if (!abroad || totalOutlets(b) < 2) return out
  const scored = COUNTRIES.filter((c) => c.id !== b.countryId && isIndustryLegal(c.id, b.industry) && c.cities.length > 0)
    .map((c) => {
      const e = localEcon(b.industry, c.id, c.cities[0])
      const m = marketOf(c.id)
      return { c, score: e.demandMult * e.income * Math.sqrt(Math.max(0.3, m.populationM)) * (0.5 + m.easeOfBusiness / 100) }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 2)
  return [...out, ...scored.map((x) => ({ countryId: x.c.id, city: x.c.cities[0] }))]
}

/** The best new sites the company can pay for out of `avail` (null: none pays back in time). */
export function bestOpening(g: GameState, b: BizState, avail: number, opts: { abroad: boolean; maxPayback: number; judge?: Judge; base?: number; tilt?: number; maxN?: number }): Move | null {
  const judge = opts.judge ?? exact
  const base = opts.base ?? profitOf(g, b)
  let best: Move | null = null
  for (const t of targetCities(b, opts.abroad)) {
    if (!isIndustryLegal(t.countryId, b.industry) || localEcon(b.industry, t.countryId, t.city).demandMult <= 0) continue
    const each = startupCost(b.industry, t.countryId, t.city).capital
    if (!(each > 0)) continue
    const fixed = openCost(b, t.countryId, t.city, 0)
    const max = Math.min(Math.floor((avail - fixed) / each), opts.maxN ?? Infinity)
    if (!(max >= 1)) continue
    let worse = 0
    let prev = -Infinity
    for (const n of [...new Set([...COUNT_GRID.filter((x) => x < max), max])]) {
      const gain = judge(profitOf(g, withOutlets(b, t.countryId, t.city, n, g.year)) - base) * (opts.tilt ?? 1)
      const cost = openCost(b, t.countryId, t.city, n)
      const value = gain * MARGIN_YEARS - cost
      if (gain > 0 && cost / gain <= opts.maxPayback && value > 0 && (!best || value > best.value)) best = { kind: 'open', countryId: t.countryId, city: t.city, n, cost, gain, value }
      worse = value < prev ? worse + 1 : 0
      prev = value
      if (worse >= 2 || (n >= 3 && gain <= 0)) break
    }
  }
  return best
}

/** The best number of capacity lines to build out of `avail` (industries that have them). */
export function bestLines(g: GameState, b: BizState, avail: number, opts: { maxPayback: number; judge?: Judge; base?: number; maxN?: number }): Move | null {
  if (!lineOf(b.industry)) return null
  const each = lineCost(b, 1)
  if (!(each > 0)) return null
  const max = Math.min(Math.floor(avail / each), opts.maxN ?? Infinity)
  if (!(max >= 1)) return null
  const judge = opts.judge ?? exact
  const base = opts.base ?? profitOf(g, b)
  let best: Move | null = null
  let worse = 0
  let prev = -Infinity
  for (const n of [...new Set([...COUNT_GRID.filter((x) => x < max), max])]) {
    const gain = judge(profitOf(g, { ...b, lines: linesOf(b) + n }) - base)
    const cost = lineCost(b, n)
    const value = gain * MARGIN_YEARS - cost
    if (gain > 0 && cost / gain <= opts.maxPayback && value > 0 && (!best || value > best.value)) best = { kind: 'lines', countryId: b.countryId, city: b.city, n, cost, gain, value }
    worse = value < prev ? worse + 1 : 0
    prev = value
    if (worse >= 2 || (n >= 3 && gain <= 0)) break
  }
  return best
}

/**
 * The sites worth closing: a city's group (all of it, or half) whose closure raises next year's
 * profit by more than the morale it costs, counting the fit-out sold off. Never the last site.
 */
export function bestClosure(g: GameState, b: BizState, w: Worth, opts: { judge?: Judge; base?: number } = {}): Move | null {
  if (totalOutlets(b) <= 1) return null
  const judge = opts.judge ?? exact
  const base = opts.base ?? profitOf(g, b)
  let best: Move | null = null
  for (const o of b.outlets) {
    const counts = [...new Set([o.count, Math.ceil(o.count / 2)])].filter((k) => k >= 1 && k < totalOutlets(b))
    for (const k of counts) {
      const gain = judge(profitOf(g, withOutlets(b, o.countryId, o.city, -k, g.year)) - base)
      const refund = Math.round(localEcon(b.industry, o.countryId, o.city).capital * k * 0.35)
      const value = gain * MARGIN_YEARS + refund - 6 * w.morale
      if (gain > 0 && value > 0 && (!best || value > best.value)) best = { kind: 'close', countryId: o.countryId, city: o.city, n: k, cost: -refund, gain, value }
    }
  }
  return best
}

/** Ideas a CEO weighs at once (the next few on the drawing board). */
const RD_IDEAS = 4

/** The R&D project (idea and budget) with the best expected value within `avail` (null: no project pays). */
export function bestRdWithin(g: GameState, b: BizState, avail: number, w: Worth, judge: Judge = exact): { idea: string; budget: number; value: number; odds: number; years: number; quality: number } | null {
  const pick = bestRdIdea(g, b, productIdeas(g, b, RD_IDEAS), avail, w, judge)
  return pick ? { idea: pick.idea, budget: pick.budget, value: pick.value, odds: pick.quote.odds, years: pick.quote.years, quality: pick.quote.quality } : null
}

/** Supplier contract costs and quality (manage.ts Quality menu uses the same numbers). */
const SUPPLIER_COST: Record<Supplier, number> = { budget: 0.86, standard: 1, premium: 1.18 }
const SUPPLIER_QUALITY: Record<Supplier, number> = { budget: -12, standard: 0, premium: 12 }
const SUPPLIERS: Supplier[] = ['budget', 'standard', 'premium']

/** What switching supplier is worth over a few years: cheaper inputs against where quality settles. */
export function supplierValue(b: BizState, w: Worth, s: Supplier): number {
  const costs = (1 - SUPPLIER_COST[s] / SUPPLIER_COST[b.supplier]) * w.cogs * LASTING_YEARS
  return costs + (SUPPLIER_QUALITY[s] - SUPPLIER_QUALITY[b.supplier]) * w.quality * 0.5
}

/** Marketing budgets a CEO compares (multiples of the industry's normal spend). */
const MARKETING_LEVELS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

// ---------------------------------------------------------------------------
// The board's view of a company's prospects (pure, cached): what investing would earn, what
// cash is spare. Drives the best-mandate hint and how the board weighs mandate proposals.

export interface Outlook {
  /** Value (over MARGIN_YEARS, after cost) of the best investments the company's cash could fund. */
  invest: number
  /** What those investments cost. */
  cost: number
  /** Cash beyond what can leave the company now and a 3-month reserve. */
  spare: number
  /** Last year's net margin (null before the first booked year). */
  margin: number | null
  /** False for companies the price-and-production planner doesn't model (studios, deep tech). */
  modeled: boolean
}

const outlookCache = new Map<string, Outlook>()

export function outlook(g: GameState, a: Asset, b: BizState): Outlook {
  const key = `${g.lifeId}|${a.id}|${g.year}|${JSON.stringify(b)}`
  const hit = outlookCache.get(key)
  if (hit) return hit
  const margin = b.last && b.last.revenue > 0 && Number.isFinite(b.last.net / b.last.revenue) ? b.last.net / b.last.revenue : null
  const reserve = Math.round((runningCosts(b) * 3) / 12)
  const spare = Math.max(0, payableCash(a, b) - reserve)
  const finance = financeTarget(b) !== null
  const modeled = !finance && b.industry !== 'gameStudio' && !isDeepTech(b)
  let invest = 0
  let cost = 0
  if (modeled) {
    const avail = Math.max(0, b.cash - reserve)
    const base = profitOf(g, b)
    const open = bestOpening(g, b, avail, { abroad: true, maxPayback: MAX_PAYBACK.growth, base })
    if (open) {
      invest += open.value
      cost += open.cost
    }
    const lines = bestLines(g, b, Math.max(0, avail - cost), { maxPayback: MAX_PAYBACK.growth, base })
    if (lines) {
      invest += lines.value
      cost += lines.cost
    }
    const rd = bestRdWithin(g, b, Math.max(0, avail - cost), bizWorth(g, b))
    if (rd) {
      invest += rd.value
      cost += rd.budget
    }
  }
  const out = { invest, cost, spare, margin, modeled }
  outlookCache.set(key, out)
  if (outlookCache.size > 32) {
    const first = outlookCache.keys().next().value
    if (first !== undefined) outlookCache.delete(first)
  }
  return out
}

/**
 * How well each mandate fits the company now (about -2..2, higher is better for the shareholders):
 * growth when there are investments that pay back, cash when there is spare cash and nothing
 * worth building, profit when margins are thin, balanced in between. All zero for studios and deep
 * tech or finance, which this planner doesn't model (directors go by stance).
 */
export function mandateScores(g: GameState, a: Asset, b: BizState): Record<Mandate, number> {
  const o = outlook(g, a, b)
  if (!o.modeled) return { growth: 0, balanced: 0, profit: 0, cash: 0 }
  const v = Math.max(1, b.valuation, b.cash)
  const iv = clampN(o.invest / v, 0, 2)
  const sv = clampN(o.spare / v, 0, 1)
  // Thin margins call for a profit mandate (unknown before the first booked year: no tilt).
  const thin = o.margin === null ? 0 : o.margin < 0.04 ? 1 : o.margin < 0.08 ? 0.5 : 0
  const scores: Record<Mandate, number> = {
    growth: clampN(iv * 6 - 0.2, -1, 2.2),
    balanced: clampN(0.4 + iv * 2, 0, 1.4),
    profit: clampN(0.2 + thin - iv * 2, -1.5, 1.6),
    cash: clampN(sv * 4 - iv * 6 - thin * 0.5, -2, 1.8),
  }
  return scores
}

/** The mandate that fits the company best on the numbers (null when the planner can't tell: studios, deep tech). */
export function bestMandate(g: GameState, a: Asset, b: BizState): Mandate | null {
  if (!outlook(g, a, b).modeled) return null
  const s = mandateScores(g, a, b)
  let best: Mandate = 'balanced'
  for (const m of ['growth', 'profit', 'cash'] as Mandate[]) if (s[m] > s[best] + 0.05) best = m
  return best
}

/** What changing the mandate is worth to the shareholders (the merit the directors weigh). */
export function mandateMerit(g: GameState, a: Asset, b: BizState, from: Mandate, to: Mandate): number {
  const s = mandateScores(g, a, b)
  return clampN(s[to] - s[from], -3, 3)
}

/** What new limits are worth: a budget that lets the CEO fund what pays back, a sane reserve. */
export function limitsMerit(g: GameState, a: Asset, b: BizState, st: BoardState, next: { capex: number; reserve: number; pay: number }): number {
  const o = outlook(g, a, b)
  const now = capexBudget(b, st)
  const then = capexBudget(b, { ...st, limits: next })
  const need = Math.max(1, o.cost)
  let m = 0
  // A budget that lets the CEO fund what pays back is worth it; past that it only invites empire
  // building, and with nothing worth building there's nothing to gain either way.
  if (o.invest > 0) m += clampN(((Math.min(then, need) - Math.min(now, need)) / need) * 2, -2, 2)
  const loose = (l: number) => Math.max(0, l - 0.6) * 0.8
  m -= loose(next.capex) - loose(st.limits.capex)
  if (next.reserve < 1) m -= 0.6 * (1 - next.reserve)
  if (next.reserve > 6) m -= 0.1 * (next.reserve - 6)
  m -= Math.max(0, next.pay - st.limits.pay) * 0.4
  return clampN(m, -3, 3)
}

// ---------------------------------------------------------------------------
// Price and production

/**
 * A smart CEO's plan: the optimizer's best price and production, off by small mistakes that
 * shrink with skill (at most ±0.06 × (100 - skill)% of price, a little more on production).
 */
export function smartPlan(g: GameState, a: Asset, b: BizState, skill: number): { price: number; production: number } {
  const cap = priceCapOf(g, a.id)
  const p = bestPlan(g, b, { maxPrice: cap ?? undefined })
  const err = (clampN(100 - skill, 0, 100) / 100) * (skill >= 95 ? .02 : skill >= 90 ? .05 : .1)
  const bounds = priceBounds(b)
  const max = cap === null ? bounds.max : Math.max(bounds.min, Math.min(bounds.max, cap))
  const price = round2(clampN(p.price * (1 + err * (rand(g) * 2 - 1)), bounds.min, max))
  const production = Math.round(clampN(p.production * (1 + err * 1.2 * (rand(g) * 2 - 1)), 0, maxProduction(g, b)))
  return { price, production }
}

// ---------------------------------------------------------------------------
// The yearly turn

interface Turn {
  g: GameState
  a: Asset
  b: BizState
  m: Manager
  st: BoardState
  judge: Judge
  lines: string[]
  /** Money moved this turn (capex, R&D, debt, payouts, closures). */
  moved: number
  big: boolean
  reserved: number
}

function spendable(t: Turn): number {
  return Math.max(0, Math.min(capexLeft(t.g, t.b, t.st), t.b.cash - reserveDollars(t.b, t.st) - t.reserved))
}

function resilienceTurn(t: Turn): void {
  if (t.m.skill < 90) return
  const move = bestResilienceMove(t.g, t.a, t.b, spendable(t))
  if (!move) return
  let paid = 0
  if (move.kind === 'training') paid = purchaseTraining(t.g, t.a, t.b)
  else if (move.kind === 'automation') paid = purchaseEquipmentUpgrade(t.g, t.a, t.b)
  else if (move.kind === 'contract') {
    const quote = inputContractQuote(t.g, t.b)
    if (!quote || quote.fee > spendable(t) || !purchaseInputContract(t.g, t.a, t.b, quote)) return
    paid = quote.fee
  } else {
    const p = readSupplyPolicy(t.b); p.target = move.target!
    p.procurement = { year: t.g.year, limit: move.procurementLimit ?? move.commitment }
    saveSupplyPolicy(t.b, p); t.reserved += move.commitment
  }
  if (move.kind !== 'target' && paid <= 0) return
  noteSpend(t.g, t.st, paid + move.commitment); t.moved += paid; t.big = true
  const choice = move.kind === 'target' ? `set the input-reserve target to ${Math.round(move.target! * 100)}%` : move.kind === 'contract' ? `spent ${money(paid)} on a three-year input contract` : move.kind === 'training' ? `spent ${money(paid)} on staff training` : `spent ${money(paid)} on equipment upgrades`
  t.lines.push(`Resilience review: ${choice}.`)
  if (move.commitment > 0) t.lines.push(`Set aside up to ${money(move.commitment)} for inputs.`)
  t.lines.push(`Two-year profit ${signedMoney(move.central)}, or ${signedMoney(move.downside)} in a downturn.`)
  // world2-interventions.test.ts pins this line; the A4 disclaimer pass takes it out with that test.
  t.lines.push('These are scenarios, not guaranteed results.')
}

/** '+$52,870' / '-$15,187': a change in money. */
function signedMoney(n: number): string {
  return n >= 0 ? `+${money(n)}` : money(n)
}

function spend(t: Turn, amount: number, capex: boolean): void {
  t.b.cash -= amount
  if (capex) noteSpend(t.g, t.st, amount)
  t.moved += Math.abs(amount)
}

function candidate(g: GameState, b: BizState, role: RoleDef): { firstName: string; lastName: string; gender: 'male' | 'female'; age: number; skill: number; salary: number; trait: string } {
  const gender = chance(g, 0.5) ? 'male' : 'female'
  const trait = weightedPick(g, STAFF_TRAITS, (x) => (x.id === 'steady' ? 3 : x.id === 'shady' || x.id === 'nepo' ? 0.6 : 1))
  const skill = clampN(bell(g, 25, 98) + (trait.id === 'overqualified' ? 10 : 0), 10, 100)
  const salary = Math.max(1_000, Math.round((localPay(b.countryId, role.pay) * (0.6 + (skill / 100) * 0.8) * trait.ask) / 500) * 500)
  return { firstName: randomFirstName(g, b.countryId, gender), lastName: randomLastName(g, b.countryId), gender, age: randInt(g, 22, 61), skill, salary, trait: trait.id }
}

function staffTurn(t: Turn): void {
  const { g, b } = t
  const w = bizWorth(g, b)
  // Deadweight first: someone who costs more than they add, when the severance is worth paying.
  let gone = 0
  for (const s of [...b.staff].sort((x, y) => staffNet(g, b, w, x) - staffNet(g, b, w, y))) {
    if (gone >= 2) break
    const net = t.judge(staffNet(g, b, w, s))
    const sev = Math.round((s.salary * severanceMonths(b.countryId)) / 12)
    if (net >= 0 || -net * LASTING_YEARS <= sev) break
    b.staff = b.staff.filter((x) => x.id !== s.id)
    b.cash -= sev
    b.yearCosts += sev
    b.morale = clampN(b.morale - 4, 0, 100)
    if (chance(g, laborProtection(b.countryId) * 0.25 + (s.trait === 'shady' ? 0.1 : 0))) {
      const cost = Math.round(s.salary * (0.5 + rand(g)))
      b.cash -= cost
      b.yearCosts += cost
    }
    gone++
    t.lines.push(`Let ${s.firstName} ${s.lastName} (${s.role}) go.`)
  }
  // Then the gaps: interview for the role worth most, hire the best candidate if they pay.
  let hired = 0
  while (hired < (t.m.skill >= 95 ? 4 : 2) && b.staff.length < maxKeyStaff(b)) {
    const best = bestRole(g, b)
    if (!best) break
    const role = best.role
    const fee = interviewFee(b, role, hired)
    if (b.cash - fee - localPay(b.countryId, role.pay) < reserveDollars(b, t.st)) break
    if (t.judge(best.value) <= fee) break
    b.cash -= fee
    b.yearCosts += fee
    const w2 = bizWorth(g, b)
    const list = Array.from({ length: t.m.skill === 100 ? 8 : t.m.skill >= 95 ? 5 : 3 }, () => candidate(g, b, role))
    const scored = list.map((c) => ({ c, v: t.judge(hireValue(g, b, w2, role.focus, c)) })).sort((x, y) => y.v - x.v)
    hired++
    if (!scored.length || scored[0].v <= 0) {
      t.lines.push(`Interviewed ${plural(list.length, 'candidate')} for ${roleTitle(g, b.countryId, role.title)}, hired none.`)
      continue
    }
    const c = scored[0].c
    const s: KeyStaff = { id: uid(g, 'ks'), firstName: c.firstName, lastName: c.lastName, gender: c.gender, age: c.age, role: roleTitle(g, b.countryId, role.title), focus: role.focus, skill: c.skill, salary: c.salary, trait: c.trait, morale: randInt(g, 65, 85), years: 0 }
    b.staff.push(s)
    t.lines.push(`Hired ${s.firstName} ${s.lastName}, ${s.role}. ${money(s.salary)} a year.`)
  }
}

function policyTurn(t: Turn): void {
  const { g, b } = t
  const style = styleOf(t.m)
  const w = bizWorth(g, b)
  // Supplier contract.
  const bias = (s: Supplier) => (style === 'costCutter' && s === 'budget' ? 0.03 * w.cogs : style === 'visionary' && s === 'premium' ? 2 * w.quality : 0)
  let sup = b.supplier
  let top = 0
  for (const s of SUPPLIERS) {
    if (s === b.supplier) continue
    const v = t.judge(supplierValue(b, w, s)) + bias(s)
    if (v > top + Math.max(1_000, w.contrib * 0.03)) {
      top = v
      sup = s
    }
  }
  if (sup !== b.supplier) {
    t.lines.push(`Switched to ${sup} suppliers.`)
    b.supplier = sup
    t.big = true
  }
  // Pay policy (morale against the wage bill): one notch at a time toward the best level, and
  // only when it clearly pays (the Pay Policy hint's own model).
  const prev = b.wageLevel
  const mood = (level: number) => (level < prev ? -Math.round((prev - level) * 60) : level > prev ? Math.round((level - prev) * 40) : 0)
  let pay = prev
  let payTop = 0
  for (const level of [prev - 0.1, prev - 0.05, prev + 0.05, prev + 0.1]) {
    if (level < 0.7 - 1e-9 || level > 1.5 + 1e-9) continue
    const v = t.judge(fxValue(g, b, w, { wage: level - prev, morale: mood(level) })) + (style === 'costCutter' ? (prev - level) * w.wages * 0.5 : 0)
    if (v > payTop + Math.max(500, w.contrib * 0.01)) {
      payTop = v
      pay = Math.round(level * 100) / 100
    }
  }
  if (pay !== prev) {
    b.wageLevel = pay
    b.morale = clampN(b.morale + mood(pay), 0, 100)
    if (pay > prev) b.raiseYear = g.year
    else if (b.raiseYear >= g.year) b.raiseYear = g.year - 1
    t.lines.push(`${pay > prev ? 'Raised' : 'Cut'} pay to ${Math.round(pay * 100)}% of the going rate.`)
  }
  // Marketing budget: the yearly profit at each level (it recurs, so it counts for a few years)
  // plus the brand it builds; a notch or two at a time, not a lurch.
  const cur = b.marketingLevel
  const tilt = style === 'grower' || style === 'visionary' ? 1 : style === 'costCutter' ? -1 : 0
  const base = profitOf(g, b)
  let level = cur
  let best = 0
  for (const x of MARKETING_LEVELS) {
    if (Math.abs(x - cur) < 0.01 || (t.m.skill < 95 && Math.abs(x - cur) > 0.5 + 1e-9)) continue
    const v = t.judge((profitOf(g, { ...b, marketingLevel: x }) - base) * LASTING_YEARS) + (x - cur) * 8 * w.brand * 0.5 + tilt * (x - cur) * w.brand
    if (v > best + Math.max(500, w.contrib * 0.01)) {
      best = v
      level = x
    }
  }
  if (Math.abs(level - cur) > 0.01) {
    b.marketingLevel = level
    t.lines.push(`${level > cur ? 'Raised' : 'Cut'} marketing to ${Math.round(level * 100)}% of a normal spend.`)
  }
}

function productTurn(t: Turn): void {
  const { g, b } = t
  const w = bizWorth(g, b)
  // Retire outdated lines whose complexity costs more than the customers they still win.
  let retired = 0
  const heavy = heavyOf(g, b)
  for (let i = 0; i < 10 && b.products.length > 0; i++) {
    const weakest = retireOrder(b, g.year, heavy)[0]
    if (!weakest) break
    const ctx = marketCtxFor(g, b, g.year)
    const field = fieldFor(ctx)
    const rest = b.products.filter((p) => p !== weakest)
    const keep = pullValue(ctx, b, w, productPull(b.industry, rest, g.year, field).total, productPull(b.industry, b.products, g.year, field).total)
    const saves = (complexityShare(b.products.length) - complexityShare(rest.length)) * Math.max(0, w.revenue)
    if (t.judge(saves) <= keep) break
    retireLines(b, 1, g.year, heavy)
    retired++
  }
  if (retired > 0) t.lines.push(`Retired ${plural(retired, 'outdated product line')}.`)
  // R&D: fund the projects that pay, within the budget and the reserve.
  const style = styleOf(t.m)
  const max = RD_PER_YEAR[t.st.mandate] + (style === 'visionary' ? 2 : style === 'costCutter' ? -1 : 0)
  const started: string[] = []
  let total = 0
  for (let i = 0; i < Math.max(0, max); i++) {
    const pick = bestRdWithin(g, b, spendable(t), bizWorth(g, b), t.judge)
    if (!pick) break
    spend(t, pick.budget, true)
    b.yearCosts += pick.budget
    const info = lineInfo(pick.idea, b.industry)
    rdOf(b).push({ id: uid(g, 'rd'), name: pick.idea, budget: pick.budget, years: pick.years, progress: 0, odds: Math.round(pick.odds * 1000) / 1000, boost: 0, quality: pick.quality, family: info.family, kind: info.kind, started: g.year })
    started.push(pick.idea)
    total += pick.budget
  }
  if (started.length) {
    // One product by name when the name is short enough; a product name can run to 60 characters.
    const named = `Put ${money(total)} into R&D on ${started[0]}.`
    t.lines.push(started.length === 1 && letterWords(named) <= LETTER_WORDS ? named : `Put ${money(total)} into R&D on ${plural(started.length, 'new product')}.`)
    t.big = true
  }
  // R&D 3.0: Operations R&D programs and patents that pay, paid through the same board budget and reserve
  // as the projects above (the block keeps no budget of its own). Never a hire, never a licence later.
  const labMoves = LAB_PER_YEAR[t.st.mandate]
  for (let i = 0; i < labMoves + (style === 'costCutter' ? 1 : 0); i++) {
    const move = bestLabMove(g, b, spendable(t), bizWorth(g, b), t.judge, i >= labMoves)
    if (!move) break
    spend(t, move.price, true)
    b.yearCosts += move.price
    if (move.kind === 'ops') {
      startOps(g, t.a, b, move.id, false)
      t.lines.push(LAB_SAY.letterStarted(opsProgram(move.id)?.label ?? 'a program'))
    } else {
      fileLabPatent(g, t.a, b, move.family, move.mode, false)
      const named = LAB_SAY.letterFiled(move.family)
      t.lines.push(letterWords(named) <= LETTER_WORDS ? named : LAB_SAY.letterFiledShort())
    }
    t.big = true
  }
}

function siteTurn(t: Turn): void {
  const { g, b } = t
  const def = industryDef(b.industry)
  const style = styleOf(t.m)
  const w = bizWorth(g, b)
  let base = profitOf(g, b)
  // Close what loses money first (it frees cash for what earns it).
  const close = bestClosure(g, b, w, { judge: t.judge, base })
  if (close && (style !== 'grower' || close.value > 12 * w.morale)) {
    const o = b.outlets.find((x) => x.countryId === close.countryId && x.city === close.city)
    if (o) {
      o.count -= close.n
      b.outlets = b.outlets.filter((x) => x.count > 0)
      b.cash += -close.cost
      b.morale = clampN(b.morale - 6, 0, 100)
      t.moved += -close.cost
      t.big = true
      t.lines.push(`Closed ${plural(close.n, def.site, def.sitePlural)} in ${close.city}.`)
      base = profitOf(g, b)
    }
  }
  const maxPayback = MAX_PAYBACK[t.st.mandate] * (style === 'grower' ? 1.2 : style === 'costCutter' ? 0.8 : 1)
  const abroad = style === 'grower' || style === 'visionary' || t.st.mandate === 'growth'
  const pace = GROWTH_PACE[t.st.mandate] * (style === 'grower' ? 1.3 : style === 'costCutter' ? 0.7 : 1)
  const pacing = Math.max(t.st.mandate === 'cash' ? 0 : 1, Math.ceil(totalOutlets(b) * pace))
  let room = pacing
  for (let round = 0; round < 2 && room >= 1; round++) {
    const open = bestOpening(g, b, spendable(t), { abroad, maxPayback, judge: t.judge, base, tilt: style === 'grower' ? 1.05 : 1, maxN: room })
    if (!open) break
    room -= open.n
    spend(t, open.cost, true)
    const existing = b.outlets.find((o) => o.countryId === open.countryId && o.city === open.city)
    if (existing) existing.count += open.n
    else b.outlets.push({ countryId: open.countryId, city: open.city, count: open.n, opened: g.year })
    t.big = true
    t.lines.push(`Opened ${plural(open.n, def.site, def.sitePlural)} in ${open.city}${open.countryId !== b.countryId ? `, ${getCountry(open.countryId).name},` : ''} for ${money(open.cost)}.`)
    base = profitOf(g, b)
  }
  const lines = bestLines(g, b, spendable(t), { maxPayback, judge: t.judge, base, maxN: Math.max(t.st.mandate === 'cash' ? 0 : 1, Math.ceil((linesOf(b) + totalOutlets(b)) * pace)) })
  const line = lineOf(b.industry)
  if (lines && line) {
    spend(t, lines.cost, true)
    b.lines = linesOf(b) + lines.n
    t.big = true
    t.lines.push(`Built ${plural(lines.n, line.one, line.many)} for ${money(lines.cost)}.`)
  }
  // Tell the owner when the board's budget (not the mandate's pace) is what held the company back:
  // what they would still open this year at the mandate's pace if the budget allowed.
  const each = startupCost(b.industry, b.countryId, b.city).capital
  if (room >= 1 && capexLeft(g, b, t.st) < each && b.cash - reserveDollars(b, t.st) >= each * 2) {
    const one = bestOpening(g, b, b.cash - reserveDollars(b, t.st), { abroad: false, maxPayback, base, maxN: room })
    if (one) t.lines.push(`Spent the ${money(capexBudget(b, t.st))} budget. ${plural(one.n, `more ${def.site}`, `more ${def.sitePlural}`)} would pay back.`)
  }
}

function debtTurn(t: Turn): void {
  const { b } = t
  if (b.debt <= 0) return
  const style = styleOf(t.m)
  const hurdle = t.st.mandate === 'growth' ? 0.09 : style === 'steady' ? 0.04 : style === 'costCutter' ? 0.05 : 0.065
  if (b.debtRate < hurdle) return
  const pay = Math.round(Math.min(b.debt, b.cash - reserveDollars(b, t.st) - t.reserved))
  if (pay < Math.max(1_000, b.debt * 0.05)) return
  b.debt -= pay
  if (b.debt < 1) b.debt = 0
  b.cash -= pay
  t.moved += pay
  t.big = true
  t.lines.push(`Repaid ${b.debt > 0 ? '' : 'the last '}${money(pay)} of debt at ${Math.round(b.debtRate * 1000) / 10}%.${b.debt > 0 ? ` ${money(b.debt)} left.` : ''}`)
}

/** Pay spare cash to the shareholders under a cash (or profit) mandate; the owner's share is income. */
function payoutTurn(t: Turn): void {
  const { g, a, b } = t
  // Group earnings stay in the corporate treasury. Only an explicit group dividend pays the owner.
  if (inGroup(g, b)) return
  // The owner's yearly dividend rule pays instead (business/dividend-year.ts), so the CEO adds nothing.
  if (readDividend(b.dividend)) return
  const mandate = t.st.mandate
  if (mandate !== 'cash' && mandate !== 'profit') return
  const free = Math.max(0, payoutCash(a, b) - reserveDollars(b, t.st) - t.reserved)
  const payout = Math.round(mandate === 'cash' ? free : Math.min(free, 0.5 * Math.max(0, b.last?.net ?? 0)))
  if (payout < Math.max(1_000, b.valuation * 0.005)) return
  b.cash -= payout
  const mine = Math.round(payout * b.share)
  if (g.character.alive && mine > 0) earnIncome(g, mine)
  if (b.public && b.sharesOut > 0) {
    b.sharePrice = round2(Math.max(0.05, b.sharePrice - (payout / b.sharesOut) * classFactor(b)))
    b.valuation = Math.round(b.sharePrice * b.sharesOut)
  }
  t.moved += payout
  t.big = true
  t.lines.push(`Paid a ${money(payout)} dividend.${b.share < 1 ? ` Your ${Math.round(b.share * 100)}% is ${money(mine)}.` : ''}`)
}

/**
 * One year at the helm for a smart hired CEO of a price-and-production company. Mutates the
 * company (g's RNG drives their small mistakes) and writes the owner the yearly letter.
 */
export function smartManagerTurn(g: GameState, a: Asset, b: BizState): void {
  const m = b.manager
  if (!m || b.ceo !== 'manager') return
  const st = boardOf(b)
  const err = clampN((100 - m.skill) / (m.skill >= 85 ? 500 : 100), 0, 0.5)
  const t: Turn = { g, a, b, m, st, judge: (v) => v * (1 + (rand(g) * 2 - 1) * err), lines: [], moved: 0, big: false, reserved: 0 }
  const startCash = Math.max(0, b.cash)
  const baseline = bookYear(g, b, g.year, planFor(g, b, g.year, { noise: 1 }), b.production, 0).stmt.net
  staffTurn(t)
  policyTurn(t)
  resilienceTurn(t)
  productTurn(t)
  // The Operations Desk of food, care and utility trades (business/sector-ceo.ts).
  sectorTurn(t, MAX_PAYBACK[t.st.mandate])
  siteTurn(t)
  debtTurn(t)
  const plan = smartPlan(g, a, b, m.skill)
  b.price = plan.price
  b.production = plan.production
  payoutTurn(t)
  const planned = bookYear(g, b, g.year, planFor(g, b, g.year, { noise: 1 }), b.production, 0).stmt.net
  t.lines.unshift(
    m.skill === 100 ? 'Skill 100/100. Forecasts can still miss.' : `Skill ${m.skill}/100, ${m.skill >= 95 ? 'world-class' : m.skill >= 90 ? 'elite' : 'competent'}.`,
    `Forecast ${money(planned)} profit, ${money(baseline)} on the old plan.`,
  )
  if (!b.public) b.valuation = valuationOf(b)
  refreshValue(a, b)
  const def = industryDef(b.industry)
  t.lines.push(`Next year, ${units(plan.production)} ${plan.production === 1 ? def.unitOne : def.unit} at ${unitMoney(plan.price)} each.`)
  const big = t.big && t.moved >= Math.max(5_000, startCash * 0.1, b.valuation * 0.02)
  ceoLetter(g, a, b, t.lines, big)
}

/** True when this company's CEO is a hired one who runs it like a real executive. */
export function smartCeo(b: BizState): boolean {
  return b.ceo === 'manager' && !!b.manager && b.manager.skill > SMART_SKILL
}
