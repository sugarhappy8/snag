// ci: fast
// R1-P8 (J.1, decision D25): the advisory depth rubric. The registry in test/depth-registry.ts scores business and the
// eleven careers on 17 dimensions (digest J, section 3). Until R12 it only prints the table: the one thing that fails
// a build is a malformed entry. The gate rules (no dimension under 2, 14 or more threes, 45 of 51) are proven here on
// synthetic entries, so R12 can flip ENFORCE_GATE without finding out then that the rules were wrong.
//
// Releases R3 to R11 raise one entry's scores each, so nothing here may pin a real entry's scores. The pinned numbers
// are the v4.0.2 baselines, which never move.
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_MUST_BE_3,
  DEPTH,
  DIMENSIONS,
  ENFORCE_GATE,
  GATE,
  below,
  formatDepthTable,
  gateStatus,
  threes,
  total,
  type DepthEntry,
  type DimKey,
  type ModuleId,
  type Score,
} from './depth-registry'

const IDS: readonly ModuleId[] = [
  'business',
  'actor',
  'astronaut',
  'model',
  'musician',
  'author',
  'influencer',
  'politician',
  'sports',
  'gameIndustry',
  'hustler',
  'military',
]

const KEYS: readonly DimKey[] = [
  'ladder',
  'field',
  'money',
  'assets',
  'team',
  'law',
  'crises',
  'research',
  'reports',
  'fog',
  'exit',
  'automation',
  'history',
  'news',
  'showcase',
  'text',
  'tests',
]

/** Digest J's column totals at v4.0.2, summed from its table. The registry's baselines must equal these. */
const PINNED_BASELINE: Record<ModuleId, number> = {
  business: 43,
  actor: 34,
  astronaut: 31,
  model: 32,
  musician: 36,
  author: 17,
  influencer: 14,
  politician: 34,
  sports: 30,
  gameIndustry: 32,
  hustler: 8,
  military: 18,
}

/** Digest J's business column, in DIMENSIONS order. Used for the one fixed "43" check, since the real entry will rise. */
const BUSINESS_AT_V402: readonly Score[] = [3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 3, 3, 3, 2, 1, 2, 3]

const DASH = /[\u2013\u2014]/

function idx(key: DimKey): number {
  return KEYS.indexOf(key)
}

function entry(scores: readonly number[], over: Partial<DepthEntry> = {}): DepthEntry {
  return {
    id: 'actor',
    label: 'Synthetic',
    baseline: 0,
    scores: scores as readonly Score[],
    metrics: {},
    evidence: {},
    substitute: {},
    ...over,
  }
}

/** Seventeen copies of one score, then the named dimensions changed. */
function scoresOf(base: Score, changes: Partial<Record<DimKey, Score>> = {}): Score[] {
  const out: Score[] = KEYS.map(() => base)
  for (const key of KEYS) {
    const s = changes[key]
    if (s !== undefined) out[idx(key)] = s
  }
  return out
}

/** Everything the shape check holds against one entry. An empty list means the entry is well formed. */
function malformed(e: DepthEntry): string[] {
  const out: string[] = []
  const at = `${e.id}:`
  if (e.scores.length !== DIMENSIONS.length) {
    out.push(`${at} needs ${DIMENSIONS.length} scores, has ${e.scores.length}`)
  } else {
    e.scores.forEach((s, i) => {
      if (!Number.isInteger(s) || s < 0 || s > 3) out.push(`${at} score ${i + 1} is ${String(s)}, not an integer from 0 to 3`)
    })
  }
  if (!Number.isInteger(e.baseline) || e.baseline < 0 || e.baseline > GATE.max) out.push(`${at} baseline ${String(e.baseline)} is not 0 to ${GATE.max}`)
  if (!e.label || DASH.test(e.label)) out.push(`${at} label is empty or has a dash`)
  for (const field of ['evidence', 'substitute'] as const) {
    for (const [key, text] of Object.entries(e[field])) {
      if (!KEYS.includes(key as DimKey)) out.push(`${at} ${field} names ${key}, which is not a dimension`)
      if (typeof text !== 'string' || text.length === 0) out.push(`${at} ${field}.${key} is empty`)
      else if (text.length > 140) out.push(`${at} ${field}.${key} is ${text.length} characters, cap 140`)
      else if (DASH.test(text)) out.push(`${at} ${field}.${key} has a dash`)
    }
  }
  for (const [name, n] of Object.entries(e.metrics)) {
    if (!['rungs', 'rows', 'rules'].includes(name)) out.push(`${at} metrics.${name} is not a known metric`)
    else if (!Number.isInteger(n) || (n as number) < 0) out.push(`${at} metrics.${name} is ${String(n)}, not a nonnegative integer`)
  }
  return out
}

describe('depth rubric: registry shape', () => {
  it('has the 12 modules once each, in the agreed order', () => {
    expect(DEPTH.map((e) => e.id)).toEqual(IDS)
    expect(new Set(DEPTH.map((e) => e.id)).size).toBe(12)
    expect(new Set(DEPTH.map((e) => e.label)).size).toBe(12)
  })

  it('gives every entry 17 integer scores from 0 to 3', () => {
    for (const e of DEPTH) {
      expect(e.scores, e.id).toHaveLength(17)
      for (const s of e.scores) {
        expect(Number.isInteger(s), e.id).toBe(true)
        expect(s, e.id).toBeGreaterThanOrEqual(0)
        expect(s, e.id).toBeLessThanOrEqual(3)
      }
    }
  })

  it('keeps each baseline equal to the digest J total at v4.0.2', () => {
    for (const e of DEPTH) expect(e.baseline, e.id).toBe(PINNED_BASELINE[e.id])
    expect(DEPTH.reduce((sum, e) => sum + e.baseline, 0)).toBe(Object.values(PINNED_BASELINE).reduce((a, b) => a + b, 0))
  })

  it('keeps evidence and substitute short, plain and keyed by real dimensions; metrics are counts', () => {
    for (const e of DEPTH) {
      for (const text of [...Object.values(e.evidence), ...Object.values(e.substitute)]) {
        expect(text.length, e.id).toBeLessThanOrEqual(140)
        expect(DASH.test(text), `${e.id}: ${text}`).toBe(false)
      }
      for (const key of [...Object.keys(e.evidence), ...Object.keys(e.substitute)]) expect(KEYS, e.id).toContain(key)
      for (const n of Object.values(e.metrics)) {
        expect(Number.isInteger(n), e.id).toBe(true)
        expect(n, e.id).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('lists 17 dimensions with unique keys, n from 1 to 17, a label and a bar of at most 140 characters', () => {
    expect(DIMENSIONS).toHaveLength(17)
    expect(DIMENSIONS.map((d) => d.key)).toEqual(KEYS)
    expect(DIMENSIONS.map((d) => d.n)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1))
    expect(new Set(DIMENSIONS.map((d) => d.key)).size).toBe(17)
    expect(new Set(DIMENSIONS.map((d) => d.label)).size).toBe(17)
    for (const d of DIMENSIONS) {
      expect(d.label.length, d.key).toBeGreaterThan(0)
      expect(d.bar.length, d.key).toBeGreaterThan(0)
      expect(d.bar.length, d.key).toBeLessThanOrEqual(140)
      expect(DASH.test(d.label + d.bar), d.key).toBe(false)
    }
  })

  it('finds no problem in the real registry', () => {
    expect(DEPTH.flatMap(malformed)).toEqual([])
  })

  it('does catch a malformed entry (the check above is not vacuous)', () => {
    const good = entry(scoresOf(2))
    expect(malformed(good)).toEqual([])
    expect(malformed(entry(scoresOf(2).slice(0, 16)))).toHaveLength(1)
    expect(malformed(entry([...scoresOf(2).slice(0, 16), 4]))).toHaveLength(1)
    expect(malformed(entry([...scoresOf(2).slice(0, 16), 1.5]))).toHaveLength(1)
    expect(malformed({ ...good, baseline: -1 })).toHaveLength(1)
    expect(malformed({ ...good, evidence: { ladder: 'x'.repeat(141) } })).toHaveLength(1)
    expect(malformed({ ...good, evidence: { ladder: 'a \u2014 b' } })).toHaveLength(1)
    expect(malformed({ ...good, substitute: { automation: 'a \u2013 b' } })).toHaveLength(1)
    expect(malformed({ ...good, evidence: { nope: 'fine' } as unknown as DepthEntry['evidence'] })).toHaveLength(1)
    expect(malformed({ ...good, metrics: { rungs: -1 } })).toHaveLength(1)
    expect(malformed({ ...good, metrics: { rows: 2.5 } })).toHaveLength(1)
    expect(malformed({ ...good, metrics: { rungs: 5, rows: 20, rules: 6 } })).toEqual([])
  })
})

describe('depth rubric: total, threes, below', () => {
  // ladder 3, field 2, money 1, assets 0, team 3, then twelve twos.
  const e = entry([3, 2, 1, 0, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2])

  it('adds the scores', () => {
    expect(total(e)).toBe(3 + 2 + 1 + 0 + 3 + 12 * 2)
    expect(total(entry(scoresOf(3)))).toBe(51)
    expect(total(entry(scoresOf(0)))).toBe(0)
  })

  it('counts the threes', () => {
    expect(threes(e)).toBe(2)
    expect(threes(entry(scoresOf(3)))).toBe(17)
    expect(threes(entry(scoresOf(2)))).toBe(0)
  })

  it('names the dimensions under a minimum, in rubric order', () => {
    expect(below(e, 2)).toEqual(['money', 'assets'])
    expect(below(e, 1)).toEqual(['assets'])
    expect(below(e, 0)).toEqual([])
    expect(below(e, 3)).toEqual(KEYS.filter((k) => k !== 'ladder' && k !== 'team'))
  })

  it('does not change the entry', () => {
    const before = JSON.stringify(e)
    total(e)
    threes(e)
    below(e, 2)
    expect(JSON.stringify(e)).toBe(before)
  })
})

describe('depth rubric: gateStatus', () => {
  it('passes an entry with every dimension at 3', () => {
    expect(gateStatus(entry(scoresOf(3)))).toEqual({ ok: true, failing: [] })
  })

  it('passes the least entry D25 allows: 14 threes, the rest twos, total 45 or more', () => {
    const scores = KEYS.map((_, i): Score => (i < 14 ? 3 : 2))
    expect(total(entry(scores))).toBe(48)
    expect(gateStatus(entry(scores))).toEqual({ ok: true, failing: [] })
  })

  it('fails one dimension at 1 and names it', () => {
    const g = gateStatus(entry(scoresOf(3, { law: 1 })))
    expect(g.ok).toBe(false)
    expect(g.failing).toEqual(['law: 1 is under 2'])
  })

  it('fails a dimension at 0 and names every dimension under 2 once', () => {
    const g = gateStatus(entry(scoresOf(3, { fog: 0, assets: 1 })))
    expect(g.ok).toBe(false)
    expect(g.failing).toEqual(['assets: 1 is under 2', 'fog: 0 is under 2'])
  })

  it('fails 13 threes', () => {
    const scores = KEYS.map((_, i): Score => (i < 13 ? 3 : 2))
    expect(total(entry(scores))).toBe(47)
    const g = gateStatus(entry(scores))
    expect(g.ok).toBe(false)
    expect(g.failing).toEqual(['threes: 13 of 14 needed'])
  })

  it('fails a total of 44', () => {
    // Ten threes and seven twos: no dimension under 2, but 44 points.
    const scores = KEYS.map((_, i): Score => (i < 10 ? 3 : 2))
    expect(total(entry(scores))).toBe(44)
    const g = gateStatus(entry(scores))
    expect(g.ok).toBe(false)
    expect(g.failing).toContain('total: 44 of 45 needed')
    expect(g.failing).toContain('threes: 10 of 14 needed')
  })

  it('never fails the total alone: 14 threes and three twos already make 48', () => {
    for (let t = 0; t <= 17; t++) {
      const scores = KEYS.map((_, i): Score => (i < t ? 3 : 2))
      const g = gateStatus(entry(scores))
      if (total(entry(scores)) < GATE.minTotal) expect(g.failing.length, `t=${t}`).toBeGreaterThan(1)
    }
  })

  it('holds business to 3 on research, reports, fog, news, showcase and text', () => {
    const biz = (changes: Partial<Record<DimKey, Score>>) => entry(scoresOf(3, changes), { id: 'business' })
    for (const key of BUSINESS_MUST_BE_3) {
      const g = gateStatus(biz(Object.fromEntries([[key, 2 as Score]])))
      expect(g.ok, key).toBe(false)
      expect(g.failing, key).toEqual([`${key}: 2, business needs 3`])
    }
    // A dimension business is not held to may sit at 2.
    expect(gateStatus(biz({ ladder: 2 }))).toEqual({ ok: true, failing: [] })
  })

  it('names a business dimension once even when it is under 2 as well', () => {
    const g = gateStatus(entry(scoresOf(3, { fog: 1, showcase: 2 }), { id: 'business' }))
    expect(g.failing).toEqual(['fog: 1, business needs 3', 'showcase: 2, business needs 3'])
  })

  it('does not hold a career to the business-only rule', () => {
    expect(gateStatus(entry(scoresOf(3, { research: 2, fog: 2 }), { id: 'actor' })).ok).toBe(true)
  })

  it('lists the dimension messages in rubric order, then threes, then total', () => {
    const g = gateStatus(entry(scoresOf(1, { ladder: 3 })))
    expect(g.ok).toBe(false)
    expect(g.failing[0]).toBe('field: 1 is under 2')
    expect(g.failing.slice(-2)).toEqual(['threes: 1 of 14 needed', 'total: 19 of 45 needed'])
    expect(g.failing).toHaveLength(16 + 2)
  })

  it('does not change the entry', () => {
    const e = entry(scoresOf(2))
    const before = JSON.stringify(e)
    gateStatus(e)
    expect(JSON.stringify(e)).toBe(before)
  })
})

describe('depth rubric: the gate stays off until R12', () => {
  it('pins the gate rules to D25', () => {
    expect(GATE).toEqual({ minEach: 2, minThrees: 14, minTotal: 45, max: 51 })
    expect(GATE.max).toBe(DIMENSIONS.length * 3)
    expect([...BUSINESS_MUST_BE_3]).toEqual(['research', 'reports', 'fog', 'news', 'showcase', 'text'])
  })

  it('has ENFORCE_GATE false', () => {
    // R12 flips this and the real-registry assertion below.
    expect(ENFORCE_GATE).toBe(false)
  })
})

describe('depth rubric: advisory table', () => {
  it('prints the table, warns on a score below its baseline, and gates only when ENFORCE_GATE is true', () => {
    console.log(`\nDepth rubric, advisory until R12 (gate: none under ${GATE.minEach}, ${GATE.minThrees}+ threes, ${GATE.minTotal} of ${GATE.max})\n${formatDepthTable(DEPTH)}\n`)
    for (const e of DEPTH) {
      if (total(e) < e.baseline) console.warn(`depth warning: ${e.id} scores ${total(e)}, under its v4.0.2 baseline of ${e.baseline}`)
    }
    if (ENFORCE_GATE) {
      for (const e of DEPTH) expect(gateStatus(e).failing, e.id).toEqual([])
    }
    expect(DEPTH).toHaveLength(12)
  })
})

describe('depth rubric: formatDepthTable', () => {
  it('is deterministic and leaves the entries alone', () => {
    const before = JSON.stringify(DEPTH)
    const a = formatDepthTable(DEPTH)
    const b = formatDepthTable(DEPTH)
    expect(a).toBe(b)
    expect(JSON.stringify(DEPTH)).toBe(before)
  })

  it('has a header, 17 dimension rows, then Total, Threes, Under-2 and Gate', () => {
    const lines = formatDepthTable(DEPTH).split('\n')
    expect(lines).toHaveLength(1 + 17 + 4)
    for (const e of DEPTH) expect(lines[0], e.id).toContain(e.label)
    DIMENSIONS.forEach((d, i) => {
      expect(lines[1 + i]).toContain(d.label)
    })
    expect(lines.slice(-4).map((l) => l.split(/\s+/)[0])).toEqual(['Total', 'Threes', 'Under-2', 'Gate'])
  })

  it('shows each module its own scores and totals', () => {
    const lines = formatDepthTable(DEPTH).split('\n')
    const cells = (name: string): string[] => lines.find((l) => l.startsWith(name))!.trim().split(/\s+/).slice(1)
    expect(cells('Total')).toEqual(DEPTH.map((e) => String(total(e))))
    expect(cells('Threes')).toEqual(DEPTH.map((e) => String(threes(e))))
    expect(cells('Under-2')).toEqual(DEPTH.map((e) => String(below(e, 2).length)))
    expect(cells('Gate')).toEqual(DEPTH.map((e) => (gateStatus(e).ok ? 'pass' : 'fail')))
    DIMENSIONS.forEach((d, i) => {
      const row = lines[1 + i]!.trim().split(/\s+/)
      expect(row.slice(-DEPTH.length), d.key).toEqual(DEPTH.map((e) => String(e.scores[i])))
    })
  })

  it('shows 43 for business at the v4.0.2 scores', () => {
    const biz = entry(BUSINESS_AT_V402, { id: 'business', label: 'Business', baseline: 43 })
    expect(total(biz)).toBe(43)
    const text = formatDepthTable([biz])
    expect(text).toContain('Business')
    const totalRow = text.split('\n').find((l) => l.startsWith('Total'))!
    expect(totalRow.trim().split(/\s+/)).toEqual(['Total', '43'])
    expect(text.split('\n').find((l) => l.startsWith('Gate'))!.trim().split(/\s+/)).toEqual(['Gate', 'fail'])
  })

  it('pins the real business baseline at 43', () => {
    expect(DEPTH[0]!.id).toBe('business')
    expect(DEPTH[0]!.baseline).toBe(43)
    expect(formatDepthTable(DEPTH)).toContain('Business')
  })

  it('has no dash and no line past 160 characters', () => {
    const text = formatDepthTable(DEPTH)
    expect(DASH.test(text)).toBe(false)
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(160)
  })

  it('handles no entries and a short entry without throwing', () => {
    expect(() => formatDepthTable([])).not.toThrow()
    expect(() => formatDepthTable([entry([3, 3])])).not.toThrow()
  })
})
