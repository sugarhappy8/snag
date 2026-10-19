// The sector record (BizState.sector): one optional plain-JSON record per company that has an
// Operations Desk (docs/superpowers/specs/2026-10-19-sector-families-design.md). Light on imports
// on purpose: state.ts, events.ts and the family files read it. Everything stored is untrusted, so
// readSector() clamps every number to its table range and never reads or overwrites a record that
// belongs to another family or a newer version.
import type { BizState } from './state'
import { clampN, toJson } from './util'

export type FamilyId = 'food' | 'care' | 'util'
export const SECTOR_VERSION = 1

/** What the layer wrote in one fiscal year (the last four are kept). */
export interface SectorRow { year: number; income: number; costs: number; demand: number; cost: number; capLoss: number }

export interface SectorBase {
  v: 1
  family: FamilyId
  /** The fiscal year the record appeared (the observation year when the yearly hook made it). */
  since: number
  /** The last fiscal year the yearly rule ran. */
  lastYear: number
  lastEvent: number
  ledger: SectorRow[]
  pending: { token: string; id: string; year: number } | null
  /** The last six lines of what happened on the desk. */
  diary: string[]
}

/** `audit`, `program` and `overhaul` hold the fiscal year of the last paid action (0: none). */
export interface FoodState extends SectorBase { family: 'food'; hygiene: number; rating: number; menu: 0 | 1 | 2; channel: 0 | 1 | 2; hours: 0 | 1; audit: number }
export interface CareState extends SectorBase { family: 'care'; loyal: number; plans: number; planTarget: number; payer: number; acc: number; intake: 0 | 1 | 2; program: number }
/** `outages` is a 3-bit history: bit 0 is the last booked year. */
export interface UtilState extends SectorBase { family: 'util'; condition: number; contract: number; hedge: number; cover: 0 | 1; overhaul: number; outages: number }
export type SectorState = FoodState | CareState | UtilState

export const FAMILY_TRADES: Readonly<Record<FamilyId, readonly string[]>> = {
  food: ['restaurant', 'foodTruck', 'cafe', 'bakery'],
  care: ['clinic', 'education', 'gym', 'salon', 'petCare', 'homeCare', 'autoShop'],
  util: ['energy', 'solar', 'water', 'telecom', 'dataCenter', 'farm', 'logistics'],
}

const FAMILY_BY_TRADE: ReadonlyMap<string, FamilyId> = new Map(
  (Object.keys(FAMILY_TRADES) as FamilyId[]).flatMap((f) => FAMILY_TRADES[f].map((t): [string, FamilyId] => [t, f])),
)

/** The family a trade belongs to (null: the trade has no Operations Desk). */
export function familyOf(industry: string): FamilyId | null {
  return FAMILY_BY_TRADE.get(industry) ?? null
}

/** The fields an event's `sec` may change, by family. */
export const SEC_KEYS: Readonly<Record<FamilyId, readonly string[]>> = {
  food: ['hygiene', 'rating', 'menu', 'channel', 'hours', 'audit'],
  care: ['loyal', 'plans', 'planTarget', 'payer', 'acc', 'intake', 'program'],
  util: ['condition', 'contract', 'hedge', 'cover', 'overhaul', 'outages'],
}

// ---------------------------------------------------------------------------
// Reading what is stored

/** own: this trade's family at version 1. foreign: another family or a newer version (never touched). none: nothing usable. */
export type SectorSlot = 'none' | 'own' | 'foreign'

type Raw = Record<string, unknown>

function plain(v: unknown): Raw | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null
}

function slotFor(stored: unknown, family: FamilyId | null): SectorSlot {
  const d = plain(stored)
  if (!d) return 'none'
  if (typeof d.v === 'number' && d.v > SECTOR_VERSION) return 'foreign'
  if (typeof d.family !== 'string' || d.family === '') return 'none'
  if (d.family !== family) return 'foreign'
  return d.v === SECTOR_VERSION ? 'own' : 'none'
}

export function sectorSlot(b: Pick<BizState, 'sector' | 'industry'>): SectorSlot {
  return slotFor(b.sector, familyOf(b.industry))
}

function num(v: unknown, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

/** 0, or a calendar year in 1800 to 2300 (anything else reads as 0). */
function year(v: unknown): number {
  const x = num(v, 0)
  return x >= 1800 && x <= 2300 ? Math.round(x) : 0
}

function whole(v: unknown, def: number, lo: number, hi: number): number {
  return Math.round(clampN(num(v, def), lo, hi))
}

/** Clamped to [0, hi], then snapped to a grid of `unit` and rounded to 2 decimals (so .6 stays .6). */
function snapped(v: unknown, hi: number, unit: number): number {
  const x = Math.round(clampN(num(v, 0), 0, hi) / unit) * unit
  return Math.round(Math.min(hi, x) * 100) / 100
}

function money(v: unknown): number {
  return Math.round(clampN(num(v, 0), 0, 1e15))
}

function row(r: Raw): SectorRow {
  return {
    year: year(r.year), income: money(r.income), costs: money(r.costs),
    demand: clampN(num(r.demand, 1), .5, 2), cost: clampN(num(r.cost, 1), .5, 2), capLoss: clampN(num(r.capLoss, 0), 0, 1),
  }
}

function base(d: Raw, family: FamilyId): SectorBase {
  const p = plain(d.pending)
  const token = p && typeof p.token === 'string' ? p.token : ''
  const id = p && typeof p.id === 'string' ? p.id : ''
  const when = p ? year(p.year) : 0
  const live = token.length >= 1 && token.length <= 24 && id.length >= 1 && id.length <= 24 && when > 0
  return {
    v: SECTOR_VERSION, family, since: year(d.since), lastYear: year(d.lastYear), lastEvent: year(d.lastEvent),
    ledger: Array.isArray(d.ledger) ? d.ledger.map(plain).filter((x): x is Raw => !!x).slice(-4).map(row) : [],
    pending: live ? { token, id, year: when } : null,
    diary: Array.isArray(d.diary) ? d.diary.filter((x): x is string => typeof x === 'string').slice(-6).map((x) => x.slice(0, 90)) : [],
  }
}

function clean(d: Raw, family: FamilyId): SectorState {
  const b = base(d, family)
  if (family === 'food') {
    return {
      ...b, family: 'food', hygiene: clampN(num(d.hygiene, 71), 0, 100), rating: clampN(num(d.rating, 3.4), 1, 5),
      menu: whole(d.menu, 1, 0, 2) as 0 | 1 | 2, channel: whole(d.channel, 0, 0, 2) as 0 | 1 | 2, hours: whole(d.hours, 0, 0, 1) as 0 | 1, audit: year(d.audit),
    }
  }
  if (family === 'care') {
    return {
      ...b, family: 'care', loyal: clampN(num(d.loyal, .72), .2, 1), plans: snapped(d.plans, .6, .1), planTarget: snapped(d.planTarget, .6, .2),
      payer: snapped(d.payer, .6, .1), acc: clampN(num(d.acc, 62), 0, 100), intake: whole(d.intake, 0, 0, 2) as 0 | 1 | 2, program: year(d.program),
    }
  }
  return {
    ...b, family: 'util', condition: clampN(num(d.condition, 80), 0, 100), contract: clampN(num(d.contract, .5), 0, 1), hedge: clampN(num(d.hedge, 0), 0, .8),
    cover: whole(d.cover, 0, 0, 1) as 0 | 1, overhaul: year(d.overhaul), outages: whole(d.outages, 0, 0, 7),
  }
}

/** The quality-50 defaults of a family, with `lastYear` equal to `since`. */
export function blankRecord(family: FamilyId, since: number): SectorState {
  return clean({ since, lastYear: since }, family)
}

/** The same record with every number inside its table range, integers rounded, diary 6 x 90, ledger 4. */
export function clampRecord(st: SectorState): SectorState {
  return clean(st as unknown as Raw, st.family)
}

/** A sane record of this trade's family, or null (absent, unusable, another family, a newer version). */
export function readSector(b: Pick<BizState, 'sector' | 'industry'>): SectorState | null {
  const family = familyOf(b.industry)
  const d = plain(b.sector)
  if (!family || !d || slotFor(b.sector, family) !== 'own') return null
  return clean(d, family)
}

/** Store a record (clamped). A slot that belongs to another family or a newer version is left alone. */
export function saveSector(b: Pick<BizState, 'sector'>, st: SectorState): void {
  if (slotFor(b.sector, st.family) === 'foreign') return
  b.sector = toJson(clampRecord(st))
}

/** One line on the desk's diary (90 characters, the newest six kept). */
export function addDiary(st: SectorState, line: string): void {
  st.diary = [...st.diary, line.slice(0, 90)].slice(-6)
}

/**
 * Whether the family's own version of a generic event replaces it: food companies whose record is
 * live (not in the observation year, which books as v3.0.0 did) use their own inspection and critic.
 */
export function sectorOwnsEvent(b: Pick<BizState, 'sector' | 'industry'>, id: string): boolean {
  if (id !== 'inspection' && id !== 'critic') return false
  if (familyOf(b.industry) !== 'food') return false
  const st = readSector(b)
  return !!st && st.since < st.lastYear
}
