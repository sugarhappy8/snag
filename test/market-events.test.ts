// Rival events under the brand rules: real companies make neutral competitive moves only (launches,
// flagship stores, expansions, promotions, price cuts) and are never accused of anything; the
// scandals stay fictional; supply shocks are cushioned by diversified suppliers; old saves keep
// loading; and a 40-year life with strategy moves stays finite and sane.
import { describe, expect, it } from 'vitest'
import { COMPETITION_EVENTS, presentCompetitionEvent } from '../src/game/business/competition-events'
import { marketOfBiz, marketViewOf } from '../src/game/business/competition'
import { readMarket } from '../src/game/business/competition-state'
import { marketStateOf } from '../src/game/business/competition-core'
import { runCampaign, runDefend, runEnter, runSupply } from '../src/game/business/market-strategy'
import { bizOf, readBiz } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { ChoiceModal, GameState, Json, NoticeModal } from '../src/game/types'
import { adult, company, drain, nextYear, renderAll } from './market-kit'

const ACCUSING = /scandal|breach|leaked|recall|lawsuit|fraud|embezzl|irregularit|walking wallets|knockoff|copycat|suspiciously|shameless|starve|predatory|cartel/i

function texts(g: GameState): string[] {
  return g.queue.flatMap((m) => {
    if (m.kind === 'notice') return [(m as NoticeModal).title, (m as NoticeModal).text]
    if (m.kind === 'choice') return [(m as ChoiceModal).title, (m as ChoiceModal).text, ...(m as ChoiceModal).choices.map((c) => c.label)]
    return []
  })
}

describe('competition events and real companies', () => {
  it('never accuses a real company of anything, in any industry, era or country', () => {
    const cases: [Industry, string, number][] = [['software', 'us', 2015], ['restaurant', 'jp', 2010], ['manufacturing', 'de', 1985], ['semiconductor', 'us', 1995], ['hotel', 'gb', 2005], ['aiLab', 'us', 2023], ['cafe', 'br', 2018]]
    for (const [ind, cid, year] of cases) {
      for (const seed of [1, 2, 3]) {
        const g = adult(seed, year, cid)
        const a = company(g, ind)
        for (let i = 0; i < 2; i++) nextYear(g)
        const b = bizOf(g, a)
        // A product, so that rival launches can answer it.
        b.products.push({ name: 'Flagship', launched: g.year - 1, boost: 0.1 })
        const real = new Set(marketViewOf(g, b).rivals.filter((r) => r.real).map((r) => r.name))
        expect(real.size, `${ind}: real rivals`).toBeGreaterThan(0)
        for (const ev of COMPETITION_EVENTS) {
          g.queue = []
          presentCompetitionEvent(g, a, bizOf(g, a), ev.id)
          const modals = g.queue.filter((m) => m.kind === 'choice') as ChoiceModal[]
          for (const m of modals) {
            const data = (m.data ?? {}) as Record<string, Json>
            const name = typeof data.rival === 'string' ? data.rival : ''
            if (ev.id === 'rivalScandal') expect(real.has(name), `${ind}: scandal about real ${name}`).toBe(false)
            if (real.has(name)) {
              for (const t of texts(g)) expect(t, `${ind}/${ev.id}: "${t}"`).not.toMatch(ACCUSING)
              // Nobody sues a real company in this game.
              if (ev.id === 'copycat') expect(m.choices.map((c) => c.id)).not.toContain('sue')
            }
          }
          g.queue = []
        }
      }
    }
  })

  it('has the neutral events and the supply shock in the table, with sane odds', () => {
    const ids = COMPETITION_EVENTS.map((e) => e.id)
    for (const want of ['giantBid', 'copycat', 'rivalPriceWar', 'rivalScandal', 'newcomer', 'rivalMove', 'supplyShock']) expect(ids).toContain(want)
    const g = adult(3, 2015, 'us')
    const a = company(g, 'manufacturing')
    for (let i = 0; i < 2; i++) nextYear(g)
    const b = bizOf(g, a)
    const shock = COMPETITION_EVENTS.find((e) => e.id === 'supplyShock')!
    expect(shock.weight(g, b)).toBeGreaterThan(0)
    const sw = company(g, 'software')
    for (let i = 0; i < 2; i++) nextYear(g)
    expect(shock.weight(g, bizOf(g, sw))).toBe(0)
  })

  it('cushions a supply shock for a diversified company and hurts an exposed one', () => {
    const run = (diversified: boolean) => {
      const g = adult(4, 2015, 'us')
      const a = company(g, 'manufacturing', { cash: 100_000_000 })
      for (let i = 0; i < 2; i++) nextYear(g)
      g.yearActions = {}
      if (diversified) expect(runSupply(g, a, bizOf(g, a))).toBe(true)
      g.queue = []
      presentCompetitionEvent(g, a, bizOf(g, a), 'supplyShock')
      const st = marketStateOf(readBiz(g, a))!
      return { edge: st.edge, cost: bizOf(g, a).costShock, text: texts(g).join(' ') }
    }
    const exposed = run(false)
    const safe = run(true)
    expect(exposed.edge).toBeLessThan(safe.edge)
    expect(exposed.cost).toBeGreaterThan(safe.cost)
    expect(exposed.text).toMatch(/Supply Chain Disruption/)
    expect(safe.text).toMatch(/scratch/)
    expect(exposed.text).not.toMatch(ACCUSING)
  })

  it('answers a rival move with a promotion, a price trim or nothing, each priced by the model', () => {
    const g = adult(5, 2015, 'us')
    const a = company(g, 'software')
    for (let i = 0; i < 2; i++) nextYear(g)
    g.queue = []
    presentCompetitionEvent(g, a, bizOf(g, a), 'rivalMove')
    const m = g.queue.find((x) => x.kind === 'choice') as ChoiceModal
    expect(m).toBeTruthy()
    expect(m.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['promote', 'match', 'ignore']))
    expect(m.title).toMatch(/Makes a Move/)
    const cash = bizOf(g, a).cash
    drain(g)
    expect(bizOf(g, a).cash).toBeLessThanOrEqual(cash + 1)
  })
})

describe('alcohol makers are adult brands', () => {
  it("a minor who inherits a brewery sees 'Brewer A', not the real labels; an adult sees the real field", () => {
    const g = adult(8, 2012, 'de')
    const a = company(g, 'brewery')
    for (let i = 0; i < 2; i++) nextYear(g)
    const adultView = marketViewOf(g, readBiz(g, a))
    expect(adultView.rivals.some((r) => r.real && /Krombacher|Warsteiner|Bitburger|Heineken|Carlsberg/.test(r.name))).toBe(true)
    g.character.age = 12
    const kid = marketViewOf(g, readBiz(g, a))
    for (const r of kid.rivals.filter((x) => x.real)) expect(r.name).toMatch(/^Brewer [A-Z]$/)
    expect(new Set(kid.rivals.map((r) => r.name)).size).toBe(kid.rivals.length)
    expect(renderAll(g, a).join('\n')).not.toMatch(/Krombacher|Warsteiner|Bitburger|Heineken|Carlsberg/)
    g.character.age = 30
  })
})

describe('old saves and damaged market data', () => {
  it('reads a market state from before the new moves existed and renders the whole screen', () => {
    const g = adult(6, 2015, 'us')
    const a = company(g, 'software')
    for (let i = 0; i < 3; i++) nextYear(g)
    const b = bizOf(g, a)
    const st = marketOfBiz(b)
    // The old shape: no entries, campaigns, deals, supply, defence or buy-out years; rival ids from the old fictional roster.
    const old = JSON.parse(JSON.stringify(st)) as Record<string, Json>
    for (const k of ['entries', 'campaigns', 'deals', 'supplyUntil', 'defendUntil', 'acquired']) delete old[k]
    old.rivals = [['r0', 0.2], ['r1', 0.1], ['r5', 0.05]]
    old.gone = ['r2']
    ;(old.history as Json[]).forEach((h) => {
      delete (h as Record<string, Json>).lead
      delete (h as Record<string, Json>).hhi
    })
    b.market = old as Json
    const read = readMarket(b.market, 'world')!
    expect(read.entries).toEqual([])
    expect(read.acquired).toEqual([])
    expect(read.supplyUntil).toBe(0)
    const text = renderAll(g, a).join('\n')
    expect(text).not.toMatch(/NaN|undefined|Infinity/)
    nextYear(g)
    const after = marketViewOf(g, readBiz(g, a))
    expect(after.share).toBeGreaterThanOrEqual(0)
    expect(after.share).toBeLessThanOrEqual(1)
  })

  it('shrugs off garbage in the new fields', () => {
    const g = adult(6, 2015, 'us')
    const a = company(g, 'software')
    for (let i = 0; i < 2; i++) nextYear(g)
    const b = bizOf(g, a)
    const st = JSON.parse(JSON.stringify(marketOfBiz(b))) as Record<string, Json>
    st.entries = [null, 5, { country: 'zz9', mode: 'fly' }, { country: 'de', mode: 'jv', year: 'x', until: null }, { country: 'fr', home: 'us', mode: 'sub', year: 2014, until: 2030 }] as Json[]
    st.campaigns = ['a', { country: 9 }] as Json[]
    st.deals = [{ rivalId: '' }, 3] as Json[]
    st.acquired = ['x', 2010, null] as Json[]
    st.supplyUntil = 'later'
    b.market = st as Json
    const read = readMarket(b.market, 'world')!
    expect(read.entries.map((e) => e.country)).toEqual(['de', 'fr'])
    expect(read.campaigns).toEqual([])
    expect(read.deals).toEqual([])
    expect(read.acquired).toEqual([2010])
    expect(read.supplyUntil).toBe(0)
    expect(renderAll(g, a).join('\n')).not.toMatch(/NaN|undefined|Infinity/)
  })
})

function finite(v: unknown, path = 'g'): void {
  if (typeof v === 'number') {
    expect(Number.isFinite(v), path).toBe(true)
    return
  }
  if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`)
}

describe('a long life with strategy moves', () => {
  it('stays finite and sane for 40 years of entering, campaigning, defending and diversifying', () => {
    for (const [ind, cid, year] of [['manufacturing', 'us', 1985], ['semiconductor', 'tw', 1990], ['restaurant', 'jp', 1986]] as [Industry, string, number][]) {
      const g = adult(11, year, cid)
      const a = company(g, ind, { cash: 100_000_000 })
      const targets = ['de', 'cn', 'us', 'br', 'in', 'jp', 'fr', 'gb']
      let moved = 0
      for (let y = 0; y < 40; y++) {
        nextYear(g)
        g.yearActions = {}
        const b = bizOf(g, a)
        if (!g.character.alive || !g.assets.some((x) => x.id === a.id)) break
        b.cash = Math.max(b.cash, 5_000_000)
        const t = targets[y % targets.length]
        if (y % 3 === 0 && runEnter(g, a, bizOf(g, a), t, (['export', 'jv', 'sub'] as const)[(y / 3) % 3])) moved++
        if (y % 4 === 1 && runCampaign(g, a, bizOf(g, a), cid)) moved++
        if (y % 5 === 2 && runDefend(g, a, bizOf(g, a))) moved++
        if (y % 6 === 3 && runSupply(g, a, bizOf(g, a))) moved++
        const v = marketViewOf(g, readBiz(g, a))
        expect(v.share).toBeGreaterThanOrEqual(0)
        expect(v.share).toBeLessThanOrEqual(1)
        const named = v.rivals.reduce((t2, r) => t2 + r.share, 0)
        expect(v.share + named + 0.0001).toBeLessThanOrEqual(1.0001)
        for (const r of v.rivals) expect(Number.isFinite(r.share) && r.share >= 0).toBe(true)
        const st = marketStateOf(readBiz(g, a))
        if (st) {
          expect(st.entries.length).toBeLessThanOrEqual(24)
          expect(st.campaigns.length).toBeLessThanOrEqual(12)
        }
      }
      expect(moved, `${ind}: the moves ran`).toBeGreaterThan(3)
      finite(g.assets.map((x) => x.details), `${ind} assets`)
      expect(renderAll(g, a).join('\n')).not.toMatch(/NaN|undefined|Infinity/)
    }
  }, 120_000)
})
