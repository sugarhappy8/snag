// The investment market engine: a deterministic, per-family simulation of every stock exchange,
// the crypto market, gold and each country's currency, bonds and banks.
//
// Nothing here touches the game state or g.rng. Every number is a pure function of
// (family seed, anchor year, exchange/country, year), so the menus can show prices and history
// without consuming randomness, every holding on an exchange shares that market's health, and
// the same life always replays the same market. Paths are computed year by year from the
// family's anchor year and memoized in a small module-level cache (never stored in the state).
//
// History: for years before PRESENT_YEAR the market follows real history (history/markets.ts):
// each exchange's index makes its country's real (inflation-adjusted) return, sectors follow
// their real stories (tech in 2000-02, banks in 2008, oil in 1973...) with company-specific
// noise on top, gold and the crypto coins follow their real prices, and currencies, bonds and
// banks follow real inflation, defaults and banking crises. Exchanges that were shut or hadn't
// opened yet stand still. Still deterministic and RNG-free; future years stay procedural, and a
// family whose history starts at PRESENT_YEAR or later gets exactly the old procedural market.
import { familyAt } from '../timeMachine'
import { seeded, type SRng } from '../assets'
import { DEEP_TECH_IDS, exchangeFor, marketOf, type Industry, type MarketProfile, type StockExchange } from '../data/markets'
import {
  bankingCrisis,
  exchangeState,
  historicalCoin,
  historicalCryptoReturn,
  historicalDepositInsurance,
  historicalGoldPrice,
  historicalHousing,
  historicalIndexReturn,
  historicalInflation,
  historicalPolicyRate,
  historicalSectorExcess,
  inHistory,
  sovereignDefault,
} from '../history/markets'
import { HISTORY_START, PRESENT_YEAR } from '../history/timeline'
import { COUNTRIES, getCountry } from '../world'
import { eraPennyKind, eraSector, exchangeNameFor, historySector, indexFundSince, indexNameFor, lateEraPennyKind, MODERN_PENNY_SECTOR, MODERN_PENNY_SINCE, TRUST_FEE } from './era'

// ---------------------------------------------------------------------------
// Small math helpers

export function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
}

function clampNum(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
}

/** Roughly standard-normal draw (sum of six uniforms). */
function normal(r: SRng): number {
  let s = 0
  for (let i = 0; i < 6; i++) s += r.next()
  return (s - 3) * Math.SQRT2
}

/** Turn a log return into a simple return, never below -100%. */
function toRet(logRet: number): number {
  return Number.isFinite(logRet) ? Math.exp(Math.max(-12, Math.min(6, logRet))) - 1 : 0
}

// ---------------------------------------------------------------------------
// Exchanges

export interface ExInfo {
  /** Unique key: codes repeat across countries (TSE is Tokyo and Tehran), so code + index. */
  key: string
  ex: StockExchange
  /** The country whose exchange it is (its industries shape the listed companies). */
  home: string
}

export function exchangeKey(ex: StockExchange): string {
  return `${ex.code}:${ex.index}`
}

let registry: Map<string, ExInfo> | null = null

function exchangeRegistry(): Map<string, ExInfo> {
  if (registry) return registry
  const map = new Map<string, ExInfo>()
  for (const c of COUNTRIES) {
    const own = marketOf(c.id).exchange
    if (!own) continue
    const key = exchangeKey(own)
    if (!map.has(key)) map.set(key, { key, ex: own, home: c.id })
  }
  registry = map
  return map
}

/** The exchange a resident of `countryId` trades on (local, or the regional hub). */
export function exchangeInfo(countryId: string): ExInfo {
  const ex = exchangeFor(countryId)
  const key = exchangeKey(ex)
  return exchangeRegistry().get(key) ?? { key, ex, home: marketOf(countryId).exchange ? countryId : 'us' }
}

export function exchangeByKey(key: string): ExInfo | undefined {
  return exchangeRegistry().get(key)
}

/** True when the country trades on its own exchange (not a regional one). */
export function hasOwnExchange(countryId: string): boolean {
  return marketOf(countryId).exchange !== null
}

function exVol(ex: StockExchange): number {
  return clampNum(ex.volatility, 0.05, 0.8)
}

function exDrift(ex: StockExchange): number {
  return clampNum(ex.drift, -0.05, 0.3)
}

// ---------------------------------------------------------------------------
// Market regimes

export type RegimeId = 'crash' | 'bear' | 'correction' | 'dip' | 'flat' | 'steady' | 'strong' | 'bull' | 'boom'

export interface Regime {
  id: RegimeId
  label: string
  emoji: string
}

export function regimeFor(ret: number, crash = false, boom = false): Regime {
  if (crash || ret <= -0.3) return { id: 'crash', label: 'Market crash', emoji: '💥' }
  if (ret <= -0.2) return { id: 'bear', label: 'Bear market', emoji: '🐻' }
  if (ret <= -0.1) return { id: 'correction', label: 'Correction', emoji: '📉' }
  if (ret <= -0.03) return { id: 'dip', label: 'Rough year', emoji: '📉' }
  if (ret < 0.03) return { id: 'flat', label: 'Flat market', emoji: '➖' }
  if (ret < 0.1) return { id: 'steady', label: 'Steady gains', emoji: '📈' }
  if (boom || ret >= 0.3) return { id: 'boom', label: 'Boom', emoji: '🚀' }
  if (ret >= 0.2) return { id: 'bull', label: 'Bull market', emoji: '🐂' }
  return { id: 'strong', label: 'Strong year', emoji: '📈' }
}

// ---------------------------------------------------------------------------
// The world economy: one shared shock per year so markets fall (and rise) together.

const WORLD_CRASH = 0.035
const WORLD_BOOM = 0.03
const LOCAL_CRASH = 0.025
const LOCAL_BOOM = 0.025
const P_CRASH = WORLD_CRASH * 0.85 + (1 - WORLD_CRASH) * LOCAL_CRASH
const P_BOOM = WORLD_BOOM * 0.7 + (1 - WORLD_BOOM) * LOCAL_BOOM

export interface WorldYear {
  z: number
  crash: boolean
  boom: boolean
}

export function worldYear(fam: string, year: number): WorldYear {
  // History: the world economy did what it did (the US market as its barometer).
  if (inHistory(year)) {
    const us = historicalIndexReturn('us', year) ?? 0
    const lr = Math.log(Math.max(0.05, 1 + us))
    return { z: clampNum((lr - 0.065) / 0.17, -3, 3), crash: us <= -0.25, boom: us >= 0.3 }
  }
  return syntheticWorldYear(fam, year)
}

/** The procedural world economy for (family, year), ignoring real history. */
function syntheticWorldYear(fam: string, year: number): WorldYear {
  const r = seeded(`${familyAt(fam, year)}|world|${year}`)
  const z = normal(r)
  const crash = r.next() < WORLD_CRASH
  const boom = !crash && r.next() < WORLD_BOOM
  return { z, crash, boom }
}

export interface IndexMove {
  /** Total log return of the market this year (price + dividends). */
  logRet: number
  /** The index level's change this year (price only), e.g. 0.12 = up 12%. */
  ret: number
  crash: boolean
  boom: boolean
  regime: Regime
}

/** Long-run dividend yield of an exchange's index (lower-growth markets pay more out). */
export function indexYield(info: ExInfo): number {
  const r = seeded(`dy|${info.key}`)
  return clampNum(0.045 - exDrift(info.ex) * 0.25 + r.float(-0.005, 0.005), 0.012, 0.045)
}

/** This year's move of an exchange's index. Depends only on (family, exchange, year). */
export function indexMove(fam: string, info: ExInfo, year: number): IndexMove {
  if (inHistory(year)) return historicalIndexMove(info, year)
  return syntheticIndexMove(fam, info, year)
}

/**
 * The procedural index move for (family, exchange, year), ignoring real history: the future's
 * market, and the distribution option pricing samples from (any year gives a fresh draw).
 */
export function syntheticIndexMove(fam: string, info: ExInfo, year: number): IndexMove {
  const vol = exVol(info.ex)
  const drift = exDrift(info.ex)
  const w = syntheticWorldYear(fam, year)
  const r = seeded(`${familyAt(fam, year)}|ix|${info.key}|${year}`)
  const zl = normal(r)
  const uc = r.next()
  const ub = r.next()
  const sev = r.next()
  const crash = w.crash ? uc < 0.85 : uc < LOCAL_CRASH
  const boom = !crash && (w.boom ? ub < 0.7 : ub < LOCAL_BOOM)
  const depth = Math.min(0.75, 0.12 + vol * 1.1)
  const size = 0.15 + vol * 1.2
  // Normal years drift a little higher so the long-run median growth matches the exchange's drift.
  const mu = (Math.log(1 + drift) - P_CRASH * Math.log(1 - depth) - P_BOOM * Math.log(1 + size)) / (1 - P_CRASH - P_BOOM)
  let logRet: number
  if (crash) logRet = Math.log(1 - Math.min(0.9, depth * (0.7 + 0.6 * sev)))
  else if (boom) logRet = Math.log(1 + size * (0.7 + 0.6 * sev))
  else logRet = mu + vol * 0.85 * (0.5 * w.z + 0.866 * zl)
  const ret = toRet(logRet - Math.log(1 + indexYield(info)))
  return { logRet, ret, crash, boom, regime: regimeFor(ret, crash, boom) }
}

/** A historical year: the home country's real return (flat while the exchange didn't exist). */
function historicalIndexMove(info: ExInfo, year: number): IndexMove {
  const dy = Math.log(1 + indexYield(info))
  if (exchangeState(info.home, year).status === 'none') {
    return { logRet: dy, ret: 0, crash: false, boom: false, regime: regimeFor(0) }
  }
  const real = historicalIndexReturn(info.home, year) ?? 0
  const logRet = Math.log(Math.max(0.03, 1 + real))
  const crash = real <= -0.25
  const boom = real >= 0.3
  const ret = toRet(logRet - dy)
  return { logRet, ret, crash, boom, regime: regimeFor(ret, crash, boom) }
}

/** A typical real (log) market year in history: betas amplify moves around it. */
const HIST_MEAN_LOG = 0.05

/** True for years the engine follows real history (before PRESENT_YEAR). */
export function isHistoryYear(year: number): boolean {
  return inHistory(year)
}

/** The exchange's trading status in `year`: 'open', 'closed' (war, occupation) or 'none'. */
export function exchangeStatus(info: ExInfo, year: number): 'open' | 'closed' | 'none' {
  return exchangeState(info.home, year).status
}

/** True when a revolution nationalized every company listed on this exchange in `year`. */
export function exchangeExpropriated(info: ExInfo, year: number): boolean {
  return exchangeState(info.home, year).expropriated
}

/** The headline index's name in `year` (the Dow before 1957, the FT 30 before 1984...). */
export function indexName(info: ExInfo, year: number): string {
  return indexNameFor(info.home, year, info.ex.index)
}

/** The exchange's name in `year` (the Paris Bourse before Euronext...). */
export function exchangeName(info: ExInfo, year: number): string {
  return exchangeNameFor(info.home, year, info.ex.name)
}

/**
 * The local index fund as it was sold in `year`: before index funds existed (1976 in the US), the
 * closest thing was a managed investment trust, which is what the fund slot is called then.
 */
export function fundName(info: ExInfo, year: number): { name: string; trust: boolean } {
  if (inHistory(year) && year < indexFundSince(info.home)) return { name: `${localWords(info.home)[0]} Investment Trust`, trust: true }
  return { name: `${indexName(info, year)} Index Fund`, trust: false }
}

// ---------------------------------------------------------------------------
// Sectors and listed companies

export type SectorId =
  | 'banks' | 'insurance' | 'telecom' | 'utilities' | 'oil' | 'mining' | 'automakers' | 'electronics'
  | 'industrials' | 'tech' | 'games' | 'ecommerce' | 'media' | 'entertainment' | 'pharma' | 'hotels'
  | 'airlines' | 'shipping' | 'agri' | 'construction' | 'property' | 'supermarkets' | 'food'
  | 'brewers' | 'fashion' | 'cosmetics' | 'leisure'
  // Deep tech: listed only on the exchanges of the countries that are hubs for them.
  | 'semis' | 'ai' | 'robotics' | 'biotech' | 'space' | 'ev' | 'quantum' | 'cyber'

export interface SectorDef {
  id: SectorId
  label: string
  emoji: string
  /** Name patterns: {w} is a local word. */
  names: string[]
  beta: number
  idio: number
  dy: [number, number]
  drivers: Industry[]
  base: number
  blurbs: string[]
}

export const SECTORS: Record<SectorId, SectorDef> = {
  banks: { id: 'banks', label: 'Banking', emoji: '🏦', names: ['{w} Bank', 'Bank of {w}', '{w} Financial Group', '{w} Trust Bank'], beta: 1.1, idio: 0.16, dy: [0.035, 0.06], drivers: [], base: 1, blurbs: ['Lends your savings to people buying houses they can barely afford.', 'Has a branch on every corner and an app that logs you out every 90 seconds.', 'Too big to fail, or so it keeps telling regulators.'] },
  insurance: { id: 'insurance', label: 'Insurance', emoji: '☂️', names: ['{w} Insurance', '{w} Assurance', '{w} Life'], beta: 0.9, idio: 0.14, dy: [0.03, 0.05], drivers: [], base: 0.6, blurbs: ['Collects premiums for decades, then finds the clause that says "not that".', 'Insures everything from cars to celebrity legs.'] },
  telecom: { id: 'telecom', label: 'Telecom', emoji: '📡', names: ['{w} Telecom', '{w} Mobile', '{w} Networks'], beta: 0.6, idio: 0.12, dy: [0.04, 0.065], drivers: [], base: 0.7, blurbs: ['Everyone hates their phone bill, and everyone pays it.', 'Owns the cell towers, the fiber and your patience on hold.'] },
  utilities: { id: 'utilities', label: 'Utilities', emoji: '⚡', names: ['{w} Power', '{w} Electric Power', '{w} Utilities'], beta: 0.5, idio: 0.1, dy: [0.04, 0.06], drivers: ['energy'], base: 0.5, blurbs: ['Keeps the lights on. Boring, steady and it pays you to wait.', 'A regulated monopoly: the stock market equivalent of a cardigan.'] },
  oil: { id: 'oil', label: 'Oil & Gas', emoji: '🛢️', names: ['{w} Petroleum', '{w} Oil', '{w} Energy', '{w} Gas'], beta: 1.0, idio: 0.24, dy: [0.04, 0.07], drivers: ['energy'], base: 0.6, blurbs: ['Pumps oil, prints money, and runs ads about wind turbines.', 'Its profits rise and fall with the price of a barrel.'] },
  mining: { id: 'mining', label: 'Mining', emoji: '⛏️', names: ['{w} Mining', '{w} Minerals', '{w} Resources', '{w} Metals'], beta: 1.3, idio: 0.3, dy: [0.03, 0.06], drivers: ['energy'], base: 0.5, blurbs: ['Digs up copper, iron ore and the occasional legal dispute.', 'When the world builds things, it buys what this company digs up.'] },
  automakers: { id: 'automakers', label: 'Automakers', emoji: '🚗', names: ['{w} Motors', '{w} Automotive', '{w} Auto Group'], beta: 1.2, idio: 0.22, dy: [0.02, 0.04], drivers: ['manufacturing', 'autoShop'], base: 0.7, blurbs: ['Builds sensible cars and one unreasonably fast one for the brochure.', 'Betting the company on electric cars, one recall at a time.'] },
  electronics: { id: 'electronics', label: 'Electronics', emoji: '🔌', names: ['{w} Electronics', '{w} Semiconductor', '{w} Devices'], beta: 1.3, idio: 0.28, dy: [0.01, 0.025], drivers: ['manufacturing', 'software'], base: 0.6, blurbs: ['Makes the chips inside the gadgets inside the gadgets.', 'Its TVs keep getting thinner and its margins thinner still.'] },
  industrials: { id: 'industrials', label: 'Industrials', emoji: '🏭', names: ['{w} Heavy Industries', '{w} Steel', '{w} Machinery', '{w} Industries'], beta: 1.2, idio: 0.22, dy: [0.02, 0.04], drivers: ['manufacturing', 'construction'], base: 0.6, blurbs: ['Makes the machines that make the machines.', 'Steel, turbines, ships: if it is heavy, they sell it.'] },
  tech: { id: 'tech', label: 'Technology', emoji: '💻', names: ['{w} Systems', '{w} Software', '{w} Digital', '{w} Tech'], beta: 1.4, idio: 0.32, dy: [0, 0.01], drivers: ['software', 'ecommerce'], base: 0.7, blurbs: ['Sells software by subscription, including the button that cancels it.', 'Promises AI in everything, including the toaster.'] },
  games: { id: 'games', label: 'Video Games', emoji: '🎮', names: ['{w} Interactive', '{w} Games', '{w} Entertainment Software'], beta: 1.3, idio: 0.38, dy: [0, 0.015], drivers: ['gameStudio'], base: 0.4, blurbs: ['One hit franchise, eleven sequels and a gacha machine.', 'Its next game is delayed, which is somehow good news.'] },
  ecommerce: { id: 'ecommerce', label: 'E-commerce', emoji: '📦', names: ['{w} Online', '{w} Marketplace', '{w} Commerce'], beta: 1.5, idio: 0.38, dy: [0, 0.005], drivers: ['ecommerce'], base: 0.5, blurbs: ['Ships anything to your door, usually before you remember ordering it.', 'Loses money on every order and makes it up in volume, investors hope.'] },
  media: { id: 'media', label: 'Media & Advertising', emoji: '📺', names: ['{w} Media', '{w} Broadcasting', '{w} Communications'], beta: 1.0, idio: 0.24, dy: [0.02, 0.045], drivers: ['marketing', 'entertainment'], base: 0.5, blurbs: ['Owns TV channels, billboards and an awkward streaming service.', 'Sells your attention to whoever bids highest.'] },
  entertainment: { id: 'entertainment', label: 'Entertainment', emoji: '🎬', names: ['{w} Pictures', '{w} Studios', '{w} Entertainment'], beta: 1.1, idio: 0.3, dy: [0, 0.02], drivers: ['entertainment'], base: 0.4, blurbs: ['Movies, music and theme parks with very long lines.', 'Rebooting your childhood, one franchise at a time.'] },
  pharma: { id: 'pharma', label: 'Pharmaceuticals', emoji: '💊', names: ['{w} Pharmaceutical', '{w} Pharma', '{w} Biotech', '{w} Life Sciences'], beta: 0.7, idio: 0.24, dy: [0.015, 0.035], drivers: ['clinic'], base: 0.6, blurbs: ['One blockbuster drug, one patent cliff and a lot of lawyers.', 'Its share price lives and dies by clinical trial results.'] },
  hotels: { id: 'hotels', label: 'Hotels & Travel', emoji: '🏨', names: ['{w} Hotels', '{w} Resorts', '{w} Travel'], beta: 1.3, idio: 0.25, dy: [0.01, 0.03], drivers: ['hotel'], base: 0.5, blurbs: ['Resorts, cruise packages and a resort fee for the resort fee.', 'Does great until a pandemic, a volcano or a strike says otherwise.'] },
  airlines: { id: 'airlines', label: 'Airlines', emoji: '✈️', names: ['{w} Airways', '{w} Air', '{w} Airlines'], beta: 1.5, idio: 0.33, dy: [0, 0.02], drivers: ['hotel', 'logistics'], base: 0.35, blurbs: ['A famously great way to turn a big fortune into a small one.', 'Charges extra for legroom, bags and breathing.'] },
  shipping: { id: 'shipping', label: 'Shipping & Logistics', emoji: '🚢', names: ['{w} Shipping', '{w} Logistics', '{w} Freight', '{w} Ports'], beta: 1.2, idio: 0.3, dy: [0.03, 0.065], drivers: ['logistics'], base: 0.5, blurbs: ['Moves containers around the world and charges whatever the market bears.', 'One stuck ship in a canal and its profits triple.'] },
  agri: { id: 'agri', label: 'Agribusiness', emoji: '🌾', names: ['{w} Agro', '{w} Farms', '{w} Agricultural'], beta: 0.7, idio: 0.2, dy: [0.02, 0.04], drivers: ['farm'], base: 0.5, blurbs: ['Grows, buys and ships a meaningful share of everyone\'s breakfast.', 'Prays for rain, hedges for drought.'] },
  construction: { id: 'construction', label: 'Construction', emoji: '🏗️', names: ['{w} Construction', '{w} Cement', '{w} Engineering', '{w} Builders'], beta: 1.2, idio: 0.25, dy: [0.02, 0.04], drivers: ['construction'], base: 0.5, blurbs: ['Builds bridges, towers and cost overruns.', 'If the government is spending, this company is pouring concrete.'] },
  property: { id: 'property', label: 'Property', emoji: '🏙️', names: ['{w} Land', '{w} Properties', '{w} Estates', '{w} Developments'], beta: 1.1, idio: 0.25, dy: [0.03, 0.05], drivers: ['realEstate'], base: 0.5, blurbs: ['Builds luxury apartments named after trees it cut down.', 'Owns half the skyline and most of the parking lots.'] },
  supermarkets: { id: 'supermarkets', label: 'Supermarkets', emoji: '🛒', names: ['{w} Mart', '{w} Supermarkets', '{w} Retail'], beta: 0.5, idio: 0.12, dy: [0.025, 0.04], drivers: ['grocery'], base: 0.6, blurbs: ['People need groceries in good times and bad, which is the whole pitch.', 'Thin margins, huge volumes and a self-checkout that hates you.'] },
  food: { id: 'food', label: 'Food & Beverage', emoji: '🍜', names: ['{w} Foods', '{w} Beverages', '{w} Food Group'], beta: 0.6, idio: 0.14, dy: [0.025, 0.04], drivers: ['restaurant', 'cafe', 'bakery', 'foodTruck'], base: 0.6, blurbs: ['Snacks, sodas and instant noodles: recession-proof comfort food.', 'Owns forty brands you think are competitors.'] },
  brewers: { id: 'brewers', label: 'Brewers & Distillers', emoji: '🍺', names: ['{w} Breweries', '{w} Brewing', '{w} Distillers'], beta: 0.7, idio: 0.15, dy: [0.025, 0.04], drivers: ['brewery', 'bar'], base: 0.4, blurbs: ['People drink when times are good and when times are bad.', 'Brews the beer at every barbecue in the country.'] },
  fashion: { id: 'fashion', label: 'Fashion', emoji: '👗', names: ['{w} Fashion', '{w} Apparel', '{w} Textiles'], beta: 1.2, idio: 0.3, dy: [0.01, 0.03], drivers: ['fashion'], base: 0.5, blurbs: ['Twelve collections a year and a warehouse full of last season.', 'Its logo is worth more than its factories.'] },
  cosmetics: { id: 'cosmetics', label: 'Cosmetics', emoji: '💄', names: ['{w} Cosmetics', '{w} Beauty'], beta: 0.9, idio: 0.22, dy: [0.01, 0.025], drivers: ['beauty', 'salon'], base: 0.4, blurbs: ['Ten-step skincare routines, sold one step at a time.', 'Influencers are its sales team and they work for free samples.'] },
  leisure: { id: 'leisure', label: 'Sports & Leisure', emoji: '🏋️', names: ['{w} Leisure', '{w} Sports', '{w} Fitness'], beta: 1.0, idio: 0.25, dy: [0.01, 0.03], drivers: ['gym'], base: 0.4, blurbs: ['Gyms, sneakers and the January sign-up rush.', 'Sells the dream of getting in shape, monthly.'] },
  semis: { id: 'semis', label: 'Semiconductors', emoji: '💾', names: ['{w} Semiconductor', '{w} Silicon', '{w} Microelectronics', '{w} Foundry'], beta: 1.5, idio: 0.34, dy: [0, 0.015], drivers: ['semiconductor'], base: 0.4, blurbs: ['Every gadget on Earth needs its chips; every chip cycle wrecks its share price.', 'Builds a new fab every year and a new excuse every downturn.'] },
  ai: { id: 'ai', label: 'Artificial Intelligence', emoji: '🤖', names: ['{w} AI', '{w} Intelligence', '{w} Neural'], beta: 1.7, idio: 0.45, dy: [0, 0.005], drivers: ['aiLab'], base: 0.3, blurbs: ['Trains ever-bigger models; its valuation trains ever-bigger expectations.', 'Promises machines that think. Delivers machines that write emails, profitably.'] },
  robotics: { id: 'robotics', label: 'Robotics', emoji: '🦾', names: ['{w} Robotics', '{w} Automation', '{w} Dynamics'], beta: 1.4, idio: 0.38, dy: [0, 0.01], drivers: ['robotics'], base: 0.3, blurbs: ['Its robots weld cars, pick parcels and, in the marketing videos, dance.', 'Every factory wants its arms; every investor wants its humanoid.'] },
  biotech: { id: 'biotech', label: 'Biotech', emoji: '🧬', names: ['{w} Therapeutics', '{w} Biosciences', '{w} Genomics'], beta: 1.0, idio: 0.45, dy: [0, 0.005], drivers: ['biotech'], base: 0.3, blurbs: ['One trial readout away from doubling, or halving.', 'A pipeline full of molecules with names nobody can pronounce.'] },
  space: { id: 'space', label: 'Space', emoji: '🚀', names: ['{w} Aerospace', '{w} Orbital', '{w} Space Systems'], beta: 1.5, idio: 0.45, dy: [0, 0.005], drivers: ['spaceTech'], base: 0.25, blurbs: ['Launches satellites, government payloads and the occasional fireball.', 'The stock goes up like its rockets: usually.'] },
  ev: { id: 'ev', label: 'Electric Vehicles', emoji: '🚙', names: ['{w} EV', '{w} Electric Motors', '{w} Mobility'], beta: 1.6, idio: 0.42, dy: [0, 0.005], drivers: ['electricVehicles'], base: 0.3, blurbs: ['Sells the future of driving, plus a lot of recalls.', 'Its delivery numbers move the stock more than its profits do.'] },
  quantum: { id: 'quantum', label: 'Quantum Computing', emoji: '⚛️', names: ['{w} Quantum', '{w} Qubit Systems'], beta: 1.8, idio: 0.6, dy: [0, 0], drivers: ['quantum'], base: 0.2, blurbs: ['Nobody fully understands what it sells, which is great for the stock.', 'Revenue is tiny; the press releases are enormous.'] },
  cyber: { id: 'cyber', label: 'Cybersecurity', emoji: '🛡️', names: ['{w} Cyber', '{w} Security', '{w} Shield'], beta: 1.2, idio: 0.3, dy: [0, 0.01], drivers: ['cybersecurity'], base: 0.3, blurbs: ['Every data breach in the news is an ad for its products.', 'Sells peace of mind by the subscription seat.'] },
}

/** Deep-tech sectors: listed only as extra slots on hub exchanges (never in the classic plan). */
const DEEP_SECTOR: Partial<Record<Industry, SectorId>> = {
  semiconductor: 'semis', aiLab: 'ai', robotics: 'robotics', biotech: 'biotech', spaceTech: 'space', electricVehicles: 'ev', quantum: 'quantum', cybersecurity: 'cyber',
}
const DEEP_SECTORS = new Set<SectorId>(Object.values(DEEP_SECTOR) as SectorId[])
const DEEP_INDUSTRIES = new Set<string>(DEEP_TECH_IDS)

/** The sectors every exchange draws its classic listings from (stable since before deep tech). */
function classicSectors(): SectorDef[] {
  return Object.values(SECTORS).filter((x) => !DEEP_SECTORS.has(x.id))
}

const INDUSTRY_SECTOR: Partial<Record<Industry, SectorId>> = {
  software: 'tech', gameStudio: 'games', ecommerce: 'ecommerce', marketing: 'media', entertainment: 'entertainment',
  clinic: 'pharma', hotel: 'hotels', logistics: 'shipping', farm: 'agri', construction: 'construction',
  realEstate: 'property', grocery: 'supermarkets', restaurant: 'food', cafe: 'food', bakery: 'food',
  foodTruck: 'food', bar: 'brewers', brewery: 'brewers', fashion: 'fashion', beauty: 'cosmetics',
  salon: 'cosmetics', gym: 'leisure', autoShop: 'automakers',
}

const GENERIC_WORDS = ['Pacific', 'Summit', 'Crown', 'Union', 'National', 'Atlas', 'Pioneer', 'Meridian', 'Golden', 'United', 'Royal', 'Continental', 'Horizon', 'Keystone']

function demandOf(m: MarketProfile, ind: Industry): number {
  if (m.banned.includes(ind)) return 0
  const d = m.demand[ind]
  return typeof d === 'number' && Number.isFinite(d) ? Math.max(0, d) : 1
}

function bigEconomy(m: MarketProfile): boolean {
  return m.populationM >= 40 && m.gdpPerCapita >= 9_000
}

/** Which energy companies a market lists: oil states pump, mining states dig. */
function energySector(m: MarketProfile, r: SRng): SectorId {
  const c = getCountry(m.countryId)
  const note = m.businessNote.toLowerCase()
  const oilW = 1 + (c.continent === 'Middle East' ? 4 : 0) + (/\b(oil|petro|crude|opec|gas)\b/.test(note) ? 3 : 0)
  const miningW = 1 + (/(mining|mine|copper|iron ore|gold|coal|nickel|diamond|lithium|platinum)/.test(note) ? 3 : 0) + (['Oceania', 'Africa', 'South America'].includes(c.continent) ? 1.5 : 0)
  return r.weighted<SectorId>(['oil', 'mining', 'utilities'], (s) => (s === 'oil' ? oilW : s === 'mining' ? miningW : 0.8))
}

function manufacturingSector(m: MarketProfile, r: SRng): SectorId {
  const big = bigEconomy(m)
  return r.weighted<SectorId>(['automakers', 'electronics', 'industrials'], (s) => (s === 'industrials' ? 1 : big ? 1.6 : 0.6))
}

function sectorForIndustry(m: MarketProfile, ind: Industry, r: SRng): SectorId {
  if (ind === 'energy') return energySector(m, r)
  if (ind === 'manufacturing') return manufacturingSector(m, r)
  return INDUSTRY_SECTOR[ind] ?? DEEP_SECTOR[ind] ?? 'industrials'
}

function sectorWeight(m: MarketProfile, s: SectorDef): number {
  if (s.drivers.length === 0) return s.base
  const ds = s.drivers.map((d) => demandOf(m, d))
  if (ds.every((d) => d === 0)) return 0
  const avg = ds.reduce((a, b) => a + b, 0) / ds.length
  const boost = bigEconomy(m) && (s.id === 'automakers' || s.id === 'electronics' || s.id === 'industrials') ? 2.2 : 1
  return s.base * Math.pow(avg, 3) * boost
}

const planCache = new Map<string, SectorId[]>()
const classicCount = new Map<string, number>()

/** Most deep-tech listings an exchange adds on top of its classic plan, and the cap on all. */
const MAX_DEEP_SLOTS = 4
const MAX_SLOTS = 14

/** Deep-tech champions a hub exchange lists after its classic companies (strongest first). */
function deepSlots(m: MarketProfile, have: number): SectorId[] {
  const hubs = DEEP_TECH_IDS.filter((ind) => demandOf(m, ind) >= 1.4)
    .sort((a, b) => demandOf(m, b) - demandOf(m, a) || a.localeCompare(b))
    .slice(0, bigEconomy(m) ? MAX_DEEP_SLOTS : 2)
  return hubs.map((ind) => DEEP_SECTOR[ind] as SectorId).slice(0, Math.max(0, MAX_SLOTS - have))
}

/** How many of an exchange's slots are classic listings (the rest are deep-tech extras). */
export function classicSlots(info: ExInfo): number {
  slotPlan(info)
  return classicCount.get(info.key) ?? slotPlan(info).length
}

/** The sector of each listed slot on an exchange (stable per exchange). */
export function slotPlan(info: ExInfo): SectorId[] {
  const hit = planCache.get(info.key)
  if (hit) return hit
  const m = marketOf(info.home)
  const r = seeded(`plan|${info.key}`)
  const n = r.int(8, 12)
  const plan: SectorId[] = ['banks']
  // Big industrial economies always list a carmaker or an electronics giant.
  if (bigEconomy(m) && demandOf(m, 'manufacturing') >= 1) {
    plan.push(demandOf(m, 'software') > demandOf(m, 'autoShop') ? 'electronics' : 'automakers')
    if (demandOf(m, 'manufacturing') >= 1.2) plan.push(plan[1] === 'electronics' ? 'automakers' : 'electronics')
  }
  // The market's strongest industries always get a listed champion.
  const top = (Object.keys(m.demand) as Industry[])
    .filter((ind) => !DEEP_INDUSTRIES.has(ind) && demandOf(m, ind) >= 1.15)
    .sort((a, b) => demandOf(m, b) - demandOf(m, a) || a.localeCompare(b))
    .slice(0, 4)
  for (const ind of top) {
    if (plan.length >= n) break
    const s = sectorForIndustry(m, ind, r)
    if (!plan.includes(s) && sectorWeight(m, SECTORS[s]) > 0) plan.push(s)
  }
  const all = classicSectors()
  let guard = 0
  while (plan.length < n && guard++ < 200) {
    const s = r.weighted(all, (d) => sectorWeight(m, d) * Math.pow(0.2, plan.filter((p) => p === d.id).length))
    if (sectorWeight(m, s) > 0) plan.push(s.id)
  }
  classicCount.set(info.key, plan.length)
  // Deep-tech hubs list their champions too, after (never instead of) the classic companies.
  for (const s of deepSlots(m, plan.length)) if (!plan.includes(s)) plan.push(s)
  planCache.set(info.key, plan)
  return plan
}

function asciiLetters(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
}

/** A ticker from a company name, e.g. 'Sakura Motors' → 'SAKM'. */
function tickerFor(name: string, len: number): string {
  const words = name.split(/\s+/).filter((w) => !/^(of|the|and|&)$/i.test(w))
  const first = asciiLetters(words[0] ?? '')
  const rest = words.slice(1).map((w) => asciiLetters(w).charAt(0)).join('')
  const t = (first.slice(0, Math.max(1, len - rest.length)) + rest).slice(0, len)
  return t.length >= 2 ? t : `X${t}Q`.slice(0, len)
}

/** Words that make names sound local (falls back to generic ones). */
export function localWords(home: string): string[] {
  const m = marketOf(home)
  const words = m.nameWords.filter((w) => typeof w === 'string' && w.trim().length > 0)
  return words.length >= 4 ? words : [...words, ...GENERIC_WORDS]
}

export interface SecurityDef {
  /** Unique id for merging holdings, e.g. 'TSE:Nikkei 225#s3g0'. */
  id: string
  slot: number
  gen: number
  name: string
  symbol: string
  sector: SectorId | 'penny'
  blurb: string
  beta: number
  idio: number
  /** Dividend yield (0 for growth stocks and penny stocks). */
  dy: number
  /** Long-run total return premium over the market. */
  tilt: number
  risk: number
  ipoPrice: number
  /** The local word in the name ('Sakura' in 'Sakura Motors'), for era renames. */
  word?: string
  /** Penny stocks: which kind of tiny company it is (index into the kinds of each era). */
  kindIndex?: number
}

export function riskFromVol(v: number): number {
  if (v < 0.15) return 1
  if (v < 0.24) return 2
  if (v < 0.34) return 3
  if (v < 0.48) return 4
  return 5
}

const defCache = new Map<string, SecurityDef>()

interface Identity {
  sector: SectorDef
  name: string
  symbol: string
  word: string
}

/** Local words in a stable per-exchange order, so gen-0 companies use distinct words. */
function shuffledWords(info: ExInfo): string[] {
  const words = [...new Set(localWords(info.home))]
  const r = seeded(`w|${info.key}`)
  for (let i = words.length - 1; i > 0; i--) {
    const j = r.int(0, i)
    ;[words[i], words[j]] = [words[j], words[i]]
  }
  return words
}

function rawIdentity(info: ExInfo, slot: number, gen: number): Identity {
  const m = marketOf(info.home)
  const r = seeded(`id|${info.key}#s${slot}g${gen}`)
  const planned = SECTORS[slotPlan(info)[slot % slotPlan(info).length]]
  // A deep-tech slot is always replaced by another company of its sector; classic slots draw
  // from the classic sectors exactly as they always have.
  const sector = gen === 0 || DEEP_SECTORS.has(planned.id) ? planned : r.weighted(classicSectors(), (d) => sectorWeight(m, d))
  const words = shuffledWords(info)
  const word = gen === 0 ? words[slot % words.length] : r.pick(words)
  const name = r.pick(sector.names).replace('{w}', word)
  const symbol = gen === 0 ? tickerFor(name, 4) : tickerFor(name, 3) + String.fromCharCode(65 + ((gen * 7 + slot) % 26))
  return { sector, name, symbol, word }
}

const symbolCache = new Map<string, string[]>()

/** Gen-0 tickers of an exchange, made unique (two "SCHB"s become SCHB and SCHC). */
function gen0Symbols(info: ExInfo): string[] {
  const hit = symbolCache.get(info.key)
  if (hit) return hit
  const used = new Set<string>()
  const out = slotPlan(info).map((_, slot) => {
    const base = rawIdentity(info, slot, 0).symbol
    let sym = base
    for (let k = 0; used.has(sym) && k < 26; k++) sym = base.slice(0, 3) + String.fromCharCode(65 + ((base.charCodeAt(3) - 65 + k + 1) % 26))
    used.add(sym)
    return sym
  })
  symbolCache.set(info.key, out)
  return out
}

export function companyDef(info: ExInfo, slot: number, gen: number): SecurityDef {
  const id = `${info.key}#s${slot}g${gen}`
  const hit = defCache.get(id)
  if (hit) return hit
  const m = marketOf(info.home)
  const ident = rawIdentity(info, slot, gen)
  const sector = ident.sector
  const r = seeded(`co|${id}`)
  const vol = exVol(info.ex)
  const beta = sector.beta * r.float(0.85, 1.15)
  const idio = sector.idio * r.float(0.8, 1.2)
  const dy = Math.round(r.float(sector.dy[0], sector.dy[1]) * 1000) / 1000
  const demand = sector.drivers.length ? sector.drivers.reduce((a, d) => a + demandOf(m, d), 0) / sector.drivers.length : 1
  const tilt = clampNum(0.02 * (demand - 1), -0.02, 0.02) + r.float(-0.012, 0.012)
  const def: SecurityDef = {
    id,
    slot,
    gen,
    name: ident.name,
    symbol: gen === 0 ? (gen0Symbols(info)[slot] ?? ident.symbol) : ident.symbol,
    sector: sector.id,
    blurb: r.pick(sector.blurbs),
    beta,
    idio,
    dy,
    tilt,
    risk: riskFromVol(Math.sqrt((beta * vol) ** 2 + idio ** 2)),
    ipoPrice: Math.round(r.float(8, 120) * 100) / 100,
    word: ident.word,
  }
  defCache.set(id, def)
  return def
}

const PENNY_KINDS: { noun: string; pitch: string }[] = [
  { noun: 'Lithium Ventures', pitch: 'Owns a lake that might contain lithium. Or might just be a lake.' },
  { noun: 'Biotech', pitch: 'One drug candidate, zero revenue and a CEO who is "very excited".' },
  { noun: 'Gold Explorers', pitch: 'Has been about to strike gold since 2009.' },
  { noun: 'Blockchain Solutions', pitch: 'Used to sell iced tea. Added "blockchain" to its name. Stock tripled.' },
  { noun: 'Hydrogen', pitch: 'Promises clean trucks, eventually, possibly.' },
  { noun: 'AI Labs', pitch: 'Three employees, one chatbot and a very confident press release.' },
  { noun: 'Graphene', pitch: 'A wonder material that will change everything once someone works out how.' },
  { noun: 'Rare Earths', pitch: 'Claims its mine has metals with names you can\'t pronounce.' },
  { noun: 'Drone Delivery', pitch: 'Has delivered one burrito. It landed in a pond.' },
  { noun: 'Quantum Holdings', pitch: 'Nobody knows what it does, which is apparently the point.' },
  { noun: 'Vertical Farms', pitch: 'Grows lettuce in a warehouse for the price of caviar.' },
  { noun: 'Space Mining', pitch: 'Plans to mine asteroids. Currently mines investor patience.' },
]

export const PENNY_SLOTS = 4

export function pennyDef(info: ExInfo, slot: number, gen: number): SecurityDef {
  const id = `${info.key}#p${slot}g${gen}`
  const hit = defCache.get(id)
  if (hit) return hit
  const r = seeded(`penny|${id}`)
  const kindIndex = seeded(`pk|${info.key}`).int(0, PENNY_KINDS.length - 1) + slot * 5 + gen * 3
  const kind = PENNY_KINDS[kindIndex % PENNY_KINDS.length]
  const word = r.pick(localWords(info.home))
  const name = `${word} ${kind.noun}`
  const def: SecurityDef = {
    id,
    slot,
    gen,
    name,
    symbol: tickerFor(name, 4),
    sector: 'penny',
    blurb: kind.pitch,
    beta: 1.5,
    idio: 0.6,
    dy: 0,
    tilt: 0,
    risk: 5,
    ipoPrice: Math.round(r.float(0.2, 3) * 100) / 100,
    word,
    kindIndex,
  }
  defCache.set(id, def)
  return def
}

export interface EraIdentity {
  name: string
  /** Sector label, e.g. 'Office Machines' in 1925, 'Technology' today. */
  label: string
  emoji: string
  blurb: string
}

function stableIndex(key: string, n: number): number {
  let h = 7
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0
  return Math.abs(h) % Math.max(1, n)
}

/**
 * How a listed company looked in `year`: a 1925 'tech' slot is a tabulating-machine maker, a 1985
 * e-commerce slot a mail-order catalog, 1999's penny stocks are dot-coms. The present (and each
 * sector's modern era) returns the company's own name and blurb unchanged.
 */
export function eraIdentity(def: SecurityDef, year: number): EraIdentity {
  if (def.sector === 'penny') {
    const modernNoun = PENNY_KINDS[(def.kindIndex ?? 0) % PENNY_KINDS.length]
    const old = eraPennyKind(year, def.kindIndex ?? 0)
    const since = modernNoun ? MODERN_PENNY_SINCE[modernNoun.noun] : undefined
    const kind = old ?? (since !== undefined && year < since && year < PRESENT_YEAR ? lateEraPennyKind(def.kindIndex ?? 0) : null)
    if (!kind || !def.word) return { name: def.name, label: 'Penny stock', emoji: '🎟️', blurb: def.blurb }
    return { name: `${def.word} ${kind.noun}`, label: 'Penny stock', emoji: '🎟️', blurb: kind.pitch }
  }
  const sector = SECTORS[def.sector]
  const era = eraSector(def.sector, year)
  if (!era) return { name: def.name, label: sector.label, emoji: sector.emoji, blurb: def.blurb }
  const name = era.names && def.word ? era.names[stableIndex(def.id, era.names.length)].replace('{w}', def.word) : def.name
  return { name, label: era.label, emoji: era.emoji, blurb: era.blurbs[stableIndex(`${def.id}|b`, era.blurbs.length)] }
}

// ---------------------------------------------------------------------------
// Exchange price paths

export type SecEvent = 'bankrupt' | 'acquired' | 'scandal' | 'surge' | 'split' | 'reverseSplit' | 'moon' | 'ipo'

export interface SecYear {
  id: string
  slot: number
  gen: number
  /** Price per unit at the end of this year. */
  price: number
  /** Change this year before any split (e.g. 0.1 = +10%). */
  ret: number
  event?: SecEvent
  /** Split ratio (2 = 2-for-1, 0.1 = 1-for-10 reverse split). */
  ratio?: number
  /** Dividends paid this year as a share of the start-of-year value. */
  payout: number
  /** Year this listing started (coins revert toward a trend that starts then). */
  since?: number
  /** Coins: the price the hype-fading trend starts from (the last real price, after history). */
  base?: number
  /** Coins: not trading yet (before the coin launched, or after a collapse until the next one). */
  unlisted?: boolean
  /** The previous company in this slot ended this year (holders get `perUnit` per unit). */
  ended?: { id: string; kind: 'bankrupt' | 'acquired'; perUnit: number; premium: number }
}

export interface ExYear {
  year: number
  index: IndexMove
  /** Index points. */
  level: number
  stocks: SecYear[]
  pennies: SecYear[]
  fund: SecYear
  reit: SecYear
  /** Local house prices this year (REITs follow them). */
  housing: number
}

/**
 * Yearly fee of the local index fund (cheaper in deep, developed markets). Before index funds
 * existed (1976 in the US), the closest thing was an investment trust charging far more.
 */
export function fundFee(info: ExInfo, year?: number): number {
  if (year !== undefined && inHistory(year) && year < indexFundSince(info.home)) return TRUST_FEE
  const ease = clampNum(marketOf(info.home).easeOfBusiness, 0, 100)
  return Math.round((0.001 + 0.006 * (1 - ease / 100)) * 10000) / 10000
}

export function reitYield(info: ExInfo, year?: number): number {
  const hist = year !== undefined ? historicalPolicyRate(info.home, year) : null
  return clampNum(0.035 + 0.25 * (hist !== null ? Math.min(0.2, hist) : marketOf(info.home).interestRate), 0.035, 0.09)
}

function splitRatio(price: number): number {
  for (const r of [2, 3, 4, 5, 10, 20, 50, 100]) if (price / r <= 350) return r
  return Math.ceil(price / 200)
}

function initialExYear(fam: string, info: ExInfo, year: number): ExYear {
  const r = seeded(`${familyAt(fam)}|init|${info.key}`)
  // Deep-tech extras draw from their own stream so the classic listings keep their old prices.
  const rd = seeded(`${familyAt(fam)}|initdt|${info.key}`)
  const classic = classicSlots(info)
  const stocks = slotPlan(info).map((_, slot): SecYear => {
    const def = companyDef(info, slot, 0)
    return { id: def.id, slot, gen: 0, price: Math.round(def.ipoPrice * (slot < classic ? r : rd).float(0.6, 2.5) * 100) / 100, ret: 0, payout: def.dy }
  })
  const pennies = Array.from({ length: PENNY_SLOTS }, (_, slot): SecYear => {
    const def = pennyDef(info, slot, 0)
    return { id: def.id, slot, gen: 0, price: def.ipoPrice, ret: 0, payout: 0 }
  })
  return {
    year,
    index: indexMove(fam, info, year),
    level: Math.round(seeded(`lvl|${info.key}`).float(900, 40_000)),
    stocks,
    pennies,
    fund: { id: `${info.key}#fund`, slot: 0, gen: 0, price: Math.round(r.float(40, 250) * 100) / 100, ret: 0, payout: indexYield(info) },
    reit: { id: `${info.key}#reit`, slot: 0, gen: 0, price: Math.round(r.float(10, 60) * 100) / 100, ret: 0, payout: reitYield(info) },
    housing: 0,
  }
}

/**
 * A sector's real story this year (log return over the market, e.g. tech in 2000), or null when
 * it moved with the market or the year is the procedural future.
 */
function sectorExcess(info: ExInfo, def: SecurityDef, year: number): number | null {
  if (def.sector === 'penny' || !inHistory(year)) return null
  return historicalSectorExcess(info.home, historySector(def.sector, year), year)
}

function nextStock(info: ExInfo, prev: SecYear, idx: IndexMove, r: SRng, year: number): SecYear {
  const def = companyDef(info, prev.slot, prev.gen)
  const drift = exDrift(info.ex)
  // Always draw the same numbers so one event never shifts another company's randomness.
  const z = normal(r)
  const uBank = r.next()
  const uAcq = r.next()
  const uJump = r.next()
  const uSize = r.next()
  // History: a sector's real story (tech in 2000-02, banks in 2008), with company-specific noise.
  const excess = sectorExcess(info, def, year)
  // A collapsing sector takes its weakest companies with it (the dot-com bust, 2008's banks).
  const bust = excess !== null && excess < -0.35 ? 2.5 : 1
  const pBank = [0, 0.001, 0.002, 0.004, 0.008, 0.015][def.risk] * (idx.crash ? 3 : 1) * bust
  if (uBank < pBank) {
    const next = companyDef(info, prev.slot, prev.gen + 1)
    return { id: next.id, slot: prev.slot, gen: prev.gen + 1, price: next.ipoPrice, ret: 0, event: 'ipo', payout: 0, ended: { id: def.id, kind: 'bankrupt', perUnit: 0, premium: -1 } }
  }
  const marketDev = idx.logRet - Math.log(1 + drift)
  let logTotal: number
  if (inHistory(year)) {
    // History: the sector's real story when there is one, else the market's real move amplified
    // by the company's beta. Company noise is mean-neutral (most single stocks trail the index,
    // a few win big), so a basket of stocks does what its sectors really did.
    const k = excess !== null ? 0.6 : 0.8
    const noise = def.idio * k * z - 0.5 * (def.idio * k) ** 2
    logTotal = excess !== null ? idx.logRet + excess + def.tilt + noise : idx.logRet + (def.beta - 1) * (idx.logRet - HIST_MEAN_LOG) + def.tilt + noise
  } else logTotal = Math.log(1 + drift + def.tilt) + def.beta * marketDev + def.idio * z
  let event: SecEvent | undefined
  if (uJump < 0.02) {
    logTotal += Math.log(0.45 + 0.3 * uSize)
    event = 'scandal'
  } else if (uJump > 0.98) {
    logTotal += Math.log(1.3 + 0.5 * uSize)
    event = 'surge'
  }
  const priceRet = toRet(logTotal - Math.log(1 + def.dy))
  if (uAcq < 0.012) {
    const premium = 0.2 + 0.35 * uSize
    const next = companyDef(info, prev.slot, prev.gen + 1)
    return { id: next.id, slot: prev.slot, gen: prev.gen + 1, price: next.ipoPrice, ret: 0, event: 'ipo', payout: 0, ended: { id: def.id, kind: 'acquired', perUnit: Math.round(prev.price * (1 + premium) * 10000) / 10000, premium } }
  }
  let price = Math.max(0.01, prev.price * (1 + priceRet))
  let ratio: number | undefined
  if (price > 800) {
    ratio = splitRatio(price)
    price /= ratio
    event = event ?? 'split'
  } else if (price < 1.5) {
    ratio = 0.1
    price *= 10
    event = event ?? 'reverseSplit'
  }
  // Companies cut dividends in crashes.
  const payout = idx.crash ? def.dy * 0.5 : def.dy
  return { id: def.id, slot: prev.slot, gen: prev.gen, price, ret: priceRet, event, ratio, payout }
}

/** The sector a penny stock's theme rode in `year` (1999's dot-coms, 1980's oil explorers), or null. */
function pennySector(def: SecurityDef, year: number): SectorId | null {
  const k = def.kindIndex ?? 0
  const old = eraPennyKind(year, k)
  if (old) return old.as ?? null
  const modern = PENNY_KINDS[Math.abs(Math.round(k)) % PENNY_KINDS.length]
  const since = MODERN_PENNY_SINCE[modern.noun]
  if (since !== undefined && year < since) return lateEraPennyKind(k).as ?? null
  return MODERN_PENNY_SECTOR[modern.noun] ?? null
}

function nextPenny(info: ExInfo, prev: SecYear, idx: IndexMove, r: SRng, year: number): SecYear {
  const def = pennyDef(info, prev.slot, prev.gen)
  const drift = exDrift(info.ex)
  const z = normal(r)
  const uZero = r.next()
  const uMoon = r.next()
  const uSize = r.next()
  // History: tiny companies ride their theme's real story, harder (the dot-coms of 1999, then 2000).
  const hist = inHistory(year)
  const sector = hist ? pennySector(def, year) : null
  const excess = sector ? historicalSectorExcess(info.home, sector, year) : null
  const pZero = (idx.crash ? 0.16 : 0.08) * (excess !== null && excess < -0.35 ? 2 : 1)
  let logRet = hist ? -0.34 + 1.5 * (idx.logRet - HIST_MEAN_LOG) + 1.2 * (excess ?? 0) + 0.6 * z : -0.34 + 1.5 * (idx.logRet - Math.log(1 + drift)) + 0.6 * z
  let event: SecEvent | undefined
  if (uMoon < 0.03) {
    logRet += Math.log(4 + 8 * uSize)
    event = 'moon'
  }
  const ret = toRet(logRet)
  const price = prev.price * (1 + ret)
  if ((uZero < pZero && event !== 'moon') || price < 0.002) {
    const next = pennyDef(info, prev.slot, prev.gen + 1)
    return { id: next.id, slot: prev.slot, gen: prev.gen + 1, price: next.ipoPrice, ret: 0, event: 'ipo', payout: 0, ended: { id: def.id, kind: 'bankrupt', perUnit: 0, premium: -1 } }
  }
  return { id: def.id, slot: prev.slot, gen: prev.gen, price, ret, event, payout: 0 }
}

/** Local house prices: rates above ~5% weigh on them, crashes drag them down. */
function housingMove(fam: string, info: ExInfo, year: number, idx: IndexMove): number {
  if (inHistory(year)) return clampNum(historicalHousing(info.home, year) ?? 0, -0.4, 0.4)
  const m = marketOf(info.home)
  const r = seeded(`${familyAt(fam, year)}|house|${info.home}|${year}`)
  const base = 0.03 - 0.5 * Math.max(0, m.interestRate - 0.05) * 0.2
  return clampNum(base + 0.06 * normal(r) + (idx.crash ? -0.1 : 0) + (idx.boom ? 0.04 : 0), -0.4, 0.4)
}

/** A listing that stands still for a year (no exchange to trade on). */
function frozen(s: SecYear): SecYear {
  return { id: s.id, slot: s.slot, gen: s.gen, price: s.price, ret: 0, payout: 0 }
}

/** A revolution nationalizes the company: holders get nothing, and the slot waits for a new listing. */
function nationalized(s: SecYear, next: SecurityDef): SecYear {
  return { id: next.id, slot: s.slot, gen: s.gen + 1, price: next.ipoPrice, ret: 0, event: 'ipo', payout: 0, ended: { id: s.id, kind: 'bankrupt', perUnit: 0, premium: -1 } }
}

function nextExYear(fam: string, info: ExInfo, prev: ExYear, year: number): ExYear {
  const idx = indexMove(fam, info, year)
  const dyIdx = indexYield(info)
  const r = seeded(`${familyAt(fam, year)}|ex|${info.key}|${year}`)
  const rd = seeded(`${familyAt(fam, year)}|exdt|${info.key}|${year}`)
  const classic = classicSlots(info)
  // History: no exchange (not yet open, or abolished after a revolution) means nothing moves;
  // the year of a revolution wipes every listing out.
  const state = inHistory(year) ? exchangeState(info.home, year) : null
  if (state && state.status === 'none') {
    const wipe = state.expropriated
    return {
      year,
      index: idx,
      level: prev.level,
      stocks: prev.stocks.map((s) => (wipe ? nationalized(s, companyDef(info, s.slot, s.gen + 1)) : frozen(s))),
      pennies: prev.pennies.map((s) => (wipe ? nationalized(s, pennyDef(info, s.slot, s.gen + 1)) : frozen(s))),
      fund: frozen(prev.fund),
      reit: frozen(prev.reit),
      housing: inHistory(year) ? clampNum(historicalHousing(info.home, year) ?? 0, -0.4, 0.4) : 0,
    }
  }
  const stocks = prev.stocks.map((s) => nextStock(info, s, idx, s.slot < classic ? r : rd, year))
  const pennies = prev.pennies.map((s) => nextPenny(info, s, idx, r, year))
  // The index fund tracks the index (price) minus its yearly fee.
  const fundRet = Math.max(-0.99, (1 + idx.ret) * (1 - fundFee(info, year)) - 1)
  let fundPrice = Math.max(0.01, prev.fund.price * (1 + fundRet))
  let fundRatio: number | undefined
  if (fundPrice > 1000) {
    fundRatio = splitRatio(fundPrice)
    fundPrice /= fundRatio
  }
  const housing = housingMove(fam, info, year, idx)
  const dyR = reitYield(info, year)
  const zr = normal(r)
  const reitLog = Math.log(1 + housing) + 0.5 * (idx.logRet - Math.log(1 + exDrift(info.ex))) + 0.05 * zr - 0.004
  const reitRet = toRet(reitLog)
  let reitPrice = Math.max(0.01, prev.reit.price * (1 + reitRet))
  let reitRatio: number | undefined
  if (reitPrice > 1000) {
    reitRatio = splitRatio(reitPrice)
    reitPrice /= reitRatio
  }
  return {
    year,
    index: idx,
    level: Math.max(1, prev.level * (1 + idx.ret)),
    stocks,
    pennies,
    fund: { id: prev.fund.id, slot: 0, gen: 0, price: fundPrice, ret: fundRet, ratio: fundRatio, event: fundRatio ? 'split' : undefined, payout: idx.crash ? dyIdx * 0.7 : dyIdx },
    reit: { id: prev.reit.id, slot: 0, gen: 0, price: reitPrice, ret: reitRet, ratio: reitRatio, event: reitRatio ? 'split' : undefined, payout: idx.crash ? dyR * 0.8 : dyR },
    housing,
  }
}

/** Never simulate more than this many years of history (holdings track their own prices). */
const MAX_SPAN = 400
const CACHE_LIMIT = 24

const pathCache = new Map<string, ExYear[]>()

function remember<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.set(key, value)
  if (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
}

function effectiveAnchor(anchor: number, year: number): number {
  let a = Number.isFinite(anchor) ? Math.round(anchor) : year
  // A family older than recorded history starts its market where history starts.
  if (year >= HISTORY_START) a = Math.max(a, HISTORY_START)
  return Math.max(Math.min(a, year), year - MAX_SPAN)
}

/** One exchange's full state in a year (prices, events, the index). */
export function exchangeYear(fam: string, anchor: number, info: ExInfo, year: number): ExYear {
  const y = Math.round(year)
  const a = effectiveAnchor(anchor, y)
  const ck = `${fam}|${a}|${info.key}`
  let years = pathCache.get(ck)
  if (!years) {
    years = [initialExYear(fam, info, a)]
    remember(pathCache, ck, years)
  }
  while (years.length <= y - a) years.push(nextExYear(fam, info, years[years.length - 1], a + years.length))
  return years[y - a]
}

// ---------------------------------------------------------------------------
// Crypto (global)

export interface CoinDef {
  id: string
  slot: number
  gen: number
  name: string
  symbol: string
  blurb: string
  beta: number
  idio: number
  /** Chance per year of collapsing to nothing. */
  pZero: number
  /** "Staking rewards" paid as income (the stablecoin). */
  yield: number
  stable: boolean
  risk: number
}

const COIN_SLOTS: { names: [string, string][]; blurb: string; beta: number; idio: number; pZero: number; yield: number; stable: boolean; risk: number; base: [number, number] }[] = [
  { names: [['Bitbuck', 'BBK'], ['Bitbuck Classic', 'BBKC'], ['Bitbuck Reborn', 'BBKR']], blurb: 'The original coin. Digital gold, according to everyone who owns some.', beta: 1, idio: 0.15, pZero: 0.002, yield: 0, stable: false, risk: 4, base: [15_000, 60_000] },
  { names: [['Aetherium', 'AETH'], ['Aetherium Two', 'AET2'], ['Aetherium Prime', 'AETP']], blurb: 'Smart contracts, NFTs and forty-page whitepapers nobody reads.', beta: 1.25, idio: 0.3, pZero: 0.004, yield: 0, stable: false, risk: 5, base: [800, 4_000] },
  { names: [['Corgicoin', 'CORG'], ['Moonpup', 'MPUP'], ['FrogCash', 'FROG'], ['Rocket Hamster', 'RHAM'], ['Shibalord', 'SLRD'], ['Catnip Token', 'NIP']], blurb: 'Started as a joke. Still is, but now it has a market cap.', beta: 1.6, idio: 0.7, pZero: 0.05, yield: 0, stable: false, risk: 5, base: [0.02, 0.4] },
  { names: [['TerraNova Dollar', 'TNUSD'], ['LunaPeg Dollar', 'LPUSD'], ['Anchorless USD', 'AUSD'], ['TrustMe Dollar', 'TMUSD'], ['Totally Stable Coin', 'TSC']], blurb: 'Pegged to $1 by an algorithm and pays 12% "staking rewards". What could go wrong?', beta: 0, idio: 0, pZero: 0.06, yield: 0.12, stable: true, risk: 5, base: [1, 1] },
]

export const COIN_COUNT = COIN_SLOTS.length

export function coinDef(slot: number, gen: number): CoinDef {
  const s = COIN_SLOTS[slot % COIN_SLOTS.length]
  const [name, symbol] = s.names[gen % s.names.length]
  const suffix = gen >= s.names.length ? ` ${Math.floor(gen / s.names.length) + 1}` : ''
  return { id: `crypto#c${slot}g${gen}`, slot, gen, name: name + suffix, symbol: symbol + (suffix ? String(Math.floor(gen / s.names.length) + 1) : ''), blurb: s.blurb, beta: s.beta, idio: s.idio, pZero: s.pZero, yield: s.yield, stable: s.stable, risk: s.risk }
}

export interface CryptoYear {
  year: number
  /** The overall crypto market's move this year. */
  ret: number
  winter: boolean
  mania: boolean
  coins: SecYear[]
}

const CRYPTO_MU = 0.18
/** Long-run yearly growth of the price a coin's hype reverts to. */
const CRYPTO_TREND = 0.05

function cryptoMarket(fam: string, year: number): { logRet: number; winter: boolean; mania: boolean } {
  const r = seeded(`${familyAt(fam, year)}|crypto|${year}`)
  const z = normal(r)
  const u = r.next()
  const s = r.next()
  if (u < 0.14) return { logRet: Math.log(0.15 + 0.25 * s), winter: true, mania: false }
  if (u > 0.9) return { logRet: Math.log(2 + 2 * s), winter: false, mania: true }
  return { logRet: CRYPTO_MU + 0.5 * z, winter: false, mania: false }
}

const cryptoCache = new Map<string, CryptoYear[]>()

function coinStartPrice(fam: string, slot: number, gen: number): number {
  const b = COIN_SLOTS[slot % COIN_SLOTS.length].base
  const r = seeded(`${familyAt(fam)}|coin0|${slot}|${gen}`)
  return b[0] === b[1] ? b[0] : Math.round(r.float(b[0], b[1]) * 10000) / 10000
}

/** A historical crypto year: every coin at its real price (none at all before 2009). */
function historicalCryptoYear(yr: number, prev: CryptoYear | null): CryptoYear {
  const coins = COIN_SLOTS.map((_, slot): SecYear => {
    const h = historicalCoin(slot, yr)
    const gen = h?.gen ?? 0
    const def = coinDef(slot, gen)
    const price = Math.max(0.000001, h?.price ?? 1)
    const ended = h?.collapsed !== undefined ? { id: coinDef(slot, h.collapsed).id, kind: 'bankrupt' as const, perUnit: 0, premium: -1 } : undefined
    if (!h?.listed) return { id: def.id, slot, gen, price, ret: 0, payout: 0, since: yr, base: price, unlisted: true, ended }
    const before = prev?.coins[slot]
    const ret = before && before.id === def.id && !before.unlisted && before.price > 0 ? price / before.price - 1 : 0
    return { id: def.id, slot, gen, price, ret, event: h.ipo ? 'ipo' : undefined, payout: def.yield, since: yr, base: price, ended }
  })
  const ret = historicalCryptoReturn(yr) ?? 0
  return { year: yr, ret, winter: ret <= -0.5, mania: ret >= 1.5, coins }
}

export function cryptoYear(fam: string, anchor: number, year: number): CryptoYear {
  const y = Math.round(year)
  const a = effectiveAnchor(anchor, y)
  const ck = `${fam}|${a}`
  let years = cryptoCache.get(ck)
  if (!years) {
    if (inHistory(a)) years = [historicalCryptoYear(a, null)]
    else {
      const coins = COIN_SLOTS.map((_, slot): SecYear => ({ id: coinDef(slot, 0).id, slot, gen: 0, price: coinStartPrice(fam, slot, 0), ret: 0, payout: COIN_SLOTS[slot].yield, since: a }))
      years = [{ year: a, ret: 0, winter: false, mania: false, coins }]
    }
    remember(cryptoCache, ck, years)
  }
  while (years.length <= y - a) {
    const prev = years[years.length - 1]
    const yr = a + years.length
    if (inHistory(yr)) {
      years.push(historicalCryptoYear(yr, prev))
      continue
    }
    const mk = cryptoMarket(fam, yr)
    const r = seeded(`${familyAt(fam, yr)}|coins|${yr}`)
    const coins = prev.coins.map((c): SecYear => {
      const def = coinDef(c.slot, c.gen)
      const z = normal(r)
      const uz = r.next()
      // A coin still waiting for its launch when history ends lists now.
      if (c.unlisted) return { id: def.id, slot: c.slot, gen: c.gen, price: c.price, ret: 0, event: 'ipo', payout: def.yield, since: yr, base: c.price }
      if (uz < def.pZero * (mk.winter ? 2 : 1)) {
        const next = coinDef(c.slot, c.gen + 1)
        return { id: next.id, slot: c.slot, gen: c.gen + 1, price: coinStartPrice(fam, c.slot, c.gen + 1), ret: 0, event: 'ipo', payout: next.yield, since: yr, ended: { id: def.id, kind: 'bankrupt', perUnit: 0, premium: -1 } }
      }
      // Hype fades: coins drift back toward a slowly rising trend, so manias and winters alternate
      // instead of compounding into billion-dollar coins. After real history the trend starts
      // from the coin's last real price.
      const since = c.since ?? a
      const trend = Math.log(c.base ?? coinStartPrice(fam, c.slot, c.gen)) + CRYPTO_TREND * (yr - since)
      const pull = -0.2 * (Math.log(Math.max(1e-9, c.price)) - trend)
      const ret = def.stable ? 0 : toRet(CRYPTO_MU * (1 - def.beta) + def.beta * mk.logRet + def.idio * z + pull)
      const next: SecYear = { id: def.id, slot: c.slot, gen: c.gen, price: Math.max(0.000001, c.price * (1 + ret)), ret, payout: def.yield, since }
      if (c.base !== undefined) next.base = c.base
      return next
    })
    years.push({ year: yr, ret: toRet(mk.logRet), winter: mk.winter, mania: mk.mania, coins })
  }
  return years[y - a]
}

/** True when a coin trades this year (false before it launched, or after a collapse until the next). */
export function coinListed(c: SecYear | undefined): boolean {
  return !!c && !c.unlisted
}

/** The coins that trade this year (before 2009 there are none). */
export function listedCoins(cy: CryptoYear): SecYear[] {
  return cy.coins.filter((c) => !c.unlisted)
}

/** How much of a coin the market could absorb in a historical year (null = no limit). */
export function coinMarketCap(slot: number, year: number): number | null {
  const h = inHistory(year) ? historicalCoin(slot, year) : null
  return h ? h.marketCap : null
}

// ---------------------------------------------------------------------------
// Gold (global, priced in dollars)

const goldCache = new Map<string, { price: number; ret: number }[]>()

export function goldYear(fam: string, anchor: number, year: number): { price: number; ret: number } {
  const y = Math.round(year)
  const a = effectiveAnchor(anchor, y)
  const ck = `${fam}|${a}`
  let years = goldCache.get(ck)
  if (!years) {
    const hist = historicalGoldPrice(a)
    years = [{ price: hist !== null ? hist : Math.round(seeded(`${familyAt(fam)}|gold0`).float(1_800, 2_800)), ret: 0 }]
    remember(goldCache, ck, years)
  }
  while (years.length <= y - a) {
    const yr = a + years.length
    const prev = years[years.length - 1]
    // After real history, gold's long-run trend starts from its last real price.
    const baseAt = yr >= PRESENT_YEAR && a < PRESENT_YEAR ? PRESENT_YEAR - 1 - a : 0
    const hist = historicalGoldPrice(yr)
    if (hist !== null) {
      years.push({ price: hist, ret: prev.price > 0 ? hist / prev.price - 1 : 0 })
      continue
    }
    const w = worldYear(fam, yr)
    const r = seeded(`${familyAt(fam, yr)}|gold|${yr}`)
    const z = (0.75 * normal(r) - 0.45 * w.z) / 0.875
    // Gold wanders, but not forever: it drifts back toward a slowly rising long-run price.
    const trend = Math.log(years[baseAt].price) + 0.035 * (yr - (a + baseAt))
    const pull = -0.08 * (Math.log(Math.max(1, prev.price)) - trend)
    const logRet = Math.log(1.035) + 0.14 * z + (w.crash ? 0.05 + 0.15 * r.next() : 0) - (w.boom ? 0.05 : 0) + pull
    const ret = toRet(logRet)
    years.push({ price: Math.max(1, prev.price * (1 + ret)), ret })
  }
  return years[y - a]
}

/** Extra yearly return of gold bought where inflation is high: it holds value while the currency melts. */
export function goldHedge(countryId: string, year?: number): number {
  // History is already in real terms: local inflation shows up in savings, not as a gold bonus.
  if (year !== undefined && inHistory(year)) return 0
  return Math.min(0.06, 0.2 * Math.max(0, marketOf(countryId).inflation - 0.05))
}

// ---------------------------------------------------------------------------
// Currencies, government bonds and banks (per country)

/** Inflation in `countryId` (historical in past years, today's figure otherwise). */
export function inflationRate(countryId: string, year?: number): number {
  const hist = year !== undefined ? historicalInflation(countryId, year) : null
  return hist !== null ? hist : marketOf(countryId).inflation
}

/** The central bank's policy rate (historical in past years, today's figure otherwise). */
export function policyRate(countryId: string, year?: number): number {
  const hist = year !== undefined ? historicalPolicyRate(countryId, year) : null
  return hist !== null ? hist : marketOf(countryId).interestRate
}

/** Rates of the hyperinflation years, kept readable (Germany 1923, Zimbabwe 2008). */
function tameRate(r: number): number {
  if (!Number.isFinite(r)) return 0
  if (r <= 10) return r
  return Math.min(50, 10 + 0.05 * (r - 10))
}

/** 0 (stable, clean) - 1 (hyperinflation, rampant corruption). */
export function countryStress(countryId: string, year?: number): number {
  const m = marketOf(countryId)
  const inf = year !== undefined && inHistory(year) ? Math.min(10, inflationRate(countryId, year)) : m.inflation
  return clamp01(clamp01((inf - 0.05) / 0.5) * 0.6 + clamp01((m.corruption - 40) / 50) * 0.4)
}

export function defaultChance(countryId: string, year?: number): number {
  const p = 0.12 * countryStress(countryId, year) ** 2
  return p < 0.002 ? 0 : p
}

export function bankCrisisChance(countryId: string, year?: number): number {
  const p = 0.05 * countryStress(countryId, year) ** 2
  return p < 0.002 ? 0 : p
}

/**
 * Expected yearly loss of the local currency's value (negative = it gains). Today: against the
 * dollar. In history (real terms): against the shops, i.e. what that year's inflation took.
 */
export function expectedDepreciation(countryId: string, year?: number): number {
  if (year !== undefined && inHistory(year)) {
    const inf = Math.min(1e7, inflationRate(countryId, year))
    return clampNum(inf / (1 + inf), -0.3, 0.999999)
  }
  const inf = Math.max(-0.05, marketOf(countryId).inflation)
  return clampNum(1 - 1.025 / (1 + inf), -0.03, 0.85)
}

/** A government bond's coupon: the nominal rate of the day in past years. */
export function bondRate(countryId: string, year?: number): number {
  if (year !== undefined && inHistory(year)) {
    const p = tameRate(Math.max(0, policyRate(countryId, year)))
    return Math.round(clampNum(p + 0.01 + 0.06 * countryStress(countryId, year), 0.001, 60) * 1000) / 1000
  }
  const m = marketOf(countryId)
  return Math.round(clampNum(Math.max(0, m.interestRate) + 0.005 + 0.06 * countryStress(countryId), 0.001, 2) * 1000) / 1000
}

/** A savings account's interest: the nominal rate of the day in past years (1981 US: about 15%). */
export function savingsRate(countryId: string, year?: number): number {
  if (year !== undefined && inHistory(year)) {
    const p = tameRate(Math.max(0, policyRate(countryId, year)))
    return Math.round(clampNum(p * 0.9 - 0.003, 0, 50) * 1000) / 1000
  }
  const m = marketOf(countryId)
  return Math.round(clampNum(Math.max(0, m.interestRate) * 0.7 - 0.002, 0, 2) * 1000) / 1000
}

export function termRate(countryId: string, year?: number): number {
  if (year !== undefined && inHistory(year)) {
    const p = tameRate(Math.max(0, policyRate(countryId, year)))
    return Math.round(clampNum(p * 0.95 + 0.003, 0.001, 50) * 1000) / 1000
  }
  const m = marketOf(countryId)
  return Math.round(clampNum(Math.max(0, m.interestRate) * 0.95 + 0.003, 0.001, 2) * 1000) / 1000
}

/**
 * Deposits the government guarantees if a bank fails (rich countries guarantee more). In past
 * years: what was guaranteed then (nothing before deposit insurance existed).
 */
export function depositInsurance(countryId: string, year?: number): number {
  const m = marketOf(countryId)
  const raw = 250_000 * clampNum(m.gdpPerCapita / 80_000, 0.01, 1) * (1 - countryStress(countryId) * 0.8)
  const present = Math.max(500, Math.round(raw / 500) * 500)
  const hist = year !== undefined ? historicalDepositInsurance(countryId, year, present) : null
  return hist !== null ? Math.max(0, Math.round(hist / 100) * 100) : present
}

export interface FxYear {
  /** Share of dollar value the local currency lost this year (negative = it gained). */
  dep: number
  defaulted: boolean
  /** Share of a bond's value lost in a default. */
  haircut: number
  bankCrisis: boolean
  /** Share of uninsured deposits recovered after a bank failure. */
  recovery: number
  /** Small move in bond prices from interest rates. */
  bondMove: number
}

export function fxYear(fam: string, countryId: string, year: number): FxYear {
  if (inHistory(year)) return historicalFx(countryId, year)
  const r = seeded(`${familyAt(fam, year)}|fx|${countryId}|${year}`)
  const e = expectedDepreciation(countryId)
  const noise = normal(r) * (0.02 + 0.3 * Math.max(0, e))
  const uDef = r.next()
  const uBank = r.next()
  const hair = r.next()
  const rec = r.next()
  const bondMove = normal(r) * 0.025
  const defaulted = uDef < defaultChance(countryId)
  const bankCrisis = uBank < bankCrisisChance(countryId)
  return {
    dep: clampNum(e + noise + (defaulted ? 0.15 : 0), -0.08, 0.95),
    defaulted,
    haircut: 0.4 + 0.35 * hair,
    bankCrisis,
    recovery: 0.2 + 0.4 * rec,
    bondMove,
  }
}

/**
 * A historical year for local money (real terms): inflation eats savings and bonds, bond prices
 * move against interest-rate changes, and the real defaults and banking crises happen.
 */
function historicalFx(countryId: string, year: number): FxYear {
  const haircut = sovereignDefault(countryId, year)
  const recovery = bankingCrisis(countryId, year)
  const dRate = tameRate(Math.max(0, policyRate(countryId, year))) - tameRate(Math.max(0, policyRate(countryId, year - 1)))
  return {
    dep: expectedDepreciation(countryId, year),
    defaulted: haircut !== null,
    haircut: haircut ?? 0,
    bankCrisis: recovery !== null,
    recovery: recovery ?? 1,
    bondMove: clampNum(-4 * dRate, -0.3, 0.3),
  }
}
