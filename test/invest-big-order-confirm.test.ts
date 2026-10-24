// A big order says what it will cost before it is placed, not only after (investments.ts). The Buy and Sell Some rows take an
// amount and used to act at once; the Order Filled notice then told a billionaire that 79% of the money had gone to price impact.
// Now an amount that would lose a quarter or more of the order to price impact asks first, naming the loss. Sell All already asked.
// confirm gets the amount the player typed (menuModel.confirmText passes it), so the question can depend on it.
import { describe, expect, it } from 'vitest'
import { confirmText } from '../src/ui/components/menuModel'
import { buyImpactLimit, buySecurity, investmentHoldings, investmentListing, investmentsMenu } from '../src/game/investments'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function whale(money = 3_000_000_000_000): GameState {
  const g = makeTestGame(8, { age: 50, money, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.lifeId = 'big-order-confirm'
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

const stock = (g: GameState) => investmentListing(g).find((q) => q.type === 'stock')!
const index = (g: GameState) => investmentListing(g).find((q) => q.type === 'index')!

describe('confirmText passes the typed amount on', () => {
  it('to a confirm that reads it, and still works for one that does not', () => {
    const g = whale()
    const reads = { type: 'action', id: 'x', label: 'x', emoji: '❓', run: () => undefined, confirm: (_g: GameState, input?: string) => (input ? `got ${input}` : null) } as MenuAction
    const ignores = { type: 'action', id: 'y', label: 'y', emoji: '❓', run: () => undefined, confirm: () => 'sure?' } as MenuAction
    expect(confirmText(reads, g, '42')).toBe('got 42')
    expect(confirmText(reads, g)).toBeNull()
    expect(confirmText(ignores, g, '42')).toBe('sure?')
  })
})

describe('Buy asks before an order that loses a quarter or more to price impact', () => {
  it('asks for a huge order, names the loss and the size that would not, and says it cannot be split', () => {
    const g = whale()
    const q = stock(g)
    const buy = action(g, `inv-buy-${q.secId}`)
    const text = confirmText(buy, g, '50000000000')
    expect(text).not.toBeNull()
    expect(text).toMatch(/price impact/i)
    expect(text).toMatch(/\d+%/)
    expect(text).toMatch(/Splitting the order does not avoid it/)
    expect(text).toContain('Orders up to about')
  })

  it('does not ask for an ordinary order, nor for one at the 10% mark, nor with no amount', () => {
    const g = whale()
    const q = stock(g)
    const buy = action(g, `inv-buy-${q.secId}`)
    expect(confirmText(buy, g, '1000')).toBeNull()
    expect(confirmText(buy, g, String(Math.round(buyImpactLimit(500_000_000))))).toBeNull()
    expect(confirmText(buy, g)).toBeNull()
    expect(confirmText(buy, g, 'not a number')).toBeNull()
  })

  it('does not ask for a product with no order book', () => {
    const g = whale()
    const buy = action(g, `inv-buy-${index(g).secId}`)
    expect(confirmText(buy, g, '1000000000000')).toBeNull()
  })
})

describe('Sell Some asks before a sale that loses a quarter or more to price impact', () => {
  it('asks for a sale of the whole of a big position and names the impact and what comes back', () => {
    const g = whale()
    const q = stock(g)
    expect(buySecurity(g, q.secId, 5_000_000_000, true)).toBe(true)
    const held = investmentHoldings(g)[0]!
    const sell = action(g, `inv-sell-${held.id}`)
    // The row's own maximum is what a sale is sized on (the position's value at the quote).
    const text = confirmText(sell, g, String(sell.input!.max))
    expect(text).not.toBeNull()
    expect(text).toMatch(/price impact/i)
    expect(text).toMatch(/\d+%/)
    expect(text).toMatch(/Sell anyway\?/)
  })

  it('does not ask for a small slice', () => {
    const g = whale()
    const q = stock(g)
    expect(buySecurity(g, q.secId, 1_000_000, true)).toBe(true)
    const held = investmentHoldings(g)[0]!
    const sell = action(g, `inv-sell-${held.id}`)
    expect(confirmText(sell, g, '1000')).toBeNull()
    expect(confirmText(sell, g)).toBeNull()
  })
})
