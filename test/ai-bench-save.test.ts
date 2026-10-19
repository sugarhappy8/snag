import { describe, expect, it } from 'vitest'
import { benchWorldFlags, readAiFirsts } from '../src/game/business/ai-bench-claims'
import { techOf } from '../src/game/business/deeptech-core'
import { bestModel, bestModelAsOf } from '../src/game/business/deeptech-data'
import { TECH_VERSION, readTech, type AiModel } from '../src/game/business/deeptech-state'
import { killCharacter } from '../src/game/death'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { SAVE_SCHEMA } from '../src/game/core'
import type { Asset, GameState, Json } from '../src/game/types'
import { lab } from './ai-bench-kit'
import { adult, company, nextYear } from './market-kit'

// parent() and handOff(g, heirId): copied from test/tech-waves-wiring.test.ts (release 1), which copied them from test/heavy-handoff.test.ts
/** A parent who owns a restaurant and a grown-up child. */
function parent(): { g: GameState; a: Asset; heirId: string } {
  const g = adult(11, 2030, 'us')
  const a = company(g, 'restaurant', { name: 'Handoff Diner' })
  nextYear(g)
  g.character.age = 70
  const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
  return { g, a, heirId: heir.id }
}

function handOff(g: GameState, heirId: string): GameState {
  killCharacter(g, 'Old Age')
  g.queue = []
  const n = continueAsChild(g, heirId)
  expect(n).not.toBe(g)
  expect(n.generation).toBe(2)
  return n
}

const J = (v: unknown): Json => v as Json
const model = (o: Record<string, unknown> = {}) => ({ gen: 1, name: 'Nova 1', score: 60, open: false, year: 2026, ...o })
const readModels = (...ms: Record<string, unknown>[]) => readTech(J({ models: ms })).models
describe('hostile saves: models and tech', () => {
  it('keeps a rating only for known capabilities and integers 1 to 5000, a held flag only when true, and adds no keys to an old model', () => {
    const [m] = readModels(model({ rating: { language: -5, coding: 1e9, vision: '1200', speech: 1200.4, bogus: 100, agents: null, reasoning: 1300 }, held: 'true' }))
    expect(m.rating).toEqual({ speech: 1200, reasoning: 1300 }); expect('held' in m).toBe(false)
    for (const bad of [{}, 'x', 7, null, [], { language: 0 }]) expect('rating' in readModels(model({ rating: bad }))[0]).toBe(false)
    expect(readModels(model({ held: true }))[0].held).toBe(true); expect(readModels(model())[0]).toEqual({ gen: 1, name: 'Nova 1', score: 60, open: false, year: 2026 })
  })
  it('rebuilds caps (known ids, whole numbers 0 to 20, zeros dropped) and firsts (unique, well formed, at most 24)', () => {
    expect(readTech(J({ caps: { language: 3.7, coding: -2, vision: 99, speech: 'x', bogus: 5, agents: 0 } })).caps).toEqual({ language: 4, vision: 20 })
    for (const bad of [7, 'x', null, [], undefined]) expect(readTech(J({ caps: bad })).caps).toEqual({})
    expect(readTech(J({ firsts: ['language.1', 'language.1', 'coding.4', 'bogus.1', 'vision.3', 7, '', 'language.0', 'constructor.1'] })).firsts).toEqual(['language.1', 'vision.3'])
    expect(readTech(J({ firsts: Array.from({ length: 10_000 }, (_, i) => `language.${i}`) })).firsts).toEqual(['language.1', 'language.2', 'language.3'])
    expect([readTech(undefined).caps, readTech(undefined).firsts]).toEqual([{}, []])
  })
  it('re-normalizes a version 3 save on first use; TECH_VERSION is 4 and SAVE_SCHEMA stays 2', () => {
    const { b } = lab(); b.tech = J({ v: 3, level: 55, stage: 2, models: [{ gen: 1, name: 'Nova 1', score: 61, open: false, year: 2020 }] })
    const t = techOf(b); expect(t).toMatchObject({ v: 4, level: 55, caps: {}, firsts: [] }); expect(t.models[0]).toEqual({ gen: 1, name: 'Nova 1', score: 61, open: false, year: 2020 }); expect([TECH_VERSION, SAVE_SCHEMA]).toEqual([4, 2])
  })
})
describe('bestModel and bestModelAsOf', () => {
  const m = (o: Partial<AiModel> & { gen: number }): AiModel => ({ name: `N ${o.gen}`, score: 50, open: false, year: 2026, ...o })
  it('unrated models: highest score, ties keep the earlier; rated outrank unrated and compare by rating strength, not score', () => {
    expect(bestModel({ models: [m({ gen: 1, score: 40 }), m({ gen: 2, score: 70 }), m({ gen: 3, score: 70 })] })?.gen).toBe(2)
    const weak = m({ gen: 4, score: 30, rating: { language: 900 } }), strong = m({ gen: 5, score: 20, rating: { language: 900, coding: 800 } })
    expect(bestModel({ models: [m({ gen: 1, score: 99 }), weak] })?.gen).toBe(4); expect(bestModel({ models: [m({ gen: 6, score: 99, rating: { language: 1000 } }), strong, weak] })?.gen).toBe(5); expect(bestModel({ models: [] })).toBeNull()
  })
  it('skips held models, so a lab with only held models has none, and bestModelAsOf ignores later years', () => {
    const a = m({ gen: 1, rating: { language: 900 } }), b = m({ gen: 2, rating: { language: 1200 }, held: true, year: 2027 })
    expect([bestModel({ models: [a, b] })?.gen, bestModel({ models: [b] })]).toEqual([1, null])
    expect([bestModelAsOf({ models: [a, m({ gen: 3, rating: { language: 1500 }, year: 2028 })] }, 2027)?.gen, bestModelAsOf({ models: [a] }, 2025)]).toEqual([1, null])
  })
})
describe('aiFirsts world state', () => {
  const flags = (v?: Json): { flags: Record<string, Json> } => ({ flags: v === undefined ? {} : { aiFirsts: v } })
  const ok = { 'language.1': { year: 2029, lab: 'Acme AI' } }
  it('reads junk as empty, keeps well-formed entries, caps text and years, and never writes', () => {
    for (const v of [7, 'x', null, []]) expect(readAiFirsts(flags(J(v)))).toEqual({}); expect(readAiFirsts(flags())).toEqual({})
    expect(readAiFirsts(flags(J({ ...ok, 'language.4': ok['language.1'], 'bogus.1': ok['language.1'], 'coding.2': { year: 'x', lab: 'A' }, 'vision.1': 5, 'speech.1': { year: 2030, lab: '' } })))).toEqual(ok)
    expect(readAiFirsts(flags(J({ 'language.1': { year: 1e9, lab: 'L'.repeat(200) } })))['language.1']).toEqual({ year: 2300, lab: 'L'.repeat(60) })
  })
  it('benchWorldFlags returns only validated claims, nothing for a world with none, and an heir inherits them', () => {
    expect([benchWorldFlags(flags()), benchWorldFlags(flags(J({ junk: 1 })))]).toEqual([{}, {}]); expect(benchWorldFlags(flags(J({ ...ok, junk: 1 })))).toEqual({ aiFirsts: ok })
    const { g, heirId } = parent(); g.flags.aiFirsts = J({ ...ok, junk: 1 }); expect(handOff(g, heirId).flags.aiFirsts).toEqual(ok)
    const none = parent(); expect('aiFirsts' in handOff(none.g, none.heirId).flags).toBe(false)
  })
})
