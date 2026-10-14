// Deep Politics 2.0 fuzzer (opt-in, like fuzz-deep):
//
//   FUZZ=1 npx vitest run test/fuzz-politics.test.ts
//   FUZZ=1 FUZZ_SEEDS=60 FUZZ_YEARS=16 npx vitest run test/fuzz-politics.test.ts
//
// Plays seeded heads of government with three strategies (honest, careful corrupt, reckless) across
// countries and eras through the real yearly loop and checks: no broken text, menus stay pure, the
// records survive a JSON round trip, and the balance claims hold: the honest are rarely ruined, the
// reckless usually are, and no strategy turns office into a reliable money printer.
import { describe, expect, it } from 'vitest'
import { playPolitician, summarize, type PolStats, type Strategy } from './politics-kit'

const env = process.env
const enabled = env.FUZZ === '1'
const seeds = Number(env.FUZZ_SEEDS ?? 30)
const years = Number(env.FUZZ_YEARS ?? 14)
const PLACES: [string, number][] = [['us', 1995], ['gb', 1975], ['br', 1990], ['ng', 2005], ['ru', 2000], ['se', 2010], ['in', 1985], ['jp', 1960], ['ve', 2020], ['de', 2030]]

describe.skipIf(!enabled)('deep politics fuzz', () => {
  it(`plays ${seeds} seeds per strategy without a failure`, () => {
    const rows: PolStats[] = []
    for (const s of ['honest', 'corrupt', 'reckless'] as Strategy[]) {
      for (let k = 0; k < seeds; k++) {
        const [country, year] = PLACES[k % PLACES.length]
        const r = playPolitician(s, 1000 + k, country, year, years)
        rows.push(r)
        const bad = r.text.filter(t => !t.startsWith('record') && !t.startsWith('died'))
        if (bad.length) console.log(s, r.seed, country, bad.slice(0, 3))
      }
    }
    console.log(summarize(rows))
    for (const [country] of PLACES) console.log(country, summarize(rows.filter(r => r.country === country)).replace(/\n/g, ' | '))
    const of = (s: Strategy) => rows.filter(r => r.strategy === s)
    const ruin = (s: Strategy) => of(s).filter(r => r.ruined).length / of(s).length
    expect(rows.flatMap(r => r.text.filter(t => !t.startsWith('record') && !t.startsWith('died')))).toEqual([])
    expect(ruin('honest')).toBeLessThan(.1)
    expect(ruin('reckless')).toBeGreaterThan(.55)
    expect(ruin('corrupt')).toBeGreaterThan(.1)
    // No reliable money printer: for every strategy, a big clean haul without ruin is far from certain.
    for (const s of ['corrupt', 'reckless'] as Strategy[]) {
      const sure = of(s).filter(r => !r.ruined && r.cleanYears > 10).length / of(s).length
      console.log(`${s}: ${(sure * 100).toFixed(0)}% got more than 10 years of salary clean and walked away`)
      expect(sure).toBeLessThan(.75)
    }
    for (const r of rows) expect(r.laundered).toBeLessThanOrEqual(r.taken)
  }, 24 * 3600_000)
})
