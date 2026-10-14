// Heavy R&D across a generation handoff (spec 4, "Old saves" and "Determinism"): the breakthroughs a
// market has seen and the news about them are world state, like market shocks, so the heir finds the
// trade exactly as the parent left it. The flags are carried through the same readers that validate
// them on load, never copied blindly: a damaged flag must not survive the handoff.
import { describe, expect, it } from 'vitest'
import { marketCtxFor } from '../src/game/business/economy'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { addHeavy, advanceHeavy, heavyBlock, heavyKey, heavyOf, heavyOffers, MAX_HEAVY_RECORDS, readHeavy, type HeavyRecord } from '../src/game/business/heavy-rd'
import { fieldFor } from '../src/game/business/product-market'
import { readBiz, type RdProject } from '../src/game/business/state'
import { killCharacter } from '../src/game/death'
import { readMarketNews, MAX_MARKET_NEWS, pushMarketNews } from '../src/game/history/market-events'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, Json } from '../src/game/types'
import { adult, company, nextYear } from './market-kit'

const FAMILY = breakthroughsFor('restaurant')[0].name
const OTHER = breakthroughsFor('restaurant')[1].name

/** A parent who owns a restaurant that launched a breakthrough two years ago, and a grown-up child. */
function parent(): { g: GameState; a: Asset; rec: HeavyRecord; heirId: string } {
  const g = adult(11, 2030, 'us')
  const a = company(g, 'restaurant', { name: 'Handoff Diner' })
  nextYear(g)
  const b = readBiz(g, a)
  const rec: HeavyRecord = { family: FAMILY, year: 2028, years: 4, quality: 82, cost: 3_200_000, by: a.id, rival: 'Rival Grill' }
  addHeavy(g, 'restaurant', 'us', rec)
  b.products.push({ name: FAMILY, launched: 2028, boost: 0, quality: 82, family: FAMILY, kind: 'breakthrough' })
  expect(
    pushMarketNews(g, { id: 'heavy-news-1', year: 2028, industry: 'restaurant', market: 'us', emoji: '\u{1F4F0}', title: `${FAMILY}: a New Kind of Restaurant`, text: 'Handoff Diner launched it.' }),
  ).toBe(true)
  g.character.age = 70
  const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
  return { g, a, rec, heirId: heir.id }
}

function handOff(g: GameState, heirId: string): GameState {
  killCharacter(g, 'Old Age')
  g.queue = []
  const n = continueAsChild(g, heirId)
  expect(n).not.toBe(g)
  expect(n.generation).toBe(2)
  return n
}

describe('Heavy R&D across a generation handoff', () => {
  it('keeps the breakthrough records and the market news for the heir', () => {
    const { g, a, rec, heirId } = parent()
    const news = readMarketNews(g)
    expect(news).toHaveLength(1)
    const n = handOff(g, heirId)

    expect(readHeavy(n, 'restaurant', 'us')).toEqual([rec])
    expect(Object.keys(n.flags).filter((k) => k.startsWith('heavy.'))).toEqual([heavyKey('restaurant', 'us')])
    expect(readMarketNews(n)).toEqual(news)
    // The company went to the heir along with its line.
    expect(n.assets.some((x) => x.id === a.id)).toBe(true)
  })

  it('leaves the kind\'s demand and the whole trade\'s pot exactly as they were', () => {
    const { g, a, rec, heirId } = parent()
    const year = g.year
    const ctxBefore = marketCtxFor(g, readBiz(g, a), year)
    const ofBefore = fieldFor(ctxBefore).of(FAMILY)
    expect(ofBefore.exists).toBe(true)
    // A recorded breakthrough is not the mature default kind (offer 0.96, adoption 1.0 once it exists).
    expect(heavyOf(g, readBiz(g, a))).toEqual([rec])

    const n = handOff(g, heirId)
    expect(n.year).toBe(year)
    const heirCo = n.assets.find((x) => x.id === a.id)!
    const ctxAfter = marketCtxFor(n, readBiz(n, heirCo), year)
    const ofAfter = fieldFor(ctxAfter).of(FAMILY)
    expect(ofAfter).toEqual(ofBefore)
    expect(ctxAfter.pot).toBe(ctxBefore.pot)
    // The pulse is really in the pot: without the records the same market is smaller.
    const without = structuredClone(n)
    delete without.flags[heavyKey('restaurant', 'us')]
    expect(marketCtxFor(without, readBiz(without, without.assets.find((x) => x.id === a.id)!), year).pot).toBeLessThan(ctxAfter.pot)
  })

  it('does not offer or announce the same kind as a first again', () => {
    const { g, a, rec, heirId } = parent()
    const n = handOff(g, heirId)
    const heirCo = n.assets.find((x) => x.id === a.id)!
    const b = readBiz(n, heirCo)
    // The line has run its course, but the company opened that kind once and doesn't open it again.
    b.products = b.products.filter((p) => p.name !== FAMILY)
    b.cash = 1e9
    expect(heavyOffers(n, b, a.id).map((x) => x.name)).not.toContain(FAMILY)
    expect(heavyBlock(n, b, FAMILY, a.id)).toBe(`You already launched ${FAMILY}.`)
    // A launch of the same kind in the same market is not the first any more: no headline, no popup.
    const project: RdProject = { id: 'rd-x', name: FAMILY, budget: 1e6, years: 4, progress: 4, odds: 0.98, boost: 0, quality: 80, family: FAMILY, kind: 'breakthrough', heavy: true, cost: 1e6, started: n.year - 4 }
    let landed = false
    for (let seed = 1; seed < 60 && !landed; seed++) {
      const c = structuredClone(n)
      c.rng = seed
      const done = advanceHeavy(c, c.assets.find((x) => x.id === a.id)!, readBiz(c, c.assets.find((x) => x.id === a.id)!), { ...project }, c.year)
      if (!done.won) continue
      landed = true
      expect(done.line).toContain('The kind is already on the market.')
      expect(c.queue.some((m) => m.id.startsWith('heavy-'))).toBe(false)
      expect(readMarketNews(c)).toHaveLength(1)
      // The pioneer's record is still the earliest one.
      expect(readHeavy(c, 'restaurant', 'us').find((r) => r.family === FAMILY)?.year).toBe(rec.year)
    }
    expect(landed).toBe(true)
  })

  it('carries every market and trade, and a second record in the same market', () => {
    const { g, heirId } = parent()
    addHeavy(g, 'restaurant', 'us', { family: OTHER, year: 2029, years: 4, quality: 70, cost: 1_000_000, by: 'x' })
    addHeavy(g, 'manufacturing', 'world', { family: breakthroughsFor('manufacturing')[0].name, year: 2027, years: 6, quality: 60, cost: 9_000_000, by: 'y' })
    addHeavy(g, 'restaurant', 'gb', { family: FAMILY, year: 2026, years: 4, quality: 55, cost: 500_000, by: 'z' })
    const n = handOff(g, heirId)
    expect(readHeavy(n, 'restaurant', 'us').map((r) => r.family)).toEqual([FAMILY, OTHER])
    expect(readHeavy(n, 'manufacturing', 'world')).toHaveLength(1)
    expect(readHeavy(n, 'restaurant', 'gb')).toHaveLength(1)
    expect(Object.keys(n.flags).filter((k) => k.startsWith('heavy.')).sort()).toEqual(
      ['heavy.manufacturing|world', 'heavy.restaurant|gb', 'heavy.restaurant|us'],
    )
  })

  it('an old world with no breakthroughs hands over with none', () => {
    const g = adult(12, 2030, 'us')
    company(g, 'restaurant')
    nextYear(g)
    g.character.age = 70
    const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
    const n = handOff(g, heir.id)
    expect(Object.keys(n.flags).filter((k) => k.startsWith('heavy.') || k === 'market.news')).toEqual([])
  })

  describe('damaged flags do not survive', () => {
    const goodRec = (over: Record<string, Json> = {}): Json => ({ family: FAMILY, year: 2028, years: 4, quality: 80, cost: 3_000_000, by: 'biz1', ...over })

    it('flags of the wrong type are dropped, not copied', () => {
      const { g, heirId } = parent()
      g.flags['heavy.restaurant|ca'] = 'not a list'
      g.flags['heavy.restaurant|de'] = { family: FAMILY }
      g.flags['heavy.restaurant|fr'] = 12
      g.flags['heavy.restaurant|it'] = null
      g.flags['heavy.restaurant|jp'] = []
      g.flags['heavy.restaurant|es'] = [null, 7, 'x', [], {}]
      const n = handOff(g, heirId)
      for (const m of ['ca', 'de', 'fr', 'it', 'jp', 'es']) expect(n.flags[heavyKey('restaurant', m)]).toBeUndefined()
      expect(readHeavy(n, 'restaurant', 'us')).toHaveLength(1)
    })

    it('records with NaN, infinite, negative or mistyped fields are dropped or clamped', () => {
      const { g, heirId } = parent()
      g.flags['heavy.restaurant|ca'] = [
        goodRec({ year: NaN as unknown as Json }),
        goodRec({ cost: Infinity as unknown as Json }),
        goodRec({ quality: 'high' }),
        goodRec({ by: 7 }),
        goodRec({ family: 'Not In The Catalogue' }),
        goodRec({ family: OTHER, year: 2026, years: 99, quality: 5000, cost: -5, by: 'b'.repeat(500), rival: 'r'.repeat(500) }),
      ]
      const n = handOff(g, heirId)
      const kept = readHeavy(n, 'restaurant', 'ca')
      expect(kept).toHaveLength(1)
      expect(kept[0]).toMatchObject({ family: OTHER, years: 6, quality: 100, cost: 0 })
      expect(kept[0].by.length).toBeLessThanOrEqual(64)
      expect((kept[0].rival ?? '').length).toBeLessThanOrEqual(80)
      const stored = n.flags[heavyKey('restaurant', 'ca')] as unknown as Record<string, unknown>[]
      expect(Array.isArray(stored)).toBe(true)
      expect(stored).toHaveLength(1)
      expect(Object.keys(stored[0]).sort()).toEqual(['by', 'cost', 'family', 'quality', 'rival', 'year', 'years'])
      expect(JSON.parse(JSON.stringify(n.flags))).toEqual(n.flags)
    })

    it('a huge list is cut to the records a market keeps, and a huge news list to the news it keeps', () => {
      const { g, heirId } = parent()
      const names = breakthroughsFor('restaurant').map((x) => x.name)
      g.flags['heavy.restaurant|ca'] = Array.from({ length: 5000 }, (_, i) => goodRec({ family: names[i % names.length], year: 2000 + (i % 40) }))
      g.flags['market.news'] = Array.from({ length: 5000 }, (_, i) => ({ id: `n${i}`, year: 2000 + (i % 40), industry: 'restaurant', market: 'us', emoji: 'x', title: `T${i}`, text: `Body ${i}` }))
      const n = handOff(g, heirId)
      const stored = n.flags[heavyKey('restaurant', 'ca')] as unknown as unknown[]
      expect(stored.length).toBeLessThanOrEqual(MAX_HEAVY_RECORDS)
      expect(stored.length).toBeLessThanOrEqual(names.length)
      const news = n.flags['market.news'] as unknown as unknown[]
      expect(news).toHaveLength(MAX_MARKET_NEWS)
      expect(readMarketNews(n)).toHaveLength(MAX_MARKET_NEWS)
    })

    it('a flood of heavy.* keys cannot flood the heir\'s flags', () => {
      const { g, heirId } = parent()
      for (let i = 0; i < 3000; i++) g.flags[`heavy.restaurant|m${i}`] = [goodRec()]
      g.flags['heavy.'] = [goodRec()]
      g.flags['heavy.no-market'] = [goodRec()]
      g.flags['heavy.|us'] = [goodRec()]
      g.flags['heavy.restaurant|'] = [goodRec()]
      g.flags['heavy.nothing-like-a-trade|us'] = [goodRec()]
      const n = handOff(g, heirId)
      const kept = Object.keys(n.flags).filter((k) => k.startsWith('heavy.'))
      expect(kept.length).toBeLessThan(400)
      for (const bad of ['heavy.', 'heavy.no-market', 'heavy.|us', 'heavy.restaurant|', 'heavy.nothing-like-a-trade|us']) expect(n.flags[bad]).toBeUndefined()
      expect(readHeavy(n, 'restaurant', 'us')).toHaveLength(1)
    })

    it('news of the wrong type or with damaged items is dropped or repaired', () => {
      const { g, heirId } = parent()
      g.flags['market.news'] = 'a headline'
      expect(readMarketNews(handOff(structuredClone(g), heirId))).toEqual([])
      const h = parent()
      h.g.flags['market.news'] = [
        null,
        42,
        { id: 'a' },
        { id: 'b', year: NaN, industry: 'restaurant', market: 'us', emoji: 'x', title: 't', text: 'x' },
        { id: 'ok', year: 2029, industry: 'restaurant', market: 'us', emoji: 'x', title: 't'.repeat(500), text: 'x'.repeat(5000) },
      ]
      const n = handOff(h.g, h.heirId)
      const news = readMarketNews(n)
      expect(news.map((x) => x.id)).toEqual(['ok'])
      expect(news[0].title.length).toBeLessThanOrEqual(120)
      expect(news[0].text.length).toBeLessThanOrEqual(600)
      const stored = n.flags['market.news'] as unknown as unknown[]
      expect(stored).toHaveLength(1)
    })
  })
})
