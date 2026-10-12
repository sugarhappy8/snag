// Product lines without a fixed list: an endless, deterministic stream of ideas per industry
// (the industry's classics, then premium and budget versions, regional editions, bundles,
// spin-offs and next generations), and the running costs that keep a huge range from paying:
// running many lines costs a share of sales that grows faster than the range (complexity:
// packaging, shelf space, stock, support). What a line sells is product-market.ts (its kind's real
// demand, its quality against the rivals' versions). Pure: no RNG, no state changes; names respect
// the era (no apps in 1975) and each kind of product's real first year (product-data.ts).
import type { GameState } from '../types'
import { marketKey } from './competition-core'
import { eraFits } from './era'
import { industryDef } from './industries'
import { demandLevel, PERIOD_CLASSICS } from './product-data'
import type { BizState } from './state'

/** Years a line stays on sale before it is retired automatically (rivals left it far behind long before). */
export const PRODUCT_LIFE = 30

/**
 * Share of net sales that running `n` lines costs a year (SKUs, packaging, shelf fees, stock,
 * support): nearly nothing for a handful, a real bill for dozens, ruinous for hundreds.
 */
export function complexityShare(n: number): number {
  const k = Math.max(0, Math.floor(n))
  return 0.002 * k * (1 + k / 20)
}

/** Yearly cost of the product range at a given net sales figure. */
export function complexityCost(b: Pick<BizState, 'products'>, netRevenue: number): number {
  const v = Math.max(0, netRevenue) * complexityShare(b.products.length)
  return Number.isFinite(v) ? v : 0
}

/** Brand points the range adds to where the brand settles (bounded: a hundred lines isn't ten times one). */
export function rangeBrand(n: number): number {
  return 16 * (1 - Math.exp(-Math.max(0, n) / 7))
}

// ---------------------------------------------------------------------------
// Ideas

export type Style = 'food' | 'goods' | 'service' | 'tech'

const STYLE: Record<string, Style> = {
  foodTruck: 'food',
  restaurant: 'food',
  cafe: 'food',
  bakery: 'food',
  bar: 'food',
  brewery: 'food',
  grocery: 'food',
  fashion: 'goods',
  beauty: 'goods',
  manufacturing: 'goods',
  farm: 'goods',
  ecommerce: 'goods',
  software: 'tech',
  gameStudio: 'tech',
  semiconductor: 'tech',
  aiLab: 'tech',
  robotics: 'tech',
  biotech: 'tech',
  spaceTech: 'tech',
  electricVehicles: 'tech',
  quantum: 'tech',
  cybersecurity: 'tech',
}

export function styleOf(industry: string): Style {
  return STYLE[industry] ?? 'service'
}

const BUNDLE: Record<Style, string> = { food: 'Combo', goods: 'Bundle', service: 'Package', tech: 'Suite' }

interface IdeaCtx {
  style: Style
  /** Lines on sale now (bundles pair them). */
  lines: string[]
  /** Cities the company trades in (regional editions). */
  cities: string[]
  /** Calendar year (marketing words have eras too: nobody sold an 'Eco' anything in 1925). */
  year: number
}

type Template = (x: string, i: number, c: IdeaCtx) => string | null

/** A variant only from the year its marketing word caught on. */
const since = (year: number, make: (x: string) => string): Template => (x, _i, c) => (c.year >= year ? make(x) : null)

/** First-round variants of a classic, in the order they're suggested. */
const VARIANTS: Record<Style, Template[]> = {
  food: [
    (x) => `Premium ${x}`,
    (x, i, c) => (c.cities.length ? `${x}, ${c.cities[i % c.cities.length]} Style` : null),
    (x) => `Seasonal ${x}`,
    (x, i, c) => bundleOf(x, i, c),
    (x) => `${x} Express`,
    (x) => `Family-Size ${x}`,
    since(1975, (x) => `${x} Take-Home Kit`),
    (x) => `Mini ${x}`,
  ],
  goods: [
    (x) => `Premium ${x}`,
    since(1975, (x) => `${x} Lite`),
    (x, i, c) => (c.cities.length ? `${x}: ${c.cities[i % c.cities.length]} Edition` : null),
    (x, i, c) => bundleOf(x, i, c),
    (x) => `Limited-Edition ${x}`,
    since(1990, (x) => `Eco ${x}`),
    (x) => `${x} Accessories`,
    since(1985, (x) => `${x} Pro`),
  ],
  service: [
    (x) => `Premium ${x}`,
    (x) => `${x} Express`,
    (x, i, c) => (c.cities.length ? `${x} in ${c.cities[i % c.cities.length]}` : null),
    (x, i, c) => bundleOf(x, i, c),
    (x) => `${x} for Businesses`,
    (x) => `${x} Plus`,
    (x) => `${x} Academy`,
    (x) => `Budget ${x}`,
  ],
  tech: [
    since(1985, (x) => `${x} Pro`),
    since(1975, (x) => `${x} Lite`),
    (x, i, c) => bundleOf(x, i, c),
    (x, i, c) => (c.cities.length ? `${x}: ${c.cities[i % c.cities.length]} Edition` : null),
    since(1985, (x) => `${x} for Enterprise`),
    (x) => `${x} Toolkit`,
    (x) => `${x} Training Course`,
    since(1995, (x) => `${x} Max`),
  ],
}

/**
 * The year each of the industries' modern classics became something a company would actually
 * sell (roughly, where it caught on first). Before that year the idea isn't offered, on top of
 * the shared anachronism rules (eraFits): no hard seltzer in 1925, no smart home gadget in 1970.
 * Names missing here are timeless (wedding cakes, home renovations, a tire center).
 */
const ERA_FROM: Record<string, number> = {
  '24/7 Access': 1995, 'AI Assistant Feature': 2016, 'API Platform': 2005, 'Agritourism Weekends': 1985, 'Alcohol-Free Lager': 1980,
  'Analytics Dashboard': 2000, 'Athleisure Range': 2010, 'Automotive Chip Line': 1975, 'B2B Lead Generation': 2000, 'Balayage Specials': 2000,
  'Barrel-Aged Stout': 1995, 'Battery Storage': 2010, 'Battle Royale Mode': 2017, 'Birria Tacos': 2015, 'Bottomless Brunch': 1990,
  'Boutique Suites': 1985, 'Breakfast Burrito': 1975, 'Breakfast Sandwiches': 1970, 'Bridal Packages': 1960, 'Bulk Bins': 1970,
  'Buy Now, Pay Later': 2015, 'Canned Six-Packs': 1940, 'Chat Assistant App': 2022, 'Chiplet Platform': 2017, 'Classic Car Restoration': 1960,
  'Clean Beauty Line': 2012, 'Coding Assistant': 2021, 'Coffee Subscription': 2010, 'Cold Brew on Tap': 2012, 'Cold-Chain Freight': 1950,
  'Combination Therapy': 1960, 'Comedy Club Nights': 1970, 'Compliance Toolkit': 2000, 'Conference Center': 1950, 'Cozy Farming Game': 2010,
  'Craft Cocktail Menu': 2005, 'Crisis PR Desk': 1980, 'Cronut Knockoffs': 2013, 'Cross-Border Trucking': 1950, 'Data & Analytics Unit': 2005,
  'Day Spa': 1985, 'Dedicated Launch Package': 1980, 'Detailing Bay': 1970, 'Developer Board': 1975, 'Developer Playground': 2020,
  'Diagnostic Imaging': 1972, 'Direct-to-Restaurant Deals': 1990, 'Drag Brunch': 2005, 'E-Bike Frames': 2005, 'EV Charging Network': 2010,
  'EV Servicing': 2012, 'Eco Packaging': 1990, 'Electric Pickup': 2019, 'Electric Vans': 2012, 'Enterprise Copilot': 2023,
  'Enterprise Tier': 2000, 'Esports Tournament': 2000, 'Executive Health Checks': 1960, 'Express Courier': 1970, 'Farm Harvester Bot': 2015,
  'Festival Catering': 1970, 'Fitness App': 2010, 'Fleet Contracts': 1950, 'Fleet Leasing': 1960, 'Free-Range Eggs': 1975,
  'Gluten-Free Range': 2005, 'Green Building': 1995, 'Green Hydrogen Pilot': 2018, 'Happy Hour': 1960, 'Hard Seltzer': 2016,
  'Hazy IPA': 2012, 'Home Charger Bundle': 2012, 'Home Helper': 2020, 'Home Infusion Service': 1985, 'Hybrid Cloud Plan': 2015,
  'Image Generator': 2022, 'Immersive Art Show': 2017, 'Industrial Robot Arm': 1965, 'Influencer Network': 2012, 'Karaoke Room': 1985,
  'Korean BBQ Bowl': 2008, 'Lash Extensions': 2005, 'Last-Mile Delivery': 2005, 'Launch Livestream Sponsorship': 2010, 'Limited Drop': 2010,
  'Lip Kit Collab': 2015, 'Live-Stream Shopping': 2016, 'Loaded Fries': 1990, 'Long-Range Battery Pack': 2012, 'Low-Power IoT Chip': 2012,
  'Loyalty Card': 1985, 'Loyalty Program': 1981, 'Managed Detection Plan': 2015, 'Marketplace Integrations': 2010, 'Marketplace for Sellers': 2000,
  'Matcha Bar': 2014, 'Medical Devices': 1960, 'Memory Line': 1970, 'Men’s Grooming Bar': 2005, 'Men’s Grooming Kit': 1990,
  'Mobile App': 2009, 'Mobile Mechanics': 1980, 'Mobile Port': 2009, 'Oat Milk Everything': 2018, 'Offshore Wind Farm': 2000,
  'Once-Weekly Version': 1990, 'Online Delivery': 1997, 'Open-World Sequel': 2000, 'Optimization Service': 1990, 'Organic Aisle': 1990,
  'Organic Certification': 1975, 'Patient Support Program': 1990, 'Payload Integration Service': 1980, 'Pediatric Formulation': 1960, 'Personal Training Packages': 1985,
  'Phishing Simulator': 2005, 'Physician Education Tour': 1960, 'Plant-Based Menu': 2010, 'Podcast Live Tour': 2010, 'Polar Orbit Service': 1970,
  'Prefab Homes': 1945, 'Premium Connectivity': 2010, 'Private Label': 1960, 'Quantum Chemistry Toolkit': 2015, 'Quantum Training Course': 2015,
  'Relocation Services': 1960, 'Remastered Classic': 2000, 'Rideshare Missions': 2015, 'Robot-as-a-Service Plan': 2015, 'Rooftop Bar': 1950,
  'Rooftop Solar for Homes': 1980, 'Runway Collection': 1950, 'Same-Day Delivery': 1995, 'Satellite Insurance Bundle': 1985, 'Sauna & Recovery Zone': 2005,
  'Scalp Spa': 2010, 'Seasonal Sour': 2008, 'Seasonal Spiced Latte': 2003, 'Security Suite': 1995, 'Short-Video Studio': 2016,
  'Sidewalk Delivery Bot': 2017, 'Small Business Edition': 1995, 'Smart Home Gadget': 2012, 'Smart Meters': 2005, 'Smartphone SoC': 2007,
  'Sneaker Collab': 1985, 'Solar Panel Mounts': 1980, 'Spin Studio': 1995, 'Story DLC': 2006, 'Streetwear Capsule': 1990,
  'Subscription Boxes': 2010, 'Summer Music Festival': 1955, 'Sunscreen That Isn’t Greasy': 1950, 'Surgical Assist Arm': 1990, 'Sustainable Denim': 2008,
  'Taproom Tours': 1985, 'Tasting Menu': 1980, 'Telehealth': 2000, 'Threat Intelligence Feed': 2005, 'Trivia Night': 1975,
  'University Access Program': 2016, 'Urgent Care Wing': 1975, 'VR Spin-Off': 2016, 'Vegan Burger': 1985, 'Video Production': 1970,
  'Virtual Tours': 1997, 'Vitamin C Serum': 1995, 'Voice Mode': 2023, 'Warehouse Picker': 2012, 'Weekend Brunch': 1950,
}

/**
 * Timeless ideas for each industry, offered when the year leaves fewer than four of its modern
 * classics (a 1925 bakery bakes rye loaves, not cronut knockoffs). Worded to fit any decade.
 */
export const TIMELESS: Record<string, string[]> = {
  foodTruck: ['Daily Lunch Special', 'Fresh Lemonade', 'Fried Fish Supper', 'Hot Sandwiches'],
  restaurant: ['Sunday Roast', 'Soup of the Day', 'Chef’s Special', 'Private Dining Room'],
  cafe: ['Afternoon Tea', 'Pastry Counter', 'House Blend', 'Iced Coffee'],
  bakery: ['Rye Loaf', 'Cream Pies', 'Fruit Tarts', 'Morning Rolls'],
  bar: ['House Punch', 'Darts League', 'Piano Nights', 'Bar Snacks Menu'],
  brewery: ['Pale Ale', 'Porter', 'Bock Beer', 'Bottled Pilsner'],
  grocery: ['Butcher Counter', 'Deli Counter', 'Fresh Produce Stand', 'Home Delivery Rounds'],
  fashion: ['Tailored Suits', 'Evening Gowns', 'Hats & Gloves', 'Workwear Line'],
  beauty: ['Cold Cream', 'Face Powder', 'Lipstick Line', 'Hair Tonic'],
  salon: ['Permanent Waves', 'Manicure Corner', 'Hot Towel Shaves', 'Hair Coloring'],
  gym: ['Weightlifting Room', 'Swimming Lessons', 'Calisthenics Classes', 'Wrestling Club'],
  autoShop: ['Oil Change Special', 'Brake Service', 'Paint & Body Shop', 'Towing Service'],
  construction: ['Family Houses', 'Bridges', 'Schools & Hospitals', 'Factory Buildings'],
  realEstate: ['Starter Homes', 'Apartment Rentals', 'Farmland Sales', 'Holiday Cottages'],
  software: ['Payroll Program', 'Inventory System', 'Custom Programming', 'Scheduling System'],
  gameStudio: ['Arcade Game', 'Sports Game', 'Space Shooter', 'Puzzle Game'],
  ecommerce: ['Gift Shop Section', 'Clearance Outlet', 'Gift Wrapping Service', 'Bestseller Shelf'],
  marketing: ['Billboard Campaigns', 'Newspaper Ads', 'Trade Show Booths', 'Catalog Design'],
  clinic: ['Family Practice', 'Vaccination Clinic', 'Maternity Ward', 'House Calls'],
  hotel: ['Grand Ballroom', 'Honeymoon Suite', 'Hotel Restaurant', 'Tea Room'],
  logistics: ['Parcel Service', 'Moving Vans', 'Rail Freight Contracts', 'Furniture Removals'],
  manufacturing: ['Hand Tools', 'Sewing Machines', 'Bicycle Parts', 'Enamel Cookware'],
  farm: ['Dairy Herd', 'Orchard Fruit', 'Wheat Fields', 'Market Garden'],
  energy: ['Street Lighting', 'Hydro Dam', 'Town Electrification', 'Coal-Fired Plant'],
  entertainment: ['Dance Hall Nights', 'Traveling Circus', 'Brass Band Concerts', 'Magic Show'],
}

/** True when the year has caught up with an idea (ERA_FROM; anything else is timeless). */
function ideaFits(name: string, year: number): boolean {
  const from = ERA_FROM[name]
  return from === undefined || year >= from
}

function bundleOf(x: string, i: number, c: IdeaCtx): string | null {
  const others = c.lines.filter((y) => y !== x && !y.includes(' & ') && y.length <= 28)
  if (!others.length || x.includes(' & ') || x.length > 28) return null
  return `${x} & ${others[i % others.length]} ${BUNDLE[c.style]}`
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']

function roman(k: number): string {
  return ROMAN[k] ?? String(k)
}

/** Next generations, forever: 'Mk III', 'v4.0' (version numbers from the PC era), 'Recipe No. 5'. */
function nextGen(style: Style, x: string, k: number, year: number): string {
  if (style === 'food') return `${x}, Recipe No. ${k}`
  if (style === 'goods') return `${x} Mk ${roman(k)}`
  if (style === 'tech' && year >= 1985) return `${x} ${k}.0`
  return `${x} ${roman(k)}`
}

/**
 * The industry's classic ideas the year allows (no fitness app before smartphones, no hard
 * seltzer in 1925), topped up with timeless ones when the era leaves too few.
 */
export function classicIdeas(g: GameState, b: Pick<BizState, 'industry' | 'countryId'>): string[] {
  const place = marketKey(b)
  // Nobody develops a kind of product before anyone in its market sells one (product-data.ts).
  const fits = (x: string) => ideaFits(x, g.year) && eraFits(g, b.countryId, x) && demandLevel(x, place, g.year).exists
  const modern = industryDef(b.industry).products.filter(fits)
  if (modern.length >= 4) return modern
  const old = [...(TIMELESS[b.industry] ?? []), ...(PERIOD_CLASSICS[b.industry] ?? [])].filter((x) => fits(x) && !modern.includes(x))
  return [...modern, ...old]
}

/**
 * The next `count` product ideas for this company, best-known first: the classics, then a
 * round of variants (premium, budget, regional, bundles, spin-offs), then next generations of
 * every classic without end. Ideas already on sale or in development are skipped; anything the
 * era doesn't have yet is skipped too. Deterministic: the same company gets the same list.
 */
export function productIdeas(g: GameState, b: Pick<BizState, 'industry' | 'countryId' | 'products' | 'outlets'> & { rd?: { name: string }[] }, count = 5): string[] {
  const style = styleOf(b.industry)
  const bases = classicIdeas(g, b)
  if (!bases.length) return []
  const taken = new Set<string>([...b.products.map((p) => p.name), ...(b.rd ?? []).map((p) => p.name)])
  const cities = [...new Set(b.outlets.map((o) => o.city))].slice(0, 6)
  const ctx: IdeaCtx = { style, lines: b.products.map((p) => p.name).slice(-12), cities, year: g.year }
  const out: string[] = []
  const seen = new Set<string>()
  const offer = (name: string | null): boolean => {
    if (!name || taken.has(name) || seen.has(name)) return false
    seen.add(name)
    if (name.length > 60 || !eraFits(g, b.countryId, name)) return false
    out.push(name)
    return out.length >= count
  }
  for (const x of bases) if (offer(x)) return out
  // Variants: walk the (classic, variant) grid diagonally so the list stays varied.
  const variants = VARIANTS[style]
  const B = bases.length
  const T = variants.length
  for (let m = 0; m < B * T; m++) {
    const i = m % B
    const t = (Math.floor(m / B) + i) % T
    if (offer(variants[t](bases[i], Math.floor(m / B), ctx))) return out
  }
  // Next generations of every classic, without end (bounded only by what's already taken).
  const limit = taken.size + count * 4 + B * 4
  for (let n = 0; n < limit; n++) {
    const k = 2 + Math.floor(n / B)
    if (offer(nextGen(style, bases[n % B], k, g.year))) return out
  }
  return out
}
