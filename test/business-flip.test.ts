// Buying a listed company and shopping it straight back out must not be an arbitrage; selling a
// company that has booked a year under its new owner still gets the market's full range of offers.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { buyBusinessMenu, listingsForSale } from '../src/game/business/founding'
import { shopCompany } from '../src/game/business/manage'
import { bizOf, businessAssets, normalizeBiz } from '../src/game/business/state'
import { marketOf } from '../src/game/data/markets'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuAction, ModalItem } from '../src/game/types'

function buyer(seed: number): GameState {
  const g = makeTestGame(seed, { age: 40, money: 500_000_000 })
  g.lifeId = `flip-${seed}`
  return g
}

function buy(g: GameState, listingId: string): void {
  const row = buyBusinessMenu.children(g).find(n => n.id === `biz.buy.${listingId}`) as MenuAction
  row.run(g)
  const m = g.queue.shift() as Extract<ModalItem, { kind: 'choice' }>
  runScript(g, m.scriptId!, 'savings', m.data, m)
  g.queue = []
}

function bestOffer(g: GameState): number {
  const a = businessAssets(g)[0], b = bizOf(g, a)
  let best = 0
  for (let round = 0; round < 2; round++) {
    shopCompany(g, a, b)
    const m = g.queue.pop() as Extract<ModalItem, { kind: 'choice' }>
    const offers = (m.data as { offers: { amount: number }[] }).offers
    best = Math.max(best, ...offers.map(o => o.amount))
  }
  return best
}

describe('buying a company to flip it the same year', () => {
  it('never draws an offer above what it just cost, so a flip loses money on every listing', () => {
    let deals = 0, profitable = 0
    for (let seed = 1; seed <= 40; seed++) {
      const base = buyer(seed)
      for (const listing of listingsForSale(base)) {
        const g = structuredClone(base)
        buy(g, listing.id)
        if (businessAssets(g).length !== 1) continue
        const cost = listing.price + Math.round(marketOf(g.character.countryId).startupFee * 0.5)
        const best = bestOffer(g)
        expect(best, `${seed} ${listing.biz.industry}`).toBeLessThanOrEqual(listing.price)
        deals++
        if (best > cost) profitable++
      }
    }
    expect(deals).toBeGreaterThan(60)
    expect(profitable).toBe(0)
  })

  it('records the purchase in plain JSON that survives a reload, and old saves have none', () => {
    const g = buyer(3)
    const listing = listingsForSale(g)[0]
    buy(g, listing.id)
    const b = bizOf(g, businessAssets(g)[0])
    expect(b.bought?.year).toBe(g.year)
    expect(b.bought!.operating).toBe(listing.price - (b.cash - b.debt))
    expect(normalizeBiz(JSON.parse(JSON.stringify(b)), g.year).bought).toEqual(b.bought)
    const old = JSON.parse(JSON.stringify(b)); delete old.bought
    expect(normalizeBiz(old, g.year).bought).toBeUndefined()
  })

  it('lifts the cap once the company has booked a year under its new owner', () => {
    const g = buyer(5)
    const listing = listingsForSale(g)[0]
    buy(g, listing.id)
    const b = bizOf(g, businessAssets(g)[0])
    const capped = bestOffer(structuredClone(g))
    // The year it was bought is booked: buyers price it on its own value again.
    b.last = { ...b.last!, year: b.bought!.year }
    let above = 0
    for (let i = 0; i < 20; i++) {
      const h = structuredClone(g); h.rng = 1000 + i
      if (bestOffer(h) > listing.price) above++
    }
    expect(capped).toBeLessThanOrEqual(listing.price)
    expect(above).toBeGreaterThan(0)
  })
})
