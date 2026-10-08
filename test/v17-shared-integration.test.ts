import { afterEach, describe, expect, it } from 'vitest'
import { jewelryListings, luxuryListings, yearlyAssets } from '../src/game/assets'
import { bindMoneyContext, setMoneyDisplay } from '../src/game/core'
import { allBrands } from '../src/game/data/brands'
import '../src/game/data/currencies'
import { pricesOf, thisYearNodes } from '../src/game/history/digest'
import { allRealCos } from '../src/game/invest/real'
import { activitiesMenu, assetsMenu } from '../src/game/menus'
import { createPerson } from '../src/game/people'
import { lineById } from '../src/game/shops/luxury-brands-catalog'
import { buyOffer } from '../src/game/shops/luxury-brands-deal'
import { auctionLots } from '../src/game/shops/luxury-brands-rooms'
import { attendVipEvent } from '../src/game/shops/luxury-pamper'
import type { Asset, GameState, MenuGroup } from '../src/game/types'
import { makeTestGame } from './helpers'

afterEach(() => {
  bindMoneyContext(null)
  setMoneyDisplay({ mode: 'usd', nominal: false })
})

function adult(money = 100_000_000): GameState {
  const g = makeTestGame(17, { age: 40, money })
  g.year = 2026
  g.log[0].year = g.year
  return g
}

function holding(g: GameState, id: string): MenuGroup {
  const node = assetsMenu.children(g).find((n) => n.id === `asset-${id}`)
  if (!node || node.type !== 'menu') throw new Error(`missing holding ${id}`)
  return node
}

describe('v1.7 shared integrations', () => {
  it('makes This Year and Hang Out reachable from Activities', () => {
    const historical = adult()
    historical.year = 1955
    const yearNode = activitiesMenu.children(historical).find((n) => n.id === 'thisYear')
    expect(yearNode?.type).toBe('menu')
    expect(yearNode && 'visible' in yearNode ? yearNode.visible?.(historical) : false).toBe(true)

    const modern = adult()
    const pastimeNode = activitiesMenu.children(modern).find((n) => n.id === 'pastimes')
    expect(pastimeNode?.type).toBe('menu')
    expect(pastimeNode && 'visible' in pastimeNode ? pastimeNode.visible?.(modern) : false).toBe(true)
  })

  it('uses the branded holding screen and adds Family Access to ordinary valuable assets', () => {
    const g = adult()
    createPerson(g, { relation: 'child', age: 20, relationship: 80 })

    const line = lineById('omega-speedmaster')
    if (!line) throw new Error('missing omega-speedmaster')
    const piece = buyOffer(g, line, 0, 'boutique')
    expect(piece).not.toBeNull()
    g.queue = []
    const brandedIds = holding(g, piece!.id).children(g).map((n) => n.id)
    expect(brandedIds).toContain(`lux-sell-dealer-${piece!.id}`)
    expect(brandedIds).toContain(`fam-access-${piece!.id}`)
    expect(brandedIds).not.toContain(`sell-${piece!.id}`)

    const car: Asset = {
      id: 'ordinary-car',
      kind: 'car',
      name: 'Family Sedan',
      emoji: '🚗',
      purchasePrice: 25_000,
      value: 18_000,
      condition: 90,
      purchasedAge: 38,
      upkeep: 1_500,
      details: { carType: 'economy', modelYear: 2024, color: 'Blue', mileage: 12_000 },
    }
    g.assets.push(car)
    expect(holding(g, car.id).children(g).map((n) => n.id)).toContain(`fam-access-${car.id}`)
  })

  it('leaves branded values, condition and running costs to the luxury yearly hook', () => {
    const g = adult()
    const line = lineById('omega-speedmaster')
    if (!line) throw new Error('missing omega-speedmaster')
    const piece = buyOffer(g, line, 0, 'boutique')
    if (!piece) throw new Error('could not buy omega-speedmaster')
    g.character.prison = { name: 'Test Prison', security: 'minimum', crime: 'Test', sentenceYears: 1, yearsServed: 0, respect: 0, appealed: false, escapeAttempts: 0 }
    const before = { value: piece.value, condition: piece.condition, upkeep: piece.upkeep }
    yearlyAssets(g)
    expect({ value: piece.value, condition: piece.condition, upkeep: piece.upkeep }).toEqual(before)
  })

  it('shows cents for cheap historical prices and exposes each brand id once', () => {
    bindMoneyContext(null)
    setMoneyDisplay({ mode: 'usd', nominal: false })
    const g = adult()
    g.year = 1900
    const cheap = pricesOf(g.year).find((p) => p.engine > 0 && p.engine < 10)
    if (!cheap) throw new Error('missing a cheap 1900 price')
    const row = thisYearNodes(g).find((n) => n.id === `year.price.${cheap.id}`)
    expect(row?.type).toBe('info')
    const text = row?.type === 'info' ? (typeof row.text === 'function' ? row.text(g) : row.text) : ''
    expect(text).toContain(`$${(Math.round(cheap.engine * 100) / 100).toFixed(2)}`)

    const ids = allBrands().map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the legacy boutique era-correct and uses real houses without branding counterfeits', () => {
    const early = adult()
    early.year = 1900
    const earlyNames = luxuryListings(early).map((x) => x.name)
    expect(earlyNames.join('|')).not.toMatch(/Sunglasses|Gown|Sneakers|Silk Scarf|Fragrance|Luxury Watch|Tailored Suit/)

    const modern = adult()
    const brands = allBrands().map((b) => b.name)
    for (const item of luxuryListings(modern)) expect(brands.some((name) => item.name.startsWith(`${name} `)), item.name).toBe(true)
    for (const item of jewelryListings(modern, 'real')) expect(brands.some((name) => item.name.startsWith(`${name} `)), item.name).toBe(true)
    for (const item of jewelryListings(modern, 'fake')) expect(brands.some((name) => item.name.startsWith(`${name} `)), item.name).toBe(false)
  })

  it('uses the verified home-listing years for the corrected European stocks', () => {
    const byName = (name: string) => allRealCos().find((x) => x.name === name)
    expect(byName('Norsk Hydro')?.start).toBe(1909)
    expect(byName('Aeroflot')?.start).toBe(2004)
  })

  it('does not expose or sell branded alcohol where the character cannot legally buy it', () => {
    const g = adult()
    g.character.age = 18
    for (let i = 0; i < 30; i++) {
      g.lifeId = `blocked-alcohol-${i}`
      for (const lot of auctionLots(g)) {
        const line = lot.lineId ? lineById(lot.lineId) : undefined
        expect(line?.cat === 'wine' || line?.cat === 'spirit', lot.title).toBe(false)
      }
    }
    const before = g.character.money
    expect(attendVipEvent(g, 'nightclub')).toBe(false)
    expect(g.character.money).toBe(before)
  })
})
