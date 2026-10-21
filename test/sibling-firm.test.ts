// R0-13: a designated sibling keeps the family firm as a company, not as a pile of cash.
// When the player continues as a different child, the designated successor is an NPC afterwards.
// Before this fix the firm was turned into round(value - mortgage) of liquid cash and the company
// vanished from the world. Now a plain, unmortgaged, single-owner firm is adopted as an NPC company.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { designateSuccessor, hireRelative } from '../src/game/business/nepo-actions'
import { successorOf } from '../src/game/business/nepo-state'
import { bizOf, findBusiness } from '../src/game/business/state'
import { killCharacter } from '../src/game/death'
import { continueAsChild } from '../src/game/life'
import { npcCompany, npcLife, startNpcCompany } from '../src/game/npc-lives'
import type { GameState, Json, Person } from '../src/game/types'
import { drain, kid, world } from './nepo-kit'

const FIRM_VALUE = 12_000_000

interface Scene {
  g: GameState
  firmId: string
  successor: Person
  willHeir: Person
  /** The successor's cash just before the parent dies. */
  baseMoney: number
}

/** A $12M family firm, a designated successor (employed at it) and a different sole will heir. */
function scene(seed: number, before?: (s: Scene) => void): Scene {
  const { g, a, b } = world(seed, { age: 78 })
  const successor = kid(g, 39, { smarts: 88 })
  const willHeir = kid(g, 36, { smarts: 65 })
  expect(hireRelative(g, a, b, successor, { rank: 2 }, { quiet: true }).ok).toBe(true)
  expect(designateSuccessor(g, a, bizOf(g, a), successor, { quiet: true }).ok).toBe(true)
  g.character.willBeneficiaries = [willHeir.id]
  a.value = FIRM_VALUE
  g.character.money = 0
  const s: Scene = { g, firmId: a.id, successor, willHeir, baseMoney: successor.money }
  before?.(s)
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

describe('a designated sibling keeps the family firm', () => {
  it.each([135, 140, 150])('seed %i: cash is untouched and the sibling holds the company, which then runs for six years', (seed) => {
    const s = scene(seed)
    const n = handOff(s)
    const sib = sibling(n, s.successor.id)
    expect(sib.money).toBe(s.baseMoney)
    const held = npcCompany(sib, n.year)
    expect(held?.a.id).toBe(s.firmId)
    expect(held?.b.npcOwnerId).toBe(sib.id)
    expect(held?.b.ceo).toBe('manager')
    expect(sib.occupation).toBe('Business Owner')
    expect(sib.data.nepo).toBeUndefined()
    expect(findBusiness(n, s.firmId)).toBeUndefined()
    expect(sib.notes.some((note) => /inherited .*designated successor/i.test(note))).toBe(true)
    expect(JSON.parse(JSON.stringify(n))).toEqual(n)

    for (let year = 0; year < 6; year++) {
      ageUp(n)
      drain(n)
    }
    const after = sibling(n, s.successor.id)
    const failed = (npcLife(after)?.history ?? []).some((line) => /failed; the business was liquidated/.test(line))
    expect(npcCompany(after, n.year) !== null || failed).toBe(true)
    expect(JSON.parse(JSON.stringify(n))).toEqual(n)
  })
})

describe('the sibling still gets cash when the firm cannot be held', () => {
  it('a sibling who already owns a company keeps that one and gets the equity as cash', () => {
    let own = ''
    const s = scene(135, (x) => {
      x.successor.money = 8_000_000
      expect(startNpcCompany(x.g, x.successor, 'cafe')).toBe(true)
      own = npcCompany(x.successor, x.g.year)!.a.id
    })
    const n = handOff(s)
    const sib = sibling(n, s.successor.id)
    expect(npcCompany(sib, n.year)?.a.id).toBe(own)
    expect(sib.money).toBe(s.baseMoney + FIRM_VALUE)
    expect(sib.data.nepo).toBeUndefined()
    expect(sib.occupation).toBe('Business Owner')
  })

  it('a mortgaged firm becomes the net equity in cash and no company', () => {
    const s = scene(135, (x) => {
      findBusiness(x.g, x.firmId)!.mortgage = { lender: 'Bank', balance: 2_000_000, yearlyPayment: 300_000, yearsLeft: 10, rate: 0.05 }
    })
    const n = handOff(s)
    const sib = sibling(n, s.successor.id)
    expect(sib.money).toBe(s.baseMoney + FIRM_VALUE - 2_000_000)
    expect(npcCompany(sib, n.year)).toBeNull()
    expect(sib.occupation).toBe('Business Owner')
    expect(sib.data.nepo).toBeUndefined()
  })

  it('a firm with family co-owners stays a shared holding, not an adopted company', () => {
    const s = scene(135, (x) => {
      const cousin = kid(x.g, 30)
      const b = bizOf(x.g, findBusiness(x.g, x.firmId)!)
      b.share = 0.7
      b.familyShares = [{ id: cousin.id, share: 0.3 }]
    })
    const n = handOff(s)
    const sib = sibling(n, s.successor.id)
    expect(npcCompany(sib, n.year)).toBeNull()
    expect(sib.money).toBe(s.baseMoney)
    expect(findBusiness(n, s.firmId)).toBeDefined()
    expect(bizOf(n, findBusiness(n, s.firmId)!).familyShares?.some((x) => x.id === s.successor.id)).toBe(true)
  })

  it('a sibling under 21 gets cash, as before', () => {
    const s = scene(135, (x) => {
      x.successor.age = 20
    })
    const n = handOff(s)
    const sib = sibling(n, s.successor.id)
    expect(npcCompany(sib, n.year)).toBeNull()
    expect(sib.money).toBe(s.baseMoney + FIRM_VALUE)
  })
})

describe('claiming a company the child already owned is unchanged', () => {
  it('the continuing child gets their own NPC company back as a player asset', () => {
    const { g } = world(136, { age: 78 })
    const heir = kid(g, 34, { smarts: 80 })
    heir.money = 8_000_000
    expect(startNpcCompany(g, heir, 'cafe')).toBe(true)
    const own = npcCompany(heir, g.year)!.a.id
    g.character.money = 0
    killCharacter(g, 'Old Age')
    g.queue = []
    const n = continueAsChild(g, heir.id)
    const claimed = findBusiness(n, own)
    expect(claimed).toBeDefined()
    expect(bizOf(n, claimed!).npcOwnerId).toBeUndefined()
  })

  it('a firm the sibling was handed can later be claimed by the same path', () => {
    const s = scene(140)
    const n = handOff(s)
    const sib = sibling(n, s.successor.id)
    expect(npcCompany(sib, n.year)?.a.id).toBe(s.firmId)
    // The next generation: this person is now the dead player's child.
    sib.relation = 'child'
    n.character.money = 0
    killCharacter(n, 'Old Age')
    n.queue = []
    const next = continueAsChild(n, sib.id)
    const claimed = findBusiness(next, s.firmId)
    expect(claimed).toBeDefined()
    expect(bizOf(next, claimed!).npcOwnerId).toBeUndefined()
    expect(JSON.parse(JSON.stringify(next))).toEqual(next)
  })
})

describe('a damaged company record on the sibling', () => {
  const hostile: [string, Json][] = [
    ['details is a string', { id: 'ghost', name: 'Ghost Café', kind: 'business', details: 'garbage' }],
    ['details is nonsense fields', { id: 'ghost', name: 'Ghost Café', kind: 'business', details: { outlets: 'many', share: 'half', industry: 99, manager: 7 } }],
    ['the record is a string', 'garbage'],
    ['the record is a number', 42],
    ['the record is a list', [1, 2, 3]],
    ['the record is empty', {}],
  ]
  it.each(hostile)('%s: no throw, and the sibling gets the equity as cash', (_label, record) => {
    const s = scene(135, (x) => {
      x.successor.data.npcCompany = record
    })
    let n: GameState | undefined
    expect(() => {
      n = handOff(s)
    }).not.toThrow()
    const sib = sibling(n!, s.successor.id)
    expect(sib.money).toBe(s.baseMoney + FIRM_VALUE)
    expect(sib.occupation).toBe('Business Owner')
    expect(sib.data.nepo).toBeUndefined()
    expect(npcCompany(sib, n!.year)?.a.id).not.toBe(s.firmId)
    expect(JSON.parse(JSON.stringify(n))).toEqual(n)
  })
})
