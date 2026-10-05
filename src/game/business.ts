// Business: start a company in one of 25 industries and run it in your country's market
// (Occupation › Special Careers › Business, and Assets › Businesses). Contract stub; the
// implementation lives here and in business/*.ts.
import type { Asset, GameState, MenuGroup, MenuNode } from './types'

/** Occupation › Special Careers › Business: start a company, or manage the one you run. */
export const businessCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'business',
  label: 'Business',
  emoji: '\u{1F4BC}',
  subtitle: 'Start your own company',
  children: (): MenuNode[] => [],
}

/** Assets › Businesses: every company you own, plus starting/buying one. */
export const businessesMenu: MenuGroup = {
  type: 'menu',
  id: 'businesses',
  label: 'Businesses',
  emoji: '\u{1F3E2}',
  subtitle: 'Companies you own',
  children: (): MenuNode[] => [],
}

/** Occupation tab rows while the player works as CEO/owner of their own company. */
export function businessJobNodes(_g: GameState): MenuNode[] {
  return []
}

/** Owned-asset screen for a kind 'business' asset (registered in menus.ts). */
export function businessAssetView(_g: GameState, _a: Asset): MenuNode[] {
  return []
}

export function businessAssetSubtitle(_g: GameState, a: Asset): string {
  return a.name
}

/** Yearly hook (aging.ts, after special careers, before finance). */
export function yearlyBusiness(_g: GameState): void {}

/** One line for the AI prompt about the player's companies ('' when none). */
export function businessSummary(_g: GameState): string {
  return ''
}
