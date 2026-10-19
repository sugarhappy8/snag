// Ecosystem companies: a sister chip company supplies a device company's chips through Group Services. The record is written once
// a fiscal year before the books (so the saving is in the buyer's cogs), the invoice is profit-neutral and eliminated, and a sister
// that stops qualifying ends its help at the next fiscal year with no money appearing (RF2) and no NaN on empty books (RF3).
import { describe, expect, it } from 'vitest'
import { installManager, managerCandidate } from '../src/game/business/career'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupById, groupsOf } from '../src/game/business/conglomerate-state'
import { yearlyGroups } from '../src/game/business/conglomerate-year'
import { techOf } from '../src/game/business/deeptech-core'
import { CHIP_RESERVE, CHIP_SHARE, chipBook, chipSource } from '../src/game/business/devices-data'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import {
  assignAllServices, chipBlock, chipResultFor, chipRows, groupServicesMenu, hasChipContract, internalRevenue, prepareInternalServices,
  serviceContracts, settleInternalServices, toggleService,
} from '../src/game/business/group-services'
import { bizOf, readBiz, type Statement } from '../src/game/business/state'
import type { Industry } from '../src/game/data/markets'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'
import { adult, company } from './market-kit'

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

/** Writes a booked year the way business-financial-overhaul.test.ts does (`Statement` has more fields than a test needs). */
function book(g: GameState, a: Asset, year: number, over: Partial<Statement> = {}): void {
  bizOf(g, a).last = { year, revenue: 100e6, netRevenue: 100e6, cogs: 100e6, wages: 0, keyStaff: 0, rent: 0, upkeep: 0, marketing: 0, pbt: 1e6, corpTax: 0, net: 1e6, otherIncome: 0, ...over } as Statement
}

function chipGroup(extra: Industry[] = []) {
  const g = adult(7, 2028, 'us'), sister = company(g, 'semiconductor', { name: 'Acme Silicon' }), buyer = company(g, 'devices', { name: 'Acme Phones' })
  const t = techOf(bizOf(g, sister)); t.stage = 3; t.node = 5; t.yieldRate = 0.8
  const more = extra.map((industry, i) => company(g, industry, { name: `Extra ${i}` }))
  for (const a of [sister, buyer]) book(g, a, 2026, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
  expect(formGroup(g, [sister.id, buyer.id, ...more.map((x) => x.id)], 'Chip Group')).toBe(true)
  return { g, sister, buyer, more, id: groupsOf(g)[0].core.id }
}

const textsOf = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))
const rowsOf = (g: GameState, id: string): MenuNode[] => { const m = groupServicesMenu(id); return m.type === 'menu' ? m.children(g) : [] }
const infoOf = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
const chipInfos = (g: GameState, id: string): string[] => rowsOf(g, id).filter((n) => n.type === 'info' && n.id.startsWith('group.services.chip.')).map((n) => infoOf(g, n))
const pairOf = (g: GameState, id: string, p: Asset, q: Asset) => { const grp = groupById(g, id)!; return { p: grp.members.find((x) => x.a.id === p.id)!, q: grp.members.find((x) => x.a.id === q.id)! } }
/** A number that is not finite anywhere in the saved state (JSON.stringify would hide it as null). */
function nonFinite(v: unknown, path = ''): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path]
  if (Array.isArray(v)) return v.flatMap((x, i) => nonFinite(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => nonFinite(x, `${path}.${k}`))
  return []
}
const clean = (g: GameState): void => {
  expect(nonFinite(g.assets.map((a) => a.details))).toEqual([])
  expect(nonFinite(g.flags)).toEqual([])
  for (const a of g.assets) if (a.kind === 'business') expect(bizOf(g, a).cash).toBeGreaterThanOrEqual(0)
}

describe('the chip contract follows the rule table', () => {
  it('allows a sister chip company to supply a device company and nothing else', () => {
    const { g, sister, buyer, id } = chipGroup()
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(true)
    expect(serviceContracts(g)).toEqual([{ provider: sister.id, customer: buyer.id, group: id }])
    const back = chipGroup()
    expect(toggleService(back.g, back.id, back.buyer.id, back.sister.id)).toBe(false)
    const shop = chipGroup(['restaurant'])
    expect(toggleService(shop.g, shop.id, shop.sister.id, shop.more[0].id)).toBe(false)
    const early = chipGroup()
    techOf(bizOf(early.g, early.sister)).stage = 1
    expect(toggleService(early.g, early.id, early.sister.id, early.buyer.id)).toBe(false)
    expect(chipBlock(early.g, pairOf(early.g, early.id, early.sister, early.buyer).p, pairOf(early.g, early.id, early.sister, early.buyer).q)).toBe("Acme Silicon can't supply chips. It isn't shipping chips yet.")
  })

  it('relaxes the outlet rule but keeps the country rule', () => {
    const abroad = chipGroup()
    const sb = bizOf(abroad.g, abroad.sister)
    sb.outlets.push({ countryId: 'gb', city: 'London', count: 1, opened: 2027 })
    expect(toggleService(abroad.g, abroad.id, abroad.sister.id, abroad.buyer.id)).toBe(true)
    const other = chipGroup()
    bizOf(other.g, other.sister).countryId = 'gb'
    expect(toggleService(other.g, other.id, other.sister.id, other.buyer.id)).toBe(false)
    const { p, q } = pairOf(other.g, other.id, other.sister, other.buyer)
    expect(chipBlock(other.g, p, q)).toBe("Acme Silicon can't supply chips. It's in another country.")
  })

  it('refuses a sister the group does not fully own and says why', () => {
    const { g, sister, buyer, id } = chipGroup()
    bizOf(g, sister).share = 0.8
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(false)
    const { p, q } = pairOf(g, id, sister, buyer)
    const text = "Acme Silicon can't supply chips. The group doesn't own all of it. Buy out its investors first."
    expect(chipBlock(g, p, q)).toBe(text)
    expect(chipInfos(g, id)).toContain(text)
    expect(chipRows(g, buyer)).toContain(text)
    const buyerSide = chipGroup()
    bizOf(buyerSide.g, buyerSide.buyer).share = 0.8
    const pq = pairOf(buyerSide.g, buyerSide.id, buyerSide.sister, buyerSide.buyer)
    expect(chipBlock(buyerSide.g, pq.p, pq.q)).toBe("Acme Phones can't take chips. The group doesn't own all of it. Buy out its investors first.")
  })

  it('offers an action for a valid pair and caps the chip info rows at six', () => {
    const { g, sister, buyer, id } = chipGroup()
    const action = rowsOf(g, id).find((n) => n.type === 'action' && n.id === `service.${sister.id}.${buyer.id}`)
    expect(action?.type === 'action' && action.label).toBe('Assign Acme Silicon → Acme Phones')
    expect(action?.type === 'action' && action.subtitle).toBe('Chip supply')
    expect(chipInfos(g, id)).toEqual([])
    const big = chipGroup(['semiconductor', 'semiconductor', 'devices', 'devices'])
    for (const a of [big.sister, ...big.more.slice(0, 2)]) techOf(bizOf(big.g, a)).stage = 1
    const rows = chipInfos(big.g, big.id)
    expect(rows).toHaveLength(6)
    for (const t of rows) expect(t).toMatch(/can't supply chips\. It isn't shipping chips yet\.$/)
  })
})

describe('the record is written once a fiscal year', () => {
  it('assigns the best sister before the books and not a second time', () => {
    const { g, sister, buyer, id } = chipGroup()
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(true)
    prepareInternalServices(g, 2027)
    const cover = clamp((CHIP_RESERVE * 100e6) / (100e6 * CHIP_SHARE), 0, 1)
    expect(bizOf(g, buyer).chips).toMatchObject({ year: 2027, from: sister.id, name: 'Acme Silicon', stage: 3, node: 5, yield: 0.8 })
    expect(bizOf(g, buyer).chips!.cover).toBeCloseTo(cover, 10)
    expect(cover).toBeCloseTo(0.571, 3)
    expect(chipSource(bizOf(g, buyer)).src).toBe('sister')
    const after = JSON.stringify(g)
    prepareInternalServices(g, 2027)
    expect(JSON.stringify(g)).toBe(after)
  })

  it('covers little of a giant buyer and holds capacity only for what a used sister serves', () => {
    const giant = chipGroup()
    toggleService(giant.g, giant.id, giant.sister.id, giant.buyer.id)
    book(giant.g, giant.sister, 2026, { revenue: 1e6, netRevenue: 1e6, cogs: 1e6 })
    book(giant.g, giant.buyer, 2026, { revenue: 3e9, netRevenue: 3e9, cogs: 2e9 })
    prepareInternalServices(giant.g, 2027)
    expect(bizOf(giant.g, giant.buyer).chips!.cover).toBeLessThan(0.01)

    const full = chipGroup()
    toggleService(full.g, full.id, full.sister.id, full.buyer.id)
    prepareInternalServices(full.g, 2027)
    expect(bizOf(full.g, full.sister).capacityLoss).toBeCloseTo(0.2, 10)

    const small = chipGroup()
    toggleService(small.g, small.id, small.sister.id, small.buyer.id)
    book(small.g, small.buyer, 2026, { cogs: 10e6 })
    prepareInternalServices(small.g, 2027)
    expect(bizOf(small.g, small.sister).capacityLoss).toBeCloseTo((10e6 * CHIP_SHARE) / 100e6, 10)

    const own = chipGroup()
    toggleService(own.g, own.id, own.sister.id, own.buyer.id)
    bizOf(own.g, own.buyer).fabs = 3
    prepareInternalServices(own.g, 2027)
    expect(bizOf(own.g, own.buyer).chips).toBeUndefined()
    expect(bizOf(own.g, own.sister).capacityLoss).toBe(0)
  })

  it('holds at most half of one sister across all its buyers', () => {
    const { g, sister, buyer, more, id } = chipGroup(['devices', 'devices'])
    for (const x of more) book(g, x, 2026, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
    for (const x of [buyer, ...more]) expect(toggleService(g, id, sister.id, x.id)).toBe(true)
    prepareInternalServices(g, 2027)
    for (const x of [buyer, ...more]) expect(bizOf(g, x).chips?.from).toBe(sister.id)
    const loss = bizOf(g, sister).capacityLoss
    expect(loss).toBeLessThanOrEqual(0.5)
    expect(loss).toBeGreaterThan(0.36)
  })
})

describe('the year settles without moving the sister profit', () => {
  it('invoices at neutral profit, eliminates it from group revenue and logs the saving once', () => {
    const { g, sister, buyer, id } = chipGroup()
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(true)
    prepareInternalServices(g, 2027)
    book(g, sister, 2027, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
    book(g, buyer, 2027, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
    const provider = bizOf(g, sister), cash = provider.cash, pbt = provider.last!.pbt, revenue = provider.last!.revenue, cogs = provider.last!.cogs
    const buyerBooks = JSON.stringify(bizOf(g, buyer).last), buyerCash = bizOf(g, buyer).cash
    const cut = chipSource(readBiz(g, buyer)).cut
    settleInternalServices(g, 2027)
    const invoice = internalRevenue(g, id, 2027)
    expect(invoice).toBeGreaterThan(0)
    expect(invoice).toBeLessThanOrEqual(0.25 * 100e6)
    expect(bizOf(g, sister).cash).toBe(cash)
    expect(bizOf(g, sister).last!.pbt).toBe(pbt)
    expect(bizOf(g, sister).last!.revenue).toBe(revenue + invoice)
    expect(bizOf(g, sister).last!.netRevenue).toBe(100e6 + invoice)
    expect(bizOf(g, sister).last!.cogs).toBe(cogs + invoice)
    expect(JSON.stringify(bizOf(g, buyer).last)).toBe(buyerBooks)
    expect(bizOf(g, buyer).cash).toBe(buyerCash)
    const results = g.flags.groupServiceResults as unknown as Record<string, unknown>[]
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ chips: true, group: id, provider: sister.id, customer: buyer.id, invoice, saved: Math.round(chipBook(100e6, cut).saved), year: 2027 })
    expect(chipResultFor(g, buyer.id)).toEqual({ provider: sister.id, saved: Math.round(chipBook(100e6, cut).saved), year: 2027 })
    expect(textsOf(g).some((t) => t.includes('supplied chips to') && t.includes('saved it about'))).toBe(true)
    expect(textsOf(g).some((t) => t.includes('net operating savings'))).toBe(false)
    const after = JSON.stringify(g)
    settleInternalServices(g, 2027)
    expect(JSON.stringify(g)).toBe(after)
    clean(g)
  })
})

describe('a sister that stops qualifying ends its help at the next fiscal year (RF2)', () => {
  function recorded() {
    const x = chipGroup()
    expect(toggleService(x.g, x.id, x.sister.id, x.buyer.id)).toBe(true)
    prepareInternalServices(x.g, 2027)
    expect(bizOf(x.g, x.buyer).chips?.year).toBe(2027)
    return x
  }
  it('drops the record when the sister is sold or leaves the group', () => {
    const sold = recorded()
    sold.g.assets = sold.g.assets.filter((a) => a.id !== sold.sister.id)
    prepareInternalServices(sold.g, 2028)
    expect(bizOf(sold.g, sold.buyer).chips).toBeUndefined()
    clean(sold.g)

    const left = recorded()
    bizOf(left.g, left.sister).capacityLoss = 0
    delete bizOf(left.g, left.sister).group
    prepareInternalServices(left.g, 2028)
    expect(bizOf(left.g, left.buyer).chips).toBeUndefined()
    expect(bizOf(left.g, left.sister).capacityLoss).toBe(0)
    clean(left.g)
  })

  it('drops the record when the group no longer owns all of the sister', () => {
    const { g, sister, buyer } = recorded()
    bizOf(g, sister).capacityLoss = 0
    bizOf(g, sister).share = 0.8
    prepareInternalServices(g, 2028)
    expect(bizOf(g, buyer).chips).toBeUndefined()
    expect(bizOf(g, sister).capacityLoss).toBe(0)
    clean(g)
  })

  it('keeps a mid-year toggle for the next fiscal year', () => {
    const { g, sister, buyer, id } = recorded()
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(true)
    expect(serviceContracts(g)).toEqual([])
    book(g, sister, 2027, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
    book(g, buyer, 2027, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
    settleInternalServices(g, 2027)
    expect(chipResultFor(g, buyer.id)?.year).toBe(2027)
    expect(internalRevenue(g, id, 2027)).toBeGreaterThan(0)
    prepareInternalServices(g, 2028)
    expect(bizOf(g, buyer).chips).toBeUndefined()
    clean(g)
  })

  it('writes no record for a contract signed after the year started', () => {
    const { g, sister, buyer, id } = chipGroup()
    prepareInternalServices(g, 2027)
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(true)
    expect(bizOf(g, buyer).chips).toBeUndefined()
    book(g, sister, 2027, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
    book(g, buyer, 2027, { revenue: 100e6, netRevenue: 100e6, cogs: 100e6 })
    settleInternalServices(g, 2027)
    expect(chipResultFor(g, buyer.id)).toBeNull()
    prepareInternalServices(g, 2028)
    expect(bizOf(g, buyer).chips).toMatchObject({ year: 2028, from: sister.id })
    clean(g)
  })
})

describe('empty books give no record, no hold and no invoice (RF3)', () => {
  const cases: [string, (x: ReturnType<typeof chipGroup>) => void][] = [
    ['a buyer with no booked year', (x) => { bizOf(x.g, x.buyer).last = null }],
    ['a buyer with zero cogs', (x) => book(x.g, x.buyer, 2026, { cogs: 0 })],
    ['a sister with zero revenue', (x) => book(x.g, x.sister, 2026, { revenue: 0, netRevenue: 0, cogs: 0 })],
    ['a sister with no booked year', (x) => { bizOf(x.g, x.sister).last = null }],
  ]
  for (const [name, setup] of cases) {
    it(`skips ${name}`, () => {
      const x = chipGroup()
      expect(toggleService(x.g, x.id, x.sister.id, x.buyer.id)).toBe(true)
      setup(x)
      prepareInternalServices(x.g, 2027)
      expect(bizOf(x.g, x.buyer).chips).toBeUndefined()
      expect(bizOf(x.g, x.sister).capacityLoss).toBe(0)
      settleInternalServices(x.g, 2027)
      expect(chipResultFor(x.g, x.buyer.id)).toBeNull()
      expect(internalRevenue(x.g, x.id, 2027)).toBe(0)
      clean(x.g)
    })
  }
})

describe('cross-selling follows the contract', () => {
  function world(contract: boolean) {
    const g = makeTestGame(123, { age: 45, money: 1e9 })
    for (const [i, industry] of (['semiconductor', 'devices'] as const).entries()) {
      const b = newBiz(g, industry, 'us', 'Chicago', { cash: 200e6, founded: g.year - 5, valuation: 220e6 })
      installManager(g, b, managerCandidate(g, b, 95))
      b.manager!.since = g.year - 5; b.manager!.equity = 0.02
      g.assets.push(createBusinessAsset(g, `Division ${i}`, b, 1e6))
    }
    const [sister, buyer] = g.assets
    techOf(bizOf(g, sister)).stage = 3
    for (const a of [sister, buyer]) book(g, a, g.year - 1, { revenue: 1e8, netRevenue: 1e8, cogs: 3e7, pbt: 2e7, net: 1.5e7, corpTax: 5e6 })
    expect(formGroup(g, [sister.id, buyer.id], 'Atlas')).toBe(true)
    const id = groupsOf(g)[0].core.id
    g.queue = []
    if (contract) expect(toggleService(g, id, sister.id, buyer.id)).toBe(true)
    return { g, buyer }
  }
  it('drops the buyer lift while a chip contract replaces it', () => {
    const open = world(false)
    yearlyGroups(open.g)
    expect(bizOf(open.g, open.buyer).demandShock).toBeGreaterThan(1)
    const tied = world(true)
    expect(hasChipContract(tied.g, groupsOf(tied.g)[0], tied.buyer.id)).toBe(true)
    yearlyGroups(tied.g)
    expect(bizOf(tied.g, tied.buyer).demandShock).toBe(1)
  })
})

describe('Assign All and ownership', () => {
  it('adds the chip pair once and skips a minority sister', () => {
    const { g, sister, buyer, id } = chipGroup()
    expect(assignAllServices(g, id)).toBe(1)
    expect(serviceContracts(g)).toEqual([{ group: id, provider: sister.id, customer: buyer.id }])
    expect(assignAllServices(g, id)).toBe(0)
    const minority = chipGroup()
    bizOf(minority.g, minority.sister).share = 0.8
    expect(assignAllServices(minority.g, minority.id)).toBe(0)
  })

  it('changes nothing for a player under 18', () => {
    const { g, sister, buyer, id } = chipGroup()
    g.character.age = 17
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(false)
    expect(assignAllServices(g, id)).toBe(0)
    expect(serviceContracts(g)).toEqual([])
  })
})

describe('the screen helpers read the record and the group', () => {
  it('names the supplier, the one that could and the one that cannot', () => {
    const { g, sister, buyer, id } = chipGroup()
    expect(chipRows(g, buyer)).toEqual(['Acme Silicon could supply your chips. Assign it under Group Services.'])
    expect(toggleService(g, id, sister.id, buyer.id)).toBe(true)
    prepareInternalServices(g, 2027)
    expect(chipRows(g, buyer)).toEqual(['Acme Silicon supplies your chips and covers 57% of what you need.'])
    expect(hasChipContract(g, groupsOf(g)[0], buyer.id)).toBe(true)
    expect(hasChipContract(g, groupsOf(g)[0], sister.id)).toBe(false)
    expect(chipRows(g, sister)).toEqual([])
  })

  it('reads the same twice and writes nothing', () => {
    const { g, sister, buyer, id } = chipGroup()
    toggleService(g, id, sister.id, buyer.id)
    prepareInternalServices(g, 2027)
    const before = JSON.stringify(g), rng = g.rng
    chipRows(g, buyer); chipResultFor(g, buyer.id); rowsOf(g, id); chipInfos(g, id)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })
})
