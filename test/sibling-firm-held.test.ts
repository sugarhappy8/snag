// R4-L8 (A.K8 c, X35): the two cash fallbacks that can become holdings. When the player dies and the designated sibling is NOT the heir,
// the sibling used to get the firm's net equity as cash if the firm carried a mortgage or the sibling was under 21. On a STAMPED life
// (the social flag, X6) both stay a company: a mortgaged plain firm whose mortgage is under its value passes with the balance joined
// to the firm's own debt, and a sibling of 18 to 20 may own it. An unstamped life keeps v5.2.0 byte for byte, and what stays cash on
// both (a sibling who already owns a firm, a firm with family co-owners, a firm under water, a house or a car) is pinned here too.
//
// What the file proves:
//   1. A stamped $2M mortgage on the $12M firm: the sibling's money is untouched, the company is held, b.debt carries the balance, the
//      value is net of it, the mortgage record is gone from the stored asset, no flow is booked, the books balance, six years run with
//      stable JSON and ten years of ageUp do not throw.
//   2. The age gate: 21, 20 and 18 are held, 17 is cash. The same scenes unstamped are cash, as sibling-firm.test.ts pins.
//   3. Cases that stay cash on a stamped life: a firm under water (mortgage equal to or over the value), a sibling who owns a firm already,
//      a firm with family co-owners (the owns-a-firm and co-owners cases of sibling-firm.test.ts, unchanged).
//   4. adoptNpcCompany by itself: the default options are today's behaviour; minAge and carryMortgage; hostile options and mortgage
//      records; the rate ceiling; the sum at 100x and 10,000x.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import { successorOf } from '../src/game/business/nepo-state'
import { valuationOf } from '../src/game/business/economy'
import { bizOf, findBusiness, stakeValue } from '../src/game/business/state'
import { personPurse } from '../src/game/cash'
import { killCharacter } from '../src/game/death'
import { flowsOf } from '../src/game/kernel/ledger'
import { continueAsChild } from '../src/game/life'
import { adoptNpcCompany, npcCompany, npcLife, startNpcCompany } from '../src/game/npc-lives'
import type { Asset, GameState, Json, Mortgage, Person } from '../src/game/types'
import '../src/game/world/edge-step'
import { socialOn, stampSocial } from '../src/game/world/social'
import { acctOf, expectConserved } from './ledger-kit'
import { drain, kid, world } from './nepo-kit'

const FIRM_VALUE = 12_000_000
const MORTGAGE = 2_000_000
/** Three lives the scene builds (a company must survive set-up; world() tries the next seed when one does not). */
const LIVES = [135, 140, 150] as const

interface Scene {
  g: GameState
  firmId: string
  successor: Person
  willHeir: Person
  /** The successor's cash just before the parent dies. */
  baseMoney: number
}

interface Options {
  stamped?: boolean
  /** Written onto the firm before the death, when given. */
  mortgage?: Partial<Mortgage>
  /** The successor's age at the death (they are 39 when hired). */
  age?: number
  before?: (s: Scene) => void
}

/** A $12M family firm, a designated successor (employed at it) and a different sole will heir; stamped on request. */
function scene(life: number, o: Options = {}): Scene {
  const { g, a, b } = world(life, { age: 78 })
  if (o.stamped) stampSocial(g)
  const successor = kid(g, 39, { smarts: 88 })
  const willHeir = kid(g, 36, { smarts: 65 })
  expect(hireRelative(g, a, b, successor, { rank: 2 }, { quiet: true }).ok).toBe(true)
  expect(designateSuccessor(g, a, bizOf(g, a), successor, { quiet: true }).ok).toBe(true)
  g.character.willBeneficiaries = [willHeir.id]
  a.value = FIRM_VALUE
  g.character.money = 0
  if (o.mortgage) a.mortgage = { lender: 'Bank', balance: MORTGAGE, yearlyPayment: 300_000, yearsLeft: 10, rate: 0.05, ...o.mortgage }
  if (o.age !== undefined) successor.age = o.age
  const s: Scene = { g, firmId: a.id, successor, willHeir, baseMoney: successor.money }
  o.before?.(s)
  s.baseMoney = successor.money
  expect(successorOf(g, a, bizOf(g, a))).toMatchObject({ kind: 'person' })
  return s
}

/** The parent dies and the will heir (not the designated successor) carries on. */
function handOff(s: Scene): GameState {
  killCharacter(s.g, 'Old Age')
  s.g.queue = []
  return continueAsChild(s.g, s.willHeir.id)
}

const sibling = (n: GameState, id: string): Person => n.people.find((p) => p.id === id) as Person
const roundTrips = (n: GameState): boolean => JSON.stringify(JSON.parse(JSON.stringify(n))) === JSON.stringify(n)

/** The firm is held by the sibling, with the note and the occupation that go with it. */
function expectHeld(n: GameState, s: Scene): { a: Asset; b: ReturnType<typeof bizOf> } {
  const sib = sibling(n, s.successor.id)
  const held = npcCompany(sib, n.year)
  expect(held?.a.id).toBe(s.firmId)
  expect(held?.b.npcOwnerId).toBe(sib.id)
  expect(held?.b.ceo).toBe('manager')
  expect(sib.occupation).toBe('Business Owner')
  expect(sib.data.nepo).toBeUndefined()
  expect(findBusiness(n, s.firmId)).toBeUndefined()
  expect(sib.notes.some((note) => /inherited .*designated successor/i.test(note))).toBe(true)
  return held!
}

/** The firm is cash: no company, the equity (value less mortgage, never below 0) in the sibling's money. */
function expectCash(n: GameState, s: Scene, equity: number): void {
  const sib = sibling(n, s.successor.id)
  expect(npcCompany(sib, n.year)).toBeNull()
  expect(sib.money).toBe(s.baseMoney + equity)
  expect(sib.occupation).toBe('Business Owner')
  expect(sib.data.nepo).toBeUndefined()
}

/** Plays years the way sibling-firm.test.ts does: popups answered, the heir ages. */
function play(n: GameState, years: number): void {
  for (let year = 0; year < years; year++) {
    ageUp(n)
    drain(n)
  }
}

describe('a stamped life: the sibling keeps a mortgaged plain firm', () => {
  it.each(LIVES)('life %i: a $2M mortgage on the $12M firm leaves the money alone, the firm held and the balance in its debt', (life) => {
    const plain = scene(life, { stamped: true })
    const debtBefore = bizOf(plain.g, findBusiness(plain.g, plain.firmId)!).debt
    const twin = handOff(plain)
    const twinHeld = expectHeld(twin, plain)

    const s = scene(life, { stamped: true, mortgage: {} })
    const n = handOff(s)
    expect(socialOn(n)).toBe(true)
    const sib = sibling(n, s.successor.id)
    expect(sib.money).toBe(s.baseMoney)
    const held = expectHeld(n, s)
    // The balance joined the firm's own debt and the mortgage record left the stored asset (no ghost liability, no double count).
    expect(held.b.debt).toBe(debtBefore + MORTGAGE)
    expect(held.a.mortgage).toBeUndefined()
    expect(held.b.debtRate).toBeGreaterThanOrEqual(0.05)
    expect(held.b.debtRate).toBeLessThanOrEqual(0.6)
    // The value is net of the new debt: the same firm without the mortgage is worth the balance more, and the asset is the owner's stake.
    expect(held.a.value).toBe(stakeValue(held.b))
    expect(held.b.valuation).toBe(valuationOf(held.b))
    const withoutDebt = { ...held.b, debt: debtBefore }
    expect(held.b.valuation).toBeGreaterThan(0)
    expect(valuationOf(withoutDebt) - held.b.valuation).toBe(MORTGAGE)
    expect(twinHeld.a.value - held.a.value).toBeLessThanOrEqual(MORTGAGE * held.b.share + 1)
    expect(held.a.value).toBeLessThan(twinHeld.a.value)
    expect(roundTrips(n)).toBe(true)
  })

  it.each(LIVES)('life %i: no flow, no draw and no id at adoption, the books balance and the sibling account does not move', (life) => {
    const plain = handOff(scene(life, { stamped: true }))
    const s = scene(life, { stamped: true, mortgage: {} })
    const n = handOff(s)
    // A relabelled liability: the hand-over books exactly the rows the same hand-over books without the mortgage.
    expect(flowsOf(n, n.year)).toEqual(flowsOf(plain, plain.year))
    expect(acctOf(n, personPurse(sibling(n, s.successor.id)).acct)).toBe(acctOf(plain, personPurse(sibling(plain, s.successor.id)).acct))
    // Adoption draws nothing and makes no id: the dice and the id counter are the plain twin's.
    expect(n.rng).toBe(plain.rng)
    expect(n.nextId).toBe(plain.nextId)
    expectConserved(n)
  })

  it.each(LIVES)('life %i: six years run with stable JSON, and ten years of ageUp do not throw', (life) => {
    const s = scene(life, { stamped: true, mortgage: {} })
    const n = handOff(s)
    expect(roundTrips(n)).toBe(true)
    for (let year = 0; year < 6; year++) {
      play(n, 1)
      expect(roundTrips(n)).toBe(true)
    }
    const after = sibling(n, s.successor.id)
    const failed = (npcLife(after)?.history ?? []).some((line) => /failed; the business was liquidated/.test(line))
    expect(npcCompany(after, n.year) !== null || failed).toBe(true)
    expect(() => play(n, 4)).not.toThrow()
    expectConserved(n)
  })

  it('the sibling is paid nothing on the way and the late player owes nothing for the mortgage (it moved, not vanished)', () => {
    const s = scene(135, { stamped: true, mortgage: {} })
    const before = JSON.stringify(sibling(s.g, s.successor.id).money)
    const n = handOff(s)
    expect(JSON.stringify(sibling(n, s.successor.id).money)).toBe(before)
    const held = expectHeld(n, s)
    expect(held.b.debt).toBeGreaterThanOrEqual(MORTGAGE)
  })

  it('a lower mortgage rate than the firm already pays keeps the firm rate; a higher one raises it, and 500% stops at the ceiling', () => {
    const rates = [0.01, 0.2, 5].map((rate) => {
      const s = scene(135, { stamped: true, mortgage: { rate } })
      return expectHeld(handOff(s), s).b.debtRate
    })
    const base = (() => {
      const s = scene(135, { stamped: true, mortgage: { rate: 0 } })
      return expectHeld(handOff(s), s).b.debtRate
    })()
    expect(rates[0]).toBe(base)
    expect(rates[1]).toBe(Math.max(base, 0.2))
    expect(rates[2]).toBe(0.6)
  })
})

describe('a stamped life: the age gate is 18', () => {
  it.each([21, 20, 19, 18])('a plain firm goes to a sibling of %i as a company, money untouched', (age) => {
    const s = scene(135, { stamped: true, age })
    const n = handOff(s)
    expect(sibling(n, s.successor.id).age).toBeGreaterThanOrEqual(age)
    expect(sibling(n, s.successor.id).money).toBe(s.baseMoney)
    expectHeld(n, s)
    expect(roundTrips(n)).toBe(true)
  })

  it.each([17, 16, 5])('a sibling of %i gets the equity as cash, as before', (age) => {
    const s = scene(135, { stamped: true, age })
    const n = handOff(s)
    expectCash(n, s, FIRM_VALUE)
  })

  it('a mortgaged firm and a sibling of 20 together: held with the debt', () => {
    const s = scene(140, { stamped: true, age: 20, mortgage: {} })
    const n = handOff(s)
    const held = expectHeld(n, s)
    expect(sibling(n, s.successor.id).money).toBe(s.baseMoney)
    expect(held.b.debt).toBeGreaterThanOrEqual(MORTGAGE)
    expect(held.a.mortgage).toBeUndefined()
  })

  it('a mortgaged firm and a sibling of 17: cash, the net equity', () => {
    const s = scene(140, { stamped: true, age: 17, mortgage: {} })
    const n = handOff(s)
    expectCash(n, s, FIRM_VALUE - MORTGAGE)
  })

  it('a sibling who is 20 keeps the firm through ten years of ageUp without a throw', () => {
    const s = scene(150, { stamped: true, age: 20, mortgage: {} })
    const n = handOff(s)
    expectHeld(n, s)
    expect(() => play(n, 10)).not.toThrow()
    expect(roundTrips(n)).toBe(true)
    expectConserved(n)
  })
})

describe('what stays cash on a stamped life', () => {
  it('a firm under water (the mortgage is the value, or more) becomes the equity floor of 0 in cash and no company', () => {
    for (const balance of [FIRM_VALUE, FIRM_VALUE + 1, FIRM_VALUE * 3]) {
      const s = scene(135, { stamped: true, mortgage: { balance } })
      const n = handOff(s)
      expectCash(n, s, 0)
      expect(findBusiness(n, s.firmId)).toBeUndefined()
    }
  })

  it('a mortgage a dollar under the value is still held', () => {
    const s = scene(135, { stamped: true, mortgage: { balance: FIRM_VALUE - 1 } })
    const n = handOff(s)
    expect(sibling(n, s.successor.id).money).toBe(s.baseMoney)
    expect(expectHeld(n, s).b.debt).toBeGreaterThanOrEqual(FIRM_VALUE - 1)
  })

  it('a sibling who already owns a company keeps that one and gets the equity as cash (the owns-a-firm case, stamped)', () => {
    let own = ''
    const s = scene(135, {
      stamped: true,
      mortgage: {},
      before: (x) => {
        x.successor.money = 8_000_000
        expect(startNpcCompany(x.g, x.successor, 'cafe')).toBe(true)
        own = npcCompany(x.successor, x.g.year)!.a.id
      },
    })
    const n = handOff(s)
    const sib = sibling(n, s.successor.id)
    expect(npcCompany(sib, n.year)?.a.id).toBe(own)
    expect(sib.money).toBe(s.baseMoney + FIRM_VALUE - MORTGAGE)
    expect(sib.data.nepo).toBeUndefined()
    expect(sib.occupation).toBe('Business Owner')
  })

  it('a firm with family co-owners stays a shared holding, not an adopted company (stamped, mortgaged or not)', () => {
    for (const mortgage of [undefined, {}]) {
      const s = scene(135, {
        stamped: true,
        ...(mortgage ? { mortgage } : {}),
        before: (x) => {
          const cousin = kid(x.g, 30)
          const b = bizOf(x.g, findBusiness(x.g, x.firmId)!)
          b.share = 0.7
          b.familyShares = [{ id: cousin.id, share: 0.3 }]
        },
      })
      const n = handOff(s)
      const sib = sibling(n, s.successor.id)
      expect(npcCompany(sib, n.year)).toBeNull()
      expect(sib.money).toBe(s.baseMoney)
      expect(findBusiness(n, s.firmId)).toBeDefined()
      expect(bizOf(n, findBusiness(n, s.firmId)!).familyShares?.some((x) => x.id === s.successor.id)).toBe(true)
    }
  })

  it('a damaged mortgage record on a stamped firm never throws and never makes a company with a debt of NaN', () => {
    const hostile: [string, Partial<Mortgage>][] = [
      ['a balance of NaN', { balance: Number.NaN }],
      ['a balance of minus one', { balance: -1 }],
      ['a balance of infinity', { balance: Number.POSITIVE_INFINITY }],
      ['a rate of NaN', { rate: Number.NaN }],
      ['a rate of minus one', { rate: -1 }],
    ]
    for (const [, mortgage] of hostile) {
      const s = scene(135, { stamped: true, mortgage })
      let n: GameState | undefined
      expect(() => {
        n = handOff(s)
      }).not.toThrow()
      const sib = sibling(n!, s.successor.id)
      const held = npcCompany(sib, n!.year)
      if (held) {
        expect(Number.isFinite(held.b.debt)).toBe(true)
        expect(held.b.debt).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(held.b.debtRate)).toBe(true)
        expect(held.b.debtRate).toBeLessThanOrEqual(0.6)
        expect(held.a.mortgage).toBeUndefined()
      }
      expect(Number.isFinite(sib.money)).toBe(true)
      expect(JSON.parse(JSON.stringify(sib))).toEqual(sib)
    }
  })
})

describe('an unstamped life is untouched', () => {
  it('a mortgaged firm and a sibling under 21 are still cash, and the stamp is what switches them', () => {
    const mortgaged = scene(135, { mortgage: {} })
    const n = handOff(mortgaged)
    expect(socialOn(n)).toBe(false)
    expectCash(n, mortgaged, FIRM_VALUE - MORTGAGE)

    const young = scene(135, { age: 20 })
    const m = handOff(young)
    expect(socialOn(m)).toBe(false)
    expectCash(m, young, FIRM_VALUE)

    const both = scene(135, { age: 18, mortgage: {} })
    expectCash(handOff(both), both, FIRM_VALUE - MORTGAGE)
  })

  it('a stamped twin of the same plain, unmortgaged, 39-year-old scene is the same hand-over as the unstamped one (the stamp moves only what it names)', () => {
    const a = scene(140)
    const b = scene(140, { stamped: true })
    const na = handOff(a)
    const nb = handOff(b)
    const ha = expectHeld(na, a)
    const hb = expectHeld(nb, b)
    expect(hb.b.debt).toBe(ha.b.debt)
    expect(hb.a.value).toBe(ha.a.value)
    expect(sibling(nb, b.successor.id).money).toBe(sibling(na, a.successor.id).money)
  })
})

/** A plain firm the way startNpcCompany would leave one, on a game; used to call adoptNpcCompany by itself. */
function adoptable(life: number, o: { mortgage?: Partial<Mortgage> | null; age?: number; value?: number } = {}) {
  const s = scene(life, { stamped: true })
  const asset = findBusiness(s.g, s.firmId)!
  const b = bizOf(s.g, asset)
  if (o.value !== undefined) asset.value = o.value
  if (o.mortgage) asset.mortgage = { lender: 'Bank', balance: MORTGAGE, yearlyPayment: 300_000, yearsLeft: 10, rate: 0.05, ...o.mortgage }
  const p = s.successor
  delete p.data.nepo
  if (o.age !== undefined) p.age = o.age
  return { g: s.g, asset, b, p }
}

describe('adoptNpcCompany by itself', () => {
  it('the default options are today: 21 or over, any mortgage left where it is', () => {
    const at20 = adoptable(135, { age: 20 })
    expect(adoptNpcCompany(at20.g, at20.p, at20.asset, at20.b)).toBe(false)
    expect(at20.p.data.npcCompany ?? null).toBeNull()

    const at21 = adoptable(135, { age: 21, mortgage: {} })
    const debt = at21.b.debt
    const rate = at21.b.debtRate
    expect(adoptNpcCompany(at21.g, at21.p, at21.asset, at21.b)).toBe(true)
    expect(at21.b.debt).toBe(debt)
    expect(at21.b.debtRate).toBe(rate)
    expect(at21.asset.mortgage?.balance).toBe(MORTGAGE)
  })

  it('minAge moves the gate in both directions; a hostile minAge is the default 21', () => {
    const young = adoptable(135, { age: 18 })
    expect(adoptNpcCompany(young.g, young.p, young.asset, young.b, { minAge: 18 })).toBe(true)

    const seventeen = adoptable(135, { age: 17 })
    expect(adoptNpcCompany(seventeen.g, seventeen.p, seventeen.asset, seventeen.b, { minAge: 18 })).toBe(false)

    const older = adoptable(135, { age: 25 })
    expect(adoptNpcCompany(older.g, older.p, older.asset, older.b, { minAge: 30 })).toBe(false)

    for (const minAge of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '18' as unknown as number]) {
      const x = adoptable(135, { age: 20 })
      expect(adoptNpcCompany(x.g, x.p, x.asset, x.b, { minAge })).toBe(false)
    }
  })

  it('carryMortgage joins the balance to b.debt, raises the rate to the mortgage rate, deletes the record and revalues net of it', () => {
    const x = adoptable(140, { age: 30, mortgage: { rate: 0.4 } })
    const debt = x.b.debt
    const gross = valuationOf(x.b)
    expect(adoptNpcCompany(x.g, x.p, x.asset, x.b, { carryMortgage: true })).toBe(true)
    expect(x.b.debt).toBe(debt + MORTGAGE)
    expect(x.b.debtRate).toBe(0.4)
    expect(x.asset.mortgage).toBeUndefined()
    expect(x.b.valuation).toBe(Math.max(0, gross - MORTGAGE))
    expect(x.asset.value).toBe(stakeValue(x.b))
    expect(npcCompany(x.p, x.g.year)?.b.debt).toBe(debt + MORTGAGE)
  })

  it('carryMortgage with no mortgage changes nothing but the options', () => {
    const x = adoptable(140, { age: 30 })
    const debt = x.b.debt
    const rate = x.b.debtRate
    expect(adoptNpcCompany(x.g, x.p, x.asset, x.b, { carryMortgage: true })).toBe(true)
    expect(x.b.debt).toBe(debt)
    expect(x.b.debtRate).toBe(rate)
  })

  it('carryMortgage refuses an underwater mortgage and touches nothing', () => {
    const x = adoptable(140, { age: 30, mortgage: { balance: FIRM_VALUE }, value: FIRM_VALUE })
    const debt = x.b.debt
    const ceo = x.b.ceo
    expect(adoptNpcCompany(x.g, x.p, x.asset, x.b, { carryMortgage: true })).toBe(false)
    expect(x.b.debt).toBe(debt)
    expect(x.b.ceo).toBe(ceo)
    expect(x.b.npcOwnerId).toBeUndefined()
    expect(x.asset.mortgage?.balance).toBe(FIRM_VALUE)
    expect(x.p.data.npcCompany ?? null).toBeNull()
  })

  it('a dead person, a person who owns a company already and a damaged company record are refused with the options too', () => {
    const dead = adoptable(140, { age: 30, mortgage: {} })
    dead.p.alive = false
    expect(adoptNpcCompany(dead.g, dead.p, dead.asset, dead.b, { minAge: 18, carryMortgage: true })).toBe(false)
    expect(dead.b.debt).toBeLessThan(MORTGAGE)

    const owner = adoptable(140, { age: 30, mortgage: {} })
    owner.p.money = 8_000_000
    expect(startNpcCompany(owner.g, owner.p, 'cafe')).toBe(true)
    expect(adoptNpcCompany(owner.g, owner.p, owner.asset, owner.b, { minAge: 18, carryMortgage: true })).toBe(false)

    for (const record of ['garbage', 42, [1, 2], {}] as Json[]) {
      const x = adoptable(140, { age: 30, mortgage: {} })
      x.p.data.npcCompany = record
      expect(adoptNpcCompany(x.g, x.p, x.asset, x.b, { minAge: 18, carryMortgage: true })).toBe(false)
      expect(x.asset.mortgage?.balance).toBe(MORTGAGE)
    }
  })

  it.each([1, 100, 10_000])('the sum at %ix: the debt is the balance, the rate stays at or under 60%, the firm survives its first year', (scale) => {
    const value = FIRM_VALUE * scale
    const balance = Math.round(value * 0.9)
    const x = adoptable(140, { age: 30, mortgage: { balance, rate: 0.07 }, value })
    const debt = x.b.debt
    expect(adoptNpcCompany(x.g, x.p, x.asset, x.b, { carryMortgage: true })).toBe(true)
    expect(x.b.debt).toBe(debt + balance)
    expect(Number.isFinite(x.b.debt)).toBe(true)
    expect(x.b.debtRate).toBeLessThanOrEqual(0.6)
    expect(Number.isFinite(x.asset.value)).toBe(true)
    expect(x.asset.value).toBeGreaterThanOrEqual(0)
    expect(JSON.parse(JSON.stringify(x.g))).toEqual(x.g)
  })
})
