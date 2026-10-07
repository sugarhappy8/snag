// Many managed companies mean many CEO letters: past two a year they arrive as one bundled popup.
import { describe, expect, it } from 'vitest'
import { notice } from '../src/game/core'
import { bundleCeoLetters } from '../src/game/business/yearly'
import { createNewLife } from '../src/game/life'
import type { NoticeModal } from '../src/game/types'

function letter(name: string, n: number): [string, string] {
  const bullets = Array.from({ length: n }, (_, i) => `\u{2022} Change ${i + 1} at ${name}.`)
  return [`${name}: Letter from the CEO`, `Dear Sam,\n${bullets.join('\n')}\n\u{2014} Pat Lee, CEO (steady)`]
}

describe('CEO letters', () => {
  it('two letters stay separate popups', () => {
    const g = createNewLife({ seed: 3, year: 1990, countryId: 'us' })
    g.queue = []
    for (const name of ['A Co', 'B Co']) notice(g, ...letter(name, 4))
    bundleCeoLetters(g, 0)
    expect(g.queue).toHaveLength(2)
  })

  it('three or more become one bundle that keeps every company and the other popups in place', () => {
    const g = createNewLife({ seed: 4, year: 1990, countryId: 'us' })
    g.queue = []
    notice(g, 'Earlier', 'Something from before the business year.')
    const from = g.queue.length
    notice(g, ...letter('A Co', 5))
    notice(g, 'Scandal', 'A business event in between.')
    notice(g, ...letter('B Co', 2))
    notice(g, ...letter('C Co', 3))
    bundleCeoLetters(g, from)
    const titles = g.queue.map((m) => (m.kind === 'notice' ? m.title : m.kind))
    expect(titles).toEqual(['Earlier', 'Letters from Your CEOs', 'Scandal'])
    const text = (g.queue[1] as NoticeModal).text
    for (const name of ['A Co', 'B Co', 'C Co']) expect(text).toContain(`${name} \u{00B7} Pat Lee, CEO (steady):`)
    expect(text).toContain('and 2 more changes')
    expect(text).not.toContain('Change 4 at A Co')
  })
})
