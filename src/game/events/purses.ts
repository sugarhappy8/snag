// Purses for the events and activities (R2-L8): the player and a person as the two ends of a move, with the arithmetic the old code had.
//
// The old event code handed the other side exactly what the event said: `p.money = Math.round(p.money + amt)` on one side, a rounding
// `addMoney` on the other. moveCash books what really moved, which for a rounded record or for player cash that erosion left fractional
// is a few cents more or less than `amt`, so these two purses report the whole change asked instead. Both ends keep their own
// rounding; the books get `amt`; nobody's money moves by a cent compared with the code they replace.
import { moveCash, personPurse, playerPurse, type Purse } from '../cash'
import type { Reason } from '../kernel/reasons'
import type { GameState, Person } from '../types'

/**
 * A person's purse that keeps their money on a whole dollar after every change, as the old `p.money = Math.round(p.money + x)` lines did.
 * It reports the whole change asked, so moveCash books `amount` and the other purse gets `amount`, whatever the rounding of this record.
 */
export function wholePurse(p: Person): Purse {
  const inner = personPurse(p)
  return {
    acct: inner.acct,
    add(delta) {
      const before = p.money
      if (!Number.isFinite(before) || !Number.isFinite(delta)) return 0
      inner.add(Math.round(before + delta) - before)
      return delta
    },
  }
}

/** The player's cash, rounded as the wrappers round it, that reports the whole change asked (see the top of this file). */
export function askedPurse(g: GameState): Purse {
  const inner = playerPurse(g)
  return {
    acct: inner.acct,
    add(delta) {
      inner.add(delta)
      return delta
    },
  }
}

/** The player gives a person money, one booking, the person's record kept on a whole dollar. False (nothing booked) when the player is short, as `spend` is. */
export function payPersonWhole(g: GameState, p: Person, amount: number, reason: Reason): boolean {
  if (!Number.isFinite(g.character.money) || !Number.isFinite(amount)) return false
  if (amount <= 0) return true
  if (g.character.money < amount) return false
  moveCash(g, askedPurse(g), wholePurse(p), amount, reason)
  return true
}
