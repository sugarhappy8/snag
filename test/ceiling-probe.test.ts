// R2-P4 (K.7b f, F.1 Ceilings): scale each input of a capped growth term by 100 and assert the real-world cap still holds.
// test/ceiling-list.json names every growth term that has a cap; test/ceiling-kit.ts has one probe row for each, which feeds
// the term inputs far past anything a life reaches (a country's wealth, a book's readers, a podcast's audience) and reports the
// worst value it saw against the limit the cap sentence promises.
//
// Every row runs at SCALES.light (1 and 100) always, and at SCALES.deep (1, 10, 100, 1000) when CEILING_PROBE=deep (the
// nightly). A row that fails names the id, the scale, the value, the limit and the cap sentence.
//
// To cover a new cap: add the entry to test/ceiling-list.json and a row to CEILING_PROBES in the same commit. A row that cannot
// be written is exempt with a reason, and at most three rows may be (the guard below is a ratchet: a fourth needs the lead).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COUNTRIES } from '../src/game/world'
import { CEILING_PROBES, MAX_EXEMPT, SCALES, guardProblems, isExempt, probeFailures, withWealth, type CeilingProbe } from './ceiling-kit'
import { ROOT } from './scan-kit'

const listIds = (): string[] => (JSON.parse(readFileSync(join(ROOT, 'test', 'ceiling-list.json'), 'utf8')) as { id: string }[]).map((c) => c.id)
const deep = process.env.CEILING_PROBE === 'deep'
const scales = deep ? SCALES.deep : SCALES.light
// A row at 1000 times books half a million accounts and flow keys (ledger-caps takes about 9 s on its own), more than vitest's
// default 15 s, so a deep run gives each case room and a pull request keeps a generous one for a slow runner.
const TIMEOUT = deep ? 300_000 : 60_000

describe('ceiling probes: the real rows', () => {
  const live = CEILING_PROBES.filter((p) => !isExempt(p))

  it.each(live.map((p) => [p.id, p] as const))(
    '%s holds at every scale',
    (_id, probe) => {
      expect(probeFailures(probe, scales)).toEqual([])
    },
    TIMEOUT,
  )

  it('has a row for every id of test/ceiling-list.json, none for an id it does not name, and few exemptions', () => {
    expect(guardProblems(CEILING_PROBES, listIds())).toEqual([])
  })

  it('exempts no more than the ratchet allows (today none)', () => {
    expect(CEILING_PROBES.filter(isExempt).length).toBeLessThanOrEqual(MAX_EXEMPT)
  })

  it(
    'measures something at every scale: a positive, finite value against a positive, finite limit',
    () => {
      for (const p of live) {
        for (const scale of scales) {
          const r = p.run(scale)
          expect(Number.isFinite(r.value) && r.value > 0, `${p.id} at ${scale}: value ${r.value}`).toBe(true)
          expect(Number.isFinite(r.limit) && r.limit > 0, `${p.id} at ${scale}: limit ${r.limit}`).toBe(true)
        }
      }
    },
    TIMEOUT,
  )

  it('presses on the cap where the scaled input must reach it: these rows touch their limit at 100 times', () => {
    // If a probe stopped scaling its input, its value would fall back to the 1x value and the row would pass for no reason.
    const touching = ['pay-scale', 'olympic-bonus', 'studio-tail', 'podcast-audience', 'fame-ledger', 'mint-caps', 'burn-caps', 'ledger-caps', 'pool-spreads', 'bond-par', 'transaction-levy', 'lod-caps', 'frontier-caps', 'waves-per-year', 'met-caps', 'persona-nudge']
    for (const id of touching) {
      const p = CEILING_PROBES.find((x) => x.id === id)
      expect(p, id).toBeDefined()
      const r = p!.run(100)
      expect(r.value, `${id}: ${r.value} against ${r.limit}`).toBeGreaterThanOrEqual(r.limit * 0.999)
    }
  }, TIMEOUT)

  it('moves the 1x value of a scaled row off the 100x one for the rows whose input is a country wealth', () => {
    // pay-scale at 1x is the tightest real country, well under the 1.6 clamp; at 100x every rich country sits on it.
    const p = CEILING_PROBES.find((x) => x.id === 'pay-scale')!
    expect(p.run(1).value).toBeLessThan(p.run(100).value)
  })

  it('leaves every country wealth as it found it', () => {
    const before = COUNTRIES.map((c) => c.wealth)
    for (const p of CEILING_PROBES.filter((x) => !isExempt(x))) p.run(100)
    expect(COUNTRIES.map((c) => c.wealth)).toEqual(before)
  }, TIMEOUT)

  it('scales every country wealth for the call and restores it even when the call throws', () => {
    const before = COUNTRIES.map((c) => c.wealth)
    let inside: number[] = []
    expect(() =>
      withWealth(100, () => {
        inside = COUNTRIES.map((c) => c.wealth)
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(inside).toEqual(before.map((w) => w * 100))
    expect(COUNTRIES.map((c) => c.wealth)).toEqual(before)
    expect(withWealth(10, () => 'done')).toBe('done')
    expect(COUNTRIES.map((c) => c.wealth)).toEqual(before)
  })
})

describe('ceiling probes: the kit can fail', () => {
  const grows = (limit: number): CeilingProbe => ({ id: 'extra.grows', cap: 'it must stay under the limit', run: (scale) => ({ value: 10 * scale, limit }) })

  it('passes a row whose value stays at or under its limit at every scale', () => {
    expect(probeFailures(grows(1000), [1, 10, 100])).toEqual([])
    expect(probeFailures(grows(100), [1, 10])).toEqual([])
  })

  it('fails a row that goes over its limit at one scale, naming the id, the scale, the value, the limit and the cap sentence', () => {
    const out = probeFailures(grows(500), [1, 100])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('extra.grows')
    expect(out[0]).toContain('100')
    expect(out[0]).toContain('1000')
    expect(out[0]).toContain('500')
    expect(out[0]).toContain('it must stay under the limit')
  })

  it('fails once for each scale that is over', () => {
    expect(probeFailures(grows(50), [1, 10, 100])).toHaveLength(2)
  })

  it('fails a value that is NaN, as it is not at most any limit', () => {
    const nan: CeilingProbe = { id: 'extra.nan', cap: 'finite', run: () => ({ value: NaN, limit: 1 }) }
    expect(probeFailures(nan, [1])).toHaveLength(1)
  })

  it('reports a probe that throws with its id and the scale, and goes on to the next scale', () => {
    const throws: CeilingProbe = { id: 'extra.throws', cap: 'a cap', run: (scale) => { if (scale === 10) throw new Error('boom at ten'); return { value: 1, limit: 2 } } }
    const out = probeFailures(throws, [1, 10, 100])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('extra.throws')
    expect(out[0]).toContain('10')
    expect(out[0]).toContain('boom at ten')
  })

  it('names where the worst case was when the row says so', () => {
    const at: CeilingProbe = { id: 'extra.at', cap: 'a cap', run: () => ({ value: 3, limit: 2, at: 'country ng in 1950' }) }
    expect(probeFailures(at, [1])[0]).toContain('country ng in 1950')
  })
})

describe('ceiling probes: the guard can fail', () => {
  const row = (id: string, extra: Partial<CeilingProbe> = {}): CeilingProbe => ({ id, cap: 'a cap', run: () => ({ value: 1, limit: 2 }), ...extra })

  it('passes when every listed id has a row and an extra row starts extra.', () => {
    expect(guardProblems([row('a'), row('b'), row('extra.c')], ['a', 'b'])).toEqual([])
  })

  it('fails a listed id with no row, naming it', () => {
    const out = guardProblems([row('a')], ['a', 'b'])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('b')
  })

  it('fails a row for an id the list does not have unless it starts extra.', () => {
    const out = guardProblems([row('a'), row('zzz')], ['a'])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('zzz')
  })

  it('fails a repeated row id', () => {
    expect(guardProblems([row('a'), row('a')], ['a']).join(' ')).toContain('twice')
  })

  it('rejects an exempt row with no reason, a blank one and a one-word one, and accepts a sentence', () => {
    for (const bad of ['', '   ', 'later']) {
      const out = guardProblems([row('a', { exempt: bad })], ['a'])
      expect(out.length, JSON.stringify(bad)).toBeGreaterThan(0)
      expect(out[0]).toContain('a')
    }
    expect(guardProblems([row('a', { exempt: 'the cap is a constant inside a yearly loop and the life probe covers it' })], ['a'])).toEqual([])
  })

  it('rejects a fourth exemption, and takes three', () => {
    const why = 'the cap is a constant inside a yearly loop and the life probe covers it'
    const ids = ['a', 'b', 'c', 'd']
    const three = ids.map((id, i) => row(id, i < 3 ? { exempt: why } : {}))
    expect(guardProblems(three, ids)).toEqual([])
    const four = ids.map((id) => row(id, { exempt: why }))
    expect(guardProblems(four, ids).join(' ')).toMatch(/exempt/)
  })

  it('rejects a row with no cap sentence', () => {
    expect(guardProblems([row('a', { cap: '' })], ['a']).join(' ')).toContain('a')
  })
})

describe('ceiling probes: the scales', () => {
  it('are 1 and 100 on a pull request and 1, 10, 100 and 1000 in the nightly', () => {
    expect([...SCALES.light]).toEqual([1, 100])
    expect([...SCALES.deep]).toEqual([1, 10, 100, 1000])
  })
})
