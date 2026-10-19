// Tech waves, task 6: what the player reads. The report and overview lines, the wave news, the
// antitrust scrutiny and the screens that show them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { antitrustOf } from '../src/game/business/competition'
import { techOf } from '../src/game/business/deeptech-core'
import { techMarketNote } from '../src/game/business/deeptech-sim'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import { isFinanceFirm } from '../src/game/business/finance-firm-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, readBiz, type BizState } from '../src/game/business/state'
import { WAVE_KINDS, type WaveKind } from '../src/game/business/tech-wave-data'
import { announceWave, roleOf, waveLines, waveScrutiny, type TechWave } from '../src/game/business/tech-waves'
import { reportData } from '../src/game/business/yearly'
import { INDUSTRY_IDS, type Industry } from '../src/game/data/markets'
import { anachronismsIn } from '../src/game/events/era'
import { readMarketNews } from '../src/game/history/market-events'
import type { Asset, GameState, Json } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { adultIn } from './deeptech-kit'
import { makeTestGame } from './helpers'
import { adult, company, nextYear, renderAll } from './market-kit'

const J = (v: unknown): Json => v as Json
const near = (n: number) => expect.closeTo(n, 6)
/** The Task 2 `W`: kind ai, size .5, hype .8, delivery .6 (r = .36, size x delivery = .3). */
const AI = (o: Partial<TechWave> = {}): TechWave => ({ id: 'deeptech:ai:2031:x', kind: 'ai', name: 'Frontier AI', source: 'deeptech', year: 2031, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }

/** A company record as test/market-events.test.ts builds one. */
const bizFor = (trade: Industry): BizState => newBiz(makeTestGame(1), trade, 'us', 'Chicago', { cash: 2e6, founded: 2003 })
const marketNoteOf = (g: GameState, a: Asset): string => reportData(g, a, readBiz(g, a)).marketNote

/** A player-run deep-tech company set up directly (copied from test/deeptech.test.ts, renamed so it does not shadow market-kit's). */
const dtCompany = (g: GameState, industry: string, patch: Partial<TechState> = {}): Asset => {
  const c = g.character
  const b = newBiz(g, industry as Industry, c.countryId, c.city, { cash: 0, ceo: 'owner', manager: null })
  const t = readTech(undefined); Object.assign(t, { level: 40, ...patch })
  b.tech = JSON.parse(JSON.stringify(t)) as Json
  const a = createBusinessAsset(g, `Test ${industry}`, b, 0); g.assets.push(a)
  c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
  return a
}

describe('waveLines', () => {
  const lines = (industry: Industry, o: Partial<TechWave> = {}) => { const g = makeTestGame(1); g.year = 2035; put(g, AI({ delivery: 0.8, ...o })); return waveLines(g, { industry, countryId: 'us' }) }   // size .5, hype .8, delivery .8: r = .4
  it('writes two sentences with the spec numbers', () => {
    expect(lines('aiLab')).toEqual(['Frontier AI wave. Demand +12%, costs −4%, value +14%.']); expect(lines('dataCenter')).toEqual(['Frontier AI wave. Demand +8%, value +7%.'])
    expect(lines('software')).toEqual(['Frontier AI wave. Demand −10%, value −10%.']); expect(lines('bakery')).toEqual([])
  })
  it('is pure and finite, and shares one empty array when there is nothing to say', () => {
    const g = makeTestGame(1); expect(waveLines(g, { industry: 'aiLab', countryId: 'us' })).toBe(waveLines(g, { industry: 'bakery', countryId: 'us' }))
    put(g, AI()); const before = JSON.stringify(g), rng = g.rng; for (const l of waveLines(g, { industry: 'aiLab', countryId: 'us' }, 2035)) expect(l).not.toMatch(/NaN|undefined|Infinity/)
    expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
  })
  it('says Demand only where the wave demand applies: a game studio (through its market factor) and a lab do, and no finance firm has a role in any wave', () => {
    expect(lines('gameStudio', { kind: 'smartphone' })).toEqual(['Frontier AI wave. Demand +8%, value +7%.'])   // supply: demand 1 + 0.2 x 0.5 x 0.8 reaches a studio through studioMarketFactor (pinned in tech-waves-readers.test.ts)
    const finance = INDUSTRY_IDS.filter((id) => isFinanceFirm({ industry: id })); expect(finance).toHaveLength(3)   // their year is their own model, which reads no wave demand, so none may be given a role without a demand-free line
    for (const kind of Object.keys(WAVE_KINDS) as WaveKind[]) for (const trade of finance) expect(roleOf(kind, trade), `${kind} ${trade}`).toBeNull()
  })
  it('skips a line the era filter flags and keeps the rest', () => {
    let skipped = 0
    for (const c of COUNTRIES.map((x) => x.id)) for (const y of [2007, 2009, 2011]) {
      const g = makeTestGame(1); g.year = y; const out = waveLines(g, { industry: 'software', countryId: c }, y)
      for (const l of out) expect(anachronismsIn(l, y, [c])).toEqual([]); if (!out.some((l) => l.startsWith('Smartphones'))) skipped++
    }
    expect(skipped).toBeGreaterThan(0)
  })
})

describe('antitrust scrutiny', () => {
  it('multiplies the chance by 1 + 0.5 x size x delivery for a core trade only, and the 0.5 clamp still binds', () => {
    const g = makeTestGame(1); put(g, AI())
    expect([waveScrutiny(g, 'aiLab'), waveScrutiny(g, 'dataCenter'), waveScrutiny(makeTestGame(1), 'aiLab')]).toEqual([near(1.15), 1, 1])
    const b = bizFor('aiLab'), p1 = antitrustOf(b, 0.6, 2035).p; expect(p1).toBeGreaterThan(0); expect(antitrustOf(b, 0.6, 2035, 1, undefined, 1.15).p).toBeCloseTo(Math.min(0.5, p1 * 1.15), 6)
    expect(antitrustOf(b, 0.9, 2035, 1, undefined, 1e4).p).toBe(0.5)
  })
})

describe('wave news', () => {
  const ai = (g: GameState, source: 'deeptech' | 'rival', origin: string) => announceWave(g, { kind: 'ai', source, origin, name: 'Frontier AI', size: 0.6, market: 'world', home: 'us' })!
  it('a deep-tech wave posts one item and one notice, once', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'aiLab'); const w = ai(g, 'deeptech', `${a.id}#frontier`)
    expect(readMarketNews(g).find((n) => n.id === `wave-${w.id}`)).toMatchObject({ industry: 'aiLab', market: 'world', title: 'Frontier AI Wave' })
    expect(readMarketNews(g)[0].text).toBe('Your lab landed frontier AI. Investors expect a lot. Delivery decides the rest.')
    expect(g.queue.filter((m) => m.id === `wave-${w.id}`)).toHaveLength(1); g.queue = []; ai(g, 'deeptech', `${a.id}#frontier`); expect(g.queue).toEqual([]); expect(readMarketNews(g)).toHaveLength(1)
  })
  it('a rival wave posts news only when it touches a player company, with no notice; heavy, workshop and race post none', () => {
    const g = adult(5, 2033, 'us'); company(g, 'dataCenter'); ai(g, 'rival', 'aiLab|world')
    expect(readMarketNews(g)).toHaveLength(1); expect(g.queue.some((m) => String(m.id).startsWith('wave-'))).toBe(false)
    expect(readMarketNews(g)[0].text).toBe('A rival landed a frontier AI leap. Investors are watching. Delivery decides the rest.')
    const h = adult(6, 2033, 'us'); company(h, 'restaurant'); ai(h, 'rival', 'aiLab|world'); expect(readMarketNews(h)).toEqual([])
    const none = makeTestGame(2); none.year = 2033; ai(none, 'rival', 'aiLab|world'); expect(readMarketNews(none)).toEqual([])
    const o = adult(7, 2033, 'us'); company(o, 'aiLab'); for (const source of ['heavy', 'workshop'] as const) announceWave(o, { kind: 'ai', source, origin: source === 'heavy' ? 'heavy.software|world#x' : 'idea-1', name: 'Frontier AI', size: 0.4, market: 'world' })
    expect([readMarketNews(o), o.queue]).toEqual([[], []])
  })
})

describe('the screens', () => {
  it('the Annual Report note gains one wave line after the events, and the UI clamp is 520', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); put(g, AI({ year: 2030, last: 2034 })); nextYear(g)   // last 2034 = the year nextYear reaches, so the yearly step leaves the wave's numbers alone
    expect(marketNoteOf(g, a)).toContain('Frontier AI wave. Demand +6%, value +6%.'); expect(readFileSync('src/ui/minigames/AnnualReport.tsx', 'utf8')).toContain("text(d.marketNote, '', 520)")
  })
  it('Market Overview shows at most 3 wave rows and rendering leaves the state and dice alone; a deep-tech report carries a wave line too', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); put(g, ...['ai', 'cloud', 'chips', 'quantum', 'automation'].map((kind, i) => AI({ id: `w${i}`, kind: kind as never, year: 2030, last: 2033 })))
    const before = JSON.stringify(g), rng = g.rng, rows = renderAll(g, a); renderAll(g, a)
    expect(rows.filter((r) => / wave\. Demand /.test(r)).length).toBeGreaterThan(0); expect(rows.filter((r) => / wave\. Demand /.test(r)).length).toBeLessThanOrEqual(3)
    expect([JSON.stringify(g), g.rng]).toEqual([before, rng]); expect(rows.join('\n')).not.toMatch(/NaN|undefined|Infinity|\[object/)
    const d = adultIn('us', 5e9, 3, 90, 2034); const lab = dtCompany(d, 'aiLab', { stage: 3, level: 80 }); put(d, AI({ year: 2030, last: 2034 })); expect(techMarketNote(d, bizOf(d, lab), techOf(bizOf(d, lab)))).toContain('Frontier AI wave.')
  })
})
