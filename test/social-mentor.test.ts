// R4-E11 PART B (RED until part B is written): mentorship. A younger relative or coworker of 14 to 40 gets a yearly bonus of at most 15% of that
// year's own skill gain, measured against a baseline kept in the `social` shard (`ms`, at most 3 [ref, skill] pairs, written when the protege is
// enrolled and rewritten at every settle through patchSocial). The settle runs at `close` 6, inside the one `society.acts` entry, takes the gain
// since the baseline (the NPC year runs inside `relationships` at life 40, before the close phase), adds the bonus and writes the new baseline,
// through npcLife and saveNpcLife (npc-state.ts), so npc-lives.ts is not edited. There is no second aging entry and nothing in the `society` phase.
//
//   1. Enrolment: who can be a protege, 3 at most, the baseline written.
//   2. The settle: the bonus is at most 15% of the gain, never negative, the baseline follows the skill, a second settle adds nothing; over 40
//      years a mentored protege ends at most 1.15 x the unmentored gain ahead of the control.
//   3. A baseline that is missing or hostile reads as none; a protege who leaves the range leaves the baseline.
//   4. The module runs it once a year, a no-op unstamped; the menu row; the authorization rows (enrolment in the states that block it).
//   5. The files: npc-lives.ts is not edited, no second yearly entry, nothing drawn.
//
// Written red first by part A of the task (test/social-gossip.test.ts is part A's, green); society/mentor.ts holds stubs until part B.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { yearlyEntries } from '../src/game/kernel/registry'
import { personEntity } from '../src/game/kernel/person-ref'
import { npcLife, saveNpcLife } from '../src/game/npc-state'
import { initializeNpc } from '../src/game/npc-lives'
import { runAct } from '../src/game/society/acts'
import { MENTOR, enrolMentor, mentorAct, mentorSettle, protegesOf } from '../src/game/society/mentor'
import { socialNodes } from '../src/game/society/menu'
import { societyModule, yearlyActs } from '../src/game/society/module'
import type { EntityRef } from '../src/game/kernel/ids'
import type { GameState, MenuAction, Person } from '../src/game/types'
import { putEdge } from '../src/game/world/edge-write'
import { playerRef } from '../src/game/world/people'
import { patchSocial, readSocial } from '../src/game/world/social'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { cast, socialGame } from './social-kit'
import { trapRng } from './social-parity-kit'

const ROOT = resolve(__dirname, '..')
const src = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8')
const json = (g: GameState): string => JSON.stringify(g)

const ref = (p: Person): EntityRef => personEntity(p)
const keyOf = (g: GameState, p: Person): string => `${ref(p)}>${playerRef(g)}`

/** A stamped player of 45 with a sibling of 25 (a relative, younger, with a life of their own at the skill given). */
function mentoring(skill = 40, relation: Person['relation'] = 'sibling', age = 25): { g: GameState; p: Person } {
  const g = socialGame(1, { age: 45 })
  const p = cast(g, 70, relation, { age })
  initializeNpc(g, p)
  setSkill(p, skill)
  return { g, p }
}

function setSkill(p: Person, skill: number): void {
  saveNpcLife(p, { ...npcLife(p)!, skill })
}

const skillOf = (p: Person): number => npcLife(p)!.skill

/** The NPC year of a protege: a gain (or a fall) in skill, made the way `yearlyNpcLife` makes it, before the close phase. */
const learn = (p: Person, by: number): void => setSkill(p, Math.min(100, Math.max(0, skillOf(p) + by)))

// ---------------------------------------------------------------------------------------------------------------------
// 1. Enrolment

describe('enrolling a protege', () => {
  it('takes a younger relative of 14 to 40 and writes the baseline [ref, skill] into the social shard', () => {
    const { g, p } = mentoring(40)
    expect(enrolMentor(g, p)).toBe(true)
    expect(protegesOf(g)).toEqual([[ref(p), 40]])
    expect(readSocial(g)?.ms).toEqual([[ref(p), 40]])
  })

  it('takes a coworker too, and every relative that is younger: a sibling, a half sibling, a child, a grandchild', () => {
    for (const relation of ['coworker', 'sibling', 'halfSibling', 'stepsibling', 'child', 'stepchild', 'grandchild'] as const) {
      const { g, p } = mentoring(40, relation, 22)
      expect(enrolMentor(g, p), relation).toBe(true)
    }
  })

  it('refuses a protege who is not younger than the player, under 14 or over 40', () => {
    for (const age of [13, 12, 5, 41, 50, 45, 60]) {
      const { g, p } = mentoring(40, 'sibling', age)
      expect(enrolMentor(g, p), `age ${age}`).toBe(false)
    }
    const young = mentoring(40, 'sibling', 14)
    expect(enrolMentor(young.g, young.p)).toBe(true)
    const old = mentoring(40, 'sibling', 40)
    expect(enrolMentor(old.g, old.p)).toBe(true)
  })

  it('refuses a friend, a parent, a spouse (the plan says relative or coworker, and younger)', () => {
    for (const relation of ['friend', 'parent', 'spouse', 'partner', 'enemy'] as const) {
      const { g, p } = mentoring(40, relation, 30)
      expect(enrolMentor(g, p), relation).toBe(false)
    }
  })

  it('takes 3 and refuses the fourth, and the same person twice', () => {
    expect(MENTOR.proteges).toBe(3)
    const g = socialGame(1, { age: 45 })
    const list = [0, 1, 2, 3].map(() => {
      const p = cast(g, 70, 'sibling', { age: 25 })
      initializeNpc(g, p)
      return p
    })
    expect(enrolMentor(g, list[0]!)).toBe(true)
    expect(enrolMentor(g, list[0]!)).toBe(false)
    expect(enrolMentor(g, list[1]!)).toBe(true)
    expect(enrolMentor(g, list[2]!)).toBe(true)
    const before = json(g)
    expect(enrolMentor(g, list[3]!)).toBe(false)
    expect(json(g)).toBe(before)
    expect(protegesOf(g)).toHaveLength(3)
  })

  it('refuses a protege who is dead, a pet, estranged, or not in the game, and a player who is dead or a child', () => {
    const cases: [string, (g: GameState, p: Person) => void][] = [
      ['dead', (_g, p) => void (p.alive = false)],
      ['a pet', (_g, p) => void (p.relation = 'pet')],
      ['estranged', (g, p) => void (p.data.wl = { by: g.character.id, anger: 60, cut: true, estr: true })],
      ['not in the game', (g, p) => void (g.people = g.people.filter((x) => x.id !== p.id))],
      ['the player dead', (g) => void (g.character.alive = false)],
      ['the player a child', (g) => void (g.character.age = 12)],
    ]
    for (const [name, change] of cases) {
      const { g, p } = mentoring()
      change(g, p)
      expect(enrolMentor(g, p), name).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. The settle

describe('the mentor settle', () => {
  it('adds at most 15% of the year\'s gain and writes the new baseline: a gain of 10 gives a bonus of 1.5', () => {
    expect(MENTOR.bonus).toBe(0.15)
    const { g, p } = mentoring(40)
    enrolMentor(g, p)
    learn(p, 10)
    mentorSettle(g)
    expect(skillOf(p)).toBeGreaterThan(50)
    expect(skillOf(p)).toBeLessThanOrEqual(51.5 + 1e-9)
    expect(skillOf(p)).toBeCloseTo(51.5, 6)
    expect(protegesOf(g)).toEqual([[ref(p), skillOf(p)]])
  })

  it('settles once: a second settle in the same state sees a gain of 0 and adds nothing', () => {
    const { g, p } = mentoring(40)
    enrolMentor(g, p)
    learn(p, 10)
    mentorSettle(g)
    const once = json(g)
    mentorSettle(g)
    expect(json(g)).toBe(once)
  })

  it('adds nothing for a year with no gain or a fall, and the baseline follows the skill down', () => {
    const { g, p } = mentoring(40)
    enrolMentor(g, p)
    mentorSettle(g)
    expect(skillOf(p)).toBe(40)
    learn(p, -12)
    mentorSettle(g)
    expect(skillOf(p)).toBe(28)
    expect(protegesOf(g)).toEqual([[ref(p), 28]])
    learn(p, 10)
    mentorSettle(g)
    expect(skillOf(p)).toBeCloseTo(39.5 + 0, 6)
  })

  it('stops at 100', () => {
    const { g, p } = mentoring(96)
    enrolMentor(g, p)
    learn(p, 10)
    mentorSettle(g)
    expect(skillOf(p)).toBeLessThanOrEqual(100)
  })

  it('gives each of 3 proteges their own bonus, and touches no one else', () => {
    const g = socialGame(1, { age: 45 })
    const list = [0, 1, 2, 3].map(() => {
      const p = cast(g, 70, 'sibling', { age: 25 })
      initializeNpc(g, p)
      setSkill(p, 30)
      return p
    })
    for (const p of list.slice(0, 3)) enrolMentor(g, p)
    list[0]!.stats.smarts = 90
    for (const [i, p] of list.entries()) learn(p, 4 + 4 * i)
    const was = list.map(skillOf)
    mentorSettle(g)
    for (const i of [0, 1, 2]) expect(skillOf(list[i]!) - was[i]!, `protege ${i}`).toBeCloseTo(0.15 * (4 + 4 * i), 6)
    expect(skillOf(list[3]!)).toBe(was[3])
  })

  it('leaves a mentored protege at most 1.15 x the unmentored gain ahead after 40 years, and ahead by something', () => {
    const run = (mentored: boolean): number => {
      const { g, p } = mentoring(20)
      if (mentored) expect(enrolMentor(g, p)).toBe(true)
      const start = skillOf(p)
      for (let y = 0; y < 40; y++) {
        learn(p, 0.8 + (y % 4) * 0.6)
        if (mentored) mentorSettle(g)
      }
      return skillOf(p) - start
    }
    const free = run(false)
    const helped = run(true)
    expect(helped).toBeGreaterThan(free)
    expect(helped).toBeLessThanOrEqual(1.15 * free + 1e-6)
  })

  it('draws nothing: g.rng and g.nextId do not move', () => {
    const { g, p } = mentoring(40)
    enrolMentor(g, p)
    learn(p, 10)
    const { rng, nextId } = g
    mentorSettle(g)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. A baseline that is missing or hostile

describe('a baseline that is missing or hostile reads as none', () => {
  it('a protege with no baseline gets no bonus, and a life that is not stamped is not touched', () => {
    const { g, p } = mentoring(40)
    learn(p, 10)
    const before = json(g)
    mentorSettle(g)
    expect(json(g)).toBe(before)
    const plain = makeTestGame(1, { age: 45 })
    const q = cast(plain, 70, 'sibling', { age: 25 })
    initializeNpc(plain, q)
    const was = json(plain)
    mentorSettle(plain)
    expect(json(plain)).toBe(was)
    expect(enrolMentor(plain, q)).toBe(false)
  })

  const hostile: readonly [string, (g: GameState, p: Person) => unknown][] = [
    ['a pair for a person who is not in the game', () => [['person:ghost', 10]]],
    ['a pair with a skill that is not a number', (_g, p) => [[ref(p), Number.NaN]]],
    ['a pair with a skill of 1e300', (_g, p) => [[ref(p), 1e300]]],
    ['a pair with a skill above the current one (a fall)', (_g, p) => [[ref(p), 99]]],
    ['a pair that is no pair', () => [['person:p1'], 5, null, 'x']],
    ['a baseline that is no list', () => 'x'],
    ['five pairs', (_g, p) => [1, 2, 3, 4, 5].map((i) => [i === 1 ? ref(p) : `person:q${i}`, 10])],
  ]
  for (const [name, make] of hostile) {
    it(`${name}: no bonus beyond 15% of a real gain, no throw`, () => {
      const { g, p } = mentoring(40)
      learn(p, 10)
      ;(g.world as Record<string, unknown>).social = { v: 1, on: 1, y: g.year, fy: g.year, ms: make(g, p) }
      const was = skillOf(p)
      expect(() => mentorSettle(g)).not.toThrow()
      expect(skillOf(p) - was).toBeLessThanOrEqual(0.15 * 60 + 1e-9)
      expect(skillOf(p)).toBeLessThanOrEqual(100)
      expect(protegesOf(g).length).toBeLessThanOrEqual(3)
    })
  }

  it('a protege who grows past 40, dies, becomes a pet or leaves the game leaves the baseline at the next settle', () => {
    for (const leave of [(p: Person) => void (p.age = 41), (p: Person) => void (p.alive = false), (p: Person) => void (p.relation = 'pet')]) {
      const { g, p } = mentoring(40)
      enrolMentor(g, p)
      leave(p)
      learn(p, 10)
      const was = skillOf(p)
      mentorSettle(g)
      expect(skillOf(p)).toBe(was)
      expect(protegesOf(g)).toEqual([])
    }
    const { g, p } = mentoring(40)
    enrolMentor(g, p)
    g.people = g.people.filter((x) => x.id !== p.id)
    mentorSettle(g)
    expect(protegesOf(g)).toEqual([])
  })

  it('the shard keeps at most 3 pairs whatever is written (patchSocial)', () => {
    const { g } = mentoring()
    patchSocial(g, { ms: [1, 2, 3, 4, 5].map((i) => [`person:q${i}` as EntityRef, 10] as const) })
    expect(protegesOf(g).length).toBeLessThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. The module, the menu and the authorization

describe('inside the society.acts entry', () => {
  it('settles once a year: a second yearlyActs in the year, a clone and a reload add nothing more', () => {
    const { g, p } = mentoring(40)
    enrolMentor(g, p)
    g.year += 1
    learn(p, 10)
    yearlyActs(g)
    expect(skillOf(p)).toBeCloseTo(51.5, 6)
    const once = json(g)
    yearlyActs(g)
    expect(json(g)).toBe(once)
    const clone = structuredClone(g)
    yearlyActs(clone)
    expect(json(clone)).toBe(once)
  })

  it('is no second aging entry: the module has the one entry `society.acts` (a second would be renamed society.acts#0 and #1)', () => {
    expect(societyModule.yearly).toHaveLength(1)
    expect(yearlyEntries('aging').map((e) => e.id).filter((n) => n.startsWith('society.acts'))).toEqual(['society.acts'])
  })
})

describe('the menu row', () => {
  const row = (g: GameState, p: Person): MenuAction | undefined => socialNodes(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === 'social.mentor')

  it('shows for a younger relative or coworker who can be taken on, and enrols on run', () => {
    const { g, p } = mentoring(40)
    const r = row(g, p)
    expect(r).toBeDefined()
    expect(r!.disabledReason?.(g)).toBeNull()
    r!.run(g, undefined)
    expect(protegesOf(g)).toHaveLength(1)
  })

  it('is not there for a friend, a person over 40 or one the player is not older than, and not on a life that is not stamped', () => {
    expect(row(mentoring(40, 'friend', 30).g, mentoring(40, 'friend', 30).p)).toBeUndefined()
    const old = mentoring(40, 'sibling', 44)
    expect(row(old.g, old.p)).toBeUndefined()
    const plain = makeTestGame(1, { age: 45 })
    const q = cast(plain, 70, 'sibling', { age: 25 })
    expect(row(plain, q)).toBeUndefined()
  })

  it('greys out with a reason once 3 are taken, and is pure under a frozen game with a trapped g.rng', () => {
    const g = socialGame(1, { age: 45 })
    const list = [0, 1, 2, 3].map(() => {
      const p = cast(g, 70, 'sibling', { age: 25 })
      initializeNpc(g, p)
      return p
    })
    for (const p of list.slice(0, 3)) enrolMentor(g, p)
    deepFreeze(trapRng(g))
    const r = row(g, list[3]!)
    expect(r).toBeDefined()
    expect(typeof r!.disabledReason?.(g)).toBe('string')
  })
})

describe('authorization inside the function: the enrolment called directly', () => {
  interface Case {
    name: string
    apply(g: GameState, p: Person): void
    key?: (g: GameState, p: Person) => string
    person?: (g: GameState, p: Person) => Person | null
    stamped?: boolean
  }
  const cases: readonly Case[] = [
    { name: 'a life that is not stamped', apply: () => undefined, stamped: false },
    { name: 'the person dead', apply: (_g, p) => void (p.alive = false) },
    { name: 'the person a pet', apply: (_g, p) => void (p.relation = 'pet') },
    { name: 'the person estranged', apply: (g, p) => void (p.data.wl = { by: g.character.id, anger: 60, cut: true, estr: true }) },
    { name: 'the person not younger than the player', apply: (_g, p) => void (p.age = 50) },
    { name: 'the person under 14', apply: (_g, p) => void (p.age = 13) },
    { name: 'the person over 40', apply: (g, p) => void ((g.character.age = 70), (p.age = 41)) },
    { name: 'the person a friend', apply: (_g, p) => void (p.relation = 'friend') },
    { name: 'the player dead', apply: (g) => void (g.character.alive = false) },
    { name: 'three proteges already', apply: (g) => void patchSocial(g, { ms: [['person:q1', 10], ['person:q2', 10], ['person:q3', 10]] as never }) },
    { name: 'the person already a protege', apply: (g, p) => void patchSocial(g, { ms: [[ref(p), 10]] }) },
    { name: 'a key whose second end is not the ego (another owner)', apply: () => undefined, key: (_g, p) => `${ref(p)}>person:old-ego` },
    { name: 'a key between two other people', apply: () => undefined, key: (g, p) => `${ref(p)}>${ref(g.people.find((x) => x.id !== p.id)!)}` },
    { name: 'a person that does not match the key', apply: () => undefined, person: (g, p) => g.people.find((x) => x.id !== p.id)! },
    { name: 'no person', apply: () => undefined, person: () => null },
    { name: 'a person who is not in the game', apply: () => undefined, person: (_g, p) => ({ ...p, id: 'p-not-in-the-game' }) },
    { name: 'a key that is not a key', apply: () => undefined, key: () => 'person:p1>' },
  ]

  for (const c of cases) {
    it(`answers null and changes nothing for: ${c.name}`, () => {
      const g = c.stamped === false ? makeTestGame(1, { age: 45 }) : socialGame(1, { age: 45 })
      const p = cast(g, 70, 'sibling', { age: 25 })
      cast(g, 70, 'sibling', { age: 26 })
      initializeNpc(g, p)
      c.apply(g, p)
      const key = c.key ? c.key(g, p) : keyOf(g, p)
      const person = c.person ? c.person(g, p) : p
      const before = json(g)
      const { rng, nextId } = g
      expect(runAct(g, mentorAct, key, person)).toBeNull()
      if (c.key === undefined && c.person === undefined) expect(enrolMentor(g, p)).toBe(false)
      expect(json(g)).toBe(before)
      expect(g.rng).toBe(rng)
      expect(g.nextId).toBe(nextId)
    })
  }

  it('control: the same call in the allowed state enrols and writes the baseline', () => {
    const { g, p } = mentoring()
    expect(putEdge(g, keyOf(g, p), { t: 60, f: p.relationship, r: 50, s: 0, o: 0, y: g.year, l: g.year })).toBe(true)
    const before = json(g)
    expect(runAct(g, mentorAct, keyOf(g, p), p)).not.toBeNull()
    expect(json(g)).not.toBe(before)
    expect(cases.length).toBeGreaterThanOrEqual(15)
  })
})

describe('the files of the mentor', () => {
  it('leave npc-lives.ts alone: the bonus is applied around it', () => {
    expect(src('src/game/npc-lives.ts')).not.toMatch(/mentor|MENTOR/)
  })

  it('draw nothing and hold no long dash', () => {
    const text = src('src/game/society/mentor.ts').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(text).not.toMatch(/\.rng\b|\brand\(|\bchance\(|\bpick\(|\bshuffle\(|Math\.random|\bDate\b|outcomeStream|actRoll/)
    expect(src('src/game/society/mentor.ts')).not.toMatch(/[\u2013\u2014]/)
  })
})
