// R3 fix (fog): the reveal sink with the REAL key registry. A failed or finished piece of research hands a Reveal to the sink, and the sink
// sharpens the stored rows whose key kind says that field bears on it (`revealedBy`). test/knowledge-yearly.test.ts holds the sink with
// synthetic kinds; this file holds that the kinds the game registers (riv, mkt) really name research fields, so hidden facts are estimates
// until researched, and not only until bought.
import { describe, expect, it } from 'vitest'
import { marketViewOf } from '../src/game/business/competition'
import { rdField, rdTask } from '../src/game/business/rd-effort'
import { bookResearch } from '../src/game/business/research-effort'
import { lineKey, marketSizeKey, rivalKey, rivalLinesOf, rivalTruth, marketTruth } from '../src/game/business/market-fog'
import { readBiz } from '../src/game/business/state'
import { revealedSink } from '../src/game/effort/hooks'
import type { Reveal } from '../src/game/effort/types'
import { learn, readKnow } from '../src/game/knowledge/contract'
import { kindOf } from '../src/game/knowledge/kinds'
import '../src/game/knowledge/module'
import type { Asset, GameState } from '../src/game/types'
import { inFog } from './knowledge-kit'
import { adult, company, nextYear } from './market-kit'

type Industry = Parameters<typeof company>[1]

function setup(ind: Industry, cid: string, year: number, seed: number): { g: GameState; a: Asset } {
  const g = adult(seed, year, cid)
  const a = company(g, ind)
  for (let i = 0; i < 3; i++) nextYear(g)
  return { g, a }
}

const reveal = (field: string, strength = 0.5): Reveal => ({ field, strength, kind: 'fail' })
const row = (g: GameState, key: string) => readKnow(g)?.k[key] ?? null

describe('the real key kinds say which research reveals them', () => {
  it('riv and mkt both declare revealedBy', () => {
    expect(typeof kindOf('riv')?.revealedBy).toBe('function')
    expect(typeof kindOf('mkt')?.revealedBy).toBe('function')
  })

  it('a rival quality read lists the research of the families that rival sells', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const rival = marketViewOf(g, b).rivals.find((r) => rivalLinesOf(g, b, r).length > 0)!
    expect(rival).toBeDefined()
    const fields = kindOf('riv')!.revealedBy!(g, rivalKey(b, rival.id, 'quality'))
    for (const l of rivalLinesOf(g, b, rival).slice(0, 4)) expect(fields, l.family).toContain(rdField(l.family))
  })

  it('a rival that is gone reveals nothing', () => {
    const { g } = setup('software', 'us', 2015, 5)
    expect(kindOf('riv')!.revealedBy!(g, 'riv:zzzzzz:quality')).toEqual([])
  })
})

describe('Realistic: a failed project in a rival family narrows the stored row to a lab reading', () => {
  it('quality of a rival, once a year', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const rival = marketViewOf(g, b).rivals.find((r) => rivalLinesOf(g, b, r).length > 0)!
    const key = rivalKey(b, rival.id, 'quality')
    const truth = rivalTruth(g, key)!
    const family = rivalLinesOf(g, b, rival)[0]!.family
    inFog(() => {
      expect(learn(g, key, { mid: truth * 1.4, sd: 0.4, src: 'press' }), 'press read').not.toBeNull()
      const before = row(g, key)!
      expect(before.src).toBe('press')
      revealedSink(g, [reveal(rdField(family), 0.6)])
      const after = row(g, key)!
      expect(after.src).toBe('press+lab')
      expect(after.sd).toBeLessThan(before.sd)
      // a second reveal the same year changes nothing more (once a year per key)
      const again = JSON.stringify(row(g, key))
      revealedSink(g, [reveal(rdField(family), 0.9)])
      expect(JSON.stringify(row(g, key))).toBe(again)
    })
  })

  it('through the engine: a failed project booked by bookResearch reads the stored row once', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const rival = marketViewOf(g, b).rivals.find((r) => rivalLinesOf(g, b, r).length > 0)!
    const key = rivalKey(b, rival.id, 'quality')
    const truth = rivalTruth(g, key)!
    const family = rivalLinesOf(g, b, rival)[0]!.family
    inFog(() => {
      learn(g, key, { mid: truth * 1.4, sd: 0.4, src: 'press' })
      const task = rdTask(1_000_000, 2, family, 3)
      const res = bookResearch(g, a, task, { kind: 'fail', margin: -10, cause: 'deadEnd', done: 0.5 })
      expect(res?.reveals[0]?.field).toBe(rdField(family))
      expect(row(g, key)!.src).toBe('press+lab')
    })
  })

  it('a field that is not the rival family teaches nothing', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const rival = marketViewOf(g, b).rivals.find((r) => rivalLinesOf(g, b, r).length > 0)!
    const key = rivalKey(b, rival.id, 'quality')
    const truth = rivalTruth(g, key)!
    inFog(() => {
      learn(g, key, { mid: truth * 1.4, sd: 0.4, src: 'press' })
      const before = JSON.stringify(row(g, key))
      revealedSink(g, [reveal('rd.noSuchFamilyAnywhere', 1)])
      expect(JSON.stringify(row(g, key))).toBe(before)
    })
  })

  it('a product line of a rival', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const rival = marketViewOf(g, b).rivals.find((r) => rivalLinesOf(g, b, r).length > 0)!
    const line = rivalLinesOf(g, b, rival)[0]!
    const key = lineKey(b, rival.id, line.family)
    inFog(() => {
      learn(g, key, { mid: line.quality * 1.4, sd: 0.4, src: 'press' })
      revealedSink(g, [reveal(rdField(line.family), 0.7)])
      expect(row(g, key)!.src).toBe('press+lab')
    })
  })

  it('a market size of the player industry', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const key = marketSizeKey(b.industry, b.countryId)
    const truth = marketTruth(g, key)!
    expect(truth).toBeGreaterThan(0)
    const rival = marketViewOf(g, b).rivals.find((r) => rivalLinesOf(g, b, r).length > 0)!
    const family = rivalLinesOf(g, b, rival)[0]!.family
    inFog(() => {
      learn(g, key, { mid: truth * 1.5, sd: 0.4, src: 'press' })
      revealedSink(g, [reveal(rdField(family), 0.7)])
      expect(row(g, key)!.src).toBe('press+lab')
    })
  })
})
