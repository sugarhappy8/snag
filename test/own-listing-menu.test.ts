// Your listed companies in Investments > Stocks: the row, the company screen and the two doors on it
// (own-listing phase 1, task 6). The file imports the business module because that is how the app
// registers the provider with the engine's Stocks menu.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { sellGroupShares } from '../src/game/business/conglomerate-actions'
import { groupById, liveGroup, saveGroup, sharePriceOf } from '../src/game/business/conglomerate-state'
import { tickerOf } from '../src/game/business/listing-id'
import { ownListingNode, ownStockRows } from '../src/game/business/own-listing-menu'
import { ownListings } from '../src/game/business/own-listing'
import { buyQuote, controlsWith } from '../src/game/business/own-trade'
import { ownerControls } from '../src/game/business/board'
import { equityYearKey } from '../src/game/business/rescue'
import { readBiz } from '../src/game/business/state'
import { findTarget, listedTargets } from '../src/game/computer/money-stocks'
import { exchangeInfo, slotPlan } from '../src/game/invest/engine'
import { investmentHoldings, investmentListing, investmentsMenu, registerOwnListings } from '../src/game/investments'
import { createPerson } from '../src/game/people'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { founder, listed, listedGroup, privateCompany } from './own-listing-kit'

const BOUGHT_YEAR = "You've used this company's one ownership move this year, here or in Capital & Ownership."

/** The children of Investments > Stocks, read the way the app reads them. */
function stocksOf(g: GameState): MenuNode[] {
  return (investmentsMenu.children(g).find((n) => n.id === 'inv-stocks') as MenuGroup).children(g)
}

function ids(nodes: MenuNode[]): string[] {
  return nodes.map((n) => n.id)
}

function textOf(g: GameState, n: MenuInfo): string {
  return typeof n.text === 'string' ? n.text : n.text(g)
}

function subtitleOf(g: GameState, n: MenuNode): string {
  if (n.type !== 'menu' && n.type !== 'action') return ''
  return typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')
}

function infoTexts(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.filter((n): n is MenuInfo => n.type === 'info').map((n) => textOf(g, n))
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

/** Every string a node tree shows, so a test can look for NaN and friends. */
function allText(g: GameState, nodes: MenuNode[]): string {
  const out: string[] = []
  for (const n of nodes) {
    if (n.type === 'info') out.push(textOf(g, n))
    else if (n.type === 'heading') out.push(n.label)
    else {
      out.push(n.label, subtitleOf(g, n))
      if (n.type === 'menu') {
        const header = n.header?.(g)
        if (header) out.push(header)
        out.push(allText(g, n.children(g)))
      } else if (n.input) {
        out.push(n.input.label)
      }
    }
  }
  return out.join('\n')
}

describe('your listed company in Stocks', () => {
  it('puts your company at the top of its tier on its own exchange', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 50e9 })
    const nodes = stocksOf(g)
    const at = nodes.findIndex((n) => n.id === 'inv-stocks-h-Large-cap')
    expect(at).toBeGreaterThanOrEqual(0)
    const heading = nodes[at]
    expect(heading.type === 'heading' && heading.label).toBe('Large-caps (rough size)')
    expect(nodes[at + 1].id).toBe(`inv-own-${a.id}`)

    const row = nodes[at + 1] as MenuGroup
    expect(row.label).toBe(`${a.name} (${tickerOf(g, a, b)})`)
    const sub = subtitleOf(g, row)
    expect(sub).toContain('Large-cap')
    expect(sub).toContain('yours 60%')
    expect(sub).toContain('NYSE')
    expect(sub).not.toMatch(/this year/)
    // Nothing else moved: the engine's own companies are all still there.
    expect(nodes.filter((n) => n.id.startsWith('inv-offer-'))).toHaveLength(slotPlan(exchangeInfo('us')).length)
    // Nor is there a second place for it.
    expect(nodes.filter((n) => n.id === `inv-own-${a.id}`)).toHaveLength(1)
    expect(ids(nodes)).not.toContain('inv-stocks-own')
  })

  it('adds the heading for a tier the exchange lacks this year', () => {
    const g = founder(7, 'us')
    expect(ids(stocksOf(g))).not.toContain('inv-stocks-h-Mid-cap')
    const { a } = listed(g, { marketCap: 5e9 })
    const nodes = stocksOf(g)
    const headings = nodes.filter((n) => n.type === 'heading').map((n) => n.id)
    expect(headings).toEqual(['inv-stocks-h-Mega-cap', 'inv-stocks-h-Large-cap', 'inv-stocks-h-Mid-cap', 'inv-stocks-h-Small-cap'])
    const mid = nodes.findIndex((n) => n.id === 'inv-stocks-h-Mid-cap')
    const mine = nodes[mid]
    expect(mine.type === 'heading' && mine.label).toBe('Mid-caps (rough size)')
    expect(nodes[mid + 1].id).toBe(`inv-own-${a.id}`)
    // It follows the Large-cap section and comes before the smaller companies.
    expect(nodes[mid + 2].id).toBe('inv-stocks-h-Small-cap')
    expect(nodes[mid - 1].id).toMatch(/^inv-offer-/)
  })

  it.each([
    [250e9, 'Mega-cap', 'Mega-caps (rough size)'],
    [50e9, 'Large-cap', 'Large-caps (rough size)'],
    [5e9, 'Mid-cap', 'Mid-caps (rough size)'],
    [1e9, 'Small-cap', 'Smaller companies'],
  ])('a %s market cap sits under the %s heading', (marketCap, tier, label) => {
    const g = founder(7, 'us')
    const { a } = listed(g, { marketCap })
    const nodes = stocksOf(g)
    const at = nodes.findIndex((n) => n.id === `inv-stocks-h-${tier}`)
    expect(at).toBeGreaterThanOrEqual(0)
    const heading = nodes[at]
    expect(heading.type === 'heading' && heading.label).toBe(label)
    expect(nodes[at + 1].id).toBe(`inv-own-${a.id}`)
    expect(subtitleOf(g, nodes[at + 1])).toContain(tier)
    // One heading per tier, and the engine's own list is still whole.
    expect(nodes.filter((n) => n.type === 'heading').map((n) => n.id)).toEqual([...new Set(nodes.filter((n) => n.type === 'heading').map((n) => n.id))])
    expect(nodes.filter((n) => n.id.startsWith('inv-offer-'))).toHaveLength(slotPlan(exchangeInfo('us')).length)
  })

  it('sorts your companies of one tier biggest first, above the exchange quotes', () => {
    const g = founder(7, 'us')
    const small = listed(g, { name: 'Small Listed', marketCap: 3e9 })
    const big = listed(g, { name: 'Big Listed', marketCap: 9e9 })
    const nodes = stocksOf(g)
    const mid = nodes.findIndex((n) => n.id === 'inv-stocks-h-Mid-cap')
    expect(ids(nodes.slice(mid + 1, mid + 3))).toEqual([`inv-own-${big.a.id}`, `inv-own-${small.a.id}`])
    // Two companies on one exchange never share a ticker.
    const labels = nodes.filter((n) => n.id.startsWith('inv-own-')).map((n) => (n as MenuGroup).label)
    expect(new Set(labels.map((l) => l.slice(-6))).size).toBe(2)
  })

  it('uses the block on an exchange without size headings', () => {
    const g = founder(7, 'jm')
    const { a } = listed(g, { countryId: 'jm' })
    const nodes = stocksOf(g)
    expect(nodes[0].id).toBe('inv-stocks-own')
    const heading = nodes[0]
    expect(heading.type === 'heading' && heading.label).toBe('Your listed companies')
    expect(nodes[1].id).toBe(`inv-own-${a.id}`)
    expect(nodes.filter((n) => n.id === `inv-own-${a.id}`)).toHaveLength(1)

    let plain: string[]
    try {
      registerOwnListings(() => [])
      plain = ids(stocksOf(g))
    } finally {
      registerOwnListings(ownStockRows)
    }
    expect(ids(nodes).slice(2)).toEqual(plain)
  })

  it('shows a company listed elsewhere in the block, naming its exchange', () => {
    // A Japan resident whose company trades in New York.
    const jp = founder(7, 'jp')
    const abroad = listed(jp, { countryId: 'us' })
    const nodes = stocksOf(jp)
    expect(nodes[0].id).toBe('inv-stocks-own')
    expect(nodes[1].id).toBe(`inv-own-${abroad.a.id}`)
    expect(subtitleOf(jp, nodes[1])).toContain('NYSE')
    expect(nodes.filter((n) => n.id === `inv-own-${abroad.a.id}`)).toHaveLength(1)
    // The Tokyo list is still whole, with its own headings.
    expect(ids(nodes)).toContain('inv-stocks-h-Mega-cap')

    // The same bare code on another exchange: a Tehran company (TSE) is not in the Tokyo (TSE) tier list.
    const tehran = listed(jp, { countryId: 'ir' })
    expect(ids(stocksOf(jp).slice(0, 3))).toContain(`inv-own-${tehran.a.id}`)
    expect(stocksOf(jp)[0].id).toBe('inv-stocks-own')
    expect(stocksOf(jp).filter((n) => n.id === `inv-own-${tehran.a.id}`)).toHaveLength(1)
    expect(subtitleOf(jp, rowOf(jp, `inv-own-${tehran.a.id}`))).toContain('TSE')

    // A US resident sees the same company inside its tier, with no block.
    const us = founder(7, 'us')
    const home = listed(us, { countryId: 'us' })
    const homeNodes = stocksOf(us)
    expect(ids(homeNodes)).not.toContain('inv-stocks-own')
    expect(homeNodes.filter((n) => n.id === `inv-own-${home.a.id}`)).toHaveLength(1)

    // A resident of a country with no stock market this year still sees what they own abroad.
    const cn = founder(7, 'cn', 50_000_000_000, 1960)
    const far = listed(cn, { countryId: 'us' })
    expect(ids(stocksOf(cn))).toEqual(['inv-stocks-none', 'inv-stocks-own', `inv-own-${far.a.id}`])
  })

  it('a company spun off a group listed abroad shows on the exchange it trades on', () => {
    const g = founder(7, 'gb')
    const spun = listed(g, { countryId: 'jp', exchange: 'NYSE' })
    const nodes = stocksOf(g)
    expect(nodes[0].id).toBe('inv-stocks-own')
    expect(nodes[1].id).toBe(`inv-own-${spun.a.id}`)
    expect(subtitleOf(g, nodes[1])).toContain('NYSE')
  })

  it('a group gets one view-only row', () => {
    const g = founder(7, 'kr')
    const { id, members } = listedGroup(g, 'kr', 0.7)
    const nodes = stocksOf(g)
    expect(nodes.filter((n) => n.id === `inv-own-g-${id}`)).toHaveLength(1)
    for (const m of members) expect(ids(nodes)).not.toContain(`inv-own-${m.id}`)

    const row = rowOf(g, `inv-own-g-${id}`)
    const grp = groupById(g, id)!
    expect(row.label).toBe(grp.core.name)
    expect(subtitleOf(g, row)).toContain('yours 70%')
    const kids = row.children(g)
    expect(kids.some((n) => n.type === 'action')).toBe(false)
    expect(infoTexts(g, kids)).toContain("Trade its shares from the group's screen under Businesses.")
    const stake = infoTexts(g, kids).find((t) => t.startsWith('Your stake: '))!
    expect(stake).toContain('70.0% of the group')
    expect(infoTexts(g, kids).find((t) => t.startsWith('Price: '))).toContain(sharePriceOf(grp).toFixed(2))

    // Sold out of the group: the row is gone, and the held row says so.
    expect(sellGroupShares(g, id, 1)).toBe(true)
    expect(ids(stocksOf(g))).not.toContain(`inv-own-g-${id}`)
    expect(infoTexts(g, row.children(g))).toEqual(['You no longer own this.'])
  })

  it('a delisted group row says it isn\'t listed any more', () => {
    const g = founder(7, 'kr')
    const { id } = listedGroup(g, 'kr', 0.7)
    const row = rowOf(g, `inv-own-g-${id}`)
    // The listing goes but the group stays, and you still hold part of it.
    const live = liveGroup(g, id)!
    live.core.listing = null
    saveGroup(g, live)
    expect(ownListings(g)).toEqual([])
    expect(infoTexts(g, row.children(g))).toEqual(["It isn't listed any more."])
    expect(ids(stocksOf(g))).not.toContain(`inv-own-g-${id}`)
  })

  it('the screen shows the stake and both doors with sane bounds', () => {
    const g = founder(7, 'us')
    const sib = createPerson(g, { relation: 'sibling', age: 40 })
    const { a } = listed(g, { marketCap: 50e9, sharesOut: 1e9, executive: 0.02, family: [{ id: sib.id, share: 0.1 }] })
    const row = rowOf(g, `inv-own-${a.id}`)
    const kids = row.children(g)
    const infos = infoTexts(g, kids)
    for (const start of ['Market cap: ', 'Price: ', 'Your stake: ', 'Outside shareholders: ', 'Listed on the ']) {
      expect(infos.some((t) => t.startsWith(start)), start).toBe(true)
    }
    expect(infos.some((t) => t.includes('At 50% or more you control the board. You hold 60.0%.'))).toBe(true)
    expect(infos.find((t) => t.startsWith('Market cap: '))).toContain('Large-cap')
    expect(infos.find((t) => t.startsWith('Outside shareholders: '))).toMatch(/relatives 10\.0%.*executives 2\.0%/)
    expect(infos.find((t) => t.startsWith('Listed on the '))).toMatch(/\(NYSE\) since \d{4}\.$/)
    expect(infos.find((t) => t.startsWith('Buying costs '))).toMatch(/at least 3% over the market price.*tax on the gain\.$/)
    // Info ids are stable and unique.
    const infoIds = kids.filter((n) => n.type === 'info').map((n) => n.id)
    expect(new Set(infoIds).size).toBe(infoIds.length)
    expect(infoIds.every((id) => id.startsWith(`inv-own-${a.id}-i`))).toBe(true)
    expect(kids.some((n) => n.type === 'heading' && n.label === 'Trade')).toBe(true)

    const { buy, sell } = doors(g, row)
    expect(buy.input?.kind).toBe('slider')
    expect(sell.input?.kind).toBe('slider')
    expect(buy.input?.money).toBe(true)
    expect(sell.input?.money).toBeUndefined()
    expect(sell.input?.unit).toBe('%')
    for (const act of [buy, sell]) {
      expect(act.disabledReason?.(g) ?? null).toBeNull()
      const { min, max } = act.input!
      expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true)
      expect(min!).toBeLessThanOrEqual(max!)
    }
    expect(buy.stayOpen).toBe(true)
    expect(sell.stayOpen).toBe(true)
    expect(buy.input!.preview!(g, buy.input!.max!)).toContain("You'd own")
    expect(sell.input!.preview!(g, 100)).toContain('leaves your companies')
    expect(subtitleOf(g, buy)).toMatch(/^At least \$.* a share · up to 15% of the company$/)
    expect(subtitleOf(g, sell)).toMatch(/^Two sales a year · .* shares$/)
  })

  it('says the board rule as the board applies it: from 50% you control it', () => {
    const rule = (share: number) => {
      const g = founder(7, 'us')
      const { a, b } = listed(g, { marketCap: 10e9, share })
      const texts = infoTexts(g, rowOf(g, `inv-own-${a.id}`).children(g))
      return { controls: ownerControls(g, a) && controlsWith(g, b, share), line: texts.find((t) => t.includes('control the board')) }
    }
    const half = rule(0.5)
    expect(half.controls).toBe(true)
    expect(half.line).toBe('At 50% or more you control the board. You hold 50.0%.')
    expect(rule(0.7).controls).toBe(true)
    expect(rule(0.4999).controls).toBe(false)
    expect(rule(0.4999).line).toContain('At 50% or more you control the board.')
  })

  it('the Buy slider starts at one share and says so', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 5e9 })
    const { buy, sell } = doors(g, rowOf(g, `inv-own-${a.id}`))
    expect(buy.input!.min).toBe(Math.ceil(buyQuote(g, a, b, 0).basePrice))
    expect(buy.input!.preview!(g, buy.input!.min!)).toMatch(/^1 share at about /)
    expect(buy.input!.preview!(g, buy.input!.min! * 3)).toMatch(/^3 shares at about /)
    expect(subtitleOf(g, sell)).toMatch(/^Two sales a year · [\d,.]+( million| billion)? shares$/)
  })

  it('a one-share stake reads "1 share"', () => {
    const g = founder(7, 'us')
    const { a } = listed(g, { marketCap: 1000, sharesOut: 2, share: 0.5 })
    const row = rowOf(g, `inv-own-${a.id}`)
    expect(infoTexts(g, row.children(g)).find((t) => t.startsWith('Your stake: '))).toMatch(/^Your stake: 1 share, 50\.0%, worth /)
    expect(subtitleOf(g, doors(g, row).sell)).toBe('Two sales a year · 1 share')
  })

  it('does not say up or down 0% since the IPO', () => {
    const g = founder(7, 'us')
    const { a } = listed(g, { marketCap: 10e9 })
    const row = rowOf(g, `inv-own-${a.id}`)
    const price = () => infoTexts(g, row.children(g)).find((t) => t.startsWith('Price: '))!
    const sharePrice = readBiz(g, a).sharePrice
    // At the offer price, and within half a percent either way: level.
    for (const ipo of [sharePrice, sharePrice * 1.003, sharePrice / 1.003, sharePrice * 0.998]) {
      a.details.ipoPrice = ipo
      expect(price(), String(ipo)).toMatch(/^Price: \$[\d.,]+ · level with the IPO$/)
      expect(price(), String(ipo)).not.toMatch(/\b(up|down) 0%/)
    }
    // A real move still reads as one.
    a.details.ipoPrice = sharePrice / 1.01
    expect(price()).toContain(' · up 1% since the IPO')
    a.details.ipoPrice = sharePrice * 1.02
    expect(price()).toContain(' · down 2% since the IPO')
  })

  it('Buy and Sell run from the screen', () => {
    const g = founder(7, 'us')
    const { a } = listed(g, { marketCap: 10e9 })
    const row = rowOf(g, `inv-own-${a.id}`)
    const { buy, sell } = doors(g, row)
    const before = readBiz(g, a).share

    buy.run(g, String(buy.input!.max))
    const after = readBiz(g, a).share
    expect(after).toBeGreaterThan(before)

    // The row object from before the trade reads the new stake, and the held Buy button is shut.
    const stake = infoTexts(g, row.children(g)).find((t) => t.startsWith('Your stake: '))!
    expect(stake).toContain(`${(after * 100).toFixed(1)}%`)
    expect(buy.disabledReason?.(g)).toBe(BOUGHT_YEAR)
    // A fresh read agrees.
    const again = doors(g, rowOf(g, `inv-own-${a.id}`))
    expect(again.buy.disabledReason?.(g)).toBe(BOUGHT_YEAR)
    expect(g.yearActions[equityYearKey(a.id)]).toBe(1)

    sell.run(g, '100')
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(infoTexts(g, row.children(g))).toEqual(['You no longer own this.'])
    expect(ids(stocksOf(g))).not.toContain(`inv-own-${a.id}`)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Sold Out')).toBe(true)

    // The buttons on the stale screen do nothing: no cash moves and nothing is queued.
    const cash = g.character.money
    const queued = g.queue.length
    sell.run(g, '50')
    buy.run(g, '1000')
    expect(g.character.money).toBe(cash)
    expect(g.queue).toHaveLength(queued)
    expect(sell.disabledReason?.(g)).toBe('You no longer own this.')
    expect(buy.disabledReason?.(g)).toBe('You no longer own this.')
  })

  it('a 0.6% stake previews its own removal', () => {
    const g = founder(7, 'us')
    const { a } = listed(g, { marketCap: 10e9 })
    a.details.share = 0.006
    const row = rowOf(g, `inv-own-${a.id}`)
    expect(subtitleOf(g, row)).toContain('yours 0.6%')
    const { sell } = doors(g, row)
    expect(sell.input!.preview!(g, 20)).toContain('leaves your companies')
    sell.run(g, '20')
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
  })

  it('a company that joins a group says it isn\'t listed any more', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 10e9 })
    const row = rowOf(g, `inv-own-${a.id}`)
    // What joining a group leaves behind (conglomerate-actions): private, no shares, no exchange.
    b.public = false
    b.sharesOut = 0
    b.sharePrice = 0
    b.exchange = ''
    b.ipoYear = 0
    expect(infoTexts(g, row.children(g))).toEqual(["It isn't listed any more."])
    expect(ids(stocksOf(g))).not.toContain(`inv-own-${a.id}`)
  })

  it('an old save shows a derived ticker and no IPO change', () => {
    const g = founder(7, 'us')
    const { a } = listed(g, { marketCap: 10e9 })
    delete a.details.ticker
    delete a.details.ipoPrice
    const first = rowOf(g, `inv-own-${a.id}`)
    expect(first.label).toMatch(/\([A-Z]{4}\)$/)
    expect(rowOf(g, `inv-own-${a.id}`).label).toBe(first.label)
    const price = infoTexts(g, first.children(g)).find((t) => t.startsWith('Price: '))!
    expect(price).not.toContain('since the IPO')

    const sharePrice = readBiz(g, a).sharePrice
    a.details.ipoPrice = sharePrice / 2
    expect(infoTexts(g, first.children(g)).find((t) => t.startsWith('Price: '))).toContain(' · up 100% since the IPO')
    a.details.ipoPrice = sharePrice * 2
    expect(infoTexts(g, first.children(g)).find((t) => t.startsWith('Price: '))).toContain(' · down 50% since the IPO')
  })

  it('hostile saved values never reach the screen', () => {
    for (const ipoPrice of [0, -1, 1e-300, 'x', null]) {
      const g = founder(7, 'us')
      const { a } = listed(g, { marketCap: 10e9 })
      a.details.ipoPrice = ipoPrice
      a.details.ticker = 'acme'
      const row = rowOf(g, `inv-own-${a.id}`)
      expect(row.label, String(ipoPrice)).toMatch(/\([A-Z]{4}\)$/)
      const text = allText(g, stocksOf(g))
      expect(text, String(ipoPrice)).not.toMatch(/NaN|undefined|Infinity|e\+\d/)
      expect(infoTexts(g, row.children(g)).find((t) => t.startsWith('Price: ')), String(ipoPrice)).not.toContain('since the IPO')
    }
  })

  it('keeps every bound finite when the buyer can\'t trade or has no cash', () => {
    const cases: [string, (g: GameState) => void, RegExp][] = [
      ['broke', (g) => { g.character.money = 0 }, /afford/],
      ['no cash figure', (g) => { g.character.money = Number.NaN }, /afford/],
      ['a minor', (g) => { g.character.age = 17 }, /18/],
    ]
    for (const [name, mutate, reason] of cases) {
      const g = founder(7, 'us')
      const { a } = listed(g, { marketCap: 10e9 })
      mutate(g)
      const { buy, sell } = doors(g, rowOf(g, `inv-own-${a.id}`))
      expect(buy.disabledReason?.(g), name).toMatch(reason)
      const { min, max } = buy.input!
      expect(Number.isFinite(min) && Number.isFinite(max), name).toBe(true)
      expect(min!, name).toBeLessThanOrEqual(max!)
      expect(Number.isFinite(Number(buy.input!.defaultValue!(g))), name).toBe(true)
      if (name === 'a minor') expect(sell.disabledReason?.(g)).toMatch(/18/)
    }
  })

  it('renders from a frozen state without touching it', () => {
    const g = founder(7, 'us')
    listed(g, { marketCap: 50e9 })
    const { a: bare } = listed(g, { name: 'Bare Ticker Co', marketCap: 3e9 })
    delete bare.details.ticker
    listedGroup(g, 'us', 0.7)
    const before = JSON.stringify(g)
    const rng = g.rng
    deepFreeze(g)

    const nodes = stocksOf(g)
    expect(nodes.filter((n) => n.id.startsWith('inv-own-'))).toHaveLength(3)
    for (const n of nodes) {
      if (!n.id.startsWith('inv-own-')) continue
      const row = n as MenuGroup
      subtitleOf(g, row)
      row.header?.(g)
      row.disabledReason?.(g)
      for (const k of row.children(g)) {
        if (k.type !== 'action') continue
        k.disabledReason?.(g)
        subtitleOf(g, k)
        k.input?.defaultValue?.(g)
        if (k.input?.preview) {
          k.input.preview(g, k.input.min ?? 0)
          k.input.preview(g, k.input.max ?? 0)
        }
      }
    }
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('leaves the list as it was for anyone without a listed company', () => {
    // A private company and an unlisted group are not rows.
    for (const [home, year] of [['us', 2026], ['jp', 2026], ['gb', 1975], ['jm', 2026], ['kr', 2000], ['cn', 1960]] as const) {
      const g = founder(7, home, 50_000_000_000, year)
      privateCompany(g, home)
      const real = ids(stocksOf(g))
      let plain: string[]
      try {
        registerOwnListings(() => [])
        plain = ids(stocksOf(g))
      } finally {
        registerOwnListings(ownStockRows)
      }
      expect(real, `${home} ${year}`).toEqual(plain)
      expect(real.some((i) => i.startsWith('inv-own-') || i === 'inv-stocks-own'), `${home} ${year}`).toBe(false)
    }
  })

  it('survives a provider that throws', () => {
    const g = founder(7, 'us')
    const plain = ids(stocksOf(g))
    try {
      registerOwnListings(() => {
        throw new Error('boom')
      })
      expect(ids(stocksOf(g))).toEqual(plain)
    } finally {
      registerOwnListings(ownStockRows)
    }
  })

  it('builds a row for a listing handed to it directly', () => {
    const g = founder(7, 'us')
    const { a } = listed(g, { marketCap: 50e9 })
    const l = ownListings(g)[0]
    const node = ownListingNode(l)
    expect(node.id).toBe(`inv-own-${a.id}`)
    expect(node.emoji).toBe('🏢')
    expect(node.header?.(g)).toBe(`🏢 ${node.label}`)
    expect(ownStockRows(g).map((r) => [r.exKey, r.size])).toEqual([['NYSE:S&P 500', 'Large-cap']])
  })

  it('is not a market security', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 50e9 })
    const ticker = tickerOf(g, a, b)
    const list = investmentListing(g)
    expect(list.some((q) => q.symbol === ticker || q.name === a.name)).toBe(false)
    expect(investmentHoldings(g)).toEqual([])
    // Nor a target for bets, insider cases or announcements.
    expect(listedTargets(g).some((t) => t.name === a.name)).toBe(false)
    expect(findTarget(g, `inv-own-${a.id}`)).toBeUndefined()
  })
})

describe('the last dividend', () => {
  const LAST = { year: 2026, paid: 5e6, mine: 3e6, perShare: 0.05 }
  const screenOf = (g: GameState, id: string): string[] => infoTexts(g, rowOf(g, `inv-own-${id}`).children(g))
  const lastLine = (texts: string[]): string | undefined => texts.find((t) => t.startsWith('Last dividend'))

  it('shows the last dividend on a company screen', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 5e9, sharesOut: 1e8 })
    expect(b.sharePrice).toBe(50)
    b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { ...LAST } }
    const texts = screenOf(g, a.id)
    expect(texts.filter((t) => t.startsWith('Last dividend'))).toHaveLength(1)
    expect(lastLine(texts)).toMatch(/^Last dividend: .* a share for 2026, 0\.1% of the price\.$/)
    // It is the first line of the company-only part: after the listing facts, before the control note.
    const at = texts.findIndex((t) => t.startsWith('Last dividend'))
    expect(texts[at - 1]).toMatch(/^Listed on the /)
    expect(texts[at + 1]).toMatch(/^At 50% or more you control the board/)
  })

  it('names the year it was paid for and leaves the rest of the screen as it was', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 5e9, sharesOut: 1e8 })
    const plain = screenOf(g, a.id)
    b.dividend = { mode: 'profit', pct: 0.3, keep: 3, last: { year: 2031, paid: 1e6, mine: 6e5, perShare: 0.2 } }
    const texts = screenOf(g, a.id)
    expect(lastLine(texts)).toMatch(/^Last dividend: .* a share for 2031, 0\.4% of the price\.$/)
    expect(texts.filter((t) => !t.startsWith('Last dividend'))).toEqual(plain)
  })

  it('shows nothing without one', () => {
    const cases: [string, (b: { dividend?: unknown }) => void][] = [
      ['no rule', () => {}],
      ['a rule with no last payment', (b) => { b.dividend = { mode: 'cash', pct: 0.5, keep: 3 } }],
      ['a last payment of nothing a share', (b) => { b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { ...LAST, perShare: 0 } } }],
      ['a hostile rule', (b) => { b.dividend = 'x' }],
      ['a rule with a damaged last payment', (b) => { b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { ...LAST, perShare: Number.POSITIVE_INFINITY } } }],
      ['a rule with a last payment of the wrong shape', (b) => { b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: 'x' } }],
    ]
    for (const [name, set] of cases) {
      const g = founder(7, 'us')
      const { a, b } = listed(g, { marketCap: 5e9, sharesOut: 1e8 })
      set(b)
      const texts = screenOf(g, a.id)
      expect(lastLine(texts), name).toBeUndefined()
      expect(allText(g, rowOf(g, `inv-own-${a.id}`).children(g)), name).not.toMatch(/dividend/i)
    }
  })

  it('leaves the yield out when the price makes it meaningless', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 5e9, sharesOut: 1e8 })
    b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { ...LAST } }
    b.sharePrice = 1e-300
    const line = lastLine(screenOf(g, a.id))
    expect(line).toMatch(/^Last dividend: .* a share for 2026\.$/)
    expect(line).not.toMatch(/NaN|undefined|Infinity|e\+/)
  })

  it('a group row has none', () => {
    const g = founder(7, 'kr', 50_000_000_000)
    const grp = listedGroup(g, 'kr', 0.7)
    for (const m of grp.members) {
      const b = readBiz(g, m)
      expect(b.public).not.toBe(true)
      m.details.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { ...LAST } }
    }
    const row = stocksOf(g).find((n) => n.id === `inv-own-g-${grp.id}`)
    expect(row).toBeDefined()
    const texts = infoTexts(g, (row as MenuGroup).children(g))
    expect(texts).toContain("Trade its shares from the group's screen under Businesses.")
    expect(lastLine(texts)).toBeUndefined()
  })

  it('the screen still renders from a frozen state', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 5e9, sharesOut: 1e8 })
    b.dividend = { mode: 'cash', pct: 0.5, keep: 3, last: { ...LAST } }
    listedGroup(g, 'us', 0.7)
    const before = JSON.stringify(g)
    const rng = g.rng
    deepFreeze(g)
    const texts = screenOf(g, a.id)
    expect(lastLine(texts)).toMatch(/^Last dividend: .* a share for 2026, 0\.1% of the price\.$/)
    expect(allText(g, stocksOf(g))).not.toMatch(/NaN|undefined|Infinity/)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })
})

describe('share classes on the company screen', () => {
  it('shows the classes and the votes', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    const row = rowOf(g, `inv-own-${a.id}`)
    const infos = infoTexts(g, row.children(g))
    expect(infos).toContain('Classes: B has 10 votes a share and is yours. A has 1 vote and trades.')
    expect(infos).toContain('Votes: you hold 63.8% of the votes with 15.0% of the shares.')
    expect(infos).toContain('At 50% or more of the votes you control the board. You hold 63.8%.')
    expect(infos.some((t) => t.startsWith('At 50% or more you control'))).toBe(false)
    // The two class lines follow the listing line and come before the control line.
    const at = (start: string) => infos.findIndex((t) => t.startsWith(start))
    expect(at('Listed on the ')).toBeLessThan(at('Classes: '))
    expect(at('Classes: ')).toBeLessThan(at('Votes: '))
    expect(at('Votes: ')).toBeLessThan(at('At 50% or more of the votes'))
    expect(subtitleOf(g, row)).toContain('yours 15% (64% of votes)')
    expect(subtitleOf(g, row)).toContain('NYSE')
    // The info ids stay unique.
    const ids = row.children(g).filter((n) => n.type === 'info').map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a non-voting float names the voting shares as yours', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.15 })
    b.classes = { kind: 'nv', hi: 0.15 }
    const row = rowOf(g, `inv-own-${a.id}`)
    const infos = infoTexts(g, row.children(g))
    expect(infos).toContain('Classes: the voting shares are yours. The non-voting shares trade.')
    expect(infos).toContain('Votes: you hold 100.0% of the votes with 15.0% of the shares.')
    expect(infos).toContain('At 50% or more of the votes you control the board. You hold 100.0%.')
    expect(subtitleOf(g, row)).toContain('(100% of votes)')
  })

  it('a one-class company reads as before', () => {
    const g = founder(7, 'us')
    const { a } = listed(g, { marketCap: 10e9, share: 0.6 })
    const row = rowOf(g, `inv-own-${a.id}`)
    const infos = infoTexts(g, row.children(g))
    expect(infos.some((t) => t.startsWith('Classes:'))).toBe(false)
    expect(infos.some((t) => t.startsWith('Votes:'))).toBe(false)
    expect(infos).toContain('At 50% or more you control the board. You hold 60.0%.')
    expect(subtitleOf(g, row)).not.toContain('of votes')
    expect(subtitleOf(g, row)).toBe(`${'$100.00'} · Large-cap · yours 60% · NYSE`)
  })

  it('a damaged record reads as one class on the screen', () => {
    for (const bad of [{ kind: 'zz', hi: 0.5 }, 7, 'ab', null]) {
      const g = founder(7, 'us')
      const { a } = listed(g, { marketCap: 10e9, share: 0.6 })
      a.details.classes = bad as never
      const row = rowOf(g, `inv-own-${a.id}`)
      const infos = infoTexts(g, row.children(g))
      expect(infos.some((t) => t.startsWith('Classes:') || t.startsWith('Votes:'))).toBe(false)
      expect(infos).toContain('At 50% or more you control the board. You hold 60.0%.')
    }
  })

  it('a buy leaves the screen in step with the votes', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    const row = rowOf(g, `inv-own-${a.id}`)
    const { buy } = doors(g, row)
    expect(buy.input!.preview!(g, buy.input!.max!)).toMatch(/These shares carry 1 vote\. You'd hold \d+% of the votes\./)
    const before = infoTexts(g, row.children(g)).find((t) => t.startsWith('Votes: '))
    buy.run(g, String(buy.input!.max!))
    const after = infoTexts(g, row.children(g)).find((t) => t.startsWith('Votes: '))
    expect(after).not.toBe(before)
    expect(b.classes).toEqual({ kind: 'ab', hi: 0.15 })
  })

  it('renders from a frozen state', () => {
    const g = founder(7, 'us')
    const { a, b } = listed(g, { marketCap: 10e9, share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    const json = JSON.stringify(g)
    deepFreeze(g)
    const row = rowOf(g, `inv-own-${a.id}`)
    const text = allText(g, [row])
    expect(text).not.toMatch(/NaN|undefined|Infinity/)
    expect(JSON.stringify(g)).toBe(json)
  })
})
