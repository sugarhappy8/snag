// Big buy orders say what they will cost, before and after (investments.ts, display only): the Buy
// action names the size where price impact starts to hurt, the "Order Filled" notice for a large
// order says what was lost on paper and what a full sale returns, and the Investments header says what
// the portfolio would sell for. Impact math, fees, taxes and valuations are unchanged.
import { describe, expect, it } from 'vitest'
import { formatMoney } from '../src/game/core'
import { buyImpact } from '../src/game/invest/liquidity'
import { buyImpactLimit, buySecurity, investmentHoldings, investmentListing, investmentsMenu, sellHolding } from '../src/game/investments'
import type { Asset, GameState, MenuAction, MenuNode, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

function investor(seed = 7, money = 3_000_000_000_000, countryId = 'us'): GameState {
  const g = makeTestGame(seed, { age: 50, money, countryId, residence: { status: 'renting', rent: 0 } })
  g.lifeId = `order-notice-${seed}`
  return g
}

function find(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu' && n.id.startsWith('inv-')) {
      const hit = find(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

function action(g: GameState, id: string): MenuAction {
  const n = find(g, investmentsMenu.children(g), id)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}`)
  return n
}

function subtitle(g: GameState, n: MenuAction): string {
  return typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')
}

const buySubtitle = (g: GameState, secId: string): string => subtitle(g, action(g, `inv-buy-${secId}`))

function firstOf(g: GameState, type: string) {
  const q = investmentListing(g).find((x) => x.type === type)
  if (!q) throw new Error(`no ${type} for sale`)
  return q
}

function lastNotice(g: GameState, title = 'Order Filled'): NoticeModal {
  const n = g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === title).pop()
  if (!n) throw new Error(`no ${title} notice`)
  return n
}

function held(g: GameState): Asset {
  return investmentHoldings(g)[0]
}

/** "$192M" / "$20,000" / "$1.5T" to a number. */
function parseMoney(s: string): number {
  const m = /\$([\d,.]+)([KMBT]?)/.exec(s)
  if (!m) throw new Error(`no money in "${s}"`)
  return Number(m[1].replace(/,/g, '')) * ({ '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[m[2]]
}

const BOILERPLATE = 'Order-book depth affects your execution price; large orders move the market.'

describe('buyImpactLimit: where a buy order starts to lose over 10%', () => {
  it('is the order at which buyImpact returns 90% of the money', () => {
    for (const depth of [5_000, 5_000_000, 500_000_000, 1.2e12, 4e15]) {
      const limit = buyImpactLimit(depth)
      expect(limit).toBeGreaterThan(0)
      expect(buyImpact(limit, depth).value / limit).toBeCloseTo(0.9, 9)
      expect(buyImpact(limit * 0.5, depth).value / (limit * 0.5)).toBeGreaterThan(0.9)
      expect(buyImpact(limit * 2, depth).value / (limit * 2)).toBeLessThan(0.9)
    }
  })

  it('grows with the depth and with a looser share to keep', () => {
    expect(buyImpactLimit(1_000_000)).toBeCloseTo(buyImpactLimit(2_000_000) / 2, 3)
    expect(buyImpactLimit(5e8, 0.8)).toBeGreaterThan(buyImpactLimit(5e8, 0.9))
    expect(buyImpactLimit(5e8, 0.95)).toBeLessThan(buyImpactLimit(5e8, 0.9))
  })

  it('gives 0 for a depth that is not a positive number, and never throws', () => {
    for (const depth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(buyImpactLimit(depth)).toBe(0)
    for (const keep of [0, 1, 2, -1, Number.NaN]) expect(Number.isFinite(buyImpactLimit(5e8, keep))).toBe(true)
  })
})

describe('the Buy action says where price impact starts to hurt', () => {
  it('a stock names the size, close to the depth\'s 90% point', () => {
    const g = investor()
    const q = firstOf(g, 'stock')
    const sub = buySubtitle(g, q.secId)
    expect(sub).toMatch(/Orders above about \$[\d,.]+[KMBT]? lose over 10% to price impact/)
    const shown = parseMoney(sub.split('Orders above about')[1])
    const limit = buyImpactLimit(500_000_000)
    // The order includes the broker's fee on top of what reaches the market; the number is rounded.
    expect(shown).toBeGreaterThan(limit * 0.99)
    expect(shown).toBeLessThan(limit * 1.03)
    // The old parts are still there, in front.
    expect(sub).toMatch(/^Broker fee .* · Minimum \$100 · Orders above/)
  })

  it('a penny stock and a coin name their own, much smaller, sizes', () => {
    const g = investor(8)
    const stock = parseMoney(buySubtitle(g, firstOf(g, 'stock').secId).split('Orders above about')[1])
    const penny = firstOf(g, 'penny')
    const pennySub = buySubtitle(g, penny.secId)
    expect(pennySub).toMatch(/Orders above about .* lose over 10% to price impact/)
    const pennyLimit = parseMoney(pennySub.split('Orders above about')[1])
    expect(pennyLimit).toBeGreaterThan(buyImpactLimit(5_000_000) * 0.99)
    expect(pennyLimit).toBeLessThan(buyImpactLimit(5_000_000) * 1.06)
    expect(pennyLimit).toBeLessThan(stock / 20)
    const coin = investmentListing(g).find((x) => x.type === 'crypto')
    if (coin) expect(buySubtitle(g, coin.secId)).toMatch(/Orders above about .* lose over 10% to price impact/)
  })

  it('a product without an order book gets no clause', () => {
    const g = investor(9)
    for (const type of ['index', 'bond', 'savings', 'gold']) {
      const q = investmentListing(g).find((x) => x.type === type)
      if (!q) continue
      const sub = buySubtitle(g, q.secId)
      expect(sub, type).not.toMatch(/price impact|Orders above/)
      expect(sub, type).toMatch(/Minimum/)
    }
  })

  it('"Buy More" on a holding names it too, in the holding screen', () => {
    const g = investor(10, 1_000_000_000)
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 1_000_000)).toBe(true)
    const a = held(g)
    const hold = find(g, investmentsMenu.children(g), `inv-hold-${a.id}`)
    expect(hold?.type).toBe('menu')
    const buy = (hold as Extract<MenuNode, { type: 'menu' }>).children(g).find((n) => n.id === `inv-buy-${q.secId}`) as MenuAction
    expect(subtitle(g, buy)).toMatch(/Orders above about .* lose over 10% to price impact/)
  })

  it('stays readable: no NaN, no negative sizes, and the voice rules (no em-dash)', () => {
    const g = investor(11, 50)
    for (const type of ['stock', 'penny', 'crypto']) {
      const q = investmentListing(g).find((x) => x.type === type)
      if (!q) continue
      const sub = buySubtitle(g, q.secId)
      expect(sub).not.toMatch(/NaN|undefined|Infinity|-\$|—/)
    }
  })
})

describe('the Order Filled notice', () => {
  it('a small order keeps today\'s text exactly', () => {
    const g = investor(12, 1_000_000)
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 100)).toBe(true)
    const a = held(g)
    const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const shape = new RegExp(`^You bought [\\d.,]+ shares of ${escaped(q.name)} \\(${escaped(q.symbol)}\\) for \\$100\\.( \\$\\d+ went to fees\\.)? ${escaped(BOILERPLATE)} Your position is now worth ${escaped(formatMoney(a.value))}\\.$`)
    expect(lastNotice(g).text).toMatch(shape)
    expect(lastNotice(g).text).not.toMatch(/full sale|on paper/)
  })

  it('an order up to the 90% point keeps the old text; one past it says what it cost', () => {
    const limit = buyImpactLimit(500_000_000)
    const g1 = investor(13, 100_000_000_000)
    const q = firstOf(g1, 'stock')
    expect(buySecurity(g1, q.secId, Math.round(limit * 0.9))).toBe(true)
    expect(lastNotice(g1).text).toContain(BOILERPLATE)
    expect(lastNotice(g1).text).not.toMatch(/full sale/)

    const g2 = investor(13, 100_000_000_000)
    expect(buySecurity(g2, q.secId, Math.round(limit * 1.12))).toBe(true)
    const text = lastNotice(g2).text
    expect(text).not.toContain(BOILERPLATE)
    expect(text).toMatch(/on paper it lost (1[0-9]|[2-9][0-9])(\.\d)?% of what you paid/)
    expect(text).toMatch(/A full sale would return about \$[\d,]+, before tax\./)
    expect(text).toMatch(/Your position is now worth \$[\d,]+\.$/)
  })

  it('a 2 trillion order states the share lost and what selling it all returns, and that is what selling returns', () => {
    const g = investor()
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 2_000_000_000_000)).toBe(true)
    const text = lastNotice(g).text
    const a = held(g)
    expect(text).not.toContain(BOILERPLATE)
    expect(text).toMatch(/on paper it lost 99\.\d% of what you paid\./)
    expect(text).toContain(`Your position is now worth ${formatMoney(a.value)}.`)
    // It is the Sell All estimate: the same figure the Sell All row shows ...
    const sellAll = subtitle(g, action(g, `inv-sellall-${a.id}`))
    const estimate = /About (.+?) after fees and price impact, before tax/.exec(sellAll)![1]
    expect(text).toContain(`A full sale would return about ${estimate}, before tax.`)
    // ... and what the sale really pays (a loss, so no tax comes off).
    const before = g.character.money
    expect(sellHolding(g, a.id, 'all')).toBe(true)
    const gained = g.character.money - before
    expect(formatMoney(gained)).toBe(estimate)
    expect(gained / 2_000_000_000_000).toBeGreaterThan(0.97)
    expect(gained / 2_000_000_000_000).toBeLessThan(1)
  })

  it('a buy on top of a small holding is judged on the new order alone', () => {
    const g = investor(14, 100_000_000_000)
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 1_000_000)).toBe(true)
    expect(buySecurity(g, q.secId, 2_000_000)).toBe(true)
    expect(lastNotice(g).text).toContain(BOILERPLATE)
    expect(buySecurity(g, q.secId, 20_000_000_000)).toBe(true)
    expect(lastNotice(g).text).toMatch(/full sale would return about/)
  })

  it('products with no order book never get the impact sentence, however large', () => {
    const g = investor(15, 1_000_000_000_000)
    for (const type of ['index', 'bond', 'gold']) {
      const q = investmentListing(g).find((x) => x.type === type)
      if (!q) continue
      expect(buySecurity(g, q.secId, 100_000_000_000), type).toBe(true)
      expect(lastNotice(g).text, type).not.toMatch(/full sale|on paper/)
    }
  })

  it('impact math, fees and valuation are unchanged (numbers measured before this change)', () => {
    const g = investor()
    const q = firstOf(g, 'stock')
    expect(q.name).toBe('JPMorgan Chase')
    expect(buySecurity(g, q.secId, 2_000_000_000_000)).toBe(true)
    const a = held(g)
    expect(a.value).toBe(6_485_033_319)
    expect(g.character.money).toBe(1_000_000_000_000)
    expect(subtitle(g, action(g, `inv-sellall-${a.id}`))).toBe('About $1,971,926,940,048 after fees and price impact, before tax')
    expect(lastNotice(g).text).toContain('$3,200,000,000 went to fees.')
  })
})

describe('the Investments header', () => {
  it('a lifted position says what the portfolio sells for, and keeps the marked figures', () => {
    const g = investor()
    const q = firstOf(g, 'stock')
    expect(investmentsMenu.header!(g)).not.toMatch(/Sells for/)
    expect(buySecurity(g, q.secId, 2_000_000_000_000)).toBe(true)
    const a = held(g)
    const header = investmentsMenu.header!(g)
    const top = header.split('\n')[0]
    expect(top).toContain(`Portfolio: ${formatMoney(a.value)} · Loss: ${formatMoney(2_000_000_000_000 - a.value)} (-99.7%)`)
    expect(top).toMatch(/ · Sells for about \$1,971,926,940,048$/)
    // The rest of the header is as it was.
    expect(header.split('\n')).toHaveLength(3)
    expect(header).toMatch(/\nCash: \$1,000,000,000,000 · Broker fee/)
  })

  it('a small position adds nothing', () => {
    const g = investor(16, 1_000_000)
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 10_000)).toBe(true)
    expect(investmentsMenu.header!(g)).not.toMatch(/Sells for/)
    const p = investor(16, 1_000_000)
    expect(buySecurity(p, firstOf(p, 'penny').secId, 10_000)).toBe(true)
    expect(investmentsMenu.header!(p)).not.toMatch(/Sells for/)
    expect(investmentsMenu.header!(investor(16))).not.toMatch(/Sells for/)
  })

  it('shows up past a 5% difference and not before, measured on the early penalty of a term deposit', () => {
    for (const [rate, shown] of [[0.04, false], [0.0499, false], [0.0501, true], [0.07, true]] as const) {
      const g = investor(17, 1_000_000)
      const term = investmentListing(g).find((x) => x.name.includes('Term Deposit'))
      expect(term, 'a term deposit is for sale').toBeDefined()
      expect(buySecurity(g, term!.secId, 100_000)).toBe(true)
      const a = held(g)
      a.details.yield = rate
      const top = investmentsMenu.header!(g).split('\n')[0]
      if (!shown) {
        expect(top, String(rate)).not.toMatch(/Sells for/)
        continue
      }
      const m = /Sells for about \$([\d,]+)$/.exec(top)
      expect(m, String(rate)).not.toBeNull()
      expect(Math.abs(Number(m![1].replace(/,/g, '')) - a.value * (1 - rate))).toBeLessThanOrEqual(2)
    }
  })

  it('counts every holding: a lifted position next to a safe one', () => {
    const g = investor(18, 5_000_000_000_000)
    const stocks = investmentListing(g).filter((x) => x.type === 'stock')
    expect(buySecurity(g, stocks[1].secId, 2_000_000_000_000)).toBe(true)
    const lifted = held(g)
    const before = investmentsMenu.header!(g).split('\n')[0]
    expect(buySecurity(g, firstOf(g, 'savings').secId, 50_000_000)).toBe(true)
    const after = investmentsMenu.header!(g).split('\n')[0]
    const sells = (s: string): number => parseMoney(/Sells for about (\$[\d,]+)/.exec(s)![1])
    expect(sells(after) - sells(before)).toBeGreaterThan(49_000_000)
    expect(sells(after) - sells(before)).toBeLessThan(50_000_001)
    expect(lifted.value).toBeGreaterThan(0)
  })

  it('never prints NaN, whatever a damaged holding says', () => {
    const g = investor(19, 1_000_000_000)
    expect(buySecurity(g, firstOf(g, 'stock').secId, 100_000_000)).toBe(true)
    const a = held(g)
    for (const bad of [Number.NaN, -5, Number.POSITIVE_INFINITY, 1e300, 'x', null]) {
      a.details.units = bad as never
      expect(investmentsMenu.header!(g)).not.toMatch(/NaN|undefined|Infinity|\[object/)
      a.details.price = bad as never
      expect(investmentsMenu.header!(g)).not.toMatch(/NaN|undefined|Infinity|\[object/)
    }
  })
})

describe('the savings notice', () => {
  it('reads "into savings", and a term deposit "into a term deposit"', () => {
    const g = investor(20, 1_000_000)
    expect(buySecurity(g, firstOf(g, 'savings').secId, 5_000)).toBe(true)
    expect(lastNotice(g).text).toMatch(/^You put \$5,000 into savings for \$5,000\./)
    expect(lastNotice(g).text).not.toMatch(/into a savings/)
    const term = investmentListing(g).find((x) => x.name.includes('Term Deposit'))!
    expect(buySecurity(g, term.secId, 5_000)).toBe(true)
    expect(lastNotice(g).text).toMatch(/^You put \$5,000 into a term deposit for \$5,000\./)
  })
})

describe('other eras and currencies', () => {
  it('the Buy row, the notice and the header stay readable in old years, new ones and strange currencies', () => {
    let checked = 0
    for (const [year, country] of [[1923, 'de'], [1950, 'us'], [1975, 'gb'], [1990, 'jp'], [2008, 'zw'], [2026, 'ng'], [2026, 'gb']] as const) {
      const g = makeTestGame(3, { age: 40, money: 5_000_000_000_000, countryId: country, birthCountryId: country, residence: { status: 'renting', rent: 0 } })
      g.year = year
      g.lifeId = `era-${year}-${country}`
      const q = investmentListing(g).find((x) => x.type === 'stock')
      if (!q) continue
      checked++
      const bad = /NaN|undefined|Infinity|\[object|—/
      const sub = buySubtitle(g, q.secId)
      expect(sub, `${year} ${country}`).toMatch(/Orders above about .* lose over 10% to price impact/)
      expect(sub, `${year} ${country}`).not.toMatch(bad)
      const cash = Math.floor(g.character.money)
      if (!buySecurity(g, q.secId, Math.floor(cash / 2))) continue
      expect(lastNotice(g).text, `${year} ${country}`).not.toMatch(bad)
      expect(investmentsMenu.header!(g), `${year} ${country}`).not.toMatch(bad)
      const a = held(g)
      expect(subtitle(g, action(g, `inv-sellall-${a.id}`)), `${year} ${country}`).not.toMatch(bad)
    }
    expect(checked).toBeGreaterThanOrEqual(4)
  })
})
