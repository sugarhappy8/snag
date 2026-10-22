import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTestGame } from './helpers'
import { createPerson } from '../src/game/people'
import { ensureEconomy, economyState, yearlyEconomy } from '../src/game/economy'
import { RIVAL_LIMIT } from '../src/game/economy/actors-state'
import { HISTORY_YEARS } from '../src/game/economy/focus'
import { createBusinessAsset, initialProduction, newBiz } from '../src/game/business/founding'
import { installManager, managerCandidate } from '../src/game/business/career'
import { formGroup, groupBiz } from '../src/game/business/conglomerate-actions'
import { groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { businessAssets, readBiz } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import * as resilience from '../src/game/business/supply-resilience'
import { initializeNpc, npcCompany, npcLife, startNpcCompany, yearlyNpcLife } from '../src/game/npc-lives'
import { saveNpcLife } from '../src/game/npc-state'
import { continueAsChild } from '../src/game/life'
import { getCountry } from '../src/game/world'
import type { GameState } from '../src/game/types'

afterEach(() => vi.restoreAllMocks())

function fixture(skill: number) {
  const g = makeTestGame(991, { age: 55, money: 1_000_000_000 })
  g.year = 2030; g.lifeId = 'world2-large-family'; g.log = [{ age: 55, year: 2030, entries: [] }]
  ensureEconomy(g)
  const ids: string[] = [], industries = ['cafe', 'manufacturing', 'solar', 'bank', 'investmentFirm'] as const
  for (let i = 0; i < 16; i++) {
    const country = ['us', 'jp', 'de', 'ae'][i % 4], city = getCountry(country).cities[0]
    const b = newBiz(g, industries[i % industries.length], country, city, { cash: 30_000_000, founded: 2025,
      outlets: [{ countryId: country, city, count: 3, opened: 2025 }] })
    b.production = initialProduction(g, b); b.valuation = 40_000_000
    installManager(g, b, { ...managerCandidate(g, b, skill), equity: .12 })
    const a = createBusinessAsset(g, `Family Division ${i + 1}`, b, 30_000_000)
    g.assets.push(a); ids.push(a.id)
  }
  expect(formGroup(g, ids, 'World Family Holdings')).toBe(true)
  const groupId = groupsOf(g)[0].core.id, group = liveGroup(g, groupId)!
  group.core.ceo = 'manager'; group.core.manager = { ...managerCandidate(g, groupBiz(g, group), skill), equity: .12 }
  // Keep the benchmark's fixed sixteen-company workload; autonomous creation has its own tests.
  group.core.autonomous = true; group.core.autoEquity = true; group.core.autoFound = false; saveGroup(g, group)
  let heirId = ''
  for (let i = 0; i < 60; i++) {
    const p = createPerson(g, { relation: i === 0 ? 'child' : 'friend', age: i === 0 ? 28 : 21 + i % 30,
      money: 4_000_000, occupation: 'Engineer', stats: { smarts: 70 }, relationship: 80, countryId: 'us' })
    const l = initializeNpc(g, p)
    l.ambition = 60; l.skill = 68; l.history = Array.from({ length: 24 }, (_, year) => `${2006 + year}: existing life record`)
    saveNpcLife(p, l)
    if (!i) heirId = p.id
    if (i > 0 && i % 9 === 0) expect(startNpcCompany(g, p, i % 2 ? 'cafe' : 'software')).toBe(true)
  }
  g.queue = []
  return { g, heirId, groupId }
}

interface Timing { macro: number; companies: number; people: number; json: number; turns: number }
function settle(g: GameState, timing: Timing): void {
  g.year++; g.character.age++; g.yearActions = {}
  g.log.push({ age: g.character.age, year: g.year, entries: [] })
  let started = performance.now(); yearlyEconomy(g); timing.macro += performance.now() - started
  started = performance.now(); yearlyBusinessImpl(g); timing.companies += performance.now() - started
  started = performance.now()
  for (const p of g.people) if (p.alive) { p.age++; yearlyNpcLife(g, p) }
  timing.people += performance.now() - started; timing.turns++
  // Exercise settled financial books; optional narrative choices are not this harness's workload.
  g.queue = []
}

function finiteTree(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (!value || typeof value !== 'object') return true
  return Object.values(value).every(finiteTree)
}

function difference(a: unknown, b: unknown, path = ''): string | undefined {
  if (Object.is(a, b)) return
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return `${path}: ${String(a)} != ${String(b)}`
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const changed = difference(left[key], right[key], `${path}.${key}`)
    if (changed) return changed
  }
}

function expectExactJson(actual: string, expected: string): void {
  expect(actual === expected, actual === expected ? undefined : difference(JSON.parse(actual), JSON.parse(expected)) ?? 'JSON property ordering changed').toBe(true)
}

function assertIntegrity(g: GameState, groupId: string): void {
  expect(finiteTree(g)).toBe(true)
  const world = economyState(g)!
  expect(world.pending.length).toBeLessThanOrEqual(2200)
  expect(world.receipts.length).toBeLessThanOrEqual(3000)
  expect(world.rivals.length).toBeLessThanOrEqual(RIVAL_LIMIT)
  expect(new Set(world.rivals.map(a => `${a.industry}|${a.scope}|${a.id}`)).size).toBe(world.rivals.length)
  expect(Object.values(world.history).every(rows => rows.length <= HISTORY_YEARS)).toBe(true)
  expect(world.rivals.every(a => a.history.length <= 6)).toBe(true)
  expect(new Set(g.people.map(p => p.id)).size).toBe(g.people.length)
  expect(new Set(g.assets.map(a => a.id)).size).toBe(g.assets.length)
  expect(groupsOf(g).find(group => group.core.id === groupId)?.members).toHaveLength(16)
  for (const a of businessAssets(g)) expect(readBiz(g, a).history.length).toBeLessThanOrEqual(10)
  for (const p of g.people) {
    const life = npcLife(p), company = npcCompany(p, g.year)
    if (life) expect(life.history.length).toBeLessThanOrEqual(24)
    if (company) {
      expect(company.b.history.length).toBeLessThanOrEqual(12)
      expect(g.assets.some(a => a.id === company.a.id)).toBe(false)
    }
  }
}

describe('World Simulation 2.0: representative large-family integrity and timings', () => {
  it.each([85, 95])('settles sixteen subsidiaries and sixty contacts with %i-rated CEOs across reloads and an heir without multiplying state', skill => {
    const scenarios = vi.spyOn(resilience, 'bestResilienceMove')
    const prepared = fixture(skill), timing: Timing = { macro: 0, companies: 0, people: 0, json: 0, turns: 0 }
    let live = prepared.g, reloaded = JSON.parse(JSON.stringify(live)) as GameState
    const originalContacts = live.people.map(p => p.id)
    expect(live.people.filter(p => npcCompany(p, live.year))).toHaveLength(6)
    for (let turn = 0; turn < 5; turn++) {
      if (turn === 3) {
        const previousWorld = JSON.stringify(live.flags.worldEconomy)
        live.character.alive = false; reloaded.character.alive = false
        live = continueAsChild(live, prepared.heirId); reloaded = continueAsChild(reloaded, prepared.heirId)
        expect(live.generation).toBe(2); expect(live.character.id).toBe(prepared.heirId)
        expect(JSON.stringify(live.flags.worldEconomy)).toBe(previousWorld)
        for (const id of originalContacts.filter(id => id !== prepared.heirId)) expect(live.people.filter(p => p.id === id)).toHaveLength(1)
      }
      settle(live, timing); settle(reloaded, timing)
      const started = performance.now(), json = JSON.stringify(live), reloadJson = JSON.stringify(reloaded)
      reloaded = JSON.parse(reloadJson) as GameState
      timing.json += performance.now() - started
      expectExactJson(reloadJson, json)
      expect(json.length).toBeLessThan(8_000_000)
      assertIntegrity(live, prepared.groupId)
    }
    const snapshot = JSON.stringify(live)
    yearlyEconomy(live); yearlyBusinessImpl(live)
    for (const p of live.people) if (p.alive) yearlyNpcLife(live, p)
    expectExactJson(JSON.stringify(live), snapshot)
    if (skill >= 90) {
      expect(scenarios.mock.calls.some(([, , , available]) => available > 0)).toBe(true)
      expect(scenarios.mock.results.some(result => result.type === 'return' && result.value !== null)).toBe(true)
    } else expect(scenarios).not.toHaveBeenCalled()
    const worldSize = JSON.stringify(live.flags.worldEconomy).length
    console.info(`World2 large-family benchmark: ${skill}-rated CEOs, 16 subsidiaries, 60 contacts, 6 initial NPC firms, 5 settled years and one heir. ${timing.turns} measured branches: macro ${(timing.macro / timing.turns).toFixed(1)} ms/year, businesses ${(timing.companies / timing.turns).toFixed(1)} ms/year, NPCs ${(timing.people / timing.turns).toFixed(1)} ms/year; JSON work ${timing.json.toFixed(0)} ms total. Save ${snapshot.length} chars (world ${worldSize}); ${economyState(live)!.rivals.length} persistent rivals; ${scenarios.mock.calls.length} resilience reviews.`)
    // Ten settled years of sixteen planner-run companies (timings are printed, not asserted):
    // sized for a 2-core CI runner.
  }, 600_000)
})
