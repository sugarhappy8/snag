// Conglomerates, adversarial review: value can't be minted by restructuring a listed group at a
// market premium or discount, outside investors who buy into a division after it joined keep
// their stake, regulators count sister divisions, synergies don't reward shell companies, the
// dividend preview is the payout, damaged membership records heal, and menus stay pure.
import { describe, expect, it } from 'vitest'
import { netWorth } from '../src/game/core'
import { installManager, managerCandidate } from '../src/game/business/career'
import { acquireForGroup, addToGroup, delistEffect, delistGroup, dividendSplit, formGroup, groupAcquireWhy, groupDividend, moveCash, movableCash, planJoin, spinOff } from '../src/game/business/conglomerate-actions'
import { groupAcquireBlock, synergyPlan } from '../src/game/business/conglomerate-econ'
import { groupById, groupsOf, inGroup, liveGroup, moodOf, saveGroup, syncMembers } from '../src/game/business/conglomerate-state'
import { conglomerateNodes } from '../src/game/business/conglomerate'
import { emptyMarket } from '../src/game/business/competition-state'
import { marketViewOf, saveMarket } from '../src/game/business/competition'
import { acquisitionQuote } from '../src/game/business/competition-moves'
import { marketKey } from '../src/game/business/competition-core'
import { bestPlan, refreshValue } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, businessAssets, findBusiness, readBiz, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { businessesMenu } from '../src/game/business'
import type { Industry } from '../src/game/data/markets'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, Json, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

const SAFE = ['decline', 'keep', 'no', 'refuse', 'cancel', 'ignore', 'reject', 'pass']

function drain(g: GameState): void {
  for (let guard = 0; g.queue.length && guard < 600; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const id = m.choices.find((c) => SAFE.includes(c.id))?.id ?? m.choices[0].id
      if (m.source === 'script') runScript(g, m.scriptId!, id, m.data, m)
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
  g.character.money = 50_000_000
  g.character.talent = null
  g.character.talents = []
  return g
}

function addCompany(g: GameState, name: string, industry: Industry, city: number): Asset {
  const c = getCountry('us').cities[city]
  const b0 = newBiz(g, industry, 'us', c, { cash: 3_000_000, founded: 2018, outlets: [{ countryId: 'us', city: c, count: 6, opened: 2018 }] })
  const a = createBusinessAsset(g, name, b0, 200_000)
  g.assets.push(a)
  const b = bizOf(g, a)
  installManager(g, b, managerCandidate(g, b, 70))
  const p = bestPlan(g, b)
  b.price = p.price
  b.production = p.production
  return a
}

function book(g: GameState, years: number): void {
  for (let y = 0; y < years; y++) {
    g.year += 1
    g.character.age += 1
    yearlyBusinessImpl(g)
    drain(g)
  }
}

function setup(seed: number, industries: Industry[], cities?: number[]): { g: GameState; assets: Asset[] } {
  const g = life(seed)
  const assets = industries.map((ind, i) => addCompany(g, `Co ${i + 1}`, ind, cities?.[i] ?? i % 3))
  book(g, 2)
  g.queue = []
  const live = assets.map((a) => findBusiness(g, a.id))
  if (live.some((a) => !a)) throw new Error(`seed ${seed}: a test company went under before the test began`)
  return { g, assets: live as Asset[] }
}

/** Pretend the group has been listed for years and the market prices its operating value at `mood`. */
function list(g: GameState, id: string, mood: number, share = 0.7): void {
  const grp = liveGroup(g, id)!
  grp.core.listing = { exchange: 'NYSE', ipoYear: g.year - 5, sharesOut: 100_000, sharePrice: 1 }
  grp.core.share = share
  grp.core.mult = mood * (1 - grp.core.discount)
  syncMembers(grp)
  saveGroup(g, grp)
}

function lcg(seed: number): () => number {
  let r = seed
  return () => {
    r = (r * 1103515245 + 12345) % 2147483648
    return r / 2147483648
  }
}

function walk(g: GameState, nodes: MenuNode[], depth = 0): number {
  let n = 0
  for (const x of nodes) {
    n++
    if (x.type === 'heading' || x.type === 'info') continue
    if (typeof x.subtitle === 'function') x.subtitle(g)
    x.hint?.(g)
    x.visible?.(g)
    x.disabledReason?.(g)
    if (x.type === 'action') {
      x.confirm?.(g)
      const i = x.input
      if (i) {
        i.defaultValue?.(g)
        if (i.preview) {
          i.preview(g, i.min ?? 1)
          i.preview(g, i.max ?? 100)
        }
      }
    } else if (depth < 7) {
      if (typeof x.header === 'function') x.header(g)
      n += walk(g, x.children(g), depth + 1)
    }
  }
  return n
}

describe('conglomerates under review', () => {
  it('an investor who buys into a division after it joined keeps that stake through any group move', () => {
    const { g, assets } = setup(3, ['restaurant', 'cafe'])
    expect(formGroup(g, assets.map((a) => a.id), 'Drift Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    // A cash crunch brings in an investor: 40% of the division for fresh cash (yearly.ts 'investor').
    const b = bizOf(g, findBusiness(g, assets[0].id)!)
    b.share = b.share * 0.6
    b.cash += 1_000_000
    b.valuation += 1_000_000
    const grp = groupById(g, id)!
    expect(grp.members.find((x) => x.a.id === assets[0].id)!.m.own).toBeCloseTo(0.6, 3)
    // The division's own outside investors close its treasury door, both ways.
    expect(movableCash(g, grp.members.find((x) => x.a.id === assets[0].id)!)).toBe(0)
    expect(moveCash(g, id, assets[1].id, assets[0].id, 10_000)).toBe(false)
    drain(g)
    // Moves that re-sync every member never hand the investor's slice back to the player.
    groupDividend(g, id, 1)
    drain(g)
    expect(readBiz(g, findBusiness(g, assets[0].id)!).share).toBeCloseTo(0.6, 3)
    book(g, 1)
    expect(readBiz(g, findBusiness(g, assets[0].id)!).share).toBeLessThan(0.61)
  })

  it('adding a company to a listed group at a market premium and spinning it off again never mints value', () => {
    const { g, assets } = setup(7, ['restaurant', 'cafe', 'bakery'])
    expect(formGroup(g, assets.slice(0, 2).map((a) => a.id), 'Bull Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    list(g, id, 1.6, 0.75)
    const j = assets[2]
    let w = netWorth(g)
    const v0 = readBiz(g, j).valuation
    for (let i = 0; i < 4; i++) {
      expect(addToGroup(g, id, j.id)).toBe(true)
      drain(g)
      expect(netWorth(g)).toBeLessThanOrEqual(w + 1)
      w = netWorth(g)
      expect(spinOff(g, id, j.id)).toBe(true)
      drain(g)
      expect(netWorth(g)).toBeLessThanOrEqual(w + 1)
      w = netWorth(g)
    }
    // The spun-off company doesn't inflate cycle after cycle.
    expect(readBiz(g, findBusiness(g, j.id)!).valuation).toBeLessThan(v0 * 1.4)
  })

  it('restructuring at any market mood never raises net worth (cash counts at face on both sides)', () => {
    for (const mood of [0.5, 0.8, 1.3, 2]) {
      for (const seed of [11, 12]) {
        const { g, assets } = setup(seed, ['restaurant', 'cafe', 'software', 'gym'])
        expect(formGroup(g, assets.slice(0, 3).map((a) => a.id), 'Fuzz Group')).toBe(true)
        drain(g)
        const id = groupsOf(g)[0].core.id
        list(g, id, mood)
        const next = lcg(seed * 7919 + Math.round(mood * 100))
        let w = netWorth(g)
        for (let step = 0; step < 30; step++) {
          const grp = groupById(g, id)
          if (!grp) break
          const ids = grp.members.map((x) => x.a.id)
          const solo = assets.filter((a) => findBusiness(g, a.id) && !ids.includes(a.id))
          const k = next()
          if (k < 0.3 && solo.length) {
            const x = solo[Math.floor(next() * solo.length)].id
            if (addToGroup(g, id, x)) {
              drain(g)
              spinOff(g, id, x)
            }
          } else if (k < 0.55 && ids.length > 2) {
            const x = ids[Math.floor(next() * ids.length)]
            // Load the leaving division with the group's spare cash first.
            for (const o of ids) if (o !== x) moveCash(g, id, o, x, 1e12)
            drain(g)
            if (spinOff(g, id, x)) {
              drain(g)
              addToGroup(g, id, x)
            }
          } else if (k < 0.85) moveCash(g, id, ids[Math.floor(next() * ids.length)], ids[Math.floor(next() * ids.length)], next() * 5_000_000)
          else groupDividend(g, id, next() * 2_000_000)
          drain(g)
          const w2 = netWorth(g)
          expect(w2, `mood ${mood} seed ${seed} step ${step}`).toBeLessThanOrEqual(w + 2_000)
          w = w2
        }
        const left = groupById(g, id)
        if (left) expect(Number.isFinite(moodOf(left.core))).toBe(true)
      }
    }
  }, 120_000)

  it('regulators count sister divisions in the same market when the group buys a rival', () => {
    const { g, assets } = setup(8, ['restaurant', 'restaurant'], [0, 0])
    expect(marketKey(readBiz(g, assets[0]))).toBe(marketKey(readBiz(g, assets[1])))
    // Formed while both are small, then the sister grows to a big slice of the market.
    expect(formGroup(g, assets.map((a) => a.id), 'Diner Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    const grp0 = groupById(g, id)!
    const buyer = grp0.members[0]
    const sister = grp0.members[1]
    const v = marketViewOf(g, buyer.b)
    const target = v.rivals.find((r) => {
      if (r.legacy) return false
      const q = acquisitionQuote(g, buyer.b, r.id)
      return !!q && !q.block
    })
    expect(target).toBeTruthy()
    const sb = bizOf(g, sister.a)
    saveMarket(sb, { ...emptyMarket(marketKey(sb)), year: g.year - 1, share: 0.45, base: 0.45, rank: 1, size: 1e9 })
    // On its own the buyer could do this deal; with its sister the group would be too big.
    expect(acquisitionQuote(g, buyer.b, target!.id)!.block).toBeNull()
    expect(groupAcquireBlock(g, buyer.b, [readBiz(g, sister.a)], target!.share)).toMatch(/block/)
    expect(groupAcquireBlock(g, buyer.b, [], target!.share)).toBeNull()
    const grp = groupById(g, id)!
    expect(groupAcquireWhy(g, grp, grp.members.find((x) => x.a.id === buyer.a.id)!, target!.id)).toMatch(/block/)
    expect(acquireForGroup(g, id, buyer.a.id, target!.id)).toBe(false)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Deal Blocked')).toBe(true)
  })

  it('splitting a sister into shell companies adds no purchasing power or cross-selling', () => {
    const { g, assets } = setup(4, ['manufacturing', 'manufacturing'])
    const big = readBiz(g, assets[0])
    expect(big.last).not.toBeNull()
    const scaled = (k: number): BizState => {
      const b = structuredClone(big)
      const s = b.last!
      for (const key of ['revenue', 'cogs', 'wages', 'keyStaff', 'rent', 'upkeep', 'netRevenue', 'marketing'] as const) s[key] = s[key] * k
      return b
    }
    const one = synergyPlan([{ id: 'big', b: big, own: 1 }, { id: 's', b: scaled(0.4), own: 1 }], 1)
    const shells = synergyPlan([{ id: 'big', b: big, own: 1 }, ...[0, 1, 2, 3].map((i) => ({ id: `s${i}`, b: scaled(0.1), own: 1 }))], 1)
    const p1 = one.divisions[0].purchasing
    const p4 = shells.divisions[0].purchasing
    expect(p1).toBeGreaterThan(0)
    expect(p4).toBeLessThanOrEqual(p1 + 1e-9)
    // And the shells cost more in complexity.
    expect(shells.divisions[0].complexity).toBeGreaterThan(one.divisions[0].complexity)
  })

  it('the dividend preview is exactly what the player is paid, even with a part-owned division', () => {
    const { g, assets } = setup(5, ['restaurant', 'cafe', 'bakery'])
    expect(formGroup(g, assets.map((a) => a.id), 'Payout Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    const b = bizOf(g, findBusiness(g, assets[1].id)!)
    b.share = b.share * 0.5
    for (const a of assets) {
      const x = bizOf(g, findBusiness(g, a.id)!)
      x.cash += 4_000_000
      x.valuation += 4_000_000
    }
    const grp = groupById(g, id)!
    const ask = 3_000_000
    const split = dividendSplit(g, grp, ask)
    expect(split.n).toBeGreaterThan(0)
    expect(split.mine).toBeLessThan(split.n)
    const money0 = g.character.money
    expect(groupDividend(g, id, ask)).toBe(true)
    drain(g)
    expect(g.character.money - money0).toBe(split.mine)
  })

  it('the take-private hint is the net worth change the buyout books', () => {
    for (const mood of [0.6, 1.4]) {
      const { g, assets } = setup(9, ['restaurant', 'cafe', 'bakery'])
      expect(formGroup(g, assets.map((a) => a.id), 'Private Group')).toBe(true)
      drain(g)
      const id = groupsOf(g)[0].core.id
      list(g, id, mood, 0.7)
      const effect = delistEffect(g, groupById(g, id)!)
      if (mood < 1) expect(effect).toBeGreaterThan(0)
      else expect(effect).toBeLessThan(0)
      let done: GameState | null = null
      for (let i = 0; i < 12 && !done; i++) {
        const gg = structuredClone(g)
        gg.rng = 4242 + i
        if (delistGroup(gg, id)) done = gg
      }
      expect(done).not.toBeNull()
      const change = netWorth(done!) - netWorth(g)
      expect(Math.abs(change - effect)).toBeLessThan(Math.max(5_000, Math.abs(effect) * 0.01))
      expect(groupById(done!, id)!.core.listing).toBeNull()
    }
  })

  it('the share the merger screen promises is the share the player gets', () => {
    const { g, assets } = setup(10, ['restaurant', 'cafe', 'bakery'])
    const b = bizOf(g, findBusiness(g, assets[1].id)!)
    b.share = 0.6
    b.pref = Math.round(b.valuation * 0.3)
    const promised = planJoin(g, null, assets.slice(0, 2)).share
    expect(promised).toBeLessThan(1)
    let done: GameState | null = null
    for (let i = 0; i < 12 && !done; i++) {
      const gg = structuredClone(g)
      gg.rng = 777 + i
      if (formGroup(gg, assets.slice(0, 2).map((a) => a.id), 'Promise Group')) done = gg
    }
    expect(done).not.toBeNull()
    const grp = groupsOf(done!)[0]
    expect(grp.core.share).toBeCloseTo(promised, 6)
    const next = planJoin(done!, grp, [assets[2]]).share
    expect(addToGroup(done!, grp.core.id, assets[2].id)).toBe(true)
    expect(groupsOf(done!)[0].core.share).toBeCloseTo(next, 6)
  })

  it('heals damaged membership records instead of hiding the companies', () => {
    const { g, assets } = setup(6, ['salon', 'beauty'])
    expect(formGroup(g, assets.map((a) => a.id), 'Glow Group')).toBe(true)
    drain(g)
    for (const a of assets) {
      const d = findBusiness(g, a.id)!.details
      const grp = d.group as Record<string, Json>
      ;(grp.core as Record<string, Json>).id = 'somebody-else'
    }
    // Unreadable: neither a group nor hidden.
    expect(groupsOf(g).length).toBe(0)
    expect(assets.every((a) => !inGroup(g, findBusiness(g, a.id)!.details))).toBe(true)
    const rows = businessesMenu.children(g).map((n) => n.id)
    for (const a of assets) expect(rows).toContain(`biz.company.${a.id}`)
    book(g, 1)
    for (const a of businessAssets(g)) expect(readBiz(g, a).group).toBeUndefined()
    for (const a of businessAssets(g)) {
      const b = bizOf(g, a)
      refreshValue(a, b)
      expect(Number.isFinite(a.value)).toBe(true)
    }
  })

  it('menus of a listed group with a board, a mandate and outside holders never change state or use the RNG', () => {
    const { g, assets } = setup(5, ['restaurant', 'cafe', 'software', 'gym'])
    g.character.talents = ['Business']
    expect(formGroup(g, assets.slice(0, 3).map((a) => a.id), 'Pure Group')).toBe(true)
    drain(g)
    const id = groupsOf(g)[0].core.id
    list(g, id, 1.1, 0.6)
    {
      const grp = liveGroup(g, id)!
      grp.core.mandate = 'growth'
      saveGroup(g, grp)
    }
    book(g, 1)
    const before = JSON.stringify(g)
    const rng0 = g.rng
    expect(walk(g, conglomerateNodes(g))).toBeGreaterThan(100)
    expect(g.rng).toBe(rng0)
    expect(JSON.stringify(g)).toBe(before)
  })
})
