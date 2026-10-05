// The risky side of the home computer: crypto pump-and-dumps, options trading and online scams.
// Contract stub (computer.ts assembles the menu).
import type { GameState, MenuNode } from '../types'

/** Menu rows for Activities › Computer (crypto, options, scams...). */
export function moneyNodes(_g: GameState): MenuNode[] {
  return []
}

/** Yearly hook: open options positions settle, coins collapse, investigations catch up. */
export function yearlyMoney(_g: GameState): void {}

/** One compact line for the AI context ('' when nothing to say). */
export function moneySummary(_g: GameState): string {
  return ''
}
