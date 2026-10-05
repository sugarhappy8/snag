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
import { seeded } from '../assets'
import { corporateTax, exchangeFor, industryDemand, marketOf, type Industry, type MarketProfile } from '../data/markets'
import { bell, chance, rand } from '../rng'
import type { Asset, GameState } from '../types'
import { getCountry } from '../world'
import { industryDef, type IndustryDef, type StaffFocus } from './industries'
import { traitOf } from './flavor'
import { stakeValue, totalOutlets, type BizState, type Outlet, type Statement, type YearRecord } from './state'
import { clampN, dollars, round2 } from './util'

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

/**
 * Local yearly pay for a job that pays `usPay` in the US. Skilled jobs (engineers, doctors,
 * executives) are priced closer to global rates than cooks and cleaners; never below the
 * minimum wage.
 */
export function localPay(countryId: string, usPay: number): number {
  const m = marketOf(countryId)
  const labor = clampN(m.laborCost, 0.05, 3)
  const skilled = clampN((usPay - 30_000) / 80_000, 0, 1)
  const f = labor <= 1 ? Math.pow(labor, 1 - 0.4 * skilled) : 1 + (labor - 1) * (1 - 0.7 * skilled)
  return Math.round(Math.max(usPay * f, Math.max(0, m.minWage)))
}

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

function shock(g: GameState, countryId: string, year: number): number {
  const s = seeded(`${g.lifeId}|bizcycle|${countryId}|${year}`)
  let z = (s.next() + s.next() + s.next() - 1.5) * 2
  if (s.chance(0.08)) z -= 1.6 // recession
  if (s.chance(0.06)) z += 1.2 // boom
  return z
}

/** Demand multiplier from the economy of a country in a year (about 0.6 - 1.35). */
export function cycleOf(g: GameState, countryId: string, year: number): number {
  const vol = clampN(exchangeFor(countryId).volatility, 0.05, 0.8)
  const amp = 0.035 + 0.3 * vol
  const z = 0.65 * shock(g, countryId, year) + 0.35 * shock(g, countryId, year - 1)
  return clampN(1 + amp * z, 0.55, 1.4)
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
  return clampN(Math.round(s), 5, 100)
}

/** Combined contribution of key staff with a focus (0 = nobody, ~1 = one strong hire). */
export function staffPower(b: BizState, focus: StaffFocus): number {
  let p = 0
  for (const s of b.staff) {
    if (s.focus !== focus) continue
    p += (s.skill / 100) * traitOf(s.trait).impact * (0.7 + (0.6 * s.morale) / 100)
  }
  return Math.min(2.5, p)
}

// ---------------------------------------------------------------------------
// Demand

function marketingFactor(level: number): number {
  return 0.85 + 0.15 * Math.log(1 + 1.718 * clampN(level, 0, 3))
}

function productsBoost(b: BizState, year: number): number {
  const def = industryDef(b.industry)
  let sum = 0
  for (const p of b.products) sum += p.boost * Math.max(0.25, 1 - 0.1 * Math.max(0, year - p.launched))
  return Math.min(sum, 0.6 * (0.5 + def.growth))
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

/** Everything that makes customers choose you, besides price (≈1 for an average firm). */
export function appealOf(g: GameState, b: BizState, year: number): number {
  const def = industryDef(b.industry)
  const quality = 0.75 + b.quality / 200
  const brand = 1 + ((b.brand - 50) / 100) * (0.25 + 0.35 * def.growth)
  const morale = 0.85 + (0.3 * b.morale) / 100
  const sales = 1 + 0.06 * staffPower(b, 'sales')
  const ceo = 0.97 + ceoSkill(g, b) / 1500
  return quality * brand * morale * sales * ceo * marketingFactor(b.marketingLevel) * (1 + productsBoost(b, year)) * (1 + b.campaignBoost)
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
  homeGoing: number
  suggested: number
  demand: number
  capacity: number
  /** Demand-weighted unit cost (before supplier/shock adjustments). */
  unitCost: number
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
}

/** Demand and capacity across every outlet at a home-market price. */
export function planFor(g: GameState, b: BizState, year: number, opts: PlanOptions = {}): Plan {
  const def = industryDef(b.industry)
  const home = localEcon(b.industry, b.countryId, b.city)
  const homeGoing = Math.max(0.01, home.goingPrice)
  const price = Math.max(0, opts.price ?? b.price)
  const ratioToGoing = price / homeGoing
  const premium = premiumOf(b)
  const appeal = appealOf(g, b, year)
  const ops = 1 + 0.08 * staffPower(b, 'ops')
  const noise = opts.noise ?? 1
  const open = opts.calm ? 1 : b.openFraction
  const shockD = opts.calm ? 1 : b.demandShock
  const lossC = opts.calm ? 0 : b.capacityLoss
  const pressure = opts.calm ? b.pressure * 0.5 : b.pressure
  // Outlets per country (saturation).
  const perCountry: Record<string, number> = {}
  for (const o of b.outlets) perCountry[o.countryId] = (perCountry[o.countryId] ?? 0) + o.count
  const locs: LocPlan[] = []
  let demand = 0
  let capacity = 0
  let costW = 0
  for (const o of b.outlets) {
    const e = o.countryId === b.countryId && o.city === b.city ? home : localEcon(b.industry, o.countryId, o.city)
    if (e.demandMult <= 0) {
      locs.push({ outlet: o, econ: e, price: 0, demand: 0, capacity: 0 })
      continue
    }
    const p = e.goingPrice * ratioToGoing
    const cyc = opts.cycle ? opts.cycle(o.countryId) : cycleOf(g, o.countryId, year)
    const cycleEffect = 1 + (cyc - 1) * (0.5 + def.incomeSens)
    const n = perCountry[o.countryId] ?? o.count
    const sat = n > e.saturation ? Math.pow(e.saturation / n, 0.6) : 1
    const d =
      o.count * e.baseDemand * priceResponse(p / Math.max(0.01, e.goingPrice * premium), def.elasticity) * appeal * cycleEffect * sat * (1 - pressure) * shockD * noise * open
    const cap = o.count * e.capacity * ops * (1 - lossC) * open
    locs.push({ outlet: o, econ: e, price: round2(p), demand: Math.max(0, d), capacity: cap })
    demand += Math.max(0, d)
    capacity += cap
    costW += e.unitCost * Math.max(1, d)
  }
  const weight = locs.reduce((s, l) => s + (l.demand > 0 ? Math.max(1, l.demand) : 0), 0)
  const unitCost = weight > 0 ? costW / weight : home.unitCost
  return { locs, homeGoing, suggested: round2(homeGoing * premium), demand, capacity, unitCost }
}

/** Unit-cost multiplier from the supplier contract, key ops staff and shocks. */
export function costFactor(b: BizState, calm = false): number {
  const sup = b.supplier === 'budget' ? 0.86 : b.supplier === 'premium' ? 1.18 : 1
  const ops = 1 - 0.03 * staffPower(b, 'ops')
  return sup * ops * (calm ? 1 : b.costShock)
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

/**
 * Simulate the fiscal year `year` for one business: sales, costs, taxes, cash. Mutates the
 * business (cash, inventory, employees, last statement) but not its quality/brand/morale (see
 * evolve()). `ownerDraw` is the salary the owner wants this year (0 when not CEO).
 */
export function simulateYear(g: GameState, b: BizState, year: number, ownerDraw: number, fixedNoise?: number): YearResult {
  const def = industryDef(b.industry)
  const noise = fixedNoise ?? clampN(1 + bell(g, -80, 80) / 1000, 0.9, 1.1)
  const plan = planFor(g, b, year, { noise })
  const capacity = plan.capacity
  const produced = Math.floor(clampN(Math.min(b.production, capacity), 0, 1e12))
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
    const need = l.outlet.count * def.staff * Math.pow(clampN(perOutlet, 0.25, def.capMult), def.staffScale)
    wanted += need
    wages += need * e.wage * b.wageLevel * b.openFraction
    rent += l.outlet.count * e.rent
    upkeep += l.outlet.count * e.capital * def.maint
  }
  wages *= licencePremium(g, b)
  const employees = Math.max(totalOutlets(b), Math.round(wanted))
  const netRevenue = revenue - salesTax

  // Services can't stock up: idle capacity costs less than a served customer.
  const cf = costFactor(b)
  const cogs = def.perishable >= 1 ? plan.unitCost * cf * (sold * 0.7 + produced * 0.3) : plan.unitCost * cf * produced
  const keyStaff = b.staff.reduce((s, x) => s + x.salary, 0) + managerCost(b)
  const marketing = revenue * def.marketingShare * b.marketingLevel
  const interest = b.debt * b.debtRate
  const insurance = b.insured ? insurancePremiumFor(b) : 0
  const finance = 1 - 0.025 * staffPower(b, 'finance')
  const ceoEff = 1.05 - ceoSkill(g, b) / 1000
  const overhead = (wages + rent + upkeep) * finance * ceoEff
  const pbt0 = netRevenue - cogs - overhead - keyStaff - marketing - interest - insurance - b.yearCosts + b.yearIncome

  // The owner's salary is paid if the company can cover it.
  const ownerPay = Math.round(clampN(ownerDraw, 0, Math.max(0, b.cash + pbt0)))
  const pbt = pbt0 - ownerPay
  let corpTax = 0
  if (pbt > 0) {
    const totalNet = Object.values(netByCountry).reduce((s, v) => s + Math.max(0, v), 0)
    for (const [cid, v] of Object.entries(netByCountry)) {
      const part = totalNet > 0 ? Math.max(0, v) / totalNet : 1 / Object.keys(netByCountry).length
      corpTax += corporateTax(cid, pbt * part)
    }
    if (Object.keys(netByCountry).length === 0) corpTax = corporateTax(b.countryId, pbt)
  }
  const net = pbt - corpTax
  b.cash = dollars(b.cash + net)

  // Cash held in a currency that inflates faster than deposits pay loses value.
  const m = marketOf(b.countryId)
  let cashErosion = 0
  if (b.cash > 0) {
    const real = clampN((m.inflation - m.interestRate) * 0.35, 0, 0.4)
    cashErosion = Math.round(b.cash * real)
    b.cash -= cashErosion
  }

  const leftover = Math.max(0, available - sold)
  const inventoryEnd = Math.floor(leftover * (1 - def.perishable))
  b.inventory = inventoryEnd
  b.employees = employees
  const stmt: Statement = {
    year,
    demand: Math.round(demand),
    sold,
    produced,
    spoiled: leftover - inventoryEnd,
    price: round2(b.price),
    revenue: dollars(revenue),
    salesTax: dollars(salesTax),
    netRevenue: dollars(netRevenue),
    cogs: dollars(cogs),
    wages: dollars(wages * finance * ceoEff),
    keyStaff: dollars(keyStaff),
    rent: dollars(rent * finance * ceoEff),
    marketing: dollars(marketing),
    interest: dollars(interest),
    upkeep: dollars(upkeep * finance * ceoEff + insurance),
    other: dollars(b.yearCosts),
    otherIncome: dollars(b.yearIncome),
    ownerPay,
    pbt: dollars(pbt),
    corpTax: dollars(corpTax),
    net: dollars(net),
    cashErosion,
    cycle: round2(cycleOf(g, b.countryId, year)),
    openFraction: b.openFraction,
    employees,
  }
  b.last = stmt
  return { stmt, inventoryEnd, wantedStaff: employees, unpaidSalary: Math.max(0, Math.round(ownerDraw) - ownerPay) }
}

/** Yearly business insurance premium (property, liability, interruption). */
export function insurancePremiumFor(b: BizState): number {
  let capital = 0
  for (const o of b.outlets) capital += o.count * localEcon(b.industry, o.countryId, o.city).capital
  return Math.round(capital * 0.012 + 300)
}

/** Total replacement value of the outlets' equipment and fit-out. */
export function equipmentValue(b: BizState): number {
  let capital = 0
  for (const o of b.outlets) capital += o.count * localEcon(b.industry, o.countryId, o.city).capital
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
  const moraleTarget = clampN(55 + (b.wageLevel - 1) * 120 + traits + busy + (stmt.net > 0 ? 3 : -6) + inflationHit + ceoVibe, 5, 98)
  b.morale = clampN(Math.round(b.morale + (moraleTarget - b.morale) * 0.4 + bell(g, -4, 4)), 0, 100)
  for (const s of b.staff) {
    s.morale = clampN(Math.round(s.morale + (moraleTarget - s.morale) * 0.3 + bell(g, -5, 5)), 0, 100)
    s.years += 1
    s.age += 1
    if (rand(g) < 0.25) s.skill = clampN(s.skill + (traitOf(s.trait).id === 'lazy' ? 0 : 1), 0, 100)
  }

  // Quality: suppliers, quality staff, morale, leadership.
  const sup = b.supplier === 'budget' ? -12 : b.supplier === 'premium' ? 12 : 0
  const qTarget = clampN(45 + sup + 12 * Math.min(2, staffPower(b, 'quality')) + (b.morale - 50) / 6 + (skill - 50) / 10, 5, 98)
  b.quality = clampN(Math.round(b.quality + (qTarget - b.quality) * 0.3), 0, 100)

  // Brand: quality, marketing, age, products, fame of the founder.
  const age = Math.max(0, year - b.founded)
  const fame = b.ceo === 'owner' ? g.character.hidden.fame / 10 : 0
  const bTarget = clampN(10 + b.quality * 0.45 + (b.marketingLevel - 1) * 8 + Math.min(12, age) + b.products.length * 2 + fame + Math.log10(1 + totalOutlets(b)) * 6, 0, 98)
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
  // Products fade; very old ones are retired automatically.
  b.products = b.products.filter((p) => year - p.launched < 15)
  // Prices are set in local currency: inflation makes last year's price stale.
  b.price = round2(b.price / (1 + clampN(m.inflation, 0, 3)))
  if (def.growth < 0) b.price = Math.max(0.01, b.price)
  return { moraleDelta: b.morale - before.morale, qualityDelta: b.quality - before.quality, brandDelta: b.brand - before.brand }
}

// ---------------------------------------------------------------------------
// Valuation

/** Equity value of the whole company. */
export function valuationOf(b: BizState): number {
  const def = industryDef(b.industry)
  const h = b.history.slice(-3)
  const weights = h.length === 3 ? [0.2, 0.3, 0.5] : h.length === 2 ? [0.4, 0.6] : [1]
  let avg = 0
  h.forEach((r, i) => (avg += r.profit * weights[i]))
  if (h.length === 0) avg = 0
  let growth = 0
  if (h.length >= 2 && h[h.length - 2].revenue > 0) growth = clampN(h[h.length - 1].revenue / h[h.length - 2].revenue - 1, -0.3, 0.6)
  const mult = def.multiple * (1 + growth * def.growth) * (0.85 + b.brand / 333)
  const ev = Math.max(0, avg) * mult
  const lastRevenue = h.length ? h[h.length - 1].revenue : 0
  const unitCost = localEcon(b.industry, b.countryId, b.city).unitCost
  const floor = 0.55 * equipmentValue(b) + b.inventory * unitCost * 0.5 + Math.max(0, lastRevenue) * 0.15 * (b.brand / 100)
  let equity = Math.max(ev, floor) + b.cash - b.debt
  if (b.cooked > 0) equity *= 1 + 0.25 * Math.min(3, b.cooked)
  return Math.max(0, dollars(equity))
}

/** Push the latest valuation into the asset (value = the owner's stake). */
export function refreshValue(a: Asset, b: BizState): void {
  a.value = stakeValue(b)
  a.upkeep = 0
}

export function recordYear(b: BizState, stmt: Statement): YearRecord {
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
  b.history = [...b.history, rec].slice(-10)
  return rec
}

/** Stock exchange move for a listed company's market, shared by everything on that exchange. */
export function exchangeMove(g: GameState, countryId: string, year: number): number {
  const ex = exchangeFor(countryId)
  const s = seeded(`${g.lifeId}|bizexchange|${ex.code}|${year}`)
  const z = (s.next() + s.next() + s.next() - 1.5) * 2
  return clampN(ex.drift + ex.volatility * z, -0.6, 1.2)
}

/** Yearly share-price update for a listed company; returns the new market cap. */
export function updateSharePrice(g: GameState, b: BizState, year: number): number {
  if (!b.public || b.sharesOut <= 0) return b.valuation
  const fundamental = valuationOf(b) / b.sharesOut
  const market = exchangeMove(g, b.countryId, year)
  const own = bell(g, -120, 120) / 1000
  const next = 0.5 * b.sharePrice * (1 + market + own) + 0.5 * fundamental * (1 + market * 0.5)
  b.sharePrice = round2(clampN(next, 0.05, 1e7))
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
