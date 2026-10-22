// R3-H4 (H.2): buying a reading, taking one that was paid for elsewhere, the free news, and the heat of the illegal sources.
//
//   buyIntel     checks Exact mode, era, the provider's truth, prison (illegal), a key already read this year, cash; then books the
//                fee once (reason `intel`, or `bribe` for an illegal source), merges a reading per key and logs one line
//   takeReading  the same read for a caller that paid already: books nothing, logs nothing, refuses a (source, year) already merged
//   ingestSignal the free `news` source
//   heat         an informant adds 3, a hacker 6; each year the heat is a hazard (hazardOf is pure, settleHazard writes once a year)
//
// Money: the fee is flat (never the buyer's cash), booked once through the ledger, and a replayed token books nothing. A repeat buy of
// a source for a key in the same year is refused and changes nothing. A reading is the truth plus a hashed draw (no g.rng), so two fresh
// lives read the same number and another year reads another.
//
// The suite runs in Exact (test/setup-exact.ts). Every Realistic case goes through inFog (test/knowledge-kit.ts).
import { describe, expect, it } from 'vitest'
import { checkLedger } from '../src/game/kernel/ledger'
import { KNOW_LIMITS, forget, readKnow, storedEstimates, know } from '../src/game/knowledge/contract'
import { LOG_POOLS, MAX_KEYS, buyIntel, ingestSignal, offersFor, takeReading } from '../src/game/knowledge/intel'
import { registerKeyKind } from '../src/game/knowledge/kinds'
import { HAZARD_CRIME, HEAT_MAX, HIT_LOGS, HIT_NOTES, hazardOf, hazardP, hazardRoll, settleHazard } from '../src/game/knowledge/risk'
import { SOURCES, priceOf } from '../src/game/knowledge/sources'
import { withInfoMode } from '../src/game/knowledge/mode'
import type { GameState } from '../src/game/types'
import { deepFreeze, inFog } from './knowledge-kit'
import { makeTestGame } from './helpers'
import { acctOf, flowTotal } from './ledger-kit'

// The truths and scopes the test kinds find. A real owner (the Fog track) reads a market or a rival here.
const TRUTH = new Map<string, number>()
const SCOPE = new Map<string, { tier: 1 | 2 | 3; country?: string; countries?: number; deal?: number }>()
for (const kind of ['mkt', 'riv', 'val', 'cand', 'ppl', 'eco']) {
  registerKeyKind({
    kind,
    label: (_g, key) => `the ${key}`,
    truth: (_g, key) => TRUTH.get(key) ?? null,
    scope: (_g, key) => SCOPE.get(key) ?? { tier: 1, country: 'us' },
  })
}

const MKT = (i: number): string => `mkt:c${String(i).padStart(3, '0')}:size`
const RIV = (i: number): string => `riv:r${String(i).padStart(3, '0')}:quality`
const VAL = (i: number): string => `val:a${String(i).padStart(3, '0')}:value`
const truthFor = (i: number): number => 2e6 * (1 + (i % 17)) * 1.37 ** (i % 5)

function seedTruths(n = 40): void {
  for (let i = 0; i < n; i++) {
    TRUTH.set(MKT(i), truthFor(i))
    TRUTH.set(RIV(i), 20 + (i * 7) % 60)
    TRUTH.set(VAL(i), truthFor(i + 3) * 3)
    TRUTH.set(`cand:k${i}:skill`, 30 + (i * 5) % 50)
    TRUTH.set(`eco:e${i}:rate`, 0.02 + (i % 9) / 100)
  }
}
seedTruths()

/** A life of 40 in the US in 2026 with cash. The default lifeId is shared, so vary it for a different draw. */
function life(over: { money?: number; lifeId?: string; year?: number; age?: number; talents?: string[]; smarts?: number; countryId?: string } = {}): GameState {
  const g = makeTestGame(1, { age: over.age ?? 40, money: over.money ?? 5_000_000, ...(over.talents ? { talents: over.talents } : {}), ...(over.countryId ? { countryId: over.countryId } : {}) })
  if (over.lifeId) g.lifeId = over.lifeId
  if (over.year) g.year = over.year
  if (over.smarts !== undefined) g.character.stats.smarts = over.smarts
  return g
}

const keysOf = (n: number, f: (i: number) => string = MKT, from = 0): string[] => Array.from({ length: n }, (_, i) => f(from + i))
const buy = (g: GameState, src: Parameters<typeof buyIntel>[1], keys: readonly string[]) => inFog(() => buyIntel(g, src, keys))
const rowOf = (g: GameState, key: string) => readKnow(g)?.k[key] ?? null

describe('buyIntel: a priced reading, merged and kept', () => {
  it('books the fee, keeps a reading per key and says so in the log, once', () => {
    const g = life()
    const keys = keysOf(4)
    const cash = g.character.money
    const out = buy(g, 'report', keys)
    expect(out).toEqual({ ok: true })
    expect(cash - g.character.money).toBe(priceOf('report', { tier: 1, country: 'us' }))
    for (const key of keys) {
      const row = rowOf(g, key)
      expect(row, key).not.toBeNull()
      expect(row!.src).toBe('report')
      expect(row!.y).toBe(g.year)
      expect(row!.sd).toBeGreaterThanOrEqual(0.12)
    }
    const lines = g.log.flatMap((y) => y.entries).map((e) => e.text)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.length).toBeLessThanOrEqual(90)
  })

  it('the stored reading is an honest read of the truth, not the truth', () => {
    const g = life()
    for (let i = 0; i < 30; i += MAX_KEYS) buy(g, 'report', keysOf(Math.min(MAX_KEYS, 30 - i), MKT, i))
    let exact = 0
    for (const key of keysOf(30)) if (rowOf(g, key)!.mid === TRUTH.get(key)) exact++
    expect(exact).toBe(0)
    // inside five sd of the truth for every key: the draw is bounded
    for (const key of keysOf(30)) {
      const row = rowOf(g, key)!
      expect(Math.abs(Math.log(row.mid / TRUTH.get(key)!))).toBeLessThan(5 * row.sd)
    }
  })

  it('shows the stored band instead of the passive guess when the source is sharper', () => {
    const g = life()
    const key = MKT(2)
    const before = inFog(() => know(g, key, TRUTH.get(key)!))
    expect(before.src).toBe('passive')
    buy(g, 'analyst', [key])
    const after = inFog(() => know(g, key, TRUTH.get(key)!))
    expect(after.src).toBe('analyst')
    expect(after.sd).toBeLessThan(before.sd)
    expect(after.conf).toBeGreaterThanOrEqual(before.conf)
  })

  it('floors: no purchased reading is sharper than its source floor, with or without a talent', () => {
    const cases: Array<[Parameters<typeof buyIntel>[1], string[], number]> = [
      ['press', keysOf(3), 0.2],
      ['report', keysOf(3), 0.12],
      ['analyst', keysOf(3), 0.08],
      ['diligence', keysOf(3, VAL), 0.03],
      ['investigator', keysOf(3, RIV), 0.1],
      ['informant', keysOf(3), 0.07],
      ['hacker', keysOf(3, VAL), 0.05],
    ]
    for (const talents of [undefined, ['Business', 'Investing']]) {
      for (const [src, keys, floor] of cases) {
        const g = life({ talents })
        expect(buy(g, src, keys), src).toEqual({ ok: true })
        for (const key of keys) expect(rowOf(g, key)!.sd, `${src} ${key} ${talents ? 'talent' : ''}`).toBeGreaterThanOrEqual(floor - 1e-9)
      }
    }
  })

  it('a talent key reads x.8 sharper, to the floor', () => {
    const plain = life()
    const gifted = life({ talents: ['Business'] })
    buy(plain, 'report', [MKT(1)])
    buy(gifted, 'report', [MKT(1)])
    expect(rowOf(plain, MKT(1))!.sd).toBeCloseTo(0.18, 3)
    expect(rowOf(gifted, MKT(1))!.sd).toBeCloseTo(0.144, 3)
  })

  it('the fee is flat in the cash: 1x and 100x the money pay the same, and the scope sets it', () => {
    const poor = life({ money: 1_000_000 })
    const rich = life({ money: 100_000_000 })
    buy(poor, 'analyst', keysOf(2))
    buy(rich, 'analyst', keysOf(2))
    expect(1_000_000 - poor.character.money).toBe(100_000_000 - rich.character.money)
    expect(1_000_000 - poor.character.money).toBe(30_000)
  })

  it('the fee follows the scope of the keys: a bigger tier, more countries, a poorer or richer country', () => {
    SCOPE.set(MKT(10), { tier: 2, country: 'us' })
    SCOPE.set(MKT(11), { tier: 3, country: 'us', countries: 3 })
    SCOPE.set(MKT(12), { tier: 1, country: 'ng' })
    SCOPE.set(MKT(13), { tier: 1, country: 'mc' })
    try {
      const fee = (key: string): number => {
        const g = life()
        const cash = g.character.money
        buy(g, 'report', [key])
        return cash - g.character.money
      }
      expect(fee(MKT(10))).toBe(priceOf('report', { tier: 2, country: 'us' }))
      expect(fee(MKT(11))).toBe(priceOf('report', { tier: 3, country: 'us', countries: 3 }))
      expect(fee(MKT(11))).toBeGreaterThan(fee(MKT(10)))
      expect(fee(MKT(10))).toBeGreaterThan(fee(MKT(1)))
      expect(fee(MKT(12))).toBeLessThan(fee(MKT(1)))
      expect(fee(MKT(13))).toBeGreaterThan(fee(MKT(1)))
    } finally {
      for (const i of [10, 11, 12, 13]) SCOPE.delete(MKT(i))
    }
  })

  it('a bigger set of keys in one call is one fee, and at most MAX_KEYS of them are read', () => {
    const g = life()
    const cash = g.character.money
    const out = buy(g, 'report', keysOf(MAX_KEYS + 8))
    expect(out.ok).toBe(true)
    expect(cash - g.character.money).toBe(9_000)
    expect(Object.keys(readKnow(g)!.k)).toHaveLength(MAX_KEYS)
    expect(MAX_KEYS).toBe(12)
  })

  it('reads what the source covers and leaves the rest: a report on a market and a valuation reads the market only', () => {
    const g = life()
    const out = buy(g, 'report', [MKT(1), VAL(1)])
    expect(out.ok).toBe(true)
    expect(rowOf(g, MKT(1))).not.toBeNull()
    expect(rowOf(g, VAL(1))).toBeNull()
  })
})

describe('buyIntel: the same read twice in a year, and another year', () => {
  it('two fresh lives read the same number, and a repeat buy is refused and changes nothing', () => {
    const a = life({ lifeId: 'twin' })
    const b = life({ lifeId: 'twin' })
    buy(a, 'report', keysOf(5))
    buy(b, 'report', keysOf(5))
    for (const key of keysOf(5)) expect(rowOf(a, key)!.mid).toBe(rowOf(b, key)!.mid)
    const json = JSON.stringify(a)
    const cash = a.character.money
    const again = buy(a, 'report', keysOf(5))
    expect(again.ok).toBe(false)
    expect(again.why).toMatch(/already have this year/i)
    expect(a.character.money).toBe(cash)
    expect(JSON.stringify(a)).toBe(json)
  })

  it('a part of the keys read already is paid only for the rest', () => {
    const g = life()
    buy(g, 'report', keysOf(2))
    const cash = g.character.money
    expect(buy(g, 'report', keysOf(4))).toEqual({ ok: true })
    expect(cash - g.character.money).toBe(9_000)
    expect(Object.keys(readKnow(g)!.k)).toHaveLength(4)
  })

  it('another source in the same year merges and sharpens; the same source in the next year reads another number', () => {
    const g = life()
    const key = MKT(3)
    buy(g, 'press', [key])
    const press = rowOf(g, key)!
    buy(g, 'report', [key])
    const merged = rowOf(g, key)!
    expect(merged.src).toBe('press+report')
    expect(merged.sd).toBeLessThan(press.sd)
    expect(merged.sd).toBeLessThan(0.18)

    const next = life({ lifeId: 'solo' })
    buy(next, 'report', [key])
    const first = rowOf(next, key)!.mid
    next.year += 1
    expect(buy(next, 'report', [key])).toEqual({ ok: true })
    const second = rowOf(next, key)!
    expect(second.y).toBe(next.year)
    expect(second.mid).not.toBe(first)
  })

  it('a replayed token books nothing: after the row is forgotten the same buy takes no money and gives no reading', () => {
    const g = life()
    const key = MKT(5)
    buy(g, 'report', [key])
    forget(g, key)
    expect(rowOf(g, key)).toBeNull()
    const cash = g.character.money
    const out = buy(g, 'report', [key])
    expect(out.ok).toBe(false)
    expect(g.character.money).toBe(cash)
    expect(rowOf(g, key)).toBeNull()
  })
})

describe('buyIntel: research pays, and the band is honest', () => {
  it('the mean error over 200 keys falls after a report', () => {
    const g = life()
    const keys = keysOf(200, MKT, 100)
    for (const [i, key] of keys.entries()) TRUTH.set(key, truthFor(i + 7))
    const err = (): number => {
      let sum = 0
      for (const key of keys) sum += Math.abs(Math.log(inFog(() => know(g, key, TRUTH.get(key)!)).mid / TRUTH.get(key)!))
      return sum / keys.length
    }
    const before = err()
    for (let i = 0; i < keys.length; i += MAX_KEYS) expect(buy(g, 'report', keys.slice(i, i + MAX_KEYS)).ok).toBe(true)
    const after = err()
    expect(after).toBeLessThan(before)
    expect(after).toBeLessThan(before * 0.85)
  })

  it('after a read the shown band holds the truth 77% to 83% of 10,000 lives, for every legal and illegal source', () => {
    const base = life()
    const cases: Array<[Parameters<typeof takeReading>[1], string, number]> = [
      ['press', MKT(0), 4e6],
      ['report', MKT(0), 4e6],
      ['analyst', MKT(0), 4e6],
      ['informant', MKT(0), 4e6],
      ['lab', MKT(0), 4e6],
      ['investigator', RIV(0), 55],
      ['diligence', VAL(0), 7e6],
      ['hacker', VAL(0), 7e6],
    ]
    for (const [src, key, truth0] of cases) {
      let hit = 0
      const n = 10_000
      inFog(() => {
        for (let i = 0; i < n; i++) {
          const g: GameState = { ...base, lifeId: `cov-${src}-${i}`, flags: {}, yearActions: {} }
          const truth = truth0 * (0.75 + ((i * 2654435761) % 1000) / 2000)
          const est = takeReading(g, src, key, truth)
          if (est && est.lo <= truth && truth <= est.hi) hit++
        }
      })
      const share = hit / n
      expect(share, src).toBeGreaterThan(0.77)
      expect(share, src).toBeLessThan(0.83)
    }
  }, 120_000)
})

describe('buyIntel: the refusals write nothing', () => {
  const snap = (g: GameState): string => JSON.stringify(g)

  it('no cash', () => {
    const g = life({ money: 8_999 })
    const json = snap(g)
    const out = buy(g, 'report', keysOf(1))
    expect(out.ok).toBe(false)
    expect(out.why).toMatch(/afford|money/i)
    expect(snap(g)).toBe(json)
  })

  it('Exact mode: there is nothing to buy, and the suite default is Exact', () => {
    const g = life()
    const json = snap(g)
    expect(buyIntel(g, 'report', keysOf(1)).ok).toBe(false)
    expect(withInfoMode('exact', () => buyIntel(g, 'report', keysOf(1)))).toEqual({ ok: false, why: expect.stringMatching(/exact/i) })
    expect(snap(g)).toBe(json)
  })

  it('an illegal source from prison, and a legal one is fine from there', () => {
    const g = life()
    g.character.prison = { name: 'Stateville', security: 'medium', crime: 'Fraud', sentenceYears: 5, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    const json = snap(g)
    const out = buy(g, 'informant', keysOf(1))
    expect(out.ok).toBe(false)
    expect(out.why).toMatch(/cell|prison|inside/i)
    expect(snap(g)).toBe(json)
    expect(buy(g, 'press', keysOf(1)).ok).toBe(true)
  })

  it('a source that does not exist yet, and the dead', () => {
    const old = life({ year: 1950 })
    const json = snap(old)
    expect(buy(old, 'hacker', keysOf(1, VAL)).ok).toBe(false)
    expect(snap(old)).toBe(json)
    const dead = life()
    dead.character.alive = false
    const j2 = snap(dead)
    expect(buy(dead, 'report', keysOf(1)).ok).toBe(false)
    expect(snap(dead)).toBe(j2)
  })

  it('a key with no provider, a truth that is not there, a source that does not cover it, an unknown source, no keys', () => {
    const g = life()
    const json = snap(g)
    expect(buy(g, 'report', ['zzz:a:b']).ok).toBe(false)
    expect(buy(g, 'report', ['mkt:nothing:size']).ok).toBe(false)
    expect(buy(g, 'diligence', keysOf(2)).ok).toBe(false)
    expect(buy(g, 'report', []).ok).toBe(false)
    expect(buy(g, 'report', 'nope' as never).ok).toBe(false)
    expect(buy(g, 'nonsense' as never, keysOf(2)).ok).toBe(false)
    expect(buy(g, 'report', [42 as never, null as never, '']).ok).toBe(false)
    expect(snap(g)).toBe(json)
  })

  it('a provider that throws is a key with no truth', () => {
    registerKeyKind({ kind: 'cmp', label: () => 'x', truth: () => { throw new Error('boom') } })
    const g = life()
    const json = snap(g)
    expect(buy(g, 'report', ['cmp:a:score']).ok).toBe(false)
    expect(snap(g)).toBe(json)
  })

  it('the news, the lab and the desk cannot be walked up to', () => {
    const g = life()
    const json = snap(g)
    for (const src of ['news', 'lab', 'desk'] as const) expect(buy(g, src, keysOf(1)).ok, src).toBe(false)
    expect(snap(g)).toBe(json)
  })

  it('the refusals say why in plain words, with no dash', () => {
    const g = life({ money: 100 })
    for (const out of [buy(g, 'report', keysOf(1)), buy(g, 'report', ['zzz:a:b']), buy(g, 'desk', keysOf(1)), buyIntel(g, 'report', keysOf(1))]) {
      expect(out.ok).toBe(false)
      expect(typeof out.why).toBe('string')
      expect(out.why!.length).toBeGreaterThan(5)
      expect(out.why!.length).toBeLessThanOrEqual(70)
      expect(/[\u2013\u2014]/.test(out.why!)).toBe(false)
    }
  })
})

describe('buyIntel: the do-it-yourself read takes time, not money', () => {
  it('stops after 3 uses in a year, and the refused one writes nothing', () => {
    const g = life({ money: 0, smarts: 80 })
    for (let i = 0; i < 3; i++) expect(buy(g, 'own', keysOf(2, MKT, i * 2)), `use ${i}`).toEqual({ ok: true })
    expect(g.yearActions['intel.own']).toBe(3)
    expect(g.character.money).toBe(0)
    const json = JSON.stringify(g)
    const out = buy(g, 'own', keysOf(2, MKT, 20))
    expect(out.ok).toBe(false)
    expect(out.why).toMatch(/time|year/i)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('reads nothing private: a valuation is refused, and no action is used up', () => {
    const g = life()
    const json = JSON.stringify(g)
    expect(buy(g, 'own', [VAL(1)]).ok).toBe(false)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.yearActions['intel.own']).toBeUndefined()
  })

  it('smarter lives read sharper, down to the floor of .25', () => {
    const dim = life({ smarts: 10 })
    const sharp = life({ smarts: 100 })
    buy(dim, 'own', [MKT(1)])
    buy(sharp, 'own', [MKT(1)])
    expect(rowOf(dim, MKT(1))!.sd).toBeGreaterThan(rowOf(sharp, MKT(1))!.sd)
    expect(rowOf(sharp, MKT(1))!.sd).toBeGreaterThanOrEqual(0.25 - 1e-9)
  })

  it('books no money, so the ledger is untouched', () => {
    const g = life()
    buy(g, 'own', [MKT(1)])
    expect(flowTotal(g, 'intel', 'pool')).toBe(0)
  })
})

describe('buyIntel: the books', () => {
  it('one `intel` flow to the pool of others, the ledger balances, and the fee is whole dollars', () => {
    const g = life()
    const cash = g.character.money
    buy(g, 'press', keysOf(3))
    buy(g, 'report', keysOf(3))
    buy(g, 'analyst', keysOf(3))
    buy(g, 'investigator', keysOf(2, RIV))
    const paid = 1_200 + 9_000 + 30_000 + 15_000
    expect(cash - g.character.money).toBe(paid)
    expect(flowTotal(g, 'intel', 'pool')).toBe(paid)
    expect(flowTotal(g, 'intel', 'person')).toBe(-paid)
    expect(acctOf(g, 'pool:other')).toBe(paid)
    expect(checkLedger(g).ok).toBe(true)
    expect(Number.isInteger(g.character.money)).toBe(true)
  })

  it('an illegal source pays under `bribe`, not `intel`', () => {
    const g = life()
    buy(g, 'informant', keysOf(2))
    buy(g, 'hacker', keysOf(2, VAL))
    expect(flowTotal(g, 'bribe', 'person')).toBe(-(6_000 + 20_000))
    expect(acctOf(g, 'pool:crime')).toBe(6_000 + 20_000)
    expect(flowTotal(g, 'intel', 'person')).toBe(0)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('the fee of every source is a function of the scope, not the cash, at 1x and 100x money', () => {
    for (const [src, keys] of [['press', keysOf(1)], ['report', keysOf(1)], ['analyst', keysOf(1)], ['diligence', keysOf(1, VAL)], ['investigator', keysOf(1, RIV)], ['informant', keysOf(1)], ['hacker', keysOf(1, VAL)]] as const) {
      const fees = [1e6, 1e8, 1e10].map((money) => {
        const g = life({ money })
        buy(g, src, keys)
        return money - g.character.money
      })
      expect(new Set(fees).size, src).toBe(1)
      expect(fees[0], src).toBeGreaterThan(0)
    }
  })

  it('a diligence fee follows the deal: 2% of it when that is more than 8,000', () => {
    SCOPE.set(VAL(30), { tier: 1, country: 'us', deal: 5_000_000 })
    try {
      const g = life()
      const cash = g.character.money
      expect(buy(g, 'diligence', [VAL(30)]).ok).toBe(true)
      expect(cash - g.character.money).toBe(100_000)
    } finally {
      SCOPE.delete(VAL(30))
    }
  })
})

describe('buyIntel: nothing in it draws from the game', () => {
  it('g.rng does not move on a buy, a refusal, an offer or a take', () => {
    const g = life()
    const rng = g.rng
    buy(g, 'report', keysOf(3))
    buy(g, 'report', keysOf(3))
    buy(g, 'informant', keysOf(1))
    inFog(() => offersFor(g, keysOf(3)))
    inFog(() => takeReading(g, 'lab', MKT(9), 5e6))
    expect(g.rng).toBe(rng)
  })

  it('the log lines are from pools of three or more, at most 90 characters, with no dash, and a fee fits', () => {
    expect(Object.keys(LOG_POOLS).sort()).toEqual(['analyst', 'diligence', 'hacker', 'informant', 'investigator', 'own', 'press', 'report'])
    for (const [src, pool] of Object.entries(LOG_POOLS)) {
      expect(pool.length, src).toBeGreaterThanOrEqual(3)
      for (const line of pool) {
        const worst = line.replace('{fee}', '$278K')
        expect(worst.length, line).toBeLessThanOrEqual(90)
        expect(/[\u2013\u2014]/.test(line), line).toBe(false)
        if (src !== 'own') expect(line, line).toContain('{fee}')
      }
    }
  })

  it('the line names the fee in the player\'s money', () => {
    const g = life()
    buy(g, 'analyst', keysOf(1))
    const text = g.log.flatMap((y) => y.entries).map((e) => e.text)[0]!
    expect(text).toMatch(/\$30K|\$30,000/)
  })
})

describe('takeReading: a read whose fee was paid elsewhere', () => {
  it('books nothing and logs nothing, and returns the estimate it now stands on', () => {
    const g = life()
    const json = JSON.stringify(g)
    const cash = g.character.money
    const est = inFog(() => takeReading(g, 'lab', MKT(1), 4e6))
    expect(est).not.toBeNull()
    expect(est!.src).toBe('lab')
    expect(est!.key).toBe(MKT(1))
    expect(est!.exact).toBe(false)
    expect(g.character.money).toBe(cash)
    expect(g.log.flatMap((y) => y.entries)).toHaveLength(0)
    expect(g.queue).toHaveLength(0)
    expect(JSON.stringify(g)).not.toBe(json)
    expect(flowTotal(g, 'intel', 'pool')).toBe(0)
    expect(rowOf(g, MKT(1))).not.toBeNull()
  })

  it('refuses a (source, year) already merged, writes nothing, and takes another source or another year', () => {
    const g = life()
    expect(inFog(() => takeReading(g, 'lab', MKT(1), 4e6))).not.toBeNull()
    const json = JSON.stringify(g)
    expect(inFog(() => takeReading(g, 'lab', MKT(1), 4e6))).toBeNull()
    expect(JSON.stringify(g)).toBe(json)
    expect(inFog(() => takeReading(g, 'report', MKT(1), 4e6))).not.toBeNull()
    g.year += 1
    expect(inFog(() => takeReading(g, 'lab', MKT(1), 4e6))).not.toBeNull()
  })

  it('is stable: two fresh lives take the same reading', () => {
    const a = life({ lifeId: 'tw' })
    const b = life({ lifeId: 'tw' })
    inFog(() => takeReading(a, 'report', MKT(1), 4e6))
    inFog(() => takeReading(b, 'report', MKT(1), 4e6))
    expect(rowOf(a, MKT(1))).toEqual(rowOf(b, MKT(1)))
  })

  it('floors the sd it is given at the source floor, and applies the source sd when none is given', () => {
    const g = life()
    inFog(() => takeReading(g, 'report', MKT(1), 4e6, { sd: 0.01 }))
    expect(rowOf(g, MKT(1))!.sd).toBeCloseTo(0.12, 3)
    inFog(() => takeReading(g, 'report', MKT(2), 4e6))
    expect(rowOf(g, MKT(2))!.sd).toBeCloseTo(0.18, 3)
    inFog(() => takeReading(g, 'report', MKT(3), 4e6, { sd: 0.5 }))
    expect(rowOf(g, MKT(3))!.sd).toBeCloseTo(0.5, 3)
    inFog(() => takeReading(g, 'diligence', VAL(3), 4e6, { sd: 0.001 }))
    expect(rowOf(g, VAL(3))!.sd).toBeCloseTo(0.03, 3)
  })

  it('Exact mode ignores it: no write, null', () => {
    const g = life()
    const json = JSON.stringify(g)
    expect(takeReading(g, 'lab', MKT(1), 4e6)).toBeNull()
    expect(JSON.stringify(g)).toBe(json)
    expect('know' in g.flags).toBe(false)
  })

  it('reads only what the source covers, and only a finite truth for a key that has a rule', () => {
    const g = life()
    expect(inFog(() => takeReading(g, 'lab', VAL(1), 4e6))).toBeNull()
    expect(inFog(() => takeReading(g, 'lab', MKT(1), NaN))).toBeNull()
    expect(inFog(() => takeReading(g, 'lab', 'nothing', 4e6))).toBeNull()
    expect(inFog(() => takeReading(g, 'nonsense' as never, MKT(1), 4e6))).toBeNull()
    expect(inFog(() => takeReading(g, 'lab', MKT(1), -5))).toBeNull()
    expect('know' in g.flags).toBe(false)
  })

  it('a delta key is read against a scale', () => {
    const g = life()
    const est = inFog(() => takeReading(g, 'report', 'scn:s1:value', 12e6, { scale: 200e6 }))
    expect(est).not.toBeNull()
    expect(est!.sd).toBeCloseTo(0.18, 3)
    // noise is sd x scale, so a 200M scale leaves the reading within 5 x 18% x 200M of the truth
    expect(Math.abs(est!.mid - 12e6)).toBeLessThan(5 * 0.18 * 200e6)
  })

  it('is pure of the game: g.rng does not move', () => {
    const g = life()
    const rng = g.rng
    inFog(() => takeReading(g, 'lab', MKT(1), 4e6))
    expect(g.rng).toBe(rng)
  })
})

describe('ingestSignal: the free news', () => {
  it('keeps a reading at the news floor or worse, once per year, and says so with true', () => {
    const g = life()
    expect(inFog(() => ingestSignal(g, { key: MKT(1), v: 5e6 }))).toBe(true)
    expect(rowOf(g, MKT(1))!.src).toBe('news')
    expect(rowOf(g, MKT(1))!.sd).toBeCloseTo(0.3, 3)
    expect(inFog(() => ingestSignal(g, { key: MKT(1), v: 5e6 }))).toBe(false)
    expect(inFog(() => ingestSignal(g, { key: MKT(2), v: 5e6, sd: 0.05 }))).toBe(true)
    expect(rowOf(g, MKT(2))!.sd).toBeCloseTo(0.2, 3)
    expect(inFog(() => ingestSignal(g, { key: MKT(3), v: 5e6, sd: 0.5 }))).toBe(true)
    expect(rowOf(g, MKT(3))!.sd).toBeCloseTo(0.5, 3)
  })

  it('speaks of any kind of key, costs nothing, and sharpens a stored reading', () => {
    const g = life()
    const cash = g.character.money
    expect(inFog(() => ingestSignal(g, { key: VAL(1), v: 5e6 }))).toBe(true)
    expect(inFog(() => ingestSignal(g, { key: RIV(1), v: 50 }))).toBe(true)
    expect(g.character.money).toBe(cash)
    buy(g, 'press', [MKT(4)])
    const press = rowOf(g, MKT(4))!
    expect(inFog(() => ingestSignal(g, { key: MKT(4), v: 5e6 }))).toBe(true)
    expect(rowOf(g, MKT(4))!.sd).toBeLessThan(press.sd)
    expect(rowOf(g, MKT(4))!.src).toBe('press+news')
  })

  it('does nothing in Exact mode, for a bad key, and for a value that is not a number', () => {
    const g = life()
    const json = JSON.stringify(g)
    expect(ingestSignal(g, { key: MKT(1), v: 5e6 })).toBe(false)
    expect(inFog(() => ingestSignal(g, { key: 'x', v: 5e6 }))).toBe(false)
    expect(inFog(() => ingestSignal(g, { key: MKT(1), v: NaN }))).toBe(false)
    expect(inFog(() => ingestSignal(g, null as never))).toBe(false)
    expect(JSON.stringify(g)).toBe(json)
  })
})

describe('offersFor: what a screen can show, and that it can be shown at all', () => {
  it('lists the buyable sources for the keys, with price, sd before and after, and the label', () => {
    const g = life()
    const offers = inFog(() => offersFor(g, keysOf(3)))
    const srcs = offers.map((o) => o.src)
    expect(srcs).toEqual(expect.arrayContaining(['own', 'press', 'report', 'analyst', 'informant']))
    for (const bad of ['news', 'lab', 'desk', 'diligence', 'investigator', 'hacker']) expect(srcs, bad).not.toContain(bad)
    const report = offers.find((o) => o.src === 'report')!
    expect(report.price).toBe(9_000)
    expect(report.label).toBe(SOURCES.report.label)
    expect(report.block).toBeNull()
    expect(report.sdFrom).toBeCloseTo(0.25, 3)
    expect(report.sdTo).toBeCloseTo(0.18, 3)
    const analyst = offers.find((o) => o.src === 'analyst')!
    expect(analyst.sdTo).toBeLessThan(report.sdTo)
    expect(offers.find((o) => o.src === 'own')!.price).toBe(0)
  })

  it('shows the sharper sd after a read the player already holds, and the aged one', () => {
    const g = life()
    buy(g, 'analyst', [MKT(1)])
    const o = inFog(() => offersFor(g, [MKT(1)])).find((x) => x.src === 'report')!
    expect(o.sdFrom).toBeLessThan(0.15)
    expect(o.sdTo).toBeLessThanOrEqual(o.sdFrom)
    const later = life()
    buy(later, 'analyst', [MKT(1)])
    later.year += 3
    const o2 = inFog(() => offersFor(later, [MKT(1)])).find((x) => x.src === 'report')!
    expect(o2.sdFrom).toBeGreaterThan(o.sdFrom)
  })

  it('says why an offer is blocked, in the words buyIntel would use, and stays listed', () => {
    const poor = life({ money: 100 })
    const offers = inFog(() => offersFor(poor, keysOf(2)))
    const report = offers.find((o) => o.src === 'report')!
    expect(report.block).toMatch(/afford|money/i)
    expect(offers.find((o) => o.src === 'own')!.block).toBeNull()
    const g = life()
    buy(g, 'report', keysOf(2))
    expect(inFog(() => offersFor(g, keysOf(2))).find((o) => o.src === 'report')!.block).toMatch(/already have this year/i)
    for (const o of inFog(() => offersFor(poor, keysOf(2)))) {
      const out = buy(life({ money: 100 }), o.src, keysOf(2))
      if (o.block) expect(out.why, o.src).toBe(o.block)
    }
  })

  it('is empty in Exact mode, for no keys, and for keys nothing can read', () => {
    const g = life()
    expect(offersFor(g, keysOf(2))).toEqual([])
    expect(inFog(() => offersFor(g, []))).toEqual([])
    expect(inFog(() => offersFor(g, ['zzz:a:b']))).toEqual([])
  })

  it('is pure: a frozen game, the same answer twice, no write', () => {
    const g = deepFreeze(life({ talents: ['Business'] }))
    const json = JSON.stringify(g)
    const a = inFog(() => offersFor(g, keysOf(3)))
    const b = inFog(() => offersFor(g, keysOf(3)))
    expect(a).toEqual(b)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('the stored estimates the hub will list include a bought row', () => {
    const g = life()
    buy(g, 'report', keysOf(2))
    const list = storedEstimates(g)
    expect(list.map((e) => e.key).sort()).toEqual(keysOf(2).sort())
    expect(list[0]!.src).toBe('report')
  })
})

describe('heat: the illegal sources carry a risk', () => {
  /** A life where the roll of the year for heat `h` hits (or misses): found by looking, so no seed is pinned. */
  function lifeWhere(hit: boolean, h = 20): GameState {
    for (let i = 0; i < 500; i++) {
      const g = life({ lifeId: `heat-${i}` })
      g.flags.know = { v: 1, o: `v2:${g.generation}:${g.character.id}`, k: {}, h }
      if (hazardOf(g).hit === hit) return g
    }
    throw new Error('no life found')
  }

  it('an informant adds 3, a hacker 6, and the heat is held to 20', () => {
    const g = life()
    buy(g, 'informant', keysOf(1))
    expect(readKnow(g)!.h).toBe(3)
    buy(g, 'hacker', keysOf(1, VAL))
    expect(readKnow(g)!.h).toBe(9)
    for (let i = 2; i < 12; i++) {
      g.year += 1
      buy(g, 'hacker', keysOf(1, VAL))
    }
    expect(readKnow(g)!.h).toBe(20)
    expect(HEAT_MAX).toBe(20)
    expect(HEAT_MAX).toBe(KNOW_LIMITS.heat)
  })

  it('a refused illegal buy adds no heat, and a legal one adds none', () => {
    const g = life({ money: 100 })
    buy(g, 'informant', keysOf(1))
    expect(readKnow(g)).toBeNull()
    const h = life()
    buy(h, 'report', keysOf(1))
    buy(h, 'investigator', keysOf(1, RIV))
    expect(readKnow(h)!.h).toBeUndefined()
  })

  it('the hazard is p = min(.5, .05 + .06 h): 5% at nothing, a quarter at 3, half from 8', () => {
    expect(hazardP(0)).toBe(0)
    expect(hazardP(3)).toBeCloseTo(0.23, 12)
    expect(hazardP(6)).toBeCloseTo(0.41, 12)
    expect(hazardP(8)).toBe(0.5)
    expect(hazardP(20)).toBe(0.5)
    expect(hazardP(-4)).toBe(0)
    expect(hazardP(NaN)).toBe(0)
  })

  it('hazardOf is pure: no heat means no roll, the same answer twice, rng and JSON unchanged', () => {
    const calm = life()
    expect(hazardOf(calm)).toEqual({ h: 0, p: 0, hit: false })
    const g = lifeWhere(true, 8)
    const json = JSON.stringify(g)
    const rng = g.rng
    const first = hazardOf(g)
    expect(first).toEqual({ h: 8, p: 0.5, hit: true })
    expect(hazardOf(g)).toEqual(first)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
    const frozen = deepFreeze(structuredClone(g))
    expect(hazardOf(frozen)).toEqual(first)
    expect(hazardRoll(frozen, 8)).toBe(true)
  })

  it('the roll is another year another draw, and it hits about as often as p says', () => {
    let hits = 0
    const n = 4000
    for (let i = 0; i < n; i++) {
      const g = life({ lifeId: `rate-${i}` })
      if (hazardRoll(g, 3)) hits++
    }
    expect(hits / n).toBeGreaterThan(0.2)
    expect(hits / n).toBeLessThan(0.26)
  })

  it('a hit leaves an uncaught record, the wanted level up by 2, notoriety, karma, a bad notice and a line; the heat halves', () => {
    const g = lifeWhere(true, 8)
    const c = g.character
    const karma = c.hidden.karma
    const notoriety = c.hidden.notoriety
    expect(settleHazard(g)).toBe('hit')
    expect(c.criminalRecord).toHaveLength(1)
    expect(c.criminalRecord[0]).toEqual({ crime: HAZARD_CRIME, age: c.age, caught: false, convicted: false })
    expect(HAZARD_CRIME).toBe('Corporate Espionage')
    expect(c.wantedLevel).toBe(2)
    expect(c.hidden.notoriety).toBe(notoriety + 8)
    expect(c.hidden.karma).toBe(karma - 4)
    const note = g.queue.find((m) => m.kind === 'notice')
    if (!note || note.kind !== 'notice') throw new Error('no notice was queued')
    expect(note.tone).toBe('bad')
    expect(note.text.length).toBeLessThanOrEqual(120)
    expect(note.title.length).toBeLessThanOrEqual(40)
    expect(/[\u2013\u2014]/.test(JSON.stringify(g.queue))).toBe(false)
    expect(g.log.flatMap((y) => y.entries).some((e) => e.tone === 'bad' && e.text.length <= 90)).toBe(true)
    expect(readKnow(g)!.h).toBe(4)
    expect(readKnow(g)!.sy).toBe(g.year)
  })

  it('the hit wordings: three of each, a notice at most 120 characters, a log line at most 90, no dash', () => {
    expect(HIT_NOTES.length).toBeGreaterThanOrEqual(3)
    expect(HIT_LOGS.length).toBeGreaterThanOrEqual(3)
    for (const line of HIT_NOTES) {
      expect(line.length, line).toBeLessThanOrEqual(120)
      expect(/[\u2013\u2014]/.test(line), line).toBe(false)
    }
    for (const line of HIT_LOGS) {
      expect(line.length, line).toBeLessThanOrEqual(90)
      expect(/[\u2013\u2014]/.test(line), line).toBe(false)
    }
  })

  it('a hit caps the wanted level at 5', () => {
    const g = lifeWhere(true, 8)
    g.character.wantedLevel = 4
    settleHazard(g)
    expect(g.character.wantedLevel).toBe(5)
  })

  it('a miss changes nothing but the heat, which halves, down to none (the heat field goes with it)', () => {
    const g = lifeWhere(false, 3)
    const c = g.character
    expect(settleHazard(g)).toBe('miss')
    expect(c.criminalRecord).toHaveLength(0)
    expect(c.wantedLevel).toBe(0)
    expect(g.queue).toHaveLength(0)
    expect(readKnow(g)!.h).toBe(1)
    const last = lifeWhere(false, 1)
    expect(settleHazard(last)).toBe('miss')
    expect(readKnow(last)!.h).toBeUndefined()
    expect('h' in (last.flags.know as object)).toBe(false)
  })

  it('settling twice in one year is settling once', () => {
    const g = lifeWhere(true, 12)
    settleHazard(g)
    const once = JSON.stringify(g)
    expect(settleHazard(g)).toBeNull()
    expect(settleHazard(g)).toBeNull()
    expect(JSON.stringify(g)).toBe(once)
    g.year += 1
    expect(settleHazard(g)).not.toBeNull()
  })

  it('with no heat and no record it writes nothing; with a record and no heat it only stamps the year', () => {
    const none = life()
    const json = JSON.stringify(none)
    expect(settleHazard(none)).toBeNull()
    expect(JSON.stringify(none)).toBe(json)
    const g = life()
    buy(g, 'report', keysOf(1))
    expect(settleHazard(g)).toBeNull()
    expect(readKnow(g)!.sy).toBe(g.year)
    expect(g.character.criminalRecord).toHaveLength(0)
    expect(g.character.wantedLevel).toBe(0)
  })

  it('the dead roll nothing and a prisoner is not charged twice, though the heat still cools', () => {
    const dead = lifeWhere(true, 8)
    dead.character.alive = false
    const json = JSON.stringify(dead)
    expect(settleHazard(dead)).toBeNull()
    expect(JSON.stringify(dead)).toBe(json)
    const inside = lifeWhere(true, 8)
    inside.character.prison = { name: 'Stateville', security: 'medium', crime: 'Fraud', sentenceYears: 5, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    expect(settleHazard(inside)).toBe('miss')
    expect(inside.character.criminalRecord).toHaveLength(0)
    expect(readKnow(inside)!.h).toBe(4)
  })

  it('the heat does not depend on the information mode: it settles the same in Exact and in Realistic', () => {
    const a = lifeWhere(true, 8)
    const b = structuredClone(a)
    withInfoMode('exact', () => settleHazard(a))
    withInfoMode('realistic', () => settleHazard(b))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('another character\'s record is not read: an heir carries no heat', () => {
    const g = lifeWhere(true, 8)
    g.character.id = 'heir'
    expect(hazardOf(g)).toEqual({ h: 0, p: 0, hit: false })
    expect(settleHazard(g)).toBeNull()
  })

  it('keeps the ledger honest through a hit', () => {
    const g = lifeWhere(true, 8)
    buy(g, 'informant', keysOf(1))
    settleHazard(g)
    expect(checkLedger(g).ok).toBe(true)
  })
})
