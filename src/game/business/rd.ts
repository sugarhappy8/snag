// Product R&D. Every idea has a development cost of its own, fixed by the product: its trade's cost
// of a site in the home city, the sort of line (a next generation or a premium edition costs more
// than a regional edition or a bundle) and the size of its market. Never a share of the company's
// cash or sales: the same idea costs a corner shop and a giant the same. Fund it at half to four
// times that cost: a bigger budget is likelier to work, quicker and makes a better line (its
// quality against the rivals' versions, product-market.ts), with diminishing returns. A team runs
// a few projects at once without strain (one more slot per doubling of the company's sites);
// beyond that every project stretches it. Projects move a year closer at every year-end
// (economy.evolve → advanceRd) and then launch as a product line or flop.
import { firmCash } from '../cash'
import { formatMoney, log, notice } from '../core'
import { hasTalent } from '../talents'
import { chance, rand, uid } from '../rng'
import type { Asset, GameState } from '../types'
import { marketDemand, marketKey, marketStateOf, type MarketCtx } from './competition-core'
import { bizWorth, ceoSkill, fxValue, localEcon, marketCtxFor, ownerTalent, staffPower, type Worth } from './economy'
import { industryDef } from './industries'
import { demandSize } from './product-data'
import { advanceHeavy, heavyArrivals, heavyOf, type HeavyRecord } from './heavy-rd'
import { breakthroughByName } from './heavy-data'
import { mandateOf } from './board-state'
import { isDeepTech } from './deeptech-state'
import { readLab, teamSlots } from './lab-state'
import { advanceLab } from './lab-year'
import { effectiveQuality, fieldFor, fieldOf, infoOf, KIND_COST, KIND_WEIGHT, kindLevel, kindTrend, lineInfo, lineQuality, productPull, qualityFromBoost, type Field, type LineInfo } from './product-market'
import { complexityShare } from './products'
import { readProjects, readRetired, retiredOf, runsIt, MAX_STORED_PRODUCTS, MAX_STORED_PROJECTS, type BizState, type Product, type RdProject } from './state'
import { launchSkill, launchTeam, ownerRuns, type ResearchSnap } from './research-effort'
import { clampN, money, plural, rec } from './util'

/**
 * Chance a project at a normal budget works: whoever runs it, quality, the quality team, the research team (lab-state.ts teamPower).
 * Two parts (research-effort.ts): the skill part and the research team's part, so the Effort engine can name them.
 */
export function launchP(g: GameState, b: BizState): number {
  const s = researchState(g, b)
  return clampN(launchSkill(s) + launchTeam(s.scientists), 0.1, 0.9)
}

/**
 * What a company's research comes to in numbers: the CEO's skill and the quality staff (the cycle members, read here and handed to
 * the leaf research-effort.ts), the quality, the research team, the hired manager and the board's mandate. A read: it writes nothing
 * and draws nothing (the mandate is read raw, as boardOf would store it, without storing it).
 */
export function researchState(g: GameState, b: BizState): ResearchSnap {
  return {
    year: g.year,
    skill: ceoSkill(g, b),
    quality: b.quality,
    qualityStaff: staffPower(b, 'quality'),
    scientists: readLab(b).team.length,
    managed: !ownerRuns(g, b),
    managerSkill: b.manager ? b.manager.skill : 0,
    morale: b.morale,
    mandate: mandateOf(rec(b.board)?.mandate, isDeepTech(b)),
  }
}

/** A hit (15% of the products that work) launches 10 quality points better and adds 8 brand instead of 3. */
export const HIT_P = 0.15
export const HIT_QUALITY = 10
/** A launch lands within this many quality points of the quote (either way). */
export const QUALITY_SPREAD = 8

/** Projects in development (read-only; old saves have none). */
export function rdProjects(b: Pick<BizState, 'rd'>): RdProject[] {
  return Array.isArray(b.rd) ? b.rd : []
}

/** Mutable project list on a live business (created on first use). */
export function rdOf(b: BizState): RdProject[] {
  if (!Array.isArray(b.rd)) b.rd = readProjects(b.rd)
  return b.rd
}

/** Two significant digits (a budget people would write down: $8,000, not $7,964). */
export function roundBudget(n: number): number {
  if (!(n > 0) || !Number.isFinite(n)) return 0
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1))
  return Math.round(n / mag) * mag
}

/** A classic line costs this much to develop in a trade whose typical site sells RD_REF a year... */
export const RD_BASE = 30_000
const RD_REF = 500_000
/** ...and less than proportionally more in bigger trades (a power company's product team isn't 20 cafés'). */
const RD_EXP = 0.75
/** The slider runs from this share of an idea's cost... */
export const RD_MIN = 0.5
/** ...to this many times it. */
export const RD_MAX = 4

/** Yearly sales of one typical site of the trade here at the going price (not the company's own). */
function siteSales(b: Pick<BizState, 'industry' | 'countryId' | 'city'>): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const v = (e.baseDemand * e.goingPrice) / (1 + e.taxRate)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * How big a typical site of the trade is here against the reference, less than proportionally (RD_EXP):
 * the size term of every R&D price (rdCost, and the Operations R&D programs of lab-rules.ts). Fixed by
 * the trade and the place, never by the company's own cash or sales.
 */
export function rdSiteScale(b: Pick<BizState, 'industry' | 'countryId' | 'city'>): number {
  return Math.pow(Math.max(0.01, siteSales(b) / RD_REF), RD_EXP)
}

/**
 * What developing an idea costs at a normal budget: fixed by the product (how big a typical
 * business of the trade is here, the sort of line, the size of its market), never by the
 * company's own cash or sales.
 */
export function rdCost(b: Pick<BizState, 'industry' | 'countryId' | 'city'>, idea: string): number {
  const info = lineInfo(idea, b.industry)
  const gen = info.kind === 'next' ? 1 + 0.05 * Math.max(0, info.gen - 2) : 1
  const scale = rdSiteScale(b)
  return Math.max(1_000, roundBudget(RD_BASE * scale * KIND_COST[info.kind] * Math.sqrt(demandSize(info.family)) * gen))
}

/** The budgets an idea can be funded at (the same for every company in the same place). */
export function rdRange(b: Pick<BizState, 'industry' | 'countryId' | 'city'>, idea: string): { min: number; max: number; normal: number } {
  const normal = rdCost(b, idea)
  return { min: Math.max(500, roundBudget(normal * RD_MIN)), max: roundBudget(normal * RD_MAX), normal }
}

/** Projects the team runs at once without strain: one more per doubling of the company's sites, and a little room for a research team (lab-state.ts teamSlots). */
export function rdSlots(b: Pick<BizState, 'outlets' | 'lab'>): number {
  const sites = b.outlets.reduce((s, o) => s + o.count, 0)
  return 1 + Math.floor(Math.log2(1 + Math.max(0, sites))) + teamSlots(readLab(b).team.length)
}

/** Projects that use the team's slots: a running breakthrough (heavy-rd.ts) has a team of its own and doesn't count. */
export function ordinaryProjects(b: Pick<BizState, 'rd'>): RdProject[] {
  return rdProjects(b).filter((p) => p.heavy !== true)
}

/** How much a new project's budget is stretched by the ones already running (1 while slots are free). */
export function rdCrowding(b: Pick<BizState, 'rd' | 'outlets' | 'lab'>): number {
  return 1 + 0.15 * Math.max(0, ordinaryProjects(b).length + 1 - rdSlots(b))
}

/** Years a normal budget needs, by kind of business (a recipe is quicker than a gadget). */
export function baseYears(industry: string): number {
  const def = industryDef(industry)
  if (def.food) return 1
  if (def.tradable >= 0.8) return 2
  if (def.perishable < 0.5) return 1.5
  return 1
}

/** Most quality points money can add over a normal budget (approached, never reached)... */
const QUALITY_UP = 28
/** ...and what each halving below it costs. */
const QUALITY_DOWN = 14

/** Quality points a budget of `k` times the normal one adds (or costs): fast gains, then diminishing. */
export function budgetQuality(k: number): number {
  const x = Math.max(0.05, k)
  return x >= 1 ? QUALITY_UP * (1 - Math.pow(x, -0.8)) : QUALITY_DOWN * Math.log2(x)
}

/** Expected quality of a line developed at `k` times its normal budget (before the launch's luck). */
export function rdQuality(g: GameState, b: BizState, k: number): number {
  const talent = (ownerTalent(g, b, 'Business') ? 3 : 0) + (b.ceo !== 'manager' && g.character.alive && !g.character.prison && hasTalent(g, 'Inventor') ? 5 : 0)
  const q = 0.5 * b.quality + 30 + budgetQuality(k) + 0.1 * (ceoSkill(g, b) - 50) + 6 * staffPower(b, 'quality') + talent
  return Math.round(clampN(q, 5, 97))
}

export interface RdQuote {
  /** The idea's normal development cost. */
  cost: number
  /** Budget relative to a normal one (after crowding). */
  k: number
  odds: number
  /** Booked years until it launches (1-4). */
  years: number
  /** Expected quality of the line if it works. */
  quality: number
  /** Its kind of product and sort of line. */
  info: LineInfo
  /** The rivals' versions now: quality and the share of the field offering it. */
  field: number
  offer: number
  /** Demand for its kind now vs its peak, and where it's heading. */
  level: number
  trend: -1 | 0 | 1
  /** Extra pull the line adds to the company in its first year on sale (at the expected quality). */
  lift: number
}

/** What a budget buys for an idea: odds, time, quality against the rivals (pure, diminishing returns). */
export function rdQuote(g: GameState, b: BizState, idea: string, budget: number, ctx?: MarketCtx): RdQuote {
  const cost = rdCost(b, idea)
  const k = Math.max(0.01, (Number.isFinite(budget) ? Math.max(0, budget) : 0) / (cost * rdCrowding(b)))
  const p0 = launchP(g, b)
  const odds = clampN(1 - (1 - p0) * Math.pow(k, -0.4), 0.05, 0.95)
  const years = Math.round(clampN(Math.ceil(baseYears(b.industry) / Math.sqrt(k) - 1e-9), 1, 4))
  const quality = rdQuality(g, b, k)
  const info = lineInfo(idea, b.industry)
  const c = ctx ?? marketCtxFor(g, b, g.year)
  const field = fieldFor(c)
  const f = field.of(info.family)
  const launchYear = g.year + years
  const later = fieldOf(c.rivals, c.fringe, c.key, launchYear, field.heavy, field.market)
  const line: Product = { name: idea, launched: launchYear, boost: 0, quality, family: info.family, kind: info.kind }
  const lift = productPull(b.industry, [...b.products, line], launchYear, later).total - productPull(b.industry, b.products, launchYear, later).total
  return { cost, k, odds, years, quality, info, field: f.quality, offer: f.offer, level: f.level, trend: kindTrend(info.family, c.key, g.year, field.heavy), lift: Math.max(0, lift) }
}

/** Years of sales a new line is valued over, and the yearly discount. */
export const HORIZON = 8
export const DISCOUNT = 0.9
/** Years the extra complexity of one more line is counted for (old lines get retired). */
const COMPLEXITY_YEARS = 5

/**
 * Dollars a year that moving the company's pull from (1 + from) to (1 + to) is worth: the
 * customers it wins in its market (a dominant company has little left to win) times its margin.
 */
export function pullValue(ctx: MarketCtx, b: BizState, w: Worth, from: number, to: number): number {
  const mult = (1 + Math.max(0, to)) / (1 + Math.max(0, from))
  if (!(mult > 0) || Math.abs(mult - 1) < 1e-9) return 0
  const st = marketStateOf(b)
  const s = st && st.year > 0 ? clampN(st.share, 0.0005, 0.98) : 0
  const q = s > 0 ? (s * ctx.F) / (ctx.w * (1 - s) * ctx.edge) : 0.2
  const bu = Math.max(1e-9, ctx.dRef * q)
  const now = marketDemand(ctx, bu).units
  const then = marketDemand(ctx, bu * mult).units
  const move = now > 0 ? then / now - 1 : mult - 1
  const v = w.contrib * move
  return Number.isFinite(v) ? v : 0
}

/**
 * Dollars a change of `dq` quality points on one of the company's lines is worth over `years`
 * years, at today's market (a copycat closing the gap, a next version opening it).
 */
export function lineQualityValue(g: GameState, b: BizState, w: Worth, name: string, dq: number, years: number, ctx?: MarketCtx): number {
  if (!b.products.some((p) => p.name === name) || !dq) return 0
  const c = ctx ?? marketCtxFor(g, b, g.year)
  const field = fieldFor(c)
  const now = productPull(b.industry, b.products, g.year, field).total
  const changed = b.products.map((p) => (p.name === name ? { ...p, quality: clampN(lineQuality(p) + dq, 0, 100) } : p))
  const then = productPull(b.industry, changed, g.year, field).total
  return pullValue(c, b, w, now, then) * years
}

/** Change one line's quality (a copycat, a quick next version). */
export function shiftLineQuality(b: BizState, name: string, dq: number): void {
  const p = b.products.find((x) => x.name === name)
  if (p) p.quality = Math.round(clampN(lineQuality(p) + dq, 0, 100))
}

/** A project's lifetime: the pull its line adds in each year on sale (before discounting). */
function liftPath(b: BizState, ctx: MarketCtx, line: Product, from: number): { base: number; lift: number }[] {
  const out: { base: number; lift: number }[] = []
  const heavy = fieldFor(ctx).heavy
  const market = fieldFor(ctx).market
  for (let t = 0; t < HORIZON; t++) {
    const year = from + t
    const field: Field = fieldOf(ctx.rivals, ctx.fringe, ctx.key, year, heavy, market)
    const base = productPull(b.industry, b.products, year, field).total
    const withIt = productPull(b.industry, [...b.products, { ...line, launched: from }], year, field).total
    out.push({ base, lift: Math.max(0, withIt - base) })
  }
  return out
}

/**
 * Expected value of funding an idea now with this budget: the customers its line wins over its
 * life (its kind's real demand, its quality against the rivals' versions as they catch up), its
 * brand, the complexity one more line brings and the odds of a flop, against the budget. The same
 * numbers advanceRd rolls; never touches g.rng.
 */
export function rdValue(g: GameState, b: BizState, idea: string, budget: number, w: Worth = bizWorth(g, b), ctx?: MarketCtx): RdQuote & { value: number } {
  const c = ctx ?? marketCtxFor(g, b, g.year)
  const q = rdQuote(g, b, idea, budget, c)
  const from = g.year + q.years
  const mean = Math.min(99, q.quality + HIT_P * HIT_QUALITY)
  const path = liftPath(b, c, { name: idea, launched: from, boost: 0, quality: mean, family: q.info.family, kind: q.info.kind }, from)
  let sales = 0
  path.forEach((x, t) => {
    sales += pullValue(c, b, w, x.base, x.base + x.lift) * Math.pow(DISCOUNT, q.years - 1 + t)
  })
  const extra = (complexityShare(b.products.length + 1) - complexityShare(b.products.length)) * Math.max(0, w.revenue) * COMPLEXITY_YEARS * Math.pow(DISCOUNT, q.years - 1)
  const win = sales - extra + fxValue(g, b, w, { brand: 3 * (1 - HIT_P) + 8 * HIT_P })
  const value = q.odds * win + (1 - q.odds) * fxValue(g, b, w, { brand: -2 }) - budget
  return { ...q, value: Number.isFinite(value) ? value : -budget }
}

/** Budgets the Business talent compares, as multiples of an idea's normal cost. */
const BUDGET_GRID = [0.5, 0.75, 1, 1.5, 2, 3, 4]

/** Cash a company keeps back from R&D: about three months of running costs. */
export function rdReserve(b: BizState): number {
  const s = b.last
  return s ? Math.max(0, (s.cogs + s.wages + s.keyStaff + s.rent + s.upkeep + s.marketing + s.interest) / 4) : 0
}

/** The budgets worth comparing for an idea within its range (the grid plus the year thresholds). */
function budgetsFor(b: BizState, idea: string): number[] {
  const r = rdRange(b, idea)
  const crowd = rdCrowding(b)
  const y0 = baseYears(b.industry)
  // Budgets where a project gets a year shorter (time comes in whole years).
  const steps = [1, 2, 3].map((y) => Math.pow(y0 / y, 2) * crowd).filter((m) => m * r.normal >= r.min && m * r.normal <= r.max)
  return [...new Set([...BUDGET_GRID, ...steps].map((m) => Math.min(r.max, Math.max(r.min, niceBudget(r.normal * m)))))]
}

/** The budget with the best expected value for an idea that the company can pay now and keep a cash reserve (null: none pays). */
export function bestRdBudget(g: GameState, b: BizState, idea: string, room = Math.max(0, b.cash - rdReserve(b)), w: Worth = bizWorth(g, b), ctx?: MarketCtx): (RdQuote & { budget: number; value: number }) | null {
  const c = ctx ?? marketCtxFor(g, b, g.year)
  let best: (RdQuote & { budget: number; value: number }) | null = null
  for (const budget of budgetsFor(b, idea)) {
    if (budget > room) continue
    const v = rdValue(g, b, idea, budget, w, c)
    if (v.value > 0 && (!best || v.value > best.value)) best = { ...v, budget }
  }
  return best
}

/** The best idea and budget among `ideas` within `room` (the board's CEO and the purple hints). */
export function bestRdIdea(g: GameState, b: BizState, ideas: readonly string[], room: number, w: Worth = bizWorth(g, b), judge: (v: number) => number = (v) => v): { idea: string; budget: number; value: number; quote: RdQuote } | null {
  const c = marketCtxFor(g, b, g.year)
  let best: { idea: string; budget: number; value: number; quote: RdQuote } | null = null
  for (const idea of ideas) {
    for (const budget of budgetsFor(b, idea)) {
      if (budget > room) continue
      const v = rdValue(g, b, idea, budget, w, c)
      const value = judge(v.value + budget) - budget
      if (value > 0 && (!best || value > best.value)) best = { idea, budget, value, quote: v }
    }
  }
  return best
}

function niceBudget(n: number): number {
  if (!(n > 0)) return 0
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1))
  return Math.ceil(n / mag - 1e-9) * mag
}

/** Why R&D refuses a line the company retired on purpose (Heavy R&D says the same). */
export function retiredReason(name: string): string {
  return `${name} was retired. Develop something else.`
}

/** Why a project can't start (null when it can). Cash is checked separately (startRd). */
export function rdBlock(b: BizState, idea: string, budget: number): string | null {
  if (!idea.trim()) return 'Pick an idea first.'
  if (b.products.some((p) => p.name === idea)) return `${idea} is already on sale.`
  if (retiredOf(b).includes(idea)) return retiredReason(idea)
  if (rdProjects(b).some((p) => p.name === idea)) return `${idea} is already in development.`
  if (rdProjects(b).length >= MAX_STORED_PROJECTS) return 'Your R&D department is drowning in projects. Let some finish first.'
  const r = rdRange(b, idea)
  if (!(budget >= r.min)) return `${idea} needs a budget of at least ${money(r.min)}.`
  if (budget > r.max) return `${idea} can't usefully take more than ${money(r.max)}: past that, money doesn't make it better.`
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
    notice(g, 'Not Enough Company Cash', `Developing ${idea} on a ${formatMoney(n)} budget needs ${formatMoney(n - Math.max(0, b.cash))} more than ${a.name} has. Inject some of your own money, borrow, or pick a smaller budget.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return null
  }
  const q = rdQuote(g, b, idea, n)
  firmCash(g, b, -n, 'rnd', a.id)
  b.yearCosts += n
  const p: RdProject = {
    id: uid(g, 'rd'),
    name: idea,
    budget: n,
    years: q.years,
    progress: 0,
    odds: Math.round(q.odds * 1000) / 1000,
    boost: 0,
    quality: q.quality,
    family: q.info.family,
    kind: q.info.kind,
    started: g.year,
  }
  rdOf(b).push(p)
  log(g, `${a.name} started developing ${idea}.`)
  notice(
    g,
    'R&D Underway',
    `${a.name}'s team is developing ${idea} on a ${formatMoney(n)} budget. It should be ready in ${q.years === 1 ? 'about a year' : `about ${q.years} years`}, with about ${Math.round(q.odds * 100)}% odds it works and a quality around ${q.quality} (rivals' versions: ${q.offer > 0.02 ? Math.round(q.field) : 'none yet'}). ${plural(rdProjects(b).length, 'project')} in development now.`,
    { emoji: '\u{1F9EA}' },
  )
  return p
}

/** A line's standing without rivals: how much demand its kind has and how good the line still is (a breakthrough's demand is its record's). */
function standing(b: Pick<BizState, 'industry' | 'countryId'>, p: Product, year: number, heavy?: readonly HeavyRecord[]): number {
  const info = infoOf(p, b.industry)
  const level = kindLevel(info.family, marketKey(b), year, heavy).level
  return KIND_WEIGHT[info.kind] * demandSize(info.family) * level * Math.pow(2, effectiveQuality(p, b.industry, year) / 15)
}

/**
 * Lines most worth retiring first: the weakest (outdated, or in a kind nobody wants any more), then the oldest.
 * `heavy` is the company's market's breakthrough records (heavy-rd.ts heavyOf): pass them wherever the game
 * state is at hand, so a breakthrough line is ranked by its own kind's demand.
 */
export function retireOrder(b: Pick<BizState, 'industry' | 'countryId' | 'products'>, year: number, heavy?: readonly HeavyRecord[]): Product[] {
  return [...b.products].sort((x, y) => standing(b, x, year, heavy) - standing(b, y, year, heavy) || x.launched - y.launched)
}

/**
 * Remember lines that were retired on purpose, so R&D never offers them again (productIdeas,
 * rdBlock). Names are kept the way a saved game keeps them (state.ts readRetired): newest last,
 * no repeats, the newest MAX_STORED_PRODUCTS. The list is created on first use.
 */
export function rememberRetired(b: BizState, names: readonly string[]): void {
  if (!names.length) return
  const list = readRetired([...retiredOf(b), ...names])
  if (list.length) b.retired = list
}

/** Take the `n` weakest lines off sale; returns their names. */
function dropWeakest(b: BizState, n: number, year: number, heavy?: readonly HeavyRecord[]): string[] {
  const k = Math.max(0, Math.min(b.products.length, Math.floor(n)))
  if (k <= 0) return []
  const gone = retireOrder(b, year, heavy).slice(0, k)
  const names = new Set(gone.map((p) => p.name))
  b.products = b.products.filter((p) => !names.has(p.name))
  return gone.map((p) => p.name)
}

/**
 * Retire the `n` weakest lines for good; returns their names. This is a deliberate retirement
 * ("Retire Weak Lines", the hired CEO), so R&D never offers the lines again.
 */
export function retireLines(b: BizState, n: number, year: number, heavy?: readonly HeavyRecord[]): string[] {
  const gone = dropWeakest(b, n, year, heavy)
  rememberRetired(b, gone)
  return gone
}

/** A finished project's expected quality (old saves: from the boost it was funded for). */
export function projectQuality(p: RdProject): number {
  return typeof p.quality === 'number' && Number.isFinite(p.quality) ? p.quality : qualityFromBoost(p.boost)
}

/**
 * Year-end: every project gets a year of work; finished ones launch (next year's product line)
 * or flop. Called from economy.evolve for every company, after the fiscal year is booked.
 */
export function advanceRd(g: GameState, b: BizState, year: number): void {
  // The first rival to offer a breakthrough that works is reported once (heavy-rd.ts), whether or not this company has projects.
  heavyArrivals(g, b, year)
  // Operations R&D programs (lab-year.ts) move a year closer too; a company with no lab does nothing here.
  advanceLab(g, b, year)
  if (!Array.isArray(b.rd) || b.rd.length === 0) return
  const a = g.assets.find((x) => (x.details as unknown) === b) ?? null
  const name = a?.name ?? 'The company'
  const keep: RdProject[] = []
  const lines: string[] = []
  let wins = 0
  let field: Field | null = null
  for (const p of b.rd) {
    p.progress = Math.min(p.years, p.progress + 1)
    if (p.progress < p.years) {
      keep.push(p)
      continue
    }
    // A Heavy R&D breakthrough has its own odds, hit chance and news (heavy-rd.ts); ordinary projects go on below.
    if (p.heavy === true && breakthroughByName(p.name) !== null) {
      const done = advanceHeavy(g, a, b, p, year)
      lines.push(done.line)
      if (done.won) wins += 1
      continue
    }
    if (!chance(g, clampN(p.odds, 0.02, 0.98))) {
      b.brand = clampN(b.brand - 2, 0, 100)
      lines.push(`\u{1F4A5} ${p.name} flopped in testing (${money(p.budget)} of R&D).`)
      log(g, `${name}'s ${p.name} flopped.`, 'bad')
      continue
    }
    const hit = chance(g, HIT_P)
    const quality = Math.round(clampN(projectQuality(p) + (rand(g) * 2 - 1) * QUALITY_SPREAD + (hit ? HIT_QUALITY : 0), 5, 99))
    const info = p.family && p.kind ? { family: p.family, kind: p.kind } : lineInfo(p.name, b.industry)
    // A line of the same name may have come with a rival bought meanwhile: the better one stays.
    const same = b.products.findIndex((x) => x.name === p.name)
    const line: Product = { name: p.name, launched: year + 1, boost: 0, quality, family: info.family, kind: info.kind }
    if (same < 0) b.products.push(line)
    else if (lineQuality(b.products[same]) < quality) b.products[same] = line
    b.brand = clampN(b.brand + (hit ? 8 : 3), 0, 100)
    wins += 1
    if (!field) {
      const ctx = marketCtxFor(g, b, year + 1)
      field = fieldFor(ctx)
    }
    const f = field.of(info.family)
    const vs = f.offer > 0.02 ? `rivals' versions ${Math.round(f.quality)}` : 'no rival sells one yet'
    const verdict = f.offer <= 0.02 ? 'customers have nowhere else to get it' : quality >= f.quality + 5 ? 'customers will switch to you' : quality >= f.quality - 5 ? 'it holds its own' : 'rivals still do it better'
    lines.push(`${hit ? '\u{1F525}' : '\u{1F680}'} ${p.name} ${hit ? 'is a smash hit' : 'launches'}: quality ${quality} (${vs}), ${verdict}.`)
    log(g, `${name} launched ${p.name}${hit ? ' and it was a smash hit' : ''}.`, 'good')
  }
  b.rd = keep
  // A storage guard only: the economics retire lines long before this. Not a retirement the player chose, so the lines are not remembered.
  if (b.products.length > MAX_STORED_PRODUCTS) dropWeakest(b, b.products.length - MAX_STORED_PRODUCTS, year + 1, heavyOf(g, b))
  if (!lines.length || !a || !runsIt(g, a) || !g.character.alive) return
  notice(g, `${name}: R&D Results`, `${lines.slice(0, 6).join('\n')}${lines.length > 6 ? `\n…and ${lines.length - 6} more.` : ''}${keep.length ? `\n${plural(keep.length, 'project')} still in development.` : ''}`, {
    emoji: wins > 0 ? '\u{1F680}' : '\u{1F4A5}',
    tone: wins > 0 ? 'good' : 'bad',
  })
}
