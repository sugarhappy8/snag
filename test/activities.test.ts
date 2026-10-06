import { describe, expect, it, vi } from 'vitest'
vi.mock('../src/game/crime', () => ({ arrestPlayer: vi.fn() }))
vi.mock('../src/game/ribbons', () => ({ computeRibbon: () => null }))
import {
  emigrateMenu,
  licensesMenu,
  mindBodyMenu,
  miscActivities,
  moviesMenu,
  nightlifeMenu,
  vacationMenu,
} from '../src/game/activities'
import { addGrievance, addCondition, addictions } from '../src/game/activities/common'
import { defendants } from '../src/game/activities/lawsuit'
import { arrestPlayer } from '../src/game/crime'
import { counter } from '../src/game/core'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { GameState, MenuAction, MenuGroup, MenuNode, ModalItem, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

const ALL_MENUS: MenuNode[] = [emigrateMenu, licensesMenu, mindBodyMenu, moviesMenu, nightlifeMenu, vacationMenu, ...miscActivities]

function isVisible(g: GameState, n: MenuNode): boolean {
  return !('visible' in n) || !n.visible || n.visible(g)
}

function kids(g: GameState, n: MenuGroup): MenuNode[] {
  return n.children(g).filter((c) => isVisible(g, c))
}

/** Find a node by id (exact, or a predicate) under a menu, searching depth-first. */
function find(g: GameState, root: MenuNode, match: string | ((n: MenuNode) => boolean), depth = 4): MenuNode | undefined {
  const ok = (n: MenuNode) => (typeof match === 'string' ? n.id === match : match(n))
  if (ok(root)) return root
  if (root.type !== 'menu' || depth <= 0) return undefined
  for (const c of kids(g, root)) {
    const hit = find(g, c, match, depth - 1)
    if (hit) return hit
  }
  return undefined
}

function action(g: GameState, root: MenuNode, id: string | ((n: MenuNode) => boolean)): MenuAction {
  const n = find(g, root, id)
  if (!n || n.type !== 'action') throw new Error(`action not found: ${String(id)}`)
  return n
}

function misc(id: string): MenuNode {
  const n = miscActivities.find((x) => x.id === id)
  if (!n) throw new Error(`misc activity not found: ${id}`)
  return n
}

function run(g: GameState, a: MenuAction, input?: string): void {
  const reason = a.disabledReason?.(g) ?? null
  if (reason) throw new Error(`${a.id} disabled: ${reason}`)
  a.run(g, input ?? (a.input?.defaultValue ? a.input.defaultValue(g) : undefined))
}

/** Answer the first pending choice popup. `pickChoice` gets the modal and returns a choice id. */
function answer(g: GameState, pickChoice: (m: Extract<ModalItem, { kind: 'choice' }>) => string): string {
  const i = g.queue.findIndex((m) => m.kind === 'choice')
  if (i < 0) throw new Error('no pending choice')
  const m = g.queue[i] as Extract<ModalItem, { kind: 'choice' }>
  g.queue.splice(i, 1)
  const choice = pickChoice(m)
  runScript(g, m.scriptId!, choice, m.data, m)
  return choice
}

/** Resolve every pending popup (notices dismissed, choices picked by `chooser`). */
function drain(g: GameState, chooser: (m: ModalItem, i: number) => string = () => ''): void {
  for (let guard = 0; guard < 80 && g.queue.length > 0; guard++) {
    const m = g.queue.shift()!
    if (m.kind === 'notice' || m.kind === 'aiTask') continue
    if (m.kind === 'choice') {
      const id = chooser(m, guard) || m.choices[guard % m.choices.length].id
      if (m.scriptId) runScript(g, m.scriptId, id, m.data, m)
    } else if (m.kind === 'input') {
      runScript(g, m.scriptId, m.defaultValue ?? (m.input === 'number' ? '5' : 'Sam'), m.data, m)
    } else if (m.kind === 'minigame') {
      runScript(g, m.scriptId, guard % 2 ? 'win' : 'lose', m.data, m)
    }
  }
}

function notices(g: GameState): string[] {
  return g.queue.filter((m) => m.kind === 'notice').map((m) => (m.kind === 'notice' ? `${m.title}: ${m.text}` : ''))
}

function adult(seed = 1, extra: Parameters<typeof makeTestGame>[1] = {}): GameState {
  const g = makeTestGame(seed, { age: 30, money: 2_000_000, ...extra })
  g.log = [{ age: 30, year: 2026, entries: [] }]
  return g
}

function addParent(g: GameState, gender: 'male' | 'female' = 'female'): Person {
  return createPerson(g, { relation: 'parent', age: g.character.age + 28, gender, relationship: 80, money: 500_000 })
}

function newYear(g: GameState): void {
  g.yearActions = {}
  g.queue = []
}

// ---------------------------------------------------------------------------
// Mind & Body

describe('mind & body', () => {
  it('limits gym visits per year and says you are too exhausted', () => {
    const g = adult()
    const lift = action(g, mindBodyMenu, 'mb.gym.weights')
    for (let i = 0; i < 4; i++) run(g, lift)
    expect(counter(g, 'gym')).toBe(4)
    g.queue = []
    run(g, lift)
    expect(counter(g, 'gym')).toBe(4)
    expect(notices(g).join(' ')).toMatch(/exhausted|enough|tired|begging/i)
    newYear(g)
    run(g, lift)
    expect(counter(g, 'gym')).toBe(5)
  })

  it('gym costs money and refuses when broke', () => {
    const g = adult(3, { money: 0 })
    run(g, action(g, mindBodyMenu, 'mb.gym.cardio'))
    expect(counter(g, 'gym')).toBe(0)
    expect(notices(g)[0]).toMatch(/Insufficient Funds/)
  })

  it('is greyed out for small children and dead characters', () => {
    expect(mindBodyMenu.disabledReason!(makeTestGame(1, { age: 3 }))).toBeTruthy()
    expect(mindBodyMenu.disabledReason!(makeTestGame(1, { age: 30, alive: false }))).toBeTruthy()
    expect(mindBodyMenu.disabledReason!(makeTestGame(1, { age: 8 }))).toBeNull()
  })

  it('in prison only offers prison-friendly activities, and the gym is free', () => {
    const g = adult(5, { money: 0 })
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Burglary', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    expect(mindBodyMenu.disabledReason!(g)).toBeNull()
    const ids = kids(g, mindBodyMenu).map((n) => n.id)
    expect(ids).toContain('mb.gym')
    expect(ids).not.toContain('mb.spaceCamp')
    run(g, action(g, mindBodyMenu, (n) => n.id.startsWith('mb.gym.') && n.type === 'action'))
    expect(counter(g, 'gym')).toBe(1)
    expect(g.character.money).toBe(0)
  })

  it('meditating, walking and the library increment their counters', () => {
    const g = adult(7)
    run(g, action(g, mindBodyMenu, 'mb.meditate'))
    drain(g)
    run(g, action(g, mindBodyMenu, 'mb.library'))
    drain(g)
    const walk = action(g, mindBodyMenu, (n) => n.type === 'action' && n.id.startsWith('mb.walk.'))
    run(g, walk)
    drain(g)
    expect(counter(g, 'meditate')).toBe(1)
    expect(counter(g, 'library')).toBe(1)
    expect(counter(g, 'walks')).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Licenses

describe("driver's license", () => {
  it('requires the country driving age', () => {
    const young = makeTestGame(1, { age: 15 })
    const a = action(adult(), licensesMenu, 'license.driver')
    expect(a.disabledReason!(young)).toMatch(/16/)
    const ok = makeTestGame(1, { age: 16 })
    expect(a.disabledReason!(ok)).toBeNull()
  })

  it('passing every question grants the license; a wrong answer fails', () => {
    const g = makeTestGame(2, { age: 16 })
    const a = action(g, licensesMenu, 'license.driver')
    run(g, a)
    // Answer wrong first.
    answer(g, (m) => String(((m.data as { correct: number }).correct + 1) % m.choices.length))
    expect(g.character.licenses).not.toContain('driver')
    expect(notices(g).join(' ')).toMatch(/fail/i)
    g.queue = []
    run(g, a)
    for (let i = 0; i < 10 && g.queue.some((m) => m.kind === 'choice'); i++) {
      answer(g, (m) => String((m.data as { correct: number }).correct))
    }
    expect(g.character.licenses).toContain('driver')
    expect(a.disabledReason!(g)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Emigrate

describe('emigrate', () => {
  /** The first open visa route among the "Easiest Moves" countries (not a citizen's own move). */
  function firstOpenRoute(g: GameState): MenuAction | undefined {
    const countries = kids(g, emigrateMenu).filter((n): n is MenuGroup => n.type === 'menu' && !n.id.startsWith('emigrate.cont.') && n.id !== 'emigrate.status')
    for (const c of countries) {
      for (const a of kids(g, c)) {
        if (a.type === 'action' && !a.disabledReason?.(g) && !/\.(sneak|escape|citizen)$/.test(a.id)) return a
      }
    }
    return undefined
  }

  it('moves the player to a new country and leaves the family behind', () => {
    let moved = false
    for (let seed = 1; seed <= 15 && !moved; seed++) {
      const g = adult(seed)
      g.character.stats.smarts = 90
      const mom = addParent(g)
      const target = firstOpenRoute(g)
      expect(target).toBeTruthy()
      const before = g.character.money
      run(g, target!)
      if (g.character.countryId !== 'us') {
        moved = true
        expect(target!.id.startsWith(`emigrate.${g.character.countryId}.`)).toBe(true)
        expect(g.character.money).toBeLessThan(before)
        expect(counter(g, 'emigrations')).toBe(1)
        expect(mom.data.countryId).toBe('us')
        expect(g.character.city).toBeTruthy()
        // Where you live isn't a destination.
        expect(kids(g, emigrateMenu).some((n) => n.id === `emigrate.${g.character.countryId}`)).toBe(false)
      }
    }
    expect(moved).toBe(true)
  })

  it('requires adulthood and finishing high school', () => {
    expect(emigrateMenu.disabledReason!(makeTestGame(1, { age: 16 }))).toBeTruthy()
    expect(emigrateMenu.disabledReason!(adult())).toBeNull()
  })

  it('denies wanted fugitives', () => {
    const g = adult(4, { wantedLevel: 2 })
    run(g, firstOpenRoute(g)!)
    expect(g.character.countryId).toBe('us')
    expect(g.queue.some((m) => m.kind === 'choice' && /warrant/.test(m.text))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rehab & plastic surgery

describe('rehab', () => {
  it('can cure an addiction (and charges for the rehab center)', () => {
    const g = adult(11)
    addCondition(g, 'Alcoholism', 'addiction', 30)
    expect(addictions(g)).toHaveLength(1)
    const center = action(g, misc('rehab'), 'rehab.luxury')
    let tries = 0
    while (addictions(g).length > 0 && tries < 20) {
      const before = g.character.money
      run(g, center)
      expect(g.character.money).toBeLessThan(before)
      newYear(g)
      tries++
    }
    expect(addictions(g)).toHaveLength(0)
    expect(counter(g, 'rehab')).toBe(tries)
  })

  it('needs 18+ and refuses when broke', () => {
    expect((misc('rehab') as MenuGroup).disabledReason!(makeTestGame(1, { age: 16 }))).toBeTruthy()
    const g = adult(1, { money: 10 })
    addCondition(g, 'Alcoholism', 'addiction', 30)
    run(g, action(g, misc('rehab'), 'rehab.center'))
    expect(addictions(g)).toHaveLength(1)
    expect(notices(g)[0]).toMatch(/Insufficient Funds/)
  })
})

describe('plastic surgery', () => {
  it('changes looks and counts surgeries', () => {
    const g = adult(21)
    const looks = g.character.stats.looks
    const nose = action(g, misc('surgery'), (n) => n.type === 'action' && n.id.startsWith('surgery.nose.') && n.id.endsWith('pricey'))
    const before = g.character.money
    run(g, nose)
    expect(counter(g, 'surgeries')).toBe(1)
    expect(g.character.money).toBeLessThan(before)
    expect(g.character.stats.looks).not.toBe(looks)
  })

  it('a botched job can be taken to court', () => {
    let sued = false
    for (let seed = 1; seed <= 60 && !sued; seed++) {
      const g = adult(seed)
      const cheap = action(g, misc('surgery'), (n) => n.type === 'action' && n.id.startsWith('surgery.facelift.') && n.id.endsWith('cheap'))
      run(g, cheap)
      if (counter(g, 'botchedSurgeries') === 0 || !g.character.alive) continue
      const list = defendants(g)
      expect(list.some((d) => d.kind === 'surgeon')).toBe(true)
      sued = true
    }
    expect(sued).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Will, lawsuit, charity, surrender, pray, sweepstakes

describe('will & testament', () => {
  it('names a sole heir, a custom split, then reverts to dividing evenly', () => {
    const g = adult()
    const sp = createPerson(g, { relation: 'spouse', age: 31, relationship: 80 })
    const a = createPerson(g, { relation: 'child', age: 5 })
    const b = createPerson(g, { relation: 'child', age: 3 })
    const will = misc('will') as MenuGroup
    expect(will.header!(g)).toMatch(/divided evenly among your 2 children/)
    run(g, action(g, will, `will.sole.${sp.id}`))
    expect(g.character.willBeneficiaries).toEqual([sp.id])
    expect(will.header!(g)).toMatch(new RegExp(sp.firstName))
    run(g, action(g, will, `will.toggle.${a.id}`))
    expect(g.character.willBeneficiaries).toEqual([sp.id, a.id])
    run(g, action(g, will, 'will.even'))
    expect(g.character.willBeneficiaries).toEqual([])
    run(g, action(g, will, 'will.family'))
    expect(new Set(g.character.willBeneficiaries)).toEqual(new Set([sp.id, a.id, b.id]))
    // Dead heirs drop out.
    a.alive = false
    run(g, action(g, will, `will.toggle.${b.id}`))
    expect(g.character.willBeneficiaries).toEqual([sp.id])
  })

  it('explains when there is nobody to inherit', () => {
    const g = adult()
    const nodes = kids(g, misc('will') as MenuGroup)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('info')
  })
})

describe('lawsuit', () => {
  it("says you can't think of anyone to sue when nobody wronged you", () => {
    const g = adult()
    const nodes = kids(g, misc('lawsuit') as MenuGroup)
    expect(nodes[0].type).toBe('info')
  })

  it('sues an assailant: pay a lawyer, pick damages, get a verdict', () => {
    let wins = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = adult(seed)
      addGrievance(g, { kind: 'assailant', name: 'The bouncer at Club Neon', strength: 80, detail: 'assaulted you at Club Neon' })
      addGrievance(g, { kind: 'assailant', name: 'A kid at recess', strength: 80, age: 12 }) // juvenile: can't sue
      const list = defendants(g)
      expect(list.map((d) => d.name)).toEqual(['The bouncer at Club Neon'])
      const firm = action(g, misc('lawsuit'), (n) => n.type === 'action' && n.id.endsWith('.firm2'))
      const before = g.character.money
      run(g, firm)
      const amount = Number((g.queue[0] as { choices: { label: string }[] }).choices[1].label.replace(/[^0-9]/g, ''))
      answer(g, () => '1')
      expect(counter(g, 'lawsuits')).toBe(1)
      const fee = before - g.character.money + (counter(g, 'lawsuitsWon') ? amount : 0)
      expect(fee).toBeGreaterThan(0)
      if (counter(g, 'lawsuitsWon') === 1) {
        wins++
        expect(g.character.money).toBeGreaterThan(before)
      } else {
        expect(g.character.money).toBe(before - fee)
      }
      expect(defendants(g)).toHaveLength(0)
    }
    expect(wins).toBeGreaterThan(5)
  })

  it('lets you sue a former employer after being fired (within the statute of limitations)', () => {
    const g = adult()
    g.character.careerHistory.push({ title: 'Accountant', company: 'Initech', startAge: 25, endAge: 29, reason: 'fired', salary: 60000 })
    g.character.careerHistory.push({ title: 'Clerk', company: 'Old Corp', startAge: 18, endAge: 20, reason: 'fired', salary: 20000 })
    expect(defendants(g).map((d) => d.name)).toEqual(['Initech'])
    const firm = action(g, misc('lawsuit'), (n) => n.type === 'action' && n.id.endsWith('.firm0'))
    run(g, firm)
    answer(g, () => 'cancel')
    expect(counter(g, 'lawsuits')).toBe(0)
    expect(defendants(g)).toHaveLength(1)
  })

  it('is adults-only', () => {
    expect((misc('lawsuit') as MenuGroup).disabledReason!(makeTestGame(1, { age: 17 }))).toBeTruthy()
  })
})

describe('charity', () => {
  it('donating takes money, adds karma and counts', () => {
    const g = adult(1, { money: 10_000 })
    const karma = g.character.hidden.karma
    const a = action(g, misc('charity'), (n) => n.type === 'action')
    run(g, a, '1,000')
    expect(g.character.money).toBe(9_000)
    expect(counter(g, 'donated')).toBe(1)
    expect(counter(g, 'moneyDonated')).toBe(1000)
    expect(g.character.hidden.karma).toBeGreaterThanOrEqual(karma)
  })

  it("can't donate more than you have", () => {
    const g = adult(1, { money: 50 })
    run(g, action(g, misc('charity'), (n) => n.type === 'action'), '500')
    expect(g.character.money).toBe(50)
    expect(counter(g, 'donated')).toBe(0)
  })
})

describe('surrender', () => {
  it('only shows while wanted, and turns you in for your worst uncaught crime', () => {
    const g = adult()
    const s = misc('surrender') as MenuAction
    expect(isVisible(g, s)).toBe(false)
    g.character.wantedLevel = 2
    g.character.criminalRecord.push({ crime: 'Shoplifting', age: 29, caught: false, convicted: false })
    g.character.criminalRecord.push({ crime: 'Bank Robbery', age: 29, caught: false, convicted: false })
    g.character.criminalRecord.push({ crime: 'Pickpocketing', age: 29, caught: false, convicted: false })
    expect(isVisible(g, s)).toBe(true)
    run(g, s)
    expect(arrestPlayer).toHaveBeenCalledWith(g, 'Bank Robbery', 2, expect.objectContaining({ recordIndex: 1, noResist: true }))
    expect(counter(g, 'surrendered')).toBe(1)
  })
})

describe('pray & sweepstakes', () => {
  it('limits prayers per year', () => {
    const g = adult()
    const p = action(g, misc('pray'), 'pray.health')
    for (let i = 0; i < 4; i++) run(g, p)
    expect(counter(g, 'prayers')).toBe(3)
  })

  it('sweepstakes costs a dollar per entry and is limited', () => {
    const g = adult(1, { money: 100 })
    const s = misc('sweepstakes') as MenuAction
    for (let i = 0; i < 6; i++) run(g, s)
    expect(counter(g, 'sweepstakes')).toBe(5)
    expect(g.character.money).toBeGreaterThanOrEqual(95)
  })
})

// ---------------------------------------------------------------------------
// Nightlife, vacation, movies

describe('nightlife', () => {
  it('requires the drinking age', () => {
    expect(nightlifeMenu.disabledReason!(makeTestGame(1, { age: 19 }))).toMatch(/21/)
    expect(nightlifeMenu.disabledReason!(adult())).toBeNull()
  })

  it('a night out counts and never leaves the game in a broken state', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = adult(seed)
      const bar = action(g, nightlifeMenu, 'night.bar')
      run(g, bar)
      drain(g)
      expect(counter(g, 'nightlife')).toBe(1)
      expect(Number.isFinite(g.character.money)).toBe(true)
    }
  })
})

describe('vacation', () => {
  it('takes a trip, costs money and counts', () => {
    let took = false
    for (let seed = 1; seed <= 5 && !took; seed++) {
      const g = adult(seed)
      const trip = action(g, vacationMenu, (n) => n.type === 'action')
      const before = g.character.money
      run(g, trip)
      drain(g, (m) => (m.kind === 'choice' ? (m.choices.find((c) => /alone|myself/i.test(c.label))?.id ?? m.choices[0].id) : ''))
      if (counter(g, 'vacations') === 1) {
        took = true
        expect(g.character.money).toBeLessThan(before)
      }
    }
    expect(took).toBe(true)
  })

  it('is adults-only', () => {
    expect(vacationMenu.disabledReason!(makeTestGame(1, { age: 15 }))).toBeTruthy()
  })
})

describe('movies', () => {
  it('kids can see a family movie', () => {
    const g = makeTestGame(1, { age: 9 })
    addParent(g)
    const genres = kids(g, moviesMenu).map((n) => n.id)
    expect(genres).toContain('movies.Family')
    const first = action(g, moviesMenu, (n) => n.type === 'action' && n.id.startsWith('movies.Family'))
    run(g, first)
    drain(g)
    expect(counter(g, 'movies')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Fuzz: every reachable action at several life stages stays consistent.

describe('every activity', () => {
  function walk(g: GameState, n: MenuNode, out: MenuAction[], depth: number): void {
    if (!isVisible(g, n)) return
    if (n.type === 'action') out.push(n)
    if (n.type !== 'menu' || depth <= 0) return
    if (n.disabledReason?.(g)) return
    for (const c of n.children(g)) walk(g, c, out, depth - 1)
  }

  const setups: [string, () => GameState][] = [
    ['child', () => { const g = makeTestGame(31, { age: 9 }); addParent(g); addParent(g, 'male'); return g }],
    ['teen', () => { const g = makeTestGame(32, { age: 16, money: 300 }); addParent(g); return g }],
    ['young adult', () => { const g = adult(33, { age: 22, money: 3_000 }); createPerson(g, { relation: 'friend', age: 22 }); return g }],
    ['rich parent', () => {
      const g = adult(34, { age: 45 })
      createPerson(g, { relation: 'spouse', age: 44, relationship: 70 })
      createPerson(g, { relation: 'child', age: 12 })
      addCondition(g, 'Alcoholism', 'addiction', 40)
      return g
    }],
    ['broke elder', () => adult(35, { age: 78, money: 0 })],
    ['prisoner', () => {
      const g = adult(36, { age: 30, money: 0 })
      g.character.prison = { name: 'State Pen', security: 'maximum', crime: 'Murder', sentenceYears: 30, yearsServed: 2, respect: 20, appealed: false, escapeAttempts: 0 }
      return g
    }],
  ]

  for (const [name, make] of setups) {
    it(`works for a ${name}`, () => {
      const base = make()
      const actions: MenuAction[] = []
      for (const m of ALL_MENUS) walk(base, m, actions, 4)
      expect(actions.length).toBeGreaterThan(0)
      let ran = 0
      const strategies: ((m: ModalItem, i: number) => string)[] = [
        () => '',
        (m) => (m.kind === 'choice' ? m.choices[m.choices.length - 1].id : ''),
        (m, i) => (m.kind === 'choice' ? m.choices[(i * 7 + 3) % m.choices.length].id : ''),
      ]
      for (const a of actions) for (const [si, strategy] of strategies.entries()) {
        const g = structuredClone(base)
        g.rng = base.rng + si * 9973
        if (a.disabledReason?.(g)) continue
        // Strings evaluate without throwing.
        if (typeof a.subtitle === 'function') expect(typeof a.subtitle(g)).toBe('string')
        a.confirm?.(g)
        const input = a.input ? (a.input.defaultValue?.(g) ?? (a.input.kind === 'number' ? '50' : 'Robin')) : undefined
        a.run(g, input)
        drain(g, strategy)
        ran++
        expect(g.queue.length).toBe(0)
        expect(Number.isFinite(g.character.money)).toBe(true)
        expect(g.character.money).toBeGreaterThanOrEqual(Math.min(0, base.character.money))
        for (const k of ['happiness', 'health', 'smarts', 'looks'] as const) {
          expect(g.character.stats[k]).toBeGreaterThanOrEqual(0)
          expect(g.character.stats[k]).toBeLessThanOrEqual(100)
        }
        // State stays plain JSON.
        expect(JSON.parse(JSON.stringify(g))).toEqual(g)
        if (base.character.prison) expect(g.character.prison).not.toBeNull()
      }
      expect(ran).toBeGreaterThan(0)
      if (process.env.ACT_DEBUG) console.log(name, actions.length, ran)
    })
  }

  it('dead characters cannot do anything', () => {
    const g = adult(40, { alive: false })
    for (const m of ALL_MENUS) {
      if (!isVisible(g, m)) continue
      if (m.type === 'menu') expect(m.disabledReason?.(g) ?? 'missing gate').toBeTruthy()
      else if (m.type === 'action') expect(m.disabledReason?.(g)).toBeTruthy()
    }
  })
})
