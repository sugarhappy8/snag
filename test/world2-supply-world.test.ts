import { afterEach, describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { economyOf, economyState, ensureEconomy, industryConditions, yearlyEconomy } from '../src/game/economy'
import { ECONOMY_VERSION, initialCountry, normalizeCountry, SECTORS, STOCK_SECTORS, storeEconomy, type CountryEconomy, type Sector } from '../src/game/economy/model'
import { advanceCountry, worldConditions } from '../src/game/economy/simulation'
import { sectorSupply } from '../src/game/economy/supply'
import { economyMenu } from '../src/game/economy/menu'
import { loadSnapshot, memorySnapshotBackend, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import type { GameState, Json, MenuNode } from '../src/game/types'

const world = { growth: .02, demand: 1, supply: 0, rate: .04 }
const step = (old: CountryEconomy) => advanceCountry(old, 'us', old.year + 1, 'world2-supply-acceptance', world)

function neutralCountry(): CountryEconomy {
  const e = initialCountry('us', 2030)
  e.skills = .8
  e.unemployment = .06
  return e
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function inspect(g: GameState, nodes: MenuNode[]): void {
  for (const node of nodes) {
    if ('subtitle' in node && typeof node.subtitle === 'function') node.subtitle(g)
    if ('header' in node) node.header?.(g)
    if (node.type === 'menu') inspect(g, node.children(g))
  }
}

afterEach(async () => {
  await snapshotWritesSettled()
  setSnapshotBackend(null)
})

describe('World Simulation 2.0: persistent supplier constraints', () => {
  it('an energy output shortage reduces manufacturing and transport output and raises actual input costs', () => {
    const base = neutralCountry(), shock = structuredClone(base)
    shock.sectors.energy.output = .15
    const normal = step(base), disrupted = step(shock)
    for (const sector of ['industry', 'logistics'] as const) {
      expect(disrupted.sectors[sector].output).toBeLessThan(normal.sectors[sector].output)
      expect(disrupted.sectors[sector].availability).toBeLessThan(normal.sectors[sector].availability)
      expect(disrupted.sectors[sector].backlog).toBeGreaterThan(normal.sectors[sector].backlog)
      expect(disrupted.sectors[sector].costs).toBeGreaterThan(normal.sectors[sector].costs)
    }
    expect(disrupted.sectors.essentials.costs).toBeGreaterThan(normal.sectors.essentials.costs)
    expect(disrupted.inflation).toBeGreaterThan(normal.inflation)
  })

  it('supplier damage travels onward to food and retail even after the original energy outage ends', () => {
    const base = neutralCountry(), shock = structuredClone(base)
    shock.sectors.energy.output = .15
    shock.sectors.energy.costs = 2.2
    const normal = step(base), disrupted = step(shock)
    // Restore the original energy source in both branches. Continuing damage must now
    // arrive from the previous year's manufacturers/transporters and depleted buffers.
    normal.sectors.energy = { ...normal.sectors.energy, output: 1, demand: 1, costs: 1 }
    disrupted.sectors.energy = { ...normal.sectors.energy }
    const recoveredSource = step(disrupted), control = step(normal)
    for (const sector of ['essentials', 'consumer'] as const) {
      expect(recoveredSource.sectors[sector].output).toBeLessThan(control.sectors[sector].output)
      expect(recoveredSource.sectors[sector].costs).toBeGreaterThan(control.sectors[sector].costs)
      expect(recoveredSource.sectors[sector].backlog).toBeGreaterThan(control.sectors[sector].backlog)
    }
  })

  it('physical buffers cover an initial shortage, then deplete and refill only when supply returns', () => {
    const opening = neutralCountry()
    opening.sectors.energy.output = .6
    opening.sectors.industry.stock = .3
    const first = sectorSupply(opening, 'industry', 1, 1, 0, 1)
    expect(first.availability).toBe(1)
    expect(first.output).toBe(1)
    expect(first.stock).toBeLessThan(opening.sectors.industry.stock)
    opening.sectors.industry = { ...opening.sectors.industry, ...first }
    const second = sectorSupply(opening, 'industry', 1, 1, 0, 1)
    expect(second.stock).toBe(0)
    expect(second.output).toBeLessThan(first.output)
    opening.sectors.industry = { ...opening.sectors.industry, ...second }
    const depleted = sectorSupply(opening, 'industry', 1, 1, 0, 1)
    expect(depleted.output).toBeLessThan(second.output)
    opening.sectors.energy.output = 1
    const replenished = sectorSupply(opening, 'industry', 1, 1, 0, 1)
    const creditFrozen = sectorSupply(opening, 'industry', 1, 1, 0, .25)
    expect(replenished.output).toBe(1)
    expect(replenished.stock).toBeGreaterThan(depleted.stock)
    expect(replenished.stock).toBeGreaterThan(creditFrozen.stock)
  })

  it('qualified workers and available labor constrain delivered output, not just a descriptive indicator', () => {
    const qualified = neutralCountry(), unqualified = structuredClone(qualified), laborShortage = structuredClone(qualified)
    unqualified.skills = .3
    laborShortage.unemployment = .02
    const normal = sectorSupply(qualified, 'technology', 1, 1, 0, 1)
    const missingSkills = sectorSupply(unqualified, 'technology', 1, 1, 0, 1)
    const missingWorkers = sectorSupply(laborShortage, 'technology', 1, 1, 0, 1)
    expect(missingSkills.workforce).toBeLessThan(normal.workforce)
    expect(missingSkills.output).toBeLessThan(normal.output)
    expect(missingWorkers.workforce).toBeLessThan(normal.workforce)
    expect(missingWorkers.output).toBeLessThan(normal.output)
    expect(missingSkills.backlog).toBeGreaterThan(normal.backlog)
  })

  it('never records more output than available equipment, inputs, workers or orders can support', () => {
    const old = neutralCountry()
    old.skills = .2
    old.unemployment = .015
    for (const sector of SECTORS) {
      old.sectors[sector].stock = 0
      old.sectors[sector].output = .1
      old.sectors[sector].demand = 2
      old.sectors[sector].backlog = .4
    }
    for (const sector of SECTORS) for (const capacity of [0, .4, 1, 2]) {
      const result = sectorSupply(old, sector, 1, capacity, .6, .25)
      expect(result.output).toBeGreaterThanOrEqual(0)
      expect(result.output).toBeLessThanOrEqual(capacity * result.availability * result.workforce + 1e-12)
      expect(result.output).toBeLessThanOrEqual(1 + old.sectors[sector].backlog * .12)
      if (capacity === 0) expect(result.output).toBe(0)
    }
    const stopped = structuredClone(old)
    stopped.sectors.industry.output = 0
    expect(normalizeCountry(stopped, 'us', old.year).sectors.industry.output).toBe(0)
  })

  it('services never accumulate stored output, including when an imported save supplies bogus stocks', () => {
    const old = neutralCountry()
    const services = SECTORS.filter(sector => !STOCK_SECTORS.includes(sector))
    for (const sector of services) old.sectors[sector].stock = 1000
    const normalized = normalizeCountry(old, 'us', old.year)
    const next = step(normalized)
    for (const sector of services) {
      expect(normalized.sectors[sector].stock).toBe(0)
      expect(sectorSupply(old, sector, 1, 1, .4, 1).stock).toBe(0)
      expect(next.sectors[sector].stock).toBe(0)
    }
  })

  it('supplier transitions read one immutable opening frame and do not depend on sector or country evaluation order', () => {
    const opening = neutralCountry()
    opening.sectors.energy.output = .2
    opening.sectors.industry.output = .6
    freeze(opening)
    const calculate = (order: readonly Sector[]) => Object.fromEntries(order.map(sector => [sector, sectorSupply(opening, sector, 1, 1, .15, .8)]))
    expect(calculate(SECTORS)).toEqual(calculate([...SECTORS].reverse()))
    const countries = freeze({ us: opening, jp: initialCountry('jp', 2030), de: initialCountry('de', 2030) })
    const shared = worldConditions(countries)
    const advance = (ids: string[]) => Object.fromEntries(ids.map(id => [id, advanceCountry(countries[id as keyof typeof countries], id, 2031, 'world2-order', shared)]))
    expect(advance(Object.keys(countries))).toEqual(advance(Object.keys(countries).reverse()))
    expect(opening.sectors.energy.output).toBe(.2)
  })

  it('normalizes v1 metadata without retroactive earnings, changed prices, RNG draws or writes from reads', () => {
    const g = makeTestGame(723, { age: 30, money: 23456 })
    g.year = 2030
    const legacy = structuredClone(neutralCountry()) as unknown as Record<string, unknown>
    const sectors = legacy.sectors as Record<string, Record<string, unknown>>
    for (const row of Object.values(sectors)) for (const field of ['availability', 'stock', 'backlog', 'output', 'workforce']) delete row[field]
    g.flags.worldEconomy = { v: 1, year: 2030, countries: { us: legacy }, previous: {}, history: {}, pending: [], policies: [], receipts: [] } as unknown as Json
    const before = JSON.stringify(g)
    const normalized = economyState(g)!
    expect(normalized.v).toBe(ECONOMY_VERSION)
    expect(normalized.countries.us.sectors.industry.availability).toBe(1)
    expect(normalized.countries.us.sectors.industry.output).toBe(1)
    expect(normalized.countries.us.priceScale).toBe(legacy.priceScale)
    for (let i = 0; i < 4; i++) {
      inspect(g, [economyMenu])
      economyOf(g); industryConditions(g, 'manufacturing')
    }
    ensureEconomy(g)
    yearlyEconomy(g)
    expect(JSON.stringify(g)).toBe(before)
    g.year++
    yearlyEconomy(g)
    expect(economyState(g)?.v).toBe(ECONOMY_VERSION)
    expect(g.character.money).toBe(23456)
    expect(g.rng).toBe(723)
  })

  it.each([['ao', 1996], ['hk', 1998], ['bd', 1996]] as const)('preserves authoritative %s %i historical extremes through normalization and replay', (country, year) => {
    const old = initialCountry(country, year - 1)
    const current = advanceCountry(old, country, year, 'world2-history', worldConditions({ [country]: old }))
    const normalized = normalizeCountry(JSON.parse(JSON.stringify(current)), country, year)
    expect(normalized).toEqual(current)
    if (country === 'ao') expect(current.rate).toBeGreaterThan(10)
    if (country === 'hk') expect(current.housingReturn).toBeLessThan(-.3)
    if (country === 'bd') expect(current.housingReturn).toBeGreaterThan(.2)
    const followingWorld = worldConditions({ [country]: current })
    expect(advanceCountry(normalized, country, year + 1, 'world2-history', followingWorld))
      .toEqual(advanceCountry(current, country, year + 1, 'world2-history', followingWorld))
  })

  it('keeps supplier buffers, backlogs and exact next-year results across version-2 Time Machine frames', async () => {
    const g = makeTestGame(912, { age: 30, money: 54321 })
    g.lifeId = 'world2-supply-snapshot'
    g.year = 2030
    g.log = [{ age: 30, year: 2030, entries: [] }]
    ensureEconomy(g)
    // Include both opening/closing frames and populated history, not only a newly
    // initialized world, so both v2 chunk formats must survive the snapshot.
    g.year++; g.character.age++
    g.log.push({ age: 31, year: 2031, entries: [] })
    yearlyEconomy(g)
    const state = economyState(g)!, country = structuredClone(state.countries.us)
    country.sectors.energy.output = .2
    country.sectors.industry.stock = .04
    country.sectors.consumer.backlog = .55
    storeEconomy(g, { ...state, countries: { ...state.countries, us: country } })
    const backend = memorySnapshotBackend()
    setSnapshotBackend(backend)
    startTimeline(g.lifeId, null)
    await snapshotWritesSettled()
    expect(await takeSnapshot(g)).toBe(true)
    expect((await backend.keys()).some(key => key.includes('world.'))).toBe(true)
    expect((await backend.keys()).some(key => key.includes('history.'))).toBe(true)
    const restored = await loadSnapshot(g.lifeId, 31)
    expect(restored).not.toBeNull()
    expect(restored!.flags.worldEconomy).toEqual(g.flags.worldEconomy)
    expect(restored!.character.money).toBe(54321)
    expect(restored!.rng).toBe(912)
    g.year++; restored!.year++
    yearlyEconomy(g); yearlyEconomy(restored!)
    expect(economyState(restored!)).toEqual(economyState(g))
  })
})
