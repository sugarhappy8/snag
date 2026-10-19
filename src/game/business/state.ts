// Business state: everything about one company lives in its Asset.details (plain JSON), so saves,
// structuredClone, inheritance and net worth all just work. readBiz() gives a normalized copy for
// menus (never writes); bizOf() normalizes in place for actions and yearly hooks.
import type { Industry } from '../data/markets'
import { getCountry } from '../world'
import type { Asset, GameState, Job, Json } from '../types'
import { isDeepTechIndustry } from './deeptech-state'
import { sameRole } from './era'
import { breakthroughByName } from './heavy-data'
import { companyHedgeField, type CompanyHedge } from './hedge-record'
import { industryDef, isIndustry, type StaffFocus } from './industries'
import { clampN, num, rec, str } from './util'
import { readFamilyShares } from './family-share-state'
import { dividendField, type DividendPolicy } from './dividend-policy'

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
  /** First year it is on sale. */
  launched: number
  /** Old saves: the line's demand boost (its quality is derived from it when `quality` is missing). */
  boost: number
  /** 0-100: how good this line is against the rivals' versions of it (fixed at launch). */
  quality?: number
  /** The classic kind of product it belongs to ('Street Lighting' for 'Street Lighting Mk II'). */
  family?: string
  /** What sort of line it is within its kind (product-market.ts LineKind). */
  kind?: 'core' | 'next' | 'premium' | 'value' | 'regional' | 'bundle' | 'addon' | 'breakthrough'
  /** Who made it, when it wasn't the company's own R&D (a rival bought out). */
  from?: string
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
  /** Old saves: the demand boost it was funded for (its quality is derived from it when `quality` is missing). */
  boost: number
  /** Expected quality of the line if it works (fixed when it starts; the launch rolls around it). */
  quality?: number
  /** Kind of product and sort of line (product-market.ts). */
  family?: string
  kind?: Product['kind']
  /** Heavy R&D (heavy-rd.ts): a breakthrough project, paid up front, 4 to 6 years. Missing on ordinary projects and old saves. */
  heavy?: true
  /** What a heavy project cost, paid when it started (it is what the pioneer's record keeps). */
  cost?: number
  /** Calendar year it started. */
  started: number
}

/** Storage guards only (the economics stop growth long before): newest lines and projects are kept. */
export const MAX_STORED_PRODUCTS = 400
export const MAX_STORED_PROJECTS = 120
/** The longest line name the retired list keeps. */
export const MAX_RETIRED_NAME = 80

/**
 * A stored list of retired line names, cleaned: strings only, trimmed, 1 to MAX_RETIRED_NAME
 * characters, no repeats (a name retired again moves to the newest spot), the newest
 * MAX_STORED_PRODUCTS kept. Anything that is not a list reads as none.
 */
export function readRetired(v: Json | undefined): string[] {
  if (!Array.isArray(v)) return []
  const names = new Set<string>()
  for (const x of v) {
    if (typeof x !== 'string') continue
    const name = x.trim()
    if (!name || name.length > MAX_RETIRED_NAME) continue
    names.delete(name)
    names.add(name)
  }
  return [...names].slice(-MAX_STORED_PRODUCTS)
}

/** The retired line names of a company (a missing or damaged field reads as none). */
export function retiredOf(b: { retired?: readonly string[] }): readonly string[] {
  return Array.isArray(b.retired) ? b.retired : []
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

/** Specialist background shown for CEOs of banks and investment firms. */
export type FinanceSpecialty = 'asset' | 'hedge' | 'vc' | 'broker' | 'bank' | 'generalist'
export type FinanceApproach = 'systematic' | 'fundamental' | 'growth' | 'macro' | 'event' | 'client' | 'risk'
export type FinanceRisk = 'cautious' | 'balanced' | 'bold'

export const FINANCE_SPECIALTIES: readonly FinanceSpecialty[] = ['asset', 'hedge', 'vc', 'broker', 'bank', 'generalist']
export const FINANCE_APPROACHES: readonly FinanceApproach[] = ['systematic', 'fundamental', 'growth', 'macro', 'event', 'client', 'risk']
export const FINANCE_RISKS: readonly FinanceRisk[] = ['cautious', 'balanced', 'bold']

export interface FinanceProfile {
  specialty: FinanceSpecialty
  approach: FinanceApproach
  risk: FinanceRisk
  /** 0-100 résumé score from earlier work, not a promise of future returns. */
  record: number
}

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
  /** Banking/investment experience. Missing on old saves and ordinary-company CEOs. */
  finance?: FinanceProfile
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
  for (const holder of b.familyShares ?? []) holder.share *= clampN(retained, 0, 1)
  b.executiveEquity = executiveEquity(b) * clampN(retained, 0, 1)
  diluteManagerEquity(b.manager, retained)
  // New shares are ordinary ones: the founders' class shrinks with the owner's part (share-classes.ts).
  const plan = readClasses(b.classes)
  if (plan) b.classes = { kind: plan.kind, hi: plan.hi * clampN(retained, 0, 1) }
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
  npcOwnerId?: string
  familyShares?: import('./family-share-state').FamilyShare[]
  acquired: boolean
  /**
   * When the player bought it off the market: the calendar year and what the business itself cost
   * (the price less the net cash it came with). Until it books a year under its new owner, buyers
   * offer no more than that (manage.ts makeOffers). Missing on companies founded or from old saves.
   */
  bought?: { year: number; operating: number }
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
  /**
   * Exact names of the lines the player retired on purpose, newest last (rd.ts rememberRetired).
   * R&D never offers them again. Missing on old saves and on companies that never retired a line.
   */
  retired?: string[]
  /** Year the last Heavy R&D project launched or flopped: the five-year wait for the next one starts there. Missing: never had one. */
  heavyLast?: number
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
  /** A private company's chosen share count (share-structure.ts); sharesOut takes over at the IPO. */
  shareCount?: number
  /** Exchange code once listed. */
  exchange: string
  ipoYear: number
  /** The four-letter ticker given at the listing. Missing on old saves: read it with listing-id.ts tickerOf. */
  ticker?: string
  /** The offer price at the listing, for "since the IPO". Missing on old saves and on companies that left a wound-up group. */
  ipoPrice?: number
  /**
   * The share structure the owner chose (business/share-classes.ts): the plan for the IPO while the
   * company is private, the live structure while it is listed. Missing means one class. Read it
   * with readClasses, never trust the field.
   */
  classes?: ClassPlan
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
  /** Owner bonuses taken this year (already inside yearCosts); perfect foresight never refills them. */
  ownerDraws?: number
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
  /** Confidential company-owned financial systems, never patents or saleable products. */
  closedInventions?: Json
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
  /** Company milestones reached (business/milestones.ts readMilestones). Missing on old saves. */
  milestones?: Json
  /** Cash at work in a hedge fund (business/hedge-record.ts readCompanyHedge). Missing: none. Read it with readCompanyHedge, never raw. */
  hedge?: CompanyHedge
  /** Franchise network (business/franchise.ts readFranchise). Missing until the first franchise is sold. */
  franchise?: Json
  /** Research lab: Operations R&D, team, patents, credit ledger (business/lab-state.ts readLab). Missing until the lab first books something. Read it with readLab, write it with saveLab. */
  lab?: Json
  /** Yearly dividend rule (business/dividend-policy.ts). Missing: none set. Read it with readDividend, never raw. */
  dividend?: DividendPolicy
}

export const BIZ_VERSION = 2

/** A ticker is exactly four capital letters. */
export function isTicker(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Z]{4}$/.test(v)
}

/** 'ab': the founders' class carries ten votes a share and the public's one. 'nv': the public's carries none. */
export type ClassKind = 'ab' | 'nv'

export interface ClassPlan {
  kind: ClassKind
  /** The part of the whole company the owner holds in the founders' class, 0-1. */
  hi: number
}

/**
 * A stored share structure, cleaned: null unless it is a plain object whose kind is exactly 'ab' or
 * 'nv'. `hi` is clamped to 0-1 and is 0 when missing or not a finite number (the safe side: no
 * extra votes). Returns a new object; never throws and never changes what it is given.
 */
export function readClasses(v: unknown): ClassPlan | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const kind = (v as { kind?: unknown }).kind
  if (kind !== 'ab' && kind !== 'nv') return null
  const hi = (v as { hi?: unknown }).hi
  return { kind, hi: typeof hi === 'number' && Number.isFinite(hi) ? clampN(hi, 0, 1) : 0 }
}

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

const LINE_KINDS: readonly NonNullable<Product['kind']>[] = ['core', 'next', 'premium', 'value', 'regional', 'bundle', 'addon', 'breakthrough']

/**
 * A stored sort of line. A breakthrough is only ever the line of a Heavy R&D catalogue family
 * (heavy-data.ts), so a saved game can't hand a classic line the breakthrough weight.
 */
function lineKind(v: Json | undefined, family: string): Product['kind'] | undefined {
  if (typeof v !== 'string' || !(LINE_KINDS as readonly string[]).includes(v)) return undefined
  if (v === 'breakthrough' && breakthroughByName(family) === null) return undefined
  return v as Product['kind']
}

/** Line fields added by products 2.0, when stored (old lines have none of them). */
function lineExtras(x: Record<string, Json>): Pick<Product, 'quality' | 'family' | 'kind' | 'from'> {
  const kind = lineKind(x.kind, str(x.family) || str(x.name))
  return {
    ...(typeof x.quality === 'number' && Number.isFinite(x.quality) ? { quality: Math.round(clampN(x.quality, 0, 100)) } : {}),
    ...(str(x.family) ? { family: str(x.family) } : {}),
    ...(kind ? { kind } : {}),
    ...(str(x.from) ? { from: str(x.from) } : {}),
  }
}

/** Most years an ordinary project takes, and a Heavy R&D one. */
const MAX_PROJECT_YEARS = 4
const MAX_HEAVY_YEARS = 6

/**
 * A project's stored quality and kind (never who made it: projects are always the company's own), and
 * the Heavy R&D marks: `heavy` is believed only when it is exactly `true` and the project is one of
 * the catalogue's breakthroughs, `cost` only on such a project and only as a finite number from 0.
 */
function projectExtras(x: Record<string, Json>, name: string): Pick<RdProject, 'quality' | 'family' | 'kind' | 'heavy' | 'cost'> {
  const { quality, family, kind } = lineExtras(x)
  const heavy = x.heavy === true && breakthroughByName(name) !== null
  const cost = heavy && typeof x.cost === 'number' && Number.isFinite(x.cost) && x.cost >= 0 ? Math.min(1e15, x.cost) : undefined
  return { ...(quality !== undefined ? { quality } : {}), ...(family ? { family } : {}), ...(kind ? { kind } : {}), ...(heavy ? { heavy: true as const } : {}), ...(cost !== undefined ? { cost } : {}) }
}

function readProduct(x: Record<string, Json>): Product | null {
  const name = str(x.name)
  if (!name) return null
  return { name, launched: Math.round(num(x.launched)), boost: clampN(num(x.boost, 0.05), 0, 0.5), ...lineExtras(x) }
}

function readProject(x: Record<string, Json>): RdProject | null {
  const name = str(x.name)
  if (!name) return null
  const extras = projectExtras(x, name)
  const years = Math.round(clampN(num(x.years, 1), 1, extras.heavy ? MAX_HEAVY_YEARS : MAX_PROJECT_YEARS))
  return {
    id: str(x.id, `rd.${name}`),
    name,
    budget: Math.max(0, num(x.budget)),
    years,
    progress: clampN(num(x.progress), 0, years),
    odds: clampN(num(x.odds, 0.5), 0.02, 0.98),
    boost: clampN(num(x.boost, 0.05), 0, 0.5),
    ...extras,
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

/** Safe reader shared by save normalization, hiring scripts and every finance-model accessor. */
export function readFinanceProfile(v: Json | undefined): FinanceProfile | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const specialty = FINANCE_SPECIALTIES.find((x) => x === v.specialty)
  const approach = FINANCE_APPROACHES.find((x) => x === v.approach)
  const risk = FINANCE_RISKS.find((x) => x === v.risk)
  if (!specialty || !approach || !risk) return undefined
  return { specialty, approach, risk, record: Math.round(clampN(num(v.record, 50), 0, 100)) }
}

function readManager(v: Json | undefined): Manager | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const style = CEO_STYLES.find((x) => x === v.style)
  const finance = readFinanceProfile(v.finance)
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
    ...(finance ? { finance } : {}),
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
  const classes = readClasses(d.classes)
  const retired = readRetired(d.retired)
  // A year, or nothing: a damaged value must never leave Heavy R&D waiting for good.
  const heavyLast = typeof d.heavyLast === 'number' && Number.isFinite(d.heavyLast) && d.heavyLast >= 1800 && d.heavyLast <= 2300 ? Math.round(d.heavyLast) : null
  return {
    v: BIZ_VERSION,
    industry,
    countryId,
    city,
    founded: Math.round(num(d.founded, fallbackYear)),
    founderName: str(d.founderName),
    ...(str(d.npcOwnerId) ? { npcOwnerId: str(d.npcOwnerId) } : {}),
    acquired: d.acquired === true,
    ...(rec(d.bought) && Number.isFinite(rec(d.bought)!.year) && Number.isFinite(rec(d.bought)!.operating) ? { bought: { year: Math.round(num(rec(d.bought)!.year)), operating: Math.max(0, num(rec(d.bought)!.operating)) } } : {}),
    share: clampN(num(d.share, 1), rec(d.group) || Array.isArray(d.familyShares) ? 0 : 0.01, 1),
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
    ...(retired.length ? { retired } : {}),
    ...(heavyLast !== null ? { heavyLast } : {}),
    outlets,
    ...(num(d.lines) >= 1 ? { lines: Math.round(clampN(num(d.lines), 0, 1e9)) } : {}),
    history,
    last: readStatement(d.last),
    valuation: Math.max(0, num(d.valuation)),
    public: d.public === true,
    sharesOut: Math.max(0, num(d.sharesOut)),
    sharePrice: Math.max(0, num(d.sharePrice)),
    ...(d.public !== true && num(d.shareCount) >= 1000 ? { shareCount: Math.round(clampN(num(d.shareCount), 1000, 1e10)) } : {}),
    exchange: str(d.exchange),
    ipoYear: Math.round(num(d.ipoYear)),
    ...(isTicker(d.ticker) ? { ticker: d.ticker } : {}),
    ...(typeof d.ipoPrice === 'number' && Number.isFinite(d.ipoPrice) && d.ipoPrice > 0 && d.ipoPrice <= 1e12 ? { ipoPrice: d.ipoPrice } : {}),
    ...(classes ? { classes } : {}),
    ceo: d.ceo === 'manager' ? 'manager' : 'owner',
    manager: readManager(d.manager),
    executiveEquity: clampN(num(d.executiveEquity, num(rec(d.manager)?.equity)), 0, 1),
    ...(Array.isArray(d.familyShares) ? { familyShares: readFamilyShares(d.familyShares, 1 - clampN(num(d.share, 1), 0, 1) - clampN(num(d.executiveEquity, num(rec(d.manager)?.equity)), 0, 1)) } : {}),
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
    ...(num(d.ownerDraws) > 0 ? { ownerDraws: num(d.ownerDraws) } : {}),
    raiseYear: Math.round(num(d.raiseYear)),
    lastEvent: Math.round(num(d.lastEvent)),
    loanId: str(d.loanId),
    slump: Math.max(0, num(d.slump)),
    ...(d.board && typeof d.board === 'object' && !Array.isArray(d.board) ? { board: d.board } : {}),
    ...(d.successionReview && typeof d.successionReview === 'object' && !Array.isArray(d.successionReview) ? { successionReview: d.successionReview } : {}),
    ...(industry === 'gameStudio' && d.studio && typeof d.studio === 'object' && !Array.isArray(d.studio) ? { studio: d.studio } : {}),
    ...(isDeepTechIndustry(industry) && d.tech && typeof d.tech === 'object' && !Array.isArray(d.tech) ? { tech: d.tech } : {}),
    ...(d.financeFirm && typeof d.financeFirm === 'object' && !Array.isArray(d.financeFirm) ? { financeFirm: d.financeFirm } : {}),
    ...(Array.isArray(d.closedInventions) ? { closedInventions: d.closedInventions } : {}),
    ...(d.venueOwner && typeof d.venueOwner === 'object' && !Array.isArray(d.venueOwner) ? { venueOwner: d.venueOwner } : {}),
    ...(d.inventionProducts && typeof d.inventionProducts === 'object' ? { inventionProducts: d.inventionProducts } : {}),
    ...(typeof d.inventionStaff === 'number' ? { inventionStaff: Math.floor(clampN(num(d.inventionStaff), 0, 1e9)) } : {}),
    ...(Array.isArray(d.inventionLicenses) ? { inventionLicenses: d.inventionLicenses } : {}),
    ...(d.inventionLicenseSettlement && typeof d.inventionLicenseSettlement === 'object' && !Array.isArray(d.inventionLicenseSettlement) ? { inventionLicenseSettlement: d.inventionLicenseSettlement } : {}),
    ...(d.market && typeof d.market === 'object' && !Array.isArray(d.market) ? { market: d.market } : {}),
    ...(d.group && typeof d.group === 'object' && !Array.isArray(d.group) && typeof d.group.id === 'string' && d.group.id ? { group: d.group } : {}),
    ...(d.family && typeof d.family === 'object' && !Array.isArray(d.family) ? { family: d.family } : {}),
    ...(d.expansion && typeof d.expansion === 'object' && !Array.isArray(d.expansion) ? { expansion: d.expansion } : {}),
    ...(d.milestones && typeof d.milestones === 'object' && !Array.isArray(d.milestones) ? { milestones: d.milestones } : {}),
    ...companyHedgeField(d.hedge),
    ...(d.franchise && typeof d.franchise === 'object' && !Array.isArray(d.franchise) ? { franchise: d.franchise } : {}),
    ...(d.lab && typeof d.lab === 'object' && !Array.isArray(d.lab) ? { lab: d.lab } : {}),
    ...dividendField(d.dividend),
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
 * Outside investors' 1x liquidation preference comes first, exactly as a sale pays out
 * (exit.ownerProceeds): money investors just put in is theirs, not the founder's net worth.
 */
export function stakeValue(b: BizState): number {
  const mult = groupMultOf(b)
  const operating = mult === 1 ? 0 : Math.max(0, b.valuation - (b.cash - b.debt))
  const total = b.valuation + (mult - 1) * operating
  const pref = b.share >= 1 ? 0 : Math.max(0, b.pref ?? 0)
  // Investors take the larger of their preference and their share; the owner keeps the rest.
  const v = Math.round(pref > total * (1 - b.share) ? total - pref : total * b.share)
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
