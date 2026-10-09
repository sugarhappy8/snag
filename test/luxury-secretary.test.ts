import { describe, expect, it } from 'vitest'
import { presentAsk, presentBundle } from '../src/game/events/wealth-resolve'
import type { Ask } from '../src/game/events/wealth-ask'
import { readTies } from '../src/game/events/wealth-core'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { secretaryDeskMenu } from '../src/game/shops/luxury-secretary'
import {
  pendingSecretaryRequests,
  recentSecretaryRequests,
  secretaryState,
  setSecretaryPolicy,
} from '../src/game/shops/luxury-secretary-state'
import { hireStaff, staffRoster, STAFF_ROLES, yearlyStaff } from '../src/game/shops/luxury-staff'
import type { ChoiceModal, GameState, MenuAction, MenuNode, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

function game(seed = 1): GameState {
  const g = makeTestGame(seed, { age: 45, money: 100_000_000, countryId: 'us' })
  g.log = [{ age: 45, year: g.year, entries: [] }]
  return g
}

function hire(g: GameState, role: Parameters<typeof hireStaff>[1]): void {
  expect(hireStaff(g, role, { name: `Test ${role}`, gender: 'female', hiredAge: g.character.age, skill: 1, quirk: 'extremely discreet' })).toBe(true)
  g.queue = []
}

function request(p: Person | undefined, what = 'help with rent', amount = 5_000): Ask {
  return {
    k: 'friend.loan',
    ...(p ? { pid: p.id, name: `your ${p.relation} ${p.firstName}` } : { name: 'a persistent stranger' }),
    title: 'A Favor', emoji: '🤝', text: `${p?.firstName ?? 'Someone'} asked for help.`,
    amt: amount, what, less: true, lend: !!p,
  }
}

function find(g: GameState, node: MenuNode, id: string, depth = 5): MenuNode | undefined {
  if (node.id === id) return node
  if (node.type !== 'menu' || depth <= 0) return undefined
  for (const child of node.children(g)) {
    const found = find(g, child, id, depth - 1)
    if (found) return found
  }
  return undefined
}

function menuAction(g: GameState, id: string): MenuAction {
  const node = find(g, secretaryDeskMenu, id)
  if (!node || node.type !== 'action') throw new Error(`missing action ${id}`)
  return node
}

function takeChoice(g: GameState, scriptId: string): ChoiceModal {
  const index = g.queue.findIndex((modal) => modal.kind === 'choice' && modal.scriptId === scriptId)
  if (index < 0) throw new Error(`missing ${scriptId}`)
  return g.queue.splice(index, 1)[0] as ChoiceModal
}

describe('useful personal staff and secretary screening', () => {
  it('preserves every original role id and tolerates its old save shape', () => {
    expect(STAFF_ROLES.slice(0, 5).map((role) => role.id)).toEqual(['butler', 'chef', 'chauffeur', 'bodyguard', 'trainer'])
    expect(STAFF_ROLES.map((role) => role.id)).toEqual(expect.arrayContaining(['secretary', 'estateManager', 'concierge']))
    const g = game()
    g.flags['luxury.staff'] = {
      butler: { name: 'Legacy Butler', gender: 'male', hiredAge: 30, skill: 1, quirk: 'legacy' },
      chef: { name: 'Legacy Chef', gender: 'female', hiredAge: 31, skill: 1.2, quirk: 'legacy' },
      unknownFutureRole: { name: 'Ignored' },
    }
    expect(staffRoster(g).map((entry) => entry.role.id)).toEqual(['butler', 'chef'])
  })

  it('routes a request to an owner-scoped inbox without a popup or silent payment', () => {
    const g = game(2)
    hire(g, 'secretary')
    const child = createPerson(g, { relation: 'child', age: 22, relationship: 70 })
    const before = g.character.money
    presentAsk(g, request(child))
    expect(g.character.money).toBe(before)
    expect(g.queue.some((modal) => modal.kind === 'choice' && modal.scriptId === 'wealth.ask')).toBe(false)
    expect(pendingSecretaryRequests(g)).toHaveLength(1)
    expect(pendingSecretaryRequests(g)[0]).toMatchObject({ category: 'kids', pid: child.id, amount: 5_000, status: 'pending' })

    const snapshot = JSON.stringify(g.flags['luxury.secretary'])
    const view = secretaryState(g)
    view.inbox[0].what = 'tampered'
    expect(JSON.stringify(g.flags['luxury.secretary'])).toBe(snapshot)
    g.character.id = 'heir'
    expect(secretaryState(g).inbox).toEqual([])
  })

  it('requires explicit inbox approval before the original give/lend choices can spend', () => {
    const g = game(3)
    hire(g, 'secretary')
    const friend = createPerson(g, { relation: 'friend', age: 44, relationship: 60, money: 0 })
    const before = g.character.money
    presentAsk(g, request(friend, 'a deposit', 4_000))
    const item = pendingSecretaryRequests(g)[0]
    const review = menuAction(g, `lux-secretary-review-${item.id}`)
    review.run(g)
    expect(pendingSecretaryRequests(g)).toEqual([])
    const original = takeChoice(g, 'wealth.ask')
    expect(original.choices.map((choice) => choice.id)).toContain('give')
    expect(g.character.money).toBe(before)
    runScript(g, original.scriptId!, 'give', original.data, original)
    expect(g.character.money).toBe(before - 4_000)
    expect(friend.money).toBe(4_000)
    expect(readTies(g, friend).yes).toBe(1)
  })

  it('applies category decline policy through normal refusal consequences but never spends', () => {
    const g = game(4)
    hire(g, 'secretary')
    const friend = createPerson(g, { relation: 'bestFriend', age: 44, relationship: 80 })
    setSecretaryPolicy(g, 'friends', 'decline')
    const money = g.character.money
    const relationship = friend.relationship
    presentAsk(g, request(friend, 'a risky startup', 20_000))
    expect(g.character.money).toBe(money)
    expect(friend.relationship).toBeLessThan(relationship)
    expect(readTies(g, friend)).toMatchObject({ no: 1, asked: g.year })
    expect(pendingSecretaryRequests(g)).toEqual([])
    expect(recentSecretaryRequests(g)[0]).toMatchObject({ category: 'friends', status: 'declined' })
    expect(g.queue.some((modal) => modal.kind === 'choice' && modal.scriptId === 'wealth.ask')).toBe(false)
  })

  it('splits bundled kids, family, friends, and outsider requests into attributable inbox items', () => {
    const g = game(5)
    hire(g, 'secretary')
    const child = createPerson(g, { relation: 'child', age: 21 })
    const parent = createPerson(g, { relation: 'parent', age: 70 })
    const friend = createPerson(g, { relation: 'friend', age: 46 })
    presentBundle(g, [request(child, 'tuition', 1_000), request(parent, 'medical bills', 2_000), request(friend, 'rent', 3_000), request(undefined, 'a donation', 4_000)])
    expect(g.queue.some((modal) => modal.kind === 'choice' && modal.scriptId === 'wealth.bundle')).toBe(false)
    expect(pendingSecretaryRequests(g).map((item) => item.category)).toEqual(['kids', 'family', 'friends', 'other'])
    expect(g.character.money).toBeLessThan(100_000_000) // first-year secretary wage only
  })

  it('configures policies through the real Secretary Desk screen', () => {
    const g = game(6)
    hire(g, 'secretary')
    expect(secretaryDeskMenu.visible?.(g)).toBe(true)
    const policy = menuAction(g, 'lux-secretary-policy-kids')
    expect(policy.subtitle && (policy.subtitle as (x: GameState) => string)(g)).toMatch(/approval/i)
    policy.run(g)
    const modal = takeChoice(g, 'luxury.secretary.policy')
    runScript(g, modal.scriptId!, 'decline', modal.data, modal)
    expect(secretaryState(g).policies.kids).toBe('decline')
    expect((policy.subtitle as (x: GameState) => string)(g)).toMatch(/decline/i)
  })

  it('declines a pending item from the inbox with no transfer and cannot replay the stale action', () => {
    const g = game(7)
    hire(g, 'secretary')
    const parent = createPerson(g, { relation: 'parent', age: 70, relationship: 75 })
    presentAsk(g, request(parent, 'home repairs', 7_500))
    const item = pendingSecretaryRequests(g)[0]
    const decline = menuAction(g, `lux-secretary-decline-${item.id}`)
    const before = g.character.money
    decline.run(g)
    expect(g.character.money).toBe(before)
    expect(pendingSecretaryRequests(g)).toEqual([])
    const state = JSON.stringify(secretaryState(g))
    decline.run(g)
    expect(JSON.stringify(secretaryState(g))).toBe(state)
    expect(readTies(g, parent).no).toBe(1)
  })

  it('normalizes malformed inbox state and bounds it to plain finite JSON', () => {
    const g = game(8)
    hire(g, 'secretary')
    g.flags['luxury.secretary'] = {
      owner: g.character.id, v: 99, seq: Number.NaN,
      policies: { kids: 'decline', family: 'bad', friends: 5, other: 'review' },
      inbox: [
        { id: 'sr9', year: Number.POSITIVE_INFINITY, category: 'bad', title: ' Ask ', what: ' Cash ', amount: -5, ask: request(undefined), status: 'bad' },
        { id: '', title: '', what: '', ask: null },
      ],
    } as never
    const state = secretaryState(g)
    expect(state).toMatchObject({ v: 1, owner: g.character.id, seq: 9, policies: { kids: 'decline', family: 'review', friends: 'review', other: 'review' } })
    expect(state.inbox).toHaveLength(1)
    expect(state.inbox[0]).toMatchObject({ id: 'sr9', year: 0, category: 'other', title: 'Ask', what: 'Cash', amount: 0, status: 'pending' })
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('gives an estate manager a real bounded upkeep-saving effect after wages', () => {
    const g = game(9)
    hire(g, 'estateManager')
    g.assets.push({ id: 'estate', kind: 'house', name: 'Large Estate', emoji: '🏡', purchasePrice: 10_000_000, value: 10_000_000, condition: 100, purchasedAge: 40, upkeep: 1_000_000, details: {} })
    const before = g.character.money
    yearlyStaff(g, { left: 0 })
    const saved = g.counters.estateManagementSavings ?? 0
    expect(saved).toBeGreaterThan(0)
    expect(saved).toBeLessThanOrEqual(500_000)
    expect(g.character.money).toBeLessThan(before)
    expect(g.character.money).toBeGreaterThan(before - 1_000_000)
  })

  it('removes screening when the secretary leaves while preserving other staff', () => {
    const g = game(10)
    hire(g, 'secretary')
    hire(g, 'chef')
    g.character.money = 0
    yearlyStaff(g, { left: 0 })
    expect(staffRoster(g)).toEqual([])
    g.character.money = 100_000
    const friend = createPerson(g, { relation: 'friend', age: 40 })
    presentAsk(g, request(friend, 'rent', 100))
    expect(g.queue.some((modal) => modal.kind === 'choice' && modal.scriptId === 'wealth.ask')).toBe(true)
  })
})
