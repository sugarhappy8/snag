// ci: fast
// R4-E2 (X2, X30): the golden of love.ts. The sister of test/relationship-parity.test.ts: the same kit (test/social-parity-kit.ts),
// the same rule (R4-E5 changes how a relationship moves and nothing else, so every row recorded here on the unmodified engine must
// come out the same), the other half of the code: dating, break-ups, proposals, weddings, pregnancy, counseling, divorce. A row holds
// each person's relationship, g.rng, g.nextId, the queue (kinds, no text), the player's cash and a few facts of the area; no text.
//
//   chain|<name>|<step>   scripted chains, one scene each, with a checkpoint assertion after every step: the person is who the chain
//                         says (a partner, a fiance, a spouse), the popup the next step answers is in the queue. A path a change
//                         closes (a proposal refused at relationship 67 was one, in a scratch run) fails loudly there, not as a
//                         quiet different row. The tuples were searched once so each chain takes the branch it is named for.
//   ask|...               askOut over relationship, looks, traits and the person's history (accepted and refused rows)
//   ring|...              proposals: every ring at four relationships and two lengths of courtship
//   split|...             divorce settlements: both sides, with and without a prenup, over what each owns, and a house
//   counsel|elope|baby|love|hook|break|vows|plan   the smaller grids: counseling, eloping, trying for a baby, making love, hooking
//                         up behind a partner's back (by era), break-ups, partner proposals, the wait-until-marriage popup
//   marriage|...          20 years of a marriage through yearlyRelationships (partnerDrama: leaving, cheating, the proposal, the
//                         money, the baby), every popup of the year answered
//   read|...              the pure readers of love.ts under frozenGame: the odds and lists, with g.rng trapped
//
// Record (Node 22, on a tree whose src/ equals HEAD):
//   RECORD_SOCIAL_PARITY=love RECORD_REASON="why the rows are recorded" wt/bin/vt22 test/love-parity.test.ts
// Record twice and diff: the files are byte-identical. Nobody edits the file by hand and nobody merges it (X2).
import { describe, expect, it } from 'vitest'
import { currentPartner } from '../src/game/core'
import {
  askOut,
  breakUp,
  cancelEngagement,
  cheatDetectionOdds,
  conceptionBlocker,
  couplesCounseling,
  courtshipShift,
  dateAgeRange,
  datingProblem,
  divorce,
  elope,
  fertilityFactor,
  hookUpWith,
  intimacyProblem,
  honeymoonOptions,
  loveMenu,
  makeLove,
  partnerProposes,
  playerPregnancy,
  processPregnancies,
  proposalProblem,
  proposeTo,
  renewVows,
  tryForBaby,
  weddingProblem,
  weddingVenues,
} from '../src/game/love'
import { yearlyRelationships } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, InputModal, MenuAction, Person } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import {
  cut,
  expectRows,
  isRecording,
  oracle,
  recordRows,
  runAction,
  scene,
  snapshot,
  trapRng,
  type CastSpec,
  type ParityRow,
  type Scene,
  type SceneSpec,
  type Tuple,
} from './social-parity-kit'

const ORACLE = oracle('love')

// ---------------------------------------------------------------------------------------------------------------------
// Small tools

type Answerable = ChoiceModal | InputModal

/** The queue's popup of that script, or null. */
function pending(g: GameState, scriptId: string): Answerable | null {
  const m = g.queue.find((q): q is Answerable => (q.kind === 'choice' || q.kind === 'input') && q.scriptId === scriptId)
  return m ?? null
}

/** Takes the popup of `scriptId` out of the queue and answers it. Throws when it is not there: a closed path is loud. */
function answer(g: GameState, scriptId: string, value: string): void {
  const m = pending(g, scriptId)
  if (m === null) throw new Error(`no popup ${scriptId} in the queue: ${g.queue.map((q) => ('scriptId' in q ? q.scriptId : q.kind)).join(', ') || 'empty'}`)
  g.queue.splice(g.queue.indexOf(m), 1)
  if (m.kind === 'choice' && !m.choices.some((o) => o.id === value)) throw new Error(`${scriptId} has no choice ${value}: ${m.choices.map((o) => o.id).join(', ')}`)
  runScript(g, scriptId, value, m.data, m)
}

/** The notices of earlier steps are read; only the popups that wait for an answer stay in the queue. */
function calm(g: GameState): void {
  g.queue = g.queue.filter((m) => m.kind !== 'notice')
}

/** A row of the Love menu, run the way the screen would. Throws when it is missing or disabled. */
function runLove(g: GameState, id: string): void {
  const a = loveMenu.children(g).find((n): n is MenuAction => n.type === 'action' && n.id === id)
  if (a === undefined) throw new Error(`the Love menu has no ${id}`)
  const why = a.disabledReason?.(g)
  if (why) throw new Error(`${id} is disabled: ${why}`)
  a.run(g)
}

const tupleName = (t: Tuple): string => `${t[0]}-${t[1]}`

/** One step in a fresh scene: the grids are made of these. */
function cell(label: string, tuple: Tuple, spec: SceneSpec, fn: (g: GameState, who: Record<string, Person>, s: Scene) => void, extra?: (g: GameState, who: Record<string, Person>) => Record<string, unknown>): ParityRow {
  const s = scene(tuple, spec)
  return s.step(label, (g) => fn(g, s.who, s), extra === undefined ? undefined : (g) => extra(g, s.who))
}

/** Answers every popup left in the queue the way the store does, one choice a turn, round robin by `salt`. Bounded. */
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

const HOUSE: Asset = { id: 'a1', kind: 'house', name: 'Family House', emoji: '\u{1F3E0}', purchasePrice: 200_000, value: 250_000, condition: 80, purchasedAge: 30, upkeep: 3_000, details: {} }

// ---------------------------------------------------------------------------------------------------------------------
// The chains

/** A person of the cast: 28 and female unless the chain says otherwise. */
const who = (key: string, relation: CastSpec['relation'], over: Partial<CastSpec> = {}): CastSpec => ({ key, relation, age: 28, gender: 'female', firstName: key[0]!.toUpperCase() + key.slice(1), ...over })

type Chain = (t: Tuple) => ParityRow[]

/** date: the Love menu finds someone, the player looks again, then asks, and they are together. */
const chainDate: Chain = (t) => {
  const s = scene(t, { character: { age: 24, money: 20_000 } })
  const g = s.g
  s.step('chain|date|open', () => runLove(g, 'date'))
  expect(pending(g, 'love.date.pick')).not.toBeNull()
  s.step('chain|date|next', () => answer(g, 'love.date.pick', 'next'))
  expect(pending(g, 'love.date.pick')).not.toBeNull()
  s.step('chain|date|ask', () => answer(g, 'love.date.pick', 'ask'))
  const p = currentPartner(g)
  expect(p?.relation).toBe('partner')
  calm(g)
  s.step('chain|date|time', () => runAction(g, p!, 'spendTime'), () => ({ relation: p!.relation }))
  calm(g)
  s.step('chain|date|night', () => runAction(g, p!, 'dateNight'))
  return s.rows
}

/** wedding: from the fiance's menu to a spouse, by the way of the prenup the chain names. */
function chainWedding(way: 'signed' | 'none' | 'refused-marry' | 'refused-cancel'): Chain {
  return (t) => {
    const s = scene(t, {
      character: { age: 29, money: 400_000 },
      cast: [who('fia', 'fiance', { relationship: 85, money: 20_000, lastName: 'Test', data: { datingSince: 25, engagedAge: 27, ring: 'Gold ring' }, livesWithPlayer: true })],
    })
    const g = s.g
    const fia = s.who.fia!
    const name = `chain|wedding-${way}`
    s.step(`${name}|plan`, () => runAction(g, fia, 'wedding'))
    expect(pending(g, 'love.wedding.venue')).not.toBeNull()
    calm(g)
    s.step(`${name}|venue`, () => answer(g, 'love.wedding.venue', 'backyard'))
    expect(pending(g, 'love.wedding.prenup')).not.toBeNull()
    s.step(`${name}|prenup`, () => answer(g, 'love.wedding.prenup', way === 'signed' || way.startsWith('refused') ? 'ask' : 'none'))
    if (way === 'refused-marry' || way === 'refused-cancel') {
      expect(pending(g, 'love.wedding.prenupRefused')).not.toBeNull()
      s.step(`${name}|refused`, () => answer(g, 'love.wedding.prenupRefused', way === 'refused-marry' ? 'marry' : 'cancel'))
      if (way === 'refused-cancel') {
        expect(fia.relation).toBe('partner')
        expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'love.wedding.honeymoon')).toBe(false)
        return s.rows
      }
    }
    expect(pending(g, 'love.wedding.honeymoon')).not.toBeNull()
    s.step(`${name}|honeymoon`, () => answer(g, 'love.wedding.honeymoon', way === 'none' ? 'none' : 'roadtrip'), () => ({ relation: fia.relation, prenup: fia.data.prenup ?? null }))
    expect(fia.relation).toBe('spouse')
    expect(fia.data.prenup).toBe(way === 'signed')
    expect(pending(g, 'love.wedding.surname')).not.toBeNull()
    const surname = way === 'signed' ? 'hyphen' : way === 'none' ? 'keep' : 'theirs'
    s.step(`${name}|surname`, () => answer(g, 'love.wedding.surname', surname), () => ({ last: g.character.lastName, theirs: fia.lastName }))
    return s.rows
  }
}

/** pregnancy: trying, then the birth at the next age-up, then the name; the partner carries or the player does. */
function chainPregnancy(carrier: 'them' | 'you'): Chain {
  return (t) => {
    const you = carrier === 'you'
    const s = scene(t, {
      character: { age: 29, money: 50_000, gender: you ? 'female' : 'male' },
      cast: [who('mate', 'spouse', { age: 28, gender: you ? 'male' : 'female', relationship: 80, livesWithPlayer: true, data: { datingSince: 25, marriedAge: 26 } })],
    })
    const g = s.g
    const mate = s.who.mate!
    const name = `chain|baby-${carrier}`
    s.step(`${name}|try`, () => runAction(g, mate, 'tryBaby'), () => ({ carrying: you ? playerPregnancy(g) !== null : mate.pregnant === true }))
    expect(you ? playerPregnancy(g) !== null : mate.pregnant === true).toBe(true)
    calm(g)
    s.step(`${name}|birth`, () => processPregnancies(g), () => ({ kids: g.people.filter((p) => p.relation === 'child').length }))
    expect(g.people.filter((p) => p.relation === 'child')).toHaveLength(1)
    expect(pending(g, 'love.baby.name')).not.toBeNull()
    s.step(`${name}|name`, () => answer(g, 'love.baby.name', 'ada'), () => ({ named: g.people.find((p) => p.relation === 'child')!.firstName }))
    expect(g.people.find((p) => p.relation === 'child')!.firstName).toBe('Ada')
    return s.rows
  }
}

/** counseling: the spouse goes (and the number rises) or refuses (and it falls). */
function chainCounseling(goes: boolean): Chain {
  return (t) => {
    const s = scene(t, { character: { age: 40, money: 9_000 }, cast: [who('mate', 'spouse', { age: 38, relationship: 35, livesWithPlayer: true, data: { datingSince: 30, marriedAge: 32 } })] })
    const g = s.g
    const mate = s.who.mate!
    const name = `chain|counseling-${goes ? 'goes' : 'refuses'}`
    const before = mate.relationship
    s.step(`${name}|ask`, () => runAction(g, mate, 'counseling'), () => ({ gain: mate.relationship - before }))
    if (goes) expect(mate.relationship).toBeGreaterThan(before)
    else expect(mate.relationship).toBeLessThan(before)
    calm(g)
    s.step(`${name}|again`, () => runAction(g, mate, 'counseling'))
    expect(g.yearActions[`rel.counseling.${mate.id}`]).toBe(1)
    return s.rows
  }
}

/** hook-up while partnered: the partner finds out (and stays or leaves) or does not. */
function chainHookup(how: 'hidden' | 'found-stays' | 'found-leaves'): Chain {
  return (t) => {
    const s = scene(t, {
      character: { age: 28, money: 10_000 },
      cast: [
        who('mate', 'partner', { age: 27, relationship: how === 'found-leaves' ? 50 : 80, livesWithPlayer: true, data: { datingSince: 24 } }),
        who('pal', 'friend', { age: 27, relationship: 55 }),
      ],
    })
    const g = s.g
    const mate = s.who.mate!
    const pal = s.who.pal!
    const name = `chain|hookup-${how}`
    s.step(`${name}|hook`, () => runAction(g, pal, 'hookUp'), () => ({ mate: mate.relation, cheated: g.counters.cheated ?? 0 }))
    expect(g.counters.cheated).toBe(1)
    if (how === 'hidden') expect(mate.relationship).toBe(80)
    if (how === 'found-stays') {
      expect(mate.relationship).toBeLessThan(80)
      expect(mate.relation).toBe('partner')
    }
    if (how === 'found-leaves') expect(mate.relation).toBe('ex')
    return s.rows
  }
}

/** break-up and divorce, by each side. */
const chainBreakPlayer: Chain = (t) => {
  const s = scene(t, { character: { age: 22, money: 3_000 }, cast: [who('mate', 'partner', { age: 22, relationship: 70, data: { datingSince: 20 } })] })
  const mate = s.who.mate!
  s.step('chain|breakup-player|break', (g) => runAction(g, mate, 'breakUp'), () => ({ relation: mate.relation, by: mate.data.brokeUp ?? null }))
  expect(mate.relation).toBe('ex')
  expect(mate.data.brokeUp).toBe('player')
  return s.rows
}

const chainBreakThem: Chain = (t) => {
  const s = scene(t, { character: { age: 22, money: 3_000 }, cast: [who('mate', 'fiance', { age: 22, relationship: 60, data: { datingSince: 19, engagedAge: 21, ring: 'Silver band' } })] })
  const mate = s.who.mate!
  s.step('chain|breakup-them|break', (g) => breakUp(g, mate, 'them', 'fell for someone else'), () => ({ relation: mate.relation, by: mate.data.brokeUp ?? null }))
  expect(mate.relation).toBe('ex')
  expect(mate.data.brokeUp).toBe('them')
  return s.rows
}

function chainDivorce(by: 'player' | 'them', prenup: boolean): Chain {
  return (t) => {
    const s = scene(t, { character: { age: 45, money: 700_000 }, cast: [who('mate', 'spouse', { age: 43, relationship: 40, money: 150_000, livesWithPlayer: true, data: { datingSince: 30, marriedAge: 33, prenup, tookSurname: true } })] })
    const g = s.g
    const mate = s.who.mate!
    g.assets.push({ ...HOUSE })
    g.flags.birthSurname = 'Player'
    g.character.lastName = 'Test'
    const name = `chain|divorce-${by}-${prenup ? 'prenup' : 'split'}`
    s.step(`${name}|file`, () => (by === 'player' ? runAction(g, mate, 'divorce') : divorce(g, mate, 'them')), () => ({ relation: mate.relation, spouse: mate.money, assets: g.assets.length }))
    expect(mate.relation).toBe('exSpouse')
    expect(pending(g, 'love.divorce.surname')).not.toBeNull()
    s.step(`${name}|surname`, () => answer(g, 'love.divorce.surname', 'revert'), () => ({ last: g.character.lastName }))
    expect(g.character.lastName).toBe('Player')
    return s.rows
  }
}

/** wait for marriage: the person asks to wait, and the three answers. */
function chainWait(choice: 'respect' | 'argue' | 'propose'): Chain {
  return (t) => {
    const s = scene(t, { character: { age: 26, money: 60_000 }, cast: [who('mate', 'partner', { age: 25, relationship: 70, data: { datingSince: 23, waitChecked: true, waitForMarriage: true } })] })
    const g = s.g
    const mate = s.who.mate!
    const name = `chain|wait-${choice}`
    s.step(`${name}|ask`, () => runAction(g, mate, 'makeLove'))
    expect(pending(g, 'love.makeLove.wait')).not.toBeNull()
    s.step(`${name}|answer`, () => answer(g, 'love.makeLove.wait', choice))
    if (choice === 'propose') {
      expect(pending(g, 'love.propose.ring')).not.toBeNull()
      s.step(`${name}|ring`, () => answer(g, 'love.propose.ring', 'gold'), () => ({ relation: mate.relation }))
    }
    return s.rows
  }
}

/** A stranger from the Love menu's hook-up row. */
const chainStranger: Chain = (t) => {
  const s = scene(t, { character: { age: 27, money: 5_000 } })
  const g = s.g
  s.step('chain|stranger|open', () => runLove(g, 'hookup'))
  expect(pending(g, 'love.hookup.pick')).not.toBeNull()
  s.step('chain|stranger|hook', () => answer(g, 'love.hookup.pick', 'hookup'), () => ({ people: g.people.map((p) => p.relation).join(',') }))
  expect(g.people.length).toBe(1)
  expect(g.people[0]!.relation).toBe('ex')
  return s.rows
}

/** The chains and their dice tuples. Each tuple is the first seed (year 2026) whose run passes the chain's own checkpoints, searched once at record time and constant now (X30). */
const CHAINS: readonly (readonly [name: string, chain: Chain, tuple: Tuple])[] = [
  ['date', chainDate, [3, 2026]],
  ['wedding-signed', chainWedding('signed'), [1, 2026]],
  ['wedding-none', chainWedding('none'), [1, 2026]],
  ['wedding-refused-marry', chainWedding('refused-marry'), [6, 2026]],
  ['wedding-refused-cancel', chainWedding('refused-cancel'), [6, 2026]],
  ['baby-them', chainPregnancy('them'), [2, 2026]],
  ['baby-you', chainPregnancy('you'), [2, 2026]],
  ['counseling-goes', chainCounseling(true), [1, 2026]],
  ['counseling-refuses', chainCounseling(false), [5, 2026]],
  ['hookup-hidden', chainHookup('hidden'), [1, 2026]],
  ['hookup-found-stays', chainHookup('found-stays'), [3, 2026]],
  ['hookup-found-leaves', chainHookup('found-leaves'), [12, 2026]],
  ['breakup-player', chainBreakPlayer, [1, 2026]],
  ['breakup-them', chainBreakThem, [1, 2026]],
  ['divorce-player-split', chainDivorce('player', false), [1, 2026]],
  ['divorce-them-prenup', chainDivorce('them', true), [1, 2026]],
  ['wait-respect', chainWait('respect'), [1, 2026]],
  ['wait-argue', chainWait('argue'), [1, 2026]],
  ['wait-propose', chainWait('propose'), [1, 2026]],
  ['stranger', chainStranger, [1, 2026]],
]

function playChains(): ParityRow[] {
  return CHAINS.flatMap(([, chain, tuple]) => chain(tuple))
}

// ---------------------------------------------------------------------------------------------------------------------
// ask: askOut

const TRAIT_SETS: readonly (readonly string[])[] = [['calm', 'kind'], ['flirty', 'romantic'], ['shy', 'serious']]

function playAsk(): ParityRow[] {
  const rows: ParityRow[] = []
  const cases: [string, number, number, readonly string[], boolean][] = []
  for (const start of [5, 30, 55, 80, 97]) {
    for (const looks of [20, 50, 90]) for (const traits of TRAIT_SETS) cases.push(['friend', start, looks, traits, false])
  }
  for (const start of [5, 30, 55, 80, 97]) for (const looks of [20, 50, 90]) cases.push(['ex', start, looks, TRAIT_SETS[0]!, false])
  // A married person is harder to win.
  for (const start of [30, 80]) cases.push(['coworker', start, 50, TRAIT_SETS[0]!, true])
  const tuple: Tuple = [31, 2026]
  for (const [relation, start, looks, traits, married] of cases) {
    rows.push(
      cell(
        `ask|${relation}|${start}|${looks}|${traits[0]}|${married ? 'married' : 'free'}`,
        tuple,
        { character: { age: 27, money: 5_000, stats: { happiness: 70, health: 80, smarts: 60, looks } }, cast: [who('p', relation as 'friend', { age: 26, relationship: start, traits: [...traits], data: married ? { married: true } : {} })] },
        (g, w) => askOut(g, w.p!),
        (g, w) => ({ relation: w.p!.relation, together: currentPartner(g)?.id === w.p!.id, joy: g.character.stats.happiness }),
      ),
    )
  }
  // A second dice tuple for the friend at middle looks, to see the other side of the thresholds.
  for (const start of [10, 35, 60, 85]) {
    rows.push(
      cell(`ask|friend|${start}|b|${tupleName([32, 1995])}`, [32, 1995], { character: { age: 17, money: 100 }, cast: [who('p', 'friend', { age: 16, relationship: start })] }, (g, w) => askOut(g, w.p!), (_g, w) => ({ relation: w.p!.relation })),
    )
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// ring: proposals

const RINGS = ['none', 'fake', 'silver', 'gold', 'diamond', 'huge'] as const

function playRings(): ParityRow[] {
  const rows: ParityRow[] = []
  const tuple: Tuple = [37, 2026]
  const propose = (label: string, start: number, years: number, ring: string, over: Partial<CastSpec> = {}): void => {
    rows.push(
      cell(
        `ring|${label}`,
        tuple,
        { character: { age: 30, money: 200_000 }, cast: [who('p', 'partner', { age: 28, relationship: start, data: { datingSince: 30 - years }, ...over })] },
        (g, w) => {
          proposeTo(g, w.p!)
          answer(g, 'love.propose.ring', ring)
        },
        (_g, w) => ({ relation: w.p!.relation, ring: w.p!.data.ring ?? null, left: w.p!.relationship }),
      ),
    )
  }
  for (const ring of RINGS) for (const start of [30, 50, 67, 90]) for (const years of [0, 4]) propose(`${ring}|${start}|${years}y`, start, years, ring)
  for (const start of [50, 90]) for (const years of [0, 4]) propose(`fake-smart|${start}|${years}y`, start, years, 'fake', { stats: { smarts: 80 } })
  for (const start of [50, 90]) propose(`diamond-romantic|${start}`, start, 3, 'diamond', { traits: ['romantic', 'kind'] })
  // Too young to get engaged.
  rows.push(cell('ring|young', tuple, { character: { age: 15, money: 1_000 }, cast: [who('p', 'partner', { age: 15, relationship: 80, data: { datingSince: 14 } })] }, (g, w) => proposeTo(g, w.p!), (g, w) => ({ asked: pending(g, 'love.propose.ring') !== null, why: proposalProblem(g, w.p!) !== null })))
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// split: divorce settlements

function playSplits(): ParityRow[] {
  const rows: ParityRow[] = []
  const tuple: Tuple = [47, 2026]
  const split = (by: 'player' | 'them', prenup: boolean, mine: number, theirs: number, house: boolean): void => {
    rows.push(
      cell(
        `split|${by}|${prenup ? 'prenup' : 'none'}|${mine}|${theirs}|${house ? 'house' : 'rent'}`,
        tuple,
        { character: { age: 40, money: mine }, cast: [who('x', 'spouse', { age: 38, relationship: 45, money: theirs, livesWithPlayer: true, data: { datingSince: 28, marriedAge: 30, prenup } })] },
        (g, w) => {
          if (house) g.assets.push({ ...HOUSE })
          divorce(g, w.x!, by)
        },
        (g, w) => ({ relation: w.x!.relation, spouse: w.x!.money, assets: g.assets.length }),
      ),
    )
  }
  for (const by of ['player', 'them'] as const) for (const prenup of [false, true]) for (const mine of [20_000, 400_000, 5_000_000]) for (const theirs of [0, 150_000, 3_000_000]) split(by, prenup, mine, theirs, false)
  for (const mine of [20_000, 400_000, 5_000_000]) for (const theirs of [0, 150_000]) split('player', false, mine, theirs, true)
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// the smaller grids

function playSmall(): ParityRow[] {
  const rows: ParityRow[] = []
  // counseling: relationship x a kind spouse x money (0 cannot pay the fee)
  for (const start of [10, 35, 60, 90]) {
    for (const kind of [false, true]) {
      for (const money of [50, 5_000]) {
        rows.push(
          cell(
            `counsel|${start}|${kind ? 'kind' : 'plain'}|${money}`,
            [51, 2026],
            { character: { age: 40, money }, cast: [who('p', 'spouse', { age: 38, relationship: start, traits: kind ? ['caring', 'kind'] : ['calm', 'grumpy'], data: { marriedAge: 32 } })] },
            (g, w) => couplesCounseling(g, w.p!),
            (g, w) => ({ happy: g.character.stats.happiness, rel: w.p!.relationship }),
          ),
        )
      }
    }
  }
  // elope: relationship x temper
  for (const start of [20, 50, 90]) {
    for (const traits of [['calm', 'kind'], ['romantic', 'rebellious'], ['serious', 'anxious']]) {
      rows.push(cell(`elope|${start}|${traits[0]}`, [53, 2026], { character: { age: 28, money: 9_000 }, cast: [who('p', 'fiance', { relationship: start, traits, data: { engagedAge: 27 } })] }, (g, w) => elope(g, w.p!), (_g, w) => ({ relation: w.p!.relation, venue: w.p!.data.venue ?? null })))
    }
  }
  // a baby: relation x relationship, with the plan agreed once
  for (const relation of ['partner', 'fiance', 'spouse'] as const) {
    for (const start of [20, 50, 90]) {
      for (const agreed of [false, true]) {
        rows.push(
          cell(
            `baby|${relation}|${start}|${agreed ? 'plan' : 'open'}`,
            [55, 2026],
            { character: { age: 30, money: 20_000 }, cast: [who('p', relation, { age: 27, relationship: start, data: agreed ? { familyPlanWith: 'player', datingSince: 24 } : { datingSince: 24 } })] },
            (g, w) => tryForBaby(g, w.p!),
            (_g, w) => ({ carrying: w.p!.pregnant === true, plan: w.p!.data.familyPlanWith ?? null }),
          ),
        )
      }
    }
  }
  // making love: relationship x relation x the mother's age
  for (const relation of ['partner', 'spouse'] as const) {
    for (const start of [10, 40, 80]) {
      for (const age of [25, 44]) {
        rows.push(cell(`love|${relation}|${start}|${age}`, [57, 2026], { character: { age: 30, money: 1_000 }, cast: [who('p', relation, { age, relationship: start, data: { waitChecked: true, datingSince: 25 } })] }, (g, w) => makeLove(g, w.p!), (_g, w) => ({ carrying: w.p!.pregnant === true })))
      }
    }
  }
  // a lover behind a partner's back: the lover's side of makeLove and the chance of being caught
  for (const mate of [40, 80]) {
    for (const start of [30, 70]) {
      rows.push(
        cell(
          `love|lover|${mate}|${start}`,
          [59, 2026],
          { character: { age: 32, money: 1_000 }, cast: [who('m', 'partner', { relationship: mate, data: { datingSince: 27 } }), who('l', 'lover', { relationship: start, data: { waitChecked: true } })] },
          (g, w) => makeLove(g, w.l!),
          (g, w) => ({ mate: w.m!.relation, cheated: g.counters.cheated ?? 0 }),
        ),
      )
    }
  }
  // hooking up with someone already in your life: by era, with and without a partner, with and without an STD
  for (const year of [1960, 2026]) {
    for (const mate of [0, 50, 80]) {
      for (const std of [false, true]) {
        rows.push(
          cell(
            `hook|${year}|${mate || 'single'}|${std ? 'std' : 'clean'}`,
            [61, year],
            { character: { age: 29, money: 1_000 }, cast: [who('f', 'friend', { age: 28, relationship: 50, data: std ? { std: true } : {} }), ...(mate > 0 ? [who('m', 'partner', { relationship: mate, data: { datingSince: 26 } })] : [])] },
            (g, w) => hookUpWith(g, w.f!),
            (g, w) => ({ mate: w.m?.relation ?? null, stds: g.character.conditions.length, carrying: w.f!.pregnant === true, odds: cheatDetectionOdds(g) }),
          ),
        )
      }
    }
  }
  // break-ups: kind of tie x who ends it x how old the player is (the corridor talks until 35) x the era (the feed)
  for (const relation of ['partner', 'fiance'] as const) {
    for (const by of ['player', 'them'] as const) {
      for (const age of [17, 22, 40]) {
        for (const year of [1990, 2026]) {
          rows.push(
            cell(
              `break|${relation}|${by}|${age}|${year}`,
              [63, year],
              { character: { age, money: 2_000 }, cast: [who('p', relation, { age, relationship: 60, data: { datingSince: age - 2, engagedAge: age - 1, ring: 'Silver band' } })] },
              (g, w) => breakUp(g, w.p!, by),
              (g, w) => ({ relation: w.p!.relation, joy: g.character.stats.happiness }),
            ),
          )
        }
      }
    }
  }
  for (const by of ['player', 'them'] as const) {
    rows.push(cell(`break|cancel-engagement|${by}`, [65, 2026], { character: { age: 30, money: 2_000 }, cast: [who('p', 'fiance', { relationship: 70, data: { engagedAge: 29 } })] }, (g, w) => cancelEngagement(g, w.p!, by), (_g, w) => ({ relation: w.p!.relation })))
  }
  // renewing the vows
  for (const start of [30, 75]) {
    for (const years of [4, 14]) {
      rows.push(cell(`vows|${start}|${years}y`, [67, 2026], { character: { age: 40, money: 10_000 }, cast: [who('p', 'spouse', { age: 38, relationship: start, data: { marriedAge: 40 - years } })] }, (g, w) => renewVows(g, w.p!), (_g, w) => ({ vows: w.p!.data.vowsAge ?? null })))
    }
  }
  // the partner proposes: the player says yes or no, warm or cold
  for (const start of [20, 60, 90]) {
    for (const choice of ['yes', 'no']) {
      rows.push(
        cell(
          `plan|proposed|${start}|${choice}`,
          [69, 2026],
          { character: { age: 30, money: 20_000 }, cast: [who('p', 'partner', { age: 28, relationship: start, data: { datingSince: 25 } })] },
          (g, w) => {
            partnerProposes(g, w.p!)
            answer(g, 'love.proposed', choice)
          },
          (_g, w) => ({ relation: w.p!.relation }),
        ),
      )
    }
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// marriage: twenty years through partnerDrama

/** Twenty years of one marriage: the spouse starts at `start`, every year is yearlyRelationships and every popup of it is answered. */
function marriage(tuple: Tuple, start: number): ParityRow[] {
  const s = scene(tuple, {
    character: { age: 28, money: 40_000 },
    cast: [who('w', 'spouse', { age: 27, relationship: start, livesWithPlayer: true, money: 8_000, data: { datingSince: 22, marriedAge: 25 } })],
  })
  const g = s.g
  const w = s.who.w!
  for (let y = 1; y <= 20; y++) {
    let asked: string[] = []
    s.step(
      `marriage|${tupleName(tuple)}|${start}|y${String(y).padStart(2, '0')}`,
      () => {
        g.character.age += 1
        g.year += 1
        g.yearActions = {}
        yearlyRelationships(g)
        asked = drain(g, y)
      },
      () => ({ asked, relation: w.relation, kids: g.people.filter((p) => p.relation === 'child').length }),
    )
  }
  return s.rows
}

/** [dice tuple, the spouse's relationship at the start]: two marriages that last 20 years with popups and a family, and one that ends in a divorce. */
const MARRIAGES: readonly (readonly [Tuple, number])[] = [
  [[113, 2026], 70],
  [[44, 1975], 70],
  [[1, 1975], 30],
]

function playMarriages(): ParityRow[] {
  return MARRIAGES.flatMap(([tuple, start]) => marriage(tuple, start))
}

// ---------------------------------------------------------------------------------------------------------------------
// read: the pure readers, frozen

function playReads(): ParityRow[] {
  const rows: ParityRow[] = []
  const s = scene([81, 2026], {
    character: { age: 30, money: 10_000 },
    cast: [who('m', 'partner', { relationship: 60 }), who('f', 'friend', { age: 25, relationship: 40 }), who('t', 'teacher', { age: 45 }), who('k', 'child', { age: 4 }), who('d', 'parent', { age: 55 })],
  })
  const g = s.g
  const bases = ['dating', 'cheat', 'ages', 'baby'].map((k) => snapshot(`read|${k}`, g))
  // The readers that are pure: read under deepFreeze with g.rng trapped (a draw or a write throws).
  deepFreeze(trapRng(g))
  const years = [1890, 1925, 1950, 1975, 1990, 2005, 2026]
  const dating = Object.fromEntries(
    ['m', 'f', 't', 'k', 'd'].map((k) => {
      const p = s.who[k]!
      return [k, [datingProblem(g, p), proposalProblem(g, p), weddingProblem(g, p), intimacyProblem(g, p), conceptionBlocker(g, p), courtshipShift(g, p), fertilityFactor(g, p)]]
    }),
  )
  rows.push({ ...bases[0]!, x: { dating: cut(dating) } })
  rows.push({ ...bases[1]!, x: { years: years.join(','), odds: cut(years.map((y) => cheatDetectionOdds({ ...g, year: y } as GameState))) } })
  rows.push({ ...bases[2]!, x: { ranges: cut([10, 13, 16, 17, 18, 21, 22, 30, 45, 70, 99].map((a) => [a, ...dateAgeRange(a)])) } })
  rows.push({ ...bases[3]!, x: { factors: cut([20, 30, 35, 40, 45, 50].map((age) => fertilityFactor(g, { ...s.who.m!, age } as Person))) } })
  // The lists that look the country up are not pure: the getaway is picked with g.rng. They are rows of their own, so the draws are pinned.
  for (const id of ['us', 'jp', 'in', 'br']) {
    let venues: string[] = []
    let trips: string[] = []
    rows.push(
      cell(
        `read|venues|${id}`,
        [83, 2026],
        { character: { age: 30, money: 10_000, countryId: id } },
        (g2) => {
          venues = weddingVenues(g2).map((v) => `${v.id}:${v.cost}:${v.label}`)
        },
        () => ({ venues }),
      ),
    )
    rows.push(
      cell(
        `read|honeymoons|${id}`,
        [85, 2026],
        { character: { age: 30, money: 10_000, countryId: id } },
        (g2) => {
          trips = honeymoonOptions(g2).map((h) => `${h.id}:${h.cost}`)
        },
        () => ({ trips }),
      ),
    )
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------

export function playAll(): ParityRow[] {
  return [...playChains(), ...playAsk(), ...playRings(), ...playSplits(), ...playSmall(), ...playMarriages(), ...playReads()]
}

describe('love.ts is what it was before the shim', () => {
  it('has the rows it recorded: every number, every draw, every popup', () => {
    const rows = playAll()
    if (isRecording(ORACLE.area)) recordRows(ORACLE, rows)
    else expectRows(ORACLE, rows)
  })

  it('plays the same rows twice', () => {
    expect(playAll()).toEqual(playAll())
  })
})
