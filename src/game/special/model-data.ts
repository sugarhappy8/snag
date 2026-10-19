// Model 2.0 data: every circuit date, offer kind, fee table, shelf constant and agency gate lives in this one
// file, so tuning the career means editing numbers here. Constants and a few tiny lookups, no state. Real-world
// dates carry the design's approximations; the agencies, houses and magazines are fictional. Fees are in
// today's dollars and are shown through money() by the code that prints them, never here.
import { hasTech } from '../history/timeline'
import type { GameState } from '../types'
import { DESIGNERS } from './model'
import type { Focus, Kind, Season } from './model-state'

export const FOCUSES: readonly Focus[] = ['runway', 'editorial', 'commercial']
export const KIND_IDS: readonly Kind[] = ['catalogue', 'commercial', 'digital', 'editorial', 'cover', 'runway', 'couture', 'campaign', 'face']
export const SEASONS: readonly Season[] = ['couture', 'aw', 'ss', 'year']

/** Working days a season holds: couture 8, autumn shows 12, spring shows 12, year-round 24. Days feed strain at 1.2. */
export const SEASON_CAP: Record<Season, number> = { couture: 8, aw: 12, ss: 12, year: 24 }

// ---------------------------------------------------------------------------
// Circuits

export interface CircuitDef {
  id: string
  city: string
  label: string
  /** Approximate first formal week. */
  from: number
  /** The country id whose models call it the home circuit. */
  home: string
  /** The couture week is the only circuit that holds couture shows. */
  couture: boolean
}

export const CIRCUITS: readonly CircuitDef[] = [
  { id: 'paris-couture', city: 'Paris', label: 'Paris couture week', from: 1900, home: 'fr', couture: true },
  { id: 'new-york', city: 'New York', label: 'New York show week', from: 1943, home: 'us', couture: false },
  { id: 'milan', city: 'Milan', label: 'Milan show week', from: 1958, home: 'it', couture: false },
  { id: 'paris-rtw', city: 'Paris', label: 'Paris ready-to-wear week', from: 1966, home: 'fr', couture: false },
  { id: 'london', city: 'London', label: 'London show week', from: 1984, home: 'gb', couture: false },
  { id: 'tokyo', city: 'Tokyo', label: 'Tokyo show week', from: 1985, home: 'jp', couture: false },
  { id: 'sao-paulo', city: 'Sao Paulo', label: 'Sao Paulo show week', from: 1996, home: 'br', couture: false },
  { id: 'berlin', city: 'Berlin', label: 'Berlin show week', from: 2007, home: 'de', couture: false },
]

/** The circuits that have held a week by `year` (nothing ends). */
export function circuitsAt(year: number): CircuitDef[] {
  return Number.isFinite(year) ? CIRCUITS.filter((c) => year >= c.from) : []
}

/** The open circuit a country's models call home (a ready-to-wear week before the couture week), or null; other countries travel. */
export function homeCircuit(country: string, year: number): CircuitDef | null {
  const mine = circuitsAt(year).filter((c) => c.home === country)
  return mine.find((c) => !c.couture) ?? mine[0] ?? null
}

// ---------------------------------------------------------------------------
// Brand tiers

/** Registry tiers in order; a brand's index is the offer's `minTitle` (0 New Face to 4 Supermodel). */
export const BRAND_TIERS: readonly string[] = ['budget', 'mass', 'premium', 'luxury', 'ultra']
/** The standing a casting of each tier asks for. */
export const TIER_REQ: readonly number[] = [15, 28, 42, 58, 72]
/** Book prestige of a win at each tier: a luxury campaign is 1.2 x 6 = 7.2 points. */
export const TIER_PRESTIGE: readonly number[] = [1.5, 2.5, 4, 6, 8]
/** Fee multiplier of each tier over the base fee a day. */
export const TIER_FEE: readonly number[] = [1, 1.8, 3.5, 7, 14]

/** The index of a registry tier; mass (1) for anything unknown. */
export function tierIndex(tier: string | undefined): number {
  const i = BRAND_TIERS.indexOf(tier ?? '')
  return i < 0 ? 1 : i
}

// ---------------------------------------------------------------------------
// Offer kinds

export interface KindDef {
  id: Kind
  label: string
  /** First year the kind is offered. Runway needs a non-couture week (1943), couture needs the couture week. */
  from: number
  /** A technology the kind needs. */
  tech?: 'tv' | 'socialMedia'
  /** Followers the kind needs. */
  followers?: number
  /** The focus whose casting it is. */
  niche: Focus
  /** Runway and couture: the shows. */
  show: boolean
  /** Catalogue, commercial and digital: light work. */
  light: boolean
  /** Fee a day at the lowest brand tier. */
  fee: number
  days: readonly [number, number]
  /** Book points before the tier prestige and the focus. */
  points: number
  seasons: readonly Season[]
  /** Registry brand categories the clients come from. */
  categories: readonly string[]
}

export const KINDS: Record<Kind, KindDef> = {
  catalogue: { id: 'catalogue', label: 'Catalogue shoot', from: 1900, niche: 'commercial', show: false, light: true, fee: 450, days: [1, 3], points: 0.4, seasons: ['year'], categories: ['clothing-retail', 'department-store', 'sportswear'] },
  commercial: { id: 'commercial', label: 'TV commercial', from: 1900, tech: 'tv', niche: 'commercial', show: false, light: true, fee: 900, days: [1, 3], points: 0.6, seasons: ['year'], categories: ['shampoo', 'cosmetics', 'sportswear', 'department-store'] },
  digital: { id: 'digital', label: 'Digital campaign', from: 1900, tech: 'socialMedia', followers: 20_000, niche: 'commercial', show: false, light: true, fee: 700, days: [1, 2], points: 0.5, seasons: ['year'], categories: ['sneakers', 'cosmetics', 'eyewear', 'sportswear', 'shampoo'] },
  editorial: { id: 'editorial', label: 'Magazine editorial', from: 1920, niche: 'editorial', show: false, light: false, fee: 800, days: [1, 3], points: 0.8, seasons: ['aw', 'ss', 'year'], categories: ['fashion', 'handbag', 'jewelry', 'watch', 'eyewear'] },
  cover: { id: 'cover', label: 'Magazine cover', from: 1920, niche: 'editorial', show: false, light: false, fee: 2_500, days: [1, 2], points: 1, seasons: ['year'], categories: ['fashion', 'cosmetics', 'jewelry', 'watch'] },
  runway: { id: 'runway', label: 'Runway show', from: 1943, niche: 'runway', show: true, light: false, fee: 1_200, days: [1, 4], points: 0.9, seasons: ['aw', 'ss'], categories: ['fashion', 'handbag', 'jewelry', 'eyewear'] },
  couture: { id: 'couture', label: 'Couture show', from: 1900, niche: 'runway', show: true, light: false, fee: 2_000, days: [2, 4], points: 1.1, seasons: ['couture'], categories: ['fashion', 'jewelry'] },
  campaign: { id: 'campaign', label: 'Brand campaign', from: 1930, niche: 'editorial', show: false, light: false, fee: 3_000, days: [2, 5], points: 1.2, seasons: ['year'], categories: ['fashion', 'handbag', 'jewelry', 'watch', 'eyewear', 'cosmetics', 'sneakers'] },
  face: { id: 'face', label: 'Face of the brand', from: 1970, niche: 'commercial', show: false, light: false, fee: 4_000, days: [2, 6], points: 1.3, seasons: ['year'], categories: ['cosmetics', 'shampoo', 'jewelry', 'watch', 'eyewear'] },
}

/** True when the kind is offered in the player's world this year: its year, its technology and its followers. */
export function kindOpen(g: GameState, kind: Kind, followers = 0): boolean {
  const d: KindDef | undefined = KINDS[kind]
  if (!d || !(g.year >= d.from)) return false
  if (d.tech && !hasTech(g, d.tech)) return false
  return d.followers === undefined || followers >= d.followers
}

/** The kind's label; a catalogue shoot reads 'E-commerce shoot' once online shopping exists. Same math. */
export function kindLabel(g: GameState, kind: Kind): string {
  if (kind === 'catalogue' && hasTech(g, 'onlineShopping')) return 'E-commerce shoot'
  return KINDS[kind]?.label ?? 'Booking'
}

// ---------------------------------------------------------------------------
// Focus and shelf

export interface FocusDef {
  label: string
  /** Age the look stays in its prime until (+TALENT_PRIME with Modeling). */
  prime: number
  /** Shelf lost for each year past the prime. */
  decay: number
  /** The least the shelf can fall to, before the era bonus. */
  floor: number
  /** Book multiplier on the shows (runway, couture). */
  showBook: number
  /** Book multiplier on every other kind. */
  workBook: number
  /** Fee multiplier on every kind. */
  fee: number
  /** Extra fee multiplier on light work. */
  lightFee: number
  /** Extra casting slots a year. */
  slots: number
}

export const FOCUS: Record<Focus, FocusDef> = {
  runway: { label: 'Runway', prime: 24, decay: 0.07, floor: 0.25, showBook: 1.3, workBook: 1, fee: 1, lightFee: 0.8, slots: 0 },
  editorial: { label: 'Editorial', prime: 30, decay: 0.05, floor: 0.35, showBook: 1, workBook: 1, fee: 1, lightFee: 1, slots: 0 },
  commercial: { label: 'Commercial', prime: 36, decay: 0.035, floor: 0.45, showBook: 0.6, workBook: 0.6, fee: 1.25, lightFee: 1, slots: 1 },
}

export const TALENT_PRIME = 2
/** Before the prime the shelf is `start` at age `age` and gains `step` a year. */
export const SHELF_YOUNG = { age: 16, start: 0.75, step: 0.05 } as const
/** Era bonus on the shelf floor: the largest entry whose year has come (not cumulative). */
export const FLOOR_BONUS: readonly { from: number; add: number }[] = [
  { from: 1990, add: 0.05 },
  { from: 2010, add: 0.1 },
]

// ---------------------------------------------------------------------------
// Contracts

/** Commission by agency tier; reputation trims up to `trim`, a Guarantee adds `guarantee`, the range is min to max. */
export const COMMISSION = { base: [18, 20, 20, 22] as readonly number[], trim: 3, guarantee: 3, min: 12, max: 30 } as const
/** Years a contract runs by agency tier: 2 at tier 0, 3 at tiers 1 and 2, 4 at tier 3. */
export const TERM_YEARS: readonly number[] = [2, 3, 3, 4]

// ---------------------------------------------------------------------------
// Agencies

/** The four fictional agencies, keyed by the legacy AGENCIES name that Job.company holds. `book` is the gate to sign or switch. */
export const FACE_AGENCIES: Record<string, { from: number; book: number }> = {
  'Hometown Faces': { from: 1925, book: 0 },
  'Silhouette Models': { from: 1925, book: 12 },
  'Prestige Model Management': { from: 1946, book: 30 },
  'Icon Elite': { from: 1960, book: 50 },
}

/** True when the agency exists in `year`. Before 1925 only freelance gigs run; an unknown name is never open. */
export function agencyOpen(name: string, year: number): boolean {
  const a = Object.hasOwn(FACE_AGENCIES, name) ? FACE_AGENCIES[name] : undefined
  return !!a && Number.isFinite(year) && year >= a.from
}

// ---------------------------------------------------------------------------
// Houses and magazines (fictional)

export const MAGAZINES: readonly string[] = ['Silk and Ink', 'Moda Nova', 'The Lookbook Review', 'Avenue Quarterly', 'Halo Monthly', 'Salon Noir', 'Gilt Weekly', 'The Fitting Room']

/** Where an offer's house comes from when the brand registry has no client: magazines for the printed kinds, else the legacy fictional designers. */
export function housePool(kind: Kind): readonly string[] {
  // the legacy list lives in model.ts; it is read inside this body only, so the two files may import each other
  return kind === 'editorial' || kind === 'cover' ? MAGAZINES : DESIGNERS
}
