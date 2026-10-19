import { describe, expect, it } from 'vitest'
import { marketMove } from '../src/game/business/fund-model'
import { advanceTechWaves, announceWave, roleOf, type TechWave } from '../src/game/business/tech-waves'
import { anchor, fam, type OptionPos } from '../src/game/computer/money-common'
import { settleMove } from '../src/game/computer/money-options'
import { listedTargets, placeBet, settlePrice } from '../src/game/computer/money-stocks'
import { marketAnchor, marketFamily } from '../src/game/invest/clock'
import { exchangeInfo, slotPlan } from '../src/game/invest/engine'
import { marketInstinct } from '../src/game/invest/instinct'
import { shockFactor } from '../src/game/invest/shocks'
import { SECTOR_TRADE, sectorOfSec, waveIndexFactor, waveStockFactor } from '../src/game/invest/wave-stocks'
import { buySecurity, investmentHoldings, investmentListing, yearlyInvestments } from '../src/game/investments'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const J = (v: unknown): Json => v as Json
const SMART = (o: Partial<TechWave> = {}): TechWave => ({ id: 'workshop:smartphone:2030:x', kind: 'smartphone', name: 'Smartphones', source: 'workshop', year: 2030, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const world = (seed = 7): GameState => { const g = makeTestGame(seed, { age: 30, countryId: 'us', money: 5e9, residence: { status: 'renting', rent: 0 } }); g.lifeId = `waves-${seed}`; g.year = 2031; return g }
const waved = (g: GameState): GameState => { const h = structuredClone(g); h.flags.techWaves = J([SMART()]); return h }
const roleOfStock = (secId: string) => { const s = sectorOfSec(secId), t = s ? SECTOR_TRADE[s] : null; return t ? roleOf('smartphone', t) : null }
const coreStock = (g: GameState) => { const q = investmentListing(g).find((x) => x.type === 'stock' && roleOfStock(x.secId) === 'core'); expect(q, 'no core stock for the smartphone kind on this exchange').toBeDefined(); return q! }
const passYear = (g: GameState, step = false) => { g.year += 1; g.character.age += 1; g.yearActions = {}; g.flags.taxableIncome = 0; g.queue = []; if (step) advanceTechWaves(g); yearlyInvestments(g) }

describe('the seam', () => {
  it('with no wave every factor is exactly 1, and reads leave state and the random stream alone', () => {
    const g = world(), list = investmentListing(g), before = JSON.stringify(g), rng = g.rng
    for (const q of list) expect(waveStockFactor(g, q.secId, 2031), q.name).toBe(1)
    for (const y of [1990, 2008, 2026, 2031, 2045]) for (const c of ['us', 'gb', 'jp', 'de', 'cn']) expect(waveIndexFactor(g, exchangeInfo(c).key, y)).toBe(1)
    expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
  })
  it('a live wave moves the quote, the listed target, the index fund and the fund market move by the factor the reader returns', () => {
    const g0 = world(), g1 = waved(g0), q0 = coreStock(g0), q1 = investmentListing(g1).find((q) => q.secId === q0.secId)!, f = waveStockFactor(g1, q0.secId, 2031)
    expect(f).toBeGreaterThan(1.05); expect(q1.price / q0.price).toBeCloseTo(f, 9)
    const target = (g: GameState) => listedTargets(g).find((t) => t.secId === q0.secId)!.price; expect(target(g1) / target(g0)).toBeCloseTo(f, 9)
    const key = exchangeInfo('us').key, fund = (g: GameState) => investmentListing(g).find((q) => q.type === 'index')!.price, ix = waveIndexFactor(g1, key, 2031)
    expect(ix).toBeGreaterThan(1); expect(fund(g1) / fund(g0)).toBeCloseTo(ix, 9)
    expect((1 + marketMove(g1, 'us', 2031)) / (1 + marketMove(g0, 'us', 2031))).toBeCloseTo(ix / waveIndexFactor(g1, key, 2030), 9)
  })
  it('a holding gains the step the gut reads: the factor for next year is the same before and after the yearly step (S10)', () => {
    const base = world(), twin = structuredClone(base), g = structuredClone(base)
    announceWave(g, { kind: 'smartphone', source: 'workshop', origin: 'x', name: 'Smartphones', size: 0.5, market: 'world' })
    const id = coreStock(g).secId, gut = shockFactor(g, id, 2032) / shockFactor(g, id, 2031), price = (x: GameState) => Number(investmentHoldings(x)[0].details.price)
    for (const x of [twin, g]) expect(buySecurity(x, id, 50_000)).toBe(true)
    const p0 = [price(twin), price(g)]; passYear(twin); passYear(g, true)
    expect(shockFactor(g, id, 2032) / shockFactor(g, id, 2031)).toBeCloseTo(gut, 12); expect(price(g) / p0[1] / (price(twin) / p0[0])).toBeCloseTo(gut, 9)
    // An index call opened in 2031 settles on the same step (P11): the move it settles on carries the tilt of 2032 over 2031.
    const key = exchangeInfo('us').key, call: OptionPos = { id: 'o1', mode: 'real', side: 'buy', dir: 'call', strike: 'atm', k: 0, units: 1e6, premium: 1e4, year: 2031, exKey: key, index: 'x', countryId: 'us', parentId: '' }
    expect((1 + settleMove(g, call)) / (1 + settleMove(twin, call))).toBeCloseTo(waveIndexFactor(g, key, 2032) / waveIndexFactor(g, key, 2031), 9)
  })
  it('an option costs what it costs without the wave and settles on the level (S9)', () => {
    const g0 = world(), g1 = waved(g0), id = coreStock(g0).secId, bet = (g: GameState) => placeBet(g, { via: 'own', secId: id, kind: 'call', strike: 'atm', stake: 100_000 })!
    const b0 = bet(g0), b1 = bet(g1); expect([b1.units, b1.k, b1.premium]).toEqual([b0.units, b0.k, b0.premium]); expect(b1.openPrice / b0.openPrice).toBeCloseTo(waveStockFactor(g1, id, 2031), 9)
    expect(settlePrice(g1, b1) / settlePrice(g0, b0)).toBeCloseTo(waveStockFactor(g1, id, 2032), 9)   // the bet settles at the end of 2032, on the level of that year
  })
  it('the index tilt is the mean level of the stocks the Stocks screen lists, not of the exchange plan (P10), and the clock helpers match money-common', () => {
    const g = waved(world()), info = exchangeInfo('us'), key = info.key, n = Math.max(4, slotPlan(info).length)
    const mean = 1 + listedTargets(g).reduce((sum, t) => sum + waveStockFactor(g, t.secId, 2031) - 1, 0) / n
    expect(waveIndexFactor(g, key, 2031)).toBeCloseTo(Math.max(0.5, Math.min(1.5, mean)), 9); expect(mean).toBeGreaterThan(1.02)
    const heir = structuredClone(g); Object.assign(heir, { ancestors: [{ bornYear: 1950 }] as unknown as GameState['ancestors'] })
    for (const x of [g, heir]) expect([marketFamily(x), marketAnchor(x)]).toEqual([fam(x), anchor(x)])
  })
  it('coins, pennies, bonds, savings, gold and the property trust ignore a live wave, a bond pays the same at maturity (C-04), and a share-class line moves with its company', () => {
    const g0 = world(), g1 = waved(g0), a = investmentListing(g0), b = investmentListing(g1)
    for (const q of a.filter((x) => x.type !== 'stock' && x.type !== 'index')) expect(b.find((x) => x.secId === q.secId)!.price, q.name).toBe(q.price)
    const matured = (g: GameState) => { const q = investmentListing(g).find((x) => x.type === 'bond')!; expect(buySecurity(g, q.secId, 50_000)).toBe(true); investmentHoldings(g)[0].details.maturity = g.year + 1; passYear(g); return [Math.round(g.character.money), investmentHoldings(g).length] }
    const id = coreStock(g1).secId; expect(shockFactor(g1, `${id}~B`, 2031)).toBeCloseTo(shockFactor(g1, id, 2031), 12)
    expect(matured(g1)).toEqual(matured(g0))
  })
  it('the gut recomputes when a wave changes, and 64 waves stay cheap on the hot path', () => {
    const g = makeTestGame(7, { age: 30, countryId: 'us', money: 1e6, talents: ['Investing'] }); g.lifeId = 'gut-waves'; g.year = 2031
    const a = marketInstinct(g)!; expect(marketInstinct(g)).toBe(a); g.flags.techWaves = J([SMART()]); expect(marketInstinct(g)).not.toBe(a)
    g.flags.techWaves = J(Array.from({ length: 64 }, (_, i) => SMART({ id: `w${i}`, year: 2000 + (i % 30) }))); const ids = investmentListing(g).filter((q) => q.type === 'stock').map((q) => q.secId), t = Date.now()
    for (let i = 0; i < 5000; i++) shockFactor(g, ids[i % ids.length], 2031 + (i % 5)); expect(Date.now() - t).toBeLessThan(1000)
  })
})
