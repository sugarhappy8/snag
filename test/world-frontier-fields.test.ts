// ci: fast
// R3-F1 (C.6 a): the field table of the world frontier (src/game/world/frontier-fields.ts). 20 fields: the 12 future-facing wave kinds
// and the 8 AI capabilities. The table is a literal in a world file (L2 may not import business/), so these tests are what keeps it
// equal to the data it mirrors: the wave kinds (business/tech-wave-data.ts, history/tech-waves.ts) and the capability ids
// (business/ai-bench-data.ts). Every lookup takes own keys only, so a saved "constructor" or "__proto__" is nothing.
import { describe, expect, it } from 'vitest'
import { CAP_IDS } from '../src/game/business/ai-bench-data'
import { WAVE_KINDS } from '../src/game/business/tech-wave-data'
import { HISTORY_WAVES } from '../src/game/history/tech-waves'
import { FRONTIER_CAPS } from '../src/game/world/caps'
import { FIELDS, FIELD_IDS, fieldLabel, fieldOfCap, fieldOfKind, fieldOfTrade, isFieldId, parentField } from '../src/game/world/frontier-fields'

const HISTORY_KINDS = new Set<string>(HISTORY_WAVES.map((w) => w.kind))
const KINDS = Object.keys(WAVE_KINDS)
/** The kinds with no history row: the ones whose waves come after 2026. */
const FUTURE_KINDS = KINDS.filter((k) => !HISTORY_KINDS.has(k))

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const HOSTILE = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype', '', ' ', 'AI', 'Fusion', 'ai.', 'ai.ai.reasoning', 'ai.reasoning ']

describe('the field table', () => {
  it('has the 20 fields, once each, and room for 32 (FRONTIER_CAPS.fields)', () => {
    expect(FIELD_IDS).toHaveLength(20)
    expect(new Set(FIELD_IDS).size).toBe(20)
    expect(FRONTIER_CAPS.fields).toBe(32)
    expect(FIELD_IDS.length).toBeLessThanOrEqual(FRONTIER_CAPS.fields)
    expect(Object.keys(FIELDS).sort()).toEqual([...FIELD_IDS].sort())
    for (const id of FIELD_IDS) expect(FIELDS[id].id).toBe(id)
  })

  it('has the 12 future-facing kinds: exactly the wave kinds that have no history row', () => {
    expect(FUTURE_KINDS).toHaveLength(12)
    const ours = FIELD_IDS.filter((id) => !id.includes('.')).sort()
    expect(ours).toEqual([...FUTURE_KINDS].sort())
    for (const kind of FUTURE_KINDS) {
      expect(isFieldId(kind), kind).toBe(true)
      expect(FIELDS[kind as keyof typeof FIELDS].lead, kind).toBe(true)
    }
  })

  it('has the 8 AI capabilities as `ai.<cap>` fields, spill only, and their parent is `ai`', () => {
    const caps = FIELD_IDS.filter((id) => id.startsWith('ai.')).sort()
    expect(caps).toEqual(CAP_IDS.map((c) => `ai.${c}`).sort())
    expect(caps).toHaveLength(8)
    for (const id of caps) {
      expect(FIELDS[id as keyof typeof FIELDS].lead, id).toBe(false)
      expect(parentField(id as 'ai.coding'), id).toBe('ai')
    }
    for (const id of FIELD_IDS.filter((x) => !x.startsWith('ai.'))) {
      expect(parentField(id), id).toBeNull()
      expect(FIELDS[id].lead, id).toBe(true)
    }
  })

  it('gives every field a label of at most 30 characters, with no dash and no digit-only text', () => {
    for (const id of FIELD_IDS) {
      const label = fieldLabel(id)
      expect(label.length, id).toBeGreaterThan(2)
      expect(label.length, id).toBeLessThanOrEqual(30)
      expect(DASH.test(label), id).toBe(false)
      expect(label, id).toBe(label.trim())
      expect(label).toBe(FIELDS[id].label)
    }
    expect(fieldLabel('fusion')).toBe('fusion power')
    expect(fieldLabel('ai.reasoning')).toBe('AI reasoning')
    expect(new Set(FIELD_IDS.map(fieldLabel)).size).toBe(20)
  })
})

describe('isFieldId', () => {
  it('is true for the 20 ids and false for anything else, own keys only', () => {
    for (const id of FIELD_IDS) expect(isFieldId(id), id).toBe(true)
    for (const x of HOSTILE) expect(isFieldId(x), JSON.stringify(x)).toBe(false)
    for (const x of [null, undefined, 0, 1, NaN, {}, [], ['fusion'], true, Symbol('fusion')]) expect(isFieldId(x)).toBe(false)
  })
})

describe('fieldOfKind', () => {
  it('maps each of the 12 future-facing kinds to the field of the same name', () => {
    for (const kind of FUTURE_KINDS) expect(fieldOfKind(kind), kind).toBe(kind)
  })

  it('maps a history kind, an AI capability, junk and a prototype key to null', () => {
    for (const kind of KINDS.filter((k) => HISTORY_KINDS.has(k))) expect(fieldOfKind(kind), kind).toBeNull()
    for (const kind of ['cloud', 'smartphone', 'reasoning', 'ai.reasoning', ...HOSTILE]) expect(fieldOfKind(kind), kind).toBeNull()
    for (const x of [null, undefined, 3, {}, []] as unknown[]) expect(fieldOfKind(x as string)).toBeNull()
  })
})

describe('fieldOfTrade', () => {
  it('maps the core trade of each future-facing kind to that kind', () => {
    for (const kind of FUTURE_KINDS) {
      const core = WAVE_KINDS[kind as keyof typeof WAVE_KINDS].core
      expect(core, kind).toHaveLength(1)
      expect(fieldOfTrade(core[0]), `${kind} <- ${core[0]}`).toBe(kind)
    }
  })

  it('has the twelve trades of the table and nothing else', () => {
    expect(fieldOfTrade('aiLab')).toBe('ai')
    expect(fieldOfTrade('semiconductor')).toBe('chips')
    expect(fieldOfTrade('biotech')).toBe('drug')
    expect(fieldOfTrade('spaceTech')).toBe('space')
    expect(fieldOfTrade('electricVehicles')).toBe('ev')
    expect(fieldOfTrade('robotics')).toBe('automation')
    expect(fieldOfTrade('quantum')).toBe('quantum')
    expect(fieldOfTrade('cybersecurity')).toBe('security')
    expect(fieldOfTrade('fusion')).toBe('fusion')
    expect(fieldOfTrade('neurotech')).toBe('neuro')
    expect(fieldOfTrade('drones')).toBe('drones')
    expect(fieldOfTrade('carbonCapture')).toBe('carbon')
    for (const trade of ['cloud', 'dataCenter', 'software', 'bakery', 'clinic', ...HOSTILE]) expect(fieldOfTrade(trade), trade).toBeNull()
    for (const x of [null, undefined, 4, {}] as unknown[]) expect(fieldOfTrade(x as string)).toBeNull()
  })
})

describe('fieldOfCap', () => {
  it('maps each capability id to its `ai.` field', () => {
    for (const cap of CAP_IDS) expect(fieldOfCap(cap), cap).toBe(`ai.${cap}`)
    expect(fieldOfCap('reasoning')).toBe('ai.reasoning')
  })

  it('maps anything else to null', () => {
    for (const cap of ['ai', 'fusion', 'ai.reasoning', 'Reasoning', ...HOSTILE]) expect(fieldOfCap(cap), cap).toBeNull()
    for (const x of [null, undefined, 4, {}] as unknown[]) expect(fieldOfCap(x as string)).toBeNull()
  })
})

describe('parentField', () => {
  it('is null for a value that is not a field', () => {
    for (const x of HOSTILE) expect(parentField(x as 'ai'), x).toBeNull()
  })
})
