// Fixtures for the listed-company tests: who trades where, what the Stocks row shows, and what a
// buy or a sale does. Everything here builds plain game state; nothing reads g.rng.
import { makeTestGame } from './helpers'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupIdOf, liveGroup, saveGroup, syncMembers } from '../src/game/business/conglomerate-state'
import { refreshValue, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, type BizState } from '../src/game/business/state'
import { exchangeInfo } from '../src/game/invest/engine'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

function firstCity(countryId: string): string {
  return getCountry(countryId).cities[0] ?? 'the capital'
}

function threeYears(g: GameState, profit: number, revenue = 120e6): BizState['history'] {
  return [g.year - 3, g.year - 2, g.year - 1].map((year) => ({ year, revenue, profit, tax: 0, units: 1e6, price: 120, staff: 300, valuation: 0, outlets: 1 }))
}

/** An adult aged 45 who lives in `countryId`, rents, and has a life id (the investments code needs one). */
export function founder(seed = 41, countryId = 'us', money = 50_000_000_000, year = 2026): GameState {
  const g = makeTestGame(seed, { age: 45, money, countryId, city: firstCity(countryId), residence: { status: 'renting', rent: 0 } })
  g.lifeId = `own-listing-${seed}`
  g.year = year
  return g
}

export interface ListedOptions {
  name?: string
  countryId?: string
  exchange?: string
  share?: number
  marketCap?: number
  sharesOut?: number
  profit?: number
  executive?: number
  family?: { id: string; share: number }[]
}

/** A listed software company the player owns a stake in. No ticker is stored. */
export function listed(g: GameState, opts: ListedOptions = {}): { a: Asset; b: BizState } {
  const countryId = opts.countryId ?? g.character.countryId
  const sharesOut = opts.sharesOut ?? 1e8
  const marketCap = opts.marketCap ?? 5e9
  const a = createBusinessAsset(g, opts.name ?? 'Listed Co', newBiz(g, 'software', countryId, firstCity(countryId), { cash: 5_000_000 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.public = true
  b.exchange = opts.exchange ?? exchangeInfo(countryId).ex.code
  b.ipoYear = g.year - 3
  b.sharesOut = sharesOut
  b.valuation = marketCap
  b.sharePrice = round2(marketCap / sharesOut)
  b.share = opts.share ?? 0.6
  if (opts.executive !== undefined) b.executiveEquity = opts.executive
  if (opts.family) b.familyShares = opts.family.map((f) => ({ id: f.id, share: f.share }))
  b.history = threeYears(g, opts.profit ?? 0)
  refreshValue(a, b)
  return { a, b }
}

/** A private software company that earns enough to be worth something. */
export function privateCompany(g: GameState, countryId = 'us', name = 'Quiet Co'): { a: Asset; b: BizState } {
  const a = createBusinessAsset(g, name, newBiz(g, 'software', countryId, firstCity(countryId), { cash: 5_000_000 }), 1e6)
  g.assets.push(a)
  const b = bizOf(g, a)
  b.history = threeYears(g, 20e6)
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  return { a, b }
}

/** Two private companies joined into a group, which is then listed with you holding `share` of it. */
export function listedGroup(g: GameState, countryId: string, share: number): { id: string; members: Asset[] } {
  const one = privateCompany(g, countryId, 'Group Co One')
  const two = privateCompany(g, countryId, 'Group Co Two')
  if (!formGroup(g, [one.a.id, two.a.id], 'Test Holdings')) throw new Error('the kit could not form a group')
  const id = groupIdOf(bizOf(g, one.a))
  const grp = liveGroup(g, id)
  if (!grp) throw new Error('the kit lost its group')
  grp.core.listing = { exchange: exchangeInfo(countryId).ex.code, ipoYear: g.year - 2, sharesOut: 2_000_000, sharePrice: 30 }
  grp.core.share = share
  syncMembers(grp)
  saveGroup(g, grp)
  return { id, members: [one.a, two.a] }
}

/** Depth-first search through the menu tree, opening group children. */
export function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 6): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu' && depth > 0) {
      const hit = findNode(g, n.children(g), id, depth - 1)
      if (hit) return hit
    }
  }
  return undefined
}
