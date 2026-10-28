// ci: fast
// R4-S2 (D.2 a): the five axes, the trait bridge, the staff axes and the six voices (src/game/world/axes.ts). One pure module that
// says what a trait word means as numbers (ambition, honesty, empathy, risk, steadiness, 50 neutral), what numbers mean as words,
// and which of six narrator voices speaks. Nothing here is read by a played life in R4, so nothing a seeded life draws or a save
// holds can move through this file.
//
// The tables are design data (cross-check 3.3, X57): the tests below hold their SHAPE (ids, ranges, round trips, shares), the lead
// reads their VALUES before the task merges, and a later change to a value needs a RECORD_REASON and a row in moved-tests.md. The
// measured rates are printed (console.log) so the reader sees them: single words that come back, pairs that keep a word, voice
// shares on the 11^5 grid.
//
// A caller may hand any of these functions anything (a word list from a save, axes from a hostile record), so the hostile cases come
// early: they read as neutral or as the nearest bound and never throw. No pinned seed, no state, no draw.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STAFF_TRAITS } from '../src/game/business/flavor'
import { STAFF_DRIVE, staffDrive } from '../src/game/effort/persona'
import { isDiscreet, isGossip, temper } from '../src/game/events/will-core'
import { TRAITS } from '../src/game/people'
import type { Person } from '../src/game/types'
import {
  AXIS_IDS,
  LABEL_FLOOR,
  STAFF_AXES,
  TRAIT_AXES,
  TRAIT_SETS,
  VOICES,
  VOICE_PROTOTYPES,
  axesFromStaff,
  axesFromTraits,
  labelsFromAxes,
  voiceOf,
  type AxisId,
  type Axes,
} from '../src/game/world/axes'
import { deepFreeze } from './fuzz-kit'
import { layerOf } from './layer-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/world/axes.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

/** The 30 words a person is made of, plus the one the wealth rules add (`spoiled`): the 31 keys of TRAIT_AXES. */
const WORDS = [...TRAITS, 'spoiled']
const NEUTRAL: Axes = { ambition: 50, honesty: 50, empathy: 50, risk: 50, steadiness: 50 }
const DELTA_MAX = 35
const GRID = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

const isWhole = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n)
const cut = (n: number): number => Math.max(5, Math.min(95, n))
const delta = (row: Partial<Axes> | undefined, id: AxisId): number => row?.[id] ?? 0

/** The score the plan names: a word's deltas dotted with how far each axis is from 50. Written out here, independent of the module. */
function score(word: string, a: Axes): number {
  const row = TRAIT_AXES[word]
  return AXIS_IDS.reduce((s, id) => s + delta(row, id) * (a[id] - 50), 0)
}

/** A person with these words and nothing else, enough for the will-core readers (they read traits and data.entitlement). */
const wearing = (traits: string[]): Person => ({ traits, data: {} }) as unknown as Person

describe('the axes', () => {
  it('are five, in the order every stored tuple uses, and frozen', () => {
    expect([...AXIS_IDS]).toEqual(['ambition', 'honesty', 'empathy', 'risk', 'steadiness'])
    expect(Object.isFrozen(AXIS_IDS)).toBe(true)
  })

  it('the module sits in layer 2 and imports only effort/persona and the types', () => {
    expect(layerOf(FILE)).toBe(2)
    const text = readFileSync(join(ROOT, FILE), 'utf8')
    const targets = [...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]!)
    expect(targets).toContain('../effort/persona')
    for (const t of targets) expect(['../effort/persona', '../types'], t).toContain(t)
    // The 30 words are literals here: an import of people.ts (layer 3) would be upward, and the table test above holds them equal.
    expect(text).not.toMatch(/from '\.\.\/people'/)
  })

  it('the file has no long dash (docs/VOICE.md)', () => {
    expect(DASH.test(readFileSync(join(ROOT, FILE), 'utf8'))).toBe(false)
  })
})

describe('TRAIT_AXES: the table', () => {
  it('has the 30 words of TRAITS in their order, then spoiled: 31 entries', () => {
    expect(Object.keys(TRAIT_AXES)).toEqual(WORDS)
    expect(WORDS).toHaveLength(31)
    expect(new Set(WORDS).size).toBe(31)
  })

  it('holds whole deltas within +-35 on known axes only, and every word moves at least one axis', () => {
    for (const w of WORDS) {
      const row = TRAIT_AXES[w]!
      const keys = Object.keys(row)
      expect(keys.length, w).toBeGreaterThan(0)
      for (const k of keys) {
        expect(AXIS_IDS as readonly string[], `${w}.${k}`).toContain(k)
        const d = (row as Record<string, number>)[k]!
        expect(isWhole(d), `${w}.${k}`).toBe(true)
        expect(Math.abs(d), `${w}.${k}`).toBeLessThanOrEqual(DELTA_MAX)
        expect(d, `${w}.${k} is written only when it moves`).not.toBe(0)
      }
    }
  })

  it('tells words apart: no two share a row, and the table and its rows are frozen', () => {
    const rows = WORDS.map((w) => AXIS_IDS.map((id) => delta(TRAIT_AXES[w], id)).join(','))
    expect(new Set(rows).size).toBe(WORDS.length)
    expect(Object.isFrozen(TRAIT_AXES)).toBe(true)
    for (const w of WORDS) expect(Object.isFrozen(TRAIT_AXES[w]), w).toBe(true)
  })

  it('reads each word the way its name says (the sign of the axis it is about)', () => {
    const sign = (w: string, id: AxisId): number => Math.sign(delta(TRAIT_AXES[w], id))
    for (const w of ['honest', 'religious', 'loyal', 'kind', 'gullible']) expect(sign(w, 'honesty'), w).toBeGreaterThan(0)
    for (const w of ['sneaky', 'manipulative', 'jealous', 'flirty', 'arrogant']) expect(sign(w, 'honesty'), w).toBeLessThan(0)
    for (const w of ['kind', 'caring', 'generous', 'outgoing', 'loyal']) expect(sign(w, 'empathy'), w).toBeGreaterThan(0)
    for (const w of ['grumpy', 'arrogant', 'stingy', 'jealous', 'spoiled']) expect(sign(w, 'empathy'), w).toBeLessThan(0)
    for (const w of ['ambitious', 'serious', 'nerdy']) expect(sign(w, 'ambition'), w).toBeGreaterThan(0)
    for (const w of ['lazy', 'shy', 'spoiled']) expect(sign(w, 'ambition'), w).toBeLessThan(0)
    for (const w of ['rebellious', 'hot-headed', 'flirty', 'funny', 'sporty']) expect(sign(w, 'risk'), w).toBeGreaterThan(0)
    for (const w of ['shy', 'anxious', 'stingy', 'religious', 'nerdy']) expect(sign(w, 'risk'), w).toBeLessThan(0)
    for (const w of ['calm', 'loyal', 'serious', 'sporty']) expect(sign(w, 'steadiness'), w).toBeGreaterThan(0)
    for (const w of ['anxious', 'hot-headed', 'dramatic', 'jealous', 'spoiled']) expect(sign(w, 'steadiness'), w).toBeLessThan(0)
  })
})

describe('axesFromTraits', () => {
  it('no words, or only words nobody knows, is 50 on every axis', () => {
    expect(axesFromTraits([])).toEqual(NEUTRAL)
    expect(axesFromTraits(['nostalgic'])).toEqual(NEUTRAL)
    expect(axesFromTraits(['nostalgic', 'unknown', ''])).toEqual(NEUTRAL)
  })

  it('one word is 50 plus its deltas, for each of the 31', () => {
    for (const w of WORDS) {
      const got = axesFromTraits([w])
      for (const id of AXIS_IDS) expect(got[id], `${w}.${id}`).toBe(cut(50 + delta(TRAIT_AXES[w], id)))
    }
  })

  it('two words add their deltas, in either order, and the sum is cut to 5..95', () => {
    for (const a of WORDS) {
      for (const b of WORDS) {
        const ab = axesFromTraits([a, b])
        expect(axesFromTraits([b, a])).toEqual(ab)
        for (const id of AXIS_IDS) expect(ab[id], `${a}+${b}.${id}`).toBe(a === b ? cut(50 + delta(TRAIT_AXES[a], id)) : cut(50 + delta(TRAIT_AXES[a], id) + delta(TRAIT_AXES[b], id)))
      }
    }
  })

  it('every word at once still lands on whole numbers inside 5..95', () => {
    const all = axesFromTraits(WORDS)
    for (const id of AXIS_IDS) {
      expect(isWhole(all[id]), id).toBe(true)
      expect(all[id], id).toBeGreaterThanOrEqual(5)
      expect(all[id], id).toBeLessThanOrEqual(95)
    }
  })

  it('a repeated word counts once, and a long list is bounded', () => {
    expect(axesFromTraits(['kind', 'kind', 'kind'])).toEqual(axesFromTraits(['kind']))
    expect(axesFromTraits(new Array(100_000).fill('kind'))).toEqual(axesFromTraits(['kind']))
    expect(axesFromTraits(new Array(100_000).fill('__proto__'))).toEqual(NEUTRAL)
  })

  it('reads hostile input as neutral and never throws', () => {
    const hostile: unknown[] = [
      null, undefined, 0, NaN, 1e9, -1, true, 'kind', {}, { length: 2, 0: 'kind', 1: 'calm' }, Object.create(null),
      [NaN], [1e9], [null, undefined], [{}], [['kind']], ['__proto__'], ['constructor'], ['toString', 'hasOwnProperty', 'valueOf'],
      [Symbol.iterator.toString()], ['kind '.repeat(5)],
    ]
    hostile.forEach((h, i) => {
      expect(() => axesFromTraits(h as string[]), `case ${i}`).not.toThrow()
      expect(axesFromTraits(h as string[]), `case ${i}`).toEqual(NEUTRAL)
    })
    // A hostile word beside a real one costs nothing: only the real one counts.
    expect(axesFromTraits(['__proto__', 'kind', 'constructor', NaN as unknown as string])).toEqual(axesFromTraits(['kind']))
  })

  it('takes no state and changes nothing it is given', () => {
    const words = deepFreeze(['kind', 'sneaky'])
    expect(() => axesFromTraits(words)).not.toThrow()
    expect(axesFromTraits(words)).toEqual(axesFromTraits(['kind', 'sneaky']))
    expect(axesFromTraits.length).toBe(1)
    expect(axesFromTraits(['calm'])).not.toBe(axesFromTraits(['calm']))
  })
})

describe('labelsFromAxes', () => {
  it('a neutral person, and one within a point or two of neutral, has no label', () => {
    expect(labelsFromAxes(NEUTRAL)).toEqual([])
    expect(labelsFromAxes({ ambition: 51, honesty: 49, empathy: 51, risk: 49, steadiness: 51 })).toEqual([])
    expect(labelsFromAxes({ ambition: 52, honesty: 48, empathy: 52, risk: 48, steadiness: 52 })).toEqual([])
    expect(LABEL_FLOOR).toBeGreaterThan(0)
  })

  it('gives at most n labels (2 by default), only words from TRAITS, none twice', () => {
    const a = axesFromTraits(['honest', 'calm', 'kind'])
    expect(labelsFromAxes(a).length).toBeLessThanOrEqual(2)
    expect(labelsFromAxes(a, 1)).toHaveLength(1)
    expect(labelsFromAxes(a, 0)).toEqual([])
    expect(labelsFromAxes(a, 3)).toHaveLength(3)
    const wide = labelsFromAxes(a, 1000)
    expect(wide.length).toBeLessThanOrEqual(TRAITS.length)
    expect(new Set(wide).size).toBe(wide.length)
    for (const w of wide) expect(TRAITS, w).toContain(w)
    expect(labelsFromAxes(a, 3).slice(0, 2)).toEqual(labelsFromAxes(a, 2))
    expect(labelsFromAxes(a, NaN)).toEqual(labelsFromAxes(a, 2))
    expect(labelsFromAxes(a, -4)).toEqual([])
    expect(labelsFromAxes(a, 1.9)).toHaveLength(1)
    expect(labelsFromAxes(a, '3' as unknown as number)).toEqual(labelsFromAxes(a, 2))
  })

  it('never answers spoiled: it is a state the wealth rules write, not a word a person is made of', () => {
    const spoiled = axesFromTraits(['spoiled'])
    expect(labelsFromAxes(spoiled, 30)).not.toContain('spoiled')
  })

  it('ranks by the dot product of a word with how far each axis is from 50, ties by TRAITS order, above the floor', () => {
    let ties = 0
    for (const id of AXIS_IDS) {
      for (const dev of [-40, -20, 20, 40]) {
        const a = { ...NEUTRAL, [id]: 50 + dev }
        const want = TRAITS.map((w, i) => ({ w, i, s: score(w, a) }))
          .filter((r) => r.s > LABEL_FLOOR)
          .sort((p, q) => q.s - p.s || p.i - q.i)
        for (let k = 1; k < want.length; k++) if (want[k]!.s === want[k - 1]!.s) ties++
        expect(labelsFromAxes(a, 30), `${id} ${dev}`).toEqual(want.map((r) => r.w))
      }
    }
    // The tie rule has something to decide on this table, so the cases above do not pass by never meeting a tie.
    expect(ties).toBeGreaterThan(0)
  })

  it('reads hostile axes as 50 where they are not numbers and cuts the rest to 0..100, never throwing', () => {
    const records: unknown[] = [
      null, undefined, 0, 'x', [], [1, 2, 3, 4, 5], {}, Object.create({ ambition: 99, honesty: 1 }),
      { ambition: NaN, honesty: 'a', empathy: null, risk: [], steadiness: {} },
      { ambition: Infinity, honesty: -Infinity, empathy: undefined, risk: '70', steadiness: NaN },
    ]
    for (const r of records) {
      expect(() => labelsFromAxes(r as Axes), String(r)).not.toThrow()
      expect(labelsFromAxes(r as Axes), String(r)).toEqual([])
    }
    const huge = { ambition: 1e9, honesty: -1e9, empathy: 50, risk: 50, steadiness: 1e300 }
    expect(labelsFromAxes(huge as Axes, 30)).toEqual(labelsFromAxes({ ambition: 100, honesty: 0, empathy: 50, risk: 50, steadiness: 100 }, 30))
  })

  it('changes nothing it is given', () => {
    const a = deepFreeze(axesFromTraits(['honest', 'calm']))
    expect(labelsFromAxes(a)).toEqual(labelsFromAxes({ ...a }))
    expect(labelsFromAxes(a)).toEqual(labelsFromAxes(a))
  })
})

describe('words and numbers round-trip', () => {
  it('a single word comes back as the first label for most of the 31 entries (the plan floor is 24)', () => {
    const missed: string[] = []
    let hits = 0
    for (const w of WORDS) {
      if (labelsFromAxes(axesFromTraits([w]))[0] === w) hits++
      else missed.push(w)
    }
    console.log(`R4-S2 label rate: ${hits} of ${WORDS.length} single words come back first (missed: ${missed.join(', ') || 'none'})`)
    expect(hits).toBeGreaterThanOrEqual(24)
  })

  it('every one of the 30 words of TRAITS comes back first (spoiled has no word to come back as)', () => {
    const missed = TRAITS.filter((w) => labelsFromAxes(axesFromTraits([w]))[0] !== w)
    expect(missed).toEqual([])
  })

  it('a pair of words keeps at least one of its two words among the two labels, for every pair of the 30', () => {
    const lost: string[] = []
    let pairs = 0
    for (let i = 0; i < TRAITS.length; i++) {
      for (let j = i + 1; j < TRAITS.length; j++) {
        pairs++
        const labels = labelsFromAxes(axesFromTraits([TRAITS[i]!, TRAITS[j]!]))
        if (!labels.includes(TRAITS[i]!) && !labels.includes(TRAITS[j]!)) lost.push(`${TRAITS[i]}+${TRAITS[j]}`)
      }
    }
    console.log(`R4-S2 pair rate: ${pairs - lost.length} of ${pairs} pairs keep a word${lost.length ? ` (lost: ${lost.join(', ')})` : ''}`)
    expect(pairs).toBe(435)
    expect(lost).toEqual([])
  })

  it('the same words give the same labels twice', () => {
    for (const w of TRAITS) expect(labelsFromAxes(axesFromTraits([w, 'calm']))).toEqual(labelsFromAxes(axesFromTraits([w, 'calm'])))
  })
})

describe('the six voices', () => {
  it('are warm, blunt, dry, anxious, grand and sly, frozen, with one prototype of five whole numbers each', () => {
    expect([...VOICES]).toEqual(['warm', 'blunt', 'dry', 'anxious', 'grand', 'sly'])
    expect(Object.isFrozen(VOICES)).toBe(true)
    expect(Object.keys(VOICE_PROTOTYPES)).toEqual([...VOICES])
    expect(Object.isFrozen(VOICE_PROTOTYPES)).toBe(true)
    const seen = new Set<string>()
    for (const v of VOICES) {
      const p = VOICE_PROTOTYPES[v]
      expect(p, v).toHaveLength(AXIS_IDS.length)
      for (const n of p) {
        expect(isWhole(n), v).toBe(true)
        expect(n, v).toBeGreaterThanOrEqual(0)
        expect(n, v).toBeLessThanOrEqual(100)
      }
      expect(Object.isFrozen(p), v).toBe(true)
      seen.add(p.join(','))
    }
    expect(seen.size).toBe(6)
  })

  it('each prototype speaks in its own voice, and a neutral person speaks dry', () => {
    for (const v of VOICES) {
      const p = VOICE_PROTOTYPES[v]
      const a = Object.fromEntries(AXIS_IDS.map((id, i) => [id, p[i]!])) as Axes
      expect(voiceOf(a), v).toBe(v)
    }
    expect(voiceOf(NEUTRAL)).toBe('dry')
  })

  it('an exact tie goes to the voice earlier in VOICES', () => {
    // The midpoint of two prototypes is exactly as near to both. Where no third voice is nearer, the earlier of the two speaks.
    const dist = (v: (typeof VOICES)[number], a: number[]): number => VOICE_PROTOTYPES[v].reduce((s, n, i) => s + (n - a[i]!) ** 2, 0)
    let tested = 0
    for (let i = 0; i < VOICES.length; i++) {
      for (let j = i + 1; j < VOICES.length; j++) {
        const mid = VOICE_PROTOTYPES[VOICES[i]!].map((n, k) => (n + VOICE_PROTOTYPES[VOICES[j]!][k]!) / 2)
        const others = VOICES.filter((_, k) => k !== i && k !== j)
        if (others.some((o) => dist(o, mid) <= dist(VOICES[i]!, mid))) continue
        tested++
        const a = Object.fromEntries(AXIS_IDS.map((id, k) => [id, mid[k]!])) as Axes
        expect(voiceOf(a), `${VOICES[i]} / ${VOICES[j]}`).toBe(VOICES[i])
      }
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('reach all six on the 11^5 grid, none holds more than 40%, and the count is the same twice', () => {
    const count = (): Record<string, number> => {
      const n: Record<string, number> = Object.fromEntries(VOICES.map((v) => [v, 0]))
      for (const a of GRID)
        for (const h of GRID)
          for (const e of GRID)
            for (const r of GRID)
              for (const s of GRID) n[voiceOf({ ambition: a, honesty: h, empathy: e, risk: r, steadiness: s })]!++
      return n
    }
    const first = count()
    const total = GRID.length ** 5
    expect(Object.values(first).reduce((s, n) => s + n, 0)).toBe(total)
    console.log(`R4-S2 voice shares on ${total} grid points: ${VOICES.map((v) => `${v} ${((100 * first[v]!) / total).toFixed(1)}%`).join(', ')}`)
    for (const v of VOICES) {
      expect(first[v], v).toBeGreaterThan(0)
      expect(first[v]! / total, v).toBeLessThanOrEqual(0.4)
    }
    expect(count()).toEqual(first)
  })

  it('reads hostile axes as 50 where they are not numbers, never throws, and always names one of the six', () => {
    const records: unknown[] = [
      null, undefined, 0, 'x', [], {}, Object.create({ ambition: 99 }),
      { ambition: NaN, honesty: 'a', empathy: null, risk: [], steadiness: {} },
      { ambition: 1e9, honesty: -1e9, empathy: Infinity, risk: -Infinity, steadiness: 1e300 },
    ]
    for (const r of records) {
      expect(() => voiceOf(r as Axes), String(r)).not.toThrow()
      expect(VOICES, String(r)).toContain(voiceOf(r as Axes))
    }
    expect(voiceOf({} as Axes)).toBe(voiceOf(NEUTRAL))
    expect(voiceOf({ ambition: 1e9, honesty: -1e9, empathy: 50, risk: 50, steadiness: 1e300 } as Axes)).toBe(
      voiceOf({ ambition: 100, honesty: 0, empathy: 50, risk: 50, steadiness: 100 }),
    )
  })

  it('takes a frozen input, takes no state, and is the same twice', () => {
    const a = deepFreeze({ ambition: 71.25, honesty: 12, empathy: 40, risk: 66, steadiness: 51 })
    expect(voiceOf(a)).toBe(voiceOf({ ...a }))
    expect(voiceOf.length).toBe(1)
  })
})

describe('STAFF_AXES', () => {
  it('has the 13 ids of STAFF_TRAITS and no others, the way STAFF_DRIVE does', () => {
    expect(STAFF_TRAITS).toHaveLength(13)
    expect(Object.keys(STAFF_AXES).sort()).toEqual(STAFF_TRAITS.map((t) => t.id).sort())
    expect(Object.keys(STAFF_AXES).sort()).toEqual(Object.keys(STAFF_DRIVE).sort())
  })

  it('holds whole deltas within +-35 on the four axes that are not ambition, and is frozen', () => {
    for (const t of STAFF_TRAITS) {
      const row = STAFF_AXES[t.id]!
      expect(Object.keys(row).length, t.id).toBeGreaterThan(0)
      for (const [k, d] of Object.entries(row)) {
        expect(AXIS_IDS as readonly string[], `${t.id}.${k}`).toContain(k)
        expect(k, `${t.id}: ambition is STAFF_DRIVE, never copied`).not.toBe('ambition')
        expect(isWhole(d), `${t.id}.${k}`).toBe(true)
        expect(Math.abs(d as number), `${t.id}.${k}`).toBeLessThanOrEqual(DELTA_MAX)
      }
      expect(Object.isFrozen(row), t.id).toBe(true)
    }
    expect(Object.isFrozen(STAFF_AXES)).toBe(true)
  })

  it('leans risk on the embezzlement weight of the trait: the same order, the same sign around the neutral 0.5', () => {
    for (const a of STAFF_TRAITS) {
      expect(Math.sign(delta(STAFF_AXES[a.id], 'risk')), `${a.id} sign`).toBe(Math.sign(a.risk - 0.5))
      for (const b of STAFF_TRAITS) {
        if (a.risk < b.risk) expect(delta(STAFF_AXES[a.id], 'risk'), `${a.id} <= ${b.id}`).toBeLessThanOrEqual(delta(STAFF_AXES[b.id], 'risk'))
      }
    }
    // The shady résumé is the one the risk table singles out, and it is the riskiest and the least honest of the thirteen.
    const risks = STAFF_TRAITS.map((t) => delta(STAFF_AXES[t.id], 'risk'))
    const honesty = STAFF_TRAITS.map((t) => delta(STAFF_AXES[t.id], 'honesty'))
    expect(delta(STAFF_AXES.shady, 'risk')).toBe(Math.max(...risks))
    expect(delta(STAFF_AXES.shady, 'honesty')).toBe(Math.min(...honesty))
  })
})

describe('axesFromStaff', () => {
  it('has the ambition of STAFF_DRIVE and 50 plus the deltas elsewhere, for each of the 13', () => {
    for (const t of STAFF_TRAITS) {
      const got = axesFromStaff(t.id)
      expect(got.ambition, t.id).toBe(staffDrive(t.id))
      expect(got.ambition, t.id).toBe(STAFF_DRIVE[t.id])
      for (const id of AXIS_IDS) {
        if (id === 'ambition') continue
        expect(got[id], `${t.id}.${id}`).toBe(cut(50 + delta(STAFF_AXES[t.id], id)))
        expect(isWhole(got[id]), `${t.id}.${id}`).toBe(true)
      }
    }
  })

  it('reads the drive when it is called, so a changed STAFF_DRIVE shows at once and no table bakes it in', () => {
    const text = readFileSync(join(ROOT, FILE), 'utf8')
    expect(text).not.toMatch(/ambition:\s*staffDrive/)
    const top = text.split('\n').filter((l) => /^(export )?(const|let) /.test(l))
    for (const l of top) expect(l, 'a module-level initializer reading the imported staffDrive').not.toMatch(/staffDrive/)
  })

  it('reads an id nobody knows, or no id, as neutral on every axis, ambition 50 too', () => {
    const hostile: unknown[] = [null, undefined, '', 'nobody', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 5, NaN, {}, [], ['steady']]
    for (const h of hostile) {
      expect(() => axesFromStaff(h as string), String(h)).not.toThrow()
      expect(axesFromStaff(h as string), String(h)).toEqual(NEUTRAL)
    }
  })
})

describe('TRAIT_SETS', () => {
  const sorted = (s: ReadonlySet<string>): string[] => [...s].sort()

  it('are the four sets of will-core.ts as they stood at v5.2.0, word for word', () => {
    expect(Object.keys(TRAIT_SETS)).toEqual(['forgiving', 'petulant', 'gossips', 'discreet'])
    expect(sorted(TRAIT_SETS.forgiving)).toEqual(['calm', 'caring', 'generous', 'kind', 'loyal', 'optimistic'])
    expect(sorted(TRAIT_SETS.petulant)).toEqual(['arrogant', 'dramatic', 'grumpy', 'hot-headed', 'jealous', 'manipulative', 'rebellious', 'spoiled', 'stingy'])
    expect(sorted(TRAIT_SETS.gossips)).toEqual(['dramatic', 'jealous', 'manipulative', 'outgoing', 'sneaky'])
    expect(sorted(TRAIT_SETS.discreet)).toEqual(['calm', 'honest', 'loyal', 'serious', 'shy'])
    expect(Object.isFrozen(TRAIT_SETS)).toBe(true)
  })

  it('answer what the will-core readers answer for every word (the readers S10 hands to these sets)', () => {
    for (const w of WORDS) {
      const p = wearing([w])
      const t = temper(p)
      expect(t.forgiving, `${w} forgiving`).toBe(TRAIT_SETS.forgiving.has(w) ? 1 : 0)
      expect(t.petulant, `${w} petulant`).toBe(TRAIT_SETS.petulant.has(w) ? 1 : 0)
      expect(isGossip(p), `${w} gossips`).toBe(TRAIT_SETS.gossips.has(w))
      expect(isDiscreet(p), `${w} discreet`).toBe(TRAIT_SETS.discreet.has(w))
    }
  })

  it('hold only words of the table', () => {
    for (const set of Object.values(TRAIT_SETS)) for (const w of set) expect(WORDS, w).toContain(w)
  })

  it('agree with the axes: forgivers are warmer and steadier than the petulant, the discreet more honest than the gossips', () => {
    const mean = (set: ReadonlySet<string>, f: (w: string) => number): number => [...set].reduce((s, w) => s + f(w), 0) / set.size
    const warm = (w: string): number => delta(TRAIT_AXES[w], 'empathy') + delta(TRAIT_AXES[w], 'steadiness')
    const straight = (w: string): number => delta(TRAIT_AXES[w], 'honesty')
    expect(mean(TRAIT_SETS.forgiving, warm)).toBeGreaterThan(mean(TRAIT_SETS.petulant, warm))
    expect(mean(TRAIT_SETS.discreet, straight)).toBeGreaterThan(mean(TRAIT_SETS.gossips, straight))
  })
})
