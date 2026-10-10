// Conglomerates under random play: a driver taps every group action (sliders, names, spin-offs,
// IPOs, CEO searches, acquisitions...) with random inputs for years, answering every popup, and
// the books must stay sane (finite money, no negative values, a clean save round trip, no stuck
// queue). Plus the Business talent's hints: honest best fits and spin-off reads, no RNG used.
import { describe, expect, it } from 'vitest'
import { netWorth } from '../src/game/core'
import { installManager, managerCandidate } from '../src/game/business/career'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { joinValue, ownerCapture } from '../src/game/business/conglomerate-econ'
import { allGroups, groupsOf } from '../src/game/business/conglomerate-state'
import { conglomerateNodes } from '../src/game/business/conglomerate'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessView } from '../src/game/business/manage'
import { bizOf, businessAssets, findBusiness, readBiz } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { ageUp } from '../src/game/aging'
import { continueAsChild, createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'

function rng(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] }
}
type Driver = ReturnType<typeof rng>

function drain(g: GameState, d: Driver): void {
  for (let guard = 0; g.queue.length; guard++) {
    if (guard > 400) throw new Error(`queue stuck: ${JSON.stringify(g.queue[0]).slice(0, 200)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const c = d.pick(m.choices)
      if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.input === 'text' ? m.defaultValue || 'Name' : String(d.int(m.min ?? 1, Math.max(m.min ?? 1, Math.min(m.max ?? 1000, (m.min ?? 1) + 1e7)))), m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function actions(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 5) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason && n.disabledReason(g)) continue
    if (n.type === 'action') out.push(n)
    // Don't wander into every division's whole company screen (the main suite covers those).
    else if (!n.id.startsWith('biz.company.')) actions(g, n.children(g), depth + 1, out)
  }
  return out
}

function hints(g: GameState, nodes: MenuNode[], depth = 0, out: string[] = []): string[] {
  if (depth > 5) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    const h = n.hint?.(g)
    if (h) out.push(`${n.id}: ${h}`)
    if (n.type === 'menu' && !n.id.startsWith('biz.company.')) hints(g, n.children(g), depth + 1, out)
  }
  return out
}

function inputFor(a: MenuAction, g: GameState, d: Driver): string | undefined {
  const i = a.input
  if (!i) return undefined
  if (i.kind === 'text') return i.defaultValue?.(g) ?? 'Group'
  const lo = i.min ?? 1
  const hi = Math.max(lo, i.max ?? lo + 1000)
  // Sometimes the default, sometimes the extremes, sometimes junk.
  const r = d.next()
  if (r < 0.25) return i.defaultValue?.(g) ?? String(lo)
  if (r < 0.35) return String(hi * 3)
  if (r < 0.4) return 'lots of money'
  return String(Math.round(lo + (hi - lo) * d.next()))
}

function sane(g: GameState): void {
  expect(Number.isFinite(g.character.money)).toBe(true)
  expect(Number.isFinite(netWorth(g))).toBe(true)
  for (const a of businessAssets(g)) {
    const b = readBiz(g, a)
    for (const k of ['cash', 'debt', 'valuation', 'share', 'invested'] as const) expect(Number.isFinite(b[k]), `${a.name}.${k}`).toBe(true)
    expect(b.valuation).toBeGreaterThanOrEqual(0)
    expect(b.debt).toBeGreaterThanOrEqual(0)
    expect(b.share).toBeGreaterThan(0)
    expect(b.share).toBeLessThanOrEqual(1)
    expect(Number.isFinite(a.value) && a.value >= 0).toBe(true)
  }
  for (const grp of allGroups(g)) {
    expect(grp.core.share).toBeGreaterThan(0)
    expect(grp.core.share).toBeLessThanOrEqual(1)
    expect(Number.isFinite(grp.core.mult)).toBe(true)
    if (grp.core.listing) expect(grp.core.listing.sharePrice).toBeGreaterThan(0)
  }
  const json = JSON.stringify(g)
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
}

function world(seed: number, industries: Industry[]): GameState {
  const g = createNewLife({ seed, year: 1980, countryId: 'us' })
  g.queue = []
  g.year = 2022
  g.character.age = 42
  g.character.money = 8_000_000
  g.character.talent = null
  g.character.talents = ['Business']
  industries.forEach((ind, i) => {
    const city = getCountry('us').cities[i % 4]
    const b0 = newBiz(g, ind, 'us', city, { cash: 2_500_000, founded: 2016, outlets: [{ countryId: 'us', city, count: 5, opened: 2016 }] })
    const a = createBusinessAsset(g, `${ind} ${i}`, b0, 250_000)
    g.assets.push(a)
    const b = bizOf(g, a)
    installManager(g, b, managerCandidate(g, b, 65))
    const p = bestPlan(g, b)
    b.price = p.price
    b.production = p.production
  })
  return g
}

describe('conglomerates under random play', () => {
  it('survives a driver tapping every group action for years', () => {
    let totalTapped = 0
    for (const seed of [1, 2, 3, 4]) {
      const d = rng(seed * 104729)
      const g = world(seed, ['restaurant', 'cafe', 'grocery', 'gym', 'software'])
      let tapped = 0
      for (let year = 0; year < 15 && g.character.alive; year++) {
        for (let i = 0; i < 10; i++) {
          const all = actions(g, conglomerateNodes(g))
          // The checklist toggles are many; tap them now and then, the group's moves mostly.
          const moves = all.filter((x) => !x.id.startsWith('biz.groupPick.') && x.id !== 'biz.group.form.clear')
          const list = moves.length && d.next() < 0.7 ? moves : all
          if (!list.length) break
          const a = d.pick(list)
          const input = inputFor(a, g, d)
          try {
            a.run(g, input)
            drain(g, d)
            sane(g)
          } catch (err) {
            throw new Error(`seed ${seed} year ${g.year}: ${a.id} (${input}): ${err instanceof Error ? err.stack : String(err)}`)
          }
          tapped++
        }
        g.year += 1
        g.character.age += 1
        g.character.money = Math.max(g.character.money, 1_000_000)
        yearlyBusinessImpl(g)
        drain(g, d)
        sane(g)
      }
      // Selling/dissolving every business is a valid random-play terminal state.
      // Require coverage across the batch, not immortality of every random group.
      expect(tapped).toBeGreaterThan(0)
      totalTapped += tapped
    }
    expect(totalTapped).toBeGreaterThan(80)
  }, 240_000)

  it('lives whole years with a group through the real yearly loop, to the heir and beyond', () => {
    for (const seed of [21, 22]) {
      const d = rng(seed)
      const g = world(seed, ['restaurant', 'bakery', 'hotel', 'farm'])
      g.character.age = 60
      for (let y = 0; y < 2; y++) {
        ageUp(g)
        drain(g, d)
      }
      const ids = businessAssets(g).map((a) => a.id)
      if (ids.length >= 2) {
        formGroup(g, ids, 'Lifetime Group')
        drain(g, d)
      }
      for (let y = 0; y < 30 && g.character.alive; y++) {
        const list = actions(g, conglomerateNodes(g)).filter((x) => !x.id.startsWith('biz.groupPick.'))
        if (list.length && d.next() < 0.5) {
          const a = d.pick(list)
          a.run(g, inputFor(a, g, d))
          drain(g, d)
        }
        ageUp(g)
        drain(g, d)
        sane(g)
      }
      if (!g.character.alive) {
        const kid = g.people.find((p) => p.alive && p.relation === 'child') ?? createPerson(g, { relation: 'child', age: 35, lastName: g.character.lastName, relationship: 80 })
        const next = continueAsChild(g, kid.id)
        for (let y = 0; y < 3 && next.character.alive; y++) {
          ageUp(next)
          drain(next, d)
          sane(next)
        }
      }
    }
  }, 240_000)

  it('gives honest Business talent hints without touching the RNG', () => {
    const g = world(5, ['restaurant', 'cafe', 'software'])
    for (let y = 0; y < 2; y++) {
      g.year += 1
      yearlyBusinessImpl(g)
      drain(g, rng(9))
    }
    const ids = businessAssets(g).map((a) => a.id)
    const rngBefore = g.rng
    const formHints = hints(g, conglomerateNodes(g))
    expect(g.rng).toBe(rngBefore)
    // Two picks: the checklist marks the best third company, and the merge row prices the deal.
    g.flags['biz.groupPick'] = [ids[0]]
    const pickHints = hints(g, conglomerateNodes(g)).filter((h) => h.startsWith('biz.groupPick.'))
    expect(pickHints.length).toBe(1)
    // The related café fits a restaurant better than the software company does.
    const restaurant = findBusiness(g, ids[0])!
    const cafe = findBusiness(g, ids[1])!
    const soft = findBusiness(g, ids[2])!
    const pair = (x: Asset) => joinValue(g, null, [{ id: restaurant.id, b: readBiz(g, restaurant) }, { id: x.id, b: readBiz(g, x) }], ownerCapture(g))
    expect(pair(cafe).yearly).toBeGreaterThan(pair(soft).yearly)
    expect(pickHints[0]).toContain(`biz.groupPick.${cafe.id}`)
    expect(g.rng).toBe(rngBefore)
    void formHints
    delete g.flags['biz.groupPick']
    expect(formGroup(g, [restaurant.id, cafe.id], 'Hint Group')).toBe(true)
    drain(g, rng(3))
    const grp = groupsOf(g)[0]
    const before = g.rng
    const all = hints(g, conglomerateNodes(g))
    expect(g.rng).toBe(before)
    // The software company is the only candidate: the add menu gives a fit read.
    expect(all.some((h) => h.startsWith(`biz.group.add.${grp.core.id}`))).toBe(true)
    // Each division's spin-off row says whether it would unlock value.
    expect(all.filter((h) => h.startsWith(`biz.group.spin.`)).length).toBe(2)
    // A division's own screen has its spin-off row and no IPO of its own.
    const view = businessView(g, findBusiness(g, cafe.id)!)
    expect(view.some((n) => n.id === `biz.spinOff.${cafe.id}`)).toBe(true)
    expect(view.some((n) => n.id === `biz.ipo.${cafe.id}`)).toBe(false)
  })
})
