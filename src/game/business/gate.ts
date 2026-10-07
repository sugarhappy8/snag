// Shared gating and small notices for business menus.
import { formatMoney, notice } from '../core'
import type { Asset, GameState } from '../types'
import { findBusiness } from './state'

/** Why the player can't manage this business right now, or null. */
export function manageBlock(g: GameState, a: Asset): string | null {
  const c = g.character
  if (!c.alive) return 'You are no longer alive.'
  if (c.prison) return "You can't run a company from a prison cell. Your general manager is handling it."
  if (c.age < 18) return 'You must be 18 to run a company. Its general manager makes these calls until then.'
  if (!findBusiness(g, a.id)) return 'You no longer own this business.'
  return null
}

/** Why the player can't start or buy a business right now, or null. */
export function foundBlock(g: GameState): string | null {
  const c = g.character
  if (!c.alive) return 'You are no longer alive.'
  if (c.prison) return "You can't register a company from prison."
  if (c.age < 18) return 'You must be 18 to register a company.'
  return null
}

export function tooBusy(g: GameState, what: string): void {
  notice(g, 'Not Again This Year', `You've already ${what} this year. Give it until next year.`, { emoji: '\u{23F3}' })
}

export function noCash(g: GameState, a: Asset, need: number, what: string): void {
  notice(g, 'Not Enough Company Cash', `${a.name} doesn't have the cash for ${what} (${formatNeed(need)} needed). Inject some of your own money or take a company loan.`, {
    emoji: '\u{1F4B8}',
    tone: 'bad',
  })
}

function formatNeed(n: number): string {
  return formatMoney(n)
}
