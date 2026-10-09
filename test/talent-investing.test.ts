// The Investing talent: a once-a-year gut feeling about which stocks, funds, coins or gold rise
// next year (purple hints in Investments and on the computer's trading screens). Right most of
// the time, never always, stable for the year, and no way to turn it into a sure thing.
import { describe, expect, it } from 'vitest'
import { moneyState, readState, sharpSpread } from '../src/game/computer/money-common'
import { optionPrice, optionsMenu } from '../src/game/computer/money-options'
import { stockBetsMenu } from '../src/game/computer/money-stocks'
import { exchangeInfo } from '../src/game/invest/engine'
import { CLARITY, marketInstinct } from '../src/game/invest/instinct'
import { buySecurity, investmentHoldings, investmentListing, investmentsMenu, liquidatePortfolio, yearlyInvestments } from '../src/game/investments'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function investor(seed: number, countryId: string, talent: boolean, lifeId = `inv-${countryId}-${seed}`): GameState {
  const g = makeTestGame(seed, { age: 30, countryId, money: 1_000_000, talents: talent ? ['Investing'] : undefined })
  g.lifeId = lifeId
  return g
}

function group(nodes: MenuNode[], id: string): MenuGroup {
  const n = nodes.find((x) => x.id === id)
  if (!n || n.type !== 'menu') throw new Error(`no group ${id}`)
  return n
}

function hintsIn(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.flatMap((n) => (n.type === 'menu' || n.type === 'action' ? [n.hint?.(g) ?? ''] : [])).filter(Boolean)
}

/** Every security's change over the next year, measured by actually holding it through the age-up. */
function nextYearChanges(g: GameState): Map<string, number> {
  const h = structuredClone(g)
  h.character.money = 1e12
  for (const q of investmentListing(h)) if (q.type !== 'bond' && q.type !== 'savings') buySecurity(h, q.secId, 10_000)
  const ids = investmentHoldings(h).map((a) => String(a.details.secId))
  h.queue = []
  h.year += 1
  h.character.age += 1
  yearlyInvestments(h)
  const out = new Map<string, number>()
  for (const id of ids) {
    const a = investmentHoldings(h).find((x) => String(x.details.secId) === id)
    out.set(id, a ? Number(a.details.lastChange ?? 0) : -1)
  }
  return out
}

describe('Investing talent: hints', () => {
  it('appear only with the talent', () => {
    const plain = investor(1, 'us', false)
    expect(marketInstinct(plain)).toBeNull()
    const top = investmentsMenu.children(plain)
    expect(top.some((n) => n.id === 'inv-instinct')).toBe(false)
    expect(hintsIn(plain, top)).toHaveLength(0)
    expect(hintsIn(plain, group(top, 'inv-stocks').children(plain))).toHaveLength(0)

    // Find a year where the gut likes a stock, and check the hint shows on it.
    const g = investor(1, 'us', true)
    let found = false
    for (let y = 0; y < 30 && !found; y++, g.year++, g.character.age++) {
      const inst = marketInstinct(g)!
      const nodes = investmentsMenu.children(g)
      const row = nodes.find((n) => n.id === 'inv-instinct')
      expect(row?.type).toBe('info')
      expect(row && row.type === 'info' && typeof row.text === 'string' ? row.text : '').toMatch(new RegExp(`Market instinct for ${inst.year}`))
      const stock = inst.picks.find((p) => p.kind === 'stock')
      if (!stock) continue
      found = true
      const stocks = group(nodes, 'inv-stocks')
      expect(stocks.hint?.(g)).toMatch(/^\u{1F52E} Your gut likes/u)
      const rows = stocks.children(g)
      const hinted = rows.filter((n) => n.type === 'menu' && n.hint?.(g))
      // The gut can like more than one stock in a year (hub exchanges also list deep-tech names).
      const wanted = inst.picks.filter((p) => p.kind === 'stock').map((p) => `inv-offer-${p.secId}`)
      expect(hinted.map((n) => n.id).sort()).toEqual(wanted.sort())
      expect(hinted.map((n) => n.id)).toContain(`inv-offer-${stock.secId}`)
    }
    expect(found).toBe(true)
  })

  it('are decided once a year: reopening menus never rerolls them or touches the dice', () => {
    const g = investor(2, 'jp', true)
    const rng = g.rng
    const a = marketInstinct(g)
    investmentsMenu.children(g)
    const b = marketInstinct(structuredClone(g))
    expect(b).toEqual(a)
    expect(g.rng).toBe(rng)
    // A new year brings a new feeling (eventually different picks).
    const later = structuredClone(g)
    const seen = new Set<string>()
    for (let y = 0; y < 6; y++, later.year++, later.character.age++) seen.add(JSON.stringify(marketInstinct(later)!.picks))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('are right far more often than chance, but not always', () => {
    let right = 0
    let picks = 0
    let base = 0
    let all = 0
    for (const cid of ['us', 'gb', 'jp', 'br', 'in', 'za']) {
      for (let life = 0; life < 3; life++) {
        const g = investor(10 + life, cid, true)
        for (let y = 0; y < 12; y++, g.year++, g.character.age++) {
          const inst = marketInstinct(g)!
          const changes = nextYearChanges(g)
          for (const [, r] of changes) {
            all++
            if (r > 0) base++
          }
          for (const p of inst.picks) {
            const r = changes.get(p.secId)
            if (r === undefined) continue
            picks++
            if (r > 0) right++
          }
        }
      }
    }
    const precision = right / picks
    expect(picks).toBeGreaterThan(100)
    expect(precision).toBeGreaterThan(0.72)
    expect(precision).toBeLessThan(0.92)
    expect(precision).toBeGreaterThan(base / all + 0.12)
  })

  it('say nothing looks good in bad years (gold aside)', { timeout: 60_000 }, () => {
    let bad = 0
    let gloomy = 0
    for (const cid of ['us', 'de', 'br', 'in']) {
      for (let life = 0; life < 4; life++) {
        const g = investor(30 + life, cid, true)
        for (let y = 0; y < 20; y++, g.year++, g.character.age++) {
          const inst = marketInstinct(g)!
          if (inst.gloomy) {
            expect(inst.picks.every((p) => p.kind === 'gold')).toBe(true)
            const row = investmentsMenu.children(g).find((n) => n.id === 'inv-instinct')
            expect(row && row.type === 'info' && typeof row.text === 'string' ? row.text : '').toMatch(/nothing looks good next year/)
          }
          const changes = [...nextYearChanges(g).entries()].filter(([id]) => !id.startsWith('crypto#') && !id.includes('#p'))
          const ups = changes.filter(([, r]) => r > 0).length / Math.max(1, changes.length)
          if (ups <= 0.2) {
            bad++
            if (inst.gloomy) gloomy++
          }
        }
      }
    }
    expect(bad).toBeGreaterThan(3)
    expect(gloomy / bad).toBeGreaterThan(0.6)
  })

  it('cannot be turned into guaranteed profit', () => {
    let losingYears = 0
    let years = 0
    let wrongPicks = 0
    for (const cid of ['us', 'jp', 'br', 'in']) {
      for (let life = 0; life < 3; life++) {
        const g = investor(50 + life, cid, true)
        g.character.money = 100_000
        for (let y = 0; y < 15; y++) {
          const inst = marketInstinct(g)!
          const before = g.character.money
          if (inst.picks.length) {
            for (const p of inst.picks) buySecurity(g, p.secId, Math.floor(before / inst.picks.length) - 50)
          }
          const changes = new Map(investmentHoldings(g).map((a) => [String(a.details.secId), a.value]))
          g.queue = []
          g.year += 1
          g.character.age += 1
          g.flags.taxableIncome = 0
          yearlyInvestments(g)
          for (const [id, v0] of changes) {
            const a = investmentHoldings(g).find((x) => String(x.details.secId) === id)
            if (!a || a.value < v0) wrongPicks++
          }
          if (investmentHoldings(g).length) liquidatePortfolio(g)
          g.queue = []
          years++
          if (g.character.money < before) losingYears++
          expect(Number.isFinite(g.character.money)).toBe(true)
        }
      }
    }
    expect(wrongPicks).toBeGreaterThan(0)
    expect(losingYears).toBeGreaterThan(0)
    expect(losingYears).toBeLessThan(years)
  })

  it("feels meme coins and penny stocks less clearly than the market, and keeps at most one", () => {
    expect(CLARITY.crypto).toBeLessThan(CLARITY.stock)
    expect(CLARITY.penny).toBeLessThan(CLARITY.index)
    for (let y = 0; y < 40; y++) {
      const g = investor(70, 'us', true)
      g.year += y
      g.character.age += y
      const wild = marketInstinct(g)!.picks.filter((p) => p.kind === 'crypto' || p.kind === 'penny')
      expect(wild.length).toBeLessThanOrEqual(1)
    }
  })

  it('has no feelings about coins where crypto is banned, and nothing for kids or prisoners', () => {
    for (let y = 0; y < 30; y++) {
      const g = investor(71, 'cn', true)
      g.year += y
      g.character.age += y
      expect(marketInstinct(g, false)!.picks.some((p) => p.kind === 'crypto')).toBe(false)
    }
    const kid = investor(72, 'us', true)
    kid.character.age = 12
    expect(investmentsMenu.children(kid).some((n) => n.id === 'inv-instinct')).toBe(false)
  })
})

describe('Investing talent: the computer trading screens', () => {
  function trader(seed: number, talent: boolean): GameState {
    const g = investor(seed, 'us', talent)
    const st = moneyState(g)
    st.broker = 'Summit Securities'
    g.assets.push({ id: 'pc1', kind: 'other', name: 'Laptop', emoji: '\u{1F4BB}', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: 25, upkeep: 0, details: { category: 'electronics' } })
    return g
  }

  it('hint the direction the gut favors, and only with the talent', () => {
    const plain = trader(80, false)
    const rowsPlain = optionsMenu().children(plain)
    expect(rowsPlain.some((n) => n.id === 'computer.options.instinct')).toBe(false)

    let hinted = 0
    for (let y = 0; y < 12; y++) {
      const g = trader(80, true)
      g.year += y
      g.character.age += y
      const rows = optionsMenu().children(g)
      expect(rows.some((n) => n.id === 'computer.options.instinct')).toBe(true)
      const buy = rows.find((n) => n.id === 'computer.options.buy')
      if (!buy || buy.type !== 'action') continue
      buy.run(g)
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')
      if (!m) continue
      const h = m.choices.filter((c) => c.hint)
      expect(h.length).toBeLessThanOrEqual(1)
      if (h.length) hinted++
    }
    expect(hinted).toBeGreaterThan(0)
    // The single-stock screen names the gut's picks too (when it has any).
    const g = trader(81, true)
    expect(() => stockBetsMenu().children(g)).not.toThrow()
  })

  it('keeps leveraged bets risky: the index call is often wrong and winners pay wider spreads', { timeout: 60_000 }, () => {
    let right = 0
    let calls = 0
    for (const cid of ['us', 'gb', 'jp', 'br']) {
      for (let life = 0; life < 4; life++) {
        const g = investor(90 + life, cid, true)
        for (let y = 0; y < 25; y++, g.year++, g.character.age++) {
          const inst = marketInstinct(g)!
          const down = inst.gloomy || inst.market === 'down'
          if (!down && inst.market !== 'up') continue
          const fund = [...nextYearChanges(g).entries()].find(([id]) => id.endsWith('#fund'))
          if (!fund) continue
          calls++
          if ((fund[1] > 0) === !down) right++
        }
      }
    }
    expect(calls).toBeGreaterThan(50)
    expect(right / calls).toBeGreaterThan(0.6)
    expect(right / calls).toBeLessThan(0.95)

    // A trader who keeps winning gets quoted worse prices; most people never do.
    const g = trader(95, true)
    const st = moneyState(g)
    const info = exchangeInfo('us')
    const fresh = optionPrice(info, 'call', 'atm', st.skill, 'buy', sharpSpread(st))
    st.sharp = 3
    expect(optionPrice(info, 'call', 'atm', st.skill, 'buy', sharpSpread(st))).toBeGreaterThan(fresh * 1.5)
  })

  it('loads old computer-money saves without the sharp score', () => {
    const g = trader(96, false)
    const raw = g.flags.computerMoney as Record<string, unknown>
    delete raw.sharp
    expect(readState(g).sharp).toBe(0)
    expect(moneyState(g).sharp).toBe(0)
    raw.sharp = 'lots'
    expect(moneyState(g).sharp).toBe(0)
  })

  it('never changes a choice resolver: the hinted option runs like any other', () => {
    const g = trader(97, true)
    const rows = optionsMenu().children(g)
    const buy = rows.find((n) => n.id === 'computer.options.buy')
    expect(buy?.type).toBe('action')
    if (buy?.type !== 'action') return
    buy.run(g)
    const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')!
    g.queue = []
    runScript(g, m.scriptId!, 'call', m.data, m)
    expect(g.queue.some((x) => x.kind === 'choice' && x.title === 'Pick a Strike')).toBe(true)
  })
})
