// ci: fast
// R4-E3 (X2, X30): the will oracle. Being written out of a will makes a relative angry, and the anger moves their relationship, wakes
// the yearly feud (cold shoulder, badmouthing, a confrontation, an ultimatum, an estrangement) and decides what the family does at
// the reading. R4 routes every relationship write through one shim (R4-E5), mirrors `Wl.anger` into the Edge's resentment
// (R4-E7) and gives the feud ladder a second set of rungs (R4-E12) that shares the will's single scene a year. None of that may move
// a number of the will as it plays today. This file plays it on the engine as it is, records the numbers
// (test/fixtures/social-parity-will.json, made with test/social-parity-kit.ts under Node 22) and compares every later run to them.
// It moves nothing and changes no source. The rows hold no text.
//
// What is played (a row's label starts with its part):
//   learn  angerOnLearning over the nine ways to learn, eleven relations, closeness, temper, history, entitlement, estate and need
//   model  angerDrift, peaceOdds, giftRelief, angerAfterShare and contestOdds over their inputs, and the will rows of a relative's
//          sheet (ids and disabled flags, read from a frozen state)
//   feud   four scripted fifteen-year feuds through yearlyWillFeuds: a kind child, a hothead, a spouse, a famous player with
//          grandchildren; each year records every relative's anger, stage, cold shoulder, estrangement and relationship, g.rng
//          and the kinds of the scenes it queued (at most one a year)
//   amend  every way back on a relative's sheet (a heart-to-heart, the explanation, putting them back, a smaller share, money, the
//          reach-out to an estranged one) and every answer to the scenes (tell, confrontation, ultimatum, press, grandchildren, olive)
//   toggle the toggle-farm loop: cut, restore, cut, restore ... must not farm trust
//   est    planEstate and the reading of the will (continueAsChild, which runs settleReading): the cut-out relatives' anger and
//          relationships, the court cases, the sibling who asks for a share
//
// The lives are tuples ([seed, year], X30), searched once for the path each is there to cover and constant now: the checks at the end
// of the file name the path, so a change that closes one fails loudly instead of quietly recording another life.
// Record: RECORD_SOCIAL_PARITY=will RECORD_REASON="..." wt/bin/vt22 test/will-parity.test.ts
import { describe, expect, it } from 'vitest'
import { addHeir, changeWill, estrange, learn, removeHeir } from '../src/game/events/will-act'
import { willPersonNodes } from '../src/game/events/will-amends'
import { killCharacter } from '../src/game/death'
import { updateTies } from '../src/game/events/wealth-core'
import {
  angerAfterShare,
  angerDrift,
  angerOnLearning,
  giftRelief,
  peaceOdds,
  readWill,
  readWl,
  updateWl,
  writeWill,
  type Learn,
  type Wl,
} from '../src/game/events/will-core'
import { contestOdds, planEstate } from '../src/game/events/will-estate'
import { yearlyWillFeuds } from '../src/game/events/will-feud'
import { queueConfront, queueGrandkids, queueOlive, queuePress, queueSpouseUltimatum, queueTells } from '../src/game/events/will-scenes'
import { continueAsChild } from '../src/game/life'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, InputModal, MenuAction, Person, RelationKind } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { expectRows, isRecording, oracle, queueKinds, recordRows, scene, snapshot, trapRng, type CastSpec, type Extra, type ParityRow, type Scene, type Tuple, stampStats, withStamped } from './social-parity-kit'

const ORACLE = oracle('will')

// ---------------------------------------------------------------------------------------------------------------------
// The family

interface FamOpts {
  money?: number
  age?: number
  fame?: number
  /** The children's ages: a, b, c. */
  kids?: [number, number, number]
  spouse?: number
  spouseTraits?: string[]
  /** Ages of the grandchildren of b. */
  grandkids?: number[]
}

/** A rich 62-year-old with a spouse and three grown children who know them well (the family of test/will-feud.test.ts). */
function fam(tuple: Tuple, opts: FamOpts = {}): Scene {
  const [ka, kb, kc] = opts.kids ?? [34, 31, 28]
  const mk = (key: string, relation: RelationKind, age: number, relationship: number, traits: string[]): CastSpec => ({ key, relation, age, relationship, traits, money: 30_000 })
  const s = scene(tuple, {
    character: { age: opts.age ?? 62, money: opts.money ?? 5_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } },
    cast: [
      mk('spouse', 'spouse', opts.spouse ?? 60, 80, opts.spouseTraits ?? ['calm', 'loyal']),
      mk('a', 'child', ka, 75, ['kind', 'calm']),
      mk('b', 'child', kb, 70, ['hot-headed', 'jealous']),
      mk('c', 'child', kc, 60, ['funny', 'outgoing']),
      // b is the third person of the scene, p3.
      ...(opts.grandkids ?? []).map((age, i): CastSpec => ({ key: `gk${i}`, relation: 'grandchild', age, relationship: 70, traits: ['funny', 'calm'], money: 0, data: { parentId: 'p3' } })),
    ],
  })
  if (s.who.b!.id !== 'p3') throw new Error('fam: b is no longer p3')
  for (const p of s.g.people) p.yearsKnown = Math.min(p.age, 30)
  s.g.log = [{ age: s.g.character.age, year: s.g.year, entries: [] }]
  if (opts.fame !== undefined) s.g.character.hidden.fame = opts.fame
  return s
}

/** The state of one relative's feelings, as a short list: anger, stage, cold, estranged, known, cut, hard. */
const feel = (g: GameState, p: Person): number[] => {
  const w = readWl(g, p)
  return [w.anger, w.stage, w.cold ? 1 : 0, w.estr ? 1 : 0, w.known ? 1 : 0, w.cut ? 1 : 0, w.hard]
}

const feelings =
  (...who: Person[]): Extra =>
  (g) => ({ w: who.map((p) => feel(g, p)), h: g.character.stats.happiness })

/** One year as the game turns it, then the feud hook. */
function nextYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  g.yearActions = {}
  for (const p of g.people) if (p.alive) p.age += 1
  yearlyWillFeuds(g)
}

/** Writes someone out of the will for real, the way the menu does, and answers the popup that asks how to tell them. */
function cut(g: GameState, p: Person, tell: 'kind' | 'blunt' | 'letter' | 'silent' | null): void {
  const report = changeWill(g, (gg, w) => removeHeir(gg, w, p))
  queueTells(g, report)
  if (tell !== null) {
    const i = g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === 'will.tell')
    if (i >= 0) {
      const m = g.queue.splice(i, 1)[0] as ChoiceModal
      runScript(g, m.scriptId!, tell, m.data, m)
    }
  }
  g.queue = []
}

/** Writes someone out and lets them know, with a chosen anger (the state the make-up rows start from). */
function cutKnown(g: GameState, p: Person, anger: number): void {
  changeWill(g, (gg, w) => removeHeir(gg, w, p))
  g.queue = []
  updateWl(g, p, (w) => {
    w.known = true
    w.how = 'leak'
    w.knownY = g.year
    w.told = 'out'
    w.anger = anger
  })
}

/** Answers the first popup of a script in the queue: a choice with its id, an input with its value. */
function answer(g: GameState, scriptId: string, value: string): void {
  const i = g.queue.findIndex((m) => (m.kind === 'choice' || m.kind === 'input') && m.scriptId === scriptId)
  if (i < 0) throw new Error(`no pending ${scriptId}; queue: ${queueKinds(g).join(',')}`)
  const m = g.queue.splice(i, 1)[0] as ChoiceModal | InputModal
  runScript(g, scriptId, value, m.data, m)
}

/** Reads from a state that cannot be written to and cannot draw: the clone's people, in the order of the original's. */
function frozenView<R>(g: GameState, fn: (f: GameState, people: Person[]) => R): R {
  const f = deepFreeze(trapRng(structuredClone(g)))
  return fn(f, f.people)
}

/** The menu row of a relative's sheet by id, or the reason it is not there. */
function act(g: GameState, p: Person, id: string, input?: string): 'ok' | 'absent' | 'hidden' | 'disabled' {
  const a = personActions(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === id)
  if (a === undefined) return 'absent'
  if (a.visible !== undefined && !a.visible(g)) return 'hidden'
  if (a.disabledReason?.(g)) return 'disabled'
  a.run(g, input)
  return 'ok'
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 1: how angry, by how they learn

const LEARN: readonly Learn[] = ['kind', 'blunt', 'letter', 'now', 'leak', 'relative', 'dinner', 'reading', 'external']
const RELATIONS: readonly RelationKind[] = ['spouse', 'child', 'stepchild', 'grandchild', 'parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'friend', 'bestFriend']
const TEMPERS: Record<string, string[]> = { plain: ['funny', 'outgoing'], forgiving: ['kind', 'calm'], petulant: ['hot-headed', 'jealous'] }

/** A scene with one relative to read and a player with an estate. */
function oneRelative(money = 5_000_000): { s: Scene; p: Person } {
  const s = scene([61, 2026], { character: { age: 62, money, countryId: 'us' }, cast: [{ key: 'p', relation: 'child', age: 30, relationship: 60, money: 30_000, traits: ['funny', 'outgoing'] }] })
  s.g.people[0]!.yearsKnown = 20
  return { s, p: s.who.p! }
}

/** Sets the feelings a row starts from. */
const feelWith = (g: GameState, p: Person, over: Partial<Wl>): void => void updateWl(g, p, (w) => void Object.assign(w, over))

function learnRows(): ParityRow[] {
  const rows: ParityRow[] = []
  const allWays = (g: GameState): { a: number[] } => frozenView(g, (f, people) => ({ a: LEARN.map((how) => angerOnLearning(f, people[0]!, how)) }))
  {
    // 1. Who they are to you, how close, how they take things.
    const { s, p } = oneRelative()
    for (const relation of RELATIONS) {
      for (const rel of [25, 80]) {
        for (const [name, traits] of Object.entries(TEMPERS)) {
          s.step(`learn|${relation}|${rel}|${name}`, () => {
            p.relation = relation
            p.relationship = rel
            p.traits = [...traits]
          }, allWays)
        }
      }
    }
    rows.push(...s.rows)
  }
  {
    // 2. What they were told and what happened to the will before: a promise, a history, a restoration, a letter in advance.
    const { s, p } = oneRelative()
    const states: [string, Partial<Wl>][] = [
      ['blank', {}],
      ['was', { was: true }],
      ['toldIn', { told: 'in' }],
      ['restored2', { was: true, restores: 2 }],
      ['letter', { explained: 'letter' }],
      ['kind', { explained: 'kind', was: true }],
    ]
    for (const [name, over] of states) {
      s.step(`learn|state|${name}`, (g) => {
        delete p.data.wl
        feelWith(g, p, over)
      }, allWays)
    }
    rows.push(...s.rows)
  }
  {
    // 3. The stake: how spoiled, how much is at stake, how much they need it (their own cash), their age.
    const { s, p } = oneRelative()
    for (const relation of ['child', 'sibling', 'spouse'] as const) {
      for (const ent of [0, 45, 80]) {
        for (const estate of [30_000, 1_500_000, 400_000_000]) {
          s.step(`learn|stake|${relation}|${ent}|${estate}`, (g) => {
            p.relation = relation
            p.relationship = 60
            p.data.entitlement = ent
            g.character.money = estate
          }, (g) => {
            const a: number[] = []
            for (const age of [10, 16, 30]) {
              for (const cash of [0, 30_000, 3_000_000, 4_000_000_000]) {
                p.age = age
                p.money = cash
                a.push(...frozenView(g, (f, people) => (['kind', 'blunt', 'reading'] as const).map((how) => angerOnLearning(f, people[0]!, how))))
              }
            }
            return { a }
          })
        }
      }
    }
    rows.push(...s.rows)
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 2: the rest of the model

const RELS = [10, 40, 70, 100]
const CASE_TEMPERS = Object.entries(TEMPERS)

function modelRows(): ParityRow[] {
  const rows: ParityRow[] = []
  // angerDrift: a yearly change in anger, by temper, closeness, an explanation, hardening, the will and estrangement.
  {
    const { s, p } = oneRelative()
    for (const [name, traits] of CASE_TEMPERS) {
      for (const rel of RELS) {
        s.step(`model|drift|${name}|${rel}`, () => {
          p.traits = [...traits]
          p.relationship = rel
        }, (g) => {
          const a: number[] = []
          for (const explained of ['', 'kind'] as const) for (const hard of [0, 1, 2, 3]) for (const inWill of [false, true]) for (const estr of [false, true]) a.push(angerDrift(p, { ...readWl(g, p), explained, hard, estr }, inWill))
          return { a }
        })
      }
    }
    // peaceOdds: the honest talk's odds, by temper, closeness, how angry, an explanation, hardening and estrangement.
    for (const [name, traits] of CASE_TEMPERS) {
      for (const rel of RELS) {
        s.step(`model|peace|${name}|${rel}`, () => {
          p.traits = [...traits]
          p.relationship = rel
        }, (g) => {
          const a: number[] = []
          for (const anger of [0, 30, 70]) for (const explained of ['', 'kind'] as const) for (const hard of [0, 2]) for (const estr of [false, true]) {
            feelWith(g, p, { anger, explained, hard, estr })
            a.push(frozenView(g, (f, people) => peaceOdds(f, people[0]!)))
          }
          return { a }
        })
      }
    }
    // giftRelief: the anger a check takes off, by the estate, temper, the kind of relative, spoiling, the amount and the tries before.
    for (const estate of [50_000, 3_000_000, 300_000_000]) {
      for (const [name, traits] of CASE_TEMPERS) {
        for (const relation of ['child', 'sibling'] as const) {
          s.step(`model|gift|${estate}|${name}|${relation}`, (g) => {
            p.relation = relation
            p.traits = [...traits]
            p.relationship = 60
            g.character.money = estate
            delete p.data.wl
          }, (g) => {
            const a: number[] = []
            for (const buys of [0, 1, 3]) {
              feelWith(g, p, { buys })
              for (const amount of [1, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000]) a.push(frozenView(g, (f, people) => giftRelief(f, people[0]!, amount)))
            }
            return { a }
          })
        }
      }
    }
    for (const ent of [0, 50, 100]) {
      s.step(`model|gift|spoiled|${ent}`, (g) => {
        p.relation = 'child'
        p.traits = ['funny', 'outgoing']
        p.data.entitlement = ent
        g.character.money = 3_000_000
        delete p.data.wl
      }, (g) => ({ a: [1, 1_000, 100_000, 5_000_000].map((amount) => frozenView(g, (f, people) => giftRelief(f, people[0]!, amount))) }))
    }
    rows.push(...s.rows)
  }
  // angerAfterShare is a function of two numbers.
  {
    const { s } = oneRelative()
    s.step('model|share', () => undefined, () => {
      const a: number[][] = []
      for (const anger of [0, 7, 25, 50, 75, 100, 250, -5]) a.push([10, 25, 50, 75, 90, 100, 150, -20].map((share) => angerAfterShare(anger, share)))
      return { a }
    })
    rows.push(...s.rows)
  }
  // contestOdds: the court's odds by role, how long ago the will changed, an explanation, being told five years ago, a prenup.
  {
    const { s, p } = oneRelative()
    const cases: [string, RelationKind, number, boolean][] = [
      ['spouse', 'spouse', 60, false],
      ['spousePrenup', 'spouse', 60, true],
      ['child', 'child', 30, false],
      ['childMinor', 'child', 12, false],
      ['stepchild', 'stepchild', 30, false],
      ['stepchildMinor', 'stepchild', 12, false],
      ['grandchild', 'grandchild', 20, false],
      ['parent', 'parent', 85, false],
      ['sibling', 'sibling', 60, false],
      ['friend', 'bestFriend', 60, false],
    ]
    for (const [name, relation, age, prenup] of cases) {
      s.step(`model|contest|${name}`, () => {
        p.relation = relation
        p.age = age
        p.data.prenup = prenup
        if (!prenup) delete p.data.prenup
      }, (g) => {
        const a: number[] = []
        for (const since of [0, 2, 6, -1]) {
          for (const explained of ['', 'kind', 'letter'] as const) {
            for (const toldOut of [false, true]) {
              writeWill(g, { ...readWill(g), written: since >= 0, changed: since >= 0 ? g.year - since : 0 })
              delete p.data.wl
              feelWith(g, p, { explained, told: toldOut ? 'out' : '', cutY: toldOut ? g.year - 6 : 0 })
              a.push(frozenView(g, (f, people) => contestOdds(f, people[0]!)))
            }
          }
        }
        return { a }
      })
    }
    rows.push(...s.rows)
  }
  // contestOdds when one favoured heir takes it all and the player is very old or not themselves.
  {
    const s = scene([62, 2026], {
      character: { age: 80, money: 5_000_000, countryId: 'us' },
      cast: [{ key: 'p', relation: 'sibling', age: 60, relationship: 60, money: 1000 }, { key: 'heir', relation: 'child', age: 40, relationship: 90, money: 1000 }],
    })
    const { p, heir } = s.who
    s.step('model|contest|sole', (g) => {
      changeWill(g, (gg, w) => {
        gg.character.willBeneficiaries = [heir!.id]
        w.shares = {}
      })
      g.queue = []
    }, (g) => {
      const a: number[] = []
      for (const age of [70, 80]) {
        for (const alzheimer of [false, true]) {
          for (const closeness of [80, 90]) {
            g.character.age = age
            g.character.conditions = alzheimer ? ([{ name: "Alzheimer's" }] as never) : []
            heir!.relationship = closeness
            a.push(frozenView(g, (f, people) => contestOdds(f, people[f.people.findIndex((x) => x.id === p!.id)]!)))
          }
        }
      }
      return { a }
    })
    rows.push(...s.rows)
  }
  // The will rows of a relative's sheet: which exist, which are disabled. A read of a frozen state.
  {
    const s = fam([63, 2026])
    const { a, b } = s.who
    const sheet = (who: Person): Extra => (g) =>
      frozenView(g, (f, people) => {
        const q = people[g.people.indexOf(who)]!
        const nodes = personActions(f, q).filter((n) => n.id.startsWith('will.'))
        return { ids: nodes.map((n) => n.id), dis: nodes.map((n) => (n.type === 'action' && n.disabledReason?.(f) ? 1 : 0)), vis: nodes.map((n) => (n.type === 'action' && n.visible && !n.visible(f) ? 0 : 1)) }
      })
    s.step('model|sheet|nothing', () => undefined, sheet(b!))
    s.step('model|sheet|cutUnknown', (g) => cut(g, b!, 'silent'), sheet(b!))
    s.step('model|sheet|cutKnown', (g) => {
      updateWl(g, b!, (w) => {
        w.known = true
        w.how = 'leak'
        w.told = 'out'
        w.anger = 55
      })
    }, sheet(b!))
    s.step('model|sheet|bothButAngry', (g) => {
      cutKnown(g, a!, 30)
      updateWl(g, a!, (w) => void (w.explained = 'kind'))
    }, sheet(a!))
    s.step('model|sheet|estranged', (g) => {
      estrange(g, b!)
      updateWl(g, b!, (w) => void (w.anger = 40))
    }, sheet(b!))
    s.step('model|sheet|estrangedAngry', (g) => void updateWl(g, b!, (w) => void (w.anger = 60)), sheet(b!))
    s.step('model|sheet|nodes', () => undefined, (g) => ({ n: willPersonNodes(g, b!).length }))
    rows.push(...s.rows)
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 3: four fifteen-year feuds

const YEARS = 15

/** What the scripted lives ended as, for the checks at the end of the file. */
const FACTS: { spouseEnd: string } = { spouseEnd: '' }

/** Plays a feud: the setup steps, then fifteen years of the hook with the relatives' feelings recorded each year. */
function feud(name: string, s: Scene, who: Person[], setup: (g: GameState) => void): ParityRow[] {
  const x = feelings(...who)
  s.step(`feud|${name}|cut`, setup, x)
  for (let y = 1; y <= YEARS; y++) {
    s.step(`feud|${name}|${String(y).padStart(2, '0')}`, nextYear, x)
    s.g.queue = []
  }
  return s.rows
}

// Searched once for the path each covers (the checks at the end of the file name them).
const TUPLES = {
  kind: [101, 2026],
  hot: [102, 2026],
  spouse: [14, 2026],
  famous: [104, 2026],
} satisfies Record<string, Tuple>

function feudRows(): ParityRow[] {
  const rows: ParityRow[] = []
  {
    // A kind child, told kindly: the anger cools.
    const s = fam(TUPLES.kind)
    const { spouse, a, b, c } = s.who
    rows.push(...feud('kind', s, [spouse!, a!, b!, c!], (g) => cut(g, a!, 'kind')))
  }
  {
    // A hothead, told bluntly: the cold shoulder, the badmouthing, a confrontation, the break.
    const s = fam(TUPLES.hot)
    const { spouse, a, b, c } = s.who
    b!.data.entitlement = 60
    rows.push(...feud('hot', s, [spouse!, a!, b!, c!], (g) => cut(g, b!, 'blunt')))
  }
  {
    // A spouse written out: the ultimatum, and sometimes the lawyer.
    const s = fam(TUPLES.spouse, { money: 8_000_000, spouseTraits: ['hot-headed', 'jealous'] })
    const { spouse, a, b, c } = s.who
    rows.push(
      ...feud('spouse', s, [spouse!, a!, b!, c!], (g) => {
        // The default will names the children, so the spouse is named first and written out after.
        changeWill(g, (gg, w) => addHeir(gg, w, spouse!, 100))
        g.queue = []
        cut(g, spouse!, 'blunt')
      }),
    )
    FACTS.spouseEnd = spouse!.relation
  }
  {
    // A famous player whose child has children: the papers, the grandchildren in the middle, the olive branch.
    const s = fam(TUPLES.famous, { fame: 60, grandkids: [6, 9] })
    const { spouse, a, b, c } = s.who
    rows.push(...feud('famous', s, [spouse!, a!, b!, c!], (g) => cut(g, b!, 'blunt')))
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 4: every way back

// Searched once: a heart-to-heart is a draw, and these three dice make it work and fail for both the kind child and the hothead, so
// both outcomes are on file.
const AMEND_TUPLES: readonly Tuple[] = [
  [110, 2026],
  [118, 2026],
  [121, 2026],
]

function amendRows(): ParityRow[] {
  const rows: ParityRow[] = []
  // 1. The rows of a cut-out relative's sheet, each in a fresh life, for a mild and a bitter start.
  const rowsOfSheet: { id: string; input?: string }[] = [
    { id: 'will.peace' },
    { id: 'will.explain' },
    { id: 'will.restore' },
    { id: 'will.compromise', input: '25' },
    { id: 'will.compromise', input: '50' },
    { id: 'will.compromise', input: '90' },
    { id: 'will.gift', input: '500' },
    { id: 'will.gift', input: '60000' },
    { id: 'will.gift', input: '1000000' },
  ]
  AMEND_TUPLES.forEach((tuple, ti) => {
    for (const anger of [40, 70]) {
      for (const row of rowsOfSheet) {
        const s = fam(tuple)
        const { spouse, a, b, c } = s.who
        cutKnown(s.g, b!, anger)
        let result = ''
        const before = readWl(s.g, b!).anger
        s.step(`amend|sheet|t${ti}|${anger}|${row.id}${row.input ? `@${row.input}` : ''}`, (g) => {
          result = act(g, b!, row.id, row.input)
          g.queue = g.queue.filter((m) => m.kind !== 'notice')
        }, (g) => ({ ...feelings(spouse!, a!, b!, c!)(g), r: result, da: readWl(g, b!).anger - before, in: readWill(g).shares[b!.id] ?? 0, inl: g.character.willBeneficiaries.includes(b!.id) ? 1 : 0, buys: readWl(g, b!).buys }))
        rows.push(...s.rows)
      }
      // Money twice in one year: the second is turned down; and the next year, when it works less well.
      const s = fam(tuple)
      const { spouse, a, b, c } = s.who
      cutKnown(s.g, b!, anger)
      let result = ''
      const x: Extra = (g) => ({ ...feelings(spouse!, a!, b!, c!)(g), r: result, buys: readWl(g, b!).buys })
      s.step(`amend|sheet|t${ti}|${anger}|gift1`, (g) => void (result = act(g, b!, 'will.gift', '60000')), x)
      s.step(`amend|sheet|t${ti}|${anger}|gift2same`, (g) => void (result = act(g, b!, 'will.gift', '60000')), x)
      s.step(`amend|sheet|t${ti}|${anger}|gift3next`, (g) => {
        g.year += 1
        result = act(g, b!, 'will.gift', '60000')
      }, x)
      s.step(`amend|sheet|t${ti}|${anger}|peace2same`, (g) => {
        result = act(g, b!, 'will.peace')
        result += act(g, b!, 'will.peace')
      }, x)
      rows.push(...s.rows)
    }
    // A forgiving child takes a heart-to-heart far better.
    for (const anger of [40, 70]) {
      const s = fam(tuple)
      const { spouse, a, b, c } = s.who
      cutKnown(s.g, a!, anger)
      let result = ''
      const before = readWl(s.g, a!).anger
      s.step(`amend|kind|t${ti}|${anger}|will.peace`, (g) => {
        result = act(g, a!, 'will.peace')
        g.queue = g.queue.filter((m) => m.kind !== 'notice')
      }, (g) => ({ ...feelings(spouse!, a!, b!, c!)(g), r: result, da: readWl(g, a!).anger - before }))
      rows.push(...s.rows)
    }
    // 2. Reaching out to an estranged child: the door is open below an anger of 56.
    for (const anger of [20, 45, 60]) {
      const s = fam(tuple)
      const { spouse, a, b, c } = s.who
      cutKnown(s.g, b!, anger)
      estrange(s.g, b!)
      s.g.queue = []
      updateWl(s.g, b!, (w) => void (w.anger = anger))
      let result = ''
      s.step(`amend|reach|t${ti}|${anger}`, (g) => {
        result = act(g, b!, 'will.peace')
        g.queue = []
      }, (g) => ({ ...feelings(spouse!, a!, b!, c!)(g), r: result }))
      rows.push(...s.rows)
    }
  })
  // 3. The scenes. Each answer starts from the same life.
  const scenes: { name: string; script: string; make: (tuple: Tuple) => Scene; open: (s: Scene) => void; paths: string[][]; money?: boolean }[] = [
    {
      name: 'tell',
      script: 'will.tell',
      make: (t) => fam(t),
      open: (s) => {
        changeWill(s.g, (gg, w) => removeHeir(gg, w, s.who.b!))
        queueTells(s.g, { tell: [s.who.b!] })
        s.g.queue = s.g.queue.filter((m) => m.kind === 'choice')
      },
      paths: [['kind'], ['blunt'], ['letter'], ['silent']],
    },
    {
      name: 'confront',
      script: 'will.confront',
      make: (t) => fam(t),
      open: (s) => {
        cutKnown(s.g, s.who.b!, 60)
        updateTies(s.g, s.who.b!, (t) => void (t.allowance = 6_000))
        queueConfront(s.g, s.who.b!)
      },
      paths: [['explain'], ['restore'], ['double'], ['cutoff'], ['refuse'], ['buy', 'a0'], ['buy', 'a1'], ['buy', 'a2'], ['buy', 'no'], ['compromise', '25'], ['compromise', '60'], ['compromise', '90']],
    },
    {
      name: 'spouse',
      script: 'will.spouse',
      make: (t) => fam(t, { money: 8_000_000 }),
      open: (s) => {
        cutKnown(s.g, s.who.spouse!, 80)
        queueSpouseUltimatum(s.g, s.who.spouse!)
      },
      paths: [['restore'], ['settle'], ['counsel'], ['bluff']],
    },
    {
      name: 'press',
      script: 'will.press',
      make: (t) => fam(t, { fame: 60 }),
      open: (s) => {
        cutKnown(s.g, s.who.b!, 70)
        queuePress(s.g, s.who.b!)
      },
      paths: [['pr'], ['statement'], ['ignore']],
    },
    {
      name: 'grandkids',
      script: 'will.grandkids',
      make: (t) => fam(t, { grandkids: [7] }),
      open: (s) => {
        cutKnown(s.g, s.who.b!, 60)
        queueGrandkids(s.g, s.who.b!, s.who.gk0!)
      },
      paths: [['love'], ['blame'], ['dodge']],
    },
    {
      name: 'olive',
      script: 'will.olive',
      make: (t) => fam(t),
      open: (s) => {
        cutKnown(s.g, s.who.b!, 20)
        estrange(s.g, s.who.b!)
        s.g.queue = []
        queueOlive(s.g, s.who.b!)
      },
      paths: [['accept'], ['later'], ['refuse']],
    },
  ]
  const nextScript: Record<string, string> = { buy: 'will.confront.buy', compromise: 'will.confront.share' }
  scenes.forEach((sc) => {
    AMEND_TUPLES.slice(0, 2).forEach((tuple, ti) => {
      for (const path of sc.paths) {
        const s = sc.make(tuple)
        sc.open(s)
        const { spouse, a, b, c } = s.who
        s.step(`amend|${sc.name}|t${ti}|${path.join('>')}`, (g) => {
          answer(g, sc.script, path[0]!)
          if (path[1] !== undefined) answer(g, nextScript[path[0]!]!, path[1])
        }, feelings(spouse!, a!, b!, c!))
        rows.push(...s.rows)
      }
    })
  })
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 5: the toggle-farm loop

function toggleRows(): ParityRow[] {
  const rows: ParityRow[] = []
  const series: [string, Tuple, 'a' | 'b', number][] = [
    ['hotFull', [121, 2026], 'b', 100],
    ['hotHalf', [122, 2026], 'b', 50],
    ['kindFull', [123, 2026], 'a', 100],
  ]
  for (const [name, tuple, key, share] of series) {
    const s = fam(tuple)
    const p = s.who[key]!
    const x: Extra = (g) => ({ ...feelings(p)(g), flips: readWl(g, p).flips, rest: readWl(g, p).restores, buys: readWl(g, p).buys, rel: p.relationship })
    s.step(`toggle|${name}|first`, (g) => cut(g, p, 'blunt'), x)
    for (let i = 1; i <= 8; i++) {
      s.step(`toggle|${name}|${i}|back`, (g) => {
        g.year += 1
        changeWill(g, (gg, w) => addHeir(gg, w, p, share))
        g.queue = []
      }, x)
      s.step(`toggle|${name}|${i}|out`, (g) => {
        changeWill(g, (gg, w) => removeHeir(gg, w, p))
        g.queue = []
        if (!readWl(g, p).known) learn(g, p, 'now')
      }, x)
    }
    rows.push(...s.rows)
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 6: the estate and the reading

interface Estate {
  name: string
  kids?: [number, number, number]
  heir: 'a' | 'b' | 'c'
  prepare: (s: Scene) => void
}

const ESTATES: readonly Estate[] = [
  { name: 'even', heir: 'a', prepare: () => undefined },
  {
    name: 'cutB',
    heir: 'a',
    prepare: (s) => {
      const b = s.who.b!
      b.traits = ['hot-headed', 'arrogant']
      b.data.entitlement = 80
      cutKnown(s.g, b, 85)
    },
  },
  {
    name: 'charity',
    heir: 'a',
    prepare: (s) => {
      changeWill(s.g, (gg, w) => {
        addHeir(gg, w, s.who.spouse!, 100)
        w.charity = 25
      })
      cutKnown(s.g, s.who.c!, 70)
    },
  },
  {
    name: 'heirOut',
    heir: 'a',
    prepare: (s) => {
      changeWill(s.g, (gg, w) => {
        gg.character.willBeneficiaries = [s.who.c!.id]
        w.shares = {}
      })
      s.g.queue = []
    },
  },
  {
    name: 'minor',
    kids: [50, 47, 12],
    heir: 'a',
    prepare: (s) => cutKnown(s.g, s.who.c!, 60),
  },
]

const ESTATE_TUPLES: readonly Tuple[] = [
  [131, 2026],
  [132, 2026],
  [133, 2026],
]

/** The old player's death, as the game does it, with the setup of the scenario done first. */
function dyingFamily(e: Estate, tuple: Tuple): Scene {
  const s = fam(tuple, { money: 20_000_000, age: 78, spouse: 76, kids: e.kids ?? [50, 47, 44] })
  e.prepare(s)
  s.g.queue = []
  killCharacter(s.g, 'Old Age')
  s.g.queue = s.g.queue.filter((m) => m.kind !== 'aiTask')
  return s
}

function estateRows(): ParityRow[] {
  const rows: ParityRow[] = []
  for (const e of ESTATES) {
    ESTATE_TUPLES.forEach((tuple, ti) => {
      {
        // The plan, on a copy: who is out, how angry they are, who goes to court and how it ends.
        const s = dyingFamily(e, tuple)
        const n = structuredClone(s.g)
        const heirId = s.who[e.heir]!.id
        const plan = planEstate(n, { estate: n.character.money, heirId, adult: n.people.find((p) => p.id === heirId)!.age >= 18, hasProperty: false, cashAfterDebts: n.character.money })
        rows.push(
          snapshot(`est|${e.name}|t${ti}|plan`, n, () => ({
            plan: [plan.willed ? 1 : 0, plan.heirIncluded ? 1 : 0, plan.ways, plan.keepProperty ? 1 : 0, plan.tax, plan.fees, plan.heirCash, plan.held, plan.charityCash, plan.carried],
            out: plan.cutOut.map((c) => [n.people.findIndex((x) => x.id === c.id), c.anger, c.filed ? 1 : 0, c.outcome, c.award]),
            claim: plan.heirClaim ? [plan.heirClaim.claim, plan.heirClaim.odds, plan.heirClaim.fee] : null,
            w: n.people.map((x) => readWl(n, x).anger),
            cash: n.people.map((x) => x.money),
          })),
        )
      }
      {
        // The reading, from the heir's seat: the family's feelings, the sibling who asks for a share, the case.
        const s = dyingFamily(e, tuple)
        const heirId = s.who[e.heir]!.id
        const next = continueAsChild(s.g, heirId)
        rows.push(
          snapshot(`est|${e.name}|t${ti}|read`, next, (h) => ({
            esc: h.flags['will.escrow'] ?? null,
            pot: h.flags['will.pot'] ? 1 : 0,
            ask: h.queue.some((m) => m.kind === 'choice' && m.scriptId === 'will.estate.ask') ? 1 : 0,
            heirQ: h.queue.some((m) => m.kind === 'choice' && m.scriptId === 'will.estate.heir') ? 1 : 0,
            reading: h.queue.some((m) => m.kind === 'notice' && m.title === 'The Reading of the Will') ? 1 : 0,
            cash: h.people.map((p) => p.money),
          })),
        )
      }
    })
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------

let played: ParityRow[] | null = null

/** Every part, played once per file. */
function playFresh(): ParityRow[] {
  return [...learnRows(), ...modelRows(), ...feudRows(), ...amendRows(), ...toggleRows(), ...estateRows()]
}

function playAll(): ParityRow[] {
  if (played === null) played = playFresh()
  return played
}

const rowsOf = (prefix: string): ParityRow[] => playAll().filter((r) => r.label.startsWith(prefix))
const xw = (r: ParityRow, who: number): number[] => (r.x as { w: number[][] }).w[who]!
const popups = (r: ParityRow): string[] => r.queue.filter((k) => k.startsWith('choice:'))

describe('the will oracle', () => {
  it('the rows are the recorded ones', () => {
    const rows = playAll()
    if (isRecording(ORACLE.area)) recordRows(ORACLE, rows)
    else expectRows(ORACLE, rows)
  })

  it('plays the same rows on a stamped life: the mirror follows every number and moves none (R4-E7)', { timeout: 120_000 }, () => {
    const rows = withStamped(playFresh)
    expectRows(ORACLE, rows)
    expect(stampStats().stamped, 'the replay must stamp games').toBeGreaterThan(0)
    expect(stampStats().checked, 'the replay must check the mirror').toBeGreaterThan(0)
  })

  it('plays the four feuds to the ends they are there to cover', () => {
    // A kind child told kindly cools to nothing, with no scene at all.
    const kind = rowsOf('feud|kind|')
    expect(xw(kind[kind.length - 1]!, 1)[0]).toBe(0)
    expect(kind.flatMap(popups)).toEqual([])
    // A hothead told bluntly goes cold, is confronted and breaks contact.
    const hot = rowsOf('feud|hot|')
    expect(hot.some((r) => xw(r, 2)[3] === 1)).toBe(true)
    expect(hot.flatMap(popups)).toContain('choice:will.confront')
    // A spouse gets the ultimatum and leaves.
    const spouse = rowsOf('feud|spouse|')
    expect(spouse.flatMap(popups)).toContain('choice:will.spouse')
    expect(FACTS.spouseEnd).not.toBe('spouse')
    // A famous player reads about it in the papers and tells the grandchildren.
    const famous = rowsOf('feud|famous|').flatMap(popups)
    expect(famous).toContain('choice:will.press')
    expect(famous).toContain('choice:will.grandkids')
  })

  it('queues at most one scene a year in any feud (the will shares nothing with the other families yet)', () => {
    for (const r of rowsOf('feud|')) expect(popups(r).length, r.label).toBeLessThanOrEqual(1)
  })

  it('lets a heart-to-heart get through and fail, and money work once a year', () => {
    const peace = [...rowsOf('amend|sheet|'), ...rowsOf('amend|kind|')].filter((r) => r.label.endsWith('|will.peace'))
    const das = peace.map((r) => (r.x as { da: number }).da)
    expect(das.some((d) => d < 0)).toBe(true)
    expect(das.some((d) => d >= 0)).toBe(true)
    const second = rowsOf('amend|sheet|').filter((r) => r.label.endsWith('|gift2same'))
    expect(second.length).toBeGreaterThan(0)
    for (const r of second) expect((r.x as { r: string }).r).toBe('disabled')
  })

  it('does not let the toggle farm trust: every restore buys less than the cut cost', () => {
    for (const name of ['hotFull', 'hotHalf', 'kindFull']) {
      const rows = rowsOf(`toggle|${name}|`)
      const rel = (r: ParityRow): number => (r.x as { rel: number }).rel
      const first = rel(rows[0]!)
      const backs = rows.filter((r) => r.label.endsWith('|back')).map(rel)
      const outs = rows.filter((r) => r.label.endsWith('|out')).map(rel)
      for (let i = 0; i < backs.length; i++) {
        expect(backs[i], `${name} restore ${i + 1}`).toBeLessThanOrEqual(i === 0 ? first + 10 : backs[i - 1]!)
        expect(outs[i]!, `${name} cut ${i + 1}`).toBeLessThanOrEqual(backs[i]!)
        if (backs[i]! > 0) expect(outs[i]!, `${name} cut ${i + 1}`).toBeLessThan(backs[i]!)
      }
    }
  })

  it('reads the will of a dead player with a court case, an angry sibling and a cut-out heir', () => {
    const plans = rowsOf('est|').filter((r) => r.label.endsWith('|plan'))
    const outcomes = new Set(plans.flatMap((r) => (r.x as { out: (number | string)[][] }).out.map((o) => o[3])))
    expect(outcomes.has('won')).toBe(true)
    expect(outcomes.has('lost')).toBe(true)
    const reads = rowsOf('est|').filter((r) => r.label.endsWith('|read')).map((r) => r.x as { ask: number; heirQ: number; esc: unknown; reading: number })
    expect(reads.some((x) => x.ask === 1)).toBe(true)
    expect(reads.some((x) => x.heirQ === 1)).toBe(true)
    expect(reads.some((x) => x.esc !== null)).toBe(true)
    expect(reads.some((x) => x.reading === 0)).toBe(true)
  })
})
