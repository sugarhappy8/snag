// Regression tests for the Game Industry review: money loops in solo game making (crunch
// spam, release spam, fame-scaled crowdfunding), studio advances paid out as dividends, the
// convention referral, popups for a job you just lost, and smaller ladder/menu bugs.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { startFounding } from '../src/game/business/founding'
import { earmarkedCash, simulateStudioYear, startGreenlight, studioAssets, studioInternals, studioOf } from '../src/game/business/gamestudio'
import { devGames } from '../src/game/business/gamestudio-state'
import { businessView } from '../src/game/business/manage'
import { bizOf } from '../src/game/business/state'
import { gameCvEntries } from '../src/game/computer/dev-cv'
import { addCodingSkill, addLanguageXp } from '../src/game/computer/skills'
import { runScript } from '../src/game/scripts'
import { attendConvention, careerInternals, salaryFor, takeJob, yearlyGameJob, type Listing } from '../src/game/special/gamedev-career'
import { backerCap, expectedCopies, hotGenres } from '../src/game/special/gamedev-core'
import { freelancerProgress, makeInternals, releaseFatigue, releaseGame, sessionRate, startGame, workOnGame, yearlyMakeGames } from '../src/game/special/gamedev-make'
import { gameJob, gdMut, gdView, normalizeProfile, readJobData, writeJobData } from '../src/game/special/gamedev-state'
import type { Asset, ChoiceModal, GameState, MenuAction, MenuNode } from '../src/game/types'
import { getCountry } from '../src/game/world'
import '../src/game/menus'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

function dev(seed: number, countryId = 'us', age = 25, money = 30_000, skill = 60): GameState {
  const g = makeTestGame(seed, { age, countryId, money })
  g.lifeId = `gd-review-${countryId}-${seed}`
  g.character.city = getCountry(countryId).cities[0]
  g.character.stats.health = 100
  const laptop: Asset = { id: `laptop${g.nextId++}`, kind: 'other', name: 'Laptop', emoji: '\u{1F4BB}', purchasePrice: 1300, value: 900, condition: 100, purchasedAge: age, upkeep: 0, details: { category: 'electronics' } }
  g.assets.push(laptop)
  addCodingSkill(g, skill)
  addLanguageXp(g, 'csharp', skill)
  g.flags.lastCodedAge = age
  const p = gdMut(g)
  p.design = skill
  p.art = Math.max(0, skill - 10)
  return g
}

function drain(g: GameState, prefer: string[] = []): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 400) throw new Error('queue never drains')
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => prefer.includes(c.id)) ?? m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || 'Test Game', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function nextYear(g: GameState): void {
  g.year++
  g.character.age++
  g.yearActions = {}
  g.flags.taxableIncome = 0
}

function newProject(g: GameState, scope: 'small' | 'indie' = 'small'): string {
  startGame(g)
  drain(g, [scope, 'pc', 'cobalt'])
  const p = gdView(g).projects
  return p[p.length - 1].id
}

function listing(g: GameState, level: number, track: Listing['track'], studio = 'Paper Kite Games'): Listing {
  return { id: `${g.year}:t`, studio, tier: 'mid', hq: g.character.countryId, city: g.character.city, level, track, title: level === 0 ? 'QA Tester' : 'Junior Programmer', salary: salaryFor(g, level, 'mid'), craft: 70 }
}

function find(g: GameState, nodes: MenuNode[], pred: (n: MenuNode) => boolean, depth = 0): MenuNode | undefined {
  if (depth > 6) return undefined
  for (const n of nodes) {
    if (pred(n)) return n
    if (n.type === 'menu' && (!n.disabledReason || !n.disabledReason(g))) {
      const hit = find(g, n.children(g), pred, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function foundStudio(g: GameState): Asset {
  startFounding(g, 'gameStudio')
  drain(g, ['city0', 'savings', 'me'])
  const a = studioAssets(g)[0]
  if (!a) throw new Error('studio not founded')
  return a
}

// ---------------------------------------------------------------------------

describe('solo game making: no release or crunch spam', () => {
  it('crunch is once a year in total: starting a fresh project does not reset it', () => {
    const g = dev(1, 'us', 25, 30_000, 90)
    const a = newProject(g)
    workOnGame(g, a, true)
    g.queue = []
    const b = newProject(g)
    const before = gdView(g).projects.find((x) => x.id === b)!.progress
    workOnGame(g, b, true)
    expect(g.queue.some((m) => m.kind === 'notice' && /already crunched/.test((m as { text: string }).text))).toBe(true)
    expect(gdView(g).projects.find((x) => x.id === b)!.progress).toBe(before)
  })

  it('a small game is about a year of sessions; an indie game takes years even with freelancers', () => {
    const g = dev(2, 'us', 25, 200_000, 60)
    const small = newProject(g, 'small')
    const pr = gdView(g).projects.find((x) => x.id === small)!
    // Three sessions a year: a decent coder needs most of a year for a small game.
    expect(sessionRate(g, pr)).toBeLessThan(45)
    expect(sessionRate(g, pr) * 3).toBeGreaterThan(80)
    makeInternals.shelve(g, small)
    g.queue = []
    const indie = newProject(g, 'indie')
    for (let i = 0; i < 3; i++) makeInternals.contractor(g, indie, 1)
    g.queue = []
    let years = 0
    for (; years < 10; years++) {
      const cur = gdView(g).projects.find((x) => x.id === indie)
      if (!cur || cur.progress >= 100) break
      workOnGame(g, indie, true)
      for (let i = 0; i < 3; i++) workOnGame(g, indie)
      g.queue = []
      nextYear(g)
      g.character.money = 200_000
      yearlyMakeGames(g)
      g.queue = []
    }
    expect(years).toBeGreaterThanOrEqual(2)
    // Each freelancer adds a few points a year to an indie game, not a third of it.
    expect(freelancerProgress({ ...gdView(g).projects[0], contractors: 3, scope: 'indie' })).toBeLessThan(10)
  })

  it('back-to-back releases in one year split the audience', () => {
    const p = normalizeProfile({ games: [{ title: 'First', own: true, year: 2030, critic: 80 }] })
    expect(releaseFatigue(p, 2030)).toBeLessThan(1)
    expect(releaseFatigue(p, 2031)).toBe(1)
    p.games.push({ ...p.games[0], id: 'x2', title: 'Second' })
    expect(releaseFatigue(p, 2030)).toBeLessThan(releaseFatigue(normalizeProfile({ games: [{ title: 'First', own: true, year: 2030 }] }), 2030))
    // Free jam games don't count.
    expect(releaseFatigue(normalizeProfile({ games: [{ title: 'Jam', own: true, free: true, year: 2030 }] }), 2030)).toBe(1)
  })

  it("freelancers are paid a year up front: hiring and firing them before the bill isn't free help", () => {
    const g = dev(3, 'us', 25, 100_000, 60)
    const id = newProject(g, 'indie')
    const m0 = g.character.money
    for (let i = 0; i < 3; i++) makeInternals.contractor(g, id, 1)
    g.queue = []
    const fee = m0 - g.character.money
    expect(fee).toBeGreaterThan(0)
    // Letting them go refunds nothing; filling the paid seats again the same year costs nothing.
    for (let i = 0; i < 3; i++) makeInternals.contractor(g, id, -1)
    expect(g.character.money).toBe(m0 - fee)
    for (let i = 0; i < 3; i++) makeInternals.contractor(g, id, 1)
    g.queue = []
    expect(g.character.money).toBe(m0 - fee)
    expect(gdView(g).projects[0].contractors).toBe(3)
    // Next year's contracts renew (paid up front) only for those you keep.
    for (let i = 0; i < 3; i++) makeInternals.contractor(g, id, -1)
    g.queue = []
    const before = gdView(g).projects[0].progress
    nextYear(g)
    yearlyMakeGames(g)
    expect(gdView(g).projects[0].progress).toBe(before)
    expect(g.character.money).toBe(m0 - fee)
    makeInternals.contractor(g, id, 1)
    g.queue = []
    expect(g.character.money).toBeLessThan(m0 - fee)
  })

  it("freelancers you can't renew leave after the year they were paid for", () => {
    const g = dev(4, 'us', 25, 0, 60)
    const id = newProject(g, 'indie')
    const p = gdMut(g)
    const pr = p.projects.find((x) => x.id === id)!
    pr.contractors = 2
    pr.contractorsPaid = 2
    pr.budget = 10_000
    const before = pr.progress
    nextYear(g)
    yearlyMakeGames(g)
    const after = gdView(g).projects.find((x) => x.id === id)!
    expect(after.progress).toBeGreaterThan(before)
    expect(after.contractors).toBe(0)
    expect(after.budget).toBe(10_000)
    expect(g.character.money).toBe(0)
  })

  it('a famous developer cannot crowdfund far beyond what the game could ever sell', () => {
    let ratioMax = 0
    for (let seed = 1; seed <= 6; seed++) {
      const g = dev(seed + 10, 'us', 30, 10_000, 90)
      const p = gdMut(g)
      p.gamerFame = 100
      const id = newProject(g, 'small')
      const pr = gdMut(g).projects.find((x) => x.id === id)!
      pr.progress = 30
      pr.quality = 85
      pr.hype = 80
      const cap = backerCap(g, { scope: 'small', genre: pr.genre, platform: pr.platform, quality: 90, hype: 80, fame: 100, reach: 1.05 })
      makeInternals.crowdfund(g, id)
      drain(g, ['big'])
      const after = gdView(g).projects.find((x) => x.id === id)!
      expect(Number.isFinite(after.backers) && after.backers >= 0).toBe(true)
      ratioMax = Math.max(ratioMax, after.backers / Math.max(1, cap))
      // A small $10 game: tens of thousands of dollars from fans, not most of a million.
      expect(after.raised).toBeLessThan(300_000)
    }
    expect(ratioMax).toBeLessThanOrEqual(1.2)
    expect(expectedCopies(dev(1), { scope: 'small', genre: 'cozy', platform: 'pc', quality: 80, hype: 0, fame: 0, reach: 1 })).toBeGreaterThan(0)
  })

  it('a max-effort solo developer earns well, not like a mint', () => {
    const perYear: number[] = []
    for (let seed = 1; seed <= 5; seed++) {
      const g = dev(seed * 19, 'us', 25, 100_000, 90)
      const m0 = g.character.money
      for (let y = 0; y < 10; y++) {
        while (gdView(g).projects.length < 2) newProject(g, 'indie')
        for (const pr of gdView(g).projects) {
          for (let k = 0; k < 3; k++) makeInternals.contractor(g, pr.id, 1)
          makeInternals.devlog(g, pr.id, true)
          makeInternals.crowdfund(g, pr.id)
          drain(g, ['big'])
          workOnGame(g, pr.id, true)
          g.queue = []
        }
        for (let k = 0; k < 3; k++) {
          const pr = gdView(g).projects[k % 2]
          if (pr) workOnGame(g, pr.id)
          g.queue = []
        }
        for (const pr of gdView(g).projects) {
          makeInternals.pitchPublishers(g, pr.id)
          drain(g, ['o0'])
        }
        for (const pr of gdView(g).projects) {
          if (pr.progress >= 75) releaseGame(g, pr.id)
          g.queue = []
        }
        for (const x of gdView(g).games.filter((z) => z.own && !z.free)) {
          makeInternals.runSale(g, x.id)
          makeInternals.releaseDlc(g, x.id)
          g.queue = []
        }
        nextYear(g)
        yearlyMakeGames(g)
        g.queue = []
      }
      expect(Number.isFinite(g.character.money)).toBe(true)
      perYear.push((g.character.money - m0) / 10)
    }
    perYear.sort((a, b) => a - b)
    // Before the review this strategy made $7-12M every single year in every seed.
    expect(perYear[2]).toBeLessThan(3_000_000)
  })
})

describe('menus and copy', () => {
  it('awards read cleanly on the CV', () => {
    const g = dev(140)
    const p = gdMut(g)
    p.awards.push('Midnight Pizza Jam gold medal for "Soup Dungeon" (age 12)', 'Golden Joypad for Best Narrative: "Paper Boats" (2031)')
    const titles = gameCvEntries(g)
      .filter((x) => x.kind === 'award')
      .map((x) => x.title)
    expect(titles).toEqual(['Midnight Pizza Jam gold medal', 'Golden Joypad for Best Narrative'])
  })

  it('both hot genres are always offered when picking a genre', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = dev(seed + 30)
      startGame(g)
      const scope = g.queue.find((m) => m.kind === 'choice') as ChoiceModal
      g.queue = []
      runScript(g, scope.scriptId!, 'small', scope.data, scope)
      const genre = g.queue.find((m) => m.kind === 'choice') as ChoiceModal
      const offered = genre.choices.map((c) => c.id)
      for (const h of hotGenres(g)) expect(offered).toContain(h.id)
      expect(new Set(offered).size).toBe(offered.length)
    }
  })
})

describe('studio jobs', () => {
  it('a convention recruiter gives a real referral for that studio this year', () => {
    let referred = 0
    for (let seed = 1; seed <= 30 && !referred; seed++) {
      const g = dev(seed + 40, 'us', 24, 5_000, 60)
      attendConvention(g)
      const text = g.queue.map((m) => (m as { text?: string }).text ?? '').join(' ')
      const m = /A recruiter from (.+?) liked your/.exec(text)
      if (!m) continue
      referred++
      expect(careerInternals.hasReferral(g, m[1])).toBe(true)
      expect(careerInternals.hasReferral(g, 'Some Other Studio')).toBe(false)
      nextYear(g)
      expect(careerInternals.hasReferral(g, m[1])).toBe(false)
    }
    expect(referred).toBe(1)
  })

  it('no crunch popup for a job you lost the same year', () => {
    let lost = 0
    let crunches = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = dev(seed + 60, 'us', 25)
      takeJob(g, listing(g, 1, 'code'))
      g.queue = []
      const job = gameJob(g)!
      nextYear(g)
      const d = readJobData(job)
      // A big game near the end (crunch season), after a flop scare, with a weak performer.
      d.proj = { ...d.proj!, scope: 'aaa', progress: 50 }
      d.scare = g.year
      writeJobData(job, d)
      job.performance = 0
      yearlyGameJob(g, 2)
      const crunch = g.queue.some((m) => m.kind === 'choice' && m.scriptId === 'gamedev.job.crunch')
      if (!gameJob(g)) {
        lost++
        expect(crunch).toBe(false)
      } else if (crunch) crunches++
    }
    expect(lost).toBeGreaterThan(3)
    expect(crunches).toBeGreaterThan(3)
  })

  it('a QA Lead who learns to code can move into programming', () => {
    let moved = 0
    for (let seed = 1; seed <= 10; seed++) {
      const g = dev(seed + 80, 'us', 26, 5_000, 0)
      takeJob(g, listing(g, 0, 'qa'))
      g.queue = []
      const job = gameJob(g)!
      job.level = 1
      job.title = 'QA Lead'
      addCodingSkill(g, 70)
      job.performance = 95
      job.yearsInRole = 3
      job.data.roleStartAge = g.character.age - 3
      const p = gdMut(g)
      for (let i = 0; i < 3; i++) p.games.push(normalizeProfile({ games: [{ title: `Shipped ${i}`, critic: 75, role: 'QA Lead', studio: 'X', scope: 'indie' }] }).games[0])
      const title = careerInternals.maybePromote(g, job, readJobData(job), gdMut(g))
      if (title) {
        expect(title).toBe('Programmer')
        moved++
      }
    }
    expect(moved).toBeGreaterThan(0)
  })
})

describe('owned studios', () => {
  it("advances and pledges for unreleased games can't be withdrawn as profits", () => {
    const g = dev(90, 'us', 30, 3_000_000)
    const a = foundStudio(g)
    const b = bizOf(g, a)
    b.cash = 1_000_000
    studioInternals.hireDevs(g, a, b, 20)
    g.queue = []
    startGreenlight(g, a.id)
    drain(g, ['aa', 'console', 'titan'])
    const x = devGames(studioOf(a))[0]
    runScript(g, 'gamestudio.publisher', 'sign', { assetId: a.id, gameId: x.id, advance: 4_000_000, devShare: 0.5, publisher: 'Northstar Arcade' }, { kind: 'choice', id: 'publisher', title: '', text: '', choices: [{ id: 'sign', label: 'Sign' }] } as never)
    g.queue = []
    expect(earmarkedCash(a)).toBe(1_000_000)
    const cash = bizOf(g, a).cash
    const withdraw = find(g, businessView(g, a), (n) => n.id === `biz.dividend.${a.id}`) as MenuAction
    expect(withdraw).toBeDefined()
    expect(withdraw.input?.max).toBe(Math.round(cash - 1_000_000))
    const money = g.character.money
    withdraw.run(g, String(cash))
    g.queue = []
    // Only the free cash came out; the advance stays to fund the game (or to pay it back).
    expect(bizOf(g, a).cash).toBe(1_000_000)
    expect(g.character.money).toBeGreaterThan(money)
    const again = find(g, businessView(g, a), (n) => n.id === `biz.dividend.${a.id}`) as MenuAction
    expect(again.disabledReason?.(g)).toMatch(/advances and pledges/)
  })

  it("in a small studio the founder's own skill shapes the games", () => {
    const quality = (skill: number): number => {
      let total = 0
      for (let seed = 1; seed <= 6; seed++) {
        const g = dev(100 + seed, 'pl', 30, 3_000_000, skill)
        const a = foundStudio(g)
        startGreenlight(g, a.id)
        drain(g, ['small', 'pc', 'cobalt'])
        bizOf(g, a).cash = 1_000_000
        simulateStudioYear(g, a, bizOf(g, a), g.year, 0)
        const x = studioOf(a).games[0]
        total += x.quality
      }
      return total / 6
    }
    expect(quality(95)).toBeGreaterThan(quality(20) + 10)
  })

  it('studio crowdfunding is capped by the game’s market', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const g = dev(120 + seed, 'us', 30, 3_000_000, 90)
      gdMut(g).gamerFame = 100
      const a = foundStudio(g)
      bizOf(g, a).brand = 100
      startGreenlight(g, a.id)
      drain(g, ['small', 'pc', 'cobalt'])
      const st = studioOf(a)
      st.games[0].progress = 40
      st.games[0].hype = 100
      a.details.studio = JSON.parse(JSON.stringify(st))
      const crowd = find(g, businessView(g, a), (n) => n.type === 'action' && n.id.startsWith('studio.crowd.')) as MenuAction
      expect(crowd).toBeDefined()
      crowd.run(g)
      g.queue = []
      const y = studioOf(a).games[0]
      expect(y.raised).toBeLessThan(400_000)
    }
  })

  it('old studios get a back catalog whose title matches its genre', () => {
    const g = dev(130, 'pl', 40, 100_000)
    const a = foundStudio(g)
    const b = bizOf(g, a)
    b.history = [{ year: g.year - 1, revenue: 900_000, profit: 50_000, tax: 9_000, units: 40_000, price: 25, staff: 18, valuation: 0, outlets: 1 }]
    const st = studioOf(a)
    st.games = []
    studioInternals.ensureCatalog(g, b, st)
    expect(st.games).toHaveLength(1)
    const x = st.games[0]
    expect(x.title.startsWith(`${['Platformer', 'RPG', 'Shooter', 'Strategy', 'Puzzle', 'Cozy Game', 'Horror', 'Racing', 'Sports', 'Fighting', 'Simulation', 'Roguelike', 'Story Adventure', 'Battle Royale', 'Party Game'].find((l) => x.title.startsWith(l))}`)).toBe(true)
    const labels: Record<string, string> = { platformer: 'Platformer', rpg: 'RPG', shooter: 'Shooter', strategy: 'Strategy', puzzle: 'Puzzle', cozy: 'Cozy Game', horror: 'Horror', racing: 'Racing', sports: 'Sports', fighting: 'Fighting', sim: 'Simulation', roguelike: 'Roguelike', adventure: 'Story Adventure', battleRoyale: 'Battle Royale', party: 'Party Game' }
    expect(x.title).toBe(`${labels[x.genre]} Classics Collection`)
  })
})
