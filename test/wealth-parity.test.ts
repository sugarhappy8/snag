// ci: fast
// R4-E3 (X2, X30): the wealth oracle. R4 routes every change to Person.relationship through one shim (R4-E5), mirrors it into the
// Edge (R4-E7) and puts a shared popup budget over the family choices (R4-E9). None of that may move what a rich player is asked,
// what an answer costs or what it does to the asker. This file plays the wealth system on the engine as it is, records the numbers
// (test/fixtures/social-parity-wealth.json, made with test/social-parity-kit.ts under Node 22) and compares every later run to them.
// It moves nothing and changes no source. The rows hold no text: relationships, g.rng, g.nextId, the queue's kinds, the player's cash,
// and under `x` the asker's cash, entitlement, the WealthTies fields and the counts the area owns.
//
// What is played, in the order of the rows (a row's label starts with its part):
//   tier   wealthTier, TIER_RATE and popupBudget over the net worth / typical income ratio, the country and the year, with and
//          without the show-off heat, and prison (a letter at most)
//   cand   requestCandidates, the weight of every candidate of the two households of test/wealth-catalog.test.ts, read from a
//          frozen state with a trapped g.rng (a read that draws or writes throws)
//   ask    the answer matrix: every ask of the catalog (57) built for its asker, presented and answered with every option the popup
//          offers, a slider answered at its middle and at its top
//   ent    the entitlement ladder: addEntitlement up and down across the 'spoiled' pill, gratitude and sting, fair and indulgent
//          parenting by the record of yes and no
//   allow  an allowance paid until the cash runs out (two missed years stop it), a new adult kept or cut off, a disowned child, and the
//          bounds of 0 and 100
//   loan   repayOdds over relationship, entitlement, traits and cash, and loans collected for twelve years
//   pop    the wealth popups a year for 30 years at tiers 2 to 4, unanswered, and one answered life; the 3 a year budget and the
//          counts R4-E9's control run (familyLive false) must reproduce are numbers here
//
// A household here is the catalog test's, built with the kit so that building it draws nothing (every trait and every field is
// given); the catalog test rolls its people. The lives are tuples ([seed, year], X30), constants: nothing here searches.
// Record: RECORD_SOCIAL_PARITY=wealth RECORD_REASON="..." wt/bin/vt22 test/wealth-parity.test.ts
import { describe, expect, it } from 'vitest'
import { yearlyWealth, popupBudget, requestCandidates } from '../src/game/events/wealth'
import type { AskDef } from '../src/game/events/wealth-ask'
import { askDefs } from '../src/game/events/wealth-catalog'
import {
  TIER_AT,
  TIER_POPUP_CAP,
  TIER_RATE,
  WEALTH_POPUP_CAP,
  addEntitlement,
  entitlement,
  gratitude,
  noteCashGift,
  readTies,
  recordAsk,
  repayOdds,
  sting,
  typicalIncome,
  upbringing,
  updateTies,
  wealthRatio,
  wealthTier,
} from '../src/game/events/wealth-core'
import { setAllowance } from '../src/game/events/wealth-kids'
import { askChoices, presentAsk, readAsk } from '../src/game/events/wealth-resolve'
import { runScript } from '../src/game/scripts'
import { familyLive } from '../src/game/society/contract'
import type { ChoiceModal, GameState, InputModal, ModalItem, Person } from '../src/game/types'
import { socialOn } from '../src/game/world/social'
import { deepFreeze } from './fuzz-kit'
import {
  compareRows,
  expectRows,
  isRecording,
  oracle,
  readRows,
  recordRows,
  scene,
  snapshot,
  trapRng,
  type CastSpec,
  type Extra,
  type ParityRow,
  type Scene,
  type Tuple,
  stampStats,
  withStamped,
} from './social-parity-kit'

const ORACLE = oracle('wealth')

// ---------------------------------------------------------------------------------------------------------------------
// Households

interface Config {
  id: string
  tuple: Tuple
  country: string
  money: number
  young: boolean
}

/** The catalog test's two households: a single 40-year-old with kids of 8 and 17, and a 66-year-old with a big family. */
function household(c: Config): Scene {
  const year = c.tuple[1]
  const cast: CastSpec[] = c.young
    ? [
        { key: 'kid8', relation: 'child', age: 8, relationship: 60 },
        { key: 'kid17', relation: 'child', age: 17, relationship: 60 },
        { key: 'mom', relation: 'parent', age: 66, relationship: 60, money: 100 },
        { key: 'sibM', relation: 'sibling', age: 35, relationship: 60, data: { married: true } },
        { key: 'sib', relation: 'sibling', age: 30, relationship: 60 },
        { key: 'pal', relation: 'friend', age: 41, relationship: 60, traits: ['manipulative', 'funny'], data: { w: { by: 'player', yes: 1 } } },
      ]
    : [
        { key: 'kid5', relation: 'child', age: 5, relationship: 60 },
        { key: 'kid9', relation: 'child', age: 9, relationship: 60 },
        { key: 'kid12', relation: 'child', age: 12, relationship: 60 },
        { key: 'kid16', relation: 'child', age: 16, relationship: 60 },
        { key: 'kid19', relation: 'child', age: 19, relationship: 60, occupation: 'University Student' },
        { key: 'kid22', relation: 'child', age: 22, relationship: 60 },
        { key: 'kid26', relation: 'child', age: 26, relationship: 60, stats: { smarts: 70 } },
        { key: 'kid33', relation: 'child', age: 33, relationship: 60 },
        { key: 'kid45', relation: 'child', age: 45, relationship: 60 },
        // A spoiled adult kid who just wrecked the car you bought them.
        { key: 'wreck', relation: 'child', age: 27, relationship: 60, data: { entitlement: 75, w: { by: 'player', marks: { crash: year } } } },
        { key: 'gk', relation: 'grandchild', age: 10, relationship: 60 },
        { key: 'spouse', relation: 'spouse', age: 60, relationship: 60, livesWithPlayer: true },
        { key: 'mom', relation: 'parent', age: 88, relationship: 60, money: 100 },
        { key: 'sibM', relation: 'sibling', age: 63, relationship: 60, data: { married: true } },
        { key: 'abroad', relation: 'sibling', age: 60, relationship: 60, data: { countryId: c.country === 'us' ? 'ng' : 'us' } },
        { key: 'f0', relation: 'friend', age: 40, relationship: 60, traits: ['sneaky', 'lazy'] },
        { key: 'f1', relation: 'friend', age: 50, relationship: 60, traits: ['kind', 'honest'] },
        { key: 'f2', relation: 'friend', age: 60, relationship: 60, traits: ['kind', 'honest'] },
      ]
  const s = scene(c.tuple, { character: { age: c.young ? 40 : 66, money: c.money, countryId: c.country, residence: { status: 'owned', assetId: 'h' } }, cast })
  const g = s.g
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  g.assets.push({ id: 'h', kind: 'house', name: 'House', emoji: '\u{1F3E0}', purchasePrice: 500_000, value: 500_000, condition: 70, purchasedAge: 30, upkeep: 0, details: {} })
  g.character.hidden.fame = 70
  return s
}

/** The households the answer matrix and the weights are read from. Together they build every one of the 57 asks. */
const CONFIGS: readonly Config[] = [
  { id: 'old900', tuple: [5, 2026], country: 'us', money: 900_000_000, young: false },
  { id: 'young3', tuple: [6, 2026], country: 'us', money: 3_000_000, young: true },
  { id: 'young900', tuple: [7, 2026], country: 'us', money: 900_000_000, young: true },
  { id: 'old3', tuple: [8, 1996], country: 'ng', money: 3_000_000, young: false },
]

const tierOf = (g: GameState): number => Math.max(1, wealthTier(g))

/** The asker an ask is built for in this state: the first person who passes `when`, nobody for an outsider's ask, null when the ask does not come up. */
function askerOf(g: GameState, def: AskDef, tier: number): Person | undefined | null {
  if (!def.people) return def.when && !def.when(g, tier) ? null : undefined
  for (const p of def.people(g)) if (!def.when || def.when(g, tier, p)) return p
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// The shape of a row's x

const ties = (g: GameState, p: Person | undefined): (number | string)[] | null => {
  if (p === undefined) return null
  const t = readTies(g, p)
  const last = t.history[t.history.length - 1]
  return [
    t.allowance,
    t.missed,
    t.adultOk ? 1 : 0,
    t.owes,
    t.owesSince,
    t.given,
    t.yes,
    t.no,
    t.asked,
    t.bound,
    t.car ? t.car.price : 0,
    last ? `${last.ans}:${last.amt}` : '',
    Object.keys(t.marks).sort().join(','),
  ]
}

/** The other keys on a person's data that an answer sets (collegePaid, gradPaid ...), without the ones the ties own. */
const dataKeys = (p: Person | undefined): string => (p === undefined ? '' : Object.keys(p.data).filter((k) => !['countryId', 'w', 'entitlement', 'married'].includes(k)).sort().join(','))

const askerX =
  (p: Person | undefined): Extra =>
  (g) => ({ ent: p ? entitlement(p) : null, h: g.character.stats.happiness, k: g.character.hidden.karma, pm: p ? p.money : null, t: ties(g, p), d: dataKeys(p) })

// ---------------------------------------------------------------------------------------------------------------------
// Part 1: tiers

const RATIOS = [0, 10, 24.9, 25, 79.9, 80, 399, 400, 3_999, 4_000, 100_000]
const WORLD: readonly (readonly [country: string, year: number])[] = [
  ['us', 2026],
  ['us', 1996],
  ['us', 1952],
  ['us', 1912],
  ['ng', 2026],
  ['ng', 1977],
  ['jp', 2026],
  ['jp', 1952],
  ['gb', 1996],
  ['gb', 1912],
]

function tierRows(): ParityRow[] {
  const s = scene([3, 2026], { character: { age: 45 } })
  for (const [country, year] of WORLD) {
    s.step(`tier|${country}|${year}`, (x) => {
      x.character.countryId = country
      x.year = year
    }, (x) => {
      const ti = typicalIncome(x)
      const tiers: number[] = []
      const rates: number[] = []
      const budgets: number[] = []
      const prison: number[] = []
      for (const r of RATIOS) {
        x.character.money = r * ti
        const t = wealthTier(x)
        tiers.push(t)
        rates.push(TIER_RATE[Math.min(t, TIER_RATE.length - 1)] ?? 0)
        budgets.push(popupBudget(x, t))
        x.character.prison = {} as never
        prison.push(popupBudget(x, t))
        x.character.prison = null
      }
      return { ti, tiers, rates, budgets, prison }
    })
  }
  // The show-off heat makes you look richer than you are, up to 35%.
  s.step('tier|heat', (x) => {
    x.character.countryId = 'us'
    x.year = 2026
  }, (x) => {
    const ti = typicalIncome(x)
    const out: number[] = []
    for (const heat of [0, 0.2, 0.35, 0.9]) {
      x.flags['lux.heat'] = heat
      for (const r of [20, 60, 70, 300, 3_000]) {
        x.character.money = r * ti
        out.push(wealthTier(x))
      }
    }
    delete x.flags['lux.heat']
    return { ti, tiers: out }
  })
  // The ratio itself: net worth counts the house and the debts.
  s.step('tier|ratio', (x) => {
    x.character.money = 2_000_000
    x.assets.push({ id: 'h', kind: 'house', name: 'House', emoji: 'x', purchasePrice: 500_000, value: 800_000, condition: 70, purchasedAge: 30, upkeep: 0, details: {} })
  }, (x) => ({ ratio: wealthRatio(x), tier: wealthTier(x), at: [...TIER_AT], cap: [...TIER_POPUP_CAP], hard: WEALTH_POPUP_CAP }))
  return s.rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 2: the weights of the candidates

function candidateRows(): ParityRow[] {
  const rows: ParityRow[] = []
  for (const c of [CONFIGS[0]!, CONFIGS[1]!]) {
    const g = household(c).g
    const tier = tierOf(g)
    // A state that cannot be written to and cannot draw: the weights are a read.
    const f = deepFreeze(trapRng(structuredClone(g)))
    const byAsk = new Map<string, [number, number][]>()
    for (const cand of requestCandidates(f, tier)) {
      const list = byAsk.get(cand.def.id) ?? []
      list.push([cand.p ? f.people.indexOf(cand.p) : -1, Math.round(cand.w * 1e6) / 1e6])
      byAsk.set(cand.def.id, list)
    }
    for (const def of askDefs()) {
      const list = byAsk.get(def.id)
      if (list !== undefined) rows.push(snapshot(`cand|${c.id}|${def.id}`, g, () => ({ w: list })))
    }
    rows.push(snapshot(`cand|${c.id}|all`, g, () => ({ n: [...byAsk.values()].reduce((n, l) => n + l.length, 0), kinds: byAsk.size, tier })))
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 3: the answer matrix

/** What a follow-up slider answers: its default (the middle), or its top. */
type Slide = 'mid' | 'max'

/** Answers every follow-up popup the answer queued (a slider; at most three deep). Returns whether there was one. */
function followUps(g: GameState, start: number, slide: Slide): boolean {
  let any = false
  for (let k = 0; k < 3; k++) {
    const f = g.queue.find((x, i) => i >= start && x.kind === 'input') as InputModal | undefined
    if (f === undefined) break
    any = true
    g.queue = g.queue.filter((x) => x !== f)
    const v = slide === 'max' ? String(f.max ?? 0) : (f.defaultValue ?? String(f.max ?? 0))
    runScript(g, f.scriptId, v, f.data, f)
  }
  return any
}

function matrixRows(): ParityRow[] {
  const rows: ParityRow[] = []
  for (const c of CONFIGS) {
    const tier = tierOf(household(c).g)
    for (const def of askDefs()) {
      // Each ask is played in the first household that builds it.
      if (seenAsks.has(def.id)) continue
      // The ask and its options, built in a state of its own; every answer then starts from that same state.
      const first = household(c).g
      const p0 = askerOf(first, def, tier)
      if (p0 === null) continue
      const ask = def.build(first, tier, p0)
      if (ask === null) continue
      seenAsks.add(def.id)
      const label = `ask|${c.id}|${def.id}|${p0 ? `${p0.relation}${p0.age}` : 'world'}`
      for (const choice of askChoices(first, ask)) {
        for (const slide of ['mid', 'max'] as const) {
          const g = household(c).g
          const p = askerOf(g, def, tier) ?? undefined
          const a = def.build(g, tier, p)!
          presentAsk(g, a)
          const m = g.queue.pop() as ChoiceModal
          const start = g.queue.length
          runScript(g, m.scriptId!, choice.id, m.data, m)
          const slid = followUps(g, start, slide)
          if (slide === 'max' && !slid) continue
          rows.push(snapshot(`${label}|${choice.id}${slid ? `@${slide}` : ''}`, g, askerX(p)))
        }
      }
    }
  }
  return rows
}

/** The asks the matrix played. */
const seenAsks = new Set<string>()

// ---------------------------------------------------------------------------------------------------------------------
// Part 4: entitlement

function entitlementRows(): ParityRow[] {
  const s = scene([9, 2026], { cast: [{ key: 'kid', relation: 'child', age: 12, relationship: 60 }, { key: 'twin', relation: 'child', age: 12, relationship: 60, data: { entitlement: 0 } }] })
  const { kid, twin } = s.who
  const x: Extra = (g) => ({ e: entitlement(kid!), pill: kid!.traits.includes('spoiled') ? 1 : 0, up: upbringing(g, kid!) })
  // What a gift and a refusal are worth to someone this spoiled: gratitude for a base of 8 and 3, sting for a base of 6 and 2.
  for (const e of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    s.step(`ent|worth|${e}`, () => {
      twin!.data.entitlement = e
    }, () => ({ grat: [gratitude(twin!, 8), gratitude(twin!, 3)], sting: [sting(twin!, 6), sting(twin!, 2)] }))
  }
  s.step('ent|start', () => undefined, x)
  for (let i = 1; i <= 16; i++) s.step(`ent|up|${i}`, () => addEntitlement(kid!, 5), x)
  for (let i = 1; i <= 8; i++) s.step(`ent|down|${i}`, () => addEntitlement(kid!, -9), x)
  s.step('ent|floor', () => addEntitlement(kid!, -500), x)
  s.step('ent|ceiling', () => addEntitlement(kid!, 5000), x)
  s.step('ent|fresh', () => {
    kid!.data.entitlement = 0
    kid!.traits = kid!.traits.filter((t) => t !== 'spoiled')
  }, x)
  // Upbringing is the mix of yes and no they have heard: indulgent, strict, fair.
  const record = (g: GameState, what: string, ans: 'yes' | 'no'): void => recordAsk(g, kid!, what, ans, 100)
  for (let i = 1; i <= 4; i++) s.step(`ent|yes|${i}`, (g) => record(g, 'a thing', 'yes'), x)
  for (let i = 1; i <= 8; i++) s.step(`ent|no|${i}`, (g) => record(g, 'a thing', 'no'), x)
  for (let i = 1; i <= 4; i++) s.step(`ent|mix|${i}`, (g) => record(g, 'a thing', i % 2 === 0 ? 'yes' : 'no'), x)
  // A plain cash gift counts as given, and a big one spoils a kid like any other windfall.
  for (const amt of [10, 500, 5_000, 50_000, 5_000_000]) s.step(`ent|gift|${amt}`, (g) => noteCashGift(g, kid!, amt), (g) => ({ ...(x(g) as object), given: readTies(g, kid!).given }))
  return s.rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 5: allowances

/** One wealth year, as the game runs it: everyone is a year older, the year's actions are reset, then the hook. */
function wealthYear(g: GameState): ModalItem[] {
  g.year += 1
  g.character.age += 1
  for (const p of g.people) if (p.alive) p.age += 1
  g.yearActions = {}
  const before = g.queue.length
  yearlyWealth(g)
  return g.queue.slice(before)
}

function allowanceRows(): ParityRow[] {
  const rows: ParityRow[] = []
  // 1. An allowance for a teenager and a young adult, paid until the cash runs out; two missed years stop it.
  {
    const s = scene([11, 2026], {
      character: { age: 45, money: 60_000, countryId: 'us', residence: { status: 'renting', rent: 0 } },
      cast: [
        { key: 'teen', relation: 'child', age: 15, relationship: 60, livesWithPlayer: true },
        { key: 'adult', relation: 'child', age: 20, relationship: 60 },
        { key: 'spouse', relation: 'spouse', age: 44, relationship: 70, livesWithPlayer: true },
      ],
    })
    const { teen, adult } = s.who
    const x: Extra = (g) => ({ a: [readTies(g, teen!).allowance, readTies(g, adult!).allowance], miss: [readTies(g, teen!).missed, readTies(g, adult!).missed], given: [readTies(g, teen!).given, readTies(g, adult!).given], ent: [entitlement(teen!), entitlement(adult!)], tier: wealthTier(g) })
    s.step('allow|set', (g) => {
      setAllowance(g, teen!, 5_000)
      setAllowance(g, adult!, 9_000)
      g.queue = []
    }, x)
    for (let y = 1; y <= 8; y++) s.step(`allow|year|${y}`, (g) => {
      wealthYear(g)
      g.queue = []
    }, x)
    s.step('allow|reset', (g) => {
      g.character.money = 500_000
      setAllowance(g, teen!, 500)
      g.queue = []
    }, x)
    for (let y = 1; y <= 3; y++) s.step(`allow|again|${y}`, (g) => {
      wealthYear(g)
      g.queue = []
    }, x)
    rows.push(...s.rows)
  }
  // 2. A teenager who turns 18 on an allowance: the one popup, answered both ways in two lives.
  for (const answer of ['keep', 'stop'] as const) {
    const s = scene([12, 2026], {
      character: { age: 45, money: 200_000, countryId: 'us', residence: { status: 'renting', rent: 0 } },
      cast: [{ key: 'kid', relation: 'child', age: 17, relationship: 60, livesWithPlayer: true }],
    })
    const { kid } = s.who
    const x: Extra = (g) => ({ a: readTies(g, kid!).allowance, ok: readTies(g, kid!).adultOk ? 1 : 0, miss: readTies(g, kid!).missed, ent: entitlement(kid!) })
    s.step(`allow|${answer}|set`, (g) => {
      setAllowance(g, kid!, 3_000)
      g.queue = []
    }, x)
    s.step(`allow|${answer}|turns18`, (g) => {
      wealthYear(g)
    }, x)
    s.step(`allow|${answer}|answer`, (g) => {
      const m = g.queue.find((q) => q.kind === 'choice' && q.scriptId === 'wealth.allowance.adult') as ChoiceModal
      g.queue = g.queue.filter((q) => q !== m)
      runScript(g, m.scriptId!, answer, m.data, m)
      g.queue = []
    }, x)
    for (let y = 1; y <= 3; y++) s.step(`allow|${answer}|year|${y}`, (g) => {
      wealthYear(g)
      g.queue = []
    }, x)
    rows.push(...s.rows)
  }
  // 3. An allowance stops for someone disowned.
  {
    const s = scene([13, 2026], {
      character: { age: 45, money: 80_000, countryId: 'us', residence: { status: 'renting', rent: 0 } },
      cast: [{ key: 'kid', relation: 'child', age: 22, relationship: 60 }, { key: 'sib', relation: 'sibling', age: 40, relationship: 55 }],
    })
    const { kid, sib } = s.who
    const x: Extra = (g) => ({ a: [readTies(g, kid!).allowance, readTies(g, sib!).allowance], given: [readTies(g, kid!).given, readTies(g, sib!).given] })
    s.step('allow|disown|set', (g) => {
      setAllowance(g, kid!, 4_000)
      setAllowance(g, sib!, 2_000)
      g.queue = []
    }, x)
    s.step('allow|disown|year', (g) => {
      kid!.data.disowned = true
      wealthYear(g)
      g.queue = []
    }, x)
    rows.push(...s.rows)
  }
  // 4. The bounds: a raise for someone who already thinks the world of you tops out at 100, a cut for one who barely does floors at 0.
  {
    const s = scene([16, 2026], {
      character: { age: 45, money: 80_000, countryId: 'us', residence: { status: 'renting', rent: 0 } },
      cast: [
        { key: 'fan', relation: 'child', age: 22, relationship: 99 },
        { key: 'cold', relation: 'child', age: 22, relationship: 2 },
      ],
    })
    const { fan, cold } = s.who
    const x: Extra = (g) => ({ a: [readTies(g, fan!).allowance, readTies(g, cold!).allowance], ent: [entitlement(fan!), entitlement(cold!)] })
    s.step('allow|bounds|raise', (g) => {
      updateTies(g, cold!, (t) => void (t.allowance = 8_000))
      setAllowance(g, fan!, 12_000)
      g.queue = []
    }, x)
    s.step('allow|bounds|cut', (g) => {
      setAllowance(g, cold!, 0)
      g.queue = []
    }, x)
    rows.push(...s.rows)
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 6: loans

const TRAIT_SETS: readonly (readonly string[])[] = [['calm', 'funny'], ['honest', 'calm'], ['sneaky', 'calm'], ['honest', 'sneaky']]

function loanRows(): ParityRow[] {
  const rows: ParityRow[] = []
  // repayOdds is a pure function of who they are: relationship, entitlement, traits, whether they have the money.
  const grid = scene([14, 2026], { cast: [{ key: 'p', relation: 'sibling', age: 40, relationship: 50 }] })
  const q = grid.who.p!
  for (const rel of [0, 15, 50, 85, 100]) {
    for (const ent of [0, 50, 100]) {
      grid.step(`loan|odds|${rel}|${ent}`, () => {
        q.relationship = rel
        q.data.entitlement = ent
      }, () => {
        const out: number[] = []
        for (const traits of TRAIT_SETS) {
          q.traits = [...traits]
          for (const cash of [0, 10_000]) {
            q.money = cash
            out.push(repayOdds(q, 5_000))
          }
        }
        return { o: out }
      })
    }
  }
  rows.push(...grid.rows)
  // Twelve years of loans collected: an honest sibling with the money, a friend with none, a child with a little.
  const s = scene([15, 2026], {
    character: { age: 45, money: 30_000, countryId: 'us', residence: { status: 'renting', rent: 0 } },
    cast: [
      { key: 'sib', relation: 'sibling', age: 41, relationship: 60, money: 20_000, traits: ['honest', 'kind'] },
      { key: 'pal', relation: 'friend', age: 39, relationship: 55, money: 0, traits: ['sneaky', 'lazy'] },
      { key: 'kid', relation: 'child', age: 24, relationship: 70, money: 5_000, traits: ['calm', 'funny'] },
    ],
  })
  const { sib, pal, kid } = s.who
  const x: Extra = (g) => ({ owes: [sib, pal, kid].map((p) => readTies(g, p!).owes), since: [sib, pal, kid].map((p) => readTies(g, p!).owesSince), cash: [sib, pal, kid].map((p) => p!.money), marks: [sib, pal, kid].map((p) => (readTies(g, p!).marks.avoid ?? 0)) })
  s.step('loan|start', (g) => {
    for (const [p, owes] of [[sib, 8_000], [pal, 5_000], [kid, 3_000]] as const) {
      updateTies(g, p!, (t) => {
        t.owes = owes
        t.owesSince = 2024
      })
    }
  }, x)
  for (let y = 1; y <= 12; y++) s.step(`loan|year|${y}`, (g) => {
    wealthYear(g)
    g.queue = []
  }, x)
  rows.push(...s.rows)
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// Part 7: the wealth popups a year

/** The wealth popups the hook just queued, as ask ids (a bundle holds several). */
function askIds(items: ModalItem[]): string[] {
  const out: string[] = []
  for (const m of items) {
    if (m.kind !== 'choice' || typeof m.scriptId !== 'string' || !m.scriptId.startsWith('wealth.')) continue
    const d = m.data as { asks?: { k: string }[] } | undefined
    if (d && Array.isArray(d.asks)) out.push(...d.asks.map((a) => a.k))
    else {
      const a = readAsk(m.data)
      if (a !== null) out.push(a.k)
    }
  }
  return out
}

const POP_MONEY: Record<number, number> = { 2: 6_000_000, 3: 40_000_000, 4: 400_000_000 }
const POP_YEARS = 30

function familyOf(money: number, tuple: Tuple): Scene {
  return scene(tuple, {
    character: { age: 45, money, countryId: 'us', residence: { status: 'renting', rent: 0 } },
    cast: [
      { key: 'kid16', relation: 'child', age: 16, relationship: 70, livesWithPlayer: true },
      { key: 'kid9', relation: 'child', age: 9, relationship: 70, livesWithPlayer: true },
      { key: 'kid22', relation: 'child', age: 22, relationship: 65, occupation: 'University Student' },
      { key: 'spouse', relation: 'spouse', age: 44, relationship: 75, livesWithPlayer: true },
      { key: 'mom', relation: 'parent', age: 72, relationship: 70, money: 3_000 },
      { key: 'sib', relation: 'sibling', age: 41, relationship: 60 },
      { key: 'f1', relation: 'friend', age: 46, relationship: 65 },
      { key: 'f2', relation: 'friend', age: 39, relationship: 55 },
    ],
  })
}

/** Counts per year of the unanswered lives, for the budget checks below. */
const POPUPS: Record<number, number[]> = {}

/**
 * R4-E9: the first year of the answered life in which the family was live when the year began (a loan that is out is a debt on an edge, and a
 * debt is a live stake, so the shared budget holds one choice back from the wealth asks). Only a stamped life can be: null on the plain pass.
 */
let answeredLiveFrom: number | null = null

function popupRows(): ParityRow[] {
  const rows: ParityRow[] = []
  for (const tier of [2, 3, 4]) {
    const s = familyOf(POP_MONEY[tier]!, [20 + tier, 2026])
    const counts: number[] = []
    for (let y = 1; y <= POP_YEARS; y++) {
      let ids: string[] = []
      s.step(`pop|t${tier}|${String(y).padStart(2, '0')}`, (g) => {
        const items = wealthYear(g)
        ids = askIds(items)
        counts.push(items.filter((m) => m.kind === 'choice' && typeof m.scriptId === 'string' && m.scriptId.startsWith('wealth.')).length)
      }, (g) => ({ tier: wealthTier(g), pops: counts[counts.length - 1], asks: ids.join(',') }))
      s.g.queue = []
    }
    POPUPS[tier] = counts
    rows.push(...s.rows)
  }
  // One life answered: a different option every year, the sliders at their middle. The asks change the people, and the people the asks.
  const s = familyOf(POP_MONEY[3]!, [30, 2026])
  const kids = [s.who.kid16!, s.who.kid9!, s.who.kid22!]
  answeredLiveFrom = null
  for (let y = 1; y <= POP_YEARS; y++) {
    s.step(`pop|answered|${String(y).padStart(2, '0')}`, (g) => {
      if (answeredLiveFrom === null && socialOn(g) && familyLive(g)) answeredLiveFrom = y
      wealthYear(g)
      for (let guard = 0; g.queue.length > 0 && guard < 60; guard++) {
        const m = g.queue.shift()!
        const start = g.queue.length
        if (m.kind === 'choice' && m.scriptId && m.choices.length > 0) runScript(g, m.scriptId, m.choices[(y + guard) % m.choices.length]!.id, m.data, m)
        else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? String(m.max ?? 0), m.data, m)
        const added = g.queue.splice(start)
        g.queue.unshift(...added)
      }
    }, (g) => ({ ent: kids.map((k) => entitlement(k)), given: kids.map((k) => readTies(g, k).given), yes: kids.map((k) => readTies(g, k).yes), no: kids.map((k) => readTies(g, k).no), up: kids.map((k) => upbringing(g, k)) }))
  }
  rows.push(...s.rows)
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------

let played: ParityRow[] | null = null

/** Every part, played once per file. */
function playFresh(): ParityRow[] {
  return [...tierRows(), ...candidateRows(), ...matrixRows(), ...entitlementRows(), ...allowanceRows(), ...loanRows(), ...popupRows()]
}

function playAll(): ParityRow[] {
  if (played === null) played = playFresh()
  return played
}

const rowsOf = (prefix: string): ParityRow[] => playAll().filter((r) => r.label.startsWith(prefix))

describe('the wealth oracle', () => {
  it('the rows are the recorded ones', () => {
    const rows = playAll()
    if (isRecording(ORACLE.area)) recordRows(ORACLE, rows)
    else expectRows(ORACLE, rows)
  })

  it('plays the same rows on a stamped life: the mirror follows every number and moves none (R4-E7)', { timeout: 120_000 }, () => {
    // the matrix plays an ask the first time it meets it (seenAsks), so a second pass in this process starts from an empty set and puts it back
    const met = new Set(seenAsks)
    seenAsks.clear()
    let rows: ParityRow[]
    try {
      rows = withStamped(playFresh)
    } finally {
      seenAsks.clear()
      for (const id of met) seenAsks.add(id)
    }
    // R4-E9: every row is the recorded one, up to the first year of the answered life in which the family is live. From there the shared
    // budget keeps one choice back from the wealth asks, so that life asks one less and takes another road (the rng, the ids and the cash
    // move with it). The recorded rows are the plain engine's, and the plain pass above is still compared to the last digit.
    const cut = answeredLiveFrom
    const answeredYear = (label: string): number => (label.startsWith('pop|answered|') ? Number(label.slice('pop|answered|'.length)) : 0)
    const kept = (r: ParityRow): boolean => cut === null || answeredYear(r.label) < cut
    const report = compareRows(readRows(ORACLE).rows.filter(kept), rows.filter(kept))
    expect(report.lines.join('\n'), 'the stamped pass moved a row it should not').toBe('')
    expect(cut === null || cut > 5, `the family is live from year ${String(cut)} of the answered life: too early to be a replay`).toBe(true)
    if (cut !== null) expect(rows.filter((r) => !kept(r)).length, 'the rows left out are the answered life from the live year on').toBe(POP_YEARS - cut + 1)
    expect(stampStats().stamped, 'the replay must stamp games').toBeGreaterThan(0)
    expect(stampStats().checked, 'the replay must check the mirror').toBeGreaterThan(0)
  })

  it('plays every ask of the catalog', () => {
    playAll()
    expect(askDefs().map((d) => d.id).filter((id) => !seenAsks.has(id))).toEqual([])
    expect(seenAsks.size).toBe(57)
  })

  it('shows the budget as numbers: 0, 1, 2, 3 and 3 popups for the tiers, one letter in prison', () => {
    const g = scene([3, 2026], { character: { age: 45 } }).g
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 1, 2, 3, 3])
    expect([...TIER_RATE]).toEqual([0, 0.75, 1.5, 2.3, 3])
    g.character.prison = {} as never
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 1, 1, 1, 1])
    expect(WEALTH_POPUP_CAP).toBe(3)
  })

  it('stops an allowance after two missed years and collects a loan from the one who can pay', () => {
    const miss = rowsOf('allow|year|').map((r) => (r.x as { miss: number[]; a: number[] }))
    // 60,000 pays 14,000 a year four times; the fifth and sixth year are missed, and the second miss stops both allowances.
    expect(miss.map((m) => m.miss[0])).toEqual([0, 0, 0, 0, 1, 2, 2, 2])
    expect(miss.map((m) => m.a[0])).toEqual([5000, 5000, 5000, 5000, 5000, 0, 0, 0])
    const loans = rowsOf('loan|year|').map((r) => (r.x as { owes: number[] }).owes)
    expect(loans[loans.length - 1]![0]).toBeLessThan(8_000)
    expect(loans[loans.length - 1]![1]).toBe(5_000)
    // A raise tops out at 100 and a cut floors at 0.
    const bounds = rowsOf('allow|bounds|')
    expect(bounds[0]!.rel).toEqual([100, 2])
    expect(bounds[1]!.rel[1]).toBe(0)
  })

  it('asks at most 3 times a year at any tier, and the counts are the ones recorded', () => {
    playAll()
    for (const tier of [2, 3, 4]) {
      const counts = POPUPS[tier]!
      expect(counts).toHaveLength(POP_YEARS)
      expect(Math.max(...counts)).toBeLessThanOrEqual(Math.min(WEALTH_POPUP_CAP, TIER_POPUP_CAP[tier]!))
    }
  })
})
