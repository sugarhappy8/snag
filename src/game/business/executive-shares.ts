// Executive shares: what an elite CEO asks for, and where the shares go when they leave. A
// conglomerate's own CEO asks for at most 5%, a standalone company's CEO for at most 3%, a
// division's CEO for 0.5-1% (of the group's holding in that division, paid in group shares). A
// shareholder CEO never resigns or retires; when they leave anyway (dismissed, replaced, the owner
// takes over, death), their shares go back to the founder. Divisions and group CEOs are settled
// with their group every time it is saved (conglomerate-state settleGroupExecutives); standalone
// companies here, whenever the CEO seat changes and once a year as a safety net.
import type { GameState } from '../types'
import { groupIdOf, inGroup, liveGroup, saveGroup } from './conglomerate-state'
import { refreshValue } from './economy'
import type { BizState } from './state'
import { clampN } from './util'

/** Which seat a CEO holds: a standalone company, a division of a conglomerate, or the conglomerate itself. */
export type EquitySeat = 'company' | 'division' | 'group'

/** Ownership an elite CEO asks for at skill 85, 90 and 95+. Only a conglomerate's own CEO reaches 5%. */
export const EQUITY_TIERS: Record<EquitySeat, readonly [number, number, number]> = {
  group: [0.02, 0.035, 0.05],
  company: [0.01, 0.02, 0.03],
  division: [0.005, 0.0075, 0.01],
}

/** The stake a CEO of this skill asks for in this seat (0 below 85). */
export function equityTarget(skill: number, seat: EquitySeat = 'company'): number {
  const t = EQUITY_TIERS[seat]
  return skill >= 95 ? t[2] : skill >= 90 ? t[1] : skill >= 85 ? t[0] : 0
}

/** '0.5%', '0.75%', '3.5%', '5%': a small stake without trailing zeros. */
export function stakeText(x: number): string {
  const v = Math.max(0, x) * 100
  return `${Number(v.toFixed(v < 1 ? 2 : 1))}%`
}

/**
 * A standalone company's executive shares that its current CEO doesn't hold (a CEO who left)
 * go back to the founder's stake, with the cost basis that came with them. Divisions are settled
 * with their group. Returns the stake returned (0 when nothing was outstanding).
 */
export function returnFormerExecutiveShares(g: GameState, b: BizState): number {
  if (inGroup(g, b)) return 0
  const held = b.ceo === 'manager' ? Math.max(0, b.manager?.equity ?? 0) : 0
  const recorded = Math.max(0, b.executiveEquity ?? 0)
  const former = recorded - held
  if (!(former > 1e-9)) return 0
  const before = b.share
  b.share = clampN(b.share + former, 0, 1)
  b.executiveEquity = held
  if (before > 0 && b.share > before) b.invested *= b.share / before
  const a = g.assets.find((x) => (x.details as unknown) === b)
  if (a) refreshValue(a, b)
  return b.share - before
}

/**
 * After a player's action changed a company's CEO: settle the departing CEO's shares now (a
 * division through a fresh write of its group). Only for top-level actions: code that holds a
 * group object of its own settles when it saves that group.
 */
export function settleAfterCeoChange(g: GameState, b: BizState): void {
  const id = groupIdOf(b)
  if (id && inGroup(g, b)) {
    const grp = liveGroup(g, id)
    if (grp) saveGroup(g, grp)
    return
  }
  returnFormerExecutiveShares(g, b)
}
