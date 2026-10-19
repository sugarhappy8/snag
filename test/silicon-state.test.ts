// Silicon 2.0: the saved state (readSilicon, readTech's optional member, siliconView and siliconOf).
import { describe, expect, it } from 'vitest'
import { siliconOf, siliconView, techOf, techView } from '../src/game/business/deeptech-core'
import { TECH_VERSION, emptySilicon, isEmptySilicon, readSilicon, readTech } from '../src/game/business/deeptech-state'
import { bizOf } from '../src/game/business/state'
import { SAVE_SCHEMA } from '../src/game/core'
import type { Json } from '../src/game/types'
import { chipLab } from './silicon-kit'

const J = (v: unknown) => JSON.parse(JSON.stringify(v)) as Json

describe('the saved silicon state', () => {
  it('reads hostile values as the default or clamps them', () => {
    for (const v of [undefined, null, 7, 'x', [], {}, { goodwill: NaN }]) expect(isEmptySilicon(readSilicon(v as Json))).toBe(true)
    const s = readSilicon(J({ goodwill: 1e9, lanes: { accel: 0.9, gfx: 'x', core: 0.3, zz: 0.2, mem: -1, cpu: 0.15 }, ceiling: 0.2, lead: 5, applied: 2025.4,
      last: { year: 2025, index: 99, served: 7, depth: 9, win: -1, step: 99, perf: 1e6, quality: NaN } }))
    expect([s.goodwill, s.lanes, s.ceiling, s.lead, s.applied]).toEqual([100, { accel: 0.5, cpu: 0.15 }, 0.6, 0, 2025])
    expect(s.last).toEqual({ year: 2025, index: 10, served: 1, depth: 0.4, win: 0, step: 3, perf: 100, quality: 0 })
    expect([readSilicon(J({ ceiling: 5 })).ceiling, readSilicon(J({ ceiling: 0 })).ceiling, readSilicon(J({ last: { year: 'x' } })).last]).toEqual([1.3, 0, null])
  })
  it('keeps silicon in readTech only when it differs from the default', () => {
    const plain = readTech(undefined)
    expect('silicon' in plain).toBe(false); expect('silicon' in readTech(J({ ...plain, silicon: emptySilicon() }))).toBe(false)
    const kept = readTech(J({ ...plain, silicon: { goodwill: 61 } }))
    expect([kept.silicon?.goodwill, readTech(J(kept)).silicon?.goodwill]).toEqual([61, 61])
    expect(JSON.stringify(readTech(J(plain)))).toBe(JSON.stringify(plain))             // other trades and untouched labs: byte-identical
  })
  it('siliconView never writes and siliconOf creates in place', () => {
    const { g, a, b } = chipLab(), t = techOf(b)
    expect(t.silicon).toBeUndefined()
    const before = JSON.stringify(b.tech); expect(siliconView(t).goodwill).toBe(50); expect(JSON.stringify(b.tech)).toBe(before)
    siliconOf(t).lanes.accel = 0.2; expect(techView(bizOf(g, a)).silicon?.lanes).toEqual({ accel: 0.2 })
  })
  it('leaves TECH_VERSION at 4 and SAVE_SCHEMA at 2', () => { expect([TECH_VERSION, SAVE_SCHEMA]).toEqual([4, 2]) })   // SAVE_SCHEMA from src/game/core
})
