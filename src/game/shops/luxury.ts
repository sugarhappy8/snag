// Luxury Lifestyle: real-brand shops (watches, jewelry, bags, cars, boats, aircraft, wine, auction
// rooms, grand hotels) that open in tiers by net worth, then private islands, megayachts, custom
// jets, luxury spa, VIP events, personal staff and secret societies for the very rich ($5M+).
// The pieces live in shops/luxury-*.ts; this file builds the menu and runs the yearly hook.
//
// Tiers (shops/luxury-brands-catalog.ts): the tab itself opens at a modest net worth (boutique
// tier, the ordinary rich), the luxury tier opens at a few hundred thousand, and the ultra tier
// (islands, megayachts, jets, ultra-priced pieces) at $5M.
//
// Prices: islands, yachts and jets trade worldwide in US dollars (never scaled by country);
// spa treatments and staff wages follow local labor costs; event tickets follow the local
// luxury price level. Yearly: staff wages, society dues and perks, charter income and at most
// about one popup (island storms, treasure, noisy neighbors, crew drama...). Losing staff or
// being expelled always gets a notice.
import { formatMoney, inPrison, netWorth } from '../core'
import type { GameState, MenuGroup, MenuNode } from '../types'
import { brandAssets, collectionMenu, yearlyBrandAssets } from './luxury-brands-assets'
import { BOUTIQUE_NET_WORTH, tierReason, unlockedTier } from './luxury-brands-catalog'
import { auctionRoomsMenu, grandTripsMenu } from './luxury-brands-rooms'
import { boutiquesMenu, cellarMenu, wheelsMenu } from './luxury-brands-shop'
import { LUXURY_NET_WORTH, luxuryAssets, luxuryBlock, luxuryKind, type PopupBudget } from './luxury-common'
import { fleetEventCandidates, fleetHoldingNode, jetBrokerMenu, megayachtDealerMenu, yearlyFleet } from './luxury-fleet'
import { islandHoldingNode, islandRealtorMenu, yearlyIslands } from './luxury-islands'
import { luxurySpaMenu, vipEventsMenu } from './luxury-pamper'
import { membership, secretSocietiesMenu, yearlySocieties } from './luxury-societies'
import { hasStaff, personalStaffMenu, yearlyStaff } from './luxury-staff'

/** Owns something from the Luxury Lifestyle that still needs managing (even below the tiers). */
export function hasLuxuryHoldings(g: GameState): boolean {
  return luxuryAssets(g).length > 0 || brandAssets(g).length > 0 || hasStaff(g) || membership(g) !== null
}

/** Why the Luxury Lifestyle tab is locked (null = open). It opens at the boutique tier. */
export function luxuryMenuReason(g: GameState): string | null {
  return luxuryBlock(g) ?? (hasLuxuryHoldings(g) ? null : tierReason(g, 'boutique'))
}

function holdingNodes(g: GameState): MenuNode[] {
  const owned = luxuryAssets(g)
  if (owned.length === 0) return []
  const order = { island: 0, megayacht: 1, jet: 2 }
  const sorted = [...owned].sort((a, b) => (order[luxuryKind(a) ?? 'jet'] - order[luxuryKind(b) ?? 'jet']) || b.value - a.value)
  return [{ type: 'heading', id: 'lux-holdings', label: 'Your Estates & Fleet' }, ...sorted.map((a) => (luxuryKind(a) === 'island' ? islandHoldingNode(a) : fleetHoldingNode(a)))]
}

export const luxuryLifestyleMenu: MenuGroup = {
  type: 'menu',
  id: 'luxuryLifestyle',
  label: 'Luxury Lifestyle',
  emoji: '\u{1F48E}',
  subtitle: (g) => (unlockedTier(g) || hasLuxuryHoldings(g) ? (netWorth(g) >= LUXURY_NET_WORTH ? 'Brands, islands, megayachts, VIP events' : 'Designer brands, cars, watches, wine') : `Opens at a net worth of ${formatMoney(BOUTIQUE_NET_WORTH)}`),
  visible: (g) => g.character.alive && g.character.age >= 18 && !inPrison(g),
  disabledReason: luxuryMenuReason,
  header: (g) => {
    const worth = netWorth(g)
    const tier = unlockedTier(g)
    const dipped = !tier ? ` Your net worth has dipped below ${formatMoney(BOUTIQUE_NET_WORTH)}, so the boutiques won't take your calls, but you can still manage what you own.` : worth < LUXURY_NET_WORTH ? ` The ultra tier (islands, megayachts, ${g.year >= 1960 ? 'jets' : 'aircraft'}) opens at ${formatMoney(LUXURY_NET_WORTH)}.` : ''
    return `Enjoy the perks of being rich. Net worth: ${formatMoney(worth)}.${dipped} Brand prices are approximate and follow local price levels; islands, yachts and ${g.year >= 1960 ? 'jets' : 'aircraft'} trade worldwide in US dollars; spa treatments and staff wages follow local prices.`
  },
  children: (g): MenuNode[] => [
    ...holdingNodes(g),
    collectionMenu,
    { type: 'heading', id: 'lux-brands', label: 'Brand Shops' },
    boutiquesMenu,
    wheelsMenu,
    cellarMenu,
    { type: 'heading', id: 'lux-rooms', label: 'Auctions & Grand Trips' },
    auctionRoomsMenu,
    grandTripsMenu,
    { type: 'heading', id: 'lux-shop', label: 'Estates & Fleet' },
    islandRealtorMenu,
    megayachtDealerMenu,
    jetBrokerMenu,
    { type: 'heading', id: 'lux-pamper', label: 'Pamper & Party' },
    luxurySpaMenu,
    vipEventsMenu,
    { type: 'heading', id: 'lux-circle', label: 'Inner Circle' },
    personalStaffMenu,
    secretSocietiesMenu,
  ],
}

/** Yearly hook: staff wages, society dues and perks, charter income and island/fleet events. */
export function yearlyLuxury(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  const budget: PopupBudget = { left: 1 }
  yearlyBrandAssets(g, budget)
  yearlyStaff(g, budget)
  yearlySocieties(g, budget)
  yearlyFleet(g)
  if (c.age >= 18 && !inPrison(g) && luxuryAssets(g).length > 0) yearlyIslands(g, budget, fleetEventCandidates(g))
}
