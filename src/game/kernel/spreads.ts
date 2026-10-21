// Bid-ask spreads (R2, design 4.4): no pool trades at the mid price in both directions.
//
// A pool is a crowd (the retailers, the sellers of homes, the market). When an entity buys from it the price is the ask, above the
// mid price, and when it sells to it the price is the bid, below. So a buy followed by a sale to the same pool always loses at
// least 2 x spread x mid, unless the path has a larger cost of its own (the broker fee and price impact of investments.ts).
// The numbers are fractions of the mid price, each side. A pool with no number of its own gets the default.
//
// This file is part of the kernel (L0): it imports only other kernel files.
import type { PoolName } from './reasons'

const DEFAULT_SPREAD = 0.05

/** The spread of each pool, as a fraction of the mid price on each side. Every pool has an entry. */
export const SPREADS: Readonly<Record<PoolName, number>> = {
  banks: 0.002,
  charity: DEFAULT_SPREAD,
  crime: DEFAULT_SPREAD,
  edu: DEFAULT_SPREAD,
  employers: DEFAULT_SPREAD,
  family: DEFAULT_SPREAD,
  firms: DEFAULT_SPREAD,
  health: DEFAULT_SPREAD,
  hh: DEFAULT_SPREAD,
  insurers: DEFAULT_SPREAD,
  landlords: DEFAULT_SPREAD,
  legal: DEFAULT_SPREAD,
  leisure: DEFAULT_SPREAD,
  markets: 0.001,
  other: 0.05,
  retail: 0.1,
  sellers: 0.03,
}

/** What the pool charges for something worth `mid`: above the mid price. */
export function ask(mid: number, pool: PoolName): number {
  return mid * (1 + (SPREADS[pool] ?? DEFAULT_SPREAD))
}

/** What the pool pays for something worth `mid`: below the mid price. */
export function bid(mid: number, pool: PoolName): number {
  return mid * (1 - (SPREADS[pool] ?? DEFAULT_SPREAD))
}
