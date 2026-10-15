// Heavy R&D, the empty list on the Products screen: when no breakthrough is on offer the screen gives
// the true reason, not always "the world isn't ready". Either nothing is invented yet for the year, or
// everything the year allows is already retired, on sale, in development or launched by this company.
// Both are pure readers of the catalogue and the company.
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { addHeavy, heavyNone, heavyOffers } from '../src/game/business/heavy-rd'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { rememberRetired } from '../src/game/business/rd'
import { bizOf } from '../src/game/business/state'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { adult, allNodes, company, nextYear } from './market-kit'

const NAMES = breakthroughsFor('restaurant').map((x) => x.name)

function biz(seed = 3, industry: Parameters<typeof company>[1] = 'restaurant') {
  const g = adult(seed, 2030, 'us')
  const a = company(g, industry, { cash: 80_000_000 })
  nextYear(g)
  g.queue = []
  return { g, a, b: bizOf(g, a) }
}

/** The text of the "nothing on offer" row of the Products screen (undefined: the screen has no such row). */
function noneRow(g: GameState, a: Asset): string | undefined {
  const menu = allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'menu' && n.id === `biz.products.${a.id}`)
  if (!menu || menu.type !== 'menu') throw new Error('no products menu')
  const row = menu.children(g).find((n: MenuNode) => n.type === 'info' && n.id.startsWith('biz.heavyNone.'))
  return row && row.type === 'info' ? (typeof row.text === 'function' ? row.text(g) : row.text) : undefined
}

describe('why the Heavy R&D list is empty', () => {
  it('says nothing is invented yet when the year allows no breakthrough', () => {
    const { g, a, b } = biz(21)
    g.year = 1930
    expect(heavyOffers(g, b, a.id)).toEqual([])
    const text = noneRow(g, a)!
    expect(text).toContain('Nothing is invented yet')
    expect(text).toContain('1930')
    expect(text).not.toMatch(/retired|on sale|development|launched/)
    expect(heavyNone(g, b, a.id)).toBe(text)
  })

  it('says everything the year allows is retired when every breakthrough was retired', () => {
    const { g, a, b } = biz(22)
    // Past their first year: all three of a restaurant's breakthroughs exist in 2030.
    expect(breakthroughsFor('restaurant').every((x) => x.first <= g.year)).toBe(true)
    rememberRetired(b, NAMES)
    expect(heavyOffers(g, b, a.id)).toEqual([])
    const text = noneRow(g, a)!
    expect(text).toMatch(/retired/)
    expect(text).not.toContain('Nothing is invented yet')
    expect(text).not.toMatch(/ready for/)
  })

  it('says the same when they are on sale, in development or launched by this company', () => {
    const { g, a, b } = biz(23)
    b.products.push({ name: NAMES[0], launched: 2029, boost: 0, quality: 80, family: NAMES[0], kind: 'breakthrough' })
    b.rd = [{ id: 'rd9', name: NAMES[1], budget: 1e6, years: 4, progress: 1, odds: 0.4, boost: 0, quality: 80, family: NAMES[1], kind: 'breakthrough', heavy: true, cost: 1e6, started: 2030 }]
    addHeavy(g, 'restaurant', 'us', { family: NAMES[2], year: 2027, years: 4, quality: 80, cost: 2e6, by: a.id })
    addHeavy(g, 'restaurant', 'us', { family: NAMES[3], year: 2027, years: 4, quality: 80, cost: 2e6, by: a.id })
    addHeavy(g, 'restaurant', 'us', { family: NAMES[4], year: 2027, years: 4, quality: 80, cost: 2e6, by: a.id })
    expect(heavyOffers(g, b, a.id)).toEqual([])
    const text = noneRow(g, a)!
    expect(text).not.toContain('Nothing is invented yet')
    expect(text).toBe(heavyNone(g, b, a.id))
    // The same sentence as when everything was retired: the reason is the same, there is nothing left to offer.
    const other = biz(24)
    rememberRetired(other.b, NAMES)
    expect(noneRow(other.g, other.a)).toBe(text)
  })

  it('has no such line while something is on offer, and none for a company without Heavy R&D', () => {
    const { g, a, b } = biz(25)
    expect(heavyOffers(g, b, a.id).length).toBeGreaterThan(0)
    expect(heavyNone(g, b, a.id)).toBeNull()
    expect(noneRow(g, a)).toBeUndefined()
    rememberRetired(b, NAMES.slice(0, 4))
    expect(heavyOffers(g, b, a.id).map((x) => x.name)).toEqual([NAMES[4]])
    expect(heavyNone(g, b, a.id)).toBeNull()
    const deep = biz(26, 'semiconductor')
    expect(heavyNone(deep.g, deep.b, deep.a.id)).toBeNull()
  })

  it('is a plain reader: it reads the same twice and leaves the game untouched', () => {
    const { g, a, b } = biz(27)
    rememberRetired(b, NAMES)
    const state = JSON.stringify(g)
    expect(heavyNone(g, b, a.id)).toBe(heavyNone(g, b, a.id))
    expect(JSON.stringify(g)).toBe(state)
  })
})
