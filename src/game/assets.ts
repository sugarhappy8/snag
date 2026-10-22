// Assets: everything you can own. The classic life-sim Assets tab (your belongings, real estate brokers,
// car dealers, specialty vehicles, rentals) and Activities → Shopping (jewelers, instruments,
// electronics, luxury boutique, art & collectibles). The yearly hook handles values,
// condition, upkeep, mortgages, tenants and the odd burst pipe.
import { economyOf, lendingConditions } from './economy'
import { charterMenu } from './shops/fleet-operations'
//
// Store listings are generated from a seed (life + year + store), so they stay the same all
// year without touching g.rng — menus are rendered from the read-only state.
import {
  addHidden,
  addMoney,
  addRelationship,
  addStat,
  count,
  formatMoney,
  fullName,
  hasLicense,
  inPrison,
  log,
  netWorth,
  notice,
  relationLabel,
  remember,
  scriptChoice,
  shortMoney,
  spend,
  useYearAction,
  yearActionsUsed,
} from './core'
import { localeOf } from './data/locales'
import { localMarket, localPriceMult, type PriceCategory } from './data/markets'
import { killCharacter } from './death'
import {
  addLoan,
  annualPayment,
  creditLabel,
  creditScore,
  loanLabel,
  offeredRate,
  payOffLoan,
  recordMissedPayment,
  relocateAfterLosingHome,
  residenceText,
  welcomingParent,
  yearlyDebtPayments,
  yearlyIncome,
} from './finance'
import { computerUsd } from './computer/era'
import { employerRef, gadgetName, pickBrand, type GadgetSpec } from './shops/everyday-brands'
import { hasTech, type TechId } from './history/timeline'
import { eraPick, eraPickPlain } from './events/era'
import { lend, personCash } from './cash'
import { SPREADS } from './kernel/spreads'
import { createPerson } from './people'
import { bell, chance, nextRandom, pick, rand, randInt, uid, weightedPick } from './rng'
import { pickLine, pickSite } from './text/pick'
import { defineScript } from './scripts'
import type { Asset, AssetKind, ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode, Mortgage, Person, RelationKind, StatKey } from './types'
import { getCountry, namePoolOf, randomFirstName, randomLastName } from './world'
import { beginLandlordLease, endLandlordLease, landlordMenu, yearlyLandlord } from './landlord'

// ---------------------------------------------------------------------------
// Small helpers

function num(v: Json | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(v: Json | undefined, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function toJson(x: object): Json {
  return JSON.parse(JSON.stringify(x)) as Json
}

function field<T>(data: Json | undefined, key: string): T | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const v = data[key]
  return v === undefined || v === null ? null : (v as unknown as T)
}

/** Round prices to shop-looking numbers. */
export function nicePrice(n: number): number {
  if (n < 100) return Math.max(1, Math.round(n))
  if (n < 1_000) return Math.round(n / 5) * 5
  if (n < 100_000) return Math.round(n / 100) * 100
  if (n < 1_000_000) return Math.round(n / 1_000) * 1_000
  return Math.round(n / 10_000) * 10_000
}

export function conditionLabel(c: number): string {
  if (c >= 90) return 'Excellent'
  if (c >= 70) return 'Good'
  if (c >= 45) return 'Fair'
  if (c >= 20) return 'Poor'
  return 'Terrible'
}

/** Why the player can't use the Assets tab right now (dead / in prison). */
function blockReason(g: GameState): string | null {
  if (!g.character.alive) return "You're dead. Your stuff belongs to your heirs now."
  if (inPrison(g)) return "You can't do that from prison."
  return null
}

function adultReason(g: GameState, what: string): string | null {
  const b = blockReason(g)
  if (b) return b
  if (g.character.age < 18) return `You must be at least 18 years old to ${what}.`
  return null
}

function ageReason(g: GameState, minAge: number, what: string): string | null {
  const b = blockReason(g)
  if (b) return b
  if (g.character.age < minAge) return `You must be at least ${minAge} years old to ${what}.`
  return null
}

function cantAfford(g: GameState, price: number, what: string): void {
  notice(
    g,
    'Insufficient Funds',
    pick(g, [
      `You can't afford ${what}. It costs ${formatMoney(price)} and you have ${formatMoney(Math.max(0, g.character.money))}.`,
      `Your bank account laughed at the idea of ${what}. You need ${formatMoney(price)}.`,
      hasTech(g, 'creditCards') ? `Nice try. ${capitalize(what)} costs ${formatMoney(price)}, and your card was declined.` : `Nice try. ${capitalize(what)} costs ${formatMoney(price)}, and you counted your cash twice. Still short.`,
    ]),
    { emoji: '💸', tone: 'bad' },
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------------------------------------------------------------------
// Seeded listings: stable within a year, no g.rng consumption.

export interface SRng {
  next(): number
  int(min: number, max: number): number
  float(min: number, max: number): number
  chance(p: number): boolean
  pick<T>(xs: readonly T[]): T
  weighted<T>(xs: readonly T[], w: (x: T) => number): T
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

export function seeded(key: string): SRng {
  let state = hashString(key)
  const next = (): number => {
    const [v, s] = nextRandom(state)
    state = s
    return v
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    weighted: (xs, w) => {
      const total = xs.reduce((s, x) => s + Math.max(0, w(x)), 0)
      let roll = next() * total
      for (const x of xs) {
        roll -= Math.max(0, w(x))
        if (roll < 0) return x
      }
      return xs[xs.length - 1]
    },
  }
}

export function yearKey(g: GameState, what: string): string {
  const c = g.character
  return `${g.lifeId}|${c.id}|${c.firstName}${c.lastName}|${g.year}|${c.countryId}|${c.city}|${what}`
}

function boughtList(g: GameState): string[] {
  const v = g.flags.boughtListings
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function isBought(g: GameState, id: string): boolean {
  return boughtList(g).includes(id)
}

function markBought(g: GameState, id: string): void {
  const prefix = `${g.year}:`
  g.flags.boughtListings = [...boughtList(g).filter((x) => x.startsWith(prefix)), id]
}

// ---------------------------------------------------------------------------
// Prices by country & city
//
// Every price starts from a US-dollar base (what it costs in an average US city) and is scaled
// for where the player lives:
//
// - Homes and rent: housingMult = country × city. The country factor blends purchasing power
//   (world.ts wealth) with the market's rent level (data/markets.ts rentCost), so Hong Kong,
//   Singapore and Monaco are dear and Addis Ababa or Cairo cheap; the city factor adds the
//   premium of a big expensive city inside its country.
// - Cars, electronics and luxury goods: localGoodsMult = priceMult × reach (see below).
//   priceMult is the absolute local price of the same item (taxes and import duties included:
//   Singapore's COE, Denmark's registration tax, Brazil's import duties...). `reach` is a
//   softened purchasing-power factor: in poorer markets the "economy car" or "smartphone" on
//   the lot is a cheaper local trim or brand, and dealer margins and labor cost less, but only
//   partly, because these are global goods. It is 1 in rich countries and falls linearly to a
//   floor for the poorest: cars 0.35, electronics 0.6, luxury 0.85. India (wealth 0.25, car
//   priceMult 1.5) thus prices an economy car at about 0.77× the US sticker, Singapore (COE,
//   2.8) at 2.8×, Japan (0.85) at about 0.77×. Premium cars have no cheap local trim, so their
//   floor is higher (carPriceMult): an Indian supercar costs about 1.4× the US price, like
//   the real thing.
// - Car running costs follow the local fuel price plus local labor (mechanics, parts).
// - Boats, aircraft, art and collectibles trade on global markets: globalGoodsMult only
//   shaves a little off in poorer countries.
// - Everything else (instruments, repairs, fines, contractors) keeps the older wealth-only
//   goodsMult.
// Shelf prices always include the local consumption tax (VAT/GST/sales tax); purchase notices
// say how much of the price it was (salesTaxNote).

function wealthOf(g: GameState): number {
  return Math.max(0.08, getCountry(g.character.countryId).wealth ?? 1)
}

/** How much of the US price is left in the poorest markets for each category (see above). */
const REACH_FLOOR: Record<PriceCategory, number> = { car: 0.35, electronics: 0.6, luxury: 0.85, alcohol: 1, food: 1, fuel: 1 }

/**
 * Local price multiplier for a shop category vs the US price:
 * `clamp(priceMult[category] × (floor + (1 − floor) × min(1, wealth)), 0.2, 4.5)`.
 * Food, alcohol and fuel priceMults are already local price levels, so their floor is 1.
 */
export function localGoodsMult(g: GameState, category: PriceCategory): number {
  const floor = REACH_FLOOR[category]
  const reach = floor + (1 - floor) * Math.min(1, wealthOf(g))
  const local = localPriceMult(g, category)
  const mult = (Number.isFinite(local) && local > 0 ? local : 1) * reach
  return Math.min(4.5, Math.max(0.2, mult))
}

/**
 * How much of the car's US price survives in the poorest markets, by type: mass-market cars
 * come in cheaper local trims and brands, luxury and exotic cars are the same car everywhere.
 */
const CAR_REACH_FLOOR: Record<string, number> = { economy: 0.35, suv: 0.4, truck: 0.4, electric: 0.5, luxury: 0.8, sports: 0.8, supercar: 0.9, classic: 0.75 }

/** Local price multiplier for a car of this type (localGoodsMult 'car' with a per-type floor). */
export function carPriceMult(g: GameState, type: string): number {
  const floor = CAR_REACH_FLOOR[type] ?? REACH_FLOOR.car
  const reach = floor + (1 - floor) * Math.min(1, wealthOf(g))
  const local = localPriceMult(g, 'car')
  const mult = (Number.isFinite(local) && local > 0 ? local : 1) * reach
  return Math.min(4.5, Math.max(0.2, mult))
}

/** Boats, aircraft, art and collectibles: priced on global markets, a little cheaper in poor countries. */
export function globalGoodsMult(g: GameState): number {
  return 0.85 + 0.15 * Math.min(1, wealthOf(g))
}

/** Yearly running costs of a car (fuel, servicing, registration) relative to the US. */
function carRunningMult(g: GameState, type: string): number {
  const fuel = Math.min(3, Math.max(0.03, localPriceMult(g, 'fuel')))
  const labor = 0.4 + 0.6 * Math.min(1.2, wealthOf(g))
  const fuelShare = type === 'electric' ? 0.15 : 0.45
  return Math.max(0.15, fuelShare * fuel + (1 - fuelShare) * labor)
}

/** "VAT", "GST", "sales tax", "consumption tax", "MwSt": the local tax name as used mid-sentence. */
function taxName(name: string): string {
  const n = name.trim() || 'Sales tax'
  return /^[A-Z][a-z]+( |$)/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n
}

function taxPercent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

/** "20% VAT", "8.1% MwSt", or '' where there is no consumption tax. */
export function salesTaxLabel(g: GameState): string {
  const m = localMarket(g)
  return m.salesTax > 0 ? `${taxPercent(m.salesTax)} ${taxName(m.salesTaxName)}` : ''
}

/**
 * One sentence for a purchase notice: "Price includes 20% VAT ($150)." Prices are always
 * tax-inclusive (in the US too: the sticker is what you pay at the register). '' when untaxed.
 */
export function salesTaxNote(g: GameState, price: number): string {
  const m = localMarket(g)
  if (!(m.salesTax > 0) || !(price > 0)) return ''
  const tax = Math.round(price - price / (1 + m.salesTax))
  if (tax < 1) return ''
  return `Price includes ${salesTaxLabel(g)} (${formatMoney(tax)}).`
}

/**
 * Store header line: "Prices include 20% VAT." ('' when untaxed). Local names that an English
 * reader may not know get a gloss once here: "Prices include 25% moms (VAT)."
 */
export function pricesIncludeTax(g: GameState): string {
  const label = salesTaxLabel(g)
  if (!label) return ''
  const name = localMarket(g).salesTaxName
  const known = /VAT|GST|tax/i.test(name)
  const gloss = known ? '' : /^(SST|IVU)$/.test(name.trim()) ? ' (sales tax)' : ' (VAT)'
  return `Prices include ${label}${gloss}.`
}

/** A store/dealer name that sounds local ("Fuji Motors"), stable per country; `fallback` without name words. */
function localStoreName(g: GameState, key: string, pattern: string, fallback: string): string {
  const words = localMarket(g).nameWords.filter((w) => typeof w === 'string' && w.trim() !== '')
  if (words.length === 0) return fallback
  const word = words[Math.abs(hashString(`${g.character.countryId}|${key}`)) % words.length].trim()
  return pattern.replace('{w}', word)
}

function times(mult: number): string {
  return `${mult >= 10 ? Math.round(mult) : Math.round(mult * 10) / 10}×`
}

/** What a steep car priceMult means for the player: "about 2.8× US prices", or a luxury when wages are low. */
function carDutyText(g: GameState): string | null {
  if (localPriceMult(g, 'car') < 1.6) return null
  const eff = localGoodsMult(g, 'car')
  return eff >= 1.4 ? `cost about ${times(eff)} what they do in the US` : 'are a luxury few locals can afford'
}

/** One short line about what's notably cheap or dear here, for the car dealer header. */
function carMarketNote(g: GameState): string {
  const fuel = localPriceMult(g, 'fuel')
  const duty = carDutyText(g)
  const bits: string[] = []
  if (duty) bits.push(`Thanks to duties, registration taxes and permits, cars here ${duty}.`)
  else if (localGoodsMult(g, 'car') <= 0.85 && localPriceMult(g, 'car') <= 0.9) bits.push('Cars are cheap here by world standards.')
  if (fuel <= 0.35) bits.push('Gas is practically free.')
  else if (fuel >= 1.8) bits.push(`Gas costs about ${times(fuel)} US prices.`)
  return bits.join(' ')
}

/** The single most notable fact about shopping here, or '' (Shopping header). */
export function marketShoppingNote(g: GameState): string {
  const facts: [number, string][] = []
  const car = localPriceMult(g, 'car')
  const elec = localGoodsMult(g, 'electronics')
  const lux = localPriceMult(g, 'luxury')
  const fuel = localPriceMult(g, 'fuel')
  const country = getCountry(g.character.countryId).name
  const duty = carDutyText(g)
  if (duty) facts.push([car * 1.6, `Thanks to duties, registration taxes and permits, cars in ${country} ${duty}.`])
  if (elec >= 1.2) facts.push([elec * 1.2, `Gadgets cost about ${times(elec)} US prices here after import duties.`])
  if (lux >= 1.3) facts.push([lux * 1.1, `Designer goods carry steep import duties in ${country}.`])
  if (fuel <= 0.35) facts.push([3 - fuel, `Gas in ${country} is practically free.`])
  if (fuel >= 1.8) facts.push([fuel, `Gas costs about ${times(fuel)} US prices here.`])
  facts.sort((a, b) => b[0] - a[0])
  return facts[0]?.[1] ?? ''
}

const CITY_PRICE: Record<string, number> = {
  'New York': 1.9,
  'San Francisco': 2.1,
  'Los Angeles': 1.7,
  'San Diego': 1.6,
  Boston: 1.5,
  Seattle: 1.5,
  Miami: 1.35,
  Washington: 1.4,
  Honolulu: 1.7,
  Austin: 1.2,
  Denver: 1.2,
  Portland: 1.15,
  Detroit: 0.65,
  Cleveland: 0.7,
  Memphis: 0.75,
  London: 1.9,
  Paris: 1.8,
  Tokyo: 1.6,
  'Hong Kong': 2.3,
  Singapore: 1.9,
  Monaco: 3,
  'Monte Carlo': 3,
  Zurich: 1.8,
  Geneva: 1.8,
  Sydney: 1.7,
  Melbourne: 1.4,
  Vancouver: 1.7,
  Toronto: 1.5,
  Dubai: 1.4,
  Munich: 1.4,
  Amsterdam: 1.5,
  'Tel Aviv': 1.6,
  Mumbai: 1.6,
  'Mexico City': 1.3,
  Shanghai: 1.6,
  Beijing: 1.5,
  Seoul: 1.4,
  Moscow: 1.4,
  Oslo: 1.4,
  Stockholm: 1.4,
  Copenhagen: 1.4,
  Dublin: 1.5,
  // Big-city premiums elsewhere (relative to the rest of the same country).
  Milan: 1.45,
  Rome: 1.3,
  Barcelona: 1.4,
  Madrid: 1.4,
  Lisbon: 1.4,
  Vienna: 1.3,
  Helsinki: 1.3,
  Prague: 1.35,
  Warsaw: 1.3,
  Budapest: 1.25,
  Athens: 1.2,
  Istanbul: 1.45,
  'Abu Dhabi': 1.25,
  Doha: 1.2,
  Riyadh: 1.2,
  Jerusalem: 1.4,
  Delhi: 1.35,
  Bangalore: 1.35,
  'São Paulo': 1.4,
  'Rio de Janeiro': 1.4,
  'Buenos Aires': 1.35,
  Santiago: 1.3,
  Bogotá: 1.25,
  Lima: 1.25,
  'Panama City': 1.3,
  'Punta del Este': 1.5,
  Nassau: 1.35,
  Lagos: 1.5,
  Nairobi: 1.3,
  'Cape Town': 1.4,
  Johannesburg: 1.2,
  Cairo: 1.2,
  Casablanca: 1.25,
  Jakarta: 1.3,
  Manila: 1.3,
  Makati: 1.6,
  Bangkok: 1.4,
  'Kuala Lumpur': 1.3,
  'Ho Chi Minh City': 1.3,
  Hanoi: 1.25,
  Taipei: 1.6,
  Shenzhen: 1.6,
  Guangzhou: 1.3,
  Gangnam: 1.9,
  Osaka: 1.2,
  Auckland: 1.4,
  'St. Petersburg': 1.2,
  Almaty: 1.2,
}

function cityMult(city: string): number {
  const known = CITY_PRICE[city]
  if (known) return known
  return 0.85 + (Math.abs(hashString(city)) % 31) / 100
}

/**
 * Real estate & rent multiplier vs an average US city: country × city, where the country
 * factor is wealth^0.66 × rentCost^0.4 (about wealth^1.1 when rents track wealth) and the
 * city factor is the big-city premium above.
 */
export function housingMult(g: GameState): number {
  const rent = localMarket(g).rentCost
  const country = Math.pow(wealthOf(g), 0.66) * Math.pow(Number.isFinite(rent) && rent > 0 ? Math.max(0.08, Math.min(5, rent)) : wealthOf(g), 0.4)
  return Math.max(0.08, Math.min(4, country)) * cityMult(g.character.city) * economyOf(g).housing
}

/**
 * Generic goods priced by country wealth only (instruments, repairs, contractors, fines).
 * With a category, the local market price for it instead (see localGoodsMult).
 */
export function goodsMult(g: GameState, category?: PriceCategory): number {
  if (category) return localGoodsMult(g, category)
  return Math.min(1.5, Math.max(0.45, 0.4 + 0.6 * wealthOf(g)))
}

// ---------------------------------------------------------------------------
// Real estate catalog

type Broker = 'residential' | 'luxury'

interface HouseType {
  id: string
  label: string
  emoji: string
  broker: Broker
  min: number
  max: number
  beds: [number, number]
  baths: [number, number]
  sqft: [number, number]
  age: [number, number]
  cond: [number, number]
  weight: number
  acres?: [number, number]
  haunted: number
}

const HOUSE_TYPES: HouseType[] = [
  { id: 'trailer', label: 'Mobile Home', emoji: '🚐', broker: 'residential', min: 30_000, max: 95_000, beds: [1, 3], baths: [1, 2], sqft: [600, 1_300], age: [3, 45], cond: [25, 90], weight: 2, haunted: 0.04 },
  { id: 'condo', label: 'Condo', emoji: '🏢', broker: 'residential', min: 140_000, max: 480_000, beds: [1, 3], baths: [1, 2], sqft: [550, 1_500], age: [1, 60], cond: [45, 100], weight: 3, haunted: 0.03 },
  { id: 'townhouse', label: 'Townhouse', emoji: '🏘️', broker: 'residential', min: 220_000, max: 650_000, beds: [2, 4], baths: [1, 3], sqft: [1_100, 2_300], age: [1, 80], cond: [40, 100], weight: 3, haunted: 0.05 },
  { id: 'house', label: 'House', emoji: '🏠', broker: 'residential', min: 260_000, max: 950_000, beds: [2, 5], baths: [1, 4], sqft: [1_200, 3_600], age: [0, 100], cond: [35, 100], weight: 4, haunted: 0.07 },
  { id: 'cottage', label: 'Cottage', emoji: '🏡', broker: 'residential', min: 180_000, max: 520_000, beds: [1, 3], baths: [1, 2], sqft: [800, 1_700], age: [20, 150], cond: [30, 95], weight: 2, haunted: 0.1 },
  { id: 'fixer', label: 'Fixer-Upper', emoji: '🏚️', broker: 'residential', min: 90_000, max: 280_000, beds: [2, 4], baths: [1, 2], sqft: [1_000, 2_400], age: [40, 120], cond: [3, 30], weight: 2, haunted: 0.2 },
  { id: 'penthouse', label: 'Penthouse', emoji: '🌆', broker: 'luxury', min: 1_500_000, max: 9_000_000, beds: [2, 5], baths: [2, 5], sqft: [2_000, 6_500], age: [0, 30], cond: [70, 100], weight: 2, haunted: 0.02 },
  { id: 'mansion', label: 'Mansion', emoji: '🏛️', broker: 'luxury', min: 2_500_000, max: 20_000_000, beds: [5, 12], baths: [4, 12], sqft: [6_000, 25_000], age: [0, 110], cond: [50, 100], weight: 3, haunted: 0.12 },
  { id: 'farm', label: 'Farm', emoji: '🌾', broker: 'luxury', min: 450_000, max: 3_000_000, beds: [3, 6], baths: [2, 4], sqft: [1_800, 4_500], age: [10, 150], cond: [30, 95], weight: 2, acres: [20, 400], haunted: 0.08 },
  { id: 'ranch', label: 'Ranch', emoji: '🐎', broker: 'luxury', min: 1_200_000, max: 9_500_000, beds: [3, 8], baths: [2, 6], sqft: [3_000, 9_000], age: [5, 100], cond: [40, 100], weight: 2, acres: [100, 3_000], haunted: 0.06 },
  { id: 'villa', label: 'Beach Villa', emoji: '🏝️', broker: 'luxury', min: 2_000_000, max: 14_000_000, beds: [3, 8], baths: [3, 8], sqft: [3_000, 10_000], age: [0, 60], cond: [55, 100], weight: 1.5, haunted: 0.03 },
  { id: 'castle', label: 'Castle', emoji: '🏰', broker: 'luxury', min: 9_000_000, max: 48_000_000, beds: [10, 40], baths: [6, 25], sqft: [15_000, 60_000], age: [200, 800], cond: [20, 85], weight: 0.6, haunted: 0.45 },
]

const STREETS = ['Maple', 'Oak', 'Elm', 'Pine', 'Cedar', 'Willow', 'Birch', 'Lakeview', 'Sunset', 'Highland', 'Park', 'Hillcrest', 'Meadow', 'River', 'Spring', 'Chestnut', 'Magnolia', 'Orchard', 'Harbor', 'Ridge', 'Valley', 'Forest', 'Main', 'Church', 'Mill', 'Bay', 'Mockingbird', 'Primrose', 'Juniper', 'Sycamore', 'Aspen', 'Bluebell', 'Foxglove', 'Kingfisher', 'Lighthouse', 'Copper']
const STREET_SUFFIX = ['Street', 'Avenue', 'Road', 'Lane', 'Drive', 'Court', 'Way', 'Boulevard', 'Place', 'Terrace', 'Circle']

/** A local street name ('Jalan Sudirman', 'Calle Hidalgo') from the listing's own seeded RNG. */
function seededStreet(r: SRng, g: GameState): string {
  const loc = localeOf(g.character.countryId)
  if (!loc.streetNames.length) return `${r.pick(STREETS)} ${r.pick(STREET_SUFFIX)}`
  return r.pick(loc.streetNames).replace(/\{(\w+)\}/g, (whole: string, key: string) => {
    if (key === 'place' && loc.placeWords.length) return r.pick(loc.placeWords)
    if (key === 'honoree' && loc.honorees.length) return r.pick(loc.honorees)
    if (key === 'n') return String(r.int(1, 12))
    if (key === 'city') return g.character.city
    return whole
  })
}

export interface HouseListing {
  id: string
  typeId: string
  label: string
  emoji: string
  address: string
  price: number
  beds: number
  baths: number
  sqft: number
  acres: number
  age: number
  condition: number
  haunted: number
  upkeep: number
}

function condFactor(cond: number): number {
  return 0.55 + 0.45 * (Math.max(0, Math.min(100, cond)) / 100)
}

function hauntFactor(h: number): number {
  return 1 - 0.3 * (Math.max(0, Math.min(100, h)) / 100)
}

/**
 * Yearly upkeep of a home: property tax and insurance as a share of its value (0.5-0.9%) plus
 * repairs priced like a US home of the same size (0.7-1.1% of the US-equivalent value) at local
 * labor rates. About 1.2-2% of the price in an average US city, nearer 1% in Zurich or Hong
 * Kong, where homes cost far more than the work to keep them up.
 */
function houseUpkeep(g: GameState, price: number, r: SRng): number {
  const tax = price * r.float(0.005, 0.009)
  const repairs = (price / Math.max(0.1, housingMult(g))) * r.float(0.007, 0.011) * goodsMult(g)
  return nicePrice(Math.max(50, tax + repairs))
}

/** This year's listings at a real estate broker. */
export function houseListings(g: GameState, broker: Broker): HouseListing[] {
  const r = seeded(yearKey(g, `realestate:${broker}`))
  const types = HOUSE_TYPES.filter((t) => t.broker === broker)
  const mult = housingMult(g)
  const out: HouseListing[] = []
  const n = broker === 'residential' ? 7 : 5
  for (let i = 0; i < n; i++) {
    const t = r.weighted(types, (x) => x.weight)
    const condition = r.int(t.cond[0], t.cond[1])
    const haunted = r.chance(t.haunted) ? r.int(10, 100) : 0
    const base = t.min + (t.max - t.min) * Math.pow(r.next(), 1.4)
    const price = nicePrice(base * mult * (0.8 + 0.2 * (condition / 100)) * hauntFactor(haunted))
    const num1 = r.int(1, 9_899)
    const street = g.character.countryId === 'us' ? `${r.pick(STREETS)} ${r.pick(STREET_SUFFIX)}` : seededStreet(r, g)
    const address = t.id === 'condo' || t.id === 'penthouse' ? `Unit ${t.id === 'penthouse' ? 'PH' : ''}${r.int(1, 40)}${t.id === 'penthouse' ? '' : r.pick(['A', 'B', 'C', 'D'])}, ${num1} ${street}` : `${num1} ${street}`
    const listing: HouseListing = {
      id: `${g.year}:re-${broker}-${i}`,
      typeId: t.id,
      label: t.label,
      emoji: t.emoji,
      address,
      price,
      beds: r.int(t.beds[0], t.beds[1]),
      baths: r.int(t.baths[0], t.baths[1]),
      sqft: Math.round(r.int(t.sqft[0], t.sqft[1]) / 10) * 10,
      acres: t.acres ? r.int(t.acres[0], t.acres[1]) : 0,
      age: r.int(t.age[0], t.age[1]),
      condition,
      haunted,
      upkeep: houseUpkeep(g, price, r),
    }
    if (!isBought(g, listing.id)) out.push(listing)
  }
  return out.sort((a, b) => a.price - b.price)
}

function houseName(l: { typeId: string; label: string; beds: number; acres: number }): string {
  if (l.acres > 0) return `${l.acres.toLocaleString('en-US')}-Acre ${l.label}`
  if (l.typeId === 'castle' || l.typeId === 'mansion' || l.typeId === 'villa') return l.label
  return `${l.beds}-Bedroom ${l.label}`
}

function houseDescription(l: HouseListing): string {
  const bits = [`${l.beds} bed · ${l.baths} bath · ${l.sqft.toLocaleString('en-US')} sq ft`]
  if (l.acres) bits.push(`${l.acres.toLocaleString('en-US')} acres`)
  bits.push(l.age === 0 ? 'brand new' : `${l.age} years old`)
  return bits.join(' · ')
}

// ---------------------------------------------------------------------------
// Mortgages

export interface MortgagePlan {
  id: string
  down: number
  years: number
}

export const MORTGAGE_PLANS: MortgagePlan[] = [
  { id: 'm10_30', down: 0.1, years: 30 },
  { id: 'm20_30', down: 0.2, years: 30 },
  { id: 'm20_15', down: 0.2, years: 15 },
  { id: 'm50_15', down: 0.5, years: 15 },
]

/** Last-resort lender names when no bank in the registry trades where you live (a village in 1920). */
const MORTGAGE_LENDERS = ['the local savings bank', 'the town building society', 'the regional bank', 'the credit union']

/** Lenders that sound local where the market has name words ("Sakura Savings Bank"), else the defaults. */
function localLenders(g: GameState, patterns: string[], neutral: string[], fallback: string[]): string[] {
  const words = localMarket(g).nameWords.filter((w) => typeof w === 'string' && w.trim() !== '')
  if (words.length === 0) return fallback
  const r = seeded(`${g.character.countryId}|lenders|${patterns.join()}`)
  return [...patterns.map((p) => p.replace('{w}', r.pick(words).trim())), ...neutral]
}

/** A real bank that lends where you live this year (home brands first); the invented names are only a last resort. */
function realLender(g: GameState, fallback: string[]): string {
  return pickBrand(g, 'bank', { tiers: ['budget', 'mass', 'premium'] })?.name ?? pick(g, fallback)
}

function mortgageLender(g: GameState): string {
  return realLender(g, localLenders(g, ['{w} Savings Bank', '{w} Home Finance', 'Bank of {w}'], ['the regional bank', 'the local savings bank'], MORTGAGE_LENDERS))
}

export interface MortgageDecision {
  ok: boolean
  reason: string
  down: number
  principal: number
  rate: number
  payment: number
}

/** Would a bank write this mortgage? Checks age, down payment, credit and debt-to-income. */
export function mortgageDecision(g: GameState, price: number, plan: MortgagePlan): MortgageDecision {
  const c = g.character
  const down = Math.round(price * plan.down)
  const principal = price - down
  // Local base rate (finance.offeredRate follows the central bank) plus plan tweaks.
  const rate = Math.round(Math.max(0.004, offeredRate(g, 'mortgage') + (plan.down < 0.2 ? 0.005 : 0) - (plan.years <= 15 ? 0.006 : 0) - (plan.down >= 0.5 ? 0.003 : 0)) * 10000) / 10000
  const payment = annualPayment(principal, rate, plan.years)
  const base = { down, principal, rate, payment }
  if (c.age < 18) return { ok: false, reason: 'Banks don\'t give mortgages to minors. Not even cute ones.', ...base }
  if (c.money < down) return { ok: false, reason: `You need ${formatMoney(down)} for the down payment, and you have ${formatMoney(Math.max(0, c.money))}.`, ...base }
  const score = creditScore(g)
  const terms = lendingConditions(g)
  const minScore = Math.max(plan.down < 0.2 ? 620 : 580, terms.minScore)
  if (score < minScore) return { ok: false, reason: `The loan officer took one look at your credit score (${score}, ${creditLabel(score).toLowerCase()}) and politely showed you the door.`, ...base }
  const income = yearlyIncome(g) + Math.max(0, c.money - down) / 10
  const dti = income > 0 ? (payment + yearlyDebtPayments(g)) / income : Infinity
  if (dti > terms.maxDti) {
    return {
      ok: false,
      reason: `The bank doesn't think you earn enough to cover payments of ${formatMoney(payment)} a year. ${yearlyIncome(g) === 0 ? 'Having a job would help.' : 'Try a bigger down payment or a cheaper place.'}`,
      ...base,
    }
  }
  return { ok: true, reason: '', ...base }
}

function mortgageChoiceLabel(g: GameState, price: number, plan: MortgagePlan): string {
  const d = mortgageDecision(g, price, plan)
  return `Mortgage: ${Math.round(plan.down * 100)}% down (${shortMoney(d.down)}), ${plan.years} yrs at ${(d.rate * 100).toFixed(2)}% (${shortMoney(d.payment)}/yr)`
}

// ---------------------------------------------------------------------------
// Assets: creation & bookkeeping

function upkeepRate(a: Asset): number {
  return num(a.details.upkeepRate, 0.015)
}

const INSURANCE_RATES: Partial<Record<AssetKind, number>> = { house: 0.004, car: 0.035, boat: 0.02, aircraft: 0.025, jewelry: 0.02, collectible: 0.012 }

export function insurancePremium(g: GameState, a: Asset): number {
  const rate = INSURANCE_RATES[a.kind]
  if (!rate) return 0
  const floor = a.kind === 'car' ? 400 * goodsMult(g) : 50
  return nicePrice(Math.max(floor, a.value * rate))
}

function isInsured(a: Asset): boolean {
  return a.details.insured === true
}

function isHome(g: GameState, a: Asset): boolean {
  return g.character.residence.status === 'owned' && g.character.residence.assetId === a.id
}

function haunted(a: Asset): number {
  return num(a.details.haunted)
}

function amenities(a: Asset): string[] {
  const v = a.details.amenities
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function marketValue(a: Asset): number {
  const mv = num(a.details.marketValue, 0)
  if (mv > 0) return mv
  return Math.round(a.value / (condFactor(a.condition) * hauntFactor(haunted(a))))
}

export function refreshHouseValue(a: Asset): void {
  const mv = marketValue(a)
  a.details.marketValue = Math.round(mv)
  a.value = Math.max(1_000, Math.round(mv * condFactor(a.condition) * hauntFactor(haunted(a))))
  a.upkeep = nicePrice(a.value * upkeepRate(a))
}

/** Buy a listed house with cash (plan null) or a mortgage. Returns true on success. */
export function buyHouse(g: GameState, listing: HouseListing, plan: MortgagePlan | null): boolean {
  const c = g.character
  const reason = adultReason(g, 'buy property')
  if (reason) {
    notice(g, 'Real Estate', reason, { emoji: '🏠' })
    return false
  }
  if (isBought(g, listing.id)) {
    notice(g, 'Sold!', 'Another buyer snapped that property up before you could sign. The agent sends their condolences.', { emoji: '🏷️' })
    return false
  }
  let mortgage: Mortgage | undefined
  if (!plan) {
    if (!spend(g, listing.price, 'property.buy')) {
      cantAfford(g, listing.price, `this ${listing.label.toLowerCase()}`)
      return false
    }
  } else {
    const d = mortgageDecision(g, listing.price, plan)
    if (!d.ok) {
      notice(g, 'Mortgage Denied', d.reason, { emoji: '🏦', tone: 'bad' })
      return false
    }
    spend(g, d.down, 'property.buy')
    mortgage = { lender: mortgageLender(g), balance: d.principal, yearlyPayment: d.payment, yearsLeft: plan.years, rate: d.rate, rateType: 'fixed' }
    lend(g, d.principal, 'pool:sellers') // the lender creates the loan; the sellers' pool gets the whole price
  }
  const name = houseName(listing)
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: 'house',
    name,
    emoji: listing.emoji,
    purchasePrice: listing.price,
    value: listing.price,
    condition: listing.condition,
    purchasedAge: c.age,
    mortgage,
    upkeep: listing.upkeep,
    details: {
      type: listing.typeId,
      typeLabel: listing.label,
      address: listing.address,
      city: c.city,
      countryId: c.countryId,
      beds: listing.beds,
      baths: listing.baths,
      sqft: listing.sqft,
      acres: listing.acres,
      built: g.year - listing.age,
      haunted: listing.haunted,
      amenities: [],
      insured: false,
      invested: 0,
      upkeepRate: Math.round((listing.upkeep / Math.max(1, listing.price)) * 10000) / 10000,
    },
  }
  asset.details.marketValue = marketValue(asset)
  g.assets.push(asset)
  markBought(g, listing.id)
  count(g, 'housesBought')
  count(g, 'purchases')
  addStat(g, 'happiness', randInt(g, 8, 15))
  remember(g, `Bought a ${name.toLowerCase()} at ${listing.address} for ${formatMoney(listing.price)}.`)
  log(g, `I bought a ${name.toLowerCase()} at ${listing.address} for ${formatMoney(listing.price)}${mortgage ? ' with a mortgage' : ''}.`, 'good')

  let text = mortgage
    ? `You put ${formatMoney(listing.price - mortgage.balance)} down and ${mortgage.lender} lent you the other ${formatMoney(mortgage.balance)}. Your mortgage payment is ${formatMoney(mortgage.yearlyPayment)} a year for ${mortgage.yearsLeft} years.`
    : `You paid ${formatMoney(listing.price)} in cash. The real estate agent cried a little at the commission.`
  // Move in unless you already live in a home you own.
  const st = c.residence.status
  if (st === 'parents' || st === 'renting' || st === 'homeless' || st === 'partner') {
    const was = st
    c.residence = { status: 'owned', assetId: asset.id, description: name }
    text += was === 'renting' ? ' You broke your lease and moved in.' : was === 'parents' ? ' You packed up your childhood bedroom and moved in.' : ' You moved in right away.'
  } else {
    text += ' You can move in from the Assets tab whenever you like.'
  }
  if (listing.haunted > 0) text += ' Late at night, something upstairs went thump.'
  notice(g, pickLine(g, ['Home Sweet Home', 'Keys in Hand', 'New Property!']), text, { emoji: listing.emoji, tone: 'good' })
  return true
}

const BUY_HOUSE = defineScript('assets.buyHouse', (g, choice, data) => {
  const listing = field<HouseListing>(data, 'listing')
  if (!listing || choice === 'cancel') return
  if (choice === 'cash') {
    buyHouse(g, listing, null)
    return
  }
  const plan = MORTGAGE_PLANS.find((p) => p.id === choice)
  if (plan) buyHouse(g, listing, plan)
})

function houseListingAction(l: HouseListing): MenuAction {
  return {
    type: 'action',
    id: `listing-${l.id}`,
    label: `${houseName(l)}`,
    emoji: l.emoji,
    subtitle: `${formatMoney(l.price)} · ${l.address} · Condition ${l.condition}%${l.haunted ? ' · 👻 Haunted' : ''}`,
    run: (g) => {
      const reason = adultReason(g, 'buy property')
      if (reason) {
        notice(g, 'Real Estate', reason, { emoji: '🏠' })
        return
      }
      const lines = [`${l.address}, ${g.character.city}`, houseDescription(l), `Condition: ${conditionLabel(l.condition)} (${l.condition}%)`, `Asking price: ${formatMoney(l.price)}`, `Estimated upkeep: ${formatMoney(l.upkeep)}/year`]
      if (l.haunted) lines.push(`⚠️ Disclosure: the seller admits the property may be haunted (hauntedness ${l.haunted}%).`)
      const score = creditScore(g)
      lines.push(`Your credit score: ${score} (${creditLabel(score)})`)
      const choices: ChoiceOption[] = [{ id: 'cash', label: `Pay cash (${formatMoney(l.price)})`, emoji: '💵' }]
      for (const plan of MORTGAGE_PLANS) choices.push({ id: plan.id, label: mortgageChoiceLabel(g, l.price, plan), emoji: '🏦' })
      choices.push({ id: 'cancel', label: 'Never mind', emoji: '✖️' })
      scriptChoice(g, BUY_HOUSE, `${l.emoji} ${houseName(l)}`, lines.join('\n'), choices, { emoji: l.emoji, data: { listing: toJson(l) } })
    },
  }
}

/** "Banks here are writing 30-year mortgages at about 1.7%." for the real estate headers. */
function mortgageRateNote(g: GameState): string {
  const plan = MORTGAGE_PLANS.find((p) => p.id === 'm20_30') ?? MORTGAGE_PLANS[0]
  const rate = mortgageDecision(g, 100_000, plan).rate
  return `Banks here are writing 30-year mortgages at about ${(rate * 100).toFixed(1)}% for someone with your credit.`
}

function brokerMenu(broker: Broker, label: string, emoji: string, blurb: string): MenuGroup {
  return {
    type: 'menu',
    id: `broker-${broker}`,
    label,
    emoji,
    subtitle: blurb,
    disabledReason: (g) => adultReason(g, 'buy property'),
    header: (g) => `Listings in ${g.character.city} this year. You have ${formatMoney(g.character.money)}. Credit score: ${creditScore(g)}.`,
    children: (g) => {
      const list = houseListings(g, broker)
      if (list.length === 0) return [{ type: 'info', id: 'none', text: 'Everything on the market sold this year. Check back next year!', emoji: '🪧' }]
      return list.map(houseListingAction)
    },
  }
}

export const realEstateMenu: MenuGroup = {
  type: 'menu',
  id: 'realEstate',
  label: 'Real Estate',
  emoji: '🏡',
  subtitle: 'Buy a home or an investment property',
  disabledReason: (g) => adultReason(g, 'buy property'),
  header: (g) => `Pick a broker. Listings change every year. ${g.character.age >= 18 ? mortgageRateNote(g) : ''}`.trim(),
  children: (g) => [
    brokerMenu('residential', localStoreName(g, 'realty', '{w} Realty', 'Hometown Realty'), '🏠', 'Condos, townhouses, houses and fixer-uppers'),
    brokerMenu('luxury', 'Prestige Estates', '🏛️', 'Mansions, penthouses, farms, ranches and castles'),
  ],
}

// ---------------------------------------------------------------------------
// Rentals (moving out)

interface RentalType {
  id: string
  label: string
  emoji: string
  min: number
  max: number
}

const RENTAL_TYPES: RentalType[] = [
  { id: 'room', label: 'Room in a Shared House', emoji: '🛏️', min: 450, max: 800 },
  { id: 'studio', label: 'Studio Apartment', emoji: '🏢', min: 800, max: 1_300 },
  { id: '1br', label: '1-Bedroom Apartment', emoji: '🏢', min: 1_050, max: 1_800 },
  { id: '2br', label: '2-Bedroom Apartment', emoji: '🏬', min: 1_400, max: 2_500 },
  { id: 'loft', label: 'Downtown Loft', emoji: '🌇', min: 2_200, max: 3_800 },
  { id: 'house', label: 'Rental House', emoji: '🏠', min: 1_800, max: 3_400 },
  { id: 'penthouse', label: 'Luxury Penthouse', emoji: '🌆', min: 6_000, max: 15_000 },
]

const NEUTRAL_NEIGHBORHOODS = ['Downtown', 'the city center', 'the Old Town', 'the suburbs', 'the university quarter', 'the harbor district']
const NEIGHBORHOODS = ['Downtown', 'Midtown', 'Riverside', 'Old Town', 'the Suburbs', 'Uptown', 'the East Side', 'the West End', 'the Arts District', 'Harbor View', 'Maple Heights', 'University Park', 'Little Italy', 'the Financial District']
const RENTAL_PERKS = ['Pet friendly', 'In-unit laundry', 'Rooftop deck', 'Thin walls', 'Free parking', 'No AC', 'Gym in the building', 'Upstairs neighbor plays the drums', 'Doorman', 'Near the subway', 'Great natural light', 'Mysterious smell', 'Landlord lives downstairs', 'Brand-new kitchen', 'Balcony with a view']

export interface RentalListing {
  id: string
  label: string
  emoji: string
  neighborhood: string
  monthly: number
  condition: number
  perk: string
}

/** A neighborhood where the player lives: US-style districts in the US, the local districts elsewhere. */
function neighborhood(r: SRng, g: GameState): string {
  const local = g.character.countryId === 'us' ? [] : localeOf(g.character.countryId).placeWords
  return local.length && r.next() < 0.85 ? r.pick(local) : r.pick(g.character.countryId === 'us' ? NEIGHBORHOODS : NEUTRAL_NEIGHBORHOODS)
}

export function rentalListings(g: GameState): RentalListing[] {
  const r = seeded(yearKey(g, 'rentals'))
  const mult = Math.pow(housingMult(g), 0.85)
  const out: RentalListing[] = []
  const types = [...RENTAL_TYPES]
  for (let i = 0; i < 7; i++) {
    const t = i < types.length ? types[i] : r.pick(types)
    const condition = r.int(30, 100)
    out.push({
      id: `${g.year}:rent-${i}`,
      label: t.label,
      emoji: t.emoji,
      neighborhood: neighborhood(r, g),
      monthly: Math.max(60, Math.round((r.int(t.min, t.max) * mult * (0.85 + 0.15 * (condition / 100))) / 5) * 5),
      condition,
      perk: r.pick(RENTAL_PERKS),
    })
  }
  return out.sort((a, b) => a.monthly - b.monthly)
}

/** Sign a lease: sets the residence to renting. Returns true on success. */
export function rentApartment(g: GameState, l: RentalListing): boolean {
  const c = g.character
  const reason = adultReason(g, 'rent an apartment')
  if (reason) {
    notice(g, 'Rentals', reason, { emoji: '🔑' })
    return false
  }
  const yearly = l.monthly * 12
  const upfront = l.monthly * 2
  if (c.money < upfront) {
    cantAfford(g, upfront, 'the first month plus a security deposit')
    return false
  }
  const income = yearlyIncome(g)
  const landlord = `${randomFirstName(g, c.countryId, chance(g, 0.5) ? 'male' : 'female')} ${randomLastName(g, c.countryId)}`
  const brokeRenter = income * 0.5 < yearly && c.money < yearly
  const felon = c.criminalRecord.some((x) => x.convicted)
  if ((brokeRenter && chance(g, 0.8)) || (felon && chance(g, 0.3)) || creditScore(g) < 500) {
    notice(
      g,
      'Application Rejected',
      pickSite(g, [
        `The landlord, ${landlord}, ran a background check on you and stopped returning your calls.`,
        `${landlord} said they only rent to people who earn at least twice the rent. Rude, but fair.`,
        `${landlord} rejected your application. They went with a dentist who has "a very stable aura."`,
      ], 0x1b8fcf9c),
      { emoji: '🚫', tone: 'bad' },
    )
    return false
  }
  spend(g, upfront, 'rent')
  const before = c.residence.status
  c.residence = { status: 'renting', rent: yearly, description: `a ${l.label.toLowerCase()} in ${l.neighborhood}` }
  addStat(g, 'happiness', randInt(g, 3, 8))
  log(g, `I moved into a ${l.label.toLowerCase()} in ${l.neighborhood}.`, 'good')
  if (before === 'parents') remember(g, 'Moved out of my parents\' house.')
  const intro =
    before === 'parents'
      ? pickLine(g, ['You finally moved out of your parents\' house!', 'You packed your stuff and left the nest.', 'Freedom! You moved out of your parents\' place.'])
      : before === 'homeless'
        ? 'After living on the streets, you finally have a roof over your head again.'
        : 'You moved into a new place.'
  notice(g, 'New Digs', `${intro} You signed a lease with ${landlord} for ${formatMoney(l.monthly)}/month and paid ${formatMoney(upfront)} up front. Perk: ${l.perk.toLowerCase()}.`, { emoji: l.emoji, tone: 'good' })
  return true
}

export const moveBackHomeAction: MenuAction = {
  type: 'action',
  id: 'moveBackHome',
  label: 'Move Back in With Parents',
  emoji: '👨‍👩‍👧',
  subtitle: 'Rent-free. Dignity not included.',
  visible: (g) => g.character.age >= 18 && g.character.residence.status !== 'parents' && g.people.some((p) => p.alive && (p.relation === 'parent' || p.relation === 'stepparent')),
  disabledReason: (g) => blockReason(g),
  confirm: () => 'Ask your parents if you can move back home?',
  run: (g) => {
    const c = g.character
    const parent = welcomingParent(g) ?? g.people.find((p) => p.alive && (p.relation === 'parent' || p.relation === 'stepparent') && p.relationship >= 15 && chance(g, 0.4))
    if (!parent) {
      notice(g, 'Request Denied', pickLine(g, ['Your parents said you made your bed, and now you can lie in it. Preferably somewhere else.', 'Your parents turned your old room into a home gym. There is no room for you.', 'Your parents laughed, then realized you were serious, then said no.']), { emoji: '🚪', tone: 'bad' })
      return
    }
    const was = c.residence.status
    c.residence = { status: 'parents' }
    addRelationship(parent, -3)
    log(g, 'I moved back in with my parents.')
    notice(g, 'Back Home', `Your ${relationLabel(parent).toLowerCase()} ${parent.firstName} agreed to let you move back in.${was === 'renting' ? ' You ended your lease.' : ''} ${pickLine(g, ['Your old bedroom smells exactly the same.', 'House rules apply. Dinner is at 6.', 'They immediately asked when you plan to leave.'])}`, { emoji: '🏠' })
  },
}

export const rentalsMenu: MenuGroup = {
  type: 'menu',
  id: 'rentals',
  label: 'Rentals',
  emoji: '🔑',
  subtitle: 'Move out and rent an apartment',
  disabledReason: (g) => adultReason(g, 'rent an apartment'),
  header: (g) => `${residenceText(g)} Landlords want the first month plus a deposit up front. Rent is charged every year.`,
  children: (g) => [
    moveBackHomeAction,
    { type: 'heading', id: 'rentalsHeading', label: `Apartments in ${g.character.city}` },
    ...rentalListings(g).map(
      (l): MenuAction => ({
        type: 'action',
        id: `rental-${l.id}`,
        label: `${l.label} in ${l.neighborhood}`,
        emoji: l.emoji,
        subtitle: `${formatMoney(l.monthly)}/month · Condition ${l.condition}% · ${l.perk}`,
        confirm: (gg) => `Sign a 1-year lease for ${formatMoney(l.monthly)}/month (${formatMoney(l.monthly * 12)}/year)? You'll pay ${formatMoney(l.monthly * 2)} up front.${gg.character.residence.status === 'owned' ? ' You will move out of the home you own.' : ''}`,
        run: (gg) => {
          rentApartment(gg, l)
        },
      }),
    ),
  ],
}

// ---------------------------------------------------------------------------
// Cars

type CarType = 'economy' | 'suv' | 'truck' | 'electric' | 'luxury' | 'sports' | 'supercar' | 'classic'

interface CarModel {
  make: string
  model: string
  type: CarType
  base: number
  /** Classic cars have a fixed model year. */
  year?: number
  rare?: boolean
  /** First and last calendar year it was sold new (no Model 3 in 1990, no Model T in 1960). */
  from?: number
  until?: number
  /** Sold only in these countries (home-market models). */
  only?: readonly string[]
}

const CAR_MODELS: CarModel[] = [
  { make: 'Toyota', model: 'Corolla', type: 'economy', base: 23_000, from: 1966 },
  { make: 'Honda', model: 'Civic', type: 'economy', base: 25_000, from: 1972 },
  { make: 'Hyundai', model: 'Elantra', type: 'economy', base: 22_000, from: 1990 },
  { make: 'Kia', model: 'Rio', type: 'economy', base: 18_000, from: 2000 },
  { make: 'Nissan', model: 'Versa', type: 'economy', base: 17_500, from: 2006 },
  { make: 'Chevrolet', model: 'Spark', type: 'economy', base: 15_000, from: 2009 },
  { make: 'Volkswagen', model: 'Golf', type: 'economy', base: 24_000, from: 1974 },
  { make: 'Mazda', model: 'Mazda3', type: 'economy', base: 24_500, from: 2003 },
  { make: 'Ford', model: 'Focus', type: 'economy', base: 21_000, from: 1998 },
  { make: 'Subaru', model: 'Impreza', type: 'economy', base: 23_000, from: 1992 },
  { make: 'Fiat', model: '500', type: 'economy', base: 18_500, from: 2007 },
  { make: 'Mini', model: 'Cooper', type: 'economy', base: 30_000, from: 1961 },
  { make: 'Toyota', model: 'Prius', type: 'economy', base: 28_000, from: 1997 },
  { make: 'Toyota', model: 'RAV4', type: 'suv', base: 30_000, from: 1994 },
  { make: 'Honda', model: 'CR-V', type: 'suv', base: 31_000, from: 1995 },
  { make: 'Jeep', model: 'Wrangler', type: 'suv', base: 35_000, from: 1986 },
  { make: 'Ford', model: 'Explorer', type: 'suv', base: 38_000, from: 1990 },
  { make: 'Subaru', model: 'Outback', type: 'suv', base: 31_000, from: 1994 },
  { make: 'Chevrolet', model: 'Tahoe', type: 'suv', base: 58_000, from: 1995 },
  { make: 'Ford', model: 'F-150', type: 'truck', base: 40_000, from: 1975 },
  { make: 'Chevrolet', model: 'Silverado', type: 'truck', base: 42_000, from: 1998 },
  { make: 'Ram', model: '1500', type: 'truck', base: 41_000, from: 1994 },
  { make: 'Toyota', model: 'Tacoma', type: 'truck', base: 33_000, from: 1995 },
  { make: 'Tesla', model: 'Model 3', type: 'electric', base: 40_000, from: 2017 },
  { make: 'Tesla', model: 'Model Y', type: 'electric', base: 45_000, from: 2020 },
  { make: 'Nissan', model: 'Leaf', type: 'electric', base: 29_000, from: 2010 },
  { make: 'Rivian', model: 'R1T', type: 'electric', base: 70_000, from: 2021 },
  { make: 'BMW', model: '5 Series', type: 'luxury', base: 58_000, from: 1972 },
  { make: 'Mercedes-Benz', model: 'E-Class', type: 'luxury', base: 62_000, from: 1993 },
  { make: 'Audi', model: 'A6', type: 'luxury', base: 57_000, from: 1994 },
  { make: 'Lexus', model: 'ES', type: 'luxury', base: 44_000, from: 1989 },
  { make: 'Cadillac', model: 'Escalade', type: 'luxury', base: 85_000, from: 1999 },
  { make: 'Land Rover', model: 'Range Rover', type: 'luxury', base: 105_000, from: 1970 },
  { make: 'Porsche', model: 'Cayenne', type: 'luxury', base: 85_000, from: 2002 },
  { make: 'Tesla', model: 'Model S', type: 'luxury', base: 80_000, from: 2012 },
  { make: 'Mercedes-Benz', model: 'S-Class', type: 'luxury', base: 115_000, from: 1972 },
  { make: 'Bentley', model: 'Continental GT', type: 'luxury', base: 240_000, from: 2003 },
  { make: 'Rolls-Royce', model: 'Phantom', type: 'luxury', base: 460_000, from: 2003 },
  { make: 'Ford', model: 'Mustang GT', type: 'sports', base: 42_000, from: 1964 },
  { make: 'Chevrolet', model: 'Corvette', type: 'sports', base: 68_000, from: 1953 },
  { make: 'Porsche', model: '911', type: 'sports', base: 115_000, from: 1964 },
  { make: 'Nissan', model: 'GT-R', type: 'sports', base: 115_000, from: 2007 },
  { make: 'BMW', model: 'M4', type: 'sports', base: 78_000, from: 2014 },
  { make: 'Jaguar', model: 'F-Type', type: 'sports', base: 75_000, from: 2013 },
  { make: 'Mazda', model: 'MX-5 Miata', type: 'sports', base: 30_000, from: 1989 },
  { make: 'Ferrari', model: 'F8 Tributo', type: 'supercar', base: 280_000, from: 2019 },
  { make: 'Lamborghini', model: 'Huracán', type: 'supercar', base: 250_000, from: 2014 },
  { make: 'McLaren', model: '720S', type: 'supercar', base: 300_000, from: 2017 },
  { make: 'Aston Martin', model: 'DBS', type: 'supercar', base: 320_000, from: 2007 },
  { make: 'Bugatti', model: 'Chiron', type: 'supercar', base: 3_100_000, rare: true, from: 2016 },
  { make: 'Koenigsegg', model: 'Jesko', type: 'supercar', base: 3_000_000, rare: true, from: 2021 },
  { make: 'Ford', model: 'Mustang Fastback', type: 'classic', base: 65_000, year: 1967 },
  { make: 'Chevrolet', model: 'Corvette Stingray', type: 'classic', base: 120_000, year: 1963 },
  { make: 'Dodge', model: 'Challenger R/T', type: 'classic', base: 90_000, year: 1970 },
  { make: 'Chevrolet', model: 'Bel Air', type: 'classic', base: 70_000, year: 1957 },
  { make: 'Volkswagen', model: 'Beetle', type: 'classic', base: 15_000, year: 1965 },
  { make: 'Jaguar', model: 'E-Type', type: 'classic', base: 150_000, year: 1962 },
  // Cars of earlier decades, sold new in their day (appended: today's showrooms are unchanged).
  { make: 'Ford', model: 'Model T', type: 'economy', base: 9_000, from: 1908, until: 1927 },
  { make: 'Ford', model: 'Model A', type: 'economy', base: 10_000, from: 1928, until: 1931 },
  { make: 'Chevrolet', model: 'Master Deluxe', type: 'economy', base: 14_000, from: 1933, until: 1942 },
  { make: 'Volkswagen', model: 'Beetle', type: 'economy', base: 15_000, from: 1946, until: 1985 },
  { make: 'Austin', model: 'Mini', type: 'economy', base: 14_000, from: 1959, until: 2000 },
  { make: 'Fiat', model: '600', type: 'economy', base: 12_000, from: 1955, until: 1969 },
  { make: 'Toyota', model: 'Corona', type: 'economy', base: 17_000, from: 1957, until: 2001 },
  { make: 'Ford', model: 'Escort', type: 'economy', base: 16_000, from: 1968, until: 2003 },
  { make: 'Ford', model: 'Pinto', type: 'economy', base: 15_000, from: 1971, until: 1980 },
  { make: 'Honda', model: 'Accord', type: 'economy', base: 26_000, from: 1976, until: 2025 },
  { make: 'Chevrolet', model: 'Bel Air', type: 'economy', base: 28_000, from: 1950, until: 1975 },
  { make: 'Jeep', model: 'CJ', type: 'suv', base: 24_000, from: 1945, until: 1985 },
  { make: 'Land Rover', model: 'Series', type: 'suv', base: 30_000, from: 1948, until: 1985 },
  { make: 'Chevrolet', model: 'Suburban', type: 'suv', base: 42_000, from: 1935, until: 1994 },
  { make: 'Ford', model: 'Bronco', type: 'suv', base: 33_000, from: 1966, until: 1996 },
  { make: 'Ford', model: 'F-100', type: 'truck', base: 26_000, from: 1953, until: 1983 },
  { make: 'Ford', model: 'Model TT', type: 'truck', base: 11_000, from: 1917, until: 1927 },
  { make: 'Chevrolet', model: 'C/K Pickup', type: 'truck', base: 30_000, from: 1960, until: 1997 },
  { make: 'Detroit Electric', model: 'Model 47', type: 'electric', base: 45_000, from: 1907, until: 1929 },
  { make: 'Packard', model: 'Twin Six', type: 'luxury', base: 90_000, from: 1916, until: 1934 },
  { make: 'Cadillac', model: 'De Ville', type: 'luxury', base: 60_000, from: 1949, until: 2005 },
  { make: 'Lincoln', model: 'Continental', type: 'luxury', base: 65_000, from: 1939, until: 2002 },
  { make: 'Mercedes-Benz', model: 'W123', type: 'luxury', base: 50_000, from: 1976, until: 1986 },
  { make: 'Rolls-Royce', model: 'Silver Shadow', type: 'luxury', base: 260_000, from: 1965, until: 1980 },
  { make: 'Rolls-Royce', model: 'Silver Ghost', type: 'luxury', base: 300_000, from: 1907, until: 1926 },
  { make: 'Jaguar', model: 'E-Type', type: 'sports', base: 80_000, from: 1961, until: 1975 },
  { make: 'Datsun', model: '240Z', type: 'sports', base: 30_000, from: 1969, until: 1978 },
  { make: 'Toyota', model: 'Supra', type: 'sports', base: 42_000, from: 1978, until: 2002 },
  { make: 'Mazda', model: 'RX-7', type: 'sports', base: 38_000, from: 1978, until: 2002 },
  { make: 'Lamborghini', model: 'Miura', type: 'supercar', base: 300_000, from: 1966, until: 1973 },
  { make: 'Lamborghini', model: 'Countach', type: 'supercar', base: 400_000, from: 1974, until: 1990 },
  { make: 'Ferrari', model: 'Testarossa', type: 'supercar', base: 350_000, from: 1984, until: 1996 },
  { make: 'Ferrari', model: 'F40', type: 'supercar', base: 1_100_000, from: 1987, until: 1992, rare: true },
  { make: 'McLaren', model: 'F1', type: 'supercar', base: 2_400_000, from: 1992, until: 1998, rare: true },
  // More of what people really drove, by era and country (real makers and models; appended so older showrooms keep their order).
  { make: 'Toyota', model: 'Camry', type: 'economy', base: 28_000, from: 1982 },
  { make: 'Toyota', model: 'Yaris', type: 'economy', base: 19_000, from: 1999 },
  { make: 'Toyota', model: 'Starlet', type: 'economy', base: 12_000, from: 1973, until: 1999 },
  { make: 'Toyota', model: 'Vios', type: 'economy', base: 17_000, from: 2002, only: ['th', 'id', 'ph', 'my', 'vn', 'sg', 'tw', 'cn', 'in', 'sa', 'ae'] },
  { make: 'Toyota', model: 'Avanza', type: 'economy', base: 16_000, from: 2003, only: ['id', 'ph', 'my', 'th', 'vn', 'za', 'sa', 'ae', 'eg'] },
  { make: 'Toyota', model: 'Kijang', type: 'suv', base: 15_000, from: 1977, until: 2004, only: ['id', 'ph', 'my'] },
  { make: 'Toyota', model: 'Kijang Innova', type: 'suv', base: 24_000, from: 2004, only: ['id', 'ph', 'my', 'in', 'ke', 'za'] },
  { make: 'Toyota', model: 'Land Cruiser', type: 'suv', base: 60_000, from: 1951 },
  { make: 'Toyota', model: 'Hilux', type: 'truck', base: 30_000, from: 1968 },
  { make: 'Honda', model: 'Fit', type: 'economy', base: 18_000, from: 2001 },
  { make: 'Honda', model: 'N-Box', type: 'economy', base: 14_000, from: 2011, only: ['jp'] },
  { make: 'Honda', model: 'Odyssey', type: 'suv', base: 38_000, from: 1994 },
  { make: 'Honda', model: 'City', type: 'economy', base: 15_000, from: 1996, only: ['in', 'th', 'id', 'my', 'ph', 'pk', 'bd', 'sa', 'ae', 'eg', 'za', 'ng'] },
  { make: 'Suzuki', model: 'Alto', type: 'economy', base: 8_000, from: 1979 },
  { make: 'Suzuki', model: 'Swift', type: 'economy', base: 17_000, from: 1983 },
  { make: 'Suzuki', model: 'Jimny', type: 'suv', base: 20_000, from: 1970 },
  { make: 'Suzuki', model: 'Wagon R', type: 'economy', base: 11_000, from: 1993, only: ['jp', 'in', 'id', 'pk', 'gb', 'de', 'it', 'es', 'fr'] },
  { make: 'Maruti', model: '800', type: 'economy', base: 6_000, from: 1983, until: 2014, only: ['in', 'np', 'bd'] },
  { make: 'Maruti', model: 'Alto', type: 'economy', base: 7_500, from: 2000, only: ['in', 'np'] },
  { make: 'Hindustan', model: 'Ambassador', type: 'economy', base: 9_000, from: 1958, until: 2014, only: ['in'] },
  { make: 'Tata', model: 'Nano', type: 'economy', base: 4_000, from: 2008, until: 2018, only: ['in'] },
  { make: 'Tata', model: 'Safari', type: 'suv', base: 20_000, from: 1998, only: ['in', 'np', 'bd', 'lk'] },
  { make: 'Mahindra', model: 'Scorpio', type: 'suv', base: 18_000, from: 2002, only: ['in', 'np', 'bd', 'za', 'au'] },
  { make: 'Mahindra', model: 'Bolero', type: 'truck', base: 14_000, from: 2000, only: ['in', 'np', 'bd', 'ke', 'za'] },
  { make: 'Nissan', model: 'Sunny', type: 'economy', base: 14_000, from: 1966 },
  { make: 'Nissan', model: 'Micra', type: 'economy', base: 14_000, from: 1982 },
  { make: 'Nissan', model: 'Skyline', type: 'sports', base: 36_000, from: 1957, only: ['jp', 'au', 'gb', 'th', 'my', 'id', 'sg', 'hk'] },
  { make: 'Nissan', model: 'Tsuru', type: 'economy', base: 8_000, from: 1992, until: 2017, only: ['mx', 'gt', 'sv', 'cr', 'pa'] },
  { make: 'Mitsubishi', model: 'Lancer', type: 'economy', base: 19_000, from: 1973, until: 2017 },
  { make: 'Mitsubishi', model: 'Pajero', type: 'suv', base: 38_000, from: 1982, until: 2021 },
  { make: 'Mitsubishi', model: 'Xpander', type: 'suv', base: 20_000, from: 2017, only: ['id', 'ph', 'th', 'vn', 'my', 'sa', 'ae'] },
  { make: 'Mazda', model: '323', type: 'economy', base: 14_000, from: 1977, until: 2003 },
  { make: 'Subaru', model: 'Legacy', type: 'economy', base: 24_000, from: 1989 },
  { make: 'Daihatsu', model: 'Mira', type: 'economy', base: 9_000, from: 1980, only: ['jp', 'id', 'th', 'my'] },
  { make: 'Hyundai', model: 'Pony', type: 'economy', base: 8_000, from: 1975, until: 1990 },
  { make: 'Hyundai', model: 'Sonata', type: 'economy', base: 27_000, from: 1985 },
  { make: 'Hyundai', model: 'i10', type: 'economy', base: 13_000, from: 2007 },
  { make: 'Hyundai', model: 'Tucson', type: 'suv', base: 29_000, from: 2004 },
  { make: 'Kia', model: 'Pride', type: 'economy', base: 7_000, from: 1987, until: 2000 },
  { make: 'Kia', model: 'Sportage', type: 'suv', base: 28_000, from: 1993 },
  { make: 'Daewoo', model: 'Matiz', type: 'economy', base: 6_500, from: 1998, until: 2005 },
  { make: 'Volkswagen', model: 'Passat', type: 'economy', base: 32_000, from: 1973 },
  { make: 'Volkswagen', model: 'Polo', type: 'economy', base: 19_000, from: 1975 },
  { make: 'Volkswagen', model: 'Gol', type: 'economy', base: 12_000, from: 1980, until: 2023, only: ['br', 'ar', 'uy', 'py', 'cl', 'pe', 'bo', 'mx', 'co', 've', 'za'] },
  { make: 'Volkswagen', model: 'Fusca', type: 'economy', base: 8_000, from: 1953, until: 1996, only: ['br'] },
  { make: 'Volkswagen', model: 'Sedán (Vocho)', type: 'economy', base: 8_000, from: 1954, until: 2003, only: ['mx'] },
  { make: 'Volkswagen', model: 'Kombi', type: 'suv', base: 22_000, from: 1950, until: 2013, only: ['br', 'ar', 'mx', 'de', 'za', 'au'] },
  { make: 'Škoda', model: 'Octavia', type: 'economy', base: 24_000, from: 1996 },
  { make: 'Škoda', model: '105', type: 'economy', base: 7_000, from: 1976, until: 1990, only: ['cz', 'sk', 'pl', 'hu', 'ro', 'ru', 'ua'] },
  { make: 'SEAT', model: 'Ibiza', type: 'economy', base: 17_000, from: 1984 },
  { make: 'SEAT', model: '600', type: 'economy', base: 7_000, from: 1957, until: 1973, only: ['es', 'pt'] },
  { make: 'Renault', model: '4', type: 'economy', base: 8_000, from: 1961, until: 1992 },
  { make: 'Renault', model: '5', type: 'economy', base: 9_000, from: 1972, until: 1996 },
  { make: 'Renault', model: 'Clio', type: 'economy', base: 17_000, from: 1990 },
  { make: 'Renault', model: 'Kwid', type: 'economy', base: 8_500, from: 2015, only: ['in', 'br', 'co', 'ar', 'cl', 'ma', 'ng', 'za'] },
  { make: 'Peugeot', model: '205', type: 'economy', base: 11_000, from: 1983, until: 1998 },
  { make: 'Peugeot', model: '206', type: 'economy', base: 14_000, from: 1998, until: 2012 },
  { make: 'Peugeot', model: '504', type: 'economy', base: 14_000, from: 1968, until: 2006, only: ['ng', 'ke', 'ug', 'zw', 'za', 'eg', 'ma', 'dz', 'tn', 'ar', 'ir', 'cd', 'ao'] },
  { make: 'Citroën', model: '2CV', type: 'economy', base: 7_000, from: 1948, until: 1990 },
  { make: 'Citroën', model: 'DS', type: 'luxury', base: 45_000, from: 1955, until: 1975 },
  { make: 'Opel', model: 'Kadett', type: 'economy', base: 11_000, from: 1962, until: 1991 },
  { make: 'Opel', model: 'Corsa', type: 'economy', base: 14_000, from: 1982 },
  { make: 'Fiat', model: '500', type: 'economy', base: 8_000, from: 1957, until: 1975 },
  { make: 'Fiat', model: 'Panda', type: 'economy', base: 12_000, from: 1980 },
  { make: 'Fiat', model: 'Uno', type: 'economy', base: 11_000, from: 1983, until: 2013 },
  { make: 'Fiat', model: 'Palio', type: 'economy', base: 11_000, from: 1996, until: 2017, only: ['br', 'ar', 'mx', 'pl', 'tr', 'in', 'co', 'cl', 'za', 've'] },
  { make: 'Fiat', model: '126p', type: 'economy', base: 5_000, from: 1973, until: 2000, only: ['pl'] },
  { make: 'Fiat', model: '147', type: 'economy', base: 7_000, from: 1976, until: 1986, only: ['br'] },
  { make: 'Fiat', model: 'Punto', type: 'economy', base: 14_000, from: 1993, until: 2018 },
  { make: 'Chevrolet', model: 'Celta', type: 'economy', base: 8_000, from: 2000, until: 2015, only: ['br'] },
  { make: 'Chevrolet', model: 'Onix', type: 'economy', base: 14_000, from: 2012, only: ['br', 'ar', 'co', 'cl', 'pe', 'mx', 'ec', 'uy'] },
  { make: 'Chevrolet', model: 'Opala', type: 'economy', base: 14_000, from: 1968, until: 1992, only: ['br'] },
  { make: 'Chevrolet', model: 'Chevy', type: 'economy', base: 8_000, from: 1994, until: 2012, only: ['mx'] },
  { make: 'Ford', model: 'Fiesta', type: 'economy', base: 16_000, from: 1976, until: 2023 },
  { make: 'Ford', model: 'Cortina', type: 'economy', base: 12_000, from: 1962, until: 1982, only: ['gb', 'ie', 'au', 'nz', 'za', 'ke', 'zw'] },
  { make: 'Ford', model: 'Capri', type: 'sports', base: 24_000, from: 1969, until: 1986, only: ['gb', 'de', 'ie', 'nl', 'be', 'au', 'za'] },
  { make: 'Ford', model: 'Mondeo', type: 'economy', base: 24_000, from: 1993, until: 2022 },
  { make: 'Ford', model: 'Falcon', type: 'economy', base: 18_000, from: 1962, until: 1991, only: ['ar'] },
  { make: 'Ford', model: 'Ka', type: 'economy', base: 9_000, from: 1996, until: 2021, only: ['br', 'ar', 'mx', 'gb', 'de', 'fr', 'es', 'it', 'pt', 'za', 'cl', 'co'] },
  { make: 'Ford', model: 'Taurus', type: 'economy', base: 28_000, from: 1986, until: 2019 },
  { make: 'Ford', model: 'Ranger', type: 'truck', base: 30_000, from: 1983 },
  { make: 'Ford', model: 'Thunderbird', type: 'sports', base: 40_000, from: 1955, until: 2005 },
  { make: 'Chevrolet', model: 'Camaro', type: 'sports', base: 40_000, from: 1966, until: 2024 },
  { make: 'Chevrolet', model: 'Impala', type: 'economy', base: 26_000, from: 1958, until: 2020 },
  { make: 'Dodge', model: 'Charger', type: 'sports', base: 38_000, from: 1966 },
  { make: 'Dodge', model: 'Caravan', type: 'suv', base: 30_000, from: 1984, until: 2020 },
  { make: 'Dodge', model: 'Viper', type: 'sports', base: 90_000, from: 1992, until: 2017 },
  { make: 'Jeep', model: 'Cherokee', type: 'suv', base: 34_000, from: 1984 },
  { make: 'Oldsmobile', model: 'Cutlass', type: 'economy', base: 22_000, from: 1961, until: 1999 },
  { make: 'Buick', model: 'Riviera', type: 'luxury', base: 45_000, from: 1963, until: 1999 },
  { make: 'Cadillac', model: 'Eldorado', type: 'luxury', base: 55_000, from: 1953, until: 2002 },
  { make: 'Lincoln', model: 'Town Car', type: 'luxury', base: 50_000, from: 1981, until: 2011 },
  { make: 'Hummer', model: 'H2', type: 'suv', base: 60_000, from: 2003, until: 2009 },
  { make: 'Land Rover', model: 'Defender', type: 'suv', base: 45_000, from: 1983, until: 2016 },
  { make: 'Volvo', model: '240', type: 'economy', base: 22_000, from: 1974, until: 1993 },
  { make: 'Volvo', model: 'XC90', type: 'luxury', base: 65_000, from: 2002 },
  { make: 'Saab', model: '900', type: 'luxury', base: 38_000, from: 1978, until: 1998 },
  { make: 'Mercedes-Benz', model: 'C-Class', type: 'luxury', base: 48_000, from: 1993 },
  { make: 'BMW', model: '3 Series', type: 'luxury', base: 45_000, from: 1975 },
  { make: 'Audi', model: 'A4', type: 'luxury', base: 42_000, from: 1994 },
  { make: 'Alfa Romeo', model: 'Giulia', type: 'sports', base: 45_000, from: 1962, until: 1978 },
  { make: 'Lada', model: 'Riva', type: 'economy', base: 6_500, from: 1980, until: 2012, only: ['ru', 'ua', 'by', 'kz', 'ge', 'pl', 'cz', 'sk', 'hu', 'ro', 'rs', 'hr', 'ee', 'fi', 'ca', 'eg', 'cu', 'in'] },
  { make: 'Lada', model: 'Niva', type: 'suv', base: 12_000, from: 1977, only: ['ru', 'ua', 'by', 'kz', 'ge', 'pl', 'cz', 'sk', 'hu', 'ro', 'rs', 'hr', 'ee', 'fi', 'ca', 'fr', 'ch', 'cu', 'eg'] },
  { make: 'Lada', model: 'Samara', type: 'economy', base: 7_500, from: 1984, until: 2013, only: ['ru', 'ua', 'by', 'kz', 'ge', 'pl', 'cz', 'sk', 'hu', 'ro', 'fi', 'ca'] },
  { make: 'Moskvitch', model: '412', type: 'economy', base: 7_000, from: 1967, until: 1975, only: ['ru', 'ua', 'by', 'kz', 'ge', 'pl', 'cz', 'bg', 'ro', 'hu', 'fi'] },
  { make: 'GAZ', model: 'Volga', type: 'luxury', base: 14_000, from: 1956, until: 2010, only: ['ru', 'ua', 'by', 'kz', 'ge'] },
  { make: 'Trabant', model: '601', type: 'economy', base: 5_000, from: 1964, until: 1990, only: ['de', 'cz', 'hu', 'pl', 'ro', 'sk'] },
  { make: 'Wartburg', model: '353', type: 'economy', base: 6_000, from: 1966, until: 1988, only: ['de', 'cz', 'hu', 'pl', 'ro', 'sk'] },
  { make: 'Dacia', model: '1300', type: 'economy', base: 6_000, from: 1969, until: 2004, only: ['ro', 'hu', 'bg', 'pl', 'cz', 'sk', 'rs', 'hr', 'fr'] },
  { make: 'Dacia', model: 'Logan', type: 'economy', base: 9_000, from: 2004 },
  { make: 'Dacia', model: 'Duster', type: 'suv', base: 15_000, from: 2010 },
  { make: 'Zastava', model: 'Yugo 45', type: 'economy', base: 5_000, from: 1980, until: 1992, only: ['rs', 'hr', 'us', 'ca', 'gr', 'hu'] },
  { make: 'Chery', model: 'QQ', type: 'economy', base: 5_000, from: 2003, until: 2013, only: ['cn', 'ru', 'ua', 'eg', 'ng', 'ke', 'id', 'pk', 'br', 'cl', 'ir', 'in'] },
  { make: 'BYD', model: 'F3', type: 'economy', base: 8_000, from: 2005, until: 2013, only: ['cn', 'id', 'ru', 'br', 'mx', 'eg', 'ng', 'ke', 'ir', 'pk', 'in'] },
  { make: 'BYD', model: 'Dolphin', type: 'electric', base: 20_000, from: 2021, only: ['cn', 'br', 'mx', 'th', 'id', 'in', 'au', 'gb', 'de', 'fr', 'es', 'it', 'nl', 'tr', 'jp', 'kr', 'sa', 'ae', 'za', 'co', 'cl', 'pe', 'ar'] },
  { make: 'BYD', model: 'Han', type: 'electric', base: 38_000, from: 2020, only: ['cn', 'no', 'se', 'nl', 'de', 'gb', 'au', 'th', 'id'] },
  { make: 'Wuling', model: 'Hongguang Mini EV', type: 'electric', base: 6_000, from: 2020, only: ['cn', 'id', 'th', 'vn', 'ph', 'br', 'mx', 'eg', 'ke'] },
  { make: 'Geely', model: 'Emgrand', type: 'economy', base: 11_000, from: 2009, only: ['cn', 'ru', 'ua', 'eg', 'ng', 'ke', 'ir', 'br', 'cl', 'id', 'pk'] },
  { make: 'Haval', model: 'H6', type: 'suv', base: 20_000, from: 2011, only: ['cn', 'ru', 'au', 'br', 'za', 'eg', 'ng', 'ke', 'th', 'id', 'pe', 'cl', 'mx'] },
  { make: 'Nio', model: 'ES8', type: 'electric', base: 60_000, from: 2018, only: ['cn', 'no', 'de', 'nl', 'dk', 'se'] },
  { make: 'Iran Khodro', model: 'Paykan', type: 'economy', base: 7_000, from: 1967, until: 2005, only: ['ir', 'iq', 'sy'] },
  { make: 'Saipa', model: 'Pride', type: 'economy', base: 7_000, from: 1993, until: 2018, only: ['ir', 'iq', 'sy'] },
  { make: 'Togg', model: 'T10X', type: 'electric', base: 36_000, from: 2023, only: ['tr', 'de'] },
  { make: 'Tofaş', model: 'Şahin', type: 'economy', base: 8_000, from: 1985, until: 2002, only: ['tr'] },
  { make: 'Proton', model: 'Saga', type: 'economy', base: 8_000, from: 1985, only: ['my', 'sg', 'gb', 'au', 'id', 'th', 'bd', 'pk', 'in'] },
  { make: 'Perodua', model: 'Myvi', type: 'economy', base: 11_000, from: 2005, only: ['my', 'bn', 'sg'] },
  { make: 'Innoson', model: 'IVM G5', type: 'suv', base: 25_000, from: 2013, only: ['ng', 'gh', 'cm'] },
]

/** A car on sale new (or as a classic) in that year: model years, classics 20+ years old, EVs once modern EVs exist. */
function carInEra(g: GameState, m: CarModel, year = g.year): boolean {
  if (m.only && !m.only.includes(g.character.countryId)) return false
  if (m.year) return year >= m.year + 20
  if (m.from !== undefined && year < m.from) return false
  if (m.until !== undefined && year > m.until) return false
  // Modern battery cars need the technology; the antique electrics of the 1910s don't.
  if (m.type === 'electric' && (m.from ?? 0) >= 2000 && !hasTech(g, 'electricCars', year)) return false
  return true
}

const CAR_EMOJI: Record<CarType, string> = { economy: '🚗', suv: '🚙', truck: '🛻', electric: '🚘', luxury: '🚘', sports: '🏎️', supercar: '🏎️', classic: '🚗' }
const CAR_UPKEEP: Record<CarType, number> = { economy: 1_500, suv: 2_000, truck: 2_200, electric: 900, luxury: 3_500, sports: 4_000, supercar: 12_000, classic: 2_500 }
const CAR_COLORS = ['Black', 'White', 'Silver', 'Red', 'Blue', 'Gray', 'Green', 'Yellow', 'Orange', 'Burgundy', 'Champagne', 'Teal', 'Matte Black', 'Pearl White']

interface Dealer {
  id: string
  name: string
  /** Localized name pattern ('{w} Motors'), filled with the market's name words. */
  localName?: string
  emoji: string
  blurb: string
  types: CarType[]
  used: boolean
  count: number
}

const DEALERS: Dealer[] = [
  { id: 'used', name: 'Second Chance Auto Sales', emoji: '🚗', blurb: 'Used cars. Some of them even run.', types: ['economy', 'suv', 'truck', 'luxury', 'sports'], used: true, count: 7 },
  { id: 'main', name: 'Main Street Motors', localName: '{w} Motors', emoji: '🚙', blurb: 'New economy cars, SUVs, trucks and EVs', types: ['economy', 'suv', 'truck', 'electric'], used: false, count: 7 },
  { id: 'prestige', name: 'Prestige Auto Group', emoji: '🚘', blurb: 'New luxury sedans and SUVs', types: ['luxury', 'electric'], used: false, count: 6 },
  { id: 'exotic', name: 'Velocity Exotics', emoji: '🏎️', blurb: 'Sports cars, supercars and classics', types: ['sports', 'supercar', 'classic'], used: false, count: 6 },
]

export interface CarListing {
  id: string
  make: string
  model: string
  carType: CarType
  modelYear: number
  isNew: boolean
  condition: number
  price: number
  color: string
  mileage: number
}

export function carListings(g: GameState, dealerId: string): CarListing[] {
  const dealer = DEALERS.find((d) => d.id === dealerId) ?? DEALERS[0]
  const r = seeded(yearKey(g, `cars:${dealer.id}`))
  const pool = CAR_MODELS.filter((m) => dealer.types.includes(m.type) && carInEra(g, m))
  const out: CarListing[] = []
  if (pool.length === 0) return out
  for (let i = 0; i < dealer.count; i++) {
    const m = r.weighted(pool, (x) => (x.rare ? 0.15 : 1) * (x.only ? 3 : 1))
    let modelYear = g.year
    let condition = 100
    let price: number
    let mileage = 0
    if (m.year) {
      modelYear = m.year
      condition = r.int(55, 100)
      price = m.base * (0.6 + 0.6 * (condition / 100))
      mileage = r.int(20_000, 140_000)
    } else if (dealer.used) {
      // Never older than the model itself (no 2012 Model Y on the used lot).
      const age = Math.min(r.int(2, 16), Math.max(0, g.year - (m.from ?? g.year - 16)))
      modelYear = g.year - age
      condition = r.int(15, 85)
      price = m.base * Math.pow(0.86, age) * (0.6 + 0.5 * (condition / 100))
      mileage = age * r.int(7_000, 15_000)
    } else {
      price = m.base * r.float(0.95, 1.08)
    }
    const listing: CarListing = {
      id: `${g.year}:car-${dealer.id}-${i}`,
      make: m.make,
      model: m.model,
      carType: m.type,
      modelYear,
      isNew: !dealer.used && !m.year,
      condition,
      price: nicePrice(Math.max(800, price * carPriceMult(g, m.type))),
      color: r.pick(CAR_COLORS),
      mileage,
    }
    if (!isBought(g, listing.id)) out.push(listing)
  }
  return out.sort((a, b) => a.price - b.price)
}

function carName(l: { modelYear: number; make: string; model: string }): string {
  return `${l.modelYear} ${l.make} ${l.model}`
}

const AUTO_LENDERS = ['the dealer finance office', 'the local credit union', 'the regional bank']

/** Yearly running costs of a car of this type here (fuel, servicing, registration). */
function carUpkeep(g: GameState, type: CarType): number {
  return nicePrice(CAR_UPKEEP[type] * carRunningMult(g, type))
}

/** A dealer's name where the player lives ("Fuji Motors" in Japan, "Main Street Motors" without local words). */
function dealerName(g: GameState, d: Dealer): string {
  return d.localName ? localStoreName(g, `dealer-${d.id}`, d.localName, d.name) : d.name
}

export interface VehicleFinancePlan {
  id: string
  down: number
  years: number
}

export const CAR_PLANS: VehicleFinancePlan[] = [
  { id: 'f10_5', down: 0.1, years: 5 },
  { id: 'f20_3', down: 0.2, years: 3 },
]

interface FinanceCheck {
  ok: boolean
  reason: string
  down: number
  principal: number
  rate: number
  payment: number
}

function vehicleFinance(g: GameState, price: number, plan: VehicleFinancePlan, kind: 'car' | 'personal'): FinanceCheck {
  const c = g.character
  const down = Math.round(price * plan.down)
  const principal = price - down
  const rate = Math.round(Math.max(0.005, offeredRate(g, kind) + (plan.years <= 3 ? -0.005 : 0)) * 10000) / 10000
  const payment = annualPayment(principal, rate, plan.years)
  const base = { down, principal, rate, payment }
  if (c.age < 18) return { ok: false, reason: 'Lenders need you to be 18 to sign for a loan.', ...base }
  if (c.money < down) return { ok: false, reason: `You need ${formatMoney(down)} for the down payment.`, ...base }
  const score = creditScore(g)
  if (score < 540) return { ok: false, reason: `The finance manager looked at your credit score (${score}) and suddenly remembered a meeting.`, ...base }
  const income = yearlyIncome(g) + Math.max(0, c.money - down) / 8
  if (income <= 0 || (payment + yearlyDebtPayments(g)) / income > 0.5) {
    return { ok: false, reason: `Your loan application was denied. They don't think you can afford ${formatMoney(payment)} a year in payments.`, ...base }
  }
  return { ok: true, reason: '', ...base }
}

/** Buy a car with cash (plan null) or an auto loan. Returns true on success. */
export function buyCar(g: GameState, l: CarListing, plan: VehicleFinancePlan | null): boolean {
  const c = g.character
  const reason = adultReason(g, 'buy a car')
  if (reason) {
    notice(g, 'Car Dealership', reason, { emoji: '🚗' })
    return false
  }
  if (isBought(g, l.id)) {
    notice(g, 'Sold!', 'Someone else drove that one off the lot while you were thinking.', { emoji: '🏷️' })
    return false
  }
  const name = carName(l)
  let loanId: string | undefined
  if (!plan) {
    if (!spend(g, l.price, 'asset.buy')) {
      cantAfford(g, l.price, `the ${name}`)
      return false
    }
  } else {
    const f = vehicleFinance(g, l.price, plan, 'car')
    if (!f.ok) {
      notice(g, 'Loan Denied', f.reason, { emoji: '🏦', tone: 'bad' })
      return false
    }
    spend(g, f.down, 'asset.buy')
    loanId = addLoan(g, { kind: 'car', lender: realLender(g, localLenders(g, ['{w} Auto Finance', '{w} Motor Credit'], ['the dealer finance office', 'the local credit union'], AUTO_LENDERS)), principal: f.principal, rate: f.rate, years: plan.years, to: 'pool:retail' }).id
  }
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: 'car',
    name,
    emoji: CAR_EMOJI[l.carType],
    purchasePrice: l.price,
    // Driving it off the lot costs you a chunk of value immediately.
    value: l.isNew ? nicePrice(l.price * 0.9) : l.price,
    condition: l.condition,
    purchasedAge: c.age,
    upkeep: carUpkeep(g, l.carType),
    details: { make: l.make, model: l.model, modelYear: l.modelYear, carType: l.carType, color: l.color, isNew: l.isNew, mileage: l.mileage, insured: false, ...(loanId ? { loanId } : {}) },
  }
  g.assets.push(asset)
  markBought(g, l.id)
  count(g, 'carsBought')
  count(g, 'purchases')
  addStat(g, 'happiness', randInt(g, 5, 12))
  log(g, `I bought a ${l.color.toLowerCase()} ${name}${loanId ? ' with an auto loan' : ''}.`, 'good')
  let text = `You drove a ${l.color.toLowerCase()} ${name} off the lot${loanId ? ' with a car loan' : ` for ${formatMoney(l.price)}`}. ${pick(g, ['That new car smell is intoxicating.', 'You honked at nobody, just because you could.', hasTech(g, 'smartphone') ? 'You took 40 selfies with it in the parking lot.' : 'You drove it slowly past every house you know.'])}`
  const tax = salesTaxNote(g, l.price)
  if (tax) text += ` ${tax}`
  if (localPriceMult(g, 'car') >= 1.6) text += ` ${pickLine(g, ['A big chunk of the sticker price was duties and registration tax.', 'The government made more on this car than the dealer did.'])}`
  if (!hasLicense(g, 'driver')) text += " Heads up: you don't have a driver's license, so for now it's a very expensive lawn ornament."
  notice(g, 'New Wheels!', text, { emoji: CAR_EMOJI[l.carType], tone: 'good' })
  return true
}

const BUY_CAR = defineScript('assets.buyCar', (g, choice, data) => {
  const l = field<CarListing>(data, 'listing')
  if (!l || choice === 'cancel') return
  if (choice === 'cash') buyCar(g, l, null)
  else {
    const plan = CAR_PLANS.find((p) => p.id === choice)
    if (plan) buyCar(g, l, plan)
  }
})

function carListingAction(l: CarListing): MenuAction {
  return {
    type: 'action',
    id: `car-${l.id}`,
    label: carName(l),
    emoji: CAR_EMOJI[l.carType],
    subtitle: `${formatMoney(l.price)} · ${l.color} · ${l.isNew ? 'New' : `Used · Condition ${l.condition}%`}`,
    run: (g) => {
      const reason = adultReason(g, 'buy a car')
      if (reason) {
        notice(g, 'Car Dealership', reason, { emoji: '🚗' })
        return
      }
      const lines = [`${l.color} ${carName(l)}`, l.isNew ? 'Brand new' : `${l.mileage.toLocaleString('en-US')} miles · Condition ${conditionLabel(l.condition)} (${l.condition}%)`, `Price: ${formatMoney(l.price)}${salesTaxLabel(g) ? ` (incl. ${salesTaxLabel(g)})` : ''}`, `Running costs: about ${formatMoney(carUpkeep(g, l.carType))}/year`]
      if (!hasLicense(g, 'driver')) lines.push("Note: you don't have a driver's license yet.")
      const choices: ChoiceOption[] = [{ id: 'cash', label: `Pay cash (${formatMoney(l.price)})`, emoji: '💵' }]
      for (const plan of CAR_PLANS) {
        const f = vehicleFinance(g, l.price, plan, 'car')
        choices.push({ id: plan.id, label: `Finance: ${Math.round(plan.down * 100)}% down (${shortMoney(f.down)}), ${plan.years}-yr loan at ${(f.rate * 100).toFixed(1)}% (${shortMoney(f.payment)}/yr)`, emoji: '🏦' })
      }
      choices.push({ id: 'cancel', label: 'Never mind', emoji: '✖️' })
      scriptChoice(g, BUY_CAR, `${CAR_EMOJI[l.carType]} ${carName(l)}`, lines.join('\n'), choices, { emoji: CAR_EMOJI[l.carType], data: { listing: toJson(l) } })
    },
  }
}

export const carDealersMenu: MenuGroup = {
  type: 'menu',
  id: 'carDealers',
  label: 'Car Dealerships',
  emoji: '🚗',
  subtitle: 'New, used, luxury and exotic cars',
  disabledReason: (g) => adultReason(g, 'buy a car'),
  header: (g) => [`You have ${formatMoney(g.character.money)}.`, hasLicense(g, 'driver') ? '' : "You don't have a driver's license, but nobody checks at the dealership.", carMarketNote(g)].filter(Boolean).join(' '),
  children: (g) =>
    DEALERS.map(
      (d): MenuGroup => ({
        type: 'menu',
        id: `dealer-${d.id}`,
        label: dealerName(g, d),
        emoji: d.emoji,
        subtitle: (gg) => (d.id === 'main' && !hasTech(gg, 'electricCars') ? 'New economy cars, SUVs and trucks' : d.id === 'exotic' && gg.year < 1975 ? 'Sports cars and the fastest machines money can buy' : d.blurb),
        header: (gg) => `Inventory changes every year. ${pricesIncludeTax(gg)}`.trim(),
        children: (g) => {
          const list = carListings(g, d.id)
          return list.length ? list.map(carListingAction) : [{ type: 'info', id: 'sold', text: 'The lot is empty. Come back next year.', emoji: '🪧' }]
        },
      }),
    ),
}

// ---------------------------------------------------------------------------
// Boats & aircraft (specialty vehicles)

interface VehicleModel {
  label: string
  emoji: string
  min: number
  max: number
  license: string | null
  rare?: boolean
  upkeepRate: number
  /** First year it's for sale (no jet skis in 1960, no business jets before the 1960s). */
  from?: number
  /** Last year it's for sale new. */
  until?: number
}

const BOATS: VehicleModel[] = [
  { label: 'Kayak', emoji: '🛶', min: 600, max: 2_000, license: null, upkeepRate: 0.02 },
  { label: 'Canoe', emoji: '🛶', min: 700, max: 2_200, license: null, upkeepRate: 0.02 },
  { label: 'Paddle Boat', emoji: '🦢', min: 1_500, max: 4_000, license: null, upkeepRate: 0.03 },
  { label: 'Jet Ski', emoji: '🚤', min: 9_000, max: 18_000, license: 'boating', upkeepRate: 0.08, from: 1973 },
  { label: 'Fishing Boat', emoji: '🚤', min: 25_000, max: 60_000, license: 'boating', upkeepRate: 0.07 },
  { label: 'Pontoon Boat', emoji: '⛴️', min: 30_000, max: 70_000, license: 'boating', upkeepRate: 0.07, from: 1952 },
  { label: 'Speedboat', emoji: '🚤', min: 60_000, max: 180_000, license: 'boating', upkeepRate: 0.08, from: 1915 },
  { label: 'Sailboat', emoji: '⛵', min: 80_000, max: 300_000, license: 'boating', upkeepRate: 0.06 },
  { label: 'Houseboat', emoji: '🛥️', min: 150_000, max: 450_000, license: 'boating', upkeepRate: 0.06 },
  { label: 'Catamaran', emoji: '⛵', min: 350_000, max: 1_200_000, license: 'boating', upkeepRate: 0.07, from: 1960 },
  { label: 'Tugboat', emoji: '⛴️', min: 600_000, max: 1_500_000, license: 'boating', upkeepRate: 0.06 },
  { label: 'Yacht', emoji: '🛥️', min: 2_500_000, max: 18_000_000, license: 'boating', upkeepRate: 0.1 },
  { label: 'Superyacht', emoji: '🛳️', min: 60_000_000, max: 300_000_000, license: 'boating', rare: true, upkeepRate: 0.1, from: 1980 },
]

const AIRCRAFT: VehicleModel[] = [
  { label: 'Hot Air Balloon', emoji: '🎈', min: 40_000, max: 90_000, license: 'pilot', upkeepRate: 0.06, from: 1960 },
  { label: 'Ultralight', emoji: '🛩️', min: 25_000, max: 70_000, license: 'pilot', upkeepRate: 0.06, from: 1975 },
  { label: 'Vintage Biplane', emoji: '🛩️', min: 150_000, max: 400_000, license: 'pilot', upkeepRate: 0.06, from: 1955 },
  { label: 'Single-Engine Prop Plane', emoji: '🛩️', min: 200_000, max: 600_000, license: 'pilot', upkeepRate: 0.06, from: 1912 },
  { label: 'Seaplane', emoji: '🛩️', min: 500_000, max: 1_400_000, license: 'pilot', upkeepRate: 0.07, from: 1914 },
  { label: 'Helicopter', emoji: '🚁', min: 1_200_000, max: 5_000_000, license: 'pilot', upkeepRate: 0.08, from: 1947 },
  { label: 'Decommissioned Fighter Jet', emoji: '✈️', min: 3_000_000, max: 9_000_000, license: 'pilot', upkeepRate: 0.1, from: 1965 },
  { label: 'Business Jet', emoji: '✈️', min: 9_000_000, max: 35_000_000, license: 'pilot', upkeepRate: 0.08, from: 1964 },
  { label: 'Private Airliner', emoji: '✈️', min: 80_000_000, max: 130_000_000, license: 'pilot', rare: true, upkeepRate: 0.08, from: 1970 },
  // Earlier aircraft (appended so today's hangar is unchanged): sold new in their day.
  { label: 'Biplane', emoji: '🛩️', min: 120_000, max: 350_000, license: 'pilot', upkeepRate: 0.07, from: 1910, until: 1954 },
  { label: 'Gas Balloon', emoji: '🎈', min: 30_000, max: 80_000, license: 'pilot', upkeepRate: 0.06, until: 1959 },
]

export interface VehicleListing {
  id: string
  kind: 'boat' | 'aircraft'
  label: string
  emoji: string
  price: number
  isNew: boolean
  condition: number
  license: string | null
  upkeepRate: number
}

export function vehicleListings(g: GameState, kind: 'boat' | 'aircraft'): VehicleListing[] {
  const r = seeded(yearKey(g, `vehicles:${kind}`))
  const pool = (kind === 'boat' ? BOATS : AIRCRAFT).filter((m) => g.year >= (m.from ?? 0) && g.year <= (m.until ?? Infinity))
  const mult = globalGoodsMult(g)
  const out: VehicleListing[] = []
  if (pool.length === 0) return out
  const n = kind === 'boat' ? 7 : 6
  for (let i = 0; i < n; i++) {
    const m = r.weighted(pool, (x) => (x.rare ? 0.2 : 1))
    const isNew = r.chance(0.55)
    const condition = isNew ? 100 : r.int(30, 90)
    const base = m.min + (m.max - m.min) * Math.pow(r.next(), 1.3)
    const price = nicePrice(base * mult * (isNew ? 1 : 0.45 + 0.4 * (condition / 100)))
    const l: VehicleListing = { id: `${g.year}:${kind}-${i}`, kind, label: m.label, emoji: m.emoji, price, isNew, condition, license: m.license, upkeepRate: m.upkeepRate }
    if (!isBought(g, l.id)) out.push(l)
  }
  return out.sort((a, b) => a.price - b.price)
}

function licenseName(license: string): string {
  return license === 'pilot' ? "a pilot's license" : license === 'boating' ? 'a boating license' : license === 'driver' ? "a driver's license" : `a ${license} license`
}

export function buyVehicle(g: GameState, l: VehicleListing, plan: VehicleFinancePlan | null): boolean {
  const c = g.character
  const what = l.kind === 'boat' ? 'buy a boat' : 'buy an aircraft'
  const reason = adultReason(g, what)
  if (reason) {
    notice(g, 'Dealer', reason, { emoji: l.emoji })
    return false
  }
  if (l.license && !hasLicense(g, l.license)) {
    notice(g, 'License Required', `You need ${licenseName(l.license)} to buy a ${l.label.toLowerCase()}. Get one from Activities → Licenses.`, { emoji: '🪪' })
    return false
  }
  if (isBought(g, l.id)) {
    notice(g, 'Sold!', 'That one already sold.', { emoji: '🏷️' })
    return false
  }
  let loanId: string | undefined
  if (!plan) {
    if (!spend(g, l.price, 'asset.buy')) {
      cantAfford(g, l.price, `the ${l.label.toLowerCase()}`)
      return false
    }
  } else {
    const f = vehicleFinance(g, l.price, plan, 'personal')
    if (!f.ok) {
      notice(g, 'Loan Denied', f.reason, { emoji: '🏦', tone: 'bad' })
      return false
    }
    spend(g, f.down, 'asset.buy')
    const lenders = l.kind === 'boat' ? ['a marine lender', 'the regional bank'] : ['an aviation lender', 'the regional bank']
    loanId = addLoan(g, { kind: 'personal', lender: realLender(g, localLenders(g, ['{w} Savings Bank'], [lenders[0]], lenders)), principal: f.principal, rate: f.rate, years: plan.years, to: 'pool:retail' }).id
  }
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: l.kind,
    name: l.label,
    emoji: l.emoji,
    purchasePrice: l.price,
    value: l.isNew ? nicePrice(l.price * 0.92) : l.price,
    condition: l.condition,
    purchasedAge: c.age,
    upkeep: nicePrice(l.price * l.upkeepRate),
    details: { isNew: l.isNew, insured: false, license: l.license, ...(loanId ? { loanId } : {}) },
  }
  g.assets.push(asset)
  markBought(g, l.id)
  count(g, 'purchases')
  addStat(g, 'happiness', randInt(g, 6, 14))
  log(g, `I bought a ${l.isNew ? 'new' : 'used'} ${l.label.toLowerCase()}.`, 'good')
  notice(
    g,
    l.kind === 'boat' ? 'Anchors Aweigh!' : 'Cleared for Takeoff!',
    `You bought a ${l.isNew ? 'brand-new' : 'used'} ${l.label.toLowerCase()} for ${formatMoney(l.price)}${loanId ? ' (financed)' : ''}. ${l.kind === 'boat' ? pickLine(g, ['You named it after your ex. Out of spite.', 'You already bought a captain\'s hat.', 'A boat: a hole in the water you throw money into.']) : pickLine(g, ['The salesperson saluted you on the way out.', 'You practiced your "this is your captain speaking" voice all the way home.', 'Upkeep is going to be brutal, but look at it!'])}${salesTaxNote(g, l.price) ? ` ${salesTaxNote(g, l.price)}` : ''}`,
    { emoji: l.emoji, tone: 'good' },
  )
  return true
}

const BUY_VEHICLE = defineScript('assets.buyVehicle', (g, choice, data) => {
  const l = field<VehicleListing>(data, 'listing')
  if (!l || choice === 'cancel') return
  if (choice === 'cash') buyVehicle(g, l, null)
  else {
    const plan = CAR_PLANS.find((p) => p.id === choice)
    if (plan) buyVehicle(g, l, plan)
  }
})

function vehicleListingAction(l: VehicleListing): MenuAction {
  return {
    type: 'action',
    id: `veh-${l.id}`,
    label: l.label,
    emoji: l.emoji,
    subtitle: `${formatMoney(l.price)} · ${l.isNew ? 'New' : `Used · Condition ${l.condition}%`}${l.license ? '' : ' · No license needed'}`,
    disabledReason: (g) => (l.license && !hasLicense(g, l.license) ? `You need ${licenseName(l.license)} to buy this.` : null),
    run: (g) => {
      const choices: ChoiceOption[] = [{ id: 'cash', label: `Pay cash (${formatMoney(l.price)})`, emoji: '💵' }]
      if (l.price >= 20_000) {
        for (const plan of CAR_PLANS) {
          const f = vehicleFinance(g, l.price, plan, 'personal')
          choices.push({ id: plan.id, label: `Finance: ${Math.round(plan.down * 100)}% down (${shortMoney(f.down)}), ${plan.years} yrs at ${(f.rate * 100).toFixed(1)}%`, emoji: '🏦' })
        }
      }
      choices.push({ id: 'cancel', label: 'Never mind', emoji: '✖️' })
      const text = `${l.isNew ? 'Brand new' : `Used, condition ${conditionLabel(l.condition)} (${l.condition}%)`}\nPrice: ${formatMoney(l.price)}${salesTaxLabel(g) ? ` (incl. ${salesTaxLabel(g)})` : ''}\nEstimated upkeep: ${formatMoney(nicePrice(l.price * l.upkeepRate))}/year`
      scriptChoice(g, BUY_VEHICLE, `${l.emoji} ${l.label}`, text, choices, { emoji: l.emoji, data: { listing: toJson(l) } })
    },
  }
}

function vehicleDealerMenu(g: GameState, kind: 'boat' | 'aircraft'): MenuGroup {
  return {
    type: 'menu',
    id: kind === 'boat' ? 'boatDealer' : 'aircraftDealer',
    label: kind === 'boat' ? localStoreName(g, 'marine', '{w} Marine', 'Harborside Marine') : localStoreName(g, 'aviation', '{w} Aviation', 'Skyline Aviation'),
    emoji: kind === 'boat' ? '⛵' : '✈️',
    subtitle: kind === 'boat' ? 'Boats, from kayaks to yachts' : g.year >= 1964 ? 'Planes, helicopters and jets' : g.year >= 1947 ? 'Planes and helicopters' : 'Flying machines of every kind',
    disabledReason: (gg) => adultReason(gg, kind === 'boat' ? 'buy a boat' : 'buy an aircraft'),
    header: (gg) =>
      `${
        kind === 'boat'
          ? `Motorboats need a boating license${hasLicense(gg, 'boating') ? ' (you have one)' : ''}. You have ${formatMoney(gg.character.money)}.`
          : `Every aircraft needs a pilot's license${hasLicense(gg, 'pilot') ? ' (you have one)' : ''}. You have ${formatMoney(gg.character.money)}.`
      } ${pricesIncludeTax(gg)}`.trim(),
    children: (gg) => {
      const list = vehicleListings(gg, kind)
      return list.length ? list.map(vehicleListingAction) : [{ type: 'info', id: 'sold', text: 'Nothing left in stock this year.', emoji: '🪧' }]
    },
  }
}

export const specialtyVehiclesMenu: MenuGroup = {
  type: 'menu',
  id: 'specialtyVehicles',
  label: 'Specialty Vehicles',
  emoji: '🛥️',
  subtitle: 'Boats and aircraft',
  disabledReason: (g) => adultReason(g, 'buy boats or aircraft'),
  children: (g) => [vehicleDealerMenu(g, 'boat'), vehicleDealerMenu(g, 'aircraft')],
}

// ---------------------------------------------------------------------------
// Stores: jewelry, instruments, electronics, luxury, art & collectibles

export interface ItemListing {
  id: string
  kind: AssetKind
  category: string
  name: string
  emoji: string
  price: number
  /** Resale value right after purchase. */
  value: number
  condition: number
  isNew: boolean
  details: Record<string, Json>
}

interface JewelType {
  id: string
  label: string
  emoji: string
  gem: string | null
  per?: number
  fixed?: [number, number]
  engagement?: boolean
}

const JEWEL_TYPES: JewelType[] = [
  { id: 'diamondRing', label: 'Diamond Ring', emoji: '💍', gem: 'diamond', per: 4_500 },
  { id: 'sapphireRing', label: 'Sapphire Ring', emoji: '💍', gem: 'sapphire', per: 1_800 },
  { id: 'rubyRing', label: 'Ruby Ring', emoji: '💍', gem: 'ruby', per: 2_500 },
  { id: 'emeraldRing', label: 'Emerald Ring', emoji: '💍', gem: 'emerald', per: 2_200 },
  { id: 'goldBand', label: 'Gold Band', emoji: '💍', gem: null, fixed: [400, 1_500] },
  { id: 'diamondStuds', label: 'Diamond Stud Earrings', emoji: '💎', gem: 'diamond', per: 3_800 },
  { id: 'pearlEarrings', label: 'Pearl Earrings', emoji: '🦪', gem: null, fixed: [300, 2_000] },
  { id: 'hoops', label: 'Gold Hoop Earrings', emoji: '✨', gem: null, fixed: [250, 1_200] },
  { id: 'diamondPendant', label: 'Diamond Pendant', emoji: '📿', gem: 'diamond', per: 4_000 },
  { id: 'goldChain', label: 'Gold Chain', emoji: '📿', gem: null, fixed: [600, 4_000] },
  { id: 'pearlNecklace', label: 'Pearl Necklace', emoji: '📿', gem: null, fixed: [800, 12_000] },
  { id: 'tennisBracelet', label: 'Diamond Tennis Bracelet', emoji: '💫', gem: 'diamond', per: 3_000 },
  { id: 'charm', label: 'Gold Charm', emoji: '🧿', gem: null, fixed: [150, 900] },
]

const ENGAGEMENT_TYPES: JewelType[] = [
  { id: 'solitaire', label: 'Solitaire Engagement Ring', emoji: '💍', gem: 'diamond', per: 5_200, engagement: true },
  { id: 'halo', label: 'Halo Engagement Ring', emoji: '💍', gem: 'diamond', per: 5_600, engagement: true },
  { id: 'princess', label: 'Princess-Cut Engagement Ring', emoji: '💍', gem: 'diamond', per: 5_000, engagement: true },
  { id: 'threeStone', label: 'Three-Stone Engagement Ring', emoji: '💍', gem: 'diamond', per: 4_800, engagement: true },
  { id: 'vintage', label: 'Vintage Engagement Ring', emoji: '💍', gem: 'diamond', per: 4_400, engagement: true },
]

function jewelItem(g: GameState, r: SRng, t: JewelType, id: string, fake: boolean): ItemListing {
  const mult = localGoodsMult(g, 'luxury')
  const quality = r.int(20, 100)
  let carats = 0
  let price: number
  if (t.gem && t.per) {
    carats = Math.round(r.float(0.25, r.chance(0.1) ? 6 : t.engagement ? 3 : 2.5) * 4) / 4 || 0.25
    price = t.per * Math.pow(carats, 1.5) * (0.6 + 0.8 * (quality / 100))
  } else {
    const [lo, hi] = t.fixed ?? [200, 1_000]
    price = lo + (hi - lo) * r.next() * (0.6 + 0.4 * (quality / 100))
  }
  price *= mult
  if (fake) price *= r.float(0.03, 0.08)
  const finalPrice = nicePrice(Math.max(20, price))
  const baseName = carats ? `${carats}-Carat ${t.label}` : t.label
  // Certified pieces use a real jeweler from the shared, era-gated registry. Costume jewelry
  // stays generic so the game never attributes a counterfeit to a real house.
  const name = fake ? baseName : gadgetName(g, { category: 'jewelry', mode: 'prefix' }, `jewel-${id}`, baseName) ?? baseName
  return {
    id,
    kind: 'jewelry',
    category: 'jewelry',
    name,
    emoji: t.emoji,
    price: finalPrice,
    value: nicePrice(finalPrice * (fake ? 0.35 : 0.75)),
    condition: 100,
    isNew: true,
    details: { category: 'jewelry', jewelType: t.id, gem: t.gem, carats, quality, fake, engagement: t.engagement === true, appraised: false },
  }
}

export function jewelryListings(g: GameState, store: 'real' | 'fake'): ItemListing[] {
  const r = seeded(yearKey(g, `jewelry:${store}`))
  const out: ItemListing[] = []
  for (let i = 0; i < 7; i++) out.push(jewelItem(g, r, r.pick(JEWEL_TYPES), `${g.year}:jewel-${store}-${i}`, store === 'fake'))
  for (let i = 0; i < 4; i++) out.push(jewelItem(g, r, r.pick(ENGAGEMENT_TYPES), `${g.year}:ering-${store}-${i}`, store === 'fake'))
  return out.filter((x) => !isBought(g, x.id))
}

const INSTRUMENTS: [string, string, number][] = [
  ['Kazoo', '🎶', 5],
  ['Recorder', '🪈', 20],
  ['Tambourine', '🪇', 25],
  ['Harmonica', '🎶', 40],
  ['Ukulele', '🪕', 90],
  ['Banjo', '🪕', 400],
  ['Acoustic Guitar', '🎸', 300],
  ['Electric Guitar', '🎸', 800],
  ['Bass Guitar', '🎸', 700],
  ['Violin', '🎻', 600],
  ['Cello', '🎻', 2_500],
  ['Flute', '🪈', 900],
  ['Clarinet', '🎷', 700],
  ['Saxophone', '🎷', 1_800],
  ['Trumpet', '🎺', 800],
  ['Trombone', '🎺', 900],
  ['Drum Kit', '🥁', 1_200],
  ['Keyboard', '🎹', 400],
  ['Accordion', '🪗', 1_500],
  ['Bagpipes', '🎶', 1_200],
  ['Harp', '🎼', 9_000],
  ['Upright Piano', '🎹', 5_000],
  ['Grand Piano', '🎹', 45_000],
]

/** Who made them: real instrument makers that traded in your country and year. */
const INSTRUMENT_MAKERS: Record<string, string[]> = {
  'Acoustic Guitar': ['yamaha', 'gibson', 'fender'],
  'Electric Guitar': ['fender', 'gibson', 'ibanez', 'yamaha'],
  'Bass Guitar': ['fender', 'ibanez', 'yamaha'],
  Violin: ['yamaha'],
  Cello: ['yamaha'],
  Flute: ['yamaha'],
  Clarinet: ['yamaha'],
  Saxophone: ['yamaha'],
  Trumpet: ['yamaha'],
  Trombone: ['yamaha'],
  'Drum Kit': ['pearl-drums', 'yamaha'],
  Keyboard: ['casio-instruments', 'yamaha', 'roland'],
  'Upright Piano': ['yamaha', 'steinway'],
  'Grand Piano': ['steinway', 'yamaha'],
}

export function instrumentListings(g: GameState): ItemListing[] {
  const r = seeded(yearKey(g, 'instruments'))
  const mult = goodsMult(g)
  const out: ItemListing[] = []
  INSTRUMENTS.forEach(([label, emoji, base], i) => {
    const isNew = r.chance(0.6)
    const condition = isNew ? 100 : r.int(35, 90)
    const price = nicePrice(base * mult * (isNew ? r.float(0.95, 1.1) : 0.35 + 0.4 * (condition / 100)))
    out.push({ id: `${g.year}:inst-${i}`, kind: 'instrument', category: 'instrument', name: `${isNew ? '' : 'Used '}${INSTRUMENT_MAKERS[label] ? gadgetName(g, { ids: INSTRUMENT_MAKERS[label], mode: 'prefix' }, `inst-${i}`, label) ?? label : label}`, emoji, price, value: nicePrice(price * 0.7), condition, isNew, details: { category: 'instrument', instrument: label } })
  })
  return out.filter((x) => !isBought(g, x.id))
}

interface Gadget {
  label: string
  emoji: string
  /** Price in today's dollars (what it cost then, in real terms). */
  base: number
  /** On sale from / until these years (inclusive). */
  from?: number
  until?: number
  /** Needs this technology where the player lives. */
  tech?: TechId
  /** The name in a given year ("16-Bit Game Console" in 1991). */
  name?: (year: number) => string
  /** The price in a given year, today's dollars (computers cost a fortune in 1985). */
  price?: (year: number) => number
  /** Real makers and models: the listing is named after one that traded where you live this year. */
  brand?: GadgetSpec | ((year: number) => GadgetSpec)
}

const LAPTOP_LINES = /t1100|book|thinkpad|portable|satellite|port[eé]g[eé]|lifebook|note|laptop|surface|eee|chromebook|inspiron|xps|aspire|pavilion|spectre|ideapad|legion|zenbook|blade/i
const TV_MAKERS = ['sony', 'samsung-electronics', 'lg-electronics', 'panasonic', 'philips', 'tcl', 'hisense', 'sharp', 'toshiba', 'hitachi', 'rca', 'zenith', 'philco', 'magnavox', 'grundig', 'telefunken', 'loewe', 'vizio', 'jvc', 'sanyo', 'thomson']
const FILM_CAMERA_MAKERS = ['canon', 'nikon', 'kodak', 'fujifilm', 'olympus', 'pentax', 'minolta', 'polaroid']
const DIGITAL_CAMERA_MAKERS = [
  ['fujifilm', 1989],
  ['kodak', 1991],
  ['minolta', 1995],
  ['canon', 1996],
  ['olympus', 1996],
  ['polaroid', 1996],
  ['sony', 1996],
  ['nikon', 1997],
  ['pentax', 1997],
  ['panasonic', 2001],
] as const
const MIRRORLESS_CAMERA_MAKERS = [
  ['panasonic', 2008],
  ['olympus', 2009],
  ['sony', 2010],
  ['nikon', 2011],
  ['canon', 2012],
  ['fujifilm', 2012],
] as const
const AV_MAKERS = ['sony', 'panasonic', 'philips', 'toshiba', 'pioneer', 'samsung-electronics', 'lg-electronics', 'sharp', 'jvc', 'hitachi', 'sanyo', 'technics', 'aiwa']

// Today's gadgets first (in their original order, so today's store is unchanged), then the
// gadgets of earlier decades. Prices are real terms: a 1985 VCR at $1,200 of today's money.
const ELECTRONICS: Gadget[] = [
  { label: 'Smartphone', emoji: '📱', base: 900, tech: 'smartphone', brand: { category: 'phone', mode: 'model' } },
  { label: 'Laptop', emoji: '💻', base: 1_300, from: 1995, tech: 'homeComputer', price: (y) => (y >= 2010 ? 1_300 : Math.round(computerUsd(y) * 1.4)), brand: { category: 'computer', mode: 'model', suffix: 'Laptop', accept: LAPTOP_LINES, already: /macbook|chromebook|thinkpad|notebook|zenbook|surface|laptop/i } },
  {
    label: 'Gaming Console',
    emoji: '🎮',
    base: 500,
    tech: 'videoGameConsole',
    name: (y) => (y < 1985 ? 'Cartridge Game Console' : y < 1995 ? '16-Bit Game Console' : y < 2006 ? '3D Game Console' : y < 2013 ? 'HD Game Console' : 'Gaming Console'),
    price: (y) => (y >= 2013 ? 500 : y >= 1995 ? 750 : 900),
    brand: { category: 'console', segment: 'home', mode: 'model', suffix: 'Console' },
  },
  { label: 'Gaming PC', emoji: '🖥️', base: 2_200, from: 1997, tech: 'homeComputer', price: (y) => (y >= 2010 ? 2_200 : Math.round(computerUsd(y) * 1.5)), brand: { ids: ['alienware', 'razer', 'msi', 'asus', 'acer', 'hp', 'lenovo', 'dell'], mode: 'prefix' } },
  { label: 'Tablet', emoji: '📲', base: 600, from: 2010, brand: { category: 'tablet', mode: 'model' } },
  { label: '4K Smart TV', emoji: '📺', base: 1_100, from: 2014, brand: { ids: TV_MAKERS, mode: 'prefix' } },
  { label: 'VR Headset', emoji: '🥽', base: 500, from: 2016, brand: { category: 'electronics', segment: 'vr', mode: 'model' } },
  { label: 'Camera Drone', emoji: '🛸', base: 800, from: 2014, brand: { category: 'electronics', segment: 'drone', mode: 'model', suffix: 'Drone' } },
  { label: 'Smartwatch', emoji: '⌚', base: 400, from: 2015, brand: { category: 'electronics', segment: 'wearable', mode: 'brand', suffix: 'Smartwatch', already: /watch/i } },
  { label: 'Noise-Canceling Headphones', emoji: '🎧', base: 350, from: 2008, brand: { ids: ['bose', 'sennheiser', 'sony', 'beats', 'jbl', 'panasonic'], mode: 'prefix' } },
  { label: 'Mirrorless Camera', emoji: '📷', base: 1_500, from: 2008, brand: (year) => ({ ids: idsOnSale(year, MIRRORLESS_CAMERA_MAKERS), mode: 'prefix' }) },
  { label: 'E-Reader', emoji: '📖', base: 150, from: 2008, brand: { category: 'electronics', segment: 'ereader', mode: 'brand', suffix: 'E-Reader' } },
  { label: 'Smart Speaker', emoji: '🔊', base: 100, from: 2015, brand: { category: 'electronics', segment: 'speaker', mode: 'brand', suffix: 'Smart Speaker', already: /echo|home|pod/i } },
  { label: 'Robot Vacuum', emoji: '🤖', base: 450, from: 2003, brand: { category: 'electronics', segment: 'vacuum', mode: 'brand', suffix: 'Robot Vacuum' } },
  // Earlier decades.
  { label: 'Phonograph', emoji: '🎶', base: 1_500, until: 1950, brand: { category: 'electronics', segment: 'phonograph', mode: 'prefix' } },
  { label: 'Tube Radio', emoji: '📻', base: 1_200, tech: 'radio', until: 1960, brand: { ids: ['philco', 'rca', 'emerson-radio', 'zenith', 'grundig', 'telefunken', 'philips', 'magnavox', 'blaupunkt'], mode: 'prefix' } },
  { label: 'Transistor Radio', emoji: '📻', base: 300, tech: 'radio', from: 1955, until: 1990, brand: { ids: ['regency-radio', 'sony', 'panasonic', 'sharp', 'philips', 'grundig', 'toshiba', 'hitachi'], mode: 'prefix' } },
  { label: 'Black-and-White TV', emoji: '📺', base: 3_000, tech: 'tv', until: 1975, brand: { ids: TV_MAKERS, mode: 'prefix' } },
  { label: 'Color TV', emoji: '📺', base: 2_500, tech: 'colorTv', until: 2004, price: (y) => (y < 1975 ? 4_500 : y < 1990 ? 2_200 : 1_200), brand: { ids: TV_MAKERS, mode: 'prefix' } },
  { label: 'Hi-Fi Record Player', emoji: '🎶', base: 1_200, from: 1955, until: 1995, brand: { ids: ['technics', 'pioneer', 'marantz', 'philips', 'grundig', 'telefunken', 'sony', 'panasonic'], mode: 'prefix' } },
  { label: 'Electric Typewriter', emoji: '⌨️', base: 900, from: 1950, until: 1995, brand: { category: 'electronics', segment: 'typewriter', mode: 'prefix' } },
  { label: 'Film Camera', emoji: '📷', base: 500, until: 2005, brand: { ids: FILM_CAMERA_MAKERS, mode: 'prefix' } },
  { label: 'Portable Cassette Player', emoji: '📼', base: 250, from: 1979, until: 2002, brand: { ids: ['sony', 'panasonic', 'aiwa', 'toshiba', 'sharp', 'philips'], mode: 'prefix' } },
  { label: 'VCR', emoji: '📼', base: 1_200, from: 1978, until: 2006, price: (y) => (y < 1985 ? 2_500 : y < 1995 ? 700 : 250), brand: { ids: ['jvc', 'sony', 'panasonic', 'philips', 'sharp', 'sanyo', 'hitachi', 'toshiba', 'samsung-electronics', 'lg-electronics'], mode: 'prefix' } },
  { label: 'Camcorder', emoji: '📹', base: 2_000, from: 1984, until: 2012, brand: { ids: ['sony', 'jvc', 'panasonic', 'canon', 'sharp', 'hitachi'], mode: 'prefix' } },
  { label: 'Pager', emoji: '📟', base: 250, from: 1985, until: 2002, brand: { ids: ['motorola-pager'], mode: 'brand' } },
  { label: 'Mobile Phone', emoji: '📱', base: 4_000, tech: 'mobilePhone', until: 1996, name: (y) => (y < 1992 ? 'Brick Mobile Phone' : 'Mobile Phone'), brand: { category: 'phone', mode: 'model', suffix: 'Mobile Phone' } },
  { label: 'Flip Phone', emoji: '📱', base: 400, tech: 'mobilePhone', from: 1996, until: 2012, brand: { category: 'phone', mode: 'model', suffix: 'Phone' } },
  { label: 'CD Player', emoji: '💿', base: 600, from: 1983, until: 2008, brand: { ids: ['sony', 'philips', 'technics', 'pioneer', 'panasonic', 'aiwa', 'toshiba', 'marantz'], mode: 'prefix' } },
  { label: 'Portable CD Player', emoji: '💿', base: 250, from: 1985, until: 2005, brand: { ids: ['sony', 'panasonic', 'aiwa', 'philips', 'toshiba'], mode: 'prefix' } },
  { label: 'MP3 Player', emoji: '🎧', base: 350, tech: 'internet', from: 2000, until: 2014, brand: { ids: ['ipod', 'creative-zen', 'sony', 'samsung-electronics', 'philips'], mode: 'prefix' } },
  { label: 'Digital Camera', emoji: '📷', base: 600, from: 1996, until: 2015, brand: (year) => ({ ids: idsOnSale(year, DIGITAL_CAMERA_MAKERS), mode: 'prefix' }) },
  { label: 'DVD Player', emoji: '📀', base: 300, from: 1997, until: 2015, brand: { ids: AV_MAKERS, mode: 'prefix' } },
  { label: 'Flat-Screen TV', emoji: '📺', base: 2_500, from: 2000, until: 2013, brand: { ids: TV_MAKERS, mode: 'prefix' } },
  { label: 'Handheld Game Console', emoji: '🎮', base: 300, tech: 'videoGameConsole', from: 1989, until: 2016, brand: { category: 'console', segment: 'handheld', mode: 'model', suffix: 'Handheld Console' } },
  {
    label: 'Home Computer',
    emoji: '🖥️',
    base: 2_000,
    tech: 'homeComputer',
    until: 1990,
    name: (y) => (y < 1988 ? '8-Bit Home Computer' : 'Home Computer'),
    price: (y) => computerUsd(y),
    brand: { category: 'computer', mode: 'model', suffix: 'Home Computer', reject: LAPTOP_LINES },
  },
  { label: 'Desktop PC', emoji: '🖥️', base: 3_500, tech: 'homeComputer', from: 1985, until: 2012, name: (y) => (y < 1994 ? 'Beige Desktop PC' : y < 2001 ? 'Multimedia Desktop PC' : 'Desktop PC'), price: (y) => computerUsd(y), brand: { category: 'computer', mode: 'model', suffix: 'Desktop PC', reject: LAPTOP_LINES } },
]

/** True when this gadget is in the shops where the player lives this year. */
function gadgetInEra(g: GameState, x: Gadget): boolean {
  if (x.from !== undefined && g.year < x.from) return false
  if (x.until !== undefined && g.year > x.until) return false
  return !x.tech || hasTech(g, x.tech)
}

export function electronicsListings(g: GameState): ItemListing[] {
  const r = seeded(yearKey(g, 'electronics'))
  const mult = localGoodsMult(g, 'electronics')
  return ELECTRONICS.filter((x) => gadgetInEra(g, x))
    .map((x, i): ItemListing => {
      const price = nicePrice((x.price ? x.price(g.year) : x.base) * mult * r.float(0.85, 1.1))
      const label = x.name ? x.name(g.year) : x.label
      const brand = typeof x.brand === 'function' ? x.brand(g.year) : x.brand
      const real = brand ? gadgetName(g, brand, `elec-${i}`, label) : undefined
      return { id: `${g.year}:elec-${i}`, kind: 'other', category: 'electronics', name: real ?? label, emoji: x.emoji, price, value: nicePrice(price * 0.7), condition: 100, isNew: true, details: { category: 'electronics' } }
    })
    .filter((x) => !isBought(g, x.id))
}

const LUXURY: [string, string, number, number, string][] = [
  ['Designer Handbag', '👜', 2_000, 15_000, 'handbag'],
  ['Luxury Watch', '⌚', 5_000, 120_000, 'watch'],
  ['Designer Sunglasses', '🕶️', 300, 900, 'fashion'],
  ['Tailored Suit', '🤵', 2_000, 8_000, 'fashion'],
  ['Designer Gown', '👗', 3_000, 25_000, 'fashion'],
  ['Cashmere Coat', '🧥', 1_500, 6_000, 'fashion'],
  ['Limited-Edition Sneakers', '👟', 600, 3_000, 'sneakers'],
  ['Silk Scarf', '🧣', 300, 800, 'fashion'],
  ['Diamond Cufflinks', '✨', 3_000, 9_000, 'watch'],
  ['Designer Fragrance', '🧴', 200, 600, 'fashion'],
]

const LUXURY_FROM: Record<string, number> = {
  'Designer Handbag': 1892,
  'Luxury Watch': 1911,
  'Designer Sunglasses': 1937,
  'Tailored Suit': 1910,
  'Designer Gown': 1947,
  'Cashmere Coat': 1924,
  'Limited-Edition Sneakers': 1985,
  'Silk Scarf': 1937,
  'Diamond Cufflinks': 1900,
  'Designer Fragrance': 1921,
}

function idsOnSale(year: number, rows: readonly (readonly [string, number])[]): string[] {
  return rows.filter(([, from]) => year >= from).map(([id]) => id)
}

// Keep the legacy one-page boutique, but only name houses once a matching product line existed.
// The full Luxury Lifestyle catalog owns the exact models; these broad rows deliberately make no
// model claim. The extra gate prevents founding year alone from creating products decades early.
function legacyLuxuryBrand(label: string, year: number): GadgetSpec {
  const rows: Record<string, readonly (readonly [string, number])[]> = {
    'Designer Handbag': [['goyard', 1892], ['louis-vuitton', 1930], ['coach', 1941], ['gucci', 1947], ['chanel', 1955], ['hermes', 1956], ['bottega-veneta', 1966], ['mulberry', 1971], ['prada', 1984]],
    'Luxury Watch': [['cartier', 1911], ['rolex', 1926], ['patek-philippe', 1932], ['iwc', 1936], ['omega', 1948], ['longines', 1954], ['breitling', 1952], ['seiko', 1963]],
    'Designer Sunglasses': [['ray-ban', 1937], ['persol', 1957], ['oakley', 1985]],
    'Tailored Suit': [['zegna', 1910], ['chanel', 1954], ['saint-laurent', 1966], ['ralph-lauren', 1972], ['armani', 1975], ['alexander-mcqueen', 1992]],
    'Designer Gown': [['dior', 1947], ['valentino', 1960], ['versace', 1978], ['alexander-mcqueen', 1992]],
    'Cashmere Coat': [['loro-piana', 1924], ['max-mara', 1951]],
    'Limited-Edition Sneakers': [['nike', 1985], ['golden-goose', 2000], ['gucci', 2016], ['balenciaga', 2017], ['louis-vuitton', 2018]],
    'Silk Scarf': [['hermes', 1937], ['dior', 1947], ['gucci', 1953]],
    'Diamond Cufflinks': [['tiffany-co', 1900], ['cartier', 1900], ['bulgari', 1900], ['chopard', 1900]],
    'Designer Fragrance': [['chanel', 1921], ['dior', 1947], ['hermes', 1951], ['gucci', 1974], ['prada', 1990]],
  }
  return { ids: idsOnSale(year, rows[label] ?? []), mode: 'prefix' }
}

export function luxuryListings(g: GameState): ItemListing[] {
  const r = seeded(yearKey(g, 'luxury'))
  const mult = localGoodsMult(g, 'luxury')
  return LUXURY.filter(([label]) => g.year >= (LUXURY_FROM[label] ?? 1900)).map(([label, emoji, lo, hi, sub], i): ItemListing => {
    const price = nicePrice((lo + (hi - lo) * Math.pow(r.next(), 1.5)) * mult)
    const keep = sub === 'watch' ? 0.85 : sub === 'handbag' ? 0.7 : sub === 'sneakers' ? 0.8 : 0.35
    const name = gadgetName(g, legacyLuxuryBrand(label, g.year), `lux-${i}`, label) ?? label
    return { id: `${g.year}:lux-${i}`, kind: 'other', category: 'luxury', name, emoji, price, value: nicePrice(price * keep), condition: 100, isNew: true, details: { category: 'luxury', luxury: sub } }
  }).filter((x) => !isBought(g, x.id))
}

const ARTISTS = ['Vera Lindqvist', 'Marco Bellini', 'Ade Okafor', 'Yuki Tanabe', 'Hugo Marchetti', 'Lena Brandt', 'Pablo Ruiz-Ortega', 'Ingrid Solberg', 'Theo Vance', 'Amara Nwosu', 'Felix Durand', 'Maya Castellanos', 'Oskar Wren']
const ART_TITLES = ['Blue Dog at Dusk', 'Composition No. 7', 'Sad Pear', 'The Tax Collector', 'Untitled (Again)', 'Morning Over the Parking Lot', 'Self-Portrait as a Croissant', 'Chaos in Teal', 'Woman With Umbrella', 'Still Life With Remote Control', 'The Last Bus Home', 'Abstract Feelings #4', 'Melting Calendar', 'Pigeon Royalty', 'Red Square on Beige', 'Grandmother\'s Kitchen']
const ART_MEDIUMS = ['Oil on canvas', 'Acrylic on canvas', 'Watercolor', 'Bronze sculpture', 'Mixed media', 'Charcoal sketch']

/**
 * First year a gallery title, medium or collectible makes sense (no remote controls in a 1912
 * still life, no moon rocks before the Moon landing). Anything not listed has always been around.
 */
const COLLECT_FROM: Record<string, number> = {
  'Still Life With Remote Control': 1975,
  'Acrylic on canvas': 1955,
  'Mixed media': 1915,
  'Rare Comic Book': 1960,
  'Vintage Baseball Card': 1930,
  'Signed Electric Guitar': 1955,
  'Movie Prop Sword': 1930,
  'Vintage Arcade Cabinet': 1995,
  'Holographic Trading Card': 1990,
  'First-Pressing Vinyl Record': 1965,
  'Moon Rock (Certified)': 1970,
}

function collectInEra<T>(g: GameState, list: readonly T[], name: (x: T) => string): T[] {
  return list.filter((x) => g.year >= (COLLECT_FROM[name(x)] ?? 0))
}

const COLLECTIBLES: [string, string, number, number][] = [
  ['Rare Comic Book', '📚', 500, 60_000],
  ['Vintage Baseball Card', '⚾', 200, 90_000],
  ['Antique Pocket Watch', '⏱️', 800, 25_000],
  ['Rare Gold Coin', '🪙', 400, 50_000],
  ['Dinosaur Fossil', '🦴', 5_000, 400_000],
  ['Signed Electric Guitar', '🎸', 3_000, 120_000],
  ['First-Edition Novel', '📕', 300, 40_000],
  ['Vintage Wine Bottle', '🍷', 500, 80_000],
  ['Antique Vase', '🏺', 1_000, 150_000],
  ['Meteorite Fragment', '☄️', 600, 30_000],
  ['Movie Prop Sword', '🗡️', 2_000, 70_000],
  ['Vintage Arcade Cabinet', '🕹️', 1_500, 12_000],
  ['Holographic Trading Card', '🃏', 100, 200_000],
  ['First-Pressing Vinyl Record', '💿', 100, 15_000],
  ['Samurai Sword', '⚔️', 3_000, 90_000],
  ['Moon Rock (Certified)', '🌑', 20_000, 900_000],
]

/** Half the galleries' artists are local names, the rest the usual international set. */
function artistName(r: SRng, g: GameState): string {
  if (r.next() < 0.5) return r.pick(ARTISTS)
  const pool = namePoolOf(g.character.countryId)
  return `${r.pick(r.next() < 0.5 ? pool.male : pool.female)} ${r.pick(pool.last)}`
}

export function collectibleListings(g: GameState, store: 'art' | 'collectibles'): ItemListing[] {
  const r = seeded(yearKey(g, `collect:${store}`))
  const mult = globalGoodsMult(g)
  const out: ItemListing[] = []
  for (let i = 0; i < 6; i++) {
    if (store === 'art') {
      const artist = artistName(r, g)
      const title = r.pick(collectInEra(g, ART_TITLES, (x) => x))
      const fame = r.int(1, 100)
      const price = nicePrice((2_000 + 2_000_000 * Math.pow(r.next(), 4) * (fame / 100)) * mult)
      out.push({ id: `${g.year}:art-${i}`, kind: 'collectible', category: 'art', name: `"${title}" by ${artist}`, emoji: r.pick(['🖼️', '🎨', '🗿']), price, value: nicePrice(price * 0.8), condition: r.int(70, 100), isNew: false, details: { category: 'art', artist, title, medium: r.pick(collectInEra(g, ART_MEDIUMS, (x) => x)), artistFame: fame } })
    } else {
      const [label, emoji, lo, hi] = r.pick(collectInEra(g, COLLECTIBLES, (x) => x[0]))
      const condition = r.int(30, 100)
      const price = nicePrice((lo + (hi - lo) * Math.pow(r.next(), 3)) * (0.5 + 0.5 * (condition / 100)) * mult)
      out.push({ id: `${g.year}:coll-${i}`, kind: 'collectible', category: 'collectible', name: label, emoji, price, value: nicePrice(price * 0.85), condition, isNew: false, details: { category: 'collectible' } })
    }
  }
  return out.filter((x) => !isBought(g, x.id))
}

const PURCHASE_LINES = [
  (n: string) => `I bought ${n}.`,
  (n: string) => `I treated myself to ${n}.`,
  (n: string) => `I splurged on ${n}.`,
]

function withArticle(name: string): string {
  if (/^"/.test(name)) return name
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name.charAt(0).toLowerCase() + name.slice(1)}`
}

/** Buy a store item; it becomes an Asset. Returns the asset or null. */
export function buyItem(g: GameState, item: ItemListing, minAge = 18): Asset | null {
  const c = g.character
  const reason = ageReason(g, minAge, 'buy that')
  if (reason) {
    notice(g, 'Shopping', reason, { emoji: '🛍️' })
    return null
  }
  if (isBought(g, item.id)) {
    notice(g, 'Sold Out', 'That one is gone. Someone with faster thumbs got it.', { emoji: '🏷️' })
    return null
  }
  if (!spend(g, item.price, 'asset.buy')) {
    cantAfford(g, item.price, withArticle(item.name))
    return null
  }
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: item.kind,
    name: item.name,
    emoji: item.emoji,
    purchasePrice: item.price,
    value: item.value,
    condition: item.condition,
    purchasedAge: c.age,
    upkeep: 0,
    details: { ...item.details, isNew: item.isNew, insured: false },
  }
  g.assets.push(asset)
  markBought(g, item.id)
  count(g, 'purchases')
  const joy = item.price >= 50_000 ? randInt(g, 6, 12) : item.price >= 2_000 ? randInt(g, 3, 7) : randInt(g, 1, 4)
  addStat(g, 'happiness', joy)
  log(g, pick(g, PURCHASE_LINES)(withArticle(item.name)), 'good')
  const quips =
    item.details.fake === true
      ? ['It sparkles almost like the real thing.', 'The clerk winked at you. You chose not to ask why.', 'From across the room, nobody could ever tell.']
      : item.category === 'electronics'
        ? ['You spent the rest of the day peeling off the protective film.', 'It will be obsolete in 18 months. You love it anyway.', hasTech(g, 'internet') && g.year >= 2005 ? 'You immediately downloaded 47 updates.' : 'You read the entire manual, including the warranty.']
        : item.category === 'instrument'
          ? ['Your neighbors have already started complaining.', 'You played it the whole way home.', 'You can now play exactly one song on it. Badly.']
          : item.category === 'art'
            ? ['Your friends will pretend to understand it.', 'You hung it slightly crooked. It works.', 'The gallery owner called it "a bold investment."']
            : ['Retail therapy: it works!', 'You admired it for a solid hour.', 'Worth every penny. Probably.']
  const tax = item.kind === 'investment' || item.kind === 'business' ? '' : salesTaxNote(g, item.price)
  notice(g, 'Purchased!', `You bought ${withArticle(item.name)} for ${formatMoney(item.price)}. ${pick(g, quips)}${tax ? ` ${tax}` : ''}`, { emoji: item.emoji, tone: 'good' })
  return asset
}

function itemAction(item: ItemListing, minAge: number): MenuAction {
  return {
    type: 'action',
    id: `item-${item.id}`,
    label: item.name,
    emoji: item.emoji,
    subtitle: () => {
      const bits = [formatMoney(item.price)]
      if (item.category === 'jewelry') bits.push(`Quality ${num(item.details.quality)}%`)
      if (item.category === 'art') bits.push(str(item.details.medium))
      if (!item.isNew || item.condition < 100) bits.push(`Condition ${item.condition}%`)
      return bits.join(' · ')
    },
    disabledReason: (g) => ageReason(g, minAge, 'buy that'),
    confirm: () => `Buy ${withArticle(item.name)} for ${formatMoney(item.price)}?`,
    run: (g) => {
      buyItem(g, item, minAge)
    },
  }
}

function storeMenu(id: string, label: string, emoji: string, subtitle: string | ((g: GameState) => string), minAge: number, list: (g: GameState) => ItemListing[], header?: string): MenuGroup {
  return {
    type: 'menu',
    id,
    label,
    emoji,
    subtitle,
    disabledReason: (g) => ageReason(g, minAge, `shop at ${label}`),
    header: (g) => [header ?? '', `You have ${formatMoney(g.character.money)}.`, pricesIncludeTax(g)].filter(Boolean).join(' '),
    children: (g) => {
      const items = list(g)
      return items.length ? items.map((i) => itemAction(i, minAge)) : [{ type: 'info', id: 'soldout', text: 'Sold out! New stock arrives next year.', emoji: '🪧' }]
    },
  }
}

export const jewelersMenu: MenuGroup = {
  type: 'menu',
  id: 'jewelers',
  label: 'Jewelers',
  emoji: '💍',
  subtitle: 'Rings, earrings, pendants and engagement rings',
  disabledReason: (g) => ageReason(g, 16, 'shop for jewelry'),
  children: () => [
    {
      type: 'menu',
      id: 'jewelerReal',
      label: 'Fine Jewelry',
      emoji: '💎',
      subtitle: 'Certified real gems',
      header: (g) => `Every stone comes with a certificate. You have ${formatMoney(g.character.money)}. ${pricesIncludeTax(g)}`.trim(),
      children: (g) => {
        const items = jewelryListings(g, 'real')
        return [
          { type: 'heading', id: 'jr-h1', label: 'Fine Jewelry' },
          ...items.filter((i) => i.details.engagement !== true).map((i) => itemAction(i, 16)),
          { type: 'heading', id: 'jr-h2', label: 'Engagement Rings' },
          ...items.filter((i) => i.details.engagement === true).map((i) => itemAction(i, 18)),
        ]
      },
    },
    {
      type: 'menu',
      id: 'jewelerFake',
      label: 'Costume Jewelry',
      emoji: '✨',
      subtitle: 'Prices so low they must be... genuine?',
      header: (g) => `Everything here is cubic zirconia and gold paint. Don't tell anyone. You have ${formatMoney(g.character.money)}. ${pricesIncludeTax(g)}`.trim(),
      children: (g) => {
        const items = jewelryListings(g, 'fake')
        return [
          { type: 'heading', id: 'jf-h1', label: 'Jewelry' },
          ...items.filter((i) => i.details.engagement !== true).map((i) => itemAction(i, 16)),
          { type: 'heading', id: 'jf-h2', label: 'Engagement Rings' },
          ...items.filter((i) => i.details.engagement === true).map((i) => itemAction(i, 18)),
        ]
      },
    },
  ],
}

export const instrumentStoreMenu = storeMenu('instrumentStore', 'Music Store', '🎸', 'Instruments, new and used', 10, instrumentListings, 'From kazoos to grand pianos.')
/** What the electronics store sells this year, in a few words. */
function electronicsBlurb(g: GameState): string {
  if (hasTech(g, 'smartphone')) return 'Phones, laptops, consoles and gadgets'
  if (hasTech(g, 'homeComputer')) return `Computers, ${hasTech(g, 'videoGameConsole') ? 'game consoles, ' : ''}TVs and gadgets`
  if (hasTech(g, 'tv')) return 'Radios, TVs, record players and gadgets'
  if (hasTech(g, 'radio')) return 'Radios, phonographs and gadgets'
  return 'Phonographs, cameras and electric gadgets'
}

export const electronicsStoreMenu = storeMenu('electronicsStore', 'Electronics Store', '📱', electronicsBlurb, 12, electronicsListings, "This year's gadgets.")
export const luxuryStoreMenu = storeMenu('luxuryStore', 'Designer Boutiques', '👜', 'Real-brand bags, watches and fashion', 18, luxuryListings, 'The security guard is watching you.')

export const collectiblesMenu: MenuGroup = {
  type: 'menu',
  id: 'collectibles',
  label: 'Art & Collectibles',
  emoji: '🖼️',
  subtitle: 'Paintings, fossils, rare cards and more',
  disabledReason: (g) => ageReason(g, 18, 'buy art and collectibles'),
  children: () => [
    storeMenu('artGallery', 'Art Gallery', '🎨', 'Paintings and sculpture', 18, (g) => collectibleListings(g, 'art'), 'Values can soar... or crash.'),
    storeMenu('collectiblesDealer', 'Collectibles Dealer', '🏺', 'Rare finds and oddities', 18, (g) => collectibleListings(g, 'collectibles'), 'Every item has a story. Some are even true.'),
  ],
}

// ---------------------------------------------------------------------------
// Family heirlooms: found by searching the attic (from age 11), kept across generations
// (life.ts carries every asset with details.heirloom === true to the next generation).

export type HeirloomRarity = 'Common' | 'Rare' | 'Very Rare' | 'Super Rare'

export interface HeirloomDef {
  id: string
  name: string
  emoji: string
  desc: string
  /** Estimated value in US dollars in mint condition. */
  value: number
  /** Refurbishment cost, or null when it can't be refurbished. */
  refurb: number | null
  rarity: HeirloomRarity
  play?: boolean
  /** Improves luck at the casino, the track and the lottery. */
  lucky?: boolean
}

const hl = (id: string, name: string, emoji: string, desc: string, value: number, refurb: number | null, rarity: HeirloomRarity, extra: { play?: boolean; lucky?: boolean } = {}): HeirloomDef => ({ id, name, emoji, desc, value, refurb, rarity, ...extra })

export const HEIRLOOMS: HeirloomDef[] = [
  // Common
  hl('dice', 'Pair of Lucky Dice', '🎲', 'Worn smooth by generations of nervous hands. Grandpa swore they never lost.', 1, null, 'Common', { play: true, lucky: true }),
  hl('paint', 'Acrylic Paint Set', '🎨', 'Half the tubes are dried out. The other half are beige.', 38, null, 'Common', { play: true }),
  hl('alarm', 'Alarm Clock', '⏰', 'It still rings, at random, whenever it feels like it.', 7, null, 'Common'),
  hl('console', 'Retro Game Console', '🕹️', 'Comes with one controller and a cartridge you have to blow into.', 35, null, 'Common', { play: true }),
  hl('ballet', 'Ballet Shoes', '🩰', "Your grandmother's first pair. Still pink, mostly.", 98, 100, 'Common', { play: true }),
  hl('chopsticks', 'Bamboo Chopsticks', '🥢', 'From a restaurant that closed in 1987.', 5, null, 'Common'),
  hl('laundry', 'Basket of Dirty Laundry', '🧺', 'Nobody knows whose it is. Nobody wants to find out.', 11, null, 'Common'),
  hl('basketball', 'Basketball', '🏀', 'Slightly deflated. Signed by "Uncle Rick."', 6, null, 'Common', { play: true }),
  hl('tent', 'Camping Tent', '⛺', 'Smells like the summer of 1979.', 75, 105, 'Common', { play: true }),
  hl('candle', 'Candle', '🕯️', 'Scented "Ocean Breeze." Smells like a basement.', 10, null, 'Common'),
  hl('compass', 'Compass', '🧭', 'Always points slightly to the left of north.', 30, null, 'Common'),
  hl('crystalBall', 'Crystal Ball', '🔮', 'Your great-aunt used it to predict the weather. She was usually wrong.', 1_400, 100, 'Common', { play: true }),
  hl('cards', 'Deck of Cards', '🃏', 'Missing the queen of hearts. Long story.', 6, null, 'Common', { play: true }),
  hl('chair', 'Desk Chair', '🪑', 'It squeaks in the key of B flat.', 113, 60, 'Common'),
  hl('dolls', 'Porcelain Dolls', '🎎', 'Their eyes follow you around the room.', 125, 110, 'Common'),
  hl('china', 'Fine China Set', '🍽️', 'Used exactly twice, both times at funerals.', 1_200, 90, 'Common'),
  hl('pen', 'Fountain Pen', '🖋️', 'Leaks on anything important.', 30, null, 'Common'),
  hl('clover', 'Four-Leaf Clover', '🍀', 'Pressed between the pages of a dictionary.', 7, null, 'Common'),
  hl('urn', 'Funeral Urn', '⚱️', "Empty. You hope. You didn't check.", 1_300, null, 'Common'),
  hl('kimono', 'Silk Kimono', '👘', 'Hand-embroidered with cranes.', 570, 90, 'Common'),
  hl('kite', 'Kite', '🪁', 'Shaped like a dragon. Missing its tail.', 14, null, 'Common', { play: true }),
  hl('briefcase', 'Leather Briefcase', '💼', 'Contains a calculator and a very old sandwich.', 100, 100, 'Common'),
  hl('microscope', 'Brass Microscope', '🔬', 'Used for science fairs in three different decades.', 3_000, 280, 'Common', { play: true }),
  hl('sailboat', 'Miniature Sailboat', '⛵', 'A ship in a bottle, minus the bottle.', 89, 100, 'Common'),
  hl('rocketModel', 'Model Rocket', '🚀', 'Launched once. Landed on the neighbor\'s roof.', 210, 100, 'Common', { play: true }),
  hl('nesting', 'Nesting Dolls', '🪆', 'There are supposed to be seven. There are five.', 202, 100, 'Common'),
  hl('piano', 'Toy Piano', '🎹', 'Only plays in one key: annoying.', 125, 90, 'Common', { play: true }),
  hl('beads', 'Prayer Beads', '📿', 'Worn smooth by decades of worry.', 8, null, 'Common'),
  hl('phone', 'Rotary Telephone', '☎️', "Dialing a number takes about a week.", 15, null, 'Common'),
  hl('seashell', 'Seashell', '🐚', 'If you hold it to your ear you can hear your grandfather complaining.', 1, null, 'Common'),
  hl('skateboard', 'Skateboard', '🛹', 'Covered in stickers from bands nobody remembers.', 145, null, 'Common', { play: true }),
  hl('sled', 'Wooden Sled', '🛷', 'Has a name carved into it: "Rosebud." Weird.', 60, null, 'Common', { play: true }),
  hl('letters', 'Stack of Love Letters', '💌', 'Your grandparents were... very descriptive.', 17, null, 'Common'),
  hl('teddy', 'Teddy Bear', '🧸', 'Missing one eye. Still the best listener in the family.', 6, null, 'Common', { play: true }),
  hl('toolbox', 'Toolbox', '🧰', 'Every tool is slightly the wrong size.', 75, null, 'Common'),
  hl('tophat', 'Top Hat', '🎩', 'There might be a rabbit in it. Do not check.', 40, null, 'Common'),
  hl('umbrella', 'Umbrella', '🌂', 'Opens on its own, indoors, at the worst moments.', 15, null, 'Common'),
  hl('vhs', 'Family Reunion VHS Tape', '📼', 'Six hours of your uncle explaining his grill.', 1, null, 'Common'),
  hl('chimes', 'Wind Chime', '🎐', 'The neighbors have filed complaints since 1992.', 28, null, 'Common'),
  hl('yoyo', 'Yo-Yo', '🪀', 'Does exactly one trick: going down.', 52, null, 'Common', { play: true }),
  // Rare
  hl('bicycle', '1987 BMX Bicycle', '🚲', 'Chrome frame, banana seat, zero brakes.', 400, 90, 'Rare', { play: true }),
  hl('tradingCards', 'Binder of First-Edition Trading Cards', '📒', 'Mint condition, in plastic sleeves. Someone loved these.', 10_600, null, 'Rare'),
  hl('soap', 'Bar of Movie-Prop Soap', '🧼', 'From a famous movie nobody is supposed to talk about.', 252, null, 'Rare'),
  hl('flag', 'Checkered Racing Flag', '🏁', 'Waved at a famous 500-mile race.', 543, 100, 'Rare'),
  hl('gasPump', '1960s Highway Gas Pump', '⛽', 'Gas was 31 cents a gallon. It says so right there.', 2_800, 180, 'Rare'),
  hl('dagger', 'Medieval Dagger', '🗡️', 'Engraved with a family crest nobody can identify.', 97_703, 9_890, 'Rare'),
  hl('mahjong', 'Mahjong Tile', '🀄', 'Just the one tile. The rest of the set is a mystery.', 3, null, 'Rare'),
  hl('map', 'Old Road Map', '🗺️', 'It has never once been folded correctly.', 5, null, 'Rare'),
  hl('horn', '19th Century Postal Horn', '📯', 'The mail used to arrive with fanfare.', 43_562, 3_020, 'Rare', { play: true }),
  hl('pager', '1993 Pager', '📟', 'Still waiting for a callback.', 10, null, 'Rare'),
  hl('plasma', 'Plasma Ball', '🔮', 'Touch it and lightning follows your finger.', 45, null, 'Rare', { play: true }),
  hl('watch', 'Gold Swiss Watch', '⌚', "Great-grandpa's. It has been ticking since the 1940s.", 77_606, 5_150, 'Rare'),
  hl('scooter', '1962 Italian Scooter', '🛵', 'Seafoam green. Starts on the third kick.', 9_000, 410, 'Rare', { play: true }),
  hl('bags', 'Vintage Department Store Shopping Bags', '🛍️', 'Robin-egg blue. Someone kept them for 60 years.', 400, 60, 'Rare'),
  hl('balloon', 'Single Red Balloon', '🎈', 'It has not deflated in 30 years. That is concerning.', 1, null, 'Rare'),
  hl('proSkateboard', "Skating Legend's Skateboard", '🛹', 'Ridden in the first-ever 900 attempt.', 13_950, 1_430, 'Rare', { play: true }),
  hl('slotMachine', 'Antique Slot Machine', '🎰', 'Still eats quarters. Never pays out.', 5_200, 400, 'Rare', { play: true }),
  hl('snare', 'Revolutionary War Snare Drum', '🥁', 'It has marched into more battles than you have.', 5_161, 320, 'Rare', { play: true }),
  hl('soccer', 'World Cup Game Ball', '⚽', 'From the 2010 final. Still smells like grass and victory.', 2_331, 150, 'Rare', { play: true }),
  hl('tarot', 'Deck of Tarot Cards', '🔮', 'Every reading somehow ends with "Death."', 24, null, 'Rare', { play: true }),
  hl('tinfoil', 'Tinfoil Hat', '🎩', 'Protects against mind control. Allegedly.', 2, null, 'Rare'),
  hl('trophy', 'Elementary School Spelling Bee Trophy', '🏆', 'Engraved "2007 Spelling Be Champion."', 1, null, 'Rare'),
  // Very rare
  hl('amphora', 'Ancient Greek Amphora', '🏺', 'Painted with athletes who would definitely be disqualified today.', 500_000, 46_870, 'Very Rare'),
  hl('sextant', 'Antique Sextant', '🧭', 'Navigated a ship across the Atlantic in 1820.', 1_500, 110, 'Very Rare'),
  hl('astrolabe', 'Antique Astrolabe', '🔭', 'Medieval astronomers used it to tell time by the stars.', 5_099, 520, 'Very Rare'),
  hl('baseball', '1969 Championship Game Ball', '⚾', 'Caught in the stands by a great-uncle who never shut up about it.', 700, 90, 'Very Rare', { play: true }),
  hl('wine', 'Bottle of 1961 Bordeaux', '🍾', 'Too valuable to drink. Too tempting to keep.', 7_247, null, 'Very Rare'),
  hl('rookieCard', 'Basketball Legend Rookie Card', '⛹️', 'The most famous rookie card of all time, in a slightly bent sleeve.', 80_895, 7_620, 'Very Rare'),
  hl('brain', "Frankenstein's Brain", '🧠', 'In a jar. Labeled "ABBY NORMAL." It twitches.', 1_410_000, null, 'Very Rare'),
  hl('canoe', 'Birchbark Canoe', '🛶', 'Hand-built a century ago. Surprisingly watertight.', 1_850, 150, 'Very Rare', { play: true }),
  hl('diamond', '10-Carat Diamond', '💎', 'Loose, flawless and found in a sock drawer.', 1_990_000, 187_110, 'Very Rare'),
  hl('ring', '2-Carat Diamond Ring', '💍', "Your great-grandmother's engagement ring.", 15_000, 630, 'Very Rare'),
  hl('telescope', 'Digital Telescope', '🔭', 'Can see the rings of Saturn and your neighbors\' business.', 6_683, 640, 'Very Rare', { play: true }),
  hl('disco', 'Famous Nightclub Disco Ball', '🪩', 'It saw things in the 1970s it will never discuss.', 184_322, 18_990, 'Very Rare'),
  hl('dung', 'T-Rex Dung Fossil', '💩', 'Sixty-six million years old. Still kind of gross.', 4_000, 340, 'Very Rare'),
  hl('stratocaster', '1968 Electric Guitar', '🎸', 'Played at a muddy music festival. The mud is still on it.', 8_600, 780, 'Very Rare', { play: true }),
  hl('filmReel', 'Original Fantasy Film Reel', '🎞️', 'The first print of a famous movie about a girl, a dog and a yellow road.', 909_099, null, 'Very Rare'),
  hl('medal', 'Olympic Bronze Medal', '🥉', 'Third place in the world is still pretty great.', 28_000, 2_530, 'Very Rare'),
  hl('lock', "Famous Escape Artist's Padlock", '🔒', 'Nobody in the family has ever managed to open it.', 9_674, null, 'Very Rare'),
  hl('painting', 'Original Desert Flower Painting', '🖼️', 'A masterpiece by a famous American modernist.', 884_254, 60_240, 'Very Rare'),
  hl('doodle', 'Cubist Master Doodle', '🖼️', 'Drawn on a restaurant napkin to pay for lunch.', 6_500, 230, 'Very Rare'),
  hl('radio', '1951 Radio', '📻', 'Still picks up a station that went off the air in 1960.', 280, null, 'Very Rare', { play: true }),
  hl('newspaper', 'Newspaper from December 31, 1999', '🗞️', 'Front page: "Y2K: THE END?"', 2, null, 'Very Rare'),
  hl('sword', 'Fantasy TV Show Sword', '⚔️', 'A prop sword from the most-watched fantasy series ever.', 36_712, 2_350, 'Very Rare'),
  hl('whip', "Archaeologist Adventurer's Whip", '🪢', 'Belongs in a museum.', 5_690, 412, 'Very Rare', { play: true }),
  // Super rare
  hl('ark', 'Ark of the Covenant', '📦', 'A golden chest. Do NOT open it.', 130_000_000, null, 'Super Rare'),
  hl('bell', 'Haunted Motel Service Bell', '🛎️', 'From a motel with a very bad shower.', 1_700, 150, 'Super Rare', { play: true }),
  hl('crown', "Charlemagne's Crown", '👑', 'The crown of the first Holy Roman Emperor. Heavy is the head.', 30_000_000, 2_019_600, 'Super Rare'),
  hl('excalibur', 'Excalibur', '🗡️', 'You pulled it out of a box marked "Misc." Does that make you king?', 715_000_000, null, 'Super Rare'),
  hl('egg', 'Imperial Jeweled Egg', '🥚', 'Made for a Russian tsar. Definitely not for breakfast.', 20_155_604, 1_842_400, 'Super Rare'),
  hl('grail', 'Holy Grail', '🏆', 'A plain wooden cup. It glows faintly.', 1_264_999_936, null, 'Super Rare', { play: true }),
  hl('hammer', 'Hammer of Thor', '🔨', 'You can lift it. You are clearly worthy.', 35_816_000, null, 'Super Rare'),
  hl('bulb', "Thomas Edison's Light Bulb", '💡', 'One of the first that actually worked.', 275_000, 16_530, 'Super Rare'),
  hl('meteorite', 'Meteorite', '☄️', 'It fell into the backyard in 1938 and nobody thought to mention it.', 9_514_331, null, 'Super Rare'),
  hl('notebook', "Leonardo da Vinci's Notebook", '📓', 'Written backwards, in a mirror. Includes a doodle of a helicopter.', 323_916, null, 'Super Rare'),
  hl('rosetta', 'Rosetta Stone', '🪨', 'How did THIS end up in your attic?', 607_500_032, null, 'Super Rare'),
  hl('shield', 'Shield from the Crusades', '🛡️', 'Dented in all the right places.', 450_000, 42_760, 'Super Rare'),
  hl('bootSpace', "First Moonwalker's Space Boot", '🥾', 'One small step for man. One huge payday for you.', 2_901_780, 301_740, 'Super Rare'),
  hl('testTube', "Marie Curie's Test Tube", '🧪', 'It glows slightly. Please wash your hands.', 27_500, 2_320, 'Super Rare'),
  hl('anchor', 'Titanic Anchor', '⚓', 'How it got into the attic is a family mystery.', 525_000, 36_920, 'Super Rare'),
  hl('trumpet', "Jazz Legend's Trumpet", '🎺', 'What a wonderful find.', 2_500_000, 170_280, 'Super Rare', { play: true }),
  hl('violin', '1702 Stradivarius Violin', '🎻', 'Three centuries old and it still sounds like heaven.', 9_800_000, 903_370, 'Super Rare', { play: true }),
  hl('galileo', "Galileo's Telescope", '🔭', 'And yet it moves.', 5_019_683, 483_790, 'Super Rare', { play: true }),
]

/**
 * The first year an heirloom could be gathering dust in an attic (no 1993 pager in 1950, no
 * moonwalker's boot before 1970). Heirlooms not listed are timeless.
 */
const HEIRLOOM_FROM: Record<string, number> = {
  paint: 1960,
  console: 1995,
  chopsticks: 1988,
  tent: 1980,
  skateboard: 1975,
  vhs: 1985,
  chimes: 1993,
  yoyo: 1930,
  briefcase: 1975,
  rocketModel: 1958,
  phone: 1930,
  bicycle: 1988,
  tradingCards: 1950,
  soap: 2000,
  flag: 1912,
  gasPump: 1975,
  pager: 1994,
  plasma: 1985,
  watch: 1950,
  scooter: 1963,
  bags: 1960,
  proSkateboard: 2000,
  slotMachine: 1940,
  soccer: 2011,
  trophy: 2008,
  baseball: 1970,
  wine: 1962,
  rookieCard: 1987,
  telescope: 2000,
  disco: 1980,
  stratocaster: 1970,
  filmReel: 1940,
  lock: 1910,
  painting: 1930,
  doodle: 1915,
  radio: 1961,
  newspaper: 2000,
  sword: 2012,
  whip: 1982,
  bell: 1961,
  meteorite: 1939,
  bootSpace: 1970,
  testTube: 1910,
  anchor: 1913,
  trumpet: 1930,
}

const RARITY_WEIGHT: Record<HeirloomRarity, number> = { Common: 72, Rare: 20, 'Very Rare': 7.6, 'Super Rare': 0.4 }

export function isHeirloom(a: Asset): boolean {
  return a.details.heirloom === true
}

/** True when you own a lucky charm (the family's Lucky Dice) — gambling.ts uses it. */
export function hasLuckyCharm(g: GameState): boolean {
  return g.assets.some((a) => a.details.lucky === true)
}

/** Heirloom value from its mint value and condition. */
function heirloomValue(base: number, condition: number): number {
  return Math.max(1, nicePrice(base * (0.45 + 0.55 * (Math.max(0, Math.min(100, condition)) / 100))))
}

/** Where you could go rummaging, or null. */
function atticAccess(g: GameState): 'family' | 'own' | null {
  const c = g.character
  if (c.residence.status === 'parents') return 'family'
  if (c.residence.status === 'owned' && g.assets.some((a) => a.id === c.residence.assetId && a.kind === 'house')) return 'own'
  return null
}

const ATTIC_NOTHING = [
  '@1995 You searched the attic with a flashlight and found nothing but dust bunnies, a dead moth and a box of tax returns from 1994.',
  '@-1995 You searched the attic with a flashlight and found nothing but dust bunnies, a dead moth and a box of receipts nobody can read.',
  'You spent an hour in the attic. You found cobwebs, a broken lamp and a strong suspicion that something lives up there.',
  'The attic was empty except for a mannequin that you are 90% sure moved.',
  'You searched every corner of the attic and found exactly nothing worth keeping. A spider watched you the whole time.',
  'You found a box labeled "IMPORTANT." It contained more boxes. All empty.',
]

/** Search the attic for a family heirloom. Returns the heirloom found, if any. */
export function searchAttic(g: GameState): Asset | null {
  const c = g.character
  const where = atticAccess(g)
  if (!where) {
    notice(g, 'Attic', "You don't have an attic to search. You need to live at home or own a house.", { emoji: '🔦' })
    return null
  }
  if (!useYearAction(g, 'attic', 1)) {
    notice(g, 'Attic', pickLine(g, ['You already searched the attic this year. The spiders need time to rebuild.', 'You already turned the attic upside down this year. Nothing new has appeared. Yet.']), { emoji: '🕸️' })
    return null
  }
  const roll = rand(g)
  if (roll < 0.04) {
    addStat(g, 'health', -randInt(g, 4, 10))
    addStat(g, 'happiness', -3)
    notice(g, 'Ouch!', pickLine(g, ['You stepped between the beams and put your foot through the ceiling. Someone downstairs screamed.', 'A box of old encyclopedias fell on your head. You learned nothing.', 'You disturbed a family of bats. They did not appreciate it.']), { emoji: '🤕', tone: 'bad' })
    log(g, 'I hurt myself rummaging in the attic.', 'bad')
    return null
  }
  if (roll < 0.47) {
    notice(g, 'Attic', eraPick(g, ATTIC_NOTHING), { emoji: '🔦' })
    log(g, pickLine(g, ['I searched the attic but found nothing.', 'I rummaged through the attic. Nothing but dust.']))
    return null
  }
  const owned = new Set(g.assets.filter(isHeirloom).map((a) => str(a.details.heirloomId)))
  const pool = HEIRLOOMS.filter((x) => !owned.has(x.id) && g.year >= (HEIRLOOM_FROM[x.id] ?? 0))
  if (pool.length === 0) {
    notice(g, 'Attic', "You've already found every treasure this attic has to offer.", { emoji: '🔦' })
    return null
  }
  const perRarity: Record<string, number> = {}
  for (const x of pool) perRarity[x.rarity] = (perRarity[x.rarity] ?? 0) + 1
  const def = weightedPick(g, pool, (x) => RARITY_WEIGHT[x.rarity] / perRarity[x.rarity])
  const base = Math.max(1, nicePrice(def.value * globalGoodsMult(g) * (0.85 + rand(g) * 0.3)))
  const condition = randInt(g, def.rarity === 'Common' ? 25 : 15, 100)
  const asset: Asset = {
    id: uid(g, 'a'),
    kind: 'collectible',
    name: def.name,
    emoji: def.emoji,
    purchasePrice: 0,
    value: heirloomValue(base, condition),
    condition,
    purchasedAge: c.age,
    upkeep: 0,
    details: {
      heirloom: true,
      heirloomId: def.id,
      category: 'heirloom',
      rarity: def.rarity,
      desc: def.desc,
      baseValue: base,
      refurbCost: def.refurb === null ? null : nicePrice(def.refurb * goodsMult(g)),
      playable: def.play === true,
      lucky: def.lucky === true,
      foundYear: g.year,
    },
  }
  g.assets.push(asset)
  count(g, 'heirlooms')
  const title = def.rarity === 'Super Rare' ? 'Incredible Find!' : def.rarity === 'Very Rare' ? 'Treasure!' : def.rarity === 'Rare' ? 'Nice Find!' : 'Attic Find'
  let text = `You searched the ${where === 'family' ? 'family' : 'dusty'} attic with a flashlight and found ${withArticle(def.name)}! ${def.desc}\n\nRarity: ${def.rarity} · Condition: ${condition}% · Estimated value: ${formatMoney(asset.value)}`
  if (def.lucky) text += '\n\nSomething tells you these will bring you luck at the casino and the lottery.'
  notice(g, title, text, { emoji: def.emoji, tone: def.rarity === 'Common' ? 'neutral' : 'good' })
  log(g, `I found ${withArticle(def.name)} in the attic.`, def.rarity === 'Common' ? 'neutral' : 'good')
  if (def.rarity !== 'Common') addStat(g, 'happiness', def.rarity === 'Super Rare' ? 20 : def.rarity === 'Very Rare' ? 8 : 4)
  if (def.rarity === 'Super Rare' || def.rarity === 'Very Rare') remember(g, `Found ${withArticle(def.name)} in the attic.`)
  return asset
}

export const searchAtticAction: MenuAction = {
  type: 'action',
  id: 'searchAttic',
  label: 'Search the Attic',
  emoji: '🔦',
  subtitle: (g) => (yearActionsUsed(g, 'attic') > 0 ? 'Already searched this year' : 'Look for family heirlooms (once a year)'),
  visible: (g) => g.character.age >= 11 && atticAccess(g) !== null,
  disabledReason: blockReason,
  run: (g) => {
    searchAttic(g)
  },
}

// ---------------------------------------------------------------------------
// Owned assets: actions

const GIFT_RELATIONS: RelationKind[] = ['parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'grandparent', 'child', 'stepchild', 'grandchild', 'friend', 'bestFriend', 'partner', 'fiance', 'spouse', 'lover']

export function findAsset(g: GameState, id: string): Asset | undefined {
  return g.assets.find((a) => a.id === id)
}

/** The current version of an asset captured by a menu closure (menus may outlive a state change). */
function live(g: GameState, a: Asset): Asset {
  return findAsset(g, a.id) ?? a
}

function assetLoan(g: GameState, a: Asset) {
  const id = a.details.loanId
  return typeof id === 'string' ? g.character.loans.find((l) => l.id === id) : undefined
}

/** What you still owe on an asset (mortgage + linked loan). */
export function amountOwed(g: GameState, a: Asset): number {
  return (a.mortgage?.balance ?? 0) + (assetLoan(g, a)?.balance ?? 0)
}

function removeAsset(g: GameState, a: Asset): void {
  g.assets = g.assets.filter((x) => x.id !== a.id)
  const loan = assetLoan(g, a)
  if (loan) g.character.loans = g.character.loans.filter((l) => l.id !== loan.id)
}

export interface Offer {
  buyer: string
  amount: number
}

/** The offers a seller gets for an asset. Draws from g.rng; the clamp on a same-year house resale draws nothing. */
export function makeOffers(g: GameState, a: Asset): Offer[] {
  const c = g.character
  const v = Math.max(1, a.value)
  const person = () => `${randomFirstName(g, c.countryId, chance(g, 0.5) ? 'male' : 'female')} ${randomLastName(g, c.countryId)}`
  // Before online marketplaces, small things sold through a classified ad in the paper.
  const casual = hasTech(g, 'onlineShopping') ? 'online buyer' : 'local buyer'
  const f = (lo: number, hi: number) => nicePrice(v * (lo + (hi - lo) * (randInt(g, 0, 1000) / 1000)))
  if (isHeirloom(a)) {
    if (v < 500) {
      return [
        { buyer: 'Garage sale shopper', amount: f(0.5, 1.2) },
        { buyer: `${person()} (${casual})`, amount: f(0.8, 1.1) },
      ]
    }
    return [
      { buyer: 'Pawn shop', amount: f(0.3, 0.5) },
      { buyer: 'Antique dealer', amount: f(0.7, 0.95) },
      { buyer: 'Auction house', amount: f(0.85, 1.25) },
    ]
  }
  switch (a.kind) {
    case 'house': {
      const offers = [
        { buyer: `${person()} (investor)`, amount: f(0.85, 0.95) },
        { buyer: `${person()} (${a.details.commercial === true ? 'business owner' : 'first-time buyer'})`, amount: f(0.94, 1.03) },
      ]
      if (a.condition >= 20 && haunted(a) < 60) offers.push({ buyer: `${person()} (${a.details.commercial === true ? 'commercial property fund' : 'relocating family'})`, amount: f(1.0, 1.12) })
      // A house bought this very year of age sells into the sellers' pool at its bid: no offer is above the price less the spread.
      if (a.purchasedAge === c.age) {
        const cap = Math.round(a.purchasePrice * (1 - SPREADS.sellers))
        for (const o of offers) o.amount = Math.min(o.amount, cap)
      }
      return offers
    }
    case 'car':
      return [
        { buyer: 'Dealer trade-in', amount: f(0.65, 0.8) },
        { buyer: `${person()} (private buyer)`, amount: f(0.85, 1.0) },
        { buyer: `${person()} (private buyer)`, amount: f(0.9, 1.05) },
      ]
    case 'jewelry':
      return a.details.fake === true
        ? [
            { buyer: 'Pawn shop', amount: f(0.1, 0.3) },
            { buyer: `${person()} (${casual})`, amount: f(0.3, 0.6) },
          ]
        : [
            { buyer: 'Pawn shop', amount: f(0.4, 0.55) },
            { buyer: 'Jeweler buyback', amount: f(0.75, 0.92) },
            { buyer: `${person()} (collector)`, amount: f(0.9, 1.05) },
          ]
    case 'collectible':
      return [
        { buyer: 'Auction house', amount: f(0.8, 1.2) },
        { buyer: `${person()} (collector)`, amount: f(0.85, 1.05) },
      ]
    default:
      return [
        { buyer: 'Pawn shop', amount: f(0.4, 0.6) },
        { buyer: `${person()} (${casual})`, amount: f(0.7, 0.95) },
      ]
  }
}

/** Sell an asset for `amount`, paying off what's owed on it. Returns false if you can't cover the debt. */
export function sellAsset(g: GameState, assetId: string, amount: number, buyer = 'a buyer'): boolean {
  const c = g.character
  const a = findAsset(g, assetId)
  if (!a) return false
  const owed = amountOwed(g, a)
  const net = Math.round(amount - owed)
  if (net < 0 && c.money < -net) {
    notice(g, 'Underwater', `You still owe ${formatMoney(owed)} on your ${a.name.toLowerCase()}, more than the ${formatMoney(amount)} offer. You'd need ${formatMoney(-net)} in cash to close the sale.`, { emoji: '🌊', tone: 'bad' })
    return false
  }
  const wasHome = isHome(g, a)
  removeAsset(g, a)
  addMoney(g, net, a.kind === 'house' ? 'property.sell' : 'asset.sell') // one booking: net of the payoff
  let text = `You sold your ${a.name.toLowerCase()} to ${buyer} for ${formatMoney(amount)}.`
  if (owed > 0) text += ` After paying off the ${formatMoney(owed)} you owed, you pocketed ${formatMoney(net)}.`
  if (a.kind === 'house') {
    const invested = a.purchasePrice + num(a.details.invested)
    const profit = Math.round(amount - invested)
    count(g, 'housesSold')
    if (profit > 0) {
      count(g, 'realEstateProfit', profit)
      text += ` You made a ${formatMoney(profit)} profit on the property!`
    } else if (profit < 0) {
      text += ` You lost ${formatMoney(-profit)} on the property.`
    }
    log(g, `I sold my ${a.name.toLowerCase()} at ${str(a.details.address, 'my old address')} for ${formatMoney(amount)}.`, profit >= 0 ? 'good' : 'neutral')
    if (wasHome) text += ` ${relocateAfterLosingHome(g, a.id)}`
  } else {
    log(g, `I sold my ${a.name.toLowerCase()} for ${formatMoney(amount)}.`)
  }
  count(g, 'assetsSold')
  notice(g, 'Sold!', text, { emoji: '🤝', tone: 'good' })
  return true
}

const SELL = defineScript('assets.sell', (g, choice, data) => {
  if (choice === 'keep') return
  const assetId = field<string>(data, 'assetId')
  const offers = field<Offer[]>(data, 'offers')
  if (!assetId || !offers) return
  const offer = offers[Number(choice.replace('offer', ''))]
  if (!offer) return
  sellAsset(g, assetId, offer.amount, offer.buyer)
})

function sellAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `sell-${a.id}`,
    label: a.kind === 'house' ? 'List for Sale' : 'Sell',
    emoji: '🏷️',
    subtitle: `Market value about ${formatMoney(a.value)}`,
    disabledReason: (g) => blockReason(g) ?? (a.kind === 'house' && live(g, a).rentedOutFor ? 'Evict your tenant before you sell.' : null),
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      const offers = makeOffers(g, asset)
      const owed = amountOwed(g, asset)
      const text = `${asset.kind === 'house' ? 'Your agent collected offers' : 'You got some offers'} for your ${asset.name.toLowerCase()} (market value ${formatMoney(asset.value)}).${owed > 0 ? ` You still owe ${formatMoney(owed)} on it, which comes out of the sale.` : ''}`
      scriptChoice(
        g,
        SELL,
        `Sell ${asset.name}`,
        text,
        [...offers.map((o, i) => ({ id: `offer${i}`, label: `${formatMoney(o.amount)} from ${o.buyer}`, emoji: '💵' })), { id: 'keep', label: 'Keep it', emoji: '✖️' }],
        { emoji: asset.emoji, data: { assetId: asset.id, offers: toJson(offers) } },
      )
    },
  }
}

function insureAction(a: Asset): MenuAction | null {
  if (!INSURANCE_RATES[a.kind]) return null
  return {
    type: 'action',
    id: `insure-${a.id}`,
    label: isInsured(a) ? 'Cancel Insurance' : 'Buy Insurance',
    emoji: '🛡️',
    subtitle: (g) => `${formatMoney(insurancePremium(g, a))}/year premium`,
    disabledReason: blockReason,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      if (isInsured(asset)) {
        asset.details.insured = false
        notice(g, 'Insurance Canceled', `You canceled the insurance on your ${asset.name.toLowerCase()}. Living dangerously.`, { emoji: '🛡️' })
        return
      }
      const premium = insurancePremium(g, asset)
      if (!spend(g, premium, 'premium')) {
        cantAfford(g, premium, 'the first insurance premium')
        return
      }
      asset.details.insured = true
      log(g, `I insured my ${asset.name.toLowerCase()}.`)
      notice(g, 'Insured', `Your ${asset.name.toLowerCase()} is now insured for ${formatMoney(premium)} a year. If disaster strikes, you're covered (minus the deductible, obviously).`, { emoji: '🛡️', tone: 'good' })
    },
  }
}

function giftMenu(a: Asset): MenuGroup {
  const minAge = a.kind === 'house' ? 18 : a.kind === 'car' ? 16 : 4
  return {
    type: 'menu',
    id: `gift-${a.id}`,
    label: 'Give as a Gift',
    emoji: '🎁',
    subtitle: 'Give it to a friend or relative',
    disabledReason: (g) => {
      const b = blockReason(g)
      if (b) return b
      const asset = findAsset(g, a.id)
      if (asset && amountOwed(g, asset) > 0) return `Pay off what you owe on it (${formatMoney(amountOwed(g, asset))}) before you give it away.`
      if (asset && asset.rentedOutFor) return 'Evict your tenant first.'
      return null
    },
    header: () => `Who do you want to give your ${a.name.toLowerCase()} to?`,
    children: (g) => {
      const people = g.people.filter((p) => p.alive && GIFT_RELATIONS.includes(p.relation) && p.age >= minAge)
      if (people.length === 0) return [{ type: 'info', id: 'nobody', text: 'There is nobody to give it to.', emoji: '🤷' }]
      return people.slice(0, 20).map(
        (p): MenuAction => ({
          type: 'action',
          id: `giftTo-${a.id}-${p.id}`,
          label: fullName(p),
          emoji: '🎁',
          subtitle: `${relationLabel(p)} · Relationship ${p.relationship}%`,
          confirm: () => `Give your ${a.name.toLowerCase()} (worth ${formatMoney(a.value)}) to ${p.firstName}?`,
          run: (gg) => giftAsset(gg, a.id, p.id),
        }),
      )
    },
  }
}

export function giftAsset(g: GameState, assetId: string, personId: string): boolean {
  const a = findAsset(g, assetId)
  const p = g.people.find((x) => x.id === personId)
  if (!a || !p || !p.alive) return false
  if (amountOwed(g, a) > 0) return false
  const wasHome = isHome(g, a)
  g.assets = g.assets.filter((x) => x.id !== a.id)
  personCash(g, p, Math.round(p.money + a.value) - p.money, 'gift')
  let text: string
  if (a.kind === 'jewelry' && a.details.fake === true && chance(g, 0.45)) {
    addRelationship(p, -randInt(g, 15, 30))
    text = `You gave ${p.firstName} your ${a.name.toLowerCase()}. ${p.firstName} had it appraised the next day. It's fake. ${pronounsOf(p).He} has not stopped bringing it up.`
    log(g, `I gave my ${relationLabel(p).toLowerCase()} ${p.firstName} fake jewelry and got caught.`, 'bad')
  } else {
    const delta = a.value >= 100_000 ? randInt(g, 25, 45) : a.value >= 5_000 ? randInt(g, 15, 30) : randInt(g, 5, 15)
    addRelationship(p, delta)
    addHidden(g, 'karma', 3)
    text = `You gave your ${a.name.toLowerCase()} to your ${relationLabel(p).toLowerCase()} ${p.firstName}. ${eraPickPlain(g, [`${p.firstName} was speechless.`, `${p.firstName} hugged you so hard your back cracked.`, `${p.firstName} cried happy tears.`, `@socialMedia ${p.firstName} immediately posted about it online.`, `@!socialMedia ${p.firstName} immediately told the whole street.`])}`
    log(g, `I gave my ${a.name.toLowerCase()} to my ${relationLabel(p).toLowerCase()} ${p.firstName}.`, 'good')
  }
  if (wasHome) text += ` ${relocateAfterLosingHome(g, a.id)}`
  notice(g, 'Gift Given', text, { emoji: '🎁' })
  return true
}

function pronounsOf(p: Person) {
  return p.gender === 'male' ? { He: 'He', he: 'he' } : { He: 'She', he: 'she' }
}

function donateAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `donate-${a.id}`,
    label: 'Donate to Charity',
    emoji: '🤲',
    disabledReason: (g) => blockReason(g) ?? (amountOwed(g, live(g, a)) > 0 ? 'Pay off what you owe on it first.' : null),
    confirm: () => `Donate your ${a.name.toLowerCase()} to charity?`,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      g.assets = g.assets.filter((x) => x.id !== asset.id)
      addHidden(g, 'karma', asset.value >= 10_000 ? 8 : 4)
      addStat(g, 'happiness', 3)
      count(g, 'donated')
      log(g, `I donated my ${asset.name.toLowerCase()} to charity.`, 'good')
      notice(g, 'Donated', `You donated your ${asset.name.toLowerCase()} to charity. ${pickLine(g, ['A volunteer thanked you three times.', 'Your karma glows a little brighter.', 'Somewhere, someone is very happy right now.'])}`, { emoji: '🤲', tone: 'good' })
    },
  }
}

function discardAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `discard-${a.id}`,
    label: 'Throw Away',
    emoji: '🗑️',
    disabledReason: (g) => blockReason(g) ?? (amountOwed(g, live(g, a)) > 0 ? 'Pay off what you owe on it first.' : null),
    confirm: () => `Throw away your ${a.name.toLowerCase()}? You get nothing for it.`,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      g.assets = g.assets.filter((x) => x.id !== asset.id)
      log(g, `I threw away my ${asset.name.toLowerCase()}.`)
      notice(g, 'Trashed', `You threw your ${asset.name.toLowerCase()} in the trash. A raccoon is very excited about this.`, { emoji: '🗑️' })
    },
  }
}

function payOffAction(a: Asset): MenuAction | null {
  return {
    type: 'action',
    id: `payoff-${a.id}`,
    label: a.mortgage ? 'Pay Off Mortgage' : 'Pay Off Loan',
    emoji: '🏦',
    visible: (g) => {
      const asset = findAsset(g, a.id)
      return !!asset && amountOwed(g, asset) > 0
    },
    subtitle: (g) => {
      const asset = findAsset(g, a.id)
      return asset ? `${formatMoney(amountOwed(g, asset))} remaining` : ''
    },
    disabledReason: (g) => {
      const b = blockReason(g)
      if (b) return b
      const asset = findAsset(g, a.id)
      if (asset && g.character.money < amountOwed(g, asset)) return `You need ${formatMoney(amountOwed(g, asset))} to pay it off.`
      return null
    },
    confirm: (g) => {
      const asset = findAsset(g, a.id)
      return asset ? `Pay off the remaining ${formatMoney(amountOwed(g, asset))} on your ${asset.name.toLowerCase()}?` : null
    },
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      const owed = amountOwed(g, asset)
      if (!spend(g, owed, 'loan.repay')) {
        cantAfford(g, owed, 'paying it off')
        return
      }
      if (asset.mortgage) delete asset.mortgage
      delete asset.details.missedPayments
      const loan = assetLoan(g, asset)
      if (loan) {
        g.character.loans = g.character.loans.filter((l) => l.id !== loan.id)
        delete asset.details.loanId
      }
      addStat(g, 'happiness', 5)
      log(g, `I paid off my ${asset.name.toLowerCase()}.`, 'good')
      notice(g, 'Paid Off!', `You paid off the ${formatMoney(owed)} you owed on your ${asset.name.toLowerCase()}. It's all yours now. Nobody can take it. (Except the tax man. And burglars.)`, { emoji: '🎉', tone: 'good' })
    },
  }
}

// --- Houses

const RENOVATIONS = [
  { id: 'touchup', label: 'Touch-Ups & Fresh Paint', emoji: '🖌️', cost: 0.015, cond: [8, 15], value: 0.01 },
  { id: 'remodel', label: 'Kitchen & Bath Remodel', emoji: '🛠️', cost: 0.05, cond: [20, 35], value: 0.035 },
  { id: 'gut', label: 'Full Gut Renovation', emoji: '🏗️', cost: 0.12, cond: [100, 100], value: 0.08 },
]

const CONTRACTOR_SUFFIXES = ['Construction', 'Builders', '& Sons Renovations', 'Home Repair', 'Bros. Building', 'Renovations']

/** A builder named after a local family ('Pratama & Sons Renovations'); the US keeps its classics. */
function contractorName(g: GameState): string {
  if (g.character.countryId === 'us') return pick(g, CONTRACTORS)
  return `${randomLastName(g, g.character.countryId)} ${pick(g, CONTRACTOR_SUFFIXES)}`
}

const CONTRACTORS = ['Bob\'s Builders', 'Nail It Construction', 'Hammer Time Renovations', 'Discount Dave\'s Home Repair', 'Precision Craftsmen', 'Two Guys and a Truck', 'Sledgehammer Bros.']

function renovationCost(g: GameState, a: Asset, rate: number): number {
  return nicePrice(Math.max(1_500 * goodsMult(g), a.value * rate))
}

function renovateMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `renovate-${a.id}`,
    label: 'Renovate',
    emoji: '🛠️',
    subtitle: 'Improve condition and value',
    disabledReason: (g) => blockReason(g) ?? (live(g, a).rentedOutFor ? "You can't renovate while tenants live there." : null),
    header: (g) => `Condition: ${live(g, a).condition}% (${conditionLabel(live(g, a).condition)}). Contractors are hired one project per year.`,
    children: (g) =>
      RENOVATIONS.map(
        (r): MenuAction => ({
          type: 'action',
          id: `reno-${a.id}-${r.id}`,
          label: r.label,
          emoji: r.emoji,
          subtitle: `About ${formatMoney(renovationCost(g, live(g, a), r.cost))}`,
          confirm: (gg) => `Hire a contractor for a ${r.label.toLowerCase()}? Estimated cost: ${formatMoney(renovationCost(gg, live(gg, a), r.cost))}.`,
          run: (gg) => {
            const asset = findAsset(gg, a.id)
            if (!asset) return
            if (!useYearAction(gg, `renovate:${asset.id}`, 1)) {
              notice(gg, 'Renovation', 'Your contractor is still finishing the last job. Try again next year.', { emoji: '🛠️' })
              return
            }
            const estimate = renovationCost(gg, asset, r.cost)
            if (!spend(gg, estimate, 'purchase')) {
              gg.yearActions[`renovate:${asset.id}`] = 0
              cantAfford(gg, estimate, 'the renovation')
              return
            }
            const contractor = contractorName(gg)
            const roll = randInt(gg, 1, 100)
            let costNote = 'They finished on time and on budget. A miracle.'
            let paid = estimate
            if (roll <= 20) {
              const refund = nicePrice(estimate * (randInt(gg, 10, 20) / 100))
              addMoney(gg, refund, 'purchase')
              paid -= refund
              costNote = `They came in under budget and refunded you ${formatMoney(refund)}.`
            } else if (roll > 75) {
              const extra = nicePrice(estimate * (randInt(gg, 10, 40) / 100))
              const taken = Math.min(extra, Math.max(0, gg.character.money))
              addMoney(gg, -taken, 'purchase')
              paid += taken
              costNote = taken < extra ? `They went ${formatMoney(extra)} over budget. You scraped together ${formatMoney(taken)} and they grumbled about the rest.` : `They went ${formatMoney(extra)} over budget, of course.`
            }
            const gain = r.cond[0] === 100 ? 100 - asset.condition : randInt(gg, r.cond[0], r.cond[1])
            asset.condition = Math.min(100, asset.condition + gain)
            asset.details.marketValue = Math.round(marketValue(asset) * (1 + r.value))
            asset.details.invested = num(asset.details.invested) + paid
            refreshHouseValue(asset)
            addStat(gg, 'happiness', 3)
            log(gg, `I renovated my ${asset.name.toLowerCase()}.`, 'good')
            notice(gg, 'Renovation Complete', `${contractor} finished the ${r.label.toLowerCase()} on your ${asset.name.toLowerCase()}. ${costNote} Condition is now ${asset.condition}% and it's worth about ${formatMoney(asset.value)}.`, { emoji: r.emoji, tone: 'good' })
          },
        }),
      ),
  }
}

interface Amenity {
  id: string
  label: string
  emoji: string
  pct: number
  min: number
  max: number
  stat: StatKey
  boost: number
}

/** First year an amenity can be installed (no selfie studios or cryo chambers in 1950). */
const AMENITY_FROM: Record<string, number> = { selfie: 2012, cryo: 2010, robot: 2020, infinityPool: 1960, theater: 1995, panicRoom: 1980, hotTub: 1970, gameRoom: 1975 }

function amenityInEra(g: GameState, id: string): boolean {
  const from = AMENITY_FROM[id]
  if (from !== undefined && g.year < from) return false
  return id !== 'selfie' || hasTech(g, 'smartphone')
}

/** Home amenities (value increase % and price ranges from the landlord expansion). */
export const AMENITIES: Amenity[] = [
  { id: 'sauna', label: 'Sauna', emoji: '🧖', pct: 0.05, min: 7_500, max: 10_200, stat: 'health', boost: 4 },
  { id: 'pool', label: 'Swimming Pool', emoji: '🏊', pct: 0.04, min: 47_700, max: 58_300, stat: 'happiness', boost: 5 },
  { id: 'patio', label: 'Patio', emoji: '🪴', pct: 0.04, min: 13_100, max: 16_500, stat: 'happiness', boost: 3 },
  { id: 'observatory', label: 'Observatory', emoji: '🔭', pct: 0.035, min: 39_300, max: 49_000, stat: 'smarts', boost: 3 },
  { id: 'cryo', label: 'Cryo Chamber', emoji: '🧊', pct: 0.03, min: 31_100, max: 38_200, stat: 'looks', boost: 2 },
  { id: 'infinityPool', label: 'Infinity Pool', emoji: '🌊', pct: 0.03, min: 100_600, max: 122_800, stat: 'happiness', boost: 6 },
  { id: 'vineyard', label: 'Vineyard', emoji: '🍇', pct: 0.03, min: 60_000, max: 85_000, stat: 'happiness', boost: 4 },
  { id: 'wineCellar', label: 'Wine Cellar', emoji: '🍷', pct: 0.02, min: 18_000, max: 26_000, stat: 'happiness', boost: 3 },
  { id: 'panicRoom', label: 'Panic Room', emoji: '🚪', pct: 0.02, min: 25_100, max: 32_100, stat: 'happiness', boost: 2 },
  { id: 'tennis', label: 'Tennis Court', emoji: '🎾', pct: 0.02, min: 35_000, max: 45_000, stat: 'health', boost: 4 },
  { id: 'robot', label: 'Housekeeping Robot', emoji: '🤖', pct: 0.015, min: 109_900, max: 122_000, stat: 'happiness', boost: 4 },
  { id: 'theater', label: 'Home Theater', emoji: '🎬', pct: 0.015, min: 25_000, max: 40_000, stat: 'happiness', boost: 4 },
  { id: 'pottery', label: 'Pottery Studio', emoji: '🏺', pct: 0.01, min: 42_800, max: 56_500, stat: 'happiness', boost: 3 },
  { id: 'gym', label: 'Home Gym', emoji: '🏋️', pct: 0.01, min: 12_900, max: 16_400, stat: 'health', boost: 5 },
  { id: 'reading', label: 'Panoramic Reading Room', emoji: '📚', pct: 0.01, min: 37_200, max: 44_500, stat: 'smarts', boost: 4 },
  { id: 'yoga', label: 'Yoga Studio', emoji: '🧘', pct: 0.01, min: 27_600, max: 33_300, stat: 'health', boost: 3 },
  { id: 'hotTub', label: 'Hot Tub', emoji: '🛁', pct: 0.006, min: 6_600, max: 8_800, stat: 'happiness', boost: 3 },
  { id: 'bar', label: 'Cocktail Bar', emoji: '🍸', pct: 0.005, min: 14_200, max: 18_100, stat: 'happiness', boost: 3 },
  { id: 'darkroom', label: 'Photography Darkroom', emoji: '📷', pct: 0.005, min: 20_000, max: 28_500, stat: 'smarts', boost: 2 },
  { id: 'outhouse', label: 'Outhouse', emoji: '🚽', pct: 0.005, min: 4_200, max: 5_300, stat: 'happiness', boost: 1 },
  { id: 'koi', label: 'Koi Pond', emoji: '🐟', pct: 0.003, min: 10_000, max: 12_900, stat: 'happiness', boost: 2 },
  { id: 'gameRoom', label: 'Game Room', emoji: '🎮', pct: 0.0025, min: 10_000, max: 12_300, stat: 'happiness', boost: 3 },
  { id: 'selfie', label: 'Selfie Studio', emoji: '🤳', pct: 0.0015, min: 6_200, max: 6_800, stat: 'looks', boost: 1 },
  { id: 'firePit', label: 'Fire Pit', emoji: '🔥', pct: 0.001, min: 2_500, max: 3_100, stat: 'happiness', boost: 2 },
  { id: 'tetherball', label: 'Tetherball Court', emoji: '🏐', pct: 0.001, min: 1_700, max: 2_200, stat: 'happiness', boost: 1 },
]

function amenityPrice(g: GameState, a: Asset, am: Amenity): number {
  const r = seeded(yearKey(g, `amenity:${a.id}:${am.id}`))
  return nicePrice(r.int(am.min, am.max) * goodsMult(g))
}

function amenitiesMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `amenities-${a.id}`,
    label: 'Add Amenities',
    emoji: '🏊',
    subtitle: 'Pools, saunas, panic rooms...',
    disabledReason: (g) => blockReason(g) ?? (live(g, a).rentedOutFor ? "You can't build amenities while it's rented out." : null),
    header: (g) => (amenities(live(g, a)).length ? `Installed: ${amenities(live(g, a)).map((id) => AMENITIES.find((x) => x.id === id)?.label ?? id).join(', ')}.` : 'Amenities raise your property value and can be enjoyed every year.'),
    children: (g) =>
      AMENITIES.filter((am) => !amenities(live(g, a)).includes(am.id) && amenityInEra(g, am.id)).map(
        (am): MenuAction => ({
          type: 'action',
          id: `amenity-${a.id}-${am.id}`,
          label: am.label,
          emoji: am.emoji,
          subtitle: `${formatMoney(amenityPrice(g, a, am))} · +${(am.pct * 100).toFixed(am.pct < 0.01 ? 2 : 1).replace(/\.?0+$/, '')}% value`,
          confirm: (gg) => `Build a ${am.label.toLowerCase()} for about ${formatMoney(amenityPrice(gg, a, am))}?`,
          run: (gg) => {
            const asset = findAsset(gg, a.id)
            if (!asset || amenities(asset).includes(am.id)) return
            const price = amenityPrice(gg, asset, am)
            if (!spend(gg, price, 'purchase')) {
              cantAfford(gg, price, `a ${am.label.toLowerCase()}`)
              return
            }
            const contractor = contractorName(gg)
            const roll = randInt(gg, 1, 100)
            let note = 'It came out great.'
            let paid = price
            if (roll <= 15) {
              const refund = nicePrice(price * 0.12)
              addMoney(gg, refund, 'purchase')
              paid -= refund
              note = `They finished under budget and refunded ${formatMoney(refund)}.`
            } else if (roll > 80) {
              const extra = Math.min(nicePrice(price * (randInt(gg, 10, 35) / 100)), Math.max(0, gg.character.money))
              addMoney(gg, -extra, 'purchase')
              paid += extra
              note = extra > 0 ? `They went over budget by ${formatMoney(extra)}. Classic.` : 'They tried to bill you extra, but you had nothing left to give.'
            }
            asset.details.amenities = [...amenities(asset), am.id]
            asset.details.marketValue = Math.round(marketValue(asset) * (1 + am.pct))
            asset.details.invested = num(asset.details.invested) + paid
            refreshHouseValue(asset)
            addStat(gg, am.stat, am.boost)
            log(gg, `I added a ${am.label.toLowerCase()} to my ${asset.name.toLowerCase()}.`, 'good')
            notice(gg, 'Amenity Added', `${contractor} built a ${am.label.toLowerCase()} at your ${asset.name.toLowerCase()}. ${note}`, { emoji: am.emoji, tone: 'good' })
          },
        }),
      ),
  }
}

function enjoyAmenitiesAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `enjoy-${a.id}`,
    label: 'Enjoy Your Amenities',
    emoji: '😎',
    visible: (g) => amenities(live(g, a)).length > 0 && !live(g, a).rentedOutFor,
    disabledReason: blockReason,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      if (!useYearAction(g, `enjoy:${asset.id}`, 1)) {
        notice(g, 'Amenities', "You've already lounged around enough at this place this year.", { emoji: '😴' })
        return
      }
      const list = amenities(asset)
        .map((id) => AMENITIES.find((x) => x.id === id))
        .filter((x): x is Amenity => !!x)
      const totals: Partial<Record<StatKey, number>> = {}
      for (const am of list) totals[am.stat] = Math.min(15, (totals[am.stat] ?? 0) + am.boost)
      for (const [k, v] of Object.entries(totals) as [StatKey, number][]) addStat(g, k, v)
      const names = list.slice(0, 3).map((x) => x.label.toLowerCase())
      log(g, `I enjoyed the ${names.join(' and ')} at my ${asset.name.toLowerCase()}.`, 'good')
      notice(g, 'Living Large', `You spent a lazy day enjoying the ${names.join(', ')} at your ${asset.name.toLowerCase()}. ${pickLine(g, ['Life is good.', 'You felt like a celebrity.', 'You could get used to this.'])}`, { emoji: list[0]?.emoji ?? '😎', tone: 'good' })
    },
  }
}

const PARTY_POLICE = defineScript('assets.partyPolice', (g, choice) => {
  if (choice === 'apologize') {
    if (chance(g, 0.85)) {
      notice(g, 'Noise Complaint', 'You apologized and turned the music down. The officer let you off with a warning and a lecture about "respecting the neighborhood."', { emoji: '👮' })
      log(g, 'The police shut down my house party.')
    } else {
      const fine = nicePrice(250 * goodsMult(g))
      addMoney(g, -Math.min(fine, Math.max(0, g.character.money)), 'fine')
      notice(g, 'Noise Complaint', `You apologized, but this was the third complaint this year. The officer wrote you a ${formatMoney(fine)} ticket for disturbing the peace.`, { emoji: '👮', tone: 'bad' })
      log(g, 'I got a ticket for my loud house party.', 'bad')
    }
  } else {
    if (chance(g, 0.35)) {
      addStat(g, 'happiness', 4)
      notice(g, 'Noise Complaint', 'You argued that it was a free country. Somehow it worked. The officer shrugged and left, and the party went on until sunrise.', { emoji: '🎉', tone: 'good' })
      log(g, 'I talked the cops out of shutting down my party.', 'good')
    } else {
      const fine = nicePrice(800 * goodsMult(g))
      addMoney(g, -Math.min(fine, Math.max(0, g.character.money)), 'fine')
      addStat(g, 'happiness', -6)
      notice(g, 'Noise Complaint', `You argued with the officer. Big mistake. The party got shut down and you were fined ${formatMoney(fine)} for disorderly conduct.`, { emoji: '🚔', tone: 'bad' })
      log(g, 'I got fined after arguing with the police at my party.', 'bad')
    }
  }
})

const PARTY_INJURY = defineScript('assets.partyInjury', (g, choice, data) => {
  const name = field<string>(data, 'guest') ?? 'your guest'
  if (choice === 'hospital') {
    addHidden(g, 'karma', 5)
    notice(g, 'Good Samaritan', `You drove ${name} to the hospital. The doctor said it was just a sprain and called you "the responsible one." Nobody has ever called you that before.`, { emoji: '🏥', tone: 'good' })
    log(g, `I took ${name} to the hospital after they got hurt at my party.`)
  } else {
    addHidden(g, 'karma', -6)
    notice(g, 'Party Foul', `You told ${name} to walk it off and showed them the door. They limped home. Word got around.`, { emoji: '🚪', tone: 'bad' })
    log(g, `I kicked an injured guest out of my party.`, 'bad')
  }
})

function partyAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `party-${a.id}`,
    label: 'Throw a House Party',
    emoji: '🎉',
    visible: (g) => !live(g, a).rentedOutFor,
    disabledReason: blockReason,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      if (!useYearAction(g, 'houseParty', 1)) {
        notice(g, 'House Party', 'Nobody wants to come to another party this year. Give them time to recover from the last one.', { emoji: '🥱' })
        return
      }
      const c = g.character
      const roll = randInt(g, 1, 100)
      const guest = `${randomFirstName(g, c.countryId, chance(g, 0.5) ? 'male' : 'female')}`
      if (roll <= 8) {
        addStat(g, 'happiness', -6)
        notice(g, 'Party of One', pickLine(g, ['Nobody came to your party. You ate 40 mini sausage rolls alone.', 'You threw a party and nobody showed. Even the pizza guy just left it at the door.']), { emoji: '😢', tone: 'bad' })
        log(g, 'Nobody showed up to my house party.', 'bad')
        return
      }
      if (roll <= 33) {
        scriptChoice(g, PARTY_POLICE, 'Noise Complaint', `The police showed up at your ${asset.name.toLowerCase()} because a neighbor complained about the noise. What do you do?`, [
          { id: 'apologize', label: 'Apologize', emoji: '🙏' },
          { id: 'argue', label: 'Argue', emoji: '😤' },
        ], { emoji: '🚔' })
        return
      }
      if (roll <= 45) {
        scriptChoice(g, PARTY_INJURY, 'Party Accident', `${guest} fell ${pickLine(g, ['off the kitchen counter while dancing', 'down the stairs', 'into the empty pool', 'through the coffee table'])} at your party. What do you do?`, [
          { id: 'hospital', label: 'Take them to the hospital', emoji: '🏥' },
          { id: 'kick', label: 'Kick them out', emoji: '🚪' },
        ], { emoji: '🤕', data: { guest } })
        return
      }
      addStat(g, 'happiness', randInt(g, 8, 15))
      let text = pickSite(g, [
        `Your party at your ${asset.name.toLowerCase()} was legendary. People will be talking about it for weeks.`,
        'Everyone had a great time at your house party. Someone did a backflip off the couch.',
        'The party was a hit! The DJ played until 3 AM and nobody broke anything important.',
      ], 0x3b3c396d)
      if (chance(g, 0.3)) {
        const p = createPerson(g, { relation: 'friend', age: Math.max(18, c.age + randInt(g, -5, 5)), relationship: randInt(g, 55, 75) })
        text += ` You also hit it off with ${p.firstName} ${p.lastName}, who is now your friend.`
      }
      notice(g, 'House Party', text, { emoji: '🎉', tone: 'good' })
      log(g, 'I threw a house party. Everyone had a great time!', 'good')
    },
  }
}

const TENANT_TRAITS: [string, number][] = [
  ['a quiet nurse who works nights', 0.03],
  ['a retired librarian with a cat', 0.02],
  ['a software engineer who works from home', 0.04],
  ['a grad student on a tight budget', 0.1],
  ['an aspiring DJ with very loud speakers', 0.15],
  ['a young couple with a newborn', 0.06],
  ['a self-described "crypto entrepreneur"', 0.25],
  ['a firefighter who is never home', 0.03],
  ['a guy who wants to pay in cash, no questions asked', 0.3],
  ['a family of five and two dogs', 0.08],
  ['a traveling salesperson', 0.1],
  ['a yoga instructor who burns a lot of incense', 0.07],
]

interface Applicant {
  name: string
  trait: string
  risk: number
  score: number
}

const RENT_LEVEL = defineScript('assets.rentLevel', (g, choice, data) => {
  if (choice === 'cancel') return
  const assetId = field<string>(data, 'assetId')
  const market = field<number>(data, 'market')
  const asset = assetId ? findAsset(g, assetId) : undefined
  if (!asset || asset.kind !== 'house' || asset.details.commercial === true || !market || !Number.isFinite(market) || market <= 0 || asset.rentedOutFor || isHome(g, asset) || adultReason(g, 'become a landlord') || !['low', 'market', 'high'].includes(choice)) return
  if (!useYearAction(g, `landlord.search.${asset.id}`, 2)) return notice(g, 'Rental Search', 'You already ran two applicant searches this year. Try again next year.', { emoji: '🔑' })
  const factor = choice === 'low' ? 0.85 : choice === 'high' ? 1.2 : 1
  const monthly = nicePrice(market * factor)
  const odds = choice === 'low' ? 0.97 : choice === 'high' ? 0.45 : 0.85 * (0.6 + 0.4 * (asset.condition / 100))
  if (!chance(g, odds)) {
    notice(g, 'No Takers', `Nobody wanted to rent your ${asset.name.toLowerCase()} for ${formatMoney(monthly)}/month. Maybe lower the rent or fix the place up.`, { emoji: '🪧', tone: 'bad' })
    return
  }
  const c = g.character
  const n = choice === 'low' ? 3 : choice === 'high' ? 1 : 2
  const applicants: Applicant[] = []
  for (let i = 0; i < n; i++) {
    const [trait, risk] = pick(g, TENANT_TRAITS)
    applicants.push({ name: `${randomFirstName(g, c.countryId, chance(g, 0.5) ? 'male' : 'female')} ${randomLastName(g, c.countryId)}`, trait, risk, score: Math.round(Math.max(480, Math.min(820, 760 - risk * 900 + randInt(g, -60, 60)))) })
  }
  scriptChoice(
    g,
    RENT_APPLICANT,
    'Rental Applicants',
    `You listed your ${asset.name.toLowerCase()} for ${formatMoney(monthly)}/month. ${n === 1 ? 'One person applied:' : 'These people applied:'}`,
    [...applicants.map((a, i) => ({ id: `app${i}`, label: `${a.name}, ${a.trait} (credit ${a.score})`, emoji: '🧑' })), { id: 'cancel', label: 'Reject everyone', emoji: '✖️' }],
    { emoji: '📝', data: { assetId: asset.id, monthly, applicants: toJson(applicants) } },
  )
})

const RENT_APPLICANT = defineScript('assets.rentApplicant', (g, choice, data) => {
  if (choice === 'cancel') return
  const assetId = field<string>(data, 'assetId')
  const monthly = field<number>(data, 'monthly')
  const applicants = field<Applicant[]>(data, 'applicants')
  const asset = assetId ? findAsset(g, assetId) : undefined
  const ap = applicants?.[Number(choice.replace('app', ''))]
  if (!asset || asset.kind !== 'house' || asset.details.commercial === true || !monthly || !Number.isFinite(monthly) || monthly <= 0 || monthly > asset.value * .02 || !ap || typeof ap.name !== 'string' || !Number.isFinite(ap.risk) || asset.rentedOutFor || isHome(g, asset) || adultReason(g, 'become a landlord') || !/^app\d+$/.test(choice)) return
  asset.rentedOutFor = monthly * 12
  asset.details.tenant = ap.name
  asset.details.tenantTrait = ap.trait
  asset.details.tenantRisk = ap.risk
  asset.details.tenantLate = 0
  beginLandlordLease(g, asset)
  log(g, `I rented out my ${asset.name.toLowerCase()} to ${ap.name}.`, 'good')
  notice(g, 'New Tenant', `${ap.name} signed a lease on your ${asset.name.toLowerCase()} for ${formatMoney(monthly)}/month (${formatMoney(monthly * 12)} a year). Congratulations, you're a landlord!`, { emoji: '🔑', tone: 'good' })
})

function rentOutAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `rentout-${a.id}`,
    label: 'Rent Out',
    emoji: '🔑',
    subtitle: 'Find a tenant and collect rent every year',
    visible: (g) => !live(g, a).rentedOutFor && !isHome(g, a) && live(g, a).details.commercial !== true,
    disabledReason: (g) => adultReason(g, 'become a landlord') ?? (live(g, a).condition < 10 ? "It's in no condition to rent out. Renovate first." : null),
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset || asset.kind !== 'house' || asset.details.commercial === true || asset.rentedOutFor || isHome(g, asset) || adultReason(g, 'become a landlord')) return
      const market = Math.max(50, nicePrice((asset.value * 0.0045 * (0.7 + 0.3 * (asset.condition / 100))) / 1))
      scriptChoice(
        g,
        RENT_LEVEL,
        'Set the Rent',
        `How much rent do you want to charge for your ${asset.name.toLowerCase()}? Comparable places go for about ${formatMoney(market)}/month.`,
        [
          { id: 'low', label: `Below market (${formatMoney(nicePrice(market * 0.85))}/mo)`, emoji: '⬇️' },
          { id: 'market', label: `Market rate (${formatMoney(market)}/mo)`, emoji: '⚖️' },
          { id: 'high', label: `Premium (${formatMoney(nicePrice(market * 1.2))}/mo)`, emoji: '⬆️' },
          { id: 'cancel', label: 'Never mind', emoji: '✖️' },
        ],
        { emoji: '🔑', data: { assetId: asset.id, market } },
      )
    },
  }
}

function endTenancy(a: Asset): void {
  endLandlordLease(a)
  delete a.rentedOutFor
  delete a.details.tenant
  delete a.details.tenantTrait
  delete a.details.tenantRisk
  delete a.details.tenantLate
}

function evictAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `evict-${a.id}`,
    label: 'Evict Tenant',
    emoji: '🚪',
    subtitle: (g) => str(live(g, a).details.tenant),
    visible: (g) => !!live(g, a).rentedOutFor,
    disabledReason: blockReason,
    confirm: () => `Evict ${str(a.details.tenant, 'your tenant')}?`,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset || !asset.rentedOutFor) return
      const tenant = str(asset.details.tenant, 'Your tenant')
      const late = num(asset.details.tenantLate) > 0
      endTenancy(asset)
      if (!late) addHidden(g, 'karma', -4)
      log(g, `I evicted my tenant ${tenant}.`)
      notice(g, 'Evicted', late ? `You evicted ${tenant} for not paying rent. They left behind a mattress and a strongly worded note.` : `You evicted ${tenant}, who had done nothing wrong. They left you a one-star review as a landlord online.`, { emoji: '🚪' })
    },
  }
}

export const TENANT_DEFAULT = defineScript('assets.tenantDefault', (g, choice, data) => {
  const assetId = field<string>(data, 'assetId')
  const asset = assetId ? findAsset(g, assetId) : undefined
  if (!asset || !asset.rentedOutFor) return
  const tenant = str(asset.details.tenant, 'Your tenant')
  if (choice === 'evict') {
    endTenancy(asset)
    log(g, `I evicted ${tenant} for not paying rent.`)
    notice(g, 'Evicted', `You served ${tenant} an eviction notice. They moved out in the middle of the night, taking the shower head with them.`, { emoji: '🚪' })
  } else {
    addHidden(g, 'karma', 3)
    notice(g, 'Second Chance', `You gave ${tenant} another chance. They promised to catch up on rent. ${pickLine(g, ['They seemed sincere.', 'They swore on their grandmother. Both of them.', 'They brought you cookies as collateral.'])}`, { emoji: '🤝' })
  }
})

const exorciseAction = (a: Asset): MenuAction => ({
  type: 'action',
  id: `exorcise-${a.id}`,
  label: 'Hire an Exorcist',
  emoji: '👻',
  subtitle: (g) => `Hauntedness ${haunted(live(g, a))}%`,
  visible: (g) => haunted(live(g, a)) > 0,
  disabledReason: blockReason,
  run: (g) => {
    const asset = findAsset(g, a.id)
    if (!asset) return
    if (!useYearAction(g, `exorcise:${asset.id}`, 1)) {
      notice(g, 'Exorcist', 'The exorcist says the spirits need a year to "settle down" before another session.', { emoji: '👻' })
      return
    }
    const cost = nicePrice(randInt(g, 1_500, 5_000) * goodsMult(g))
    if (!spend(g, cost, 'purchase')) {
      g.yearActions[`exorcise:${asset.id}`] = 0
      cantAfford(g, cost, 'an exorcism')
      return
    }
    const drop = randInt(g, 15, 60)
    const before = haunted(asset)
    asset.details.haunted = Math.max(0, before - drop)
    refreshHouseValue(asset)
    if (num(asset.details.haunted) === 0) {
      log(g, `I had my ${asset.name.toLowerCase()} exorcised. No more ghosts!`, 'good')
      notice(g, 'Exorcism Complete', `The exorcist chanted, sprinkled something, and charged you ${formatMoney(cost)}. Your ${asset.name.toLowerCase()} is officially ghost-free!`, { emoji: '✝️', tone: 'good' })
    } else {
      log(g, `I paid an exorcist to clear the ghosts from my ${asset.name.toLowerCase()}.`)
      notice(g, 'Partially Exorcised', `The exorcist banished some of the spirits for ${formatMoney(cost)}, but something in the attic is still laughing. Hauntedness dropped from ${before}% to ${asset.details.haunted}%.`, { emoji: '👻' })
    }
  },
})

function moveInAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `movein-${a.id}`,
    label: 'Move In',
    emoji: '📦',
    visible: (g) => !isHome(g, a) && !live(g, a).rentedOutFor && live(g, a).details.commercial !== true,
    disabledReason: (g) => blockReason(g) ?? (g.character.age < 18 ? 'You must be 18 to live on your own.' : null),
    confirm: (g) => (g.character.residence.status === 'renting' ? 'Move in? Your current lease will end.' : null),
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      const was = g.character.residence.status
      if (asset.details.commercial === true) return
      g.character.residence = { status: 'owned', assetId: asset.id, description: asset.name }
      addStat(g, 'happiness', 3)
      log(g, `I moved into my ${asset.name.toLowerCase()}.`)
      notice(g, 'Moved In', `You moved into your ${asset.name.toLowerCase()}${was === 'renting' ? ' and ended your lease' : ''}. ${pickLine(g, ['Unpacking can wait until next year.', 'You christened it with takeout on the floor.', 'It already feels like home.'])}`, { emoji: '📦', tone: 'good' })
    },
  }
}

// --- Vehicles

function driveAction(a: Asset): MenuAction {
  const verb = a.kind === 'car' ? 'Go for a Drive' : a.kind === 'boat' ? 'Take It Out on the Water' : 'Go for a Flight'
  return {
    type: 'action',
    id: `drive-${a.id}`,
    label: verb,
    emoji: a.kind === 'car' ? '🛣️' : a.kind === 'boat' ? '🌊' : '☁️',
    disabledReason: (g) => {
      const b = blockReason(g)
      if (b) return b
      if (live(g, a).condition <= 0) return "It doesn't run anymore."
      if (a.kind === 'aircraft' && !hasLicense(g, 'pilot')) return "You need a pilot's license to fly it."
      if (a.kind === 'boat' && typeof a.details.license === 'string' && !hasLicense(g, a.details.license)) return 'You need a boating license to take it out.'
      return null
    },
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      if (!useYearAction(g, `drive:${asset.id}`, 3)) {
        notice(g, verb, `You've already taken your ${asset.name.toLowerCase()} out plenty this year.`, { emoji: asset.emoji })
        return
      }
      const c = g.character
      asset.condition = Math.max(0, asset.condition - randInt(g, 0, 2))
      const risk = asset.condition < 25 ? 0.12 : asset.condition < 50 ? 0.05 : 0.02
      if (asset.kind === 'car' && !hasLicense(g, 'driver') && chance(g, 0.35)) {
        const fine = nicePrice(randInt(g, 300, 900) * goodsMult(g))
        addMoney(g, -Math.min(fine, Math.max(0, c.money)), 'fine')
        addStat(g, 'happiness', -5)
        notice(g, 'Pulled Over', `A cop pulled you over in your ${asset.name}. When you couldn't produce a driver's license, they wrote you a ${formatMoney(fine)} ticket and made you call someone for a ride.`, { emoji: '🚓', tone: 'bad' })
        log(g, 'I got a ticket for driving without a license.', 'bad')
        return
      }
      if (chance(g, risk)) {
        asset.condition = Math.max(0, asset.condition - randInt(g, 20, 40))
        if (asset.kind === 'aircraft') {
          addStat(g, 'health', -randInt(g, 35, 70))
          if (c.stats.health <= 0) {
            killCharacter(g, 'Plane Crash')
            return
          }
          notice(g, 'Crash Landing', `Your ${asset.name.toLowerCase()} lost power and you crash-landed in a field. You survived, barely. The cows were unimpressed.`, { emoji: '💥', tone: 'bad' })
          log(g, `I crash-landed my ${asset.name.toLowerCase()}.`, 'bad')
          return
        }
        const injury = pick(g, ['Whiplash', 'Broken Arm', 'Concussion', 'Bruised Ribs'])
        addStat(g, 'health', -randInt(g, 8, 20))
        if (!c.conditions.some((x) => x.name === injury)) {
          c.conditions.push({ id: uid(g, 'c'), name: injury, kind: 'injury', severity: randInt(g, 10, 25), yearsHad: 0, curable: true, diagnosed: true, age: c.age })
        }
        const what = asset.kind === 'boat' ? `You hit a sandbar in your ${asset.name.toLowerCase()} and were thrown overboard.` : `You crashed your ${asset.name} into a ${pickLine(g, ['lamppost', 'mailbox', 'parked ice cream truck', 'ditch'])}.`
        notice(g, 'Accident!', `${what} You ended up with ${injury.toLowerCase()}.`, { emoji: '💥', tone: 'bad' })
        log(g, asset.kind === 'boat' ? `I had a boating accident.` : `I crashed my ${asset.name}.`, 'bad')
        return
      }
      addStat(g, 'happiness', randInt(g, 3, 8))
      const lines =
        asset.kind === 'car'
          ? [`You took your ${asset.name} for a spin with the windows down and the music up.`, `You cruised around town in your ${asset.name}. A kid at a stoplight gave you a thumbs up.`, `You took your ${asset.name} on a scenic drive along the coast.`]
          : asset.kind === 'boat'
            ? [`You spent a gorgeous afternoon on your ${asset.name.toLowerCase()}. You even saw dolphins.`, `You took your ${asset.name.toLowerCase()} out on the lake and caught some sun.`, `You went out on your ${asset.name.toLowerCase()} and pretended to be a pirate. Nobody saw. Probably.`]
            : [`You took your ${asset.name.toLowerCase()} up above the clouds. Everything looks tiny from up here.`, `You flew your ${asset.name.toLowerCase()} over the city at sunset.`, `You did a lazy loop in your ${asset.name.toLowerCase()} and only screamed a little.`]
      log(g, asset.kind === 'car' ? `I went for a drive in my ${asset.name}.` : `I took my ${asset.name.toLowerCase()} out.`, 'good')
      notice(g, verb, pick(g, lines), { emoji: asset.emoji, tone: 'good' })
    },
  }
}

function maintainAction(a: Asset): MenuAction {
  const label = a.kind === 'instrument' ? 'Tune & Polish' : a.kind === 'jewelry' ? 'Clean & Polish' : 'Maintenance'
  return {
    type: 'action',
    id: `maintain-${a.id}`,
    label,
    emoji: a.kind === 'instrument' ? '🎼' : a.kind === 'jewelry' ? '🧽' : '🔧',
    subtitle: (g) => `About ${formatMoney(maintenanceCost(g, a))}`,
    visible: (g) => live(g, a).condition < 100,
    disabledReason: blockReason,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      if (!useYearAction(g, `maint:${asset.id}`, 1)) {
        notice(g, label, `Your ${asset.name.toLowerCase()} was already serviced this year.`, { emoji: '🔧' })
        return
      }
      const cost = maintenanceCost(g, asset)
      if (!spend(g, cost, 'purchase')) {
        g.yearActions[`maint:${asset.id}`] = 0
        cantAfford(g, cost, 'the maintenance')
        return
      }
      const cap = asset.kind === 'car' ? Math.max(40, 100 - Math.max(0, g.year - num(asset.details.modelYear, g.year)) * 2) : 100
      const before = asset.condition
      asset.condition = Math.max(before, Math.min(cap, before + randInt(g, 10, 25)))
      const gained = asset.condition - before
      log(g, `I had my ${asset.name.toLowerCase()} serviced.`)
      notice(g, label, gained > 0 ? `You paid ${formatMoney(cost)} and your ${asset.name.toLowerCase()} is in better shape: condition ${before}% → ${asset.condition}%.` : `You paid ${formatMoney(cost)}, but the mechanic says this ${asset.name.toLowerCase()} is about as good as it's going to get at its age.`, { emoji: '🔧' })
    },
  }
}

function maintenanceCost(g: GameState, a: Asset): number {
  const m = goodsMult(g)
  switch (a.kind) {
    case 'car':
      return nicePrice(Math.max(150 * m, a.value * 0.04 + 300 * m))
    case 'boat':
    case 'aircraft':
      return nicePrice(Math.max(300 * m, a.value * 0.03))
    case 'instrument':
      return nicePrice(Math.max(20 * m, a.value * 0.05))
    case 'jewelry':
      return nicePrice(Math.max(30 * m, a.value * 0.01))
    default:
      return nicePrice(Math.max(50 * m, a.value * 0.03))
  }
}

function scrapAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `scrap-${a.id}`,
    label: 'Take to the Scrapyard',
    emoji: '♻️',
    visible: (g) => live(g, a).condition < 30,
    disabledReason: (g) => blockReason(g) ?? (amountOwed(g, live(g, a)) > 0 ? 'Pay off the loan first.' : null),
    confirm: () => `Scrap your ${a.name.toLowerCase()}?`,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      const scrap = nicePrice(Math.max(100, asset.value * 0.15))
      g.assets = g.assets.filter((x) => x.id !== asset.id)
      addMoney(g, scrap, 'purchase')
      log(g, `I scrapped my ${asset.name.toLowerCase()} for ${formatMoney(scrap)}.`)
      notice(g, 'Scrapped', `The scrapyard gave you ${formatMoney(scrap)} for your ${asset.name.toLowerCase()}. They crushed it into a cube while you watched. It was oddly moving.`, { emoji: '♻️' })
    },
  }
}

// --- Jewelry, instruments, collectibles, electronics

function appraiseAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `appraise-${a.id}`,
    label: 'Get Appraised',
    emoji: '🔍',
    disabledReason: blockReason,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      if (!useYearAction(g, `appraise:${asset.id}`, 1)) {
        notice(g, 'Appraisal', 'You already had it appraised this year. The appraiser is starting to recognize you.', { emoji: '🔍' })
        return
      }
      const fee = nicePrice(Math.max(25, Math.min(500, asset.value * 0.01)))
      if (!spend(g, fee, 'purchase')) {
        g.yearActions[`appraise:${asset.id}`] = 0
        cantAfford(g, fee, 'the appraisal fee')
        return
      }
      asset.details.appraised = true
      const text =
        asset.details.fake === true
          ? `The appraiser squinted, then laughed. "Cubic zirconia in gold-painted brass." Your ${asset.name.toLowerCase()} is worth about ${formatMoney(asset.value)}.`
          : `The appraiser says your ${asset.name.toLowerCase()} is worth about ${formatMoney(asset.value)}${asset.value > asset.purchasePrice ? '. Nice investment!' : ` (you paid ${formatMoney(asset.purchasePrice)}).`}`
      notice(g, 'Appraisal', `${text} The appraisal cost ${formatMoney(fee)}.`, { emoji: '🔍' })
    },
  }
}

function useItemAction(a: Asset): MenuAction {
  const cat = str(a.details.category)
  const label = a.kind === 'instrument' ? 'Play' : cat === 'electronics' ? 'Use' : cat === 'art' || a.kind === 'collectible' ? 'Admire' : a.kind === 'jewelry' || cat === 'luxury' ? 'Wear It Out' : 'Use'
  return {
    type: 'action',
    id: `use-${a.id}`,
    label,
    emoji: a.kind === 'instrument' ? '🎶' : '✨',
    disabledReason: (g) => blockReason(g) ?? (live(g, a).condition <= 0 ? "It's broken." : null),
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      if (!useYearAction(g, `use:${asset.id}`, 2)) {
        notice(g, label, `You've had your fun with your ${asset.name.toLowerCase()} this year.`, { emoji: asset.emoji })
        return
      }
      if (asset.kind === 'instrument') {
        asset.condition = Math.max(0, asset.condition - randInt(g, 1, 4))
        addStat(g, 'happiness', randInt(g, 2, 5))
        addStat(g, 'smarts', chance(g, 0.5) ? 1 : 0)
        const name = str(asset.details.instrument, asset.name).toLowerCase()
        const lines = [`You played your ${name} for hours. You're getting better!`, `You practiced your ${name}. The dog left the room.`, `You played your ${name} and nailed a song all the way through for the first time.`]
        log(g, `I played my ${name}.`)
        notice(g, 'Music Time', pick(g, lines), { emoji: asset.emoji, tone: 'good' })
        return
      }
      if (cat === 'electronics') {
        asset.condition = Math.max(0, asset.condition - randInt(g, 1, 5))
        addStat(g, 'happiness', randInt(g, 2, 4))
        log(g, `I spent the day on my ${asset.name.toLowerCase()}.`)
        notice(g, label, pickSite(g, [`You lost a whole weekend to your ${asset.name.toLowerCase()}.`, `You played with your ${asset.name.toLowerCase()} until the battery died.`, `Your ${asset.name.toLowerCase()} made you very happy and slightly less productive.`], 0x13e34dff), { emoji: asset.emoji, tone: 'good' })
        return
      }
      if (a.kind === 'jewelry' || cat === 'luxury') {
        addStat(g, 'happiness', randInt(g, 2, 4))
        addStat(g, 'looks', chance(g, 0.4) ? 1 : 0)
        log(g, `I showed off my ${asset.name.toLowerCase()} around town.`)
        notice(g, 'Looking Good', pickSite(g, [`You wore your ${asset.name.toLowerCase()} out and got three compliments.`, `Everyone noticed your ${asset.name.toLowerCase()}. One person asked if it was real.`, `You felt like a million bucks wearing your ${asset.name.toLowerCase()}.`], 0xedfe5f13), { emoji: asset.emoji, tone: 'good' })
        return
      }
      addStat(g, 'happiness', randInt(g, 1, 4))
      log(g, `I admired my ${asset.name.toLowerCase()}.`)
      notice(g, 'Collector', pickSite(g, [`You stared at your ${asset.name.toLowerCase()} for an hour. Worth it.`, `You showed off your ${asset.name.toLowerCase()} to a friend, who pretended to care.`, `You dusted your ${asset.name.toLowerCase()} with a tiny brush. Pure bliss.`], 0xe6716eda), { emoji: asset.emoji, tone: 'good' })
    },
  }
}

// --- Heirlooms

const HEIRLOOM_PLAY: Record<string, string[]> = {
  dice: ['You rolled the lucky dice. Seven. Again. And again. This is getting spooky.', 'You rolled the lucky dice and they came up double sixes. You feel lucky.'],
  grail: ['You drank water from the Holy Grail. A warm light filled you from head to toe.'],
  violin: ['You played the Stradivarius. Even your sloppy scales sounded like a symphony.'],
  crystalBall: ['You gazed into the crystal ball. It showed you... your own reflection, looking confused.'],
  tarot: ['You did a tarot reading for yourself. The Tower. Then Death. Then the Fool. Accurate.'],
  slotMachine: ['You fed the antique slot machine a quarter. It ate it. Tradition.'],
  telescope: ['You looked at Saturn through the telescope. It really does have rings!'],
  galileo: ["You looked through Galileo's telescope. The moons of Jupiter, just like he saw them."],
}

function heirloomPlayAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `playHeirloom-${a.id}`,
    label: 'Play',
    emoji: '🎈',
    disabledReason: (g) => blockReason(g) ?? (live(g, a).condition <= 0 ? "It's too broken to play with." : null),
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      if (!useYearAction(g, `play:${asset.id}`, 2)) {
        notice(g, 'Play', `You've played with the ${asset.name.toLowerCase()} enough this year. Let it rest.`, { emoji: asset.emoji })
        return
      }
      const id = str(asset.details.heirloomId)
      const nm = asset.name.toLowerCase()
      if (id === 'grail') {
        for (const k of ['happiness', 'health', 'smarts', 'looks'] as StatKey[]) addStat(g, k, 100)
        count(g, 'grailUses')
        log(g, 'I drank from the Holy Grail and felt incredible.', 'good')
        notice(g, 'Divine', pick(g, HEIRLOOM_PLAY.grail), { emoji: '✨', tone: 'good' })
        return
      }
      addStat(g, 'happiness', randInt(g, 2, 6))
      let text = pick(g, HEIRLOOM_PLAY[id] ?? [`You played with the ${nm} for hours. It brought back memories you never had.`, `You took the ${nm} for a spin. The family would be proud. Or horrified.`, `You had a blast with the ${nm}. Some heirlooms are meant to be used.`])
      if (chance(g, 0.12)) {
        const dmg = randInt(g, 10, 25)
        asset.condition = Math.max(0, asset.condition - dmg)
        asset.value = heirloomValue(num(asset.details.baseValue, asset.value), asset.condition)
        text += ` Unfortunately, you damaged it a little (condition -${dmg}%).`
      }
      log(g, `I played with the ${nm}.`)
      notice(g, 'Play Time', text, { emoji: asset.emoji, tone: 'good' })
    },
  }
}

function refurbishAction(a: Asset): MenuAction {
  return {
    type: 'action',
    id: `refurb-${a.id}`,
    label: 'Refurbish',
    emoji: '🧽',
    subtitle: (g) => `${formatMoney(num(live(g, a).details.refurbCost))} · restores it to mint condition`,
    visible: (g) => live(g, a).details.refurbCost !== null && num(live(g, a).details.refurbCost) > 0 && live(g, a).condition < 100,
    disabledReason: blockReason,
    confirm: (g) => `Have a restorer refurbish your ${a.name.toLowerCase()} for ${formatMoney(num(live(g, a).details.refurbCost))}?`,
    run: (g) => {
      const asset = findAsset(g, a.id)
      if (!asset) return
      const cost = num(asset.details.refurbCost)
      if (cost <= 0 || asset.condition >= 100) return
      if (!spend(g, cost, 'purchase')) {
        cantAfford(g, cost, 'the refurbishment')
        return
      }
      const before = asset.value
      asset.condition = 100
      asset.value = heirloomValue(num(asset.details.baseValue, asset.value), 100)
      log(g, `I had my ${asset.name.toLowerCase()} refurbished.`)
      notice(g, 'Good as New', `A restorer spent weeks on your ${asset.name.toLowerCase()}. It's in mint condition, and its estimated value went from ${formatMoney(before)} to ${formatMoney(asset.value)}.`, { emoji: '🧽', tone: 'good' })
    },
  }
}

// ---------------------------------------------------------------------------
// Owned asset node

function assetSubtitle(g: GameState, a: Asset): string {
  const bits = [shortMoney(a.value)]
  if (a.kind !== 'collectible' || a.condition < 100) bits.push(`Condition ${a.condition}%`)
  if (isHome(g, a)) bits.push('🏠 Home')
  if (a.rentedOutFor) bits.push('🔑 Rented')
  if (a.mortgage) bits.push('Mortgaged')
  else if (assetLoan(g, a)) bits.push('Financed')
  if (a.details.fake === true) bits.push('Costume')
  if (isHeirloom(a)) bits.push(str(a.details.rarity, 'Heirloom'))
  if (haunted(a) > 0) bits.push('👻')
  return bits.join(' · ')
}

function assetInfo(g: GameState, a: Asset): MenuNode[] {
  const rows: string[] = []
  rows.push(isHeirloom(a) ? `💰 Estimated value: ${formatMoney(a.value)} (found at age ${a.purchasedAge})` : `💰 Value: ${formatMoney(a.value)} (paid ${formatMoney(a.purchasePrice)} at age ${a.purchasedAge})`)
  rows.push(`🔧 Condition: ${a.condition}% (${conditionLabel(a.condition)})`)
  const d = a.details
  if (a.kind === 'house') {
    if (d.address) rows.push(`📍 ${str(d.address)}, ${str(d.city, g.character.city)}`)
    if (d.commercial === true) rows.push(`🏢 Commercial premises · ${num(d.sqft).toLocaleString('en-US')} sq ft${d.built ? ` · built ${num(d.built)}` : ''}`)
    else if (d.beds) rows.push(`🛏️ ${num(d.beds)} bed · ${num(d.baths)} bath · ${num(d.sqft).toLocaleString('en-US')} sq ft${num(d.acres) ? ` · ${num(d.acres).toLocaleString('en-US')} acres` : ''}${d.built ? ` · built ${num(d.built)}` : ''}`)
    if (haunted(a) > 0) rows.push(`👻 Hauntedness: ${haunted(a)}%`)
    if (amenities(a).length) rows.push(`✨ Amenities: ${amenities(a).map((id) => AMENITIES.find((x) => x.id === id)?.label ?? id).join(', ')}`)
    if (a.rentedOutFor) rows.push(`🔑 Rented to ${str(d.tenant, 'a tenant')} (${str(d.tenantTrait, 'tenant')}) for ${formatMoney(Math.round(a.rentedOutFor / 12))}/month`)
  }
  if (a.kind === 'car') rows.push(`🚘 ${str(d.color, 'Unknown color')} · ${num(d.mileage).toLocaleString('en-US')} miles`)
  if (a.kind === 'jewelry') rows.push(`💎 ${num(d.carats) ? `${num(d.carats)} carats · ` : ''}Quality ${num(d.quality, 50)}%${d.fake === true ? ' · Costume jewelry' : ''}`)
  if (str(d.category) === 'art') rows.push(`🎨 ${str(d.medium, 'Artwork')} by ${str(d.artist, 'an unknown artist')}`)
  if (isHeirloom(a)) {
    rows.push(`📜 ${str(d.desc, 'A family heirloom.')}`)
    rows.push(`🏷️ Rarity: ${str(d.rarity, 'Common')}${d.lucky === true ? ' · 🍀 Brings luck at the casino and the lottery' : ''}`)
  }
  if (a.mortgage) rows.push(`🏦 Mortgage: ${formatMoney(a.mortgage.balance)} left with ${a.mortgage.lender} · ${formatMoney(a.mortgage.yearlyPayment)}/yr · ${a.mortgage.yearsLeft} yrs · ${(a.mortgage.rate * 100).toFixed(2)}%`)
  const loan = assetLoan(g, a)
  if (loan) rows.push(`🏦 ${loanLabel(loan.kind)}: ${formatMoney(loan.balance)} left with ${loan.lender} · ${formatMoney(loan.yearlyPayment)}/yr`)
  const up = a.upkeep + (isInsured(a) ? insurancePremium(g, a) : 0)
  if (up > 0) rows.push(`🧾 Upkeep: ${formatMoney(up)}/year${isInsured(a) ? ' (incl. insurance)' : ''}`)
  if (isInsured(a)) rows.push('🛡️ Insured')
  return rows.map((text, i): MenuNode => ({ type: 'info', id: `info-${a.id}-${i}`, text }))
}

/**
 * Asset kinds whose owned-asset screen is built by another module (business.ts,
 * investments.ts, shops/memberships.ts). menus.ts fills this in at load, which keeps
 * assets.ts free of imports from those modules. `subtitle` replaces the generic
 * "value · condition" line; `children` replaces the whole screen (info rows and actions).
 */
export const ASSET_KIND_VIEWS: Partial<Record<AssetKind, { subtitle?: (g: GameState, a: Asset) => string; children: (g: GameState, a: Asset) => MenuNode[] }>> = {}

/**
 * Optional per-holding extensions supplied by feature modules in menus.ts. `view` may replace
 * the generic holding screen; `extra` appends one row to an otherwise generic screen.
 */
export const ASSET_NODE_HOOKS: {
  subtitle?: (g: GameState, a: Asset) => string | null
  view?: (g: GameState, a: Asset) => MenuNode[] | null
  extra?: (g: GameState, a: Asset) => MenuNode | null
} = {}

function assetNode(g: GameState, a: Asset): MenuGroup {
  const view = isHeirloom(a) ? undefined : ASSET_KIND_VIEWS[a.kind]
  return {
    type: 'menu',
    id: `asset-${a.id}`,
    label: a.name,
    emoji: a.emoji,
    subtitle: ASSET_NODE_HOOKS.subtitle?.(g, a) ?? (view?.subtitle ? view.subtitle(g, a) : assetSubtitle(g, a)),
    header: (gg) => {
      const cur = findAsset(gg, a.id)
      return cur ? `${cur.emoji} ${cur.name}${cur.kind === 'house' && cur.details.typeLabel ? ` (${str(cur.details.typeLabel)})` : ''}` : 'This asset is gone.'
    },
    children: (gg) => {
      const cur = findAsset(gg, a.id)
      if (!cur) return [{ type: 'info', id: 'gone', text: 'You no longer own this.' }]
      const hookedView = ASSET_NODE_HOOKS.view?.(gg, cur)
      if (hookedView) return hookedView
      if (view) return view.children(gg, cur)
      const nodes: MenuNode[] = [...assetInfo(gg, cur), { type: 'heading', id: `actions-${cur.id}`, label: 'Actions' }]
      const push = (n: MenuNode | null) => {
        if (n) nodes.push(n)
      }
      if (isHeirloom(cur)) {
        push(cur.details.playable === true ? heirloomPlayAction(cur) : useItemAction(cur))
        push(refurbishAction(cur))
        push(giftMenu(cur))
        push(sellAction(cur))
        push(donateAction(cur))
        push(discardAction(cur))
        return nodes
      }
      switch (cur.kind) {
        case 'house':
          if (cur.details.commercial !== true) {
            push(moveInAction(cur))
            push(partyAction(cur))
            push(enjoyAmenitiesAction(cur))
            push(rentOutAction(cur))
          }
          push(evictAction(cur))
          push(landlordMenu(cur))
          push(renovateMenu(cur))
          if (cur.details.commercial !== true) {
            push(amenitiesMenu(cur))
            push(exorciseAction(cur))
          }
          push(insureAction(cur))
          push(payOffAction(cur))
          push(giftMenu(cur))
          push(sellAction(cur))
          break
        case 'car':
        case 'boat':
        case 'aircraft':
          if (cur.kind !== 'car') push(charterMenu(cur))
          push(driveAction(cur))
          push(maintainAction(cur))
          push(insureAction(cur))
          push(payOffAction(cur))
          if (cur.kind === 'car') push(giftMenu(cur))
          push(sellAction(cur))
          push(scrapAction(cur))
          break
        case 'jewelry':
          push(useItemAction(cur))
          push(appraiseAction(cur))
          push(maintainAction(cur))
          push(insureAction(cur))
          push(giftMenu(cur))
          push(sellAction(cur))
          push(donateAction(cur))
          push(discardAction(cur))
          break
        case 'instrument':
          push(useItemAction(cur))
          push(maintainAction(cur))
          push(giftMenu(cur))
          push(sellAction(cur))
          push(donateAction(cur))
          push(discardAction(cur))
          break
        case 'collectible':
          push(useItemAction(cur))
          push(appraiseAction(cur))
          push(insureAction(cur))
          push(giftMenu(cur))
          push(sellAction(cur))
          push(donateAction(cur))
          break
        case 'business':
          push(sellAction(cur))
          break
        default:
          push(useItemAction(cur))
          push(giftMenu(cur))
          push(sellAction(cur))
          push(donateAction(cur))
          push(discardAction(cur))
      }
      push(ASSET_NODE_HOOKS.extra?.(gg, cur) ?? null)
      return nodes
    },
  }
}

const KIND_SECTIONS: [string, AssetKind[]][] = [
  ['Real Estate', ['house']],
  ['Vehicles', ['car', 'boat', 'aircraft']],
  ['Jewelry', ['jewelry']],
  ['Instruments', ['instrument']],
  ['Art & Collectibles', ['collectible']],
  ['Businesses', ['business']],
  ['Investments', ['investment']],
  ['Memberships & Subscriptions', ['membership']],
  ['Online Ventures', ['venture']],
  ['Belongings', ['other']],
]

function ownedAssetNodes(g: GameState): MenuNode[] {
  if (g.assets.length === 0) return [{ type: 'info', id: 'noAssets', text: "You don't own anything yet.", emoji: '📭' }]
  const nodes: MenuNode[] = []
  const heirlooms = g.assets.filter(isHeirloom)
  if (heirlooms.length) {
    nodes.push({ type: 'heading', id: 'sec-heirlooms', label: `Family Heirlooms (${heirlooms.length})` })
    for (const a of heirlooms) nodes.push(assetNode(g, a))
  }
  for (const [title, kinds] of KIND_SECTIONS) {
    const list = g.assets.filter((a) => kinds.includes(a.kind) && !isHeirloom(a))
    if (list.length === 0) continue
    nodes.push({ type: 'heading', id: `sec-${title}`, label: `${title} (${list.length})` })
    for (const a of list) nodes.push(assetNode(g, a))
  }
  const other = g.assets.filter((a) => !isHeirloom(a) && !KIND_SECTIONS.some(([, kinds]) => kinds.includes(a.kind)))
  for (const a of other) nodes.push(assetNode(g, a))
  return nodes
}

function loanNodes(g: GameState): MenuNode[] {
  const c = g.character
  if (c.loans.length === 0) return []
  const nodes: MenuNode[] = [{ type: 'heading', id: 'loansHeading', label: 'Loans & Debts' }]
  for (const loan of c.loans) {
    nodes.push({
      type: 'action',
      id: `loan-${loan.id}`,
      label: `${loanLabel(loan.kind)} · ${loan.lender}`,
      emoji: loan.kind === 'student' ? '🎓' : loan.kind === 'car' ? '🚗' : '🏦',
      subtitle: `${formatMoney(loan.balance)} left · ${formatMoney(loan.yearlyPayment)}/yr · ${(loan.rate * 100).toFixed(1)}% APR`,
      disabledReason: (gg) => {
        const b = blockReason(gg)
        if (b) return b
        const l = gg.character.loans.find((x) => x.id === loan.id)
        if (l && gg.character.money < l.balance) return `You need ${formatMoney(l.balance)} to pay this off.`
        return null
      },
      confirm: (gg) => {
        const l = gg.character.loans.find((x) => x.id === loan.id)
        return l ? `Pay off the remaining ${formatMoney(l.balance)}?` : null
      },
      run: (gg) => {
        const l = gg.character.loans.find((x) => x.id === loan.id)
        if (!l) return
        const amount = l.balance
        if (!payOffLoan(gg, l.id)) {
          cantAfford(gg, amount, 'paying off the loan')
          return
        }
        for (const a of gg.assets) if (a.details.loanId === l.id) delete a.details.loanId
        addStat(gg, 'happiness', 5)
        log(gg, `I paid off my ${loanLabel(l.kind).toLowerCase()}.`, 'good')
        notice(gg, 'Debt Free!', `You paid off your ${loanLabel(l.kind).toLowerCase()} with ${l.lender}. ${formatMoney(amount)} gone, and so is that monthly dread.`, { emoji: '🎉', tone: 'good' })
      },
    })
  }
  return nodes
}

// ---------------------------------------------------------------------------
// Top-level menus

export const assetsMenu: MenuGroup = {
  type: 'menu',
  id: 'assets',
  label: 'Assets',
  emoji: '🏠',
  header: (g) => {
    const c = g.character
    const score = creditScore(g)
    return `${residenceText(g)}\nBank balance: ${formatMoney(c.money)} · Net worth: ${formatMoney(netWorth(g))}${score ? ` · Credit: ${score} (${creditLabel(score)})` : ''}`
  },
  children: (g) => [
    ...ownedAssetNodes(g),
    ...loanNodes(g),
    { type: 'heading', id: 'atticHeading', label: 'Heirlooms', visible: (gg) => searchAtticAction.visible?.(gg) ?? true },
    searchAtticAction,
    { type: 'heading', id: 'housingHeading', label: 'Housing' },
    realEstateMenu,
    rentalsMenu,
    { type: 'heading', id: 'shopHeading', label: 'Shopping' },
    carDealersMenu,
    specialtyVehiclesMenu,
    jewelersMenu,
    instrumentStoreMenu,
    electronicsStoreMenu,
    luxuryStoreMenu,
    collectiblesMenu,
  ],
}

export const shoppingMenu: MenuGroup = {
  type: 'menu',
  id: 'shopping',
  label: 'Shopping',
  emoji: '🛍️',
  subtitle: 'Cars, homes, jewelry, gadgets and more',
  visible: (g) => !inPrison(g),
  disabledReason: (g) => ageReason(g, 10, 'go shopping on your own'),
  header: (g) => [`You have ${formatMoney(g.character.money)} to spend.`, pricesIncludeTax(g), marketShoppingNote(g)].filter(Boolean).join(' '),
  children: () => [
    { type: 'heading', id: 'shopStores', label: 'Stores' },
    electronicsStoreMenu,
    instrumentStoreMenu,
    jewelersMenu,
    luxuryStoreMenu,
    collectiblesMenu,
    { type: 'heading', id: 'shopBig', label: 'Big Purchases' },
    carDealersMenu,
    specialtyVehiclesMenu,
    realEstateMenu,
    rentalsMenu,
  ],
}

// ---------------------------------------------------------------------------
// Yearly hook

const CAR_BREAKDOWN = defineScript('assets.carBreakdown', (g, choice, data) => {
  const assetId = field<string>(data, 'assetId')
  const cost = field<number>(data, 'cost') ?? 0
  const asset = assetId ? findAsset(g, assetId) : undefined
  if (!asset) return
  if (choice === 'repair') {
    if (!spend(g, cost, 'purchase')) {
      cantAfford(g, cost, 'the repair')
      asset.condition = Math.max(0, asset.condition - 10)
      return
    }
    asset.condition = Math.min(100, asset.condition + randInt(g, 15, 30))
    log(g, `I paid ${formatMoney(cost)} to fix my ${asset.name}.`)
    notice(g, 'Fixed', `The mechanic got your ${asset.name} running again for ${formatMoney(cost)}. "Should be good for a while," he said, without making eye contact.`, { emoji: '🔧' })
  } else if (choice === 'scrap') {
    const owed = amountOwed(g, asset)
    const scrap = nicePrice(Math.max(100, asset.value * 0.15))
    if (owed > 0 && g.character.money + scrap < owed) {
      asset.condition = 0
      notice(g, 'Still Owe', `You can't scrap a car you still owe ${formatMoney(owed)} on. It sits in your driveway, broken and judging you.`, { emoji: '🚗', tone: 'bad' })
      return
    }
    removeAsset(g, asset)
    addMoney(g, scrap - owed, 'purchase') // one booking: net of the payoff
    log(g, `I scrapped my broken-down ${asset.name}.`)
    notice(g, 'Scrapped', `You sold your ${asset.name} to the scrapyard for ${formatMoney(scrap)}${owed > 0 ? ` and paid off the ${formatMoney(owed)} left on the loan` : ''}. Rest in pieces.`, { emoji: '♻️' })
  } else {
    asset.condition = Math.max(0, asset.condition - 15)
    notice(g, 'Ignored It', `You decided the noise would probably go away on its own. Your ${asset.name} is now in even worse shape.`, { emoji: '🙈' })
  }
})

function ageAsset(g: GameState, a: Asset, market: number): void {
  if (a.details.lux === 1) return
  const d = a.details
  if (isHeirloom(a)) {
    // Heirlooms slowly gain value the longer they stay in the family.
    a.condition = Math.max(0, a.condition - randInt(g, 0, 1))
    d.baseValue = Math.max(1, Math.round(num(d.baseValue, a.value) * (1 + bell(g, -10, 40) / 1000)))
    a.value = heirloomValue(num(d.baseValue), a.condition)
    return
  }
  switch (a.kind) {
    case 'house': {
      const mv = marketValue(a) * (1 + market + bell(g, -30, 30) / 1000)
      a.details.marketValue = Math.round(mv)
      const decay = randInt(g, 0, 3) + (a.rentedOutFor ? randInt(g, 0, 3) : 0) + (g.year - num(d.built, g.year) > 60 ? 1 : 0)
      a.condition = Math.max(0, a.condition - decay)
      if (haunted(a) > 0 && chance(g, 0.3)) a.details.haunted = Math.min(100, haunted(a) + randInt(g, 1, 6))
      refreshHouseValue(a)
      return
    }
    case 'car': {
      const age = Math.max(0, g.year - num(d.modelYear, g.year))
      const type = str(d.carType)
      const classic = type === 'classic' || (age >= 25 && (type === 'luxury' || type === 'sports' || type === 'supercar'))
      const change = classic ? bell(g, 0, 90) / 1000 : -(age <= 1 ? bell(g, 150, 220) : age <= 4 ? bell(g, 100, 160) : age <= 10 ? bell(g, 70, 120) : bell(g, 30, 80)) / 1000
      a.condition = Math.max(0, a.condition - randInt(g, 2, 6))
      d.mileage = num(d.mileage) + randInt(g, 6_000, 15_000)
      // Running costs follow wherever the car lives now (fuel prices, mechanics).
      if (Object.prototype.hasOwnProperty.call(CAR_UPKEEP, type)) a.upkeep = carUpkeep(g, type as CarType)
      a.value = Math.max(200, Math.round(a.value * (1 + change) * (a.condition < 30 ? 0.92 : 1)))
      return
    }
    case 'boat':
      a.condition = Math.max(0, a.condition - randInt(g, 2, 5))
      a.value = Math.max(100, Math.round(a.value * (1 - bell(g, 60, 110) / 1000)))
      return
    case 'aircraft':
      a.condition = Math.max(0, a.condition - randInt(g, 2, 4))
      a.value = Math.max(500, Math.round(a.value * (1 - bell(g, 50, 90) / 1000)))
      return
    case 'jewelry':
      a.condition = Math.max(0, a.condition - randInt(g, 0, 1))
      a.value = Math.max(5, Math.round(a.value * (1 + (d.fake === true ? -bell(g, 30, 80) : bell(g, -30, 15)) / 1000)))
      return
    case 'instrument':
      a.condition = Math.max(0, a.condition - randInt(g, 0, 2))
      a.value = Math.max(3, Math.round(a.value * (1 - bell(g, 10, 60) / 1000)))
      return
    case 'collectible': {
      a.condition = Math.max(0, a.condition - randInt(g, 0, 1))
      let change = str(d.category) === 'art' ? bell(g, -150, 220) / 1000 : bell(g, -100, 150) / 1000
      if (str(d.category) === 'art' && chance(g, 0.02)) change = 1.5 // the artist got famous
      a.value = Math.max(10, Math.round(a.value * (1 + change)))
      return
    }
    case 'other': {
      const cat = str(d.category)
      if (cat === 'electronics') {
        a.condition = Math.max(0, a.condition - randInt(g, 5, 14))
        a.value = Math.max(5, Math.round(a.value * (1 - bell(g, 280, 420) / 1000)))
      } else if (cat === 'luxury') {
        const sub = str(d.luxury)
        const change = sub === 'watch' ? bell(g, -30, 50) : sub === 'handbag' ? -bell(g, 20, 80) : sub === 'sneakers' ? bell(g, -100, 80) : -bell(g, 150, 300)
        a.condition = Math.max(0, a.condition - randInt(g, 1, 4))
        a.value = Math.max(5, Math.round(a.value * (1 + change / 1000)))
      }
      return
    }
    default:
      return
  }
}

/** Sell an asset outright (no choice) — used for minors who can't afford upkeep. */
function auction(g: GameState, a: Asset, reason: string): void {
  const price = nicePrice(a.value * 0.9)
  const owed = amountOwed(g, a)
  const wasHome = isHome(g, a)
  removeAsset(g, a)
  addMoney(g, price - owed, a.kind === 'house' ? 'property.sell' : 'asset.sell') // one booking: net of the payoff
  let text = `${reason} Your ${a.name.toLowerCase()} was auctioned off for ${formatMoney(price)}${owed > 0 ? `, and ${formatMoney(owed)} of that went to pay off what was owed` : ''}.`
  if (wasHome) text += ` ${relocateAfterLosingHome(g, a.id)}`
  notice(g, 'Auctioned', text, { emoji: '🔨' })
  log(g, `My ${a.name.toLowerCase()} was auctioned off.`)
}

function payMortgage(g: GameState, a: Asset): number {
  const m = a.mortgage
  if (!m) return 0
  const c = g.character
  const interest = Math.round(m.balance * m.rate)
  const due = Math.min(m.yearlyPayment, m.balance + interest)
  if (c.money >= due) {
    addMoney(g, -due, 'loan.repay')
    m.balance = Math.max(0, Math.round(m.balance + interest - due))
    m.yearsLeft = Math.max(0, m.yearsLeft - 1)
    a.details.missedPayments = 0
    if (m.balance <= 0) {
      delete a.mortgage
      addStat(g, 'happiness', 8)
      log(g, `I paid off the mortgage on my ${a.name.toLowerCase()}!`, 'good')
      remember(g, `Paid off the mortgage on my ${a.name.toLowerCase()}.`)
      notice(g, 'Mortgage Paid Off!', `You made the final payment on your ${a.name.toLowerCase()}. You own it outright! ${employerRef(m.lender, 'Your lender')} sent you a form letter of congratulations and nothing else.`, { emoji: '🎉', tone: 'good' })
    } else if (m.yearsLeft <= 0) {
      // Missed payments earlier left a balance at the end of the term: refinance it over 3 years.
      m.yearsLeft = 3
      m.yearlyPayment = annualPayment(m.balance, m.rate, 3)
    }
    return due
  }
  // Missed payment: interest and a late fee pile on.
  const fee = Math.round(due * 0.05)
  m.balance = Math.round(m.balance + interest + fee)
  const missed = num(a.details.missedPayments) + 1
  a.details.missedPayments = missed
  recordMissedPayment(g)
  if (missed >= 2) {
    foreclose(g, a)
    return 0
  }
  notice(g, 'Missed Mortgage Payment', `You couldn't make the ${formatMoney(due)} mortgage payment on your ${a.name.toLowerCase()}. ${employerRef(m.lender, 'Your lender')} added a ${formatMoney(fee)} late fee and a very stern letter. Miss another one and they'll foreclose.`, { emoji: '🏦', tone: 'bad' })
  log(g, `I missed a mortgage payment on my ${a.name.toLowerCase()}.`, 'bad')
  return 0
}

function foreclose(g: GameState, a: Asset): void {
  const m = a.mortgage
  const lender = employerRef(m?.lender ?? 'The bank', 'The bank')
  const sale = nicePrice(a.value * 0.75)
  const owed = m?.balance ?? 0
  const leftover = Math.max(0, sale - owed)
  const shortfall = Math.max(0, owed - sale)
  g.flags.creditDefaults = (typeof g.flags.creditDefaults === 'number' ? g.flags.creditDefaults : 0) + 1
  if (shortfall > 0) {
    const deficiency = addLoan(g, { kind: 'personal', lender: m?.lender ?? 'The bank', principal: shortfall, rate: m?.rate ?? .08, years: 5, noMint: true })
    if (typeof a.details.countryId === 'string') deficiency.countryId = a.details.countryId
  }
  const wasHome = isHome(g, a)
  g.assets = g.assets.filter((x) => x.id !== a.id)
  if (leftover > 0) addMoney(g, leftover, 'property.sell')
  let text = `${lender} foreclosed on your ${a.name.toLowerCase()} after you missed two payments in a row. It sold at auction for ${formatMoney(sale)}${leftover > 0 ? ` and you got the ${formatMoney(leftover)} left after the loan was repaid` : ''}.`
  if (shortfall > 0) text += ` The auction did not cover your debt. You still owe ${formatMoney(shortfall)}, restructured as a five-year loan.`
  if (wasHome) text += ` ${relocateAfterLosingHome(g, a.id)}`
  notice(g, 'Foreclosure', text, { emoji: '🏚️', tone: 'bad' })
  log(g, `The bank foreclosed on my ${a.name.toLowerCase()}.`, 'bad')
  addStat(g, 'happiness', -15)
  remember(g, `Lost my ${a.name.toLowerCase()} to foreclosure.`)
}

function collectRent(g: GameState): number {
  return yearlyLandlord(g)
}

function randomAssetEvent(g: GameState): void {
  const c = g.character
  // Branded pieces have their own yearly damage, theft/loss and claim rules. In particular,
  // their luxIns policy is not the generic `insured` policy, so sending one through these
  // paths would give it a second loss roll with the wrong coverage and payout semantics.
  const generic = g.assets.filter((a) => a.details.lux !== 1)
  const houses = generic.filter((a) => a.kind === 'house' && a.details.commercial !== true && !a.rentedOutFor)
  const cars = generic.filter((a) => a.kind === 'car')
  const craft = generic.filter((a) => a.kind === 'boat' || a.kind === 'aircraft')
  const small = generic.filter((a) => a.kind === 'jewelry' || (a.kind === 'other' && str(a.details.category) !== '') || a.kind === 'collectible')
  const options: string[] = []
  if (houses.length) options.push('pipe', 'termites', 'burglary', 'fire')
  if (houses.some((h) => haunted(h) > 0)) options.push('ghost', 'ghost')
  if (cars.length) options.push('fender', 'stolen', 'breakdown', 'breakdown')
  if (craft.length) options.push('engine')
  if (small.some((a) => a.kind === 'jewelry')) options.push('lostJewel')
  if (options.length === 0) return
  const ev = pick(g, options)
  const m = goodsMult(g)
  switch (ev) {
    case 'pipe':
    case 'termites': {
      const h = pick(g, houses)
      const cost = nicePrice(Math.max(1_000 * m, h.value * (ev === 'pipe' ? 0.012 : 0.02)))
      if (isInsured(h) && ev === 'pipe') {
        const ded = Math.min(nicePrice(500 * m), cost)
        addMoney(g, -Math.min(ded, Math.max(0, c.money)), 'purchase')
        notice(g, 'Burst Pipe', `A pipe burst at your ${h.name.toLowerCase()} and flooded the kitchen. Insurance covered the ${formatMoney(cost)} repair, minus your ${formatMoney(ded)} deductible.`, { emoji: '💧' })
      } else if (c.money >= cost) {
        addMoney(g, -cost, 'purchase')
        notice(g, ev === 'pipe' ? 'Burst Pipe' : 'Termites!', ev === 'pipe' ? `A pipe burst at your ${h.name.toLowerCase()} and flooded the kitchen. The plumber charged ${formatMoney(cost)} and said "whoever installed this should be in prison."` : `Termites were eating your ${h.name.toLowerCase()}. Fumigation and repairs cost ${formatMoney(cost)}.`, { emoji: ev === 'pipe' ? '💧' : '🐜', tone: 'bad' })
      } else {
        h.condition = Math.max(0, h.condition - randInt(g, 10, 20))
        refreshHouseValue(h)
        notice(g, ev === 'pipe' ? 'Burst Pipe' : 'Termites!', `${ev === 'pipe' ? 'A pipe burst' : 'Termites moved in'} at your ${h.name.toLowerCase()}, and you couldn't afford the ${formatMoney(cost)} repair. The place is falling apart a little faster now.`, { emoji: ev === 'pipe' ? '💧' : '🐜', tone: 'bad' })
      }
      log(g, ev === 'pipe' ? `A pipe burst in my ${h.name.toLowerCase()}.` : `Termites invaded my ${h.name.toLowerCase()}.`, 'bad')
      return
    }
    case 'fire': {
      if (!chance(g, 0.25)) return
      const h = pick(g, houses)
      if (isInsured(h)) {
        notice(g, 'House Fire', `A fire tore through your ${h.name.toLowerCase()}. Thankfully you were insured, and the insurance company paid to rebuild it.`, { emoji: '🔥' })
        addStat(g, 'happiness', -6)
      } else {
        h.condition = Math.max(0, h.condition - randInt(g, 40, 70))
        refreshHouseValue(h)
        addStat(g, 'happiness', -15)
        notice(g, 'House Fire', `A fire tore through your ${h.name.toLowerCase()}. You weren't insured. It's now worth ${formatMoney(h.value)} and smells like a campfire forever.`, { emoji: '🔥', tone: 'bad' })
      }
      log(g, `My ${h.name.toLowerCase()} caught fire.`, 'bad')
      remember(g, `My ${h.name.toLowerCase()} caught fire.`)
      return
    }
    case 'burglary': {
      const h = pick(g, houses)
      const loot = small.filter((x) => x.kind === 'jewelry' || str(x.details.category) === 'electronics' || str(x.details.category) === 'luxury')
      if (loot.length === 0) {
        notice(g, 'Break-In', `Someone broke into your ${h.name.toLowerCase()}, looked around, and left without taking anything. Rude, honestly.`, { emoji: '🦹' })
        log(g, 'Burglars broke into my house but found nothing worth taking.')
        return
      }
      const item = pick(g, loot)
      g.assets = g.assets.filter((x) => x.id !== item.id)
      if (isInsured(h) || isInsured(item)) {
        const payout = nicePrice(item.value * 0.9)
        addMoney(g, payout, 'claim')
        notice(g, 'Burglary', `Burglars broke into your ${h.name.toLowerCase()} and stole your ${item.name.toLowerCase()}. Insurance reimbursed you ${formatMoney(payout)}.`, { emoji: '🦹', tone: 'bad' })
      } else {
        addStat(g, 'happiness', -6)
        notice(g, 'Burglary', `Burglars broke into your ${h.name.toLowerCase()} and stole your ${item.name.toLowerCase()}. You weren't insured. The police said they'd "keep an eye out."`, { emoji: '🦹', tone: 'bad' })
      }
      log(g, `Burglars stole my ${item.name.toLowerCase()}.`, 'bad')
      return
    }
    case 'ghost': {
      const h = pick(g, houses.filter((x) => haunted(x) > 0))
      addStat(g, 'happiness', -randInt(g, 3, 8))
      notice(g, 'Spooky', pickSite(g, [`You heard chains rattling in the attic of your ${h.name.toLowerCase()} at 3 AM.`, `Every cabinet in your ${h.name.toLowerCase()} opened at once while you were making toast.`, `A voice in the walls of your ${h.name.toLowerCase()} whispered your full name. Including your middle name.`, `You found tiny handprints on the inside of the windows of your ${h.name.toLowerCase()}. You don't have kids.`], 0xd6983ab9), { emoji: '👻', tone: 'bad' })
      log(g, `Something haunted my ${h.name.toLowerCase()}.`, 'event')
      return
    }
    case 'fender': {
      const car = pick(g, cars)
      const cost = nicePrice(randInt(g, 800, 4_000) * m)
      car.condition = Math.max(0, car.condition - randInt(g, 5, 15))
      if (isInsured(car)) {
        const ded = Math.min(nicePrice(500 * m), cost)
        addMoney(g, -Math.min(ded, Math.max(0, c.money)), 'purchase')
        notice(g, 'Fender Bender', `Someone backed into your ${car.name} in a parking lot. Insurance covered it after your ${formatMoney(ded)} deductible.`, { emoji: '💥' })
      } else {
        const paid = Math.min(cost, Math.max(0, c.money))
        addMoney(g, -paid, 'purchase')
        notice(g, 'Fender Bender', paid >= cost ? `You rear-ended someone at a red light in your ${car.name}. Without insurance, the ${formatMoney(cost)} repair came out of your pocket.` : `You rear-ended someone in your ${car.name}. Without insurance you could only pay ${formatMoney(paid)} of the ${formatMoney(cost)} repair, so the dent stays.`, { emoji: '💥', tone: 'bad' })
      }
      log(g, `I got into a fender bender in my ${car.name}.`, 'bad')
      return
    }
    case 'stolen': {
      if (!chance(g, 0.35)) return
      const car = pick(g, cars)
      g.assets = g.assets.filter((x) => x.id !== car.id)
      if (isInsured(car)) {
        const payout = nicePrice(car.value * 0.85)
        addMoney(g, payout, 'claim')
        notice(g, 'Car Stolen', `Your ${car.name} was stolen from right outside your place. Insurance paid out ${formatMoney(payout)}.${car.details.loanId ? ' You still owe the rest of the loan, of course.' : ''}`, { emoji: '🚓', tone: 'bad' })
      } else {
        addStat(g, 'happiness', -10)
        notice(g, 'Car Stolen', `Your ${car.name} was stolen overnight. No insurance, no car${car.details.loanId ? ' — but you still have the loan payments' : ''}. The cops gave you a case number and a shrug.`, { emoji: '🚓', tone: 'bad' })
      }
      log(g, `Someone stole my ${car.name}.`, 'bad')
      remember(g, `My ${car.name} was stolen.`)
      return
    }
    case 'breakdown': {
      const car = cars.filter((x) => x.condition < 45).sort((a, b) => a.condition - b.condition)[0]
      if (!car) return
      const cost = nicePrice(Math.max(400 * m, Math.min(car.value * 0.5, randInt(g, 700, 3_500) * m)))
      scriptChoice(g, CAR_BREAKDOWN, 'Breakdown', `Your ${car.name} broke down ${pickLine(g, ['on the highway', 'in a drive-thru', 'in the middle of an intersection', 'on the way to work'])}. The mechanic says it'll cost ${formatMoney(cost)} to fix. It's worth about ${formatMoney(car.value)}.`, [
        { id: 'repair', label: `Repair it (${formatMoney(cost)})`, emoji: '🔧' },
        { id: 'scrap', label: 'Scrap it', emoji: '♻️' },
        { id: 'ignore', label: 'Ignore the problem', emoji: '🙈' },
      ], { emoji: '🚗', data: { assetId: car.id, cost } })
      return
    }
    case 'engine': {
      const v = pick(g, craft)
      const cost = nicePrice(Math.max(1_000 * m, v.value * 0.04))
      if (c.money >= cost) {
        addMoney(g, -cost, 'purchase')
        notice(g, 'Engine Trouble', `Your ${v.name.toLowerCase()} needed engine work. The repair bill was ${formatMoney(cost)}. You wept quietly.`, { emoji: '🔧', tone: 'bad' })
      } else {
        v.condition = Math.max(0, v.condition - randInt(g, 15, 30))
        notice(g, 'Engine Trouble', `Your ${v.name.toLowerCase()} needs ${formatMoney(cost)} of engine work you can't afford. It's deteriorating fast.`, { emoji: '🔧', tone: 'bad' })
      }
      log(g, `My ${v.name.toLowerCase()} needed engine repairs.`, 'bad')
      return
    }
    case 'lostJewel': {
      if (!chance(g, 0.4)) return
      const j = pick(g, small.filter((x) => x.kind === 'jewelry'))
      g.assets = g.assets.filter((x) => x.id !== j.id)
      if (isInsured(j)) {
        const payout = nicePrice(j.value * 0.9)
        addMoney(g, payout, 'claim')
        notice(g, 'Lost Jewelry', `You lost your ${j.name.toLowerCase()} ${pickLine(g, ['down a storm drain', 'at the beach', 'somewhere between the gym and home'])}. Insurance paid ${formatMoney(payout)}.`, { emoji: '😩' })
      } else {
        addStat(g, 'happiness', -5)
        notice(g, 'Lost Jewelry', `You lost your ${j.name.toLowerCase()} ${pickLine(g, ['down a storm drain', 'at the beach', 'somewhere between the gym and home'])}. It's gone forever.`, { emoji: '😩', tone: 'bad' })
      }
      log(g, `I lost my ${j.name.toLowerCase()}.`, 'bad')
      return
    }
  }
}

/** Values, condition, upkeep, mortgages, rental income and the odd disaster. Runs after finance. */
export function yearlyAssets(g: GameState): void {
  const c = g.character
  if (!c.alive || g.assets.length === 0) return

  // Housing market: one shared trend per year, plus each property's own luck.
  const market = economyOf(g).housingReturn
  g.flags.housingMarket = market
  const ownsHouse = g.assets.some((a) => a.kind === 'house')
  if (ownsHouse && market <= -0.04) log(g, 'The housing market took a nosedive this year.', 'bad')
  else if (ownsHouse && market >= 0.07) log(g, 'The housing market was booming this year.', 'good')

  for (const a of [...g.assets]) ageAsset(g, a, a.kind === 'house' ? economyOf(g, typeof a.details.countryId === 'string' ? a.details.countryId : c.countryId).housingReturn : market)

  // Gadgets that died of old age.
  for (const a of [...g.assets]) {
    if (a.kind === 'other' && str(a.details.category) === 'electronics' && a.condition <= 0) {
      g.assets = g.assets.filter((x) => x.id !== a.id)
      log(g, `My ${a.name.toLowerCase()} finally died. I threw it out.`)
    }
  }

  // Rent from tenants (taxed at the marginal rate).
  const rent = collectRent(g)
  if (rent > 0) log(g, pickSite(g, [`I collected ${formatMoney(rent)} in rent from my tenants.`, `My tenants paid me ${formatMoney(rent)} in rent.`], 0x2ffdb78c), 'good')

  // Upkeep: property tax, maintenance, insurance, fuel, docking, hangar fees...
  let upkeep = 0
  for (const a of [...g.assets]) {
    const due = Math.max(0, Math.round(a.upkeep + (isInsured(a) ? insurancePremium(g, a) : 0)))
    if (due === 0) continue
    if (c.age < 18 && c.money < due) {
      auction(g, a, `As a minor, you couldn't cover the ${formatMoney(due)} yearly upkeep.`)
      continue
    }
    // Upkeep and insurance are one yearly number: the premium is booked on its own, the rest is upkeep.
    const premium = isInsured(a) ? Math.min(due, Math.max(0, Math.round(insurancePremium(g, a)))) : 0
    if (due - premium > 0) addMoney(g, -(due - premium), 'purchase')
    if (premium > 0) addMoney(g, -premium, 'premium')
    upkeep += due
  }
  if (upkeep >= 100) log(g, pickSite(g, [`I spent ${formatMoney(upkeep)} on upkeep for my things.`, `Property taxes, insurance and maintenance cost me ${formatMoney(upkeep)}.`], 0x3d1ba445))

  // Mortgages.
  let mortgage = 0
  for (const a of [...g.assets]) if (a.mortgage) mortgage += payMortgage(g, a)
  if (mortgage > 0) log(g, `I paid ${formatMoney(mortgage)} toward my mortgage.`)

  // Something occasionally goes wrong.
  if (!c.prison && chance(g, 0.16)) randomAssetEvent(g)

  // Neglected homes: a warning when a place is falling apart.
  for (const a of g.assets) {
    if (a.kind === 'house' && a.condition < 15 && !a.details.warnedCondition) {
      a.details.warnedCondition = true
      notice(g, 'Falling Apart', `Your ${a.name.toLowerCase()} is in terrible shape (${a.condition}% condition). The roof leaks, the floors creak, and a raccoon has filed for squatter's rights. Consider renovating.`, { emoji: '🏚️', tone: 'bad' })
    } else if (a.kind === 'house' && a.condition >= 30 && a.details.warnedCondition) {
      delete a.details.warnedCondition
    }
  }
}
