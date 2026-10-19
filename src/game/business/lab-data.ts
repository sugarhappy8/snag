// R&D 3.0 data: the credit cap, the grant rows, the nine Operations R&D programs and what a trade's tier
// lets them do. Light on imports on purpose (lab-state.ts reads OPS_PROGRAMS to throw out unknown ids, and
// economy.ts reads lab-state.ts): no module-level code here calls an imported function.
import { RD_CREDIT } from './deeptech-data'
import { rdTierOf, type RdTier } from './industries'
import type { LabTrack } from './lab-state'
import { clampN } from './util'

/** Most a company's R&D tax credit can be in a year (2026 dollars). Fixed: it never grows with the company. */
export const LAB_CREDIT_CAP = 250_000

export interface LabGrant {
  /** A country id, or '*' for every country that has no row of its own. */
  where: string
  /** The tiers of trade the grant covers. */
  tiers: readonly RdTier[]
  /** Share of an Operations program's price the grant pays (before the credit is taken out of it). */
  share: number
  /** Most one grant pays. */
  max: number
}

const ALL: readonly RdTier[] = ['low', 'mid', 'high']
const MID_UP: readonly RdTier[] = ['mid', 'high']

/** Research grants by country: the first row that names the country wins, '*' is every other one. */
export const LAB_GRANTS: readonly LabGrant[] = [
  { where: 'us', tiers: MID_UP, share: 0.25, max: 60_000 },
  { where: 'gb', tiers: ALL, share: 0.3, max: 50_000 },
  { where: 'de', tiers: MID_UP, share: 0.3, max: 120_000 },
  { where: 'fr', tiers: ALL, share: 0.3, max: 80_000 },
  { where: 'jp', tiers: ['low', 'mid'], share: 0.25, max: 60_000 },
  { where: 'ca', tiers: ALL, share: 0.3, max: 70_000 },
  { where: 'au', tiers: ALL, share: 0.25, max: 50_000 },
  { where: 'sg', tiers: ALL, share: 0.35, max: 80_000 },
  { where: 'kr', tiers: MID_UP, share: 0.25, max: 70_000 },
  { where: '*', tiers: ALL, share: 0.1, max: 20_000 },
]

/** The share of R&D spending a country pays back: deep tech's table, between none and half. */
export function labCreditRate(countryId: string): number {
  const rate = Object.hasOwn(RD_CREDIT, countryId) ? RD_CREDIT[countryId] : 0
  return clampN(typeof rate === 'number' ? rate : 0, 0, 0.5)
}

/**
 * What a grant pays toward an Operations program of this price: the row's share of the price, but never
 * more than half the price once the credit is counted, and never more than the row's maximum. 0 when the
 * country's row does not cover the tier (breakthrough trades have no Operations R&D, so no grant).
 */
export function labGrantAmount(countryId: string, tier: RdTier, price: number): number {
  const row = LAB_GRANTS.find((r) => r.where === countryId) ?? LAB_GRANTS[LAB_GRANTS.length - 1]
  if (!row.tiers.includes(tier) || !(price > 0) || !Number.isFinite(price)) return 0
  const room = Math.max(0, 0.5 - labCreditRate(countryId))
  return Math.max(0, Math.floor(Math.min(row.max, price * Math.min(row.share, room))))
}

export interface OpsProgram {
  /** `ops.<track>.<rung>`. */
  id: string
  track: LabTrack
  rung: 1 | 2 | 3
  label: string
  /** First year it can be started. */
  first: number
}

/** The nine Operations R&D programs, the same in every trade: three tracks, three rungs, in track then rung order. */
export const OPS_PROGRAMS: readonly OpsProgram[] = [
  { id: 'ops.cost.1', track: 'cost', rung: 1, label: 'Time-and-Motion Study', first: 1905 },
  { id: 'ops.cost.2', track: 'cost', rung: 2, label: 'Lean Production System', first: 1955 },
  { id: 'ops.cost.3', track: 'cost', rung: 3, label: 'Computerized Planning', first: 1985 },
  { id: 'ops.yield.1', track: 'yield', rung: 1, label: 'Layout Redesign', first: 1905 },
  { id: 'ops.yield.2', track: 'yield', rung: 2, label: 'Process Automation', first: 1960 },
  { id: 'ops.yield.3', track: 'yield', rung: 3, label: 'Robotics and Sensors', first: 1990 },
  { id: 'ops.quality.1', track: 'quality', rung: 1, label: 'Inspection Checklists', first: 1905 },
  { id: 'ops.quality.2', track: 'quality', rung: 2, label: 'Statistical Process Control', first: 1950 },
  { id: 'ops.quality.3', track: 'quality', rung: 3, label: 'Automated Quality Tracking', first: 1995 },
]

/** One program by id (null for anything that is not one of the nine). */
export function opsProgram(id: string): OpsProgram | null {
  return OPS_PROGRAMS.find((p) => p.id === id) ?? null
}

/** The tiers that have Operations R&D: a breakthrough (deep-tech) trade keeps its own lab. */
export type LabTier = Exclude<RdTier, 'breakthrough'>

/** A trade's Operations R&D tier; null for a breakthrough trade. */
export function labTierOf(industry: string): LabTier | null {
  const tier = rdTierOf(industry)
  return tier === 'breakthrough' ? null : tier
}

/**
 * What a tier adds to a program's odds and the most each track can change once its level is 1 (the level
 * itself stops at LAB_LEVEL_MAX): unit cost falls by `cost`, output rises by `yield`, demand rises by `quality`.
 */
export const OPS_TIER: Record<LabTier, { odds: number; cost: number; yield: number; quality: number }> = {
  low: { odds: 0.25, cost: 0.05, yield: 0.06, quality: 0.04 },
  mid: { odds: 0.2, cost: 0.08, yield: 0.1, quality: 0.05 },
  high: { odds: 0.12, cost: 0.1, yield: 0.1, quality: 0.07 },
}

/** The highest rung a tier is offered: a low-tech trade stops at the second. */
export const OPS_MAX_RUNG: Record<LabTier, 2 | 3> = { low: 2, mid: 3, high: 3 }

/** By rung (index rung - 1): price as a multiple of the base, years of work, odds taken off, and the share of the gap to the ceiling a first win closes. */
export const RUNG_X: readonly [number, number, number] = [1, 2.2, 4.5]
export const RUNG_YEARS = [1, 1.5, 2] as const
export const RUNG_PENALTY = [0, 0.05, 0.1] as const
export const RUNG_GAIN = [0.3, 0.4, 0.5] as const

/** Years after a win before the same program may run again; years between two grants; most sites a grant company may have. */
export const OPS_COOLDOWN = 3
export const LAB_GRANT_GAP = 3
export const LAB_GRANT_SITES = 25

/** A track's level never passes this, fades by this factor each year, and each win on a track is worth this much of the last. */
export const LAB_LEVEL_MAX = 0.95
export const LAB_FADE = 0.95
export const LAB_WIN_DECAY = 0.8
