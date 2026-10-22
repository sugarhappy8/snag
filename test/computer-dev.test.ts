// The legit side of the home computer (src/game/computer/dev*.ts): getting a computer, learning
// to code, projects, contests, freelancing, ventures (SaaS from idea to a decade of growth),
// selling, CV entries, the self-taught developer path, parents, prison, death and old saves.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { jobRequirementProblem, occupationMenu } from '../src/game/careers'
import { computerMenu, ownsComputer } from '../src/game/computer'
import { devNodes, noComputerNodes, ventureAssetSubtitle, ventureAssetView, yearlyDev } from '../src/game/computer/dev'
import { codingPortfolio, devCvEntries, selfTaughtDev } from '../src/game/computer/dev-cv'
import { CODE_GIGS, doCodeGig, gigRate } from '../src/game/computer/dev-freelance'
import { askParentsForComputer, bootcampCost, courseCost, familyComputerYear, learnInternals, practice } from '../src/game/computer/dev-learn'
import { buildProject, PROJECT_KINDS, yearlyProjects } from '../src/game/computer/dev-projects'
import { contractorCost, dataRegulator, devState, readVenture, ventureAssets } from '../src/game/computer/dev-state'
import { createVenture, MAX_VENTURES, startVenture, ventureInternals, VENTURE_DEFS } from '../src/game/computer/dev-venture'
import { addCodingSkill, addLanguageXp, codingCeiling, codingSkill, languageLevel, screenTime, SCREEN_LIMIT } from '../src/game/computer/skills'
import { netWorth } from '../src/game/core'
import { cvEntries } from '../src/game/cv'
import { getJobDef } from '../src/game/data/jobs'
import { killCharacter } from '../src/game/death'
import { continueAsChild, createNewLife } from '../src/game/life'
import { ASSET_KIND_VIEWS } from '../src/game/assets'
import '../src/game/menus'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, InputModal, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

function giveLaptop(g: GameState, condition = 100): Asset {
  const a: Asset = { id: `laptop${g.nextId++}`, kind: 'other', name: 'Laptop', emoji: '\u{1F4BB}', purchasePrice: 1300, value: 900, condition, purchasedAge: g.character.age, upkeep: 0, details: { category: 'electronics' } }
  g.assets.push(a)
  return a
}

function kid(seed: number, age: number, opts: { parentMoney?: number; rel?: number; grades?: number } = {}): GameState {
  const g = makeTestGame(seed, { age })
  g.character.education.current = { level: 'middle', school: 'Test Middle', year: 1, totalYears: 3, grades: opts.grades ?? 75, data: {} }
  for (const gender of ['male', 'female'] as const) {
    const p = createPerson(g, { relation: 'parent', age: 42, gender, relationship: opts.rel ?? 85, livesWithPlayer: true, money: opts.parentMoney ?? 50_000 })
    p.money = opts.parentMoney ?? 50_000
  }
  return g
}

function adult(seed: number, countryId = 'us', age = 24, skill = 60, money = 60_000): GameState {
  const g = makeTestGame(seed, { age, countryId, money })
  g.character.stats.health = 100
  giveLaptop(g)
  addCodingSkill(g, skill)
  addLanguageXp(g, 'javascript', 60)
  addLanguageXp(g, 'python', 50)
  g.flags.lastCodedAge = age
  return g
}

function lastModal<K extends ModalItem['kind']>(g: GameState, kind: K): Extract<ModalItem, { kind: K }> | undefined {
  return [...g.queue].reverse().find((m) => m.kind === kind) as Extract<ModalItem, { kind: K }> | undefined
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 6) return undefined
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

/** Resolve the queue like the store does, picking choices with `pickChoice`. */
function drain(g: GameState, pickChoice: (m: ChoiceModal) => string = (m) => m.choices[0].id, input: (m: InputModal) => string = (m) => m.defaultValue ?? 'Name'): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error('queue never drains')
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      if (m.source === 'script') runScript(g, m.scriptId!, pickChoice(m), m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: m.choices[0].id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, input(m), m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function collectActions(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 5) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason && n.disabledReason(g)) continue
    if (n.type === 'action') out.push(n)
    else collectActions(g, n.children(g), depth + 1, out)
  }
  return out
}

function finiteVenture(g: GameState, a: Asset): void {
  const v = readVenture(g, a)
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === 'number') {
      expect(Number.isFinite(x), `${k} is finite`).toBe(true)
      if (k !== 'profit' && k !== 'lastWorked') expect(x, `${k} >= 0`).toBeGreaterThanOrEqual(0)
    }
  }
  expect(Number.isFinite(a.value) && a.value >= 0).toBe(true)
  expect(v.valuation).toBeLessThanOrEqual(5e9)
}

/** Found a venture through the real menu flow (idea → build → name). */
function found(g: GameState, type: keyof typeof VENTURE_DEFS, build: 'self' | 'hire' = 'self', name = 'InvoiceSloth'): Asset | undefined {
  const before = ventureAssets(g).length
  startVenture(g, type)
  drain(
    g,
    (m) => (m.scriptId === 'computer.dev.venture.idea' ? 'idea0' : m.scriptId === 'computer.dev.venture.build' ? build : m.choices[0].id),
    () => name,
  )
  const list = ventureAssets(g)
  return list.length > before ? list[list.length - 1] : undefined
}

// ---------------------------------------------------------------------------

describe('getting a computer', () => {
  it('shows ask-your-parents and store pointers when there is no computer', () => {
    const g = kid(1, 12)
    const ids = noComputerNodes(g).map((n) => n.id)
    expect(ids).toContain('computer.dev.askParents')
    expect(ids).toContain('computer.dev.usedLaptop')
    expect(ids).toContain('electronicsStore')
    const menuIds = computerMenu.children(g).map((n) => n.id)
    expect(menuIds).toContain('computer.none')
    expect(menuIds).toContain('computer.dev.askParents')
    // Under 12: no store, no classifieds; still ask your parents.
    const young = kid(2, 9)
    expect(noComputerNodes(young).map((n) => n.id)).toEqual(['computer.dev.askParents'])
    // Adults: no parents to ask, just the pointers.
    const grown = makeTestGame(3, { age: 30 })
    const adultIds = noComputerNodes(grown).map((n) => n.id)
    expect(adultIds).not.toContain('computer.dev.askParents')
    expect(adultIds).toContain('electronicsStore')
  })

  it('a 12-year-old in a rich family gets a laptop; a poor family says no', () => {
    let rich = 0
    let poor = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = kid(seed, 12, { parentMoney: 2_000_000, rel: 90, grades: 82 })
      const before = g.people.reduce((s, p) => s + p.money, 0)
      askParentsForComputer(g)
      if (ownsComputer(g)) rich++
      expect(g.people.reduce((s, p) => s + p.money, 0)).toBeLessThanOrEqual(before)
      const h = kid(seed, 12, { parentMoney: 40, rel: 90, grades: 82 })
      askParentsForComputer(h)
      if (ownsComputer(h)) poor++
      expect(h.queue.some((m) => m.kind === 'notice' && /computer/i.test(m.title))).toBe(true)
    }
    expect(rich).toBe(20)
    expect(poor).toBe(0)
  })

  it('writes the life log and memories in the first person ("My mom", never "Your mom")', () => {
    // Review: the Profile read "Age 7: Your mom brought home our first family computer when I was 7."
    const lines: string[] = []
    let family = 0
    for (let seed = 1; seed <= 40; seed++) {
      for (const parentMoney of [2_000_000, 900]) {
        const g = kid(seed, 12, { parentMoney, rel: 85, grades: 75 })
        askParentsForComputer(g)
        lines.push(...g.log.flatMap((y) => y.entries.map((e) => e.text)), ...g.character.memories)
      }
      const h = kid(seed, 9, { parentMoney: 2_000_000 })
      if (familyComputerYear(h, 1_000_000) > 0) family++
      lines.push(...h.log.flatMap((y) => y.entries.map((e) => e.text)), ...h.character.memories)
    }
    expect(family).toBeGreaterThan(0)
    expect(lines.some((t) => /^(Age \d+: )?My (mom|dad) (bought|gave|brought)/.test(t))).toBe(true)
    expect(lines.filter((t) => /^(Age \d+: )?Your\b/.test(t))).toEqual([])
  })

  it('a middle-class family may hand down an old laptop; asking is limited to once a year', () => {
    let handMeDowns = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = kid(seed, 13, { parentMoney: 900, rel: 80, grades: 70 })
      askParentsForComputer(g)
      const a = g.assets.find((x) => x.name === 'Hand-Me-Down Laptop')
      if (a) {
        handMeDowns++
        expect(a.condition).toBeLessThan(100)
        expect(ownsComputer(g)).toBe(true)
      }
      const assets = g.assets.length
      g.queue = []
      askParentsForComputer(g)
      expect(g.assets.length).toBe(assets)
      expect((g.queue[0] as { text: string }).text).toMatch(/already asked/)
    }
    expect(handMeDowns).toBeGreaterThan(5)
  })

  it('buys a used laptop off the classifieds (sometimes a brick), once a year', () => {
    let got = 0
    for (let seed = 1; seed <= 25; seed++) {
      const g = makeTestGame(seed, { age: 20, money: 5_000 })
      g.lifeId = `life-${seed}`
      learnInternals.buyUsedLaptop(g)
      if (ownsComputer(g)) got++
      expect(g.character.money).toBeLessThan(5_000)
      const money = g.character.money
      learnInternals.buyUsedLaptop(g)
      expect(g.character.money).toBe(money)
    }
    expect(got).toBeGreaterThan(15)
  })
})

describe('learning to code', () => {
  it('tutorials raise skill and the language, three times a year at full value and a fourth at half value (the focus pool)', () => {
    const g = kid(4, 12)
    giveLaptop(g)
    learnInternals.studyTutorial(g, 'python')
    expect(codingSkill(g)).toBeGreaterThan(0)
    expect(languageLevel(g, 'python')).toBeGreaterThan(0)
    learnInternals.studyTutorial(g, 'python')
    learnInternals.studyTutorial(g, 'scratch')
    const s = codingSkill(g)
    // The same draws once at full value (the twin's counter is back at zero) and once as the fourth of the year.
    const twin = structuredClone(g)
    twin.yearActions = {}
    learnInternals.studyTutorial(twin, 'python')
    learnInternals.studyTutorial(g, 'python')
    expect(g.counters.codingSessions).toBe(4)
    const full = codingSkill(twin) - s
    const half = codingSkill(g) - s
    expect(half).toBeGreaterThanOrEqual(0)
    expect(half).toBeLessThanOrEqual(full)
    expect(screenTime(g)).toBeGreaterThan(0)
  })

  it('has diminishing returns and an age ceiling', () => {
    let low = 0
    let high = 0
    for (let seed = 1; seed <= 30; seed++) {
      const a = adult(seed, 'us', 25, 10)
      low += practice(a, 7, 'python').skill
      const b = adult(seed, 'us', 25, 80)
      high += practice(b, 7, 'python').skill
    }
    expect(low).toBeGreaterThan(high * 2)
    const young = kid(5, 9)
    giveLaptop(young)
    for (let i = 0; i < 40; i++) practice(young, 20, 'scratch')
    expect(codingSkill(young)).toBeLessThanOrEqual(codingCeiling(9))
  })

  it('courses and bootcamps cost local prices; bootcamp is 16+', () => {
    const us = adult(1, 'us')
    const india = adult(1, 'in')
    expect(courseCost(india)).toBeLessThan(courseCost(us))
    expect(bootcampCost(india)).toBeLessThan(bootcampCost(us))
    expect(bootcampCost(us)).toBeGreaterThan(5_000)
    const teen = kid(6, 15)
    giveLaptop(teen)
    learnInternals.bootcamp(teen, learnInternals.BOOTCAMP_TRACKS[0])
    expect(codingSkill(teen)).toBe(0)
    const money = us.character.money
    const before = codingSkill(us)
    learnInternals.bootcamp(us, learnInternals.BOOTCAMP_TRACKS[0])
    expect(us.character.money).toBe(money - bootcampCost(us))
    expect(codingSkill(us)).toBeGreaterThan(before)
    expect(devState(us).certs.some((c) => c.title.startsWith('Coding bootcamp'))).toBe(true)
    // Once a year.
    const m2 = us.character.money
    learnInternals.bootcamp(us, learnInternals.BOOTCAMP_TRACKS[1])
    expect(us.character.money).toBe(m2)
  })

  it('overdoing screen time costs grades', () => {
    let drop = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = kid(seed, 14, { grades: 80 })
      giveLaptop(g)
      addCodingSkill(g, 40)
      for (const id of ['python', 'javascript', 'html']) learnInternals.studyTutorial(g, id)
      for (const k of PROJECT_KINDS.filter((x) => x.id === 'website' || x.id === 'bot')) buildProject(g, k)
      for (const comp of learnInternals.COMPETITIONS.slice(0, 2)) learnInternals.compete(g, comp)
      for (let i = 0; i < 6; i++) doCodeGig(g, CODE_GIGS[1])
      expect(screenTime(g)).toBeGreaterThan(SCREEN_LIMIT)
      drop += 80 - g.character.education.current!.grades
    }
    expect(drop).toBeGreaterThan(5)
  })

  it('contests award CV entries and prizes', () => {
    let awards = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = adult(seed, 'us', 17, 85)
      g.character.stats.smarts = 90
      learnInternals.compete(g, learnInternals.COMPETITIONS.find((c) => c.id === 'hackathon')!)
      awards += devState(g).awards.length
    }
    expect(awards).toBeGreaterThan(3)
  })
})

describe('projects and freelancing', () => {
  it('builds projects with quality from skill, and they earn yearly money that fades', () => {
    const g = adult(7, 'us', 20, 70)
    const app = PROJECT_KINDS.find((k) => k.id === 'app')!
    buildProject(g, app)
    buildProject(g, PROJECT_KINDS.find((k) => k.id === 'extension')!)
    const s = devState(g)
    expect(s.shipped).toBe(2)
    const before = g.character.money
    const earned = yearlyProjects(g)
    expect(g.character.money - before).toBe(earned)
    expect(Number.isFinite(earned)).toBe(true)
    // Skill gate.
    const noob = kid(8, 12)
    giveLaptop(noob)
    buildProject(noob, app)
    expect(devState(noob).shipped).toBe(0)
  })

  it('freelance pay follows skill and the local economy; limited per year', () => {
    const us = adult(9, 'us', 25, 60)
    const ng = adult(9, 'ng', 25, 60)
    const gig = CODE_GIGS.find((x) => x.id === 'landing')!
    expect(gigRate(ng, gig)).toBeLessThan(gigRate(us, gig))
    const kid15 = kid(9, 15)
    giveLaptop(kid15)
    addCodingSkill(kid15, 60)
    expect(gigRate(kid15, gig)).toBeLessThan(gigRate(us, gig))
    for (let i = 0; i < 10; i++) {
      doCodeGig(us, gig)
      drain(us)
    }
    const s = devState(us)
    expect(s.freelance.gigs).toBe(6)
    expect(s.freelance.earned).toBeGreaterThan(0)
    expect(us.character.money).toBeGreaterThan(60_000)
  })
})

describe('ventures', () => {
  it('founds a SaaS through the menu flow and runs it for 10 years in several countries with sane numbers', () => {
    for (const country of ['us', 'in', 'gb', 'ng', 'de', 'br', 'jp', 'id']) {
      for (let seed = 1; seed <= 3; seed++) {
        const g = adult(seed * 31, country, 22, 65, 80_000)
        g.lifeId = `life-${country}-${seed}`
        const a = found(g, 'saas')
        expect(a, `${country} SaaS founded`).toBeDefined()
        if (!a) continue
        expect(a.name).toBe('InvoiceSloth')
        expect(readVenture(g, a).stage).toBe('building')
        let peak = 0
        for (let y = 0; y < 10 && g.character.alive; y++) {
          // A diligent founder: works on it twice a year and fixes debt.
          const cur = g.assets.find((x) => x.id === a.id)
          if (cur) {
            ventureInternals.workOn(g, a.id)
            ventureInternals.workOn(g, a.id)
            ventureInternals.fixDebt(g, a.id)
            if (y === 3) ventureInternals.setAds(g, a.id, 1)
            drain(g)
          }
          ageUp(g)
          drain(g, (m) => (m.scriptId === 'computer.dev.venture.event' ? m.choices[m.choices.length - 1].id : m.choices[0].id))
          const now = g.assets.find((x) => x.id === a.id)
          if (!now) break
          finiteVenture(g, now)
          peak = Math.max(peak, readVenture(g, now).users)
          expect(Number.isFinite(g.character.money)).toBe(true)
          expect(Number.isFinite(netWorth(g))).toBe(true)
        }
        const now = g.assets.find((x) => x.id === a.id)
        if (now) {
          const v = readVenture(g, now)
          expect(v.stage).toBe('live')
          expect(v.mrr).toBeLessThan(5_000_000)
          // A decade of yearly reports, unless an unrelated life event ended the founder's life early.
          expect(v.history.length).toBeGreaterThan(g.character.alive ? 3 : 0)
          expect(peak).toBeGreaterThan(0)
          expect(ventureAssetSubtitle(g, now)).toMatch(/SaaS/)
          expect(ventureAssetView(g, now).length).toBeGreaterThan(5)
        }
        expect(JSON.stringify(JSON.parse(JSON.stringify(g)))).toBe(JSON.stringify(g))
      }
    }
  }, 300_000)

  it('needs skill (or money for a freelancer) to build; one new venture a year; at most three', () => {
    const g = adult(11, 'us', 20, 10, 100)
    expect(found(g, 'saas', 'self')).toBeUndefined()
    expect(found(g, 'saas', 'hire')).toBeUndefined()
    const rich = adult(12, 'us', 20, 10, 100_000)
    const hired = found(rich, 'saas', 'hire')
    expect(hired).toBeDefined()
    expect(readVenture(rich, hired!).hired).toBe(true)
    expect(found(rich, 'store')).toBeUndefined()
    const many = adult(13, 'us', 20, 60, 100_000)
    for (let i = 0; i < 5; i++) {
      found(many, 'store', 'self', `Store ${i}`)
      many.yearActions = {}
    }
    expect(ventureAssets(many).length).toBe(MAX_VENTURES)
  })

  it('teens can run a store, an app and a game; ventures survive turning 18', () => {
    const g = kid(14, 13, { parentMoney: 50_000 })
    giveLaptop(g)
    g.character.money = 2_000
    addCodingSkill(g, 40)
    addLanguageXp(g, 'swift', 40)
    const store = found(g, 'store', 'self', 'Kicks Club')
    expect(store).toBeDefined()
    expect(readVenture(g, store!).stage).toBe('live')
    for (let y = 0; y < 6; y++) {
      ventureInternals.workOn(g, store!.id)
      drain(g)
      ageUp(g)
      drain(g)
      if (y === 1) {
        found(g, 'app', 'self', 'Splitr')
      }
    }
    expect(g.character.age).toBe(19)
    for (const a of ventureAssets(g)) finiteVenture(g, a)
    expect(Number.isFinite(g.character.money) && g.character.money >= 0).toBe(true)
  })

  it('sells a venture: proceeds, taxes on the gain, exit on the CV', () => {
    const g = adult(15, 'us', 30, 60, 1_000)
    const a = createVenture(g, 'saas', 'HonkHub', { text: 'Invoicing for freelance clowns', key: 'Honk', mult: 1 }, { live: true, quality: 70, users: 400, invested: 5_000 })
    const v = readVenture(g, a)
    v.mrr = 12_000
    v.prevMrr = 10_000
    v.revenue = 130_000
    v.valuation = ventureInternals.valuationOf(v)
    expect(v.valuation).toBeGreaterThan(100_000)
    a.details = { ...a.details, mrr: v.mrr, prevMrr: v.prevMrr, revenue: v.revenue, valuation: v.valuation }
    ventureInternals.sell(g, a.id)
    const choice = lastModal(g, 'choice')!
    expect(choice.choices.length).toBeGreaterThan(2)
    g.queue = []
    runScript(g, choice.scriptId!, 'offer1', choice.data, choice)
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(g.character.money).toBeGreaterThan(50_000)
    expect(devState(g).exits).toHaveLength(1)
    expect(cvEntries(g).some((e) => e.title === 'Founder (acquired)')).toBe(true)
    expect(g.flags.taxesPaid).toBeGreaterThan(0)
  })

  it('every venture event resolves for every choice without breaking numbers', () => {
    for (const type of ['saas', 'app', 'store', 'game'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const g = kid(seed, 16)
        g.character.money = 30_000
        giveLaptop(g)
        addCodingSkill(g, 55)
        createPerson(g, { relation: 'friend', age: 16, relationship: 80 })
        const a = createVenture(g, type, `Test ${type}`, { text: 'An idea', key: 'Test', mult: 1, product: 'sneakers' }, { live: true, quality: 70, users: 800, invested: 2_000 })
        const v0 = readVenture(g, a)
        v0.cofounder = 'Sam Lee'
        v0.revenue = 50_000
        v0.mrr = 5_000
        v0.prevMrr = 3_000
        v0.valuation = 300_000
        v0.launchYear = g.year - 3
        v0.history = [
          { y: g.year - 2, users: 300, revenue: 20_000, profit: 5_000 },
          { y: g.year - 1, users: 600, revenue: 50_000, profit: 15_000 },
        ]
        a.details = { ...a.details, ...JSON.parse(JSON.stringify(v0)), cofounderStake: 0.2 }
        const events = ventureInternals.eligibleEvents(g, { a, v: readVenture(g, a) })
        expect(events.length).toBeGreaterThan(3)
        for (const [ev] of events) {
          const probe = structuredClone(g)
          const pa = probe.assets.find((x) => x.id === a.id)!
          ventureInternals.fireEvent(probe, { a: pa, v: readVenture(probe, pa) }, ev)
          const modal = lastModal(probe, 'choice')
          if (!modal) continue
          for (const ch of modal.choices) {
            const h = structuredClone(probe)
            h.queue = []
            runScript(h, modal.scriptId!, ch.id, modal.data, modal)
            drain(h)
            const after = h.assets.find((x) => x.id === a.id)
            if (after) finiteVenture(h, after)
            expect(Number.isFinite(h.character.money)).toBe(true)
            expect(h.character.money).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })

  it('a sole adult heir inherits a venture; it keeps running without the old founder', () => {
    const g = adult(25, 'us', 70, 60, 50_000)
    const a = createVenture(g, 'saas', 'HonkHub', { text: 'Invoicing for clowns', key: 'Honk', mult: 1 }, { live: true, quality: 80, users: 300 })
    ventureInternals.workOn(g, a.id)
    g.queue = []
    const heir = createPerson(g, { relation: 'child', age: 40, money: 1_000 })
    killCharacter(g, 'Old Age')
    const n = continueAsChild(g, heir.id)
    const inherited = ventureAssets(n)
    expect(inherited).toHaveLength(1)
    expect(codingSkill(n)).toBe(0)
    n.queue = []
    for (let y = 0; y < 4; y++) {
      ageUp(n)
      drain(n)
    }
    const cur = ventureAssets(n)[0]
    if (cur) {
      finiteVenture(n, cur)
      // Nobody codes on it any more: quality slides toward what contractors (none) can keep up.
      expect(readVenture(n, cur).quality).toBeLessThan(80)
    }
    expect(Number.isFinite(n.character.money)).toBe(true)
  })

  it('inherited and old-save ventures with missing data still work', () => {
    const g = adult(16)
    const bare: Asset = { id: 'old1', kind: 'venture', name: 'Mystery Startup', emoji: '\u{2601}\u{FE0F}', purchasePrice: 0, value: 0, condition: 100, purchasedAge: 20, upkeep: 0, details: {} }
    const junk: Asset = { id: 'old2', kind: 'venture', name: 'Junk', emoji: '\u{2601}\u{FE0F}', purchasePrice: 0, value: 0, condition: 100, purchasedAge: 20, upkeep: 0, details: { type: 'nope', users: 'many', quality: null, history: 'x', tier: 99 } }
    g.assets.push(bare, junk)
    expect(() => ventureAssetView(g, bare)).not.toThrow()
    expect(() => ventureAssetSubtitle(g, junk)).not.toThrow()
    expect(ASSET_KIND_VIEWS.venture).toBeDefined()
    yearlyDev(g)
    drain(g)
    for (const a of ventureAssets(g)) finiteVenture(g, a)
  })
})

describe('CV and careers', () => {
  it('adds coding skill, projects, freelance work and ventures to the CV', () => {
    const g = adult(17, 'us', 22, 70)
    buildProject(g, PROJECT_KINDS.find((k) => k.id === 'website')!)
    buildProject(g, PROJECT_KINDS.find((k) => k.id === 'bot')!)
    for (let i = 0; i < 4; i++) {
      doCodeGig(g, CODE_GIGS[1])
      drain(g)
    }
    createVenture(g, 'app', 'Splitr', { text: 'A split-the-bill app', key: 'Split', mult: 1 }, { live: true, quality: 60, users: 1_000 })
    const ids = devCvEntries(g).map((e) => e.id)
    expect(ids).toContain('d:dev:skill')
    expect(ids.some((id) => id.startsWith('d:dev:venture'))).toBe(true)
    const all = cvEntries(g)
    expect(all.some((e) => e.id === 'd:dev:skill')).toBe(true)
    expect(all.filter((e) => e.id.startsWith('d:dev:')).every((e) => e.strength >= 1 && e.strength <= 10)).toBe(true)
  })

  it('strong self-taught coders with a portfolio qualify for software jobs without a degree', () => {
    const prog = getJobDef('computer_programmer')!
    const acct = getJobDef('accountant')!
    const g = adult(18, 'us', 23, 30)
    expect(jobRequirementProblem(g, prog)).toMatch(/requires/)
    addCodingSkill(g, 40)
    expect(codingSkill(g)).toBe(70)
    expect(selfTaughtDev(g, prog)).toBe(false)
    const s = devState(g)
    s.projects.push({ id: 'p1', kind: 'app', name: 'PlantPal', q: 80, age: 20, users: 9_000, income: 100, earned: 300, lang: 'swift' })
    s.projects.push({ id: 'p2', kind: 'website', name: 'a portfolio site', q: 65, age: 21, users: 2_000, income: 0, earned: 0, lang: 'html' })
    g.flags.dev = JSON.parse(JSON.stringify(s))
    expect(codingPortfolio(g)).toBe(2)
    expect(jobRequirementProblem(g, prog)).toBeNull()
    expect(jobRequirementProblem(g, acct)).toMatch(/requires/)
    // Still too young is still too young.
    const teen = adult(19, 'us', 16, 90)
    teen.flags.dev = g.flags.dev
    expect(jobRequirementProblem(teen, prog)).toMatch(/18/)
  })

  it('links coding gigs from Occupation › Freelance Gigs', () => {
    const g = adult(20)
    expect(findNode(g, occupationMenu.children(g), 'computer.dev.freelance')).toBeDefined()
  })
})

describe('parents, prison, death', () => {
  it('parents react to screen time and bad grades, and can confiscate the computer', () => {
    let confiscated = 0
    let talks = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = kid(seed, 14, { grades: 45 })
      giveLaptop(g)
      g.flags.screenTime = { age: 13, hours: SCREEN_LIMIT + 6 }
      yearlyDev(g)
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'computer.dev.parents.screen')
      if (!m) continue
      talks++
      g.queue = []
      runScript(g, m.scriptId!, 'argue', m.data, m)
      if (typeof g.flags.computerLockedUntil === 'number') {
        confiscated++
        expect(g.flags.computerLockedUntil).toBe(15)
        const ids = computerMenu.children(g).map((n) => n.id)
        expect(ids).toEqual(['computer.locked'])
      }
    }
    expect(talks).toBeGreaterThan(10)
    expect(confiscated).toBeGreaterThan(3)
  })

  it('nothing works from prison or when dead, but ventures keep running on autopilot', () => {
    const g = adult(21, 'us', 30, 60, 50_000)
    const a = createVenture(g, 'saas', 'Cancelify', { text: 'Meeting cancellation software', key: 'Cancel', mult: 1 }, { live: true, quality: 70, users: 300 })
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(computerMenu.visible!(g)).toBe(false)
    const skill = codingSkill(g)
    learnInternals.studyTutorial(g, 'python')
    expect(codingSkill(g)).toBe(skill)
    for (const n of devNodes(g)) if ((n.type === 'menu' || n.type === 'action') && n.disabledReason) expect(n.disabledReason(g)).toBeTruthy()
    g.queue = []
    yearlyDev(g)
    expect(g.queue.filter((m) => m.kind === 'choice')).toHaveLength(0)
    finiteVenture(g, g.assets.find((x) => x.id === a.id)!)
    for (const n of ventureAssetView(g, a)) if (n.type === 'action' && n.disabledReason) expect(n.disabledReason(g)).toBeTruthy()

    const dead = adult(22)
    dead.character.alive = false
    expect(computerMenu.visible!(dead)).toBe(false)
    const before = JSON.stringify(dead)
    yearlyDev(dead)
    expect(JSON.stringify(dead)).toBe(before)
  })
})

describe('old saves and plain JSON', () => {
  it('survives junk in its flags', () => {
    const g = adult(24)
    g.flags.dev = { projects: 'lol', awards: [null, 3, { title: 5 }], freelance: [], exits: {} } as never
    g.flags.codingLangs = { python: 'a lot', klingon: 99, rust: 40 } as never
    g.flags.screenTime = 'yes' as never
    expect(() => devNodes(g)).not.toThrow()
    expect(devState(g).projects).toEqual([])
    expect(languageLevel(g, 'rust')).toBe(40)
    expect(languageLevel(g, 'python')).toBe(0)
    expect(screenTime(g)).toBe(0)
    expect(() => devCvEntries(g)).not.toThrow()
    yearlyDev(g)
    drain(g)
  })

  it('random computer lives stay finite, plain JSON and drain cleanly', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let g = createNewLife({ seed: seed * 101, year: 2026 })
      drain(g)
      let r = seed * 7919
      const rnd = () => {
        r = (r * 1103515245 + 12345) & 0x7fffffff
        return r / 0x7fffffff
      }
      while (g.character.alive && g.character.age < 45) {
        if (g.character.age === 9) {
          giveLaptop(g)
          g.character.money += 3_000
        }
        if (g.character.age >= 8) {
          for (let i = 0; i < 5; i++) {
            const acts = collectActions(g, computerMenu.children(g))
            if (!acts.length) break
            const act = acts[Math.floor(rnd() * acts.length)]
            act.run(g, act.input ? (act.input.kind === 'number' ? '50' : 'Test') : undefined)
            drain(g, (m) => m.choices[Math.floor(rnd() * m.choices.length)].id, (m) => (rnd() < 0.5 ? (m.defaultValue ?? '') : '  '))
          }
        }
        ageUp(g)
        drain(g, (m) => m.choices[Math.floor(rnd() * m.choices.length)].id)
        expect(Number.isFinite(g.character.money)).toBe(true)
        expect(Number.isFinite(netWorth(g))).toBe(true)
        for (const a of ventureAssets(g)) finiteVenture(g, a)
        const json = JSON.stringify(g)
        expect(JSON.stringify(JSON.parse(json))).toBe(json)
        g = JSON.parse(json) as GameState
      }
    }
    // Twelve 45-year lives with every yearly hook of the year system: give it room
    // (sized for a 2-core CI runner; 540 full years, each running the world economy).
  }, 300_000)
})

// ---------------------------------------------------------------------------
// Review fixes: exploits, balance and edge cases found by playing it adversarially.

const IDEA = { text: 'Invoicing for freelance clowns', key: 'Honk', mult: 1, product: 'sneakers' }

/** Run a venture for `years` with no player input; returns the summed yearly profit. */
function runYears(g: GameState, a: Asset, years: number): number {
  let profit = 0
  for (let y = 0; y < years && g.assets.some((x) => x.id === a.id); y++) {
    ventureInternals.stepVenture(g, a, false)
    profit += readVenture(g, a).profit
    g.year++
  }
  return profit
}

describe('review fixes', () => {
  it('spamming hobby projects is a lottery with tired audiences, not a risk-free salary', () => {
    const totals: number[] = []
    let first = 0
    let second = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = adult(seed * 7, 'us', 22, 80, 10_000)
      addLanguageXp(g, 'cpp', 80)
      addLanguageXp(g, 'swift', 80)
      g.character.stats.smarts = 80
      const game = PROJECT_KINDS.find((k) => k.id === 'game')!
      let total = 0
      for (let y = 0; y < 10; y++) {
        buildProject(g, game)
        buildProject(g, game)
        if (y === 0) {
          const ps = devState(g).projects
          first += ps[0]?.users ?? 0
          second += ps[1]?.users ?? 0
        }
        g.queue = []
        g.yearActions = {}
        total += yearlyProjects(g)
        g.character.age++
        g.year++
      }
      totals.push(total)
    }
    totals.sort((a, b) => a - b)
    // Before: two hobby games a year paid a skilled coder ~$900K over a decade, every time.
    expect(totals[5]).toBeLessThan(300_000)
    expect(totals[5]).toBeGreaterThan(0)
    // The same kind of project twice in a row reaches fewer people.
    expect(second).toBeLessThan(first)
  })

  it('weak product-market fit loses money; a strong fit with the same product makes it', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const weak = adult(seed, 'us', 30, 60, 50_000)
      const w = createVenture(weak, 'saas', 'Meh', IDEA, { live: true, quality: 60, users: 3, fit: 0.1 })
      const strong = adult(seed, 'us', 30, 60, 50_000)
      const s = createVenture(strong, 'saas', 'Yes', IDEA, { live: true, quality: 60, users: 3, fit: 2 })
      const pw = runYears(weak, w, 6)
      const ps = runYears(strong, s, 6)
      expect(pw).toBeLessThan(0)
      expect(ps).toBeGreaterThan(pw)
    }
  })

  it('an online store with a marketing budget is a real gamble: some lose money, some make it', () => {
    let losers = 0
    let winners = 0
    for (let seed = 1; seed <= 24; seed++) {
      const g = adult(seed * 13 + 7, 'us', 20, 40, 30_000)
      g.lifeId = `store-${seed}`
      const a = found(g, 'store', 'self', `Store ${seed}`)
      if (!a) continue
      const start = readVenture(g, a).invested
      let paid = 0
      let invested = start
      for (let y = 0; y < 8 && g.assets.some((x) => x.id === a.id); y++) {
        ventureInternals.workOn(g, a.id)
        ventureInternals.workOn(g, a.id)
        if (y === 1) ventureInternals.setAds(g, a.id, 1)
        drain(g)
        const before = Number(g.counters.ventureIncome ?? 0)
        ageUp(g)
        drain(g, (m) => (m.scriptId === 'computer.dev.venture.event' ? (m.choices.find((c) => c.id !== 'accept' && c.id !== 'counter')?.id ?? m.choices[0].id) : m.choices[0].id))
        paid += Number(g.counters.ventureIncome ?? 0) - before
        const cur = g.assets.find((x) => x.id === a.id)
        if (cur) invested = readVenture(g, cur).invested
      }
      if (paid - invested < 0) losers++
      else winners++
    }
    expect(losers).toBeGreaterThan(0)
    expect(winners).toBeGreaterThan(0)
  }, 120_000)

  it('developer contractors cost near-global rates; store helpers earn local wages', () => {
    // A cheap local dev team used to make 5 contractors + max ads a sure thing in poorer countries.
    expect(contractorCost('ng', 'saas')).toBeGreaterThan(contractorCost('us', 'saas') * 0.4)
    expect(contractorCost('id', 'app')).toBeGreaterThan(contractorCost('us', 'app') * 0.4)
    expect(contractorCost('ng', 'store')).toBeLessThan(contractorCost('ng', 'saas'))
    expect(contractorCost('de', 'store')).toBeLessThanOrEqual(contractorCost('de', 'saas'))
  })

  it('premium pricing is a trade-off, not a free multiplier', () => {
    const profitAt = (type: 'saas' | 'store', tier: number): number => {
      let total = 0
      for (let seed = 1; seed <= 10; seed++) {
        const g = adult(seed, 'us', 25, 60, 50_000)
        g.lifeId = `tier-${seed}`
        const a = createVenture(g, type, 'T', IDEA, { live: true, quality: 70, users: 1, fit: 1 })
        a.details.tier = tier
        total += runYears(g, a, 10)
      }
      return total
    }
    expect(profitAt('saas', 2)).toBeLessThan(profitAt('saas', 1) * 1.35)
    expect(profitAt('store', 2)).toBeLessThan(profitAt('store', 1) * 1.35)
  })

  it('raising prices loses customers in proportion to the jump', () => {
    const g = adult(31, 'us', 30, 60, 10_000)
    const a = createVenture(g, 'saas', 'Hike', IDEA, { live: true, quality: 70, users: 1_000 })
    a.details.tier = 0
    ventureInternals.setTier(g, a.id, 2)
    // $9 → $99 a month: most customers walk.
    expect(readVenture(g, a).users).toBeLessThan(500)
    const h = adult(32, 'us', 30, 60, 10_000)
    const b = createVenture(h, 'saas', 'Hike2', IDEA, { live: true, quality: 70, users: 1_000 })
    ventureInternals.setTier(h, b.id, 2)
    const kept = readVenture(h, b).users
    expect(kept).toBeGreaterThan(350)
    expect(kept).toBeLessThan(800)
  })

  it('sale offers stand for the year instead of re-rolling until someone overpays', () => {
    const g = adult(33, 'us', 30, 60, 1_000)
    const a = createVenture(g, 'saas', 'HonkHub', IDEA, { live: true, quality: 70, users: 400, invested: 5_000 })
    const offers = () => {
      ventureInternals.sell(g, a.id)
      const m = lastModal(g, 'choice')!
      g.queue = []
      return m.choices.map((c) => c.label)
    }
    const first = offers()
    for (let i = 0; i < 5; i++) expect(offers()).toEqual(first)
    g.year++
    offers()
    expect((a.details.sellOffers as { year: number }).year).toBe(g.year)
  })

  it('a screen-time fight never shortens a longer confiscation', () => {
    let checked = 0
    for (let seed = 1; seed <= 20 && checked < 3; seed++) {
      const g = kid(seed, 14, { grades: 40 })
      giveLaptop(g)
      g.flags.screenTime = { age: 13, hours: SCREEN_LIMIT + 6 }
      yearlyDev(g)
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'computer.dev.parents.screen')
      if (!m) continue
      // Something shadier got it locked away until 18 before the talk was answered.
      g.flags.computerLockedUntil = 18
      g.flags.computerLockedBy = 'The police'
      g.queue = []
      runScript(g, m.scriptId!, 'argue', m.data, m)
      expect(g.flags.computerLockedUntil).toBe(18)
      expect(g.flags.computerLockedBy).toBe('The police')
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it("a fine you can't pay is owed and comes out of future profits (it doesn't just vanish)", () => {
    const g = adult(34, 'us', 30, 60, 0)
    const a = createVenture(g, 'saas', 'Leaky', IDEA, { live: true, quality: 70, users: 2_000 })
    ventureInternals.fireEvent(g, { a, v: readVenture(g, a) }, 'breach')
    const m = lastModal(g, 'choice')!
    g.queue = []
    runScript(g, m.scriptId!, 'disclose', m.data, m)
    const owed = readVenture(g, a).owed
    expect(owed).toBeGreaterThan(0)
    expect(g.character.money).toBeGreaterThanOrEqual(0)
    expect(ventureAssetView(g, a).some((n) => n.type === 'info' && String(n.text).includes('Unpaid fines'))).toBe(true)
    // A profitable year pays the regulator first.
    const r = ventureInternals.stepVenture(g, a, false)
    const v = readVenture(g, a)
    expect(v.profit).toBeGreaterThan(owed)
    expect(v.owed).toBe(0)
    expect(r.payout).toBe(Math.round(v.profit - owed))
  })

  it('a company drowning in unpaid fines is eventually wound up', () => {
    const g = adult(35, 'us', 30, 60, 0)
    const a = createVenture(g, 'saas', 'Doomed', IDEA, { live: true, quality: 40, users: 3, fit: 0.1 })
    a.details.owed = 1_000_000
    for (let y = 0; y < 4 && g.assets.some((x) => x.id === a.id); y++) {
      ventureInternals.stepVenture(g, a, false)
      g.year++
    }
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    expect(Number.isFinite(g.character.money) && g.character.money >= 0).toBe(true)
  })

  it("working on a venture never makes it worse, and a contractor doesn't wreck a build", () => {
    // An heir who can't code clicks "Ship Features" on a polished SaaS.
    const g = adult(36, 'us', 30, 0, 10_000)
    const a = createVenture(g, 'saas', 'Polished', IDEA, { live: true, quality: 85, users: 300 })
    ventureInternals.workOn(g, a.id)
    expect(readVenture(g, a).quality).toBeGreaterThanOrEqual(85)
    // A good build plus one contractor used to be capped at 53.
    const h = adult(37, 'us', 30, 80, 100_000)
    const b = createVenture(h, 'saas', 'Build', IDEA, { quality: 75 })
    ventureInternals.hire(h, b.id, 1)
    h.queue = []
    ventureInternals.stepVenture(h, b, false)
    expect(readVenture(h, b).quality).toBeGreaterThanOrEqual(75)
  })

  it('an event answered from behind bars is handled without you', () => {
    const g = adult(38, 'us', 30, 60, 10_000)
    const a = createVenture(g, 'saas', 'Jailbird', IDEA, { live: true, quality: 70, users: 500 })
    ventureInternals.fireEvent(g, { a, v: readVenture(g, a) }, 'outage')
    const m = lastModal(g, 'choice')!
    g.queue = []
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    const skill = codingSkill(g)
    const health = g.character.stats.health
    runScript(g, m.scriptId!, 'fix', m.data, m)
    expect(codingSkill(g)).toBe(skill)
    expect(g.character.stats.health).toBe(health)
    expect(lastModal(g, 'notice')?.title).toBe('Handled Without You')
    finiteVenture(g, a)
  })

  it("going viral sells a game's next copies instead of inventing players", () => {
    const g = adult(39, 'us', 30, 60, 10_000)
    const a = createVenture(g, 'game', 'Snail Odyssey', IDEA, { live: true, quality: 70, users: 5_000 })
    const before = readVenture(g, a)
    ventureInternals.fireEvent(g, { a, v: before }, 'viral')
    const m = lastModal(g, 'choice')!
    g.queue = []
    runScript(g, m.scriptId!, 'calm', m.data, m)
    const after = readVenture(g, a)
    expect(after.users).toBe(before.users)
    expect(after.tail).toBeGreaterThan(before.tail)
  })

  it('event costs and windfalls scale with the size of the business', () => {
    const g = adult(40, 'us', 30, 60, 10_000)
    const store = createVenture(g, 'store', 'Tiny Kicks', IDEA, { live: true, quality: 60, users: 20 })
    ventureInternals.fireEvent(g, { a: store, v: readVenture(g, store) }, 'lostParcels')
    const m = lastModal(g, 'choice')!
    expect(Number((m.data as { cost: number }).cost)).toBeLessThan(300)
    g.queue = []
    const saas = createVenture(g, 'saas', 'Small', IDEA, { live: true, quality: 70, users: 30 })
    ventureInternals.fireEvent(g, { a: saas, v: readVenture(g, saas) }, 'bigCustomer')
    const b = lastModal(g, 'choice')!
    g.queue = []
    runScript(g, b.scriptId!, 'sign', b.data, b)
    expect(readVenture(g, saas).users).toBeLessThanOrEqual(45)
  })

  it('names the real local data regulator in more countries', () => {
    expect(dataRegulator('us')).toBe('the FTC')
    expect(dataRegulator('id')).not.toBe('the data protection regulator')
    expect(dataRegulator('ng')).toBe('the NDPC')
    expect(dataRegulator('de')).toMatch(/data protection/)
  })
})
