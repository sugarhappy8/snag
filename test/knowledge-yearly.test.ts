// R3-H5 (H.2): the yearly step of the knowledge module, the standing orders it runs, and the sink for research reveals.
//
//   yearlyKnowledge  returns at once for the dead and for a life with no record (a default life never gets one); idempotent by rec.sy;
//                    prunes what can no longer be read; runs the standing orders (fees through buyIntel's path, once); then settles the
//                    heat (risk.ts). A poor player lapses: one log line, nothing charged. It draws nothing outside risk.ts and reads no
//                    information mode, so Exact and Realistic play the same years.
//   orders           the dial 0 to 3: 1 the trade press for every tracked key, 2 adds an analyst for the 3 stalest, 3 adds the desk (the
//                    analyst on retainer, .6 of the fee) for the 8 stalest in place of the analyst.
//   applyReveals     what the Effort track's `revealedSink` calls when a piece of research finishes: a stored row whose key kind lists the
//                    researched field gets a `lab` reading, once a year, at most 12 rows a call, never in Exact mode.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { revealedSink } from '../src/game/effort/hooks'
import type { Reveal } from '../src/game/effort/types'
import { checkLedger } from '../src/game/kernel/ledger'
import { learn, readKnow, storedEstimates, takeReading } from '../src/game/knowledge/contract'
import { buyIntel } from '../src/game/knowledge/intel'
import { overrideKeyKind } from '../src/game/knowledge/kinds'
import { applyReveals, yearlyKnowledge } from '../src/game/knowledge/module'
import { HAZARD_CRIME, hazardOf } from '../src/game/knowledge/risk'
import { LAPSE_LINES, STANDING_LINES, ordersFor, quoteOrders, setDial } from '../src/game/knowledge/standing'
import type { GameState } from '../src/game/types'
import { coverage, deepFreeze, fogGame, inFog } from './knowledge-kit'
import { makeTestGame } from './helpers'
import { flowTotal } from './ledger-kit'

const TRUTH = new Map<string, number>()
const REVEALED = new Map<string, string[]>()
for (const kind of ['mkt', 'riv', 'cand']) {
  overrideKeyKind({
    kind,
    label: (_g, key) => `Number ${key.split(':')[1]}`,
    truth: (_g, key) => TRUTH.get(key) ?? null,
    scope: () => ({ tier: 1, country: 'us' }),
    revealedBy: (_g, key) => REVEALED.get(key) ?? [],
  })
}
const MKT = (i: number): string => `mkt:c${String(i).padStart(3, '0')}:size`
const RIV = (i: number): string => `riv:r${String(i).padStart(3, '0')}:quality`
for (let i = 0; i < 40; i++) {
  TRUTH.set(MKT(i), 2e6 * (1 + (i % 17)) * 1.37 ** (i % 5))
  TRUTH.set(RIV(i), 20 + ((i * 7) % 60))
  TRUTH.set(`cand:k${i}:skill`, 30 + ((i * 5) % 50))
}

function life(over: { money?: number; lifeId?: string } = {}): GameState {
  const g = makeTestGame(1, { age: 40, money: over.money ?? 5_000_000 })
  if (over.lifeId) g.lifeId = over.lifeId
  return g
}

/**
 * Read each key once, the oldest first, at years that never go back (a row from a year after g.year is dropped, so a clock that
 * moves back would erase the rows already read), all before `now`; then the clock is `now`. Key i is the i-th stalest.
 */
function staleKeys(g: GameState, keys: readonly string[], from = 2014, now = 2026): string[] {
  const span = Math.max(1, now - from)
  keys.forEach((key, i) => {
    g.year = from + Math.floor((i * span) / keys.length)
    expect(learn(g, key, { mid: TRUTH.get(key)! * 1.1, sd: 0.2, src: 'report' }), key).not.toBeNull()
  })
  g.year = now
  return [...keys]
}

/** `n` keys of one family (mkt unless `keyOf` says), read by `staleKeys`. */
function stale(g: GameState, n: number, from = 2014, now = 2026, keyOf: (i: number) => string = MKT): string[] {
  return staleKeys(g, Array.from({ length: n }, (_, i) => keyOf(i)), from, now)
}

const row = (g: GameState, key: string) => readKnow(g)?.k[key] ?? null
const yearly = (g: GameState): void => yearlyKnowledge(g)
const lines = (g: GameState): string[] => g.log.flatMap((y) => y.entries).map((e) => e.text)

describe('yearlyKnowledge: when it does nothing', () => {
  it('a default life gets no record, in any number of years, and the JSON is untouched', () => {
    const g = life()
    const json = JSON.stringify(g)
    yearly(g)
    yearly(g)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.flags.know).toBeUndefined()
    const aged = life()
    for (let i = 0; i < 5; i++) ageUp(aged)
    expect(aged.flags.know).toBeUndefined()
  })

  it('the dead are left alone', () => {
    const g = life()
    stale(g, 3)
    setDial(g, 3)
    g.character.alive = false
    const json = JSON.stringify(g)
    yearly(g)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('a record of another owner is not touched or read', () => {
    const g = life()
    stale(g, 3)
    const heir = structuredClone(g)
    heir.character.id = 'someone-else'
    const json = JSON.stringify(heir)
    yearly(heir)
    expect(JSON.stringify(heir)).toBe(json)
  })
})

describe('yearlyKnowledge: pruning and the stamp', () => {
  it('drops the rows older than 12 years and the record with them when nothing else is held', () => {
    const g = life()
    g.year = 2010
    learn(g, MKT(0), { mid: TRUTH.get(MKT(0))!, sd: 0.2, src: 'report' })
    g.year = 2011
    learn(g, MKT(1), { mid: TRUTH.get(MKT(1))!, sd: 0.2, src: 'report' })
    g.year = 2026
    expect(g.flags.know).toBeDefined()
    yearly(g)
    expect(g.flags.know).toBeUndefined()
    yearly(g)
    expect(g.flags.know).toBeUndefined()
  })

  it('keeps the dial through a prune, and the rows that can still be read', () => {
    const g = life()
    g.year = 2013
    learn(g, MKT(0), { mid: TRUTH.get(MKT(0))!, sd: 0.2, src: 'report' })
    g.year = 2024
    learn(g, MKT(9), { mid: TRUTH.get(MKT(9))!, sd: 0.2, src: 'press' })
    setDial(g, 1)
    g.year = 2026
    g.character.money = 0 // no fee, so the rows are only pruned
    expect((g.flags.know as { k: Record<string, string> }).k[MKT(0)]).toBeDefined()
    yearly(g)
    expect((g.flags.know as { k: Record<string, string> }).k[MKT(0)]).toBeUndefined()
    expect(row(g, MKT(9))).not.toBeNull()
    expect(readKnow(g)!.d).toBe(1)
    expect(readKnow(g)!.sy).toBe(2026)
  })

  it('is idempotent by the year stamp: a second call in a year changes nothing', () => {
    const g = life()
    stale(g, 6)
    setDial(g, 3)
    inFog(yearlyKnowledge.bind(null, g))
    const once = JSON.stringify(g)
    expect(readKnow(g)!.sy).toBe(2026)
    inFog(yearlyKnowledge.bind(null, g))
    expect(JSON.stringify(g)).toBe(once)
    yearly(g)
    expect(JSON.stringify(g)).toBe(once)
    // the next year runs again
    g.year = 2027
    const money = g.character.money
    yearly(g)
    expect(g.character.money).toBeLessThan(money)
    expect(readKnow(g)!.sy).toBe(2027)
  })
})

describe('standing orders', () => {
  it('level 0 runs no order and books nothing', () => {
    const g = life()
    const keys = stale(g, 5)
    const cash = g.character.money
    const before = keys.map((k) => row(g, k)!.y)
    yearly(g)
    expect(g.character.money).toBe(cash)
    expect(keys.map((k) => row(g, k)!.y)).toEqual(before)
    expect(ordersFor(g, 0)).toEqual([])
  })

  it('level 1: the trade press for every key it reads, one fee, every row fresh this year', () => {
    const g = life()
    const people = [`cand:k0:skill`, `cand:k1:skill`] // the press does not read people
    const all = staleKeys(g, [MKT(0), people[0]!, MKT(1), MKT(2), people[1]!, MKT(3), MKT(4)])
    const keys = all.filter((k) => k.startsWith('mkt'))
    setDial(g, 1)
    const cash = g.character.money
    yearly(g)
    expect(cash - g.character.money).toBe(1_200)
    for (const k of keys) {
      expect(row(g, k)!.y, k).toBe(2026)
      expect(row(g, k)!.src, k).toBe('press')
    }
    for (const k of people) expect(row(g, k)!.y, k).toBeLessThan(2026)
    expect(flowTotal(g, 'intel', 'pool')).toBe(1_200)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('level 2: the press, and an analyst for the 3 stalest', () => {
    const g = life()
    const keys = stale(g, 6)
    setDial(g, 2)
    const cash = g.character.money
    yearly(g)
    expect(cash - g.character.money).toBe(1_200 + 30_000)
    expect(keys.map((k) => row(g, k)!.src)).toEqual(['press+analyst', 'press+analyst', 'press+analyst', 'press', 'press', 'press'])
    expect(checkLedger(g).ok).toBe(true)
  })

  it('level 3: the press, and the desk (.6 of an analyst) for the 8 stalest', () => {
    const g = life()
    const keys = stale(g, 10)
    setDial(g, 3)
    const cash = g.character.money
    yearly(g)
    expect(cash - g.character.money).toBe(1_200 + 18_000)
    expect(keys.map((k) => row(g, k)!.src)).toEqual([...Array(8).fill('press+desk'), 'press', 'press'])
    for (const k of keys.slice(0, 8)) expect(row(g, k)!.sd, k).toBeGreaterThanOrEqual(0.1 - 1e-9)
    expect(flowTotal(g, 'intel', 'pool')).toBe(1_200 + 18_000)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('more than 12 tracked keys are read by more than one subscription fee, never more than ten', () => {
    const g = life()
    stale(g, 30)
    setDial(g, 1)
    expect(ordersFor(g, 1).map((o) => o.keys.length)).toEqual([12, 12, 6])
    const cash = g.character.money
    yearly(g)
    expect(cash - g.character.money).toBe(3 * 1_200)
  })

  it('the yearly fee is the scope, not the wealth: equal at 1x and 100x cash', () => {
    const fee = (money: number): number => {
      const g = life({ money })
      stale(g, 10)
      setDial(g, 3)
      g.character.money = money
      yearly(g)
      return money - g.character.money
    }
    expect(fee(5e6)).toBe(fee(5e8))
    expect(fee(5e6)).toBe(fee(5e10))
    expect(fee(5e6)).toBeGreaterThan(0)
  })

  it('quoteOrders is the fee the year will book, and is pure', () => {
    const g = life()
    stale(g, 10)
    deepFreeze(g)
    for (const [level, fee] of [[0, 0], [1, 1_200], [2, 31_200], [3, 19_200]] as const) expect(inFog(() => quoteOrders(g, level)).fee, `level ${level}`).toBe(fee)
  })

  it('a poor player lapses: one log line, nothing charged, nothing refreshed, and the year is still stamped', () => {
    const g = life({ money: 500 })
    const keys = stale(g, 5)
    setDial(g, 3)
    g.character.money = 500
    yearly(g)
    expect(g.character.money).toBe(500)
    expect(keys.every((k) => row(g, k)!.y < 2026)).toBe(true)
    const said = lines(g)
    expect(said).toHaveLength(1)
    expect(said[0]!.length).toBeLessThanOrEqual(90)
    expect(LAPSE_LINES).toContain(said[0])
    expect(readKnow(g)!.sy).toBe(2026)
    yearly(g)
    expect(lines(g)).toHaveLength(1)
    expect(flowTotal(g, 'intel', 'pool')).toBe(0)
  })

  it('paying says so once, in a line of 90 characters at most with the fee in it', () => {
    const g = life()
    stale(g, 5)
    setDial(g, 1)
    yearly(g)
    const said = lines(g)
    expect(said).toHaveLength(1)
    expect(said[0]!.length).toBeLessThanOrEqual(90)
    expect(said[0]).toMatch(/\$1[.,]?2/)
    for (const l of STANDING_LINES) expect(l.replace('{fee}', '$1,200,000').length, l).toBeLessThanOrEqual(90)
    for (const l of LAPSE_LINES) expect(l.length, l).toBeLessThanOrEqual(90)
    expect(STANDING_LINES.length).toBeGreaterThanOrEqual(3)
    expect(LAPSE_LINES.length).toBeGreaterThanOrEqual(3)
  })

  it('a key the player already read this year is not paid for twice', () => {
    const g = life()
    const keys = stale(g, 4)
    setDial(g, 1)
    inFog(() => buyIntel(g, 'press', keys))
    const cash = g.character.money
    yearly(g)
    expect(g.character.money).toBe(cash)
  })

  it('a key nobody can read any more (the owner has no truth) is left out without a charge', () => {
    const g = life()
    const keys = stale(g, 3)
    setDial(g, 1)
    const saved = keys.map((k) => TRUTH.get(k)!)
    for (const k of keys) TRUTH.delete(k)
    const cash = g.character.money
    try {
      yearly(g)
    } finally {
      saved.forEach((v, i) => TRUTH.set(keys[i]!, v))
    }
    expect(g.character.money).toBe(cash)
    expect(lines(g)).toEqual([])
  })

  it('runs the same in Exact and in Realistic: a setting can never change a replay', () => {
    const make = (): GameState => {
      const g = life()
      stale(g, 10)
      setDial(g, 3)
      return g
    }
    const exact = make()
    yearly(exact)
    const fog = make()
    inFog(() => yearly(fog))
    expect(JSON.stringify(fog)).toBe(JSON.stringify(exact))
    expect(exact.character.money).toBeLessThan(5_000_000)
  })

  it('draws nothing from g.rng', () => {
    const g = life()
    stale(g, 10)
    setDial(g, 3)
    const rng = g.rng
    yearly(g)
    expect(g.rng).toBe(rng)
  })
})

describe('the heat is settled in the yearly step', () => {
  it('halves the heat, stamps the year, and charges a hit exactly when the pure roll says so', () => {
    const g = life()
    inFog(() => buyIntel(g, 'hacker', [RIV(1), RIV(2)]))
    inFog(() => buyIntel(g, 'informant', [MKT(1)]))
    expect(readKnow(g)!.h).toBe(9)
    g.year = 2027
    const roll = hazardOf(g)
    const crimes = g.character.criminalRecord.length
    yearly(g)
    expect(readKnow(g)!.h).toBe(4)
    expect(readKnow(g)!.sy).toBe(2027)
    expect(g.character.criminalRecord.length - crimes).toBe(roll.hit ? 1 : 0)
    if (roll.hit) expect(g.character.criminalRecord.at(-1)!.crime).toBe(HAZARD_CRIME)
  })

  it('runs in Exact mode too, the same way', () => {
    const make = (): GameState => {
      const g = life()
      inFog(() => buyIntel(g, 'hacker', [RIV(1)]))
      g.year = 2027
      return g
    }
    const a = make()
    yearly(a)
    const b = make()
    inFog(() => yearly(b))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(readKnow(a)!.h).toBe(3)
  })
})

describe('the module in the real year', () => {
  it('ageUp runs the step once a year, orders included', () => {
    const g = life()
    stale(g, 4, 2020, g.year)
    setDial(g, 1)
    g.queue = []
    ageUp(g)
    expect(readKnow(g)!.sy).toBe(g.year)
    expect(flowTotal(g, 'intel', 'pool')).toBe(1_200)
    for (const e of storedEstimates(g)) expect(e.y).toBe(g.year)
    expect(checkLedger(g).ok).toBe(true)
  })
})

describe('applyReveals: what finished research teaches', () => {
  const reveal = (field = 'tech', strength = 0.8): Reveal => ({ field, strength, kind: 'works' })

  it('is bound to the Effort hook by the module, and a reveal narrows the band of a stored row', () => {
    const g = life()
    const [key] = stale(g, 1, 2026, 2026, () => RIV(1))
    REVEALED.set(key!, ['tech'])
    const before = row(g, key!)!
    inFog(() => revealedSink(g, [reveal()]))
    const after = row(g, key!)!
    expect(after.sd).toBeLessThan(before.sd)
    expect(after.src).toBe('report+lab')
    expect(after.y).toBe(2026)
  })

  it('the same (source, year) does not narrow it twice', () => {
    const g = life()
    REVEALED.set(RIV(2), ['tech'])
    stale(g, 1, 2026, 2026, () => RIV(2))
    inFog(() => revealedSink(g, [reveal()]))
    const once = JSON.stringify(g)
    inFog(() => revealedSink(g, [reveal('tech', 1)]))
    inFog(() => applyReveals(g, [reveal()]))
    expect(JSON.stringify(g)).toBe(once)
    // another year may
    g.year = 2027
    inFog(() => revealedSink(g, [reveal()]))
    expect(JSON.stringify(g)).not.toBe(once)
  })

  it('a stronger result reads sharper, down to the lab floor of .15', () => {
    const sdFor = (strength: number): number => {
      const g = life()
      REVEALED.set(RIV(3), ['tech'])
      learn(g, RIV(3), { mid: TRUTH.get(RIV(3))!, sd: 0.6, src: 'news' })
      inFog(() => revealedSink(g, [reveal('tech', strength)]))
      return row(g, RIV(3))!.sd
    }
    expect(sdFor(1)).toBeLessThan(sdFor(0))
    expect(sdFor(1)).toBeGreaterThanOrEqual(0.15 * 0.6 / Math.sqrt(0.15 ** 2 + 0.6 ** 2) - 1e-9)
  })

  it('does nothing in Exact mode, for a field the key does not list, for a key that is not stored, or with no record', () => {
    const g = life()
    REVEALED.set(RIV(4), ['tech'])
    stale(g, 1, 2026, 2026, () => RIV(4))
    const json = JSON.stringify(g)
    revealedSink(g, [reveal()]) // Exact
    expect(JSON.stringify(g)).toBe(json)
    inFog(() => revealedSink(g, [reveal('chemistry')]))
    expect(JSON.stringify(g)).toBe(json)
    inFog(() => revealedSink(g, []))
    expect(JSON.stringify(g)).toBe(json)
    const bare = life()
    const bareJson = JSON.stringify(bare)
    inFog(() => revealedSink(bare, [reveal()]))
    expect(JSON.stringify(bare)).toBe(bareJson)
    expect(bare.flags.know).toBeUndefined()
  })

  it('touches at most 12 rows a call, the stalest first', () => {
    const g = life()
    const keys = stale(g, 20, 2016, 2026, RIV)
    for (const k of keys) REVEALED.set(k, ['tech'])
    inFog(() => revealedSink(g, [reveal()]))
    const lab = keys.filter((k) => row(g, k)!.src.includes('lab'))
    expect(lab).toHaveLength(12)
    expect(lab).toEqual(keys.slice(0, 12))
  })

  it('a reveal for a key whose truth is gone writes nothing', () => {
    const g = life()
    const [key] = stale(g, 1, 2026, 2026, () => RIV(5))
    REVEALED.set(key!, ['tech'])
    TRUTH.delete(key!)
    const json = JSON.stringify(g)
    try {
      inFog(() => revealedSink(g, [reveal()]))
    } finally {
      TRUTH.set(key!, 20 + ((5 * 7) % 60))
    }
    expect(JSON.stringify(g)).toBe(json)
  })

  it('is honest: the band of a press reading merged with the lab holds the truth about 80% of the time', () => {
    const key = MKT(6)
    REVEALED.set(key, ['tech'])
    const hit = inFog(() =>
      coverage(1500, (i) => {
        const g: GameState = { ...fogGame(i), flags: {} }
        const truth = 3e5 * 1.013 ** i
        TRUTH.set(key, truth)
        expect(takeReading(g, 'press', key, truth)).not.toBeNull()
        revealedSink(g, [reveal('tech', 0.5)])
        const est = storedEstimates(g).find((e) => e.key === key)!
        expect(est.src).toBe('press+lab')
        return { est, truth }
      }),
    )
    expect(hit).toBeGreaterThan(0.77)
    expect(hit).toBeLessThan(0.83)
  })

  it('draws nothing from g.rng', () => {
    const g = life()
    REVEALED.set(RIV(7), ['tech'])
    stale(g, 1, 2026, 2026, () => RIV(7))
    const rng = g.rng
    inFog(() => revealedSink(g, [reveal()]))
    expect(g.rng).toBe(rng)
  })
})
