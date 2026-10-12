// Investment firms 2.0: the hired CEO's autopilot. Decisions use only what anyone could know
// (skill, track record, fees, the honest outlooks in fund-outlook.ts): no market foresight, no
// peeking at hidden startup quality beyond a skill-scaled read. Only b changes, except a small
// booked cost for due diligence and the yearly campaign.
import type { GameState } from '../types'
import { brokerEra, firmKey, leaderSkill, quantBlock, styleBlock, STYLES } from './fund-model'
import { bestFee, bestStrategy, bestStyle } from './fund-outlook'
import { campaignCost } from './fund-actions'
import { readFund, saveFund, type FundState } from './fund-state'
import { ddCost, investingFund, managerRead, newStartup, newVcFund, openPitches, proRata, raiseQuote, vcDeployed } from './fund-vc'
import type { BizState } from './state'
import { clampN } from './util'

/** Cash the firm keeps for a year of payroll and rent before any optional spending. */
function reserveOf(b: BizState): number {
  const pay = b.staff.reduce((t, s) => t + s.salary, 0) + (b.manager?.salary ?? 0)
  return pay + b.employees * 60_000 + 100_000
}

export function fundAutopilot(g: GameState, b: BizState): void {
  const f = readFund(b)
  const skill = leaderSkill(g, b)
  // Spending decisions are made once a year, right after the books close.
  const afterBooks = f.lastYear >= g.year - 1
  if (f.type === 'asset') {
    const best = bestStyle(g, b, f, s => !styleBlock(s, b.countryId, g.year))
    const poor = f.marks.slice(-2).every(m => m.k >= 0 && m.k < .3) && f.marks.length >= 2
    if (skill < 40 && !styleBlock('index', b.countryId, g.year)) f.style = 'index'
    else if (best && (poor || skill >= 70 || styleBlock(f.style, b.countryId, g.year))) f.style = best.style
    const target = skill >= 60 ? bestFee(g, b, f) : STYLES[f.style].normFee
    f.fee = clampN(target, .0005, .02)
  } else if (f.type === 'hedge') {
    f.strategy = skill >= 50 ? bestStrategy(g, b, f).strategy : 'longShort'
    if (f.strategy === 'quant' && quantBlock(b.countryId, g.year)) f.strategy = 'longShort'
    f.lev = 1; f.call = 'flat'
    f.mgmt = .02; f.perf = .2
    f.coinvest = skill >= 70 ? Math.max(0, Math.round((b.cash - reserveOf(b) * 2) * .25)) : 0
  } else if (f.type === 'broker') {
    const era = brokerEra(b.countryId, g.year)
    f.commission = clampN(era.normCommission * (skill >= 70 ? .95 : 1.05), 0, .02)
  } else if (afterBooks) vcAutopilot(g, b, f, skill)
  if (afterBooks && f.type !== 'vc' && f.campaign < g.year && skill >= 55) {
    const cost = campaignCost(b, f)
    if (b.cash - cost > reserveOf(b) * 2) {
      b.cash -= cost; b.yearCosts += cost
      f.campaign = g.year; f.boost = Math.min(.3, f.boost + (f.type === 'broker' ? .06 : .05))
    }
  }
  saveFund(b, f)
}

function vcAutopilot(g: GameState, b: BizState, f: FundState, skill: number): void {
  const key = firmKey(b)
  // Follow-ons: back the companies that look strong, if the fund can afford it.
  for (const c of f.cos) {
    if (c.status !== 'live' || !c.round || c.round.take !== -1) continue
    const fund = f.funds.find(x => x.n === c.fund)
    const read = managerRead(skill, `${key}|${c.id}|${c.round.year}`, c.q)
    c.round.take = read >= 45 && !!fund && fund.dry >= proRata(c, c.round) ? 1 : 0
  }
  // A fund that's done investing: raise the next one first, so this year's founders get a look.
  if (!investingFund(f, g.year)) {
    const q = raiseQuote(g, b, f, g.year)
    if (!q.block && q.size > 0) f.funds.push(newVcFund(q.n, q.size, g.year))
  }
  // New checks: diligence the interesting ones, back the best, three a year (four, and less picky,
  // when the fund is behind a five-year investing pace: LPs size the next fund on what went to
  // work). The pitches the CEO passes on stay open, so an owner who isn't running the firm can
  // still back one.
  if (f.actYear !== g.year) { f.actYear = g.year; f.acted = []; f.dd = [] }
  const current = investingFund(f, g.year)
  const behind = !!current && vcDeployed(current) < Math.min(1, (g.year - current.vintage + 1) * .2)
  const bar = behind ? 28 : 38, most = behind ? 4 : 3
  let made = 0
  const reads = openPitches(g, b, f, g.year).map(p => {
    let read = managerRead(skill, `${key}|${p.id}`, p.q)
    const cost = ddCost(b, p.ask)
    if (f.dd.includes(p.id)) read = (p.lo + p.hi) / 2
    else if (read >= bar - 3 && b.cash - cost > reserveOf(b)) {
      b.cash -= cost; b.yearCosts += cost
      f.dd.push(p.id)
      read = (p.lo + p.hi) / 2
    }
    return { p, read }
  }).sort((x, y) => y.read - x.read)
  for (const { p, read } of reads) {
    const fund = investingFund(f, g.year)
    if (fund && fund.n === p.fund && made < most && read >= bar && fund.dry >= p.ask) {
      fund.dry -= p.ask; fund.invested += p.ask
      f.cos.push(newStartup(p, g.year))
      f.acted.push(p.id)
      made++
    }
  }
}
