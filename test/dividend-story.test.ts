// The whole path in one story (auto-dividends task 6): a founder takes a company public, sets a yearly
// rule from the company screen, finds that buying shares just before year end to collect it loses money,
// is paid and taxed at the next age-up, sees the payout on the Stocks screen, keeps the rule through a
// save, and stops being paid once the shares are sold. Every step drives the real code from tasks 1 to 5,
// so this checks how they fit together, not any one of them.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { autoDividendYear } from '../src/game/business/dividend-year'
import { goPublic } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { refreshValue } from '../src/game/business/economy'
import { businessView } from '../src/game/business/manage'
import { sellOwnShares } from '../src/game/business/own-trade'
import { bizOf, findBusiness, type Statement } from '../src/game/business/state'
import { num } from '../src/game/business/util'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { netWorth } from '../src/game/core'
import { yearlyFinance } from '../src/game/finance'
import { investmentsMenu } from '../src/game/investments'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode, NoticeModal } from '../src/game/types'
import { founder } from './own-listing-kit'

/** A booked year of zeros with a fiscal year and a net profit. */
function stmt(year: number, net: number): Statement {
  return {
    year, demand: 0, sold: 0, produced: 0, spoiled: 0, price: 0, revenue: 0, salesTax: 0, netRevenue: 0, cogs: 0, wages: 0, keyStaff: 0,
    rent: 0, marketing: 0, interest: 0, upkeep: 0, other: 0, otherIncome: 0, ownerPay: 0, pbt: 0, corpTax: 0, net, cashErosion: 0, cycle: 1,
    openFraction: 1, employees: 0,
  }
}

/** One year, as the age-up runs it: the year turns over and the company books the one before. */
function year(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyBusinessImpl(g)
}

function lines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

function dividendNotices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === 'Dividends')
}

function stocksOf(g: GameState): MenuNode[] {
  return (investmentsMenu.children(g).find((n) => n.id === 'inv-stocks') as MenuGroup).children(g)
}

function rowOf(g: GameState, id: string): MenuGroup {
  const row = stocksOf(g).find((n) => n.id === id)
  if (!row || row.type !== 'menu') throw new Error(`no row ${id}`)
  return row
}

function buyDoor(g: GameState, row: MenuGroup): MenuAction {
  const buy = row.children(g).find((n): n is MenuAction => n.type === 'action' && n.id.startsWith('inv-own-buy-'))
  if (!buy) throw new Error('the screen has no Buy')
  return buy
}

function infoTexts(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.filter((n): n is MenuInfo => n.type === 'info').map((n) => (typeof n.text === 'string' ? n.text : n.text(g)))
}

/** A node of the company's Yearly Dividend menu, read the way the company screen reads it. */
function dividendAction(g: GameState, a: Asset, key: string): MenuAction {
  const menu = businessView(g, a).find((n) => n.id === `biz.divpolicy.${a.id}`)
  if (!menu || menu.type !== 'menu') throw new Error('no Yearly Dividend menu')
  const n = menu.children(g).find((x) => x.id === `biz.divpolicy.${key}.${a.id}`)
  if (!n || n.type !== 'action') throw new Error(`no ${key} action`)
  return n
}

describe('a founder sets a yearly dividend on a listed company', () => {
  it('a founder lists, sets a rule, gets paid and is taxed', () => {
    // 1. A US founder's software company earns 30e6 a year for three years and goes public. It holds
    // plenty of cash, and the founder keeps 60% of it.
    const g = founder(41, 'us')
    const a = createBusinessAsset(g, 'Acme Robotics', newBiz(g, 'software', 'us', 'Chicago', { cash: 5_000_000 }), 1e6)
    g.assets.push(a)
    const b = bizOf(g, a)
    b.history = [g.year - 3, g.year - 2, g.year - 1].map((y) => ({ year: y, revenue: 120e6, profit: 30e6, tax: 0, units: 1e6, price: 120, staff: 300, valuation: 0, outlets: 1 }))
    goPublic(g, a, b, 25)
    expect(b.public).toBe(true)
    b.cash = 400e6
    b.share = 0.6
    refreshValue(a, b)

    // 2. From the company screen: Money, Yearly Dividend, Share of Spare Cash at 50%.
    dividendAction(g, a, 'cash').run(g, '50')
    expect(bizOf(g, a).dividend).toEqual({ mode: 'cash', pct: 0.5, keep: 3 })

    // 3. Buying first doesn't pay. Two copies of the game get the same year-end payment; one of them
    // first buys as much as the Stocks slider allows. Both are compared before any tax, so the gap is
    // the price paid over the mark, and the payout moves value from the stake into cash without
    // creating any. (Two direct calls rather than two simulated years: a bigger stake changes the
    // board's seats, and so what the year draws from g.rng.)
    const stay = structuredClone(g)
    const buyer = structuredClone(g)
    const buyerCompany = findBusiness(buyer, a.id)
    expect(buyerCompany).toBeDefined()
    if (!buyerCompany) return
    const buy = buyDoor(buyer, rowOf(buyer, `inv-own-${a.id}`))
    expect(buy.disabledReason?.(buyer) ?? null).toBeNull()
    buy.run(buyer, String(buy.input?.max))
    const boughtShare = bizOf(buyer, buyerCompany).share
    expect(boughtShare).toBeGreaterThan(0.6)
    const stayCompany = findBusiness(stay, a.id)
    expect(stayCompany).toBeDefined()
    if (!stayCompany) return
    const gapBefore = netWorth(stay) - netWorth(buyer)
    expect(gapBefore).toBeGreaterThan(0)
    const s = bizOf(g, a).last ?? stmt(g.year - 1, 30e6)
    const stayPaid = autoDividendYear(stay, stayCompany, bizOf(stay, stayCompany), s)
    const buyerPaid = autoDividendYear(buyer, buyerCompany, bizOf(buyer, buyerCompany), s)
    expect(stayPaid?.kind).toBe('paid')
    expect(buyerPaid?.kind).toBe('paid')
    expect(netWorth(buyer)).toBeLessThan(netWorth(stay))
    // The payout moves value, it doesn't make it: the gap is what it was, to within the share price's
    // rounding to cents on every share.
    const gapAfter = netWorth(stay) - netWorth(buyer)
    expect(Math.abs(gapAfter - gapBefore)).toBeLessThanOrEqual(0.01 * bizOf(g, a).sharesOut + 5)

    // 4. The year, on the game that did not buy: the age-up runs the business hook, then the finance hook.
    const taxes0 = num(g.flags.taxesPaid)
    const money0 = g.character.money
    year(g)
    const cur = bizOf(g, a)
    const last = cur.dividend?.last
    expect(last).toBeDefined()
    if (!last) return
    expect(last.year).toBe(g.year - 1)
    expect(dividendNotices(g)).toHaveLength(1)
    expect(lines(g).filter((t) => /paid me .* in dividends\./.test(t))).toHaveLength(1)
    expect(last.mine).toBeGreaterThan(0)
    expect(g.character.money - money0).toBeGreaterThanOrEqual(last.mine)
    // The per-share figure is what the company paid over the shares it has, to 6 places. (The price
    // itself also moves with the market, so it isn't compared across the year.)
    expect(last.perShare).toBeGreaterThan(0)
    expect(last.perShare).toBe(Math.round((last.paid / cur.sharesOut) * 1e6) / 1e6)
    yearlyFinance(g)
    expect(num(g.flags.taxesPaid)).toBeGreaterThan(taxes0)
    // The Stocks screen shows it.
    const shown = infoTexts(g, rowOf(g, `inv-own-${a.id}`).children(g)).find((t) => t.startsWith('Last dividend: '))
    expect(shown).toBeDefined()
    expect(shown).toMatch(new RegExp(`for ${last.year}`))

    // 5. A save keeps the rule, the row still shows it, and the next year pays again.
    const loaded: GameState = JSON.parse(JSON.stringify(g))
    const kept = findBusiness(loaded, a.id)
    expect(kept).toBeDefined()
    if (!kept) return
    expect(bizOf(loaded, kept).dividend).toEqual(cur.dividend)
    expect(infoTexts(loaded, rowOf(loaded, `inv-own-${a.id}`).children(loaded)).some((t) => t.startsWith('Last dividend: '))).toBe(true)
    year(loaded)
    const second = bizOf(loaded, kept).dividend?.last
    expect(second?.year).toBe(last.year + 1)
    expect(second?.mine).toBeGreaterThan(0)
    expect(dividendNotices(loaded)).toHaveLength(1)

    // 6. Sell out through Stocks: the company goes, and the next year pays and says nothing.
    expect(sellOwnShares(loaded, a.id, 1)).toBe(true)
    expect(findBusiness(loaded, a.id)).toBeUndefined()
    year(loaded)
    expect(dividendNotices(loaded)).toHaveLength(0)
    expect(lines(loaded).filter((t) => /paid me .* in dividends\./.test(t))).toHaveLength(2)
  })
})
