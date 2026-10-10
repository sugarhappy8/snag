import { formatMoney } from '../core'
import { creditLabel, creditScore, refinanceDebt, refinanceQuote, yearlyDebtPayments, yearlyIncome } from '../finance'
import type { GameState, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { economyOf, economyState, lendingConditions, SECTORS, SECTOR_RULES } from './index'

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
        ...SECTORS.map(s => ({ type: 'info' as const, id: `economy.sector.${s}`, text: `${SECTOR_RULES[s].label}: ${e.sectors[s].demand < .9 ? 'weak demand' : e.sectors[s].demand > 1.08 ? 'strong demand' : 'steady demand'}; ${e.sectors[s].costs > 1.08 ? 'inputs expensive' : e.sectors[s].costs < .92 ? 'inputs cheaper' : 'costs stable'}${e.sectors[s].disruption > .05 ? '; jobs shifting as technology spreads' : ''}.` })),
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
