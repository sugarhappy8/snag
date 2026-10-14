// Fixtures for the hedge fund tests: a player with money, relatives with savings, and an ordinary
// company with cash. Everything here builds plain game state; no menu, quote or action runs.
import { makeTestGame } from './helpers'
import { refreshValue, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, type BizState } from '../src/game/business/state'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, Person } from '../src/game/types'
import { getCountry } from '../src/game/world'

function firstCity(countryId: string): string {
  return getCountry(countryId).cities[0] ?? 'the capital'
}

function threeYears(g: GameState, profit: number, revenue = 120e6): BizState['history'] {
  return [g.year - 3, g.year - 2, g.year - 1].map((year) => ({ year, revenue, profit, tax: 0, units: 1e6, price: 120, staff: 300, valuation: 0, outlets: 1 }))
}

/** An adult aged 45 with money who lives in `countryId` and rents. Has a life id and a one-year log. */
export function rich(seed = 61, countryId = 'us', money = 5_000_000, year = 2026): GameState {
  const g = makeTestGame(seed, { age: 45, money, countryId, city: firstCity(countryId), residence: { status: 'renting', rent: 0 } })
  g.lifeId = `hedge-${seed}`
  g.year = year
  g.log = [{ age: 45, year, entries: [] }]
  return g
}

/** A relative of the player with savings of their own. */
export function kin(g: GameState, relation: Person['relation'] = 'sibling', money = 2_000_000, opts: { age?: number; relationship?: number } = {}): Person {
  return createPerson(g, { relation, age: opts.age ?? 44, relationship: opts.relationship ?? 70, money, countryId: g.character.countryId })
}

/** A private software company the player owns outright, with three profitable years and spare cash. */
export function company(g: GameState, opts: { cash?: number; name?: string; countryId?: string; profit?: number } = {}): { a: Asset; b: BizState } {
  const countryId = opts.countryId ?? g.character.countryId
  const a = createBusinessAsset(g, opts.name ?? 'Quiet Co', newBiz(g, 'software', countryId, firstCity(countryId), { cash: opts.cash ?? 5_000_000 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.history = threeYears(g, opts.profit ?? 20e6)
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  return { a, b }
}
