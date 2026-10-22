// R2-S10 (A.K9, the save diet): the world economy keeps last year's frame for the countries a reader can name, and 16 years of
// history instead of 32. `worldEconomy.previous` was a copy of last year's 102 countries (562 KB of 1.82 MB at age 80) and
// nothing outside the player's own ties ever asked for most of it.
//
// What this file proves:
//   (a) economyFocus names the countries a year-minus-one reader can ask about, and nothing else, in bounded time
//   (b) the slice migration (the first real use of a slice `migrate`) shrinks the v4.1.1 heavy fixture and is idempotent
//   (c) the equivalence probe: a life aged with the diet and the same life aged with every country kept differ in `previous`
//       and in nothing else, so the pruning is invisible to every reader that life exercises
//   (d) the fallback: a country with no tie to the player gets the baseline for last year, and the market factor still has
//       the history point of that year
//   (e) hostile history and previous normalize as before, with the new 16-year bound
//   (f) yearlyEconomy is idempotent by its year stamp
//   (g) the first previous after a migration still carries the residence country's last year
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { relocate } from '../src/game/activities/immigration-move'
import { createBusinessAsset, industryProblem, newBiz } from '../src/game/business/founding'
import { installManager, managerCandidate } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { bizOf, businessAssets, readBiz } from '../src/game/business/state'
import { bindMoneyContext } from '../src/game/core'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { ECONOMY_KEY, economyOf, economyState, initialCountry } from '../src/game/economy/model'
import * as focusModule from '../src/game/economy/focus'
import { FOCUS_MAX, HISTORY_YEARS, economyFocus, pruneToFocus } from '../src/game/economy/focus'
import { economyMarketFactor, ensureEconomy, yearlyEconomy } from '../src/game/economy/index'
import { buySecurity, investmentListing } from '../src/game/investments'
import { sliceOf } from '../src/game/kernel/slices'
import { createNewLife } from '../src/game/life'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, Json } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { findSeeds } from './seed-kit'

type Rec = Record<string, unknown>

const ALL = COUNTRIES.map((c) => c.id)
/** A calendar where last year is not recorded history, so previous-year readers use the live economy. */
const BIRTH_YEAR = 2000
const ECONOMY_SLICE = 'flags.worldEconomy'

afterEach(() => {
  vi.restoreAllMocks()
})

function load(name: string): Rec {
  return JSON.parse(gunzipSync(readFileSync(`test/fixtures/${name}`)).toString()) as Rec
}

const text = (v: unknown): string => JSON.stringify(v)

/** The first place two texts differ, with a little context, or null when they are the same. */
function firstDifference(a: string, b: string): string | null {
  if (a === b) return null
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return `at ${i} of ${a.length}/${b.length}: ...${a.slice(Math.max(0, i - 60), i + 80)} <> ${b.slice(Math.max(0, i - 60), i + 80)}`
}

/** `count` countries other than `not`, in table order. */
function others(not: readonly string[], count: number): string[] {
  return ALL.filter((id) => !not.includes(id)).slice(0, count)
}

/**
 * An adult founder of 30 (the way test/probe-life.ts makes one) whose first company has outlets in three countries: the home
 * country and two others. The home country is whatever the seed gave, so no country is pinned.
 */
function founder(seed: number): { g: GameState; abroad: string[] } {
  const g = createNewLife({ seed, year: BIRTH_YEAR })
  g.queue = []
  g.character.age = 30
  g.year = BIRTH_YEAR + 30
  g.character.money = 5e6
  g.character.stats.smarts = 75
  g.character.licenses = ['driver']
  bindMoneyContext(g)
  const home = g.character.countryId
  const abroad = others([home], 2)
  const industry = INDUSTRY_IDS.find((id) => industryProblem(g, id) === null)
  if (!industry) throw new Error(`no industry is open to a founder in ${home}`)
  const opened = g.year - 6
  const outlets = [home, ...abroad].map((countryId) => ({ countryId, city: COUNTRIES.find((c) => c.id === countryId)!.cities[0]!, count: 3, opened }))
  const b0 = newBiz(g, industry, home, g.character.city, { cash: 3_000_000, founded: opened, outlets })
  const a = createBusinessAsset(g, 'Diet probe', b0, 200_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  installManager(g, b, managerCandidate(g, b, 70))
  const plan = bestPlan(g, b)
  b.price = plan.price
  b.production = plan.production
  return { g, abroad }
}

/** The countries of every company outlet the founder owns (the home country and the two abroad). */
function companyCountries(g: GameState): string[] {
  return [...new Set(businessAssets(g).flatMap((a) => readBiz(g, a).outlets.map((o) => o.countryId)))]
}

/** The ten-year-old shape of the economy flag: `previous` holds every country. */
function worldOf(g: GameState): { previous: Record<string, unknown>; history: Record<string, unknown[]> } & Rec {
  return g.flags[ECONOMY_KEY] as unknown as { previous: Record<string, unknown>; history: Record<string, unknown[]> } & Rec
}

describe('economyFocus: the countries a year-minus-one reader can name', () => {
  it('holds the residence, birth country, citizenships and immigration country', () => {
    const { g } = founder(1)
    const [r, b, c1, c2, i] = others([], 5)
    g.character.countryId = r!
    g.character.birthCountryId = b!
    g.character.citizenships = [c1!, c2!]
    g.character.immigration = { countryId: i!, status: 'visa', since: g.year }
    const focus = economyFocus(g)
    for (const id of [r, b, c1, c2, i]) expect(focus.has(id!), id).toBe(true)
    // The residence is first: it is the one country a report always asks about.
    expect([...focus][0]).toBe(r)
  })

  it('holds the countries of a three-country company, a house abroad and a held foreign security', () => {
    const { g, abroad } = founder(2)
    const home = g.character.countryId
    const [houseCountry, secCountry, unrelated] = others([home, ...abroad], 3)
    g.assets.push({ id: 'house-x', kind: 'house', name: 'Villa', emoji: 'h', purchasePrice: 1, value: 1, condition: 80, purchasedAge: 30, upkeep: 0, details: { countryId: houseCountry } } as never)
    g.assets.push({ id: 'sec-x', kind: 'investment', name: 'Fund', emoji: 'f', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 30, upkeep: 0, details: { type: 'reit', home: secCountry } } as never)
    const focus = economyFocus(g)
    for (const id of [home, ...abroad, houseCountry, secCountry]) expect(focus.has(id!), id).toBe(true)
    expect(focus.has(unrelated!)).toBe(false)
  })

  it('reads every flag except the world economy, which names every country by key and by value', () => {
    const { g } = founder(3)
    const [seen, hidden] = others([g.character.countryId, ...companyCountries(g)], 2)
    g.flags.someSystem = { holdings: [{ where: seen }] }
    g.flags[ECONOMY_KEY] = { v: 2, year: g.year, countries: {}, previous: {}, history: {}, note: hidden } as unknown as Json
    const focus = economyFocus(g)
    expect(focus.has(seen!)).toBe(true)
    expect(focus.has(hidden!)).toBe(false)
    // The literal in focus.ts must stay the economy's flag key (focus.ts cannot import model.ts, which imports it).
    expect(ECONOMY_KEY).toBe('worldEconomy')
  })

  it('keeps at most 40 ids, the player’s own ties first, and ignores strings that are not countries', () => {
    expect(FOCUS_MAX).toBe(40)
    const { g } = founder(4)
    g.flags.everywhere = [...ALL, 'not-a-country', 'nowhere', 7, null, { deep: ALL }]
    const focus = economyFocus(g)
    expect(focus.size).toBe(40)
    expect(focus.has(g.character.countryId)).toBe(true)
    for (const id of focus) expect(ALL).toContain(id)
  })

  it('is a read: it neither changes the state nor draws from g.rng', () => {
    const { g } = founder(5)
    const before = text(g)
    const rng = g.rng
    economyFocus(g)
    expect(g.rng).toBe(rng)
    expect(text(g)).toBe(before)
  })

  it('walks a hostile or enormous core in bounded time and never throws', () => {
    const { g } = founder(6)
    // 200,000 nodes in one flag: 66,667 rows of an object with two leaves.
    g.flags.synthetic = { rows: Array.from({ length: 66_667 }, (_, i) => ({ id: i, tag: `row-${i}` })) }
    let best = Infinity
    for (let run = 0; run < 3; run++) {
      const started = performance.now()
      economyFocus(g)
      best = Math.min(best, performance.now() - started)
    }
    expect(best).toBeLessThan(50)
    // Junk where the walk expects a core: it reads as no ties, not as a crash.
    const junk = { character: 5, people: 'x', assets: null, flags: [1, 2, 3] } as unknown as Parameters<typeof economyFocus>[0]
    expect(economyFocus(junk).size).toBe(0)
    const deep: Rec = {}
    let cursor = deep
    for (let i = 0; i < 100_000; i++) cursor = (cursor.next = {}) as Rec
    expect(() => economyFocus({ ...junk, flags: { deep } as unknown as GameState['flags'] })).not.toThrow()
  })

  it('names the countries of the v4.1.1 heavy fixture’s life in fewer than 40 ids', () => {
    const migrated = migrateSave(load('save-v4.1.1-heavy.json.gz'))
    if (migrated.kind !== 'ready') throw new Error('the heavy fixture must load')
    const focus = economyFocus(migrated.game)
    expect(focus.size).toBeGreaterThan(0)
    expect(focus.size).toBeLessThan(40)
    expect(focus.has(migrated.game.character.countryId)).toBe(true)
  })
})

describe('pruneToFocus', () => {
  it('keeps the focus ids of a frame in the frame’s own key order and shares the values', () => {
    const frame = { aa: { n: 1 }, bb: { n: 2 }, cc: { n: 3 }, dd: { n: 4 } }
    const out = pruneToFocus(frame, new Set(['dd', 'bb', 'zz']))
    expect(Object.keys(out)).toEqual(['bb', 'dd'])
    expect(out.bb).toBe(frame.bb)
    expect(pruneToFocus(frame, new Set())).toEqual({})
  })
})

describe('the economy slice at version 2', () => {
  it('is declared once, at version 2, with a migrate, in the world chunk as a replace root', () => {
    const row = sliceOf(ECONOMY_SLICE)
    expect(row).toBeDefined()
    expect(row!.version).toBe(2)
    expect(row!.chunk).toBe('world')
    expect(row!.write).toBe('replace')
    expect(row!.caps).toEqual({ nodes: 150_000, chars: 2_000_000 })
    expect(typeof row!.migrate).toBe('function')
  })

  it('returns what is not a plain object as it is, for the reader to reject, and leaves other shapes alone', () => {
    const migrate = sliceOf(ECONOMY_SLICE)!.migrate!
    const game = { character: { countryId: 'us' }, people: [], assets: [], flags: {} }
    for (const junk of [undefined, null, 5, 'text', [1, 2]]) expect(migrate(1, junk, game)).toBe(junk)
    const odd = { v: 2, previous: 'text', history: [1, 2, 3], countries: { us: {} } }
    expect(migrate(1, odd, game)).toEqual(odd)
    expect(migrate(2, { previous: { us: {}, de: {} } }, game)).toEqual({ previous: { us: {}, de: {} } })
  })

  it('keeps the residence country when nothing else names a country', () => {
    const migrate = sliceOf(ECONOMY_SLICE)!.migrate!
    const game = { character: { countryId: 'de' }, people: [], assets: [], flags: {} }
    const out = migrate(1, { v: 2, previous: { us: { year: 1 }, de: { year: 1 }, fr: { year: 1 } }, history: { de: Array.from({ length: 40 }, (_, i) => ({ year: i })) } }, game) as Rec
    expect(Object.keys(out.previous as Rec)).toEqual(['de'])
    expect((out.history as Record<string, unknown[]>).de).toHaveLength(HISTORY_YEARS)
    // The last years stay: the cut takes the oldest.
    expect(((out.history as Record<string, { year: number }[]>).de ?? []).at(-1)!.year).toBe(39)
  })
})

describe('the migration on the v4.1.1 heavy fixture', () => {
  const raw = load('save-v4.1.1-heavy.json.gz')
  const before = raw.flags as { worldEconomy: { previous: Rec; history: Record<string, unknown[]> } }
  const sizeBefore = text(before.worldEconomy).length

  it('is a real diet: previous holds the focus countries only, history is at most 16 rows, and the flag is 35% shorter', () => {
    expect(Object.keys(before.worldEconomy.previous).length).toBeGreaterThan(100)
    const migrated = migrateSave(structuredClone(raw))
    if (migrated.kind !== 'ready') throw new Error('the heavy fixture must load')
    const world = worldOf(migrated.game)
    const kept = Object.keys(world.previous)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(40)
    expect(kept).toContain(migrated.game.character.countryId)
    for (const id of kept) expect(world.previous[id], id).toEqual(before.worldEconomy.previous[id])
    for (const rows of Object.values(world.history)) expect(rows.length).toBeLessThanOrEqual(HISTORY_YEARS)
    // The rows that stay are the newest ones.
    for (const [id, rows] of Object.entries(world.history)) {
      const old = before.worldEconomy.history[id] ?? []
      expect(rows).toEqual(old.slice(-HISTORY_YEARS))
    }
    const sizeAfter = text(world).length
    expect(sizeAfter, `${sizeAfter} of ${sizeBefore} characters`).toBeLessThanOrEqual(sizeBefore * 0.65)
  })

  it('migrating twice gives equal JSON, whichever way the second pass is reached', () => {
    const first = migrateSave(structuredClone(raw))
    if (first.kind !== 'ready') throw new Error('the heavy fixture must load')
    const once = text(first.game)
    // A v3 record that still says the economy is at version 1 (a build between the two) is migrated again.
    const again = migrateSave(JSON.parse(once) as unknown, { versions: { [ECONOMY_SLICE]: 1 } })
    if (again.kind !== 'ready') throw new Error('the migrated save must load')
    expect(firstDifference(text(again.game), once)).toBeNull()
    // And once more from the original, with the slice migrated by hand twice.
    const migrate = sliceOf(ECONOMY_SLICE)!.migrate!
    const game = structuredClone(raw)
    const one = migrate(1, (game.flags as Rec)[ECONOMY_KEY], game)
    const two = migrate(1, one, game)
    expect(firstDifference(text(two), text(one))).toBeNull()
  })
})

/** The game as JSON text with the economy's previous frames taken out. */
function withoutPrevious(g: GameState): string {
  const copy = JSON.parse(text(g)) as { flags: { worldEconomy: Rec } }
  delete copy.flags.worldEconomy.previous
  return JSON.stringify(copy)
}

describe('the equivalence probe: the diet changes previous and nothing else', () => {
  /**
   * One 12-year life of the founder: a REIT bought at home, an emigration in year 6, health kept up so the life runs its course.
   * `focus` 'real' is the diet, 'every' keeps every country (the twin), 'none' keeps no country (the control: a pruning that
   * loses ties must be visible to this probe, or the probe proves nothing).
   */
  function liveTwelveYears(seed: number, focus: 'real' | 'every' | 'none'): GameState {
    if (focus !== 'real') vi.spyOn(focusModule, 'economyFocus').mockImplementation(() => new Set(focus === 'every' ? ALL : []))
    try {
      const { g, abroad } = founder(seed)
      const reit = investmentListing(g).find((q) => q.type === 'reit')
      if (!reit || !buySecurity(g, reit.secId, 100_000, true)) throw new Error('no REIT to buy')
      const [destination] = others([g.character.countryId, ...abroad], 1)
      for (let y = 0; y < 12 && g.character.alive; y++) {
        g.queue = []
        g.character.stats.health = 100
        g.character.conditions = []
        if (y === 6) relocate(g, destination!, 'legal', { status: 'visa', visa: 'work', term: 5 }, { title: 'Moved', opener: 'You moved.' })
        ageUp(g)
      }
      return g
    } finally {
      vi.restoreAllMocks()
    }
  }

  const seeds = findSeeds((seed) => liveTwelveYears(seed, 'real').character.alive, 3, { label: 'a founder who is alive twelve years after a REIT, a three-country company and a move' })

  it.each(seeds.map((seed, i) => [i + 1, seed]))('life %i: the JSON is the same once previous is removed, and the kept frames are the full ones', (_n, seed) => {
    const diet = liveTwelveYears(seed!, 'real')
    const full = liveTwelveYears(seed!, 'every')
    expect(diet.character.alive).toBe(true)
    const dietWorld = worldOf(diet), fullWorld = worldOf(full)
    // The twin keeps every country, the diet does not: the probe compares two different things.
    expect(Object.keys(fullWorld.previous).length).toBeGreaterThan(100)
    expect(Object.keys(dietWorld.previous).length).toBeLessThanOrEqual(40)
    expect(Object.keys(dietWorld.previous)).toContain(diet.character.countryId)
    for (const id of Object.keys(dietWorld.previous)) expect(text(dietWorld.previous[id]), id).toBe(text(fullWorld.previous[id]))
    expect(firstDifference(withoutPrevious(diet), withoutPrevious(full))).toBeNull()
  }, 180_000)

  it('the control: a diet that keeps no country at all changes the life, so the probe can tell', () => {
    const [seed] = seeds
    const none = liveTwelveYears(seed!, 'none')
    expect(Object.keys(worldOf(none).previous)).toEqual([])
    expect(firstDifference(withoutPrevious(liveTwelveYears(seed!, 'every')), withoutPrevious(none))).not.toBeNull()
  }, 180_000)
})

describe('the fallback for a country no reader of the player’s life can name', () => {
  /** A founder one economic year in, so there is a previous frame. */
  function oneYearIn(): { g: GameState; unrelated: string; openingMarket: number; openingHousing: number } {
    const { g, abroad } = founder(7)
    ensureEconomy(g)
    const unrelated = others([g.character.countryId, ...abroad], 1)[0]!
    const opening = economyState(g)!.countries[unrelated]!
    const out = { unrelated, openingMarket: opening.market, openingHousing: opening.housing }
    g.year += 1
    g.character.age += 1
    yearlyEconomy(g)
    return { g, ...out }
  }

  it('economyOf answers last year with the baseline, as it does for any missing previous frame', () => {
    const { g, unrelated } = oneYearIn()
    expect(economyState(g)!.previous[unrelated]).toBeUndefined()
    expect(economyOf(g, unrelated, g.year - 1)).toEqual(initialCountry(unrelated, g.year - 1))
  })

  it('economyMarketFactor still has the history point of last year, which holds the same two fields', () => {
    const { g, unrelated, openingMarket, openingHousing } = oneYearIn()
    expect(economyMarketFactor(g, unrelated, g.year - 1)).toBe(openingMarket)
    expect(economyMarketFactor(g, unrelated, g.year - 1, true)).toBe(openingHousing)
  })

  it('a country the player lives in keeps its frame, and the market factor reads it', () => {
    const { g } = oneYearIn()
    const home = g.character.countryId
    const state = economyState(g)!
    expect(state.previous[home]?.year).toBe(g.year - 1)
    expect(economyMarketFactor(g, home, g.year - 1)).toBe(state.previous[home]!.market)
    expect(economyOf(g, home, g.year - 1)).toBe(state.previous[home])
  })
})

describe('hostile saves keep their bounds', () => {
  it('cuts a history of 40 rows to 16 and drops previous frames of unknown countries, as before', () => {
    const { g } = founder(8)
    ensureEconomy(g)
    const world = worldOf(g)
    const row = (year: number) => ({ year, growth: 0.02, unemployment: 0.05, inflation: 0.02, rate: 0.03, housing: 1, market: 1, priceScale: 1 })
    const home = g.character.countryId
    const fresh = { ...world, history: { [home]: Array.from({ length: 40 }, (_, i) => row(g.year - 39 + i)) }, previous: { [home]: (world.previous[home] ?? economyState(g)!.countries[home]), nowhere: { year: g.year - 1 }, '__proto__': { year: 1 } } }
    g.flags[ECONOMY_KEY] = JSON.parse(text(fresh)) as unknown as Json
    const state = economyState(g)!
    expect(state.history[home]).toHaveLength(HISTORY_YEARS)
    expect(state.history[home]!.at(-1)!.year).toBe(g.year)
    expect(Object.keys(state.previous)).toEqual([home])
    expect(({} as Rec).year).toBeUndefined()
  })
})

describe('yearlyEconomy', () => {
  it('is idempotent by its year stamp: a second call in the same year changes nothing', () => {
    const { g } = founder(9)
    ensureEconomy(g)
    g.year += 1
    yearlyEconomy(g)
    const once = text(g.flags[ECONOMY_KEY])
    yearlyEconomy(g)
    expect(text(g.flags[ECONOMY_KEY])).toBe(once)
  })

  it('stores only focus countries as previous and 16 history rows, however many years pass', () => {
    const { g, abroad } = founder(10)
    ensureEconomy(g)
    for (let y = 0; y < 20; y++) {
      g.year += 1
      yearlyEconomy(g)
    }
    const state = economyState(g)!
    const kept = Object.keys(state.previous)
    expect(kept).toContain(g.character.countryId)
    for (const id of abroad) expect(kept).toContain(id)
    expect(kept.length).toBeLessThanOrEqual(FOCUS_MAX)
    expect(Object.keys(state.countries)).toHaveLength(ALL.length)
    for (const rows of Object.values(state.history)) expect(rows).toHaveLength(HISTORY_YEARS)
  })
})

describe('the first previous after a migration', () => {
  it('still gives the residence country’s last year to economyOf, and its market to a live year’s factor', () => {
    const migrated = migrateSave(load('save-v4.1.1-heavy.json.gz'))
    if (migrated.kind !== 'ready') throw new Error('the heavy fixture must load')
    const g = migrated.game
    const home = g.character.countryId
    const state = economyState(g)!
    const last = state.previous[home]!
    expect(last.year).toBe(state.year - 1)
    expect(economyOf(g, home, g.year - 1)).toBe(last)
    // The fixture's life is in recorded history, where the factor is 1 by rule. The same game moved to a live calendar
    // (the economy's own years follow) reads the migrated frame.
    const live = structuredClone(g)
    const shift = 2030 - live.year
    live.year += shift
    const world = worldOf(live) as unknown as { year: number; countries: Rec; previous: Rec }
    world.year += shift
    for (const frame of [...Object.values(world.countries), ...Object.values(world.previous)]) (frame as { year: number }).year += shift
    const liveState = economyState(live)!
    expect(economyMarketFactor(live, home, live.year - 1)).toBe(liveState.previous[home]!.market)
  })
})
