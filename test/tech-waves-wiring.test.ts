// Tech waves wiring (plan Task 3): the yearly step at the end of the business year, rival landings from
// a new yearly hook, the national-economy feed, and the heir carry. Everything here goes through the
// real entry points (ageUp, yearlyBusinessImpl, continueAsChild, arriveInPast).
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { familyId } from '../src/game/business/competition-roster'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { advanceTechWaves, landRivalWaves, readTechWaves, rivalWave, waveDraw, type TechWave } from '../src/game/business/tech-waves'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { killCharacter } from '../src/game/death'
import { economyState } from '../src/game/economy'
import { readMarketNews } from '../src/game/history/market-events'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
import { arriveInPast, outcomeTag } from '../src/game/timeMachine'
import type { Asset, GameState, Json } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'
import { adult, company, nextYear } from './market-kit'
import { agingNames, withAging } from './kernel-kit'

const W = (o: Partial<TechWave> = {}): TechWave => ({ id: 'deeptech:ai:2031:x', kind: 'ai', name: 'Frontier AI', source: 'deeptech', year: 2031, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const J = (v: unknown): Json => v as Json
const calm = (g: GameState, year: number) => { for (let i = 0; ; i++) if (!waveDraw(g, `c${i}`, year).stall) return `c${i}` }

/** The real v2.4.0 save (test/fixtures/save-v1.json.gz) migrated to the current schema, as test/save-schema.test.ts loads it. */
function loadFixtureV1(): GameState {
  const fixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
  const result = migrateSave(structuredClone(fixture))
  if (result.kind !== 'ready') throw new Error(`expected a ready save, got ${JSON.stringify(result)}`)
  return result.game
}

/** A parent who owns a restaurant and a grown-up child (copied from test/heavy-handoff.test.ts, without the Heavy R&D record). */
function parent(): { g: GameState; a: Asset; heirId: string } {
  const g = adult(11, 2030, 'us')
  const a = company(g, 'restaurant', { name: 'Handoff Diner' })
  nextYear(g)
  g.character.age = 70
  const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
  return { g, a, heirId: heir.id }
}

function handOff(g: GameState, heirId: string): GameState {
  killCharacter(g, 'Old Age')
  g.queue = []
  const n = continueAsChild(g, heirId)
  expect(n).not.toBe(g)
  expect(n.generation).toBe(2)
  return n
}

describe('the yearly hook and the business year', () => {
  it('sits right after business and leaves the hedge pin alone', () => {
    const names = agingNames()
    expect(names.indexOf('techWaves')).toBe(names.indexOf('business') + 1); expect(names.indexOf('hedge')).toBe(names.indexOf('investments') + 1)
  })
  it('a life with no company is byte-identical to a twin without the hook, and stores nothing', () => {
    const g = makeTestGame(7, { age: 40, money: 300_000 }); g.log = [{ age: 40, year: 2026, entries: [] }]; const twin = structuredClone(g)
    ageUp(g)
    withAging((es) => es.filter((e) => e.id !== 'yearly.techWaves'), () => ageUp(twin))
    expect(JSON.stringify(g)).toBe(JSON.stringify(twin)); expect(['techWaves', 'techBase'].filter((k) => k in g.flags)).toEqual([])
    const r = adult(5, 2030, 'us'); company(r, 'restaurant'); nextYear(r); nextYear(r)
    expect(['techWaves', 'techBase'].filter((k) => k in r.flags)).toEqual([]); expect(readMarketNews(r)).toEqual([])
  })
  it('steps stored waves even with no company (the early return), and once at the end of a pass with companies', () => {
    const g = makeTestGame(7); g.year = 2032; g.flags.techWaves = J([W({ source: 'race', last: 2031 })]); yearlyBusinessImpl(g); expect(readTechWaves(g)[0].last).toBe(2032)
    const h = adult(5, 2033, 'us'); company(h, 'dataCenter'); h.flags.techWaves = J([W({ source: 'race', year: 2030, last: 2033 })]); nextYear(h)
    const after = h.flags.techWaves; advanceTechWaves(h); expect(h.flags.techWaves).toBe(after); expect(readTechWaves(h)[0].last).toBe(h.year)
  })
})

describe('rival landings and the macro feed', () => {
  const lab = (year: number) => { const g = makeTestGame(9, { age: 40, money: 1e9, countryId: 'us' }); g.year = year
    g.assets.push(createBusinessAsset(g, 'Lab', newBiz(g, 'aiLab', 'us', getCountry('us').cities[0], { cash: 1e8, founded: 2020 }), 1e8)); return g }   // the caller pushes the asset
  const fam = (g: GameState, y: number) => `${familyId(g.lifeId)}${outcomeTag(g, y)}`
  const landing = (g: GameState) => { let y = g.year; while (!rivalWave(fam(g, y), 'aiLab', y)) g.year = ++y; return y }
  it('lands the seeded draw once in a year after 2026 and repeats as a no-op', () => {
    const g = lab(2027), y = landing(g), r = rivalWave(fam(g, y), 'aiLab', y)!; landRivalWaves(g); landRivalWaves(g)
    const [w] = readTechWaves(g); expect(readTechWaves(g)).toHaveLength(1)
    expect(w).toMatchObject({ source: 'rival', kind: r.kind, origin: 'aiLab|world', market: 'world', home: 'us', year: y }); expect(w.size).toBeCloseTo(r.size, 6)
  })
  it('lands nothing in a miss year, in 2026 or earlier, without a company, or within 3 years of a wave that cores the trade', () => {
    const g = lab(2027); let y = 2027; while (rivalWave(fam(g, y), 'aiLab', y)) g.year = ++y; landRivalWaves(g); expect(readTechWaves(g)).toEqual([])
    const old = lab(2020); for (let h = 1990; h <= 2026; h++) { old.year = h; landRivalWaves(old) } expect(readTechWaves(old)).toEqual([])
    const none = makeTestGame(9); for (let h = 2027; h < 2060; h++) { none.year = h; landRivalWaves(none) } expect('techWaves' in none.flags).toBe(false)
    const near = lab(2027), z = landing(near); near.flags.techWaves = J([W({ source: 'rival', year: z - 1, last: z - 1 })]); landRivalWaves(near); expect(readTechWaves(near)).toHaveLength(1)
  })
  it('the same seed gives the same waves', () => {
    const run = () => { const g = lab(2027); for (let y = 2027; y < 2090; y++) { g.year = y; landRivalWaves(g); advanceTechWaves(g) } return JSON.stringify(g.flags) }
    const first = run(); expect(first).toBe(run()); expect(first).toContain('"source":"rival"')
  })
  const feed = (w: Partial<TechWave>) => { const g = makeTestGame(7); g.year = 2032; g.flags.techWaves = J([W({ id: calm(g, 2032), last: 2031, delivery: 0.2, hype: 0.5, ...w })]); advanceTechWaves(g); return g }
  const tokens = (g: GameState) => (economyState(g)?.receipts ?? []).filter((r) => r.includes('wave:'))
  it('records one capped innovation entry a year for a deeptech wave with a home, and none for workshop, race or a world wave with no home', () => {
    const g = feed({ source: 'deeptech', home: 'us', size: 1 }); expect(tokens(g)).toHaveLength(1); advanceTechWaves(g); expect(tokens(g)).toHaveLength(1)
    for (const w of [{ source: 'workshop' as const, home: 'us' }, { source: 'race' as const, home: 'us' }, { source: 'deeptech' as const, home: undefined }]) expect(tokens(feed(w))).toEqual([])
  })
})

describe('heirs', () => {
  it('carry validated waves and techBase, repair damage, and do not duplicate the news', () => {
    const { g, heirId } = parent(); const news = readMarketNews(g)
    g.flags.techWaves = J([null, 7, 'x', [], {}, W()]); g.flags.techBase = J({ 'aiLab|world': { demand: 9, costs: 1 }, junk: 1 })
    const n = handOff(g, heirId)
    expect(readTechWaves(n)).toEqual(readTechWaves(g)); expect(n.flags.techWaves).toHaveLength(1); expect(n.flags.techBase).toEqual({ 'aiLab|world': { demand: 1.5, costs: 1 } })
    expect(readMarketNews(n)).toEqual(news); expect(JSON.parse(JSON.stringify(n.flags))).toEqual(n.flags)
  })
  it('cap a flood of 5000 entries at 64 and add no keys for a world with none', () => {
    const big = parent(); big.g.flags.techWaves = J(Array.from({ length: 5000 }, (_, i) => ({ ...W(), id: `w${i}` })))
    expect((handOff(big.g, big.heirId).flags.techWaves as Json[]).length).toBeLessThanOrEqual(64)
    const old = parent(), m = handOff(old.g, old.heirId); expect(['techWaves', 'techBase'].filter((k) => k in m.flags)).toEqual([])
  })
})

describe('time machine and saves', () => {
  it('a finished year keeps its draw, the unfinished year rerolls, and the restored flags win', () => {
    const g = makeTestGame(7); g.year = 2031; g.flags.techWaves = J([W()]); const snap = structuredClone(g)
    const now = structuredClone(g); now.year = 2034; now.flags.techWaves = J([W({ hype: 0.1 })]); const back = arriveInPast(now, snap)
    expect(waveDraw(back, 'w', 2030)).toEqual(waveDraw(g, 'w', 2030)); expect(waveDraw(back, 'w', 2031).u).not.toBe(waveDraw(g, 'w', 2031).u); expect(readTechWaves(back)[0].hype).toBe(0.8)
  })
  it('SAVE_SCHEMA stays 2 and an old save plays years with no wave state', () => {
    expect(SAVE_SCHEMA).toBe(2)
    const game = loadFixtureV1(); for (let i = 0; i < 3; i++) { game.queue = []; ageUp(game) }
    expect(['techWaves', 'techBase'].filter((k) => k in game.flags)).toEqual([])
  })
})
