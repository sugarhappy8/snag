// Operations R&D (R&D 3.0 task 3): fixed prices, the learning curve and its fade, the effects the year
// uses, the program lifecycle with its one dice roll, grants, the board vote and the Research &
// Operations screen. Fixed seeds; restaurant is low tier, brewery mid, software high.
import { describe, expect, it, vi } from 'vitest'
import * as board from '../src/game/business/board'
import { bizWorth } from '../src/game/business/economy'
import { businessEffects, saveExpansion, STRATEGIES } from '../src/game/business/dynamics'
import { heavyEligible } from '../src/game/business/heavy-rd'
import { INDUSTRIES } from '../src/game/business/industries'
import { RD_CREDIT } from '../src/game/business/deeptech-data'
import { labGrantAmount, labTierOf, LAB_GRANT_GAP, LAB_GRANT_SITES, OPS_COOLDOWN, OPS_PROGRAMS, OPS_TIER, opsProgram, RUNG_X } from '../src/game/business/lab-data'
import { labMenus } from '../src/game/business/lab-menu'
import { businessView } from '../src/game/business/manage'
import { opsBase, opsBlock, opsGain, opsOdds, opsOffers, opsPrice, opsValue, opsYears } from '../src/game/business/lab-rules'
import { applyWin, draftLab, LAB_TRACKS, levelOf, opsEffectsOf, readLab, type LabProgram } from '../src/game/business/lab-state'
import { advanceLab, bookLabYear, doOps, startOps } from '../src/game/business/lab-year'
import { DISCOUNT, HORIZON, rdReserve, roundBudget } from '../src/game/business/rd'
import { MAX_STORED_PROJECTS, readBiz } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { clampN, money } from '../src/game/business/util'
import type { Industry } from '../src/game/data/markets'
import { chance, nextRandom } from '../src/game/rng'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { deepFreeze, labGame, noDraw, patchLab } from './lab-kit'
import { allNodes, nextYear } from './market-kit'

const COUNTRIES = [...Object.keys(RD_CREDIT), 'zz']
const TRADES = Object.keys(INDUSTRIES) as Industry[]

/** A program in progress, ready to finish at the next year end unless `over` says otherwise. */
function prog(g: GameState, id: string, over: Partial<LabProgram> = {}): LabProgram {
  return { id, started: g.year, years: 1, progress: 0, odds: 0.9, price: 50_000, grant: 0, ...over }
}

/** Move the dice so the next roll lands under 0.5 (a win at high odds) or over it (a flop at low odds). */
function rig(g: GameState, win: boolean): void {
  for (let i = 0; i < 10_000; i++) {
    if (nextRandom(g.rng)[0] < 0.5 === win) return
    g.rng = (g.rng + 1) | 0
  }
  throw new Error('no dice found')
}

/** The money and the stored lab, as text: equal before and after means a refusal changed nothing. */
function snap(g: GameState, a: Asset): string {
  const b = readBiz(g, a)
  return JSON.stringify([b.cash, b.yearCosts, b.yearIncome, b.lab ?? null, b.rd, g.rng])
}

function textOf(g: GameState, n: MenuNode): string {
  if (n.type === 'info') return typeof n.text === 'function' ? n.text(g) : n.text
  if (n.type === 'heading') return n.label
  return [n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''), n.hint?.(g) ?? '', n.disabledReason?.(g) ?? ''].join('\n')
}

describe('prices, years and odds', () => {
  it('a price ignores cash, sales and valuation', () => {
    const { b } = labGame(3, 'restaurant')
    const quote = () => ([1, 2, 3] as const).map((r) => [opsPrice(b, r), opsYears(b, r)])
    const base = quote()
    b.cash *= 1000
    b.valuation *= 1000
    if (b.last) b.last.revenue *= 1000
    b.outlets[0].count = 500
    expect(quote()).toEqual(base)
    expect(opsPrice(b, 1)).toBe(roundBudget(opsBase(b) * RUNG_X[0]))
  })

  it('price, years and odds follow the rules for all 55 trades and 30 countries [RF4]', () => {
    const { g, b } = labGame(4, 'restaurant')
    const home = g.year
    expect(TRADES).toHaveLength(55)
    let checked = 0
    for (const industry of TRADES) {
      if (!heavyEligible({ industry })) continue
      for (const country of COUNTRIES) {
        b.industry = industry
        b.countryId = country
        b.city = getCountry(country).cities[0]
        const prices = ([1, 2, 3] as const).map((r) => opsPrice(b, r))
        const years = ([1, 2, 3] as const).map((r) => opsYears(b, r))
        ;([1, 2, 3] as const).forEach((r, i) => {
          expect(prices[i], `${industry} ${country} price ${r}`).toBe(roundBudget(opsBase(b) * RUNG_X[i]))
          expect(Number.isFinite(prices[i]) && prices[i] > 0, `${industry} ${country} price ${r}`).toBe(true)
          expect(years[i]).toBeGreaterThanOrEqual(1)
          expect(years[i]).toBeLessThanOrEqual(4)
        })
        expect(prices[0] < prices[1] && prices[1] < prices[2], `${industry} ${country} prices rise`).toBe(true)
        expect(years[0] <= years[1] && years[1] <= years[2], `${industry} ${country} years do not fall`).toBe(true)
        for (const year of [1900, 2030, 2100]) {
          for (const sites of [1, 1000]) {
            g.year = year
            b.outlets[0].count = sites
            const odds = ([1, 2, 3] as const).map((r) => opsOdds(g, b, r))
            for (const o of odds) {
              expect(Number.isFinite(o) && o >= 0.15 && o <= 0.92, `${industry} ${country} odds`).toBe(true)
            }
            expect(odds[0] >= odds[1] && odds[1] >= odds[2], `${industry} ${country} odds do not rise with the rung`).toBe(true)
          }
        }
        checked++
      }
    }
    g.year = home
    expect(checked).toBeGreaterThan(30 * 40)
  }, 120_000)

  it('offers rungs 1-2 at low tier and 1-3 at mid and high, none before the first year [RF4]', () => {
    const ids = (g: GameState, b: ReturnType<typeof readBiz>) => opsOffers(g, b).map((p) => p.id)
    const mid = labGame(5, 'brewery')
    mid.g.year = 1900
    expect(ids(mid.g, mid.b)).toEqual([])
    mid.g.year = 1904
    expect(ids(mid.g, mid.b)).toEqual([])
    mid.g.year = 1905
    expect(ids(mid.g, mid.b)).toEqual(['ops.cost.1', 'ops.yield.1', 'ops.quality.1'])
    // the first years of the table: quality 2 from 1950, cost 2 from 1955, yield 2 from 1960
    mid.g.year = 1952
    expect(ids(mid.g, mid.b)).toEqual(['ops.cost.1', 'ops.yield.1', 'ops.quality.1', 'ops.quality.2'])
    mid.g.year = 1960
    expect(ids(mid.g, mid.b)).toEqual(['ops.cost.1', 'ops.cost.2', 'ops.yield.1', 'ops.yield.2', 'ops.quality.1', 'ops.quality.2'])
    mid.g.year = 1994
    expect(ids(mid.g, mid.b)).toEqual(['ops.cost.1', 'ops.cost.2', 'ops.cost.3', 'ops.yield.1', 'ops.yield.2', 'ops.yield.3', 'ops.quality.1', 'ops.quality.2'])
    mid.g.year = 2030
    expect(ids(mid.g, mid.b)).toEqual(OPS_PROGRAMS.map((p) => p.id))
    const high = labGame(5, 'software')
    expect(ids(high.g, high.b)).toEqual(OPS_PROGRAMS.map((p) => p.id))
    const low = labGame(5, 'restaurant')
    expect(ids(low.g, low.b)).toEqual(OPS_PROGRAMS.filter((p) => p.rung < 3).map((p) => p.id))
    expect(low.g.year).toBe(2031)
    // the deep-tech, finance and studio trades are offered nothing
    for (const industry of ['aiLab', 'bank', 'gameStudio'] as const) {
      const x = labGame(5, industry)
      expect(opsOffers(x.g, x.b), industry).toEqual([])
    }
  })

  it('opsBlock gives one reason in order [RF3]', () => {
    for (const industry of ['aiLab', 'bank', 'gameStudio'] as const) {
      const x = labGame(6, industry)
      const why = opsBlock(x.g, x.b, 'ops.cost.1')
      expect(why, industry).toBeTruthy()
      expect(opsBlock(x.g, x.b, 'nope'), industry).toBe(why)
    }
    const { g, a, b } = labGame(6, 'restaurant', { country: 'ca' })
    expect(opsBlock(g, b, 'ops.cost.1')).toBeNull()
    // an id that is not a program
    const unknown = opsBlock(g, b, 'nope')
    expect(unknown).toBeTruthy()
    expect(opsBlock(g, b, '__proto__')).toBeTruthy()
    expect(opsBlock(g, b, 'constructor')).toBeTruthy()
    // the era comes before the rung
    g.year = 1900
    expect(opsBlock(g, b, 'ops.cost.1')).toMatch(/ready/)
    expect(opsBlock(g, b, 'ops.cost.3')).toMatch(/ready/)
    g.year = 2031
    // a low-tech trade has no third rung
    const rung = opsBlock(g, b, 'ops.cost.3')
    expect(rung).toMatch(/low-tech/i)
    // a track that is busy
    expect(startOps(g, a, b, 'ops.cost.1', true)).not.toBeNull()
    const busy = opsBlock(g, b, 'ops.cost.2')
    expect(busy).toMatch(/already/)
    expect(opsBlock(g, b, 'ops.cost.3')).toBe(rung)
    // the cooldown comes after the busy track and before storage and cash
    patchLab(b, (d) => {
      d.programs = []
      d.done['ops.cost.2'] = g.year - 1
    })
    const cool = opsBlock(g, b, 'ops.cost.2')
    expect(cool).toMatch(new RegExp(String(g.year - 1 + OPS_COOLDOWN)))
    patchLab(b, (d) => {
      d.programs.push(prog(g, 'ops.cost.1'))
    })
    expect(opsBlock(g, b, 'ops.cost.2')).toBe(busy)
    patchLab(b, (d) => {
      d.programs = []
      d.done['ops.cost.2'] = g.year - OPS_COOLDOWN
    })
    expect(opsBlock(g, b, 'ops.cost.2')).toBeNull()
    // a win booked for fiscal F frees the program in year F + 3
    patchLab(b, (d) => {
      d.done['ops.cost.2'] = g.year - OPS_COOLDOWN + 1
    })
    expect(opsBlock(g, b, 'ops.cost.2')).toMatch(new RegExp(`again in ${g.year + 1}\\.`))
    patchLab(b, (d) => {
      d.done = {}
    })
    // the storage guard
    const rd = b.rd
    b.rd = Array.from({ length: MAX_STORED_PROJECTS }, (_, i) => ({ id: `r${i}`, name: `Line ${i}`, budget: 1000, years: 1, progress: 0, odds: 0.5, boost: 0, started: g.year }))
    expect(opsBlock(g, b, 'ops.cost.1')).toMatch(/drowning/)
    b.rd = rd
    // cash, short by one dollar and then exactly enough
    const need = opsPrice(b, 1) + rdReserve(b)
    b.cash = need - 1
    expect(opsBlock(g, b, 'ops.cost.1')).toMatch(/short/)
    expect(opsBlock(g, b, 'ops.cost.1', true)).toBeNull()
    b.cash = need
    expect(opsBlock(g, b, 'ops.cost.1')).toBeNull()
  })
})

describe('the learning curve and the effects', () => {
  it('the learning curve gains 20% less each win and never passes .95', () => {
    const st = draftLab({})
    const p = opsProgram('ops.cost.2')!
    for (let n = 0; n < 14; n++) {
      const leff = levelOf(st, 'cost', 2031)
      const gain = (1 - leff) * 0.4 * Math.pow(0.8, Math.min(n, 12))
      applyWin(st, p, 2030)
      expect(st.levels.cost.v).toBeCloseTo(Math.min(0.95, leff + gain), 10)
      expect(st.levels.cost.at).toBe(2031)
      expect(st.runs.cost).toBe(Math.min(n + 1, 12))
      expect(st.done['ops.cost.2']).toBe(2030)
    }
    expect(st.levels.cost.v).toBeLessThanOrEqual(0.95)
    expect(st.levels.yield.v).toBe(0)
  })

  it('a level fades 5% a year', () => {
    const st = draftLab({})
    st.levels.cost = { v: 0.5, at: 2031 }
    expect(levelOf(st, 'cost', 2031)).toBe(0.5)
    expect(levelOf(st, 'cost', 2033)).toBeCloseTo(0.5 * 0.95 ** 2, 12)
    expect(levelOf(st, 'cost', 2020)).toBe(0.5)
    expect(levelOf(st, 'yield', 2040)).toBe(0)
  })

  it('effects stay within the tier caps and the old clamps [RF4]', () => {
    for (const [industry, tier] of [['restaurant', 'low'], ['brewery', 'mid'], ['software', 'high']] as const) {
      const { g, b } = labGame(7, industry)
      patchLab(b, (d) => {
        for (const t of LAB_TRACKS) d.levels[t] = { v: 0.95, at: g.year }
      })
      const cap = OPS_TIER[tier]
      expect(labTierOf(industry)).toBe(tier)
      const e = opsEffectsOf(b, g.year)
      expect(e.cost, industry).toBeCloseTo(-cap.cost * 0.95, 12)
      expect(e.capacity, industry).toBeCloseTo(cap.yield * 0.95, 12)
      expect(e.demand, industry).toBeCloseTo(cap.quality * 0.95, 12)
      expect(e.cost).toBeGreaterThanOrEqual(-cap.cost)
      expect(e.capacity).toBeLessThanOrEqual(cap.yield)
      expect(e.demand).toBeLessThanOrEqual(cap.quality)
      // it fades with the years
      expect(opsEffectsOf(b, g.year + 2).cost).toBeCloseTo(e.cost * 0.95 ** 2, 12)
      // every strategy at once: the old clamps stay the outer bound
      saveExpansion(b, { strategies: STRATEGIES.map((s) => ({ id: s.id, country: b.countryId, started: g.year - 1, expires: g.year + 5 })), studies: [], lastYear: -1 })
      const all = businessEffects(g, b, b.countryId, g.year)
      expect(all.cost).toBeGreaterThanOrEqual(0.65)
      expect(all.demand).toBeLessThanOrEqual(1.65)
      expect(all.capacity).toBeLessThanOrEqual(1.4)
      const cutters = ['local', 'training', 'resilience', 'efficiency']
      saveExpansion(b, { strategies: cutters.map((id) => ({ id, country: b.countryId, started: g.year - 1, expires: g.year + 5 })), studies: [], lastYear: -1 })
      expect(businessEffects(g, b, b.countryId, g.year).cost, industry).toBeGreaterThanOrEqual(0.65)
    }
    // breakthrough trades and companies with no lab get nothing from a lab
    const ai = labGame(7, 'aiLab')
    patchLab(ai.b, (d) => {
      d.levels.cost = { v: 0.9, at: ai.g.year }
    })
    expect(opsEffectsOf(ai.b, ai.g.year)).toEqual({ cost: 0, capacity: 0, demand: 0 })
    expect(opsEffectsOf({ industry: 'restaurant' }, 2030)).toEqual({ cost: 0, capacity: 0, demand: 0 })
  })

  it('businessEffects is unchanged without a lab [RF1]', () => {
    const { g, b } = labGame(9, 'restaurant')
    expect(b.expansion).toBeUndefined()
    expect(businessEffects(g, b, 'us', g.year)).toEqual({ demand: 1, cost: 1, capacity: 1 })
    // a lab that holds no level changes nothing either
    patchLab(b, (d) => {
      d.programs.push(prog(g, 'ops.cost.1'))
    })
    expect(businessEffects(g, b, 'us', g.year)).toEqual({ demand: 1, cost: 1, capacity: 1 })
    // with strategies: the same company with the lab deleted gets the same answer
    saveExpansion(b, { strategies: ['efficiency', 'value'].map((id) => ({ id, country: 'us', started: g.year - 1, expires: g.year + 4 })), studies: [], lastYear: -1 })
    const plain = structuredClone(b)
    delete plain.lab
    expect(businessEffects(g, b, 'us', g.year)).toEqual(businessEffects(g, plain, 'us', g.year))
    // a level lowers the cost and lifts output and demand, with or without strategies
    patchLab(b, (d) => {
      for (const t of LAB_TRACKS) d.levels[t] = { v: 0.5, at: g.year }
    })
    const lifted = businessEffects(g, b, 'us', g.year)
    const base = businessEffects(g, plain, 'us', g.year)
    expect(lifted.cost).toBeLessThan(base.cost)
    expect(lifted.capacity).toBeGreaterThan(base.capacity)
    expect(lifted.demand).toBeGreaterThan(base.demand)
    delete b.expansion
    const bare = businessEffects(g, b, 'us', g.year)
    expect(bare.cost).toBeCloseTo(1 - OPS_TIER.low.cost * 0.5, 12)
    expect(bare.capacity).toBeCloseTo(1 + OPS_TIER.low.yield * 0.5, 12)
    expect(bare.demand).toBeCloseTo(1 + OPS_TIER.low.quality * 0.5, 12)
  })
})

describe('the year end', () => {
  it('advanceLab draws nothing without programs and steps once [RF1, RF2]', () => {
    const { g, b } = labGame(10, 'restaurant', { country: 'ca' })
    const f = g.year
    expect(noDraw(g, () => advanceLab(g, b, f))).toBe(true)
    expect('lab' in b).toBe(false)
    // a company that is no asset's details (an NPC), with a lab and without
    const npc = structuredClone(b)
    expect(noDraw(g, () => advanceLab(g, npc, f))).toBe(true)
    expect('lab' in npc).toBe(false)
    patchLab(npc, (d) => {
      d.levels.cost = { v: 0.2, at: f }
    })
    expect(noDraw(g, () => advanceLab(g, npc, f))).toBe(true)
    // a lab with no program
    patchLab(b, (d) => {
      d.levels.cost = { v: 0.2, at: f }
    })
    expect(noDraw(g, () => advanceLab(g, b, f))).toBe(true)
    expect(readLab(b).stepped).toBe(f)
    // one program of two years: a year of work at each year end, and it finishes once, however often a year is replayed
    patchLab(b, (d) => {
      d.programs.push(prog(g, 'ops.cost.1', { years: 2 }))
    })
    advanceLab(g, b, f + 1)
    expect(readLab(b).programs[0].progress).toBe(1)
    const json = JSON.stringify(b)
    const rng = g.rng
    advanceLab(g, b, f + 1)
    advanceLab(g, b, f)
    expect(JSON.stringify(b)).toBe(json)
    expect(g.rng).toBe(rng)
    advanceLab(g, b, f + 2)
    expect(readLab(b).programs).toHaveLength(0)
    expect(g.rng).not.toBe(rng)
    const after = JSON.stringify(b)
    const rng2 = g.rng
    advanceLab(g, b, f + 2)
    expect(JSON.stringify(b)).toBe(after)
    expect(g.rng).toBe(rng2)
  })

  it('is not run for a damaged lab on a trade with its own R&D', () => {
    const { g, b } = labGame(10, 'aiLab')
    patchLab(b, (d) => {
      d.programs.push(prog(g, 'ops.cost.1'))
    })
    expect(noDraw(g, () => advanceLab(g, b, g.year))).toBe(true)
    expect(readLab(b).programs).toHaveLength(1)
    expect(readLab(b).programs[0].progress).toBe(0)
  })

  it('rolls once per finished program in track order and moves the grant to due', () => {
    const { g, b } = labGame(11, 'brewery', { country: 'ca' })
    patchLab(b, (d) => {
      d.programs.push(prog(g, 'ops.quality.2', { odds: 0.5, grant: 700 }), prog(g, 'ops.cost.1', { odds: 0.6, grant: 3_000 }), prog(g, 'ops.yield.1', { odds: 0.4, grant: 2_000 }))
    })
    expect(readLab(b).programs.map((p) => p.id)).toEqual(['ops.cost.1', 'ops.yield.1', 'ops.quality.2'])
    const g2 = structuredClone(g)
    const wins = [chance(g2, 0.6), chance(g2, 0.4), chance(g2, 0.5)]
    advanceLab(g, b, g.year)
    expect(g.rng).toBe(g2.rng)
    const st = readLab(b)
    expect(st.programs).toHaveLength(0)
    expect(st.due.grant).toBe(5_700)
    expect([st.levels.cost.v > 0, st.levels.yield.v > 0, st.levels.quality.v > 0]).toEqual(wins)
    expect(st.stepped).toBe(g.year)
    // a win records the year of the win; a flop leaves no trace but the lost price
    expect(st.done['ops.cost.1'] === g.year).toBe(wins[0])
    expect('ops.yield.1' in st.done).toBe(wins[1])
  })

  it('a flop loses the price and leaves the program available; a win starts a 3-year cooldown', () => {
    const flop = labGame(12, 'restaurant', { country: 'ca' })
    const { g, a, b } = flop
    const price = opsPrice(b, 1)
    expect(startOps(g, a, b, 'ops.cost.1', true)).not.toBeNull()
    const fiscal = g.year
    g.year += 1
    const before = b.cash
    bookLabYear(g, a, b, fiscal)
    const credit = readLab(b).ledger[0].credit
    expect(credit).toBeGreaterThan(0)
    patchLab(b, (d) => {
      d.programs[0].odds = 0.02
    })
    rig(g, false)
    const cash = b.cash
    advanceLab(g, b, fiscal)
    expect(b.cash).toBe(cash)
    expect(b.cash).toBe(before + credit)
    expect(readLab(b).levels.cost.v).toBe(0)
    expect(readLab(b).programs).toHaveLength(0)
    expect(readLab(b).ledger[0].credit).toBe(credit)
    expect('ops.cost.1' in readLab(b).done).toBe(false)
    b.cash = Math.max(b.cash, price * 10)
    expect(opsBlock(g, b, 'ops.cost.1')).toBeNull()
    expect(g.log.at(-1)!.entries.at(-1)!.text).toBe(`${a.name}'s Time-and-Motion Study didn't work.`)

    const win = labGame(13, 'restaurant', { country: 'ca' })
    expect(startOps(win.g, win.a, win.b, 'ops.cost.1', true)).not.toBeNull()
    const f2 = win.g.year
    win.g.year += 1
    patchLab(win.b, (d) => {
      d.programs[0].odds = 0.98
    })
    rig(win.g, true)
    advanceLab(win.g, win.b, f2)
    const st = readLab(win.b)
    expect(st.levels.cost.v).toBeCloseTo(0.3, 10)
    expect(st.levels.cost.at).toBe(f2 + 1)
    expect(st.done['ops.cost.1']).toBe(f2)
    expect(st.runs.cost).toBe(1)
    expect(win.g.log.at(-1)!.entries.at(-1)!.text).toBe(`${win.a.name}'s Time-and-Motion Study worked.`)
    // the program waits three years from the fiscal year of the win
    for (let y = f2 + 1; y < f2 + OPS_COOLDOWN; y++) {
      win.g.year = y
      expect(opsBlock(win.g, win.b, 'ops.cost.1'), `year ${y}`).toMatch(new RegExp(String(f2 + OPS_COOLDOWN)))
    }
    win.g.year = f2 + OPS_COOLDOWN
    expect(opsBlock(win.g, win.b, 'ops.cost.1')).toBeNull()
  })
})

describe('starting a program', () => {
  it('grant rules', () => {
    const { g, a, b } = labGame(21, 'restaurant', { country: 'ca' })
    const first = startOps(g, a, b, 'ops.cost.1', true)!
    expect(first.grant).toBe(labGrantAmount('ca', 'low', first.price))
    expect(first.grant).toBeGreaterThan(0)
    expect(readLab(b).lastGrant).toBe(g.year)
    expect(readLab(b).due.grant).toBe(0)
    // none within three years of the last one (it is set at the start, so two starts cannot both claim)
    const second = startOps(g, a, b, 'ops.yield.1', true)!
    expect(second.grant).toBe(0)
    // paid into due only when the work is done, win or flop
    const fiscal = g.year
    patchLab(b, (d) => {
      for (const p of d.programs) p.odds = 0.02
    })
    rig(g, false)
    advanceLab(g, b, fiscal)
    expect(readLab(b).due.grant).toBe(first.grant)
    // three years on the gap is over
    g.year += LAB_GRANT_GAP - 1
    const early = startOps(g, a, b, 'ops.quality.1', true)!
    expect(early.grant).toBe(0)
    patchLab(b, (d) => {
      d.programs = []
    })
    g.year += 1
    const later = startOps(g, a, b, 'ops.quality.1', true)!
    expect(later.grant).toBe(labGrantAmount('ca', 'low', later.price))
    expect(readLab(b).lastGrant).toBe(g.year)

    // at most 25 sites
    const many = labGame(22, 'restaurant', { country: 'ca' })
    many.b.outlets[0].count = LAB_GRANT_SITES
    expect(startOps(many.g, many.a, many.b, 'ops.cost.1', true)!.grant).toBeGreaterThan(0)
    const big = labGame(22, 'restaurant', { country: 'ca' })
    big.b.outlets[0].count = LAB_GRANT_SITES + 1
    expect(startOps(big.g, big.a, big.b, 'ops.cost.1', true)!.grant).toBe(0)
    expect(readLab(big.b).lastGrant).toBe(0)
    // a country whose grant does not cover the tier pays nothing, and claims nothing
    const us = labGame(22, 'restaurant', { country: 'us' })
    expect(startOps(us.g, us.a, us.b, 'ops.cost.1', true)!.grant).toBe(0)
    expect(readLab(us.b).lastGrant).toBe(0)
  })

  it('startOps takes the price once and pay false takes nothing', () => {
    const { g, a, b } = labGame(23, 'restaurant', { country: 'ca' })
    const price = opsPrice(b, 1)
    const cash = b.cash
    const costs = b.yearCosts
    const income = b.yearIncome
    expect(noDraw(g, () => startOps(g, a, b, 'ops.cost.1', true))).toBe(true)
    expect(b.cash).toBe(cash - price)
    expect(b.yearCosts).toBe(costs + price)
    expect(b.yearIncome).toBe(income)
    const p = readLab(b).programs[0]
    expect(p).toMatchObject({ id: 'ops.cost.1', started: g.year, years: opsYears(b, 1), progress: 0, price })
    expect(p.odds).toBeCloseTo(opsOdds(g, b, 1), 2)
    expect(g.log.at(-1)!.entries.at(-1)!.text).toBe(`${a.name} started Time-and-Motion Study.`)
    // the owner's action tells the owner; the hired CEO's path does not
    const note = g.queue.find((m) => m.kind === 'notice' && m.title === 'Operations R&D')
    expect(note).toBeTruthy()
    g.queue = []
    const cash2 = b.cash
    b.cash = 0
    expect(startOps(g, a, b, 'ops.yield.1', false)).not.toBeNull()
    expect(b.cash).toBe(0)
    expect(b.yearCosts).toBe(costs + price)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Operations R&D')).toBe(false)
    // the price is not there: refused, nothing changes
    b.cash = cash2
    const before = snap(g, a)
    b.cash = 10
    expect(startOps(g, a, b, 'ops.quality.1', true)).toBeNull()
    expect(b.cash).toBe(10)
    b.cash = cash2
    expect(snap(g, a)).toBe(before)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'R&D')).toBe(true)
  })

  it('doOps without the right to is refused [RF3]', () => {
    const { g, a, b } = labGame(24, 'restaurant', { country: 'ca' })
    const id = 'ops.cost.1'
    const before = snap(g, a)
    const refused = (what: string) => {
      expect(doOps(g, a, id), what).toBe(false)
      expect(snap(g, a), what).toBe(before)
    }
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    refused('prison')
    g.character.prison = null
    g.character.age = 17
    refused('age 17')
    g.character.age = 31
    a.details.share = 0
    refused('no stake')
    delete a.details.share
    for (const bad of ['nope', '', '__proto__']) expect(doOps(g, a, bad), bad).toBe(false)
    expect(snap(g, a)).toBe(before)
    expect(doOps(g, { ...a, id: 'not-mine' }, id)).toBe(false)
    // a rung a low-tech trade does not have
    expect(doOps(g, a, 'ops.cost.3')).toBe(false)
    expect(snap(g, a)).toBe(before)
    // cash short by one dollar: nothing charged, nothing drawn
    const need = opsPrice(b, 1) + rdReserve(b)
    b.cash = need - 1
    const short = snap(g, a)
    expect(doOps(g, a, id)).toBe(false)
    expect(snap(g, a)).toBe(short)
    b.cash = need
    // a stale second call after the track is busy
    expect(doOps(g, a, id)).toBe(true)
    const started = snap(g, a)
    expect(doOps(g, a, id)).toBe(false)
    expect(doOps(g, a, 'ops.cost.2')).toBe(false)
    expect(snap(g, a)).toBe(started)
    expect(readLab(b).programs).toHaveLength(1)
    // a company the player no longer owns
    g.assets = g.assets.filter((x) => x !== a)
    expect(doOps(g, a, 'ops.yield.1')).toBe(false)
    expect(snap(g, a)).toBe(started)
  })

  it('doOps asks the board with the ordinary R&D gain', () => {
    const { g, a, b } = labGame(25, 'brewery', { country: 'ca' })
    const id = 'ops.cost.2'
    const price = opsPrice(b, 2)
    const spy = vi.spyOn(board, 'boardAllows').mockReturnValue(false)
    try {
      const before = snap(g, a)
      expect(doOps(g, a, id)).toBe(false)
      expect(snap(g, a)).toBe(before)
      expect(spy).toHaveBeenCalledTimes(1)
      const [, asked, askedBiz, proposal] = spy.mock.calls[0]
      expect(asked.id).toBe(a.id)
      expect(askedBiz).toBeTruthy()
      expect(proposal).toMatchObject({ kind: 'capex', by: 'owner', amount: price })
      expect(proposal.gain).toBeCloseTo(Math.max(0, (opsValue(g, b, id) + price) / 5), 6)
      expect(proposal.label).toBe(`Fund Lean Production System (${money(price)})`)
      spy.mockReturnValue(true)
      const cash = b.cash
      expect(doOps(g, a, id)).toBe(true)
      expect(readLab(b).programs.map((p) => p.id)).toEqual([id])
      expect(b.cash).toBe(cash - price)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('what a program is worth', () => {
  it('opsGain follows the learning curve and opsValue is the odds times the discounted years, less the price', () => {
    const { g, b } = labGame(26, 'brewery')
    const w = bizWorth(g, b)
    for (const id of ['ops.cost.2', 'ops.yield.2', 'ops.quality.2']) {
      const p = opsProgram(id)!
      const gain = opsGain(g, b, id)
      expect(gain.years).toBe(opsYears(b, p.rung))
      expect(gain.gain).toBeCloseTo(0.4, 10)
      expect(gain.effect).toBeCloseTo(OPS_TIER.mid[p.track === 'cost' ? 'cost' : p.track === 'yield' ? 'yield' : 'quality'] * 0.4, 10)
      let years = 0
      for (let t = 0; t < HORIZON; t++) {
        const lift = OPS_TIER.mid[p.track === 'cost' ? 'cost' : p.track === 'yield' ? 'yield' : 'quality'] * gain.gain * Math.pow(0.95, t)
        const yearly = p.track === 'cost' ? lift * w.cogs : p.track === 'yield' ? lift * w.contrib * clampN((w.util - 0.85) * 6, 0, 1) : lift * w.contrib
        years += Math.pow(DISCOUNT, gain.years - 1 + t) * yearly
      }
      const expected = opsOdds(g, b, p.rung) * years - opsPrice(b, p.rung)
      const got = opsValue(g, b, id, w)
      expect(Math.abs(got - expected), id).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(expected)))
      expect(opsValue(g, b, id)).toBeCloseTo(got, 6)
    }
    expect(noDraw(g, () => opsValue(g, b, 'ops.cost.1'))).toBe(true)
    // a level already at the ceiling gains nothing: the program only costs its price
    patchLab(b, (d) => {
      d.levels.cost = { v: 0.95, at: g.year + 10 }
    })
    expect(opsGain(g, b, 'ops.cost.1').gain).toBeCloseTo(0, 12)
    expect(opsValue(g, b, 'ops.cost.1', w)).toBeCloseTo(-opsPrice(b, 1), 6)
    // a program that is not one
    expect(opsGain(g, b, 'nope')).toEqual({ years: 0, gain: 0, effect: 0 })
    expect(opsValue(g, b, 'nope', w)).toBe(0)
  })
})

describe('the Research & Operations screen', () => {
  it('exists only for product companies', () => {
    for (const industry of ['aiLab', 'bank', 'gameStudio'] as const) {
      const { g, a } = labGame(30, industry)
      expect(labMenus(a, readBiz(g, a)), industry).toEqual([])
    }
    const { g, a, b } = labGame(30, 'restaurant', { country: 'ca' })
    const groups = labMenus(a, b)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ type: 'menu', id: `biz.lab.${a.id}`, label: 'Research & Operations', subtitle: 'Operations R&D and a research team' })
    // it sits right after Products on the company screen
    const ids = businessView(g, a).map((n) => n.id)
    const products = ids.indexOf(`biz.products.${a.id}`)
    expect(products).toBeGreaterThan(0)
    expect(ids[products + 1]).toBe(`biz.lab.${a.id}`)
    const deep = labGame(30, 'aiLab')
    expect(businessView(deep.g, deep.a).some((n) => n.id === `biz.lab.${deep.a.id}`)).toBe(false)
  })

  it('shows the real numbers on every row it offers', () => {
    const { g, a, b } = labGame(31, 'restaurant', { country: 'ca' })
    const group = labMenus(a, b)[0] as MenuGroup
    expect(group.disabledReason?.(g)).toBeNull()
    const children = group.children(g)
    const actions = children.filter((n): n is MenuAction => n.type === 'action')
    expect(actions.map((n) => n.id)).toEqual(opsOffers(g, b).map((p) => `biz.mkt.lab.ops.${p.id}.${a.id}`))
    expect(actions).toHaveLength(6)
    const effects = { cost: 'unit costs fall up to', yield: 'output rises up to', quality: 'demand rises up to' }
    for (const p of opsOffers(g, b)) {
      const row = actions.find((n) => n.id === `biz.mkt.lab.ops.${p.id}.${a.id}`)!
      expect(row.label).toBe(p.label)
      const gain = opsGain(g, b, p.id)
      const years = opsYears(b, p.rung)
      const sub = typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle
      expect(sub).toBe(`${money(opsPrice(b, p.rung))} · ${years === 1 ? '1 year' : `${years} years`} · ${Math.round(opsOdds(g, b, p.rung) * 100)}% odds · ${effects[p.track]} ${(gain.effect * 100).toFixed(1)}%`)
      const confirm = row.confirm?.(g) ?? ''
      expect(confirm).toContain(p.label)
      expect(confirm).toContain(money(opsPrice(b, p.rung)))
      expect(confirm).toContain(`${Math.round(opsOdds(g, b, p.rung) * 100)}%`)
      expect(row.disabledReason?.(g)).toBe(opsBlock(g, b, p.id))
    }
    expect(children.some((n) => n.type === 'heading' && n.label === 'Operations R&D')).toBe(true)
    const info = children.filter((n) => n.type === 'info').map((n) => textOf(g, n))
    expect(info.some((t) => t.includes('R&D credit: 35% of what R&D started this year cost.'))).toBe(true)
    expect(info.some((t) => t.includes('Low-tech'))).toBe(true)
    expect(info.some((t) => t.startsWith('Last year:'))).toBe(false)
  })

  it('shows a program that runs, a row that cannot run and last year', () => {
    const { g, a, b } = labGame(32, 'restaurant', { country: 'ng' })
    expect(readBiz(g, a).countryId).toBe('ng')
    expect(startOps(g, a, b, 'ops.cost.1', true)).not.toBeNull()
    patchLab(b, (d) => {
      d.ledger = [{ year: g.year - 1, credit: 12_000, grant: 3_000, royalty: 0, payroll: 0 }]
    })
    const children = (labMenus(a, readBiz(g, a))[0] as MenuGroup).children(g)
    const info = children.filter((n) => n.type === 'info').map((n) => textOf(g, n))
    expect(info.some((t) => t.includes('No R&D credit here.'))).toBe(true)
    const run = info.find((t) => t.startsWith('Time-and-Motion Study:'))
    expect(run).toBeTruthy()
    expect(run).toMatch(/1 year left/)
    expect(run).toContain(`${Math.round(readLab(b).programs[0].odds * 100)}% odds`)
    expect(info.find((t) => t.startsWith('Last year:'))).toContain(money(15_000))
    // the busy track greys out its other rung with the same reason opsBlock gives
    const rung2 = children.find((n): n is MenuAction => n.type === 'action' && n.id.includes('ops.cost.2'))!
    expect(rung2.disabledReason?.(g)).toBe(opsBlock(g, readBiz(g, a), 'ops.cost.2'))
    expect(rung2.disabledReason?.(g)).toBeTruthy()
    // running a row starts the program, through the same checks
    const row = children.find((n): n is MenuAction => n.type === 'action' && n.id.includes('ops.yield.1'))!
    expect(row.disabledReason?.(g)).toBeNull()
    row.run(g)
    expect(readLab(b).programs.map((p) => p.id)).toEqual(['ops.cost.1', 'ops.yield.1'])
    // the same row again does nothing: the track is busy
    const json = JSON.stringify(b)
    row.run(g)
    expect(JSON.stringify(b)).toBe(json)
  })

  it('is pure: rendering a deep-frozen state changes nothing and draws nothing', () => {
    const { g, a, b } = labGame(33, 'brewery', { country: 'gb' })
    startOps(g, a, b, 'ops.cost.1', true)
    patchLab(b, (d) => {
      d.ledger = [{ year: g.year - 1, credit: 100, grant: 0, royalty: 0, payroll: 0 }]
    })
    const rng = g.rng
    const json = JSON.stringify(g)
    const render = (state: GameState, asset: Asset) =>
      allNodes(state, labMenus(asset, readBiz(state, asset)))
        .map((n) => textOf(state, n))
        .join('\n')
    const text = render(g, a)
    expect(text).toContain('Lean Production System')
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
    const frozen = deepFreeze(structuredClone(g))
    const fa = frozen.assets.find((x) => x.id === a.id)!
    expect(render(frozen, fa)).toBe(text)
    expect(frozen.rng).toBe(rng)
    expect(JSON.stringify(frozen)).toBe(json)
  })

  it('plays through the real year end', () => {
    const { g, a, b } = labGame(34, 'restaurant', { country: 'ca' })
    expect(startOps(g, a, b, 'ops.cost.1', true)).not.toBeNull()
    const fiscal = g.year
    nextYear(g)
    const st = readLab(b)
    expect(st.booked).toBe(fiscal)
    expect(st.stepped).toBe(fiscal)
    expect(st.programs).toHaveLength(0)
    expect(st.ledger[0].year).toBe(fiscal)
    expect(st.ledger[0].credit).toBeGreaterThan(0)
    expect(st.ledger[0].grant).toBe(0)
    // the grant the program earned arrives with the next year's booking
    expect(st.due.grant).toBeGreaterThan(0)
    const due = st.due.grant
    nextYear(g)
    const next = readLab(b)
    expect(next.due.grant).toBe(0)
    expect(next.ledger.find((r) => r.year === fiscal + 1)?.grant).toBe(due)
    // the yearly hook run a second time for the same year (a reload, a replay) moves no money and steps nothing [RF2]
    const lab = JSON.stringify(b.lab)
    const cash = b.cash
    yearlyBusinessImpl(g)
    expect(JSON.stringify(b.lab)).toBe(lab)
    expect(b.cash).toBe(cash)
  })
})
