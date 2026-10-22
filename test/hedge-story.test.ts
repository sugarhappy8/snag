// Hedge funds from the first deposit to the estate, in one story (hedge funds, task 7): a founder with a
// sister, an adult child and a company starts a Personal fund and a Family fund, brings the sister in,
// sets the company's spare cash to work, ages three years, takes money out and dies. The adult child keeps
// the family fund and the sister stays in it. Every step drives the real code from tasks 1 to 6, so this is
// a check on how they fit together, not on any one of them.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import '../src/game/business'
import { setCompanyFund } from '../src/game/business/hedge-company'
import { fundOf, fundsOf, invite, startFund, takeOut, takeQuote } from '../src/game/business/hedge-fund'
import { readCompanyHedge, unitsValue } from '../src/game/business/hedge-record'
import { yearlyHedge } from '../src/game/business/hedge-year'
import { readBiz } from '../src/game/business/state'
import { num } from '../src/game/business/util'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { netWorth } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { inLineIds } from '../src/game/events/will-core'
import { investmentHoldings, investmentsMenu, lossCarry } from '../src/game/investments'
import { continueAsChild } from '../src/game/life'
import type { Asset, GameState, MenuGroup, MenuInfo, MenuNode, NoticeModal, Person } from '../src/game/types'
import { company, kin, rich } from './hedge-kit'

/** One birthday as the yearly loop plays it for the parts this feature touches. */
function birthday(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyBusinessImpl(g)
  yearlyHedge(g)
}

function popups(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === 'Hedge Funds')
}

/** The Hedge Funds row of Investments, read the way the app reads it. */
function hedgeRow(g: GameState): MenuGroup {
  const row = investmentsMenu.children(g).find((n) => n.id === 'inv-hedge')
  if (!row || row.type !== 'menu') throw new Error('no Hedge Funds row')
  return row
}

function texts(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.filter((n): n is MenuInfo => n.type === 'info').map((n) => (typeof n.text === 'string' ? n.text : n.text(g)))
}

interface Story {
  g: GameState
  sis: Person
  child: Person
  co: Asset
}

/**
 * A founder with 6M, a sister with 3M, an adult child and a software company with 4M of cash. A Personal fund
 * and a Family fund open with 1M each, the sister joins the family fund and the company puts up to 2M to
 * work. Net worth is the same after every step, because cash only turns into units.
 */
function opened(seed: number): Story {
  const g = rich(seed, 'us', 6_000_000)
  const sis = kin(g, 'sibling', 3_000_000)
  const child = kin(g, 'child', 50_000, { age: 25 })
  const { a: co } = company(g, { cash: 4_000_000 })
  const worth = netWorth(g)

  expect(startFund(g, 'person', 1_000_000)).toBe(true)
  expect(netWorth(g)).toBe(worth)
  expect(startFund(g, 'family', 1_000_000)).toBe(true)
  expect(netWorth(g)).toBe(worth)
  expect(g.character.money).toBe(4_000_000)
  // Neither is a market security.
  expect(investmentHoldings(g)).toEqual([])

  // The sister puts in a fifth of her savings, which is less than your units are worth.
  const family = fundOf(g, 'family')!
  const put = Math.min(Math.floor(0.2 * sis.money), Math.floor(unitsValue(family.f, family.f.mine)))
  expect(put).toBe(600_000)
  expect(invite(g, family.a.id, sis.id)).toBe(true)
  expect(sis.money).toBe(3_000_000 - put)
  const joined = fundOf(g, 'family')!.f
  expect(joined.holders.map((h) => h.id)).toEqual([sis.id])
  expect(unitsValue(joined, joined.holders[0].units)).toBeCloseTo(put, 4)
  expect(joined.nav).toBe(1_000_000 + put)
  expect(netWorth(g)).toBe(worth)

  // The company puts up to 2M of its spare cash to work. Its cash stays where it is.
  expect(setCompanyFund(g, co.id, { target: 2_000_000 })).toBe(true)
  expect(netWorth(g)).toBe(worth)
  expect(readBiz(g, co).cash).toBe(4_000_000)
  return { g, sis, child, co }
}

/** Three birthdays: one popup each, every fund booked, the books agree and nobody else's money moves. */
function threeYears({ g, sis, co }: Story): void {
  const sisMoney = sis.money
  for (let i = 0; i < 3; i++) {
    birthday(g)
    const shown = popups(g)
    expect(shown).toHaveLength(1)
    expect(shown[0].id).toBe(`hedge-${g.generation}-${g.year}`)
    const rows = fundsOf(g)
    expect(rows.map((r) => r.f.owner).sort()).toEqual(['family', 'person'])
    for (const { a, f } of rows) {
      expect(f.lastYear).toBe(g.year)
      expect(shown[0].text).toContain(a.name)
      const held = f.holders.reduce((sum, h) => sum + unitsValue(f, h.units), 0)
      expect(unitsValue(f, f.mine) + held).toBeCloseTo(f.nav, 3)
    }
    const last = readCompanyHedge(readBiz(g, co).hedge)?.last
    expect(last?.year).toBe(g.year - 1)
    expect(last?.work).toBeGreaterThan(0)
    expect(shown[0].text).toContain(co.name)
    expect(sis.money).toBe(sisMoney)
  }
  expect(fundOf(g, 'family')!.f.marks).toHaveLength(3)
  expect(readCompanyHedge(readBiz(g, co).hedge)?.target).toBe(2_000_000)
}

describe('a founder runs three funds and passes the family fund on', () => {
  it('a founder runs three funds, ages three years and passes the family fund on', () => {
    // 1-3. Open the funds and the company's sleeve, then age three years. This seed's Personal fund ends ahead.
    const story = opened(72)
    const { g, sis, child } = story
    threeYears(story)

    // 4. Take half out of the Personal fund, then the rest. The gain is taxed when it comes out.
    const personal = fundOf(g, 'person')!
    const cash = g.character.money
    const before = netWorth(g)
    const income = Math.max(0, num(g.flags.taxableIncome))
    const half = takeQuote(g, personal.f, 0.5)
    expect(half.closes).toBe(false)
    expect(half.gain).toBeGreaterThan(0)
    expect(half.tax).toBeGreaterThan(0)
    expect(takeOut(g, personal.a.id, 0.5)).toBe(true)
    expect(Math.abs(g.character.money - cash - (half.gross - half.tax))).toBeLessThanOrEqual(1)
    // R2-L13 (F38): the tax is the capital gains rate, withheld at the take out; the gain is not income, so taxableIncome stays put.
    expect(num(g.flags.taxableIncome)).toBe(income)
    // Net worth falls by the tax and nothing else.
    expect(Math.abs(before - netWorth(g) - half.tax)).toBeLessThanOrEqual(2)
    expect(fundOf(g, 'person')).not.toBeNull()
    const rest = takeQuote(g, fundOf(g, 'person')!.f, 1)
    expect(rest.closes).toBe(true)
    const cashLeft = g.character.money
    expect(takeOut(g, personal.a.id, 1)).toBe(true)
    expect(Math.abs(g.character.money - cashLeft - (rest.gross - rest.tax))).toBeLessThanOrEqual(1)
    expect(fundOf(g, 'person')).toBeNull()
    expect(g.assets.some((a) => a.id === personal.a.id)).toBe(false)

    // 5. You die. The only adult heir is your child, so the family fund goes to her whole and the sister stays in it.
    const fund = fundOf(g, 'family')!
    const sisUnits = fund.f.holders[0].units
    const mine = fund.f.mine
    const value = fund.a.value
    const sisMoneyAtDeath = sis.money
    expect(inLineIds(g)).toEqual([child.id])
    killCharacter(g, 'Old Age')
    g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
    const n = continueAsChild(g, child.id)
    expect(n.character.id).toBe(child.id)
    const kept = fundOf(n, 'family')
    expect(kept).not.toBeNull()
    expect(kept!.a.id).toBe(fund.a.id)
    expect(kept!.a.value).toBe(value)
    expect(kept!.f.mine).toBeCloseTo(mine, 6)
    expect(kept!.f.holders.map((h) => h.id)).toEqual([sis.id])
    expect(kept!.f.holders[0].units).toBeCloseTo(sisUnits, 6)
    expect(n.people.find((p) => p.id === sis.id)?.money).toBe(sisMoneyAtDeath)
    expect(n.queue.some((m) => m.kind === 'notice' && m.text.includes('was wound up'))).toBe(false)

    // The heir finds it in Investments, Hedge Funds.
    const node = hedgeRow(n).children(n).find((x) => x.id === `inv-hedge-${fund.a.id}`)
    expect(node?.type).toBe('menu')
    const screen = (node as MenuGroup).children(n)
    expect(texts(n, screen)[0]).toMatch(/^Your share: .+ of .+ \(\d+(\.\d)?%\)$/)

    // A further birthday books it once, with the sister's units untouched.
    birthday(n)
    const now = fundOf(n, 'family')!
    expect(now.f.lastYear).toBe(n.year)
    expect(now.f.marks).toHaveLength(4)
    expect(now.f.holders.map((h) => h.id)).toEqual([sis.id])
    expect(now.f.holders[0].units).toBeCloseTo(sisUnits, 6)
    expect(popups(n)).toHaveLength(1)
    const after = JSON.stringify(n)
    const rng = n.rng
    yearlyHedge(n)
    expect(JSON.stringify(n)).toBe(after)
    expect(n.rng).toBe(rng)

    // The real yearly loop books it as well, once, and the sister is still in.
    n.queue = []
    ageUp(n)
    const looped = fundOf(n, 'family')!
    expect(looped.f.lastYear).toBe(n.year)
    expect(looped.f.marks).toHaveLength(5)
    expect(looped.f.holders.map((h) => h.id)).toEqual([sis.id])
    expect(popups(n)).toHaveLength(1)
  })

  it('a Personal fund that ends behind pays no tax and adds to the carried loss', () => {
    // This seed's Personal fund is down after three years.
    const story = opened(71)
    threeYears(story)
    const { g } = story
    const personal = fundOf(g, 'person')!
    const cash = g.character.money
    const carried = lossCarry(g)
    const half = takeQuote(g, personal.f, 0.5)
    expect(half.gain).toBeLessThan(0)
    expect(half.tax).toBe(0)
    expect(takeOut(g, personal.a.id, 0.5)).toBe(true)
    expect(Math.abs(g.character.money - cash - half.gross)).toBeLessThanOrEqual(1)
    expect(lossCarry(g)).toBeGreaterThan(carried)
  })
})
