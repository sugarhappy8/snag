// Tech waves, task 4: who reads them. Company demand (marketCtxFor) and costs (nationalMarket), the
// valuation stamp and the history rows (valuationOf, BizState.wave), deep-tech heat (industryCycle),
// rivals (advanceRivals) and the fast-follower entrants (competition.ts), plus the hot path.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { marketOfBiz, saveMarket, studioMarketFactor } from '../src/game/business/competition'
import * as competition from '../src/game/business/competition-core'
import { marketStateOf } from '../src/game/business/competition-core'
import { industryCycle, refreshTechValue, techOf, techPlan } from '../src/game/business/deeptech-core'
import { frontierScore } from '../src/game/business/deeptech-data'
import { makeTermSheet } from '../src/game/business/deeptech-funding'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import { nationalMarket } from '../src/game/business/dynamics'
import { advanceRivals } from '../src/game/business/economic-actors'
import { bestPlan, marketCtxFor, valuationOf } from '../src/game/business/economy'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupsOf, groupValue, liveGroup, saveGroup, syncMembers } from '../src/game/business/conglomerate-state'
import { createBusinessAsset, initialProduction, newBiz } from '../src/game/business/founding'
import { addHeavy } from '../src/game/business/heavy-rd'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { bizOf, businessAssets, normalizeBiz, readBiz, type BizState } from '../src/game/business/state'
import { entrantsDue, stampWave, waveFactorsFor, type TechWave } from '../src/game/business/tech-waves'
import type { Industry } from '../src/game/data/markets'
import { ensureEconomy } from '../src/game/economy'
import { initialCountry } from '../src/game/economy/model'
import { initializeNpc, npcBusinessYear, npcCompany, startNpcCompany } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, Json } from '../src/game/types'
import { COUNTRIES, getCountry } from '../src/game/world'
import { adultIn } from './deeptech-kit'
import { makeTestGame } from './helpers'
import { adult, company, nextYear } from './market-kit'

afterEach(() => vi.restoreAllMocks())

const J = (v: unknown): Json => v as Json
const near = (n: number) => expect.closeTo(n, 6)
/** The Task 2 `W`: kind ai, size .5, hype .8, delivery .6 (r = .36, size x delivery = .3). */
const AI = (o: Partial<TechWave> = {}): TechWave => ({ id: 'deeptech:ai:2031:x', kind: 'ai', name: 'Frontier AI', source: 'deeptech', year: 2031, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031, ...o })
const put = (g: GameState, ...w: TechWave[]) => { g.flags.techWaves = J(w) }
/** The record a company carries as a division of a group that is listed on an exchange (conglomerate-state.ts Membership). */
const listedGroup = (): Json => ({ id: 'grp1', joined: 2030, own: 1, integrated: 2030, fx: null, core: { id: 'grp1', mult: 1, listing: { exchange: 'NYSE', ipoYear: 2030, sharesOut: 1e6, sharePrice: 10 } } })
const privateGroup = (): Json => ({ id: 'grp1', joined: 2030, own: 1, integrated: 2030, fx: null, core: { id: 'grp1', mult: 1, listing: null } })

describe('company demand and costs (marketCtxFor, nationalMarket)', () => {
  it('multiplies the potential by the wave demand and is bit-identical with no wave', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); nextYear(g); const b = readBiz(g, a), y = g.year, none = marketCtxFor(g, b, y).pot
    put(g, AI({ year: 2030, last: y })); expect(marketCtxFor(g, b, y).pot).toBeCloseTo(none * 1.06, 6)        // supply: 1 + 0.2 x 0.5 x 0.6
    delete g.flags.techWaves; expect(marketCtxFor(g, b, y).pot).toBe(none)
  })
  it('a game studio reads the wave demand through its market factor (studioMarketFactor reads marketCtxFor), so its wave line may say Demand; nationalMarket demand stays unmoved', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'gameStudio'); nextYear(g); const b = readBiz(g, a), y = g.year
    const none = studioMarketFactor(g, b, y), pot = marketCtxFor(g, b, y).pot, n0 = nationalMarket(g, 'gameStudio', 'us', y).demand
    put(g, AI({ kind: 'smartphone', source: 'workshop', year: 2030, last: y }))
    expect(studioMarketFactor(g, b, y) / none).toBeCloseTo(1.06, 6); expect(marketCtxFor(g, b, y).pot / pot).toBeCloseTo(1.06, 6)   // supply: 1 + 0.2 x 0.5 x 0.6
    expect(nationalMarket(g, 'gameStudio', 'us', y).demand).toBe(n0)
  })
  it('a heavy wave leaves its origin trade at exactly the heavyPulse potential but moves a disrupted neighbour', () => {
    const g = adult(5, 2030, 'us'); const a = company(g, 'software'), m = company(g, 'marketing'); nextYear(g); const y = g.year
    addHeavy(g, 'software', 'world', { family: breakthroughsFor('software')[0].name, year: 2031, years: 5, quality: 80, cost: 3e6, by: a.id })
    const base = marketCtxFor(g, readBiz(g, a), y).pot, mBase = marketCtxFor(g, readBiz(g, m), y).pot
    put(g, AI({ source: 'heavy', skip: 'software', origin: 'heavy.software|world#x', year: 2031, last: y }))
    expect(marketCtxFor(g, readBiz(g, a), y).pot).toBe(base); expect(marketCtxFor(g, readBiz(g, m), y).pot).toBeCloseTo(mBase * 0.925, 6)   // disrupted: 1 - 0.25 x 0.3
  })
  it('heavyPulse x wave demand is clamped to 1.8', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); nextYear(g); const y = g.year, b = readBiz(g, a), none = marketCtxFor(g, b, y + 10).pot
    addHeavy(g, 'dataCenter', 'us', { family: breakthroughsFor('dataCenter')[0].name, year: 2034, years: 5, quality: 80, cost: 3e6, by: a.id })
    put(g, ...Array.from({ length: 3 }, (_, i) => AI({ id: `c${i}`, kind: 'cloud', size: 1, hype: 1, delivery: 1, year: 2030, last: y })))
    expect(marketCtxFor(g, b, y + 10).pot / none).toBeLessThanOrEqual(1.8 + 1e-9)
  })
  it('moves costs by 1 - 0.1 x size x delivery for a core trade, never demand, stops at the 0.75 floor, and honours reach', () => {
    const g = makeTestGame(1); const n0 = nationalMarket(g, 'aiLab', 'us', 2034); put(g, AI()); const n1 = nationalMarket(g, 'aiLab', 'us', 2034)
    expect(n1.demand).toBe(n0.demand); expect(n1.costs / n0.costs).toBeCloseTo(0.97, 6)
    put(g, ...Array.from({ length: 30 }, (_, i) => AI({ id: `c${i}`, size: 1, hype: 1, delivery: 1 }))); expect(nationalMarket(g, 'aiLab', 'us', 2034).costs / n0.costs).toBeCloseTo(0.75, 6)
    const c0 = nationalMarket(g, 'telecom', 'jp', 2034).costs   // a national trade: a world wave counts in full, a country wave abroad at 0.35 + 0.4 x delivery
    put(g, AI({ kind: 'mobilephone', source: 'workshop', market: 'world' })); expect(nationalMarket(g, 'telecom', 'jp', 2034).costs / c0).toBeCloseTo(0.97, 6)
    put(g, AI({ kind: 'mobilephone', source: 'workshop', market: 'us' })); expect(nationalMarket(g, 'telecom', 'jp', 2034).costs / c0).toBeCloseTo(1 - (0.35 + 0.4 * 0.6) * 0.03, 6)
  })
})

describe('valuation: the stamp, history and the clamp', () => {
  const book = (g: GameState, industry: string, year: number) => { const b = bizOf(g, createBusinessAsset(g, 'Co', newBiz(g, industry as Industry, 'us', 'Chicago', { cash: 0 }), 1e6))
    b.history = [year - 2, year - 1, year].map((y) => ({ year: y, revenue: 50e6, profit: 10e6, tax: 0, units: 1e4, price: 5000, staff: 50, valuation: 0, outlets: 1 })); return b }
  it('follows a stamp for the last booked year only, clamped, validated, and ignored for a listed company', () => {
    const g = makeTestGame(1), b = book(g, 'realEstate', 2033), base = valuationOf(b)
    expect(valuationOf({ ...b, wave: { v: 1.3, y: 2033 } }) / base).toBeCloseTo(1.3, 2); expect(valuationOf({ ...b, wave: { v: 1.3, y: 2032 } })).toBe(base)
    expect(valuationOf({ ...b, wave: { v: 99, y: 2033 } }) / base).toBeLessThanOrEqual(3 + 1e-6)   // whole dollars at about 4.5e7 round to within 3e-8
    for (const v of [NaN, Infinity, 'x']) expect(valuationOf({ ...b, wave: { v, y: 2033 } as never })).toBe(base)
    expect(valuationOf({ ...b, public: true, wave: { v: 2, y: 2033 } })).toBe(valuationOf({ ...b, public: true }))
    const wv = waveFactorsFor(g, 'software', 'world', 2011).value, s = book(g, 'software', 2011)   // no stamp: history is read directly; a stamp overrides and already includes it
    expect(wv).toBeGreaterThan(1.1); expect(Math.abs(valuationOf(s) / valuationOf({ ...s, wave: { v: wv, y: 2011 } }) - 1)).toBeLessThan(1e-9); expect(valuationOf({ ...s, wave: { v: 1, y: 2011 } })).toBeLessThan(valuationOf(s))
  })
  it('a division of a listed group takes the stock-grade stamp, and only that grade counts for it', () => {
    const g = makeTestGame(1), b = book(g, 'dataCenter', 2033), base = valuationOf(b)
    put(g, AI({ year: 2030, last: 2033 }))
    for (const [group, wave] of [[privateGroup(), true], [listedGroup(), false]] as const) {
      const m = { ...b, group }; stampWave(g, m, 2033)
      expect('wave' in m).toBe(true); expect(m.wave!.q === true).toBe(!wave); expect(valuationOf({ ...m, wave: { v: 1.3, y: 2033 } }) === valuationOf({ ...m, wave: undefined })).toBe(!wave)
    }
    expect(valuationOf({ ...b, group: listedGroup(), wave: { v: 1.3, y: 2033 } })).toBe(base); expect(valuationOf({ ...b, group: privateGroup(), wave: { v: 1.3, y: 2033 } })).toBeGreaterThan(base)
    const s = book(g, 'software', 2011), noWave = valuationOf({ ...s, wave: { v: 1, y: 2011 } })   // history rows are read directly when there is no stamp
    expect(valuationOf({ ...s, group: listedGroup() })).toBe(noWave); expect(valuationOf({ ...s, group: privateGroup() })).toBeGreaterThan(noWave)
  })
  it('the price of a real listed group moves with a wave, as the same group unlisted does', () => {
    const g = makeTestGame(123, { age: 45, money: 1e9 }); g.year = 2034
    for (const [i, industry] of (['dataCenter', 'dataCenter'] as const).entries()) {
      const b = newBiz(g, industry, 'us', 'Chicago', { cash: 50e6, founded: g.year - 5, valuation: 220e6 })
      b.history = [2032, 2033, 2034].map((y) => ({ year: y, revenue: 50e6, profit: 10e6, tax: 0, units: 1e4, price: 5000, staff: 50, valuation: 0, outlets: 1 }))
      g.assets.push(createBusinessAsset(g, `Division ${i}`, b, 1e6))
    }
    expect(formGroup(g, g.assets.map((a) => a.id), 'Atlas')).toBe(true); g.queue = []
    const id = groupsOf(g)[0].core.id
    const value = (listed: boolean, wave: boolean): number => {
      const grp = liveGroup(g, id)!; grp.core.listing = listed ? { exchange: 'NYSE', ipoYear: 2030, sharesOut: 1e6, sharePrice: 10 } : null
      syncMembers(grp); saveGroup(g, grp)
      if (wave) put(g, AI({ year: 2030, last: 2034 })); else delete g.flags.techWaves
      for (const x of grp.members) { stampWave(g, x.b, 2034); x.b.valuation = valuationOf(x.b) }
      return groupValue(grp)
    }
    const quiet = value(true, false); expect(value(true, true)).toBeGreaterThan(quiet)
    expect(value(false, true)).toBeGreaterThan(value(false, false))
  })
  it('yearlyBusinessImpl stamps the booked year, deletes a neutral stamp, writes none without a wave, and stamps a listed one at the stock grade', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'dataCenter'); put(g, AI({ year: 2030, last: 2033 })); nextYear(g)
    expect(bizOf(g, a).wave).toEqual({ v: expect.closeTo(1.0612, 3), y: 2033 })
    delete g.flags.techWaves; nextYear(g); expect('wave' in bizOf(g, a)).toBe(false)
    const pub = bizOf(g, a); pub.public = true; pub.wave = { v: 2, y: 2000 }; put(g, AI({ year: 2030, last: g.year })); stampWave(g, pub, g.year - 1); expect(pub.wave).toEqual({ v: expect.any(Number), y: g.year - 1, q: true })
  })
  it('a heavy pioneer whose trade its own wave would disrupt gets no stamp, while an unrelated disrupted trade still does', () => {
    const g = adult(5, 2033, 'us'); const a = company(g, 'software'), m = company(g, 'marketing')   // an AI platform from a software company: software is disrupted by the ai kind
    put(g, AI({ source: 'heavy', skip: 'software', origin: 'heavy.software|world#x', year: 2031, last: 2033, hype: 1, delivery: 1 }))
    const b = bizOf(g, a), c = bizOf(g, m); stampWave(g, b, 2033); stampWave(g, c, 2033)
    expect(b.wave).toBeUndefined(); expect(c.wave!.v).toBeLessThan(1)
  })
  it('an NPC company books and stamps through the same call', () => {
    const g = adult(5, 2033, 'gb'); company(g, 'dataCenter', { name: 'Player DC' }); nextYear(g); nextYear(g)   // world() of test/heavy-arrivals.test.ts
    const friend = createPerson(g, { relation: 'friend', firstName: 'Adam', age: 30, money: 80_000_000, occupation: 'Engineer', relationship: 90 })
    const life = initializeNpc(g, friend); expect(startNpcCompany(g, friend, 'dataCenter')).toBe(true)
    const y = g.year; put(g, AI({ year: 2030, last: y + 1 })); g.year = y + 1; npcBusinessYear(g, friend, life); expect(npcCompany(friend, g.year)!.b.wave).toEqual({ v: expect.closeTo(1.0612, 3), y })
  })
})

describe('BizState.wave on load', () => {
  const nb = (wave: unknown, industry = 'restaurant') => normalizeBiz({ industry, countryId: 'us', city: 'Chicago', outlets: [{ countryId: 'us', city: 'Chicago', count: 1, opened: 2020 }], wave } as unknown as Record<string, Json>, 2026)
  it('keeps a valid stamp clamped, drops junk and deep tech, and valuationOf ignores a damaged stamp on a raw current-version record', () => {
    expect(nb({ v: 1.2, y: 2030 }).wave).toEqual({ v: 1.2, y: 2030 }); expect(nb({ v: 99, y: 2030 }).wave).toEqual({ v: 3, y: 2030 })
    for (const j of [7, 'x', null, [], {}, { v: 'x', y: 2030 }, { v: Infinity, y: 2030 }, { v: 1.2 }]) expect('wave' in nb(j)).toBe(false)
    expect('wave' in nb({ v: 1.2, y: 2030 }, 'aiLab')).toBe(false)
    const g = makeTestGame(1), a = createBusinessAsset(g, 'Raw', newBiz(g, 'restaurant', 'us', 'Chicago', { cash: 0 }), 1e6), b = bizOf(g, a)
    b.history = [2031, 2032, 2033].map((y) => ({ year: y, revenue: 5e6, profit: 1e6, tax: 0, units: 1e4, price: 50, staff: 50, valuation: 0, outlets: 1 })); const base = valuationOf(b)
    ;(a.details as Record<string, Json>).wave = { v: 'x', y: 2033 }; expect(valuationOf(bizOf(g, a))).toBe(base)
  })
})

describe('deep tech: industryCycle', () => {
  /** A player-run deep-tech company set up directly (copied from test/deeptech.test.ts, renamed so it does not shadow market-kit's). */
  const dtCompany = (g: GameState, industry: string, patch: Partial<TechState> = {}): Asset => {
    const c = g.character
    const b = newBiz(g, industry as Industry, c.countryId, c.city, { cash: 0, ceo: 'owner', manager: null })
    const t = readTech(undefined); Object.assign(t, { level: 40, ...patch })
    b.tech = JSON.parse(JSON.stringify(t)) as Json
    const a = createBusinessAsset(g, `Test ${industry}`, b, 0); g.assets.push(a)
    c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
    return a
  }
  it('adds the value factor only, keeps demand, price, z and the seed, and the value stays within 0.3-3', () => {
    const g = makeTestGame(3); g.year = 2034; const c0 = industryCycle(g, 'aiLab', 2034); put(g, AI()); const c1 = industryCycle(g, 'aiLab', 2034)
    expect([c1.demand, c1.price, c1.z, c1.label]).toEqual([c0.demand, c0.price, c0.z, c0.label]); expect([c0.wave, c1.wave]).toEqual([1, near(1.126)]); expect(c1.value).toBeCloseTo(Math.min(3, c0.value * 1.126), 6)
    put(g, ...Array.from({ length: 30 }, (_, i) => AI({ id: `c${i}`, size: 1, hype: 1, delivery: 1 }))); expect(industryCycle(g, 'aiLab', 2034).value).toBeLessThanOrEqual(3)
  })
  it('lifts the lab\'s tech value and its term sheet, and never double counts through the stamp', () => {
    const g = adultIn('us', 5e9, 3, 90, 2034); const a = dtCompany(g, 'aiLab', { stage: 3, level: 80, ipBook: 20_000_000 }), b = bizOf(g, a), t = techOf(b)   // a lab with no patents or sales has nothing the heat could multiply
    const rng = g.rng; refreshTechValue(g, b, t); const v0 = valuationOf(b), pre0 = makeTermSheet(g, a, b, t).pre   // a term sheet draws its roll from g.rng, so both sheets start from the same stream
    put(g, AI({ year: 2030 })); g.rng = rng; refreshTechValue(g, b, t); expect(valuationOf(b)).toBeGreaterThan(v0); expect(makeTermSheet(g, a, b, t).pre).toBeGreaterThan(pre0)
    stampWave(g, b, g.year - 1); expect(b.wave).toBeUndefined(); expect(valuationOf({ ...b, wave: { v: 2, y: g.year - 1 } })).toBe(valuationOf(b))
  })
})

describe('deep tech: plan demand', () => {
  it('a lab\'s plan demand carries the wave demand (techPlan reads marketCtxFor), so its wave line may say Demand', () => {
    const g = adultIn('us', 5e9, 3, 90, 2034), c = g.character, b0 = newBiz(g, 'aiLab', c.countryId, c.city, { cash: 0, ceo: 'owner', manager: null })
    const t0 = readTech(undefined); Object.assign(t0, { level: 80, stage: 3, hype: 60, models: [{ gen: 1, name: 'Nova 1', score: frontierScore(2034) + 3, open: false, year: 2034 }] }); b0.tech = JSON.parse(JSON.stringify(t0)) as Json
    const a = createBusinessAsset(g, 'Test aiLab', b0, 0); g.assets.push(a); const b = bizOf(g, a), t = techOf(b)
    const none = techPlan(g, b, t, g.year, { calm: true }).demand; expect(none).toBeGreaterThan(0)
    put(g, AI({ year: 2030, last: g.year })); expect(techPlan(g, b, t, g.year, { calm: true }).demand / none).toBeCloseTo(1.09, 4)   // core: 1 + 0.3 x 0.5 x 0.6
  })
})

describe('deep tech: listed companies take the stock-grade wave', () => {
  const dtCompany = (g: GameState): { b: BizState; t: TechState } => {
    const c = g.character, b = newBiz(g, 'aiLab', c.countryId, c.city, { cash: 0, ceo: 'owner', manager: null })
    const t = readTech(undefined); Object.assign(t, { level: 80, stage: 3, ipBook: 20_000_000 }); b.tech = JSON.parse(JSON.stringify(t)) as Json
    const a = createBusinessAsset(g, 'Test aiLab', b, 0); g.assets.push(a)
    const live = bizOf(g, a); return { b: live, t: techOf(live) }
  }
  it('a public lab and a lab in a listed group take the stock-grade wave in their tech value, with no wave nothing changes, and a private lab keeps the private grade', () => {
    const g = adultIn('us', 5e9, 3, 90, 2034), { b, t } = dtCompany(g), val = () => { refreshTechValue(g, b, t); return valuationOf(b) }
    const none = val(); put(g, AI({ year: 2030 })); const waved = val(); expect(waved).toBeGreaterThan(none)
    b.public = true; const pubWave = val(); delete g.flags.techWaves; const pubNone = val(); expect(pubWave).toBeGreaterThan(pubNone)
    b.public = false; b.group = listedGroup(); put(g, AI({ year: 2030 })); const grpWave = val(); delete g.flags.techWaves; expect(grpWave).toBeGreaterThan(val())
    b.group = privateGroup(); put(g, AI({ year: 2030 })); expect(val()).toBe(waved)
  })
})

describe('rivals, entrants and the hot path', () => {
  /** fixture and actorFor of test/world2-rivals.test.ts. */
  const fixture = (year: number, industry: Industry) => {
    const g = makeTestGame(493, { age: 35, countryId: 'us', city: 'New York', money: 1e9 }); g.year = year
    const b = newBiz(g, industry, 'us', 'New York', { cash: 100_000_000, founded: year - 10, brand: 40, quality: 60 })
    g.assets.push(createBusinessAsset(g, 'Local Business', b, 1e6)); ensureEconomy(g)
    return { g, opening: Object.fromEntries(COUNTRIES.map((c) => [c.id, initialCountry(c.id, year - 1)])) }
  }
  const actorFor = (industry: string, actors: ReturnType<typeof advanceRivals>) => actors.find((a) => a.industry === industry)!
  it('a core rival gains from lower costs, a disrupted one cannot gain, a trade with no role is bit-identical', () => {
    const run = (industry: Industry, on: boolean) => { const x = fixture(2031, industry); const prior = advanceRivals(x.g, x.opening, [], 2030); if (on) put(x.g, AI({ year: 2030, last: 2031 })); return actorFor(industry, advanceRivals(x.g, x.opening, prior, 2031)) }
    // A core rival puts its gain into capacity (strength follows), so its cash is no measure; a disrupted one has nothing to reinvest.
    expect(run('aiLab', true).strength).toBeGreaterThan(run('aiLab', false).strength); expect(run('software', true).cash).toBeLessThanOrEqual(run('software', false).cash); expect(run('petCare', true)).toEqual(run('petCare', false))
  })
  it('founds one fast follower per delivery threshold crossed, at most 3, never for heavy waves, once each', () => {
    const g = adult(5, 2034, 'us'); company(g, 'telecom'); put(g, AI({ kind: 'mobilephone', source: 'workshop', year: 2030, last: 2034, delivery: 0.55 }))
    expect(entrantsDue(g, 'telecom', 'us').map((e) => e.id)).toHaveLength(2)
    const ids = () => marketStateOf(readBiz(g, businessAssets(g)[0]))!.extra.filter((x) => x.id.startsWith('xw-')).map((x) => x.id)
    nextYear(g); const first = ids(); expect(first).toHaveLength(2)                                        // founded on the delivery of the booked year, before the step moves it
    nextYear(g); expect(ids().slice(0, 2)).toEqual(first); expect(ids().length).toBeLessThanOrEqual(3)      // the step may have crossed 0.75 meanwhile, so 2 or 3, and the first two are never founded again
    put(g, AI({ kind: 'mobilephone', source: 'workshop', year: 2030, last: g.year, delivery: 0.9 })); nextYear(g); expect(ids()).toHaveLength(3)
    put(g, AI({ kind: 'mobilephone', source: 'heavy', skip: 'telecom', year: 2030, last: g.year, delivery: 0.9 })); expect(entrantsDue(g, 'telecom', 'us')).toEqual([])
  })
  it('never founds a fast follower twice, even after 12 newer extras push it off the capped list, and a save from before the record still loads', () => {
    const g = adult(5, 2034, 'us'); const a = company(g, 'telecom'); put(g, AI({ kind: 'mobilephone', source: 'workshop', year: 2030, last: 2034, delivery: 0.9 }))
    const ids = () => marketOfBiz(readBiz(g, a)).extra.filter((x) => x.id.startsWith('xw-')).map((x) => x.id)
    const chased = () => g.log.flatMap((y) => y.entries).filter((l) => l.text.endsWith(' launched to chase mobile phones.')).length
    nextYear(g); expect(ids()).toHaveLength(3); expect(chased()).toBe(3)
    const b = bizOf(g, a), st = marketOfBiz(b)
    for (let i = 0; i < 12; i++) st.extra.push({ id: `x2036${i}`, name: `Newer Rival ${i}`, hq: 'us', founded: 2036, pot: 1, ramp: 4, origin: 'entrant' })
    st.extra = st.extra.slice(-12); saveMarket(b, st); expect(ids()).toEqual([])                                   // the cap has dropped all three
    nextYear(g); nextYear(g); expect(ids()).toEqual([]); expect(chased()).toBe(3)                                // and the wave, still at 0.9 delivery, founds none of them again
    const old = JSON.parse(JSON.stringify(b.market)) as Record<string, Json>; delete old.waveFounded               // a market state saved before the record existed
    expect(marketOfBiz(b).waveFounded).toHaveLength(3); expect(marketOfBiz({ ...b, market: old as Json }).waveFounded).toBeUndefined()
    expect(marketOfBiz({ ...b, market: old as Json }).extra).toHaveLength(marketOfBiz(b).extra.length)
    expect(marketOfBiz({ ...b, market: { ...old, waveFounded: Array.from({ length: 500 }, (_, i) => `xw-${i}`) } }).waveFounded).toHaveLength(96)   // bounded on read
  })
  it('bestPlan with a live wave keeps buildCtx at 2 calls and JSON.stringify(g) unchanged', () => {
    // multinational() of test/plan-search-reads.test.ts: a manufacturing company in year 2030.
    const g = makeTestGame(4242, { age: 45, money: 50_000_000 }); g.year = 2030; g.lifeId = 'plan-reads'; g.log = [{ age: 45, year: 2030, entries: [] }]; ensureEconomy(g)
    const outlets = (['us', 'de', 'jp', 'gb'] as const).map((countryId, i) => ({ countryId, city: getCountry(countryId).cities[0], count: 2 + i % 2, opened: 2026 }))
    const b: BizState = newBiz(g, 'manufacturing', 'us', getCountry('us').cities[0], { cash: 40_000_000, founded: 2024, outlets }); b.production = initialProduction(g, b); b.valuation = 60_000_000
    g.assets.push(createBusinessAsset(g, 'Reads Co', b, 40_000_000)); put(g, AI({ kind: 'automation', year: 2024, last: 2030 }))
    const ctx = vi.spyOn(competition, 'buildCtx'), before = JSON.stringify(g), rng = g.rng; bestPlan(g, b); expect(ctx.mock.calls.length).toBeLessThanOrEqual(2); expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
  })
})
