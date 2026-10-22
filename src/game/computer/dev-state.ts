// Plain-JSON state for the legit side of the home computer (computer/dev*.ts):
//
// - g.flags.dev (DevState): shipped projects, awards, certificates, freelance record, exits.
//   Per life: a new generation starts clean (continueAsChild resets flags).
// - Asset.details of kind 'venture' assets (VentureData): the online businesses. They live on
//   the asset so they are inherited, sold and listed like any other asset.
//
// Every reader validates and fills defaults, so old saves (and hand-edited ones) keep working.
// Also here: local-economy helpers (what things cost and pay where the player lives).
import { localPay } from '../data/local-pay'
import { formatMoney, shortMoney } from '../core'
import { localMarket, marketOf } from '../data/markets'
import type { Asset, GameState, Json } from '../types'
import { getCountry } from '../world'

// ---------------------------------------------------------------------------
// Small helpers

export function num(v: Json | undefined, dflt = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}

export function str(v: Json | undefined, dflt = ''): string {
  return typeof v === 'string' ? v : dflt
}

export function between(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

/** A finite, non-negative whole number (0 for NaN/Infinity/negatives). */
export function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export function toJson(x: unknown): Json {
  return JSON.parse(JSON.stringify(x)) as Json
}

export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** 1,234 → "1.2K"; 2,500,000 → "2.5M". */
export function shortCount(n: number): string {
  const v = whole(n)
  if (v >= 1e9) return `${(v / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`
  if (v >= 1e4) return `${Math.round(v / 1e3)}K`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(v)
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${shortCount(n)} ${n === 1 ? one : many}`
}

/** Shop-looking round amounts. */
export function niceAmount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n < 100) return Math.max(1, Math.round(n))
  if (n < 1_000) return Math.round(n / 5) * 5
  if (n < 100_000) return Math.round(n / 50) * 50
  if (n < 1_000_000) return Math.round(n / 1_000) * 1_000
  return Math.round(n / 10_000) * 10_000
}

/** Money for headlines: $950, $12K, $1.2M. */
export function money(n: number): string {
  return Math.abs(n) >= 10_000 ? shortMoney(n) : formatMoney(n)
}

// ---------------------------------------------------------------------------
// Local economy

/** Country wealth (purchasing power vs the US = 1). */
export function wealthOf(countryId: string): number {
  return Math.max(0.08, getCountry(countryId).wealth ?? 1)
}

/** What digital things cost locally vs the US (regional pricing): 0.36 in the poorest places, 1+ in rich ones. */
export function priceLevel(countryId: string): number {
  return 0.3 + 0.7 * Math.min(1.25, wealthOf(countryId))
}

/** Online courses and apps use regional pricing. */
export function onlinePrice(g: GameState, usd: number): number {
  return niceAmount(usd * (0.4 + 0.6 * Math.min(1, wealthOf(g.character.countryId))))
}

/** Local services (bootcamps, camps, lawyers): priced by local wages. */
export function localFee(g: GameState, usd: number): number {
  return niceAmount(usd * (0.25 + 0.75 * Math.min(1.3, wealthOf(g.character.countryId))))
}

/** Freelance platforms pay closer to global rates than local wages. */
export function freelanceRateMult(countryId: string): number {
  return 0.35 + 0.65 * Math.min(1.1, wealthOf(countryId))
}

/**
 * A part-time contractor for a year. Store helpers (packers, photographers) earn local wages;
 * developers and designers sell their time on global platforms, so they cost closer to global
 * rates (a cheap local dev team is not a free lunch).
 */
export function contractorCost(countryId: string, type: VentureType = 'saas'): number {
  const local = niceAmount(localPay(countryId, 36_000) * 0.5)
  if (type === 'store') return local
  return Math.max(local, niceAmount(18_000 * freelanceRateMult(countryId)))
}

/**
 * How many customers the home market has for an online business vs the US (population × how
 * many can buy online). Counted in customers, not dollars: customers already pay local prices
 * (custPrice), so spending power is only counted once.
 */
export function homeMarketFactor(countryId: string): number {
  const m = marketOf(countryId)
  const pop = Math.max(0.05, Number.isFinite(m.populationM) ? m.populationM : 10)
  const gdp = Math.max(300, Number.isFinite(m.gdpPerCapita) ? m.gdpPerCapita : 20_000)
  return between(Math.pow(pop / 330, 0.4) * Math.pow(Math.min(1.6, gdp / 65_000), 0.5), 0.01, 2.5)
}

/** Yearly ad budget for a marketing level (0 none ... 3 big), local prices. */
export function adBudget(countryId: string, level: number): number {
  const usd = [0, 1_500, 8_000, 35_000][between(Math.round(level), 0, 3)]
  return niceAmount(usd * (0.3 + 0.7 * Math.min(1.2, wealthOf(countryId))))
}

export const AD_LEVELS = ['No marketing', 'Scrappy marketing', 'Real ad budget', 'Blitzscaling'] as const

/** The data-protection regulator that fines you after a breach (a real local institution or a generic one). */
export function dataRegulator(countryId: string): string {
  const map: Record<string, string> = {
    us: 'the FTC',
    gb: "the Information Commissioner's Office",
    ie: 'the Data Protection Commission',
    fr: 'the CNIL',
    de: 'the federal data protection commissioner',
    it: 'the Garante privacy authority',
    es: 'the AEPD',
    nl: 'the Dutch Data Protection Authority',
    be: 'the Belgian Data Protection Authority',
    se: 'the Swedish Authority for Privacy Protection',
    ca: 'the Privacy Commissioner of Canada',
    au: 'the OAIC',
    nz: 'the Privacy Commissioner',
    in: 'the Data Protection Board of India',
    br: 'the ANPD',
    jp: 'the Personal Information Protection Commission',
    kr: 'the PIPC',
    sg: 'the PDPC',
    za: 'the Information Regulator',
    ng: 'the NDPC',
    ke: 'the Office of the Data Protection Commissioner',
    ph: 'the National Privacy Commission',
    mx: 'the data protection authority',
    id: 'Komdigi, the digital ministry',
    cn: 'the Cyberspace Administration of China',
    ru: 'Roskomnadzor',
    tr: 'the KVKK',
    ae: 'the UAE Data Office',
    sa: 'SDAIA',
    pl: 'the UODO',
    pt: 'the CNPD',
    at: 'the Austrian Data Protection Authority',
    ch: 'the Federal Data Protection Commissioner',
    no: 'Datatilsynet',
    dk: 'Datatilsynet',
    fi: 'the Data Protection Ombudsman',
    il: 'the Privacy Protection Authority',
    ar: 'the AAIP',
    co: 'the SIC',
    th: 'the PDPC',
    my: 'the Personal Data Protection Commissioner',
    hk: 'the Privacy Commissioner for Personal Data',
    ug: 'the Personal Data Protection Office',
    gh: 'the Data Protection Commission',
  }
  return map[countryId] ?? 'the data protection regulator'
}

/** " under GDPR" in the EU/EEA (" under UK GDPR" in the UK), '' elsewhere. */
export function privacyLaw(countryId: string): string {
  const eu = ['at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'no', 'is', 'li']
  return eu.includes(countryId) ? ' under GDPR' : countryId === 'gb' ? ' under UK GDPR' : ''
}

/** Local words that make company names sound local (may be empty). */
export function localNameWords(g: GameState): string[] {
  return localMarket(g).nameWords.filter((w) => typeof w === 'string' && w.trim() !== '' && w.length <= 12).map((w) => w.trim())
}

// ---------------------------------------------------------------------------
// DevState (g.flags.dev)

export interface DevProject {
  id: string
  /** Project kind id (PROJECT_KINDS in dev-projects.ts). */
  kind: string
  name: string
  /** Quality 0-100. */
  q: number
  age: number
  /** Users / downloads / players so far. */
  users: number
  /** Yearly income it still makes (decays). */
  income: number
  /** Lifetime earnings. */
  earned: number
  /** Language id it was written in ('' for none). */
  lang: string
}

export interface DevAward {
  title: string
  org: string
  age: number
  strength: number
  detail: string
}

export interface DevCert {
  title: string
  org: string
  age: number
  strength: number
}

export interface DevExit {
  name: string
  type: string
  age: number
  amount: number
  buyer: string
}

export interface DevFreelance {
  gigs: number
  /** Sum of star ratings (1-5 each). */
  stars: number
  reviews: number
  earned: number
  firstAge: number
  lastAge: number
  /** Clients who never paid. */
  stiffed: number
}

export interface DevState {
  projects: DevProject[]
  awards: DevAward[]
  certs: DevCert[]
  exits: DevExit[]
  shutdowns: number
  freelance: DevFreelance
  /** Times you asked your parents for a computer. */
  asks: number
  /** Screen-time talks from your parents. */
  nags: number
  /** Ventures founded this life. */
  founded: number
  /** Projects shipped this life (including ones no longer listed). */
  shipped: number
}

const MAX_PROJECTS = 12
const MAX_AWARDS = 10

function obj(v: Json | undefined): Record<string, Json> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
}

function arr(v: Json | undefined): Json[] {
  return Array.isArray(v) ? v : []
}

function readProject(v: Json, i: number): DevProject | null {
  const o = obj(v)
  const name = str(o.name)
  if (!name) return null
  return {
    id: str(o.id, `p${i}`),
    kind: str(o.kind, 'website'),
    name,
    q: between(num(o.q, 50), 0, 100),
    age: num(o.age, 0),
    users: whole(num(o.users)),
    income: whole(num(o.income)),
    earned: whole(num(o.earned)),
    lang: str(o.lang),
  }
}

/** Read (and normalize in place) the dev state. Old saves get an empty one. */
export function devState(g: GameState): DevState {
  const o = obj(g.flags.dev)
  const f = obj(o.freelance)
  const s: DevState = {
    projects: arr(o.projects)
      .map(readProject)
      .filter((p): p is DevProject => !!p)
      .slice(-MAX_PROJECTS),
    awards: arr(o.awards)
      .map((v) => {
        const a = obj(v)
        return str(a.title) ? { title: str(a.title), org: str(a.org), age: num(a.age), strength: between(num(a.strength, 3), 1, 10), detail: str(a.detail) } : null
      })
      .filter((a): a is DevAward => !!a)
      .slice(-MAX_AWARDS),
    certs: arr(o.certs)
      .map((v) => {
        const a = obj(v)
        return str(a.title) ? { title: str(a.title), org: str(a.org), age: num(a.age), strength: between(num(a.strength, 3), 1, 10) } : null
      })
      .filter((a): a is DevCert => !!a)
      .slice(-8),
    exits: arr(o.exits)
      .map((v) => {
        const a = obj(v)
        return str(a.name) ? { name: str(a.name), type: str(a.type, 'saas'), age: num(a.age), amount: whole(num(a.amount)), buyer: str(a.buyer) } : null
      })
      .filter((a): a is DevExit => !!a)
      .slice(-8),
    shutdowns: whole(num(o.shutdowns)),
    freelance: {
      gigs: whole(num(f.gigs)),
      stars: whole(num(f.stars)),
      reviews: whole(num(f.reviews)),
      earned: whole(num(f.earned)),
      firstAge: num(f.firstAge, 0),
      lastAge: num(f.lastAge, 0),
      stiffed: whole(num(f.stiffed)),
    },
    asks: whole(num(o.asks)),
    nags: whole(num(o.nags)),
    founded: whole(num(o.founded)),
    shipped: whole(num(o.shipped)),
  }
  return s
}

/** Write the dev state back (always plain JSON). */
export function saveDev(g: GameState, s: DevState): void {
  s.projects = s.projects.slice(-MAX_PROJECTS)
  s.awards = s.awards.slice(-MAX_AWARDS)
  s.certs = s.certs.slice(-8)
  s.exits = s.exits.slice(-8)
  g.flags.dev = toJson(s)
}

/** Read-modify-write helper. */
export function withDev<T>(g: GameState, fn: (s: DevState) => T): T {
  const s = devState(g)
  const out = fn(s)
  saveDev(g, s)
  return out
}

/** Average freelance rating (1-5), or 0 with no reviews. */
export function freelanceRating(s: DevState): number {
  return s.freelance.reviews > 0 ? Math.round((s.freelance.stars / s.freelance.reviews) * 10) / 10 : 0
}

// ---------------------------------------------------------------------------
// Ventures (kind 'venture' assets)

export type VentureType = 'saas' | 'app' | 'store' | 'game'
export const VENTURE_TYPES: VentureType[] = ['saas', 'app', 'store', 'game']

export interface VentureYear {
  /** Calendar year. */
  y: number
  users: number
  revenue: number
  profit: number
}

export interface VentureData {
  type: VentureType
  /** The pitch, e.g. "Invoicing for freelance clowns". */
  idea: string
  /** Base market size for the idea (customers/users worldwide-ish). */
  niche: number
  /** Home market (where it was founded). */
  countryId: string
  stage: 'building' | 'live'
  /** Build progress 0-100 (launches at 100). */
  progress: number
  /** Product quality / reputation 0-100. */
  quality: number
  /** Tech debt 0-100 (slows features, causes outages and churn). */
  debt: number
  /** Customers (SaaS, store), monthly active users (app) or players so far (game). */
  users: number
  peakUsers: number
  /** Pricing tier index 0-2. */
  tier: number
  /** Marketing level 0-3. */
  ad: number
  /** Part-time contractors on the payroll. */
  contractors: number
  /** Your share of the company, 0-1. */
  stake: number
  /** Whole-company valuation. */
  valuation: number
  /** Cash in the company's own account (from investors). */
  cash: number
  /** Fines the company still owes (paid from cash and profits before you see a cent). */
  owed: number
  /** Your own money put in (cost basis for the sale). */
  invested: number
  /** 0.1-1: how far beyond the home market it sells. */
  reach: number
  /** 0-100: short-term buzz (launches, viral moments). */
  hype: number
  /** Product-market fit, 0.08-2.5 (median ~0.6): some ideas just click, most don't. */
  fit: number
  /** Last year's numbers. */
  revenue: number
  costs: number
  profit: number
  /** Monthly revenue run-rate at the end of last year. */
  mrr: number
  prevMrr: number
  /** Expected game sales this year (games' long tail). */
  tail: number
  founded: number
  launchYear: number
  /** The MVP was built by a hired freelancer. */
  hired: boolean
  cofounder: string
  /** Calendar year you last worked on it yourself (years carry over to heirs; ages don't). */
  lastWorked: number
  /** Years in a row you couldn't cover its losses. */
  strain: number
  lastEvent: number
  history: VentureYear[]
}

const TYPE_SET = new Set<string>(VENTURE_TYPES)

export function isVenture(a: Asset): boolean {
  return a.kind === 'venture'
}

/** Indie game ventures live under Special Careers › Game Industry (special/gamedev.ts). */
export function isGameVenture(a: Asset): boolean {
  return isVenture(a) && a.details?.type === 'game'
}

/** The computer's online ventures (SaaS, apps, stores). Indie game ventures are listed in Game Industry. */
export function ventureAssets(g: GameState): Asset[] {
  return g.assets.filter((a) => isVenture(a) && !isGameVenture(a))
}

/** Every venture, games included (the yearly simulation, the CV, the portfolio). */
export function allVentureAssets(g: GameState): Asset[] {
  return g.assets.filter(isVenture)
}

/** Read a venture's data with defaults (never throws, always finite). */
export function readVenture(g: GameState, a: Asset): VentureData {
  const d = a.details ?? {}
  const type = TYPE_SET.has(str(d.type)) ? (str(d.type) as VentureType) : 'saas'
  const hist = arr(d.history)
    .map((v) => {
      const o = obj(v)
      return { y: num(o.y), users: whole(num(o.users)), revenue: whole(num(o.revenue)), profit: Math.round(num(o.profit)) }
    })
    .slice(-10)
  const users = whole(num(d.users))
  return {
    type,
    idea: str(d.idea, a.name),
    niche: Math.max(100, whole(num(d.niche, 10_000))),
    countryId: str(d.countryId, g.character.countryId),
    stage: str(d.stage) === 'building' ? 'building' : 'live',
    progress: between(num(d.progress, 100), 0, 100),
    quality: between(num(d.quality, 50), 0, 100),
    debt: between(num(d.debt, 10), 0, 100),
    users,
    peakUsers: Math.max(users, whole(num(d.peakUsers))),
    tier: between(Math.round(num(d.tier, 1)), 0, 2),
    ad: between(Math.round(num(d.ad, 0)), 0, 3),
    contractors: between(Math.round(num(d.contractors, 0)), 0, 5),
    stake: between(num(d.stake, 1), 0.01, 1),
    valuation: whole(num(d.valuation, a.value)),
    cash: whole(num(d.cash)),
    owed: whole(num(d.owed)),
    invested: whole(num(d.invested, a.purchasePrice)),
    reach: between(num(d.reach, 0.1), 0.05, 1),
    hype: between(num(d.hype, 0), 0, 100),
    fit: between(num(d.fit, 1), 0.08, 2.5),
    revenue: whole(num(d.revenue)),
    costs: whole(num(d.costs)),
    profit: Math.round(num(d.profit)),
    mrr: whole(num(d.mrr)),
    prevMrr: whole(num(d.prevMrr)),
    tail: whole(num(d.tail)),
    founded: num(d.founded, g.year),
    launchYear: num(d.launchYear, 0),
    hired: d.hired === true,
    cofounder: str(d.cofounder),
    lastWorked: num(d.lastWorked, -1),
    strain: whole(num(d.strain)),
    lastEvent: num(d.lastEvent, 0),
    history: hist,
  }
}

/** Write a venture back onto its asset and refresh the asset's value (= valuation × your stake). */
export function writeVenture(a: Asset, v: VentureData): void {
  v.valuation = Math.min(5e9, whole(v.valuation))
  v.users = whole(v.users)
  v.peakUsers = Math.max(v.users, whole(v.peakUsers))
  v.history = v.history.slice(-10)
  a.details = { ...(a.details ?? {}), ...(toJson(v) as Record<string, Json>) }
  a.value = whole(v.valuation * v.stake)
  a.condition = 100
  a.upkeep = 0
}
