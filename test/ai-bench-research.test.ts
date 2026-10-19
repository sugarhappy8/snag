import { describe, expect, it } from 'vitest'
import { CAP_IDS, type CapMap } from '../src/game/business/ai-bench-data'
import { PROGRAMS, programDef } from '../src/game/business/deeptech-data'
import { techOf } from '../src/game/business/deeptech-core'
import { deepTechManagerTurnImpl } from '../src/game/business/deeptech-manager'
import { bestCapTrack, bestProgram, maxPrograms, programBlock, startProgram, trackLimit } from '../src/game/business/deeptech-rd'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import type { MenuAction } from '../src/game/types'
import { lab, node, offBest, priors, rated } from './ai-bench-kit'

const tracks = PROGRAMS.aiLab.filter((p) => p.track), coding = programDef('aiLab', 'cap.coding')!
const ctx = (t: TechState) => ({ t, countryId: 'us', year: 2026, roll: () => 0.5, company: 'X' })
describe('capability tracks', () => {
  it('has one program per capability with the spec\'s terms, a cost curve of 3M x 1.4^levels and no autopilot flag', () => {
    expect(tracks.map((p) => p.id)).toEqual(CAP_IDS.map((c) => `cap.${c}`)); expect(new Set(PROGRAMS.aiLab.map((p) => p.id)).size).toBe(PROGRAMS.aiLab.length)
    const t = readTech(undefined); for (const p of tracks) { expect([p.years, p.odds(t), p.ipShare, p.unlocks, p.capex]).toEqual([2, 0.65, 0.3, undefined, undefined]); expect(p.id).toBe(`cap.${p.track}`) }
    const cost = (n: number) => coding.cost({ ...t, caps: { coding: n } }); expect(cost(0)).toBe(3_000_000); expect(cost(5) / cost(0)).toBeCloseTo(1.4 ** 5, 6); expect(cost(10)).toBeGreaterThan(86_000_000); expect(cost(10)).toBeLessThan(87_500_000)
  })
  it('is gated by a rated model that covers the capability, and closes at level 20', () => {
    const G = (t: TechState) => coding.gate(t, 'us'), none = 'Train a model that covers it first.'
    expect([G(readTech(undefined)), G({ ...readTech(undefined), models: priors(2) }), G({ ...readTech(undefined), models: [rated('f', 1, 2026, { language: 1300 })] })]).toEqual([none, none, none])
    const t = { ...readTech(undefined), models: [rated('f', 1, 2026, { coding: 1300 })] }; expect([G(t), G({ ...t, caps: { coding: 20 } })]).toEqual([null, 'Fully researched.'])
  })
  it('a win adds a level, +1 tech level for the first three levels only, +4 hype and says so; a loss adds a level of tech and says the cost repeats', () => {
    const w = (caps: CapMap) => { const t = { ...readTech(undefined), level: 40, hype: 10, caps }; const line = coding.win(ctx(t)); return { line, caps: t.caps.coding, level: t.level, hype: t.hype } }
    expect(w({ coding: 3 })).toEqual({ line: 'Coding research reached level 4. Your next model will use it.', caps: 4, level: 40, hype: 14 }); expect(w({ coding: 2 })).toMatchObject({ caps: 3, level: 41 })
    const v = { ...readTech(undefined), level: 40 }; expect(coding.lose!(ctx(v))).toBe('Coding research stalled. The same level costs the same again.'); expect([v.level, v.caps.coding]).toEqual([41, undefined])
  })
  it('Multimodal Models and Autonomous Agents give a head start without lowering research already done', () => {
    const w = (id: string, caps: CapMap) => { const t = { ...readTech(undefined), caps }; programDef('aiLab', id)!.win(ctx(t)); return t.caps }
    expect([w('multimodal', {}), w('multimodal', { vision: 5 }), w('agents', {}), w('agents', { agents: 9 })]).toEqual([{ vision: 2, speech: 2 }, { vision: 5, speech: 2 }, { agents: 3 }, { agents: 9 }])
  })
})
describe('slots and autopilot', () => {
  it('allows max(1, floor(slots / 3)) tracks and says how many', () => {
    const { g, b, t, fam } = lab(); t.models = [rated(fam, 1, 2026, offBest(fam, 2026, 0))]; const start = (c: string) => startProgram(g, b, t, programDef('aiLab', `cap.${c}`)!)
    expect([maxPrograms(b, t), trackLimit(b, t)]).toEqual([2, 1]); expect(start('language')).not.toBeNull(); expect(programBlock(b, t, coding)).toBe('Your lab can research 1 capability at once.')
    b.outlets[0].count = 16; t.programs = []; expect([maxPrograms(b, t), trackLimit(b, t)]).toEqual([6, 2]); start('language'); start('coding')
    expect(programBlock(b, t, programDef('aiLab', 'cap.vision')!)).toBe('Your lab can research 2 capabilities at once.'); expect(programBlock(b, t, programDef('aiLab', 'train')!)).toBeNull()
  })
  it('bestProgram never picks a track, even when only tracks are startable', () => {
    const { g, a, b, t, fam } = lab({ stage: 3, venture: 5e9 }); b.cash = 5e9; t.models = [rated(fam, 1, 2026, offBest(fam, 2026, 0))]
    expect(bestProgram(g, a, b, t)?.track).toBeUndefined()
    const saved = PROGRAMS.aiLab.splice(0, PROGRAMS.aiLab.length, ...tracks); try { expect(bestProgram(g, a, b, t)).toBeNull() } finally { PROGRAMS.aiLab.splice(0, PROGRAMS.aiLab.length, ...saved) }
  })
  it('the general manager never starts a track and keeps one that is running', () => {
    const { g, a, b, t, fam } = lab({ stage: 3, venture: 5e9 }); b.cash = 5e9; t.models = [rated(fam, 1, 2026, offBest(fam, 2026, 0))]; startProgram(g, b, t, programDef('aiLab', 'cap.language')!)
    const saved = PROGRAMS.aiLab.splice(0, PROGRAMS.aiLab.length, ...tracks); try { for (let i = 0; i < 3; i++) deepTechManagerTurnImpl(g, a, b) } finally { PROGRAMS.aiLab.splice(0, PROGRAMS.aiLab.length, ...saved) }
    expect(techOf(b).programs.map((p) => p.id)).toEqual(['cap.language'])
  })
})
describe('the Business talent hint', () => {
  it('hints one startable track, the one bestCapTrack names, only with the talent, and reads without dice or writes', () => {
    const { g, a, b, t, fam } = lab({ stage: 3, venture: 5e9 }); b.cash = 5e9; t.models = [rated(fam, 1, 2026, offBest(fam, 2026, -150))]
    const hints = () => CAP_IDS.map((c) => (node(g, a, `dt.rd.cap.${c}`) as MenuAction).hint?.(g) ?? null)
    expect(hints().every((h) => h === null)).toBe(true); g.character.talents = ['Business']
    const best = bestCapTrack(g, a, b, t), got = hints(); expect(best).not.toBeNull(); expect(got.filter(Boolean)).toHaveLength(1); expect(got[CAP_IDS.indexOf(best!)]).toMatch(/moves your standing most per dollar/)
    const before = JSON.stringify(g), rng = g.rng; bestCapTrack(g, a, b, t); expect([JSON.stringify(g), g.rng]).toEqual([before, rng])
  })
  it('names no track without a rated model', () => { const { g, a, b, t } = lab(); expect(bestCapTrack(g, a, b, t)).toBeNull() })
})
