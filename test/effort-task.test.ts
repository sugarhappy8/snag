// ci: fast
// R3-E1 (C.1, the contract seed of the effort engine): the layer row, the constants, the task builder, the know-how map and the two
// hooks. Everything here is plain data and total readers: nothing draws a number and nothing books a dollar. The cases that matter
// most are the hostile ones, because a task is built from live numbers (a company's launch odds, a budget) and a map is read from a
// save: a bad value must be refused loudly at build time and cut quietly at read time, never reach a formula as NaN.
//
// The hook cases take a fresh copy of the module (vi.resetModules, then a dynamic import), like test/kernel-ports.test.ts, so a
// binding made in one case never leaks into the next.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '../src/game/types'
import * as L from '../src/game/effort/limits'
import { defineTask, isField, normalizeTask } from '../src/game/effort/task'
import { fadeKnowHow, knowHowOf, learnKnowHow, readKnowHow } from '../src/game/effort/knowhow'
import type { Fx, Reveal, StepCtx, Task, TaskSpec, TermKey } from '../src/game/effort/types'
import { layerOf } from './layer-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** An en-dash or an em-dash (written as code points so this file holds none). */
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const SPEC: TaskSpec = { field: 'rd.beverage', mode: 'project', cost: 50_000 }

/** The keys of a Task, so a field added to the interface without a default fails here (satisfies checks every name is a real key). */
const TASK_KEYS = [
  'field', 'mode', 'cost', 'hardness', 'baseYears', 'minYears', 'maxYears', 'kmax', 'p0', 'oddsExp', 'yearsExp', 'oddsLo', 'oddsHi',
  'fteCap', 'refCrew', 'crewPts', 'quality', 'hit', 'spread', 'partial', 'learn', 'knowYears',
] as const satisfies readonly (keyof Task)[]

describe('the layer row', () => {
  it('puts every file of src/game/effort in layer 2, so a domain imports it with no contract.ts', () => {
    for (const f of ['types', 'limits', 'task', 'knowhow', 'hooks', 'engine', 'curves', 'world', 'step', 'index', 'contract']) {
      expect(layerOf(`src/game/effort/${f}.ts`)).toBe(2)
    }
    expect(layerOf('src/game/effort/deep/x.ts')).toBe(2)
  })

  it('leaves the neighbours where they were', () => {
    expect(layerOf('src/game/economy/index.ts')).toBe(2)
    expect(layerOf('src/game/world/state.ts')).toBe(2)
    expect(layerOf('src/game/efforts/x.ts')).toBe(3)
    expect(layerOf('src/game/effort.ts')).toBe(3)
  })

  it('is written in the docs table too', () => {
    const doc = readFileSync(join(ROOT, 'docs', 'KERNEL.md'), 'utf8')
    expect(doc).toMatch(/\| L2 world \|[^\n]*`effort\/\*\*`/)
  })
})

describe('limits', () => {
  it('holds every number of the table', () => {
    expect({
      K_MIN: L.K_MIN, K_MAX: L.K_MAX, KNOW_MAX: L.KNOW_MAX, KNOW_HOW_FIELDS: L.KNOW_HOW_FIELDS, KNOW_FLOOR: L.KNOW_FLOOR,
      KNOW_FADE: L.KNOW_FADE, KNOW_BANK: L.KNOW_BANK, KNOW_ODDS_MAX: L.KNOW_ODDS_MAX, SPILL_PTS_MAX: L.SPILL_PTS_MAX,
      SPILL_TERM_MAX: L.SPILL_TERM_MAX, TOOLS_PTS: L.TOOLS_PTS, HARD_PTS: L.HARD_PTS, TIRED_PTS: L.TIRED_PTS, RIVAL_PTS: L.RIVAL_PTS,
      CREW_PTS_MAX: L.CREW_PTS_MAX, RHO_MIN: L.RHO_MIN, RHO_MAX: L.RHO_MAX, OVERTIME_PAY: L.OVERTIME_PAY, FATIGUE_KNEE: L.FATIGUE_KNEE,
      FATIGUE_SLOPE: L.FATIGUE_SLOPE, BURNOUT_F: L.BURNOUT_F, FTE_CAP_MAX: L.FTE_CAP_MAX, RISK_MAX: L.RISK_MAX, SHIFT_MAX: L.SHIFT_MAX,
      WIN_SHIFT: L.WIN_SHIFT, BURNOUT_SHIFT: L.BURNOUT_SHIFT, AMBITION_BASE: L.AMBITION_BASE, AGE_REVEAL: L.AGE_REVEAL,
      FOCUS_WEEKS: L.FOCUS_WEEKS, FOCUS_OVERTIME_MAX: L.FOCUS_OVERTIME_MAX, OVERTIME_STRAIN: L.OVERTIME_STRAIN, YEARS_GRACE: L.YEARS_GRACE,
    }).toEqual({
      K_MIN: 0.01, K_MAX: 4, KNOW_MAX: 100, KNOW_HOW_FIELDS: 40, KNOW_FLOOR: 0.5, KNOW_FADE: 0.95, KNOW_BANK: 0.35, KNOW_ODDS_MAX: 15,
      SPILL_PTS_MAX: 6, SPILL_TERM_MAX: 18, TOOLS_PTS: 6, HARD_PTS: 30, TIRED_PTS: 40, RIVAL_PTS: 8, CREW_PTS_MAX: 12, RHO_MIN: 0.85,
      RHO_MAX: 1.25, OVERTIME_PAY: 1.15, FATIGUE_KNEE: 35, FATIGUE_SLOPE: 0.004, BURNOUT_F: 85, FTE_CAP_MAX: 40, RISK_MAX: 0.08,
      SHIFT_MAX: 12, WIN_SHIFT: 0.4, BURNOUT_SHIFT: -1, AMBITION_BASE: 6, AGE_REVEAL: 18, FOCUS_WEEKS: 12, FOCUS_OVERTIME_MAX: 12,
      OVERTIME_STRAIN: 1.5, YEARS_GRACE: 0.25,
    })
  })

  it('holds the posture tables', () => {
    expect(L.POSTURE_FACTOR).toEqual({ lean: 0.6, steady: 1, push: 1.3 })
    expect(L.POSTURE_STRAIN).toEqual({ lean: -4, steady: 0, push: 10 })
    expect(() => {
      ;(L.POSTURE_FACTOR as { push: number }).push = 9
    }).toThrow()
  })

  it('keeps the bounds in order, so no term can undo another', () => {
    expect(L.K_MIN).toBeGreaterThan(0)
    expect(L.K_MIN).toBeLessThan(L.K_MAX)
    expect(L.RHO_MIN).toBeLessThan(1)
    expect(L.RHO_MAX).toBe(1.25) // "at most plus 25%" (the owner's R3 decision)
    expect(L.SPILL_PTS_MAX).toBeLessThanOrEqual(L.SPILL_TERM_MAX)
    expect(L.KNOW_ODDS_MAX).toBe(15) // failed research banks at most 15 odds points
    expect(L.FOCUS_WEEKS).toBe(12) // the pool of about 12 focus weeks
    expect(L.BURNOUT_F).toBeGreaterThan(L.FATIGUE_KNEE)
    expect(L.KNOW_FLOOR).toBeLessThan(L.KNOW_MAX)
  })

  it('labels every term, in the words of the odds line', () => {
    const keys: TermKey[] = ['team', 'funding', 'crew', 'tools', 'know', 'hard', 'rival', 'spill', 'bold', 'tired', 'ceo']
    expect(Object.keys(L.TERM_LABEL).sort()).toEqual([...keys].sort())
    expect(L.TERM_LABEL).toEqual({
      team: 'team', funding: 'funding', crew: 'crew', tools: 'tools', know: 'know-how', hard: 'hard field', rival: 'rival pressure',
      spill: 'public research', bold: 'bold plan', tired: 'tired', ceo: 'steady CEO',
    })
    expect(L.EASY_FIELD_LABEL).toBe('easy field')
  })

  it('writes no dash in a label (the voice guide)', () => {
    const all = [...Object.values(L.TERM_LABEL), L.EASY_FIELD_LABEL]
    for (const s of all) {
      expect(s).not.toMatch(DASH)
      expect(s.length).toBeLessThanOrEqual(24)
    }
  })

  it('holds no en-dash or em-dash in any file of the folder (the voice guide)', () => {
    const dir = join(ROOT, 'src', 'game', 'effort')
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    expect(files).toEqual(expect.arrayContaining(['types.ts', 'limits.ts', 'task.ts', 'knowhow.ts', 'hooks.ts']))
    for (const f of files) expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(DASH)
  })

  it('reads no import while the module loads (rule d), so it stays a leaf', () => {
    const src = readFileSync(join(ROOT, 'src', 'game', 'effort', 'limits.ts'), 'utf8')
    const imports = [...src.matchAll(/^import .*$/gm)].map((m) => m[0])
    for (const line of imports) expect(line).toMatch(/^import type /)
  })
})

describe('isField', () => {
  it('takes the shapes of a know-how key', () => {
    for (const f of ['a', 'rd.beverage', 'dt.aiLab.cap.reasoning', 'ops.x1', 'studio.engine', 'a'.repeat(40)]) expect(isField(f)).toBe(true)
  })

  it('refuses the rest', () => {
    for (const f of ['', 'A', '1a', '.a', '_a', 'a b', 'a-b', 'a_b', 'a'.repeat(41), '__proto__', 'a\n', 'é', 5, null, undefined, {}, ['a']]) {
      expect(isField(f)).toBe(false)
    }
  })
})

describe('defineTask', () => {
  it('fills the defaults of the plan', () => {
    const t = defineTask(SPEC)
    expect(t).toMatchObject({
      field: 'rd.beverage', mode: 'project', cost: 50_000, hardness: 1, minYears: 1, maxYears: 6, kmax: 4, oddsExp: 0.4, yearsExp: 0.5,
      oddsLo: 0.02, oddsHi: 0.98, fteCap: 6, crewPts: 6, spread: 8, partial: 0, learn: 12, knowYears: 0, refCrew: null, quality: null, hit: null,
    })
    expect(t.p0).toBeGreaterThan(0)
    expect(t.p0).toBeLessThan(1)
    expect(t.baseYears).toBeGreaterThan(0)
  })

  it('returns every key of the Task and nothing else, in a fixed order', () => {
    const t = defineTask(SPEC)
    expect(Object.keys(t)).toEqual([...TASK_KEYS])
  })

  it('keeps the numbers it is given exactly (parity needs the old constants bit for bit)', () => {
    const t = defineTask({
      ...SPEC, p0: 0.3141592653589793, baseYears: 2.5, minYears: 0.5, maxYears: 10, kmax: 3, oddsExp: 0.35, yearsExp: 0.55, oddsLo: 0.05,
      oddsHi: 0.95, hardness: 1.5, fteCap: 12, crewPts: 4, spread: 6, partial: 0.1, learn: 20, knowYears: 0.15,
      refCrew: { fte: 3, skill: 60 },
      quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 },
      hit: { p: 0.15, bonus: 10 },
    })
    expect(t.p0).toBe(0.3141592653589793)
    expect(t).toMatchObject({ baseYears: 2.5, minYears: 0.5, maxYears: 10, kmax: 3, oddsExp: 0.35, yearsExp: 0.55, oddsLo: 0.05, oddsHi: 0.95 })
    expect(t).toMatchObject({ hardness: 1.5, fteCap: 12, crewPts: 4, spread: 6, partial: 0.1, learn: 20, knowYears: 0.15 })
    expect(t.refCrew).toEqual({ fte: 3, skill: 60 })
    expect(t.quality).toEqual({ up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 })
    expect(t.hit).toEqual({ p: 0.15, bonus: 10 })
  })

  it('is deterministic and does not keep the spec it was given', () => {
    const spec: TaskSpec = { ...SPEC, quality: { up: 1, down: 1, exp: 1, ceiling: 90, room: 5, lo: 0, hi: 100 } }
    const a = defineTask(spec)
    const b = defineTask(spec)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    expect(a.quality).not.toBe(spec.quality)
    spec.quality!.up = 99
    expect(a.quality!.up).toBe(1)
  })

  it('returns a frozen task, so a shared definition cannot drift', () => {
    const t = defineTask({ ...SPEC, hit: { p: 0.1, bonus: 5 }, refCrew: { fte: 2, skill: 50 }, quality: { up: 1, down: 1, exp: 1, ceiling: 90, room: 5, lo: 0, hi: 100 } })
    expect(Object.isFrozen(t)).toBe(true)
    expect(Object.isFrozen(t.hit)).toBe(true)
    expect(Object.isFrozen(t.refCrew)).toBe(true)
    expect(Object.isFrozen(t.quality)).toBe(true)
    expect(() => {
      t.cost = 1
    }).toThrow()
  })

  it('throws on a cost that is not above 0', () => {
    for (const cost of [0, -1, -1e9, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => defineTask({ ...SPEC, cost })).toThrow(/cost/)
    expect(() => defineTask({ field: 'a', mode: 'project' } as unknown as TaskSpec)).toThrow(/cost/)
    expect(() => defineTask({ ...SPEC, cost: '5' as unknown as number })).toThrow(/cost/)
    expect(defineTask({ ...SPEC, cost: 0.01 }).cost).toBe(0.01)
  })

  it('throws on a kmax above K_MAX, and on one below K_MIN', () => {
    expect(() => defineTask({ ...SPEC, kmax: L.K_MAX + 0.01 })).toThrow(/kmax/)
    expect(() => defineTask({ ...SPEC, kmax: 400 })).toThrow(/kmax/)
    expect(() => defineTask({ ...SPEC, kmax: 0 })).toThrow(/kmax/)
    expect(() => defineTask({ ...SPEC, kmax: -2 })).toThrow(/kmax/)
    expect(defineTask({ ...SPEC, kmax: L.K_MAX }).kmax).toBe(4)
    expect(defineTask({ ...SPEC, kmax: 1 }).kmax).toBe(1)
    expect(defineTask({ ...SPEC, kmax: L.K_MIN }).kmax).toBe(L.K_MIN)
  })

  it('throws on a hardness outside .5 to 2', () => {
    for (const hardness of [0.49, 2.01, 0, -1, 10]) expect(() => defineTask({ ...SPEC, hardness })).toThrow(/hardness/)
    expect(defineTask({ ...SPEC, hardness: 0.5 }).hardness).toBe(0.5)
    expect(defineTask({ ...SPEC, hardness: 2 }).hardness).toBe(2)
  })

  it('throws on a fteCap above FTE_CAP_MAX, and on one that is not above 0', () => {
    expect(() => defineTask({ ...SPEC, fteCap: L.FTE_CAP_MAX + 1 })).toThrow(/fteCap/)
    expect(() => defineTask({ ...SPEC, fteCap: 4000 })).toThrow(/fteCap/)
    expect(() => defineTask({ ...SPEC, fteCap: 0 })).toThrow(/fteCap/)
    expect(defineTask({ ...SPEC, fteCap: L.FTE_CAP_MAX }).fteCap).toBe(40)
  })

  it('throws on a field that fails the pattern', () => {
    for (const field of ['', 'A', '1a', 'a b', 'a-b', 'a'.repeat(41), '__proto__', 'x\n']) {
      expect(() => defineTask({ ...SPEC, field })).toThrow(/field/)
    }
    expect(() => defineTask({ mode: 'project', cost: 5 } as unknown as TaskSpec)).toThrow(/field/)
    expect(() => defineTask({ ...SPEC, field: 7 as unknown as string })).toThrow(/field/)
    // Camel case and 40 characters: the trades (dt.aiLab.cap.reasoning) need both.
    expect(defineTask({ ...SPEC, field: 'dt.aiLab.cap.reasoning' }).field).toBe('dt.aiLab.cap.reasoning')
    expect(defineTask({ ...SPEC, field: 'a'.repeat(40) }).field).toHaveLength(40)
  })

  it('throws on a mode it does not know', () => {
    for (const mode of ['', 'Project', 'work', undefined, 3]) expect(() => defineTask({ ...SPEC, mode: mode as never })).toThrow(/mode/)
    for (const mode of ['project', 'practice', 'study', 'intel'] as const) expect(defineTask({ ...SPEC, mode }).mode).toBe(mode)
  })

  it('throws on a number that is not a number', () => {
    for (const key of ['p0', 'baseYears', 'minYears', 'maxYears', 'oddsExp', 'yearsExp', 'oddsLo', 'oddsHi', 'crewPts', 'spread', 'partial', 'learn', 'knowYears']) {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '3', null, {}]) {
        expect(() => defineTask({ ...SPEC, [key]: bad } as unknown as TaskSpec), `${key} = ${String(bad)}`).toThrow(new RegExp(key))
      }
    }
  })

  it('throws on a range that runs backwards, and on a base time that is not above 0', () => {
    expect(() => defineTask({ ...SPEC, minYears: 5, maxYears: 2 })).toThrow(/minYears/)
    expect(() => defineTask({ ...SPEC, oddsLo: 0.9, oddsHi: 0.1 })).toThrow(/oddsLo/)
    expect(() => defineTask({ ...SPEC, baseYears: 0 })).toThrow(/baseYears/)
    expect(() => defineTask({ ...SPEC, baseYears: -3 })).toThrow(/baseYears/)
    expect(() => defineTask({ ...SPEC, quality: { up: 1, down: 1, exp: 1, ceiling: 90, room: 0, lo: 80, hi: 10 } })).toThrow(/quality/)
  })

  it('cuts a number that is merely too big or too small to its documented range', () => {
    const t = defineTask({ ...SPEC, p0: 1.4, oddsExp: 9, yearsExp: -1, oddsLo: -0.2, oddsHi: 4, crewPts: 99, spread: 900, partial: 3, learn: -4, knowYears: 2, maxYears: 900 })
    expect(t).toMatchObject({ p0: 1, oddsExp: 2, yearsExp: 0, oddsLo: 0, oddsHi: 1, crewPts: L.CREW_PTS_MAX, spread: 50, partial: 0.5, learn: 0, knowYears: 0.15, maxYears: 50 })
    expect(defineTask({ ...SPEC, p0: -0.5 }).p0).toBe(0)
  })

  it('checks the crew, the quality curve and the hit when they are there', () => {
    expect(() => defineTask({ ...SPEC, refCrew: 'x' as never })).toThrow(/refCrew/)
    expect(() => defineTask({ ...SPEC, refCrew: { fte: Number.NaN, skill: 50 } })).toThrow(/refCrew/)
    expect(() => defineTask({ ...SPEC, quality: { up: Number.NaN } as never })).toThrow(/quality/)
    expect(() => defineTask({ ...SPEC, quality: [] as never })).toThrow(/quality/)
    expect(() => defineTask({ ...SPEC, hit: { p: 'x', bonus: 1 } as never })).toThrow(/hit/)
    expect(defineTask({ ...SPEC, refCrew: { fte: 0, skill: 0 } }).refCrew).toEqual({ fte: 0.1, skill: 1 })
    expect(defineTask({ ...SPEC, refCrew: { fte: 4000, skill: 500 } }).refCrew).toEqual({ fte: L.FTE_CAP_MAX, skill: 100 })
    expect(defineTask({ ...SPEC, hit: { p: 0.9, bonus: 12 } }).hit).toEqual({ p: 0.5, bonus: 12 })
    const q = defineTask({ ...SPEC, quality: { up: 28, down: 14, exp: 0, ceiling: 97, room: -3, lo: 5, hi: 97 } }).quality!
    expect(q.exp).toBeGreaterThan(0)
    expect(q.room).toBe(0)
    expect(defineTask({ ...SPEC, refCrew: null, quality: null, hit: null })).toMatchObject({ refCrew: null, quality: null, hit: null })
    expect(defineTask({ ...SPEC, refCrew: undefined }).refCrew).toBeNull()
  })

  it('refuses a spec that is not an object', () => {
    for (const bad of [null, undefined, 5, 'x', [], true]) expect(() => defineTask(bad as unknown as TaskSpec)).toThrow(/spec/)
  })

  it('ignores a key that is not a Task field, and an inherited one', () => {
    const t = defineTask({ ...SPEC, extra: 9, __proto__: { cost: 1, hardness: 2 } } as unknown as TaskSpec)
    expect(Object.keys(t)).toEqual([...TASK_KEYS])
    expect(t.hardness).toBe(1)
    const inherited = Object.create({ field: 'a.b', mode: 'project', cost: 7 }) as TaskSpec
    expect(() => defineTask(inherited)).toThrow(/field/)
  })
})

describe('normalizeTask', () => {
  it('is total: garbage gives null, never a throw', () => {
    const hostile = Object.defineProperty({ ...SPEC }, 'p0', {
      get() {
        throw new Error('boom')
      },
      enumerable: true,
    })
    const garbage: unknown[] = [null, undefined, 0, 1, 'task', true, [], [SPEC], {}, { field: 'A' }, { ...SPEC, cost: 0 }, { ...SPEC, cost: '9' }, { ...SPEC, kmax: 99 }, hostile, () => 1, Symbol('x')]
    for (const raw of garbage) expect(normalizeTask(raw)).toBeNull()
  })

  it('rebuilds a task from its own JSON, equal to the original', () => {
    const t = defineTask({
      ...SPEC, p0: 0.42, kmax: 3, refCrew: { fte: 4, skill: 55 }, quality: { up: 28, down: 14, exp: 0.8, ceiling: 97, room: 0, lo: 5, hi: 97 }, hit: { p: 0.15, bonus: 10 },
    })
    const back = normalizeTask(JSON.parse(JSON.stringify(t)))
    expect(back).toEqual(t)
    expect(back).not.toBe(t)
    expect(normalizeTask(t)).toEqual(t)
  })

  it('cuts a hostile record to a task or to null, and keeps the prototype clean', () => {
    const raw = JSON.parse('{"field":"rd.x","mode":"intel","cost":9,"hardness":1.2,"__proto__":{"cost":0,"polluted":true},"constructor":{"x":1},"extra":1}') as unknown
    const t = normalizeTask(raw)
    expect(t).not.toBeNull()
    expect(t).toMatchObject({ field: 'rd.x', mode: 'intel', cost: 9, hardness: 1.2 })
    expect(Object.keys(t!)).toEqual([...TASK_KEYS])
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    expect(normalizeTask({ ...SPEC, hardness: 7 })).toBeNull()
  })
})

describe('readKnowHow', () => {
  it('reads nothing as an empty map', () => {
    for (const raw of [null, undefined, 0, 7, 'x', true, [], [['a', 5]], () => 1]) expect(readKnowHow(raw)).toEqual({})
  })

  it('keeps field-shaped keys with a value from the floor to 100, rounded to 2 places', () => {
    expect(readKnowHow({ 'rd.a': 34.5678, b: 100, c: 0.5, d: 12 })).toEqual({ 'rd.a': 34.57, b: 100, c: 0.5, d: 12 })
  })

  it('cuts a value above 100 to 100, and drops everything that is not a usable amount', () => {
    const raw = { big: 1e9, huge: Number.POSITIVE_INFINITY, neg: -4, zero: 0, tiny: 0.3, nan: Number.NaN, str: '50', nul: null, obj: { a: 1 }, arr: [3], yes: true, ok: 20 }
    expect(readKnowHow(raw)).toEqual({ big: 100, ok: 20 })
  })

  it('drops keys that are not field-shaped, and __proto__ in particular', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":50},"Bad":5,"a b":5,"1x":5,"":5,"ok.x":5,"constructor":6,"toString":7}') as unknown
    const out = readKnowHow(raw)
    expect(out).toEqual({ 'ok.x': 5, constructor: 6, toString: 7 })
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as { polluted?: number }).polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false)
  })

  it('keeps at most KNOW_HOW_FIELDS keys, the biggest first, ties by name', () => {
    const raw: Record<string, number> = {}
    for (let i = 0; i < 500; i++) raw[`f${String(i).padStart(3, '0')}`] = 1 + (i % 50)
    const out = readKnowHow(raw)
    expect(Object.keys(out)).toHaveLength(L.KNOW_HOW_FIELDS)
    expect(Math.min(...Object.values(out))).toBeGreaterThanOrEqual(46) // 500 keys, ten of each value 1..50, so the top 40 are 47 to 50
    expect(Math.min(...Object.values(out))).toBe(47)
    const again = readKnowHow(raw)
    expect(again).toEqual(out)
    expect(Object.keys(again)).toEqual([...Object.keys(again)].sort()) // sorted, so JSON is stable whatever order the save had
  })

  it('is idempotent and leaves its input alone', () => {
    const raw = { b: 12.3456, a: 99.999, c: 0.2, __x: 4 } as Record<string, unknown>
    const copy = JSON.stringify(raw)
    const once = readKnowHow(raw)
    expect(JSON.stringify(raw)).toBe(copy)
    expect(readKnowHow(once)).toEqual(once)
    expect(once).not.toBe(raw)
  })
})

describe('knowHowOf', () => {
  const map = { 'rd.a': 40, constructor: 3 }

  it('reads a field, and 0 for one that is not there', () => {
    expect(knowHowOf(map, 'rd.a')).toBe(40)
    expect(knowHowOf(map, 'rd.b')).toBe(0)
  })

  it('does not read the prototype', () => {
    for (const f of ['toString', 'hasOwnProperty', '__proto__', 'valueOf']) expect(knowHowOf(map, f)).toBe(0)
    expect(knowHowOf(map, 'constructor')).toBe(3)
  })

  it('is total on a map that is not one', () => {
    for (const bad of [null, undefined, 5, 'x', []]) expect(knowHowOf(bad as never, 'rd.a')).toBe(0)
    expect(knowHowOf({ a: Number.NaN } as never, 'a')).toBe(0)
    expect(knowHowOf({ a: 500 } as never, 'a')).toBe(100)
    expect(knowHowOf({ a: -5 } as never, 'a')).toBe(0)
    expect(knowHowOf({ a: '9' } as never, 'a')).toBe(0)
  })
})

describe('learnKnowHow', () => {
  it('adds the gain and returns the new level', () => {
    const m: Record<string, number> = {}
    expect(learnKnowHow(m, 'rd.a', 20)).toBe(20)
    expect(learnKnowHow(m, 'rd.a', 15.556)).toBe(35.56)
    expect(m).toEqual({ 'rd.a': 35.56 })
  })

  it('never goes above KNOW_MAX', () => {
    const m: Record<string, number> = { a: 95 }
    expect(learnKnowHow(m, 'a', 1e9)).toBe(100)
    expect(learnKnowHow(m, 'a', 50)).toBe(100)
    expect(m).toEqual({ a: 100 })
  })

  it('ignores a gain that is not a positive number, and a field that is not a field', () => {
    const m: Record<string, number> = { a: 10 }
    for (const gain of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '9' as never]) expect(learnKnowHow(m, 'a', gain)).toBe(10)
    expect(learnKnowHow(m, 'Bad Field', 10)).toBe(0)
    expect(learnKnowHow(m, '__proto__', 10)).toBe(0)
    expect(m).toEqual({ a: 10 })
    expect(({} as { polluted?: number }).polluted).toBeUndefined()
  })

  it('does not store an amount under the floor', () => {
    const m: Record<string, number> = {}
    expect(learnKnowHow(m, 'a', 0.3)).toBe(0)
    expect(m).toEqual({})
  })

  it('holds at most KNOW_HOW_FIELDS fields: a new one displaces the smallest only if it is bigger', () => {
    const m: Record<string, number> = {}
    for (let i = 0; i < L.KNOW_HOW_FIELDS; i++) m[`f${String(i).padStart(2, '0')}`] = 10 + i
    expect(Object.keys(m)).toHaveLength(40)
    expect(learnKnowHow(m, 'extra', 5)).toBe(0) // smaller than the smallest (10): not kept
    expect(Object.keys(m)).toHaveLength(40)
    expect(m.extra).toBeUndefined()
    expect(learnKnowHow(m, 'extra', 30)).toBe(30) // bigger: the smallest (f00) goes
    expect(Object.keys(m)).toHaveLength(40)
    expect(m.f00).toBeUndefined()
    expect(m.extra).toBe(30)
    expect(learnKnowHow(m, 'f39', 1)).toBe(50) // a field already there is never displaced
    expect(Object.keys(m)).toHaveLength(40)
  })

  it('takes a null-prototype map', () => {
    const m = Object.create(null) as Record<string, number>
    expect(learnKnowHow(m, 'a', 12)).toBe(12)
    expect(knowHowOf(m, 'a')).toBe(12)
  })

  it('writes nothing at all on a map that is not an object', () => {
    for (const bad of [null, undefined, 5, 'x']) expect(learnKnowHow(bad as never, 'a', 10)).toBe(0)
  })
})

describe('fadeKnowHow', () => {
  it('fades the idle fields by KNOW_FADE and leaves the others', () => {
    const m: Record<string, number> = { a: 40, b: 40, c: 40 }
    fadeKnowHow(m, ['a', 'c'])
    expect(m).toEqual({ a: 38, b: 40, c: 38 })
  })

  it('drops a field that falls under the floor', () => {
    const m: Record<string, number> = { a: 0.5, b: 0.52, c: 10 }
    fadeKnowHow(m, ['a', 'b', 'c'])
    expect(m).toEqual({ c: 9.5 })
  })

  it('empties itself in the end (a forgotten field costs no key)', () => {
    const m: Record<string, number> = { a: 100 }
    let years = 0
    while (Object.keys(m).length > 0 && years < 500) {
      fadeKnowHow(m, ['a'])
      years++
    }
    expect(m).toEqual({})
    expect(years).toBeLessThan(150)
  })

  it('takes any iterable, counts a field once, and ignores a name that is not there', () => {
    const m: Record<string, number> = { a: 40 }
    fadeKnowHow(m, new Set(['a', 'zzz']))
    expect(m).toEqual({ a: 38 })
    fadeKnowHow(m, ['a', 'a', 'a'])
    expect(m).toEqual({ a: 36.1 })
    fadeKnowHow(m, [])
    expect(m).toEqual({ a: 36.1 })
  })

  it('is total on garbage', () => {
    const m: Record<string, number> = { a: 40 }
    for (const idle of [null, undefined, 5, 'abc', {}]) expect(() => fadeKnowHow(m, idle as never)).not.toThrow()
    expect(m.a).toBe(40) // a string is not a list of names, and nothing else is iterable
    for (const bad of [null, undefined, 5, 'x']) expect(() => fadeKnowHow(bad as never, ['a'])).not.toThrow()
    const dirty = { a: 'x', b: 40 } as unknown as Record<string, number>
    fadeKnowHow(dirty, ['a'])
    expect('a' in dirty).toBe(false)
  })
})

type Hooks = typeof import('../src/game/effort/hooks')
async function fresh(): Promise<Hooks> {
  vi.resetModules()
  return import('../src/game/effort/hooks')
}
const G = { year: 2026 } as unknown as GameState
const REVEALS: Reveal[] = [{ field: 'rd.a', strength: 0.5, kind: 'works' }]

describe('the reveal sink', () => {
  it('does nothing until something is bound', async () => {
    const { revealedSink } = await fresh()
    expect(revealedSink(G, REVEALS)).toBeUndefined()
  })

  it('runs the bound function with the same arguments', async () => {
    const { bindRevealed, revealedSink } = await fresh()
    const seen: [GameState, readonly Reveal[]][] = []
    bindRevealed((g, r) => {
      seen.push([g, r])
    })
    revealedSink(G, REVEALS)
    expect(seen).toEqual([[G, REVEALS]])
    expect(seen[0]![0]).toBe(G)
  })

  it('takes the same function twice and refuses a different one', async () => {
    const { bindRevealed, revealedSink } = await fresh()
    let n = 0
    const fn = (): void => {
      n++
    }
    bindRevealed(fn)
    bindRevealed(fn)
    expect(() => bindRevealed(() => undefined)).toThrow(/already bound/)
    revealedSink(G, REVEALS)
    expect(n).toBe(1)
  })

  it('refuses something that is not a function, and stays unbound', async () => {
    const { bindRevealed, revealedSink } = await fresh()
    expect(() => bindRevealed(5 as never)).toThrow(/function/)
    expect(revealedSink(G, REVEALS)).toBeUndefined()
    bindRevealed(() => undefined) // still free to bind
  })
})

describe('the reveal policy', () => {
  it('is the exact policy until something is bound', async () => {
    const { revealPolicyOf, EXACT_POLICY } = await fresh()
    expect(revealPolicyOf(G)).toBe(EXACT_POLICY)
  })

  it('knows every term and prints a whole percent, in the exact policy', async () => {
    const { EXACT_POLICY } = await fresh()
    const keys: TermKey[] = ['team', 'funding', 'crew', 'tools', 'know', 'hard', 'rival', 'spill', 'bold', 'tired', 'ceo']
    expect(EXACT_POLICY.exact).toBe(true)
    for (const k of keys) expect(EXACT_POLICY.knows(k)).toBe(true)
    expect(EXACT_POLICY.band(0.62)).toBe('62%')
    expect(EXACT_POLICY.band(0)).toBe('0%')
    expect(EXACT_POLICY.band(1)).toBe('100%')
    expect(EXACT_POLICY.band(0.625)).toBe('63%')
    expect(EXACT_POLICY.band(Number.NaN)).toBe('0%')
    expect(EXACT_POLICY.band(7)).toBe('100%')
    expect(EXACT_POLICY.band(-3)).toBe('0%')
    expect(Object.isFrozen(EXACT_POLICY)).toBe(true)
  })

  it('answers with the bound function, given the game', async () => {
    const { bindRevealPolicy, revealPolicyOf } = await fresh()
    const hide = { exact: false, knows: (t: TermKey): boolean => t !== 'rival', band: (): string => 'about 60%' }
    let got: GameState | null = null
    bindRevealPolicy((g) => {
      got = g
      return hide
    })
    expect(revealPolicyOf(G)).toBe(hide)
    expect(got).toBe(G)
  })

  it('takes the same function twice and refuses a different one', async () => {
    const { bindRevealPolicy, revealPolicyOf, EXACT_POLICY } = await fresh()
    const fn = (): typeof EXACT_POLICY => EXACT_POLICY
    bindRevealPolicy(fn)
    bindRevealPolicy(fn)
    expect(() => bindRevealPolicy(() => EXACT_POLICY)).toThrow(/already bound/)
    expect(() => bindRevealPolicy(null as never)).toThrow(/function/)
    expect(revealPolicyOf(G)).toBe(EXACT_POLICY)
  })

  it('falls back to exact when the bound function answers with something that is not a policy', async () => {
    const { bindRevealPolicy, revealPolicyOf, EXACT_POLICY } = await fresh()
    bindRevealPolicy((() => null) as never)
    expect(revealPolicyOf(G)).toBe(EXACT_POLICY)
    const b = await fresh()
    b.bindRevealPolicy((() => ({ exact: false })) as never)
    expect(b.revealPolicyOf(G)).toBe(b.EXACT_POLICY)
  })

  it('is not a kernel port (hub-entry fails on a defined port nothing binds)', async () => {
    vi.resetModules()
    const ports = await import('../src/game/kernel/ports')
    await import('../src/game/effort/hooks')
    expect(ports.portStatus().filter((p) => /effort/i.test(p.name))).toEqual([])
  })
})

describe('the types', () => {
  it('compile as the plan wrote them', () => {
    // A compile-time check: tsc fails here if a shape drifts from the contract the other lanes code against.
    const ctx: StepCtx = { year: 2030, who: 'you', know: {}, k: 1, weeks: 3, quality: 50 }
    const fx: Fx = { v: 1, progress: 0, quality: 0, spent: 0, hours: 0, setbacks: 0, insight: 0, fatigue: 0, last: 0 }
    expect(ctx.year + fx.v).toBe(2031)
  })
})
