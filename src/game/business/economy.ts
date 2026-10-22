// The business economy: every number an industry needs, scaled to one market (data/markets.ts),
// plus the yearly simulation of one company across all of its outlets.
//
// Model in one breath: an outlet in country X sells about `baseDemand` units a year at the local
// going price. The going price blends the global price (tradable goods) with the local price
// level (services follow local wages; food, alcohol and fuel follow their local shop prices,
// taxes included). Demand then moves with your price vs that going price (elasticity), quality,
// brand, marketing, products, staff morale, the country's business cycle (shared by every firm
// in that country), competition and market saturation. Costs follow local wages (never below
// the minimum wage), commercial rents, input prices, interest rates and taxes.
import { FACTOR_BOUNDS, marketEventFactors } from '../history/market-events'
import { historicalIndexReturn } from '../history/markets'
import { PRESENT_YEAR } from '../history/timeline'
import { bookedMarketMove } from '../invest/clock'
import { outcomeTag } from '../timeMachine'
import { publicBusinessShockFactor } from '../invest/shocks'
import { seeded } from '../assets'
import { exchangeFor, industryDemand, INDUSTRY_IDS, isIndustryLegal, marketOf, type Industry, type MarketProfile } from '../data/markets'
import { localPay } from '../data/local-pay'
import { revalueCompany } from './contract'
import { businessFloor } from '../mastery'
import { bell, chance, rand } from '../rng'
import { hasTalent, talentHint, type TalentId } from '../talents'
import type { Asset, GameState } from '../types'
import { getCountry } from '../world'
import { industryDef, lineOf, type IndustryDef, type StaffFocus } from './industries'
import { traitOf } from './flavor'
import { deepTechValue, isDeepTech, isDeepTechIndustry } from './deeptech-state'
import { franchiseFeesFor } from './franchise-state'
import { fieldMarketOf, labIncomeIn, labValue } from './lab-state'
import { hedgeProfitIn } from './hedge-record'
import { studioValue } from './gamestudio-state'
import { heavyPulse, readHeavy } from './heavy-rd'
import { historyFactors, waveFactorsFor } from './tech-wave-factors'
import { complexityCost, PRODUCT_LIFE, rangeBrand } from './products'
import { applyProductRivalry, fieldFor, fieldOf, productPull, type ProductPull } from './product-market'
import { advanceRd } from './rd'
import { bookDollars, HISTORY_ROWS, isQuoted, normalizeBiz, setBookLines, SIM_HISTORY, stakeValue, totalOutlets, type BizState, type Outlet, type Statement, type YearRecord } from './state'
import { classFactor } from './share-classes'
import { clampN, dollars, num, round2 } from './util'
import { buildCtx, dominanceOf, marketDemand, marketKey, marketStateOf, PRICE_POWER, SCALE_SAVING, type MarketCtx, type MarketPick } from './competition-core'
import { marketDef } from './competition-data'
import { businessEffects, executiveEdge, nationalMarket } from './dynamics'
import { economicCycle, economyOf } from '../economy'
import { isFinanceFirm, simulateFinanceYear } from './finance-firm'
import { legacyInventionCapital, legacyInventionStock } from '../workshop/legacy-capital'
import { bankAdvanceOf } from './bank-state'
import { allocatedCorporateTax } from './tax'
import { bookSupply, saveSupply, supplyConditions, supplyInventoryValue, supplyProfile, type SupplyBook, type SupplyConditions } from './supply'
import { applyEconomicRivals } from './economic-actors'
import { applyNpcRivals } from './npc-rivals'
import { leadershipPower, individualLeadershipPower, LEADERSHIP } from './leadership'
import { chipCostFactor, chipTerms, DEVICE_NETWORK, FAB_BASE, FAB_MAINT, FAB_STEP, OS_BETA, OS_FAMILY, OS_PULL_CAP, readFabs } from './devices-data'
import { networkPull } from './competition-roster'
import { effectiveQuality, infoOf } from './product-market'

// ---------------------------------------------------------------------------
// One outlet in one market

export interface LocalEcon {
  countryId: string
  m: MarketProfile
  def: IndustryDef
  /** Local employee cost vs the US. */
  labor: number
  /** Local price level for services vs the US. */
  level: number
  /** Effective consumption tax rate on this industry's sales. */
  taxRate: number
  /** What locals typically pay per unit (tax included where it applies). */
  goingPrice: number
  /** Variable cost per unit. */
  unitCost: number
  /** Yearly cost of one general employee at the going rate (never below the minimum wage). */
  wage: number
  /** Yearly rent per outlet. */
  rent: number
  /** Startup capital per outlet (fit-out, equipment, opening stock). */
  capital: number
  /** Units one average outlet sells per year at the going price. */
  baseDemand: number
  /** Max units per outlet per year. */
  capacity: number
  /** 0.35-1: how well firms here reach export customers. */
  access: number
  /** Outlets the market supports before it saturates. */
  saturation: number
  /** Income factor (local purchasing power) on unit sales. */
  income: number
  /** 0 when the industry is banned here. */
  demandMult: number
}

// localPay moved to data/local-pay.ts (R2-K5: the home computer and the game-making math read it without importing this file).
export { localPay }

/** Big first-listed cities cost more and sell more. */
export function cityFactor(countryId: string, city: string): { rent: number; demand: number } {
  const idx = getCountry(countryId).cities.indexOf(city)
  if (idx === 0) return { rent: 1.3, demand: 1.12 }
  if (idx === 1 || idx === 2) return { rent: 1.12, demand: 1.05 }
  if (idx < 0) return { rent: 1, demand: 1 }
  return { rent: 0.92, demand: 0.96 }
}

export function localEcon(industry: Industry, countryId: string, city: string): LocalEcon {
  const def = industryDef(industry)
  const m = marketOf(countryId)
  const wealth = clampN(getCountry(countryId).wealth ?? 1, 0.05, 3)
  const labor = clampN(m.laborCost, 0.05, 3)
  const level = clampN(0.25 + 0.75 * labor, 0.2, 2.4)
  const globalInputs = 0.55 + 0.45 * Math.min(1, wealth)
  const access = clampN(0.35 + 0.65 * Math.sqrt(Math.min(1, Math.max(0, m.gdpPerCapita) / 50_000)), 0.35, 1)
  const taxRate = clampN(m.salesTax, 0, 0.35) * def.taxShare
  const usTax = 0.07 * def.taxShare
  const cf = cityFactor(countryId, city)

  // Unit cost: local labor/inputs + inputs priced like a shop category or globally.
  const costCat = def.costCat ? m.priceMult[def.costCat] : undefined
  const other = def.costCat ? (costCat !== undefined && costCat > 0 ? costCat : 1) : globalInputs
  const unitCost = def.unitCost * (def.localShare * level + (1 - def.localShare) * other)

  // Price: what locals pay is cost-plus. The input share of the price follows local input
  // costs; the rest follows local service prices (wages, rents) or the local shop price of the
  // category. Tradable goods sell near the global price (remote exporters get a discount).
  const costShare = clampN(def.unitCost / def.price, 0, 0.9)
  const costRatio = unitCost / Math.max(0.01, def.unitCost)
  const rentShare = clampN(def.rent / (def.price * def.demand), 0, 0.3)
  const service = level * (1 + rentShare * (clampN(m.rentCost, 0.05, 4) - 1))
  const catLevel = def.priceCat ? m.priceMult[def.priceCat] : undefined
  const localLevel =
    catLevel !== undefined && catLevel > 0
      ? costShare * costRatio + (1 - costShare) * catLevel
      : ((costShare * costRatio + (1 - costShare) * service) * (1 + taxRate)) / (1 + usTax)
  const tradablePart = (0.7 + 0.3 * access + 0.25 * Math.max(0, level - 1)) * ((1 + taxRate) / (1 + usTax))
  const goingPrice = def.price * (def.tradable * tradablePart + (1 - def.tradable) * localLevel)

  const demandMult = industryDemand(countryId, industry)
  const income = clampN(Math.pow(Math.max(200, m.gdpPerCapita) / 85_000, def.incomeSens * 0.25), 0.35, 1.15)
  const localPart = (1 - def.tradable) * demandMult * income
  const exportPart = demandMult > 0 ? def.tradable * access * (0.6 + 0.4 * demandMult) : 0
  const baseDemand = def.demand * (localPart + exportPart) * cf.demand
  // Outlets are sized to their market: thinner markets get smaller premises.
  const size = clampN(Math.sqrt(Math.max(0.01, baseDemand / def.demand)), 0.55, 1.4)

  const wage = localPay(countryId, def.wage)
  const rent = def.rent * clampN(m.rentCost, 0.05, 4) * cf.rent * size
  const capital = def.capital * (def.capitalLocal * level + (1 - def.capitalLocal) * globalInputs) * size
  const capacity = Math.max(baseDemand, def.demand * 0.4) * def.capMult
  const pop = Math.max(0.3, m.populationM)
  const saturation = Math.max(2, def.perMillion * (pop * Math.max(0.2, demandMult) * income + def.tradable * 2_500 * access))
  return {
    countryId,
    m,
    def,
    labor,
    level,
    taxRate,
    goingPrice: round2(goingPrice),
    unitCost: round2(unitCost),
    wage: Math.round(wage),
    rent: Math.round(rent),
    capital: Math.round(capital),
    baseDemand,
    capacity,
    access,
    saturation,
    income,
    demandMult,
  }
}

// ---------------------------------------------------------------------------
// Startup costs

export interface StartupCost {
  /** Capital for the first outlet. */
  capital: number
  /** Registration fees and licences. */
  fee: number
  /** Extra permits and paperwork in hard-to-do-business markets. */
  permits: number
  /** Days to register. */
  days: number
  total: number
}

export function startupCost(industry: Industry, countryId: string, city: string): StartupCost {
  const e = localEcon(industry, countryId, city)
  const m = e.m
  const ease = clampN(m.easeOfBusiness, 0, 100)
  const fee = Math.max(0, Math.round(m.startupFee))
  // Licensed trades pay more in licences everywhere.
  const licence = e.def.needs ? Math.round(fee * 0.5 + 500 * e.level) : 0
  const permits = (ease < 60 ? Math.round(Math.max(fee, 300) * ((60 - ease) / 15)) : 0) + licence
  const capital = niceAmount(e.capital)
  return { capital, fee, permits, days: Math.max(1, Math.round(m.startupDays)), total: capital + fee + permits }
}

/** Round to 2-3 significant digits so prices read like quotes, not computations. */
export function niceAmount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1))
  return Math.round(n / mag) * mag
}

/** Share of the first year the doors are open after registration. */
export function openFractionFor(days: number): number {
  return clampN(1 - days / 365, 0.25, 1)
}

// ---------------------------------------------------------------------------
// The business cycle: one boom or recession per country per year, shared by every firm.

/** Demand multiplier from the economy of a country in a year (about 0.6 - 1.35). */
export function cycleOf(g: GameState, countryId: string, year: number): number {
  return economicCycle(g, countryId, year)
}

export function cycleLabel(c: number): string {
  if (c >= 1.1) return 'booming'
  if (c >= 1.03) return 'growing'
  if (c > 0.97) return 'steady'
  if (c > 0.88) return 'slowing down'
  return 'in recession'
}

// ---------------------------------------------------------------------------
// Skills

/** How good whoever runs the company is, 0-100. */
export function ceoSkill(g: GameState, b: BizState): number {
  if (b.ceo === 'manager' || !g.character.alive) return b.manager ? b.manager.skill : 45
  const c = g.character
  const degrees = c.education.degrees
  let s = c.stats.smarts * 0.55 + c.hidden.discipline * 0.15 + 10
  if (degrees.some((d) => d.kind === 'mba')) s += 15
  else if (degrees.some((d) => d.major && /business|econom|finance|account|management|marketing/i.test(d.major))) s += 8
  s += Math.min(12, Math.max(0, g.year - b.founded))
  if (c.conditions.some((x) => x.kind === 'addiction')) s -= 10
  if (hasTalent(g, 'Business')) s += TALENT_SKILL
  return clampN(Math.round(Math.max(s, businessFloor(g))), 5, 100)
}

// ---------------------------------------------------------------------------
// The Business talent's growth perk (only while the owner runs the company personally)

/** Extra demand a business-talented owner-CEO brings (+6%). */
export const TALENT_DEMAND = 1.06
/** Extra brand the company drifts toward under a business-talented owner-CEO. */
export const TALENT_BRAND = 4
/** Business sense added to a talented owner's CEO skill. */
export const TALENT_SKILL = 5
/** Skill added to key-staff candidates a talented owner-CEO interviews (a better eye for people). */
export const TALENT_HIRE = 6

/** True when the owner personally runs this company and has the Business talent. */
export function talentCeo(g: GameState, b: BizState): boolean {
  return ownerTalent(g, b, 'Business')
}

/** True when the owner personally runs this company and has the given talent. */
export function ownerTalent(g: GameState, b: BizState, id: TalentId): boolean {
  const c = g.character
  return b.ceo !== 'manager' && c.alive && !c.prison && hasTalent(g, id)
}

/** Cooking talent: a food business run by its talented owner aims this much higher on quality (reviews). */
export const TALENT_COOKING_QUALITY = 8
/** Leadership talent: staff under a talented owner-CEO settle this much happier. */
export const TALENT_LEADER_MORALE = 6

/** Combined contribution of key staff with a focus (0 = nobody, ~1 = one strong hire). */
export function staffPower(b: BizState, focus: StaffFocus): number {
  return leadershipPower(b, focus)
}

// ---------------------------------------------------------------------------
// Demand

function marketingFactor(level: number): number {
  return 0.85 + 0.15 * Math.log(1 + 1.718 * clampN(level, 0, 3))
}

/**
 * The product range in the market (product-market.ts): every line's pull from its kind's real
 * demand and its edge over the rivals' versions. `ctx` is this company's marketCtxFor (computed
 * when not given).
 */
export function productsPullOf(g: GameState, b: BizState, year: number, ctx?: MarketCtx): ProductPull {
  if (!b.products.length) return { total: 0, lines: [] }
  return productPull(b.industry, b.products, year, fieldFor(ctx ?? marketCtxFor(g, b, year)))
}

/** Extra pull of the whole product range (the company's pull is multiplied by 1 + this). */
export function productsBoost(g: GameState, b: BizState, year: number, ctx?: MarketCtx): number {
  return productsPullOf(g, b, year, ctx).total
}

// ---------------------------------------------------------------------------
// Growth limits: crowded cities, rents, head office, capacity lines (no hard caps, honest costs)

/** A city's share of the country's customers (the first-listed city is the biggest). */
function cityWeight(countryId: string, city: string): number {
  const idx = getCountry(countryId).cities.indexOf(city)
  if (idx === 0) return 0.12
  if (idx === 1 || idx === 2) return 0.07
  return 0.04
}

/** Fewest outlets of one company a city takes before it feels crowded. */
const CITY_MIN = 6

/** How many of your outlets one city supports before they start stealing each other's customers. */
export function citySaturation(e: LocalEcon, countryId: string, city: string): number {
  return Math.max(CITY_MIN, e.saturation * cityWeight(countryId, city))
}

/** Share of each outlet's customers left when a city holds `count` of them (1 until it's crowded). */
export function cityCrowding(count: number, saturation: number): number {
  return count > saturation ? Math.pow(saturation / Math.max(1, count), 0.5) : 1
}

/** Rent multiplier once you crowd a city: every extra site is a worse, dearer spot. */
export function densityRent(count: number, saturation: number): number {
  return count > saturation ? 1 + 0.35 * Math.sqrt(count / Math.max(1, saturation) - 1) : 1
}

/** Head-office overhead (regional managers, systems, audits) as a share of running costs. */
export function headOffice(outlets: number): number {
  return 0.015 * Math.log2(1 + Math.max(0, outlets) / 8)
}

/** One capacity line adds this share of one home site's capacity. */
export const LINE_CAP = 0.5
/** One capacity line costs this share of one home site's capital. */
export const LINE_CAPEX = 0.45
/** Factory floor space for a line, as a share of one site's rent. */
export const LINE_RENT = 0.2

/** Capacity lines a company has built (0 on old saves and for industries without them). */
export function linesOf(b: Pick<BizState, 'lines' | 'industry'>): number {
  const n = Math.round(num(b.lines))
  return n > 0 && lineOf(b.industry) ? n : 0
}

/** Up-front cost of `n` capacity lines at home. */
export function lineCost(b: BizState, n: number): number {
  const home = localEcon(b.industry, b.countryId, b.city)
  return Math.round(Math.max(0, n) * home.capital * LINE_CAPEX)
}

/** What a unit of plant costs where this business sits: the local capital level against the trade's default. Never reads money. */
export function capitalIndex(b: Pick<BizState, 'industry' | 'countryId' | 'city'>): number {
  return localEcon(b.industry, b.countryId, b.city).capital / industryDef(b.industry).capital
}

/** The cost of the next chip fab (a device company's capex lever): a fixed price per plant, 35% dearer for each one built. `n` fabs in a row. */
export function fabCost(b: BizState, n = 1): number {
  const have = readFabs(b.fabs)
  let steps = 0
  for (let k = have; k < have + Math.max(0, Math.round(n)); k++) steps += 1 + FAB_STEP * k
  return Math.round(FAB_BASE * capitalIndex(b) * steps)
}

/** The yearly upkeep of the chip fabs a device company runs (0 for every other trade). */
export function fabUpkeep(b: BizState): number {
  if (b.industry !== 'devices') return 0
  let steps = 0
  for (let k = 0; k < readFabs(b.fabs); k++) steps += 1 + FAB_STEP * k
  return Math.round(FAB_MAINT * FAB_BASE * capitalIndex(b) * steps)
}

/** Price customers accept without flinching, given quality and brand. */
export function premiumOf(b: BizState): number {
  return 1 + (b.quality - 50) / 250 + (b.brand - 50) / 500
}

/** Demand multiplier from charging `ratio` × the price customers expect. */
export function priceResponse(ratio: number, elasticity: number): number {
  const r = Math.max(0.01, ratio)
  if (r <= 1) return Math.min(2.2, Math.pow(r, -elasticity), 1 + (1 - r) * elasticity * 1.4)
  let d = Math.pow(r, -elasticity * 1.3)
  if (r > 2) d *= Math.exp(-(r - 2) * 1.5)
  return d
}

/**
 * Everything that makes customers choose you, besides price (≈1 for an average firm). `ctx` is
 * this company's marketCtxFor for the year (its products are judged against the rivals in it).
 */
export function appealOf(g: GameState, b: BizState, year: number, ctx?: MarketCtx): number {
  const def = industryDef(b.industry)
  const quality = 0.75 + b.quality / 200
  const brand = 1 + ((b.brand - 50) / 100) * (0.25 + 0.35 * def.growth)
  const morale = 0.85 + (0.3 * b.morale) / 100
  const sales = 1 + LEADERSHIP.sales * staffPower(b, 'sales')
  const ceo = (0.97 + ceoSkill(g, b) / 1500) * (1 + .45 * executiveEdge(ceoSkill(g, b)))
  const talent = talentCeo(g, b) ? TALENT_DEMAND : 1
  return quality * brand * morale * sales * ceo * talent * marketingFactor(b.marketingLevel) * (1 + productsBoost(g, b, year, ctx)) * (1 + b.campaignBoost)
}

export interface LocPlan {
  outlet: Outlet
  econ: LocalEcon
  price: number
  /** Units customers want here. */
  demand: number
  capacity: number
}

export interface Plan {
  locs: LocPlan[]
  /** The home-market price this plan was made for. */
  price: number
  homeGoing: number
  suggested: number
  demand: number
  capacity: number
  /** Demand-weighted unit cost (before supplier/shock adjustments). */
  unitCost: number
  /**
   * The company's market (competition-core): bottom-up units in it before competition and the
   * business cycle, and what competition left of them. Null when nothing sells.
   */
  market: (MarketPick & { bu: number }) | null
}

// ---------------------------------------------------------------------------
// The market a company competes in (business/competition-*.ts)

/**
 * The reference competitor's yearly units and the rivals' combined pull at PRESENT_YEAR for an
 * industry's market: the world for tradable industries (fixed sizes), the country for local
 * trades (outlets per million people, scaled by spending power and local demand).
 */
export function marketScale(industry: Industry, countryId: string): { dRef: number; fieldP: number } {
  const key = `${industry}|${countryId}`
  const hit = scaleCache.get(key)
  if (hit) return { ...hit }
  const d = marketDef(industry)
  const def = industryDef(industry)
  let out: { dRef: number; fieldP: number }
  if (d.scope === 'world') out = { dRef: def.demand * d.ref, fieldP: d.field }
  else {
    const e = localEcon(industry, countryId, '')
    const fieldP = Math.max(4, d.field * Math.max(0.3, e.m.populationM) * Math.max(0.05, e.demandMult) * e.income)
    out = { dRef: Math.max(1, e.baseDemand), fieldP }
  }
  scaleCache.set(key, out)
  return { ...out }
}

/** marketScale only reads fixed country data, so it is computed once per industry and country. */
const scaleCache = new Map<string, { dRef: number; fieldP: number }>()

/** The competitive situation of a company's market in `year` (pure; cached). */
export function marketCtxFor(g: GameState, b: BizState, year: number): MarketCtx {
  const { dRef, fieldP } = marketScale(b.industry, b.countryId)
  const ctx = applyNpcRivals(g, b, applyEconomicRivals(g, buildCtx(g.lifeId, b.industry, marketKey(b), year, marketStateOf(b), dRef, fieldP)))
  const national = nationalMarket(g, b.industry, b.countryId, year)
  // The breakthroughs launched in this market (heavy-rd.ts): none for a market nobody has pioneered,
  // and then everything below is exactly what it always was.
  const heavy = readHeavy(g, b.industry, marketKey(b))
  // What the rivals offer of each kind of product, and how well (product-market.ts).
  // The company's trade and the shields its patents hold go with it (lab-state.ts fieldMarketOf).
  const field = fieldOf(ctx.rivals, ctx.fringe, ctx.key, year, heavy, fieldMarketOf(b))
  const pot = ctx.pot * (ctx.def.scope === 'national' ? national.demand : 1)
  // A breakthrough wakes up demand for the whole trade in its market, rivals and the player alike.
  const pulse = heavy.length ? heavyPulse(heavy, year) : 1
  // Tech waves (business/tech-waves.ts) move demand here and nowhere else, on this copy and after buildCtx
  // (its cache stays free of game state), together with the heavy pulse under one clamp. With no wave the
  // factor is exactly 1 and this is what it always was.
  const wd = waveFactorsFor(g, b.industry, ctx.key, year).demand
  const out: MarketCtx = { ...ctx, pot: wd === 1 ? (heavy.length ? pot * pulse : pot) : pot * clampN(pulse * wd, FACTOR_BOUNDS.demand[0], FACTOR_BOUNDS.demand[1]), field }
  // A device company's operating system adds to its network pull (osPull). It is read from the product list, which
  // buildCtx's cache key doesn't hold, so it lands on this copy and never on the cached context.
  return b.industry === 'devices' ? { ...out, w: osPull(ctx.base, osStrength(b, year)) } : out
}

/**
 * How strong a device company's operating system is, 0 to 1: its best OS line (a bundle or add-on doesn't count) against
 * today's rivals, from quality 35 (nothing) to 80 (all of it). A line ages like any other, so a neglected OS fades.
 */
export function osStrength(b: Pick<BizState, 'industry' | 'products'>, year: number): number {
  if (b.industry !== 'devices') return 0
  let best = 0
  for (const p of b.products) {
    const info = infoOf(p, b.industry)
    if (info.family !== OS_FAMILY || info.kind === 'bundle' || info.kind === 'addon') continue
    const q = effectiveQuality(p, b.industry, year)
    if (Number.isFinite(q) && q > best) best = q
  }
  return clampN((best - 35) / 45, 0, 1)
}

/**
 * The network pull of an installed base with an operating system behind it: never below the plain pull, never above the
 * cap (unless the plain pull already is), and growing with the OS's strength. Rivals keep their own, weaker pull.
 */
export function osPull(base: number, strength: number): number {
  const s = clampN(strength, 0, 1)
  return Math.max(networkPull(base, DEVICE_NETWORK), Math.min(OS_PULL_CAP, networkPull(base, DEVICE_NETWORK + OS_BETA * s)))
}

/**
 * marketCtxFor with the rivals' pull split by the company's products: rivals whose versions are
 * worse than yours lose customers to the ones whose versions hold up (product-market.ts
 * applyProductRivalry). Their total is unchanged, so only screens and bookings that split the
 * rivals' share need it; the planner and every what-if read marketCtxFor.
 */
export function marketCtxWithRivalry(g: GameState, b: BizState, year: number): MarketCtx {
  const ctx = marketCtxFor(g, b, year)
  return applyProductRivalry(ctx, b.industry, b.products, fieldFor(ctx))
}

export interface PlanOptions {
  /** Home-market price to test (default: the business's current price). */
  price?: number
  /** Cycle per country (default: the year's real cycle). */
  cycle?: (countryId: string) => number
  /** Random competition noise (default 1). */
  noise?: number
  /** Ignore one-off shocks (for "normal year" projections). */
  calm?: boolean
  /** This company's marketCtxFor(g, b, year), when a plan search already read it. */
  ctx?: MarketCtx
}

/** Demand and capacity across every outlet at a home-market price. */
export function planFor(g: GameState, b: BizState, year: number, opts: PlanOptions = {}): Plan {
  const def = industryDef(b.industry)
  const home = localEcon(b.industry, b.countryId, b.city)
  const homeGoing = Math.max(0.01, home.goingPrice)
  const price = Math.max(0, opts.price ?? b.price)
  const ratioToGoing = price / homeGoing
  const premium = premiumOf(b)
  // The market: the world for tradable industries, the home country for local trades.
  const mctx = opts.ctx ?? marketCtxFor(g, b, year)
  const appeal = appealOf(g, b, year, mctx)
  const ops = 1 + LEADERSHIP.capacity * staffPower(b, 'ops') + .25 * executiveEdge(ceoSkill(g, b))
  const noise = opts.noise ?? 1
  const open = opts.calm ? 1 : b.openFraction
  const shockD = opts.calm ? 1 : b.demandShock
  const lossC = opts.calm ? 0 : b.capacityLoss
  const pressure = opts.calm ? b.pressure * 0.5 : b.pressure
  const world = mctx.def.scope === 'world'
  const inMarket = (o: Outlet) => world || o.countryId === b.countryId
  // A dominant company buys cheaper (scale) and, in a national market, can charge a bit more.
  const costCut = 1 - SCALE_SAVING * mctx.dominance
  const pricePremium = premium * (world ? 1 : 1 + PRICE_POWER * mctx.dominance)
  // Outlets per country (saturation).
  const perCountry: Record<string, number> = {}
  for (const o of b.outlets) perCountry[o.countryId] = (perCountry[o.countryId] ?? 0) + o.count
  const locs: LocPlan[] = []
  const cycles: number[] = []
  let bu = 0
  let capacity = 0
  for (const o of b.outlets) {
    const e = o.countryId === b.countryId && o.city === b.city ? home : localEcon(b.industry, o.countryId, o.city)
    if (e.demandMult <= 0) {
      locs.push({ outlet: o, econ: e, price: 0, demand: 0, capacity: 0 })
      cycles.push(1)
      continue
    }
    const p = e.goingPrice * ratioToGoing
    const cyc = opts.cycle ? opts.cycle(o.countryId) : cycleOf(g, o.countryId, year)
    const national = nationalMarket(g, b.industry, o.countryId, year)
    const effects = businessEffects(g, b, o.countryId, year)
    const cycleEffect = (1 + (cyc - 1) * (0.5 + def.incomeSens)) * (world || o.countryId !== b.countryId ? national.demand : 1)
    const n = perCountry[o.countryId] ?? o.count
    // A saturated country, and a city crowded with your own outlets, share the same customers.
    const sat = (n > e.saturation ? Math.pow(e.saturation / n, 0.6) : 1) * cityCrowding(o.count, citySaturation(e, o.countryId, o.city))
    // Customers before competition and the economy (the business cycle hits every competitor alike).
    const d = o.count * e.baseDemand * priceResponse(p / Math.max(0.01, e.goingPrice * pricePremium), def.elasticity) * appeal * effects.demand * sat * (1 - pressure) * shockD * noise * open
    const cap = o.count * e.capacity * ops * effects.capacity * (1 - lossC) * open
    locs.push({ outlet: o, econ: e, price: round2(p), demand: Math.max(0, d), capacity: cap })
    cycles.push(cycleEffect)
    if (inMarket(o)) bu += Math.max(0, d)
    capacity += cap
  }
  // Capacity lines at home: more output, no more customers.
  const lines = linesOf(b)
  if (lines > 0 && home.demandMult > 0) capacity += lines * LINE_CAP * home.capacity * ops * (1 - lossC) * open
  // Competition: what the rivals and the size of the market leave of those customers.
  const pick = bu > 0 ? marketDemand(mctx, bu) : null
  let demand = 0
  let costW = 0
  locs.forEach((l, i) => {
    if (l.demand <= 0) return
    const d = l.demand * (pick && inMarket(l.outlet) ? pick.factor : 1) * cycles[i]
    l.demand = Math.max(0, Number.isFinite(d) ? d : 0)
    demand += l.demand
    const effects = businessEffects(g, b, l.outlet.countryId, year)
    const national = nationalMarket(g, b.industry, l.outlet.countryId, year)
    costW += l.econ.unitCost * costCut * effects.cost * national.costs * (1 - .20 * executiveEdge(ceoSkill(g, b))) * Math.max(1, l.demand)
  })
  const weight = locs.reduce((s, l) => s + (l.demand > 0 ? Math.max(1, l.demand) : 0), 0)
  const unitCost = weight > 0 ? costW / weight : home.unitCost * costCut
  return { locs, price, homeGoing, suggested: round2(homeGoing * pricePremium), demand, capacity, unitCost, market: pick ? { ...pick, bu } : null }
}

/** Unit-cost multiplier from the supplier contract, key ops staff and shocks. */
export function costFactor(b: BizState, calm = false): number {
  const sup = b.supplier === 'budget' ? 0.86 : b.supplier === 'premium' ? 1.18 : 1
  const ops = 1 - LEADERSHIP.unitCost * staffPower(b, 'ops')
  return sup * ops * chipCostFactor(b) * (calm ? 1 : b.costShock)
}

/** The highest production the report allows (full capacity, ignoring one-off losses). */
export function maxProduction(g: GameState, b: BizState): number {
  const p = planFor(g, b, g.year, { calm: true })
  return Math.max(1, Math.floor(p.capacity))
}

/** Price bounds for the annual report. */
export function priceBounds(b: BizState): { min: number; max: number; going: number } {
  const going = localEcon(b.industry, b.countryId, b.city).goingPrice
  return { min: round2(Math.max(0.01, going * 0.2)), max: round2(Math.max(0.05, going * 5)), going }
}

// ---------------------------------------------------------------------------
// The year

export interface YearResult {
  stmt: Statement
  inventoryEnd: number
  wantedStaff: number
  unpaidSalary: number
  /** The year's demand in its market at the price charged, and what the company could make (for the market-share booking). */
  market?: (MarketPick & { bu: number; capacity?: number }) | null
  /** Actual bank-book changes in dollars. Simulators return observations only;
   * the annual owner/NPC settlement enqueues them once, never a forecast. */
  bank?: { bankLoss: number; bankRun: number; bankLending: number }
}

/** Labor premium when the owner lacks the licence the trade expects. */
export function licencePremium(g: GameState, b: BizState): number {
  const def = industryDef(b.industry)
  const c = g.character
  if (def.needs === 'medical' && !c.education.degrees.some((d) => d.kind === 'md')) return 1.2
  if (def.needs === 'driver' && b.ceo === 'owner' && !c.licenses.includes('driver')) return 1.08
  return 1
}

/** Yearly cost of the general manager (when one runs the company). */
export function managerCost(b: BizState): number {
  return b.ceo === 'manager' && b.manager ? b.manager.salary : 0
}

/** The parts of a year's costs that don't depend on the price and production plan. */
export interface YearFixed {
  /** Unit-cost multiplier (supplier, ops staff, shocks). */
  cf: number
  /** Labor premium for a missing licence. */
  licence: number
  /** Key staff and the general manager. */
  keyStaff: number
  insurance: number
  /** Overhead multiplier from finance staff. */
  finance: number
  /** Overhead multiplier from whoever runs the company. */
  ceoEff: number
  /**
   * The company's supply conditions for one fiscal year, read once by a plan search: they depend
   * only on the company, the world and the year, never on the trial price or run size.
   */
  supply?: { year: number; conditions: SupplyConditions }
}

export function yearFixed(g: GameState, b: BizState): YearFixed {
  return {
    cf: costFactor(b),
    licence: licencePremium(g, b),
    keyStaff: b.staff.reduce((s, x) => s + x.salary, 0) + managerCost(b),
    insurance: b.insured ? insurancePremiumFor(b) : 0,
    finance: 1 - LEADERSHIP.overhead * staffPower(b, 'finance'),
    ceoEff: (1.05 - ceoSkill(g, b) / 1000) * (1 - .18 * executiveEdge(ceoSkill(g, b))),
  }
}

/** One fiscal year on paper: the statement plus the company's cash, stock and head count after it. */
export interface Book {
  stmt: Statement
  cash: number
  inventoryEnd: number
  employees: number
  unpaidSalary: number
  /** Read-only next input inventory and the matching procurement cash bridge. */
  supply: SupplyBook
}

/**
 * Book one fiscal year for a demand plan and a production run, without touching the business:
 * sales, costs, taxes and the cash, stock and staff it leaves behind. simulateYear() applies it;
 * the Business talent's planner uses it to test plans against the very same numbers.
 */
export function bookYear(g: GameState, b: BizState, year: number, plan: Plan, production: number, ownerDraw: number, k: YearFixed = yearFixed(g, b), cycle?: number, bookedHomeSales: number | Record<string, number> = 0): Book {
  const def = industryDef(b.industry)
  const capacity = plan.capacity
  const supply = bookSupply(g, b, year, capacity, production, plan.unitCost * k.cf, k.supply?.year === year ? k.supply.conditions : undefined)
  const produced = supply.produced
  const available = produced + b.inventory
  const demand = plan.demand
  const sold = Math.floor(Math.min(demand, available))
  const share = (l: LocPlan) => (demand > 0 ? l.demand / demand : 1 / Math.max(1, plan.locs.length))

  let revenue = 0
  let salesTax = 0
  let wages = 0
  let rent = 0
  let upkeep = 0
  let wanted = 0
  const netByCountry: Record<string, number> = {}
  // Capacity lines let each site produce more than its own floor allows.
  const lines = linesOf(b)
  const sites = totalOutlets(b)
  const perMax = def.capMult * (1 + (LINE_CAP * lines) / Math.max(1, sites))
  for (const l of plan.locs) {
    const e = l.econ
    const soldHere = sold * share(l)
    const rev = soldHere * l.price
    const tax = (rev * e.taxRate) / (1 + e.taxRate)
    revenue += rev
    salesTax += tax
    netByCountry[l.outlet.countryId] = (netByCountry[l.outlet.countryId] ?? 0) + rev - tax
    const prodHere = produced * share(l)
    const perOutlet = l.outlet.count > 0 ? prodHere / (l.outlet.count * def.demand) : 0
    const need = l.outlet.count * def.staff * Math.pow(clampN(perOutlet, 0.25, perMax), def.staffScale)
    wanted += need
    const national = economyOf(g, l.outlet.countryId, year)
    wages += need * e.wage * b.wageLevel * b.openFraction * national.wages
    rent += l.outlet.count * e.rent * densityRent(l.outlet.count, citySaturation(e, l.outlet.countryId, l.outlet.city)) * national.rent
    upkeep += l.outlet.count * e.capital * def.maint
  }
  if (lines > 0) {
    const home = localEcon(b.industry, b.countryId, b.city)
    rent += lines * home.rent * LINE_RENT
    upkeep += lines * home.capital * LINE_CAPEX * def.maint
  }
  upkeep += fabUpkeep(b)
  wages *= k.licence
  const employees = Math.max(totalOutlets(b), Math.round(wanted))
  const netRevenue = revenue - salesTax
  // Running a big range of products, and a big network of sites, costs money of its own.
  const range = complexityCost(b, netRevenue)

  // Services can't stock up: idle capacity costs less than a served customer.
  const cf = k.cf
  const ordinaryCogs = def.perishable >= 1 ? plan.unitCost * cf * (sold * 0.7 + produced * 0.3) : plan.unitCost * cf * produced
  const materialShare = supplyProfile(b.industry)?.materialShare ?? 0
  // Finished stock keeps the established production-expense convention. Only raw
  // input baskets are capitalized until used; consumption is never paid twice.
  const cogs = ordinaryCogs * (1 - materialShare) + supply.materialsCost
  const keyStaff = k.keyStaff
  const marketing = revenue * def.marketingShare * b.marketingLevel
  const interest = b.debt * b.debtRate
  const insurance = k.insurance
  const finance = k.finance
  const ceoEff = k.ceoEff
  const running = (wages + rent + upkeep) * finance * ceoEff
  const hq = running * headOffice(sites)
  const overhead = running + hq + supply.storageCost
  const pbt0 = netRevenue - cogs - overhead - range - keyStaff - marketing - interest - insurance - b.yearCosts + b.yearIncome

  // One-off costs and income (b.yearCosts / b.yearIncome) count toward profit, but the actions
  // that caused them already moved the cash, so they must not move it a second time here.
  const alreadyBooked = b.yearCosts - b.yearIncome
  // The owner's salary is paid if the company can cover it.
  const ownerPay = Math.round(clampN(ownerDraw, 0, Math.max(0, b.cash + pbt0 + alreadyBooked + supply.cashAdjustment)))
  const pbt = pbt0 - ownerPay
  // Concrete invention sales were already cash-booked through yearIncome. Attributed contracts
  // follow their market; any other one-off income remains taxable at headquarters.
  const corpTax = allocatedCorporateTax(b.countryId, pbt, netByCountry, b.yearIncome, bookedHomeSales, g, year, b.industry)
  const net = pbt - corpTax
  let cash = dollars(b.cash + net + alreadyBooked + supply.cashAdjustment)

  // Cash held in a currency that inflates faster than deposits pay loses value.
  const m = economyOf(g, b.countryId, year)
  let cashErosion = 0
  if (cash > 0) {
    const real = clampN((m.inflation - m.rate) * 0.35, 0, 0.4)
    cashErosion = Math.round(cash * real)
    cash -= cashErosion
  }

  const leftover = Math.max(0, available - sold)
  const inventoryEnd = Math.floor(leftover * (1 - def.perishable))
  const stmt: Statement = {
    year,
    demand: Math.round(demand),
    sold,
    produced,
    spoiled: leftover - inventoryEnd,
    price: round2(plan.price),
    revenue: dollars(revenue),
    salesTax: dollars(salesTax),
    netRevenue: dollars(netRevenue),
    cogs: dollars(cogs),
    wages: dollars(wages * finance * ceoEff),
    keyStaff: dollars(keyStaff),
    rent: dollars(rent * finance * ceoEff),
    marketing: dollars(marketing),
    interest: dollars(interest),
    upkeep: dollars(upkeep * finance * ceoEff + insurance + hq + range + supply.storageCost),
    other: dollars(b.yearCosts),
    otherIncome: dollars(b.yearIncome),
    ownerPay,
    pbt: dollars(pbt),
    corpTax: dollars(corpTax),
    net: dollars(net),
    cashErosion,
    cycle: round2(cycle ?? cycleOf(g, b.countryId, year)),
    openFraction: b.openFraction,
    employees,
  }
  return { stmt, cash, inventoryEnd, employees, unpaidSalary: Math.max(0, Math.round(ownerDraw) - ownerPay), supply }
}

/**
 * Simulate the fiscal year `year` for one business: sales, costs, taxes, cash. Mutates the
 * business (cash, inventory, employees, last statement) but not its quality/brand/morale (see
 * evolve()). `ownerDraw` is the salary the owner wants this year (0 when not CEO).
 */
export function simulateYear(g: GameState, b: BizState, year: number, ownerDraw: number, fixedNoise?: number, bookedHomeSales: number | Record<string, number> = 0): YearResult {
  if (isFinanceFirm(b)) return simulateFinanceYear(g, b, year, ownerDraw, bookedHomeSales)
  const noise = fixedNoise ?? clampN(1 + bell(g, -80, 80) / 1000, 0.9, 1.1)
  const plan = planFor(g, b, year, { noise })
  const k = bookYear(g, b, year, plan, b.production, ownerDraw, yearFixed(g, b), undefined, bookedHomeSales)
  b.cash = k.cash
  b.inventory = k.inventoryEnd
  b.employees = k.employees
  b.last = k.stmt
  if (k.supply.next) saveSupply(b, k.supply.next)
  return { stmt: k.stmt, inventoryEnd: k.inventoryEnd, wantedStaff: k.employees, unpaidSalary: k.unpaidSalary, market: plan.market ? { ...plan.market, capacity: k.supply.capacity } : null }
}

/** Yearly business insurance premium (property, liability, interruption). */
export function insurancePremiumFor(b: BizState): number {
  return Math.round(equipmentValue(b) * 0.012 + 300)
}

/** Total replacement value of the outlets' equipment and fit-out, plus any capacity lines. */
export function equipmentValue(b: BizState): number {
  let capital = 0
  for (const o of b.outlets) capital += o.count * localEcon(b.industry, o.countryId, o.city).capital
  const lines = linesOf(b)
  if (lines > 0) capital += lineCost(b, lines)
  // Factories of the retired invention lines (old saves) stay on the books.
  capital += legacyInventionCapital(b)
  return capital
}

// ---------------------------------------------------------------------------
// Quality, brand and morale drift

export interface EvolveNotes {
  moraleDelta: number
  qualityDelta: number
  brandDelta: number
}

export function evolve(g: GameState, b: BizState, stmt: Statement, year: number): EvolveNotes {
  const def = industryDef(b.industry)
  const m = marketOf(b.countryId)
  const before = { morale: b.morale, quality: b.quality, brand: b.brand }
  const skill = ceoSkill(g, b)

  // Morale: pay, workload, success, inflation without raises, team culture.
  const capacity = Math.max(1, stmt.produced)
  const busy = stmt.demand > capacity * 1.15 ? -6 : 0
  const traits = b.staff.reduce((s, x) => s + traitOf(x.trait).morale, 0)
  const inflationHit = m.inflation >= 0.08 && b.raiseYear < year ? -Math.min(18, m.inflation * 30) : 0
  const ceoVibe = b.ceo === 'owner' ? (g.character.hidden.karma - 50) / 10 : ((b.manager?.skill ?? 50) - 50) / 12
  const leader = ownerTalent(g, b, 'Leadership') ? TALENT_LEADER_MORALE : 0
  const moraleTarget = clampN(55 + (b.wageLevel - 1) * 120 + traits + busy + (stmt.net > 0 ? 3 : -6) + inflationHit + ceoVibe + leader, 5, 98)
  b.morale = clampN(Math.round(b.morale + (moraleTarget - b.morale) * 0.4 + bell(g, -4, 4)), 0, 100)
  for (const s of b.staff) {
    s.morale = clampN(Math.round(s.morale + (moraleTarget - s.morale) * 0.3 + bell(g, -5, 5)), 0, 100)
    s.years += 1
    s.age += 1
    if (rand(g) < 0.25) s.skill = clampN(s.skill + (traitOf(s.trait).id === 'lazy' ? 0 : 1), 0, 100)
  }

  // Quality: suppliers, quality staff, morale, leadership.
  const sup = b.supplier === 'budget' ? -12 : b.supplier === 'premium' ? 12 : 0
  const chef = def.food && ownerTalent(g, b, 'Cooking') ? TALENT_COOKING_QUALITY : 0
  const qTarget = clampN(45 + sup + LEADERSHIP.quality * staffPower(b, 'quality') + (b.morale - 50) / 6 + (skill - 50) / 10 + chef + chipTerms(b, year).lift, 5, 98)
  b.quality = clampN(Math.round(b.quality + (qTarget - b.quality) * 0.3), 0, 100)

  // Brand: quality, marketing, age, products, fame of the founder.
  const age = Math.max(0, year - b.founded)
  const fame = b.ceo === 'owner' ? g.character.hidden.fame / 10 : 0
  const talent = talentCeo(g, b) ? TALENT_BRAND : 0
  const bTarget = clampN(10 + b.quality * 0.45 + (b.marketingLevel - 1) * 8 + Math.min(12, age) + rangeBrand(b.products.length) + fame + Math.log10(1 + totalOutlets(b)) * 6 + talent, 0, 98)
  b.brand = clampN(Math.round(b.brand + (bTarget - b.brand) * 0.2), 0, 100)

  // One-year effects wear off.
  b.pressure = Math.round(b.pressure * 0.55 * 1000) / 1000
  b.costShock = 1
  b.demandShock = 1
  b.capacityLoss = 0
  b.campaignBoost = 0
  b.openFraction = 1
  b.yearCosts = 0
  b.yearIncome = 0
  delete b.ownerDraws
  // Very old lines are retired automatically (rivals' versions left them far behind long before).
  b.products = b.products.filter((p) => year - p.launched < PRODUCT_LIFE)
  // Products in development move a year closer (business/rd.ts): new lines launch next year.
  advanceRd(g, b, year)
  // Prices are set in local currency: inflation makes last year's price stale.
  b.price = round2(b.price / (1 + clampN(m.inflation, 0, 3)))
  if (def.growth < 0) b.price = Math.max(0.01, b.price)
  return { moraleDelta: b.morale - before.morale, qualityDelta: b.quality - before.quality, brandDelta: b.brand - before.brand }
}

// ---------------------------------------------------------------------------
// Valuation

/** Extra profit multiple for a fully dominant company (its profits are hard to take away). */
export const MOAT = 0.3

/** Equity value of the whole company. */
export function valuationOf(b: BizState): number {
  const def = industryDef(b.industry)
  const h = b.history.slice(-3)
  const weights = h.length === 3 ? [0.2, 0.3, 0.5] : h.length === 2 ? [0.4, 0.6] : [1]
  let avg = 0
  h.forEach((r, i) => (avg += r.profit * weights[i]))
  // One-off franchise fees are already in the cash: valued at what they are, never capitalized as
  // if they recurred (or a burst of franchise sales would inflate the company's price).
  if (b.franchise) {
    const keep = 1 - clampN(marketOf(b.countryId).corporateTax, 0, 0.9)
    h.forEach((r, i) => (avg -= franchiseFeesFor(b, r.year) * keep * weights[i]))
  }
  // A company fund's yearly result is already in the cash below: it is valued at what it is, never
  // capitalized as earnings (business/hedge-record.ts hedgeProfitIn).
  if (b.hedge) h.forEach((r, i) => (avg -= hedgeProfitIn(b, r) * weights[i]))
  // The R&D credit, a research grant and patent royalties are already in the cash: valued at what they
  // are, never capitalized as if they recurred (business/lab-state.ts).
  if (b.lab) {
    const keep = 1 - clampN(marketOf(b.countryId).corporateTax, 0, 0.9)
    h.forEach((r, i) => (avg -= labIncomeIn(b, r.year) * keep * weights[i]))
  }
  if (h.length === 0) avg = 0
  let growth = 0
  if (h.length >= 2 && h[h.length - 2].revenue > 0) growth = clampN(h[h.length - 1].revenue / h[h.length - 2].revenue - 1, -0.3, 0.6)
  // A dominant company's profits are safer (a moat): investors pay a little more for them. In a
  // boom or a bust (history/market-events.ts) they pay more or less for every dollar of it.
  const last = h.length ? h[h.length - 1] : null
  const events = last ? marketEventFactors(b.industry, b.countryId, last.year).value : 1
  let mood = events
  // Tech waves (business/tech-waves.ts): the mood stamped when that year was booked, else the history
  // table read directly. A stamp only counts for the last record's year and is validated here (bizOf
  // does not re-normalize a current-version record). Deep tech reads waves through industryCycle and
  // classicPart spreads b, so it never uses either. A quoted company (listed itself, or a division of a
  // listed group, whose price sums its divisions' valuations) takes only a stock-grade stamp (q), and with
  // none its mood is 1: the stock tables already carry the real booms, and a stale or private-grade stamp
  // must never move a price (C-12). An unquoted company ignores a stock-grade stamp.
  if (last && !isDeepTech(b)) {
    const ws = b.wave, quoted = isQuoted(b)
    const stamped = !!ws && typeof ws.v === 'number' && Number.isFinite(ws.v) && ws.y === last.year && (ws.q === true) === quoted
    const wv = stamped ? clampN(ws.v, FACTOR_BOUNDS.value[0], FACTOR_BOUNDS.value[1]) : quoted ? 1 : historyFactors(b.industry, marketKey(b), last.year).value
    if (wv !== 1) mood = clampN(events * wv, FACTOR_BOUNDS.value[0], FACTOR_BOUNDS.value[1])
  }
  const mult = def.multiple * (1 + growth * def.growth) * (0.85 + b.brand / 333) * (1 + MOAT * dominanceOf(b)) * mood
  const ev = Math.max(0, avg) * mult
  const lastRevenue = h.length ? h[h.length - 1].revenue : 0
  const unitCost = localEcon(b.industry, b.countryId, b.city).unitCost
  const floor = 0.55 * equipmentValue(b) + b.inventory * unitCost * 0.5 + legacyInventionStock(b) + supplyInventoryValue(b) + Math.max(0, lastRevenue) * 0.15 * (b.brand / 100)
  // A game studio is also worth its back catalog and the games in its pipeline.
  const games = b.industry === 'gameStudio' ? studioValue(b.studio) : 0
  // A deep-tech company is also worth its patents, tech lead and R&D pipeline.
  const tech = isDeepTech(b) ? deepTechValue(b.tech) : 0
  // A bank's run-time advance into its client book is shareholders' money funded by the
  // central-bank debt counted in b.debt (business/bank-state.ts), so it belongs in equity.
  let equity = Math.max(ev, floor) + games + tech + labValue(b) + b.cash - b.debt + bankAdvanceOf(b)
  if (b.cooked > 0) equity *= 1 + 0.25 * Math.min(3, b.cooked)
  return Math.max(0, dollars(equity))
}

/** Push the latest valuation into the asset (value = the owner's stake). */
export function refreshValue(a: Asset, b: BizState): void {
  a.value = stakeValue(b)
  a.upkeep = 0
}

// The port the underworld calls instead of importing this file (business/contract.ts). Bound here, at load, with an arrow.
revalueCompany.use((a, b) => {
  b.valuation = valuationOf(b)
  refreshValue(a, b)
})

/**
 * Close the books of a fiscal year into the company's history. Call it after evolve(), so cash and debt are the books-close
 * values. A player company also keeps the Statement lines as whole dollars (the R1 charts read them) and up to HISTORY_ROWS
 * rows; `lean` (NPC companies) writes the nine old fields and keeps SIM_HISTORY, exactly as before. `draws` is the owner
 * bonuses of the year, already inside `other`: a memo for the cash walk, never a second cost. Booking a year twice replaces
 * its row.
 */
export function recordYear(b: BizState, stmt: Statement, opts: { draws?: number; lean?: boolean } = {}): YearRecord {
  const rec: YearRecord = {
    year: stmt.year,
    revenue: stmt.revenue,
    profit: stmt.net,
    tax: stmt.corpTax,
    units: stmt.sold,
    price: stmt.price,
    staff: stmt.employees + b.staff.length,
    valuation: b.valuation,
    outlets: totalOutlets(b),
  }
  if (!opts.lean) {
    rec.cash = bookDollars(b.cash)
    rec.debt = bookDollars(b.debt)
    setBookLines(rec, stmt)
    rec.draws = bookDollars(opts.draws ?? 0)
  }
  b.history = [...b.history.filter((h) => h.year !== rec.year), rec].slice(-(opts.lean ? SIM_HISTORY : HISTORY_ROWS))
  return rec
}

/** Stock exchange move for a listed company's market, shared by everything on that exchange. */
export function exchangeMove(g: GameState, countryId: string, year: number): number {
  // In history the exchange moves as the real one did (the same tables as the stock market).
  const real = historicalIndexReturn(countryId, year)
  if (real !== null && Number.isFinite(real)) return clampN(real, -0.6, 1.2)
  // From the present on it is the engine's move of the market year this fiscal year is booked into (one clock with the funds).
  if (year >= PRESENT_YEAR) return bookedMarketMove(g, countryId, year)
  const ex = exchangeFor(countryId)
  const s = seeded(`${g.lifeId}${outcomeTag(g, year)}|bizexchange|${ex.code}|${year}`)
  const z = (s.next() + s.next() + s.next() - 1.5) * 2
  return clampN(ex.drift + ex.volatility * z, -0.6, 1.2)
}

/** Yearly share-price update for a listed company; returns the new market cap. */
export function updateSharePrice(g: GameState, b: BizState, year: number): number {
  if (!b.public || b.sharesOut <= 0) return b.valuation
  // Fewer votes sell for less (share-classes.ts): the market's price for the structure.
  const fundamental = (valuationOf(b) / b.sharesOut) * classFactor(b)
  const repricing = publicBusinessShockFactor(g, b, g.year)
  // Registration already marked today's price. At a historical expropriation
  // sunset, however, last year's quote still carries the old market's factor.
  const quotedRepricing = Math.max(repricing, publicBusinessShockFactor(g, b, g.year - 1))
  const market = exchangeMove(g, b.countryId, year)
  const own = bell(g, -120, 120) / 1000
  const next = 0.5 * (b.sharePrice / quotedRepricing) * (1 + market + own) + 0.5 * fundamental * (1 + market * 0.5)
  b.sharePrice = round2(clampN(next, 0.05, 1e7) * repricing)
  return dollars(b.sharePrice * b.sharesOut)
}

/** A rough chance helper for events: likelier in corrupt, bureaucratic markets. */
export function redTape(countryId: string): number {
  const m = marketOf(countryId)
  return clampN((m.corruption / 100) * 0.6 + ((100 - m.easeOfBusiness) / 100) * 0.4, 0, 1)
}

export function coin(g: GameState, p: number): boolean {
  return chance(g, clampN(p, 0, 1))
}

// ---------------------------------------------------------------------------
// The Business talent: next year's best plan, from the very same model as simulateYear.
//
// Nobody knows next year's economy, so plans are scored over the outcomes that can still happen:
// last year's shock is known (35% of next year's cycle), next year's own shock and the market's
// noise are not. Every score is an expected value over those scenarios; nothing here touches
// g.rng, so asking never changes the future.

interface Scenario {
  w: number
  cycle: Record<string, number>
}

/** Next year's possible business cycles per country (Gauss-Hermite nodes × recession/boom). */
function cycleScenarios(g: GameState, b: BizState, year: number): Scenario[] {
  const countries = [...new Set(b.outlets.map((o) => o.countryId))]
  const known = new Map(countries.map((cid) => [cid, economicCycle(g, cid, Math.min(g.year, year))]))
  const amp = new Map(countries.map((cid) => [cid, 0.035 + 0.3 * clampN(exchangeFor(cid).volatility, 0.05, 0.8)]))
  const nodes: [number, number][] = [
    [-Math.sqrt(3), 1 / 6],
    [0, 2 / 3],
    [Math.sqrt(3), 1 / 6],
  ]
  // shock(): a recession (8%) knocks 1.6 off, a boom (6%) adds 1.2; both can happen.
  const extra: [number, number][] = [
    [0, 0.92 * 0.94],
    [-1.6, 0.08 * 0.94],
    [1.2, 0.92 * 0.06],
    [-0.4, 0.08 * 0.06],
  ]
  const out: Scenario[] = []
  for (const [z0, w0] of nodes) {
    for (const [dz, w1] of extra) {
      const cycle: Record<string, number> = {}
      for (const cid of countries) cycle[cid] = clampN((known.get(cid) ?? 1) + (amp.get(cid) ?? .1) * .35 * (z0 + dz), .55, 1.4)
      out.push({ w: w0 * w1, cycle })
    }
  }
  return out
}

/** simulateYear's competition noise (mean of three uniforms over ±8%) as three weighted nodes. */
const NOISE_NODES: [number, number][] = [
  [1 - Math.sqrt(3) * 0.0267, 1 / 6],
  [1, 2 / 3],
  [1 + Math.sqrt(3) * 0.0267, 1 / 6],
]

/** A plan with every location's demand scaled (demand is linear in the market noise). */
function scalePlan(p: Plan, k: number): Plan {
  if (k === 1) return p
  return { ...p, demand: p.demand * k, locs: p.locs.map((l) => ({ ...l, demand: l.demand * k })) }
}

/** Value of one unit carried into next year, as a share of its unit cost (it still has to sell). */
const CARRY = 0.85

export interface PlanPick {
  price: number
  production: number
  /** Expected net profit for the year (the Annual Report's bottom line). */
  profit: number
  /** Expected units wanted at that price. */
  demand: number
}

export interface PlanSearch {
  /** Fewer scenarios and a coarser search; the report uses the full one. */
  quick?: boolean
  /** Just the central scenario (comparing options on the company screen: what-ifs, not forecasts). */
  fast?: boolean
  /** The owner's salary drawn this year (when they run it). */
  ownerDraw?: number
  /** Fiscal year to plan (default: the coming one, g.year). */
  year?: number
  /** Highest price allowed (a price the company promised to hold this year). */
  maxPrice?: number
}

interface Scored {
  price: number
  production: number
  score: number
  profit: number
  demand: number
}

/** Round to a price a shop would actually charge ($3.45, $14.50, $1,290). */
export function nicePrice(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 0.01
  if (p < 2) return Math.max(0.01, Math.round(p * 100) / 100)
  if (p < 20) return Math.round(p * 20) / 20
  if (p < 100) return Math.round(p * 10) / 10
  if (p < 1_000) return Math.round(p)
  const mag = Math.pow(10, Math.floor(Math.log10(p)) - 2)
  return Math.round(p / mag) * mag
}

/**
 * The price and production that maximize next year's expected profit (plus the stock it leaves
 * to sell later), scored with planFor() and bookYear(): the same demand, cost and tax model the
 * year itself runs on. Deterministic; never consumes g.rng.
 */
/** What a plan search reads once for a company and fiscal year (pure: no writes, no RNG). */
function searchFixed(g: GameState, b: BizState, year: number): { k: YearFixed; ctx: MarketCtx } {
  return { k: { ...yearFixed(g, b), supply: { year, conditions: supplyConditions(g, b, year) } }, ctx: marketCtxFor(g, b, year) }
}

export function bestPlan(g: GameState, b: BizState, opts: PlanSearch = {}): PlanPick {
  const year = opts.year ?? g.year
  const def = industryDef(b.industry)
  const b0 = priceBounds(b)
  const bounds = opts.maxPrice !== undefined && Number.isFinite(opts.maxPrice) ? { ...b0, max: Math.max(b0.min, Math.min(b0.max, opts.maxPrice)) } : b0
  const maxProd = maxProduction(g, b)
  const draw = Math.max(0, opts.ownerDraw ?? 0)
  // Everything that doesn't depend on the trial price or run size is read once per search
  // (pure reads of the same company, world and year, so every trial books identical numbers).
  const { k, ctx } = searchFixed(g, b, year)
  const all = cycleScenarios(g, b, year)
  const central = all.reduce((x, y) => (y.w > x.w ? y : x), all[0])
  const cycles = opts.fast ? [{ ...central, w: 1 }] : opts.quick ? all.filter((s) => s.w >= 0.004) : all
  const noises = opts.quick || opts.fast ? ([[1, 1]] as [number, number][]) : NOISE_NODES
  const cycleHere = (s: Scenario) => s.cycle[b.countryId] ?? 1

  const score = (price: number, fixedQ?: number): Scored => {
    const scen: { w: number; plan: Plan; cyc: number }[] = []
    for (const s of cycles) {
      const base = planFor(g, b, year, { price, cycle: (cid) => s.cycle[cid] ?? 1, noise: 1, ctx })
      for (const [n, wn] of noises) scen.push({ w: s.w * wn, plan: scalePlan(base, n), cyc: cycleHere(s) })
    }
    const wsum = scen.reduce((t, x) => t + x.w, 0) || 1
    const carry = def.perishable >= 1 ? 0 : (scen[0]?.plan.unitCost ?? 0) * k.cf * CARRY
    const value = (q: number) => {
      let sc = 0
      let pr = 0
      for (const x of scen) {
        const r = bookYear(g, b, year, x.plan, q, draw, k, x.cyc)
        pr += x.w * r.stmt.net
        sc += x.w * (r.stmt.net + carry * r.inventoryEnd)
      }
      return { score: sc / wsum, profit: pr / wsum }
    }
    const demand = scen.reduce((t, x) => t + x.w * x.plan.demand, 0) / wsum
    if (fixedQ !== undefined) {
      const v = value(fixedQ)
      return { price, production: fixedQ, score: v.score, profit: v.profit, demand }
    }
    // The newsvendor's answer sits at a quantile of demand: try the quantiles, then refine.
    const sorted = [...scen].sort((x, y) => x.plan.demand - y.plan.demand)
    const qs = new Set<number>([0, maxProd])
    const levels = opts.fast ? [0.5] : opts.quick ? [0.2, 0.4, 0.5, 0.6, 0.8, 0.95] : [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]
    let acc = 0
    let li = 0
    for (const x of sorted) {
      acc += x.w / wsum
      while (li < levels.length && acc >= levels[li]) {
        qs.add(Math.round(clampN(x.plan.demand - b.inventory, 0, maxProd)))
        li++
      }
    }
    let best = { q: 0, score: -Infinity, profit: 0 }
    const cand = [...qs].sort((x, y) => x - y)
    const tried = new Map<number, { score: number; profit: number }>()
    const tryQ = (q: number) => {
      const qq = Math.round(clampN(q, 0, maxProd))
      let v = tried.get(qq)
      if (!v) {
        v = value(qq)
        tried.set(qq, v)
      }
      if (v.score > best.score) best = { q: qq, score: v.score, profit: v.profit }
      return v.score
    }
    for (const q of cand) tryQ(q)
    // Golden-section between the best candidate's neighbours.
    const i = cand.indexOf(best.q)
    let lo = cand[Math.max(0, i - 1)]
    let hi = cand[Math.min(cand.length - 1, i + 1)]
    for (let it = 0; it < (opts.fast ? 0 : opts.quick ? 4 : 8) && hi - lo > 2; it++) {
      const m1 = lo + (hi - lo) * 0.382
      const m2 = lo + (hi - lo) * 0.618
      if (tryQ(m1) >= tryQ(m2)) hi = m2
      else lo = m1
    }
    return { price, production: best.q, score: best.score, profit: best.profit, demand }
  }

  // Prices: a log grid over a sensible band, then golden-section around the best point.
  const ref = Math.max(bounds.min, Math.min(bounds.max, planFor(g, b, year, { calm: true, ctx }).suggested))
  const pLo = Math.max(bounds.min, ref * 0.35)
  const pHi = Math.min(bounds.max, ref * 3.2)
  const n = opts.quick || opts.fast ? 12 : 20
  const grid: Scored[] = []
  for (let i = 0; i < n; i++) grid.push(score(pLo * Math.pow(pHi / Math.max(pLo, 0.01), i / Math.max(1, n - 1))))
  let bi = 0
  grid.forEach((x, i) => {
    if (x.score > grid[bi].score) bi = i
  })
  let best = grid[bi]
  let a = grid[Math.max(0, bi - 1)].price
  let c = grid[Math.min(grid.length - 1, bi + 1)].price
  for (let it = 0; it < (opts.quick || opts.fast ? 5 : 9) && c - a > 0.01; it++) {
    const m1 = a + (c - a) * 0.382
    const m2 = a + (c - a) * 0.618
    const s1 = score(m1)
    const s2 = score(m2)
    if (s1.score > best.score) best = s1
    if (s2.score > best.score) best = s2
    if (s1.score >= s2.score) c = m2
    else a = m1
  }
  // Round to a price and a run size people would actually write down, and re-score that.
  const price = round2(clampN(nicePrice(best.price), bounds.min, bounds.max))
  const tuned = score(price)
  const production = Math.round(clampN(tuned.production > 0 ? niceAmount(tuned.production) : 0, 0, maxProd))
  const final = score(price, production)
  const pick = final.score >= tuned.score - Math.abs(tuned.score) * 0.002 ? final : tuned
  return {
    price,
    production: pick.production,
    profit: Number.isFinite(pick.profit) ? Math.round(pick.profit) : 0,
    demand: Number.isFinite(pick.demand) ? Math.round(pick.demand) : 0,
  }
}

/** Expected profit of an exact plan for next year (same scenarios as bestPlan). */
export function planOutcome(g: GameState, b: BizState, price: number, production: number, opts: PlanSearch = {}): { profit: number; score: number; pretax: number } {
  const year = opts.year ?? g.year
  const def = industryDef(b.industry)
  const { k, ctx } = searchFixed(g, b, year)
  let w = 0
  let profit = 0
  let score = 0
  let pretax = 0
  for (const s of cycleScenarios(g, b, year)) {
    const base = planFor(g, b, year, { price, cycle: (cid) => s.cycle[cid] ?? 1, noise: 1, ctx })
    const carry = def.perishable >= 1 ? 0 : base.unitCost * k.cf * CARRY
    for (const [nz, wn] of opts.quick ? ([[1, 1]] as [number, number][]) : NOISE_NODES) {
      const r = bookYear(g, b, year, scalePlan(base, nz), production, Math.max(0, opts.ownerDraw ?? 0), k, s.cycle[b.countryId] ?? 1)
      w += s.w * wn
      profit += s.w * wn * r.stmt.net
      score += s.w * wn * (r.stmt.net + carry * r.inventoryEnd)
      pretax += s.w * wn * (r.stmt.pbt + carry * r.inventoryEnd)
    }
  }
  return { profit: w > 0 ? profit / w : 0, score: w > 0 ? score / w : 0, pretax: w > 0 ? pretax / w : 0 }
}

// ---------------------------------------------------------------------------
// What a point of brand, quality or morale is worth to this company (Business talent hints).
//
// Event hints compare choices by expected value: every outcome a choice can lead to is turned
// into dollars with the same levers simulateYear and evolve() pull. A brand point is worth the
// extra customers it brings for as long as it lasts (brand drifts 20% a year toward its target),
// a quality point the same (30% a year), morale less (40% a year); a one-year demand shock is a
// year of contribution, a capacity loss only bites once demand fills what is left, and so on.

export interface Worth {
  /** Contribution margin of a normal year: net sales minus cost of goods and marketing. */
  contrib: number
  /** Net sales of a normal year. */
  revenue: number
  cogs: number
  /** Wages, rent and upkeep. */
  overhead: number
  wages: number
  /** Demand / capacity (0.2 - 1): how much a capacity loss bites. */
  util: number
  /** Dollars per point of brand, quality and morale (one-off changes that fade). */
  brand: number
  quality: number
  morale: number
  /** Dollars per point of a lasting shift in the morale target (pay policy, the boss's karma). */
  moraleTarget: number
  /** Dollars per point of the owner's karma (a nicer boss lifts morale a little). */
  karma: number
  /** Cost of the owner being arrested, per point of severity. */
  arrest: number
}

export const BRAND_YEARS = 3.5
export const QUALITY_YEARS = 2.7
export const MORALE_YEARS = 2.2
/** Years a permanent change (a raise, a cheaper supplier...) is counted for. */
export const LASTING_YEARS = 2.7

/** Recent yearly net sales, cost of goods, marketing, wages and overhead (or a projection). */
function normalYear(g: GameState, b: BizState): { revenue: number; cogs: number; marketing: number; wages: number; overhead: number; demand: number } {
  const s = b.last
  const avgRev = b.history.length ? b.history.slice(-3).reduce((t, r) => t + Math.max(0, r.revenue), 0) / Math.min(3, b.history.length) : 0
  if (s && (s.netRevenue > 0 || avgRev > 0)) {
    // A short or quiet year (a studio between releases) is lifted toward the recent average,
    // keeping last year's cost structure.
    const revenue = Math.max(s.netRevenue, avgRev * 0.8)
    const lift = s.netRevenue > 0 ? revenue / s.netRevenue : 0
    return {
      revenue,
      cogs: lift > 0 ? s.cogs * lift : revenue * 0.35,
      marketing: lift > 0 ? s.marketing * lift : revenue * industryDef(b.industry).marketingShare * b.marketingLevel,
      wages: s.wages,
      overhead: s.wages + s.rent + Math.max(0, s.upkeep),
      demand: Math.max(s.demand, s.sold),
    }
  }
  // A deep-tech lab that can't sell yet (no approval, no launch, no product) earns nothing; the
  // classic planner would imagine a normal shop's sales and inflate every hint's payoff.
  if (isDeepTech(b)) {
    return { revenue: 0, cogs: 0, marketing: 0, wages: s?.wages ?? 0, overhead: s ? s.wages + s.rent + Math.max(0, s.upkeep) : 0, demand: 0 }
  }
  const e = localEcon(b.industry, b.countryId, b.city)
  const plan = planFor(g, b, g.year, { calm: true })
  const def = industryDef(b.industry)
  const units = Math.min(plan.demand, plan.capacity)
  const revenue = (units * plan.suggested) / (1 + e.taxRate)
  const wages = totalOutlets(b) * def.staff * e.wage * b.wageLevel
  return {
    revenue,
    cogs: units * plan.unitCost * costFactor(b, true),
    marketing: revenue * def.marketingShare * b.marketingLevel,
    wages,
    overhead: wages + totalOutlets(b) * (e.rent + e.capital * def.maint),
    demand: plan.demand,
  }
}

export function bizWorth(g: GameState, b: BizState): Worth {
  const def = industryDef(b.industry)
  const e = localEcon(b.industry, b.countryId, b.city)
  const y = normalYear(g, b)
  const floor = 1_500 * clampN(e.level, 0.2, 2.4)
  const contrib = Math.max(y.revenue - y.cogs - y.marketing, y.revenue * 0.15, floor)
  const cap = Math.max(1, planFor(g, b, g.year, { calm: true }).capacity)
  const util = clampN(y.demand / cap, 0.2, 1)
  const el = clampN(def.elasticity, 0, 4)
  const quality = contrib * (0.005 + el * 0.004) * QUALITY_YEARS
  const morale = contrib * 0.003 * MORALE_YEARS + quality * 0.1
  const moraleTarget = contrib * 0.003 * 2 + quality * 0.12
  const owner = b.ceo !== 'manager'
  return {
    contrib,
    revenue: y.revenue,
    cogs: Math.max(0, y.cogs),
    overhead: Math.max(0, y.overhead),
    wages: Math.max(0, y.wages),
    util,
    brand: contrib * ((0.25 + 0.35 * clampN(def.growth, 0, 1)) / 100 + el * 0.002) * BRAND_YEARS,
    quality,
    morale,
    moraleTarget,
    karma: owner ? moraleTarget * 0.1 : 0,
    arrest: Math.max(40_000 * clampN(e.level, 0.2, 2.4), 1.5 * b.ownerSalary + 0.25 * contrib),
  }
}

/** One outcome of a decision, as changes to the company (and its owner). */
export interface BizFx {
  /** Company cash (costs negative). */
  cash?: number
  /** Dollars that reach the owner, or value gained or lost outright (a sale above valuation...). */
  value?: number
  brand?: number
  quality?: number
  morale?: number
  /** Next year's demand shock moves toward this (below 1: the worse of the two, above 1: the better). */
  demandTo?: number
  /** Next year's capacity loss becomes at least this. */
  capacityTo?: number
  /** Next year's unit-cost shock becomes at least this. */
  costTo?: number
  /** Next year's unit-cost shock is set to exactly this (a locked-in contract). */
  costSet?: number
  /** Competitor pressure becomes at least this (it fades about half a year at a time). */
  pressureTo?: number
  /** This year's price is cut by this share (0.12 = 12%). */
  priceCut?: number
  /** General pay level change (0.08 = an 8% raise for everyone, for good). */
  wage?: number
  /** Lasting shift of the morale target (points). */
  moraleTarget?: number
  /** Lasting change to the yearly key-staff payroll. */
  payroll?: number
  /** Unit costs change for good by this factor (a new supplier). */
  costFactor?: number
  /** Quality target shift for good (points). */
  qualityTarget?: number
  karma?: number
  /** Arrest risk: severity × probability already folded in by the caller's branch weight. */
  arrest?: number
}

/** The yearly profit change from charging `cut` less for a year (demand responds; capacity caps it). */
export function priceCutCost(g: GameState, b: BizState, cut: number): number {
  if (!(cut > 0) || b.industry === 'gameStudio') return 0
  const c = clampN(cut, 0, 0.9)
  // Deep tech prices on its own planner: a year of its sales at the cut price (output is set).
  if (isDeepTech(b)) return Math.max(0, (b.last?.netRevenue ?? 0) * c)
  // The CEO has just planned the year (the Annual Report comes before the year's event); the cut
  // caps the price for the rest of it (a price promise), and the best they can do is re-plan
  // under that cap. Booked on the same model as the year itself.
  const plan = bestPlan(g, b, { quick: true })
  const capped = bestPlan(g, b, { quick: true, maxPrice: Math.max(0.01, round2(plan.price * (1 - c))) })
  const was = planOutcome(g, b, plan.price, plan.production, { quick: true }).pretax
  const now = planOutcome(g, b, capped.price, capped.production, { quick: true }).pretax
  return Math.max(0, was - now)
}

/** Dollar value of one outcome for this company (positive = good for the owner). */
export function fxValue(g: GameState, b: BizState, w: Worth, fx: BizFx): number {
  let v = (fx.cash ?? 0) + (fx.value ?? 0)
  if (fx.brand) v += (clampN(b.brand + fx.brand, 0, 100) - b.brand) * w.brand
  if (fx.quality) v += (clampN(b.quality + fx.quality, 0, 100) - b.quality) * w.quality
  if (fx.morale) v += (clampN(b.morale + fx.morale, 0, 100) - b.morale) * w.morale
  if (fx.demandTo !== undefined) {
    const next = fx.demandTo < 1 ? Math.min(b.demandShock, fx.demandTo) : Math.max(b.demandShock, fx.demandTo)
    v += (next - b.demandShock) * w.contrib
  }
  if (fx.capacityTo !== undefined) {
    const lost = (l: number) => (w.contrib * Math.max(0, l - (1 - w.util))) / Math.max(0.3, w.util)
    v -= lost(Math.max(b.capacityLoss, fx.capacityTo)) - lost(b.capacityLoss)
  }
  if (fx.costTo !== undefined || fx.costSet !== undefined) {
    const next = fx.costSet !== undefined ? fx.costSet : Math.max(b.costShock, fx.costTo ?? 1)
    if (b.industry !== 'gameStudio') v -= (next - b.costShock) * w.cogs
  }
  if (fx.pressureTo !== undefined) v -= (Math.max(b.pressure, fx.pressureTo) - b.pressure) * w.contrib * 2
  if (fx.priceCut) v -= priceCutCost(g, b, fx.priceCut)
  if (fx.wage) {
    v -= ((w.wages * fx.wage) / Math.max(0.5, b.wageLevel)) * LASTING_YEARS
    v += 120 * fx.wage * w.moraleTarget
  }
  if (fx.moraleTarget) v += fx.moraleTarget * w.moraleTarget
  if (fx.payroll) v -= fx.payroll * LASTING_YEARS
  if (fx.costFactor && b.industry !== 'gameStudio') v -= (fx.costFactor - 1) * w.cogs
  if (fx.qualityTarget) v += fx.qualityTarget * 0.3 * w.quality
  if (fx.karma) v += fx.karma * w.karma
  if (fx.arrest) v -= fx.arrest * w.arrest
  return Number.isFinite(v) ? v : 0
}

/** Expected value of a decision with weighted outcomes. */
export function expectedFx(g: GameState, b: BizState, w: Worth, branches: { p: number; fx: BizFx }[]): number {
  let v = 0
  for (const x of branches) if (x.p > 0) v += x.p * fxValue(g, b, w, x.fx)
  return v
}

/**
 * What one key staff member adds a year (before their salary), by focus, at the margin: the
 * company's other staff with the same focus already count (staff power is capped).
 */
export function staffBenefit(g: GameState, b: BizState, w: Worth, focus: StaffFocus, power: number): number {
  const others = staffPower(b, focus)
  const add = Math.max(0, (2.5 - others) * (1 - Math.exp(-power / 2.5)))
  if (add <= 0) return 0
  if (b.industry === 'gameStudio') {
    // Studios: quality staff lift every game (≈6 points of game quality each), ops staff ship
    // faster, finance trims overhead. Nobody needs a salesperson to sell a game.
    if (focus === 'quality') return w.contrib * 0.12 * add
    if (focus === 'ops') return w.contrib * 0.11 * add
    if (focus === 'finance') return w.overhead * LEADERSHIP.overhead * add
    return w.contrib * LEADERSHIP.sales * add
  }
  if (focus === 'sales') return w.contrib * LEADERSHIP.sales * add
  if (focus === 'finance') return w.overhead * LEADERSHIP.overhead * add * (1.05 - ceoSkill(g, b) / 1000)
  if (focus === 'ops') return w.cogs * LEADERSHIP.unitCost * add + w.contrib * LEADERSHIP.capacity * add * Math.max(0, w.util - 0.85) * 6
  // Quality: +12 quality target per unit of power, reached at 30% a year.
  return LEADERSHIP.quality * add * (w.quality / QUALITY_YEARS) * 0.6
}

/** A key staff member's yearly value to the company (benefit minus salary). */
export function staffNet(g: GameState, b: BizState, w: Worth, s: { focus: StaffFocus; skill: number; trait: string; morale: number; salary: number; id?: string }): number {
  const without = s.id ? { ...b, staff: b.staff.filter((x) => x.id !== s.id) } : b
  const power = individualLeadershipPower(s)
  const benefit = staffBenefit(g, without, w, s.focus, power)
  const vibe = traitOf(s.trait).morale * w.moraleTarget
  return benefit - s.salary + vibe / LASTING_YEARS
}

// ---------------------------------------------------------------------------
// The Business talent: which industries are hot in a city (the start-a-business list)

/**
 * A brand-new company's expected first full year in a city, run by this player (the planner on a
 * fresh business), and how many years that takes to earn back the startup cost.
 */
export function foundingOutlook(g: GameState, industry: Industry, countryId: string, city: string): { profit: number; payback: number } {
  const e = localEcon(industry, countryId, city)
  if (e.demandMult <= 0 || !isIndustryLegal(countryId, industry)) return { profit: 0, payback: Infinity }
  const b = normalizeBiz({ industry, countryId, city, founded: g.year - 1, price: e.goingPrice, brand: Math.round(clampN(15 + g.character.hidden.fame / 4, 0, 60)), morale: 70, ceo: 'owner' }, g.year)
  const p = bestPlan(g, b, { fast: true })
  const cost = startupCost(industry, countryId, city).total
  return { profit: p.profit, payback: p.profit > 0 ? cost / p.profit : Infinity }
}

const hotCache = new Map<string, { industry: Industry; payback: number }[]>()

/** Most years a startup may take to pay back and still count as a hot bet. */
const HOT_PAYBACK = 10

/**
 * The classic industries that pay back fastest in a city for this player, best first (at most
 * `n`). Game studios and deep tech live on launches and R&D rather than price and production, so
 * they aren't ranked here.
 */
export function hotIndustries(g: GameState, countryId: string, city: string, n = 3): { industry: Industry; payback: number }[] {
  const c = g.character
  const key = `${g.lifeId}|${g.year}|${countryId}|${city}|${c.stats.smarts}|${c.hidden.discipline}|${c.hidden.fame}|${c.education.degrees.length}|${hasTalent(g, 'Business') ? 1 : 0}|${n}`
  const hit = hotCache.get(key)
  if (hit) return hit
  const out = INDUSTRY_IDS.filter((id) => id !== 'gameStudio' && !isDeepTechIndustry(id) && !isFinanceFirm({ industry: id }))
    .map((industry) => ({ industry, payback: foundingOutlook(g, industry, countryId, city).payback }))
    .filter((x) => x.payback <= HOT_PAYBACK)
    .sort((x, y) => x.payback - y.payback)
    .slice(0, n)
  hotCache.set(key, out)
  if (hotCache.size > 16) {
    const first = hotCache.keys().next().value
    if (first !== undefined) hotCache.delete(first)
  }
  return out
}

/**
 * The Business talent's purple hint for one row of the start-a-business list: null unless the
 * industry is one of the hottest bets in that city.
 */
export function industryHint(g: GameState, industry: Industry, countryId: string, city: string): string | null {
  if (!hasTalent(g, 'Business')) return null
  const hot = hotIndustries(g, countryId, city)
  const i = hot.findIndex((x) => x.industry === industry)
  if (i < 0) return null
  const years = hot[i].payback
  const when = years < 1.5 ? 'about a year' : `about ${Math.round(years)} years`
  return talentHint(g, 'Business', `${i === 0 ? 'The hottest bet in' : 'One of the hottest bets in'} ${city}: it should earn back its startup cost in ${when}`)
}
