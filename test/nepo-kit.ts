// Shared set-up for the nepo tests: a player-run restaurant chain with booked years, plus kids.
import { becomeCeo } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, findBusiness, type BizState } from '../src/game/business/state'
import { bestPlan } from '../src/game/business/economy'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { Asset, GameState, MenuNode, Person } from '../src/game/types'
import { getCountry } from '../src/game/world'

/** Answer every queued popup with the first (or a chosen) choice until none is left. */
export function drain(g: GameState, pick: (m: { choices: { id: string }[]; title: string }) => string = (m) => m.choices[0].id): void {
  for (let guard = 0; g.queue.length && guard < 600; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const id = pick(m)
      if (m.source === 'script') runScript(g, m.scriptId!, id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || String(m.min ?? 1), m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

export interface World {
  g: GameState
  a: Asset
  b: BizState
}

/** A player-run restaurant chain with two booked years. `share` < 1 gives it outside investors (and a board). */
export function world(seed: number, opts: { share?: number; money?: number; age?: number; year?: number } = {}): World {
  for (let s = seed; s < seed + 60; s++) {
    try {
      return build(s, opts)
    } catch {
      // A random event sold or closed the company during set-up: try the next seed.
    }
  }
  throw new Error('no company survived set-up')
}

function build(seed: number, opts: { share?: number; money?: number; age?: number; year?: number }): World {
  const g = createNewLife({ seed, year: 1990, countryId: 'us' })
  g.queue = []
  const c = g.character
  c.age = opts.age ?? 50
  g.year = opts.year ?? 2026
  c.money = opts.money ?? 3_000_000
  c.talent = null
  c.talents = []
  const city = getCountry('us').cities[0]
  const b0 = newBiz(g, 'restaurant', 'us', city, { cash: 3_000_000, founded: g.year - 6, outlets: [{ countryId: 'us', city, count: 8, opened: g.year - 6 }] })
  const a = createBusinessAsset(g, 'Family Foods', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const plan = bestPlan(g, bizOf(g, a))
  bizOf(g, a).price = plan.price
  bizOf(g, a).production = plan.production
  for (let y = 0; y < 2; y++) {
    yearlyBusinessImpl(g)
    drain(g)
    g.year += 1
  }
  const cur = findBusiness(g, a.id)
  if (!cur) throw new Error('company gone')
  const b = bizOf(g, cur)
  b.share = opts.share ?? 1
  b.cash = Math.max(b.cash, 3_000_000)
  g.queue = []
  g.yearActions = {}
  return { g, a: cur, b }
}

/** A kid with chosen smarts and traits. */
export function kid(g: GameState, age: number, over: { smarts?: number; traits?: string[]; relationship?: number; entitlement?: number; gender?: 'male' | 'female'; relation?: 'child' | 'sibling' | 'spouse' } = {}): Person {
  const p = createPerson(g, {
    relation: over.relation ?? 'child',
    age,
    gender: over.gender,
    relationship: over.relationship ?? 70,
    traits: over.traits ?? ['calm', 'kind'],
    stats: { smarts: over.smarts ?? 60 },
    occupation: age < 18 ? 'Student' : 'Unemployed',
    data: over.entitlement ? { entitlement: over.entitlement } : {},
  })
  p.livesWithPlayer = false
  return p
}

export function all(g: GameState, nodes: MenuNode[], depth = 0): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' && depth < 5 ? [n, ...all(g, n.children(g), depth + 1)] : [n]))
}
