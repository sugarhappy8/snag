// Being rich, felt (events/wealth*.ts): who asks for money and how often, what it costs, and what
// answering does. Requests only come once you're well off for where and when you live, at most a
// few popups a year; allowances are paid every year until stopped; refusing hurts and giving spoils.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { netWorth } from '../src/game/core'
import { anachronismsIn } from '../src/game/events/era'
import { yearlyWealth } from '../src/game/events/wealth'
import { askDef, askDefs } from '../src/game/events/wealth-catalog'
import {
  TIER_POPUP_CAP,
  WEALTH_POPUP_CAP,
  entitlement,
  expectedReturn,
  readTies,
  repayOdds,
  typicalIncome,
  wealthTier,
} from '../src/game/events/wealth-core'
import { carPrice, setAllowance, VENTURE_PARTIAL } from '../src/game/events/wealth-kids'
import { moneyStatus, wealthNodes } from '../src/game/events/wealth-menu'
import { ASK_SCRIPT, askJson, presentAsk, readAsk } from '../src/game/events/wealth-resolve'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, ModalItem, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

function richGame(seed: number, money: number, opts: { country?: string; year?: number; age?: number } = {}): GameState {
  const g = makeTestGame(seed, { age: opts.age ?? 45, money, countryId: opts.country ?? 'us', residence: { status: 'renting', rent: 0 } })
  g.year = opts.year ?? 2026
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  return g
}

function family(g: GameState, kidAges: number[] = [16]): Person[] {
  const kids = kidAges.map((age) => createPerson(g, { relation: 'child', age, relationship: 70, lastName: g.character.lastName, livesWithPlayer: age < 18 }))
  createPerson(g, { relation: 'spouse', age: 44, relationship: 75, livesWithPlayer: true })
  createPerson(g, { relation: 'parent', age: 72, relationship: 70, money: 3_000 })
  createPerson(g, { relation: 'sibling', age: 41, relationship: 60 })
  createPerson(g, { relation: 'friend', age: 46, relationship: 65 })
  createPerson(g, { relation: 'friend', age: 39, relationship: 55 })
  return kids
}

/** One wealth year: age everyone, run the hook, and return the popups it queued. */
function wealthYear(g: GameState): ModalItem[] {
  g.year += 1
  g.character.age += 1
  for (const p of g.people) if (p.alive) p.age += 1
  g.yearActions = {}
  const before = g.queue.length
  yearlyWealth(g)
  return g.queue.slice(before)
}

function wealthPopups(items: ModalItem[]): ChoiceModal[] {
  return items.filter((m): m is ChoiceModal => m.kind === 'choice' && typeof m.scriptId === 'string' && m.scriptId.startsWith('wealth.'))
}

function askKinds(items: ModalItem[]): string[] {
  const out: string[] = []
  for (const m of wealthPopups(items)) {
    const d = m.data as Record<string, unknown> | undefined
    if (d && Array.isArray(d.asks)) for (const a of d.asks) out.push(String((a as { k: string }).k))
    else {
      const a = readAsk(m.data)
      if (a) out.push(a.k)
    }
  }
  return out
}

function askAmounts(items: ModalItem[]): number[] {
  const out: number[] = []
  for (const m of wealthPopups(items)) {
    const d = m.data as Record<string, unknown> | undefined
    if (d && Array.isArray(d.asks)) for (const a of d.asks) out.push(Number((a as { amt: number }).amt))
    else {
      const a = readAsk(m.data)
      if (a) out.push(a.amt)
    }
  }
  return out
}

/** Answer everything in the queue with `pick` (follow-ups first, like the store). */
function drain(g: GameState, pick: (m: ChoiceModal) => string, sliderPick: (min: number, max: number) => number = (lo, hi) => Math.round((lo + hi) / 2)): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 200) throw new Error('queue never drains')
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, pick(m), m.data, m)
    else if (m.kind === 'input') runScript(g, m.scriptId, String(sliderPick(m.min ?? 0, m.max ?? 0)), m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function texts(items: ModalItem[]): string[] {
  return items.flatMap((m) => (m.kind === 'choice' ? [m.title, m.text, ...m.choices.map((c) => c.label)] : m.kind === 'notice' ? [m.title, m.text] : []))
}

describe('wealth tiers', () => {
  it('is relative to the country and the era', () => {
    const us = richGame(1, 2_000_000)
    const ng = richGame(1, 2_000_000, { country: 'ng' })
    expect(wealthTier(us)).toBe(1)
    expect(wealthTier(ng)).toBeGreaterThanOrEqual(2)
    expect(typicalIncome(ng)).toBeLessThan(typicalIncome(us))
    // The same constant dollars go further in 1950.
    const old = richGame(1, 2_000_000, { year: 1950 })
    expect(typicalIncome(old)).toBeLessThan(typicalIncome(us))
    expect(wealthTier(old)).toBeGreaterThan(wealthTier(us))
    expect(wealthTier(richGame(1, 400_000))).toBe(0)
    expect(wealthTier(richGame(1, 500_000_000))).toBe(4)
  })
})

describe('who asks', () => {
  it('leaves ordinary families alone', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = richGame(seed, 60_000)
      family(g, [8, 16, 24])
      for (let y = 0; y < 10; y++) {
        const items = wealthYear(g)
        expect(wealthPopups(items)).toEqual([])
        drain(g, (m) => m.choices[0].id)
      }
    }
  })

  it('a rich US parent of a 16-year-old hears about a car and pocket money', () => {
    const kinds = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const g = richGame(seed, 6_000_000)
      const [kid] = family(g, [15])
      const items = wealthYear(g)
      expect(kid.age).toBe(16)
      for (const k of askKinds(items)) kinds.add(k)
    }
    expect(kinds.has('kid.car')).toBe(true)
    expect(kinds.has('kid.pocket')).toBe(true)
  })

  it('asks more often, and for more, the richer you are', () => {
    const run = (money: number) => {
      let count = 0
      const amounts: number[] = []
      for (let seed = 1; seed <= 15; seed++) {
        const g = richGame(seed, money)
        family(g, [10, 20, 28])
        for (let y = 0; y < 8; y++) {
          const items = wealthYear(g)
          count += askKinds(items).length
          amounts.push(...askAmounts(items).filter((a) => a > 0))
          g.queue = []
          g.character.money = money
        }
      }
      const sorted = amounts.sort((a, b) => a - b)
      return { count, median: sorted[Math.floor(sorted.length / 2)] ?? 0 }
    }
    const comfortable = run(2_000_000)
    const rich = run(20_000_000)
    const ultra = run(500_000_000)
    expect(rich.count).toBeGreaterThan(comfortable.count)
    expect(ultra.count).toBeGreaterThan(comfortable.count)
    expect(rich.median).toBeGreaterThan(comfortable.median)
    expect(ultra.median).toBeGreaterThan(rich.median)
  })

  it('Nigeria: the same fortune is richer, and asks are priced locally', () => {
    let us = 0
    let ng = 0
    for (let seed = 1; seed <= 20; seed++) {
      const a = richGame(seed, 2_000_000)
      const b = richGame(seed, 2_000_000, { country: 'ng' })
      family(a, [12, 22])
      family(b, [12, 22])
      for (let y = 0; y < 6; y++) {
        us += askKinds(wealthYear(a)).length
        ng += askKinds(wealthYear(b)).length
        a.queue = []
        b.queue = []
      }
    }
    expect(ng).toBeGreaterThan(us)
    const a = richGame(1, 2_000_000)
    const b = richGame(1, 2_000_000, { country: 'ng' })
    const ka = createPerson(a, { relation: 'child', age: 18 })
    const kb = createPerson(b, { relation: 'child', age: 18 })
    expect(carPrice(b, 'economy', kb)).toBeLessThan(carPrice(a, 'economy', ka))
  })

  it('never shows more popups a year than the cap (one letter in prison, none as a minor)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = richGame(seed, 900_000_000)
      g.character.hidden.fame = 80
      family(g, [5, 9, 13, 16, 19, 23, 30])
      for (let i = 0; i < 6; i++) createPerson(g, { relation: 'friend', age: 30 + i * 4, relationship: 60 })
      for (let y = 0; y < 10; y++) {
        const items = wealthYear(g)
        const tier = wealthTier(g)
        expect(wealthPopups(items).length).toBeLessThanOrEqual(Math.min(WEALTH_POPUP_CAP, TIER_POPUP_CAP[tier]))
        drain(g, (m) => m.choices[seed % m.choices.length].id)
        g.character.money = 900_000_000
      }
      g.character.prison = { name: 'State Pen', security: 'medium', crime: 'tax evasion', sentenceYears: 5, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 }
      for (let y = 0; y < 8; y++) {
        const items = wealthYear(g)
        expect(wealthPopups(items).length).toBeLessThanOrEqual(1)
        for (const t of texts(items)) if (/prison mail/.test(t)) expect(t).toMatch(/letter/)
        g.queue = []
      }
    }
    const kid = richGame(3, 50_000_000, { age: 12 })
    family(kid, [])
    for (let y = 0; y < 4; y++) {
      kid.character.age = 12
      expect(wealthPopups(wealthYear(kid))).toEqual([])
    }
  })

  it('keeps 1975 kids era-appropriate (no smartphones) and has them in 2026', () => {
    const seen1975: string[] = []
    const kinds1975 = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const g = richGame(seed, 30_000_000, { year: 1974 })
      family(g, [9, 11, 13, 15])
      for (let y = 0; y < 2; y++) {
        const items = wealthYear(g)
        seen1975.push(...texts(items))
        for (const k of askKinds(items)) kinds1975.add(k)
        g.queue = []
      }
    }
    expect(kinds1975.has('kid.phone')).toBe(false)
    expect(seen1975.some((t) => /smartphone|mobile phone/i.test(t))).toBe(false)
    for (const t of seen1975) expect(anachronismsIn(t, 1976, ['us']), t).toEqual([])
    const kinds2026 = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const g = richGame(seed, 30_000_000)
      family(g, [11, 13, 15])
      for (const k of askKinds(wealthYear(g))) kinds2026.add(k)
    }
    expect(kinds2026.has('kid.phone')).toBe(true)
  })
})

describe('answering', () => {
  function kidCarAsk(g: GameState, kid: Person) {
    const def = askDef('kid.car')!
    const a = def.build(g, wealthTier(g), kid)!
    expect(a).toBeTruthy()
    presentAsk(g, a)
    const m = g.queue.pop() as ChoiceModal
    return m
  }

  it('giving pleases and spoils; refusing hurts', () => {
    const g = richGame(7, 20_000_000)
    const [kid] = family(g, [17])
    kid.traits = ['funny', 'outgoing']
    const m = kidCarAsk(g, kid)
    const rel = kid.relationship
    const ent = entitlement(kid)
    const cash = g.character.money
    runScript(g, ASK_SCRIPT, 'give', m.data, m)
    expect(kid.relationship).toBeGreaterThan(rel)
    expect(entitlement(kid)).toBeGreaterThan(ent)
    expect(g.character.money).toBeLessThan(cash)
    expect(readTies(g, kid).car).toBeTruthy()

    const [kid2] = family(g, [17])
    kid2.traits = ['jealous', 'dramatic']
    const m2 = kidCarAsk(g, kid2)
    const rel2 = kid2.relationship
    const cash2 = g.character.money
    runScript(g, ASK_SCRIPT, 'no', m2.data, m2)
    expect(kid2.relationship).toBeLessThan(rel2)
    expect(g.character.money).toBe(cash2)
  })

  it('a kid who always gets everything ends up spoiled, and asks for more', () => {
    const g = richGame(11, 80_000_000)
    const [kid] = family(g, [6])
    for (let y = 0; y < 14; y++) {
      wealthYear(g)
      drain(g, (m) => (m.choices.find((c) => c.id === 'give' || c.id === 'set' || c.id === 'all') ?? m.choices[0]).id)
      g.character.money = 80_000_000
    }
    expect(kid.traits).toContain('spoiled')
    expect(entitlement(kid)).toBeGreaterThanOrEqual(60)
  })

  it('fair parenting (a real mix of yes and no) keeps a rich kid grounded', () => {
    const g = richGame(11, 80_000_000)
    const [kid] = family(g, [6])
    let turn = 0
    for (let y = 0; y < 14; y++) {
      wealthYear(g)
      drain(g, (m) => {
        const mine = readAsk(m.data)?.pid === kid.id
        const yes = m.choices.find((c) => c.id === 'give' || c.id === 'set' || c.id === 'all')
        if (!mine) return (yes ?? m.choices[0]).id
        turn += 1
        return (turn % 2 === 0 && yes ? yes : m.choices.find((c) => c.id === 'no') ?? m.choices[0]).id
      })
      g.character.money = 80_000_000
    }
    expect(entitlement(kid)).toBeLessThan(60)
    expect(kid.traits).not.toContain('spoiled')
  })

  it('never takes money you do not have, and never leaves you negative', () => {
    for (let seed = 1; seed <= 25; seed++) {
      // House-rich, cash-poor: net worth says rich, the bank account says otherwise.
      const g = richGame(seed, 2_500)
      g.assets.push({ id: 'h1', kind: 'house', name: 'Mansion', emoji: '🏛️', purchasePrice: 30_000_000, value: 30_000_000, condition: 90, purchasedAge: 30, upkeep: 0, details: {} })
      g.character.residence = { status: 'owned', assetId: 'h1' }
      const kids = family(g, [10, 17, 25])
      setAllowance(g, kids[0], 1_000_000_000)
      g.queue = []
      expect(netWorth(g)).toBeGreaterThan(20_000_000)
      for (let y = 0; y < 8; y++) {
        wealthYear(g)
        drain(g, (m) => m.choices[(seed + y) % m.choices.length].id, (_lo, hi) => hi)
        expect(g.character.money).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('pays allowances every year until they are switched off', () => {
    const g = richGame(5, 5_000_000)
    const [kid] = family(g, [10])
    setAllowance(g, kid, 2_000)
    g.queue = []
    const cash = g.character.money
    const kidMoney = kid.money
    wealthYear(g)
    expect(g.character.money).toBe(cash - 2_000)
    expect(kid.money).toBe(kidMoney + 2_000)
    expect(moneyStatus(g, kid)).toMatch(/yr/)
    g.queue = []
    setAllowance(g, kid, 0)
    g.queue = []
    const cash2 = g.character.money
    g.character.money = cash2
    // Ordinary or rich, no allowance means no transfer.
    const before = kid.money
    for (let y = 0; y < 3; y++) {
      wealthYear(g)
      g.queue = []
    }
    expect(kid.money).toBe(before)
  })

  it('asks before paying an adult, and stops when you say so', () => {
    const g = richGame(9, 400_000)
    const [kid] = family(g, [17])
    setAllowance(g, kid, 3_000)
    g.queue = []
    const items = wealthYear(g)
    const popup = wealthPopups(items).find((m) => m.scriptId === 'wealth.allowance.adult')
    expect(popup).toBeTruthy()
    g.queue = []
    runScript(g, popup!.scriptId!, 'stop', popup!.data, popup!)
    expect(readTies(g, kid).allowance).toBe(0)
  })

  it('stops an allowance you can no longer pay, without going negative', () => {
    const g = richGame(4, 100)
    const [kid] = family(g, [10])
    setAllowance(g, kid, 500)
    g.queue = []
    for (let y = 0; y < 3; y++) {
      wealthYear(g)
      g.queue = []
      expect(g.character.money).toBe(100)
    }
    expect(readTies(g, kid).allowance).toBe(0)
  })

  it('loans come back at most in full, and ventures never pay on average', () => {
    for (const d of askDefs()) expect(d.id).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
    expect(expectedReturn(0.5, VENTURE_PARTIAL)).toBeLessThan(1)
    const g = richGame(2, 10_000_000)
    const [kid] = family(g, [30])
    kid.money = 1_000_000
    kid.traits = ['honest', 'loyal']
    const def = askDef('kid.rent')!
    const a = def.build(g, wealthTier(g), kid)!
    presentAsk(g, a)
    const m = g.queue.pop() as ChoiceModal
    runScript(g, ASK_SCRIPT, 'lend', m.data, m)
    g.queue = []
    expect(readTies(g, kid).owes).toBe(a.amt)
    expect(repayOdds(kid, a.amt)).toBeGreaterThan(0.3)
    const start = g.character.money
    for (let y = 0; y < 30; y++) {
      wealthYear(g)
      g.queue = []
    }
    expect(readTies(g, kid).owes).toBe(0)
    expect(g.character.money - start).toBeLessThanOrEqual(a.amt)
  })

  it('heirs inherit the people, not their parent\'s allowances or loans', () => {
    const g = richGame(8, 5_000_000)
    const [kid] = family(g, [12])
    setAllowance(g, kid, 4_000)
    expect(readTies(g, kid).allowance).toBe(4_000)
    g.character.id = 'heir'
    expect(readTies(g, kid).allowance).toBe(0)
    // Old saves and broken data read as "no ties".
    kid.data.w = 'garbage'
    expect(readTies(g, kid).allowance).toBe(0)
    kid.data.w = { by: 'heir', allowance: Number.NaN, history: [{ y: 1, what: 3 }] } as never
    expect(readTies(g, kid).allowance).toBe(0)
    expect(readTies(g, kid).history).toEqual([])
  })

  it('round-trips an ask through plain JSON', () => {
    const g = richGame(3, 20_000_000)
    const [kid] = family(g, [16])
    const a = askDef('kid.car')!.build(g, wealthTier(g), kid)!
    expect(readAsk({ ask: askJson(a) })).toEqual(a)
  })
})

describe('the Money section', () => {
  function find(nodes: MenuNode[], id: string, g: GameState): MenuAction | MenuGroup | undefined {
    for (const n of nodes) {
      if ((n.type === 'action' || n.type === 'menu') && n.id === id) return n
      if (n.type === 'menu') {
        const hit = find(n.children(g), id, g)
        if (hit) return hit
      }
    }
    return undefined
  }

  it('shows an allowance slider with a pure live caption', () => {
    const g = richGame(6, 3_000_000)
    const [kid] = family(g, [9])
    const nodes = personActions(g, kid)
    const group = find(nodes, 'wealth', g) as MenuGroup
    expect(group).toBeTruthy()
    const slider = find(nodes, 'wealth.allowance', g) as MenuAction
    expect(slider.input?.kind).toBe('slider')
    expect(slider.input?.money).toBe(true)
    const rng = g.rng
    const json = JSON.stringify(g)
    const caption = slider.input!.preview!(g, 5_000)
    expect(caption).toMatch(/week/)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
    slider.run(g, '1500')
    expect(readTies(g, kid).allowance).toBe(1_500)
  })

  it('has no money section for minors, coworkers or pets', () => {
    const g = richGame(6, 3_000_000, { age: 15 })
    const p = createPerson(g, { relation: 'parent', age: 45 })
    expect(wealthNodes(g, p)).toEqual([])
    const adult = richGame(6, 3_000_000)
    const cw = createPerson(adult, { relation: 'coworker', age: 30 })
    expect(wealthNodes(adult, cw)).toEqual([])
  })

  it('buys a kid a car from the menu', () => {
    const g = richGame(12, 3_000_000)
    const [kid] = family(g, [18])
    const car = find(personActions(g, kid), 'wealth.car', g) as MenuAction
    expect(car.disabledReason?.(g) ?? null).toBeNull()
    car.run(g)
    const m = g.queue.pop() as ChoiceModal
    const cash = g.character.money
    runScript(g, m.scriptId!, m.choices[0].id, m.data, m)
    expect(g.character.money).toBeLessThan(cash)
    expect(readTies(g, kid).car).toBeTruthy()
  })
})

describe('a whole rich life', () => {
  it('plays from 30 to death with money pressure on, without errors', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const g = createNewLife({ seed, year: 1990 })
      g.queue = []
      while (g.character.age < 30 && g.character.alive) {
        ageUp(g)
        drain(g, (m) => m.choices[0].id)
      }
      if (!g.character.alive) continue
      g.character.money = 40_000_000
      for (const age of [3, 8, 14, 17]) createPerson(g, { relation: 'child', age, lastName: g.character.lastName, livesWithPlayer: true })
      let k = 0
      while (g.character.alive && g.character.age < 120) {
        const people = g.people.filter((p) => p.alive)
        const p = people[k % Math.max(1, people.length)]
        if (p) {
          const actions: MenuAction[] = []
          const walk = (nodes: MenuNode[]) => {
            for (const n of nodes) {
              if (n.type === 'action' && n.id.startsWith('wealth.') && !(n.disabledReason && n.disabledReason(g))) actions.push(n)
              if (n.type === 'menu' && (!n.visible || n.visible(g))) walk(n.children(g))
            }
          }
          walk(personActions(g, p))
          const a = actions[k % Math.max(1, actions.length)]
          if (a) {
            const input = a.input ? (a.input.kind === 'slider' ? String(Math.round(((a.input.min ?? 0) + (a.input.max ?? 0)) / 2)) : a.input.defaultValue?.(g) ?? '100') : undefined
            a.run(g, input)
            drain(g, (m) => m.choices[k % m.choices.length].id)
          }
        }
        k++
        ageUp(g)
        drain(g, (m) => m.choices[(k * 7) % m.choices.length].id)
        expect(Number.isFinite(g.character.money)).toBe(true)
        const json = JSON.stringify(g)
        expect(JSON.stringify(JSON.parse(json))).toBe(json)
      }
      expect(g.character.alive).toBe(false)
    }
  }, 120_000)
})
