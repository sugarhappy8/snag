// The money team's year-end step: the advisor's retainer, the manager's invoice and trades, the catch of a manager
// who padded the bills, the advisor's review and one statement. It runs once a year after rent, tax and upkeep
// are paid (the yearly registry, modules/yearly-aging.ts), so the cash it spends is real and the manager's reserve protects the living costs.
//
// This is the only code of the feature that draws from g.rng, and only after a manager has been paid: one chance
// for the blunder, one for its direction when it fires, one for the catch when a crook has padded a bill. A game
// with no record returns before any draw, and a second call in the same year (`done`) changes nothing.
import { addMoney, formatMoney, inPrison, log, notice, spend } from '../core'
import { typicalIncome } from '../events/wealth-core'
import { managedBook, managedOrder, type ManagedBook } from '../investments'
import { chance } from '../rng'
import type { GameState } from '../types'
import { PLAN, blunderOdds, defaultMandate, planYear, poolOf, slipRate, type Mandate } from './mandate'
import { shownFindings } from './review'
import { TERMS, advisorFee, managerFee, readTeam, writeTeam, type Team } from './team'

const money = formatMoney

/** The catch chance never passes this, however good the advisor. */
const MAX_CATCH = 0.9
/** The same ceiling readTeam puts on every money figure it keeps. */
const MAX_MONEY = 1e15
const MAX_COUNT = 1e6

/** What a crook adds to a bill: 3% of the share of the pool the limit allows, whole dollars. Zero for bad input. */
export function crookedSkim(pool: number, limit: number): number {
  if (!(Number.isFinite(pool) && pool > 0 && Number.isFinite(limit) && limit > 0)) return 0
  return Math.round(TERMS.skimPerLimit * (Math.min(100, limit) / 100) * Math.min(MAX_MONEY, pool))
}

/** The yearly chance that a crook who has padded a bill is found out: 4% alone, more with an advisor of skill. */
export function catchOdds(advisorSkill: number | null): number {
  if (advisorSkill === null || !Number.isFinite(advisorSkill)) return TERMS.baseCatch
  return Math.min(MAX_CATCH, Math.max(0, TERMS.baseCatch + (TERMS.advisorCatch * advisorSkill) / 100))
}

/** The first word of a name, for a line that talks about the person. */
function firstName(name: string): string {
  return name.split(/\s+/)[0] || name
}

function bump(n: number | undefined): number {
  return Math.min(MAX_COUNT, (n ?? 0) + 1)
}

/** The fund's share of the three buckets, in whole percent. */
function stocksShare(book: ManagedBook): number {
  const all = book.stocks.value + book.bonds.value + book.savings.value
  return all > 0 ? Math.min(100, Math.max(0, Math.round((100 * book.stocks.value) / all))) : 0
}

/** Let the manager go: the hire, the mandate and the last statement. The epoch moves on, so the next offers are new people. */
function dropManager(team: Team): void {
  delete team.manager
  delete team.mandate
  delete team.last
  team.managerEpoch = bump(team.managerEpoch)
}

/** What the manager did this year: the bill paid, the trades made and the blunder if there was one. */
interface ManagerYear {
  /** The manager's line of the statement, or null when they were let go this year. */
  line: string | null
  blunder: string | null
  /** The invoice that was paid. */
  billed: number
}

/** The manager's part of the year, after the advisor has been paid. Null when the book is idle (no fee, no trades). */
function manage(g: GameState, team: Team): ManagerYear | null {
  const manager = team.manager
  if (!manager) return null
  const book = managedBook(g)
  if (book.idle) return null
  const mandate: Mandate = team.mandate ?? defaultMandate(book, typicalIncome(g))

  // The invoice comes first: the agreed fee, plus the padding of a crook (cut to the cash left after the fee).
  const pool = poolOf(book, mandate.reserve)
  const fee = managerFee(g, manager.rate, pool)
  const cash = Number.isFinite(g.character.money) ? g.character.money : 0
  const skim = manager.honest ? 0 : Math.min(crookedSkim(pool, mandate.limit), Math.max(0, Math.floor(cash - fee)))
  const bill = fee + skim
  if (!spend(g, bill, 'fee.bank')) {
    log(g, `${manager.name} left over an unpaid bill.`)
    dropManager(team)
    return null
  }
  manager.skimmed = Math.min(MAX_MONEY, manager.skimmed + skim)

  // A blunder aims the year's target off by a fixed swing; next year's normal pass corrects it.
  const blundered = chance(g, blunderOdds(manager.skill))
  const tilt = blundered ? (chance(g, 0.5) ? PLAN.swing : -PLAN.swing) : 0

  // Sells first, then buys. A buy never takes the cash under the reserve, and is skipped under the broker's minimum.
  const fresh = managedBook(g)
  const plan = planYear(fresh, mandate, manager.skill, tilt)
  let moved = 0
  for (const order of plan.orders.filter((o) => o.side === 'sell')) moved += managedOrder(g, order.bucket, 'sell', order.dollars).moved
  for (const order of plan.orders.filter((o) => o.side === 'buy')) {
    const room = Math.floor(g.character.money - mandate.reserve)
    const dollars = Math.min(order.dollars, room)
    if (!(dollars >= fresh.minOrder)) continue
    moved += managedOrder(g, order.bucket, 'buy', dollars).moved
  }

  // The slippage of a weaker manager comes out of the bank on the money moved.
  const costs = Math.min(Math.max(0, g.character.money), Math.round(moved * slipRate(manager.skill)))
  if (costs > 0) addMoney(g, -costs, 'trade.buy')

  const stocks = stocksShare(managedBook(g))
  team.last = { year: g.year, pool, billed: bill, moved, costs, stocks }
  const out: ManagerYear = {
    line: `${manager.name} billed ${money(bill)} on ${money(pool)}. They moved ${money(moved)}. ${stocks}% is in stocks.`,
    blunder: blundered ? `${firstName(manager.name)} mixed up your target and aimed ${PLAN.swing} points ${tilt > 0 ? 'high' : 'low'}.` : null,
    billed: bill,
  }

  // A crook who has padded a bill may be found out. The advisor sharpens the odds.
  if (!manager.honest && manager.skimmed > 0 && chance(g, catchOdds(team.advisor?.skill ?? null))) {
    const refund = Math.round(TERMS.clawback * manager.skimmed)
    const years = Math.max(1, g.year - manager.since)
    addMoney(g, refund, 'fee.bank')
    notice(
      g,
      'Missing Money',
      `${team.advisor ? 'Your advisor' : 'Your bank'} found padded bills from ${manager.name}. ${money(manager.skimmed)} went missing over ${years} ${years === 1 ? 'year' : 'years'}. You got back ${money(refund)} and let ${manager.name} go.`,
      { emoji: '🔎' },
    )
    log(g, `I caught ${manager.name} padding the bills.`)
    dropManager(team)
    out.line = null
    out.blunder = null
  }
  return out
}

/**
 * The money team's year: fees, trades, the catch, the advisor's review and one statement. Returns at once with no
 * record, no hire, a dead, minor or imprisoned player, or a year already done.
 */
export function yearlyAdvisors(g: GameState): void {
  const team = readTeam(g)
  if (!team || (!team.advisor && !team.manager) || team.done === g.year) return
  const c = g.character
  if (!c.alive || c.age < 18 || inPrison(g)) return
  team.done = g.year

  let fees = 0
  const lines: string[] = []

  // 1. The advisor's retainer. An unpaid one leaves.
  const advisor = team.advisor
  if (advisor) {
    const fee = advisorFee(g, advisor.skill)
    if (spend(g, fee, 'fee.bank')) {
      fees += fee
      lines.push(`${advisor.name} charged ${money(fee)}.`)
    } else {
      log(g, `${advisor.name} left over an unpaid bill.`)
      delete team.advisor
      team.advisorEpoch = bump(team.advisorEpoch)
    }
  }

  // 2. The manager's invoice and trades (a book that can't be traded costs nothing and does nothing).
  const year = manage(g, team)
  if (year) fees += year.billed

  // 3. The advisor's review, with the book as the manager left it.
  const reviewer = team.advisor
  if (reviewer) {
    const { shown } = shownFindings(g, reviewer.skill, !!team.manager)
    for (const f of shown.slice(0, 2)) lines.push(f.text)
    if (shown.length > 2) lines.push('More are in Money Team.')
  }
  if (year?.line) lines.push(year.line)
  if (year?.blunder) lines.push(year.blunder)

  writeTeam(g, team)
  if (lines.length > 0) notice(g, 'Year-End Statement', lines.join(' '), { emoji: '💼' })
  if (fees > 0) log(g, `I paid ${money(fees)} to my money team.`)
}
