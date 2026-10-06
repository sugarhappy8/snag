// Business state: everything about one company lives in its Asset.details (plain JSON), so saves,
// structuredClone, inheritance and net worth all just work. readBiz() gives a normalized copy for
// menus (never writes); bizOf() normalizes in place for actions and yearly hooks.
import type { Industry } from '../data/markets'
import { getCountry } from '../world'
import type { Asset, GameState, Job, Json } from '../types'
import { isDeepTechIndustry } from './deeptech-state'
import { industryDef, isIndustry, type StaffFocus } from './industries'
import { clampN, num, str } from './util'

export interface KeyStaff {
  id: string
  firstName: string
  lastName: string
  gender: 'male' | 'female'
  age: number
  role: string
  focus: StaffFocus
  /** 0-100. */
  skill: number
  /** Yearly salary in dollars. */
  salary: number
  /** Trait id (see flavor.ts STAFF_TRAITS). */
  trait: string
  /** 0-100. */
  morale: number
  years: number
}

/** A group of outlets (trucks, stores, offices...) in one city. */
export interface Outlet {
  countryId: string
  city: string
  count: number
  opened: number
}

export interface Product {
  name: string
  launched: number
  /** Extra demand while fresh, e.g. 0.12 = +12%. */
  boost: number
}

export interface YearRecord {
  year: number
  revenue: number
  profit: number
  tax: number
  units: number
  price: number
  staff: number
  valuation: number
  outlets: number
}

/** Last fiscal year's income statement (all dollars). */
export interface Statement {
  year: number
  demand: number
  sold: number
  produced: number
  spoiled: number
  price: number
  revenue: number
  salesTax: number
  netRevenue: number
  cogs: number
  wages: number
  keyStaff: number
  rent: number
  marketing: number
  interest: number
  upkeep: number
  other: number
  otherIncome: number
  ownerPay: number
  pbt: number
  corpTax: number
  net: number
  cashErosion: number
  cycle: number
  openFraction: number
  employees: number
}

export interface Manager {
  firstName: string
  lastName: string
  gender: 'male' | 'female'
  skill: number
  salary: number
  since: number
}

export type Supplier = 'budget' | 'standard' | 'premium'

export interface BizState {
  v: number
  industry: Industry
  /** Home market (where it was founded and is registered). */
  countryId: string
  /** Headquarters city. */
  city: string
  founded: number
  founderName: string
  acquired: boolean
  /** The owner's share of the company, 0-1. */
  share: number
  /** Money the owner has put in (cost basis for capital gains). */
  invested: number
  /** Company cash (separate from the owner's own money). */
  cash: number
  /** Company debt (bank loans taken by the company). */
  debt: number
  debtRate: number
  /** General staff head count (auto-staffed to the plan). */
  employees: number
  /** Pay policy vs the local going wage (0.85 lean ... 1.3 generous). */
  wageLevel: number
  morale: number
  staff: KeyStaff[]
  quality: number
  brand: number
  /** Home-market selling price this year. */
  price: number
  /** Units planned this year. */
  production: number
  inventory: number
  /** Marketing budget as a multiple of the industry's normal spend (0 - 3). */
  marketingLevel: number
  /** One-year demand boost from campaigns run this year. */
  campaignBoost: number
  products: Product[]
  outlets: Outlet[]
  history: YearRecord[]
  last: Statement | null
  /** Equity value of the whole company (dollars). */
  valuation: number
  public: boolean
  sharesOut: number
  sharePrice: number
  /** Exchange code once listed. */
  exchange: string
  ipoYear: number
  ceo: 'owner' | 'manager'
  manager: Manager | null
  /** Salary the owner draws while CEO. */
  ownerSalary: number
  supplier: Supplier
  insured: boolean
  /** Years of cooked books not yet caught (inflates the valuation). */
  cooked: number
  /** Competitor pressure, 0-0.4 (decays every year). */
  pressure: number
  /** Next year's unit-cost multiplier from a supplier shock (1 = none). */
  costShock: number
  /** Next year's demand multiplier from an event (1 = none). */
  demandShock: number
  /** Share of next year's capacity lost to strikes or disasters (0-0.8). */
  capacityLoss: number
  /** Share of the coming year the doors are open (registration delays). */
  openFraction: number
  /** One-off costs paid out of company cash this year (campaigns, R&D, fines...). */
  yearCosts: number
  /** One-off income this year (insurance payouts, settlements won...). */
  yearIncome: number
  /** Last year staff got a general raise (inflation catch-up). */
  raiseYear: number
  lastEvent: number
  /** Linked personal business loan (founding loan), if any. */
  loanId: string
  /** Consecutive years the profit fell (board patience when public). */
  slump: number
  /** Game studios only: the pipeline and back catalog (business/gamestudio-state.ts). */
  studio?: Json
  /** Deep-tech companies only: R&D, tech level, funding rounds (business/deeptech-state.ts). */
  tech?: Json
}

export const BIZ_VERSION = 1

export function isBusinessAsset(a: Asset): boolean {
  return a.kind === 'business' && isIndustry(a.details.industry)
}

export function businessAssets(g: GameState): Asset[] {
  return g.assets.filter(isBusinessAsset)
}

function arr<T>(v: Json | undefined, ok: (x: Record<string, Json>) => T | null): T[] {
  if (!Array.isArray(v)) return []
  const out: T[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue
    const t = ok(x)
    if (t) out.push(t)
  }
  return out
}

function readStaff(x: Record<string, Json>): KeyStaff | null {
  const role = str(x.role)
  if (!role) return null
  const focus = str(x.focus)
  return {
    id: str(x.id, `s${role}`),
    firstName: str(x.firstName, 'Alex'),
    lastName: str(x.lastName, 'Smith'),
    gender: x.gender === 'female' ? 'female' : 'male',
    age: clampN(num(x.age, 35), 18, 90),
    role,
    focus: focus === 'quality' || focus === 'sales' || focus === 'finance' || focus === 'ops' ? focus : 'ops',
    skill: clampN(num(x.skill, 50), 0, 100),
    salary: Math.max(0, num(x.salary)),
    trait: str(x.trait, 'steady'),
    morale: clampN(num(x.morale, 60), 0, 100),
    years: Math.max(0, num(x.years)),
  }
}

function readOutlet(x: Record<string, Json>): Outlet | null {
  const countryId = str(x.countryId)
  const city = str(x.city)
  const count = Math.round(num(x.count, 1))
  if (!countryId || !city || count <= 0) return null
  return { countryId, city, count, opened: num(x.opened) }
}

function readProduct(x: Record<string, Json>): Product | null {
  const name = str(x.name)
  if (!name) return null
  return { name, launched: num(x.launched), boost: clampN(num(x.boost, 0.05), 0, 0.5) }
}

function readRecord(x: Record<string, Json>): YearRecord | null {
  if (typeof x.year !== 'number') return null
  return {
    year: x.year,
    revenue: num(x.revenue),
    profit: num(x.profit),
    tax: num(x.tax),
    units: num(x.units),
    price: num(x.price),
    staff: num(x.staff),
    valuation: num(x.valuation),
    outlets: num(x.outlets, 1),
  }
}

const STATEMENT_KEYS: (keyof Statement)[] = [
  'year', 'demand', 'sold', 'produced', 'spoiled', 'price', 'revenue', 'salesTax', 'netRevenue', 'cogs', 'wages', 'keyStaff', 'rent', 'marketing',
  'interest', 'upkeep', 'other', 'otherIncome', 'ownerPay', 'pbt', 'corpTax', 'net', 'cashErosion', 'cycle', 'openFraction', 'employees',
]

function readStatement(v: Json | undefined): Statement | null {
  if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.year !== 'number') return null
  const out = {} as Record<keyof Statement, number>
  for (const k of STATEMENT_KEYS) out[k] = num(v[k])
  return out as Statement
}

function readManager(v: Json | undefined): Manager | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return {
    firstName: str(v.firstName, 'Pat'),
    lastName: str(v.lastName, 'Morgan'),
    gender: v.gender === 'female' ? 'female' : 'male',
    skill: clampN(num(v.skill, 55), 0, 100),
    salary: Math.max(0, num(v.salary)),
    since: num(v.since),
  }
}

/** A complete, sane BizState from whatever is stored (old saves, partial data). */
export function normalizeBiz(d: Record<string, Json>, fallbackYear: number): BizState {
  const industry = (isIndustry(d.industry) ? d.industry : 'restaurant') as Industry
  const def = industryDef(industry)
  const countryId = str(d.countryId, 'us')
  const country = getCountry(countryId)
  const city = str(d.city, country.cities[0] ?? 'the capital')
  let outlets = arr(d.outlets, readOutlet)
  if (outlets.length === 0) outlets = [{ countryId, city, count: 1, opened: num(d.founded, fallbackYear) }]
  const supplier = d.supplier === 'budget' || d.supplier === 'premium' ? d.supplier : 'standard'
  return {
    v: BIZ_VERSION,
    industry,
    countryId,
    city,
    founded: num(d.founded, fallbackYear),
    founderName: str(d.founderName),
    acquired: d.acquired === true,
    share: clampN(num(d.share, 1), 0.01, 1),
    invested: Math.max(0, num(d.invested)),
    cash: num(d.cash),
    debt: Math.max(0, num(d.debt)),
    debtRate: clampN(num(d.debtRate, 0.08), 0, 0.6),
    employees: Math.max(0, Math.round(num(d.employees, def.staff))),
    wageLevel: clampN(num(d.wageLevel, 1), 0.7, 1.5),
    morale: clampN(num(d.morale, 65), 0, 100),
    staff: arr(d.staff, readStaff),
    quality: clampN(num(d.quality, 50), 0, 100),
    brand: clampN(num(d.brand, 25), 0, 100),
    price: Math.max(0, num(d.price)),
    production: Math.max(0, Math.round(num(d.production))),
    inventory: Math.max(0, Math.round(num(d.inventory))),
    marketingLevel: clampN(num(d.marketingLevel, 1), 0, 3),
    campaignBoost: clampN(num(d.campaignBoost), 0, 0.6),
    products: arr(d.products, readProduct),
    outlets,
    history: arr(d.history, readRecord).slice(-12),
    last: readStatement(d.last),
    valuation: Math.max(0, num(d.valuation)),
    public: d.public === true,
    sharesOut: Math.max(0, num(d.sharesOut)),
    sharePrice: Math.max(0, num(d.sharePrice)),
    exchange: str(d.exchange),
    ipoYear: num(d.ipoYear),
    ceo: d.ceo === 'manager' ? 'manager' : 'owner',
    manager: readManager(d.manager),
    ownerSalary: Math.max(0, num(d.ownerSalary)),
    supplier,
    insured: d.insured === true,
    cooked: Math.max(0, num(d.cooked)),
    pressure: clampN(num(d.pressure), 0, 0.4),
    costShock: clampN(num(d.costShock, 1), 0.5, 2),
    demandShock: clampN(num(d.demandShock, 1), 0.3, 2),
    capacityLoss: clampN(num(d.capacityLoss), 0, 0.8),
    openFraction: clampN(num(d.openFraction, 1), 0.1, 1),
    yearCosts: Math.max(0, num(d.yearCosts)),
    yearIncome: Math.max(0, num(d.yearIncome)),
    raiseYear: num(d.raiseYear),
    lastEvent: num(d.lastEvent),
    loanId: str(d.loanId),
    slump: Math.max(0, num(d.slump)),
    ...(industry === 'gameStudio' && d.studio && typeof d.studio === 'object' && !Array.isArray(d.studio) ? { studio: d.studio } : {}),
    ...(isDeepTechIndustry(industry) && d.tech && typeof d.tech === 'object' && !Array.isArray(d.tech) ? { tech: d.tech } : {}),
  }
}

/** Normalized read-only copy for display code. */
export function readBiz(g: GameState, a: Asset): BizState {
  return normalizeBiz(a.details, g.year)
}

/**
 * Mutable view: normalizes the stored details in place (once) and returns them typed.
 * Only call from actions, scripts and yearly hooks.
 */
export function bizOf(g: GameState, a: Asset): BizState {
  if (num(a.details.v) !== BIZ_VERSION || !Array.isArray(a.details.outlets)) {
    const n = normalizeBiz(a.details, g.year)
    for (const k of Object.keys(a.details)) delete a.details[k]
    Object.assign(a.details, n as unknown as Record<string, Json>)
  }
  return a.details as unknown as BizState
}

export function totalOutlets(b: BizState): number {
  return b.outlets.reduce((s, o) => s + o.count, 0)
}

export function bizCountryName(countryId: string): string {
  return getCountry(countryId).name
}

/** 'Osaka, Japan'. */
export function bizLocation(b: BizState): string {
  return `${b.city}, ${bizCountryName(b.countryId)}`
}

/** The owner's stake of the valuation, which is what the asset is worth to them. */
export function stakeValue(b: BizState): number {
  const v = Math.round(b.valuation * b.share)
  return Number.isFinite(v) ? Math.max(0, v) : 0
}

// ---------------------------------------------------------------------------
// The CEO job

export const OWNER_JOB = 'business_owner'

/** The player's job if it is running this business (or any business when id is omitted). */
export function ceoJob(g: GameState, assetId?: string): Job | null {
  const j = g.character.job
  if (!j || j.defId !== OWNER_JOB || j.category !== 'special') return null
  if (assetId && j.data.assetId !== assetId) return null
  return j
}

/** True when the player personally runs this business right now. */
export function runsIt(g: GameState, a: Asset): boolean {
  return !!ceoJob(g, a.id) && a.details.ceo !== 'manager'
}

export function findBusiness(g: GameState, id: string | undefined): Asset | undefined {
  if (!id) return undefined
  return g.assets.find((a) => a.id === id && isBusinessAsset(a))
}
