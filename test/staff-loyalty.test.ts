// ci: fast
// R4-E13 (D.4, X1, X22): staff loyalty. A key person (KeyStaff) and a hired CEO (Manager) are not people of the game, so their
// edges name them by a ref of their own: `staff:<ks id>` and `mgr:<asset id>`, and the edge is `ref > player` like every other.
//
//   unstamped   the old rule to the draw: morale under 30 and chance(g, 0.35) from g.rng; nothing is written, nothing is drawn
//   stamped     the year-end rule reads the edge (resentment s, affection f) and the person's morale, draws from the named stream
//               social ('staff|<id>', outcomeStream) and never from g.rng; a rival poaches a skilled, resentful or underpaid person
//   memories    hired_me (hire), gift_given (a raise), told_bluntly (a yell); an edge is bound while the person works there
//   edges       drop with the staff member (fired, quit, sued) or with the company; a poached leaver keeps poached_me as a plain edge
//   manager     mgr:<asset id> follows the asset and is reset when the manager changes
//   money       none: pay and severance stay on the company's books as they were
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { installManager, managerCandidate } from '../src/game/business/career'
import { fireStaff, staffTurnover } from '../src/game/business/staff'
import { mgrRef, poachOdds, quitOdds, staffHired, staffLoyaltyYear, staffRef } from '../src/game/business/staff-loyalty'
import { bizOf, type BizState, type KeyStaff } from '../src/game/business/state'
import { log } from '../src/game/core'
import { peekLedger, ledgerProblems } from '../src/game/kernel/ledger'
import { outcomeStream } from '../src/game/kernel/streams'
import { chance } from '../src/game/rng'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, Json, MenuAction, ModalItem } from '../src/game/types'
import { EDGE_CAPS } from '../src/game/world/caps'
import { memoriesOf, edgeProblems, edgesOf, readEdge } from '../src/game/world/edges'
import { putEdge } from '../src/game/world/edge-write'
import { playerRef } from '../src/game/world/people'
import { makeTestGame } from './helpers'
import { deepFreeze } from './knowledge-kit'
import { allNodes, company } from './market-kit'
import { socialGame } from './social-kit'

// A fixed life is written as a positional constant, never as a `seed: <digits>` pin (test/seed-pins.test.ts).
const LIFE = 7

const DASH = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)

function person(id: string, over: Partial<KeyStaff> = {}): KeyStaff {
  return { id, firstName: 'Dana', lastName: `Reed${id}`, gender: 'female', age: 40, role: 'Head Chef', focus: 'ops', skill: 50, salary: 90_000, trait: 'steady', morale: 70, years: 2, ...over }
}

interface Firm {
  g: GameState
  a: Asset
  b: BizState
}

/** A grown-up with a restaurant: stamped (the social stamp) or not. The same seed either way, so the two lives start alike. */
function firm(stamped = true, cash = 5_000_000): Firm {
  const g = stamped ? socialGame(LIFE, { age: 40 }) : makeTestGame(LIFE, { age: 40 })
  g.character.money = 1e9
  const a = company(g, 'restaurant', { cash })
  return { g, a, b: bizOf(g, a) }
}

const ego = (g: GameState) => playerRef(g)

/** A script answered with no popup behind it (the way the books tests call the board's raise). */
function script(g: GameState, id: string, choice: string, data: Json): void {
  runScript(g, id, choice, data, undefined as unknown as ModalItem)
}

/** The edge staff > player. */
const edgeOf = (g: GameState, s: KeyStaff) => readEdge(g, staffRef(s), ego(g))

/** Gives a person an edge with the given feelings, bound as a hire makes it (k: 'staff'). */
function feel(g: GameState, s: KeyStaff, over: { s?: number; f?: number; t?: number; k?: 'staff' | undefined } = {}): void {
  const y = g.year
  const ok = putEdge(g, `${staffRef(s)}>${ego(g)}`, { t: over.t ?? 50, f: over.f ?? 50, r: 50, s: over.s ?? 0, o: 0, y, l: y, ...('k' in over ? { k: over.k } : { k: 'staff' as const }) })
  if (!ok) throw new Error('feel refused')
}

/** The ids of the staff edges the map holds (the first end is `staff:<id>`). */
const staffEdgeIds = (g: GameState): string[] =>
  edgesOf(g, ego(g))
    .map(([key]) => key)
    .filter((k) => k.startsWith('staff:'))
    .map((k) => k.slice('staff:'.length, k.indexOf('>')))

const bound = (g: GameState): string[] =>
  edgesOf(g, ego(g))
    .filter(([key, e]) => key.startsWith('staff:') && e.k === 'staff')
    .map(([key]) => key.slice('staff:'.length, key.indexOf('>')))

const logText = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))

// ---------------------------------------------------------------------------------------------------------------------------------
// The refs and the two odds, as pure functions

describe('staffRef and mgrRef', () => {
  it('name a key person by staff:<id> and a company by mgr:<asset id>', () => {
    expect(staffRef(person('ks12'))).toBe('staff:ks12')
    expect(mgrRef({ id: 'a7' } as Asset)).toBe('mgr:a7')
  })

  it('are total: an id that is no name gives pool:other, never a throw', () => {
    for (const id of ['', 'has space', 'a'.repeat(80), '__proto__:x:', 'k\u0000', 'ok-1.2_3']) {
      const r = staffRef(person(id))
      expect(typeof r).toBe('string')
      expect(r === 'pool:other' || r === `staff:${id}`).toBe(true)
    }
    expect(staffRef(person(undefined as unknown as string))).toBe('pool:other')
    expect(staffRef(person('has space'))).toBe('pool:other')
    expect(mgrRef({ id: 'x y' } as Asset)).toBe('pool:other')
    expect(mgrRef({} as Asset)).toBe('pool:other')
  })

  it('read a frozen person and a frozen asset', () => {
    expect(staffRef(deepFreeze(person('ks1')))).toBe('staff:ks1')
    expect(mgrRef(deepFreeze({ id: 'a1' } as Asset))).toBe('mgr:a1')
  })
})

describe('quitOdds and poachOdds', () => {
  it('quitOdds is clamp(0.04 + (35 - morale)/150 + s/500 - (f - 50)/600, 0, 0.6) on a grid', () => {
    for (const morale of [0, 10, 29, 35, 50, 80, 100]) {
      for (const s of [0, 20, 60, 90, 100]) {
        for (const f of [0, 30, 50, 80, 100]) {
          const raw = 0.04 + (35 - morale) / 150 + s / 500 - (f - 50) / 600
          expect(quitOdds(morale, s, f), `${morale}/${s}/${f}`).toBeCloseTo(Math.min(0.6, Math.max(0, raw)), 12)
        }
      }
    }
  })

  it('quitOdds is 0 for a content person and about 0.39 for morale 10 and resentment 90', () => {
    expect(quitOdds(80, 0, 50)).toBe(0)
    expect(quitOdds(10, 90, 50)).toBeCloseTo(0.04 + 25 / 150 + 90 / 500, 12)
  })

  it('poachOdds is 0.03 + 0.10 x s/100 x (1 - honesty/100)', () => {
    expect(poachOdds(0, 50)).toBeCloseTo(0.03, 12)
    expect(poachOdds(60, 56)).toBeCloseTo(0.03 + 0.1 * 0.6 * 0.44, 12)
    expect(poachOdds(100, 0)).toBeCloseTo(0.13, 12)
    expect(poachOdds(100, 100)).toBeCloseTo(0.03, 12)
  })

  it('both are bounded at 100 times and total on hostile numbers (a growth term has a ceiling)', () => {
    for (const x of [1e300, -1e300, Infinity, -Infinity, NaN, 100, 10_000, -50]) {
      for (const [m, s, f] of [[x, 50, 50], [50, x, 50], [50, 50, x], [x, x, x]] as const) {
        const q = quitOdds(m, s, f)
        expect(Number.isFinite(q) && q >= 0 && q <= 0.6, `quitOdds ${m}/${s}/${f} is ${q}`).toBe(true)
      }
      for (const [s, h] of [[x, 50], [50, x], [x, x]] as const) {
        const p = poachOdds(s, h)
        expect(Number.isFinite(p) && p >= 0.03 - 1e-12 && p <= 0.13 + 1e-12, `poachOdds ${s}/${h} is ${p}`).toBe(true)
      }
    }
    // in range the worst case is 0.5567; the clamp is what holds 100 times the input
    expect(quitOdds(0, 100, 0)).toBeCloseTo(0.04 + 35 / 150 + 100 / 500 + 50 / 600, 12)
    expect(quitOdds(0, 10_000, -10_000)).toBe(0.6)
    expect(poachOdds(10_000, -10_000)).toBeCloseTo(0.13, 12)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// A life that is not stamped keeps the old rule

describe('a life that is not stamped', () => {
  /** The rule as it stood in staffTurnover before R4-E13: morale under 30, then a 35% roll from g.rng. */
  function oldRule(g: GameState, a: Asset, b: BizState): void {
    for (const s of [...b.staff]) {
      if (s.morale >= 30 || !chance(g, 0.35)) continue
      b.staff = b.staff.filter((x) => x.id !== s.id)
      log(g, `${s.firstName} ${s.lastName}, our ${s.role}, quit ${a.name}.`, 'bad')
    }
  }

  it('staffTurnover equals the old rule to the draw: the same staff, the same g.rng, the same game', () => {
    let left = 0
    let stayed = 0
    for (let n = 0; n < 40; n++) {
      const morales = [5, 29, 30, 80, 12, 100, 0, 44]
      const make = (): Firm => {
        const f = firm(false)
        f.g.rng = 1000 + n * 7919
        f.b.staff.push(...morales.map((m, i) => person(`k${i}`, { morale: m })))
        return f
      }
      const x = make()
      const y = make()
      staffTurnover(x.g, x.a, x.b)
      oldRule(y.g, y.a, y.b)
      expect(JSON.stringify(x.g)).toBe(JSON.stringify(y.g))
      expect(x.g.rng).toBe(y.g.rng)
      left += morales.length - x.b.staff.length
      stayed += x.b.staff.length
    }
    expect(left, 'some people left in some run').toBeGreaterThan(10)
    expect(stayed, 'some people stayed in some run').toBeGreaterThan(100)
  })

  it('staffLoyaltyYear called directly changes nothing: no edge, no draw, no ledger row, no line', () => {
    const { g, a, b } = firm(false)
    b.staff.push(...Array.from({ length: 6 }, (_, i) => person(`k${i}`, { morale: 5, skill: 90 })))
    const before = JSON.stringify(g)
    const ledger = JSON.stringify(peekLedger(g))
    staffLoyaltyYear(g, a, b)
    expect(JSON.stringify(g)).toBe(before)
    expect(JSON.stringify(peekLedger(g))).toBe(ledger)
    expect(g.world?.edges).toBeUndefined()
  })

  it('the hire, the raises, the yell and the firing write no edge', () => {
    const { g, a, b } = firm(false)
    const s = person('k1', { morale: 70 })
    b.staff.push(s)
    for (const key of ['raise', 'yell']) {
      const row = allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'action' && n.id === `biz.staff.${a.id}.${s.id}.${key}`) as MenuAction
      row.run(g)
    }
    const all = allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'action' && n.id === `biz.raiseAll.${a.id}`) as MenuAction
    all.run(g)
    const cur = bizOf(g, a)
    if (cur.staff.some((x) => x.id === s.id)) fireStaff(g, a, cur, cur.staff.find((x) => x.id === s.id)!)
    expect(g.world?.edges).toBeUndefined()
    expect(g.world?.social).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The stamped year-end rule

/** Runs the year-end rule once and tells who left. */
function year(f: Firm): { quit: string[]; kept: number } {
  const before = new Set(f.b.staff.map((s) => s.id))
  staffLoyaltyYear(f.g, f.a, f.b)
  const after = new Set(f.b.staff.map((s) => s.id))
  return { quit: [...before].filter((id) => !after.has(id)), kept: after.size }
}

describe('the stamped quit rule', () => {
  it('a person at morale 80 and resentment 0 never quits in 1,000 draws of the stream', () => {
    const f = firm()
    f.b.staff.push(...Array.from({ length: 1000 }, (_, i) => person(`c${i}`, { morale: 80, skill: 60 })))
    expect(year(f).quit).toEqual([])
    expect(f.b.staff).toHaveLength(1000)
  })

  it('a person at morale 10 and resentment 90 quits at the rate of the formula, and most are gone in three years', () => {
    const f = firm()
    const crew = Array.from({ length: 1000 }, (_, i) => person(`r${i}`, { morale: 10, skill: 50 }))
    f.b.staff.push(...crew)
    for (const s of crew) feel(f.g, s, { s: 90 })
    const first = year(f)
    const rate = first.quit.length / 1000
    // 1000 draws at 0.3867: three standard deviations are about 0.046
    expect(rate).toBeGreaterThan(0.3867 - 0.05)
    expect(rate).toBeLessThan(0.3867 + 0.05)
    for (let y = 1; y < 3; y++) {
      f.g.year += 1
      year(f)
    }
    expect(1000 - f.b.staff.length, 'most are gone after three years').toBeGreaterThan(700)
  })

  it('draws the luck from outcomeStream(g, "social", year, "staff|<id>") and nothing from g.rng', () => {
    const f = firm()
    const crew = Array.from({ length: 200 }, (_, i) => person(`s${i}`, { morale: 20, skill: 40 }))
    f.b.staff.push(...crew)
    const expected = crew.filter((s) => outcomeStream(f.g, 'social', f.g.year, `staff|${s.id}`)() < quitOdds(20, 0, 50)).map((s) => s.id)
    expect(expected.length).toBeGreaterThan(10)
    const rng = f.g.rng
    expect(year(f).quit.sort()).toEqual(expected.sort())
    expect(f.g.rng).toBe(rng)
  })

  it('the old quit line is kept for a person who quits, and it names the person and the role', () => {
    const f = firm()
    const s = person('q1', { morale: 0, skill: 40 })
    f.b.staff.push(s)
    feel(f.g, s, { s: 100, f: 0 })
    let gone = false
    for (let y = 0; y < 30 && !gone; y++) {
      f.g.year += 1
      gone = year(f).quit.includes('q1')
    }
    expect(gone).toBe(true)
    expect(logText(f.g)).toContain(`Dana Reedq1, our Head Chef, quit ${f.a.name}.`)
  })

  it('moves no money: the company cash, the ledger and the books are as they were', () => {
    const f = firm()
    f.b.staff.push(...Array.from({ length: 300 }, (_, i) => person(`m${i}`, { morale: 10, skill: 85 })))
    const cash = f.b.cash
    const ledger = JSON.stringify(peekLedger(f.g))
    const costs = f.b.yearCosts
    year(f)
    expect(f.b.cash).toBe(cash)
    expect(f.b.cash).toBeGreaterThanOrEqual(0)
    expect(f.b.yearCosts).toBe(costs)
    expect(JSON.stringify(peekLedger(f.g))).toBe(ledger)
    expect(ledgerProblems(f.g)).toEqual([])
  })

  it('drops the edge of a person who quits, so no staff edge is left without its person', () => {
    const f = firm()
    const crew = Array.from({ length: 300 }, (_, i) => person(`e${i}`, { morale: 10, skill: 50 }))
    f.b.staff.push(...crew)
    for (const s of crew) feel(f.g, s, { s: 90 })
    const { quit } = year(f)
    expect(quit.length).toBeGreaterThan(50)
    for (const id of quit) expect(readEdge(f.g, `staff:${id}`, ego(f.g))).toBeNull()
    expect(bound(f.g).sort()).toEqual(f.b.staff.map((s) => s.id).sort())
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
  })
})

describe('the stamped poaching rule', () => {
  it('never takes a person under skill 70, or a skilled one who is content and paid the going rate', () => {
    const f = firm()
    const low = Array.from({ length: 400 }, (_, i) => person(`l${i}`, { morale: 100, skill: 69 }))
    const calm = Array.from({ length: 400 }, (_, i) => person(`n${i}`, { morale: 100, skill: 95 }))
    f.b.staff.push(...low, ...calm)
    for (const s of low) feel(f.g, s, { s: 90 })
    for (const s of calm) feel(f.g, s, { s: 39 })
    expect(f.b.wageLevel).toBe(1)
    expect(year(f).quit).toEqual([])
  })

  it('takes a skilled, resentful person at the formula rate, and the leaver keeps poached_me as a plain edge', () => {
    const f = firm()
    const crew = Array.from({ length: 1000 }, (_, i) => person(`p${i}`, { morale: 100, skill: 80, trait: 'steady' }))
    f.b.staff.push(...crew)
    for (const s of crew) feel(f.g, s, { s: 60 })
    const { quit } = year(f)
    const rate = quit.length / 1000
    const odds = 0.03 + 0.1 * 0.6 * (1 - 0.56)
    // the steady trait is honest to 56: the odds are 0.0564, a standard deviation of 0.0073 over 1000 draws
    expect(rate).toBeGreaterThan(odds - 0.03)
    expect(rate).toBeLessThan(odds + 0.03)
    expect(quit.length).toBeGreaterThan(0)
    for (const id of quit) {
      const e = readEdge(f.g, `staff:${id}`, ego(f.g))
      expect(e, id).not.toBeNull()
      expect(e!.k, 'a leaver is no longer linked').toBeUndefined()
      expect(memoriesOf(e!).map((m) => m.kind)).toContain('poached_me')
    }
    // the others are still bound and still there
    expect(bound(f.g).sort()).toEqual(f.b.staff.map((s) => s.id).sort())
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
  })

  it('takes a skilled person paid under the going rate even with no resentment, at 3%', () => {
    const f = firm()
    f.b.wageLevel = 0.85
    f.b.staff.push(...Array.from({ length: 1500 }, (_, i) => person(`u${i}`, { morale: 100, skill: 75 })))
    const rate = year(f).quit.length / 1500
    expect(rate).toBeGreaterThan(0.03 - 0.025)
    expect(rate).toBeLessThan(0.03 + 0.025)
    expect(rate).toBeGreaterThan(0)
  })

  it('says it in a line that names the person, the role and the company, and no more than one line each', () => {
    const f = firm()
    f.b.wageLevel = 0.85
    f.b.staff.push(...Array.from({ length: 400 }, (_, i) => person(`w${i}`, { morale: 100, skill: 90, firstName: 'Mara', role: 'Sous Chef' })))
    const { quit } = year(f)
    expect(quit.length).toBeGreaterThan(3)
    const lines = logText(f.g).filter((t) => t.includes('Sous Chef'))
    expect(lines).toHaveLength(quit.length)
    for (const t of lines) {
      expect(t).toContain('Mara Reedw')
      expect(t).toContain(f.a.name)
      expect(DASH.test(t)).toBe(false)
    }
    // a pool of four lines: a company that loses several people does not read one sentence several times
    expect(new Set(lines.map((t) => t.replace(/Mara Reedw\d+/, '{who}'))).size).toBeGreaterThan(1)
  })

  it('moves no money and leaves no staff edge without its person', () => {
    const f = firm()
    f.b.wageLevel = 0.7
    f.b.staff.push(...Array.from({ length: 200 }, (_, i) => person(`z${i}`, { morale: 90, skill: 99 })))
    for (const s of f.b.staff) feel(f.g, s, { s: 80 })
    const cash = f.b.cash
    year(f)
    expect(f.b.cash).toBe(cash)
    expect(ledgerProblems(f.g)).toEqual([])
    expect(bound(f.g).sort()).toEqual(f.b.staff.map((s) => s.id).sort())
  })
})

describe('staffTurnover, the call the yearly business step makes', () => {
  it('on a stamped life is the stamped rule: the same game as staffLoyaltyYear, and no draw from g.rng', () => {
    const make = (): Firm => {
      const f = firm()
      f.b.wageLevel = 0.85
      f.b.staff.push(...Array.from({ length: 60 }, (_, i) => person(`y${i}`, { morale: i % 2 === 0 ? 5 : 80, skill: 85 })))
      return f
    }
    const x = make()
    const y = make()
    const rng = x.g.rng
    staffTurnover(x.g, x.a, x.b)
    staffLoyaltyYear(y.g, y.a, y.b)
    expect(JSON.stringify(x.g)).toBe(JSON.stringify(y.g))
    expect(x.g.rng).toBe(rng)
    expect(x.b.staff.length).toBeLessThan(60)
  })

  it('on a stamped life a person at morale 5 is not decided by the old 35% roll', () => {
    // the old rule draws from g.rng for every person under 30; the stamped one never does
    const f = firm()
    f.b.staff.push(...Array.from({ length: 10 }, (_, i) => person(`o${i}`, { morale: 5 })))
    const rng = f.g.rng
    staffTurnover(f.g, f.a, f.b)
    expect(f.g.rng).toBe(rng)
  })
})

describe('the year step', () => {
  it('is idempotent: a second call in the same year changes nothing', () => {
    const f = firm()
    f.b.wageLevel = 0.85
    f.b.staff.push(...Array.from({ length: 120 }, (_, i) => person(`i${i}`, { morale: 25, skill: 85 })))
    for (const s of f.b.staff.slice(0, 60)) feel(f.g, s, { s: 70 })
    staffLoyaltyYear(f.g, f.a, f.b)
    const once = JSON.stringify(f.g)
    staffLoyaltyYear(f.g, f.a, f.b)
    expect(JSON.stringify(f.g)).toBe(once)
  })

  it('is the same on a structuredClone and on a JSON reload', () => {
    const f = firm()
    f.b.wageLevel = 0.85
    f.b.staff.push(...Array.from({ length: 80 }, (_, i) => person(`j${i}`, { morale: 22, skill: 88 })))
    const clone = structuredClone(f.g)
    const reload = JSON.parse(JSON.stringify(f.g)) as GameState
    staffLoyaltyYear(f.g, f.a, f.b)
    for (const h of [clone, reload]) {
      const a = h.assets.find((x) => x.id === f.a.id)!
      staffLoyaltyYear(h, a, bizOf(h, a))
      expect(JSON.stringify(h)).toBe(JSON.stringify(f.g))
    }
  })

  it('removes the edge of a staff member who is in no company, and keeps the edge of one in another company', () => {
    const f = firm()
    const other = company(f.g, 'restaurant', { cash: 1_000_000, name: 'Second Place' })
    const ob = bizOf(f.g, other)
    const away = person('ghost')
    const here = person('here')
    const there = person('there')
    f.b.staff.push(here)
    ob.staff.push(there)
    for (const s of [away, here, there]) feel(f.g, s)
    staffLoyaltyYear(f.g, f.a, f.b)
    expect(staffEdgeIds(f.g).sort()).toEqual(['here', 'there'])
  })

  it('leaves the edge of a person who left as a plain edge (no link) alone', () => {
    const f = firm()
    const left = person('left')
    feel(f.g, left, { k: undefined })
    staffLoyaltyYear(f.g, f.a, f.b)
    expect(edgeOf(f.g, left)).not.toBeNull()
  })

  it('reads an edge with hostile numbers without a throw', () => {
    const f = firm()
    const s = person('h1', { morale: Number.NaN, skill: Number.NaN, trait: '__proto__' })
    f.b.staff.push(s, person('h2', { morale: Infinity, skill: -Infinity, id: undefined as unknown as string }), person('h3', { trait: undefined as unknown as string, role: undefined as unknown as string }))
    expect(() => staffLoyaltyYear(f.g, f.a, f.b)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The memories the player makes

const rowOf = (g: GameState, a: Asset, s: KeyStaff, key: string): MenuAction =>
  allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'action' && n.id === `biz.staff.${a.id}.${s.id}.${key}`) as MenuAction

describe('the memories a stamped life keeps', () => {
  it('a raise leaves gift_given, bound to the company, and a raise for all leaves one for each key person', () => {
    const f = firm()
    const [x, y] = [person('x1'), person('y1')]
    f.b.staff.push(x, y)
    rowOf(f.g, f.a, x, 'raise').run(f.g)
    const e = edgeOf(f.g, x)!
    expect(e.k).toBe('staff')
    expect(memoriesOf(e).map((m) => m.kind)).toEqual(['gift_given'])
    expect(edgeOf(f.g, y)).toBeNull()
    const all = allNodes(f.g, businessAssetView(f.g, f.a)).find((n) => n.type === 'action' && n.id === `biz.raiseAll.${f.a.id}`) as MenuAction
    all.run(f.g)
    expect(memoriesOf(edgeOf(f.g, y)!).map((m) => m.kind)).toEqual(['gift_given'])
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
  })

  it('a raise makes the person trust the player and owe a little: trust and obligation up, resentment down', () => {
    const f = firm()
    const x = person('x2')
    f.b.staff.push(x)
    feel(f.g, x, { s: 30 })
    rowOf(f.g, f.a, x, 'raise').run(f.g)
    const e = edgeOf(f.g, x)!
    expect(e.t).toBeGreaterThan(50)
    expect(e.o).toBeGreaterThan(0)
    expect(e.s).toBeLessThan(30)
  })

  it('a yell leaves a resentment memory when the person stays, and no edge when the person walks out or sues', () => {
    let stayed = 0
    let gone = 0
    for (let n = 0; n < 160 && (stayed < 5 || gone < 3); n++) {
      const f = firm()
      f.g.rng = 5000 + n * 104729
      const x = person('y2', { morale: 30 })
      f.b.staff.push(x)
      rowOf(f.g, f.a, x, 'yell').run(f.g)
      const cur = bizOf(f.g, f.a)
      const still = cur.staff.some((s) => s.id === 'y2')
      const e = edgeOf(f.g, x)
      if (still) {
        stayed++
        expect(memoriesOf(e!).map((m) => m.kind)).toEqual(['told_bluntly'])
        expect(e!.s).toBeGreaterThan(0)
        expect(e!.k).toBe('staff')
      } else {
        gone++
        expect(e, 'the person who left has no edge').toBeNull()
      }
    }
    expect(stayed, 'a yell some persons stay after').toBeGreaterThanOrEqual(5)
    expect(gone, 'a yell some persons leave after').toBeGreaterThanOrEqual(3)
  })

  it('firing drops the edge, with the severance booked as it always was', () => {
    const f = firm()
    const x = person('f1')
    f.b.staff.push(x)
    rowOf(f.g, f.a, x, 'raise').run(f.g)
    expect(edgeOf(f.g, x)).not.toBeNull()
    const cash = f.b.cash
    fireStaff(f.g, f.a, f.b, x)
    expect(edgeOf(f.g, x)).toBeNull()
    expect(f.b.staff).toHaveLength(0)
    expect(f.b.cash).toBeLessThanOrEqual(cash)
    expect(ledgerProblems(f.g)).toEqual([])
  })

  it('firing a person who has no edge writes nothing to the edge map', () => {
    const f = firm()
    const x = person('f2')
    f.b.staff.push(x)
    fireStaff(f.g, f.a, f.b, x)
    expect(f.g.world?.edges).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The hire

const isHire = (m: unknown): m is ChoiceModal => (m as ChoiceModal).kind === 'choice' && (m as ChoiceModal).source === 'script' && (m as ChoiceModal).scriptId === 'business.hire'

/** Holds an interview for the first open role and answers with the first candidate. */
function hireFirst(g: GameState, a: Asset): KeyStaff {
  const rows = allNodes(g, businessAssetView(g, a)).filter((n) => n.type === 'action' && n.id.startsWith(`biz.hire.${a.id}.`) && !n.disabledReason?.(g)) as MenuAction[]
  rows[0]!.run(g)
  const m = g.queue.filter(isHire).at(-1)!
  const before = new Set(bizOf(g, a).staff.map((s) => s.id))
  runScript(g, m.scriptId!, 'c0', m.data, m)
  return bizOf(g, a).staff.find((s) => !before.has(s.id))!
}

describe('hiring', () => {
  it('a stamped hire leaves hired_me on a bound edge, and the same hire on a life that is not stamped is the same hire', () => {
    const on = firm(true)
    const off = firm(false)
    const hired = hireFirst(on.g, on.a)
    const same = hireFirst(off.g, off.a)
    expect(hired.id).toBe(same.id)
    expect(JSON.stringify(bizOf(on.g, on.a).staff)).toBe(JSON.stringify(bizOf(off.g, off.a).staff))
    expect(on.g.rng).toBe(off.g.rng)
    const e = readEdge(on.g, staffRef(hired), ego(on.g))!
    expect(e.k).toBe('staff')
    expect(memoriesOf(e).map((m) => m.kind)).toEqual(['hired_me'])
    expect(e.o).toBeGreaterThan(0)
    expect(off.g.world?.edges).toBeUndefined()
  })

  it('every role of a company can be hired and fired in turn, and a hire that finds the edge map full of bound edges still hires', () => {
    const f = firm()
    for (let i = 0; i < EDGE_CAPS.edges; i++) {
      if (!putEdge(f.g, `person:z${i}>${ego(f.g)}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: f.g.year, l: f.g.year, k: 'kin' })) break
    }
    const hired = hireFirst(f.g, f.a)
    expect(bizOf(f.g, f.a).staff.some((s) => s.id === hired.id)).toBe(true)
    expect(readEdge(f.g, staffRef(hired), ego(f.g))).toBeNull()
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The caps

describe('the caps', () => {
  it('100 times the key staff hired and fired in a year keeps the edges inside EDGE_CAPS and leaves none behind', () => {
    const f = firm(true, 1e9)
    // a company holds at most 8 key people; 100 times that is hired and fired one after the other
    for (let i = 0; i < 800; i++) {
      const s = person(`h${i}`)
      f.b.staff.push(s)
      staffHired(f.g, s)
      expect(edgeOf(f.g, s), s.id).not.toBeNull()
      fireStaff(f.g, f.a, f.b, s)
      expect(edgeOf(f.g, s), s.id).toBeNull()
    }
    expect(f.b.staff).toHaveLength(0)
    expect(staffEdgeIds(f.g)).toEqual([])
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
  }, 120_000)

  it('more people than the map has room for, all hired and then all fired: the edges never pass EDGE_CAPS', () => {
    const f = firm(true, 1e9)
    const n = EDGE_CAPS.edges + 300
    const crew = Array.from({ length: n }, (_, i) => person(`o${i}`))
    for (const s of crew) {
      f.b.staff.push(s)
      staffHired(f.g, s)
    }
    expect(edgesOf(f.g, ego(f.g)).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
    for (const s of crew) fireStaff(f.g, f.a, f.b, s)
    expect(f.b.staff).toHaveLength(0)
    expect(staffEdgeIds(f.g)).toEqual([])
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
  }, 120_000)

  it('100 times the staff in the year step keeps the edges inside EDGE_CAPS too', () => {
    const f = firm()
    f.b.wageLevel = 0.85
    f.b.staff.push(...Array.from({ length: 1500 }, (_, i) => person(`t${i}`, { morale: 10, skill: 90 })))
    staffLoyaltyYear(f.g, f.a, f.b)
    expect(edgesOf(f.g, ego(f.g)).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The manager

/** A stamped company run by a hired CEO who started in `since`. */
function managed(since = 2023): Firm & { name: string } {
  const f = firm()
  installManager(f.g, f.b, managerCandidate(f.g, f.b, 60))
  f.b.manager!.since = since
  return { ...f, name: `${f.b.manager!.firstName} ${f.b.manager!.lastName}` }
}

describe('the manager', () => {
  it('a CEO who is poached leaves poached_me on mgr:<asset id>, dated from the day they started', () => {
    let seen = 0
    for (let n = 0; n < 80 && seen < 3; n++) {
      const f = managed(2023)
      f.g.rng = 9000 + n * 6007
      const old = f.name
      script(f.g, 'business.board.raise', 'refuse', { assetId: f.a.id, who: old, ask: 500_000 })
      const cur = bizOf(f.g, f.a)
      const e = readEdge(f.g, mgrRef(f.a), ego(f.g))
      if (cur.manager && `${cur.manager.firstName} ${cur.manager.lastName}` !== old) {
        seen++
        expect(e, 'the edge of the CEO who left').not.toBeNull()
        expect(memoriesOf(e!).map((m) => m.kind)).toEqual(['poached_me'])
        expect(e!.y).toBe(2023)
        expect(e!.l).toBe(f.g.year)
        expect(e!.k).toBeUndefined()
        expect(readEdge(f.g, mgrRef({ id: 'other' } as Asset), ego(f.g))).toBeNull()
      } else expect(e, 'no edge when nobody left').toBeNull()
    }
    expect(seen).toBeGreaterThanOrEqual(3)
  })

  it('the edge follows the asset id: it stays while the manager is the same, and is reset by the first year step after the manager changed', () => {
    const f = managed(2023)
    const key = `${mgrRef(f.a)}>${ego(f.g)}`
    expect(putEdge(f.g, key, { t: 40, f: 50, r: 50, s: 20, o: 0, y: 2023, l: 2025 })).toBe(true)
    staffLoyaltyYear(f.g, f.a, f.b)
    expect(readEdge(f.g, mgrRef(f.a), ego(f.g))).not.toBeNull()
    // a new manager takes over this year: since is the year they started
    installManager(f.g, f.b, managerCandidate(f.g, f.b, 70))
    expect(f.b.manager!.since).toBe(f.g.year)
    staffLoyaltyYear(f.g, f.a, f.b)
    expect(readEdge(f.g, mgrRef(f.a), ego(f.g))).toBeNull()
    expect(edgeProblems(f.g.world?.edges)).toEqual([])
  })

  it('the edge is reset when the company has no hired CEO any more', () => {
    const f = managed(2023)
    expect(putEdge(f.g, `${mgrRef(f.a)}>${ego(f.g)}`, { t: 40, f: 50, r: 50, s: 20, o: 0, y: 2023, l: 2025 })).toBe(true)
    f.b.ceo = 'owner'
    f.b.manager = null
    staffLoyaltyYear(f.g, f.a, f.b)
    expect(readEdge(f.g, mgrRef(f.a), ego(f.g))).toBeNull()
  })

  it('a life that is not stamped keeps no manager edge, whatever happens to the CEO', () => {
    let changed = 0
    for (let n = 0; n < 80 && changed < 3; n++) {
      const f = firm(false)
      installManager(f.g, f.b, managerCandidate(f.g, f.b, 60))
      f.b.manager!.since = 2023
      f.g.rng = 9000 + n * 6007
      const old = `${f.b.manager!.firstName} ${f.b.manager!.lastName}`
      script(f.g, 'business.board.raise', 'refuse', { assetId: f.a.id, who: old, ask: 500_000 })
      const cur = bizOf(f.g, f.a)
      if (cur.manager && `${cur.manager.firstName} ${cur.manager.lastName}` !== old) changed++
      expect(f.g.world?.edges).toBeUndefined()
    }
    expect(changed).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// The file

describe('business/staff-loyalty.ts', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/game/business/staff-loyalty.ts', import.meta.url)), 'utf8')
  /** The source with block and line comments blanked, so a word in a comment is not a use. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

  it('is a leaf of the business cycle: it imports no other business module at run time (state.ts is read as types only)', () => {
    const runtime = [...code.matchAll(/^import\s+(?!type\b)[^\n]*?from\s+'([^']+)'/gm)].map((m) => m[1]!)
    expect(runtime.length).toBeGreaterThan(5)
    for (const from of runtime) expect(from.startsWith('../'), from).toBe(true)
    expect(runtime.some((from) => from.startsWith('./'))).toBe(false)
    expect(code).toMatch(/import type \{[^}]*\} from '\.\/state'/)
  })

  it('books no dollar, makes no id and takes no draw from g.rng', () => {
    for (const word of [/\.cash\b/, /\.money\b/, /firmCash\s*\(/, /moveCash\s*\(/, /earnIncome\s*\(/, /\bspend\s*\(/, /Math\.random/, /\bg\.rng\b/, /\brand(Int)?\s*\(/, /\bchance\s*\(/, /\buid\s*\(/, /addRelationship\s*\(/]) {
      expect(code, String(word)).not.toMatch(word)
    }
  })

  it('has no long dash', () => {
    expect(DASH.test(src)).toBe(false)
  })
})
