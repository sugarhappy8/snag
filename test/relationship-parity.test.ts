// ci: fast
// R4-E2 (X2, X30): the golden of relationships.ts. R4-E5 moves every change to Person.relationship behind one door (addRelationship
// with the game and a kind in core.ts) and E7 mirrors it into the Edge. This file is the proof that the numbers a life gets do not
// move: it plays the engine as it is, with the kit of R4-E1 (test/social-parity-kit.ts), and compares every step to the rows
// recorded in test/fixtures/social-parity-relationships.json on the unmodified tree. A row holds each person's relationship, g.rng,
// g.nextId, the queue (kinds, no text) and the player's cash, and a few facts the area pins; it holds no text, no note and no log.
//
//   tab|<start>|<delta>   the addRelationship contract through the kit's applyDelta, the only call this file makes: both bounds, the
//                         bound plus one, halves, NaN, a huge delta, Infinity, and the three kinds (v5.2.0 ignores them: the number
//                         must not depend on the kind)
//   act|...               every action of the Relationships screen that can move the number, for a parent, a friend, a partner and a
//                         pet at starts 25 and 80 on two dice tuples, each a fresh scene; a path that is closed is a row that says
//                         so; the answer of every script popup the action opens (gifts, rings, attacks...) is a row of its own
//   ext|...               the same for the other relations the menu serves (a sibling, a child, an ex, an enemy, a spouse ...)
//   cap|...               each capped action repeated max+1 times: the last is refused (useYearAction, core.ts)
//   drift|...             driftRelationships for the 23 DRIFT relations (and an enemy) across contact, living together, prison and
//                         three eras, a young player, a person born this year and a disowned one
//   fam|y<n>              40 years of yearlyRelationships for a family of 9
//   gc|...                cleanupPeople with 30 exes (who survives), dead exes and pets over their caps
//   menu|...              personActions of 16 people under frozenGame: ids, labels, why a row is disabled, one level of menus;
//                         read twice (the second read is the first), with g.rng trapped and the state frozen
//
// Record (Node 22, on a tree whose src/ equals HEAD):
//   RECORD_SOCIAL_PARITY=relationships RECORD_REASON="why the rows are recorded" wt/bin/vt22 test/relationship-parity.test.ts
// Record twice and diff: the files are byte-identical. Nobody edits the file by hand and nobody merges it (X2).
import { describe, expect, it } from 'vitest'
import { driftRelationships, personActions, yearlyRelationships } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuNode, Person, RelationKind } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import {
  applyDelta,
  cut,
  expectRows,
  isRecording,
  oracle,
  recordRows,
  scene,
  snapshot,
  trapRng,
  type Cell,
  type CastSpec,
  type ParityRow,
  type SceneSpec,
  type Tuple,
  stampStats,
  withStamped,
} from './social-parity-kit'

const ORACLE = oracle('relationships')

// ---------------------------------------------------------------------------------------------------------------------
// Small tools

/** The player: an adult of 30 with the money for every price on the menu. */
const PLAYER = { age: 30, money: 100_000 } as const

/** The first script choice popup in the queue, or null. */
function firstChoice(g: GameState): ChoiceModal | null {
  const m = g.queue.find((q): q is ChoiceModal => q.kind === 'choice' && q.source === 'script' && q.scriptId !== undefined)
  return m ?? null
}

/** Takes the first script popup out of the queue and answers it the way the store would. False when there is none. */
function answerFirst(g: GameState, choice: string): boolean {
  const m = firstChoice(g)
  if (m === null) return false
  g.queue.splice(g.queue.indexOf(m), 1)
  runScript(g, m.scriptId!, choice, m.data, m)
  return true
}

/**
 * Answers every popup of the queue the way the store does, in order, follow-ups first: a script choice takes the option at
 * (salt + how many were answered) modulo the count, an input takes its default or "Sam", the rest is dropped. Returns what was
 * answered as scriptId:option. Bounded: a popup that keeps asking again stops at 80.
 */
function drain(g: GameState, salt: number): string[] {
  const seen: string[] = []
  for (let guard = 0; g.queue.length > 0 && guard < 80; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice' && m.source === 'script' && m.scriptId !== undefined && m.choices.length > 0) {
      const o = m.choices[(salt + seen.length) % m.choices.length]!
      seen.push(`${m.scriptId}:${o.id}`)
      runScript(g, m.scriptId, o.id, m.data, m)
    } else if (m.kind === 'input') {
      seen.push(`${m.scriptId}:input`)
      runScript(g, m.scriptId, m.defaultValue || 'Sam', m.data, m)
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
  g.queue = []
  return seen
}

/** Runs an action of the person's menu the way the screen would. False when the row is missing, hidden or disabled. */
function tryAction(g: GameState, p: Person, id: string, input?: string): boolean {
  const a = personActions(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === id)
  if (a === undefined) return false
  if (a.visible !== undefined && !a.visible(g)) return false
  if (a.disabledReason?.(g)) return false
  a.run(g, input)
  return true
}

const tupleName = (t: Tuple): string => `${t[0]}-${t[1]}`

// ---------------------------------------------------------------------------------------------------------------------
// tab: the addRelationship contract

const STARTS: readonly number[] = [0, 1, 49, 50, 99, 100, Number.NaN, -5, 105, 50.5]
const DELTAS: readonly number[] = [-1000, -100, -50, -10, -1, -0.5, 0, 0.5, 1, 10, 50, 100, 1000, 1e9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
const KINDS = ['affection', 'offence', 'decay'] as const

function playTable(): ParityRow[] {
  const s = scene([11, 2026], { character: PLAYER, cast: [{ key: 'pal', relation: 'friend', age: 31, relationship: 50 }] })
  const pal = s.who.pal!
  for (const start of STARTS) {
    for (const d of DELTAS) {
      s.step(`tab|${start}|${d}`, (g) => {
        pal.relationship = start
        applyDelta(g, pal, d)
      })
    }
  }
  // The kind is for the mirror; it never changes the number.
  for (const kind of KINDS) {
    for (const [start, d] of [[40, 7], [40, -7], [98, 9], [3, -9]] as const) {
      s.step(`tab|${kind}|${start}|${d}`, (g) => {
        pal.relationship = start
        applyDelta(g, pal, d, kind)
      })
    }
  }
  return s.rows
}

// ---------------------------------------------------------------------------------------------------------------------
// act and ext: the actions of the screen

type Kind = 'parent' | 'friend' | 'partner' | 'pet' | 'sibling' | 'child' | 'ex' | 'enemy' | 'fiance' | 'spouse' | 'lover' | 'boss' | 'coworker' | 'classmate'

/** The one person of a scene: what the menu of each kind needs to show its rows. */
const SUBJECT: Record<Kind, (start: number) => CastSpec> = {
  parent: (r) => ({ key: 'subject', relation: 'parent', age: 55, relationship: r, money: 60_000 }),
  friend: (r) => ({ key: 'subject', relation: 'friend', age: 31, relationship: r, money: 8_000 }),
  partner: (r) => ({ key: 'subject', relation: 'partner', age: 29, relationship: r, money: 12_000, data: { datingSince: 27 } }),
  pet: (r) => ({ key: 'subject', relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex', relationship: r }),
  sibling: (r) => ({ key: 'subject', relation: 'sibling', age: 28, relationship: r, money: 9_000 }),
  child: (r) => ({ key: 'subject', relation: 'child', age: 25, relationship: r, money: 3_000, lastName: 'Player' }),
  ex: (r) => ({ key: 'subject', relation: 'ex', age: 30, relationship: r, money: 5_000, data: { exAge: 26 } }),
  enemy: (r) => ({ key: 'subject', relation: 'enemy', age: 33, relationship: r, money: 2_000 }),
  fiance: (r) => ({ key: 'subject', relation: 'fiance', age: 29, relationship: r, money: 15_000, data: { datingSince: 26, engagedAge: 28 } }),
  spouse: (r) => ({ key: 'subject', relation: 'spouse', age: 31, relationship: r, money: 20_000, data: { datingSince: 20, marriedAge: 18 } }),
  lover: (r) => ({ key: 'subject', relation: 'lover', age: 32, relationship: r, money: 7_000 }),
  boss: (r) => ({ key: 'subject', relation: 'boss', age: 48, relationship: r, money: 40_000 }),
  coworker: (r) => ({ key: 'subject', relation: 'coworker', age: 35, relationship: r, money: 10_000 }),
  classmate: (r) => ({ key: 'subject', relation: 'classmate', age: 29, relationship: r, money: 1_000 }),
}

/** The rows of defsFor (relationships.ts) for each kind that can move the number; the ones that remove a person are left out. */
const ACTIONS: Record<Kind, readonly string[]> = {
  parent: ['askMoney', 'compliment', 'conversation', 'gift', 'giveMoney', 'hug', 'movie', 'prank', 'spendTime', 'vacation', 'argue', 'insult', 'assault'],
  friend: ['spendTime', 'conversation', 'compliment', 'gift', 'party', 'concert', 'videos', 'prank', 'rumor', 'flirt', 'askOut', 'hookUp', 'bestFriend', 'insult', 'assault'],
  partner: ['spendTime', 'dateNight', 'conversation', 'compliment', 'flirt', 'gift', 'giveMoney', 'makeLove', 'tryBaby', 'birthControl', 'movie', 'vacation', 'counseling', 'propose', 'prank', 'argue', 'insult', 'assault', 'breakUp'],
  pet: ['play', 'walk', 'treat', 'bathe', 'vet'],
  sibling: ['compliment', 'conversation', 'gift', 'giveMoney', 'hug', 'prank', 'squabble', 'insult', 'assault'],
  child: ['spendTime', 'compliment', 'gift', 'askMoney', 'giveMoney', 'argue', 'insult'],
  ex: ['conversation', 'compliment', 'gift', 'getBack', 'insult'],
  enemy: ['makePeace', 'conversation', 'insult', 'prank', 'rumor'],
  fiance: ['spendTime', 'dateNight', 'gift', 'makeLove', 'elope', 'cancelEngagement', 'breakUp'],
  spouse: ['spendTime', 'dateNight', 'makeLove', 'tryBaby', 'counseling', 'renewVows', 'argue', 'divorce'],
  lover: ['spendTime', 'compliment', 'flirt', 'gift', 'makeLove', 'leaveFor', 'endAffair'],
  boss: ['compliment', 'conversation', 'befriend', 'gift', 'prank', 'insult'],
  coworker: ['befriend', 'compliment', 'conversation', 'spendTime', 'gift', 'flirt', 'insult'],
  classmate: ['befriend', 'compliment', 'conversation', 'spendTime', 'gift', 'flirt', 'prank', 'rumor'],
}

/** The input of an action that asks for an amount. */
const INPUT: Record<string, string> = { giveMoney: '1500' }

const CORE_KINDS: readonly Kind[] = ['parent', 'friend', 'partner', 'pet']
const EXT_KINDS: readonly Kind[] = ['sibling', 'child', 'ex', 'enemy', 'fiance', 'spouse', 'lover', 'boss', 'coworker', 'classmate']
const CORE_STARTS: readonly number[] = [25, 80]
const CORE_TUPLES: readonly Tuple[] = [[3, 2026], [8, 1987]]
const EXT_TUPLE: Tuple = [5, 2026]

interface ActCase {
  area: 'act' | 'ext'
  kind: Kind
  start: number
  tuple: Tuple
  id: string
}

/** One action in a fresh scene, and the choices of the first script popup it opens (before any is answered). */
function playAction(c: ActCase, answer?: string): { row: ParityRow; choices: string[]; script: string | null } {
  const spec: SceneSpec = { character: PLAYER, cast: [SUBJECT[c.kind](c.start)] }
  const s = scene(c.tuple, spec)
  const p = s.who.subject!
  let choices: string[] = []
  let script: string | null = null
  let closed = false
  const label = `${c.area}|${c.kind}|${c.start}|${tupleName(c.tuple)}|${c.id}${answer === undefined ? '' : `|ans:${answer}`}`
  const row = s.step(
    label,
    (g) => {
      closed = !tryAction(g, p, c.id, INPUT[c.id])
      const popup = firstChoice(g)
      choices = popup?.choices.map((o) => o.id) ?? []
      script = popup?.scriptId ?? null
      if (answer !== undefined && !closed) answerFirst(g, answer)
    },
    () => ({
      // Only what is not the usual: a closed row, the choices the action offers (on the row before any is answered), a person who changed kind or died.
      ...(closed ? { closed: true } : {}),
      ...(answer === undefined && choices.length > 0 ? { choices } : {}),
      ...(p.relation !== SUBJECT[c.kind](c.start).relation ? { relation: p.relation } : {}),
      ...(p.alive ? {} : { alive: false }),
    }),
  )
  return { row, choices, script }
}

function playActions(): ParityRow[] {
  const rows: ParityRow[] = []
  const grid: ActCase[] = []
  for (const kind of CORE_KINDS) for (const tuple of CORE_TUPLES) for (const start of CORE_STARTS) for (const id of ACTIONS[kind]) grid.push({ area: 'act', kind, start, tuple, id })
  for (const kind of EXT_KINDS) for (const id of ACTIONS[kind]) grid.push({ area: 'ext', kind, start: 25, tuple: EXT_TUPLE, id })
  for (const c of grid) {
    const { row, choices, script } = playAction(c)
    rows.push(row)
    // The popups the action opened are answered on a replay, one choice at a time: for the core four on the first tuple only, for
    // the others everything but the gift list (the same twelve gifts again and again would add rows and no information).
    const answered = c.area === 'ext' ? script !== 'rel.gift.pick' : c.tuple === CORE_TUPLES[0]
    if (answered) for (const choice of choices) rows.push(playAction(c, choice).row)
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// cap: useYearAction

/** [kind, action id, uses a year]: the action is run max+1 times and the last must be refused. */
const CAPS: readonly (readonly [Kind, string, number])[] = [
  ['parent', 'spendTime', 3],
  ['parent', 'conversation', 3],
  ['parent', 'compliment', 2],
  ['parent', 'gift', 2],
  ['parent', 'hug', 3],
  ['parent', 'movie', 2],
  ['parent', 'vacation', 1],
  ['parent', 'askMoney', 2],
  ['parent', 'prank', 2],
  ['parent', 'argue', 2],
  ['parent', 'insult', 3],
  ['parent', 'assault', 2],
  ['friend', 'party', 2],
  ['friend', 'concert', 1],
  ['friend', 'videos', 2],
  ['friend', 'rumor', 1],
  ['friend', 'flirt', 2],
  ['friend', 'hookUp', 2],
  ['friend', 'bestFriend', 1],
  ['partner', 'dateNight', 2],
  ['partner', 'makeLove', 3],
  ['partner', 'counseling', 1],
  ['partner', 'propose', 1],
  ['partner', 'birthControl', 1],
  ['pet', 'play', 3],
  ['pet', 'walk', 3],
  ['pet', 'treat', 3],
  ['pet', 'bathe', 2],
  ['pet', 'vet', 1],
]

function playCaps(): ParityRow[] {
  const rows: ParityRow[] = []
  for (const [kind, id, max] of CAPS) {
    const s = scene([13, 2026], { character: PLAYER, cast: [SUBJECT[kind](50)] })
    const p = s.who.subject!
    for (let i = 1; i <= max + 1; i++) {
      let closed = false
      let asked = false
      s.step(
        `cap|${kind}|${id}|${i}`,
        (g) => {
          closed = !tryAction(g, p, id, INPUT[id])
          const m = firstChoice(g)
          asked = m !== null
          if (m !== null) answerFirst(g, m.choices[0]!.id)
        },
        (g) => ({
          ...(closed ? { closed: true } : {}),
          ...(asked ? { asked: true } : {}),
          used: Object.entries(g.yearActions).filter(([k]) => k.startsWith('rel.')).map(([k, n]) => `${k}=${n}`),
        }),
      )
    }
    rows.push(...s.rows)
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// drift: driftRelationships

/** The 23 relations of the DRIFT table (relationships.ts), in its order, and an enemy (the branch that never loses a point). */
const DRIFT_RELATIONS: readonly RelationKind[] = [
  'parent', 'stepparent', 'grandparent', 'sibling', 'halfSibling', 'stepsibling', 'child', 'stepchild', 'grandchild', 'partner', 'fiance', 'spouse',
  'friend', 'bestFriend', 'classmate', 'teacher', 'coworker', 'boss', 'ex', 'exSpouse', 'lover', 'cellmate', 'pet', 'enemy',
]

const PRISON = { name: 'State', security: 'medium', crime: 'Assault', sentenceYears: 5, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 } as const

function driftCast(): CastSpec[] {
  return DRIFT_RELATIONS.map((relation, i) => ({
    key: relation,
    relation,
    age: relation === 'pet' ? 4 : relation === 'grandparent' ? 78 : relation === 'child' || relation === 'stepchild' ? 12 : 40,
    gender: i % 2 === 0 ? 'female' : 'male',
    relationship: 60,
    species: relation === 'pet' ? 'Cat' : undefined,
    firstName: `D${i}`,
  }))
}

function playDrift(): ParityRow[] {
  const rows: ParityRow[] = []
  // Contact: touched this year, two years ago, long ago, and "in the future" (an heir's inherited record).
  const contacts: readonly [string, (age: number) => number][] = [['now', (a) => a], ['two', (a) => a - 2], ['long', (a) => a - 6], ['heir', (a) => a + 3]]
  for (const year of [1905, 1985, 2026]) {
    const s = scene([17, year], { character: PLAYER, cast: driftCast() })
    const g = s.g
    for (const [cname, contact] of contacts) {
      for (const living of [false, true]) {
        for (const prison of [false, true]) {
          s.step(
            `drift|${year}|${cname}|${living ? 'home' : 'away'}|${prison ? 'prison' : 'free'}`,
            () => {
              g.character.prison = prison ? { ...PRISON } : null
              for (const p of g.people) {
                p.relationship = 60
                p.livesWithPlayer = living
                p.yearsKnown = 10
                p.data.lastInteractionAge = contact(g.character.age)
              }
              driftRelationships(g)
            },
          )
        }
      }
    }
    rows.push(...s.rows)
  }
  // A young player: the parents and grandparents drift a third as fast before six.
  const young = scene([19, 2000], { character: { age: 4, money: 0 }, cast: driftCast() })
  for (const living of [false, true]) {
    young.step(`drift|young|${living ? 'home' : 'away'}`, (g) => {
      for (const p of g.people) {
        p.relationship = 60
        p.livesWithPlayer = living
        p.data.lastInteractionAge = -100
      }
      driftRelationships(g)
    })
  }
  // A person born this year does not drift; a disowned person does not either.
  young.step('drift|born-and-disowned', (g) => {
    for (const p of g.people) {
      p.relationship = 60
      p.data.lastInteractionAge = -100
    }
    g.people[0]!.data.bornAge = g.character.age
    g.people[1]!.data.disowned = true
    driftRelationships(g)
  })
  rows.push(...young.rows)
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// fam: 40 years for a family of 9

function playFamily(): ParityRow[] {
  const s = scene([21, 1990], {
    character: { age: 20, money: 30_000 },
    cast: [
      { key: 'mom', relation: 'parent', age: 46, gender: 'female', relationship: 80, lastName: 'Player', livesWithPlayer: true, money: 60_000 },
      { key: 'dad', relation: 'parent', age: 49, gender: 'male', relationship: 70, lastName: 'Player', livesWithPlayer: true, money: 80_000 },
      { key: 'gran', relation: 'grandparent', age: 74, gender: 'female', relationship: 65, lastName: 'Player', money: 40_000 },
      { key: 'sis', relation: 'sibling', age: 17, gender: 'female', relationship: 60, lastName: 'Player', livesWithPlayer: true },
      { key: 'bro', relation: 'sibling', age: 24, gender: 'male', relationship: 45, lastName: 'Player', money: 5_000 },
      { key: 'wife', relation: 'spouse', age: 21, gender: 'female', relationship: 75, livesWithPlayer: true, data: { datingSince: 17, marriedAge: 19 } },
      { key: 'kid', relation: 'child', age: 1, gender: 'male', relationship: 90, lastName: 'Player', livesWithPlayer: true },
      { key: 'pal', relation: 'friend', age: 21, gender: 'male', relationship: 55 },
      { key: 'dog', relation: 'pet', age: 2, species: 'Dog', firstName: 'Rex', relationship: 85, livesWithPlayer: true, data: { lifespan: 13 } },
    ],
  })
  const g = s.g
  for (let i = 1; i <= 40; i++) {
    let asked: string[] = []
    s.step(
      `fam|y${String(i).padStart(2, '0')}`,
      () => {
        g.character.age += 1
        g.year += 1
        g.yearActions = {}
        yearlyRelationships(g)
        // The popups of the year (funerals, births, cheating, the family plan) are answered here, the way the store would.
        asked = drain(g, i)
      },
      () => ({ asked, people: g.people.length, alive: g.people.filter((p) => p.alive).length, relations: g.people.filter((p) => p.alive).map((p) => p.relation).join(',') }),
    )
  }
  return s.rows
}

// ---------------------------------------------------------------------------------------------------------------------
// gc: cleanupPeople

function playCleanup(): ParityRow[] {
  const cast: CastSpec[] = []
  // 30 live exes: relationship climbs with the index, every third is a fling.
  for (let i = 0; i < 30; i++) {
    cast.push({ key: `x${String(i).padStart(2, '0')}`, relation: 'ex', age: 28 + (i % 7), relationship: 5 + i * 3, firstName: `Ex${i}`, data: i % 3 === 0 ? { fling: true } : {} })
  }
  // A baby's other parent and a person with a company are never dropped.
  cast.push({ key: 'babyx', relation: 'ex', age: 30, relationship: 1, firstName: 'Bx', data: { babyParent: true } })
  cast.push({ key: 'coex', relation: 'ex', age: 30, relationship: 2, firstName: 'Cx', data: { npcCompany: 'co9' } })
  // 14 dead exes, 14 dead pets and a dead stranger.
  for (let i = 0; i < 14; i++) cast.push({ key: `d${String(i).padStart(2, '0')}`, relation: i % 2 === 0 ? 'ex' : 'exSpouse', age: 60, relationship: 30, firstName: `Dead${i}` })
  for (let i = 0; i < 14; i++) cast.push({ key: `q${String(i).padStart(2, '0')}`, relation: 'pet', age: 9, species: 'Cat', firstName: `Pet${i}`, relationship: 70 })
  cast.push({ key: 'old', relation: 'friend', age: 90, relationship: 40, firstName: 'Olde' })
  const s = scene([23, 2026], { character: PLAYER, cast })
  const g = s.g
  g.people.forEach((p) => {
    if (p.firstName.startsWith('Dead') || p.firstName.startsWith('Pet') || p.firstName === 'Olde') {
      p.alive = false
      p.data.diedAge = 20 + Number(p.firstName.replace(/\D/g, '') || 0)
    }
  })
  const survivors = (): Record<string, unknown> => ({
    count: g.people.length,
    exes: g.people.filter((p) => p.alive && p.relation === 'ex').map((p) => p.firstName).join(','),
    deadExes: g.people.filter((p) => !p.alive && (p.relation === 'ex' || p.relation === 'exSpouse')).map((p) => p.firstName).join(','),
    deadPets: g.people.filter((p) => !p.alive && p.relation === 'pet').map((p) => p.firstName).join(','),
    old: g.people.some((p) => p.firstName === 'Olde'),
  })
  s.step('gc|before', () => undefined, survivors)
  s.step('gc|year1', () => {
    g.character.age += 1
    yearlyRelationships(g)
    drain(g, 0)
  }, survivors)
  s.step('gc|year2', () => {
    g.character.age += 1
    g.yearActions = {}
    yearlyRelationships(g)
    drain(g, 1)
  }, survivors)
  return s.rows
}

// ---------------------------------------------------------------------------------------------------------------------
// menu: personActions under frozenGame

const MENU_CAST: readonly CastSpec[] = [
  { key: 'parent', relation: 'parent', age: 55, relationship: 70, livesWithPlayer: true, money: 90_000 },
  { key: 'grandparent', relation: 'grandparent', age: 80, relationship: 55, money: 30_000 },
  { key: 'sibling', relation: 'sibling', age: 28, relationship: 40, money: 9_000 },
  { key: 'kid', relation: 'child', age: 5, relationship: 90, livesWithPlayer: true, lastName: 'Player' },
  { key: 'grown', relation: 'child', age: 25, relationship: 60, money: 3_000, lastName: 'Player' },
  { key: 'partner', relation: 'partner', age: 29, relationship: 66, data: { datingSince: 27 } },
  { key: 'fiance', relation: 'fiance', age: 29, relationship: 72, data: { datingSince: 26, engagedAge: 28, ring: 'Silver band' } },
  { key: 'spouse', relation: 'spouse', age: 31, relationship: 58, livesWithPlayer: true, money: 20_000, data: { marriedAge: 18, prenup: true } },
  { key: 'friend', relation: 'friend', age: 31, relationship: 50, money: 8_000 },
  { key: 'coworker', relation: 'coworker', age: 35, relationship: 35 },
  { key: 'boss', relation: 'boss', age: 48, relationship: 30 },
  { key: 'ex', relation: 'ex', age: 30, relationship: 20, data: { fling: true } },
  { key: 'enemy', relation: 'enemy', age: 33, relationship: 5 },
  { key: 'dog', relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex', relationship: 90 },
  { key: 'disowned', relation: 'child', age: 22, relationship: 0, lastName: 'Player', data: { disowned: true, disownedAge: 24 } },
  { key: 'late', relation: 'parent', age: 79, relationship: 60, firstName: 'Late' },
]

/** [type, id, label, shown, why it is disabled, the children one level down] of one row; a row's own functions are read, never run. */
function nodeRow(g: GameState, n: MenuNode, depth = 0): Cell {
  const label = 'label' in n ? n.label : 'info'
  const shown = n.visible === undefined ? true : n.visible(g)
  const why = n.type === 'action' || n.type === 'menu' ? (n.disabledReason?.(g) ?? null) : null
  const kids = n.type === 'menu' && depth === 0 ? n.children(g).map((k) => nodeRow(g, k, 1)) : []
  return cut([n.type, n.id, label, shown, why, kids])
}

/**
 * The rows R4-E10a adds to the page of a person on a stamped life (society/menu.ts, ids `social.*`). The recording is the plain
 * engine's menu, so they are left out of the comparison; the count says how many were left out, so a stamped replay that stopped
 * producing them, or an unstamped one that started to, shows.
 */
let favorRowsSeen = 0
const withoutFavorRows = (nodes: MenuNode[]): MenuNode[] =>
  nodes.filter((n) => {
    if (!n.id.startsWith('social.')) return true
    favorRowsSeen++
    return false
  })

function playMenus(): ParityRow[] {
  const s = scene([4, 2026], { character: PLAYER, cast: MENU_CAST })
  const g = s.g
  s.who.late!.alive = false
  s.who.late!.data.diedAge = 29
  // Their company: the kit's cast has no contextId, the menu reads it.
  s.who.coworker!.contextId = 'co1'
  s.who.boss!.contextId = 'co1'
  const rows: ParityRow[] = []
  // The rows first (g.rng is readable), then the same state frozen with the draw trapped.
  const bases = MENU_CAST.map((c) => snapshot(`menu|${c.key}`, g))
  deepFreeze(trapRng(g))
  MENU_CAST.forEach((c, i) => {
    const p = s.who[c.key]!
    const first = withoutFavorRows(personActions(g, p)).map((n) => nodeRow(g, n))
    const second = withoutFavorRows(personActions(g, p)).map((n) => nodeRow(g, n))
    expect(second).toEqual(first)
    rows.push({ ...bases[i]!, x: { nodes: first } })
  })
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------

export function playAll(): ParityRow[] {
  return [...playTable(), ...playActions(), ...playCaps(), ...playDrift(), ...playFamily(), ...playCleanup(), ...playMenus()]
}

describe('relationships.ts is what it was before the shim', () => {
  it('has the rows it recorded: every number, every draw, every popup', () => {
    favorRowsSeen = 0
    const rows = playAll()
    if (isRecording(ORACLE.area)) recordRows(ORACLE, rows)
    else expectRows(ORACLE, rows)
    expect(favorRowsSeen, 'a life that is not stamped has no favor rows (R4-E10a)').toBe(0)
  })

  it('plays the same rows on a stamped life: the mirror follows every number and moves none (R4-E7)', () => {
    favorRowsSeen = 0
    const rows = withStamped(playAll)
    expectRows(ORACLE, rows)
    expect(favorRowsSeen, 'a stamped page gains the favor rows of R4-E10a, which the comparison leaves out').toBeGreaterThan(0)
    expect(stampStats().stamped, 'the replay must stamp games').toBeGreaterThan(0)
    expect(stampStats().checked, 'the replay must check the mirror').toBeGreaterThan(0)
  })

  it('plays the same rows twice', () => {
    expect(playAll()).toEqual(playAll())
  })
})
