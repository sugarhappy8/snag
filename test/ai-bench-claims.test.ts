// AI Lab 2.0, releases and firsts (plan Task 7): a model that reaches a milestone before the market claims
// it once for the family, a held model is stored as held and claims nothing until it is released, and the
// release text reads the model's own year and its own board.
import { describe, expect, it } from 'vitest'
import { bestRival, marketYear } from '../src/game/business/ai-bench-market'
import { benchWorldFlags, claimFirsts, readAiFirsts } from '../src/game/business/ai-bench-claims'
import { competitiveness, sellable, techOf } from '../src/game/business/deeptech-core'
import { bestModel } from '../src/game/business/deeptech-data'
import { simInternals } from '../src/game/business/deeptech-sim'
import { bizOf } from '../src/game/business/state'
import { readTechWaves } from '../src/game/business/tech-waves'
import { runScript } from '../src/game/scripts'
import { arriveInPast } from '../src/game/timeMachine'
import type { ChoiceModal } from '../src/game/types'
import { act, lab, node, offBest, rated, type Lab } from './ai-bench-kit'

const ask = (L: Lab, gen: number): ChoiceModal => {
  simInternals.queueRelease(L.g, L.a, L.t, gen)
  return L.g.queue.pop() as ChoiceModal
}
const answer = (L: Lab, modal: ChoiceModal, choice: string) => runScript(L.g, modal.scriptId!, choice, modal.data, modal)
const live = (L: Lab) => techOf(bizOf(L.g, L.a))
/** A lab with one model that reaches language 1 and coding 1 and 2 (milestones 1300, 1400 and 1500). */
const firstLab = (): Lab => {
  const L = lab()
  L.t.models = [rated(L.fam, 1, 2026, { language: 1320, coding: 1500 })]
  return L
}

describe('claimFirsts through a release', () => {
  it('claims each milestone the model reaches before the market: world record, hype, brand, premium, one log line each, and a wave', () => {
    const L = firstLab(), h0 = live(L).hype, b0 = bizOf(L.g, L.a).brand; answer(L, ask(L, 1), 'closed')
    expect(readAiFirsts(L.g)).toEqual({ 'language.1': { year: 2026, lab: 'Test Lab' }, 'coding.1': { year: 2026, lab: 'Test Lab' }, 'coding.2': { year: 2026, lab: 'Test Lab' } }); expect([...live(L).firsts].sort()).toEqual(['coding.1', 'coding.2', 'language.1'])
    expect([live(L).hype - h0, bizOf(L.g, L.a).brand - b0, live(L).premium]).toEqual([36, 12, expect.closeTo(0.03, 9)]); expect(JSON.stringify(L.g.log)).toContain('Test Lab reached 1300 in language before any rival.')
    const waves = readTechWaves(L.g).filter((w) => w.origin?.includes('#first.'))   // release 1 refuses a third non-rival wave in a year, yet the third claim above stands
    expect(waves).toHaveLength(2); expect(waves.map((w) => w.name).sort()).toEqual(['Frontier coding', 'Frontier language']); expect(waves[0]).toMatchObject({ kind: 'ai', source: 'deeptech', market: 'world', home: 'us' })
  })
  it('lets the market win a tie: a model dated at or after the year the market reaches the milestone claims nothing', () => {
    const y = marketYear(lab().fam, 'language', 1), at = (year: number) => { const L = lab(); L.t.models = [rated(L.fam, 1, year, { language: 1320 })]; answer(L, ask(L, 1), 'closed'); return Object.keys(readAiFirsts(L.g)) }
    expect([at(y), at(y - 1)]).toEqual([[], ['language.1']])
  })
  it('an heir, a repeat release and a Time Machine jump cannot claim the same first twice', () => {
    const L = firstLab(), snap = structuredClone(L.g); answer(L, ask(L, 1), 'closed')
    expect(claimFirsts(L.g, L.a, bizOf(L.g, L.a), live(L), live(L).models[0])).toEqual([])
    const H = firstLab(); H.g.flags = { ...H.g.flags, ...benchWorldFlags(L.g) }; expect(claimFirsts(H.g, H.a, bizOf(H.g, H.a), live(H), live(H).models[0])).toEqual([]); expect(live(H).firsts).toEqual([])
    expect(readAiFirsts(arriveInPast(L.g, snap))).toEqual({})   // the restored flags win: the abandoned future's claim is gone
  })
  it('a model without a rating claims nothing', () => { const L = lab(); L.t.models = [{ gen: 1, name: 'Vega 1', score: 99, open: false, year: 2026 }]; answer(L, ask(L, 1), 'open'); expect(readAiFirsts(L.g)).toEqual({}) })
})
describe('hold', () => {
  it('a lab whose only model is held sells nothing, claims nothing and has no best model until it releases it', () => {
    const L = firstLab(); live(L).stage = 3; const s0 = live(L).safety, h0 = live(L).hype; answer(L, ask(L, 1), 'hold'); const t = live(L)
    expect([t.models[0].held, bestModel(t), sellable(L.g, bizOf(L.g, L.a), t), competitiveness(t, 2026, L.fam), readAiFirsts(L.g)]).toEqual([true, null, false, 0, {}]); expect([t.safety, t.hype]).toEqual([Math.min(100, s0 + 15), h0 - 5])
    expect(JSON.stringify(L.g.queue)).toContain('goes through more red-teaming. It earns nothing and stays off the scoreboard until you release it.')
    const row = act(L.g, L.a, 'dt.release.1'); expect([row.label, row.visible?.(L.g) ?? true, row.disabledReason?.(L.g)]).toEqual(['Release Nova 1', true, null])
    L.g.character.age = 12; row.run(L.g); expect(live(L).models[0].held).toBe(true)     // action-level authorization: a restored menu can't release under 18
    L.g.character.age = 30; row.run(L.g); expect([live(L).models[0].held, bestModel(live(L))?.gen, Object.keys(readAiFirsts(L.g)).length, row.visible?.(L.g)]).toEqual([undefined, 1, 3, false])
  })
  it('shows a held model as held back in the Compute & Models rows', () => {
    const L = firstLab(); answer(L, ask(L, 1), 'hold'); const row = node(L.g, L.a, 'dt.i.model.1'); expect(row.type === 'info' ? row.text : '').toMatch(/held back$/)
  })
  it('a model held until the market has passed its milestones claims nothing', () => {
    const L = firstLab(); answer(L, ask(L, 1), 'hold'); L.g.year = 2100; act(L.g, L.a, 'dt.release.1').run(L.g)   // the claim year is the later of the model's year and benchYear(g)
    expect([readAiFirsts(L.g), live(L).models[0].held]).toEqual([{}, undefined])
  })
})
describe('release text', () => {
  it('names the model\'s own year and board and says what each choice costs; unrated models keep their wording with a true hold sentence', () => {
    const L = lab(); L.t.models = [rated(L.fam, 4, 2025, offBest(L.fam, 2025, 0), { name: 'Nova 4' })]
    expect(ask(L, 4).text).toBe(`Nova 4 scored ${L.t.models[0].score} on the 2025 benchmarks. The best rival scored ${bestRival(L.fam, 2025, [])!.score}. Closed earns API money, open earns fans but cuts it. A held model earns nothing.`)
    const O = lab(); O.t.models = [{ gen: 1, name: 'Vega 1', score: 40, open: false, year: 2000 }]; const t = ask(O, 1).text; expect(t).toContain('scored 40 on the benchmarks (the best anyone has is about 40)'); expect(t).toContain('A held model earns nothing until you release it.')
    const good = lab(); good.t.models = [rated(good.fam, 1, 2026, offBest(good.fam, 2026, 60))]; answer(good, ask(good, 1), 'closed'); expect(JSON.stringify(good.g.queue)).toContain('best model in the world')
  })
})
