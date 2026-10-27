// R4-E15 (D.12; part A): the kit of the social acceptance probe. Three stamped lives are played 120 years each, one year at a time, with a
// scripted caller between the years that does what a player and the popups of the real game do to the web of people: asks for favors and
// loans, betrays and keeps secrets, makes peace, takes someone under a wing, marries, divorces, hires a child and writes one out of the will,
// and twice a life is flooded with more edges, memories, debts, feuds, secrets and talk records than the caps hold. After every year the
// same checks run (audit). The lives are a family founder, a romantic life and a rich life with a will fight.
//
//   LIFES            the three specs (founder, romantic, rich): how a life starts and what its script does in a year
//   begin(spec)      a run at its first year        advance(run, n, hook?)   plays n more years, with the hand-overs
//   cloneRun, reloadRun    a structuredClone and a save-and-load of a run (the script state goes with it)
//   audit(run)       the checks of one year (also run by advance); every failure is a line of run.s.problems
//   edgeStats(g)     the counts of the stored map: edges, secrets, memories, debts, feuds, talk records
//
// Everything is deterministic: the script reads the state and the step, never a clock, never g.rng (what it draws is the engine's own). A run
// is plain data (the game, the script and the ledger watch), so a clone of it continues like the original. No vitest import: the same kit can
// run as a bundled node script, like test/play-kit.ts.
import { bindMoneyContext } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { readWl } from '../src/game/events/will-core'
import { cutFromWill } from '../src/game/events/wealth-kids'
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import { bizOf } from '../src/game/business/state'
import { withFlags } from '../src/game/flags'
import { checkLedger } from '../src/game/kernel/ledger'
import { personEntity } from '../src/game/kernel/person-ref'
import { continueAsChild } from '../src/game/life'
import { breakUp, divorce, performWedding } from '../src/game/love'
import { createPerson } from '../src/game/people'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import { playerEdgeKey } from '../src/game/society/acts'
import { askBroker, askFavor, askVouch, brokerFor, cutOff, favorBlock, thirdFor } from '../src/game/society/favor'
import { feudOf, makePeace } from '../src/game/society/feud'
import { askLoan, debtTo, loanTerms, openLoans } from '../src/game/society/loan'
import { enrolMentor } from '../src/game/society/mentor'
import { addSecret, betray } from '../src/game/society/secret'
import type { GameState, Person } from '../src/game/types'
import { worldBudget } from '../src/game/world/budget'
import { EDGE_CAPS } from '../src/game/world/caps'
import { formatMemory, MEMORY_KINDS } from '../src/game/world/edge-memory'
import { putEdge } from '../src/game/world/edge-write'
import { edgeMap, edgeProblems, isSecretKey, readEdge, type Edge } from '../src/game/world/edges'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import { readWorld } from '../src/game/world/state'
import { socialOn } from '../src/game/world/social'
import { newLedgerWatch, watchLedger, type LedgerWatch } from './fuzz-kit'
import { playLife } from './play-kit'
import { probeLife } from './probe-life'
import { findSeed } from './seed-kit'
import { cast, socialLife } from './social-kit'

/** A flag of a kin record that nobody links: Life's sweep clears it in the next year (world/kin.ts kinProblems). */
const KIN_LAG = /^kin: record \S+ carries the spouse or heir flag and no living or recently dead person links it$/

export const YEARS = 120
export const TIMEOUT = 600_000
/** The most nodes the slice of the edges may hold (world/edges-slice.ts), and the whole world (world/caps.ts). */
export const EDGE_NODES = 24_000

// ---------------------------------------------------------------------------------------------------------------------------
// Small helpers

export const json = (x: unknown): string => JSON.stringify(x)
export const hasKey = (o: unknown, k: string): boolean => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
export function nodes(value: unknown): number {
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
export function firstNonFinite(root: unknown): string | null {
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

const byId = (a: Person, b: Person): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const clamp100 = (x: number): number => Math.max(0, Math.min(100, x))

/** The living adults of the game who are not pets, in id order: the people the script picks from. */
const adultsOf = (g: GameState): Person[] => g.people.filter((p) => p.alive && p.relation !== 'pet' && p.age >= 18 && Number.isFinite(p.relationship)).sort(byId)
const spouseOf = (g: GameState): Person | undefined => g.people.find((p) => p.alive && p.relation === 'spouse')
const partnerOf = (g: GameState): Person | undefined => g.people.find((p) => p.alive && p.relation === 'partner')
const kidsOf = (g: GameState): Person[] => g.people.filter((p) => p.alive && p.relation === 'child').sort(byId)

// ---------------------------------------------------------------------------------------------------------------------------
// The script and the run

/** What the stored map of edges holds, counted from the stored root (not from the normalizer's reading of it). */
export interface EdgeStats {
  edges: number
  secrets: number
  memories: number
  mostMemories: number
  debts: number
  feuds: number
  talk: number
  nodes: number
}

export interface Script {
  /** Years played. */
  step: number
  /** Hand-overs made. */
  handovers: number
  /** What the script did, by name: how many times. */
  n: Record<string, number>
  /** The one-time events of a generation: `<generation>|<name>`. */
  did: Record<string, number>
  /** The largest figures seen, after every year and right after a flood. */
  peak: EdgeStats & { people: number; open: number }
  /** The books of the player, watched at every year end (test/fuzz-kit.ts watchLedger): the drift is the cash that nothing booked. */
  watch: LedgerWatch
  /**
   * The kin-record flags that were left over after the last audit (see audit): { step, lines }. A flag whose anchor left the list after the
   * year's kin sweep is cleared by the next one, so it may show for one audit and no more.
   */
  lag: { step: number; lines: string[] }
  /** What was found wrong, at most 20 lines. */
  problems: string[]
}

export interface Run {
  spec: LifeSpec
  g: GameState
  s: Script
  seed: number
}

export interface LifeSpec {
  id: 'founder' | 'romantic' | 'rich'
  label: string
  /** The calendar year of birth (createNewLife's `year`, and the seed of the answers of playLife). */
  birthYear: number
  /** The age at which the first two generations hand over (the third plays on to the end). */
  handoverAge: number
  /** The steps (years played) at which the life is flooded past the caps. */
  floods: readonly number[]
  /** The seed of the life, found and not pinned (memoised by label). */
  seed: () => number
  /** The life at its first year, stamped, with whatever the script set up. */
  start: (seed: number) => GameState
  /** What this life does before a year is played. */
  year: (g: GameState, s: Script) => void
}

const emptyStats = (): EdgeStats => ({ edges: 0, secrets: 0, memories: 0, mostMemories: 0, debts: 0, feuds: 0, talk: 0, nodes: 0 })

export function freshScript(): Script {
  return { step: 0, handovers: 0, n: {}, did: {}, peak: { ...emptyStats(), people: 0, open: 0 }, watch: newLedgerWatch(), lag: { step: -1, lines: [] }, problems: [] }
}

const tick = (s: Script, name: string, by = 1): void => void (s.n[name] = (s.n[name] ?? 0) + by)
/** True the first time per generation: the event `name` of this generation has not been done. */
function once(g: GameState, s: Script, name: string): boolean {
  const key = `${g.generation}|${name}`
  if (s.did[key] !== undefined) return false
  s.did[key] = s.step
  return true
}

/** The counts of the stored map. A hostile or damaged map is not this function's business: audit runs edgeProblems on it. */
export function edgeStats(g: GameState): EdgeStats {
  const raw = (readWorld(g) as { edges?: Record<string, Edge> }).edges ?? {}
  const out = emptyStats()
  for (const [k, e] of Object.entries(raw)) {
    if (isSecretKey(k)) {
      out.secrets++
      continue
    }
    out.edges++
    const m = Array.isArray(e.m) ? e.m.length : 0
    out.memories += m
    out.mostMemories = Math.max(out.mostMemories, m)
    if (e.dv !== undefined) out.debts++
    if (e.q !== undefined) out.feuds++
    if (e.n !== undefined || e.d !== undefined) out.talk++
  }
  out.nodes = nodes(raw)
  return out
}

function peaks(g: GameState, s: Script): EdgeStats {
  const now = edgeStats(g)
  const p = s.peak
  for (const k of Object.keys(now) as (keyof EdgeStats)[]) p[k] = Math.max(p[k], now[k])
  p.people = Math.max(p.people, g.people.length)
  p.open = Math.max(p.open, openLoans(g))
  return now
}

// ---------------------------------------------------------------------------------------------------------------------------
// The audit: what must hold after every year

export function audit(run: Run): void {
  const { g, s } = run
  const where = `step ${s.step} (${g.year}, generation ${g.generation}, age ${g.character.age})`
  const bad = (m: string): void => void (s.problems.length < 20 && s.problems.push(`${where}: ${m}`))

  if (!socialOn(g)) bad('the life lost its stamp')
  // The structural checks of the world: the year's popups have been answered (a friend can be dropped by one), so the index is not compared with
  // the records (worldProblems, `live: false`). One family of lines is a lag and not a fault, and is held to that: a kin record that still carries
  // the spouse or heir flag of an anchor who left the list after the year's kin sweep (relationships.ts drops a dead friend after life.kin has run)
  // shows until the next sweep. It may show in one audit; the same line in the audit of the next year is a fault.
  const all = worldProblems(g, { live: false })
  const lag = all.filter((p) => KIN_LAG.test(p))
  for (const p of all.filter((x) => !KIN_LAG.test(x)).slice(0, 3)) bad(`world: ${p}`)
  if (s.lag.step === s.step - 1) for (const p of lag) if (s.lag.lines.includes(p)) bad(`world: ${p} (for two years)`)
  s.lag = { step: s.step, lines: lag }
  if (lag.length > 0) tick(s, 'kinLag')
  const books = checkLedger(g)
  if (!books.ok) bad(`books: ${books.problems.slice(0, 2).join('; ')}`)
  const stray = firstNonFinite(g)
  if (stray !== null) bad(`not finite: ${stray}`)
  for (const p of worldBudget(g).over) bad(`budget: ${p}`)

  // The edges, memories, debts, secrets and feuds are inside their caps, as stored: the map is its own normal form.
  const ego = playerRef(g)
  for (const p of edgeProblems((readWorld(g) as { edges?: unknown }).edges, g.people, ego).slice(0, 3)) bad(`edges: ${p}`)
  const now = peaks(g, s)
  if (now.edges > EDGE_CAPS.edges) bad(`${now.edges} edges, over ${EDGE_CAPS.edges}`)
  if (now.secrets > EDGE_CAPS.secrets) bad(`${now.secrets} secrets, over ${EDGE_CAPS.secrets}`)
  if (now.memories > EDGE_CAPS.memTotal) bad(`${now.memories} memories, over ${EDGE_CAPS.memTotal}`)
  if (now.mostMemories > EDGE_CAPS.memPerEdge) bad(`${now.mostMemories} memories on one edge, over ${EDGE_CAPS.memPerEdge}`)
  if (now.debts > EDGE_CAPS.debts) bad(`${now.debts} debts, over ${EDGE_CAPS.debts}`)
  if (now.feuds > EDGE_CAPS.feuds) bad(`${now.feuds} feuds, over ${EDGE_CAPS.feuds}`)
  if (now.talk > EDGE_CAPS.talkEdges) bad(`${now.talk} edges with talk, over ${EDGE_CAPS.talkEdges}`)
  if (now.nodes > EDGE_NODES) bad(`the edges have ${now.nodes} nodes, over ${EDGE_NODES}`)

  // The edge of every person who has one holds the number of the person: edge.f is Person.relationship, cut to 0..100, for the current ego.
  for (const p of g.people) {
    if (p.relation === 'pet') continue
    const e = readEdge(g, personEntity(p), ego)
    if (e !== null && e.f !== clamp100(p.relationship)) bad(`${p.id} (${p.relation}) has relationship ${p.relationship} and edge.f ${e.f}`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The scripted caller: what every life does to its web of people

/** A friend of the circle: every field given, so building one draws nothing from g.rng. */
function newFriend(g: GameState, s: Script): Person {
  tick(s, 'friends')
  return cast(g, 70, 'friend', { age: Math.max(18, g.character.age - 4 + (s.step % 9)), money: 300_000 + (s.step % 5) * 100_000 })
}

/** The acts every life performs, by step. Each is blocked or refused by the engine's own rules as often as the rules say; the counts say how often it ran. */
function socialActs(g: GameState, s: Script): void {
  if (!g.character.alive) return
  const step = s.step
  const ego = playerRef(g)
  if (step % 4 === 2 && adultsOf(g).length < 14) newFriend(g, s)
  const people = adultsOf(g)
  if (people.length === 0) return
  const ready = people.filter((p) => favorBlock(g, p) === null)

  if (step % 3 === 0 && ready.length > 0) {
    tick(s, 'favorAsked')
    if (askFavor(g, ready[step % ready.length]!) !== null) tick(s, 'favorRun')
  }
  if (step % 9 === 4 && ready.length > 0) {
    const giver = ready[(step >> 1) % ready.length]!
    const third = thirdFor(g, giver)
    if (third !== null) {
      tick(s, 'vouchAsked')
      if (askVouch(g, giver, third) !== null) tick(s, 'vouchRun')
    }
  }
  if (step % 7 === 2 && g.character.age >= 18 && openLoans(g) < 3) {
    const lenders = people.filter((p) => favorBlock(g, p) === null && debtTo(g, p) === null && loanTerms(g, p).cap >= loanTerms(g, p).min)
    if (lenders.length > 0) {
      const lender = lenders[step % lenders.length]!
      const t = loanTerms(g, lender)
      tick(s, 'loanAsked')
      if (askLoan(g, lender, Math.min(t.cap, t.min * 5)) !== null && debtTo(g, lender) !== null) tick(s, 'loanTaken')
    }
  }
  if (step % 5 === 3) {
    const who = people[(step * 3) % people.length]!
    const key = playerEdgeKey(g, who)
    if (key !== null) {
      betray(g, key, 1 + (step % 5))
      tick(s, 'betrayed')
    }
  }
  if (step % 11 === 6 && people.length >= 3) {
    const holders = [0, 1, 2].map((i) => people[(step + i) % people.length]!)
    if (addSecret(g, ego, step % 2 === 0 ? 'affair' : 'debt', 1 + (step % 5), holders) !== null) tick(s, 'secretKept')
  }
  if (step % 4 === 1) {
    const foe = people.find((p) => feudOf(g, p) !== null)
    if (foe !== undefined) {
      tick(s, 'peaceTried')
      const before = feudOf(g, foe)
      if (makePeace(g, foe) !== null && before !== null && feudOf(g, foe) === null) tick(s, 'peaceMade')
    }
  }
  if (step % 10 === 8) {
    const relative = people.find((p) => cutOff(g, p))
    const giver = relative === undefined ? null : brokerFor(g, relative)
    if (relative !== undefined && giver !== null) {
      tick(s, 'brokerAsked')
      if (askBroker(g, giver, relative) !== null) tick(s, 'brokerRun')
    }
  }
  if (step % 13 === 7) {
    const young = g.people.filter((p) => p.alive && p.age >= 14 && p.age <= 40 && p.age < g.character.age).sort(byId)
    for (const p of young) {
      if (enrolMentor(g, p)) {
        tick(s, 'mentored')
        break
      }
    }
  }
}

/**
 * Floods the life past every cap, once: 1,300 edges of people the game does not hold (the cap is 1,200), eight memories on 520 of them
 * (4,000 is the cap), a debt on 45 (40), a feud on 15 (12), talk on 130 (120) and 45 secrets (40). Whatever is over is refused or evicted by the
 * writer, which is the point: after it the stored map must still be its own normal form. The figures are read at once, before the year's step.
 */
function flood(g: GameState, s: Script): void {
  const ego = playerRef(g)
  const year = g.year
  const mine = `person:fl${s.step}x`
  const kinds = MEMORY_KINDS.slice(0, 8)
  const memories = (i: number): string[] => kinds.map((kind, j) => formatMemory({ kind, year: year - 1 - ((i + j) % 3), w: 1 + ((i + j) % 3) as 1 | 2 | 3, by: j % 2 === 0 ? 'ego' : 'them' }))
  for (let i = 0; i < 1_300; i++) {
    putEdge(g, `${mine}${i}>${ego}`, { t: 50, f: 20 + ((i * 7) % 60), r: 50, s: i % 9, o: 0, y: year - 2, l: year, ...(i < 520 ? { m: memories(i) } : {}) })
  }
  const keys = Object.keys(edgeMap(g)).filter((k) => k.startsWith(mine))
  let refused = 0
  keys.slice(0, 45).forEach((k, i) => void (putEdge(g, k, { dv: [1_000 + i, 8, year - 1, 0, 0] }) || refused++))
  keys.slice(45, 60).forEach((k) => void (putEdge(g, k, { q: [1, year, 0] }) || refused++))
  keys.slice(60, 190).forEach((k, i) => void (putEdge(g, k, { n: [`cb${i}`], d: [100 + i] }) || refused++))
  const people = adultsOf(g)
  for (let i = 0; i < 45 && people.length >= 2; i++) {
    const holders = people.filter((_, j) => ((i + 1) >> (j % 5)) % 2 === 1 || j === i % people.length).slice(0, 1 + (i % 6))
    if (addSecret(g, ego, i % 2 === 0 ? 'affair' : 'debt', 1 + (i % 5), holders) === null) refused++
  }
  tick(s, 'flood')
  tick(s, 'floodRefused', refused)
  peaks(g, s)
}

/** What a year of this run does before it is played: the life's own script, the acts of every life, and the floods. */
function yearScript(run: Run): void {
  const { g, s, spec } = run
  spec.year(g, s)
  socialActs(g, s)
  if (spec.floods.includes(s.step) && g.character.alive) flood(g, s)
}

// ---------------------------------------------------------------------------------------------------------------------------
// The three lives

/** Marries someone new: a partner made with every field given, and the wedding as the engine plays it. */
function marry(g: GameState, s: Script, money: number): Person {
  const p = cast(g, 78, 'partner', { age: Math.max(18, g.character.age - 1), money, livesWithPlayer: true })
  performWedding(g, p, { venue: 'eloped', prenup: false, honeymoon: null })
  tick(s, 'wedding')
  return p
}

/** A child of the marriage, as processPregnancies makes one (the fixture of scripts/save-fixtures.ts does the same). */
function bear(g: GameState, s: Script, spouse: Person): Person {
  tick(s, 'child')
  return createPerson(g, { relation: 'child', age: 0, lastName: g.character.lastName, relationship: 85, money: 0, otherParentId: spouse.id, biological: true, livesWithPlayer: true })
}

/** A partner who is then left or leaves: one more ex. */
function fling(g: GameState, s: Script, by: 'player' | 'them'): void {
  const p = cast(g, 55, 'partner', { age: Math.max(18, g.character.age - 2), money: 50_000 })
  breakUp(g, p, by)
  tick(s, 'breakup')
}

/** The founder's year: the children are hired at the company when they are old enough, and one is named the successor. */
function founderYear(g: GameState, s: Script): void {
  const asset = g.assets.find((a) => a.kind === 'business')
  if (asset === undefined) return
  for (const kid of kidsOf(g)) {
    if (kid.age < 18 || s.did[`${g.generation}|hired|${kid.id}`] !== undefined || (s.n.hireTried ?? 0) > 400) continue
    tick(s, 'hireTried')
    const biz = bizOf(g, asset)
    let hired = hireRelative(g, asset, biz, kid, { rank: 1 }, { quiet: true })
    for (const payMult of [1.25, 1.5, 2, 3]) {
      if (hired.ok || hired.reason?.includes('expectations') !== true) break
      hired = hireRelative(g, asset, biz, kid, { rank: 1, payMult }, { quiet: true })
    }
    if (hired.ok) {
      s.did[`${g.generation}|hired|${kid.id}`] = s.step
      tick(s, 'hired')
    }
  }
  if (s.step % 6 === 0) {
    const named = kidsOf(g).find((k) => s.did[`${g.generation}|hired|${k.id}`] !== undefined)
    if (named !== undefined && once(g, s, 'successor') && designateSuccessor(g, asset, bizOf(g, asset), named, { quiet: true }).ok) tick(s, 'successor')
  }
}

/** The romantic life's year, by age: a first love and a wedding, children, a divorce, a second marriage, a betrayal, flings, and after 50 a churn. */
function romanticYear(g: GameState, s: Script): void {
  const age = g.character.age
  const spouse = spouseOf(g)
  if (age === 20 && partnerOf(g) === undefined && spouse === undefined) cast(g, 75, 'partner', { age: 21, money: 80_000 })
  else if (age === 24 && spouse === undefined) {
    const p = partnerOf(g)
    if (p !== undefined) {
      performWedding(g, p, { venue: 'eloped', prenup: false, honeymoon: null })
      tick(s, 'wedding')
    } else marry(g, s, 150_000)
  } else if ((age === 26 || age === 28) && spouse !== undefined) bear(g, s, spouse)
  else if (age === 33 && spouse !== undefined) {
    divorce(g, spouse, g.generation % 2 === 0 ? 'player' : 'them')
    tick(s, 'divorce')
  } else if (age === 35 && spouse === undefined && partnerOf(g) === undefined) cast(g, 72, 'partner', { age: 34, money: 900_000 })
  else if (age === 37 && spouse === undefined) {
    const p = partnerOf(g)
    if (p !== undefined) {
      performWedding(g, p, { venue: 'eloped', prenup: false, honeymoon: null })
      tick(s, 'wedding')
    }
  } else if (age === 39 && spouse !== undefined) bear(g, s, spouse)
  else if (age === 41 && spouse !== undefined) {
    const key = playerEdgeKey(g, spouse)
    if (key !== null) {
      betray(g, key, 4)
      tick(s, 'affair')
    }
  } else if (age === 44) fling(g, s, 'them')
  else if (age === 46) fling(g, s, 'player')
  else if (age === 48) fling(g, s, 'them')
  else if (age > 50 && s.step % 6 === 0) {
    // After 50 the churn goes on: a partner, a wedding, a divorce, in turn.
    if (spouse === undefined && partnerOf(g) === undefined) cast(g, 70, 'partner', { age: Math.max(30, age - 8), money: 400_000 })
    else if (spouse === undefined) {
      const p = partnerOf(g)!
      performWedding(g, p, { venue: 'eloped', prenup: false, honeymoon: null })
      tick(s, 'wedding')
    } else if ((s.step / 6) % 2 === 0) {
      divorce(g, spouse, 'player')
      tick(s, 'divorce')
    } else fling(g, s, 'them')
  }
}

/** The rich life's year: the money at 25, a marriage at 27 and three children, and at 47 the eldest of age is written out of the will. */
function richYear(g: GameState, s: Script): void {
  const age = g.character.age
  if (age === 25 && once(g, s, 'rich')) {
    // The opening balance of a rich life is set between years, as playLife({ rich: true }) does; the books are told it is not a flow.
    g.character.money = 50_000_000
    bindMoneyContext(g)
    watchLedger(s.watch, g, 'rebase')
    tick(s, 'rich')
  }
  const spouse = spouseOf(g)
  if (age === 27 && spouse === undefined && once(g, s, 'marry')) marry(g, s, 5_000_000)
  else if ((age === 28 || age === 30 || age === 32) && spouse !== undefined) bear(g, s, spouse)
  else if (age === 47 && once(g, s, 'cut')) {
    const grown = kidsOf(g).filter((k) => k.age >= 16)
    const eldest = grown.sort((a, b) => b.age - a.age || byId(a, b))[0]
    if (eldest !== undefined && kidsOf(g).length > 1) {
      cutFromWill(g, eldest)
      tick(s, 'cut')
    }
  }
}

/** The seed of a life: the first from the search that gets to `age` alive when it is only played and not scripted. Memoised by label. */
function seedFor(label: string, birthYear: number, age: number, make: (seed: number) => GameState): number {
  return findSeed(
    (seed) => {
      const g = make(seed)
      g.queue = []
      return playLife({ seed, birthYear, from: g, untilAge: age }).g.character.alive
    },
    { tries: 40, label },
  )
}

export const LIFES: readonly LifeSpec[] = [
  {
    id: 'founder',
    label: 'a family founder',
    birthYear: 1900,
    handoverAge: 50,
    floods: [35, 85],
    seed: () => seedFor('a stamped founder of 30 in 1930 who is alive at 50 (social acceptance)', 1900, 50, (seed) => founderLife(seed)),
    start: (seed) => founderLife(seed),
    year: founderYear,
  },
  {
    id: 'romantic',
    label: 'a romantic life',
    birthYear: 1930,
    handoverAge: 50,
    floods: [45, 95],
    seed: () => seedFor('a stamped life born 1930 that is alive at 50 (social acceptance, romantic)', 1930, 50, (seed) => socialLife({ seed, year: 1930 })),
    start: (seed) => socialLife({ seed, year: 1930 }),
    year: romanticYear,
  },
  {
    id: 'rich',
    label: 'a rich life with a will fight',
    birthYear: 1930,
    handoverAge: 54,
    floods: [40, 90],
    seed: () => seedFor('a stamped life born 1930 that is alive at 54 (social acceptance, rich)', 1930, 54, (seed) => socialLife({ seed, year: 1930 })),
    start: (seed) => socialLife({ seed, year: 1930 }),
    year: richYear,
  },
]

/** A founder of 30 with one company in 1930, married, with two small children and a friend. Stamped: the key is on while the life is made. */
function founderLife(seed: number): GameState {
  const g = withFlags({ social: true }, () => probeLife({ seed, birthYear: 1900, businesses: 1, years: 0 }))
  const partner = createPerson(g, { relation: 'partner', age: 29, relationship: 78, livesWithPlayer: true, money: 2_000_000 })
  performWedding(g, partner, { venue: 'eloped', prenup: false, honeymoon: null })
  for (const age of [3, 1]) {
    createPerson(g, { relation: 'child', age, lastName: g.character.lastName, relationship: 85, money: 0, otherParentId: partner.id, biological: true, livesWithPlayer: true })
  }
  createPerson(g, { relation: 'friend', age: 33, relationship: 62, money: 400_000 })
  g.queue = []
  return g
}

// ---------------------------------------------------------------------------------------------------------------------------
// Playing a run

/** The oldest living child who is not written out of the will, else the oldest living child or stepchild. Null when there is none. */
function heirOf(g: GameState): Person | null {
  const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild')).sort((a, b) => b.age - a.age || byId(a, b))
  return kids.find((k) => !readWl(g, k).cut) ?? kids[0] ?? null
}

/** The player dies if alive, and a child takes over (one is made when there is none: the script of a life may not have started a family). */
function handOver(run: Run): GameState {
  const { g, s } = run
  const heir = heirOf(g) ?? createPerson(g, { relation: 'child', age: Math.max(0, Math.min(40, g.character.age - 25)), lastName: g.character.lastName, relationship: 80 })
  if (g.character.alive) killCharacter(g, 'Old Age')
  g.queue = []
  const n = continueAsChild(g, heir.id)
  if (n === g) {
    s.problems.push(`step ${s.step}: continueAsChild refused ${heir.id}`)
    return g
  }
  s.handovers++
  return n
}

/** The seed of the life, the life at its first year, a fresh script, the books watched from here. */
export function begin(spec: LifeSpec): Run {
  const seed = spec.seed()
  const g = spec.start(seed)
  bindMoneyContext(g)
  const s = freshScript()
  watchLedger(s.watch, g, 'start')
  return { spec, g, s, seed }
}

/** Plays `years` more years: the script, one year with the popups answered, the books and the checks, and a hand-over when the player is dead or at the age. */
export function advance(run: Run, years: number, hook?: (run: Run) => void): Run {
  bindMoneyContext(run.g)
  for (let i = 0; i < years; i++) {
    yearScript(run)
    playLife({ seed: run.seed, birthYear: run.spec.birthYear, from: run.g, untilAge: run.g.character.age + 1 })
    run.s.step++
    watchLedger(run.s.watch, run.g, 'year')
    audit(run)
    if (!run.g.character.alive || (run.g.character.age >= run.spec.handoverAge && run.s.handovers < 2)) {
      run.g = handOver(run)
      bindMoneyContext(run.g)
      watchLedger(run.s.watch, run.g, 'heir')
      audit(run)
    }
    hook?.(run)
  }
  return run
}

export const cloneRun = (run: Run): Run => ({ spec: run.spec, g: structuredClone(run.g), s: structuredClone(run.s), seed: run.seed })

/** The run as a save and a load bring it back: the state through JSON and the save loader, the script as it was. */
export function reloadRun(run: Run): Run {
  const r = migrateSave(JSON.parse(json(run.g)))
  if (r.kind !== 'ready') throw new Error(`the save did not load: ${r.kind}`)
  if (!isLoadableGame(r.game)) throw new Error('the loaded game is not loadable')
  return { spec: run.spec, g: r.game, s: structuredClone(run.s), seed: run.seed }
}
