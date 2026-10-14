// Market-cap tiers and the outside float of a listed company (your listed company in Stocks).
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { newBiz } from '../src/game/business/founding'
import { CAP_TIER_MIN, TIER_LABEL, capTier, outsideFloat, ownListings, rawStake, type CapTier } from '../src/game/business/own-listing'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { groupById, groupIdOf, groupStake, liveGroup, readCore, saveGroup, sharePriceOf, syncMembers, type GroupCore } from '../src/game/business/conglomerate-state'
import { tickerOf } from '../src/game/business/listing-id'
import { refreshValue } from '../src/game/business/economy'
import { bizOf, isTicker, readBiz, type BizState } from '../src/game/business/state'
import { exchangeInfo, exchangeName, reservedTickers } from '../src/game/invest/engine'
import { SIZE_LABEL } from '../src/game/invest/real'
import { createPerson } from '../src/game/people'
import { deepFreeze } from './fuzz-kit'
import { founder, listed, listedGroup, privateCompany } from './own-listing-kit'

describe('cap tiers and the float', () => {
  it.each<[number, CapTier]>([
    [200e9, 'mega'], [200e9 - 1, 'large'],
    [10e9, 'large'], [10e9 - 1, 'mid'],
    [2e9, 'mid'], [2e9 - 1, 'small'],
    [0, 'small'], [-5, 'small'],
    [1e300, 'mega'], [Infinity, 'mega'],
    [NaN, 'small'], [-Infinity, 'small'],
  ])('uses the fixed thresholds, inclusive at the lower bound (%s is %s)', (value, tier) => {
    expect(capTier(value)).toBe(tier)
  })

  it('keeps the thresholds in today\'s money', () => {
    expect(CAP_TIER_MIN).toEqual({ mega: 200_000_000_000, large: 10_000_000_000, mid: 2_000_000_000 })
  })

  it('labels match the engine size headings', () => {
    expect(TIER_LABEL.mega).toBe(SIZE_LABEL.mega)
    expect(TIER_LABEL.large).toBe(SIZE_LABEL.large)
    expect(TIER_LABEL.mid).toBe(SIZE_LABEL.mid)
    expect(TIER_LABEL.small).toBe('Small-cap')
  })

  it('outside float is what nobody inside holds', () => {
    const g = makeTestGame(1, { age: 40 })
    const b = newBiz(g, 'software', 'us', 'Chicago')
    b.share = 0.6
    b.executiveEquity = 0.05
    b.familyShares = [{ id: 'p1', share: 0.3 }]
    expect(outsideFloat(b)).toBeCloseTo(0.05, 9)

    b.share = 1
    b.executiveEquity = 0
    b.familyShares = []
    expect(outsideFloat(b)).toBe(0)

    b.share = 0.9
    b.familyShares = [{ id: 'p1', share: 0.3 }]
    expect(outsideFloat(b)).toBe(0)

    // A plain object works too, which is how a group's core is read.
    expect(outsideFloat({ share: 0.5, executiveEquity: 0.1, manager: null, familyShares: [{ share: 0.2 }] })).toBeCloseTo(0.2, 9)
  })

  it('counts a hired manager\'s equity once, as the larger of the two executive slices', () => {
    expect(outsideFloat({ share: 0.5, executiveEquity: 0.1, manager: { equity: 0.25 } })).toBeCloseTo(0.25, 9)
    expect(outsideFloat({ share: 0.5, executiveEquity: 0.3, manager: { equity: 0.25 } })).toBeCloseTo(0.2, 9)
    expect(outsideFloat({ share: 0.5, manager: {} })).toBeCloseTo(0.5, 9)
    // An executive slice over 100% is clamped, not subtracted in full.
    expect(outsideFloat({ share: 0, executiveEquity: 5 })).toBe(0)
  })

  it('takes a GroupCore and a BizState without a cast', () => {
    // These two helpers are the check: they stop compiling if either type stops fitting Holders.
    const floatOfCore = (c: GroupCore): number => outsideFloat(c)
    const floatOfBiz = (b: BizState): number => outsideFloat(b)
    const core = readCore({ id: 'grp1', share: 0.6, executiveEquity: 0.05, familyShares: [{ id: 'p1', share: 0.1 }] })
    expect(core).not.toBeNull()
    expect(floatOfCore(core!)).toBeCloseTo(0.25, 9)
    const g = makeTestGame(1, { age: 40 })
    const b = newBiz(g, 'software', 'us', 'Chicago')
    b.share = 0.8
    expect(floatOfBiz(b)).toBeCloseTo(0.2, 9)
  })

  it('stays a finite number between 0 and 1 for hostile values', () => {
    const hostile = [
      { share: NaN }, { share: Infinity }, { share: -Infinity }, { share: -3 }, { share: 7 },
      { share: 0.5, executiveEquity: NaN }, { share: 0.5, executiveEquity: Infinity }, { share: 0.5, executiveEquity: -1 },
      { share: 0.5, manager: { equity: NaN } },
      { share: 0.5, familyShares: [{ share: NaN }] },
      { share: 0.5, familyShares: [{ share: Infinity }, { share: -Infinity }] },
      { share: 0.5, familyShares: [{ share: -0.9 }] },
      { share: 0.5, familyShares: [{ share: 0.2 }, { share: NaN }] },
    ]
    for (const h of hostile) {
      const f = outsideFloat(h)
      expect(Number.isFinite(f)).toBe(true)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
    // A stake that is not a number leaves no float anyone can vouch for.
    expect(outsideFloat({ share: NaN })).toBe(0)
    // A stray bad slice counts as nothing, a good one still counts.
    expect(outsideFloat({ share: 0.5, familyShares: [{ share: 0.2 }, { share: NaN }] })).toBeCloseTo(0.3, 9)
    // A negative slice cannot grow the float.
    expect(outsideFloat({ share: 0.5, familyShares: [{ share: -0.9 }] })).toBeCloseTo(0.5, 9)
  })

  it('does not change what it is given', () => {
    const h = { share: 0.6, executiveEquity: 0.05, manager: { equity: 0.02 }, familyShares: [{ share: 0.1 }] }
    const before = JSON.stringify(h)
    outsideFloat(h)
    outsideFloat(h)
    expect(JSON.stringify(h)).toBe(before)
  })
})

describe('your listings', () => {
  it('lists a standalone listed company with its exchange, tier, stake and float', () => {
    const g = founder()
    const sib = createPerson(g, { relation: 'sibling', age: 45, firstName: 'Mina', money: 10_000, occupation: 'Clerk', relationship: 80 })
    const { a, b } = listed(g, { marketCap: 50e9, sharesOut: 1e9, share: 0.6, executive: 0.02, family: [{ id: sib.id, share: 0.1 }] })
    const rows = ownListings(g)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.kind).toBe('company')
    expect(r.id).toBe(a.id)
    expect(r.name).toBe(a.name)
    expect(r.ticker).toBe(tickerOf(g, a, b))
    expect(isTicker(r.ticker)).toBe(true)
    expect(r.exKey).toBe('NYSE:S&P 500')
    expect(r.exCode).toBe('NYSE')
    expect(r.exName).toBe(exchangeName(exchangeInfo('us'), g.year))
    expect(r.tier).toBe('large')
    expect(r.price).toBe(50)
    expect(r.marketCap).toBe(50e9)
    expect(r.sharesOut).toBe(1e9)
    expect(r.stake).toBe(0.6)
    expect(r.stakeValue).toBe(a.value)
    expect(r.outside).toBeCloseTo(0.28, 9)
    expect(r.family).toBeCloseTo(0.1, 9)
    expect(r.executives).toBeCloseTo(0.02, 9)
    expect(r.ipoYear).toBe(g.year - 3)
    expect(r.ipoPrice).toBeNull()
  })

  it('tiers by market cap and sorts biggest first', () => {
    const g = founder()
    listed(g, { name: 'Small One', marketCap: 1.9e9 })
    listed(g, { name: 'Mega One', marketCap: 250e9 })
    listed(g, { name: 'Mid One', marketCap: 2e9 })
    listed(g, { name: 'Large One', marketCap: 10e9 })
    const rows = ownListings(g)
    expect(rows.map((r) => r.tier)).toEqual(['mega', 'large', 'mid', 'small'])
    expect(rows.map((r) => r.name)).toEqual(['Mega One', 'Large One', 'Mid One', 'Small One'])
    expect(rows.map((r) => r.marketCap)).toEqual([250e9, 10e9, 2e9, 1.9e9])
  })

  it('breaks a tie in market cap the same way every time', () => {
    const g = founder()
    const first = listed(g, { name: 'Twin Alpha', marketCap: 3e9 })
    const second = listed(g, { name: 'Twin Beta', marketCap: 3e9 })
    const ids = [first.a.id, second.a.id].sort()
    expect(ownListings(g).map((r) => r.id)).toEqual(ids)
    g.assets.reverse()
    expect(ownListings(g).map((r) => r.id)).toEqual(ids)
  })

  it('leaves out private companies, divisions and sold-out companies', () => {
    const g = founder()
    privateCompany(g, 'us', 'Quiet Co')
    expect(ownListings(g)).toEqual([])

    // An old save before the yearly cleanup: a sold-out company with no family shares. readBiz would
    // floor its stake at 1%, but nothing is owned.
    const { a, b } = listed(g, { name: 'Gone Co' })
    b.share = 0
    delete b.familyShares
    expect(readBiz(g, a).share).toBe(0.01)
    expect(ownListings(g)).toEqual([])

    // What a sale leaves behind can be under 1%; the stake an action sees is the stored one.
    b.share = 0.006
    refreshValue(a, b)
    const rows = ownListings(g)
    expect(rows).toHaveLength(1)
    expect(rows[0].stake).toBe(0.006)
    expect(rows[0].stakeValue).toBe(a.value)
    expect(rawStake(g, a)).toBe(0.006)
    a.details.v = 1
    expect(rawStake(g, a)).toBe(0.01)
  })

  it('never lists a division, even one that claims to be public', () => {
    const g = founder()
    const grp = listedGroup(g, 'kr', 0.7)
    for (const m of grp.members) bizOf(g, m).public = true
    const rows = ownListings(g)
    expect(rows.filter((r) => r.kind === 'company')).toEqual([])
    expect(rows.filter((r) => r.kind === 'group')).toHaveLength(1)
  })

  it('shows a listed group as one view-only row', () => {
    const g = founder()
    const { id } = listedGroup(g, 'kr', 0.7)
    const grp = groupById(g, id)!
    const rows = ownListings(g)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.kind).toBe('group')
    expect(r.id).toBe(id)
    expect(r.name).toBe(grp.core.name)
    expect(r.ticker).toBeNull()
    expect(r.stake).toBe(0.7)
    expect(r.stakeValue).toBe(groupStake(grp))
    expect(r.stakeValue).toBeGreaterThan(0)
    expect(r.exKey).toBe('KRX:KOSPI')
    expect(r.exCode).toBe('KRX')
    expect(r.exName).toBe(exchangeName(exchangeInfo('kr'), g.year))
    expect(r.tier).toBe(capTier(r.marketCap))
    expect(r.sharesOut).toBe(2_000_000)
    expect(r.price).toBe(sharePriceOf(grp))
    expect(r.price).toBeGreaterThan(0.01)
    expect(r.marketCap / (sharePriceOf(grp) * 2_000_000)).toBeCloseTo(1, 9)
    expect(r.outside).toBe(outsideFloat(grp.core))
    expect(r.ipoYear).toBe(g.year - 2)
    expect(r.ipoPrice).toBeNull()
  })

  it('reads a group row\'s relatives and executives from the group record', () => {
    const g = founder()
    const sib = createPerson(g, { relation: 'sibling', age: 45, firstName: 'Mina', money: 10_000, occupation: 'Clerk', relationship: 80 })
    const { id } = listedGroup(g, 'kr', 0.7)
    const grp = liveGroup(g, id)!
    grp.core.familyShares = [{ id: sib.id, share: 0.1 }]
    // A sitting group CEO with 5%: a recorded grant of someone who has left would go back to you on save.
    grp.core.ceo = 'manager'
    grp.core.manager = { firstName: 'Pat', lastName: 'Morgan', gender: 'male', skill: 60, salary: 0, since: g.year, equity: 0.05 }
    syncMembers(grp)
    saveGroup(g, grp)
    const r = ownListings(g)[0]
    expect(r.stake).toBe(0.7)
    expect(r.family).toBeCloseTo(0.1, 9)
    expect(r.executives).toBeCloseTo(0.05, 9)
    expect(r.outside).toBeCloseTo(0.15, 9)
    expect(r.outside).toBe(outsideFloat(groupById(g, id)!.core))
  })

  it('gives no row for a group that is not listed, or that you hold none of', () => {
    const g = founder()
    const { id } = listedGroup(g, 'kr', 0.7)
    const grp = liveGroup(g, id)!
    grp.core.share = 0
    syncMembers(grp)
    saveGroup(g, grp)
    expect(ownListings(g)).toEqual([])

    const again = liveGroup(g, id)!
    again.core.share = 0.7
    again.core.listing = null
    syncMembers(again)
    saveGroup(g, again)
    expect(ownListings(g)).toEqual([])
  })

  it('counts a group stake under a millionth of the group as none, as the yearly cleanup does', () => {
    const g = founder()
    const { id } = listedGroup(g, 'kr', 0.7)
    const grp = liveGroup(g, id)!
    grp.core.share = 5e-7
    syncMembers(grp)
    saveGroup(g, grp)
    expect(groupById(g, id)!.core.share).toBe(5e-7)
    expect(ownListings(g)).toEqual([])
    const again = liveGroup(g, id)!
    again.core.share = 0.0001
    syncMembers(again)
    saveGroup(g, again)
    const rows = ownListings(g)
    expect(rows).toHaveLength(1)
    expect(rows[0].stake).toBe(0.0001)
  })

  it('places a group on the exchange it lists on, from its divisions\' countries', () => {
    const g = founder(7, 'gb')
    // A Korean listing: the Korean division's own exchange is the one, whatever order the divisions come in.
    const kr = mixedGroup(g, ['us', 'kr'], 'KRX')
    // A New York listing held by Japanese and British divisions (a spin-off): only one exchange uses the code.
    const ny = mixedGroup(g, ['jp', 'gb'], 'NYSE')
    const byId = new Map(ownListings(g).map((r) => [r.id, r]))
    expect(byId.get(kr)?.exKey).toBe('KRX:KOSPI')
    expect(byId.get(ny)?.exKey).toBe('NYSE:S&P 500')
  })

  it('places each company on the exchange it trades on', () => {
    const g = founder(7, 'gb')
    const tokyo = listed(g, { name: 'Tokyo Co', countryId: 'jp' })
    const tehran = listed(g, { name: 'Tehran Co', countryId: 'ir' })
    const spun = listed(g, { name: 'Spun Co', countryId: 'jp', exchange: 'NYSE' })
    const byId = new Map(ownListings(g).map((r) => [r.id, r]))
    expect(byId.get(tokyo.a.id)?.exKey).toBe('TSE:Nikkei 225')
    expect(byId.get(tehran.a.id)?.exKey).toBe('TSE:TEDPIX')
    expect(byId.get(spun.a.id)?.exKey).toBe('NYSE:S&P 500')
    expect(byId.get(tokyo.a.id)?.exName).toBe(exchangeName(exchangeInfo('jp'), g.year))
    expect(byId.get(tehran.a.id)?.exName).toBe(exchangeName(exchangeInfo('ir'), g.year))
    expect([...byId.values()].some((r) => r.exKey === 'LSE:FTSE 100')).toBe(false)
    expect(byId.size).toBe(3)
  })

  it('places a company from a country with no market of its own on the exchange that serves it', () => {
    const g = founder()
    const cuba = listed(g, { name: 'Havana Co', countryId: 'cu' })
    const samoa = listed(g, { name: 'Apia Co', countryId: 'ws' })
    const byId = new Map(ownListings(g).map((r) => [r.id, r]))
    expect(byId.get(cuba.a.id)?.exKey).toBe(exchangeInfo('cu').key)
    expect(byId.get(cuba.a.id)?.exKey).toBe('NYSE:S&P 500')
    expect(byId.get(samoa.a.id)?.exKey).toBe(exchangeInfo('ws').key)
    expect(byId.get(samoa.a.id)?.exCode).toBe('ASX')
  })

  it('still lists a company in a year its exchange was shut, named as it was then', () => {
    const g = founder(5, 'cn', 50_000_000_000, 1960)
    const { a } = listed(g, { name: 'Shanghai Co', countryId: 'cn' })
    const rows = ownListings(g)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(a.id)
    expect(rows[0].exKey).toBe(exchangeInfo('cn').key)
    expect(rows[0].exName).toBe(exchangeName(exchangeInfo('cn'), 1960))
    expect(rows[0].ipoYear).toBe(1957)
  })

  it('lists a company once, wherever the player lives or moves', () => {
    const g = founder(9, 'us')
    const { a } = listed(g, { name: 'Home Co', countryId: 'us' })
    const before = ownListings(g)
    g.character.countryId = 'jp'
    g.character.city = 'Tokyo'
    const after = ownListings(g)
    expect(after).toEqual(before)
    expect(after.filter((r) => r.id === a.id)).toHaveLength(1)
    expect(after[0].exKey).toBe('NYSE:S&P 500')
  })

  it('gives two companies on one exchange different tickers, and keeps a stored one', () => {
    const g = founder()
    const one = listed(g, { name: 'Acme Robotics' })
    const two = listed(g, { name: 'Acme Robotics', marketCap: 4e9 })
    let rows = ownListings(g)
    expect(rows).toHaveLength(2)
    const tickers = rows.map((r) => r.ticker)
    expect(new Set(tickers).size).toBe(2)
    for (const r of rows) {
      expect(isTicker(r.ticker)).toBe(true)
      expect(reservedTickers(exchangeInfo('us')).has(r.ticker!)).toBe(false)
    }
    const stored = tickerOf(g, one.a, one.b)
    one.b.ticker = stored
    rows = ownListings(g)
    expect(rows.find((r) => r.id === one.a.id)?.ticker).toBe(stored)
    // A stored ticker that another of your companies already holds is not shown twice.
    two.b.ticker = stored
    rows = ownListings(g)
    expect(new Set(rows.map((r) => r.ticker)).size).toBe(2)
    expect(rows.find((r) => r.id === one.a.id)?.ticker).toBe(stored)
  })

  it('reads the offer price and drops a hostile one', () => {
    const g = founder()
    const { a, b } = listed(g, { name: 'Priced Co' })
    b.ipoPrice = 12.5
    expect(ownListings(g)[0].ipoPrice).toBe(12.5)
    for (const bad of [-1, 0, '12', null, 1e13, Infinity]) {
      a.details.ipoPrice = bad as never
      expect(ownListings(g)[0].ipoPrice).toBeNull()
    }
  })

  it('survives hostile and old records', () => {
    const g = founder()
    const { a } = listed(g, { name: 'Odd Co', marketCap: 5e9, sharesOut: 1e8 })
    a.details.ticker = 'acme' as never
    let r = ownListings(g)[0]
    expect(isTicker(r.ticker)).toBe(true)

    // A stake over 100% reads as 100%, a negative one as none.
    a.details.share = 7
    expect(ownListings(g)[0].stake).toBe(1)
    expect(ownListings(g)[0].outside).toBe(0)
    a.details.share = -3
    expect(ownListings(g)).toEqual([])
    a.details.share = 0.6

    // No shares or no price: nothing to show.
    a.details.sharesOut = 0
    expect(ownListings(g)).toEqual([])
    a.details.sharesOut = 1e8
    a.details.sharePrice = 0
    expect(ownListings(g)).toEqual([])
    a.details.sharePrice = 50

    // An old record (version 1) is normalized first; its stake floors at 1%.
    a.details.v = 1
    a.details.share = 0
    r = ownListings(g)[0]
    expect(r.stake).toBe(0.01)

    // A save round trip changes nothing.
    const before = ownListings(g)
    a.details = JSON.parse(JSON.stringify(a.details))
    expect(ownListings(g)).toEqual(before)
  })

  it('renders from a deep-frozen state', () => {
    const g = founder()
    listed(g, { name: 'Frozen Co' })
    listedGroup(g, 'kr', 0.7)
    const rows = ownListings(g)
    deepFreeze(g)
    expect(() => ownListings(g)).not.toThrow()
    expect(ownListings(g)).toEqual(rows)
  })

  it('is pure', () => {
    const g = founder()
    const withTicker = listed(g, { name: 'Stored Co' })
    withTicker.b.ticker = 'STOR'
    listed(g, { name: 'Derived Co', marketCap: 7e9 })
    listedGroup(g, 'kr', 0.7)
    const json = JSON.stringify(g)
    const rng = g.rng
    const one = ownListings(g)
    const two = ownListings(g)
    expect(two).toEqual(one)
    expect(one).toHaveLength(3)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
  })
})

describe('votes and share classes in your listings', () => {
  it("a classed company's row carries its votes", () => {
    const g = founder()
    const { b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    const r = ownListings(g)[0]
    expect(r.stake).toBe(0.15)
    expect(r.votes).toBeCloseTo(0.6383, 4)
    expect(r.classKind).toBe('ab')
    b.classes = { kind: 'nv', hi: 0.15 }
    const nv = ownListings(g)[0]
    expect(nv.votes).toBe(1)
    expect(nv.classKind).toBe('nv')
  })

  it('a one-class company has votes equal to its stake and no kind', () => {
    const g = founder()
    listed(g, { share: 0.6 })
    const r = ownListings(g)[0]
    expect(r.votes).toBe(r.stake)
    expect(r.classKind).toBeNull()
  })

  it('a damaged record is one class, and a plan on a private company is not a listing', () => {
    for (const bad of [{ kind: 'zz', hi: 0.5 }, 7, 'ab', null, []]) {
      const g = founder()
      const { a } = listed(g, { share: 0.3 })
      a.details.classes = bad as never
      const r = ownListings(g)[0]
      expect(r.classKind).toBeNull()
      expect(r.votes).toBe(0.3)
    }
    const g = founder()
    const { b } = privateCompany(g)
    b.classes = { kind: 'ab', hi: 1 }
    expect(ownListings(g)).toEqual([])
  })

  it('a stake under 1% is read as stored with its votes', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.006 })
    b.classes = { kind: 'ab', hi: 0.006 }
    const r = ownListings(g)[0]
    expect(r.stake).toBe(0.006)
    expect(r.votes).toBeCloseTo((10 * 0.006) / (10 * 0.006 + 0.994), 6)
  })

  it('a group row has no kind and its votes are its stake', () => {
    const g = founder()
    listedGroup(g, 'kr', 0.7)
    const r = ownListings(g)[0]
    expect(r.kind).toBe('group')
    expect(r.classKind).toBeNull()
    expect(r.votes).toBe(r.stake)
    expect(r.votes).toBe(0.7)
  })

  it('reads a frozen state', () => {
    const g = founder()
    const { b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    deepFreeze(g)
    expect(() => ownListings(g)).not.toThrow()
    expect(ownListings(g)[0].votes).toBeCloseTo(0.6383, 4)
  })
})

/** A listed group whose divisions sit in different countries; returns the group id. */
function mixedGroup(g: ReturnType<typeof founder>, countries: string[], code: string): string {
  const parts = countries.map((c, i) => privateCompany(g, c, `Mixed Co ${c}${i}`))
  if (!formGroup(g, parts.map((p) => p.a.id), `Mixed ${code}`)) throw new Error('the test could not form a group')
  const id = groupIdOf(bizOf(g, parts[0].a))
  const grp = liveGroup(g, id)!
  grp.core.listing = { exchange: code, ipoYear: g.year - 2, sharesOut: 1_000_000, sharePrice: 20 }
  grp.core.share = 0.8
  syncMembers(grp)
  saveGroup(g, grp)
  return id
}
