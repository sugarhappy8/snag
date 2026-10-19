import { afterEach, describe, expect, it } from 'vitest'
import { addHidden } from '../src/game/core'
import { hasScript, runScript } from '../src/game/scripts'
import { typicalIncome } from '../src/game/events/wealth-core'
import { ownerKey } from '../src/game/special/common'
import {
  CRISIS_ODDS,
  applyEffects,
  bestStance,
  defineCrises,
  fxValue,
  honest,
  hot,
  oddsText,
  optionOdds,
  type CrisisDef,
  type Stance,
} from '../src/game/special/kit/crisis'
import { careerCtx, setCareerAudit, type AuditEvent } from '../src/game/special/kit/year'
import type { ChoiceModal, GameState } from '../src/game/types'
import { assertHonestOdds, voiceProblems } from './career-kit'
import { newProbeGame, probeCrises, probeDef, probeStore, probeYear, type ProbeData, type ProbeState } from './career-probe'

const SCRIPT = 'career.probe.rush'
const STANCES: Stance[] = ['safe', 'bold', 'cash']
const ctxOf = (g: GameState, career = 'probe') => careerCtx(g, career, probeStore.mut(g), { choices: 1, notices: 2 })
const choiceOf = (g: GameState): ChoiceModal | undefined => g.queue.find((m): m is ChoiceModal => m.kind === 'choice')

/** The first seeded probe life whose yearly hook queues the crisis. */
function offered(talent = false): { g: GameState; modal: ChoiceModal } {
  for (let seed = 1; seed < 400; seed++) {
    const g = newProbeGame(seed)
    if (talent) g.character.talent = 'Acting'
    probeYear(g)
    const modal = choiceOf(g)
    if (modal) return { g, modal }
  }
  throw new Error('no crisis offered in 400 seeds')
}

/** The state without the resolved-modal memory that runScript writes before a handler runs. */
function stable(g: GameState): string {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  return JSON.stringify(c)
}

const dataOf = (m: ChoiceModal): { d: ProbeData; owner: string; year: number } => m.data as unknown as { d: ProbeData; owner: string; year: number }

describe('career crisis helper', () => {
  afterEach(() => setCareerAudit(null))

  it('registers career.probe.rush with 2 to 3 stances and distinct labels', () => {
    expect(hasScript(SCRIPT)).toBe(true)
    const opts = Object.values(probeDef.options)
    expect(opts.length).toBeGreaterThanOrEqual(2)
    expect(opts.length).toBeLessThanOrEqual(3)
    expect(new Set(opts.map((o) => o.label)).size).toBe(opts.length)
    const { modal } = offered()
    expect(modal.scriptId).toBe(SCRIPT)
    expect(modal.choices.map((c) => c.id)).toEqual(STANCES)
    expect(modal.title).toBe('Rush job')
    expect(modal.text.endsWith('What will you do?')).toBe(true)
  })

  it('offers about 35% of years, after the marker, weighted, and honours the cool-down', () => {
    expect(CRISIS_ODDS).toBe(0.35)
    let hits = 0
    const seeds = 2000
    for (let seed = 1; seed <= seeds; seed++) {
      const g = newProbeGame(seed)
      if (probeCrises.offer(ctxOf(g))) hits++
    }
    expect(hits / seeds).toBeGreaterThan(0.3)
    expect(hits / seeds).toBeLessThan(0.4)

    // the cool-down is the last year it applies: year + 3 for the default of 4
    for (let seed = 1; seed <= 40; seed++) {
      const h = newProbeGame(seed)
      if (!probeCrises.offer(ctxOf(h))) continue
      expect(probeStore.view(h).cool['crisis.rush']).toBe(h.year + 3)
      break
    }
    const tries = (year: number): number => {
      let n = 0
      for (let seed = 1; seed <= 300; seed++) {
        const h = newProbeGame(seed)
        h.year = year
        probeStore.mut(h).cool['crisis.rush'] = 2026 + 3
        if (probeCrises.offer(ctxOf(h))) n++
      }
      return n
    }
    expect(tries(2026 + 3)).toBe(0)
    expect(tries(2026 + 4)).toBeGreaterThan(60)

    // a weight of 0 is never offered; the others split by weight
    const mk = (id: string, weight: number): CrisisDef<ProbeState, ProbeData> => ({ ...probeDef, id, weight: () => weight })
    const weighted = defineCrises({ career: 'probew', store: probeStore, talent: 'Acting', defs: [mk('zero', 0), mk('one', 1), mk('three', 3)] })
    const counts: Record<string, number> = {}
    for (let seed = 1; seed <= 3000; seed++) {
      const w = newProbeGame(seed)
      if (weighted.offer(ctxOf(w, 'probew'))) {
        const id = choiceOf(w)!.scriptId!
        counts[id] = (counts[id] ?? 0) + 1
      }
    }
    expect(counts['career.probew.zero']).toBeUndefined()
    const share = counts['career.probew.three'] / (counts['career.probew.one'] + counts['career.probew.three'])
    expect(share).toBeGreaterThan(0.68)
    expect(share).toBeLessThan(0.82)
  })

  it('does not draw g.rng or queue anything when the budget or the pending cap blocks it', () => {
    const g = newProbeGame(3)
    const rng = g.rng
    expect(probeCrises.offer(careerCtx(g, 'probe', probeStore.mut(g), { choices: 0, notices: 2 }))).toBe(false)
    expect(g.rng).toBe(rng)
    expect(g.queue).toEqual([])
    expect(offered().g.queue.length).toBeGreaterThan(0)
  })

  it('stamps the offer with the stored data, the owner and the year, and emits a crisis audit', () => {
    const sink: AuditEvent[] = []
    setCareerAudit((e) => sink.push(e))
    const { g, modal } = offered()
    const data = dataOf(modal)
    expect(data.owner).toBe(ownerKey(g))
    expect(data.year).toBe(g.year)
    expect(data.d.fee).toBeGreaterThanOrEqual(2000)
    expect(sink.filter((e) => e.t === 'crisis').at(-1)).toEqual({ t: 'crisis', career: 'probe', id: 'rush', stances: STANCES })
  })

  it('replays, wrong owner and wrong year change nothing [RF3]', () => {
    const { g, modal } = offered()
    // the yearly hook itself, replayed after it queued the crisis, queues and rolls nothing more
    const queued = JSON.stringify(g)
    probeYear(g)
    expect(JSON.stringify(g)).toBe(queued)
    const pre = structuredClone(g)
    runScript(g, SCRIPT, 'bold', modal.data, modal)
    const once = JSON.stringify(g)
    expect(once).not.toBe(JSON.stringify(pre))
    // the same modal again: the resolved-modal guard
    runScript(g, SCRIPT, 'bold', modal.data, modal)
    expect(JSON.stringify(g)).toBe(once)
    // a fresh modal id with the same data: the kit's own one-shot guard
    const settled = stable(g)
    runScript(g, SCRIPT, 'bold', modal.data, { ...modal, id: 'm-again' })
    expect(stable(g)).toBe(settled)
    // another owner
    const other = structuredClone(pre)
    runScript(other, SCRIPT, 'bold', { ...dataOf(modal), owner: 'v2:9:someone-else' }, { ...modal, id: 'm-owner' })
    expect(stable(other)).toBe(stable(pre))
    // another year
    const later = structuredClone(pre)
    later.year += 1
    const expected = stable(later)
    runScript(later, SCRIPT, 'bold', modal.data, { ...modal, id: 'm-year' })
    expect(stable(later)).toBe(expected)
    // a choice that is not on offer
    const bogus = structuredClone(pre)
    runScript(bogus, SCRIPT, 'fold', modal.data, { ...modal, id: 'm-bogus' })
    expect(stable(bogus)).toBe(stable(pre))
  })

  it('resolves a fixed option with no roll, then() after the effects, and one outcome notice', () => {
    const { g, modal } = offered()
    const before = { rng: g.rng, karma: g.character.hidden.karma, stock: probeStore.view(g).stock, standing: probeStore.view(g).standing, notices: g.queue.filter((m) => m.kind === 'notice').length }
    runScript(g, SCRIPT, 'safe', modal.data, modal)
    const s = probeStore.view(g)
    expect(g.rng).toBe(before.rng)
    expect(g.character.hidden.karma).toBe(before.karma - 3)
    expect(s.stock).toBe(before.stock + 5)
    expect(s.standing).toBe(before.standing + 2)
    const notices = g.queue.filter((m) => m.kind === 'notice')
    expect(notices.length).toBe(before.notices + 1)
    expect(notices.at(-1)).toMatchObject({ title: 'Rush job', text: 'You passed. The client moved on.' })
  })

  it('rolls a rolled option once, applies the branch it hinted and tells the result', () => {
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const { g, modal } = offered()
      g.rng = seed
      const cash = g.character.money
      const fee = dataOf(modal).d.fee
      runScript(g, SCRIPT, 'bold', modal.data, modal)
      const note = (g.queue.at(-1) as { text: string }).text
      if (note.startsWith('You delivered')) {
        expect(g.character.money).toBe(cash + fee)
        outcomes.add('good')
      } else {
        expect(note.startsWith('You missed Friday')).toBe(true)
        expect(g.character.money).toBe(cash - Math.round(fee / 2))
        outcomes.add('bad')
      }
    }
    expect([...outcomes].sort()).toEqual(['bad', 'good'])
  })

  it('marks bestStance only with the talent, and prints no percentage for a fixed option', () => {
    const plain = offered()
    expect(plain.modal.choices.every((c) => c.hint === undefined)).toBe(true)

    const { g, modal } = offered(true)
    const d = dataOf(modal).d
    const best = bestStance(g, probeStore.view(g), d, probeDef)
    const hinted = modal.choices.filter((c) => c.hint)
    expect(hinted.map((c) => c.id)).toEqual([best])
    expect(best).toBe('safe')
    expect(hinted[0].hint).toContain('Looks best on average.')
    expect(hinted[0].hint).not.toContain('%')

    // a def whose rolled bold option is the best one hints with the odds that roll it
    const big: CrisisDef<ProbeState, ProbeData> = {
      ...probeDef,
      id: 'big',
      options: { ...probeDef.options, bold: { ...probeDef.options.bold!, good: () => ({ text: () => 'You won big.', fx: { standing: 60 } }) } },
    }
    const bigCrises = defineCrises({ career: 'probeb', store: probeStore, talent: 'Acting', defs: [big] })
    for (let seed = 1; seed < 100; seed++) {
      const h = newProbeGame(seed)
      h.character.talent = 'Acting'
      if (!bigCrises.offer(ctxOf(h, 'probeb'))) continue
      const m = choiceOf(h)!
      expect(m.choices.filter((c) => c.hint).map((c) => c.id)).toEqual(['bold'])
      expect(m.choices.find((c) => c.id === 'bold')!.hint).toContain(`Looks best: ${oddsText(0.6)} to go well.`)
      return
    }
    throw new Error('the big crisis was never offered')
  })

  it('rolls the same odds() it hints', () => {
    assertHonestOdds(probeDef, () => {
      const g = newProbeGame(3)
      return { g, s: probeStore.mut(g), d: { fee: 5000 } }
    })
  })

  it('assertHonestOdds throws when the odds depend on the rng', () => {
    const liar: CrisisDef<ProbeState, ProbeData> = {
      ...probeDef,
      id: 'liar',
      options: { bold: { ...probeDef.options.bold!, odds: (g) => (g.rng % 2 === 0 ? 0.9 : 0.1) } },
    }
    expect(() =>
      assertHonestOdds(liar, () => {
        const g = newProbeGame(3)
        return { g, s: probeStore.mut(g), d: { fee: 5000 } }
      }),
    ).toThrow(/the hint says/)
  })

  it('clamps and prints the odds', () => {
    const g = newProbeGame(1)
    const s = probeStore.view(g)
    const d = { fee: 1000 }
    expect(optionOdds(g, s, d, probeDef.options.safe!)).toBeNull()
    expect(optionOdds(g, s, d, probeDef.options.bold!)).toBe(0.6)
    expect(optionOdds(g, s, d, { ...probeDef.options.bold!, odds: () => 2 })).toBe(0.95)
    expect(optionOdds(g, s, d, { ...probeDef.options.bold!, odds: () => -1 })).toBe(0.05)
    expect(optionOdds(g, s, d, { ...probeDef.options.bold!, odds: () => NaN })).toBe(0.5)
    expect([0.65, 0.123, 0.95, 0.05].map(oddsText)).toEqual(['about 65%', 'about 10%', 'about 95%', 'about 5%'])
  })

  it('applyEffects clamps', () => {
    const g = newProbeGame(1)
    g.character.money = 300
    const c = ctxOf(g)
    expect(applyEffects(c, { money: -1e9 }, 'Fine')).toEqual({ paid: 300, earned: 0 })
    expect(g.character.money).toBe(0)
    expect(applyEffects(c, { money: -50 }, 'Fine')).toEqual({ paid: 0, earned: 0 })
    expect(g.character.money).toBe(0)
    expect(applyEffects(c, { money: 1234.4 }, 'Win')).toEqual({ paid: 0, earned: 1234 })
    expect(g.character.money).toBe(1234)
    expect(applyEffects(c, { money: NaN, standing: NaN, fame: Infinity, happiness: NaN, health: NaN }, 'Junk')).toEqual({ paid: 0, earned: 0 })
    expect(applyEffects(c, { standing: 500 }, 'Up')).toEqual({ paid: 0, earned: 0 })
    expect([c.s.standing, c.s.peak]).toEqual([100, 100])
    applyEffects(c, { standing: -500 }, 'Down')
    expect([c.s.standing, c.s.peak]).toEqual([0, 100])
    const stats = { happiness: g.character.stats.happiness, health: g.character.stats.health, fame: g.character.hidden.fame }
    applyEffects(c, { happiness: 500, health: -500, fame: 7 }, 'Mood')
    expect([g.character.stats.happiness, g.character.stats.health, g.character.hidden.fame]).toEqual([100, 0, stats.fame + 7])
    const grudge = (by: number) => applyEffects(c, { grudge: { id: 'probe.rival', name: 'Mia Okafor', by } }, 'Feud')
    grudge(10)
    expect(c.s.memory).toMatchObject([{ id: 'probe.rival', name: 'Mia Okafor', grudge: 10 }])
    grudge(10)
    expect(c.s.memory[0].grudge).toBe(20)
    grudge(500)
    expect(c.s.memory[0].grudge).toBe(100)
    expect(c.s.memory).toHaveLength(1)
  })

  it('values effects the way the digest says', () => {
    const g = newProbeGame(1)
    expect(fxValue(g, {})).toBe(0)
    expect(fxValue(g, { standing: 2, fame: 10, happiness: 5, health: 4 })).toBeCloseTo(2 + 6 + 2 + 2)
    expect(fxValue(g, { money: typicalIncome(g) })).toBeCloseTo(6)
    expect(fxValue(g, { money: NaN })).toBe(0)
  })

  it('picks the same hot item for the sim and the hint, and a hint only with the talent', () => {
    const g = newProbeGame(1)
    const items = ['a', 'b', 'c', 'd']
    expect(items).toContain(hot(g, 'probe', items))
    expect(hot(g, 'probe', items)).toBe(hot(g, 'probe', items))
    expect(honest(g, 'Acting', 'Looks best.')).toEqual({})
    g.character.talent = 'Acting'
    expect(honest(g, 'Acting', 'Looks best.').hint).toContain('Looks best.')
    expect(honest(g, 'Modeling', 'Looks best.')).toEqual({})
  })

  it('then() never moves cash or draws g.rng; text, scene and labels pass voiceProblems', () => {
    const g = newProbeGame(2)
    g.character.talent = 'Acting'
    const s = probeStore.mut(g)
    const d: ProbeData = { fee: 4000 }
    const branch = probeDef.options.safe!.good(g, s, d)
    const before = { money: g.character.money, rng: g.rng, karma: g.character.hidden.karma }
    branch.then!(s, g)
    expect([g.character.money, g.rng]).toEqual([before.money, before.rng])
    expect(g.character.hidden.karma).toBe(before.karma - 3)
    addHidden(g, 'karma', 3)

    const scene = probeDef.scene(g, s, d)
    expect(scene.endsWith('What will you do?')).toBe(true)
    expect(scene.length).toBeLessThanOrEqual(140)
    expect(voiceProblems(scene, 'scene')).toEqual([])
    expect(voiceProblems(probeDef.title, 'title')).toEqual([])
    for (const stance of STANCES) {
      const opt = probeDef.options[stance]!
      expect(opt.label.split(/\s+/).length).toBeLessThanOrEqual(5)
      expect(voiceProblems(opt.label, 'title')).toEqual([])
      for (const b of [opt.good(g, s, d), opt.bad?.(g, s, d)]) {
        if (!b) continue
        const text = b.text({ paid: 1234, earned: 5678 })
        expect(text.length).toBeLessThanOrEqual(120)
        expect(voiceProblems(text, 'outcome')).toEqual([])
      }
    }
  })
})
