// R4-E10b (D.4, X24, X26, X40, X54, C9, C37, C39): loans between people and the debt record. A person lends the player money (a
// SocialAct, society/loan.ts), the debt lives on `Edge.dv` of the edge player > lender (society/debt.ts), and a yearly step of the one
// `society.acts` entry services it. What the file proves, in the order of the plan:
//
//   1. The loan: the principal moves from the lender to the player once, through cash.moveCash under `support` (the books balance, no
//      mint and no burn), a second call in the year books nothing; the cap is min(25% of the lender's cash, 2 x typicalIncome) and the
//      typical income is the one of the P7 leaf, reached through society/seam.ts; the rate is the lender's traits' (ordinary 5 to 10%,
//      sneaky, manipulative or stingy 25 to 60%).
//   2. The debt record: `readDv` reads a hostile record as none, `debtsOf` lists oldest first with the direction, `debtToken` is short
//      and keeps its year, two long keys get two tokens, `serviceDebt` pays what it is asked up to what is owed, once per token.
//   3. The yearly step: interest on what is still owed for as many years as keep the debt at 3 x the principal or less (a shark's
//      40 years of default never pass it), 20% of the cash above a reserve, a missed year, the status row, the payoff.
//   4. `A Lender Calls`: a choice for a sharp lender and a missed year, one of the year's three family choices, not deferrable.
//   5. The menu rows, purity under deepFreeze, the files of society/, and 100 x probes of every growth term.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ageUp } from '../src/game/aging'
import { getPerson } from '../src/game/core'
import { withFlags } from '../src/game/flags'
import { createNewLife } from '../src/game/life'
import { DEFERRABLE_SCRIPTS } from '../src/game/hubs/year-close'
import { checkLedger, tokenSeen } from '../src/game/kernel/ledger'
import { personEntity } from '../src/game/kernel/person-ref'
import { runScript } from '../src/game/scripts'
import { actRoll } from '../src/game/society/acts'
import { ACT_KEY } from '../src/game/society/budget'
import { DEBT_KIND as DOOR_DEBT_KIND, debtToken as doorDebtToken, debtsOf as doorDebtsOf, serviceDebt as doorServiceDebt } from '../src/game/society/contract'
import {
  DEBT_KIND,
  INTEREST_CEILING,
  LENDER_SCRIPT,
  SERVICE_SHARE,
  accrualYears,
  accrue,
  debtToken,
  debtsOf,
  dueOf,
  readDv,
  reserveOf,
  serviceDebt,
  serviceDebts,
} from '../src/game/society/debt'
import { LOAN_MIN, LOAN_OPEN_MAX, askLoan, debtTo, dv, lend, loanAct, loanTerms, openLoans } from '../src/game/society/loan'
import { socialNodes } from '../src/game/society/menu'
import { yearlyActs } from '../src/game/society/module'
import { typicalIncome } from '../src/game/society/seam'
import { typicalIncome as leafTypicalIncome } from '../src/game/world/typical-income'
import { EDGE_CAPS } from '../src/game/world/caps'
import { memoriesOf, openDebts, readEdge, type Edge } from '../src/game/world/edges'
import { putEdge } from '../src/game/world/edge-write'
import { playerRef } from '../src/game/world/people'
import { worldProblems } from '../src/game/world/invariants'
import { readSocial, socialOn } from '../src/game/world/social'
import type { ChoiceModal, GameState, MenuAction, Person } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { booksOf, driftSince, expectConserved, acctOf } from './ledger-kit'
import { findSeed } from './seed-kit'
import { cast, socialGame } from './social-kit'
import { trapRng } from './social-parity-kit'

const ROOT = resolve(__dirname, '..')
const src = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8')

// ---------------------------------------------------------------------------------------------------------------------
// Helpers

/** A stamped adult with cash and one lender friend who is rich. */
function world(over: { cash?: number; lenderCash?: number; traits?: string[] } = {}): { g: GameState; lender: Person } {
  const g = socialGame(1, { age: 30, money: over.cash ?? 100_000 })
  const lender = cast(g, 70, 'friend', { money: over.lenderCash ?? 1_000_000, traits: over.traits ?? ['kind', 'calm'] })
  return { g, lender }
}

const SHARP = ['sneaky', 'calm']
const debtKeyOf = (g: GameState, p: Person): string => `${playerRef(g)}>${personEntity(p)}`
const debtOf = (g: GameState, p: Person): Edge['dv'] => readEdge(g, playerRef(g), personEntity(p))?.dv

/** The next close: the year is one more and the entry of the acts runs. */
function nextYear(g: GameState): void {
  g.year += 1
  yearlyActs(g)
}

/** A loan of `amount` from `lender`, taken the way the engine takes it (no roll). */
function borrow(g: GameState, lender: Person, amount = 10_000): void {
  expect(lend(g, lender, amount)).toBe(true)
}

/** A lifeId whose stream `social` gives this ask a yes (or a no) in the year. */
function lifeWhere(ask: (lifeId: string) => boolean): string {
  for (let i = 1; i < 400; i++) if (ask(`life-${i}`)) return `life-${i}`
  throw new Error('no life found')
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. The loan

describe('a loan', () => {
  it('moves the same dollars out of the lender and into the player, once, with the books balanced and no mint or burn', () => {
    const { g, lender } = world()
    const key = debtKeyOf(g, lender)
    const you = g.character.money
    const them = lender.money
    const before = booksOf(g)
    const ledger = checkLedger(g)
    expect(lend(g, lender, 20_000)).toBe(true)
    expect(g.character.money).toBe(you + 20_000)
    expect(lender.money).toBe(them - 20_000)
    expect(driftSince(g, before)).toBe(0)
    expectConserved(g)
    expect(checkLedger(g).mint).toBe(ledger.mint)
    expect(checkLedger(g).burn).toBe(ledger.burn)
    expect(acctOf(g, playerRef(g))).toBe(20_000)
    expect(acctOf(g, personEntity(lender))).toBe(-20_000)
    expect(tokenSeen(g, debtToken('loan', g.year, key))).toBe(true)
    const rate = loanTerms(g, lender).rate
    expect(debtOf(g, lender)).toEqual([20_000, rate, g.year, 0, 0])
    // a second call in the year books nothing, and neither does the replay of the one token
    expect(lend(g, lender, 5_000)).toBe(false)
    expect(g.character.money).toBe(you + 20_000)
    expect(lender.money).toBe(them - 20_000)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('writes the call-in, the memory and the log line, and warms the bond', () => {
    const { g, lender } = world()
    borrow(g, lender)
    const e = readEdge(g, personEntity(lender), playerRef(g))!
    expect(e.c).toBe(g.year)
    expect(lender.relationship).toBeGreaterThan(70)
    const mine = readEdge(g, playerRef(g), personEntity(lender))!
    expect(memoriesOf(mine).map((m) => m.kind)).toContain('loan_given')
    const text = g.log.at(-1)!.entries.map((l) => l.text).join('|')
    expect(text).toContain(lender.firstName)
    expect(text).toMatch(/\$/)
  })

  it('takes its cap from the typical income of the P7 leaf: the lesser of 25% of the lender\'s cash and 2 x typicalIncome', () => {
    expect(typicalIncome).toBe(leafTypicalIncome)
    const rich = world({ lenderCash: 1e9 })
    const income = leafTypicalIncome(rich.g)
    expect(loanTerms(rich.g, rich.lender).cap).toBe(2 * income)
    expect(lend(rich.g, rich.lender, 2 * income + 1)).toBe(false)
    expect(lend(rich.g, rich.lender, 2 * income)).toBe(true)
    const poor = world({ lenderCash: 100_000 })
    expect(loanTerms(poor.g, poor.lender).cap).toBe(Math.min(25_000, 2 * leafTypicalIncome(poor.g)))
    expect(lend(poor.g, poor.lender, loanTerms(poor.g, poor.lender).cap + 1)).toBe(false)
    expect(src('src/game/society/seam.ts')).toContain("export { typicalIncome } from '../world/typical-income'")
  })

  it('refuses a lender with nothing to spare, an amount under the least or over the cap, and anything that is not a number', () => {
    const { g, lender } = world({ lenderCash: 100 })
    expect(lend(g, lender, 50)).toBe(false)
    const rich = world()
    for (const bad of [Number.NaN, -1, 0, 1, LOAN_MIN - 1, Number.POSITIVE_INFINITY, 1e300]) expect(lend(rich.g, rich.lender, bad), String(bad)).toBe(false)
    expect(openDebts(rich.g)).toBe(0)
    expect(rich.g.character.money).toBe(100_000)
  })

  it('takes the rate from the lender\'s traits: 5 to 10% for an ordinary lender, 25 to 60% for a sneaky, manipulative or stingy one', () => {
    const g = socialGame(1, { age: 30 })
    for (let i = 0; i < 30; i++) {
      const ordinary = cast(g, 70, 'friend', { money: 1e6, traits: ['kind', 'generous'] })
      const rate = loanTerms(g, ordinary).rate
      expect(rate, `ordinary ${i}`).toBeGreaterThanOrEqual(5)
      expect(rate).toBeLessThanOrEqual(10)
      expect(Number.isInteger(rate)).toBe(true)
      expect(loanTerms(g, ordinary).sharp).toBe(false)
    }
    const rates = new Set<number>()
    for (const trait of ['sneaky', 'manipulative', 'stingy']) {
      for (let i = 0; i < 10; i++) {
        const shark = cast(g, 70, 'friend', { money: 1e6, traits: [trait, 'calm'] })
        const t = loanTerms(g, shark)
        expect(t.sharp, trait).toBe(true)
        expect(t.rate).toBeGreaterThanOrEqual(25)
        expect(t.rate).toBeLessThanOrEqual(60)
        rates.add(t.rate)
      }
    }
    expect(rates.size).toBeGreaterThan(5)
    // the same person gives the same terms twice
    const p = cast(g, 70, 'friend', { money: 1e6 })
    expect(loanTerms(g, p)).toEqual(loanTerms(g, p))
  })

  it('is asked with a roll from the stream `social`: a yes writes the debt, a no costs a point and the call-in, and nothing touches g.rng', () => {
    const asked = (id: string): boolean => {
      const { g, lender } = world()
      g.lifeId = id
      return actRoll(g, 'loan.ask', `${personEntity(lender)}>${playerRef(g)}`)() < loanTerms(g, lender).odds
    }
    const yes = lifeWhere((id) => asked(id))
    const no = lifeWhere((id) => !asked(id))
    const a = world()
    a.g.lifeId = yes
    const rng = a.g.rng
    const id = a.g.nextId
    expect(askLoan(a.g, a.lender, 10_000)).not.toBeNull()
    expect(debtOf(a.g, a.lender)![0]).toBe(10_000)
    expect(a.g.rng).toBe(rng)
    const b = world()
    b.g.lifeId = no
    const was = b.lender.relationship
    expect(askLoan(b.g, b.lender, 10_000)).not.toBeNull()
    expect(debtOf(b.g, b.lender)).toBeUndefined()
    expect(b.g.character.money).toBe(100_000)
    expect(b.lender.relationship).toBe(was - 1)
    expect(readEdge(b.g, personEntity(b.lender), playerRef(b.g))!.c).toBe(b.g.year)
    expect(a.g.nextId).toBeGreaterThanOrEqual(id)
  })

  it('is limited to three open loans and to one a lender', () => {
    expect(LOAN_OPEN_MAX).toBe(3)
    const g = socialGame(1, { age: 30, money: 100_000 })
    const lenders = [0, 1, 2, 3].map(() => cast(g, 70, 'friend', { money: 1e6 }))
    for (const p of lenders.slice(0, 3)) borrow(g, p, 5_000)
    expect(openLoans(g)).toBe(3)
    expect(lend(g, lenders[3]!, 5_000)).toBe(false)
    expect(lend(g, lenders[0]!, 5_000)).toBe(false)
    expect(debtTo(g, lenders[0]!)).not.toBeNull()
    expect(debtTo(g, lenders[3]!)).toBeNull()
    // the call-in cooldown is not what stops it: three years on, the lender who is owed is still owed
    g.year += 4
    expect(lend(g, lenders[0]!, 5_000)).toBe(false)
    expect(lend(g, lenders[3]!, 5_000)).toBe(false)
    putEdge(g, debtKeyOf(g, lenders[1]!), { dv: undefined })
    expect(openLoans(g)).toBe(2)
    expect(lend(g, lenders[3]!, 5_000)).toBe(true)
    expect(lend(g, lenders[1]!, 5_000)).toBe(false)
  })

  it('is refused to a lender the player still owes, three years on, and open again once the debt is paid', () => {
    const { g, lender } = world()
    borrow(g, lender, 5_000)
    g.year += 4
    expect(lend(g, lender, 5_000)).toBe(false)
    expect(askLoan(g, lender, 5_000)).toBeNull()
    expect(putEdge(g, debtKeyOf(g, lender), { dv: undefined })).toBe(true)
    expect(lend(g, lender, 5_000)).toBe(true)
  })

  it('is refused when the table of debts is full (40) and writes nothing', () => {
    const { g, lender } = world()
    for (let i = 0; i < EDGE_CAPS.debts; i++) expect(putEdge(g, `person:d${i}>person:e${i}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, dv: [100, 0, g.year - 1, 1, 0] })).toBe(true)
    const before = JSON.stringify(g)
    expect(lend(g, lender, 5_000)).toBe(false)
    expect(JSON.stringify(g)).toBe(before)
    // the edge of a loan that was paid is still there: the new debt has no slot, so the money does not move either
    expect(putEdge(g, debtKeyOf(g, lender), { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year - 9, l: g.year - 9 })).toBe(true)
    const old = JSON.stringify(g)
    expect(lend(g, lender, 5_000)).toBe(false)
    expect(JSON.stringify(g)).toBe(old)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. The record

describe('the debt record', () => {
  it('reads a hostile dv as none: NaN, a negative, 1e300, a wrong length, a rate over 60, a kind over 9, text', () => {
    const ok: Edge['dv'] = [1_000, 8, 2025, 0, 100]
    expect(readDv({ dv: ok })).toEqual({ owed: 1_000, rate: 8, since: 2025, kind: 0, paid: 100 })
    const bad: unknown[] = [
      [Number.NaN, 8, 2025, 0, 0],
      [-1, 8, 2025, 0, 0],
      [1e300, 8, 2025, 0, 0],
      [1_000, 8, 2025, 0, 1e300],
      [1_000, 8, 2025, 0, -5],
      [1_000, 61, 2025, 0, 0],
      [1_000, -1, 2025, 0, 0],
      [1_000, 8, 2025.5, 0, 0],
      [1_000, 8, 2025, 10, 0],
      [1_000, 8, 2025],
      [1_000, 8, 2025, 0, 0, 0],
      ['1000', 8, 2025, 0, 0],
      null,
      'dv',
    ]
    for (const raw of bad) expect(readDv({ dv: raw }), JSON.stringify(raw)).toBeNull()
    expect(readDv(null)).toBeNull()
    expect(readDv(undefined)).toBeNull()
    expect(readDv({})).toBeNull()
    expect(readDv({ dv: Object.create({ dv: ok }) as unknown })).toBeNull()
  })

  it('reads a hostile map as no debt at all: debtsOf lists none, serviceDebt pays nothing, the yearly step changes nothing', () => {
    const { g, lender } = world()
    const key = debtKeyOf(g, lender)
    const hostile = { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year }
    for (const raw of [[Number.NaN, 8, 2020, 0, 0], [-5, 8, 2020, 0, 0], [1e300, 8, 2020, 0, 0]]) {
      g.world = { ...(g.world ?? {}), edges: { [key]: { ...hostile, dv: raw } } } as never
      expect(debtsOf(g, playerRef(g))).toEqual([])
      expect(serviceDebt(g, key, 1_000, 'x:1:00000000')).toBe(0)
      const before = JSON.stringify(g)
      g.year += 1
      expect(() => serviceDebts(g)).not.toThrow()
      g.year -= 1
      expect(JSON.stringify(g)).toBe(before)
    }
  })

  it('lists the debts of the ego oldest first, with the direction and the kind', () => {
    const { g, lender } = world()
    const [b, c, d] = [1, 2, 3].map(() => cast(g, 70, 'friend', { money: 1e6 })) as [Person, Person, Person]
    const e = (over: Partial<Edge>): Edge => ({ t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, ...over })
    const ego = playerRef(g)
    expect(putEdge(g, `${ego}>${personEntity(lender)}`, e({ dv: [9_000, 8, 2022, 0, 1_000] }))).toBe(true)
    expect(putEdge(g, `${ego}>${personEntity(b)}`, e({ dv: [4_000, 0, 2019, 1, 0] }))).toBe(true)
    expect(putEdge(g, `${personEntity(c)}>${ego}`, e({ dv: [2_500, 0, 2020, 0, 0] }))).toBe(true)
    expect(putEdge(g, `${personEntity(d)}>person:other`, e({ dv: [700, 0, 2018, 0, 0] }))).toBe(true)
    const rows = debtsOf(g, ego)
    expect(rows.map((r) => r.key)).toEqual([`${ego}>${personEntity(b)}`, `${personEntity(c)}>${ego}`, `${ego}>${personEntity(lender)}`])
    expect(rows.map((r) => r.owedBy)).toEqual([true, false, true])
    expect(rows.map((r) => r.kind)).toEqual([1, 0, 0])
    expect(rows.map((r) => r.owed)).toEqual([4_000, 2_500, 8_000])
    expect(DEBT_KIND).toEqual({ loan: 0, divorce: 1 })
    expect(Object.isFrozen(DEBT_KIND)).toBe(true)
    // the door is the same functions
    expect(doorDebtsOf).toBe(debtsOf)
    expect(doorServiceDebt).toBe(serviceDebt)
    expect(doorDebtToken).toBe(debtToken)
    expect(DOOR_DEBT_KIND).toBe(DEBT_KIND)
  })

  it('makes a token of `<kind>:<year>:<8 hex>`, under 40 characters, that keeps its year and tells two long keys apart', () => {
    const a = `person:${'s'.repeat(39)}1>person:p1`
    const t = debtToken('debt', 2031, a)
    expect(t).toMatch(/^debt:2031:[0-9a-f]{8}$/)
    expect(debtToken('divorce', 2031, a).length).toBeLessThan(40)
    expect(debtToken('estate', 999_999, a, 'p77').length).toBeLessThan(40)
    expect(debtToken('loan', 2031, a)).not.toBe(debtToken('debt', 2031, a))
    expect(debtToken('debt', 2031, a, 'p77')).not.toBe(t)
    expect(debtToken('debt', 2031, a)).toBe(t)
    for (const y of [Number.NaN, -5, 1e300]) expect(debtToken('debt', y, a).length).toBeLessThan(40)
  })

  it('gives two debts whose keys are two 40-character sids that differ in the last characters two tokens in each of three years, and each year\'s service books once', () => {
    const g = socialGame(1, { age: 30, money: 0 })
    const sidA = `${'a'.repeat(37)}001`
    const sidB = `${'a'.repeat(37)}002`
    const [x, y] = [sidA, sidB].map((sid) => cast(g, 70, 'friend', { money: 1e6, data: { sid } })) as [Person, Person]
    expect(personEntity(x)).toBe(`person:${sidA}`)
    expect(`${playerRef(g)}>${personEntity(x)}`.length).toBeGreaterThan(55)
    borrow(g, x, 30_000)
    g.year += 1
    borrow(g, y, 30_000)
    const tokens = new Set<string>()
    for (let i = 0; i < 3; i++) {
      nextYear(g)
      const ka = debtKeyOf(g, x)
      const kb = debtKeyOf(g, y)
      const ta = debtToken('debt', g.year, ka)
      const tb = debtToken('debt', g.year, kb)
      expect(ta).not.toBe(tb)
      tokens.add(ta)
      tokens.add(tb)
      expect(tokenSeen(g, ta)).toBe(true)
      expect(tokenSeen(g, tb)).toBe(true)
      expect(debtOf(g, x)).toBeDefined()
      expect(debtOf(g, y)).toBeDefined()
      const cash = g.character.money
      const paid = [debtOf(g, x)![4], debtOf(g, y)![4]]
      serviceDebts(g)
      yearlyActs(g)
      expect(g.character.money).toBe(cash)
      expect([debtOf(g, x)![4], debtOf(g, y)![4]]).toEqual(paid)
    }
    expect(tokens.size).toBe(6)
    expectConserved(g)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 2b. serviceDebt

describe('serviceDebt', () => {
  it('books what it is asked up to what is owed, under support, once per token, and records it in dv[4]', () => {
    const { g, lender } = world({ lenderCash: 200_000 })
    borrow(g, lender, 10_000)
    const key = debtKeyOf(g, lender)
    const cash = g.character.money
    const theirs = lender.money
    const before = booksOf(g)
    const token = debtToken('debt', g.year, key, 'early')
    expect(serviceDebt(g, key, 3_000.9, token)).toBe(3_000)
    expect(g.character.money).toBe(cash - 3_000)
    expect(lender.money).toBe(theirs + 3_000)
    expect(driftSince(g, before)).toBe(0)
    expect(debtOf(g, lender)![4]).toBe(3_000)
    expect(serviceDebt(g, key, 3_000, token)).toBe(0)
    expect(debtOf(g, lender)![4]).toBe(3_000)
    expect(serviceDebt(g, key, 1e9, debtToken('debt', g.year, key, 'rest'))).toBe(7_000)
    expect(debtOf(g, lender)).toBeUndefined()
    expect(g.character.money).toBe(cash - 10_000)
    expectConserved(g)
    expect(checkLedger(g).mint).toBe(0)
  })

  it('books a divorce debt (kind 1) under divorce, and a kind it does not know not at all', () => {
    const { g, lender } = world({ lenderCash: 0 })
    const key = debtKeyOf(g, lender)
    const e: Edge = { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year }
    expect(putEdge(g, key, { ...e, dv: [8_000, 0, g.year - 1, 1, 0] })).toBe(true)
    expect(serviceDebt(g, key, 2_000, debtToken('divorce', g.year, key))).toBe(2_000)
    const rows = checkLedger(g)
    expect(rows.ok).toBe(true)
    expect(debtOf(g, lender)).toEqual([8_000, 0, g.year - 1, 1, 2_000])
    expect(putEdge(g, key, { dv: [8_000, 0, g.year - 1, 5, 0] })).toBe(true)
    expect(serviceDebt(g, key, 2_000, debtToken('divorce', g.year, key, 'again'))).toBe(0)
  })

  it('pays nothing on a debt that is down to less than a dollar, takes the record off when a payment leaves less than that, and never touches the debt of another owner', () => {
    const { g, lender } = world()
    const key = debtKeyOf(g, lender)
    const e: Edge = { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year }
    expect(putEdge(g, key, { ...e, dv: [1_000, 0, g.year - 1, 0, 999.5] })).toBe(true)
    const cash = g.character.money
    expect(serviceDebt(g, key, 100, debtToken('debt', g.year, key))).toBe(0)
    expect(debtOf(g, lender)).toEqual([1_000, 0, g.year - 1, 0, 999.5])
    expect(g.character.money).toBe(cash)
    // the sub-dollar rest of a part payment is let go with the payment
    expect(putEdge(g, key, { dv: [1_000.4, 0, g.year - 1, 0, 0] })).toBe(true)
    expect(serviceDebt(g, key, 1_000, debtToken('debt', g.year, key, 'rest'))).toBe(1_000)
    expect(debtOf(g, lender)).toBeUndefined()
    // an older ego's debt to the same person, and a debt the person owes the player, are not the ego's to pay
    const old = `person:old-ego>${personEntity(lender)}`
    expect(putEdge(g, old, { ...e, dv: [5_000, 0, g.year - 1, 0, 0] })).toBe(true)
    expect(serviceDebt(g, old, 1_000, debtToken('debt', g.year, old))).toBe(0)
    const theirs = `${personEntity(lender)}>${playerRef(g)}`
    expect(putEdge(g, theirs, { ...e, dv: [5_000, 0, g.year - 1, 0, 0] })).toBe(true)
    expect(serviceDebt(g, theirs, 1_000, debtToken('debt', g.year, theirs))).toBe(0)
    expect(g.character.money).toBe(cash - 1_000)
  })

  it('pays from the purse it is given, and from the player\'s own when it is not', () => {
    const { g, lender } = world()
    borrow(g, lender, 10_000)
    const key = debtKeyOf(g, lender)
    const estate = { acct: playerRef(g), add: (d: number): number => d } as never
    const cash = g.character.money
    expect(serviceDebt(g, key, 1_000, debtToken('estate', g.year, key, 'p1'), estate)).toBe(1_000)
    expect(g.character.money).toBe(cash)
  })

  it('never pays more than the payer has, and never takes the cash below what it had', () => {
    const { g, lender } = world({ cash: 0 })
    borrow(g, lender, 10_000)
    g.character.money = 700
    const key = debtKeyOf(g, lender)
    const got = serviceDebt(g, key, 5_000, debtToken('debt', g.year, key, 'x'))
    expect(got).toBeLessThanOrEqual(700)
    expect(g.character.money).toBeGreaterThanOrEqual(0)
    g.character.money = 0
    expect(serviceDebt(g, key, 5_000, debtToken('debt', g.year, key, 'y'))).toBe(0)
  })

  it('pays nothing to a creditor who is gone, dead or a pet, for an amount that is not a number, or without a token', () => {
    const { g, lender } = world()
    borrow(g, lender, 10_000)
    const key = debtKeyOf(g, lender)
    const t = (n: string): string => debtToken('debt', g.year, key, n)
    for (const amount of [Number.NaN, -5, 0, 0.5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(serviceDebt(g, key, amount, t('a')), String(amount)).toBe(0)
    expect(serviceDebt(g, key, 100, '')).toBe(0)
    lender.alive = false
    expect(serviceDebt(g, key, 100, t('b'))).toBe(0)
    lender.alive = true
    lender.relation = 'pet'
    expect(serviceDebt(g, key, 100, t('c'))).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. The yearly step

describe('the yearly step', () => {
  it('starts the year after the loan: nothing is due in the year it was taken', () => {
    const { g, lender } = world()
    borrow(g, lender, 10_000)
    const cash = g.character.money
    yearlyActs(g)
    expect(g.character.money).toBe(cash)
    expect(debtOf(g, lender)).toEqual([10_000, loanTerms(g, lender).rate, g.year, 0, 0])
  })

  it('adds a year\'s interest on what is still owed, then pays 20% of the cash above a reserve, at most what is owed', () => {
    const { g, lender } = world({ cash: 20_000, lenderCash: 10_000_000 })
    borrow(g, lender, 10_000)
    const rate = loanTerms(g, lender).rate
    const start = g.year
    nextYear(g)
    const owed = 10_000 + Math.floor((10_000 * rate) / 100)
    const cash = 30_000
    const pay = Math.min(owed, Math.floor(SERVICE_SHARE * (cash - reserveOf(g))))
    expect(debtOf(g, lender)).toEqual([owed, rate, start, 0, pay])
    expect(g.character.money).toBe(cash - pay)
    expect(lender.money).toBe(10_000_000 - 10_000 + pay)
    expect(tokenSeen(g, debtToken('debt', g.year, debtKeyOf(g, lender)))).toBe(true)
    expectConserved(g)
    // the lender is paid in the cash of the books too
    expect(acctOf(g, personEntity(lender))).toBe(-10_000 + pay)
  })

  it('is idempotent: the entry twice in a year, and the step twice, change nothing; a replay of the year changes nothing', () => {
    // a part payment, a missed year and an interest year, each run twice
    for (const cash of [20_000, 0]) {
      const { g, lender } = world({ cash, lenderCash: 5_000_000 })
      borrow(g, lender, 10_000)
      if (cash === 0) g.character.money = 0
      nextYear(g)
      const after = JSON.stringify(g)
      yearlyActs(g)
      serviceDebts(g)
      serviceDebts(g)
      expect(JSON.stringify(g), `cash ${cash}`).toBe(after)
      const clone = structuredClone(g)
      yearlyActs(clone)
      serviceDebts(clone)
      expect(JSON.stringify(clone)).toBe(after)
      expect(readSocial(g)!.ay).toBe(g.year)
      expect(debtOf(g, lender)).toBeDefined()
    }
  })

  it('pays the debt off in the end: the record goes, the memory and the line are written, and nobody gains a dollar', () => {
    const { g, lender } = world({ cash: 2_000_000, lenderCash: 2_000_000 })
    borrow(g, lender, 10_000)
    const total = g.character.money + lender.money
    const key = debtKeyOf(g, lender)
    for (let i = 0; i < 6 && debtOf(g, lender) !== undefined; i++) nextYear(g)
    expect(debtOf(g, lender)).toBeUndefined()
    expect(g.character.money + lender.money).toBe(total)
    expect(openDebts(g)).toBe(0)
    const kinds = memoriesOf(readEdge(g, playerRef(g), personEntity(lender))!).map((m) => m.kind)
    expect(kinds).toContain('loan_repaid')
    expect(debtsOf(g, playerRef(g))).toEqual([])
    expect(readEdge(g, playerRef(g), personEntity(lender))).not.toBeNull()
    void key
    expectConserved(g)
    const lines = g.log.flatMap((l) => l.entries.map((e) => e.text))
    expect(lines.some((t) => t.includes(lender.firstName) && /\$/.test(t))).toBe(true)
  })

  it('writes a missed year: loan_unpaid, a lower relationship, no payment and no negative cash', () => {
    const { g, lender } = world({ cash: 1_000 })
    borrow(g, lender, 10_000)
    g.character.money = 1_000
    const was = lender.relationship
    nextYear(g)
    const e = readEdge(g, playerRef(g), personEntity(lender))!
    expect(memoriesOf(e).map((m) => m.kind)).toContain('loan_unpaid')
    expect(lender.relationship).toBeLessThan(was)
    expect(e.dv![4]).toBe(0)
    expect(g.character.money).toBe(1_000)
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false)
  })

  it('stays inside 3 x the principal over 40 years of default, for every rate, and never takes cash below 0', () => {
    for (const rate of [5, 10, 25, 40, 60]) {
      const { g, lender } = world({ lenderCash: 1e9 })
      borrow(g, lender, 50_000)
      g.character.money = 0
      expect(putEdge(g, debtKeyOf(g, lender), { dv: [50_000, rate, g.year, 0, 0] })).toBe(true)
      let top = 0
      for (let i = 0; i < 40; i++) {
        nextYear(g)
        g.queue = []
        g.yearActions = {}
        top = Math.max(top, debtOf(g, lender)![0])
        expect(debtOf(g, lender)![0], `rate ${rate} year ${i}`).toBeLessThanOrEqual(INTEREST_CEILING * 50_000)
        expect(g.character.money).toBe(0)
      }
      expect(top, `rate ${rate} grew`).toBeGreaterThan(50_000)
      // it stops: a 41st year adds nothing
      const last = debtOf(g, lender)![0]
      nextYear(g)
      expect(debtOf(g, lender)![0]).toBe(last)
      // the years of interest are the most that keep the debt at 3 x or less
      const k = accrualYears(rate)
      expect(50_000 * (1 + rate / 100) ** k).toBeLessThanOrEqual(150_000)
      expect(50_000 * (1 + rate / 100) ** (k + 1)).toBeGreaterThan(150_000)
    }
  })

  it('stays inside 3 x the principal when the player pays a part every year, whatever the rate', () => {
    for (const rate of [5, 25, 60]) {
      const { g, lender } = world({ lenderCash: 1e9 })
      borrow(g, lender, 80_000)
      expect(putEdge(g, debtKeyOf(g, lender), { dv: [80_000, rate, g.year, 0, 0] })).toBe(true)
      for (let i = 0; i < 40 && debtOf(g, lender) !== undefined; i++) {
        g.character.money = 25_000
        nextYear(g)
        g.queue = []
        g.yearActions = {}
        const d = debtOf(g, lender)
        if (d !== undefined) {
          expect(d[0], `rate ${rate} year ${i}`).toBeLessThanOrEqual(INTEREST_CEILING * 80_000)
          expect(d[4]).toBeLessThanOrEqual(d[0])
        }
      }
      expect(g.character.money).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps accrue pure and bounded for a hostile record: a rate of 60 with a debt of a trillion', () => {
    const d = { owed: 1e12, rate: 60, since: 2000, kind: 0, paid: 0 }
    const next = accrue(d, 2001)
    expect(next.owed).toBeLessThanOrEqual(1e12)
    expect(d.owed).toBe(1e12)
    expect(accrue({ ...d, owed: 100, rate: 0 }, 2001).owed).toBe(100)
    expect(accrue({ ...d, owed: 100, since: 2030 }, 2001).owed).toBe(100)
    expect(accrualYears(0)).toBe(0)
    for (const bad of [Number.NaN, -5, 1e-300, Number.POSITIVE_INFINITY]) expect(accrualYears(bad), String(bad)).toBeLessThan(1000)
    expect(accrualYears(1e-300)).toBe(0)
    expect(accrualYears(1e300)).toBe(accrualYears(60))
    expect(accrualYears(60)).toBe(2)
    expect(accrualYears(5)).toBe(22)
  })

  it('speaks the status row for a part payment only when the debt has halved or after five quiet years, and the payoff line always', () => {
    const { g, lender } = world({ cash: 200_000, lenderCash: 5_000_000 })
    borrow(g, lender, 90_000)
    const status = /still owe|left on what I owe|paid down the loan/
    const lines = (): string[] => g.log.flatMap((l) => l.entries.map((e) => e.text)).filter((t) => t.includes(lender.firstName))
    const statusSaid: number[] = []
    for (let i = 0; i < 8 && debtOf(g, lender) !== undefined; i++) {
      const n = lines().filter((t) => status.test(t)).length
      nextYear(g)
      if (lines().filter((t) => status.test(t)).length > n) statusSaid.push(g.year)
    }
    // a part payment spoke on its first year, and not every year after it
    expect(statusSaid.length).toBeGreaterThan(0)
    expect(statusSaid.length).toBeLessThan(6)
    expect(statusSaid[0]).toBe(2027)
    for (let i = 1; i < statusSaid.length; i++) expect(statusSaid[i]! - statusSaid[i - 1]!).toBeGreaterThanOrEqual(2)
    // the debt ends with a line of the repay pool
    while (debtOf(g, lender) !== undefined) nextYear(g)
    expect(lines().at(-1)).toMatch(/back|for the loan|toward the loan|as agreed/)
  })

  it('lets a debt go that is down to less than a dollar, with no payment and no missed year', () => {
    const { g, lender } = world()
    expect(putEdge(g, debtKeyOf(g, lender), { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, dv: [1_000, 8, g.year - 1, 0, 999.5] })).toBe(true)
    const cash = g.character.money
    const was = lender.relationship
    nextYear(g)
    expect(debtOf(g, lender)).toBeUndefined()
    expect(g.character.money).toBe(cash)
    expect(lender.relationship).toBe(was)
    expect(memoriesOf(readEdge(g, playerRef(g), personEntity(lender))!)).toEqual([])
  })

  it('lapses the debt of a lender who is gone, with no money moved', () => {
    const { g, lender } = world()
    borrow(g, lender, 10_000)
    lender.alive = false
    const cash = g.character.money
    nextYear(g)
    expect(debtOf(g, lender)).toBeUndefined()
    expect(g.character.money).toBe(cash)
    expect(openDebts(g)).toBe(0)
  })

  it('does nothing at all on a life that is not stamped', () => {
    const { g, lender } = world()
    borrow(g, lender, 10_000)
    delete (g.world as Record<string, unknown>).social
    g.year += 1
    const before = JSON.stringify(g)
    serviceDebts(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(serviceDebt(g, debtKeyOf(g, lender), 1_000, debtToken('debt', g.year, debtKeyOf(g, lender)))).toBe(0)
    expect(JSON.stringify(g)).toBe(before)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. A Lender Calls

describe('A Lender Calls', () => {
  /** A sharp lender, a loan, and a player with no cash above the reserve: the year the lender misses. */
  function missed(traits: string[]): { g: GameState; lender: Person; call: ChoiceModal | undefined } {
    const { g, lender } = world({ cash: 1_000, traits })
    borrow(g, lender, 10_000)
    g.character.money = 1_000
    g.queue = []
    nextYear(g)
    return { g, lender, call: g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === LENDER_SCRIPT) }
  }

  it('is queued for a sharp lender and a missed year, and costs one of the year\'s three family choices', () => {
    const { g, lender, call } = missed(SHARP)
    expect(loanTerms(g, lender).sharp).toBe(true)
    expect(call).toBeDefined()
    expect(call!.title).toBe('A Lender Calls')
    expect(call!.text).toContain(lender.firstName)
    expect(call!.choices.map((c) => c.id)).toEqual(['pay', 'time', 'ignore'])
    for (const c of call!.choices) expect(c.label.split(' ').length).toBeLessThanOrEqual(5)
    expect(g.yearActions[ACT_KEY]).toBe(1)
    expect(g.queue.filter((m) => m.kind === 'choice')).toHaveLength(1)
  })

  it('is not queued for an ordinary lender', () => {
    const { call, g } = missed(['kind', 'calm'])
    expect(call).toBeUndefined()
    expect(g.yearActions[ACT_KEY] ?? 0).toBe(0)
  })

  it('is not queued when the three family choices of the year are spent, and the missed year is still written', () => {
    const { g, lender } = world({ cash: 1_000, traits: SHARP })
    borrow(g, lender, 10_000)
    g.character.money = 1_000
    g.queue = []
    g.yearActions[ACT_KEY] = 3
    nextYear(g)
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false)
    expect(memoriesOf(readEdge(g, playerRef(g), personEntity(lender))!).map((m) => m.kind)).toContain('loan_unpaid')
  })

  it('is a script that the year close keeps and counts first, in the pace family `pop.kin.lender`', () => {
    expect(DEFERRABLE_SCRIPTS.has(LENDER_SCRIPT)).toBe(false)
    const { g } = missed(SHARP)
    const flags = JSON.stringify(g.flags)
    expect(flags).toContain('pop.kin.lender')
  })

  it('is asked at most once in four years', () => {
    const { g, lender } = missed(SHARP)
    expect(lender.alive).toBe(true)
    const first = g.year
    const calls: number[] = []
    for (let i = 0; i < 9; i++) {
      g.queue = []
      g.yearActions = {}
      g.character.money = 1_000
      nextYear(g)
      if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === LENDER_SCRIPT)) calls.push(g.year)
    }
    expect(calls).toEqual([first + 4, first + 8])
  })

  it('pay: pays up to half the cash through serviceDebt, once, and warms the bond', () => {
    const { g, lender, call } = missed(SHARP)
    g.character.money = 20_000
    const was = lender.relationship
    const key = debtKeyOf(g, lender)
    const paidBefore = debtOf(g, lender)![4]
    runScript(g, LENDER_SCRIPT, 'pay', call!.data, call!)
    const paid = debtOf(g, lender)![4] - paidBefore
    expect(paid).toBe(10_000)
    expect(g.character.money).toBe(20_000 - paid)
    expect(lender.relationship).toBeGreaterThan(was)
    expect(tokenSeen(g, debtToken('debt', g.year, key, 'call'))).toBe(true)
    runScript(g, LENDER_SCRIPT, 'pay', call!.data, call!)
    expect(debtOf(g, lender)![4] - paidBefore).toBe(paid)
    expectConserved(g)
  })

  it('pay with nothing to give costs a point; ignore costs more; time asks the stream and costs nothing when it is given', () => {
    const a = missed(SHARP)
    a.g.character.money = 0
    const was = a.lender.relationship
    runScript(a.g, LENDER_SCRIPT, 'pay', a.call!.data, a.call!)
    expect(a.lender.relationship).toBe(was - 1)
    const b = missed(SHARP)
    const wasB = b.lender.relationship
    runScript(b.g, LENDER_SCRIPT, 'ignore', b.call!.data, b.call!)
    expect(b.lender.relationship).toBeLessThan(wasB - 1)
    const c = missed(SHARP)
    const wasC = c.lender.relationship
    const odds = Math.min(0.8, Math.max(0.1, 0.3 + 0.4 * (wasC / 100) - 0.2))
    const yes = actRoll(c.g, 'lender.time', debtKeyOf(c.g, c.lender))() < odds
    runScript(c.g, LENDER_SCRIPT, 'time', c.call!.data, c.call!)
    if (yes) expect(c.lender.relationship).toBe(wasC)
    else expect(c.lender.relationship).toBeLessThan(wasC)
  })

  it('does nothing for a debt that is gone, a lender who died, a key that is not the lender\'s or a life that is not stamped', () => {
    const answers = (mutate: (g: GameState, lender: Person) => void): void => {
      for (const choice of ['pay', 'time', 'ignore']) {
        const { g, lender, call } = missed(SHARP)
        g.character.money = 50_000
        mutate(g, lender)
        const mine = { money: g.character.money, rel: lender.relationship, queue: g.queue.length, edges: JSON.stringify(g.world?.edges) }
        runScript(g, LENDER_SCRIPT, choice, call!.data, call!)
        expect({ money: g.character.money, rel: lender.relationship, queue: g.queue.length, edges: JSON.stringify(g.world?.edges) }, choice).toEqual(mine)
      }
    }
    answers((g, lender) => void putEdge(g, debtKeyOf(g, lender), { dv: undefined }))
    answers((_g, lender) => void (lender.alive = false))
    answers((_g, lender) => void (lender.relation = 'pet'))
    answers((g) => void delete (g.world as Record<string, unknown>).social)
    const { g, call } = missed(SHARP)
    const forged = { pid: (call!.data as { pid: string }).pid, key: 'person:old-ego>person:someone' }
    const queue = g.queue.length
    runScript(g, LENDER_SCRIPT, 'ignore', forged, call!)
    expect(g.queue.length).toBe(queue)
    runScript(g, LENDER_SCRIPT, 'ignore', undefined, call!)
    runScript(g, LENDER_SCRIPT, 'ignore', null, call!)
    runScript(g, LENDER_SCRIPT, 'ignore', [] as never, call!)
    expect(g.queue.length).toBe(queue)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. The menu, purity, the files and the probes

describe('the menu rows', () => {
  const rows = (g: GameState, p: Person): MenuAction | undefined => socialNodes(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === 'social.loan')

  it('shows "Ask for a Loan" to a stamped adult for a friend who can spare it, with the terms and a slider up to the cap', () => {
    const { g, lender } = world()
    const row = rows(g, lender)!
    expect(row).toBeDefined()
    expect(row.label).toContain(lender.firstName)
    const t = loanTerms(g, lender)
    expect(String(row.subtitle)).toMatch(/\d+%/)
    expect(row.input).toMatchObject({ kind: 'slider', money: true, min: expect.any(Number), max: t.cap })
    expect(row.input!.min!).toBeLessThanOrEqual(row.input!.max!)
    const dflt = Number(row.input!.defaultValue!(g))
    expect(dflt).toBeGreaterThanOrEqual(row.input!.min!)
    expect(dflt).toBeLessThanOrEqual(row.input!.max!)
    expect(row.disabledReason?.(g)).toBeNull()
    // it comes after the favor rows
    const ids = socialNodes(g, lender).map((n) => n.id)
    expect(ids.indexOf('social.favor')).toBeLessThan(ids.indexOf('social.loan'))
  })

  it('runs the ask on a draft of the state, and shows what you owe a lender on their page', () => {
    const id = lifeWhere((life) => {
      const { g, lender } = world()
      g.lifeId = life
      return actRoll(g, 'loan.ask', `${personEntity(lender)}>${playerRef(g)}`)() < loanTerms(g, lender).odds
    })
    const { g, lender } = world()
    g.lifeId = id
    const draft = structuredClone(g)
    rows(g, lender)!.run(draft, '12000')
    expect(debtOf(draft, lender)![0]).toBe(12_000)
    expect(debtOf(g, lender)).toBeUndefined()
    const info = socialNodes(draft, getPerson(draft, lender.id)!).find((n) => n.type === 'info' && n.id === 'social.owe')
    expect(info).toBeDefined()
    expect(JSON.stringify(info)).toContain(lender.firstName)
    expect(JSON.stringify(info)).not.toMatch(/[\u2013\u2014]/)
  })

  it('greys the row with a reason when the lender has nothing to spare, the player owes them, or the cooldown is on', () => {
    const poor = world({ lenderCash: 50 })
    expect(rows(poor.g, poor.lender)!.disabledReason?.(poor.g)).toMatch(/nothing to spare/)
    const { g, lender } = world()
    borrow(g, lender, 10_000)
    expect(rows(g, lender)!.disabledReason?.(g)).toEqual(expect.stringContaining(lender.firstName))
  })

  it('shows nothing to a child or on a life that is not stamped', () => {
    const { g, lender } = world()
    g.character.age = 12
    expect(rows(g, lender)).toBeUndefined()
    g.character.age = 30
    delete (g.world as Record<string, unknown>).social
    expect(socialNodes(g, lender)).toEqual([])
  })

  it('is pure: the terms, the act, the rows and debtsOf read a frozen game with a trapped g.rng', () => {
    const { g, lender } = world()
    borrow(g, lender, 10_000)
    const other = cast(g, 70, 'friend', { money: 1e6 })
    const frozen = deepFreeze(trapRng(g))
    const before = JSON.stringify(frozen)
    expect(() => {
      void loanTerms(frozen, other)
      void debtTo(frozen, lender)
      void openLoans(frozen)
      void debtsOf(frozen, playerRef(frozen))
      void reserveOf(frozen)
      void dueOf(frozen, { owed: 5_000, rate: 8, since: 2020, kind: 0, paid: 0 })
      for (const act of [loanAct(10_000)]) void act.blocked(frozen, { g: frozen, key: `${personEntity(other)}>${playerRef(frozen)}`, person: other, year: frozen.year, roll: () => 0.5 })
      for (const p of [lender, other]) for (const n of socialNodes(frozen, p)) if (n.type === 'action') { void n.disabledReason?.(frozen); void n.subtitle; void n.input?.defaultValue?.(frozen) }
    }).not.toThrow()
    expect(JSON.stringify(frozen)).toBe(before)
  })
})

describe('the ceilings, at 100 x the input', () => {
  it('the principal is capped by 2 x typical income whatever the lender holds, and by 25% of a small purse', () => {
    for (const mult of [1, 100, 10_000]) {
      const { g, lender } = world({ lenderCash: 1_000_000 * mult })
      expect(loanTerms(g, lender).cap).toBeLessThanOrEqual(2 * leafTypicalIncome(g))
    }
    for (const mult of [1, 100]) {
      const { g, lender } = world({ lenderCash: 40_000 * mult })
      expect(loanTerms(g, lender).cap).toBeLessThanOrEqual(0.25 * lender.money)
    }
  })

  it('a payment never passes what is owed, however rich the player, and never the cash', () => {
    for (const cash of [1e4, 1e6, 1e8, 1e12]) {
      const { g } = world({ cash })
      const d = { owed: 12_345, rate: 8, since: g.year - 1, kind: 0, paid: 345 }
      const due = dueOf(g, d)
      expect(due).toBeLessThanOrEqual(12_000)
      expect(due).toBeLessThanOrEqual(cash)
      expect(Number.isInteger(due)).toBe(true)
    }
    const { g } = world({ cash: 5_000 })
    expect(dueOf(g, { owed: 12_345, rate: 8, since: g.year - 1, kind: 0, paid: 0 })).toBe(0)
  })

  it('forty open debts and a hundred years of the step stay inside the caps, with the books balanced', () => {
    const { g } = world({ cash: 5_000_000, lenderCash: 1e9 })
    for (let i = 0; i < EDGE_CAPS.debts; i++) {
      const p = cast(g, 70, 'friend', { money: 1e6 })
      expect(putEdge(g, debtKeyOf(g, p), { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, dv: [1_000_000, 60, g.year, 0, 0] })).toBe(true)
    }
    expect(openDebts(g)).toBe(EDGE_CAPS.debts)
    for (let i = 0; i < 100; i++) {
      nextYear(g)
      g.queue = []
      g.yearActions = {}
      expect(openDebts(g)).toBeLessThanOrEqual(EDGE_CAPS.debts)
      expect(g.character.money).toBeGreaterThanOrEqual(0)
      for (const r of debtsOf(g, playerRef(g))) expect(Number.isFinite(r.owed)).toBe(true)
    }
    expectConserved(g)
  })
})

describe('a real stamped life', () => {
  /** A seed whose newborn has a living parent and a sibling, so there is a family to borrow from. */
  const seed = findSeed(
    (s) => {
      const g = withFlags({ social: true }, () => createNewLife({ seed: s, year: 1990 }))
      return g.people.some((p) => p.alive && p.relation === 'parent') && g.people.some((p) => p.alive && p.relation === 'sibling')
    },
    { label: 'a newborn with a parent and a sibling (loans)' },
  )

  /** 30 years of the life; from 22 the family is fond of the player, who borrows the most each of them will lend, every year, through the rows. */
  function play(): { g: GameState; loans: number; calls: number } {
    const g = withFlags({ social: true }, () => createNewLife({ seed, year: 1990 }))
    let loans = 0
    let calls = 0
    for (let i = 0; i < 30; i++) {
      g.queue = []
      g.character.stats.health = 100
      g.character.conditions = []
      ageUp(g)
      if (!g.character.alive) break
      calls += g.queue.filter((m) => m.kind === 'choice' && m.scriptId === LENDER_SCRIPT).length
      g.queue = []
      if (g.character.age === 22) for (const p of g.people) if (p.alive && p.relation !== 'pet') p.relationship = 80
      if (g.character.age < 22) continue
      for (const p of [...g.people]) {
        const row = socialNodes(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === 'social.loan' && n.disabledReason?.(g) === null)
        if (row === undefined) continue
        const before = openLoans(g)
        row.run(g, String(row.input!.max))
        if (openLoans(g) > before) loans++
      }
    }
    return { g, loans, calls }
  }

  it('borrows and pays for 30 years with no world problem, the books balanced, the debts inside their caps and the same life on a replay', () => {
    const a = play()
    expect(a.loans).toBeGreaterThan(0)
    expect(socialOn(a.g)).toBe(true)
    expect(worldProblems(a.g, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
    expectConserved(a.g)
    expect(openDebts(a.g)).toBeLessThanOrEqual(EDGE_CAPS.debts)
    expect(openLoans(a.g)).toBeLessThanOrEqual(LOAN_OPEN_MAX)
    for (const r of debtsOf(a.g, playerRef(a.g))) expect(Number.isFinite(r.owed) && r.owed >= 0).toBe(true)
    const lines = a.g.log.flatMap((l) => l.entries.map((e) => e.text))
    expect(lines.some((t) => /borrowed|took a loan|lent me/.test(t))).toBe(true)
    expect(JSON.stringify(play().g)).toBe(JSON.stringify(a.g))
  }, 120_000)
})

describe('the files of society/ for this task', () => {
  it('draw no luck but the stream and the text kit, write no dollar but through cash.moveCash, and hold no long dash', () => {
    for (const f of ['loan.ts', 'debt.ts']) {
      const text = src(`src/game/society/${f}`)
      expect(text, f).not.toMatch(/[\u2013\u2014]/)
      const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(code, f).not.toMatch(/\.rng\b|\brand\(|\bchance\(|\bpick\(|\bshuffle\(|Math\.random|\bDate\b/)
      expect(code, f).not.toMatch(/\bearnIncome\(|\bspend\(|\baddMoney\(|\.money\s*[-+*/]?=[^=]|\.cash\s*[-+*/]?=[^=]|bookMint|bookBurn/)
    }
  })

  it('call `dv` the record of a new loan: [principal, rate, year, 0, 0], with the rate and the principal cut to what a record may hold', () => {
    expect(dv(10_000, 8, 2030)).toEqual([10_000, 8, 2030, 0, 0])
    expect(dv(1e300, 99, 2030)).toEqual([1e12, 60, 2030, 0, 0])
    expect(dv(-5, -1, 2030)).toEqual([0, 0, 2030, 0, 0])
    expect(dv(Number.NaN, Number.NaN, 2030)).toEqual([0, 0, 2030, 0, 0])
  })
})
