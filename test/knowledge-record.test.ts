// R3-H3 (H.1): the flags.know record. What the player researched is kept, owner-stamped, bounded and validated, and know() uses it.
//
//   shape    flags.know = { v: 1, o, k: { <key>: 'mid|sdPermille|year|src[+src]' }, d?, h?, sy? }; a row is one strictly parsed string
//   read     hostile input reads as null or a trimmed record and never throws; a row older than 12 years, stamped after g.year, or
//            from a record of another owner reads as absent (no foresight, no heir inheriting a parent's files)
//   write    learn merges inverse variance with the aged row and refuses a (source, year) that is already in the row, so a repeat
//            buy never averages; at most 120 rows, the stalest out first (ties by key); widen and forget never create a record
//   use      know() shows the stored row when its aged sd beats the passive read, and the band still holds the truth 80% of the time
//   reach    an heir starts clean (flags.know is personal); a Time Machine snapshot and an old save keep or lack it as they were;
//            a default life never creates it
//
// The suite runs in Exact (test/setup-exact.ts). Every Realistic case goes through inFog (test/knowledge-kit.ts).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { countNodes } from '../scripts/r1-parity-lib.mjs'
import { ageUp } from '../src/game/aging'
import { killCharacter } from '../src/game/death'
import {
  KNOW_FLAG,
  KNOW_LIMITS,
  forget,
  know,
  learn,
  readKnow,
  storedEstimates,
  widen,
  type StoredRow,
} from '../src/game/knowledge/contract'
import { zOf } from '../src/game/knowledge/normal'
import { continueAsChild, createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, Json } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'
import { deepFreeze, fogGame, inFog } from './knowledge-kit'
import { makeTestGame } from './helpers'
import { memoryLocalStorage } from './save-kit'
import { ROOT } from './scan-kit'

const KEY = 'mkt:cafe:us:size'
const OTHER = 'riv:r1:quality'
const SEED = 3

/** The raw record, as a hostile or honest save would hold it. */
const raw = (g: GameState): Record<string, unknown> => g.flags[KNOW_FLAG] as unknown as Record<string, unknown>
const rows = (g: GameState): Record<string, string> => raw(g).k as Record<string, string>

/** A game with an honest record holding `n` rows of year `year` (keys mkt:c000:size, mkt:c001:size, ...). */
function filled(n: number, year = 2026): GameState {
  const g = makeTestGame(1)
  g.year = year
  for (let i = 0; i < n; i++) expect(learn(g, `mkt:c${String(i).padStart(3, '0')}:size`, { mid: 1e6, sd: 0.2, src: 'press' })).not.toBeNull()
  return g
}

/** Same game, another year (the rows and the record stay). */
const inYear = (g: GameState, year: number): GameState => {
  g.year = year
  return g
}

describe('a default life has no record', () => {
  it('reads null, lists nothing, and widen, forget and know create nothing', () => {
    const g = makeTestGame(1)
    expect(readKnow(g)).toBeNull()
    expect(storedEstimates(g)).toEqual([])
    widen(g, 'mkt:')
    forget(g, KEY)
    inFog(() => know(g, KEY, 9e6))
    expect(KNOW_FLAG in g.flags).toBe(false)
    expect('know' in g.flags).toBe(false)
  })

  it('names its flag and its limits', () => {
    expect(KNOW_FLAG).toBe('know')
    expect(KNOW_LIMITS).toEqual({ keys: 120, years: 12, heat: 20 })
    expect(classifyFlag(KNOW_FLAG)).toBe('personal')
  })
})

describe('the row grammar is strict', () => {
  function readRow(text: unknown, key = KEY): StoredRow | undefined {
    const g = makeTestGame(1)
    learn(g, OTHER, { mid: 50, sd: 0.3, src: 'press' })
    rows(g)[key] = text as string
    return readKnow(g)?.k[key]
  }

  it('reads a good row, a row with several sources, a share and the ceiling', () => {
    expect(readRow('5000000|250|2026|press')).toEqual({ mid: 5_000_000, sd: 0.25, y: 2026, src: 'press' })
    expect(readRow('5000000|120|2025|press+report')).toEqual({ mid: 5_000_000, sd: 0.12, y: 2025, src: 'press+report' })
    expect(readRow('0.0125|150|2026|press', 'mkt:cafe:us:share')).toEqual({ mid: 0.0125, sd: 0.15, y: 2026, src: 'press' })
    expect(readRow('1000000000000000000|30|2026|analyst')).toEqual({ mid: 1e18, sd: 0.03, y: 2026, src: 'analyst' })
  })

  const BAD: Array<[string, unknown]> = [
    ['a number for the row', 5_000_000],
    ['an object', { mid: 1 }],
    ['an empty string', ''],
    ['a word for the mid', 'x|250|2026|press'],
    ['NaN', 'NaN|250|2026|press'],
    ['Infinity', 'Infinity|250|2026|press'],
    ['an overflow', '1e999|250|2026|press'],
    ['a mid above the ceiling', '10000000000000000000|250|2026|press'],
    ['an exponent mid', '1.5e+7|250|2026|press'],
    ['a negative money mid', '-5000000|250|2026|press'],
    ['a zero money mid', '0|250|2026|press'],
    ['a leading zero', '05000000|250|2026|press'],
    ['a plus sign', '+5000000|250|2026|press'],
    ['spaces', ' 5000000|250|2026|press'],
    ['an sd under the 3% floor', '5000000|25|2026|press'],
    ['an sd above 1', '5000000|1001|2026|press'],
    ['a fractional sd', '5000000|250.5|2026|press'],
    ['an exponent sd', '5000000|2e2|2026|press'],
    ['a negative sd', '5000000|-250|2026|press'],
    ['a five digit year', '5000000|250|20260|press'],
    ['a fractional year', '5000000|250|2026.5|press'],
    ['three fields', '5000000|250|2026'],
    ['five fields', '5000000|250|2026|press|extra'],
    ['an empty source', '5000000|250|2026|'],
    ['an upper case source', '5000000|250|2026|Press'],
    ['a source that starts with a digit', '5000000|250|2026|1press'],
    ['a repeated source', '5000000|250|2026|press+press'],
    ['an empty source in the list', '5000000|250|2026|press+'],
    ['13 sources', `5000000|250|2026|${Array.from({ length: 13 }, (_, i) => `s${String.fromCharCode(97 + i)}`).join('+')}`],
    ['a 1 MB row', 'x'.repeat(1 << 20)],
  ]
  for (const [name, text] of BAD) {
    it(`a row with ${name} reads as absent`, () => {
      expect(readRow(text)).toBeUndefined()
    })
  }

  it('a score row must lie in 0..100 and an odds row in 0..1', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5e6, sd: 0.2, src: 'press' })
    rows(g)['riv:r1:quality'] = '101|200|2026|press'
    rows(g)['odds:x:rd:p'] = '1.5|200|2026|report'
    rows(g)['riv:r2:quality'] = '100|200|2026|press'
    rows(g)['odds:y:rd:p'] = '0.65|200|2026|report'
    expect(Object.keys(readKnow(g)!.k).sort()).toEqual([KEY, 'odds:y:rd:p', 'riv:r2:quality'].sort())
  })

  it('a key that is not a key, an own: key, a key with no rule row and a key over 64 characters read as absent', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5e6, sd: 0.2, src: 'press' })
    const row = '5000000|200|2026|press'
    for (const bad of ['plain', 'own:me:cash', 'zzz:a:b', `mkt:${'a'.repeat(60)}:size`, 'mkt:a b:size', 'MKT:a:size']) rows(g)[bad] = row
    expect(Object.keys(readKnow(g)!.k)).toEqual([KEY])
  })
})

describe('hostile input reads as null or a trimmed record and never throws', () => {
  const owned = (g: GameState): string => {
    learn(g, OTHER, { mid: 50, sd: 0.3, src: 'press' })
    const o = raw(g).o as string
    delete g.flags[KNOW_FLAG]
    return o
  }
  const ROW = '5000000|250|2026|press'

  const CASES: Array<[string, (o: string) => unknown, 'null' | 'record']> = [
    ['a number', () => 7, 'null'],
    ['a string', () => 'know', 'null'],
    ['a boolean', () => true, 'null'],
    ['an array', () => [1, 2, 3], 'null'],
    ['no owner', () => ({ v: 1, k: { [KEY]: ROW } }), 'null'],
    ['the owner of another life', () => ({ v: 1, o: 'v2:9:someone', k: { [KEY]: ROW } }), 'null'],
    ['an owner that is a number', () => ({ v: 1, o: 5, k: { [KEY]: ROW } }), 'null'],
    ['a record of another version', (o) => ({ v: 2, o, k: { [KEY]: ROW } }), 'null'],
    ['no version', (o) => ({ o, k: { [KEY]: ROW } }), 'null'],
    ['rows as an array', (o) => ({ v: 1, o, k: [ROW] }), 'null'],
    ['rows as a string', (o) => ({ v: 1, o, k: ROW }), 'null'],
    ['no rows', (o) => ({ v: 1, o }), 'null'],
    ['500 rows', (o) => ({ v: 1, o, k: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`mkt:c${i}:size`, `${1e6 + i}|200|${2026 - (i % 5)}|press`])) }), 'record'],
    ['a __proto__ row', (o) => JSON.parse(`{"v":1,"o":"${o}","k":{"__proto__":"${ROW}","${KEY}":"${ROW}"}}`), 'record'],
    ['NaN fields', (o) => ({ v: 1, o, k: { [KEY]: 'NaN|NaN|NaN|NaN', [OTHER]: '50|300|2026|press' }, d: Number.NaN, h: Number.NaN, sy: Number.NaN }), 'record'],
    ['a 1 MB string row', (o) => ({ v: 1, o, k: { [KEY]: 'x'.repeat(1 << 20), [OTHER]: '50|300|2026|press' } }), 'record'],
    ['a 1 MB owner', () => ({ v: 1, o: 'x'.repeat(1 << 20), k: { [KEY]: ROW } }), 'null'],
    ['5,000 rows', (o) => ({ v: 1, o, k: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`mkt:c${i}:size`, ROW])) }), 'null'],
    ['rows from three years ahead', (o) => ({ v: 1, o, k: { [KEY]: '5000000|250|2029|press', [OTHER]: '50|300|2026|press' } }), 'record'],
    ['rows 40 years old', (o) => ({ v: 1, o, k: { [KEY]: '5000000|250|1986|press', [OTHER]: '50|300|2026|press' } }), 'record'],
    ['rows that are objects', (o) => ({ v: 1, o, k: { [KEY]: { mid: 1 }, [OTHER]: '50|300|2026|press' } }), 'record'],
  ]

  for (const [name, make, kind] of CASES) {
    it(name, () => {
      const g = makeTestGame(1)
      g.flags[KNOW_FLAG] = make(owned(makeTestGame(1))) as Json
      const polluted = (): unknown => (({}) as Record<string, unknown>).polluted
      let rec: ReturnType<typeof readKnow> = null
      expect(() => (rec = readKnow(g))).not.toThrow()
      if (kind === 'null') expect(rec).toBeNull()
      else {
        expect(rec).not.toBeNull()
        expect(Object.keys(rec!.k).length).toBeLessThanOrEqual(KNOW_LIMITS.keys)
      }
      expect(() => storedEstimates(g)).not.toThrow()
      expect(() => inFog(() => know(g, KEY, 9e6))).not.toThrow()
      const e = inFog(() => know(g, KEY, 9e6))
      expect([e.mid, e.lo, e.hi, e.sd].every(Number.isFinite)).toBe(true)
      expect(() => widen(g, 'mkt:')).not.toThrow()
      expect(() => forget(g, KEY)).not.toThrow()
      expect(() => learn(g, KEY, { mid: 6e6, sd: 0.2, src: 'report' })).not.toThrow()
      // After a write the record is honest again: the right owner, no row over the cap, only readable rows.
      const after = readKnow(g)
      expect(after).not.toBeNull()
      expect(Object.keys(after!.k).length).toBeLessThanOrEqual(KNOW_LIMITS.keys)
      expect(after!.k[KEY]?.src).toContain('report')
      expect(polluted()).toBeUndefined()
      expect(Object.keys(rows(g)).length).toBeLessThanOrEqual(KNOW_LIMITS.keys)
    })
  }

  it('a record of the wrong owner is replaced by learn, never merged', () => {
    const g = makeTestGame(1)
    g.flags[KNOW_FLAG] = { v: 1, o: 'v2:9:someone', k: { [OTHER]: '50|100|2026|press' } }
    learn(g, KEY, { mid: 5e6, sd: 0.2, src: 'press' })
    expect(Object.keys(rows(g))).toEqual([KEY])
    expect(raw(g).o).toBe(`v2:${g.generation}:${g.character.id}`)
  })

  it('500 rows read as the 120 freshest, ties by key, and know sees the same 120', () => {
    const g = makeTestGame(1)
    const o = owned(makeTestGame(1))
    const k: Record<string, string> = {}
    // 300 rows of 2026 (c000 to c299), 200 rows of 2025 (d000 to d199).
    for (let i = 0; i < 300; i++) k[`mkt:c${String(i).padStart(3, '0')}:size`] = '1000000|200|2026|press'
    for (let i = 0; i < 200; i++) k[`mkt:d${String(i).padStart(3, '0')}:size`] = '1000000|200|2025|press'
    g.flags[KNOW_FLAG] = { v: 1, o, k }
    const kept = Object.keys(readKnow(g)!.k)
    expect(kept.length).toBe(120)
    // The freshest rows are the 2026 rows; of those the stalest-first-out rule with ties by key keeps the highest keys.
    expect(kept.every((key) => key.startsWith('mkt:c'))).toBe(true)
    expect(kept.sort()[0]).toBe('mkt:c180:size')
    expect(inFog(() => know(g, 'mkt:c299:size', 4e6)).src).toBe('press')
    expect(inFog(() => know(g, 'mkt:c000:size', 4e6)).src).toBe('passive')
    expect(inFog(() => know(g, 'mkt:d000:size', 4e6)).src).toBe('passive')
  })

  it('d, h and sy are checked: a good value stays, a bad one is dropped or clamped', () => {
    const g = makeTestGame(1)
    const o = owned(makeTestGame(1))
    const good = { v: 1, o, k: {}, d: 2, h: 7, sy: 2026 }
    g.flags[KNOW_FLAG] = good
    expect(readKnow(g)).toMatchObject({ d: 2, h: 7, sy: 2026 })
    const bad: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [{ d: 9 }, { d: undefined }],
      [{ d: 1.5 }, { d: undefined }],
      [{ d: -1 }, { d: undefined }],
      [{ d: '2' }, { d: undefined }],
      [{ h: 99 }, { h: 20 }],
      [{ h: -4 }, { h: 0 }],
      [{ h: 3.6 }, { h: 4 }],
      [{ h: '5' }, { h: undefined }],
      [{ h: Number.POSITIVE_INFINITY }, { h: undefined }],
      [{ sy: 2027 }, { sy: undefined }],
      [{ sy: 2025.5 }, { sy: undefined }],
      [{ sy: 'now' }, { sy: undefined }],
    ]
    for (const [input, want] of bad) {
      g.flags[KNOW_FLAG] = { v: 1, o, k: {}, ...input } as Json
      const r = readKnow(g)!
      for (const [field, value] of Object.entries(want)) expect(r[field as 'd'], JSON.stringify(input)).toBe(value)
    }
  })
})

describe('years: a row older than 12 years, or from after g.year, reads as absent', () => {
  it('age 12 still reads, 13 does not, and a row stamped next year does not', () => {
    const g = filled(0)
    g.year = 2014
    learn(g, KEY, { mid: 5e6, sd: 0.2, src: 'press' })
    expect(readKnow(inYear(g, 2026))?.k[KEY]?.y).toBe(2014)
    expect(readKnow(inYear(g, 2027))).not.toBeNull()
    expect(readKnow(inYear(g, 2027))?.k[KEY]).toBeUndefined()
    // A jump back in time: the row is from the future.
    expect(readKnow(inYear(g, 2013))?.k[KEY]).toBeUndefined()
    expect(inFog(() => know(inYear(g, 2013), KEY, 5e6)).src).toBe('passive')
  })

  it('learn prunes the rows that cannot be read, and keeps the ones that can', () => {
    const g = filled(0)
    const o = (learn(g, OTHER, { mid: 50, sd: 0.3, src: 'press' }), raw(g).o)
    delete rows(g)[OTHER]
    Object.assign(rows(g), {
      'mkt:old1:size': '1000000|200|2012|press',
      'mkt:old2:size': '1000000|200|2013|press',
      'mkt:fut1:size': '1000000|200|2027|press',
      'mkt:edge:size': '1000000|200|2014|press',
      'mkt:fine:size': '1000000|200|2025|press',
    })
    expect(raw(g).o).toBe(o)
    learn(g, KEY, { mid: 5e6, sd: 0.2, src: 'press' })
    expect(Object.keys(rows(g)).sort()).toEqual([KEY, 'mkt:edge:size', 'mkt:fine:size'].sort())
  })
})

describe('learn', () => {
  it('writes one string row and returns the row as stored (mid to 9 digits, sd up to the next permille)', () => {
    const g = makeTestGame(1)
    const r = learn(g, KEY, { mid: 1234567.891234567, sd: 0.1234, src: 'report' })
    expect(r).toEqual({ mid: 1234567.89, sd: 0.124, y: 2026, src: 'report' })
    expect(rows(g)[KEY]).toBe('1234567.89|124|2026|report')
    expect(raw(g)).toEqual({ v: 1, o: `v2:${g.generation}:${g.character.id}`, k: { [KEY]: '1234567.89|124|2026|report' } })
  })

  it('never stores an sd under the 3% floor or over 1', () => {
    const g = makeTestGame(1)
    expect(learn(g, KEY, { mid: 5e6, sd: 0.001, src: 'press' })?.sd).toBe(0.03)
    expect(learn(g, OTHER, { mid: 50, sd: 7, src: 'press' })?.sd).toBe(1)
  })

  it('refuses a source in a year it has already been merged, and changes nothing', () => {
    const g = makeTestGame(1)
    expect(learn(g, KEY, { mid: 5e6, sd: 0.2, src: 'press' })).not.toBeNull()
    const before = JSON.stringify(g)
    expect(learn(g, KEY, { mid: 9e6, sd: 0.2, src: 'press' })).toBeNull()
    expect(learn(g, KEY, { mid: 9e6, sd: 0.01, src: 'press' })).toBeNull()
    expect(JSON.stringify(g)).toBe(before)
    // The refusal does not write even when the record holds junk to prune.
    rows(g)['mkt:fut:size'] = '1000000|200|2040|press'
    const dirty = JSON.stringify(g)
    expect(learn(g, KEY, { mid: 9e6, sd: 0.2, src: 'press' })).toBeNull()
    expect(JSON.stringify(g)).toBe(dirty)
  })

  it('a second source in the same year merges and lists both sources', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 4e6, sd: 0.2, src: 'press' })
    const r = learn(g, KEY, { mid: 9e6, sd: 0.2, src: 'report' })!
    // Two equal reads: the geometric mean and sd .2 / sqrt 2.
    expect(r.src).toBe('press+report')
    expect(r.sd).toBeCloseTo(0.142, 3)
    expect(r.mid / 6e6).toBeCloseTo(1, 3)
    expect(r.y).toBe(2026)
    // And the pair is now the stored row: neither source may be merged again this year.
    expect(learn(g, KEY, { mid: 1e6, sd: 0.2, src: 'press' })).toBeNull()
    expect(learn(g, KEY, { mid: 1e6, sd: 0.2, src: 'report' })).toBeNull()
  })

  it('the same source a year later merges with the aged row and sharpens it', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 4e6, sd: 0.2, src: 'press' })
    const next = learn(inYear(g, 2027), KEY, { mid: 9e6, sd: 0.2, src: 'press' })!
    // mkt.size drifts .06 a year: the old read is worth sqrt(.2^2 + .06^2) = .2088, so the new one weighs a little more.
    expect(next.y).toBe(2027)
    expect(next.src).toBe('press')
    expect(next.sd).toBeLessThan(0.2)
    expect(next.sd).toBeGreaterThan(0.14)
    expect(next.mid).toBeGreaterThan(4e6)
    expect(next.mid).toBeLessThan(9e6)
    expect(Math.log(next.mid / 4e6)).toBeGreaterThan(Math.log(9e6 / next.mid) * 0.9)
  })

  it('a merge never gets sharper than the 3% floor', () => {
    const g = makeTestGame(1)
    for (const [i, src] of ['press', 'report', 'analyst', 'diligence', 'investigator'].entries()) {
      learn(g, KEY, { mid: 5e6 * (1 + i / 1000), sd: 0.03, src })
    }
    expect(readKnow(g)!.k[KEY]!.sd).toBeGreaterThanOrEqual(0.03)
  })

  it('refuses what it cannot store, and writes nothing for it', () => {
    const g = makeTestGame(1)
    const bad: Array<[string, string, { mid: number; sd: number; src: string }]> = [
      ['a NaN mid', KEY, { mid: Number.NaN, sd: 0.2, src: 'press' }],
      ['an infinite mid', KEY, { mid: Number.POSITIVE_INFINITY, sd: 0.2, src: 'press' }],
      ['a zero money mid', KEY, { mid: 0, sd: 0.2, src: 'press' }],
      ['a negative money mid', KEY, { mid: -5, sd: 0.2, src: 'press' }],
      ['a NaN sd', KEY, { mid: 5e6, sd: Number.NaN, src: 'press' }],
      ['a zero sd', KEY, { mid: 5e6, sd: 0, src: 'press' }],
      ['a negative sd', KEY, { mid: 5e6, sd: -0.1, src: 'press' }],
      ['an empty source', KEY, { mid: 5e6, sd: 0.2, src: '' }],
      ['a source with a plus', KEY, { mid: 5e6, sd: 0.2, src: 'a+b' }],
      ['a source with a bar', KEY, { mid: 5e6, sd: 0.2, src: 'a|b' }],
      ['an upper case source', KEY, { mid: 5e6, sd: 0.2, src: 'Press' }],
      ['an own: key', 'own:me:cash', { mid: 5e6, sd: 0.2, src: 'press' }],
      ['a key with no rule row', 'zzz:a:b', { mid: 5e6, sd: 0.2, src: 'press' }],
      ['a key that is not a key', 'plain', { mid: 5e6, sd: 0.2, src: 'press' }],
      ['a key over 64 characters', `mkt:${'a'.repeat(60)}:size`, { mid: 5e6, sd: 0.2, src: 'press' }],
      ['a hint key with no unit', 'hint:abc:1', { mid: 5e6, sd: 0.2, src: 'press' }],
    ]
    const before = JSON.stringify(g)
    for (const [name, key, r] of bad) expect(learn(g, key, r), name).toBeNull()
    expect(JSON.stringify(g)).toBe(before)
    expect('know' in g.flags).toBe(false)
  })

  it('clamps a score into 0..100 and an odds read into 0..1, and a hint key takes the unit of the caller', () => {
    const g = makeTestGame(1)
    expect(learn(g, OTHER, { mid: 130, sd: 0.2, src: 'press' })?.mid).toBe(100)
    expect(learn(g, 'odds:x:rd:p', { mid: -0.2, sd: 0.2, src: 'report' })?.mid).toBe(0)
    expect(learn(g, 'hint:abc:1', { mid: 40, sd: 0.2, src: 'press', unit: 'score' })?.mid).toBe(40)
    expect(learn(g, 'hint:abc:2', { mid: 140, sd: 0.2, src: 'press', unit: 'score' })?.mid).toBe(100)
    expect(learn(g, 'hint:abc:3', { mid: -5, sd: 0.2, src: 'press', unit: 'money' })).toBeNull()
  })

  it('a signed delta row keeps its sign', () => {
    const g = makeTestGame(1)
    const r = learn(g, 'scn:s1:value', { mid: -12_500_000, sd: 0.3, src: 'report' })
    expect(r).toEqual({ mid: -12_500_000, sd: 0.3, y: 2026, src: 'report' })
  })
})

describe('the cap: 120 rows, the stalest out first, ties by key', () => {
  it('120 rows of one year fit; the 121st evicts the smallest key, not the row just learned', () => {
    const g = filled(KNOW_LIMITS.keys)
    expect(Object.keys(rows(g)).length).toBe(120)
    // A key that sorts first would be evicted by the rule: the new row is never the one to go.
    const r = learn(g, 'mkt:a000:size', { mid: 1e6, sd: 0.2, src: 'press' })
    expect(r).not.toBeNull()
    const keys = Object.keys(rows(g))
    expect(keys.length).toBe(120)
    expect(keys).toContain('mkt:a000:size')
    expect(keys).not.toContain('mkt:c000:size')
    expect(keys).toContain('mkt:c001:size')
  })

  it('a newer year pushes out the older rows first', () => {
    const g = filled(120, 2020)
    for (let i = 0; i < 5; i++) learn(inYear(g, 2021), `mkt:n${i}:size`, { mid: 1e6, sd: 0.2, src: 'press' })
    const keys = Object.keys(rows(g))
    expect(keys.length).toBe(120)
    for (let i = 0; i < 5; i++) expect(keys).toContain(`mkt:n${i}:size`)
    // The five smallest keys of the older year went.
    for (let i = 0; i < 5; i++) expect(keys).not.toContain(`mkt:c${String(i).padStart(3, '0')}:size`)
    expect(keys).toContain('mkt:c005:size')
    expect(keys).toContain('mkt:c119:size')
  })

  it('relearning an existing key at the cap evicts nothing', () => {
    const g = filled(120, 2026)
    learn(inYear(g, 2027), 'mkt:c050:size', { mid: 2e6, sd: 0.2, src: 'press' })
    expect(Object.keys(rows(g)).length).toBe(120)
  })

  it('120 rows are at most 400 JSON nodes, and the record is plain JSON', () => {
    const g = filled(120)
    const r = raw(g)
    expect(countNodes(r)).toBeLessThanOrEqual(400)
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
    expect(JSON.stringify(r).length).toBeLessThan(10_000)
  })

  it('a long life keeps the record bounded: 60 years of 40 new keys a year', () => {
    const g = makeTestGame(1)
    for (let year = 2026; year < 2086; year++) {
      g.year = year
      for (let i = 0; i < 40; i++) learn(g, `mkt:y${year}k${i}:size`, { mid: 1e6, sd: 0.2, src: 'press' })
      expect(Object.keys(rows(g)).length).toBeLessThanOrEqual(120)
    }
    // Only the last three years can be in it: 3 x 40 = 120.
    const years = new Set(Object.values(rows(g)).map((t) => t.split('|')[2]))
    expect([...years].sort()).toEqual(['2083', '2084', '2085'])
  })
})

describe('widen, forget', () => {
  it('widen doubles the sd of the rows under a prefix and no others, and keeps the year and the source', () => {
    const g = makeTestGame(1)
    learn(g, 'mkt:cafe:us:size', { mid: 5e6, sd: 0.1, src: 'report' })
    learn(g, 'mkt:cafe:us:share', { mid: 0.1, sd: 0.1, src: 'report' })
    learn(g, 'mkt:bar:us:size', { mid: 5e6, sd: 0.1, src: 'report' })
    widen(g, 'mkt:cafe:')
    const k = readKnow(g)!.k
    expect(k['mkt:cafe:us:size']).toEqual({ mid: 5e6, sd: 0.2, y: 2026, src: 'report' })
    expect(k['mkt:cafe:us:share']?.sd).toBe(0.2)
    expect(k['mkt:bar:us:size']?.sd).toBe(0.1)
  })

  it('widen takes a factor, caps the sd at .8, and never narrows a row or one already wider than the cap', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5e6, sd: 0.3, src: 'report' })
    widen(g, 'mkt:', 1.5)
    expect(readKnow(g)!.k[KEY]!.sd).toBeCloseTo(0.45, 3)
    widen(g, 'mkt:', 10)
    expect(readKnow(g)!.k[KEY]!.sd).toBe(0.8)
    widen(g, 'mkt:', 10)
    expect(readKnow(g)!.k[KEY]!.sd).toBe(0.8)
    for (const f of [0.5, 0, -3, Number.NaN]) {
      const before = JSON.stringify(g)
      widen(g, 'mkt:', f)
      expect(JSON.stringify(g), `factor ${f}`).toBe(before)
    }
    rows(g)[KEY] = '5000000|900|2026|report'
    widen(g, 'mkt:')
    expect(readKnow(g)!.k[KEY]!.sd).toBe(0.9)
  })

  it('widen with no record, or with a prefix that matches nothing, writes nothing', () => {
    const g = makeTestGame(1)
    widen(g, 'mkt:')
    expect('know' in g.flags).toBe(false)
    learn(g, KEY, { mid: 5e6, sd: 0.1, src: 'report' })
    const before = JSON.stringify(g)
    widen(g, 'riv:')
    expect(JSON.stringify(g)).toBe(before)
  })

  it('a widened row loses to the passive read when it is wider: widening is felt in know', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5e6, sd: 0.15, src: 'report' })
    expect(inFog(() => know(g, KEY, 5e6)).src).toBe('report')
    widen(g, 'mkt:')
    widen(g, 'mkt:')
    expect(inFog(() => know(g, KEY, 5e6)).src).toBe('passive')
  })

  it('forget removes one row; the last row takes the record with it unless it holds a dial, heat or stamp', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5e6, sd: 0.1, src: 'report' })
    learn(g, OTHER, { mid: 50, sd: 0.1, src: 'report' })
    forget(g, KEY)
    expect(Object.keys(rows(g))).toEqual([OTHER])
    forget(g, 'mkt:nothing:here:size')
    expect(Object.keys(rows(g))).toEqual([OTHER])
    forget(g, OTHER)
    expect('know' in g.flags).toBe(false)

    learn(g, KEY, { mid: 5e6, sd: 0.1, src: 'report' })
    raw(g).h = 6
    forget(g, KEY)
    expect(raw(g)).toMatchObject({ v: 1, k: {}, h: 6 })
  })
})

describe('know uses the record', () => {
  it('shows the stored row, with a better conf than the passive read, and Exact mode ignores it', () => {
    const g = makeTestGame(1)
    const passive = inFog(() => know(g, KEY, 5e6))
    expect(passive.src).toBe('passive')
    expect(passive.conf).toBe(1)
    learn(g, KEY, { mid: 5.2e6, sd: 0.12, src: 'report' })
    const e = inFog(() => know(g, KEY, 5e6))
    expect(e.src).toBe('report')
    expect(e.conf).toBe(2)
    expect(e.mid).toBe(5.2e6)
    expect(e.sd).toBeCloseTo(0.12, 6)
    expect(e.y).toBe(2026)
    expect(e.asOf).toBeUndefined()
    // Exact mode (the suite default) is the truth, record or no record.
    const exact = know(g, KEY, 5e6)
    expect(exact.exact).toBe(true)
    expect(exact.mid).toBe(5e6)
  })

  it('an old row shows asOf from the second year, with a wider band, and a very old read loses to the passive one', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5.2e6, sd: 0.1, src: 'report' })
    const fresh = inFog(() => know(inYear(g, 2026), KEY, 5e6))
    const a1 = inFog(() => know(inYear(g, 2027), KEY, 5e6))
    const a3 = inFog(() => know(inYear(g, 2029), KEY, 5e6))
    expect(a1.asOf).toBeUndefined()
    expect(a3.asOf).toBe(2026)
    expect(a3.sd).toBeGreaterThan(a1.sd)
    expect(a1.sd).toBeGreaterThan(fresh.sd)
    expect(a3.mid).toBe(5.2e6)
    // A fast mover (riv.cash drifts .35 a year): three years on, the stored read is worse than knowing nothing.
    const h = makeTestGame(1)
    learn(h, 'riv:r1:cash', { mid: 2e6, sd: 0.2, src: 'investigator' })
    expect(inFog(() => know(h, 'riv:r1:cash', 2e6)).src).toBe('investigator')
    expect(inFog(() => know(inYear(h, 2029), 'riv:r1:cash', 2e6)).src).toBe('passive')
  })

  it('the band holds the truth 77% to 83% of 2,000 lives with a bought report (each its own life)', () => {
    let hit = 0
    const N = 2000
    inFog(() => {
      for (let i = 0; i < N; i++) {
        const g = { ...fogGame(i), flags: {} as Record<string, Json> }
        const truth = 10 ** (5 + 4 * ((i * 0.6180339887) % 1))
        // What a source does (H4): the truth times the noise of the source's own hashed draw.
        const mid = truth * Math.exp(0.12 * zOf(g, KEY, g.year, 'report'))
        expect(learn(g, KEY, { mid, sd: 0.12, src: 'report' })).not.toBeNull()
        const e = know(g, KEY, truth)
        expect(e.src).toBe('report')
        if (e.lo <= truth && truth <= e.hi) hit++
      }
    })
    expect(hit / N).toBeGreaterThan(0.77)
    expect(hit / N).toBeLessThan(0.83)
  })

  it('the band still holds after the row has aged three years and the truth has drifted', () => {
    let hit = 0
    const N = 2000
    inFog(() => {
      for (let i = 0; i < N; i++) {
        const g = { ...fogGame(i), flags: {} as Record<string, Json> }
        const truth = 10 ** (5 + 4 * ((i * 0.6180339887) % 1))
        learn(g, KEY, { mid: truth * Math.exp(0.08 * zOf(g, KEY, g.year, 'report')), sd: 0.08, src: 'report' })
        // The truth walks mkt.size's .06 a year for three years (sd .06 x sqrt 3), then the player asks again.
        const moved = truth * Math.exp(0.06 * Math.sqrt(3) * zOf(g, KEY, g.year, 'drift'))
        g.year += 3
        const e = know(g, KEY, moved)
        expect(e.src).toBe('report')
        expect(e.asOf).toBe(2026)
        if (e.lo <= moved && moved <= e.hi) hit++
      }
    })
    expect(hit / N).toBeGreaterThan(0.77)
    expect(hit / N).toBeLessThan(0.83)
  })

  it('know reads the record and never writes it', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5.2e6, sd: 0.12, src: 'report' })
    deepFreeze(g)
    const rng = g.rng
    const before = JSON.stringify(g)
    for (let i = 0; i < 20; i++) inFog(() => know(g, KEY, 5e6))
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('storedEstimates', () => {
  it('is empty for no record and Exact mode does not hide it (it is the stored data, not a screen)', () => {
    const g = makeTestGame(1)
    expect(storedEstimates(g)).toEqual([])
    learn(g, KEY, { mid: 5e6, sd: 0.12, src: 'report' })
    expect(storedEstimates(g).length).toBe(1)
  })

  it('lists the stalest first, ties by key, with no truth needed', () => {
    const g = makeTestGame(1)
    // Learned in the order the years come: a row from after g.year is dropped by the next write (no foresight).
    g.year = 2019
    learn(g, 'mkt:z:us:size', { mid: 5e6, sd: 0.1, src: 'press' })
    g.year = 2021
    learn(g, 'mkt:b:us:size', { mid: 5e6, sd: 0.1, src: 'press' })
    learn(g, 'mkt:a:us:size', { mid: 5e6, sd: 0.1, src: 'press' })
    g.year = 2023
    learn(g, OTHER, { mid: 55, sd: 0.2, src: 'analyst' })
    g.year = 2026
    learn(g, 'odds:x:rd:p', { mid: 0.62, sd: 0.1, src: 'report' })
    const list = storedEstimates(g)
    expect(list.map((e) => e.key)).toEqual(['mkt:z:us:size', 'mkt:a:us:size', 'mkt:b:us:size', OTHER, 'odds:x:rd:p'])
    expect(list.map((e) => e.y)).toEqual([2019, 2021, 2021, 2023, 2026])
  })

  it('builds each estimate from the row alone: aged sd, conf, asOf, a band round the reading, words', () => {
    const g = makeTestGame(1)
    g.year = 2023
    learn(g, KEY, { mid: 5e6, sd: 0.1, src: 'report' })
    g.year = 2026
    const [e] = storedEstimates(g)
    expect(e).toBeDefined()
    expect(e!.key).toBe(KEY)
    expect(e!.exact).toBe(false)
    expect(e!.mid).toBe(5e6)
    expect(e!.src).toBe('report')
    expect(e!.y).toBe(2023)
    expect(e!.asOf).toBe(2023)
    // sqrt(.1^2 + .06^2 x 3) = .1442 after three years: past the .06 of an exact read, still inside the .15 of a good one.
    expect(e!.sd).toBeCloseTo(Math.sqrt(0.01 + 0.0036 * 3), 6)
    expect(e!.conf).toBe(2)
    expect(e!.lo).toBeLessThan(e!.mid)
    expect(e!.hi).toBeGreaterThan(e!.mid)
    expect(e!.lo).toBeCloseTo(5e6 * Math.exp(-1.298 * e!.sd), 0)
    expect(e!.words.length).toBeGreaterThan(0)
    expect(e!.words.length).toBeLessThanOrEqual(40)
  })

  it('shows a score row on its 0..100 scale, an odds row on 0..1, and a signed delta with its sign', () => {
    const g = makeTestGame(1)
    learn(g, OTHER, { mid: 95, sd: 0.2, src: 'report' })
    learn(g, 'odds:x:rd:p', { mid: 0.62, sd: 0.1, src: 'report' })
    learn(g, 'scn:s1:value', { mid: -12_500_000, sd: 0.3, src: 'report' })
    const by = new Map(storedEstimates(g).map((e) => [e.key, e]))
    expect(by.get(OTHER)!.hi).toBe(100)
    expect(by.get(OTHER)!.lo).toBeCloseTo(95 - 100 * 1.298 * 0.2, 6)
    expect(by.get('odds:x:rd:p')!.lo).toBeCloseTo(0.62 - 1.298 * 0.1, 6)
    expect(by.get('scn:s1:value')!.mid).toBe(-12_500_000)
    expect(by.get('scn:s1:value')!.lo).toBeLessThan(by.get('scn:s1:value')!.hi)
  })

  it('is pure: under deepFreeze the reads change nothing, g.rng stays, and the answer repeats', () => {
    const g = filled(30)
    learn(g, OTHER, { mid: 55, sd: 0.2, src: 'analyst' })
    deepFreeze(g)
    const rng = g.rng
    const before = JSON.stringify(g)
    const first = JSON.stringify(storedEstimates(g))
    expect(JSON.stringify(storedEstimates(g))).toBe(first)
    expect(readKnow(g)).toEqual(readKnow(g))
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('the record read back is a copy: changing it changes nothing in the game', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5e6, sd: 0.12, src: 'report' })
    const before = JSON.stringify(g)
    const rec = readKnow(g)!
    expect(Object.isFrozen(rec)).toBe(true)
    expect(() => {
      ;(rec.k as Record<string, StoredRow>)[KEY] = { mid: 1, sd: 1, y: 1, src: 'x' }
    }).toThrow()
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('reach: heirs, the Time Machine, old saves and default lives', () => {
  it('an heir starts clean: a real continueAsChild drops a populated record', () => {
    const g = makeTestGame(1, { age: 70 })
    const child = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
    learn(g, KEY, { mid: 5e6, sd: 0.1, src: 'report' })
    learn(g, OTHER, { mid: 55, sd: 0.2, src: 'analyst' })
    raw(g).h = 6
    expect(readKnow(g)).not.toBeNull()
    killCharacter(g, 'Old Age')
    g.queue = []
    const heir = continueAsChild(g, child.id)
    expect(heir).not.toBe(g)
    expect(heir.generation).toBe(2)
    expect('know' in heir.flags).toBe(false)
    expect(readKnow(heir)).toBeNull()
    expect(inFog(() => know(heir, KEY, 5e6)).src).toBe('passive')
  })

  it('a record that does reach another owner (a copied flags bag) reads as null there', () => {
    const g = makeTestGame(1)
    learn(g, KEY, { mid: 5e6, sd: 0.1, src: 'report' })
    const other = makeTestGame(1, { id: 'someone-else' })
    other.flags = structuredClone(g.flags)
    expect(readKnow(other)).toBeNull()
    const gen2 = makeTestGame(1)
    gen2.flags = structuredClone(g.flags)
    gen2.generation = 2
    expect(readKnow(gen2)).toBeNull()
    expect(inFog(() => know(gen2, KEY, 5e6)).src).toBe('passive')
  })

  it('a Time Machine snapshot keeps the record, and a jump back leaves no row from the future', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', memoryLocalStorage())
    try {
      const save = await import('../src/game/save')
      const life = await import('../src/game/life')
      const knowledge = await import('../src/game/knowledge/contract')
      const tm = await import('../src/game/timeMachine')
      const g = life.createNewLife({ seed: SEED, year: 1990 })
      g.queue = []
      save.setSnapshotBackend(save.memorySnapshotBackend())
      save.startTimeline(g.lifeId, null)
      expect(knowledge.learn(g, KEY, { mid: 5e6, sd: 0.1, src: 'report' })).not.toBeNull()
      knowledge.learn(g, OTHER, { mid: 55, sd: 0.2, src: 'analyst' })
      const text = JSON.stringify(g.flags[knowledge.KNOW_FLAG])
      expect(await save.takeSnapshot(g)).toBe(true)
      await save.snapshotWritesSettled()
      const back = await save.loadSnapshot(g.lifeId, g.character.age)
      expect(back).not.toBeNull()
      expect(JSON.stringify(back!.flags[knowledge.KNOW_FLAG])).toBe(text)
      expect(knowledge.readKnow(back!)?.k[KEY]?.src).toBe('report')

      // The jump itself (arriveInPast): the record of the snapshot comes back with the snapshot.
      const later = structuredClone(g)
      later.year += 4
      later.character.age += 4
      const arrived = tm.arriveInPast(later, back!)
      expect(JSON.stringify(arrived.flags[knowledge.KNOW_FLAG])).toBe(text)

      // A row that is stamped after the year we arrived in is not readable: nothing from the future survives the jump.
      ;(arrived.flags[knowledge.KNOW_FLAG] as unknown as { k: Record<string, string> }).k[KEY] = `5000000|100|${arrived.year + 4}|report`
      expect(knowledge.readKnow(arrived)?.k[KEY]).toBeUndefined()
      expect(knowledge.readKnow(arrived)?.k[OTHER]?.src).toBe('analyst')
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  }, 30_000)

  it('the v5.0.0 heavy save loads with the key absent and plays 5 years without creating it', () => {
    const text = gunzipSync(readFileSync(join(ROOT, 'test', 'fixtures', 'save-v5.0.0-heavy.json.gz'))).toString()
    const r = migrateSave(JSON.parse(text))
    if (r.kind !== 'ready') throw new Error(`the fixture did not migrate: ${JSON.stringify(r)}`)
    const g = r.game
    expect(KNOW_FLAG in g.flags).toBe(false)
    expect(readKnow(g)).toBeNull()
    for (let i = 0; i < 5; i++) {
      g.queue = []
      g.character.stats.health = 100
      ageUp(g)
      expect(KNOW_FLAG in g.flags, `year ${i + 1}`).toBe(false)
      inFog(() => know(g, KEY, 9e6))
    }
    expect(g.character.alive).toBe(true)
  }, 60_000)

  it('a default 20-year life never creates flags.know', () => {
    const g = createNewLife({ seed: SEED, year: 1990 })
    for (let i = 0; i < 20; i++) {
      g.queue = []
      g.character.stats.health = 100
      g.character.conditions = []
      ageUp(g)
      expect(KNOW_FLAG in g.flags, `age ${g.character.age}`).toBe(false)
    }
    expect(g.character.age).toBe(20)
  }, 60_000)
})
