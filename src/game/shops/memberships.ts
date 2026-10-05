// Memberships & subscriptions (gyms, clubs, streaming, boxes...) and event tickets. Contract stub.
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'

export const membershipsMenu: MenuGroup = {
  type: 'menu',
  id: 'memberships',
  label: 'Memberships',
  emoji: '\u{1F4B3}',
  subtitle: 'Gyms, clubs and subscriptions',
  children: (): MenuNode[] => [],
}

export const ticketsMenu: MenuGroup = {
  type: 'menu',
  id: 'tickets',
  label: 'Tickets',
  emoji: '\u{1F39F}\u{FE0F}',
  subtitle: 'Concerts, games, shows and festivals',
  children: (): MenuNode[] => [],
}

/** Owned-asset screen for a kind 'membership' asset (registered in menus.ts). */
export function membershipAssetView(_g: GameState, _a: Asset): MenuNode[] {
  return []
}

export function membershipAssetSubtitle(_g: GameState, a: Asset): string {
  return a.name
}

/** Yearly hook: renewals (fees are charged as asset upkeep by assets.ts), perks, lapses. */
export function yearlyMemberships(_g: GameState): void {}
