import { describe, expect, it } from 'vitest'
import { isIndustryLegal } from '../src/game/data/markets'
import { simulateYear } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, readBiz } from '../src/game/business/state'
import { improveVenue, prepareVenueYear, setVenuePolicy, venueOwnerMenu, venueUpgradeCost, venueView, visitVenue } from '../src/game/business/venues'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, Json, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function venue(industry: 'casino' | 'nightclub' | 'stripClub' | 'bar' = 'nightclub', countryId = 'us') {
  const g = makeTestGame(20, { age: 30, money: 10_000_000, countryId, city: 'Chicago' })
  const b = newBiz(g, industry, countryId, 'Chicago', { cash: 2_000_000, price: 60, production: 20_000 })
  const a = createBusinessAsset(g, 'Test Venue', b, 2_000_000)
  g.assets.push(a)
  return { g, a, b: bizOf(g, a) }
}

function choice(x: ReturnType<typeof venue>): ChoiceModal {
  const event = x.g.queue.findLast((m) => m.kind === 'choice')
  if (!event || event.kind !== 'choice') throw new Error('Expected an owner conversation')
  return event
}

function answer(x: ReturnType<typeof venue>, id: string, modal = choice(x)): void {
  runScript(x.g, modal.scriptId!, id, modal.data, modal)
}

function inspect(g: ReturnType<typeof makeTestGame>, nodes: MenuNode[], depth = 0): void {
  for (const n of nodes) {
    n.visible?.(g)
    if (n.type === 'info') { if (typeof n.text === 'function') n.text(g); continue }
    if (n.type === 'heading') continue
    if (typeof n.subtitle === 'function') n.subtitle(g)
    n.disabledReason?.(g)
    if (n.type === 'action') { n.confirm?.(g); n.input?.defaultValue?.(g) }
    else if (depth < 4) { n.header?.(g); inspect(g, n.children(g), depth + 1) }
  }
}

describe('owned entertainment venues', () => {
  it('offers pure owner menus and normalizes malformed state without writing', () => {
    const x = venue('stripClub')
    x.a.details.venueOwner = { safety: NaN, hospitality: -10, welfare: 999, pending: { token: 'x', kind: 'fake' }, diary: [false, 'safe'] } as unknown as Json
    const before = JSON.stringify(x.g)
    expect(venueView(x.a).safety).toBe(55)
    expect(venueView(x.a).hospitality).toBe(0)
    expect(venueView(x.a).welfare).toBe(100)
    expect(venueView(x.a).pending).toBeNull()
    inspect(x.g, [venueOwnerMenu(x.a)])
    expect(JSON.stringify(x.g)).toBe(before)
  })

  it('creates a bounded playable owner conversation and consumes its replay token exactly once', () => {
    const x = venue('stripClub')
    visitVenue(x.g, x.a.id, 'performer')
    const event = choice(x), token = venueView(x.a).pending?.token
    expect(event.title).toMatch(/Backstage/)
    expect(token).toBeTruthy()
    const welfare = venueView(x.a).welfare, cash = readBiz(x.g, x.a).cash, personal = x.g.character.money
    answer(x, 'invest', event)
    expect(venueView(x.a).pending).toBeNull()
    expect(venueView(x.a).welfare).toBeGreaterThan(welfare)
    expect(readBiz(x.g, x.a).cash).toBe(cash - venueUpgradeCost(readBiz(x.g, x.a)))
    expect(readBiz(x.g, x.a).yearCosts).toBe(venueUpgradeCost(readBiz(x.g, x.a)))
    expect(x.g.character.money).toBe(personal)
    const settled = JSON.stringify(x.g)
    answer(x, 'invest', event)
    expect(JSON.stringify(x.g)).toBe(settled)
  })

  it('caps visits and paid improvements and never changes personal cash', () => {
    const x = venue(), personal = x.g.character.money, cash = x.b.cash
    for (let i = 0; i < 10; i++) {
      visitVenue(x.g, x.a.id, 'guest')
      if (venueView(x.a).pending) answer(x, 'listen')
    }
    expect(venueView(x.a).visits).toBe(6)
    for (let i = 0; i < 10; i++) improveVenue(x.g, x.a.id, 'safety')
    expect(readBiz(x.g, x.a).cash).toBe(cash - venueUpgradeCost(readBiz(x.g, x.a)) * 2)
    expect(readBiz(x.g, x.a).yearCosts).toBe(venueUpgradeCost(readBiz(x.g, x.a)) * 2)
    expect(x.g.character.money).toBe(personal)
  })

  it('requires an adult owner at a genuine local outlet, including when a pending reply is replayed after travel', () => {
    const x = venue()
    x.g.character.city = 'New York'
    visitVenue(x.g, x.a.id, 'guest')
    expect(venueView(x.a).pending).toBeNull()
    x.g.character.city = 'Chicago'
    visitVenue(x.g, x.a.id, 'guest')
    const event = choice(x), hospitality = venueView(x.a).hospitality
    x.g.character.countryId = 'jp'
    answer(x, 'listen', event)
    expect(venueView(x.a).hospitality).toBe(hospitality)
    expect(venueView(x.a).pending).not.toBeNull()
    x.g.character.countryId = 'us'; x.g.character.age = 17
    answer(x, 'invest', event); improveVenue(x.g, x.a.id, 'safety'); setVenuePolicy(x.g, x.a.id, 'members')
    expect(readBiz(x.g, x.a).cash).toBe(2_000_000)
    expect(venueView(x.a).policy).toBe('welcoming')
    x.g.character.age = 30
    // The rejected popup itself is one-shot. Reopening Owner Conversations presents the still
    // pending request with a fresh modal id, which can now be answered in a valid state.
    visitVenue(x.g, x.a.id, 'guest')
    answer(x, 'listen')
    expect(venueView(x.a).hospitality).toBeGreaterThan(hospitality)
  })

  it('rejects expired, forged, unsupported, and sold-venue choices without spending', () => {
    const x = venue()
    visitVenue(x.g, x.a.id, 'performer')
    expect(venueView(x.a).pending).toBeNull()
    visitVenue(x.g, x.a.id, 'guest')
    const event = choice(x)
    runScript(x.g, event.scriptId!, 'invest', { assetId: x.a.id, token: 'forged' }, event)
    answer(x, 'unknown', event)
    expect(readBiz(x.g, x.a).cash).toBe(2_000_000)
    x.g.year++
    answer(x, 'invest', event)
    expect(readBiz(x.g, x.a).cash).toBe(2_000_000)
    x.g.assets = []
    const before = JSON.stringify(x.a)
    answer(x, 'invest', event); improveVenue(x.g, x.a.id, 'safety'); visitVenue(x.g, x.a.id, 'guest')
    expect(JSON.stringify(x.a)).toBe(before)
  })

  it('revalidates current company cash for a paid choice and retains the request if unaffordable', () => {
    const x = venue()
    visitVenue(x.g, x.a.id, 'staff')
    const event = choice(x)
    bizOf(x.g, x.a).cash = 1
    answer(x, 'invest', event)
    expect(readBiz(x.g, x.a).cash).toBe(1)
    expect(venueView(x.a).pending).not.toBeNull()
    visitVenue(x.g, x.a.id, 'staff')
    answer(x, 'delegate')
    expect(venueView(x.a).pending).toBeNull()
  })

  it('blocks country-illegal venue actions, including inherited banned bars, and closes annual trading', () => {
    for (const [industry, country] of [['casino', 'sa'], ['nightclub', 'sa'], ['stripClub', 'cn'], ['bar', 'sa']] as const) {
      const x = venue(industry, country)
      expect(isIndustryLegal(country, industry)).toBe(false)
      const before = JSON.stringify(x.g)
      visitVenue(x.g, x.a.id, 'guest'); improveVenue(x.g, x.a.id, 'safety'); setVenuePolicy(x.g, x.a.id, 'members')
      expect(JSON.stringify(x.g)).toBe(before)
      prepareVenueYear(x.g, x.a, x.b, x.g.year)
      expect(x.b.openFraction).toBe(0)
      expect(simulateYear(x.g, x.b, x.g.year, 0).stmt.revenue).toBe(0)
    }
  })

  it('applies hospitality, deterioration and expiry once per fiscal year', () => {
    const x = venue()
    visitVenue(x.g, x.a.id, 'guest')
    const old = choice(x)
    x.g.year++
    prepareVenueYear(x.g, x.a, x.b, 2026)
    expect(venueView(x.a).pending).toBeNull()
    expect(venueView(x.a).lastYear).toBe(2026)
    expect(x.b.demandShock).not.toBe(1)
    const before = JSON.stringify(x.g)
    prepareVenueYear(x.g, x.a, x.b, 2026)
    expect(JSON.stringify(x.g)).toBe(before)
    answer(x, 'invest', old)
    expect(readBiz(x.g, x.a).yearCosts).toBe(0)
  })

  it('does not charge venue spending again when the corporate year settles', () => {
    const x = venue(), control = venue()
    improveVenue(x.g, x.a.id, 'safety')
    const paid = readBiz(x.g, x.a).yearCosts
    const result = simulateYear(x.g, bizOf(x.g, x.a), 2026, 0)
    const plain = simulateYear(control.g, bizOf(control.g, control.a), 2026, 0)
    expect(result.stmt.other - plain.stmt.other).toBe(paid)
    // A real deductible expense reduces tax; its cash impact is no more than the paid bill.
    expect(readBiz(control.g, control.a).cash - readBiz(x.g, x.a).cash).toBeLessThanOrEqual(paid + 1)
    expect(readBiz(control.g, control.a).cash - readBiz(x.g, x.a).cash).toBeGreaterThan(0)
  })

  it('keeps the pending replay token and owner state when a legacy business record normalizes', () => {
    const x = venue()
    visitVenue(x.g, x.a.id, 'staff')
    const state = venueView(x.a)
    x.a.details.v = -1
    bizOf(x.g, x.a)
    expect(venueView(x.a)).toEqual(state)
    const event = choice(x)
    answer(x, 'listen', event)
    expect(venueView(x.a).pending).toBeNull()
    const before = JSON.stringify(x.g)
    answer(x, 'listen', event)
    expect(JSON.stringify(x.g)).toBe(before)
  })
})
