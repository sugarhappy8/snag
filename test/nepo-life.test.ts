// Connections for rich or famous parents without a company: arranged jobs, openings for the kids of
// the famous. They cost favors, can embarrass the kid and invite the press, and make no money for you.
import { describe, expect, it } from 'vitest'
import { callOdds, favorsSpent, lessonCost, ownOdds, yearlyNepoLife } from '../src/game/events/nepo-life'
import { runScript } from '../src/game/scripts'
import { createNewLife } from '../src/game/life'
import type { ChoiceModal, GameState, NoticeModal } from '../src/game/types'
import { drain, kid } from './nepo-kit'

function rich(seed: number, opts: { fame?: number; money?: number; year?: number } = {}): GameState {
  const g = createNewLife({ seed, year: 1990, countryId: 'us' })
  g.queue = []
  g.year = opts.year ?? 2026
  g.character.age = 50
  g.character.money = opts.money ?? 60_000_000
  g.character.hidden.fame = opts.fame ?? 0
  g.character.job = null
  g.assets = []
  g.people = []
  g.yearActions = {}
  return g
}

function popup(g: GameState): ChoiceModal | undefined {
  return g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'nepo.life')
}

function tryYears(g: GameState, years = 300): ChoiceModal | undefined {
  for (let i = 0; i < years; i++) {
    g.yearActions = {}
    g.queue = []
    for (const p of g.people) delete p.data.nepoLife
    yearlyNepoLife(g)
    const m = popup(g)
    if (m) return m
  }
  return undefined
}

describe('connections for rich and famous parents', () => {
  it('only comes up for the rich or the famous, with kids of the right age, and one popup at most', () => {
    const poor = rich(501, { money: 20_000, fame: 0 })
    kid(poor, 17)
    expect(tryYears(poor, 200)).toBeUndefined()
    const none = rich(502)
    expect(tryYears(none, 200)).toBeUndefined()
    const g = rich(503)
    kid(g, 17)
    kid(g, 22)
    const m = tryYears(g)
    expect(m).toBeDefined()
    expect(g.queue.filter((x) => x.kind === 'choice').length).toBe(1)
    expect(m!.choices.map((c) => c.id)).toEqual(['call', 'own'])
  })

  it('a famous parent can open doors in acting or music (with lessons as the slower road)', () => {
    const g = rich(504, { fame: 70 })
    kid(g, 19, { smarts: 50 })
    let seen = false
    for (let i = 0; i < 400 && !seen; i++) {
      const m = tryYears(g, 20)
      if (m?.choices.some((c) => c.id === 'lessons')) seen = true
    }
    expect(seen).toBe(true)
  })

  it('a parent who owns a company gets the job asks from the company instead', () => {
    const g = rich(505)
    kid(g, 17)
    g.assets.push({ id: 'biz1', kind: 'business', name: 'X', emoji: 'x', value: 1, purchasePrice: 1, purchasedAge: 30, upkeep: 0, details: { industry: 'restaurant', share: 1 } } as never)
    expect(tryYears(g, 200)).toBeUndefined()
  })

  it('calling in favors wears them out: the odds fall each time, and fade over the years', () => {
    const g = rich(506)
    const p = kid(g, 20)
    const before = callOdds(g, p, 'intern')
    for (let i = 0; i < 4; i++) {
      const m = (kid(g, 17), tryYears(g, 400))
      if (!m) break
      g.queue = []
      runScript(g, m.scriptId!, 'call', m.data, m)
      drain(g)
    }
    expect(favorsSpent(g)).toBeGreaterThan(0)
    expect(callOdds(g, p, 'intern')).toBeLessThan(before)
    g.year += 12
    expect(favorsSpent(g)).toBe(0)
    expect(callOdds(g, p, 'intern')).toBeCloseTo(before, 5)
  })

  it('making the call never earns the parent money; the kid gets a modest wage and a bigger sense of entitlement', () => {
    let worked = 0
    for (let seed = 510; seed < 560; seed++) {
      const g = rich(seed)
      const p = kid(g, 20, { smarts: 70 })
      const m = tryYears(g)
      if (!m) continue
      const cash = g.character.money
      const kidCash = p.money
      const ent = Number(p.data.entitlement ?? 0)
      runScript(g, m.scriptId!, 'call', m.data, m)
      expect(g.character.money).toBeLessThanOrEqual(cash)
      const note = g.queue.find((x): x is NoticeModal => x.kind === 'notice')
      expect(note).toBeDefined()
      if (p.data.nepoArranged !== undefined) {
        worked += 1
        expect(Number(p.data.entitlement ?? 0)).toBeGreaterThan(ent)
        expect(p.money).toBeGreaterThanOrEqual(kidCash)
        expect(p.money - kidCash).toBeLessThan(120_000)
      }
    }
    expect(worked).toBeGreaterThan(0)
  })

  it('letting them find their own way can work, and then makes the kid stronger', () => {
    let alone = 0
    for (let seed = 570; seed < 640; seed++) {
      const g = rich(seed)
      const p = kid(g, 20, { smarts: 70, traits: ['ambitious'], entitlement: 40 })
      const m = tryYears(g)
      if (!m) continue
      runScript(g, m.scriptId!, 'own', m.data, m)
      if (typeof p.data.nepoSelfMade === 'number') {
        alone += 1
        expect(Number(p.data.entitlement ?? 0)).toBeLessThan(40)
      }
    }
    expect(alone).toBeGreaterThan(0)
    const g = rich(641)
    expect(ownOdds(kid(g, 20, { smarts: 90, traits: ['ambitious'] }))).toBeGreaterThan(ownOdds(kid(g, 20, { smarts: 10, traits: ['lazy'], entitlement: 80 })))
  })

  it('lessons cost real money and cannot be bought without it', () => {
    const g = rich(650, { fame: 70 })
    const p = kid(g, 19)
    const cost = lessonCost(g)
    expect(cost).toBeGreaterThan(0)
    const m = { scriptId: 'nepo.life', data: { pid: p.id, kind: 'screen' } }
    const cash = g.character.money
    runScript(g, m.scriptId, 'lessons', m.data as never, {} as never)
    expect(g.character.money).toBe(cash - cost)
    expect(p.data.nepoCraft).toBe(1)
    g.character.money = 0
    g.queue = []
    runScript(g, m.scriptId, 'lessons', m.data as never, {} as never)
    expect(g.character.money).toBe(0)
    expect(p.data.nepoCraft).toBe(1)
  })

  it('speaks in the words of its era: no streaming or social media in 1935', () => {
    const g = rich(660, { fame: 80, year: 1935 })
    kid(g, 18)
    const texts: string[] = []
    for (let i = 0; i < 80; i++) {
      const m = tryYears(g, 30)
      if (!m) continue
      texts.push(m.title, m.text, ...m.choices.map((c) => c.label))
      runScript(g, m.scriptId!, 'call', m.data, m)
      for (const n of g.queue) if (n.kind === 'notice') texts.push(n.title, n.text)
    }
    const all = texts.join(' ')
    expect(all.length).toBeGreaterThan(50)
    expect(all).not.toMatch(/stream|social|viral|post|nepo baby|television|internet|Intern\b/i)
  })
})
