// The mandate planner (advisors/mandate.ts): a pure function from the managed book, the mandate and the
// manager's skill to the year's orders. No game state, no rng: books are built by hand.
import { describe, expect, it } from 'vitest'
import type { ManagedBook, MandateBucket } from '../src/game/investments'
import {
  bandOf,
  blunderOdds,
  defaultMandate,
  PLAN,
  planYear,
  poolOf,
  readMandate,
  safeBucket,
  slipRate,
  type Mandate,
  type Order,
} from '../src/game/advisors/mandate'
import { nextRandom } from '../src/game/rng'

interface BookIn {
  S?: number
  B?: number
  V?: number
  cash?: number
  minOrder?: number
  idle?: string | null
  fundBlock?: string | null
  bondBlock?: string | null
  savBlock?: string | null
  fundSell?: string | null
  bondSell?: string | null
  savSell?: string | null
  bondYield?: number
  savYield?: number
}

/** A managed book with nothing blocked, bonds paying 4% and savings 2%, and a broker minimum of 100. */
function book(o: BookIn = {}): ManagedBook {
  return {
    stocks: { value: o.S ?? 0, buyBlock: o.fundBlock ?? null, sellBlock: o.fundSell ?? null, yield: 0.07 },
    bonds: { value: o.B ?? 0, buyBlock: o.bondBlock ?? null, sellBlock: o.bondSell ?? null, yield: o.bondYield ?? 0.04 },
    savings: { value: o.V ?? 0, buyBlock: o.savBlock ?? null, sellBlock: o.savSell ?? null, yield: o.savYield ?? 0.02 },
    cash: o.cash ?? 0,
    minOrder: o.minOrder ?? 100,
    idle: o.idle ?? null,
  }
}

function mandate(stocks: number, reserve: number, limit: number): Mandate {
  return { stocks, reserve, limit }
}

function sum(orders: Order[], side?: 'buy' | 'sell', bucket?: MandateBucket): number {
  return orders.filter((o) => (!side || o.side === side) && (!bucket || o.bucket === bucket)).reduce((s, o) => s + o.dollars, 0)
}

function find(orders: Order[], bucket: MandateBucket, side: 'buy' | 'sell'): Order | undefined {
  return orders.find((o) => o.bucket === bucket && o.side === side)
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

describe('planYear: investing spare cash', () => {
  it('invests spare cash in proportion to the deficits', () => {
    const p = planYear(book({ cash: 1_000_000 }), mandate(60, 100_000, 100), 70)
    expect(p.pool).toBe(900_000)
    expect(p.spare).toBe(900_000)
    expect(p.target).toBe(0.6)
    expect(p.orders).toHaveLength(2)
    expect(find(p.orders, 'stocks', 'buy')?.dollars).toBe(540_000)
    expect(find(p.orders, 'bonds', 'buy')?.dollars).toBe(360_000)
    expect(p.moved).toBe(900_000)
    expect(p.held).toBe(0)
    expect(p.note).toBeNull()
  })

  it('the limit caps buys and sells together', () => {
    const p = planYear(book({ cash: 1_000_000 }), mandate(60, 100_000, 30), 70)
    expect(p.moved).toBeLessThanOrEqual(270_000)
    expect(Math.abs((find(p.orders, 'stocks', 'buy')?.dollars ?? 0) - 162_000)).toBeLessThanOrEqual(1)
    expect(Math.abs((find(p.orders, 'bonds', 'buy')?.dollars ?? 0) - 108_000)).toBeLessThanOrEqual(1)
    expect(p.held).toBe(630_000)
  })

  it('the reserve is never spent', () => {
    const p = planYear(book({ cash: 50_000 }), mandate(60, 100_000, 100), 70)
    expect(p.orders).toEqual([])
    expect(p.spare).toBe(0)
    expect(p.moved).toBe(0)
    // Exactly the reserve in the bank leaves nothing to invest either.
    expect(planYear(book({ cash: 100_000 }), mandate(60, 100_000, 100), 70).spare).toBe(0)
    // One dollar more is a dollar of spare cash (too small to trade: the broker's minimum is 100).
    const q = planYear(book({ cash: 100_150 }), mandate(60, 100_000, 100), 70)
    expect(q.spare).toBe(150)
    expect(sum(q.orders, 'buy')).toBeLessThanOrEqual(150)
  })

  it('pool and spare read the bank balance above the reserve', () => {
    const p = planYear(book({ S: 100_000, B: 50_000, V: 25_000, cash: 400_500.9 }), mandate(60, 100_000, 100), 70)
    expect(p.spare).toBe(300_500)
    expect(p.pool).toBe(475_500)
    expect(poolOf(book({ S: 100_000, B: 50_000, V: 25_000, cash: 400_500.9 }), 100_000)).toBe(475_500)
  })
})

describe('safeBucket', () => {
  it('sends safe money to the better payer', () => {
    expect(safeBucket(book({ bondYield: 0.04, savYield: 0.02 }))).toBe('bonds')
    expect(safeBucket(book({ bondYield: 0.021, savYield: 0.02 }))).toBe('savings')
    expect(safeBucket(book({ bondYield: 0.025, savYield: 0.02 }))).toBe('savings')
    expect(safeBucket(book({ bondYield: 0.0251, savYield: 0.02 }))).toBe('bonds')
    expect(safeBucket(book({ bondBlock: 'Closed.' }))).toBe('savings')
    expect(safeBucket(book({ savBlock: 'Closed.', bondYield: 0.01, savYield: 0.02 }))).toBe('bonds')
    expect(safeBucket(book({ bondBlock: 'Closed.', savBlock: 'Closed.' }))).toBeNull()
  })

  it('a blocked fund sends everything to safe', () => {
    const p = planYear(book({ cash: 1_000_000, fundBlock: 'The exchange is closed.' }), mandate(60, 100_000, 100), 70)
    expect(p.target).toBe(0)
    expect(p.orders).toEqual([{ bucket: 'bonds', side: 'buy', dollars: 900_000 }])
  })

  it('no open safe bucket means all stocks', () => {
    const p = planYear(book({ cash: 1_000_000, bondBlock: 'Closed.', savBlock: 'Closed.' }), mandate(60, 100_000, 100), 70)
    expect(p.target).toBe(1)
    expect(p.orders).toEqual([{ bucket: 'stocks', side: 'buy', dollars: 900_000 }])
  })

  it('nothing open means no orders and a note', () => {
    const p = planYear(book({ cash: 1_000_000, fundBlock: 'Closed.', bondBlock: 'Closed.', savBlock: 'Closed.' }), mandate(60, 100_000, 100), 70)
    expect(p.orders).toEqual([])
    expect(p.note).toBeTruthy()
  })
})

describe('planYear: rebalancing', () => {
  it('drift inside the band is left alone, past it is sold', () => {
    const b = book({ S: 700_000, V: 300_000, cash: 50_000 })
    const m = mandate(60, 50_000, 100)
    const sharp = planYear(b, m, 90)
    expect(sharp.orders).toEqual([
      { bucket: 'stocks', side: 'sell', dollars: 100_000 },
      { bucket: 'bonds', side: 'buy', dollars: 100_000 },
    ])
    expect(sharp.moved).toBe(200_000)
    expect(planYear(b, m, 30).orders).toEqual([])
  })

  it("a bucket that can't be sold is not sold", () => {
    const p = planYear(book({ S: 700_000, V: 300_000, cash: 50_000, fundSell: 'The exchange is closed.' }), mandate(60, 50_000, 100), 90)
    expect(p.orders).toEqual([])
  })

  it('an underweight fund is bought from the safe side, savings first, then bonds', () => {
    // Pool 600,000: the fund wants 360,000 and the safe side holds 160,000 too much.
    const p = planYear(book({ S: 200_000, B: 300_000, V: 100_000, cash: 0 }), mandate(60, 0, 100), 90)
    expect(p.orders).toEqual([
      { bucket: 'savings', side: 'sell', dollars: 100_000 },
      { bucket: 'bonds', side: 'sell', dollars: 60_000 },
      { bucket: 'stocks', side: 'buy', dollars: 160_000 },
    ])
    // Savings alone is enough when it is big: bonds stay.
    const q = planYear(book({ S: 200_000, B: 300_000, V: 500_000, cash: 0 }), mandate(60, 0, 100), 90)
    expect(q.orders).toEqual([
      { bucket: 'savings', side: 'sell', dollars: 400_000 },
      { bucket: 'stocks', side: 'buy', dollars: 400_000 },
    ])
  })

  it('safe money that is stuck is not counted as sellable', () => {
    const b = { S: 200_000, B: 300_000, V: 100_000, cash: 0 }
    const p = planYear(book({ ...b, savSell: 'Early withdrawal is closed.' }), mandate(60, 0, 100), 90)
    expect(find(p.orders, 'savings', 'sell')).toBeUndefined()
    expect(find(p.orders, 'bonds', 'sell')?.dollars).toBe(160_000)
    expect(find(p.orders, 'stocks', 'buy')?.dollars).toBe(160_000)
    const none = planYear(book({ ...b, savSell: 'Stuck.', bondSell: 'Stuck.' }), mandate(60, 0, 100), 90)
    expect(none.orders).toEqual([])
    // Less is sold when what can be sold is less than the surplus.
    const short = planYear(book({ S: 0, B: 300_000, V: 100_000, cash: 0, bondSell: 'Stuck.' }), mandate(60, 0, 100), 90)
    expect(short.orders).toEqual([
      { bucket: 'savings', side: 'sell', dollars: 100_000 },
      { bucket: 'stocks', side: 'buy', dollars: 100_000 },
    ])
  })

  it('the sell side of a rebalance counts against the limit', () => {
    // 100,000 of drift would be 200,000 of orders; a 10% limit on a 1,000,000 pool allows 100,000.
    const p = planYear(book({ S: 700_000, V: 300_000, cash: 0 }), mandate(60, 0, 10), 90)
    expect(sum(p.orders, 'sell')).toBe(50_000)
    expect(sum(p.orders, 'buy')).toBe(50_000)
    expect(p.moved).toBe(100_000)
    expect(p.held).toBe(100_000)
  })

  it('tilt moves the target and clamps', () => {
    const b = book({ cash: 1_000_000 })
    expect(planYear(b, mandate(60, 0, 100), 70, 0).target).toBe(0.6)
    expect(planYear(b, mandate(60, 0, 100), 70, 25).target).toBe(0.85)
    expect(planYear(b, mandate(90, 0, 100), 70, 25).target).toBe(1)
    expect(planYear(b, mandate(10, 0, 100), 70, -25).target).toBe(0)
    const tilted = planYear(b, mandate(60, 0, 100), 70, 25)
    expect(find(tilted.orders, 'stocks', 'buy')?.dollars).toBe(850_000)
    expect(find(tilted.orders, 'bonds', 'buy')?.dollars).toBe(150_000)
  })
})

describe('planYear: dust and trimming', () => {
  it('dust is dropped', () => {
    // 4,000 short of the fund target on a 1,000,000 pool: under half a percent.
    const small = planYear(book({ S: 596_000, B: 400_000, cash: 4_000 }), mandate(60, 0, 100), 70)
    expect(small.pool).toBe(1_000_000)
    expect(small.orders).toEqual([])
    // 5,000 is exactly half a percent and stays.
    expect(planYear(book({ S: 595_000, B: 400_000, cash: 5_000 }), mandate(60, 0, 100), 70).orders).toEqual([{ bucket: 'stocks', side: 'buy', dollars: 5_000 }])
    // Under the broker's minimum is dropped even when it is over half a percent.
    const tiny = planYear(book({ S: 6_000, cash: 6_000, minOrder: 10_000 }), mandate(100, 0, 100), 70)
    expect(tiny.orders).toEqual([])
  })

  it('buys never exceed spare cash plus sells', () => {
    // The limit leaves 5,000 for the rebalance, so the fund sale (2,500) is dust and its matching buy goes with it.
    const p = planYear(book({ S: 700_000, B: 205_000, cash: 95_000 }), mandate(60, 0, 10), 90)
    expect(p.spare).toBe(95_000)
    expect(find(p.orders, 'stocks', 'sell')).toBeUndefined()
    expect(sum(p.orders, 'buy')).toBeLessThanOrEqual(p.spare + sum(p.orders, 'sell'))
    expect(find(p.orders, 'bonds', 'buy')?.dollars).toBe(95_000)
  })

  it('an idle book or a pool under the minimum order does nothing and says why', () => {
    const idle = planYear(book({ cash: 1_000_000, idle: 'You must be 18 or older to trade.' }), mandate(60, 0, 100), 70)
    expect(idle.orders).toEqual([])
    expect(idle.spare).toBe(0)
    expect(idle.moved).toBe(0)
    expect(idle.note).toBe('You must be 18 or older to trade.')
    const nothing = planYear(book({ cash: 50, minOrder: 100 }), mandate(60, 0, 100), 70)
    expect(nothing.orders).toEqual([])
    expect(nothing.note).toBe('Nothing to run yet.')
  })
})

describe('the skill knobs', () => {
  it('skill tunes the knobs', () => {
    expect(bandOf(30)).toBeGreaterThan(bandOf(90))
    expect(slipRate(30)).toBeGreaterThan(slipRate(90))
    expect(blunderOdds(100)).toBe(0)
    expect(blunderOdds(0)).toBe(0.12)
    expect(bandOf(100)).toBeCloseTo(0.03, 12)
    expect(bandOf(0)).toBeCloseTo(0.13, 12)
    expect(slipRate(0)).toBeCloseTo(0.005, 12)
    expect(slipRate(100)).toBe(0)
    expect(PLAN).toEqual({ bandBase: 3, bandPerPoint: 0.1, slipPerPoint: 0.00005, blunderMax: 0.12, swing: 25, dust: 0.005 })
    for (const bad of [NaN, -5, 500, Infinity, -Infinity]) {
      for (const f of [bandOf, slipRate, blunderOdds]) expect(Number.isFinite(f(bad))).toBe(true)
    }
    // A skill that isn't a number reads as 50, clamped to 0 to 100.
    expect(bandOf(NaN)).toBe(bandOf(50))
    expect(slipRate(NaN)).toBe(slipRate(50))
    expect(bandOf(500)).toBe(bandOf(100))
    expect(bandOf(-5)).toBe(bandOf(0))
    expect(blunderOdds(-5)).toBe(blunderOdds(0))
    expect(bandOf('x' as unknown as number)).toBe(bandOf(50))
  })

  it('a weak manager lets drift run where a strong one rebalances', () => {
    const b = book({ S: 680_000, V: 320_000, cash: 0 })
    const m = mandate(60, 0, 100)
    expect(planYear(b, m, 90).orders.length).toBe(2)
    expect(planYear(b, m, 30).orders).toEqual([])
  })
})

describe('readMandate and defaultMandate', () => {
  it('reads junk as null or the nearest legal value', () => {
    for (const junk of [null, undefined, 7, 'x', true, [], [1, 2]]) expect(readMandate(junk)).toBeNull()
    expect(readMandate({})).toEqual({ stocks: 60, reserve: 0, limit: 50 })
    expect(readMandate({ stocks: 47, limit: 3, reserve: -9 })).toEqual({ stocks: 45, reserve: 0, limit: 10 })
    expect(readMandate({ stocks: 1000, limit: 1000, reserve: 1e300 })).toEqual({ stocks: 100, reserve: 1e15, limit: 100 })
    expect(readMandate({ stocks: -40, limit: 52, reserve: 12_345.6 })).toEqual({ stocks: 0, reserve: 12_346, limit: 50 })
    expect(readMandate({ stocks: NaN, limit: NaN, reserve: NaN })).toEqual({ stocks: 60, reserve: 0, limit: 50 })
    expect(readMandate({ stocks: 'x', limit: null, reserve: [1] })).toEqual({ stocks: 60, reserve: 0, limit: 50 })
    expect(readMandate({ stocks: 45, limit: 25, reserve: 500_000, extra: 'gone' })).toEqual({ stocks: 45, reserve: 500_000, limit: 25 })
  })

  it('does not mutate what it reads and returns a fresh object', () => {
    const raw = deepFreeze({ stocks: 47, limit: 3, reserve: 9.5, extra: 1 })
    const got = readMandate(raw)
    expect(got).toEqual({ stocks: 45, reserve: 10, limit: 10 })
    expect(raw).toEqual({ stocks: 47, limit: 3, reserve: 9.5, extra: 1 })
    const m = { stocks: 45, limit: 25, reserve: 7 }
    expect(readMandate(m)).not.toBe(m)
  })

  it('the default is 60 percent stocks, a limit of 50 and a reserve of at least twice the income', () => {
    const d = defaultMandate(book({ cash: 5_000_000 }), 45_000)
    expect(d.stocks).toBe(60)
    expect(d.limit).toBe(50)
    expect(d.reserve).toBeGreaterThanOrEqual(90_000)
    // A tenth of cash and holdings wins when it is bigger: 5,000,000 + 3,000,000.
    expect(defaultMandate(book({ S: 2_000_000, B: 600_000, V: 400_000, cash: 5_000_000 }), 45_000).reserve).toBe(800_000)
    // Two significant digits, never below the floor of twice the income.
    expect(defaultMandate(book({ cash: 10 }), 46_789).reserve).toBe(94_000)
    expect(defaultMandate(book({ cash: 10 }), 46_789).reserve).toBeGreaterThanOrEqual(2 * 46_789)
    expect(defaultMandate(book({ cash: 1_234_567 }), 1_000).reserve).toBe(130_000)
    // A planner-legal mandate: the reader keeps it as it is.
    expect(readMandate(d)).toEqual(d)
  })

  it('the default is total over hostile inputs', () => {
    const d = defaultMandate(book({ cash: NaN, S: -5, B: Infinity }), NaN)
    expect(Number.isFinite(d.reserve)).toBe(true)
    expect(d.reserve).toBeGreaterThanOrEqual(0)
    expect(d.reserve).toBeLessThanOrEqual(1e15)
    expect(defaultMandate(book({ cash: 1e300 }), 1e300).reserve).toBe(1e15)
    expect(defaultMandate(book({}), 0).reserve).toBe(0)
  })
})

describe('totality', () => {
  it('hostile numbers never make a plan that is not finite', () => {
    const hostile = [NaN, -1, 0, 1e300, Infinity, -Infinity]
    for (const v of hostile) {
      const b = book({ S: v, B: 1_000, V: 1_000, cash: v, minOrder: v })
      for (const skill of [NaN, 50]) {
        const p = planYear(b, { stocks: v, reserve: v, limit: v }, skill, v)
        for (const o of p.orders) {
          expect(Number.isInteger(o.dollars)).toBe(true)
          expect(o.dollars).toBeGreaterThan(0)
        }
        for (const x of [p.pool, p.spare, p.target, p.moved, p.held]) expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(poolOf(b, v))).toBe(true)
      }
    }
  })

  it('reads a frozen book and mandate without touching them', () => {
    const b = deepFreeze(book({ S: 700_000, V: 300_000, cash: 50_000 }))
    const m = deepFreeze(mandate(60, 50_000, 100))
    const before = JSON.stringify([b, m])
    const p = planYear(b, m, 90, 25)
    expect(JSON.stringify([b, m])).toBe(before)
    expect(JSON.stringify(planYear(b, m, 90, 25))).toBe(JSON.stringify(p))
  })
})

describe('properties over many books', () => {
  it('300 random books obey the planner rules', () => {
    // A local stream (rng.ts nextRandom), never the game's.
    let state = 20_261_014
    const u = (): number => {
      const [v, next] = nextRandom(state)
      state = next
      return v
    }
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(u() * xs.length)]
    const money = (): number => (u() < 0.15 ? 0 : Math.round(10 ** (2 + u() * 7)))
    const block = (): string | null => (u() < 0.2 ? 'Closed.' : null)
    for (let i = 0; i < 300; i++) {
      const b = book({
        S: money(),
        B: money(),
        V: money(),
        cash: money(),
        minOrder: pick([10, 100, 1_000, 25_000]),
        idle: u() < 0.05 ? 'Not today.' : null,
        fundBlock: block(),
        bondBlock: block(),
        savBlock: block(),
        fundSell: block(),
        bondSell: block(),
        savSell: block(),
        bondYield: pick([0.01, 0.025, 0.04, 0.06]),
        savYield: pick([0.005, 0.02, 0.03]),
      })
      const m = mandate(pick([0, 5, 25, 60, 90, 100]), pick([0, 1_000, 50_000, 5_000_000]), pick([10, 25, 50, 100]))
      const skill = Math.round(u() * 100)
      const tilt = pick([0, 0, 25, -25])
      const before = JSON.stringify([b, m])
      const p = planYear(b, m, skill, tilt)
      const tag = `book ${i}: ${before} skill ${skill} tilt ${tilt}`

      expect(JSON.stringify([b, m]), tag).toBe(before)
      expect(JSON.stringify(planYear(b, m, skill, tilt)), tag).toBe(JSON.stringify(p))

      const dust = Math.max(b.minOrder, PLAN.dust * p.pool)
      for (const o of p.orders) {
        expect(Number.isFinite(o.dollars) && Number.isInteger(o.dollars) && o.dollars > 0, tag).toBe(true)
        expect(o.dollars, tag).toBeGreaterThanOrEqual(dust)
        // Nothing is bought where buying is blocked or sold where selling is.
        if (o.side === 'buy') expect(b[o.bucket].buyBlock, tag).toBeNull()
        else expect(b[o.bucket].sellBlock, tag).toBeNull()
        // No sale is bigger than what the bucket holds.
        if (o.side === 'sell') expect(o.dollars, tag).toBeLessThanOrEqual(b[o.bucket].value)
      }
      const buys = sum(p.orders, 'buy')
      const sells = sum(p.orders, 'sell')
      expect(buys, tag).toBeLessThanOrEqual(p.spare + sells)
      expect(p.moved, tag).toBe(buys + sells)
      expect(p.moved, tag).toBeLessThanOrEqual((m.limit / 100) * p.pool + 1)
      expect(p.held, tag).toBeGreaterThanOrEqual(0)
      // Sells come first in the list.
      const firstBuy = p.orders.findIndex((o) => o.side === 'buy')
      if (firstBuy >= 0) expect(p.orders.slice(firstBuy).every((o) => o.side === 'buy'), tag).toBe(true)
      // A bucket is bought or sold, never both, and at most once a side.
      const keys = p.orders.map((o) => `${o.bucket}:${o.side}`)
      expect(new Set(keys).size, tag).toBe(keys.length)
      for (const bucket of ['stocks', 'bonds', 'savings'] as const) expect(Boolean(find(p.orders, bucket, 'buy') && find(p.orders, bucket, 'sell')), tag).toBe(false)
      // The reserve is spared and an idle book does nothing.
      expect(p.spare, tag).toBe(b.idle ? 0 : Math.max(0, Math.floor(b.cash - m.reserve)))
      if (b.idle) expect(p.orders, tag).toEqual([])
      // The pool is the three buckets plus the spare cash.
      expect(p.pool, tag).toBe(b.stocks.value + b.bonds.value + b.savings.value + p.spare)
    }
  })
})
