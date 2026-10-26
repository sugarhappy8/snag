// ci: fast
// R4-E6a (D.3): the 40 memory kinds and their effect table (src/game/world/edge-memory.ts). A memory is one string on an edge,
// 'kind.year.weight.by', and its kind id is stored in every save that holds one, so the list of ids is append-only (R6 appends after
// the 40th) and MEMORY_FX is a frozen table that the lead reads before the merge (cross-check section 3.3, X57).
//
// What this file pins: the 40 ids and their order, the shape of every effect row (integers within 25, no row moving all four fields
// by the full 25, a decay of 0 for the pinned five and 1 or more for the rest), the signs the lead checks by name (a betrayal costs
// trust and respect and raises resentment, saved_me does the opposite), and the memory string codec (canonical text in, the same text
// out, anything else null). The VALUES of the table are not pinned here: the lead's read is their only review, and after R4 a changed
// value needs a RECORD_REASON, a moved-tests.md row and the lead's OK.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MEMORY_FX,
  MEMORY_KINDS,
  PINNED_MEMORY_KINDS,
  formatMemory,
  isMemoryKind,
  isPinnedKind,
  parseMemory,
  type Memory,
  type MemoryKind,
} from '../src/game/world/edge-memory'
import { layerOf } from './layer-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const IDS = [
  'loan_given', 'loan_repaid', 'loan_unpaid', 'loan_forgiven', 'gift_given', 'gift_refused', 'allowance_cut', 'bailed_out',
  'asked_too_often', 'cut_from_will', 'restored_to_will', 'told_gently', 'told_bluntly', 'olive_branch', 'took_my_side', 'estranged',
  'reconciled', 'betrayal', 'proposed_yes', 'proposed_no', 'broke_up', 'divorced', 'stood_by_me', 'saved_me',
  'covered_for_me', 'kept_secret', 'leaked_secret', 'gossiped_about_me', 'outed_me', 'reported_me', 'hired_me', 'fired_me',
  'promoted_me', 'demoted_me', 'passed_over', 'poached_me', 'signed_me', 'referred_me', 'mentored_me', 'beat_me',
] as const

const PINNED = ['betrayal', 'saved_me', 'cut_from_will', 'estranged', 'divorced'] as const

describe('MEMORY_KINDS: the 40 ids', () => {
  it('are exactly the list of the plan, in its order (append-only: R6 adds after the 40th)', () => {
    expect([...MEMORY_KINDS]).toEqual([...IDS])
    expect(MEMORY_KINDS).toHaveLength(40)
    expect(new Set(MEMORY_KINDS).size).toBe(40)
  })

  it('is frozen, and every id is lower case words joined by underscores that never hold a dot (the string codec splits on dots)', () => {
    expect(Object.isFrozen(MEMORY_KINDS)).toBe(true)
    for (const k of MEMORY_KINDS) expect(k, k).toMatch(/^[a-z]+(?:_[a-z]+)*$/)
  })

  it('has the seven career kinds R6 asked for', () => {
    for (const k of ['signed_me', 'fired_me', 'poached_me', 'beat_me', 'hired_me', 'referred_me', 'mentored_me']) expect(MEMORY_KINDS).toContain(k)
  })

  it('isMemoryKind is a total guard: the 40 ids pass, nothing else does', () => {
    for (const k of MEMORY_KINDS) expect(isMemoryKind(k), k).toBe(true)
    for (const bad of ['', 'Betrayal', 'betrayal ', 'unknown', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 5, null, undefined, {}, [], ['betrayal']]) {
      expect(isMemoryKind(bad)).toBe(false)
    }
  })

  it('lives in layer 2 and imports nothing above it', () => {
    expect(layerOf('src/game/world/edge-memory.ts')).toBe(2)
  })
})

describe('MEMORY_FX: the frozen effect table', () => {
  it('has one row for each of the 40 kinds and no other key', () => {
    expect(Object.keys(MEMORY_FX).sort()).toEqual([...MEMORY_KINDS].sort())
  })

  it('is frozen, rows and all', () => {
    expect(Object.isFrozen(MEMORY_FX)).toBe(true)
    for (const k of MEMORY_KINDS) expect(Object.isFrozen(MEMORY_FX[k]), k).toBe(true)
  })

  it('has exactly { t, r, s, o, decay } in every row, whole numbers', () => {
    for (const k of MEMORY_KINDS) {
      const row = MEMORY_FX[k]
      expect(Object.keys(row).sort(), k).toEqual(['decay', 'o', 'r', 's', 't'])
      for (const f of ['t', 'r', 's', 'o', 'decay'] as const) expect(Number.isInteger(row[f]), `${k}.${f}`).toBe(true)
    }
  })

  it('moves every field by 25 at most, either way', () => {
    for (const k of MEMORY_KINDS) {
      const { t, r, s, o } = MEMORY_FX[k]
      for (const [name, v] of [['t', t], ['r', r], ['s', s], ['o', o]] as const) expect(Math.abs(v), `${k}.${name}`).toBeLessThanOrEqual(25)
    }
  })

  it('has no row that moves all four fields by the full 25', () => {
    for (const k of MEMORY_KINDS) {
      const { t, r, s, o } = MEMORY_FX[k]
      expect([t, r, s, o].every((v) => Math.abs(v) === 25), k).toBe(false)
    }
  })

  it('moves something in every row (a kind that changes nothing has no business in the table)', () => {
    for (const k of MEMORY_KINDS) {
      const { t, r, s, o } = MEMORY_FX[k]
      expect([t, r, s, o].some((v) => v !== 0), k).toBe(true)
    }
  })

  it('has decay 0 for the pinned five and 1 or more for every other kind', () => {
    for (const k of MEMORY_KINDS) {
      const decay = MEMORY_FX[k].decay
      if ((PINNED as readonly string[]).includes(k)) expect(decay, k).toBe(0)
      else {
        expect(decay, k).toBeGreaterThanOrEqual(1)
        expect(decay, k).toBeLessThanOrEqual(12)
      }
    }
  })

  it('follows the signs the lead reads: a betrayal costs trust and respect and raises resentment, saved_me does the opposite', () => {
    const b = MEMORY_FX.betrayal
    expect(b.t).toBeLessThan(0)
    expect(b.r).toBeLessThan(0)
    expect(b.s).toBeGreaterThan(0)
    const s = MEMORY_FX.saved_me
    expect(s.t).toBeGreaterThan(0)
    expect(s.r).toBeGreaterThan(0)
    expect(s.s).toBeLessThan(0)
    // the two are opposites in size as well as in sign for trust and resentment, the fields the feud ladder reads
    expect(s.t).toBe(-b.t)
    expect(s.s).toBe(-b.s)
  })

  it('makes every break in a bond (cut out, estranged, divorced, broke up, outed, reported, leaked, fired) cost trust and add resentment', () => {
    for (const k of ['cut_from_will', 'estranged', 'divorced', 'broke_up', 'outed_me', 'reported_me', 'leaked_secret', 'fired_me', 'loan_unpaid'] as const) {
      expect(MEMORY_FX[k].t, k).toBeLessThan(0)
      expect(MEMORY_FX[k].s, k).toBeGreaterThan(0)
    }
  })

  it('makes every kindness (stood by me, covered for me, bailed out, mentored, hired, promoted, forgiven, restored, reconciled) earn trust and lower resentment', () => {
    for (const k of ['stood_by_me', 'covered_for_me', 'bailed_out', 'mentored_me', 'hired_me', 'promoted_me', 'loan_forgiven', 'restored_to_will', 'reconciled', 'kept_secret'] as const) {
      expect(MEMORY_FX[k].t, k).toBeGreaterThan(0)
      expect(MEMORY_FX[k].s, k).toBeLessThan(0)
    }
  })

  it('lets a favor done raise obligation (the first end owes the second) and a debt paid lower it', () => {
    for (const k of ['loan_given', 'bailed_out', 'gift_given', 'covered_for_me', 'saved_me'] as const) expect(MEMORY_FX[k].o, k).toBeGreaterThan(0)
    expect(MEMORY_FX.loan_repaid.o).toBeLessThan(0)
  })
})

describe('the pinned five', () => {
  it('are betrayal, saved_me, cut_from_will, estranged and divorced', () => {
    expect([...PINNED_MEMORY_KINDS].sort()).toEqual([...PINNED].sort())
    expect(PINNED_MEMORY_KINDS.size).toBe(5)
  })

  it('are the same five that never decay in MEMORY_FX (one rule, two views)', () => {
    const noDecay = MEMORY_KINDS.filter((k) => MEMORY_FX[k].decay === 0)
    expect(new Set(noDecay)).toEqual(new Set(PINNED_MEMORY_KINDS))
  })

  it('isPinnedKind is a total guard', () => {
    for (const k of MEMORY_KINDS) expect(isPinnedKind(k), k).toBe((PINNED as readonly string[]).includes(k))
    for (const bad of ['', 'nope', 5, null, undefined, {}, '__proto__']) expect(isPinnedKind(bad)).toBe(false)
  })
})

describe('the memory string: kind.year.weight.by', () => {
  const good: Memory = { kind: 'betrayal', year: 2031, w: 3, by: 'ego' }

  it('writes the plan form and reads it back', () => {
    expect(formatMemory(good)).toBe('betrayal.2031.3.e')
    expect(formatMemory({ kind: 'loan_given', year: 1900, w: 1, by: 'them' })).toBe('loan_given.1900.1.t')
    expect(parseMemory('betrayal.2031.3.e')).toEqual(good)
    expect(parseMemory('loan_given.1900.1.t')).toEqual({ kind: 'loan_given', year: 1900, w: 1, by: 'them' })
  })

  it('round-trips every kind at every weight, both ends, at the first and the last year', () => {
    let n = 0
    for (const kind of MEMORY_KINDS) {
      for (const w of [1, 2, 3]) {
        for (const by of ['ego', 'them'] as const) {
          for (const year of [1900, 2026, 100_000]) {
            const s = formatMemory({ kind, year, w, by })
            expect(parseMemory(s), s).toEqual({ kind, year, w, by })
            n++
          }
        }
      }
    }
    expect(n).toBe(40 * 3 * 2 * 3)
  })

  it('stays well inside 40 characters, the longest kind at the last year included', () => {
    const longest = [...MEMORY_KINDS].sort((a, b) => b.length - a.length)[0]!
    expect(formatMemory({ kind: longest, year: 100_000, w: 3, by: 'them' }).length).toBeLessThan(40)
  })

  it('reads anything that is not that exact text as null: other types, unknown kinds, weights, years, sides and spellings', () => {
    const bad: unknown[] = [
      null, undefined, 5, {}, [], ['betrayal.2031.3.e'], true,
      '', '.', '...', 'betrayal', 'betrayal.2031', 'betrayal.2031.3', 'betrayal.2031.3.', 'betrayal.2031.3.e.extra',
      'unknown.2031.3.e', 'Betrayal.2031.3.e', '__proto__.2031.3.e', 'betrayal.2031.0.e', 'betrayal.2031.4.e', 'betrayal.2031.-1.e',
      'betrayal.2031.1.5.e', 'betrayal.2031.1.5', 'betrayal.2031.2.5.e', 'betrayal.2031.NaN.e', 'betrayal.2031.2.5e', 'betrayal.2031.x.e',
      'betrayal.1899.3.e', 'betrayal.100001.3.e', 'betrayal.-2031.3.e', 'betrayal.2031.5.3.e', 'betrayal.2031.3.x', 'betrayal.2031.3.E',
      'betrayal.2031.3.ego', 'betrayal.02031.3.e', 'betrayal.2031.03.e', 'betrayal.+2031.3.e', 'betrayal.2.0e3.3.e', ' betrayal.2031.3.e',
      'betrayal.2031.3.e ', 'betrayal. 2031.3.e', 'betrayal.2031 .3.e', 'betrayal\n.2031.3.e', 'x'.repeat(100), `betrayal.2031.3.e${'x'.repeat(100)}`,
    ]
    for (const s of bad) expect(parseMemory(s), String(s)).toBeNull()
  })

  it('formatMemory refuses what the reader would refuse (a RangeError, for code that knows what it writes)', () => {
    expect(() => formatMemory({ kind: 'nope' as MemoryKind, year: 2000, w: 1, by: 'ego' })).toThrow(RangeError)
    expect(() => formatMemory({ kind: 'betrayal', year: 2000, w: 4, by: 'ego' })).toThrow(RangeError)
    expect(() => formatMemory({ kind: 'betrayal', year: 2000, w: 0, by: 'ego' })).toThrow(RangeError)
    expect(() => formatMemory({ kind: 'betrayal', year: 2000.5, w: 1, by: 'ego' })).toThrow(RangeError)
    expect(() => formatMemory({ kind: 'betrayal', year: 1899, w: 1, by: 'ego' })).toThrow(RangeError)
    expect(() => formatMemory({ kind: 'betrayal', year: 2000, w: 1, by: 'x' as 'ego' })).toThrow(RangeError)
  })
})

describe('docs/SOCIAL.md and docs/PEOPLE.md', () => {
  const social = read('docs/SOCIAL.md')
  const people = read('docs/PEOPLE.md')

  it('SOCIAL.md names each of the 40 ids once in the list of kinds, in the order of the table', () => {
    const at = social.indexOf('## 5. The 40 memory kinds')
    expect(at).toBeGreaterThan(0)
    const section = social.slice(at, social.indexOf('## 6.', at))
    let from = 0
    for (const k of MEMORY_KINDS) {
      const found = section.indexOf(k, from)
      expect(found, k).toBeGreaterThanOrEqual(from)
      from = found + k.length
    }
  })

  it('SOCIAL.md prints the caps, the pinned five and the rule of the table', () => {
    for (const word of ['EDGE_CAPS', '1,200', '4,000', 'MEMORY_FX', 'RECORD_REASON', 'append-only', 'betrayal', 'saved_me', 'cut_from_will', 'estranged', 'divorced', 'normalizeEdges', 'edgeLocalBound', 'edgeProblems', '19,409']) {
      expect(social, word).toContain(word)
    }
  })

  it('PEOPLE.md carries the edge model and its caps (X51) and neither file holds a long dash', () => {
    for (const word of ['The edge model and its caps', 'EDGE_CAPS', 'MEMORY_KINDS', 'LINK_KINDS', 'docs/SOCIAL.md']) expect(people, word).toContain(word)
    expect(DASH.test(social)).toBe(false)
    expect(DASH.test(people)).toBe(false)
  })
})
