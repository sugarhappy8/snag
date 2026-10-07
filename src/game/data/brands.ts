// Real brands. The game uses real company and product names (the trademarks of their owners; see
// the disclaimer in the README) for the things you buy, the rivals you fight and the stocks you
// trade. This file is the shared registry: types, queries and the era/country gating every
// module uses, so a 1975 life never sees a smartphone maker that doesn't exist yet.
//
// The data lives in four category files (one owner each), merged here:
//   data/brands-luxury.ts    watches, fashion, jewelry, handbags, supercars, jets, yachts, wine, art
//   data/brands-rivals.ts    the companies you compete with, per industry (business/competition-roster.ts)
//   data/brands-consumer.ts  stores, restaurants, cars, devices, sneakers, endorsements, everyday goods
//   data/brands-stocks.ts    listed companies for the investments engine (invest/engine.ts)
//
// RULES for brand data (every contributor):
//  - Brands only: never real living people (no founders, CEOs or celebrities as characters).
//  - Facts must be well-known and approximately right (founding year, home country, what it
//    makes, a rough tier). When unsure, leave the field out; never invent a figure and present it
//    as fact. Shares and sizes shown to the player are labeled approximate.
//  - Nothing negative that isn't well-documented public history: no invented scandals, fraud,
//    crimes, lawsuits, recalls, safety incidents, breaches, layoffs or bankruptcies attributed to a
//    real brand. A simulated brand may gain or lose share, launch products, enter or leave a
//    market, raise or cut prices and be bought out only by a fictional-neutral mechanism; a real
//    brand may end only in the year it really ended (`ended`), and none ends after PRESENT_YEAR.
//  - No real tobacco, vape, firearms or gambling-operator brands. Alcohol brands appear only as
//    adult luxury goods (wine, champagne, spirits) and only for adults where it is legal.
//  - Era and place: a brand exists from `founded` (or `sold` for when it reached the player's
//    country) until `ended`; use `countries` for brands that only trade in some places.
import { PRESENT_YEAR } from '../history/timeline'
import type { GameState } from '../types'
import { CONSUMER_BRANDS } from './brands-consumer'
import { LUXURY_BRANDS } from './brands-luxury'
import { RIVAL_BRANDS } from './brands-rivals'
import { STOCK_BRANDS } from './brands-stocks'

export type BrandTier = 'budget' | 'mass' | 'premium' | 'luxury' | 'ultra'

export interface Brand {
  /** Unique, stable id (lowercase, dashes): 'rolex', 'toyota'. Never reuse or rename an id. */
  id: string
  /** The real name as the public knows it ('Rolex', 'Toyota'). */
  name: string
  /** What it is in this game's vocabulary ('watch', 'fashion', 'car', 'airline', 'chips', ...): free text keys
   *  chosen by the category file; use the same key for the same thing across files. */
  category: string
  /** Optional finer grouping inside a category ('swiss-watch', 'sneakers'). */
  segment?: string
  /** Country id (world.ts) of its home; omit when it has no single home. */
  hq?: string
  /** First year it traded under this name anywhere. */
  founded: number
  /** First year it was on sale in the player's world beyond its home region, per country id; omit for "wherever it exists". */
  sold?: Partial<Record<string, number>>
  /** Countries where it trades (ids from world.ts); omit for everywhere that has the market. */
  countries?: string[]
  /** Last year it traded (real history only); omit while it still exists. Never later than PRESENT_YEAR - 1. */
  ended?: number
  tier: BrandTier
  /** Relative prominence 1-10 among brands of its category (10 = a household name). */
  fame?: number
  /** Short neutral description for menus ('Swiss watchmaker'). */
  blurb?: string
  /** Free-form data for the owning module (prices, models, etc.). Plain JSON. */
  data?: Record<string, import('../types').Json>
}

const ALL: Brand[] = [...LUXURY_BRANDS, ...RIVAL_BRANDS, ...CONSUMER_BRANDS, ...STOCK_BRANDS]

const BY_ID = new Map<string, Brand>()
for (const b of ALL) if (!BY_ID.has(b.id)) BY_ID.set(b.id, b)

/** Every registered brand (do not mutate). */
export function allBrands(): readonly Brand[] {
  return ALL
}

export function brandById(id: string): Brand | undefined {
  return BY_ID.get(id)
}

/** The brand's display name, or the id when it isn't registered (never throws). */
export function brandName(id: string): string {
  return BY_ID.get(id)?.name ?? id
}

/** True when the brand trades in `year` (not before founding, not after it ended). */
export function brandExists(b: Brand, year: number): boolean {
  if (year < b.founded) return false
  if (b.ended !== undefined && year > b.ended) return false
  return true
}

/** True when the brand can be bought or met in `countryId` in `year`. */
export function brandAvailable(b: Brand, countryId: string, year: number): boolean {
  if (!brandExists(b, year)) return false
  if (b.countries && !b.countries.includes(countryId)) return false
  const from = b.sold?.[countryId]
  if (from !== undefined && year < from) return false
  return true
}

/** Brands of a category on sale where the character lives this year (most famous first). */
export function brandsFor(g: GameState, category: string, opts: { segment?: string; tier?: BrandTier; year?: number; countryId?: string } = {}): Brand[] {
  const year = opts.year ?? g.year
  const countryId = opts.countryId ?? g.character.countryId
  return ALL.filter((b) => b.category === category && (!opts.segment || b.segment === opts.segment) && (!opts.tier || b.tier === opts.tier) && brandAvailable(b, countryId, year)).sort((a, b) => (b.fame ?? 5) - (a.fame ?? 5) || a.name.localeCompare(b.name))
}

/** Same as brandsFor but not tied to a life (any year, any country): for data tools and tests. */
export function brandsInCategory(category: string): Brand[] {
  return ALL.filter((b) => b.category === category)
}

/** A brand that has already ended by PRESENT_YEAR (a real, historical closure). */
export function brandDefunct(b: Brand): boolean {
  return b.ended !== undefined && b.ended < PRESENT_YEAR
}
