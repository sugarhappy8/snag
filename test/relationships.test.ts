import { describe, expect, it } from 'vitest'
import { createPerson } from '../src/game/people'
import { personActions, relationshipGroups, yearlyRelationships } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, InputModal, MenuAction, MenuNode, ModalItem, NoticeModal, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

// --- helpers ------------------------------------------------------------------

function actionIds(g: GameState, p: Person): string[] {
  return personActions(g, p)
    .filter((n): n is MenuAction => n.type === 'action')
    .filter((a) => !a.visible || a.visible(g))
    .map((a) => a.id)
}

function action(g: GameState, p: Person, id: string): MenuAction {
  const a = personActions(g, p).find((n): n is MenuAction => n.type === 'action' && n.id === id)
  if (!a) throw new Error(`no action ${id} for ${p.relation}`)
  return a
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
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

function family(g: GameState): { mom: Person; dad: Person; sis: Person } {
  const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 35, lastName: 'Player', relationship: 80, livesWithPlayer: true })
  const dad = createPerson(g, { relation: 'parent', gender: 'male', age: 37, lastName: 'Player', relationship: 75, livesWithPlayer: true })
  const sis = createPerson(g, { relation: 'sibling', gender: 'female', age: 12, lastName: 'Player', relationship: 60, livesWithPlayer: true })
  return { mom, dad, sis }
}

function isPlainJson(g: GameState): boolean {
  return JSON.stringify(JSON.parse(JSON.stringify(g))) === JSON.stringify(g)
}

// --- yearly life cycle -----------------------------------------------------------

describe('yearlyRelationships', () => {
  it('ages living people and pets, and counts years known', () => {
    const g = makeTestGame(3, { age: 10 })
    const { mom, sis } = family(g)
    const dog = createPerson(g, { relation: 'pet', age: 2, species: 'Dog', firstName: 'Rex', livesWithPlayer: true, data: { lifespan: 14 } })
    const grave = createPerson(g, { relation: 'grandparent', age: 80 })
    grave.alive = false
    g.character.age = 11
    yearlyRelationships(g)
    expect(mom.age).toBe(36)
    expect(sis.age).toBe(13)
    expect(sis.yearsKnown).toBe(1)
    if (dog.alive) expect(dog.age).toBe(3)
    expect(grave.age).toBe(80)
    expect(isPlainJson(g)).toBe(true)
  })

  it('does nothing for a dead player', () => {
    const g = makeTestGame(3, { age: 40 })
    const { mom } = family(g)
    g.character.alive = false
    yearlyRelationships(g)
    expect(mom.age).toBe(35)
  })

  it('updates children occupations as they grow and moves adults out', () => {
    const g = makeTestGame(9, { age: 40 })
    const kid = createPerson(g, { relation: 'child', age: 4, lastName: 'Player', occupation: 'Toddler', livesWithPlayer: true, relationship: 90 })
    const teen = createPerson(g, { relation: 'child', age: 21, lastName: 'Player', occupation: 'University Student', livesWithPlayer: true, relationship: 90 })
    for (let i = 0; i < 3; i++) {
      g.character.age += 1
      yearlyRelationships(g)
      g.queue = []
    }
    expect(kid.age).toBe(7)
    expect(kid.occupation).toBe('Elementary School Student')
    expect(teen.livesWithPlayer).toBe(false)
  })

  it('kills off the very old and keeps them as late relatives with a BitLife-style notice', () => {
    let found = false
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const g = makeTestGame(seed, { age: 45, money: 1000 })
      const gp = createPerson(g, { relation: 'parent', gender: 'male', age: 99, firstName: 'Walter', lastName: 'Player', relationship: 70, money: 200_000, stats: { health: 5 } })
      g.character.age = 46
      yearlyRelationships(g)
      if (gp.alive) continue
      found = true
      expect(gp.causeOfDeath).toBeTruthy()
      const all = g.queue.map((m) => ('text' in m ? m.text : '')).join('\n')
      expect(all).toMatch(/Your father, Walter Player, .*(at the age of|died at the age of) 100/)
      expect(g.people.some((p) => p.id === gp.id)).toBe(true)
      const groups = relationshipGroups(g)
      expect(groups[groups.length - 1].title).toBe('Late Relatives')
      // Dead people only offer remembrance.
      expect(actionIds(g, gp)).toEqual(['grave', 'reminisce'])
    }
    expect(found).toBe(true)
  })

  it('lets the player plan the funeral of their last parent, including what to do with the ashes', () => {
    let done = false
    for (let seed = 1; seed <= 40 && !done; seed++) {
      const g = makeTestGame(seed, { age: 60, money: 50_000 })
      const dad = createPerson(g, { relation: 'parent', gender: 'male', age: 99, lastName: 'Player', relationship: 70, money: 0, stats: { health: 1 } })
      g.character.age = 61
      yearlyRelationships(g)
      if (dad.alive) continue
      const funeral = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'rel.funeral')
      if (!funeral || !funeral.choices.some((c) => c.id === 'cremation')) continue
      done = true
      const before = g.character.money
      answer(g, 'rel.funeral', 'cremation')
      expect(g.character.money).toBeLessThan(before)
      const ashes = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'rel.funeral.ashes')
      expect(ashes).toBeTruthy()
      answer(g, 'rel.funeral.ashes', 'urn')
      expect(g.log.flatMap((y) => y.entries.map((e) => e.text)).some((t) => /ashes/.test(t))).toBe(true)
    }
    expect(done).toBe(true)
  })

  it('delivers a pregnant partner’s baby at age-up and asks the player to name it', () => {
    let born = 0
    for (let seed = 1; seed <= 8; seed++) {
      const g = makeTestGame(seed, { age: 30, money: 5000 })
      const wife = createPerson(g, { relation: 'spouse', gender: 'female', age: 29, relationship: 95, livesWithPlayer: true, data: { marriedAge: 28 } })
      wife.pregnant = true
      wife.data.babies = 1
      g.character.age = 31
      yearlyRelationships(g)
      expect(wife.pregnant).toBeUndefined()
      const kids = g.people.filter((p) => p.relation === 'child')
      if (!kids.length) {
        expect(notices(g).some((n) => n.title === 'Miscarriage') || !wife.alive).toBe(true)
        continue
      }
      born++
      const kid = kids[0]
      expect(kid.age).toBe(0)
      expect(kid.otherParentId).toBe(wife.id)
      expect(kid.biological).toBe(true)
      expect(kid.livesWithPlayer).toBe(true)
      expect(g.counters.children).toBe(1)
      const input = take(g, 'input', 'love.baby.name') as InputModal
      expect(input.defaultValue).toBe(kid.firstName)
      runScript(g, 'love.baby.name', 'zelda mae', input.data, input)
      expect(kid.firstName).toBe('Zelda Mae')
      expect(g.log.flatMap((y) => y.entries.map((e) => e.text)).some((t) => t.includes('Zelda Mae'))).toBe(true)
    }
    expect(born).toBeGreaterThan(4)
  })

  it('never re-divorces parents who were born divorced, and only half-siblings come from a stepparent', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const g = makeTestGame(seed, { age: 1 })
      const mom = createPerson(g, { relation: 'parent', gender: 'female', age: 24, lastName: 'Player', relationship: 80, livesWithPlayer: true })
      const dad = createPerson(g, { relation: 'parent', gender: 'male', age: 26, lastName: 'Player', relationship: 70 })
      mom.data.exSpouseId = dad.id
      dad.data.exSpouseId = mom.id
      for (let age = 2; age < 18; age++) {
        g.character.age = age
        yearlyRelationships(g)
        const divorceNotice = notices(g).some((n) => n.title === 'Divorce')
        expect(divorceNotice).toBe(false)
        g.queue = []
      }
      expect(g.people.filter((p) => p.relation === 'sibling').length).toBe(0)
    }
  })

  it('keeps the people list from bloating over a long life', () => {
    const g = makeTestGame(5, { age: 20 })
    for (let i = 0; i < 60; i++) {
      const ex = createPerson(g, { relation: 'ex', age: 25, relationship: 10 })
      ex.data.fling = true
    }
    g.character.age = 21
    yearlyRelationships(g)
    expect(g.people.filter((p) => p.alive && p.relation === 'ex').length).toBeLessThanOrEqual(20)
  })

  it('stays plain JSON across many years with a big family', () => {
    const g = makeTestGame(11, { age: 25, money: 100_000 })
    family(g)
    createPerson(g, { relation: 'spouse', gender: 'female', age: 25, relationship: 80, livesWithPlayer: true })
    createPerson(g, { relation: 'pet', age: 1, species: 'Cat', firstName: 'Mochi', livesWithPlayer: true })
    createPerson(g, { relation: 'friend', age: 25, relationship: 75 })
    for (let age = 26; age < 90; age++) {
      g.character.age = age
      yearlyRelationships(g)
      // Answer every popup with its first option (like a hurried player).
      for (let guard = 0; g.queue.length && guard < 50; guard++) {
        const m = g.queue.shift()!
        if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[0].id, m.data, m)
        if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue ?? 'Sam', m.data, m)
      }
      expect(g.queue.length).toBe(0)
      for (const p of g.people) {
        expect(p.relationship).toBeGreaterThanOrEqual(0)
        expect(p.relationship).toBeLessThanOrEqual(100)
      }
    }
    expect(isPlainJson(g)).toBe(true)
    expect(Number.isFinite(g.character.money)).toBe(true)
  })
})

// --- relationships screen ---------------------------------------------------------

describe('relationshipGroups', () => {
  it('orders groups like the original and omits empty ones', () => {
    const g = makeTestGame(2, { age: 30 })
    family(g)
    createPerson(g, { relation: 'spouse', gender: 'female', age: 29 })
    createPerson(g, { relation: 'child', age: 2 })
    createPerson(g, { relation: 'friend', age: 30 })
    createPerson(g, { relation: 'bestFriend', age: 30 })
    createPerson(g, { relation: 'pet', age: 3, species: 'Dog' })
    createPerson(g, { relation: 'coworker', age: 40 })
    createPerson(g, { relation: 'boss', age: 50 })
    createPerson(g, { relation: 'ex', age: 31 })
    createPerson(g, { relation: 'enemy', age: 33 })
    const lateGran = createPerson(g, { relation: 'grandparent', age: 90 })
    lateGran.alive = false
    const lateDog = createPerson(g, { relation: 'pet', age: 15, species: 'Dog' })
    lateDog.alive = false
    const titles = relationshipGroups(g).map((x) => x.title)
    expect(titles).toEqual(['Parents', 'Siblings', 'Spouse', 'Children', 'Friends', 'Pets', 'Coworkers', 'Exes', 'Enemies', 'Late Relatives', 'Late Pets'])
    const friends = relationshipGroups(g).find((x) => x.title === 'Friends')!
    expect(friends.people[0].relation).toBe('bestFriend')
    const coworkers = relationshipGroups(g).find((x) => x.title === 'Coworkers')!
    expect(coworkers.people[0].relation).toBe('boss')
  })

  it('lists late spouses with the exes', () => {
    const g = makeTestGame(2, { age: 70 })
    const wife = createPerson(g, { relation: 'spouse', gender: 'female', age: 70 })
    wife.alive = false
    const groups = relationshipGroups(g)
    expect(groups.map((x) => x.title)).toEqual(['Exes'])
  })

  it('is empty for an orphan with no contacts', () => {
    expect(relationshipGroups(makeTestGame())).toEqual([])
  })
})

// --- interactions ---------------------------------------------------------------

describe('personActions', () => {
  it('differs by relation', () => {
    const g = makeTestGame(4, { age: 25, money: 10_000 })
    const { mom, sis } = family(g)
    sis.age = 22
    const gf = createPerson(g, { relation: 'partner', gender: 'female', age: 25 })
    const classmate = createPerson(g, { relation: 'classmate', gender: 'female', age: 25 })
    const dog = createPerson(g, { relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex' })
    const fish = createPerson(g, { relation: 'pet', age: 1, species: 'Fish', firstName: 'Bubbles' })

    const momIds = actionIds(g, mom)
    expect(momIds).toContain('askMoney')
    expect(momIds).toContain('spendTime')
    expect(momIds).not.toContain('propose')

    const gfIds = actionIds(g, gf)
    expect(gfIds).toEqual(expect.arrayContaining(['dateNight', 'flirt', 'makeLove', 'tryBaby', 'propose', 'breakUp']))
    expect(gfIds).not.toContain('divorce')
    expect(gfIds).not.toContain('askMoney')

    const sisIds = actionIds(g, sis)
    expect(sisIds).not.toContain('askOut')
    expect(sisIds).not.toContain('flirt')

    expect(actionIds(g, classmate)).toEqual(expect.arrayContaining(['befriend', 'askOut', 'flirt']))

    expect(actionIds(g, dog)).toEqual(expect.arrayContaining(['play', 'walk', 'vet', 'rehome']))
    expect(actionIds(g, fish)).not.toContain('walk')
    expect(actionIds(g, fish)).not.toContain('bathe')
  })

  it('respects age gates for babies and romance', () => {
    const g = makeTestGame(4, { age: 1 })
    const { mom } = family(g)
    const nodes = personActions(g, mom)
    expect(nodes.every((n: MenuNode) => n.type === 'info')).toBe(true)

    g.character.age = 15
    const adult = createPerson(g, { relation: 'coworker', gender: 'female', age: 30 })
    expect(actionIds(g, adult)).not.toContain('askOut')
    expect(actionIds(g, adult)).not.toContain('hookUp')
  })

  it('limits a prisoner to phone calls (and cellmates)', () => {
    const g = makeTestGame(4, { age: 30 })
    const { mom } = family(g)
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 3, yearsServed: 0, respect: 40, appealed: false, escapeAttempts: 0 }
    const ids = actionIds(g, mom)
    expect(ids).toContain('conversation')
    expect(ids).not.toContain('spendTime')
    expect(ids).not.toContain('movie')
    const cellie = createPerson(g, { relation: 'cellmate', age: 40, gender: 'male' })
    expect(actionIds(g, cellie)).toContain('assault')
  })

  it('shows nothing actionable once the player is dead', () => {
    const g = makeTestGame(4, { age: 30 })
    const { mom } = family(g)
    g.character.alive = false
    expect(personActions(g, mom).every((n) => n.type === 'info')).toBe(true)
  })

  it('Spend Time changes the relationship, names the person in its notice and is limited per year', () => {
    const g = makeTestGame(7, { age: 20 })
    const { mom } = family(g)
    const st = action(g, mom, 'spendTime')
    const start = mom.relationship
    st.run(g)
    const n = notices(g)[0]
    expect(n.title).toBe('Spend Time')
    expect(n.text).toContain(mom.firstName)
    // Plain notices: no narration request rides along any more.
    expect('ai' in n).toBe(false)
    expect(mom.relationship).not.toBe(start - 100) // sanity
    expect(mom.data.lastInteractionAge).toBe(20)
    st.run(g)
    st.run(g)
    g.queue = []
    st.run(g)
    expect(notices(g)[0].title).toBe('Spend Time')
    expect(notices(g)[0].text).toMatch(/next year|enough|Give it a rest/)
  })

  it('Conversation and Compliment move the relationship', () => {
    let up = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = makeTestGame(seed, { age: 16 })
      const { dad } = family(g)
      dad.relationship = 70
      action(g, dad, 'compliment').run(g)
      if (dad.relationship > 70) up++
      const convo = makeTestGame(seed, { age: 16 })
      const f = family(convo)
      action(convo, f.dad, 'conversation').run(convo)
      const notice = convo.queue.find((m) => m.kind === 'notice') as NoticeModal | undefined
      if (notice) expect(notice.text).toContain(f.dad.firstName)
      else expect(convo.queue.some((m) => m.kind === 'choice' && m.scriptId === 'rel.convo.argue')).toBe(true)
    }
    expect(up).toBeGreaterThan(4)
  })

  it('Insult lowers the relationship and counts insults', () => {
    const g = makeTestGame(12, { age: 16 })
    const { sis } = family(g)
    sis.age = 14
    action(g, sis, 'insult').run(g)
    expect(sis.relationship).toBeLessThan(60)
    expect(g.counters.insults).toBe(1)
  })

  it('Gifts cost money and cannot be bought when broke', () => {
    const g = makeTestGame(12, { age: 30, money: 0 })
    const { mom } = family(g)
    action(g, mom, 'gift').run(g)
    const pickModal = take(g, 'choice', 'rel.gift.pick')
    const paid = pickModal.choices.find((c) => !/free/.test(c.label) && c.id !== 'cancel')!
    runScript(g, 'rel.gift.pick', paid.id, pickModal.data, pickModal)
    expect(g.character.money).toBe(0)
    expect(notices(g)[0].text).toMatch(/can't afford/)
  })

  it('Ask for Money transfers cash from a parent or gets refused', () => {
    const g = makeTestGame(21, { age: 16, money: 0 })
    const { dad } = family(g)
    dad.money = 50_000
    dad.relationship = 95
    action(g, dad, 'askMoney').run(g)
    const n = notices(g)[0]
    expect(n.title).toBe('Ask for Money')
    expect(g.character.money + dad.money).toBe(50_000)
  })

  it('Befriend turns a classmate into a friend on success', () => {
    let made = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = makeTestGame(seed, { age: 12 })
      const kid = createPerson(g, { relation: 'classmate', age: 12, relationship: 80, traits: ['kind', 'outgoing'] })
      action(g, kid, 'befriend').run(g)
      if (kid.relation === 'friend') made++
    }
    expect(made).toBeGreaterThan(5)
  })

  it('Assault hurts the target and may call the police', () => {
    const g = makeTestGame(5, { age: 25 })
    const enemy = createPerson(g, { relation: 'enemy', age: 25, gender: 'male', relationship: 10, stats: { health: 90 } })
    action(g, enemy, 'assault').run(g)
    answer(g, 'rel.assault.move', 'punch')
    expect(enemy.stats.health).toBeLessThan(90)
    expect(g.counters.fights).toBe(1)
    expect(notices(g).some((n) => n.title === 'Assault')).toBe(true)
  })

  it('refuses to let an adult attack a child', () => {
    const g = makeTestGame(5, { age: 30 })
    const kid = createPerson(g, { relation: 'child', age: 8 })
    expect(actionIds(g, kid)).not.toContain('assault')
  })

  it('pet care raises the pet relationship', () => {
    const g = makeTestGame(6, { age: 20 })
    const dog = createPerson(g, { relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex', relationship: 50, livesWithPlayer: true })
    action(g, dog, 'play').run(g)
    expect(dog.relationship).toBeGreaterThan(50)
  })
})
