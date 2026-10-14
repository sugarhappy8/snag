// The yearly dividend through the real age-up (every yearly hook in order, not just the business step),
// and for a board the owner does not control. The other dividend tests call the business step directly;
// this one pins how the pieces behave when the whole year runs.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { ageUp } from '../src/game/aging'
import { boardOf, boardView } from '../src/game/business/board-state'
import { reserveDollars } from '../src/game/business/board-vote'
import { bestPlan, refreshValue, valuationOf } from '../src/game/business/economy'
import { dividendFloor } from '../src/game/business/dividend-year'
import { bizOf, findBusiness, type BizState } from '../src/game/business/state'
import { num } from '../src/game/business/util'
import type { Asset, GameState, NoticeModal } from '../src/game/types'
import { founder, privateCompany } from './own-listing-kit'

/** A private company that plans its year (a small profit) and holds plenty of cash, so the rule has room to pay. */
function funded(g: GameState, cash = 500e6): { a: Asset; b: BizState } {
  const { a, b } = privateCompany(g, 'us', 'Quiet Co')
  const plan = bestPlan(g, b)
  b.price = plan.price
  b.production = plan.production
  b.cash = cash
  b.debt = 0
  b.ownerSalary = 0
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  return { a, b }
}

function dividendNotices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === 'Dividends')
}

function paidLines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text)).filter((t) => /paid me .* in dividends\./.test(t))
}

describe('the yearly dividend through a whole age-up', () => {
  it('pays once, is taxed in the same age-up and queues one popup', () => {
    const g = founder()
    const { a, b } = funded(g)
    const control = structuredClone(g)
    b.dividend = { mode: 'cash', pct: 0.5, keep: 3 }
    g.queue = []
    control.queue = []
    ageUp(g)
    ageUp(control)
    const cur = bizOf(g, a)
    const last = cur.dividend?.last
    expect(last).toBeDefined()
    if (!last) return
    expect(last.year).toBe(g.year - 1)
    expect(last.mine).toBeGreaterThan(0)
    // One log line and one popup, the popup carrying the year's id and the tax estimate.
    expect(paidLines(g)).toHaveLength(1)
    const popups = dividendNotices(g)
    expect(popups).toHaveLength(1)
    expect(popups[0].id).toBe(`div-${g.generation}-${g.year}`)
    expect(popups[0].text).toContain('Income tax takes about')
    // The dividend is income of the new year, and the finance step of the same age-up taxes it. The same
    // life without the rule pays none of that tax.
    expect(num(g.flags.taxesPaid)).toBeGreaterThan(num(control.flags.taxesPaid))
    expect(dividendNotices(control)).toHaveLength(0)
    expect(paidLines(control)).toHaveLength(0)
    const same = findBusiness(control, a.id)
    expect(same).toBeDefined()
    if (same) expect('dividend' in bizOf(control, same)).toBe(false)
    // What stayed in the company is at least the floor.
    expect(cur.cash).toBeGreaterThanOrEqual(dividendFloor(g, a, cur, 3) - 1)
  })

  it('pays again each age-up, one popup a year, each with its own id', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.dividend = { mode: 'cash', pct: 0.5, keep: 3 }
    const ids: string[] = []
    for (let n = 0; n < 3; n++) {
      g.queue = []
      ageUp(g)
      const cur = bizOf(g, a)
      expect(cur.dividend?.last?.year).toBe(g.year - 1)
      const popups = dividendNotices(g)
      expect(popups).toHaveLength(1)
      ids.push(popups[0].id)
      expect(cur.cash).toBeGreaterThanOrEqual(dividendFloor(g, a, cur, 3) - 1)
    }
    expect(new Set(ids).size).toBe(3)
    expect(paidLines(g)).toHaveLength(3)
  })

  it('a rule saved and loaded between age-ups keeps paying', () => {
    const g = founder()
    const { a, b } = funded(g)
    b.dividend = { mode: 'cash', pct: 0.5, keep: 3 }
    g.queue = []
    ageUp(g)
    const loaded: GameState = JSON.parse(JSON.stringify(g))
    loaded.queue = []
    ageUp(loaded)
    const kept = findBusiness(loaded, a.id)
    expect(kept).toBeDefined()
    if (!kept) return
    expect(bizOf(loaded, kept).dividend?.last?.year).toBe(loaded.year - 1)
    expect(dividendNotices(loaded)).toHaveLength(1)
  })
})

describe('a board the owner does not control', () => {
  it('is never asked, and the payout stays above its reserve', () => {
    const g = founder()
    const { a, b } = funded(g)
    // Investors hold 70%: they control the board, and the owner cannot vote a dividend through.
    b.share = 0.3
    refreshValue(a, b)
    b.dividend = { mode: 'cash', pct: 1, keep: 0 }
    boardOf(b).limits.reserve = 6
    g.queue = []
    ageUp(g)
    const cur = bizOf(g, a)
    const last = cur.dividend?.last
    expect(last).toBeDefined()
    expect(last?.year).toBe(g.year - 1)
    // No dividend vote was held or recorded, however the year's other votes went.
    expect(boardOf(cur).votes.filter((v) => /dividend/i.test(v.what))).toHaveLength(0)
    // Even at 100% of the spare cash and no floor of its own, the board's reserve stays in the company.
    expect(cur.cash).toBeGreaterThanOrEqual(reserveDollars(cur, boardView(g, a, cur)) - 1)
    const popups = dividendNotices(g)
    expect(popups).toHaveLength(1)
    expect(popups[0].text).toContain('Other shareholders got')
  })
})
