// The hedge fund return model: parity with the firm's formulas, bounds, determinism, the free-lunch
// check and the blocks. Nothing here moves money; every function under test is pure.
import { describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { ceoSkill, TALENT_SKILL } from '../src/game/business/economy'
import { alphaMean, capacityFactor, capacityOf, financingCost, fundSkill, hedgeBlock, hedgeGross, leaderSkill, marketMove, quantBlock } from '../src/game/business/fund-model'
import { marketDrift, outlookOf, strategyOutlook } from '../src/game/business/fund-outlook'
import { readFund } from '../src/game/business/fund-state'
import type { HedgeStrategy, MacroCall } from '../src/game/business/fund-state'
import { RUNNING_COST } from '../src/game/business/hedge-record'
import {
  autoTerms, hedgeRng, leadOf, macroBlock, marketBlock, personBlock, runnerSkill, seedMin, skillOf, strategyBlock, vehicleOutlook, vehicleYear, type YearIn,
} from '../src/game/business/hedge-model'
import { leadershipPower } from '../src/game/business/leadership'
import { investingBlocked } from '../src/game/history/markets'
import { exchangeInfo, exchangeName, exchangeStatus } from '../src/game/invest/engine'
import { typicalIncome } from '../src/game/events/wealth-core'
import { COUNTRIES, getCountry } from '../src/game/world'
import type { GameState } from '../src/game/types'
import { firm } from './fund-fixtures'
import { rich } from './hedge-kit'
import { newLeader } from './politics-kit'

const STRATEGIES: HedgeStrategy[] = ['longShort', 'macro', 'quant', 'event']

function yearIn(over: Partial<YearIn> = {}): YearIn {
  return { countryId: 'us', strategy: 'longShort', call: 'flat', lev: 1, nav: 5_000_000, skill: 40, year: 2027, ...over }
}

describe('the extractions', () => {
  it('capacityOf is capacityFactor', () => {
    const { b } = firm('hedge')
    for (const aum of [1e6, 1e9, 1e11]) expect(capacityFactor(aum, 60, b)).toBe(capacityOf(aum, 60, leadershipPower(b, 'quality')))
    expect(capacityOf(1e10, 60)).toBeLessThan(capacityOf(1e9, 60))
    for (const aum of [0, -5, Number.NaN]) {
      const c = capacityOf(aum, 60)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('outlookOf is strategyOutlook', () => {
    for (const aum of [0, 2_000_000, 5e10]) {
      const { g, b } = firm('hedge')
      const f = readFund(b)
      f.aum = aum; f.lev = 2.5; f.algoEdge = .03
      const skill = fundSkill(g, b)
      for (const s of STRATEGIES) {
        expect(strategyOutlook(g, b, f, s)).toEqual(outlookOf(s, { skill, cap: capacityFactor(f.aum, skill, b), drift: marketDrift(b.countryId), lev: f.lev, algoEdge: f.algoEdge }))
      }
    }
  })
})

describe('skill', () => {
  it('runnerSkill is the owner branch of ceoSkill', () => {
    for (const [smarts, discipline, years] of [[60, 50, 0], [20, 10, 3], [95, 90, 30], [5, 0, 0]] as const) {
      const { g, b } = firm('hedge')
      g.character.stats.smarts = smarts; g.character.hidden.discipline = discipline
      b.founded = g.year - years
      expect(runnerSkill(g, b.founded)).toBe(ceoSkill(g, b))
    }
  })

  it('counts an MBA, a business degree and an addiction as the firm does', () => {
    const { g, b } = firm('hedge')
    const base = runnerSkill(g, b.founded)
    g.character.education.degrees.push({ kind: 'mba', name: 'MBA', school: 'State', age: 28 })
    expect(runnerSkill(g, b.founded)).toBe(ceoSkill(g, b))
    expect(runnerSkill(g, b.founded)).toBeGreaterThan(base)
    g.character.education.degrees = [{ kind: 'bachelor', name: 'BA Economics', major: 'Economics', school: 'State', age: 22 }]
    expect(runnerSkill(g, b.founded)).toBe(ceoSkill(g, b))
    g.character.conditions.push({ id: 'a1', name: 'Alcohol Addiction', kind: 'addiction', severity: 50, yearsHad: 0, curable: true, diagnosed: true, age: 25 })
    expect(runnerSkill(g, b.founded)).toBe(ceoSkill(g, b))
  })

  it('leaves out the Business talent and the Business-run floor', () => {
    const { g, b } = firm('hedge', { talent: 'Business' })
    expect(ceoSkill(g, b) - runnerSkill(g, b.founded)).toBe(TALENT_SKILL)
  })

  it('grows with years since the start, to twelve, and stays inside 5 to 100', () => {
    const { g } = firm('hedge')
    const s0 = runnerSkill(g, g.year), s5 = runnerSkill(g, g.year - 5), s40 = runnerSkill(g, g.year - 40)
    expect(s5 - s0).toBe(5)
    expect(s40 - s0).toBe(12)
    expect(runnerSkill(g, g.year + 30)).toBe(s0)
    expect(runnerSkill(g, Number.NaN)).toBe(s0)
    g.character.stats.smarts = 0; g.character.hidden.discipline = 0
    expect(runnerSkill(g, g.year)).toBeGreaterThanOrEqual(5)
    g.character.stats.smarts = 1e9
    expect(runnerSkill(g, g.year)).toBe(100)
  })

  it('leadOf is leaderSkill for an owner, with the Investing talent', () => {
    const plain = firm('hedge')
    expect(leadOf(plain.g, plain.b.founded)).toBe(leaderSkill(plain.g, plain.b))
    const talented = firm('hedge', { talent: 'Investing' })
    expect(leadOf(talented.g, talented.b.founded)).toBe(leaderSkill(talented.g, talented.b))
    expect(leadOf(talented.g, talented.b.founded)).toBe(runnerSkill(talented.g, talented.b.founded) + 8)
    talented.g.character.alive = false
    expect(leadOf(talented.g, talented.b.founded)).toBe(runnerSkill(talented.g, talented.b.founded))
  })

  it('skillOf is the lead times .62 plus 6, from 5 to 100', () => {
    expect(skillOf(50)).toBeCloseTo(37, 12)
    expect(skillOf(100)).toBeCloseTo(68, 12)
    expect(skillOf(0)).toBe(6)
    expect(skillOf(-100)).toBe(5)
    expect(skillOf(1e6)).toBe(100)
    expect(skillOf(Number.NaN)).toBe(5)
  })
})

describe('the year', () => {
  it('vehicleYear is the firm formula', () => {
    const { g, b } = firm('hedge')
    const cases: Partial<YearIn>[] = [
      { strategy: 'longShort' }, { strategy: 'event' }, { strategy: 'quant', skill: 60 },
      { strategy: 'macro', call: 'bull', lev: 2 }, { strategy: 'macro', call: 'bear', lev: 3 }, { strategy: 'macro', call: 'flat', lev: 1 },
      { strategy: 'longShort', nav: 3e10, skill: 55 },
    ]
    for (const c of cases) {
      const x = yearIn(c)
      const market = marketMove(g, 'us', x.year)
      const cap = capacityFactor(x.nav, x.skill, b)
      const alpha = alphaMean(x.skill) * (x.strategy === 'macro' ? 1 : cap)
      const quantEdge = x.strategy === 'quant' ? (x.skill - 50) * .0003 * cap : 0
      const gross = hedgeGross(x.strategy, market, alpha, quantEdge, { call: x.call, lev: x.lev }, financingCost('us', x.year), seeded('k'))
      const y = vehicleYear(g, x, seeded('k'))
      expect(y.gross).toBe(gross)
      expect(y.market).toBe(market)
    }
  })

  it('net takes the running cost', () => {
    const { g } = firm('hedge')
    for (const strategy of STRATEGIES) {
      const y = vehicleYear(g, yearIn({ strategy, call: 'bull', lev: 2 }), seeded('n'))
      expect(Math.abs(y.net - ((1 + y.gross) * (1 - RUNNING_COST) - 1))).toBeLessThan(1e-12)
    }
  })

  it('is the same for the same inputs and differs by id and year', () => {
    const g = rich()
    const before = JSON.stringify(g), rng = g.rng
    const run = (id: string, year: number) => vehicleYear(g, yearIn({ year }), hedgeRng(g, id, year))
    expect(run('a1', 2027)).toEqual(run('a1', 2027))
    const seen = new Set<number>()
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) for (const year of [2027, 2028, 2029]) seen.add(run(id, year).gross)
    expect(seen.size).toBeGreaterThanOrEqual(3)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('draws from no shared stream: g.rng does not move in a quote, a year or an outlook', () => {
    const g = rich()
    const rng = g.rng
    vehicleOutlook('macro', { countryId: 'us', skill: 40, nav: 1e6, lev: 2 })
    autoTerms({ countryId: 'us', lead: 80, nav: 1e6, year: g.year })
    vehicleYear(g, yearIn(), hedgeRng(g, 'x', 2027))
    marketBlock(g, 'us'); strategyBlock(g, 'us', 'quant'); macroBlock(g); personBlock(g); seedMin(g)
    expect(g.rng).toBe(rng)
  })

  it('a Time Machine fork rerolls the year', () => {
    const g = rich()
    const unforked = vehicleYear(g, yearIn({ year: g.year + 1 }), hedgeRng(g, 'a1', g.year + 1))
    const rollBefore = hedgeRng(g, 'a1', g.year - 6).next()
    g.flags.timelineForks = [{ year: g.year - 2, salt: 'abc123' }]
    const forked = vehicleYear(g, yearIn({ year: g.year + 1 }), hedgeRng(g, 'a1', g.year + 1))
    expect(forked.gross).not.toBe(unforked.gross)
    expect(hedgeRng(g, 'a1', g.year + 1).next()).not.toBe(hedgeRng(rich(), 'a1', g.year + 1).next())
    // A year that ended before the jump keeps its roll.
    expect(hedgeRng(g, 'a1', g.year - 6).next()).toBe(rollBefore)
  })

  it('is bounded in every era', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = rich(seed)
      for (let year = 1950; year <= 2030; year++) {
        for (const strategy of STRATEGIES) for (const lev of [1, 3]) for (const call of ['bull', 'bear'] as MacroCall[]) {
          const y = vehicleYear(g, yearIn({ strategy, lev, call, year, skill: 40 + seed * 10, nav: 10 ** (5 + seed) }), hedgeRng(g, `s${seed}`, year))
          expect(Number.isFinite(y.net)).toBe(true)
          expect(y.net).toBeGreaterThanOrEqual(-0.9503)
          expect(y.net).toBeLessThanOrEqual(4)
        }
      }
    }
  })

  it('stays finite for hostile inputs', () => {
    const g = rich()
    for (const x of [
      yearIn({ nav: Number.NaN }), yearIn({ nav: -5 }), yearIn({ nav: 1e30 }), yearIn({ skill: Number.NaN }), yearIn({ skill: 1e9 }), yearIn({ skill: -1e9 }),
      yearIn({ strategy: 'macro', lev: Number.NaN }), yearIn({ strategy: 'macro', lev: 99 }), yearIn({ strategy: 'macro', lev: -4, call: 'bull' }),
      yearIn({ countryId: 'zz-nowhere' }), yearIn({ countryId: '' }), yearIn({ year: Number.NaN }), yearIn({ year: 1e9 }), yearIn({ year: -1e9 }),
    ]) {
      const y = vehicleYear(g, x, hedgeRng(g, 'h', 2027))
      expect(Number.isFinite(y.net) && Number.isFinite(y.gross) && Number.isFinite(y.market)).toBe(true)
      expect(y.net).toBeGreaterThanOrEqual(-0.9503)
      expect(y.net).toBeLessThanOrEqual(4)
    }
  })
})

describe('outlook', () => {
  it('no strategy out-earns the US index at any skill', () => {
    const drift = marketDrift('us')
    expect(drift).toBeCloseTo(0.08, 12)
    for (const skill of [5, 20, 41, 68]) for (const nav of [1e6, 1e9]) for (const strategy of STRATEGIES) {
      for (const lev of [1, 3]) expect(vehicleOutlook(strategy, { countryId: 'us', skill, nav, lev }).expected).toBeLessThan(drift)
    }
  })

  it('takes the running cost off the firm outlook', () => {
    const x = { countryId: 'us', skill: 40, nav: 1e6, lev: 2 }
    for (const s of STRATEGIES) {
      const cap = capacityOf(x.nav, x.skill)
      const base = outlookOf(s, { skill: x.skill, cap, drift: marketDrift('us'), lev: x.lev, algoEdge: 0 })
      const o = vehicleOutlook(s, x)
      expect(o.expected).toBeCloseTo(base.expected - RUNNING_COST, 12)
      expect(o.swing).toBe(base.swing)
    }
  })

  it('scales Macro swing with leverage, held to 1 to 3', () => {
    const at = (lev: number) => vehicleOutlook('macro', { countryId: 'us', skill: 40, nav: 1e6, lev }).swing
    expect(at(1)).toBeCloseTo(.18, 12)
    expect(at(3)).toBeCloseTo(.54, 12)
    expect(at(99)).toBeCloseTo(.54, 12)
    expect(at(Number.NaN)).toBeCloseTo(.18, 12)
    expect(at(-2)).toBeCloseTo(.18, 12)
  })

  it('shrinks the edge as the pool grows', () => {
    const at = (nav: number) => vehicleOutlook('longShort', { countryId: 'us', skill: 68, nav, lev: 1 }).expected
    expect(at(1e12)).toBeLessThan(at(1e6))
    expect(Number.isFinite(at(Number.NaN))).toBe(true)
  })
})

describe('autoTerms', () => {
  it('is Long/Short below 50 and never a leveraged call', () => {
    expect(autoTerms({ countryId: 'us', lead: 30, nav: 1e6, year: 2026 })).toEqual({ strategy: 'longShort', call: 'flat', lev: 1 })
    expect(autoTerms({ countryId: 'us', lead: 49, nav: 1e6, year: 2026 })).toEqual({ strategy: 'longShort', call: 'flat', lev: 1 })
  })

  it('picks the best of Long/Short, Event-driven and Quant at 50 or more, as the firm does', () => {
    for (const nav of [1e6, 1e9, 1e12]) for (const lead of [50, 80, 100]) {
      const t = autoTerms({ countryId: 'us', lead, nav, year: 2026 })
      expect(['longShort', 'event', 'quant']).toContain(t.strategy)
      expect(t.call).toBe('flat')
      expect(t.lev).toBe(1)
      const score = (s: HedgeStrategy) => { const o = vehicleOutlook(s, { countryId: 'us', skill: skillOf(lead), nav, lev: 1 }); return o.expected - o.swing * .2 }
      for (const s of ['longShort', 'event', 'quant'] as const) expect(score(t.strategy as HedgeStrategy)).toBeGreaterThanOrEqual(score(s) - 1e-12)
    }
  })

  it('never picks Quant where it is not yet possible', () => {
    const poor = COUNTRIES.find((c) => quantBlock(c.id, 1980))!
    expect(poor).toBeTruthy()
    for (const lead of [50, 80, 100]) for (const nav of [1e6, 1e12]) {
      expect(autoTerms({ countryId: poor.id, lead, nav, year: 1980 }).strategy).not.toBe('quant')
    }
  })
})

describe('blocks', () => {
  it('personBlock names the first thing in the way', () => {
    const g = rich()
    expect(personBlock(g)).toBeNull()
    g.character.age = 17
    expect(personBlock(g)).toBe('You must be 18 to start a fund.')
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(personBlock(g)).toBe("You can't run a fund from prison.")
    g.character.alive = false
    expect(personBlock(g)).toBe('You are no longer alive.')
    const adult = rich()
    adult.character.age = 18
    expect(personBlock(adult)).toBeNull()
  })

  it('marketBlock reads the year, then banned investing, then a closed or missing exchange', () => {
    expect(marketBlock(rich(61, 'us', 5e6, 2026), 'us')).toBeNull()
    expect(marketBlock(rich(61, 'us', 5e6, 1948), 'us')).toBe(hedgeBlock(1948))
    expect(hedgeBlock(1948)).toBeTruthy()

    let banned: [string, number] | null = null, closed: [string, number] | null = null, none: [string, number] | null = null
    for (const c of COUNTRIES) for (let y = 1949; y <= 2026; y++) {
      const st = exchangeStatus(exchangeInfo(c.id), y), ib = investingBlocked(c.id, y)
      if (ib && !banned) banned = [c.id, y]
      if (!ib && st === 'closed' && !closed) closed = [c.id, y]
      if (!ib && st === 'none' && !none) none = [c.id, y]
    }
    expect(banned && closed && none).toBeTruthy()
    const [bc, by] = banned!
    expect(marketBlock(rich(61, 'us', 5e6, by), bc)).toBe(investingBlocked(bc, by))
    const [cc, cy] = closed!
    expect(marketBlock(rich(61, 'us', 5e6, cy), cc)).toBe(`The ${exchangeName(exchangeInfo(cc), cy)} is closed this year.`)
    const [nc, ny] = none!
    expect(marketBlock(rich(61, 'us', 5e6, ny), nc)).toBe(`${getCountry(nc).name} has no stock market to follow.`)
  })

  it('marketBlock does not throw for an unknown country', () => {
    const g = rich()
    expect(() => marketBlock(g, 'zz-nowhere')).not.toThrow()
    expect(() => marketBlock(g, '')).not.toThrow()
  })

  it('strategyBlock refuses Quant where the firm does and Macro for an official', () => {
    const g = rich()
    for (const s of ['longShort', 'macro', 'quant', 'event'] as const) expect(strategyBlock(g, 'us', s)).toBeNull()
    const early = rich(61, 'us', 5e6, 1980)
    const poor = COUNTRIES.find((c) => quantBlock(c.id, 1980))!
    expect(strategyBlock(early, poor.id, 'quant')).toBe(quantBlock(poor.id, 1980))
    expect(strategyBlock(early, poor.id, 'longShort')).toBeNull()
    expect(strategyBlock(early, poor.id, 'event')).toBeNull()
    const official = newLeader(5)
    expect(strategyBlock(official, 'us', 'macro')).toBe("Officials can't make market calls.")
    expect(strategyBlock(official, 'us', 'longShort')).toBeNull()
  })

  it('macroBlock is null for a private citizen and set for an official', () => {
    expect(macroBlock(rich())).toBeNull()
    expect(macroBlock(newLeader(5))).toBe("Officials can't make market calls.")
  })

  it('seedMin is five years of a typical income', () => {
    const g = rich()
    expect(seedMin(g)).toBe(Math.round(5 * typicalIncome(g)))
    const poor = rich(61, 'aw', 5e6, 2026)
    expect(seedMin(poor)).toBe(Math.round(5 * typicalIncome(poor)))
    expect(seedMin(poor)).toBeLessThan(seedMin(g))
  })
})

describe('purity', () => {
  it('leaves a deep-frozen state alone', () => {
    const g: GameState = rich()
    const frozen = structuredClone(g)
    const deepFreeze = (o: unknown): void => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v) } }
    deepFreeze(frozen)
    expect(() => {
      personBlock(frozen); marketBlock(frozen, 'us'); strategyBlock(frozen, 'us', 'macro'); macroBlock(frozen); seedMin(frozen)
      vehicleYear(frozen, yearIn(), hedgeRng(frozen, 'f', 2027)); runnerSkill(frozen, 2000); leadOf(frozen, 2000)
    }).not.toThrow()
  })
})
