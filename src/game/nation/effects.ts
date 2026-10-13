// What a country's laws do, as one pure overlay. The yearly economy transition, the trade network,
// every company's demand and costs (business/dynamics.nationalMarket), personal and corporate
// taxes, prices in the shops and the State of the Nation report all read the same numbers, so the
// report's "what your policies caused" lines are the effects the world actually used.
// Pure: no RNG, no writes. Cached by the policy record's identity (writers replace the root).
import { marketOf, registerPricePolicy, type Industry } from '../data/markets'
import { goodsShare } from '../business/market-trade'
import type { Sector } from '../economy/model'
import { importReliance, initialTrade } from '../economy/trade'
import type { GameState } from '../types'
import {
  BREAK_IMPACT, BUDGET, BUDGET_LINES, DEAL_IMPACT, DEREG_COSTS, DEREG_FINANCE_CREDIT, EXPORT_BAN_IMPACT, GROUP_IDS, LAWS, LEGAL, LEGAL_IDS,
  NATIONALIZED_COSTS, NATIONALIZED_DEMAND, NEW_TAXES, NEW_TAX_IDS, PROTECTION, SANCTION_IMPACT, TARIFF_IMPACT, TAXES, TAX_IDS, TRADE_INPUT_IDS,
  BREAK_RATE, WINDFALL_RATE, budgetAvailable, legalAvailable, newTaxAvailable, taxAvailable,
  type GroupId, type Impact, type PublicLine, type TaxId, type TradeInput,
} from './data'
import { hasPolicy, policyOf, policyState, type CountryPolicy, type Layer } from './state'

export interface Part {
  key: string
  label: string
  growth: number; revenue: number; spending: number; unemployment: number; inflation: number; inequality: number
}
export interface Overlay {
  /** Taxes: government revenue, share of GDP. */
  revenue: number
  /** Extra spending by the economy's budget lines, share of GDP. */
  spend: Record<PublicLine, number>
  growth: number; inflation: number; unemployment: number; inequality: number; confidence: number; credit: number; services: number
  sectors: Partial<Record<Sector, { demand: number; costs: number }>>
  industries: Partial<Record<Industry, { demand: number; costs: number }>>
  groups: Record<GroupId, number>
  /** Debt to write off in this transition (a default) and extra government borrowing cost. */
  writeDown: number
  spread: number
  parts: Part[]
}

/** Yearly impulses fade after the year a measure takes effect; levels last while in force. */
export function impulseFade(age: number): number {
  return age < 1 ? 0 : age === 1 ? 1 : age === 2 ? .6 : age === 3 ? .35 : .15
}
/** Voters get used to a measure: its approval effect settles at a bit over half. */
export function habit(age: number): number {
  return age <= 1 ? 1 : age === 2 ? .85 : age === 3 ? .7 : .55
}
/** Losses sting more than gains. */
const LOSS = 1.25
/** Macro reach of each layer: a city or one region is a small part of the national economy. */
export const REACH = { national: 1, regional: .15, city: .03 } as const

export const RATING_SPREAD: Record<string, number> = { AAA: 0, AA: .002, A: .004, BBB: .008, BB: .015, B: .025, CCC: .04, D: .06 }

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0)

/** Size of a partner economy relative to the biggest (0.05-1), for deals and sanctions. */
export function partnerSize(country: string): number {
  const m = marketOf(country)
  return clamp(Math.sqrt(Math.max(1, m.populationM * m.gdpPerCapita) / 2.7e7), .05, 1)
}

/** Share of a country's imports of an input that come from a partner ('all' = every supplier). */
export function partnerShare(country: string, input: TradeInput, partner: string, year: number): number {
  if (partner === 'all') return 1
  const route = initialTrade(country, year).inputs[input].routes.find(r => r.partner === partner)
  return route ? route.share : .04
}

function empty(): Overlay {
  return { revenue: 0, spend: { education: 0, health: 0, infrastructure: 0, transfers: 0, other: 0 }, growth: 0, inflation: 0, unemployment: 0, inequality: 0, confidence: 0, credit: 0, services: 0,
    sectors: {}, industries: {}, groups: Object.fromEntries(GROUP_IDS.map(id => [id, 0])) as Record<GroupId, number>, writeDown: 0, spread: 0, parts: [] }
}

/** Effective units for revenue (avoidance beyond `soft`) and for harm (escalating beyond `soft`). */
function revenueUnits(v: number, soft: number): number {
  const a = Math.abs(v)
  return Math.sign(v) * (a <= soft || v < 0 ? a : soft + (a - soft) * .5)
}
function harmUnits(v: number, soft: number): number {
  const a = Math.abs(v)
  return Math.sign(v) * (a <= soft ? a : v > 0 ? soft + (a - soft) * 1.6 : soft + (a - soft) * .5)
}

interface Scale { units: number; reach: number; impulse: number; level: number; habit: number; revenueUnits?: number; harmUnits?: number }

function add(o: Overlay, key: string, label: string, imp: Impact, s: Scale): void {
  const u = s.units * s.reach, ru = (s.revenueUnits ?? s.units) * s.reach, hu = (s.harmUnits ?? s.units) * s.reach
  const part: Part = { key, label, growth: 0, revenue: 0, spending: 0, unemployment: 0, inflation: 0, inequality: 0 }
  if (imp.revenue) { o.revenue += imp.revenue * ru * s.level; part.revenue += imp.revenue * ru * s.level }
  if (imp.spend) for (const [line, v] of Object.entries(imp.spend) as [PublicLine, number][]) { o.spend[line] += v * u * s.level; part.spending += v * u * s.level }
  if (imp.growth) { const v = imp.growth * hu * s.impulse; o.growth += v; part.growth += v }
  if (imp.inflation) { const v = imp.inflation * u * s.impulse; o.inflation += v; part.inflation += v }
  if (imp.unemployment) { const v = imp.unemployment * hu * s.impulse; o.unemployment += v; part.unemployment += v }
  if (imp.inequality) { const v = imp.inequality * u * s.impulse; o.inequality += v; part.inequality += v }
  if (imp.confidence) o.confidence += imp.confidence * hu * s.impulse
  if (imp.credit) o.credit += imp.credit * u * s.level
  if (imp.services) o.services += imp.services * u * s.level
  if (imp.sectors) for (const [sector, e] of Object.entries(imp.sectors) as [Sector, { demand?: number; costs?: number }][]) {
    const row = o.sectors[sector] ??= { demand: 0, costs: 0 }
    row.demand += (e.demand ?? 0) * u * s.level; row.costs += (e.costs ?? 0) * u * s.level
  }
  if (imp.industries) for (const [id, e] of Object.entries(imp.industries) as [Industry, { demand?: number; costs?: number }][]) {
    const row = o.industries[id] ??= { demand: 0, costs: 0 }
    row.demand += (e.demand ?? 0) * u * s.level; row.costs += (e.costs ?? 0) * u * s.level
  }
  if (imp.groups) for (const [id, v] of Object.entries(imp.groups) as [GroupId, number][]) {
    const g = v * s.units * s.habit
    o.groups[id] += g < 0 ? g * LOSS : g
  }
  if (part.growth || part.revenue || part.spending || part.unemployment || part.inflation || part.inequality) o.parts.push(part)
}

function sectorAdd(o: Overlay, sector: Sector, demand: number, costs: number): void {
  const row = o.sectors[sector] ??= { demand: 0, costs: 0 }
  row.demand += demand; row.costs += costs
}

const LAYER_NAME = { national: '', regional: 'regional ', city: 'city ' } as const

function addLayer(o: Overlay, p: CountryPolicy, l: Layer, scope: 'national' | 'regional' | 'city', year: number, live: boolean): void {
  const reach = REACH[scope], ages = (key: string) => year - (p.since[`${scope}.${key}`] ?? p.since[key] ?? year - 1)
  const scaleFor = (key: string, units: number, soft = 1e9): Scale => {
    const age = ages(key)
    return { units, reach, impulse: impulseFade(age), level: live ? (age >= 0 ? 1 : 0) : age >= 1 ? 1 : 0, habit: habit(age), revenueUnits: revenueUnits(units, soft), harmUnits: harmUnits(units, soft) }
  }
  for (const id of TAX_IDS) {
    const v = l.taxes[id]
    if (!v || !taxAvailable(id, year)) continue
    const def = TAXES[id]
    add(o, `${scope}.tax.${id}`, `${LAYER_NAME[scope]}${def.label.toLowerCase()} ${v > 0 ? '+' : ''}${v}${def.unit === '%' ? '%' : ' pts'}`, def.impact, scaleFor(`tax.${id}`, v, def.soft))
  }
  for (const id of BUDGET_LINES) {
    const level = l.budget[id]
    if (level === undefined || level === 1 || !budgetAvailable(id, year)) continue
    const def = BUDGET[id], units = level - 1
    const imp: Impact = { ...def.impact, spend: { [def.line]: def.share } }
    add(o, `${scope}.budget.${id}`, `${LAYER_NAME[scope]}${def.label.toLowerCase()} budget ${Math.round(level * 100)}%`, imp, scaleFor(`budget.${id}`, units))
  }
  if (l.minWage) add(o, `${scope}.minWage`, `${LAYER_NAME[scope]}minimum wage ${l.minWage > 0 ? '+' : ''}${l.minWage}%`, LAWS.minWage, scaleFor('minWage', l.minWage / 10))
}

function compute(p: CountryPolicy, year: number, live: boolean): Overlay {
  const o = empty(), c = p.country
  addLayer(o, p, p.national, 'national', year, live)
  addLayer(o, p, p.regional, 'regional', year, live)
  addLayer(o, p, p.city, 'city', year, live)
  const scale = (key: string, units: number): Scale => {
    const age = year - (p.since[key] ?? year - 1)
    return { units, reach: 1, impulse: impulseFade(age), level: live ? (age >= 0 ? 1 : 0) : age >= 1 ? 1 : 0, habit: habit(age) }
  }
  for (const id of NEW_TAX_IDS) {
    const t = p.newTaxes[id]
    if (!t?.level || !newTaxAvailable(id, year)) continue
    const def = NEW_TAXES[id]
    const imp: Impact = def.targeted && t.industry ? { ...def.impact, industries: { [t.industry]: { demand: -.03 } } } : def.impact
    add(o, `newTax.${id}`, `${def.label.toLowerCase()}${t.industry ? ` on ${t.industry}` : ''} (level ${t.level})`, imp, scale(`newTax.${id}`, t.level))
  }
  for (const [industry, level] of Object.entries(p.breaks)) {
    if (level > 0) add(o, `break.${industry}`, `tax break for ${industry}`, { ...BREAK_IMPACT, industries: { [industry]: { demand: .02 } } }, scale(`break.${industry}`, level))
  }
  if (p.labor) add(o, 'labor', `${p.labor > 0 ? 'stronger' : 'weaker'} labor rules`, LAWS.labor, scale('labor', p.labor))
  if (p.environment && year >= 1960) add(o, 'environment', `${p.environment > 0 ? 'stricter' : 'looser'} environmental rules`, LAWS.environment, scale('environment', p.environment))
  for (const [sector, since] of Object.entries(p.dereg) as [Sector, number][]) {
    if (!since) continue
    add(o, `dereg.${sector}`, `deregulated ${sector}`, LAWS.dereg, scale(`dereg.${sector}`, 1))
    if (live || year > since) {
      sectorAdd(o, sector, 0, DEREG_COSTS)
      if (sector === 'finance') o.credit += DEREG_FINANCE_CREDIT
    }
  }
  for (const [sector, since] of Object.entries(p.nationalized) as [Sector, number][]) {
    if (!since) continue
    add(o, `nationalize.${sector}`, `nationalized ${sector}`, LAWS.nationalize, scale(`nationalize.${sector}`, 1))
    if (live || year > since) sectorAdd(o, sector, -(1 - NATIONALIZED_DEMAND), NATIONALIZED_COSTS)
  }
  for (const id of LEGAL_IDS) {
    const v = p.legal[id]
    if (!v || !legalAvailable(id, year)) continue
    const def = LEGAL[id], s = scale(`legal.${id}`, 1)
    // Groups react to the change itself; revenue follows whether the trade is legal now.
    add(o, `legal.${id}`, v > 0 ? def.legalize.toLowerCase() : def.ban.toLowerCase(), { revenue: v > 0 ? def.revenue : -def.revenue * .5, groups: Object.fromEntries(Object.entries(def.groups).map(([k, n]) => [k, n * v])) }, s)
  }
  // Trade.
  for (const rule of p.tariffs) {
    const inputs: TradeInput[] = rule.input === 'all' ? [...TRADE_INPUT_IDS] : [rule.input]
    let weight = 0
    for (const input of inputs) {
      const share = partnerShare(c, input, rule.partner, year) * importReliance(c, input, year)
      weight += share / inputs.length
      if (live || year > (p.since[`tariff.${rule.input}.${rule.partner}`] ?? year - 1)) sectorAdd(o, input as Sector, PROTECTION * rule.add * share, 0)
    }
    if (rule.input === 'all' || rule.input === 'industry' || rule.input === 'technology') sectorAdd(o, 'consumer', 0, .0015 * rule.add * weight)
    add(o, `tariff.${rule.input}.${rule.partner}`, `${rule.add}% tariff on ${rule.input === 'all' ? 'imports' : rule.input}${rule.partner === 'all' ? '' : ` from ${rule.partner.toUpperCase()}`}`, TARIFF_IMPACT, scale(`tariff.${rule.input}.${rule.partner}`, rule.add * weight * 2.2))
  }
  for (const partner of Object.keys(p.deals)) add(o, `deal.${partner}`, `trade deal with ${partner.toUpperCase()}`, DEAL_IMPACT, scale(`deal.${partner}`, partnerSize(partner)))
  for (const partner of Object.keys(p.sanctions)) add(o, `sanction.${partner}`, `sanctions on ${partner.toUpperCase()}`, SANCTION_IMPACT, scale(`sanction.${partner}`, partnerSize(partner)))
  for (const [input, since] of Object.entries(p.exportBans) as [TradeInput, number][]) {
    if (!since) continue
    add(o, `exportBan.${input}`, `export ban on ${input}`, EXPORT_BAN_IMPACT, scale(`exportBan.${input}`, 1))
    if (live || year > since) sectorAdd(o, input as Sector, -.02, -.05)
  }
  for (const r of p.retaliation) {
    if (r.until < year) continue
    const size = partnerSize(r.from), units = r.add * size
    add(o, `retaliation.${r.from}.${r.input}`, `${r.from.toUpperCase()} tariffs on our goods`, { growth: -.00008, groups: { rural: -.06, workers: -.05, business: -.06 } }, scale(`retaliation.${r.from}`, units))
    for (const input of r.input === 'all' ? TRADE_INPUT_IDS : [r.input]) sectorAdd(o, input as Sector, -.002 * units * goodsShareOfSector(input), 0)
  }
  // Crises and one-off shocks run at full strength until they end.
  for (const s of p.shocks) {
    if (s.until < year) continue
    o.growth += s.growth; o.inflation += s.inflation; o.unemployment += s.unemployment; o.confidence += s.confidence
    if (s.sector) sectorAdd(o, s.sector, s.demand, 0)
    if (s.spend) o.spend.other += s.spend
    o.parts.push({ key: `shock.${s.id}`, label: s.label, growth: s.growth, revenue: 0, spending: s.spend ?? 0, unemployment: s.unemployment, inflation: s.inflation, inequality: 0 })
  }
  // Regimes and institutions.
  const inst = p.institutions
  if (inst.regime !== 'democracy') {
    const hard = inst.regime === 'authoritarian' ? 1 : .4
    o.confidence -= .03 * hard; o.credit -= .02 * hard; o.growth -= .002 * hard
    o.parts.push({ key: 'regime', label: inst.regime === 'authoritarian' ? 'rule by decree scares investors' : 'eroding institutions worry investors', growth: -.002 * hard, revenue: 0, spending: 0, unemployment: 0, inflation: 0, inequality: 0 })
  }
  if (inst.emergencyUntil >= year) o.confidence -= .02
  if (p.graft > 0) {
    o.services -= p.graft * 3; o.growth -= p.graft * .5
    o.parts.push({ key: 'graft', label: 'public money lost to graft', growth: -p.graft * .5, revenue: 0, spending: 0, unemployment: 0, inflation: 0, inequality: 0 })
  }
  o.spread = RATING_SPREAD[p.rating] ?? 0
  o.credit -= o.spread * 2
  o.writeDown = p.writeDown
  // Bounds: policy can wreck an economy, but not past what the model can represent.
  o.revenue = clamp(o.revenue, -.12, .15)
  o.growth = clamp(o.growth, -.06, .03); o.inflation = clamp(o.inflation, -.03, .1); o.unemployment = clamp(o.unemployment, -.03, .08)
  o.inequality = clamp(o.inequality, -.03, .03); o.confidence = clamp(o.confidence, -.3, .15); o.credit = clamp(o.credit, -.3, .1); o.services = clamp(o.services, -.35, .25)
  for (const row of Object.values(o.sectors)) { if (row) { row.demand = clamp(row.demand, -.6, .6); row.costs = clamp(row.costs, -.3, .5) } }
  for (const row of Object.values(o.industries)) { if (row) { row.demand = clamp(row.demand, -.6, .6); row.costs = clamp(row.costs, -.3, .5) } }
  for (const id of GROUP_IDS) o.groups[id] = clamp(o.groups[id], -40, 40)
  o.parts.sort((a, b) => Math.abs(b.growth) * 3 + Math.abs(b.revenue) + Math.abs(b.spending) - (Math.abs(a.growth) * 3 + Math.abs(a.revenue) + Math.abs(a.spending)))
  return o
}

function goodsShareOfSector(input: TradeInput): number {
  return input === 'energy' ? .7 : input === 'technology' ? .6 : 1
}

/** The overlay of a hypothetical record (previews: before vs after a bill). Uncached. */
export function overlayFor(p: CountryPolicy, year: number, live = false): Overlay {
  return compute(p, year, live)
}

const cache = new WeakMap<object, Map<string, Overlay>>()
/**
 * The overlay for a country in a year. `live` (businesses, taxes, menus in the current year) counts
 * measures from the year they pass; the economy transition (`live` false) counts them from the
 * year after, like the economy's own policies. Null when the country has no laws of its own.
 */
export function nationOverlay(g: GameState, country: string, year: number, live = true): Overlay | null {
  if (!hasPolicy(g, country)) return null
  const root = policyState(g)
  let byKey = cache.get(root)
  if (!byKey) { byKey = new Map(); cache.set(root, byKey) }
  const key = `${country}:${year}:${live ? 1 : 0}`
  let hit = byKey.get(key)
  if (!hit) {
    hit = compute(policyOf(g, country), year, live)
    if (byKey.size > 64) byKey.clear()
    byKey.set(key, hit)
  }
  return hit
}

/** Demand and cost multipliers for one industry's companies in a country (1 = no policy). */
export function policyMarket(g: GameState, industry: string, country: string, year: number, sector: Sector): { demand: number; costs: number } {
  const o = nationOverlay(g, country, year)
  if (!o) return NEUTRAL
  const s = o.sectors[sector], i = o.industries[industry as Industry]
  let demand = 1 + (s?.demand ?? 0) + (i?.demand ?? 0)
  const costs = 1 + (s?.costs ?? 0) + (i?.costs ?? 0)
  // Protection helps only what crosses borders: scale the protected sector's lift by goods.
  if (s && s.demand > 0 && ['essentials', 'energy', 'industry', 'technology'].includes(sector)) demand = 1 + s.demand * Math.min(1, goodsShare(industry) * 1.4) + (i?.demand ?? 0)
  // A ban leaves only a sliver of (grey-market) trade for anyone still open.
  if (legalOverride(g, country, industry, year) === false) return { demand: .05, costs: clamp(costs, .6, 1.6) }
  return { demand: clamp(demand, .3, 1.8), costs: clamp(costs, .6, 1.6) }
}
const NEUTRAL = { demand: 1, costs: 1 }

// ---------------------------------------------------------------------------
// Taxes as rates (personal and corporate). These are what the settlement code adds to its own.

/** The player's personal tax change in points (or % of value), all layers where they live. */
export function personalTax(g: GameState, id: TaxId, country = g.character.countryId): number {
  if (!hasPolicy(g, country) || !taxAvailable(id, g.year)) return 0
  const p = policyOf(g, country)
  let v = p.national.taxes[id] ?? 0
  if (country === g.character.countryId) {
    if (p.regional.place) v += p.regional.taxes[id] ?? 0
    if (p.city.place && p.city.place === g.character.city) v += p.city.taxes[id] ?? 0
  }
  return v
}

/** Extra corporate tax rate (0.05 = +5 points) for an industry in a country, incl. windfall and breaks. */
export function corporateDelta(g: GameState, country: string, industry = '', year = g.year): number {
  if (!hasPolicy(g, country)) return 0
  const p = policyOf(g, country)
  let v = (p.national.taxes.corporate ?? 0) / 100
  const w = p.newTaxes.windfall
  if (industry && w?.level && w.industry === industry && newTaxAvailable('windfall', year)) v += WINDFALL_RATE * w.level
  if (industry && p.breaks[industry]) v -= BREAK_RATE * p.breaks[industry]
  return v
}

/** Wealth tax rate (share of net worth a year) where the player lives. */
export function wealthTaxRate(g: GameState): number {
  return Math.max(0, personalTax(g, 'wealth')) / 100
}

/** Luxury tax level (0-3) where the player lives. */
export function luxuryLevel(g: GameState): number {
  if (!hasPolicy(g, g.character.countryId) || !newTaxAvailable('luxury', g.year)) return 0
  return policyOf(g, g.character.countryId).newTaxes.luxury?.level ?? 0
}

/** Local shop prices: a sales tax change and tariffs on imported goods pass through. */
export function priceFactor(g: GameState, category: string): number {
  const c = g.character.countryId
  if (!hasPolicy(g, c)) return 1
  const sales = personalTax(g, 'sales') / 100
  const p = policyOf(g, c)
  let tariff = 0
  const goodsInput: Record<string, TradeInput> = { car: 'industry', electronics: 'technology', fuel: 'energy', food: 'essentials', alcohol: 'essentials', luxury: 'industry' }
  const input = goodsInput[category]
  if (input) for (const rule of p.tariffs) {
    if (rule.input !== 'all' && rule.input !== input) continue
    tariff += rule.add / 100 * partnerShare(c, input, rule.partner, g.year) * importReliance(c, input, g.year) * .8
  }
  const sugar = category === 'food' && newTaxAvailable('sugar', g.year) ? (p.newTaxes.sugar?.level ?? 0) * .01 : 0
  const carbon = category === 'fuel' && newTaxAvailable('carbon', g.year) ? (p.newTaxes.carbon?.level ?? 0) * .06 : 0
  return clamp(1 + sales + tariff + sugar + carbon, .7, 2)
}


/** Is an industry legal in a country once its laws are counted? `base` is the country's own rule. */
export function legalOverride(g: GameState, country: string, industry: string, year = g.year): boolean | null {
  if (!hasPolicy(g, country)) return null
  const p = policyOf(g, country)
  for (const id of LEGAL_IDS) {
    const v = p.legal[id]
    if (!v || !legalAvailable(id, year) || !(LEGAL[id].industries as string[]).includes(industry)) continue
    // +1 makes the trade legal, -1 bans it (for alcohol, -1 is prohibition).
    return v > 0
  }
  return null
}

registerPricePolicy(priceFactor, (g) => personalTax(g, 'sales') / 100, legalOverride)
