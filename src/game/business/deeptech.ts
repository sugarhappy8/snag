// Deep-tech companies: the layer on top of the normal business sim for semiconductors, AI labs,
// robotics, biotech, space, electric cars, quantum computing and cybersecurity (R&D programs,
// breakthroughs, funding rounds, compute/fabs/trials/launches, export controls...). Hooked into
// yearly.ts (simulation, events, manager turn, report) and manage.ts (menu rows, info line).
// CONTRACT STUB: the deep-tech builder owns this file (and deeptech-*.ts) and fills it in.
import type { Asset, GameState, MenuNode } from '../types'
import { simulateYear, type YearResult } from './economy'
import type { BizState } from './state'

export { isDeepTech } from './deeptech-state'

/** Replaces simulateYear for deep-tech companies. */
export function simulateDeepTechYear(g: GameState, _a: Asset, b: BizState, year: number, ownerDraw: number): YearResult {
  return simulateYear(g, b, year, ownerDraw)
}

/** After the year is booked (R&D progress, breakthroughs, round closes...). */
export function afterDeepTechYear(_g: GameState, _a: Asset, _b: BizState): void {}

/** Maybe queue a deep-tech event popup; true when one was queued. */
export function maybeDeepTechEvent(_g: GameState, _a: Asset, _b: BizState, _year: number, _managed: boolean): boolean {
  return false
}

/** What a hired manager does each year for a deep-tech company the player doesn't run. */
export function deepTechManagerTurn(_g: GameState, _a: Asset, _b: BizState): void {}

/** Queue a custom yearly report instead of the price/production report; true when it did. */
export function deepTechReport(_g: GameState, _a: Asset, _b: BizState): boolean {
  return false
}

/** Extra rows on the company screen under "Run the Company" (R&D lab, funding, compute...). */
export function deepTechNodes(_g: GameState, _a: Asset): MenuNode[] {
  return []
}

/** One status line for the company screen ('' for none). */
export function deepTechInfo(_g: GameState, _a: Asset): string {
  return ''
}

/** One clause for businessSummary / the AI prompt ('' for none). */
export function deepTechSummary(_g: GameState, _a: Asset): string {
  return ''
}
