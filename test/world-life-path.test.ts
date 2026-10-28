// ci: fast
// R4-L2 (D.5 a): the mortality leaf (src/game/world/mortality.ts) and the pure life path (src/game/world/life-path.ts). A relative who
// exists only as a record is never stepped: ageTo(g, base, year) says from the family seed whether the record is alive in a year, and
// whether it is unwell. Luck is outcomeStream(g, 'life.path', y, sid) (the death roll) and the same with `sid|ill` (the illness
// roll), so no g.rng draw, no write, no g.nextId; a reload, a clone, an heir and a rerun see the same years, and a Time Machine jump
// re-rolls the year it lands in and keeps the finished ones. Nothing calls ageTo yet (L3 reads it, L4 steps with it).
//
// The golden file test/fixtures/life-path-golden.json (60 rows) is recorded in the commit that adds this test, under Node 22, and
// never re-recorded:
//   RECORD_LIFE_PATH_GOLDEN=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/world-life-path.test.ts
// No pinned seed: families are string constants, and a base is a sid, a birth year and a health.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { outcomeStream } from '../src/game/kernel/streams'
import { npcMortality as fromRelationships } from '../src/game/relationships'
import type { GameState } from '../src/game/types'
import { npcMortality } from '../src/game/world/mortality'
import { LIFE_MAX_AGE, ageTo, healthAt, type KinBase, type LifeState } from '../src/game/world/life-path'
import { isSid, makeSid } from '../src/game/world/sid'
import { frozenGame } from './effort-kit'
import { canonicalJson } from './golden-kit'
import { layerOf } from './layer-kit'

// Every call of outcomeStream made while the file runs: the spy of the "never past 130" cases. It forwards to the real function.
const seen = vi.hoisted(() => ({ calls: [] as { tag: string; year: number; id: string }[] }))
vi.mock('../src/game/kernel/streams', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/kernel/streams')>()
  return {
    ...real,
    outcomeStream: (g: Parameters<typeof real.outcomeStream>[0], tag: string, year: number, id?: string | number) => {
      seen.calls.push({ tag, year, id: String(id ?? '') })
      return real.outcomeStream(g, tag, year, id)
    },
  }
})

afterEach(() => {
  vi.doUnmock('../src/game/world/mortality')
  vi.resetModules()
})

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

type Fam = Pick<GameState, 'lifeId' | 'flags'>
const fam = (lifeId = 'life-path-test'): Fam => ({ lifeId, flags: {} })
const NEUTRAL: LifeState = { age: 0, alive: true, died: null, unwell: false }

/** A kin sid of the strict grammar: the place picks one of 8, the ord numbers the base. */
const sidOf = (i: number): string => makeSid({ kind: 'kin', place: `p${i % 8}`, cohort: 1900 + (i % 120), ord: Math.floor(i / 8) % 10000 })
const baseOf = (i: number, born = 1900 + (i % 100), health = 38 + ((i * 7) % 45)): KinBase => ({ sid: sidOf(i), born, health })

/** The illness roll of the plan, drawn directly: the chance is 0.02 + age / 1500, cut to 0..0.12. */
const illAt = (g: Fam, b: KinBase, year: number): boolean => outcomeStream(g, 'life.path', year, `${b.sid}|ill`)() < Math.min(0.12, Math.max(0, 0.02 + (year - b.born) / 1500))

// ---------------------------------------------------------------------------------------------------------------------
// The mortality leaf

/** The table as relationships.ts had it before this task (v5.2.0, the function after petYear's neighbours), copied: the move must not change a number. */
function oldNpcMortality(age: number, health: number): number {
  let base: number
  if (age < 1) base = 0.002
  else if (age < 18) base = 0.0006
  else if (age < 40) base = 0.0012
  else if (age < 50) base = 0.0025
  else if (age < 60) base = 0.006
  else if (age < 65) base = 0.012
  else if (age < 70) base = 0.02
  else if (age < 75) base = 0.032
  else if (age < 80) base = 0.05
  else if (age < 85) base = 0.085
  else if (age < 90) base = 0.14
  else if (age < 95) base = 0.24
  else if (age < 100) base = 0.36
  else base = 0.55
  const mult = health < 20 ? 2.5 : health < 40 ? 1.5 : health > 80 ? 0.7 : 1
  return Math.min(0.95, base * mult)
}

describe('the mortality leaf', () => {
  const AGES = [...Array.from({ length: 98 }, (_, i) => i), 100, 130]
  const HEALTHS = [19, 20, 39, 40, 80, 81]

  it('is the table of relationships.ts, moved unchanged: 600 (age, health) points give the old numbers', () => {
    expect(AGES.length * HEALTHS.length).toBe(600)
    for (const age of AGES) for (const health of HEALTHS) expect(npcMortality(age, health), `age ${age} health ${health}`).toBe(oldNpcMortality(age, health))
  })

  it('stays exported by relationships.ts, as the same function (the one use there is the yearly npcDeaths)', () => {
    expect(fromRelationships).toBe(npcMortality)
    const text = read('src/game/relationships.ts')
    expect(text).toContain("export { npcMortality } from './world/mortality'")
    expect(text).not.toMatch(/function npcMortality\b/)
  })

  it('is a leaf of layer 2 that imports nothing, takes no state and has no long dash', () => {
    const file = 'src/game/world/mortality.ts'
    expect(layerOf(file)).toBe(2)
    const text = read(file)
    expect([...text.matchAll(/^import\s/gm)]).toHaveLength(0)
    expect(text).not.toMatch(/\bg\.(rng|nextId|year)\b/)
    expect(DASH.test(text)).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// healthAt

describe('healthAt', () => {
  it('holds the base health to 45 and loses 0.6 a year after it, never below 0', () => {
    const b: KinBase = { sid: sidOf(1), born: 1950, health: 60 }
    expect(healthAt(b, 0)).toBe(60)
    expect(healthAt(b, 45)).toBe(60)
    expect(healthAt(b, 46)).toBeCloseTo(59.4, 9)
    expect(healthAt(b, 65)).toBeCloseTo(48, 9)
    expect(healthAt(b, 78)).toBeCloseTo(40.2, 9)
    expect(healthAt(b, 79)).toBeCloseTo(39.6, 9)
    expect(healthAt(b, 130)).toBeCloseTo(9, 9)
    expect(healthAt({ ...b, health: 30 }, 130)).toBe(0)
    expect(healthAt({ ...b, health: 82.5 }, 45)).toBe(82.5)
  })

  it('is total: a hostile base or age reads as the neutral 60 and age 0, and the answer stays in 0..100', () => {
    const b: KinBase = { sid: sidOf(1), born: 1950, health: 60 }
    for (const age of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5, 1e9]) {
      const h = healthAt(b, age)
      expect(Number.isFinite(h), String(age)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(100)
    }
    expect(healthAt({ ...b, health: Number.NaN }, 45)).toBe(60)
    expect(healthAt({ ...b, health: 500 }, 45)).toBe(100)
    expect(healthAt({ ...b, health: -3 }, 45)).toBe(0)
    expect(healthAt(null as unknown as KinBase, 45)).toBe(60)
    expect(healthAt(b, Number.NaN)).toBe(60)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// ageTo: the rule as written

/** The rule of the plan, written out a second way: the year of the first death by direct draws, or null when none is within `last`. */
function oracleDeath(g: Fam, b: KinBase, last: number): number | null {
  for (let y = b.born + 1; y <= last && y <= b.born + LIFE_MAX_AGE; y++) {
    const age = y - b.born
    const u = outcomeStream(g, 'life.path', y, b.sid)()
    if (u < Math.min(0.95, npcMortality(age, healthAt(b, age)) * (illAt(g, b, y) ? 2 : 1))) return y
  }
  return null
}

describe('ageTo: the rule', () => {
  it('kills in the first year whose draw is under the hazard, doubled in an ill year, and no other year (300 bases over 130 years)', () => {
    const g = fam()
    let deaths = 0
    for (let i = 0; i < 300; i++) {
      const b = baseOf(i)
      const want = oracleDeath(g, b, b.born + 140)
      const end = ageTo(g, b, b.born + 140)
      expect(end.died, sidOf(i)).toBe(want)
      expect(end.alive, sidOf(i)).toBe(want === null)
      if (want !== null) deaths++
    }
    expect(deaths).toBeGreaterThan(290)
  })

  it('is monotone: alive with no death year before the death year, dead from it on, with the age at death kept', () => {
    const g = fam()
    for (let i = 0; i < 40; i++) {
      const b = baseOf(i)
      const end = ageTo(g, b, b.born + 140)
      expect(end.alive).toBe(false)
      const d = end.died!
      expect(d).toBeGreaterThan(b.born)
      expect(end.age).toBe(d - b.born)
      for (const y of [b.born, b.born + 1, d - 1, d, d + 1, d + 40]) {
        const s = ageTo(g, b, y)
        if (y < d) {
          expect(s.alive, `${sidOf(i)} ${y}`).toBe(true)
          expect(s.died).toBeNull()
          expect(s.age).toBe(Math.max(0, y - b.born))
        } else {
          expect(s, `${sidOf(i)} ${y}`).toEqual({ age: d - b.born, alive: false, died: d, unwell: false })
        }
      }
    }
  })

  it('does not exist before its birth year and has not lived a year at it: age 0, alive, well', () => {
    const b = baseOf(3, 1960, 60)
    expect(ageTo(fam(), b, 1900)).toEqual(NEUTRAL)
    expect(ageTo(fam(), b, 1959)).toEqual(NEUTRAL)
    expect(ageTo(fam(), b, 1960)).toEqual(NEUTRAL)
  })

  it('is unwell in an ill year or when its health is under 40, and a dead record is not unwell', () => {
    const g = fam()
    let ill = 0
    let frail = 0
    for (let i = 0; i < 200; i++) {
      const b = baseOf(i, 1900, 60)
      const d = oracleDeath(g, b, 2100) ?? 2100
      for (const y of [1930, 1960, 1975, 1985]) {
        if (y >= d) continue
        const wasIll = illAt(g, b, y)
        const low = healthAt(b, y - b.born) < 40
        expect(ageTo(g, b, y).unwell, `${sidOf(i)} ${y}`).toBe(wasIll || low)
        if (wasIll) ill++
        if (low) frail++
      }
      expect(ageTo(g, b, d).unwell).toBe(false)
    }
    expect(ill, 'some years are ill').toBeGreaterThan(0)
    expect(frail, 'some years are frail').toBeGreaterThan(0)
  })

  it('a base of health 60 is under 40 from the age of 79 (39.6), so one who is alive at 85 is unwell', () => {
    const g = fam()
    let checked = 0
    for (let i = 0; i < 400 && checked < 30; i++) {
      const b = baseOf(i, 1900, 60)
      const s = ageTo(g, b, 1985)
      if (!s.alive) continue
      expect(s.unwell, sidOf(i)).toBe(true)
      checked++
    }
    expect(checked, 'bases alive at 85 were found').toBeGreaterThan(5)
  })

  it('reads the stored death first: `died` wins over the scan, and a death after the asked year leaves the record alive', () => {
    const g = fam()
    const b = baseOf(5, 1950, 60)
    const own = ageTo(g, b, 2100).died!
    // A stored death that the scan would not find: the record died in 1962 whatever the draws say (own is another year).
    expect(own).not.toBe(1962)
    expect(ageTo(g, b, 2000, { died: 1962 })).toEqual({ age: 12, alive: false, died: 1962, unwell: false })
    expect(ageTo(g, b, 1962, { died: 1962 })).toEqual({ age: 12, alive: false, died: 1962, unwell: false })
    const before = ageTo(g, b, 1961, { died: 1962 })
    expect(before.alive).toBe(true)
    expect(before.died).toBeNull()
    expect(before.age).toBe(11)
    // A stored death year that cannot be one (before the birth, past 130, NaN, a fraction, text) is not read.
    for (const d of [1949, 1950 + LIFE_MAX_AGE + 1, Number.NaN, 1962.5, '1962', null, undefined, Number.POSITIVE_INFINITY]) {
      expect(ageTo(g, b, 2100, { died: d as number }), String(d)).toEqual(ageTo(g, b, 2100))
    }
  })

  it('`since` scans only the years after it: for 200 bases over 60 years the incremental walk equals the full scan, every year', () => {
    const g = fam()
    let compared = 0
    for (let i = 0; i < 200; i++) {
      const b = baseOf(i)
      let kinY: number | undefined
      for (let y = b.born; y <= b.born + 60; y++) {
        const full = ageTo(g, b, y)
        const inc = ageTo(g, b, y, kinY === undefined ? undefined : { since: kinY })
        expect(inc, `${sidOf(i)} ${y}`).toEqual(full)
        compared++
        if (!full.alive) break
        kinY = y
      }
    }
    expect(compared).toBeGreaterThan(8000)
  })

  it('`since` is trusted: no draw at or before it, and one at or past the asked year asks only for that year`s illness', () => {
    const g = fam()
    const b = baseOf(9, 1950, 60)
    seen.calls.length = 0
    ageTo(g, b, 1990, { since: 1980 })
    const years = seen.calls.map((c) => c.year)
    expect(Math.min(...years)).toBe(1981)
    expect(Math.max(...years)).toBe(1990)
    seen.calls.length = 0
    expect(ageTo(g, b, 1990, { since: 1990 }).alive).toBe(true)
    expect(ageTo(g, b, 1985, { since: 1990 }).alive).toBe(true)
    expect(seen.calls.map((c) => [c.year, c.id.endsWith('|ill')])).toEqual([
      [1990, true],
      [1985, true],
    ])
    // a `since` that is not a year is not read
    for (const s of [Number.NaN, '1980', null, 1949, -5, Number.NEGATIVE_INFINITY]) {
      expect(ageTo(g, b, 2000, { since: s as number }), String(s)).toEqual(ageTo(g, b, 2000))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// ageTo: the stream

describe('ageTo: the same family, the same years', () => {
  const bases = Array.from({ length: 120 }, (_, i) => baseOf(i))
  const run = (g: Fam, year = 2100): LifeState[] => bases.map((b) => ageTo(g, b, year))

  it('answers the same twice, after a JSON round trip, on a clone, and for an heir of the family (-g2, -g17)', () => {
    const g = fam('life-path-family')
    const want = run(g)
    expect(run(g)).toEqual(want)
    expect(run(JSON.parse(JSON.stringify(g)) as Fam)).toEqual(want)
    expect(run(structuredClone(g))).toEqual(want)
    expect(run(fam('life-path-family-g2'))).toEqual(want)
    expect(run(fam('life-path-family-g17'))).toEqual(want)
    expect(want.filter((s) => !s.alive).length).toBeGreaterThan(100)
  })

  it('is not blind: another family lives other years', () => {
    const a = run(fam('life-path-family'))
    const b = run(fam('another-family'))
    expect(b.filter((s, i) => s.died !== a[i]!.died).length).toBeGreaterThan(60)
  })

  it('a year asked later never changes an earlier answer', () => {
    const g = fam('life-path-family')
    for (const b of bases.slice(0, 30)) {
      const end = ageTo(g, b, 2100)
      const mid = ageTo(g, b, b.born + 30)
      if (end.died === null || end.died > b.born + 30) expect(mid.alive).toBe(true)
      else expect(mid.died).toBe(end.died)
    }
  })

  it('a Time Machine fork changes the year it lands in and the years after it, and no year that ended before it', () => {
    const plain = fam('life-path-family')
    const F = 1980
    const forked: Fam = { lifeId: 'life-path-family', flags: { timelineForks: [{ year: F, salt: 'ab12' }] } }
    let after = 0
    let alive = 0
    for (let i = 0; i < 200; i++) {
      const b = baseOf(i, 1920 + (i % 40))
      // every asked year before F: the same answer, whatever came after (the scan never reaches F)
      for (const y of [b.born, b.born + 10, F - 1]) expect(ageTo(forked, b, y), `${sidOf(i)} ${y}`).toEqual(ageTo(plain, b, y))
      // a person who lived to F-1 on both sides meets new dice in F and after
      if (ageTo(plain, b, F - 1).alive) {
        alive++
        const p = ageTo(plain, b, 2100)
        const f = ageTo(forked, b, 2100)
        if (p.died !== f.died) after++
        if (f.died !== null) expect(f.died).toBeGreaterThanOrEqual(F)
      } else {
        expect(ageTo(forked, b, 2100).died).toBe(ageTo(plain, b, 2100).died)
      }
    }
    expect(alive).toBeGreaterThan(100)
    expect(after, 'the fork re-rolled the later years of some people').toBeGreaterThan(20)
  })

  it('a fork lands on the year it names: that year re-rolls too, the year before does not', () => {
    const g = fam('life-path-family')
    const F = 1980
    const forked: Fam = { lifeId: g.lifeId, flags: { timelineForks: [{ year: F, salt: 'ab12' }] } }
    const b = baseOf(2, 1940, 60)
    const draw = (x: Fam, y: number): number => outcomeStream(x, 'life.path', y, b.sid)()
    expect(draw(forked, F - 1)).toBe(draw(g, F - 1))
    expect(draw(forked, F)).not.toBe(draw(g, F))
    expect(draw(forked, F + 5)).not.toBe(draw(g, F + 5))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// ageTo: how long people live

describe('ageTo: the lives it gives', () => {
  it('20,000 lives at health 60: median 76 to 80, p90 85 to 92, 0.5% to 1.5% under 18', () => {
    const g = fam('life-path-stats')
    const ages: number[] = []
    for (let i = 0; i < 20000; i++) {
      const b: KinBase = { sid: makeSid({ kind: 'kin', place: `s${i % 2}`, cohort: 1950, ord: Math.floor(i / 2) }), born: 1950, health: 60 }
      const end = ageTo(g, b, 1950 + LIFE_MAX_AGE)
      if (end.alive) throw new Error(`${b.sid} was alive at ${LIFE_MAX_AGE}`)
      ages.push(end.age)
    }
    ages.sort((a, b) => a - b)
    const median = ages[10000]!
    const p90 = ages[18000]!
    const young = ages.filter((a) => a < 18).length / ages.length
    console.log(`R4-L2 20,000 lives at health 60: median ${median}, p90 ${p90}, under 18 ${(young * 100).toFixed(2)}%, longest ${ages[ages.length - 1]}`)
    expect(median).toBeGreaterThanOrEqual(76)
    expect(median).toBeLessThanOrEqual(80)
    expect(p90).toBeGreaterThanOrEqual(85)
    expect(p90).toBeLessThanOrEqual(92)
    expect(young).toBeGreaterThanOrEqual(0.005)
    expect(young).toBeLessThanOrEqual(0.015)
  })

  it('a frailer base never outlives a sturdier one on the same draws, and often dies sooner', () => {
    const g = fam('life-path-stats')
    let frailer = 0
    for (let i = 0; i < 600; i++) {
      const sid = sidOf(i)
      const weak = ageTo(g, { sid, born: 1950, health: 38 }, 2100).age
      const strong = ageTo(g, { sid, born: 1950, health: 82 }, 2100).age
      expect(weak, sid).toBeLessThanOrEqual(strong)
      if (weak < strong) frailer++
    }
    expect(frailer).toBeGreaterThan(300)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// ageTo: bounds, hostile input, purity

describe('ageTo: a total reader', () => {
  const good: KinBase = { sid: sidOf(7), born: 1950, health: 60 }

  it('reads a hostile base as the neutral living state: NaN, a birth outside 1700..2600, health out of range, a sid that is not one', () => {
    const bad: unknown[] = [
      null,
      undefined,
      5,
      'text',
      [],
      {},
      { ...good, sid: '__proto__' },
      { ...good, sid: 'constructor' },
      { ...good, sid: '' },
      { ...good, sid: 'kin.us.1950' },
      { ...good, sid: 'person:kin.us.1950.1' },
      { ...good, sid: 7 },
      { ...good, sid: 's77' },
      { ...good, sid: `kin.${'x'.repeat(40)}.1950.1` },
      { ...good, born: Number.NaN },
      { ...good, born: 1699 },
      { ...good, born: 2601 },
      { ...good, born: 1950.5 },
      { ...good, born: '1950' },
      { ...good, born: Number.POSITIVE_INFINITY },
      { ...good, born: -1e9 },
      { ...good, health: Number.NaN },
      { ...good, health: -1 },
      { ...good, health: 101 },
      { ...good, health: '60' },
      { ...good, health: null },
      { ...good, health: Number.POSITIVE_INFINITY },
      { sid: good.sid, born: 1950 },
    ]
    for (const b of bad) {
      expect(ageTo(fam(), b as KinBase, 2020), JSON.stringify(b)).toEqual(NEUTRAL)
      expect(ageTo(fam(), b as KinBase, 2020, { died: 1960, since: 1955 }), JSON.stringify(b)).toEqual(NEUTRAL)
    }
  })

  it('accepts the edges of the allowed range: born 1700 and 2600, health 0 and 100', () => {
    for (const born of [1700, 2600]) expect(ageTo(fam(), { ...good, born }, born + 20)).not.toEqual(NEUTRAL)
    for (const health of [0, 100]) expect(ageTo(fam(), { ...good, health }, 2020)).not.toEqual(NEUTRAL)
  })

  it('reads a year that is not a finite number as neutral, and floors a fraction', () => {
    for (const y of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '2020', null, undefined, {}]) {
      expect(ageTo(fam(), good, y as number), String(y)).toEqual(NEUTRAL)
    }
    expect(ageTo(fam(), good, 1980.9)).toEqual(ageTo(fam(), good, 1980))
  })

  it('cuts the age at 130: a year of 1e9 costs no more than a year of 130, at most 2 draws a year of life and one more for the illness of the last', () => {
    const g = fam('life-path-cap')
    let worst = 0
    for (let i = 0; i < 5000; i++) {
      const b: KinBase = { sid: sidOf(i), born: 1700 + (i % 900), health: 38 + (i % 45) }
      seen.calls.length = 0
      const s = ageTo(g, b, i % 2 === 0 ? 1e9 : b.born + 200)
      worst = Math.max(worst, seen.calls.length)
      expect(s.age).toBeLessThanOrEqual(LIFE_MAX_AGE)
      for (const c of seen.calls) expect(c.year).toBeLessThanOrEqual(b.born + LIFE_MAX_AGE)
    }
    expect(worst).toBeLessThanOrEqual(2 * LIFE_MAX_AGE + 1)
    expect(worst, 'some life was scanned for most of its years').toBeGreaterThan(100)
  })

  it('never asks for a year past birth + 130, even when nobody dies (mortality 0)', async () => {
    vi.doMock('../src/game/world/mortality', () => ({ npcMortality: () => 0 }))
    vi.resetModules()
    const fresh = await import('../src/game/world/life-path')
    const g = fam('life-path-cap')
    const b: KinBase = { sid: sidOf(11), born: 1800, health: 60 }
    seen.calls.length = 0
    const s = fresh.ageTo(g, b, 1e9)
    expect(s.alive).toBe(true)
    expect(s.died).toBeNull()
    expect(s.age).toBe(LIFE_MAX_AGE)
    expect(Math.max(...seen.calls.map((c) => c.year))).toBe(1800 + LIFE_MAX_AGE)
    expect(Math.min(...seen.calls.map((c) => c.year))).toBe(1801)
    expect(seen.calls.length).toBeLessThanOrEqual(2 * LIFE_MAX_AGE + 1)
    expect(new Set(seen.calls.map((c) => c.tag))).toEqual(new Set(['life.path']))
    // with `since` at the cap, the scan has nothing left to do
    seen.calls.length = 0
    fresh.ageTo(g, b, 1e9, { since: 1800 + LIFE_MAX_AGE })
    expect(seen.calls.length).toBeLessThanOrEqual(1)
  })

  it('on a deep-frozen state with a trapped g.rng it reads, draws nothing from g.rng and writes nothing', () => {
    const g = frozenGame(1)
    const before = JSON.stringify(g)
    const nextId = g.nextId
    const plain = fam(g.lifeId)
    for (let i = 0; i < 60; i++) {
      const b = baseOf(i)
      const opts = i % 3 === 0 ? { since: b.born + 20 } : undefined
      expect(ageTo(g, b, b.born + 70, opts)).toEqual(ageTo(plain, b, b.born + 70, opts))
    }
    expect(JSON.stringify(g)).toBe(before)
    expect(g.nextId).toBe(nextId)
    expect(Object.isFrozen(g)).toBe(true)
  })

  it('returns a new plain object each time, and neither the base nor the options are touched', () => {
    const b = Object.freeze({ ...good })
    const o = Object.freeze({ since: 1960, died: 1999 })
    const a = ageTo(fam(), b, 1990, o)
    const c = ageTo(fam(), b, 1990, o)
    expect(a).not.toBe(c)
    expect(a).toEqual(c)
    expect(Object.keys(a).sort()).toEqual(['age', 'alive', 'died', 'unwell'])
    expect(ageTo(fam(), Object.freeze({ ...good, sid: '__proto__' }), 1990)).not.toBe(ageTo(fam(), Object.freeze({ ...good, sid: '__proto__' }), 1990))
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The golden file

const GOLDEN_FILE = 'test/fixtures/life-path-golden.json'
const RECORD = process.env.RECORD_LIFE_PATH_GOLDEN === '1'
const RECORD_COMMAND = 'RECORD_LIFE_PATH_GOLDEN=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/world-life-path.test.ts'
const GOLDEN_FAMILIES = ['gold-path-a', 'gold-path-b', 'gold-path-c'] as const
const GOLDEN_PLACES = ['us', 'jp', 'br', 'gb'] as const
const GOLDEN_AGES = [18, 45, 70, 90] as const

interface GoldenIn {
  family: string
  base: KinBase
}

/** 3 families x 20 bases = 60 rows: births 1900 to 2014 in steps of 6, health 38 to 82, a sid of the strict grammar each. */
function goldenGrid(): GoldenIn[] {
  const out: GoldenIn[] = []
  GOLDEN_FAMILIES.forEach((family, f) => {
    for (let i = 0; i < 20; i++) {
      const born = 1900 + 6 * i
      out.push({ family, base: { sid: makeSid({ kind: 'kin', place: GOLDEN_PLACES[(i + f) % 4]!, cohort: born, ord: (i * 37 + f * 11) % 10000 }), born, health: 38 + ((i * 7 + f * 5) % 45) } })
    }
  })
  return out
}

type GoldenRow = [family: string, sid: string, born: number, health: number, died: number | null, states: LifeState[]]
interface GoldenFile {
  v: 1
  node: string
  head: string
  rows: GoldenRow[]
}

/** A row: the death year of the base, and its state at 18, 45, 70 and 90 years of age. */
function measureGolden(): GoldenRow[] {
  return goldenGrid().map(({ family, base }) => {
    const g = fam(family)
    return [family, base.sid, base.born, base.health, ageTo(g, base, base.born + LIFE_MAX_AGE).died, GOLDEN_AGES.map((a) => ageTo(g, base, base.born + a))]
  })
}

function recordGolden(): void {
  if (process.env.RECORD_LIFE_PATH_GOLDEN !== '1') throw new Error(`recordGolden writes the golden file only when asked: ${RECORD_COMMAND}`)
  const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  const lines = measureGolden().map((r) => canonicalJson(r))
  const text = `{\n"v": 1,\n"node": ${JSON.stringify(process.version)},\n"head": ${JSON.stringify(head)},\n"rows": [\n${lines.join(',\n')}\n]\n}\n`
  writeFileSync(join(ROOT, GOLDEN_FILE), text)
}

const hasGolden = (): boolean => existsSync(join(ROOT, GOLDEN_FILE))
let golden: GoldenFile | null = null
function readGolden(): GoldenFile {
  if (golden === null) {
    if (!hasGolden()) throw new Error(`${GOLDEN_FILE} is missing: ${RECORD_COMMAND}`)
    golden = JSON.parse(read(GOLDEN_FILE)) as GoldenFile
  }
  return golden
}

describe('the golden file (recorded once, never re-recorded)', () => {
  it.skipIf(RECORD)('refuses to write without RECORD_LIFE_PATH_GOLDEN=1, and says what to run', () => {
    expect(() => recordGolden()).toThrow(/RECORD_LIFE_PATH_GOLDEN=1/)
  })

  it.runIf(RECORD)('records the golden file on this code', () => {
    recordGolden()
    expect(hasGolden()).toBe(true)
  })

  it('has a grid of 60 bases over 3 families, no sid twice in a family, every one a base the reader accepts', () => {
    const grid = goldenGrid()
    expect(grid).toHaveLength(60)
    expect(new Set(grid.map((r) => `${r.family}|${r.base.sid}`)).size).toBe(60)
    for (const { base } of grid) {
      expect(isSid(base.sid), base.sid).toBe(true)
      expect(base.born).toBeGreaterThanOrEqual(1700)
      expect(base.born).toBeLessThanOrEqual(2600)
      expect(base.health).toBeGreaterThanOrEqual(37.5)
      expect(base.health).toBeLessThanOrEqual(82.5)
    }
  })

  it('exists, names the Node and the commit it was recorded on, and keeps one row to a line', () => {
    if (!hasGolden()) expect.fail(`${GOLDEN_FILE} is missing: ${RECORD_COMMAND}`)
    const f = readGolden()
    expect(f.v).toBe(1)
    expect(f.node).toMatch(/^v22\.\d+\.\d+$/)
    expect(f.head).toMatch(/^[0-9a-f]{7,40}$/)
    expect(f.rows).toHaveLength(60)
    expect(read(GOLDEN_FILE).split('\n').filter((l) => l.startsWith('["'))).toHaveLength(60)
  })

  it('asks the same bases and gets the same lives, to the last field (a moved row means the rule moved: never re-record to pass)', () => {
    const rows = readGolden().rows
    const now = measureGolden()
    expect(rows.map((r) => [r[0], r[1], r[2], r[3]])).toEqual(goldenGrid().map((r) => [r.family, r.base.sid, r.base.born, r.base.health]))
    const moved = rows.filter((r, i) => canonicalJson(r) !== canonicalJson(now[i]!)).map((r) => `${r[0]} ${r[1]}`)
    expect(moved, `moved rows: ${moved.join(', ')}`).toEqual([])
  })

  it('is a record of real lives: every base dies within 130 years, and the states agree with the death year', () => {
    for (const r of readGolden().rows) {
      const [, sid, born, , died, states] = r
      expect(died, sid).not.toBeNull()
      expect(died! - born).toBeGreaterThan(0)
      expect(died! - born).toBeLessThanOrEqual(LIFE_MAX_AGE)
      GOLDEN_AGES.forEach((a, i) => {
        const s = states[i]!
        if (died! - born > a) expect(s, `${sid} ${a}`).toMatchObject({ age: a, alive: true, died: null })
        else expect(s, `${sid} ${a}`).toEqual({ age: died! - born, alive: false, died, unwell: false })
      })
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The module and its docs

describe('the module', () => {
  const FILE = 'src/game/world/life-path.ts'

  it('sits in layer 2, imports only the stream, the sid grammar, the table and types, has no long dash and draws from a literal tag', () => {
    expect(layerOf(FILE)).toBe(2)
    const text = read(FILE)
    const targets = [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]!)
    for (const t of targets) expect(['../kernel/streams', '../types', './mortality', './sid'], t).toContain(t)
    expect(targets).toContain('../kernel/streams')
    expect(targets).toContain('./mortality')
    expect(DASH.test(text)).toBe(false)
    expect(text).toContain("outcomeStream(g, 'life.path', ")
  })

  it('draws no g.rng and no clock, and takes no game but the life id and the flags', () => {
    const text = read(FILE)
    expect(text).not.toMatch(/\bg\.(rng|nextId|year)\b/)
    expect(text).not.toMatch(/\b(rand|randInt|chance|pick|shuffle)\(/)
    expect(text).not.toMatch(/Math\.random|Date\.now|new Date/)
    expect(ageTo.length).toBe(4)
  })

  it('has its bullet in STREAMS.md: the tag, the ids, the Time Machine, and the row of the table', () => {
    const text = read('docs/STREAMS.md')
    const lines = text.split('\n')
    const at = lines.findIndex((l) => l.startsWith('- ') && l.includes('life.path'))
    expect(at, 'a bullet that names life.path').toBeGreaterThanOrEqual(0)
    let end = at + 1
    while (end < lines.length && lines[end]!.startsWith('  ')) end++
    const bullet = lines.slice(at, end).join(' ')
    expect(bullet).toContain('outcomeStream')
    expect(bullet).toContain('world/life-path.ts')
    expect(bullet).toContain('|ill')
    expect(bullet).toMatch(/Time Machine/)
    expect(bullet).toMatch(/driven/)
    expect(DASH.test(text)).toBe(false)
  })
})
