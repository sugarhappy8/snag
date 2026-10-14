// Heavy R&D, the project, the menu and the news (spec 3.3, 3.7, 3.9): what a breakthrough costs, how
// long it takes and how likely it is to work; the risky launch (a record in the market, a line of a
// new kind, the news) or the flop; rivals catching up; the Products menu rows. Quotes, levels and
// menus are pure readers: only the launch roll draws on the game RNG, in a fixed order.
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { boardOf } from '../src/game/business/board-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { marketCtxFor } from '../src/game/business/economy'
import { BREAKTHROUGHS, breakthroughsFor } from '../src/game/business/heavy-data'
import {
  advanceHeavy,
  addHeavy,
  heavyArrival,
  heavyArrivals,
  heavyBlock,
  heavyCost,
  heavyGain,
  heavyLead,
  heavyOdds,
  heavyOf,
  heavyOffers,
  heavyQuality,
  heavyYears,
  readHeavy,
  startHeavy,
  type HeavyRecord,
} from '../src/game/business/heavy-rd'
import { classicIdeas, productIdeas } from '../src/game/business/products'
import { advanceRd, launchP, rdCost, rdCrowding, rdQuality, rdReserve, retireLines, retiredReason, roundBudget, startRd } from '../src/game/business/rd'
import { industryDef } from '../src/game/business/industries'
import { bizOf, normalizeBiz, readBiz, type BizState, type RdProject } from '../src/game/business/state'
import { MAX_MARKET_NEWS, pushMarketNews, readMarketNews, type MarketNews } from '../src/game/history/market-events'
import { needsVote } from '../src/game/business/board'
import { money } from '../src/game/business/util'
import { chance, rand } from '../src/game/rng'
import type { Asset, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { adult, allNodes, company, nextYear, renderAll } from './market-kit'

const NAMES = breakthroughsFor('restaurant').map((x) => x.name)
const NAME = NAMES[1]
const textsOf = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))
const noticeTexts = (g: GameState): string[] => g.queue.flatMap((m) => (m.kind === 'notice' ? [`${m.title}\n${m.text}`] : []))

/** A restaurant owner in 2031 with a booked year behind them (so there is a cash reserve to keep). */
function biz(seed = 3, opts: { cash?: number; industry?: Parameters<typeof company>[1] } = {}) {
  const g = adult(seed, 2030, 'us')
  const a = company(g, opts.industry ?? 'restaurant', { cash: opts.cash ?? 80_000_000 })
  nextYear(g)
  g.queue = []
  return { g, a, b: bizOf(g, a) }
}

function heavyProject(over: Partial<RdProject> = {}): RdProject {
  return { id: 'rd1', name: NAME, budget: 2_000_000, years: 4, progress: 0, odds: 0.4, boost: 0, quality: 80, family: NAME, kind: 'breakthrough', heavy: true, cost: 2_000_000, started: 2031, ...over }
}

function rec(over: Partial<HeavyRecord> = {}): HeavyRecord {
  return { family: NAME, year: 2026, years: 4, quality: 80, cost: 2_000_000, by: 'biz1', ...over }
}

const freeze = (o: unknown): void => {
  if (!o || typeof o !== 'object' || Object.isFrozen(o)) return
  Object.freeze(o)
  for (const v of Object.values(o)) freeze(v)
}

function productsMenuNodes(g: GameState, a: Asset): MenuNode[] {
  const view = businessAssetView(g, a)
  const menu = allNodes(g, view).find((n) => n.type === 'menu' && n.id === `biz.products.${a.id}`)
  if (!menu || menu.type !== 'menu') throw new Error('no products menu')
  return menu.children(g)
}

function heavyRows(g: GameState, a: Asset): MenuAction[] {
  return productsMenuNodes(g, a).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('biz.heavy.'))
}

/** The Products screen as text: every row's label, subtitle, hint and reason, and every info line. */
function productsText(g: GameState, a: Asset): string {
  const out: string[] = []
  for (const n of productsMenuNodes(g, a)) {
    if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    else if (n.type === 'heading') out.push(n.label)
    else out.push(n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '', n.disabledReason?.(g) ?? '')
  }
  return out.join('\n')
}

const subtitleOf = (g: GameState, row: MenuAction): string => (typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle ?? '')

describe('what a breakthrough costs, how long it takes, how likely it is', () => {
  it('costs 8 times the first classic idea’s development cost, rounded to two digits', () => {
    const { g, b } = biz(4)
    const first = classicIdeas(g, b)[0]
    expect(heavyCost(g, b)).toBe(roundBudget(8 * rdCost(b, first)))
    expect(heavyCost(g, b)).toBeGreaterThan(rdCost(b, first) * 7.5)
    expect(heavyCost(g, b)).toBeLessThan(rdCost(b, first) * 8.5)
  })

  it('has no price when the trade has no classic idea the year allows', () => {
    const g = adult(5, 2030, 'us')
    const a = company(g, 'software', { cash: 80_000_000 })
    const b = bizOf(g, a)
    g.year = 1900
    expect(classicIdeas(g, b)).toEqual([])
    expect(heavyCost(g, b)).toBeNull()
    expect(heavyOffers(g, b)).toEqual([])
    expect(heavyBlock(g, b, breakthroughsFor('software')[0].name)).toMatch(/\S/)
    expect(startHeavy(g, a, b, breakthroughsFor('software')[0].name)).toBeNull()
  })

  it('takes 4 to 6 years by the kind of trade (three times a normal project, clamped)', () => {
    const years = Object.keys(BREAKTHROUGHS).map((industry) => heavyYears({ industry }))
    for (const y of years) {
      expect(y).toBeGreaterThanOrEqual(4)
      expect(y).toBeLessThanOrEqual(6)
      expect(Number.isInteger(y)).toBe(true)
    }
    expect(new Set(years)).toEqual(new Set([4, 5, 6]))
    // A food business is the quickest, a tradable good the slowest.
    expect(heavyYears({ industry: 'restaurant' })).toBe(4)
    expect(heavyYears({ industry: 'manufacturing' })).toBe(6)
  })

  it('has odds of 55% of a normal launch, between 8% and 60%', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { g, b } = biz(seed)
      const odds = heavyOdds(g, b)
      expect(odds).toBeCloseTo(Math.min(0.6, Math.max(0.08, 0.55 * launchP(g, b))), 12)
      expect(odds).toBeGreaterThanOrEqual(0.08)
      expect(odds).toBeLessThanOrEqual(0.6)
    }
    // The floor and the ceiling.
    const { g, b } = biz(9)
    b.quality = 0
    b.staff = []
    expect(heavyOdds(g, b)).toBeGreaterThanOrEqual(0.08)
    expect(heavyOdds(g, b)).toBeLessThan(0.3)
    b.quality = 100
    expect(heavyOdds(g, b)).toBeLessThanOrEqual(0.6)
  })

  it('aims 14 points above a lavishly funded ordinary line, never over 97', () => {
    const { g, b } = biz(6)
    expect(heavyQuality(g, b)).toBe(Math.min(97, rdQuality(g, b, 2.5) + 14))
    b.quality = 100
    expect(heavyQuality(g, b)).toBeLessThanOrEqual(97)
  })

  it('is a pure reader: no random numbers, nothing written', () => {
    const { g, b } = biz(7)
    const rng = g.rng
    const state = JSON.stringify(g)
    heavyCost(g, b)
    heavyYears(b)
    heavyOdds(g, b)
    heavyQuality(g, b)
    heavyOffers(g, b)
    for (const n of NAMES) heavyBlock(g, b, n)
    heavyLead(rec())
    const gain = heavyGain(g, b, NAME)
    expect(heavyGain(g, b, NAME)).toBe(gain)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(state)
  })

  it('the board’s yearly gain is finite, never negative, and grows with the company', () => {
    const small = biz(8, { cash: 80_000_000 })
    const big = biz(8, { cash: 80_000_000 })
    big.b.outlets[0].count = 300
    nextYear(big.g)
    big.g.queue = []
    const gs = heavyGain(small.g, small.b, NAME)
    const gb = heavyGain(big.g, bizOf(big.g, big.a), NAME)
    for (const v of [gs, gb]) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
    expect(gb).toBeGreaterThan(gs)
    // A trade with no price has no gain, and neither has a name that isn't a breakthrough here.
    const soft = adult(5, 2030, 'us')
    const sa = company(soft, 'software', { cash: 80_000_000 })
    soft.year = 1900
    expect(heavyGain(soft, bizOf(soft, sa), 'Spreadsheet Package')).toBe(0)
  })
})

describe('which breakthroughs are on offer, and why one is blocked', () => {
  it('offers the trade’s catalogue in order, once the year allows', () => {
    const { g, b } = biz(8)
    const offers = heavyOffers(g, b).map((x) => x.name)
    expect(offers).toEqual(NAMES)
    g.year = 2015
    expect(heavyOffers(g, b).map((x) => x.name)).toEqual(NAMES.slice(0, 2))
    g.year = 1960
    expect(heavyOffers(g, b).map((x) => x.name)).toEqual([NAMES[0]])
    g.year = 1930
    expect(heavyOffers(g, b)).toEqual([])
  })

  it('leaves out a line that is on sale, in development, or retired on purpose', () => {
    const { g, b } = biz(10)
    b.products.push({ name: NAMES[0], launched: 2030, boost: 0.1, quality: 60 })
    b.rd = [heavyProject({ name: NAMES[1], family: NAMES[1] })]
    b.retired = [NAMES[2]]
    expect(heavyOffers(g, b)).toEqual([])
  })

  it('does not offer again a breakthrough this company launched, even after the line is gone', () => {
    let seen = 0
    for (let seed = 1; seed <= 60 && seen < 2; seed++) {
      const g = adult(seed, 2030, 'us')
      const a = company(g, 'restaurant', { cash: 80_000_000 })
      const second = createBusinessAsset(g, 'Second Co', newBiz(g, 'restaurant', 'us', g.character.city, { cash: 80_000_000 }), 0)
      g.assets.push(second)
      nextYear(g)
      g.queue = []
      const b = bizOf(g, a)
      const p = startHeavy(g, a, b, NAME)!
      p.progress = p.years
      if (!advanceHeavy(g, a, b, p, g.year).won) continue
      seen++
      // The line runs its course and leaves the shelves; it was not retired.
      b.products = b.products.filter((x) => x.name !== NAME)
      b.rd = []
      b.heavyLast = undefined
      expect(b.retired ?? []).toEqual([])
      expect(heavyOffers(g, b, a.id).map((x) => x.name)).not.toContain(NAME)
      expect(heavyBlock(g, b, NAME, a.id)).toBe(`You already launched ${NAME}.`)
      expect(startHeavy(g, a, b, NAME)).toBeNull()
      // Without the asset id only the company's own state is checked; the other companies can still take it up.
      expect(heavyOffers(g, b).map((x) => x.name)).toContain(NAME)
      const other = bizOf(g, second)
      expect(heavyOffers(g, other, second.id).map((x) => x.name)).toContain(NAME)
      expect(heavyBlock(g, other, NAME, second.id)).toBeNull()
    }
    expect(seen).toBe(2)
  })

  it('is not offered to deep-tech, studio or finance companies', () => {
    for (const industry of ['semiconductor', 'gameStudio', 'bank'] as const) {
      const g = adult(11, 2030, 'us')
      const a = company(g, industry, { cash: 80_000_000 })
      const b = bizOf(g, a)
      expect(breakthroughsFor(industry).length, industry).toBeGreaterThan(0)
      expect(heavyOffers(g, b), industry).toEqual([])
      const first = breakthroughsFor(industry)[0].name
      expect(heavyBlock(g, b, first), industry).toMatch(/\S/)
      expect(startHeavy(g, a, b, first), industry).toBeNull()
      expect(b.rd ?? []).toEqual([])
    }
  })

  it('gives one reason for each thing in the way, and null when nothing is', () => {
    const { g, b } = biz(12)
    expect(heavyBlock(g, b, NAME)).toBeNull()
    expect(heavyBlock(g, b, 'Not A Breakthrough')).toMatch(/\S/)
    expect(heavyBlock(g, b, '')).toMatch(/\S/)
    // Another trade's breakthrough is not this trade's.
    expect(heavyBlock(g, b, breakthroughsFor('software')[0].name)).toMatch(/\S/)
    // Retired.
    b.retired = [NAME]
    expect(heavyBlock(g, b, NAME)).toBe(`${NAME} was retired. Develop something else.`)
    b.retired = []
    // On sale.
    b.products.push({ name: NAME, launched: 2030, boost: 0.1, quality: 60 })
    expect(heavyBlock(g, b, NAME)).toBe(`${NAME} is already on sale.`)
    b.products = []
    // Not yet invented.
    g.year = 2012
    expect(heavyBlock(g, b, NAMES[2])).toMatch(/ready/)
  })

  it('names the cash that is missing, counting the reserve the company keeps', () => {
    const { g, b } = biz(13)
    const cost = heavyCost(g, b)!
    const need = cost + rdReserve(b)
    expect(rdReserve(b)).toBeGreaterThan(0)
    b.cash = need - 1_000
    const why = heavyBlock(g, b, NAME)!
    expect(why).toContain('short')
    b.cash = need
    expect(heavyBlock(g, b, NAME)).toBeNull()
    b.cash = cost
    expect(heavyBlock(g, b, NAME)).toMatch(/short/)
  })

  it('allows one running breakthrough at a time', () => {
    const { g, a, b } = biz(14)
    expect(startHeavy(g, a, b, NAMES[0])).not.toBeNull()
    expect(heavyBlock(g, b, NAMES[1])).toMatch(/\S/)
    expect(heavyBlock(g, b, NAMES[1])).not.toBe(heavyBlock(g, b, 'x'))
    const cash = b.cash
    g.queue = []
    expect(startHeavy(g, a, b, NAMES[1])).toBeNull()
    expect(b.cash).toBe(cash)
    expect(b.rd?.filter((p) => p.heavy)).toHaveLength(1)
    expect(g.queue.some((m) => m.kind === 'notice')).toBe(true)
  })

  it('waits five calendar years after the last launch or flop', () => {
    const { g, b } = biz(15)
    b.heavyLast = g.year - 4
    const why = heavyBlock(g, b, NAME)!
    expect(why).toContain(String(g.year - 4 + 5))
    b.heavyLast = g.year - 5
    expect(heavyBlock(g, b, NAME)).toBeNull()
    b.heavyLast = g.year
    expect(heavyBlock(g, b, NAME)).not.toBeNull()
    // A date from the future is damage, not a cooldown.
    b.heavyLast = g.year + 400
    expect(heavyBlock(g, b, NAME)).toBeNull()
  })

  it('does not stop ordinary R&D, and ordinary projects do not stop a breakthrough', () => {
    const { g, a, b } = biz(16)
    const idea = productIdeas(g, b, 1)[0]
    expect(startRd(g, a, b, idea, rdCost(b, idea))).not.toBeNull()
    expect(heavyBlock(g, b, NAME)).toBeNull()
    expect(startHeavy(g, a, b, NAME)).not.toBeNull()
    const other = productIdeas(g, b, 2)[1]
    g.queue = []
    expect(startRd(g, a, b, other, rdCost(b, other))).not.toBeNull()
  })

  it('a running breakthrough does not crowd the ordinary projects', () => {
    const { g, a, b } = biz(17)
    const before = rdCrowding(b)
    startHeavy(g, a, b, NAME)
    expect(rdCrowding(b)).toBe(before)
  })
})

describe('starting a breakthrough', () => {
  it('takes exactly the cost from company cash, books it as a cost of the year and queues the notice', () => {
    const { g, a, b } = biz(20)
    const cost = heavyCost(g, b)!
    const years = heavyYears(b)
    const odds = heavyOdds(g, b)
    const cash = b.cash
    const costs = b.yearCosts
    const owner = g.character.money
    const p = startHeavy(g, a, b, NAME)!
    expect(p).not.toBeNull()
    expect(b.cash).toBe(cash - cost)
    expect(b.yearCosts).toBe(costs + cost)
    expect(g.character.money).toBe(owner)
    expect(p).toMatchObject({ name: NAME, family: NAME, kind: 'breakthrough', heavy: true, cost, budget: cost, years, progress: 0, started: g.year, quality: heavyQuality(g, b) })
    expect(p.odds).toBeCloseTo(odds, 3)
    expect(p.id).toMatch(/^rd/)
    expect(b.rd).toContain(p)
    const text = noticeTexts(g).join('\n')
    expect(text).toContain('R&D Underway')
    expect(text).toContain(NAME)
    expect(text).toContain(`${years} years`)
    expect(text).toContain(`${Math.round(odds * 100)}%`)
    expect(textsOf(g).some((t) => t.includes(NAME))).toBe(true)
  })

  it('draws no random numbers and uses one id', () => {
    const { g, a, b } = biz(21)
    const rng = g.rng
    const ids = g.nextId
    const logs = g.log.reduce((n, y) => n + y.entries.length, 0)
    const p = startHeavy(g, a, b, NAME)!
    expect(g.rng).toBe(rng)
    // The project's id, one log line and one notice: three ids, no more.
    expect(g.nextId).toBe(ids + 3)
    expect(g.log.reduce((n, y) => n + y.entries.length, 0)).toBe(logs + 1)
    expect(p.id).toBe(`rd${ids + 1}`)
  })

  it('refuses a retired breakthrough, charging nothing', () => {
    const { g, a, b } = biz(22)
    b.retired = [NAME]
    const cash = b.cash
    expect(startHeavy(g, a, b, NAME)).toBeNull()
    expect(b.cash).toBe(cash)
    expect(noticeTexts(g).join('\n')).toContain(`${NAME} was retired. Develop something else.`)
  })

  it('refuses when the cash would fall under the reserve, naming the shortfall', () => {
    const { g, a, b } = biz(23)
    const cost = heavyCost(g, b)!
    b.cash = cost + rdReserve(b) - 5_000
    const cash = b.cash
    expect(startHeavy(g, a, b, NAME)).toBeNull()
    expect(b.cash).toBe(cash)
    expect(b.rd ?? []).toEqual([])
    expect(noticeTexts(g).join('\n')).toMatch(/short/)
  })

  it('treats a damaged name as a refusal, not a crash', () => {
    const { g, a, b } = biz(24)
    for (const name of ['', '   ', 'Robot Server Fleet ', '__proto__', 'constructor', 'x'.repeat(500)]) {
      expect(() => startHeavy(g, a, b, name), name).not.toThrow()
      expect(startHeavy(g, a, b, name), name).toBeNull()
    }
    expect(b.rd ?? []).toEqual([])
  })
})

describe('saved games', () => {
  const base = { industry: 'restaurant', countryId: 'us', city: 'Chicago' }
  const stored = (rd: Json): Record<string, Json> => ({ ...base, rd })
  const proj = (over: Record<string, Json> = {}): Record<string, Json> => ({ id: 'rd1', name: NAME, budget: 2_000_000, years: 6, progress: 2, odds: 0.4, boost: 0.05, quality: 80, family: NAME, kind: 'breakthrough', started: 2031, ...over })

  it('an old save with an ordinary project loads as it always did', () => {
    const biz1 = normalizeBiz(stored([{ id: 'rd1', name: 'House Salad', budget: 9000, years: 3, progress: 1, odds: 0.5, boost: 0.05, started: 2029 }]), 2030)
    expect(biz1.rd?.[0]).toMatchObject({ name: 'House Salad', years: 3, progress: 1 })
    expect(biz1.rd?.[0].heavy).toBeUndefined()
    expect(biz1.rd?.[0].cost).toBeUndefined()
    expect(biz1.heavyLast).toBeUndefined()
  })

  it('a heavy project keeps 6 years, an ordinary one still clamps to 4', () => {
    const heavy = normalizeBiz(stored([proj({ heavy: true, cost: 2_000_000 })]), 2030)
    expect(heavy.rd?.[0]).toMatchObject({ heavy: true, cost: 2_000_000, years: 6, progress: 2, kind: 'breakthrough' })
    const ordinary = normalizeBiz(stored([proj({ name: 'House Salad', family: 'House Salad', kind: 'core' })]), 2030)
    expect(ordinary.rd?.[0].years).toBe(4)
    expect(ordinary.rd?.[0].heavy).toBeUndefined()
    // Even a heavy project is never longer than six.
    expect(normalizeBiz(stored([proj({ heavy: true, years: 40 })]), 2030).rd?.[0].years).toBe(6)
    expect(normalizeBiz(stored([proj({ heavy: true, years: 0 })]), 2030).rd?.[0].years).toBe(1)
  })

  it('heavy is only believed for `true` and for a catalogue breakthrough', () => {
    for (const v of [1, 'true', 'yes', false, null, [], {}]) {
      const p = normalizeBiz(stored([proj({ heavy: v as Json })]), 2030).rd?.[0]
      expect(p?.heavy, JSON.stringify(v)).toBeUndefined()
      expect(p?.years, JSON.stringify(v)).toBe(4)
    }
    // A made-up name can't claim the heavy path (or a sixth year).
    const made = normalizeBiz(stored([proj({ heavy: true, name: 'Made Up Thing', family: 'Made Up Thing', kind: 'core' })]), 2030).rd?.[0]
    expect(made?.heavy).toBeUndefined()
    expect(made?.years).toBe(4)
  })

  it('cost is a finite non-negative number or nothing', () => {
    const cost = (v: Json) => normalizeBiz(stored([proj({ heavy: true, cost: v })]), 2030).rd?.[0].cost
    expect(cost(5_000_000)).toBe(5_000_000)
    expect(cost(0)).toBe(0)
    for (const v of [-1, 'x', null, true, [], {}, 1e300]) expect(cost(v as Json) === undefined || (Number.isFinite(cost(v as Json)!) && cost(v as Json)! >= 0), JSON.stringify(v)).toBe(true)
    expect(cost(-1)).toBeUndefined()
    expect(cost('x')).toBeUndefined()
    expect(cost(null)).toBeUndefined()
  })

  it('heavyLast is a year or nothing, and survives a round trip', () => {
    const last = (v: Json | undefined) => normalizeBiz({ ...base, ...(v === undefined ? {} : { heavyLast: v }) }, 2030).heavyLast
    expect(last(undefined)).toBeUndefined()
    expect(last(2029)).toBe(2029)
    expect(last(2029.4)).toBe(2029)
    for (const v of ['x', null, true, [], {}, -5, 0, 1e12, -1e12]) expect(last(v as Json), JSON.stringify(v)).toBeUndefined()
    const again = normalizeBiz(JSON.parse(JSON.stringify(normalizeBiz({ ...base, heavyLast: 2029 }, 2030))) as Record<string, Json>, 2030)
    expect(again.heavyLast).toBe(2029)
  })

  it('a live company saves and loads a running breakthrough', () => {
    const { g, a, b } = biz(30)
    const p = startHeavy(g, a, b, NAME)!
    b.heavyLast = 2020
    const copy = normalizeBiz(JSON.parse(JSON.stringify(b)) as Record<string, Json>, g.year)
    expect(copy.rd?.find((x) => x.id === p.id)).toEqual(p)
    expect(copy.heavyLast).toBe(2020)
  })
})

describe('the launch roll', () => {
  const YEAR = 2031
  /** A company with a breakthrough ready to be decided this year-end. */
  function ready(seed: number, over: Partial<RdProject> = {}) {
    const { g, a, b } = biz(seed)
    const p = startHeavy(g, a, b, NAME)!
    Object.assign(p, { progress: p.years }, over)
    g.queue = []
    return { g, a, b, p }
  }

  it('rolls the odds first, then the hit chance, then the quality spread, and nothing else', () => {
    let wins = 0
    let flops = 0
    let hits = 0
    for (let seed = 1; seed <= 60; seed++) {
      const { g, a, b, p } = ready(seed)
      const probe = { rng: g.rng } as unknown as GameState
      const won = chance(probe, Math.min(0.98, Math.max(0.02, p.odds)))
      let quality = 0
      let hit = false
      if (won) {
        hit = chance(probe, 0.35)
        const spread = rand(probe)
        quality = Math.round(Math.min(99, Math.max(5, p.quality! + (spread * 2 - 1) * 10 + (hit ? 12 : 0))))
      }
      const brand = b.brand
      const r = advanceHeavy(g, a, b, p, YEAR)
      expect(g.rng, `seed ${seed}`).toBe(probe.rng)
      expect(r.won).toBe(won)
      if (won) {
        wins++
        if (hit) hits++
        const line = b.products.find((x) => x.name === NAME)!
        expect(line.quality, `seed ${seed}`).toBe(quality)
        expect(b.brand).toBeCloseTo(Math.min(100, brand + (hit ? 12 : 5)), 9)
      } else {
        flops++
        expect(b.brand).toBeCloseTo(Math.max(0, brand - 6), 9)
      }
    }
    // Both branches really happen over the seeds, and some launches are smash hits.
    expect(wins).toBeGreaterThan(5)
    expect(flops).toBeGreaterThan(5)
    expect(hits).toBeGreaterThan(0)
  })

  it('a launch writes the record, puts the line on sale as a new kind and sets the cooldown', () => {
    let seen = 0
    for (let seed = 1; seed <= 60 && seen < 4; seed++) {
      const { g, a, b, p } = ready(seed)
      const cash = b.cash
      const r = advanceHeavy(g, a, b, p, YEAR)
      if (!r.won) continue
      seen++
      const line = b.products.find((x) => x.name === NAME)!
      expect(line).toMatchObject({ name: NAME, family: NAME, kind: 'breakthrough', launched: YEAR + 1 })
      expect(line.quality).toBeGreaterThanOrEqual(5)
      expect(line.quality).toBeLessThanOrEqual(99)
      const records = readHeavy(g, 'restaurant', 'us')
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ family: NAME, year: YEAR + 1, years: p.years, quality: line.quality, cost: p.cost, by: a.id })
      expect(b.heavyLast).toBe(YEAR)
      expect(b.cash).toBe(cash)
      expect(r.line).toContain(NAME)
      expect(r.line).toMatch(new RegExp(`quality ${line.quality}`))
      // The market now reads it: demand for the kind exists from the launch year.
      expect(heavyOf(g, b)).toHaveLength(1)
      expect(Number.isFinite(marketCtxFor(g, b, YEAR + 2).pot)).toBe(true)
    }
    expect(seen).toBe(4)
  })

  it('a flop loses the money for good, costs six brand points and leaves no record and no news', () => {
    let seen = 0
    for (let seed = 1; seed <= 60 && seen < 4; seed++) {
      const { g, a, b, p } = ready(seed)
      const brand = b.brand
      const cash = b.cash
      const news = readMarketNews(g).length
      const r = advanceHeavy(g, a, b, p, YEAR)
      if (r.won) continue
      seen++
      expect(b.products.some((x) => x.name === NAME)).toBe(false)
      expect(readHeavy(g, 'restaurant', 'us')).toEqual([])
      expect(heavyKey(g)).toBeUndefined()
      expect(b.cash).toBe(cash)
      expect(b.brand).toBeCloseTo(Math.max(0, brand - 6), 9)
      expect(b.heavyLast).toBe(YEAR)
      expect(readMarketNews(g)).toHaveLength(news)
      expect(g.queue.filter((m) => m.kind === 'notice')).toEqual([])
      expect(r.line).toContain(NAME)
      expect(textsOf(g).some((t) => t.includes(NAME) && t.includes('flop'))).toBe(true)
      expect(textsOf(g).some((t) => t.includes('launched'))).toBe(false)
    }
    expect(seen).toBe(4)
  })

  it('a launch makes the news: a log line, a modal with a fixed id and an entry in the market news', () => {
    let seen = 0
    for (let seed = 1; seed <= 60 && seen < 3; seed++) {
      const { g, a, b, p } = ready(seed)
      const r = advanceHeavy(g, a, b, p, YEAR)
      if (!r.won) continue
      seen++
      expect(textsOf(g)).toContain(`${a.name} launched ${NAME}.`)
      const modals = g.queue.filter((m) => m.kind === 'notice')
      expect(modals).toHaveLength(1)
      const m = modals[0]
      if (m.kind !== 'notice') throw new Error('not a notice')
      expect(m.title).toBe(`${NAME}: a New Kind of ${industryDef('restaurant').label}`)
      expect(m.text).toContain(a.name)
      expect(m.text).toContain(NAME)
      expect(m.text).toContain(breakthroughsFor('restaurant')[1].note)
      expect(m.text).toContain(String(heavyLead(readHeavy(g, 'restaurant', 'us')[0])))
      expect(m.text).toContain('United States')
      expect(m.id).toMatch(/^heavy-/)
      expect(m.id).not.toMatch(/\s/)
      expect(m.id).toBe(`heavy-${a.id}-${g.generation}-${YEAR + 1}-${NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
      const news = readMarketNews(g)
      expect(news).toHaveLength(1)
      expect(news[0]).toMatchObject({ id: m.id, year: YEAR + 1, industry: 'restaurant', market: 'us', title: m.title, text: m.text })
    }
    expect(seen).toBe(3)
  })

  it('running the same year again does not queue the news or list it twice', () => {
    let done = 0
    for (let seed = 1; seed <= 80 && done < 3; seed++) {
      const { g, a, b, p } = ready(seed)
      const rng = g.rng
      const again = structuredClone(p)
      if (!advanceHeavy(g, a, b, p, YEAR).won) continue
      done++
      // Same year, same roll: the project is decided again with the same dice.
      g.rng = rng
      b.products = b.products.filter((x) => x.name !== NAME)
      advanceHeavy(g, a, b, again, YEAR)
      expect(g.queue.filter((m) => m.kind === 'notice' && m.id.startsWith('heavy-'))).toHaveLength(1)
      expect(readMarketNews(g)).toHaveLength(1)
      expect(readHeavy(g, 'restaurant', 'us')).toHaveLength(1)
    }
    expect(done).toBe(3)
  })

  it('a follow-on launch of a kind someone already opened is no news and does not move the record', () => {
    let seen = 0
    for (let seed = 1; seed <= 80 && seen < 3; seed++) {
      const { g, a, b, p } = ready(seed)
      addHeavy(g, 'restaurant', 'us', rec({ year: 2028, by: 'earlier' }))
      const r = advanceHeavy(g, a, b, p, YEAR)
      if (!r.won) continue
      seen++
      expect(b.products.some((x) => x.name === NAME && x.kind === 'breakthrough')).toBe(true)
      expect(readHeavy(g, 'restaurant', 'us')).toEqual([rec({ year: 2028, by: 'earlier' })])
      expect(g.queue.filter((m) => m.kind === 'notice')).toEqual([])
      expect(readMarketNews(g)).toEqual([])
      expect(textsOf(g)).toContain(`${a.name} launched ${NAME}.`)
      expect(b.heavyLast).toBe(YEAR)
    }
    expect(seen).toBe(3)
  })

  it('goes through advanceRd: the shared tick, the R&D Results notice, and ordinary projects as before', () => {
    let won = false
    let lost = false
    for (let seed = 1; seed <= 80 && !(won && lost); seed++) {
      const { g, a, b } = biz(seed)
      const idea = productIdeas(g, b, 1)[0]
      startRd(g, a, b, idea, rdCost(b, idea))
      const p = startHeavy(g, a, b, NAME)!
      const ordinary = b.rd!.find((x) => !x.heavy)!
      g.queue = []
      p.progress = p.years - 1
      ordinary.progress = 0
      ordinary.years = 3
      advanceRd(g, b, YEAR)
      expect(ordinary.progress).toBe(1)
      expect(b.rd!.some((x) => x.id === ordinary.id)).toBe(true)
      expect(b.rd!.some((x) => x.id === p.id)).toBe(false)
      const results = g.queue.filter((m) => m.kind === 'notice' && m.title.endsWith('R&D Results'))
      expect(results).toHaveLength(1)
      const line = b.products.find((x) => x.name === NAME)
      if (line) {
        won = true
        expect(line.kind).toBe('breakthrough')
        expect(noticeTexts(g).join('\n')).toMatch(/launches|smash hit/)
      } else {
        lost = true
        expect(noticeTexts(g).join('\n')).toContain('flopped')
      }
    }
    expect(won && lost).toBe(true)
  })

  it('a project still in progress just moves a year closer, drawing nothing', () => {
    const { g, a, b } = biz(40)
    const p = startHeavy(g, a, b, NAME)!
    const rng = g.rng
    advanceRd(g, b, YEAR)
    expect(p.progress).toBe(1)
    expect(g.rng).toBe(rng)
    expect(b.rd).toContain(p)
    expect(readHeavy(g, 'restaurant', 'us')).toEqual([])
  })

  it('a project whose heavy flag is not a real breakthrough takes the ordinary path', () => {
    const { g, b } = biz(41)
    b.rd = [{ ...heavyProject({ name: 'Plain Idea', family: 'Plain Idea', kind: 'core', years: 2, progress: 1, odds: 0.5 }) }]
    advanceRd(g, b, YEAR)
    expect(readHeavy(g, 'restaurant', 'us')).toEqual([])
    expect(b.heavyLast).toBeUndefined()
  })

  it('every launch and flop leaves the same state for the same seed', () => {
    const run = (seed: number) => {
      const { g, a, b, p } = ready(seed)
      advanceHeavy(g, a, b, p, YEAR)
      return JSON.stringify({ rng: g.rng, products: b.products, brand: b.brand, flags: g.flags, queue: g.queue, last: b.heavyLast })
    }
    for (const seed of [1, 2, 3, 4, 5]) expect(run(seed)).toBe(run(seed))
  })
})

describe('through the real year', () => {
  it('a breakthrough runs its years, launches or flops, and the first rival follows once', () => {
    let launched = false
    let flopped = false
    for (let seed = 1; seed <= 40 && !(launched && flopped); seed++) {
      const { g, a, b } = biz(seed)
      const p = startHeavy(g, a, b, NAME)!
      const start = g.year
      for (let i = 0; i < p.years; i++) {
        // Still working: nothing is decided before the last year.
        expect(bizOf(g, a).rd?.some((x) => x.id === p.id), `seed ${seed} year ${i}`).toBe(true)
        expect(readHeavy(g, 'restaurant', 'us')).toEqual([])
        nextYear(g)
      }
      expect(bizOf(g, a).rd?.some((x) => x.id === p.id)).toBe(false)
      expect(bizOf(g, a).heavyLast).toBe(start + p.years - 1)
      const records = readHeavy(g, 'restaurant', 'us')
      if (!records.length) {
        flopped = true
        expect(bizOf(g, a).products.some((x) => x.name === NAME)).toBe(false)
        expect(readMarketNews(g)).toEqual([])
        continue
      }
      launched = true
      const rec1 = records[0]
      expect(rec1).toMatchObject({ family: NAME, year: start + p.years, years: p.years, by: a.id })
      expect(bizOf(g, a).products.find((x) => x.name === NAME)).toMatchObject({ kind: 'breakthrough', launched: start + p.years })
      expect(readMarketNews(g)).toHaveLength(1)
      expect(textsOf(g)).toContain(`${a.name} launched ${NAME}.`)
      // The first rival follows once, and not before the pioneer's own development time has passed.
      for (let i = 0; i < 14; i++) nextYear(g)
      const years = g.log.filter((y) => y.entries.some((e) => e.text.endsWith(`launches its own ${NAME}.`)))
      expect(years, `seed ${seed}`).toHaveLength(1)
      expect(years[0].entries.filter((e) => e.text.endsWith(`launches its own ${NAME}.`))).toHaveLength(1)
      expect(years[0].year).toBeGreaterThanOrEqual(rec1.year + rec1.years)
      expect(years[0].year).toBeLessThanOrEqual(rec1.year + rec1.years * 2 + 1)
      expect(readHeavy(g, 'restaurant', 'us')[0].rival).toBeDefined()
    }
    expect(launched).toBe(true)
    expect(flopped).toBe(true)
  })
})

/** The flag a market's records live in: used to see that a flop leaves nothing behind. */
function heavyKey(g: GameState): Json | undefined {
  return g.flags['heavy.restaurant|us']
}

describe('the market news list', () => {
  const item = (n: number, over: Partial<MarketNews> = {}): MarketNews => ({ id: `n${n}`, year: 2030 + n, industry: 'restaurant', market: 'us', emoji: '\u{1F4F0}', title: `Title ${n}`, text: `Text ${n}.`, ...over })

  it('starts empty, whatever the flag holds', () => {
    const g = adult(1, 2030, 'us')
    expect(readMarketNews(g)).toEqual([])
    for (const v of [7, 'x', true, null, { id: 'a' }, [] as Json]) {
      g.flags['market.news'] = v
      expect(readMarketNews(g), JSON.stringify(v)).toEqual([])
    }
  })

  it('keeps the newest 20, oldest dropped, each id once', () => {
    const g = adult(2, 2030, 'us')
    expect(MAX_MARKET_NEWS).toBe(20)
    for (let i = 0; i < 25; i++) expect(pushMarketNews(g, item(i))).toBe(true)
    const list = readMarketNews(g)
    expect(list).toHaveLength(20)
    expect(list.map((x) => x.id)).toEqual(Array.from({ length: 20 }, (_, i) => `n${i + 5}`))
    // The stored list is plain JSON and as short.
    expect((g.flags['market.news'] as Json[]).length).toBe(20)
    expect(pushMarketNews(g, item(24))).toBe(false)
    expect(readMarketNews(g)).toHaveLength(20)
  })

  it('drops damaged entries and cuts long strings', () => {
    const g = adult(3, 2030, 'us')
    const good = item(1)
    g.flags['market.news'] = [null, 4, 'a', [good], { ...good, id: 5 }, { ...good, year: 'x' }, { ...good, text: 9 }, { ...good, industry: null }, { ...good, id: '' }, good, { ...good, id: 'long', title: 'T'.repeat(5000), text: 'x'.repeat(9000), emoji: 'e'.repeat(99) }] as unknown as Json
    const list = readMarketNews(g)
    expect(list.map((x) => x.id)).toEqual(['n1', 'long'])
    expect(list[1].title.length).toBeLessThanOrEqual(120)
    expect(list[1].text.length).toBeLessThanOrEqual(600)
    expect(list[1].emoji.length).toBeLessThanOrEqual(8)
  })

  it('a million entries cost no more than a short scan', () => {
    const g = adult(4, 2030, 'us')
    g.flags['market.news'] = new Array(1_000_000).fill(item(1)) as unknown as Json
    const t = performance.now()
    expect(readMarketNews(g)).toHaveLength(1)
    expect(performance.now() - t).toBeLessThan(250)
  })

  it('a stored list is repaired the next time something is added', () => {
    const g = adult(5, 2030, 'us')
    g.flags['market.news'] = [null, item(1), 7, item(1)] as unknown as Json
    pushMarketNews(g, item(2))
    expect((g.flags['market.news'] as Json[]).length).toBe(2)
  })

  it('refuses an item that is not valid', () => {
    const g = adult(6, 2030, 'us')
    expect(pushMarketNews(g, item(1, { id: '' }))).toBe(false)
    expect(pushMarketNews(g, item(1, { year: Number.NaN }))).toBe(false)
    expect('market.news' in g.flags).toBe(false)
  })
})

describe('rivals catching up', () => {
  const YEAR = 2031
  const reports = (g: GameState): string[] => textsOf(g).filter((t) => t.includes('launches its own'))

  /** The year-end at which the first rival of the market can offer the kind (the rivals of the year that begins). */
  function reportYear(g: GameState, b: BizState, r: HeavyRecord): number {
    for (let y = r.year + r.years - 1; y < r.year + 60; y++) {
      const rivals = marketCtxFor(g, b, y + 1).rivals.filter((x) => !x.legacy && x.pull > 0)
      if (rivals.some((x) => heavyArrival(r, x) <= y + 1)) return y
    }
    throw new Error('no rival ever follows')
  }

  it('says so once, in the year the first rival can offer its own', () => {
    const { g, b } = biz(50)
    const r = rec({ year: 2026, years: 4 })
    addHeavy(g, 'restaurant', 'us', r)
    const at = reportYear(g, b, r)
    const rng = g.rng
    // Every year-end before it: nothing.
    for (let y = r.year - 1; y < at; y++) heavyArrivals(g, b, y)
    expect(reports(g)).toEqual([])
    expect(readHeavy(g, 'restaurant', 'us')[0].rival).toBeUndefined()
    // The year it arrives: one line, the rival named, the record marked.
    heavyArrivals(g, b, at)
    const lines = reports(g)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(new RegExp(`launches its own ${NAME}\\.$`))
    const marked = readHeavy(g, 'restaurant', 'us')[0]
    expect(typeof marked.rival).toBe('string')
    expect(lines[0].startsWith(marked.rival!)).toBe(true)
    // The rest of the record is untouched.
    expect(marked).toMatchObject(r)
    // Never again, not that year and not later.
    heavyArrivals(g, b, at)
    for (let y = at + 1; y < at + 8; y++) heavyArrivals(g, b, y)
    expect(reports(g)).toHaveLength(1)
    expect(g.rng).toBe(rng)
  })

  it('reports no earlier than the pioneer’s own development time after the launch', () => {
    const { g, b } = biz(51)
    const r = rec({ year: 2031, years: 6 })
    addHeavy(g, 'restaurant', 'us', r)
    for (let y = YEAR; y < r.year + r.years - 1; y++) heavyArrivals(g, b, y)
    expect(reports(g)).toEqual([])
    expect(reportYear(g, b, r)).toBeGreaterThanOrEqual(r.year + r.years - 1)
  })

  it('names a rival that really is one of the market’s, and one that can offer it by then', () => {
    const { g, b } = biz(57)
    const r = rec({ year: 2026, years: 4 })
    addHeavy(g, 'restaurant', 'us', r)
    const at = reportYear(g, b, r)
    heavyArrivals(g, b, at)
    const who = readHeavy(g, 'restaurant', 'us')[0].rival!
    const rival = marketCtxFor(g, b, at + 1).rivals.find((x) => x.name === who)
    expect(rival).toBeDefined()
    expect(heavyArrival(r, rival!)).toBeLessThanOrEqual(at + 1)
    expect(rival!.legacy).toBe(false)
    expect(rival!.pull).toBeGreaterThan(0)
  })

  it('does nothing without a record, for a trade nobody pioneered, or in another market', () => {
    const { g, b } = biz(52)
    const rng = g.rng
    const flags = JSON.stringify(g.flags)
    heavyArrivals(g, b, 2040)
    expect(JSON.stringify(g.flags)).toBe(flags)
    addHeavy(g, 'cafe', 'us', rec({ family: breakthroughsFor('cafe')[0].name, year: 2000 }))
    addHeavy(g, 'restaurant', 'jp', rec({ year: 2000 }))
    const flags2 = JSON.stringify(g.flags)
    for (let y = 2000; y < 2060; y++) heavyArrivals(g, b, y)
    expect(JSON.stringify(g.flags)).toBe(flags2)
    expect(reports(g)).toEqual([])
    expect(g.rng).toBe(rng)
  })

  it('is called before advanceRd’s early return for a company with no projects', () => {
    const { g, b } = biz(53)
    const r = rec({ year: 2026, years: 4 })
    addHeavy(g, 'restaurant', 'us', r)
    b.rd = []
    const at = reportYear(g, b, r)
    advanceRd(g, b, at)
    expect(reports(g)).toHaveLength(1)
    // And for a company with no project list at all.
    const other = biz(54)
    addHeavy(other.g, 'restaurant', 'us', r)
    delete other.b.rd
    advanceRd(other.g, other.b, reportYear(other.g, other.b, r))
    expect(reports(other.g)).toHaveLength(1)
  })

  it('one company’s report covers the other companies in the same market', () => {
    const { g, a, b } = biz(55)
    const second = createBusinessAsset(g, 'Second Co', newBiz(g, 'restaurant', 'us', g.character.city, { cash: 5_000_000 }), 0)
    g.assets.push(second)
    const r = rec({ year: 2026, years: 4 })
    addHeavy(g, 'restaurant', 'us', r)
    const at = reportYear(g, b, r)
    heavyArrivals(g, b, at)
    heavyArrivals(g, bizOf(g, second), at)
    expect(a.id).not.toBe(second.id)
    expect(reports(g)).toHaveLength(1)
  })

  it('a damaged rival mark reads as not reported yet', () => {
    const { g } = biz(56)
    g.flags['heavy.restaurant|us'] = [{ ...rec(), rival: 12 }, { ...rec({ family: NAMES[0] }), rival: 'x'.repeat(900) }] as unknown as Json
    const [one, two] = readHeavy(g, 'restaurant', 'us')
    expect(one.rival).toBeUndefined()
    expect(two.rival!.length).toBeLessThanOrEqual(80)
  })

  it('the earliest a rival can follow is the launch plus the development time', () => {
    const r = rec({ year: 2034, years: 5 })
    expect(heavyLead(r)).toBe(2039)
    // No rival, of any size or name, is ever earlier than the lead.
    for (const tier of ['giant', 'major', 'mid', 'small', 'odd'])
      for (let i = 0; i < 80; i++) expect(heavyArrival(r, { id: `rv${i}`, tier })).toBeGreaterThanOrEqual(heavyLead(r))
    // And some giant really is there at the lead.
    expect(Array.from({ length: 80 }, (_, i) => heavyArrival(r, { id: `rv${i}`, tier: 'giant' })).includes(heavyLead(r))).toBe(true)
  })
})

describe('the Products menu', () => {
  it('shows a Heavy R&D heading with a row per breakthrough: cost, years, odds and when rivals could follow', () => {
    const { g, a, b } = biz(60)
    const nodes = productsMenuNodes(g, a)
    const at = nodes.findIndex((n) => n.type === 'heading' && n.label === 'Heavy R&D')
    expect(at).toBeGreaterThan(-1)
    // After the project list and before the ordinary ideas.
    const ideas = nodes.findIndex((n) => n.type === 'heading' && n.label === 'Develop a new product')
    expect(ideas).toBeGreaterThan(at)
    const rows = nodes.filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('biz.heavy.'))
    expect(rows.map((r) => r.label)).toEqual(NAMES)
    expect(rows.every((r) => nodes.indexOf(r) > at && nodes.indexOf(r) < ideas)).toBe(true)
    const years = heavyYears(b)
    const odds = Math.round(heavyOdds(g, b) * 100)
    const lead = heavyLead({ year: g.year + years, years })
    for (const row of rows) {
      const sub = subtitleOf(g, row)
      expect(row.id).toBe(`biz.heavy.${row.label}.${a.id}`)
      expect(sub).toContain(`${years} years`)
      expect(sub).toContain(`${odds}% odds`)
      expect(sub).toContain(String(lead))
      expect(sub).toMatch(/rivals/i)
      expect(row.disabledReason?.(g) ?? null).toBeNull()
      const confirm = row.confirm?.(g) ?? ''
      expect(confirm).toContain(row.label)
      expect(confirm).toContain(`${years} years`)
      expect(confirm).toContain(`${odds}%`)
    }
  })

  it('the row carries the whole cost in its subtitle and its confirm text', () => {
    const { g, a, b } = biz(61)
    const cost = heavyCost(g, b)!
    const [row] = heavyRows(g, a)
    const sub = subtitleOf(g, row)
    // The money text is whatever the game prints for the cost, in the subtitle and the confirm sentence alike.
    expect(sub.split(' · ')[0]).toBe(money(cost))
    expect(row.confirm?.(g)).toContain(money(cost))
    expect(renderAll(g, a).join('\n')).toContain(sub)
  })

  it('a row starts the project when run, and the running project shows with its years left', () => {
    const { g, a } = biz(62)
    const [row] = heavyRows(g, a)
    row.run(g)
    const b = bizOf(g, a)
    expect(b.rd?.filter((p) => p.heavy)).toHaveLength(1)
    const text = productsText(g, a)
    expect(text).toMatch(new RegExp(`${NAMES[0]}: \\d+ years to go`))
    expect(text).toContain('Heavy R&D')
    // The other rows are now blocked with the single reason.
    const rows = heavyRows(g, a)
    for (const r of rows) {
      expect(r.disabledReason?.(g), r.label).toMatch(/\S/)
      expect(r.disabledReason?.(g)).toBe(heavyBlock(g, readBiz(g, a), r.label))
    }
  })

  it('a blocked row says why, and running it changes nothing', () => {
    const { g, a, b } = biz(63)
    b.cash = 10_000
    const [row] = heavyRows(g, a)
    const why = row.disabledReason?.(g)
    expect(why).toMatch(/short/)
    const state = JSON.stringify(g)
    row.run(g)
    expect(JSON.stringify(g)).toBe(state)
    b.cash = 80_000_000
    b.heavyLast = g.year - 1
    expect(heavyRows(g, a)[0].disabledReason?.(g)).toContain(String(g.year - 1 + 5))
  })

  it('shows one line instead of rows when the world has none to offer yet', () => {
    const { g, a } = biz(64)
    g.year = 1930
    const nodes = productsMenuNodes(g, a)
    expect(nodes.some((n) => n.type === 'heading' && n.label === 'Heavy R&D')).toBe(true)
    expect(heavyRows(g, a)).toEqual([])
    expect(nodes.some((n) => n.type === 'info' && n.id.startsWith('biz.heavyNone.'))).toBe(true)
  })

  it('has no Heavy R&D section for a deep-tech company', () => {
    const g = adult(65, 2030, 'us')
    const a = company(g, 'semiconductor', { cash: 80_000_000 })
    nextYear(g)
    const nodes = productsMenuNodes(g, a)
    expect(nodes.some((n) => n.type === 'heading' && n.label === 'Heavy R&D')).toBe(false)
  })

  it('a launched breakthrough says when rivals can have their own', () => {
    const { g, a, b } = biz(66)
    b.products.push({ name: NAME, launched: 2030, boost: 0, quality: 85, family: NAME, kind: 'breakthrough' })
    addHeavy(g, 'restaurant', 'us', rec({ year: 2030, years: 4 }))
    const text = productsText(g, a)
    expect(text).toContain(`rivals can have their own from about ${heavyLead(rec({ year: 2030, years: 4 }))}`)
    // Once rivals sell their own, the line shows their quality instead.
    g.year = 2040
    expect(productsText(g, a)).not.toContain('rivals can have their own from about')
  })

  it('shows the trade’s latest news under the heading', () => {
    const { g, a } = biz(67)
    pushMarketNews(g, { id: 'x1', year: 2029, industry: 'restaurant', market: 'us', emoji: '\u{1F4F0}', title: 'Some News Title', text: 'Something happened.' })
    pushMarketNews(g, { id: 'x2', year: 2029, industry: 'cafe', market: 'us', emoji: '\u{1F4F0}', title: 'Cafe News Title', text: 'Cafe thing.' })
    pushMarketNews(g, { id: 'x3', year: 2029, industry: 'restaurant', market: 'jp', emoji: '\u{1F4F0}', title: 'Japan News Title', text: 'Japan thing.' })
    const text = productsText(g, a)
    expect(text).toContain('Some News Title')
    expect(text).not.toContain('Cafe News Title')
    expect(text).not.toContain('Japan News Title')
  })

  it('menus and quotes draw no random numbers and render from a deep-frozen state', () => {
    const { g, a, b } = biz(68)
    startHeavy(g, a, b, NAMES[0])
    const rng = g.rng
    const before = JSON.stringify(g)
    renderAll(g, a)
    heavyRows(g, a).forEach((r) => {
      r.disabledReason?.(g)
      r.confirm?.(g)
      if (typeof r.subtitle === 'function') r.subtitle(g)
    })
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
    freeze(g)
    expect(() => renderAll(g, a)).not.toThrow()
    expect(() => heavyRows(g, a)).not.toThrow()
    expect(() => heavyOffers(g, bizOf(g, a))).not.toThrow()
    expect(g.rng).toBe(rng)
  })

  it('a company with a board must get its approval, as for any other R&D spending', () => {
    let approved = 0
    let rejected = 0
    for (let seed = 90; seed < 130 && !(approved >= 2 && rejected >= 2); seed++) {
      const { g, a, b } = biz(seed)
      // Outside shareholders and no budget for new projects: the spend needs a vote.
      b.share = 0.4
      boardOf(b).limits = { capex: 0, reserve: 3, pay: 1.5 }
      const cost = heavyCost(g, b)!
      const cash = b.cash
      expect(needsVote(g, a, b, { kind: 'capex', by: 'owner', amount: cost, label: 'x' })).not.toBeNull()
      const [row] = heavyRows(g, a)
      row.run(g)
      const vote = noticeTexts(g).join('\n').match(/Board Vote: (Approved|Rejected)/)
      // The board voted on it either way, and the money moved only if it passed.
      expect(vote, `seed ${seed}`).not.toBeNull()
      const started = bizOf(g, a).rd?.find((p) => p.heavy)
      expect(bizOf(g, a).cash).toBe(started ? cash - cost : cash)
      if (started) approved++
      else rejected++
      expect(Boolean(started), `seed ${seed}`).toBe(vote![1] === 'Approved')
    }
    expect(approved).toBeGreaterThan(0)
    expect(rejected).toBeGreaterThan(0)
  })

  it('without a board the row just starts the project', () => {
    const { g, a } = biz(71)
    const [row] = heavyRows(g, a)
    row.run(g)
    expect(noticeTexts(g).join('\n')).not.toMatch(/Board Vote/)
    expect(bizOf(g, a).rd?.some((p) => p.heavy)).toBe(true)
  })
})

describe('retiring a breakthrough line', () => {
  it('closes that breakthrough for good, like any retired line', () => {
    const { g, a, b } = biz(70)
    b.products = [{ name: NAME, launched: 2030, boost: 0, quality: 85, family: NAME, kind: 'breakthrough' }]
    expect(retireLines(b, 1, g.year, heavyOf(g, b))).toEqual([NAME])
    expect(b.retired).toEqual([NAME])
    expect(heavyOffers(g, b, a.id).map((x) => x.name)).not.toContain(NAME)
    expect(heavyBlock(g, b, NAME, a.id)).toBe(retiredReason(NAME))
    expect(startHeavy(g, a, b, NAME)).toBeNull()
    // The record of the launch stays: the kind itself does not go away.
    addHeavy(g, 'restaurant', 'us', rec())
    expect(heavyOf(g, b)).toHaveLength(1)
  })
})

describe('every breakthrough of every trade can be priced', () => {
  it('has a price, years, odds and quality in every classic trade that has a catalogue entry', () => {
    const skip = new Set(['semiconductor', 'aiLab', 'robotics', 'biotech', 'spaceTech', 'electricVehicles', 'quantum', 'cybersecurity', 'gameStudio', 'bank', 'onlineBank', 'investmentFirm'])
    let n = 0
    for (const industry of Object.keys(BREAKTHROUGHS)) {
      if (skip.has(industry)) continue
      const g = adult(80, 2030, 'us')
      const a = company(g, industry as Parameters<typeof company>[1], { cash: 900_000_000 })
      nextYear(g)
      const b = bizOf(g, a)
      const cost = heavyCost(g, b)
      expect(cost, industry).not.toBeNull()
      expect(cost!, industry).toBeGreaterThan(0)
      expect(Number.isFinite(cost!), industry).toBe(true)
      expect(heavyOffers(g, b).length, industry).toBeGreaterThan(0)
      expect(heavyYears(b), industry).toBeGreaterThanOrEqual(4)
      expect(heavyYears(b), industry).toBeLessThanOrEqual(6)
      expect(heavyOdds(g, b), industry).toBeGreaterThanOrEqual(0.08)
      expect(heavyOdds(g, b), industry).toBeLessThanOrEqual(0.6)
      expect(heavyQuality(g, b), industry).toBeLessThanOrEqual(97)
      n++
    }
    expect(n).toBeGreaterThan(20)
  })
})
