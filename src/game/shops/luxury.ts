// Luxury Lifestyle: private islands, megayachts, custom jets, luxury spa, VIP events, personal
// staff and secret societies for the very rich (net worth $5M+). The pieces live in
// shops/luxury-*.ts; this file builds the menu and runs the yearly hook.
//
// Prices: islands, yachts and jets trade worldwide in US dollars (never scaled by country);
// spa treatments and staff wages follow local labor costs; event tickets follow the local
// luxury price level. Yearly: staff wages, society dues and perks, charter income and at most
// about one popup (island storms, treasure, noisy neighbors, crew drama...). Losing staff or
// being expelled always gets a notice.
import { formatMoney, inPrison, netWorth } from '../core'
import type { GameState, MenuGroup, MenuNode } from '../types'
import { LUXURY_NET_WORTH, luxuryAssets, luxuryBlock, luxuryKind, type PopupBudget, wealthLock } from './luxury-common'
import { fleetEventCandidates, fleetHoldingNode, jetBrokerMenu, megayachtDealerMenu, vesselSummary, yearlyFleet } from './luxury-fleet'
import { islandHoldingNode, islandRealtorMenu, islandSummary, yearlyIslands } from './luxury-islands'
import { luxurySpaMenu, vipEventsMenu } from './luxury-pamper'
import { membership, secretSocietiesMenu, societySummary, yearlySocieties } from './luxury-societies'
import { hasStaff, personalStaffMenu, staffSummary, yearlyStaff } from './luxury-staff'

/** Owns something from the Luxury Lifestyle that still needs managing (even below $5M). */
export function hasLuxuryHoldings(g: GameState): boolean {
  return luxuryAssets(g).length > 0 || hasStaff(g) || membership(g) !== null
}

/** Why the Luxury Lifestyle tab is locked (null = open). */
export function luxuryMenuReason(g: GameState): string | null {
  return luxuryBlock(g) ?? (hasLuxuryHoldings(g) ? null : wealthLock(g))
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
  subtitle: (g) => (netWorth(g) >= LUXURY_NET_WORTH || hasLuxuryHoldings(g) ? 'Islands, megayachts, VIP events' : `Opens at a net worth of ${formatMoney(LUXURY_NET_WORTH)}`),
  visible: (g) => g.character.alive && g.character.age >= 18 && !inPrison(g),
  disabledReason: luxuryMenuReason,
  header: (g) => {
    const worth = netWorth(g)
    const dipped = worth < LUXURY_NET_WORTH ? ` Your net worth has dipped below ${formatMoney(LUXURY_NET_WORTH)}, so the dealers won't take your calls, but you can still manage what you own.` : ''
    return `Enjoy the perks of being a VIP. Net worth: ${formatMoney(worth)}.${dipped} Islands, yachts and jets trade worldwide in US dollars; spa treatments and staff wages follow local prices.`
  },
  children: (g): MenuNode[] => [
    ...holdingNodes(g),
    { type: 'heading', id: 'lux-shop', label: 'Shop' },
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
  yearlyStaff(g, budget)
  yearlySocieties(g, budget)
  yearlyFleet(g)
  if (c.age >= 18 && !inPrison(g) && luxuryAssets(g).length > 0) yearlyIslands(g, budget, fleetEventCandidates(g))
}

/**
 * One line for the AI's context (null when the player has none of it): islands, yachts, jets,
 * society and household staff, e.g. "Private island Little Tax Shelter Cay (4 acres, the Exumas,
 * Bahamas); megayacht Overdraft (78 m explorer yacht); Initiate of The Order of the Gilded Walrus".
 */
export function luxurySummary(g: GameState): string | null {
  const parts: string[] = []
  for (const a of luxuryAssets(g)) {
    const kind = luxuryKind(a)
    if (kind === 'island') {
      const s = islandSummary(a)
      parts.push(`private island ${s.name} (${s.acres.toLocaleString('en-US')} acres, ${s.place || 'somewhere tropical'})`)
    } else if (kind === 'megayacht') parts.push(`megayacht ${vesselSummary(a)}`)
    else if (kind === 'jet') parts.push(`private jet ${vesselSummary(a)}`)
  }
  const society = societySummary(g)
  if (society) parts.push(society)
  const staff = staffSummary(g)
  if (staff) parts.push(`household staff: ${staff}`)
  return parts.length ? parts.join('; ') : null
}
