// Competition in every era: the Market & Competition screen, the rivals' names and the
// competition events read right for the year (no websites in 1930, no data breaches before
// computers), a market that doesn't exist yet can't be entered, and the numbers stay sane in
// the early, tiny markets of the 1900s-1980s.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { businessAssetView } from '../src/game/business'
import { marketViewOf } from '../src/game/business/competition'
import { industryEraBlock } from '../src/game/business/competition-data'
import { COMPETITION_EVENTS, maybeAntitrust, presentCompetitionEvent } from '../src/game/business/competition-events'
import { marketOfBiz, saveMarket } from '../src/game/business/competition'
import { marketCtxFor } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, findBusiness, readBiz } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { anachronismsIn } from '../src/game/events/era'
import { createNewLife } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, Asset, GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

function adult(seed: number, year: number, countryId: string): GameState {
  const g = createNewLife({ seed, year: year - 30, countryId })
  g.queue = []
  g.year = year
  const c = g.character
  c.age = 30
  c.money = 1e9
  c.stats.smarts = 90
  c.city = getCountry(countryId).cities[0]
  c.licenses = ['driver']
  c.talent = null
  c.talents = ['Business']
  return g
}

function company(g: GameState, industry: Industry): Asset {
  const c = g.character
  const b = newBiz(g, industry, c.countryId, c.city, { cash: 20_000_000, quality: 70, brand: 40 })
  b.products = [{ name: 'Deluxe Line', launched: g.year, boost: 0.1 }]
  const a = createBusinessAsset(g, `Test ${industry}`, b, 0)
  g.assets.push(a)
  c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
  return a
}

/** Every text a popup, notice or log line shows, answered with choice `pick` (first/last). */
function drain(g: GameState, sink: string[], last: boolean): void {
  for (let guard = 0; g.queue.length && guard < 300; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'notice') sink.push(m.title, m.text)
    else if (m.kind === 'choice') {
      sink.push(m.title, m.text, ...m.choices.flatMap((c) => [c.label, c.hint ?? '']))
      const ch = last ? m.choices[m.choices.length - 1] : m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id === 'accept' ? m.choices[m.choices.length - 1].id : ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || '1', m.data, m)
    else if (m.kind === 'minigame') {
      if (m.game === 'annualReport') {
        const r = m.data as unknown as AnnualReportData
        sink.push(r.marketNote ?? '', r.talentHint?.text ?? '')
        runScript(g, m.scriptId, JSON.stringify({ price: r.suggestedPrice, production: Math.min(r.maxProduction, Math.round(r.expectedDemand * 1.05)) }), m.data, m)
      } else runScript(g, m.scriptId, 'skip', m.data, m)
    } else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function nextYear(g: GameState, sink: string[], last = false): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  yearlyBusinessImpl(g)
  drain(g, sink, last)
}

function marketScreen(g: GameState, a: Asset): string[] {
  const menu = businessAssetView(g, a).find((n) => n.id === `biz.market.${a.id}`)
  if (!menu || menu.type !== 'menu') return []
  const walk = (nodes: MenuNode[]): string[] =>
    nodes.flatMap((n) => {
      if (n.type === 'info') return [typeof n.text === 'function' ? n.text(g) : n.text]
      if (n.type === 'heading') return [n.label]
      const own = [n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '', n.hint?.(g) ?? '', n.disabledReason?.(g) ?? '']
      return n.type === 'menu' ? [...own, n.header?.(g) ?? '', ...walk(n.children(g))] : own
    })
  return [menu.label, menu.header?.(g) ?? '', typeof menu.subtitle === 'function' ? menu.subtitle(g) : '', menu.hint?.(g) ?? '', ...walk(menu.children(g))]
}

/** Every competition event for a company, resolved with the first and the last choice. */
function allEvents(seed: number, industry: Industry, countryId: string, year: number, sink: string[]): void {
  for (const ev of COMPETITION_EVENTS) {
    for (const last of [false, true]) {
      const g = adult(seed, year, countryId)
      const a = company(g, industry)
      nextYear(g, sink, last)
      if (!findBusiness(g, a.id)) continue
      const b = bizOf(g, a)
      if (ev.id === 'newcomer') {
        const st = marketOfBiz(b)
        st.extra = [...st.extra, { id: 'xtest', name: 'Upstart Test Co', hq: countryId, founded: g.year, pot: 1, ramp: 3, origin: 'entrant' }]
        saveMarket(b, st)
      }
      g.queue = []
      presentCompetitionEvent(g, a, bizOf(g, a), ev.id)
      drain(g, sink, last)
      if (findBusiness(g, a.id)) nextYear(g, sink, last)
    }
  }
}

function eraProblems(texts: string[], year: number, countryId: string): string[] {
  return texts.filter((t) => t && anachronismsIn(t, year, [countryId]).length).map((t) => `${year} ${countryId} [${anachronismsIn(t, year, [countryId]).join(',')}]: ${t}`)
}

const ERAS: [Industry, string, number][] = [
  ['manufacturing', 'gb', 1925],
  ['energy', 'us', 1931],
  ['restaurant', 'jp', 1958],
  ['software', 'us', 1972],
  ['gameStudio', 'us', 1979],
  ['semiconductor', 'tw', 1982],
  ['ecommerce', 'us', 1997],
  ['fashion', 'ng', 1985],
]

describe('competition: every era reads right', () => {
  it('no anachronisms on the Market & Competition screen, in rivals or competition events', () => {
    const problems: string[] = []
    ERAS.forEach(([ind, cid, year], i) => {
      expect(industryEraBlock(ind, cid, year), `${ind} ${year}`).toBeNull()
      const sink: string[] = []
      const g = adult(40 + i, year, cid)
      const a = company(g, ind)
      nextYear(g, sink)
      nextYear(g, sink)
      if (findBusiness(g, a.id)) {
        sink.push(...marketScreen(g, a))
        for (const r of marketViewOf(g, readBiz(g, a)).rivals) sink.push(r.name)
      }
      allEvents(60 + i, ind, cid, year, sink)
      problems.push(...eraProblems(sink, year + 2, cid))
      expect(sink.join('\n')).not.toMatch(/NaN|undefined|Infinity|\[object/)
    })
    expect(problems).toEqual([])
  }, 120_000)

  it('keeps early, tiny markets sane: few rivals, real shares, no antitrust for small fry', () => {
    const g = adult(70, 1958, 'us')
    const a = company(g, 'software')
    const ctx = marketCtxFor(g, readBiz(g, a), 1958)
    // A handful of pioneers at most in the 1950s; dozens today.
    expect(ctx.rivals.length).toBeLessThan(6)
    const sink: string[] = []
    for (let y = 0; y < 6 && findBusiness(g, a.id); y++) nextYear(g, sink)
    const v = marketViewOf(g, readBiz(g, a))
    expect(v.size).toBeGreaterThan(0)
    expect(v.share).toBeGreaterThan(0)
    expect(v.share + v.rivals.reduce((t, r) => t + r.share, 0) + v.fringe).toBeCloseTo(1, 5)
    // A small business with a big share of a tiny market barely registers with regulators.
    const b = bizOf(g, a)
    b.last = { ...b.last!, revenue: 2_000_000 }
    const st = marketOfBiz(b)
    st.share = 0.8
    st.base = 0.8
    saveMarket(b, st)
    expect(marketViewOf(g, readBiz(g, a)).antitrust.p).toBeLessThan(0.01)
    maybeAntitrust(g, a, b, st.year, false)
    expect(g.queue.filter((m) => m.kind === 'choice' && m.title === 'Antitrust Investigation').length).toBeLessThanOrEqual(1)
  }, 60_000)
})
