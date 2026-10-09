// The Will & Testament menu: who is offered, the honest warnings, shares and charity, the
// "how do you tell them" popups after a change, menus that never touch the state, and the rows on
// a relative's sheet.
import { describe, expect, it } from 'vitest'
import { miscActivities } from '../src/game/activities'
import { learn } from '../src/game/events/will-act'
import { cutRisk, inLineIds, readWill, readWl } from '../src/game/events/will-core'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import type { GameState, MenuAction, MenuGroup, MenuNode, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

const menu = miscActivities.find((n) => n.id === 'will') as MenuGroup

function visible(g: GameState, n: MenuNode): boolean {
  return !('visible' in n) || !n.visible || n.visible(g)
}

function rows(g: GameState): MenuNode[] {
  return menu.children(g).filter((n) => visible(g, n))
}

function act(g: GameState, id: string, input?: string): MenuAction {
  const n = rows(g).find((x) => x.id === id)
  if (!n || n.type !== 'action') throw new Error(`no action ${id}; have ${rows(g).map((r) => r.id).join(', ')}`)
  const why = n.disabledReason?.(g)
  if (why) throw new Error(`${id} disabled: ${why}`)
  n.run(g, input)
  return n
}

function setup(seed = 1) {
  const g = makeTestGame(seed, { age: 62, money: 8_000_000, countryId: 'us' })
  g.log = [{ age: 62, year: g.year, entries: [] }]
  const mk = (relation: Person['relation'], age: number, relationship: number, traits: string[]) => {
    const p = createPerson(g, { relation, age, relationship, traits, money: 30_000, countryId: 'us' })
    p.yearsKnown = Math.min(age, 40)
    return p
  }
  const spouse = mk('spouse', 60, 80, ['calm'])
  const a = mk('child', 34, 75, ['kind'])
  const b = mk('child', 31, 70, ['hot-headed', 'jealous'])
  const gk = mk('grandchild', 8, 80, [])
  const sis = mk('sibling', 58, 70, ['funny'])
  const pal = mk('bestFriend', 62, 85, ['funny'])
  return { g, spouse, a, b, gk, sis, pal }
}

describe('will menu', () => {
  it('offers rows for every kind of relative that can inherit, grouped by role', () => {
    const { g, spouse, a, b, gk, sis, pal } = setup()
    const ids = rows(g).map((r) => r.id)
    for (const p of [spouse, a, b, gk, sis, pal]) expect(ids).toContain(`will.toggle.${p.id}`)
    for (const role of ['spouse', 'child', 'grandchild', 'sibling', 'friend']) expect(ids).toContain(`will.role.${role}`)
    expect(ids).toContain('will.charity')
    expect(ids).toContain('will.even')
    expect(ids).toContain('will.family')
    // Sole-heir rows are for the legal core of the family.
    expect(ids).toContain(`will.sole.${a.id}`)
    expect(ids).not.toContain(`will.sole.${pal.id}`)
  })

  it('warns, honestly, who was counting on a share and is not in the will (the spouse by default)', () => {
    const { g, spouse } = setup()
    const info = rows(g).find((r) => r.id === 'will.waiting')
    expect(info).toBeTruthy()
    expect(info?.type === 'info' && typeof info.text === 'string' ? info.text : '').toContain(spouse.firstName)
  })

  it('shows the real numbers before you remove someone', () => {
    const { g, a } = setup()
    const row = rows(g).find((r) => r.id === `will.toggle.${a.id}`) as MenuAction
    const text = row.confirm!(g)!
    const { quiet, kind } = cutRisk(g, a)
    expect(text).toContain(`(${quiet})`)
    expect(text).toContain(`(${kind})`)
    // The explained number is the anger you actually get when you explain.
    const clone = structuredClone(g)
    const p = clone.people.find((x) => x.id === a.id)!
    learn(clone, p, 'kind')
    expect(readWl(clone, p).anger).toBe(kind)
    // And nobody is warned about someone who isn't in the will.
    const other = rows(g).find((r) => r.id === `will.toggle.${createPerson(g, { relation: 'friend', age: 40, relationship: 10 }).id}`)
    expect(other).toBeUndefined()
  })

  it('removing a child asks how to tell them; the tell popup comes after the notice', () => {
    const { g, a } = setup()
    act(g, `will.toggle.${a.id}`)
    const kinds = g.queue.map((m) => (m.kind === 'choice' ? m.scriptId : m.kind))
    expect(kinds[0]).toBe('notice')
    expect(kinds).toContain('will.tell')
    expect(kinds.indexOf('will.tell')).toBeGreaterThan(kinds.indexOf('notice'))
    expect(inLineIds(g)).not.toContain(a.id)
  })

  it('adds grandchildren, parents, siblings and friends, with a share and a charity slider', () => {
    const { g, gk, sis, pal, a, b } = setup()
    act(g, `will.toggle.${gk.id}`)
    act(g, `will.toggle.${sis.id}`)
    act(g, `will.toggle.${pal.id}`)
    g.queue = []
    expect(inLineIds(g).sort()).toEqual([a.id, b.id, gk.id, sis.id, pal.id].sort())
    const share = rows(g).find((r) => r.id === `will.share.${pal.id}`) as MenuAction
    expect(share.input?.kind).toBe('slider')
    expect(share.input?.min).toBe(10)
    expect(share.input?.max).toBe(100)
    act(g, `will.share.${pal.id}`, '40')
    expect(readWill(g).shares[pal.id]).toBe(40)
    act(g, 'will.charity', '20')
    g.queue = []
    expect(readWill(g).charity).toBe(20)
    const header = menu.header!(g)
    expect(header).toContain('charity (20%)')
    expect(header).toMatch(/\(\d+%\)/)
    // Previews are plain text and pure.
    const before = JSON.stringify(g)
    expect(share.input!.preview!(g, 70)).toMatch(/% of the estate/)
    expect((rows(g).find((r) => r.id === 'will.charity') as MenuAction).input!.preview!(g, 35)).toContain('35%')
    expect(JSON.stringify(g)).toBe(before)
  })

  it('ignores a malformed charity slider value without corrupting the saved will', () => {
    const { g } = setup()
    act(g, 'will.charity', 'not-a-number')
    expect(readWill(g).charity).toBe(0)
    expect(g.queue).toHaveLength(0)
  })

  it('keeps the old rows and phrases: sole heir, divide evenly, spouse and children', () => {
    const { g, spouse, a, b } = setup()
    expect(menu.header!(g)).toMatch(/divided evenly among your 2 children/)
    act(g, `will.sole.${spouse.id}`)
    g.queue = []
    expect(g.character.willBeneficiaries).toEqual([spouse.id])
    expect(menu.header!(g)).toContain(spouse.firstName)
    act(g, 'will.family')
    g.queue = []
    expect(new Set(g.character.willBeneficiaries)).toEqual(new Set([spouse.id, a.id, b.id]))
    act(g, 'will.even')
    g.queue = []
    expect(g.character.willBeneficiaries).toEqual([])
  })

  it('is pure: building the menu, subtitles, warnings and previews touches neither state nor random numbers', () => {
    const { g, a } = setup(5)
    act(g, `will.toggle.${a.id}`)
    g.queue = []
    const before = JSON.stringify(g)
    for (const n of menu.children(g)) {
      if ('subtitle' in n && typeof n.subtitle === 'function') n.subtitle(g)
      if (n.type === 'action') {
        n.confirm?.(g)
        n.disabledReason?.(g)
        n.input?.defaultValue?.(g)
        n.input?.preview?.(g, n.input.min ?? 0)
      }
    }
    menu.header!(g)
    for (const p of g.people) personActions(g, p)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('shows the relative\'s sheet with the anger meter and ways back, once it matters', () => {
    const { g, b } = setup(6)
    expect(personActions(g, b).map((n) => n.id)).not.toContain('will.status')
    act(g, `will.toggle.${b.id}`)
    g.queue = []
    learn(g, b, 'leak')
    const ids = personActions(g, b).map((n) => n.id)
    expect(ids).toEqual(expect.arrayContaining(['will.status', 'will.peace', 'will.restore', 'will.compromise', 'will.gift']))
    const status = personActions(g, b).find((n) => n.id === 'will.status')
    expect(status && status.type === 'info' && typeof status.text === 'string' ? status.text : '').toMatch(/Written out of your will/)
    const restore = personActions(g, b).find((n) => n.id === 'will.restore') as MenuAction
    restore.run(g)
    g.queue = []
    expect(inLineIds(g)).toContain(b.id)
    expect(personActions(g, b).map((n) => n.id)).not.toContain('will.restore')
  })

  it('is closed to the underage and explains when nobody can inherit', () => {
    const g = makeTestGame(7, { age: 16, money: 100 })
    expect(menu.disabledReason!(g)).toBeTruthy()
    const lone = makeTestGame(8, { age: 40, money: 100 })
    const nodes = menu.children(lone)
    expect(nodes[0].type).toBe('info')
    expect(nodes.some((n) => n.id === 'will.charity')).toBe(true)
  })
})
