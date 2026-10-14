// One key per company (invest/engine.ts companyKey): a real company that lists a second class
// gets lines whose ids are '<company id>~<letter>'. News, inventions and politics belong to the
// company, so every line of it moves together; the player's own order flow stays on the line they
// traded. Nothing here reads g.rng.
import { describe, expect, it } from 'vitest'
import { listedTargets, stockTargets } from '../src/game/computer/money-stocks'
import { companyKey, exchangeInfo, isRealSecId, lineLetter, LINE_SEP } from '../src/game/invest/engine'
import { addMarketBreakthrough, addMarketShock, breakthroughStockFactor, marketShocks, orderFlowFactor, shockFactor } from '../src/game/invest/shocks'
import { investmentListing } from '../src/game/investments'
import { insiderPositions } from '../src/game/special/politics'
import type { Asset, GameState } from '../src/game/types'
import { founder } from './own-listing-kit'

const COUNTRIES_TO_CHECK = ['us', 'jp', 'de', 'in', 'hk']
const YEARS_TO_CHECK = [1930, 1990, 2026]

/** A US game with a company of the registry: its target (exchange key, slot) and its id. */
function realCompany(seed = 5, year = 2026): { g: GameState; id: string; exKey: string; slot: number; name: string; symbol: string } {
  const g = founder(seed, 'us', 50_000_000_000, year)
  const t = listedTargets(g).find((x) => x.real)!
  return { g, id: t.secId, exKey: t.exKey, slot: t.slot, name: t.name, symbol: t.symbol }
}

function shockOn(g: GameState, c: { exKey: string; slot: number; name: string; symbol: string }, secId: string, cause: 'contract' | 'ban' | 'liquidity', mult: number) {
  return addMarketShock(g, { asset: 'stock', secId, exKey: c.exKey, slot: c.slot, name: c.name, symbol: c.symbol, cause, year: g.year, mult, fade: 0, countryId: 'us' })
}

function heldShares(secId: string, value = 5_000): Asset {
  return { id: `held-${secId}`, kind: 'investment', name: 'A line', emoji: '\u{1F4C8}', purchasePrice: value, value, condition: 100, purchasedAge: 45, upkeep: 0, details: { type: 'stock', secId } }
}

describe('one key per company', () => {
  it('strips only a line suffix', () => {
    const id = 'NYSE:S&P 500#s3g100012'
    expect(LINE_SEP).toBe('~')
    expect(companyKey(`${id}~C`)).toBe(id)
    expect(lineLetter(`${id}~C`)).toBe('C')
    expect(companyKey(`${id}~A1`)).toBe(id)
    expect(lineLetter(`${id}~A1`)).toBe('A1')
    expect(companyKey(`${id}~X9Z`)).toBe(id)
    for (const same of [id, 'crypto#c0g0', 'NYSE:S&P 500#fund', 'bond:us:2030', '', 'x~', 'x~ab', 'x~ABCD', 'x~A-', '~']) {
      expect(companyKey(same)).toBe(same)
      expect(lineLetter(same)).toBeNull()
    }
    // Only the last suffix goes: the key of a key is not a second strip.
    expect(companyKey('x~A~B')).toBe('x~A')
  })

  it('is the identity for every id the engine makes', () => {
    for (const home of COUNTRIES_TO_CHECK) {
      for (const year of YEARS_TO_CHECK) {
        const ids = investmentListing(founder(5, home, 50_000_000_000, year)).map((q) => q.secId)
        expect(ids.length).toBeGreaterThan(0)
        for (const id of ids) {
          expect(companyKey(id)).toBe(id)
          expect(lineLetter(id)).toBeNull()
        }
      }
    }
  })

  it('isRealSecId reads through the suffix', () => {
    const ids = investmentListing(founder(5, 'us', 50_000_000_000, 2026)).filter((q) => q.type === 'stock').map((q) => q.secId)
    const real = ids.find((id) => isRealSecId(id))!
    const made = ids.find((id) => /g0$/.test(id))!
    expect(real).toBeTruthy()
    expect(made).toBeTruthy()
    expect(isRealSecId(real)).toBe(true)
    expect(isRealSecId(`${real}~C`)).toBe(true)
    expect(isRealSecId(made)).toBe(false)
    expect(isRealSecId(`${made}~C`)).toBe(false)
    // A tail that is not a line suffix does not turn a made-up id real.
    expect(isRealSecId(`${made}~ab`)).toBe(false)
    expect(isRealSecId('')).toBe(false)
  })

  it('news hits every line, order flow only its own', () => {
    const c = realCompany()
    const line = `${c.id}~C`
    const before = shockFactor(c.g, c.id, c.g.year)
    shockOn(c.g, c, c.id, 'contract', 1.2)
    const news = shockFactor(c.g, c.id, c.g.year)
    expect(news).toBeCloseTo(before * 1.2, 9)
    expect(shockFactor(c.g, line, c.g.year)).toBe(news)
    shockOn(c.g, c, line, 'liquidity', 1.1)
    expect(shockFactor(c.g, line, c.g.year)).toBeCloseTo(news * 1.1, 9)
    expect(shockFactor(c.g, c.id, c.g.year)).toBe(news)
    expect(orderFlowFactor(c.g, line, c.g.year)).toBeCloseTo(1.1, 9)
    expect(orderFlowFactor(c.g, c.id, c.g.year)).toBe(1)
  })

  it('order flow on the company does not leak onto a line', () => {
    const c = realCompany()
    shockOn(c.g, c, c.id, 'liquidity', 1.1)
    expect(shockFactor(c.g, c.id, c.g.year)).toBeGreaterThan(shockFactor(c.g, `${c.id}~C`, c.g.year))
    expect(orderFlowFactor(c.g, `${c.id}~C`, c.g.year)).toBe(1)
  })

  it('news written against a line is stored on the company', () => {
    const c = realCompany()
    const line = `${c.id}~C`
    const news = shockOn(c.g, c, line, 'contract', 1.2)
    expect(news.secId).toBe(c.id)
    expect(news.mult).toBe(1.2)
    const flow = shockOn(c.g, c, line, 'liquidity', 1.1)
    expect(flow.secId).toBe(line)
    expect(marketShocks(c.g).map((s) => s.secId).sort()).toEqual([line, c.id].sort())
  })

  it('order flow on one line is kept as one record a year', () => {
    const c = realCompany()
    const line = `${c.id}~C`
    shockOn(c.g, c, line, 'liquidity', 1.1)
    shockOn(c.g, c, line, 'liquidity', 1.1)
    shockOn(c.g, c, c.id, 'liquidity', 1.05)
    const flows = marketShocks(c.g).filter((s) => s.cause === 'liquidity')
    expect(flows).toHaveLength(2)
    expect(orderFlowFactor(c.g, line, c.g.year)).toBeCloseTo(1.21, 9)
    expect(orderFlowFactor(c.g, c.id, c.g.year)).toBeCloseTo(1.05, 9)
  })

  it('an invention reaches every line', () => {
    const c = realCompany()
    const gen = Number(/g(\d+)$/.exec(c.id)![1])
    const stocks: (number | null)[] = Array.from({ length: c.slot + 1 }, () => null)
    stocks[c.slot] = gen
    const key = exchangeInfo('us').key
    expect(addMarketBreakthrough(c.g, { id: 'invention', name: 'A new engine', year: c.g.year, mult: 1.5, exchanges: [{ key, stocks, pennies: [], indexId: `${key}#fund` }], businesses: [] })).toBe(true)
    const main = breakthroughStockFactor(c.g, c.id, c.g.year)
    expect(main).toBeGreaterThan(1)
    expect(breakthroughStockFactor(c.g, `${c.id}~C`, c.g.year)).toBe(main)
    // The line prices through shockFactor the same way.
    expect(shockFactor(c.g, `${c.id}~C`, c.g.year)).toBe(shockFactor(c.g, c.id, c.g.year))
    // Years before the invention, and a year that is not a number, change nothing.
    expect(breakthroughStockFactor(c.g, `${c.id}~C`, c.g.year - 1)).toBe(1)
    expect(breakthroughStockFactor(c.g, `${c.id}~C`, Number.NaN)).toBe(1)
  })

  it('a damaging story never sticks to a real company\'s line', () => {
    const c = realCompany()
    const story = shockOn(c.g, c, `${c.id}~C`, 'ban', 0.5)
    expect(story.mult).toBe(1)
    expect(story.secId).toBe(c.id)
    expect(shockFactor(c.g, `${c.id}~C`, c.g.year)).toBe(shockFactor(c.g, c.id, c.g.year))
  })

  it('a made-up company keeps taking the whole blow', () => {
    const g = founder(5, 'us', 50_000_000_000, 2026)
    const t = stockTargets(g)[0]
    const hit = addMarketShock(g, { asset: 'stock', secId: t.secId, exKey: t.exKey, slot: t.slot, name: t.name, symbol: t.symbol, cause: 'ban', year: g.year, mult: 0.5, fade: 0, countryId: 'us' })
    expect(hit.mult).toBe(0.5)
  })

  it('insider positions count a line', () => {
    const c = realCompany()
    const target = listedTargets(c.g).find((t) => t.secId === c.id)!
    const other = listedTargets(c.g).find((t) => t.real && t.secId !== c.id)!
    const none = insiderPositions(c.g, target, false, { freshOnly: false })
    expect(none.shares).toBe(0)
    c.g.assets.push(heldShares(`${c.id}~C`))
    expect(insiderPositions(c.g, target, false, { freshOnly: false }).shares).toBeGreaterThan(0)
    expect(insiderPositions(c.g, target, false, { freshOnly: false }).shares).toBe(5_000)
    // A bearish move wins nothing from shares, on any line.
    expect(insiderPositions(c.g, target, true, { freshOnly: false }).shares).toBe(0)
    // Another company's line is not this company's shares.
    expect(insiderPositions(c.g, other, false, { freshOnly: false }).shares).toBe(0)
  })

  it('insider positions on a company\'s main line still count as before', () => {
    const c = realCompany()
    const target = listedTargets(c.g).find((t) => t.secId === c.id)!
    c.g.assets.push(heldShares(c.id, 3_000))
    expect(insiderPositions(c.g, target, false, { freshOnly: false }).shares).toBe(3_000)
  })

  it('only made-up companies are ever targets', () => {
    const g = founder(5, 'us', 50_000_000_000, 2026)
    expect(stockTargets(g).some((t) => t.real)).toBe(false)
    expect(stockTargets(g).length).toBeGreaterThan(0)
    for (const t of [...stockTargets(g), ...listedTargets(g)]) expect(t.secId).not.toContain(LINE_SEP)
  })
})
