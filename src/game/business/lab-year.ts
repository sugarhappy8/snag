// R&D 3.0 bookings: what the lab earns and pays for a fiscal year, booked once before the year is
// simulated, the way bookFranchiseYear books royalties. Credit, grant and royalty are
// `b.cash += x; b.yearIncome += x`; payroll is `b.cash -= x; b.yearCosts += x`. Cash moves exactly once,
// here: the statement and the corporate tax count the amounts through yearIncome and yearCosts, and every
// amount has a ledger field (lab-state.ts LabRow) and a line on the annual report. Nothing here draws
// g.rng, and a year booked is never booked again (`lab.booked`).
import { log, notice } from '../core'
import { chance } from '../rng'
import type { Asset, GameState } from '../types'
import { boardAllows } from './board'
import { manageBlock } from './gate'
import { heavyEligible } from './heavy-rd'
import { labCreditRate, labGrantAmount, labTierOf, LAB_CREDIT_CAP, LAB_GRANT_GAP, LAB_GRANT_SITES, opsProgram } from './lab-data'
import { opsBlock, opsOdds, opsPrice, opsValue, opsYears, teamBlock, teamFee, teamPay, teamValue } from './lab-rules'
import { applyWin, draftLab, readLab, saveLab, type LabProgram, type LabRow, type LabState } from './lab-state'
import { LAB_LABEL, LAB_LOG, LAB_SAY } from './lab-text'
import { rdProjects } from './rd'
import { bizOf, findBusiness, runsIt, totalOutlets, type BizState } from './state'
import { clampN, money, plural, rec } from './util'

/**
 * Dollars of R&D the company started in a fiscal year: the budgets of its ordinary projects, the cost of
 * its breakthroughs and the prices of its Operations programs. This is what the tax credit is paid on.
 */
export function labSpendIn(b: BizState, fiscal: number): number {
  let spend = 0
  for (const p of rdProjects(b)) if (p.started === fiscal) spend += p.heavy === true && p.cost !== undefined ? p.cost : p.budget
  for (const p of readLab(b).programs) if (p.started === fiscal) spend += p.price
  return spend
}

/** The refundable credit on a year's R&D spend: the deep-tech rate and formula, with a cap that does not grow. */
export function labCredit(countryId: string, spend: number): number {
  if (!(spend > 0)) return 0
  return Math.round(Math.min(LAB_CREDIT_CAP, spend * labCreditRate(countryId)))
}

interface LabMove {
  key: Exclude<keyof LabRow, 'year'>
  amount: number
}

/** The money the lab moves for a fiscal year, in booking order. */
function labMoves(_g: GameState, _a: Asset, b: BizState, d: LabState, fiscal: number): LabMove[] {
  return [
    { key: 'credit', amount: labCredit(b.countryId, labSpendIn(b, fiscal)) },
    { key: 'grant', amount: Math.round(d.due.grant) },
    // The research team's pay for the year: one salary for each scientist on the books (the team is never key staff).
    { key: 'payroll', amount: d.team.length * teamPay(b) },
  ]
}

/**
 * Books the lab's money for one fiscal year, once. Called before the year is simulated (yearly.ts), so
 * every amount lands in that year's statement. Deep-tech, finance and studio companies keep their own
 * R&D and are skipped. A company that has no lab and moved no money never gets one.
 */
export function bookLabYear(g: GameState, a: Asset, b: BizState, fiscal: number): void {
  if (!heavyEligible(b)) return
  if (readLab(b).booked >= fiscal) return
  const d = draftLab(b)
  const moves = labMoves(g, a, b, d, fiscal)
  if (!rec(b.lab) && moves.every((m) => !(m.amount > 0))) return
  const row: LabRow = { year: fiscal, credit: 0, grant: 0, royalty: 0, payroll: 0 }
  let booked = false
  for (const m of moves) {
    if (!(m.amount > 0)) continue
    if (m.key === 'payroll') {
      b.cash -= m.amount
      b.yearCosts += m.amount
    } else {
      b.cash += m.amount
      b.yearIncome += m.amount
    }
    row[m.key] = m.amount
    booked = true
  }
  if (booked) d.ledger.push(row)
  d.due.grant = 0
  d.booked = fiscal
  saveLab(b, d)
  if (row.grant > 0) log(g, LAB_LOG.grant(a.name, money(row.grant)), 'good')
}

/**
 * Start an Operations R&D program: the price leaves company cash now (a cost of this year) unless `pay`
 * is false (the hired CEO's board budget already took it), a grant is worked out and stored with the
 * program, and the owner gets the notice when the owner's own action started it. Null (and a notice)
 * when it can't start. No random draw: the roll happens when the work is done (advanceLab).
 */
export function startOps(g: GameState, a: Asset, b: BizState, id: string, pay: boolean): LabProgram | null {
  const why = opsBlock(g, b, id, !pay)
  const def = opsProgram(id)
  const tier = labTierOf(b.industry)
  if (why || !def || !tier) {
    notice(g, 'R&D', why ?? LAB_SAY.pickProgram(), { emoji: '\u{1F9EA}' })
    return null
  }
  const price = opsPrice(b, def.rung)
  const years = opsYears(b, def.rung)
  const odds = Math.round(opsOdds(g, b, def.rung) * 1000) / 1000
  const d = draftLab(b)
  // One grant every few years, for a company still small enough to need it, paid when the work is done. Claimed now, so two starts can't both have one.
  let grant = 0
  if (g.year - d.lastGrant >= LAB_GRANT_GAP && totalOutlets(b) <= LAB_GRANT_SITES) {
    grant = labGrantAmount(b.countryId, tier, price)
    if (grant > 0) d.lastGrant = g.year
  }
  if (pay) {
    b.cash -= price
    b.yearCosts += price
  }
  const program: LabProgram = { id: def.id, started: g.year, years, progress: 0, odds, price, grant }
  d.programs.push(program)
  saveLab(b, d)
  log(g, LAB_LOG.started(a.name, def.label))
  if (pay && runsIt(g, a) && g.character.alive) notice(g, 'Operations R&D', LAB_SAY.started(a.name, def.label, money(price), plural(years, 'year'), String(Math.round(odds * 100))), { emoji: '\u{1F52C}' })
  return program
}

/**
 * Year end (economy.evolve through rd.ts advanceRd; `year` is the fiscal year just booked): every program
 * gets a year of work, and each one that is finished rolls once, in track order (cost, yield, quality),
 * the only draw of g.rng the lab makes. A win lifts the track's level; a flop loses the price and leaves
 * the program available. Win or flop, the grant the program earned is due with the next booking. A year
 * is stepped once (`stepped`), so replaying it changes nothing and draws nothing; a company with no lab
 * is left alone.
 */
export function advanceLab(g: GameState, b: BizState, year: number): void {
  if (!b.lab || !heavyEligible(b)) return
  if (readLab(b).stepped >= year) return
  const d = draftLab(b)
  d.stepped = year
  const name = g.assets.find((x) => (x.details as unknown) === b)?.name ?? 'The company'
  for (const p of d.programs) p.progress = Math.min(p.years, p.progress + 1)
  // The stored programs are already in track order (readLab sorts them), which is the order they roll.
  const finished = d.programs.filter((p) => p.progress >= p.years)
  d.programs = d.programs.filter((p) => p.progress < p.years)
  for (const p of finished) {
    d.due.grant += p.grant
    const def = opsProgram(p.id)
    if (!def) continue
    if (chance(g, clampN(p.odds, 0.02, 0.98))) {
      applyWin(d, def, year)
      log(g, LAB_LOG.worked(name, def.label), 'good')
    } else log(g, LAB_LOG.failed(name, def.label), 'bad')
  }
  saveLab(b, d)
}

/**
 * The owner funds an Operations R&D program: the live company, the right to manage it, the program's own
 * reason (opsBlock) and, past this year's capital budget, the board's vote (the gain is a fifth of the win
 * before its price, as ordinary R&D asks) are all checked here, so a direct call, a restored menu or an
 * older save can't skip them. True when a program started.
 */
export function doOps(g: GameState, a: Asset, id: string): boolean {
  const cur = findBusiness(g, a.id)
  if (!cur || manageBlock(g, cur)) return false
  const b = bizOf(g, cur)
  const def = opsProgram(id)
  const why = opsBlock(g, b, id)
  if (why || !def) {
    notice(g, 'R&D', why ?? LAB_SAY.pickProgram(), { emoji: '\u{1F9EA}' })
    return false
  }
  const price = opsPrice(b, def.rung)
  const gain = Math.max(0, (opsValue(g, b, id) + price) / 5)
  if (!boardAllows(g, cur, b, { kind: 'capex', by: 'owner', amount: price, gain, label: `Fund ${def.label} (${money(price)})` })) return false
  return startOps(g, cur, b, id, true) !== null
}

/**
 * The owner takes on a research scientist: the live company, the right to manage it, the team's own
 * reason (teamBlock) and, past this year's capital budget, the board's vote (the gain is a fifth of what
 * the next scientist adds a year, teamValue) are all checked here, so a direct call, a restored menu or an
 * older save can't skip them. The fee leaves company cash now; the year's pay is booked with the year
 * (bookLabYear). True when a scientist was hired.
 */
export function doHire(g: GameState, a: Asset): boolean {
  const cur = findBusiness(g, a.id)
  if (!cur || manageBlock(g, cur)) return false
  const b = bizOf(g, cur)
  const why = teamBlock(g, b, 'hire')
  if (why) {
    notice(g, 'R&D', why, { emoji: '\u{1F9EA}' })
    return false
  }
  const fee = teamFee(b)
  const gain = Math.max(0, teamValue(g, b).gain / 5)
  if (!boardAllows(g, cur, b, { kind: 'capex', by: 'owner', amount: fee + teamPay(b), gain, label: LAB_LABEL.hireVote })) return false
  b.cash -= fee
  b.yearCosts += fee
  const d = draftLab(b)
  d.team.push(g.year)
  saveLab(b, d)
  log(g, LAB_LOG.hired(cur.name))
  return true
}

/**
 * The owner lets the longest-serving scientist go, after the three years' service the team owes: the same
 * checks as doHire (the board is asked about the fee, which gains nothing), the fee leaves company cash.
 * True when a scientist left.
 */
export function doRelease(g: GameState, a: Asset): boolean {
  const cur = findBusiness(g, a.id)
  if (!cur || manageBlock(g, cur)) return false
  const b = bizOf(g, cur)
  const why = teamBlock(g, b, 'release')
  if (why) {
    notice(g, 'R&D', why, { emoji: '\u{1F9EA}' })
    return false
  }
  const fee = teamFee(b)
  if (!boardAllows(g, cur, b, { kind: 'capex', by: 'owner', amount: fee, gain: 0, label: LAB_LABEL.releaseVote })) return false
  b.cash -= fee
  b.yearCosts += fee
  const d = draftLab(b)
  d.team.shift()
  saveLab(b, d)
  log(g, LAB_LOG.released(cur.name))
  return true
}
