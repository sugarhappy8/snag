// R4-L11 (D.9 c, X15, X35, X39): after a hand-over no id dangles.
//
// A company, a family job and a kin link each name somebody by id: a manager (`Manager.personId`), a job (`FamilyJob.assetId`), a co-owner
// (`familyShares`), a founder (`npcOwnerId`), a spouse and children (`spouseSid`, `kidSids`). The hand-over rebuilds the people list and
// moves companies between hands, so it is where an id can start to name nobody. test/heir-kit.ts `danglingIds` reads them all; this file
// plays seven scenes through a hand-over and ten years after it and holds the list empty at every step:
//
//   1. the designated sibling takes the family firm and the will heir carries on (relatives hired at the firm keep or lose jobs: X35)
//   2. the heir owns a company of their own, which the hand-over claims for them
//   3. a conglomerate with a relative as group CEO, the other child holding shares
//   4. a relative is the firm's manager (a sibling of the heir; and the heir themselves)
//   5. a co-owner of the firm is kept as a friend and dies in the first year
//   6. married siblings with a spouse and children on record (a stamped life), one of whom dies with money
//
// Every scene is built stamped (the social flag, X6); the scenes that do not need kin links also unstamped, because a v5.2.0 life must be as
// safe. A scene proves it is about its ids (the old life holds the kinds it names), the kit proves it can see each kind go wrong, and the
// sid fold at the end of the hand-over is shown to keep the heir's cash and account in step.
import { describe, expect, it } from 'vitest'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { appointGroupRelative } from '../src/game/business/conglomerate-family'
import { groupsOf, liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { designateSuccessor, hireRelative, makeCeo } from '../src/game/business/nepo-actions'
import { readJob, readPast, writeJob, type FamilyJob } from '../src/game/business/nepo-job'
import { bizOf, businessAssets, findBusiness, readBiz } from '../src/game/business/state'
import { personCash } from '../src/game/cash'
import { CHARITY } from '../src/game/events/will-core'
import { playerAcct } from '../src/game/kernel/ledger'
import { adoptChild, adoptSpouse, syncKin } from '../src/game/kin'
import { withFlags } from '../src/game/flags'
import { continueAsChild } from '../src/game/life'
import { npcCompany, startNpcCompany } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import type { GameState, Person } from '../src/game/types'
import '../src/game/world/edge-step'
import { worldProblems } from '../src/game/world/invariants'
import { kinProblems } from '../src/game/world/kin'
import { stampSocial } from '../src/game/world/social'
import { deepFreeze } from './fuzz-kit'
import { danglingIds, handOver, playYears, scanIds, type IdKind } from './heir-kit'
import { makeTestGame } from './helpers'
import { kinGame, withLife } from './kin-kit'
import { acctOf, expectConserved } from './ledger-kit'
import { kid, world } from './nepo-kit'
import { cast } from './social-kit'

const YEARS = 10

/** The kit's family business on a life that is NOT stamped, whatever the build default says; a scene that wants the stamp calls stampSocial itself (R4-E16, step 0). */
const plainWorld: typeof world = (seed, opts) => withFlags({ social: false }, () => world(seed, opts))

// ---------------------------------------------------------------------------------------------------------------------
// The scenes

interface Built {
  /** The old life, one step before the death. */
  g: GameState
  /** The child who carries on. */
  heir: Person
  /** The kinds of ids the old life holds; a scene that held none of them would prove nothing. */
  before: IdKind[]
  /** The kinds the new life holds at year 0, straight after the hand-over. */
  after: IdKind[]
  /** Runs at every step, year 0 included, before the checks (a scene's own events). */
  each?: (n: GameState, year: number) => void
  /** Runs at every step after the checks, with the scene's own claims. */
  claim?: (n: GameState, year: number) => void
}

interface Scene {
  name: string
  /** Kin links exist only on a stamped life (X6), so a scene about them has no unstamped twin. */
  stampedOnly?: true
  build: (stamped: boolean) => Built
}

/** The designated sibling takes the firm; relatives hired there (a child and a sibling of the player) hold a record of a job at it. */
function siblingFirm(stamped: boolean): Built {
  const { g, a, b } = plainWorld(135, { age: 78 })
  if (stamped) stampSocial(g)
  const successor = kid(g, 39, { smarts: 88 })
  const heir = kid(g, 36, { smarts: 65 })
  const other = kid(g, 33, { smarts: 70 })
  const uncle = kid(g, 60, { smarts: 55, relation: 'sibling' })
  for (const [p, rank] of [[successor, 2], [other, 1], [uncle, 1]] as const) expect(hireRelative(g, a, b, p, { rank }, { quiet: true }).ok).toBe(true)
  expect(designateSuccessor(g, a, bizOf(g, a), successor, { quiet: true }).ok).toBe(true)
  g.character.willBeneficiaries = [heir.id]
  a.value = 12_000_000
  g.character.money = 0
  return {
    g,
    heir,
    before: ['job'],
    after: ['job', 'npcOwnerId'],
    claim: (n, year) => {
      const sib = n.people.find((p) => p.id === successor.id)!
      expect(npcCompany(sib, n.year), `year ${year}: the sibling holds the firm`).not.toBeNull()
      expect(findBusiness(n, a.id), `year ${year}: and the heir does not`).toBeUndefined()
    },
  }
}

/** The heir has a company of their own, held as an NPC; the hand-over claims it as the heir's asset. */
function heirCompany(stamped: boolean): Built {
  const { g } = plainWorld(136, { age: 78 })
  if (stamped) stampSocial(g)
  const heir = kid(g, 34, { smarts: 80 })
  heir.money = 8_000_000
  expect(startNpcCompany(g, heir, 'cafe')).toBe(true)
  const own = npcCompany(heir, g.year)!.a.id
  g.character.money = 0
  return {
    g,
    heir,
    before: ['npcOwnerId'],
    after: [],
    claim: (n, year) => {
      const claimed = findBusiness(n, own)
      expect(claimed, `year ${year}: the heir's company is theirs`).toBeDefined()
      expect(bizOf(n, claimed!).npcOwnerId, `year ${year}: and has no NPC owner`).toBeUndefined()
    },
  }
}

/** Two divisions in a group; a child (chief) is the group CEO and the heir the other child, so the group's shares are split between them. */
function conglomerate(stamped: boolean): Built {
  const g = makeTestGame(71, { age: 70, money: 2_000_000 })
  if (stamped) stampSocial(g)
  const heir = createPerson(g, { relation: 'child', age: 40, firstName: 'Ada', money: 10_000, occupation: 'Engineer', relationship: 95 })
  const chief = createPerson(g, { relation: 'child', age: 36, firstName: 'Ben', money: 10_000, occupation: 'Clerk', relationship: 95 })
  for (const name of ['First Division', 'Second Division']) {
    const state = newBiz(g, 'cafe', 'us', 'Chicago', { cash: 4_000_000, founded: 2020, ceo: 'manager', manager: { firstName: 'Trusted', lastName: 'Manager', gender: 'female', skill: 93, salary: 100_000, since: 2020 } })
    state.valuation = 5_000_000
    g.assets.push(createBusinessAsset(g, name, state, 200_000))
  }
  expect(formGroup(g, g.assets.map((x) => x.id), 'Dynasty Holdings')).toBe(true)
  const id = groupsOf(g)[0]!.core.id
  const grp = liveGroup(g, id)!
  grp.core.treasuryId = grp.members[0]!.a.id
  saveGroup(g, grp)
  g.queue = []
  expect(appointGroupRelative(g, id, chief.id, 'ceo')).toBe(true)
  g.queue = []
  g.character.willBeneficiaries = [heir.id, chief.id]
  g.character.money = 2_000_000
  return { g, heir, before: ['manager'], after: ['manager', 'familyShares'] }
}

/** A relative is the firm's CEO. `asHeir`: the CEO is the child who carries on; else a sibling of the heir is. */
function relativeManager(asHeir: boolean): (stamped: boolean) => Built {
  return (stamped) => {
    const { g, a, b } = plainWorld(91, { age: 78 })
    if (stamped) stampSocial(g)
    const ceo = kid(g, 30, { smarts: 80, traits: ['ambitious', 'serious'] })
    const heir = asHeir ? ceo : kid(g, 36, { smarts: 60 })
    expect(hireRelative(g, a, b, ceo, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(makeCeo(g, a, bizOf(g, a), ceo).ok).toBe(true)
    g.character.willBeneficiaries = [heir.id]
    return {
      g,
      heir,
      before: ['manager', 'job'],
      // the heir was the firm's manager: the player is that id until the first year step hires a manager of the usual kind
      after: asHeir ? ['manager'] : ['manager', 'job'],
    }
  }
}

/** A co-owner with 30% who is a friend of the player, kept by the hand-over as a friend of the heir, and who dies in the first year. */
function coOwner(stamped: boolean): Built {
  const { g, b } = plainWorld(135, { age: 78 })
  if (stamped) stampSocial(g)
  const heir = kid(g, 36, { smarts: 60 })
  const co = createPerson(g, { relation: 'friend', age: 62, relationship: 70, traits: ['kind'], stats: { smarts: 60, health: 70 }, money: 50_000, occupation: 'Clerk' })
  co.livesWithPlayer = false
  b.share = 0.7
  b.familyShares = [{ id: co.id, share: 0.3 }]
  g.character.willBeneficiaries = [heir.id]
  const holders = (n: GameState): string[] => businessAssets(n).flatMap((a) => readBiz(n, a).familyShares?.map((s) => s.id) ?? [])
  return {
    g,
    heir,
    before: ['familyShares'],
    after: ['familyShares'],
    each: (n, year) => {
      if (year !== 0) return
      const late = n.people.find((p) => p.id === co.id)
      expect(late, 'the hand-over keeps the co-owner as a contact').toBeDefined()
      expect(late!.relation).toBe('friend')
      expect(holders(n), 'and the firm still names them').toContain(co.id)
      late!.alive = false
      late!.causeOfDeath = 'Old Age'
      late!.data.diedYear = n.year
    },
    claim: (n, year) => {
      // from the first year step on the stake is settled: no share names a person who is gone
      if (year >= 1) for (const id of holders(n)) expect(n.people.find((p) => p.id === id)?.alive, `year ${year}: ${id} holds a share`).toBe(true)
    },
  }
}

/** Two married siblings of the player with a spouse and a child on record; the first dies in the second year with $3M. */
function marriedSibling(stamped: boolean): Built {
  expect(stamped).toBe(true)
  const g = kinGame(3, 2)
  const sibs = g.people.filter((p) => p.relation === 'sibling')
  g.character.age = 70
  g.character.money = 1_000_000
  sibs[0]!.age = 66
  sibs[1]!.age = 63
  for (const s of sibs) withLife(s)
  syncKin(g)
  for (const s of sibs) adoptChild(g, s, { first: 'Sol', last: s.lastName, gender: 'female' })
  const heir = cast(g, 70, 'child', { age: 22, firstName: 'Hana', lastName: g.character.lastName })
  const first = sibs[0]!.id
  return {
    g,
    heir,
    before: ['spouseSid', 'kidSids'],
    after: ['spouseSid', 'kidSids'],
    each: (n, year) => {
      const s = n.people.find((p) => p.id === first)
      if (s === undefined) return
      if (year === 1) personCash(n, s, 3_000_000, 'prize')
      if (year === 2) {
        s.alive = false
        s.causeOfDeath = 'Old Age'
        s.data.diedYear = n.year
      }
    },
  }
}

const SCENES: readonly Scene[] = [
  { name: 'the designated sibling takes the firm', build: siblingFirm },
  { name: 'the heir has a company of their own', build: heirCompany },
  { name: 'a conglomerate with a relative as group CEO', build: conglomerate },
  { name: "a sibling of the heir is the firm's manager", build: relativeManager(false) },
  { name: "the heir is the firm's manager", build: relativeManager(true) },
  { name: 'a co-owner kept as a friend dies the next year', build: coOwner },
  { name: 'married siblings with a spouse and a child on record', stampedOnly: true, build: marriedSibling },
]

/** The scene played through a hand-over and ten years: the ids checked at every step. */
function play(scene: Scene, stamped: boolean): GameState {
  const s = scene.build(stamped)
  const held = scanIds(s.g)
  for (const kind of s.before) expect(held.held[kind], `before the death: ${kind}`).toBeGreaterThan(0)
  expect(held.dangling, 'before the death').toEqual([])
  const n = handOver(s.g, s.heir.id)
  expect(n, 'the hand-over must happen').not.toBe(s.g)
  expect(n.character.id).toBe(s.heir.id)
  playYears(n, YEARS, (x, year) => {
    s.each?.(x, year)
    const now = scanIds(x)
    if (year === 0) {
      for (const kind of s.after) expect(now.held[kind], `at the hand-over: ${kind}`).toBeGreaterThan(0)
      // a read: the same answer from a state that cannot be written to
      expect(scanIds(deepFreeze(structuredClone(x)))).toEqual(now)
    }
    expect(now.dangling, `year ${year}`).toEqual([])
    s.claim?.(x, year)
  })
  // and at the end of the ten years the books balance and, on a stamped life, the world and the kin links are sound
  expectConserved(n)
  if (stamped) {
    expect(kinProblems(n), 'kin links at the end').toEqual([])
    expect(worldProblems(n), 'the world at the end').toEqual([])
  }
  return n
}

describe.each([
  ['a stamped life', true],
  ['an unstamped life', false],
] as const)('no id dangles for ten years after a hand-over: %s', (_name, stamped) => {
  for (const scene of SCENES) {
    if (scene.stampedOnly === true && !stamped) continue
    it(scene.name, () => {
      play(scene, stamped)
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// Relatives employed at a firm the designated sibling adopts (X35, the L1 row e)

describe('relatives employed at a firm the designated sibling adopts', () => {
  /** [id, rank at the firm, how the job ended, occupation] of everyone who has or had a job there: at the hand-over and after two family years. */
  function jobRows(stamped: boolean): string[][][] {
    const s = siblingFirm(stamped)
    const n = handOver(s.g, s.heir.id)
    const rows: string[][][] = []
    playYears(n, 2, (x) => {
      rows.push(
        x.people
          .filter((p) => readJob(p) !== null || readPast(p) !== null)
          .map((p) => [p.id, String(readJob(p)?.rank ?? '-'), readPast(p)?.how ?? '-', p.occupation])
          .sort((u, v) => (u[0]! < v[0]! ? -1 : 1)),
      )
    })
    return rows
  }

  it('keeps the record of a job at the hand-over and closes every one in the first family year, with the person unemployed', () => {
    for (const stamped of [false, true]) {
      const [atOnce, yearOne, yearTwo] = jobRows(stamped)
      expect(atOnce!.filter((r) => r[1] !== '-'), `stamped ${stamped}: kept at the hand-over`).not.toHaveLength(0)
      expect(yearOne!.filter((r) => r[1] !== '-'), `stamped ${stamped}: held after year 1`).toEqual([])
      expect(yearOne!.every((r) => r[2] === 'closed' && r[3] === 'Unemployed'), `stamped ${stamped}: closed and unemployed`).toBe(true)
      expect(yearTwo, `stamped ${stamped}: and stays that way`).toEqual(yearOne)
    }
  })

  it('is the same job rule on a stamped life: only who is kept as a contact differs, and the first family year ends the rest alike', () => {
    const plain = jobRows(false)
    const stamped = jobRows(true)
    // the late player's own child stays in the family on either path; the hired sibling is kept only when the late player was bound to them
    // by the job (a kept contact of R4-L9), so their record survives to the first family year and closes with the others
    expect(plain[0]!.length).toBe(1)
    expect(stamped[0]!.length).toBe(2)
    expect(stamped[0]!.map((r) => r[0])).toEqual(expect.arrayContaining(plain[0]!.map((r) => r[0]!)))
    // after the first year the two lives agree on everyone they both still have
    const ids = new Set(plain[1]!.map((r) => r[0]))
    expect(stamped[1]!.filter((r) => ids.has(r[0]))).toEqual(plain[1])
    expect(stamped[2]!.filter((r) => ids.has(r[0]))).toEqual(plain[2])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The kit sees each kind go wrong

describe('danglingIds', () => {
  const firmWith = (g: GameState, over: (b: ReturnType<typeof newBiz>) => void, name: string): string => {
    const b = newBiz(g, 'cafe', 'us', 'Chicago', { cash: 1_000_000, founded: 2020, ceo: 'manager', manager: { firstName: 'Ana', lastName: 'Ruiz', gender: 'female', skill: 60, salary: 90_000, since: 2020 } })
    b.share = 0.5
    over(b)
    const asset = createBusinessAsset(g, name, b, 100_000)
    g.assets.push(asset)
    return asset.id
  }
  const jobAt = (g: GameState, assetId: string): FamilyJob => ({ assetId, rank: 1, focus: 'ops', kind: 'real', title: 'Clerk', since: g.year, rankSince: g.year, pay: 1, skill: 50, mood: 50, perf: 50, raised: 0, unpaid: 0, burn: 0, part: false, groom: false, by: g.character.id, kin: '' })

  it('names a manager, a co-owner, a founder, a job and a kin link that point at nobody, and nothing that resolves', () => {
    const g = kinGame(2, 1)
    const sib = g.people.find((p) => p.relation === 'sibling')!
    const friend = cast(g, 60, 'friend')
    const heldBy = cast(g, 60, 'friend')
    heldBy.data.sid = 's77'
    const real = firmWith(g, (b) => {
      b.manager!.personId = friend.id
      b.npcOwnerId = friend.id
      b.familyShares = [{ id: friend.id, share: 0.1 }, { id: CHARITY, share: 0.1 }]
    }, 'Resolved')
    const bad = firmWith(g, (b) => {
      b.manager!.personId = 'ghost1'
      b.npcOwnerId = 'ghost2'
      b.familyShares = [{ id: 'ghost3', share: 0.1 }, { id: CHARITY, share: 0.1 }]
    }, 'Dangling')
    writeJob(friend, jobAt(g, real))
    writeJob(heldBy, jobAt(g, 'biz-nowhere'))
    const sid = adoptSpouse(g, sib, { gender: 'male' })
    expect(sid, 'a spouse on record').not.toBeNull()
    sib.data.kidSids = ['s77', 'kin.us.2020.99', sid!]
    const scan = scanIds(g)
    expect(scan.dangling).toEqual([
      `asset ${bad} familyShares: ghost3`,
      `asset ${bad} manager: ghost1`,
      `asset ${bad} npcOwnerId: ghost2`,
      `job of ${heldBy.id}: biz-nowhere`,
      `kidSids of ${sib.id}: kin.us.2020.99`,
    ])
    expect(scan.held).toEqual({ manager: 2, job: 2, familyShares: 4, npcOwnerId: 2, spouseSid: 1, kidSids: 3 })
    expect(danglingIds(g)).toEqual(scan.dangling)
  })

  it('lets a dead person, the player as a manager and an anchor long dead stand, and sees a company an NPC holds', () => {
    const g = kinGame(2, 1)
    const sib = g.people.find((p) => p.relation === 'sibling')!
    const gone = cast(g, 60, 'friend')
    gone.alive = false
    gone.data.diedYear = g.year
    const id = firmWith(g, (b) => {
      b.manager!.personId = g.character.id
      b.familyShares = [{ id: gone.id, share: 0.2 }]
    }, 'Held')
    expect(danglingIds(g)).toEqual([])
    // a relative's job at a company an NPC holds still points at a company
    const npc = cast(g, 60, 'friend')
    npc.data.npcCompany = JSON.parse(JSON.stringify(g.assets.find((a) => a.id === id))) as never
    g.assets = g.assets.filter((a) => a.id !== id)
    writeJob(gone, jobAt(g, id))
    expect(danglingIds(g)).toEqual([])
    // an anchor ten years dead is let go with its links (KIN_CAPS.deadYears)
    sib.alive = false
    sib.data.diedYear = g.year - 10
    sib.data.spouseSid = 'kin.us.2000.1'
    expect(danglingIds(g)).toEqual([])
    sib.data.diedYear = g.year - 9
    expect(danglingIds(g)).toEqual([`spouseSid of ${sib.id}: kin.us.2000.1`])
  })

  it('reads a hostile state without throwing and without writing', () => {
    const g = kinGame(2, 1)
    const p = cast(g, 60, 'friend')
    Object.assign(p.data, { spouseSid: 7, kidSids: 'x', nepo: { assetId: 5 }, npcCompany: { id: 3, details: 9 } })
    cast(g, 60, 'friend').data = null as never
    const frozen = deepFreeze(structuredClone(g))
    expect(() => danglingIds(frozen)).not.toThrow()
    expect(danglingIds(frozen)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The sid fold (X39)

function sidFamily(stamped: boolean, sid: string | null): { g: GameState; heir: Person } {
  const g = makeTestGame(5, { age: 70, money: 400_000, countryId: 'us', gender: 'male', residence: { status: 'renting', rent: 0 } })
  g.log = [{ age: 70, year: g.year, entries: [] }]
  if (stamped) stampSocial(g)
  const heir = cast(g, 70, 'child', { age: 30, gender: 'female', countryId: 'us', money: 20_000 })
  cast(g, 60, 'child', { age: 27, gender: 'male', countryId: 'us', money: 20_000 })
  if (sid !== null) heir.data.sid = sid
  // the heir has $25,000 on the books: under person:<sid> when there is a sid, else under person:<id>
  personCash(g, heir, 25_000, 'prize')
  return { g, heir }
}

describe('the sid fold: a heir that carries a sid keeps cash and account in step', () => {
  it("relabels person:<sid> into the heir's own account, as a plain heir has it", () => {
    const odd = sidFamily(true, 's77')
    const plain = sidFamily(true, null)
    expect(acctOf(odd.g, 'person:s77')).toBe(25_000)
    expect(acctOf(plain.g, `person:${plain.heir.id}`)).toBe(25_000)
    const n = handOver(odd.g, odd.heir.id)
    const twin = handOver(plain.g, plain.heir.id)
    // the old account is gone and the player's account holds what a heir with no sid holds
    expect(acctOf(n, 'person:s77')).toBe(0)
    expect(acctOf(n, playerAcct(n))).toBe(acctOf(twin, playerAcct(twin)))
    expect(n.character.money).toBe(twin.character.money)
    // a relabel draws nothing and makes no id
    expect(n.rng).toBe(twin.rng)
    expect(n.nextId).toBe(twin.nextId)
    expectConserved(n)
  })

  it('does nothing without a sid, for a sid that is no name, and on a life that is not stamped', () => {
    const none = sidFamily(true, null)
    const bad = sidFamily(true, 'not a sid')
    const a = handOver(none.g, none.heir.id)
    const b = handOver(bad.g, bad.heir.id)
    expect(acctOf(b, playerAcct(b))).toBe(acctOf(a, playerAcct(a)))
    // an unstamped hand-over runs the old statements untouched: the account of a sid it never looked at stays where it was
    const old = sidFamily(false, 's77')
    const n = handOver(old.g, old.heir.id)
    expect(acctOf(n, 'person:s77')).toBe(25_000)
  })

  it('gives the same state when the hand-over is made twice', () => {
    const odd = sidFamily(true, 's77')
    odd.g.character.alive = false
    odd.g.character.causeOfDeath = 'Old Age'
    odd.g.queue = []
    const x = continueAsChild(structuredClone(odd.g), odd.heir.id)
    const y = continueAsChild(structuredClone(odd.g), odd.heir.id)
    expect(JSON.stringify(x)).toBe(JSON.stringify(y))
  })

  it('is what the invariant names: a child that carries a sid is a fault of kinProblems before the hand-over', () => {
    const odd = sidFamily(true, 's77')
    expect(kinProblems(odd.g).some((line) => line.includes(odd.heir.id) && line.includes('s77'))).toBe(true)
    expect(kinProblems(sidFamily(true, null).g)).toEqual([])
  })
})
