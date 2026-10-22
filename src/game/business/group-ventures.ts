import { log } from '../core'
import { isIndustryLegal, type Industry } from '../data/markets'
import type { GameState } from '../types'
import { askingSalary, managerCandidate, managerName } from './career'
import { industryEraBlock } from './competition-data'
import { groupNeedsVote, groupVote } from './conglomerate-actions'
import { newMembership, syncMembers, type Group } from './conglomerate-state'
import { bestPlan, openFractionFor, startupCost, valuationOf } from './economy'
import { financeEraBlock, financeManagerTurn, simulateFinanceYear } from './finance-firm'
import { isFinanceFirm } from './finance-firm-state'
import { bankOutlook, isBank } from './bank'
import { openBank } from './bank-state'
import { createBusinessAsset, newBiz } from './founding'
import { spendGroupTreasury, treasurySpare } from './group-treasury'
import { industryDef } from './industries'
import { landCash } from './settle'
import { money } from './util'

// Familiar, fully modeled operations; specialized R&D and regulated entertainment need owner setup.
const VENTURES: Industry[] = ['software', 'marketing', 'logistics', 'manufacturing', 'furniture', 'packaging', 'investmentFirm', 'bank', 'onlineBank']
export function foundGroupVenture(g: GameState, grp: Group): string[] {
  const leader = grp.core.manager
  if (!leader || grp.core.ceo !== 'manager' || grp.core.autonomous === false || grp.core.autoFound === false || grp.members.length >= 32 || g.year <= (grp.core.lastFounded ?? grp.core.founded)) return []
  const cash = grp.members.reduce((s, x) => s + treasurySpare(g, x), 0)
  const budget = cash * (leader.skill >= 85 ? .5 : .2)
  if (budget < 100_000) return []
  const home = grp.members[0].b
  const choices = VENTURES.filter(industry => !grp.members.some(x => x.b.industry === industry) && isIndustryLegal(home.countryId, industry) && !industryEraBlock(industry, home.countryId, g.year) && !financeEraBlock(g, industry, home.countryId)).flatMap(industry => {
    const cost = startupCost(industry, home.countryId, home.city)
    const b = newBiz(g, industry, home.countryId, home.city, { ceo: 'manager', quality: 70, morale: 85, brand: 35 })
    const salary = askingSalary(b, leader.skill)
    // A group CEO's résumé describes the diversified parent, not this temporary division forecast.
    b.manager = { ...leader, salary, since: g.year, equity: 0, groupEquity: undefined, personId: undefined, finance: undefined }
    const working = Math.max(cost.capital, salary * 2)
    const total = cost.total + working
    if (total > budget) return []
    landCash(g, b, working) // a forecast of a division that was never founded: it is not in the world, so the books stay out of it
    // A bank's books are sized to its starting capital (newBiz opened them before the cash was set).
    openBank(b)
    let profit: number
    // A bank is judged on its expected year, not on one roll of this year's (still unknown) dice.
    if (isFinanceFirm(b)) { financeManagerTurn(g, b); profit = isBank(b) ? bankOutlook(g, b) : simulateFinanceYear(g, structuredClone(b), g.year, 0).stmt.net }
    else { const plan = bestPlan(g, b, { fast: true }); b.price = plan.price; b.production = plan.production; profit = plan.profit }
    // A real positive forecast and finite payback, not endless shell-company creation.
    if (profit <= 0 || profit * (leader.skill >= 85 ? 8 : 4) < total) return []
    return [{ b, cost, total, working, profit }]
  }).sort((a, b) => b.profit / b.total - a.profit / a.total)
  const best = choices[0]
  if (!best) return []
  const proposal = { kind: 'capex' as const, by: 'ceo' as const, amount: best.total, gain: best.profit, label: `Found a ${industryDef(best.b.industry).label} division` }
  if (groupNeedsVote(g, grp, proposal) && !groupVote(g, grp, proposal, { quiet: true }).passed) return ['The group board declined this year’s proposed new division.']
  if (!spendGroupTreasury(g, grp, best.total)) return []
  const b = best.b
  b.manager = managerCandidate(g, b, leader.skill)
  b.founderName = managerName(leader)
  // The new division's opening cash is a constructor value, like a founded company's: the group's payment above went to the firms' pool.
  b.share = grp.core.share; landCash(g, b, best.working) // not in the world yet either (the asset is made below)
  // Reinvested corporate cash is not a fresh personal tax-basis contribution.
  b.invested = 0
  b.yearCosts = best.cost.fee + best.cost.permits
  b.openFraction = openFractionFor(best.cost.days)
  b.valuation = valuationOf(b)
  const a = createBusinessAsset(g, `${grp.core.name} ${industryDef(b.industry).label}`.slice(0, 80), b, best.total)
  g.assets.push(a)
  grp.members.push({ a, b, m: newMembership(g, grp.core) })
  grp.core.lastFounded = g.year
  syncMembers(grp)
  log(g, `${managerName(leader)} founded ${a.name} using ${money(best.total)} of group cash.`, 'good')
  return [`Founded ${a.name} for ${money(best.total)}, including ${money(best.working)} working capital. ${managerName(b.manager)} (${b.manager.skill}/100) runs it; the group owns 100% of the division. First results arrive next year.`]
}
