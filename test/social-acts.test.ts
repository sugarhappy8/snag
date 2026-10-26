// R4-E10a (D.4, X24, X26, X40, X42, C7, C9, C14, C31, C39): the SocialAct engine and the favor family. A typed act is a pure `blocked` and a pure
// `plan` (a consequence patch, ledger lines and luck from the stream `social`), and `runAct` (society/acts.ts) is the one place an act writes.
// The favor acts (society/favor.ts) are the first three: the call-in (`helpAct`), a vouch to a third person and a brokered peace with a relative
// who is cut out. Every one is a no-op on a life that is not stamped (X6). What the file proves, in the order of the plan:
//
//   1. The engine: runAct books money lines once through cash.moveCash, writes the edge, the memories, the relationship deltas, the log and
//      the notice, in that order, and only after `blocked` says nothing; a second side (`also`) is the third person of a vouch or a brokered
//      relative; a patch is a pure function of the state and the stream.
//   2. Purity: `blocked`, `plan` and the menu rows read a frozen game with a trapped g.rng.
//   3. The favor call-in: f 50 and t 40, one in three years, strength min(1, 0.5 + reach / 24), the obligation it leaves (no decay, no wealth term),
//      the strain memory when the favors pile up unreturned, and farming (100 attempts across 40 people in 3 years).
//   4. Vouch (at most +15 with a third person who knows both) and broker (at most 0.15 on the peace odds of a cut-out relative, stored as obligation).
//   5. The menu: socialNodes is an empty plain list on a life that is not stamped, rows on a stamped one, the ways back for an estranged person.
//   6. The module society.acts: close phase, order 6, one entry, idempotent by social.ay, a no-op unstamped.
//   7. Streams, text and layers: the stream `social`, the four pools, and what society/ may import.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ageUp } from '../src/game/aging'
import { addMoney, getPerson } from '../src/game/core'
import { withFlags } from '../src/game/flags'
import { createNewLife } from '../src/game/life'
import { personEntity } from '../src/game/kernel/person-ref'
import { yearlyEntries } from '../src/game/kernel/registry'
import { tokenSeen } from '../src/game/kernel/ledger'
import { outcomeStream } from '../src/game/kernel/streams'
import { personActions } from '../src/game/relationships'
import { runAct as runActViaDoor, socialNodes as socialNodesViaDoor } from '../src/game/society/contract'
import { actRoll, playerEdgeKey, runAct, type ActCtx, type ActPatch, type SocialAct } from '../src/game/society/acts'
import {
  BROKER_OBLIGATION,
  BROKER_ODDS_MAX,
  BROKER_ODDS_PER_POINT,
  FAVOR_COOLDOWN,
  FAVOR_MIN_AFFECTION,
  FAVOR_MIN_TRUST,
  FAVOR_OWES,
  FAVOR_BOND,
  VOUCH_MAX,
  acquainted,
  broker,
  brokerFor,
  favorBlock,
  favorOdds,
  helpAct,
  reachOf,
  strengthOf,
  thirdFor,
  vouch,
} from '../src/game/society/favor'
import { socialNodes } from '../src/game/society/menu'
import { societyModule, yearlyActs } from '../src/game/society/module'
import { axesOf, honestyOf, temperOf } from '../src/game/society/seam'
import type { Edge } from '../src/game/world/edges'
import { readEdge } from '../src/game/world/edges'
import { putEdge } from '../src/game/world/edge-write'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import { readSocial, socialOn } from '../src/game/world/social'
import type { GameState, MenuAction, MenuNode, Person } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { findSeed } from './seed-kit'
import { cast, socialGame } from './social-kit'
import { trapRng } from './social-parity-kit'

const ROOT = resolve(__dirname, '..')
const src = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8')

// ---------------------------------------------------------------------------------------------------------------------
// Helpers

const adult = (g: GameState): GameState => {
  g.character.age = 30
  return g
}

/** The key of the edge person > player. */
const keyOf = (g: GameState, p: Person): string => `${personEntity(p)}>${playerRef(g)}`

/** A full edge for a person, f held equal to the relationship (the affection invariant). */
function setEdge(g: GameState, p: Person, over: Partial<Edge> = {}): void {
  const ok = putEdge(g, keyOf(g, p), { t: 60, f: p.relationship, r: 50, s: 0, o: 0, y: g.year, l: g.year, ...over })
  if (!ok) throw new Error('setEdge: putEdge refused')
}

const edgeOf = (g: GameState, p: Person): Readonly<Edge> | null => readEdge(g, personEntity(p), playerRef(g))

/** The will record that makes a person estranged (and cut out) for the ego. */
function estrange(g: GameState, p: Person): void {
  p.data.wl = { by: g.character.id, anger: 60, cut: true, estr: true }
}

/** A stamped adult with a circle of friends (every friend knows every other, so reach is the size of the circle less one). */
function friends(n: number, seed = 1): { g: GameState; list: Person[] } {
  const g = adult(socialGame(seed))
  const list: Person[] = []
  for (let i = 0; i < n; i++) list.push(cast(g, 70, 'friend'))
  return { g, list }
}

/** A context for a plan or a blocked call made by hand, with a roll the test chooses. */
function ctx(g: GameState, p: Person | null, roll: () => number = () => 0.5, key = p === null ? 'person:x>person:y' : keyOf(g, p)): ActCtx {
  return { g, key, person: p, year: g.year, roll }
}

const nodeById = (nodes: readonly MenuNode[], id: string): MenuAction | undefined => nodes.find((n): n is MenuAction => n.type === 'action' && n.id === id)

/** What a world looks like for a quick equality check: the whole state as text. */
const snap = (g: GameState): string => JSON.stringify(g)

/** The seed of a stamped game whose stream `social` gives these rolls to the acts of a scripted sequence: a lifeId, since the stream keys on it. */
function lifeThat(label: string, build: (lifeId: string) => boolean): string {
  const n = findSeed((s) => build(`life-${s}`), { label, tries: 400 })
  return `life-${n}`
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. The engine

describe('runAct: the one applier', () => {
  /** A made-up act: its patch is whatever the test gives. */
  const act = (patch: ActPatch, blocked: string | null = null, id = 'test.act'): SocialAct => ({ id, blocked: () => blocked, plan: () => patch })

  it('returns null and writes nothing for a life that is not stamped', () => {
    const g = adult(makeTestGame(1))
    const p = cast(g, 70, 'friend')
    const before = snap(g)
    expect(runAct(g, act({ log: 'x' }), keyOf(g, p), p)).toBeNull()
    expect(snap(g)).toBe(before)
  })

  it('returns null when blocked says anything, and writes nothing', () => {
    const { g, list } = friends(1)
    const before = snap(g)
    expect(runAct(g, act({ edge: { c: g.year }, log: 'x' }, 'no'), keyOf(g, list[0]!), list[0]!)).toBeNull()
    expect(snap(g)).toBe(before)
  })

  it('applies the edge patch, the memories, the relationship deltas, the log and the notice, and returns the patch', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    const patch: ActPatch = {
      edge: { c: g.year, o: -20 },
      remember: [{ kind: 'stood_by_me', w: 2 }],
      relationship: [{ delta: 5 }],
      log: 'I did something.',
      notice: { title: 'Something', text: 'It happened.' },
    }
    const out = runAct(g, act(patch), keyOf(g, p), p)
    expect(out).toEqual(patch)
    const e = edgeOf(g, p)!
    expect(e.c).toBe(g.year)
    expect(e.o).not.toBe(0)
    expect(e.m?.some((m) => m.startsWith('stood_by_me'))).toBe(true)
    expect(p.relationship).toBe(75)
    expect(e.f).toBe(75)
    expect(g.log.at(-1)!.entries.some((l) => l.text === 'I did something.')).toBe(true)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title === 'Something')).toBe(true)
  })

  it('books a money line once through cash.moveCash under support, from a person to the player, and a replay of the token books nothing', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    p.money = 10_000
    const line = { from: p, to: 'player' as const, amount: 3_000, token: 'test:2026:abcd1234' }
    const before = { you: g.character.money, them: p.money }
    expect(runAct(g, act({ money: [line] }), keyOf(g, p), p)).not.toBeNull()
    expect(g.character.money).toBe(before.you + 3_000)
    expect(p.money).toBe(before.them - 3_000)
    expect(runAct(g, act({ money: [line] }), keyOf(g, p), p)).not.toBeNull()
    expect(g.character.money).toBe(before.you + 3_000)
    expect(p.money).toBe(before.them - 3_000)
    expect(tokenSeen(g, line.token)).toBe(true)
  })

  it('moves the same dollars out of the payer and into the receiver (no mint, no burn)', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    addMoney(g, 5_000, 'gift')
    const total = g.character.money + p.money
    const line = { from: 'player' as const, to: p, amount: 1_234, token: 'test:2026:00000001' }
    runAct(g, act({ money: [line] }), keyOf(g, p), p)
    expect(g.character.money + p.money).toBe(total)
  })

  it('applies a second side to another person and edge, and refuses a patch whose second side is not in the game', () => {
    const { g, list } = friends(2)
    const [a, b] = list as [Person, Person]
    const patch: ActPatch = { edge: { c: g.year }, also: [{ key: keyOf(g, b), who: b.id, relationship: [{ delta: 9 }] }] }
    expect(runAct(g, act(patch), keyOf(g, a), a)).not.toBeNull()
    expect(b.relationship).toBe(79)
    expect(a.relationship).toBe(70)
    const before = snap(g)
    const ghost: ActPatch = { edge: { c: g.year + 1 }, also: [{ key: keyOf(g, b), who: 'nobody', relationship: [{ delta: 9 }] }] }
    expect(runAct(g, act(ghost), keyOf(g, a), a)).toBeNull()
    expect(snap(g)).toBe(before)
  })

  it('refuses a key that is not the ego\'s, a person that does not match the key, and a person that is not in the game', () => {
    const { g, list } = friends(2)
    const [a, b] = list as [Person, Person]
    const p = act({ edge: { c: g.year } })
    const before = snap(g)
    expect(runAct(g, p, `${personEntity(a)}>${personEntity(b)}`, a)).toBeNull()
    expect(runAct(g, p, 'person:old-ego>person:someone', a)).toBeNull()
    expect(runAct(g, p, keyOf(g, a), b)).toBeNull()
    expect(runAct(g, p, keyOf(g, a), { ...a, id: 'p-not-here' })).toBeNull()
    expect(runAct(g, p, 'not a key', a)).toBeNull()
    expect(snap(g)).toBe(before)
  })

  it('writes nothing when the edge cannot be written (a map full of bound edges and none for this person)', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    for (let i = 0; i < 1200; i++) {
      if (!putEdge(g, `person:z${i}>${playerRef(g)}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, k: 'kin' })) throw new Error('fill failed')
    }
    expect(edgeOf(g, p)).toBeNull()
    const before = snap(g)
    expect(runAct(g, act({ edge: { c: g.year }, log: 'x' }), keyOf(g, p), p)).toBeNull()
    expect(snap(g)).toBe(before)
  })

  it('makes the edge of a person who has none, with f the relationship, and keeps what the patch says', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    expect(edgeOf(g, p)).toBeNull()
    runAct(g, act({ edge: { c: g.year, o: -20 } }), keyOf(g, p), p)
    const e = edgeOf(g, p)!
    expect([e.t, e.f, e.r, e.s, e.o, e.c, e.y, e.l]).toEqual([50, 70, 50, 0, -20, g.year, g.year, g.year])
  })

  it('works through the contract door, which is the same function', () => {
    expect(runActViaDoor).toBe(runAct)
    expect(socialNodesViaDoor).toBe(socialNodes)
  })

  it('is deterministic: the same state and the same act give the same patch and the same state twice', () => {
    const play = (): { out: ActPatch | null; text: string } => {
      const { g, list } = friends(3)
      const out = runAct(g, helpAct, keyOf(g, list[0]!), list[0]!)
      return { out, text: snap(g) }
    }
    expect(play()).toEqual(play())
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. Purity

describe('purity: blocked, plan and the menu read a frozen game with a trapped g.rng', () => {
  it('blocked and plan of the three favor acts, the odds and the menu rows', () => {
    const { g, list } = friends(6)
    const [a, b, c] = list as [Person, Person, Person]
    estrange(g, c)
    setEdge(g, c, { s: 40 })
    setEdge(g, a)
    const frozen = deepFreeze(trapRng(g))
    const before = snap(frozen)
    expect(() => {
      void favorBlock(frozen, a)
      for (const act of [helpAct, vouch(b), broker(c)]) {
        const x = ctx(frozen, a)
        void act.blocked(frozen, x)
        void act.plan(frozen, x)
      }
      void favorOdds(frozen, a)
      void strengthOf(frozen, a)
      void reachOf(frozen, a)
      void thirdFor(frozen, a)
      void brokerFor(frozen, c)
      for (const p of list) void socialNodes(frozen, p)
      for (const p of list) for (const n of socialNodes(frozen, p)) if (n.type === 'action') { void n.disabledReason?.(frozen); void n.visible?.(frozen); void n.subtitle }
    }).not.toThrow()
    expect(snap(frozen)).toBe(before)
  })

  it('the stream roll of an act is a pure read: no g.rng, no g.nextId, no flag', () => {
    const { g, list } = friends(1)
    const frozen = deepFreeze(trapRng(g))
    expect(() => actRoll(frozen, 'favor.help', keyOf(frozen, list[0]!))()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. The call-in

describe('the favor call-in (helpAct)', () => {
  it('needs f 50 and t 40, and a person who is alive, not a pet and not estranged', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    expect(FAVOR_MIN_AFFECTION).toBe(50)
    expect(FAVOR_MIN_TRUST).toBe(40)
    expect(favorBlock(g, p)).toBeNull()
    // the edge decides when there is one
    setEdge(g, p, { t: 39 })
    expect(favorBlock(g, p)).not.toBeNull()
    setEdge(g, p, { t: 40 })
    expect(favorBlock(g, p)).toBeNull()
    p.relationship = 49
    setEdge(g, p, { t: 60 })
    expect(favorBlock(g, p)).not.toBeNull()
    p.relationship = 50
    setEdge(g, p, { t: 60 })
    expect(favorBlock(g, p)).toBeNull()
    p.alive = false
    expect(favorBlock(g, p)).not.toBeNull()
    p.alive = true
    estrange(g, p)
    expect(favorBlock(g, p)).not.toBeNull()
    delete p.data.wl
    const dog = cast(g, 90, 'pet')
    expect(favorBlock(g, dog)).not.toBeNull()
  })

  it('reads a person with no edge as t 50 and f their relationship', () => {
    const { g, list } = friends(1)
    expect(edgeOf(g, list[0]!)).toBeNull()
    expect(favorBlock(g, list[0]!)).toBeNull()
    list[0]!.relationship = 45
    expect(favorBlock(g, list[0]!)).not.toBeNull()
  })

  it('allows one call-in an edge every 3 years, a refusal included, and the cooldown starts at the call', () => {
    expect(FAVOR_COOLDOWN).toBe(3)
    const { g, list } = friends(1)
    const p = list[0]!
    expect(runAct(g, helpAct, keyOf(g, p), p)).not.toBeNull()
    const y = g.year
    expect(edgeOf(g, p)!.c).toBe(y)
    for (const dy of [0, 1, 2]) {
      g.year = y + dy
      expect(runAct(g, helpAct, keyOf(g, p), p), `year +${dy}`).toBeNull()
    }
    g.year = y + 3
    expect(runAct(g, helpAct, keyOf(g, p), p)).not.toBeNull()
    expect(edgeOf(g, p)!.c).toBe(y + 3)
  })

  it('a favor done lowers the obligation by 20 (the player owes them) and warms the bond; one refused costs a point and no obligation', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    setEdge(g, p, { o: 10 })
    const done = helpAct.plan(g, ctx(g, p, () => 0))
    expect(done.edge).toMatchObject({ c: g.year, o: 10 - FAVOR_OWES })
    expect(done.relationship).toEqual([{ delta: FAVOR_BOND }])
    expect(done.log).toMatch(new RegExp(p.firstName))
    const refused = helpAct.plan(g, ctx(g, p, () => 0.9999))
    expect(refused.edge).toEqual({ c: g.year })
    expect(refused.relationship).toEqual([{ delta: -1, kind: 'offence' }])
    expect(refused.log).toMatch(new RegExp(p.firstName))
  })

  it('has strength min(1, 0.5 + reach / 24), reach being the giver\'s living family and friends in g.people', () => {
    const g = adult(socialGame(1))
    const first = cast(g, 70, 'friend')
    expect(reachOf(g, first)).toBe(0)
    expect(strengthOf(g, first)).toBe(0.5)
    const crowd: Person[] = []
    for (let i = 0; i < 24; i++) crowd.push(cast(g, 70, 'friend'))
    expect(reachOf(g, first)).toBe(24)
    expect(strengthOf(g, first)).toBe(1)
    // a dead friend and a pet and a cousin of another circle do not count
    crowd[0]!.alive = false
    cast(g, 70, 'pet')
    cast(g, 70, 'coworker', { contextId: 'firm-1' })
    expect(reachOf(g, first)).toBe(23)
    for (const [n, want] of [[0, 0.5], [6, 0.75], [12, 1], [40, 1]] as const) {
      const h = adult(socialGame(2))
      const lead = cast(h, 70, 'friend')
      for (let i = 0; i < n; i++) cast(h, 70, 'friend')
      expect(strengthOf(h, lead), `reach ${n}`).toBe(want)
    }
  })

  it('has odds within 0.25 and 0.95 that rise with strength and trust and read honesty and temper from the seam', () => {
    const g = adult(socialGame(1))
    const lone = cast(g, 70, 'friend', { traits: ['kind', 'calm'] })
    const low = favorOdds(g, lone)
    for (let i = 0; i < 20; i++) cast(g, 70, 'friend')
    const high = favorOdds(g, lone)
    expect(high).toBeGreaterThan(low)
    setEdge(g, lone, { t: 100 })
    expect(favorOdds(g, lone)).toBeGreaterThan(high)
    for (const p of g.people) {
      const o = favorOdds(g, p)
      expect(o).toBeGreaterThanOrEqual(0.25)
      expect(o).toBeLessThanOrEqual(0.95)
    }
    const liar = cast(g, 70, 'friend', { traits: ['dishonest', 'hot-headed'] })
    const saint = cast(g, 70, 'friend', { traits: ['honest', 'calm'] })
    expect(honestyOf(g, saint)).toBeGreaterThan(honestyOf(g, liar))
    expect(temperOf(g, liar)).toBeGreaterThan(temperOf(g, saint))
    expect(favorOdds(g, saint)).toBeGreaterThan(favorOdds(g, liar))
    expect(axesOf(g, saint).honesty).toBe(honestyOf(g, saint))
  })

  it('adds no wealth term: a rich giver and a poor one have the same odds', () => {
    const { g, list } = friends(2)
    list[0]!.money = 5
    list[1]!.money = 5e12
    expect(favorOdds(g, list[0]!)).toBe(favorOdds(g, list[1]!))
  })

  it('does not decay the obligation: years later it is still there, and a year step touches no `o`', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    runAct(g, helpAct, keyOf(g, p), p)
    const done = edgeOf(g, p)!.o
    for (let i = 0; i < 40; i++) {
      g.year += 1
      yearlyActs(g)
    }
    expect(edgeOf(g, p)!.o).toBe(done)
  })

  it('writes asked_too_often on a third favor within 6 years while two are still owed, and not on the first two', () => {
    const rig = (lifeId: string): GameState => {
      const { g, list } = friends(3)
      g.lifeId = lifeId
      void list
      return g
    }
    const allDone = (lifeId: string): boolean => {
      const g = rig(lifeId)
      const p = g.people[0]!
      for (const dy of [0, 3, 6]) {
        g.year = 2026 + dy
        const out = runAct(g, helpAct, keyOf(g, p), p)
        if (out === null || (out.relationship?.[0]?.delta ?? 0) <= 0) return false
      }
      return true
    }
    const g = rig(lifeThat('three favors done', allDone))
    const p = g.people[0]!
    const seen: boolean[] = []
    for (const dy of [0, 3, 6]) {
      g.year = 2026 + dy
      runAct(g, helpAct, keyOf(g, p), p)
      seen.push((edgeOf(g, p)!.m ?? []).some((m) => m.startsWith('asked_too_often')))
    }
    expect(seen).toEqual([false, false, true])
  })

  it('does not write it for favors a long time apart', () => {
    const g = adult(socialGame(1))
    const p = cast(g, 70, 'friend')
    setEdge(g, p, { o: -60 })
    const plan = helpAct.plan(g, ctx(g, p, () => 0))
    expect(plan.remember).toBeUndefined()
    g.year += 1
    setEdge(g, p, { o: -60, c: g.year - 7 })
    expect(helpAct.plan(g, ctx(g, p, () => 0)).remember).toBeUndefined()
    setEdge(g, p, { o: -60, c: g.year - 6 })
    expect(helpAct.plan(g, ctx(g, p, () => 0)).remember).toEqual([{ kind: 'asked_too_often', w: 1 }])
    setEdge(g, p, { o: -39, c: g.year - 6 })
    expect(helpAct.plan(g, ctx(g, p, () => 0)).remember).toBeUndefined()
  })

  it('bounds farming: 100 attempts across 40 people in 3 years give at most one call-in a person and a bounded gain', () => {
    const { g, list } = friends(40)
    const startRel = new Map(list.map((p) => [p.id, p.relationship]))
    const calls = new Map<string, number>()
    const y0 = g.year
    for (let year = y0; year < y0 + 3; year++) {
      g.year = year
      for (let i = 0; i < 100; i++) {
        const p = list[i % list.length]!
        if (runAct(g, helpAct, keyOf(g, p), p) !== null) calls.set(p.id, (calls.get(p.id) ?? 0) + 1)
      }
    }
    expect(calls.size).toBe(40)
    for (const [id, n] of calls) expect(n, id).toBe(1)
    let gain = 0
    for (const p of list) gain += p.relationship - startRel.get(p.id)!
    expect(gain).toBeLessThanOrEqual(40 * FAVOR_BOND)
    // and a fourth year opens each of them again
    g.year = y0 + 3
    let again = 0
    for (const p of list) if (runAct(g, helpAct, keyOf(g, p), p) !== null) again++
    expect(again).toBe(40)
  })

  it('leaves a done favor as obligation that persists, and the player\'s other numbers alone', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    const you = g.character.money
    const happy = g.character.stats.happiness
    runAct(g, helpAct, keyOf(g, p), p)
    expect(g.character.money).toBe(you)
    expect(g.character.stats.happiness).toBe(happy)
  })

  it('draws nothing from g.rng and the log line names the person', () => {
    const { g, list } = friends(1)
    const p = list[0]!
    const rng = g.rng
    const out = runAct(g, helpAct, keyOf(g, p), p)!
    expect(g.rng).toBe(rng)
    expect(out.log).toContain(p.firstName)
    expect(out.log!.length).toBeLessThanOrEqual(90)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. Vouch and broker

describe('acquaintance and the third person', () => {
  it('two people know each other in the same circle: the family, the friends or the same school or firm', () => {
    const g = adult(socialGame(1))
    const mum = cast(g, 70, 'parent')
    const bro = cast(g, 70, 'sibling')
    const pal = cast(g, 70, 'friend')
    const pal2 = cast(g, 70, 'bestFriend')
    const w1 = cast(g, 70, 'coworker', { contextId: 'firm-1' })
    const w2 = cast(g, 70, 'boss', { contextId: 'firm-1' })
    const w3 = cast(g, 70, 'coworker', { contextId: 'firm-2' })
    const stranger = cast(g, 70, 'enemy')
    expect(acquainted(mum, bro)).toBe(true)
    expect(acquainted(pal, pal2)).toBe(true)
    expect(acquainted(w1, w2)).toBe(true)
    expect(acquainted(w1, w3)).toBe(false)
    expect(acquainted(mum, pal)).toBe(false)
    expect(acquainted(stranger, stranger)).toBe(false)
    expect(acquainted(mum, mum)).toBe(false)
  })

  it('thirdFor picks the living, reachable acquaintance with the lowest relationship, ties by id, and none when everyone is at 100', () => {
    const g = adult(socialGame(1))
    const giver = cast(g, 70, 'friend')
    const a = cast(g, 90, 'friend')
    const b = cast(g, 30, 'friend')
    const c = cast(g, 30, 'friend')
    expect(thirdFor(g, giver)?.id).toBe([b, c].sort((x, y) => (x.id < y.id ? -1 : 1))[0]!.id)
    b.alive = false
    c.relationship = 100
    expect(thirdFor(g, giver)?.id).toBe(a.id)
    a.relationship = 100
    expect(thirdFor(g, giver)).toBeNull()
  })
})

describe('vouch', () => {
  it('adds at most 15 relationship with a third person who knows both, and 8 at the least, when the giver says yes', () => {
    expect(VOUCH_MAX).toBe(15)
    const { g, list } = friends(30)
    const third = list[0]!
    third.relationship = 20
    const out = runAct(g, vouch(third), keyOf(g, list[1]!), list[1]!)
    expect(out).not.toBeNull()
    if (out!.also === undefined) {
      // the giver said no: the third is where they were
      expect(third.relationship).toBe(20)
    } else {
      const delta = out!.also[0]!.relationship![0]!.delta
      expect(delta).toBeGreaterThanOrEqual(8)
      expect(delta).toBeLessThanOrEqual(15)
      expect(third.relationship).toBe(20 + delta)
    }
  })

  it('on a plan with a done roll: the third gains round(15 x strength), the voucher pays a call-in and owes 20 more', () => {
    const { g, list } = friends(30)
    const [giver, third] = list as [Person, Person]
    third.relationship = 40
    const x = vouch(third)
    const plan = x.plan(g, ctx(g, giver, () => 0))
    const s = strengthOf(g, giver)
    expect(plan.also).toEqual([{ key: keyOf(g, third), who: third.id, relationship: [{ delta: Math.round(VOUCH_MAX * s) }] }])
    expect(plan.edge).toMatchObject({ c: g.year, o: -FAVOR_OWES })
    expect(plan.log).toContain(giver.firstName)
    expect(plan.log).toContain(third.firstName)
    const refused = x.plan(g, ctx(g, giver, () => 0.9999))
    expect(refused.also).toBeUndefined()
    expect(refused.edge).toEqual({ c: g.year })
  })

  it('is blocked for a third who is the voucher, dead, estranged, a stranger to the voucher, or already at 100', () => {
    const { g, list } = friends(4)
    const [giver, third] = list as [Person, Person]
    const t = (x: Person): string | null => vouch(x).blocked(g, ctx(g, giver))
    expect(t(third)).toBeNull()
    expect(t(giver)).not.toBeNull()
    third.relationship = 100
    expect(t(third)).not.toBeNull()
    third.relationship = 60
    third.alive = false
    expect(t(third)).not.toBeNull()
    third.alive = true
    estrange(g, third)
    expect(t(third)).not.toBeNull()
    delete third.data.wl
    const outsider = cast(g, 50, 'coworker', { contextId: 'firm-9' })
    expect(t(outsider)).not.toBeNull()
    const dog = cast(g, 50, 'pet')
    expect(t(dog)).not.toBeNull()
  })

  it('stays inside its bound however many givers vouch: no single act adds more than 15, the third stops at 100 and then no one can vouch', () => {
    const { g, list } = friends(40)
    const third = list[0]!
    third.relationship = 0
    let gains = 0
    let done = 0
    for (const giver of list.slice(1)) {
      const before = third.relationship
      const out = runAct(g, vouch(third), keyOf(g, giver), giver)
      if (out === null) {
        expect(third.relationship, 'only a third at 100 closes the vouch').toBe(100)
        continue
      }
      done++
      const gain = third.relationship - before
      expect(gain).toBeLessThanOrEqual(VOUCH_MAX)
      gains += gain
    }
    expect(done).toBeGreaterThan(5)
    expect(third.relationship).toBeLessThanOrEqual(100)
    expect(gains).toBe(third.relationship)
  })
})

describe('broker', () => {
  it('raises the obligation of a cut-out relative toward the player by 20 a brokered peace, at most 100, and nothing else on their edge', () => {
    expect(BROKER_OBLIGATION).toBe(20)
    const { g, list } = friends(8)
    const rel = list[0]!
    estrange(g, rel)
    setEdge(g, rel, { s: 50, o: 0 })
    const relRelationship = rel.relationship
    const done = broker(rel).plan(g, ctx(g, list[1]!, () => 0))
    expect(done.also).toEqual([{ key: keyOf(g, rel), who: rel.id, edge: { o: BROKER_OBLIGATION } }])
    expect(done.edge).toMatchObject({ c: g.year, o: -FAVOR_OWES })
    const refused = broker(rel).plan(g, ctx(g, list[1]!, () => 0.9999))
    expect(refused.also).toBeUndefined()
    // seven givers, one after the other; once the obligation is at the top nobody can add to it
    let o = 0
    for (const giver of list.slice(1)) {
      const out = runAct(g, broker(rel), keyOf(g, giver), giver)
      if (out === null) {
        expect(edgeOf(g, rel)!.o, 'only the top of the obligation closes the broker').toBe(100)
        continue
      }
      const now = edgeOf(g, rel)!.o
      expect(now - o).toBeLessThanOrEqual(BROKER_OBLIGATION)
      expect(now).toBeLessThanOrEqual(100)
      o = now
    }
    expect(rel.relationship).toBe(relRelationship)
    expect(edgeOf(g, rel)!.s).toBe(50)
  })

  it('caps at o 100, which E11 reads at 0.0015 a point: 0.15 at the most on the peace odds', () => {
    expect(BROKER_ODDS_PER_POINT).toBe(0.0015)
    expect(BROKER_ODDS_MAX).toBe(0.15)
    expect(BROKER_ODDS_PER_POINT * 100).toBeLessThanOrEqual(BROKER_ODDS_MAX + 1e-12)
    const { g, list } = friends(14)
    const rel = list[0]!
    estrange(g, rel)
    setEdge(g, rel, { o: 95 })
    const plan = broker(rel).plan(g, ctx(g, list[1]!, () => 0))
    expect(plan.also![0]!.edge!.o).toBe(100)
    setEdge(g, rel, { o: 100 })
    expect(broker(rel).blocked(g, ctx(g, list[1]!))).not.toBeNull()
  })

  it('is blocked for a relative who is not cut out or estranged, who has no edge, who is the broker, dead or a stranger to the broker', () => {
    const { g, list } = friends(4)
    const [giver, rel] = list as [Person, Person]
    const t = (x: Person): string | null => broker(x).blocked(g, ctx(g, giver))
    setEdge(g, rel)
    expect(t(rel)).not.toBeNull()
    estrange(g, rel)
    expect(t(rel)).toBeNull()
    expect(t(giver)).not.toBeNull()
    rel.alive = false
    expect(t(rel)).not.toBeNull()
    rel.alive = true
    const outsider = cast(g, 50, 'coworker', { contextId: 'firm-9' })
    estrange(g, outsider)
    setEdge(g, outsider)
    expect(t(outsider)).not.toBeNull()
    const noEdge = cast(g, 50, 'friend')
    estrange(g, noEdge)
    expect(t(noEdge)).not.toBeNull()
  })

  it('brokerFor finds the giver with the most reach who can still be asked, and none when nobody can', () => {
    const g = adult(socialGame(1))
    const rel = cast(g, 70, 'sibling')
    estrange(g, rel)
    setEdge(g, rel, { s: 40 })
    expect(brokerFor(g, rel)).toBeNull()
    const mum = cast(g, 80, 'parent')
    const dad = cast(g, 60, 'parent')
    expect(brokerFor(g, rel)?.id).toBe(mum.id)
    setEdge(g, mum, { c: g.year })
    expect(brokerFor(g, rel)?.id).toBe(dad.id)
    setEdge(g, dad, { c: g.year - 1 })
    expect(brokerFor(g, rel)).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. The menu

describe('socialNodes', () => {
  it('is a plain empty list on a life that is not stamped, so the person rows are the rows of v5.2.0', () => {
    const g = adult(makeTestGame(1))
    const p = cast(g, 70, 'friend')
    cast(g, 70, 'friend')
    expect(socialOn(g)).toBe(false)
    expect(socialNodes(g, p)).toEqual([])
    expect(Array.isArray(socialNodes(g, p))).toBe(true)
    expect(personActions(g, p).some((n) => n.id.startsWith('social.'))).toBe(false)
  })

  it('shows the favor row and the vouch row for a friend of a stamped adult, with the odds and the third named', () => {
    const { g, list } = friends(3)
    const p = list[0]!
    const rows = socialNodes(g, p)
    const favor = nodeById(rows, 'social.favor')!
    const v = nodeById(rows, 'social.vouch')!
    expect(favor).toBeDefined()
    expect(v).toBeDefined()
    expect(rows[0]!.type).toBe('heading')
    expect(String(favor.subtitle)).toMatch(/\d+%/)
    expect(String(v.subtitle)).toContain(thirdFor(g, p)!.firstName)
    expect(nodeById(rows, 'social.broker')).toBeUndefined()
    expect(personActions(g, p).some((n) => n.id === 'social.favor')).toBe(true)
  })

  it('shows nothing to a child, the dead, a pet or when the player is dead', () => {
    const { g, list } = friends(2)
    g.character.age = 10
    expect(socialNodes(g, list[0]!)).toEqual([])
    g.character.age = 30
    list[0]!.alive = false
    expect(socialNodes(g, list[0]!)).toEqual([])
    const dog = cast(g, 70, 'pet')
    expect(socialNodes(g, dog)).toEqual([])
    g.character.alive = false
    expect(socialNodes(g, list[1]!)).toEqual([])
  })

  it('greys the favor row with the reason when it is blocked, and runs the call-in when tapped', () => {
    const { g, list } = friends(3)
    const p = list[0]!
    const row = nodeById(socialNodes(g, p), 'social.favor')!
    expect(row.disabledReason?.(g)).toBeNull()
    row.run(g)
    expect(edgeOf(g, p)!.c).toBe(g.year)
    const again = nodeById(socialNodes(g, p), 'social.favor')!
    expect(again.disabledReason?.(g)).toEqual(expect.stringContaining(p.firstName))
  })

  it('runs the vouch and the broker rows on a draft of the state, re-reading the people from it', () => {
    const { g, list } = friends(6)
    const [a, rel] = list as [Person, Person]
    estrange(g, rel)
    setEdge(g, rel, { s: 50 })
    const vRow = nodeById(socialNodes(g, a), 'social.vouch')!
    const bRow = nodeById(socialNodes(g, rel), 'social.broker')!
    expect(bRow).toBeDefined()
    const draft = structuredClone(g)
    bRow.run(draft)
    const giver = brokerFor(g, rel)!
    expect(readEdge(draft, personEntity(giver), playerRef(draft))!.c).toBe(draft.year)
    expect(readEdge(g, personEntity(giver), playerRef(g))?.c).toBeUndefined()
    const draft2 = structuredClone(g)
    vRow.run(draft2)
    expect(readEdge(draft2, personEntity(a), playerRef(draft2))!.c).toBe(draft2.year)
  })

  it('offers the way back for an estranged person (the broker) and no favor or vouch', () => {
    const { g, list } = friends(4)
    const rel = list[0]!
    estrange(g, rel)
    setEdge(g, rel, { s: 50 })
    const rows = socialNodes(g, rel)
    expect(nodeById(rows, 'social.broker')).toBeDefined()
    expect(nodeById(rows, 'social.favor')).toBeUndefined()
    expect(nodeById(rows, 'social.vouch')).toBeUndefined()
    // personActions puts the social rows before the will's, so the way back shows for an estranged person too
    const ids = personActions(g, rel).map((n) => n.id)
    expect(ids).toContain('social.broker')
    const will = ids.indexOf('will.head')
    if (will >= 0) expect(ids.indexOf('social.broker')).toBeLessThan(will)
  })

  it('has unique ids and a label, an emoji and no long dash on every row', () => {
    const { g, list } = friends(4)
    estrange(g, list[0]!)
    setEdge(g, list[0]!, { s: 40 })
    for (const p of list) {
      const rows = socialNodes(g, p)
      expect(new Set(rows.map((n) => n.id)).size).toBe(rows.length)
      for (const n of rows) {
        const text = JSON.stringify(n, (_k, v: unknown) => (typeof v === 'function' ? undefined : v))
        expect(text).not.toMatch(/[\u2013\u2014]/)
        if (n.type === 'action') {
          expect(n.label.length).toBeGreaterThan(0)
          expect(n.emoji.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. The module

describe('the module society.acts', () => {
  it('is registered: id society.acts, layer 3, one aging entry in the close phase at order 6, between world.edges and the milestones', () => {
    expect(societyModule.id).toBe('society.acts')
    expect(societyModule.layer).toBe(3)
    expect(societyModule.yearly).toHaveLength(1)
    expect(societyModule.yearly![0]).toMatchObject({ seam: 'aging', phase: 'close', order: 6 })
    const names = yearlyEntries('aging').map((e) => e.id)
    expect(names).toContain('society.acts')
    expect(names.indexOf('world.edges')).toBeLessThan(names.indexOf('society.acts'))
    expect(names.indexOf('society.acts')).toBeLessThan(names.indexOf('yearly.milestones'))
    expect(names.filter((n) => n.startsWith('society.acts'))).toEqual(['society.acts'])
  })

  it('stamps social.ay with the year, once; a second run in the year changes nothing, and so does a replay', () => {
    const g = socialGame(1)
    expect(readSocial(g)!.ay).toBeUndefined()
    yearlyActs(g)
    expect(readSocial(g)!.ay).toBe(g.year)
    const once = snap(g)
    yearlyActs(g)
    expect(snap(g)).toBe(once)
    const root = g.world!.social
    yearlyActs(g)
    expect(g.world!.social).toBe(root)
    g.year += 1
    yearlyActs(g)
    expect(readSocial(g)!.ay).toBe(g.year)
  })

  it('puts a stamp from the future right, once', () => {
    const g = socialGame(1)
    yearlyActs(g)
    g.year -= 5
    yearlyActs(g)
    expect(readSocial(g)!.ay).toBe(g.year)
  })

  it('is a no-op on a life that is not stamped: not a byte moves', () => {
    const g = adult(makeTestGame(1))
    cast(g, 70, 'friend')
    const before = snap(g)
    yearlyActs(g)
    expect(snap(g)).toBe(before)
  })

  it('draws nothing from g.rng and makes no id', () => {
    const g = socialGame(1)
    const rng = g.rng
    const id = g.nextId
    yearlyActs(g)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(id)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 7. Streams, text, layers

describe('the stream social', () => {
  it('actRoll is outcomeStream(g, "social", year, "<act>|<key>"), and a jump re-rolls the year it lands in', () => {
    const { g, list } = friends(1)
    const key = keyOf(g, list[0]!)
    const a = actRoll(g, 'favor.help', key)
    const b = outcomeStream(g, 'social', g.year, `favor.help|${key}`)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    // another act, another key and another year are other luck
    expect(actRoll(g, 'favor.vouch', key)()).not.toBe(actRoll(g, 'favor.help', key)())
    expect(actRoll(g, 'favor.help', key, g.year + 1)()).not.toBe(actRoll(g, 'favor.help', key)())
    // the Time Machine: a fork at this year changes the luck of this year and of no earlier one
    const before = actRoll(g, 'favor.help', key, g.year - 1)()
    const here = actRoll(g, 'favor.help', key)()
    g.flags.timeline = { forks: [{ year: g.year, n: 1 }] } as never
    const after = actRoll(g, 'favor.help', key)()
    expect(actRoll(g, 'favor.help', key, g.year - 1)()).toBe(before)
    void here
    void after
  })

  it('the draw does not touch g.rng or g.nextId', () => {
    const { g } = friends(1)
    const rng = g.rng
    const id = g.nextId
    actRoll(g, 'probe', 'probe')()
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(id)
  })
})

describe('the files of society/', () => {
  const files = (): string[] => readdirSync(resolve(ROOT, 'src/game/society')).filter((f) => f.endsWith('.ts'))

  it('import nothing from events/, business/, shops/ or the other domains; the root files they reach are cash.ts and npc-state.ts', () => {
    const allowedRoot = new Set(['core', 'cash', 'npc-state', 'types', 'rng'])
    for (const f of files()) {
      const text = src(`src/game/society/${f}`)
      for (const m of text.matchAll(/from '(\.\.\/[^']+)'/g)) {
        const target = m[1]!.slice(3)
        const first = target.split('/')[0]!
        if (target.includes('/')) {
          expect(['kernel', 'world', 'text'], `${f} imports ${target}`).toContain(first)
        } else {
          expect(allowedRoot.has(first), `${f} imports ${target}`).toBe(true)
        }
      }
    }
  })

  it('draw luck from the stream only: no g.rng, no rand, chance, pick, shuffle or Math.random in acts.ts, favor.ts, menu.ts or module.ts', () => {
    for (const f of ['acts.ts', 'favor.ts', 'menu.ts', 'module.ts', 'seam.ts']) {
      const text = src(`src/game/society/${f}`).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(text, f).not.toMatch(/\.rng\b|\brand\(|\bchance\(|\bpick\(|\bshuffle\(|Math\.random|\bDate\b|pickLine\(/)
    }
  })

  it('hold no long dash', () => {
    for (const f of files()) expect(src(`src/game/society/${f}`), f).not.toMatch(/[\u2013\u2014]/)
  })

  it('write money only through cash.moveCash', () => {
    for (const f of files()) {
      const text = src(`src/game/society/${f}`).replace(/\/\/.*$/gm, '')
      expect(text, f).not.toMatch(/\bearnIncome\(|\bspend\(|\baddMoney\(|\.money\s*[-+*/]?=[^=]|\.cash\s*[-+*/]?=[^=]|bookMint|bookBurn/)
    }
  })
})

describe('seam', () => {
  it('reads honesty and temper from the axes of the person, within 0 to 100', () => {
    const g = adult(socialGame(1))
    for (const traits of [['honest'], ['dishonest', 'hot-headed'], ['calm', 'kind'], []]) {
      const p = cast(g, 70, 'friend', { traits })
      expect(honestyOf(g, p)).toBeGreaterThanOrEqual(0)
      expect(honestyOf(g, p)).toBeLessThanOrEqual(100)
      expect(temperOf(g, p)).toBeGreaterThanOrEqual(0)
      expect(temperOf(g, p)).toBeLessThanOrEqual(100)
      expect(getPerson(g, p.id)).toBe(p)
    }
    expect(playerEdgeKey(g, g.people[0]!)).toBe(keyOf(g, g.people[0]!))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 8. A real life

describe('a real stamped life', () => {
  /** A seed whose newborn has a living parent and a sibling, so there is a family to ask. */
  const seed = findSeed(
    (s) => {
      const g = withFlags({ social: true }, () => createNewLife({ seed: s, year: 1990 }))
      return g.people.some((p) => p.alive && p.relation === 'parent') && g.people.some((p) => p.alive && p.relation === 'sibling')
    },
    { label: 'a newborn with a parent and a sibling' },
  )

  /** 32 years of the life, a favor asked of whoever can be asked each year from 16, every row run as the menu would. */
  function play(): { g: GameState; asked: number; done: number } {
    const g = withFlags({ social: true }, () => createNewLife({ seed, year: 1990 }))
    let asked = 0
    let done = 0
    for (let i = 0; i < 32; i++) {
      g.queue = []
      g.character.stats.health = 100
      g.character.conditions = []
      ageUp(g)
      if (!g.character.alive) break
      g.queue = []
      for (const p of [...g.people]) {
        if (!p.alive) continue
        const row = socialNodes(g, p).find((n): n is MenuAction => n.type === 'action' && n.disabledReason?.(g) === null)
        if (row === undefined) continue
        const before = readEdge(g, personEntity(p), playerRef(g))?.c
        row.run(g)
        asked++
        if (readEdge(g, personEntity(p), playerRef(g))?.c !== before) done++
      }
    }
    return { g, asked, done }
  }

  it('asks favors for 32 years with no world problem, the edges in their caps and the same life on a replay', () => {
    const a = play()
    expect(a.asked).toBeGreaterThan(0)
    expect(a.done).toBeGreaterThan(0)
    expect(socialOn(a.g)).toBe(true)
    expect(readSocial(a.g)!.ay).toBe(a.g.year)
    expect(worldProblems(a.g, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
    const b = play()
    expect(JSON.stringify(b.g)).toBe(JSON.stringify(a.g))
  }, 120_000)
})
