// R4 fix (rehearsal-2 item 4, root cause A): the prison letter on a stamped life, run the way the store runs a menu action.
//
// The menu is built from the committed state, which the store treats as frozen; run() gets a draft (cloneForAct). The letter's
// run closure takes the draft as `gg`. R4-E5's mechanical diff (645d6cd) put the menu-building `g` into one call there,
// addRelationship(g, target, ...), so the edge mirror wrote the edge `person > player` into the frozen committed state:
// "Cannot assign to read only property 'edges'". It is latent on an unstamped life, because the mirror returns at !socialOn(g).
//
// What this file holds: the throw is gone, the edge lands on the draft the action ran on, and the committed state is left as it was.
import { afterEach, describe, expect, it } from 'vitest'
import { bindMoneyContext } from '../src/game/core'
import { personEntity } from '../src/game/kernel/person-ref'
import { prisonMenu, sendToPrison } from '../src/game/prison'
import { cloneForAct } from '../src/game/save-clone'
import type { GameState, MenuAction, MenuNode, Person } from '../src/game/types'
import { readEdge } from '../src/game/world/edges'
import { playerRef } from '../src/game/world/people'
import { deepFreeze } from './fuzz-kit'
import { findSeed } from './seed-kit'
import { cast, socialGame } from './social-kit'

afterEach(() => bindMoneyContext(null))

function findNode(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

/** A stamped adult in prison with one friend outside who likes them well enough to write back. */
function jailed(seed: number): { g: GameState; friendId: string } {
  const g = socialGame(seed, { age: 30 })
  const friend = cast(g, 60, 'friend')
  sendToPrison(g, 'Test', 3)
  return { g, friendId: friend.id }
}

function letterTo(g: GameState, friendId: string): MenuAction {
  const n = findNode(g, prisonMenu.children(g), `prison.letter.${friendId}`)
  if (!n || n.type !== 'action') throw new Error(`no letter action for ${friendId}`)
  return n
}

const personOf = (g: GameState, id: string): Person => g.people.find((p) => p.id === id)!
const edgeOf = (g: GameState, p: Person) => readEdge(g, personEntity(p), playerRef(g))

/** The store's runMenuAction on a committed state: the menu is built from `g` (deep-frozen), run() gets a draft. */
function runLikeTheStore(g: GameState, friendId: string): GameState {
  deepFreeze(g)
  const action = letterTo(g, friendId)
  const draft = cloneForAct(g)
  bindMoneyContext(draft)
  action.run(draft)
  return draft
}

describe('the prison letter on a stamped life, through a frozen menu state', () => {
  // The letter has two ways to end without a reply (the guards confiscate it one time in five); the test wants the reply.
  const seed = findSeed(
    (s) => {
      const { g, friendId } = jailed(s)
      const before = personOf(g, friendId).relationship
      const action = letterTo(g, friendId)
      const draft = structuredClone(g)
      action.run(draft)
      return personOf(draft, friendId).relationship > before
    },
    { label: 'a stamped prisoner whose letter to a friend of 60 is answered' },
  )

  it('does not throw (the mirror writes to the state the action runs on, not the one the menu was built from)', () => {
    const { g, friendId } = jailed(seed)
    expect(() => runLikeTheStore(g, friendId)).not.toThrow()
  })

  it('puts the edge on the draft, equal to the relationship after the letter', () => {
    const { g, friendId } = jailed(seed)
    const before = personOf(g, friendId).relationship
    const draft = runLikeTheStore(g, friendId)
    const after = personOf(draft, friendId)
    expect(after.relationship).toBeGreaterThan(before)
    const e = edgeOf(draft, after)
    expect(e, 'the draft has no edge for the friend').not.toBeNull()
    expect(e!.f).toBe(after.relationship)
  })

  it('leaves the committed (frozen) state as it was: no edge for the friend', () => {
    const { g, friendId } = jailed(seed)
    const before = JSON.stringify(g)
    runLikeTheStore(g, friendId)
    expect(edgeOf(g, personOf(g, friendId))).toBeNull()
    expect(JSON.stringify(g)).toBe(before)
  })
})
