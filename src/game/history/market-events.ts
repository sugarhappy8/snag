// Historical market events: the real booms, busts and shocks, in their real years, and what each
// did to every kind of company: hard on the markets at the center of it, milder on everyone else.
// Pure and deterministic (no RNG). The procedural future invents no events; the AI boom of
// 2023-26 only fades gently afterwards, so no crash appears that never happened.
//
// Effects are fractions per unit of intensity: demand -0.2 means 20% fewer customers, costs +0.1
// means 10% dearer inputs, value -0.5 halves what investors pay for each dollar of profit. The
// broad demand cycle of each economy is already historical (economy/), so "everyone" demand
// effects here are small; valuations were not, so value effects carry the boom or the bust.

import type { GameState, Json } from '../types'
import { techAdoption, type TechId } from './timeline'

/** The markets an event can hit hardest. An industry belongs to at most one. */
export type Exposure = 'oil' | 'fuel' | 'clean' | 'property' | 'banking' | 'investing' | 'internet' | 'chips' | 'ai' | 'travel' | 'outings' | 'retail'

export const EXPOSURE_LABELS: Record<Exposure, string> = {
  oil: 'oil and energy', fuel: 'fuel-hungry businesses', clean: 'clean energy', property: 'property and construction',
  banking: 'banks', investing: 'investment firms', internet: 'internet and software', chips: 'chips and data centers',
  ai: 'artificial intelligence', travel: 'travel and hotels', outings: 'restaurants, bars and going out', retail: 'fashion and beauty',
}

/** Industry -> [its market, how much of the industry is exposed to it]. */
const EXPOSURE: Partial<Record<string, readonly [Exposure, number]>> = {
  energy: ['oil', 1],
  logistics: ['fuel', 1], farm: ['fuel', 0.8], manufacturing: ['fuel', 0.8], packaging: ['fuel', 0.7], foodTruck: ['fuel', 0.6], autoShop: ['fuel', 0.6], recycling: ['fuel', 0.6],
  solar: ['clean', 1], battery: ['clean', 1], electricVehicles: ['clean', 1], fusion: ['clean', 0.8], carbonCapture: ['clean', 0.8],
  realEstate: ['property', 1], construction: ['property', 1], furniture: ['property', 0.6],
  bank: ['banking', 1], onlineBank: ['banking', 1], investmentFirm: ['investing', 1],
  software: ['internet', 1], ecommerce: ['internet', 1], marketing: ['internet', 0.7], telecom: ['internet', 0.8], gameStudio: ['internet', 0.6], cybersecurity: ['internet', 0.8],
  semiconductor: ['chips', 1], dataCenter: ['chips', 1],
  aiLab: ['ai', 1], robotics: ['ai', 0.5], quantum: ['ai', 0.5], drones: ['ai', 0.4], neurotech: ['ai', 0.4],
  travel: ['travel', 1], hotel: ['travel', 1], entertainment: ['travel', 0.7], casino: ['travel', 0.6],
  restaurant: ['outings', 1], bar: ['outings', 1], cafe: ['outings', 0.8], nightclub: ['outings', 1], stripClub: ['outings', 1], gym: ['outings', 0.7], salon: ['outings', 0.6],
  fashion: ['retail', 1], beauty: ['retail', 0.8],
}

/** The market an industry is exposed to, and how strongly (null: it only feels the broad effect). */
export function exposureOf(industry: string): { market: Exposure; weight: number } | null {
  const e = EXPOSURE[industry]
  return e ? { market: e[0], weight: e[1] } : null
}

export interface Effect { demand?: number; costs?: number; value?: number }

export interface MarketEvent {
  id: string
  name: string
  emoji: string
  /** Intensity by year (1 = the worst or wildest year). */
  years: Readonly<Record<number, number>>
  /** Countries where it hits at full strength; elsewhere at `abroad`. Omitted: everywhere. */
  home?: readonly string[]
  abroad?: number
  /**
   * The technology the story is about. Where it hasn't arrived yet (under 2% adoption, the same bar as
   * hasTech) the event doesn't reach the country at all, so no announcement, market line or valuation
   * move talks about the internet in a country that has none.
   */
  needs?: TechId
  /** What every company feels. */
  everyone: Effect
  /** The last year `everyone` applies (the AI boom's broad lift is history, not the present). */
  everyoneUntil?: number
  /** What the markets at the center of it feel instead. */
  markets: Partial<Record<Exposure, Effect>>
  /** Oil exporters' whole economies ride the oil price (replaces `everyone` there). */
  exporters?: Effect
  text: string
}

const OIL_EXPORTERS = new Set(['sa', 'ae', 'kw', 'qa', 'ir', 'iq', 'ng', 've', 'ru', 'no', 'kz', 'dz', 'ao', 'ly', 'om', 'bh', 'az'])

export const MARKET_EVENTS: readonly MarketEvent[] = [
  {
    id: 'depression', name: 'The Great Depression', emoji: '\u{1F4C9}',
    years: { 1929: 0.3, 1930: 0.7, 1931: 1, 1932: 1, 1933: 0.6, 1934: 0.25 }, home: ['us'], abroad: 0.8,
    everyone: { demand: -0.06, value: -0.45 },
    markets: { banking: { demand: -0.3, costs: 0.15, value: -0.6 }, investing: { demand: -0.35, value: -0.6 }, property: { demand: -0.3, value: -0.5 }, retail: { demand: -0.2, value: -0.45 }, travel: { demand: -0.25, value: -0.45 }, outings: { demand: -0.15, value: -0.45 } },
    text: 'The stock market crash turns into the Great Depression: banks fail by the thousand, credit vanishes and shoppers stop spending.',
  },
  {
    id: 'oil1973', name: 'The 1973 oil crisis', emoji: '\u{1F6E2}\u{FE0F}',
    years: { 1973: 0.5, 1974: 1, 1975: 0.35 },
    everyone: { costs: 0.05, value: -0.25 },
    markets: { oil: { demand: 0.15, value: 0.4 }, fuel: { costs: 0.18, value: -0.3 }, travel: { demand: -0.1, costs: 0.1, value: -0.35 } },
    exporters: { demand: 0.06, value: 0.1 },
    text: 'An oil embargo quadruples the price of crude: fuel-hungry businesses pay far more, oil companies cash in, and stock markets slump.',
  },
  {
    id: 'oil1979', name: 'The 1979 oil shock', emoji: '\u{1F6E2}\u{FE0F}',
    years: { 1979: 0.6, 1980: 1, 1981: 0.6, 1982: 0.4 },
    everyone: { costs: 0.05, value: -0.12 },
    markets: { oil: { demand: 0.18, value: 0.45 }, fuel: { costs: 0.16, value: -0.15 }, travel: { demand: -0.08, costs: 0.1, value: -0.2 }, property: { demand: -0.15, value: -0.15 } },
    exporters: { demand: 0.06, value: 0.1 },
    text: 'Revolution in Iran doubles oil prices again; record interest rates follow, squeezing borrowers and homebuyers.',
  },
  {
    id: 'gulf1990', name: 'The Gulf War oil spike', emoji: '\u{1F6E2}\u{FE0F}',
    years: { 1990: 0.8, 1991: 0.3 },
    everyone: { costs: 0.02, value: -0.08 },
    markets: { oil: { demand: 0.1, value: 0.1 }, fuel: { costs: 0.12, value: -0.1 }, travel: { demand: -0.12, costs: 0.08, value: -0.2 }, property: { demand: -0.08, value: -0.1 } },
    text: 'The invasion of Kuwait sends oil prices soaring for a few months; airlines and travel suffer most.',
  },
  {
    id: 'japan1990', name: "Japan's bubble bursts", emoji: '\u{1F3EF}',
    years: { 1990: 0.6, 1991: 0.8, 1992: 1, 1993: 0.7, 1994: 0.4 }, home: ['jp'], abroad: 0,
    everyone: { demand: -0.03, value: -0.3 },
    markets: { property: { demand: -0.3, value: -0.55 }, banking: { costs: 0.1, value: -0.5 }, investing: { value: -0.45 } },
    text: "Japan's land and stock bubble bursts: property and bank shares lose half their value and stay down for years.",
  },
  {
    id: 'dotcomBoom', name: 'The dot-com boom', emoji: '\u{1F680}',
    years: { 1995: 0.3, 1996: 0.45, 1997: 0.6, 1998: 0.75, 1999: 1 }, home: ['us'], abroad: 0.7, needs: 'internet',
    everyone: { demand: 0.01, value: 0.12 },
    markets: { internet: { demand: 0.15, value: 1.1 }, chips: { demand: 0.12, value: 0.8 }, ai: { value: 0.3 }, investing: { demand: 0.1, value: 0.2 } },
    text: 'Investors pour money into anything with ".com" in its name: internet and chip companies trade at sky-high valuations.',
  },
  {
    id: 'asia1997', name: 'The Asian financial crisis', emoji: '\u{1F4B1}',
    years: { 1997: 0.6, 1998: 1, 1999: 0.25 }, home: ['th', 'id', 'kr', 'my', 'ph', 'hk', 'sg'], abroad: 0.1,
    everyone: { demand: -0.08, value: -0.35 },
    markets: { banking: { costs: 0.12, value: -0.5 }, property: { demand: -0.25, value: -0.45 }, investing: { value: -0.4 } },
    text: 'Currencies collapse across East Asia: banks, property and stock markets crash, and imports suddenly cost far more.',
  },
  {
    id: 'dotcomCrash', name: 'The dot-com crash', emoji: '\u{1F4A5}',
    years: { 2000: 0.55, 2001: 1, 2002: 0.85, 2003: 0.2 }, home: ['us'], abroad: 0.7, needs: 'internet',
    everyone: { demand: -0.02, value: -0.12 },
    markets: { internet: { demand: -0.2, value: -0.55 }, chips: { demand: -0.2, value: -0.5 }, ai: { value: -0.3 }, investing: { demand: -0.15, value: -0.3 } },
    text: 'The dot-com bubble bursts: internet start-ups run out of cash, tech shares lose most of their value and advertising budgets are slashed.',
  },
  {
    id: 'housing2008', name: 'The housing crash and financial crisis', emoji: '\u{1F3DA}\u{FE0F}',
    years: { 2006: 0.15, 2007: 0.4, 2008: 1, 2009: 0.85, 2010: 0.35, 2011: 0.15 }, home: ['us', 'gb', 'ie', 'es', 'is'], abroad: 0.6,
    everyone: { demand: -0.04, value: -0.3 },
    markets: { property: { demand: -0.35, value: -0.5 }, banking: { demand: -0.15, costs: 0.15, value: -0.6 }, investing: { demand: -0.25, value: -0.5 }, retail: { demand: -0.1, value: -0.35 }, travel: { demand: -0.1, value: -0.35 }, outings: { demand: -0.06, value: -0.3 }, fuel: { demand: -0.08, value: -0.35 } },
    text: 'The housing bubble bursts: home prices crash, banks fail or need rescuing, credit dries up and the world falls into its deepest recession since the 1930s.',
  },
  {
    id: 'oil2008', name: 'The 2008 oil price spike', emoji: '\u{1F6E2}\u{FE0F}',
    years: { 2008: 1 },
    everyone: { costs: 0.03 },
    markets: { oil: { demand: 0.15 }, fuel: { costs: 0.12 }, travel: { costs: 0.1 } },
    text: 'Oil hits an all-time record before collapsing with the economy.',
  },
  {
    id: 'euro2010', name: 'The euro crisis', emoji: '\u{1F4B6}',
    years: { 2010: 0.6, 2011: 0.9, 2012: 1, 2013: 0.4 }, home: ['gr', 'ie', 'pt', 'es', 'it', 'cy'], abroad: 0.1,
    everyone: { demand: -0.05, value: -0.25 },
    markets: { banking: { costs: 0.12, value: -0.5 }, property: { demand: -0.2, value: -0.3 }, investing: { value: -0.3 } },
    text: 'Fears that governments cannot repay their debts hit southern Europe: banks wobble, austerity bites and property prices fall.',
  },
  {
    id: 'oilGlut', name: 'The oil price collapse', emoji: '\u{1F6E2}\u{FE0F}',
    years: { 2014: 0.4, 2015: 1, 2016: 0.7 },
    everyone: {},
    markets: { oil: { demand: -0.2, value: -0.4 }, fuel: { costs: -0.08 }, travel: { costs: -0.05 }, clean: { value: -0.1 } },
    exporters: { demand: -0.08, value: -0.2 },
    text: 'A flood of new oil halves the price of crude: oil companies cut back, while transport gets cheaper.',
  },
  {
    id: 'crash2020', name: 'The 2020 crash and oil collapse', emoji: '\u{1F637}',
    years: { 2020: 1, 2021: 0.35 },
    everyone: { demand: -0.03, value: -0.05 },
    markets: { travel: { demand: -0.45, value: -0.35 }, outings: { demand: -0.35, value: -0.2 }, oil: { demand: -0.25, value: -0.35 }, fuel: { demand: -0.05 }, retail: { demand: -0.15, value: -0.1 }, internet: { demand: 0.15, value: 0.35 }, chips: { demand: 0.08, value: 0.2 } },
    exporters: { demand: -0.08, value: -0.15 },
    text: 'A pandemic shuts down travel and going out, and oil prices briefly turn negative, while online shopping and software boom.',
  },
  {
    id: 'crash2022', name: 'The 2022 market crash', emoji: '\u{1F4C9}',
    years: { 2022: 1, 2023: 0.2 }, home: ['us'], abroad: 0.8,
    everyone: { costs: 0.06, value: -0.15 },
    markets: { internet: { demand: -0.05, value: -0.4 }, chips: { value: -0.3 }, ai: { value: -0.25 }, investing: { demand: -0.12, value: -0.25 }, banking: { value: -0.05 }, property: { demand: -0.15, value: -0.2 }, clean: { value: -0.2 }, oil: { demand: 0.2, value: 0.45 }, fuel: { costs: 0.12 } },
    exporters: { demand: 0.05, value: 0.1 },
    text: 'Inflation and fast-rising interest rates hit growth stocks, crypto and property; energy companies boom on high oil and gas prices.',
  },
  {
    id: 'aiBoom', name: 'The AI boom', emoji: '\u{1F916}',
    years: { 2023: 0.45, 2024: 0.75, 2025: 1, 2026: 1, 2027: 0.8, 2028: 0.6, 2029: 0.4, 2030: 0.2 }, home: ['us'], abroad: 0.7,
    everyone: { value: 0.06 }, everyoneUntil: 2025,
    markets: { ai: { demand: 0.3, value: 1 }, chips: { demand: 0.25, value: 0.8 }, internet: { demand: 0.04, value: 0.2 }, clean: { demand: 0.05 }, oil: { demand: 0.03 } },
    text: 'Breakthroughs in artificial intelligence set off an investment frenzy: AI labs, chip makers and data centers can barely keep up with demand.',
  },
]

/**
 * The 2024-2027 chip squeeze, by year (1 = the tightest year). It stays outside MARKET_EVENTS on purpose: no
 * announcement popup, and no marketEventFactors value can move. It is not in demand either (the AI boom row
 * carries that): it only lifts the street price a chip line is measured against and sets how fast goodwill grows.
 */
export const GPU_SHORTAGE: Readonly<Record<number, number>> = { 2024: 0.9, 2025: 1, 2026: 0.7, 2027: 0.4 }

const BOOM = MARKET_EVENTS.find((e) => e.id === 'aiBoom')!
/** The AI boom row with the squeeze's own years, so the home and abroad geography can't drift from the boom. */
const SQUEEZE: MarketEvent = { ...BOOM, years: GPU_SHORTAGE }

/** How tight chip supply is in a country in a year: 0 outside 2024-2027, the boom's geography inside. Pure. */
export function shortageIntensity(country: string, year: number): number {
  return eventStrength(SQUEEZE, country, year)
}

// ---------------------------------------------------------------------------
// Market news: what happened in one trade and market during the game (a breakthrough that worked,
// business/heavy-rd.ts). Unlike MARKET_EVENTS above, which is fixed history, this is a short list
// in game flags, kept the way yearly.ts keeps the 'market.events' list it announces from: a plain
// array under one flag, read with a type guard, so a damaged or missing flag reads as none.

/** One item of market news. `market` is 'world' or a country id, as competition-core marketKey. */
export interface MarketNews {
  /** Unique and deterministic: the same launch is the same id, so it is only ever listed (and announced) once. */
  id: string
  year: number
  industry: string
  market: string
  emoji: string
  title: string
  text: string
}

/** The newest items kept. */
export const MAX_MARKET_NEWS = 20
const NEWS_FLAG = 'market.news'
/** Entries of a stored list that are looked at (a damaged save can't make every read slow). */
const NEWS_SCAN = 64

function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.slice(0, max) : null
}

function cleanNews(x: unknown): MarketNews | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const id = text(o.id, 120)
  const industry = text(o.industry, 40)
  const market = text(o.market, 20)
  const title = text(o.title, 120)
  const body = text(o.text, 600)
  if (!id || !industry || !market || !title || !body) return null
  if (typeof o.year !== 'number' || !Number.isFinite(o.year) || typeof o.emoji !== 'string') return null
  return { id, year: Math.round(clamp(o.year, 1800, 2300)), industry, market, emoji: o.emoji.slice(0, 8), title, text: body }
}

/** The market news, oldest first: a validated copy, each id once (its newest entry), at most MAX_MARKET_NEWS. */
export function readMarketNews(g: Pick<GameState, 'flags'>): MarketNews[] {
  const raw = g.flags ? g.flags[NEWS_FLAG] : undefined
  if (!Array.isArray(raw) || raw.length === 0) return []
  const byId = new Map<string, MarketNews>()
  for (let i = Math.max(0, raw.length - NEWS_SCAN); i < raw.length; i++) {
    const n = cleanNews(raw[i])
    if (!n) continue
    byId.delete(n.id)
    byId.set(n.id, n)
  }
  return [...byId.values()].slice(-MAX_MARKET_NEWS)
}

/**
 * Add an item to the market news. False (and nothing changes) when the item isn't valid or its id is
 * already listed. The stored list is rewritten from the validated one, so damage is repaired.
 */
export function pushMarketNews(g: Pick<GameState, 'flags'>, item: MarketNews): boolean {
  const n = cleanNews(item)
  if (!n) return false
  const list = readMarketNews(g)
  if (list.some((x) => x.id === n.id)) return false
  list.push(n)
  g.flags[NEWS_FLAG] = storedNews(list)
  return true
}

function storedNews(list: readonly MarketNews[]): Json[] {
  return list.slice(-MAX_MARKET_NEWS).map((x) => ({ id: x.id, year: x.year, industry: x.industry, market: x.market, emoji: x.emoji, title: x.title, text: x.text }))
}

/**
 * The market news as a new generation keeps it (it is world state, like market shocks): the stored form
 * of the validated list, or null when there is none to keep. Built through readMarketNews, so a damaged
 * flag is repaired or left behind, never copied.
 */
export function carriedMarketNews(g: Pick<GameState, 'flags'>): Json[] | null {
  const list = readMarketNews(g)
  return list.length ? storedNews(list) : null
}

/** How hard an event hits a country in a year (0 when it doesn't). */
export function eventStrength(e: MarketEvent, country: string, year: number): number {
  const i = e.years[Math.round(year)] ?? 0
  if (!i) return 0
  if (e.needs && techAdoption(country, e.needs, year) < 0.02) return 0
  return e.home ? i * (e.home.includes(country) ? 1 : (e.abroad ?? 0)) : i
}

/** The events at work in a country's markets this year, strongest first. */
export function activeMarketEvents(country: string, year: number): { event: MarketEvent; strength: number }[] {
  return MARKET_EVENTS.map((event) => ({ event, strength: eventStrength(event, country, year) })).filter((x) => x.strength >= 0.1).sort((a, b) => b.strength - a.strength)
}

/** One event's effect on one industry in one country (per unit of strength). */
export function eventEffect(e: MarketEvent, industry: string, country: string, year: number): Required<Effect> & { exposed: boolean } {
  const broad = e.exporters && OIL_EXPORTERS.has(country) ? e.exporters : e.everyoneUntil !== undefined && year > e.everyoneUntil ? {} : e.everyone
  const x = exposureOf(industry)
  const own = x ? e.markets[x.market] : undefined
  const mix = (k: keyof Effect) => (own ? x!.weight * (own[k] ?? 0) + (1 - x!.weight) * (broad[k] ?? 0) : broad[k] ?? 0)
  return { demand: mix('demand'), costs: mix('costs'), value: mix('value'), exposed: !!own && x!.weight >= 0.5 }
}

export interface MarketFactors {
  /** Multipliers on customers, input costs and valuation multiples. */
  demand: number
  costs: number
  value: number
}

/** The most (and least) any combination of events and waves may move demand, costs and value. */
export const FACTOR_BOUNDS = { demand: [0.45, 1.8], costs: [0.75, 1.5], value: [0.3, 3] } as const

const NEUTRAL: MarketFactors = { demand: 1, costs: 1, value: 1 }
const cache = new Map<string, MarketFactors>()

/**
 * What the year's historical events do to an industry in a country. `worldMarket`: the industry's
 * market-size curve already carries its booms and busts (software, chips, AI...), so only a third
 * of the demand effect applies on top; valuations still swing in full.
 */
export function marketEventFactors(industry: string, country: string, year: number, worldMarket = false): MarketFactors {
  const y = Math.round(year)
  if (!Number.isFinite(y) || y < 1929 || y > 2030) return NEUTRAL
  const key = `${industry}|${country}|${y}|${worldMarket ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) return hit
  let demand = 0, costs = 0, value = 0
  for (const e of MARKET_EVENTS) {
    const s = eventStrength(e, country, y)
    if (!s) continue
    const fx = eventEffect(e, industry, country, y)
    demand += s * fx.demand
    costs += s * fx.costs
    value += s * fx.value
  }
  const out: MarketFactors = {
    demand: clamp(1 + demand * (worldMarket ? 0.35 : 1), FACTOR_BOUNDS.demand[0], FACTOR_BOUNDS.demand[1]),
    costs: clamp(1 + costs, FACTOR_BOUNDS.costs[0], FACTOR_BOUNDS.costs[1]),
    value: clamp(1 + value, FACTOR_BOUNDS.value[0], FACTOR_BOUNDS.value[1]),
  }
  if (cache.size > 4096) cache.clear()
  cache.set(key, out)
  return out
}

/** "+20%" / "−35%": a factor as a signed percentage. */
export function signed(f: number): string {
  const v = Math.round((f - 1) * 100)
  return `${v > 0 ? '+' : v < 0 ? '\u2212' : ''}${Math.abs(v)}%`
}

export interface EventImpact {
  event: MarketEvent
  /** True when this industry is at the center of it. */
  exposed: boolean
  demand: number
  costs: number
  value: number
  /** "Hit hard: demand −20%, valuations −55%." */
  text: string
}

/** How each event at work this year hits one industry in one country (strongest first). */
export function marketEventImpacts(industry: string, country: string, year: number, worldMarket = false): EventImpact[] {
  return activeMarketEvents(country, year).map(({ event, strength }) => {
    const fx = eventEffect(event, industry, country, year)
    const demand = 1 + strength * fx.demand * (worldMarket ? 0.35 : 1), costs = 1 + strength * fx.costs, value = 1 + strength * fx.value
    const parts = [
      Math.abs(demand - 1) >= 0.005 ? `demand ${signed(demand)}` : '',
      Math.abs(costs - 1) >= 0.005 ? `input costs ${signed(costs)}` : '',
      Math.abs(value - 1) >= 0.005 ? `valuations ${signed(value)}` : '',
    ].filter(Boolean)
    const big = Math.max(Math.abs(demand - 1), Math.abs(costs - 1), Math.abs(value - 1))
    // "Hard" means clearly harder than what every other company feels (an unexposed industry).
    const broad = eventEffect(event, '', country, year)
    const broadBig = strength * Math.max(Math.abs(broad.demand) * (worldMarket ? 0.35 : 1), Math.abs(broad.costs), Math.abs(broad.value))
    const boom = demand >= 1 && value >= 1 && costs <= 1.02
    const how = !parts.length ? 'Barely touches this market'
      : fx.exposed && big - broadBig >= 0.08 ? (boom ? 'A boom for this market' : 'Hits this market hard')
      : big >= 0.1 ? (boom ? 'Lifts this market too' : 'Felt here too') : 'Felt mildly here'
    return { event, exposed: fx.exposed, demand, costs, value, text: `${how}${parts.length ? `: ${parts.join(', ')}` : ''}.` }
  }).filter((x) => x.text !== 'Barely touches this market.')
}

/** Investors' appetite for a new listing in this market (1 normal): booms help, busts hurt. */
export function listingMood(industry: string, country: string, year: number): number {
  return clamp(1 + (marketEventFactors(industry, country, year).value - 1) * 0.4, 0.6, 1.4)
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo
}
