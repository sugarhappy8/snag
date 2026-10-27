// R4-L7 (A.K8 b, D4, X24, X35, X42, C9, C37): the divorce deficiency becomes an obligation (src/game/divorce-debt.ts, the module life.debts).
// What the judge orders and the player cannot pay today is owed and paid over years, in the open: an edge player > ex with `dv` kind 1, 20% of
// the cash a year to the ex through serviceDebt under `divorce`, lapsed after 10 years, when the ex is gone or dead, and (by L6) at the player's
// death. A life the social stamp does not mark keeps the old forgiveness byte for byte.
//
// What the file proves, in the order of the plan:
//   1. The module: id, layer, the entry money/75 between wealth and familyUse, the people group rows.
//   2. The L1 scene: the deficiency of the six tuples and the other cases, stamped, becomes a debt equal to the pinned `remaining`; unstamped
//      it is the pin (no edge, no sentence); everything else of the divorce (order, cash, sale, rows) is the same on both.
//   3. openDivorceDebt: the edge, no cash moved, no draw; the three relations; the hostile sums; a second order for the same ex joins the
//      first; a loan between the two refuses; the cap of 40.
//   4. serveDivorceDebts: 20% of the cash, never more than is owed, never a negative cash; once a year; the next years; the sentence.
//   5. The lapse: 10 years, the ex dead, the ex gone, once each; the player's death (L6 settles the rest from the estate).
//   6. Authorization inside the functions (design 14.1 invariant 4): the table of blocked states changes nothing.
//   7. The ex survives cleanupPeople while the debt stands; hostile `dv`; net worth x100 and the 100x probes.
//   8. The real path: five unstamped years of ageUp are the same with and without the module, and a stamped year pays inside the seam.
//   9. The words and the source rules.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { bindMoneyContext, formatMoney, netWorth } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { DIVORCE_SHARE, DIVORCE_YEARS, openDivorceDebt, serveDivorceDebts } from '../src/game/divorce-debt'
import { divorce } from '../src/game/love'
import { GROUP_OF_SOURCE } from '../src/game/hubs/year-plan'
import { checkLedger, flowsOf, tokenSeen } from '../src/game/kernel/ledger'
import { personEntity } from '../src/game/kernel/person-ref'
import { getModule, withYearly, yearlyEntries } from '../src/game/kernel/registry'
import { continueAsChild } from '../src/game/life'
import { MODULES } from '../src/game/modules/index'
import { debtsModule } from '../src/game/modules/divorce-years'
import { nextRandom } from '../src/game/rng'
import { yearlyRelationships } from '../src/game/relationships'
import { DEBT_KIND, debtToken, debtsOf } from '../src/game/society/contract'
import { STATE_TABLE } from '../src/game/text/state-table'
import { DIVORCE_LAPSE } from '../src/game/text/pools'
import { fillSlots } from '../src/game/text/state'
import type { Asset, GameState, Person, RelationKind } from '../src/game/types'
import { EDGE_CAPS } from '../src/game/world/caps'
import { edgeKey, edgeLocalBound, openDebts, readEdge } from '../src/game/world/edges'
import { putEdge } from '../src/game/world/edge-write'
import { worldProblems } from '../src/game/world/invariants'
import { playerRef } from '../src/game/world/people'
import { socialOn, stampSocial } from '../src/game/world/social'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { acctOf, booksOf, driftSince, expectConserved } from './ledger-kit'
import { DIVORCE_CASES, playDivorce } from './life-pins-kit'
import { findSeed } from './seed-kit'
import { cast, socialGame } from './social-kit'
import { scene, trapRng, withStamped } from './social-parity-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

beforeEach(() => bindMoneyContext(null))

// ---------------------------------------------------------------------------------------------------------------------
// Helpers

/** A stamped player of 45 with `cash`, and an ex (or a spouse) of 44 with `exMoney` named Dana. */
function world(cash = 100_000, exMoney = 0, relation: RelationKind = 'exSpouse'): { g: GameState; ex: Person } {
  const g = socialGame(1, { age: 45, money: cash })
  const ex = cast(g, 40, relation, { age: 44, money: exMoney, firstName: 'Dana', lastName: 'Voss', gender: 'female' })
  return { g, ex }
}

const dvOf = (g: GameState, p: Person): readonly number[] | undefined => readEdge(g, playerRef(g), personEntity(p))?.dv
const keyOf = (g: GameState, p: Person): string => edgeKey(playerRef(g), personEntity(p))!
const rows = (g: GameState, reason: string): number => [...new Set([g.year - 1, g.year])].flatMap((y) => flowsOf(g, y)).filter((r) => r.reason === reason).length
const texts = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))
const lapseLines = (left: number): string[] => DIVORCE_LAPSE.map((l) => fillSlots(l, { money: formatMoney(left) }))
const spoke = (g: GameState, candidates: readonly string[]): number => texts(g).filter((t) => candidates.includes(t)).length
const payLines = (ex: Person, paid: number): string[] => STATE_TABLE['divorce.pay'].variants.map((v) => fillSlots(v, { who: `my ex ${ex.firstName}`, money: formatMoney(paid) }))
const snapshotOf = (g: GameState): string => JSON.stringify(g)

/** A divorce debt of `owed` opened in `year` by hand (the edge a stamped divorce writes). */
function owe(g: GameState, ex: Person, owed: number, year = g.year, paid = 0): void {
  const was = g.year
  g.year = year
  expect(openDivorceDebt(g, ex, owed)).toBe(true)
  g.year = was
  if (paid > 0) {
    const key = keyOf(g, ex)
    expect(putEdge(g, key as never, { dv: [owed, 0, year, DEBT_KIND.divorce, paid] })).toBe(true)
  }
}

function house(id: string, value: number): Asset {
  return { id, kind: 'house', name: 'Family House', emoji: '', purchasePrice: Math.round(value * 0.7), value, condition: 80, purchasedAge: 30, upkeep: 0, details: {} } as unknown as Asset
}

/** What life-pins.json pins as the deficiency of a divorce case (null when the notice has no judge's line). */
const PINS = JSON.parse(read('test/fixtures/life-pins.json')) as { rows: [string, ...unknown[]][] }
function pinnedRemaining(id: string): number | null {
  const row = PINS.rows.find((r) => r[0] === `divorce|${id}|filed`)
  if (row === undefined) throw new Error(`life-pins.json has no divorce row for ${id}`)
  return (row[6] as { rem: number | null }).rem
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. The module

describe('the module life.debts', () => {
  it('is one yearly entry in the aging seam, money phase, order 75, layer 3, and declares no fact', () => {
    expect(debtsModule.id).toBe('life.debts')
    expect(debtsModule.layer).toBe(3)
    expect(debtsModule.facts).toBeUndefined()
    expect(debtsModule.yearly).toEqual([{ seam: 'aging', phase: 'money', order: 75, run: serveDivorceDebts }])
    expect(MODULES).toContain(debtsModule)
    expect(getModule('life.debts')).toMatchObject({ id: 'life.debts', layer: 3 })
  })

  it('runs right after wealth (70) and right before familyUse (80); the other money orders are untouched', () => {
    const ids = yearlyEntries('aging').map((e) => e.id)
    expect(ids[ids.indexOf('yearly.wealth') + 1]).toBe('life.debts')
    expect(ids[ids.indexOf('life.debts') + 1]).toBe('yearly.familyUse')
    expect(ids.filter((id) => id === 'life.debts')).toHaveLength(1)
  })

  it('sorts among the modules by id and is in the people group of both tables (X42, C14)', () => {
    const ids = MODULES.map((m) => m.id)
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    expect(GROUP_OF_SOURCE['life.debts']).toBe('people')
    expect(/'life\.debts': 'people'/.test(read('src/ui/components/logModel.ts'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. The scene of L1: a divorce the player cannot pay in full

describe('the divorce deficiency of the L1 scenes', () => {
  const settled = (id: string) => {
    const c = DIVORCE_CASES.find((x) => x.id === id)!
    return { plain: playDivorce(c), stamped: withStamped(() => playDivorce(c)) }
  }

  it('opens a debt equal to the pinned remaining on a stamped life, and writes nothing on an unstamped one', () => {
    let owing = 0
    for (const c of DIVORCE_CASES) {
      const pin = pinnedRemaining(c.id)
      const { plain, stamped } = settled(c.id)
      expect(plain.remaining, `${c.id}: the scene still plays the pin`).toBe(pin)
      // unstamped: the pin, no edge, no sentence, no debt
      expect(openDebts(plain.game), `${c.id}: unstamped`).toBe(0)
      expect(readEdge(plain.game, playerRef(plain.game), personEntity(plain.ex)), `${c.id}: unstamped edge`).toBeNull()
      expect(plain.paragraphs.some((p) => p.startsWith('You still owe')), `${c.id}: unstamped sentence`).toBe(false)
      expect(socialOn(stamped.game)).toBe(true)
      if (pin !== null && pin > 0) {
        owing++
        const ego = playerRef(stamped.game)
        expect(dvOf(stamped.game, stamped.ex), c.id).toEqual([pin, 0, 2026, DEBT_KIND.divorce, 0])
        expect(debtsOf(stamped.game, ego), c.id).toEqual([{ key: keyOf(stamped.game, stamped.ex), owed: pin, owedBy: true, kind: DEBT_KIND.divorce }])
        expect(openDebts(stamped.game), c.id).toBe(1)
        expect(stamped.paragraphs, c.id).toContain(`You still owe ${stamped.ex.firstName} ${formatMoney(pin)}.`)
        expect(stamped.paragraphs.length, c.id).toBe(plain.paragraphs.length + 1)
        expect(edgeLocalBound(readEdge(stamped.game, ego, personEntity(stamped.ex))!), c.id).toBe(true)
      } else {
        expect(openDebts(stamped.game), c.id).toBe(0)
        expect(stamped.paragraphs, c.id).toEqual(plain.paragraphs)
      }
      expect(worldProblems(stamped.game), c.id).toEqual([])
      expectConserved(stamped.game)
    }
    // the six tuples and the second home with its mortgage owe something; the sale, the cash, the prenup and the rich ex do not
    expect(owing).toBe(7)
  })

  it('changes nothing else of the divorce: the order, the cash, the sale, the draws, the queue and the net worth are the unstamped ones', () => {
    for (const c of DIVORCE_CASES) {
      const { plain, stamped } = settled(c.id)
      expect(stamped.owed, c.id).toBe(plain.owed)
      expect(stamped.formula, c.id).toBe(plain.formula)
      expect(stamped.ex.money, c.id).toBe(plain.ex.money)
      expect(stamped.ex.relation, c.id).toBe('exSpouse')
      expect(stamped.game.character.money, c.id).toBe(plain.game.character.money)
      expect(stamped.game.assets.map((a) => a.id), c.id).toEqual(plain.game.assets.map((a) => a.id))
      expect(stamped.rows.length, c.id).toBe(plain.rows.length)
      stamped.rows.forEach((r, i) => {
        const p = plain.rows[i]!
        // the sentence is one more paragraph in the notice, so the count of paragraphs is the one number that moves
        const x = (row: { x?: Record<string, unknown> }): Record<string, unknown> => {
          const { paras: _paras, ...rest } = row.x ?? {}
          return rest
        }
        expect(x(r), `${c.id}/${r.label}`).toEqual(x(p))
        expect({ ...r, x: undefined }, `${c.id}/${r.label}`).toEqual({ ...p, x: undefined })
      })
    }
  })

  it('opens the debt for the other side too: when the ex files, the order is the same kind of debt', () => {
    const { stamped, plain } = settled('served-a')
    expect(stamped.remaining).toBe(plain.remaining)
    expect(dvOf(stamped.game, stamped.ex)).toEqual([plain.remaining, 0, 2026, DEBT_KIND.divorce, 0])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. openDivorceDebt

describe('openDivorceDebt', () => {
  it('writes the edge player > ex with a divorce record, moves no cash, draws nothing and changes no net worth', () => {
    const { g, ex } = world(250_000, 0, 'spouse')
    const ego = playerRef(g)
    const worth = netWorth(g)
    const books = booksOf(g)
    const next = g.nextId
    const flows = flowsOf(g, g.year).length
    trapRng(g)
    expect(openDivorceDebt(g, ex, 180_000)).toBe(true)
    expect(dvOf(g, ex)).toEqual([180_000, 0, g.year, DEBT_KIND.divorce, 0])
    expect(edgeLocalBound(readEdge(g, ego, personEntity(ex))!)).toBe(true)
    expect(debtsOf(g, ego)).toEqual([{ key: keyOf(g, ex), owed: 180_000, owedBy: true, kind: 1 }])
    expect(g.character.money).toBe(250_000)
    expect(ex.money).toBe(0)
    expect(netWorth(g)).toBe(worth)
    expect(driftSince(g, books)).toBe(0)
    expect(flowsOf(g, g.year).length).toBe(flows)
    expect(g.nextId).toBe(next)
    expect(openDebts(g)).toBe(1)
    expect(worldProblems(g)).toEqual([])
    expectConserved(g)
  })

  it('accepts a spouse (the divorce is still in progress), an exSpouse and an ex, and refuses every other relation, changing nothing', () => {
    const allowed: RelationKind[] = ['spouse', 'exSpouse', 'ex']
    const refused: RelationKind[] = [
      'parent', 'stepparent', 'sibling', 'halfSibling', 'stepsibling', 'grandparent', 'child', 'stepchild', 'grandchild', 'friend', 'bestFriend', 'enemy',
      'classmate', 'teacher', 'coworker', 'boss', 'partner', 'fiance', 'lover', 'cellmate', 'pet',
    ]
    for (const rel of allowed) {
      const { g, ex } = world(100_000, 0, rel)
      expect(openDivorceDebt(g, ex, 10_000), rel).toBe(true)
    }
    for (const rel of refused) {
      const { g, ex } = world(100_000, 0, rel)
      const before = snapshotOf(g)
      expect(openDivorceDebt(g, ex, 10_000), rel).toBe(false)
      expect(snapshotOf(g), rel).toBe(before)
    }
    expect(allowed.length + refused.length).toBe(24)
  })

  it('rounds a fractional order, cuts a huge one to a trillion and refuses a sum that is not a debt', () => {
    const a = world()
    expect(openDivorceDebt(a.g, a.ex, 1234.6)).toBe(true)
    expect(dvOf(a.g, a.ex)?.[0]).toBe(1235)
    const b = world()
    expect(openDivorceDebt(b.g, b.ex, 1e300)).toBe(true)
    expect(dvOf(b.g, b.ex)?.[0]).toBe(1e12)
    for (const owed of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, 0.4, -5, -1e12, '5' as unknown as number, null as unknown as number, undefined as unknown as number]) {
      const { g, ex } = world()
      const before = snapshotOf(g)
      expect(openDivorceDebt(g, ex, owed), String(owed)).toBe(false)
      expect(snapshotOf(g), String(owed)).toBe(before)
    }
  })

  it('adds a second order for the same ex to the first, as one debt that starts over, and refuses to cover a loan between the two', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 100_000, 2020, 30_000)
    g.year = 2026
    expect(openDivorceDebt(g, ex, 50_000)).toBe(true)
    // 70,000 still owed from the first order and 50,000 from the second; one debt, one slot, the clock restarts
    expect(dvOf(g, ex)).toEqual([120_000, 0, 2026, DEBT_KIND.divorce, 0])
    expect(openDebts(g)).toBe(1)

    const lend = world(100_000)
    expect(putEdge(lend.g, keyOf(lend.g, lend.ex) as never, { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2026, l: 2026, dv: [20_000, 8, 2025, DEBT_KIND.loan, 0] })).toBe(true)
    const before = snapshotOf(lend.g)
    expect(openDivorceDebt(lend.g, lend.ex, 50_000)).toBe(false)
    expect(snapshotOf(lend.g)).toBe(before)
  })

  it('refuses at the 40th debt and takes the 40th slot; a second order for the same ex needs no new slot', () => {
    const { g, ex } = world(100_000)
    const others = Array.from({ length: EDGE_CAPS.debts - 1 }, () => cast(g, 50, 'friend', { age: 30 }))
    others.forEach((p, i) => {
      expect(putEdge(g, keyOf(g, p) as never, { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2026, l: 2026, dv: [1_000 + i, 5, 2025, DEBT_KIND.loan, 0] }), `debt ${i}`).toBe(true)
    })
    expect(openDebts(g)).toBe(EDGE_CAPS.debts - 1)
    expect(openDivorceDebt(g, ex, 10_000)).toBe(true)
    expect(openDebts(g)).toBe(EDGE_CAPS.debts)
    const second = cast(g, 40, 'spouse', { age: 40 })
    const before = snapshotOf(g)
    expect(openDivorceDebt(g, second, 10_000)).toBe(false)
    expect(snapshotOf(g)).toBe(before)
    expect(openDivorceDebt(g, ex, 5_000)).toBe(true)
    expect(dvOf(g, ex)?.[0]).toBe(15_000)
    expect(openDebts(g)).toBe(EDGE_CAPS.debts)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. serveDivorceDebts

describe('serveDivorceDebts', () => {
  it('pays 20% of the cash to the ex in the first year, once, booked under divorce, and says it', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 300_000)
    const key = keyOf(g, ex)
    const books = booksOf(g)
    trapRng(g)
    serveDivorceDebts(g)
    expect(DIVORCE_SHARE).toBe(0.2)
    expect(g.character.money).toBe(80_000)
    expect(ex.money).toBe(20_000)
    expect(dvOf(g, ex)).toEqual([300_000, 0, 2026, DEBT_KIND.divorce, 20_000])
    expect(rows(g, 'divorce')).toBe(1)
    expect(tokenSeen(g, debtToken('divorce', 2026, key as never))).toBe(true)
    expect(debtToken('divorce', 2026, key as never).length).toBeLessThan(40)
    expect(driftSince(g, books)).toBe(0)
    expectConserved(g)
    expect(checkLedger(g).burn).toBe(0)
    expect(spoke(g, payLines(ex, 20_000))).toBe(1)
    // a debt is still a debt: the edge stays, bound, and the ledger never saw a mint
    expect(openDebts(g)).toBe(1)
  })

  it('pays nothing more on a second call in the same year, however the cash grew in between', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 300_000)
    serveDivorceDebts(g)
    const once = snapshotOf(g)
    serveDivorceDebts(g)
    expect(snapshotOf(g)).toBe(once)
    g.character.money += 500_000
    const grown = snapshotOf(g)
    serveDivorceDebts(g)
    expect(snapshotOf(g)).toBe(grown)
    expect(ex.money).toBe(20_000)
  })

  it('pays again each later year, 20% of the cash it finds, and does not repeat the sentence while the state is the same', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 300_000)
    serveDivorceDebts(g)
    g.year += 1
    g.character.money = 50_000
    serveDivorceDebts(g)
    expect(ex.money).toBe(20_000 + 10_000)
    expect(dvOf(g, ex)).toEqual([300_000, 0, 2026, DEBT_KIND.divorce, 30_000])
    expect(rows(g, 'divorce')).toBe(2)
    // 10% paid in the first year and 10% in the second: the same fifth, a year apart, so the second year stays quiet
    expect(texts(g).filter((t) => payLines(ex, 20_000).includes(t) || payLines(ex, 10_000).includes(t))).toHaveLength(1)
    expectConserved(g)
  })

  it('never pays more than is owed, closes the debt on the last payment and says so', () => {
    const { g, ex } = world(1_000_000)
    owe(g, ex, 5_000)
    serveDivorceDebts(g)
    expect(ex.money).toBe(5_000)
    expect(g.character.money).toBe(995_000)
    expect(dvOf(g, ex)).toBeUndefined()
    expect(openDebts(g)).toBe(0)
    expect(readEdge(g, playerRef(g), personEntity(ex))).not.toBeNull()
    expect(spoke(g, payLines(ex, 5_000))).toBe(1)
    g.year += 1
    const done = snapshotOf(g)
    serveDivorceDebts(g)
    expect(snapshotOf(g)).toBe(done)
    expectConserved(g)
  })

  it('never takes the cash below 0: a purse of a few dollars pays a dollar or nothing, a broke or hostile purse pays nothing', () => {
    for (const [cash, want] of [[9, 1], [5, 1], [4, 0], [3, 0], [0, 0], [-300, 0], [4.99, 0], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0]] as const) {
      const { g, ex } = world(0)
      owe(g, ex, 300_000)
      g.character.money = cash
      serveDivorceDebts(g)
      expect(ex.money, String(cash)).toBe(want)
      expect(Number.isNaN(cash) || g.character.money >= Math.min(0, cash), String(cash)).toBe(true)
      if (Number.isFinite(cash) && cash > 0) expect(g.character.money, String(cash)).toBe(cash - want)
      expect(dvOf(g, ex)?.[4], String(cash)).toBe(want)
    }
  })

  it('pays two exes oldest first, a fifth of the cash each, the second reading what the first left', () => {
    const { g, ex } = world(1_000_000)
    const second = cast(g, 30, 'exSpouse', { age: 40, money: 0, firstName: 'Mira' })
    owe(g, second, 500_000, 2025)
    owe(g, ex, 600_000, 2024)
    serveDivorceDebts(g)
    // Dana's debt is the older one: 20% of 1,000,000, then Mira's 20% of the 800,000 that is left
    expect(ex.money).toBe(200_000)
    expect(second.money).toBe(160_000)
    expect(g.character.money).toBe(640_000)
    // a second call in the year pays neither again
    const once = snapshotOf(g)
    serveDivorceDebts(g)
    expect(snapshotOf(g)).toBe(once)
    g.year += 1
    g.character.money = 100_000
    serveDivorceDebts(g)
    expect(ex.money).toBe(220_000)
    expect(second.money).toBe(176_000)
    expect(g.character.money).toBe(64_000)
    expectConserved(g)
  })

  it('does nothing for a player who is dead: the debt stays for the estate', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 300_000)
    g.character.alive = false
    const before = snapshotOf(g)
    serveDivorceDebts(g)
    expect(snapshotOf(g)).toBe(before)
  })

  it('serves only the divorce debts: a loan on the same player is left to the loan step', () => {
    const { g, ex } = world(100_000)
    const lender = cast(g, 60, 'friend', { age: 40, money: 0 })
    expect(putEdge(g, keyOf(g, lender) as never, { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2026, l: 2026, dv: [20_000, 8, 2025, DEBT_KIND.loan, 0] })).toBe(true)
    owe(g, ex, 300_000)
    serveDivorceDebts(g)
    expect(dvOf(g, lender)).toEqual([20_000, 8, 2025, DEBT_KIND.loan, 0])
    expect(lender.money).toBe(0)
    expect(ex.money).toBe(20_000)
  })

  it('is a function of the state alone: a clone gives the same state, and nothing is drawn', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 300_000)
    const twin = structuredClone(g)
    const trapped = trapRng(structuredClone(g))
    const rng = g.rng
    serveDivorceDebts(g)
    serveDivorceDebts(twin)
    expect(snapshotOf(twin)).toBe(snapshotOf(g))
    expect(g.rng).toBe(rng)
    // on a state whose roll throws when it is read or written, the step runs to the end
    expect(() => serveDivorceDebts(trapped)).not.toThrow()
    expect(trapped.character.money).toBe(80_000)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. The lapse

describe('the lapse', () => {
  it('lets the rest go after 10 years, with one line, no payment and no money moved', () => {
    const { g, ex } = world(0)
    owe(g, ex, 300_000, 2020)
    expect(DIVORCE_YEARS).toBe(10)
    for (let y = 2021; y <= 2029; y++) {
      g.year = y
      serveDivorceDebts(g)
      expect(dvOf(g, ex), String(y)).toEqual([300_000, 0, 2020, DEBT_KIND.divorce, 0])
    }
    expect(spoke(g, lapseLines(300_000))).toBe(0)
    const books = checkLedger(g)
    g.year = 2030
    serveDivorceDebts(g)
    expect(dvOf(g, ex)).toBeUndefined()
    expect(openDebts(g)).toBe(0)
    expect(spoke(g, lapseLines(300_000))).toBe(1)
    // no deposit was created, so nothing is written off
    expect(checkLedger(g).burn).toBe(books.burn)
    expect(checkLedger(g).mint).toBe(books.mint)
    expect(ex.money).toBe(0)
    expect(rows(g, 'divorce') + rows(g, 'writeoff')).toBe(0)
    // and only once
    g.year = 2031
    const after = snapshotOf(g)
    serveDivorceDebts(g)
    expect(spoke(g, lapseLines(300_000))).toBe(1)
    expect(snapshotOf(g)).toBe(after)
    expectConserved(g)
  })

  it('pays what the year allows first and lets only the rest go, in the tenth year', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 300_000, 2020)
    g.year = 2030
    serveDivorceDebts(g)
    expect(ex.money).toBe(20_000)
    expect(dvOf(g, ex)).toBeUndefined()
    expect(spoke(g, lapseLines(280_000))).toBe(1)
    expectConserved(g)
  })

  it('lets the debt go once when the ex dies, and the death is no payment', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 300_000)
    ex.alive = false
    serveDivorceDebts(g)
    expect(dvOf(g, ex)).toBeUndefined()
    expect(openDebts(g)).toBe(0)
    expect(ex.money).toBe(0)
    expect(g.character.money).toBe(100_000)
    expect(spoke(g, lapseLines(300_000))).toBe(1)
    const after = snapshotOf(g)
    serveDivorceDebts(g)
    expect(snapshotOf(g)).toBe(after)
    g.year += 1
    serveDivorceDebts(g)
    expect(spoke(g, lapseLines(300_000))).toBe(1)
    expectConserved(g)
  })

  it('lets the debt go once when the ex is gone from the game', () => {
    const { g, ex } = world(100_000)
    owe(g, ex, 300_000)
    g.people = g.people.filter((p) => p !== ex)
    serveDivorceDebts(g)
    expect(openDebts(g)).toBe(0)
    expect(spoke(g, lapseLines(300_000))).toBe(1)
    serveDivorceDebts(g)
    expect(spoke(g, lapseLines(300_000))).toBe(1)
    expect(g.character.money).toBe(100_000)
  })

  it('is settled by L6 when the player dies: the estate pays the rest first, the heir owes nothing, the books balance', () => {
    const g = socialGame(1, { age: 78, money: 1_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
    g.year = 2026
    g.log = [{ age: g.character.age, year: 2026, entries: [] }]
    const kids = [50, 47].map((age) => {
      const k = cast(g, 70, 'child', { age, money: 20_000, countryId: 'us', traits: ['kind', 'calm'] })
      k.yearsKnown = age
      return k
    })
    const ex = cast(g, 15, 'exSpouse', { age: 52, money: 0 })
    owe(g, ex, 400_000)
    const key = keyOf(g, ex)
    serveDivorceDebts(g)
    expect(ex.money).toBe(200_000)
    killCharacter(g, 'Old Age')
    g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
    const dead = g.character.id
    const n = continueAsChild(g, kids[0]!.id)
    // the estate paid the 200,000 that was left, under a token of its own, and the late player's debt edge is closed
    // (the ex is not a contact the heir keeps, so the account is where the 400,000 is)
    expect(acctOf(n, personEntity(ex))).toBe(400_000)
    expect(tokenSeen(n, debtToken('divorce', 2026, key as never))).toBe(true)
    expect(tokenSeen(n, debtToken('estate', 2026, key as never, dead))).toBe(true)
    expect(openDebts(n)).toBe(0)
    expect(debtsOf(n, `person:${dead}` as never)).toEqual([])
    // 800,000 in cash at the death, 200,000 of it to the ex, the rest in two
    expect(n.character.money).toBe(20_000 + (800_000 - 200_000) / 2)
    expectConserved(n)
    expect(worldProblems(n)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. Authorization inside the functions

describe('authorization inside the functions (design 14.1 invariant 4)', () => {
  /** The state of a call that must change nothing: the JSON of the game, the roll, the ids and the ledger rows. */
  const state = (g: GameState) => ({ json: snapshotOf(g), rng: g.rng, nextId: g.nextId, flows: JSON.stringify([...new Set([g.year - 1, g.year])].map((y) => flowsOf(g, y))) })

  function blocked(name: string, make: () => { g: GameState; ex: Person }): void {
    it(`${name}: openDivorceDebt answers false and serveDivorceDebts does nothing, and the game, the roll, the ids and the ledger are the same`, () => {
      const { g, ex } = make()
      const before = state(g)
      const debts = openDebts(g)
      expect(openDivorceDebt(g, ex, 50_000)).toBe(false)
      serveDivorceDebts(g)
      expect(state(g)).toEqual(before)
      expect(openDebts(g)).toBe(debts)
    })
  }

  blocked('an unstamped life', () => {
    const g = makeTestGame(1, { age: 45, money: 100_000 })
    const ex = cast(g, 40, 'spouse', { age: 44 })
    expect(socialOn(g)).toBe(false)
    return { g, ex }
  })
  blocked('an ex who is dead', () => {
    const { g, ex } = world()
    ex.alive = false
    return { g, ex }
  })
  blocked('a person who is no ex (a friend)', () => {
    const { g, ex } = world(100_000, 0, 'friend')
    return { g, ex }
  })
  blocked('a pet', () => {
    const { g, ex } = world(100_000, 0, 'pet')
    return { g, ex }
  })
  blocked('a person who is not in the game', () => {
    const { g, ex } = world()
    g.people = g.people.filter((p) => p !== ex)
    return { g, ex }
  })
  blocked('a player who is dead', () => {
    const { g, ex } = world()
    g.character.alive = false
    return { g, ex }
  })
  blocked('a full table of debts (40)', () => {
    const { g, ex } = world()
    for (let i = 0; i < EDGE_CAPS.debts; i++) {
      const p = cast(g, 50, 'friend', { age: 30 })
      putEdge(g, keyOf(g, p) as never, { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2026, l: 2026, dv: [1_000, 5, 2025, DEBT_KIND.loan, 0] })
    }
    expect(openDebts(g)).toBe(EDGE_CAPS.debts)
    // the 40 loans are not served here (E10b's step does that), so the table stays as it is
    return { g, ex }
  })

  it('serveDivorceDebts leaves a divorce debt of an unstamped life alone, and the same record on a stamped life is served', () => {
    const g = makeTestGame(1, { age: 45, money: 100_000 })
    const ex = cast(g, 40, 'exSpouse', { age: 44 })
    expect(putEdge(g, keyOf(g, ex) as never, { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2026, l: 2026, dv: [50_000, 0, 2025, DEBT_KIND.divorce, 0] })).toBe(true)
    const before = state(g)
    serveDivorceDebts(g)
    expect(state(g)).toEqual(before)
    expect(ex.money).toBe(0)
    stampSocial(g)
    serveDivorceDebts(g)
    expect(ex.money).toBe(20_000)
  })

  it('reads the person from the game, not from the copy it is given: a copy that says alive of an ex who is dead is refused', () => {
    const { g, ex } = world()
    ex.alive = false
    const copy = { ...ex, data: { ...ex.data }, alive: true }
    const before = state(g)
    expect(openDivorceDebt(g, copy as Person, 50_000)).toBe(false)
    expect(state(g)).toEqual(before)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 7. Survival, hostile records and 100x

describe('a living exSpouse and the people list', () => {
  function build(seed: number): { g: GameState; ex: Person } {
    const g = socialGame(seed, { age: 45, money: 100_000 })
    for (let i = 0; i < 25; i++) cast(g, 20 + i, 'ex', { age: 30 })
    const ex = cast(g, 40, 'exSpouse', { age: 30, money: 0 })
    owe(g, ex, 80_000)
    return { g, ex }
  }

  it('survives cleanupPeople with 25 other exes around while the debt stands (nothing is needed from E14)', () => {
    const seed = findSeed(
      (s) => {
        const { g, ex } = build(s)
        for (let i = 0; i < 3; i++) {
          yearlyRelationships(g)
          g.queue = []
        }
        return ex.alive
      },
      { label: 'an exSpouse of thirty who lives through three years of the family step', tries: 60 },
    )
    const { g, ex } = build(seed)
    for (let i = 0; i < 3; i++) {
      yearlyRelationships(g)
      g.queue = []
    }
    // the step really cleaned up: the live exes are cut to 20; the exSpouse is still a Person with her debt
    expect(g.people.filter((p) => p.relation === 'ex' && p.alive).length).toBeLessThanOrEqual(20)
    expect(g.people).toContain(ex)
    expect(dvOf(g, ex)).toEqual([80_000, 0, 2026, DEBT_KIND.divorce, 0])
    expect(worldProblems(g)).toEqual([])
    serveDivorceDebts(g)
    expect(ex.money).toBeGreaterThan(0)
  })
})

describe('hostile records', () => {
  it('reads a hostile divorce record as no debt at all: nothing is paid, nothing throws, the books balance', () => {
    const raws: unknown[] = [
      [Number.NaN, 0, 2020, 1, 0],
      'junk',
      [1e300, 0, 2020, 1, 0],
      [-5, 0, 2020, 1, 0],
      [10, 0, 2020, 99, 0],
      [],
      { a: 1 },
      [5, 0, 2020, 1, 9],
      [50_000, 0, 2020],
      [50_000, 0, 2020, 1, Number.NaN],
      [50_000, 0, 1.5, 1, 0],
    ]
    const { g } = world(300_000)
    const hostile = { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2026, l: 2026 }
    const edges: Record<string, unknown> = {}
    for (const dv of raws) {
      const p = cast(g, 40, 'exSpouse', { age: 40, money: 0 })
      edges[`${playerRef(g)}>${personEntity(p)}`] = { ...hostile, dv }
    }
    g.world = { ...(g.world ?? {}), edges } as never
    const cash = g.character.money
    expect(() => serveDivorceDebts(g)).not.toThrow()
    expect(rows(g, 'divorce')).toBe(0)
    expect(g.character.money).toBe(cash)
    expectConserved(g)
  })
})

describe('the sums at the ends', () => {
  /** The order of the settlement formula for a house of `value` (the kit's formula), the cash and the debt after the divorce, on a stamped scene. */
  function settle(value: number, cash: number) {
    const s = scene([11, 2026], { character: { age: 45, money: cash }, cast: [{ key: 'ex', relation: 'spouse', age: 44, relationship: 40, money: 0 }], stamped: true })
    const g = s.g
    const ex = s.who.ex!
    g.assets.push(house('home', value))
    g.character.residence = { status: 'owned', assetId: 'home' }
    bindMoneyContext(null)
    const worth = Math.max(0, netWorth(g))
    const draw = nextRandom(g.rng)[0]
    const formula = Math.round((worth / 2) * (0.5 + draw * 0.5))
    divorce(g, ex, 'player')
    return { g, ex, formula, owed: dvOf(g, ex)?.[0] ?? 0, cashLeft: g.character.money }
  }

  it('scales the order by the settlement formula at a net worth 100 times as big, and the payments stay at 20% of the cash', () => {
    const small = settle(3_000_000, 20_000)
    const big = settle(300_000_000, 20_000)
    // the order is the formula, less the cash and the ex's share of any sale: the same cash, a hundred times the house
    expect(small.owed).toBe(small.formula - 20_000)
    expect(big.owed).toBe(big.formula - 20_000)
    expect(big.formula / small.formula).toBeGreaterThan(98)
    expect(big.formula / small.formula).toBeLessThan(101)
    for (const c of [small, big]) {
      c.g.character.money = 1_000_000
      serveDivorceDebts(c.g)
      expect(c.ex.money).toBe(20_000 + 200_000)
      expect(c.g.character.money).toBe(800_000)
      expect(dvOf(c.g, c.ex)?.[4]).toBe(200_000)
      expectConserved(c.g)
    }
    // a hundred times the cash pays a hundred times the dollars: 20% of what there is, no more
    const rich = settle(300_000_000, 20_000)
    rich.g.character.money = 100_000_000
    serveDivorceDebts(rich.g)
    expect(rich.g.character.money).toBe(80_000_000)
    expect(dvOf(rich.g, rich.ex)?.[4]).toBe(20_000_000)
  })

  it('pays a debt of a trillion at the same 20% of the cash, never passes it, and lets it go at 10 years like any other', () => {
    for (const owed of [10_000_000_000, 1_000_000_000_000, 1e300]) {
      const { g, ex } = world(1_000_000_000)
      g.year = 2020
      expect(openDivorceDebt(g, ex, owed)).toBe(true)
      let paid = 0
      for (let y = 2021; y <= 2031; y++) {
        g.year = y
        const cash = g.character.money
        serveDivorceDebts(g)
        const dv = dvOf(g, ex)
        if (y < 2030) {
          expect(g.character.money, `${owed}/${y}`).toBe(cash - Math.floor(0.2 * cash))
          paid += Math.floor(0.2 * cash)
          expect(dv?.[4], `${owed}/${y}`).toBe(paid)
        }
        expect(paid).toBeLessThanOrEqual(1e12)
        g.character.money = 1_000_000_000
      }
      expect(dvOf(g, ex), String(owed)).toBeUndefined()
      expect(ex.money).toBeLessThanOrEqual(1e12)
      expectConserved(g)
    }
  })

  it('serves 40 debts a fifth of the cash each, never takes the cash below 0, and the table never passes 40', () => {
    const { g } = world(1_000_000)
    const exes = Array.from({ length: EDGE_CAPS.debts }, () => cast(g, 30, 'exSpouse', { age: 40, money: 0 }))
    g.year = 2040
    for (const p of exes) expect(openDivorceDebt(g, p, 1_000_000_000)).toBe(true)
    g.year = 2045
    expect(openDebts(g)).toBe(EDGE_CAPS.debts)
    const extra = cast(g, 40, 'spouse', { age: 40 })
    expect(openDivorceDebt(g, extra, 1_000)).toBe(false)
    serveDivorceDebts(g)
    let left = 1_000_000
    for (let i = 0; i < EDGE_CAPS.debts; i++) left -= Math.floor(0.2 * left)
    expect(g.character.money).toBe(left)
    expect(g.character.money).toBeGreaterThanOrEqual(0)
    expect(exes.reduce((sum, p) => sum + p.money, 0)).toBe(1_000_000 - left)
    expectConserved(g)
    // the same year again pays nothing
    const once = snapshotOf(g)
    serveDivorceDebts(g)
    expect(snapshotOf(g)).toBe(once)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 8. The real path

describe('the yearly seam', () => {
  it('five years of ageUp on an unstamped life are the same with the module and without it', () => {
    const a = makeTestGame(3, { age: 40, money: 200_000 })
    cast(a, 50, 'spouse', { age: 40, money: 0 })
    const b = structuredClone(a)
    for (let i = 0; i < 5; i++) {
      ageUp(a)
      a.queue = []
    }
    const without = yearlyEntries('aging').filter((e) => e.id !== 'life.debts')
    withYearly('aging', without, () => {
      for (let i = 0; i < 5; i++) {
        ageUp(b)
        b.queue = []
      }
    })
    expect(snapshotOf(b)).toBe(snapshotOf(a))
    expect(openDebts(a)).toBe(0)
  }, 120_000)

  it('pays inside ageUp, after the year`s income and tax and before the family and the heirs, from the cash the entry finds', () => {
    const play = (seed: number) => {
      const g = socialGame(seed, { age: 45, money: 5_000_000 })
      const ex = cast(g, 40, 'exSpouse', { age: 40, money: 0 })
      owe(g, ex, 3_000_000)
      let cash = -1
      const spy = yearlyEntries('aging').map((e) =>
        e.id === 'life.debts'
          ? {
              ...e,
              run: (gg: GameState) => {
                cash = gg.character.money
                e.run(gg)
              },
            }
          : e,
      )
      withYearly('aging', spy, () => ageUp(g))
      g.queue = []
      return { g, ex, cash }
    }
    const seed = findSeed(
      (s) => {
        const r = play(s)
        return r.g.character.alive && r.ex.alive && r.cash > 0
      },
      { label: 'a player of 45 and an ex of 40 who both live through the year', tries: 60 },
    )
    const { g, ex, cash } = play(seed)
    const paid = Math.floor(0.2 * cash)
    expect(cash).toBeGreaterThan(1_000_000)
    expect(dvOf(g, ex)?.[4]).toBe(paid)
    // the ex may have earned money of their own this year; what the debt paid is in their purse
    expect(ex.money).toBeGreaterThanOrEqual(paid)
    expect(rows(g, 'divorce')).toBe(1)
    // the lines carry the module as their source, so the year view files them under People
    const mine = g.log.flatMap((y) => y.entries).filter((e) => payLines(ex, paid).includes(e.text))
    expect(mine).toHaveLength(1)
    expect(mine[0]!.s).toBe('life.debts')
    expectConserved(g)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------
// 9. The words and the source

describe('the sentences and the source', () => {
  it('tells the payment and the lapse in short sentences with no long dash, for any sum', () => {
    for (const money of [0, 1, 20_000, 1e9, 1e12, 1e15]) {
      for (const line of [...STATE_TABLE['divorce.pay'].variants.map((v) => fillSlots(v, { who: 'my ex Dana', money: formatMoney(money) })), ...lapseLines(money)]) {
        expect(line.length).toBeLessThanOrEqual(90 + 30)
        expect(DASH.test(line)).toBe(false)
        expect(line.trim()).toBe(line)
        expect(line).not.toMatch(/\{|\}/)
      }
    }
    expect(STATE_TABLE['divorce.pay'].every).toBe(4)
    for (const x of [0, 0.19, 0.2, 0.39, 0.4, 0.6, 0.8, 1, 5]) expect(STATE_TABLE['divorce.pay'].band(x)).toBe(Math.min(5, Math.floor((x + 1e-9) / 0.2)))
  })

  it('keeps its source rules: no long dash, no luck, no money written outside the ledger, no sid, no events or society files but the door', () => {
    const text = read('src/game/divorce-debt.ts')
    const code = text.replace(/\/\/.*$/gm, '')
    expect(DASH.test(text)).toBe(false)
    expect(/from '\.\/rng'|g\.rng|\brand(Int|Float)?\(|\bchance\(|\bweightedPick\(|Math\.random/.test(code)).toBe(false)
    expect(/\.money\s*(\+|-)?=[^=]/.test(code)).toBe(false)
    expect(/\b(addMoney|spend|earnIncome|bookMint|bookBurn)\(/.test(code)).toBe(false)
    expect(/\bsid:\s*[^\s,}]/.test(code)).toBe(false)
    const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
    expect(imports.filter((i) => /^\.\/(events|business|society)\//.test(i) && i !== './society/contract')).toEqual([])
    expect(imports).toContain('./society/contract')
    // love.ts calls it from the divorce, behind the stamp, and the module is the only other caller
    const love = read('src/game/love.ts')
    expect(love).toContain('openDivorceDebt(')
    expect(love).toMatch(/socialOn\(g\)/)
  })

  it('is named in docs/KIN.md, docs/KERNEL.md and docs/LEDGER.md, with no long dash', () => {
    const kin = read('docs/KIN.md')
    for (const word of ['openDivorceDebt', 'serveDivorceDebts', 'life.debts', 'DIVORCE_LAPSE', 'divorce.pay']) expect(kin).toContain(word)
    expect(read('docs/KERNEL.md')).toMatch(/\| `money` \|[^\n]*wealth 70, life\.debts 75, familyUse 80/)
    expect(/\| `divorce` \|[^\n]*R4-L7/.test(read('docs/LEDGER.md'))).toBe(true)
    for (const f of ['docs/KIN.md', 'docs/KERNEL.md', 'docs/LEDGER.md']) expect(DASH.test(read(f)), f).toBe(false)
  })
})

// a frozen game is never written by a read of the table: debtsOf is pure under deepFreeze (the reads this task relies on)
describe('the reads it relies on', () => {
  it('lists the divorce debt of a frozen game and draws nothing', () => {
    const { g, ex } = world()
    owe(g, ex, 40_000)
    const frozen = deepFreeze(trapRng(structuredClone(g)))
    expect(debtsOf(frozen, playerRef(frozen))).toEqual([{ key: keyOf(g, ex), owed: 40_000, owedBy: true, kind: 1 }])
  })
})
