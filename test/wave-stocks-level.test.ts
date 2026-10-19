import { describe, expect, it } from 'vitest'
import { addHeavy } from '../src/game/business/heavy-rd'
import { advanceTechWaves, announceWave, nextState, nextStepTag, projectWave, readTechBase, readTechWaves, stateAt, stepWave, STOCK_BETA, stockLevelFor, waveDraw, waveFactorsFor, waveSignature, type TechWave } from '../src/game/business/tech-waves'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { arriveInPast } from '../src/game/timeMachine'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const W = (o: Partial<TechWave> = {}): TechWave => ({ id: 'race:ai:2031:x', kind: 'ai', name: 'Frontier AI', source: 'race', year: 2031, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const J = (v: unknown): Json => v as Json
const near = (n: number) => expect.closeTo(n, 6)
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }
/** An id whose seeded draw for `year` is (or is not) a stall year. */
const pick = (g: GameState, stall: boolean, year: number) => { for (let i = 0; ; i++) if (waveDraw(g, `p${i}`, year).stall === stall) return `p${i}` }
const at = (w: TechWave, trade: string, market = 'world', year = 2035) => { const g = makeTestGame(1); put(g, w); return stockLevelFor(g, trade, market, year) }

describe('the level (S2, S3, P1)', () => {
  it('follows spec table 5.3 at size 0.5: core, supply and disrupted at announcement, half delivered, mature, and a bubble that lags then cools', () => {
    expect(STOCK_BETA).toBe(1.5)   // ai: core aiLab, supply semiconductor, disrupted software
    const rows: [number, number, number[]][] = [[0.65, 0, [1.102375, 1.049725, 0.985375]], [0.8, 0.5, [1.1785, 1.0867, 0.8995]], [1, 1, [1.2625, 1.1275, 0.8125]], [0.9, 0.3, [1.17325, 1.08415, 0.93025]], [0.35, 0.3, [1.086625, 1.042075, 0.942625]]]
    for (const [h, d, [core, supply, disrupted]] of rows) { const w = W({ hype: h, delivery: d, last: 2040 }); expect([at(w, 'aiLab'), at(w, 'semiconductor'), at(w, 'software')]).toEqual([near(core), near(supply), near(disrupted)]) }
  })
  it('a heavy wave never disrupts its pioneer trade at any exchange (P9), and still disrupts another trade', () => {
    const w = W({ source: 'heavy', skip: 'software', origin: 'heavy.software|world#Autonomous Agent Platform', hype: 1, delivery: 1, last: 2040 })
    expect([at(w, 'software', 'world'), at(w, 'software', 'us'), at(w, 'marketing', 'us')]).toEqual([1, 1, near(0.8125)])
  })
  it('one wave moves a level by at most 15% in one yearly step, over a sweep of states, sizes, stalls and gains', () => {
    const g = makeTestGame(1); let worst = 0
    for (const size of [0.2, 0.4, 0.6]) for (let h = 0; h <= 1.001; h += 0.1) for (let d = 0; d <= 1.001; d += 0.1) for (const stall of [false, true]) for (const gain of [0, 0.25, 0.3]) {
      const w = W({ size, hype: Math.min(1, h), delivery: Math.min(1, d), last: 2040 }), s = nextState(w, Math.min(1, d + gain), stall, 2041)
      for (const trade of ['aiLab', 'semiconductor', 'software']) {
        const level = (x: TechWave) => { put(g, x); return stockLevelFor(g, trade, 'world', 2035) }
        worst = Math.max(worst, Math.abs(level({ ...w, hype: s.hype, delivery: s.delivery }) / level(w) - 1))
      }
    }
    expect(worst).toBeLessThanOrEqual(0.15)
  })
  it('several waves multiply per wave (P1) inside 0.3 to 3, and 30 waves of size 1 stay inside it for every trade', () => {
    const g = makeTestGame(1), a = W({ id: 'a', last: 2040 }), b = W({ id: 'b', kind: 'chips', last: 2040 }), lvl = () => stockLevelFor(g, 'aiLab', 'world', 2035)
    put(g, a); const la = lvl(); put(g, b); const lb = lvl(); put(g, a, b); expect(lvl()).toBeCloseTo(la * lb, 9)
    put(g, ...Array.from({ length: 30 }, (_, i) => W({ id: `s${i}`, size: 1, hype: 1, delivery: 1, last: 2040 })))
    for (const t of INDUSTRY_IDS) { const L = stockLevelFor(g, t, 'world', 2035); expect(L).toBeGreaterThanOrEqual(0.3); expect(L).toBeLessThanOrEqual(3) }
  })
  it('is exactly 1 with no wave for every trade, market and year, counts history rows only from 2026, and leaves state and the stream alone', () => {
    const g = makeTestGame(1), before = JSON.stringify(g), rng = g.rng
    for (const t of INDUSTRY_IDS) for (const m of ['world', 'us', 'jp']) for (let y = 1946; y <= 2045; y += 7) expect(stockLevelFor(g, t, m, y), `${t} ${m} ${y}`).toBe(1)
    expect(waveFactorsFor(g, 'software', 'world', 2011).value).toBeGreaterThan(1.1)   // the smartphone row is live in 2011 for companies; the stock tables already carry it, so the stock level (1) must not
    expect([JSON.stringify(g), g.rng, waveSignature(g)]).toEqual([before, rng, ''])
  })
})

describe('stateAt and the stored step', () => {
  const w = W({ last: 2033, hype: 0.8, delivery: 0.5, trail: [[2031, 0.65, 0], [2032, 0.72, 0.25], [2033, 0.8, 0.5]], nx: [0.85, 0.6, ''] })
  it('reads the trail up to last (the first point before it), nx after last while the tag matches, else the current state', () => {
    expect([2030, 2031, 2032, 2033].map((y) => stateAt(w, y, ''))).toEqual([{ hype: 0.65, delivery: 0 }, { hype: 0.65, delivery: 0 }, { hype: 0.72, delivery: 0.25 }, { hype: 0.8, delivery: 0.5 }])
    expect([stateAt(w, 2034, ''), stateAt(w, 2040, '')]).toEqual([{ hype: 0.85, delivery: 0.6 }, { hype: 0.85, delivery: 0.6 }])
    expect(stateAt(w, 2034, '~ab')).toEqual({ hype: 0.8, delivery: 0.5 })
    const old = { ...w, trail: undefined, nx: undefined }; expect([stateAt(old, 2032, ''), stateAt(old, 2034, '')]).toEqual([{ hype: 0.8, delivery: 0.5 }, { hype: 0.8, delivery: 0.5 }])
  })
  it('reads a damaged trail, nx or stock as absent or clamped, never throws, never writes', () => {
    const read = (o: Record<string, unknown>) => { const g = makeTestGame(1); g.flags.techWaves = J([{ ...W(), ...o }]); const before = JSON.stringify(g), [x] = readTechWaves(g); expect(JSON.stringify(g)).toBe(before); return x }
    expect([read({ trail: 'x' }).trail, read({ trail: [[1, 2]] }).trail, read({ nx: [0.5, 0.5] }).nx, read({ nx: [NaN, 0.5, ''] }).nx, read({ nx: [0.5, 0.5, 'x'.repeat(200)] }).nx]).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(read({ trail: [[2031, NaN, 0.2], [2030, 0.5, 0.5], [2031, 9, -3], 'z', [1, 2]] }).trail).toEqual([[2030, 0.5, 0.5], [2031, 1, 0]])
    const flood = read({ trail: Array.from({ length: 1000 }, (_, i) => [2000 + (i % 40), 0.5, 0.5]) }).trail!
    expect(flood.length).toBeLessThanOrEqual(6); expect(flood.every((p, i) => i === 0 || p[0] > flood[i - 1][0])).toBe(true)
    const base = (v: unknown) => { const g = makeTestGame(1); g.flags.techBase = J(v); return readTechBase(g) }
    const b = base({ 'aiLab|world': { demand: 1.1, costs: 0.9, stock: 99 }, 'bakery|us': { demand: 1, costs: 1, stock: 'x' }, 'software|us': { demand: 1, costs: 1, stock: 0 }, 'telecom|us': { demand: 1, costs: 1, stock: 1 } })
    expect([b['aiLab|world'].stock, b['bakery|us'].stock, b['software|us'].stock, b['telecom|us'].stock]).toEqual([1.6, undefined, 0.7, undefined])
  })
  it('ignores a stored step that belongs to another timeline and keeps a finished year (Time Machine)', () => {
    const g = makeTestGame(7); g.year = 2031; announceWave(g, { kind: 'ai', source: 'race', origin: 'x', name: 'Frontier AI', size: 0.5, market: 'world' })
    const lvl = (x: GameState, y: number) => stockLevelFor(x, 'aiLab', 'world', y)
    expect(lvl(g, 2032)).not.toBeCloseTo(lvl(g, 2031), 3)                          // the stored step moves the level
    const now = structuredClone(g); now.year = 2034; const back = arriveInPast(now, structuredClone(g))
    expect(nextStepTag(back, readTechWaves(back)[0])).not.toBe(''); expect(lvl(back, 2031)).toBeCloseTo(lvl(g, 2031), 9); expect(lvl(back, 2032)).toBeCloseTo(lvl(back, 2031), 9)
  })
})

describe('writing the trail and the projection', () => {
  it('announceWave writes the first point and the projection; each step appends one point (at most 6); a second step in the year writes nothing', () => {
    const g = makeTestGame(7); g.year = 2031
    const w = announceWave(g, { kind: 'ai', source: 'race', origin: 'x', name: 'Frontier AI', size: 0.5, market: 'world' })!
    expect(w.trail).toEqual([[2031, near(0.65), 0]]); expect(w.nx![2]).toBe('')
    for (let y = 2032; y < 2042; y++) {
      g.year = y; advanceTechWaves(g); const once = g.flags.techWaves; advanceTechWaves(g); expect(g.flags.techWaves).toBe(once)
      const cur = readTechWaves(g)[0]; if (!cur) break
      expect(cur.trail!.length).toBeLessThanOrEqual(6); expect(cur.trail![cur.trail!.length - 1]).toEqual([y, near(cur.hype), near(cur.delivery)])
    }
  })
  it('stepWave is the delivery and nextState path advanceTechWaves ran inline, and projectWave is stepWave at last + 1 with the fork tag', () => {
    const g = makeTestGame(7); g.year = 2032; const w = W({ id: pick(g, false, 2032) }), d = waveDraw(g, w.id, 2032), s = stepWave(g, w, 2032)
    expect(s).toMatchObject({ stall: false, delivery: near(Math.min(1, w.delivery + 0.08 + 0.22 * d.u)), fate: 'live' })
    const p = projectWave(g, w); expect([p[0], p[1], p[2]]).toEqual([near(s.hype), near(s.delivery), ''])
  })
  it('a settling wave keeps its level in the settle year and after (stock in techBase, P1), and a dropping wave projects neutral (P2)', () => {
    const g = makeTestGame(7); g.year = 2032; const w = W({ id: pick(g, false, 2032), hype: 1, delivery: 1, mature: 4 }); put(g, { ...w, nx: projectWave(g, w) })
    const lv = (x: GameState, y: number) => [stockLevelFor(x, 'aiLab', 'world', y), stockLevelFor(x, 'software', 'world', y)], before = lv(g, 2032)
    advanceTechWaves(g); expect(readTechWaves(g)).toEqual([]); expect(readTechBase(g)['aiLab|world'].stock).toBeCloseTo(1.2625, 6)
    for (const y of [2032, 2033, 2050]) expect(lv(g, y)).toEqual(before.map(near))          // no scheduled fade (S7)
    const d = makeTestGame(7); d.year = 2032; const dying = W({ id: pick(d, true, 2032), year: 2026, hype: 0.05, delivery: 0.02 }); put(d, { ...dying, nx: projectWave(d, dying) })
    expect(projectWave(d, dying)).toEqual([0, 0, '']); expect(stockLevelFor(d, 'aiLab', 'world', 2032)).toBe(1); advanceTechWaves(d); expect(readTechWaves(d)).toEqual([]); expect(stockLevelFor(d, 'aiLab', 'world', 2032)).toBe(1)
  })
  it('reads the same level before and after the yearly step for heavy, rival, race and workshop waves, year after year (S3)', () => {
    const cases = [{ source: 'heavy', origin: 'heavy.software|world#Autonomous Agent Platform' }, { source: 'rival', origin: 'aiLab|world' }, { source: 'race', origin: 'fut-fusion-cell' }, { source: 'workshop', origin: 'hist-touch-slate' }] as const
    for (const c of cases) for (const seed of [1, 2, 3]) {
      const g = makeTestGame(seed); g.lifeId = `order-${seed}`; g.year = 2031   // the seeded draws follow the family id, not g.rng, so each seed needs its own
      if (c.source === 'heavy') addHeavy(g, 'software', 'world', { family: 'Autonomous Agent Platform', year: 2031, years: 4, quality: 80, cost: 1e6, by: 'biz1' })
      announceWave(g, { kind: 'ai', source: c.source, origin: c.origin, name: 'Frontier AI', size: 0.5, market: 'world' })
      const read = (y: number) => [stockLevelFor(g, 'aiLab', 'world', y), stockLevelFor(g, 'software', 'us', y), stockLevelFor(g, 'semiconductor', 'jp', y)]
      for (let y = 2032; y < 2042; y++) {
        g.year = y; const ahead = read(y), behind = read(y - 1); advanceTechWaves(g)
        expect(read(y), `${c.source} ${seed} ${y}`).toEqual(ahead.map(near)); if (readTechWaves(g).length) expect(read(y - 1)).toEqual(behind.map(near))
      }
    }
  })
  it('waveSignature is empty with no wave and changes when a wave is added or steps', () => {
    const g = makeTestGame(1); put(g, W()); const s = waveSignature(g); put(g, W({ last: 2032 })); expect([s === '', waveSignature(g) === s]).toEqual([false, false])
  })
})
