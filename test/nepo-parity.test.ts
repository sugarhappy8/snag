// ci: fast
// R4-E4 (X2, X30, C11): the nepo and dynasty oracle, recorded on the unmodified tree with the social parity kit (test/social-parity-kit.ts).
// R4 puts Person.relationship behind one door (R4-E5), mirrors it into the Edge (R4-E7) and heirs carry edges across a generation
// (R4-L9). The family business writes a relative's relationship in more than a dozen places (hire, promote, demote, fire, make CEO,
// name a successor, the year's quits and sibling spats), moves their pay through the books, and decides who inherits a late
// co-owner's stake. None of that may move on a life nobody stamped. Three parts, one recording (test/fixtures/social-parity-nepo.json):
//
//   the model     the pure model of how good a relative is at the job (business/nepo-model.ts) over 24 fixed people: drive,
//                 aptitude, ceiling, the skill they start with, the outlook at every rank, twelve years of practice at two ranks,
//                 and the staff's view of a job (unearned, overHead) over a grid. No dice: it pins that nothing rereads a
//                 relative's data through a new door.
//   companies     three companies from the nepo kit (test/nepo-kit.ts), scripted: hire, promote, demote, setPay, fire, make CEO,
//                 name a successor, hand the company over, replace a CEO, with twelve years or more of familyYear between them. A row
//                 holds every person's relationship, g.rng, g.nextId, the queue, the player's cash (the kit's columns) and, as
//                 x, the company's cash, costs and morale, the family state (resent, label, the penalty the staff feel, the
//                 successor), every relative's job and cash, and whether the action went through. One company has a board (the
//                 votes roll), one runs out of cash for a year, one hands over at 66 by the baton popup. Ada and Dan start close to 100, so a hire meets the bound.
//   stakes        familyStakeHeirs for ten relations (spouse, parent, stepparent, grandparent, child, stepchild, grandchild,
//                 sibling, half sibling, friend) and what a late co-owner's stake does: the heirs it names, the dollars each
//                 one is paid when the company sells (payFamilyBusinessProceeds) and where the shares go
//                 (settleLateFamilyOwners). Money is conserved: the heirs are paid the whole slice or nothing, never a dollar more.
//
// A row holds no text. What an action tells the player is not recorded, so a reworded notice does not move it.
import { describe, expect, it } from 'vitest'
import { familyStakeHeirs, payFamilyBusinessProceeds, settleLateFamilyOwners } from '../src/game/business/dynasty-ownership'
import { demote, designateSuccessor, fire, handOverToSuccessor, hireRelative, makeCeo, promote, replaceCeo, setPay, unearned, type HireResult } from '../src/game/business/nepo-actions'
import { yearlyNepo } from '../src/game/business/nepo'
import { readJob } from '../src/game/business/nepo-job'
import { aptitudeOf, ceilingOf, driveOf, expectedRating, fitOf, nextSkill, outlookFor, overHead, startSkill } from '../src/game/business/nepo-model'
import { marketPay } from '../src/game/business/nepo-roles'
import { employeesOf, readFamily } from '../src/game/business/nepo-state'
import { companyEffects, familyYear } from '../src/game/business/nepo-year'
import { bizOf, type BizState } from '../src/game/business/state'
import { createPerson } from '../src/game/people'
import type { Asset, GameState, Json, Person, RelationKind } from '../src/game/types'
import { drain, kid, world, type World } from './nepo-kit'
import { GAME_SLOT, expectRows, isRecording, oracle, recordRows, scene, snapshot, type CastSpec, type ParityRow, type Tuple } from './social-parity-kit'

const ORACLE = oracle('nepo')

/** The pure model's tuple: nothing in it rolls, the seed only names the state. */
const MODEL: Tuple = [5, 2026]
/** The stakes' tuple. */
const STAKES: Tuple = [9, 2026]

/** The game being played, for the mutation test's extra draw (test/social-mutation.test.ts reads it from this slot). */
function track(g: GameState): GameState {
  ;(globalThis as Record<string, unknown>)[GAME_SLOT] = g
  return g
}

// ---------------------------------------------------------------------------------------------------------------------
// The model

interface Kin {
  key: string
  relation: RelationKind
  age: number
  smarts: number
  traits: string[]
  data?: Record<string, Json>
}

/** 24 fixed people: every trait that moves drive, a spread of smarts and ages, the spoiled, the self-made, a stand-in key, a gifted one, a trained one. */
const KIN: Kin[] = [
  { key: 'k01', relation: 'child', age: 14, smarts: 30, traits: ['calm', 'kind'] },
  { key: 'k02', relation: 'child', age: 16, smarts: 80, traits: ['ambitious', 'serious'] },
  { key: 'k03', relation: 'child', age: 18, smarts: 55, traits: ['lazy', 'funny'] },
  { key: 'k04', relation: 'child', age: 21, smarts: 12, traits: ['lazy', 'rebellious'], data: { entitlement: 70 } },
  { key: 'k05', relation: 'child', age: 22, smarts: 92, traits: ['nerdy', 'honest'] },
  { key: 'k06', relation: 'child', age: 24, smarts: 60, traits: ['arrogant', 'dramatic'], data: { entitlement: 45 } },
  { key: 'k07', relation: 'child', age: 26, smarts: 70, traits: ['sporty', 'optimistic'], data: { nepoSelfMade: 2018 } },
  { key: 'k08', relation: 'child', age: 29, smarts: 40, traits: ['anxious', 'loyal'] },
  { key: 'k09', relation: 'stepchild', age: 19, smarts: 65, traits: ['ambitious', 'optimistic'] },
  { key: 'k10', relation: 'stepchild', age: 33, smarts: 50, traits: ['serious', 'calm'], data: { entitlement: 20 } },
  { key: 'k11', relation: 'grandchild', age: 15, smarts: 85, traits: ['nerdy', 'sporty'] },
  { key: 'k12', relation: 'grandchild', age: 20, smarts: 35, traits: ['rebellious', 'arrogant'], data: { entitlement: 90 } },
  { key: 'k13', relation: 'sibling', age: 36, smarts: 58, traits: ['honest', 'loyal'] },
  { key: 'k14', relation: 'sibling', age: 41, smarts: 75, traits: ['ambitious', 'dramatic'] },
  { key: 'k15', relation: 'sibling', age: 47, smarts: 28, traits: ['lazy', 'anxious'], data: { entitlement: 30 } },
  { key: 'k16', relation: 'sibling', age: 52, smarts: 66, traits: ['calm', 'serious'] },
  { key: 'k17', relation: 'spouse', age: 44, smarts: 72, traits: ['kind', 'optimistic'] },
  { key: 'k18', relation: 'spouse', age: 58, smarts: 45, traits: ['stingy', 'jealous'] },
  { key: 'k19', relation: 'coworker', age: 31, smarts: 62, traits: ['ambitious', 'honest'], data: { kin: 'cousin', nepoSeed: 'out.Rey.Stone.cousin.31.62' } },
  { key: 'k20', relation: 'coworker', age: 38, smarts: 38, traits: ['funny', 'lazy'], data: { kin: 'brother-in-law', nepoSeed: 'out.Tomas.Reyes.brother-in-law.38.38' } },
  { key: 'k21', relation: 'child', age: 27, smarts: 88, traits: ['ambitious', 'serious'], data: { talent: 'Main Character' } },
  { key: 'k22', relation: 'child', age: 23, smarts: 48, traits: ['calm', 'kind'], data: { life: { v: 1, lastYear: 2025, country: 'us', field: 'Finance', education: 2, study: 0, skill: 60, experience: 20, income: 70_000, debt: 0, investments: 0, housing: 0, ambition: 70, employer: '', history: [], achievements: [], housingQuality: 50 } } },
  { key: 'k23', relation: 'child', age: 25, smarts: 52, traits: ['calm', 'kind'], data: { life: { v: 1, lastYear: 2025, country: 'us', field: 'Engineering', education: 1, study: 0, skill: 40, experience: 5, income: 50_000, debt: 0, investments: 0, housing: 0, ambition: 40, employer: '', history: [], achievements: [], housingQuality: 50 } } },
  { key: 'k24', relation: 'child', age: 30, smarts: 20, traits: ['spoiled', 'arrogant'], data: { entitlement: 100, nepoSelfMade: 2020 } },
]

const RANKS = [0, 1, 2, 3, 4, 5] as const

function castOf(list: readonly Kin[]): CastSpec[] {
  return list.map((k) => ({ key: k.key, relation: k.relation, age: k.age, traits: k.traits, stats: { smarts: k.smarts }, data: k.data }))
}

/** The skill a relative reaches after `years` of practice at a rank (nextSkill, the yearly step's own function). */
function curve(p: Person, rank: number, years: number, over: { kind?: 'real' | 'cushy'; groom?: boolean; mood?: number } = {}): number[] {
  const job = { skill: startSkill(p), rank, kind: over.kind ?? 'real', groom: over.groom ?? false, mood: over.mood ?? 70 }
  const out: number[] = []
  for (let y = 0; y < years; y++) {
    job.skill = nextSkill(p, job)
    out.push(job.skill)
  }
  return out
}

function playModel(): ParityRow[] {
  const s = scene(MODEL, { cast: castOf(KIN) })
  for (const k of KIN) {
    const p = s.who[k.key]!
    const start = startSkill(p)
    s.step(`model|${k.key}`, () => undefined, () => ({
      drive: driveOf(p),
      aptitude: aptitudeOf(p),
      ceiling: ceilingOf(p),
      start,
      fit: RANKS.map((r) => fitOf(start, r)),
      rating: RANKS.map((r) => expectedRating(start, r, 70)),
      mood30: RANKS.map((r) => expectedRating(start, r, 30)),
    }))
    for (const r of RANKS) s.step(`outlook|${k.key}|rank${r}`, () => undefined, () => ({ real: outlookFor(p, r), cushy: outlookFor(p, r, 'cushy'), skilled: outlookFor(p, r, 'real', 80) }))
    s.step(`growth|${k.key}`, () => undefined, () => ({
      rank1: curve(p, 1, 12),
      rank4: curve(p, 4, 12),
      groomed: curve(p, 3, 12, { groom: true }),
      unhappy: curve(p, 2, 12, { mood: 20 }),
      cushy: curve(p, 3, 4, { kind: 'cushy' }),
    }))
  }
  // The staff's view of a job and what it does to the numbers: a grid, no dice.
  const w = world(101)
  const b = w.b
  for (const rank of RANKS) {
    s.step(`view|rank${rank}`, () => undefined, () => ({
      market: marketPay(b, rank),
      unearned: [10, 40, 70, 95].map((skill) => [1, 1.5, 3].map((m) => unearned({ skill, rank, kind: 'real', pay: marketPay(b, rank) * m }, marketPay(b, rank)))),
      cushy: unearned({ skill: 20, rank, kind: 'cushy', pay: marketPay(b, rank) * 1.8 }, marketPay(b, rank)),
      over: [10, 40, 70, 95].map((skill) => overHead({ skill, rank, kind: 'real' })),
    }))
  }
  const jobs = [
    { skill: 90, rank: 3, kind: 'real' as const, focus: 'sales' as const, mood: 90, part: false },
    { skill: 10, rank: 3, kind: 'real' as const, focus: 'quality' as const, mood: 20, part: false },
    { skill: 30, rank: 3, kind: 'cushy' as const, focus: 'ops' as const, mood: 70, part: false },
    { skill: 70, rank: 1, kind: 'real' as const, focus: 'finance' as const, mood: 70, part: true },
  ]
  s.step('view|effects', () => undefined, () => ({
    one: jobs.map((j) => companyEffects(b, [{ p: s.who.k01!, job: { ...baseJob, ...j } }])),
    all: companyEffects(b, jobs.map((j) => ({ p: s.who.k01!, job: { ...baseJob, ...j } }))),
    hundred: companyEffects(b, Array.from({ length: 100 }, () => ({ p: s.who.k01!, job: { ...baseJob, ...jobs[0]! } }))),
  }))
  return s.rows
}

const baseJob = { assetId: 'a', focus: 'ops' as const, kind: 'real' as const, title: 'T', since: 2020, rankSince: 2020, pay: 1, skill: 50, mood: 70, perf: 60, raised: 0, unpaid: 0, burn: 0, part: false, groom: false, by: 'c', kin: '', rank: 1 }

// ---------------------------------------------------------------------------------------------------------------------
// The companies

/** The columns of a relative's job in a row: id, rank, 1 for a made-up job, pay, skill, mood, rating, years unpaid, burn, 1 groomed, 1 summer job, cash. */
const JOB_COLUMNS = ['id', 'rank', 'cushy', 'pay', 'skill', 'mood', 'perf', 'unpaid', 'burn', 'groom', 'part', 'money'] as const

/** What a company row also pins: the company's numbers, the family state, every relative's job and cash, and how the action went. */
function companyExtra(a: Asset, res: HireResult | null) {
  return (g: GameState): Record<string, unknown> => {
    const b = bizOf(g, a)
    const fam = readFamily(b.family)
    return {
      ...(res === null ? {} : { ok: res.ok, voted: res.voted === true }),
      cash: b.cash,
      costs: b.yearCosts,
      morale: b.morale,
      brand: b.brand,
      ceo: b.ceo,
      manager: b.manager ? [b.manager.personId ?? null, b.manager.salary, b.manager.skill] : null,
      fam: { resent: fam.resent, label: fam.label, penalty: Math.min(7, Math.round(fam.resent / 14)), succ: fam.succ, press: fam.pressYear, hand: fam.handYear, ask: fam.askYear, hires: fam.hires, fired: fam.fired },
      jobs: employeesOf(g, a.id).map((e) => [e.p.id, e.job.rank, e.job.kind === 'cushy' ? 1 : 0, e.job.pay, e.job.skill, e.job.mood, e.job.perf, e.job.unpaid, e.job.burn, e.job.groom ? 1 : 0, e.job.part ? 1 : 0, e.p.money]),
      purses: g.people.map((p) => p.money),
    }
  }
}

/** A scripted run on one company: each step runs, records its row, then answers whatever it queued. */
function lane(w: World, rows: ParityRow[], tag: string) {
  const { g, a } = w
  track(g)
  let n = 0
  const act = (label: string, fn: () => HireResult | void): HireResult | null => {
    const res = fn() ?? null
    rows.push(snapshot(`${tag}|${String(n++).padStart(2, '0')}|${label}`, g, companyExtra(a, res)))
    drain(g)
    return res
  }
  /** The same step for a relative who still has the job; a step whose relative left is recorded as such, so a closed path is a moved row. */
  const ifWorks = (p: Person, label: string, fn: () => HireResult | void): HireResult | null => (readJob(p) ? act(label, fn) : act(`${label} (gone)`, () => undefined))
  /** A year at the company: the calendar and everyone's age move on, then the family's year runs. */
  const year = (label = 'year', run: (g: GameState) => void = familyYear): void => {
    act(label, () => {
      g.year += 1
      g.yearActions = {}
      g.character.age += 1
      for (const p of g.people) p.age += 1
      run(g)
    })
  }
  const years = (n: number, label = 'year', run: (g: GameState) => void = familyYear): void => {
    for (let i = 0; i < n; i++) year(label, run)
  }
  return { g, a, b: (): BizState => bizOf(g, a), act, ifWorks, year, years }
}

function mustWork(res: HireResult | null, what: string): void {
  expect(res?.ok, `${what} must go through (a lost path must fail loudly): ${res?.reason ?? 'no result'}`).toBe(true)
}

/** An owner-run chain: every kind of move, the direct hand-over and a step down, a year with no cash, twelve years in all. */
function playOwned(): ParityRow[] {
  const rows: ParityRow[] = []
  const { g, a, b, act, ifWorks, year, years } = lane(world(101), rows, 'own')
  // Ada is close to the top of the scale: what the hire adds is cut at 100 (and the mutation test needs a change that meets the bound).
  const ada = kid(g, 25, { smarts: 70, traits: ['ambitious', 'serious'], relationship: 98 })
  const ben = kid(g, 21, { smarts: 40, traits: ['lazy', 'calm'], entitlement: 65 })
  const cy = kid(g, 16, { smarts: 55, traits: ['funny', 'kind'] })
  const di = kid(g, 34, { smarts: 50, traits: ['calm', 'honest'], relation: 'sibling' })
  const eve = kid(g, 41, { smarts: 62, traits: ['serious', 'loyal'], relation: 'spouse', gender: 'female' })
  mustWork(act('hire ada 1', () => hireRelative(g, a, b(), ada, { rank: 1 })), 'hire ada')
  mustWork(act('hire ben 3', () => hireRelative(g, a, b(), ben, { rank: 3 })), 'hire ben')
  mustWork(act('hire cy summer', () => hireRelative(g, a, b(), cy, { rank: 0 })), 'hire cy')
  mustWork(act('hire di cushy', () => hireRelative(g, a, b(), di, { rank: 3, kind: 'cushy' })), 'hire di')
  mustWork(act('hire eve quiet', () => hireRelative(g, a, b(), eve, { rank: 2, focus: 'finance' }, { quiet: true, asked: true })), 'hire eve')
  mustWork(act('raise ada', () => setPay(g, a, b(), ada, 1.3)), 'raise ada')
  act('same pay ada', () => setPay(g, a, b(), ada, 1.3))
  mustWork(act('promote ada', () => promote(g, a, b(), ada)), 'promote ada')
  mustWork(act('demote ben', () => demote(g, a, b(), ben)), 'demote ben')
  act('promote di cushy', () => promote(g, a, b(), di))
  mustWork(act('name ada heir', () => designateSuccessor(g, a, b(), ada)), 'name ada heir')
  act('name cy heir', () => designateSuccessor(g, a, b(), cy))
  mustWork(act('hand over to ada', () => handOverToSuccessor(g, a, b())), 'hand over to ada')
  years(3)
  ifWorks(ben, 'cut ben', () => setPay(g, a, b(), ben, 0.8))
  ifWorks(di, 'fire di', () => fire(g, a, b(), di))
  ifWorks(ada, 'step ada down', () => demote(g, a, b(), ada))
  years(3)
  b().cash = 0
  year('year broke')
  b().cash = 3_000_000
  years(2)
  ifWorks(eve, 'make eve ceo', () => makeCeo(g, a, b(), eve))
  years(2)
  ifWorks(eve, 'fire eve', () => fire(g, a, b(), eve))
  years(2)
  return rows
}

/** A chain with investors on the board: executive jobs, a made-up job and a big raise go to a vote that rolls, a round a year. */
function playBoard(): ParityRow[] {
  const rows: ParityRow[] = []
  // The owner keeps 80%: there is a board, and an executive job for a relative passes about three times in four.
  const { g, a, b, act, ifWorks, years } = lane(world(73, { share: 0.8 }), rows, 'board')
  const dan = kid(g, 40, { smarts: 80, traits: ['ambitious', 'honest'], relationship: 97 })
  const star = kid(g, 35, { smarts: 95, traits: ['ambitious', 'serious'] })
  const dud = kid(g, 22, { smarts: 10, traits: ['lazy'], entitlement: 70 })
  const fay = kid(g, 28, { smarts: 45, traits: ['lazy', 'funny'], entitlement: 55 })
  mustWork(act('hire dan 2', () => hireRelative(g, a, b(), dan, { rank: 2 })), 'hire dan')
  for (let round = 1; round <= 6; round++) {
    if (!readJob(star)) act(`hire star 4 round ${round}`, () => hireRelative(g, a, b(), star, { rank: 4 }, { quiet: true }))
    if (!readJob(dud)) act(`hire dud 4 round ${round}`, () => hireRelative(g, a, b(), dud, { rank: 4 }, { quiet: true }))
    if (!readJob(fay)) act(`hire fay cushy round ${round}`, () => hireRelative(g, a, b(), fay, { rank: 3, kind: 'cushy' }, { quiet: true }))
    years(1)
  }
  ifWorks(dan, 'raise dan 3x', () => setPay(g, a, b(), dan, 3))
  ifWorks(dan, 'promote dan', () => promote(g, a, b(), dan))
  ifWorks(dan, 'promote dan again', () => promote(g, a, b(), dan))
  ifWorks(dan, 'make dan ceo', () => makeCeo(g, a, b(), dan))
  ifWorks(star, 'name star heir', () => designateSuccessor(g, a, b(), star))
  years(3)
  ifWorks(dan, 'replace dan', () => replaceCeo(g, a, b(), dan, true))
  ifWorks(star, 'fire star', () => fire(g, a, b(), star))
  years(3)
  return rows
}

/** A founder of 66 who names a successor and hands the company over through the baton popup, with the asks and the life events of the full yearly step. */
function playBaton(): ParityRow[] {
  const rows: ParityRow[] = []
  const { g, a, b, act, ifWorks, years } = lane(world(133, { age: 66 }), rows, 'baton')
  const hal = kid(g, 31, { smarts: 82, traits: ['ambitious', 'loyal'] })
  const ida = kid(g, 27, { smarts: 58, traits: ['funny', 'kind'] })
  const jon = kid(g, 22, { smarts: 35, traits: ['lazy', 'rebellious'], entitlement: 80 })
  const kay = kid(g, 45, { smarts: 66, traits: ['serious', 'calm'], relation: 'sibling' })
  mustWork(act('hire hal 3', () => hireRelative(g, a, b(), hal, { rank: 3, groom: true })), 'hire hal')
  mustWork(act('hire ida 1', () => hireRelative(g, a, b(), ida, { rank: 1 })), 'hire ida')
  mustWork(act('hire jon 2', () => hireRelative(g, a, b(), jon, { rank: 2 })), 'hire jon')
  mustWork(act('hire kay 2', () => hireRelative(g, a, b(), kay, { rank: 2 })), 'hire kay')
  years(3)
  years(3, 'full year', yearlyNepo)
  act('hand over with no one named', () => handOverToSuccessor(g, a, b()))
  years(3, 'full year', yearlyNepo)
  ifWorks(hal, 'step hal down', () => demote(g, a, b(), hal))
  ifWorks(ida, 'make ida ceo', () => makeCeo(g, a, b(), ida))
  years(2)
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------
// The stakes

interface Holder {
  key: string
  relation: RelationKind
  age: number
  data?: Record<string, Json>
  /** Keys this person links to: the parent they came through, the spouse. */
  link?: { field: string; to: string }
}

/** A family wide enough that each relation has the people the rule looks for (and some it must not pick). */
const FAMILY: Holder[] = [
  { key: 'spouse', relation: 'spouse', age: 60 },
  { key: 'mom', relation: 'parent', age: 84 },
  { key: 'dad', relation: 'parent', age: 86 },
  { key: 'exDad', relation: 'parent', age: 80, data: { divorced: true } },
  { key: 'stepMom', relation: 'stepparent', age: 70, link: { field: 'viaParentId', to: 'dad' } },
  { key: 'nan', relation: 'grandparent', age: 100 },
  { key: 'kidA', relation: 'child', age: 35 },
  { key: 'kidB', relation: 'child', age: 30 },
  { key: 'kidC', relation: 'child', age: 40, data: { married: true, kids: 2 } },
  { key: 'stepKid', relation: 'stepchild', age: 24 },
  { key: 'stepKidOwn', relation: 'stepchild', age: 38, data: { kids: 1 } },
  { key: 'grandA', relation: 'grandchild', age: 8, link: { field: 'parentId', to: 'kidA' } },
  { key: 'grandB', relation: 'grandchild', age: 5, link: { field: 'parentId', to: 'kidA' } },
  { key: 'grandLone', relation: 'grandchild', age: 12 },
  { key: 'grandOwn', relation: 'grandchild', age: 30, data: { married: true } },
  { key: 'sisA', relation: 'sibling', age: 58 },
  { key: 'sisB', relation: 'sibling', age: 55, data: { kids: 2 } },
  { key: 'halfA', relation: 'halfSibling', age: 50, link: { field: 'parentId', to: 'exDad' } },
  { key: 'halfB', relation: 'halfSibling', age: 47 },
  { key: 'pal', relation: 'friend', age: 61 },
]

function castFamily(g: GameState, list: readonly Holder[]): Record<string, Person> {
  const who: Record<string, Person> = {}
  list.forEach((h, i) => {
    who[h.key] = createPerson(g, {
      relation: h.relation,
      age: h.age,
      gender: i % 2 === 0 ? 'female' : 'male',
      firstName: `Kin${i}`,
      lastName: 'Test',
      relationship: 50,
      occupation: 'Clerk',
      traits: ['kind', 'calm'],
      stats: { happiness: 60, health: 70, smarts: 50, looks: 50 },
      money: 1_000,
      data: h.data,
    })
  })
  for (const h of list) if (h.link) who[h.key]!.data[h.link.field] = who[h.link.to]!.id
  return who
}

/** The heirs of each holder by cast key ('me' for the player). */
function heirKeys(g: GameState, who: Record<string, Person>, dead: Person): string[] {
  const byId = new Map(Object.entries(who).map(([k, p]) => [p.id, k]))
  return familyStakeHeirs(g, dead).map((id) => (id === g.character.id ? 'me' : (byId.get(id) ?? id)))
}

const SLICE = 0.4
const PRICE = 1_000_000

function playStakes(): ParityRow[] {
  const rows: ParityRow[] = []
  // The rule alone, on the whole family, then with the older generation gone, then with the player's own children grown.
  const s = scene(STAKES, { cast: FAMILY.map((h) => ({ key: h.key, relation: h.relation, age: h.age, data: h.data })) })
  for (const h of FAMILY) if (h.link) s.who[h.key]!.data[h.link.field] = s.who[h.link.to]!.id
  for (const h of FAMILY) s.step(`heirs|${h.key}`, () => undefined, (g) => ({ relation: h.relation, heirs: heirKeys(g, s.who, s.who[h.key]!) }))
  s.step('heirs|older generation gone', () => {
    for (const k of ['mom', 'dad', 'exDad', 'nan', 'stepMom']) s.who[k]!.alive = false
  }, (g) => ({ heirs: Object.fromEntries(['spouse', 'kidA', 'kidB', 'grandA', 'grandLone', 'sisA', 'sisB', 'halfA', 'halfB'].map((k) => [k, heirKeys(g, s.who, s.who[k]!)])) }))
  s.step('heirs|only the player left', () => {
    for (const p of Object.values(s.who)) if (p.relation !== 'friend') p.alive = false
  }, (g) => ({ heirs: Object.fromEntries(['spouse', 'kidA', 'sisA', 'halfA'].map((k) => [k, heirKeys(g, s.who, s.who[k]!)])) }))
  rows.push(...s.rows)

  // The dollars: a late co-owner's 40% of a company that sells for a million, for each holder in turn.
  const w = world(144)
  const { g, b } = w
  track(g)
  g.people = []
  const who = castFamily(g, FAMILY)
  const t = (label: string, fn: () => void, extra: (g: GameState) => Record<string, unknown>): void => {
    fn()
    rows.push(snapshot(label, g, extra))
  }
  for (const h of FAMILY) {
    const dead = who[h.key]!
    const was = Object.fromEntries([...Object.entries(who).map(([k, p]) => [k, p.money] as const), ['me', g.character.money] as const])
    const heirs = heirKeys(g, who, dead)
    t(`sale|${h.key}`, () => {
      dead.alive = false
      b.share = 1 - SLICE
      b.familyShares = [{ id: dead.id, share: SLICE }]
      payFamilyBusinessProceeds(g, b, PRICE)
    }, () => {
      const paid = Object.fromEntries([...Object.entries(who).map(([k, p]) => [k, p.money - was[k]!] as const), ['me', g.character.money - was.me!] as const].filter(([, d]) => d !== 0))
      const total = Object.values(paid).reduce((x, y) => x + y, 0)
      // Conserved: the heirs are paid the whole slice (to the dollar), or nobody is paid and the stake leaves the family.
      if (heirs.length > 0) expect(Math.abs(total - SLICE * PRICE), `${h.key}: the heirs are paid the slice`).toBeLessThan(heirs.length)
      else expect(total, `${h.key}: no heirs, no payment`).toBe(0)
      return { relation: h.relation, heirs, paid, total }
    })
    t(`stake|${h.key}`, () => {
      b.familyShares = [{ id: dead.id, share: SLICE }]
      b.share = 1 - SLICE
      settleLateFamilyOwners(g)
    }, () => ({ owner: b.share, holders: (b.familyShares ?? []).map((x) => [Object.entries(who).find(([, p]) => p.id === x.id)?.[0] ?? x.id, x.share]) }))
    dead.alive = true
    delete b.familyShares
  }
  return rows
}

// ---------------------------------------------------------------------------------------------------------------------

function playAll(): ParityRow[] {
  return [...playModel(), ...playOwned(), ...playBoard(), ...playBaton(), ...playStakes()]
}

let first: ParityRow[] | null = null
const rowsOnce = (): ParityRow[] => (first ??= playAll())

describe('the nepo and dynasty oracle', () => {
  it('the rows are the recorded ones', { timeout: 120_000 }, () => {
    const rows = rowsOnce()
    if (isRecording(ORACLE.area)) recordRows(ORACLE, rows)
    else expectRows(ORACLE, rows)
  })

  it('plays the same rows twice', { timeout: 120_000 }, () => {
    const a = rowsOnce()
    const b = playAll()
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('has the rows a reader expects: the model of 24 people, three companies, ten relations', () => {
    const rows = rowsOnce()
    expect(rows.filter((r) => r.label.startsWith('model|'))).toHaveLength(24)
    for (const tag of ['own|', 'board|', 'baton|']) expect(rows.filter((r) => r.label.startsWith(tag)).length).toBeGreaterThanOrEqual(18)
    // The board's vote rolls both ways: an executive hire passed and others were turned down.
    const board = rows.filter((r) => r.label.startsWith('board|'))
    expect(board.some((r) => r.label.includes('hire star') && r.x?.ok === true)).toBe(true)
    expect(board.some((r) => r.x?.voted === true)).toBe(true)
    // Every relative's job is the twelve columns the reader of a row expects.
    const jobs = rows.flatMap((r) => (r.x?.jobs as unknown[][] | undefined) ?? [])
    expect(jobs.length).toBeGreaterThan(100)
    expect(jobs.every((j) => j.length === JOB_COLUMNS.length)).toBe(true)
    const relations = new Set(FAMILY.map((h) => h.relation))
    expect(relations.size).toBe(10)
    expect(rows.filter((r) => r.label.startsWith('heirs|')).length).toBeGreaterThanOrEqual(FAMILY.length)
  })
})
