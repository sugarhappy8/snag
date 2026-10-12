// Regressions for bugs found by the deep engine fuzzer (test/fuzz-kit.ts). Each test is small and
// deterministic. Menus are built from the committed state and actions run on a structuredClone
// draft, exactly like the UI store does; the committed state is deep-frozen so a menu closure
// that writes to an object it captured from it (instead of the draft) throws.
import { describe, expect, it } from 'vitest'
import { readTies } from '../src/game/events/wealth-core'
import { removeHeir, changeWill } from '../src/game/events/will-act'
import { willPersonNodes } from '../src/game/events/will-amends'
import { readWl, updateWl } from '../src/game/events/will-core'
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

  /** A grown child who found out they were written out of the will, and is angry about it. */
  function feud(seed: number) {
    const g = makeTestGame(seed, { age: 62, money: 5_000_000 })
    const kid = createPerson(g, { relation: 'child', age: 31, relationship: 70, money: 30_000, traits: ['caring', 'calm'] })
    changeWill(g, (gg, w) => removeHeir(gg, w, kid))
    g.queue = []
    updateWl(g, kid, (w) => {
      w.known = true
      w.how = 'leak'
      w.knownY = g.year
      w.told = 'out'
      w.anger = 70
    })
    return { g, kid }
  }

  it('Your Will › Smooth It Over with Money pays the relative and eases their anger in the draft', () => {
    const { g, kid } = feud(20)
    const gift = child(willPersonNodes(g, kid), 'will.gift') as MenuAction
    const draft = runLikeStore(g, gift, '50000')
    const after = draft.people.find((p) => p.id === kid.id)!
    expect(draft.character.money).toBe(g.character.money - 50_000)
    expect(after.money).toBe(kid.money + 50_000)
    expect(readWl(draft, after).anger).toBeLessThan(70)
    expect(readWl(draft, after).buyY).toBe(draft.year)
    // ...so the row is spent for the year (the store re-checks the tapped row against the draft).
    expect(gift.disabledReason?.(draft)).toMatch(/already tried/)
  })

  it('Your Will › Heart-to-Heart and Explain Your Reasons are remembered in the draft', () => {
    const { g, kid } = feud(21)
    const peace = child(willPersonNodes(g, kid), 'will.peace') as MenuAction
    const talked = runLikeStore(g, peace)
    expect(readWl(talked, talked.people.find((p) => p.id === kid.id)!).talkY).toBe(talked.year)
    expect(peace.disabledReason?.(talked)).toMatch(/already tried/)

    const { g: g2, kid: kid2 } = feud(22)
    const explain = child(willPersonNodes(g2, kid2), 'will.explain') as MenuAction
    const explained = runLikeStore(g2, explain)
    const w = readWl(explained, explained.people.find((p) => p.id === kid2.id)!)
    expect(w.explained).toBe('kind')
    expect(w.anger).toBeLessThan(70)
  })
})
