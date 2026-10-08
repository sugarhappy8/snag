// Helpers shared by the market tests: a grown-up with money, a company, a year that passes with
// every popup answered, and a walk over the whole Market & Competition menu tree.
import { applyFallback } from '../src/game/offline'
import { businessAssetView } from '../src/game/business'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, Asset, GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

const PREFER = ['decline', 'settle', 'innovate', 'match', 'pounce', 'outspend', 'cover', 'loan', 'investor', 'closed', 'steady', 'sign', 'pay', 'savings', 'no', 'humble', 'apologize', 'promote', 'market', 'ignore']

/** Answer every popup sensibly (never sell the company). */
export function drain(g: GameState): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => PREFER.includes(c.id)) ?? m.choices[m.choices.length - 1]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || '1', m.data, m)
    else if (m.kind === 'minigame') {
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        runScript(g, m.scriptId, JSON.stringify({ price: r.suggestedPrice, production: Math.min(r.maxProduction, Math.round(r.expectedDemand * 1.05)) }), m.data, m)
      } else runScript(g, m.scriptId, 'skip', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

export function adult(seed: number, year: number, countryId: string, money = 1e9): GameState {
  const g = createNewLife({ seed, year: year - 30, countryId })
  g.queue = []
  g.year = year
  const c = g.character
  c.age = 30
  c.money = money
  c.stats.smarts = 90
  c.city = getCountry(countryId).cities[0]
  c.licenses = ['driver']
  c.talent = null
  c.talents = ['Business']
  return g
}

export function company(g: GameState, industry: Industry, opts: { cash?: number; outlets?: number; name?: string } = {}): Asset {
  const c = g.character
  const b = newBiz(g, industry, c.countryId, c.city, { cash: opts.cash ?? 20_000_000, quality: 70, brand: 40 })
  if (opts.outlets) b.outlets[0].count = opts.outlets
  const a = createBusinessAsset(g, opts.name ?? `Test ${industry}`, b, 0)
  g.assets.push(a)
  c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
  return a
}

/** One fiscal year: the calendar moves on and the business hook runs, popups answered. */
export function nextYear(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  yearlyBusinessImpl(g)
  drain(g)
}

export function allNodes(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...allNodes(g, n.children(g))] : [n]))
}

/** Every row of a company screen as text (labels, subtitles, hints, reasons, infos). */
export function renderAll(g: GameState, a: Asset): string[] {
  const out: string[] = []
  for (const n of allNodes(g, businessAssetView(g, a))) {
    if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    else if (n.type === 'heading') out.push(n.label)
    else {
      out.push(n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '', n.hint?.(g) ?? '', n.disabledReason?.(g) ?? '')
      if (n.type === 'menu' && n.header) out.push(n.header(g))
    }
  }
  return out
}

/** The Market & Competition menu node of a company. */
export function marketNode(g: GameState, a: Asset): MenuNode | undefined {
  const find = (nodes: MenuNode[]): MenuNode | undefined => {
    for (const n of nodes) {
      if (n.type === 'menu' && n.id === `biz.market.${a.id}`) return n
      if (n.type === 'menu') {
        const r = find(n.children(g))
        if (r) return r
      }
    }
    return undefined
  }
  return find(businessAssetView(g, a))
}

export { bizOf }
