// The whole path in one story (own-listing phase 1, task 7): a founder takes a company public, finds it
// in Investments > Stocks, buys more of it from the row, waits a year and sells out from the same row.
// Every step drives the real code from tasks 2-6, so this is a check on how they fit together, not on
// any one of them.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { goPublic } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { isTicker, findBusiness, readBiz, bizOf } from '../src/game/business/state'
import { capTier, TIER_LABEL } from '../src/game/business/own-listing'
import { tickerOf } from '../src/game/business/listing-id'
import { transactEquity } from '../src/game/business/rescue'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { netWorth } from '../src/game/core'
import { investmentHoldings, investmentsMenu } from '../src/game/investments'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { founder } from './own-listing-kit'

const YEAR_REASON = "You've used this company's one ownership move this year, here or in Capital & Ownership."

/** The children of Investments > Stocks, read the way the app reads them. */
function stocksOf(g: GameState): MenuNode[] {
  return (investmentsMenu.children(g).find((n) => n.id === 'inv-stocks') as MenuGroup).children(g)
}

function rowOf(g: GameState, id: string): MenuGroup {
  const row = stocksOf(g).find((n) => n.id === id)
  if (!row || row.type !== 'menu') throw new Error(`no row ${id}`)
  return row
}

function doors(g: GameState, row: MenuGroup): { buy: MenuAction; sell: MenuAction } {
  const actions = row.children(g).filter((n): n is MenuAction => n.type === 'action')
  const buy = actions.find((n) => n.id.startsWith('inv-own-buy-'))
  const sell = actions.find((n) => n.id.startsWith('inv-own-sell-'))
  if (!buy || !sell) throw new Error('the screen has no Buy and Sell')
  return { buy, sell }
}

function infoTexts(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.filter((n): n is MenuInfo => n.type === 'info').map((n) => (typeof n.text === 'string' ? n.text : n.text(g)))
}

describe('a founder lists a company and trades it from Stocks', () => {
  it('a founder lists, buys, waits a year and sells out through Stocks', () => {
    // 1. A US founder's software company earns 30e6 a year for three years and goes public.
    const g = founder(41, 'us')
    const a = createBusinessAsset(g, 'Acme Robotics', newBiz(g, 'software', 'us', 'Chicago', { cash: 5_000_000 }), 1e6)
    g.assets.push(a)
    const b = bizOf(g, a)
    b.history = [g.year - 3, g.year - 2, g.year - 1].map((year) => ({ year, revenue: 120e6, profit: 30e6, tax: 0, units: 1e6, price: 120, staff: 300, valuation: 0, outlets: 1 }))
    goPublic(g, a, b, 25)
    expect(b.public).toBe(true)
    expect(isTicker(b.ticker)).toBe(true)
    const ticker = b.ticker

    // 2. It sits right under the heading for its size, in the list for the exchange it trades on. The
    // IPO lands at about $0.8B, which is a small cap whatever the heading says: match the id.
    const tier = capTier(b.valuation)
    expect(tier).toBe('small')
    const headingId = `inv-stocks-h-${TIER_LABEL[tier]}`
    expect(headingId).toBe('inv-stocks-h-Small-cap')
    const listed = stocksOf(g)
    const at = listed.findIndex((n) => n.id === headingId)
    expect(at).toBeGreaterThanOrEqual(0)
    const heading = listed[at]
    expect(heading.type === 'heading' && heading.label).toBe('Smaller companies')
    expect(listed[at + 1].id).toBe(`inv-own-${a.id}`)
    expect(listed.filter((n) => n.id === `inv-own-${a.id}`)).toHaveLength(1)
    expect((listed[at + 1] as MenuGroup).label).toBe(`${a.name} (${ticker})`)

    // 3. Buy as much as the slider allows.
    const row = rowOf(g, `inv-own-${a.id}`)
    const { buy } = doors(g, row)
    expect(buy.disabledReason?.(g) ?? null).toBeNull()
    const shareBefore = readBiz(g, a).share
    const priceBefore = readBiz(g, a).sharePrice
    const worthBefore = netWorth(g)
    buy.run(g, String(buy.input!.max))
    const bought = readBiz(g, a).share - shareBefore
    expect(bought).toBeGreaterThanOrEqual(0.149)
    expect(bought).toBeLessThanOrEqual(0.15)
    // The market's price stays where it was, nothing was added to the investments, and the buy
    // didn't make you richer on paper.
    expect(readBiz(g, a).sharePrice).toBe(priceBefore)
    expect(investmentHoldings(g)).toEqual([])
    expect(netWorth(g)).toBeLessThanOrEqual(worthBefore)
    // It used the company's one ownership move for the year, so neither door of Capital & Ownership opens.
    expect(buy.disabledReason?.(g)).toBe(YEAR_REASON)
    expect(transactEquity(g, a.id, 'secondary', 1000)).toBe(false)
    expect(transactEquity(g, a.id, 'subscribe', 1000)).toBe(false)

    // 4. A year later, on a save loaded from JSON, nothing has changed about who you are to the row.
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    g.queue = []
    yearlyBusinessImpl(g)
    const next = readBiz(g, a)
    // The yearly pass booked the year for this company, so the row below is read after a real year.
    expect(next.history[next.history.length - 1].year).toBe(g.year - 1)
    expect(next.public).toBe(true)
    expect(next.ticker).toBe(ticker)
    expect(tickerOf(g, a, next)).toBe(ticker)

    const loaded: GameState = JSON.parse(JSON.stringify(g))
    const kept = findBusiness(loaded, a.id)
    expect(kept).toBeDefined()
    const again = rowOf(loaded, `inv-own-${a.id}`)
    expect(again.label).toBe(`${a.name} (${ticker})`)
    expect(infoTexts(loaded, again.children(loaded)).find((t) => t.startsWith('Your stake: '))).toBeDefined()
    const reopened = doors(loaded, again)
    expect(reopened.buy.disabledReason?.(loaded) ?? null).toBeNull()
    expect(reopened.sell.disabledReason?.(loaded) ?? null).toBeNull()

    // 5. Sell all of it from the same screen: the company and its row go, and the sale is announced.
    loaded.queue = []
    reopened.sell.run(loaded, '100')
    expect(loaded.assets.some((x) => x.id === a.id)).toBe(false)
    expect(findBusiness(loaded, a.id)).toBeUndefined()
    expect(stocksOf(loaded).some((n) => n.id === `inv-own-${a.id}`)).toBe(false)
    expect(infoTexts(loaded, again.children(loaded))).toEqual(['You no longer own this.'])
    expect(loaded.queue.some((m) => m.kind === 'notice' && m.title === 'Sold Out')).toBe(true)
  })
})
