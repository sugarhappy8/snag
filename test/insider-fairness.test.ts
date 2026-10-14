// Insider cases must be fair (special/politics.ts, nation/govern.ts, nation/office.ts, investments.ts):
// only shares bought this year or last count as insider positions, one open policy case per security,
// the charge matches the law, a policy case on held shares is capped at severity 3, and the player is
// warned before a bill that would start a case.
import { describe, expect, it, vi } from 'vitest'
import { anchor, fam, moneyState } from '../src/game/computer/money-common'
import { listedTargets, placeBet, stockTargets, type BetTarget } from '../src/game/computer/money-stocks'
import { companyDef, exchangeInfo, exchangeYear } from '../src/game/invest/engine'
import { buySecurity, freshUnits, investmentHoldings, revalueHoldings, sellHolding, yearlyInvestments } from '../src/game/investments'
import { policyMoveOf, propose, resolveBill, type Measure } from '../src/game/nation/govern'
import { officeHooks } from '../src/game/nation/office'
import { runScript } from '../src/game/scripts'
import { specialJobNodes, yearlySpecial } from '../src/game/special'
import { ownerKey } from '../src/game/special/common'
import type { Asset, ChoiceModal, GameState, Json, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

/** A UK MP: a politician in the middle rung ('governor') with no regional head, so a legislator. */
function ukMp(seed = 1, money = 5_000_000_000): GameState {
  const g = makeTestGame(seed, { age: 55, countryId: 'gb', birthCountryId: 'gb', money })
  g.character.job = {
    defId: 'politician',
    title: 'Member of Parliament',
    company: 'Westminster',
    category: 'special',
    salary: 100_000,
    level: 2,
    performance: 60,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { office: 'governor', party: 'centrist', approval: 60, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 55, roleStartAge: 55 },
  }
  return g
}

/** Move the clock (age moves with it, so the character keeps the same birth year). */
function warp(g: GameState, year: number): void {
  g.character.age += year - g.year
  g.year = year
  g.yearActions = {}
}

const SECTORS: Record<string, string[]> = { industry: ['industrials', 'automakers'], ecommerce: ['ecommerce'], finance: ['banks', 'insurance'] }

/** A made-up (or, with `real`, a real) company in the sector a policy key moves, listed under the same id in every year. */
function holdable(g: GameState, key: string, years: number[], real = false, skip = 0): BetTarget {
  const inf = exchangeInfo(g.character.countryId)
  const hits = listedTargets(g).filter((t) => {
    const m = /s(\d+)g(\d+)$/.exec(t.secId)
    if (!m) return false
    const def = companyDef(inf, Number(m[1]), Number(m[2]))
    if (!!def.real !== real || !SECTORS[key].includes(def.sector)) return false
    return years.every((y) => exchangeYear(fam(g), anchor(g), inf, y).stocks[t.slot]?.id === t.secId)
  })
  const t = hits[skip]
  if (!t) throw new Error(`no ${real ? 'real' : 'made-up'} ${key} company listed in ${years.join(', ')}`)
  return t
}

function buy(g: GameState, secId: string, amount: number): Asset {
  expect(buySecurity(g, secId, amount)).toBe(true)
  return held(g, secId)!
}

function held(g: GameState, secId: string): Asset | undefined {
  return investmentHoldings(g).find((a) => a.details.secId === secId)
}

function unitsOf(a: Asset): number {
  return a.details.units as number
}

interface CaseRow { id: string; status: string; via: string; cause: string; stake: number; secId: string; bullish?: unknown; gain: number }
function abuse(g: GameState): { heat: number; moves: number; cases: CaseRow[] } {
  return (g.flags['special.politics'] as unknown as { abuse: ReturnType<typeof abuse> }).abuse
}
function cases(g: GameState): CaseRow[] {
  const p = g.flags['special.politics'] as unknown as { abuse?: ReturnType<typeof abuse> } | undefined
  return p?.abuse?.cases ?? []
}

const NO_MODAL = undefined as unknown as ModalItem
const move = (g: GameState, key: string, bullish: boolean) => officeHooks().policyMove(g, key, bullish, 'Test law')
const warning = (g: GameState, key: string, bullish: boolean) => officeHooks().policyWarning(g, key, bullish, 'Test law')

interface Arrest { crime: string; charges: string[]; severity: number }

/** Play seeds until the regulator opens the case and the MP is arrested; return the arrest's trial data. */
function arrestFor(build: (seed: number) => GameState): Arrest {
  for (let seed = 1; seed <= 80; seed++) {
    const g = build(seed)
    const cs = cases(g).at(-1)
    if (!cs) throw new Error('the setup did not start a case')
    g.queue = []
    runScript(g, 'special.pol.abuse.exposed', 'deny', { caseId: cs.id }, NO_MODAL)
    const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'crime.arrest')
    if (m) return m.data as unknown as Arrest
  }
  throw new Error('never arrested in 80 seeds')
}

/** A UK MP with `amount` of fresh shares in an industrial company and a case started by a bullish law. */
function mpWithShareCase(seed: number, amount: number): GameState {
  const g = ukMp(seed)
  buy(g, holdable(g, 'industry', [g.year]).secId, amount)
  move(g, 'industry', true)
  return g
}

// ---------------------------------------------------------------------------

describe('freshUnits: when the shares were bought', () => {
  it('counts what was bought this year or last year and nothing older', () => {
    for (const [back, fresh] of [[0, true], [1, true], [2, false], [10, false]] as const) {
      const g = ukMp(1)
      const t = holdable(g, 'industry', [2026 - back, 2026])
      warp(g, 2026 - back)
      const a = buy(g, t.secId, 1_000_000)
      warp(g, 2026)
      expect(freshUnits(a, 2026)).toBeCloseTo(fresh ? unitsOf(a) : 0, 9)
    }
  })

  it('sells the fresh units first and leaves the older ones alone', () => {
    const g = ukMp(2)
    const t = holdable(g, 'industry', [2024, 2026])
    warp(g, 2024)
    buy(g, t.secId, 20_000_000)
    warp(g, 2026)
    const a = buy(g, t.secId, 10_000_000)
    const u0 = unitsOf(a), f0 = freshUnits(a, 2026), old0 = u0 - f0
    expect(f0).toBeGreaterThan(0)
    expect(old0).toBeGreaterThan(0)
    // A small sale comes out of the fresh part.
    expect(sellHolding(g, a.id, Math.round(a.value * 0.1))).toBe(true)
    const u1 = unitsOf(a), f1 = freshUnits(a, 2026)
    expect(u1).toBeLessThan(u0)
    expect(f0 - f1).toBeCloseTo(u0 - u1, 6)
    expect(u1 - f1).toBeCloseTo(old0, 6)
    // A sale bigger than the fresh part uses it up, then takes the rest from the old units.
    expect(sellHolding(g, a.id, Math.round(a.value * 0.6))).toBe(true)
    expect(freshUnits(a, 2026)).toBe(0)
    expect(unitsOf(a)).toBeGreaterThan(0)
    expect(freshUnits(a, 2026)).toBeLessThanOrEqual(unitsOf(a))
  })

  it('a sale takes this year\'s units before last year\'s', () => {
    const g = ukMp(11)
    const t = holdable(g, 'industry', [2025, 2026, 2027])
    warp(g, 2025)
    const a = buy(g, t.secId, 10_000_000)
    const lastYear = unitsOf(a)
    warp(g, 2026)
    buy(g, t.secId, 10_000_000)
    const thisYear = unitsOf(a) - lastYear
    expect(freshUnits(a, 2026)).toBeCloseTo(lastYear + thisYear, 6)
    // Sell about this year's purchase: this year's units go, last year's stay.
    const worth = Math.round(unitsOf(a) * (a.details.price as number))
    expect(sellHolding(g, a.id, Math.round(worth * (thisYear / unitsOf(a))))).toBe(true)
    expect(unitsOf(a)).toBeCloseTo(lastYear, 0)
    expect(freshUnits(a, 2026)).toBeCloseTo(lastYear, 0)
    // Next year last year's units are the ones that have aged out of the window.
    warp(g, 2027)
    expect(freshUnits(a, 2027)).toBeLessThan(1)
  })

  it('buying more adds fresh units to an older holding, or tops up a recent one', () => {
    const g = ukMp(3)
    const t = holdable(g, 'industry', [2023, 2026])
    warp(g, 2023)
    const a = buy(g, t.secId, 10_000_000)
    warp(g, 2026)
    expect(freshUnits(a, 2026)).toBe(0)
    const before = unitsOf(a)
    buy(g, t.secId, 10_000_000)
    const added = unitsOf(a) - before
    expect(added).toBeGreaterThan(0)
    expect(freshUnits(a, 2026)).toBeCloseTo(added, 6)

    const h = ukMp(3)
    warp(h, 2025)
    const b = buy(h, t.secId, 10_000_000)
    warp(h, 2026)
    const first = unitsOf(b)
    buy(h, t.secId, 10_000_000)
    const second = unitsOf(b) - first
    expect(freshUnits(b, 2026)).toBeCloseTo(unitsOf(b), 9)
    // Next year the older buy has aged out and only the 2026 units are left.
    warp(h, 2027)
    expect(freshUnits(b, 2027)).toBeCloseTo(second, 6)
    expect(freshUnits(b, 2027)).toBeLessThan(unitsOf(b))
    warp(h, 2028)
    expect(freshUnits(b, 2028)).toBe(0)
  })

  it('falls back to boughtYear for a holding saved without tracking data', () => {
    const g = ukMp(4)
    const a = buy(g, holdable(g, 'industry', [2026]).secId, 5_000_000)
    expect(a.details.boughtYear).toBe(2026)
    for (const [boughtYear, fresh] of [[2026, true], [2025, true], [2024, false], [2000, false]] as const) {
      delete a.details.buys
      a.details.boughtYear = boughtYear
      expect(freshUnits(a, 2026)).toBe(fresh ? unitsOf(a) : 0)
    }
    delete a.details.buys
    delete a.details.boughtYear
    expect(freshUnits(a, 2026)).toBe(0)
  })

  it('an untracked old holding gets tracking on the next purchase, with only the new units fresh', () => {
    const g = ukMp(5)
    const t = holdable(g, 'industry', [2026])
    const a = buy(g, t.secId, 5_000_000)
    delete a.details.buys
    a.details.boughtYear = 2015
    const u0 = unitsOf(a)
    buy(g, t.secId, 5_000_000)
    expect(freshUnits(a, 2026)).toBeCloseTo(unitsOf(a) - u0, 6)
    // A recent untracked holding stays entirely fresh when more is added.
    const h = ukMp(5)
    const b = buy(h, t.secId, 5_000_000)
    delete b.details.buys
    b.details.boughtYear = 2025
    buy(h, t.secId, 5_000_000)
    expect(freshUnits(b, 2026)).toBeCloseTo(unitsOf(b), 9)
  })

  it('an untracked holding keeps its fallback through a partial sale', () => {
    const recent = ukMp(6)
    const a = buy(recent, holdable(recent, 'industry', [2026]).secId, 10_000_000)
    delete a.details.buys
    a.details.boughtYear = 2025
    expect(sellHolding(recent, a.id, Math.round(a.value * 0.4))).toBe(true)
    expect(freshUnits(a, 2026)).toBe(unitsOf(a))
    const old = ukMp(6)
    const b = buy(old, holdable(old, 'industry', [2026]).secId, 10_000_000)
    delete b.details.buys
    b.details.boughtYear = 2010
    expect(sellHolding(old, b.id, Math.round(b.value * 0.4))).toBe(true)
    expect(freshUnits(b, 2026)).toBe(0)
  })

  it('survives a JSON round trip and stays small however many years of buying', () => {
    const g = ukMp(7)
    const t = holdable(g, 'industry', [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
    let a: Asset | undefined
    for (let y = 2018; y <= 2026; y++) {
      warp(g, y)
      a = buy(g, t.secId, 2_000_000)
    }
    expect(Object.keys(a!.details.buys as object).length).toBeLessThanOrEqual(2)
    const clone = JSON.parse(JSON.stringify(a)) as Asset
    expect(freshUnits(clone, 2026)).toBe(freshUnits(a!, 2026))
    expect(freshUnits(a!, 2026)).toBeGreaterThan(0)
    expect(freshUnits(a!, 2026)).toBeLessThan(unitsOf(a!))
  })

  it('never exceeds the units held, whatever a damaged save says', () => {
    const g = ukMp(8)
    const a = buy(g, holdable(g, 'industry', [2026]).secId, 5_000_000)
    for (const bad of [{ 2026: 1e300 }, { 2026: -5, 2025: 'x' }, { 2026: 1e9, 2025: 1e9 }, [1, 2, 3], 'text', 7, true, {}] as Json[]) {
      a.details.buys = bad
      const f = freshUnits(a, 2026)
      expect(Number.isFinite(f)).toBe(true)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(unitsOf(a))
    }
    // And a later trade repairs it instead of copying it.
    a.details.buys = { 2026: 1e300, 2025: 1e300 }
    buy(g, a.details.secId as string, 1_000_000)
    expect(freshUnits(a, 2026)).toBeLessThanOrEqual(unitsOf(a))
    expect(sellHolding(g, a.id, Math.round(a.value * 0.2))).toBe(true)
    expect(freshUnits(a, 2026)).toBeLessThanOrEqual(unitsOf(a))
    expect(freshUnits(a, 2026)).toBeGreaterThanOrEqual(0)
  })

  it('follows a holding through the swap for its slot\'s company', () => {
    const g = ukMp(9)
    const t = holdable(g, 'industry', [2024, 2026])
    warp(g, 2024)
    buy(g, t.secId, 20_000_000)
    warp(g, 2026)
    const a = buy(g, t.secId, 10_000_000)
    const share0 = freshUnits(a, 2026) / unitsOf(a)
    expect(share0).toBeGreaterThan(0.1)
    expect(share0).toBeLessThan(0.9)
    // A holding from before the engine stamp, naming a company that left the slot.
    delete a.details.eng
    a.details.secId = 'gb#old-company'
    revalueHoldings(g)
    expect(a.details.secId).toBe(t.secId)
    expect(freshUnits(a, 2026)).toBeGreaterThan(0)
    expect(freshUnits(a, 2026)).toBeLessThanOrEqual(unitsOf(a))
    expect(freshUnits(a, 2026) / unitsOf(a)).toBeCloseTo(share0, 6)
  })

  it('a stock split scales the fresh units with the rest', () => {
    const g = ukMp(10)
    const t = holdable(g, 'industry', [2025, 2026])
    warp(g, 2025)
    buy(g, t.secId, 10_000_000)
    warp(g, 2026)
    const a = buy(g, t.secId, 10_000_000)
    const share0 = freshUnits(a, 2026) / unitsOf(a)
    // Re-anchor the unit price (what a split or a reorganisation does to the unit count).
    delete a.details.eng
    a.details.secId = 'gb#old-company'
    a.details.price = (a.details.price as number) * 3
    revalueHoldings(g)
    expect(freshUnits(a, 2026) / unitsOf(a)).toBeCloseTo(share0, 6)
    yearlyInvestments(g)
    expect(freshUnits(a, 2026)).toBeLessThanOrEqual(unitsOf(a) + 1e-9)
  })
})

// ---------------------------------------------------------------------------

describe('only fresh shares make an insider case', () => {
  it('shares bought this year, then a bullish law: one case, on the shares', () => {
    const g = ukMp(1)
    const t = holdable(g, 'industry', [2026])
    const a = buy(g, t.secId, 30_000_000)
    const text = move(g, 'industry', true)
    expect(cases(g)).toHaveLength(1)
    expect(cases(g)[0]).toMatchObject({ via: 'shares', cause: 'policy', secId: t.secId, status: 'open', bullish: true })
    expect(cases(g)[0].stake).toBeGreaterThan(0)
    expect(cases(g)[0].stake).toBeLessThanOrEqual(a.value)
    expect(text).toMatch(/moved with your own law/)
    expect(abuse(g).heat).toBeGreaterThanOrEqual(16)
  })

  it('end to end: a UK MP who passes a bill after buying shares gets one case', () => {
    let passed = 0
    for (let seed = 1; seed <= 40 && passed === 0; seed++) {
      const g = ukMp(seed)
      const t = holdable(g, 'industry', [2026])
      buy(g, t.secId, 20_000_000)
      g.queue = []
      const m: Measure = { k: 'tariff', input: 'industry', partner: 'cn', add: 10 }
      if (resolveBill(g, m, 'none')) {
        passed++
        expect(cases(g)).toHaveLength(1)
        expect(cases(g)[0]).toMatchObject({ via: 'shares', cause: 'policy', bullish: true })
      }
    }
    expect(passed).toBe(1)
  })

  it('the same shares bought 10 years ago, two years ago or last year', () => {
    const outcome = (back: number): number => {
      const g = ukMp(1)
      const t = holdable(g, 'industry', [2026 - back, 2026])
      warp(g, 2026 - back)
      buy(g, t.secId, 20_000_000)
      warp(g, 2026)
      const text = move(g, 'industry', true)
      if (cases(g).length === 0) expect(text).not.toMatch(/moved with your own law/)
      return cases(g).length
    }
    expect(outcome(10)).toBe(0)
    expect(outcome(2)).toBe(0)
    expect(outcome(1)).toBe(1)
    expect(outcome(0)).toBe(1)
  })

  it('old shares with a fresh top-up: the case counts only the fresh part', () => {
    const g = ukMp(2)
    const t = holdable(g, 'industry', [2016, 2026])
    warp(g, 2016)
    buy(g, t.secId, 40_000_000)
    warp(g, 2026)
    const a = buy(g, t.secId, 10_000_000)
    const expected = Math.round(a.value * freshUnits(a, 2026) / unitsOf(a))
    expect(expected).toBeLessThan(a.value * 0.5)
    move(g, 'industry', true)
    expect(cases(g)).toHaveLength(1)
    expect(cases(g)[0].stake).toBe(expected)
  })

  it('selling the fresh shares before the bill leaves nothing to count', () => {
    const g = ukMp(3)
    const t = holdable(g, 'industry', [2026])
    const a = buy(g, t.secId, 20_000_000)
    expect(sellHolding(g, a.id, 'all')).toBe(true)
    expect(move(g, 'industry', true)).not.toMatch(/moved with your own law/)
    expect(cases(g)).toHaveLength(0)
    // Selling part of a recent buy shrinks the stake.
    const h = ukMp(3)
    const b = buy(h, t.secId, 20_000_000)
    const value0 = b.value
    expect(sellHolding(h, b.id, Math.round(value0 * 0.5))).toBe(true)
    const left = b.value
    move(h, 'industry', true)
    expect(cases(h)).toHaveLength(1)
    expect(cases(h)[0].stake).toBeLessThanOrEqual(left)
  })

  it('a save from before the change: a recent holding counts, an old one does not', () => {
    const recent = ukMp(4)
    const a = buy(recent, holdable(recent, 'industry', [2026]).secId, 10_000_000)
    delete a.details.buys
    a.details.boughtYear = 2025
    move(recent, 'industry', true)
    expect(cases(recent)).toHaveLength(1)
    const old = ukMp(4)
    const b = buy(old, holdable(old, 'industry', [2026]).secId, 10_000_000)
    delete b.details.buys
    b.details.boughtYear = 2012
    move(old, 'industry', true)
    expect(cases(old)).toHaveLength(0)
    const unknown = ukMp(4)
    const c = buy(unknown, holdable(unknown, 'industry', [2026]).secId, 10_000_000)
    delete c.details.buys
    delete c.details.boughtYear
    move(unknown, 'industry', true)
    expect(cases(unknown)).toHaveLength(0)
  })

  it('open bets and index options still count whatever else is held', () => {
    const g = ukMp(5)
    const t = holdable(g, 'industry', [2026])
    moneyState(g).broker = 'Summit Securities'
    expect(placeBet(g, { via: 'own', secId: t.secId, kind: 'put', strike: 'atm', stake: 100_000 })).not.toBeNull()
    move(g, 'industry', false)
    expect(cases(g)).toHaveLength(1)
    expect(cases(g)[0]).toMatchObject({ via: 'own', cause: 'policy', bullish: false })
  })
})

// ---------------------------------------------------------------------------

describe('one open policy case per security', () => {
  it('a second bill in the same year does not add a second case, heat or karma', () => {
    const g = ukMp(1)
    const t = holdable(g, 'industry', [2026])
    buy(g, t.secId, 20_000_000)
    const text1 = move(g, 'industry', true)
    const heat1 = abuse(g).heat, karma1 = g.character.hidden.karma, trades1 = g.counters.insiderTrades
    expect(cases(g)).toHaveLength(1)
    const text2 = move(g, 'industry', true)
    expect(cases(g)).toHaveLength(1)
    expect(abuse(g).heat).toBe(heat1)
    expect(g.character.hidden.karma).toBe(karma1)
    expect(g.counters.insiderTrades).toBe(trades1)
    expect(text1).toMatch(/moved with your own law/)
    expect(text2).toMatch(/moved with your own law/)
  })

  it('a closed case does not block a new one, and another security is a separate case', () => {
    const g = ukMp(2)
    const a = holdable(g, 'industry', [2026])
    const b = holdable(g, 'ecommerce', [2026])
    buy(g, a.secId, 20_000_000)
    move(g, 'industry', true)
    expect(cases(g)).toHaveLength(1)
    buy(g, b.secId, 20_000_000)
    move(g, 'ecommerce', true)
    expect(cases(g)).toHaveLength(2)
    expect(new Set(cases(g).map((c) => c.secId)).size).toBe(2)
    cases(g)[0].status = 'closed'
    buy(g, a.secId, 5_000_000)
    move(g, 'industry', true)
    expect(cases(g)).toHaveLength(3)
  })

  it('new bets under a second bill ride on the case that is already open', () => {
    const g = ukMp(3)
    const t = holdable(g, 'industry', [2026])
    moneyState(g).broker = 'Summit Securities'
    placeBet(g, { via: 'own', secId: t.secId, kind: 'put', strike: 'atm', stake: 50_000 })
    move(g, 'industry', false)
    expect(cases(g)).toHaveLength(1)
    placeBet(g, { via: 'own', secId: t.secId, kind: 'put', strike: 'otm', stake: 50_000 })
    move(g, 'industry', false)
    expect(cases(g)).toHaveLength(1)
    const bets = moneyState(g).bets
    expect(bets).toHaveLength(2)
    expect(bets.every((b) => b.caseId === cases(g)[0].id)).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('the charge matches the law', () => {
  it('a bullish law is Abuse of Office, a bearish one Market Manipulation', () => {
    const bull = arrestFor((seed) => mpWithShareCase(seed, 20_000_000))
    expect(bull.charges).toContain('Abuse Of Office')
    expect(bull.charges).not.toContain('Market Manipulation')
    const bear = arrestFor((seed) => {
      const g = ukMp(seed)
      moneyState(g).broker = 'Summit Securities'
      placeBet(g, { via: 'own', secId: holdable(g, 'industry', [2026]).secId, kind: 'put', strike: 'atm', stake: 100_000 })
      move(g, 'industry', false)
      return g
    })
    expect(bear.charges).toContain('Market Manipulation')
    expect(bear.charges).not.toContain('Abuse Of Office')
  })

  it('a saved case without the field keeps today\'s label', () => {
    const arrest = arrestFor((seed) => {
      const g = mpWithShareCase(seed, 20_000_000)
      delete cases(g)[0].bullish
      return g
    })
    expect(arrest.charges).toContain('Market Manipulation')
  })

  it('a loaded case keeps a real boolean and drops anything else', () => {
    const g = ukMp(6)
    buy(g, holdable(g, 'industry', [2026]).secId, 10_000_000)
    move(g, 'industry', true)
    const first = cases(g)[0]
    const make = (id: string, bullish: unknown) => ({ ...first, id, bullish })
    abuse(g).cases = [first, make('a', false), make('b', 'yes'), make('c', 1), make('d', null), make('e', { x: 1 })] as CaseRow[]
    ;(g.flags['special.politics'] as unknown as { owner: string }).owner = ownerKey(g)
    yearlySpecial(g)
    const byId = Object.fromEntries(cases(g).map((c) => [c.id, c.bullish]))
    expect(byId[first.id]).toBe(true)
    expect(byId.a).toBe(false)
    for (const id of ['b', 'c', 'd', 'e']) expect(byId[id]).toBeUndefined()
    expect(JSON.stringify(g)).not.toContain('"bullish":"yes"')
  })
})

// ---------------------------------------------------------------------------

describe('severity of a case on held shares', () => {
  it('a policy case on shares is capped at 3, however big the stake', () => {
    const big = arrestFor((seed) => mpWithShareCase(seed, 60_000_000))
    expect(cases(mpWithShareCase(1, 60_000_000))[0].stake).toBeGreaterThan(9_000_000)
    expect(big.severity).toBe(3)
    const mid = arrestFor((seed) => mpWithShareCase(seed, 4_000_000))
    expect(mid.severity).toBeLessThanOrEqual(3)
  })

  it('a case on bets or index options keeps severity 5 at the same stake', () => {
    const arrest = arrestFor((seed) => {
      const g = ukMp(seed)
      const inf = exchangeInfo('gb')
      moneyState(g).positions.push({ id: 'opt1', mode: 'real', side: 'buy', dir: 'put', strike: 'otm', k: 0.05, units: 400_000_000, premium: 20_000_000, year: g.year, exKey: inf.key, index: inf.ex.index, countryId: 'gb', parentId: '', fx: 1 })
      move(g, 'industry', false)
      expect(cases(g)[0]).toMatchObject({ via: 'own', cause: 'policy' })
      return g
    })
    expect(arrest.severity).toBe(5)
  })

  it('an announcement case on shares is unchanged', () => {
    const arrest = arrestFor((seed) => {
      const g = ukMp(seed)
      const t = holdable(g, 'industry', [2026])
      buy(g, t.secId, 60_000_000)
      runScript(g, 'special.pol.abuse.announce', 'contract', { secId: t.secId }, NO_MODAL)
      expect(cases(g)[0]).toMatchObject({ via: 'shares', cause: 'contract' })
      expect(cases(g)[0].stake).toBeGreaterThan(9_000_000)
      return g
    })
    expect(arrest.severity).toBe(5)
  })
})

// ---------------------------------------------------------------------------

describe('policyWarning: said before the bill', () => {
  it('names the companies when a fresh position would count', () => {
    const g = ukMp(1)
    const t = holdable(g, 'industry', [2026])
    expect(warning(g, 'industry', true)).toBe('')
    buy(g, t.secId, 10_000_000)
    const text = warning(g, 'industry', true)
    expect(text).toContain(t.name)
    expect(text).toMatch(/insider trading/)
    expect(text).toMatch(/recently/)
    expect(text.length).toBeLessThan(200)
    expect(text).not.toMatch(/—/)
  })

  it('says nothing for old shares, other sectors, a bearish law, real companies or no shares', () => {
    const old = ukMp(2)
    const t = holdable(old, 'industry', [2016, 2026])
    warp(old, 2016)
    buy(old, t.secId, 10_000_000)
    warp(old, 2026)
    expect(warning(old, 'industry', true)).toBe('')

    const g = ukMp(2)
    buy(g, t.secId, 10_000_000)
    expect(warning(g, 'industry', false)).toBe('')
    expect(warning(g, 'ecommerce', true)).toBe('')
    expect(warning(g, 'nonsense', true)).toBe('')

    const real = ukMp(2)
    buy(real, holdable(real, 'finance', [2026], true).secId, 10_000_000)
    expect(warning(real, 'finance', true)).toBe('')
    expect(move(real, 'finance', true)).not.toMatch(/moved with your own law/)
    expect(cases(real)).toHaveLength(0)
  })

  it('counts bets, but not once a case is already open on that security', () => {
    const g = ukMp(3)
    const t = holdable(g, 'industry', [2026])
    moneyState(g).broker = 'Summit Securities'
    placeBet(g, { via: 'own', secId: t.secId, kind: 'put', strike: 'atm', stake: 50_000 })
    expect(warning(g, 'industry', false)).toContain(t.name)
    expect(warning(g, 'industry', true)).toBe('')
    move(g, 'industry', false)
    expect(warning(g, 'industry', false)).toBe('')
  })

  it('only reads: the game is the same afterwards, random numbers included', () => {
    const g = ukMp(4)
    buy(g, holdable(g, 'industry', [2026]).secId, 10_000_000)
    g.queue = []
    const before = JSON.stringify(g)
    const rng = g.rng
    expect(warning(g, 'industry', true)).not.toBe('')
    expect(warning(g, 'industry', false)).toBe('')
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
    // Not even a politics record is created for someone who never held a position.
    const plain = ukMp(4)
    const snapshot = JSON.stringify(plain)
    expect(warning(plain, 'industry', true)).toBe('')
    expect(JSON.stringify(plain)).toBe(snapshot)
  })

  it('shrugs off keys that are not sectors, including object property names', () => {
    const g = ukMp(5)
    buy(g, holdable(g, 'industry', [2026]).secId, 10_000_000)
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'INDUSTRY']) {
      expect(warning(g, key, true)).toBe('')
      expect(move(g, key, true)).toBe('')
    }
    expect(cases(g)).toHaveLength(0)
  })

  it('the default hook (no politics module) says nothing', async () => {
    // A fresh copy of the office module still has its default hooks: no career module registered.
    vi.resetModules()
    const fresh = await import('../src/game/nation/office')
    expect(fresh.officeHooks()).not.toBe(officeHooks())
    expect(fresh.officeHooks().policyWarning(ukMp(1), 'industry', true, 'Test law')).toBe('')
    expect(fresh.officeHooks().policyMove(ukMp(1), 'industry', true, 'Test law')).toBe('')
  })
})

describe('the propose popup carries the warning', () => {
  const tariff: Measure = { k: 'tariff', input: 'industry', partner: 'cn', add: 10 }
  const popup = (g: GameState, m: Measure): string => {
    g.queue = []
    propose(g, m)
    const modal = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'nation.bill')
    if (!modal) throw new Error(`no bill popup: ${JSON.stringify(g.queue.map((q) => q.kind === 'notice' ? q.text : q.kind))}`)
    return modal.text
  }

  it('shows it when the bill would start a case, and not otherwise', () => {
    const none = popup(ukMp(1), tariff)
    expect(none).not.toMatch(/insider trading/)

    const g = ukMp(1)
    buy(g, holdable(g, 'industry', [2026]).secId, 10_000_000)
    const warned = popup(g, tariff)
    expect(warned).toMatch(/insider trading/)
    // The existing lines come first and are untouched.
    expect(warned.startsWith(none)).toBe(true)
    // A bill that does not move that industry is not warned about.
    expect(popup(g, { k: 'tax', scope: 'national', id: 'income', value: 2 })).not.toMatch(/insider trading/)
  })

  it('stays quiet for shares bought long ago, and for a bearish bill on bought shares', () => {
    const g = ukMp(2)
    const t = holdable(g, 'industry', [2016, 2026])
    warp(g, 2016)
    buy(g, t.secId, 10_000_000)
    warp(g, 2026)
    expect(popup(g, tariff)).not.toMatch(/insider trading/)
    const h = ukMp(2)
    buy(h, t.secId, 10_000_000)
    expect(popup(h, { k: 'nationalize', sector: 'industry', on: true })).not.toMatch(/insider trading/)
  })

  it('seeing the popup draws no random numbers', () => {
    const g = ukMp(7)
    buy(g, holdable(g, 'industry', [2026]).secId, 10_000_000)
    const rng = g.rng
    popup(g, tariff)
    expect(g.rng).toBe(rng)
  })
})

describe('which measures move shares', () => {
  it('maps a measure to a sector and a direction, or to nothing', () => {
    expect(policyMoveOf({ k: 'tariff', input: 'energy', partner: 'cn', add: 10 })).toEqual({ sector: 'energy', bullish: true })
    expect(policyMoveOf({ k: 'tariff', input: 'all', partner: 'cn', add: 10 })).toBeNull()
    expect(policyMoveOf({ k: 'tariff', input: 'energy', partner: 'cn', add: 0 })).toBeNull()
    expect(policyMoveOf({ k: 'newTax', id: 'carbon', level: 1, industry: 'bank' })).toEqual({ sector: 'bank', bullish: false })
    expect(policyMoveOf({ k: 'newTax', id: 'carbon', level: 1, industry: '' })).toBeNull()
    expect(policyMoveOf({ k: 'newTax', id: 'carbon', level: 0, industry: 'bank' })).toBeNull()
    expect(policyMoveOf({ k: 'break', industry: 'solar', level: 1 })).toEqual({ sector: 'solar', bullish: true })
    expect(policyMoveOf({ k: 'break', industry: 'solar', level: 0 })).toBeNull()
    expect(policyMoveOf({ k: 'dereg', sector: 'energy', on: true })).toEqual({ sector: 'energy', bullish: true })
    expect(policyMoveOf({ k: 'dereg', sector: 'energy', on: false })).toBeNull()
    expect(policyMoveOf({ k: 'nationalize', sector: 'energy', on: true })).toEqual({ sector: 'energy', bullish: false })
    expect(policyMoveOf({ k: 'tax', scope: 'national', id: 'income', value: 2 })).toBeNull()
  })

  it('an executive order carries the warning too', () => {
    const g = makeTestGame(1, { age: 55, countryId: 'us', birthCountryId: 'us', money: 5_000_000_000 })
    g.character.job = {
      defId: 'politician', title: 'President', company: 'Somewhere', category: 'special', salary: 100_000, level: 3, performance: 60, yearsInRole: 0, yearsAtCompany: 0,
      data: { office: 'leader', party: 'centrist', approval: 60, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 55, roleStartAge: 55 },
    }
    buy(g, holdable(g, 'industry', [2026]).secId, 10_000_000)
    propose(g, { k: 'tariff', input: 'industry', partner: 'cn', add: 10 })
    const modal = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'nation.bill')!
    expect(modal.title).toBe('Executive Order')
    expect(modal.text).toMatch(/insider trading/)
  })
})

describe('the existing case rules still hold', () => {
  it('buying shares before awarding a contract is still insider trading', () => {
    const g = ukMp(1)
    const t = stockTargets(g).find((x) => !x.real)!
    buy(g, t.secId, 300_000)
    runScript(g, 'special.pol.abuse.announce', 'contract', { secId: t.secId }, NO_MODAL)
    expect(cases(g).map((c) => c.via)).toEqual(['shares'])
    expect(cases(g)[0].stake).toBeGreaterThan(0)
    expect(JSON.stringify(g)).not.toContain('NaN')
    void specialJobNodes
  })
})
