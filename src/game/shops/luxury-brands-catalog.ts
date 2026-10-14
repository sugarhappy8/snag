// The real-brand catalog of the luxury shops: every product line of every house, who may buy it
// where and when, what it costs (shelf price in the player's country), and the net-worth tiers
// that open the boutiques. Pure functions of (state, line): nothing here touches g.rng.
//
// Prices: `LuxLine.usd` is a rough price today in constant 2026 dollars. The shelf price scales
// it for the year (luxury goods got cheaper in real terms), then for the country with the
// existing luxury / car / global price levels (taxes and duties included), so a Birkin is dear in
// Copenhagen and a supercar costs what it costs in Singapore.
import { carPriceMult, globalGoodsMult, localGoodsMult, nicePrice } from '../assets'
import { formatMoney, netWorth } from '../core'
import { brandAvailable, brandById, brandName } from '../data/brands'
import { isIndustryLegal, localMarket } from '../data/markets'
import { prohibition } from '../events/era'
import { hasTech, PRESENT_YEAR, priceLevel } from '../history/timeline'
import type { GameState } from '../types'
import { getCountry } from '../world'
import { luxuryLevel } from '../nation/effects'
import { GOODS_LINES } from './luxury-brands-goods'
import { CELLAR_LINES } from './luxury-brands-cellar'
import { CRAFT_LINES } from './luxury-brands-craft'
import { CAR_LINES, MOTO_LINES } from './luxury-brands-wheels'
import { LUXURY_NET_WORTH } from './luxury-common'
import type { LuxCat, LuxLine, LuxTier } from './luxury-brands-types'

export const ALL_LINES: readonly LuxLine[] = [...GOODS_LINES, ...CAR_LINES, ...MOTO_LINES, ...CRAFT_LINES, ...CELLAR_LINES]

const BY_ID = new Map<string, LuxLine>()
for (const l of ALL_LINES) if (!BY_ID.has(l.id)) BY_ID.set(l.id, l)

export function lineById(id: string): LuxLine | undefined {
  return BY_ID.get(id)
}

/** "Rolex Submariner", "Dassault Falcon 7X": the brand and the model without repeating the brand. */
export function joinTitle(brand: string, name: string): string {
  const b = brand.toLowerCase()
  const n = name.toLowerCase()
  if (n.includes(b)) return name
  const words = brand.split(' ')
  for (let k = words.length - 1; k >= 1; k--) {
    if (n.startsWith(words.slice(k).join(' ').toLowerCase() + ' ') || n === words.slice(k).join(' ').toLowerCase()) return `${words.slice(0, k).join(' ')} ${name}`
  }
  return `${brand} ${name}`
}

export function lineTitle(l: LuxLine): string {
  return joinTitle(brandName(l.brand), l.name)
}

// ---------------------------------------------------------------------------
// Net-worth tiers

export const BOUTIQUE_NET_WORTH = 20_000
export const LUXURY_TIER_NET_WORTH = 250_000

/** Net worth that opens each tier of the brand shops. */
export const TIER_NET_WORTH: Record<LuxTier, number> = { boutique: BOUTIQUE_NET_WORTH, luxury: LUXURY_TIER_NET_WORTH, ultra: LUXURY_NET_WORTH }

export const TIER_LABEL: Record<LuxTier, string> = { boutique: 'Boutique tier', luxury: 'Luxury tier', ultra: 'Ultra tier' }

/** The highest tier the player's net worth opens (null below the boutique tier). */
export function unlockedTier(g: GameState): LuxTier | null {
  const w = netWorth(g)
  if (w >= TIER_NET_WORTH.ultra) return 'ultra'
  if (w >= TIER_NET_WORTH.luxury) return 'luxury'
  if (w >= TIER_NET_WORTH.boutique) return 'boutique'
  return null
}

const TIER_RANK: Record<LuxTier, number> = { boutique: 0, luxury: 1, ultra: 2 }

export function tierOpen(g: GameState, tier: LuxTier): boolean {
  const t = unlockedTier(g)
  return t !== null && TIER_RANK[t] >= TIER_RANK[tier]
}

/** Why this tier is closed (null = open). */
export function tierReason(g: GameState, tier: LuxTier): string | null {
  if (tierOpen(g, tier)) return null
  const need = TIER_NET_WORTH[tier]
  const worth = netWorth(g)
  const short = Math.max(0, need - worth)
  const what = tier === 'boutique' ? 'The designer boutiques know a serious customer when they see one' : tier === 'luxury' ? 'The luxury houses keep their best pieces for established clients' : 'The ultra tier is by appointment only'
  return `${what}. This tier opens at a net worth of ${formatMoney(need)}; you need ${formatMoney(short)} more.`
}

// ---------------------------------------------------------------------------
// Where and when a line is sold

/** Why alcohol can't be bought right now (null = fine): age, country and Prohibition. */
export function alcoholBlock(g: GameState): string | null {
  const c = g.character
  const country = getCountry(c.countryId)
  if (c.age < country.drinkingAge) return `Alcohol is for ${country.drinkingAge} and over in ${country.name}.`
  if (!isIndustryLegal(c.countryId, 'bar')) return `Alcohol is not sold legally in ${country.name}.`
  if (prohibition(g)) return 'Prohibition: nobody will sell you a bottle, whatever you are willing to pay.'
  return null
}

export function isAlcohol(cat: LuxCat): boolean {
  return cat === 'wine' || cat === 'spirit'
}

/**
 * True when a line can be bought (new, or used once it is retired) in this country this year. A
 * brand that closed in real history still has its old pieces on the used market for good.
 */
export function lineOnSale(g: GameState, l: LuxLine, year = g.year, countryId = g.character.countryId): boolean {
  if (year < l.from) return false
  const brand = brandById(l.brand)
  if (!brand) return false
  const closed = brand.ended !== undefined && year > brand.ended
  if (closed) {
    if (!brandAvailable({ ...brand, ended: undefined }, countryId, year)) return false
    if (l.until === undefined || l.until > brand.ended!) return false
  } else if (!brandAvailable(brand, countryId, year)) return false
  if (l.countries && !l.countries.includes(countryId)) return false
  if (l.tech && !hasTech(g, l.tech, year)) return false
  return true
}

/** True when the line is made new this year (before it was retired). */
export function inProduction(l: LuxLine, year: number): boolean {
  return year >= l.from && (l.until === undefined || year <= l.until)
}

/** Used examples of a line trade whenever it is on sale (new lines have pre-owned ones too). */
export function onUsedMarket(g: GameState, l: LuxLine, year = g.year): boolean {
  return lineOnSale(g, l, year)
}

// ---------------------------------------------------------------------------
// Prices

/** Real price level of a category vs today: luxury goods were cheaper in real terms. */
export function eraMult(l: LuxLine, year: number): number {
  if (l.until !== undefined && l.until < PRESENT_YEAR) return 1
  if (year > PRESENT_YEAR) return Math.min(1.5, 1 + 0.01 * (year - PRESENT_YEAR))
  const t = Math.max(0, Math.min(1, (year - 1925) / (PRESENT_YEAR - 1925)))
  switch (l.cat) {
    case 'car':
    case 'moto':
    case 'boat':
    case 'air':
      return 0.85 + 0.15 * t
    case 'wine':
    case 'spirit':
      return 0.7 + 0.3 * t
    default:
      return 0.55 + 0.45 * t
  }
}

/** The line's price in constant 2026 dollars the year it is made new, worldwide, before local levels. */
export function fairNew(l: LuxLine, year: number, variantMult = 1): number {
  return l.usd * eraMult(l, Math.max(year, l.from)) * variantMult
}

/** Local shelf price level vs the fair price (taxes and duties included). */
export function localMult(g: GameState, l: LuxLine): number {
  switch (l.cat) {
    case 'car':
    case 'moto':
      return carPriceMult(g, l.carType ?? 'luxury')
    case 'boat':
    case 'air':
      return globalGoodsMult(g)
    case 'wine':
    case 'spirit':
      return localGoodsMult(g, 'alcohol')
    case 'tech':
      return localGoodsMult(g, 'luxury')
    default:
      return localGoodsMult(g, 'luxury')
  }
}

/** Luxury excise by place and year: Japan's commodity tax until 1988, the US one of 1991-1993, China's later levies. 0 when none. */
export function luxuryTaxRate(g: GameState, l: LuxLine, price: number, year = g.year): number {
  // A luxury tax the player's own government passed (nation/) comes first: 10% a level.
  const level = year === g.year ? luxuryLevel(g) : 0
  if (level > 0) return Math.min(0.45, 0.1 * level + historicLuxuryTax(g, l, price, year))
  return historicLuxuryTax(g, l, price, year)
}

function historicLuxuryTax(g: GameState, l: LuxLine, price: number, year: number): number {
  const country = g.character.countryId
  const nominal = price * priceLevel(year)
  if (country === 'us' && year >= 1991 && year <= 1993) {
    const over = l.cat === 'boat' ? 100_000 : l.cat === 'air' ? 250_000 : l.cat === 'jewelry' ? 10_000 : l.cat === 'car' ? 30_000 : l.cat === 'fashion' ? 10_000 : 0
    return over > 0 && nominal > over ? 0.1 : 0
  }
  if (country === 'jp' && year >= 1950 && year <= 1988 && (l.cat === 'jewelry' || l.cat === 'watch' || l.cat === 'car')) return 0.15
  if (country === 'cn') {
    if (year >= 2006 && year <= 2015 && l.cat === 'watch' && nominal >= 10_000 / 7) return 0.2
    if (year >= 2016 && l.cat === 'car' && nominal >= 1_300_000 / 6.7) return 0.1
  }
  return 0
}

export interface Quote {
  /** What you pay at the till, local level and luxury tax included. */
  price: number
  /** Part of it that is luxury excise. */
  luxuryTax: number
  /** The fair price worldwide (what the piece is worth to the next owner, before condition). */
  fair: number
  /** The price before consumption tax: what the value of the piece is anchored to. */
  basis: number
}

/** The boutique (new) price for a line and configuration. */
export function quoteNew(g: GameState, l: LuxLine, variantIdx = 0, year = g.year): Quote {
  const vm = l.variants?.[variantIdx]?.[1] ?? 1
  const fair = fairNew(l, year, vm)
  const shelf = fair * localMult(g, l)
  const tax = luxuryTaxRate(g, l, shelf, year)
  const price = nicePrice(shelf * (1 + tax))
  const vat = localMarket(g).salesTax > 0 ? 1 + localMarket(g).salesTax : 1
  const basis = Math.max(1, Math.min(fair, shelf / vat))
  return { price, luxuryTax: Math.max(0, price - nicePrice(shelf)), fair, basis }
}

/** Lines of a category on sale to this player, most prestigious brand first. */
export function linesOn(g: GameState, cats: readonly LuxCat[]): LuxLine[] {
  return ALL_LINES.filter((l) => cats.includes(l.cat) && lineOnSale(g, l)).sort((a, b) => (brandById(b.brand)?.fame ?? 5) - (brandById(a.brand)?.fame ?? 5) || a.from - b.from)
}

/** Lines of one brand on sale to this player. */
export function linesOfBrand(g: GameState, brandId: string, cats?: readonly LuxCat[]): LuxLine[] {
  return ALL_LINES.filter((l) => l.brand === brandId && (!cats || cats.includes(l.cat)) && lineOnSale(g, l)).sort((a, b) => a.usd - b.usd)
}

/** Brand ids with at least one line on sale in these categories, most famous first. */
export function brandsWith(g: GameState, cats: readonly LuxCat[]): string[] {
  const seen = new Set<string>()
  for (const l of linesOn(g, cats)) seen.add(l.brand)
  return [...seen]
}
