// Product R&D without a cap: fund as many projects at once as the company can pay for. Each
// project's whole budget is paid when it starts; a bigger budget finishes sooner, works more
// often and makes a stronger product, with diminishing returns, and every project already
// running stretches the team (the same money buys less). Projects move a year closer at every
// year-end (economy.evolve → advanceRd) and then launch as a product line or flop.
import { formatMoney, log, notice } from '../core'
import { chance, rand, uid } from '../rng'
import type { Asset, GameState } from '../types'
import { bizWorth, ceoSkill, fxValue, localEcon, staffPower, type Worth } from './economy'
import { industryDef } from './industries'
import { complexityShare, productLift, rangeBoost } from './products'
import { readProjects, runsIt, MAX_STORED_PRODUCTS, MAX_STORED_PROJECTS, type BizState, type Product, type RdProject } from './state'
import { clampN, money, plural } from './util'

/** Chance a project at a normal budget works: whoever runs it, quality, the quality team. */
export function launchP(g: GameState, b: BizState): number {
  return clampN(0.25 + ceoSkill(g, b) / 250 + b.quality / 300 + 0.1 * staffPower(b, 'quality'), 0.1, 0.9)
}

/** A hit (15% of the products that work) is 1.8x the boost and 8 brand instead of 3. */
export const HIT_P = 0.15

/** Projects in development (read-only; old saves have none). */
export function rdProjects(b: Pick<BizState, 'rd'>): RdProject[] {
  return Array.isArray(b.rd) ? b.rd : []
}

/** Mutable project list on a live business (created on first use). */
export function rdOf(b: BizState): RdProject[] {
  if (!Array.isArray(b.rd)) b.rd = readProjects(b.rd)
  return b.rd
}

/** A normal R&D budget for one product here: a slice of a site's capital, or of last year's sales. */
export function rdBase(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  return Math.max(1_000, roundBudget(Math.max(e.capital * 0.12, Math.max(0, b.last?.revenue ?? 0) * 0.05)))
}

/** Two significant digits (a budget people would write down: $8,000, not $7,964). */
export function roundBudget(n: number): number {
  if (!(n > 0) || !Number.isFinite(n)) return 0
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1))
  return Math.round(n / mag) * mag
}

/** Every project already running stretches the team: a budget buys this much less. */
export function rdCrowding(b: Pick<BizState, 'rd'>): number {
  return 1 + 0.15 * rdProjects(b).length
}

/** The smallest budget worth calling a project. */
export function rdMinBudget(b: BizState): number {
  return Math.max(500, roundBudget(rdBase(b) * 0.25))
}

/** Years a normal budget needs, by kind of business (a recipe is quicker than a gadget). */
function baseYears(industry: string): number {
  const def = industryDef(industry)
  if (def.food) return 1
  if (def.tradable >= 0.8) return 2
  if (def.perishable < 0.5) return 1.5
  return 1
}

export interface RdQuote {
  /** Budget relative to a normal one (after crowding). */
  k: number
  odds: number
  /** Booked years until it launches (1-4). */
  years: number
  /** Average demand boost of the line if it works. */
  boost: number
}

/** What a budget buys: odds, time and product strength (pure, diminishing returns everywhere). */
export function rdQuote(g: GameState, b: BizState, budget: number): RdQuote {
  const base = rdBase(b) * rdCrowding(b)
  const k = Math.max(0.01, (Number.isFinite(budget) ? Math.max(0, budget) : 0) / base)
  const p0 = launchP(g, b)
  const odds = clampN(1 - (1 - p0) * Math.pow(k, -0.4), 0.05, 0.95)
  const years = Math.round(clampN(Math.ceil(baseYears(b.industry) / Math.sqrt(k) - 1e-9), 1, 4))
  const boost = clampN(0.1 * (0.6 + industryDef(b.industry).growth) * clampN(Math.pow(k, 0.15), 0.6, 1.6), 0.005, 0.25)
  return { k, odds, years, boost }
}

/** Years of full boost a new line is worth over its life (it fades 10% a year). */
const LINE_YEARS = 3.3
/** Years the extra complexity of one more line is counted for (faded lines get retired). */
const COMPLEXITY_YEARS = 5

/**
 * Expected value of funding a project now with this budget: the demand the line adds (at the
 * margin of the current range, net of the complexity it brings), its brand, and the odds of a
 * flop, against the budget. The same numbers advanceRd rolls; never touches g.rng.
 */
export function rdValue(g: GameState, b: BizState, budget: number, w: Worth = bizWorth(g, b)): RdQuote & { value: number } {
  const q = rdQuote(g, b, budget)
  const year = g.year + q.years
  const mean = q.boost * (1 + HIT_P * 0.8)
  const now = rangeBoost(b.industry, b.products, year)
  const after = rangeBoost(b.industry, [...b.products, { name: '·', launched: year, boost: mean }], year)
  const extra = (complexityShare(b.products.length + 1) - complexityShare(b.products.length)) * Math.max(0, w.revenue)
  const delay = Math.pow(0.92, q.years - 1)
  const win = ((after - now) * w.contrib * LINE_YEARS - extra * COMPLEXITY_YEARS) * delay + fxValue(g, b, w, { brand: 3 * (1 - HIT_P) + 8 * HIT_P })
  const value = q.odds * win + (1 - q.odds) * fxValue(g, b, w, { brand: -2 }) - budget
  return { ...q, value: Number.isFinite(value) ? value : -budget }
}

/** Budgets the Business talent compares, as multiples of a normal one. */
const BUDGET_GRID = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16]

/** The budget with the best expected value that the company can pay now (null: none pays). */
export function bestRdBudget(g: GameState, b: BizState): (RdQuote & { budget: number; value: number }) | null {
  const w = bizWorth(g, b)
  const base = rdBase(b) * rdCrowding(b)
  // The grid, plus the budgets where a project gets a year shorter (time comes in whole years).
  const y0 = baseYears(b.industry)
  const steps = [1, 2, 3].map((y) => Math.pow(y0 / y, 2)).filter((m) => m > 0.05)
  let best: (RdQuote & { budget: number; value: number }) | null = null
  for (const m of [...BUDGET_GRID, ...steps]) {
    // Rounded up, so a nice number never slips under one of those thresholds.
    const budget = niceBudget(base * m)
    if (budget > Math.max(0, b.cash) || budget < rdMinBudget(b)) continue
    const v = rdValue(g, b, budget, w)
    if (v.value > 0 && (!best || v.value > best.value)) best = { ...v, budget }
  }
  return best
}

function niceBudget(n: number): number {
  if (!(n > 0)) return 0
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1))
  return Math.ceil(n / mag - 1e-9) * mag
}

/** Why a project can't start (null when it can). */
export function rdBlock(b: BizState, idea: string, budget: number): string | null {
  if (!idea.trim()) return 'Pick an idea first.'
  if (b.products.some((p) => p.name === idea)) return `${idea} is already on sale.`
  if (rdProjects(b).some((p) => p.name === idea)) return `${idea} is already in development.`
  if (rdProjects(b).length >= MAX_STORED_PROJECTS) return 'Your R&D department is drowning in projects. Let some finish first.'
  if (!(budget >= rdMinBudget(b))) return `A real project needs at least ${money(rdMinBudget(b))}.`
  return null
}

/** Start a project: the whole budget comes out of company cash now (a cost of this year). */
export function startRd(g: GameState, a: Asset, b: BizState, idea: string, budget: number): RdProject | null {
  const n = Math.round(Number.isFinite(budget) ? budget : 0)
  const why = rdBlock(b, idea, n)
  if (why) {
    notice(g, 'R&D', why, { emoji: '\u{1F9EA}' })
    return null
  }
  if (b.cash < n) {
    notice(g, 'Not Enough Company Cash', `${a.name} doesn't have ${formatMoney(n)} for that R&D budget. Inject some of your own money, borrow, or fund a smaller project.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return null
  }
  const q = rdQuote(g, b, n)
  b.cash -= n
  b.yearCosts += n
  const p: RdProject = { id: uid(g, 'rd'), name: idea, budget: n, years: q.years, progress: 0, odds: Math.round(q.odds * 1000) / 1000, boost: Math.round(q.boost * 1000) / 1000, started: g.year }
  rdOf(b).push(p)
  log(g, `${a.name} started developing ${idea}.`)
  notice(
    g,
    'R&D Underway',
    `${a.name}'s team is developing ${idea} on a ${formatMoney(n)} budget. It should be ready in ${q.years === 1 ? 'about a year' : `about ${q.years} years`}, with about ${Math.round(q.odds * 100)}% odds it works. ${plural(rdProjects(b).length, 'project')} in development now.`,
    { emoji: '\u{1F9EA}' },
  )
  return p
}

/** Lines most worth retiring first: the most faded, then the oldest. */
export function retireOrder(products: Product[], year: number): Product[] {
  return [...products].sort((x, y) => productLift(x, year) - productLift(y, year) || x.launched - y.launched)
}

/** Retire the `n` most faded lines; returns their names. */
export function retireLines(b: BizState, n: number, year: number): string[] {
  const k = Math.max(0, Math.min(b.products.length, Math.floor(n)))
  if (k <= 0) return []
  const gone = retireOrder(b.products, year).slice(0, k)
  const names = new Set(gone.map((p) => p.name))
  b.products = b.products.filter((p) => !names.has(p.name))
  return gone.map((p) => p.name)
}

/**
 * Year-end: every project gets a year of work; finished ones launch (next year's product line)
 * or flop. Called from economy.evolve for every company, after the fiscal year is booked.
 */
export function advanceRd(g: GameState, b: BizState, year: number): void {
  if (!Array.isArray(b.rd) || b.rd.length === 0) return
  const a = g.assets.find((x) => (x.details as unknown) === b) ?? null
  const name = a?.name ?? 'The company'
  const keep: RdProject[] = []
  const lines: string[] = []
  let wins = 0
  for (const p of b.rd) {
    p.progress = Math.min(p.years, p.progress + 1)
    if (p.progress < p.years) {
      keep.push(p)
      continue
    }
    if (!chance(g, clampN(p.odds, 0.02, 0.98))) {
      b.brand = clampN(b.brand - 2, 0, 100)
      lines.push(`\u{1F4A5} ${p.name} flopped in testing (${money(p.budget)} of R&D).`)
      log(g, `${name}'s ${p.name} flopped.`, 'bad')
      continue
    }
    const hit = chance(g, HIT_P)
    const boost = Math.round(clampN(p.boost * (0.5 + rand(g)) * (hit ? 1.8 : 1), 0.005, 0.5) * 1000) / 1000
    b.products.push({ name: p.name, launched: year + 1, boost })
    b.brand = clampN(b.brand + (hit ? 8 : 3), 0, 100)
    wins += 1
    lines.push(`${hit ? '\u{1F525}' : '\u{1F680}'} ${p.name} ${hit ? 'is a smash hit' : 'launches'}: about ${Math.round(boost * 100)}% more demand while it's fresh.`)
    log(g, `${name} launched ${p.name}${hit ? ' and it was a smash hit' : ''}.`, 'good')
  }
  b.rd = keep
  // A storage guard only: the economics retire lines long before this.
  if (b.products.length > MAX_STORED_PRODUCTS) retireLines(b, b.products.length - MAX_STORED_PRODUCTS, year + 1)
  if (!lines.length || !a || !runsIt(g, a) || !g.character.alive) return
  notice(g, `${name}: R&D Results`, `${lines.slice(0, 6).join('\n')}${lines.length > 6 ? `\n…and ${lines.length - 6} more.` : ''}${keep.length ? `\n${plural(keep.length, 'project')} still in development.` : ''}`, {
    emoji: wins > 0 ? '\u{1F680}' : '\u{1F4A5}',
    tone: wins > 0 ? 'good' : 'bad',
  })
}
