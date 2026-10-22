// The personal tax rates the markets and the sale of a business read (R2-L13): the player's change in a tax, the capital gains rate,
// the tax on a gain, and the nation's tax on trades.
//
// A leaf on purpose. investments.ts stays out of the import cycles, and business/exit.ts and nation/effects.ts are inside them; if
// investments.ts imported either of those it would join the cycle. This file imports only the market table, the nation's own state
// and data, and types, so both sides can reach it. nation/effects.ts and business/exit.ts re-export what used to live in them.
import { marketOf } from '../data/markets'
import type { GameState } from '../types'
import { newTaxAvailable, taxAvailable, type TaxId } from './data'
import { hasPolicy, policyOf } from './state'

/** Tax on a trade for each level of the law (levels 0 to 3): 0.1 percent of the trade, the size of the real stamp duties and financial transactions taxes. */
export const TRANSACTION_TAX_PER_LEVEL = 0.001

const clampN = (n: number, lo: number, hi: number): number => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo)

/** The player's personal tax change in points (or % of value), all layers where they live. */
export function personalTax(g: GameState, id: TaxId, country = g.character.countryId): number {
  if (!hasPolicy(g, country) || !taxAvailable(id, g.year)) return 0
  const p = policyOf(g, country)
  let v = p.national.taxes[id] ?? 0
  if (country === g.character.countryId) {
    if (p.regional.place) v += p.regional.taxes[id] ?? 0
    if (p.city.place && p.city.place === g.character.city) v += p.city.taxes[id] ?? 0
  }
  return v
}

/** Capital gains tax rate on selling a business, shares or a holding where the owner lives. */
export function capitalGainsRate(g: GameState): number {
  const m = marketOf(g.character.countryId)
  const change = personalTax(g, 'capitalGains') / 100
  return change ? clampN(m.corporateTax * 0.8 + change, 0, 0.6) : clampN(m.corporateTax * 0.8, 0, 0.3)
}

/** Tax owed on proceeds above the owner's cost basis (scaled to the share sold). */
export function capitalGainsTax(g: GameState, proceeds: number, basis: number): number {
  const gain = proceeds - Math.max(0, basis)
  return gain > 0 ? Math.round(gain * capitalGainsRate(g)) : 0
}

/** The transactions tax level (0 to 3) where the player lives: 0 with no law, or before the tax exists. */
export function transactionsLevel(g: GameState): number {
  const c = g.character.countryId
  if (!hasPolicy(g, c) || !newTaxAvailable('transactions', g.year)) return 0
  const level = policyOf(g, c).newTaxes.transactions?.level
  return typeof level === 'number' && Number.isFinite(level) ? Math.max(0, Math.min(3, Math.round(level))) : 0
}

/** The tax on a trade of `amount` dollars: a level of the law times 0.1 percent, in whole dollars. Nothing for a bad amount. */
export function transactionsLevy(g: GameState, amount: number): number {
  if (!Number.isFinite(amount) || !(amount > 0)) return 0
  return Math.round(amount * transactionsLevel(g) * TRANSACTION_TAX_PER_LEVEL)
}
