// Review fixes for the career/life talent perks: nothing a talent touches is a sure thing, purple
// hints point at the option that is really best under the game's own math, and nothing nags.
import { describe, expect, it } from 'vitest'
import { creativeMenu } from '../src/game/activities/creative'
import { occupationMenu } from '../src/game/careers'
import { yearActionsUsed } from '../src/game/core'
import { runScript } from '../src/game/scripts'
import { genreTrend } from '../src/game/special/gamedev-core'
import { startGame } from '../src/game/special/gamedev-make'
import { gdMut } from '../src/game/special/gamedev-state'
import { yearlyModel } from '../src/game/special/model'
import { yearlyPolitics } from '../src/game/special/politics'
import { addCodingSkill } from '../src/game/computer/skills'
import { HINT_EMOJI, type TalentId } from '../src/game/talents'
import type { Asset, ChoiceModal, GameState, Job, MenuAction, MenuNode, NoticeModal } from '../src/game/types'
import type { GenreId } from '../src/game/special/gamedev-data'
import '../src/game/menus'
import { makeTestGame } from './helpers'

function game(age: number, talents: TalentId[] = [], seed = 7): GameState {
  const g = makeTestGame(seed, { age })
  g.log = [{ age, year: g.year, entries: [] }]
  g.character.talents = [...talents]
  return g
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 6) return undefined
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function action(g: GameState, nodes: MenuNode[], id: string): MenuAction {
  const n = findNode(g, nodes, id)
  if (!n || n.type !== 'action') throw new Error(`action ${id} not found`)
  return n
}

function takeChoice(g: GameState): ChoiceModal {
  for (;;) {
    const m = g.queue.shift()
    if (!m) throw new Error('no choice in the queue')
    if (m.kind === 'choice') return m
  }
}

/** Answer the next choice popup the way the store does; returns the notices it produced. */
function answer(g: GameState, choiceId: string): NoticeModal[] {
  const m = takeChoice(g)
  const before = g.queue.length
  runScript(g, m.scriptId!, choiceId, m.data, m)
  const added = g.queue.splice(before)
  g.queue.unshift(...added)
  return added.filter((x): x is NoticeModal => x.kind === 'notice')
}

const hinted = (m: ChoiceModal) => m.choices.filter((c) => typeof c.hint === 'string' && c.hint.startsWith(HINT_EMOJI))
const nodes = (g: GameState) => creativeMenu.children(g)

describe('writing for money is never a sure thing', () => {
  function write(seed: number, form: 'novel' | 'screenplay'): string {
    const g = game(30, ['Writing'], seed)
    g.character.stats.smarts = 100
    g.flags['skill.writing'] = 100
    action(g, nodes(g), 'mb.creative.write').run(g)
    return answer(g, form)[0]?.title ?? ''
  }

  it('a maxed-out, talented novelist usually gets a deal but publishers still pass sometimes', () => {
    const titles = Array.from({ length: 300 }, (_, i) => write(i * 7919 + 3, 'novel'))
    const deals = titles.filter((t) => t === 'Book Deal' || t === 'Bestseller!').length
    expect(deals).toBeGreaterThan(220)
    expect(deals).toBeLessThan(300)
    expect(titles).toContain('Bad Timing')
  })

  it('a great screenplay can still be shelved', () => {
    const titles = Array.from({ length: 200 }, (_, i) => write(i * 104729 + 11, 'screenplay'))
    expect(titles).toContain('Screenplay Sold')
    expect(titles).toContain('Shelved')
  })

  it('a publisher passing still pays something and never loses money', () => {
    for (let i = 0; i < 80; i++) {
      const g = game(30, ['Writing'], i * 31 + 5)
      g.character.stats.smarts = 100
      g.flags['skill.writing'] = 100
      action(g, nodes(g), 'mb.creative.write').run(g)
      const title = answer(g, 'novel')[0]?.title
      expect(g.character.money).toBeGreaterThan(0)
      expect(Number.isFinite(g.character.money)).toBe(true)
      if (title === 'Bad Timing') return
    }
    throw new Error('never saw a passed-on novel')
  })

  it("the trending-form hint says so when you can't write that form yet", () => {
    // Find a year when editors want novels, and ask a beginner who can't write one yet.
    for (let year = 2000; year < 2300; year++) {
      const g = game(25, ['Writing'])
      g.year = year
      action(g, nodes(g), 'mb.creative.write').run(g)
      const m = takeChoice(g)
      const h = hinted(m)
      expect(h).toHaveLength(1)
      if (h[0].id !== 'novel') continue
      expect(h[0].label).toContain('needs writing skill 30%')
      expect(h[0].hint).toContain('once your skill reaches 30%')
      return
    }
    throw new Error('novels never trended')
  })
})

describe('selling art', () => {
  it("the venue hint never points at a sale that loses money after the fair's table fee", () => {
    const g = game(25, ['Art'])
    g.character.money = 5_000
    g.flags['creative.pieces'] = [{ title: 'Untitled (Probably a Horse)', q: 5, medium: 'draw', age: 25 }]
    action(g, nodes(g), 'mb.creative.sell').run(g)
    answer(g, '0')
    const m = takeChoice(g)
    const h = hinted(m)
    expect(h).toHaveLength(1)
    expect(h[0].id).not.toBe('fair')
    expect(h[0].id).toBe('online')
  })

  it("being too broke for the fair's table doesn't use up a sales attempt", () => {
    const g = game(25)
    g.character.money = 0
    g.flags['creative.pieces'] = [{ title: 'Blue Study No. 4', q: 70, medium: 'paint', age: 25 }]
    action(g, nodes(g), 'mb.creative.sell').run(g)
    answer(g, '0')
    const notes = answer(g, 'fair')
    expect(notes[0]?.title).toBe('Insufficient Funds')
    expect(yearActionsUsed(g, 'act.artSale')).toBe(0)
    expect(g.flags['creative.pieces']).toHaveLength(1)
  })

  it('once both attempts are used, Sell Art says so before you pick a piece', () => {
    const g = game(25)
    g.flags['creative.pieces'] = [{ title: 'Blue Study No. 4', q: 70, medium: 'paint', age: 25 }]
    g.yearActions['act.artSale'] = 2
    action(g, nodes(g), 'mb.creative.sell').run(g)
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false)
    expect(g.queue.some((m) => m.kind === 'notice')).toBe(true)
  })
})

describe('Leadership promotion hint', () => {
  it('disappears once you have asked this year', () => {
    const g = game(35, ['Leadership'])
    const job: Job = { defId: 'accountant', title: 'Junior Accountant', company: 'Ledger & Co.', category: 'fulltime', salary: 50_000, level: 0, performance: 90, yearsInRole: 3, yearsAtCompany: 3, data: { hours: 40 } }
    g.character.job = job
    const ask = () => action(g, occupationMenu.children(g), 'job.promotion')
    expect(ask().hint?.(g)).toMatch(/%/)
    g.yearActions.askPromotion = 1
    expect(ask().hint?.(g) ?? null).toBeNull()
  })
})

describe('Modeling scouts', () => {
  it('stop asking after you turn them down twice', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = game(18, ['Modeling'], seed * 13 + 1)
      g.character.stats.looks = 75
      let asked = 0
      for (let age = 18; age <= 32; age++) {
        g.character.age = age
        g.year += 1
        yearlyModel(g)
        for (let m = g.queue.shift(); m; m = g.queue.shift()) {
          if (m.kind === 'choice' && m.scriptId === 'special.model.scout') {
            asked++
            runScript(g, m.scriptId, 'decline', m.data, m)
          }
        }
      }
      expect(asked).toBeLessThanOrEqual(2)
      expect(g.character.job).toBeNull()
    }
  })
})

describe('Gaming genre hint', () => {
  function laptop(g: GameState): void {
    const a: Asset = { id: `laptop${g.nextId++}`, kind: 'other', name: 'Laptop', emoji: '\u{1F4BB}', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: g.character.age, upkeep: 0, details: { category: 'electronics' } }
    g.assets.push(a)
  }

  it("points at the genre that's hot when a game this size ships, not just next year", () => {
    let checked = 0
    for (let year = 2020; year < 2120 && checked < 3; year++) {
      const g = game(24, ['Gaming'], year)
      g.lifeId = 'gaming-hint'
      g.year = year
      laptop(g)
      addCodingSkill(g, 60)
      g.flags.lastCodedAge = 24
      gdMut(g).design = 55
      startGame(g)
      answer(g, 'indie')
      const m = takeChoice(g)
      const genres = m.choices.filter((c) => c.id !== 'cancel').map((c) => c.id as GenreId)
      const best = (y: number) => genres.reduce((a, b) => (genreTrend(g, b, y) > genreTrend(g, a, y) ? b : a))
      const h = hinted(m)
      if (genreTrend(g, best(year + 2), year + 2) < 1.1) {
        expect(h).toHaveLength(0)
        continue
      }
      expect(h.map((c) => c.id)).toEqual([best(year + 2)])
      if (best(year + 2) !== best(year + 1)) checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('Leadership in office', () => {
  /** A mayor who never lifts a finger: four years in office, then runs for re-election. */
  function reelected(talents: TalentId[], seed: number): boolean {
    const g = game(50, talents, seed)
    g.character.job = {
      defId: 'politician',
      title: 'Mayor',
      company: 'City Hall',
      category: 'special',
      salary: 80_000,
      level: 1,
      performance: 50,
      yearsInRole: 0,
      yearsAtCompany: 0,
      data: { office: 'mayor', party: 'centrist', approval: 50, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: 50, roleStartAge: 50 },
    }
    for (let year = 0; year < 4; year++) {
      g.character.age += 1
      g.year += 1
      g.yearActions = {}
      yearlyPolitics(g)
      for (let guard = 0; g.queue.length && guard < 50; guard++) {
        const m = g.queue.shift()!
        if (m.kind !== 'choice') continue
        const before = g.queue.length
        runScript(g, m.scriptId!, m.scriptId === 'special.pol.term' ? 'reelect' : m.choices[0].id, m.data, m)
        g.queue.unshift(...g.queue.splice(before))
      }
      if (!g.character.job || !g.character.alive) return false
    }
    const data = g.character.job?.data as { terms?: number } | undefined
    return data?.terms === 2
  }

  it('wins noticeably more re-elections, but a passive incumbent can still lose', () => {
    const seeds = Array.from({ length: 400 }, (_, i) => i * 7919 + 17)
    const rate = (t: TalentId[]) => seeds.filter((s) => reelected(t, s)).length / seeds.length
    const leader = rate(['Leadership'])
    const plain = rate([])
    // About +20 points (the spec's "strong but never guaranteed"). Before the review it was
    // about +32 here, and ~98% for an incumbent who handles scandals well.
    expect(leader).toBeGreaterThan(plain + 0.1)
    expect(leader).toBeLessThan(plain + 0.27)
    expect(leader).toBeLessThan(0.85)
  })
})
