// R4-L1 (X2, X4, X30, X35): the scenes of test/life-pins.test.ts. R4's Life and heirs track changes six behaviours that no earlier test
// pins and that no E-golden file records: the NPC life cycle (marriages and babies of relatives), the death of an NPC relative and
// where the cash on the dead record goes, the divorce settlement that the player cannot pay, the hand-over to a child (the heir's
// spouse from a name, the loans and the anger of the late player's time, who is kept), the jobs of relatives at a firm a sibling
// adopts, and the heirs of a stake. Each is played here on the engine as it is, through the oracle kit of test/social-parity-kit.ts,
// and test/fixtures/life-pins.json holds the rows (recorded under Node 22 on the unmodified engine, never re-recorded to make a
// change pass: a deliberate move takes RECORD_REASON and a row in moved-tests.md).
//
// Every scene is a (seed, year) tuple, found once by scanning seeds for the property the scene is there for (findSeed's loop) and a
// constant now (X30, never `seed: <digits>`). A scene gives createPerson every field, so building it draws nothing; what a step draws
// is the engine's own. A relationship is changed through the kit's applyDelta only (the E1 ratchet counts every other call), and no
// scene needs one: the changes come from the engine.
//
// The rows hold no log or notice text. They hold numbers, ids, relations, the names a relative keeps (the face never changes), the
// judge's order read off the first lines of the divorce notice, and the queue as kinds.
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import { readJob, readPast } from '../src/game/business/nepo-job'
import { familyYear } from '../src/game/business/nepo-year'
import { familyStakeHeirs, settleLateFamilyOwners } from '../src/game/business/dynasty-ownership'
import { bizOf, findBusiness } from '../src/game/business/state'
import { bindMoneyContext, netWorth } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { changeWill } from '../src/game/events/will-act'
import { readWl, updateWl } from '../src/game/events/will-core'
import { yearlyWealth } from '../src/game/events/wealth'
import { readTies, updateTies } from '../src/game/events/wealth-core'
import { acctBalance, flowsOf, playerAcct, type AcctRef } from '../src/game/kernel/ledger'
import { continueAsChild } from '../src/game/life'
import { divorce } from '../src/game/love'
import { initializeNpc } from '../src/game/npc-lives'
import { saveNpcLife } from '../src/game/npc-state'
import { yearlyRelationships } from '../src/game/relationships'
import { nextRandom } from '../src/game/rng'
import type { Asset, GameState, Person } from '../src/game/types'
import { drain, kid, world } from './nepo-kit'
import { scene, snapshot, type CastSpec, type Extra, type ParityRow, type Tuple } from './social-parity-kit'

export type { Tuple }

/** The balance of a person's account in the books (person:<id>). */
const acctOfPerson = (g: GameState, p: Person): number => acctBalance(g, `person:${p.id}` as AcctRef)

/** The flow rows of a reason this year: [reason, country, the classes whose net moved]. A death between persons moves no class (person to person), so the rows exist and the nets are empty. */
function flowRows(g: GameState, reasons: readonly string[]): (string | Record<string, number>)[][] {
  return flowsOf(g, g.year)
    .filter((r) => reasons.includes(r.reason))
    .map((r) => [r.reason, r.country, Object.fromEntries(Object.entries(r.net).filter(([, v]) => v !== 0))])
}

const kinds = (g: GameState): string[] => g.queue.map((m) => m.kind)

// ---------------------------------------------------------------------------------------------------------------------
// (a) The NPC life cycle: four families, forty years (relationships.ts familyLifeCycle, :1323-1378)

export interface Family {
  id: string
  tuple: Tuple
  player: number
  cast: readonly CastSpec[]
}

/** Played through yearlyRelationships (familyLifeCycle is private): the year, the age and the year's actions move first, as ageUp does. */
export const FAMILIES: readonly Family[] = [
  {
    id: 'f1960',
    tuple: [23, 1960],
    player: 55,
    cast: [
      { key: 'k1', relation: 'child', age: 28, relationship: 70 },
      { key: 'k2', relation: 'child', age: 26, relationship: 60 },
      { key: 'k3', relation: 'child', age: 22, relationship: 50 },
      { key: 's1', relation: 'sibling', age: 52, relationship: 60 },
      { key: 's2', relation: 'sibling', age: 58, relationship: 55 },
    ],
  },
  {
    // Already married, so every year draws the baby chance of five anchors (children, a stepchild, a sibling and a half sibling).
    id: 'f1975',
    tuple: [14, 1975],
    player: 66,
    cast: [
      { key: 'k1', relation: 'child', age: 30, relationship: 70, data: { married: true, spouseName: 'Rosa Diaz', kids: 1 } },
      { key: 'k2', relation: 'child', age: 28, relationship: 60, data: { married: true, spouseName: 'Tom Hale', kids: 0 } },
      { key: 'k3', relation: 'child', age: 26, relationship: 65, data: { married: true, spouseName: 'Mei Lin', kids: 0 } },
      { key: 'st', relation: 'stepchild', age: 24, relationship: 45, data: { married: true, spouseName: 'Omar Said', kids: 0 } },
      { key: 's1', relation: 'sibling', age: 40, relationship: 60, data: { married: true, spouseName: 'Jo Park', kids: 0 } },
      { key: 'h1', relation: 'halfSibling', age: 36, relationship: 50, data: { married: true, spouseName: 'Lee Cho', kids: 1 } },
    ],
  },
  {
    id: 'f1990',
    tuple: [46, 1990],
    player: 62,
    cast: [
      { key: 'k1', relation: 'child', age: 38, relationship: 65 },
      { key: 'k2', relation: 'child', age: 35, relationship: 55 },
      { key: 'st', relation: 'stepchild', age: 30, relationship: 45 },
      { key: 'h1', relation: 'halfSibling', age: 58, relationship: 50 },
      { key: 'h2', relation: 'halfSibling', age: 34, relationship: 50 },
      { key: 'g1', relation: 'grandchild', age: 21, relationship: 70 },
      { key: 'g2', relation: 'grandchild', age: 12, relationship: 80 },
    ],
  },
  {
    id: 'f2010',
    tuple: [1, 2010],
    player: 30,
    cast: [
      { key: 'k1', relation: 'child', age: 8, relationship: 80 },
      { key: 'k2', relation: 'child', age: 4, relationship: 85 },
      { key: 's1', relation: 'sibling', age: 27, relationship: 60 },
      { key: 'ss', relation: 'stepsibling', age: 33, relationship: 40 },
      { key: 'h1', relation: 'halfSibling', age: 18, relationship: 55 },
    ],
  },
]

export const CYCLE_YEARS = 40

/** What a year of the cycle leaves: each married anchor (spouse name, kids), the grandchildren as Persons, the dead, the head count. */
function cycleState(popups: string[]): Extra {
  return (g) => ({
    m: g.people.filter((p) => p.data.married === true).map((p) => [p.id, p.data.spouseName ?? null, p.data.kids ?? 0]),
    gc: g.people.filter((p) => p.relation === 'grandchild').map((p) => [p.id, p.firstName, p.lastName, p.gender, p.data.parentId ?? null]),
    d: g.people.filter((p) => !p.alive).map((p) => p.id),
    n: g.people.length,
    y: g.year,
    q: [...popups],
  })
}

export interface CycleRun {
  family: Family
  rows: ParityRow[]
  game: GameState
}

export function playFamily(f: Family): CycleRun {
  const s = scene(f.tuple, { character: { age: f.player }, cast: f.cast })
  const popups: string[] = []
  s.step(`cycle|${f.id}|start`, () => undefined, cycleState(popups))
  for (let y = 1; y <= CYCLE_YEARS; y++) {
    s.step(
      `cycle|${f.id}|y${y}`,
      (g) => {
        g.character.age += 1
        g.year += 1
        g.yearActions = {}
        yearlyRelationships(g)
        popups.length = 0
        popups.push(...kinds(g))
        g.queue = []
      },
      cycleState(popups),
    )
  }
  return { family: f, rows: s.rows, game: s.g }
}

// ---------------------------------------------------------------------------------------------------------------------
// (b) The death of an NPC relative, and where the cash on the dead record goes (relationships.ts handleDeath, :1019-1118)

export const ESTATE_KINDS = ['parent+', 'parent', 'sibling', 'child', 'spouse', 'friend', 'ex'] as const
export type EstateKind = (typeof ESTATE_KINDS)[number]

/**
 * One death. `kind` is who dies ('parent+' has the other parent alive, 'parent' has none and a sibling alive, so the estate splits by
 * heads); `money` is the cash on their record. `variant`: 'cold' is a fondness of 15 (a cold parent or spouse can leave the player
 * nothing), 'disowned' a child the player disowned (estranged kids pass quietly), 'noshare' the ordinary fondness at a seed where the
 * roll leaves the player nothing, 'assets' a person with a modeled life (an NpcLife) whose investments, housing and debt are turned
 * into cash before the estate is cut (npc-lives.ts liquidateNpcEstate). `share` is what the tuple was searched for: the player gets a
 * share ('some') or does not ('none'). The tuple is the first seed, from a start spread out per case, at which the target dies in the
 * year, nobody else does and the share is what the case wants.
 */
export interface EstateCase {
  id: string
  kind: EstateKind
  money: number
  variant?: 'cold' | 'disowned' | 'noshare' | 'assets'
  /** The dead person's modeled life: investments, housing and debt that liquidateNpcEstate turns into cash before the share is cut. */
  life?: { investments: number; housing: number; debt: number }
  share: 'some' | 'none'
  tuple: Tuple
}

/** Health 12 doubles and a half the yearly hazard; the bystanders are young and well. */
function estateCast(c: Pick<EstateCase, 'kind' | 'money' | 'variant'>): CastSpec[] {
  const fond = c.variant === 'cold' ? 15 : 70
  const t = (relation: CastSpec['relation'], age: number): CastSpec => ({
    key: 't',
    relation,
    age,
    relationship: fond,
    money: c.money,
    stats: { health: 12 },
    ...(c.variant === 'disowned' ? { data: { disowned: true } } : {}),
  })
  const well = (key: string, relation: CastSpec['relation'], age: number, m = 1000): CastSpec => ({ key, relation, age, relationship: 60, money: m, stats: { health: 95 } })
  switch (c.kind) {
    case 'parent+':
      return [t('parent', 78), well('o', 'parent', 75, 10_000), well('pal', 'friend', 30)]
    case 'parent':
      return [t('parent', 78), well('sib', 'sibling', 45), well('pal', 'friend', 30)]
    case 'sibling':
      return [t('sibling', 52), well('pal', 'friend', 30)]
    case 'child':
      return [t('child', 30), well('pal', 'friend', 30)]
    case 'spouse':
      return [t('spouse', 50), well('pal', 'friend', 30)]
    case 'friend':
      return [t('friend', 62), well('pal', 'friend', 30)]
    case 'ex':
      return [t('ex', 55), well('pal', 'friend', 30)]
  }
}

const LIFE = { investments: 200_000, housing: 500_000, debt: 100_000 } as const

export const ESTATES: readonly EstateCase[] = [
  { id: 'parent+|0', kind: 'parent+', money: 0, share: 'none', tuple: [3, 2026] },
  { id: 'parent+|50000', kind: 'parent+', money: 50000, share: 'some', tuple: [47, 2026] },
  { id: 'parent+|5000000', kind: 'parent+', money: 5000000, share: 'some', tuple: [63, 2026] },
  { id: 'parent|0', kind: 'parent', money: 0, share: 'none', tuple: [91, 2026] },
  { id: 'parent|50000', kind: 'parent', money: 50000, share: 'some', tuple: [120, 2026] },
  { id: 'parent|5000000', kind: 'parent', money: 5000000, share: 'some', tuple: [158, 2026] },
  { id: 'sibling|0', kind: 'sibling', money: 0, share: 'none', tuple: [193, 2026] },
  { id: 'sibling|50000', kind: 'sibling', money: 50000, share: 'some', tuple: [676, 2026] },
  { id: 'sibling|5000000', kind: 'sibling', money: 5000000, share: 'some', tuple: [676, 2026] },
  { id: 'child|0', kind: 'child', money: 0, share: 'none', tuple: [343, 2026] },
  { id: 'child|50000', kind: 'child', money: 50000, share: 'some', tuple: [343, 2026] },
  { id: 'child|5000000', kind: 'child', money: 5000000, share: 'some', tuple: [343, 2026] },
  { id: 'spouse|0', kind: 'spouse', money: 0, share: 'none', tuple: [430, 2026] },
  { id: 'spouse|50000', kind: 'spouse', money: 50000, share: 'some', tuple: [430, 2026] },
  { id: 'spouse|5000000', kind: 'spouse', money: 5000000, share: 'some', tuple: [430, 2026] },
  { id: 'friend|0', kind: 'friend', money: 0, share: 'none', tuple: [452, 2026] },
  { id: 'friend|50000', kind: 'friend', money: 50000, share: 'none', tuple: [482, 2026] },
  { id: 'friend|5000000', kind: 'friend', money: 5000000, share: 'none', tuple: [519, 2026] },
  { id: 'ex|0', kind: 'ex', money: 0, share: 'none', tuple: [676, 2026] },
  { id: 'ex|50000', kind: 'ex', money: 50000, share: 'none', tuple: [676, 2026] },
  { id: 'ex|5000000', kind: 'ex', money: 5000000, share: 'none', tuple: [676, 2026] },
  { id: 'parent+|50000|cold', kind: 'parent+', money: 50000, variant: 'cold', share: 'none', tuple: [635, 2026] },
  { id: 'parent|50000|cold', kind: 'parent', money: 50000, variant: 'cold', share: 'none', tuple: [641, 2026] },
  { id: 'spouse|50000|cold', kind: 'spouse', money: 50000, variant: 'cold', share: 'none', tuple: [676, 2026] },
  { id: 'sibling|50000|noshare', kind: 'sibling', money: 50000, variant: 'noshare', share: 'none', tuple: [710, 2026] },
  { id: 'child|50000|noshare', kind: 'child', money: 50000, variant: 'noshare', share: 'none', tuple: [1136, 2026] },
  { id: 'child|50000|disowned', kind: 'child', money: 50000, variant: 'disowned', share: 'none', tuple: [952, 2026] },
  { id: 'sibling|50000|assets', kind: 'sibling', money: 50000, variant: 'assets', life: LIFE, share: 'some', tuple: [1912, 2026] },
  { id: 'spouse|50000|assets', kind: 'spouse', money: 50000, variant: 'assets', life: LIFE, share: 'some', tuple: [930, 2026] },
  { id: 'friend|50000|assets', kind: 'friend', money: 50000, variant: 'assets', life: LIFE, share: 'none', tuple: [1134, 2026] },
]

export interface EstateRun {
  id: string
  rows: ParityRow[]
  game: GameState
  target: Person
  /** Everyone who died in the year (the scene is there for the case where this is only the target). */
  died: Person[]
  /** What the player's cash gained in the year: their share. */
  gain: number
}

export function playEstate(c: EstateCase): EstateRun {
  const s = scene(c.tuple, { character: { age: 50, money: 0 }, cast: estateCast(c) })
  const g = s.g
  const target = s.who.t!
  const before = g.character.money
  const popups: string[] = []
  let gain = 0
  const extra: Extra = (gg) => ({
    gain,
    me: acctBalance(gg, playerAcct(gg)),
    t: [target.alive ? 1 : 0, target.relation, target.money, acctOfPerson(gg, target), gg.people.includes(target) ? 1 : 0],
    o: s.who.o !== undefined ? s.who.o.money : null,
    flows: flowRows(gg, ['estate', 'inheritance']),
    left: gg.people.map((p) => `${p.relation}${p.alive ? '' : '+'}`),
    q: [...popups],
  })
  s.step(
    `estate|${c.id}|start`,
    (gg) => {
      if (c.life === undefined) return
      const l = initializeNpc(gg, target)
      l.investments = c.life.investments
      l.housing = c.life.housing
      l.debt = c.life.debt
      saveNpcLife(target, l)
    },
    extra,
  )
  s.step(
    `estate|${c.id}|year`,
    (gg) => {
      gg.character.age += 1
      gg.year += 1
      gg.yearActions = {}
      yearlyRelationships(gg)
      gain = gg.character.money - before
      popups.push(...kinds(gg))
      gg.queue = []
    },
    extra,
  )
  const died = Object.values(s.who).filter((p) => !p.alive)
  return { id: c.id, rows: s.rows, game: g, target, died, gain }
}

// ---------------------------------------------------------------------------------------------------------------------
// (c) The divorce the player cannot pay in full (love.ts divorce, :1627-1722)

export interface DivorceCase {
  id: string
  tuple: Tuple
  by: 'player' | 'them'
  /** Cash the player has. */
  cash: number
  /** The ex's money. */
  exMoney: number
  prenup: boolean
  /** Other property besides the $3M residence: value and mortgage balance. */
  extra?: { value: number; mortgage: number }
}

const house = (id: string, value: number, mortgage = 0): Asset =>
  ({
    id,
    kind: 'house',
    name: id === 'home' ? 'Family House' : 'Beach House',
    emoji: '\u{1F3E0}',
    purchasePrice: Math.round(value * 0.7),
    value,
    condition: 80,
    purchasedAge: 30,
    upkeep: 0,
    details: {},
    ...(mortgage > 0 ? { mortgage: { lender: 'Bank', balance: mortgage, yearlyPayment: 0, yearsLeft: 20, rate: 0.05 } } : {}),
  }) as unknown as Asset

export interface DivorceRun {
  id: string
  rows: ParityRow[]
  game: GameState
  ex: Person
  /** The judge's order, read from the notice; null when there is none. */
  owed: number | null
  /** The order less what the ex got in cash and in sold property: the deficiency. */
  remaining: number | null
  /** The order by the settlement formula, from the draw the divorce is about to make (the player files). */
  formula: number | null
  paragraphs: string[]
}

const DOLLARS = /\$([\d,]+)/

export function playDivorce(c: DivorceCase): DivorceRun {
  bindMoneyContext(null)
  const s = scene(c.tuple, {
    character: { age: 45, money: c.cash },
    cast: [{ key: 'ex', relation: 'spouse', age: 44, relationship: 40, money: c.exMoney, data: c.prenup ? { prenup: true } : {} }],
  })
  const g = s.g
  const ex = s.who.ex!
  g.assets.push(house('home', 3_000_000))
  g.character.residence = { status: 'owned', assetId: 'home' }
  if (c.extra) g.assets.push(house('beach', c.extra.value, c.extra.mortgage))
  const worth = netWorth(g)
  const exBefore = ex.money
  const cashBefore = g.character.money
  const draw = nextRandom(g.rng)[0]
  let judge: number | null = null
  let paragraphs: string[] = []
  const extra: Extra = (gg) => ({
    worth: [worth, netWorth(gg)],
    cash: [cashBefore, gg.character.money],
    ex: [exBefore, ex.money, ex.relation, acctOfPerson(gg, ex)],
    assets: gg.assets.map((a) => a.id),
    judge,
    paras: paragraphs.length,
    // The first sentence of the notice only: when the ex files, the rest of the paragraph is a line from a pool.
    first: (paragraphs[0] ?? '').split('.')[0] || null,
    q: kinds(gg),
    rem: judge === null ? null : Math.round((judge - (ex.money - exBefore)) * 100) / 100,
  })
  s.step(`divorce|${c.id}|start`, () => undefined, extra)
  s.step(
    `divorce|${c.id}|filed`,
    (gg) => {
      divorce(gg, ex, c.by)
      const note = gg.queue.find((m) => m.kind === 'notice') as { text: string } | undefined
      paragraphs = note ? note.text.split('\n\n') : []
      const line = paragraphs.find((p) => p.startsWith('The judge ordered you to pay'))
      const m = line === undefined ? null : DOLLARS.exec(line)
      judge = m === null ? null : Number(m[1]!.replace(/,/g, ''))
    },
    extra,
  )
  const last = s.rows[s.rows.length - 1]!
  const rem = (last.x as { rem: number | null }).rem
  const formula = c.by === 'player' && !c.prenup ? Math.round(((Math.max(0, worth) - Math.max(0, exBefore)) / 2) * (0.5 + draw * 0.5)) : null
  return { id: c.id, rows: s.rows, game: g, ex, owed: judge, remaining: rem, formula, paragraphs }
}

/** Six tuples as the plan names them (the player files three times and is served three times), then the cases the same block of love.ts handles differently. */
export const DIVORCE_CASES: readonly DivorceCase[] = [
  { id: 'filed-a', tuple: [11, 2026], by: 'player', cash: 20_000, exMoney: 0, prenup: false },
  { id: 'filed-b', tuple: [12, 2026], by: 'player', cash: 20_000, exMoney: 0, prenup: false },
  { id: 'filed-c', tuple: [13, 2026], by: 'player', cash: 20_000, exMoney: 0, prenup: false },
  { id: 'served-a', tuple: [14, 2026], by: 'them', cash: 20_000, exMoney: 0, prenup: false },
  { id: 'served-b', tuple: [15, 2026], by: 'them', cash: 20_000, exMoney: 0, prenup: false },
  { id: 'served-c', tuple: [16, 2026], by: 'them', cash: 20_000, exMoney: 0, prenup: false },
  { id: 'second-home', tuple: [17, 2026], by: 'player', cash: 20_000, exMoney: 0, prenup: false, extra: { value: 700_000, mortgage: 100_000 } },
  { id: 'sale-covers', tuple: [21, 2026], by: 'player', cash: 20_000, exMoney: 0, prenup: false, extra: { value: 5_000_000, mortgage: 0 } },
  { id: 'cash-pays', tuple: [18, 2026], by: 'player', cash: 5_000_000, exMoney: 0, prenup: false },
  { id: 'prenup', tuple: [19, 2026], by: 'player', cash: 20_000, exMoney: 0, prenup: true },
  { id: 'rich-ex', tuple: [20, 2026], by: 'player', cash: 20_000, exMoney: 6_000_000, prenup: false },
]

// ---------------------------------------------------------------------------------------------------------------------
// (d) The hand-over to a child, beyond the three of the heir parity file (life.ts continueAsChild, :1142-1683)

/** The parent dies the way the estate tests have them die (killCharacter), with the AI notice taken off the queue. */
function die(g: GameState): void {
  killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
}

export interface HeirSpouseCase {
  id: string
  tuple: Tuple
  /** `data.spouseName` of the heir; null leaves the key out. */
  name: string | null
  married: boolean
  age: number
  sexuality: 'straight' | 'gay' | 'bisexual'
}

/**
 * The heir's husband or wife is made from a name (NPC marriages only store one): first word, then the rest, age, skin and how long
 * they have known each other, each from a draw (life.ts:1431-1450). The name 'Madonna' has no last name, 'Ana  Ruiz' has two spaces,
 * a heir under 18 or not married gets none. A bisexual heir's spouse takes a coin flip first: two tuples so both genders are pinned.
 */
export const HEIR_SPOUSES: readonly HeirSpouseCase[] = [
  { id: 'ana-ruiz', tuple: [31, 2026], name: 'Ana Ruiz', married: true, age: 45, sexuality: 'straight' },
  { id: 'juan-carlos', tuple: [32, 2026], name: 'Juan Carlos de Cuba', married: true, age: 45, sexuality: 'straight' },
  { id: 'no-name', tuple: [33, 2026], name: '', married: true, age: 45, sexuality: 'straight' },
  { id: 'one-word', tuple: [34, 2026], name: 'Madonna', married: true, age: 45, sexuality: 'straight' },
  { id: 'two-spaces', tuple: [35, 2026], name: 'Ana  Ruiz', married: true, age: 45, sexuality: 'straight' },
  { id: 'gay', tuple: [36, 2026], name: 'Ana Ruiz', married: true, age: 45, sexuality: 'gay' },
  { id: 'bi-a', tuple: [37, 2026], name: 'Ana Ruiz', married: true, age: 45, sexuality: 'bisexual' },
  { id: 'bi-b', tuple: [38, 2026], name: 'Ana Ruiz', married: true, age: 45, sexuality: 'bisexual' },
  { id: 'single', tuple: [39, 2026], name: 'Ana Ruiz', married: false, age: 45, sexuality: 'straight' },
  { id: 'minor', tuple: [40, 2026], name: 'Ana Ruiz', married: true, age: 17, sexuality: 'straight' },
  { id: 'no-key', tuple: [41, 2026], name: null, married: true, age: 45, sexuality: 'straight' },
]

/** What a hand-over leaves, person by person; the heir's husband or wife in full. */
function handOverState(spouseId?: string): Extra {
  return (n) => {
    const sp = n.people.find((p) => p.relation === 'spouse' && (spouseId === undefined || p.id === spouseId))
    return {
      heir: [n.character.id, n.character.age, n.character.gender, n.character.sexuality, n.character.money, n.generation],
      sp: sp === undefined ? null : [sp.id, sp.firstName, sp.lastName, sp.gender, sp.age, sp.data.skinTone ?? null, sp.relationship, sp.yearsKnown, sp.livesWithPlayer ? 1 : 0],
      people: n.people.map((p) => [p.id, p.relation, p.alive ? 1 : 0, p.livesWithPlayer ? 1 : 0, p.yearsKnown, p.notes.length]),
      q: kinds(n),
    }
  }
}

export interface HandOver {
  id: string
  rows: ParityRow[]
  before: GameState
  after: GameState
  heir: Person
}

export function playHeirSpouse(c: HeirSpouseCase): HandOver {
  const s = scene(c.tuple, {
    character: { age: 78, money: 1_000_000, residence: { status: 'renting', rent: 0 } },
    cast: [
      {
        key: 'heir',
        relation: 'child',
        age: c.age,
        relationship: 70,
        money: 20_000,
        data: {
          married: c.married,
          ...(c.name !== null ? { spouseName: c.name } : {}),
          sexuality: c.sexuality,
          birthday: { month: 5, day: 3 },
          skinTone: 2,
        },
      },
    ],
  })
  const heir = s.who.heir!
  s.step(`heir-spouse|${c.id}|dies`, die, handOverState())
  const n = continueAsChild(s.g, heir.id)
  s.rows.push(snapshot(`heir-spouse|${c.id}|after`, n, handOverState()))
  return { id: c.id, rows: s.rows, before: s.g, after: n, heir }
}

/**
 * The hand-over with everyone in it, so the seven re-rolls are pinned in order by what they leave: the heir's other parent (an
 * ex-spouse of the late player), the late player's spouse (a stepparent, because the heir lives at home), two siblings, the late
 * player's own mother (a grandparent), the heir's husband from a name, the heir's own child, the dog. Around them the contacts: friends
 * and a best friend who have a life of their own (kept, at the lower of 60 and what they felt), a friend with none (dropped), a
 * classmate, a coworker and an ex (dropped), and the loans and the anger the late player left (readTies and readWl are stamped with
 * the player's id; the heir starts with a blank slate).
 */
export const HAND_OVER_TUPLES: Readonly<Record<'crowd' | 'minor', Tuple>> = { crowd: [51, 2026], minor: [52, 2026] }

export function playCrowd(): HandOver {
  const [seed, year] = HAND_OVER_TUPLES.crowd
  const s = scene([seed, year], {
    character: { age: 79, money: 2_000_000, residence: { status: 'renting', rent: 0 } },
    cast: [
      { key: 'ex', relation: 'exSpouse', age: 74, relationship: 30, money: 5_000 },
      { key: 'wife', relation: 'spouse', age: 70, relationship: 80, money: 90_000 },
      {
        key: 'heir',
        relation: 'child',
        age: 45,
        relationship: 75,
        money: 20_000,
        livesWithPlayer: true,
        data: { married: true, spouseName: 'Ana Ruiz', sexuality: 'straight', birthday: { month: 5, day: 3 }, skinTone: 2 },
      },
      { key: 'sibA', relation: 'child', age: 42, relationship: 40, money: 8_000 },
      { key: 'sibB', relation: 'child', age: 38, relationship: 10, money: 3_000 },
      { key: 'mum', relation: 'parent', age: 99, relationship: 65, money: 40_000 },
      { key: 'grandkid', relation: 'grandchild', age: 12, relationship: 85 },
      { key: 'dog', relation: 'pet', age: 4, species: 'Dog', firstName: 'Rex', relationship: 90 },
      { key: 'fNpc', relation: 'friend', age: 40, relationship: 80, money: 12_000 },
      { key: 'fLow', relation: 'friend', age: 38, relationship: 30, money: 6_000 },
      { key: 'bNpc', relation: 'bestFriend', age: 41, relationship: 95, money: 9_000 },
      { key: 'fNone', relation: 'friend', age: 44, relationship: 70, money: 4_000 },
      { key: 'class', relation: 'classmate', age: 40, relationship: 50 },
      { key: 'work', relation: 'coworker', age: 39, relationship: 55 },
      { key: 'old', relation: 'ex', age: 43, relationship: 35 },
    ],
  })
  const w = s.who
  const heir = w.heir!
  // The heir's other parent is the ex-spouse; the grandchild is the heir's own child (CastSpec has no otherParentId, so it is set here).
  heir.otherParentId = w.ex!.id
  w.grandkid!.data.parentId = heir.id
  s.step('crowd|loans, anger, lives', (g) => {
    for (const p of [w.sibA!, w.fNpc!, w.fNone!]) updateTies(g, p, (t) => { t.owes = 40_000; t.owesSince = g.year - 2; t.given = 40_000 })
    updateTies(g, w.sibB!, (t) => { t.allowance = 6_000; t.given = 30_000 })
    updateWl(g, w.sibB!, (x) => { x.cut = true; x.cutY = g.year - 1; x.known = true; x.knownY = g.year - 1; x.anger = 70 })
    updateWl(g, w.sibA!, (x) => { x.known = true; x.knownY = g.year - 1; x.anger = 15 })
    for (const p of [w.fNpc!, w.fLow!, w.bNpc!]) initializeNpc(g, p)
    changeWill(g, (gg) => { gg.character.willBeneficiaries = [heir.id, w.sibA!.id] })
    g.queue = []
  }, crowdState(w))
  s.step('crowd|dies', die, crowdState(w))
  const n = continueAsChild(s.g, heir.id)
  s.rows.push(snapshot('crowd|after', n, crowdState(w)))
  return { id: 'crowd', rows: s.rows, before: s.g, after: n, heir }
}

/** The same people, as the clone sees them: ties and feelings through the readers (stamped with the player) and raw. */
function crowdState(w: Record<string, Person>): Extra {
  return (g) => ({
    ...handOverState()(g),
    ties: Object.keys(w)
      .sort()
      .map((k) => {
        const p = g.people.find((x) => x.id === w[k]!.id)
        if (p === undefined) return [k, null]
        const raw = p.data.w as { by?: string; owes?: number; allowance?: number } | undefined
        const wl = p.data.wl as { by?: string; anger?: number; cut?: boolean } | undefined
        return [k, p.relation, p.relationship, readTies(g, p).owes, readTies(g, p).allowance, raw?.by ?? null, raw?.owes ?? null, readWl(g, p).anger, wl?.by ?? null, wl?.anger ?? null, p.data.life === undefined ? 0 : 1, p.data.generationConnection === undefined ? 0 : 1]
      }),
  })
}

/** A minor heir: the other parent (an ex-spouse) is alive and the guardian; the late player's wife is a stepparent; a sibling still at home. */
export function playMinor(): HandOver {
  const s = scene(HAND_OVER_TUPLES.minor, {
    character: { age: 44, money: 300_000, residence: { status: 'renting', rent: 0 } },
    cast: [
      { key: 'bio', relation: 'exSpouse', age: 42, relationship: 60, money: 30_000 },
      { key: 'wife', relation: 'spouse', age: 40, relationship: 80, money: 10_000 },
      { key: 'heir', relation: 'child', age: 14, relationship: 85, money: 0, livesWithPlayer: true, data: { sexuality: 'straight', birthday: { month: 9, day: 21 }, skinTone: 1 } },
      { key: 'sis', relation: 'child', age: 9, relationship: 90, money: 0, livesWithPlayer: true },
      { key: 'nan', relation: 'parent', age: 70, relationship: 70, money: 20_000 },
      { key: 'cat', relation: 'pet', age: 2, species: 'Cat', firstName: 'Tom', relationship: 80 },
    ],
  })
  const heir = s.who.heir!
  heir.otherParentId = s.who.bio!.id
  s.who.sis!.otherParentId = s.who.bio!.id
  s.step('minor|dies', die, handOverState())
  const n = continueAsChild(s.g, heir.id)
  s.rows.push(snapshot('minor|after', n, handOverState()))
  return { id: 'minor', rows: s.rows, before: s.g, after: n, heir }
}

// ---------------------------------------------------------------------------------------------------------------------
// (d) continued: a dead relative who owes, before settleTheDead (events/wealth.ts :83)

/** The tuple of the friend who owes and dies in a year of relationships (found with findSeed: only the friend dies). */
export const OWING_FRIEND: Tuple = [66, 2026]

export interface OwingRun {
  rows: ParityRow[]
  game: GameState
  friend: Person
  sibling: Person
  /** Lines of the log that say a loan died with someone. */
  lines: () => number
}

/**
 * A friend who owes $40,000 dies in a year of relationships and cleanupPeople drops them, loan and all, with no line. A sibling who
 * owes is dead already (kept in the list, as the family is): yearlyWealth writes the loan off, with one line, and says so once.
 */
export function playOwing(tuple: Tuple): OwingRun {
  const s = scene(tuple, {
    character: { age: 50, money: 10_000 },
    cast: [
      { key: 'friend', relation: 'friend', age: 62, relationship: 60, money: 3_000, stats: { health: 12 } },
      { key: 'sibling', relation: 'sibling', age: 55, relationship: 70, money: 2_000, stats: { health: 95 } },
      { key: 'pal', relation: 'friend', age: 30, relationship: 55, money: 500, stats: { health: 95 } },
    ],
  })
  const { friend, sibling } = s.who
  const lines = (): number => s.g.log.reduce((n, row) => n + row.entries.filter((e) => /died with/.test(e.text)).length, 0)
  const state: Extra = (g) => ({
    f: [friend!.alive ? 1 : 0, g.people.includes(friend!) ? 1 : 0, readTies(g, friend!).owes, readTies(g, friend!).owesSince],
    s: [sibling!.alive ? 1 : 0, g.people.includes(sibling!) ? 1 : 0, readTies(g, sibling!).owes, readTies(g, sibling!).owesSince],
    lines: lines(),
    people: g.people.map((p) => `${p.relation}${p.alive ? '' : '+'}`),
  })
  s.step('owing|lends', (g) => {
    for (const p of [friend!, sibling!]) updateTies(g, p, (t) => { t.owes = 40_000; t.owesSince = g.year - 3; t.given = 40_000 })
    sibling!.alive = false
    sibling!.data.diedYear = g.year - 1
    sibling!.data.diedAge = g.character.age - 1
  }, state)
  s.step('owing|year of relationships', (g) => {
    g.character.age += 1
    g.year += 1
    g.yearActions = {}
    yearlyRelationships(g)
    g.queue = []
  }, state)
  s.step('owing|year of wealth', (g) => {
    yearlyWealth(g)
    g.queue = []
  }, state)
  return { rows: s.rows, game: s.g, friend: friend!, sibling: sibling!, lines }
}

// ---------------------------------------------------------------------------------------------------------------------
// (e) Relatives employed at a firm the designated sibling adopts (nepo-year.ts cleanup, :456-469)

export const NEPO_TUPLE: Tuple = [135, 2026]

export interface NepoRun {
  rows: ParityRow[]
  after: GameState
  hired: Record<string, boolean>
}

/**
 * The family firm ($12M, plain, unmortgaged), a designated successor who is employed at it, a different will heir, one more child
 * and one sibling of the late player on the payroll. The parent dies, the will heir carries on, the successor holds the firm as an NPC
 * company (sibling-firm.test.ts), and two family years run for the people who still hold a job record at a firm the player no longer
 * owns: who keeps `data.nepo`, who has a past, what their occupation says.
 */
export function playNepo(tuple: Tuple = NEPO_TUPLE): NepoRun {
  const { g, a, b } = world(tuple[0], { age: 78, year: tuple[1] })
  const successor = kid(g, 39, { smarts: 88 })
  const willHeir = kid(g, 36, { smarts: 65 })
  const other = kid(g, 33, { smarts: 70 })
  const uncle = kid(g, 60, { smarts: 55, relation: 'sibling' })
  const hired: Record<string, boolean> = {
    successor: hireRelative(g, a, b, successor, { rank: 2 }, { quiet: true }).ok,
    other: hireRelative(g, a, b, other, { rank: 1 }, { quiet: true }).ok,
    uncle: hireRelative(g, a, b, uncle, { rank: 1 }, { quiet: true }).ok,
  }
  hired.designated = designateSuccessor(g, a, b, successor, { quiet: true }).ok
  g.character.willBeneficiaries = [willHeir.id]
  a.value = 12_000_000
  g.character.money = 0
  g.queue = []
  const ids = { successor: successor.id, willHeir: willHeir.id, other: other.id, uncle: uncle.id }
  const state: Extra = (gg) => ({
    hired,
    jobs: gg.people.map((p) => {
      const j = readJob(p)
      const past = readPast(p)
      return [p.id, p.relation, j === null ? null : [j.assetId === a.id ? 'firm' : j.assetId, j.rank], past === null ? null : [past.assetId === a.id ? 'firm' : past.assetId, past.how], p.occupation, p.data.nepo === undefined ? 0 : 1]
    }),
    who: Object.entries(ids).map(([k, id]) => [k, gg.people.some((p) => p.id === id) ? 1 : 0]),
    held: gg.people.map((p) => (p.data.npcCompany === undefined ? 0 : 1)),
    assets: gg.assets.length,
  })
  const rows: ParityRow[] = [snapshot('nepo|before', g, state)]
  killCharacter(g, 'Old Age')
  g.queue = []
  const n = continueAsChild(g, willHeir.id)
  n.queue = []
  rows.push(snapshot('nepo|handed over', n, state))
  for (let y = 1; y <= 2; y++) {
    n.year += 1
    n.character.age += 1
    n.yearActions = {}
    familyYear(n)
    drain(n)
    rows.push(snapshot(`nepo|family year ${y}`, n, state))
  }
  return { rows, after: n, hired }
}

// ---------------------------------------------------------------------------------------------------------------------
// (f) The heirs of a stake, for relatives whose own husband, wife or children are only a name and a count

export const STAKE_RELATIONS = ['sibling', 'child', 'grandchild'] as const

/**
 * familyStakeHeirs of a sibling, a child and a grandchild with `married` and `kids` set (an NPC family is two keys and no records):
 * the list is empty, "the stake leaves the family records". Beside each, the same relative with neither key, and the people the
 * answer reads (a living parent for a sibling, a living grandchild for a child, a living child for a grandchild).
 */
export function stakeRows(): ParityRow[] {
  const rows: ParityRow[] = []
  for (const rel of STAKE_RELATIONS) {
    for (const ctx of [false, true]) {
      for (const [married, kids] of [[false, 0], [true, 0], [false, 2], [true, 2]] as const) {
        const cast: CastSpec[] = []
        const data: Record<string, number | boolean> = {}
        if (married) data.married = true
        if (kids > 0) data.kids = kids
        cast.push({ key: 'dead', relation: rel, age: 52, relationship: 60, data, stats: { health: 40 } })
        if (ctx) {
          if (rel === 'sibling') cast.push({ key: 'ctx', relation: 'parent', age: 80, relationship: 60 })
          if (rel === 'child') cast.push({ key: 'ctx', relation: 'grandchild', age: 10, relationship: 70, data: { parentId: 'p1' } })
          if (rel === 'grandchild') cast.push({ key: 'ctx', relation: 'child', age: 40, relationship: 70 })
        }
        cast.push({ key: 'other', relation: rel === 'sibling' ? 'sibling' : 'friend', age: 50, relationship: 50 })
        const s = scene([61, 2026], { character: { age: 55 }, cast })
        const dead = s.who.dead!
        if (rel === 'grandchild' && ctx) dead.data.parentId = s.who.ctx!.id
        dead.alive = false
        s.step(`stake|${rel}|${ctx ? 'ctx' : 'bare'}|${married ? 'm' : '-'}${kids}`, () => undefined, (g) => ({ heirs: familyStakeHeirs(g, dead), me: g.character.id }))
        rows.push(...s.rows)
      }
    }
  }
  return rows
}

/**
 * The same answer where it matters: a family firm whose co-owners include four late relatives, settled by settleLateFamilyOwners
 * (a hand-over runs it first, life.ts:1186). A married sibling's tenth leaves the family records; a single sibling's goes to their
 * parents or to the player and the siblings; a child with a grandchild on the list passes it to the grandchild; a child with kids
 * and no records loses it. `share` is the player's, `family` the others' stakes after.
 */
export function playCoOwners(tuple: Tuple = [136, 2026]): ParityRow[] {
  const { g, a } = world(tuple[0], { age: 70, year: tuple[1] })
  const b = bizOf(g, a)
  const parent = kid(g, 90, { relation: 'child' })
  parent.relation = 'parent'
  const sibMarried = kid(g, 52, { relation: 'sibling' })
  const sibSingle = kid(g, 50, { relation: 'sibling' })
  const childGrand = kid(g, 40, { relation: 'child' })
  const childKids = kid(g, 38, { relation: 'child' })
  const grand = kid(g, 12, { relation: 'child' })
  grand.relation = 'grandchild'
  grand.data.parentId = childGrand.id
  sibMarried.data.married = true
  sibMarried.data.kids = 2
  childKids.data.married = true
  childKids.data.kids = 1
  const dead = [sibMarried, sibSingle, childGrand, childKids]
  for (const p of dead) p.alive = false
  b.share = 0.6
  b.familyShares = dead.map((p) => ({ id: p.id, share: 0.1 }))
  const names = ['sibMarried', 'sibSingle', 'childGrand', 'childKids']
  const state: Extra = (gg) => {
    const cur = bizOf(gg, findBusiness(gg, a.id)!)
    return {
      share: Math.round(cur.share * 1e6) / 1e6,
      family: (cur.familyShares ?? []).map((f) => [names[dead.findIndex((p) => p.id === f.id)] ?? (f.id === parent.id ? 'parent' : f.id === grand.id ? 'grand' : f.id), Math.round(f.share * 1e6) / 1e6]),
      lines: gg.log.reduce((n, row) => n + row.entries.filter((e) => /passed to/.test(e.text)).length, 0),
    }
  }
  const rows: ParityRow[] = [snapshot('co-owners|before', g, state)]
  settleLateFamilyOwners(g)
  rows.push(snapshot('co-owners|settled', g, state))
  settleLateFamilyOwners(g)
  rows.push(snapshot('co-owners|settled again', g, state))
  return rows
}
