// Local markets: what doing business and shopping is like in each country.
//
// Every country in world.ts has a MarketProfile (data/markets/*.ts, one file per region) with
// real-world-ish figures: taxes, wages, rents, interest rates, how easy it is to register a
// company, corruption, the local stock exchange, which industries are in demand (or illegal)
// and how local taxes/duties move shop prices. Businesses (business.ts), investments
// (investments.ts) and stores (assets.ts, shops/*) read it through the helpers below.
//
// Figures are rounded approximations of mid-2020s values, tuned for gameplay; they are flavor,
// not financial data. Money is in US dollars like the rest of the game.
import { getCountry } from '../world'
import type { GameState } from '../types'
import { AFRICA_MIDDLE_EAST_MARKETS } from './markets/africaMiddleEast'
import { AMERICAS_MARKETS } from './markets/americas'
import { ASIA_OCEANIA_MARKETS } from './markets/asiaOceania'
import { EUROPE_MARKETS } from './markets/europe'

/** The industries you can start a business in: BitLife's 25 plus 8 deep-tech ones. */
export const INDUSTRY_IDS = [
  'foodTruck',
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'brewery',
  'grocery',
  'fashion',
  'beauty',
  'salon',
  'gym',
  'autoShop',
  'construction',
  'realEstate',
  'software',
  'gameStudio',
  'ecommerce',
  'marketing',
  'clinic',
  'hotel',
  'logistics',
  'manufacturing',
  'farm',
  'energy',
  'entertainment',
  // Deep tech (business/deeptech*.ts): R&D, funding rounds, breakthroughs and big exits.
  'semiconductor',
  'aiLab',
  'robotics',
  'biotech',
  'spaceTech',
  'electricVehicles',
  'quantum',
  'cybersecurity',
] as const

/** The deep-tech industries (a subset of INDUSTRY_IDS with their own simulation layer). */
export const DEEP_TECH_IDS = ['semiconductor', 'aiLab', 'robotics', 'biotech', 'spaceTech', 'electricVehicles', 'quantum', 'cybersecurity'] as const

export type Industry = (typeof INDUSTRY_IDS)[number]

/** Shop categories whose local price differs from the global baseline (taxes, import duties...). */
export type PriceCategory = 'car' | 'electronics' | 'luxury' | 'alcohol' | 'food' | 'fuel'

export interface StockExchange {
  /** e.g. 'Tokyo Stock Exchange'. */
  name: string
  /** Short code shown on tickers, e.g. 'TSE'. */
  code: string
  /** Headline index, e.g. 'Nikkei 225'. */
  index: string
  /** Yearly volatility of the index, 0.1 (calm) - 0.6 (wild). */
  volatility: number
  /** Long-run yearly return of the index (nominal), e.g. 0.07. */
  drift: number
}

export interface MarketProfile {
  /** Lowercase ISO alpha-2 code, same as world.ts. */
  countryId: string
  /** Local currency, e.g. 'Japanese yen'. Flavor only: game money stays in dollars. */
  currencyName: string
  /** ISO 4217 code, e.g. 'JPY'. */
  currencyCode: string
  /** GDP per person in US dollars. */
  gdpPerCapita: number
  /** Population in millions (market size). */
  populationM: number
  /** Headline corporate income tax rate, 0-1. */
  corporateTax: number
  /** Consumption tax rate (VAT/GST/sales tax), 0-1. */
  salesTax: number
  /** What locals call it: 'VAT', 'GST', 'Sales tax', 'IVA', 'TVA', 'MwSt', 'Consumption tax'... */
  salesTaxName: string
  /** Legal minimum wage for a full-time year, in dollars (0 if none). */
  minWage: number
  /**
   * Typical cost of an employee relative to the US (1). Keep it close to world.ts `wealth`
   * (the game pays salaries as US salary x wealth), e.g. within about ±35% of it.
   */
  laborCost: number
  /** Commercial rent relative to the US average (1). Big expensive cities push it up. */
  rentCost: number
  /** Central bank policy rate, 0-1 (bonds, savings and business loans key off it). */
  interestRate: number
  /** Typical yearly inflation, 0-1. Hyperinflation economies can exceed 1. */
  inflation: number
  /** How easy it is to start and run a company, 0-100 (permits, bureaucracy, courts). */
  easeOfBusiness: number
  /** Perceived public-sector corruption, 0 (clean) - 100 (rampant): inspectors expecting bribes. */
  corruption: number
  /** Days to register a company. */
  startupDays: number
  /** Registration fees + licences + notary for a small company, in dollars. */
  startupFee: number
  /** Local stock exchange (null when there is no meaningful one; investments use a regional one). */
  exchange: StockExchange | null
  /**
   * Demand for each industry relative to a typical market (1). Missing industries count as 1.
   * e.g. tourism-heavy islands: hotel 2.2; oil states: energy 2.5; tech hubs: software 1.8.
   */
  demand: Partial<Record<Industry, number>>
  /** Industries that are illegal or effectively impossible to run here (e.g. alcohol). */
  banned: Industry[]
  /**
   * What the same item really costs here in US dollars, relative to its US price (1), with local
   * taxes and import duties included; missing = 1. Absolute, NOT relative to wealth: an iPhone
   * that costs $1,500 in Brazil vs $1,000 in the US → electronics 1.5; Singapore's COE makes a
   * car cost ~2.5-3x → car 2.8; Venezuelan petrol is nearly free → fuel 0.05. For food and
   * alcohol it is a typical grocery basket / a beer vs the US.
   */
  priceMult: Partial<Record<PriceCategory, number>>
  /** One short sentence about doing business here, shown in business menus. */
  businessNote: string
  /** Words that make company names sound local, e.g. ['Sakura', 'Fuji', 'Nippon', 'Yamato']. */
  nameWords: string[]
}

const ALL: Record<string, MarketProfile> = {
  ...AMERICAS_MARKETS,
  ...EUROPE_MARKETS,
  ...AFRICA_MIDDLE_EAST_MARKETS,
  ...ASIA_OCEANIA_MARKETS,
}

/** Rough profile for a country with no data (e.g. one added to world.ts later). */
function derivedProfile(countryId: string): MarketProfile {
  const c = getCountry(countryId)
  const w = Math.max(0.05, c.wealth ?? 1)
  return {
    countryId,
    currencyName: c.currency === '€' ? 'Euro' : c.currency === '£' ? 'Pound sterling' : 'Local currency',
    currencyCode: c.currency === '€' ? 'EUR' : c.currency === '£' ? 'GBP' : 'USD',
    gdpPerCapita: Math.round(70_000 * w),
    populationM: 10,
    corporateTax: 0.25,
    salesTax: 0.12,
    salesTaxName: 'Sales tax',
    minWage: Math.round(15_000 * w),
    laborCost: Math.max(0.05, w),
    rentCost: Math.max(0.1, w),
    interestRate: 0.05,
    inflation: w > 0.6 ? 0.03 : 0.08,
    easeOfBusiness: Math.round(40 + 40 * Math.min(1, w)),
    corruption: Math.round(70 - 50 * Math.min(1, w)),
    startupDays: w > 0.6 ? 7 : 30,
    startupFee: Math.round(500 + 1_500 * w),
    exchange: null,
    demand: {},
    banned: [],
    priceMult: {},
    businessNote: `Doing business in ${c.name} is about what you'd expect.`,
    nameWords: [],
  }
}

/** The market profile for a country (always defined). */
export function marketOf(countryId: string): MarketProfile {
  return ALL[countryId] ?? derivedProfile(countryId)
}

/** The market where the player lives now. */
export function localMarket(g: GameState): MarketProfile {
  return marketOf(g.character.countryId)
}

/** True when the country has hand-written market data (tests use this). */
export function hasMarketData(countryId: string): boolean {
  return countryId in ALL
}

/** Demand multiplier for an industry in a country (0 when it is banned there). */
export function industryDemand(countryId: string, industry: Industry): number {
  const m = marketOf(countryId)
  if (m.banned.includes(industry)) return 0
  const d = m.demand[industry]
  if (d !== undefined) return d
  // Deep tech needs capital, talent and customers that poorer markets lack: without hand-written
  // data, scale it by income (a rich country without a tech scene still beats a poor one).
  if ((DEEP_TECH_IDS as readonly string[]).includes(industry)) return Math.max(0.25, Math.min(1, m.gdpPerCapita / 60_000))
  return 1
}

export function isIndustryLegal(countryId: string, industry: Industry): boolean {
  return !marketOf(countryId).banned.includes(industry)
}

/** Local price multiplier for a shop category in the player's country (1 = global baseline). */
export function localPriceMult(g: GameState, category: PriceCategory): number {
  return localMarket(g).priceMult[category] ?? 1
}

/** Consumption tax rate where the player lives. */
export function salesTaxRate(g: GameState): number {
  return localMarket(g).salesTax
}

/** Corporate tax owed on a year's profit in a country (losses pay nothing). */
export function corporateTax(countryId: string, profit: number): number {
  if (profit <= 0) return 0
  return Math.round(profit * marketOf(countryId).corporateTax)
}

/**
 * The exchange investments trade on: the local one, or the nearest big regional one when the
 * country has none (e.g. Samoa → ASX, Andorra → Euronext).
 */
export function exchangeFor(countryId: string): StockExchange {
  const own = marketOf(countryId).exchange
  if (own) return own
  const continent = getCountry(countryId).continent
  const fallbackId: Record<string, string> = {
    'North America': 'us',
    'South America': 'br',
    Europe: 'fr',
    Africa: 'za',
    'Middle East': 'ae',
    Asia: 'sg',
    Oceania: 'au',
  }
  return marketOf(fallbackId[continent] ?? 'us').exchange ?? DEFAULT_EXCHANGE
}

const DEFAULT_EXCHANGE: StockExchange = { name: 'New York Stock Exchange', code: 'NYSE', index: 'S&P 500', volatility: 0.18, drift: 0.08 }
