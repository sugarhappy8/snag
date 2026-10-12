// Regressions for bugs found by the deep engine fuzzer (test/fuzz-kit.ts). Each test is small and
// deterministic. Menus are built from the committed state and actions run on a structuredClone
// draft, exactly like the UI store does; the committed state is deep-frozen so a menu closure
// that writes to an object it captured from it (instead of the draft) throws.
import { describe, expect, it } from 'vitest'
import { readTies } from '../src/game/events/wealth-core'
import { createPerson } from '../src/game/people'
import { lineById } from '../src/game/shops/luxury-brands-catalog'
import { buyOffer } from '../src/game/shops/luxury-brands-deal'
import { luxuryAssetNodes } from '../src/game/shops/luxury-brands-assets'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

/** store.runMenuAction: the row comes from the committed state, run() gets a fresh draft. */
function runLikeStore(committed: GameState, action: MenuAction, input?: string): GameState {
  deepFreeze(committed)
  const draft = structuredClone(committed)
  action.run(draft, input)
  return draft
}

function child(nodes: MenuNode[], id: string): MenuNode {
  const n = nodes.find((x) => x.id === id)
  if (!n) throw new Error(`no node ${id} in [${nodes.map((x) => x.id).join(', ')}]`)
  return n
}

describe('menu actions write to the draft, not the state they were built from', () => {
  it('Give as a Gift (luxury piece) records the gift on the receiver in the draft', () => {
    const g = makeTestGame(3, { age: 40, money: 5e9 })
    const l = lineById('cartier-tank')
    if (!l) throw new Error('cartier-tank')
    buyOffer(g, l, 0, 'boutique')
    g.queue = []
    const watch = g.assets[g.assets.length - 1]
    const kid = createPerson(g, { relation: 'child', age: 20, relationship: 70 })
    const gift = child(luxuryAssetNodes(g, watch) ?? [], `lux-gift-${watch.id}`) as MenuGroup
    const row = child(gift.children(g), `lux-giftto-${watch.id}-${kid.id}`) as MenuAction
    const worth = watch.value
    const draft = runLikeStore(g, row)
    expect(draft.assets.some((a) => a.id === watch.id)).toBe(false)
    const receiver = draft.people.find((p) => p.id === kid.id)!
    expect(readTies(draft, receiver).given).toBe(Math.round(worth))
  })
})
