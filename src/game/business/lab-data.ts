// R&D 3.0 data: the credit cap, the grant rows and the nine Operations R&D programs. Light on imports on
// purpose (lab-state.ts reads OPS_PROGRAMS to throw out unknown ids, and economy.ts reads lab-state.ts):
// no module-level code here calls an imported function.
import { RD_CREDIT } from './deeptech-data'
import type { RdTier } from './industries'
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
