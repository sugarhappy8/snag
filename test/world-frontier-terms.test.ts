// ci: fast
// R3-F6 (C.6 f): the odds terms and the words of the world frontier (src/game/world/frontier-terms.ts). The pure read API that
// Effort migration (the odds lines "public research +N" and "rival pressure -N") and the fog layer (the words) use.
//
// What this file pins: zeros at default (no shard, no field, any year up to 2026, a hostile shard), so the parity grid keeps its
// numbers; public research that grows with a disclosure and never passes 18 points; an AI capability that also sees the `ai` field
// above it; the 3-year window of rival rows, 2 points each and 8 at most; a `year` after g.year read as g.year (no foresight); reads
// that are pure (a deep-frozen state, no write, no g.rng, the same number twice); the five edges of the words; and a field line
// that follows docs/VOICE.md. The reasons are string literals here: this track imports nothing from effort/.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import type { GameState } from '../src/game/types'
import { applyDisclosure, frontierLead, frontierSpill, type Disclosure, type FieldRec, type FrontierRow, type FrontierShard } from '../src/game/world/frontier'
import { FIELDS, FIELD_IDS, fieldLabel, type FieldId } from '../src/game/world/frontier-fields'
import { FRONTIER_REASONS, fieldLine, frontierTerms, frontierWords } from '../src/game/world/frontier-terms'
import '../src/game/world/shards'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

/** A fresh state in `year` (the writer refuses a year after g.year). */
function life(year = 2030, lifeId = 'terms-life'): GameState {
  const g = makeTestGame(1)
  g.year = year
  g.lifeId = lifeId
  return g
}

/** A fresh state whose `world` is exactly `{ v: 1, frontier }`. */
function lifeWith(frontier: unknown, year = 2030): GameState {
  const g = life(year)
  ;(g as { world?: unknown }).world = { v: 1, frontier }
  return g
}

const disc = (over: Partial<Disclosure> = {}): Disclosure => ({ field: 'fusion', year: 2030, size: 1, origin: 'wave:a', by: 'you', shield: 'open', ...over })
const row = (y: number, o: string, over: Partial<FrontierRow> = {}): FrontierRow => ({ y, w: 'rival', m: 'world', d: 10, o, ...over })
const rec = (over: Partial<FieldRec> = {}): FieldRec => ({ fold: 0, pub: 0, ly: 2030, rows: [], ...over })
const shardOf = (f: FrontierShard['f'], y = 0): FrontierShard => ({ v: 1, y, f })

/** `n` rival pushes into `field`, one for each of the years given, with distinct origins. */
function rivalPushes(g: GameState, field: FieldId, years: readonly number[]): void {
  years.forEach((year, i) => {
    const r = applyDisclosure(g, disc({ field, year, by: 'rival', size: 0.1, origin: `rv:${field}:${year}:${i}` }))
    expect(r.applied, `${field} ${year} #${i}`).toBe(true)
  })
}

const ZERO = { spill: 0, rival: 0, lead: 0 }

describe('the terms are zero at default', () => {
  it('gives zeros for a null field', () => {
    const g = life()
    applyDisclosure(g, disc())
    expect(frontierTerms(g, null)).toEqual(ZERO)
  })

  it('gives zeros for every field of a life with no shard, and makes no world', () => {
    const g = life()
    for (const f of FIELD_IDS) expect(frontierTerms(g, f), f).toEqual(ZERO)
    expect(g.world).toBeUndefined()
  })

  it('gives zeros for every year up to 2026, with or without a shard', () => {
    for (const year of [1950, 1990, 2005, 2025, 2026]) {
      const bare = life(year)
      const built = lifeWith(shardOf({ fusion: rec({ fold: 200, pub: 120, ly: 2030, rows: [row(2030, 'a')] }) }), year)
      for (const f of FIELD_IDS) {
        expect(frontierTerms(bare, f), `${year} ${f}`).toEqual(ZERO)
        expect(frontierTerms(built, f), `${year} ${f} built`).toEqual(ZERO)
      }
    }
  })

  it('gives zeros when the asked year is up to 2026, however late g.year is', () => {
    const g = life(2040)
    applyDisclosure(g, disc({ year: 2030 }))
    rivalPushes(g, 'fusion', [2031, 2032])
    expect(frontierTerms(g, 'fusion', 2026)).toEqual(ZERO)
    expect(frontierTerms(g, 'fusion', 1999)).toEqual(ZERO)
    expect(frontierTerms(g, 'fusion', 2032).rival).toBe(4)
  })

  it('gives zeros for a field that is not one, and for a hostile or empty shard', () => {
    const g = life()
    applyDisclosure(g, disc())
    for (const junk of ['constructor', '__proto__', 'cloud', '', 'toString']) expect(frontierTerms(g, junk as FieldId), junk).toEqual(ZERO)
    for (const hostile of [7, 'x', [], null, { v: 2, f: {} }, { v: 1, f: { fusion: 5 } }, { v: 1, f: { nowhere: rec() } }]) {
      expect(frontierTerms(lifeWith(hostile), 'fusion'), JSON.stringify(hostile)).toEqual(ZERO)
    }
  })

  it('reads a non-finite or fractional year as a year, and never throws', () => {
    const g = life(2033)
    applyDisclosure(g, disc({ year: 2033 }))
    const now = frontierTerms(g, 'fusion')
    expect(frontierTerms(g, 'fusion', Number.NaN)).toEqual(now)
    expect(frontierTerms(g, 'fusion', Number.POSITIVE_INFINITY)).toEqual(now)
    expect(frontierTerms(g, 'fusion', 2033.9)).toEqual(now)
    expect(() => frontierTerms(g, 'fusion', Number.NEGATIVE_INFINITY)).not.toThrow()
    expect(frontierTerms(g, 'fusion', Number.NEGATIVE_INFINITY)).toEqual(ZERO)
  })
})

describe('public research (spill)', () => {
  it('rises by the points of a disclosure', () => {
    const g = life()
    const before = frontierTerms(g, 'fusion').spill
    expect(before).toBe(0)
    const r = applyDisclosure(g, disc({ size: 1, shield: 'open' }))
    expect(r.applied).toBe(true)
    expect(frontierTerms(g, 'fusion').spill).toBe(6)
    applyDisclosure(g, disc({ origin: 'wave:b', size: 0.4, shield: 'open' }))
    expect(frontierTerms(g, 'fusion').spill).toBe(frontierSpill(g, 'fusion'))
    expect(frontierTerms(g, 'fusion').spill).toBe(9)
  })

  it('never passes 18 points, however many disclosures are made', () => {
    const g = life()
    for (let i = 0; i < 12; i++) applyDisclosure(g, disc({ origin: `wave:${i}` }))
    expect(frontierSpill(g, 'fusion')).toBe(18)
    expect(frontierTerms(g, 'fusion').spill).toBe(18)
  })

  it('caps the sum of a field and its parent at 18', () => {
    const g = life()
    for (let i = 0; i < 5; i++) applyDisclosure(g, disc({ field: 'ai', origin: `p:${i}` }))
    for (let i = 0; i < 5; i++) applyDisclosure(g, disc({ field: 'ai.reasoning', origin: `c:${i}` }))
    expect(frontierSpill(g, 'ai')).toBe(18)
    expect(frontierSpill(g, 'ai.reasoning')).toBe(18)
    expect(frontierTerms(g, 'ai.reasoning').spill).toBe(18)
  })

  it('lets an AI capability see the ai field above it, and not its siblings or the other way round', () => {
    const g = life()
    applyDisclosure(g, disc({ field: 'ai', origin: 'p' }))
    expect(frontierSpill(g, 'ai')).toBe(6)
    applyDisclosure(g, disc({ field: 'ai.coding', origin: 'c', size: 0.4 }))
    expect(frontierSpill(g, 'ai.coding')).toBe(3)
    expect(frontierTerms(g, 'ai.reasoning').spill).toBe(6)
    expect(frontierTerms(g, 'ai.coding').spill).toBe(9)
    expect(frontierTerms(g, 'ai').spill).toBe(6)
    expect(frontierTerms(g, 'chips').spill).toBe(0)
  })

  it('does not read a field that has no parent through the ai field', () => {
    const g = life()
    applyDisclosure(g, disc({ field: 'ai' }))
    for (const f of FIELD_IDS) {
      const expected = f === 'ai' || f.startsWith('ai.') ? 6 : 0
      expect(frontierTerms(g, f).spill, f).toBe(expected)
    }
  })
})

describe('rival pressure', () => {
  it('is 2 points for each rival row of the last 3 years', () => {
    const g = life(2034)
    rivalPushes(g, 'quantum', [2034])
    expect(frontierTerms(g, 'quantum').rival).toBe(2)
    rivalPushes(g, 'quantum', [2033])
    expect(frontierTerms(g, 'quantum').rival).toBe(4)
    rivalPushes(g, 'quantum', [2032])
    expect(frontierTerms(g, 'quantum').rival).toBe(6)
  })

  it('leaves out a row of three years ago and a row of yours', () => {
    const g = life(2034)
    rivalPushes(g, 'quantum', [2031])
    expect(frontierTerms(g, 'quantum').rival).toBe(0)
    applyDisclosure(g, disc({ field: 'quantum', year: 2034, origin: 'mine', by: 'you' }))
    applyDisclosure(g, disc({ field: 'quantum', year: 2033, origin: 'mine2', by: 'you' }))
    expect(frontierTerms(g, 'quantum').rival).toBe(0)
    rivalPushes(g, 'quantum', [2032])
    expect(frontierTerms(g, 'quantum').rival).toBe(2)
  })

  it('stops at 8 points, 4 rows', () => {
    const g = life(2036)
    rivalPushes(g, 'drones', [2034, 2034, 2035, 2035, 2036, 2036, 2036])
    expect(frontierTerms(g, 'drones').rival).toBe(8)
  })

  it('counts the rival rows of the parent for an AI capability', () => {
    const g = life(2035)
    rivalPushes(g, 'ai', [2035, 2034])
    rivalPushes(g, 'ai.science', [2035])
    rivalPushes(g, 'ai.coding', [2035, 2035])
    expect(frontierTerms(g, 'ai.science').rival).toBe(6)
    expect(frontierTerms(g, 'ai.coding').rival).toBe(8)
    expect(frontierTerms(g, 'ai.vision').rival).toBe(4)
    expect(frontierTerms(g, 'ai').rival).toBe(4)
    expect(frontierTerms(g, 'chips').rival).toBe(0)
  })

  it('reads a window that ends at the asked year', () => {
    const g = life(2040)
    rivalPushes(g, 'space', [2033, 2034, 2038, 2039, 2040])
    expect(frontierTerms(g, 'space', 2040).rival).toBe(6)
    expect(frontierTerms(g, 'space', 2039).rival).toBe(4)
    expect(frontierTerms(g, 'space', 2036).rival).toBe(2)
    expect(frontierTerms(g, 'space', 2035).rival).toBe(4)
    expect(frontierTerms(g, 'space', 2034).rival).toBe(4)
    expect(frontierTerms(g, 'space', 2030).rival).toBe(0)
  })
})

describe('the lead', () => {
  it('is the field own lead in years, and not the parent lead', () => {
    const g = life()
    applyDisclosure(g, disc({ field: 'ai', size: 1 }))
    applyDisclosure(g, disc({ field: 'fusion', size: 0.5 }))
    expect(frontierTerms(g, 'ai').lead).toBe(frontierLead(g, 'ai'))
    expect(frontierTerms(g, 'ai').lead).toBeGreaterThan(1)
    expect(frontierTerms(g, 'fusion').lead).toBe(frontierLead(g, 'fusion'))
    expect(frontierTerms(g, 'ai.reasoning').lead).toBe(0)
    expect(frontierTerms(g, 'chips').lead).toBe(0)
  })

  it('stays within 0 to 12 years', () => {
    const g = life(2060)
    for (let y = 2027; y <= 2060; y++) for (let i = 0; i < 3; i++) applyDisclosure(g, disc({ year: y, origin: `x${y}:${i}` }))
    expect(frontierTerms(g, 'fusion').lead).toBeLessThanOrEqual(12)
    expect(frontierTerms(g, 'fusion').lead).toBe(12)
  })
})

describe('no foresight', () => {
  it('reads a year after g.year as g.year', () => {
    const g = life(2034)
    applyDisclosure(g, disc({ year: 2033 }))
    rivalPushes(g, 'fusion', [2033, 2034])
    const now = frontierTerms(g, 'fusion')
    expect(now.rival).toBe(4)
    for (const later of [2035, 2040, 2100, 1e9]) expect(frontierTerms(g, 'fusion', later), String(later)).toEqual(now)
  })

  it('does not let an old year see a row of a later one', () => {
    const g = life(2040)
    rivalPushes(g, 'fusion', [2040, 2039])
    expect(frontierTerms(g, 'fusion', 2037).rival).toBe(0)
  })
})

describe('reads are pure and stable', () => {
  it('gives the same values twice, and draws nothing from g.rng or Math.random', () => {
    const g = life(2036)
    applyDisclosure(g, disc({ field: 'ai' }))
    rivalPushes(g, 'ai', [2035, 2036])
    const rng = g.rng
    const id = g.nextId
    const spy = vi.spyOn(Math, 'random')
    try {
      for (const f of FIELD_IDS) expect(frontierTerms(g, f), f).toEqual(frontierTerms(g, f))
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(id)
  })

  it('reads a deep-frozen state without a write', () => {
    const g = life(2036)
    applyDisclosure(g, disc({ field: 'ai' }))
    applyDisclosure(g, disc({ field: 'fusion', origin: 'f' }))
    rivalPushes(g, 'ai', [2035, 2036])
    const frozen = deepFreeze(structuredClone(g))
    const json = JSON.stringify(frozen)
    const rng = frozen.rng
    const id = frozen.nextId
    for (const f of FIELD_IDS) {
      expect(() => {
        frontierTerms(frozen, f)
        frontierTerms(frozen, f, 2034)
        fieldLine(frozen, f)
      }, f).not.toThrow()
    }
    expect(frozen.rng).toBe(rng)
    expect(frozen.nextId).toBe(id)
    expect(JSON.stringify(frozen)).toBe(json)
    expect(frontierTerms(frozen, 'ai.reasoning')).toEqual(frontierTerms(g, 'ai.reasoning'))
  })

  it('reads a deep-frozen state with no world and does not make one', () => {
    const frozen = deepFreeze(life())
    expect(frontierTerms(frozen, 'fusion')).toEqual(ZERO)
    expect(fieldLine(frozen, 'fusion')).toBe('Fusion power: on schedule.')
    expect(frozen.world).toBeUndefined()
  })

  it('gives the same numbers on a clone and after a JSON reload', () => {
    const g = life(2036)
    applyDisclosure(g, disc({ field: 'ai' }))
    rivalPushes(g, 'ai', [2035, 2036])
    const clone = structuredClone(g)
    const reload = JSON.parse(JSON.stringify(g)) as GameState
    for (const f of FIELD_IDS) {
      expect(frontierTerms(clone, f), f).toEqual(frontierTerms(g, f))
      expect(frontierTerms(reload, f), f).toEqual(frontierTerms(g, f))
    }
  })
})

describe('the reasons', () => {
  it('are the two words of the odds lines, as string literals', () => {
    expect(FRONTIER_REASONS).toEqual({ spill: 'public research', rival: 'rival pressure' })
    expect(Object.keys(FRONTIER_REASONS)).toEqual(['spill', 'rival'])
  })

  it('import nothing from effort/ (the seam is two numeric inputs on quote)', () => {
    const src = readFileSync(new URL('../src/game/world/frontier-terms.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*effort/)
    expect(src).not.toMatch(/\.rng\b|Math\.random|Date\./)
  })
})

describe('the words', () => {
  it('change at the five edges', () => {
    expect(frontierWords(0)).toBe('on schedule')
    expect(frontierWords(0.24)).toBe('on schedule')
    expect(frontierWords(0.25)).toBe('a little ahead of schedule')
    expect(frontierWords(0.99)).toBe('a little ahead of schedule')
    expect(frontierWords(1)).toBe('ahead of schedule')
    expect(frontierWords(2.99)).toBe('ahead of schedule')
    expect(frontierWords(3)).toBe('well ahead of schedule')
    expect(frontierWords(5.99)).toBe('well ahead of schedule')
    expect(frontierWords(6)).toBe('far ahead of schedule')
    expect(frontierWords(12)).toBe('far ahead of schedule')
  })

  it('read a negative, a non-finite or a huge lead as plain words', () => {
    expect(frontierWords(-3)).toBe('on schedule')
    expect(frontierWords(Number.NaN)).toBe('on schedule')
    expect(frontierWords(Number.NEGATIVE_INFINITY)).toBe('on schedule')
    expect(frontierWords(1e9)).toBe('far ahead of schedule')
  })

  it('follow docs/VOICE.md: no dash, no banned phrase, nothing the tool flags', () => {
    for (const lead of [0, 0.25, 1, 3, 6]) {
      const w = frontierWords(lead)
      expect(w).not.toMatch(/[\u2014\u2013]/)
      expect(unitFlags(w, 'log'), w).toEqual([])
    }
  })
})

describe('the field line', () => {
  it('reads Label: words. with a capital letter', () => {
    const g = life()
    expect(fieldLine(g, 'fusion')).toBe('Fusion power: on schedule.')
    applyDisclosure(g, disc({ field: 'fusion', size: 1 }))
    expect(['Fusion power: ahead of schedule.', 'Fusion power: well ahead of schedule.']).toContain(fieldLine(g, 'fusion'))
    expect(fieldLine(g, 'ai.reasoning')).toBe('AI reasoning: on schedule.')
    expect(fieldLine(g, 'ai')).toBe('Frontier AI: on schedule.')
  })

  it('uses the words of the field own lead', () => {
    for (const [fold, words] of [
      [10, 'on schedule'],
      [50, 'a little ahead of schedule'],
      [150, 'ahead of schedule'],
      [450, 'well ahead of schedule'],
      [900, 'far ahead of schedule'],
    ] as const) {
      const g = lifeWith(shardOf({ drug: rec({ fold, ly: 2030 }) }))
      expect(fieldLine(g, 'drug'), String(fold)).toBe(`New drugs: ${words}.`)
    }
  })

  it('is at most 90 characters for all 20 fields at every lead, with no dash, and nothing the voice tool flags', () => {
    for (const fold of [0, 30, 150, 450, 1200]) {
      const g = lifeWith(shardOf(Object.fromEntries(FIELD_IDS.filter((f) => FIELDS[f].lead).map((f) => [f, rec({ fold })])) as FrontierShard['f']))
      for (const f of FIELD_IDS) {
        const line = fieldLine(g, f)
        expect(line.length, line).toBeGreaterThan(0)
        expect(line.length, line).toBeLessThanOrEqual(90)
        expect(line, line).not.toMatch(/[\u2014\u2013]/)
        expect(line.startsWith(fieldLabel(f).charAt(0).toUpperCase() + fieldLabel(f).slice(1)), line).toBe(true)
        expect(line.endsWith('.'), line).toBe(true)
        expect(unitFlags(line, 'log'), line).toEqual([])
      }
    }
  })

  it('is empty for a field that is not one, and reads a hostile shard as on schedule', () => {
    const g = life()
    expect(fieldLine(g, 'constructor' as FieldId)).toBe('')
    expect(fieldLine(g, '__proto__' as FieldId)).toBe('')
    expect(fieldLine(lifeWith({ v: 9 }), 'fusion')).toBe('Fusion power: on schedule.')
  })
})
