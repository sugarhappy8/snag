import { describe, expect, it } from 'vitest'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, readBiz, type Statement } from '../src/game/business/state'
import { ownerKey } from '../src/game/special/common'
import {
  foundUnderground,
  fundUnderground,
  hireUnderworldCrew,
  launderingFronts,
  launderUnderworld,
  tradeUnderground,
  undergroundQuote,
  underworldMenu,
  underworldView,
  yearlyUnderworld,
} from '../src/game/underworld'
import type { Asset, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function game(seed = 1, money = 2_000_000): GameState {
  const g = makeTestGame(seed, { age: 35, money, countryId: 'us', city: 'Chicago' })
  g.log = [{ age: 35, year: g.year, entries: [] }]
  return g
}

function stateRecord(g: GameState): Record<string, Json> {
  const value = g.flags['special.underworld']
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('missing underworld state')
  return value
}

function found(g: GameState, name = 'Night Orchard'): void {
  expect(foundUnderground(g, name)).toBe(true)
  g.queue = []
}

function findNode(g: GameState, id: string, nodes: MenuNode[] = underworldMenu.children(g)): MenuNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.type === 'menu') {
      const nested = findNode(g, id, node.children(g))
      if (nested) return nested
    }
  }
  return undefined
}

function action(g: GameState, id: string): MenuAction {
  const node = findNode(g, id)
  if (!node || node.type !== 'action') throw new Error(`missing action ${id}`)
  return node
}

function statement(year: number, revenue: number): Statement {
  return {
    year, demand: 100, sold: 100, produced: 100, spoiled: 0, price: revenue / 100,
    revenue, salesTax: 0, netRevenue: revenue, cogs: 0, wages: 0, keyStaff: 0,
    rent: 0, marketing: 0, interest: 0, upkeep: 0, other: 0, otherIncome: 0,
    ownerPay: 0, pbt: revenue, corpTax: 0, net: revenue, cashErosion: 0, cycle: 1,
    openFraction: 1, employees: 2,
  }
}

function addFront(
  g: GameState,
  industry: 'restaurant' | 'bank' | 'onlineBank' | 'investmentFirm' = 'restaurant',
  opts: { year?: number; revenue?: number; share?: number; name?: string } = {},
): Asset {
  const b = newBiz(g, industry, 'us', 'Chicago', {
    cash: 100_000,
    share: opts.share ?? 1,
    last: statement(opts.year ?? g.year - 1, opts.revenue ?? 5_000_000),
  })
  const asset = createBusinessAsset(g, opts.name ?? `${industry} front`, b, 100_000)
  g.assets.push(asset)
  return asset
}

function expectFinite(value: unknown): void {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
  else if (Array.isArray(value)) for (const item of value) expectFinite(item)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) expectFinite(item)
}

describe('fictional underworld state and gates', () => {
  it('is owner-scoped and its read view is pure', () => {
    const g = game()
    found(g)
    const raw = JSON.stringify(g.flags['special.underworld'])
    const view = underworldView(g)
    view.dirtyCash = 999_999
    view.ledger.push('tampered')
    expect(JSON.stringify(g.flags['special.underworld'])).toBe(raw)

    g.character.id = 'heir'
    expect(underworldView(g)).toMatchObject({ name: '', dirtyCash: 0, inventory: 0, premiumInventory: 0, scale: 1 })
    const before = JSON.stringify(g)
    yearlyUnderworld(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(fundUnderground(g, 1_000)).toBe(false)
  })

  it('normalizes malformed save data to finite bounded plain state', () => {
    const g = game()
    g.flags['special.underworld'] = {
      owner: ownerKey(g), v: 999, dirtyCash: Number.POSITIVE_INFINITY, heat: 900,
      inventory: -50, premiumInventory: 9e12, name: ' <Bad\u0000 Syndicate> ',
      founded: Number.NaN, scale: 0, segment: 'invalid', lastYear: 9e12,
      lastRevenue: Number.NaN, lastCosts: -4,
      crew: [
        { role: 'operations', skill: 9e9, salary: Number.NaN },
        { role: 'operations', skill: 1, salary: 1 },
        { role: 'distribution', skill: -3, salary: 9e9 },
        { role: 'controller', skill: 55, salary: 40_000 },
        { role: 'fake', skill: 100, salary: 0 },
      ],
      ledger: Array.from({ length: 12 }, (_, i) => `entry-${i}-${'x'.repeat(200)}`),
    } as unknown as Json
    const raw = JSON.stringify(g.flags['special.underworld'])
    const view = underworldView(g)
    expect(view).toMatchObject({
      v: 1, dirtyCash: 0, heat: 100, inventory: 0, premiumInventory: 1_000_000,
      name: 'Bad Syndicate', founded: g.year, scale: 1, segment: 'street',
      lastYear: g.year - 1, lastRevenue: 0, lastCosts: 0,
    })
    expect(view.crew.map((member) => member.role)).toEqual(['operations', 'distribution', 'controller'])
    expect(view.crew[0]).toMatchObject({ skill: 100, salary: 30_000 })
    expect(view.crew[1]).toMatchObject({ skill: 0, salary: 150_000 })
    expect(view.ledger).toHaveLength(8)
    expect(view.ledger.every((line) => line.length <= 180)).toBe(true)
    expectFinite(view)
    expect(JSON.stringify(g.flags['special.underworld'])).toBe(raw)
  })

  it('moves startup and contributed money exactly once without creating bank cash', () => {
    const g = game(2, 200_000)
    expect(foundUnderground(g, ' <Night\u0000 Orchard> ')).toBe(true)
    expect(g.character.money).toBe(150_000)
    expect(underworldView(g)).toMatchObject({ name: 'Night Orchard', dirtyCash: 50_000 })
    const afterFound = JSON.stringify(g)
    expect(foundUnderground(g, 'Replay')).toBe(false)
    expect(JSON.stringify(g)).toBe(afterFound)

    expect(fundUnderground(g, .4)).toBe(false)
    expect(fundUnderground(g, 10_000.4)).toBe(true)
    expect(g.character.money).toBe(140_000)
    expect(underworldView(g).dirtyCash).toBe(60_000)
    expect(g.character.money + underworldView(g).dirtyCash).toBe(200_000)
  })

  it('revalidates age, life and prison on direct and stale menu actions', () => {
    for (const mode of ['minor', 'dead', 'prison'] as const) {
      const g = game(3)
      if (mode === 'minor') g.character.age = 17
      if (mode === 'dead') g.character.alive = false
      if (mode === 'prison') g.character.prison = {} as never
      const before = JSON.stringify(g)
      expect(foundUnderground(g, 'Blocked')).toBe(false)
      expect(tradeUnderground(g, 'street', true)).toBe(false)
      expect(JSON.stringify(g)).toBe(before)
    }

    const g = game(4)
    found(g)
    const staleTrade = action(g, 'underworld.trade.street.buy')
    const staleFund = action(g, 'underworld.fund')
    g.character.prison = {} as never
    const before = JSON.stringify(g)
    staleTrade.run(g)
    staleFund.run(g, '10000')
    expect(hireUnderworldCrew(g, 'operations')).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('keeps quotes pure and makes a same-year buy/sell loop strictly lossy', () => {
    const g = game(5, 500_000)
    const beforeQuote = JSON.stringify(g)
    const quote = undergroundQuote(g, 'street')
    expect(quote.sell).toBeLessThan(quote.buy)
    expect(undergroundQuote(g, 'street')).toEqual(quote)
    expect(JSON.stringify(g)).toBe(beforeQuote)

    const opening = g.character.money + underworldView(g).dirtyCash
    for (let i = 0; i < 3; i++) {
      expect(tradeUnderground(g, 'street', true)).toBe(true)
      expect(tradeUnderground(g, 'street', false)).toBe(true)
    }
    expect(g.yearActions['underworld.trade']).toBe(6)
    expect(g.character.money + underworldView(g).dirtyCash).toBe(opening - 3 * (quote.buy - quote.sell))
    const capped = JSON.stringify(g)
    expect(tradeUnderground(g, 'street', true)).toBe(false)
    expect(JSON.stringify(g)).toBe(capped)
  })

  it('makes crew hiring one-shot per role and preserves the shared action cap', () => {
    const g = game(6)
    found(g)
    const before = underworldView(g).dirtyCash
    expect(hireUnderworldCrew(g, 'operations')).toBe(true)
    expect(underworldView(g).dirtyCash).toBe(before - 5_000)
    const replay = JSON.stringify(g)
    expect(hireUnderworldCrew(g, 'operations')).toBe(false)
    expect(JSON.stringify(g)).toBe(replay)
    expect(hireUnderworldCrew(g, 'distribution')).toBe(true)
    expect(hireUnderworldCrew(g, 'controller')).toBe(true)
    expect(g.yearActions['underworld.hire']).toBe(3)
    expect(underworldView(g).crew.map((member) => member.role)).toEqual(['operations', 'distribution', 'controller'])
    expect(hireUnderworldCrew(g, 'invalid' as never)).toBe(false)
  })

  it('rechecks the ultra-rich gate on a stale trade and segment action', () => {
    const g = game(7, 6_000_000)
    found(g)
    const privateBuy = action(g, 'underworld.trade.private.buy')
    const privateSegment = action(g, 'underworld.segment.private')
    g.character.money = 0
    const before = JSON.stringify(g)
    privateBuy.run(g)
    privateSegment.run(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(underworldView(g).segment).toBe('street')
  })
})

describe('fictional underworld annual economy', () => {
  function scaledOperation(lifeId: string, segment: 'street' | 'private', staffed: boolean): GameState {
    const g = game(17, segment === 'private' ? 10_000_000 : 2_000_000)
    g.lifeId = lifeId
    found(g)
    const raw = stateRecord(g)
    raw.dirtyCash = segment === 'private' ? 10_000_000 : 5_000_000
    raw.scale = 4
    raw.segment = segment
    raw.heat = 0
    raw.inventory = 0
    raw.premiumInventory = 0
    raw.crew = staffed ? [
      { role: 'operations', skill: 90, salary: 39_000 },
      { role: 'distribution', skill: 90, salary: 39_000 },
      { role: 'controller', skill: 90, salary: 39_000 },
    ] : []
    g.year += 1
    g.character.age += 1
    return g
  }

  it('lets a skilled scale-four street crew outperform the no-staff default in a good non-police year, without guaranteeing profit', () => {
    const staffed = scaledOperation('underworld-profit-2', 'street', true)
    const solo = scaledOperation('underworld-profit-2', 'street', false)
    const badMarket = scaledOperation('underworld-loss-0', 'street', true)
    const staffedOpening = underworldView(staffed).dirtyCash
    const soloOpening = underworldView(solo).dirtyCash
    const badOpening = underworldView(badMarket).dirtyCash

    yearlyUnderworld(staffed)
    yearlyUnderworld(solo)
    yearlyUnderworld(badMarket)

    const staffedYear = underworldView(staffed)
    const soloYear = underworldView(solo)
    const badYear = underworldView(badMarket)
    expect(staffed.character.prison).toBeNull()
    expect(staffedYear.lastRevenue).toBeGreaterThan(staffedYear.lastCosts)
    expect(staffedYear.dirtyCash - staffedOpening).toBeGreaterThan(soloYear.dirtyCash - soloOpening)
    expect(staffedYear.lastCosts).toBeGreaterThan(500_000) // meaningful payroll and working capital
    expect(staffedYear.heat).toBeGreaterThan(15)
    expect(badYear.lastRevenue).toBeLessThan(badYear.lastCosts)
    expect(badYear.dirtyCash).toBeLessThan(badOpening)
  })

  it('gives a staffed private enterprise profitable growth when its wealthy owner funds the risk', () => {
    const g = scaledOperation('underworld-private-1', 'private', true)
    const opening = underworldView(g).dirtyCash
    yearlyUnderworld(g)
    const result = underworldView(g)
    expect(g.character.prison).toBeNull()
    expect(result.lastCosts).toBeGreaterThan(2_000_000)
    expect(result.lastRevenue).toBeGreaterThan(result.lastCosts)
    expect(result.dirtyCash).toBeGreaterThan(opening)
    expect(result.heat).toBeGreaterThan(10)
  })

  it('does not backfill before founding and books any fiscal year only once', () => {
    const g = game(11)
    found(g)
    const bank = g.character.money
    const treasury = underworldView(g).dirtyCash
    yearlyUnderworld(g)
    expect(underworldView(g)).toMatchObject({ lastYear: g.year - 1, lastRevenue: 0, lastCosts: 0, dirtyCash: treasury })
    expect(g.character.money).toBe(bank)
    const first = JSON.stringify(g)
    yearlyUnderworld(g)
    expect(JSON.stringify(g)).toBe(first)

    g.year += 1
    g.character.age += 1
    yearlyUnderworld(g)
    expect(underworldView(g).lastYear).toBe(g.year - 1)
    expect(g.character.money).toBe(bank)
    expectFinite(underworldView(g))
    const second = JSON.stringify(g)
    yearlyUnderworld(g)
    expect(JSON.stringify(g)).toBe(second)
  })

  it('advances the guard while imprisoned, pauses operations, and cannot replay after release', () => {
    const g = game(12)
    found(g)
    g.year += 1
    g.character.age += 1
    g.character.prison = {} as never
    const before = underworldView(g)
    yearlyUnderworld(g)
    expect(underworldView(g)).toMatchObject({ lastYear: g.year - 1, dirtyCash: before.dirtyCash, lastRevenue: 0, lastCosts: 0 })
    g.character.prison = null
    const released = JSON.stringify(g)
    yearlyUnderworld(g)
    expect(JSON.stringify(g)).toBe(released)
    g.year += 1
    g.character.age += 1
    yearlyUnderworld(g)
    expect(underworldView(g).lastYear).toBe(g.year - 1)
  })

  it('never runs or normalizes a dead character profile', () => {
    const g = game(13)
    found(g)
    g.year += 1
    g.character.alive = false
    const before = JSON.stringify(g)
    yearlyUnderworld(g)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('persists a normalized future annual guard so a malformed save can recover next year', () => {
    const g = game(14)
    found(g)
    stateRecord(g).lastYear = 9e12
    yearlyUnderworld(g)
    expect(stateRecord(g).lastYear).toBe(g.year - 1)
    g.year += 1
    g.character.age += 1
    yearlyUnderworld(g)
    expect(underworldView(g).lastYear).toBe(g.year - 1)
  })

  it('pauses private production and sales after wealth falls below the ultra-rich gate', () => {
    const g = game(15, 6_000_000)
    found(g)
    action(g, 'underworld.segment.private').run(g)
    const raw = stateRecord(g)
    raw.dirtyCash = 200_000
    raw.premiumInventory = 4
    raw.heat = 0
    g.character.money = 0
    g.year += 1
    g.character.age += 1
    yearlyUnderworld(g)
    const view = underworldView(g)
    expect(view).toMatchObject({ segment: 'private', dirtyCash: 200_000, premiumInventory: 4, lastRevenue: 0, lastCosts: 0 })
    expect(view.ledger.at(-1)).toMatch(/inaccessible.*paused/i)
  })
})

describe('abstract financial-front conversion', () => {
  it('only lists current majority-owned non-financial fronts with immediate prior-year sales', () => {
    const g = game(21)
    found(g)
    const valid = addFront(g, 'restaurant', { name: 'Current Cafe' })
    addFront(g, 'restaurant', { name: 'Stale Cafe', year: g.year - 2 })
    addFront(g, 'restaurant', { name: 'Minority Cafe', share: .5 })
    addFront(g, 'restaurant', { name: 'No Sales Cafe', revenue: 0 })
    addFront(g, 'bank')
    addFront(g, 'onlineBank')
    addFront(g, 'investmentFirm')
    expect(launderingFronts(g).map((asset) => asset.id)).toEqual([valid.id])
    const menu = findNode(g, 'underworld.launder')
    expect(menu?.type).toBe('menu')
    if (menu?.type === 'menu') expect(menu.children(g).map((node) => node.id)).toEqual([`underworld.front.${valid.id}`])
  })

  it('revalidates a captured front after sale, dilution, or year rollover', () => {
    for (const mode of ['sold', 'diluted', 'staleYear'] as const) {
      const g = game(22)
      found(g)
      const front = addFront(g)
      const staleAction = action(g, `underworld.front.${front.id}`)
      if (mode === 'sold') g.assets = g.assets.filter((asset) => asset.id !== front.id)
      if (mode === 'diluted') bizOf(g, front).share = .5
      if (mode === 'staleYear') g.year += 1
      const before = JSON.stringify(g)
      staleAction.run(g)
      expect(JSON.stringify(g), mode).toBe(before)
      expect(g.yearActions['underworld.launder'], mode).toBeUndefined()
    }
  })

  it('converts at most 65% into company funds, never personal cash, and cannot replay', () => {
    const g = game(23)
    found(g)
    expect(fundUnderground(g, 500_000)).toBe(true)
    const front = addFront(g, 'restaurant', { revenue: 10_000_000 })
    const beforePlayer = g.character.money
    const beforeDirty = underworldView(g).dirtyCash
    const beforeCompany = readBiz(g, front).cash
    expect(launderUnderworld(g, front.id)).toBe(true)
    expect(g.character.money).toBe(beforePlayer)
    expect(underworldView(g).dirtyCash).toBe(beforeDirty - 250_000)
    expect(readBiz(g, front).cash - beforeCompany).toBeGreaterThanOrEqual(0)
    expect(readBiz(g, front).cash - beforeCompany).toBeLessThanOrEqual(Math.floor(250_000 * .65))
    expect(g.yearActions['underworld.launder']).toBe(1)
    const after = JSON.stringify(g)
    expect(launderUnderworld(g, front.id)).toBe(false)
    expect(JSON.stringify(g)).toBe(after)
  })

  it('keeps all menu copy fictional and avoids operational instructions', () => {
    const g = game(24)
    found(g)
    addFront(g)
    const text = [underworldMenu.subtitle, underworldMenu.header?.(g)]
    for (const node of underworldMenu.children(g)) {
      if (node.type === 'menu') text.push(node.label, node.header?.(g))
      else if (node.type === 'action') text.push(node.label, typeof node.subtitle === 'function' ? node.subtitle(g) : node.subtitle)
    }
    const copy = text.join(' ')
    expect(copy).toMatch(/fictional|abstract/i)
    expect(copy).not.toMatch(/recipe|dosage|supplier address|bank routing|concealment method/i)
  })
})
