// R2-L3: helpers for scenario tests that move money. No vitest import, so any test file (and any later track) can use them.
//
//   booksOf(g)               the player's cash and the player's account right now
//   driftSince(g, before)    the cash change minus the account change since `before`: 0 when every change was booked
//   flowTotal(...)           what a class gained (positive) or lost under a reason, from the flow rows
//   acctOf(g, acct)          the balance of an account, in whole dollars
//   expectConserved(g)       throws, listing the problems, unless the books balance
import { acctBalance, checkLedger, flowsOf, playerAcct, type AcctClass, type AcctRef } from '../src/game/kernel/ledger'
import type { Reason } from '../src/game/kernel/reasons'
import type { GameState } from '../src/game/types'

export interface Books {
  /** The player's cash. */
  cash: number
  /** The player's account in the ledger. */
  acct: number
}

export function booksOf(g: GameState): Books {
  return { cash: g.character.money, acct: acctBalance(g, playerAcct(g)) }
}

/** Zero when the cash and the account moved together since `before`. */
export function driftSince(g: GameState, before: Books): number {
  const now = booksOf(g)
  return now.cash - before.cash - (now.acct - before.acct)
}

/** What `cls` gained under `reason` in one year and country (defaults: this year, the player's country). Zero when there is no such row. */
export function flowTotal(g: GameState, reason: Reason, cls: AcctClass, year: number = g.year, country: string = g.character.countryId): number {
  const row = flowsOf(g, year).find((r) => r.reason === reason && r.country === country)
  return row ? row.net[cls] : 0
}

export function acctOf(g: GameState, acct: AcctRef): number {
  return acctBalance(g, acct)
}

/** Throws unless the books balance (the same check the probes run). */
export function expectConserved(g: GameState): void {
  const r = checkLedger(g)
  if (!r.ok) throw new Error(`the books do not balance: ${r.problems.join('; ')}`)
}
