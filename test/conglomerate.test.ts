// Conglomerates: forming a group, synergies that show up in the books, ownership at fair value
// with outside investors, the pooled treasury's honest limits, spin-offs, a group IPO, net worth
// counting each company once, merge/spin-off loops that lose money, old saves, heirs, prison, and
// a five-division group running for twenty years.
import { describe, expect, it } from 'vitest'
import { netWorth } from '../src/game/core'
import { hasBoard } from '../src/game/business/board'
import { becomeCeo, installManager, managerCandidate } from '../src/game/business/career'
import { acquireForGroup, acquirePower, addToGroup, canGroupIpo, delistGroup, formGroup, groupDividend, groupIpo, moveCash, movableCash, searchGroupCeo, sellGroupShares, spinOff } from '../src/game/business/conglomerate-actions'
import { antitrustBlock, conglomerateDiscount, mergeTerms, ownerFairValue, synergyPlan } from '../src/game/business/conglomerate-econ'
import { allGroups, groupById, groupsOf, groupStake, groupValue, liveGroup, readMembership, sharePriceOf } from '../src/game/business/conglomerate-state'
import { conglomerateNodes } from '../src/game/business/conglomerate'
import { emptyMarket } from '../src/game/business/competition-state'
import { marketViewOf, saveMarket } from '../src/game/business/competition'
import { acquisitionQuote } from '../src/game/business/competition-moves'
import { payDividend } from '../src/game/business/board-menu'
import { sellBusiness } from '../src/game/business/exit'
import { marketKey } from '../src/game/business/competition-core'
import { bestPlan, refreshValue, valuationOf } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, findBusiness, normalizeBiz, readBiz, stakeValue, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { businessesMenu } from '../src/game/business'
import type { Industry } from '../src/game/data/markets'
import { continueAsChild, createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { createPerson } from '../src/game/people'
import { sendToPrison } from '../src/game/prison'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

const SAFE = ['decline', 'keep', 'no', 'refuse', 'cancel', 'ignore', 'reject', 'pass']

/** Answer popups; by default the cautious option (events that offer to buy a company get a no). */
function cautious(choices: { id: string }[]): string {
  return choices.find((c) => SAFE.includes(c.id))?.id ?? choices[0].id
}

function drain(g: GameState, pick: (choices: { id: string }[]) => string = cautious): void {
  for (let guard = 0; g.queue.length && guard < 600; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      if (m.source === 'script') runScript(g, m.scriptId!, pick(m.choices), m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: m.choices[0].id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || String(m.min ?? 1), m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function life(seed: number): GameState {
  const g = createNewLife({ seed, year: 1985, countryId: 'us' })
  g.queue = []
  g.year = 2024
  g.character.age = 39
  g.character.money = 5_000_000
  g.character.talent = null
  g.character.talents = []
  return g
}

/** A company with a manager, a sensible plan and some cash (not yet booked). */
function addCompany(g: GameState, name: string, industry: Industry, opts: { outlets?: number; cash?: number; city?: number } = {}): Asset {
  const city = getCountry('us').cities[opts.city ?? 0]
  const b0 = newBiz(g, industry, 'us', city, { cash: opts.cash ?? 3_000_000, founded: 2018, outlets: [{ countryId: 'us', city, count: opts.outlets ?? 6, opened: 2018 }] })
  const a = createBusinessAsset(g, name, b0, 200_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  installManager(g, b, managerCandidate(g, b, 70))
  const p = bestPlan(g, b)
  b.price = p.price
  b.production = p.production
  return a
}

/** Book `years` years for every company (the player plans nothing: managers run them). */
function book(g: GameState, years: number): void {
  for (let y = 0; y < years; y++) {
    g.year += 1
    g.character.age += 1
    yearlyBusinessImpl(g)
    drain(g)
  }
}

function setup(seed: number, industries: Industry[]): { g: GameState; assets: Asset[] } {
  const g = life(seed)
  const assets = industries.map((ind, i) => addCompany(g, `Co ${i + 1}`, ind, { city: i % 3 }))
  book(g, 2)
  g.queue = []
  const live = assets.map((a) => findBusiness(g, a.id))
  if (live.some((a) => !a)) throw new Error(`seed ${seed}: a test company went under before the test began`)
  return { g, assets: live as Asset[] }
}

function all(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && depth < 5 ? [n, ...all(g, n.children(g), depth + 1)] : [n]))
}

function finite(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n)
}

describe('conglomerates', () => {
  it('merges two companies into a group, both keep running and the synergies reach the books', () => {
    const { g, assets } = setup(1, ['restaurant', 'restaurant'])
    const cash0 = assets.map((a) => readBiz(g, a).cash)
    expect(formGroup(g, assets.map((a) => a.id), 'Test Holdings')).toBe(true)
    drain(g)
    const grp = groupsOf(g)[0]
    expect(grp.core.name).toBe('Test Holdings')
    expect(grp.members.map((x) => x.a.id).sort()).toEqual(assets.map((a) => a.id).sort())
    expect(grp.core.share).toBe(1)
    // Fees came out of the companies' cash.
    assets.forEach((a, i) => expect(readBiz(g, a).cash).toBeLessThan(cash0[i]))
    // Every member has a board with the group's people on it.
    for (const x of grp.members) expect(hasBoard(g, x.b)).toBe(true)
    book(g, 1)
    const after = groupsOf(g)[0]
    expect(after.core.synergy).not.toBeNull()
    const s = after.core.synergy!
    expect(s.backOffice).toBeGreaterThan(0)
    expect(s.purchasing).toBeGreaterThan(0)
    expect(s.integration).toBeGreaterThan(0)
    // Integration is charged once.
    for (const x of after.members) expect(x.m.integrated).toBe(g.year)
    book(g, 1)
    const later = groupsOf(g)[0]
    expect(later.core.synergy!.integration).toBe(0)
    for (const x of later.members) {
      expect(x.b.history.length).toBeGreaterThanOrEqual(4)
      expect(x.b.history[x.b.history.length - 1].year).toBe(g.year - 1)
    }
    expect(later.core.history.length).toBe(2)
    // The screen lists the group, not its divisions.
    const rows = businessesMenu.children(g)
    expect(rows.some((n) => n.id === `biz.group.${later.core.id}`)).toBe(true)
    expect(rows.some((n) => n.id === `biz.company.${assets[0].id}`)).toBe(false)
    const screen = all(g, conglomerateNodes(g))
    expect(screen.some((n) => n.id === `biz.company.${assets[0].id}`)).toBe(true)
  })

  it('gives outside investors group shares at fair value: the player keeps exactly their value', () => {
    const { g, assets } = setup(2, ['cafe', 'bakery'])
    const b2 = bizOf(g, assets[1])
    b2.share = 0.7
    b2.pref = Math.round(b2.valuation * 0.5)
    refreshValue(assets[1], b2)
    const b1 = readBiz(g, assets[0])
    const fair = ownerFairValue(b1) + ownerFairValue(readBiz(g, assets[1]))
    const total = b1.valuation + b2.valuation
    const t = mergeTerms(null, [{ id: 'a', b: b1 }, { id: 'b', b: readBiz(g, assets[1]) }])
    expect(t.share).toBeCloseTo(fair / total, 5)
    // The investors' preference counts: they get at least it back in group value.
    expect(ownerFairValue(readBiz(g, assets[1]))).toBeLessThanOrEqual(b2.valuation * 0.7 + 1)
    // The vote may go either way: try seeds until the board says yes.
    let formed: GameState | null = null
    for (let seed = 0; seed < 12 && !formed; seed++) {
      const gg = structuredClone(g)
      gg.rng = 500 + seed
      if (formGroup(gg, assets.map((a) => a.id), 'Fair Value Group')) formed = gg
      drain(gg)
    }
    expect(formed).not.toBeNull()
    const grp = groupsOf(formed!)[0]
    // Every division reports the same look-through stake; preferences converted.
    for (const x of grp.members) {
      expect(x.b.share).toBeCloseTo(grp.core.share, 4)
      expect(x.b.pref ?? 0).toBe(0)
    }
    expect(grp.core.share).toBeLessThan(1)
    // A group with outside shareholders has its own board.
    expect(all(formed!, conglomerateNodes(formed!)).some((n) => n.id === `biz.group.board.${grp.core.id}`)).toBe(true)
  })

  it('counts each company once in net worth: merging costs only the fees and the discount', () => {
    const { g, assets } = setup(3, ['gym', 'software', 'farm'])
    const before = netWorth(g)
    const values = assets.map((a) => readBiz(g, a))
    const discount = conglomerateDiscount(values.map((b, i) => ({ id: assets[i].id, b, own: 1 })))
    expect(formGroup(g, assets.map((a) => a.id), 'Sprawl Inc')).toBe(true)
    drain(g)
    const grp = groupsOf(g)[0]
    const after = netWorth(g)
    const fees = values.reduce((s, b) => s + Math.max(25_000 * 0.2, 0.012 * b.valuation), 0)
    expect(after).toBeLessThanOrEqual(before)
    expect(before - after).toBeLessThanOrEqual(fees * 3 + discount * values.reduce((s, b) => s + b.valuation, 0) + 10)
    // Net worth is the sum of the divisions' stakes (no group asset on top).
    const stakes = grp.members.reduce((s, x) => s + stakeValue(x.b), 0)
    expect(g.assets.filter((a) => a.kind === 'business').reduce((s, a) => s + a.value, 0)).toBe(stakes)
    expect(Math.abs(groupStake(grp) - stakes)).toBeLessThanOrEqual(grp.members.length + 1)
    expect(g.assets.length).toBe(assets.length + g.assets.filter((a) => a.kind !== 'business').length)
  })

  it('pools cash within honest limits', () => {
    const { g, assets } = setup(4, ['restaurant', 'cafe', 'bar'])
    expect(formGroup(g, assets.map((a) => a.id), 'Pool Group')).toBe(true)
    drain(g)
    let grp = liveGroup(g, groupsOf(g)[0].core.id)!
    const [x, y, z] = grp.members
    // A division whose cash is all owed to its lenders can't send any.
    x.b.debt = Math.max(0, x.b.cash)
    expect(movableCash(g, grp.members[0])).toBe(0)
    expect(moveCash(g, grp.core.id, x.a.id, y.a.id, 1_000_000)).toBe(false)
    drain(g)
    // From a healthy division: at most what it can spare, and the totals add up.
    grp = liveGroup(g, grp.core.id)!
    const from = grp.members.find((m) => m.a.id === y.a.id)!
    const spare = movableCash(g, from)
    expect(spare).toBeGreaterThan(0)
    const sum0 = grp.members.reduce((s, m) => s + m.b.cash, 0)
    const nw0 = netWorth(g)
    expect(moveCash(g, grp.core.id, y.a.id, z.a.id, spare * 10)).toBe(true)
    drain(g)
    grp = liveGroup(g, grp.core.id)!
    expect(grp.members.reduce((s, m) => s + m.b.cash, 0)).toBe(sum0)
    expect(movableCash(g, grp.members.find((m) => m.a.id === y.a.id)!)).toBeLessThanOrEqual(1)
    expect(Math.abs(netWorth(g) - nw0)).toBeLessThanOrEqual(5)
    // A division with outside investors of its own can't receive (or send) group cash.
    const zb = bizOf(g, z.a)
    zb.share = zb.share * 0.6
    book(g, 1)
    grp = liveGroup(g, grp.core.id)!
    const zm = grp.members.find((m) => m.a.id === z.a.id)!
    expect(zm.m.own).toBeLessThan(0.999)
    expect(movableCash(g, zm)).toBe(0)
    const ym = grp.members.find((m) => m.a.id === y.a.id)!
    ym.b.cash += 2_000_000
    expect(moveCash(g, grp.core.id, y.a.id, z.a.id, 100_000)).toBe(false)
  })

  it('spins a division off with its stake intact, and dissolves a group of one', () => {
    const { g, assets } = setup(5, ['grocery', 'bakery', 'logistics'])
    expect(formGroup(g, assets.map((a) => a.id), 'Spin Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    const share = groupsOf(g)[0].core.share
    const cash0 = readBiz(g, assets[2]).cash
    expect(spinOff(g, id, assets[2].id)).toBe(true)
    drain(g)
    const spun = readBiz(g, assets[2])
    expect(readMembership(spun.group)).toBeNull()
    expect(spun.share).toBeCloseTo(share, 5)
    expect(spun.cash).toBeLessThan(cash0)
    expect(groupById(g, id)!.members.length).toBe(2)
    // Spinning off one of the last two winds the group up.
    expect(spinOff(g, id, assets[1].id)).toBe(true)
    drain(g)
    expect(groupById(g, id)).toBeNull()
    expect(allGroups(g).length).toBe(0)
    for (const a of assets) {
      expect(readBiz(g, a).group).toBeUndefined()
      expect(hasBoard(g, readBiz(g, a))).toBe(false)
    }
  })

  it('lists the whole group, sells shares, and takes it private again at a price', () => {
    const { g, assets } = setup(6, ['restaurant', 'hotel'])
    expect(formGroup(g, assets.map((a) => a.id), 'Listed Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    expect(canGroupIpo(g, groupById(g, id)!)).not.toBeNull()
    // Pretend the divisions earned like giants last year.
    for (const a of assets) {
      const b = bizOf(g, a)
      b.last = { ...b.last!, net: 200_000_000, revenue: 900_000_000 }
      b.valuation = Math.max(b.valuation, 2_000_000_000)
      refreshValue(a, b)
    }
    expect(canGroupIpo(g, groupById(g, id)!)).toBeNull()
    g.character.money = 1e12
    const start = netWorth(g)
    const value0 = groupStake(groupById(g, id)!)
    expect(groupIpo(g, id)).toBe(true)
    drain(g)
    let grp = groupById(g, id)!
    expect(grp.core.listing).not.toBeNull()
    expect(grp.core.share).toBeCloseTo(0.75, 5)
    // Day one: the stake is worth what it was, give or take the pop and the fees.
    const v1 = groupStake(grp)
    expect(v1).toBeGreaterThan(value0 * 0.75)
    expect(v1).toBeLessThan(value0 * 1.4)
    for (const x of grp.members) expect(x.b.public).toBe(false)
    const money0 = g.character.money
    expect(sellGroupShares(g, id, 0.2)).toBe(true)
    drain(g)
    grp = groupById(g, id)!
    expect(g.character.money).toBeGreaterThan(money0)
    expect(grp.core.share).toBeCloseTo(0.6, 5)
    for (const x of grp.members) expect(x.b.share).toBeCloseTo(0.6, 4)
    // Too soon to delist; two years on it costs a premium.
    expect(delistGroup(g, id)).toBe(false)
    drain(g)
    g.year += 2
    const cap = grp.core.listing!.sharePrice * grp.core.listing!.sharesOut
    const float = 1 - grp.core.share
    let ok = false
    for (let i = 0; i < 10 && !ok; i++) {
      ok = delistGroup(g, id)
      drain(g)
      if (!ok) g.year += 1
    }
    expect(ok).toBe(true)
    grp = groupById(g, id)!
    expect(grp.core.listing).toBeNull()
    expect(grp.core.share).toBe(1)
    // The outside shareholders were paid a premium over the market price...
    expect(start - netWorth(g)).toBeGreaterThan(0)
    expect(float * cap).toBeGreaterThan(0)
    // ...and the whole round trip (list, sell, buy back) cost money.
    expect(netWorth(g)).toBeLessThan(start)
  })

  it('prices a listed group from its divisions: cash paid out or a division sold moves the price at once', () => {
    const { g, assets } = setup(12, ['restaurant', 'cafe', 'bakery'])
    expect(formGroup(g, assets.map((a) => a.id), 'Priced Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    for (const a of assets) {
      const b = bizOf(g, a)
      b.last = { ...b.last!, net: 150_000_000, revenue: 700_000_000 }
      refreshValue(a, b)
    }
    expect(groupIpo(g, id)).toBe(true)
    drain(g)
    const value0 = groupValue(groupById(g, id)!)
    const price0 = sharePriceOf(groupById(g, id)!)
    // A division pays its owners: the group is worth exactly that much less.
    const div = findBusiness(g, assets[1].id)!
    const db = bizOf(g, div)
    db.cash += 5_000_000
    db.valuation += 5_000_000
    refreshValue(div, db)
    const value1 = groupValue(groupById(g, id)!)
    expect(payDividend(g, div, db, 4_000_000)).toBe(true)
    drain(g)
    expect(groupValue(groupById(g, id)!)).toBeLessThan(value1)
    expect(Math.abs(value1 - groupValue(groupById(g, id)!) - 4_000_000)).toBeLessThan(value1 * 0.02 + 10)
    // Selling a division takes its value out of the price before anyone can sell group shares.
    const before = groupValue(groupById(g, id)!)
    const gone = bizOf(g, findBusiness(g, assets[2].id)!)
    const goneValue = groupById(g, id)!.members.find((x) => x.a.id === assets[2].id)!
    sellBusiness(g, findBusiness(g, assets[2].id)!, gone, gone.valuation, 'a buyer')
    drain(g)
    const after = groupById(g, id)!
    expect(after.members.length).toBe(2)
    expect(groupValue(after)).toBeLessThan(before)
    expect(Math.abs(before - groupValue(after) - (goneValue.b.valuation + (after.core.mult - 1) * (goneValue.b.valuation - goneValue.b.cash + goneValue.b.debt)))).toBeLessThan(before * 0.01 + 10)
    expect(sharePriceOf(after)).toBeLessThan(price0)
    void value0
  })

  it('takes over a listed company\'s listing when it joins, and buys rivals with pooled cash', () => {
    const { g, assets } = setup(13, ['restaurant', 'cafe'])
    const pb = bizOf(g, assets[1])
    pb.public = true
    pb.exchange = 'NYSE'
    pb.ipoYear = 2010
    pb.share = 0.8
    pb.sharesOut = 1_000_000
    pb.sharePrice = Math.max(1, Math.round(pb.valuation / 1_000_000))
    pb.valuation = Math.round(pb.sharePrice * pb.sharesOut)
    refreshValue(assets[1], pb)
    const before = netWorth(g)
    let formed: GameState | null = null
    for (let seed = 0; seed < 12 && !formed; seed++) {
      const gg = structuredClone(g)
      gg.rng = 900 + seed
      if (formGroup(gg, assets.map((a) => a.id), 'Listed Food')) formed = gg
      drain(gg)
    }
    expect(formed).not.toBeNull()
    const grp = groupsOf(formed!)[0]
    expect(grp.core.listing?.exchange).toBe('NYSE')
    expect(grp.members.every((x) => !x.b.public)).toBe(true)
    expect(grp.core.share).toBeGreaterThan(0.8)
    expect(grp.core.share).toBeLessThan(1)
    const after = netWorth(formed!)
    expect(after).toBeLessThanOrEqual(before)
    expect(before - after).toBeLessThan(before * 0.08)
    // Acquisitions: a sister division's spare cash pays for the buyer's deal.
    const g2 = formed!
    const live = liveGroup(g2, grp.core.id)!
    const buyer = live.members[0]
    const sister = live.members[1]
    const v = marketViewOf(g2, buyer.b)
    const target = [...v.rivals].reverse().find((r) => !r.legacy && acquisitionQuote(g2, buyer.b, r.id) && !acquisitionQuote(g2, buyer.b, r.id)!.block)
    expect(target).toBeTruthy()
    const q = acquisitionQuote(g2, buyer.b, target!.id)!
    sister.b.cash += q.price * 2
    sister.b.valuation += q.price * 2
    expect(acquirePower(g2, live, buyer)).toBeGreaterThanOrEqual(q.price)
    const outlets0 = buyer.b.outlets.reduce((t, o) => t + o.count, 0)
    const sisterCash0 = sister.b.cash
    const share0 = v.share
    let ok = false
    for (let i = 0; i < 6 && !ok; i++) {
      ok = acquireForGroup(g2, grp.core.id, buyer.a.id, target!.id)
      drain(g2)
      if (!ok) g2.year += 1
    }
    expect(ok).toBe(true)
    const nb = readBiz(g2, buyer.a)
    expect(nb.outlets.reduce((t, o) => t + o.count, 0)).toBeGreaterThanOrEqual(outlets0)
    expect(readBiz(g2, sister.a).cash).toBeLessThan(sisterCash0)
    expect(marketViewOf(g2, nb).share).toBeGreaterThan(share0)
  })

  it('merge and spin-off loops only lose money', () => {
    const { g, assets } = setup(7, ['restaurant', 'cafe'])
    let nw = netWorth(g)
    for (let i = 0; i < 4; i++) {
      expect(formGroup(g, assets.map((a) => a.id), `Loop ${i}`)).toBe(true)
      drain(g)
      const id = groupsOf(g)[0].core.id
      const mid = netWorth(g)
      expect(mid).toBeLessThan(nw)
      expect(spinOff(g, id, assets[0].id)).toBe(true)
      drain(g)
      const end = netWorth(g)
      expect(end).toBeLessThan(mid + 1)
      for (const a of assets) expect(readBiz(g, a).share).toBeCloseTo(1, 6)
      nw = end
    }
  })

  it('blocks a merger that regulators would never allow', () => {
    const { g, assets } = setup(8, ['restaurant', 'restaurant'])
    for (const a of assets) {
      const b = bizOf(g, a)
      saveMarket(b, { ...emptyMarket(marketKey(b)), year: g.year - 1, share: 0.4, base: 0.4, rank: 1, size: 1e9 })
    }
    expect(antitrustBlock(g, assets.map((a) => readBiz(g, a)))).toMatch(/block/)
    expect(formGroup(g, assets.map((a) => a.id), 'Monopoly Co')).toBe(false)
    expect(groupsOf(g).length).toBe(0)
  })

  it('loads old saves (no group) and saves with a group, which keep playing', () => {
    const { g, assets } = setup(9, ['salon', 'beauty'])
    const raw = JSON.parse(JSON.stringify(assets[0].details)) as Record<string, Json>
    delete raw.group
    expect(normalizeBiz(raw, 2026).group).toBeUndefined()
    expect(formGroup(g, assets.map((a) => a.id), 'Glow Group')).toBe(true)
    drain(g)
    const saved = JSON.parse(JSON.stringify(g)) as GameState
    // A corrupted copy of the group record on one member: the other copy wins.
    const m0 = saved.assets.find((a) => a.id === assets[0].id)!
    ;(m0.details.group as Record<string, Json>).core = { junk: true }
    expect(groupsOf(saved).length).toBe(1)
    book(saved, 3)
    expect(groupsOf(saved).length).toBe(1)
    expect(finite(netWorth(saved))).toBe(true)
    // Every copy damaged: the player's share is read off their stakes, never assumed to be 100%.
    const broken = JSON.parse(JSON.stringify(g)) as GameState
    for (const a of broken.assets.filter((x) => x.kind === 'business')) {
      a.details.share = 0.6
      ;(a.details.group as Record<string, Json>).core = { junk: true }
    }
    const grp = groupsOf(broken)[0]
    expect(grp.core.share).toBeCloseTo(0.6, 5)
    book(broken, 1)
    for (const a of broken.assets.filter((x) => x.kind === 'business')) expect(readBiz(broken, a).share).toBeLessThanOrEqual(0.6 + 1e-6)
  })

  it('heirs inherit the group intact; prison brings in an interim group CEO', () => {
    const { g, assets } = setup(10, ['gym', 'clinic', 'beauty'])
    expect(formGroup(g, assets.map((a) => a.id), 'Family Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    // Prison: the group carries on under an interim CEO.
    const jailed = structuredClone(g)
    sendToPrison(jailed, 'Tax Evasion', 3)
    drain(jailed)
    book(jailed, 1)
    const gj = groupById(jailed, id)!
    expect(gj.core.ceo).toBe('manager')
    expect(gj.core.manager).not.toBeNull()
    // Death: one adult heir keeps everything, the group included.
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: g.character.lastName, relationship: 90 })
    g.character.willBeneficiaries = [kid.id]
    g.character.alive = false
    g.character.causeOfDeath = 'Old Age'
    const next = continueAsChild(g, kid.id)
    const inherited = groupById(next, id)
    expect(inherited).not.toBeNull()
    expect(inherited!.members.length).toBe(3)
    book(next, 2)
    expect(groupById(next, id)!.members.length).toBe(3)
  })

  it('runs a five-division group with a hired CEO for twenty years without errors', () => {
    const { g, assets } = setup(11, ['restaurant', 'grocery', 'farm', 'logistics', 'software'])
    becomeCeo(g, assets[0], bizOf(g, assets[0]))
    expect(formGroup(g, assets.map((a) => a.id), 'Big Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    // Hire the strongest candidate from an executive search.
    searchGroupCeo(g, id, 'executive')
    drain(g, (choices) => choices.find((c) => /^m\d/.test(c.id))?.id ?? choices[0].id)
    expect(groupById(g, id)!.core.ceo).toBe('manager')
    for (let y = 0; y < 20; y++) {
      book(g, 1)
      const grp = groupById(g, id)
      if (!grp) break
      expect(finite(netWorth(g))).toBe(true)
      expect(finite(g.character.money)).toBe(true)
      for (const x of grp.members) {
        expect(finite(x.b.cash)).toBe(true)
        expect(finite(x.b.valuation)).toBe(true)
        expect(x.b.valuation).toBeGreaterThanOrEqual(0)
        expect(x.b.share).toBeGreaterThan(0)
        expect(x.b.share).toBeLessThanOrEqual(1)
        expect(finite(x.a.value)).toBe(true)
      }
      expect(grp.core.mult).toBeGreaterThan(0)
      // Use the group screen now and then.
      if (y % 5 === 2) {
        const pay = all(g, conglomerateNodes(g)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.group.dividend.${id}`)
        if (pay && !pay.disabledReason?.(g)) {
          pay.run(g, pay.input?.defaultValue?.(g))
          drain(g)
        }
      }
      const json = JSON.stringify(g)
      expect(JSON.stringify(JSON.parse(json))).toBe(json)
    }
    void groupValue
    void synergyPlan
    void addToGroup
    void groupDividend
    void valuationOf
  })
})

export type { BizState }
