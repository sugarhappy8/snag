// Fictional corruption mechanic: bounded family-job favors, uncertain outcomes and legal risk.
import { describe, expect, it } from 'vitest'
import { createPerson } from '../src/game/people'
import { yearlyRelationships } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import {
  attemptInfluence,
  corruptionMenu,
  holdsInfluenceJob,
  influenceCandidates,
  influenceJob,
  yearlyCorruption,
} from '../src/game/special/corruption'
import type { ChoiceModal, GameState, MenuAction, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

function game(seed = 1): GameState {
  const g = makeTestGame(seed, { age: 45, money: 20_000_000, countryId: 'us' })
  g.log = [{ age: 45, year: g.year, entries: [] }]
  return g
}

function relatives(g: GameState): { child: Person; sibling: Person } {
  const child = createPerson(g, { relation: 'child', age: 24, relationship: 80, occupation: 'Unemployed', money: 0 })
  const sibling = createPerson(g, { relation: 'sibling', age: 40, relationship: 65, occupation: 'Clerk', money: 1_000 })
  return { child, sibling }
}

function action(g: GameState, id: string): MenuAction {
  const node = corruptionMenu.children(g).find((candidate) => candidate.id === id)
  if (!node || node.type !== 'action') throw new Error(`missing ${id}`)
  return node
}

function takeChoice(g: GameState, scriptId: string): ChoiceModal {
  const index = g.queue.findIndex((modal) => modal.kind === 'choice' && modal.scriptId === scriptId)
  if (index < 0) throw new Error(`missing choice ${scriptId}`)
  return g.queue.splice(index, 1)[0] as ChoiceModal
}

describe('fictional backroom favors', () => {
  it('only offers living adult family who do not already hold a family job', () => {
    const g = game()
    const { child, sibling } = relatives(g)
    const minor = createPerson(g, { relation: 'child', age: 17 })
    const friend = createPerson(g, { relation: 'friend', age: 35 })
    const dead = createPerson(g, { relation: 'parent', age: 70 })
    dead.alive = false
    sibling.data.nepo = { job: 'manager' }
    expect(influenceCandidates(g).map((person) => person.id)).toEqual([child.id])
    expect(influenceCandidates(g)).not.toEqual(expect.arrayContaining([minor, friend, dead, sibling]))
  })

  it('has age, prison, affordability, candidate, and yearly-attempt gates', () => {
    const g = game(2)
    relatives(g)
    g.character.age = 17
    expect(corruptionMenu.visible?.(g)).toBe(false)
    g.character.age = 45
    g.character.prison = {} as never
    expect(corruptionMenu.visible?.(g)).toBe(false)
    g.character.prison = null
    g.character.money = 0
    expect(action(g, 'corruption.politician').disabledReason?.(g)).toMatch(/afford/i)
    g.character.money = 20_000_000
    g.yearActions['corruption.bribe'] = 1
    expect(action(g, 'corruption.politician').disabledReason?.(g)).toMatch(/already/i)
  })

  it('uses a real menu choice and revalidates a stale relative before taking money', () => {
    const g = game(3)
    const { child } = relatives(g)
    const attempt = action(g, 'corruption.ceo')
    attempt.run(g)
    const modal = takeChoice(g, 'corruption.chooseRelative')
    expect(modal.choices.map((choice) => choice.id)).toContain(child.id)
    child.age = 17
    const before = g.character.money
    runScript(g, modal.scriptId!, child.id, modal.data, modal)
    expect(g.character.money).toBe(before)
    expect(g.yearActions['corruption.bribe']).toBeUndefined()
    expect(influenceJob(g, child)).toBeNull()
  })

  it('charges once, never guarantees success, and produces success, failure, and scandal across seeds', () => {
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 120 && outcomes.size < 3; seed++) {
      const g = game(seed)
      const { child } = relatives(g)
      const before = g.character.money
      attemptInfluence(g, 'politician', child.id)
      expect(g.character.money).toBeLessThan(before)
      expect(g.yearActions['corruption.bribe']).toBe(1)
      expect(g.counters.bribesAttempted).toBe(1)
      const outcome = holdsInfluenceJob(g, child) ? 'success' : g.counters.briberyScandals ? 'scandal' : 'failure'
      outcomes.add(outcome)
      const after = g.character.money
      attemptInfluence(g, 'ceo', child.id)
      expect(g.character.money).toBe(after)
      expect(g.counters.bribesAttempted).toBe(1)
    }
    expect(outcomes).toEqual(new Set(['success', 'failure', 'scandal']))
  })

  it('rejects invalid targets, strangers, minors, dead people, and old-owner jobs', () => {
    const g = game(4)
    const friend = createPerson(g, { relation: 'friend', age: 35 })
    const child = createPerson(g, { relation: 'child', age: 16 })
    const parent = createPerson(g, { relation: 'parent', age: 70 })
    parent.alive = false
    const before = { money: g.character.money, rng: g.rng, counters: { ...g.counters }, actions: { ...g.yearActions } }
    attemptInfluence(g, 'fake' as never, friend.id)
    attemptInfluence(g, 'ceo', friend.id)
    attemptInfluence(g, 'ceo', child.id)
    attemptInfluence(g, 'ceo', parent.id)
    expect({ money: g.character.money, rng: g.rng, counters: g.counters, actions: g.yearActions }).toEqual(before)

    child.age = 20
    child.data.influenceJob = { by: 'old-player', target: 'ceo', title: 'Executive', salary: 999_999_999, hiredYear: 2020, lastPaid: -1 }
    expect(influenceJob(g, child)).toBeNull()
    expect(holdsInfluenceJob(g, child)).toBe(false)
  })

  it('normalizes and caps job salary, pays each fiscal year once, and never pays the player', () => {
    const g = game(5)
    const { child } = relatives(g)
    child.data.influenceJob = {
      by: g.character.id, target: 'president', title: ' Policy Adviser ', salary: 999_999_999,
      hiredYear: 2025, lastPaid: 2024,
    }
    const playerMoney = g.character.money
    const childMoney = child.money
    expect(influenceJob(g, child)).toMatchObject({ title: 'Policy Adviser', salary: 500_000 })
    yearlyCorruption(g)
    expect(child.money).toBe(childMoney + 500_000)
    expect(g.character.money).toBe(playerMoney)
    expect(influenceJob(g, child)?.lastPaid).toBe(2025)
    const snapshot = JSON.stringify(g)
    yearlyCorruption(g)
    expect(JSON.stringify(g)).toBe(snapshot)

    g.year += 1
    yearlyCorruption(g)
    expect(child.money).toBe(childMoney + 1_000_000)
  })

  it('does not pay retrospectively in the hire year and stops on death or owner change', () => {
    const g = game(6)
    const { child } = relatives(g)
    child.data.influenceJob = {
      by: g.character.id, target: 'ceo', title: 'Strategy Manager', salary: 100_000,
      hiredYear: g.year, lastPaid: g.year - 1,
    }
    yearlyCorruption(g)
    expect(child.money).toBe(0)
    g.year += 1
    yearlyCorruption(g)
    expect(child.money).toBe(100_000)
    g.year += 1
    child.alive = false
    yearlyCorruption(g)
    expect(child.money).toBe(100_000)
    child.alive = true
    g.character.id = 'heir'
    yearlyCorruption(g)
    expect(child.money).toBe(100_000)
  })

  it('protects the installed occupation from generic relationship-year reassignment', () => {
    const g = game(7)
    const { child } = relatives(g)
    child.occupation = 'Presidential Policy Adviser'
    child.data.influenceJob = {
      by: g.character.id, target: 'president', title: child.occupation, salary: 100_000,
      hiredYear: 2020, lastPaid: 2025,
    }
    child.age = 22
    g.character.age += 1
    yearlyRelationships(g)
    expect(child.occupation).toBe('Presidential Policy Adviser')
  })

  it('keeps all user-facing targets explicitly fictional and non-instructional', () => {
    const g = game(8)
    relatives(g)
    const text = [
      corruptionMenu.header?.(g),
      ...corruptionMenu.children(g).flatMap((node) => node.type === 'action'
        ? [node.label, typeof node.subtitle === 'function' ? node.subtitle(g) : node.subtitle]
        : []),
    ].join(' ')
    expect(text).toMatch(/fictional/i)
    expect(text).not.toMatch(/wire transfer|bank account|cash drop|contact details/i)
    // One short content note in the section header; the rows themselves read like the game.
    const rows = corruptionMenu.children(g).flatMap((node) => node.type === 'action'
      ? [node.label, typeof node.subtitle === 'function' ? node.subtitle(g) : node.subtitle, typeof node.confirm === 'function' ? node.confirm(g) : node.confirm]
      : []).join(' ')
    expect(rows).not.toMatch(/fictional|life-sim|mechanic/i)
    expect(corruptionMenu.subtitle).not.toMatch(/fictional/i)
  })
})
