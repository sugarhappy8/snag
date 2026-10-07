// Deep-tech companies: the layer on top of the normal business sim for semiconductors, AI labs,
// robotics, biotech, space, electric cars, quantum computing and cybersecurity (R&D programs,
// breakthroughs, funding rounds, compute/fabs/trials/launches, export controls...). Hooked into
// yearly.ts (simulation, events, manager turn, report) and manage.ts (menu rows, info line).
// The work lives in deeptech-*.ts: state (plain JSON in Asset.details.tech), data (ladders,
// programs, grants, regulators), core (demand, capacity, valuation), rd, funding, sim, events,
// menu, manager and found (founding helpers used by founding.ts).
import type { Asset, GameState, MenuNode } from '../types'
import type { YearResult } from './economy'
import { deepTechManagerTurnImpl } from './deeptech-manager'
import { deepTechInfoImpl, deepTechNodesImpl, deepTechSummaryImpl } from './deeptech-menu'
import { afterDeepTechYearImpl, deepTechReportImpl, simulateDeepTechYearImpl } from './deeptech-sim'
import { maybeDeepTechEventImpl } from './deeptech-events'
import { isDeepTech } from './deeptech-state'
import { readBiz, type BizState } from './state'

export { isDeepTech } from './deeptech-state'

/** Replaces simulateYear for deep-tech companies. */
export function simulateDeepTechYear(g: GameState, a: Asset, b: BizState, year: number, ownerDraw: number): YearResult {
  return simulateDeepTechYearImpl(g, a, b, year, ownerDraw)
}

/** After the year is booked (R&D progress, breakthroughs, round closes...). */
export function afterDeepTechYear(g: GameState, a: Asset, b: BizState): void {
  if (!isDeepTech(b)) return
  afterDeepTechYearImpl(g, a, b)
}

/** Maybe queue a deep-tech event popup; true when one was queued. */
export function maybeDeepTechEvent(g: GameState, a: Asset, b: BizState, year: number, managed: boolean): boolean {
  if (!isDeepTech(b)) return false
  return maybeDeepTechEventImpl(g, a, b, year, managed)
}

/** What a hired manager does each year for a deep-tech company the player doesn't run. */
export function deepTechManagerTurn(g: GameState, a: Asset, b: BizState): void {
  if (!isDeepTech(b)) return
  deepTechManagerTurnImpl(g, a, b)
}

/** Queue a custom yearly report instead of the price/production report; true when it did. */
export function deepTechReport(g: GameState, a: Asset, b: BizState): boolean {
  if (!isDeepTech(b)) return false
  return deepTechReportImpl(g, a, b)
}

/** Extra rows on the company screen under "Run the Company" (R&D lab, funding, compute...). */
export function deepTechNodes(g: GameState, a: Asset): MenuNode[] {
  if (!isDeepTech(readBiz(g, a))) return []
  return deepTechNodesImpl(g, a)
}

/** One status line for the company screen ('' for none). */
export function deepTechInfo(g: GameState, a: Asset): string {
  if (!isDeepTech(readBiz(g, a))) return ''
  return deepTechInfoImpl(g, a)
}

/** One clause for businessSummary ('' for none). */
export function deepTechSummary(g: GameState, a: Asset): string {
  if (!isDeepTech(readBiz(g, a))) return ''
  return deepTechSummaryImpl(g, a)
}
