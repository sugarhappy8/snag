// New stores and spending (contract module): everyday stores, memberships & subscriptions,
// event tickets and the Luxury Lifestyle. Wired into Shopping/Assets/Activities by menus.ts.
import { everydayStoreMenus, yearlyEveryday } from './shops/everyday'
import { yearlyLuxury } from './shops/luxury'
import { yearlyMemberships } from './shops/memberships'
import type { GameState } from './types'

export { everydayStoreMenus }
export { luxuryLifestyleMenu } from './shops/luxury'
export { membershipAssetSubtitle, membershipAssetView, membershipsMenu, ticketsMenu } from './shops/memberships'

/** Yearly hook (aging.ts, after investments, before finance). */
export function yearlyShops(g: GameState): void {
  yearlyEveryday(g)
  if (!g.character.alive) return
  yearlyMemberships(g)
  if (!g.character.alive) return
  yearlyLuxury(g)
}
