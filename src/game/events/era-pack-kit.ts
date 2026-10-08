// Small helpers shared by the 1900-1979 era packs' popup events: what things cost in the year
// (read from the digest's price anchors, so a 1925 wireless set costs what a 1925 wireless set
// cost) and a few wording helpers. Nothing here consumes the game's RNG, so setups and previews
// can call it freely.
import { parents } from '../core'
import { nominalPrice } from '../history/digest'
import { PRICE_ITEMS } from '../history/digest-prices'
import { priceLevel } from '../history/timeline'
import type { GameState, Person } from '../types'
import { getCountry } from '../world'

/** Engine (constant present-day) dollars for a digest item in the player's year, scaled to the country; 0 when it didn't exist. */
export function itemCost(g: GameState, id: string, count = 1): number {
  const item = PRICE_ITEMS.find((i) => i.id === id)
  if (!item) return 0
  const nominal = nominalPrice(item, g.year)
  if (nominal === null) return 0
  const wealth = Math.max(0.35, Math.min(1.3, getCountry(g.character.countryId).wealth ?? 1))
  return niceRound((nominal * count * wealth) / priceLevel(g.year))
}

/** A round number of engine dollars: nearest 5 under 100, 10 under 1,000, 50 under 10,000, then 500. */
export function niceRound(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  const step = n >= 10_000 ? 500 : n >= 1_000 ? 50 : n >= 100 ? 10 : n >= 20 ? 5 : 1
  return Math.max(1, Math.round(n / step) * step)
}

/** The richest living parent's money (what the household could spend), or 0. */
export function householdMoney(g: GameState): number {
  return Math.max(0, ...parents(g).filter((p) => p.alive).map((p) => p.money))
}

export function parentWord(p: Person | undefined): string {
  if (!p) return 'parent'
  return p.gender === 'male' ? 'father' : p.gender === 'female' ? 'mother' : 'parent'
}

/** The player is a minor (before the era's adulthood at 18). */
export function minor(g: GameState): boolean {
  return g.character.age < 18
}
