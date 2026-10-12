// Plain-JSON state of a company's franchise network (BizState.franchise) and its pure readers.
// Light on imports on purpose: economy.ts reads franchiseFeesFor() for the valuation (one-off fees
// are already in the cash and must not be capitalized as if they recurred), and franchise.ts holds
// the economics, the actions and the menu.
import type { Json } from '../types'
import type { BizState } from './state'
import { clampN, num, rec } from './util'

export interface FranchiseLedger {
  /** Fiscal year. */
  year: number
  /** Net upfront fees booked that year. */
  fees: number
  /** Net royalties booked for that year. */
  royalty: number
}

export interface FranchiseState {
  /** Franchised outlets open now. */
  units: number
  /** Year the first franchise was sold (0: never). */
  since: number
  /** Franchises sold in `addedYear` (buy-backs and terminations don't give buyers back). */
  added: number
  addedYear: number
  /** Last fiscal year whose royalties were booked (each year books once). */
  booked: number
  /** Fractional franchisee closures carried to next year (keeps churn exact without dice). */
  carry: number
  /** Lifetime net fees + royalties. */
  lifetime: number
  scandals: number
  lastScandal: number
  ledger: FranchiseLedger[]
}

const EMPTY: FranchiseState = { units: 0, since: 0, added: 0, addedYear: 0, booked: 0, carry: 0, lifetime: 0, scandals: 0, lastScandal: 0, ledger: [] }

/** A sane franchise record from whatever is stored (pure; old saves have none). */
export function readFranchise(b: Pick<BizState, 'franchise'>): FranchiseState {
  const d = rec(b.franchise)
  if (!d) return { ...EMPTY, ledger: [] }
  const ledger = Array.isArray(d.ledger)
    ? d.ledger
        .map((x) => rec(x))
        .filter((x): x is Record<string, Json> => !!x && Number.isFinite(num(x.year, NaN)))
        .map((x) => ({ year: Math.round(num(x.year)), fees: Math.max(0, num(x.fees)), royalty: Math.max(0, num(x.royalty)) }))
        .slice(-4)
    : []
  return {
    units: Math.round(clampN(num(d.units), 0, 1e7)),
    since: Math.round(num(d.since)),
    added: Math.round(clampN(num(d.added), 0, 1e7)),
    addedYear: Math.round(num(d.addedYear)),
    booked: Math.round(num(d.booked)),
    carry: clampN(num(d.carry), 0, 1),
    lifetime: Math.max(0, num(d.lifetime)),
    scandals: Math.max(0, Math.round(num(d.scandals))),
    lastScandal: Math.round(num(d.lastScandal)),
    ledger,
  }
}

/** Franchise money (net fees + royalties) booked in a fiscal year: the statement's own line. */
export function franchiseIncomeFor(b: Pick<BizState, 'franchise'>, year: number): number {
  const row = readFranchise(b).ledger.find((x) => x.year === year)
  return row ? Math.round(row.fees + row.royalty) : 0
}

/** The one-off upfront fees (net) booked in a fiscal year (0 for anyone who never franchised). */
export function franchiseFeesFor(b: Pick<BizState, 'franchise'>, year: number): number {
  if (!b.franchise) return 0
  const row = readFranchise(b).ledger.find((x) => x.year === year)
  return row ? Math.round(row.fees) : 0
}

/** Franchised outlets open now (0 for anyone who never franchised). */
export function franchiseUnits(b: Pick<BizState, 'franchise'>): number {
  return readFranchise(b).units
}
