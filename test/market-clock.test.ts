import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exchangeMove } from '../src/game/business/economy'
import { marketYearOf as viaFundModel } from '../src/game/business/fund-model'
import { clampN } from '../src/game/business/util'
import { historicalIndexReturn } from '../src/game/history/markets'
import { bookedMarketMove, marketFamily, marketYearOf } from '../src/game/invest/clock'
import { exchangeInfo, indexMove } from '../src/game/invest/engine'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const engine = (g: GameState, c: string, fiscal: number) => clampN(Math.exp(clampN(indexMove(marketFamily(g), exchangeInfo(c), fiscal + 1).logRet, -5, 3)) - 1, -0.6, 1.2)
describe('the market clock (S11)', () => {
  it('is the engine move of fiscal + 1 from 2026 on, in five countries, and one definition serves the funds', () => {
    const g = makeTestGame(3); g.lifeId = 'clock-g1'
    for (const c of ['us', 'gb', 'jp', 'de', 'br']) for (let y = 2026; y <= 2045; y++) { expect(exchangeMove(g, c, y), `${c} ${y}`).toBeCloseTo(engine(g, c, y), 12); expect(bookedMarketMove(g, c, y)).toBe(exchangeMove(g, c, y)) }
    expect([marketYearOf(2030), viaFundModel(2030), viaFundModel === marketYearOf]).toEqual([2031, 2031, true])
  })
  it('keeps the real history: 1990, 2008 and 2020 are the table value, clamped', () => {
    const g = makeTestGame(3); for (const y of [1990, 2008, 2020]) expect(exchangeMove(g, 'us', y)).toBeCloseTo(clampN(historicalIndexReturn('us', y)!, -0.6, 1.2), 9)
  })
  it('an heir shares the family market, another family does not, and a Time Machine fork rerolls only the unfinished year', () => {
    const at = (id: string, forks?: Json) => { const g = makeTestGame(3); g.lifeId = id; if (forks) g.flags.timelineForks = forks; return g }
    expect(exchangeMove(at('fam-g1'), 'us', 2030)).toBe(exchangeMove(at('fam-g3'), 'us', 2030)); expect(exchangeMove(at('other-g1'), 'us', 2030)).not.toBe(exchangeMove(at('fam-g1'), 'us', 2030))
    const forked = at('fam-g1', [{ year: 2030, salt: 'ab1' }]), plain = at('fam-g1')
    expect(exchangeMove(forked, 'us', 2029)).toBe(exchangeMove(plain, 'us', 2029)); expect(exchangeMove(forked, 'us', 2030)).not.toBe(exchangeMove(plain, 'us', 2030))
  })
  it('the listed group year calls the same function and has no market path of its own', () => {
    const src = readFileSync('src/game/business/conglomerate-year.ts', 'utf8'); expect(src).toMatch(/exchangeMove\(g, /); expect(src).not.toMatch(/indexMove\(|bizexchange/)
  })
})
