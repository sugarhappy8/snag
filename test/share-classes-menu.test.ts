// Share classes, task 4: the Share Classes rows under Capital & Ownership and beside Go Public. The rows say
// what each structure would do to the votes and the price, are blocked for the reasons classBlock gives,
// and change the company through changeClasses.
import { describe, expect, it } from 'vitest'
import '../src/game/business'
import { businessAssetView } from '../src/game/business'
import { passOdds } from '../src/game/business/board-vote'
import { classOption, classesKey, classesNode, CLASS_CHOICES, changeClasses, recapProposal, type ClassChoice } from '../src/game/business/share-classes-menu'
import { bizOf, readBiz } from '../src/game/business/state'
import { yearActionsUsed } from '../src/game/core'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { openTiles } from './helpers'
import { findNode, founder, listed, listedGroup, privateCompany } from './own-listing-kit'

function subtitleOf(g: GameState, n: MenuNode): string {
  if (n.type !== 'menu' && n.type !== 'action') return ''
  return typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? '')
}

function rowsOf(g: GameState, assetId: string): MenuAction[] {
  const view = businessAssetView(g, g.assets.find((x) => x.id === assetId)!)
  const node = findNode(g, view, `biz.classes.${assetId}`) as MenuGroup
  return node.children(g) as MenuAction[]
}

function row(g: GameState, assetId: string, choice: ClassChoice): MenuAction {
  const found = rowsOf(g, assetId).find((n) => n.id === `biz.classes.${assetId}.${choice}`)
  if (!found) throw new Error(`no row for ${choice}`)
  return found
}

function noticesTitled(g: GameState, title: string): string[] {
  const out: string[] = []
  for (const m of g.queue) if (m.kind === 'notice' && m.title === title) out.push(m.text)
  return out
}

describe('the Share Classes rows', () => {
  it('is under Capital and beside Go Public', () => {
    const g = founder()
    const { a } = privateCompany(g)
    const view = openTiles(g, businessAssetView(g, a))
    const id = `biz.classes.${a.id}`
    // Beside Go Public, in the Exit section: the IPO row, then the classes.
    const at = view.findIndex((n) => n.id === `biz.ipo.${a.id}`)
    expect(at).toBeGreaterThan(0)
    expect(view[at + 1].id).toBe(id)
    // Under Capital & Ownership.
    const capital = findNode(g, view, `biz.rescue.${a.id}`) as MenuGroup
    expect(capital.children(g).some((n) => n.id === id)).toBe(true)
    const node = view[at + 1] as MenuGroup
    expect(node.type).toBe('menu')
    expect(node.label).toBe('Share Classes')
    expect(node.emoji).toBe('🗳️')

    // A listed company has no Go Public, so only the Capital & Ownership one.
    const h = founder()
    const x = listed(h)
    const listedView = openTiles(h, businessAssetView(h, x.a))
    expect(listedView.some((n) => n.id === id.replace(a.id, x.a.id))).toBe(false)
    expect(listedView.some((n) => n.id.startsWith('biz.ipo.'))).toBe(false)
    const listedCapital = findNode(h, listedView, `biz.rescue.${x.a.id}`) as MenuGroup
    expect(listedCapital.children(h).some((n) => n.id === `biz.classes.${x.a.id}`)).toBe(true)
  })

  it('is not offered to a division of a group', () => {
    const g = founder()
    const { members } = listedGroup(g, 'us', 0.7)
    for (const a of members) {
      const view = businessAssetView(g, a)
      expect(findNode(g, view, `biz.classes.${a.id}`)).toBeUndefined()
      const capital = findNode(g, view, `biz.rescue.${a.id}`) as MenuGroup
      expect(capital.children(g).some((n) => n.id === `biz.classes.${a.id}`)).toBe(false)
    }
  })

  it('names the structure the company has', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    const node = classesNode(a)
    expect(node.id).toBe(`biz.classes.${a.id}`)
    expect(subtitleOf(g, node)).toBe('One class: every share has one vote')
    b.classes = { kind: 'ab', hi: 1 }
    expect(subtitleOf(g, node)).toBe('Founder class: B has 10 votes, A has 1')
    b.classes = { kind: 'nv', hi: 1 }
    expect(subtitleOf(g, node)).toBe('Non-voting float: the public has no vote')
    // A damaged record is one class.
    b.classes = { kind: 'zz' } as never
    expect(subtitleOf(g, node)).toBe('One class: every share has one vote')
    b.classes = 7 as never
    expect(subtitleOf(g, node)).toBe('One class: every share has one vote')
  })

  it('opens with the header that fits where the company stands', () => {
    const g = founder()
    const { a } = privateCompany(g)
    const node = classesNode(a)
    expect(node.header?.(g)).toBe(`Pick how ${a.name}'s shares are sold at the IPO. Investors pay less for shares with fewer votes.`)
    const h = founder()
    const x = listed(h)
    expect(classesNode(x.a).header?.(h)).toBe('Changing the classes takes a board vote, once a year. The share price moves when it passes.')
  })

  it('has one row per structure', () => {
    const g = founder()
    const { a } = privateCompany(g)
    const kids = classesNode(a).children(g) as MenuAction[]
    expect(kids.map((n) => n.id)).toEqual(CLASS_CHOICES.map((c) => `biz.classes.${a.id}.${c}`))
    expect(kids.map((n) => n.label)).toEqual(['One Class of Shares', 'Founder Class (A/B)', 'Non-Voting Float'])
    for (const n of kids) {
      expect(n.type).toBe('action')
      expect(n.emoji).toBe('🗳️')
    }
  })

  it('the rows say what each choice does', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    b.share = 1
    // One class is the current choice: it says so.
    expect(subtitleOf(g, row(g, a.id, 'single'))).toMatch(/^Current\. You'd hold \d+% of the votes after a 25% float\.$/)
    const ab = subtitleOf(g, row(g, a.id, 'ab'))
    expect(ab).toContain('of the votes after a 25% float')
    expect(ab).toContain('The market pays 4% less.')
    expect(subtitleOf(g, row(g, a.id, 'nv'))).toContain('The market pays 7% less.')
    // With a plan set, going back to one class costs nothing.
    b.classes = { kind: 'ab', hi: 1 }
    expect(subtitleOf(g, row(g, a.id, 'single'))).toContain('No price cost.')
    expect(subtitleOf(g, row(g, a.id, 'ab'))).toMatch(/^Current\. /)
    // The votes it shows are the votes the option works out.
    const option = classOption(g, a, readBiz(g, a), 'nv')
    expect(subtitleOf(g, row(g, a.id, 'nv'))).toContain(`You'd hold ${(option.votes * 100).toFixed(0)}% of the votes`)
  })

  it('a listed company: the current row says the votes it holds, the others the price move', () => {
    const g = founder(3)
    const { a, b } = listed(g, { share: 0.9 })
    expect(subtitleOf(g, row(g, a.id, 'single'))).toBe('Current. You hold 90% of the votes.')
    const ab = subtitleOf(g, row(g, a.id, 'ab'))
    expect(ab).toMatch(/^You'd hold \d+% of the votes\. The market pays 4% less\.$/)
    expect(ab).not.toContain('float')
    expect(changeClasses(g, a.id, 'ab')).toBe(true)
    // Back to one class: the price rises, it does not fall.
    expect(subtitleOf(g, row(g, a.id, 'single'))).toMatch(/^You'd hold 90% of the votes\. The price rises about 4%\.$/)
    expect(subtitleOf(g, row(g, a.id, 'ab'))).toMatch(/^Current\. You hold \d+% of the votes\.$/)
    // And across: founder shares to a non-voting float costs the difference.
    expect(subtitleOf(g, row(g, a.id, 'nv'))).toContain('The market pays 3% less.')
    expect(b.classes).toEqual({ kind: 'ab', hi: b.share })
  })

  it('the confirm names the vote and the price', () => {
    const g = founder(3)
    const { a, b } = listed(g, { share: 0.9 })
    const ab = row(g, a.id, 'ab').confirm?.(g)
    expect(ab).toBe(`Change ${a.name} to founder shares? The board votes first. The price falls about 4%.`)
    expect(row(g, a.id, 'nv').confirm?.(g)).toContain('falls about 7%')
    // Going back to one class raises the price.
    b.classes = { kind: 'ab', hi: b.share }
    const back = row(g, a.id, 'single').confirm?.(g)
    expect(back).toContain('The board votes first.')
    expect(back).toContain('rises about 4%')
    expect(back).toContain('to one class of shares')
    // A private company's rows have no confirm.
    const h = founder()
    const x = privateCompany(h)
    for (const n of classesNode(x.a).children(h)) {
      expect(n.type === 'action' && n.confirm).toBeFalsy()
    }
  })

  it('running a row changes the company', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    row(g, a.id, 'ab').run(g)
    expect(b.classes?.kind).toBe('ab')
    expect(yearActionsUsed(g, classesKey(a.id))).toBe(0)

    // A listed company at 90%: the board passes it for sure.
    const h = founder(3)
    const x = listed(h, { share: 0.9 })
    const price = x.b.sharePrice
    expect(passOdds(h, x.a, x.b, recapProposal(x.a, 'ab'))).toBeGreaterThan(0.99)
    row(h, x.a.id, 'ab').run(h)
    expect(bizOf(h, x.a).classes).toEqual({ kind: 'ab', hi: x.b.share })
    expect(Math.abs(x.b.sharePrice - price * 0.96)).toBeLessThan(0.011)
    expect(yearActionsUsed(h, classesKey(x.a.id))).toBe(1)
  })

  it('a disabled row says why', () => {
    const g = founder(3)
    const { a } = listed(g, { share: 0.9 })
    expect(row(g, a.id, 'single').disabledReason?.(g)).toBe('It already has this structure.')
    expect(row(g, a.id, 'ab').disabledReason?.(g) ?? null).toBeNull()
    expect(changeClasses(g, a.id, 'ab')).toBe(true)
    expect(row(g, a.id, 'ab').disabledReason?.(g)).toBe('It already has this structure.')
    expect(row(g, a.id, 'single').disabledReason?.(g)).toBe('Classes change once a year.')
    expect(row(g, a.id, 'nv').disabledReason?.(g)).toBe('Classes change once a year.')
    // A private company is never held to the year.
    const h = founder()
    const x = privateCompany(h)
    expect(row(h, x.a.id, 'ab').disabledReason?.(h) ?? null).toBeNull()
    expect(row(h, x.a.id, 'single').disabledReason?.(h)).toBe('It already has this structure.')
  })

  it('a player who cannot manage it sees why, and a company that is gone says so', () => {
    const g = founder()
    const { a } = privateCompany(g)
    const node = classesNode(a)
    const kids = node.children(g) as MenuAction[]
    g.character.age = 17
    expect(kids[1].disabledReason?.(g)).toMatch(/18/)
    g.character.age = 45
    g.assets = g.assets.filter((x) => x.id !== a.id)
    expect(kids[1].disabledReason?.(g)).toBe('You no longer own this.')
    expect(node.children(g)).toEqual([])
    expect(() => {
      subtitleOf(g, node)
      node.header?.(g)
      kids[1].run(g)
    }).not.toThrow()
    expect(noticesTitled(g, 'Share Classes')).toEqual([])
  })

  it('shows the stake as it is stored, not as it is floored', () => {
    // A stake a sale left under 1% is judged as stored, as the screen of the company does.
    const g = founder(3)
    const { a, b } = listed(g, { share: 0.006 })
    expect(b.share).toBe(0.006)
    const rows = rowsOf(g, a.id)
    const stored = classOption(g, a, { ...readBiz(g, a), share: 0.006 }, 'ab')
    expect(subtitleOf(g, rows[1])).toContain(`You'd hold ${(stored.votes * 100).toFixed(0)}% of the votes`)
  })

  it('renders from a frozen state', () => {
    for (const make of [
      () => {
        const g = founder(3)
        const { a, b } = listed(g, { share: 0.4, family: [{ id: 'p1', share: 0.1 }], executive: 0.02 })
        b.classes = { kind: 'ab', hi: 0.4 }
        return { g, a }
      },
      () => {
        const g = founder()
        const { a } = privateCompany(g)
        return { g, a }
      },
      () => {
        const g = founder()
        const { a, b } = privateCompany(g)
        b.classes = { kind: 'nv', hi: 1 }
        return { g, a }
      },
    ]) {
      const { g, a } = make()
      const json = JSON.stringify(g)
      const rng = JSON.stringify(g.rng)
      deepFreeze(g)
      const node = classesNode(a)
      const texts: string[] = [subtitleOf(g, node), node.header?.(g) ?? '']
      for (const kid of node.children(g)) {
        texts.push(subtitleOf(g, kid))
        if (kid.type === 'action') texts.push(kid.label, kid.disabledReason?.(g) ?? '', kid.confirm?.(g) ?? '')
      }
      for (const t of texts) expect(t).not.toMatch(/NaN|undefined|Infinity|\[object/)
      expect(JSON.stringify(g)).toBe(json)
      expect(JSON.stringify(g.rng)).toBe(rng)
    }
  })

  it('reading the rows never draws', () => {
    const g = founder(3)
    const { a } = listed(g, { share: 0.45 })
    const rng = JSON.stringify(g.rng)
    const json = JSON.stringify(g)
    for (const kid of classesNode(a).children(g)) {
      subtitleOf(g, kid)
      if (kid.type === 'action') {
        kid.disabledReason?.(g)
        kid.confirm?.(g)
      }
    }
    expect(JSON.stringify(g.rng)).toBe(rng)
    expect(JSON.stringify(g)).toBe(json)
  })
})
