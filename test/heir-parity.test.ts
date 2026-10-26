// ci: fast
// R4-E4 (X2, X30, C11): the heir hand-over oracle, recorded on the unmodified tree with the social parity kit (test/social-parity-kit.ts).
// When the player dies, continueAsChild (life.ts) builds the next generation: the heir becomes the player and every other person is
// rebuilt from the heir's seat (a parent becomes a grandparent, a sibling's relationship is rolled again, a friend is dropped unless
// they run a company or hold a stake). R4-L9 changes what a STAMPED life carries across (edges copy at half strength); an unstamped
// life, which is every life nobody stamped with the social flag (X6), must hand over exactly as v5.2.0 does. These rows are those
// lives: they move only at R4-E16, when the flag becomes the default (X2), and then by the integrator's re-record with a reason.
//
// Three hand-overs, each a family and an estate:
//
//   adult         the eldest child of a woman of 79 inherits; a brother is cut out of the will in anger, a sister mildly, a half
//                 sibling is named; the heir has a grandchild (a child of theirs now), a husband (a name only, so a spouse is made),
//                 and the family's friend, coworker and dog stay or go as the code says.
//   minor         a stepchild of 15 inherits from a man of 56 with a mortgaged house, an heirloom and a loan; the widow is the guardian,
//                 a grown child is a half sibling now, the house is auctioned.
//   cut out       the heir is the one the will left out; the siblings react (guilt, gloating, a shrug), the heir is offered the
//                 chance to contest and takes the quiet talk.
//
// A row holds, for every person of the new generation: the relation they have now, their relationship, the data keys kept and the
// keys lost, their cash and age; for every person who did not make it across: who they were; and the estate: the heir's cash and
// property, the debts, the ancestor's net worth, the flag keys, the queue, g.rng and g.nextId of the new state, and the old state's
// g.rng (the new generation is made on a clone, so it stays where the death left it, unless the mutation test makes addRelationship draw). After
// the hand-over come three years of family time (hug, spend time) with the heir's relatives, so the relationship column moves from
// the numbers the hand-over rolled and runs into the bounds. No text is recorded.
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { changeWill, removeHeir } from '../src/game/events/will-act'
import { updateWl } from '../src/game/events/will-core'
import { continueAsChild } from '../src/game/life'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, Person } from '../src/game/types'
import { GAME_SLOT, expectRows, isRecording, oracle, recordRows, scene, snapshot, type CastSpec, type ParityRow, type Scene, type Tuple, stampStats, withStamped } from './social-parity-kit'

const ORACLE = oracle('heir')

const ADULT: Tuple = [5, 2026]
const MINOR: Tuple = [8, 2026]
const CUT_OUT: Tuple = [13, 2026]

function track(g: GameState): GameState {
  ;(globalThis as Record<string, unknown>)[GAME_SLOT] = g
  return g
}

/** A will that leaves a child out, and the child knows and is angry (what test/will-estate.test.ts calls cutKnown). */
function cutOut(g: GameState, p: Person, anger: number): void {
  changeWill(g, (gg, w) => removeHeir(gg, w, p))
  g.queue = []
  updateWl(g, p, (w) => {
    w.known = true
    w.how = 'leak'
    w.told = 'out'
    w.anger = anger
  })
}

/** The people of a state by id, with the key the scene gave them (a person made in the hand-over is `new:<relation>`). */
function keyed(s: Scene): (p: Person) => string {
  const byId = new Map(Object.entries(s.who).map(([k, p]) => [p.id, k]))
  return (p) => byId.get(p.id) ?? `new:${p.relation}`
}

/** The data keys that carry over and the ones that do not. */
function keyDiff(before: Person | undefined, after: Person): { keys: string[]; lost: string[] } {
  const keys = Object.keys(after.data).sort()
  const lost = before === undefined ? [] : Object.keys(before.data).filter((k) => !(k in after.data)).sort()
  return { keys, lost }
}

/** A menu action by id when it is there and open; false when it is not (a closed path is a row that differs). */
function tryAct(g: GameState, p: Person, id: string): boolean {
  const a = personActions(g, p).find((x): x is MenuAction => x.type === 'action' && x.id === id)
  if (a === undefined || (a.visible !== undefined && !a.visible(g)) || a.disabledReason?.(g)) return false
  a.run(g)
  return true
}

interface Case {
  label: string
  tuple: Tuple
  /** The player and the family. */
  character: NonNullable<Parameters<typeof scene>[1]>['character']
  cast: CastSpec[]
  /** Anything else the scene needs before the death: assets, loans, the will. */
  prepare(s: Scene): void
  death: string
  heir: string
  /** The choice the heir answers once the reading of the will has queued it: [script, answer]. */
  answer?: readonly [script: string, choice: string]
}

const CASES: Case[] = [
  {
    label: 'adult',
    tuple: ADULT,
    character: { age: 79, gender: 'female', firstName: 'Ruth', lastName: 'Stone', money: 6_000_000 },
    cast: [
      { key: 'spouse', relation: 'spouse', age: 77, gender: 'male', lastName: 'Stone', livesWithPlayer: true },
      { key: 'mom', relation: 'parent', age: 101, gender: 'female', lastName: 'Hale' },
      { key: 'heir', relation: 'child', age: 52, gender: 'female', lastName: 'Stone', relationship: 74, data: { married: true, spouseName: 'Tomas Reyes', kids: 1, birthday: { month: 4, day: 9 } } },
      { key: 'bro', relation: 'child', age: 49, gender: 'male', lastName: 'Stone', relationship: 66, traits: ['jealous', 'hot-headed'] },
      { key: 'sis', relation: 'child', age: 45, gender: 'female', lastName: 'Stone', relationship: 58, traits: ['funny', 'outgoing'] },
      { key: 'half', relation: 'child', age: 55, gender: 'male', lastName: 'Stone', relationship: 40 },
      { key: 'grand', relation: 'grandchild', age: 9, gender: 'female', lastName: 'Stone', relationship: 80 },
      { key: 'grandBro', relation: 'grandchild', age: 12, gender: 'male', lastName: 'Stone', relationship: 70 },
      { key: 'pal', relation: 'friend', age: 80, gender: 'female', relationship: 85 },
      { key: 'boss', relation: 'coworker', age: 60, gender: 'male', relationship: 45 },
      { key: 'rex', relation: 'pet', age: 6, species: 'Dog', firstName: 'Rex', relationship: 90 },
    ],
    prepare(s) {
      const { g, who } = s
      who.heir!.otherParentId = who.spouse!.id
      who.bro!.otherParentId = who.spouse!.id
      who.sis!.otherParentId = who.spouse!.id
      who.grand!.data.parentId = who.heir!.id
      who.grandBro!.data.parentId = who.bro!.id
      cutOut(g, who.bro!, 70)
      cutOut(g, who.sis!, 30)
    },
    death: 'Old Age',
    heir: 'heir',
    // The sister who was cut out asks for a share; the heir splits it evenly.
    answer: ['will.estate.ask', 'half'],
  },
  {
    label: 'minor',
    tuple: MINOR,
    character: { age: 56, gender: 'male', firstName: 'Omar', lastName: 'Reed', money: 800_000 },
    cast: [
      { key: 'spouse', relation: 'spouse', age: 54, gender: 'female', lastName: 'Reed', livesWithPlayer: true },
      { key: 'step', relation: 'stepchild', age: 15, gender: 'male', lastName: 'Vale', relationship: 62, livesWithPlayer: true, money: 300 },
      { key: 'bio', relation: 'child', age: 19, gender: 'female', lastName: 'Reed', relationship: 77 },
      { key: 'pal', relation: 'friend', age: 57, gender: 'male', relationship: 70 },
      { key: 'rex', relation: 'pet', age: 3, species: 'Cat', firstName: 'Mimi', relationship: 88 },
    ],
    prepare(s) {
      const { g, who } = s
      who.step!.otherParentId = who.spouse!.id
      who.bio!.otherParentId = who.spouse!.id
      g.assets.push({ id: 'h1', kind: 'house', name: 'Starter Home', emoji: '\u{1F3E0}', purchasePrice: 200_000, value: 250_000, condition: 80, purchasedAge: 30, upkeep: 2000, details: {}, mortgage: { lender: 'Bank', balance: 50_000, yearlyPayment: 10_000, yearsLeft: 5, rate: 0.05 } })
      g.assets.push({ id: 'w1', kind: 'jewelry', name: 'Old Pocket Watch', emoji: '\u{231A}', purchasePrice: 0, value: 4_000, condition: 70, purchasedAge: 20, upkeep: 0, details: { heirloom: true } })
      g.character.loans.push({ id: 'l1', kind: 'personal', lender: 'Bank', balance: 20_000, yearlyPayment: 5000, rate: 0.08 })
    },
    death: 'Car Accident',
    heir: 'step',
  },
  {
    label: 'cutout',
    tuple: CUT_OUT,
    character: { age: 83, gender: 'male', firstName: 'Hugh', lastName: 'Lane', money: 12_000_000 },
    cast: [
      { key: 'heir', relation: 'child', age: 58, gender: 'male', lastName: 'Lane', relationship: 61, data: { kids: 2 } },
      { key: 'sib1', relation: 'child', age: 55, gender: 'female', lastName: 'Lane', relationship: 72, traits: ['jealous', 'arrogant'], money: 50_000 },
      { key: 'sib2', relation: 'child', age: 53, gender: 'male', lastName: 'Lane', relationship: 64, traits: ['kind', 'calm'], money: 80_000 },
      { key: 'sib3', relation: 'child', age: 50, gender: 'female', lastName: 'Lane', relationship: 90, traits: ['stingy', 'manipulative'], money: 120_000 },
      { key: 'grand1', relation: 'grandchild', age: 30, gender: 'female', lastName: 'Lane', relationship: 60 },
      { key: 'grand2', relation: 'grandchild', age: 14, gender: 'male', lastName: 'Lane', relationship: 75 },
      { key: 'pal', relation: 'friend', age: 84, gender: 'male', relationship: 80 },
    ],
    prepare(s) {
      const { g, who } = s
      who.grand1!.data.parentId = who.heir!.id
      who.grand2!.data.parentId = who.heir!.id
      cutOut(g, who.heir!, 85)
      g.queue = []
    },
    death: 'Heart Attack',
    heir: 'heir',
    // The heir takes the quiet talk when the contest is offered.
    answer: ['will.estate.heir', 'talk'],
  },
]

/** The rows of one hand-over. */
function play(c: Case): ParityRow[] {
  const s = scene(c.tuple, { character: c.character, cast: c.cast })
  c.prepare(s)
  const { g } = s
  const old = new Map(g.people.map((p) => [p.id, p]))
  killCharacter(g, c.death)
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
  const tag = `${c.label}`
  s.step(`${tag}|death`, () => undefined, (gg) => ({ alive: gg.character.alive, money: gg.character.money, people: gg.people.length, assets: gg.assets.length, loans: gg.character.loans.length }))
  const heir = s.who[c.heir]!
  const n = continueAsChild(g, heir.id)
  expect(n, `${tag}: the hand-over must happen`).not.toBe(g)
  track(n)
  const name = keyed(s)
  const oldRng = g.rng
  const rows = s.rows
  for (const p of n.people) {
    const before = old.get(p.id)
    rows.push(snapshot(`${tag}|person|${name(p)}`, n, () => ({ relation: p.relation, was: before?.relation ?? null, was_rel: before?.relationship ?? null, rel: p.relationship, alive: p.alive, age: p.age, money: p.money, with: p.livesWithPlayer, known: p.yearsKnown, notes: p.notes.length, ...keyDiff(before, p), other: p.otherParentId === undefined ? null : name(n.people.find((x) => x.id === p.otherParentId) ?? p) })))
  }
  for (const p of g.people) {
    if (n.people.some((x) => x.id === p.id) || p.id === heir.id) continue
    rows.push(snapshot(`${tag}|dropped|${name(p)}`, n, () => ({ relation: p.relation, rel: p.relationship, money: p.money })))
  }
  rows.push(
    snapshot(`${tag}|estate`, n, (nn) => ({
      oldRng,
      oldNextId: g.nextId,
      heir: { id: nn.character.id === heir.id, age: nn.character.age, money: nn.character.money, residence: nn.character.residence.status, loans: nn.character.loans.length, talent: nn.character.talent, education: nn.character.education.completed },
      generation: nn.generation,
      ancestor: { netWorth: nn.ancestors[0]?.netWorth, age: nn.ancestors[0]?.age },
      assets: nn.assets.map((a) => [a.id, a.value, a.mortgage?.balance ?? 0]),
      siblings: nn.people.filter((p) => p.relation === 'sibling' || p.relation === 'halfSibling' || p.relation === 'stepsibling').map((p) => [name(p), p.money]),
      pooled: nn.people.reduce((sum, p) => sum + p.money, 0) + nn.character.money,
      flags: Object.keys(nn.flags).sort(),
      log: nn.log[0]?.entries.length ?? 0,
    })),
  )
  if (c.answer) {
    const i = n.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === c.answer![0])
    expect(i, `${tag}: the reading of the will must offer ${c.answer[0]}`).toBeGreaterThanOrEqual(0)
    const m = n.queue.splice(i, 1)[0] as ChoiceModal
    runScript(n, m.scriptId!, c.answer[1], m.data, m)
  }
  rows.push(snapshot(`${tag}|reading`, n, (nn) => ({ oldRng: g.rng, siblings: nn.people.filter((p) => p.relation === 'sibling' || p.relation === 'halfSibling').map((p) => [name(p), p.relationship, p.money]), money: nn.character.money })))
  // Three years of family time with the people the heir is related to.
  for (let year = 1; year <= 3; year++) {
    n.yearActions = {}
    const acts: string[] = []
    for (const p of n.people) {
      if (!p.alive || p.age < 6 || !['parent', 'grandparent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'child', 'spouse', 'pet'].includes(p.relation)) continue
      for (const id of p.relation === 'pet' ? ['play'] : ['hug', 'hug', 'hug', 'spendTime', 'spendTime']) acts.push(`${id}:${name(p)}:${tryAct(n, p, id) ? 1 : 0}`)
    }
    rows.push(snapshot(`${tag}|family time|${year}`, n, () => ({ acts, oldRng: g.rng, people: n.people.map((p) => [name(p), p.relationship]) })))
    n.queue = []
  }
  return rows
}

function playAll(): ParityRow[] {
  return CASES.flatMap(play)
}

let first: ParityRow[] | null = null
const rowsOnce = (): ParityRow[] => (first ??= playAll())

describe('the heir hand-over oracle', () => {
  it('the rows are the recorded ones', { timeout: 120_000 }, () => {
    const rows = rowsOnce()
    if (isRecording(ORACLE.area)) recordRows(ORACLE, rows)
    else expectRows(ORACLE, rows)
  })

  it('plays the same rows on a stamped life: the mirror follows every number and moves none (R4-E7)', { timeout: 120_000 }, () => {
    const rows = withStamped(playAll)
    expectRows(ORACLE, rows)
    expect(stampStats().stamped, 'the replay must stamp games').toBeGreaterThan(0)
    expect(stampStats().checked, 'the replay must check the mirror').toBeGreaterThan(0)
  })

  it('plays the same rows twice', { timeout: 120_000 }, () => {
    expect(JSON.stringify(playAll())).toBe(JSON.stringify(rowsOnce()))
  })

  it('has the three hand-overs, each with its people, its estate and its family time', () => {
    const rows = rowsOnce()
    for (const c of CASES) {
      const mine = rows.filter((r) => r.label.startsWith(`${c.label}|`))
      expect(mine.some((r) => r.label === `${c.label}|estate`)).toBe(true)
      expect(mine.filter((r) => r.label.includes('|person|')).length).toBeGreaterThanOrEqual(4)
      expect(mine.filter((r) => r.label.includes('|family time|'))).toHaveLength(3)
    }
    // The new generation is made on a clone: the late player's dice stay where the death left them.
    const estate = rows.find((r) => r.label === 'adult|estate')!
    expect((estate.x as { oldRng: number }).oldRng).toBe(rows.find((r) => r.label === 'adult|death')!.rng)
  })
})
