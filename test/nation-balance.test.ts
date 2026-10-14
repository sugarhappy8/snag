// Politics 2.0 balance, a few seeded lives per strategy through the real yearly loop
// (test/politics-kit.ts). The opt-in deep fuzzer (test/fuzz-politics.test.ts) plays many more.
import { describe, expect, it } from 'vitest'
import { playPolitician, summarize, type PolStats, type Strategy } from './politics-kit'

describe('honest, careful-corrupt and reckless heads of government', () => {
  it('the honest stay out of court, the reckless mostly fall, and graft is never a sure thing', () => {
    const rows: PolStats[] = []
    for (const s of ['honest', 'corrupt', 'reckless'] as Strategy[]) for (let seed = 101; seed <= 106; seed++) rows.push(playPolitician(s, seed, seed % 2 ? 'us' : 'br', 1995, 12))
    console.log(summarize(rows))
    const rate = (s: Strategy) => rows.filter(r => r.strategy === s && r.ruined).length / rows.filter(r => r.strategy === s).length
    expect(rows.flatMap(r => r.text.filter(t => !t.startsWith('record') && !t.startsWith('died')))).toEqual([])
    expect(rate('honest')).toBeLessThanOrEqual(1 / 6)
    expect(rate('reckless')).toBeGreaterThanOrEqual(.5)
    expect(rate('reckless')).toBeGreaterThan(rate('honest'))
    // Careful graft pays something on average, and is not risk-free.
    const corrupt = rows.filter(r => r.strategy === 'corrupt')
    expect(corrupt.reduce((t, r) => t + r.laundered, 0)).toBeGreaterThan(0)
    expect(corrupt.every(r => r.taken > 0)).toBe(true)
    // Nobody launders more than their schemes took.
    for (const r of rows) expect(r.laundered).toBeLessThanOrEqual(r.taken)
  }, 600_000)
})
