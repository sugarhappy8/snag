import { describe, expect, it } from 'vitest'
import { nightlifeMenu } from '../src/game/activities/nightlife'
import { playerPregnancy, processPregnancies } from '../src/game/love'
import { createPerson } from '../src/game/people'
import { personActions, TRY_BABY_YEARLY_MAX } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, Json, MenuAction, ModalItem, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

function game(seed = 1, gender: 'male' | 'female' = 'female'): GameState {
  const g = makeTestGame(seed, { age: 28, gender, sexuality: 'straight', money: 100_000, countryId: 'us' })
  g.log = [{ age: 28, year: g.year, entries: [] }]
  return g
}

function fakeChoice(scriptId: string, data?: Json): ChoiceModal {
  return { kind: 'choice', id: `test-${scriptId}`, title: 'Test', text: '', source: 'script', scriptId, data, choices: ['home', 'safe', 'risk'].map((id) => ({ id, label: id })) }
}

function take<K extends ModalItem['kind']>(g: GameState, kind: K, scriptId?: string): Extract<ModalItem, { kind: K }> {
  const index = g.queue.findIndex((modal) => modal.kind === kind && (!scriptId || ('scriptId' in modal && modal.scriptId === scriptId)))
  if (index < 0) throw new Error(`missing ${kind}:${scriptId ?? ''}`)
  return g.queue.splice(index, 1)[0] as Extract<ModalItem, { kind: K }>
}

function nightHookup(g: GameState): { lover: Person; protection: ChoiceModal } {
  const data = { venue: 'Club Test', gender: g.character.gender === 'female' ? 'male' : 'female', age: 29, name: 'Alex', lastName: 'Night' }
  runScript(g, 'act.night.flirt2', 'home', data, fakeChoice('act.night.flirt2', data))
  const protection = take(g, 'choice', 'act.night.protection')
  const personId = protection.data && typeof protection.data === 'object' && !Array.isArray(protection.data) ? protection.data.personId : undefined
  const lover = g.people.find((person) => person.id === personId)
  if (!lover) throw new Error('nightlife did not create lover')
  return { lover, protection }
}

function tryBabyAction(g: GameState, person: Person): MenuAction {
  const node = personActions(g, person).find((candidate): candidate is MenuAction => candidate.type === 'action' && candidate.id === 'tryBaby')
  if (!node) throw new Error('tryBaby action missing')
  return node
}

describe('adult random-hookup pregnancy', () => {
  it('keeps the nightlife route adult-only and creates the exact encountered lover', () => {
    expect(nightlifeMenu.id).toBe('nightlife') // imports and registers the real scripts
    const g = game(1)
    const { lover, protection } = nightHookup(g)
    expect(lover).toMatchObject({ firstName: 'Alex', lastName: 'Night', age: 29, gender: 'male', relation: 'lover' })
    expect(protection.data).toMatchObject({ personId: lover.id })
    expect(lover.data.nightHookupPending).toMatchObject({ by: g.character.id, year: g.year })
    expect(g.counters.hookups).toBe(1)
  })

  it('safe sex never conceives and the queued decision is one-shot', () => {
    const g = game(2)
    const { lover, protection } = nightHookup(g)
    runScript(g, protection.scriptId!, 'safe', protection.data, protection)
    expect(playerPregnancy(g)).toBeNull()
    expect(lover.pregnant).not.toBe(true)
    expect(lover.data.nightHookupPending).toBeUndefined()
    const snapshot = JSON.stringify(g)
    runScript(g, protection.scriptId!, 'risk', protection.data, protection)
    expect(JSON.stringify(g)).toBe(snapshot)
  })

  it('unprotected encounters can conceive and preserve the hookup partner through birth', () => {
    let found: { g: GameState; lover: Person } | null = null
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const g = game(seed)
      g.character.hidden.fertility = 100
      const { lover, protection } = nightHookup(g)
      runScript(g, protection.scriptId!, 'risk', protection.data, protection)
      if (playerPregnancy(g)) found = { g, lover }
    }
    expect(found).not.toBeNull()
    if (!found) return
    expect(playerPregnancy(found.g)?.otherParentId).toBe(found.lover.id)
    processPregnancies(found.g)
    const child = found.g.people.find((person) => person.relation === 'child')
    expect(child?.otherParentId).toBe(found.lover.id)
  })

  it('rechecks forged, stale, minor, same-sex, prison, and existing-pregnancy gates', () => {
    const g = game(4)
    const minor = createPerson(g, { relation: 'lover', age: 17, gender: 'male' })
    minor.data.nightHookupPending = { by: g.character.id, year: g.year }
    const forged = fakeChoice('act.night.protection', { personId: minor.id })
    const snapshot = {
      rng: g.rng,
      money: g.character.money,
      people: JSON.stringify(g.people),
      pregnancy: JSON.stringify(g.flags.pregnancy),
      queue: JSON.stringify(g.queue),
    }
    runScript(g, forged.scriptId!, 'risk', forged.data, forged)
    expect({
      rng: g.rng,
      money: g.character.money,
      people: JSON.stringify(g.people),
      pregnancy: JSON.stringify(g.flags.pregnancy),
      queue: JSON.stringify(g.queue),
    }).toEqual(snapshot)

    const safeAdult = createPerson(g, { relation: 'lover', age: 28, gender: 'female' })
    safeAdult.data.nightHookupPending = { by: g.character.id, year: g.year }
    const sameSex = { ...forged, id: `${forged.id}-same-sex`, data: { personId: safeAdult.id } }
    runScript(g, sameSex.scriptId!, 'risk', sameSex.data, sameSex)
    expect(playerPregnancy(g)).toBeNull()

    const { lover, protection } = nightHookup(g)
    g.flags.pregnancy = { otherParentId: 'existing-parent', via: 'natural', babies: 1, surrogateName: null }
    runScript(g, protection.scriptId!, 'risk', protection.data, protection)
    expect(playerPregnancy(g)?.otherParentId).toBe('existing-parent')
    expect(lover.data.nightHookupPending).toBeUndefined()

    const imprisoned = game(5)
    const hookup = nightHookup(imprisoned)
    imprisoned.character.prison = {} as never
    runScript(imprisoned, hookup.protection.scriptId!, 'risk', hookup.protection.data, hookup.protection)
    expect(playerPregnancy(imprisoned)).toBeNull()
  })

  it('does not treat unknown protection responses as unprotected sex', () => {
    const g = game(6)
    const { lover, protection } = nightHookup(g)
    const before = JSON.stringify(g)
    runScript(g, protection.scriptId!, 'invalid', protection.data, protection)
    expect(JSON.stringify(g)).toBe(before)
    expect(lover.data.nightHookupPending).toBeDefined()
  })
})

describe('trying for a baby repeatedly', () => {
  it('allows more than ten consensual attempts but enforces one finite shared 24-attempt cap', () => {
    const g = game(20)
    // Zero conception probability keeps the test on the attempt/consent loop rather than ending
    // early with a pregnancy; consent still rolls independently each time.
    g.character.hidden.fertility = -150
    const partner = createPerson(g, { relation: 'partner', age: 29, gender: 'male', relationship: 0 })
    const action = tryBabyAction(g, partner)
    for (let i = 0; i < 11; i++) action.run(g)
    expect(g.yearActions['rel.tryBaby']).toBe(11)
    expect(playerPregnancy(g)).toBeNull()
    for (let i = 11; i < TRY_BABY_YEARLY_MAX; i++) action.run(g)
    expect(g.yearActions['rel.tryBaby']).toBe(TRY_BABY_YEARLY_MAX)
    const rng = g.rng
    action.run(g)
    expect(g.yearActions['rel.tryBaby']).toBe(TRY_BABY_YEARLY_MAX)
    expect(g.rng).toBe(rng)

    partner.relation = 'ex'
    const nextPartner = createPerson(g, { relation: 'partner', age: 30, gender: 'male', relationship: 100 })
    tryBabyAction(g, nextPartner).run(g)
    expect(g.yearActions['rel.tryBaby']).toBe(TRY_BABY_YEARLY_MAX)
  })

  it('revalidates current-partner, adulthood, life, prison, fertility, and pregnancy before consuming an attempt', () => {
    const cases = ['ex', 'notCurrent', 'minor', 'dead', 'prison', 'pregnant', 'sameSex', 'sterile'] as const
    for (const mode of cases) {
      const g = game(30)
      const partner = createPerson(g, { relation: 'partner', age: 29, gender: 'male', relationship: 90 })
      const action = tryBabyAction(g, partner)
      if (mode === 'ex') partner.relation = 'ex'
      if (mode === 'notCurrent') {
        const spouse = createPerson(g, { relation: 'spouse', age: 30, gender: 'male', relationship: 90 })
        g.people.splice(g.people.indexOf(spouse), 1)
        g.people.unshift(spouse)
      }
      if (mode === 'minor') partner.age = 17
      if (mode === 'dead') g.character.alive = false
      if (mode === 'prison') g.character.prison = {} as never
      if (mode === 'pregnant') g.flags.pregnancy = { otherParentId: partner.id, via: 'natural', babies: 1, surrogateName: null }
      if (mode === 'sameSex') partner.gender = 'female'
      if (mode === 'sterile') g.flags.sterile = true
      action.run(g)
      expect(g.yearActions['rel.tryBaby'], mode).toBeUndefined()
    }
  })

  it('resets the shared allowance with normal yearly action reset', () => {
    const g = game(31)
    g.character.hidden.fertility = -150
    const partner = createPerson(g, { relation: 'spouse', age: 30, gender: 'male', relationship: 0 })
    const action = tryBabyAction(g, partner)
    action.run(g)
    expect(g.yearActions['rel.tryBaby']).toBe(1)
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    action.run(g)
    expect(g.yearActions['rel.tryBaby']).toBe(1)
  })
})
