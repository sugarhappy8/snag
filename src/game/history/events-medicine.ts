// Medicine by era and country, applied gently by health.ts: a 1900 life is harder than a 2000
// one (no antibiotics, polio summers, smallpox, shorter lives) without being miserable. Poorer
// countries got antibiotics and vaccines later, so their "medical year" lags behind the
// calendar. Every factor is exactly neutral from PRESENT_YEAR on, so modern lives are unchanged.
// Pure: no RNG, no state.
import { getCountry } from '../world'
import { PRESENT_YEAR } from './timeline'

/** How many years behind the richest countries a country's medicine ran (0 rich … ~18 poorest). */
function medicalLag(countryId: string): number {
  const w = getCountry(countryId).wealth ?? 1
  const laggard = Math.max(0, Math.min(1, 1 - Math.max(0.05, Math.min(1, w))))
  return laggard * 18
}

/** The year whose medicine this country and year had (the calendar minus the country's lag). */
export function medicalYear(countryId: string, year: number): number {
  if (year >= PRESENT_YEAR) return year
  return Math.min(year, year - medicalLag(countryId))
}

/** Linear interpolation over [year, value] anchors (flat outside them). */
function curve(points: readonly (readonly [number, number])[], year: number): number {
  if (year <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [y1, v1] = points[i]
    if (year <= y1) {
      const [y0, v0] = points[i - 1]
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0)
    }
  }
  return points[points.length - 1][1]
}

/** Multiplier on the yearly chance of dying of old age (1 = today). */
export function eraOldAgeFactor(countryId: string, year: number): number {
  if (year >= PRESENT_YEAR) return 1
  const m = medicalYear(countryId, year)
  return curve([[1900, 1.7], [1920, 1.55], [1940, 1.4], [1950, 1.3], [1960, 1.24], [1970, 1.18], [1980, 1.11], [1990, 1.06], [2000, 1.03], [2010, 1.01], [PRESENT_YEAR, 1]], m)
}

/** Extra yearly chance of falling ill (0 = today), more for small children and the old. */
export function eraSicknessBoost(countryId: string, year: number, age: number): number {
  if (year >= PRESENT_YEAR) return 0
  const m = medicalYear(countryId, year)
  const base = curve([[1900, 0.08], [1930, 0.05], [1950, 0.03], [1970, 0.01], [1990, 0]], m)
  return age < 6 || age >= 70 ? base * 1.4 : base
}

/** Bacterial infections that antibiotics turned from killers into a week in bed. */
const BACTERIAL = new Set([
  'Pneumonia', 'Tuberculosis', 'Scarlet Fever', 'Whooping Cough', 'Staph Infection', 'Syphilis', 'Gonorrhea', 'Chlamydia',
  'Bronchitis', 'Tonsillitis', 'Middle Ear Infection', 'Pink Eye', 'Bubonic Plague', 'Lyme Disease', 'Diphtheria', 'Typhoid Fever', 'Cholera', 'Ulcers',
])

/**
 * Multiplier on a doctor's chance to cure a condition (1 = today): no antibiotics before the
 * mid-1940s, no streptomycin for TB until 1947, weaker cancer and heart care for decades.
 */
export function eraCureFactor(countryId: string, year: number, disease: string, cancer: boolean): number {
  if (year >= PRESENT_YEAR) return 1
  const m = medicalYear(countryId, year)
  // Before streptomycin (1946) a sanatorium's rest and fresh air saved some patients, not most.
  if (disease === 'Tuberculosis') return curve([[1946, 0.3], [1952, 0.6], [1960, 0.9], [1970, 1]], m)
  if (disease === 'HIV') return m < 1996 ? 0 : 1
  if (BACTERIAL.has(disease)) return curve([[1935, 0.35], [1944, 0.55], [1950, 0.85], [1960, 1]], m)
  if (cancer) return curve([[1900, 0.3], [1950, 0.45], [1975, 0.65], [1995, 0.85], [2015, 0.97], [PRESENT_YEAR, 1]], m)
  if (disease === 'Heart Disease' || disease === 'High Blood Pressure' || disease === 'Diabetes') {
    return curve([[1920, 0.5], [1960, 0.65], [1985, 0.85], [2005, 1]], m)
  }
  return curve([[1900, 0.7], [1950, 0.85], [1980, 1]], m)
}

/**
 * Relative weight of a catalog illness in this era (1 = today's weight). Vaccines made measles,
 * whooping cough and mumps rare; HIV and Lyme disease weren't known before they were identified.
 */
export function eraDiseaseWeight(countryId: string, year: number, disease: string): number {
  if (year >= PRESENT_YEAR) return 1
  const m = medicalYear(countryId, year)
  switch (disease) {
    case 'Measles':
      return curve([[1960, 8], [1968, 2], [1990, 1]], m)
    case 'Whooping Cough':
      return curve([[1940, 8], [1955, 2], [1975, 1]], m)
    case 'Scarlet Fever':
      return curve([[1930, 5], [1955, 1.5], [1975, 1]], m)
    case 'Mumps':
      return curve([[1967, 3], [1980, 1]], m)
    case 'Tuberculosis':
      // Common, but not so common that most lives of the era end with it.
      return curve([[1920, 3], [1950, 2], [1970, 1.4], [1990, 1]], m)
    case 'Pneumonia':
      return curve([[1930, 2], [1960, 1.3], [1990, 1]], m)
    case 'HIV':
      return year < 1980 ? 0 : 1
    case 'Lyme Disease':
      return year < 1975 ? 0 : 1
    case 'Hepatitis C':
      return year < 1989 ? 0 : 1
    default:
      return 1
  }
}

/** Illnesses of the past (catalog entries health.ts only uses in historical years). */
export interface EraDisease {
  name: string
  /** Relative weight in the sickness roll for this country and year (0 = gone). */
  weight: (countryId: string, year: number) => number
}

export const ERA_DISEASES: readonly EraDisease[] = [
  { name: 'Polio', weight: (c, y) => (y >= PRESENT_YEAR ? 0 : curve([[1910, 1.2], [1952, 1.6], [1955, 1.4], [1962, 0.2], [1970, 0]], medicalYear(c, y))) },
  { name: 'Smallpox', weight: (c, y) => (y >= PRESENT_YEAR || y > 1977 ? 0 : curve([[1900, 1.2], [1930, 0.6], [1950, 0.15], [1965, 0]], medicalYear(c, y))) },
  { name: 'Diphtheria', weight: (c, y) => (y >= PRESENT_YEAR ? 0 : curve([[1900, 2], [1930, 1], [1950, 0.2], [1970, 0]], medicalYear(c, y))) },
  { name: 'Typhoid Fever', weight: (c, y) => (y >= PRESENT_YEAR ? 0 : curve([[1900, 1.5], [1940, 0.7], [1960, 0.2], [1980, 0]], medicalYear(c, y))) },
  { name: 'Cholera', weight: (c, y) => (y >= PRESENT_YEAR ? 0 : curve([[1900, 0.6], [1950, 0.3], [1975, 0.1], [1990, 0]], medicalYear(c, y))) },
]

export const PANDEMIC_FLU = 'Pandemic Influenza'
export const PANDEMIC_COVID = 'Novel Coronavirus'

/** Years of the great pandemics (popups in events/history.ts; extra weight here). */
export function pandemicDisease(year: number): string | null {
  if (year >= PRESENT_YEAR) return null
  if (year === 1918 || year === 1919) return PANDEMIC_FLU
  if (year >= 2020 && year <= 2022) return PANDEMIC_COVID
  return null
}
