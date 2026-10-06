// Special Careers › Game Industry: studio jobs, making your own games, owned game studios
// (business system), the home computer's old game ventures, money sanity, prison and death.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/ai/director'
import { ageUp } from '../src/game/aging'
import { canIpo, goPublic, sellBusiness } from '../src/game/business/exit'
import { startFounding } from '../src/game/business/founding'
import { growVentureIntoStudio, simulateStudioYear, startGreenlight, studioAssets, studioInternals, studioOf } from '../src/game/business/gamestudio'
import { devGames, normalizeStudio, studioValue } from '../src/game/business/gamestudio-state'
import { newBiz } from '../src/game/business/founding'
import { bizOf, readBiz } from '../src/game/business/state'
import { valuationOf } from '../src/game/business/economy'
import { devNodes, devSummary, yearlyDev } from '../src/game/computer/dev'
import { codingPortfolio } from '../src/game/computer/dev-cv'
import { projectsMenu } from '../src/game/computer/dev-projects'
import { allVentureAssets, devState, readVenture, saveDev, ventureAssets } from '../src/game/computer/dev-state'
import { createVenture, startVentureMenu } from '../src/game/computer/dev-venture'
import { addCodingSkill, addLanguageXp } from '../src/game/computer/skills'
import { cvEntries } from '../src/game/cv'
import { killCharacter } from '../src/game/death'
import { sendToPrison } from '../src/game/prison'
import { runScript } from '../src/game/scripts'
import { specialCareersMenu, specialJobNodes } from '../src/game/special'
import { gameDevJobNodes, gameDevSummary, gameIndustryMenu, yearlyGameDev } from '../src/game/special/gamedev'
import { careerInternals, jobListings, requirementProblem, salaryFor, takeJob, type Listing } from '../src/game/special/gamedev-career'
import { netPerCopy } from '../src/game/special/gamedev-core'
import { gameJam, makeInternals, publisherOffers, releaseGame, settleReceipts, startGame, workOnGame, yearlyMakeGames } from '../src/game/special/gamedev-make'
import { gameJob, gamePortfolio, gdMut, gdView, normalizeProfile, readJobData, type GdCredit } from '../src/game/special/gamedev-state'
import type { Asset, ChoiceModal, GameState, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import '../src/game/menus'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

function laptop(g: GameState): Asset {
  const a: Asset = { id: `laptop${g.nextId++}`, kind: 'other', name: 'Laptop', emoji: '\u{1F4BB}', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: g.character.age, upkeep: 0, details: { category: 'electronics' } }
  g.assets.push(a)
  return a
}

function dev(seed: number, countryId = 'us', age = 24, money = 20_000): GameState {
  const g = makeTestGame(seed, { age, countryId, money })
  g.lifeId = `gamedev-${countryId}-${seed}`
  g.character.city = getCountry(countryId).cities[0]
  g.character.stats.health = 100
  laptop(g)
  addCodingSkill(g, 60)
  addLanguageXp(g, 'csharp', 60)
  g.flags.lastCodedAge = age
  const p = gdMut(g)
  p.design = 55
  p.art = 45
  return g
}

/** Resolve the queue like the store does, preferring choice ids in `prefer`. */
function drain(g: GameState, prefer: string[] = [], input?: (def: string) => string): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 400) throw new Error('queue never drains')
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => prefer.includes(c.id)) ?? m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, input ? input(m.defaultValue ?? '') : m.defaultValue || '5', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function lastChoice(g: GameState): ChoiceModal | undefined {
  return [...g.queue].reverse().find((m) => m.kind === 'choice') as ChoiceModal | undefined
}

function ids(_g: GameState, nodes: MenuNode[]): string[] {
  return nodes.map((n) => n.id)
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 6) return undefined
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu' && (!n.disabledReason || !n.disabledReason(g))) {
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function finiteCredit(x: GdCredit): void {
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === 'number') {
      expect(Number.isFinite(v), `${k} is finite`).toBe(true)
      expect(v, `${k} >= 0`).toBeGreaterThanOrEqual(0)
    }
  }
}

function finiteMoney(g: GameState): void {
  expect(Number.isFinite(g.character.money)).toBe(true)
  expect(g.character.money).toBeGreaterThanOrEqual(0)
}

/** Next year, the light way (no other yearly hooks). */
function nextYear(g: GameState): void {
  g.year++
  g.character.age++
  g.yearActions = {}
  g.flags.taxableIncome = 0
}

/** Develop a small game through the real flow and ship it. */
function shipSmallGame(g: GameState): GdCredit | null {
  startGame(g)
  drain(g, ['small', 'pc', 'cobalt'])
  for (let i = 0; i < 12 && (gdView(g).projects[0]?.progress ?? 100) < 100; i++) {
    const pr = gdView(g).projects[0]
    if (!pr) break
    if (i % 3 === 0 && i > 0) nextYear(g)
    workOnGame(g, pr.id)
    g.queue = []
  }
  const pr = gdView(g).projects[0]
  if (!pr) return null
  const credit = releaseGame(g, pr.id)
  g.queue = []
  return credit
}

function foundStudio(g: GameState): Asset {
  startFounding(g, 'gameStudio')
  drain(g, ['city0', 'savings', 'me'])
  const a = studioAssets(g)[0]
  if (!a) throw new Error('studio not founded')
  return a
}

function listing(g: GameState, level: number, track: Listing['track'], tier: Listing['tier'] = 'mid'): Listing {
  return { id: `${g.year}:test`, studio: tier === 'aaa' ? 'Colossus Interactive' : 'Paper Kite Games', tier, hq: g.character.countryId, city: g.character.city, level, track, title: level === 0 ? 'QA Tester' : 'Junior Programmer', salary: salaryFor(g, level, tier), craft: 70 }
}

// ---------------------------------------------------------------------------

describe('the menu', () => {
  it('lives in Special Careers with jobs, game making and the studio', () => {
    const g = dev(1, 'us', 20)
    const special = specialCareersMenu.children(g).map((n) => n.id)
    expect(special).toContain('gameIndustry')
    const kids = gameIndustryMenu.children(g).map((n) => n.id)
    expect(kids).toContain('gamedev.make')
    expect(kids).toContain('gamedev.games')
    expect(kids).toContain('gamedev.jobs')
    expect(kids).toContain('gamedev.studio.start')
    expect(typeof gameIndustryMenu.header?.(g)).toBe('string')
    // Toddlers just get a joke.
    expect(ids(makeTestGame(2, { age: 3 }), gameIndustryMenu.children(makeTestGame(2, { age: 3 })))).toEqual(['gamedev.young'])
    // Kids can make Scratch games and draw; real projects at 12.
    const kid = dev(3, 'us', 9)
    const make = findNode(kid, gameIndustryMenu.children(kid), 'gamedev.make')
    expect(make?.type).toBe('menu')
    const rows = make && make.type === 'menu' ? make.children(kid) : []
    const visible = rows.filter((n) => n.type !== 'heading' && (!('visible' in n) || !n.visible || n.visible(kid))).map((n) => n.id)
    expect(visible).toContain('gamedev.make.scratch')
    expect(visible).not.toContain('gamedev.make.new')
  })

  it('the computer keeps a pointer to Game Industry instead of its own game rows', () => {
    const g = dev(4, 'us', 14)
    const projects = projectsMenu.children(g).map((n) => n.id)
    expect(projects).not.toContain('computer.dev.project.game')
    expect(projects).not.toContain('computer.dev.project.scratch')
    expect(projects).toContain('computer.dev.games')
    const link = projectsMenu.children(g).find((n) => n.id === 'computer.dev.games')
    expect(link?.type === 'menu' && link.children(g).some((n) => n.id === 'gamedev.make.jam')).toBe(true)
    const ventures = startVentureMenu.children(g).map((n) => n.id)
    expect(ventures).not.toContain('computer.dev.start.game')
    expect(ventures).toContain('computer.dev.start.games')
  })
})

describe('studio jobs: ladder and requirements', () => {
  it('QA from 16, juniors need skill or a degree, seniors need shipped games', () => {
    const teen = makeTestGame(5, { age: 15 })
    expect(requirementProblem(teen, 0, 'qa')).toMatch(/16/)
    teen.character.age = 16
    expect(requirementProblem(teen, 0, 'qa')).toBeNull()
    expect(requirementProblem(teen, 1, 'code')).toMatch(/18/)
    const g = makeTestGame(6, { age: 22 })
    expect(requirementProblem(g, 1, 'code')).toMatch(/coding skill/)
    addCodingSkill(g, 45)
    expect(requirementProblem(g, 1, 'code')).toBeNull()
    // A CS degree lowers the bar.
    const grad = makeTestGame(7, { age: 22 })
    addCodingSkill(grad, 28)
    expect(requirementProblem(grad, 1, 'code')).not.toBeNull()
    grad.character.education.degrees.push({ kind: 'bachelor', major: 'Computer Science', school: 'State U', age: 22 } as never)
    expect(requirementProblem(grad, 1, 'code')).toBeNull()
    // Senior roles want shipped games.
    addCodingSkill(g, 40)
    expect(requirementProblem(g, 3, 'code')).toMatch(/shipped/)
    const p = gdMut(g)
    for (let i = 0; i < 4; i++) p.games.push(normalizeProfile({ games: [{ title: `Game ${i}`, critic: 80, copies: 10_000, role: 'Programmer', studio: 'X', scope: 'indie' }] }).games[0])
    expect(requirementProblem(g, 3, 'code')).toBeNull()
  })

  it('salaries follow the local market and are finite everywhere', () => {
    const us = makeTestGame(8, { age: 25, countryId: 'us' })
    const br = makeTestGame(8, { age: 25, countryId: 'br' })
    const ng = makeTestGame(8, { age: 25, countryId: 'ng' })
    for (const g of [us, br, ng]) for (let l = 0; l <= 6; l++) for (const t of ['indie', 'mid', 'aaa'] as const) {
      const s = salaryFor(g, l, t)
      expect(Number.isFinite(s) && s > 0).toBe(true)
    }
    expect(salaryFor(us, 1, 'mid')).toBeGreaterThan(salaryFor(br, 1, 'mid'))
    expect(salaryFor(br, 1, 'mid')).toBeGreaterThan(salaryFor(ng, 1, 'mid'))
    expect(salaryFor(us, 4, 'aaa')).toBeGreaterThan(salaryFor(us, 1, 'aaa'))
    const teen = makeTestGame(8, { age: 16, countryId: 'us' })
    expect(salaryFor(teen, 0, 'mid')).toBeLessThan(salaryFor(us, 0, 'mid'))
  })

  it('applying runs an interview; a hire is a special job with a project and Occupation actions', () => {
    let hired = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = dev(seed, 'jp', 23)
      const listings = jobListings(g)
      expect(listings.length).toBeGreaterThan(0)
      for (const l of listings) {
        expect(l.studio.length).toBeGreaterThan(0)
        expect(Number.isFinite(l.salary) && l.salary > 0).toBe(true)
      }
      careerInternals.applyTo(g, listing(g, 1, 'code'))
      const m = lastChoice(g)
      expect(m?.scriptId).toBe('gamedev.job.interview')
      g.queue = []
      runScript(g, m!.scriptId!, m!.choices[0].id, m!.data, m!)
      if (gameJob(g)) hired++
    }
    expect(hired).toBeGreaterThan(3)
    const g = dev(20, 'us', 23)
    takeJob(g, listing(g, 1, 'code'))
    const job = gameJob(g)!
    expect(job.category).toBe('special')
    expect(job.defId).toBe('game_dev')
    expect(readJobData(job).proj?.title).toBeTruthy()
    const rows = ids(g, gameDevJobNodes(g))
    expect(rows).toEqual(expect.arrayContaining(['gamedev.job.status', 'gamedev.job.work', 'gamedev.job.quit', 'gamedev.job.switch']))
    expect(ids(g, specialJobNodes(g))).toContain('gamedev.job.work')
    expect(gameDevSummary(g)).toMatch(/Junior Programmer/)
  })

  it('years at a studio ship games, earn credits, and steady people get promoted', () => {
    let promoted = 0
    let credits = 0
    for (let seed = 1; seed <= 8; seed++) {
      const g = dev(seed, 'us', 23, 5_000)
      takeJob(g, listing(g, 1, 'code'))
      g.queue = []
      for (let y = 0; y < 10; y++) {
        if (!gameJob(g)) break
        careerInternals.workHard(g)
        careerInternals.workHard(g)
        g.queue = []
        ageUp(g)
        drain(g, ['normal', 'therapy'])
        finiteMoney(g)
        const j = gameJob(g)
        if (j) {
          expect(Number.isFinite(j.salary) && j.salary > 0).toBe(true)
          expect(j.performance).toBeGreaterThanOrEqual(0)
        }
      }
      const j = gameJob(g)
      if (j && j.level >= 2) promoted++
      credits += gdView(g).games.filter((x) => !x.own).length
      for (const x of gdView(g).games) finiteCredit(x)
      expect(g.character.careerHistory.length + (gameJob(g) ? 1 : 0)).toBeGreaterThan(0)
    }
    expect(promoted).toBeGreaterThan(2)
    expect(credits).toBeGreaterThan(8)
  })

  it('crunch, burnout and quitting resolve cleanly', () => {
    const g = dev(30, 'us', 25)
    takeJob(g, listing(g, 2, 'code', 'aaa'))
    g.queue = []
    for (const choice of ['crunch', 'normal', 'organize', 'quit']) {
      const h = structuredClone(g)
      runScript(h, 'gamedev.job.crunch', choice, undefined, { kind: 'choice', id: 'x', title: '', text: '', choices: [] } as never)
      drain(h)
      finiteMoney(h)
      expect(gdView(h).burnout).toBeGreaterThanOrEqual(0)
      if (choice === 'quit') expect(gameJob(h)).toBeNull()
    }
    gdMut(g).burnout = 90
    for (const choice of ['therapy', 'push', 'leave']) {
      const h = structuredClone(g)
      runScript(h, 'gamedev.job.burnout', choice, undefined, { kind: 'choice', id: 'x', title: '', text: '', choices: [] } as never)
      finiteMoney(h)
      if (choice === 'leave') expect(gameJob(h)).toBeNull()
    }
    careerInternals.retireJob(g)
    expect(gameJob(g)).toBeNull()
  })
})

describe('making games', () => {
  it('a small game from concept to release, in the US, Japan, Poland and Brazil', () => {
    for (const cid of ['us', 'jp', 'pl', 'br']) {
      for (let seed = 1; seed <= 3; seed++) {
        const g = dev(seed, cid, 24)
        const before = g.character.money
        const credit = shipSmallGame(g)
        expect(credit, `${cid} ${seed} shipped`).not.toBeNull()
        finiteCredit(credit!)
        expect(credit!.own).toBe(true)
        expect(credit!.critic).toBeGreaterThan(0)
        expect(credit!.price).toBeGreaterThan(0)
        finiteMoney(g)
        expect(g.character.money).toBeGreaterThanOrEqual(before - 1)
        // The long tail pays over the years, then fades.
        let paid = 0
        for (let y = 0; y < 12; y++) {
          nextYear(g)
          const r = yearlyMakeGames(g)
          expect(Number.isFinite(r.paid) && r.paid >= 0).toBe(true)
          paid += r.paid
        }
        const x = gdView(g).games.find((y) => y.id === credit!.id)!
        finiteCredit(x)
        expect(x.tail).toBeLessThan(credit!.tail + 1)
        expect(x.earned).toBeGreaterThanOrEqual(paid - 1)
        finiteMoney(g)
        // It's on the CV and in the portfolio.
        expect(cvEntries(g).some((e) => e.id.startsWith('d:dev:gd:credit'))).toBe(true)
        expect(gamePortfolio(g).shipped).toBe(1)
        expect(codingPortfolio(g)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('an indie game with freelancers, a publisher, early access, DLC and a sequel', () => {
    const g = dev(11, 'pl', 26, 120_000)
    startGame(g)
    drain(g, ['indie', 'pc', 'cobalt'])
    const pr0 = gdView(g).projects[0]
    expect(pr0.scope).toBe('indie')
    makeInternals.contractor(g, pr0.id, 1)
    makeInternals.contractor(g, pr0.id, 1)
    g.queue = []
    let signed = false
    for (let y = 0; y < 8; y++) {
      const pr = gdView(g).projects[0]
      if (!pr) break
      for (let i = 0; i < 3; i++) workOnGame(g, pr.id)
      g.queue = []
      const cur = gdView(g).projects[0]
      if (cur && !signed && cur.progress >= 20 && cur.quality >= 40) {
        const offers = publisherOffers(g, cur, gdView(g))
        for (const o of offers) {
          expect(Number.isFinite(o.advance) && o.advance > 0).toBe(true)
          expect(o.devShare).toBeGreaterThan(0)
        }
        makeInternals.pitchPublishers(g, cur.id)
        drain(g, ['o0'])
        signed = !!gdView(g).projects[0]?.publisher
      }
      const cur2 = gdView(g).projects[0]
      if (cur2 && !cur2.earlyAccess && cur2.progress >= 50 && cur2.progress < 100) {
        makeInternals.earlyAccess(g, cur2.id)
        g.queue = []
      }
      if (gdView(g).projects[0] && gdView(g).projects[0].progress >= 100) break
      nextYear(g)
      yearlyMakeGames(g)
      finiteMoney(g)
    }
    const pr = gdView(g).projects[0]
    expect(pr).toBeDefined()
    expect(pr.progress).toBeGreaterThanOrEqual(75)
    const credit = releaseGame(g, pr.id)
    g.queue = []
    expect(credit).not.toBeNull()
    finiteCredit(credit!)
    finiteMoney(g)
    nextYear(g)
    yearlyMakeGames(g)
    // DLC, a sale and a patch, each once a year.
    makeInternals.releaseDlc(g, credit!.id)
    makeInternals.runSale(g, credit!.id)
    const m = g.character.money
    makeInternals.runSale(g, credit!.id)
    expect(g.character.money).toBe(m)
    g.queue = []
    const after = gdView(g).games.find((x) => x.id === credit!.id)!
    finiteCredit(after)
    // A sequel keeps the franchise.
    if (after.critic >= 50) {
      nextYear(g)
      const node = findNode(g, gameIndustryMenu.children(g), `gamedev.game.${after.id}.sequel`)
      expect(node?.type).toBe('action')
      if (node?.type === 'action') node.run(g)
      drain(g, ['small', 'pc', 'cobalt'])
      const seq = gdView(g).projects[0]
      expect(seq?.sequelOf).toBe(after.id)
      expect(seq?.franchise).toBeTruthy()
    }
  })

  it('game jams are free, train skills, and go on the record', () => {
    const g = dev(12, 'br', 14, 0)
    const design = gdView(g).design
    gameJam(g)
    gameJam(g)
    gameJam(g)
    g.queue = []
    expect(gdView(g).jams).toBe(2)
    expect(gdView(g).design).toBeGreaterThan(design)
    expect(g.character.money).toBe(0)
    for (const x of gdView(g).games) finiteCredit(x)
  })

  it('crowdfunding and early sales work for teens with a parent account rules (18+ for crowdfunding)', () => {
    const g = dev(13, 'us', 15, 500)
    startGame(g)
    drain(g, ['small', 'pc', 'cobalt'])
    const pr = gdView(g).projects[0]
    workOnGame(g, pr.id)
    g.queue = []
    makeInternals.crowdfund(g, pr.id)
    expect(gdView(g).projects[0].raised).toBe(0)
    expect(g.queue.some((m) => m.kind === 'notice' && /18/.test((m as { text: string }).text))).toBe(true)
  })
})

describe('no money loops', () => {
  it("a publisher advance or crowdfunding can't be pocketed by shelving the game", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = dev(seed, 'us', 28, 50_000)
      startGame(g)
      drain(g, ['indie', 'pc', 'cobalt'])
      const id = gdView(g).projects[0].id
      const p = gdMut(g)
      p.projects[0].progress = 40
      p.projects[0].quality = 70
      p.projects[0].hype = 60
      makeInternals.crowdfund(g, id)
      drain(g, ['small'])
      makeInternals.pitchPublishers(g, id)
      drain(g, ['o0'])
      const money = g.character.money
      makeInternals.shelve(g, id)
      g.queue = []
      expect(g.character.money).toBe(money)
      expect(gdView(g).projects).toHaveLength(0)
    }
  })

  it('a publisher earns back its advance before royalties flow', () => {
    const credit = normalizeProfile({ games: [{ title: 'Signed', own: true, publisher: 'Lantern Bay Publishing', recoup: 100_000, devShare: 0.5, engine: 'homebrew', critic: 70 }] }).games[0]
    expect(settleReceipts(credit, 60_000)).toBe(0)
    expect(credit.recoup).toBe(40_000)
    expect(settleReceipts(credit, 60_000)).toBe(10_000)
    expect(credit.recoup).toBe(0)
  })

  it('shipping a game every year pays like a modest job on average, not a money printer', () => {
    const totals: number[] = []
    for (let seed = 1; seed <= 8; seed++) {
      const g = dev(seed * 7, 'us', 25, 10_000)
      let total = 0
      for (let y = 0; y < 10; y++) {
        if (!gdView(g).projects.length) {
          startGame(g)
          drain(g, ['small', 'pc', 'cobalt'])
        }
        const pr = gdView(g).projects[0]
        for (let i = 0; i < 3 && pr; i++) workOnGame(g, pr.id)
        g.queue = []
        const m0 = g.character.money
        const cur = gdView(g).projects[0]
        if (cur && cur.progress >= 100) releaseGame(g, cur.id)
        g.queue = []
        total += Math.max(0, g.character.money - m0)
        nextYear(g)
        total += yearlyMakeGames(g).paid
      }
      totals.push(total)
    }
    totals.sort((a, b) => a - b)
    expect(totals[4]).toBeGreaterThan(0)
    expect(totals[4]).toBeLessThan(1_500_000)
  })

  it("a studio can't pocket a publisher advance or an exclusivity fee by cancelling the game", () => {
    const g = dev(22, 'us', 30, 3_000_000)
    g.character.stats.smarts = 70
    const a = foundStudio(g)
    bizOf(g, a).cash = 5_000_000
    studioInternals.hireDevs(g, a, bizOf(g, a), 40)
    g.queue = []
    expect(bizOf(g, a).employees).toBeGreaterThanOrEqual(20)
    startGreenlight(g, a.id)
    drain(g, ['aa', 'console', 'titan'])
    const st = studioOf(a)
    const x = devGames(st)[0]
    expect(x.scope).toBe('aa')
    x.progress = 40
    x.quality = 70
    a.details.studio = JSON.parse(JSON.stringify(st))
    const cash0 = bizOf(g, a).cash
    runScript(g, 'gamestudio.publisher', 'sign', { assetId: a.id, gameId: x.id, advance: 4_000_000, devShare: 0.5, publisher: 'Northstar Arcade' }, { kind: 'choice', id: 'x', title: '', text: '', choices: [] } as never)
    runScript(g, 'gamestudio.event', 'accept', { assetId: a.id, ev: 'exclusive', gameId: x.id, amount: 1_500_000, who: 'Orbis Interactive' }, { kind: 'choice', id: 'x', title: '', text: '', choices: [] } as never)
    g.queue = []
    const signed = studioOf(a).games.find((y) => y.id === x.id)!
    expect(signed.advanceGot).toBe(1_000_000)
    expect(bizOf(g, a).cash).toBe(cash0 + 1_000_000 + 1_500_000)
    const cancel = findNode(g, gameIndustryMenu.children(g), `studio.cancel.${x.id}.${a.id}`)
    expect(cancel?.type).toBe('action')
    if (cancel?.type === 'action') cancel.run(g)
    g.queue = []
    expect(devGames(studioOf(a))).toHaveLength(0)
    expect(bizOf(g, a).cash).toBe(cash0)
  })

  it('hiring and laying off studio developers only ever costs money', () => {
    const g = dev(21, 'us', 30, 3_000_000)
    g.character.stats.smarts = 70
    const a = foundStudio(g)
    const b = bizOf(g, a)
    b.cash = 500_000
    const cash = b.cash
    for (let i = 0; i < 3; i++) {
      studioInternals.hireDevs(g, a, bizOf(g, a), 10)
      studioInternals.layOff(g, a, bizOf(g, a), studioOf(a), 10)
      g.yearActions = {}
    }
    g.queue = []
    expect(bizOf(g, a).cash).toBeLessThan(cash)
  })
})

describe('owned game studios', () => {
  it('founding → greenlight → releases → valuation, in several countries', () => {
    for (const cid of ['us', 'jp', 'pl', 'br']) {
      const g = dev(31, cid, 30, 3_000_000)
      g.character.stats.smarts = 70
      const a = foundStudio(g)
      const b0 = readBiz(g, a)
      expect(b0.industry).toBe('gameStudio')
      expect(gameIndustryMenu.children(g).some((n) => n.id === `gamedev.studio.${a.id}`)).toBe(true)
      studioInternals.hireDevs(g, a, bizOf(g, a), 4)
      g.queue = []
      startGreenlight(g, a.id)
      drain(g, ['indie', 'pc', 'cobalt'])
      expect(devGames(studioOf(a)).length).toBe(1)
      for (let y = 0; y < 6; y++) {
        ageUp(g)
        drain(g, ['auto', 'cover', 'loan', 'decline', 'thank', 'embrace', 'patch'])
        finiteMoney(g)
        const cur = g.assets.find((x) => x.id === a.id)
        if (!cur) break
        const b = readBiz(g, cur)
        expect(Number.isFinite(b.valuation) && b.valuation >= 0).toBe(true)
        expect(Number.isFinite(b.cash)).toBe(true)
        if (b.last) for (const v of Object.values(b.last)) expect(Number.isFinite(v)).toBe(true)
      }
      const cur = g.assets.find((x) => x.id === a.id)
      const st = cur ? studioOf(cur) : normalizeStudio(undefined)
      if (cur) {
        expect(st.games.some((x) => x.stage === 'live' && x.critic > 0)).toBe(true)
        for (const x of st.games) for (const v of Object.values(x)) if (typeof v === 'number') expect(Number.isFinite(v) && v >= 0).toBe(true)
      }
      // The owner is credited.
      expect(gdView(g).games.some((x) => /Founder|Producer/.test(x.role))).toBe(true)
      expect(gameDevSummary(g)).toBeTruthy()
    }
  })

  it('a studio can be sold, or go public once it earns enough', () => {
    const g = dev(41, 'us', 35, 3_000_000)
    g.character.stats.smarts = 70
    const a = foundStudio(g)
    const b = bizOf(g, a)
    // A hit studio's numbers.
    b.history = [{ year: g.year - 1, revenue: 120_000_000, profit: 40_000_000, tax: 8_000_000, units: 2_000_000, price: 30, staff: 80, valuation: 0, outlets: 1 }]
    b.valuation = valuationOf(b)
    expect(canIpo(b)).toBeNull()
    goPublic(g, a, b)
    expect(bizOf(g, a).public).toBe(true)
    expect(Number.isFinite(a.value) && a.value > 0).toBe(true)
    // Another studio sold outright.
    const h = dev(42, 'us', 35, 3_000_000)
    const s = foundStudio(h)
    const money = h.character.money
    const sb = bizOf(h, s)
    sellBusiness(h, s, sb, 2_000_000, 'Colossus Interactive')
    expect(studioAssets(h)).toHaveLength(0)
    expect(h.character.money).toBeGreaterThan(money)
  })

  it('acquisition offers can make you Studio Head under the new owner', () => {
    const g = dev(43, 'us', 35, 3_000_000)
    const a = foundStudio(g)
    const b = bizOf(g, a)
    b.valuation = 5_000_000
    g.queue = []
    runScript(g, 'gamestudio.event', 'stay', { assetId: a.id, ev: 'bid', amount: 7_000_000, who: 'Omnivault Games' }, { kind: 'choice', id: 'x', title: '', text: '', choices: [] } as never)
    expect(studioAssets(g)).toHaveLength(0)
    const job = gameJob(g)
    expect(job?.title).toBe('Studio Head')
    expect(job?.company).toBe(a.name)
    finiteMoney(g)
  })

  it('old saves: a game studio from the generic business model gets a back catalog', () => {
    const g = dev(44, 'pl', 40, 100_000)
    const b = newBiz(g, 'gameStudio', 'pl', 'Warsaw', { founded: g.year - 5 })
    b.history = [{ year: g.year - 1, revenue: 900_000, profit: 50_000, tax: 9_000, units: 40_000, price: 25, staff: 18, valuation: 0, outlets: 1 }]
    delete (b as { studio?: unknown }).studio
    const a: Asset = { id: 'oldstudio', kind: 'business', name: 'Old Pixel Works', emoji: '\u{1F3AE}', purchasePrice: 0, value: 0, condition: 100, purchasedAge: 30, upkeep: 0, details: b as never }
    g.assets.push(a)
    const res = simulateStudioYear(g, a, bizOf(g, a), g.year - 1, 0)
    expect(Number.isFinite(res.stmt.revenue) && res.stmt.revenue > 0).toBe(true)
    expect(studioOf(a).games.length).toBe(1)
    expect(studioValue(a.details.studio)).toBeGreaterThan(0)
    // The yearly loop runs it without the price/production report.
    ageUp(g)
    drain(g)
    expect(g.assets.find((x) => x.id === a.id)).toBeDefined()
  })
})

describe("the home computer's game projects and ventures", () => {
  const IDEA = { text: 'A roguelike where you are a pigeon', key: 'Coo', mult: 1 }

  it('old indie game ventures keep working and show up in Game Industry, not the computer', () => {
    const g = dev(51, 'us', 16, 2_000)
    const a = createVenture(g, 'game', 'Coo Quest', IDEA, { live: true, quality: 72, users: 8_000 })
    const saas = createVenture(g, 'saas', 'HonkHub', { text: 'Invoicing for clowns', key: 'Honk', mult: 1 }, { live: true, quality: 60, users: 50 })
    expect(ventureAssets(g).map((x) => x.id)).toEqual([saas.id])
    expect(allVentureAssets(g).map((x) => x.id)).toEqual(expect.arrayContaining([a.id, saas.id]))
    expect(devNodes(g).map((n) => n.id)).not.toContain(`computer.dev.venture.${a.id}`)
    expect(devNodes(g).map((n) => n.id)).toContain(`computer.dev.venture.${saas.id}`)
    expect(gameIndustryMenu.children(g).map((n) => n.id)).toContain(`gamedev.venture.${a.id}`)
    // The venture is still simulated every year (once).
    const users = readVenture(g, a).users
    yearlyDev(g)
    drain(g)
    expect(readVenture(g, a).users).toBeGreaterThanOrEqual(users)
    expect(devSummary(g)).not.toMatch(/Coo Quest/)
    expect(gameDevSummary(g)).toMatch(/Coo Quest/)
    expect(cvEntries(g).some((e) => e.org === 'Coo Quest')).toBe(true)
  })

  it('old hobby games are listed and count toward the portfolio', () => {
    const g = dev(52, 'us', 20)
    const s = devState(g)
    s.projects.push({ id: 'old1', kind: 'game', name: 'Snail Odyssey', q: 78, age: 15, users: 30_000, income: 0, earned: 1_200, lang: 'csharp' })
    saveDev(g, s)
    const games = findNode(g, gameIndustryMenu.children(g), 'gamedev.games')
    const rows = games?.type === 'menu' ? games.children(g) : []
    expect(rows.some((n) => n.type === 'info' && typeof n.text === 'string' && n.text.includes('Snail Odyssey'))).toBe(true)
    expect(requirementProblem(g, 2, 'code')).toBeNull()
  })

  it('at 18 a teenager is offered to grow the venture into a real studio', () => {
    const g = dev(53, 'us', 17, 20_000)
    const a = createVenture(g, 'game', 'Coo Quest', IDEA, { live: true, quality: 75, users: 60_000, invested: 3_000 })
    yearlyGameDev(g)
    expect(g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'gamestudio.grow')).toBe(false)
    g.queue = []
    g.character.age = 18
    yearlyGameDev(g)
    const m = lastChoice(g)
    expect(m?.scriptId).toBe('gamestudio.grow')
    g.queue = []
    runScript(g, m!.scriptId!, 'manager', m!.data, m!)
    g.queue = []
    expect(g.assets.find((x) => x.id === a.id)).toBeUndefined()
    const studio = studioAssets(g)[0]
    expect(studio?.name).toBe('Coo Quest')
    const st = studioOf(studio)
    expect(st.games[0].title).toBe('Coo Quest')
    expect(st.games[0].stage).toBe('live')
    expect(readBiz(g, studio).manager).not.toBeNull()
    // Asked only once.
    yearlyGameDev(g)
    expect(g.queue.some((m2) => m2.kind === 'choice' && m2.scriptId === 'gamestudio.grow')).toBe(false)
    finiteMoney(g)
  })

  it('growing a venture needs to be 18 and a launched game', () => {
    const g = dev(54, 'us', 16, 20_000)
    const a = createVenture(g, 'game', 'Coo Quest', IDEA, { live: true, quality: 75, users: 6_000 })
    expect(growVentureIntoStudio(g, a, 'me')).toBeNull()
    g.character.age = 18
    const b = createVenture(g, 'game', 'Unfinished', IDEA, { quality: 50 })
    expect(growVentureIntoStudio(g, b, 'me')).toBeNull()
    expect(growVentureIntoStudio(g, a, 'me')).not.toBeNull()
    expect(g.character.job?.defId).toBe('business_owner')
  })
})

describe('prison and death', () => {
  it('prison ends a studio job and blocks game making; royalties keep coming', () => {
    const g = dev(61, 'us', 26, 10_000)
    const credit = shipSmallGame(g)
    expect(credit).not.toBeNull()
    takeJob(g, listing(g, 1, 'code'))
    g.queue = []
    expect(gameJob(g)).not.toBeNull()
    sendToPrison(g, 'Fraud', 3)
    g.queue = []
    expect(gameJob(g)).toBeNull()
    expect(gameIndustryMenu.visible?.(g)).toBe(false)
    startGame(g)
    expect(gdView(g).projects).toHaveLength(0)
    workOnGame(g, 'nope')
    gameJam(g)
    expect(gdView(g).jams).toBe(0)
    nextYear(g)
    const r = yearlyMakeGames(g)
    expect(r.paid).toBeGreaterThanOrEqual(0)
    finiteMoney(g)
    expect(() => gameDevSummary(g)).not.toThrow()
  })

  it('the dead make no games', () => {
    const g = dev(62, 'us', 30, 10_000)
    takeJob(g, listing(g, 1, 'code'))
    g.queue = []
    killCharacter(g, 'Old Age')
    g.queue = []
    expect(gameJob(g)).toBeNull()
    const money = g.character.money
    yearlyGameDev(g)
    expect(g.character.money).toBe(money)
    takeJob(g, listing(g, 1, 'code'))
    expect(gameJob(g)).toBeNull()
    expect(gameIndustryMenu.visible?.(g)).toBe(false)
  })

  it('hand-edited and partial saves never break the readers', () => {
    const g = dev(63, 'us', 30)
    g.flags['special.gamedev'] = { owner: 'someone-else', games: 'nope' }
    expect(() => gameIndustryMenu.children(g)).not.toThrow()
    expect(gdView(g).games).toEqual([])
    const p = normalizeProfile({ games: [{ title: 'X', critic: 'high', copies: -5, price: NaN as unknown as number }, null, 4], projects: [{ title: 'Y', progress: 900 }] } as never)
    expect(p.games).toHaveLength(1)
    finiteCredit(p.games[0])
    expect(p.projects[0].progress).toBe(100)
    expect(netPerCopy(-1)).toBe(0)
    const st = normalizeStudio({ games: [{ title: 'Z', stage: 'weird', team: -3 }], policy: 'chaos' } as never)
    expect(st.policy).toBe('normal')
    expect(st.games[0].stage).toBe('dev')
    expect(st.games[0].team).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Monkey tests: random actions from every Game Industry and studio menu for years.

function collect(g: GameState, nodes: MenuNode[], depth = 0, out: import('../src/game/types').MenuAction[] = []): import('../src/game/types').MenuAction[] {
  if (depth > 6) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if (n.visible && !n.visible(g)) continue
    if (n.disabledReason && n.disabledReason(g)) continue
    if (n.type === 'action') out.push(n)
    else collect(g, n.children(g), depth + 1, out)
  }
  return out
}

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function monkeyDrain(g: GameState, r: () => number): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 400) throw new Error('queue never drains')
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices[Math.floor(r() * m.choices.length)]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.input === 'number' ? String(Math.max(m.min ?? 1, Math.round((m.max ?? 10) * r()))) : m.defaultValue || 'Monkey Game', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

/** After an action money never drops below zero from >= 0; yearly living costs may leave debt (finance's job). */
function invariants(g: GameState, moneyBefore = 0): void {
  expect(Number.isFinite(g.character.money)).toBe(true)
  if (moneyBefore >= 0) expect(g.character.money).toBeGreaterThanOrEqual(0)
  for (const x of gdView(g).games) finiteCredit(x)
  for (const pr of gdView(g).projects) for (const v of Object.values(pr)) if (typeof v === 'number') expect(Number.isFinite(v) && v >= 0).toBe(true)
  for (const a of g.assets) {
    expect(Number.isFinite(a.value) && a.value >= 0, `${a.name} value`).toBe(true)
    if (a.kind === 'business' && a.details.industry === 'gameStudio') {
      const b = readBiz(g, a)
      expect(Number.isFinite(b.cash) && Number.isFinite(b.valuation) && b.employees >= 0).toBe(true)
      for (const x of studioOf(a).games) for (const v of Object.values(x)) if (typeof v === 'number') expect(Number.isFinite(v) && v >= 0, `${x.title}`).toBe(true)
    }
  }
}

describe('monkey tests', () => {
  it('random Game Industry play for 25 years never breaks numbers', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = dev(seed, ['us', 'jp', 'pl', 'br', 'ng', 'de'][seed - 1], 12, 2_000)
      const r = lcg(seed * 97)
      for (let y = 0; y < 25 && g.character.alive; y++) {
        if (g.character.age === 22) g.character.money += 500_000
        for (let i = 0; i < 10; i++) {
          const actions = collect(g, gameIndustryMenu.children(g))
          if (!actions.length) break
          const action = actions[Math.floor(r() * actions.length)]
          const input = action.input ? (action.input.kind === 'number' ? String(Math.max(action.input.min ?? 1, Math.round(((action.input.max ?? 10) as number) * r()))) : 'Monkey') : undefined
          const before = g.character.money
          action.run(g, input)
          monkeyDrain(g, r)
          invariants(g, before)
        }
        ageUp(g)
        monkeyDrain(g, r)
        invariants(g, -1)
      }
    }
  })

  it('random studio management for 12 years never breaks numbers', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const g = dev(seed + 10, ['us', 'jp', 'pl', 'br', 'kr', 'gb'][seed - 1], 30, 4_000_000)
      g.character.stats.smarts = 70
      const a = foundStudio(g)
      const r = lcg(seed * 131)
      startGreenlight(g, a.id)
      drain(g, ['indie', 'pc', 'cobalt'])
      for (let y = 0; y < 12 && g.character.alive; y++) {
        for (let i = 0; i < 8; i++) {
          const cur = g.assets.find((x) => x.id === a.id)
          if (!cur) break
          const actions = collect(g, gameIndustryMenu.children(g)).filter((x) => x.id.startsWith('studio.') || x.id.startsWith('biz.') || x.id.startsWith('gamedev.'))
          if (!actions.length) break
          const action = actions[Math.floor(r() * actions.length)]
          const input = action.input ? (action.input.kind === 'number' ? String(Math.max(action.input.min ?? 1, Math.round(((action.input.max ?? 10) as number) * r() * 0.3))) : 'Monkey') : undefined
          const before = g.character.money
          action.run(g, input)
          monkeyDrain(g, r)
          invariants(g, before)
        }
        ageUp(g)
        monkeyDrain(g, r)
        invariants(g, -1)
      }
    }
  })
})
