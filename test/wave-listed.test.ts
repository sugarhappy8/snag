import { describe, expect, it } from 'vitest'
import { marketKey } from '../src/game/business/competition-core'
import { industryCycle } from '../src/game/business/deeptech-core'
import { updateSharePrice, valuationOf } from '../src/game/business/economy'
import { ownListings } from '../src/game/business/own-listing'
import type { BizState } from '../src/game/business/state'
import { stampWave, stockLevelFor, waveFactorsFor, waveLines, type TechWave } from '../src/game/business/tech-waves'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'
import { founder, listed } from './own-listing-kit'

const J = (v: unknown): Json => v as Json
const SMART = (o: Partial<TechWave> = {}): TechWave => ({ id: 'workshop:smartphone:2030:x', kind: 'smartphone', name: 'Frontier AI', source: 'workshop', year: 2030, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2034, ...o })   // core software, hype .8, delivery .6: v 1.126, stock level 1.189
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }

describe('the quoted company (S12, P5)', () => {
  it('a quoted company gets a stock-grade stamp read at the market year, a neutral level deletes it, an unquoted one keeps the old grade', () => {
    const g = founder(41, 'us', 5e10, 2034), { b } = listed(g); put(g, SMART())
    stampWave(g, b, 2033); expect(b.wave).toEqual({ v: expect.closeTo(stockLevelFor(g, 'software', marketKey(b), 2034), 3), y: 2033, q: true }); expect(b.wave!.v).toBeGreaterThan(1.1)
    delete g.flags.techWaves; stampWave(g, b, 2033); expect(b.wave).toBeUndefined()
    const p = { ...b, public: false }; put(g, SMART()); stampWave(g, p, 2033); expect(p.wave).toEqual({ v: expect.closeTo(waveFactorsFor(g, 'software', marketKey(p), 2033).value, 3), y: 2033 })
  })
  it('valuationOf takes a q stamp only for a quoted company and only for the last booked year; every other stamp is ignored for it (C-12)', () => {
    const g = founder(41, 'us', 5e10, 2034), { b } = listed(g, { marketCap: 5e9, profit: 400e6 }), base = valuationOf(b), val = (patch: Partial<BizState>) => valuationOf({ ...b, ...patch })
    expect(val({ wave: { v: 1.3, y: 2033, q: true } }) / base).toBeCloseTo(1.3, 1)
    expect([val({ wave: { v: 1.3, y: 2033 } }), val({ wave: { v: 1.3, y: 2032, q: true } }), val({ wave: { v: NaN, y: 2033, q: true } })]).toEqual([base, base, base])
    expect(val({ public: false, wave: { v: 1.3, y: 2033, q: true } })).toBe(val({ public: false }))
  })
  it('the price closes half the gap each booked year: the ratio to the no-wave price rises, strictly between 1 and the stamp', () => {
    const run = (v: number | null, years: number) => { const g = founder(41, 'us', 5e10, 2034), { b } = listed(g, { share: 0.6, marketCap: 5e9, profit: 400e6 }); b.sharePrice = valuationOf(b) / b.sharesOut; if (v !== null) b.wave = { v, y: 2033, q: true }; for (let i = 0; i < years; i++) updateSharePrice(g, b, g.year); return b.sharePrice }
    const r = [1, 2, 3].map((n) => run(1.3, n) / run(null, n)); expect(r[0]).toBeGreaterThan(1.1); expect(r[0]).toBeLessThan(r[1]); expect(r[1]).toBeLessThan(r[2]); expect(r[2]).toBeLessThan(1.3)
  })
  it('industryCycle takes false, true or "stock": no wave, the private grade, the stock grade', () => {
    const g = makeTestGame(1); g.year = 2034; put(g, SMART({ kind: 'ai', source: 'deeptech' })); const c = (w: boolean | 'stock') => industryCycle(g, 'aiLab', 2034, w)
    expect([c(false).wave, c(true).wave, c('stock').wave]).toEqual([1, expect.closeTo(1.126, 6), expect.closeTo(stockLevelFor(g, 'aiLab', 'world', 2034), 9)]); expect(c('stock').wave).toBeGreaterThan(c(true).wave)
    expect(c('stock').value).toBeCloseTo(Math.min(3, c(false).value * c('stock').wave), 9)
  })
  it('waveLines says price with the stock-grade number for a quoted company and value for a private one; a pure Stocks row ignores a wave alone', () => {
    const g = makeTestGame(1); put(g, SMART()); const line = (pub: boolean) => waveLines(g, { industry: 'software', countryId: 'us', public: pub }, 2034)[0]
    expect(line(false)).toMatch(/value \+13%\.$/); expect(line(true)).toMatch(/price \+19%\.$/); expect(line(true)).not.toMatch(/value/)
    const h = founder(41, 'us', 5e10, 2034); listed(h); const rows = ownListings(h); put(h, SMART()); expect(ownListings(h)).toEqual(rows)
  })
})
