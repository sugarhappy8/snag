// Durable aggregates, not simulated individual transactions. All quantities are real indices,
// rates, or GDP shares; the only nominal index is priceScale (relative to currency display).
import { marketOf } from '../data/markets'
import { currencyInflation } from '../data/currencies'
import { historicalCycle, historicalHousing, historicalPolicyRate } from '../history/markets'
import { COUNTRIES } from '../world'
import { compactCohorts, initialCohorts, normalizeCohorts, type Cohorts } from './cohorts'
import type { GameState, Json } from '../types'
import { compactTrade, initialTrade, normalizeTrade, type CountryTrade } from './trade'
import { normalizeRivals, type RivalActor } from './actors-state'
import { initialBudget, normalizeBudget, type GovernmentBudget } from './government'

export const ECONOMY_KEY = 'worldEconomy'
export const ECONOMY_VERSION = 2
export const SECTORS = ['essentials', 'consumer', 'leisure', 'housing', 'finance', 'industry', 'energy', 'logistics', 'technology', 'care', 'public'] as const
export type Sector = typeof SECTORS[number]
export interface SectorState {
  demand: number; capacity: number; costs: number; productivity: number
  competition: number; adoption: number; disruption: number
  /** Delivered critical inputs / annual requirements; aggregate buffers are not company assets. */
  availability: number; stock: number; backlog: number; output: number; workforce: number
}
export interface EconomyPoint { year: number; growth: number; unemployment: number; inflation: number; rate: number; housing: number; market: number; priceScale: number }
export interface CountryEconomy {
  year: number; outputGap: number; growth: number; inflation: number; rate: number
  unemployment: number; wages: number; productivity: number; skills: number
  confidence: number; spending: number; saving: number; credit: number; liquidity: number; bankStress: number
  defaults: number; privateDebt: number; governmentDebt: number; fiscal: number; taxShift: number
  services: number; inequality: number; mobility: number; population: number; elderly: number
  trade: number; currency: number; supply: number; housing: number; rent: number; housingReturn: number
  bubble: number; market: number; priceScale: number; sectors: Record<Sector, SectorState>
  tradeNetwork: CountryTrade
  cohorts: Cohorts
  budget: GovernmentBudget
  causes: string[]
}
export interface EconomyFeedback {
  country: string; sector: Sector; jobs: number; investment: number; failure: number; innovation: number
  /** Actual settled bank outcomes, scaled to GDP; principal never becomes revenue. */
  bankLoss?: number; bankRun?: number; bankLending?: number
}
export interface EconomicPolicy { id: string; country: string; year: number; until: number; kind: 'investment' | 'education' | 'health' | 'taxCut' | 'taxRise' | 'regulation'; scale: number }
export interface EconomyState {
  v: number; year: number; countries: Record<string, CountryEconomy>
  previous: Record<string, CountryEconomy>; history: Record<string, EconomyPoint[]>
  pending: EconomyFeedback[]; policies: EconomicPolicy[]; receipts: string[]
  rivals: RivalActor[]; previousRivals: RivalActor[]
}
export const bound = (n: number, lo: number, hi: number): number => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const numeric = (v: unknown, fallback: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? bound(v, lo, hi) : fallback
const validCountries = new Set(COUNTRIES.map(c => c.id))

// Memo of a pure string classification (sectorOf runs for every outlet of every plan trial).
const sectorMemo = new Map<string, Sector>()
export function sectorOf(industry: string): Sector {
  const known = sectorMemo.get(industry)
  if (known) return known
  const sector = classifySector(industry)
  if (sectorMemo.size < 4096) sectorMemo.set(industry, sector)
  return sector
}
function classifySector(industry: string): Sector {
  if (/^(foodTruck|restaurant|cafe|bakery|grocery|farm|agriculture|food|supermarkets)$/.test(industry)) return 'essentials'
  if (/^(construction|realEstate|property|housing)$/.test(industry)) return 'housing'
  if (/bank|Bank|investment|finance|insurance|account/.test(industry)) return 'finance'
  if (/energy|solar|battery|water|recycling|oil|utilities|fusion|carbonCapture/.test(industry)) return 'energy'
  if (/logistics|transport|trucking|shipping|airline|travel/.test(industry)) return 'logistics'
  if (/software|gameStudio|semiconductor|aiLab|quantum|cybersecurity|drones|telecom|dataCenter|tech|comput/.test(industry)) return 'technology'
  if (/clinic|biotech|neurotech|health|homeCare|medical|pharma/.test(industry)) return 'care'
  if (/education|government|public|military|legal|law|police/.test(industry)) return 'public'
  if (/manufactur|robot|electricVehicles|spaceTech|packaging|furniture|auto|industrial|materials/.test(industry)) return 'industry'
  if (/hotel|casino|nightclub|stripClub|bar|brewery|entertainment|media|sport|arts|music/.test(industry)) return 'leisure'
  return 'consumer'
}

export const SECTOR_RULES: Record<Sector, { label: string; cycle: number; credit: number; imports: number; automation: number; inputs: Partial<Record<Sector, number>> }> = {
  essentials: { label: 'Food & essentials', cycle: .25, credit: .2, imports: .3, automation: .4, inputs: { energy: .25, logistics: .25, industry: .1 } },
  consumer: { label: 'Shops & services', cycle: .9, credit: .55, imports: .5, automation: .45, inputs: { industry: .3, logistics: .25, energy: .1 } },
  leisure: { label: 'Leisure & creative work', cycle: 1.5, credit: .3, imports: .2, automation: .2, inputs: { essentials: .2, energy: .1, technology: .1 } },
  housing: { label: 'Housing & construction', cycle: 1.2, credit: 1.5, imports: .35, automation: .3, inputs: { industry: .4, energy: .15, logistics: .15 } },
  finance: { label: 'Banking & finance', cycle: 1.1, credit: 1.2, imports: .15, automation: .7, inputs: { technology: .25, public: .1 } },
  industry: { label: 'Manufacturing', cycle: 1.1, credit: .8, imports: .7, automation: 1, inputs: { energy: .35, logistics: .2, technology: .15 } },
  energy: { label: 'Energy & resources', cycle: .6, credit: .8, imports: .65, automation: .6, inputs: { industry: .25, logistics: .2 } },
  logistics: { label: 'Transport & trade', cycle: .9, credit: .6, imports: .6, automation: .8, inputs: { energy: .4, industry: .15 } },
  technology: { label: 'Technology', cycle: 1.1, credit: .9, imports: .55, automation: .6, inputs: { energy: .15, industry: .2, public: .2 } },
  care: { label: 'Health & care', cycle: .15, credit: .2, imports: .25, automation: .2, inputs: { technology: .2, industry: .1, public: .2 } },
  public: { label: 'Education & public services', cycle: .1, credit: .1, imports: .1, automation: .25, inputs: { technology: .15, energy: .1 } },
}

export const STOCK_SECTORS: readonly Sector[] = ['essentials', 'consumer', 'housing', 'industry', 'energy', 'technology']

export function initialCountry(country: string, year: number): CountryEconomy {
  const m = marketOf(country)
  const cycle = historicalCycle(country, year, 1)
  const unemployment = bound(.055 + (65 - m.easeOfBusiness) * .0006 + Math.max(0, 1 - cycle) * .22, .03, .2)
  return { year, outputGap: bound((cycle - 1) * .5, -.25, .2), growth: bound(.02 + (cycle - 1) * .3, -.15, .1),
    inflation: currencyInflation(country, year), rate: historicalPolicyRate(country, year) ?? m.interestRate,
    unemployment, wages: 1, productivity: 1, skills: bound(.55 + m.gdpPerCapita / 240000, .5, .9),
    confidence: 1, spending: 1, saving: .15, credit: 1, liquidity: .28, bankStress: 0, defaults: .025,
    privateDebt: .8, governmentDebt: .6, fiscal: 0, taxShift: 0, services: 1,
    inequality: bound(.38 + m.corruption / 700, .3, .55), mobility: .5, population: 1, elderly: .17,
    trade: 1, currency: 1, supply: 0, housing: 1, rent: 1, housingReturn: historicalHousing(country, year) ?? 0,
    bubble: 0, market: 1, priceScale: 1,
    sectors: Object.fromEntries(SECTORS.map(s => [s, { demand: 1, capacity: 1, costs: 1, productivity: 1, competition: .55, adoption: 0, disruption: 0,
      availability: 1, stock: STOCK_SECTORS.includes(s) ? .12 : 0, backlog: 0, output: 1, workforce: 1 }])) as Record<Sector, SectorState>,
    tradeNetwork: initialTrade(country, year),
    cohorts: initialCohorts(bound(.55 + m.gdpPerCapita / 240000, .5, .9), bound(.38 + m.corruption / 700, .3, .55), unemployment, .17),
    budget: initialBudget(country, year),
    causes: [],
  }
}

const RANGES: Partial<Record<keyof CountryEconomy, [number, number]>> = {
  // Historical hyperinflation-era nominal rates and housing crashes must survive a
  // reload unchanged. Procedural years use much tighter bounds in simulation.ts.
  year: [1900, 100000], outputGap: [-.35, .25], growth: [-.2, .16], inflation: [-.5, 1e7], rate: [-.1, 1e5], unemployment: [.015, .4],
  wages: [.5, 3], productivity: [.6, 4], skills: [.2, 1], confidence: [.2, 1.5], spending: [.45, 1.6], saving: [.03, .5], credit: [.2, 1.5], liquidity: [.05, .65], defaults: [.002, .3],
  bankStress: [0, 1], privateDebt: [.1, 2.5], governmentDebt: [0, 2.5], fiscal: [-.08, .1], taxShift: [-.06, .08], services: [.45, 1.5], inequality: [.2, .7], mobility: [.1, .9], population: [.5, 2.5], elderly: [.08, .4],
  trade: [.4, 1.5], currency: [.5, 1.8], supply: [0, .65], housing: [.4, 4], rent: [.5, 3], housingReturn: [-.95, 5], bubble: [0, .7], market: [.12, 8], priceScale: [1e-6, 1e6],
}

export function normalizeCountry(value: unknown, country: string, year: number): CountryEconomy {
  const raw = record(value), out = initialCountry(country, year)
  for (const [key, limits] of Object.entries(RANGES)) {
    const k = key as keyof CountryEconomy
    ;(out as unknown as Record<string, unknown>)[key] = numeric(raw[key], out[k] as number, limits[0], limits[1])
  }
  out.year = Math.floor(out.year)
  out.tradeNetwork = normalizeTrade(raw.tradeNetwork, country, out.year)
  out.cohorts = normalizeCohorts(raw.cohorts, initialCohorts(out.skills, out.inequality, out.unemployment, out.elderly))
  out.budget = normalizeBudget(raw.budget, country, out.year, out.governmentDebt)
  const sectors = record(raw.sectors)
  for (const s of SECTORS) {
    const row = record(sectors[s])
    out.sectors[s] = { demand: numeric(row.demand, 1, .25, 2), capacity: numeric(row.capacity, 1, .35, 2.5), costs: numeric(row.costs, 1, .4, 2.5),
      productivity: numeric(row.productivity, 1, .65, 3), competition: numeric(row.competition, .55, .15, .95), adoption: numeric(row.adoption, 0, 0, 1), disruption: numeric(row.disruption, 0, 0, .7),
      availability: numeric(row.availability, 1, .15, 1), stock: STOCK_SECTORS.includes(s) ? numeric(row.stock, .12, 0, .8) : 0,
      backlog: numeric(row.backlog, 0, 0, 1.5), output: numeric(row.output, 1, 0, 2.5), workforce: numeric(row.workforce, 1, .35, 1.15) }
  }
  out.causes = Array.isArray(raw.causes) ? raw.causes.filter((x): x is string => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 160)) : []
  return out
}

const cache = new WeakMap<object, EconomyState>()
export function economyState(g: GameState): EconomyState | null {
  const raw = g.flags[ECONOMY_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = record(raw)
  if ((r.v !== 1 && r.v !== ECONOMY_VERSION) || typeof r.year !== 'number' || !Number.isFinite(r.year) || r.year > g.year) return null
  const hit = cache.get(raw)
  if (hit) return hit
  // Writers replace the root, so validate imported country keys once, not on every
  // wage, price, credit or menu read during the same economic year.
  if (!Object.keys(record(r.countries)).some(id => validCountries.has(id))) return null
  const year = Math.floor(numeric(r.year, g.year, 1900, 100000))
  const out: EconomyState = { v: ECONOMY_VERSION, year, countries: {}, previous: {}, history: {}, pending: [], policies: [], receipts: [], rivals: normalizeRivals(r.rivals, year), previousRivals: normalizeRivals(r.previousRivals, year - 1) }
  for (const [id, row] of Object.entries(record(r.countries))) if (validCountries.has(id)) out.countries[id] = normalizeCountry(row, id, year)
  for (const [id, row] of Object.entries(record(r.previous))) if (validCountries.has(id)) out.previous[id] = normalizeCountry(row, id, year - 1)
  for (const [id, rows] of Object.entries(record(r.history))) if (validCountries.has(id) && Array.isArray(rows)) {
    out.history[id] = rows.slice(-32).map(record).filter(p => typeof p.year === 'number' && Number.isFinite(p.year)).map(p => ({ year: numeric(p.year, year, 1900, 100000), growth: numeric(p.growth, .02, -.2, .16), unemployment: numeric(p.unemployment, .06, .015, .4), inflation: numeric(p.inflation, .025, -.5, 1e7), rate: numeric(p.rate, .04, -.1, 1e5), housing: numeric(p.housing, 1, .4, 4), market: numeric(p.market, 1, .12, 8), priceScale: numeric(p.priceScale, 1, 1e-6, 1e6) }))
  }
  // Signed jobs/lending retain gross accumulated changes across midyear reloads;
  // annual simulation nets them and applies the much tighter national effect caps.
  if (Array.isArray(r.pending)) out.pending = r.pending.slice(-2200).map(record).filter(p => typeof p.country === 'string' && validCountries.has(p.country) && SECTORS.includes(p.sector as Sector)).map(p => ({ country: String(p.country), sector: p.sector as Sector, jobs: numeric(p.jobs, 0, -3000, 3000), investment: numeric(p.investment, 0, 0, .08), failure: numeric(p.failure, 0, 0, .12), innovation: numeric(p.innovation, 0, 0, .5),
    ...(p.bankLoss !== undefined || p.bankRun !== undefined || p.bankLending !== undefined ? { bankLoss: numeric(p.bankLoss, 0, 0, .2), bankRun: numeric(p.bankRun, 0, 0, .3), bankLending: numeric(p.bankLending, 0, -3000, 3000) } : {}) }))
  if (Array.isArray(r.policies)) out.policies = r.policies.slice(-500).map(record).filter(p => typeof p.id === 'string' && validCountries.has(String(p.country)) && ['investment', 'education', 'health', 'taxCut', 'taxRise', 'regulation'].includes(String(p.kind))).map(p => ({ id: String(p.id).slice(0, 180), country: String(p.country), year: numeric(p.year, year, 1900, 100000), until: numeric(p.until, year, 1900, 100000), kind: p.kind as EconomicPolicy['kind'], scale: numeric(p.scale, 0, 0, 1) }))
  if (Array.isArray(r.receipts)) out.receipts = r.receipts.filter((x): x is string => typeof x === 'string').slice(-3000)
  cache.set(raw, out)
  return out
}

/** Writers always replace the root. Returned views must not be mutated by consumers. */
export function storeEconomy(g: GameState, state: EconomyState): void {
  g.flags[ECONOMY_KEY] = state as unknown as Json
  cache.set(state, state)
}
const baselines = new Map<string, CountryEconomy>()
export function economyOf(g: GameState, country = g.character.countryId, year = g.year): CountryEconomy {
  const state = economyState(g)
  if (state?.countries[country]?.year === year) return state.countries[country]
  if (state?.previous[country]?.year === year) return state.previous[country]
  const key = `${country}:${year}`
  let baseline = baselines.get(key)
  if (!baseline) {
    baseline = initialCountry(country, year)
    if (baselines.size >= 512) baselines.delete(baselines.keys().next().value!)
    baselines.set(key, baseline)
  }
  return baseline
}
export function pointOf(e: CountryEconomy): EconomyPoint { return { year: e.year, growth: e.growth, unemployment: e.unemployment, inflation: e.inflation, rate: e.rate, housing: e.housing, market: e.market, priceScale: e.priceScale } }

/** Six decimal places exceed gameplay precision and avoid storing floating-point noise
 * in hundreds of aggregates every year. Keep small nominal scales at ten significant digits. */
export function compactCountry(e: CountryEconomy): CountryEconomy {
  for (const key of Object.keys(RANGES) as (keyof CountryEconomy)[]) {
    const value = e[key]
    if (typeof value === 'number') (e as unknown as Record<string, unknown>)[key] = (key === 'priceScale' ? Number(value.toPrecision(10)) : Math.round(value * 1e6) / 1e6) || 0
  }
  for (const sector of SECTORS) for (const key of Object.keys(e.sectors[sector]) as (keyof SectorState)[]) e.sectors[sector][key] = Math.round(e.sectors[sector][key] * 1e6) / 1e6
  compactCohorts(e.cohorts)
  compactTrade(e.tradeNetwork)
  return e
}

/** Stable, small uncertainty around economic causes. It never consumes the player's RNG. */
export function economicRoll(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
