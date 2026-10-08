// Review fixes for the luxury shops and family use: closed buy-fix-sell loops, certified pre-owned
// pieces, service costs, bottles, minors in supercars, trust farming and bounded joy.
import { describe, expect, it } from 'vitest'
import { createPerson } from '../src/game/people'
import { ALL_LINES, lineById, lineOnSale } from '../src/game/shops/luxury-brands-catalog'
import { buildAsset, buyOffer, offersFor } from '../src/game/shops/luxury-brands-deal'
import { luxuryAssetNodes } from '../src/game/shops/luxury-brands-assets'
import { auctionTypical, authCost, def, quickValue, scarcePremium, serviceCost } from '../src/game/shops/luxury-brands-value'
import { grantAccess, yearlyFamilyUse } from '../src/game/shops/luxury-family'
import { hireStaff } from '../src/game/shops/luxury-staff'
import type { Asset, GameState, MenuAction, MenuGroup } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

function rich(money = 5e9, countryId = 'us', year = 2026, seed = 3): GameState {
  const g = makeTestGame(seed, { age: 40, money, countryId, birthCountryId: countryId })
  g.year = year
  g.log[0].year = year
  g.character.licenses.push('driver', 'boating', 'pilot')
  return g
}

function line(id: string) {
  const l = lineById(id)
  if (!l) throw new Error(id)
  return l
}

function bought(g: GameState, id: string, channel: 'boutique' | 'preowned' | 'gray' = 'preowned'): Asset {
  const before = g.assets.length
  buyOffer(g, line(id), 0, channel)
  g.queue = []
  expect(g.assets.length, id).toBe(before + 1)
  return g.assets[g.assets.length - 1]
}

describe('Buy, restore and resell is never a trade', () => {
  it('loses money on every offer, in cheap and dear countries and across eras, even after a free service', () => {
    const worst: string[] = []
    for (const cid of ['us', 'ph', 'in', 'ch', 'jp', 'br', 'pk']) {
      for (const year of [1935, 1955, 1975, 1995, 2010, 2026]) {
        const g = rich(1e10, cid, year)
        for (const l of ALL_LINES) {
          if (!lineOnSale(g, l)) continue
          const n = l.variants?.length ?? 1
          for (let v = 0; v < n; v++) {
            for (const o of offersFor(g, l, v)) {
              const a = buildAsset(g, l, v, o, false)
              const cost = o.price + o.trip
              const check = (x: Asset, extra: number) => {
                const best = Math.max(quickValue(x), auctionTypical(x)) - extra
                return best / cost
              }
              const real = { ...a, details: { ...a.details, auth: 'verified' } } as Asset
              let ratio = check(real, o.channel === 'boutique' ? 0 : authCost(a, 1))
              if (o.used) {
                const w = { ...real, condition: real.condition, details: { ...real.details } } as Asset
                let svc = 0
                for (let k = 0; k < 3 && w.condition < 95; k++) {
                  svc += serviceCost(w, 1)
                  w.condition = Math.min(100, w.condition + 45)
                }
                ratio = Math.max(ratio, check(w, svc + authCost(a, 1)))
              }
              // A copy is nearly worthless, so the odds of one cost the buyer on average.
              const expected = ratio * (1 - o.fakeOdds)
              if (expected >= 0.99) worst.push(`${cid} ${year} ${l.id} v${v} ${o.channel}: ${expected.toFixed(3)}`)
            }
          }
        }
      }
    }
    expect(worst, worst.slice(0, 8).join('\n')).toEqual([])
  })

  it('sells certified pre-owned pieces in good shape, and the price of a restoration follows what it adds', () => {
    const g = rich()
    for (const l of ALL_LINES.filter((x) => lineOnSale(g, x)).slice(0, 120)) {
      for (const o of offersFor(g, l, 0)) {
        if (o.channel === 'preowned') expect(o.condition, l.id).toBeGreaterThanOrEqual(70)
        if (o.channel === 'gray') expect(o.condition, l.id).toBeGreaterThanOrEqual(60)
      }
    }
    // Restoring a worn watch (a gray-market class) costs at least about what it adds to the value.
    const w = bought(g, 'rolex-datejust', 'preowned')
    w.condition = 40
    const gain = (w.details.mkt as number) * 0.005 * 45
    expect(serviceCost(w, 1)).toBeGreaterThanOrEqual(Math.floor(gain * 0.9))
    expect(def(String(w.details.cls)).gray).toBeGreaterThan(0)
  })

  it('does not let an allocated piece resell above what the retail price was', () => {
    for (const cls of ['icon-watch', 'icon-bag', 'grail-sneaker', 'watch', 'bag']) {
      const d = def(cls)
      // The best exit is the auction room: its commission and costs must eat the scarcity premium.
      const commission = cls === 'grail-sneaker' ? 0.13 : 0.1
      expect(d.instant * (1 + scarcePremium(cls)) * (1 - commission - 0.015), cls).toBeLessThan(1)
    }
    for (const l of ALL_LINES.filter((x) => x.scarce !== undefined)) {
      const g = rich(5e10, 'us', 2026)
      const o = offersFor(g, l, 0).find((x) => x.allocation)
      if (!o) continue
      const a = buildAsset(g, l, 0, o, false)
      a.details.auth = 'verified'
      expect(Math.max(quickValue(a), auctionTypical(a)) / (o.price + o.trip), l.id).toBeLessThan(1)
    }
  })
})

describe('Bottles and art are not serviced', () => {
  it('hides Service It on wine, spirits and art, and never sends a bottle to a minor', () => {
    const g = rich()
    const wine = bought(g, 'dom-perignon-vintage', 'boutique')
    const nodes = luxuryAssetNodes(g, wine) ?? []
    expect(nodes.some((n) => n.id === `lux-service-${wine.id}`)).toBe(false)
    wine.condition = 60
    expect((luxuryAssetNodes(g, wine) ?? []).some((n) => n.id === `lux-service-${wine.id}`)).toBe(false)
    const watch = bought(g, 'cartier-tank', 'boutique')
    watch.condition = 60
    expect((luxuryAssetNodes(g, watch) ?? []).some((n) => n.id === `lux-service-${watch.id}`)).toBe(true)

    const teen = createPerson(g, { relation: 'child', age: 15, relationship: 80 })
    const adult = createPerson(g, { relation: 'child', age: getCountry('us').drinkingAge + 1, relationship: 80 })
    const gift = (luxuryAssetNodes(g, wine) ?? []).find((n) => n.id === `lux-gift-${wine.id}`) as MenuGroup
    const who = gift.children(g).map((n) => n.id)
    expect(who.some((id) => id.endsWith(teen.id))).toBe(false)
    expect(who.some((id) => id.endsWith(adult.id))).toBe(true)
    const watchGift = (luxuryAssetNodes(g, watch) ?? []).find((n) => n.id === `lux-gift-${watch.id}`) as MenuGroup
    expect(watchGift.children(g).some((n) => n.id.endsWith(teen.id))).toBe(true)
  })
})

describe('Joy is bounded', () => {
  it('only the first few outings a year lift your mood', () => {
    const g = rich()
    const pieces = ['cartier-tank', 'omega-speedmaster', 'rolex-datejust', 'longines-conquest', 'tag-heuer-carrera', 'seiko-5-sports'].map((id) => bought(g, id, 'boutique'))
    g.character.stats.happiness = 10
    let runs = 0
    for (const a of pieces) {
      const enjoy = (luxuryAssetNodes(g, a) ?? []).find((n) => n.id === `lux-enjoy-${a.id}`) as MenuAction
      for (let k = 0; k < 2; k++) {
        enjoy.run(g)
        runs += 1
      }
    }
    g.queue = []
    expect(runs).toBe(12)
    // four joyful outings of at most 6 each, whatever else the dice did
    expect(g.character.stats.happiness).toBeLessThanOrEqual(10 + 4 * 6 + 4)
  })
})

describe('Family use', () => {
  it('the first thing you share warms a relative, the tenth does not farm trust', () => {
    const g = rich()
    const kid = createPerson(g, { relation: 'child', age: 25, relationship: 40 })
    const pieces = ['cartier-tank', 'omega-speedmaster', 'rolex-datejust', 'longines-conquest', 'tag-heuer-carrera', 'seiko-5-sports'].map((id) => bought(g, id, 'boutique'))
    for (const a of pieces) grantAccess(g, a, kid)
    expect(kid.relationship).toBe(41)
  })

  it('a minor who is old enough to drive is still taken by the driver in a supercar, so it never crashes', () => {
    let crashes = 0
    let uses = 0
    for (let seed = 1; seed <= 60; seed++) {
      const g = rich(5e9, 'us', 2026, seed)
      hireStaff(g, 'chauffeur', { name: 'Jeeves Penny', gender: 'male', hiredAge: 40, skill: 1, quirk: 'x' })
      const car = bought(g, 'ferrari-296-gtb', 'boutique')
      const teen = createPerson(g, { relation: 'child', age: 17, relationship: 90, traits: ['reckless'] })
      expect(getCountry('us').drivingAge).toBeLessThanOrEqual(17)
      expect(grantAccess(g, car, teen)).toBe(true)
      g.character.age = 45
      for (let y = 0; y < 12; y++) {
        g.queue = []
        teen.age = 17
        yearlyFamilyUse(g)
        crashes += g.queue.filter((m) => m.kind === 'choice' && String(m.scriptId).includes('crash')).length
        uses += (teen.data.fu as { uses?: number } | undefined)?.uses ? 1 : 0
        g.year = 2026
      }
    }
    expect(uses).toBeGreaterThan(0)
    expect(crashes).toBe(0)
  })
})
