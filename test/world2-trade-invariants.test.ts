import { afterEach, describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { economyOf, economyState, ensureEconomy, yearlyEconomy } from '../src/game/economy'
import { normalizeCountry, storeEconomy, type CountryEconomy } from '../src/game/economy/model'
import { countryTrade, normalizeTrade, sectorTrade, TRADE_INPUTS } from '../src/game/economy/trade'
import { economyMenu } from '../src/game/economy/menu'
import { HISTORY_YEARS } from '../src/game/economy/focus'
import { createPerson } from '../src/game/people'
import { LOCAL_SNAPSHOT_BUDGET, loadSnapshot, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot, timeStops, type SnapshotBackend } from '../src/game/save'
import { TIME_MACHINE_STOPS } from '../src/game/timeMachine'
import { COUNTRIES } from '../src/game/world'
import type { GameState, Json, MenuNode } from '../src/game/types'

const validCountries = new Set(COUNTRIES.map(c => c.id))

function fixture(): GameState {
  const g = makeTestGame(437, { age: 30, money: 123456 })
  g.lifeId = 'world2-trade-invariants'
  g.year = 2030
  g.log = [{ age: 30, year: 2030, entries: [] }]
  ensureEconomy(g)
  return g
}

function next(g: GameState): void {
  g.year++; g.character.age++
  g.yearActions = {}
  yearlyEconomy(g)
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

function assertNetwork(country: string, e: CountryEconomy): void {
  const network = e.tradeNetwork
  expect(network.v).toBe(1)
  expect(network.year).toBe(e.year)
  for (const input of TRADE_INPUTS) {
    const row = network.inputs[input]
    expect(row.routes.length).toBeLessThanOrEqual(3)
    expect(new Set(row.routes.map(route => route.partner)).size).toBe(row.routes.length)
    if (row.routes.length) expect(row.routes.reduce((sum, route) => sum + route.share, 0)).toBeCloseTo(1, 5)
    for (const route of row.routes) {
      expect(validCountries.has(route.partner)).toBe(true)
      expect(route.partner).not.toBe(country)
      expect(route.share).toBeGreaterThanOrEqual(0)
      expect(route.share).toBeLessThanOrEqual(1)
    }
    for (const [key, low, high] of [
      ['dependence', 0, .85], ['availability', 0, 1], ['cost', .5, 2.5],
      ['tariff', 0, .6], ['restriction', 0, .8], ['fx', 0, .3], ['exportDemand', .4, 1.6],
    ] as const) {
      expect(Number.isFinite(row[key]), `${country}/${input}/${key}`).toBe(true)
      expect(row[key]).toBeGreaterThanOrEqual(low)
      expect(row[key]).toBeLessThanOrEqual(high)
    }
  }
}

afterEach(async () => {
  await snapshotWritesSettled()
  setSnapshotBackend(null)
})

describe('World Simulation 2.0: trade persistence and invariants', () => {
  it.each([1, 2])('upgrades version %i worlds without a trade network through pure metadata reads, not retroactive transactions', version => {
    const g = fixture(), raw = JSON.parse(JSON.stringify(g.flags.worldEconomy)) as Record<string, unknown>
    raw.v = version
    const countries = raw.countries as Record<string, Record<string, unknown>>
    for (const row of Object.values(countries)) delete row.tradeNetwork
    g.flags.worldEconomy = raw as Json
    const before = JSON.stringify(g)
    for (let i = 0; i < 4; i++) {
      const e = economyOf(g)
      assertNetwork('us', e)
      sectorTrade(e.tradeNetwork, 'industry', g.year)
      inspect(g, [economyMenu])
    }
    ensureEconomy(g); yearlyEconomy(g)
    expect(JSON.stringify(g)).toBe(before)
    next(g)
    expect(g.character.money).toBe(123456)
    expect(g.rng).toBe(437)
    expect(economyOf(g).tradeNetwork.year).toBe(2031)
  })

  it('reads immutable opening suppliers and produces the same routes regardless of country or route ordering', () => {
    const g = fixture(), opening = structuredClone(economyState(g)!.countries)
    opening.kr.sectors.technology.output = .08
    opening.kr.sectors.technology.costs = 2.1
    const reversed = Object.fromEntries(Object.entries(structuredClone(opening)).reverse())
    for (const e of Object.values(reversed)) for (const input of TRADE_INPUTS) e.tradeNetwork.inputs[input].routes.reverse()
    freeze(opening); freeze(reversed)
    for (const country of ['us', 'jp', 'de', 'ae']) {
      const ordinary = countryTrade(opening, country, 2031, opening[country].tradeNetwork)
      const reordered = countryTrade(reversed, country, 2031, reversed[country].tradeNetwork)
      expect(reordered).toEqual(ordinary)
      expect(normalizeTrade(JSON.parse(JSON.stringify(ordinary)), country, 2031)).toEqual(ordinary)
    }
  })

  it('reloading after every trade settlement and reordering countries preserves exact next-year world results', () => {
    const live = fixture()
    let reload = JSON.parse(JSON.stringify(live)) as GameState
    for (let year = 0; year < 12; year++) {
      const loaded = economyState(reload)!
      storeEconomy(reload, { ...loaded, countries: Object.fromEntries(Object.entries(loaded.countries).reverse()) })
      next(live); next(reload)
      expect(economyState(reload)).toEqual(economyState(live))
      for (const country of ['us', 'jp', 'kr', 'ae']) {
        const state = economyOf(live, country)
        expect(normalizeCountry(JSON.parse(JSON.stringify(state)), country, live.year)).toEqual(state)
      }
      reload = JSON.parse(JSON.stringify(reload)) as GameState
    }
    expect(live.character.money).toBe(123456)
    expect(live.rng).toBe(437)
    // 24 whole-world transitions with deep comparisons: sized for a 2-core CI runner.
  }, 60_000)

  it('keeps a 120-year international network bounded and deterministic through generational seed continuity', () => {
    const g = fixture(), replay = fixture()
    let transitionMs = 0, reloadMs = 0
    for (let year = 0; year < 120; year++) {
      if (year === 40 || year === 80) {
        // Heirs keep this existing family world; only the generation suffix changes.
        replay.generation++
        replay.lifeId = `world2-trade-invariants-g${replay.generation}`
        const reloadStarted = performance.now()
        replay.flags = JSON.parse(JSON.stringify(replay.flags))
        reloadMs += performance.now() - reloadStarted
      }
      const transitionStarted = performance.now()
      next(g); next(replay)
      transitionMs += performance.now() - transitionStarted
      if ([0, 39, 79, 119].includes(year)) {
        for (const [country, e] of Object.entries(economyState(g)!.countries)) assertNetwork(country, e)
      }
    }
    expect(economyState(replay)).toEqual(economyState(g))
    // A.K9: 16 years of history per country (it was 32); the 240 years of this life fill every row.
    expect(economyState(g)!.history.us).toHaveLength(HISTORY_YEARS)
    expect(Object.keys(economyState(g)!.countries)).toHaveLength(COUNTRIES.length)
    expect(JSON.stringify(g).length).toBeLessThan(3_000_000)
    console.info(`World2 trade benchmark: 240 annual world transitions ${transitionMs.toFixed(0)} ms (${(transitionMs / 240).toFixed(1)} ms each), two generational JSON reloads ${reloadMs.toFixed(0)} ms; save ${JSON.stringify(g).length} characters. Timing excludes assertions.`)
    // 240 whole-world transitions (timings are printed, not asserted): sized for a 2-core CI runner.
  }, 120_000)

  it('keeps ten exact trade-era Time Machine stops inside the unchanged browser-storage budget', async () => {
    const g = fixture()
    for (let i = 0; i < 30; i++) createPerson(g, { relation: 'friend', age: 20 + i, money: 1000 + i * 250 })
    const contents = new Map<string, string>()
    const usage = () => [...contents].reduce((sum, [key, value]) => sum + key.length + value.length + 'anotherlife.tm.'.length, 0)
    const backend: SnapshotBackend = {
      name: 'local',
      get: async keys => keys.map(key => contents.get(key) ?? null),
      put: async entries => { for (const [key, value] of entries) contents.set(key, value) },
      remove: async keys => { for (const key of keys) contents.delete(key) },
      keys: async () => [...contents.keys()],
      usage,
    }
    setSnapshotBackend(backend)
    startTimeline(g.lifeId, null)
    await snapshotWritesSettled()
    const snapshots = new Map<number, string>()
    for (let year = 0; year < 15; year++) {
      next(g)
      g.log.push({ age: g.character.age, year: g.year, entries: [] })
      snapshots.set(g.character.age, JSON.stringify(g))
      expect(await takeSnapshot(g)).toBe(true)
      expect(usage()).toBeLessThanOrEqual(LOCAL_SNAPSHOT_BUDGET)
      // The app commits JSON-safe clones; force reader normalization between stops
      // so semantically equal but noncanonical world frames cannot evade this test.
      Object.assign(g, JSON.parse(JSON.stringify(g)))
    }
    const stops = timeStops(g.lifeId)
    console.info(`World2 trade snapshots: ${stops.length} stops, ${[...contents.keys()].filter(key => key.includes('world.')).length} world frames, ${usage()} / ${LOCAL_SNAPSHOT_BUDGET} characters.`)
    expect(stops).toHaveLength(TIME_MACHINE_STOPS)
    expect(stops.map(stop => stop.age)).toEqual(Array.from({ length: 10 }, (_, i) => g.character.age - 9 + i))
    for (const stop of [stops[0], stops[4], stops[9]]) {
      const restored = await loadSnapshot(g.lifeId, stop.age)
      expect(JSON.stringify(restored)).toBe(snapshots.get(stop.age))
      const reference = JSON.parse(snapshots.get(stop.age)!) as GameState
      next(reference); next(restored!)
      expect(economyState(restored!)).toEqual(economyState(reference))
    }
  }, 30000)
})
