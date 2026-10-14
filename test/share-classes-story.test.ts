// The whole of share classes in two stories (Stocks phase 2, task 8). The first is the player's company: a founder
// picks founder shares, lists, buys from the float, lives through a year, goes back to one class and sells out. The
// second is a real company: Alphabet's screen names its classes, its listed Class C can be bought, and the holding
// moves with the company. Every step drives the real code from tasks 1-7, so this checks how they fit together, not
// any one of them.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { businessAssetView } from '../src/game/business'
import { passOdds } from '../src/game/business/board-vote'
import { boardOf, controlsFor, ownerSeats, seatPlan } from '../src/game/business/board-state'
import { goPublic, ipoPreview } from '../src/game/business/exit'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { classesKey, recapProposal } from '../src/game/business/share-classes-menu'
import { ownerVotes } from '../src/game/business/share-classes'
import { bizOf, findBusiness, readBiz, readClasses } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { yearActionsUsed } from '../src/game/core'
import { classFacts } from '../src/game/invest/class-data'
import { buySecurity, investmentHoldings, investmentListing, investmentsMenu, yearlyInvestments } from '../src/game/investments'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { findNode, founder } from './own-listing-kit'

/** The children of Investments > Stocks, read the way the app reads them. */
function stocksOf(g: GameState): MenuNode[] {
  return (investmentsMenu.children(g).find((n) => n.id === 'inv-stocks') as MenuGroup).children(g)
}

function groupAt(nodes: MenuNode[], id: string): MenuGroup {
  const hit = nodes.find((n) => n.id === id)
  if (!hit || hit.type !== 'menu') throw new Error(`no menu ${id}`)
  return hit
}

function infoTexts(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.filter((n): n is MenuInfo => n.type === 'info').map((n) => (typeof n.text === 'string' ? n.text : n.text(g)))
}

function action(nodes: MenuNode[], prefix: string): MenuAction {
  const hit = nodes.find((n): n is MenuAction => n.type === 'action' && n.id.startsWith(prefix))
  if (!hit) throw new Error(`no action ${prefix}`)
  return hit
}

/** One Share Classes row, found the way a player finds it: Capital & Ownership, Share Classes, the row. */
function classRow(g: GameState, a: Asset, choice: 'single' | 'ab' | 'nv'): MenuAction {
  const capital = findNode(g, businessAssetView(g, a), `biz.rescue.${a.id}`) as MenuGroup
  const classes = groupAt(capital.children(g), `biz.classes.${a.id}`)
  const hit = classes.children(g).find((n) => n.id === `biz.classes.${a.id}.${choice}`)
  if (!hit || hit.type !== 'action') throw new Error(`no row ${choice}`)
  return hit
}

function passCompanyYear(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyBusinessImpl(g)
}

function noticeTexts(g: GameState, title: string): string[] {
  return g.queue.filter((m) => m.kind === 'notice' && m.title === title).map((m) => (m.kind === 'notice' ? m.text : ''))
}

describe('share classes, from the first row to the last sale', () => {
  it('a founder lists with founder shares, buys, recapitalizes and sells out', () => {
    // 1. A US founder's software company earns 30e6 a year for three years. The founder shares are picked from
    // Capital & Ownership, for free, and the IPO preview names the votes.
    const g = founder(41, 'us')
    const a = createBusinessAsset(g, 'Acme Robotics', newBiz(g, 'software', 'us', 'Chicago', { cash: 5_000_000 }), 1e6)
    g.assets.push(a)
    const b = bizOf(g, a)
    b.history = [g.year - 3, g.year - 2, g.year - 1].map((year) => ({ year, revenue: 120e6, profit: 30e6, tax: 0, units: 1e6, price: 120, staff: 300, valuation: 0, outlets: 1 }))
    const founders = classRow(g, a, 'ab')
    expect(founders.disabledReason?.(g) ?? null).toBeNull()
    expect(founders.confirm).toBeUndefined()
    founders.run(g)
    expect(b.classes).toEqual({ kind: 'ab', hi: 1 })
    expect(yearActionsUsed(g, classesKey(a.id))).toBe(0)
    expect(noticeTexts(g, 'Share Classes')[0]).toContain('will list with founder shares.')
    expect(ipoPreview(g, b, 25)).toMatch(/You'd hold \d+% of the votes\. You keep control of the board\.$/)

    // 2. It lists. The owner's whole stake is the founders' class, so most of the votes stay with them. In
    // Stocks the row is there with its classes line and its votes line.
    const oneClass: GameState = structuredClone(g)
    delete bizOf(oneClass, findBusiness(oneClass, a.id)!).classes
    goPublic(oneClass, findBusiness(oneClass, a.id)!, bizOf(oneClass, findBusiness(oneClass, a.id)!), 25)
    const priceOneClass = readBiz(oneClass, findBusiness(oneClass, a.id)!).sharePrice
    g.queue = []
    goPublic(g, a, b, 25)
    expect(b.public).toBe(true)
    expect(b.classes).toEqual({ kind: 'ab', hi: b.share })
    expect(ownerVotes(b)).toBeGreaterThan(0.95)
    expect(noticeTexts(g, 'IPO Day!')[0]).toMatch(/ You hold \d+% of the votes\.$/)
    // The market pays 4% less for the founders' class: the offer price is under the one-class price.
    expect(b.sharePrice / priceOneClass).toBeGreaterThan(0.9)
    expect(b.sharePrice / priceOneClass).toBeLessThan(0.985)
    const row = groupAt(stocksOf(g), `inv-own-${a.id}`)
    const texts = infoTexts(g, row.children(g))
    expect(texts.find((t) => t.startsWith('Classes: '))).toBe('Classes: B has 10 votes a share and is yours. A has 1 vote and trades.')
    const votesLine = texts.find((t) => t.startsWith('Votes: '))
    expect(votesLine).toMatch(/^Votes: you hold \d+\.\d% of the votes with \d+\.\d% of the shares\.$/)
    expect(texts.find((t) => t.startsWith('At 50% or more of the votes you control the board.'))).toBeDefined()

    // 3. Buy as much as the slider allows. The new shares are ordinary: the founders' class does not grow, the
    // votes rise by less than the same purchase would give in that class, and the control stays.
    const hiBefore = readClasses(b.classes)!.hi
    const shareBefore = b.share
    const votesBefore = ownerVotes(b)
    const buy = action(row.children(g), 'inv-own-buy-')
    expect(buy.disabledReason?.(g) ?? null).toBeNull()
    buy.run(g, String(buy.input!.max))
    expect(b.share).toBeGreaterThan(shareBefore)
    expect(readClasses(b.classes)!.hi).toBe(hiBefore)
    const rose = ownerVotes(b) - votesBefore
    const naive = ownerVotes({ ...b, classes: { kind: 'ab', hi: b.share } }) - votesBefore
    expect(rose).toBeGreaterThan(0)
    expect(rose).toBeLessThan(naive)
    expect(controlsFor(g, b)).toBe(true)
    expect(investmentHoldings(g)).toEqual([])

    // 4. A year later: the price carries the factor. A twin of the company with one class, run through the same
    // year, ends higher by what the market takes off for the structure (about 4% of the fundamental, less the
    // half of the price that follows last year's quote). The seats are still the founder's.
    const twin: GameState = structuredClone(g)
    const twinAsset = findBusiness(twin, a.id)!
    delete bizOf(twin, twinAsset).classes
    passCompanyYear(twin)
    passCompanyYear(g)
    const next = readBiz(g, a)
    expect(next.public).toBe(true)
    expect(readClasses(next.classes)).toEqual({ kind: 'ab', hi: hiBefore })
    const ratio = next.sharePrice / readBiz(twin, twinAsset).sharePrice
    expect(ratio).toBeGreaterThan(0.95)
    expect(ratio).toBeLessThan(0.995)
    expect(controlsFor(g, next)).toBe(true)
    const loaded: GameState = JSON.parse(JSON.stringify(g))
    expect(findBusiness(loaded, a.id)).toBeDefined()
    const again = groupAt(stocksOf(loaded), `inv-own-${a.id}`)
    const againTexts = infoTexts(loaded, again.children(loaded))
    expect(againTexts.find((t) => t.startsWith('Classes: '))).toBeDefined()
    expect(againTexts.find((t) => t.startsWith('Votes: '))).toBeDefined()
    expect(readClasses(readBiz(loaded, findBusiness(loaded, a.id)!).classes)).toEqual({ kind: 'ab', hi: hiBefore })

    // 5. Back to one class. The board is the owner's, so the vote passes. The record goes, the price rises by
    // what the market had taken off, and the seats are the one-class plan.
    const priceBefore = next.sharePrice
    const single = classRow(g, a, 'single')
    expect(single.disabledReason?.(g) ?? null).toBeNull()
    expect(single.confirm?.(g)).toContain('The board votes first.')
    expect(passOdds(g, a, next, recapProposal(a, 'single'))).toBeGreaterThan(0.99)
    g.queue = []
    single.run(g)
    const done = bizOf(g, a)
    expect(done.classes).toBeUndefined()
    expect('classes' in done).toBe(false)
    expect(yearActionsUsed(g, classesKey(a.id))).toBe(1)
    expect(done.sharePrice / priceBefore).toBeGreaterThan(1.035)
    expect(done.sharePrice / priceBefore).toBeLessThan(1.05)
    expect(ownerVotes(done)).toBe(done.share)
    const plan = seatPlan(g, done)
    // One class: seats follow the shares (a listed board always keeps two seats for independents).
    expect(plan.owner).toBe(Math.min(Math.round(done.share * plan.size), plan.size - 2))
    expect(ownerSeats(boardOf(done))).toBe(plan.owner + plan.group)
    expect(noticeTexts(g, 'Share Classes')[0]).toContain(`${a.name} now has one class of shares.`)
    expect(classRow(g, a, 'single').disabledReason?.(g)).toBe('It already has this structure.')
    expect(classRow(g, a, 'ab').disabledReason?.(g)).toBe('Classes change once a year.')

    // 6. Sell it all from the Stocks row: the company and its row go.
    const rowNow = groupAt(stocksOf(g), `inv-own-${a.id}`)
    const sell = action(rowNow.children(g), 'inv-own-sell-')
    expect(sell.disabledReason?.(g) ?? null).toBeNull()
    g.queue = []
    sell.run(g, '100')
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(findBusiness(g, a.id)).toBeUndefined()
    expect(stocksOf(g).some((n) => n.id === `inv-own-${a.id}`)).toBe(false)
    expect(infoTexts(g, rowNow.children(g))).toEqual(['You no longer own this.'])
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Sold Out')).toBe(true)
  })

  it("a real company's second class can be bought", () => {
    // 7. A US game in 2020. Alphabet's screen names its classes; the listed Class C is a second line on it.
    const g = founder(9, 'us', 50_000_000, 2020)
    g.log = [{ age: g.character.age, year: g.year, entries: [] }]
    const q = investmentListing(g).find((x) => x.type === 'stock' && x.name === 'Alphabet')
    expect(q).toBeDefined()
    const id = q!.secId
    const offer = groupAt(stocksOf(g), `inv-offer-${id}`)
    const facts = infoTexts(g, offer.children(g)).find((t) => t.startsWith('Share classes:'))
    expect(facts).toMatch(/^Share classes: Class A \(this line\) has 1 vote a share\. Class B has 10 votes a share, held by the founders\. Class C has no vote and is listed too\.$/)
    expect(facts).toBe(classFacts({ id: 'stock-us-alphabet' }, 2020))

    // Buy the Class C line and the main line the same way, then let a year pass.
    const line = `${id}~C`
    expect(offer.children(g).some((n) => n.type === 'action' && n.id === `inv-buy-${line}`)).toBe(true)
    expect(buySecurity(g, id, 10_000)).toBe(true)
    expect(buySecurity(g, line, 10_000)).toBe(true)
    const held = (secId: string) => {
      const h = investmentHoldings(g).find((x) => x.details.secId === secId)
      if (!h) throw new Error(`no holding in ${secId}`)
      return h
    }
    expect(held(line).details.classOf).toBe(id)
    expect(held(line).name).toBe('Alphabet (Class C)')
    const before = { main: held(id).value, line: held(line).value }
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    g.flags.taxableIncome = 0
    g.queue = []
    yearlyInvestments(g)
    const moved = (now: number, was: number) => now / was - 1
    const main = moved(held(id).value, before.main)
    const second = moved(held(line).value, before.line)
    expect(Math.abs(main)).toBeGreaterThan(0.0001)
    expect(Math.abs(second - main)).toBeLessThan(0.001)
  })
})
