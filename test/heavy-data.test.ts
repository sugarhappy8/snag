// The Heavy R&D catalogue: every industry has its five breakthroughs, each a kind of product of
// its own that no classic, variant or next-generation name of any industry can be mistaken for.
import { describe, expect, it } from 'vitest'
import { BREAKTHROUGHS, breakthroughByName, breakthroughsFor } from '../src/game/business/heavy-data'
import { INDUSTRIES } from '../src/game/business/industries'
import { familiesOf, lineInfo } from '../src/game/business/product-market'
import { hasDemandCurve } from '../src/game/business/product-data'
import { anachronismsIn } from '../src/game/events/era'

const IDS = Object.keys(INDUSTRIES)
const ALL = Object.entries(BREAKTHROUGHS).flatMap(([industry, list]) => list.map((b) => ({ industry, ...b })))
const EM_DASH = /—|–/

describe('Heavy R&D catalogue', () => {
  it('has exactly the industries of industries.ts, each with five entries', () => {
    expect(Object.keys(BREAKTHROUGHS).sort()).toEqual([...IDS].sort())
    for (const id of IDS) expect(breakthroughsFor(id).length, id).toBe(5)
  })

  it('has unique names of at most 40 characters', () => {
    const seen = new Set<string>()
    for (const b of ALL) {
      expect(b.name.length, b.name).toBeGreaterThan(0)
      expect(b.name.length, b.name).toBeLessThanOrEqual(40)
      expect(b.name, b.name).toBe(b.name.trim())
      expect(seen.has(b.name), `duplicate ${b.name}`).toBe(false)
      seen.add(b.name)
    }
    expect(seen.size).toBe(ALL.length)
  })

  it('gives every entry a year between 1900 and 2040', () => {
    for (const b of ALL) {
      expect(Number.isInteger(b.first), b.name).toBe(true)
      expect(b.first, b.name).toBeGreaterThanOrEqual(1900)
      expect(b.first, b.name).toBeLessThanOrEqual(2040)
    }
  })

  it('does not mention anything that does not exist yet in its first year', () => {
    const bad: string[] = []
    for (const b of ALL) {
      for (const [what, text] of [['name', b.name], ['note', b.note]] as const) {
        const hits = anachronismsIn(text, b.first, ['us'])
        if (hits.length) bad.push(`${b.name} ${what} (${b.first}): ${hits.join(', ')}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('is a kind of product of its own in every industry', () => {
    for (const id of IDS) {
      const fams = familiesOf(id)
      for (const b of ALL) {
        expect(fams.includes(b.name), `${b.name} is a family of ${id}`).toBe(false)
        const info = lineInfo(b.name, id)
        expect(info.kind, `${b.name} in ${id}`).toBe('core')
        expect(info.family, `${b.name} in ${id}`).toBe(b.name)
        expect(info.gen, `${b.name} in ${id}`).toBe(1)
      }
    }
    for (const b of ALL) expect(hasDemandCurve(b.name), `${b.name} has a real-history curve`).toBe(false)
  })

  it('keeps notes to one plain sentence under 120 characters, with no em-dashes', () => {
    for (const b of ALL) {
      expect(b.note.length, b.name).toBeGreaterThan(10)
      expect(b.note.length, b.name).toBeLessThan(120)
      expect(b.note.endsWith('.'), b.name).toBe(true)
      expect(b.note.slice(0, -1).includes('. '), `${b.name} note has two sentences`).toBe(false)
      expect(b.note.includes(':'), `${b.name} note has a colon`).toBe(false)
      expect(b.note.trim(), b.name).toBe(b.note)
      expect(EM_DASH.test(b.name) || EM_DASH.test(b.note), `${b.name} has a dash`).toBe(false)
    }
  })

  it('uses unique notes', () => {
    expect(new Set(ALL.map((b) => b.note)).size).toBe(ALL.length)
  })

  it('looks every entry up by its name, and nothing else', () => {
    for (const b of ALL) {
      const hit = breakthroughByName(b.name)
      expect(hit, b.name).not.toBeNull()
      expect(hit?.name).toBe(b.name)
      expect(hit?.first).toBe(b.first)
      expect(hit?.note).toBe(b.note)
      expect(breakthroughsFor(b.industry).some((x) => x.name === b.name), b.name).toBe(true)
    }
    expect(breakthroughByName('Not A Breakthrough')).toBeNull()
    expect(breakthroughByName('')).toBeNull()
    expect(breakthroughByName('toString')).toBeNull()
    expect(breakthroughsFor('nowhere')).toEqual([])
    expect(breakthroughsFor('toString')).toEqual([])
  })
})
