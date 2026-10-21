// Cash for everything that is not the player's wallet, and the moves between wallets (R2, design 4.2).
//
// The three primitives in core.ts (addMoney, spend, earnIncome) book the player's own cash. This file does the rest: a person's money,
// a company's cash, a move between two purses, a loan's creation and its write-off, and the yearly erosion of held cash. Every
// function applies the change to the record it was handed and books the same dollars in the ledger (kernel/ledger.ts), so the books
// cannot part from the cash. Nothing here rounds a record that did not round itself: NPC wealth and company cash are floats, the
// ledger books whole dollars (Math.round of what was applied), and the half dollar in between is the only slack there is.
//
// A purse is a place cash lives: the player, a person, a company, or a pool (an anonymous crowd that has no record, only an account).
// moveCash moves between two purses and books once; the one-sided helpers (personCash, firmCash) take the other side from the
// reason's default counterparty (kernel/reasons.ts) or from `with`.
//
// Imports ./core, the kernel and types only: no business, no nation, so the money layer stays out of the import cycles.
import { canAfford } from './core'
import { book, bookAcct, bookBurn, bookMint, playerAcct, roomFor, tokenSeen, type AcctRef, type Why } from './kernel/ledger'
import { parseRef } from './kernel/ids'
import { counterparty, type PoolName, type Reason } from './kernel/reasons'
import type { GameState, Person } from './types'

/** A place cash lives: an account name and a way to change the record behind it. */
export interface Purse {
  readonly acct: AcctRef
  /** Applies a change to the record and returns what was applied (a floor or a bad number can make it less than asked, or 0). */
  add(delta: number): number
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** A plain zero for a change that came to nothing (`-0` reads as a difference in `toBe` and in JSON). */
const plain = (n: number): number => (n === 0 ? 0 : n)

// ---------------------------------------------------------------------------------------------------------------------------
// Purses
// ---------------------------------------------------------------------------------------------------------------------------

/** The player's cash, with the primitives' checks and whole-dollar rounding. It applies; moveCash books. */
export function playerPurse(g: GameState): Purse {
  return {
    acct: playerAcct(g),
    add(delta) {
      const before = g.character.money
      if (!finite(before) || !finite(delta) || !finite(before + delta)) return 0
      g.character.money = Math.round(before + delta)
      return plain(g.character.money - before)
    },
  }
}

/** `kind:key` when that is a valid account name, else null. A bad name would make the ledger refuse the booking and part it from the cash. */
function named(kind: string, key: unknown): AcctRef | null {
  return typeof key === 'string' && parseRef(`${kind}:${key}`) !== null ? (`${kind}:${key}` as AcctRef) : null
}

/** person:<sid> for a stranger with a text `sid`, else person:<id>; pool:other for a person whose id is no account name at all. */
function personAcct(p: Person): AcctRef {
  return named('person', p.data?.sid) ?? named('person', p.id) ?? 'pool:other'
}

/**
 * A person's money. The account is person:<sid> for a stranger that has a text `sid` in its data, else person:<id>. `floor` clamps
 * the record (0 for money that can never go below zero); with none it can go negative. Nothing is rounded.
 */
export function personPurse(p: Person, floor?: number): Purse {
  return {
    acct: personAcct(p),
    add(delta) {
      const before = p.money
      if (!finite(before) || !finite(delta)) return 0
      const next = Math.max(floor ?? Number.NEGATIVE_INFINITY, before + delta)
      if (!finite(next)) return 0
      p.money = next
      return plain(next - before)
    },
  }
}

/** The account of a company: firm:<id> when the id is a name an account can have, else pool:firms (the crowd of firms with no id). */
function firmAcct(firm?: string | { id: string }): AcctRef {
  return named('firm', typeof firm === 'string' ? firm : firm?.id) ?? 'pool:firms'
}

/** A company's cash (BizState.cash and the like). Pass the asset id so the books name the firm; without one the account is pool:firms. */
export function firmPurse(b: { cash: number }, firm?: string | { id: string }): Purse {
  return {
    acct: firmAcct(firm),
    add(delta) {
      if (!finite(delta)) return 0
      const before = b.cash
      b.cash = before + delta
      return plain(b.cash - before)
    },
  }
}

/** A pool (pool:retail, pool:hh:<country>): an account with no record, so adding to it changes nothing. */
export function poolPurse(name: PoolName, country?: string): Purse {
  return {
    acct: counterparty(name, country ?? 'xx'),
    add: (delta) => delta,
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Moving and changing cash
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Moves `amount` from one purse to another and books it once under `reason`. What moves is what the payer really gave: a payer with a
 * floor gives only what it had, and the receiver gets exactly that. Returns it (0 for a bad amount, a replayed token or an empty payer).
 * Never book a move as two one-sided calls.
 */
export function moveCash(g: GameState, from: Purse, to: Purse, amount: number, reason: Reason, token?: string): number {
  if (!finite(amount) || amount <= 0) return 0
  if (token !== undefined && tokenSeen(g, token)) return 0
  const give = -from.add(-amount)
  if (!(give > 0)) return 0
  to.add(give)
  book(g, reason, from.acct, to.acct, give, token)
  return give
}

/** The token a `why` carries, if any. */
function tokenOfWhy(why: Why): string | undefined {
  if (why === null || typeof why !== 'object') return undefined
  const t: unknown = why.token
  return typeof t === 'string' && t.length > 0 ? t : undefined
}

/**
 * Applies `delta` through `purse` and books what was applied against the reason's counterparty. A receipt whose payer is a capped mint
 * is clipped to the mint's room, and the books get the whole amount so the mint can clip it and log the cap row. Returns what was applied.
 */
function change(g: GameState, purse: Purse, why: Why, delta: number): number {
  if (!finite(delta) || delta === 0) return 0
  const token = tokenOfWhy(why)
  if (token !== undefined && tokenSeen(g, token)) return 0
  const room = delta > 0 ? roomFor(g, why) : Number.POSITIVE_INFINITY
  const clipped = delta > room
  const applied = purse.add(clipped ? room : delta)
  bookAcct(g, purse.acct, why, clipped ? applied + (delta - room) : applied)
  return applied
}

/**
 * A person's money changes by `delta` (a payment when negative) and the books follow: one-sided, the other side is the reason's default
 * counterparty. `floor` clamps the record (0 for "never below zero"); the books get what the clamp let through. Nothing is rounded.
 * Returns the change applied.
 */
export function personCash(g: GameState, p: Person, delta: number, why: Why, floor?: number): number {
  return change(g, personPurse(p, floor), why, delta)
}

/** A company's cash changes by `delta`, booked one-sided under `why`. Pass the asset id so the books name the firm. Returns the change applied. */
export function firmCash(g: GameState, b: { cash: number }, delta: number, why: Why, firm?: string | { id: string }): number {
  return change(g, firmPurse(b, firm), why, delta)
}

/** The player pays a person: false (and nothing booked) when the player cannot afford it. */
export function payPerson(g: GameState, p: Person, amount: number, reason: Reason): boolean {
  if (!canAfford(g, amount)) return false
  moveCash(g, playerPurse(g), personPurse(p), amount, reason)
  return true
}

// ---------------------------------------------------------------------------------------------------------------------------
// Credit and erosion
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * A lender creates what it lends: the lending mint credits `to` (pool:sellers by default). Clipped to the mint's yearly room.
 * Returns what was created.
 */
export function lend(g: GameState, principal: number, to?: AcctRef, token?: string): number {
  return bookMint(g, 'lending', to ?? 'pool:sellers', principal, 'loan.principal', token)
}

/** A debt removed without payment destroys the deposit it created: the write-off burn, from pool:banks by default. Returns what was burned. */
export function writeoff(g: GameState, amount: number, from?: AcctRef): number {
  return bookBurn(g, 'writeoff', from ?? 'pool:banks', amount, 'writeoff')
}

/**
 * The yearly erosion of the player's cash: the engine stores purchasing power, so held cash is divided by 1 + inflation. What it loses
 * is the declared inflation burn; what a negative balance (a debt) loses, or cash gains when prices fall, is the capped revaluation mint.
 * The cash keeps the engine's own arithmetic (it is not rounded: idle cash must stay fixed in local nominal units, to the cent, and
 * test/korean-cash.test.ts holds it there); the books take the whole dollars of the change, and the next whole-dollar booking
 * (every wrapper call rounds the cash) closes the gap of under half a dollar. The cash takes only what the ledger booked when a cap
 * clipped the burn or mint, so the rest stays unapplied. Returns the signed change of cash.
 */
export function erodeCash(g: GameState, inflation: number): number {
  const before = g.character.money
  if (!finite(inflation) || inflation <= -1 || !finite(before)) return 0
  const next = before / (1 + inflation)
  const me = playerAcct(g)
  if (next < before) {
    const done = bookBurn(g, 'inflation', me, before - next, 'inflation')
    g.character.money = done >= Math.round(before - next) ? next : before - done
  } else if (next > before) {
    const done = bookMint(g, 'revaluation', me, next - before, 'inflation')
    g.character.money = done >= Math.round(next - before) ? next : before + done
  }
  return plain(g.character.money - before)
}

/**
 * The erosion of a company's cash: `amount` is what it lost (negative when it gained). The books name the firm; the cash changes by
 * exactly `amount` (no rounding added) unless the burn or mint was clipped, in which case only what was booked applies.
 * Returns the signed change of cash.
 */
export function erodeFirm(g: GameState, b: { cash: number }, amount: number, firm?: string | { id: string }): number {
  if (!finite(amount) || amount === 0) return 0
  const purse = firmPurse(b, firm)
  const whole = Math.round(Math.abs(amount))
  const booked = amount > 0 ? bookBurn(g, 'inflation', purse.acct, whole, 'inflation') : bookMint(g, 'revaluation', purse.acct, whole, 'inflation')
  const applied = booked >= whole ? amount : Math.sign(amount) * booked
  return purse.add(-applied)
}
