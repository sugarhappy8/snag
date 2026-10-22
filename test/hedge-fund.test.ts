// Personal and Family hedge funds: starting one, putting money in, taking it out and what that costs in
// tax, the relatives of a family fund, settling who holds what, and the rule that nothing is counted
// twice. Every test that moves money checks that no money was made or lost on the way.
import { describe, expect, it, vi } from 'vitest'
import { quantBlock } from '../src/game/business/fund-model'
import {
  candidates, closeFund, fundOf, fundsOf, INVITE_MAX, INVITE_SHARE, invite, LEAVE_BELOW, payOutHolder, putBlock, putIn, saveFund, setFundCall,
  setFundStrategy, settleHolders, startBlock, startFund, takeOut, takeQuote, type FundRow,
} from '../src/game/business/hedge-fund'
import { personBlock, seedMin } from '../src/game/business/hedge-model'
import { MAX_HOLDERS, RUNNING_COST, unitPrice, unitsValue, type HedgeFund } from '../src/game/business/hedge-record'
import { money as moneyText } from '../src/game/business/util'
import { fullName, netWorth, shortMoney } from '../src/game/core'
import { updateWl } from '../src/game/events/will-core'
import { typicalIncome } from '../src/game/events/wealth-core'
import { investingBlocked } from '../src/game/history/markets'
import { exchangeInfo, exchangeStatus } from '../src/game/invest/engine'
import {
  investmentAssetSubtitle, investmentAssetView, investmentHoldings, investmentListing, investmentsMenu, liquidatePortfolio, minTrade, registerHedgeFunds, sellHolding,
} from '../src/game/investments'
import { createPerson } from '../src/game/people'
import type { GameState, NoticeModal, Person } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { kin, rich } from './hedge-kit'
import { flowTotal } from './ledger-kit'
import { newLeader } from './politics-kit'

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

function open(g: GameState, owner: 'person' | 'family', seed = 1_000_000): FundRow {
  expect(startFund(g, owner, seed)).toBe(true)
  const row = fundOf(g, owner)
  if (!row) throw new Error('no fund after a start')
  return row
}

/** Mimics a booked year: the pool grows by `factor` and the asset follows. */
function year(g: GameState, owner: 'person' | 'family', factor: number): FundRow {
  const row = fundOf(g, owner)
  if (!row) throw new Error('no fund')
  row.f.nav *= factor
  saveFund(row.a, row.f)
  return fundOf(g, owner)!
}

function notices(g: GameState, title?: string): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && (title === undefined || m.title === title))
}

/** Every dollar in the world a fund can touch: your cash, your relatives' savings and every pool. */
function world(g: GameState): number {
  return g.character.money + g.people.reduce((s, p) => s + p.money, 0) + fundsOf(g).reduce((s, r) => s + r.f.nav, 0)
}

function holderOf(f: HedgeFund, p: Person) {
  return f.holders.find((h) => h.id === p.id)
}

function prison(): NonNullable<GameState['character']['prison']> {
  return { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
}

/** A family fund with two relatives in it. */
function crowd(seed = 61): { g: GameState; row: FundRow; sis: Person; bro: Person } {
  const g = rich(seed)
  const sis = kin(g, 'sibling', 2_000_000)
  const bro = kin(g, 'sibling', 3_000_000)
  open(g, 'family')
  expect(invite(g, fundOf(g, 'family')!.a.id, sis.id)).toBe(true)
  expect(invite(g, fundOf(g, 'family')!.a.id, bro.id)).toBe(true)
  return { g, row: fundOf(g, 'family')!, sis, bro }
}

describe('starting', () => {
  it('opens a personal fund from cash', () => {
    const g = rich()
    const cash = g.character.money
    const worth = netWorth(g)
    const rng = g.rng
    expect(startFund(g, 'person', 1_000_000)).toBe(true)
    expect(g.character.money).toBe(cash - 1_000_000)
    const funds = g.assets.filter((a) => a.kind === 'investment' && a.details.type === 'hedge')
    expect(funds).toHaveLength(1)
    const a = funds[0]
    expect(a.value).toBe(1_000_000)
    expect(a.purchasePrice).toBe(1_000_000)
    expect(a.name).toBe(`${g.character.lastName} Personal Fund`)
    expect(a.mortgage).toBeUndefined()
    expect(netWorth(g)).toBe(worth)
    expect(investmentHoldings(g)).toEqual([])
    expect(g.rng).toBe(rng)
    const f = fundOf(g, 'person')!.f
    expect(f).toMatchObject({ v: 1, owner: 'person', countryId: 'us', founded: 2026, strategy: 'longShort', call: 'flat', lev: 1, nav: 1_000_000, units: 1_000_000, mine: 1_000_000, cost: 1_000_000, holders: [], lastYear: -1, last: null, marks: [] })
    const n = notices(g, 'Fund Started')
    expect(n).toHaveLength(1)
    expect(n[0].text).toBe(`${a.name} opened with ${moneyText(1_000_000)}. You run it. It pays no fee, only 0.5% a year to run.`)
    expect(g.log.flatMap((y) => y.entries).some((e) => e.text === `I started the ${a.name}.` && e.tone === 'good')).toBe(true)
    // The record in the asset is plain JSON.
    expect(JSON.parse(JSON.stringify(a.details.hf))).toEqual(a.details.hf)
  })

  it('opens a family fund with its own name', () => {
    const g = rich()
    expect(startFund(g, 'family', 500_000)).toBe(true)
    const row = fundOf(g, 'family')!
    expect(row.a.name).toBe(`${g.character.lastName} Family Fund`)
    expect(row.f.owner).toBe('family')
    expect(fundOf(g, 'person')).toBeNull()
  })

  it('one fund of each kind', () => {
    const g = rich()
    open(g, 'person')
    const cash = g.character.money
    expect(startBlock(g, 'person')).toBe('You already have a personal fund.')
    expect(startFund(g, 'person', 500_000)).toBe(false)
    expect(g.character.money).toBe(cash)
    expect(fundsOf(g)).toHaveLength(1)
    expect(notices(g, 'Start a Fund').map((m) => m.text)).toEqual(['You already have a personal fund.'])
    expect(startFund(g, 'family', 500_000)).toBe(true)
    expect(fundsOf(g)).toHaveLength(2)
    expect(startBlock(g, 'family')).toBe('You already have a family fund.')
  })

  it('refuses what it should, moving no money and adding no asset', () => {
    const banned = firstWhere((c, y) => !!investingBlocked(c, y))
    const closed = firstWhere((c, y) => !investingBlocked(c, y) && exchangeStatus(exchangeInfo(c), y) === 'closed')
    expect(banned && closed).toBeTruthy()
    const cases: [string, GameState, number, string | RegExp][] = []
    const small = rich()
    cases.push(['below the minimum', small, seedMin(small) - 1, `A fund starts at ${moneyText(seedMin(small))}.`])
    const young = rich()
    young.character.age = 17
    cases.push(['17 years old', young, 1_000_000, 'You must be 18 to start a fund.'])
    const jailed = rich()
    jailed.character.prison = prison()
    cases.push(['in prison', jailed, 1_000_000, "You can't run a fund from prison."])
    cases.push(['in 1948', rich(61, 'us', 5_000_000, 1948), 1_000_000, /./])
    cases.push(['investing banned', rich(61, banned![0], 5_000_000, banned![1]), 1_000_000, investingBlocked(banned![0], banned![1])!])
    cases.push(['exchange shut', rich(61, closed![0], 5_000_000, closed![1]), 1_000_000, /is closed this year\.$/])
    cases.push(['more than cash', rich(), 5_000_001, "You can't cover that."])
    cases.push(['NaN', rich(), Number.NaN, /^A fund starts at /])
    cases.push(['Infinity', rich(), Number.POSITIVE_INFINITY, /^A fund starts at /])
    cases.push(['negative', rich(), -1_000_000, /^A fund starts at /])
    for (const [label, g, seed, reason] of cases) {
      const cash = g.character.money
      const people = JSON.stringify(g.people)
      expect(startFund(g, 'person', seed), label).toBe(false)
      expect(g.character.money, label).toBe(cash)
      expect(g.assets, label).toHaveLength(0)
      expect(JSON.stringify(g.people), label).toBe(people)
      const n = notices(g, 'Start a Fund')
      expect(n, label).toHaveLength(1)
      if (typeof reason === 'string') expect(n[0].text, label).toBe(reason)
      else expect(n[0].text, label).toMatch(reason)
    }
  })

  it('refuses an owner it does not know', () => {
    const g = rich()
    expect(startFund(g, 'company' as never, 1_000_000)).toBe(false)
    expect(g.character.money).toBe(5_000_000)
    expect(g.assets).toHaveLength(0)
  })

  it('rounds the seed and takes exactly the cash it names', () => {
    const g = rich()
    const cash = g.character.money
    expect(startFund(g, 'person', 1_000_000.4)).toBe(true)
    expect(g.character.money).toBe(cash - 1_000_000)
    expect(fundOf(g, 'person')!.f.nav).toBe(1_000_000)
  })
})

function firstWhere(test: (countryId: string, year: number) => boolean): [string, number] | null {
  for (const c of COUNTRIES) for (let y = 1949; y <= 2026; y++) if (test(c.id, y)) return [c.id, y]
  return null
}

describe('putting in and taking out', () => {
  it('put in buys units at the price', () => {
    const g = rich()
    const row = open(g, 'person')
    // A pool of 1.2M for 1M units: a unit costs 1.2.
    row.f.nav = 1_200_000
    saveFund(row.a, row.f)
    const before = fundOf(g, 'person')!
    const valueBefore = before.a.value
    const cash = g.character.money
    const d = 600_000
    expect(putIn(g, row.a.id, d)).toBe(true)
    const after = fundOf(g, 'person')!
    expect(after.f.mine - before.f.mine).toBeCloseTo(d / 1.2, 6)
    expect(after.f.units - before.f.units).toBeCloseTo(d / 1.2, 6)
    expect(after.f.nav - before.f.nav).toBe(d)
    expect(after.f.cost - before.f.cost).toBe(d)
    expect(cash - g.character.money).toBe(d)
    expect(Math.abs(after.a.value - valueBefore - d)).toBeLessThanOrEqual(1)
    expect(unitPrice(after.f)).toBeCloseTo(1.2, 9)
    expect(notices(g, 'Money In')[0].text).toMatch(/^You put \$600K into .+\. You own 100\.0%\.$/)
  })

  it('put in shows the share you own in a family fund', () => {
    const { g, row } = crowd()
    const f = fundOf(g, 'family')!.f
    const cash = g.character.money
    expect(putIn(g, row.a.id, 100_000)).toBe(true)
    const after = fundOf(g, 'family')!.f
    expect(cash - g.character.money).toBe(100_000)
    const share = after.mine / after.units
    expect(notices(g, 'Money In')[0].text).toContain(`You own ${(share * 100).toFixed(1)}%.`)
    expect(after.holders).toEqual(f.holders)
  })

  it('take out pays the share and taxes the gain', () => {
    const g = rich()
    open(g, 'person')
    const row = year(g, 'person', 1.2)
    expect(row.a.value).toBe(1_200_000)
    const q = takeQuote(g, row.f, 0.5)
    expect(q.closes).toBe(false)
    expect(q.gross).toBe(600_000)
    expect(q.basis).toBe(500_000)
    expect(q.gain).toBe(100_000)
    expect(q.tax).toBeGreaterThan(0)
    expect(q.relatives).toBe(0)
    const cash = g.character.money
    const income = (g.flags.taxableIncome as number | undefined) ?? 0
    const taxes = (g.flags.taxesPaid as number | undefined) ?? 0
    expect(takeOut(g, row.a.id, 0.5)).toBe(true)
    const after = fundOf(g, 'person')!
    expect(g.character.money - cash).toBeGreaterThanOrEqual(q.gross - q.tax - 1)
    expect(g.character.money - cash).toBeLessThanOrEqual(q.gross - q.tax + 1)
    // R2-L13 (F38): the gain pays the nation's capital gains rate at the take out, booked to the government as tax.capgains. It is
    // no longer income (taxableIncome) and it earns no credit against the income tax (taxesPaid).
    expect(((g.flags.taxableIncome as number) ?? 0) - income).toBe(0)
    expect(((g.flags.taxesPaid as number) ?? 0) - taxes).toBe(0)
    expect(flowTotal(g, 'tax.capgains', 'gov')).toBe(q.tax)
    expect(after.f.cost).toBeCloseTo(500_000, 0)
    expect(after.f.mine).toBeCloseTo(500_000, 0)
    expect(after.f.nav).toBeCloseTo(600_000, 0)
    expect(unitPrice(after.f)).toBeCloseTo(1.2, 9)
    expect(Math.abs(after.a.value - 600_000)).toBeLessThanOrEqual(1)
    expect(after.a.purchasePrice).toBe(Math.round(after.f.cost))
    const text = notices(g, 'Money Out')[0].text
    expect(text).toBe(`You took ${moneyText(600_000)} out of ${row.a.name}. Tax on the gain is about ${moneyText(q.tax)}.`)
  })

  it('take out charges no tax on a gain carried losses cover', () => {
    const g = rich()
    open(g, 'person')
    g.flags.investLossCarry = 1_000_000
    const row = year(g, 'person', 1.2)
    const q = takeQuote(g, row.f, 0.5)
    expect(q.tax).toBe(0)
    const cash = g.character.money
    expect(takeOut(g, row.a.id, 0.5)).toBe(true)
    expect(g.character.money - cash).toBe(q.gross)
    expect(g.flags.investLossCarry).toBe(900_000)
    expect(notices(g, 'Money Out')[0].text).toBe(`You took ${moneyText(600_000)} out of ${row.a.name}.`)
  })

  it('a loss adds to the carried loss', () => {
    const g = rich()
    open(g, 'person')
    const row = year(g, 'person', 0.8)
    const q = takeQuote(g, row.f, 0.5)
    expect(q.gain).toBe(-100_000)
    expect(q.tax).toBe(0)
    const carry = (g.flags.investLossCarry as number | undefined) ?? 0
    const cash = g.character.money
    expect(takeOut(g, row.a.id, 0.5)).toBe(true)
    expect(g.flags.investLossCarry).toBe(carry + 100_000)
    expect(g.character.money - cash).toBe(400_000)
  })

  it('the last of it closes the fund and pays relatives', () => {
    const { g, row, sis, bro } = crowd()
    const f = fundOf(g, 'family')!.f
    const sisValue = unitsValue(f, holderOf(f, sis)!.units)
    const broValue = unitsValue(f, holderOf(f, bro)!.units)
    const sisMoney = sis.money
    const broMoney = bro.money
    const total = world(g)
    const q = takeQuote(g, f, 1)
    expect(q.closes).toBe(true)
    expect(q.relatives).toBeCloseTo(sisValue + broValue, 4)
    const cash = g.character.money
    expect(takeOut(g, row.a.id, 1)).toBe(true)
    expect(g.assets.some((a) => a.id === row.a.id)).toBe(false)
    expect(fundsOf(g)).toEqual([])
    expect(sis.money - sisMoney).toBeCloseTo(sisValue, 4)
    expect(bro.money - broMoney).toBeCloseTo(broValue, 4)
    // Mine paid out through the broker; no tax on a flat fund.
    expect(g.character.money - cash).toBe(Math.round(unitsValue(f, f.mine)))
    // Money is conserved: everything the pool held now sits with someone.
    expect(Math.abs(world(g) - total)).toBeLessThanOrEqual(1)
    expect(notices(g, 'Fund Closed')[0].text).toBe(`${row.a.name} is closed. You got ${moneyText(Math.round(unitsValue(f, f.mine)))}. Relatives got ${moneyText(sisValue + broValue)}.`)
    expect(g.log.flatMap((y) => y.entries).some((e) => e.text === `I closed the ${row.a.name}.` && e.tone === 'neutral')).toBe(true)
  })

  it('closing a fund that names you as a holder pays you once, with no new tax', () => {
    const g = rich()
    const sis = kin(g, 'sibling', 2_000_000)
    const row = open(g, 'family')
    invite(g, row.a.id, sis.id)
    const f = fundOf(g, 'family')!.f
    // An old record where the player's own id sits in the holder list.
    f.holders.push({ id: g.character.id, units: 250_000 })
    f.units += 250_000
    f.nav += 250_000
    saveFund(row.a, f)
    const total = world(g)
    const cash = g.character.money
    const income = (g.flags.taxableIncome as number | undefined) ?? 0
    expect(closeFund(g, row.a.id)).toBe(true)
    expect(g.character.money - cash).toBe(1_250_000)
    expect(((g.flags.taxableIncome as number | undefined) ?? 0) - income).toBe(0)
    expect(sis.money).toBe(1_600_000 + 400_000)
    expect(g.assets).toHaveLength(0)
    expect(world(g)).toBe(total)
  })

  it('a holder entry that is you counts as your units in a quote and a take out', () => {
    const g = rich()
    const sis = kin(g, 'sibling', 2_000_000)
    const row = open(g, 'family')
    invite(g, row.a.id, sis.id)
    const f = fundOf(g, 'family')!.f
    f.holders.push({ id: g.character.id, units: 250_000 })
    f.units += 250_000
    f.nav += 250_000
    saveFund(row.a, f)
    const raw = fundOf(g, 'family')!.f
    const q = takeQuote(g, raw, 1)
    expect(q.gross).toBe(1_250_000)
    expect(q.basis).toBe(1_250_000)
    expect(q.relatives).toBeCloseTo(400_000, 4)
    expect(takeOut(g, row.a.id, 0.5)).toBe(true)
    const after = fundOf(g, 'family')!.f
    expect(after.holders.map((h) => h.id)).toEqual([sis.id])
    expect(after.mine).toBeCloseTo(625_000, 4)
    expect(after.cost).toBeCloseTo(625_000, 4)
    expect(unitPrice(after)).toBeCloseTo(1, 9)
  })

  it('a take out that would pay nothing is refused, and one that pays leaves the books whole', () => {
    const g = rich()
    const row = open(g, 'person')
    // A fund worth $150: just above the smallest trade of $100.
    Object.assign(row.f, { nav: 150, units: 150, mine: 150, cost: 150 })
    saveFund(row.a, row.f)
    expect(fundOf(g, 'person')!.a.value).toBe(150)
    const before = JSON.stringify(fundOf(g, 'person')!.f)
    const cash = g.character.money
    expect(takeOut(g, row.a.id, 0.0001)).toBe(false)
    expect(g.character.money).toBe(cash)
    expect(JSON.stringify(fundOf(g, 'person')!.f)).toBe(before)
    const total = world(g)
    expect(takeOut(g, row.a.id, 0.3333)).toBe(true)
    expect(g.character.money - cash).toBe(50)
    expect(world(g)).toBe(total)
  })

  it('a take out that leaves less than the smallest trade closes the fund', () => {
    const g = rich()
    const row = open(g, 'person', seedMin(rich()))
    const left = Math.floor(minTrade(g) / 2)
    const fraction = 1 - left / row.a.value
    const q = takeQuote(g, row.f, fraction)
    expect(q.closes).toBe(true)
    expect(q.gross).toBe(row.a.value)
    expect(takeOut(g, row.a.id, fraction)).toBe(true)
    expect(fundsOf(g)).toEqual([])
  })

  it('refuses bad orders and moves nothing', () => {
    const g = rich()
    const row = open(g, 'person')
    const before = JSON.stringify(g)
    for (const d of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 4_000_001, minTrade(g) - 1]) {
      expect(putIn(g, row.a.id, d), `put in ${d}`).toBe(false)
    }
    for (const f of [0, -5, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(takeOut(g, row.a.id, f), `take out ${f}`).toBe(false)
    }
    expect(putIn(g, 'nope', 1000)).toBe(false)
    expect(takeOut(g, 'nope', 0.5)).toBe(false)
    expect(closeFund(g, 'nope')).toBe(false)
    expect(g.character.money).toBe(4_000_000)
    expect(fundOf(g, 'person')!.f).toEqual(row.f)
    // Only notices and their ids changed.
    const after = JSON.parse(JSON.stringify(g)) as GameState
    after.queue = []
    after.nextId = JSON.parse(before).nextId
    const was = JSON.parse(before) as GameState
    was.queue = []
    expect(after).toEqual(was)
    expect(notices(g).length).toBeGreaterThan(0)
  })

  it('refuses when you can not run a fund or the market is shut', () => {
    const g = rich()
    const row = open(g, 'person')
    g.character.prison = prison()
    expect(putBlock(g, row.f)).toBe(personBlock(g))
    expect(putIn(g, row.a.id, 10_000)).toBe(false)
    expect(takeOut(g, row.a.id, 0.5)).toBe(false)
    expect(closeFund(g, row.a.id)).toBe(false)
    expect(fundOf(g, 'person')!.a.value).toBe(1_000_000)
    g.character.prison = null
    g.year = 1948
    expect(putBlock(g, row.f)).toMatch(/./)
    expect(putIn(g, row.a.id, 10_000)).toBe(false)
    g.year = 2026
    expect(putBlock(g, row.f)).toBeNull()
  })

  it('takeQuote is pure and clamps the fraction', () => {
    const g = rich()
    open(g, 'person')
    const row = year(g, 'person', 1.2)
    const before = JSON.stringify(g)
    const rng = g.rng
    deepFreeze(g)
    const none = takeQuote(g, row.f, -1)
    expect(none).toMatchObject({ gross: 0, basis: 0, gain: 0, tax: 0, closes: false, relatives: 0 })
    expect(takeQuote(g, row.f, Number.NaN)).toEqual(none)
    expect(takeQuote(g, row.f, 7)).toEqual(takeQuote(g, row.f, 1))
    expect(takeQuote(g, row.f, 1).closes).toBe(true)
    expect(takeQuote(g, row.f, 0.9995).closes).toBe(true)
    expect(takeQuote(g, row.f, 0.5).closes).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })
})

describe('strategy', () => {
  it('quant is refused where the firm refuses it', () => {
    const where = firstWhere((c, y) => y >= 1980 && !!quantBlock(c, y))
    expect(where).toBeTruthy()
    const g = rich()
    const row = open(g, 'person')
    row.f.countryId = where![0]
    saveFund(row.a, row.f)
    g.year = where![1]
    expect(setFundStrategy(g, row.a.id, 'quant')).toBe(false)
    expect(fundOf(g, 'person')!.f.strategy).toBe('longShort')
    expect(notices(g).some((m) => m.text === quantBlock(where![0], where![1]))).toBe(true)
    g.year = 2026
    row.f.countryId = 'us'
    saveFund(row.a, row.f)
    expect(setFundStrategy(g, row.a.id, 'quant')).toBe(true)
    expect(fundOf(g, 'person')!.f.strategy).toBe('quant')
  })

  it('an official cannot call the market', () => {
    const g = newLeader(5)
    g.year = 2026
    g.character.money = 5_000_000
    g.character.age = 45
    open(g, 'family')
    const row = fundOf(g, 'family')!
    expect(setFundStrategy(g, row.a.id, 'macro')).toBe(false)
    expect(setFundCall(g, row.a.id, 'bull', 2)).toBe(false)
    const f = fundOf(g, 'family')!.f
    expect(f).toMatchObject({ strategy: 'longShort', call: 'flat', lev: 1 })
    expect(notices(g).map((m) => m.text)).toContain("Officials can't make market calls.")
    // Other strategies are fine.
    expect(setFundStrategy(g, row.a.id, 'event')).toBe(true)
  })

  it('setFundCall sets Macro with leverage in halves', () => {
    const g = rich()
    const row = open(g, 'person')
    expect(setFundCall(g, row.a.id, 'bull', 2.3)).toBe(true)
    expect(fundOf(g, 'person')!.f).toMatchObject({ strategy: 'macro', call: 'bull', lev: 2.5 })
    expect(setFundCall(g, row.a.id, 'bear')).toBe(true)
    expect(fundOf(g, 'person')!.f).toMatchObject({ strategy: 'macro', call: 'bear', lev: 2.5 })
    expect(setFundCall(g, row.a.id, 'bull', 9)).toBe(true)
    expect(fundOf(g, 'person')!.f.lev).toBe(3)
    expect(setFundCall(g, row.a.id, 'bull', -4)).toBe(true)
    expect(fundOf(g, 'person')!.f.lev).toBe(1)
    expect(setFundCall(g, row.a.id, 'bull', Number.NaN)).toBe(true)
    expect(fundOf(g, 'person')!.f.lev).toBe(1)
    expect(setFundCall(g, row.a.id, 'moon' as never, 2)).toBe(false)
    expect(setFundCall(g, 'nope', 'bull', 2)).toBe(false)
  })

  it('a non-macro strategy resets the call', () => {
    const g = rich()
    const row = open(g, 'person')
    setFundCall(g, row.a.id, 'bull', 3)
    expect(setFundStrategy(g, row.a.id, 'macro')).toBe(true)
    expect(fundOf(g, 'person')!.f).toMatchObject({ strategy: 'macro', call: 'bull', lev: 3 })
    expect(setFundStrategy(g, row.a.id, 'event')).toBe(true)
    expect(fundOf(g, 'person')!.f).toMatchObject({ strategy: 'event', call: 'flat', lev: 1 })
    expect(setFundStrategy(g, row.a.id, 'moon' as never)).toBe(false)
    expect(setFundStrategy(g, 'nope', 'event')).toBe(false)
  })
})

describe('family', () => {
  it('lists adult relatives with a will role, closest first, at most eight', () => {
    const g = rich()
    open(g, 'family')
    const f = fundOf(g, 'family')!.f
    const ok = kin(g, 'sibling', 2_000_000, { relationship: 80 })
    kin(g, 'friend', 2_000_000)
    kin(g, 'bestFriend', 2_000_000)
    kin(g, 'exSpouse', 2_000_000)
    const young = kin(g, 'sibling', 2_000_000, { age: 17 })
    const disowned = kin(g, 'sibling', 2_000_000)
    disowned.data.disowned = true
    const estranged = kin(g, 'sibling', 2_000_000)
    updateWl(g, estranged, (w) => void (w.estr = true))
    const cold = kin(g, 'sibling', 2_000_000, { relationship: 39 })
    const poor = kin(g, 'child', 5 * typicalIncome(g) - 1, { age: 30 })
    const list = candidates(g, f)
    const byId = new Map(list.map((c) => [c.person.id, c]))
    expect(list).toHaveLength(6)
    expect(byId.get(ok.id)).toMatchObject({ why: null, amount: Math.floor(INVITE_SHARE * 2_000_000) })
    expect(byId.get(young.id)!.why).toBe('Too young.')
    expect(byId.get(disowned.id)!.why).toBe('You disowned them.')
    expect(byId.get(estranged.id)!.why).toBe('Not on speaking terms.')
    expect(byId.get(cold.id)!.why).toBe("They don't trust you with money yet.")
    expect(byId.get(poor.id)!.why).toBe("They don't have the savings.")
    // Closest first, then by name.
    const rel = list.map((c) => c.person.relationship)
    expect(rel).toEqual([...rel].sort((x, y) => y - x))
    expect(list[0].person.id).toBe(ok.id)

    const crowded = rich()
    open(crowded, 'family')
    for (let i = 0; i < 12; i++) kin(crowded, 'sibling', 2_000_000, { relationship: 60 + i })
    const eight = candidates(crowded, fundOf(crowded, 'family')!.f)
    expect(eight).toHaveLength(INVITE_MAX)
    expect(eight.map((c) => c.person.relationship)).toEqual([71, 70, 69, 68, 67, 66, 65, 64])
  })

  it('a person fund takes no relatives', () => {
    const g = rich()
    const sis = kin(g, 'sibling')
    const row = open(g, 'person')
    expect(candidates(g, row.f).every((c) => c.why === 'The fund is full.')).toBe(true)
    const before = JSON.stringify(row.f)
    expect(invite(g, row.a.id, sis.id)).toBe(false)
    expect(JSON.stringify(fundOf(g, 'person')!.f)).toBe(before)
    expect(sis.money).toBe(2_000_000)
  })

  it('an invite moves their money into units and creates nothing', () => {
    const g = rich()
    const sis = kin(g, 'sibling', 2_000_000)
    const rich1 = kin(g, 'sibling', 50_000_000)
    const row = open(g, 'family')
    const worth = netWorth(g)
    const total = world(g)
    const rng = g.rng
    expect(invite(g, row.a.id, sis.id)).toBe(true)
    let f = fundOf(g, 'family')!.f
    expect(sis.money).toBe(1_600_000)
    expect(f.nav).toBe(1_400_000)
    expect(holderOf(f, sis)!.units).toBeCloseTo(400_000, 6)
    expect(unitsValue(f, holderOf(f, sis)!.units)).toBeCloseTo(400_000, 4)
    expect(f.mine).toBe(1_000_000)
    expect(netWorth(g)).toBe(worth)
    expect(world(g)).toBe(total)
    expect(g.rng).toBe(rng)
    expect(notices(g, 'Relative Joined')[0].text).toBe(`${sis.firstName} put ${moneyText(400_000)} into ${row.a.name}.`)
    // The share is capped at what your own units are worth.
    expect(invite(g, row.a.id, rich1.id)).toBe(true)
    f = fundOf(g, 'family')!.f
    expect(rich1.money).toBe(50_000_000 - 1_000_000)
    expect(unitsValue(f, holderOf(f, rich1)!.units)).toBeCloseTo(1_000_000, 4)
    expect(netWorth(g)).toBe(worth)
    expect(world(g)).toBe(total)
    // A holder is not offered again.
    expect(candidates(g, f).some((c) => c.person.id === sis.id)).toBe(false)
    expect(invite(g, row.a.id, sis.id)).toBe(false)
  })

  it('refuses an invite the candidate list refuses', () => {
    const g = rich()
    const young = kin(g, 'sibling', 2_000_000, { age: 17 })
    const friend = kin(g, 'friend', 2_000_000)
    const row = open(g, 'family')
    const before = JSON.stringify(fundOf(g, 'family')!.f)
    expect(invite(g, row.a.id, young.id)).toBe(false)
    expect(invite(g, row.a.id, friend.id)).toBe(false)
    expect(invite(g, row.a.id, 'nobody')).toBe(false)
    expect(invite(g, 'nope', young.id)).toBe(false)
    expect(JSON.stringify(fundOf(g, 'family')!.f)).toBe(before)
    expect(young.money).toBe(2_000_000)
    g.character.prison = prison()
    const ok = kin(g, 'sibling', 2_000_000)
    expect(invite(g, row.a.id, ok.id)).toBe(false)
    expect(ok.money).toBe(2_000_000)
  })

  it('pay out returns the value, shrinks the pool and leaves the price', () => {
    const { g, row, sis } = crowd()
    year(g, 'family', 1.5)
    const f = fundOf(g, 'family')!.f
    const price = unitPrice(f)
    const value = unitsValue(f, holderOf(f, sis)!.units)
    const money = sis.money
    const total = world(g)
    expect(payOutHolder(g, row.a.id, sis.id)).toBe(true)
    const after = fundOf(g, 'family')!.f
    expect(sis.money - money).toBeCloseTo(value, 4)
    expect(holderOf(after, sis)).toBeUndefined()
    expect(after.nav).toBeCloseTo(f.nav - value, 4)
    expect(after.units).toBeCloseTo(f.units - 400_000, 4)
    expect(unitPrice(after)).toBeCloseTo(price, 9)
    expect(Math.abs(world(g) - total)).toBeLessThanOrEqual(1e-6)
    expect(notices(g, 'Paid Out')[0].text).toBe(`${sis.firstName} took ${moneyText(value)} out of ${row.a.name}.`)
    expect(payOutHolder(g, row.a.id, sis.id)).toBe(false)
    expect(payOutHolder(g, row.a.id, 'nobody')).toBe(false)
  })

  it('is full at eight', () => {
    const g = rich(61, 'us', 50_000_000)
    const row = open(g, 'family', 20_000_000)
    const sibs: Person[] = []
    for (let i = 0; i < 9; i++) sibs.push(kin(g, 'sibling', 2_000_000, { relationship: 90 - i }))
    for (let i = 0; i < 8; i++) expect(invite(g, row.a.id, sibs[i].id), `invite ${i}`).toBe(true)
    const f = fundOf(g, 'family')!.f
    expect(f.holders).toHaveLength(8)
    const last = candidates(g, f).find((c) => c.person.id === sibs[8].id)!
    expect(last.why).toBe('The fund is full.')
    expect(invite(g, row.a.id, sibs[8].id)).toBe(false)
    expect(sibs[8].money).toBe(2_000_000)
    expect(fundOf(g, 'family')!.f.holders).toHaveLength(8)
  })

  it('stays a pure read from a frozen state', () => {
    const { g, row } = crowd()
    kin(g, 'sibling')
    deepFreeze(g)
    const list = candidates(g, row.f)
    expect(list.length).toBeGreaterThan(0)
    expect(startBlock(g, 'family')).toBe('You already have a family fund.')
    expect(putBlock(g, row.f)).toBeNull()
    expect(() => takeQuote(g, row.f, 0.5)).not.toThrow()
  })
})

describe('settling', () => {
  it('a late spouse holder passes to you: units join yours and cost steps up', () => {
    const g = rich()
    const spouse = kin(g, 'spouse', 2_000_000)
    const row = open(g, 'family')
    invite(g, row.a.id, spouse.id)
    year(g, 'family', 1.25)
    const f = fundOf(g, 'family')!.f
    const price = unitPrice(f)
    const h = holderOf(f, spouse)!
    const value = unitsValue(f, h.units)
    spouse.alive = false
    const lines = settleHolders(g, f, row.a.name)
    expect(f.holders).toEqual([])
    expect(f.mine).toBeCloseTo(1_000_000 + h.units, 6)
    expect(f.cost).toBeCloseTo(1_000_000 + value, 4)
    expect(unitPrice(f)).toBeCloseTo(price, 9)
    expect(lines).toEqual([`${fullName(spouse)}'s part of the ${row.a.name} went to me.`])
  })

  it('a late holder passes to modelled heirs who become holders', () => {
    const g = rich()
    const a = kin(g, 'sibling', 2_000_000)
    const b = kin(g, 'sibling', 2_000_000)
    const row = open(g, 'family')
    invite(g, row.a.id, a.id)
    invite(g, row.a.id, b.id)
    const f = fundOf(g, 'family')!.f
    const ha = holderOf(f, a)!.units
    const hb = holderOf(f, b)!.units
    const mine = f.mine
    const price = unitPrice(f)
    const nav = f.nav
    a.alive = false
    const lines = settleHolders(g, f, row.a.name)
    // The heirs of a sibling with no parent: you and the other sibling, half each.
    expect(holderOf(f, a)).toBeUndefined()
    expect(holderOf(f, b)!.units).toBeCloseTo(hb + ha / 2, 6)
    expect(f.mine).toBeCloseTo(mine + ha / 2, 6)
    expect(f.cost).toBeCloseTo(1_000_000 + unitsValue(f, ha / 2), 4)
    expect(f.nav).toBe(nav)
    expect(unitPrice(f)).toBeCloseTo(price, 9)
    expect(lines).toEqual([`${fullName(a)}'s part of the ${row.a.name} went to ${b.firstName} and me.`])
  })

  it('a late sibling with no modelled heirs leaves with their value', () => {
    const g = rich()
    const a = kin(g, 'sibling', 2_000_000)
    const b = kin(g, 'sibling', 2_000_000)
    const row = open(g, 'family')
    invite(g, row.a.id, a.id)
    invite(g, row.a.id, b.id)
    const f = fundOf(g, 'family')!.f
    const price = unitPrice(f)
    const ha = holderOf(f, a)!
    const value = unitsValue(f, ha.units)
    const nav = f.nav
    const units = f.units
    a.alive = false
    a.data.married = true
    const lines = settleHolders(g, f, row.a.name)
    expect(holderOf(f, a)).toBeUndefined()
    expect(f.nav).toBeCloseTo(nav - value, 4)
    expect(f.units).toBeCloseTo(units - ha.units, 6)
    expect(unitPrice(f)).toBeCloseTo(price, 9)
    expect(lines).toEqual([`${fullName(a)}'s part of the ${row.a.name} left the family.`])
  })

  it('a cooled holder is paid out', () => {
    const { g, row, sis, bro } = crowd()
    const f = fundOf(g, 'family')!.f
    const value = unitsValue(f, holderOf(f, sis)!.units)
    const money = sis.money
    sis.relationship = LEAVE_BELOW - 1
    const lines = settleHolders(g, f, row.a.name)
    expect(holderOf(f, sis)).toBeUndefined()
    expect(holderOf(f, bro)).toBeDefined()
    expect(sis.money - money).toBeCloseTo(value, 4)
    expect(lines).toEqual([`${sis.firstName} took their money out of the ${row.a.name}.`])
    // At the line they stay.
    bro.relationship = LEAVE_BELOW
    expect(settleHolders(g, f, row.a.name)).toEqual([])
  })

  it('a disowned or estranged holder is paid out', () => {
    const { g, row, sis, bro } = crowd()
    const f = fundOf(g, 'family')!.f
    sis.data.disowned = true
    updateWl(g, bro, (w) => void (w.estr = true))
    const sisMoney = sis.money
    const broMoney = bro.money
    const lines = settleHolders(g, f, row.a.name)
    expect(f.holders).toEqual([])
    expect(sis.money).toBeGreaterThan(sisMoney)
    expect(bro.money).toBeGreaterThan(broMoney)
    expect(lines).toHaveLength(2)
  })

  it('a missing contact leaves with their value', () => {
    const { g, row, sis } = crowd()
    const f = fundOf(g, 'family')!.f
    const price = unitPrice(f)
    const h = holderOf(f, sis)!
    const value = unitsValue(f, h.units)
    const nav = f.nav
    g.people = g.people.filter((p) => p.id !== sis.id)
    const lines = settleHolders(g, f, row.a.name)
    expect(holderOf(f, sis)).toBeUndefined()
    expect(f.nav).toBeCloseTo(nav - value, 4)
    expect(unitPrice(f)).toBeCloseTo(price, 9)
    expect(lines).toEqual([])
  })

  it('the heir who is the character merges into mine', () => {
    const g = rich()
    const row = open(g, 'family')
    const f = fundOf(g, 'family')!.f
    // An old holder record that names the player (a fund kept by an heir who was a relative).
    f.holders.push({ id: g.character.id, units: 250_000 })
    f.units += 250_000
    f.nav += 250_000
    const price = unitPrice(f)
    const lines = settleHolders(g, f, row.a.name)
    expect(f.holders).toEqual([])
    expect(f.mine).toBe(1_250_000)
    expect(f.cost).toBeCloseTo(1_250_000, 4)
    expect(unitPrice(f)).toBeCloseTo(price, 9)
    expect(lines).toEqual([])
  })

  it('an heir above the holder limit is paid in cash', () => {
    const g = rich()
    const a = kin(g, 'sibling', 2_000_000)
    const b = kin(g, 'sibling', 2_000_000)
    const c = kin(g, 'sibling', 2_000_000)
    const row = open(g, 'family')
    const f = fundOf(g, 'family')!.f
    f.holders = [{ id: a.id, units: 150_000 }]
    f.units += 150_000
    f.nav += 150_000
    for (let i = 0; i < 23; i++) {
      const filler = kin(g, 'friend', 0)
      f.holders.push({ id: filler.id, units: 1_000 })
      f.units += 1_000
      f.nav += 1_000
    }
    expect(f.holders).toHaveLength(MAX_HOLDERS)
    a.alive = false
    const price = unitPrice(f)
    const total = f.nav + b.money + c.money + g.character.money
    const lines = settleHolders(g, f, row.a.name)
    // Three heirs share it: you, then one takes the slot the late holder left, the last is paid in cash.
    expect(f.holders).toHaveLength(MAX_HOLDERS)
    expect(holderOf(f, b)!.units).toBeCloseTo(50_000, 6)
    expect(holderOf(f, c)).toBeUndefined()
    expect(c.money - 2_000_000).toBeCloseTo(50_000, 4)
    expect(f.mine).toBeCloseTo(1_050_000, 4)
    expect(unitPrice(f)).toBeCloseTo(price, 9)
    expect(f.nav + b.money + c.money + g.character.money).toBeCloseTo(total, 4)
    expect(lines).toHaveLength(1)
  })

  it('settling never changes the unit price and creates no money', () => {
    const g = rich()
    const sibs = [kin(g, 'sibling'), kin(g, 'sibling'), kin(g, 'sibling'), kin(g, 'sibling'), kin(g, 'sibling')]
    const spouse = kin(g, 'spouse')
    const row = open(g, 'family', 2_000_000)
    for (const p of [...sibs, spouse]) expect(invite(g, row.a.id, p.id)).toBe(true)
    year(g, 'family', 0.7)
    const f = fundOf(g, 'family')!.f
    const price = unitPrice(f)
    g.people = g.people.filter((p) => p.id !== sibs[4].id)
    const total = world(g)
    // The only money that leaves the world: a late holder with no modelled heirs, and a vanished contact.
    const leaves = unitsValue(f, holderOf(f, sibs[3])!.units) + unitsValue(f, holderOf(f, sibs[4])!.units)
    sibs[0].alive = false
    sibs[1].relationship = 5
    sibs[2].data.disowned = true
    sibs[3].alive = false
    sibs[3].data.married = true
    spouse.alive = false
    const lines = settleHolders(g, f, row.a.name)
    expect(lines.length).toBeGreaterThanOrEqual(4)
    expect(unitPrice(f)).toBeCloseTo(price, 9)
    saveFund(row.a, f)
    expect(world(g)).toBeCloseTo(total - leaves, 3)
    expect(f.units).toBeGreaterThanOrEqual(f.mine + f.holders.reduce((s, h) => s + h.units, 0) - 1e-6)
    // Every holder left is a living contact who still passes the rules.
    for (const h of f.holders) expect(g.people.find((p) => p.id === h.id)?.alive).toBe(true)
  })

  it('a personal fund has nothing to settle', () => {
    const g = rich()
    const row = open(g, 'person')
    const before = JSON.stringify(row.f)
    expect(settleHolders(g, row.f, row.a.name)).toEqual([])
    expect(JSON.stringify(row.f)).toBe(before)
  })
})

describe('double counting', () => {
  it('net worth counts your units once', () => {
    const g = rich()
    const worth = netWorth(g)
    const sis = kin(g, 'sibling')
    open(g, 'family')
    expect(netWorth(g)).toBe(worth)
    const row = fundOf(g, 'family')!
    expect(invite(g, row.a.id, sis.id)).toBe(true)
    expect(netWorth(g)).toBe(worth)
    expect(putIn(g, row.a.id, 500_000)).toBe(true)
    expect(Math.abs(netWorth(g) - worth)).toBeLessThanOrEqual(1)
    expect(fundOf(g, 'family')!.a.value).toBeCloseTo(1_500_000, -1)
    // The asset is your units only, not the pool.
    expect(fundOf(g, 'family')!.f.nav).toBeGreaterThan(fundOf(g, 'family')!.a.value)
  })

  it('Sell Everything ignores the fund', () => {
    const g = rich()
    const row = open(g, 'person')
    const cash = g.character.money
    liquidatePortfolio(g)
    expect(g.assets).toContain(row.a)
    expect(g.character.money).toBe(cash)
    expect(fundOf(g, 'person')!.a.value).toBe(1_000_000)
    // The single-holding sell path leaves it alone as well.
    expect(sellHolding(g, row.a.id, 'all')).toBe(false)
    expect(sellHolding(g, row.a.id, 500_000)).toBe(false)
    expect(g.assets).toContain(row.a)
    expect(g.character.money).toBe(cash)
    expect(fundOf(g, 'person')!.f.mine).toBe(1_000_000)
  })

  it('the fund is not a security', () => {
    const g = rich()
    const row = open(g, 'person')
    expect(investmentListing(g).some((q) => q.name === row.a.name || q.secId === row.a.id)).toBe(false)
    expect(investmentHoldings(g)).toEqual([])
  })

  it('a damaged record is not a fund, but its value stays in net worth', () => {
    const g = rich()
    const worth = netWorth(g)
    const row = open(g, 'person')
    row.a.details.hf = 'junk'
    expect(fundsOf(g)).toEqual([])
    expect(fundOf(g, 'person')).toBeNull()
    expect(netWorth(g)).toBe(worth)
    expect(investmentHoldings(g)).toEqual([])
    expect(putIn(g, row.a.id, 1000)).toBe(false)
    expect(takeOut(g, row.a.id, 0.5)).toBe(false)
  })

  it('saveFund writes the asset from the record', () => {
    const g = rich()
    const row = open(g, 'person')
    row.f.nav = 3_000_000.7
    row.f.units = 1_000_000
    row.f.mine = 400_000
    row.f.cost = 123_456.4
    saveFund(row.a, row.f)
    expect(row.a.value).toBe(Math.round(400_000 * 3.0000007))
    expect(row.a.purchasePrice).toBe(123_456)
    expect(row.a.details.type).toBe('hedge')
    expect(row.a.details.hf).toEqual(JSON.parse(JSON.stringify(row.a.details.hf)))
    expect(row.a.details.hf).not.toBe(row.f)
    row.f.nav = 5e17
    row.f.mine = row.f.units
    saveFund(row.a, row.f)
    expect(row.a.value).toBeLessThanOrEqual(1e15)
  })
})

describe('the Investments hooks', () => {
  it('are optional: with none registered the fund still has a screen and a subtitle', async () => {
    vi.resetModules()
    const fresh = await import('../src/game/investments')
    const core = await import('../src/game/core')
    const g = rich()
    const row = open(g, 'person')
    const nodes = fresh.investmentAssetView(g, row.a)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ type: 'info', text: "This fund isn't available right now." })
    expect(fresh.investmentAssetSubtitle(g, row.a)).toBe(core.shortMoney(row.a.value))
    expect(fresh.investmentsMenu.children(g).some((n) => n.id.includes('hedge'))).toBe(false)
  })

  it('a hook that throws falls back, and one that answers is used', () => {
    const g = rich()
    const row = open(g, 'person')
    const boom = (): never => { throw new Error('x') }
    registerHedgeFunds({ row: boom, view: boom, subtitle: boom })
    expect(investmentAssetView(g, row.a)).toEqual([expect.objectContaining({ type: 'info', text: "This fund isn't available right now." })])
    expect(investmentAssetSubtitle(g, row.a)).toBe(shortMoney(row.a.value))
    expect(() => investmentsMenu.children(g)).not.toThrow()
    registerHedgeFunds({
      row: () => ({ type: 'menu', id: 'hedge-test-row', label: 'Hedge Funds', emoji: '🦈', children: () => [] }),
      view: (_g, a) => [{ type: 'info', id: `hedge-view-${a.id}`, text: 'a fund' }],
      subtitle: () => 'a fund subtitle',
    })
    expect(investmentAssetView(g, row.a)).toEqual([{ type: 'info', id: `hedge-view-${row.a.id}`, text: 'a fund' }])
    expect(investmentAssetSubtitle(g, row.a)).toBe('a fund subtitle')
    const ids = investmentsMenu.children(g).map((n) => n.id)
    expect(ids).toContain('hedge-test-row')
    expect(ids.indexOf('hedge-test-row')).toBeGreaterThan(ids.indexOf('inv-crypto'))
    // Other investments never reach the hooks.
    registerHedgeFunds({ row: () => null, view: boom, subtitle: boom })
    expect(investmentsMenu.children(g).map((n) => n.id)).not.toContain('hedge-test-row')
    const plain = { ...row.a, details: { type: 'savings' } }
    expect(() => investmentAssetSubtitle(g, plain)).not.toThrow()
  })
})

describe('no randomness', () => {
  it('actions never touch g.rng, and a run is the same every time', () => {
    const run = (): GameState => {
      const g = rich()
      const sis = kin(g, 'sibling')
      const rng = g.rng
      open(g, 'family')
      const id = fundOf(g, 'family')!.a.id
      invite(g, id, sis.id)
      putIn(g, id, 100_000)
      setFundCall(g, id, 'bull', 2)
      setFundStrategy(g, id, 'event')
      year(g, 'family', 1.1)
      takeOut(g, id, 0.4)
      payOutHolder(g, id, sis.id)
      takeOut(g, id, 1)
      expect(g.rng).toBe(rng)
      return g
    }
    const a = run()
    const b = run()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // Ids come from the counter: the fund is the first thing drawn from it.
    const g = rich()
    const n = g.nextId
    open(g, 'person')
    expect(fundOf(g, 'person')!.a.id).toBe(`a${n + 1}`)
  })

  it('previews and reads leave the state alone', () => {
    const { g, row } = crowd()
    const before = JSON.stringify(g)
    for (let i = 0; i < 3; i++) {
      candidates(g, row.f)
      takeQuote(g, row.f, 0.3)
      startBlock(g, 'person')
      putBlock(g, row.f)
      fundsOf(g)
    }
    expect(JSON.stringify(g)).toBe(before)
    expect(RUNNING_COST).toBe(0.005)
  })
})

// A hostile record must not move money: the readers clean it and the actions go through them.
describe('hostile records', () => {
  it('put in and take out on a record with no units or a zero pool move nothing', () => {
    const g = rich()
    const row = open(g, 'person')
    row.a.details.hf = { v: 1, owner: 'person', nav: 0, units: 0, mine: 0, cost: 0, holders: [] }
    const cash = g.character.money
    expect(putIn(g, row.a.id, 10_000)).toBe(false)
    expect(g.character.money).toBe(cash)
    expect(fundOf(g, 'person')!.f.nav).toBe(0)
  })

  it('a take out on a pool worth nothing to you pays nothing and closes', () => {
    const { g, row, sis } = crowd()
    const f = fundOf(g, 'family')!.f
    f.mine = 0
    f.cost = 0
    saveFund(row.a, f)
    const cash = g.character.money
    const money = sis.money
    expect(takeOut(g, row.a.id, 0.5)).toBe(true)
    expect(g.character.money).toBe(cash)
    expect(sis.money).toBeGreaterThan(money)
    expect(fundsOf(g)).toEqual([])
  })

  it('a person owned by someone else never gets a record', () => {
    const g = rich()
    const stranger = createPerson(g, { relation: 'sibling', age: 40, relationship: 80, money: 2_000_000, countryId: 'us' })
    const row = open(g, 'person')
    row.a.details.hf = { ...(row.a.details.hf as object), holders: [{ id: stranger.id, units: 5 }] }
    const f = fundOf(g, 'person')!.f
    expect(f.holders).toEqual([])
  })
})
