// R4-E15 (D.12, the acceptance of the social track): the 120-year probe, determinism, the yearly step at the caps, the size of a save,
// the sid-born debtor across the two tracks, marriage for wealth, the old-save matrix, hostile worlds, heirs and idempotence. The long
// one: no `// ci: fast`. (The static scans are test/social-money-scan.test.ts, the purity of every read is test/edge-purity.test.ts, the
// ceiling rows are in test/ceiling-kit.ts and test/social-ceilings.test.ts, and the table of authorization is test/social-act-auth.test.ts,
// which this task's command runs.)
//
// THE PROBE (test/social-accept-kit.ts). Three stamped lives are played 120 years, one year at a time, with a scripted caller between the
// years doing what a player and the popups do to the web of people: favors, vouching, loans, betrayals, secrets, peace, a mentor, weddings,
// divorces, flings, a child hired into the company, a child cut out of the will, hand-overs, and twice a flood of more edges, memories, debts,
// feuds, secrets and talk records than the caps hold. After every year the audit runs: the world's own checks (worldProblems), the books
// (checkLedger), no number that is not finite, the budget of the world, the edges inside their caps as stored, and edge.f equal to
// Person.relationship for the current ego.
import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { readJob } from '../src/game/business/nepo-job'
import { staffHired, staffLoyaltyYear } from '../src/game/business/staff-loyalty'
import { bizOf } from '../src/game/business/state'
import { bindMoneyContext, netWorth } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { readTies } from '../src/game/events/wealth-core'
import { readWl } from '../src/game/events/will-core'
import { withFlags } from '../src/game/flags'
import { checkLedger } from '../src/game/kernel/ledger'
import { personEntity } from '../src/game/kernel/person-ref'
import { continueAsChild } from '../src/game/life'
import { divorce, performWedding } from '../src/game/love'
import { npcLife } from '../src/game/npc-state'
import { createPerson } from '../src/game/people'
import { yearlyRelationships } from '../src/game/relationships'
import { saveGame, LOCAL_SNAPSHOT_BUDGET } from '../src/game/save'
import { memorySaveBackend, type SyncSaveBackend } from '../src/game/save-backends'
import { cloneForAct } from '../src/game/save-clone'
import { encodeSave, inlineSave } from '../src/game/save-codec'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import { actRoll } from '../src/game/society/acts'
import { serviceDebts } from '../src/game/society/debt'
import { stepFeuds } from '../src/game/society/feud'
import { mentorSettle } from '../src/game/society/mentor'
import { yearlyActs } from '../src/game/society/module'
import { addSecret, leakPass } from '../src/game/society/secret'
import { arriveInPast } from '../src/game/timeMachine'
import type { GameState, MenuAction, MenuNode, Person } from '../src/game/types'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { countNodes } from '../src/game/kernel/slices'
import { worldBudget } from '../src/game/world/budget'
import { EDGE_CAPS, WORLD_NODE_CAP } from '../src/game/world/caps'
import { stepEdges } from '../src/game/world/edge-step'
import { putEdge } from '../src/game/world/edge-write'
import { edgeProblems, readEdge } from '../src/game/world/edges'
import { worldProblems } from '../src/game/world/invariants'
import { KIN_CAPS } from '../src/game/world/kin'
import { MET_CAPS } from '../src/game/world/caps'
import { isTomb, readMet, writeMet } from '../src/game/world/met'
import { sweepMet, touchMet } from '../src/game/world/met-ops'
import { playerRef } from '../src/game/world/people'
import { makeSid } from '../src/game/world/sid'
import { readSocial, socialOn } from '../src/game/world/social'
import { shardNames } from '../src/game/world/state'
import '../src/game/world/shards'
import { ledgerStatsOf } from './fuzz-kit'
import { machineFactor } from './perf-kit'
import { playLife } from './play-kit'
import { probeLife } from './probe-life'
import { memoryChunkStore, memoryLocalStorage } from './save-kit'
import { ROOT } from './scan-kit'
import { findSeed } from './seed-kit'
import { LIFES, TIMEOUT, YEARS, advance, begin, cloneRun, edgeStats, firstNonFinite, hasKey, json, nodes, reloadRun, type LifeSpec, type Run } from './social-accept-kit'
import { cast, socialLife } from './social-kit'

/** [seed, year] of the one life the heir case starts from (a constant tuple, X30: no new seed pin). */
const LIFE = [5, 1990] as const
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')
const HALF = YEARS / 2

/** A number the lead reads: printed, and appended to the file named by E15_NUMBERS when the runner swallows the console. */
function say(line: string): void {
  console.log(line)
  const file = process.env.E15_NUMBERS
  if (file !== undefined && file !== '') appendFileSync(file, `${line}\n`)
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The 120-year probe, and the same life on a replay, a clone, a reload and a Time Machine jump
// ---------------------------------------------------------------------------------------------------------------------------

interface Played {
  /** The life at step 60 (a copy), and at step 120. */
  at60: Run
  final: Run
}
const played = new Map<string, Played>()

/** A life played once: 60 years, a copy, 60 more. Every test below reads this and none changes it. */
function theRun(spec: LifeSpec): Played {
  let p = played.get(spec.id)
  if (p === undefined) {
    const run = begin(spec)
    advance(run, HALF)
    const at60 = cloneRun(run)
    advance(run, YEARS - HALF)
    p = { at60, final: run }
    played.set(spec.id, p)
  }
  return p
}

describe.each(LIFES.map((l) => [l.label, l] as const))('the 120-year probe: %s', (_label, spec) => {
  it('stays sound for 120 years through the hand-overs: every check of the audit held after every year', () => {
    const { final } = theRun(spec)
    expect(final.s.problems).toEqual([])
    expect(final.s.step).toBe(YEARS)
    expect(final.s.handovers).toBeGreaterThanOrEqual(2)
  }, TIMEOUT)

  it('was a real probe: the web reached every cap, and the script did what it says', () => {
    const { final } = theRun(spec)
    const { peak, n } = final.s
    expect(peak.edges, 'edges').toBe(EDGE_CAPS.edges)
    expect(peak.secrets, 'secrets').toBe(EDGE_CAPS.secrets)
    expect(peak.debts, 'debts').toBe(EDGE_CAPS.debts)
    expect(peak.feuds, 'feuds').toBe(EDGE_CAPS.feuds)
    expect(peak.talk, 'edges with talk').toBe(EDGE_CAPS.talkEdges)
    expect(peak.mostMemories, 'memories on one edge').toBe(EDGE_CAPS.memPerEdge)
    expect(peak.memories, 'memories in all').toBeGreaterThan(EDGE_CAPS.memTotal * 0.9)
    expect(peak.memories, 'memories in all').toBeLessThanOrEqual(EDGE_CAPS.memTotal)
    expect(n.flood).toBe(2)
    expect(n.floodRefused ?? 0).toBeGreaterThan(0)
    for (const name of ['favorRun', 'betrayed', 'secretKept']) expect(n[name] ?? 0, name).toBeGreaterThan(3)
    expect((n.loanTaken ?? 0) + (n.vouchRun ?? 0), 'loans and vouches').toBeGreaterThan(3)
    if (spec.id === 'founder') expect(n.hired ?? 0, 'children hired').toBeGreaterThan(0)
    if (spec.id === 'romantic') for (const name of ['wedding', 'child', 'divorce', 'breakup']) expect(n[name] ?? 0, name).toBeGreaterThan(0)
    if (spec.id === 'rich') for (const name of ['rich', 'wedding', 'child', 'cut']) expect(n[name] ?? 0, name).toBeGreaterThan(0)
  }, TIMEOUT)

  it('ends with the books balanced and not a dollar of strict drift: every change of the player\'s cash was booked', () => {
    const { final } = theRun(spec)
    const books = checkLedger(final.g)
    expect(books.problems).toEqual([])
    expect(books.ok).toBe(true)
    const stats = ledgerStatsOf(final.s.watch, final.g)
    expect(stats.drift, `drift first seen ${JSON.stringify(stats.firstDrift)}`).toBe(0)
    expect(firstNonFinite(final.g)).toBeNull()
    expect(worldBudget(final.g).over).toEqual([])
  }, TIMEOUT)

  it('continues a structuredClone of year 60 to the very state of the original', () => {
    const { final, at60 } = theRun(spec)
    expect(at60.s.step).toBe(HALF)
    const c = advance(cloneRun(at60), YEARS - HALF)
    expect(c.s.problems).toEqual([])
    expect(json(c.g)).toBe(json(final.g))
    expect(c.s).toEqual(final.s)
  }, TIMEOUT)

  it('continues a JSON reload of year 60 (the save loader in between) to the very state of the original', () => {
    const { final, at60 } = theRun(spec)
    const r = advance(reloadRun(at60), YEARS - HALF)
    expect(r.s.problems).toEqual([])
    expect(json(r.g)).toBe(json(final.g))
  }, TIMEOUT)

  it('goes through the Time Machine: the fork rolls the year it lands in again and no year before it, and plays on sound', () => {
    const { final, at60 } = theRun(spec)
    const stop = at60.g.year
    const fork = arriveInPast(final.g, structuredClone(at60.g))
    expect(fork.flags.timeMachine).toBeDefined()
    expect(json(fork.world)).toBe(json(at60.g.world))
    // The social stream: years that ended before the jump keep their rolls; the year it lands in and every one after it are new.
    const key = `person:p9>${playerRef(at60.g)}`
    const rolls = (g: GameState, year: number): number[] => {
      const next = actRoll(g, 'favor', key, year)
      return [next(), next(), next()]
    }
    for (const year of [stop - 3, stop - 1]) expect(rolls(fork, year), `year ${year}`).toEqual(rolls(at60.g, year))
    for (const year of [stop, stop + 1, stop + 9]) expect(rolls(fork, year), `year ${year}`).not.toEqual(rolls(at60.g, year))
    const f = advance({ spec, g: fork, s: structuredClone(at60.s), seed: at60.seed }, 20)
    expect(f.s.problems).toEqual([])
    expect(f.s.step).toBe(HALF + 20)
    expect(checkLedger(f.g).ok).toBe(true)
  }, TIMEOUT)
})

describe('the same seed gives the same life', () => {
  it('plays the romantic life twice, from a copy of its first year, to the same state and the same script', () => {
    const spec = LIFES.find((l) => l.id === 'romantic')!
    const start = begin(spec)
    const again = cloneRun(start)
    const { final } = theRun(spec)
    const b = advance(again, YEARS)
    expect(b.s.problems).toEqual([])
    expect(json(b.g)).toBe(json(final.g))
    expect(b.s).toEqual(final.s)
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Idempotence: every yearly entry twice
// ---------------------------------------------------------------------------------------------------------------------------

describe('every yearly entry of the social track, run twice', () => {
  const ENTRIES: readonly (readonly [string, (g: GameState) => void])[] = [
    ['stepEdges (world.edges)', stepEdges],
    ['yearlyActs (society.acts)', yearlyActs],
    ['serviceDebts', serviceDebts],
    ['leakPass', leakPass],
    ['mentorSettle', mentorSettle],
    ['stepFeuds', stepFeuds],
  ]

  it.each(ENTRIES.map(([name, run]) => [name, run] as const))('%s: a second call in the same year changes nothing, in the year it ran and in the next', (_name, run) => {
    const founder = LIFES[0]!
    const { at60 } = theRun(founder)
    const stats = edgeStats(at60.g)
    expect(stats.edges, 'a web to run the entries on').toBeGreaterThan(0)
    for (const step of [0, 1]) {
      const once = structuredClone(at60.g)
      once.year += step
      run(once)
      const twice = structuredClone(at60.g)
      twice.year += step
      run(twice)
      run(twice)
      expect(json(twice), `year +${step}`).toBe(json(once))
    }
  })

  it('staffLoyaltyYear (the year end of a company\'s key people): twice changes nothing more than once, and once did change something', () => {
    const g = LIFES[0]!.start(LIFES[0]!.seed())
    const asset = g.assets.find((a) => a.kind === 'business')!
    expect(asset).toBeDefined()
    const staff = Array.from({ length: 8 }, (_, i) => ({ id: `ks${900 + i}`, firstName: 'Dana', lastName: `Reed${i}`, gender: 'female', age: 40, role: 'Head Chef', focus: 'ops', skill: 40 + 5 * i, salary: 90_000, trait: 'steady', morale: 2 + 4 * i, years: 2 }))
    bizOf(g, asset).staff.push(...(staff as never[]))
    for (const s of staff) staffHired(g, s as never)
    g.year += 1
    const run = (n: number): GameState => {
      const c = structuredClone(g)
      const a = c.assets.find((x) => x.id === asset.id)!
      for (let i = 0; i < n; i++) staffLoyaltyYear(c, a, bizOf(c, a))
      return c
    }
    const once = run(1)
    expect(json(once), 'a quit, a poaching or an edge changed').not.toBe(json(g))
    expect(json(run(2))).toBe(json(once))
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. Heirs: the web goes to the heir, the late player leaves no edge behind
// ---------------------------------------------------------------------------------------------------------------------------

describe('a hand-over on a stamped life', () => {
  function handOver(): { g: GameState; heir: GameState; late: Person; oldEgo: string } {
    const g = socialLife({ seed: LIFE[0], year: LIFE[1] })
    g.queue = []
    g.character.age = 58
    g.year = LIFE[1] + 58
    bindMoneyContext(g)
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: g.character.lastName, relationship: 70 })
    const friend = cast(g, 60, 'friend')
    const oldEgo = playerRef(g)
    const t = (over: object = {}): Parameters<typeof putEdge>[2] => ({ t: 50, f: 50, r: 50, s: 10, o: 0, y: g.year - 3, l: g.year, ...over })
    // What the player feels about the child and the friend (an edge that starts at the late player), and what they feel about the player.
    expect(putEdge(g, `${oldEgo}>${personEntity(kid)}`, t({ f: 50 }))).toBe(true)
    expect(putEdge(g, `${oldEgo}>${personEntity(friend)}`, t())).toBe(true)
    expect(putEdge(g, `${personEntity(kid)}>${oldEgo}`, t({ f: kid.relationship }))).toBe(true)
    expect(putEdge(g, `${personEntity(friend)}>${oldEgo}`, t({ f: friend.relationship, dv: [4_000, 0, g.year - 1, 0, 0] }))).toBe(true)
    expect(socialOn(g)).toBe(true)
    const late = { ...g.character } as unknown as Person
    killCharacter(g, 'Old Age')
    g.queue = []
    const heir = continueAsChild(g, kid.id)
    expect(heir).not.toBe(g)
    return { g, heir, late, oldEgo }
  }

  it('keeps the edges and the stamp, and the heir reads the web that crossed', () => {
    const { heir, oldEgo } = handOver()
    expect(socialOn(heir)).toBe(true)
    expect(readSocial(heir)).not.toBeNull()
    expect(playerRef(heir)).not.toBe(oldEgo)
    const keys = Object.keys((heir.world as { edges?: object }).edges ?? {})
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.some((k) => k.endsWith(`>${playerRef(heir)}`)), 'an edge toward the new player').toBe(true)
  })

  it('leaves no edge that starts at the late player (the dead parent holds no opinion of the heir that could disagree with the number)', () => {
    const { heir, oldEgo } = handOver()
    const keys = Object.keys((heir.world as { edges?: object }).edges ?? {})
    expect(keys.filter((k) => k.startsWith(`${oldEgo}>`))).toEqual([])
    expect(keys.filter((k) => k.endsWith(`>${oldEgo}`)), 'and none that ends at them').toEqual([])
    expect(edgeProblems((heir.world as { edges?: unknown }).edges, heir.people, playerRef(heir))).toEqual([])
    expect(worldProblems(heir, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
    for (const p of heir.people) {
      if (p.relation === 'pet') continue
      const e = readEdge(heir, personEntity(p), playerRef(heir))
      if (e !== null) expect(e.f, `${p.id} (${p.relation})`).toBe(Math.max(0, Math.min(100, p.relationship)))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 4. Across the two tracks (X14): a sid-born debtor with an edge debt survives the yearly sweeps of a played life
// ---------------------------------------------------------------------------------------------------------------------------

describe('a sid-born debtor survives 30 yearly sweeps of the Met store, because of its edge', () => {
  it('keeps the person at the far end of an unpaid debt while the idle strangers around them are let go', () => {
    const seed = findSeed((s) => withFlags({ social: true }, () => probeLife({ seed: s, birthYear: 1960, businesses: 0, years: 0, keepAlive: true })).character.alive, { label: 'a stamped adult (sid debtor)' })
    const g = withFlags({ social: true }, () => probeLife({ seed, birthYear: 1960, businesses: 0, years: 0, keepAlive: true }))
    g.queue = []
    bindMoneyContext(g)
    const debtor = makeSid({ kind: 'frn', place: 'us', cohort: 1985, ord: 1 })
    const strangers = Array.from({ length: 150 }, (_, i) => makeSid({ kind: 'frn', place: 'us', cohort: 1985, ord: 100 + i }))
    for (const sid of [debtor, ...strangers]) expect(touchMet(g, sid), sid).toBe(true)
    // Everyone has been idle for ten years: the sweep would drop each of them, the debtor included, but for the edge.
    const aged = Object.fromEntries(Object.entries(readMet(g)).map(([k, v]) => [k, isTomb(v) ? v : { ...v, s: g.year - 10 }]))
    writeMet(g, aged)
    expect(putEdge(g, `person:${debtor}>${playerRef(g)}`, { t: 40, f: 30, r: 40, s: 10, o: 0, y: g.year - 5, l: g.year, dv: [900, 0, g.year - 2, 0, 0] })).toBe(true)
    expect(sweepMet(structuredClone(g)), 'the sweep would let go').toBeGreaterThan(100)
    for (let i = 0; i < 30; i++) {
      playLife({ seed, birthYear: 1960, from: g, untilAge: g.character.age + 1 })
      const held = readMet(g)[debtor]
      expect(held, `year ${i + 1}: the debtor`).toBeDefined()
      expect(isTomb(held!), `year ${i + 1}: a record and not a tombstone`).toBe(false)
      expect(readEdge(g, `person:${debtor}`, playerRef(g))?.dv, `year ${i + 1}: the debt`).toBeDefined()
    }
    const left = strangers.filter((sid) => readMet(g)[sid] !== undefined && !isTomb(readMet(g)[sid]!))
    expect(left.length, 'strangers still held after 30 years').toBeLessThan(strangers.length / 2)
    expect(checkLedger(g).ok).toBe(true)
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. Marriage for wealth: shown wealth is not spendable; the gain is real cash that moves by moveCash
// ---------------------------------------------------------------------------------------------------------------------------

describe('marriage for wealth', () => {
  const lifeSeed = (): number =>
    findSeed(
      (s) => {
        const g = married(s, 1e6)
        return g.character.alive && g.people.some((p) => p.relation === 'spouse' && p.alive)
      },
      { tries: 30, label: 'a stamped adult who marries a rich spouse and is alive ten years on' },
    )

  /** A stamped adult of 30 who marries an NPC holding `wealth` in cash and plays ten years. */
  function married(seed: number, wealth: number): GameState {
    const g = withFlags({ social: true }, () => probeLife({ seed, birthYear: 1960, businesses: 0, years: 0, keepAlive: true }))
    g.queue = []
    bindMoneyContext(g)
    const p = cast(g, 78, 'partner', { age: 29, money: wealth, livesWithPlayer: true })
    performWedding(g, p, { venue: 'eloped', prenup: false, honeymoon: null })
    playLife({ seed, birthYear: 1960, from: g, untilAge: g.character.age + 10 })
    return g
  }

  /**
   * The gain the player makes from the end of the marriage (net worth after less before), the spouse's cash and estate before it (the estate is
   * what the death turns to cash: cash and holdings less debt, npc-lives.ts liquidateNpcEstate), and what the books say.
   */
  function ending(wealth: number, how: 'divorce' | 'widowed'): { gain: number; theirs: number; estate: number; mine: number; mint: number; burn: number; ok: boolean } {
    const seed = lifeSeed()
    const g = married(seed, wealth)
    const spouse = g.people.find((p) => p.relation === 'spouse' && p.alive)!
    expect(spouse, 'a living spouse').toBeDefined()
    const theirs = Math.max(0, spouse.money)
    const life = npcLife(spouse)
    const estate = Math.max(0, spouse.money + (life?.investments ?? 0) + (life?.housing ?? 0) - (life?.debt ?? 0))
    const mine = Math.max(0, netWorth(g))
    const before = checkLedger(g)
    const worth = netWorth(g)
    if (how === 'divorce') divorce(g, spouse, 'player')
    else {
      for (let i = 0; i < 40 && spouse.alive; i++) {
        spouse.age = 99
        spouse.stats.health = 1
        yearlyRelationships(g)
      }
      expect(spouse.alive, 'the spouse died').toBe(false)
    }
    g.queue = []
    const after = checkLedger(g)
    return { gain: netWorth(g) - worth, theirs, estate, mine, mint: after.mint - before.mint, burn: after.burn - before.burn, ok: after.ok }
  }

  it.each(['divorce', 'widowed'] as const)('%s: the gain is at most what the rule allows, no dollar is minted and the books balance', (how) => {
    const e = ending(50_000_000, how)
    expect(e.ok).toBe(true)
    expect(e.mint, 'minted').toBe(0)
    expect(e.burn, 'burned').toBe(0)
    expect(e.gain, 'a gain was made').toBeGreaterThan(0)
    // The settlement: half the gap, at 0.5 to 1 of it, paid from the spouse's own cash. A widow's share: 0.7 to 1 of the estate the death turns to cash.
    const rule = how === 'divorce' ? Math.min(e.theirs, Math.max(0, (e.theirs - e.mine) / 2)) : e.estate
    expect(e.gain, `gain ${e.gain} against the rule ${rule}`).toBeLessThanOrEqual(rule + 1)
    expect(e.gain, 'never above what the spouse holds').toBeLessThanOrEqual(e.estate + 1)
  }, TIMEOUT)

  it.each(['divorce', 'widowed'] as const)('%s: 100 times the spouse\'s wealth raises what the rule allows at most 100 times, and the gain stays under it and under what the spouse holds', (how) => {
    const small = ending(5_000_000, how)
    const big = ending(500_000_000, how)
    // The most the rule allows when the player has nothing: half the spouse's cash (a divorce), or the estate (a widow).
    const ceiling = (e: typeof small): number => (how === 'divorce' ? e.theirs / 2 : e.estate)
    expect(small.gain).toBeGreaterThan(0)
    expect(big.gain).toBeGreaterThan(small.gain)
    expect(small.gain).toBeLessThanOrEqual(ceiling(small) + 1)
    expect(big.gain, `${big.gain} against the ceiling ${ceiling(big)}`).toBeLessThanOrEqual(ceiling(big) + 1)
    expect(ceiling(big), `${ceiling(big)} against 100 x ${ceiling(small)}`).toBeLessThanOrEqual(100 * ceiling(small) + 1)
    expect(big.gain).toBeLessThanOrEqual(big.estate + 1)
    expect(big.mint + big.burn).toBe(0)
    expect(big.ok).toBe(true)
  }, TIMEOUT)

  it('moves nothing when the wealth is only shown: a spouse with 50M and a prenup pays the player nothing', () => {
    const seed = lifeSeed()
    const g = married(seed, 50_000_000)
    const spouse = g.people.find((p) => p.relation === 'spouse' && p.alive)!
    spouse.data.prenup = true
    const worth = netWorth(g)
    const cash = g.character.money
    divorce(g, spouse, 'player')
    expect(g.character.money).toBe(cash)
    expect(netWorth(g)).toBeCloseTo(worth, 0)
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. The old saves: no social key, no edge, and the people that matter are still there
// ---------------------------------------------------------------------------------------------------------------------------

const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((name) => /^save-.*\.json\.gz$/.test(name))
  .sort()
const fixtureRaw = (name: string): Record<string, unknown> => JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()) as Record<string, unknown>

function loaded(raw: unknown, name: string): GameState {
  const r = migrateSave(raw)
  if (r.kind !== 'ready') throw new Error(`${name} did not load: ${r.kind}`)
  return r.game
}
function oneYear(g: GameState): void {
  g.queue = []
  g.character.stats.health = Math.max(g.character.stats.health, 60)
  ageUp(g)
}

describe('the old saves, played five years: nothing of the social track appears', () => {
  it('finds the fixtures, the oldest and the social one among them', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(7)
    expect(FIXTURES).toContain('save-v1.json.gz')
    expect(FIXTURES).toContain('save-v5.2.0-social.json.gz')
  })

  describe.each(FIXTURES)('%s', (name) => {
    it('loads and plays 5 years with no edges key, no social key and an unstamped life', () => {
      const g = loaded(fixtureRaw(name), name)
      expect(isLoadableGame(g)).toBe(true)
      // A save of v5.3.0 or later may carry the stamp (the heavy fixture of the release does); every older one has neither key.
      const stamped = hasKey(g.world ?? {}, 'social')
      if (!stamped) {
        for (let i = 1; i <= 5; i++) {
          oneYear(g)
          expect(hasKey(g.world ?? {}, 'edges'), `${name}: an edges key after year ${i}`).toBe(false)
          expect(hasKey(g.world ?? {}, 'social'), `${name}: a social key after year ${i}`).toBe(false)
          expect(socialOn(g)).toBe(false)
        }
      } else {
        for (let i = 1; i <= 5; i++) oneYear(g)
        expect(socialOn(g)).toBe(true)
      }
      expect(checkLedger(g, { allowHeal: true }).problems).toEqual([])
      expect(firstNonFinite(g)).toBeNull()
      expect(worldProblems(g, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
    }, TIMEOUT)
  })

  it('keeps the 22-exes life\'s debtor and its cut-out child through five years', () => {
    const g = loaded(fixtureRaw('save-v5.2.0-social.json.gz'), 'save-v5.2.0-social')
    const debtor = g.people.find((p) => p.alive && readTies(g, p).owes > 0)
    const cut = g.people.find((p) => p.alive && p.relation === 'child' && readWl(g, p).cut)
    expect(debtor, 'a friend who owes').toBeDefined()
    expect(cut, 'a child written out of the will').toBeDefined()
    for (let i = 0; i < 5; i++) oneYear(g)
    const debtorNow = g.people.find((p) => p.id === debtor!.id)
    const cutNow = g.people.find((p) => p.id === cut!.id)
    expect(debtorNow, 'the debtor is still in the list').toBeDefined()
    expect(cutNow, 'the child is still in the list').toBeDefined()
    if (cutNow!.alive) expect(readWl(g, cutNow!).cut, 'and is still cut out').toBe(true)
    expect(g.people.filter((p) => p.relation === 'ex' && p.alive).length, 'the cleanup keeps its 20').toBeLessThanOrEqual(20)
    expect(socialOn(g)).toBe(false)
    expect(readJob(g.people.find((p) => p.relation === 'child' && p.alive)!)).toBeDefined()
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 7. Twelve hostile `edges` and `social` worlds, put into the oldest fixture and played three years
// ---------------------------------------------------------------------------------------------------------------------------

const NEVER_MADE = 'a world that no game wrote'
/** A valid stamp for the year of the fixture's life (the oldest save is a life in 2026), so the stamped paths of the game run on a hostile map. */
const stampFor = (y: number): Record<string, unknown> => ({ v: 1, on: 1, y, fy: y })
const edge = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ t: 50, f: 50, r: 50, s: 20, o: 0, y: 2020, l: 2026, ...over })
const ego = (i: number): string => `person:q${String(i).padStart(5, '0')}>person:zz`
const memory = (kind: string, year: number): string => `${kind}.${year}.3.e`

interface Hostile {
  name: string
  /** The value for `world`. `year` is the fixture's calendar year, `room` how many nodes the save may still add before the loader's cap. */
  make: (year: number, room: number) => unknown
}

const HOSTILE: readonly Hostile[] = [
  { name: 'an edges map of 20,000 edges beside a valid stamp', make: (y) => ({ v: 1, social: stampFor(y), edges: Object.fromEntries(Array.from({ length: 20_000 }, (_, i) => [ego(i), edge({ f: 1 + (i % 99) })])) }) },
  { name: 'an edges shard that is a string, beside a valid stamp', make: (y) => ({ v: 1, social: stampFor(y), edges: NEVER_MADE }) },
  { name: 'a list of edges, beside a valid stamp', make: (y) => ({ v: 1, social: stampFor(y), edges: [edge(), edge()] }) },
  { name: 'a __proto__ key in the edges and in the stamp', make: (y) => JSON.parse(`{"v":1,"social":{"v":1,"on":1,"y":${y},"fy":${y},"__proto__":{"on":0}},"edges":{"__proto__":${JSON.stringify(edge())},"${ego(1)}":${JSON.stringify(edge())}}}`) as unknown },
  { name: 'edges of 1e300 and minus 1e300, a debt of 1e300 and a feud of rung 99', make: (y) => ({ v: 1, social: stampFor(y), edges: { [ego(1)]: edge({ t: 1e300, f: -1e300, r: 1e300, s: -1e300, o: 1e300, dv: [1e300, 1e300, 2020, 0, 1e300], q: [99, 2020, 1e300] }), [ego(2)]: edge({ l: 1e300, y: -1e300 }) } }) },
  { name: 'every edge over every cap: 1,200 feuds, 1,200 debts, 1,200 edges with talk and 12 memories each', make: (y) => ({ v: 1, social: stampFor(y), edges: Object.fromEntries(Array.from({ length: 1_300 }, (_, i) => [ego(i), edge({ m: Array.from({ length: 12 }, (_, j) => memory('betrayal', 2000 + j)), dv: [100 + i, 5, 2020, 0, 0], q: [1 + (i % 4), 2020, 0], n: ['a'], d: [1], k: 'kin' })])) }) },
  { name: 'memories of kinds nobody knows, in years nobody lived, and keys out of order', make: (y) => ({ v: 1, social: stampFor(y), edges: { [ego(9)]: edge({ m: [memory('nothing', 2020), 'betrayal.-5.3.e', 'betrayal.2020.9.x', 7, null] }), [ego(1)]: edge({ m: [memory('betrayal', 2019), memory('betrayal', 2019)] }), 'not a key': edge(), [`${'x'.repeat(200)}>${'y'.repeat(200)}`]: edge() } }) },
  { name: '600 secrets of 600 holders each', make: (y) => ({ v: 1, social: stampFor(y), edges: Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`secret:${i + 1}`, { a: 'person:me1', k: i % 2 === 0 ? 'affair' : 'debt', v: 1 + (i % 9), h: Array.from({ length: 600 }, (_, j) => `person:h${j}`), y: 2020 }])) }) },
  { name: 'a stamp that is a number, a list, a future version and an off switch, beside valid edges', make: () => ({ v: 1, social: 7, edges: { [ego(1)]: edge(), [ego(2)]: edge() } }) },
  { name: 'a stamp of years that are text, NaN-like and out of range', make: () => ({ v: 1, social: { v: 1, on: 1, y: '2029', fy: 1e300, ay: -5 }, edges: { [ego(1)]: edge() } }) },
  { name: 'a stamp that is on with 40,000 mentor pairs of nobody and a skill of 1e300', make: (y, room) => ({ v: 1, social: { ...stampFor(y), ms: Array.from({ length: Math.min(40_000, Math.floor(room / 4)) }, (_, i) => [`person:q${i}`, 1e300]) }, edges: { [ego(1)]: edge() } }) },
  { name: 'a stamp that is off, a future version, and an edges map that is only the stamp\'s neighbour', make: () => ({ v: 1, social: { v: 2, on: 1, y: 2026, fy: 2026 }, edges: { [ego(1)]: edge() } }) },
]

describe('twelve hostile edges and social worlds put into the oldest fixture and played', () => {
  it('has twelve of them', () => {
    expect(HOSTILE).toHaveLength(12)
  })

  it.each(HOSTILE.map((h) => [h.name, h] as const))('%s: loads, three years play, the world ends bounded and the books hold', (_name, hostile) => {
    const raw = fixtureRaw('save-v1.json.gz')
    const room = 500_000 - nodes(raw)
    const probe = loaded(fixtureRaw('save-v1.json.gz'), 'save-v1')
    raw.world = hostile.make(probe.year, room)
    const g = loaded(raw, 'save-v1 with a hostile world')
    expect(isLoadableGame(g)).toBe(true)
    const known = new Set(['v', 'y', ...shardNames()])
    const afterLoad = structuredClone((g.world as { edges?: unknown }).edges)
    for (let i = 1; i <= 3; i++) {
      expect(() => oneYear(g), `year ${i}`).not.toThrow()
      expect(g.character.alive, `alive after year ${i}`).toBe(true)
      expect(nodes(g.world), `world nodes after year ${i}`).toBeLessThan(WORLD_NODE_CAP)
      expect(Object.keys(g.world ?? {}).filter((k) => !known.has(k)), `unknown keys after year ${i}`).toEqual([])
      expect(checkLedger(g, { allowHeal: true }).problems, `books after year ${i}`).toEqual([])
      expect(firstNonFinite(g), `a number that is not finite after year ${i}`).toBeNull()
      const stats = edgeStats(g)
      expect(stats.edges, `edges after year ${i}`).toBeLessThanOrEqual(EDGE_CAPS.edges)
      expect(stats.feuds).toBeLessThanOrEqual(EDGE_CAPS.feuds)
      expect(stats.debts).toBeLessThanOrEqual(EDGE_CAPS.debts)
      expect(stats.secrets).toBeLessThanOrEqual(EDGE_CAPS.secrets)
      expect(stats.memories).toBeLessThanOrEqual(EDGE_CAPS.memTotal)
      expect(stats.nodes).toBeLessThanOrEqual(24_000)
    }
    // A stamp that is not a valid one is no stamp: the life plays as it always did, and the only thing the world says about it is that it is
    // stored wrong (a `social:` line); the edges beside it are left as they were loaded.
    const problems = worldProblems(g, { live: false }).filter((p) => !p.startsWith('ledger: '))
    if (socialOn(g)) expect(problems).toEqual([])
    else {
      expect(problems.filter((p) => !p.startsWith('social: '))).toEqual([])
      expect(json((g.world as { edges?: unknown }).edges)).toBe(json(afterLoad))
    }
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 8. The year at the caps: the time of the yearly step, and what a save of it weighs (X56)
// ---------------------------------------------------------------------------------------------------------------------------

const BIRTH = 1960
const AGE_UP_BUDGET_MS = 160
const YEAR_WITH_SAVE_BUDGET_MS = 200
const TIMED = 12
const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
const gz = (text: string): number => gzipSync(text, { level: 6 }).length

/**
 * A stamped life of 40 holding the worst case of the social web: 1,200 edges (52 of them with a living person at the end, the rest strangers
 * who hold a place), 4,000 memories, 40 debts, 12 feuds, 120 edges with talk and 40 secrets of 6 holders; and a Met store of 400 records,
 * 160 of them of the kin kind (KIN_CAPS.records). Every edge holds resentment, so the yearly step rewrites all eight chunks of the entity slice.
 */
function capsLife(web = true): GameState {
  const seed = findSeed((s) => withFlags({ social: true }, () => probeLife({ seed: s, birthYear: BIRTH, businesses: 0, years: 10, keepAlive: true })).character.alive, { label: 'a stamped founder alive at 40 (the caps)' })
  const g = withFlags({ social: true }, () => probeLife({ seed, birthYear: BIRTH, businesses: 0, years: 10, keepAlive: true }))
  g.queue = []
  if (!web) return g
  const year = g.year
  const me = playerRef(g)
  const real = Array.from({ length: 52 }, () => cast(g, 60, 'friend', { money: 200_000 }))
  const kinds = ['loan_given', 'gift_given', 'allowance_cut', 'took_my_side', 'told_gently', 'olive_branch', 'hired_me', 'signed_me'] as const
  const memories = (i: number): string[] => kinds.map((kind, j) => `${kind}.${year - 1 - ((i + j) % 3)}.${1 + ((i + j) % 3)}.${j % 2 === 0 ? 'e' : 't'}`)
  for (let i = 0; i < EDGE_CAPS.edges; i++) {
    const who = i < real.length ? personEntity(real[i]!) : `person:s${String(i).padStart(5, '0')}`
    const patch: Record<string, unknown> = { t: 50, f: i < real.length ? real[i]!.relationship : 60 + (i % 30), r: 50, s: 10 + (i % 80), o: (i % 7) - 3, y: year - 3, l: year }
    if (i < 500) patch.m = memories(i)
    if (i < EDGE_CAPS.debts) patch.dv = [5_000 + i, 8, year - 2, 0, 0]
    else if (i < EDGE_CAPS.debts + EDGE_CAPS.feuds) patch.q = [1 + (i % 4), year - 1, 0]
    if (i >= 60 && i < 60 + EDGE_CAPS.talkEdges) Object.assign(patch, { n: [`cb${i}`], d: [i % 40] })
    if (!putEdge(g, `${who}>${me}`, patch as never)) throw new Error(`the caps life: edge ${i} was refused`)
  }
  for (let i = 0; i < EDGE_CAPS.secrets; i++) addSecret(g, me, i % 2 === 0 ? 'affair' : 'debt', 1 + (i % 5), real.slice(i % 40, (i % 40) + EDGE_CAPS.holders))
  const kinSids = Array.from({ length: KIN_CAPS.records }, (_, i) => makeSid({ kind: 'kin', place: 'us', cohort: 1950 + (i % 60), ord: i }))
  const otherSids = Array.from({ length: MET_CAPS.records - KIN_CAPS.records }, (_, i) => makeSid({ kind: (['frn', 'cls', 'cow'] as const)[i % 3]!, place: 'us', cohort: 1960 + (i % 40), ord: i }))
  const entries = [...kinSids, ...otherSids].map((sid, i) => [sid, { f: `First${i}`, l: `Last${i % 50}`, g: (i % 2) as 0 | 1, b: 1950 + (i % 60), c: 'us', k: i % 9, a: [50, 40, 60, 30, 70] as [number, number, number, number, number], y: year - 30, s: year, w: i % 10, fl: 0, gr: 0, ob: 0, d: year - 2, r: 'banker', j: `firm:f${1000 + i}` }] as const)
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  writeMet(g, Object.fromEntries(entries) as never)
  bindMoneyContext(g)
  return g
}

function prepare(g: GameState): void {
  g.queue = []
  g.character.stats.health = 100
  g.character.conditions = []
}

let caps: GameState | null = null
const heavy = (): GameState => (caps ??= capsLife())
const edgeChunks = (g: GameState): Record<string, string> => {
  const e = encodeSave(g)
  return Object.fromEntries(Object.entries(e.manifest).filter(([k]) => k.startsWith('e.edge.')).map(([k, v]) => [k, v.id]))
}

describe('the yearly step at the caps: 1,200 edges, 400 Met records (160 of the kin kind), debts, feuds and memories at their caps', () => {
  it('is the worst case: every cap is full', () => {
    const g = heavy()
    const s = edgeStats(g)
    expect(socialOn(g)).toBe(true)
    expect(s.edges).toBe(EDGE_CAPS.edges)
    expect(s.debts).toBe(EDGE_CAPS.debts)
    expect(s.feuds).toBe(EDGE_CAPS.feuds)
    expect(s.talk).toBe(EDGE_CAPS.talkEdges)
    expect(s.secrets).toBe(EDGE_CAPS.secrets)
    expect(s.memories).toBe(500 * 8)
    expect(Object.values(readMet(g)).filter((v) => !isTomb(v)).length).toBe(MET_CAPS.records)
    expect(Object.keys(readMet(g)).filter((k) => k.startsWith('kin.')).length).toBe(KIN_CAPS.records)
    expect(Object.keys(edgeChunks(g))).toHaveLength(8)
  }, TIMEOUT)

  it('ages up in at most 160 ms, and clones, ages up and encodes in at most 200 ms (times the machine factor), and rewrites all 8 chunks of the edges', () => {
    const base = heavy()
    const factor = machineFactor()
    const warm = cloneForAct(base)
    for (let i = 0; i < 3; i++) {
      prepare(warm)
      ageUp(warm)
    }
    const ageTimes: number[] = []
    const yearTimes: number[] = []
    const chunks: number[] = []
    const before = edgeChunks(base)
    for (let i = 0; i < TIMED; i++) {
      const draft = cloneForAct(base)
      prepare(draft)
      const t0 = performance.now()
      ageUp(draft)
      ageTimes.push(performance.now() - t0)
      const again = cloneForAct(base)
      prepare(again)
      const t1 = performance.now()
      const next = cloneForAct(again)
      ageUp(next)
      const e = encodeSave(next)
      yearTimes.push(performance.now() - t1)
      const after = Object.fromEntries(Object.entries(e.manifest).filter(([k]) => k.startsWith('e.edge.')).map(([k, v]) => [k, v.id]))
      chunks.push(Object.keys(after).filter((k) => after[k] !== before[k]).length)
    }
    say(
      `year step at the caps: ageUp median ${median(ageTimes).toFixed(1)} ms (max ${Math.max(...ageTimes).toFixed(1)}, budget ${AGE_UP_BUDGET_MS} x ${factor.toFixed(2)}); ` +
        `clone + ageUp + encode median ${median(yearTimes).toFixed(1)} ms (max ${Math.max(...yearTimes).toFixed(1)}, budget ${YEAR_WITH_SAVE_BUDGET_MS} x ${factor.toFixed(2)}); e.edge chunks rewritten in the year: ${median(chunks)} of 8`,
    )
    // The same life without the web, for what the web costs (printed, not asserted).
    const plain = capsLife(false)
    const plainTimes: number[] = []
    for (let i = 0; i < TIMED; i++) {
      const draft = cloneForAct(plain)
      prepare(draft)
      const t0 = performance.now()
      ageUp(draft)
      plainTimes.push(performance.now() - t0)
    }
    say(`the same life with no web: ageUp median ${median(plainTimes).toFixed(1)} ms, so the web at its caps adds ${(median(ageTimes) - median(plainTimes)).toFixed(1)} ms to the year`)
    expect(median(chunks), 'e.edge chunks rewritten in the year').toBe(8)
    expect(median(ageTimes)).toBeLessThanOrEqual(AGE_UP_BUDGET_MS * factor)
    expect(median(yearTimes)).toBeLessThanOrEqual(YEAR_WITH_SAVE_BUDGET_MS * factor)
  }, TIMEOUT)

  it('stays sound through ten of the years: the web is inside its caps and the books hold', () => {
    const g = cloneForAct(heavy())
    for (let i = 0; i < 10; i++) {
      prepare(g)
      ageUp(g)
      const s = edgeStats(g)
      expect(s.edges).toBeLessThanOrEqual(EDGE_CAPS.edges)
      expect(s.nodes).toBeLessThanOrEqual(24_000)
      expect(checkLedger(g, { allowHeal: true }).problems).toEqual([])
    }
    expect(worldProblems(g, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
  }, TIMEOUT)
})

describe('the size of a save with the web at its caps (the budgets of test/save-budget.test.ts)', () => {
  const HEAD_BUDGET_CHARS = 400_000
  const WORLD_BUDGET_CHARS = 1_000_000
  const WORLD_BUDGET_GZIP = 600_000
  const TAP_CHUNK_BUDGET_CHARS = 150_000
  const NODE_BUDGET = 250_000
  /** What v4.1.1 stored for ten snapshots of the heavy life (test/save-budget.test.ts). */
  const V411_TEN_SNAPSHOTS_CHARS = 1_227_273

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('has a head of at most 400,000 characters and a world chunk of at most 1,000,000 characters and 600,000 bytes gzipped', () => {
    const e = encodeSave(heavy())
    expect(e.head.length).toBeLessThanOrEqual(HEAD_BUDGET_CHARS)
    const world = e.chunks.get(e.manifest.world!.id)!
    expect(world.length).toBeLessThanOrEqual(WORLD_BUDGET_CHARS)
    expect(gz(world)).toBeLessThanOrEqual(WORLD_BUDGET_GZIP)
    const edgeChars = Object.keys(e.manifest).filter((k) => k.startsWith('e.edge.')).reduce((n, k) => n + e.chunks.get(e.manifest[k]!.id)!.length, 0)
    say(`the caps life: head ${e.head.length} characters, world chunk ${world.length} (${gz(world)} gzipped), the 8 edge chunks ${edgeChars} characters`)
    expect(edgeChars).toBeLessThanOrEqual(420_000)
    expect(e.stats.unsortedEntities ?? []).toEqual([])
  })

  it('holds at most 250,000 nodes, a fraction of the 500,000 a loaded save may hold', () => {
    const n = countNodes(JSON.parse(inlineSave(heavy())), 500_000)
    expect(n).toBeLessThanOrEqual(NODE_BUDGET)
  })

  it('writes at most 150,000 characters of chunks over ten taps between two birthdays', () => {
    const store = memoryChunkStore()
    const inner = memorySaveBackend()
    const backend: SyncSaveBackend = { ...inner, chunks: store }
    resetSaveStoreForTests()
    setSaveBackend(backend)
    try {
      let committed = cloneForAct(heavy())
      expect(saveGame(committed)).toBe(true)
      let draft = cloneForAct(committed)
      prepare(draft)
      ageUp(draft)
      expect(saveGame(draft)).toBe(true)
      committed = draft
      const rows = menuActions(committed, 10)
      expect(rows.length, 'menu rows with no input').toBeGreaterThanOrEqual(3)
      const putsBefore = store.putSizes.length
      let ran = 0
      for (let i = 0; i < 10; i++) {
        draft = cloneForAct(committed)
        const row = rows[i]
        if (row !== undefined) {
          try {
            row.run(draft)
            ran++
          } catch (err) {
            if (err instanceof TypeError) throw err
          }
        } else draft.character.stats.happiness = Math.min(100, draft.character.stats.happiness + 1)
        expect(saveGame(draft)).toBe(true)
        committed = draft
      }
      const written = store.putSizes.slice(putsBefore).reduce((a, n) => a + n, 0)
      say(`ten taps at the caps: ${ran} rows ran and ${10 - ran} bookings, ${written} characters of chunks written (budget ${TAP_CHUNK_BUDGET_CHARS})`)
      expect(ran).toBeGreaterThanOrEqual(3)
      expect(written).toBeLessThanOrEqual(TAP_CHUNK_BUDGET_CHARS)
    } finally {
      resetSaveStoreForTests()
    }
  }, TIMEOUT)

  it('stores ten Time Machine snapshots, one for each of ten years of it, in no more than v4.1.1 did and inside the localStorage budget', async () => {
    const states: GameState[] = []
    const g = cloneForAct(heavy())
    for (let i = 0; i < 10; i++) {
      prepare(g)
      ageUp(g)
      states.push(structuredClone(g))
    }
    vi.resetModules()
    vi.stubGlobal('localStorage', memoryLocalStorage())
    const save = await import('../src/game/save')
    const data = new Map<string, string>()
    save.setSnapshotBackend({
      name: 'idb',
      get: async (keys) => keys.map((k) => data.get(k) ?? null),
      put: async (entries) => {
        for (const [k, v] of entries) data.set(k, v)
      },
      remove: async (keys) => {
        for (const k of keys) data.delete(k)
      },
      keys: async () => [...data.keys()],
    })
    save.startTimeline(states[0]!.lifeId, null)
    for (const s of states) expect(await save.takeSnapshot(s), `the snapshot at ${s.character.age}`).toBe(true)
    await save.snapshotWritesSettled()
    let chars = 0
    for (const [k, v] of data) chars += k.length + v.length
    say(`ten snapshots at the caps: ${chars} characters, ${((chars / LOCAL_SNAPSHOT_BUDGET) * 100).toFixed(1)}% of the ${LOCAL_SNAPSHOT_BUDGET} localStorage budget (v4.1.1: ${V411_TEN_SNAPSHOTS_CHARS})`)
    expect(chars).toBeLessThanOrEqual(V411_TEN_SNAPSHOTS_CHARS)
    expect(chars).toBeLessThanOrEqual(LOCAL_SNAPSHOT_BUDGET)
  }, TIMEOUT)
})

/** The enabled actions of the three tabs that ask for no input, in menu order: the rows a player taps between two birthdays (test/save-budget.test.ts). */
function menuActions(g: GameState, limit: number): MenuAction[] {
  const out: MenuAction[] = []
  const visit = (list: MenuNode[], depth: number): void => {
    for (const n of list) {
      if (out.length >= limit) return
      if (n.visible && !n.visible(g)) continue
      if (n.type === 'action') {
        if (n.input || n.disabledReason?.(g) || n.id === 'surrenderLife' || /suicide/i.test(n.id)) continue
        out.push(n)
      } else if (n.type === 'menu' && depth < 2 && !n.disabledReason?.(g)) {
        visit(n.children(g), depth + 1)
      }
    }
  }
  for (const menu of [activitiesMenu, occupationMenu, assetsMenu]) visit(menu.children(g), 1)
  return out
}
