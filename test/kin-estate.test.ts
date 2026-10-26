// R4-L5 (D.5 d, X2, X36, X38, X42, C14): deaths through the estate path (src/game/modules/kin-estates.ts, the module life.estates). When a
// relative dies on a stamped life, the cash left on their record goes to their modeled family through the ledger, once, and the people
// who inherit it become Persons, so the stakes that the dead held pass to Person ids (business/dynasty-ownership.ts).
//
// What the file proves, in the order of the plan:
//   1. The module: id, layer, fact, the entry life/55 between sharedProjects and givingFund, the group rows, the source rules.
//   2. A sibling with $3M, a spouse and two kids dies: three Persons made once, the exact split, the dead record at 0, the books balance,
//      the rows are inheritance only; a second call, a clone, a reload and the next year pay nothing.
//   3. The edges of the rule: the remainder to the first heir, heirs that are Persons already, no heirs (the pool), the threshold, a stake
//      with no cash, exes, disowned relatives and pets, the fact and its 8 a year.
//   4. The sums at the ends ($1e12, $1e15 and past the booking cap) and the caps (7 a death, 12 a year, 30 kin Persons alive).
//   5. A dead co-owner's familyShares land on the spouse and the kids; a relative with no link answers as before.
//   6. An unstamped game is byte for byte the same, in one call and over five years of ageUp.
//   7. The real path: a sibling who dies in ageUp is settled in the same year; the hand-over settles an estate first.
//   8. Kin Persons have a life (X38): 30 of them over 40 years draw nothing from g.rng and book wages against pool:employers only, and a
//      nepo coworker with data.kin is not one of them.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf } from '../src/game/business/state'
import { familyStakeHeirs, settleLateFamilyOwners } from '../src/game/business/dynasty-ownership'
import { personCash } from '../src/game/cash'
import { relationLabel } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { GROUP_OF_SOURCE } from '../src/game/hubs/year-plan'
import { adoptChild, adoptSpouse } from '../src/game/kin'
import { personKey } from '../src/game/kernel/person-ref'
import { acctBalance, flowsOf, LEDGER_CAPS } from '../src/game/kernel/ledger'
import { getModule, withYearly, yearlyEntries } from '../src/game/kernel/registry'
import { continueAsChild } from '../src/game/life'
import { materializePerson } from '../src/game/materialize'
import { MODULES } from '../src/game/modules/index'
import { estatesModule, settleKinEstates } from '../src/game/modules/kin-estates'
import { npcLife, saveNpcLife } from '../src/game/npc-state'
import { yearlyNpcLife } from '../src/game/npc-lives'
import { createPerson } from '../src/game/people'
import { loadGame, saveGame } from '../src/game/save'
import { memorySaveBackend } from '../src/game/save-backends'
import { resetSaveStoreForTests, setSaveBackend } from '../src/game/save-store'
import type { GameState, Person } from '../src/game/types'
import { syncHoldings } from '../src/game/world/holdings'
import { readFacts } from '../src/game/world/facts'
import { kinHeirIds, KIN_CAPS, kinProblems, readKin } from '../src/game/world/kin'
import { metRecord } from '../src/game/world/met'
import { touchMet } from '../src/game/world/met-ops'
import { makeSid, parseSid } from '../src/game/world/sid'
import { socialOn } from '../src/game/world/social'
import { trapRng } from './effort-kit'
import { deepFreeze, installStorageShim } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { acctOf, expectConserved } from './ledger-kit'
import { kinGame, married, withLife } from './kin-kit'
import { findSeed } from './seed-kit'
import { cast, socialGame, socialLife } from './social-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const json = (x: unknown): string => JSON.stringify(x)
const isKinSid = (p: Person): boolean => parseSid(personKey(p))?.kind === 'kin'
const kinPersons = (g: GameState): Person[] => g.people.filter((p) => p.alive && isKinSid(p))
const reasonsOf = (g: GameState): string[] => flowsOf(g, g.year).map((r) => r.reason)
const person = (id: string): `person:${string}` => `person:${id}`

/** A sibling is dead the way handleDeath leaves them: not alive, the year and the cause written. Their cash is untouched. */
function die(g: GameState, p: Person): Person {
  p.alive = false
  p.causeOfDeath = 'Old Age'
  p.data.diedYear = g.year
  return p
}

interface Family {
  g: GameState
  dead: Person
  /** The sids of the spouse and the kids, in the order the estate reads them. */
  sids: string[]
}

/**
 * A stamped game with one married sibling who has a spouse and `kids` children on record (adoptSpouse, adoptChild: Met records and links,
 * no Person yet) and `cash` dollars booked to them from pool:other. The sibling is alive; die() when the test wants the death.
 */
function family(seed = 1, o: { kids?: number; spouse?: boolean; cash?: number; age?: number; wed?: boolean } = {}): Family {
  const g = kinGame(seed, 0)
  const dead = withLife(cast(g, 60, 'sibling', { age: o.age ?? 45, gender: 'female', firstName: 'Lena', lastName: g.character.lastName }))
  if (o.wed !== false) married(g, dead, 'Ana Ruiz')
  const sids: string[] = []
  if (o.spouse !== false) sids.push(adoptSpouse(g, dead, { gender: 'male' })!)
  const names = ['Sol', 'Eli', 'Mia', 'Noa', 'Kai', 'Zoe']
  for (let i = 0; i < (o.kids ?? 2); i++) sids.push(adoptChild(g, dead, { first: names[i % names.length]!, last: dead.lastName, gender: i % 2 === 0 ? 'female' : 'male' })!)
  if ((o.cash ?? 3_000_000) > 0) personCash(g, dead, o.cash ?? 3_000_000, 'prize')
  return { g, dead, sids }
}

/** Another anchor in the same game: a married sibling with `kids` children on record and `cash` booked. */
function anchor(g: GameState, kids: number, cash: number, o: { spouse?: boolean; relation?: 'sibling' | 'child' | 'parent' } = {}): { dead: Person; sids: string[] } {
  const dead = withLife(cast(g, 60, o.relation ?? 'sibling', { age: 45, gender: 'female', lastName: g.character.lastName }))
  married(g, dead, 'Ana Ruiz')
  const sids: string[] = []
  if (o.spouse !== false) sids.push(adoptSpouse(g, dead, { gender: 'male' })!)
  for (let i = 0; i < kids; i++) sids.push(adoptChild(g, dead, { first: `Kid${i}`, last: dead.lastName, gender: i % 2 === 0 ? 'female' : 'male' })!)
  if (cash > 0) personCash(g, dead, cash, 'prize')
  return { dead, sids }
}

const heirsOf = (g: GameState, sids: readonly string[]): Person[] => sids.map((s) => g.people.find((p) => personKey(p) === s)!).filter((p) => p !== undefined)

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The module

describe('the module life.estates', () => {
  it('is one yearly entry in the aging seam, life phase, order 55, layer 3, and declares the fact life.estate', () => {
    expect(estatesModule.id).toBe('life.estates')
    expect(estatesModule.layer).toBe(3)
    expect(estatesModule.facts).toEqual(['life.estate'])
    expect(estatesModule.yearly).toEqual([{ seam: 'aging', phase: 'life', order: 55, run: settleKinEstates }])
    expect(MODULES).toContain(estatesModule)
    expect(getModule('life.estates')).toMatchObject({ id: 'life.estates', layer: 3, facts: ['life.estate'] })
  })

  it('runs right after sharedProjects (50) and right before givingFund (60); 45 stays free and the kin step (37) is untouched', () => {
    const ids = yearlyEntries('aging').map((e) => e.id)
    expect(ids[ids.indexOf('yearly.sharedProjects') + 1]).toBe('life.estates')
    expect(ids[ids.indexOf('life.estates') + 1]).toBe('yearly.givingFund')
    expect(ids[ids.indexOf('life.kin') + 1]).toBe('yearly.relationships')
    expect(ids.filter((id) => id === 'life.estates')).toHaveLength(1)
  })

  it('sorts among the modules by id and is in the people group of both tables (X42, C14)', () => {
    const ids = MODULES.map((m) => m.id)
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    expect(GROUP_OF_SOURCE['life.estates']).toBe('people')
    expect(/'life\.estates': 'people'/.test(read('src/ui/components/logModel.ts'))).toBe(true)
  })

  it('keeps its source rules: no long dash, no luck, no money written outside the ledger, no sid property in an object literal', () => {
    const text = read('src/game/modules/kin-estates.ts')
    const code = text.replace(/\/\/.*$/gm, '')
    expect(DASH.test(text)).toBe(false)
    expect(/from '\.\.\/rng'|g\.rng|\brand(Int|Float)?\(|\bchance\(|\bweightedPick\(/.test(code)).toBe(false)
    expect(/\.money\s*(\+|-)?=[^=]/.test(code)).toBe(false)
    expect(/\b(addMoney|spend|earnIncome)\(/.test(code)).toBe(false)
    expect(/\bsid:\s*[^\s,}]/.test(code)).toBe(false)
  })

  it('the docs say it: the estate row of the ledger, the materialized kin and their limits', () => {
    const ledger = read('docs/LEDGER.md')
    expect(/\| `estate` \| family \| family \|[^\n]*NPC estate/.test(ledger)).toBe(true)
    const kin = read('docs/KIN.md')
    expect(kin).toContain('life.estates')
    expect(kin).toContain('estateY')
    expect(DASH.test(kin)).toBe(false)
    expect(DASH.test(ledger)).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. The estate of a sibling with a spouse and two kids

describe('a sibling with $3M, a spouse and two kids dies', () => {
  it('makes three Persons once, splits the cash exactly, empties the dead record, balances the books and books inheritance only', () => {
    const { g, dead, sids } = family(1)
    expect(sids).toHaveLength(3)
    die(g, dead)
    const next = g.nextId
    const rng = g.rng
    const rows = new Set(reasonsOf(g))
    settleKinEstates(g)

    const made = heirsOf(g, sids)
    expect(made).toHaveLength(3)
    expect(g.nextId).toBe(next + 3)
    expect(g.rng).toBe(rng)
    expect(made.map((p) => p.money)).toEqual([1_000_000, 1_000_000, 1_000_000])
    expect(dead.money).toBe(0)
    expect(dead.data.estateY).toBe(g.year)
    expect(made.every((p) => p.alive && p.relation === 'friend' && p.relationship === 40)).toBe(true)
    expect(made.map((p) => p.data.kin)).toEqual(['brother-in-law', 'niece', 'nephew'])
    expect(made.map((p) => relationLabel(p))).toEqual(['Brother-in-law', 'Niece', 'Nephew'])
    expect(made.map((p) => p.data.sid)).toEqual(sids)
    expect(made.map((p) => p.age)).toEqual([g.year - metRecord(g, sids[0]!)!.b, 0, 0])
    expect(kinHeirIds(g, dead)).toEqual(made.map((p) => p.id))
    expect(reasonsOf(g).filter((r) => !rows.has(r))).toEqual(['inheritance'])
    expect(acctOf(g, person(sids[0]!))).toBe(1_000_000)
    expectConserved(g)
    expect(kinProblems(g)).toEqual([])
  })

  it('says the fact life.estate once, for the dead relative, with the first heir and the sum', () => {
    const { g, dead, sids } = family(1)
    die(g, dead)
    const said = g.yearActions['life.facts'] ?? 0
    settleKinEstates(g)
    const facts = readFacts(g).filter((f) => f.k === 'life.estate')
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ k: 'life.estate', y: g.year, c: person(dead.id), a: sids[0], v: 3_000_000 })
    expect(g.yearActions['life.facts']).toBe(said + 1)
  })

  it('pays nothing on a second call, a clone, a reload through JSON and the next year', () => {
    const { g, dead } = family(1)
    die(g, dead)
    settleKinEstates(g)
    const once = json(g)
    settleKinEstates(g)
    expect(json(g)).toBe(once)
    const clone = structuredClone(g)
    settleKinEstates(clone)
    expect(json(clone)).toBe(once)
    const reload = JSON.parse(once) as GameState
    settleKinEstates(reload)
    expect(json(reload)).toBe(once)
    g.year += 1
    g.yearActions = {}
    const next = json(g)
    settleKinEstates(g)
    expect(json(g)).toBe(next)
  })

  it('pays nothing again after a real save and load', () => {
    const g = socialLife({ seed: 17, year: 1990, countryId: 'us' })
    const dead = withLife(cast(g, 60, 'sibling', { age: 45, gender: 'female', firstName: 'Lena', lastName: g.character.lastName }))
    married(g, dead, 'Ana Ruiz')
    adoptSpouse(g, dead, { gender: 'male' })
    adoptChild(g, dead, { first: 'Sol', last: dead.lastName, gender: 'female' })
    personCash(g, dead, 900_001, 'prize')
    die(g, dead)
    settleKinEstates(g)
    expect(kinPersons(g)).toHaveLength(2)
    resetSaveStoreForTests()
    installStorageShim()
    setSaveBackend(memorySaveBackend())
    try {
      expect(saveGame(g)).toBe(true)
      const back = loadGame()!
      expect(back).not.toBeNull()
      const before = json(back)
      settleKinEstates(back)
      expect(json(back)).toBe(before)
      expect(kinPersons(back).map((p) => p.money)).toEqual(kinPersons(g).map((p) => p.money))
      expectConserved(back)
    } finally {
      resetSaveStoreForTests()
    }
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. The edges of the rule

describe('the rule at its edges', () => {
  it('gives the remainder of whole dollars to the first heir and every part is a whole number', () => {
    const { g, dead, sids } = family(2, { cash: 1_000_000 })
    die(g, dead)
    settleKinEstates(g)
    expect(heirsOf(g, sids).map((p) => p.money)).toEqual([333_334, 333_333, 333_333])
    expect(dead.money).toBe(0)
    expectConserved(g)
  })

  it('rounds a record with cents to whole dollars and leaves nothing on it', () => {
    const { g, dead, sids } = family(2, { cash: 0 })
    dead.money = 1_000_000.4
    personCash(g, dead, 0, 'prize')
    die(g, dead)
    settleKinEstates(g)
    expect(heirsOf(g, sids).reduce((s, p) => s + p.money, 0)).toBe(1_000_000)
    expect(dead.money).toBe(0)
  })

  it('pays a heir who is a Person already, makes the others, and counts only the new ones in nextId', () => {
    const { g, dead, sids } = family(3)
    const spouse = materializePerson(g, sids[0]!, { relation: 'friend', age: 44, relationship: 40, data: { kin: 'brother-in-law' } })!
    die(g, dead)
    const next = g.nextId
    settleKinEstates(g)
    expect(g.nextId).toBe(next + 2)
    expect(g.people.filter((p) => personKey(p) === sids[0])).toEqual([spouse])
    expect(heirsOf(g, sids).map((p) => p.money)).toEqual([1_000_000, 1_000_000, 1_000_000])
    expectConserved(g)
  })

  it('leaves out a relative the records already count dead: the others share the estate', () => {
    const { g, dead, sids } = family(25)
    expect(touchMet(g, sids[0]!, { d: g.year - 1 })).toBe(true)
    die(g, dead)
    settleKinEstates(g)
    const made = heirsOf(g, sids)
    expect(made).toHaveLength(2)
    expect(made.map((p) => p.money)).toEqual([1_500_000, 1_500_000])
    expect(g.people.some((p) => personKey(p) === sids[0])).toBe(false)
    expect(dead.money).toBe(0)
    expectConserved(g)
  })

  it('with no heirs the pool takes the rest: no Person made, the record at 0, the books balance, reason estate only', () => {
    const { g, dead } = family(4, { kids: 0, spouse: false })
    expect(readKin(dead)).toEqual({ spouse: null, kids: [], y: 0 })
    die(g, dead)
    const people = g.people.length
    const rows = new Set(reasonsOf(g))
    const pool = acctBalance(g, 'pool:family')
    settleKinEstates(g)
    expect(g.people).toHaveLength(people)
    expect(dead.money).toBe(0)
    expect(dead.data.estateY).toBe(g.year)
    expect(reasonsOf(g).filter((r) => !rows.has(r))).toEqual(['estate'])
    expect(acctBalance(g, 'pool:family') - pool).toBe(3_000_000)
    expectConserved(g)
    const facts = readFacts(g).filter((f) => f.k === 'life.estate')
    expect(facts).toHaveLength(1)
    expect(facts[0]!.a).toBeUndefined()
  })

  it('a relative that never married and left cash behind: the pool takes it too, once', () => {
    const g = socialGame(5, { age: 40 })
    const dead = withLife(cast(g, 60, 'sibling', { age: 70 }))
    personCash(g, dead, 250_000, 'prize')
    die(g, dead)
    settleKinEstates(g)
    expect(dead.money).toBe(0)
    const once = json(g)
    settleKinEstates(g)
    expect(json(g)).toBe(once)
    expectConserved(g)
  })

  it('keeps the dust below half the last yearly income: no Person, no row, no estateY', () => {
    const { g, dead, sids } = family(6, { cash: 49_999 })
    const life = npcLife(dead)!
    life.income = 100_000
    saveNpcLife(dead, life)
    die(g, dead)
    const rows = new Set(reasonsOf(g))
    const people = g.people.length
    settleKinEstates(g)
    expect(dead.money).toBe(49_999)
    expect(dead.data.estateY).toBeUndefined()
    expect(g.people).toHaveLength(people)
    expect(heirsOf(g, sids)).toEqual([])
    expect(reasonsOf(g).filter((r) => !rows.has(r))).toEqual([])
    // At exactly half it settles.
    dead.money = 50_000
    settleKinEstates(g)
    expect(dead.data.estateY).toBe(g.year)
    expect(heirsOf(g, sids)).toHaveLength(3)
  })

  it('a record with a hostile estateY, money or kin links does not throw and pays only what is sound', () => {
    const { g, dead } = family(7)
    dead.data.estateY = 'never' as never
    dead.data.spouseSid = 'not a sid'
    dead.data.kidSids = [1, null, 'kin.us.2026.77'] as never
    die(g, dead)
    expect(() => settleKinEstates(g)).not.toThrow()
    expect(dead.money).toBe(0)
    expect(dead.data.estateY).toBe(g.year)
    const other = cast(g, 50, 'sibling', { age: 60 })
    other.alive = false
    other.money = Number.NaN
    expect(() => settleKinEstates(g)).not.toThrow()
    other.money = -5_000
    expect(() => settleKinEstates(g)).not.toThrow()
    expect(other.data.estateY).toBeUndefined()
    const odd = cast(g, 50, 'sibling', { age: 60 })
    odd.alive = false
    ;(odd as { data: unknown }).data = null
    expect(() => settleKinEstates(g)).not.toThrow()
    ;(g.people as unknown[]).push(null, 7, 'x')
    expect(() => settleKinEstates(g)).not.toThrow()
  })

  it('leaves an ex, an ex spouse, a disowned relative and a pet where they are, with their cash', () => {
    const { g, dead } = family(8)
    const ex = withLife(cast(g, 30, 'exSpouse', { age: 50 }))
    married(g, ex, 'Ana Ruiz')
    adoptChild(g, ex, { first: 'Kid', last: ex.lastName, gender: 'female' })
    const plain = withLife(cast(g, 30, 'ex', { age: 50 }))
    const kept = withLife(cast(g, 30, 'sibling', { age: 50 }))
    kept.data.disowned = true
    const pet = cast(g, 50, 'pet', { age: 12 })
    for (const p of [ex, plain, kept, pet]) {
      personCash(g, p, 400_000, 'prize')
      die(g, p)
    }
    die(g, dead)
    const before = [ex, plain, kept, pet].map((p) => json(p))
    settleKinEstates(g)
    expect([ex, plain, kept, pet].map((p) => json(p))).toEqual(before)
    expect([ex, plain, kept, pet].map((p) => p.money)).toEqual([400_000, 400_000, 400_000, 400_000])
    expect(dead.data.estateY).toBe(g.year)
  })

  it('does not touch the living', () => {
    const { g, dead } = family(9)
    const before = json(g)
    settleKinEstates(g)
    expect(json(g)).toBe(before)
    expect(dead.data.estateY).toBeUndefined()
  })

  it('a relative of a friend (no label) becomes a Person without data.kin', () => {
    const g = socialGame(10, { age: 40 })
    const { dead, sids } = anchor(g, 1, 100_000, { relation: 'parent' })
    die(g, dead)
    settleKinEstates(g)
    const made = heirsOf(g, sids)
    expect(made).toHaveLength(2)
    expect(made.every((p) => p.data.kin === undefined && p.relation === 'friend')).toBe(true)
  })

  it('emits at most 8 facts a year across Life, the counter shared with the kin step', () => {
    const g = kinGame(11, 0)
    g.yearActions['life.facts'] = 6
    const dead: Person[] = []
    for (let i = 0; i < 5; i++) dead.push(die(g, anchor(g, 0, 90_000 + i, { spouse: false }).dead))
    settleKinEstates(g)
    expect(readFacts(g).filter((f) => f.k === 'life.estate')).toHaveLength(2)
    expect(g.yearActions['life.facts']).toBe(8)
    expect(dead.every((p) => p.data.estateY === g.year && p.money === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 4. Sums and caps

describe('sums at the ends and the caps', () => {
  for (const cash of [1e12, 1e15]) {
    it(`a $${cash.toExponential(0)} estate splits exactly among three heirs`, () => {
      const { g, dead, sids } = family(12, { cash })
      die(g, dead)
      settleKinEstates(g)
      const parts = heirsOf(g, sids).map((p) => p.money)
      expect(parts.reduce((s, x) => s + x, 0)).toBe(cash)
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(2)
      expect(Number.isInteger(parts[0])).toBe(true)
      expect(dead.money).toBe(0)
      expectConserved(g)
    })
  }

  it('an estate past the booking cap pays at most the cap and the books still balance', () => {
    const { g, dead, sids } = family(13, { cash: 0 })
    dead.money = 5e15
    die(g, dead)
    expect(() => settleKinEstates(g)).not.toThrow()
    const paid = heirsOf(g, sids).reduce((s, p) => s + p.money, 0)
    expect(paid).toBeLessThanOrEqual(LEDGER_CAPS.maxBooking)
    expect(dead.money + paid).toBe(5e15)
    expect(dead.data.estateY).toBe(g.year)
  })

  it('a death makes at most 7 Persons, even when the kin list is hostile', () => {
    const { g, dead, sids } = family(14, { kids: 6 })
    expect(sids).toHaveLength(7)
    die(g, dead)
    settleKinEstates(g)
    expect(kinPersons(g)).toHaveLength(KIN_CAPS.heirs)
    expect(KIN_CAPS.heirs).toBe(7)
    expect(heirsOf(g, sids).reduce((s, p) => s + p.money, 0)).toBe(3_000_000)
    expect(g.yearActions['kin.persons']).toBe(7)
  })

  it('a year makes at most 12 Persons: the next death gets the places that are left, and the rest of the family waits for no one', () => {
    const g = kinGame(15, 0)
    const a = anchor(g, 6, 700_000)
    const b = anchor(g, 6, 700_000)
    const c = anchor(g, 6, 700_000)
    for (const x of [a, b, c]) die(g, x.dead)
    settleKinEstates(g)
    expect(heirsOf(g, a.sids)).toHaveLength(7)
    expect(heirsOf(g, b.sids)).toHaveLength(5)
    expect(heirsOf(g, c.sids)).toHaveLength(0)
    expect(g.yearActions['kin.persons']).toBe(12)
    expect(kinPersons(g)).toHaveLength(12)
    // The second estate split among the five who exist; the third, with nobody, went to the pool. Nothing is stranded.
    expect(heirsOf(g, b.sids).reduce((s, p) => s + p.money, 0)).toBe(700_000)
    expect(c.dead.money).toBe(0)
    expect([a, b, c].every((x) => x.dead.data.estateY === g.year)).toBe(true)
    expectConserved(g)
    // The next year the counter is new, and the dead are settled already, so nothing more is made.
    g.year += 1
    g.yearActions = {}
    settleKinEstates(g)
    expect(kinPersons(g)).toHaveLength(12)
  })

  it('at most 30 kin Persons are alive: the estate makes the places that are left and no more', () => {
    const g = kinGame(16, 0)
    for (let i = 0; i < 28; i++) {
      const sid = makeSid({ kind: 'kin', place: 'us', cohort: 2000, ord: i })
      expect(materializePerson(g, sid, { relation: 'friend', age: 26, relationship: 40, data: { kin: 'niece' } })).not.toBeNull()
    }
    expect(kinPersons(g)).toHaveLength(28)
    const a = anchor(g, 4, 500_000)
    die(g, a.dead)
    settleKinEstates(g)
    expect(kinPersons(g)).toHaveLength(KIN_CAPS.persons)
    expect(KIN_CAPS.persons).toBe(30)
    expect(heirsOf(g, a.sids)).toHaveLength(2)
    expect(heirsOf(g, a.sids).reduce((s, p) => s + p.money, 0)).toBe(500_000)
    // With 30 alive, the next estate has no Person to make and the cash goes to the pool.
    const b = anchor(g, 2, 300_000)
    die(g, b.dead)
    settleKinEstates(g)
    expect(kinPersons(g)).toHaveLength(30)
    expect(heirsOf(g, b.sids)).toHaveLength(0)
    expect(b.dead.money).toBe(0)
    expectConserved(g)
  })

  it('a dead kin Person does not count against the 30, and a nepo coworker with data.kin is not a kin Person at all', () => {
    const g = kinGame(17, 0)
    for (let i = 0; i < 29; i++) {
      const sid = makeSid({ kind: 'kin', place: 'us', cohort: 2000, ord: i })
      materializePerson(g, sid, { relation: 'friend', age: 26, relationship: 40, data: { kin: 'niece' } })
    }
    // The nepo code puts a string data.kin on a coworker (business/nepo-state.ts): it is not a kin Person and takes no place of the 30.
    const cowork = createPerson(g, { relation: 'coworker', age: 33, relationship: 50, money: 10, occupation: 'Clerk', traits: ['kind'], stats: { happiness: 60, health: 70, smarts: 50, looks: 50 }, livesWithPlayer: false, gender: 'female', firstName: 'Nepo', lastName: 'Kin', data: { kin: 'brother-in-law' } })
    const mark = json(cowork)
    expect(kinPersons(g)).toHaveLength(29)
    kinPersons(g)[0]!.alive = false
    expect(kinPersons(g)).toHaveLength(28)
    const a = anchor(g, 2, 400_000)
    die(g, a.dead)
    settleKinEstates(g)
    // Three are pending and 28 are alive: two places, not one (the dead one and the coworker are not counted).
    expect(heirsOf(g, a.sids)).toHaveLength(2)
    expect(kinPersons(g)).toHaveLength(KIN_CAPS.persons)
    expect(json(cowork)).toBe(mark)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. The stake

describe('a dead co-owner\'s stake', () => {
  /** A family cafe of which the dead sibling holds 40 percent, indexed in the holdings table. */
  function firm(g: GameState, owner: Person): ReturnType<typeof createBusinessAsset> {
    const a = createBusinessAsset(g, 'Family Cafe', newBiz(g, 'cafe', 'us', 'Chicago', { cash: 2_000_000, founded: 2020 }), 100_000)
    g.assets.push(a)
    const b = bizOf(g, a)
    b.share = 0.6
    b.familyShares = [{ id: owner.id, share: 0.4 }]
    syncHoldings(g)
    return a
  }

  it('lands on the spouse and the kids, in equal parts, the year the estate is settled', () => {
    const { g, dead, sids } = family(18, { cash: 0 })
    const a = firm(g, dead)
    die(g, dead)
    // Before the estate there are no Persons, so the stake would leave the family records.
    expect(familyStakeHeirs(g, dead)).toEqual([])
    settleKinEstates(g)
    const made = heirsOf(g, sids)
    expect(made).toHaveLength(3)
    expect(dead.money).toBe(0)
    expect(familyStakeHeirs(g, dead)).toEqual(made.map((p) => p.id))
    settleLateFamilyOwners(g)
    const shares = bizOf(g, a).familyShares ?? []
    expect(shares.map((s) => s.id)).toEqual(made.map((p) => p.id))
    expect(shares.reduce((s, x) => s + x.share, 0)).toBeCloseTo(0.4, 10)
    expect(shares.every((s) => Math.abs(s.share - 0.4 / 3) < 1e-9)).toBe(true)
    expect(bizOf(g, a).share).toBeCloseTo(0.6, 10)
    expect(reasonsOf(g)).not.toContain('inheritance')
  })

  it('pays the heirs of the stake as living holders afterwards, and the dead record gets nothing', () => {
    const { g, dead, sids } = family(19, { cash: 0 })
    const a = firm(g, dead)
    die(g, dead)
    settleKinEstates(g)
    settleLateFamilyOwners(g)
    const heirs = heirsOf(g, sids)
    expect((bizOf(g, a).familyShares ?? []).every((s) => heirs.some((h) => h.id === s.id))).toBe(true)
    expect(dead.money).toBe(0)
    expect(json(g.log)).toContain('as their heirs')
  })

  it('a relative with an unlinked family answers as before: nobody is modeled, the stake leaves the family records', () => {
    const g = socialGame(20, { age: 40 })
    for (const relation of ['sibling', 'child', 'grandchild'] as const) {
      const p = cast(g, 50, relation, { age: 52 })
      p.data.married = true
      p.data.kids = 2
      p.alive = false
      expect(familyStakeHeirs(g, p)).toEqual([])
    }
  })

  it('answers with the heirs for a linked sibling, child and grandchild, and is pure on a frozen state with a trapped rng', () => {
    const g = socialGame(21, { age: 40 })
    const dead: Person[] = []
    for (const relation of ['sibling', 'child', 'grandchild'] as const) {
      const a = anchor(g, relation === 'child' || relation === 'grandchild' ? 0 : 1, 0, { relation: relation === 'grandchild' ? 'child' : relation })
      if (relation === 'grandchild') a.dead.relation = 'grandchild'
      for (const sid of a.sids) materializePerson(g, sid, { relation: 'friend', age: 30, relationship: 40 })
      dead.push(die(g, a.dead))
    }
    trapRng(g)
    deepFreeze(g)
    const answers = dead.map((p) => familyStakeHeirs(g, p))
    expect(answers[0]).toHaveLength(2)
    expect(answers[1]).toHaveLength(1)
    expect(answers[2]).toHaveLength(1)
    expect(answers.flat().every((id) => g.people.some((p) => p.id === id && p.alive))).toBe(true)
    expect(dead.map((p) => familyStakeHeirs(g, p))).toEqual(answers)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. An unstamped game

describe('an unstamped game is untouched', () => {
  /** An unstamped game with a rich dead sibling whose legacy fields say married with kids, and a stamped twin of the same cast. */
  function pair(): { plain: GameState; dead: Person } {
    const g = makeTestGame(22, { age: 40 })
    const dead = withLife(createPerson(g, { relation: 'sibling', age: 60, relationship: 60, money: 3_000_000, occupation: 'Clerk', traits: ['kind'], stats: { happiness: 60, health: 70, smarts: 50, looks: 50 }, livesWithPlayer: false, gender: 'female', firstName: 'Lena', lastName: 'Test' }))
    married(g, dead, 'Ana Ruiz')
    dead.data.kids = 2
    die(g, dead)
    return { plain: g, dead }
  }

  it('one call changes no byte: the cash stays on the record, no Person, no key, no row', () => {
    const { plain, dead } = pair()
    expect(socialOn(plain)).toBe(false)
    const before = json(plain)
    settleKinEstates(plain)
    expect(json(plain)).toBe(before)
    expect(dead.money).toBe(3_000_000)
    expect(dead.data.estateY).toBeUndefined()
  })

  it('five years of ageUp are the same with the module and without it', () => {
    const a = pair().plain
    const b = structuredClone(a)
    for (let i = 0; i < 5; i++) {
      ageUp(a)
      a.queue = []
    }
    const without = yearlyEntries('aging').filter((e) => e.id !== 'life.estates')
    withYearly('aging', without, () => {
      for (let i = 0; i < 5; i++) {
        ageUp(b)
        b.queue = []
      }
    })
    expect(json(b)).toBe(json(a))
    expect(a.people.some((p) => p.data.estateY !== undefined)).toBe(false)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 7. The real path

describe('the real path', () => {
  it('a sibling who dies in ageUp is settled in the same year, after the legacy inheritance and before the stakes', () => {
    const seed = findSeed(
      (s) => {
        const f = family(s, { kids: 2, spouse: false, wed: false, cash: 2_000_001, age: 101 })
        f.dead.stats.health = 4
        ageUp(f.g)
        f.g.queue = []
        return !f.dead.alive && kinPersons(f.g).length === 2
      },
      { label: 'an old sibling with two kids dies in the next year', tries: 120 },
    )
    const { g, dead, sids } = family(seed, { kids: 2, spouse: false, wed: false, cash: 2_000_001, age: 101 })
    dead.stats.health = 4
    ageUp(g)
    g.queue = []
    expect(dead.alive).toBe(false)
    expect(dead.data.estateY).toBe(dead.data.diedYear)
    const heirs = heirsOf(g, sids)
    expect(heirs).toHaveLength(2)
    // The player's legacy share (a tenth to three tenths, when the dice gave one) left the record first; the heirs got the rest, to the dollar.
    const paid = heirs.reduce((s, p) => s + p.money, 0)
    expect(paid).toBeGreaterThanOrEqual(Math.floor(2_000_001 * 0.7))
    expect(paid).toBeLessThanOrEqual(2_000_001)
    expect(dead.money).toBe(0)
    expect(readFacts(g).filter((f) => f.k === 'life.estate' && f.c === person(dead.id))).toHaveLength(1)
    expectConserved(g)
    // The next year settles nothing more for the same death.
    ageUp(g)
    g.queue = []
    expect(dead.data.estateY).toBe(dead.data.diedYear)
    expect(readFacts(g).filter((f) => f.k === 'life.estate' && f.c === person(dead.id))).toHaveLength(1)
    expect(kinPersons(g)).toHaveLength(2)
  }, 120_000)

  it('the hand-over settles an estate that nobody settled yet, before the stakes of the late are read', () => {
    const g = socialGame(23, { age: 82, money: 2_000_000 })
    const kid = cast(g, 70, 'child', { age: 50, lastName: g.character.lastName })
    const dead = withLife(cast(g, 60, 'sibling', { age: 70, lastName: g.character.lastName, gender: 'female' }))
    married(g, dead, 'Ana Ruiz')
    const sid = adoptSpouse(g, dead, { gender: 'male' })!
    personCash(g, dead, 600_000, 'prize')
    const a = createBusinessAsset(g, 'Sibling Cafe', newBiz(g, 'cafe', 'us', 'Chicago', { cash: 2_000_000, founded: 2020 }), 100_000)
    g.assets.push(a)
    bizOf(g, a).familyShares = [{ id: dead.id, share: 0.3 }]
    bizOf(g, a).share = 0.7
    syncHoldings(g)
    die(g, dead)
    killCharacter(g, 'Heart Attack')
    g.queue = []
    const n = continueAsChild(g, kid.id)
    const spouse = n.people.find((p) => personKey(p) === sid)
    expect(spouse, 'the spouse became a Person in the hand-over').toBeDefined()
    expect(spouse!.money).toBeGreaterThan(0)
    expect(n.people.find((p) => p.id === dead.id)?.data.estateY).toBe(n.year)
    const firmNow = n.assets.find((x) => x.kind === 'business')
    const holders = firmNow === undefined ? [] : (bizOf(n, firmNow).familyShares ?? []).map((s) => s.id)
    expect(holders).toContain(spouse!.id)
    expectConserved(n)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 8. Kin Persons have a life (X38)

describe('kin Persons have a life', () => {
  function kinWorld(count: number): GameState {
    const g = kinGame(24, 0)
    for (let i = 0; i < count; i++) {
      const sid = makeSid({ kind: 'kin', place: 'us', cohort: 1980 + (i % 20), ord: i })
      const p = materializePerson(g, sid, { relation: 'friend', age: 22 + (i % 30), relationship: 40, data: { kin: i % 2 === 0 ? 'niece' : 'nephew' } })
      expect(p).not.toBeNull()
    }
    return g
  }

  it('30 of them over 40 years draw nothing from g.rng and book wages against pool:employers only', () => {
    const g = kinWorld(30)
    trapRng(g)
    let wages = 0
    const start = acctOf(g, 'pool:employers')
    for (let y = 0; y < 40; y++) {
      g.year += 1
      g.yearActions = {}
      for (const p of g.people) {
        p.age += 1
        yearlyNpcLife(g, p)
      }
      for (const row of flowsOf(g, g.year)) if (row.reason === 'wage') wages += row.net.person
    }
    expect(wages).toBeGreaterThan(0)
    expect(acctOf(g, 'pool:employers') - start).toBe(-wages)
    for (const row of flowsOf(g, g.year).filter((r) => r.reason === 'wage')) expect(row.net.pool).toBe(-row.net.person)
    for (const p of g.people) {
      expect(Number.isFinite(p.money)).toBe(true)
      expect(p.money).toBeLessThan(1e9)
    }
    expectConserved(g)
  }, 120_000)

  it('a nepo coworker with data.kin reads as it did: its relation, its kin word and its life are its own', () => {
    const g = kinWorld(3)
    const cowork = createPerson(g, { relation: 'coworker', age: 33, relationship: 50, money: 10, occupation: 'Clerk', traits: ['kind'], stats: { happiness: 60, health: 70, smarts: 50, looks: 50 }, livesWithPlayer: false, gender: 'female', firstName: 'Nepo', lastName: 'Kin', data: { kin: 'sister-in-law' } })
    const mark = json({ relation: cowork.relation, kin: cowork.data.kin, sid: cowork.data.sid })
    const a = anchor(g, 2, 200_000)
    die(g, a.dead)
    settleKinEstates(g)
    expect(json({ relation: cowork.relation, kin: cowork.data.kin, sid: cowork.data.sid })).toBe(mark)
    expect(isKinSid(cowork)).toBe(false)
    expect(relationLabel(cowork)).toBe('Coworker')
    expect(kinPersons(g)).toHaveLength(3 + 3)
    // Both kinds of person run a life: the coworker has a string data.kin and the niece is a friend.
    expect(() => yearlyNpcLife(g, cowork)).not.toThrow()
    expect(npcLife(cowork)).not.toBeNull()
  })

  it('records the limits in the docs: a niece has a life, the 30 and the 12, and what the step does not do', () => {
    const kin = read('docs/KIN.md')
    expect(kin).toMatch(/materialized/i)
    expect(kin).toContain('pool:employers')
    expect(kin).toMatch(/30/)
    expect(kin).toMatch(/12/)
  })
})
