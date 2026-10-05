// The legit side of the home computer: learn to code, build and run a SaaS, freelance and other
// online side businesses, from childhood on. Contract stub (computer.ts assembles the menu).
import type { GameState, MenuNode } from '../types'

/** Menu rows for Activities › Computer (learn to code, SaaS, freelancing...). */
export function devNodes(_g: GameState): MenuNode[] {
  return []
}

/** Yearly hook: SaaS growth/churn/revenue, skill decay or growth, events. */
export function yearlyDev(_g: GameState): void {}

/** One compact line for the AI context ('' when nothing to say). */
export function devSummary(_g: GameState): string {
  return ''
}
