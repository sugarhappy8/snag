// Deep-tech engine helpers shared by the simulation, menus, events and founding: the typed
// TechState inside a BizState, local cost scales, founder and team skill, the industry boom/bust
// cycles, the demand/capacity model (stage, tech level, R&D premiums, compute, plants) and the
// valuation cache that economy.valuationOf reads through deepTechValue().
import { FACTOR_BOUNDS, marketEventFactors } from '../history/market-events'
import { outcomeTag } from '../timeMachine'
import { seeded } from '../assets'
import { marketOf, industryDemand } from '../data/markets'
import { codingSkill } from '../computer/skills'
import { hasTalent } from '../talents'
import type { Asset, GameState } from '../types'
import { appealOf, ceoSkill, costFactor, cycleOf, equipmentValue, localEcon, marketCtxFor, premiumOf, priceResponse, refreshValue, staffPower, valuationOf } from './economy'
import { businessEffects, executiveEdge, nationalMarket } from './dynamics'
import { LEAD_DIVISOR, benchYear } from './ai-bench'
import { labLead } from './ai-bench-market'
import { marketDemand, SCALE_SAVING, type MarketPick } from './competition-core'
import { familyId } from './competition-roster'
import { APPROVAL_ODDS, DEEP_TECH, RESTRICTED, bestModel, frontierScore, maxStage, satUnits, vcDepth } from './deeptech-data'
import { MAX_TECH_VALUE, TECH_VERSION, readTech, timesDone, type AiModel, type DeepTechIndustry, type Pace, type TechState } from './deeptech-state'
import { hedgeProfitIn, hedgeResultFor } from './hedge-record'
import { industryDef } from './industries'
import { bookSupply, supplyCapacity, supplyInventoryValue, supplyProfile } from './supply'
import { isQuoted, runsIt, totalOutlets, type BizState } from './state'
import { waveFactorsFor } from './tech-wave-factors'
import { clampN, round2, toJson } from './util'
import { LEADERSHIP } from './leadership'

// ---------------------------------------------------------------------------
// State access

export function dtInd(b: { industry: string }): DeepTechIndustry {
  return b.industry as DeepTechIndustry
}

/** Read-only view of a company's deep-tech state (for menus). */
export function techView(b: BizState): TechState {
  return readTech(b.tech)
}

/**
 * Mutable deep-tech state: normalizes b.tech in place (once) and returns it typed. Only call from
 * actions, scripts and yearly hooks (never from menu builders).
 */
export function techOf(b: BizState): TechState {
  const cur = b.tech
  if (!cur || typeof cur !== 'object' || Array.isArray(cur) || cur.v !== TECH_VERSION) {
    b.tech = toJson(readTech(cur))
  }
  return b.tech as unknown as TechState
}

// ---------------------------------------------------------------------------
// Local scales

/** What R&D costs here vs the US: talent is local, equipment and compute are global. */
export function rdScale(countryId: string, capex = false): number {
  const labor = clampN(marketOf(countryId).laborCost, 0.05, 2)
  const local = Math.pow(Math.min(1.6, labor), 0.8)
  return capex ? 0.75 + 0.25 * local : 0.3 + 0.7 * local
}

/** Revenue of one "market unit" at home: going price times what one strong product line sells. */
export function unitRevenue(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  return Math.max(0, e.baseDemand * e.goingPrice)
}

/** Local revenue scale vs the US baseline (for satellites, foundry services, licensing...). */
export function revenueScale(b: BizState): number {
  const def = industryDef(b.industry)
  return clampN(unitRevenue(b) / Math.max(1, def.demand * def.price), 0.05, 3)
}

/** 0-1: how good the local ecosystem is for this industry (investors, talent, customers). */
export function ecosystem(countryId: string, ind: DeepTechIndustry): number {
  const m = marketOf(countryId)
  const depth = vcDepth(countryId, m.gdpPerCapita, m.easeOfBusiness)
  const demand = industryDemand(countryId, ind)
  return clampN(depth * 0.6 + 0.2 * Math.min(1.5, demand) + 0.1 * (m.easeOfBusiness / 100), 0.03, 1)
}

export interface PaceDef {
  id: Pace
  label: string
  speed: number
  cost: number
  team: number
  note: string
}

export const PACES: PaceDef[] = [
  { id: 'lean', label: 'Lean', speed: 0.75, cost: 0.65, team: 0.85, note: 'Slower R&D, much lower burn' },
  { id: 'steady', label: 'Steady', speed: 1, cost: 1, team: 1, note: 'The plan as budgeted' },
  { id: 'blitz', label: 'Blitz', speed: 1.5, cost: 1.55, team: 1.15, note: 'Faster R&D, much higher burn' },
]

export function paceOf(p: Pace): PaceDef {
  return PACES.find((x) => x.id === p) ?? PACES[1]
}

// ---------------------------------------------------------------------------
// Skills

/** How well the player's own background fits an industry, 0-100. */
export function founderSkill(g: GameState, ind: DeepTechIndustry): number {
  const c = g.character
  const req = DEEP_TECH[ind].req
  let s = c.stats.smarts * 0.6
  let degree = 0
  for (const d of c.education.degrees) {
    const relevant = (d.major && req.majors.includes(d.major)) || (req.kinds ?? []).includes(d.kind)
    if (!relevant) continue
    const v = d.kind === 'doctorate' ? 30 : d.kind === 'master' || d.kind === 'md' || d.kind === 'pharmd' ? 22 : d.kind === 'bachelor' || d.kind === 'mba' ? 15 : 8
    degree = Math.max(degree, v)
  }
  s += degree
  if (req.coding) s += Math.min(25, codingSkill(g) / 3)
  if ((ind === 'aiLab' || ind === 'cybersecurity' || ind === 'robotics' || ind === 'drones') && hasTalent(g, 'Programming')) s += 8
  if ((ind === 'biotech' || ind === 'quantum' || ind === 'semiconductor' || ind === 'fusion' || ind === 'neurotech' || ind === 'carbonCapture') && hasTalent(g, 'Academics')) s += 8
  return clampN(Math.round(s), 5, 100)
}

/** True when the player has the background to found this industry without help. */
export function hasBackground(g: GameState, ind: DeepTechIndustry): boolean {
  const c = g.character
  const req = DEEP_TECH[ind].req
  if (c.stats.smarts >= req.smarts) return true
  if (req.coding !== undefined && codingSkill(g) >= req.coding) return true
  return c.education.degrees.some((d) => (d.major && req.majors.includes(d.major) && d.kind !== 'highschool' && d.kind !== 'ged') || (req.kinds ?? []).includes(d.kind))
}

/** The technical strength of the team, 0-100: whoever runs it, the experts and a co-founder. */
export function techSkill(g: GameState, a: Asset, b: BizState, t: TechState): number {
  const ind = dtInd(b)
  const lead = runsIt(g, a) && g.character.alive && !g.character.prison ? founderSkill(g, ind) : b.manager ? b.manager.skill * 0.7 : 35
  // A business-minded CEO still runs the place; the lab's own experts do most of the science.
  const base = Math.max(lead, 30 + ceoSkill(g, b) * 0.2)
  const experts = 20 * staffPower(b, 'quality')
  return clampN(Math.round(base * 0.7 + experts + (t.cofounder ? 12 : 0) + t.level * 0.1 + 20 * executiveEdge(ceoSkill(g, b))), 5, 100)
}

// ---------------------------------------------------------------------------
// Industry cycles (shared by every company of that industry, no g.rng)

export interface IndustryCycle {
  demand: number
  price: number
  /** Multiplier on valuations (bubbles and winters), tech waves included. */
  value: number
  /** The tech-wave value factor already inside `value` (1 with no wave; business/tech-waves.ts). */
  wave: number
  z: number
  label: string
}

function cycleZ(g: GameState, ind: DeepTechIndustry, year: number): number {
  const s = seeded(`${g.lifeId}${outcomeTag(g, year)}|dtcycle|${ind}|${year}`)
  return (s.next() + s.next() + s.next() - 1.5) * 2
}

/** `withWave` false leaves the tech waves out (a quoted company's value is wave-free until release 1b): `wave` is then 1. */
export function industryCycle(g: GameState, ind: DeepTechIndustry, year: number, withWave = true): IndustryCycle {
  const amp = DEEP_TECH[ind].cycle.amp
  const z = 0.65 * cycleZ(g, ind, year) + 0.35 * cycleZ(g, ind, year - 1)
  const c = DEEP_TECH[ind].cycle
  // Tech waves add their value factor only (the seed, demand, price, z and label are untouched): wave demand
  // and costs reach a deep-tech company through marketCtxFor and nationalMarket, which techPlan already reads.
  const wave = withWave ? waveFactorsFor(g, ind, 'world', year).value : 1
  const value = clampN(1 + 1.5 * amp * z, 0.6, 1.6)
  return {
    demand: clampN(1 + amp * z, 0.6, 1.5),
    price: ind === 'semiconductor' ? clampN(1 + 0.6 * amp * z, 0.8, 1.2) : 1,
    value: wave === 1 ? value : clampN(value * wave, FACTOR_BOUNDS.value[0], FACTOR_BOUNDS.value[1]),
    wave,
    z,
    label: z > 0.8 ? c.up : z < -0.8 ? c.down : 'steady',
  }
}

// ---------------------------------------------------------------------------
// The commercial model

/**
 * AI: a rated best model's lead over the best rival lab for the plan year `year`, null for an unrated model or a
 * year before 2012. A model is rated on the board of the fiscal year it was trained in and first sells the year
 * after, so demand reads the last closed benchmark year (`year - 1`, the board the menus show) and never a board
 * older than the model's own. Reading the plan year's own board would charge every model a year of drift
 * before it sold anything.
 */
function planLead(t: Pick<TechState, 'models'>, best: AiModel, year: number, fam: string): number | null {
  if (!best.rating || year < 2012) return null
  return labLead(fam, t, Math.max(benchYear({ year }), best.year))
}

/**
 * AI: how competitive the best model is (0.05 - 1.6). A rated model reads its lead over the best rival lab on
 * the board of the last closed benchmark year (lead 0 is 1.0); an unrated model, or a year before 2012, reads
 * the old frontier line.
 */
export function competitiveness(t: Pick<TechState, 'models'>, year: number, fam: string): number {
  const best = bestModel(t)
  if (!best) return 0
  const lead = planLead(t, best, year, fam)
  if (lead !== null) return clampN(1 + lead / LEAD_DIVISOR, 0.05, 1.6)
  const f = frontierScore(year)
  return clampN((best.score - (f - 25)) / 25, 0.05, 1.6)
}

/** Biotech: sales a drug has reached `years` after approval (ramp up, then the patent cliff). */
export function drugCurve(filed: number, approved: number, year: number): number {
  const since = year - approved
  const ramp = since <= 0 ? 0.25 : since === 1 ? 0.55 : since === 2 ? 0.8 : 1
  const age = year - filed
  const cliff = age >= 20 ? 0.15 : age >= 18 ? 0.5 : 1
  return ramp * cliff
}

/** Biotech: market units of the company's own approved drugs this year. */
export function ownDrugUnits(t: TechState, year: number): number {
  let n = 0
  for (const d of t.drugs) if (!d.failed && d.phase >= 4 && !d.partner) n += d.peak * drugCurve(d.filed, d.approved, year)
  return n
}

/** Biotech: the company's stage on the ladder from its best drug. */
export function syncBiotechStage(t: TechState): void {
  let best = 0
  for (const d of t.drugs) {
    if (d.failed) continue
    const inTrial = t.programs.some((p) => p.id === 'trial' && p.target === d.id)
    best = Math.max(best, d.phase >= 4 ? 4 : Math.min(3, d.phase + (inTrial ? 1 : 0)))
  }
  t.stage = best
}

/** Demand in market units before price, appeal and the economy. */
export function demandScale(b: BizState, t: TechState, year: number, fam: string): number {
  const ind = dtInd(b)
  const st = DEEP_TECH[ind].stages
  let base = ind === 'biotech' ? ownDrugUnits(t, year) : st[Math.min(st.length - 1, t.stage)].scale
  if (base <= 0) return 0
  base *= 0.6 + t.level / 125
  base *= 1 + t.boost
  base *= 0.92 + t.hype / 600
  if (ind === 'aiLab') {
    base *= competitiveness(t, year, fam)
    const best = bestModel(t)
    if (best?.open) base *= 0.75
  }
  if (ind === 'quantum') base *= (0.7 + Math.log10(Math.max(1, t.qubits)) / 5) * (1 + Math.min(1, t.logical * 0.08))
  if (RESTRICTED.has(b.countryId) && (ind === 'semiconductor' || ind === 'aiLab' || ind === 'quantum' || ind === 'spaceTech')) base *= 0.75
  return Math.max(0, base)
}

/** Capacity in market units: sites, plants, compute. */
export function capacityUnits(b: BizState, t: TechState, year: number): number {
  const ind = dtInd(b)
  const d = DEEP_TECH[ind]
  const st = d.stages[Math.min(d.stages.length - 1, t.stage)]
  const sites = totalOutlets(b)
  switch (ind) {
    case 'aiLab':
      return t.stage === 0 ? 0 : sites * st.siteCap + t.rented * 1.5 + t.plant * d.plantCap
    case 'electricVehicles':
      return t.stage === 0 ? 0 : sites * st.siteCap + t.plant * d.plantCap * (t.stage === 2 ? 0.45 : 1)
    case 'biotech':
      return Math.max(ownDrugUnits(t, year) * 1.6, ownDrugUnits(t, year) > 0 ? sites * 0.5 : 0) + t.plant * d.plantCap
    case 'spaceTech':
      return t.stage < 3 ? 0 : sites * st.siteCap
    default:
      return sites * st.siteCap + t.plant * d.plantCap
  }
}

/** Price premium the tech earns over the market's going price. */
export function techPremium(b: BizState, t: TechState, year: number, calm: boolean, g: GameState): number {
  const ind = dtInd(b)
  let p = 1 + t.premium
  if (ind === 'semiconductor') p *= 1 + 0.12 * t.node
  if (ind === 'aiLab') {
    const best = bestModel(t)
    const lead = best ? planLead(t, best, year, familyId(g.lifeId)) : null
    if (lead !== null) p *= 1 + 0.15 * clampN(lead / 150, 0, 1)
    else if (best && best.score >= frontierScore(year)) p *= 1.15
  }
  if (!calm) p *= industryCycle(g, ind, year).price
  return Math.max(0.3, p)
}

/** Unit-cost multiplier from the stage, R&D and yields. */
export function techCost(b: BizState, t: TechState): number {
  const ind = dtInd(b)
  const st = DEEP_TECH[ind].stages
  let c = st[Math.min(st.length - 1, t.stage)].cost * (1 - t.costCut)
  if (ind === 'semiconductor') c *= (1.25 - 0.5 * t.yieldRate) / (1.25 - 0.5 * 0.55)
  if (ind === 'aiLab' && RESTRICTED.has(b.countryId)) c *= 1.25
  return Math.max(0.2, c)
}

export interface TechPlan {
  price: number
  /** Tech-adjusted going price at home. */
  going: number
  suggested: number
  demand: number
  capacity: number
  /** Installed capacity before workforce and material delivery limits. */
  equipmentCapacity: number
  unitCost: number
  taxRate: number
  /** The world market (competition-core): bottom-up units and what competition left of them. */
  market: (MarketPick & { bu: number }) | null
}

export interface TechPlanOptions {
  price?: number
  calm?: boolean
  cycle?: number
  noise?: number
}

/** Demand, capacity and costs for a home-market price (the deep-tech version of planFor). */
export function techPlan(g: GameState, b: BizState, t: TechState, year: number, opts: TechPlanOptions = {}): TechPlan {
  const ind = dtInd(b)
  const def = industryDef(ind)
  const home = localEcon(ind, b.countryId, b.city)
  const calm = !!opts.calm
  const going = Math.max(0.01, home.goingPrice * techPremium(b, t, year, calm, g))
  const premium = premiumOf(b)
  const price = Math.max(0, opts.price ?? b.price)
  const cyc = opts.cycle ?? cycleOf(g, b.countryId, year)
  const cycleEffect = 1 + (cyc - 1) * (0.25 + def.incomeSens * 0.5)
  const ic = calm ? 1 : industryCycle(g, ind, year).demand
  const open = calm ? 1 : b.openFraction
  const shock = calm ? 1 : b.demandShock
  const pressure = calm ? b.pressure * 0.5 : b.pressure
  const scale = demandScale(b, t, year, familyId(g.lifeId))
  const effects = businessEffects(g, b, b.countryId, year)
  const national = nationalMarket(g, b.industry, b.countryId, year)
  const executive = executiveEdge(ceoSkill(g, b))
  // Customers before competition and the economy, then what the world market leaves of them (an
  // early lab in a tiny market sells little; a dominant one keeps its customers at higher prices).
  const mctx = marketCtxFor(g, b, year)
  const bu = scale > 0 ? home.baseDemand * scale * priceResponse(price / (going * premium), def.elasticity) * appealOf(g, b, year, mctx) * effects.demand * national.demand * (1 - pressure) * shock * (opts.noise ?? 1) * open : 0
  const pick = bu > 0 && Number.isFinite(bu) ? marketDemand(mctx, bu) : null
  const demand = pick ? pick.units * cycleEffect * ic : 0
  const ops = (1 + LEADERSHIP.capacity * staffPower(b, 'ops') + .25 * executive) * effects.capacity
  const loss = calm ? 0 : b.capacityLoss
  const capacity = capacityUnits(b, t, year) * home.baseDemand * ops * (1 - loss) * open
  const unitCost = home.unitCost * techCost(b, t) * costFactor(b, calm) * effects.cost * national.costs * (1 - .20 * executive) * (1 - SCALE_SAVING * mctx.dominance)
  return {
    price,
    going: round2(going),
    suggested: round2(going * premium),
    demand: Number.isFinite(demand) ? Math.max(0, demand) : 0,
    capacity: supplyCapacity(g, b, year, capacity),
    equipmentCapacity: Number.isFinite(capacity) ? Math.max(0, capacity) : 0,
    unitCost: round2(unitCost),
    taxRate: home.taxRate,
    market: pick ? { ...pick, bu } : null,
  }
}

/** Can the company sell anything this year (product, capacity)? */
export function sellable(g: GameState, b: BizState, t: TechState): boolean {
  return demandScale(b, t, g.year, familyId(g.lifeId)) > 0 && capacityUnits(b, t, g.year) > 0
}

/** Report bounds for the price (around the tech-adjusted going price) in `year`, the year the plan sells in (the game's year by default). */
export function techPriceBounds(g: GameState, b: BizState, t: TechState, year: number = g.year): { min: number; max: number; going: number } {
  const going = techPlan(g, b, t, year, { calm: true }).going
  return { min: round2(Math.max(0.01, going * 0.25)), max: round2(Math.max(0.05, going * 4)), going }
}

/**
 * The most profitable plan for the year it sells in (the Business talent's hint and the manager's plan). `year` is that
 * year: the game's year by default, the fiscal year when the yearly itself re-plans (it runs a year ahead of what it sells).
 */
export function bestTechPlan(g: GameState, b: BizState, t: TechState, cycle?: number, year: number = g.year): { price: number; production: number; profit: number } {
  const bounds = techPriceBounds(g, b, t, year)
  const def = industryDef(b.industry), materialShare = supplyProfile(b.industry)?.materialShare ?? 0
  let best = { price: bounds.going, production: 0, profit: -Infinity }
  for (let r = 0.6; r <= 2.01; r += 0.05) {
    const price = round2(clampN(bounds.going * r, bounds.min, bounds.max))
    const plan = techPlan(g, b, t, year, { price, calm: true, cycle })
    const production = Math.round(Math.max(0, Math.min(plan.capacity, plan.demand - b.inventory)))
    const supply = bookSupply(g, b, year, plan.equipmentCapacity, production, plan.unitCost)
    const sold = Math.floor(Math.min(plan.demand, supply.produced + b.inventory))
    const ordinary = plan.unitCost * (def.perishable >= 1 ? sold * .7 + supply.produced * .3 : supply.produced)
    const cogs = ordinary * (1 - materialShare) + supply.materialsCost
    // As before, this is contribution before fixed operating/R&D costs, not a
    // full-year profit promise. Raw-stock historical cost now matches settlement.
    const profit = sold * price / (1 + plan.taxRate) - cogs - supply.storageCost
    if (profit > best.profit) best = { price, production, profit }
  }
  return best
}

// ---------------------------------------------------------------------------
// Side revenue: contracts, satellites, foundry services, royalties, licences

/**
 * Yearly revenue besides the main product, and what it costs to deliver: contracts need people
 * and parts, foundry customers need wafers, satellites need ground stations, licences need sales
 * and support. Only royalties come in (almost) free.
 */
export function sideRevenue(b: BizState, t: TechState, year: number): { total: number; cost: number; parts: string[] } {
  const ind = dtInd(b)
  const parts: string[] = []
  let total = 0
  let cost = 0
  const add = (n: number, costShare: number, what: string) => {
    if (!(n > 0)) return
    total += n
    cost += n * costShare
    parts.push(what)
  }
  const scale = revenueScale(b)
  if (t.contract) add(t.contract.perYear, 0.6, t.contract.name)
  if (t.deal) add(t.deal.perYear, 0.65, t.deal.name)
  if (ind === 'semiconductor' && t.plant > 0) add(t.plant * 20_000_000 * scale * (0.6 + t.level / 150), 0.55, 'foundry services')
  if (ind === 'spaceTech') {
    // The first dozen batches sell in full; more of them saturate the subscriber market.
    add(satUnits(t.sats) * 25_000_000 * scale * (0.6 + t.level / 150), 0.45, 'satellite internet')
    if (timesDone(t, 'smallsat') > 0) add(6_000_000 * scale, 0.75, 'satellite building')
  }
  if (ind === 'quantum' && timesDone(t, 'pqc') > 0) add(3_000_000 * scale, 0.45, 'encryption licences')
  if (ind === 'biotech') {
    let units = 0
    for (const d of t.drugs) if (!d.failed && d.phase >= 4 && d.partner) units += d.peak * drugCurve(d.filed, d.approved, year) * d.royalty
    add(units * unitRevenue(b), 0.05, 'drug royalties')
  }
  const ok = Number.isFinite(total) && Number.isFinite(cost)
  return { total: ok ? Math.round(total) : 0, cost: ok ? Math.round(cost) : 0, parts }
}

// ---------------------------------------------------------------------------
// People and costs

/** Head count: the R&D team plus production staff for what was made. */
export function headCount(b: BizState, t: TechState, produced: number): number {
  const def = industryDef(b.industry)
  const sites = totalOutlets(b)
  const rd = sites * def.staff * (0.15 + 0.12 * t.stage) * paceOf(t.pace).team
  const prod = produced > 0 ? def.staff * 0.6 * Math.pow(produced / Math.max(1, def.demand), def.staffScale) : 0
  const plant = t.plant * def.staff * 0.4
  return Math.max(2, Math.round(rd + prod + plant))
}

/** Yearly R&D spend of the running programs at the current pace. */
export function rdBudget(t: TechState): number {
  const pace = paceOf(t.pace)
  return Math.round(t.programs.reduce((s, p) => s + p.cost * pace.cost, 0))
}

/** Yearly cost of rented GPU clusters (AI labs). */
export function computeRent(b: BizState, t: TechState): number {
  if (t.rented <= 0) return 0
  const restricted = RESTRICTED.has(b.countryId) ? 1.6 : 1
  return Math.round(t.rented * 4_000_000 * rdScale(b.countryId, true) * restricted)
}

/** Rough yearly cash burn going forward (costs not covered by gross margin). */
export function burnRate(g: GameState, a: Asset, b: BizState, t: TechState): number {
  const def = industryDef(b.industry)
  const e = localEcon(b.industry, b.countryId, b.city)
  const produced = Math.max(0, b.last?.produced ?? 0)
  const wages = headCount(b, t, produced) * e.wage * b.wageLevel
  let rent = 0
  let upkeep = 0
  for (const o of b.outlets) {
    const le = localEcon(b.industry, o.countryId, o.city)
    rent += o.count * le.rent
    upkeep += o.count * le.capital * def.maint
  }
  upkeep += t.plantBook * 0.04
  const keyStaff = b.staff.reduce((s, x) => s + x.salary, 0) + (b.ceo === 'manager' && b.manager ? b.manager.salary : 0) + (runsIt(g, a) ? b.ownerSalary : 0)
  const gross = b.last ? Math.max(0, b.last.netRevenue - b.last.cogs - b.last.marketing) : 0
  const burn = wages + rent + upkeep + keyStaff + rdBudget(t) + computeRent(b, t) + b.debt * b.debtRate - gross
  return Number.isFinite(burn) ? Math.max(0, Math.round(burn)) : 0
}

/** Years of runway at the current burn (99 when profitable). */
export function runwayYears(g: GameState, a: Asset, b: BizState, t: TechState): number {
  const burn = burnRate(g, a, b, t)
  const funds = t.venture + Math.max(0, b.cash)
  if (burn <= 0) return 99
  return Math.round((funds / burn) * 10) / 10
}

// ---------------------------------------------------------------------------
// Valuation

interface BookYear {
  year: number
  revenue: number
  profit: number
  /** The corporate tax that year paid (the company fund's share of the profit is read back from it). */
  tax: number
}

/** The yearly records as valuationOf will see them once the year just simulated is recorded. */
function bookedYears(b: BizState): BookYear[] {
  const h: BookYear[] = b.history.map((r) => ({ year: r.year, revenue: r.revenue, profit: r.profit, tax: r.tax }))
  const s = b.last
  if (s && (h.length === 0 || h[h.length - 1].year < s.year)) h.push({ year: s.year, revenue: s.revenue, profit: s.net, tax: s.corpTax })
  return h.slice(-3)
}

/** What valuationOf counts before the deep-tech part: max(profit multiple, asset floor). */
function classicPart(b: BizState): number {
  const booked = bookedYears(b)
  const last = b.history[b.history.length - 1]
  const history = booked.map((r) => ({ ...(last ?? { tax: 0, units: 0, price: 0, staff: 0, valuation: 0, outlets: 0 }), year: r.year, revenue: r.revenue, profit: r.profit, tax: r.tax }))
  const v = valuationOf({ ...b, history, tech: { value: 0 }, cash: 0, debt: 0, cooked: 0 })
  return Number.isFinite(v) ? v : 0
}

/**
 * What the whole company is worth (before cash, debt and investor money), the deep-tech way: the
 * best of a profit multiple on its recurring earnings (one-off windfalls left out), a revenue
 * multiple that rewards a commercial stage and healthy margins (a consultancy that loses money
 * isn't a platform), and its patents and drug pipeline; plus its plants and its equipment.
 */
export function operatingValue(g: GameState, b: BizState, t: TechState): number {
  const ind = dtInd(b)
  const def = industryDef(ind)
  const d = DEEP_TECH[ind]
  // The sector's own hype cycle, times the real booms and busts in their years (market-events.ts).
  // With a tech wave live the product is held to the same value bounds as everywhere else; otherwise it is what it was.
  const ic = industryCycle(g, ind, g.year, !isQuoted(b)), ev = marketEventFactors(ind, b.countryId, g.year).value
  const cyc = ic.wave === 1 ? ic.value * ev : clampN(ic.value * ev, FACTOR_BOUNDS.value[0], FACTOR_BOUNDS.value[1])
  const hypeMult = (0.6 + t.hype / 150) * cyc
  const years = bookedYears(b)
  const cur = years[years.length - 1]
  const prev = years.length >= 2 ? years[years.length - 2] : null
  const revenue = Math.max(0, cur?.revenue ?? 0)
  const tax = clampN(marketOf(b.countryId).corporateTax, 0, 0.6)
  const oneOff = (year: number) => t.oneOffs.filter((x) => x.year === year).reduce((sum, x) => sum + x.amount, 0)
  // A company fund's result is cash already, so like a windfall it earns no profit multiple (hedge-record.ts).
  const core = years.map((r) => r.profit - oneOff(r.year) * (1 - tax) - hedgeProfitIn(b, r))
  const weights = core.length === 3 ? [0.2, 0.3, 0.5] : core.length === 2 ? [0.4, 0.6] : [1]
  const avgCore = core.reduce((sum, p, i) => sum + p * weights[i], 0)
  const growth = prev && prev.revenue > 0 && revenue > 0 ? clampN(revenue / prev.revenue - 1, -0.3, 0.6) : 0
  const profitValue = Math.max(0, avgCore) * def.multiple * (1 + growth) * (0.85 + b.brand / 333)

  // Revenue multiples require sustainable margins. Research and rented compute still cost
  // money in a growing lab; adding them all back prices a loss-making blitz as pure profit.
  // Completed research retains its value through the separate patent/pipeline floor below.
  const s = b.last
  const x = t.last && s && t.last.year === s.year ? t.last : null
  const operating = s ? s.pbt - (x ? x.oneOff : 0) - hedgeResultFor(b, s.year) : 0
  const margin = revenue > 0 ? operating / revenue : -1
  const quality = clampN(0.3 + 1.75 * margin, 0.08, 1.2)
  const stageMult = 0.35 + 0.65 * (t.stage / Math.max(1, maxStage(ind)))
  const growthMult = clampN(1 + growth * 0.5, 0.85, 1.3)
  const revValue = revenue * d.salesMult * quality * stageMult * hypeMult * growthMult

  const ip = t.ipBook * (0.7 + t.level / 200) * hypeMult
  let pipeline = 0
  if (ind === 'biotech') {
    const unit = unitRevenue(b)
    for (const drug of t.drugs) {
      if (drug.failed || drug.phase >= 4) continue
      const odds = APPROVAL_ODDS[Math.max(0, Math.min(4, drug.phase))] * (0.75 + drug.quality / 200)
      pipeline += drug.peak * unit * odds * drug.royalty
    }
    pipeline *= hypeMult
  }
  const unitCost = localEcon(ind, b.countryId, b.city).unitCost
  const floor = 0.55 * equipmentValue(b) + Math.max(0, b.inventory) * unitCost * 0.5 + supplyInventoryValue(b)
  // Plants and equipment back the IP; a profit or revenue multiple already prices them in.
  const v = Math.max(profitValue, revValue, ip + pipeline + t.plantBook * 0.8 + floor)
  return Number.isFinite(v) ? clampN(v, 0, MAX_TECH_VALUE) : 0
}

/**
 * Recompute the cached deep-tech part of the valuation. Investors hold preferred stock with a 1x
 * liquidation preference: in a sale they get their money back first (or convert, if their share
 * is worth more), so the money they put in, spent or not, comes off what the founder's stake is
 * worth. Grant money is never the owner's. A listing converts the preferred stock.
 */
export function refreshTechValue(g: GameState, b: BizState, t: TechState): void {
  const ev = operatingValue(g, b, t)
  const net = b.cash - b.debt
  let value: number
  if (b.public) value = ev + net + t.venture
  else {
    const total = ev + net + Math.min(t.venture, t.raised)
    const share = clampN(b.share, 0.01, 1)
    const founder = Math.min(share * total, Math.max(0, total - t.raised))
    value = Math.max(0, founder) / share
  }
  t.value = clampN(Math.round(value - classicPart(b) - net), -MAX_TECH_VALUE, MAX_TECH_VALUE)
}

/** Refresh the cached value and push the new valuation into the asset. */
export function revalue(g: GameState, a: Asset, b: BizState, t: TechState): void {
  refreshTechValue(g, b, t)
  if (!b.public) b.valuation = valuationOf(b)
  refreshValue(a, b)
}

// ---------------------------------------------------------------------------
// Paying one-off deep-tech costs

/** Money the company can spend on R&D right now: the R&D account plus spare company cash. */
export function techFunds(b: BizState, t: TechState): number {
  return Math.max(0, t.venture) + Math.max(0, b.cash)
}

/**
 * Pay a one-off deep-tech cost (a test launch, a demo, a lawyer): from the R&D account first,
 * then company cash. Booked as a cost of the year either way, never moved twice.
 */
export function payTech(b: BizState, t: TechState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  const fromVenture = Math.min(Math.max(0, t.venture), n)
  t.venture -= fromVenture
  t.yearSpent += fromVenture
  const rest = n - fromVenture
  if (rest > 0) {
    b.cash -= rest
    b.yearCosts += rest
  }
  return n
}

/**
 * One-off income that lands in company cash this year (licensing upfronts, a celebrity's seat, a
 * broker's money). Booked as income, and remembered as a one-off so the valuation doesn't pay a
 * profit multiple for a windfall.
 */
export function earnTech(b: BizState, t: TechState, amount: number): number {
  const n = Math.max(0, Math.round(amount))
  b.cash += n
  b.yearIncome += n
  t.oneOff += n
  return n
}
