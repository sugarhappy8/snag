// ci: fast
// R4-E15 (D.12, invariant: menus and views are pure): every menu and every reader of the social track, read on a state that is frozen all
// the way down with a g.rng that throws. A stamped game with a web in it (favors and a loan taken, memories of every kind, a feud, a secret, a
// mentor, a person cut out of the will, kin and staff links, talk) is built with the writers of the track, copied, trapped and frozen. Then every
// reader is called for every person and every edge. Not a byte of the state changes, not a draw is made (a draw would throw), and not an id is
// taken: the state, g.rng and g.nextId are what they were. The test has teeth: a write to the frozen state throws, and so does a read of g.rng.
import { describe, expect, it } from 'vitest'
import { personActions } from '../src/game/relationships'
import { personEntity } from '../src/game/kernel/person-ref'
import { initializeNpc } from '../src/game/npc-lives'
import { quitOdds, poachOdds, staffRef, mgrRef } from '../src/game/business/staff-loyalty'
import { playerEdgeKey, type ActCtx, type SocialAct } from '../src/game/society/acts'
import { familyLive, familyRoom } from '../src/game/society/budget'
import { debtsOf, dueOf, reserveOf, readDv } from '../src/game/society/debt'
import { acquainted, brokerFor, broker, circleOf, cutOff, estranged, favorBlock, favorOdds, helpAct, reachOf, strengthOf, thirdFor, vouch } from '../src/game/society/favor'
import { feudOf, legalFee, payoffFee, peaceAct, peaceOdds } from '../src/game/society/feud'
import { contactsOf, spread, tellings } from '../src/game/society/gossip'
import { debtTo, lend, lendAct, loanAct, loanTerms, openLoans } from '../src/game/society/loan'
import { enrolMentor, isProtege, mentorAct, protegeBlock, protegesOf } from '../src/game/society/mentor'
import { socialNodes } from '../src/game/society/menu'
import { reconcileOdds } from '../src/game/society/reconcile'
import { addSecret, leakOdds, readSecret, secretsOf } from '../src/game/society/secret'
import type { GameState, MenuAction, MenuNode, Person } from '../src/game/types'
import { boundTest, isBound } from '../src/game/world/edge-bound'
import { memoryOdds, ODDS_GROUPS } from '../src/game/world/edge-odds'
import { formatMemory, MEMORY_KINDS } from '../src/game/world/edge-memory'
import { putEdge, remember } from '../src/game/world/edge-write'
import { edgeProblems, edgesOf, liveFeuds, memoriesOf, openDebts, readEdge, readSecrets } from '../src/game/world/edges'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import { readSocial, socialOn } from '../src/game/world/social'
import { deepFreeze } from './fuzz-kit'
import { cast, socialGame } from './social-kit'
import { trapRng } from './social-parity-kit'

/** A stamped adult with a circle, and a web in it that has a little of everything the track keeps. */
function web(): GameState {
  const g = socialGame(1, { age: 45, money: 400_000 })
  const friends = Array.from({ length: 8 }, (_, i) => cast(g, 55 + 4 * i, 'friend', { money: 600_000, age: 30 + i }))
  const sibling = cast(g, 60, 'sibling', { age: 30 })
  const kid = cast(g, 70, 'child', { age: 24 })
  const rival = cast(g, 20, 'coworker', { age: 38 })
  initializeNpc(g, sibling)
  const edge = { t: 55, r: 50, s: 20, o: 0, y: g.year - 4, l: g.year } as const
  for (const p of [...friends, sibling, kid, rival]) putEdge(g, `${personEntity(p)}>${playerRef(g)}`, { ...edge, f: p.relationship, ...(p === kid ? { k: 'kin' as const } : {}) })
  // every kind of memory on the edges of the friends, in turn
  MEMORY_KINDS.forEach((kind, i) => remember(g, friends[i % friends.length]!, kind, { w: (1 + (i % 3)) as 1 | 2 | 3, by: i % 2 === 0 ? 'ego' : 'them' }))
  // a loan taken (a debt on player > lender), a feud, talk, a secret held by three, a cut-out sibling, a mentor
  lend(g, friends[7]!, 5_000)
  putEdge(g, `${personEntity(rival)}>${playerRef(g)}`, { s: 90, q: [2, g.year - 1, 0], m: [formatMemory({ kind: 'betrayal', year: g.year - 1, w: 3, by: 'ego' })] })
  putEdge(g, `${personEntity(friends[0]!)}>${playerRef(g)}`, { n: ['cb1', 'cb2'], d: [3, 4] })
  addSecret(g, playerRef(g), 'affair', 4, friends.slice(0, 3))
  sibling.data.wl = { by: g.character.id, anger: 60, cut: true, estr: true }
  const protege = cast(g, 70, 'sibling', { age: 22 })
  initializeNpc(g, protege)
  enrolMentor(g, protege)
  expect(socialOn(g)).toBe(true)
  return g
}

const ctxFor = (g: GameState, p: Person): ActCtx => ({ g, key: playerEdgeKey(g, p) ?? `${personEntity(p)}>${playerRef(g)}`, person: p, year: g.year, roll: () => 0.5 })

/** Reads a menu node the way the menu does: its label, subtitle, visibility, reason and the default of its input. */
function readNode(f: GameState, n: MenuNode, depth = 0): void {
  void n.visible?.(f)
  if (n.type === 'action') {
    void n.label
    void n.subtitle
    void n.disabledReason?.(f)
    void (n as MenuAction).input?.defaultValue?.(f)
  } else if (n.type === 'menu' && depth < 3) {
    for (const kid of n.children(f)) readNode(f, kid, depth + 1)
  }
}

describe('every menu and reader of the social track, on a frozen game with a trapped g.rng', () => {
  it('has a web worth reading: a loan, a feud, a secret, talk, a mentor, a cut-out sibling, memories of every kind and a link', () => {
    const g = web()
    expect(openLoans(g)).toBe(1)
    expect(liveFeuds(g)).toBe(1)
    expect(openDebts(g)).toBeGreaterThanOrEqual(1)
    expect(readSecrets(g)).toHaveLength(1)
    expect(protegesOf(g)).toHaveLength(1)
    const all = new Set(edgesOf(g, playerRef(g)).flatMap(([, e]) => memoriesOf(e).map((m) => m.kind)))
    expect(all.size).toBeGreaterThanOrEqual(20)
  })

  it('writes nothing, draws nothing and takes no id: the state, g.rng and g.nextId are what they were', () => {
    const base = web()
    const nextId = base.nextId
    const trapped = trapRng(structuredClone(base))
    // g.rng is not an enumerable member of a trapped game, so the text below is the state without it
    const text = JSON.stringify(trapped)
    const f = deepFreeze(trapped)
    const ego = playerRef(f)
    const people = f.people
    const keys = edgesOf(f, ego).map(([key]) => key)
    expect(keys.length).toBeGreaterThan(10)
    const acts = (third: Person): SocialAct[] => [helpAct, vouch(third), broker(third), loanAct(1_000), lendAct(1_000), peaceAct, mentorAct]
    expect(() => {
      // the stamp, the edges and what they hold
      void socialOn(f)
      void readSocial(f)
      void liveFeuds(f)
      void openDebts(f)
      void readSecrets(f)
      void edgeProblems((f.world as { edges?: unknown }).edges, f.people, ego)
      void worldProblems(f)
      for (const [key, e] of edgesOf(f, ego)) {
        void memoriesOf(e)
        void isBound(f, key)
        void readDv(e)
      }
      void boundTest(f)
      for (const key of keys) void boundTest(f)(key)
      // the secrets and the debts
      void secretsOf(f)
      for (const r of secretsOf(f)) void readSecret(f, r.id)
      void debtsOf(f, ego)
      void reserveOf(f)
      void openLoans(f)
      void familyLive(f)
      for (const source of ['wealth', 'use', 'nepo', 'will', 'social'] as const) void familyRoom(f, source)
      void protegesOf(f)
      void peaceAct
      // each person: the readers, the odds, the circle, the acts' blocks and plans, and the rows
      const third = people.find((p) => p.relation === 'friend')!
      for (const p of people) {
        void readEdge(f, personEntity(p), ego)
        void favorOdds(f, p)
        void favorBlock(f, p)
        void strengthOf(f, p)
        void reachOf(f, p)
        void thirdFor(f, p)
        void brokerFor(f, p)
        void cutOff(f, p)
        void estranged(f, p)
        void acquainted(p, third)
        void circleOf(p)
        void loanTerms(f, p)
        void debtTo(f, p)
        void dueOf(f, { owed: 5_000, rate: 8, since: f.year - 1, kind: 0, paid: 0 })
        void feudOf(f, p)
        void peaceOdds(f, p)
        void reconcileOdds(f, p)
        void leakOdds(f, p)
        void isProtege(f, p)
        void protegeBlock(f, p)
        void contactsOf(f, p)
        void tellings(f, p, new Set())
        for (const group of ODDS_GROUPS) void memoryOdds(f, p, group)
        for (const act of acts(third)) {
          const c = ctxFor(f, p)
          void act.blocked(f, c)
        }
        for (const n of socialNodes(f, p)) readNode(f, n)
        for (const n of personActions(f, p)) readNode(f, n)
      }
      void legalFee(f, f.year - 6)
      void payoffFee(f)
      void spread('p0', () => ['p1', 'p2', 'p3'], new Set())
      void quitOdds(10, 80, 20)
      void poachOdds(80, 0.2)
      void staffRef({ id: 'ks1' })
      void mgrRef({ id: 'biz1' })
    }).not.toThrow()
    // the plan of an act is a pure function too (it reads the state and the roll it is given)
    expect(() => {
      const p = people.find((x) => x.relation === 'friend' && favorBlock(f, x) === null)!
      for (const act of [helpAct, loanAct(1_000), lendAct(1_000)]) void act.plan(f, ctxFor(f, p))
    }).not.toThrow()
    expect(JSON.stringify(f) === text, 'the state is what it was').toBe(true)
    expect(() => f.rng).toThrow()
    expect(f.nextId).toBe(nextId)
  })

  it('has teeth: a write into the frozen game throws, a draw from g.rng throws, and so does a writer of the track', () => {
    const f = deepFreeze(trapRng(structuredClone(web())))
    const p = f.people.find((x) => x.relation === 'friend')!
    expect(() => {
      f.character.money += 1
    }).toThrow(TypeError)
    expect(() => f.rng).toThrow()
    expect(() => putEdge(f, `${personEntity(p)}>${playerRef(f)}`, { s: 99 })).toThrow(TypeError)
    expect(() => remember(f, p, 'gift_given')).toThrow(TypeError)
  })
})
