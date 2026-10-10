import { formatMoney } from '../core'
import { creditLabel, creditScore, refinanceDebt, refinanceQuote, yearlyDebtPayments, yearlyIncome } from '../finance'
import type { GameState, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { economyOf, economyState, lendingConditions, SECTORS, SECTOR_RULES } from './index'
import { COHORTS, COHORT_LABELS } from './cohorts'
import { TRADE_INPUTS } from './trade'
import { familyId, rosterOf } from '../business/competition-roster'
import { industryDef, isIndustry } from '../business/industries'

const percent = (n: number) => `${(n * 100).toFixed(1)}%`

function supplyDetail(g: GameState): MenuNode[] {
  const e = economyOf(g)
  return [
    { type: 'info', id: 'economy.supply.help', text: 'Output and input coverage describe this year, not guaranteed future deliveries. Supply disruptions travel through suppliers over several years. Businesses can fund reserves, diversify imports, train staff or reduce production; extra equipment alone cannot replace missing materials.' },
    ...SECTORS.map(s => {
      const row = e.sectors[s]
      return { type: 'info' as const, id: `economy.sector.${s}`, text: `${SECTOR_RULES[s].label}: ${percent(row.output / Math.max(.25, row.demand))} of current demand supplied; input coverage ${percent(row.availability)}, workforce coverage ${percent(row.workforce)}. Costs ${row.costs.toFixed(2)}× normal; reserve ${percent(row.stock)} of baseline annual needs; unfilled demand ${percent(row.backlog)}.${row.disruption > .025 ? ' Technology is changing the jobs needed.' : ''}` }
    }),
    ...TRADE_INPUTS.map(s => {
      const row = e.tradeNetwork.inputs[s]
      return { type: 'info' as const, id: `economy.trade.${s}`, text: `${SECTOR_RULES[s].label} imports: dependence ${percent(row.dependence)}; delivery coverage ${percent(row.availability)}; landed cost ${row.cost.toFixed(2)}×; tariffs ${percent(row.tariff)}. Export orders ${row.exportDemand.toFixed(2)}× normal. Supplier mix for next year: ${row.routes.map(r => `${getCountry(r.partner).name} ${percent(r.share)}`).join(', ') || 'no imported-input contracts'}. New routes take time to replace disrupted supply.` }
    }),
  ]
}

function householdDetail(g: GameState): MenuNode[] {
  const e = economyOf(g)
  return [{ type: 'info', id: 'economy.households.help', text: `These are aggregate households, not extra people or money in your account. Income is relative to a baseline worker; consumption is each group's normal basket. Inequality index ${e.inequality.toFixed(2)}, mobility ${e.mobility.toFixed(2)}. Education takes time to build qualified workers, and lower-income households spend more of their budgets on food and housing.` },
    ...COHORTS.map(id => {
      const c = e.cohorts[id]
      return { type: 'info' as const, id: `economy.cohort.${id}`, text: `${COHORT_LABELS[id]}: ${percent(c.share)} of households; working-age employment ${percent(c.employment)}, qualifications ${percent(c.skill)}, retired ${percent(c.retired)}. Income ${c.income.toFixed(2)}× baseline; consumption ${percent(c.spending)} of normal. Savings ${c.savings.toFixed(2)} and debt ${c.debt.toFixed(2)} years of this group's baseline income.` }
    })]
}

function governmentDetail(g: GameState): MenuNode[] {
  const e = economyOf(g), b = e.budget
  const text = [
    `Approximate national accounts, all as shares of economic output—not money paid into your account. Revenue ${percent(b.revenue)}, spending ${percent(b.spending)}, ${b.deficit >= 0 ? 'deficit' : 'surplus'} ${percent(Math.abs(b.deficit))}.`,
    `Education ${percent(b.education)}, healthcare ${percent(b.health)}, infrastructure ${percent(b.infrastructure)}, transfers ${percent(b.transfers)}, other programmes ${percent(b.other)}. Interest alone costs ${percent(b.interest)}.`,
    `New borrowing ${percent(b.borrowing)}, principal repaid ${percent(b.repayment)}, excess surplus saved ${percent(b.surplusSaved)}. Public debt ${percent(e.governmentDebt)}. ${b.debtAdjustment > 0 ? `Debt restructuring ${percent(b.debtAdjustment)} was needed after the debt limit was reached.` : 'No debt restructuring this year.'}`,
    `${percent(b.funding)} of requested primary programmes were funded; ${percent(b.unfunded)} of output in requested spending was unfunded. Laws passed this year start affecting later budgets. Services adjust gradually, and better qualifications help production in later years.`,
    `Bank stress ${Math.round(e.bankStress * 100)}/100; credit availability ${e.credit.toFixed(2)}× normal; borrower defaults ${percent(e.defaults)}. Losses and runs affect lending after settlement. A cash buffer, less expensive debt and conservative bank risk settings improve resilience, not guaranteed returns.`,
  ]
  return text.map((text, i) => ({ type: 'info', id: `economy.budget.${i}`, text }))
}

function companyDetail(g: GameState): MenuNode[] {
  const all = economyState(g)?.rivals ?? []
  const rows = all.filter(r => isIndustry(r.industry) && (r.scope === 'world' || r.scope === g.character.countryId))
    .sort((a, b) => Number(b.outcome === 'failed' || b.outcome === 'distressed') - Number(a.outcome === 'failed' || a.outcome === 'distressed') || Math.abs(b.strength - 1) - Math.abs(a.strength - 1) || a.key.localeCompare(b.key)).slice(0, 16)
  return [{ type: 'info', id: 'economy.actors.help', text: 'A bounded watch list of significant existing competitors. Cash and debt below are operating-cost buffers, not real currency balances. Historical real companies retain their recorded histories; simulated firms respond to demand, input supply and financing. Details build after the next year settles.' },
    ...rows.map(r => {
      const name = rosterOf(familyId(g.lifeId), r.industry, r.scope).byId.get(r.id)?.name ?? r.id
      return { type: 'info' as const, id: `economy.actor.${r.key}`, text: `${name} · ${industryDef(r.industry).label} · ${r.outcome}, ${r.year}. Cash ${r.cash.toFixed(2)} years, debt ${r.debt.toFixed(2)} years; capacity ${r.capacity.toFixed(2)}×, adoption ${percent(r.adoption)}. ${r.cause}` }
    })]
}

export function economicBrief(g: GameState): string {
  const e = economyOf(g)
  return `${e.growth < -.015 ? 'The economy is contracting' : e.growth > .035 ? 'The economy is expanding' : 'The economy is steady'}. ${lendingConditions(g).label} ${e.causes[0] ?? ''}`.trim()
}
export const economyMenu: MenuGroup = {
  type: 'menu', id: 'economy', label: 'The Economy Around You', emoji: '🌍',
  subtitle: g => { const e = economyOf(g); return `${e.growth < -.015 ? 'Contracting economy' : e.growth > .035 ? 'Expanding economy' : 'Steady economy'} · ${e.credit < .78 ? 'tight credit' : e.credit > 1.08 ? 'easy credit' : 'normal lending'}` },
  header: economicBrief,
  children: g => {
    const e = economyOf(g)
    const nodes: MenuNode[] = [{ type: 'info', id: 'economy.personal', text: `${getCountry(g.character.countryId).name}, ${g.year}. ${e.unemployment > .1 ? 'Finding work is difficult; a cash buffer matters.' : 'Skills and experience improve your position when employers are hiring.'} ${e.housingReturn < -.03 ? 'House prices are falling; buyers need less cash, but owners have less collateral.' : e.rate > .07 ? 'Borrowing is expensive; compare the full repayment cost before committing.' : 'Check loan payments against your income before expanding or buying a home.'}` },
      { type: 'menu', id: 'economy.detail', label: 'Economic Detail', emoji: '📊', children: () => [
        { type: 'info', id: 'economy.figures', text: `Growth ${(e.growth * 100).toFixed(1)}% · unemployment ${(e.unemployment * 100).toFixed(1)}% · inflation ${(e.inflation * 100).toFixed(1)}% · policy rate ${(e.rate * 100).toFixed(1)}%.\nHouse prices ${(e.housingReturn * 100).toFixed(1)}% this year. Public debt ${(e.governmentDebt * 100).toFixed(0)}% of output. ${e.causes.join(' ')}` },
        { type: 'menu', id: 'economy.supply', label: 'Supply & Trade', emoji: '🚢', children: supplyDetail },
        { type: 'menu', id: 'economy.households', label: 'Households & Work', emoji: '👥', children: householdDetail },
        { type: 'menu', id: 'economy.budget', label: 'Government & Banking', emoji: '🏛️', children: governmentDetail },
        { type: 'menu', id: 'economy.actors', label: 'Company Watch', emoji: '🏢', children: companyDetail },
        { type: 'info', id: 'economy.history', text: (economyState(g)?.history[g.character.countryId] ?? []).slice(-8).map(p => `${p.year}: growth ${(p.growth * 100).toFixed(1)}%, unemployment ${(p.unemployment * 100).toFixed(1)}%, rates ${(p.rate * 100).toFixed(1)}%`).join('\n') || 'History builds as the years pass.' },
      ] }]
    return nodes
  },
}

export const bankingMenu: MenuGroup = {
  type: 'menu', id: 'banking', label: 'Banking & Credit', emoji: '🏦', visible: g => g.character.alive && g.character.age >= 18,
  subtitle: g => `${creditScore(g)} credit · ${formatMoney(yearlyDebtPayments(g))}/year in debt payments`,
  header: g => `${creditLabel(creditScore(g))} credit. ${lendingConditions(g).label} Missed payments take time to repair; borrowing more does not build credit by itself.`,
  children: g => {
    const nodes: MenuNode[] = [{ type: 'info', id: 'banking.affordability', text: `Recognized annual income ${formatMoney(yearlyIncome(g))}. Scheduled debt payments ${formatMoney(yearlyDebtPayments(g))}. Lenders currently allow up to ${(lendingConditions(g).maxDti * 100).toFixed(0)}% of qualifying income for debt service. Keep cash for living costs and repairs too. Refinance an existing debt below; savings and term deposits remain in Investments.` }]
    const debts = [...g.character.loans.map(l => ({ id: l.id, name: l.lender, mortgage: false, years: l.yearsLeft ?? 5 })), ...g.assets.filter(a => !!a.mortgage).map(a => ({ id: a.id, name: a.name, mortgage: true, years: a.mortgage!.yearsLeft }))]
    for (const d of debts) nodes.push({ type: 'menu', id: `banking.debt.${d.id}`, label: d.name, emoji: '🏦', children: gg => {
      const terms = [...new Set([Math.max(1, Math.min(d.mortgage ? 30 : 10, d.years)), Math.min(d.mortgage ? 30 : 10, Math.max(5, d.years + 5))])]
      return terms.flatMap(years => [false, true].map(variable => {
        const quote = refinanceQuote(gg, d.id, d.mortgage, variable, years)
        return { type: 'action' as const, id: `banking.refinance.${d.id}.${years}.${variable}`, label: `${years}-year ${variable ? 'variable' : 'fixed'} refinancing`, emoji: '🏦',
          subtitle: `${(quote.rate * 100).toFixed(2)}% · ${formatMoney(quote.payment)}/year · fee ${formatMoney(quote.fee)} · estimated total ${formatMoney(quote.total)}${variable ? `; payment at +3 points: ${formatMoney(quote.stressPayment)}` : ''}`,
          disabledReason: (live: GameState) => refinanceQuote(live, d.id, d.mortgage, variable, years).reason || null,
          confirm: (live: GameState) => { const q = refinanceQuote(live, d.id, d.mortgage, variable, years); return `Pay ${formatMoney(q.fee)} and replace the terms of this debt? Principal is unchanged. ${variable ? 'Your rate and payment can change each year.' : 'Your rate is fixed.'}` },
          run: (live: GameState) => { refinanceDebt(live, d.id, d.mortgage, variable, years) },
        }
      }))
    } })
    if (!debts.length) nodes.push({ type: 'info', id: 'banking.noDebts', text: 'You have no loans to refinance. Home, car, education and company borrowing are offered alongside those purchases.' })
    nodes.push(economyMenu)
    return nodes
  },
}
