// The debt record and its servicing (R4-E10b, D.4, X24, X40, C9, C37, C39): what a person is owed, who owes it, and the yearly step that
// pays it down. One record in one place: `Edge.dv = [owed, ratePct, since, kind, paid]` on the edge `debtor > creditor`, kind 0 a loan
// (this task) and 1 a divorce (L7). No separate shard, no new ledger reason, and no mint or burn: every dollar a debt moves goes through
// cash.moveCash from one purse to another, under `support` (a loan) or `divorce`.
//
// The record. `owed` is what the debt has grown to (the principal and the interest added so far), `paid` what has been paid, so
// `owed - paid` is what is still owed and `owed > paid` is exactly "an unpaid debt" of edgeLocalBound. A debt that has been paid in full
// is taken off the edge (the edge stays), so the 40 slots of EDGE_CAPS.debts are the debts that are open. `readDv` reads a record the
// way the edge normalizer does and answers null for anything else: a hostile record is no debt.
//
//   debtsOf(g, ego)      the debts that touch the ego, oldest first (ties by key): { key, owed, owedBy, kind }. `owed` is what is still
//                        owed, `owedBy` is true when the ego is the debtor (the key starts at the ego) and false when the ego is owed
//                        (the mirror of the legacy record, `data.w.owes`, that E7's syncLegacy keeps on person > ego; its repayment
//                        stays in collectLoans). Pure, total.
//   serviceDebt(g, key, amount, token, from?)
//                        pays down the debt of the ego on `key` (a key that starts at the ego) by up to `amount`, a whole number of
//                        dollars, out of `from` (the player's purse when it is not given, and then never more than the cash the
//                        player has) into the creditor's purse, once per token, and answers what was paid (0 for anything that is
//                        not a payment). It records the payment in dv[4] and takes the record off the edge when the debt is paid.
//                        It books under `support` for a loan and `divorce` for a divorce debt and refuses every other kind; it never
//                        creates and never destroys a dollar. The authorization is in the function: an unstamped life, a key of
//                        another owner, a creditor who is not in the game, is dead or is a pet, and a token already booked this year
//                        all answer 0 and change nothing.
//   debtToken(kind, year, key, extra?)
//                        `<kind>:<year>:<8 hex of fnv1a(extra|key)>`, under 40 characters. The ledger cuts a token at 80 characters and
//                        an edge key can be 95, so a token built from the key and ending in the year would lose the year (a later year
//                        would read as a replay) and two long keys would collide. The year comes first, then eight hex digits of the
//                        key. L6 (the estate) and L7 (the divorce) call the same helper.
//   DEBT_KIND            { loan: 0, divorce: 1 }.
//
// The yearly step, `serviceDebts` (kind 0 only; L7's pass serves the divorce debts), runs inside the one `society.acts` entry and is
// idempotent by that entry's stamp, by the ledger token of the year and by the memory it writes. For each loan the player owes that was
// taken in an earlier year, oldest first:
//   1. a lender who is gone, dead or a pet lets the debt lapse (the record goes, no money moves);
//   2. interest: for the first `accrualYears(rate)` years after the loan, `floor(rate% x what is still owed)` is added to `owed`.
//      accrualYears is the most years that keep (1 + rate)^years at 3 or less, and the interest is on what is still owed, so a debt
//      can never pass 3 x its principal whatever is paid or missed (a shark at 60% stops after two years, at 2.56 x; an ordinary
//      lender at 5% after 22);
//   3. payment: `min(still owed, floor(20% of the cash above a reserve))`, the reserve being a quarter of a typical year's pay
//      (typicalIncome of the seam). The cash never goes below the reserve for a payment, and so never below 0;
//   4. the year is told: a part payment through the status row `debt.owe` (it speaks when the debt halves or after 5 quiet years), the
//      last payment through a line of the repay pool, a missed year (nothing paid) through the default pool. A missed year writes the
//      memory `loan_unpaid` (weight 2 when the last one is from the 3 years before), costs the lender's regard 3 points and, for a
//      sharp lender (a rate of 25% or more), queues `A Lender Calls`.
//
// `A Lender Calls` is a choice (pay what you can, ask for time, ignore the call). It spends one of the year's three family choices
// (`useFamilyAct(g, 'social')`), waits PACE.askGap years between calls in the family `pop.kin.lender` and is not deferrable at the year
// close (DEFERRABLE_SCRIPTS has no entry for it). Its luck is the stream `social`.
//
// Layer 3 (society). It imports core, the scripts registry, the kernel, the text kit, world/ and, for the purses, society/acts.ts (the one
// file of society/ that reaches cash.ts, so the layer baseline stays at two). No events/, no business/.
import { addRelationship, formatMoney, getPerson, log, notice, scriptChoice } from '../core'
import type { EntityRef } from '../kernel/ids'
import { tokenSeen } from '../kernel/ledger'
import { personEntity } from '../kernel/person-ref'
import type { Reason } from '../kernel/reasons'
import type { RelKind } from '../kernel/relations'
import { defineScript } from '../scripts'
import { fnv1a } from '../text/hash'
import { askGapOk, notePopup, paceKey } from '../text/pace'
import { pickLine } from '../text/pick'
import { DEBT_DEFAULT_LINES, DEBT_REPAY_LINES } from '../text/pools'
import { fillSlots, stateLine } from '../text/state'
import type { GameState, Json, Person } from '../types'
import { memoriesOf, readEdge, edgesOf, type Edge, type EdgeKey } from '../world/edges'
import { putEdge, remember } from '../world/edge-write'
import { playerRef } from '../world/people'
import { SEEN_MAX, SEEN_MIN } from '../world/rows'
import { socialOn } from '../world/social'
import { actRoll, endsOfKey, moveCash, personPurse, playerPurse, type Purse } from './acts'
import { useFamilyAct } from './budget'
import { my } from './favor'
import { typicalIncome } from './seam'

/** The kinds of debt the record knows (`dv[3]`). A kind from 2 to 9 is valid in the record and is not serviced. */
export const DEBT_KIND = Object.freeze({ loan: 0, divorce: 1 } as const)

/** The kinds a token is made for: a loan taken, a yearly service, a divorce payment, the payment out of an estate. */
export type DebtTokenKind = 'loan' | 'debt' | 'divorce' | 'estate'

/** The most a debt may reach, as a multiple of its principal (design: a lender's interest stops at 3 x). */
export const INTEREST_CEILING = 3
/** The share of the cash above the reserve that one year's service takes, and the reserve as a share of a typical year's pay. */
export const SERVICE_SHARE = 0.2
export const RESERVE_SHARE = 0.25
/** A rate of this much a year or more is a sharp lender's (the traits sneaky, manipulative and stingy give 25 to 60). */
export const SHARP_RATE = 25
/** The share of the cash that `A Lender Calls` lets the player pay on the spot. */
export const CALL_SHARE = 0.5
/** A debt, a payment and a year as the edge model bounds them (world/edges.ts). */
const MONEY_MAX = 1e12
const RATE_MAX = 60
const KIND_MAX = 9
/** The year a token is made with is cut to a number the ledger would accept. */
const TOKEN_YEAR_MAX = 999_999

/** The script id of `A Lender Calls`. */
export const LENDER_SCRIPT = 'society.lender'

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
const isMoney = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= MONEY_MAX
const isYear = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= SEEN_MIN && x <= SEEN_MAX

// ---------------------------------------------------------------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------------------------------------------------------------

/** The debt record as an object: the five numbers of `Edge.dv`. */
export interface Debt {
  owed: number
  rate: number
  since: number
  kind: number
  paid: number
}

/** The tuple of a debt, as the edge stores it. */
export const tupleOf = (d: Debt): NonNullable<Edge['dv']> => [d.owed, d.rate, d.since, d.kind, d.paid]

/**
 * The debt on an edge (anything with a `dv`), or null when there is none or the record is not valid: five numbers, owed and paid from 0
 * to a trillion, a rate from 0 to 60, a whole year, a kind from 0 to 9. Read off the object itself, never its prototype. Total.
 */
export function readDv(e: unknown): Debt | null {
  try {
    if (e === null || typeof e !== 'object' || !hasOwn(e, 'dv')) return null
    const raw: unknown = (e as { dv?: unknown }).dv
    if (!Array.isArray(raw) || raw.length !== 5) return null
    const [owed, rate, since, kind, paid] = raw as unknown[]
    if (!isMoney(owed) || !isMoney(paid) || typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > RATE_MAX) return null
    if (!isYear(since) || typeof kind !== 'number' || !Number.isInteger(kind) || kind < 0 || kind > KIND_MAX) return null
    return { owed, rate, since, kind, paid }
  } catch {
    return null
  }
}

/** What is still owed on a debt: 0 or more. */
export const stillOwed = (d: Debt): number => Math.max(0, d.owed - d.paid)

/** The token of one payment on one debt: `<kind>:<year>:<8 hex of fnv1a(extra|key)>`, under 40 characters, the year first. */
export function debtToken(kind: DebtTokenKind, year: number, key: EdgeKey, extra?: string): string {
  const y = Number.isFinite(year) ? Math.min(TOKEN_YEAR_MAX, Math.max(0, Math.trunc(year))) : 0
  return `${kind}:${y}:${fnv1a(`${extra ?? ''}|${key}`).toString(16).padStart(8, '0')}`
}

/** The person of the game that stands for a ref, or undefined. */
export function personOfRef(g: Pick<GameState, 'people'>, ref: EntityRef): Person | undefined {
  return g.people.find((p) => personEntity(p) === ref)
}

/** One row of debtsOf. */
export interface DebtRow {
  key: EdgeKey
  /** What is still owed: owed less paid, 0 or more. */
  owed: number
  /** True when the ego is the debtor (the key starts at the ego). */
  owedBy: boolean
  kind: number
}

/** The debts that touch the ego, oldest first (ties by key). Pure and total: a record that is not valid is not listed. */
export function debtsOf(g: Pick<GameState, 'world'>, ego: EntityRef): readonly DebtRow[] {
  const rows: (DebtRow & { since: number })[] = []
  for (const [key, e] of edgesOf(g, ego)) {
    const d = readDv(e)
    const ends = endsOfKey(key)
    if (d === null || ends === null || ends[0] === ends[1]) continue
    rows.push({ key, owed: stillOwed(d), owedBy: ends[0] === ego, kind: d.kind, since: d.since })
  }
  rows.sort((a, b) => a.since - b.since || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return rows.map(({ key, owed, owedBy, kind }) => ({ key, owed, owedBy, kind }))
}

// ---------------------------------------------------------------------------------------------------------------------------------
// serviceDebt
// ---------------------------------------------------------------------------------------------------------------------------------

/** The ledger reason of a kind of debt. */
const REASON_OF: Readonly<Record<number, Reason>> = Object.freeze({ 0: 'support', 1: 'divorce' })

/**
 * Pays down the ego's debt on `key`: see the header. Answers what was paid, a whole number of dollars, or 0. A payment that leaves less
 * than a dollar owed takes the record off the edge; a debt that is already down to less than a dollar pays nothing (the yearly step lets
 * it go).
 */
export function serviceDebt(g: GameState, key: EdgeKey, amount: number, token: string, from?: Purse): number {
  if (!socialOn(g)) return 0
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 1) return 0
  if (typeof token !== 'string' || token === '') return 0
  const ends = endsOfKey(key)
  if (ends === null || ends[0] === ends[1] || ends[0] !== playerRef(g)) return 0
  const d = readDv(readEdge(g, ends[0], ends[1]))
  if (d === null) return 0
  const reason = REASON_OF[d.kind]
  if (reason === undefined) return 0
  const creditor = personOfRef(g, ends[1])
  if (creditor === undefined || !creditor.alive || creditor.relation === 'pet') return 0
  const left = stillOwed(d)
  if (left < 1 || tokenSeen(g, token)) return 0
  // the player's own purse has no floor, so the cash it can pay is read here: a payment never takes the cash below 0. A purse that is
  // given (an estate) answers for itself.
  const cash = from === undefined ? (Number.isFinite(g.character.money) ? Math.floor(g.character.money) : 0) : Number.POSITIVE_INFINITY
  const pay = Math.min(Math.floor(amount), left, cash)
  if (!(pay >= 1)) return 0
  const give = moveCash(g, from ?? playerPurse(g), personPurse(creditor), pay, reason, token)
  if (!(give > 0)) return 0
  const paid = Math.min(left, Math.round(give))
  putEdge(g, key, { dv: left - paid < 1 ? undefined : tupleOf({ ...d, paid: d.paid + paid }) })
  return paid
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Interest and what is due
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * The years a loan at `rate` percent a year can add interest: the most years that keep (1 + rate)^years at 3 or less, so the debt, at
 * the interest on what is still owed, never passes 3 x its principal. 0 for a rate that is 0 or not a number.
 */
export function accrualYears(rate: number): number {
  if (typeof rate !== 'number' || !(rate > 0) || !Number.isFinite(rate)) return 0
  const r = 1 + Math.min(rate, RATE_MAX) / 100
  const step = Math.log(r)
  if (!(step > 0)) return 0
  let k = Math.floor(Math.log(INTEREST_CEILING) / step)
  while (k > 0 && r ** k > INTEREST_CEILING) k--
  return k
}

/**
 * The debt after the interest of `year`: the nth year after the loan (`year - since`) adds floor(rate% x what is still owed) when n is 1 to
 * accrualYears(rate), and nothing else does. A new object only when something was added. Pure.
 */
export function accrue(d: Debt, year: number): Debt {
  const n = year - d.since
  if (!(d.rate > 0) || !(n >= 1) || n > accrualYears(d.rate)) return d
  const add = Math.floor((stillOwed(d) * d.rate) / 100)
  return add > 0 ? { ...d, owed: Math.min(MONEY_MAX, d.owed + add) } : d
}

/** The cash kept back from the service: a quarter of a typical year's pay where the player lives. */
export function reserveOf(g: Readonly<GameState>): number {
  return Math.round(RESERVE_SHARE * typicalIncome(g as GameState))
}

/** What one year's service takes on a debt: min(still owed, 20% of the cash above the reserve), a whole number, 0 or more. */
export function dueOf(g: Readonly<GameState>, d: Debt): number {
  const cash = g.character.money
  if (typeof cash !== 'number' || !Number.isFinite(cash)) return 0
  const room = cash - reserveOf(g)
  return room > 0 ? Math.max(0, Math.min(Math.floor(stillOwed(d)), Math.floor(SERVICE_SHARE * room))) : 0
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The yearly step
// ---------------------------------------------------------------------------------------------------------------------------------

/** A change of the lender's regard, through the shim of core.ts (the one caller of it in this file). */
function feel(g: GameState, p: Person, delta: number, kind?: RelKind): void {
  addRelationship(g, p, delta, kind)
}

/** Does the edge carry a memory of this kind made in `year` or later? */
function remembered(e: Readonly<Edge>, kind: string, since: number): boolean {
  return memoriesOf(e).some((m) => m.kind === kind && m.year >= since)
}

/** The sharp lender calls: a choice, if the family has room for one and the family has not spoken lately. */
function lenderCalls(g: GameState, key: EdgeKey, lender: Person, left: number): void {
  const family = paceKey('kin', 'lender')
  if (!askGapOk(g, family) || !useFamilyAct(g, 'social')) return
  notePopup(g, family)
  scriptChoice(
    g,
    LENDER_SCRIPT,
    'A Lender Calls',
    `${lender.firstName} wants ${formatMoney(left)} and got nothing from you this year. What will you do?`,
    [
      { id: 'pay', label: 'Pay what you can', emoji: '\u{1F4B5}' },
      { id: 'time', label: 'Ask for more time', emoji: '\u{23F3}' },
      { id: 'ignore', label: 'Ignore the call', emoji: '\u{1F4F5}' },
    ],
    { emoji: '\u{1F4DE}', data: { pid: lender.id, key }, personId: lender.id },
  )
}

/** One loan, one year (see the header). The caller has checked that the record is a loan of the ego's. */
function serveLoan(g: GameState, key: EdgeKey, year: number): void {
  const ends = endsOfKey(key)
  if (ends === null) return
  const edge = readEdge(g, ends[0], ends[1])
  const d0 = readDv(edge)
  if (edge === null || d0 === null || d0.since >= year) return
  const lender = personOfRef(g, ends[1])
  if (lender === undefined || !lender.alive || lender.relation === 'pet' || stillOwed(d0) < 1) {
    // the lender is gone, or the debt is down to dust: the record goes and no money moves
    putEdge(g, key, { dv: undefined })
    return
  }
  const token = debtToken('debt', year, key)
  if (tokenSeen(g, token) || remembered(edge, 'loan_unpaid', year)) return

  const d = accrue(d0, year)
  if (d !== d0) putEdge(g, key, { dv: tupleOf(d) })
  const due = dueOf(g, d)
  const paid = due >= 1 ? serviceDebt(g, key, due, token) : 0
  const left = Math.max(0, stillOwed(d) - paid)
  const ego = playerRef(g)
  if (paid > 0 && left < 1) {
    remember(g, ego, 'loan_repaid', { w: 2, by: 'them', with: ends[1] })
    feel(g, lender, 3)
    log(g, fillSlots(pickLine(g, DEBT_REPAY_LINES), { money: formatMoney(paid), who: my(lender) }), 'good')
  } else if (paid > 0) {
    remember(g, ego, 'loan_repaid', { w: 1, by: 'them', with: ends[1] })
    feel(g, lender, 1)
    const line = stateLine(g, 'debt.owe', left, { id: lender.id, slots: { who: my(lender), money: formatMoney(left) } })
    if (line !== null) log(g, line)
  } else {
    // a missed year: the last miss decides how heavy this one is and whether the line is said again
    const lately = remembered(edge, 'loan_unpaid', year - 3)
    remember(g, ego, 'loan_unpaid', { w: lately ? 2 : 1, by: 'them', with: ends[1] })
    feel(g, lender, -3, 'offence')
    if (!lately) log(g, fillSlots(pickLine(g, DEBT_DEFAULT_LINES), { who: my(lender) }), 'bad')
    if (d.rate >= SHARP_RATE) lenderCalls(g, key, lender, left)
  }
}

/**
 * The yearly service of the loans the player owes (kind 0, the debts that start at the ego), oldest first. A life that is not stamped is
 * not touched. It runs inside the one `society.acts` entry (society/module.ts).
 */
export function serviceDebts(g: GameState): void {
  if (!socialOn(g)) return
  const year = g.year
  if (!isYear(year)) return
  for (const row of debtsOf(g, playerRef(g))) if (row.owedBy && row.kind === DEBT_KIND.loan) serveLoan(g, row.key, year)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A Lender Calls
// ---------------------------------------------------------------------------------------------------------------------------------

/** What the popup is about: the lender and the open loan, read again from the state it is answered in. Null when there is none. */
function callOf(g: GameState, data: Json | undefined): { lender: Person; key: EdgeKey; debt: Debt } | null {
  if (!socialOn(g) || data === null || typeof data !== 'object' || Array.isArray(data) || data === undefined) return null
  const pid = (data as { pid?: unknown }).pid
  const key = (data as { key?: unknown }).key
  if (typeof pid !== 'string' || typeof key !== 'string') return null
  const lender = getPerson(g, pid)
  const ends = endsOfKey(key)
  if (lender === undefined || !lender.alive || lender.relation === 'pet' || ends === null) return null
  if (ends[0] !== playerRef(g) || ends[1] !== personEntity(lender)) return null
  const debt = readDv(readEdge(g, ends[0], ends[1]))
  return debt === null || debt.kind !== DEBT_KIND.loan || stillOwed(debt) < 1 ? null : { lender, key, debt }
}

defineScript(LENDER_SCRIPT, (g, choice, data) => {
  const call = callOf(g, data)
  if (call === null) return
  const { lender, key, debt } = call
  const name = lender.firstName
  const ego = playerRef(g)
  const left = stillOwed(debt)
  if (choice === 'pay') {
    const cash = Number.isFinite(g.character.money) ? Math.max(0, g.character.money) : 0
    const want = Math.min(left, Math.floor(CALL_SHARE * cash))
    const paid = want >= 1 ? serviceDebt(g, key, want, debtToken('debt', g.year, key, 'call')) : 0
    if (paid <= 0) {
      feel(g, lender, -1, 'offence')
      notice(g, 'Nothing to Give', `You had nothing to give ${name}.`)
      return
    }
    const rest = left - paid
    remember(g, ego, 'loan_repaid', { w: rest < 1 ? 2 : 1, by: 'them', with: personEntity(lender) })
    feel(g, lender, rest < 1 ? 3 : 2)
    notice(g, 'Paid Down', `You paid ${name} ${formatMoney(paid)}. ${rest < 1 ? 'The loan is closed.' : `${formatMoney(rest)} to go.`}`)
  } else if (choice === 'time') {
    const odds = Math.min(0.8, Math.max(0.1, 0.3 + (0.4 * lender.relationship) / 100 - (debt.rate >= SHARP_RATE ? 0.2 : 0)))
    if (actRoll(g, 'lender.time', key)() < odds) {
      notice(g, 'More Time', `${name} gave you until next year.`)
    } else {
      feel(g, lender, -3, 'offence')
      notice(g, 'No More Time', `${name} said no.`)
    }
  } else if (choice === 'ignore') {
    feel(g, lender, -6, 'offence')
    notice(g, 'Left Unanswered', `You let ${name}'s call ring out.`)
  }
})
