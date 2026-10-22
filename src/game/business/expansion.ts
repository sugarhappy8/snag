// Actions and menus for national strategy: market studies and country programs.
// (Company research and patents moved to the Inventor's Workshop: src/game/workshop/.)
import { firmCash } from '../cash'
import { formatMoney, log, notice } from '../core'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { COUNTRIES, getCountry } from '../world'
import { STRATEGIES, expansionOf, nationalMarket, saveExpansion } from './dynamics'
import { manageBlock } from './gate'
import { industryDef } from './industries'
import { findBusiness, bizOf, readBiz, type BizState } from './state'
import { industryNoun, money, pct } from './util'

export function strategyCost(b: BizState): number { return Math.round(Math.max(5_000, (b.last?.revenue ?? 100_000) * .025)) }
export function studyCost(b: BizState): number { return Math.round(Math.max(2_000, (b.last?.revenue ?? 100_000) * .003)) }
function pay(g: GameState, a: Asset, b: BizState, cost: number): boolean {
  if (!Number.isFinite(cost) || cost < 0 || b.cash < cost) return false
  firmCash(g, b, -cost, 'marketing', a.id)
  b.yearCosts += cost
  return true
}

export function studyMarket(g: GameState, assetId: string, country: string): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a) || !COUNTRIES.some(c => c.id === country)) return false
  const b = bizOf(g, a), x = expansionOf(b)
  if (x.studies.some(s => s.country === country && s.year === g.year) || !pay(g, a, b, studyCost(b))) return false
  x.studies = [...x.studies.filter(s => s.country !== country), { country, year: g.year }]
  saveExpansion(b, x)
  const n = nationalMarket(g, b.industry, country)
  log(g, `I studied the ${industryNoun(industryDef(b.industry).label)} market in ${getCountry(country).name}.`)
  notice(g, 'Market Study', `${n.label}. Customers currently favor ${n.taste}. Input costs are ${pct(n.costs - 1, 1)} relative to the normal local level. Use National Strategy to choose a response.`, { emoji: '🔎' })
  return true
}

export function adoptStrategy(g: GameState, assetId: string, country: string, id: string): boolean {
  const a = findBusiness(g, assetId), s = STRATEGIES.find(s => s.id === id)
  if (!a || !s || manageBlock(g, a)) return false
  const b = bizOf(g, a), x = expansionOf(b)
  const active = x.strategies.filter(p => p.country === country && p.expires > g.year)
  if (!b.outlets.some(o => o.countryId === country) || active.length >= 3 || active.some(p => p.id === id) || !pay(g, a, b, strategyCost(b))) return false
  x.strategies = [...x.strategies.filter(p => p.expires > g.year), { id, country, started: g.year, expires: g.year + s.term }]
  saveExpansion(b, x)
  log(g, `I started ${s.label.toLowerCase()} in ${getCountry(country).name} for ${a.name}.`)
  notice(g, s.label, `${formatMoney(strategyCost(b))} paid from company cash. ${s.brief}. Runs through ${g.year + s.term - 1}; the effect expires before trading in ${g.year + s.term}. Up to three programs can run in each country.`, { emoji: '🧭' })
  return true
}

function countryMenu(a: Asset, country: string): MenuGroup {
  return { type: 'menu', id: `biz.national.${a.id}.${country}`, label: getCountry(country).name, emoji: getCountry(country).flag,
    subtitle: g => { const n = nationalMarket(g, readBiz(g, a).industry, country); return `${n.label} · customers favor ${n.taste}` },
    children: g => {
      const b = readBiz(g, a), x = expansionOf(b), n = nationalMarket(g, b.industry, country)
      const active = x.strategies.filter(p => p.country === country && p.expires > g.year)
      return [
        { type: 'info', id: `national.summary.${a.id}.${country}`, text: `${g.year}: demand ${pct(n.demand)} of normal; input costs ${pct(n.costs)}; confidence ${pct(n.confidence)}. ${active.length}/3 programs active. Conditions change each year.`, emoji: '📊' },
        { type: 'action', id: `national.study.${a.id}.${country}`, label: 'Study This Market', emoji: '🔎', subtitle: `${money(studyCost(b))} from company cash`, disabledReason: gg => manageBlock(gg, a) ?? (expansionOf(readBiz(gg, a)).studies.some(s => s.country === country && s.year === gg.year) ? 'Already studied this year.' : readBiz(gg, a).cash < studyCost(readBiz(gg, a)) ? 'Not enough company cash.' : null), run: gg => { studyMarket(gg, a.id, country) } },
        ...STRATEGIES.map((s): MenuNode => ({ type: 'action', id: `national.strategy.${a.id}.${country}.${s.id}`, label: s.label, emoji: '🧭', subtitle: `${s.brief} · ${money(strategyCost(b))} · ${s.term} years`,
          disabledReason: gg => { const bb = readBiz(gg, a), active = expansionOf(bb).strategies.filter(p => p.country === country && p.expires > gg.year); return manageBlock(gg, a) ?? (!bb.outlets.some(o => o.countryId === country) ? 'Open a location here first using Expansion.' : active.some(p => p.id === s.id) ? `Active until ${active.find(p => p.id === s.id)!.expires}.` : active.length >= 3 ? 'Three programs are already active here.' : bb.cash < strategyCost(bb) ? 'Not enough company cash.' : null) },
          confirm: gg => `Spend ${money(strategyCost(readBiz(gg, a)))} of company cash on ${s.label.toLowerCase()} in ${getCountry(country).name}?`, run: gg => { adoptStrategy(gg, a.id, country, s.id) } })),
      ]
    } }
}

export function nationalStrategyMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `biz.national.${a.id}`, label: 'National Strategy', emoji: '🌍', subtitle: 'Annual conditions, market studies and 10 strategy programs', children: g => {
    const b = readBiz(g, a), present = new Set(b.outlets.map(o => o.countryId))
    return [
      ...COUNTRIES.filter(c => present.has(c.id)).map(c => countryMenu(a, c.id)),
      { type: 'menu', id: `biz.national.explore.${a.id}`, label: 'Compare Other Countries', emoji: '🗺️', subtitle: 'Open a location using Expansion to run local programs', children: gg => COUNTRIES.filter(c => !present.has(c.id)).map(c => {
        const n = nationalMarket(gg, readBiz(gg, a).industry, c.id)
        return { type: 'info', id: `national.compare.${a.id}.${c.id}`, emoji: c.flag, text: `${c.name}: ${n.label}; demand ${pct(n.demand)}; costs ${pct(n.costs)}; customers favor ${n.taste}.` }
      }) },
    ]
  } }
}
