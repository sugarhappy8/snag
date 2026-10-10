import { describe, expect, it } from 'vitest'
import { advanceRivals, applyEconomicRivals } from '../src/game/business/economic-actors'
import { buildCtx, marketDemand, marketKey } from '../src/game/business/competition-core'
import { familyId, rosterOf } from '../src/game/business/competition-roster'
import { emptyMarket } from '../src/game/business/competition-state'
import { marketCtxFor, marketScale, planFor } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import type { BizState } from '../src/game/business/state'
import { INDUSTRY_IDS, type Industry } from '../src/game/data/markets'
import { ensureEconomy, yearlyEconomy } from '../src/game/economy'
import { normalizeRivals, RIVAL_LIMIT, rivalActorKey, type RivalActor } from '../src/game/economy/actors-state'
import { economyState, initialCountry, storeEconomy } from '../src/game/economy/model'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import type { Json } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'

function fixture(year = 2031, industry: Industry = 'petCare') {
  const g = makeTestGame(493, { age: 35, countryId: 'us', city: 'New York', money: 1e9 })
  g.year = year
  const b = newBiz(g, industry, 'us', 'New York', { cash: 100_000_000, founded: year - 10, brand: 40, quality: 60 })
  const a = createBusinessAsset(g, 'Local Business', b, 1e6)
  g.assets.push(a)
  ensureEconomy(g)
  const opening = Object.fromEntries(COUNTRIES.map(c => [c.id, initialCountry(c.id, year - 1)]))
  return { g, b: a.details as unknown as BizState, a, opening }
}
function actorFor(industry: string, actors: RivalActor[]) { return actors.find(a => a.industry === industry)! }

describe('World 2: persistent canonical rivals', () => {
  it('old or malformed actor saves are bounded plain JSON without creating spendable resources', () => {
    expect(normalizeRivals(undefined, 2031)).toEqual([])
    const x = fixture(), initial = advanceRivals(x.g, x.opening, [], x.g.year)
    const a = actorFor('petCare', initial)
    const bad = { ...a, cash: Infinity, debt: -10, capacity: 99, strength: NaN, history: Array.from({ length: 20 }, (_, i) => ({ ...a, year: 2012 + i })) }
    const normalized = normalizeRivals([bad, bad, { ...bad, key: 'forged' }], 2031)
    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({ cash: .5, debt: 0, capacity: 3, strength: 1 })
    expect(normalized[0].history).toHaveLength(6)
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized)
  })

  it('annual transition is pure and independent of assets, contacts, country and actor iteration order', () => {
    const x = fixture()
    const other = createBusinessAsset(x.g, 'Components', newBiz(x.g, 'manufacturing', 'jp', 'Tokyo', { cash: 1e6 }), 1e6)
    x.g.assets.push(other)
    const initial = advanceRivals(x.g, x.opening, [], x.g.year - 1)
    const before = JSON.stringify(x.g), openingBefore = JSON.stringify(x.opening)
    const result = advanceRivals(x.g, x.opening, initial, x.g.year)
    const reversed = structuredClone(x.g)
    reversed.assets.reverse(); reversed.people.reverse()
    expect(advanceRivals(reversed, Object.fromEntries(Object.entries(x.opening).reverse()), [...initial].reverse(), x.g.year)).toEqual(result)
    expect(JSON.stringify(x.g)).toBe(before)
    expect(JSON.stringify(x.opening)).toBe(openingBefore)
    expect(advanceRivals(x.g, x.opening, result, x.g.year)).toEqual(result)
  })

  it('funded rivals expand and adopt, while supply-driven losses exhaust weak cash buffers', () => {
    const x = fixture(), prior = advanceRivals(x.g, x.opening, [], 2030)
    const actor = actorFor('petCare', prior)
    actor.cash = .01; actor.debt = 1; actor.adoption = .1
    const healthy = structuredClone(x.opening), crisis = structuredClone(x.opening)
    healthy.us.sectors.consumer.demand = 1.7
    healthy.us.sectors.consumer.costs = .8
    healthy.us.skills = .9
    const thriving = advanceRivals(x.g, healthy, prior.map(a => a.key === actor.key ? { ...a, cash: 2 } : a), 2031).find(a => a.key === actor.key)!
    expect(thriving.capacity).toBeGreaterThan(actor.capacity)
    expect(thriving.adoption).toBeGreaterThan(actor.adoption)
    crisis.us.sectors.consumer.availability = .15
    crisis.us.sectors.consumer.costs = 2.5
    crisis.us.credit = .2
    const failed = advanceRivals(x.g, crisis, prior, 2031).find(a => a.key === actor.key)!
    expect(failed.outcome).toBe('failed')
    expect(failed.strength).toBe(0)
    expect(failed.cause).toContain('exhausted')
    const reserved = advanceRivals(x.g, crisis, prior.map(a => a.key === actor.key ? { ...a, cash: 3 } : a), 2031).find(a => a.key === actor.key)!
    expect(reserved.outcome).toBe('distressed')
    expect(reserved.cash).toBeGreaterThan(0)
    const recoveredWorld = advanceRivals(x.g, healthy, [failed, ...prior.filter(a => a.key !== actor.key)], 2032)
    expect(recoveredWorld.find(a => a.key === actor.key)?.outcome).toBe('failed')
  })

  it('credit can fund a limited buffer and customer share pressure changes future operating results', () => {
    const x = fixture(), prior = advanceRivals(x.g, x.opening, [], 2030), actor = actorFor('petCare', prior)
    const crisis = structuredClone(x.opening)
    crisis.us.sectors.consumer.availability = .15
    actor.cash = .01; actor.debt = .1
    crisis.us.credit = .2
    const tight = advanceRivals(x.g, crisis, prior, 2031).find(a => a.key === actor.key)!
    crisis.us.credit = 1.5
    const lent = advanceRivals(x.g, crisis, prior, 2031).find(a => a.key === actor.key)!
    expect(tight.outcome).toBe('failed')
    expect(lent.outcome).not.toBe('failed')
    expect(lent.debt).toBeGreaterThan(actor.debt)
    const free = advanceRivals(x.g, x.opening, prior, 2031).find(a => a.key === actor.key)!
    const market = emptyMarket('us'); market.year = 2030; market.share = .8
    x.b.market = market as unknown as Json
    const squeezed = advanceRivals(x.g, x.opening, prior, 2031).find(a => a.key === actor.key)!
    expect(squeezed.cash).toBeLessThan(free.cash)
    expect(squeezed.strength).toBeLessThan(free.strength)
  })

  it('retains terminal failures when a market is left and revisited, without exceeding the actor cap', () => {
    const x = fixture(), prior = advanceRivals(x.g, x.opening, [], x.g.year), actor = actorFor('petCare', prior)
    actor.outcome = 'failed'; actor.strength = 0; actor.cash = 0
    x.g.assets = x.g.assets.filter(a => a.id !== x.a.id)
    const absent = advanceRivals(x.g, x.opening, prior, 2032)
    expect(absent.find(a => a.key === actor.key)).toMatchObject({ year: 2032, outcome: 'failed', strength: 0 })
    x.g.assets.push(x.a)
    const returned = advanceRivals(x.g, x.opening, absent, 2033)
    expect(returned.find(a => a.key === actor.key)).toMatchObject({ year: 2033, outcome: 'failed', strength: 0 })
    expect(returned.length).toBeLessThanOrEqual(RIVAL_LIMIT)
    const canonical = rosterOf(familyId(x.g.lifeId), actor.industry, actor.scope).byId.get(actor.id)!
    expect(advanceRivals(x.g, x.opening, returned, canonical.exit).some(a => a.key === actor.key)).toBe(false)
  })

  it('uses the same rival identity, reduces total rival pull and never mutates cached market rows', () => {
    const x = fixture(), actors = advanceRivals(x.g, x.opening, [], x.g.year), actor = actorFor('petCare', actors)
    const { dRef, fieldP } = marketScale(x.b.industry, x.b.countryId)
    const base = buildCtx(x.g.lifeId, x.b.industry, marketKey(x.b), x.g.year, null, dRef, fieldP)
    const before = JSON.stringify(base), rival = base.rivals.find(r => r.id === actor.id)!
    actor.strength = .2
    storeEconomy(x.g, { ...economyState(x.g)!, rivals: actors })
    const changed = applyEconomicRivals(x.g, base)
    expect(changed.rivals.map(r => r.id)).toEqual(base.rivals.map(r => r.id))
    expect(changed.rivals.find(r => r.id === actor.id)!.pull).toBeCloseTo(rival.pull * .2)
    expect(changed.F).toBeLessThan(base.F)
    expect(marketDemand(changed, 1000).units).toBeGreaterThan(marketDemand(base, 1000).units)
    expect(JSON.stringify(base)).toBe(before)
    const market = emptyMarket('us'); market.gone = [actor.id]
    x.b.market = market as unknown as Json
    expect(marketCtxFor(x.g, x.b, x.g.year).rivals.some(r => r.id === actor.id)).toBe(false)
    expect(advanceRivals(x.g, x.opening, actors, x.g.year + 1).some(a => a.key === actor.key)).toBe(false)
  })

  it('prior fiscal forecasts use previous actors and repeated menu reads neither seed nor mutate them', () => {
    const x = fixture(), before = JSON.stringify(x.g)
    for (let i = 0; i < 3; i++) planFor(x.g, x.b, x.g.year)
    expect(JSON.stringify(x.g)).toBe(before)
    expect(economyState(x.g)!.rivals).toEqual([])
    const prior = advanceRivals(x.g, x.opening, [], 2030), current = structuredClone(prior).map(a => ({ ...a, year: 2031, strength: .1 }))
    storeEconomy(x.g, { ...economyState(x.g)!, rivals: current, previousRivals: prior })
    const { dRef, fieldP } = marketScale(x.b.industry, x.b.countryId)
    const base = buildCtx(x.g.lifeId, x.b.industry, marketKey(x.b), 2030, null, dRef, fieldP)
    const old = applyEconomicRivals(x.g, base)
    const id = actorFor('petCare', prior).id
    expect(old.rivals.find(r => r.id === id)!.pull).toBeCloseTo(base.rivals.find(r => r.id === id)!.pull * actorFor('petCare', prior).strength)
    const snapshot = JSON.stringify(x.g)
    for (let i = 0; i < 3; i++) marketCtxFor(x.g, x.b, 2030)
    expect(JSON.stringify(x.g)).toBe(snapshot)
  })

  it('historical real firms keep authoritative dates and strength arcs even under extreme simulated distress', () => {
    const x = fixture(PRESENT_YEAR - 10, 'software')
    const actors = advanceRivals(x.g, x.opening, [], x.g.year - 1)
    const real = actors.find(a => a.industry === 'software' && a.real)!
    expect(real).toBeDefined()
    real.cash = 0; real.debt = 8; real.strength = 0; real.outcome = 'failed'
    for (const country of Object.values(x.opening)) { country.credit = .2; country.sectors.technology.demand = .25; country.sectors.technology.costs = 2.5 }
    const next = advanceRivals(x.g, x.opening, actors, x.g.year)
    expect(next.find(a => a.key === real.key)).toMatchObject({ strength: 1, outcome: 'steady' })
    storeEconomy(x.g, { ...economyState(x.g)!, rivals: actors.map(a => ({ ...a, year: x.g.year })) })
    const { dRef, fieldP } = marketScale(x.b.industry, x.b.countryId)
    const base = buildCtx(x.g.lifeId, x.b.industry, marketKey(x.b), x.g.year, null, dRef, fieldP)
    expect(applyEconomicRivals(x.g, base).rivals.find(r => r.id === real.id)!.pull).toBe(base.rivals.find(r => r.id === real.id)!.pull)
    const roster = rosterOf(familyId(x.g.lifeId), 'software', 'world')
    for (const row of marketCtxFor(x.g, x.b, 1960).rivals) expect((roster.byId.get(row.id)?.from ?? row.founded)).toBeLessThanOrEqual(1960)
  })

  it('caps actor frames/history and reproduces a ten-year path across repeated JSON reloads', () => {
    const x = fixture()
    for (const industry of INDUSTRY_IDS) x.g.assets.push(createBusinessAsset(x.g, industry, newBiz(x.g, industry, 'us', 'New York', { cash: 1e6 }), 1e6))
    let direct: RivalActor[] = [], reloaded: RivalActor[] = []
    for (let year = 2031; year < 2041; year++) {
      direct = advanceRivals(x.g, x.opening, direct, year)
      reloaded = normalizeRivals(JSON.parse(JSON.stringify(advanceRivals(x.g, x.opening, reloaded, year))), year)
      expect(reloaded).toEqual(direct)
      expect(direct.length).toBeLessThanOrEqual(RIVAL_LIMIT)
      expect(new Set(direct.map(a => a.key)).size).toBe(direct.length)
      for (const actor of direct) {
        expect(actor.key).toBe(rivalActorKey(actor.industry, actor.scope, actor.id))
        expect(actor.history.length).toBeLessThanOrEqual(6)
        expect(Number.isFinite(actor.cash + actor.debt + actor.strength)).toBe(true)
      }
    }
  })

  it('the integrated annual boundary stores prior fiscal actors once and reloads identically', () => {
    const x = fixture(), reloaded = JSON.parse(JSON.stringify(x.g)) as typeof x.g
    for (let year = 2032; year < 2035; year++) {
      const previous = structuredClone(economyState(x.g)!.rivals)
      x.g.year = year; reloaded.year = year
      yearlyEconomy(x.g); yearlyEconomy(reloaded)
      expect(economyState(x.g)!.rivals.length).toBeGreaterThan(0)
      expect(economyState(x.g)!.previousRivals).toEqual(previous)
      expect(economyState(reloaded)).toEqual(economyState(x.g))
      const settled = JSON.stringify(x.g)
      yearlyEconomy(x.g)
      expect(JSON.stringify(x.g)).toBe(settled)
      Object.assign(reloaded, JSON.parse(JSON.stringify(reloaded)))
    }
  })
})
