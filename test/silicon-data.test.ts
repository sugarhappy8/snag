// Silicon 2.0: the 2024-2027 squeeze window and the chip lane table.
import { describe, expect, it } from 'vitest'
import { CHIP_LANES, SHORTAGE_MARKUP, laneById, laneOpen } from '../src/game/business/silicon-data'
import { GPU_SHORTAGE, MARKET_EVENTS, shortageIntensity } from '../src/game/history/market-events'

describe('the squeeze window', () => {
  const boom = MARKET_EVENTS.find((e) => e.id === 'aiBoom')!
  it('has exactly 2024 to 2027 and the boom geography', () => {
    expect(Object.keys(GPU_SHORTAGE).map(Number)).toEqual([2024, 2025, 2026, 2027])
    for (const y of [2023, 2024, 2025, 2026, 2027, 2028, 2035]) for (const c of ['us', 'de', 'jp'])
      expect(shortageIntensity(c, y)).toBeCloseTo((GPU_SHORTAGE[y] ?? 0) * (c === 'us' ? 1 : boom.abroad!), 10)
    expect([shortageIntensity('us', 2025), shortageIntensity('us', 2023), shortageIntensity('us', 2028)]).toEqual([1, 0, 0])
  })
  it('peaks in 2025, fades, and stays outside MARKET_EVENTS', () => {
    expect(GPU_SHORTAGE[2025]).toBeGreaterThan(GPU_SHORTAGE[2024]); expect(GPU_SHORTAGE[2026]).toBeLessThan(GPU_SHORTAGE[2025]); expect(GPU_SHORTAGE[2027]).toBeLessThan(GPU_SHORTAGE[2026])
    expect(MARKET_EVENTS.every((e) => e.years !== GPU_SHORTAGE)).toBe(true)         // no popup, no market-events pin can move
  })
})
describe('the chip lanes', () => {
  it('match the spec table', () => {
    expect(CHIP_LANES.map((l) => [l.id, l.label, l.weight, l.shortage])).toEqual([['core', 'General chips', 0.25, 0], ['gfx', 'Consumer graphics', 0.2, 0.4], ['cpu', 'Data-center CPUs', 0.15, 0], ['mem', 'Memory', 0.15, 0.5], ['accel', 'Data-center accelerators', 0.25, 1]])
    expect(CHIP_LANES.filter((l) => l.id !== 'core').reduce((s, l) => s + l.weight, 0)).toBeCloseTo(0.75, 10); expect(SHORTAGE_MARKUP).toBe(0.12)
  })
  it('open by era and state', () => {
    const lane = (id: string) => laneById(id)!, t = (o: object = {}) => ({ stage: 2, plant: 0, done: [] as string[], ...o })
    expect([laneOpen(lane('gfx'), t(), 1994), laneOpen(lane('gfx'), t(), 1995), laneOpen(lane('gfx'), t({ stage: 1 }), 2000)]).toEqual([false, true, false])
    expect([laneOpen(lane('mem'), t(), 2000), laneOpen(lane('mem'), t({ plant: 1 }), 2000)]).toEqual([false, true])
    expect([laneOpen(lane('accel'), t({ done: ['aiChip'] }), 2022), laneOpen(lane('accel'), t({ done: ['aiChip'] }), 2023), laneOpen(lane('accel'), t(), 2025)]).toEqual([false, true, false])
    expect([laneOpen(lane('core'), t({ stage: 1 }), 1950), laneOpen(lane('core'), t({ stage: 0 }), 2025)]).toEqual([true, false])
  })
})
