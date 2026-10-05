import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { continueAsChild, createNewLife, getTalent, TALENTS, yearlyMilestones } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

function birthLines(g: GameState): string[] {
  return g.log[0].entries.map((e) => e.text)
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function choices(g: GameState): ChoiceModal[] {
  return g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')
}

describe('createNewLife', () => {
  it('produces a complete, plain-JSON game state', () => {
    const g = createNewLife({ seed: 123, year: 2030 })
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    expect(structuredClone(g)).toEqual(g)
    expect(g.version).toBe(1)
    expect(g.year).toBe(2030)
    expect(g.generation).toBe(1)
    expect(g.character.age).toBe(0)
    expect(g.character.alive).toBe(true)
    expect(g.character.money).toBe(0)
    expect(g.queue).toEqual([])
    expect(g.log).toHaveLength(1)
    expect(g.log[0]).toMatchObject({ age: 0, year: 2030 })
    for (const v of [...Object.values(g.character.stats), ...Object.values(g.character.hidden)]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    expect(g.character.stats.health).toBeGreaterThanOrEqual(80)
    expect(g.character.stats.happiness).toBeGreaterThanOrEqual(50)
  })

  it('writes the birth log in the classic style', () => {
    const g = createNewLife({ seed: 2, firstName: 'Ana', lastName: 'Lopez', gender: 'female', countryId: 'fr', city: 'Lyon' })
    const lines = birthLines(g)
    expect(lines[0]).toBe('I was born a female in Lyon, France.')
    expect(lines.some((l) => /^My birthday is [A-Z][a-z]+ \d{1,2}\. I am an? [A-Z][a-z]+\.$/.test(l))).toBe(true)
    expect(lines).toContain('My name is Ana Lopez.')
    expect(lines.some((l) => /^My (mother|father) is .+, an? (unemployed )?\d+ year old/.test(l))).toBe(true)
  })

  it('honors every option', () => {
    const g = createNewLife({ seed: 9, firstName: 'Kai', lastName: 'Moana', gender: 'male', countryId: 'jp', city: 'Kyoto', sexuality: 'gay', year: 1999 })
    const c = g.character
    expect([c.firstName, c.lastName, c.gender, c.countryId, c.birthCountryId, c.city, c.sexuality]).toEqual(['Kai', 'Moana', 'male', 'jp', 'jp', 'Kyoto', 'gay'])
    expect(g.year).toBe(1999)
    expect(c.zodiac).toMatch(/^[A-Z]/)
  })

  it('is deterministic for a seed', () => {
    expect(createNewLife({ seed: 77 })).toEqual(createNewLife({ seed: 77 }))
    expect(JSON.stringify(createNewLife({ seed: 77 }))).not.toBe(JSON.stringify(createNewLife({ seed: 78 })))
  })

  it('creates realistic families', () => {
    let pets = 0
    let siblings = 0
    let straight = 0
    let single = 0
    for (let seed = 1; seed <= 300; seed++) {
      const g = createNewLife({ seed })
      const parents = g.people.filter((p) => p.relation === 'parent')
      expect(parents.length).toBeGreaterThanOrEqual(1)
      expect(parents.length).toBeLessThanOrEqual(2)
      if (parents.length === 1) single++
      for (const p of parents) {
        expect(p.age).toBeGreaterThanOrEqual(18)
        expect(p.age).toBeLessThanOrEqual(60)
        expect(p.relationship).toBeGreaterThanOrEqual(60)
        expect(p.occupation).not.toBe('')
      }
      // Everyone the baby lives with is in the log.
      const lines = birthLines(g).join('\n')
      for (const p of g.people) {
        expect(lines).toContain(p.firstName)
        if (p.relation === 'sibling' || p.relation === 'halfSibling') {
          siblings++
          expect(p.age).toBeLessThanOrEqual(15)
        }
        if (p.relation === 'pet') {
          pets++
          expect(p.species).toBeTruthy()
          expect(lines).toMatch(/We have a family \w+ named/)
        }
      }
      if (g.character.sexuality === 'straight') straight++
    }
    expect(pets).toBeGreaterThan(40)
    expect(pets).toBeLessThan(150)
    expect(siblings).toBeGreaterThan(100)
    expect(single).toBeGreaterThan(5)
    expect(straight / 300).toBeGreaterThan(0.8)
  })
})

function oldPlayer(seed = 5): GameState {
  const g = makeTestGame(seed, { age: 70, gender: 'female', firstName: 'Ruth', lastName: 'Stone', money: 500_000 })
  return g
}

describe('continueAsChild', () => {
  it('only works for a living child of a dead player, and never mutates the input', () => {
    const g = oldPlayer()
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: 'Stone' })
    const friend = createPerson(g, { relation: 'friend', age: 60 })
    expect(continueAsChild(g, kid.id)).toBe(g) // still alive
    killCharacter(g, 'Old Age')
    expect(continueAsChild(g, friend.id)).toBe(g)
    expect(continueAsChild(g, 'nobody')).toBe(g)
    const before = JSON.stringify(g)
    const n = continueAsChild(g, kid.id)
    expect(JSON.stringify(g)).toBe(before)
    expect(n).not.toBe(g)
    expect(JSON.parse(JSON.stringify(n))).toEqual(n)
  })

  it('hands the game to the child with family, money and history', () => {
    const g = oldPlayer()
    const mom = createPerson(g, { relation: 'parent', age: 92, gender: 'female' })
    const spouse = createPerson(g, { relation: 'spouse', age: 72, gender: 'male', lastName: 'Stone' })
    const heir = createPerson(g, { relation: 'child', age: 40, gender: 'male', lastName: 'Stone', otherParentId: spouse.id, money: 10_000 })
    const sis = createPerson(g, { relation: 'child', age: 35, gender: 'female', lastName: 'Stone', otherParentId: spouse.id })
    const half = createPerson(g, { relation: 'child', age: 45, gender: 'female', lastName: 'Stone' })
    const grandkid = createPerson(g, { relation: 'grandchild', age: 8, data: { parentId: heir.id } })
    const otherGrandkid = createPerson(g, { relation: 'grandchild', age: 6, data: { parentId: sis.id } })
    createPerson(g, { relation: 'friend', age: 70 })
    createPerson(g, { relation: 'coworker', age: 50 })
    createPerson(g, { relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex' })
    g.counters.crimes = 3
    killCharacter(g, 'Old Age')
    g.flags.finalOccupation = 'Teacher'
    const ribbon = g.ribbon
    const n = continueAsChild(g, heir.id)
    const c = n.character

    expect(n.generation).toBe(2)
    expect(n.year).toBe(g.year)
    expect(n.ancestors).toHaveLength(1)
    expect(n.ancestors[0]).toMatchObject({ generation: 1, name: 'Ruth Stone', gender: 'female', age: 70, causeOfDeath: 'Old Age', occupation: 'Teacher', ribbon })
    expect(c.id).toBe(heir.id)
    expect(c.firstName).toBe(heir.firstName)
    expect(c.lastName).toBe('Stone')
    expect(c.age).toBe(40)
    expect(c.alive).toBe(true)
    expect(c.countryId).toBe('us')
    expect(n.counters).toEqual({})
    expect(n.queue).toHaveLength(1)
    expect(notices(n)[0].title).toBe('Generation 2')
    expect(n.ribbon).toBeNull()

    // Estate split three ways among living children: $500k / 3.
    const share = Math.floor(500_000 / 3)
    expect(c.money).toBe(10_000 + share)
    expect(n.people.find((p) => p.id === sis.id)?.money).toBeGreaterThanOrEqual(share)
    expect(n.log[0].entries.map((e) => e.text).join(' ')).toContain('I am now playing as')

    const rel = (id: string) => n.people.find((p) => p.id === id)?.relation
    const late = n.people.find((p) => p.data.formerPlayer === true)
    expect(late).toMatchObject({ relation: 'parent', alive: false, firstName: 'Ruth', causeOfDeath: 'Old Age' })
    expect(rel(spouse.id)).toBe('parent')
    expect(rel(sis.id)).toBe('sibling')
    expect(rel(half.id)).toBe('halfSibling')
    expect(rel(mom.id)).toBe('grandparent')
    expect(rel(grandkid.id)).toBe('child')
    expect(rel(otherGrandkid.id)).toBeUndefined()
    expect(n.people.some((p) => p.relation === 'friend' || p.relation === 'coworker')).toBe(false)
    expect(n.people.find((p) => p.firstName === 'Rex')?.relation).toBe('pet')
    expect(n.people.some((p) => p.id === heir.id)).toBe(false)
    // Adults have finished school.
    expect(c.education.completed).toContain('high')
    expect(c.education.current).toBeNull()
  })

  it('puts a minor heir in the right school and auctions the property', () => {
    const g = oldPlayer()
    g.character.age = 45
    const kid = createPerson(g, { relation: 'child', age: 12, lastName: 'Stone', money: 0 })
    g.assets.push({ id: 'h1', kind: 'house', name: 'Starter Home', emoji: '\u{1F3E0}', purchasePrice: 200_000, value: 250_000, condition: 80, purchasedAge: 30, upkeep: 2000, details: {}, mortgage: { lender: 'Bank', balance: 50_000, yearlyPayment: 10_000, yearsLeft: 5, rate: 0.05 } })
    g.assets.push({ id: 'w1', kind: 'jewelry', name: 'Old Pocket Watch', emoji: '\u{231A}', purchasePrice: 0, value: 4_000, condition: 70, purchasedAge: 20, upkeep: 0, details: { heirloom: true } })
    g.character.loans.push({ id: 'l1', kind: 'personal', lender: 'Bank', balance: 20_000, yearlyPayment: 5000, rate: 0.08 })
    killCharacter(g, 'Car Accident')
    const n = continueAsChild(g, kid.id)
    // 500k cash + 200k equity - 20k debt, sole heir.
    expect(n.character.money).toBe(680_000)
    expect(n.assets.map((a) => a.name)).toEqual(['Old Pocket Watch'])
    expect(n.character.loans).toEqual([])
    expect(n.character.residence.status).toBe('parents')
    expect(n.character.education.current).toMatchObject({ level: 'middle', year: 2, totalYears: 3 })
    expect(n.character.education.completed).toEqual(['elementary'])
    expect(n.log[0].entries.map((e) => e.text).join(' ')).toMatch(/auctioned off/)
  })

  it('lets a sole adult heir keep the house and respects the will', () => {
    const g = oldPlayer()
    const a = createPerson(g, { relation: 'child', age: 40, money: 0 })
    const b = createPerson(g, { relation: 'child', age: 38, money: 0 })
    g.assets.push({ id: 'h1', kind: 'house', name: 'Family Home', emoji: '\u{1F3E0}', purchasePrice: 200_000, value: 400_000, condition: 80, purchasedAge: 30, upkeep: 2000, details: {} })
    g.character.residence = { status: 'owned', assetId: 'h1' }
    g.character.willBeneficiaries = [a.id]
    killCharacter(g, 'Old Age')
    const heirA = continueAsChild(g, a.id)
    expect(heirA.character.money).toBe(500_000)
    expect(heirA.assets.map((x) => x.id)).toEqual(['h1'])
    expect(heirA.character.residence).toEqual({ status: 'owned', assetId: 'h1' })
    const heirB = continueAsChild(g, b.id)
    expect(heirB.character.money).toBe(0)
    expect(heirB.log[0].entries.some((e) => /cut out/.test(e.text))).toBe(true)
  })

  it('treats a stepchild correctly', () => {
    const g = oldPlayer()
    const spouse = createPerson(g, { relation: 'spouse', age: 68, gender: 'male' })
    const step = createPerson(g, { relation: 'stepchild', age: 16, otherParentId: spouse.id })
    const bio = createPerson(g, { relation: 'child', age: 20, otherParentId: spouse.id })
    killCharacter(g, 'Heart Attack')
    const n = continueAsChild(g, step.id)
    expect(n.people.find((p) => p.data.formerPlayer)?.relation).toBe('stepparent')
    expect(n.people.find((p) => p.id === spouse.id)).toMatchObject({ relation: 'parent', livesWithPlayer: true })
    expect(n.people.find((p) => p.id === bio.id)?.relation).toBe('halfSibling')
    expect(n.character.education.current?.level).toBe('high')
  })

  it("brings along the heir's spouse, their kids and a known sexuality", () => {
    const g = oldPlayer()
    const heir = createPerson(g, { relation: 'child', age: 42, gender: 'female', lastName: 'Stone', data: { married: true, spouseName: 'Marco Rossi', sexuality: 'straight' } })
    const gk = createPerson(g, { relation: 'grandchild', age: 10, data: { parentId: heir.id } })
    const out = createPerson(g, { relation: 'child', age: 25, data: { sexuality: 'gay', cameOutChecked: true } })
    killCharacter(g, 'Old Age')
    const n = continueAsChild(g, heir.id)
    const sp = n.people.find((p) => p.relation === 'spouse')
    expect(sp).toMatchObject({ firstName: 'Marco', lastName: 'Rossi', gender: 'male', livesWithPlayer: true, alive: true })
    expect(n.people.filter((p) => p.relation === 'spouse')).toHaveLength(1)
    expect(n.people.find((p) => p.id === gk.id)).toMatchObject({ relation: 'child', otherParentId: sp?.id })
    expect(n.character.sexuality).toBe('straight')
    expect(n.flags.sexualityRealized).toBe(true)
    expect(n.log[0].entries.some((e) => e.text.includes('married to Marco Rossi'))).toBe(true)
    // Ids stay unique after creating the spouse.
    expect(new Set(n.people.map((p) => p.id)).size).toBe(n.people.length)

    const m = continueAsChild(g, out.id)
    expect(m.character.sexuality).toBe('gay')
    expect(m.flags.out).toBe(true)
    expect(m.people.some((p) => p.relation === 'spouse')).toBe(false)
  })

  it('works on a full random life through several generations', () => {
    let g = createNewLife({ seed: 31 })
    for (let gen = 1; gen <= 3; gen++) {
      g.character.age = 60
      const kid = createPerson(g, { relation: 'child', age: 30 })
      killCharacter(g, 'Old Age')
      g = continueAsChild(g, kid.id)
      expect(g.generation).toBe(gen + 1)
      expect(g.ancestors).toHaveLength(gen)
    }
    expect(new Set(g.ancestors.map((a) => a.generation)).size).toBe(3)
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })
})

describe('yearlyMilestones', () => {
  it('announces adulthood once at 18', () => {
    const g = makeTestGame(1, { age: 18 })
    yearlyMilestones(g)
    expect(notices(g).some((m) => m.title === "You're an Adult!")).toBe(true)
    const count = g.queue.length
    yearlyMilestones(g)
    expect(g.queue.filter((m) => m.kind === 'notice' && m.title === "You're an Adult!")).toHaveLength(1)
    expect(g.queue.length).toBeGreaterThanOrEqual(count)
  })

  it('always gets through puberty by 14', () => {
    const g = makeTestGame(3, { age: 14 })
    yearlyMilestones(g)
    expect(g.flags.puberty).toBe(true)
    expect(notices(g).some((m) => m.title === 'Puberty')).toBe(true)
  })

  it('reveals a latent talent at the right age', () => {
    const g = makeTestGame(4, { age: 6 })
    g.flags.latentTalent = 'Music'
    g.flags.talentAge = 7
    yearlyMilestones(g)
    expect(g.character.talent).toBeNull()
    g.character.age = 7
    yearlyMilestones(g)
    expect(g.character.talent).toBe('Music')
    expect(notices(g).some((m) => m.title === 'Special Talent')).toBe(true)
    expect(getTalent('Music')).toBeDefined()
    expect(TALENTS.length).toBeGreaterThanOrEqual(10)
  })

  it('lets a gay teen come out, keep it private or deny it', () => {
    for (const choice of ['out', 'private', 'deny']) {
      const g = makeTestGame(8, { age: 16, sexuality: 'gay' })
      createPerson(g, { relation: 'parent', age: 45, gender: 'female', relationship: 70 })
      yearlyMilestones(g)
      const popup = choices(g).find((m) => m.scriptId === 'life.sexuality')
      expect(popup).toBeDefined()
      g.queue = []
      runScript(g, 'life.sexuality', choice, popup!.data, popup!)
      expect(g.flags.closeted).toBe(choice !== 'out')
      expect(g.queue.length).toBe(1)
    }
  })

  it('straight teens just get a log line', () => {
    const g = makeTestGame(8, { age: 16 })
    yearlyMilestones(g)
    expect(choices(g).some((m) => m.scriptId === 'life.sexuality')).toBe(false)
    expect(g.flags.sexualityRealized).toBe(true)
  })

  it('celebrates new grandchildren', () => {
    const g = makeTestGame(2, { age: 60 })
    yearlyMilestones(g)
    createPerson(g, { relation: 'grandchild', age: 0, firstName: 'Pip', gender: 'male' })
    yearlyMilestones(g)
    const text = g.log[g.log.length - 1].entries.map((e) => e.text).join(' ')
    expect(text).toContain('I became a grandfather! My grandson Pip was born.')
    yearlyMilestones(g)
    expect(g.log[g.log.length - 1].entries.filter((e) => e.text.includes('Pip'))).toHaveLength(1)
  })

  it('resolves every mid-life crisis option', () => {
    for (const choice of ['splurge', 'makeover', 'hobby', 'accept']) {
      const g = makeTestGame(11, { age: 45, money: 50_000 })
      runScript(g, 'life.midlife', choice, undefined, { kind: 'notice', id: 'x', title: '', text: '' })
      expect(g.queue).toHaveLength(1)
      expect(g.character.money).toBeGreaterThanOrEqual(0)
    }
    const broke = makeTestGame(11, { age: 45, money: 0 })
    runScript(broke, 'life.midlife', 'splurge', undefined, { kind: 'notice', id: 'x', title: '', text: '' })
    expect(broke.character.money).toBe(0)
  })

  it('does nothing for the dead', () => {
    const g = makeTestGame(1, { age: 18, alive: false })
    yearlyMilestones(g)
    expect(g.queue).toEqual([])
  })
})
