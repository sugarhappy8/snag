// Investments: stocks, bonds, funds, crypto, penny stocks and gold on your country's exchange
// (Assets › Investments). Contract stub.
import type { Asset, GameState, MenuGroup, MenuNode } from './types'

export const investmentsMenu: MenuGroup = {
  type: 'menu',
  id: 'investments',
  label: 'Investments',
  emoji: '\u{1F4C8}',
  subtitle: 'Stocks, bonds, funds and crypto',
  children: (): MenuNode[] => [],
}

/** Owned-asset screen for a kind 'investment' asset (registered in menus.ts). */
export function investmentAssetView(_g: GameState, _a: Asset): MenuNode[] {
  return []
}

export function investmentAssetSubtitle(_g: GameState, a: Asset): string {
  return a.name
}

/** Yearly hook (aging.ts, after business, before finance): prices move, dividends and coupons pay out. */
export function yearlyInvestments(_g: GameState): void {}

/** One line for the AI prompt about the player's portfolio ('' when none). */
export function investmentsSummary(_g: GameState): string {
  return ''
}
