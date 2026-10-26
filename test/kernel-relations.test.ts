// ci: fast
// R4-E5 (D.3, X22, X23, C3): the door every change to Person.relationship goes through. kernel/relations.ts holds the primitives
// (applyRelationship, assignRelationship) and the mirror hook (bindMirror, notifyMirror); core.ts wraps them as addRelationship and
// setRelationship. The promise of this task is that nothing moves: the primitive is the v5.2.0 expression to the digit, the hook is
// bound by nobody yet, and R4-E7 binds it later. A hook, not a port: nothing here touches kernel/ports.ts.
//
// The cases call addRelationship through the parity kit's applyDelta, the one place a test file does (the ratchet,
// test/relationship-ratchet.test.ts, counts every other), and setRelationship directly. Only the case that needs an unbound hook
// takes a fresh copy of the modules (vi.resetModules, then a dynamic import), the way test/kernel-ports.test.ts does; the others bind
// a recorder on the loaded modules and bind a do-nothing hook again afterwards, which is the same as unbound.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clamp, setRelationship } from '../src/game/core'
import { applyRelationship, assignRelationship, bindMirror, clampRel, notifyMirror, type RelChange } from '../src/game/kernel/relations'
import { createPerson } from '../src/game/people'
import { makeTestGame } from './helpers'
import { ROOT } from './scan-kit'
import { applyDelta } from './social-parity-kit'

afterEach(() => bindMirror(() => undefined))

const person = (relationship: number): ReturnType<typeof createPerson> => {
  const g = makeTestGame()
  return createPerson(g, { relation: 'friend', age: 30, relationship })
}

/** The v5.2.0 expression, written out: core.ts's addRelationship before R4-E5. */
function oldAdd(start: number, delta: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(delta)) return start
  return Math.round(clamp(start + delta))
}

const STARTS = [0, 1, 49, 50, 50.5, 99, 100, 105, -5, 49.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
const DELTAS = [-1000, -100, -5, -1, -0.5, -0.4, 0, 0.4, 0.5, 1, 1.5, 5, 49.5, 100, 1e9, 1e308, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

describe('the clamp copy', () => {
  it('equals the clamp of core.ts over the bounds, the halves and the non-finite values', () => {
    for (const n of [0, 1, 49.5, 100, 105, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 1e308, 99.999]) {
      expect(Object.is(clampRel(n), clamp(n)), `clamp(${n})`).toBe(true)
    }
  })
})

describe('applyRelationship', () => {
  it('is the old expression to the digit, over every start and delta', () => {
    let n = 0
    for (const start of STARTS) {
      for (const delta of DELTAS) {
        const p = person(0)
        p.relationship = start
        const change = applyRelationship(p, delta)
        const want = oldAdd(start, delta)
        expect(Object.is(p.relationship, want), `${start} + ${delta}`).toBe(true)
        if (!Number.isFinite(start) || !Number.isFinite(delta)) expect(change, `${start} + ${delta} is not a change`).toBeNull()
        else expect(change).toEqual({ before: start, after: want, kind: delta < 0 ? 'offence' : 'affection' })
        n++
      }
    }
    expect(n).toBe(STARTS.length * DELTAS.length)
  })

  it('rounds a fractional relationship: 50.5 becomes 51', () => {
    const p = person(50)
    p.relationship = 50.5
    expect(applyRelationship(p, 0)).toEqual({ before: 50.5, after: 51, kind: 'affection' })
    expect(p.relationship).toBe(51)
  })

  it('returns null and writes nothing for a non-finite relationship or delta', () => {
    for (const [start, delta] of [[Number.NaN, 5], [50, Number.NaN], [50, Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY, 1]] as const) {
      const p = person(0)
      p.relationship = start
      expect(applyRelationship(p, delta)).toBeNull()
      expect(Object.is(p.relationship, start)).toBe(true)
    }
  })

  it('picks the kind by the sign of the delta, and passes a named kind through', () => {
    expect(applyRelationship(person(105), 5)?.kind, 'a rise that the bound cuts is still a rise').toBe('affection')
    expect(applyRelationship(person(0), -5)?.kind, 'a fall that the bound cuts is still a fall').toBe('offence')
    expect(applyRelationship(person(50), 5)?.kind).toBe('affection')
    expect(applyRelationship(person(50), 0)?.kind).toBe('affection')
    expect(applyRelationship(person(50), -5)?.kind).toBe('offence')
    expect(applyRelationship(person(50), -5, 'decay')?.kind).toBe('decay')
    expect(applyRelationship(person(50), 5, 'offence')?.kind).toBe('offence')
    expect(applyRelationship(person(50), 5, 'affection')?.kind).toBe('affection')
  })
})

describe('assignRelationship', () => {
  it('writes the value verbatim: no clamp, no rounding, a NaN stays a NaN', () => {
    for (const value of [0, 12, 105.5, -3, 49.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = person(40)
      const change = assignRelationship(p, value)
      expect(Object.is(p.relationship, value), `assign ${value}`).toBe(true)
      expect(Object.is(change.before, 40)).toBe(true)
      expect(Object.is(change.after, value)).toBe(true)
    }
  })

  it('picks the kind by the sign of the change, and passes a named kind through', () => {
    expect(assignRelationship(person(40), 60).kind).toBe('affection')
    expect(assignRelationship(person(40), 40).kind).toBe('affection')
    expect(assignRelationship(person(40), 20).kind).toBe('offence')
    expect(assignRelationship(person(40), 20, 'decay').kind).toBe('decay')
  })
})

describe('the mirror hook', () => {
  it('does nothing while nothing is bound (a fresh copy of the modules)', async () => {
    vi.resetModules()
    const rel = await import('../src/game/kernel/relations')
    const core = await import('../src/game/core')
    const g = makeTestGame()
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    expect(() => rel.notifyMirror(g, p, { before: 50, after: 55, kind: 'affection' })).not.toThrow()
    core.setRelationship(g, p, 55)
    expect(p.relationship).toBe(55)
  })

  it('is called with the game, the person and { before, after, kind } once per applied change', () => {
    const g = makeTestGame()
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    const seen: [unknown, unknown, RelChange][] = []
    bindMirror((...args) => seen.push(args))
    applyDelta(g, p, 7)
    applyDelta(g, p, -3, 'decay')
    setRelationship(g, p, 20)
    setRelationship(g, p, 90, 'affection')
    expect(seen).toHaveLength(4)
    expect(seen.map((s) => [s[0] === g, s[1] === p])).toEqual([[true, true], [true, true], [true, true], [true, true]])
    expect(seen.map((s) => s[2])).toEqual([
      { before: 50, after: 57, kind: 'affection' },
      { before: 57, after: 54, kind: 'decay' },
      { before: 54, after: 20, kind: 'offence' },
      { before: 20, after: 90, kind: 'affection' },
    ])
  })

  it('is never called for a null change (a non-finite relationship or delta)', () => {
    const g = makeTestGame()
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    const mirror = vi.fn()
    bindMirror(mirror)
    applyDelta(g, p, Number.NaN)
    applyDelta(g, p, Number.POSITIVE_INFINITY)
    p.relationship = Number.NaN
    applyDelta(g, p, 5)
    expect(mirror).not.toHaveBeenCalled()
  })

  it('is called for a zero change that was applied (the mirror decides that it means nothing)', () => {
    const g = makeTestGame()
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 100 })
    const mirror = vi.fn()
    bindMirror(mirror)
    applyDelta(g, p, 10)
    expect(mirror).toHaveBeenCalledTimes(1)
    expect(mirror.mock.calls[0]![2]).toEqual({ before: 100, after: 100, kind: 'affection' })
  })

  it('is replaced by a second bindMirror, not stacked', () => {
    const g = makeTestGame()
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    const first = vi.fn()
    const second = vi.fn()
    bindMirror(first)
    bindMirror(second)
    applyDelta(g, p, 1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('is told by notifyMirror itself, with the arguments as given', () => {
    const g = makeTestGame()
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
    const mirror = vi.fn()
    bindMirror(mirror)
    const change: RelChange = { before: 1, after: 2, kind: 'decay' }
    notifyMirror(g, p, change)
    expect(mirror).toHaveBeenCalledWith(g, p, change)
  })

  it('moves no draw, no id and no popup, whatever is bound', () => {
    for (const hook of [() => undefined, vi.fn()]) {
      const g = makeTestGame()
      const p = createPerson(g, { relation: 'friend', age: 30, relationship: 50 })
      bindMirror(hook)
      const rng = JSON.stringify(g.rng)
      const nextId = g.nextId
      const queue = g.queue.length
      applyDelta(g, p, 9)
      setRelationship(g, p, 33)
      expect(JSON.stringify(g.rng)).toBe(rng)
      expect(g.nextId).toBe(nextId)
      expect(g.queue.length).toBe(queue)
    }
  })
})

describe('the shim in core.ts', () => {
  it('is the old addRelationship with a game in front, over the whole grid', () => {
    const g = makeTestGame()
    for (const start of STARTS) {
      for (const delta of DELTAS) {
        const p = person(0)
        p.relationship = start
        applyDelta(g, p, delta)
        expect(Object.is(p.relationship, oldAdd(start, delta)), `${start} + ${delta}`).toBe(true)
      }
    }
  })

  it('setRelationship is the raw write: the right-hand side is evaluated once, in place, by the caller', () => {
    const g = makeTestGame()
    const p = createPerson(g, { relation: 'friend', age: 30, relationship: 80 })
    setRelationship(g, p, Math.min(p.relationship, 15))
    expect(p.relationship).toBe(15)
    setRelationship(g, p, Math.max(0, p.relationship - 20))
    expect(p.relationship).toBe(0)
  })
})

describe('the file', () => {
  const text = readFileSync(join(ROOT, 'src/game/kernel/relations.ts'), 'utf8')
  /** The file without its comment lines: the header may name a port, the code may not use one. */
  const src = text
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n')

  it('imports types only, so core.ts can import it without a cycle (layer 0)', () => {
    const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l))
    expect(imports.length).toBeGreaterThan(0)
    for (const l of imports) expect(l, l).toMatch(/^import type\b/)
    expect(src).not.toMatch(/from '\.\.?\/(core|rng)'/)
  })

  it('is not a port: it defines none and calls definePort nowhere', () => {
    expect(src).not.toMatch(/definePort/)
    expect(src).not.toMatch(/kernel\/ports/)
  })
})
