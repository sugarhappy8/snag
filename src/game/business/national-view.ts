// The National Strategy menu, tidied: the per-country programs stay as they are (expansion.ts), but
// "Compare Other Countries" shows the handful of foreign markets that look best for this company and
// a one-line summary of the rest, instead of a row for every country in the world. Pure.
import { isIndustryLegal, marketOf } from '../data/markets'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { COUNTRIES } from '../world'
import { nationalMarket } from './dynamics'
import { localEcon } from './economy'
import { industryDef } from './industries'
import { readBiz, findBusiness } from './state'
import { pct } from './util'

/** Foreign markets shown in the comparison. */
export const COMPARE_SHOWN = 5

export interface CountryPick {
  id: string
  name: string
  flag: string
  score: number
  label: string
  demand: number
  costs: number
  taste: string
}

/**
 * Foreign markets ranked for this company: this year's national conditions (demand vs input costs)
 * times the size and spending power of the market for its industry and how easy it is to do business.
 */
export function rankCountries(g: GameState, a: Asset): CountryPick[] {
  const b = readBiz(g, findBusiness(g, a.id) ?? a)
  const present = new Set(b.outlets.map((o) => o.countryId))
  return COUNTRIES.filter((c) => !present.has(c.id) && isIndustryLegal(c.id, b.industry))
    .map((c) => {
      const n = nationalMarket(g, b.industry, c.id)
      const e = localEcon(b.industry, c.id, c.cities[0] ?? '')
      const m = marketOf(c.id)
      const size = e.demandMult * e.income * Math.sqrt(Math.max(0.3, m.populationM)) * (0.5 + m.easeOfBusiness / 100)
      return { id: c.id, name: c.name, flag: c.flag, score: (n.demand / Math.max(0.5, n.costs)) * size, label: n.label, demand: n.demand, costs: n.costs, taste: n.taste }
    })
    .filter((x) => Number.isFinite(x.score) && x.score > 0)
    .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name))
}

function compareMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.national.explore.${a.id}`,
    label: 'Compare Other Countries',
    emoji: '\u{1F5FA}\u{FE0F}',
    subtitle: (g) => {
      const best = rankCountries(g, a)[0]
      return best ? `Best looking now: ${best.name}` : 'No other market is open to you'
    },
    children: (g) => {
      const list = rankCountries(g, a)
      const def = industryDef(readBiz(g, findBusiness(g, a.id) ?? a).industry)
      const growing = list.filter((x) => x.demand > 1.06).length
      const weak = list.filter((x) => x.demand < 0.94).length
      const nodes: MenuNode[] = [
        { type: 'info', id: `national.compare.sum.${a.id}`, emoji: '\u{1F4CA}', text: `${list.length} markets open to a ${def.label.toLowerCase()}: ${growing} expanding, ${weak} weakening. The ${Math.min(COMPARE_SHOWN, list.length)} most promising:` },
      ]
      for (const x of list.slice(0, COMPARE_SHOWN)) {
        nodes.push({ type: 'info', id: `national.compare.${a.id}.${x.id}`, emoji: x.flag, text: `${x.name}: ${x.label.toLowerCase()} · demand ${pct(x.demand)} · costs ${pct(x.costs)} · customers favor ${x.taste}` })
      }
      nodes.push({ type: 'info', id: `national.compare.how.${a.id}`, emoji: '\u{1F4CD}', text: 'Open a location there (Locations › Expand Abroad) to run programs in that country.' })
      return nodes
    },
  }
}

/** expansion.nationalStrategyMenu with the comparison collapsed to the best few countries. */
export function tidyNationalStrategy(menu: MenuGroup, a: Asset): MenuGroup {
  return {
    ...menu,
    subtitle: 'Market conditions, studies and local programs',
    children: (g) => [...menu.children(g).filter((n) => !n.id.startsWith('biz.national.explore.')), compareMenu(a)],
  }
}
