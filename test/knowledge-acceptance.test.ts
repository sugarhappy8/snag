// R3-H6 (H.1, H.2, H.3, H.13): the acceptance sweep of the Knowledge track. The unit files (estimate, record, sources, intel, hub,
// yearly, fence) prove one piece each; this file proves that the pieces hold together as the roadmap states them. It is written to run
// green on the merged lane and to go red when any piece is taken out.
//
//   (a) honest    a shown band holds the truth 77% to 83% of 10,000 draws: passive, every source, merged, decayed, with a talent
//   (b) stable    the same source twice in a year reads the same number for 200 keys, and a repeat buy changes neither money nor JSON
//   (c) pure      a fog life at 40 with a company, a record, orders and heat, deep-frozen: every menu renders, g.rng does not move
//   (d) no foresight   the hub, every Look closer group and every buy ask for no market year after g.year, with and without Investing
//   (e) money     after buying every source the books balance and the `intel` and `bribe` flows net to zero and equal the fees
//   (f) long run  100 years of orders at level 3: at most 120 rows and 400 nodes, a fee that is flat from 1x to 100x of the cash
//   (g) the mode  the simulation never reads it: one seeded life played in Exact and in Realistic ends with the same JSON
//   (h) the fence the folder has its files, and the fence test that scans them exists
//   (i) the docs  docs/KNOWLEDGE.md has no dash characters and names every export of knowledge/contract.ts
//   (j) the rules a rule row for every key family the Fog track registers; one owner per key kind
//
// The suite runs in Exact (test/setup-exact.ts). Every Realistic case goes through inFog (test/knowledge-kit.ts).
import { describe, expect, it, vi } from 'vitest'

const asked = vi.hoisted(() => ({ years: [] as number[] }))

// The spy of (d) wraps the four market readers and records the year each call asked for (the pattern of foresight-scan.test.ts).
vi.mock('../src/game/invest/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/invest/engine')>()
  return {
    ...real,
    exchangeYear: (...args: Parameters<typeof real.exchangeYear>) => {
      asked.years.push(args[3])
      return real.exchangeYear(...args)
    },
    cryptoYear: (...args: Parameters<typeof real.cryptoYear>) => {
      asked.years.push(args[2])
      return real.cryptoYear(...args)
    },
    goldYear: (...args: Parameters<typeof real.goldYear>) => {
      asked.years.push(args[2])
      return real.goldYear(...args)
    },
    fxYear: (...args: Parameters<typeof real.fxYear>) => {
      asked.years.push(args[2])
      return real.fxYear(...args)
    },
  }
})

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { countNodes } from '../scripts/r1-parity-lib.mjs'
import { ageUp } from '../src/game/aging'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { investmentsMenu } from '../src/game/investments'
import { checkLedger, flowsOf, type AcctClass } from '../src/game/kernel/ledger'
import {
  KNOW_FLAG,
  KNOW_LIMITS,
  buyIntel,
  ingestSignal,
  intelBriefingMenu,
  know,
  learn,
  lookCloser,
  offersFor,
  readKnow,
  storedEstimates,
  takeReading,
  withInfoMode,
  type InfoMode,
} from '../src/game/knowledge/contract'
import { MAX_KEYS, quoteIntel } from '../src/game/knowledge/intel'
import { RULES, parseKey, ruleOf } from '../src/game/knowledge/keys'
import { kindOf, registerKeyKind } from '../src/game/knowledge/kinds'
import { yearlyKnowledge } from '../src/game/knowledge/module'
import { zOf } from '../src/game/knowledge/normal'
import { hazardOf } from '../src/game/knowledge/risk'
import { SOURCES, SOURCE_IDS, priceOf, readingSd, reads, type SourceId } from '../src/game/knowledge/sources'
import { PRESS_FEES_MAX, describeOrders, ordersFor, quoteOrders, setDial } from '../src/game/knowledge/standing'
import type { Unit } from '../src/game/knowledge/types'
import { getCountry } from '../src/game/world'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { FailureLog, formatFailures, renderAll } from './fuzz-kit'
import { coverage, deepFreeze, fogGame, inFog, keyRange, nextYear, pad, readerGame, registerTestKinds, richLife, testTruth, unitAt } from './knowledge-kit'
import { makeTestGame } from './helpers'
import { ROOT, K_ID, isPunct, loadSources } from './scan-kit'

// ---------------------------------------------------------------------------------------------------------------------------------
// The world of the test: key kinds with pure truths, and the keys of each family

registerTestKinds(['mkt', 'riv', 'val', 'cand', 'sec', 'fund', 'cmp', 'eco'])

const MKT = (i: number): string => `mkt:c${pad(i)}:size`
const RIV = (i: number): string => `riv:r${pad(i)}:quality`
const VAL = (i: number): string => `val:a${pad(i)}:value`
const CAND = (i: number): string => `cand:k${pad(i)}:skill`
const SEC = (i: number): string => `sec:s${pad(i)}:vol`
const FUND = (i: number): string => `fund:f${pad(i)}:ret`

const N = 10_000
const LOW = 0.77
const HIGH = 0.83

function inBand(share: number, label: string): void {
  expect(share, `${label}: ${share}`).toBeGreaterThan(LOW)
  expect(share, `${label}: ${share}`).toBeLessThan(HIGH)
}

const chunks = <T>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

const actionsOf = (nodes: readonly MenuNode[]): MenuAction[] => nodes.filter((n): n is MenuAction => n.type === 'action')
const blocked = (a: MenuAction, g: GameState): string | null => (a.disabledReason ? a.disabledReason(g) : null)
const rowOf = (g: GameState, key: string) => readKnow(g)?.k[key] ?? null

// ---------------------------------------------------------------------------------------------------------------------------------
// (a) honest

describe('(a) honest: a shown band holds the truth 77% to 83% of 10,000 draws', () => {
  const base = richLife()
  const gifted = richLife({ talents: ['Business'] })

  interface Passive {
    key: string
    unit: Unit
    truth: (i: number) => number
    opts?: { scale?: number }
  }
  const PASSIVE: Passive[] = [
    { key: 'mkt:ind:us:size', unit: 'money', truth: (i) => 10 ** (4 + 7 * unitAt('a-money', i)) },
    { key: 'mkt:ind:us:outlets', unit: 'count', truth: (i) => 10 ** (1 + 6 * unitAt('a-count', i)) },
    { key: 'sec:s1:vol', unit: 'pct', truth: (i) => 0.01 + 0.6 * unitAt('a-pct', i) },
    { key: 'riv:r1:quality', unit: 'score', truth: (i) => 35 + 30 * unitAt('a-score', i) },
    { key: 'odds:o1:p', unit: 'odds', truth: (i) => 0.3 + 0.4 * unitAt('a-odds', i) },
    { key: 'scn:s1:value', unit: 'delta', truth: (i) => -50e6 + 100e6 * unitAt('a-delta', i), opts: { scale: 2e8 } },
  ]

  it('passive reads: every unit, each draw its own life', () => {
    for (const c of PASSIVE) {
      expect(ruleOf(c.key)!.unit, c.key).toBe(c.unit)
      const share = inFog(() =>
        coverage(N, (i) => {
          const truth = c.truth(i)
          return { est: know(fogGame(i), c.key, truth, c.opts), truth }
        }),
      )
      inBand(share, `passive ${c.unit} ${c.key}`)
    }
  })

  // One key each source reads, on a scale where the source's own noise does not run into the end of the range.
  const SOURCE_CASES: Array<[SourceId, string, (i: number) => number]> = [
    ['own', 'mkt:ind:us:size', (i) => 10 ** (5 + 4 * unitAt('s-own', i))],
    ['news', 'eco:us:rate', (i) => 0.02 + 0.08 * unitAt('s-news', i)],
    ['press', 'sec:s1:vol', (i) => 0.05 + 0.4 * unitAt('s-press', i)],
    ['report', 'mkt:ind:us:size', (i) => 10 ** (5 + 4 * unitAt('s-report', i))],
    ['analyst', 'val:a1:value', (i) => 10 ** (5 + 4 * unitAt('s-analyst', i))],
    ['diligence', 'cand:k1:skill', (i) => 40 + 20 * unitAt('s-diligence', i)],
    ['investigator', 'riv:r1:quality', (i) => 40 + 20 * unitAt('s-investigator', i)],
    ['informant', 'mkt:ind:us:size', (i) => 10 ** (5 + 4 * unitAt('s-informant', i))],
    ['hacker', 'val:a1:value', (i) => 10 ** (5 + 4 * unitAt('s-hacker', i))],
    ['desk', 'fund:f1:ret', (i) => 0.03 + 0.3 * unitAt('s-desk', i)],
    ['lab', 'mkt:ind:us:size', (i) => 10 ** (5 + 4 * unitAt('s-lab', i))],
  ]

  it('every source: the band of a stored reading holds the truth (the legal ones, the illegal ones, the free ones)', () => {
    expect(SOURCE_CASES.map(([src]) => src).sort()).toEqual([...SOURCE_IDS].sort())
    inFog(() => {
      for (const [src, key, truthAt] of SOURCE_CASES) {
        const share = coverage(N, (i) => {
          const g = readerGame(base, `cov-${src}-${i}`)
          const truth = truthAt(i)
          expect(takeReading(g, src, key, truth), `${src} read nothing for draw ${i}`).not.toBeNull()
          // the band of the reading itself (what the record holds), not the passive read know() may prefer when a source is weak
          const stored = storedEstimates(g)
          expect(stored).toHaveLength(1)
          expect(stored[0]!.src).toBe(src)
          return { est: stored[0]!, truth }
        })
        inBand(share, `source ${src}`)
      }
    })
  }, 120_000)

  it('two sources in one year, merged: the row is sharper than either and its band holds', () => {
    const key = 'mkt:ind:us:size'
    const share = inFog(() =>
      coverage(N, (i) => {
        const g = readerGame(base, `merge-${i}`)
        const truth = 10 ** (5 + 4 * unitAt('merge', i))
        expect(takeReading(g, 'press', key, truth)).not.toBeNull()
        const merged = takeReading(g, 'report', key, truth)!
        expect(merged.src).toBe('press+report')
        expect(merged.sd).toBeLessThan(0.18)
        return { est: know(g, key, truth), truth }
      }),
    )
    inBand(share, 'press + report')
  })

  it('two sources a year or two apart, merged: the band holds, and "as of" is the year of the last read', () => {
    const key = 'cand:k1:skill'
    const share = inFog(() =>
      coverage(N, (i) => {
        const g = readerGame(base, `across-${i}`, 2023)
        const truth = 40 + 20 * unitAt('across', i)
        expect(takeReading(g, 'investigator', key, truth)).not.toBeNull()
        g.year = 2025
        expect(takeReading(g, 'diligence', key, truth)).not.toBeNull()
        g.year = 2027
        const est = know(g, key, truth)
        expect(est.asOf).toBe(2025)
        expect(est.sd).toBeLessThan(0.14)
        return { est, truth }
      }),
    )
    inBand(share, 'investigator then diligence')
  })

  it('decayed rows: the truth walks by its drift while the row ages, and the band follows it', () => {
    // mkt.size drifts .06 a year (3 years old), riv.cash drifts .35 (1 year old): the aged row is the sharper read, and still honest
    const cases: Array<[string, number, number]> = [
      ['mkt:ind:us:size', 0.06, 3],
      ['riv:r1:cash', 0.35, 1],
    ]
    for (const [key, drift, years] of cases) {
      expect(ruleOf(key)!.drift, key).toBe(drift)
      let aged = 0
      const share = inFog(() =>
        coverage(N, (i) => {
          const g = readerGame(base, `decay-${key}-${i}`, 2022)
          const truth = 10 ** (5 + 4 * unitAt('decay', i))
          expect(takeReading(g, 'report', key, truth)).not.toBeNull()
          const moved = truth * Math.exp(drift * Math.sqrt(years) * zOf(g, key, 2022, 'drift'))
          g.year += years
          const est = know(g, key, moved)
          if (est.src === 'report' && (years < 2 || est.asOf === 2022)) aged++
          return { est, truth: moved }
        }),
      )
      inBand(share, `decayed ${key}`)
      expect(aged, key).toBe(N)
    }
  })

  it('a talent: the Business talent sharpens the passive read (x.6) and a source (x.8), and the bands still hold', () => {
    const key = 'riv:r1:quality'
    const plain = inFog(() => know(fogGame(1), key, 50))
    const sharp = inFog(() => know(fogGame(1, { talents: ['Business'] }), key, 50))
    expect(sharp.sd).toBeCloseTo(plain.sd * 0.6, 9)
    inBand(
      inFog(() =>
        coverage(N, (i) => {
          const truth = 35 + 30 * unitAt('t-passive', i)
          return { est: know(fogGame(i, { talents: ['Business'] }), key, truth), truth }
        }),
      ),
      'talent, passive',
    )
    inBand(
      inFog(() =>
        coverage(N, (i) => {
          const g = readerGame(gifted, `talent-${i}`)
          const truth = 10 ** (5 + 4 * unitAt('t-source', i))
          const est = takeReading(g, 'report', 'mkt:ind:us:size', truth)!
          expect(est.sd).toBeCloseTo(0.144, 9)
          return { est, truth }
        }),
      ),
      'talent, report',
    )
  })

  it('the floors: no source reads sharper than its floor, whatever the spend, the quality or the talent', () => {
    const floors: Array<[SourceId, number]> = [
      ['press', 0.2],
      ['report', 0.12],
      ['analyst', 0.08],
      ['diligence', 0.03],
    ]
    for (const [src, floor] of floors) expect(SOURCES[src].floor, src).toBe(floor)
    for (const src of ['informant', 'hacker'] as const) expect(SOURCES[src].floor, src).toBeGreaterThanOrEqual(0.05)
    for (const src of SOURCE_IDS) {
      for (const spend of [1, 100, 1e4, 1e8]) {
        for (const quality of [0, 0.5, 1]) {
          for (const talent of [false, true]) expect(readingSd(src, { quality, spend, ref: 1, talent }), `${src} ${spend} ${quality} ${talent}`).toBeGreaterThanOrEqual(SOURCES[src].floor)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (b) stable

describe('(b) stable: the same source twice in a year', () => {
  const FAMILY: Record<string, (i: number) => string> = {
    own: MKT,
    press: MKT,
    report: MKT,
    analyst: MKT,
    diligence: VAL,
    investigator: RIV,
    informant: RIV,
    hacker: VAL,
    desk: MKT,
    news: MKT,
    lab: RIV,
  }

  /** One call's worth of keys from one source (a call reads at most MAX_KEYS; the news and the lab are read key by key). */
  function readPart(g: GameState, src: SourceId, keys: readonly string[]): Array<{ ok: boolean; why?: string }> {
    return inFog(() => {
      if (src === 'news') return keys.map((key) => ({ ok: ingestSignal(g, { key, v: testTruth(key) * 1.1 }) }))
      if (src === 'lab') return keys.map((key) => ({ ok: takeReading(g, 'lab', key, testTruth(key)) !== null }))
      return [buyIntel(g, src, keys, src === 'desk' ? { standing: true } : {})]
    })
  }

  for (const src of Object.keys(FAMILY) as SourceId[]) {
    it(`${src}: 200 keys read the same in two fresh lives, another year reads another, and a repeat changes nothing`, () => {
      const keys = keyRange(200, FAMILY[src]!)
      // the do-it-yourself read has three uses a year (36 keys); the record keeps 120 rows, so the stalest of 200 are shed as the rest are read
      const used = src === 'own' ? keys.slice(0, 3 * MAX_KEYS) : keys
      const make = (year?: number): GameState => richLife({ lifeId: `twin-${src}`, money: 50_000_000, ...(year ? { year } : {}) })
      const a = make()
      const b = make()
      const parts = chunks(used, MAX_KEYS)
      for (const part of parts) {
        const first = readPart(a, src, part)
        readPart(b, src, part)
        expect(first.every((r) => r.ok), `${src} ${JSON.stringify(first.find((r) => !r.ok))}`).toBe(true)
        // the same number in both lives, the moment it is read (before the cap sheds it)
        for (const key of part) {
          expect(rowOf(a, key), key).not.toBeNull()
          expect(rowOf(a, key), key).toEqual(rowOf(b, key))
        }
      }
      expect(a.character.money).toBe(b.character.money)
      expect(Object.keys(readKnow(a)!.k)).toHaveLength(Math.min(used.length, KNOW_LIMITS.keys))

      // another year, another reading
      const later = make(2027)
      for (const part of parts) readPart(later, src, part)
      const probe = used[used.length - 1]!
      expect(rowOf(later, probe)!.mid).not.toBe(rowOf(a, probe)!.mid)

      // the same source again in the same year, for what the record still holds: refused, and neither the money nor the JSON moves
      const held = new Set(Object.keys(readKnow(a)!.k))
      const again = parts.filter((part) => part.every((key) => held.has(key)))
      expect(again.length).toBeGreaterThan(0)
      const json = JSON.stringify(a)
      const cash = a.character.money
      for (const part of again) {
        const out = readPart(a, src, part)
        expect(out.every((r) => !r.ok), `${src} repeat`).toBe(true)
        for (const r of out) if (r.why !== undefined) expect(r.why).toMatch(/already/i)
      }
      expect(a.character.money).toBe(cash)
      expect(JSON.stringify(a)).toBe(json)
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (c) pure

/** A life of 40 in a fog year: a company, readings of three ages, the orders at level 3 and the heat of an informant. */
function fogLife(lifeId = 'accept-fog'): GameState {
  const g = richLife({ lifeId, money: 30_000_000, year: 2020 })
  const city = getCountry(g.character.countryId).cities[0]!
  g.assets.push(createBusinessAsset(g, 'Corner Kitchen', newBiz(g, 'restaurant', g.character.countryId, city, { cash: 400_000, share: 1 }), 100_000))
  inFog(() => {
    expect(buyIntel(g, 'report', keyRange(8, MKT)).ok).toBe(true)
    g.year = 2023
    expect(buyIntel(g, 'analyst', [...keyRange(4, RIV), ...keyRange(3, SEC)]).ok).toBe(true)
    g.year = 2026
    expect(buyIntel(g, 'press', keyRange(5, MKT, 4)).ok).toBe(true)
    expect(buyIntel(g, 'informant', keyRange(2, RIV)).ok).toBe(true)
  })
  setDial(g, 3)
  g.character.age += 6
  return g
}

describe('(c) pure: no g.rng in a read', () => {
  it('a fog life with a company, a record, orders and heat renders every menu on a deep-frozen state', () => {
    const g = fogLife()
    expect(readKnow(g)).not.toBeNull()
    const before = JSON.stringify(g)
    const rng = JSON.stringify(g.rng)
    const log = new FailureLog()
    const seen = inFog(() => renderAll(g, log, 4))
    expect(log.size, formatFailures(log)).toBe(0)
    expect(JSON.stringify(g.rng)).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
    // the walk really went into the hub: with the record taken out there is less to see
    const bare = structuredClone(g)
    delete bare.flags[KNOW_FLAG]
    expect(seen - inFog(() => renderAll(bare, new FailureLog(), 4))).toBeGreaterThan(0)
  })

  it('every pure read of the track on a frozen life: the estimates, the offers, Look closer, the hub, the orders and the heat', () => {
    const g = deepFreeze(structuredClone(fogLife('accept-fog-2')))
    const before = JSON.stringify(g)
    const rng = g.rng
    const rngJson = JSON.stringify(g.rng)
    inFog(() => {
      for (const key of [...keyRange(8, MKT), ...keyRange(4, RIV), ...keyRange(3, SEC)]) {
        const e = know(g, key, testTruth(key))
        expect(Number.isFinite(e.lo) && Number.isFinite(e.hi) && Number.isFinite(e.mid)).toBe(true)
      }
      expect(storedEstimates(g).length).toBeGreaterThan(10)
      expect(offersFor(g, keyRange(5, MKT)).length).toBeGreaterThan(4)
      for (const scope of [{ id: 'market', keys: keyRange(5, MKT, 20) }, { id: 'rivals', keys: keyRange(3, RIV, 20) }, { id: 'stocks', keys: keyRange(3, SEC, 20) }]) {
        const grp = lookCloser(g, scope) as MenuGroup
        expect(grp, scope.id).not.toBeNull()
        expect(actionsOf(grp.children(g)).length).toBeGreaterThan(0)
        grp.header?.(g)
      }
      const rows = intelBriefingMenu.children(g)
      expect(rows.length).toBeGreaterThan(5)
      expect(intelBriefingMenu.visible!(g)).toBe(true)
      if (typeof intelBriefingMenu.subtitle === 'function') intelBriefingMenu.subtitle(g)
      for (const level of [0, 1, 2, 3]) {
        quoteOrders(g, level)
        ordersFor(g, level)
        describeOrders(g, level)
      }
      expect(hazardOf(g).h).toBeGreaterThan(0)
      quoteIntel(g, 'report', keyRange(3, MKT))
    })
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g.rng)).toBe(rngJson)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('knowledge/** has no way to draw but one named stream: no rand, chance, pick, shuffle, .rng, Math.random or Date', () => {
    const files = loadSources(ROOT, 'src/game/knowledge')
    expect(files.length).toBeGreaterThanOrEqual(8)
    const BANNED = new Set(['rand', 'randInt', 'randFloat', 'chance', 'pick', 'weightedPick', 'shuffle', 'bell', 'Date', 'uid'])
    const found: string[] = []
    const streams: string[] = []
    for (const f of files) {
      f.toks.forEach((t, i) => {
        if (t.k !== K_ID) return
        const prev = f.toks[i - 1]
        if (BANNED.has(t.v)) found.push(`${f.path}: ${t.v}`)
        if (t.v === 'rng' && isPunct(prev, '.')) found.push(`${f.path}: .rng`)
        if (t.v === 'random' && isPunct(prev, '.') && f.toks[i - 2]?.v === 'Math') found.push(`${f.path}: Math.random`)
        if (t.v === 'outcomeStream' && isPunct(f.toks[i + 1], '(')) streams.push(f.path)
      })
    }
    expect(found).toEqual([])
    // the one place that rolls is the yearly heat of the illegal sources, from the named stream `intel.risk`
    expect([...new Set(streams)]).toEqual(['src/game/knowledge/risk.ts'])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (d) no foresight

describe('(d) no foresight: nothing here asks for a market year after g.year', () => {
  /**
   * Everything the track does with the market-facing kinds, on a life that can pay: reads, buys, Look closer, the hub, the orders, two
   * years. `audit` runs after each step and gets the year in force at that moment, because the clock moves during the battery.
   */
  function battery(g: GameState, audit: (step: string) => void): void {
    const keys = [...keyRange(6, MKT), ...keyRange(4, RIV), ...keyRange(3, SEC), ...keyRange(3, VAL), ...keyRange(2, CAND), ...keyRange(2, FUND)]
    inFog(() => {
      for (const src of SOURCE_IDS) {
        buyIntel(g, src, keys, src === 'desk' ? { standing: true } : {})
        audit(`buy ${src}`)
      }
      ingestSignal(g, { key: MKT(30), v: 3e6 })
      takeReading(g, 'lab', RIV(30), 55)
      for (const key of keys) know(g, key, testTruth(key))
      storedEstimates(g)
      audit('reads')
      for (const scope of [{ id: 'a', keys: keyRange(5, MKT, 40) }, { id: 'b', keys: keyRange(4, SEC, 10) }, { id: 'c', keys: keyRange(3, VAL, 10) }, { id: 'd', keys: keyRange(3, FUND, 10) }]) {
        const grp = lookCloser(g, scope)
        if (grp) for (const a of actionsOf(grp.children(g))) if (blocked(a, g) === null) a.run(g)
        audit(`look closer ${scope.id}`)
      }
      for (const a of actionsOf(intelBriefingMenu.children(g))) if (!a.input && blocked(a, g) === null) a.run(g)
      audit('the hub')
      for (let n = 0; n < 2; n++) {
        setDial(g, 3)
        yearlyKnowledge(g)
        audit(`the yearly step of ${g.year}`)
        nextYear(g)
      }
    })
  }

  /** The news of the exchange: reads exchangeYear for g.year and earlier (analyst-tip.test.ts). */
  function newsLines(g: GameState): void {
    const news = investmentsMenu.children(g).find((n) => n.id === 'inv-news') as MenuGroup
    news.children(g)
  }

  for (const talents of [[], ['Investing']] as const) {
    it(`${talents.length ? 'with' : 'without'} the Investing talent: the whole track asks for no year after g.year`, () => {
      const g = richLife({ lifeId: `foresight-${talents.length}`, money: 80_000_000, talents })
      asked.years.length = 0
      const late: string[] = []
      battery(g, (step) => {
        for (const y of asked.years) if (y > g.year) late.push(`${step}: asked ${y} in ${g.year}`)
        asked.years.length = 0
      })
      expect(late).toEqual([])

      // the spy is live: the market's own news does ask for the market (this year at most, and next year only through the gut)
      asked.years.length = 0
      newsLines(g)
      expect(asked.years.length, 'the exchange news asked for nothing: the spy is not wired').toBeGreaterThan(0)
      expect(Math.max(...asked.years)).toBeLessThanOrEqual(g.year + (talents.length ? 1 : 0))
    })
  }

  it('a row stamped after g.year is dropped, so a jump back in time shows no future reading', () => {
    const g = richLife({ lifeId: 'foresight-rows' })
    g.year = 2030
    inFog(() => expect(buyIntel(g, 'report', keyRange(3, MKT)).ok).toBe(true))
    expect(Object.keys(readKnow(g)!.k)).toHaveLength(3)
    g.year = 2026
    const e = inFog(() => know(g, MKT(0), testTruth(MKT(0))))
    expect(e.src).toBe('passive')
    expect(Object.keys(readKnow(g)!.k)).toHaveLength(0)
    expect(inFog(() => storedEstimates(g))).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (e) money

describe('(e) money: every fee is booked once, with a reason, and the books balance', () => {
  const PLAN: Array<[SourceId, (i: number) => string]> = [
    ['own', MKT],
    ['press', MKT],
    ['report', MKT],
    ['analyst', MKT],
    ['diligence', VAL],
    ['investigator', RIV],
    ['informant', RIV],
    ['hacker', VAL],
  ]

  const net = (r: { net: Record<AcctClass, number> }): number => Object.values(r.net).reduce((s, v) => s + v, 0)

  it('after buying every source: checkLedger is ok, the intel and bribe flows net to zero and equal the cash that left', () => {
    const g = richLife({ lifeId: 'accept-money', money: 90_000_000 })
    let legal = 0
    let illegal = 0
    inFog(() => {
      for (const [src, shape] of PLAN) {
        const cash = g.character.money
        expect(buyIntel(g, src, keyRange(MAX_KEYS, shape)), src).toEqual({ ok: true })
        const fee = cash - g.character.money
        if (src === 'own') expect(fee).toBe(0)
        else expect(fee, src).toBeGreaterThan(0)
        if (SOURCES[src].kind === 'illegal') illegal += fee
        else legal += fee
      }
    })
    expect(legal).toBeGreaterThan(0)
    expect(illegal).toBeGreaterThan(0)
    const check = checkLedger(g)
    expect(check.ok, check.problems.join('; ')).toBe(true)
    const rows = flowsOf(g, g.year)
    const intel = rows.filter((r) => r.reason === 'intel')
    const bribe = rows.filter((r) => r.reason === 'bribe')
    expect(intel.length).toBeGreaterThan(0)
    expect(bribe.length).toBeGreaterThan(0)
    for (const r of [...intel, ...bribe]) expect(net(r), `${r.reason} row`).toBe(0)
    expect(-intel.reduce((s, r) => s + r.net.person, 0)).toBe(legal)
    expect(-bribe.reduce((s, r) => s + r.net.person, 0)).toBe(illegal)
    // every reason the track books exists in the vocabulary of the books (no unreasoned call)
    expect(rows.every((r) => typeof r.reason === 'string' && r.reason.length > 0)).toBe(true)
  })

  it('the standing orders book their fees the same way, in a year, once', () => {
    const g = richLife({ lifeId: 'accept-orders', money: 30_000_000 })
    for (const key of [...keyRange(12, MKT), ...keyRange(6, RIV)]) learn(g, key, { mid: testTruth(key) * 1.1, sd: 0.2, src: 'report' })
    nextYear(g)
    setDial(g, 3)
    const cash = g.character.money
    const quote = quoteOrders(g, 3).fee
    yearlyKnowledge(g)
    const paid = cash - g.character.money
    expect(paid).toBe(quote)
    expect(paid).toBeGreaterThan(0)
    const check = checkLedger(g)
    expect(check.ok, check.problems.join('; ')).toBe(true)
    const rows = flowsOf(g, g.year).filter((r) => r.reason === 'intel')
    expect(rows.reduce((s, r) => s - r.net.person, 0)).toBe(paid)
    for (const r of rows) expect(net(r)).toBe(0)
    // a second step in the same year charges nothing more
    yearlyKnowledge(g)
    expect(cash - g.character.money).toBe(paid)
  })

  it('a fee is the scope, never the cash: 1x and 100x the money pay the same', () => {
    const fee = (money: number): number => {
      const g = richLife({ lifeId: 'accept-flat', money })
      const before = g.character.money
      expect(inFog(() => buyIntel(g, 'analyst', keyRange(6, MKT))).ok).toBe(true)
      return before - g.character.money
    }
    expect(fee(40_000_000)).toBe(fee(4_000_000_000))
    expect(fee(40_000_000)).toBe(priceOf('analyst', { tier: 1, country: 'us' }))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (f) the long run

describe('(f) long run: 100 years of standing orders at level 3', () => {
  const YEARS = 100

  /** 30 keys read at the start; each year the player is topped up to `money` and the module's step runs. Returns the fee of every year. */
  function orderedLife(money: number): { fees: number[]; g: GameState } {
    const g = richLife({ lifeId: 'accept-long', money })
    const keys = [...keyRange(10, MKT), ...keyRange(10, RIV), ...keyRange(10, CAND)]
    for (const key of keys) learn(g, key, { mid: testTruth(key) * 1.1, sd: 0.2, src: 'report' })
    setDial(g, 3)
    const fees: number[] = []
    inFog(() => {
      for (let n = 0; n < YEARS; n++) {
        nextYear(g)
        g.character.money = money
        const quote = quoteOrders(g, 3).fee
        yearlyKnowledge(g)
        const paid = money - g.character.money
        expect(paid, `year ${g.year}`).toBe(quote)
        fees.push(paid)
        const rec = g.flags[KNOW_FLAG] as { k: Record<string, string> } | undefined
        if (rec) {
          expect(Object.keys(rec.k).length, `rows in ${g.year}`).toBeLessThanOrEqual(KNOW_LIMITS.keys)
          expect(countNodes(rec), `nodes in ${g.year}`).toBeLessThanOrEqual(400)
        }
      }
    })
    return { fees, g }
  }

  it('the fee is flat from 1x to 100x of the cash, year after year, and the record stays small', () => {
    const poor = orderedLife(5_000_000)
    const rich = orderedLife(500_000_000)
    expect(rich.fees).toEqual(poor.fees)
    // the candidates are read by no order, so they fade out; the other 20 numbers are kept fresh for good
    const steady = poor.fees.slice(14)
    expect(steady.length).toBe(YEARS - 14)
    expect(steady[0]).toBeGreaterThan(0)
    expect(new Set(steady).size).toBe(1)
    const rec = poor.g.flags[KNOW_FLAG] as { k: Record<string, string> }
    expect(Object.keys(rec.k)).toHaveLength(20)
    for (const row of Object.values(rec.k)) expect(Number(row.split('|')[2])).toBe(poor.g.year)
    expect(countNodes(rec)).toBeLessThanOrEqual(400)
    expect(JSON.parse(JSON.stringify(rec))).toEqual(rec)
    const check = checkLedger(poor.g)
    expect(check.ok, check.problems.join('; ')).toBe(true)
  }, 60_000)

  it('a life that reads twelve new numbers every year for 100 years never holds more than 120 rows or 400 nodes, and the fee has a ceiling', () => {
    const money = 50_000_000
    const g = richLife({ lifeId: 'accept-flood', money })
    setDial(g, 3)
    const ceiling = PRESS_FEES_MAX * priceOf('press', { tier: 1, country: 'us' }) + priceOf('desk', { tier: 1, country: 'us' })
    let peak = 0
    inFog(() => {
      for (let n = 0; n < YEARS; n++) {
        nextYear(g)
        g.character.money = money
        for (let i = 0; i < 12; i++) {
          const key = `mkt:y${g.year}k${pad(i)}:size`
          expect(learn(g, key, { mid: testTruth(key), sd: 0.2, src: 'report' }), key).not.toBeNull()
        }
        yearlyKnowledge(g)
        const fee = money - g.character.money
        expect(fee, `fee in ${g.year}`).toBeLessThanOrEqual(ceiling)
        const rec = g.flags[KNOW_FLAG] as { k: Record<string, string> }
        peak = Math.max(peak, Object.keys(rec.k).length)
        expect(Object.keys(rec.k).length).toBeLessThanOrEqual(KNOW_LIMITS.keys)
        expect(countNodes(rec)).toBeLessThanOrEqual(400)
      }
    })
    expect(peak).toBeGreaterThan(60)
    expect(KNOW_LIMITS.keys).toBe(120)
    const check = checkLedger(g)
    expect(check.ok, check.problems.join('; ')).toBe(true)
  }, 60_000)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (g) the mode

describe('(g) the simulation never reads the information mode', () => {
  const LIVES = [3, 5] as const

  /** A life of 30 with a record, readings and orders at level 2, played 15 years through the real aging step in one mode. */
  function played(seed: number, mode: InfoMode): { json: string; years: number; fresh: number } {
    return withInfoMode(mode, () => {
      const g = makeTestGame(seed, { age: 30, money: 40_000_000 })
      g.lifeId = `mode-${seed}`
      g.year = 2026
      for (const key of [...keyRange(6, MKT), ...keyRange(4, RIV)]) learn(g, key, { mid: testTruth(key) * 1.15, sd: 0.2, src: 'report' })
      setDial(g, 2)
      let years = 0
      for (let n = 0; n < 15 && g.character.alive; n++) {
        ageUp(g)
        g.queue = []
        years++
      }
      const rec = readKnow(g)
      const fresh = rec ? Object.values(rec.k).filter((r) => r.y >= g.year - 1).length : 0
      return { json: JSON.stringify(g), years, fresh }
    })
  }

  for (const seed of LIVES) {
    it(`life ${seed}: 15 years in Exact and in Realistic end with the same JSON, and the orders ran in both`, () => {
      const exact = played(seed, 'exact')
      const fog = played(seed, 'realistic')
      expect(exact.years).toBeGreaterThanOrEqual(10)
      expect(fog.years).toBe(exact.years)
      expect(exact.fresh, 'the standing orders kept numbers fresh').toBeGreaterThan(0)
      expect(fog.fresh).toBe(exact.fresh)
      expect(fog.json === exact.json).toBe(true)
    }, 60_000)
  }
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (h) the fence

describe('(h) the folder and its fence', () => {
  it('src/game/knowledge/ holds at least 8 files, and the fence test that scans them is in the suite', () => {
    const files = readdirSync(join(ROOT, 'src/game/knowledge')).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThanOrEqual(8)
    for (const f of ['contract.ts', 'estimate.ts', 'intel.ts', 'keys.ts', 'module.ts', 'record.ts', 'sources.ts']) expect(files, f).toContain(f)
    const fence = readFileSync(join(ROOT, 'test/knowledge-fence.test.ts'), 'utf8')
    // it scans the folder by a directory listing (so it is meaningful once the files exist), and it holds no file back
    expect(fence).toContain("'src/game/knowledge/'")
    expect(fence).toContain('loadSources')
    expect(loadSources(ROOT, 'src/game/knowledge').map((f) => f.path.split('/').pop()!).sort()).toEqual([...files].sort())
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (i) the docs

/** The names a module exports through `export { a, b as c } from` and `export type { T }`, plus direct declarations. */
function exportsOf(text: string): string[] {
  const names = new Set<string>()
  for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()!.trim()
      if (name) names.add(name)
    }
  }
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:const|let|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]!)
  return [...names].sort()
}

describe('(i) docs/KNOWLEDGE.md', () => {
  // read inside each case, so a missing page fails these four cases and not the whole file
  const docsText = (): string => readFileSync(join(ROOT, 'docs/KNOWLEDGE.md'), 'utf8')

  it('has no en-dash or em-dash', () => {
    expect(docsText()).not.toMatch(/[\u2013\u2014]/)
  })

  it('names every export of knowledge/contract.ts', () => {
    const names = exportsOf(readFileSync(join(ROOT, 'src/game/knowledge/contract.ts'), 'utf8'))
    expect(names.length).toBeGreaterThanOrEqual(30)
    expect(names).toEqual(expect.arrayContaining(['know', 'estimate', 'lookCloser', 'intelBriefingMenu', 'registerKeyKind', 'takeReading', 'withInfoMode']))
    const docs = docsText()
    const missing = names.filter((n) => !new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(docs))
    expect(missing).toEqual([])
  })

  it('covers what the plan names: the player, the rule table, the sources, the mode, how a screen calls know, how to add a kind', () => {
    const docs = docsText()
    for (const heading of ['What the player sees', 'The rule table', 'The sources', 'The information mode', 'How a screen calls know', 'How to add a key kind']) {
      expect(docs, heading).toMatch(new RegExp(`^#{1,3} ${heading}`, 'm'))
    }
  })

  it('lists every row of the rule table and every source, so a new one cannot go undocumented', () => {
    const docs = docsText()
    const missingRules = Object.keys(RULES).filter((k) => !docs.includes(`\`${k}\``))
    expect(missingRules).toEqual([])
    const missingSources = SOURCE_IDS.filter((s) => !docs.includes(`\`${s}\``))
    expect(missingSources).toEqual([])
    for (const n of [KNOW_LIMITS.keys, KNOW_LIMITS.years, KNOW_LIMITS.heat]) expect(docs).toContain(String(n))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (j) the rules and the owners

describe('(j) the rule table covers the key families of the Fog track, and a kind has one owner', () => {
  // The shapes the cross-check fixes (00-crosscheck.md section 2.3), with the unit and rule row each must find.
  const FOG_KEYS: Array<[key: string, unit: Unit | null, row: string]> = [
    ['riv:r12:quality', 'score', 'riv.quality'],
    ['riv:r12:tech', 'score', 'riv.tech'],
    ['riv:r12:cafe:line', 'score', 'riv.line'],
    ['riv:r12:cash', 'money', 'riv.cash'],
    ['mkt:cafe:us:size', 'money', 'mkt.size'],
    ['mkt:cafe:us:share', 'pct', 'mkt.share'],
    ['scn:s1:value', 'delta', 'scn.*'],
    ['cand:abc123:skill', 'score', 'cand.skill'],
    ['cmp:row7:score', 'score', 'cmp.score'],
    ['odds:o1:board:p', 'odds', 'odds.*'],
    ['sec:s1:vol', 'pct', 'sec.*'],
    ['val:a1:value', 'money', 'val.*'],
    ['hint:k3f9:2', null, 'hint.*'],
  ]

  it('every shape the Fog track registers parses, finds its row and its unit, with sane numbers', () => {
    for (const [key, unit, row] of FOG_KEYS) {
      expect(key.length, key).toBeLessThanOrEqual(64)
      expect(parseKey(key), key).not.toBeNull()
      const rule = ruleOf(key)
      expect(rule, key).not.toBeNull()
      expect(rule, key).toBe(RULES[row])
      expect(rule!.unit, key).toBe(unit)
      expect(rule!.sd0).toBeGreaterThan(0)
      expect(rule!.sd0).toBeLessThan(1)
      expect(rule!.drift).toBeGreaterThanOrEqual(0)
    }
  })

  it('every one of those families has a reader among the sources, except hint (talent noise only)', () => {
    for (const family of ['riv', 'mkt', 'scn', 'cand', 'cmp', 'sec', 'val', 'odds']) {
      expect(
        SOURCE_IDS.some((s) => SOURCES[s].buyable && (SOURCES[s].reads === 'any' || SOURCES[s].reads.includes(family))),
        family,
      ).toBe(true)
    }
    for (const s of SOURCE_IDS) expect(reads(s, 'hint'), s).toBe(false)
  })

  it('registerKeyKind: the same def twice is fine, a different def for a taken kind throws, and a kind of its own is free', () => {
    const def = {
      kind: 'show',
      label: (_g: GameState, key: string) => key,
      truth: (_g: GameState, _key: string) => 40,
    }
    registerKeyKind(def)
    registerKeyKind(def)
    // the same code again (a module loaded twice) is the same def
    registerKeyKind({ kind: 'show', label: (_g: GameState, key: string) => key, truth: (_g: GameState, _key: string) => 40 })
    expect(kindOf('show')).toBe(def)
    expect(() => registerKeyKind({ kind: 'show', label: (_g: GameState, key: string) => key, truth: () => 41 })).toThrow(/already registered/)
    expect(() => registerKeyKind({ kind: 'show', label: () => 'other', truth: () => 40 })).toThrow(/already registered/)
    // not a kind a key can start with, or not a def at all
    expect(() => registerKeyKind({ kind: 'Show Me', label: () => 'x', truth: () => 1 })).toThrow()
    expect(() => registerKeyKind({ kind: 'war', label: () => 'x' } as never)).toThrow()
    expect(kindOf('war')).toBeNull()
    // the kinds this file registered are the ones the buyers read
    for (const kind of ['mkt', 'riv', 'val', 'cand', 'sec', 'fund', 'cmp', 'eco']) expect(kindOf(kind), kind).not.toBeNull()
  })
})
