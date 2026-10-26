// R4-S11 (D.1, the registry half of the R4 acceptance): the 120-year probe, the same names for the same seed, the mechanism of the banker
// met in 2031 and the minister of 2040, old saves, hostile mets through the whole game, pure reads and the freeze note. No single task of the
// registry owns any of it. The long one: no `// ci: fast`. (The static scans are test/registry-money-scan.test.ts, the ceiling rows
// `met-caps` and `persona-nudge` are in test/ceiling-kit.ts.)
//
// THE PROBE. A life found with findSeed (born 1930, alive at 50) is played 120 years, one year at a time with `playLife({ from: g,
// untilAge: g.character.age + 1 })` (its `onYear` is read-only, so the scripted calls go between the calls). A character does not live 120
// years, so the run goes through two hand-overs with `continueAsChild` to a grown heir (the life has no adult child of its own: the
// driver of test/play-kit.ts never starts a family, so the heir is made by hand with createPerson, as test/world-acceptance.test.ts does
// for its heir). Nothing in a played life calls the registry in R4, so a scripted caller does, between the years, the way L4 and L9 will:
//   - touches three slots a year (a classmate, a coworker, a friend of the year's cohort);
//   - every 7th year puts a stake on one of them (a debt, a company, a feud or a will bit in turn) and three years on clears it, except
//     every 21st, which stays for good (the spouse and heir bits are Life's: they need a kin link, which kinProblems checks);
//   - every 17th year makes one of them a tombstone that is owed 10;
//   - every 10th year materializes one person (a friend, a coworker, a classmate, a teacher, a boss or an ex);
//   - nudges the persona one step a year;
//   - in years 40 and 90 touches 450 more people in one go, past the 400 the store holds.
// After every year: worldProblems (which holds the books and the shard) is empty, checkLedger holds, the Met shard is a valid shard inside
// its caps (400 records, 200 tombstones, 24 nodes a record, 10,401 nodes), every number of the state is finite, no Person with a sid is a
// child, stepchild, grandchild or pet, every stake the caller still holds and every tombstone it left is in the store, the persona is
// inside 0 to 100 with its nudges inside 15 and its stamps inside 40, and the world is inside its budget. materializePerson draws nothing:
// g.rng is where it was and g.nextId is one higher.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { bindMoneyContext } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { withFlags } from '../src/game/flags'
import { checkLedger } from '../src/game/kernel/ledger'
import { heirUnsafe, personEntity, personKey, validSid } from '../src/game/kernel/person-ref'
import { worldSeed } from '../src/game/kernel/streams'
import { continueAsChild, createNewLife } from '../src/game/life'
import { materializePerson, personOfSid, SID_RELATIONS } from '../src/game/materialize'
import { axesOfPerson } from '../src/game/npc-state'
import { createPerson } from '../src/game/people'
import { assembleSave, encodeSave, inlineSave, neededChunkIds } from '../src/game/save-codec'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import { arriveInPast } from '../src/game/timeMachine'
import type { GameState, Person } from '../src/game/types'
import { worldBudget } from '../src/game/world/budget'
import { MET_CAPS, WORLD_NODE_CAP } from '../src/game/world/caps'
import { worldProblems } from '../src/game/world/invariants'
import { latent } from '../src/game/world/latent'
import { isTomb, metKinds, metProblems, metRecord, metTomb, normalizeMet, readMet, writeMet, type MetRecord, type Tomb } from '../src/game/world/met'
import { nameFree, resolveName, takenNames } from '../src/game/world/met-names'
import { isProtected, markMet, salienceOf, STAKE, tombstoneMet, touchMet } from '../src/game/world/met-ops'
import { AT_MAX, inferAxes, NUDGE_AXES, NUDGE_MAX, nudgePersona, personaOf, readPersona } from '../src/game/world/persona-me'
import { makeSid, parseSid } from '../src/game/world/sid'
import '../src/game/world/shards'
import { deepFreeze } from './fuzz-kit'
import { playLife } from './play-kit'
import { ROOT } from './scan-kit'
import { findSeed } from './seed-kit'

const BIRTH_YEAR = 1930
const YEARS = 120
/** The age at which a player of the first two generations hands over (the third plays on to the end). */
const HANDOVER_AGE = 50
/** 400 records of 22 nodes, 200 tombstones of 8 and the map root: the worst case of docs/PEOPLE.md. */
const MET_NODES = MET_CAPS.records * 22 + MET_CAPS.tombs * 8 + 1
const TIMEOUT = 600_000
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')

// ---------------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------------

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
function nodes(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const item = stack.pop()
    n++
    if (item !== null && typeof item === 'object') for (const kid of Array.isArray(item) ? item : Object.values(item)) stack.push(kid)
  }
  return n
}

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

const nameOf = (e: MetRecord | Tomb): string => (isTomb(e) ? `${e[4]} ${e[5]}` : `${e.f} ${e.l}`)
/** Met key to the name stored for it: the thing "the same names for the same seed" is about. */
const namesOf = (g: GameState): Record<string, string> => Object.fromEntries(Object.entries(readMet(g)).map(([k, e]) => [k, nameOf(e)]))
const stakeOf = (e: MetRecord | Tomb): number => (isTomb(e) ? e[3] : e.fl)
const debtOf = (e: MetRecord | Tomb): number => (isTomb(e) ? e[2] : e.ob)
const hasKey = (o: unknown, k: string): boolean => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)
const json = (x: unknown): string => JSON.stringify(x)

// ---------------------------------------------------------------------------------------------------------------------------
// The scripted caller
// ---------------------------------------------------------------------------------------------------------------------------

const TOUCH_KINDS = ['cls', 'cow', 'frn'] as const
/** The relations a materialized person takes in turn: every one of them is in SID_RELATIONS (never child, stepchild, grandchild or pet). */
const RELATIONS = ['friend', 'coworker', 'classmate', 'teacher', 'boss', 'ex'] as const
const BITS = [STAKE.debt, STAKE.company, STAKE.feud, STAKE.will] as const

interface Held {
  fl: number
  forever: boolean
}

/** Everything the caller remembers. Plain JSON, so a clone of it continues a clone of the game. */
interface Script {
  /** Years played. */
  step: number
  /** The people the caller has put a stake on and not cleared. */
  held: Record<string, Held>
  /** The people the caller made a tombstone of, with what they are owed. */
  owed: Record<string, number>
  /** The sids it materialized. */
  made: string[]
  /** The people it touched in the last year. */
  last: string[]
  nudges: number
  floods: number
  handovers: number
  peak: { records: number; tombs: number; nodes: number }
  problems: string[]
}

const freshScript = (): Script => ({ step: 0, held: {}, owed: {}, made: [], last: [], nudges: 0, floods: 0, handovers: 0, peak: { records: 0, tombs: 0, nodes: 0 }, problems: [] })

const cohortOf = (g: GameState): number => Math.max(1850, Math.min(2400, g.year - 20))

/** What the caller does to the registry before a year is played. Draws nothing from g.rng. */
function runScript(g: GameState, s: Script): void {
  const step = s.step
  const note = (m: string): void => void (s.problems.length < 20 && s.problems.push(`step ${step} (${g.year}): ${m}`))

  const sids = TOUCH_KINDS.map((kind, i) => makeSid({ kind, place: 'us', cohort: cohortOf(g), ord: step * 4 + i }))
  sids.forEach((sid, i) => {
    if (!touchMet(g, sid, { w: (step + i) % 10 })) note(`the touch of ${sid} was refused`)
  })
  s.last = sids

  if (step % 7 === 0) {
    const sid = sids[0]!
    const fl = BITS[(step / 7) % BITS.length]!
    if (markMet(g, sid, { fl })) s.held[sid] = { fl, forever: step % 21 === 0 }
    else note(`the stake on ${sid} was refused`)
  }
  if (step % 7 === 3) {
    for (const [sid, h] of Object.entries(s.held)) {
      if (h.forever) continue
      if (!markMet(g, sid, { fl: 0 })) note(`the stake on ${sid} could not be cleared: it is gone`)
      delete s.held[sid]
    }
  }

  if (step % 17 === 9) {
    const sid = s.last[1]!
    if (tombstoneMet(g, sid, { ob: 10, gr: 25 })) s.owed[sid] = 10
    else note(`the tombstone of ${sid} was refused`)
  }

  if (step % 10 === 5) {
    const sid = makeSid({ kind: 'frn', place: 'us', cohort: cohortOf(g), ord: 5000 + step })
    const relation = RELATIONS[Math.floor(step / 10) % RELATIONS.length]!
    const rng = g.rng
    const nextId = g.nextId
    const p = materializePerson(g, sid, { relation, age: 30, role: 5, money: step === 5 ? 1_000 : 0 })
    if (p === null) note(`materializePerson refused ${sid}`)
    else {
      s.made.push(sid)
      if (p.data.sid !== sid) note(`${sid} was made with the sid ${String(p.data.sid)}`)
      if (g.rng !== rng) note('materializePerson moved g.rng')
      if (g.nextId !== nextId + 1) note(`materializePerson moved g.nextId by ${g.nextId - nextId}`)
    }
  }

  if (nudgePersona(g, NUDGE_AXES[step % NUDGE_AXES.length]!, step % 3 === 0 ? -3 : 2, `y${step}`) !== 0) s.nudges++

  if (step === 40 || step === 90) {
    for (let i = 0; i < 450; i++) touchMet(g, makeSid({ kind: 'dat', place: 'us', cohort: cohortOf(g), ord: s.floods * 500 + i }), { w: i % 3 })
    // Right after the flood, before the year's sweep: the store is full to its cap, and not over it.
    const shard = readMet(g)
    const records = Object.keys(shard).filter((k) => !isTomb(shard[k])).length
    s.peak.records = Math.max(s.peak.records, records)
    if (records > MET_CAPS.records) note(`${records} records after a flood of 450, over ${MET_CAPS.records}`)
    s.floods++
  }
}

/** The checks after a year. Every failure is a line of `s.problems` (at most 20), so one broken year does not bury the first. */
function audit(g: GameState, s: Script): void {
  const where = `step ${s.step} (${g.year}, generation ${g.generation}, age ${g.character.age})`
  const bad = (m: string): void => void (s.problems.length < 20 && s.problems.push(`${where}: ${m}`))

  for (const p of worldProblems(g).slice(0, 3)) bad(`world: ${p}`)
  const books = checkLedger(g)
  if (!books.ok) bad(`books: ${books.problems.slice(0, 2).join('; ')}`)
  const stray = firstNonFinite(g)
  if (stray !== null) bad(`not finite: ${stray}`)
  for (const p of worldBudget(g).over) bad(`budget: ${p}`)

  const shard = readMet(g)
  const keys = Object.keys(shard)
  const tombs = keys.filter((k) => isTomb(shard[k])).length
  const metNodes = nodes(g.world?.met)
  s.peak.records = Math.max(s.peak.records, keys.length - tombs)
  s.peak.tombs = Math.max(s.peak.tombs, tombs)
  s.peak.nodes = Math.max(s.peak.nodes, metNodes)
  if (keys.length - tombs > MET_CAPS.records) bad(`${keys.length - tombs} records, over ${MET_CAPS.records}`)
  if (tombs > MET_CAPS.tombs) bad(`${tombs} tombstones, over ${MET_CAPS.tombs}`)
  if (metNodes > MET_NODES) bad(`the shard has ${metNodes} nodes, over ${MET_NODES}`)
  for (const p of metProblems(g.world?.met, g.people).slice(0, 3)) bad(`met: ${p}`)

  for (const p of g.people) {
    if (validSid(p.data?.sid) === null) continue
    if (heirUnsafe(p) || !SID_RELATIONS.has(p.relation)) bad(`${p.id} is a ${p.relation} and holds the sid ${String(p.data.sid)}`)
  }
  for (const [sid, h] of Object.entries(s.held)) {
    const e = shard[sid]
    if (e === undefined) bad(`the stake ${h.fl} on ${sid} was dropped`)
    else if ((stakeOf(e) & h.fl) !== h.fl) bad(`the stake ${h.fl} on ${sid} reads ${stakeOf(e)}`)
  }
  for (const [sid, ob] of Object.entries(s.owed)) {
    const e = shard[sid]
    if (e === undefined) bad(`the debt of ${ob} on ${sid} was dropped`)
    else if (debtOf(e) !== ob) bad(`the debt on ${sid} reads ${debtOf(e)}, not ${ob}`)
  }

  const axes = personaOf(g)
  for (const [axis, v] of Object.entries(axes)) if (!Number.isFinite(v) || v < 0 || v > 100) bad(`the ${axis} axis is ${v}`)
  const rec = readPersona(g)
  for (const axis of NUDGE_AXES) if (Math.abs(rec.n[axis] ?? 0) > NUDGE_MAX) bad(`the ${axis} nudges add up to ${rec.n[axis]}`)
  if (Object.keys(rec.at).length > AT_MAX) bad(`${Object.keys(rec.at).length} year stamps`)
}

/** The oldest living child or stepchild: the heir. Null when there is none. */
function heirOf(g: GameState): Person | null {
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild')).sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : 1))
  return kids[0] ?? null
}

/** The player dies if alive, and the oldest child takes over (one is made when there is none: the driver never starts a family). */
function handOver(g: GameState, s: Script): GameState {
  const heir = heirOf(g) ?? createPerson(g, { relation: 'child', age: Math.max(0, Math.min(40, g.character.age - 25)), lastName: g.character.lastName, relationship: 80 })
  if (g.character.alive) killCharacter(g, 'Old Age')
  g.queue = []
  const before = namesOf(g)
  const n = continueAsChild(g, heir.id)
  if (n === g) {
    s.problems.push(`step ${s.step}: continueAsChild refused ${heir.id}`)
    return g
  }
  s.handovers++
  if (json(namesOf(n)) !== json(before)) s.problems.push(`step ${s.step}: the hand-over changed the names of the Met store`)
  return n
}

interface Run {
  g: GameState
  s: Script
  seed: number
}

/** The seed of the probe's life: born 1930 and alive at 50, found and not pinned (memoised by label). */
const lifeSeed = (): number => findSeed((seed) => playLife({ seed, birthYear: BIRTH_YEAR, untilAge: HANDOVER_AGE }).g.character.alive, { tries: 30, label: 'a life born 1930 that is alive at 50 (the registry probe)' })

function begin(seed: number): Run {
  return { g: createNewLife({ seed, year: BIRTH_YEAR }), s: freshScript(), seed }
}

/** Plays `years` more years of a run: the scripted caller, one year, the checks, and a hand-over when the player is dead or has reached 50. */
function advance(run: Run, years: number, hook?: (run: Run) => void): Run {
  bindMoneyContext(run.g)
  for (let i = 0; i < years; i++) {
    runScript(run.g, run.s)
    playLife({ seed: run.seed, birthYear: BIRTH_YEAR, from: run.g, untilAge: run.g.character.age + 1 })
    run.s.step++
    audit(run.g, run.s)
    if (!run.g.character.alive || (run.g.character.age >= HANDOVER_AGE && run.s.handovers < 2)) {
      run.g = handOver(run.g, run.s)
      bindMoneyContext(run.g)
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

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The 120-year probe
// ---------------------------------------------------------------------------------------------------------------------------

/** What the one long run keeps for the tests that follow it. */
interface Kept {
  final: Run
  /** The state and the caller at the start of year 60 and of year 30. */
  at60: Run
  at30: Run
  /** The names at the end of year 55, for the fork. */
  names55: Record<string, string>
}

let kept: Kept | null = null

function theRun(): Kept {
  if (kept !== null) return kept
  const run = begin(lifeSeed())
  let at30: Run | null = null
  let at60: Run | null = null
  let names55: Record<string, string> = {}
  advance(run, YEARS, (r) => {
    if (r.s.step === 30) at30 = cloneRun(r)
    if (r.s.step === 55) names55 = namesOf(r.g)
    if (r.s.step === 60) at60 = cloneRun(r)
  })
  kept = { final: run, at30: at30!, at60: at60!, names55 }
  return kept
}

describe('the 120-year probe: three generations, the registry called every year', () => {
  it('stays sound for 120 years, through two hand-overs, with the Met store inside its caps and the persona inside its bounds', () => {
    const { final } = theRun()
    expect(final.s.problems).toEqual([])
    expect(final.s.step).toBe(YEARS)
    expect(final.g.year).toBeGreaterThanOrEqual(BIRTH_YEAR + YEARS)
    expect(final.g.generation).toBeGreaterThanOrEqual(3)
    expect(final.s.handovers).toBeGreaterThanOrEqual(2)
    expect(final.g.character.alive).toBe(true)
    // At the end: the store is inside the worst case of the plan and the world inside its budget.
    expect(nodes(final.g.world?.met)).toBeLessThanOrEqual(MET_NODES)
    expect(worldBudget(final.g).over).toEqual([])
    expect(worldProblems(final.g)).toEqual([])
    expect(checkLedger(final.g).problems).toEqual([])
    expect(firstNonFinite(final.g)).toBeNull()
  }, TIMEOUT)

  it('was a real probe: the store was at its cap twice, stakes and tombstones were held, people were made and the persona was nudged', () => {
    const { final } = theRun()
    const s = final.s
    expect(s.peak.records).toBe(MET_CAPS.records)
    expect(s.peak.tombs).toBeGreaterThanOrEqual(4)
    expect(s.peak.nodes).toBeGreaterThan(1_000)
    expect(s.floods).toBe(2)
    expect(Object.values(s.held).filter((h) => h.forever).length).toBeGreaterThanOrEqual(4)
    expect(Object.keys(s.owed).length).toBeGreaterThanOrEqual(5)
    expect(s.made.length).toBe(YEARS / 10)
    expect(s.nudges).toBeGreaterThan(40)
    // Twelve different people, the first of them with an opening balance of 1,000 that the books never saw (the one money literal, LEDGER.md
    // rule 6): checkLedger held after every year all the same.
    expect(new Set(s.made).size).toBe(s.made.length)
  }, TIMEOUT)

  it('ends with people who hold a sid: none is a child, a stepchild, a grandchild or a pet, and each has a record', () => {
    const { final } = theRun()
    const withSid = final.g.people.filter((p) => validSid(p.data?.sid) !== null)
    expect(withSid.length).toBeGreaterThan(0)
    for (const p of withSid) {
      expect(heirUnsafe(p), `${p.id} ${p.relation}`).toBe(false)
      expect(SID_RELATIONS.has(p.relation), `${p.id} ${p.relation}`).toBe(true)
    }
    expect(metProblems(final.g.world?.met, final.g.people)).toEqual([])
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. The same names for the same seed
// ---------------------------------------------------------------------------------------------------------------------------

describe('the same seed gives the same names', () => {
  it('plays the run twice to the same Met keys and names, and the same state', () => {
    const a = theRun().final
    const b = advance(begin(lifeSeed()), YEARS)
    expect(b.s.problems).toEqual([])
    expect(Object.keys(namesOf(a.g)).length).toBeGreaterThan(10)
    expect(namesOf(b.g)).toEqual(namesOf(a.g))
    expect(json(b.g)).toBe(json(a.g))
    expect(b.s).toEqual(a.s)
  }, TIMEOUT)

  it('continues a structuredClone of year 60 to the names and the state of the original', () => {
    const { final, at60 } = theRun()
    expect(at60.s.step).toBe(60)
    const c = advance(cloneRun(at60), YEARS - 60)
    expect(c.s.problems).toEqual([])
    expect(namesOf(c.g)).toEqual(namesOf(final.g))
    expect(json(c.g)).toBe(json(final.g))
  }, TIMEOUT)

  it('continues a JSON reload of year 60 to the names and the state of the original', () => {
    const { final, at60 } = theRun()
    const r = advance(reloadRun(at60), YEARS - 60)
    expect(r.s.problems).toEqual([])
    expect(namesOf(r.g)).toEqual(namesOf(final.g))
    expect(json(r.g)).toBe(json(final.g))
  }, TIMEOUT)

  it('keeps every key and name through each hand-over, and the latent person of a sid is the same for the parent and the heir', () => {
    // The probe's hand-over compares the names before and after (a problem otherwise); here the heir of a dead player is read apart.
    const g = createNewLife({ seed: lifeSeed(), year: BIRTH_YEAR })
    const sid = makeSid({ kind: 'cls', place: 'us', cohort: 1950, ord: 3 })
    expect(touchMet(g, sid, { fl: STAKE.debt })).toBe(true)
    const kid = createPerson(g, { relation: 'child', age: 26, lastName: g.character.lastName, relationship: 80 })
    killCharacter(g, 'Old Age')
    const heir = continueAsChild(g, kid.id)
    expect(heir).not.toBe(g)
    expect(heir.lifeId).not.toBe(g.lifeId)
    expect(namesOf(heir)).toEqual(namesOf(g))
    expect(readMet(heir)[sid]).toEqual(readMet(g)[sid])
    expect(worldSeed(heir)).toBe(worldSeed(g))
    expect(latent(worldSeed(heir), parseSid(sid)!)).toEqual(latent(worldSeed(g), parseSid(sid)!))
  })

  it('forks through the Time Machine: the fork starts with the names of its snapshot, and 25 years on every person of the snapshot that both lines still hold has the same name', () => {
    const { final, at30, names55 } = theRun()
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
    const fromSnapshot = both.filter((k) => hasKey(snapshotNames, k))
    // The people of the snapshot that are still held in both lines (the stakes the caller kept for good, the tombstones it left).
    expect(fromSnapshot.length).toBeGreaterThan(0)
    for (const key of fromSnapshot) expect(forkNames[key], key).toBe(names55[key])
    // A fork may differ only in the people met after the snapshot: the dice of the two lines are not the same, so a person they both met later
    // may meet a different name in the way (the name registry gives the pure name to the first promoted), and any key that has two names is one of those.
    for (const key of both) if (forkNames[key] !== names55[key]) expect(hasKey(snapshotNames, key), `${key} was in the snapshot and has two names`).toBe(false)
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. The banker met in 2031 and the minister of 2040 (X46): the mechanism
// ---------------------------------------------------------------------------------------------------------------------------
// R4 does not deliver the player-facing line (it needs the writers of R6 D.6 and the politics slots of R7). It delivers the mechanism, proved
// here through a played life from 1990: a person touched in 2031 and let go comes back in 2040 with the same name. A tombstone keeps the name
// itself; a plain record that was dropped comes back through the name registry, which gives the same name as long as nobody took it.

const BANKER = makeSid({ kind: 'frn', place: 'us', cohort: 2005, ord: 31 })

/** Plays a life on to `year`, one year to a call (a call of playLife answers the popups with a fresh driver, so a path is the path of its calls). */
function walkTo(g: GameState, seed: number, year: number): void {
  bindMoneyContext(g)
  while (g.year < year && g.character.alive) playLife({ seed, birthYear: 1990, from: g, untilAge: g.character.age + 1 })
}

/** A life born 1990 that is alive in 2040, found by the very path the tests below walk (to 2031 in one call, then a year at a time). */
const bankerSeed = (): number =>
  findSeed(
    (seed) => {
      const g = playLife({ seed, birthYear: 1990, untilAge: 41 }).g
      walkTo(g, seed, 2040)
      return g.character.alive && g.year === 2040
    },
    { tries: 30, label: 'a life born 1990 that is alive in 2040 (the banker)' },
  )

/** A life from 1990 played to 2031, with the banker met that year (owed or not). */
function bankerLife(owed: boolean): GameState {
  const g = playLife({ seed: bankerSeed(), birthYear: 1990, untilAge: 41 }).g
  expect(g.year).toBe(2031)
  expect(touchMet(g, BANKER, { w: 6 })).toBe(true)
  if (owed) expect(markMet(g, BANKER, { fl: STAKE.debt })).toBe(true)
  return g
}

function playTo(g: GameState, year: number): void {
  walkTo(g, bankerSeed(), year)
  expect(g.year).toBe(year)
  expect(g.character.alive).toBe(true)
}

/** A stranger of the world who takes a name: a friend with every field given, so g.rng does not move (a popup friend does the same, with dice). */
function takeName(g: GameState, first: string, last: string): void {
  createPerson(g, { relation: 'friend', age: 40, gender: 'male', firstName: first, lastName: last, occupation: 'Banker', traits: [], stats: { happiness: 60, health: 70, smarts: 60, looks: 50 }, relationship: 40, money: 0 })
}

describe('the banker met in 2031 is the minister in 2040: the same name, the same person, through a played life', () => {
  it('a tombstone keeps the name: the banker owed in 2031 is a tombstone by 2040, and wakes with the same name, the year first met and the debt', () => {
    const g = bankerLife(true)
    const met = nameOf(metRecord(g, BANKER)!)
    playTo(g, 2040)
    const tomb = metTomb(g, BANKER)
    expect(tomb, 'the record became a tombstone while the banker was away').not.toBeNull()
    expect(metRecord(g, BANKER)).toBeNull()
    expect(`${tomb![4]} ${tomb![5]}`).toBe(met)
    expect(tomb![3] & STAKE.debt).toBe(STAKE.debt)
    expect(touchMet(g, BANKER, { w: 9 })).toBe(true)
    const back = metRecord(g, BANKER)!
    expect(nameOf(back)).toBe(met)
    expect(back.y).toBe(2031)
    expect(back.s).toBe(2040)
    expect(back.fl & STAKE.debt).toBe(STAKE.debt)
    expect(metTomb(g, BANKER)).toBeNull()
    expect(worldProblems(g)).toEqual([])
  }, TIMEOUT)

  it('a name that someone took in the meantime does not change the tombstone, and does change a plain record that was dropped', () => {
    const owed = bankerLife(true)
    const plain = bankerLife(false)
    const name = nameOf(metRecord(plain, BANKER)!)
    const [first, last] = name.split(' ') as [string, string]
    expect(JSON.stringify(namesOf(owed))).toBe(JSON.stringify(namesOf(plain)))
    for (const g of [owed, plain]) {
      playTo(g, 2039)
      // A stranger of the world takes the very name (a Person of g.people, as any friend the popups make). The banker is away: no record of it
      // is left in the plain life, and a tombstone is left in the other.
      takeName(g, first, last)
      playTo(g, 2040)
    }
    expect(metRecord(plain, BANKER), 'dropped: nothing held it').toBeNull()
    expect(metTomb(plain, BANKER), 'dropped: it was not owed').toBeNull()
    expect(touchMet(owed, BANKER)).toBe(true)
    expect(touchMet(plain, BANKER)).toBe(true)
    expect(nameOf(metRecord(owed, BANKER)!), 'the tombstone kept the name').toBe(name)
    expect(nameOf(metRecord(plain, BANKER)!), 'the name had been taken: the registry gives an alternate').not.toBe(name)
    expect(metRecord(plain, BANKER)!.k).toBeGreaterThan(0)
  }, TIMEOUT)

  it('with nobody in the way, a plain record that was dropped comes back with the same name', () => {
    const g = bankerLife(false)
    const name = nameOf(metRecord(g, BANKER)!)
    playTo(g, 2040)
    expect(metRecord(g, BANKER)).toBeNull()
    expect(metTomb(g, BANKER)).toBeNull()
    expect(touchMet(g, BANKER)).toBe(true)
    expect(nameOf(metRecord(g, BANKER)!)).toBe(name)
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 4. Old saves
// ---------------------------------------------------------------------------------------------------------------------------

type Version = readonly [number, number, number]

/** The release a fixture was recorded at, from its name: save-v1 is 1.0.0, save-v4.0.2 is 4.0.2, save-v5.2.0-social is 5.2.0. */
function versionOf(file: string): Version | null {
  const m = /^save-v(\d+)(?:\.(\d+))?(?:\.(\d+))?(?=[-.])/.exec(file)
  return m === null ? null : [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)]
}

/** True when `v` is at or after v5.3.0, the release that adds the Met shard and the persona record. */
const fromRegistry = (v: Version): boolean => (v[0] !== 5 ? v[0] > 5 : v[1] !== 3 ? v[1] > 3 : true)

const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((name) => /^save-.*\.json\.gz$/.test(name))
  .sort()

const fixtureRaw = (name: string): Record<string, unknown> => JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()) as Record<string, unknown>

function loaded(raw: unknown, name: string): GameState {
  const r = migrateSave(raw)
  if (r.kind !== 'ready') throw new Error(`${name} did not load: ${r.kind}`)
  return r.game
}

/** The state read back the way the boot reads it (the head and its chunks), and the head the second save of it writes. */
function savedTwice(g: GameState): { first: string; again: string; back: GameState } {
  const first = encodeSave(g)
  const head = JSON.parse(first.head) as Record<string, unknown>
  const texts = new Map<string, string | null>(neededChunkIds(head).map((id) => [id, first.chunks.get(id) ?? null]))
  const a = assembleSave(head, texts)
  if (a.kind !== 'ready') throw new Error(`the save did not assemble: ${a.reason}`)
  expect(a.lost).toEqual([])
  const m = migrateSave(a.game, { versions: a.versions })
  if (m.kind !== 'ready') throw new Error(`the save did not load again: ${m.kind}`)
  return { first: first.head, again: encodeSave(m.game).head, back: m.game }
}

/** One year the way a test plays it: no popup in the way. */
function oneYear(g: GameState): void {
  g.queue = []
  ageUp(g)
}

/**
 * The rule of a save recorded before v5.3.0: no shard and no persona record, and three played years write neither (nothing calls a
 * writer). Throws on the first thing that is wrong, so a test can show that it can.
 */
function expectBeforeRegistry(name: string, g: GameState): void {
  expect(hasKey(g.world ?? {}, 'met'), `${name}: a met key`).toBe(false)
  expect(hasKey(g.flags, 'persona.me'), `${name}: a persona.me key`).toBe(false)
  for (let i = 1; i <= 3; i++) {
    oneYear(g)
    expect(hasKey(g.world ?? {}, 'met'), `${name}: a met key after year ${i}`).toBe(false)
    expect(hasKey(g.flags, 'persona.me'), `${name}: a persona.me key after year ${i}`).toBe(false)
  }
  expect(readMet(g)).toEqual({})
  expect(Object.values(metKinds(g)).every((n) => n === 0)).toBe(true)
  expect(worldProblems(g).filter((p) => !p.startsWith('ledger: '))).toEqual([])
  expect(firstNonFinite(g)).toBeNull()
}

/**
 * The rule of a save of v5.3.0 or later: it may hold the shard (the stamped fixture of the release does), the shard is a valid one that
 * reads as itself, and the save is the same bytes again, with the same names.
 */
function expectFromRegistry(name: string, g: GameState): void {
  const met: unknown = g.world?.met
  if (met !== undefined) {
    expect(normalizeMet(met), `${name}: the shard normalizes to itself`).toBe(met)
    expect(metProblems(met, g.people), `${name}: the shard`).toEqual([])
  }
  const s = savedTwice(g)
  expect(s.again, `${name}: the head after a reload`).toBe(s.first)
  expect(inlineSave(s.back), `${name}: the state after a reload`).toBe(inlineSave(g))
  expect(namesOf(s.back), `${name}: the names after a reload`).toEqual(namesOf(g))
}

describe('old saves: the registry exists only where a release put it', () => {
  it('finds the fixtures and a version in every name', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(7)
    for (const name of FIXTURES) expect(versionOf(name), name).not.toBeNull()
    expect(versionOf('save-v1.json.gz')).toEqual([1, 0, 0])
    expect(versionOf('save-v4.0.2.json.gz')).toEqual([4, 0, 2])
    expect(versionOf('save-v5.2.0-social.json.gz')).toEqual([5, 2, 0])
    expect(versionOf('save-v5.3.0-heavy.json.gz')).toEqual([5, 3, 0])
    expect(fromRegistry([5, 2, 0])).toBe(false)
    expect(fromRegistry([5, 3, 0])).toBe(true)
    expect(fromRegistry([5, 10, 0])).toBe(true)
    expect(fromRegistry([6, 0, 0])).toBe(true)
    expect(fromRegistry([1, 0, 0])).toBe(false)
  })

  describe.each(FIXTURES)('%s', (name) => {
    it('loads with the rule of its release', () => {
      const g = loaded(fixtureRaw(name), name)
      expect(isLoadableGame(g)).toBe(true)
      expect(Number.isFinite(personaOf(g).honesty)).toBe(true)
      if (fromRegistry(versionOf(name)!)) expectFromRegistry(name, g)
      else expectBeforeRegistry(name, g)
    }, TIMEOUT)
  })

  describe('the two rules can fail', () => {
    it('the rule of a save from before v5.3.0 names a met key and a persona record', () => {
      expectBeforeRegistry('save-v1', loaded(fixtureRaw('save-v1.json.gz'), 'save-v1'))
      const withShard = loaded(fixtureRaw('save-v1.json.gz'), 'save-v1')
      expect(touchMet(withShard, makeSid({ kind: 'cls', place: 'us', cohort: 2000, ord: 1 }))).toBe(true)
      expect(() => expectBeforeRegistry('save-v1 with a shard', withShard)).toThrow()
      const withPersona = loaded(fixtureRaw('save-v1.json.gz'), 'save-v1')
      expect(nudgePersona(withPersona, 'honesty', 2, 'teeth')).toBe(2)
      expect(() => expectBeforeRegistry('save-v1 with a persona record', withPersona)).toThrow()
    })

    it('the rule of a save from v5.3.0 on passes a state that holds a shard and a persona record, and names a shard that is not its own reading', () => {
      const g = loaded(fixtureRaw('save-v1.json.gz'), 'save-v1')
      expectFromRegistry('v1 with nothing', structuredClone(g))
      const sid = makeSid({ kind: 'cls', place: 'us', cohort: 2000, ord: 1 })
      expect(touchMet(g, sid, { w: 4 })).toBe(true)
      expect(markMet(g, sid, { fl: STAKE.debt })).toBe(true)
      expect(nudgePersona(g, 'risk', 3, 'teeth')).toBe(3)
      expectFromRegistry('v1 with a shard and a persona record', g)
      const bad = loaded(fixtureRaw('save-v1.json.gz'), 'save-v1')
      ;(bad as { world?: unknown }).world = { v: 1, met: { 'not a sid': { f: 'A', l: 'B' } } }
      expect(() => expectFromRegistry('v1 with a bad shard', bad)).toThrow()
    })
  })

  it('leaves a life played from 1990 to 2026 with neither key when no writer ran (built with the social flag off, so the build default cannot matter)', () => {
    const make = (seed: number): GameState => withFlags({ social: false }, () => playLife({ seed, birthYear: 1990, untilAge: 36 }).g)
    const seed = findSeed((s) => make(s).character.age >= 36, { tries: 30, label: 'a life born 1990 that reaches thirty-six (no social stamp)' })
    const g = make(seed)
    expect(g.year).toBeGreaterThanOrEqual(2026)
    expect(hasKey(g.world ?? {}, 'met')).toBe(false)
    expect(hasKey(g.world ?? {}, 'social')).toBe(false)
    expect(hasKey(g.flags, 'persona.me')).toBe(false)
    expect(readMet(g)).toEqual({})
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. Twelve hostile mets, through the whole game
// ---------------------------------------------------------------------------------------------------------------------------
// The twelve of test/world-met-save.test.ts (R4-S5) put into the oldest fixture, and this time the life is played with the registry in use:
// the scripted caller touches three slots a year and nudges the persona, four years play through the popup loop, the player dies and an heir
// takes over, two more years play, and the shard is read after each year, after the hand-over and after a reload.

const NEVER_MADE = 'a shard that no game wrote'
const HOSTILE_LIFE = 17

const hostileSid = (i: number): string => makeSid({ kind: 'cls', place: i % 3 === 0 ? 'US' : i % 3 === 1 ? 'us' : 'Us', cohort: 1950 + (i % 60), ord: i })
const FIRSTS = ['Maribel', 'Okonkwo', 'Takeshi', 'Ingrid', 'Rashid', 'Bao', 'Odalys', 'Lennart']
const LASTS = ['Okonkwo-Reyes', 'Nakamura', 'Lindqvist', 'Abdelrahman', 'Castellanos', 'Whitfield']
const fullRec = (i: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  f: FIRSTS[i % 8]!, l: LASTS[i % 6]!, g: i % 2, b: 1950 + (i % 60), c: 'us', k: i % 9, a: [50, 40, 60, 30, 70], y: 2000 + (i % 30), s: 2030 + (i % 20), w: i % 10, fl: 0, gr: 0, ob: 0, d: 2060, r: 'banker', j: `firm:f${1000 + i}`, ...over,
})
const tombRec = (i: number): unknown[] => [2040 + (i % 20), 0, 0, 0, FIRSTS[i % 8]!, LASTS[i % 6]!, (1950 + (i % 60)) * 2 + (i % 2)]
const flood = (n: number): Record<string, unknown> => Object.fromEntries(Array.from({ length: n }, (_, i) => [makeSid({ kind: 'cls', place: `p${Math.floor(i / 1000)}`, cohort: 1850 + (i % 500), ord: i % 1000 }), fullRec(i, { s: 1900 + (i % 200) })]))

interface Hostile {
  name: string
  /** The value for `world.met`. `room` is how many nodes the save may still add before the loader's cap. */
  make: (room: number) => unknown
}

const HOSTILE: Hostile[] = [
  { name: 'a number', make: () => 42 },
  { name: 'a string', make: () => NEVER_MADE },
  { name: 'an array of records', make: () => [fullRec(1), fullRec(2), tombRec(3)] },
  { name: 'a __proto__ key', make: () => JSON.parse(`{"__proto__":{"f":"Evil","v":1},"${hostileSid(1)}":${json(fullRec(1))}}`) as unknown },
  { name: '5,000 records', make: () => flood(5_000) },
  { name: 'as many records as the loader leaves room for', make: (room) => flood(Math.min(40_000, Math.floor((room - 100) / 24))) },
  { name: 'fields of 1e300 and minus 1e300', make: () => Object.fromEntries(['g', 'b', 'k', 'y', 's', 'w', 'fl', 'gr', 'ob'].map((f, i) => [hostileSid(i), { ...fullRec(i), [f]: i % 2 === 0 ? 1e300 : -1e300 }])) },
  { name: '10,000-character names, tags and refs', make: () => ({ [hostileSid(1)]: fullRec(1, { f: 'x'.repeat(10_000), l: 'y'.repeat(10_000), r: 'r'.repeat(10_000), j: `firm:${'j'.repeat(10_000)}` }), [hostileSid(2)]: [2040, 0, 0, 0, 'f'.repeat(10_000), 'l'.repeat(10_000), 3900] }) },
  { name: 'keys out of order, and keys like out.Ann.Lee', make: () => ({ [hostileSid(9)]: fullRec(9), [hostileSid(3)]: fullRec(3), 'out.Ann.Lee': fullRec(1), 'out.Ann.Lee.1.2': fullRec(2), [hostileSid(1)]: fullRec(1), p7: tombRec(7) }) },
  { name: 'tombstones of the wrong length', make: () => ({ [hostileSid(1)]: tombRec(1).slice(0, 6), [hostileSid(2)]: [...tombRec(2), 9], [hostileSid(3)]: tombRec(3) }) },
  { name: 'fields of the wrong kind: null, objects, arrays and text for numbers', make: () => Object.fromEntries([null, {}, [], 'x', true].map((v, i) => [hostileSid(i), { ...fullRec(i), b: v, y: v, a: v, fl: v }])) },
  { name: 'axes lists of 5,000 numbers', make: () => Object.fromEntries(Array.from({ length: 50 }, (_, i) => [hostileSid(i), { ...fullRec(i), a: Array.from({ length: 5_000 }, () => 50) }])) },
]

/** What the shard must be after any year: a valid shard inside the worst case, which reads as itself. */
function expectSoundMet(g: GameState, where: string): void {
  const read = readMet(g)
  expect(metProblems(read), `${where}: the shard as read`).toEqual([])
  expect(nodes(read), `${where}: nodes of the shard as read`).toBeLessThanOrEqual(MET_NODES)
  expect(normalizeMet(read), `${where}: the shard as read is a fixed point`).toBe(read)
  expect(nodes(g.world), `${where}: nodes of the world`).toBeLessThan(WORLD_NODE_CAP)
  expect(checkLedger(g, { allowHeal: true }).problems, `${where}: the books`).toEqual([])
  expect(firstNonFinite(read), `${where}: a number that is not finite`).toBeNull()
}

describe('twelve hostile mets put into the oldest fixture and played through the whole game', () => {
  it('has twelve of them', () => {
    expect(HOSTILE).toHaveLength(12)
  })

  it.each(HOSTILE.map((h) => [h.name, h] as const))(
    '%s: loads, four years play with the registry in use, an heir takes over, two more years play and a reload agrees',
    (_name, hostile) => {
      const raw = fixtureRaw('save-v1.json.gz')
      const room = 500_000 - nodes(raw)
      raw.world = { v: 1, met: hostile.make(room) }
      let g = loaded(raw, 'save-v1 with a hostile shard')
      expect(isLoadableGame(g)).toBe(true)
      let wrote = 0
      const year = (label: string): void => {
        const step = g.year
        TOUCH_KINDS.forEach((kind, i) => {
          if (touchMet(g, makeSid({ kind, place: 'us', cohort: cohortOf(g), ord: step % 1000 + i }), { w: 3 })) wrote++
        })
        nudgePersona(g, 'empathy', 2, `h${step}`)
        playLife({ seed: HOSTILE_LIFE, birthYear: g.year - g.character.age, from: g, untilAge: g.character.age + 1 })
        expect(g.character.alive, `${label}: alive`).toBe(true)
        expectSoundMet(g, label)
      }
      bindMoneyContext(g)
      for (let i = 1; i <= 4; i++) year(`year ${i}`)
      // Whatever was stored, a write cleans it: after a touch that was accepted the stored shard is valid too.
      if (wrote > 0) expect(metProblems(g.world?.met, g.people), 'the stored shard after a write').toEqual([])
      const before = namesOf(g)

      const kid = createPerson(g, { relation: 'child', age: 26, lastName: g.character.lastName, relationship: 80 })
      killCharacter(g, 'Old Age')
      g.queue = []
      const heir = continueAsChild(g, kid.id)
      expect(heir).not.toBe(g)
      expect(namesOf(heir), 'the hand-over').toEqual(before)
      g = heir
      bindMoneyContext(g)
      expectSoundMet(g, 'the heir')
      for (let i = 1; i <= 2; i++) year(`heir, year ${i}`)

      const back = savedTwice(g)
      expect(back.again, 'the head after a reload').toBe(back.first)
      expect(namesOf(back.back), 'the names after a reload').toEqual(namesOf(g))
      expectSoundMet(back.back, 'after a reload')
    },
    TIMEOUT,
  )
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. Reads are pure
// ---------------------------------------------------------------------------------------------------------------------------

describe('every read of the registry is pure on a deep-frozen state', () => {
  it('writes nothing, draws nothing and takes no id: g.rng, g.nextId and the whole state are what they were', () => {
    const { final } = theRun()
    const g = deepFreeze(structuredClone(final.g))
    const before = json(g)
    const { rng, nextId } = g
    const keys = Object.keys(readMet(g))
    expect(keys.length).toBeGreaterThan(5)
    const first = keys.find((k) => !isTomb(readMet(g)[k]!))!
    const lat = latent(worldSeed(g), parseSid(first)!)
    const person = g.people.find((p) => validSid(p.data?.sid) !== null) ?? g.people[0]!
    for (const key of [first, ...keys.slice(0, 20), 'p1', 'not a sid']) {
      metRecord(g, key)
      metTomb(g, key)
      isProtected(g, key)
      salienceOf(g, key)
    }
    metKinds(g)
    metProblems(g.world?.met, g.people)
    readPersona(g)
    personaOf(g)
    inferAxes(g)
    personOfSid(g, first)
    personKey(person)
    personEntity(person)
    axesOfPerson(g, person)
    takenNames(g)
    nameFree(g, lat.first, lat.last)
    resolveName(g, lat)
    worldProblems(g)
    worldBudget(g)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
    expect(json(g)).toBe(before)
  })

  it('has teeth: a write to the frozen state throws, so a read that wrote would have failed', () => {
    const { final } = theRun()
    const g = deepFreeze(structuredClone(final.g))
    const key = Object.keys(readMet(g)).find((k) => !isTomb(readMet(g)[k]!))!
    const sid = makeSid({ kind: 'cls', place: 'us', cohort: 2000, ord: 9 })
    expect(() => writeMet(g, { ...readMet(g), [sid]: { ...metRecord(g, key)! } })).toThrow(TypeError)
    expect(() => nudgePersona(g, 'risk', 2, 'frozen')).toThrow(TypeError)
    // touchMet and markMet answer false for a failure and say nothing: the state is what it was.
    expect(touchMet(g, sid)).toBe(false)
    expect(hasKey(readMet(g), sid)).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 7. The freeze note
// ---------------------------------------------------------------------------------------------------------------------------

const readDoc = (name: string): string => (existsSync(join(ROOT, 'docs', name)) ? readFileSync(join(ROOT, 'docs', name), 'utf8') : '')
const section = (doc: string, heading: string): string => {
  const start = doc.indexOf(heading)
  if (start < 0) return ''
  const next = doc.indexOf('\n## ', start + 1)
  return doc.slice(start, next < 0 ? undefined : next)
}

/** Every name R5 and R6 code against, under the file that exports it: section 9.1 of docs/PEOPLE.md lists them all. */
const CONTRACT: Readonly<Record<string, readonly string[]>> = {
  'src/game/kernel/person-ref.ts': ['validSid', 'personKey', 'personEntity', 'heirUnsafe'],
  'src/game/world/sid.ts': ['SID_KINDS', 'SidKind', 'Slot', 'SID_LIMITS', 'makeSid', 'parseSid', 'isSid'],
  'src/game/world/latent.ts': ['LATENT_V', 'FACET', 'KIND_AGE', 'STAT_RANGE', 'LatentPerson', 'SeededIdentity', 'latent', 'fromSeeded', 'latentUnit', 'nameDraw'],
  'src/game/world/met.ts': ['MetRecord', 'Tomb', 'MetShard', 'MET_LIMITS', 'normalizeMet', 'readMet', 'metRecord', 'metTomb', 'isTomb', 'metKinds', 'metProblems', 'writeMet', 'packGb', 'unpackGb'],
  'src/game/world/caps.ts': ['MET_CAPS'],
  'src/game/world/met-names.ts': ['takenNames', 'nameFree', 'resolveName', 'BRAND_PAIRS'],
  'src/game/world/met-ops.ts': ['STAKE', 'MET_RULES', 'MetPatch', 'touchMet', 'markMet', 'evictMet', 'tombstoneMet', 'sweepMet', 'isProtected', 'salienceOf', 'registerProtector', 'registerSalience'],
  'src/game/materialize.ts': ['MaterializeOpts', 'SID_RELATIONS', 'heirUnsafe', 'materializePerson', 'personOfSid'],
  'src/game/world/axes.ts': ['AXIS_IDS', 'Axes', 'AxisTuple', 'TRAIT_AXES', 'TRAIT_SETS', 'STAFF_AXES', 'VOICES', 'VOICE_PROTOTYPES', 'DRIVE_TRAITS', 'INTEGRITY_TRAITS', 'axesFromTraits', 'labelsFromAxes', 'axesFromStaff', 'voiceOf'],
  'src/game/npc-state.ts': ['axesOfPerson'],
  'src/game/world/persona-me.ts': ['PERSONA_KEY', 'NUDGE_MAX', 'NUDGE_STEP', 'NUDGE_SLOTS', 'AT_MAX', 'NudgeAxis', 'PersonaMe', 'inferAxes', 'personaOf', 'readPersona', 'writePersona', 'nudgePersona'],
}

/** One line for each name the block does not mention as a word, and each name the file does not export (a declaration or an export list). */
function contractProblems(contract: Readonly<Record<string, readonly string[]>>, block: string, read: (path: string) => string): string[] {
  const out: string[] = []
  for (const [path, names] of Object.entries(contract)) {
    const text = read(path)
    for (const name of names) {
      if (!new RegExp(`(?:^|[^A-Za-z0-9_$])${name}(?![A-Za-z0-9_$])`).test(block)) out.push(`${name} is not in section 9.1`)
      const declared = new RegExp(`export\\s+(?:declare\\s+)?(?:function|const|interface|type|class)\\s+${name}\\b`)
      const listed = new RegExp(`export\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`)
      if (!declared.test(text) && !listed.test(text)) out.push(`${path} does not export ${name}`)
    }
  }
  return out
}

describe('docs/PEOPLE.md is the freeze note R5 and R6 code against', () => {
  const people = readDoc('PEOPLE.md')
  const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

  it('names all eight shapes of the inventory, in a table of eight rows', () => {
    const inventory = section(people, '## 4. Inventory')
    expect(inventory.length).toBeGreaterThan(1_000)
    for (const shape of ['Candidate', 'strangerName', 'opponent', 'CareerRival', 'Director', 'KeyStaff', 'Manager', 'Outsider']) expect(inventory, shape).toContain(`\`${shape}`)
    const rows = inventory.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Shape') && !l.startsWith('|---'))
    expect(rows).toHaveLength(8)
  })

  it('cites only lines that exist, and the first line each row cites holds the type it names', () => {
    const bad: string[] = []
    const sources: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${dir}/${e.name}`)
        else if (/\.tsx?$/.test(e.name)) sources.push(`${dir}/${e.name}`)
      }
    }
    walk('src')
    const lineOfCite = (path: string, n: number): string | null => {
      const hits = sources.filter((f) => f === path || f.endsWith(`/${path}`))
      for (const f of hits) {
        const lines = readFileSync(join(ROOT, f), 'utf8').split('\n')
        if (n >= 1 && n <= lines.length && lines[n - 1]!.trim() !== '') return lines[n - 1]!
      }
      return null
    }
    let cited = 0
    for (const [i, line] of people.split('\n').entries()) {
      let path: string | null = null
      let first = true
      for (const m of line.matchAll(/(?:([A-Za-z0-9_./-]+\.tsx?))?:(\d+)(?:-\d+)?/g)) {
        if (m[1] !== undefined) path = m[1]
        if (path === null) continue
        cited++
        const text = lineOfCite(path, Number(m[2]))
        if (text === null) bad.push(`PEOPLE.md:${i + 1} cites ${path}:${m[2]}, which is not a line of a file under src`)
        else if (line.startsWith('| ') && first) {
          // The first cite of an inventory row is the type: the line holds the name the row starts with.
          const shape = /^\| (?:dating |nepo |election )?`?([A-Za-z]+)/.exec(line)?.[1]
          const names: Record<string, string> = { Candidate: 'Candidate', strangerName: 'strangerName', opponent: 'opponent', CareerRival: 'CareerRival', Director: 'Director', KeyStaff: 'KeyStaff', Manager: 'Manager', Outsider: 'Outsider' }
          const wanted = shape !== undefined ? names[shape] : undefined
          if (wanted !== undefined && !text.includes(wanted)) bad.push(`PEOPLE.md:${i + 1} cites ${path}:${m[2]} for ${wanted}, and that line reads "${text.trim().slice(0, 60)}"`)
        }
        first = false
      }
    }
    expect(cited).toBeGreaterThan(10)
    expect(bad).toEqual([])
  })

  it('lists in section 9.1 every name of the contract, and each is exported by the file it is listed under', () => {
    const start = people.indexOf('### 9.1')
    const block = people.slice(start, people.indexOf('### 9.2', start))
    expect(block.length).toBeGreaterThan(2_000)
    expect(contractProblems(CONTRACT, block, (path) => readFileSync(join(ROOT, path), 'utf8'))).toEqual([])
  })

  it('has teeth: a name that the block leaves out and a name that no file exports are both found', () => {
    const files: Record<string, string> = { 'a.ts': 'export function touchMet() {}\nexport interface Slot {}\nexport { heirUnsafe } from "./x"\nfunction hidden() {}\nexport function touchMetX() {}' }
    const read = (path: string): string => files[path] ?? ''
    expect(contractProblems({ 'a.ts': ['touchMet', 'Slot', 'heirUnsafe'] }, 'touchMet Slot `heirUnsafe`', read)).toEqual([])
    expect(contractProblems({ 'a.ts': ['touchMet'] }, 'the block names touchMetX only', read)).toEqual(['touchMet is not in section 9.1'])
    expect(contractProblems({ 'a.ts': ['hidden'] }, 'hidden', read)).toEqual(['a.ts does not export hidden'])
    expect(contractProblems({ 'a.ts': ['touch'] }, 'touch', read)).toEqual(['a.ts does not export touch'])
  })

  it('has no long dash', () => {
    expect(people).not.toMatch(dashes)
    expect(readDoc('WORLD.md')).not.toMatch(dashes)
  })
})
