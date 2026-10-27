// The divorce debt (R4-L7, A.K8 b, D4, X24, X35, C9, C37): what the judge orders and the player cannot pay today is owed and paid over years, in
// the open. Until R4 the shortfall was forgiven at once (love.ts divorce): the order was a number in a notice and the rest of it simply vanished.
// On a life the social stamp marks (X6) it is a debt of the player's, on the edge `player > ex`, as the one record of the edge model: `Edge.dv =
// [owed, ratePct, since, kind, paid]`, kind 1 (DEBT_KIND.divorce). A life that is not stamped keeps the old forgiveness byte for byte.
//
//   openDivorceDebt(g, ex, owed)   writes the edge and moves no cash. Called by love.ts from inside `divorce`, BEFORE `p.relation = 'exSpouse'`, so
//                                  the partner is still a `spouse` here: it takes a spouse, an exSpouse or an ex (a check for "is already an
//                                  ex" would refuse every real call) and nothing else. The authorization is in the function (design 14.1
//                                  invariant 4): it answers false and changes nothing for an unstamped life, a player who is dead, a person
//                                  who is not in the game (the live Person is read, never the copy it is given), is dead, is a pet or has
//                                  another relation, a sum that is not a debt, an edge that already carries a loan, and a table with
//                                  EDGE_CAPS.debts (40) open debts. A second order for the same ex (they married and parted twice) joins the
//                                  first, so the table is one slot and the clock starts over. An unpaid `dv` makes the edge bound at the
//                                  edge alone (edgeLocalBound), so the edge cap and E7's orphan rule keep it.
//   serveDivorceDebts(g)           the yearly step (module life.debts, aging, money, order 75, after the year's income and tax, before the
//                                  family): the debts of kind 1 the player owes, oldest first, each pays min(still owed, floor(20% of the cash))
//                                  to the ex through serviceDebt (society/contract.ts: reason `divorce`, one token a debt a year, so a second
//                                  call in the year pays nothing; `dv[4]` records the total paid). A debt reads the cash that is left after the
//                                  debts before it, so the cash never goes below 0 and k debts take at most 1 - 0.8^k of it. It says the payment
//                                  through the state row `divorce.pay`. The rest lapses after 10 years, or when the ex is gone, dead or a pet,
//                                  with one DIVORCE_LAPSE line and no money moved (no deposit was created, so no `writeoff` burn). When the
//                                  player dies L6 pays what is left out of the estate first (modules/heirs.ts), so nothing here runs for a
//                                  dead player.
//
// E10b's yearly pass serves kind 0 (the loans) only, so the two never touch the same debt (X24). The ex's shortfall to the player (love.ts: the
// richer ex who cannot pay) stays forgiven: NPC exes have no income path in R4 (X35).
//
// A pure function of the state, no luck: no g.rng, no stream (the sentence picks go through the text kit, which draws nothing from the life's
// roll), the ledger the only place a dollar moves. Idempotent by the ledger token of the year (a second call in the year pays nothing) and by
// the edge (a lapsed debt is off it). Every number is bounded: a debt is at most a trillion, a year's payment a fifth of the cash, the table 40.
//
// Domain life (a root file, layer 3). It reaches society/ only through its one door (society/contract.ts) and imports no events/ or business/ file.
import { formatMoney, getPerson, log } from './core'
import type { EntityRef } from './kernel/ids'
import { personEntity } from './kernel/person-ref'
import { DEBT_KIND, debtToken, debtsOf, openDebts, serviceDebt } from './society/contract'
import { pickLine } from './text/pick'
import { DIVORCE_LAPSE } from './text/pools'
import { fillSlots, stateLine } from './text/state'
import type { GameState, Person, RelationKind } from './types'
import { EDGE_CAPS } from './world/caps'
import { edgeKey, readEdge, type Edge, type EdgeKey } from './world/edges'
import { putEdge } from './world/edge-write'
import { playerRef } from './world/people'
import { SEEN_MAX, SEEN_MIN } from './world/rows'
import { socialOn } from './world/social'

/** The share of the cash that one debt's payment takes in a year. */
export const DIVORCE_SHARE = 0.2
/** The years after which what is left lapses: the debt of year Y lapses in year Y + 10, after that year's payment. */
export const DIVORCE_YEARS = 10
/** The most a debt may hold (the edge model's bound for a sum). */
export const DIVORCE_MAX = 1e12

/** The relations a divorce debt can be written for: the divorcing partner (still a spouse when love.ts asks), an ex-spouse and an ex. */
const OPEN_RELATIONS: ReadonlySet<RelationKind> = new Set<RelationKind>(['spouse', 'exSpouse', 'ex'])

const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX
const isMoney = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= DIVORCE_MAX

/** The record of a new edge: nothing is known of it yet, so every field starts at the middle (what `remember` writes for a new edge). */
const blankEdge = (year: number): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: year, l: year })

/**
 * Writes the debt of `owed` dollars (a whole number from 1 to a trillion; a fraction is rounded) on the edge player > ex. True when the edge
 * holds it, false, with nothing written, when it can't: see the header. Moves no cash and draws nothing.
 */
export function openDivorceDebt(g: GameState, ex: Person, owed: number): boolean {
  if (!socialOn(g) || !g.character.alive) return false
  if (typeof owed !== 'number' || !Number.isFinite(owed)) return false
  const sum = Math.min(DIVORCE_MAX, Math.round(owed))
  if (!(sum >= 1) || !isYear(g.year)) return false
  if (typeof ex !== 'object' || ex === null || typeof ex.id !== 'string') return false
  // the person of the game decides, never the copy: a copy that says alive of an ex who is dead is no one to owe
  const live = getPerson(g, ex.id)
  if (live === undefined || !live.alive || !OPEN_RELATIONS.has(live.relation)) return false
  const to = personEntity(live)
  if (to === 'pool:other') return false
  const ego = playerRef(g)
  const key = edgeKey(ego, to)
  if (key === null) return false
  const old = readEdge(g, ego, to)
  let total = sum
  if (old?.dv !== undefined) {
    // a loan between the two stays its own record; an order for the same ex joins the first and the clock starts over
    if (old.dv[3] !== DEBT_KIND.divorce) return false
    total = Math.min(DIVORCE_MAX, Math.max(0, old.dv[0] - old.dv[4]) + sum)
  } else if (openDebts(g) >= EDGE_CAPS.debts) return false
  const dv: NonNullable<Edge['dv']> = [total, 0, g.year, DEBT_KIND.divorce, 0]
  return putEdge(g, key, old === null ? { ...blankEdge(g.year), dv } : { dv })
}

/** The debt is let go: the record leaves the edge (the edge stays) and one line says so. No money moves. */
function lapse(g: GameState, key: EdgeKey, left: number): void {
  putEdge(g, key, { dv: undefined })
  log(g, fillSlots(pickLine(g, DIVORCE_LAPSE), { money: formatMoney(left) }))
}

/** One debt, one year: pay a fifth of the cash, say it, and let the rest go when the time or the ex is up. */
function serveOne(g: GameState, year: number, key: EdgeKey, ego: EntityRef): void {
  const to = key.slice(ego.length + 1) as EntityRef
  const dv = readEdge(g, ego, to)?.dv
  if (dv === undefined || dv[3] !== DEBT_KIND.divorce || !isMoney(dv[0]) || !isMoney(dv[4]) || !isYear(dv[2])) return
  const [total, , since, , paid0] = dv
  const left0 = total - paid0
  if (left0 < 1) {
    // down to dust: let it go without a word
    putEdge(g, key, { dv: undefined })
    return
  }
  const ex = g.people.find((p) => personEntity(p) === to)
  if (ex === undefined || !ex.alive || ex.relation === 'pet') {
    lapse(g, key, left0)
    return
  }
  const cash = g.character.money
  const fifth = typeof cash === 'number' && Number.isFinite(cash) && cash > 0 ? Math.floor(DIVORCE_SHARE * cash) : 0
  const want = Math.min(Math.floor(left0), fifth)
  const paid = want >= 1 ? serviceDebt(g, key, want, debtToken('divorce', year, key)) : 0
  const left = left0 - paid
  if (paid > 0) {
    const share = left >= 1 ? Math.min(1, (paid0 + paid) / total) : 1
    const line = stateLine(g, 'divorce.pay', share, { id: ex.id, slots: { who: `my ex ${ex.firstName}`, money: formatMoney(paid) } })
    if (line !== null) log(g, line)
  }
  if (left >= 1 && year - since >= DIVORCE_YEARS) lapse(g, key, left)
}

/**
 * The yearly step: every divorce debt the player owes is served, oldest first, a fifth of the cash each. A life that is not stamped, a player who
 * is dead and a year that is not a year are not touched. Idempotent by the token of the year (one for each debt).
 */
export function serveDivorceDebts(g: GameState): void {
  if (!socialOn(g) || !g.character.alive || !isYear(g.year)) return
  const ego = playerRef(g)
  const rows = debtsOf(g, ego).filter((r) => r.owedBy && r.kind === DEBT_KIND.divorce)
  for (const row of rows) serveOne(g, g.year, row.key, ego)
}
