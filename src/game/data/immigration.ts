// Immigration law by country and era: how strong each passport is, how choosy each country is,
// how long naturalization takes, dual-citizenship and birthright rules, borders, enforcement,
// asylum and exit taxes. Pure data + lookups (no game state). The tables live in:
//   immigration-countries.ts  per-country law (102 countries)
//   immigration-blocs.ts      free-movement blocs, unions and shared citizenships, exit
//                             restrictions (Eastern Bloc...), crises behind asylum claims,
//                             amnesties, historic quotas and exclusion laws
//   immigration-programs.ts   programs with years: investor/golden visas, citizenship by
//                             investment, retirement and remote-worker visas, guest workers,
//                             open-door settlement and assisted passages, visa lotteries,
//                             working holidays
// Amounts are US dollars of the year a rule was set ("nominal"); real() turns them into the
// engine's constant PRESENT_YEAR dollars for the year being lived (thresholds that were never
// raised get cheaper in real terms, like the real ones did).
import { PRESENT_YEAR, priceLevel } from '../history/timeline'
import { COUNTRY_LAWS } from './immigration-countries'

export * from './immigration-blocs'
export * from './immigration-programs'

export type DualRule = 'yes' | 'no' | 'limited'

/** Values that change over time: [fromYear, value] pairs, oldest first. */
export type Anchors<T> = readonly (readonly [number, T])[]

export interface PointsSystem {
  from: number
  /** Last year the points route was open (inclusive). */
  to?: number
  /** Pass mark out of 100 (the game's grid; see immigration-routes pointsTest). */
  pass: number
  /** 'permanent': points-tested permanent residence on arrival (Canada, Australia, NZ). */
  result: 'permanent' | 'visa'
  name: string
}

export interface ExitTaxRule {
  from: number
  /** Net worth (nominal dollars of the year being lived) above which the tax bites. */
  threshold: number
  /** Tax on the deemed gain (about half of net worth above the threshold). */
  rate: number
  name: string
  /** 'leave': charged when you move away; 'renounce': when you give up the citizenship. */
  on: 'leave' | 'renounce'
}

export interface CountryLaw {
  id: string
  /** Passport strength 0-100 in the 2020s (share of the world you can visit visa-free). */
  pass: number
  /** Passport strength over time; derived from `pass` with era factors when absent. */
  passHist?: Anchors<number>
  /** How choosy discretionary visas are: 0 open door … 1 closed. */
  strict: Anchors<number>
  /** Points-tested skilled migration. */
  points?: PointsSystem[]
  /** Years of residence before citizenship (null = practically never for foreigners). */
  natz: Anchors<number | null>
  /** What the naturalization clock counts from: arrival (legal residence) or permanent residency. */
  natzFrom: 'arrival' | 'pr'
  /** Years on a temporary visa before permanent residency (null = no path). */
  pr: number | null
  dual: Anchors<DualRule>
  /** Birthright citizenship: null none, 0 unconditional, N = a parent legally resident N years. */
  soli: Anchors<number | null>
  /** Main language (matches cv.ts language names where it can). */
  lang: string
  /** How hard it is to get in without permission, 0-1. */
  border: Anchors<number>
  /** Yearly chance an undocumented resident is caught and removed. */
  enforce: Anchors<number>
  /** Asylum generosity 0-1 (null: no asylum system to speak of). */
  asylum: Anchors<number> | null
  exitTax?: ExitTaxRule
}

const DEFAULT_LAW: CountryLaw = {
  id: 'xx',
  pass: 50,
  strict: [[1900, 0.5]],
  natz: [[1900, 10]],
  natzFrom: 'arrival',
  pr: 5,
  dual: [[1900, 'yes']],
  soli: [[1900, null]],
  lang: 'English',
  border: [[1900, 0.5]],
  enforce: [[1900, 0.04]],
  asylum: [[1900, 0.2]],
}

const LAW_INDEX: Record<string, CountryLaw> = Object.fromEntries(COUNTRY_LAWS.map((l) => [l.id, l]))

export function lawOf(countryId: string): CountryLaw {
  return LAW_INDEX[countryId] ?? { ...DEFAULT_LAW, id: countryId }
}

/** The value in force in `year` (the last anchor at or before it; the first one before all). */
export function stepAt<T>(anchors: Anchors<T>, year: number): T {
  let v = anchors[0][1]
  for (const [y, x] of anchors) {
    if (year >= y) v = x
    else break
  }
  return v
}

/** Linear interpolation between numeric anchors (flat before the first and after the last). */
export function lerpAt(anchors: Anchors<number>, year: number): number {
  if (year <= anchors[0][0]) return anchors[0][1]
  for (let i = 1; i < anchors.length; i++) {
    const [y1, v1] = anchors[i]
    if (year <= y1) {
      const [y0, v0] = anchors[i - 1]
      const t = y1 === y0 ? 1 : (year - y0) / (y1 - y0)
      return v0 + (v1 - v0) * t
    }
  }
  return anchors[anchors.length - 1][1]
}

/**
 * Real (engine) dollars of a nominal amount written in `year`'s money: a rule that said
 * "$500,000" in 1990 asked for about $1.26M in today's money. Future years use today's prices.
 */
export function real(nominal: number, year: number): number {
  const lvl = priceLevel(Math.min(PRESENT_YEAR, Math.max(1900, year)))
  return Math.round(nominal / Math.max(0.01, lvl))
}

// Passports mattered little before 1914 (most borders barely checked papers), shrank during
// the wars and spread back out as visa waivers multiplied.
const PASS_ERA: Anchors<number> = [
  [1900, 0.85],
  [1914, 0.6],
  [1939, 0.5],
  [1946, 0.55],
  [1960, 0.7],
  [1990, 0.86],
  [2010, 0.96],
  [2025, 1],
]

/** Passport strength 0-100 in a year. */
export function passportStrength(countryId: string, year: number): number {
  const law = lawOf(countryId)
  const v = law.passHist ? lerpAt([...law.passHist, [2025, law.pass]], year) : law.pass * lerpAt(PASS_ERA, year)
  return Math.round(Math.max(5, Math.min(100, v)))
}

export function passportWord(strength: number): string {
  if (strength >= 85) return 'very strong'
  if (strength >= 65) return 'strong'
  if (strength >= 45) return 'average'
  if (strength >= 28) return 'weak'
  return 'very weak'
}

export function strictness(countryId: string, year: number): number {
  return Math.max(0, Math.min(1, lerpAt(lawOf(countryId).strict, year)))
}

export function naturalizeYears(countryId: string, year: number): number | null {
  return stepAt(lawOf(countryId).natz, year)
}

export function dualRule(countryId: string, year: number): DualRule {
  return stepAt(lawOf(countryId).dual, year)
}

/** Birthright rule in a year: null none, 0 unconditional, N = parent resident N years. */
export function birthright(countryId: string, year: number): number | null {
  return stepAt(lawOf(countryId).soli, year)
}

export function borderControl(countryId: string, year: number): number {
  return Math.max(0, Math.min(1, lerpAt(lawOf(countryId).border, year)))
}

export function enforcement(countryId: string, year: number): number {
  return Math.max(0, Math.min(0.5, lerpAt(lawOf(countryId).enforce, year)))
}

export function asylumGenerosity(countryId: string, year: number): number | null {
  const a = lawOf(countryId).asylum
  // The 1951 Refugee Convention: before it, asylum was ad hoc almost everywhere.
  if (!a) return null
  const v = lerpAt(a, year)
  return Math.max(0, Math.min(1, year < 1951 ? v * 0.6 : v))
}

export function pointsSystem(countryId: string, year: number): PointsSystem | null {
  const list = lawOf(countryId).points ?? []
  return list.find((p) => year >= p.from && (p.to === undefined || year <= p.to)) ?? null
}

export function exitTaxRule(countryId: string, year: number, on: ExitTaxRule['on']): ExitTaxRule | null {
  const t = lawOf(countryId).exitTax
  return t && t.on === on && year >= t.from ? t : null
}

/** Speaks the local language natively: the language of a country. */
export function languageOf(countryId: string): string {
  return lawOf(countryId).lang
}

/** Countries whose points systems and employers take English as the working language. */
export const ENGLISH_WORKPLACES = ['us', 'ca', 'gb', 'ie', 'au', 'nz', 'sg', 'pr', 'jm', 'bs', 'bz', 'gy', 'za', 'ng', 'ke', 'ug', 'zw', 'pg', 'ws', 'ph', 'in', 'pk', 'hk', 'ae', 'qa', 'mt']
