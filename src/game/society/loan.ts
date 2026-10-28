// A loan between people (R4-E10b, D.4, X24, X54, C39): a person lends the player money, and the player owes it back with interest.
// Two SocialActs share one set of rules and one consequence: `loanAct(amount)`, the ask (the lender says yes with the odds below), and
// `lendAct(amount)`, the loan as a fact (a lender who has already agreed: a scene or a later release grants it without a roll). Both are
// pure `blocked` and `plan`; `runAct` (society/acts.ts) is the only place either writes, so the authorization is in the function.
//
// The terms (`loanTerms`, pure, a function of the lender and the year alone, so the menu can show them before the player asks):
//   cap     the most the lender will lend: min(25% of the lender's cash, 2 x typicalIncome(g)), a whole number. The typical income is the
//           one of the P7 leaf (world/typical-income.ts), reached through society/seam.ts. A lender with less than the least has nothing to spare.
//   min     the least a loan is: 1% of a typical year's pay, never under $100, so the 40 debt slots are not filled with dust
//   rate    the lender's, a whole number of percent a year, fixed by the person (a hash of their key) inside the range their traits give:
//           5 to 10 for an ordinary lender, 25 to 60 for a sneaky, manipulative or stingy one (a sharp lender, `sharp`)
//   odds    the chance of a yes, 0.15 to 0.9: the call-in odds of the favors less a tenth (a loan is a bigger ask), and 0.15 more from a
//           sharp lender, who is glad of the business. The planner's numbers, tested as ranges.
//
// The rules of the ask are the favor's (society/favor.ts favorBlock): the lender is alive, not a pet, not estranged, f 50 or more and t 40
// or more, the player alive, and the last call-in on the edge 3 years back or more. A loan is a call-in, so a refusal counts and asking
// again is no way round the cooldown. On top: the player and the lender are 18 or older, the player owes this lender nothing, carries
// fewer than three loans and the table of debts (40) has room; the amount is a number from the least to the cap.
//
// What a loan does. The key of the act is the lender's edge to the player (the favors' key); the debt is written on the other edge,
// `player > lender` (the key that starts at the ego, C37), as the second side of the patch: `dv = [principal, rate, year, 0, 0]` and the
// memory `loan_given` (weight 2), which is read from the debtor's side. The principal moves from the lender to the player once, through
// cash.moveCash under `support`, with the token debtToken('loan', year, key of the debt). The lender's regard warms by a point. The log line
// is picked with the act's own roll, because a plan may not touch the text memory. A refusal costs a point and stamps the call-in.
//
// Layer 3 (society). It imports core (a label, the money format), the kernel, the text kit, world/ and the other files of society/.
import { formatMoney } from '../core'
import { personEntity, personKey } from '../kernel/person-ref'
import { fnv1a } from '../text/hash'
import { DEBT_BORROW_LINES } from '../text/pools'
import { fillSlots } from '../text/state'
import type { GameState, Person } from '../types'
import { EDGE_CAPS } from '../world/caps'
import type { Edge } from '../world/edges'
import { edgeKey, openDebts, readEdge } from '../world/edges'
import { playerRef } from '../world/people'
import { playerEdgeKey, runAct, type ActCtx, type ActPatch, type SocialAct } from './acts'
import { DEBT_KIND, debtToken, debtsOf, readDv, stillOwed, type Debt } from './debt'
import { favorBlock, favorOdds, lineFor, my, FAVOR_COOLDOWN } from './favor'
import { typicalIncome } from './seam'

/** The age at which a person can borrow or lend, and the loans the player can carry at once. */
export const LOAN_AGE = 18
export const LOAN_OPEN_MAX = 3
/** The cap: a quarter of the lender's cash, and twice a typical year's pay. */
export const LOAN_CAP_SHARE = 0.25
export const LOAN_INCOME_CAP = 2
/** The least loan: a hundredth of a typical year's pay, and never under this. */
export const LOAN_MIN = 100
export const LOAN_MIN_SHARE = 0.01
/** The rate ranges (whole percent a year): an ordinary lender's and a sharp one's. */
export const RATE_ORDINARY = Object.freeze({ lo: 5, hi: 10 } as const)
export const RATE_SHARP = Object.freeze({ lo: 25, hi: 60 } as const)
/** The traits of a sharp lender. */
const SHARP_TRAITS: readonly string[] = Object.freeze(['sneaky', 'manipulative', 'stingy'])
/** How much a loan warms the lender's regard, and a refusal cools it. */
const LOAN_BOND = 1
/** The odds of a yes: the favor's less a tenth, 0.15 more from a sharp lender, held between 0.15 and 0.9. */
const ODDS_LESS = 0.1
const ODDS_SHARP = 0.15
const ODDS_MIN = 0.15
const ODDS_MAX = 0.9

/** What a lender offers. */
export interface LoanTerms {
  /** The most the lender will lend now, a whole number, 0 or more. */
  cap: number
  /** The least a loan is. */
  min: number
  /** The rate, whole percent a year. */
  rate: number
  /** Is the lender sharp (sneaky, manipulative or stingy)? */
  sharp: boolean
  /** The chance that the lender says yes to an ask. */
  odds: number
}

/** Is the person a sharp lender: any of the three traits. */
function isSharp(p: Pick<Person, 'traits'>): boolean {
  const traits: unknown = p.traits
  return Array.isArray(traits) && traits.some((t) => typeof t === 'string' && SHARP_TRAITS.includes(t))
}

/** The terms the person offers now. Pure; total on any person (a cash that is not a number is no cash). */
export function loanTerms(g: Readonly<GameState>, p: Person): LoanTerms {
  const income = typicalIncome(g as GameState)
  const cash = typeof p.money === 'number' && Number.isFinite(p.money) && p.money > 0 ? p.money : 0
  const sharp = isSharp(p)
  const range = sharp ? RATE_SHARP : RATE_ORDINARY
  const u = fnv1a(`${personKey(p)}|rate`) / 2 ** 32
  const rate = range.lo + Math.floor(u * (range.hi - range.lo + 1))
  const odds = Math.min(ODDS_MAX, Math.max(ODDS_MIN, favorOdds(g, p) - ODDS_LESS + (sharp ? ODDS_SHARP : 0)))
  return {
    cap: Math.max(0, Math.floor(Math.min(LOAN_CAP_SHARE * cash, LOAN_INCOME_CAP * income))),
    min: Math.max(LOAN_MIN, Math.round(LOAN_MIN_SHARE * income)),
    rate: Math.min(range.hi, rate),
    sharp,
    odds,
  }
}

/** The record of a new loan: `[principal, rate, year, 0, 0]`, the principal and the rate cut to what a record may hold. */
export function dv(principal: number, rate: number, year: number): NonNullable<Edge['dv']> {
  const money = Number.isFinite(principal) ? Math.min(1e12, Math.max(0, Math.round(principal))) : 0
  const pct = Number.isFinite(rate) ? Math.min(60, Math.max(0, rate)) : 0
  return [money, pct, year, DEBT_KIND.loan, 0]
}

/** The key of the debt of the ego to a person: the edge `player > person`. */
export function debtKeyOf(g: Readonly<GameState>, p: Pick<Person, 'id' | 'data'>): string | null {
  return edgeKey(playerRef(g as GameState), personEntity(p))
}

/** The loan the player owes this person (a debt of kind 0 on `player > person`), or null. */
export function debtTo(g: Readonly<GameState>, p: Pick<Person, 'id' | 'data'>): Debt | null {
  const ego = playerRef(g as GameState)
  const key = debtKeyOf(g, p)
  if (key === null) return null
  const d = readDv(readEdge(g, ego, personEntity(p)))
  return d !== null && d.kind === DEBT_KIND.loan && stillOwed(d) >= 1 ? d : null
}

/** How many loans the player carries now. */
export function openLoans(g: Readonly<GameState>): number {
  let n = 0
  for (const r of debtsOf(g, playerRef(g as GameState))) if (r.owedBy && r.kind === DEBT_KIND.loan && r.owed >= 1) n++
  return n
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The acts
// ---------------------------------------------------------------------------------------------------------------------------------

/** Why the loan of `amount` can't be made now, in words, or null. Pure. */
function loanBlock(g: Readonly<GameState>, c: ActCtx, amount: number): string | null {
  const p = c.person
  if (p === null) return 'There is no one to ask.'
  if (c.key !== playerEdgeKey(g, p)) return 'That is not your edge.'
  const why = favorBlock(g, p)
  if (why !== null) return why
  const name = p.firstName
  if (!(g.character.age >= LOAN_AGE)) return "You're too young to borrow money."
  if (!(p.age >= LOAN_AGE)) return `${name} is too young to lend you money.`
  if (debtTo(g, p) !== null) return `You still owe ${name}.`
  if (openLoans(g) >= LOAN_OPEN_MAX) return `You owe ${LOAN_OPEN_MAX} people already.`
  if (openDebts(g) >= EDGE_CAPS.debts) return 'No one will write down another loan.'
  const t = loanTerms(g, p)
  if (t.cap < t.min) return `${name} has nothing to spare.`
  const sum = typeof amount === 'number' && Number.isFinite(amount) ? Math.floor(amount) : Number.NaN
  if (!(sum >= t.min)) return `${name} won't lend less than ${formatMoney(t.min)}.`
  if (sum > t.cap) return `${name} can lend ${formatMoney(t.cap)} at most.`
  return null
}

/** The loan as a patch: the call-in stamp, the bond, the principal from the lender, and the debt on the player's edge. */
function granted(g: Readonly<GameState>, c: ActCtx, amount: number, u: number): ActPatch {
  const p = c.person!
  const principal = Math.floor(amount)
  const t = loanTerms(g, p)
  const debtKey = debtKeyOf(g, p)!
  return {
    edge: { c: c.year },
    relationship: [{ delta: LOAN_BOND }],
    money: [{ from: p, to: 'player', amount: principal, token: debtToken('loan', c.year, debtKey) }],
    also: [{ key: debtKey, who: p.id, edge: { dv: dv(principal, t.rate, c.year) }, remember: [{ kind: 'loan_given', w: 2 }] }],
    log: fillSlots(lineFor(DEBT_BORROW_LINES, u), { money: formatMoney(principal), who: my(p) }),
    notice: {
      title: 'A Loan',
      text: `${p.firstName} lent you ${formatMoney(principal)} at ${t.rate}% a year. A share of your spare cash goes back each year.`,
    },
  }
}

/** The ask: the lender says yes or no with the odds of loanTerms, from the stream `social`. A no costs a point and the call-in. */
export function loanAct(amount: number): SocialAct {
  return {
    id: 'loan.ask',
    blocked: (g, c) => loanBlock(g, c, amount),
    plan: (g, c) => {
      const p = c.person!
      const yes = c.roll() < loanTerms(g, p).odds
      const u = c.roll()
      if (yes) return granted(g, c, amount, u)
      return {
        edge: { c: c.year },
        relationship: [{ delta: -1, kind: 'offence' }],
        notice: { title: 'Turned Down', text: `${p.firstName} can't lend you money right now. You can ask again in ${FAVOR_COOLDOWN} years.` },
      }
    },
  }
}

/** The loan as a fact: the lender has agreed. The same rules and the same consequence as a yes to the ask, with no roll for the answer. */
export function lendAct(amount: number): SocialAct {
  return {
    id: 'loan.lend',
    blocked: (g, c) => loanBlock(g, c, amount),
    plan: (g, c) => granted(g, c, amount, c.roll()),
  }
}

/** The player asks `lender` for a loan of `amount`. The patch (a yes or a no), or null when it was blocked. */
export function askLoan(g: GameState, lender: Person, amount: number): ActPatch | null {
  const key = playerEdgeKey(g, lender)
  return key === null ? null : runAct(g, loanAct(amount), key, lender)
}

/** `lender` lends the player `amount`. True when the loan was made, false when it was blocked (and then nothing was written). */
export function lend(g: GameState, lender: Person, amount: number): boolean {
  const key = playerEdgeKey(g, lender)
  return key !== null && runAct(g, lendAct(amount), key, lender) !== null
}
