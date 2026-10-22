// ci: fast
// R2-K9 (K.3 e): the yearly hooks of ageUp are modules (src/game/modules/yearly-aging.ts), run from the registry.
//
// test/kernel-parity.test.ts holds what the conversion must not change: the hooks, their relative order, the state after N seeded years.
// This file holds what parity cannot see. The phase and order each hook sits in (a new module picks its phase by them, so a hook that
// slipped into another phase would keep today's order and still change where a later track's module runs), that ageUp reads the registry
// afresh each year, and that a track adds a hook by registering one module and touching nobody else's list.
//
// No pinned seed: the one life is makeTestGame's own, with a tuple of arguments.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { getModule, registerModule, withYearly, yearlyEntries, YEARLY_PHASES } from '../src/game/kernel/registry'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

/** The pinned table of the R2 Kernel plan (section 2): name, phase, order. The 35 hooks of v4.1.1, then the world step of R2-L17. */
const TABLE: readonly (readonly [string, string, number])[] = [
  ['history', 'life', 10],
  ['digest', 'life', 20],
  ['household', 'life', 30],
  ['relationships', 'life', 40],
  ['sharedProjects', 'life', 50],
  ['givingFund', 'life', 60],
  ['background', 'life', 70],
  ['royalty', 'life', 80],
  ['royalCareers', 'life', 90],
  ['health', 'life', 100],
  ['education', 'life', 110],
  ['professions', 'life', 120],
  ['career', 'careers', 10],
  ['special', 'careers', 20],
  ['nation', 'government', 10],
  ['workshop', 'firms', 10],
  ['corruption', 'firms', 20],
  ['business', 'firms', 30],
  ['techWaves', 'firms', 40],
  ['development', 'money', 10],
  ['investments', 'money', 20],
  ['hedge', 'money', 30],
  ['shops', 'money', 40],
  ['computer', 'money', 50],
  ['finance', 'money', 60],
  ['wealth', 'money', 70],
  ['familyUse', 'money', 80],
  ['nepo', 'money', 90],
  ['willFeuds', 'money', 100],
  ['immigration', 'assets', 10],
  ['assets', 'assets', 20],
  ['crime', 'assets', 30],
  ['underworld', 'assets', 40],
  ['advisors', 'advisors', 10],
  ['milestones', 'close', 10],
  ['world', 'settle', 10],
]

describe('the aging hooks are modules in the pinned phases', () => {
  it('each hook is the module yearly.<name> with one entry in the aging seam, in its phase and order', () => {
    for (const [name, phase, order] of TABLE) {
      const def = getModule(`yearly.${name}`)
      expect(def, `module yearly.${name}`).toBeDefined()
      expect(def!.layer, name).toBe(3)
      expect(def!.yearly, name).toEqual([{ seam: 'aging', phase, order, run: expect.any(Function) }])
    }
  })

  it('the ids are the names, and the registry runs them in the table order', () => {
    const all = yearlyEntries('aging').map((e) => e.id)
    // R3: a module of a later track sits among the hooks under its own id. effort.you (R3-E6) runs right after the household at order 35;
    // knowledge.core (R3-H5, close phase, order 20) sits between milestones and world. The 36 hooks of R2 keep their order and their ids.
    const ran = all.filter((id) => id.startsWith('yearly.'))
    expect(ran).toEqual(TABLE.map(([name]) => `yearly.${name}`))
    expect(all[all.indexOf('yearly.household') + 1]).toBe('effort.you')
    expect(all[all.indexOf('yearly.milestones') + 1]).toBe('knowledge.core')
    expect(all[all.indexOf('knowledge.core') + 1]).toBe('yearly.world')
  })

  it('every phase of the table is a phase of the aging seam, and the orders are multiples of ten so a track can insert between two', () => {
    for (const [name, phase, order] of TABLE) {
      expect(YEARLY_PHASES.aging as readonly string[], name).toContain(phase)
      expect(order % 10, name).toBe(0)
    }
  })
})

describe('a track adds a hook by registering a module', () => {
  it('a module with order 45 in phase life runs once a year, between relationships and sharedProjects', () => {
    const seen: number[] = []
    registerModule({ id: 'ext.k9between', layer: 3, yearly: [{ seam: 'aging', phase: 'life', order: 45, run: (g) => void seen.push(g.character.age) }] })
    const ids = yearlyEntries('aging').map((e) => e.id)
    expect(ids.indexOf('ext.k9between')).toBe(ids.indexOf('yearly.relationships') + 1)
    expect(ids.indexOf('ext.k9between')).toBe(ids.indexOf('yearly.sharedProjects') - 1)

    // the real loop: ageUp walks the registry, so the new module runs inside the year, in place
    const trace: string[] = []
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    withYearly(
      'aging',
      yearlyEntries('aging').map((e) => ({
        ...e,
        run: (gg: GameState) => {
          trace.push(e.id)
          e.run(gg)
        },
      })),
      () => ageUp(g),
    )
    expect(seen).toEqual([41])
    expect(trace.filter((id) => id === 'ext.k9between')).toHaveLength(1)
    const at = trace.indexOf('ext.k9between')
    expect(trace.slice(at - 1, at + 2)).toEqual(['yearly.relationships', 'ext.k9between', 'yearly.sharedProjects'])
    expect(trace[0]).toBe('yearly.history')
    expect(trace[trace.length - 1]).toBe('yearly.world')
  })

  it('ageUp reads the list afresh each year: a later registration is in the next year, not the one that came before', () => {
    const calls: string[] = []
    const g = makeTestGame(8, { age: 40, money: 50_000 })
    ageUp(g)
    g.queue = []
    registerModule({ id: 'ext.k9late', layer: 3, yearly: [{ seam: 'aging', phase: 'news', order: 10, run: () => void calls.push('late') }] })
    ageUp(g)
    expect(calls).toEqual(['late'])
  })
})
