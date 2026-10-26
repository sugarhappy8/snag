// ci: fast
// R4-S3 (D.1 b): the latent person (src/game/world/latent.ts). A stranger is a pure function of the family seed and a slot; nothing
// is stored. latent(familySeed, slot, home?) reads numbered facets of one key, streamKey(familySeed, 'soc.latent', 0, sid), with
// streamUnit(key, facet): no g, no g.rng, no generator, no clock. So the same banker is the same person in every year, fork and
// generation, and one extra draw anywhere else in the game cannot rename anyone.
//
// Two tables freeze at the first recording of test/fixtures/latent-golden.json (cross-check 3.3, X57): KIND_AGE (the age band of each
// of the 18 sid kinds, so `born` for every person a seed will ever produce) and FACET (which unit feeds which field). The tests below
// hold their SHAPE; the lead reads their VALUES before the golden file is recorded, and the measured rates are printed (console.log)
// so the reader sees them. After R4 a changed value needs LATENT_V 2, a RECORD_REASON, a moved-tests.md row and the lead's OK.
//
// The golden file is recorded in a later commit, by the lead's go-ahead, under Node 22 (the CI version):
//   RECORD_LATENT_GOLDEN=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/world-latent.test.ts
// The test itself only reads the file, and it is never re-recorded. No pinned seed: families are string constants.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nameFitsYear } from '../src/game/history/events-people'
import { worldSeed } from '../src/game/kernel/streams'
import { STAT_KEYS, type Gender, type StatKey } from '../src/game/types'
import { COUNTRIES, getCountry, namePoolOf } from '../src/game/world'
import { AXIS_IDS } from '../src/game/world/axes'
import { FACET, KIND_AGE, LATENT_V, NAME_ALT_UNIT, STAT_RANGE, fromSeeded, latent, latentUnit, nameDraw, type LatentPerson } from '../src/game/world/latent'
import { SID_KINDS, makeSid, parseSid, type SidKind, type Slot } from '../src/game/world/sid'
import { canonicalJson } from './golden-kit'
import { frozenGame } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { layerOf } from './layer-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/world/latent.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

afterEach(() => {
  vi.doUnmock('../src/game/history/events-people')
  vi.resetModules()
})

// ---------------------------------------------------------------------------------------------------------------------
// The golden file: the grid, the recorder, the reader

const GOLDEN_FILE = 'test/fixtures/latent-golden.json'
const RECORD = process.env.RECORD_LATENT_GOLDEN === '1'
const RECORD_COMMAND = 'RECORD_LATENT_GOLDEN=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/world-latent.test.ts'

/**
 * True from the commit that adds this test until the lead has read KIND_AGE and FACET and the golden file is recorded (cross-check
 * 3.3, X57). While it is true a missing file leaves the reading tests pending and says so; the recording commit sets it to false,
 * and from then on a missing file is a failure that names the command. One line, one commit: nothing else about the test changes.
 */
const AWAITING_LEAD_READ = false

const GOLDEN_FAMILIES = ['gold-family-a', 'gold-family-b', 'gold-family-c'] as const
const GOLDEN_COHORTS = [1850, 1990, 2400] as const
const GOLDEN_PLACES = ['us', 'jp', 'br', 'gb', 'de', 'fr', 'mx', 'in', 'ng', 'au'] as const
const GOLDEN_ORDS = [0, 1, 7, 12, 40, 255, 9999] as const
const FIRM_KINDS: readonly SidKind[] = ['boss', 'dir', 'stf', 'exe']
const SCHOOL_KINDS: readonly SidKind[] = ['cls', 'tch']
const FIRM_HOMES = ['de', 'jp', 'br'] as const

interface GoldenIn {
  family: string
  slot: Slot
  home: string | null
}

/**
 * 18 kinds x 3 families x 3 cohorts = 162 slots. The middle cohort holds the entity-placed ones: a firm id with its country for
 * boss, dir, stf and exe, and a school id (not a country, no home: the person is American) for cls and tch.
 */
function goldenGrid(): GoldenIn[] {
  const out: GoldenIn[] = []
  SID_KINDS.forEach((kind, i) => {
    GOLDEN_FAMILIES.forEach((family, f) => {
      GOLDEN_COHORTS.forEach((cohort, c) => {
        let place: string = GOLDEN_PLACES[(i + 3 * f + c) % GOLDEN_PLACES.length]!
        let home: string | null = null
        if (c === 1 && FIRM_KINDS.includes(kind)) {
          place = `f${100 + i * 7 + f}`
          home = FIRM_HOMES[f]!
        } else if (c === 1 && SCHOOL_KINDS.includes(kind)) place = `sch${40 + f}`
        out.push({ family, slot: { kind, place, cohort, ord: GOLDEN_ORDS[(i * 5 + f * 3 + c) % GOLDEN_ORDS.length]! }, home })
      })
    })
  })
  return out
}

/** The first and last name of alternates 1 to 7 of a person, for the golden row. */
function alternatesOf(family: string, p: LatentPerson): [string, string][] {
  const out: [string, string][] = []
  for (let k = 1; k <= 7; k++) {
    const n = nameDraw(family, p.sid, k, p.gender, p.born, p.country)
    out.push([n.first, n.last])
  }
  return out
}

type GoldenRow = [family: string, sid: string, home: string | null, person: LatentPerson, alts: [string, string][]]
interface GoldenFile {
  v: 1
  latentV: number
  node: string
  head: string
  rows: GoldenRow[]
}

function measureGolden(): GoldenRow[] {
  return goldenGrid().map(({ family, slot, home }) => {
    const person = latent(family, slot, home ?? undefined)
    return [family, person.sid, home, person, alternatesOf(family, person)]
  })
}

/** The recorder. Refuses without RECORD_LATENT_GOLDEN=1; writes one row to a line, and names the Node and the commit it ran on. */
function recordGolden(): void {
  if (process.env.RECORD_LATENT_GOLDEN !== '1') throw new Error(`recordGolden writes the golden file only when asked: ${RECORD_COMMAND}`)
  const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  const lines = measureGolden().map((r) => JSON.stringify([r[0], r[1], r[2], JSON.parse(canonicalJson(r[3])), r[4]]))
  const text = `{\n"v": 1,\n"latentV": ${LATENT_V},\n"node": ${JSON.stringify(process.version)},\n"head": ${JSON.stringify(head)},\n"rows": [\n${lines.join(',\n')}\n]\n}\n`
  writeFileSync(join(ROOT, GOLDEN_FILE), text)
}

let golden: GoldenFile | null = null
const hasGolden = (): boolean => existsSync(join(ROOT, GOLDEN_FILE))
function readGolden(): GoldenFile {
  if (golden === null) {
    if (!hasGolden()) throw new Error(`${GOLDEN_FILE} is missing: ${RECORD_COMMAND}`)
    golden = JSON.parse(read(GOLDEN_FILE)) as GoldenFile
  }
  return golden
}
/** True while the golden reading tests are pending: the lead has not read the tables, so the file is not recorded yet. */
const pendingGolden = (): boolean => AWAITING_LEAD_READ && !hasGolden()

// ---------------------------------------------------------------------------------------------------------------------
// Helpers

const isWhole = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n)
const FAMILY = 'latent-test-family'
const HOMES = COUNTRIES.map((c) => c.id)

/** Pools by country as sets, built once. */
const poolSets = new Map<string, { male: Set<string>; female: Set<string>; last: Set<string> }>()
function poolOf(country: string): { male: Set<string>; female: Set<string>; last: Set<string> } {
  let s = poolSets.get(country)
  if (!s) {
    const p = namePoolOf(country)
    s = { male: new Set(p.male), female: new Set(p.female), last: new Set(p.last) }
    poolSets.set(country, s)
  }
  return s
}

/** A spread of slots: every kind, every country as a place, and cohorts across the whole range. */
function slotAt(i: number): Slot {
  const kind = SID_KINDS[i % SID_KINDS.length]!
  const place = i % 5 === 0 ? `firm${i % 977}` : HOMES[(i * 7) % HOMES.length]!
  return { kind, place, cohort: 1850 + ((i * 37) % 551), ord: (i * 13) % 10000 }
}

/** What a person must be, for any slot: the checks the 40,000 run and the golden rows share. */
function problemsOf(p: LatentPerson, slot: Slot): string[] {
  const out: string[] = []
  const [lo, hi] = KIND_AGE[slot.kind]
  if (p.v !== LATENT_V) out.push('v')
  if (p.sid !== makeSid(slot)) out.push('sid')
  if (p.gender !== 'male' && p.gender !== 'female') out.push('gender')
  if (!isWhole(p.born) || p.born < slot.cohort - hi || p.born > slot.cohort - lo) out.push(`born ${p.born} outside ${slot.cohort}-${hi}..${slot.cohort}-${lo}`)
  const pool = poolOf(p.country)
  if (!HOMES.includes(p.country)) out.push(`country ${p.country}`)
  const firsts = p.gender === 'male' ? pool.male : pool.female
  if (!firsts.has(p.first)) out.push(`first ${p.first} not in the ${p.country} pool`)
  else if (!nameFitsYear(p.first, p.born) && [...firsts].some((n) => nameFitsYear(n, p.born))) out.push(`first ${p.first} does not fit ${p.born}`)
  if (!pool.last.has(p.last)) out.push(`last ${p.last} not in the ${p.country} pool`)
  for (const id of AXIS_IDS) {
    const a = p.axes[id]
    if (!isWhole(a) || a < 5 || a > 95) out.push(`axis ${id} ${a}`)
  }
  for (const k of STAT_KEYS) {
    const s = p.stats[k]
    const [slo, shi] = STAT_RANGE[k]
    if (!isWhole(s) || s < slo || s > shi) out.push(`stat ${k} ${s}`)
  }
  if (!getCountry(p.country).skinTones.includes(p.skin)) out.push(`skin ${p.skin}`)
  if (!isWhole(p.wealth) || p.wealth < 0 || p.wealth > 9) out.push(`wealth ${p.wealth}`)
  if (!isWhole(p.path) || p.path < 0 || p.path >= 2 ** 31) out.push(`path ${p.path}`)
  if (Object.keys(p).length !== 12) out.push(`keys ${Object.keys(p).join(',')}`)
  return out
}

// ---------------------------------------------------------------------------------------------------------------------

describe('the recorder', () => {
  it.skipIf(RECORD)('refuses to write without RECORD_LATENT_GOLDEN=1, and says what to run', () => {
    expect(() => recordGolden()).toThrow(/RECORD_LATENT_GOLDEN=1/)
  })

  it.runIf(RECORD)('records the golden file on this code', { timeout: 600_000 }, () => {
    recordGolden()
    expect(hasGolden()).toBe(true)
  })
})

describe('the facet table (frozen at the first recording)', () => {
  it('pins every number: gender 0, born 1, first 2, last 3, the five axes 4-8, the four stats 9-12, skin 13, wealth 14, path 15', () => {
    expect({ ...FACET }).toEqual({
      gender: 0, born: 1, first: 2, last: 3,
      ambition: 4, honesty: 5, empathy: 6, risk: 7, steadiness: 8,
      happiness: 9, health: 10, smarts: 11, looks: 12,
      skin: 13, wealth: 14, path: 15,
    })
    expect(Object.isFrozen(FACET)).toBe(true)
    console.log(`R4-S3 FACET: ${Object.entries(FACET).map(([k, v]) => `${k} ${v}`).join(', ')}; name alternates from unit ${NAME_ALT_UNIT}`)
  })

  it('follows the axis order of AXIS_IDS and the stat order of STAT_KEYS, with no number twice and none missing', () => {
    AXIS_IDS.forEach((id, i) => expect(FACET[id], id).toBe(4 + i))
    STAT_KEYS.forEach((k, i) => expect(FACET[k], k).toBe(9 + i))
    const nums = Object.values(FACET).sort((a, b) => a - b)
    expect(nums).toEqual(Array.from({ length: 16 }, (_, i) => i))
  })

  it('keeps the alternates of the name draw above the 16 facets: unit 16 and up, two for each of k = 1..7', () => {
    expect(NAME_ALT_UNIT).toBe(16)
    expect(LATENT_V).toBe(1)
  })

  it('is read through streamKey(familySeed, "soc.latent", 0, sid) and streamUnit, and the module names that tag once', () => {
    const text = read(FILE)
    expect(text.match(/'soc\.latent'/g)).toHaveLength(1)
    expect(text).toContain('streamKey(')
    expect(text).toContain('streamUnit(')
    expect(text).not.toMatch(/\bstream\(/)
    expect(latentUnit(FAMILY, 'cls.us.2004.12', 3)).toBe(latentUnit(FAMILY, 'cls.us.2004.12', 3))
    expect(latentUnit(FAMILY, 'cls.us.2004.12', 3)).not.toBe(latentUnit(FAMILY, 'cls.us.2004.12', 4))
    expect(latentUnit(FAMILY, 'cls.us.2004.12', 3)).not.toBe(latentUnit(FAMILY, 'cls.us.2004.13', 3))
    expect(latentUnit('other', 'cls.us.2004.12', 3)).not.toBe(latentUnit(FAMILY, 'cls.us.2004.12', 3))
    const u = latentUnit(FAMILY, 'cls.us.2004.12', 0)
    expect(u).toBeGreaterThanOrEqual(0)
    expect(u).toBeLessThan(1)
  })
})

describe('the age band of each kind (frozen at the first recording)', () => {
  it('has a band for each of the 18 kinds, whole numbers, 0 <= lo <= hi <= 90, the table frozen', () => {
    expect(Object.keys(KIND_AGE)).toEqual([...SID_KINDS])
    for (const kind of SID_KINDS) {
      const [lo, hi] = KIND_AGE[kind]
      expect(isWhole(lo) && isWhole(hi), kind).toBe(true)
      expect(lo, kind).toBeGreaterThanOrEqual(0)
      expect(lo, kind).toBeLessThanOrEqual(hi)
      expect(hi, kind).toBeLessThanOrEqual(90)
      expect(Object.isFrozen(KIND_AGE[kind]), kind).toBe(true)
    }
    expect(Object.isFrozen(KIND_AGE)).toBe(true)
  })

  it('holds the three bands the plan names: cls 5-7, tch 28-60, dir 40-70', () => {
    expect([...KIND_AGE.cls]).toEqual([5, 7])
    expect([...KIND_AGE.tch]).toEqual([28, 60])
    expect([...KIND_AGE.dir]).toEqual([40, 70])
  })

  it('keeps the oldest person of the first cohort above the 1700 floor of a Met record (born is 1700 and up)', () => {
    const oldest = Math.max(...SID_KINDS.map((k) => KIND_AGE[k][1]))
    expect(1850 - oldest).toBeGreaterThanOrEqual(1700)
    console.log(`R4-S3 KIND_AGE: ${SID_KINDS.map((k) => `${k} ${KIND_AGE[k][0]}-${KIND_AGE[k][1]}`).join(', ')}`)
  })

  it('reaches both ends of its band: over 4,000 slots of a kind the youngest is lo and the oldest hi', () => {
    for (const kind of SID_KINDS) {
      const [lo, hi] = KIND_AGE[kind]
      let youngest = 999
      let oldest = -1
      for (let ord = 0; ord < 4000; ord++) {
        const age = 2000 - latent(FAMILY, { kind, place: 'us', cohort: 2000, ord }).born
        youngest = Math.min(youngest, age)
        oldest = Math.max(oldest, age)
      }
      expect([youngest, oldest], kind).toEqual([lo, hi])
    }
  })

  it('the stat ranges are the ones createPerson rolls with (happiness 30-100, health 50-100, smarts and looks 10-100)', () => {
    expect(Object.keys(STAT_RANGE)).toEqual([...STAT_KEYS])
    expect(STAT_RANGE.happiness).toEqual([30, 100])
    expect(STAT_RANGE.health).toEqual([50, 100])
    expect(STAT_RANGE.smarts).toEqual([10, 100])
    expect(STAT_RANGE.looks).toEqual([10, 100])
    expect(Object.isFrozen(STAT_RANGE)).toBe(true)
  })
})

describe('latent: a pure function of the family seed and the slot', () => {
  const slots = Array.from({ length: 300 }, (_, i) => slotAt(i))

  it('is the same twice, and plain JSON that survives a round trip', () => {
    for (const slot of slots) {
      const a = latent(FAMILY, slot)
      const b = latent(FAMILY, slot)
      expect(b).toEqual(a)
      expect(b).not.toBe(a)
      expect(JSON.parse(JSON.stringify(a))).toEqual(a)
      expect(a.sid).toBe(makeSid(slot))
    }
  })

  it('is the same in another call order', () => {
    const forward = slots.map((s) => canonicalJson(latent(FAMILY, s)))
    const backward = [...slots].reverse().map((s) => canonicalJson(latent(FAMILY, s))).reverse()
    expect(backward).toEqual(forward)
    const shuffled = slots.map((_, i) => (i * 97) % slots.length)
    const mixed: string[] = []
    for (const i of shuffled) mixed[i] = canonicalJson(latent(FAMILY, slots[i]!))
    expect(mixed).toEqual(forward)
  })

  it('differs for another family (nearly every person does, and none keeps all of it)', () => {
    let same = 0
    for (const slot of slots) {
      const a = latent('family-one', slot)
      const b = latent('family-two', slot)
      if (canonicalJson(a) === canonicalJson(b)) same++
      expect([a.first, a.last, a.born, ...Object.values(a.axes)].join()).not.toBe([b.first, b.last, b.born, ...Object.values(b.axes)].join())
    }
    expect(same).toBe(0)
  })

  it('is one person for the same slot and a different one for another ord, cohort, place or kind', () => {
    const base = { kind: 'cls', place: 'us', cohort: 2004, ord: 12 } as Slot
    const key = (s: Slot): string => canonicalJson(latent(FAMILY, s))
    const k0 = key(base)
    expect(key({ ...base, ord: 13 })).not.toBe(k0)
    expect(key({ ...base, cohort: 2005 })).not.toBe(k0)
    expect(key({ ...base, place: 'jp' })).not.toBe(k0)
    expect(key({ ...base, kind: 'tch' })).not.toBe(k0)
  })

  it('takes the heir seed of worldSeed, so a family keeps its people across generations', () => {
    const slot = slotAt(11)
    expect(latent(worldSeed({ lifeId: 'abc-g3' }), slot)).toEqual(latent(worldSeed({ lifeId: 'abc' }), slot))
    expect(latent(worldSeed({ lifeId: 'abc' }), slot)).not.toEqual(latent(worldSeed({ lifeId: 'abd' }), slot))
  })

  it('refuses a slot that is not one with a RangeError (code, never saved data), and reads nothing else of it', () => {
    for (const bad of [{ kind: 'out', place: 'us', cohort: 2004, ord: 1 }, { kind: 'cls', place: 'us', cohort: 1800, ord: 1 }, { kind: 'cls', place: 'a.b', cohort: 2004, ord: 1 }, { kind: 'cls', place: 'us', cohort: 2004, ord: -1 }, null, 'cls.us.2004.12']) {
      expect(() => latent(FAMILY, bad as unknown as Slot), JSON.stringify(bad)).toThrow(RangeError)
    }
    expect(latent(FAMILY, { kind: 'cls', place: 'us', cohort: 2004, ord: 12, extra: 1 } as Slot)).toEqual(latent(FAMILY, { kind: 'cls', place: 'us', cohort: 2004, ord: 12 }))
  })

  it('every field is in range for the slot: whole numbers, born in the band, names from the pool, a tone of the country', () => {
    for (const slot of slots) expect(problemsOf(latent(FAMILY, slot), slot), makeSid(slot)).toEqual([])
  })
})

describe('where a person is from', () => {
  const at = (place: string, home?: string): string => latent(FAMILY, { kind: 'cow', place, cohort: 2000, ord: 1 }, home).country

  it('is the country for an entity-placed slot, when one is given (a firm id is the place)', () => {
    expect(at('f102', 'de')).toBe('de')
    expect(at('us', 'jp')).toBe('jp')
  })

  it('is the place when it is a country id, else the United States', () => {
    expect(at('jp')).toBe('jp')
    expect(at('br')).toBe('br')
    expect(at('f102')).toBe('us')
    expect(at('sch42')).toBe('us')
    expect(at('JP')).toBe('us')
    expect(at('toString')).toBe('us')
  })

  it('ignores a home that is not a country id (it is the place that decides then)', () => {
    expect(at('jp', 'nowhere')).toBe('jp')
    expect(at('f102', 'nowhere')).toBe('us')
    expect(at('f102', '__proto__')).toBe('us')
  })

  it('picks the names from the pool of that country', () => {
    const jp = latent(FAMILY, { kind: 'cow', place: 'jp', cohort: 2000, ord: 1 })
    expect(poolOf('jp').last.has(jp.last)).toBe(true)
    const us = latent(FAMILY, { kind: 'cow', place: 'us', cohort: 2000, ord: 1 })
    expect(poolOf('us').last.has(us.last)).toBe(true)
  })
})

describe('gender, names and the other facets', () => {
  it('gender is male when the unit is under 0.5: the rule of createPerson, `chance(g, 0.5) ? male : female`', () => {
    for (let i = 0; i < 400; i++) {
      const slot = slotAt(i)
      const u = latentUnit(FAMILY, makeSid(slot), FACET.gender)
      expect(latent(FAMILY, slot).gender, makeSid(slot)).toBe(u < 0.5 ? 'male' : 'female')
    }
  })

  it('the gender share of 4,000 slots is within 0.45 to 0.55 (tolerance UNVERIFIED, recorded here)', () => {
    let male = 0
    for (let i = 0; i < 4000; i++) if (latent(FAMILY, slotAt(i)).gender === 'male') male++
    console.log(`R4-S3 gender share of 4000 slots: ${(male / 4000).toFixed(4)} male`)
    expect(male / 4000).toBeGreaterThanOrEqual(0.45)
    expect(male / 4000).toBeLessThanOrEqual(0.55)
  })

  it('born is the cohort minus the age: the age is lo plus the unit of the born facet over the band', () => {
    for (let i = 0; i < 400; i++) {
      const slot = slotAt(i)
      const [lo, hi] = KIND_AGE[slot.kind]
      const u = latentUnit(FAMILY, makeSid(slot), FACET.born)
      expect(latent(FAMILY, slot).born, makeSid(slot)).toBe(slot.cohort - (lo + Math.floor(u * (hi - lo + 1))))
    }
  })

  it('the five axes are the five facets, scaled onto 5..95 and whole: they reach both bounds and centre on 50', () => {
    const sums = [0, 0, 0, 0, 0]
    let lowest = 999
    let highest = -1
    const n = 5000
    for (let i = 0; i < n; i++) {
      const a = latent(FAMILY, slotAt(i)).axes
      AXIS_IDS.forEach((id, j) => {
        sums[j]! += a[id]
        lowest = Math.min(lowest, a[id])
        highest = Math.max(highest, a[id])
      })
    }
    expect([lowest, highest]).toEqual([5, 95])
    sums.forEach((s, j) => expect(s / n, AXIS_IDS[j]).toBeGreaterThan(48))
    sums.forEach((s, j) => expect(s / n, AXIS_IDS[j]).toBeLessThan(52))
    console.log(`R4-S3 axis means over ${n}: ${AXIS_IDS.map((id, j) => `${id} ${(sums[j]! / n).toFixed(1)}`).join(', ')}`)
  })

  it('the stats use one draw and a triangular transform: they centre on the middle of the range and pile up less at the ends', () => {
    const n = 5000
    const sums: Record<StatKey, number> = { happiness: 0, health: 0, smarts: 0, looks: 0 }
    const ends: Record<StatKey, number> = { happiness: 0, health: 0, smarts: 0, looks: 0 }
    for (let i = 0; i < n; i++) {
      const s = latent(FAMILY, slotAt(i)).stats
      for (const k of STAT_KEYS) {
        sums[k] += s[k]
        const [lo, hi] = STAT_RANGE[k]
        if (s[k] <= lo + (hi - lo) / 5 || s[k] >= hi - (hi - lo) / 5) ends[k]++
      }
    }
    for (const k of STAT_KEYS) {
      const [lo, hi] = STAT_RANGE[k]
      expect(sums[k] / n, k).toBeGreaterThan((lo + hi) / 2 - 2)
      expect(sums[k] / n, k).toBeLessThan((lo + hi) / 2 + 2)
      // the outer fifths of a range hold 16% of a triangular law (8% a side) and 40% of a flat one
      expect(ends[k] / n, k).toBeLessThan(0.3)
    }
    console.log(`R4-S3 stat means over ${n}: ${STAT_KEYS.map((k) => `${k} ${(sums[k] / n).toFixed(1)}`).join(', ')}`)
  })

  it('skin is a tone of the country list itself (not an index), and follows the repetition of the list', () => {
    const us = getCountry('us').skinTones
    const count: Record<number, number> = {}
    const n = 6000
    for (let i = 0; i < n; i++) {
      const p = latent(FAMILY, { kind: 'cow', place: 'us', cohort: 2000, ord: i % 10000 })
      expect(us).toContain(p.skin)
      count[p.skin] = (count[p.skin] ?? 0) + 1
    }
    const share = (tone: number): number => (count[tone] ?? 0) / n
    const listShare = (tone: number): number => us.filter((t) => t === tone).length / us.length
    for (const tone of new Set(us)) expect(Math.abs(share(tone) - listShare(tone)), `tone ${tone}`).toBeLessThan(0.04)
    // the list holds tones 1 to 5, so an index (0 to 9) would be told apart from a tone by its range
    expect(Math.max(...Object.keys(count).map(Number))).toBeLessThanOrEqual(5)
  })

  it('wealth is a band 0-9 that every band reaches, and path is a 31 bit whole number from the last facet', () => {
    const bands = new Set<number>()
    let maxPath = 0
    for (let i = 0; i < 3000; i++) {
      const p = latent(FAMILY, slotAt(i))
      bands.add(p.wealth)
      maxPath = Math.max(maxPath, p.path)
      expect(p.path).toBe(Math.floor(latentUnit(FAMILY, p.sid, FACET.path) * 2 ** 31))
    }
    expect([...bands].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(maxPath).toBeGreaterThan(2 ** 30)
    expect(maxPath).toBeLessThan(2 ** 31)
  })
})

describe('nameDraw: the first name fits the year, k = 0 is the latent name and k = 1..7 are the alternates', () => {
  const sid = 'cls.us.2004.12'

  it('k = 0 is the name of the latent person', () => {
    for (let i = 0; i < 100; i++) {
      const slot = slotAt(i)
      const p = latent(FAMILY, slot)
      expect(nameDraw(FAMILY, p.sid, 0, p.gender, p.born, p.country)).toEqual({ first: p.first, last: p.last })
    }
  })

  it('gives alternates that are pool names, are the same every time, and are not all one name', () => {
    for (let i = 0; i < 200; i++) {
      const slot = slotAt(i)
      const p = latent(FAMILY, slot)
      const names = new Set<string>()
      for (let k = 0; k <= 7; k++) {
        const n = nameDraw(FAMILY, p.sid, k, p.gender, p.born, p.country)
        expect(nameDraw(FAMILY, p.sid, k, p.gender, p.born, p.country)).toEqual(n)
        const pool = poolOf(p.country)
        expect((p.gender === 'male' ? pool.male : pool.female).has(n.first)).toBe(true)
        expect(pool.last.has(n.last)).toBe(true)
        names.add(`${n.first} ${n.last}`)
      }
      expect(names.size, p.sid).toBeGreaterThanOrEqual(4)
    }
  })

  it('refuses a k outside 0..7 (S6 owns the hyphenated k = 8) with a RangeError', () => {
    for (const k of [-1, 8, 9, 1.5, NaN, Infinity]) expect(() => nameDraw(FAMILY, sid, k, 'male', 1990, 'us'), String(k)).toThrow(RangeError)
  })

  it('draws only first names that fit the birth year: nobody born in 1800 is a Madison', () => {
    for (let ord = 0; ord < 600; ord++) {
      const d = nameDraw(FAMILY, `cls.us.1850.${ord}`, 0, 'female', 1800, 'us')
      expect(nameFitsYear(d.first, 1800), d.first).toBe(true)
    }
  })

  it('takes the whole pool when no first name fits the year, as rivals.ts does', async () => {
    vi.resetModules()
    vi.doMock('../src/game/history/events-people', async (importOriginal) => ({ ...(await importOriginal<object>()), nameFitsYear: () => false }))
    const mod = await import('../src/game/world/latent')
    const pool = namePoolOf('us')
    const seen = new Set<string>()
    for (let ord = 0; ord < 400; ord++) {
      const d = mod.nameDraw(FAMILY, `cls.us.1850.${ord}`, 0, 'male', 1800, 'us')
      expect(pool.male).toContain(d.first)
      seen.add(d.first)
    }
    expect(seen.size).toBeGreaterThan(pool.male.length / 2)
  })

  it('reads a country it does not know as the default pool, and never throws', () => {
    for (const country of ['zz', '', '__proto__', 'toString']) expect(() => nameDraw(FAMILY, sid, 0, 'female', 1990, country), country).not.toThrow()
    expect(poolOf('us').female.has(nameDraw(FAMILY, sid, 0, 'female', 1990, 'zz').first)).toBe(true)
  })
})

describe('fromSeeded: a name the caller already has is kept', () => {
  const given = { sid: 'actor.us.1985.0', first: 'Zed', last: 'Quux', gender: 'male' as Gender, born: 1962, country: 'us' }

  it('keeps first, last, gender, born and country as given, and fills the rest from the facets of the sid', () => {
    const p = fromSeeded(given, FAMILY)
    expect([p.first, p.last, p.gender, p.born, p.country, p.sid, p.v]).toEqual(['Zed', 'Quux', 'male', 1962, 'us', 'actor.us.1985.0', LATENT_V])
    expect(Object.keys(p)).toEqual(Object.keys(latent(FAMILY, parseSid(given.sid)!)))
    expect(fromSeeded(given, FAMILY)).toEqual(p)
    expect(fromSeeded(given, 'other')).not.toEqual(p)
  })

  it('is the latent person itself when the given fields are the latent ones', () => {
    for (let i = 0; i < 200; i++) {
      const slot = slotAt(i)
      const p = latent(FAMILY, slot)
      expect(fromSeeded({ sid: p.sid, first: p.first, last: p.last, gender: p.gender, born: p.born, country: p.country }, FAMILY)).toEqual(p)
    }
  })

  it('does not depend on the name or the born year for axes, stats, wealth and path, and takes skin from the country given', () => {
    const a = fromSeeded(given, FAMILY)
    const b = fromSeeded({ ...given, first: 'Other', last: 'Name', born: 1900, gender: 'female' }, FAMILY)
    expect([b.axes, b.stats, b.wealth, b.path]).toEqual([a.axes, a.stats, a.wealth, a.path])
    const jp = fromSeeded({ ...given, country: 'jp' }, FAMILY)
    expect(getCountry('jp').skinTones).toContain(jp.skin)
  })

  it('serves the rivals of rosterAt: the ids are sids and the name stays the roster name', () => {
    for (const [first, last, born, country] of [['Sophia', 'King', 1931, 'us'], ['Ricardo', 'Sánchez', 1949, 'pe'], ['Shawn', 'Loh', 1972, 'sg']] as const) {
      const p = fromSeeded({ sid: 'actor.us.1970.0', first, last, gender: 'female', born, country }, FAMILY)
      expect([p.first, p.last, p.born, p.country]).toEqual([first, last, born, country])
      expect(getCountry(country).skinTones).toContain(p.skin)
    }
  })
})

describe('a read draws nothing and writes nothing', () => {
  it('runs on a deep-frozen game with a trapped g.rng and leaves it as it was', () => {
    const g = frozenGame(7)
    const before = JSON.stringify(g)
    const slot = deepFreeze({ kind: 'cls', place: 'us', cohort: 2004, ord: 12 } as Slot)
    const seed = worldSeed(g)
    const p = latent(seed, slot)
    const q = fromSeeded({ sid: p.sid, first: p.first, last: p.last, gender: p.gender, born: p.born, country: p.country }, seed)
    nameDraw(seed, p.sid, 3, p.gender, p.born, p.country)
    expect(q).toEqual(p)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('hands back a fresh object each time: a caller that edits it cannot change the next call', () => {
    const slot = { kind: 'cls', place: 'us', cohort: 2004, ord: 12 } as Slot
    const a = latent(FAMILY, slot)
    a.first = 'Edited'
    a.axes.risk = 0
    a.stats.health = 0
    expect(latent(FAMILY, slot).first).not.toBe('Edited')
    expect(latent(FAMILY, slot).axes.risk).not.toBe(0)
    expect(latent(FAMILY, slot).stats.health).not.toBe(0)
  })
})

describe('100 times the cap: 40,000 slots', () => {
  it('give finite whole numbers, a birth year inside the kind band, names from the pool, no throw, in a bounded time', () => {
    const start = performance.now()
    const bad: string[] = []
    for (let i = 0; i < 40_000; i++) {
      const slot = slotAt(i)
      const p = latent('cap-family', slot)
      const found = problemsOf(p, slot)
      if (found.length > 0 && bad.length < 8) bad.push(`${p.sid}: ${found.join('; ')}`)
    }
    const ms = performance.now() - start
    console.log(`R4-S3 40,000 slots in ${Math.round(ms)} ms`)
    expect(bad).toEqual([])
    // a loose bound: the run takes a second or two; a quadratic mistake would take minutes
    expect(ms).toBeLessThan(30_000)
  })
})

describe('the golden file (pending until the lead has read KIND_AGE and FACET)', () => {
  it('has a grid of 162 slots over 18 kinds, 3 families and 3 cohorts, no sid twice, every one valid', () => {
    const grid = goldenGrid()
    expect(grid).toHaveLength(162)
    expect(new Set(grid.map((r) => `${r.family}|${makeSid(r.slot)}`)).size).toBe(162)
    expect(new Set(grid.map((r) => r.slot.kind)).size).toBe(18)
    expect(new Set(grid.map((r) => r.family)).size).toBe(3)
    expect(new Set(grid.map((r) => r.slot.cohort)).size).toBe(3)
    for (const r of grid) {
      expect(parseSid(makeSid(r.slot))).toEqual(r.slot)
      if (r.home !== null) expect(HOMES).toContain(r.home)
    }
    for (const place of GOLDEN_PLACES) expect(HOMES).toContain(place)
  })

  it('keeps every grid person inside the shape checks, so a recording can not freeze a broken person', () => {
    for (const r of goldenGrid()) expect(problemsOf(latent(r.family, r.slot, r.home ?? undefined), r.slot), makeSid(r.slot)).toEqual([])
  })

  it.skipIf(pendingGolden())('exists, and a missing file names the command that records it', () => {
    if (!hasGolden()) expect.fail(`${GOLDEN_FILE} is missing: ${RECORD_COMMAND}`)
  })

  it.skipIf(pendingGolden())('names the Node and the commit it was recorded on, and the version of the facets', () => {
    const f = readGolden()
    expect(f.v).toBe(1)
    expect(f.latentV).toBe(LATENT_V)
    expect(f.node).toMatch(/^v22\.\d+\.\d+$/)
    expect(f.head).toMatch(/^[0-9a-f]{7,40}$/)
  })

  it.skipIf(pendingGolden())('keeps one row to a line, 162 rows, so a diff names the row that moved', () => {
    const lines = read(GOLDEN_FILE).split('\n').filter((l) => l.startsWith('["'))
    expect(lines).toHaveLength(162)
    expect(readGolden().rows).toHaveLength(162)
  })

  it.skipIf(pendingGolden())('asks the same slots as the grid and gets the same people, to the last field and the last alternate', () => {
    const rows = readGolden().rows
    const now = measureGolden()
    const grid = goldenGrid()
    expect(rows.map((r) => [r[0], r[1], r[2]])).toEqual(grid.map((r) => [r.family, makeSid(r.slot), r.home]))
    const moved: string[] = []
    rows.forEach((r, i) => {
      if (canonicalJson(r[3]) !== canonicalJson(now[i]![3])) moved.push(`${r[0]} ${r[1]}`)
      else if (canonicalJson(r[4]) !== canonicalJson(now[i]![4])) moved.push(`${r[0]} ${r[1]} (alternates)`)
    })
    expect(moved, `moved rows (never re-record to pass: a deliberate move takes LATENT_V 2, a RECORD_REASON and a moved-tests.md row): ${moved.join(', ')}`).toEqual([])
  })

  it.skipIf(pendingGolden())('is read, never re-recorded: the recorded persons are inside their kind band', () => {
    for (const r of readGolden().rows) {
      const slot = parseSid(r[1])!
      const [lo, hi] = KIND_AGE[slot.kind]
      expect(r[3].born, r[1]).toBeGreaterThanOrEqual(slot.cohort - hi)
      expect(r[3].born, r[1]).toBeLessThanOrEqual(slot.cohort - lo)
    }
  })

  it('fails, not skips, once the recording is in: AWAITING_LEAD_READ is off and the file must exist', () => {
    if (!AWAITING_LEAD_READ) expect(hasGolden(), `${GOLDEN_FILE} is missing: ${RECORD_COMMAND}`).toBe(true)
    else console.log(`R4-S3: ${GOLDEN_FILE} is pending the lead's read of KIND_AGE and FACET; ${hasGolden() ? 'it is recorded, so flip AWAITING_LEAD_READ to false' : 'record it with ' + RECORD_COMMAND}`)
  })
})

describe('the module', () => {
  it('sits in layer 2, imports only the stream keys, the name data, the world pools and its own folder, and has no long dash', () => {
    expect(layerOf(FILE)).toBe(2)
    const text = read(FILE)
    const targets = [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]!)
    for (const t of targets) expect(['../kernel/streams', '../history/events-people', '../types', '../world', './axes', './sid'], t).toContain(t)
    expect(targets).toContain('../kernel/streams')
    expect(DASH.test(text)).toBe(false)
  })

  it('takes no game state: no `g` parameter, no draw, no clock', () => {
    const text = read(FILE)
    expect(text).not.toMatch(/\bg\.(rng|nextId|year)\b/)
    expect(text).not.toMatch(/GameState/)
    expect(latent.length).toBe(3)
    expect(fromSeeded.length).toBe(2)
  })
})

describe('docs/STREAMS.md and docs/PEOPLE.md', () => {
  it('STREAMS.md has the bullet: latent reads streamKey(familySeed, soc.latent, 0, sid) with streamUnit(key, facet), no generator, no table row', () => {
    const text = read('docs/STREAMS.md')
    const lines = text.split('\n')
    const at = lines.findIndex((l) => l.startsWith('- ') && l.includes('soc.latent'))
    expect(at, 'a bullet that names soc.latent').toBeGreaterThanOrEqual(0)
    let end = at + 1
    while (end < lines.length && lines[end]!.startsWith('  ')) end++
    const bullet = lines.slice(at, end).join(' ')
    expect(bullet).toContain('streamKey(familySeed')
    expect(bullet).toContain('streamUnit(key, facet)')
    expect(bullet).toMatch(/no generator/)
    expect(bullet).toMatch(/no row in `test\/stream-tap\.ts`/)
    expect(DASH.test(text)).toBe(false)
  })

  it('PEOPLE.md prints the facets and the caps, and says the golden file is never re-recorded', () => {
    const text = read('docs/PEOPLE.md')
    for (const word of ['LATENT_V', 'KIND_AGE', 'FACET', 'path', 'reserved', 'latent-golden.json', 'RECORD_REASON', 'never re-recorded']) expect(text, word).toContain(word)
    for (const k of SID_KINDS) expect(text).toContain(`\`${k}\``)
  })
})
