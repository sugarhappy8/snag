// R3-H4 (H.2): the sources of knowledge. Every way to sharpen a key is a priced source with a floor, a list of what it can read, an era,
// and (for the illegal ones) a heat. This file holds the table and its rules; test/knowledge-intel.test.ts buys and reads.
//
//   floors   no source reads sharper than its floor, whatever the spend: press 20%, report 12%, analyst 8%, diligence 3%
//   prices   follow the scope and the country's wealth (one tier, how many countries, how big a deal), never the buyer's cash
//   reads    each source covers some kinds of keys and not others (a report cannot tell you what a candidate can do)
//   era      a hacker needs the internet; a report needs a research trade
//   kinds    an owner registers how to find the truth of a key; the same def twice is fine, a different one for a taken kind throws
//
// The suite runs in Exact (test/setup-exact.ts). Every Realistic case goes through inFog (test/knowledge-kit.ts).
import { describe, expect, it } from 'vitest'
import { getCountry } from '../src/game/world'
import {
  MAX_COUNTRIES,
  SOURCES,
  SOURCE_IDS,
  eraBlock,
  priceOf,
  readingSd,
  reads,
  type SourceId,
} from '../src/game/knowledge/sources'
import { kindOf, registerKeyKind, type KeyKind } from '../src/game/knowledge/kinds'
import { CEILING_PROBES } from './ceiling-kit'
import { makeTestGame } from './helpers'

const ids = (): SourceId[] => [...SOURCE_IDS]

describe('the table', () => {
  it('names the eleven sources, each with a kind, a label and numbers that make sense', () => {
    expect(ids().sort()).toEqual(['analyst', 'diligence', 'desk', 'hacker', 'informant', 'investigator', 'lab', 'news', 'own', 'press', 'report'].sort())
    for (const id of ids()) {
      const s = SOURCES[id]
      expect(s.id).toBe(id)
      expect(s.label.length, id).toBeGreaterThan(2)
      expect(s.base, id).toBeGreaterThan(0)
      expect(s.floor, id).toBeGreaterThan(0)
      expect(s.floor, id).toBeLessThanOrEqual(s.base)
      expect(s.price, id).toBeGreaterThanOrEqual(0)
      expect(s.heat, id).toBeGreaterThanOrEqual(0)
    }
  })

  it('has the floors of the plan: press .20, report .12, analyst .08, diligence .03, and illegal ones at least .05', () => {
    expect(SOURCES.press.floor).toBe(0.2)
    expect(SOURCES.report.floor).toBe(0.12)
    expect(SOURCES.analyst.floor).toBe(0.08)
    expect(SOURCES.diligence.floor).toBe(0.03)
    expect(SOURCES.investigator.floor).toBe(0.1)
    expect(SOURCES.own.floor).toBe(0.25)
    expect(SOURCES.news.floor).toBe(0.2)
    expect(SOURCES.desk.floor).toBe(0.1)
    expect(SOURCES.lab.floor).toBe(0.15)
    for (const id of ['informant', 'hacker'] as const) {
      expect(SOURCES[id].kind).toBe('illegal')
      expect(SOURCES[id].floor).toBeGreaterThanOrEqual(0.05)
    }
    expect(SOURCES.informant.floor).toBe(0.07)
    expect(SOURCES.hacker.floor).toBe(0.05)
  })

  it('has the base sds and prices of the plan, and heat only on the two illegal sources', () => {
    expect(ids().map((id) => [id, SOURCES[id].base])).toEqual(
      expect.arrayContaining([['news', 0.3], ['press', 0.3], ['report', 0.18], ['analyst', 0.12], ['diligence', 0.05], ['investigator', 0.14], ['informant', 0.1], ['hacker', 0.07], ['desk', 0.14]]),
    )
    expect([SOURCES.press.price, SOURCES.report.price, SOURCES.analyst.price, SOURCES.investigator.price, SOURCES.informant.price, SOURCES.hacker.price]).toEqual([1_200, 9_000, 30_000, 15_000, 6_000, 20_000])
    expect(SOURCES.informant.heat).toBe(3)
    expect(SOURCES.hacker.heat).toBe(6)
    for (const id of ids().filter((x) => x !== 'informant' && x !== 'hacker')) expect(SOURCES[id].heat, id).toBe(0)
  })

  it('only the sources a player can walk up to are buyable: not the news, the lab, or the desk', () => {
    const buyable = ids().filter((id) => SOURCES[id].buyable).sort()
    expect(buyable).toEqual(['analyst', 'diligence', 'hacker', 'informant', 'investigator', 'own', 'press', 'report'])
  })
})

describe('readingSd: the sd of a purchased reading, never below the floor', () => {
  it('is the base at ordinary quality and spend', () => {
    for (const id of ids().filter((x) => x !== 'own')) expect(readingSd(id, {}), id).toBeCloseTo(Math.max(SOURCES[id].floor, SOURCES[id].base), 12)
  })

  it('gets sharper with quality and with spend, and blunter with a poor provider', () => {
    expect(readingSd('report', { quality: 1 })).toBeLessThan(readingSd('report', { quality: 0.5 }))
    expect(readingSd('report', { quality: 0 })).toBeGreaterThan(readingSd('report', { quality: 0.5 }))
    expect(readingSd('report', { spend: 3 })).toBeLessThan(readingSd('report', { spend: 1 }))
    expect(readingSd('report', { spend: 3 })).toBeCloseTo(0.18 * 3 ** -0.35, 12)
    expect(readingSd('report', { quality: 0 })).toBeCloseTo(0.18 * 1.5, 12)
  })

  it('a talent key is read x.8 sharper', () => {
    expect(readingSd('analyst', { talent: true, quality: 0 })).toBeCloseTo(0.12 * 1.5 * 0.8, 12)
    expect(readingSd('press', { talent: true })).toBeCloseTo(0.3 * 0.8, 12)
  })

  it('100x the spend, the best quality and a talent never go below the floor', () => {
    for (const id of ids()) {
      for (const spend of [1, 10, 100, 1e6]) {
        for (const quality of [0, 0.5, 1, 5]) {
          for (const talent of [false, true]) {
            const sd = readingSd(id, { spend, quality, talent })
            expect(sd, `${id} spend ${spend} quality ${quality}`).toBeGreaterThanOrEqual(SOURCES[id].floor)
            expect(Number.isFinite(sd)).toBe(true)
          }
        }
      }
      expect(readingSd(id, { spend: 100, quality: 1, talent: true }), id).toBe(SOURCES[id].floor)
    }
  })

  it('shrugs off nonsense: NaN, negative and infinite inputs read as the ordinary case', () => {
    for (const bad of [NaN, -3, Infinity, 0]) {
      const sd = readingSd('report', { spend: bad, quality: bad, ref: bad })
      expect(Number.isFinite(sd)).toBe(true)
      expect(sd).toBeGreaterThanOrEqual(0.12)
    }
  })

  it('the do-it-yourself read gets sharper with smarts, from .45 x 1.5 toward the floor of .25', () => {
    expect(readingSd('own', { quality: 0 })).toBeCloseTo(0.45 * 1.5, 12)
    expect(readingSd('own', { quality: 0.5 })).toBeCloseTo(0.45, 12)
    expect(readingSd('own', { quality: 1 })).toBe(0.25)
    expect(readingSd('own', { quality: 0.2 })).toBeGreaterThan(readingSd('own', { quality: 0.8 }))
  })
})

describe('priceOf: scope and country, never the buyer', () => {
  const US = { tier: 1 as const, country: 'us' }

  it('is the table price at tier 1, one country, wealth 1', () => {
    expect(getCountry('us').wealth).toBe(1)
    for (const id of ['press', 'report', 'analyst', 'investigator', 'informant', 'hacker'] as const) expect(priceOf(id, US), id).toBe(SOURCES[id].price)
  })

  it('rises with the tier (x1, x2.2, x4.5) and with the countries (+25% each), rounded to 100', () => {
    expect(priceOf('report', { tier: 2, country: 'us' })).toBe(19_800)
    expect(priceOf('report', { tier: 3, country: 'us' })).toBe(40_500)
    expect(priceOf('report', { tier: 1, country: 'us', countries: 3 })).toBe(13_500)
    expect(priceOf('analyst', { tier: 2, country: 'us', countries: 2 })).toBe(82_500)
    for (const id of ['press', 'report', 'analyst', 'informant'] as const) {
      expect(priceOf(id, { tier: 2, country: 'us' }), id).toBeGreaterThan(priceOf(id, { tier: 1, country: 'us' }))
      expect(priceOf(id, { tier: 3, country: 'us' }), id).toBeGreaterThan(priceOf(id, { tier: 2, country: 'us' }))
      expect(priceOf(id, { tier: 1, country: 'us', countries: 4 }), id).toBeGreaterThan(priceOf(id, { tier: 1, country: 'us', countries: 2 }))
      expect(priceOf(id, { tier: 2, country: 'us' }) % 100, id).toBe(0)
    }
  })

  it('follows the wealth of the country read, clamped to .3 and 1.5', () => {
    const countries = ['us', 'de', 'ng', 'in', 'ch', 'mc'].filter((c) => getCountry(c).id === c)
    expect(countries.length).toBeGreaterThanOrEqual(4)
    for (const c of countries) {
      const w = Math.min(1.5, Math.max(0.3, getCountry(c).wealth))
      expect(priceOf('report', { tier: 1, country: c }), c).toBe(Math.round((9_000 * w) / 100) * 100)
    }
    const rich = Math.max(...countries.map((c) => priceOf('report', { tier: 1, country: c })))
    const poor = Math.min(...countries.map((c) => priceOf('report', { tier: 1, country: c })))
    expect(rich).toBeGreaterThan(poor)
    expect(rich).toBeLessThanOrEqual(13_500)
    expect(poor).toBeGreaterThanOrEqual(2_700)
  })

  it('uses the fallback country when the scope names none, and the US when neither does', () => {
    expect(priceOf('report', { tier: 1 }, 'ng')).toBe(priceOf('report', { tier: 1, country: 'ng' }))
    expect(priceOf('report', { tier: 1 })).toBe(priceOf('report', { tier: 1, country: 'us' }))
    expect(priceOf('report', { tier: 1, country: 'not-a-country' })).toBeGreaterThan(0)
  })

  it('stops at the cap: tier 3, the most countries, the richest country (4.5 x 2.75 x 1.5)', () => {
    const top = priceOf('analyst', { tier: 3, countries: 1e9, country: 'mc' })
    expect(top).toBeLessThanOrEqual(30_000 * 4.5 * (1 + 0.25 * (MAX_COUNTRIES - 1)) * 1.5 + 50)
    expect(priceOf('analyst', { tier: 3, countries: MAX_COUNTRIES, country: 'us' })).toBe(priceOf('analyst', { tier: 3, countries: 1e9, country: 'us' }))
    expect(priceOf('analyst', { tier: 3, countries: -4, country: 'us' })).toBe(priceOf('analyst', { tier: 3, countries: 1, country: 'us' }))
    expect(priceOf('analyst', { tier: 9 as never, country: 'us' })).toBe(priceOf('analyst', { tier: 3, country: 'us' }))
    expect(priceOf('analyst', { tier: NaN as never, country: 'us' })).toBe(priceOf('analyst', { tier: 1, country: 'us' }))
  })

  it('the diligence rule is the greater of 8,000 x wealth and 2% of the deal, to the nearest 1,000 (the ddCost rule)', () => {
    expect(priceOf('diligence', { tier: 1, country: 'us' })).toBe(8_000)
    expect(priceOf('diligence', { tier: 1, country: 'us', deal: 100_000 })).toBe(8_000)
    expect(priceOf('diligence', { tier: 1, country: 'us', deal: 2_000_000 })).toBe(40_000)
    expect(priceOf('diligence', { tier: 1, country: 'us', deal: 9_000_000 })).toBe(180_000)
    expect(priceOf('diligence', { tier: 3, country: 'us', countries: 5 })).toBe(8_000)
    const w = Math.min(1.5, Math.max(0.3, getCountry('ng').wealth))
    expect(priceOf('diligence', { tier: 1, country: 'ng' })).toBe(Math.round((8_000 * w) / 1000) * 1000)
  })

  it('the free sources cost nothing and the desk costs 0.6 of the analyst', () => {
    for (const id of ['own', 'news', 'lab'] as const) expect(priceOf(id, { tier: 3, countries: 5, country: 'us', deal: 1e9 }), id).toBe(0)
    for (const scope of [{ tier: 1 as const }, { tier: 2 as const, countries: 3 }, { tier: 3 as const, country: 'ng' }]) {
      expect(priceOf('desk', scope)).toBe(Math.round((0.6 * priceOf('analyst', scope)) / 100) * 100)
    }
  })

  it('is a function of the scope alone: no game, no cash, no wealth of the buyer goes in', () => {
    expect(priceOf.length).toBeLessThanOrEqual(3)
    const a = priceOf('analyst', { tier: 2, country: 'de', countries: 3 })
    for (let i = 0; i < 20; i++) expect(priceOf('analyst', { tier: 2, country: 'de', countries: 3 })).toBe(a)
  })
})

describe('reads: what each source can tell you about', () => {
  const kindsOf = (id: SourceId): string[] =>
    ['mkt', 'riv', 'cmp', 'eco', 'pol', 'sec', 'fund', 'val', 'cand', 'ppl', 'scn', 'odds', 'hint', 'ev'].filter((k) => reads(id, k))

  it('follows the table, with scn on the three paid desks and odds on the two deepest', () => {
    expect(kindsOf('press').sort()).toEqual(['cmp', 'eco', 'mkt', 'pol', 'riv', 'scn', 'sec'])
    expect(kindsOf('report').sort()).toEqual(['cmp', 'eco', 'mkt', 'odds', 'riv', 'scn'])
    expect(kindsOf('analyst').sort()).toEqual(['cmp', 'fund', 'mkt', 'odds', 'riv', 'scn', 'sec', 'val'])
    expect(kindsOf('desk').sort()).toEqual(kindsOf('analyst').sort())
    expect(kindsOf('diligence').sort()).toEqual(['cand', 'cmp', 'val'])
    expect(kindsOf('investigator').sort()).toEqual(['cand', 'ppl', 'riv'])
    expect(kindsOf('informant').sort()).toEqual(['cmp', 'mkt', 'riv'])
    expect(kindsOf('hacker').sort()).toEqual(['cand', 'cmp', 'riv', 'val'])
    expect(kindsOf('lab').sort()).toEqual(['cmp', 'mkt', 'riv'])
  })

  it('the do-it-yourself read covers what is public and nothing private (no valuations, candidates or people)', () => {
    const own = kindsOf('own')
    expect(own).toEqual(expect.arrayContaining(['mkt', 'riv', 'cmp', 'eco', 'pol', 'sec']))
    for (const k of ['val', 'cand', 'ppl']) expect(own, k).not.toContain(k)
  })

  it('the news can speak of any kind', () => {
    for (const k of ['mkt', 'riv', 'val', 'cand', 'odds', 'whatever']) expect(reads('news', k), k).toBe(true)
  })

  it('no source reads a hint key: those are fogged by talent alone', () => {
    for (const id of ids().filter((x) => x !== 'news')) expect(reads(id, 'hint'), id).toBe(false)
  })
})

describe('era: some sources do not exist yet', () => {
  it('a hacker needs the internet where the character lives', () => {
    const old = makeTestGame(1, { age: 30, countryId: 'us' })
    old.year = 1960
    expect(eraBlock(old, 'hacker')).not.toBeNull()
    const now = makeTestGame(1, { age: 30, countryId: 'us' })
    expect(now.year).toBe(2026)
    expect(eraBlock(now, 'hacker')).toBeNull()
  })

  it('a report and an analyst need a research trade, and the older sources are always there', () => {
    const g = makeTestGame(1, { age: 30 })
    g.year = 1915
    expect(eraBlock(g, 'report')).not.toBeNull()
    expect(eraBlock(g, 'analyst')).not.toBeNull()
    for (const id of ['press', 'diligence', 'investigator', 'informant', 'own', 'news', 'lab'] as const) expect(eraBlock(g, id), id).toBeNull()
    g.year = 1960
    expect(eraBlock(g, 'report')).toBeNull()
    expect(eraBlock(g, 'analyst')).toBeNull()
  })

  it('the reason is plain words, short enough for a button, and has no dash', () => {
    const g = makeTestGame(1, { age: 30 })
    g.year = 1915
    for (const id of ['report', 'analyst', 'hacker'] as const) {
      const why = eraBlock(g, id)
      if (why) {
        expect(why.length).toBeLessThanOrEqual(70)
        expect(/[\u2013\u2014]/.test(why)).toBe(false)
      }
    }
  })
})

describe('kinds: how an owner says where the truth of a key lives', () => {
  const def = (kind: string): KeyKind => ({
    kind,
    label: (_g, key) => `thing ${key}`,
    truth: () => 5,
  })

  // The names here are synthetic (tmk, trv, tod): the game registers scn, riv, mkt, val, odds and sec itself (Fog track, R3-G), and a
  // test that registered one of those with a def of its own would meet the game's def and throw.
  it('registers a kind and finds it again', () => {
    const d = def('tmk')
    registerKeyKind(d)
    expect(kindOf('tmk')?.kind).toBe('tmk')
    expect(kindOf('nothing')).toBeNull()
  })

  it('takes the same def twice, and the same code again (a reloaded module)', () => {
    const d = def('trv')
    registerKeyKind(d)
    expect(() => registerKeyKind(d)).not.toThrow()
    expect(() => registerKeyKind(def('trv'))).not.toThrow()
  })

  it('refuses a different def for a taken kind', () => {
    registerKeyKind(def('cmp'))
    expect(() => registerKeyKind({ ...def('cmp'), truth: () => 99 })).toThrow(/cmp/)
    expect(() => registerKeyKind({ ...def('cmp'), scope: () => ({ tier: 2 }) })).toThrow(/cmp/)
    expect(kindOf('cmp')?.truth(makeTestGame(1), 'cmp:a:score')).toBe(5)
  })

  it('refuses a kind name that cannot start a key, and a def with no functions', () => {
    for (const bad of ['', 'Mkt', 'a:b', '1x', 'toolongkindname1', 'a b']) expect(() => registerKeyKind(def(bad)), bad).toThrow()
    expect(() => registerKeyKind({ kind: 'sec' } as never)).toThrow()
    expect(() => registerKeyKind(null as never)).toThrow()
  })

  it('keeps the registry apart from the game: registering writes no state', () => {
    const g = makeTestGame(1)
    const before = JSON.stringify(g)
    registerKeyKind(def('tod'))
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('the ceiling rows of this track', () => {
  it('has the three rows (floors, price, record keys), and each presses on its limit at 100 times without passing it at 1 or 100', () => {
    for (const id of ['intel-floors', 'intel-price', 'know-keys']) {
      const probe = CEILING_PROBES.find((p) => p.id === id)
      expect(probe, id).toBeDefined()
      const one = probe!.run(1)
      expect(one.value, `${id} at 1: ${one.value} against ${one.limit}`).toBeLessThanOrEqual(one.limit)
      // At 100 times the input the term sits on its cap: if a probe stopped scaling its input it would fall back to the 1x value.
      const r = probe!.run(100)
      expect(r.value, `${id} at 100: ${r.value} against ${r.limit}`).toBeLessThanOrEqual(r.limit)
      expect(r.value, `${id} at 100: ${r.value} against ${r.limit}`).toBeGreaterThanOrEqual(r.limit * 0.999)
    }
  }, 60_000)
})
