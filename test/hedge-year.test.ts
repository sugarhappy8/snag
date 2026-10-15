// Hedge funds at year end and at death: every fund books its year once a birthday (the pool moves, relatives
// share it, a bad year cools them, a Macro call lapses), one popup lists the funds and the companies' cash at
// work, and when the player dies a sole adult heir keeps a family fund while a split estate winds it up and
// pays the relatives first. Nothing here reads or advances g.rng, and every test that moves money checks that
// none was made or lost on the way.
import { describe, expect, it } from 'vitest'
import { ageUp, YEARLY_HOOKS } from '../src/game/aging'
import { becomeCeo } from '../src/game/business/career'
import { marketMove, quantBlock } from '../src/game/business/fund-model'
import { signedPlain } from '../src/game/business/fund-text'
import {
  fundOf, fundsOf, invite, saveFund, setFundCall, startFund, type FundRow,
} from '../src/game/business/hedge-fund'
import { setCompanyFund } from '../src/game/business/hedge-company'
import { hedgeRng, leadOf, marketBlock, skillOf, vehicleYear } from '../src/game/business/hedge-model'
import { readHedge, unitsValue, type HedgeFund } from '../src/game/business/hedge-record'
import { keptFundHolders, payOutDroppedFunds, settleFundsAtDeath, yearlyHedge } from '../src/game/business/hedge-year'
import { money } from '../src/game/business/util'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { netWorth } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { changeWill } from '../src/game/events/will-act'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, NoticeModal, Person } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { company, kin, rich } from './hedge-kit'
import { makeTestGame } from './helpers'
import { newLeader } from './politics-kit'

function open(g: GameState, owner: 'person' | 'family', seed = 1_000_000): FundRow {
  expect(startFund(g, owner, seed)).toBe(true)
  const row = fundOf(g, owner)
  if (!row) throw new Error('no fund after a start')
  return row
}

/** One birthday as the yearly loop plays it for the parts this feature touches. */
function birthday(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyBusinessImpl(g)
  yearlyHedge(g)
}

function notices(g: GameState, title?: string): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && (title === undefined || m.title === title))
}

function lines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

function prison(): NonNullable<GameState['character']['prison']> {
  return { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
}

/** Every dollar a fund can touch: your cash, your relatives' savings and every pool. */
function world(g: GameState): number {
  return g.character.money + g.people.reduce((s, p) => s + p.money, 0) + fundsOf(g).reduce((s, r) => s + r.f.nav, 0)
}

/** The first year from 1950 to 2025 in which the US index moves the way `pred` wants, for the life of the kit. */
function yearWhere(pred: (move: number) => boolean, seed = 61): number {
  const g = rich(seed)
  for (let y = 1950; y <= 2025; y++) if (pred(marketMove(g, 'us', y))) return y
  throw new Error('no such year')
}

/** The year a fund of this record will be booked for, run on the model by hand. */
function expected(g: GameState, a: Asset, f: HedgeFund, over: Partial<Parameters<typeof vehicleYear>[1]> = {}): ReturnType<typeof vehicleYear> {
  return vehicleYear(
    g,
    { countryId: f.countryId, strategy: f.strategy, call: f.call, lev: f.lev, nav: f.nav, skill: skillOf(leadOf(g, f.founded)), year: g.year, ...over },
    hedgeRng(g, a.id, g.year),
  )
}

/** A family fund with two relatives in it, opened in `year - 1` so the next birthday is `year`. */
function crowd(year = 2026, seed = 61): { g: GameState; sis: Person; bro: Person } {
  const g = rich(seed, 'us', 5_000_000, year - 1)
  const sis = kin(g, 'sibling', 2_000_000)
  const bro = kin(g, 'sibling', 3_000_000)
  const row = open(g, 'family')
  expect(invite(g, row.a.id, sis.id)).toBe(true)
  expect(invite(g, row.a.id, bro.id)).toBe(true)
  return { g, sis, bro }
}

describe('the yearly step', () => {
  it('books every fund once a birthday', () => {
    const g = rich()
    open(g, 'person')
    open(g, 'family')
    birthday(g)
    for (const r of fundsOf(g)) expect(r.f.lastYear).toBe(g.year)
    const after = JSON.stringify(g)
    const rng = g.rng
    yearlyHedge(g)
    expect(JSON.stringify(g)).toBe(after)
    expect(g.rng).toBe(rng)
  })

  it('moves the pool by the year and your value follows', () => {
    const g = rich()
    const row = open(g, 'person')
    const before = row.f
    birthday(g)
    const now = fundOf(g, 'person')!
    const y = expected(g, now.a, before)
    expect(now.f.nav).toBeCloseTo(before.nav * (1 + y.net), 4)
    expect(now.f.units).toBe(before.units)
    expect(now.a.value).toBe(Math.round((now.f.mine * now.f.nav) / now.f.units))
    expect(now.a.purchasePrice).toBe(1_000_000)
    expect(now.f.marks).toEqual([{ y: g.year, r: y.net, m: y.market }])
    expect(now.f.last).toEqual({ year: g.year, gross: y.gross, net: y.net, market: y.market })
    // Net worth moves by the fund's result alone.
    expect(netWorth(g)).toBeGreaterThan(0)
  })

  it('keeps twelve marks and the right years', () => {
    const g = rich(61, 'us', 5_000_000, 2000)
    open(g, 'person')
    for (let i = 0; i < 15; i++) birthday(g)
    const f = fundOf(g, 'person')!.f
    expect(f.marks).toHaveLength(12)
    expect(f.marks.map((m) => m.y)).toEqual(Array.from({ length: 12 }, (_, i) => g.year - 11 + i))
    expect(f.lastYear).toBe(g.year)
  })

  it('gives two funds their own noise', () => {
    const g = rich()
    open(g, 'person')
    open(g, 'family')
    const before = fundsOf(g).map((r) => r.f.nav)
    birthday(g)
    const growth = fundsOf(g).map((r, i) => r.f.nav / before[i])
    expect(growth[0]).not.toBeCloseTo(growth[1], 8)
  })

  it('a macro call lasts one year and the year runs on it', () => {
    const g = rich()
    const row = open(g, 'family')
    expect(setFundCall(g, row.a.id, 'bull', 2)).toBe(true)
    const before = fundOf(g, 'family')!.f
    birthday(g)
    const now = fundOf(g, 'family')!
    const y = expected(g, now.a, before)
    expect(now.f.nav).toBeCloseTo(before.nav * (1 + y.net), 4)
    expect(now.f).toMatchObject({ strategy: 'longShort', call: 'flat', lev: 1 })
    expect(notices(g, 'Hedge Funds')[0].text).toContain('Macro goes back to Long/Short.')
    // A year on Long/Short says nothing about it.
    birthday(g)
    expect(notices(g, 'Hedge Funds')[0].text).not.toContain('Macro')
  })

  it('an official cannot run a Macro year: the fund runs Long/Short', () => {
    const g = newLeader(5)
    g.year = 2026
    g.character.money = 5_000_000
    g.character.age = 45
    const row = open(g, 'family')
    row.f.strategy = 'macro'
    row.f.call = 'bull'
    row.f.lev = 3
    saveFund(row.a, row.f)
    const before = fundOf(g, 'family')!.f
    birthday(g)
    const now = fundOf(g, 'family')!
    const y = expected(g, now.a, before, { strategy: 'longShort', call: 'flat', lev: 1 })
    expect(now.f.nav).toBeCloseTo(before.nav * (1 + y.net), 4)
    expect(now.f).toMatchObject({ strategy: 'longShort', call: 'flat', lev: 1 })
  })

  it('Quant where it is not possible runs Long/Short and is kept as the owner set it', () => {
    let found: { id: string; year: number } | null = null
    for (const c of COUNTRIES) {
      for (let y = 1950; y <= 1999 && !found; y++) {
        const g = rich(61, c.id, 5_000_000, y)
        if (quantBlock(c.id, y + 1) && !marketBlock(g, c.id) && !marketBlock({ ...g, year: y + 1 }, c.id)) found = { id: c.id, year: y }
      }
      if (found) break
    }
    if (!found) throw new Error('no country and year where Quant is blocked')
    const g = rich(61, found.id, 5_000_000, found.year)
    const row = open(g, 'person')
    row.f.strategy = 'quant'
    saveFund(row.a, row.f)
    const before = fundOf(g, 'person')!.f
    birthday(g)
    const now = fundOf(g, 'person')!
    const y = expected(g, now.a, before, { strategy: 'longShort', call: 'flat', lev: 1 })
    expect(now.f.nav).toBeCloseTo(before.nav * (1 + y.net), 4)
    expect(now.f.strategy).toBe('quant')
  })

  it('one popup and one log line per fund, with the company block', () => {
    const g = rich()
    const { a, b } = company(g, { cash: 50_000_000, name: 'Quiet Co' })
    b.founded = g.year - 8
    becomeCeo(g, a, b)
    expect(setCompanyFund(g, a.id, { target: 5_000_000 })).toBe(true)
    const p = open(g, 'person')
    const f = open(g, 'family')
    g.queue = []
    g.year += 1
    g.character.age += 1
    yearlyBusinessImpl(g)
    yearlyHedge(g)
    const hedge = notices(g, 'Hedge Funds')
    expect(hedge).toHaveLength(1)
    expect(hedge[0].id).toBe(`hedge-${g.generation}-${g.year}`)
    expect(hedge[0].emoji).toBe('🦈')
    expect(hedge[0].text).toContain(p.a.name)
    expect(hedge[0].text).toContain(f.a.name)
    expect(hedge[0].text).toMatch(/Quiet Co: .* at work, [+-]\$/)
    expect(hedge[0].text.split('\n')).toHaveLength(3)
    expect(lines(g).filter((t) => t.startsWith('My ') && /Fund (rose|fell) /.test(t))).toHaveLength(2)
    // A second call the same year queues no second popup.
    yearlyHedge(g)
    expect(notices(g, 'Hedge Funds')).toHaveLength(1)
  })

  it('the popup names each fund with the year, the market and your share', () => {
    const g = rich()
    open(g, 'person')
    const before = fundOf(g, 'person')!.f
    birthday(g)
    const now = fundOf(g, 'person')!
    const y = expected(g, now.a, before)
    expect(notices(g, 'Hedge Funds')[0].text).toBe(`${now.a.name}: ${signedPlain(y.net)} (market ${signedPlain(y.market)}). Your share is ${money(now.a.value)}.`)
    expect(lines(g)).toContain(`My ${now.a.name} ${y.net >= 0 ? 'rose' : 'fell'} ${(Math.abs(y.net) * 100).toFixed(1)}% this year.`)
  })

  it('the popup tone follows the sum of the results', () => {
    const down = yearWhere((m) => m < -0.3)
    const g = rich(61, 'us', 5_000_000, down - 1)
    const row = open(g, 'person')
    setFundCall(g, row.a.id, 'bull', 3)
    birthday(g)
    expect(notices(g, 'Hedge Funds')[0].tone).toBe('bad')
    // A loss carries the plain hyphen, like the dollars beside it.
    expect(notices(g, 'Hedge Funds')[0].text).toMatch(/: -\d+\.\d% \(market -\d+\.\d%\)\./)
    expect(notices(g, 'Hedge Funds')[0].text).not.toContain('\u2212')
    const up = yearWhere((m) => m > 0.15)
    const h = rich(61, 'us', 5_000_000, up - 1)
    open(h, 'person')
    birthday(h)
    expect(fundOf(h, 'person')!.f.last!.net).toBeGreaterThanOrEqual(0)
    expect(notices(h, 'Hedge Funds')[0].tone).toBe('good')
  })

  it('a popup for a company alone takes nothing from the id counter', () => {
    const g = rich()
    const { a, b } = company(g, { cash: 5_000_000 })
    b.hedge = { v: 1, target: 1_000_000, strategy: 'longShort', call: 'flat', lev: 1, total: 0, last: { year: g.year - 1, work: 1_000_000, gross: 0.1, net: 0.095, market: 0.1, pnl: 95_000 } }
    g.queue = []
    const next = g.nextId
    const rng = g.rng
    yearlyHedge(g)
    const hedge = notices(g, 'Hedge Funds')
    expect(hedge).toHaveLength(1)
    expect(hedge[0].text).toBe(`${a.name}: ${money(1_000_000)} at work, +${money(95_000)}.`)
    expect(hedge[0].tone).toBe('good')
    expect(g.nextId).toBe(next)
    expect(g.rng).toBe(rng)
    expect(lines(g)).toEqual([])
  })

  it('a company with no work last year or an older record adds no block', () => {
    const g = rich()
    const { b } = company(g, { cash: 5_000_000 })
    b.hedge = { v: 1, target: 1_000_000, strategy: 'longShort', call: 'flat', lev: 1, total: 0, last: { year: g.year - 1, work: 0, gross: 0, net: 0, market: 0, pnl: 0, why: 'It has no spare cash.' } }
    yearlyHedge(g)
    expect(notices(g, 'Hedge Funds')).toHaveLength(0)
    b.hedge = { v: 1, target: 1_000_000, strategy: 'longShort', call: 'flat', lev: 1, total: 0, last: { year: g.year - 3, work: 1_000_000, gross: 0.1, net: 0.095, market: 0.1, pnl: 95_000 } }
    yearlyHedge(g)
    expect(notices(g, 'Hedge Funds')).toHaveLength(0)
  })

  it('no funds and no records: nothing is queued and nothing is logged', () => {
    const g = rich()
    g.year += 1
    const s = JSON.stringify(g)
    const rng = g.rng
    yearlyHedge(g)
    expect(JSON.stringify(g)).toBe(s)
    expect(g.rng).toBe(rng)
    expect(g.queue).toEqual([])
  })

  it('relatives share the year pro rata', () => {
    const { g, sis, bro } = crowd()
    const row = fundOf(g, 'family')!
    const before = row.f
    const worth = (f: HedgeFund, id: string) => unitsValue(f, f.holders.find((h) => h.id === id)!.units)
    const sisBefore = worth(before, sis.id)
    const broBefore = worth(before, bro.id)
    const mineBefore = unitsValue(before, before.mine)
    birthday(g)
    const now = fundOf(g, 'family')!
    const y = expected(g, now.a, before)
    expect(worth(now.f, sis.id)).toBeCloseTo(sisBefore * (1 + y.net), 4)
    expect(worth(now.f, bro.id)).toBeCloseTo(broBefore * (1 + y.net), 4)
    expect(unitsValue(now.f, now.f.mine)).toBeCloseTo(mineBefore * (1 + y.net), 4)
    const sum = unitsValue(now.f, now.f.mine) + now.f.holders.reduce((s, h) => s + unitsValue(now.f, h.units), 0)
    expect(sum).toBeCloseTo(now.f.nav, 4)
  })

  it('a bad year cools relatives, a good one does not', () => {
    const down = yearWhere((m) => m < -0.3)
    const { g, sis, bro } = crowd(down)
    setFundCall(g, fundOf(g, 'family')!.a.id, 'bull', 3)
    birthday(g)
    const f = fundOf(g, 'family')!
    expect(f.f.last!.net).toBeLessThanOrEqual(-0.15)
    expect(sis.relationship).toBe(67)
    expect(bro.relationship).toBe(67)
    expect(lines(g).filter((t) => t === `Relatives in the ${f.a.name} lost money.`)).toHaveLength(1)
    const up = yearWhere((m) => m > 0.1)
    const c = crowd(up)
    birthday(c.g)
    expect(fundOf(c.g, 'family')!.f.last!.net).toBeGreaterThan(-0.15)
    expect(c.sis.relationship).toBe(70)
    expect(c.bro.relationship).toBe(70)
    expect(lines(c.g).some((t) => t.startsWith('Relatives in the'))).toBe(false)
  })

  it('a loss with no relatives cools nobody and says nothing about them', () => {
    const down = yearWhere((m) => m < -0.3)
    const g = rich(61, 'us', 5_000_000, down - 1)
    const row = open(g, 'family')
    setFundCall(g, row.a.id, 'bull', 3)
    birthday(g)
    expect(fundOf(g, 'family')!.f.last!.net).toBeLessThanOrEqual(-0.15)
    expect(lines(g).some((t) => t.startsWith('Relatives in the'))).toBe(false)
  })

  it('settling runs first: a cooled holder is paid out before the year and does not share its return', () => {
    const { g, sis } = crowd()
    const before = fundOf(g, 'family')!
    const held = before.f.holders.find((h) => h.id === sis.id)!
    const value = unitsValue(before.f, held.units)
    sis.relationship = 10
    const money0 = sis.money
    const totalBefore = world(g)
    birthday(g)
    const now = fundOf(g, 'family')!
    expect(now.f.holders.find((h) => h.id === sis.id)).toBeUndefined()
    expect(sis.money).toBeCloseTo(money0 + value, 4)
    expect(lines(g)).toContain(`${sis.firstName} took their money out of the ${now.a.name}.`)
    const y = expected(g, now.a, { ...now.f, nav: before.f.nav - value })
    expect(now.f.nav).toBeCloseTo((before.f.nav - value) * (1 + y.net), 4)
    // The only change in the world's money is the fund's own result on what stayed in.
    expect(world(g) - totalBefore).toBeCloseTo((before.f.nav - value) * y.net, 3)
  })

  it('a holder who died passes on before the year is booked', () => {
    const { g, sis } = crowd()
    const before = fundOf(g, 'family')!
    sis.alive = false
    birthday(g)
    const now = fundOf(g, 'family')!
    expect(now.f.holders.find((h) => h.id === sis.id)).toBeUndefined()
    expect(lines(g).some((t) => t.includes(`${sis.firstName} `) && t.includes(`part of the ${now.a.name}`))).toBe(true)
    expect(now.f.units).toBeLessThanOrEqual(before.f.units)
  })

  it('a booking marker from the future does not freeze the fund', () => {
    const g = rich()
    const row = open(g, 'person')
    row.a.details.hf = { ...JSON.parse(JSON.stringify(row.f)), lastYear: 2300 }
    birthday(g)
    const f = fundOf(g, 'person')!.f
    expect(f.lastYear).toBe(g.year)
    expect(f.marks).toHaveLength(1)
    const again = JSON.stringify(g)
    yearlyHedge(g)
    expect(JSON.stringify(g)).toBe(again)
  })

  it('a fund worth nothing is gone', () => {
    const g = rich()
    const row = open(g, 'person')
    const next = { ...row.f, nav: 0.4 }
    row.a.details.hf = JSON.parse(JSON.stringify(next))
    birthday(g)
    expect(fundsOf(g)).toEqual([])
    expect(g.assets.find((a) => a.id === row.a.id)).toBeUndefined()
    expect(lines(g)).toContain(`The ${row.a.name} is gone.`)
    expect(notices(g, 'Hedge Funds')).toHaveLength(0)
  })

  it('the pool never passes the limit', () => {
    const g = rich()
    const row = open(g, 'person')
    row.f.nav = 9.99e14
    row.f.units = 9.99e14
    row.f.mine = 9.99e14
    saveFund(row.a, row.f)
    const up = yearWhere((m) => m > 0.2)
    g.year = up - 1
    birthday(g)
    const f = fundOf(g, 'person')!.f
    expect(f.nav).toBeLessThanOrEqual(1e15)
    expect(Number.isFinite(f.nav)).toBe(true)
  })

  it('a dead character books nothing and a prisoner still does', () => {
    const g = rich()
    open(g, 'person')
    g.year += 1
    g.character.alive = false
    const s = JSON.stringify(g)
    yearlyHedge(g)
    expect(JSON.stringify(g)).toBe(s)
    const p = rich()
    open(p, 'person')
    p.character.prison = prison()
    birthday(p)
    expect(fundOf(p, 'person')!.f.lastYear).toBe(p.year)
  })

  it('a game with no fund returns at once', () => {
    const g = rich()
    const s = JSON.stringify(g)
    const rng = g.rng
    yearlyHedge(g)
    expect(JSON.stringify(g)).toBe(s)
    expect(g.rng).toBe(rng)
    // A company with no record, or a damaged one, is left alone too.
    const { b } = company(g)
    const t = JSON.stringify(g)
    yearlyHedge(g)
    expect(JSON.stringify(g)).toBe(t)
    ;(b as unknown as { hedge: unknown }).hedge = 'x'
    const u = JSON.stringify(g)
    yearlyHedge(g)
    expect(JSON.stringify(g)).toBe(u)
    expect(g.rng).toBe(rng)
  })

  it('a damaged fund record is left alone and keeps its value', () => {
    for (const junk of [7, 'x', null, [], {}, { v: 2, owner: 'person' }]) {
      const g = rich()
      const row = open(g, 'person')
      row.a.details.hf = junk as never
      g.year += 1
      const worth = netWorth(g)
      const s = JSON.stringify(g)
      yearlyHedge(g)
      expect(JSON.stringify(g)).toBe(s)
      expect(netWorth(g)).toBe(worth)
    }
  })

  it('a fund record with hostile numbers books on clean ones', () => {
    const g = rich()
    const row = open(g, 'person')
    row.a.details.hf = { ...row.f, lev: 9, strategy: 'moon', call: 7, marks: 'z', last: 3, lastYear: 'y', units: Number.NaN } as never
    birthday(g)
    const f = fundOf(g, 'person')!.f
    expect(f.strategy).toBe('longShort')
    expect(Number.isFinite(f.nav) && f.nav > 0).toBe(true)
    expect(f.marks).toHaveLength(1)
    expect(f.lastYear).toBe(g.year)
  })

  it('is deterministic, reads nothing from g.rng and follows a Time Machine fork', () => {
    const g = rich()
    open(g, 'person')
    open(g, 'family')
    const twin = structuredClone(g)
    const forked = structuredClone(g)
    forked.flags.timelineForks = [{ year: forked.year - 2, salt: 'abc123' }]
    birthday(g)
    birthday(twin)
    birthday(forked)
    expect(JSON.stringify(g)).toBe(JSON.stringify(twin))
    expect(fundOf(forked, 'person')!.f.nav).not.toBe(fundOf(g, 'person')!.f.nav)
    const h = structuredClone(twin)
    h.year += 1
    const rng = h.rng
    yearlyHedge(h)
    expect(h.rng).toBe(rng)
  })

  it('moves no money outside the funds and the relatives', () => {
    const { g } = crowd()
    const cash = g.character.money
    const people = g.people.map((p) => p.money)
    birthday(g)
    expect(g.character.money).toBe(cash)
    expect(g.people.map((p) => p.money)).toEqual(people)
  })
})

describe('the hook', () => {
  it('sits right after investments and is a no-op for a game with no fund', () => {
    const names = YEARLY_HOOKS.map(([k]) => k)
    expect(names.indexOf('hedge')).toBe(names.indexOf('investments') + 1)
    const g = makeTestGame(7, { age: 40, money: 300_000 })
    g.log = [{ age: 40, year: 2026, entries: [] }]
    const twin = structuredClone(g)
    ageUp(g)
    const i = YEARLY_HOOKS.findIndex(([k]) => k === 'hedge')
    const [hook] = YEARLY_HOOKS.splice(i, 1)
    try {
      ageUp(twin)
    } finally {
      YEARLY_HOOKS.splice(i, 0, hook)
    }
    expect(JSON.stringify(g)).toBe(JSON.stringify(twin))
  })

  it('a year of the real loop books a fund once', () => {
    const g = makeTestGame(7, { age: 40, money: 5_000_000, countryId: 'us' })
    g.log = [{ age: 40, year: 2026, entries: [] }]
    g.lifeId = 'hedge-loop'
    expect(startFund(g, 'person', 1_000_000)).toBe(true)
    g.queue = []
    ageUp(g)
    const f = fundOf(g, 'person')!.f
    expect(f.lastYear).toBe(g.year)
    expect(f.marks).toHaveLength(1)
    expect(notices(g, 'Hedge Funds')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Passing on

function die(g: GameState): void {
  killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
}

interface Legacy {
  g: GameState
  heir: Person
  other: Person
  sis: Person
  fund: FundRow
}

/**
 * A player of 78 with a family fund, a sister of their own in it and two adult children. The children may hold
 * units too. (The player's own siblings are not in the heir's family tree; the children are.)
 */
function legacy(seed: number, opts: { owner?: 'person' | 'family'; heirHolds?: boolean; otherHolds?: boolean; heirAge?: number } = {}): Legacy {
  const g = rich(seed, 'us', 6_000_000)
  g.character.age = 78
  g.log = [{ age: 78, year: g.year, entries: [] }]
  const heir = createPerson(g, { relation: 'child', age: opts.heirAge ?? 30, relationship: 75, money: opts.heirHolds ? 1_500_000 : 20_000, countryId: 'us' })
  const other = createPerson(g, { relation: 'child', age: 33, relationship: 70, money: opts.otherHolds ? 1_500_000 : 20_000, countryId: 'us' })
  const sis = kin(g, 'sibling', 2_000_000)
  const owner = opts.owner ?? 'family'
  const fund = open(g, owner)
  if (owner === 'family') {
    expect(invite(g, fund.a.id, sis.id)).toBe(true)
    if (opts.heirHolds) expect(invite(g, fund.a.id, heir.id)).toBe(true)
    if (opts.otherHolds) expect(invite(g, fund.a.id, other.id)).toBe(true)
  }
  return { g, heir, other, sis, fund: fundOf(g, owner)! }
}

function named(g: GameState, ...heirs: Person[]): void {
  changeWill(g, (gg, w) => {
    gg.character.willBeneficiaries = heirs.map((h) => h.id)
    w.shares = {}
  })
  g.queue = []
}

function alone(l: Legacy): void {
  l.g.people = l.g.people.filter((p) => p.id !== l.other.id)
}

function holderValue(f: HedgeFund, id: string): number {
  return unitsValue(f, f.holders.find((h) => h.id === id)!.units)
}

describe('when you die', () => {
  it('a sole adult heir keeps the family fund and the relatives stay in it', () => {
    const l = legacy(71)
    alone(l)
    const fund = l.fund
    const sisUnits = fund.f.holders.find((h) => h.id === l.sis.id)!.units
    const sisMoney = l.sis.money
    const value = fund.a.value
    die(l.g)
    const n = continueAsChild(l.g, l.heir.id)
    const kept = n.assets.find((a) => a.id === fund.a.id)
    expect(kept).toBeDefined()
    expect(kept!.value).toBe(value)
    const f = readHedge(kept!.details.hf)!
    expect(f.mine).toBeCloseTo(fund.f.mine, 6)
    expect(f.holders.find((h) => h.id === l.sis.id)!.units).toBeCloseTo(sisUnits, 6)
    // The heir's family tree has no place for the player's own sister, so she stays as a contact, with her money untouched.
    const sis = n.people.find((p) => p.id === l.sis.id)
    expect(sis?.money).toBe(sisMoney)
    expect(notices(n).some((m) => m.text.includes('was wound up'))).toBe(false)
    // And the next birthday keeps her in: she is not a missing contact.
    birthday(n)
    const now = fundsOf(n)[0]
    expect(now.f.holders.map((h) => h.id)).toEqual([l.sis.id])
    expect(now.f.holders[0].units).toBeCloseTo(sisUnits, 6)
    expect(now.f.units).toBeCloseTo(fund.f.units, 6)
  })

  it('the heir who was a holder merges on the next birthday, once', () => {
    const l = legacy(72, { heirHolds: true })
    alone(l)
    const fund = l.fund
    const heirUnits = fund.f.holders.find((h) => h.id === l.heir.id)!.units
    const heirValue = unitsValue(fund.f, heirUnits)
    die(l.g)
    const n = continueAsChild(l.g, l.heir.id)
    const kept = fundsOf(n)[0]
    expect(kept.f.holders.some((h) => h.id === l.heir.id)).toBe(true)
    expect(kept.f.mine).toBeCloseTo(fund.f.mine, 6)
    birthday(n)
    const now = fundsOf(n)[0]
    expect(now.f.holders.some((h) => h.id === l.heir.id)).toBe(false)
    expect(now.f.mine).toBeCloseTo(fund.f.mine + heirUnits, 6)
    expect(now.f.cost).toBeCloseTo(fund.f.cost + heirValue, 4)
    expect(now.f.holders.some((h) => h.id === l.sis.id)).toBe(true)
  })

  it('a split estate winds the fund up, pays the relatives first and the heirs get your units', () => {
    const l = legacy(73, { otherHolds: true })
    named(l.g, l.heir, l.other)
    const { f, a } = l.fund
    const pool = f.nav
    const mine = unitsValue(f, f.mine)
    const sisValue = holderValue(f, l.sis.id)
    const otherValue = holderValue(f, l.other.id)
    const cash = l.g.character.money
    const heirMoney = l.heir.money
    const otherMoney = l.other.money
    const sisMoney = l.sis.money
    const total = world(l.g)
    die(l.g)
    const n = continueAsChild(l.g, l.heir.id)
    expect(n.assets.find((x) => x.id === a.id)).toBeUndefined()
    expect(fundsOf(n)).toEqual([])
    // The heir's cash is her own plus half of the cash and your units; the other heir's is her own, her units and the same half.
    expect(Math.abs(n.character.money - (heirMoney + (cash + a.value) / 2))).toBeLessThanOrEqual(2)
    const other = n.people.find((p) => p.id === l.other.id)!
    expect(Math.abs(other.money - (otherMoney + otherValue + (cash + a.value) / 2))).toBeLessThanOrEqual(2)
    // Relatives' payouts plus your units' value are the pool.
    expect(sisValue + otherValue + mine).toBeCloseTo(pool, 4)
    const text = notices(n).map((m) => m.text).join(' ')
    expect(text).toContain(`The ${a.name} was wound up. Relatives got ${money(sisValue + otherValue)}.`)
    // No money was made or lost: what the heirs hold, plus your sister's payout (her record left with the old family tree).
    expect(Math.abs(n.character.money + other.money + sisMoney + sisValue - total)).toBeLessThanOrEqual(6)
  })

  it('a split estate where the heir was a holder pays her once', () => {
    const l = legacy(74, { heirHolds: true })
    named(l.g, l.heir, l.other)
    const { f, a } = l.fund
    const heirValue = holderValue(f, l.heir.id)
    const cash = l.g.character.money
    const heirMoney = l.heir.money
    die(l.g)
    const n = continueAsChild(l.g, l.heir.id)
    expect(Math.abs(n.character.money - (heirMoney + heirValue + (cash + a.value) / 2))).toBeLessThanOrEqual(2)
    expect(fundsOf(n)).toEqual([])
  })

  it('a minor heir: the fund is dropped and the relatives are paid', () => {
    const l = legacy(75, { heirAge: 12, otherHolds: true })
    const { f, a } = l.fund
    const otherValue = holderValue(f, l.other.id)
    const otherMoney = l.other.money
    die(l.g)
    const n = continueAsChild(l.g, l.heir.id)
    expect(n.assets.find((x) => x.id === a.id)).toBeUndefined()
    expect(n.people.find((p) => p.id === l.other.id)!.money).toBeGreaterThanOrEqual(otherMoney + otherValue - 1)
    expect(notices(n).map((m) => m.text).join(' ')).toContain('was wound up')
  })

  it('a personal fund is part of the estate like any investment: kept by a sole adult heir, cashed in a split', () => {
    const kept = legacy(76, { owner: 'person' })
    alone(kept)
    const value = kept.fund.a.value
    die(kept.g)
    const n = continueAsChild(kept.g, kept.heir.id)
    const stayed = n.assets.find((x) => x.id === kept.fund.a.id)
    expect(stayed?.value).toBe(value)
    const split = legacy(77, { owner: 'person' })
    named(split.g, split.heir, split.other)
    const cash = split.g.character.money
    const heirMoney = split.heir.money
    const worth = split.fund.a.value
    die(split.g)
    const m = continueAsChild(split.g, split.heir.id)
    expect(m.assets.find((x) => x.id === split.fund.a.id)).toBeUndefined()
    expect(Math.abs(m.character.money - (heirMoney + (cash + worth) / 2))).toBeLessThanOrEqual(2)
    expect(notices(m).some((x) => x.text.includes('was wound up'))).toBe(false)
  })

  it('a holder who died this year leaves their part to the estate when a spouse of yours', () => {
    const g = rich(78, 'us', 6_000_000)
    g.character.age = 78
    const heir = createPerson(g, { relation: 'child', age: 30, relationship: 75, money: 20_000, countryId: 'us' })
    const other = createPerson(g, { relation: 'child', age: 33, relationship: 70, money: 20_000, countryId: 'us' })
    const spouse = kin(g, 'spouse', 2_000_000)
    const row = open(g, 'family')
    expect(invite(g, row.a.id, spouse.id)).toBe(true)
    const { f, a } = fundOf(g, 'family')!
    const theirs = holderValue(f, spouse.id)
    const mine = unitsValue(f, f.mine)
    spouse.alive = false
    named(g, heir, other)
    const cash = g.character.money
    const heirMoney = heir.money
    die(g)
    const n = continueAsChild(g, heir.id)
    expect(n.assets.find((x) => x.id === a.id)).toBeUndefined()
    // The spouse's part came to you, so it divides with the rest of the estate.
    expect(Math.abs(n.character.money - (heirMoney + (cash + mine + theirs) / 2))).toBeLessThanOrEqual(2)
  })

  it('settleFundsAtDeath moves a late holder into your units and updates the asset', () => {
    const g = rich(79)
    const spouse = kin(g, 'spouse', 2_000_000)
    const row = open(g, 'family')
    invite(g, row.a.id, spouse.id)
    const { f, a } = fundOf(g, 'family')!
    const gain = unitsValue(f, f.holders[0].units)
    const was = a.value
    spouse.alive = false
    settleFundsAtDeath(g)
    const now = fundOf(g, 'family')!
    expect(now.f.holders).toEqual([])
    expect(now.a.value).toBe(Math.round(was + gain))
    // A game with no fund, or a fund with no holders, is untouched.
    const h = rich(80)
    open(h, 'person')
    const s = JSON.stringify(h)
    settleFundsAtDeath(h)
    expect(JSON.stringify(h)).toBe(s)
    const none = rich(81)
    const t = JSON.stringify(none)
    settleFundsAtDeath(none)
    expect(JSON.stringify(none)).toBe(t)
  })
})

describe('keptFundHolders', () => {
  it('lists the relatives of the funds that are kept and nothing else', () => {
    const { g, sis, bro } = crowd()
    const p = open(g, 'person')
    const house: Asset = { id: 'h1', kind: 'house', name: 'Home', emoji: '🏠', purchasePrice: 1, value: 400_000, condition: 80, purchasedAge: 30, upkeep: 0, details: {} }
    const damaged: Asset = { ...structuredClone(p.a), id: 'x1', details: { type: 'hedge', hf: 'junk' } }
    expect(keptFundHolders(g.assets).sort()).toEqual([sis.id, bro.id].sort())
    expect(keptFundHolders([house, p.a, damaged])).toEqual([])
    expect(keptFundHolders([])).toEqual([])
  })
})

describe('payOutDroppedFunds', () => {
  it('pays the holders only and returns one line', () => {
    const { g, sis, bro } = crowd()
    const { a, f } = fundOf(g, 'family')!
    const value = (id: string) => unitsValue(f, f.holders.find((h) => h.id === id)!.units)
    const sisMoney = sis.money
    const broMoney = bro.money
    const cash = g.character.money
    const frozen = JSON.stringify(a)
    const out = payOutDroppedFunds(g, [a])
    expect(out).toEqual([`The ${a.name} was wound up. Relatives got ${money(value(sis.id) + value(bro.id))}.`])
    expect(sis.money).toBeCloseTo(sisMoney + value(sis.id), 4)
    expect(bro.money).toBeCloseTo(broMoney + value(bro.id), 4)
    expect(g.character.money).toBe(cash)
    expect(JSON.stringify(a)).toBe(frozen)
  })

  it('ignores what is not a fund, a fund with no relatives and a damaged record', () => {
    const g = rich()
    const house: Asset = { id: 'h1', kind: 'house', name: 'Home', emoji: '🏠', purchasePrice: 1, value: 400_000, condition: 80, purchasedAge: 30, upkeep: 0, details: {} }
    const p = open(g, 'person')
    const damaged: Asset = { ...structuredClone(p.a), id: 'x1', details: { type: 'hedge', hf: 'junk' } }
    const s = JSON.stringify(g)
    expect(payOutDroppedFunds(g, [house, p.a, damaged])).toEqual([])
    expect(JSON.stringify(g)).toBe(s)
    expect(payOutDroppedFunds(g, [])).toEqual([])
  })

  it('pays a late holder to their heirs', () => {
    const { g, sis } = crowd()
    const { a, f } = fundOf(g, 'family')!
    const parent = kin(g, 'parent', 100_000, { age: 70 })
    const value = unitsValue(f, f.holders.find((h) => h.id === sis.id)!.units)
    sis.alive = false
    const parentMoney = parent.money
    payOutDroppedFunds(g, [a])
    // A late sibling's part reaches the living parent first.
    expect(parent.money).toBeCloseTo(parentMoney + value, 4)
  })

  it('uses no randomness', () => {
    const { g } = crowd()
    const rng = g.rng
    const next = g.nextId
    payOutDroppedFunds(g, fundsOf(g).map((r) => r.a))
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(next)
  })
})

describe('old saves', () => {
  it('a game saved before this build goes through ageUp unchanged apart from the year', () => {
    const g = makeTestGame(9, { age: 30, money: 100_000 })
    g.log = [{ age: 30, year: 2026, entries: [] }]
    const asset: Asset = { id: 'inv1', kind: 'investment', name: 'Index Fund', emoji: '📈', purchasePrice: 10_000, value: 10_000, condition: 100, purchasedAge: 28, upkeep: 0, details: { type: 'index' } }
    g.assets.push(asset)
    const twin = structuredClone(g)
    ageUp(g)
    const i = YEARLY_HOOKS.findIndex(([k]) => k === 'hedge')
    const [hook] = YEARLY_HOOKS.splice(i, 1)
    try {
      ageUp(twin)
    } finally {
      YEARLY_HOOKS.splice(i, 0, hook)
    }
    expect(JSON.stringify(g)).toBe(JSON.stringify(twin))
    expect(g.assets.every((a) => a.details.hf === undefined)).toBe(true)
  })
})
