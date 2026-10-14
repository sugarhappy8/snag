// Big buy orders say what they will cost, before and after (investments.ts, display only): the Buy
// action and its amount dialog name the size where price impact starts to hurt (and the dialog opens
// below it), the "Order Filled" notice says once what the position is valued at and what a full sale
// returns whenever those differ by more than 5% (the header's rule), and the Investments header says
// what the portfolio would sell for. Impact math, fees, taxes and valuations are unchanged.
import { describe, expect, it } from 'vitest'
import { formatMoney, shortMoney } from '../src/game/core'
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
const MOVED = 'The order moved the price, so on paper it lost'
/** The sale sentence (a deposit is closed, not sold), with the money captured. */
const CASH_OUT = /(?:A full sale|Closing it now) would return about (\$[\d,]+), before tax\.$/

function buyInput(g: GameState, secId: string) {
  const input = action(g, `inv-buy-${secId}`).input
  if (!input) throw new Error('no amount dialog')
  return input
}

/** The broker's rate on a big order, read from the fee line of a throwaway purchase. */
function brokerRate(seed: number, type: string): number {
  const g = investor(seed, 100_000_000_000)
  const q = firstOf(g, type)
  expect(buySecurity(g, q.secId, 10_000_000_000)).toBe(true)
  const fee = parseMoney(/(\$[\d,]+) went to fees/.exec(lastNotice(g).text)![1])
  return fee / 10_000_000_000
}

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

describe('the Buy amount dialog', () => {
  it('names the same size as the row, and opens at or below it when the cash would go past it', () => {
    const g = investor(22)
    const q = firstOf(g, 'stock')
    const sub = buySubtitle(g, q.secId)
    const clause = / · (Orders above about \$[\d,.]+[KMBT]? lose over 10% to price impact)$/.exec(sub)![1]
    const input = buyInput(g, q.secId)
    expect(input.label).toBe(`How much? You have ${formatMoney(g.character.money)}. ${clause}.`)
    const shown = parseMoney(clause)
    const start = Number(input.defaultValue!(g))
    // A quarter of 3 trillion would be far past the mark: the dialog opens on a round amount just under it.
    expect(start).toBeLessThanOrEqual(shown * 1.005)
    expect(start).toBeGreaterThan(shown * 0.9)
    expect(String(start)).toMatch(/^[1-9]\d?0*$/)
    expect(input.placeholder).toBe(String(start))
    // Buying what the dialog offers does not lose over 10% to price impact.
    expect(buySecurity(g, q.secId, start)).toBe(true)
    expect(lastNotice(g).text).not.toContain(MOVED)
    expect(lastNotice(g).text).toContain(BOILERPLATE)
  })

  it('a penny stock (fee plus spread) and a coin open below their own, smaller marks', () => {
    for (const type of ['penny', 'crypto']) {
      const g = investor(23)
      const q = investmentListing(g).find((x) => x.type === type)
      if (!q) continue
      const input = buyInput(g, q.secId)
      const clause = /Orders above about (\$[\d,.]+[KMBT]?) lose over 10% to price impact\.$/.exec(input.label)
      expect(clause, type).not.toBeNull()
      const start = Number(input.defaultValue!(g))
      expect(start, type).toBeLessThanOrEqual(parseMoney(clause![1]) * 1.005)
      expect(buySecurity(g, q.secId, start), type).toBe(true)
      expect(lastNotice(g).text, type).not.toContain(MOVED)
    }
  })

  it('keeps the quarter-of-cash default when the cash cannot reach the mark, and today\'s dialog where there is no order book', () => {
    const small = investor(24, 1_000_000)
    const q = firstOf(small, 'stock')
    const input = buyInput(small, q.secId)
    expect(input.label).toMatch(/^How much\? You have \$1,000,000\. Orders above about .* lose over 10% to price impact\.$/)
    expect(input.defaultValue!(small)).toBe('250000')
    expect(input.placeholder).toBe('250000')
    const rich = investor(24)
    for (const type of ['index', 'bond', 'savings', 'gold']) {
      const p = investmentListing(rich).find((x) => x.type === type)
      if (!p) continue
      const box = buyInput(rich, p.secId)
      expect(box.label, type).toBe(`How much? You have ${formatMoney(rich.character.money)}.`)
      expect(box.defaultValue!(rich), type).toBe(String(Math.round((rich.character.money * 0.25) / 100) * 100))
    }
  })
})

describe('fees and the 10% mark (fees are not price impact)', () => {
  it('the mark is measured on the money that reaches the market: an order whose fee takes it past the mark but whose market money stays under it is not flagged', () => {
    const limit = buyImpactLimit(500_000_000)
    const rate = brokerRate(25, 'stock')
    expect(rate).toBeGreaterThan(0.0005)
    // After the fee, 0.05% under the mark; before the fee, over it.
    const under = Math.floor((limit * 0.9995) / (1 - rate))
    expect(under).toBeGreaterThan(limit)
    const g = investor(25, 100_000_000_000)
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, under)).toBe(true)
    expect(lastNotice(g).text).toContain(`${formatMoney(Math.round(under * rate))} went to fees.`)
    expect(lastNotice(g).text).not.toContain(MOVED)
    // 0.05% over the mark once the fee is out: flagged.
    const over = Math.ceil((limit * 1.0005) / (1 - rate))
    const h = investor(25, 100_000_000_000)
    expect(buySecurity(h, q.secId, over)).toBe(true)
    expect(lastNotice(h).text).toContain(MOVED)
  })

  it('the row\'s size adds the broker\'s fee on top of the market money', () => {
    for (const [type, depth] of [['stock', 500_000_000], ['penny', 5_000_000]] as const) {
      const rate = brokerRate(26, type)
      const g = investor(26)
      const shown = /Orders above about (\$[\d,.]+[KMBT]?) lose/.exec(buySubtitle(g, firstOf(g, type).secId))![1]
      expect(shown, type).toBe(shortMoney(buyImpactLimit(depth) / (1 - rate)))
    }
    // The penny stock's fee and spread (over 2%) are big enough to change the figure shown.
    const rate = brokerRate(26, 'penny')
    expect(rate).toBeGreaterThan(0.02)
    expect(shortMoney(buyImpactLimit(5_000_000))).not.toBe(shortMoney(buyImpactLimit(5_000_000) / (1 - rate)))
  })
})

describe('the Order Filled notice', () => {
  it('a small order keeps today\'s text exactly', () => {
    const g = investor(12, 1_000_000)
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 10_000)).toBe(true)
    const a = held(g)
    const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const shape = new RegExp(`^You bought [\\d.,]+ shares of ${escaped(q.name)} \\(${escaped(q.symbol)}\\) for \\$10,000\\.( \\$\\d+ went to fees\\.)? ${escaped(BOILERPLATE)} Your position is now worth ${escaped(formatMoney(a.value))}\\.$`)
    expect(lastNotice(g).text).toMatch(shape)
    expect(lastNotice(g).text).not.toMatch(/full sale|valued at|on paper/i)
  })

  it('a tiny order whose minimum fee is over 5% of it says what a full sale returns, as the header does', () => {
    const g = investor(12, 1_000_000)
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 100)).toBe(true)
    const a = held(g)
    const text = lastNotice(g).text
    // The fee is not price impact: the order itself did not move the price.
    expect(text).toContain(BOILERPLATE)
    expect(text).not.toContain(MOVED)
    expect(text).toContain(` Your position is valued at ${formatMoney(a.value)}.`)
    const m = CASH_OUT.exec(text)
    expect(m).not.toBeNull()
    expect(investmentsMenu.header!(g).split('\n')[0].endsWith(` · Sells for about ${m![1]}`)).toBe(true)
  })

  it('an order up to the 90% point keeps the old price line; one past it says what it cost', () => {
    const limit = buyImpactLimit(500_000_000)
    const g1 = investor(13, 100_000_000_000)
    const q = firstOf(g1, 'stock')
    expect(buySecurity(g1, q.secId, Math.round(limit * 0.9))).toBe(true)
    expect(lastNotice(g1).text).toContain(BOILERPLATE)
    expect(lastNotice(g1).text).not.toContain(MOVED)
    // Its marked value and its sale value are more than 5% apart (the header says so too), so both are given.
    expect(investmentsMenu.header!(g1).split('\n')[0]).toMatch(/Sells for about/)
    expect(lastNotice(g1).text).toMatch(CASH_OUT)

    const g2 = investor(13, 100_000_000_000)
    expect(buySecurity(g2, q.secId, Math.round(limit * 1.12))).toBe(true)
    const text = lastNotice(g2).text
    expect(text).not.toContain(BOILERPLATE)
    expect(text).toMatch(/ The order moved the price, so on paper it lost (1[0-9]|[2-9][0-9])(\.\d)?% of what you paid\./)
  })

  it('a 2 trillion order states the marked value and what a full sale returns, once each and the sale last, and that is what selling returns', () => {
    const g = investor()
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 2_000_000_000_000)).toBe(true)
    const text = lastNotice(g).text
    const a = held(g)
    expect(text).not.toContain(BOILERPLATE)
    // It is the Sell All estimate: the same figure the Sell All row shows ...
    const sellAll = subtitle(g, action(g, `inv-sellall-${a.id}`))
    const estimate = /About (.+?) after fees and price impact, before tax/.exec(sellAll)![1]
    // ... said once, last, after the marked value said once: no "now worth" after the sale figure.
    expect(text.endsWith(` ${MOVED} 99.7% of what you paid. Your position is valued at ${formatMoney(a.value)}. A full sale would return about ${estimate}, before tax.`)).toBe(true)
    expect(text.split(formatMoney(a.value))).toHaveLength(2)
    expect(text.split(estimate)).toHaveLength(2)
    expect(text).not.toMatch(/now worth/)
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
    expect(lastNotice(g).text).toContain(MOVED)
    expect(lastNotice(g).text).toMatch(CASH_OUT)
  })

  it('"Buy More" with a small order on a lifted position still says what a full sale returns', () => {
    const g = investor(14, 3_000_000_000_000)
    const q = firstOf(g, 'stock')
    expect(buySecurity(g, q.secId, 1_000_000_000_000)).toBe(true)
    expect(buySecurity(g, q.secId, 10_000)).toBe(true)
    const a = held(g)
    const text = lastNotice(g).text
    // The new order is small, so it moved nothing worth a sentence ...
    expect(text).not.toContain(MOVED)
    // ... but the position it joined sells for far more than its paper value, and the notice says so.
    expect(text).toContain(` Your position is valued at ${formatMoney(a.value)}.`)
    const m = CASH_OUT.exec(text)
    expect(m).not.toBeNull()
    expect(subtitle(g, action(g, `inv-sellall-${a.id}`))).toBe(`About ${m![1]} after fees and price impact, before tax`)
    expect(text).not.toMatch(/now worth/)
  })

  it('a term deposit whose early penalty is over 5% says what closing it now returns, exactly when the header does', () => {
    const seen = new Set<boolean>()
    for (const rate of [0, 0.02, 0.04, 0.07, 0.1, 0.15]) {
      const g = investor(17, 1_000_000)
      const term = investmentListing(g).find((x) => x.name.includes('Term Deposit'))!
      expect(buySecurity(g, term.secId, 100_000)).toBe(true)
      // The penalty of a deposit topped up is blended from the old yield and today's.
      held(g).details.yield = rate
      expect(buySecurity(g, term.secId, 100_000)).toBe(true)
      const text = lastNotice(g).text
      const shown = /Sells for about/.test(investmentsMenu.header!(g).split('\n')[0])
      seen.add(shown)
      expect(CASH_OUT.test(text), String(rate)).toBe(shown)
      expect(text.includes('valued at'), String(rate)).toBe(shown)
      if (shown) expect(text).toMatch(/Closing it now would return about/)
      expect(text.includes('now worth'), String(rate)).toBe(!shown)
      expect(text).not.toContain(MOVED)
    }
    expect([...seen].sort()).toEqual([false, true])
  })

  it('the notice and the header use one rule: any order, any product, the sale sentence shows exactly when the header line does', () => {
    let shownCount = 0
    let hiddenCount = 0
    for (const [type, amounts] of [
      ['stock', [100, 1_000, 10_000, 5_000_000, 150_000_000, 400_000_000, 50_000_000_000]],
      ['penny', [100, 10_000, 1_000_000, 3_000_000, 50_000_000]],
      ['crypto', [100, 10_000, 1_000_000, 100_000_000]],
      ['index', [100, 10_000, 1_000_000_000]],
      ['gold', [10_000, 1_000_000]],
      ['bond', [10_000, 1_000_000]],
    ] as const) {
      for (const amount of amounts) {
        const g = investor(21, 100_000_000_000)
        const q = investmentListing(g).find((x) => x.type === type)
        if (!q) continue
        if (!buySecurity(g, q.secId, amount)) continue
        const text = lastNotice(g).text
        const shown = / · Sells for about /.test(investmentsMenu.header!(g).split('\n')[0])
        if (shown) shownCount++
        else hiddenCount++
        expect(CASH_OUT.test(text), `${type} ${amount}`).toBe(shown)
        expect(/Your position is now worth \$[\d,]+\.$/.test(text), `${type} ${amount}`).toBe(!shown)
        expect(text, `${type} ${amount}`).not.toMatch(/NaN|undefined|Infinity/)
      }
    }
    expect(shownCount).toBeGreaterThan(0)
    expect(hiddenCount).toBeGreaterThan(0)
  })

  it('products with no order book never get the impact sentence, however large', () => {
    const g = investor(15, 1_000_000_000_000)
    for (const type of ['index', 'bond', 'gold']) {
      const q = investmentListing(g).find((x) => x.type === type)
      if (!q) continue
      expect(buySecurity(g, q.secId, 100_000_000_000), type).toBe(true)
      expect(lastNotice(g).text, type).not.toMatch(/moved the price|full sale|valued at|on paper/i)
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
