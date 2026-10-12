// The Market & Competition screen: pure menus (state and dice untouched, same output twice),
// the sections the player asked for (overview, leaderboard, segments, regions and countries,
// history, rival profiles, strategy and scenarios), honest purple hints, and no giant lists.
import { describe, expect, it } from 'vitest'
import { marketViewOf } from '../src/game/business/competition'
import { concentrationOf, leaderboard, regionsOf, segmentsOf, countryDetail, profileOf, historyOf, spark, bar } from '../src/game/business/market-view'
import { homeBias, regionalShares } from '../src/game/business/market-regional'
import { placeContinent } from '../src/game/business/market-places'
import { scenarioRows } from '../src/game/business/market-menu'
import { demandWeights } from '../src/game/business/market-reach'
import { readBiz } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { adult, allNodes, company, marketNode, nextYear, renderAll } from './market-kit'

function setup(ind: Industry, country = 'us', year = 2015, years = 3, seed = 5): { g: GameState; a: Asset } {
  const g = adult(seed, year, country)
  const a = company(g, ind)
  for (let i = 0; i < years; i++) nextYear(g)
  return { g, a }
}

function find(g: GameState, a: Asset, idPart: string): MenuNode[] {
  const m = marketNode(g, a)
  return m ? allNodes(g, [m]).filter((n) => n.id.includes(idPart)) : []
}

describe('market screen: purity and shape', () => {
  it('renders every row without touching the state or the dice, the same way twice, and never prints NaN', () => {
    for (const [ind, cid, year] of [['software', 'us', 2015], ['restaurant', 'jp', 2010], ['semiconductor', 'us', 1990], ['hotel', 'gb', 1985], ['aiLab', 'cn', 2022]] as [Industry, string, number][]) {
      const { g, a } = setup(ind, cid, year, 3)
      const before = JSON.stringify(g)
      const rng = JSON.stringify(g.rng)
      const one = renderAll(g, a)
      const two = renderAll(g, a)
      expect(JSON.stringify(g), `${ind}: menus changed the state`).toBe(before)
      expect(JSON.stringify(g.rng), `${ind}: menus touched the dice`).toBe(rng)
      expect(two).toEqual(one)
      const text = one.join('\n')
      expect(text).toMatch(/Market & Competition/)
      expect(text, ind).not.toMatch(/NaN|undefined|Infinity|\[object/)
    }
  })

  it('has the sections of the global market screen and no giant lists', () => {
    const { g, a } = setup('software')
    const m = marketNode(g, a) as MenuGroup
    const labels = m.children(g).map((n) => ('label' in n ? n.label : n.type))
    for (const want of ['Market Overview', 'Leaderboard', 'Segments', 'Regions & Countries', 'History', 'Rival Profiles', 'Competitive Moves', 'Enter a New Country', 'Regional Brand Campaigns', 'Protect & Partner', 'What-If Scenarios']) expect(labels, want).toContain(want)
    for (const n of allNodes(g, [m])) {
      if (n.type !== 'menu') continue
      const kids = n.children(g)
      expect(kids.length, `${n.label} has ${kids.length} rows`).toBeLessThanOrEqual(16)
    }
    // The top level groups its sections under headings.
    expect(m.children(g).filter((n) => n.type === 'heading').length).toBeGreaterThanOrEqual(2)
  })

  it('shows deep-tech only moves to deep-tech companies and supply chains only to goods businesses', () => {
    const sw = setup('software')
    const vis = (g: GameState, a: Asset, label: string) => find(g, a, '').find((n) => 'label' in n && n.label === label && (n.type === 'menu' || n.type === 'action'))
    const lic = vis(sw.g, sw.a, 'Patent Cross-Licences')
    expect(lic && 'visible' in lic ? lic.visible?.(sw.g) : true).toBe(false)
    const sup = vis(sw.g, sw.a, 'Diversify Supply Chains')
    expect(sup && 'visible' in sup ? sup.visible?.(sw.g) : true).toBe(false)
    const ai = setup('aiLab', 'us', 2022)
    const lic2 = vis(ai.g, ai.a, 'Patent Cross-Licences')
    expect(lic2 && 'visible' in lic2 ? lic2.visible?.(ai.g) : false).toBe(true)
    const car = setup('manufacturing', 'us', 2015)
    const sup2 = vis(car.g, car.a, 'Diversify Supply Chains')
    expect(sup2 && 'visible' in sup2 ? sup2.visible?.(car.g) : false).toBe(true)
  })
})

describe('market screen: the numbers behind the sections', () => {
  it('gives off-map rival headquarters their real region instead of the world fallback country', () => {
    expect(placeContinent('lu')).toBe('Europe')
    expect(placeContinent('la')).toBe('Asia')
    expect(homeBias('lu', 'fr', 'software', 1950, false)).toBeGreaterThan(homeBias('lu', 'jp', 'software', 1950, false))
  })

  it('computes concentration, a leaderboard with the player slotted in, segments and history', () => {
    const { g, a } = setup('software')
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    const c = concentrationOf(v)
    expect(c.hhi).toBeGreaterThan(0)
    expect(c.hhi).toBeLessThanOrEqual(10_000)
    expect(c.top3).toBeGreaterThan(0)
    expect(['fragmented', 'competitive', 'moderately concentrated', 'highly concentrated', 'near-monopoly']).toContain(c.label)
    const lb = leaderboard(v, b, a.name, 10)
    expect(lb.length).toBeGreaterThanOrEqual(10)
    expect(lb.some((r) => r.me)).toBe(true)
    for (let i = 1; i < lb.length; i++) if (!lb[i].me && !lb[i - 1].me) expect(lb[i - 1].share).toBeGreaterThanOrEqual(lb[i].share)
    const segs = segmentsOf(b, v)
    expect(segs).toHaveLength(4)
    expect(segs.filter((s) => s.mine)).toHaveLength(1)
    expect(segs.reduce((t, s) => t + s.weight, 0)).toBeCloseTo(1, 5)
    for (const s of segs) {
      expect(s.me).toBeGreaterThanOrEqual(0)
      expect(s.me).toBeLessThanOrEqual(1)
    }
    const h = historyOf(v, 12)
    expect(h.years.length).toBeGreaterThanOrEqual(2)
    expect(spark(h.me)).toHaveLength(h.me.length)
    expect(bar(0.5, 1, 10)).toHaveLength(10)
  })

  it('splits a world market by country consistently: each country sums to 100%, each company averages back to its world share', () => {
    const { g, a } = setup('software', 'us', 2018)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    const reg = regionalShares({
      industry: b.industry,
      year: v.year,
      home: b.countryId,
      meShare: v.share,
      mePresence: (c) => (c === b.countryId ? 1 : 0),
      rivals: v.rivals.map((r) => ({ id: r.id, hq: r.hq, share: r.share, legacy: r.legacy })),
      fringe: v.fringe,
    })
    const w = demandWeights(b.industry)
    for (const c of w.keys()) {
      if ((w.get(c) ?? 0) <= 0) continue
      let sum = reg.me.get(c) ?? 0
      sum += reg.fringe.get(c) ?? 0
      for (const m of reg.rivals.values()) sum += m.get(c) ?? 0
      expect(sum, c).toBeGreaterThan(0.97)
      expect(sum, c).toBeLessThan(1.03)
    }
    for (const r of v.rivals.slice(0, 8)) {
      const m = reg.rivals.get(r.id)!
      let avg = 0
      for (const [c, s] of m) avg += (w.get(c) ?? 0) * s
      expect(avg, r.name).toBeGreaterThan(r.share * 0.9)
      expect(avg, r.name).toBeLessThan(r.share * 1.1 + 1e-6)
    }
    // Home advantage: a US company is stronger in the US than in Japan.
    const ms = reg.rivals.get(v.rivals.find((r) => r.hq === 'us')!.id)!
    expect(ms.get('us')!).toBeGreaterThan(ms.get('jp')!)
    // Regions and a country drilldown.
    const regions = regionsOf(g, b, v)
    expect(regions.length).toBeGreaterThanOrEqual(5)
    expect(regions.reduce((t, r) => t + r.weight, 0)).toBeCloseTo(1, 2)
    const d = countryDetail(g, b, v, 'de')!
    expect(d.row.name).toBe('Germany')
    expect(d.barriers.bloc).toBeNull()
    expect(d.regime.name).toMatch(/European Commission/)
    expect(d.mergerLimit).toBeGreaterThan(0.2)
    expect(d.champions.some((x) => x.name === 'SAP')).toBe(true)
  })

  it('profiles a rival: real, founded, based somewhere, strengths, what it did lately, what it does next', () => {
    const { g, a } = setup('software')
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    const top = v.rivals[0]
    const p = profileOf(g, b, v, top.id)!
    expect(p.rival.real).toBe(true)
    expect(p.age).toBeGreaterThan(0)
    expect(p.recent.length).toBeGreaterThan(0)
    expect(p.next.length).toBeGreaterThan(10)
    expect(p.places.length).toBeGreaterThan(0)
    expect(['cheaper', 'similar', 'pricier']).toContain(p.strengths.priceEdge)
    // Same story twice.
    expect(profileOf(g, b, v, top.id)!.next).toBe(p.next)
  })

  it('shows national markets the real local field in other countries, not the world', () => {
    const { g, a } = setup('restaurant', 'jp', 2010)
    const rows = renderAll(g, a).join('\n')
    expect(rows).toMatch(/Yoshinoya|Sukiya|Skylark/)
    expect(rows).toMatch(/McDonald's/)
    expect(rows).toMatch(/Who you would face there/)
  })

  it('answers what each move is expected to do, with the same numbers the actions use', () => {
    const { g, a } = setup('software')
    const rows = scenarioRows(g, a)
    const ids = rows.map((r) => r.id)
    for (const want of ['offense', 'raid', 'defend']) expect(ids).toContain(want)
    for (const r of rows) {
      if (r.value !== null) expect(Number.isFinite(r.value)).toBe(true)
      if (r.shareDelta !== null) expect(Number.isFinite(r.shareDelta)).toBe(true)
    }
  })
})

describe('market screen: purple hints are honest', () => {
  it('shows the Business talent the same dollars the scenario computed', () => {
    const { g, a } = setup('software')
    const defend = find(g, a, 'biz.mkt.defend.')[0] as MenuAction
    const sc = scenarioRows(g, a).find((r) => r.id === 'defend')!
    const hint = defend.hint?.(g) ?? ''
    expect(hint).toMatch(/Digging in/)
    if (sc.value !== null) expect(hint).toMatch(sc.value > 0 ? /worth about/ : /not worth it/)
    g.character.talents = []
    expect(defend.hint?.(g) ?? '').toBe('')
  })
})

describe('market screen: lines read cleanly', () => {
  const text = (g: GameState, n: MenuNode) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')

  it('puts share bars and sparklines on their own line or at the end, never between words', () => {
    // Playtest: leaderboard rows read like "#2 Sukiya ▓▓▓▓▓░░░░░ 9.1% ↗ · major".
    const { g, a } = setup('restaurant', 'jp', 2010, 4)
    const m = marketNode(g, a)!
    const lines = allNodes(g, [m]).flatMap((n) => [text(g, n), n.type === 'menu' && typeof n.subtitle === 'function' ? n.subtitle(g) : ''])
    expect(lines.join('\n')).toMatch(/[▓░]/)
    for (const line of lines.flatMap((t) => t.split('\n'))) expect(line).not.toMatch(/[▁-█░▓]+ +[^\s▁-█░▓]/)
    const lb = find(g, a, 'biz.mkt.lb.').map((n) => text(g, n)).filter((t) => t.startsWith('#'))
    expect(lb.length).toBeGreaterThan(2)
    for (const row of lb) expect(row).toMatch(/^#\d+ [^\n]+ · [\d.<]+% [↗↘→] · [^\n]+\n[▓░]{10}$/)
  })

  it('phrases What-If Scenarios as plain "If you …" sentences', () => {
    const { g, a } = setup('software')
    const lines = find(g, a, 'biz.mkt.sc.').map((n) => text(g, n))
    expect(lines.length).toBeGreaterThan(2)
    for (const line of lines) expect(line).toMatch(/^If you /)
    expect(lines.find((l) => l.startsWith('If you cut prices hard: '))).toMatch(/^If you cut prices hard: share (unchanged|up [\d.]+ pts|down [\d.]+ pts), about [+-]\$[\d.,]+[KMB]? profit \(15% off/)
    expect(lines.join('\n')).not.toMatch(/ net\b|pts share|Price offensive:/)
  })
})
