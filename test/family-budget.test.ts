// R4-E9 (X26, X40, X41, X42, C13, C14, C15; cross-check section 4): the family-act budget. A life the social stamp marks shares three family
// choices a year (g.yearActions['fam.act']) among the sources that used to count for themselves (wealth 3, the luxury choice 1, nepo 2,
// the will 1), with a reserve that keeps one for nepo, the will or the close when the family has a live stake, and the old caps inside
// the three. A life that is not stamped keeps today's counts to the digit. What the file proves, in the order of the plan:
//
//   1. The counter: useFamilyAct and familyRoom on a stamped and an unstamped game, the reserve, hostile counters, 100 times the calls.
//   2. familyLive, clause by clause (an edge with a feud, an edge with a debt, a cut-out in the will record and in an edge memory, a family
//      firm with employed relatives), total on a hostile world, pure under deepFreeze with the rng trapped, free of events/ and business/.
//   3. The spend points one at a time: popupBudget (a number, not a spend), the grown-kids popup, useChoicePopup and the three nepo sites,
//      the baton that leaves handYear alone when refused, the will's tryScene, the luxury choice. The nepo outcome notice spends nothing.
//   4. The saturated year (scripted, not natural play): one stamped tier-4 household in which every source is eligible in the same year.
//      Counted by script id: exactly 3 queued, `wealth` and `use` at most 2 together, the reserved slot to nepo, will or social, every
//      later call false and queues nothing, the outcome notice spends nothing, a feud scene and `will.scene` never both. Then each source
//      alone takes the reserved slot, and the same year on a life that is not stamped queues more than 3 (today's behaviour).
//   5. Thirty and forty years: the tier-4 wealth household of test/wealth-parity.test.ts for 30 years (stamped, live and not live, and
//      unstamped) against the recorded E3 rows, and the saturated household for 40 years through ageUp, with a second run of each
//      yearly entry that never takes the year past 3.
//   6. The pins the plan names: DEFERRABLE_SCRIPTS is the three literals it was and holds no kin script, the files of society/.
//
// The close-phase acts of R4-E10b, E11 and E12 do not exist yet. They will spend the `social` source through useFamilyAct; here a stand-in
// does (a script of its own that queues one choice), so the budget is proved with the sources that exist and the call that later tasks make.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ageUp } from '../src/game/aging'
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import { yearlyNepo } from '../src/game/business/nepo'
import { familyOf } from '../src/game/business/nepo-state'
import { NEPO_POPUPS, familyYear, popupRoom, usePopup, useChoicePopup } from '../src/game/business/nepo-year'
import { bizOf } from '../src/game/business/state'
import { scriptChoice, useYearAction, yearActionsUsed } from '../src/game/core'
import { WEALTH_POPUP_CAP, TIER_POPUP_CAP, readTies, updateTies, wealthTier } from '../src/game/events/wealth-core'
import { popupBudget, yearlyWealth } from '../src/game/events/wealth'
import { changeWill, learn, removeHeir } from '../src/game/events/will-act'
import { updateWl } from '../src/game/events/will-core'
import { yearlyWillFeuds } from '../src/game/events/will-feud'
import { yearlyNepoLife } from '../src/game/events/nepo-life'
import { DEFERRABLE_SCRIPTS } from '../src/game/hubs/year-close'
import { personEntity } from '../src/game/kernel/person-ref'
import { yearlyEntries } from '../src/game/kernel/registry'
import { defineScript } from '../src/game/scripts'
import { lineById } from '../src/game/shops/luxury-brands-catalog'
import { buyOffer } from '../src/game/shops/luxury-brands-deal'
import { grantAccess, yearlyFamilyUse } from '../src/game/shops/luxury-family'
import { pendingSecretaryRequests } from '../src/game/shops/luxury-secretary-state'
import { hireStaff } from '../src/game/shops/luxury-staff'
import { ACT_KEY, EARLY_KEY, FAMILY_ACTS } from '../src/game/society/budget'
import { familyLive, familyRoom, liveFeuds, openDebts, useFamilyAct, type FamilySource } from '../src/game/society/contract'
import type { Asset, ChoiceModal, GameState, ModalItem, Person } from '../src/game/types'
import { putEdge, remember } from '../src/game/world/edge-write'
import { playerRef } from '../src/game/world/people'
import { socialOn, stampSocial } from '../src/game/world/social'
import { syncWorld } from '../src/game/world/sync'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { kid, world } from './nepo-kit'
import { findSeed } from './seed-kit'
import { cast, socialGame } from './social-kit'
import { oracle, readRows, scene, trapRng, type CastSpec, type Tuple } from './social-parity-kit'

// ---------------------------------------------------------------------------------------------------------------------
// Helpers

const ROOT = resolve(__dirname, '..')
const src = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8')

const keyOf = (g: GameState, p: Person): string => `${personEntity(p)}>${playerRef(g)}`
const E = (g: GameState, over: Record<string, unknown> = {}): never => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, ...over }) as never

/** The ids of the scripts that spend a family choice: the sources that exist and the stand-ins for the close's acts. */
const FAMILY_SCRIPTS: readonly RegExp[] = [/^wealth\.(ask|bundle|allowance\.adult)$/, /^nepo\.(ask|baton|life)$/, /^will\./, /^luxury\.family\.(party|crash|pawn)$/, /^test\.kin\./]

const isFamilyChoice = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && typeof m.scriptId === 'string' && FAMILY_SCRIPTS.some((re) => re.test(m.scriptId!))

/** The family choices in the queue, by script id, in the order they were queued. */
const queued = (g: GameState): string[] => g.queue.filter(isFamilyChoice).map((m) => m.scriptId!)

/** How many of those ids match. */
const count = (ids: readonly string[], re: RegExp): number => ids.filter((id) => re.test(id)).length

/** Stand-ins for the acts of the close (R4-E10b's lender, R4-E12's falling out): one choice each, spent through the same call. */
const LENDER = defineScript('test.kin.lender', () => undefined)
const FEUD = defineScript('test.kin.feud', () => undefined)

/** A lender calls: a choice that is queued only when the shared budget has a slot. */
function lenderCalls(g: GameState): boolean {
  if (!useFamilyAct(g, 'social')) return false
  scriptChoice(g, LENDER, 'A Lender Calls', 'Test.', [{ id: 'ok', label: 'Ok' }])
  return true
}

/** A falling out: E12's rule, a scene only when the will's scene of the year is unspent as well as the shared slot. */
function fallingOut(g: GameState): boolean {
  if (yearActionsUsed(g, 'will.scene') > 0 || !useFamilyAct(g, 'social')) return false
  useYearAction(g, 'will.scene', 1)
  scriptChoice(g, FEUD, 'A Falling Out', 'Test.', [{ id: 'ok', label: 'Ok' }])
  return true
}

/**
 * A debt on the edge person > player. Kind 1 (a divorce), because the legacy sync follows `data.w.owes` for a loan and takes a kind 0
 * debt off the edge the next time the person is touched; a debt of another kind keeps its slot (world/edge-step.ts syncLegacy).
 */
function owe(g: GameState, p: Person): void {
  expect(putEdge(g, keyOf(g, p), E(g, { dv: [5_000, 0, g.year - 1, 1, 0] }))).toBe(true)
}

/** A feud on the edge person > player. */
function feud(g: GameState, p: Person, rung = 2): void {
  expect(putEdge(g, keyOf(g, p), E(g, { q: [rung, g.year - 1, 3] }))).toBe(true)
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. The counter

describe('the counter: useFamilyAct and familyRoom', () => {
  const SOURCES: readonly FamilySource[] = ['wealth', 'use', 'nepo', 'will', 'social']

  it('is the three a year the plan says, under the keys fam.act and fam.early', () => {
    expect(FAMILY_ACTS).toBe(3)
    expect(ACT_KEY).toBe('fam.act')
    expect(EARLY_KEY).toBe('fam.early')
  })

  it('on a life that is not stamped is true for every source, writes nothing, and has no room limit', () => {
    const g = makeTestGame(3, { age: 45 })
    const before = JSON.stringify(g)
    for (let i = 0; i < 50; i++) for (const s of SOURCES) expect(useFamilyAct(g, s)).toBe(true)
    for (const s of SOURCES) expect(familyRoom(g, s)).toBe(Number.POSITIVE_INFINITY)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.yearActions).toEqual({})
    expect(socialOn(g)).toBe(false)
  })

  it('on a stamped life with nothing live gives three, to any mix of sources, and then none', () => {
    for (const mix of [['wealth', 'wealth', 'wealth'], ['use', 'nepo', 'will'], ['nepo', 'will', 'social'], ['wealth', 'use', 'social']] as const) {
      const g = socialGame(3, { age: 45 })
      expect(familyLive(g)).toBe(false)
      for (const s of mix) expect(useFamilyAct(g, s), `${mix.join()} ${s}`).toBe(true)
      expect(g.yearActions[ACT_KEY]).toBe(3)
      for (const s of SOURCES) {
        expect(familyRoom(g, s)).toBe(0)
        expect(useFamilyAct(g, s)).toBe(false)
      }
      expect(g.yearActions[ACT_KEY]).toBe(3)
    }
  })

  it('counts only wealth and use in fam.early', () => {
    const g = socialGame(3, { age: 45 })
    for (const s of ['wealth', 'use', 'nepo'] as const) expect(useFamilyAct(g, s)).toBe(true)
    expect(g.yearActions[ACT_KEY]).toBe(3)
    expect(g.yearActions[EARLY_KEY]).toBe(2)
    const h = socialGame(3, { age: 45 })
    for (const s of ['nepo', 'will', 'social'] as const) expect(useFamilyAct(h, s)).toBe(true)
    expect(h.yearActions[EARLY_KEY]).toBeUndefined()
  })

  it('reserves one for nepo, the will and the close when the family is live: wealth and use take two between them', () => {
    const g = socialGame(3, { age: 45 })
    owe(g, cast(g, 60))
    expect(familyLive(g)).toBe(true)
    expect(familyRoom(g, 'wealth')).toBe(2)
    expect(familyRoom(g, 'use')).toBe(2)
    expect(familyRoom(g, 'nepo')).toBe(3)
    expect(useFamilyAct(g, 'wealth')).toBe(true)
    expect(useFamilyAct(g, 'use')).toBe(true)
    // the reserved slot is not theirs: neither can take it, though one of the three is still unspent
    expect(g.yearActions[ACT_KEY]).toBe(2)
    expect(familyRoom(g, 'wealth')).toBe(0)
    expect(useFamilyAct(g, 'wealth')).toBe(false)
    expect(useFamilyAct(g, 'use')).toBe(false)
    expect(g.yearActions[ACT_KEY]).toBe(2)
    expect(g.yearActions[EARLY_KEY]).toBe(2)
    // and any one of the three late sources can
    for (const late of ['nepo', 'will', 'social'] as const) {
      const h = JSON.parse(JSON.stringify(g)) as GameState
      expect(useFamilyAct(h, late), late).toBe(true)
      expect(h.yearActions[ACT_KEY]).toBe(3)
      for (const s of SOURCES) expect(useFamilyAct(h, s), `${late} then ${s}`).toBe(false)
    }
  })

  it('lets the late sources spend first and leaves wealth the rest, still at most 3 - reserve', () => {
    const g = socialGame(3, { age: 45 })
    owe(g, cast(g, 60))
    expect(useFamilyAct(g, 'nepo')).toBe(true)
    // one spent: room 2 left of the year, and the early sources may use 2 - they stop at the year's total of 3
    expect(familyRoom(g, 'wealth')).toBe(2)
    expect(useFamilyAct(g, 'wealth')).toBe(true)
    expect(useFamilyAct(g, 'wealth')).toBe(true)
    expect(useFamilyAct(g, 'wealth')).toBe(false)
    expect(g.yearActions[ACT_KEY]).toBe(3)
  })

  it('is reset with the other year actions', () => {
    const g = socialGame(3, { age: 45 })
    for (const s of ['wealth', 'use', 'nepo'] as const) useFamilyAct(g, s)
    g.yearActions = {}
    for (const s of SOURCES) expect(familyRoom(g, s)).toBe(3)
  })

  it('is bounded: a thousand calls in a year (100 times a hand-over\'s worth) leave the counters at 3', () => {
    const g = socialGame(3, { age: 45 })
    owe(g, cast(g, 60))
    let granted = 0
    for (let i = 0; i < 1_000; i++) if (useFamilyAct(g, SOURCES[i % SOURCES.length]!)) granted++
    expect(granted).toBe(3)
    expect(g.yearActions[ACT_KEY]).toBe(3)
    expect(g.yearActions[EARLY_KEY]).toBeLessThanOrEqual(2)
  })

  it('reads a hostile counter as what it is: a damaged number is zero, a huge one is a spent year, nothing throws', () => {
    for (const bad of [Number.NaN, -4, Infinity, -Infinity, 'x', null, undefined, [], {}, 2.9]) {
      const g = socialGame(3, { age: 45 })
      g.yearActions[ACT_KEY] = bad as never
      g.yearActions[EARLY_KEY] = bad as never
      expect(() => familyRoom(g, 'wealth'), String(bad)).not.toThrow()
      const room = familyRoom(g, 'nepo')
      expect(room, String(bad)).toBeGreaterThanOrEqual(0)
      expect(room, String(bad)).toBeLessThanOrEqual(3)
      useFamilyAct(g, 'nepo')
      expect(yearActionsUsed(g, ACT_KEY), String(bad)).toBeLessThanOrEqual(Number.isFinite(bad as number) && (bad as number) > 3 ? (bad as number) : 3)
    }
    const g = socialGame(3, { age: 45 })
    g.yearActions[ACT_KEY] = 1e9
    expect(familyRoom(g, 'will')).toBe(0)
    expect(useFamilyAct(g, 'will')).toBe(false)
    expect(g.yearActions[ACT_KEY]).toBe(1e9)
  })

  it('is a read: familyRoom writes nothing and draws nothing, on a frozen game with a trapped rng', () => {
    const g = socialGame(3, { age: 45 })
    owe(g, cast(g, 60))
    useFamilyAct(g, 'wealth')
    const f = deepFreeze(trapRng(JSON.parse(JSON.stringify(g)) as GameState))
    for (const s of SOURCES) expect(() => familyRoom(f, s), s).not.toThrow()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. familyLive

describe('familyLive', () => {
  it('is false for a plain life, stamped or not, with people around', () => {
    const plain = socialGame(5, { age: 50, money: 5_000_000 })
    for (let i = 0; i < 6; i++) cast(plain, 40 + i * 10, i % 2 ? 'sibling' : 'friend')
    expect(familyLive(plain)).toBe(false)
    const bare = makeTestGame(5, { age: 50 })
    cast(bare, 60, 'child')
    expect(familyLive(bare)).toBe(false)
    expect(liveFeuds(plain)).toBe(0)
    expect(openDebts(plain)).toBe(0)
  })

  it('is true for one edge that carries a feud rung (q), and false again when it ends', () => {
    const g = socialGame(5, { age: 50 })
    const p = cast(g, 60, 'sibling')
    feud(g, p)
    expect(liveFeuds(g)).toBe(1)
    expect(familyLive(g)).toBe(true)
    expect(putEdge(g, keyOf(g, p), { q: undefined })).toBe(true)
    expect(familyLive(g)).toBe(false)
  })

  it('is true for one edge that carries a debt (dv), and false again when it is paid up', () => {
    const g = socialGame(5, { age: 50 })
    const p = cast(g, 60, 'friend')
    owe(g, p)
    expect(openDebts(g)).toBe(1)
    expect(familyLive(g)).toBe(true)
    expect(putEdge(g, keyOf(g, p), { dv: undefined })).toBe(true)
    expect(familyLive(g)).toBe(false)
  })

  it('is true for someone cut out in the will record, and false for a dead one', () => {
    const g = socialGame(5, { age: 60, money: 5_000_000 })
    const kidP = cast(g, 70, 'child')
    expect(familyLive(g)).toBe(false)
    updateWl(g, kidP, (w) => {
      w.cut = true
    })
    expect(familyLive(g)).toBe(true)
    kidP.alive = false
    expect(familyLive(g)).toBe(false)
    // a record that another player wrote says nothing about this one
    kidP.alive = true
    const heir = JSON.parse(JSON.stringify(g)) as GameState
    heir.character.id = 'an-heir'
    expect(familyLive(heir)).toBe(false)
  })

  it('is true for a cut_from_will memory, until a restored_to_will answers it', () => {
    const g = socialGame(5, { age: 60 })
    const kidP = cast(g, 70, 'child')
    expect(remember(g, kidP, 'cut_from_will', { w: 3, by: 'ego' })).toBe(true)
    expect(familyLive(g)).toBe(true)
    expect(remember(g, kidP, 'restored_to_will', { w: 2, by: 'ego' })).toBe(true)
    expect(familyLive(g)).toBe(false)
    // cut again in a later year: the new cut is after the restoring
    g.year += 1
    expect(remember(g, kidP, 'cut_from_will', { w: 3, by: 'ego' })).toBe(true)
    expect(familyLive(g)).toBe(true)
    // the person is gone: the memory does not hold a slot for them
    kidP.alive = false
    expect(familyLive(g)).toBe(false)
  })

  it('reads a family firm: a relative with a job at a firm the player holds, once the world has indexed it', () => {
    const f = firmOnly()
    // the relatives were hired this year; the index is the frame the last year closed on
    expect(f.staff.every((p) => typeof (p.data.nepo as { assetId?: unknown }).assetId === 'string')).toBe(true)
    expect(familyLive(f.g)).toBe(false)
    syncWorld(f.g)
    expect(familyLive(f.g)).toBe(true)
    // the relatives leave (the job key is gone): nobody is employed any more
    for (const p of f.staff) delete p.data.nepo
    expect(familyLive(f.g)).toBe(false)
  })

  it('does not count an employed relative who has died, a firm that is gone, or a job of nothing', () => {
    const f = firmOnly()
    const g = f.g
    syncWorld(g)
    expect(familyLive(g)).toBe(true)
    for (const p of f.staff) p.alive = false
    expect(familyLive(g)).toBe(false)
    for (const p of f.staff) p.alive = true
    expect(familyLive(g)).toBe(true)
    // a job of nothing: not a plain object, or no firm named
    for (const bad of ['x', 7, null, [], { assetId: 5 }, { assetId: '' }, { rank: 2 }]) {
      for (const p of f.staff) p.data.nepo = bad as never
      expect(familyLive(g), JSON.stringify(bad)).toBe(false)
    }
    for (const p of f.staff) p.data.nepo = { assetId: 'a-firm-that-is-not-there' }
    expect(familyLive(g)).toBe(false)
    // restore the jobs, then sell the firm: the next world step drops it from the table
    f.restore()
    expect(familyLive(g)).toBe(true)
    g.assets = g.assets.filter((a) => a.id !== f.a.id)
    syncWorld(g)
    expect(familyLive(g)).toBe(false)
  })

  it('does not count a firm the player holds no share of in the table', () => {
    const f = firmOnly()
    const g = f.g
    syncWorld(g)
    expect(familyLive(g)).toBe(true)
    // the table says someone else holds it all
    const holdings = (g.world as { holdings?: { rows: unknown[] } }).holdings!
    g.world = { ...g.world, holdings: { ...holdings, rows: holdings.rows.map((r) => ['pool:outside', (r as string[])[1], 1]) } } as never
    expect(familyLive(g)).toBe(false)
  })

  it('is total on a hostile world and hostile jobs, and pure under deepFreeze with the rng trapped', () => {
    const h = home(true)
    const g = h.g
    syncWorld(g)
    for (const bad of ['x', 7, null, [], { assetId: 5 }, { assetId: '' }, { assetId: {} }, { assetId: [] }, { assetId: 'nobody' }]) {
      for (const p of [h.hal, h.ida, h.burn]) p.data.nepo = bad as never
      expect(() => familyLive(g), JSON.stringify(bad)).not.toThrow()
    }
    for (const junk of [null, 7, 'x', [], { v: 1, edges: 'x', holdings: 7, firms: [] }, { v: 2 }, { v: 1, holdings: { v: 1, rows: [[1, 2, 3]] } }]) {
      const c = JSON.parse(JSON.stringify(g)) as GameState
      c.world = junk as never
      expect(() => familyLive(c), JSON.stringify(junk)).not.toThrow()
      expect(typeof familyLive(c)).toBe('boolean')
    }
    const good = home(true)
    syncWorld(good.g)
    owe(good.g, good.jon)
    const f = deepFreeze(trapRng(JSON.parse(JSON.stringify(good.g)) as GameState))
    expect(familyLive(f)).toBe(true)
  })

  it('imports nothing from events/ or business/, and the contract is the door', () => {
    const budget = src('src/game/society/budget.ts')
    const imports = [...budget.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]!)
    expect(imports.length).toBeGreaterThan(5)
    for (const from of imports) {
      expect(from, `budget.ts imports ${from}`).not.toMatch(/\/(events|business|shops|special|activities)\//)
      expect(from, `budget.ts imports ${from}`).not.toMatch(/(^|\/)(life|relationships|love)$/)
    }
    const contract = src('src/game/society/contract.ts')
    expect(contract).toMatch(/export \{ liveFeuds, openDebts \} from '\.\.\/world\/edges'/)
    expect(contract).toMatch(/useFamilyAct/)
    expect(contract).toMatch(/familyLive/)
  })
})

/** A company with two relatives on the payroll, and nothing else live: no one cut out, no feud, no debt. The index is not yet built. */
function firmOnly(): { g: GameState; a: Asset; staff: Person[]; restore: () => void } {
  const seed = findSeed((s) => {
    try {
      world(s, { age: 66, money: 5_000_000 })
      return true
    } catch {
      return false
    }
  })
  const w = world(seed, { age: 66, money: 5_000_000 })
  stampSocial(w.g)
  const staff = [kid(w.g, 31, { smarts: 80 }), kid(w.g, 27, { smarts: 60 })]
  for (const p of staff) expect(hireRelative(w.g, w.a, w.b, p, { rank: 2 }).ok).toBe(true)
  w.g.queue = []
  const jobs = staff.map((p) => JSON.parse(JSON.stringify(p.data.nepo)) as never)
  return {
    g: w.g,
    a: w.a,
    staff,
    restore: () => staff.forEach((p, i) => void (p.data.nepo = jobs[i])),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The household of the saturated year: a stamped tier-4 life in which every source of a family choice can be eligible at once.

interface Home {
  g: GameState
  a: Asset
  hal: Person
  ida: Person
  burn: Person
  jon: Person
  cut: Person
  wild: Person
  boat: Asset
}

/**
 * The household. The player is 66 and rich (tier 4) and runs a restaurant chain with a successor (hal) and two more relatives on the
 * payroll (ida, and `burn`, whose job has run too far over their head: this year they walk out and the company has a story to tell). jon is
 * 22, unemployed and entitled (the nepo ask), on an allowance (the grown-kids popup). A fifth child is cut out of the will and knows it
 * (the will's scenes). wild is 21 and has the run of a yacht (the luxury choice). One friend is owed money and one is in a feud with the
 * player. `stamp` false builds the very same life without the social mark.
 */
function home(stamp: boolean, seed = HOME_SEED()): Home {
  const w = world(seed, { age: 66, money: 400_000_000 })
  const g = w.g
  const a = w.a
  if (stamp) stampSocial(g)
  const hal = kid(g, 31, { smarts: 82, traits: ['ambitious', 'loyal'] })
  const ida = kid(g, 27, { smarts: 58, traits: ['funny', 'kind'] })
  const burn = kid(g, 33, { smarts: 20, traits: ['lazy', 'anxious'] })
  const jon = kid(g, 22, { smarts: 35, traits: ['lazy', 'rebellious'], entitlement: 80 })
  const cut = kid(g, 29, { smarts: 50, traits: ['jealous', 'hot-headed'] })
  const wild = kid(g, 21, { smarts: 40, traits: ['wild'] })
  hireRelative(g, a, w.b, hal, { rank: 3, groom: true })
  hireRelative(g, a, w.b, ida, { rank: 1 })
  hireRelative(g, a, w.b, burn, { rank: 4 })
  designateSuccessor(g, a, w.b, hal)
  // far over their head for years: the yearly step is the one that shows them the door
  const job = burn.data.nepo as { burn?: number }
  job.burn = 3
  // jon turned 18 on an allowance and was never asked whether it goes on (setAllowance would mark an adult as asked already)
  updateTies(g, jon, (t) => {
    t.allowance = 3_000
    t.adultOk = false
  })
  changeWill(g, (x, will) => removeHeir(x, will, cut))
  learn(g, cut, 'leak')
  updateWl(g, cut, (x) => {
    x.anger = Math.max(x.anger, 60)
  })
  const boat = buyOffer(g, lineById('sunseeker-predator')!, 0, 'boutique')
  if (boat === null) throw new Error('the yacht was not sold')
  expect(grantAccess(g, boat, wild)).toBe(true)
  if (stamp) {
    owe(g, cast(g, 55, 'friend'))
    feud(g, cast(g, 45, 'sibling'))
  }
  g.queue = []
  g.yearActions = {}
  syncWorld(g)
  return { g, a, hal, ida, burn, jon, cut, wild, boat }
}

let homeSeed: number | null = null
/** A seed whose company comes through the set-up and the household holds together, searched once. */
function HOME_SEED(): number {
  if (homeSeed === null) {
    homeSeed = findSeed((s) => {
      try {
        const h = home(true, s)
        return h.g.character.alive && h.burn.data.nepo !== undefined && h.hal.data.nepo !== undefined && familyLive(h.g)
      } catch {
        return false
      }
    })
  }
  return homeSeed
}

let stampedBase: Home | null = null
let plainBase: Home | null = null

/** The household built once, and a deep copy for each test. The copies are plain JSON, so they share nothing with the base. */
function fresh(stamp: boolean): Home {
  const base = stamp ? (stampedBase ??= home(true)) : (plainBase ??= home(false))
  const g = JSON.parse(JSON.stringify(base.g)) as GameState
  const byId = (id: string): Person => g.people.find((p) => p.id === id)!
  return {
    g,
    a: g.assets.find((x) => x.id === base.a.id)!,
    hal: byId(base.hal.id),
    ida: byId(base.ida.id),
    burn: byId(base.burn.id),
    jon: byId(base.jon.id),
    cut: byId(base.cut.id),
    wild: byId(base.wild.id),
    boat: g.assets.find((x) => x.id === base.boat.id)!,
  }
}

/** Does this run of a hook queue a family choice of this kind? The clone has the year's budget open, so it answers "did the dice allow it?". */
function allows(g: GameState, run: (c: GameState) => void, re: RegExp): (rng: number) => boolean {
  return (s) => {
    const c = JSON.parse(JSON.stringify(g)) as GameState
    c.rng = s * 7919
    delete c.yearActions[ACT_KEY]
    delete c.yearActions[EARLY_KEY]
    delete c.yearActions['nepo.pop']
    delete c.yearActions['will.scene']
    run(c)
    return count(queued(c), re) > 0
  }
}

/** Puts the dice where the hook will queue what the test is about, so that the year does not depend on luck. Throws when no dice do. */
function lucky(g: GameState, run: (c: GameState) => void, re: RegExp): void {
  g.rng = findSeed(allows(g, run, re), { tries: 4_000 }) * 7919
}

interface Plan {
  wealth?: boolean
  use?: boolean
  nepo?: boolean
  will?: boolean
  /** The close: a lender calls, then a falling out (E10b, E12). */
  social?: boolean
}

const EVERY: Plan = { wealth: true, use: true, nepo: true, will: true, social: true }

/** One year of the hooks that queue a family choice, in the order the kernel runs them (money 70, 80, 90, 100; the close after). */
function playYear(g: GameState, plan: Plan): void {
  g.queue = []
  g.yearActions = {}
  if (plan.wealth) yearlyWealth(g)
  if (plan.use) {
    lucky(g, yearlyFamilyUse, /^luxury\.family\./)
    yearlyFamilyUse(g)
  }
  if (plan.nepo) yearlyNepo(g)
  if (plan.will) {
    lucky(g, yearlyWillFeuds, /^will\./)
    yearlyWillFeuds(g)
  }
  if (plan.social) {
    lenderCalls(g)
    fallingOut(g)
  }
}

const used = (g: GameState): number => yearActionsUsed(g, ACT_KEY)
const early = (g: GameState): number => yearActionsUsed(g, EARLY_KEY)

// ---------------------------------------------------------------------------------------------------------------------
// 3. The spend points, one at a time

describe('the spend points', () => {
  const stampedLife = (): Home => fresh(true)

  it('popupBudget is a number and not a spend: the old cap inside min(old, room), unchanged unstamped', () => {
    const g = socialGame(3, { age: 45 })
    const before = JSON.stringify(g.yearActions)
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 1, 2, 3, 3])
    expect(JSON.stringify(g.yearActions)).toBe(before)
    g.character.prison = {} as never
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 1, 1, 1, 1])
    g.character.prison = null
    // live: two for wealth, whatever the tier allows
    owe(g, cast(g, 60))
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 1, 2, 2, 2])
    // one spent by an early source: one is left for wealth
    useFamilyAct(g, 'use')
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 1, 1, 1, 1])
    useFamilyAct(g, 'use')
    expect([1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 0, 0, 0])
    expect(WEALTH_POPUP_CAP).toBe(3)
    expect([...TIER_POPUP_CAP]).toEqual([0, 1, 2, 3, 3])
    // the same numbers on a life that is not stamped, whatever the year has spent
    const old = makeTestGame(3, { age: 45 })
    old.yearActions = { [ACT_KEY]: 3, [EARLY_KEY]: 3 }
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(old, t))).toEqual([0, 1, 2, 3, 3])
  })

  it('the grown-kids popup spends one, and is not asked when the year has none left', () => {
    const h = stampedLife()
    const g = h.g
    expect(readTies(g, h.jon).adultOk).toBe(false)
    expect(readTies(g, h.jon).allowance).toBeGreaterThan(0)
    g.yearActions = {}
    g.queue = []
    yearlyWealth(g)
    expect(count(queued(g), /^wealth\.allowance\.adult$/)).toBe(1)
    expect(used(g)).toBeGreaterThanOrEqual(1)
    const g2 = stampedLife().g
    g2.yearActions = { [ACT_KEY]: 3 }
    g2.queue = []
    yearlyWealth(g2)
    expect(queued(g2)).toEqual([])
    expect(used(g2)).toBe(3)
  })

  it('wealth asks spend one each, one for the bundle, and a refused ask is dropped', () => {
    const h = stampedLife()
    const g = h.g
    g.yearActions = { [ACT_KEY]: 2 }
    g.queue = []
    yearlyWealth(g)
    // one slot was left: the grown-kids popup takes it (it comes first) and no ask is queued
    expect(queued(g)).toEqual(['wealth.allowance.adult'])
    expect(used(g)).toBe(3)
  })

  it('the secretary inbox: an ask handed to a secretary also takes the slot, and with none left the ask is dropped, not parked', () => {
    const make = (): GameState => {
      const s = scene(T4_TUPLE, { character: { age: 45, money: T4_MONEY, countryId: 'us', residence: { status: 'renting', rent: 0 } }, cast: T4_CAST, stamped: true })
      expect(hireStaff(s.g, 'secretary', { name: 'Test secretary', gender: 'female', hiredAge: 45, skill: 1, quirk: 'extremely discreet' })).toBe(true)
      s.g.queue = []
      return s.g
    }
    const g = make()
    wealthYear(g)
    // the secretary screened the year: the asks are in the inbox, not in the queue, and each one that was presented took a slot
    expect(count(queued(g), /^wealth\.(ask|bundle)$/)).toBe(0)
    expect(pendingSecretaryRequests(g).length).toBeGreaterThanOrEqual(1)
    expect(used(g)).toBeGreaterThanOrEqual(1)
    expect(used(g)).toBeLessThanOrEqual(FAMILY_ACTS)
    // a spent year: nothing reaches the inbox either
    const h = make()
    h.year += 1
    h.yearActions = { [ACT_KEY]: 3 }
    h.queue = []
    yearlyWealth(h)
    expect(pendingSecretaryRequests(h)).toHaveLength(0)
    expect(queued(h)).toEqual([])
    expect(used(h)).toBe(3)
  })

  it('useChoicePopup checks the shared room, spends the local cap, then the shared key; usePopup stays the local cap', () => {
    const g = socialGame(3, { age: 60 })
    expect(popupRoom(g)).toBe(true)
    expect(useChoicePopup(g)).toBe(true)
    expect(g.yearActions['nepo.pop']).toBe(1)
    expect(used(g)).toBe(1)
    // a notice's slot is the local cap only
    expect(usePopup(g)).toBe(true)
    expect(g.yearActions['nepo.pop']).toBe(2)
    expect(used(g)).toBe(1)
    expect(NEPO_POPUPS).toBe(2)
    // the shared year is spent: the local cap is not touched by the refusal
    const h = socialGame(3, { age: 60 })
    h.yearActions[ACT_KEY] = 3
    expect(useChoicePopup(h)).toBe(false)
    expect(h.yearActions['nepo.pop']).toBeUndefined()
    // the local cap is spent: the shared key is not touched by the refusal
    const k = socialGame(3, { age: 60 })
    k.yearActions['nepo.pop'] = 2
    expect(useChoicePopup(k)).toBe(false)
    expect(k.yearActions[ACT_KEY]).toBeUndefined()
    // unstamped, it is usePopup and writes nothing else
    const old = makeTestGame(3, { age: 60 })
    expect(useChoicePopup(old)).toBe(true)
    expect(useChoicePopup(old)).toBe(true)
    expect(useChoicePopup(old)).toBe(false)
    expect(old.yearActions).toEqual({ 'nepo.pop': 2 })
  })

  it('the nepo ask spends the shared key; a refused one is not asked and keeps the local cap', () => {
    // at 60 the baton is not due, so the one choice nepo can put is the ask
    const h = stampedLife()
    const g = h.g
    g.character.age = 60
    g.queue = []
    g.yearActions = {}
    lucky(g, yearlyNepo, /^nepo\.ask$/)
    yearlyNepo(g)
    expect(queued(g).filter((id) => /^nepo\./.test(id))).toEqual(['nepo.ask'])
    expect(used(g)).toBe(1)
    expect(familyOf(bizOf(g, g.assets.find((x) => x.id === h.a.id)!)).askYear).toBe(g.year)
    // the same dice with the year spent: no ask, no mark of the year, and the local cap is still the notice's alone
    const g2 = stampedLife().g
    g2.character.age = 60
    g2.queue = []
    g2.yearActions = { [ACT_KEY]: 3 }
    g2.rng = g.rng
    lucky(g2, yearlyNepo, /^nepo\.ask$/)
    yearlyNepo(g2)
    expect(count(queued(g2), /^nepo\./)).toBe(0)
    expect(used(g2)).toBe(3)
    expect(g2.yearActions['nepo.pop'] ?? 0).toBeLessThanOrEqual(1)
    expect(familyOf(bizOf(g2, g2.assets.find((x) => x.id === h.a.id)!)).askYear).not.toBe(g2.year)
  })

  it('the baton prompt spends the shared key before it marks the year, so a refused one comes again next year', () => {
    const h = stampedLife()
    const g = h.g
    const fam = (): ReturnType<typeof familyOf> => familyOf(bizOf(g, g.assets.find((x) => x.id === h.a.id)!))
    g.queue = []
    g.yearActions = { [ACT_KEY]: 3 }
    const handYear = fam().handYear
    familyYear(g)
    expect(count(queued(g), /^nepo\.baton$/)).toBe(0)
    expect(fam().handYear).toBe(handYear)
    expect(g.yearActions['nepo.pop'] ?? 0).toBeLessThanOrEqual(1)
    // next year, with room: the question is asked and the year is marked
    g.queue = []
    g.yearActions = {}
    g.year += 1
    g.character.age += 1
    familyYear(g)
    expect(count(queued(g), /^nepo\.baton$/)).toBe(1)
    expect(fam().handYear).toBe(g.year)
    expect(used(g)).toBe(1)
  })

  it('the nepo outcome notice is a notice: it spends the local cap and no shared slot', () => {
    const h = stampedLife()
    const g = h.g
    g.queue = []
    g.yearActions = {}
    familyYear(g)
    const notices = g.queue.filter((m) => m.kind === 'notice')
    expect(notices.length).toBeGreaterThanOrEqual(1)
    expect(g.yearActions['nepo.pop']).toBeGreaterThanOrEqual(1)
    expect(used(g)).toBe(count(queued(g), /^nepo\./))
    // with the shared year spent the notice still comes (it has no use for a slot)
    const g2 = stampedLife().g
    g2.queue = []
    g2.yearActions = { [ACT_KEY]: 3 }
    familyYear(g2)
    expect(g2.queue.filter((m) => m.kind === 'notice').length).toBeGreaterThanOrEqual(1)
    expect(used(g2)).toBe(3)
  })

  it('the life event of a rich parent spends the shared key (nepo-life)', () => {
    const make = (): GameState => {
      const g = socialGame(3, { age: 50, money: 80_000_000, countryId: 'us' })
      g.character.hidden.fame = 40
      cast(g, 70, 'child', { age: 22 })
      return g
    }
    const base = make()
    expect(wealthTier(base)).toBeGreaterThanOrEqual(2)
    const dice = findSeed((s) => {
      const c = make()
      c.rng = s * 7919
      yearlyNepoLife(c)
      return count(queued(c), /^nepo\.life$/) === 1
    }, { tries: 4_000 })
    const g = make()
    g.rng = dice * 7919
    yearlyNepoLife(g)
    expect(queued(g)).toEqual(['nepo.life'])
    expect(used(g)).toBe(1)
    expect(g.yearActions['nepo.pop']).toBe(1)
    const g2 = make()
    g2.rng = dice * 7919
    g2.yearActions = { [ACT_KEY]: 3 }
    yearlyNepoLife(g2)
    expect(queued(g2)).toEqual([])
    expect(g2.yearActions['nepo.pop']).toBeUndefined()
  })

  it('the will\'s scene spends the shared key along with will.scene, and a refused scene leaves both alone', () => {
    const h = stampedLife()
    const g = h.g
    g.queue = []
    g.yearActions = {}
    lucky(g, yearlyWillFeuds, /^will\./)
    yearlyWillFeuds(g)
    expect(count(queued(g), /^will\./)).toBe(1)
    expect(g.yearActions['will.scene']).toBe(1)
    expect(used(g)).toBe(1)
    const g2 = stampedLife().g
    g2.queue = []
    g2.yearActions = { [ACT_KEY]: 3 }
    lucky(g2, yearlyWillFeuds, /^will\./)
    yearlyWillFeuds(g2)
    expect(count(queued(g2), /^will\./)).toBe(0)
    expect(used(g2)).toBe(3)
  })

  it('the luxury choice spends the shared key just before it runs, and a refused one is dropped with its effects', () => {
    const h = stampedLife()
    const g = h.g
    g.queue = []
    g.yearActions = {}
    lucky(g, yearlyFamilyUse, /^luxury\.family\./)
    const dice = g.rng
    const condition = (x: GameState): number => x.assets.find((a) => a.id === h.boat.id)!.condition
    const was = condition(g)
    yearlyFamilyUse(g)
    expect(count(queued(g), /^luxury\.family\./)).toBe(1)
    expect(used(g)).toBe(1)
    expect(early(g)).toBe(1)
    // the same dice with the year spent: nothing is queued, nothing is deferred and the yacht is as it was
    const g2 = stampedLife().g
    g2.queue = []
    g2.yearActions = { [ACT_KEY]: 3 }
    g2.rng = dice
    yearlyFamilyUse(g2)
    expect(count(queued(g2), /^luxury\.family\./)).toBe(0)
    expect(condition(g2)).toBe(was)
    expect(used(g2)).toBe(3)
    // and with the two early slots gone, though a slot of the year is unspent (the reserve)
    const g3 = stampedLife().g
    g3.queue = []
    g3.yearActions = { [ACT_KEY]: 2, [EARLY_KEY]: 2 }
    g3.rng = dice
    yearlyFamilyUse(g3)
    expect(count(queued(g3), /^luxury\.family\./)).toBe(0)
    expect(used(g3)).toBe(2)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. The saturated year

describe('the saturated year', () => {
  it('queues exactly three family choices when every source is eligible, and the reserved slot goes to nepo', () => {
    const h = fresh(true)
    const g = h.g
    expect(familyLive(g)).toBe(true)
    expect(wealthTier(g)).toBe(4)
    playYear(g, EVERY)
    const ids = queued(g)
    // (1) exactly 3 queued, and the counter says 3
    expect(ids).toHaveLength(3)
    expect(used(g)).toBe(3)
    // (2) wealth and use together took at most 2 (the reserve): here all of it went to wealth
    const wealth = count(ids, /^wealth\./)
    const use = count(ids, /^luxury\./)
    expect(wealth + use).toBeLessThanOrEqual(2)
    expect(early(g)).toBe(wealth + use)
    expect(early(g)).toBeLessThanOrEqual(2)
    // (3) the reserved slot went to nepo, will or social
    expect(count(ids, /^nepo\.|^will\.|^test\.kin\./)).toBe(3 - wealth - use)
    expect(count(ids, /^nepo\.|^will\.|^test\.kin\./)).toBeGreaterThanOrEqual(1)
    // the order of the money phase decided who: wealth first, nepo next
    expect(ids.slice(0, wealth).every((id) => /^wealth\./.test(id))).toBe(true)
    expect(ids[ids.length - 1]).toBe('nepo.baton')
    // the luxury choice was refused, so it was dropped, not deferred
    expect(use).toBe(0)
    expect(count(ids, /^luxury\./)).toBe(0)
  })

  it('(4) refuses every later call and queues nothing: a loser is dropped, not deferred, and DEFERRABLE_SCRIPTS is unchanged', () => {
    const h = fresh(true)
    const g = h.g
    playYear(g, EVERY)
    expect(used(g)).toBe(3)
    const before = g.queue.length
    const ids = queued(g)
    for (const s of ['wealth', 'use', 'nepo', 'will', 'social'] as const) expect(useFamilyAct(g, s), s).toBe(false)
    // the hooks again, with the same year: not one more choice
    yearlyWealth(g)
    lucky(g, yearlyFamilyUse, /^luxury\.family\./)
    yearlyFamilyUse(g)
    yearlyNepo(g)
    yearlyWillFeuds(g)
    expect(lenderCalls(g)).toBe(false)
    expect(fallingOut(g)).toBe(false)
    expect(queued(g)).toEqual(ids)
    expect(g.queue.filter((m) => m.kind === 'choice')).toHaveLength(ids.length)
    expect(used(g)).toBe(3)
    expect(g.queue.length).toBeGreaterThanOrEqual(before)
    // next year the slots are back, and nothing waited for them
    g.yearActions = {}
    g.queue = []
    expect(familyRoom(g, 'nepo')).toBe(3)
    expect(g.flags.pendingAsks).toBeUndefined()
    expect([...DEFERRABLE_SCRIPTS].sort()).toEqual(['events.random', 'wealth.ask', 'wealth.bundle'])
    // the choices of the family stay out of the set, so the year close keeps them and counts them first
    for (const id of ['wealth.allowance.adult', 'nepo.ask', 'nepo.baton', 'nepo.life', 'will.confront', 'luxury.family.party', 'test.kin.lender', 'test.kin.feud', 'pop.kin.lender', 'pop.kin.feud', 'pop.kin.leak']) {
      expect(DEFERRABLE_SCRIPTS.has(id), id).toBe(false)
    }
  })

  it('(5) the nepo outcome notice is queued without raising fam.act', () => {
    const h = fresh(true)
    const g = h.g
    playYear(g, EVERY)
    const notices = g.queue.filter((m) => m.kind === 'notice' && m.title !== undefined)
    // burn walked out of the company this year: "Burned Out" is the year's story, a notice
    expect(notices.some((m) => m.kind === 'notice' && m.title === 'Burned Out')).toBe(true)
    expect(g.yearActions['nepo.pop']).toBe(2)
    expect(used(g)).toBe(queued(g).length)
    expect(used(g)).toBe(3)
  })

  it('(6) a feud scene and will.scene never both queue in the same year', () => {
    // the scene of the will came first: the feud (E12's rule, here a stand-in) finds will.scene spent
    const a = fresh(true).g
    a.queue = []
    a.yearActions = {}
    lucky(a, yearlyWillFeuds, /^will\./)
    yearlyWillFeuds(a)
    expect(count(queued(a), /^will\./)).toBe(1)
    expect(yearActionsUsed(a, 'will.scene')).toBe(1)
    expect(fallingOut(a)).toBe(false)
    expect(count(queued(a), /^test\.kin\.feud$/)).toBe(0)
    expect(used(a)).toBe(1)
    // the feud came first: it spent will.scene, and the will has no scene left to queue
    const b = fresh(true).g
    b.queue = []
    b.yearActions = {}
    expect(fallingOut(b)).toBe(true)
    lucky(b, yearlyWillFeuds, /^will\./)
    yearlyWillFeuds(b)
    expect(count(queued(b), /^will\./)).toBe(0)
    expect(count(queued(b), /^test\.kin\.feud$/)).toBe(1)
    expect(used(b)).toBe(1)
  })

  it('every one of nepo, will and social can take the reserved slot, when the others are quiet', () => {
    const cases: readonly [Plan, RegExp][] = [
      [{ wealth: true, use: true, nepo: true }, /^nepo\.baton$/],
      [{ wealth: true, use: true, will: true }, /^will\./],
      [{ wealth: true, use: true, social: true }, /^test\.kin\.lender$/],
    ]
    for (const [plan, who] of cases) {
      const g = fresh(true).g
      playYear(g, plan)
      const ids = queued(g)
      expect(ids, JSON.stringify(plan)).toHaveLength(3)
      expect(count(ids, /^wealth\./), JSON.stringify(plan)).toBe(2)
      expect(count(ids, who), JSON.stringify(plan)).toBeGreaterThanOrEqual(1)
      expect(used(g)).toBe(3)
      expect(early(g)).toBe(2)
    }
  })

  it('lets the luxury choice have a slot when wealth is quiet, and nepo and the will still get theirs', () => {
    const g = fresh(true).g
    playYear(g, { use: true, nepo: true, will: true, social: true })
    const ids = queued(g)
    expect(count(ids, /^luxury\.family\./)).toBe(1)
    expect(ids).toHaveLength(3)
    expect(early(g)).toBe(1)
    expect(count(ids, /^nepo\./)).toBeGreaterThanOrEqual(1)
    expect(used(g)).toBe(3)
  })

  it('keeps the old caps inside the three: nepo has two, of which the notice takes one, the will one scene', () => {
    const g = fresh(true).g
    playYear(g, { nepo: true, will: true, social: true })
    const ids = queued(g)
    expect(count(ids, /^nepo\./)).toBeLessThanOrEqual(NEPO_POPUPS)
    expect(count(ids, /^will\./)).toBeLessThanOrEqual(1)
    expect(ids.length).toBeLessThanOrEqual(3)
    expect(used(g)).toBe(ids.length)
  })

  it('on a life that is not stamped queues more than three, as v5.2.0 does, and writes no shared key', () => {
    const h = fresh(false)
    const g = h.g
    expect(socialOn(g)).toBe(false)
    playYear(g, { wealth: true, use: true, nepo: true, will: true })
    const ids = queued(g)
    // wealth 3 + the luxury choice 1 + the will's 1 (nepo finds four choices queued already and stands down)
    expect(count(ids, /^wealth\./)).toBe(3)
    expect(count(ids, /^luxury\.family\./)).toBe(1)
    expect(count(ids, /^will\./)).toBe(1)
    expect(ids.length).toBeGreaterThanOrEqual(5)
    expect(g.yearActions[ACT_KEY]).toBeUndefined()
    expect(g.yearActions[EARLY_KEY]).toBeUndefined()
    // the nepo cap is the old one: with the wealth asks out of the way the year's story (a notice) and the baton use its 2 together
    const n = fresh(false).g
    playYear(n, { nepo: true })
    expect(count(queued(n), /^nepo\.baton$/)).toBe(1)
    expect(n.queue.filter((m) => m.kind === 'notice' && m.title === 'Burned Out')).toHaveLength(1)
    expect(n.yearActions['nepo.pop']).toBe(NEPO_POPUPS)
    expect(n.yearActions[ACT_KEY]).toBeUndefined()
  })

  it('the control run: a household with nothing live gets exactly the wealth popups it always had', () => {
    // the same company and the same children, nobody on the payroll, nobody cut out, no feud, no debt
    const stamped = quiet(true)
    const plain = quiet(false)
    expect(socialOn(stamped)).toBe(true)
    expect(socialOn(plain)).toBe(false)
    expect(plain.rng).toBe(stamped.rng)
    let asked = 0
    for (let year = 0; year < 12; year++) {
      for (const x of [stamped, plain]) {
        x.queue = []
        x.yearActions = {}
        x.year += 1
        x.character.age += 1
        for (const p of x.people) if (p.alive) p.age += 1
      }
      expect(familyLive(stamped), `year ${year}`).toBe(false)
      yearlyWealth(stamped)
      yearlyWealth(plain)
      // the same popups from the same dice, and the dice end where they ended
      expect(queued(stamped), `year ${year}`).toEqual(queued(plain))
      expect(stamped.rng, `year ${year}`).toBe(plain.rng)
      expect(used(stamped), `year ${year}`).toBe(queued(stamped).length)
      asked += queued(stamped).length
    }
    expect(asked).toBeGreaterThanOrEqual(24)
  })
})

/** The company and the children of the household, and nothing live: built the same way with the stamp and without it. */
function quiet(stamp: boolean): GameState {
  const w = world(HOME_SEED(), { age: 50, money: 400_000_000 })
  if (stamp) stampSocial(w.g)
  for (const age of [31, 27, 22, 17]) kid(w.g, age, { smarts: 60 })
  w.g.queue = []
  w.g.yearActions = {}
  syncWorld(w.g)
  return w.g
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. Thirty and forty years

/** The tier-4 family of test/wealth-parity.test.ts (familyOf), so that the recorded E3 rows are the reference. */
const T4_TUPLE: Tuple = [24, 2026]
const T4_CAST: readonly CastSpec[] = [
  { key: 'kid16', relation: 'child', age: 16, relationship: 70, livesWithPlayer: true },
  { key: 'kid9', relation: 'child', age: 9, relationship: 70, livesWithPlayer: true },
  { key: 'kid22', relation: 'child', age: 22, relationship: 65, occupation: 'University Student' },
  { key: 'spouse', relation: 'spouse', age: 44, relationship: 75, livesWithPlayer: true },
  { key: 'mom', relation: 'parent', age: 72, relationship: 70, money: 3_000 },
  { key: 'sib', relation: 'sibling', age: 41, relationship: 60 },
  { key: 'f1', relation: 'friend', age: 46, relationship: 65 },
  { key: 'f2', relation: 'friend', age: 39, relationship: 55 },
]
const T4_MONEY = 400_000_000

/** One wealth year, as test/wealth-parity.test.ts plays it: everyone older, the year's actions reset, the hook. Returns the wealth choices queued. */
function wealthYear(g: GameState): ModalItem[] {
  g.year += 1
  g.character.age += 1
  for (const p of g.people) if (p.alive) p.age += 1
  g.yearActions = {}
  const before = g.queue.length
  yearlyWealth(g)
  return g.queue.slice(before)
}

const wealthChoices = (items: ModalItem[]): number => items.filter((m) => m.kind === 'choice' && typeof m.scriptId === 'string' && m.scriptId.startsWith('wealth.')).length

/** The popup counts of the E3 oracle for tier 4: the 30 rows `pop|t4|NN`. */
function recorded(): number[] {
  const rows = readRows(oracle('wealth')).rows.filter((r) => r.label.startsWith('pop|t4|'))
  expect(rows).toHaveLength(30)
  return rows.map((r) => (r.x as { pops: number }).pops)
}

describe('thirty years of a tier-4 life', () => {
  it('without the stamp, plays the counts of the E3 rows to the year and writes no shared key', () => {
    const s = scene(T4_TUPLE, { character: { age: 45, money: T4_MONEY, countryId: 'us', residence: { status: 'renting', rent: 0 } }, cast: T4_CAST, stamped: false })
    const counts: number[] = []
    for (let y = 1; y <= 30; y++) {
      counts.push(wealthChoices(wealthYear(s.g)))
      expect(s.g.yearActions[ACT_KEY]).toBeUndefined()
      s.g.queue = []
    }
    expect(counts).toEqual(recorded())
    expect(Math.max(...counts)).toBe(3)
  })

  it('stamped and with nothing live (the control run), plays the same counts to the year', () => {
    const s = scene(T4_TUPLE, { character: { age: 45, money: T4_MONEY, countryId: 'us', residence: { status: 'renting', rent: 0 } }, cast: T4_CAST, stamped: true })
    expect(socialOn(s.g)).toBe(true)
    const counts: number[] = []
    for (let y = 1; y <= 30; y++) {
      counts.push(wealthChoices(wealthYear(s.g)))
      expect(familyLive(s.g), `year ${y}`).toBe(false)
      expect(used(s.g), `year ${y}`).toBe(counts[counts.length - 1])
      s.g.queue = []
    }
    expect(counts).toEqual(recorded())
  })

  it('stamped and live, never exceeds 3 in a year, wealth takes at most 2 and the close always finds its slot', () => {
    const s = scene(T4_TUPLE, { character: { age: 45, money: T4_MONEY, countryId: 'us', residence: { status: 'renting', rent: 0 } }, cast: T4_CAST, stamped: true })
    owe(s.g, s.who.f2!)
    expect(familyLive(s.g)).toBe(true)
    let reserved = 0
    for (let y = 1; y <= 30; y++) {
      const items = wealthYear(s.g)
      const w = wealthChoices(items)
      expect(w, `year ${y}`).toBeLessThanOrEqual(2)
      expect(early(s.g), `year ${y}`).toBe(w)
      // the close: a lender calls, a falling out follows
      if (lenderCalls(s.g)) reserved++
      fallingOut(s.g)
      expect(used(s.g), `year ${y}`).toBeLessThanOrEqual(FAMILY_ACTS)
      expect(queued(s.g).length, `year ${y}`).toBeLessThanOrEqual(FAMILY_ACTS)
      expect(count(queued(s.g), /^test\.kin\./), `year ${y}`).toBeGreaterThanOrEqual(1)
      s.g.queue = []
    }
    expect(reserved).toBe(30)
  })
})

describe('forty years through the real yearly step', () => {
  /** The yearly entries of the hooks that queue a family choice, as the kernel runs them. */
  const ENTRIES = (): readonly { id: string; run: (g: GameState) => void }[] => yearlyEntries('aging').filter((e) => ['yearly.wealth', 'yearly.familyUse', 'yearly.nepo', 'yearly.willFeuds'].includes(e.id))

  it('keeps every year at three or fewer, wealth and use at two when live, and a second run of each entry never passes three', { timeout: 240_000 }, () => {
    expect(ENTRIES().map((e) => e.id)).toEqual(['yearly.wealth', 'yearly.familyUse', 'yearly.nepo', 'yearly.willFeuds'])
    const h = fresh(true)
    const g = h.g
    let lived = 0
    let liveYears = 0
    let busy = 0
    for (let y = 0; y < 40 && g.character.alive; y++) {
      g.queue = []
      // the player stays 66 (the age of the baton) and well, so that neither old age nor an illness ends the run; the calendar and everyone else move on
      g.character.age = 66
      g.character.stats.health = 100
      g.character.conditions = []
      const liveBefore = familyLive(g)
      ageUp(g)
      if (!g.character.alive) break
      lived++
      const ids = queued(g)
      const u = used(g)
      expect(u, `year ${g.year}`).toBeLessThanOrEqual(FAMILY_ACTS)
      expect(ids.length, `year ${g.year}`).toBeLessThanOrEqual(u)
      expect(early(g), `year ${g.year}`).toBeLessThanOrEqual(FAMILY_ACTS)
      if (liveBefore && familyLive(g)) {
        liveYears++
        expect(early(g), `year ${g.year}`).toBeLessThanOrEqual(2)
      }
      if (ids.length > 0) busy++
      // a second run of every entry in the same year: the counter only goes forward and never past three
      const firstIds = ids.length
      const firstUsed = u
      g.character.stats.health = 100
      for (const e of ENTRIES()) e.run(g)
      expect(used(g), `second run ${g.year}`).toBeLessThanOrEqual(FAMILY_ACTS)
      expect(queued(g).length, `second run ${g.year}`).toBeLessThanOrEqual(FAMILY_ACTS)
      expect(queued(g).length - firstIds, `second run ${g.year}`).toBeLessThanOrEqual(FAMILY_ACTS - firstUsed)
      if (firstUsed >= FAMILY_ACTS) expect(queued(g).length, `a spent year ${g.year}`).toBe(firstIds)
    }
    expect(lived).toBeGreaterThanOrEqual(30)
    expect(liveYears).toBeGreaterThanOrEqual(10)
    expect(busy).toBeGreaterThanOrEqual(10)
  })

  it('an unstamped life through the same years writes no shared key at all', { timeout: 240_000 }, () => {
    const g = fresh(false).g
    let lived = 0
    for (let y = 0; y < 15 && g.character.alive; y++) {
      g.queue = []
      g.character.age = 66
      g.character.stats.health = 100
      g.character.conditions = []
      ageUp(g)
      if (!g.character.alive) break
      lived++
      expect(g.yearActions[ACT_KEY], `year ${g.year}`).toBeUndefined()
      expect(g.yearActions[EARLY_KEY], `year ${g.year}`).toBeUndefined()
    }
    expect(lived).toBeGreaterThanOrEqual(10)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. The files

describe('the files of the task', () => {
  it('keeps the society domain to the budget and its door, with no dash in any file it wrote', () => {
    for (const file of ['src/game/society/budget.ts', 'src/game/society/contract.ts', 'test/family-budget.test.ts', 'docs/QUIET.md']) {
      expect(new RegExp('[\\u2013\\u2014]').test(src(file)), `${file} has a long dash`).toBe(false)
    }
  })

  it('names the society section in the architecture doc, and the budget in the social doc', () => {
    const arch = src('docs/ARCHITECTURE.md')
    for (const word of ['Society (society/*.ts)', 'society/contract.ts', 'society/budget.ts', 'useFamilyAct']) expect(arch.includes(word), `ARCHITECTURE.md names ${word}`).toBe(true)
    const social = src('docs/SOCIAL.md')
    for (const word of ['fam.act', 'fam.early', 'familyLive', 'useFamilyAct', 'familyRoom']) expect(social.includes(word), `SOCIAL.md names ${word}`).toBe(true)
  })
})
