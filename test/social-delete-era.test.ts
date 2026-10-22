import { describe, expect, it } from 'vitest'
import { anachronismsIn } from '../src/game/events/era'
import { socialMediaMenu } from '../src/game/special/social'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function findAction(g: GameState, nodes: MenuNode[], id: string): MenuAction | undefined {
  for (const node of nodes) {
    if (node.type === 'action' && node.id === id) return node
    if (node.type === 'menu') {
      const found = findAction(g, node.children(g), id)
      if (found) return found
    }
  }
}

describe('social account deletion era text', () => {
  it('keeps both deletion notices era-safe before widespread smartphones', () => {
    const notices = new Set<string>()
    for (let seed = 1; seed <= 16; seed += 1) {
      const g = makeTestGame(seed, { age: 20 })
      // Text draws left g.rng (R2), so a life varies its prose by its life id, not by its seed.
      g.lifeId = `delete-era-${seed}`
      g.year = 2009
      const join = findAction(g, socialMediaMenu.children(g), 'social.friendbook.join')!
      expect(join.visible?.(g)).toBe(true)
      join.run(g, 'historical-account')
      g.queue = []
      g.rng = seed
      findAction(g, socialMediaMenu.children(g), 'social.friendbook.delete')!.run(g)
      const notice = g.queue.find((item) => item.kind === 'notice')
      expect(notice?.kind).toBe('notice')
      if (notice?.kind !== 'notice') throw new Error('Deletion notice missing')
      notices.add(notice.text)
      expect(anachronismsIn(notice.text, 2009, ['us'])).toEqual([])
      expect(g.character.social).toBeNull()
    }
    expect(notices.size).toBe(2)
  })
})
