// Being rich, felt: regressions found in review (events/wealth*.ts). Each test pins one bug:
// sliders that started outside their range, first-person log lines in the second person, weddings
// that never happened, a karma farm, a will that dropped the spouse, prison letters that talked
// about pillows, a tuition ask asked twice in one year, a "give less" popup you couldn't back out
// of, charity options you couldn't pay for and a Money section for babies.
import { describe, expect, it } from 'vitest'
import { askDef } from '../src/game/events/wealth-catalog'
import { entitlement, readTies, wealthTier } from '../src/game/events/wealth-core'
import { cutFromWill, setAllowance } from '../src/game/events/wealth-kids'
import { cashShare, wealthNodes } from '../src/game/events/wealth-menu'
import { ASK_SCRIPT, BUNDLE_SCRIPT, LESS_SCRIPT, askChoices, presentAsk, presentBundle } from '../src/game/events/wealth-resolve'
import { requestCandidates } from '../src/game/events/wealth'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, InputModal, MenuAction, MenuGroup, MenuNode, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

function richGame(seed: number, money: number, opts: { country?: string; year?: number; age?: number } = {}): GameState {
  const g = makeTestGame(seed, { age: opts.age ?? 45, money, countryId: opts.country ?? 'us', residence: { status: 'renting', rent: 0 } })
  g.year = opts.year ?? 2026
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  return g
}

function find(nodes: MenuNode[], id: string, g: GameState): MenuAction | MenuGroup | undefined {
  for (const n of nodes) {
    if ((n.type === 'action' || n.type === 'menu') && n.id === id) return n
    if (n.type === 'menu') {
      const hit = find(n.children(g), id, g)
      if (hit) return hit
    }
  }
  return undefined
}

function ask(g: GameState, id: string, p?: Person): ChoiceModal {
  const a = askDef(id)!.build(g, Math.max(1, wealthTier(g)), p)
  expect(a).toBeTruthy()
  presentAsk(g, a!)
  return g.queue.pop() as ChoiceModal
}

function logLines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

describe('wealth review fixes', () => {
  it('keeps an allowance slider in range after the fortune shrinks', () => {
    const g = richGame(1, 60_000_000)
    const kid = createPerson(g, { relation: 'child', age: 20, relationship: 70 })
    setAllowance(g, kid, 900_000)
    g.queue = []
    const set = readTies(g, kid).allowance
    expect(set).toBeGreaterThan(100_000)
    g.character.money = 3_000_000
    const slider = find(wealthNodes(g, kid), 'wealth.allowance', g) as MenuAction
    const { min, max } = slider.input!
    const dv = Number(slider.input!.defaultValue!(g))
    expect(dv).toBeGreaterThanOrEqual(min!)
    expect(dv).toBeLessThanOrEqual(max!)
    // Keeping it as it is doesn't silently cut it.
    slider.run(g, String(dv))
    expect(readTies(g, kid).allowance).toBe(set)
  })

  it('writes the long-lost relative in the first person in the life log', () => {
    const g = richGame(2, 40_000_000)
    const m = ask(g, 'relative.door')
    runScript(g, ASK_SCRIPT, 'give', m.data, m)
    const line = logLines(g).find((t) => /^I gave/.test(t))!
    expect(line).toMatch(/^I gave my /)
    expect(line).not.toMatch(/\byour\b/)
    expect(line).not.toMatch(/for a long-lost relative/)
  })

  it('a sibling or friend who asked about their wedding is married afterwards (and never asks again)', () => {
    for (const [id, relation] of [['sibling.wedding', 'sibling'], ['friend.wedding', 'friend']] as const) {
      for (const answer of ['give', 'no']) {
        const g = richGame(3, 40_000_000)
        const p = createPerson(g, { relation, age: 30, relationship: 70 })
        const m = ask(g, id, p)
        const choice = m.choices.find((c) => c.id === answer) ?? m.choices[0]
        runScript(g, ASK_SCRIPT, choice.id, m.data, m)
        expect(p.data.married, `${id}/${answer}`).toBe(true)
        expect(typeof p.data.spouseName).toBe('string')
        g.year += 10
        expect(requestCandidates(g, 3).some((c) => c.def.id === id && c.p?.id === p.id)).toBe(false)
      }
    }
    // Refused inside a bundle of small asks, the friend still gets married.
    const g = richGame(4, 900_000_000)
    const f = createPerson(g, { relation: 'friend', age: 30, relationship: 70 })
    const kid = createPerson(g, { relation: 'child', age: 9, relationship: 70 })
    const wed = askDef('friend.wedding')!.build(g, 3, f)!
    const toy = askDef('kid.toy')!.build(g, 3, kid)!
    presentBundle(g, [wed, toy])
    const b = g.queue.pop() as ChoiceModal
    runScript(g, BUNDLE_SCRIPT, 'none', b.data, b)
    expect(f.data.married).toBe(true)
  })

  it('forgiving pocket change is not a karma or friendship farm', () => {
    const g = richGame(5, 10_000_000)
    const friend = createPerson(g, { relation: 'friend', age: 40, relationship: 50 })
    const lend = find(wealthNodes(g, friend), 'wealth.lend', g) as MenuAction
    lend.run(g, '100')
    g.queue = []
    const karma = g.character.hidden.karma
    const rel = friend.relationship
    const forgive = find(wealthNodes(g, friend), 'wealth.forgive', g) as MenuAction
    forgive.run(g)
    expect(g.character.hidden.karma).toBe(karma)
    expect(friend.relationship - rel).toBeLessThanOrEqual(3)
    // A real debt (a year's income) earns real gratitude and a little karma.
    const g2 = richGame(5, 10_000_000)
    const f2 = createPerson(g2, { relation: 'friend', age: 40, relationship: 50 })
    ;(find(wealthNodes(g2, f2), 'wealth.lend', g2) as MenuAction).run(g2, '90000')
    g2.queue = []
    const k2 = g2.character.hidden.karma
    const r2 = f2.relationship
    ;(find(wealthNodes(g2, f2), 'wealth.forgive', g2) as MenuAction).run(g2)
    expect(g2.character.hidden.karma).toBeGreaterThan(k2)
    expect(f2.relationship - r2).toBeGreaterThanOrEqual(5)
  })

  it('writing a spoiled kid out of the will keeps the spouse the will already names', () => {
    const g = richGame(6, 40_000_000, { age: 65 })
    const a = createPerson(g, { relation: 'child', age: 35, relationship: 60 })
    const b = createPerson(g, { relation: 'child', age: 33, relationship: 60 })
    const sp = createPerson(g, { relation: 'spouse', age: 63, relationship: 80 })
    g.character.willBeneficiaries = [sp.id, a.id, b.id]
    cutFromWill(g, a)
    expect(g.character.willBeneficiaries).toEqual([sp.id, b.id])
    // An even split among the kids becomes an even split among the others.
    g.character.willBeneficiaries = []
    cutFromWill(g, b)
    expect(g.character.willBeneficiaries).toEqual([a.id])
  })

  it('asks from prison arrive as letters that make sense in prison', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = richGame(seed, 40_000_000)
      g.character.prison = { name: 'State Pen', security: 'medium', crime: 'fraud', sentenceYears: 5, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
      const kid = createPerson(g, { relation: 'child', age: 16, relationship: 70 })
      const car = ask(g, 'kid.car', kid)
      expect(car.text).toMatch(/letter/)
      expect(car.text).not.toMatch(/pillow|dealership|parallel park/)
      const adult = createPerson(g, { relation: 'child', age: 22, relationship: 70 })
      const bail = ask(g, 'kid.bail', adult)
      expect(bail.text).not.toMatch(/one call/)
      runScript(g, ASK_SCRIPT, 'give', bail.data, bail)
      const result = g.queue.pop()!
      expect(result.kind === 'notice' ? result.text : '').not.toMatch(/hugged you/)
    }
  })

  it('does not ask about tuition when the family popup about it is already waiting', () => {
    const g = richGame(7, 40_000_000)
    const kid = createPerson(g, { relation: 'child', age: 18, relationship: 70, occupation: 'University Student' })
    kid.data.tuitionAsked = true
    expect(requestCandidates(g, 2).some((c) => c.def.id === 'kid.tuition' && c.p?.id === kid.id)).toBe(true)
    const family: ChoiceModal = { kind: 'choice', id: 'q1', title: 'College Tuition', text: '', choices: [{ id: 'pay', label: 'Pay' }], source: 'script', scriptId: 'rel.child.tuition', data: { pid: kid.id, tuition: 40_000 } }
    g.queue.push(family)
    expect(requestCandidates(g, 2).some((c) => c.def.id === 'kid.tuition' && c.p?.id === kid.id)).toBe(false)
  })

  it('lets you back out of "give less" (zero means no) and never takes money for it', () => {
    const g = richGame(8, 20_000_000)
    const kid = createPerson(g, { relation: 'child', age: 19, relationship: 70 })
    const m = ask(g, 'kid.vacation', kid)
    expect(m.choices.some((c) => c.id === 'less')).toBe(true)
    runScript(g, ASK_SCRIPT, 'less', m.data, m)
    const input = g.queue.pop() as InputModal
    expect(input.kind).toBe('input')
    expect(input.input).toBe('slider')
    expect(input.min).toBe(0)
    const dv = Number(input.defaultValue)
    expect(dv).toBeGreaterThan(0)
    expect(dv).toBeLessThanOrEqual(input.max!)
    const cash = g.character.money
    runScript(g, LESS_SCRIPT, '0', input.data, input)
    expect(g.character.money).toBe(cash)
    expect(readTies(g, kid).history.at(-1)?.ans).toBe('no')
  })

  it('only offers charity gifts you can pay for', () => {
    const g = richGame(9, 900_000_000)
    g.character.hidden.fame = 80
    const a = askDef('charity.gala')!.build(g, 4)!
    expect(askChoices(g, a).filter((c) => /^d\d$/.test(c.id))).toHaveLength(3)
    g.character.money = 1_000
    expect(askChoices(g, a).filter((c) => /^d\d$/.test(c.id))).toHaveLength(0)
    expect(askChoices(g, a).some((c) => c.id === 'no')).toBe(true)
  })

  it('Give Money counts toward what you have given, and a huge handout spoils a kid', () => {
    const g = richGame(11, 50_000_000)
    const kid = createPerson(g, { relation: 'child', age: 15, relationship: 70 })
    const give = (personActions(g, kid).find((n) => n.type === 'action' && n.id.endsWith('giveMoney')) as MenuAction | undefined)!
    expect(give).toBeTruthy()
    expect(give.input?.kind).toBe('slider')
    expect(Number(give.input!.defaultValue!(g))).toBeLessThanOrEqual(10_000)
    give.run(g, '500000')
    expect(readTies(g, kid).given).toBe(500_000)
    expect(entitlement(kid)).toBeGreaterThan(0)
  })

  it('has no Money section for babies, and slider captions never say 0%', () => {
    const g = richGame(10, 5_000_000)
    const baby = createPerson(g, { relation: 'child', age: 1, relationship: 90 })
    expect(wealthNodes(g, baby)).toEqual([])
    baby.age = 4
    expect(wealthNodes(g, baby)).toHaveLength(1)
    expect(cashShare(g, 100)).toBe('Under 1% of your cash')
    expect(cashShare(g, 2_500_000)).toBe('50% of your cash')
  })
})
