// R4-L12 (D.5, D.9, X35, X37, X50, F18): the acceptance of the Life track, the part no single task of it owns. The long one: no `// ci: fast`.
// (The static scans are test/life-money-scan.test.ts; the ten ceiling rows `kin-caps`, `life-facts`, `life-path-scan`, `kin-estate`,
// `estate-debts`, `receivable-carry`, `divorce-debt`, `kept-contacts`, `strife-edges` and `npc-wage` are in test/ceiling-kit.ts.)
//
// THE PROBE. Three STAMPED lives (the social flag at creation, X6), found with findSeeds (born 1930, alive at 50) and played 120 years each,
// a year at a time with `playLife({ from: g, untilAge: age + 1 })` (the scripted calls go between the years), through two hand-overs at 50
// and as many more as a death asks for. Each life has its own scripted family, and the three share the scripted lends and wills:
//   siblings  three siblings of the player marry (legacy fields: `married`, `spouseName`; the kin step makes their spouses records) and have
//             babies; the player founds a family firm at 30, hires two siblings and names one the successor, so the hand-over gives the firm to
//             a relative and keeps the rest;
//   divorce   the player marries at 27, owns a $3M home at 40 and files at 41: the judge's order is more than the cash, so the rest is a
//             divorce debt (R4-L7) that is still standing at the hand-over at 50, when the estate pays it (R4-L6);
//   will      four children, a will that names two of them, one cut out in anger and the heir cut out in anger: the reading of the will
//             (R4-L10) writes quarrels between the relatives and puts one question to the heir.
//   all       two children (four in the will life), a lend to a friend every 6th year (a claim that passes to the heir at the will's share, R4-L6), a
//             will changed every 8th year, and the deaths that 120 years of siblings bring (R4-L5 settles each estate).
// After EVERY year: worldProblems and kinProblems and danglingIds (test/heir-kit.ts) are empty; no number is NaN or infinite; the kin links
// are inside their caps (6 kids, 160 records, 30 kin Persons alive); the facts of the year are at most 8; the cold feuds at most 12; the
// books balance with nothing healed and the player's cash moved with the player's account (strict drift 0, test/fuzz-kit.ts watchLedger);
// each dead Person with an `estateY` holds under a dollar (or is the dust the estate rule leaves, or was settled this very year); the wage
// rows have no mint, burn, state, bank or abroad against them and no NPC wage passes the `npc-wage` multiple of the ceiling kit.
// AT each hand-over: the Met names are the same before and after, the quarrels one reading wrote are at most 36, and no id dangles.
//
// THEN: the same seed gives the same JSON (a replay), a structuredClone and a JSON reload of year 80 play on to the same JSON, an heir, a
// reload, a clone and a fork keep the Met names, and a Time Machine jump re-rolls the unfinished year and nothing before it.
// WAGES: every NPC wage is booked from the pool of employers and stays under the multiple (F18 is only partly closed: the named employer is
// R6 A.K3, X37). ADOPTION to inherit: an adopted child counts in the will's slices and in the kin heirs, and the estate tax is booked once.
// OLD SAVES: each save-*.json.gz older than 5.3.0 (by the version in its name; P6 adds a 5.3.0 file after this task) and the E1 social
// fixture hand over unstamped, with no trace of the track, and the same twice. HOSTILE: twelve hostile kin records load into the oldest
// fixture, play 3 years, hand over, and stay bounded.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { becomeCeo } from '../src/game/business/career'
import { bestPlan } from '../src/game/business/economy'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import { readJob } from '../src/game/business/nepo-job'
import { bizOf } from '../src/game/business/state'
import { payPerson, personCash } from '../src/game/cash'
import { bindMoneyContext, setRelationship } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { divorce } from '../src/game/love'
import { changeWill } from '../src/game/events/will-act'
import { updateWl, willSlices } from '../src/game/events/will-core'
import { typicalIncome, updateTies } from '../src/game/events/wealth-core'
import { STRIFE } from '../src/game/events/will-strife'
import { timelineForks } from '../src/game/kernel/forks'
import { checkLedger, flowsOf } from '../src/game/kernel/ledger'
import { personEntity, personKey } from '../src/game/kernel/person-ref'
import { adoptChild, adoptSpouse, syncKin } from '../src/game/kin'
import { continueAsChild } from '../src/game/life'
import { settleKinEstates } from '../src/game/modules/kin-estates'
import { materializePerson } from '../src/game/materialize'
import { npcLife, saveNpcLife } from '../src/game/npc-state'
import { createPerson } from '../src/game/people'
import { migrateSave } from '../src/game/save-schema'
import { arriveInPast } from '../src/game/timeMachine'
import type { GameState, Person } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { KIN_CAPS, kinHeirIds, kinProblems, readKin } from '../src/game/world/kin'
import { edgeMap, liveFeuds, isSecretKey } from '../src/game/world/edges'
import { readFacts } from '../src/game/world/facts'
import { worldProblems } from '../src/game/world/invariants'
import { ageTo, type KinBase } from '../src/game/world/life-path'
import { isTomb, readMet, type MetRecord, type Tomb } from '../src/game/world/met'
import { playerRef } from '../src/game/world/people'
import { markMet, STAKE, touchMet } from '../src/game/world/met-ops'
import { makeSid, parseSid } from '../src/game/world/sid'
import { socialOn, stampSocial } from '../src/game/world/social'
import '../src/game/world/shards'
import { EDGE_CAPS } from '../src/game/world/caps'
import { danglingIds } from './heir-kit'
import { deepFreeze, newLedgerWatch, watchLedger, type LedgerWatch } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { SPOUSE_NAMES, kinGame, married, withLife } from './kin-kit'
import { playLife } from './play-kit'
import { ROOT } from './scan-kit'
import { findSeeds } from './seed-kit'
import { cast, socialGame, socialLife } from './social-kit'

const BIRTH = 1930
const YEARS = 120
/** The age at which a player of the first two generations hands over (a later generation plays on, and hands over when it dies). */
const HANDOVER_AGE = 50
const TIMEOUT = 900_000
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')
/** The most one NPC wage may be, in typical incomes: the number the `npc-wage` row of test/ceiling-kit.ts measured and wrote in. */
const NPC_WAGE_MULTIPLE = 2.5

// ---------------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------------

const json = (x: unknown): string => JSON.stringify(x)
const hasKey = (o: unknown, k: string): boolean => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

/** The path of the first number in a value that is not finite, or null. A walk, because JSON.stringify prints NaN as null. */
function firstNonFinite(root: unknown): string | null {
  const stack: [unknown, string][] = [[root, 'g']]
  let seen = 0
  while (stack.length > 0 && seen++ < 3_000_000) {
    const [item, path] = stack.pop()!
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) return `${path} = ${String(item)}`
    } else if (item !== null && typeof item === 'object') {
      if (Array.isArray(item)) item.forEach((kid, i) => stack.push([kid, `${path}[${i}]`]))
      else for (const [k, kid] of Object.entries(item)) stack.push([kid, `${path}.${k}`])
    }
  }
  return null
}

/** The forks of a life's timeline, as the kernel reads them. */
const timelineOf = (g: GameState): { year: number; salt: string }[] => timelineForks(g)

const nameOf = (e: MetRecord | Tomb): string => (isTomb(e) ? `${e[4]} ${e[5]}` : `${e.f} ${e.l}`)
/** Met key to the name stored for it: the thing "the same names for the same seed" is about. */
const namesOf = (g: GameState): Record<string, string> => Object.fromEntries(Object.entries(readMet(g)).map(([k, e]) => [k, nameOf(e)]))
const kinRecords = (g: GameState): string[] => Object.keys(readMet(g)).filter((k) => k.startsWith('kin.') && !isTomb(readMet(g)[k]))
const kinPersons = (g: GameState): Person[] => g.people.filter((p) => p.alive && parseSid(personKey(p))?.kind === 'kin')

/**
 * A kin record keeps its spouse or heir flag in the tail of the year in which its last anchor leaves the list: a kin Person who is a `friend`
 * and dies is dropped by cleanupPeople (relationships.ts, after the kin step of the same year) with the links it held, and the sweep of
 * `life.kin` clears the flag at the next year step. So the fault may be named once, and never in two years running (docs/KIN.md, known limits).
 */
const ORPHAN = /carries the spouse or heir flag and no living or recently dead person links it/
const SID_IN = /kin\.[A-Za-z0-9_-]+\.\d+\.\d+/

/** The edges between two NPCs that carry resentment and no link kind: the quarrels of a reading (neither end is the player). */
function strifeEdges(g: GameState): string[] {
  const me = playerRef(g)
  return Object.entries(edgeMap(g))
    .filter(([key, e]) => {
      if (isSecretKey(key) || e.k !== undefined || !(e.s > 0)) return false
      const k = String(key)
      const at = k.indexOf('>')
      return k.slice(0, at) !== me && k.slice(at + 1) !== me
    })
    .map(([k]) => k)
}

// ---------------------------------------------------------------------------------------------------------------------------
// The scripted caller
// ---------------------------------------------------------------------------------------------------------------------------

type Kind = 'siblings' | 'divorce' | 'will'
const KINDS: readonly Kind[] = ['siblings', 'divorce', 'will']

/** Everything the caller remembers. Plain data, so a clone of it continues a clone of the game. */
interface Script {
  kind: Kind
  /** Years played. */
  step: number
  handovers: number
  problems: string[]
  watch: LedgerWatch
  /** What the caller did, to prove the probe was a real one. */
  did: { children: number; weddings: number; babies: number; lends: number; wills: number; hires: number; successors: number; firms: number; divorces: number; readings: number }
  /** The most each bounded thing reached in any audit. */
  peak: { records: number; persons: number; facts: number; feuds: number; strife: number; dead: number; debts: number; orphans: number }
  /** The kin Persons and records ever seen, for the "was a real probe" claims. */
  estates: number
  /** Why the firm calls were refused (the first few), so a failure says what the scene did not manage. */
  refused: string[]
  /** The NPC wages the audits looked at: how many, the best one in typical incomes, and the years that had a wage row. */
  wages: { looked: number; best: number; rows: number }
  /** The sids named as orphans in the last audit (an orphan lasts one year step at most). */
  orphans: string[]
  /** The job records that named a gone firm in the last audit (the same one year of lag). */
  jobs: string[]
}

const fresh = (kind: Kind): Script => ({
  kind,
  step: 0,
  handovers: 0,
  problems: [],
  watch: newLedgerWatch(),
  did: { children: 0, weddings: 0, babies: 0, lends: 0, wills: 0, hires: 0, successors: 0, firms: 0, divorces: 0, readings: 0 },
  peak: { records: 0, persons: 0, facts: 0, feuds: 0, strife: 0, dead: 0, debts: 0, orphans: 0 },
  estates: 0,
  refused: [],
  wages: { looked: 0, best: 0, rows: 0 },
  orphans: [],
  jobs: [],
})

/** A child of the player, born now, every field given (so g.rng does not move). */
function makeChild(g: GameState, s: Script): Person {
  s.did.children++
  return cast(g, 85, 'child', { age: 0, occupation: 'Child', firstName: `Child${g.nextId}`, lastName: g.character.lastName, livesWithPlayer: false })
}

/** The player lends `p` a fiftieth of their cash (at least $100): the cash moves by the ledger and the claim is the allowance record's. */
function lendTo(g: GameState, p: Person, s: Script): void {
  const amount = Math.max(100, Math.round(g.character.money / 50))
  if (!(g.character.money >= 3 * amount) || !p.alive || p.relation === 'pet') return
  if (!payPerson(g, p, amount, 'support')) return
  updateTies(g, p, (t) => {
    if (t.owes <= 0) t.owesSince = g.year
    t.owes += amount
  })
  s.did.lends++
}

/** A will that names `who` in equal shares. */
function willFor(g: GameState, who: readonly Person[], s: Script): void {
  changeWill(g, (gg, w) => {
    gg.character.willBeneficiaries = who.map((p) => p.id)
    w.shares = {}
    w.charity = 0
  })
  g.queue = g.queue.filter((m) => m.kind !== 'choice' && m.kind !== 'input')
  s.did.wills++
}

/** The anger the person felt on learning of the will (a known record, so the reading uses it as it is). */
function angry(g: GameState, p: Person, anger: number): void {
  updateWl(g, p, (w) => {
    w.known = true
    w.how = 'leak'
    w.told = 'out'
    w.anger = anger
  })
}

const livingKids = (g: GameState): Person[] => g.people.filter((p) => p.alive && p.relation === 'child').sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : 1))
const adultKids = (g: GameState): Person[] => livingKids(g).filter((p) => p.age >= 18)
const sibs = (g: GameState): Person[] => g.people.filter((p) => p.alive && p.relation === 'sibling' && p.age >= 18).sort((a, b) => (a.id < b.id ? -1 : 1))

/** The family firm of the siblings life: the chain of the nepo tests, founded by the player. */
/** A flagged kin record that nobody links: an orphan. */
const rec2 = (g: GameState): void => void touchMet(g, 'kin.us.2000.2', { w: 4, fl: STAKE.heir })

function foundFirm(g: GameState, s: Script): void {
  if (g.assets.some((a) => a.kind === 'business')) return
  const c = g.character
  const city = getCountry(c.countryId).cities[0]!
  const b0 = newBiz(g, 'restaurant', c.countryId, city, { cash: 3_000_000, founded: g.year - 6, outlets: [{ countryId: c.countryId, city, count: 8, opened: g.year - 6 }] })
  const a = createBusinessAsset(g, 'Family Foods', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  const plan = bestPlan(g, bizOf(g, a))
  bizOf(g, a).price = plan.price
  bizOf(g, a).production = plan.production
  g.queue = g.queue.filter((m) => m.kind === 'notice' || m.kind === 'aiTask')
  s.did.firms++
}

function firm(g: GameState): { a: ReturnType<typeof createBusinessAsset>; b: ReturnType<typeof newBiz> } | null {
  const a = g.assets.find((x) => x.kind === 'business')
  return a === undefined ? null : { a, b: a.details as unknown as ReturnType<typeof newBiz> }
}

const house = (id: string, value: number): GameState['assets'][number] =>
  ({ id, kind: 'house', name: 'Family House', emoji: '\u{1F3E0}', purchasePrice: Math.round(value * 0.7), value, condition: 80, purchasedAge: 30, upkeep: 0, details: {} }) as unknown as GameState['assets'][number]

/** What the caller does before a year is played. It draws nothing from g.rng itself (the legacy calls it makes draw only on a refusal). */
function runScript(g: GameState, s: Script): void {
  const age = g.character.age
  const step = s.step
  const adults = sibs(g)

  // all: two people the caller holds in the Met store for good (a debt stake each), so every line of the life, whatever else it meets, carries
  // names to compare across an heir, a clone, a reload and a fork (the held record is never the one the store drops)
  if (step === 3) {
    for (const ord of [1, 2]) {
      const sid = makeSid({ kind: 'frn', place: 'us', cohort: 1925, ord })
      if (touchMet(g, sid, { w: 6 })) markMet(g, sid, { fl: STAKE.debt })
    }
  }

  // all: the children of the player (two, four in the will life; a child at 22 to 38 and on, so the heir is grown when the player is 50), a lend, a will
  if (age >= 22 && age <= 38 && livingKids(g).length < (s.kind === 'will' ? 4 : 2) && step % 2 === 0) makeChild(g, s)
  if (s.step % 6 === 4 && age >= 25 && age <= 70) {
    const friend = g.people.find((p) => p.alive && (p.relation === 'friend' || p.relation === 'sibling') && p.age >= 18)
    if (friend !== undefined) lendTo(g, friend, s)
  }
  if (s.step % 4 === 2 && age >= 30) {
    const kids = adultKids(g)
    if (kids.length > 0) willFor(g, s.step % 8 === 2 ? kids : kids.slice(0, Math.max(1, kids.length - 1)), s)
  }

  if (s.kind === 'siblings') {
    if (step === 0) {
      for (let i = 0; i < 3; i++) cast(g, 70, 'sibling', { age: age + 4 + 3 * i, occupation: 'Clerk', firstName: `Sib${i}`, lastName: g.character.lastName, gender: i % 2 === 0 ? 'female' : 'male' })
    }
    // a new generation has the old player's other children as siblings, and sometimes none: two grown siblings are kept
    if (step > 0 && age >= 20 && age <= 34 && adults.length < 2 && step % 2 === 0) {
      cast(g, 70, 'sibling', { age: age + 2, occupation: 'Clerk', firstName: `Sib${g.nextId}`, lastName: g.character.lastName, gender: g.nextId % 2 === 0 ? 'female' : 'male' })
    }
    adults.forEach((p, i) => {
      const spouse = typeof p.data.spouseName === 'string'
      if (!spouse && p.age >= 22 && p.age <= 40 && (step + i) % 2 === 0) {
        married(g, p, SPOUSE_NAMES[(g.nextId + i) % SPOUSE_NAMES.length]!)
        s.did.weddings++
      } else if (spouse && p.data.married === true && p.age <= 44 && num(p.data.kids) < 3 && (step + i) % 5 === 0) {
        p.data.kids = num(p.data.kids) + 1
        if (adoptChild(g, p, { first: `Baby${g.nextId % 90}`, last: p.lastName, gender: (step + i) % 2 === 0 ? 'female' : 'male' }) !== null) s.did.babies++
      }
    })
    if (age === 30) foundFirm(g, s)
    const f = firm(g)
    // the family firm is kept in funds until the hand-over, as the nepo tests keep theirs: a chain that fails at 36 would hand nothing over
    if (f !== null) f.b.cash = Math.max(f.b.cash, 3_000_000)
    if (f !== null && (age === 34 || age === 38)) {
      const relative = adults.find((p) => p.age >= 21)
      if (relative !== undefined) setRelationship(g, relative, 85)
      const hired = relative === undefined ? null : hireRelative(g, f.a, f.b, relative, { rank: 1 }, { quiet: true })
      if (hired?.ok === true) s.did.hires++
      else if (s.refused.length < 6) s.refused.push(`hire at ${age}: ${relative === undefined ? `no relative among ${JSON.stringify(g.people.filter((x) => x.relation === 'sibling').map((x) => [x.id, x.age, x.alive]))}` : String((hired as { reason?: string }).reason)}`)
    }
    if (f !== null && age === 44) {
      const relative = adults.find((p) => p.age >= 21 && readJob(p) !== null)
      if (relative !== undefined) setRelationship(g, relative, 85)
      if (relative !== undefined && designateSuccessor(g, f.a, f.b, relative, { quiet: true }).ok) s.did.successors++
    }
  }

  if (s.kind === 'divorce') {
    if (age === 27 && !g.people.some((p) => p.alive && p.relation === 'spouse')) {
      cast(g, 40, 'spouse', { age: 26, occupation: 'Clerk', firstName: `Mate${g.nextId}`, lastName: 'Voss', gender: g.character.gender === 'male' ? 'female' : 'male', livesWithPlayer: true, money: 0 })
    }
    // the marriage is kept up until the day the player files: a feeling that fades would end it a year or two early
    const mate = g.people.find((p) => p.alive && p.relation === 'spouse')
    if (mate !== undefined && age > 27 && age < 41 && mate.relationship < 70) setRelationship(g, mate, 85)
    if (age === 40 && !g.assets.some((a) => a.id === 'probe-home')) {
      g.assets.push(house('probe-home', 3_000_000))
      g.character.residence = { status: 'owned', assetId: 'probe-home' }
    }
    if (age === 41) {
      const spouse = g.people.find((p) => p.alive && p.relation === 'spouse')
      if (spouse !== undefined) {
        divorce(g, spouse, 'player')
        g.queue = []
        s.did.divorces++
      }
    }
  }

}

/**
 * The will life's fight, staged right before the death (the yearly will step moves the anger between the years): the will names the two middle
 * children, the eldest (the heir) and the youngest are cut out and angry. The reading then writes quarrels from the youngest to the two named.
 */
function fightOverTheWill(g: GameState, s: Script): void {
  const kids = livingKids(g)
  if (kids.length < 4) return
  willFor(g, [kids[1]!, kids[2]!], s)
  angry(g, kids[0]!, 60)
  angry(g, kids[3]!, 35)
}

// ---------------------------------------------------------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------------------------------------------------------

/** The checks after a year. Every failure is a line of `s.problems` (at most 24), so one broken year does not bury the first. */
function audit(g: GameState, s: Script, atHandOver = false): void {
  const where = `${s.kind} step ${s.step} (${g.year}, generation ${g.generation}, age ${g.character.age})`
  const bad = (m: string): void => void (s.problems.length < 24 && s.problems.push(`${where}: ${m}`))

  // The index of people, firms and homes is built by the year step and the rest of the year changes the records (a school move drops the
  // classmates the index saw), so the check of the index against the records waits for the next step by design (docs/WORLD.md): live is off.
  // An orphan flag is the other lag, named below.
  for (const p of worldProblems(g, { live: false }).filter((x) => !ORPHAN.test(x)).slice(0, 3)) bad(`world: ${p}`)
  const orphans = kinProblems(g).filter((x) => ORPHAN.test(x))
  for (const p of kinProblems(g).filter((x) => !ORPHAN.test(x)).slice(0, 3)) bad(`kin: ${p}`)
  // between continueAsChild and the next year step the anchors the hand-over dropped are orphans too (docs/KIN.md, section 13): not a year step
  if (!atHandOver) {
    const sids = orphans.map((x) => SID_IN.exec(x)?.[0] ?? x)
    for (const sid of sids) if (s.orphans.includes(sid)) bad(`kin: ${sid} carried a stake flag with no anchor for two year steps running`)
    s.orphans = sids
    s.peak.orphans = Math.max(s.peak.orphans, sids.length)
  }
  // A firm that fails or is sold in the year leaves its relatives' job records until the next family year closes them (X35): a `job of` line may
  // stand for one year step, and never for two running. Every other id must resolve at once.
  const dangling = danglingIds(g)
  for (const p of dangling.filter((x) => !x.startsWith('job of ')).slice(0, 3)) bad(`dangling: ${p}`)
  const jobs = dangling.filter((x) => x.startsWith('job of '))
  if (!atHandOver) {
    for (const j of jobs) if (s.jobs.includes(j)) bad(`dangling: ${j} for two year steps running`)
    s.jobs = jobs
  }
  const stray = firstNonFinite(g)
  if (stray !== null) bad(`not finite: ${stray}`)

  // the kin links are inside their caps
  const records = kinRecords(g).length
  const persons = kinPersons(g).length
  s.peak.records = Math.max(s.peak.records, records)
  s.peak.persons = Math.max(s.peak.persons, persons)
  if (records > KIN_CAPS.records) bad(`${records} kin records, over ${KIN_CAPS.records}`)
  if (persons > KIN_CAPS.persons) bad(`${persons} kin Persons alive, over ${KIN_CAPS.persons}`)
  for (const p of g.people) {
    const raw: unknown = p.data.kidSids
    if (Array.isArray(raw) && raw.length > KIN_CAPS.kids) bad(`${p.id} has ${raw.length} kid links`)
    if (readKin(p).kids.length > KIN_CAPS.kids) bad(`${p.id} reads ${readKin(p).kids.length} kids`)
  }

  // the facts of the year, the feuds and the debts
  const facts = readFacts(g).filter((f) => f.y === g.year && f.k.startsWith('life.')).length
  const counter = num(g.yearActions['life.facts'])
  s.peak.facts = Math.max(s.peak.facts, facts, counter)
  if (facts > 8 || counter > 8) bad(`${facts} life facts stored and the counter at ${counter}, over 8`)
  const feuds = liveFeuds(g)
  s.peak.feuds = Math.max(s.peak.feuds, feuds)
  if (feuds > EDGE_CAPS.feuds) bad(`${feuds} live feuds, over ${EDGE_CAPS.feuds}`)
  s.peak.strife = Math.max(s.peak.strife, strifeEdges(g).length)
  s.peak.debts = Math.max(s.peak.debts, Object.values(edgeMap(g)).filter((e) => e.dv !== undefined).length)

  // the books: balanced, nothing healed, and the player's cash moved with the player's account
  const books = checkLedger(g)
  if (!books.ok) bad(`books: ${books.problems.slice(0, 2).join('; ')}`)
  const drift = s.watch.drift
  watchLedger(s.watch, g, 'year')
  if (s.watch.drift !== drift) bad(`drift: the player's cash moved ${Math.round(s.watch.drift - drift)} without a booking`)

  // a dead Person whose estate was settled in an earlier year holds under a dollar, or the dust the rule leaves (under half the last yearly
  // income: a stake settled with little cash), or is the one from this very year (its token rows are in this year's books)
  for (const p of g.people) {
    if (p.alive || typeof p.data.estateY !== 'number') continue
    s.peak.dead++
    const income = npcLife(p)?.income ?? 0
    const dust = p.money < Math.max(1, 0.5 * income)
    if (p.data.estateY < g.year && !dust) bad(`${p.id} is dead since ${String(p.data.diedYear)}, settled in ${p.data.estateY} and still holds ${Math.round(p.money)}`)
  }

  // the wages: nothing was paid by a mint, a burn, the state, a bank or abroad; no NPC without a company earns past the multiple
  for (const row of flowsOf(g, g.year)) {
    if (row.reason !== 'wage') continue
    if (row.net.person > 0) s.wages.rows++
    const odd = Math.abs(row.net.mint) + Math.abs(row.net.burn) + Math.abs(row.net.gov) + Math.abs(row.net.bank) + Math.abs(row.net.abroad)
    if (odd !== 0) bad(`wages in ${row.country} had a mint, burn, state, bank or abroad against them: ${json(row.net)}`)
  }
  for (const p of g.people) {
    const life = npcLife(p)
    if (!p.alive || life === null || life.lastYear !== g.year || p.data.npcCompany !== undefined) continue
    const wage = 0.8 * life.income
    const ceiling = NPC_WAGE_MULTIPLE * typicalIncome(g, life.country)
    if (life.income > 0) {
      s.wages.looked++
      s.wages.best = Math.max(s.wages.best, wage / typicalIncome(g, life.country))
    }
    if (life.income > 0 && wage > ceiling && p.occupation !== 'Royal Family Member' && typeof p.data.royalAppointment === 'undefined') bad(`${p.id} earns ${Math.round(wage)} against ${Math.round(ceiling)}`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------------------------------------------------------

interface Run {
  g: GameState
  s: Script
  seed: number
}

/** Three seeds of stamped lives born 1930 that are alive at 50 (found and not pinned; memoised by label). */
const lifeSeeds = (): number[] =>
  findSeeds(
    (seed) => {
      const g = socialLife({ seed, year: BIRTH })
      bindMoneyContext(g)
      playLife({ seed, birthYear: BIRTH, from: g, untilAge: HANDOVER_AGE })
      return g.character.alive
    },
    3,
    { tries: 60, label: 'three stamped lives born 1930 that are alive at 50 (the life probe)' },
  )

function begin(kind: Kind, seed: number): Run {
  const g = socialLife({ seed, year: BIRTH })
  bindMoneyContext(g)
  const s = fresh(kind)
  watchLedger(s.watch, g, 'start')
  return { g, s, seed }
}

/** The oldest living adult child: the heir. One is made when there is none (the driver never starts a family on its own). */
function heirOf(g: GameState): Person {
  return (
    adultKids(g)[0] ??
    createPerson(g, { relation: 'child', age: Math.max(18, Math.min(40, g.character.age - 25)), gender: 'female', firstName: 'Heir', lastName: g.character.lastName, occupation: 'Clerk', traits: ['kind'], stats: { happiness: 60, health: 70, smarts: 50, looks: 50 }, relationship: 80, money: 0 })
  )
}

/** The player dies if alive, and the oldest adult child takes over. Checks the names and the quarrels across the switch. */
function handOver(g: GameState, s: Script): GameState {
  if (s.kind === 'will') fightOverTheWill(g, s)
  const heir = heirOf(g)
  if (g.character.alive) killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
  const before = namesOf(g)
  const quarrels = strifeEdges(g).length
  const n = continueAsChild(g, heir.id)
  if (n === g) {
    s.problems.push(`${s.kind} step ${s.step}: continueAsChild refused ${heir.id}`)
    return g
  }
  s.handovers++
  if (json(namesOf(n)) !== json(before)) s.problems.push(`${s.kind} step ${s.step}: the hand-over changed the names of the Met store`)
  const read = strifeEdges(n).length - quarrels
  if (read > STRIFE.total) s.problems.push(`${s.kind} step ${s.step}: one reading wrote ${read} quarrels, over ${STRIFE.total}`)
  if (read > 0) s.did.readings++
  else if (s.kind === 'will' && s.refused.length < 8) s.refused.push(`reading at ${s.step}: ${String((n.queue.find((m) => m.kind === 'notice' && m.title.startsWith('The Reading')) as { text?: string } | undefined)?.text).slice(0, 400)}`)
  s.peak.strife = Math.max(s.peak.strife, read)
  watchLedger(s.watch, n, 'heir')
  return n
}

/** Plays `years` more years: the scripted caller, one year, the audit, and a hand-over when the player is dead or has reached 50. */
function advance(run: Run, years: number, hook?: (run: Run) => void): Run {
  bindMoneyContext(run.g)
  for (let i = 0; i < years; i++) {
    runScript(run.g, run.s)
    playLife({ seed: run.seed, birthYear: BIRTH, from: run.g, untilAge: run.g.character.age + 1 })
    run.s.step++
    audit(run.g, run.s)
    if (!run.g.character.alive || (run.g.character.age >= HANDOVER_AGE && run.s.handovers < 2)) {
      run.g = handOver(run.g, run.s)
      bindMoneyContext(run.g)
      audit(run.g, run.s, true)
    }
    hook?.(run)
  }
  return run
}

const cloneRun = (run: Run): Run => ({ g: structuredClone(run.g), s: structuredClone(run.s), seed: run.seed })

function reloadRun(run: Run): Run {
  const r = migrateSave(JSON.parse(json(run.g)))
  if (r.kind !== 'ready') throw new Error(`the save did not load: ${r.kind}`)
  return { g: r.game, s: structuredClone(run.s), seed: run.seed }
}

interface Kept {
  final: Run
  /** The state and the caller at the start of year 80 (for the clone and the reload) and of year 30 (for the fork). */
  at80: Run
  at30: Run
  /** The Met names at the end of year 55, for the fork. */
  names55: Record<string, string>
}

const kept = new Map<Kind, Kept>()

function theRun(kind: Kind): Kept {
  const hit = kept.get(kind)
  if (hit !== undefined) return hit
  const run = begin(kind, lifeSeeds()[KINDS.indexOf(kind)]!)
  let at80: Run | null = null
  let at30: Run | null = null
  let names55: Record<string, string> = {}
  advance(run, YEARS, (r) => {
    if (r.s.step === 30) at30 = cloneRun(r)
    if (r.s.step === 55) names55 = namesOf(r.g)
    if (r.s.step === 80) at80 = cloneRun(r)
  })
  const out = { final: run, at80: at80!, at30: at30!, names55 }
  kept.set(kind, out)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The 120-year probe
// ---------------------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------------------
// 1b. The audit can fail
// ---------------------------------------------------------------------------------------------------------------------------

describe('the audit has teeth: each fault it looks for is named', () => {
  /** A small stamped game, an audit that has looked once (so the books have a baseline), and the problems it has named so far. */
  function watched(): { g: GameState; s: Script } {
    const g = socialGame(3, { age: 40, money: 50_000, countryId: 'us' })
    const s = fresh('siblings')
    watchLedger(s.watch, g, 'start')
    audit(g, s)
    expect(s.problems).toEqual([])
    return { g, s }
  }
  const said = (s: Script, text: RegExp): boolean => s.problems.some((p) => text.test(p))

  it('is quiet on a sound game', () => {
    const { g, s } = watched()
    g.year += 1
    audit(g, s)
    expect(s.problems).toEqual([])
  })

  it('names a number that is not finite, a dangling manager and a kin link to nobody', () => {
    const a = watched()
    const b0 = newBiz(a.g, 'cafe', 'us', 'Chicago', { cash: 1_000_000, founded: 2020, ceo: 'manager', manager: { firstName: 'Ana', lastName: 'Ruiz', gender: 'female', skill: 60, salary: 90_000, since: 2020 } })
    b0.manager!.personId = 'ghost1'
    a.g.assets.push(createBusinessAsset(a.g, 'Dangling', b0, 100_000))
    audit(a.g, a.s)
    expect(said(a.s, /dangling: asset \S+ manager: ghost1/)).toBe(true)
    const b = watched()
    const p = cast(b.g, 60, 'sibling', { age: 40 })
    p.data.spouseSid = 'kin.us.2000.4'
    audit(b.g, b.s)
    expect(said(b.s, /kin\.us\.2000\.4/)).toBe(true)
    const c = watched()
    c.g.character.stats.happiness = Number.NaN
    audit(c.g, c.s)
    expect(said(c.s, /not finite/)).toBe(true)
  })

  it('names a dollar that moved without a booking, and a year that said more than 8 facts', () => {
    const a = watched()
    a.g.character.money += 1_000
    audit(a.g, a.s)
    expect(said(a.s, /drift/)).toBe(true)
    const b = watched()
    b.g.yearActions['life.facts'] = 9
    audit(b.g, b.s)
    expect(said(b.s, /over 8/)).toBe(true)
  })

  it('names a dead Person whose estate was settled in an earlier year and who still holds money, but not the dust and not this year', () => {
    const a = watched()
    const dead = cast(a.g, 60, 'sibling', { age: 80, money: 90_000 })
    dead.alive = false
    dead.data.estateY = a.g.year - 2
    dead.data.diedYear = a.g.year - 2
    audit(a.g, a.s)
    expect(said(a.s, /still holds/)).toBe(true)
    const b = watched()
    const settled = cast(b.g, 60, 'sibling', { age: 80, money: 0 })
    settled.alive = false
    settled.data.estateY = b.g.year - 2
    const now = cast(b.g, 60, 'sibling', { age: 80, money: 90_000 })
    now.alive = false
    now.data.estateY = b.g.year
    audit(b.g, b.s)
    expect(said(b.s, /still holds/)).toBe(false)
  })

  it('names an NPC wage past the multiple, and an orphan flag or a job record that stands for two year steps running but not for one', () => {
    const a = watched()
    const p = cast(a.g, 60, 'sibling', { age: 40 })
    saveNpcLife(p, { v: 1, lastYear: a.g.year, country: 'us', field: 'Business', education: 3, study: 0, skill: 99, experience: 60, income: 20 * typicalIncome(a.g, 'us'), debt: 0, investments: 0, housing: 0, ambition: 50, employer: 'Firm', history: [], achievements: [], housingQuality: 50 })
    audit(a.g, a.s)
    expect(said(a.s, /earns/)).toBe(true)
    const b = watched()
    b.s.orphans = ['kin.us.2000.1']
    b.g.year += 1
    // two year steps running: the flag is named once in the last audit, and the problem is the same sid again
    const rec = (sid: string): void => {
      touchMet(b.g, sid, { w: 4, fl: STAKE.heir })
    }
    rec('kin.us.2000.1')
    audit(b.g, b.s)
    expect(said(b.s, /two year steps running/)).toBe(true)
    const c = watched()
    rec2(c.g)
    audit(c.g, c.s)
    expect(c.s.problems).toEqual([])
    expect(c.s.orphans).toEqual(['kin.us.2000.2'])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. A relative who became a Person and has a family of their own
// ---------------------------------------------------------------------------------------------------------------------------
// Found by the probe: a niece made a Person by the estate (X38) is a friend whose account is her record's sid, and her own wedding is a spouse
// record linked from her. The pair edge between them has a kin sid at BOTH ends, and the orphan sweep of syncKin read only the first one, so it
// took the edge from her to her husband for an orphan and removed it every year (kinProblems: "has no pair edge out", for good).

describe('a relative made a Person who marries: both pair edges stand', () => {
  it('keeps the edge in each direction through three year steps, and kinProblems stays empty', () => {
    const g = kinGame(5, 0)
    const aunt = withLife(cast(g, 60, 'sibling', { age: 52, gender: 'female', firstName: 'Lena', lastName: 'Okafor' }))
    married(g, aunt, 'Ana Ruiz')
    const kid = adoptChild(g, aunt, { first: 'Tobi', last: 'Okafor', gender: 'female' })!
    const niece = materializePerson(g, kid, { relation: 'friend', age: 27, relationship: 40, data: { kin: 'niece' } })!
    married(g, niece, 'Mateo Okafor')
    for (let y = 0; y < 3; y++) {
      g.year += 1
      g.yearActions = {}
      syncKin(g)
      const spouse = niece.data.spouseSid
      expect(typeof spouse, `year ${y + 1}: a spouse link`).toBe('string')
      const out = edgeMap(g)[`${personEntity(niece)}>person:${String(spouse)}`]
      const back = edgeMap(g)[`person:${String(spouse)}>${personEntity(niece)}`]
      expect(out, `year ${y + 1}: the edge from her to her husband`).toBeDefined()
      expect(back, `year ${y + 1}: the edge from him to her`).toBeDefined()
      expect(out?.k).toBe('pair')
      expect(kinProblems(g)).toEqual([])
    }
  })
})

describe.each(KINDS)('the 120-year probe: the %s life, stamped, two hand-overs', (kind) => {
  it('stays sound after every year: the world, the kin links, the ids, the caps, the books, the estates and the wages', () => {
    const { final } = theRun(kind)
    expect(final.s.problems).toEqual([])
    expect(final.s.step).toBe(YEARS)
    expect(final.s.handovers).toBeGreaterThanOrEqual(2)
    expect(final.g.generation).toBeGreaterThanOrEqual(3)
    expect(socialOn(final.g)).toBe(true)
    expect(final.s.watch.drift).toBe(0)
    expect(worldProblems(final.g, { live: false }).filter((x) => !ORPHAN.test(x))).toEqual([])
    expect(kinProblems(final.g).filter((x) => !ORPHAN.test(x))).toEqual([])
    expect(danglingIds(final.g).filter((x) => !x.startsWith('job of '))).toEqual([])
    expect(checkLedger(final.g).problems).toEqual([])
    expect(firstNonFinite(final.g)).toBeNull()
  }, TIMEOUT)

  it('was a real probe: the scripted family lived, the caps were pressed on and the estates were settled', () => {
    const { final } = theRun(kind)
    const { did, peak } = final.s
    expect(did.children).toBeGreaterThanOrEqual(4)
    expect(did.lends).toBeGreaterThanOrEqual(3)
    expect(did.wills).toBeGreaterThanOrEqual(3)
    expect(peak.facts).toBeLessThanOrEqual(8)
    expect(peak.feuds).toBeLessThanOrEqual(EDGE_CAPS.feuds)
    // the wages: 120 years of NPC lives were looked at, the best of them under the multiple of the ceiling kit, and the wage rows were there
    expect(final.s.wages.looked).toBeGreaterThan(100)
    expect(final.s.wages.rows).toBeGreaterThan(40)
    expect(final.s.wages.best).toBeGreaterThan(0.5)
    expect(final.s.wages.best).toBeLessThanOrEqual(NPC_WAGE_MULTIPLE)
    if (kind === 'siblings') {
      expect(did.weddings).toBeGreaterThanOrEqual(3)
      expect(did.firms).toBeGreaterThanOrEqual(1)
      expect(did.hires, final.s.refused.join('; ')).toBeGreaterThanOrEqual(1)
      expect(did.successors).toBeGreaterThanOrEqual(1)
      expect(peak.records).toBeGreaterThanOrEqual(3)
      expect(peak.dead).toBeGreaterThanOrEqual(1)
    }
    if (kind === 'divorce') {
      expect(did.divorces).toBeGreaterThanOrEqual(2)
      expect(peak.debts).toBeGreaterThanOrEqual(1)
    }
    if (kind === 'will') {
      expect(did.readings, final.s.refused.join('; ')).toBeGreaterThanOrEqual(1)
      expect(peak.strife).toBeGreaterThanOrEqual(1)
      expect(peak.strife).toBeLessThanOrEqual(STRIFE.total)
    }
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. The same seed, the same life: a replay, a clone, a reload, an heir and a fork
// ---------------------------------------------------------------------------------------------------------------------------

describe.each(KINDS)('the %s life is the same life', (kind) => {
  it('plays the seed twice to the same state, the same caller and the same Met names', () => {
    const a = theRun(kind).final
    const b = advance(begin(kind, a.seed), YEARS)
    expect(b.s.problems).toEqual([])
    expect(Object.keys(namesOf(a.g)).length).toBeGreaterThanOrEqual(2)
    expect(hasKey(namesOf(a.g), makeSid({ kind: 'frn', place: 'us', cohort: 1925, ord: 1 }))).toBe(true)
    expect(namesOf(b.g)).toEqual(namesOf(a.g))
    expect(json(b.g)).toBe(json(a.g))
    expect(b.s).toEqual(a.s)
  }, TIMEOUT)

  it('continues a structuredClone of year 80 to the names and the state of the original', () => {
    const { final, at80 } = theRun(kind)
    expect(at80.s.step).toBe(80)
    const c = advance(cloneRun(at80), YEARS - 80)
    expect(c.s.problems).toEqual([])
    expect(namesOf(c.g)).toEqual(namesOf(final.g))
    expect(json(c.g)).toBe(json(final.g))
  }, TIMEOUT)

  it('continues a JSON reload of year 80 to the names and the state of the original', () => {
    const { final, at80 } = theRun(kind)
    const r = advance(reloadRun(at80), YEARS - 80)
    expect(r.s.problems).toEqual([])
    expect(namesOf(r.g)).toEqual(namesOf(final.g))
    expect(json(r.g)).toBe(json(final.g))
  }, TIMEOUT)

  it('forks through the Time Machine: the fork starts with the names of its snapshot and, 25 years on, every person both lines hold has one name', () => {
    const { final, at30, names55 } = theRun(kind)
    expect(at30.s.step).toBe(30)
    const snapshotNames = namesOf(at30.g)
    const fork = arriveInPast(final.g, structuredClone(at30.g))
    expect(namesOf(fork)).toEqual(snapshotNames)
    expect(fork.flags.timeMachine).toBeDefined()
    const f = advance({ g: fork, s: structuredClone(at30.s), seed: at30.seed }, 25)
    expect(f.s.problems).toEqual([])
    expect(f.s.step).toBe(55)
    const forkNames = namesOf(f.g)
    const both = Object.keys(forkNames).filter((k) => hasKey(names55, k))
    for (const key of both) if (forkNames[key] !== names55[key]) expect(hasKey(snapshotNames, key), `${key} was in the snapshot and has two names`).toBe(false)
    expect(both.filter((k) => hasKey(snapshotNames, k)).length).toBeGreaterThan(0)
  }, TIMEOUT)

  it('a jump re-rolls the year it lands in and every year after, and no year that ended before it: the life path of a record, in the real lines', () => {
    const { final, at30 } = theRun(kind)
    const jump = at30.g.year
    const fork = arriveInPast(final.g, structuredClone(at30.g))
    expect(timelineOf(fork)).toEqual([{ year: jump, salt: expect.any(String) }])
    let differs = 0
    let alive = 0
    for (let i = 0; i < 240; i++) {
      const born = 1900 + (i % 90)
      const b: KinBase = { sid: makeSid({ kind: 'kin', place: 'us', cohort: born, ord: i }), born, health: 30 + (i % 60) }
      // up to the year before the jump the two lines agree on every record, whatever came after (the scan never reaches the jump)
      for (const year of [born, born + 10, born + 40, jump - 1]) if (year < jump) expect(ageTo(fork, b, year), `${b.sid} in ${year}`).toEqual(ageTo(final.g, b, year))
      if (born < jump && ageTo(final.g, b, jump - 1).alive) {
        alive++
        const was = ageTo(final.g, b, born + 129)
        const now = ageTo(fork, b, born + 129)
        if (was.died !== now.died) differs++
        if (now.died !== null) expect(now.died, `${b.sid} died before the jump`).toBeGreaterThanOrEqual(jump)
      }
    }
    // the records alive at the jump meet new dice after it: some live and die otherwise, and none was rewritten before it
    expect(alive).toBeGreaterThan(40)
    expect(differs).toBeGreaterThan(10)
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 4. Adoption to inherit
// ---------------------------------------------------------------------------------------------------------------------------
// There is no adoption act in R4: an adopted child is a child of the player (relation `child`, `data.adopted`), or a relative's child whose kin
// record became a Person. Both inherit like any other: the will counts them, the kin heirs name them, and the estate tax is booked once.

describe('adoption to inherit: an adopted child counts and the estate tax is booked once', () => {
  /** A stamped old player with $24M and two grown children, the second of them adopted when `adopted`. */
  function house(adopted: boolean): { g: GameState; heir: Person; second: Person } {
    const g = makeTestGame(1, { age: 78, money: 24_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
    g.log = [{ age: 78, year: g.year, entries: [] }]
    stampSocial(g)
    const heir = cast(g, 70, 'child', { age: 50, countryId: 'us', money: 20_000, traits: ['kind', 'calm'] })
    const second = cast(g, 70, 'child', { age: 47, countryId: 'us', money: 20_000, traits: ['kind', 'calm'], ...(adopted ? { data: { adopted: true } } : {}) })
    return { g, heir, second }
  }

  it('counts an adopted child in the will slices as a child of the blood: half the estate each', () => {
    for (const adopted of [false, true]) {
      const { g, heir, second } = house(adopted)
      expect(second.data.adopted === true).toBe(adopted)
      const slices = willSlices(g)
      expect(slices.map((x) => x.id).sort()).toEqual([heir.id, second.id].sort())
      for (const x of slices) expect(x.pct).toBeCloseTo(0.5, 9)
    }
  })

  it('hands the estate over the same whether the other child is adopted or not, and books the estate tax once', () => {
    const run = (adopted: boolean): { n: GameState; second: Person; tax: number; rows: number } => {
      const { g, heir, second } = house(adopted)
      killCharacter(g, 'Old Age')
      g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
      const n = continueAsChild(g, heir.id)
      expect(n, 'the hand-over must happen').not.toBe(g)
      const rows = flowsOf(n, n.year).filter((r) => r.reason === 'tax.estate')
      return { n, second: n.people.find((p) => p.id === second.id)!, tax: rows.reduce((t, r) => t + r.net.gov, 0), rows: rows.length }
    }
    const blood = run(false)
    const adopted = run(true)
    expect(adopted.second.relation).toBe(blood.second.relation)
    expect(adopted.second.money).toBe(blood.second.money)
    expect(adopted.second.money).toBeGreaterThan(1_000_000)
    expect(adopted.n.character.money).toBe(blood.n.character.money)
    // booked once: one row, the state gained it, and it is the very sum the twin paid
    expect(adopted.rows).toBe(1)
    expect(adopted.tax).toBeGreaterThan(0)
    expect(adopted.tax).toBe(blood.tax)
    expect(checkLedger(adopted.n).problems).toEqual([])
  })

  it('names an adopted child among the kin heirs of a relative, and pays it an equal share of the estate', () => {
    const g = kinGame(9, 0)
    const dead = withLife(cast(g, 60, 'sibling', { age: 45, gender: 'female', firstName: 'Lena', lastName: g.character.lastName }))
    married(g, dead, 'Ana Ruiz')
    const spouse = adoptSpouse(g, dead, { gender: 'male' })!
    const born = adoptChild(g, dead, { first: 'Sol', last: dead.lastName, gender: 'female' })!
    const taken = adoptChild(g, dead, { first: 'Noa', last: dead.lastName, gender: 'male' })!
    personCash(g, dead, 900_000, 'prize')
    // the adopted child is a Person already, with the mark of adoption on it
    const child = materializePerson(g, taken, { relation: 'friend', age: 20, relationship: 50, data: { kin: 'nephew', adopted: true } })!
    expect(child.data.adopted).toBe(true)
    dead.alive = false
    dead.causeOfDeath = 'Old Age'
    dead.data.diedYear = g.year
    expect(kinHeirIds(g, dead)).toEqual([child.id])
    settleKinEstates(g)
    const heirs = [spouse, born, taken].map((sid) => g.people.find((p) => personKey(p) === sid)!)
    expect(heirs.every((p) => p !== undefined)).toBe(true)
    expect(heirs.map((p) => p.money)).toEqual([300_000, 300_000, 300_000])
    expect(kinHeirIds(g, dead)).toContain(child.id)
    expect(dead.money).toBe(0)
    expect(checkLedger(g).problems).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. Old saves
// ---------------------------------------------------------------------------------------------------------------------------
// The files are the save-*.json.gz of test/fixtures chosen by the version in their NAME: every one before 5.3.0 is a life the social flag never
// stamped (the E1 social fixture, save-v5.2.0-social, is one of them). P6 adds save-v5.3.0-heavy.json.gz after this task, a stamped life that
// must not be asserted unstamped, so the selection is by name and not "every file".

type Triple = readonly [number, number, number]
const versionOf = (name: string): Triple | null => {
  const m = /^save-v(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(name)
  return m === null ? null : [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)]
}
const olderThan530 = (name: string): boolean => {
  const v = versionOf(name)
  return v !== null && (v[0] < 5 || (v[0] === 5 && v[1] < 3))
}
const OLD_SAVES = (): string[] => (existsSync(FIXTURE_DIR) ? readdirSync(FIXTURE_DIR) : []).filter((n) => /^save-.*\.json\.gz$/.test(n) && olderThan530(n)).sort()
const fixtureJson = (name: string): Record<string, unknown> => JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()) as Record<string, unknown>

function loaded(name: string, mutate?: (raw: Record<string, unknown>) => void): GameState {
  const raw = fixtureJson(name)
  mutate?.(raw)
  const r = migrateSave(raw)
  if (r.kind !== 'ready') throw new Error(`${name} did not load: ${r.kind}`)
  return r.game
}

/** The player of a loaded save dies and a grown child they did not have carries on. The queue is emptied the way a store would. */
function overOldSave(g: GameState): GameState {
  const heir = createPerson(g, { relation: 'child', age: 24, gender: 'female', firstName: 'Heir', lastName: g.character.lastName, occupation: 'Clerk', traits: ['kind'], stats: { happiness: 60, health: 70, smarts: 50, looks: 50 }, relationship: 80, money: 0 })
  killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
  return continueAsChild(g, heir.id)
}

/** Everything the track writes on a stamped life: the keys of an anchor, a kin record, an edge, a stamp. None of it may exist on an unstamped hand-over. */
function traces(g: GameState): string[] {
  const out: string[] = []
  if (socialOn(g)) out.push('the social stamp')
  for (const p of g.people) for (const k of ['spouseSid', 'kidSids', 'kinY', 'estateY', 'widowed']) if (hasKey(p.data, k)) out.push(`${p.id}.${k}`)
  if (kinRecords(g).length > 0) out.push('kin records')
  if (Object.keys(edgeMap(g)).length > 0) out.push('edges')
  if (hasKey(g.world ?? {}, 'met')) out.push('the Met shard')
  if (hasKey(g.world ?? {}, 'edges')) out.push('the edge shard')
  return out
}

describe('old saves: every save before 5.3.0 hands over unstamped, to the same state each time, with no trace of the track', () => {
  it('chooses the files by the version in the name: those before 5.3.0, the E1 social fixture and the oldest among them, and never a 5.3.0 file', () => {
    const files = OLD_SAVES()
    expect(files).toContain('save-v1.json.gz')
    expect(files).toContain('save-v5.2.0-social.json.gz')
    expect(files.length).toBeGreaterThanOrEqual(6)
    expect(files.every(olderThan530)).toBe(true)
    // the rule on names that do not exist yet: a 5.3.0 file, and later ones, are not asserted unstamped
    for (const name of ['save-v5.3.0-heavy.json.gz', 'save-v5.3.1.json.gz', 'save-v5.4.0-heavy.json.gz', 'save-v6.0.0.json.gz']) expect(olderThan530(name), name).toBe(false)
    for (const name of ['save-v1.json.gz', 'save-v2.json.gz', 'save-v4.0.2.json.gz', 'save-v5.2.0-social.json.gz']) expect(olderThan530(name), name).toBe(true)
    expect(olderThan530('idb-v4.1.1.json.gz')).toBe(false)
  })

  it.each(OLD_SAVES())('%s: unstamped, hands over to the same JSON twice and from a clone, with no trace of the Life track', (name) => {
    const a = loaded(name)
    expect(socialOn(a)).toBe(false)
    const clone = structuredClone(a)
    const n = overOldSave(a)
    expect(n, 'the hand-over must happen').not.toBe(a)
    expect(traces(n)).toEqual([])
    expect(kinProblems(n)).toEqual([])
    expect(checkLedger(n).ok).toBe(true)
    // the same twice: a fresh load, and a clone of the first
    expect(json(overOldSave(loaded(name)))).toBe(json(n))
    expect(json(overOldSave(clone))).toBe(json(n))
    // and the heir plays on: three years, still no trace, the same JSON after a reload of the hand-over
    const reload = migrateSave(JSON.parse(json(n)))
    expect(reload.kind).toBe('ready')
    for (const g of [n, reload.kind === 'ready' ? reload.game : n]) {
      bindMoneyContext(g)
      for (let y = 0; y < 3; y++) {
        g.queue = []
        ageUp(g)
      }
    }
    expect(traces(n)).toEqual([])
    expect(json(reload.kind === 'ready' ? reload.game : null)).toBe(json(n))
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. Hostile kin records
// ---------------------------------------------------------------------------------------------------------------------------

/** Twelve people with hostile kin keys, two for each of the six shapes the plan names. Made from a person the save already has. */
function hostilePeople(template: Record<string, unknown>): Record<string, unknown>[] {
  const sids = Array.from({ length: 500 }, (_, i) => `kin.us.2000.${i}`)
  const shapes: Record<string, unknown>[] = [
    { spouseSid: 7 },
    { spouseSid: { sid: 'kin.us.2000.1' } },
    { kidSids: sids },
    { kidSids: 'kin.us.2000.2' },
    { kinY: 1e9 },
    { kinY: -1e9 },
    // a save is JSON and has no NaN (the loader refuses one): the file holds null, and the test puts the NaN into the loaded state, as a bug would
    { estateY: null },
    { estateY: 'never' },
    { widowed: 'yes' },
    { widowed: [1, 2, 3] },
    { kin: { niece: true } },
    { kin: 'x'.repeat(5_000) },
  ]
  return shapes.map((extra, i) => {
    const data = (template.data !== null && typeof template.data === 'object' ? { ...(template.data as Record<string, unknown>) } : {}) as Record<string, unknown>
    delete data.sid
    return { ...structuredClone(template), id: `hostile${i}`, firstName: `Hostile${i}`, relation: i % 3 === 0 ? 'sibling' : i % 3 === 1 ? 'friend' : 'child', alive: i % 4 !== 3, age: 30 + i, money: i === 6 ? 1e15 : 1_000, data: { ...data, ...extra, married: i % 2 === 0, spouseName: 'Ana Ruiz' } }
  })
}

describe('hostile kin records load into the oldest fixture, play three years, hand over, and stay bounded', () => {
  for (const stamped of [false, true]) {
    it(`${stamped ? 'on a life the social flag stamps' : 'on the unstamped fixture as it is'}`, () => {
      const name = OLD_SAVES()[0]!
      expect(name).toBe('save-v1.json.gz')
      const g = loaded(name, (raw) => {
        const people = raw.people as Record<string, unknown>[]
        people.push(...hostilePeople(people[0]!))
      })
      expect(g.people.filter((p) => p.id.startsWith('hostile')).length).toBe(12)
      g.people.find((p) => p.id === 'hostile6')!.data.estateY = Number.NaN as never
      if (stamped) stampSocial(g)
      expect(() => kinProblems(g)).not.toThrow()
      // the records bite: the readers name faults in them, and name at most 64 and `and more`
      expect(kinProblems(g).length).toBeGreaterThan(0)
      expect(kinProblems(g).length).toBeLessThanOrEqual(65)
      bindMoneyContext(g)
      for (let y = 0; y < 3; y++) {
        g.queue = []
        expect(() => ageUp(g), `year ${y + 1}`).not.toThrow()
      }
      const n = overOldSave(g)
      expect(n, 'the hand-over must happen').not.toBe(g)
      for (const x of [g, n]) {
        expect(kinProblems(x).length).toBeLessThanOrEqual(65)
        expect(kinRecords(x).length).toBeLessThanOrEqual(KIN_CAPS.records)
        expect(kinPersons(x).length).toBeLessThanOrEqual(KIN_CAPS.persons)
        expect(Object.keys(edgeMap(x)).length).toBeLessThanOrEqual(EDGE_CAPS.edges)
        for (const p of x.people) expect(readKin(p).kids.length).toBeLessThanOrEqual(KIN_CAPS.kids)
        expect(x.people.length).toBeLessThan(2_000)
        expect(checkLedger(x).ok).toBe(true)
      }
      if (!stamped) expect(traces(n).filter((t) => !t.startsWith('hostile'))).toEqual([])
      // frozen, the readers are still pure and total
      expect(() => kinProblems(deepFreeze(structuredClone(n)))).not.toThrow()
    }, TIMEOUT)
  }
})
