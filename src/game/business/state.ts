// Business state: everything about one company lives in its Asset.details (plain JSON), so saves,
// structuredClone, inheritance and net worth all just work. readBiz() gives a normalized copy for
// menus (never writes); bizOf() normalizes in place for actions and yearly hooks.
import type { Industry } from '../data/markets'
import { getCountry } from '../world'
import type { Asset, GameState, Job, Json } from '../types'
import { isDeepTechIndustry } from './deeptech-state'
import { sameRole } from './era'
import { industryDef, isIndustry, type StaffFocus } from './industries'
import { clampN, num, rec, str } from './util'

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

/**
 * A product in development (business/rd.ts): its whole budget is paid when it starts; it is
 * finished after `years` booked years and then works (a new product line) or flops.
 */
export interface RdProject {
  id: string
  /** The product idea being developed. */
  name: string
  /** Dollars spent on it (paid up front). */
  budget: number
  /** Booked years of work it needs (1-4). */
  years: number
  /** Booked years done so far. */
  progress: number
  /** Chance it works when it is done (fixed when it starts). */
  odds: number
  /** Demand boost of the product line if it works (fixed when it starts). */
  boost: number
  /** Calendar year it started. */
  started: number
}

/** Storage guards only (the economics stop growth long before): newest lines and projects are kept. */
export const MAX_STORED_PRODUCTS = 400
export const MAX_STORED_PROJECTS = 120

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
  /** Included in otherIncome, never additional cash on reload. */
  strategicIncome?: number
  ownerPay: number
  pbt: number
  corpTax: number
  net: number
  cashErosion: number
  cycle: number
  openFraction: number
  employees: number
}

/**
 * How a hired CEO leans when choices are close (business/board-ceo.ts): growers build, cost-cutters
 * trim, steady hands keep what works, visionaries bet on new products and new markets.
 */
export type CeoStyle = 'grower' | 'costCutter' | 'steady' | 'visionary'

export const CEO_STYLES: readonly CeoStyle[] = ['grower', 'costCutter', 'steady', 'visionary']

export interface Manager {
  /** Vested fraction granted to this CEO; ownership is deducted when awarded. */
  equity?: number
  /** Vested group shares awarded instead of subsidiary shares, with company-equivalent credit. */
  groupEquity?: { id: string; share: number; credit: number }
  /** Year an outstanding equity request was first made. */
  equityAsked?: number
  firstName: string
  lastName: string
  gender: 'male' | 'female'
  skill: number
  salary: number
  since: number
  /** Missing on old saves (read it with career.styleOf: 'steady'). */
  style?: CeoStyle
  /** 0-100, how straight they play (rogue-CEO risk). Missing on old saves (career.integrityOf: 70). */
  integrity?: number
  /** Last profit bonus paid (dollars). */
  bonus?: number
  /** Calendar year they last asked for a raise. */
  asked?: number
  /**
   * The relative who is CEO (business/nepo.ts): Person.id. Their real skill and pay live in the
   * Person's family job and are copied here every year. Missing for an outside hire.
   */
  personId?: string
}

/** Any actual vested stake secures loyalty; retention credit alone is not ownership. */
export function hasExecutiveShares(manager: Manager | null | undefined): boolean {
  return (manager?.equity ?? 0) > 0 || (manager?.groupEquity?.share ?? 0) > 0
}

export type Supplier = 'budget' | 'standard' | 'premium'

/** New issuance dilutes executives just like the owner's common shares. */
export function diluteManagerEquity(manager: Manager | null, retained: number): void {
  if (!manager?.equity) return
  manager.equity *= clampN(retained, 0, 1)
  delete manager.equityAsked
}

/** All vested company grants, including former executives, remain outside the sale pool. */
export function executiveEquity(b: BizState): number {
  return clampN(Math.max(b.executiveEquity ?? 0, b.manager?.equity ?? 0), 0, 1)
}
export function diluteBusinessEquity(b: BizState, retained: number): void {
  b.executiveEquity = executiveEquity(b) * clampN(retained, 0, 1)
  diluteManagerEquity(b.manager, retained)
}

export interface BizState {
  /** Annual national strategy, market studies and inventor projects (dynamics.ts). */
  expansion?: Json
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
  /**
   * Outside investors' liquidation preference (1x, non-participating): on a sale or closure they
   * take their money back first, or their share of the proceeds if that's more. Cleared at an IPO.
   * Missing (0) when nobody outside holds preferred shares.
   */
  pref?: number
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
  /** Funded critical-input inventory, separate from already manufactured finished goods. */
  supply?: Json
  /** Exact, bounded attribution of the last settled year-on-year profit change. */
  economicReport?: Json
  /** Marketing budget as a multiple of the industry's normal spend (0 - 3). */
  marketingLevel: number
  /** One-year demand boost from campaigns run this year. */
  campaignBoost: number
  products: Product[]
  /** Products in development (missing on old saves: read it with rd.ts rdProjects). */
  rd?: RdProject[]
  outlets: Outlet[]
  /**
   * Extra production capacity at the home site: production lines, ovens, sewing lines,
   * greenhouse blocks... (industries with IndustryDef.line). Missing on old saves (0).
   */
  lines?: number
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
  /** Vested company shares across current and dismissed executives. */
  executiveEquity?: number
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
  /**
   * Governance (business/board-state.ts readBoard): the board of directors when the company has
   * one, the hired CEO's mandate and limits, recent votes and CEO churn. Missing on old saves.
   */
  board?: Json
  /** Game studios only: the pipeline and back catalog (business/gamestudio-state.ts). */
  studio?: Json
  /** Deep-tech companies only: R&D, tech level, funding rounds (business/deeptech-state.ts). */
  tech?: Json
  /** Segregated financial-institution client books (not shareholder cash/equity). */
  financeFirm?: Json
  /** Owner conversations and licensed entertainment operations (venues.ts). */
  venueOwner?: Json
  /** Opt-in professionally reviewed automatic succession readiness policy. */
  successionReview?: Json
  /** Individually priced manufactured inventions, separate from industry-wide boosts. */
  inventionProducts?: Json
  /** Auto-staffed fab head count, included in employees; prevents cumulative rehiring. */
  inventionStaff?: number
  /** Outside manufacturing contracts and their latest corporate tax-location booking. */
  inventionLicenses?: Json
  inventionLicenseSettlement?: Json
  /** Market position: share, rivals, installed base, antitrust (business/competition-state.ts). */
  market?: Json
  /**
   * Conglomerate membership and a copy of the group's record (business/conglomerate-state.ts
   * readMembership). Missing for a company that stands alone (and on old saves).
   */
  group?: Json
  /**
   * Family at the company (business/nepo-state.ts readFamily): the designated successor, staff
   * resentment, the "nepo baby" label and the press. Missing when no relative ever worked here.
   */
  family?: Json
}

export const BIZ_VERSION = 2

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
    age: Math.round(clampN(num(x.age, 35), 18, 90)),
    role,
    focus: focus === 'quality' || focus === 'sales' || focus === 'finance' || focus === 'ops' ? focus : 'ops',
    skill: clampN(num(x.skill, 50), 0, 100),
    salary: Math.max(0, num(x.salary)),
    trait: str(x.trait, 'steady'),
    morale: clampN(num(x.morale, 60), 0, 100),
    years: Math.max(0, Math.round(num(x.years))),
  }
}

function readOutlet(x: Record<string, Json>): Outlet | null {
  const countryId = str(x.countryId)
  const city = str(x.city)
  const count = Math.round(num(x.count, 1))
  if (!countryId || !city || count <= 0) return null
  return { countryId, city, count, opened: Math.round(num(x.opened)) }
}

function readProduct(x: Record<string, Json>): Product | null {
  const name = str(x.name)
  if (!name) return null
  return { name, launched: Math.round(num(x.launched)), boost: clampN(num(x.boost, 0.05), 0, 0.5) }
}

function readProject(x: Record<string, Json>): RdProject | null {
  const name = str(x.name)
  if (!name) return null
  const years = Math.round(clampN(num(x.years, 1), 1, 4))
  return {
    id: str(x.id, `rd.${name}`),
    name,
    budget: Math.max(0, num(x.budget)),
    years,
    progress: clampN(num(x.progress), 0, years),
    odds: clampN(num(x.odds, 0.5), 0.02, 0.98),
    boost: clampN(num(x.boost, 0.05), 0, 0.5),
    started: Math.round(num(x.started)),
  }
}

/** R&D projects stored on a business (old saves have none). */
export function readProjects(v: Json | undefined): RdProject[] {
  return arr(v, readProject).slice(-MAX_STORED_PROJECTS)
}

function readRecord(x: Record<string, Json>): YearRecord | null {
  if (typeof x.year !== 'number' || !Number.isFinite(x.year)) return null
  return {
    year: Math.round(x.year),
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
  if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.year !== 'number' || !Number.isFinite(v.year)) return null
  const out = {} as Record<keyof Statement, number>
  for (const k of STATEMENT_KEYS) out[k] = num(v[k])
  if (typeof v.strategicIncome === 'number') out.strategicIncome = Math.max(0, num(v.strategicIncome))
  out.year = Math.round(out.year)
  return out as Statement
}

function readManager(v: Json | undefined): Manager | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const style = CEO_STYLES.find((x) => x === v.style)
  return {
    firstName: str(v.firstName, 'Pat'),
    lastName: str(v.lastName, 'Morgan'),
    gender: v.gender === 'female' ? 'female' : 'male',
    skill: clampN(num(v.skill, 55), 0, 100),
    salary: Math.max(0, num(v.salary)),
    since: Math.round(num(v.since)),
    ...(typeof v.equity === 'number' ? { equity: clampN(num(v.equity), 0, .5) } : {}),
    ...(v.groupEquity && typeof v.groupEquity === 'object' && !Array.isArray(v.groupEquity) && str(v.groupEquity.id) ? { groupEquity: { id: str(v.groupEquity.id), share: clampN(num(v.groupEquity.share), 0, .999), credit: clampN(num(v.groupEquity.credit), 0, .5) } } : {}),
    ...(typeof v.equityAsked === 'number' ? { equityAsked: Math.round(num(v.equityAsked)) } : {}),
    ...(style ? { style } : {}),
    ...(typeof v.integrity === 'number' ? { integrity: clampN(num(v.integrity, 70), 0, 100) } : {}),
    ...(num(v.bonus) > 0 ? { bonus: Math.round(num(v.bonus)) } : {}),
    ...(typeof v.asked === 'number' ? { asked: Math.round(num(v.asked)) } : {}),
    ...(str(v.personId) ? { personId: str(v.personId) } : {}),
  }
}

/** A complete, sane BizState from whatever is stored (old saves, partial data). */
export function normalizeBiz(d: Record<string, Json>, fallbackYear: number): BizState {
  const industry = (isIndustry(d.industry) ? d.industry : 'restaurant') as Industry
  const def = industryDef(industry)
  const countryId = str(d.countryId, 'us')
  const country = getCountry(countryId)
  const city = str(d.city, country.cities[0] ?? 'the capital')
  const outletMap = new Map<string, Outlet>()
  for (const outlet of arr(d.outlets, readOutlet)) {
    const key = `${outlet.countryId}\u0000${outlet.city}`
    const old = outletMap.get(key)
    if (old) {
      old.count = Math.min(1_000_000_000, old.count + outlet.count)
      old.opened = Math.min(old.opened, outlet.opened)
    } else outletMap.set(key, outlet)
  }
  let outlets = [...outletMap.values()]
  if (outlets.length === 0) outlets = [{ countryId, city, count: 1, opened: Math.round(num(d.founded, fallbackYear)) }]
  const staffIds = new Set<string>(), staffRoles = new Set<string>()
  const staff = arr(d.staff, readStaff).filter((person) => {
    const role = def.roles.find((r) => sameRole(person.role, r.title))?.title ?? person.role
    if (staffIds.has(person.id) || staffRoles.has(role)) return false
    staffIds.add(person.id); staffRoles.add(role)
    return true
  })
  const productNames = new Set<string>()
  const products = arr(d.products, readProduct).filter((product) => !productNames.has(product.name) && !!productNames.add(product.name)).slice(-MAX_STORED_PRODUCTS)
  const projectIds = new Set<string>(), projectNames = new Set<string>()
  const projects = readProjects(d.rd).filter((project) => {
    const duplicate = projectIds.has(project.id) || projectNames.has(project.name)
    projectIds.add(project.id); projectNames.add(project.name)
    return !duplicate && !productNames.has(project.name)
  })
  const historyByYear = new Map<number, YearRecord>()
  for (const row of arr(d.history, readRecord)) {
    // A damaged/replayed save can contain the same fiscal year twice. Keep the newest copy and
    // its position so valuation and board reviews never count one year more than once.
    historyByYear.delete(row.year)
    historyByYear.set(row.year, row)
  }
  const history = [...historyByYear.values()].slice(-12)
  const supplier = d.supplier === 'budget' || d.supplier === 'premium' ? d.supplier : 'standard'
  return {
    v: BIZ_VERSION,
    industry,
    countryId,
    city,
    founded: Math.round(num(d.founded, fallbackYear)),
    founderName: str(d.founderName),
    acquired: d.acquired === true,
    share: clampN(num(d.share, 1), 0.01, 1),
    invested: Math.max(0, num(d.invested)),
    pref: Math.max(0, num(d.pref)),
    cash: num(d.cash),
    debt: Math.max(0, num(d.debt)),
    debtRate: clampN(num(d.debtRate, 0.08), 0, 0.6),
    employees: Math.max(0, Math.round(num(d.employees, def.staff))),
    wageLevel: clampN(num(d.wageLevel, 1), 0.7, 1.5),
    morale: clampN(num(d.morale, 65), 0, 100),
    staff,
    quality: clampN(num(d.quality, 50), 0, 100),
    brand: clampN(num(d.brand, 25), 0, 100),
    price: Math.max(0, num(d.price)),
    production: Math.max(0, Math.round(num(d.production))),
    inventory: Math.max(0, Math.round(num(d.inventory))),
    ...(d.supply && typeof d.supply === 'object' && !Array.isArray(d.supply) ? { supply: d.supply } : {}),
    ...(d.economicReport && typeof d.economicReport === 'object' && !Array.isArray(d.economicReport) ? { economicReport: d.economicReport } : {}),
    marketingLevel: clampN(num(d.marketingLevel, 1), 0, 3),
    campaignBoost: clampN(num(d.campaignBoost), 0, 0.6),
    products,
    ...(Array.isArray(d.rd) ? { rd: projects } : {}),
    outlets,
    ...(num(d.lines) >= 1 ? { lines: Math.round(clampN(num(d.lines), 0, 1e9)) } : {}),
    history,
    last: readStatement(d.last),
    valuation: Math.max(0, num(d.valuation)),
    public: d.public === true,
    sharesOut: Math.max(0, num(d.sharesOut)),
    sharePrice: Math.max(0, num(d.sharePrice)),
    exchange: str(d.exchange),
    ipoYear: Math.round(num(d.ipoYear)),
    ceo: d.ceo === 'manager' ? 'manager' : 'owner',
    manager: readManager(d.manager),
    executiveEquity: clampN(num(d.executiveEquity, num(rec(d.manager)?.equity)), 0, 1),
    ownerSalary: Math.max(0, num(d.ownerSalary)),
    supplier,
    insured: d.insured === true,
    cooked: Math.max(0, num(d.cooked)),
    pressure: clampN(num(d.pressure), 0, 0.4),
    costShock: clampN(num(d.costShock, 1), 0.5, 2),
    demandShock: clampN(num(d.demandShock, 1), 0.3, 2),
    capacityLoss: clampN(num(d.capacityLoss), 0, 0.8),
    openFraction: clampN(num(d.openFraction, 1), 0, 1),
    yearCosts: Math.max(0, num(d.yearCosts)),
    yearIncome: Math.max(0, num(d.yearIncome)),
    raiseYear: Math.round(num(d.raiseYear)),
    lastEvent: Math.round(num(d.lastEvent)),
    loanId: str(d.loanId),
    slump: Math.max(0, num(d.slump)),
    ...(d.board && typeof d.board === 'object' && !Array.isArray(d.board) ? { board: d.board } : {}),
    ...(d.successionReview && typeof d.successionReview === 'object' && !Array.isArray(d.successionReview) ? { successionReview: d.successionReview } : {}),
    ...(industry === 'gameStudio' && d.studio && typeof d.studio === 'object' && !Array.isArray(d.studio) ? { studio: d.studio } : {}),
    ...(isDeepTechIndustry(industry) && d.tech && typeof d.tech === 'object' && !Array.isArray(d.tech) ? { tech: d.tech } : {}),
    ...(d.financeFirm && typeof d.financeFirm === 'object' && !Array.isArray(d.financeFirm) ? { financeFirm: d.financeFirm } : {}),
    ...(d.venueOwner && typeof d.venueOwner === 'object' && !Array.isArray(d.venueOwner) ? { venueOwner: d.venueOwner } : {}),
    ...(d.inventionProducts && typeof d.inventionProducts === 'object' ? { inventionProducts: d.inventionProducts } : {}),
    ...(typeof d.inventionStaff === 'number' ? { inventionStaff: Math.floor(clampN(num(d.inventionStaff), 0, 1e9)) } : {}),
    ...(Array.isArray(d.inventionLicenses) ? { inventionLicenses: d.inventionLicenses } : {}),
    ...(d.inventionLicenseSettlement && typeof d.inventionLicenseSettlement === 'object' && !Array.isArray(d.inventionLicenseSettlement) ? { inventionLicenseSettlement: d.inventionLicenseSettlement } : {}),
    ...(d.market && typeof d.market === 'object' && !Array.isArray(d.market) ? { market: d.market } : {}),
    ...(d.group && typeof d.group === 'object' && !Array.isArray(d.group) && typeof d.group.id === 'string' && d.group.id ? { group: d.group } : {}),
    ...(d.family && typeof d.family === 'object' && !Array.isArray(d.family) ? { family: d.family } : {}),
    ...(d.expansion && typeof d.expansion === 'object' && !Array.isArray(d.expansion) ? { expansion: d.expansion } : {}),
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

/**
 * The group's value multiplier for a member company (the conglomerate discount, or what the
 * market pays for a listed group): 1 for a company that stands alone.
 */
export function groupMultOf(b: Pick<BizState, 'group'>): number {
  const d = b.group
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 1
  const core = d.core
  const m = core && typeof core === 'object' && !Array.isArray(core) ? core.mult : undefined
  return typeof m === 'number' && Number.isFinite(m) ? clampN(m, 0.3, 3) : 1
}

/**
 * The owner's stake of the valuation, which is what the asset is worth to them. In a group the
 * group's multiplier applies to the company's operating value (cash and debt count at face value).
 */
export function stakeValue(b: BizState): number {
  const mult = groupMultOf(b)
  const operating = mult === 1 ? 0 : Math.max(0, b.valuation - (b.cash - b.debt))
  const v = Math.round((b.valuation + (mult - 1) * operating) * b.share)
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
