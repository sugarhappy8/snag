// The ask popups: what the choices are, what each answer does, and that nobody gets money for free.
import { describe, expect, it } from 'vitest'
import { presentAsk, rollAskers, selfMadeOdds, askRound } from '../src/game/business/nepo-asks'
import { readJob } from '../src/game/business/nepo-job'
import { readFamily } from '../src/game/business/nepo-state'
import { bizOf } from '../src/game/business/state'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal } from '../src/game/types'
import { drain, kid, world } from './nepo-kit'

function popup(g: ReturnType<typeof world>['g']): ChoiceModal {
  const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'nepo.ask')
  if (!m) throw new Error('no ask popup')
  return m
}

function answer(g: ReturnType<typeof world>['g'], id: string): void {
  const m = popup(g)
  g.queue = g.queue.filter((x) => x !== m)
  runScript(g, m.scriptId!, id, m.data, m)
}

describe('the ask popup', () => {
  it('offers honest options for one asker: the bottom, what they want, a made-up job, a successor, no', () => {
    const { g, a, b } = world(401)
    const p = kid(g, 26, { smarts: 70, traits: ['ambitious'], entitlement: 70 })
    presentAsk(g, a, b, [{ pid: p.id, want: 3 }])
    const ids = popup(g).choices.map((c) => c.id)
    expect(ids).toEqual(['entry', 'asked', 'cushy', 'groom', 'no'])
    expect(popup(g).text).toContain(p.firstName)
    expect(popup(g).title).toBe('Can I Work for You?')
  })

  it('a teenager gets a summer-job popup with no promotion, made-up job or successor options', () => {
    const { g, a, b } = world(402)
    const p = kid(g, 15)
    presentAsk(g, a, b, [{ pid: p.id, want: 0 }])
    expect(popup(g).choices.map((c) => c.id)).toEqual(['entry', 'no'])
    expect(popup(g).title).toBe('Summer Job?')
    answer(g, 'entry')
    drain(g)
    expect(readJob(p)?.part).toBe(true)
    expect(readFamily(bizOf(g, a).family).askYear).toBe(g.year)
  })

  it('the answers: bottom, the job they asked for, a made-up job, a successor', () => {
    for (const [choice, check] of [
      ['entry', (j: NonNullable<ReturnType<typeof readJob>>) => expect(j.rank).toBeLessThanOrEqual(1)],
      ['asked', (j: NonNullable<ReturnType<typeof readJob>>) => expect(j.rank).toBeGreaterThanOrEqual(2)],
      ['cushy', (j: NonNullable<ReturnType<typeof readJob>>) => expect(j.kind).toBe('cushy')],
      ['groom', (j: NonNullable<ReturnType<typeof readJob>>) => expect(j.groom).toBe(true)],
    ] as const) {
      const { g, a, b } = world(403)
      const p = kid(g, 26, { smarts: 70, traits: ['ambitious'], entitlement: 70 })
      presentAsk(g, a, b, [{ pid: p.id, want: 3 }])
      answer(g, choice)
      drain(g)
      const j = readJob(p)
      expect(j).not.toBeNull()
      check(j!)
    }
  })

  it('saying no: they resent it or go and earn their own way; either way it is remembered and the odds are what the hint says', () => {
    let selfMade = 0
    let sulked = 0
    for (let seed = 410; seed < 450; seed++) {
      const { g, a, b } = world(seed)
      const p = kid(g, 24, { smarts: 70, traits: ['ambitious', 'serious'] })
      const rel = p.relationship
      presentAsk(g, a, b, [{ pid: p.id, want: 1 }])
      answer(g, 'no')
      drain(g)
      expect(readJob(p)).toBeNull()
      expect(p.data.nepoNo).toBeDefined()
      if (p.data.nepoSelfMade !== undefined) {
        selfMade += 1
        expect(Number(p.data.entitlement ?? 0)).toBe(0)
        expect(p.relationship).toBeGreaterThanOrEqual(rel)
      } else {
        sulked += 1
        expect(p.relationship).toBeLessThan(rel)
      }
    }
    const { g } = world(410)
    const odds = selfMadeOdds(kid(g, 24, { smarts: 70, traits: ['ambitious', 'serious'] }))
    expect(selfMade).toBeGreaterThan(0)
    expect(sulked).toBeGreaterThan(0)
    expect(Math.abs(selfMade / 40 - odds)).toBeLessThan(0.3)
  })

  it('several askers come as one bundle: all at the bottom, the normal process, one at a time, or none', () => {
    const { g, a, b } = world(420)
    const smart = kid(g, 22, { smarts: 95, traits: ['ambitious', 'serious'] })
    const dim = kid(g, 22, { smarts: 5, traits: ['lazy', 'rebellious'], entitlement: 100 })
    const third = kid(g, 19, { smarts: 50 })
    presentAsk(g, a, b, [{ pid: smart.id, want: 1 }, { pid: dim.id, want: 2 }, { pid: third.id, want: 0 }])
    expect(popup(g).title).toBe('The Family Wants In')
    const ids = popup(g).choices.map((c) => c.id)
    expect(ids).toEqual(['entryAll', 'process', 'askedAll', 'oneByOne', 'noAll'])
    const snapshot = structuredClone(g)
    answer(snapshot, 'process')
    drain(snapshot)
    expect(readJob(snapshot.people.find((p) => p.id === smart.id)!)).not.toBeNull()
    expect(readJob(snapshot.people.find((p) => p.id === dim.id)!)).toBeNull()
    const s2 = structuredClone(g)
    answer(s2, 'oneByOne')
    expect(s2.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'nepo.ask').length).toBe(3)
    const s3 = structuredClone(g)
    answer(s3, 'noAll')
    drain(s3)
    expect(s3.people.some((p) => readJob(p))).toBe(false)
    const s4 = structuredClone(g)
    answer(s4, 'entryAll')
    drain(s4)
    expect(s4.people.filter((p) => readJob(p)).length).toBe(3)
  })

  it('an in-law or a cousin only joins your contacts if hired, with a job and a kinship word', () => {
    let tried = 0
    for (let seed = 430; seed < 520 && tried < 1; seed++) {
      const { g, a, b } = world(seed)
      const people = g.people.length
      // Roll until an outsider shows up.
      let asked = rollAskers(g, b)
      for (let i = 0; i < 400 && !asked.some((k) => k.out); i++) asked = rollAskers(g, b)
      const out = asked.find((k) => k.out)
      if (!out) continue
      tried += 1
      presentAsk(g, a, b, [out])
      expect(g.people.length).toBe(people)
      answer(g, 'entry')
      drain(g)
      const added = g.people.filter((p) => typeof p.data.kin === 'string' && p.data.kin)
      expect(added.length).toBe(1)
      expect(readJob(added[0])).not.toBeNull()
      expect(added[0].relation).toBe('coworker')
    }
    expect(tried).toBe(1)
  })

  it('never shows more than one ask popup in a year, and not at all to a minor or a prisoner', () => {
    const { g, b } = world(440)
    for (let i = 0; i < 4; i++) kid(g, 20 + i, { traits: ['ambitious'], entitlement: 70 })
    b.founded = 2000
    let popups = 0
    for (let y = 0; y < 30; y++) {
      g.year += 1
      g.yearActions = {}
      g.queue = []
      readFamily(b.family)
      askRound(g)
      popups += g.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'nepo.ask').length
      expect(g.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'nepo.ask').length).toBeLessThanOrEqual(1)
      drain(g)
    }
    expect(popups).toBeGreaterThan(0)
    g.character.age = 16
    g.queue = []
    g.yearActions = {}
    for (let i = 0; i < 30; i++) askRound(g)
    expect(g.queue.length).toBe(0)
  })
})
