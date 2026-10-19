import { describe, expect, it } from 'vitest'
import { anachronismsIn } from '../src/game/events/era'
import { signed } from '../src/game/history/market-events'
import { exchangeInfo } from '../src/game/invest/engine'
import { SECTOR_TRADE, sectorOfSec, sectorWaves, waveClause, waveIndexFactor, waveNews, waveTag } from '../src/game/invest/wave-stocks'
import { investmentListing, investmentsMenu } from '../src/game/investments'
import { roleOf, type TechWave } from '../src/game/business/tech-waves'
import type { GameState, Json, MenuGroup, MenuNode } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'
import { allNodes } from './market-kit'

const J = (v: unknown): Json => v as Json
const near = (n: number) => expect.closeTo(n, 6)
const SMART = (o: Partial<TechWave> = {}): TechWave => ({ id: 'workshop:smartphone:2030:x', kind: 'smartphone', name: 'Smartphones', source: 'workshop', year: 2030, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }
const world = () => { const g = makeTestGame(7, { age: 30, countryId: 'us', money: 5e9, residence: { status: 'renting', rent: 0 } }); g.lifeId = 'surface-waves'; g.year = 2031; return g }
const stock = (g: GameState, pick: (sector: string | null, role: string | null) => boolean) => investmentListing(g).find((q) => { if (q.type !== 'stock') return false; const s = sectorOfSec(q.secId), t = s ? SECTOR_TRADE[s] : null; return pick(s, t ? roleOf('smartphone', t) : null) })!
const textOf = (g: GameState, n: MenuNode) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
const deepFreeze = (o: unknown): void => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v) } }

describe('the tag, the clause and the news line', () => {
  it('the tag names the live wave with the largest effect on the sector (at least 0.5%), the Quote row shows it, a bank gets none', () => {
    const g = world(); put(g, SMART()); const core = stock(g, (_s, r) => r === 'core'), bank = stock(g, (s) => s === 'banks')
    expect(sectorWaves(g, core.secId, 2031)).toEqual([{ id: 'workshop:smartphone:2030:x', name: 'Smartphones', level: near(1.189) }])
    expect([waveTag(g, core.secId, 2031), waveTag(g, bank.secId, 2031)]).toEqual(['Smartphones wave: sector +19%', null])
    put(g, SMART({ id: 'a' }), SMART({ id: 'b', name: 'Cheap phones', size: 0.2 })); expect(waveTag(g, core.secId, 2031)).toBe('Smartphones wave: sector +19%')
    put(g, SMART({ size: 0.05, hype: 0.1, delivery: 0 })); expect(waveTag(g, core.secId, 2031)).toBeNull()
    put(g, SMART()); const offer = allNodes(g, investmentsMenu.children(g)).find((n) => n.id === `inv-offer-${core.secId}`) as MenuGroup
    expect(offer.children(g).map((n) => textOf(g, n))).toContain('Smartphones wave: sector +19%')
  })
  it('the market line gets one clause for the biggest wave on the index, and the news adds at most one wave line a year, under 110 characters', () => {
    const g = world(), key = exchangeInfo('us').key; expect([waveClause(g, key, 2031), waveNews(g, key, 2031)]).toEqual([null, null])
    put(g, SMART({ year: 2031 }), SMART({ id: 'chips', kind: 'chips', name: 'Chip leap', year: 2031, size: 0.6, hype: 1, delivery: 1 }))   // announced this year, so the year's move is the whole level
    const lines = allNodes(g, investmentsMenu.children(g)).filter((n) => n.id.startsWith('inv-news-')).map((n) => textOf(g, n)), clause = waveClause(g, key, 2031)!
    expect(clause).toMatch(/^[A-Za-z ]+ wave: index [+\u2212]\d+%$/); expect(lines[0].endsWith(` · ${clause}`)).toBe(true)
    const news = lines.filter((l) => / wave moved .+ stocks (up|down) \d+%\.$/.test(l)); expect(news).toHaveLength(1); expect(news[0].length).toBeLessThan(110)
    expect(news[0]).toMatch(/^Chip leap wave moved Semiconductors stocks up 4[34]%\.$/)   // the US lists chip makers as Semiconductors in 2031 and no Electronics company, which the exchange plan would name first (P10)
    put(g, SMART()); expect(waveClause(g, key, 2031)).toBe(`Smartphones wave: index ${signed(waveIndexFactor(g, key, 2031))}`)
    put(g, SMART({ size: 0.05, hype: 0.1, delivery: 0 })); expect([waveClause(g, key, 2031), waveNews(g, key, 2031)]).toEqual([null, null])
  })
  it('skips a name the era check flags and keeps the rest', () => {
    let skipped = 0
    for (const c of COUNTRIES.map((x) => x.id)) for (const y of [2007, 2009, 2011]) {
      const key = exchangeInfo(c).key, g = makeTestGame(1); g.year = y
      put(g, SMART({ year: 2005, last: 2011 })); const s = waveClause(g, key, y); put(g, SMART({ year: 2005, last: 2011, name: 'Frontier AI' })); const f = waveClause(g, key, y)
      if (s !== null) expect(anachronismsIn(s, y, [c])).toEqual([]); else if (f !== null) skipped++
    }
    expect(skipped).toBeGreaterThan(0)
  })
  it('renders from a deep-frozen state and never holds an em-dash, NaN or undefined', () => {
    const g = world(), key = exchangeInfo('us').key; put(g, SMART()); const id = stock(g, (_s, r) => r === 'core').secId; deepFreeze(g)
    const texts = [waveTag(g, id, 2031), waveClause(g, key, 2031), waveNews(g, key, 2031), ...sectorWaves(g, id, 2031).map((x) => x.name)]
    for (const t of texts) expect(t ?? '').not.toMatch(/\u2014|\u2013|NaN|undefined|Infinity/)
  })
})
