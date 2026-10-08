// Written out of the will: cut-out detection by role, anger by closeness and personality, how
// the family finds out, escalation and decay while you are alive, the ways to make up, what
// estrangement costs in old age, and the guards against farming trust by toggling the will.
import { describe, expect, it } from 'vitest'
import { addHeir, changeWill, removeHeir } from '../src/game/events/will-act'
import {
  angerAfterShare,
  angerOnLearning,
  estrangedKids,
  expectation,
  giftRelief,
  inLineIds,
  isEstranged,
  keptAwayBy,
  peaceOdds,
  readWill,
  readWl,
  updateWl,
  willNameable,
} from '../src/game/events/will-core'
import { writeObituary } from '../src/game/events/obituary'
import { yearlyWillFeuds } from '../src/game/events/will-feud'
import { willPersonNodes } from '../src/game/events/will-amends'
import { anachronismsIn } from '../src/game/events/era'
import { queueConfront, queueGrandkids, queueOlive, queuePress, queueSpouseUltimatum, queueTells } from '../src/game/events/will-scenes'
import { readTies, updateTies } from '../src/game/events/wealth-core'
import { createPerson } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuNode, ModalItem, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

interface Fam {
  g: GameState
  spouse: Person
  a: Person
  b: Person
  c: Person
}

/** A rich 62-year-old with a spouse and three grown children who know them well. */
function fam(seed = 1, opts: { money?: number; age?: number; traits?: Record<string, string[]> } = {}): Fam {
  const g = makeTestGame(seed, { age: opts.age ?? 62, money: opts.money ?? 5_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.year = 2026
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  const mk = (relation: Person['relation'], age: number, relationship: number, traits: string[]): Person => {
    const p = createPerson(g, { relation, age, relationship, traits, money: 30_000, countryId: 'us' })
    p.yearsKnown = Math.min(age, 30)
    return p
  }
  const spouse = mk('spouse', 60, 80, ['calm', 'loyal'])
  const a = mk('child', 34, 75, opts.traits?.a ?? ['kind', 'calm'])
  const b = mk('child', 31, 70, opts.traits?.b ?? ['hot-headed', 'jealous'])
  const c = mk('child', 28, 60, opts.traits?.c ?? ['funny', 'outgoing'])
  return { g, spouse, a, b, c }
}

function answerChoice(g: GameState, scriptId: string, choice: string): ChoiceModal {
  const i = g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === scriptId)
  if (i < 0) throw new Error(`no pending ${scriptId}; queue: ${g.queue.map((m) => (m.kind === 'choice' ? m.scriptId : m.kind)).join(',')}`)
  const m = g.queue.splice(i, 1)[0] as ChoiceModal
  runScript(g, m.scriptId!, choice, m.data, m)
  return m
}

function nextYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  g.yearActions = {}
  for (const p of g.people) if (p.alive) p.age += 1
  yearlyWillFeuds(g)
}

function findAction(nodes: MenuNode[], id: string): MenuAction | undefined {
  return nodes.find((n): n is MenuAction => n.type === 'action' && n.id === id)
}

/** Write someone out of the will for real, and let them know how angry they are. */
function setKnown(g: GameState, p: Person, anger: number, how = 'leak'): void {
  changeWill(g, (gg, w) => removeHeir(gg, w, p))
  g.queue = []
  updateWl(g, p, (w) => {
    w.known = true
    w.how = how
    w.knownY = g.year
    w.told = 'out'
    w.anger = anger
  })
}

// ---------------------------------------------------------------------------

describe('who can be named', () => {
  it('offers spouse, children, grandchildren, parents, siblings and close friends only', () => {
    const f = fam(1)
    const gk = createPerson(f.g, { relation: 'grandchild', age: 6, relationship: 70 })
    const mom = createPerson(f.g, { relation: 'parent', age: 88, relationship: 60 })
    const sis = createPerson(f.g, { relation: 'sibling', age: 58, relationship: 70 })
    const pal = createPerson(f.g, { relation: 'bestFriend', age: 60, relationship: 80 })
    const stranger = createPerson(f.g, { relation: 'friend', age: 60, relationship: 10 })
    const kidFriend = createPerson(f.g, { relation: 'friend', age: 12, relationship: 90 })
    const boss = createPerson(f.g, { relation: 'boss', age: 50, relationship: 90 })
    const pet = createPerson(f.g, { relation: 'pet', age: 3, relationship: 90 })
    const ex = createPerson(f.g, { relation: 'ex', age: 60, relationship: 90 })
    const ids = willNameable(f.g).map((p) => p.id)
    for (const p of [f.spouse, f.a, f.b, f.c, gk, mom, sis, pal]) expect(ids).toContain(p.id)
    for (const p of [stranger, kidFriend, boss, pet, ex]) expect(ids).not.toContain(p.id)
    mom.alive = false
    expect(willNameable(f.g).map((p) => p.id)).not.toContain(mom.id)
  })

  it('shares: an empty will divides among the children, named heirs are weighted, charity comes off the top', () => {
    const f = fam(2)
    expect(inLineIds(f.g).sort()).toEqual([f.a.id, f.b.id, f.c.id].sort())
    changeWill(f.g, (gg, w) => {
      addHeir(gg, w, f.spouse, 100)
      addHeir(gg, w, f.a, 50)
      w.charity = 20
    })
    const slices = readWill(f.g)
    expect(slices.charity).toBe(20)
    expect(f.g.character.willBeneficiaries).toContain(f.spouse.id)
  })
})

describe('cut-out detection', () => {
  it('flags a child written out of a list they were in, but nobody who was never in line', () => {
    const f = fam(3)
    changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
    // The default (divide among the children) became a named list that includes everyone.
    expect(inLineIds(f.g)).toContain(f.spouse.id)
    const rep = changeWill(f.g, (gg, w) => removeHeir(gg, w, f.b))
    expect(rep.cut.map((p) => p.id)).toEqual([f.b.id])
    expect(readWl(f.g, f.b).cut).toBe(true)
    expect(readWl(f.g, f.a).cut).toBe(false)
    // Removing someone who is not named is no news.
    const again = changeWill(f.g, (gg, w) => removeHeir(gg, w, f.b))
    expect(again.cut).toHaveLength(0)
  })

  it('detects spouse, grandchild, parent, sibling and friend cut-outs too', () => {
    const f = fam(4)
    const gk = createPerson(f.g, { relation: 'grandchild', age: 15, relationship: 70 })
    const mom = createPerson(f.g, { relation: 'parent', age: 86, relationship: 70 })
    const sis = createPerson(f.g, { relation: 'sibling', age: 58, relationship: 80 })
    const pal = createPerson(f.g, { relation: 'bestFriend', age: 62, relationship: 85 })
    const all = [f.spouse, f.a, f.b, f.c, gk, mom, sis, pal]
    changeWill(f.g, (gg, w) => {
      for (const p of all) addHeir(gg, w, p, 100)
    })
    for (const p of all.slice().reverse()) {
      const rep = changeWill(f.g, (gg, w) => removeHeir(gg, w, p))
      if (p.id === f.c.id || p.id === f.b.id || p.id === f.a.id) {
        expect(rep.cut.map((x) => x.id)).toContain(p.id)
        continue
      }
      expect(rep.cut.map((x) => x.id)).toContain(p.id)
    }
  })

  it('does not call a dead or divorced relative cut out', () => {
    const f = fam(5)
    changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
    f.b.alive = false
    f.spouse.relation = 'exSpouse'
    const rep = changeWill(f.g, (gg, w) => removeHeir(gg, w, f.c))
    expect(rep.cut.map((p) => p.id)).toEqual([f.c.id])
    expect(readWl(f.g, f.b).cut).toBe(false)
    expect(readWl(f.g, f.spouse).cut).toBe(false)
  })

  it('catches a will another module rewrote (a spoiled kid cut in a wealth popup)', () => {
    const f = fam(6)
    changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
    f.g.character.willBeneficiaries = f.g.character.willBeneficiaries.filter((id) => id !== f.b.id)
    yearlyWillFeuds(f.g)
    const w = readWl(f.g, f.b)
    expect(w.cut).toBe(true)
    expect(w.known).toBe(true)
    expect(w.how).toBe('external')
    expect(w.anger).toBeGreaterThan(0)
  })
})

describe('anger model', () => {
  it('rises with closeness and what they were counting on, and falls with kindness', () => {
    const f = fam(7)
    const close = f.a
    const distant = f.c
    updateWl(f.g, close, (w) => void (w.was = true))
    updateWl(f.g, distant, (w) => void (w.was = true))
    expect(expectation(f.g, close)).toBeGreaterThan(expectation(f.g, distant))
    close.traits = ['calm', 'kind']
    distant.traits = ['calm', 'kind']
    close.relationship = 90
    distant.relationship = 30
    expect(angerOnLearning(f.g, close, 'leak')).toBeGreaterThan(angerOnLearning(f.g, distant, 'leak'))
  })

  it('is worse for petulant and spoiled people than for kind and forgiving ones', () => {
    const f = fam(8)
    for (const p of [f.a, f.b]) {
      p.relationship = 70
      updateWl(f.g, p, (w) => void (w.was = true))
    }
    f.a.traits = ['kind', 'calm']
    f.b.traits = ['hot-headed', 'jealous']
    expect(angerOnLearning(f.g, f.b, 'leak')).toBeGreaterThan(angerOnLearning(f.g, f.a, 'leak') * 1.8)
    f.b.traits = ['hot-headed', 'jealous']
    f.b.data.entitlement = 90
    f.a.data.entitlement = 0
    expect(angerOnLearning(f.g, f.b, 'leak')).toBeGreaterThan(angerOnLearning(f.g, f.a, 'leak'))
  })

  it('depends on role, being told, money needs, how much there is to inherit and how they hear', () => {
    const f = fam(9)
    const sis = createPerson(f.g, { relation: 'sibling', age: 58, relationship: 70, traits: ['funny', 'outgoing'] })
    sis.yearsKnown = 50
    const pal = createPerson(f.g, { relation: 'bestFriend', age: 60, relationship: 90, traits: ['funny', 'outgoing'] })
    pal.yearsKnown = 30
    f.a.traits = ['funny', 'outgoing']
    f.a.relationship = 70
    for (const p of [f.a, sis, pal]) updateWl(f.g, p, (w) => void (w.was = true))
    expect(angerOnLearning(f.g, f.a, 'leak')).toBeGreaterThan(angerOnLearning(f.g, sis, 'leak'))
    expect(angerOnLearning(f.g, sis, 'leak')).toBeGreaterThan(angerOnLearning(f.g, pal, 'leak'))
    // Gentle explanations and letters soften it; a blunt or ambushing delivery does not.
    const leak = angerOnLearning(f.g, f.a, 'leak')
    expect(angerOnLearning(f.g, f.a, 'kind')).toBeLessThan(leak * 0.7)
    expect(angerOnLearning(f.g, f.a, 'letter')).toBeLessThan(leak)
    expect(angerOnLearning(f.g, f.a, 'dinner')).toBeGreaterThan(leak)
    // A promise broken is worse than a default undone.
    const base = angerOnLearning(f.g, f.a, 'leak')
    updateWl(f.g, f.a, (w) => void (w.told = 'in'))
    expect(angerOnLearning(f.g, f.a, 'leak')).toBeGreaterThan(base)
    // A small estate is a small fight; a fortune is a big one.
    updateWl(f.g, f.a, (w) => void (w.told = ''))
    f.g.character.money = 8_000
    const small = angerOnLearning(f.g, f.a, 'leak')
    f.g.character.money = 400_000_000
    const big = angerOnLearning(f.g, f.a, 'leak')
    expect(big).toBeGreaterThan(small * 1.5)
    // Money trouble makes it worse; being rich yourself, milder.
    f.g.character.money = 5_000_000
    f.a.money = 200
    const needy = angerOnLearning(f.g, f.a, 'leak')
    f.a.money = 90_000_000
    expect(needy).toBeGreaterThan(angerOnLearning(f.g, f.a, 'leak'))
  })

  it('does not exist for small children and is milder for teens', () => {
    const f = fam(10)
    const baby = createPerson(f.g, { relation: 'grandchild', age: 7, relationship: 70 })
    const teen = createPerson(f.g, { relation: 'child', age: 15, relationship: 70, traits: ['funny'] })
    const adult = createPerson(f.g, { relation: 'child', age: 25, relationship: 70, traits: ['funny'] })
    teen.yearsKnown = 15
    adult.yearsKnown = 25
    expect(angerOnLearning(f.g, baby, 'leak')).toBe(0)
    expect(angerOnLearning(f.g, teen, 'leak')).toBeLessThan(angerOnLearning(f.g, adult, 'leak'))
  })
})

describe('the tell popup and discovery', () => {
  it('asks how to tell a person who was counting on it, and the answer sets how they learn', () => {
    const f = fam(11)
    changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
    const rep = changeWill(f.g, (gg, w) => removeHeir(gg, w, f.a))
    expect(rep.tell.map((p) => p.id)).toEqual([f.a.id])
    queueTells(f.g, rep)
    const kind = structuredClone(f.g)
    answerChoice(kind, 'will.tell', 'kind')
    const wk = readWl(kind, kind.people.find((p) => p.id === f.a.id)!)
    expect(wk.known).toBe(true)
    expect(wk.explained).toBe('kind')
    // Bluntly is worse.
    const blunt = structuredClone(f.g)
    answerChoice(blunt, 'will.tell', 'blunt')
    expect(readWl(blunt, blunt.people.find((p) => p.id === f.a.id)!).anger).toBeGreaterThan(wk.anger * 1.5)
    // Silence leaves them unaware, a letter softens the day they find out.
    const silent = structuredClone(f.g)
    answerChoice(silent, 'will.tell', 'silent')
    expect(readWl(silent, silent.people.find((p) => p.id === f.a.id)!).known).toBe(false)
    const letter = structuredClone(f.g)
    answerChoice(letter, 'will.tell', 'letter')
    const wl = readWl(letter, letter.people.find((p) => p.id === f.a.id)!)
    expect(wl.known).toBe(false)
    expect(wl.explained).toBe('letter')
  })

  it('asks about at most three people', () => {
    const f = fam(12)
    const extra = [1, 2, 3].map(() => createPerson(f.g, { relation: 'child', age: 30, relationship: 80 }))
    for (const p of extra) p.yearsKnown = 30
    changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
    const rep = changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.spouse.id]
      w.shares = {}
    })
    expect(rep.cut.length).toBeGreaterThanOrEqual(5)
    queueTells(f.g, rep)
    expect(f.g.queue.filter((m) => m.kind === 'choice')).toHaveLength(3)
  })

  it('finds out by a leak, a relative or a family dinner, over the years and not all at once', () => {
    const hows = new Map<string, number>()
    const years: number[] = []
    for (let seed = 1; seed <= 40; seed++) {
      const f = fam(100 + seed)
      f.b.traits = ['jealous', 'dramatic']
      changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
      const rep = changeWill(f.g, (gg, w) => removeHeir(gg, w, f.c))
      f.g.queue = []
      void rep
      expect(readWl(f.g, f.c).known).toBe(false)
      let found = 0
      for (let y = 1; y <= 40 && !found; y++) {
        nextYear(f.g)
        f.g.queue = []
        if (readWl(f.g, f.c).known) found = y
      }
      expect(found).toBeGreaterThan(0)
      years.push(found)
      const how = readWl(f.g, f.c).how
      hows.set(how, (hows.get(how) ?? 0) + 1)
    }
    expect([...hows.keys()].every((h) => ['leak', 'relative', 'dinner'].includes(h))).toBe(true)
    expect(hows.size).toBeGreaterThanOrEqual(2)
    // Not instant for everyone, not hopelessly slow: a spread of years.
    expect(Math.max(...years)).toBeGreaterThan(Math.min(...years))
    expect(years.filter((y) => y === 1).length).toBeLessThan(30)
  })

  it('never lets a small child find out', () => {
    const f = fam(13)
    const kid = createPerson(f.g, { relation: 'child', age: 8, relationship: 80 })
    changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
    changeWill(f.g, (gg, w) => addHeir(gg, w, kid, 100))
    f.g.queue = []
    changeWill(f.g, (gg, w) => removeHeir(gg, w, kid))
    f.g.queue = []
    for (let y = 0; y < 3; y++) {
      nextYear(f.g)
      f.g.queue = []
    }
    expect(readWl(f.g, kid).known).toBe(false)
  })
})

describe('escalation and decay', () => {
  it('goes cold, then confronts, then cuts a child off; kind children simmer down instead', () => {
    let estranged = 0
    let confronted = 0
    let cold = 0
    for (let seed = 1; seed <= 30; seed++) {
      const f = fam(200 + seed, { money: 60_000_000 })
      f.b.traits = ['hot-headed', 'arrogant']
      f.b.data.entitlement = 70
      f.b.relationship = 60
      setKnown(f.g, f.b, 85)
      updateWl(f.g, f.b, (w) => void (w.hard = 2))
      for (let y = 1; y <= 12; y++) {
        nextYear(f.g)
        if (f.g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'will.confront')) confronted += 1
        f.g.queue = []
        if (readWl(f.g, f.b).cold) cold += 1
        if (isEstranged(f.g, f.b)) {
          estranged += 1
          break
        }
      }
    }
    expect(cold).toBeGreaterThan(20)
    expect(confronted).toBeGreaterThan(10)
    expect(estranged).toBeGreaterThan(8)
  })

  it('cools slowly for a forgiving child and hardens for a vengeful one', () => {
    const f = fam(14, { traits: { a: ['kind', 'caring'], b: ['hot-headed', 'jealous'] } })
    setKnown(f.g, f.a, 50)
    setKnown(f.g, f.b, 50)
    const start = { a: 50, b: 50 }
    updateWl(f.g, f.b, (w) => void (w.hard = 3))
    for (let y = 0; y < 3; y++) {
      nextYear(f.g)
      f.g.queue = []
    }
    expect(readWl(f.g, f.a).anger).toBeLessThan(start.a)
    expect(readWl(f.g, f.b).anger).toBeGreaterThan(start.b)
    // Slowly: a kind child still has anger after three years.
    expect(readWl(f.g, f.a).anger).toBeGreaterThan(25)
  })

  it('limits the feud to one scene popup a year and a single bundled notice for the quiet beats', () => {
    const f = fam(15, { money: 80_000_000 })
    for (const p of [f.a, f.b, f.c]) {
      p.traits = ['hot-headed', 'jealous']
      setKnown(f.g, p, 80)
    }
    for (let y = 0; y < 8; y++) {
      nextYear(f.g)
      const scenes = f.g.queue.filter((m) => m.kind === 'choice' || (m.kind === 'notice' && m.title === 'Cut Off'))
      expect(scenes.length).toBeLessThanOrEqual(1)
      expect(f.g.queue.filter((m) => m.kind === 'notice' && m.title === 'Family Tension').length).toBeLessThanOrEqual(1)
      f.g.queue = []
    }
  })

  it('draws no randomness for a family nobody was cut out of', () => {
    const f = fam(16)
    const before = f.g.rng
    for (let y = 0; y < 5; y++) nextYear(f.g)
    expect(f.g.rng).toBe(before)
    expect(f.g.queue).toHaveLength(0)
  })

  it('siblings take sides, spouses threaten to leave and grandkids get dragged in', () => {
    let sides = 0
    let ultimatum = 0
    let middle = 0
    for (let seed = 1; seed <= 40; seed++) {
      const f = fam(300 + seed, { money: 60_000_000 })
      const gk = createPerson(f.g, { relation: 'grandchild', age: 9, relationship: 70, data: { parentId: f.b.id } })
      void gk
      f.b.traits = ['hot-headed']
      setKnown(f.g, f.b, 70)
      changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
      f.g.queue = []
      setKnown(f.g, f.spouse, 70)
      for (let y = 0; y < 6; y++) {
        const logLen = f.g.log.flatMap((l) => l.entries).length
        nextYear(f.g)
        for (const m of f.g.queue) {
          if (m.kind === 'choice' && m.scriptId === 'will.spouse') ultimatum += 1
          if (m.kind === 'choice' && m.scriptId === 'will.grandkids') middle += 1
        }
        const newLines = f.g.log.flatMap((l) => l.entries).slice(logLen)
        if (newLines.some((e) => /side about my will/.test(e.text))) sides += 1
        f.g.queue = []
      }
    }
    expect(sides).toBeGreaterThan(5)
    expect(ultimatum).toBeGreaterThan(5)
    expect(middle).toBeGreaterThan(0)
  })
})

describe('making up', () => {
  it('explaining, apologizing and restoring, doubling down, refusing and buying off each do what they say', () => {
    const base = fam(17, { traits: { b: ['calm', 'funny'] } })
    setKnown(base.g, base.b, 60)
    base.b.relationship = 50
    const run = (choice: string) => {
      const g = structuredClone(base.g)
      const p = g.people.find((x) => x.id === base.b.id)!
      updateWl(g, p, (w) => void (w.confY = 0))
      g.queue = []
      // Open the confrontation the way the feud does.
      queueConfront(g, p)
      answerChoice(g, 'will.confront', choice)
      return { g, p }
    }
    const explain = run('explain')
    expect(readWl(explain.g, explain.p).anger).toBeLessThan(60)
    expect(readWl(explain.g, explain.p).explained).toBe('kind')
    const restore = run('restore')
    expect(inLineIds(restore.g)).toContain(base.b.id)
    expect(readWl(restore.g, restore.p).cut).toBe(false)
    expect(readWl(restore.g, restore.p).anger).toBeLessThan(25)
    const double = run('double')
    expect(readWl(double.g, double.p).anger).toBeGreaterThan(60)
    expect(readWl(double.g, double.p).hard).toBe(1)
    const refuse = run('refuse')
    expect(readWl(refuse.g, refuse.p).anger).toBeGreaterThan(60)
    expect(readWl(refuse.g, refuse.p).hard).toBe(1)
    // Buying off: pick the first amount offered.
    const buy = run('buy')
    const m = buy.g.queue.find((q) => q.kind === 'choice' && q.scriptId === 'will.confront.buy') as ChoiceModal
    expect(m).toBeTruthy()
    const money0 = buy.g.character.money
    const theirs0 = buy.p.money
    answerChoice(buy.g, 'will.confront.buy', 'a1')
    const spent = money0 - buy.g.character.money
    expect(spent).toBeGreaterThan(0)
    expect(buy.p.money - theirs0).toBe(spent)
    expect(readWl(buy.g, buy.p).anger).toBeLessThan(60)
    expect(readWl(buy.g, buy.p).buys).toBe(1)
  })

  it('cutting the allowance too is the cruel version of doubling down', () => {
    const f = fam(18)
    setKnown(f.g, f.b, 60)
    updateTies(f.g, f.b, (t) => void (t.allowance = 20_000))
    queueConfront(f.g, f.b)
    const m = f.g.queue.find((q) => q.kind === 'choice') as ChoiceModal
    expect(m.choices.map((c) => c.id)).toContain('cutoff')
    const before = readWl(f.g, f.b).anger
    answerChoice(f.g, 'will.confront', 'cutoff')
    expect(readTies(f.g, f.b).allowance).toBe(0)
    expect(readWl(f.g, f.b).anger).toBeGreaterThan(before + 15)
  })

  it('a compromise share lowers anger as much as the preview says', () => {
    const f = fam(19)
    setKnown(f.g, f.b, 70)
    queueConfront(f.g, f.b)
    answerChoice(f.g, 'will.confront', 'compromise')
    const input = f.g.queue.find((q) => q.kind === 'input')
    expect(input).toBeTruthy()
    const before = readWl(f.g, f.b).anger
    const expected = angerAfterShare(before, 50)
    const modal = input as Extract<ModalItem, { kind: 'input' }>
    f.g.queue = f.g.queue.filter((q) => q !== input)
    runScript(f.g, modal.scriptId, '50', modal.data, modal)
    expect(inLineIds(f.g)).toContain(f.b.id)
    expect(readWl(f.g, f.b).anger).toBe(expected)
    expect(readWill(f.g).shares[f.b.id]).toBe(50)
  })

  it('an honest heart-to-heart works some of the time and costs you either way', () => {
    let worked = 0
    let failed = 0
    for (let seed = 1; seed <= 40; seed++) {
      const f = fam(400 + seed, { traits: { b: ['caring', 'calm'] } })
      setKnown(f.g, f.b, 55)
      f.b.relationship = 60
      const rows = willPersonNodes(f.g, f.b)
      const peace = findAction(rows, 'will.peace')!
      expect(peace.subtitle).toMatch(/\d+% to get through/)
      const odds = peaceOdds(f.g, f.b)
      const h0 = f.g.character.stats.happiness
      peace.run(f.g)
      expect(f.g.character.stats.happiness).toBeLessThan(h0)
      expect(peace.disabledReason?.(f.g)).toMatch(/already tried/)
      if (readWl(f.g, f.b).anger < 55) worked += 1
      else failed += 1
      expect(odds).toBeGreaterThan(0.2)
      expect(odds).toBeLessThan(0.9)
    }
    expect(worked).toBeGreaterThan(5)
    expect(failed).toBeGreaterThan(5)
  })

  it('money soothes less each time and always costs real money', () => {
    const f = fam(20)
    setKnown(f.g, f.b, 70)
    const r1 = giftRelief(f.g, f.b, 100_000)
    updateWl(f.g, f.b, (w) => void (w.buys = 1))
    const r2 = giftRelief(f.g, f.b, 100_000)
    updateWl(f.g, f.b, (w) => void (w.buys = 3))
    const r3 = giftRelief(f.g, f.b, 100_000)
    expect(r1).toBeGreaterThan(r2)
    expect(r2).toBeGreaterThan(r3)
    // A bigger check helps more but with diminishing returns.
    updateWl(f.g, f.b, (w) => void (w.buys = 0))
    const none = giftRelief(f.g, f.b, 0)
    const one = giftRelief(f.g, f.b, 150_000)
    const two = giftRelief(f.g, f.b, 300_000)
    const huge = giftRelief(f.g, f.b, 10_000_000)
    expect(none).toBe(0)
    expect(one).toBeGreaterThan(0)
    expect(two).toBeGreaterThan(one)
    expect(two - one).toBeLessThan(one - none)
    expect(huge).toBeLessThanOrEqual(40)
    // The sheet's gift slider moves the money.
    const rows = willPersonNodes(f.g, f.b)
    const gift = findAction(rows, 'will.gift')!
    expect(gift.input?.money).toBe(true)
    const cash = f.g.character.money
    const theirs = f.b.money
    gift.run(f.g, '50000')
    expect(f.g.character.money).toBe(cash - 50_000)
    expect(f.b.money).toBe(theirs + 50_000)
    expect(gift.disabledReason?.(f.g)).toMatch(/already tried/)
  })

  it('an estranged child can be reached, and an olive branch can be accepted', () => {
    const f = fam(21, { traits: { b: ['kind', 'caring'] } })
    setKnown(f.g, f.b, 30)
    updateWl(f.g, f.b, (w) => {
      w.estr = true
      w.estrY = 2020
    })
    const rows = willPersonNodes(f.g, f.b)
    expect(findAction(rows, 'will.peace')?.label).toBe('Reach Out')
    expect(isEstranged(f.g, f.b)).toBe(true)
    let sawOlive = false
    for (let y = 0; y < 60 && !sawOlive; y++) {
      nextYear(f.g)
      sawOlive = f.g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'will.olive')
      if (!sawOlive) f.g.queue = []
    }
    expect(sawOlive).toBe(true)
    answerChoice(f.g, 'will.olive', 'accept')
    expect(isEstranged(f.g, f.b)).toBe(false)
    expect(f.b.relationship).toBeGreaterThanOrEqual(35)
  })
})

describe('estrangement', () => {
  it('stops visits, allowance, family use and grandkid access, and the person sheet shows only the way back', () => {
    const f = fam(22, { money: 40_000_000 })
    const gk = createPerson(f.g, { relation: 'grandchild', age: 8, relationship: 80, data: { parentId: f.b.id } })
    gk.livesWithPlayer = true
    updateTies(f.g, f.b, (t) => void (t.allowance = 30_000))
    f.g.assets.push({ id: 'w1', kind: 'jewelry', name: 'Watch', emoji: '⌚', purchasePrice: 9000, value: 9000, condition: 90, purchasedAge: 30, upkeep: 0, details: { fam: [f.b.id, f.c.id] } })
    f.b.traits = ['hot-headed', 'arrogant']
    setKnown(f.g, f.b, 90)
    updateWl(f.g, f.b, (w) => void (w.stage = 3))
    let done = false
    for (let y = 0; y < 30 && !done; y++) {
      nextYear(f.g)
      f.g.queue = []
      done = isEstranged(f.g, f.b)
    }
    expect(done).toBe(true)
    expect(f.b.livesWithPlayer).toBe(false)
    expect(f.b.relationship).toBeLessThanOrEqual(20)
    expect(readTies(f.g, f.b).allowance).toBe(0)
    expect(f.g.assets[0].details.fam).toEqual([f.c.id])
    expect(gk.livesWithPlayer).toBe(false)
    expect(estrangedKids(f.g).map((p) => p.id)).toEqual([f.b.id])
    const ids = personActions(f.g, f.b).map((n) => n.id)
    expect(ids).not.toContain('wealth.allowance')
    expect(ids).toContain('will.peace')
    // The grandchild is kept away until the parent and the player make up.
    const kidIds = personActions(f.g, gk).map((n) => n.id)
    expect(kidIds).toContain('will.kept')
    expect(kidIds.filter((id) => !id.startsWith('will.') && id !== 'status')).toEqual([])
    expect(keptAwayBy(f.g, gk)?.id).toBe(f.b.id)
  })

  it('mentions a rift over the will and a gift to charity in the obituary', () => {
    const f = fam(30, { age: 80 })
    f.g.character.hidden.fame = 0
    updateWl(f.g, f.b, (w) => {
      w.estr = true
      w.estrY = 2010
    })
    changeWill(f.g, (_gg, w) => void (w.charity = 30))
    f.g.queue = []
    const text = writeObituary(f.g)
    expect(text).toMatch(/had not spoken to .*after a quarrel over the will/)
    expect(text).toContain('30% of')
    expect(text).toContain('to charity')
  })

  it('leaves you lonely and paying for help in old age when no child is left to help', () => {
    const f = fam(23, { age: 76, money: 3_000_000 })
    f.g.people = f.g.people.filter((p) => p.relation !== 'spouse')
    for (const p of [f.a, f.b, f.c]) {
      setKnown(f.g, p, 60)
      updateWl(f.g, p, (w) => {
        w.estr = true
        w.estrY = 2020
      })
    }
    const h0 = f.g.character.stats.happiness
    const m0 = f.g.character.money
    nextYear(f.g)
    expect(f.g.character.stats.happiness).toBeLessThan(h0)
    expect(f.g.character.money).toBeLessThan(m0)
    const notice = f.g.queue.find((m) => m.kind === 'notice' && m.title === 'Family Tension')
    expect(notice).toBeTruthy()
    // One child who still visits spares you.
    const g2 = fam(24, { age: 76 })
    g2.g.people = g2.g.people.filter((p) => p.relation !== 'spouse')
    for (const p of [g2.a, g2.b]) {
      setKnown(g2.g, p, 60)
      updateWl(g2.g, p, (w) => void (w.estr = true))
    }
    const hh = g2.g.character.stats.happiness
    nextYear(g2.g)
    expect(g2.g.character.stats.happiness).toBe(hh)
  })
})

describe('no farming trust by toggling the will', () => {
  it('toggling a child out and in again loses more than it gains', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const f = fam(500 + seed)
      changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
      f.g.queue = []
      f.b.traits = ['funny', 'outgoing']
      f.b.relationship = 60
      const start = f.b.relationship
      for (let round = 0; round < 6; round++) {
        const rep = changeWill(f.g, (gg, w) => removeHeir(gg, w, f.b))
        // The player breaks the news every time.
        if (rep.tell.length) {
          queueTells(f.g, rep)
          answerChoice(f.g, 'will.tell', 'blunt')
        }
        changeWill(f.g, (gg, w) => addHeir(gg, w, f.b, 100))
        f.g.queue = []
      }
      expect(f.b.relationship).toBeLessThan(start)
      expect(readWl(f.g, f.b).restores).toBe(6)
    }
  })

  it('the first restore helps, later restores help less', () => {
    const f = fam(25)
    changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
    f.g.queue = []
    const gains: number[] = []
    for (let i = 0; i < 4; i++) {
      setKnown(f.g, f.b, 60)
      f.b.relationship = 50
      const before = f.b.relationship
      changeWill(f.g, (gg, w) => addHeir(gg, w, f.b, 100))
      gains.push(f.b.relationship - before)
      f.g.queue = []
    }
    expect(gains[0]).toBeGreaterThan(0)
    expect(gains[1]).toBeLessThanOrEqual(gains[0])
    expect(gains[2]).toBeLessThanOrEqual(gains[1])
    expect(gains[3]).toBeLessThanOrEqual(gains[2])
  })

  it('naming someone a second time earns no more goodwill than the first', () => {
    const f = fam(26)
    const pal = createPerson(f.g, { relation: 'bestFriend', age: 62, relationship: 50, traits: ['funny'] })
    pal.yearsKnown = 30
    let total = 0
    for (let i = 0; i < 5; i++) {
      const r0 = pal.relationship
      changeWill(f.g, (gg, w) => addHeir(gg, w, pal, 100))
      f.g.queue = []
      total += pal.relationship - r0
      changeWill(f.g, (gg, w) => removeHeir(gg, w, pal))
      f.g.queue = []
    }
    expect(total).toBeLessThanOrEqual(3)
  })
})

describe('old saves', () => {
  it('a save without any will state still plays: no reaction, no crash', () => {
    const f = fam(27)
    delete f.g.flags['will.state']
    for (const p of f.g.people) delete p.data.wl
    for (let y = 0; y < 3; y++) nextYear(f.g)
    expect(f.g.queue).toHaveLength(0)
    expect(inLineIds(f.g).sort()).toEqual([f.a.id, f.b.id, f.c.id].sort())
    // A garbled state is read as blank.
    f.g.flags['will.state'] = { shares: 'no', charity: 'lots', snap: 5 }
    f.b.data.wl = { by: f.g.character.id, anger: 'high', cut: 'yes' }
    expect(readWill(f.g).charity).toBe(0)
    expect(readWl(f.g, f.b).anger).toBe(0)
    expect(() => nextYear(f.g)).not.toThrow()
  })

  it('an heir starts with a clean slate: feelings are stamped with the player', () => {
    const f = fam(28)
    setKnown(f.g, f.b, 80)
    f.g.character.id = 'someone-else'
    expect(readWl(f.g, f.b).anger).toBe(0)
    expect(readWl(f.g, f.b).known).toBe(false)
  })

  it('stays plain JSON', () => {
    const f = fam(29)
    changeWill(f.g, (gg, w) => addHeir(gg, w, f.spouse, 100))
    changeWill(f.g, (gg, w) => removeHeir(gg, w, f.b))
    f.g.queue = []
    setKnown(f.g, f.b, 70)
    expect(JSON.parse(JSON.stringify(f.g))).toEqual(f.g)
    expect(structuredClone(f.g)).toEqual(f.g)
  })
})

describe('every era', () => {
  function texts(g: GameState, from = 0): string[] {
    const out: string[] = []
    for (const m of g.queue.slice(from)) {
      if (m.kind === 'notice') out.push(m.title, m.text)
      if (m.kind === 'choice') out.push(m.title, m.text, ...m.choices.map((c) => c.label))
      if (m.kind === 'input') out.push(m.title, m.text)
    }
    for (const y of g.log) for (const e of y.entries) out.push(e.text)
    return out
  }

  it('reads right in 1905, 1930, 1955, 1980, 2005 and today: no phones before phones', () => {
    for (const year of [1905, 1930, 1955, 1980, 2005, 2026]) {
      const f = fam(900 + year, { money: 60_000_000 })
      f.g.year = year
      f.g.log = [{ age: f.g.character.age, year, entries: [] }]
      const gk = createPerson(f.g, { relation: 'grandchild', age: 9, relationship: 70, data: { parentId: f.b.id } })
      setKnown(f.g, f.b, 80)
      const scenes: ((g: GameState) => void)[] = [
        (g) => queueConfront(g, g.people.find((p) => p.id === f.b.id)!),
        (g) => queueSpouseUltimatum(g, g.people.find((p) => p.id === f.spouse.id)!),
        (g) => queuePress(g, g.people.find((p) => p.id === f.b.id)!),
        (g) => queueGrandkids(g, g.people.find((p) => p.id === f.b.id)!, g.people.find((p) => p.id === gk.id)!),
        (g) => queueOlive(g, g.people.find((p) => p.id === f.b.id)!),
      ]
      const seen: string[] = []
      for (const scene of scenes) {
        const base = structuredClone(f.g)
        base.queue = []
        scene(base)
        seen.push(...texts(base))
        const modal = base.queue[0] as ChoiceModal
        for (const c of modal.choices) {
          const g2 = structuredClone(base)
          g2.queue = []
          runScript(g2, modal.scriptId!, c.id, modal.data, modal)
          seen.push(...texts(g2))
          for (const m of g2.queue) {
            if (m.kind === 'choice') {
              for (const c2 of m.choices) {
                const g3 = structuredClone(g2)
                g3.queue = []
                runScript(g3, m.scriptId!, c2.id, m.data, m)
                seen.push(...texts(g3))
              }
            }
            if (m.kind === 'input') {
              const g3 = structuredClone(g2)
              g3.queue = []
              runScript(g3, m.scriptId, '50', m.data, m)
              seen.push(...texts(g3))
            }
          }
        }
      }
      // Estrangement, a tell, the tension notice and old age.
      const g4 = structuredClone(f.g)
      g4.queue = []
      for (const y of [1, 2, 3, 4, 5, 6]) {
        void y
        nextYear(g4)
      }
      seen.push(...texts(g4))
      for (const t of seen) expect(anachronismsIn(t, year, ['us']), `${year}: ${t}`).toEqual([])
    }
  })
})
