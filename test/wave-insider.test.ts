import { describe, expect, it, vi } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { advanceHeavy } from '../src/game/business/heavy-rd'
import { deepWaveFor, INSIDER_WARNING } from '../src/game/business/tech-wave-data'
import { announceWave, type TechWave } from '../src/game/business/tech-waves'
import { readTech } from '../src/game/business/deeptech-state'
import { bizOf } from '../src/game/business/state'
import { waveInsiderCases } from '../src/game/business/wave-insider'
import { moneyState } from '../src/game/computer/money-common'
import { listedTargets } from '../src/game/computer/money-stocks'
import { exchangeInfo } from '../src/game/invest/engine'
import { sectorOfSec } from '../src/game/invest/wave-stocks'
import { buySecurity } from '../src/game/investments'
import { runScript } from '../src/game/scripts'
import { politicianJob } from '../src/game/special/politics'
import type { Asset, GameState, Json, MenuAction } from '../src/game/types'
import { adultIn } from './deeptech-kit'
import { allNodes } from './market-kit'
import { exposedIn, founder, holdable, project, rows, warp } from './wave-kit'

const launch = (g: GameState, a: Asset, extra: Partial<Parameters<typeof announceWave>[1]> = {}): TechWave => announceWave(g, { kind: 'smartphone', source: 'deeptech', origin: `${a.id}#frontier`, name: 'Smartphones', size: 0.5, market: 'world', by: a.id, ...extra })!

describe('load order', () => {
  it('loads in any order: tech-waves, wave-insider and politics each first, in a fresh module registry', async () => {
    for (const load of [() => import('../src/game/business/tech-waves'), () => import('../src/game/business/wave-insider'), () => import('../src/game/special/politics')]) { vi.resetModules(); expect(Object.keys(await load()).length).toBeGreaterThan(0) }
  }, 120_000)
})

describe('who is an insider (S13)', () => {
  it('opens a wave case for a founder who bought a core or supply stock this year, with the spec values, and makes no politician', () => {
    const { g, a } = founder(), [t] = holdable(g, [2033]); expect(t).toBeDefined(); expect(buySecurity(g, t.secId, 200_000)).toBe(true)
    const karma = g.character.hidden.karma; launch(g, a)
    expect(rows(g)).toHaveLength(1); expect(rows(g)[0]).toMatchObject({ cause: 'wave', role: 'founder', note: 'Smartphones', via: 'shares', secId: t.secId, status: 'open', evidence: 0.55, office: 'mayor', title: 'Founder of Test software' })
    expect(rows(g)[0].gain).toBeGreaterThan(1000); expect([g.character.hidden.karma, g.counters.insiderTrades]).toEqual([karma - 6, 1]); expect(politicianJob(g)).toBeNull()
  })
  it('a plain owner of an acquired company is no insider, an acquirer who runs it is a CEO, a founder with a hired CEO is a founder', () => {
    const run = (patch: (g: GameState, a: Asset) => void) => { const { g, a } = founder(), [t] = holdable(g, [2033]); buySecurity(g, t.secId, 200_000); patch(g, a); launch(g, a); return rows(g) }
    const acquired = (g: GameState, a: Asset) => { const b = bizOf(g, a); b.acquired = true; b.founderName = 'A previous owner' }
    expect(run((g, a) => { acquired(g, a); a.details.ceo = 'manager'; g.character.job = null })).toEqual([])
    expect(run(acquired)[0]).toMatchObject({ role: 'ceo', title: 'CEO of Test software' }); expect(run((_g, a) => { a.details.ceo = 'manager' })[0]).toMatchObject({ role: 'founder' })
  })
  it('counts shares bought in the launch year or the year before, not two years before, and skips a tiny gain and a wave dated after the year', () => {
    for (const [boughtIn, n] of [[2031, 0], [2032, 1], [2033, 1]] as const) {
      const { g, a } = founder(), [t] = holdable(g, [2031, 2032, 2033]); warp(g, boughtIn); expect(buySecurity(g, t.secId, 200_000)).toBe(true); warp(g, 2033); launch(g, a); expect(rows(g), String(boughtIn)).toHaveLength(n)
    }
    const tiny = founder(), [t] = holdable(tiny.g, [2033]); buySecurity(tiny.g, t.secId, 2_000); launch(tiny.g, tiny.a); expect(rows(tiny.g)).toEqual([])
    const late = founder(), [u] = holdable(late.g, [2033]); buySecurity(late.g, u.secId, 200_000); launch(late.g, late.a, { year: 2034 }); expect(rows(late.g)).toEqual([])
  })
  it('keeps the three largest stakes, counts an index call but not an index put, and targets only engine securities', () => {
    const { g, a } = founder(), ts = holdable(g, [2033]).slice(0, 5); expect(ts.length).toBeGreaterThanOrEqual(4)
    ts.forEach((t, i) => buySecurity(g, t.secId, 40_000 + 20_000 * i)); launch(g, a); expect(rows(g).map((c) => c.secId).sort()).toEqual(ts.slice(-3).map((t) => t.secId).sort())
    expect(listedTargets(g).every((t) => sectorOfSec(t.secId) !== null)).toBe(true)
    const withPos = (dir: 'call' | 'put') => { const x = founder(), inf = exchangeInfo('us'); moneyState(x.g).positions.push({ id: `opt-${dir}`, mode: 'real', side: 'buy', dir, strike: 'otm', k: 0.05, units: 4_000_000, premium: 100_000, year: x.g.year, exKey: inf.key, index: inf.ex.index, countryId: 'us', parentId: '', fx: 1 }); launch(x.g, x.a); return rows(x.g) }
    expect(withPos('put')).toEqual([]); expect(withPos('call').length).toBeGreaterThan(0); expect(withPos('call').every((c) => c.via === 'own')).toBe(true)
  })
  it('a repeat opens nothing new', () => {
    const { g, a } = founder(), [t] = holdable(g, [2033]); buySecurity(g, t.secId, 200_000); const w = launch(g, a)
    expect([launch(g, a) === w, waveInsiderCases(g, w, a.id), rows(g).length]).toEqual([true, 0, 1])
  })
})

describe('the writers and the existing case code', () => {
  it('a heavy pioneer launch passes the player asset (fiscal year = g.year - 1 as the yearly flow does), a launch dated after the year opens none', () => {
    let won = 0
    for (let seed = 1; seed <= 40 && won < 2; seed++) {
      const { g, a } = founder(seed, 2028), [t] = holdable(g, [2028], 'ai'); expect(t, 'no ai-supply stock listed').toBeDefined(); buySecurity(g, t.secId, 200_000)
      const twin = structuredClone(g)
      if (!advanceHeavy(g, a, bizOf(g, a), project(g, 'Autonomous Agent Platform', 0.98), g.year - 1).won) continue
      won++; expect(rows(g)).toHaveLength(1); expect(rows(g)[0]).toMatchObject({ cause: 'wave', role: 'founder', note: 'Autonomous Agent Platform' })
      advanceHeavy(twin, twin.assets[0], bizOf(twin, twin.assets[0]), project(twin, 'Autonomous Agent Platform', 0.98), twin.year); expect(rows(twin)).toEqual([])
    }
    expect(won).toBeGreaterThan(0)
  })
  it('the press story, the choices and the end of the case run through the existing code', () => {
    let seen = 0
    for (let seed = 1; seed <= 40 && seen < 2; seed++) {
      const { g, a } = founder(seed), [t] = holdable(g, [2033, 2034, 2035, 2036, 2037, 2038]); expect(buySecurity(g, t.secId, 1_000_000)).toBe(true); launch(g, a)
      const m = exposedIn(g, 2034, 2038); if (!m || m.kind !== 'choice') continue
      seen++; expect(m.text).toContain(`bought ${t.name} (${t.symbol}) shares shortly before you launched Smartphones`); expect(m.choices.map((c) => c.id)).toEqual(['deny', 'blame', 'lawyer'])
      expect(g.log.flatMap((l) => l.entries).some((e) => e.text === `The press found out I bought ${t.name} shares before I launched Smartphones.`)).toBe(true)
      g.queue = []; runScript(g, 'special.pol.abuse.exposed', 'lawyer', m.data, m); expect(rows(g)[0].status).toBe('closed'); expect(rows(g)[0].held).toBeUndefined()
    }
    expect(seen).toBeGreaterThan(0)
  }, 90_000)
  it('shows the warning in the Heavy R&D confirm only for a wave that still lands inside the window, and in the deep-tech confirm only for a listed program', () => {
    const heavy = (x: { g: GameState; a: Asset }) => allNodes(x.g, businessAssetView(x.g, x.a)).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('biz.heavy.')).map((n) => ({ id: n.id, text: n.confirm?.(x.g) ?? '' }))
    const early = heavy(founder(5, 2028)), late = heavy(founder(5, 2033))
    expect(early.find((r) => r.id.includes('Autonomous Agent Platform'))?.text).toContain(INSIDER_WARNING); expect(early.some((r) => !r.text.includes(INSIDER_WARNING))).toBe(true); expect(late.some((r) => r.text.includes(INSIDER_WARNING))).toBe(false)
    const g = adultIn('us', 5e9, 3, 90, 2034), c = g.character, b = newBiz(g, 'aiLab', c.countryId, c.city, { cash: 0, ceo: 'owner', manager: null }), t = readTech(undefined)
    Object.assign(t, { level: 80, stage: 3 }); b.tech = JSON.parse(JSON.stringify(t)) as Json; const a = createBusinessAsset(g, 'Test aiLab', b, 0); g.assets.push(a)
    const dt = allNodes(g, businessAssetView(g, a)).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('dt.rd.'))
    expect(dt.length).toBeGreaterThan(0); for (const n of dt) expect((n.confirm?.(g) ?? '').includes(INSIDER_WARNING), n.id).toBe(deepWaveFor('aiLab', n.id.slice(6).split('.')[0]) !== null)
    expect(dt.some((n) => deepWaveFor('aiLab', n.id.slice(6).split('.')[0]) !== null)).toBe(true)   // stage 3 and level 80 list twelve programs, `agents` and `frontier` among them (probed)
  })
})
