import { describe, expect, it } from 'vitest'
import { buyHouse, houseListings, insurancePremium, yearlyAssets } from '../src/game/assets'
import { lineById } from '../src/game/shops/luxury-brands-catalog'
import { buyOffer } from '../src/game/shops/luxury-brands-deal'
import type { Asset, GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

function rich(): GameState {
  const g = makeTestGame(1, { age: 40, money: 100_000_000 })
  g.character.licenses.push('driver', 'boating', 'pilot')
  return g
}

function buy(g: GameState, id: string): Asset {
  const line = lineById(id)
  if (!line) throw new Error(`missing luxury line ${id}`)
  const asset = buyOffer(g, line, 0, 'boutique')
  if (!asset) throw new Error(`could not buy luxury line ${id}`)
  g.queue = []
  return asset
}

function noticeTitles(g: GameState): string[] {
  return g.queue.flatMap((item) => (item.kind === 'notice' ? [item.title] : []))
}

describe('branded assets and generic yearly events', () => {
  it('does not lose a Cartier through generic yearly jewelry events', () => {
    const g = rich()
    const cartier = buy(g, 'cartier-love-bracelet')
    cartier.details.luxIns = true
    const money = g.character.money

    // The branded yearly hook owns both this piece's loss roll and its luxIns premium.
    g.rng = 13
    yearlyAssets(g)

    expect(g.assets).toContain(cartier)
    expect(g.character.money).toBe(money)
    expect(noticeTitles(g)).not.toContain('Lost Jewelry')
  })

  it.each([
    ['car', 'ferrari-296-gtb'],
    ['craft', 'riva-rivale'],
  ])('does not send a branded %s through generic vehicle events', (_kind, lineId) => {
    const g = rich()
    const asset = buy(g, lineId)
    const condition = asset.condition
    const money = g.character.money
    const upkeep = asset.upkeep

    // Generic yearly events must leave branded vehicle condition to its own hook.
    g.rng = 13
    yearlyAssets(g)

    expect(g.assets).toContain(asset)
    expect(asset.condition).toBe(condition)
    expect(g.character.money).toBe(money - upkeep)
    expect(noticeTitles(g)).not.toContain('Fender Bender')
    expect(noticeTitles(g)).not.toContain('Engine Trouble')
  })

  it('does not treat branded jewelry as loot in a generic burglary', () => {
    const g = rich()
    const listing = houseListings(g, 'residential').find((house) => house.haunted === 0)
    if (!listing) throw new Error('missing non-haunted house listing')
    expect(buyHouse(g, listing, null)).toBe(true)
    const cartier = buy(g, 'cartier-love-bracelet')

    // Find an actual break-in without relying on unrelated housing RNG consumption.
    // Every attempted path must preserve the Cartier; removing the branded-loot
    // filter must fail this test, not merely make it miss the desired event.
    const original = JSON.stringify(g)
    let breakIn = false
    for (let seed = 1; seed <= 256 && !breakIn; seed++) {
      const trial = JSON.parse(original) as GameState
      trial.rng = seed
      yearlyAssets(trial)
      expect(trial.assets.some(a => a.id === cartier.id)).toBe(true)
      expect(noticeTitles(trial)).not.toContain('Burglary')
      breakIn = noticeTitles(trial).includes('Break-In')
    }
    expect(breakIn).toBe(true)
  })

  it('keeps regular-policy billing coherent for an old branded holding', () => {
    const g = rich()
    const cartier = buy(g, 'cartier-love-bracelet')
    cartier.details.insured = true
    const premium = insurancePremium(g, cartier)
    const money = g.character.money

    g.rng = 13
    yearlyAssets(g)

    expect(g.assets).toContain(cartier)
    expect(g.character.money).toBe(money - premium)
    expect(noticeTitles(g)).not.toContain('Lost Jewelry')
  })
})
