import { describe, expect, it } from 'vitest'
import {
  adoptionMenu,
  adoptionRejection,
  dateAgeRange,
  divorce,
  hookUpWith,
  loveMenu,
  makeCandidate,
  performWedding,
  petsMenu,
  planWedding,
  playerPregnancy,
  processPregnancies,
  proposeTo,
  sanitizeName,
  tryForBaby,
} from '../src/game/love'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, InputModal, MenuAction, MenuGroup, MenuNode, ModalItem, NoticeModal, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

// --- helpers ------------------------------------------------------------------

function find(nodes: MenuNode[], id: string): MenuNode {
  const n = nodes.find((x) => 'id' in x && x.id === id)
  if (!n) throw new Error(`no menu node ${id} in [${nodes.map((x) => ('id' in x ? x.id : '?')).join(', ')}]`)
  return n
}

function act(g: GameState, menu: MenuGroup, id: string): MenuAction {
  return find(menu.children(g), id) as MenuAction
}

function take<K extends ModalItem['kind']>(g: GameState, kind: K, scriptId?: string): Extract<ModalItem, { kind: K }> {
  const i = g.queue.findIndex((m) => m.kind === kind && (!scriptId || ('scriptId' in m && m.scriptId === scriptId)))
  if (i < 0) throw new Error(`no ${kind} ${scriptId ?? ''} in queue: ${g.queue.map((m) => m.kind + ('scriptId' in m ? `:${m.scriptId}` : '')).join(', ')}`)
  return g.queue.splice(i, 1)[0] as Extract<ModalItem, { kind: K }>
}

function answer(g: GameState, scriptId: string, choiceId: string): ChoiceModal {
  const m = take(g, 'choice', scriptId)
  expect(m.choices.map((c) => c.id)).toContain(choiceId)
  runScript(g, scriptId, choiceId, m.data, m)
  return m
}

function hasChoice(g: GameState, scriptId: string): boolean {
  return g.queue.some((m) => m.kind === 'choice' && m.scriptId === scriptId)
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function adultGame(seed: number, money = 200_000, extra: Partial<GameState['character']> = {}): GameState {
  return makeTestGame(seed, {
    age: 30,
    money,
    residence: { status: 'owned' },
    job: { defId: 'x', title: 'Accountant', company: 'Acme', category: 'fulltime', salary: 60_000, level: 0, performance: 60, yearsInRole: 1, yearsAtCompany: 1, data: {} },
    ...extra,
  })
}

function girlfriend(g: GameState, rel = 100): Person {
  return createPerson(g, { relation: 'partner', gender: 'female', age: g.character.age, lastName: 'Lovelace', relationship: rel, data: { datingSince: g.character.age - 4 } })
}

// --- love menu -------------------------------------------------------------------

describe('loveMenu', () => {
  it('is locked for young kids and prisoners', () => {
    expect(loveMenu.disabledReason?.(makeTestGame(1, { age: 12 }))).toBeTruthy()
    expect(loveMenu.disabledReason?.(makeTestGame(1, { age: 13 }))).toBeNull()
    const prisoner = makeTestGame(1, { age: 30 })
    prisoner.character.prison = { name: 'Pen', security: 'minimum', crime: 'Fraud', sentenceYears: 2, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 }
    expect(loveMenu.disabledReason?.(prisoner)).toBeTruthy()
  })

  it('keeps teens dating teens, and hook-ups and the app for adults', () => {
    expect(dateAgeRange(15)).toEqual([13, 17])
    expect(dateAgeRange(13)[0]).toBe(13)
    const [lo, hi] = dateAgeRange(40)
    expect(lo).toBeGreaterThanOrEqual(18)
    expect(hi).toBeGreaterThan(40)
    const teen = makeTestGame(1, { age: 15 })
    expect(act(teen, loveMenu, 'date').disabledReason?.(teen)).toBeNull()
    expect(act(teen, loveMenu, 'hookup').disabledReason?.(teen)).toBeTruthy()
    expect(act(teen, loveMenu, 'datingApp').disabledReason?.(teen)).toBeTruthy()
  })

  it('Date shows a candidate of the right age and can start a relationship', () => {
    let dated = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = makeTestGame(seed, { age: 15, stats: { happiness: 80, health: 90, smarts: 60, looks: 90 } })
      act(g, loveMenu, 'date').run(g)
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'love.date.pick')!
      const age = Number(/, (\d+) \(/.exec(m.text)?.[1])
      expect(age).toBeGreaterThanOrEqual(13)
      expect(age).toBeLessThanOrEqual(17)
      answer(g, 'love.date.pick', 'ask')
      const partner = g.people.find((p) => p.relation === 'partner')
      if (partner) {
        dated++
        expect(partner.gender).toBe('female')
        expect(g.counters.partners).toBe(1)
        expect(act(g, loveMenu, 'date').disabledReason?.(g)).toMatch(/already/)
      }
    }
    expect(dated).toBeGreaterThan(5)
  })

  it('the dating app charges per swipe and refuses when broke', () => {
    const g = makeTestGame(3, { age: 25, money: 1000 })
    act(g, loveMenu, 'datingApp').run(g)
    answer(g, 'love.app.age', '20')
    answer(g, 'love.app.worth', 'any')
    expect(g.character.money).toBe(900)
    expect(hasChoice(g, 'love.app.match')).toBe(true)

    const broke = makeTestGame(3, { age: 25, money: 0 })
    act(broke, loveMenu, 'datingApp').run(broke)
    answer(broke, 'love.app.age', '20')
    answer(broke, 'love.app.worth', 'any')
    expect(broke.character.money).toBe(0)
    expect(notices(broke)[0].text).toMatch(/afford/)
  })

  it('hook-ups create a fling, count, and can pass on an STD', () => {
    let stds = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = makeTestGame(seed, { age: 25 })
      const k = makeCandidate(g, { minAge: 22, maxAge: 28 })
      k.std = true
      hookUpWith(g, k)
      const fling = g.people.find((p) => p.relation === 'ex' && p.data.fling === true)
      expect(fling).toBeTruthy()
      expect(g.counters.hookups).toBe(1)
      if (g.character.conditions.some((c) => c.kind === 'std')) stds++
    }
    expect(stds).toBeGreaterThan(3)
    expect(stds).toBeLessThan(30)
  })

  it('refuses hook-ups with minors', () => {
    const g = makeTestGame(1, { age: 17 })
    const k = makeCandidate(g, { minAge: 17, maxAge: 17 })
    hookUpWith(g, k)
    expect(g.people.length).toBe(0)
    expect(notices(g)[0].text).toMatch(/adults/)
  })
})

// --- proposals, weddings, divorce ----------------------------------------------------

describe('marriage', () => {
  it('proposal with a ring can lead to an engagement and the ring costs money', () => {
    let engaged = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = adultGame(seed)
      const gf = girlfriend(g)
      proposeTo(g, gf)
      answer(g, 'love.propose.ring', 'diamond')
      expect(g.character.money).toBeLessThan(200_000)
      if (gf.relation === 'fiance') {
        engaged++
        expect(gf.data.ring).toBe('Diamond ring')
      }
    }
    expect(engaged).toBeGreaterThan(6)
  })

  it('a full wedding: venue, prenup and honeymoon', () => {
    const g = adultGame(4, 100_000)
    const gf = girlfriend(g)
    gf.relation = 'fiance'
    gf.data.engagedAge = 29
    planWedding(g, gf)
    answer(g, 'love.wedding.venue', 'courthouse')
    expect(g.character.money).toBe(100_000 - 250)
    answer(g, 'love.wedding.prenup', 'none')
    answer(g, 'love.wedding.honeymoon', 'none')
    expect(gf.relation).toBe('spouse')
    expect(gf.livesWithPlayer).toBe(true)
    expect(gf.data.prenup).toBe(false)
    expect(g.counters.marriages).toBe(1)
    expect(notices(g).some((n) => n.title === 'Just Married!')).toBe(true)
    // Different last names: you get to pick.
    answer(g, 'love.wedding.surname', 'hyphen')
    expect(g.character.lastName).toBe('Player-Lovelace')
    expect(g.flags.birthSurname).toBe('Player')
  })

  it('cannot marry under 18 or afford a venue you cannot pay for', () => {
    const teen = makeTestGame(1, { age: 17 })
    const bf = createPerson(teen, { relation: 'fiance', gender: 'female', age: 17 })
    planWedding(teen, bf)
    expect(notices(teen)[0].text).toMatch(/not old enough/)

    const poor = adultGame(1, 100)
    const gf = girlfriend(poor)
    gf.relation = 'fiance'
    planWedding(poor, gf)
    answer(poor, 'love.wedding.venue', 'castle')
    expect(poor.character.money).toBe(100)
    expect(gf.relation).toBe('fiance')
    expect(notices(poor)[0].text).toMatch(/afford/)
  })

  it('a spouse with kids from a previous relationship brings stepchildren', () => {
    const g = adultGame(2)
    const gf = girlfriend(g)
    gf.age = 38
    gf.relation = 'fiance'
    gf.data.priorKidsRolled = true
    gf.data.priorKids = 2
    performWedding(g, gf, { venue: 'backyard', prenup: true, honeymoon: null })
    const steps = g.people.filter((p) => p.relation === 'stepchild')
    expect(steps.length).toBe(2)
    for (const s of steps) expect(s.data.viaSpouseId).toBe(gf.id)
    // ...and they leave with their parent in a divorce.
    g.queue = []
    divorce(g, gf, 'player')
    expect(g.people.filter((p) => p.relation === 'stepchild').length).toBe(0)
  })

  it('divorce with a prenup keeps your money; without one it gets split', () => {
    const a = adultGame(5, 400_000)
    const wifeA = createPerson(a, { relation: 'spouse', gender: 'female', age: 30, money: 10_000, data: { prenup: true, marriedAge: 25 } })
    divorce(a, wifeA, 'player')
    expect(a.character.money).toBe(400_000)
    expect(wifeA.relation).toBe('exSpouse')
    expect(a.counters.divorces).toBe(1)

    const b = adultGame(5, 400_000)
    const wifeB = createPerson(b, { relation: 'spouse', gender: 'female', age: 30, money: 10_000, data: { prenup: false, marriedAge: 25 } })
    divorce(b, wifeB, 'player')
    expect(b.character.money).toBeLessThan(400_000)
    expect(b.character.money).toBeGreaterThanOrEqual(0)
    expect(wifeB.money).toBeGreaterThan(10_000)
    expect(notices(b)[0].text).toMatch(/judge/)
  })
})

// --- pregnancy -------------------------------------------------------------------

describe('pregnancy', () => {
  it('a female player can get pregnant and gives birth at the next age-up', () => {
    let pregnant = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = makeTestGame(seed, { age: 27, gender: 'female', sexuality: 'straight' })
      const husband = createPerson(g, { relation: 'spouse', gender: 'male', age: 28, relationship: 95, livesWithPlayer: true })
      tryForBaby(g, husband)
      if (!playerPregnancy(g)) continue
      pregnant++
      g.queue = []
      g.character.age = 28
      processPregnancies(g)
      expect(playerPregnancy(g)).toBeNull()
      const baby = g.people.find((p) => p.relation === 'child')
      if (!baby) continue // a rare miscarriage
      expect(baby.otherParentId).toBe(husband.id)
      const input = take(g, 'input', 'love.baby.name') as InputModal
      runScript(g, 'love.baby.name', '', input.data, input)
      expect(baby.firstName.length).toBeGreaterThan(0)
    }
    expect(pregnant).toBeGreaterThan(3)
  })

  it('same-sex couples cannot conceive naturally', () => {
    const g = makeTestGame(1, { age: 30, gender: 'female', sexuality: 'gay' })
    const wife = createPerson(g, { relation: 'spouse', gender: 'female', age: 30, relationship: 100 })
    tryForBaby(g, wife)
    expect(playerPregnancy(g)).toBeNull()
    expect(wife.pregnant).toBeFalsy()
    expect(notices(g)[0].text).toMatch(/adoption|surrogate|clinic/)
  })

  it('sanitizes baby names', () => {
    expect(sanitizeName('  bob <script>  ', 'X')).toBe('Bob Script')
    expect(sanitizeName('123', 'Fallback')).toBe('Fallback')
  })
})

// --- adoption --------------------------------------------------------------------

describe('adoptionMenu', () => {
  it('rejects applicants who are too young, broke, or have a record', () => {
    expect(adoptionRejection(adultGame(1, 200_000, { age: 19 }))).toBe('Age')
    expect(adoptionRejection(adultGame(1, 200_000, { criminalRecord: [{ crime: 'Theft', age: 20, caught: true, convicted: true }] }))).toBe('Criminal Record')
    expect(adoptionRejection(adultGame(1, 200_000, { residence: { status: 'parents' } }))).toBe('Housing')
    expect(adoptionRejection(adultGame(1, 200_000))).toBeNull()
  })

  it('adopting creates a non-biological child and counts it', () => {
    const g = adultGame(8)
    const domestic = act(g, adoptionMenu, 'adopt.domestic')
    expect(domestic.disabledReason?.(g)).toBeNull()
    domestic.run(g)
    const m = take(g, 'choice', 'love.adopt.pick')
    runScript(g, 'love.adopt.pick', '0', m.data, m)
    const kid = g.people.find((p) => p.relation === 'child')
    expect(kid).toBeTruthy()
    expect(kid!.biological).toBe(false)
    expect(kid!.data.adopted).toBe(true)
    expect(kid!.livesWithPlayer).toBe(true)
    expect(g.counters.adoptions).toBe(1)
    expect(g.character.money).toBeLessThan(200_000)
    if (hasChoice(g, 'love.adopt.surname')) {
      answer(g, 'love.adopt.surname', 'change')
      expect(kid!.lastName).toBe('Player')
    }
  })

  it('shows the rejection reason instead of children', () => {
    const g = adultGame(8, 200_000, { age: 19 })
    act(g, adoptionMenu, 'adopt.international').run(g)
    expect(hasChoice(g, 'love.adopt.pick')).toBe(false)
    expect(notices(g)[0].text).toMatch(/Reason: Age/)
  })
})

// --- pets -------------------------------------------------------------------------

describe('petsMenu', () => {
  it('buys a pet from the shelter and lets you name it', () => {
    const g = adultGame(9, 5000)
    act(g, petsMenu, 'pets.shelter').run(g)
    const m = take(g, 'choice', 'love.pet.pick')
    runScript(g, 'love.pet.pick', '0', m.data, m)
    const pet = g.people.find((p) => p.relation === 'pet')
    expect(pet).toBeTruthy()
    expect(['Dog', 'Cat', 'Rabbit', 'Guinea Pig']).toContain(pet!.species)
    expect(pet!.breed).toBeTruthy()
    expect(g.counters.pets).toBe(1)
    expect(g.character.money).toBeLessThan(5000)
    const input = take(g, 'input', 'love.pet.name') as InputModal
    runScript(g, 'love.pet.name', 'sir barksalot', input.data, input)
    expect(pet!.firstName).toBe('Sir Barksalot')
  })

  it('kids ask their parents, and exotic dealers are adults-only', () => {
    const g = makeTestGame(10, { age: 9 })
    createPerson(g, { relation: 'parent', gender: 'female', age: 38, relationship: 100, money: 1_000_000, traits: ['generous', 'kind'] })
    expect(act(g, petsMenu, 'pets.exotic').disabledReason?.(g)).toBeTruthy()
    let got = false
    for (let i = 0; i < 3 && !got; i++) {
      act(g, petsMenu, 'pets.store').run(g)
      const m = take(g, 'choice', 'love.pet.pick')
      runScript(g, 'love.pet.pick', '0', m.data, m)
      got = g.people.some((p) => p.relation === 'pet')
    }
    if (got) {
      const pet = g.people.find((p) => p.relation === 'pet')!
      expect(typeof pet.data.boughtByParent).toBe('string')
      expect(g.character.money).toBe(0)
    }
  })

  it('refuses a purchase you cannot afford', () => {
    const g = adultGame(9, 0)
    g.character.job = null
    g.character.retired = true
    act(g, petsMenu, 'pets.dogBreeder').run(g)
    const m = take(g, 'choice', 'love.pet.pick')
    runScript(g, 'love.pet.pick', '0', m.data, m)
    expect(g.people.length).toBe(0)
    expect(notices(g)[0].text).toMatch(/afford/)
  })
})
