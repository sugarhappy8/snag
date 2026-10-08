// Review fixes for the will feud: a child the will forgot is cut out at the reading, gifts can't be
// milked for trust, teenagers don't stage confrontations, and nothing sounds modern before its time.
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { addHeir, changeWill } from '../src/game/events/will-act'
import { readWl, updateWl } from '../src/game/events/will-core'
import { planEstate } from '../src/game/events/will-estate'
import { yearlyWillFeuds } from '../src/game/events/will-feud'
import { payOff, queuePress } from '../src/game/events/will-scenes'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, NoticeModal, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

function base(year = 2026): { g: GameState; a: Person; b: Person } {
  const g = makeTestGame(31, { age: 78, money: 6_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.year = year
  g.log = [{ age: g.character.age, year, entries: [] }]
  const mk = (age: number, rel: number): Person => {
    const p = createPerson(g, { relation: 'child', age, relationship: rel, traits: ['kind'], money: 20_000, countryId: 'us' })
    p.yearsKnown = age
    return p
  }
  return { g, a: mk(50, 75), b: mk(46, 70) }
}

describe('a child the will forgot', () => {
  it('is cut out at the reading when a written will never named them', () => {
    const { g, a, b } = base()
    changeWill(g, (gg, w) => {
      gg.character.willBeneficiaries = [a.id, b.id]
      w.shares = {}
    })
    const late = createPerson(g, { relation: 'child', age: 30, relationship: 80, traits: ['hot-headed'], money: 10_000, countryId: 'us' })
    late.yearsKnown = 30
    g.queue = []
    killCharacter(g, 'Old Age')
    const n = structuredClone(g)
    const plan = planEstate(n, { estate: 6_000_000, heirId: a.id, adult: true, hasProperty: false, cashAfterDebts: 6_000_000 })
    const ids = plan.cutOut.map((c) => c.id)
    expect(ids).toContain(late.id)
    expect(plan.cutOut.find((c) => c.id === late.id)!.anger).toBeGreaterThan(20)
  })

  it('does not count as cut out when nobody ever wrote a will', () => {
    const { g, a } = base()
    killCharacter(g, 'Old Age')
    const n = structuredClone(g)
    const plan = planEstate(n, { estate: 6_000_000, heirId: a.id, adult: true, hasProperty: false, cashAfterDebts: 6_000_000 })
    expect(plan.cutOut).toEqual([])
  })
})

describe('money cannot buy trust for free', () => {
  it('a gift only earns goodwill for the anger it actually soothed', () => {
    const { g, a } = base()
    updateWl(g, a, (w) => {
      w.known = true
      w.cut = true
      w.anger = 2
    })
    const before = a.relationship
    expect(payOff(g, a, 500_000)).toBeTruthy()
    expect(a.relationship - before).toBeLessThanOrEqual(0)
    expect(readWl(g, a).anger).toBe(0)
  })
})

describe('teenagers', () => {
  it('never confront you about the will, however angry', () => {
    const { g } = base()
    g.character.age = 50
    const teen = createPerson(g, { relation: 'child', age: 14, relationship: 70, traits: ['hot-headed', 'jealous'], money: 0, countryId: 'us' })
    teen.yearsKnown = 14
    changeWill(g, (gg, w) => {
      gg.character.willBeneficiaries = gg.people.filter((p) => p.id !== teen.id && p.relation === 'child').map((p) => p.id)
      w.shares = {}
    })
    g.queue = []
    updateWl(g, teen, (w) => {
      w.cut = true
      w.known = true
      w.anger = 90
      w.stage = 3
    })
    for (let y = 0; y < 8; y++) {
      g.yearActions = {}
      g.year += 1
      g.character.age += 1
      for (const p of g.people) p.age += 1
      teen.age = Math.min(teen.age, 15)
      yearlyWillFeuds(g)
    }
    expect(g.queue.some((m) => m.kind === 'choice' && (m as ChoiceModal).scriptId === 'will.confront')).toBe(false)
  })
})

describe('era wording', () => {
  it('the tabloid story has no comment section before social media', () => {
    for (const [year, modern] of [[1955, false], [2026, true]] as const) {
      const { g, b } = base(year)
      queuePress(g, b)
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice')!
      runScript(g, m.scriptId!, 'ignore', m.data, m)
      const text = g.queue
        .filter((x): x is NoticeModal => x.kind === 'notice')
        .map((x) => x.text)
        .join(' ')
      expect(/comment section/i.test(text)).toBe(modern)
    }
  })
})

void addHeir
