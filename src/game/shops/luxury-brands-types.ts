// Brand catalog types for the luxury shops (shops/luxury-brands*.ts). A LuxLine is one product
// line of a real brand (a watch family, a handbag model, a car, a bottle, a hotel): who makes it,
// when it was sold, what it costs today (constant 2026 dollars) and how it keeps its value.
// Brand-level facts (founding year, home country, tier) live in the registry, data/brands.ts.
import type { TechId } from '../history/timeline'
import type { AssetKind } from '../types'

/** Shop category of a line. The registry uses the same words for the brand's main category where it fits. */
export type LuxCat =
  | 'watch'
  | 'fashion'
  | 'handbag'
  | 'eyewear'
  | 'luggage'
  | 'jewelry'
  | 'pen'
  | 'fine'
  | 'sneakers'
  | 'tech'
  | 'car'
  | 'moto'
  | 'boat'
  | 'air'
  | 'wine'
  | 'spirit'
  | 'art'

/** Net-worth tiers of the brand shops: ordinary rich, luxury, and the $5M ultra tier. */
export type LuxTier = 'boutique' | 'luxury' | 'ultra'

/** How a piece keeps (or loses) its value; see luxury-brands-value.ts CLASSES. */
export type ValClass =
  | 'budget-watch'
  | 'watch'
  | 'icon-watch'
  | 'fashion'
  | 'bag'
  | 'icon-bag'
  | 'jewel'
  | 'sneaker'
  | 'grail-sneaker'
  | 'pen'
  | 'fine'
  | 'tech'
  | 'car'
  | 'car-collector'
  | 'moto'
  | 'boat'
  | 'air'
  | 'wine'
  | 'spirit'
  | 'art'

export interface LuxLine {
  id: string
  /** Registry id (data/brands.ts). */
  brand: string
  cat: LuxCat
  /** Model name without the brand: 'Submariner', 'Birkin', '250 GTO'. */
  name: string
  from: number
  /** Last year it was sold new (omit while it is still made). */
  until?: number
  /** Typical price today in constant 2026 dollars (before era, local price level and taxes). */
  usd: number
  cls: ValClass
  tier: LuxTier
  kind: AssetKind
  emoji: string
  /** Configurations: label and price multiplier ('Steel' 1, 'Gold' 4). */
  variants?: [string, number][]
  /** Year from which new ones are allocated (waitlists): the boutique rarely has one for newcomers. */
  scarce?: number
  /** A limited run / special edition (appreciates like a collector piece). */
  limited?: boolean
  /** Only sold in these countries (on top of the brand's own list). */
  countries?: string[]
  /** Wine and spirits: years of bottle aging to its peak. */
  peak?: number
  /** Cars: the asset's carType (assets.ts), 'classic' for pieces that appreciate. */
  carType?: 'luxury' | 'sports' | 'supercar' | 'classic'
  /** Aircraft and boats: crew/pilot needed, passengers, license needed. */
  seats?: number
  /** Needs this technology where the player lives (no luxury phone before mobile phones). */
  tech?: TechId
  /** Out-of-production pieces: roughly what a good example fetches today (2026 dollars). */
  collect?: number
  /** Aircraft: the fleet class this airframe belongs to (shops/luxury-fleet.ts), and whether you can fly it yourself with a pilot's license. */
  fleet?: string
  /** Short flavor for the shop popup. */
  blurb?: string
}

export const CAT_KIND: Record<LuxCat, AssetKind> = {
  watch: 'other',
  fashion: 'other',
  handbag: 'other',
  eyewear: 'other',
  luggage: 'other',
  jewelry: 'jewelry',
  pen: 'other',
  fine: 'other',
  sneakers: 'other',
  tech: 'other',
  car: 'car',
  moto: 'car',
  boat: 'boat',
  air: 'aircraft',
  wine: 'other',
  spirit: 'other',
  art: 'collectible',
}

export const CAT_EMOJI: Record<LuxCat, string> = {
  watch: '⌚',
  fashion: '🧥',
  handbag: '👜',
  eyewear: '🕶️',
  luggage: '🧳',
  jewelry: '💍',
  pen: '🖋️',
  fine: '🏺',
  sneakers: '👟',
  tech: '📻',
  car: '🏎️',
  moto: '🏍️',
  boat: '🛥️',
  air: '🛩️',
  wine: '🍷',
  spirit: '🥃',
  art: '🖼️',
}

/** Tier by today's price: boutique under $5K, luxury under $150K, ultra above. */
export function tierOfUsd(usd: number): LuxTier {
  return usd < 5_000 ? 'boutique' : usd < 150_000 ? 'luxury' : 'ultra'
}

const DEFAULT_CLS: Record<LuxCat, ValClass> = {
  watch: 'watch',
  fashion: 'fashion',
  handbag: 'bag',
  eyewear: 'fashion',
  luggage: 'bag',
  jewelry: 'jewel',
  pen: 'pen',
  fine: 'fine',
  sneakers: 'sneaker',
  tech: 'tech',
  car: 'car',
  moto: 'moto',
  boat: 'boat',
  air: 'air',
  wine: 'wine',
  spirit: 'spirit',
  art: 'art',
}

export type LineExtra = Partial<Pick<LuxLine, 'until' | 'cls' | 'tier' | 'variants' | 'scarce' | 'limited' | 'countries' | 'peak' | 'carType' | 'seats' | 'blurb' | 'emoji' | 'tech' | 'collect' | 'fleet'>>

/** A line builder for one category: `const w = lineMaker('watch'); w('rolex', 'submariner', 'Submariner', 1953, 10_500, { scarce: 2008 })`. */
export function lineMaker(cat: LuxCat): (brand: string, slug: string, name: string, from: number, usd: number, extra?: LineExtra) => LuxLine {
  return (brand, slug, name, from, usd, extra = {}) => ({
    id: `${brand}-${slug}`,
    brand,
    cat,
    name,
    from,
    usd,
    cls: extra.cls ?? DEFAULT_CLS[cat],
    tier: extra.tier ?? tierOfUsd(usd),
    kind: CAT_KIND[cat],
    emoji: extra.emoji ?? CAT_EMOJI[cat],
    ...(extra.until !== undefined ? { until: extra.until } : {}),
    ...(extra.variants ? { variants: extra.variants } : {}),
    ...(extra.scarce !== undefined ? { scarce: extra.scarce } : {}),
    ...(extra.limited ? { limited: true } : {}),
    ...(extra.countries ? { countries: extra.countries } : {}),
    ...(extra.peak !== undefined ? { peak: extra.peak } : {}),
    ...(extra.carType ? { carType: extra.carType } : {}),
    ...(extra.seats !== undefined ? { seats: extra.seats } : {}),
    ...(extra.tech ? { tech: extra.tech } : {}),
    ...(extra.collect !== undefined ? { collect: extra.collect } : {}),
    ...(extra.fleet ? { fleet: extra.fleet } : {}),
    ...(extra.blurb ? { blurb: extra.blurb } : {}),
  })
}
