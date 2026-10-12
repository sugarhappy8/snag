// The calendar: what year it is in the world, what things cost back then and which inventions
// exist yet. A life can start in any year from 1900; everything up to PRESENT_YEAR follows real
// history (prices, technology, markets, world events), and later years are the procedural future.
//
// Money inside the engine is always in constant PRESENT_YEAR US dollars. priceLevel() turns that
// into the money of another year (core.ts money display uses it when "prices as they were" is on).
// Technology spreads by country: rich countries adopt first, poorer ones years later
// (techAdoption). Use hasTech(g, id) to gate features (no smartphones in 1995) and techOdds for
// "did the family have one" rolls (a home computer in 1985 was rare).
import type { GameState } from '../types'
import { getCountry } from '../world'

/** The "today" of the game world: history up to here is real, later years are the future. */
export const PRESENT_YEAR = 2026
/** The earliest birth year the New Life screen offers. */
export const HISTORY_START = 1900

// US consumer price index (annual averages, rounded). Interpolated geometrically between anchors.
const CPI: readonly [number, number][] = [
  [1900, 8.3], [1905, 8.6], [1910, 9.1], [1913, 9.9], [1915, 10.1], [1917, 12.8], [1918, 15.1], [1920, 20.0],
  [1921, 17.9], [1922, 16.8], [1925, 17.5], [1929, 17.1], [1930, 16.7], [1932, 13.7], [1933, 13.0], [1937, 14.4],
  [1940, 14.0], [1942, 16.3], [1945, 18.0], [1947, 22.3], [1948, 24.1], [1950, 24.1], [1951, 26.0], [1955, 26.8],
  [1960, 29.6], [1965, 31.5], [1968, 34.8], [1970, 38.8], [1973, 44.4], [1974, 49.3], [1975, 53.8], [1977, 60.6],
  [1978, 65.2], [1979, 72.6], [1980, 82.4], [1981, 90.9], [1982, 96.5], [1985, 107.6], [1988, 118.3], [1990, 130.7],
  [1992, 140.3], [1995, 152.4], [1998, 163.0], [2000, 172.2], [2002, 179.9], [2005, 195.3], [2007, 207.3], [2008, 215.3],
  [2009, 214.5], [2010, 218.1], [2012, 229.6], [2015, 237.0], [2018, 251.1], [2020, 258.8], [2021, 271.0],
  [2022, 292.7], [2023, 304.7], [2024, 313.7], [2025, 322.0], [2026, 330.0],
]

/** Assumed yearly inflation after PRESENT_YEAR (the future). */
export const FUTURE_INFLATION = 0.025

/** Keep malformed save years finite without letting exponential future CPI overflow. */
function calendarYear(year: number): number {
  return Number.isFinite(year) ? Math.max(-10_000, Math.min(10_000, year)) : PRESENT_YEAR
}

/** Whole calendar years only (at most 20,001 entries): the yearly world economy asks millions of times. */
const cpiMemo = new Map<number, number>()
function cpi(year: number): number {
  year = calendarYear(year)
  const hit = cpiMemo.get(year)
  if (hit !== undefined) return hit
  const value = cpiAt(year)
  if (Number.isInteger(year)) cpiMemo.set(year, value)
  return value
}

function cpiAt(year: number): number {
  const first = CPI[0]
  const last = CPI[CPI.length - 1]
  if (year <= first[0]) return first[1]
  if (year >= last[0]) return last[1] * Math.pow(1 + FUTURE_INFLATION, year - last[0])
  for (let i = 1; i < CPI.length; i++) {
    const [y1, v1] = CPI[i]
    if (year <= y1) {
      const [y0, v0] = CPI[i - 1]
      const t = (year - y0) / (y1 - y0)
      return v0 * Math.pow(v1 / v0, t)
    }
  }
  return last[1]
}

/**
 * What one PRESENT_YEAR dollar was (or will be) worth in `year`'s US dollars: 1980 → about 0.25
 * (a $40K salary today was about $10K then), PRESENT_YEAR → 1, the future → > 1.
 */
export function priceLevel(year: number): number {
  return cpi(year) / cpi(PRESENT_YEAR)
}

/** US inflation in `year` (from the price index), e.g. 1980 → about 0.135. */
export function usInflation(year: number): number {
  return cpi(year) / cpi(year - 1) - 1
}

// ---------------------------------------------------------------------------
// Technology

export type TechId =
  | 'radio'
  | 'tv'
  | 'colorTv'
  | 'creditCards'
  | 'atm'
  | 'videoGameConsole'
  | 'homeComputer'
  | 'mobilePhone'
  | 'internet'
  | 'onlineShopping'
  | 'onlineBanking'
  | 'onlineBrokerage'
  | 'socialMedia'
  | 'videoSharing'
  | 'smartphone'
  | 'streaming'
  | 'crypto'
  | 'datingApps'
  | 'rideHailing'
  | 'esports'
  | 'deepLearning'
  | 'aiAssistants'
  | 'electricCars'
  | 'privateSpace'
  | 'quantumComputers'

export interface TechDef {
  id: TechId
  label: string
  /** First year anyone could have it (somewhere rich). */
  invented: number
  /** Year about half of households (or adults) in a rich country (world.ts wealth ≈ 1) had it. */
  mainstream: number
  /** Extra years the poorest countries lag behind the richest. */
  poorLag: number
  /** Highest share it ever reaches (crypto and EVs never get to everyone). */
  cap: number
}

export const TECH: Record<TechId, TechDef> = {
  radio: { id: 'radio', label: 'radio', invented: 1920, mainstream: 1932, poorLag: 25, cap: 0.97 },
  tv: { id: 'tv', label: 'television', invented: 1946, mainstream: 1955, poorLag: 30, cap: 0.97 },
  colorTv: { id: 'colorTv', label: 'color TV', invented: 1954, mainstream: 1972, poorLag: 25, cap: 0.97 },
  creditCards: { id: 'creditCards', label: 'credit cards', invented: 1958, mainstream: 1975, poorLag: 30, cap: 0.8 },
  atm: { id: 'atm', label: 'cash machines', invented: 1967, mainstream: 1985, poorLag: 20, cap: 0.95 },
  videoGameConsole: { id: 'videoGameConsole', label: 'video game consoles', invented: 1972, mainstream: 1990, poorLag: 15, cap: 0.7 },
  homeComputer: { id: 'homeComputer', label: 'home computers', invented: 1977, mainstream: 2000, poorLag: 18, cap: 0.92 },
  mobilePhone: { id: 'mobilePhone', label: 'mobile phones', invented: 1983, mainstream: 2000, poorLag: 10, cap: 0.97 },
  internet: { id: 'internet', label: 'the internet', invented: 1991, mainstream: 2001, poorLag: 16, cap: 0.97 },
  onlineShopping: { id: 'onlineShopping', label: 'online shopping', invented: 1995, mainstream: 2010, poorLag: 12, cap: 0.9 },
  onlineBanking: { id: 'onlineBanking', label: 'online banking', invented: 1995, mainstream: 2008, poorLag: 10, cap: 0.9 },
  onlineBrokerage: { id: 'onlineBrokerage', label: 'online stock trading', invented: 1996, mainstream: 2012, poorLag: 12, cap: 0.6 },
  socialMedia: { id: 'socialMedia', label: 'social media', invented: 2004, mainstream: 2012, poorLag: 6, cap: 0.85 },
  videoSharing: { id: 'videoSharing', label: 'online video', invented: 2005, mainstream: 2012, poorLag: 6, cap: 0.9 },
  smartphone: { id: 'smartphone', label: 'smartphones', invented: 2007, mainstream: 2013, poorLag: 7, cap: 0.95 },
  streaming: { id: 'streaming', label: 'streaming services', invented: 2007, mainstream: 2016, poorLag: 8, cap: 0.85 },
  crypto: { id: 'crypto', label: 'cryptocurrency', invented: 2009, mainstream: 2021, poorLag: 3, cap: 0.25 },
  datingApps: { id: 'datingApps', label: 'dating apps', invented: 2009, mainstream: 2016, poorLag: 5, cap: 0.6 },
  rideHailing: { id: 'rideHailing', label: 'ride-hailing apps', invented: 2010, mainstream: 2017, poorLag: 5, cap: 0.7 },
  esports: { id: 'esports', label: 'pro esports', invented: 1997, mainstream: 2015, poorLag: 6, cap: 0.5 },
  deepLearning: { id: 'deepLearning', label: 'deep learning', invented: 2012, mainstream: 2018, poorLag: 4, cap: 0.9 },
  aiAssistants: { id: 'aiAssistants', label: 'AI assistants', invented: 2022, mainstream: 2025, poorLag: 3, cap: 0.85 },
  electricCars: { id: 'electricCars', label: 'modern electric cars', invented: 2008, mainstream: 2034, poorLag: 10, cap: 0.8 },
  privateSpace: { id: 'privateSpace', label: 'private rocket launches', invented: 2008, mainstream: 2020, poorLag: 8, cap: 0.9 },
  quantumComputers: { id: 'quantumComputers', label: 'quantum computers', invented: 2016, mainstream: 2040, poorLag: 8, cap: 0.6 },
}

/** How far behind the richest countries a country adopts new things (0 rich … 1 poorest). */
function laggard(countryId: string): number {
  const w = getCountry(countryId).wealth ?? 1
  return Math.max(0, Math.min(1, 1 - Math.max(0.05, Math.min(1, w))))
}

/**
 * Share (0-1) of households/adults in a country that have this technology in a year. 0 before it
 * was invented (plus the country's lag), an S-curve toward `cap` after.
 */
export function techAdoption(countryId: string, tech: TechId, year: number): number {
  const d = TECH[tech]
  if (!d) return 0
  year = calendarYear(year)
  const lag = laggard(countryId) * d.poorLag
  const start = d.invented + lag * 0.5
  if (year < start) return 0
  const mid = d.mainstream + lag
  const width = Math.max(1.5, (d.mainstream - d.invented) / 3.5)
  return d.cap / (1 + Math.exp(-(year - mid) / width))
}

/** True when the technology exists at all where the character lives (gate features with this). */
export function hasTech(g: GameState, tech: TechId, year = g.year): boolean {
  return techAdoption(g.character.countryId, tech, year) >= 0.02
}

/** Chance a typical family here has it this year (e.g. a kid's home computer in 1985). */
export function techOdds(g: GameState, tech: TechId, year = g.year): number {
  return techAdoption(g.character.countryId, tech, year)
}

// ---------------------------------------------------------------------------
// Eras

export type EraId = 'belle' | 'wwi' | 'roaring' | 'depression' | 'wwii' | 'postwar' | 'sixties' | 'seventies' | 'eighties' | 'nineties' | 'noughties' | 'tens' | 'twenties' | 'future'

export interface EraDef {
  id: EraId
  label: string
  from: number
}

export const ERAS: readonly EraDef[] = [
  { id: 'belle', label: 'the early 1900s', from: 0 },
  { id: 'wwi', label: 'the First World War years', from: 1914 },
  { id: 'roaring', label: 'the Roaring Twenties', from: 1919 },
  { id: 'depression', label: 'the Great Depression', from: 1929 },
  { id: 'wwii', label: 'the Second World War years', from: 1939 },
  { id: 'postwar', label: 'the postwar boom', from: 1946 },
  { id: 'sixties', label: 'the sixties', from: 1960 },
  { id: 'seventies', label: 'the seventies', from: 1970 },
  { id: 'eighties', label: 'the eighties', from: 1980 },
  { id: 'nineties', label: 'the nineties', from: 1990 },
  { id: 'noughties', label: 'the 2000s', from: 2000 },
  { id: 'tens', label: 'the 2010s', from: 2010 },
  { id: 'twenties', label: 'the 2020s', from: 2020 },
  { id: 'future', label: 'the future', from: PRESENT_YEAR + 1 },
]

export function eraOf(year: number): EraDef {
  year = calendarYear(year)
  let e = ERAS[0]
  for (const x of ERAS) if (year >= x.from) e = x
  return e
}

/** True for years before PRESENT_YEAR (real history), false for the present and the future. */
export function isHistorical(year: number): boolean {
  return calendarYear(year) < PRESENT_YEAR
}
