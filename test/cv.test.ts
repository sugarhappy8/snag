import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyFallback, runAiTask } from '../src/ai/director'
import { screenApplicationPrompt } from '../src/ai/prompts'
import { validateScreening } from '../src/ai/schemas'
import { applyScreening, occupationMenu, yearlyCareer } from '../src/game/careers'
import {
  catchEmbellishment,
  cvEntries,
  cvInternals,
  cvMenu,
  cvScore,
  cvSummary,
  embellishedEntries,
  jobMarket,
  jobScreenChance,
  rankLabel,
  schoolCount,
  schoolRank,
  universityTarget,
} from '../src/game/cv'
import { getJobDef } from '../src/game/data/jobs'
import { admissionChance, applyToGraduateSchool, applyToUniversity, educationInternals, educationMenuNodes, universityOptions, yearlyEducation } from '../src/game/education'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { getCountry } from '../src/game/world'
import type { ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, NoticeModal, ScreeningApp } from '../src/game/types'
import { DEFAULT_SETTINGS, type Settings } from '../src/settings'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

function findNode(nodes: MenuNode[], id: string, g: GameState, depth = 0): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu' && depth < 5) {
      const hit = findNode(n.children(g), id, g, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function choices(g: GameState, scriptId: string): ChoiceModal[] {
  return g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === scriptId)
}

/** Resolve AI tasks offline and answer interviews (best answer) until the queue settles. */
function settle(g: GameState, best = true): void {
  for (let guard = 0; guard < 30; guard++) {
    const m = g.queue.find((x) => x.kind === 'aiTask' || (x.kind === 'choice' && (x.scriptId === 'school.admissionsInterview' || x.scriptId === 'career.interview')))
    if (!m) return
    g.queue = g.queue.filter((x) => x.id !== m.id)
    if (m.kind === 'aiTask') applyFallback(g, m.task)
    else if (m.kind === 'choice') {
      const scores = (m.data as { scores: number[] }).scores
      const pickIdx = best ? scores.indexOf(Math.max(...scores)) : scores.indexOf(Math.min(...scores))
      runScript(g, m.scriptId!, String(pickIdx), m.data, m)
    }
  }
}

/** A high-school senior about to apply: diploma, grades and exam score. */
function senior(countryId: string, seed: number, smarts = 70): GameState {
  const city = getCountry(countryId).cities[0]
  const g = makeTestGame(seed, { age: 18, countryId, birthCountryId: countryId, city })
  g.character.stats.smarts = smarts
  g.flags.lastGrades = smarts
  g.flags.examScore = smarts
  g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High School', age: 18 })
  g.character.education.completed.push('elementary', 'middle', 'high')
  return g
}

/** Pad a CV with clubs, leadership, volunteering, a project and an award (archived school entries). */
function strongCv(g: GameState): void {
  g.character.cv = [
    { id: 'a1', kind: 'leadership', title: 'Club President, Robotics Club', org: 'Test High School', startAge: 15, endAge: 18, detail: '3 years', strength: 7, embellished: false, tags: ['tech'], source: 'school' },
    { id: 'a2', kind: 'activity', title: 'Debate Team', org: 'Test High School', startAge: 14, endAge: 18, detail: '4 years', strength: 5, embellished: false, tags: ['law'], source: 'school' },
    { id: 'a3', kind: 'volunteering', title: 'Volunteer, Food Bank', org: 'City Food Bank', startAge: 15, endAge: 18, detail: '3 years', strength: 5, embellished: false, tags: ['service'], source: 'volunteer:foodbank' },
    { id: 'a4', kind: 'project', title: 'Built "PlantPal", a plant-watering app', org: 'Personal project', startAge: 17, endAge: 17, detail: '9,000 downloads', strength: 7, embellished: false, tags: ['tech'], source: 'built' },
    { id: 'a5', kind: 'award', title: '1st Place, Math Olympiad', org: 'National Mathematical Olympiad', startAge: 17, endAge: 17, detail: 'Podium finish', strength: 7, embellished: false, tags: ['science'], source: 'built' },
  ]
}

function graduateAdult(countryId: string, seed: number, major = 'Computer Science'): GameState {
  const city = getCountry(countryId).cities[0]
  const g = makeTestGame(seed, { age: 23, countryId, birthCountryId: countryId, city, money: 5000 })
  g.character.stats.smarts = 75
  g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High School', age: 18 })
  g.character.education.degrees.push({ kind: 'bachelor', name: `Bachelor's in ${major}`, major, school: 'Test University', age: 22 })
  g.character.education.completed.push('elementary', 'middle', 'high', 'university')
  return g
}

function qualifiedListing(g: GameState): MenuAction | undefined {
  const jobs = occupationMenu.children(g).find((n) => n.id === 'occupation.jobs') as MenuGroup
  return jobs
    .children(g)
    .find((n): n is MenuAction => n.type === 'action' && n.id.startsWith('listing.') && !(n.subtitle as (x: GameState) => string)(g).includes('Not qualified'))
}

const COUNTRIES = ['us', 'id', 'et', 'jp', 'de', 'br']

// ---------------------------------------------------------------------------

describe('national school rankings', () => {
  it('are deterministic, scale with population and read like a ranking', () => {
    const a = schoolRank('id', 'high', 'SMA Negeri 8 Jakarta')
    const b = schoolRank('id', 'high', 'SMA Negeri 8 Jakarta')
    expect(a).toEqual(b)
    expect(a.rank).toBeGreaterThanOrEqual(1)
    expect(a.rank).toBeLessThanOrEqual(a.total)
    expect(rankLabel(a)).toMatch(/^#[\d,]+ of [\d,]+ secondary schools in Indonesia$/)
    expect(rankLabel(schoolRank('us', 'high', 'Lincoln High School'))).toMatch(/high schools in the United States$/)
    expect(schoolCount('id', 'high')).toBeGreaterThan(schoolCount('nl', 'high'))
    expect(schoolCount('us', 'university')).toBeGreaterThan(schoolCount('et', 'university'))
    for (const level of ['preschool', 'elementary', 'middle', 'high', 'community', 'university', 'graduate'] as const) {
      const r = schoolRank('jp', level, 'Sakura School')
      expect(['Elite', 'Top', 'Good', 'Average', 'Struggling']).toContain(r.tier)
    }
  })

  it('puts famous real universities at the top', () => {
    const r = schoolRank('et', 'university', 'Addis Ababa University')
    expect(r.rank).toBeLessThanOrEqual(3)
    expect(r.tier).toBe('Elite')
  })

  it('shows the rank in the school menu and assigns local preschool names', () => {
    const g = makeTestGame(4, { age: 15, countryId: 'id', birthCountryId: 'id', city: 'Jakarta' })
    const cur = educationInternals.enrollIn(g, 'high', { quiet: true })
    const group = educationMenuNodes(g)[0] as MenuGroup
    expect(String(group.subtitle)).toMatch(/#[\d,]+ • (Elite|Top|Good|Average|Struggling)/)
    const rankRow = group.children(g).find((n) => n.id === 'school.rank')
    expect(rankRow && rankRow.type === 'info' && String(rankRow.text)).toContain(rankLabel(schoolRank('id', 'high', cur.school)))
    // Preschools: cute English names only in the US.
    const us = makeTestGame(5, { age: 3 })
    expect(educationInternals.enrollIn(us, 'preschool', { quiet: true }).school).toMatch(/Preschool|Nursery/)
    const id = makeTestGame(5, { age: 3, countryId: 'id', birthCountryId: 'id', city: 'Jakarta' })
    expect(educationInternals.enrollIn(id, 'preschool', { quiet: true }).school).not.toMatch(/Sprouts|Tiny Tots|Busy Bees|Giggles/)
  })

  it('gives richer families better schools on average', () => {
    const pct = (rich: boolean) => {
      let sum = 0
      for (let seed = 1; seed <= 40; seed++) {
        const g = makeTestGame(seed, { age: 6 })
        createPerson(g, { relation: 'parent', age: 35, money: rich ? 3_000_000 : 0 })
        const cur = educationInternals.enrollIn(g, 'elementary', { quiet: true })
        sum += schoolRank('us', 'elementary', cur.school).pct
      }
      return sum / 40
    }
    expect(pct(true)).toBeLessThan(pct(false) - 0.2)
  })

  it('offers a selective school entrance exam where those exist', () => {
    let offered = false
    for (let seed = 1; seed < 30 && !offered; seed++) {
      const g = makeTestGame(seed, { age: 10, countryId: 'gb', birthCountryId: 'gb', city: 'London' })
      g.character.stats.smarts = 100
      const cur = educationInternals.enrollIn(g, 'elementary', { quiet: true, grades: 95 })
      cur.year = cur.totalYears
      g.character.age = 11
      yearlyEducation(g)
      const offer = choices(g, 'school.selectiveExam')[0]
      if (!offer) continue
      offered = true
      expect(offer.text).toMatch(/11-plus/)
      const target = (offer.data as { school: string }).school
      g.queue = []
      runScript(g, 'school.selectiveExam', 'sit', offer.data, offer)
      expect(g.flags.selectiveExamTaken).toBe(true)
      if (g.character.education.current?.school === target) expect(['Elite', 'Top']).toContain(schoolRank('gb', 'high', target).tier)
    }
    expect(offered).toBe(true)
  })
})

describe('CV entries', () => {
  it('derives entries from degrees, school activities, jobs, businesses, licenses and exams', () => {
    const g = makeTestGame(1, { age: 30, licenses: ['driver', 'pilot'] })
    g.character.education.degrees.push({ kind: 'bachelor', name: "Bachelor's in Computer Science", major: 'Computer Science', school: 'University of Houston', age: 22, honors: true })
    g.character.careerHistory.push({ title: 'Jr. Software Developer', company: 'Apex Labs', startAge: 22, endAge: 26, reason: 'quit', salary: 70000 })
    g.character.job = { defId: 'computer_programmer', title: 'Computer Programmer', company: 'Byte Corp', category: 'fulltime', salary: 95000, level: 1, performance: 90, yearsInRole: 3, yearsAtCompany: 4, data: {} }
    g.assets.push({ id: 'b1', kind: 'business', name: 'Snackr Inc.', emoji: '🍔', purchasePrice: 0, value: 50000, condition: 100, purchasedAge: 28, upkeep: 0, details: { employees: 12 } })
    g.flags.examScore = 92
    g.flags.valedictorian = 'Lincoln High School'
    const e = cvEntries(g)
    const kinds = new Set(e.map((x) => x.kind))
    for (const k of ['education', 'experience', 'award', 'certification'] as const) expect(kinds.has(k)).toBe(true)
    const degree = e.find((x) => x.title.startsWith("Bachelor's"))!
    expect(degree.detail).toMatch(/#[\d,]+ of [\d,]+ colleges and universities in the United States/)
    expect(e.some((x) => x.title === 'Founder & CEO' && x.org === 'Snackr Inc.')).toBe(true)
    expect(e.some((x) => x.title === 'Valedictorian')).toBe(true)
    expect(e.some((x) => x.title.startsWith('SAT score'))).toBe(true)
    expect(e.some((x) => x.org === 'Apex Labs')).toBe(true)
    for (const x of e) {
      expect(x.strength).toBeGreaterThanOrEqual(1)
      expect(x.strength).toBeLessThanOrEqual(10)
    }
  })

  it('includes clubs and roles at the current school and archives them when you leave', () => {
    const g = makeTestGame(2, { age: 16 })
    const cur = educationInternals.enrollIn(g, 'high', { quiet: true, grades: 95 })
    cur.data.clubs = [
      { id: 'robotics', perf: 80, years: 2, role: 'club president', name: 'Robotics Club', kind: 'academic' },
      { id: 'basketball', perf: 60, years: 1, role: '', name: 'Basketball Team', kind: 'sport' },
      { id: 'chess', perf: 50, years: 1, role: '' },
    ]
    const e = cvEntries(g)
    expect(e.some((x) => x.kind === 'leadership' && x.title === 'Club President, Robotics Club')).toBe(true)
    expect(e.some((x) => x.kind === 'activity' && x.title === 'Basketball Team' && x.tags?.includes('sports'))).toBe(true)
    expect(e.some((x) => x.title === 'Chess')).toBe(true)
    expect(e.some((x) => x.title === 'Honor Roll')).toBe(true)
    educationInternals.leaveSchool(g, 'graduated')
    const stored = g.character.cv ?? []
    expect(stored.some((x) => x.title === 'Club President, Robotics Club' && x.source === 'school' && x.endAge === 16)).toBe(true)
    expect(stored.some((x) => x.title === 'Honor Roll')).toBe(true)
  })

  it('is safe for old saves and stays plain JSON', () => {
    const g = makeTestGame(3, { age: 20 })
    delete g.character.cv
    expect(() => cvEntries(g)).not.toThrow()
    expect(cvMenu.children(g).length).toBeGreaterThan(0)
    expect(cvScore(g, universityTarget()).score).toBeGreaterThanOrEqual(0)
    // Junk in a hand-edited save is ignored.
    ;(g.character as unknown as { cv: unknown }).cv = [null, { kind: 'bogus', title: 'x' }, { kind: 'award', title: 'Real Award', strength: 99 }]
    const e = cvEntries(g).filter((x) => !x.id.startsWith('d:'))
    expect(e).toHaveLength(1)
    expect(e[0].strength).toBe(10)
    g.character.cv = []
    cvInternals.volunteer(g, cvInternals.VOLUNTEERING[0])
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    expect(structuredClone(g)).toEqual(g)
  })
})

describe('building your CV', () => {
  it('projects succeed with good stats, can flop, and respect the yearly limit', () => {
    let built = false
    let flopped = false
    for (let seed = 1; seed < 60 && !(built && flopped); seed++) {
      const g = makeTestGame(seed, { age: 16, money: 10_000 })
      g.character.stats.smarts = seed % 2 ? 95 : 5
      g.character.hidden.discipline = seed % 2 ? 95 : 5
      const app = cvInternals.PROJECTS.find((p) => p.id === 'app')!
      cvInternals.doProject(g, app)
      const stored = g.character.cv ?? []
      if (stored.some((x) => x.kind === 'project')) built = true
      else if (notices(g).some((n) => n.title === 'It Flopped')) flopped = true
    }
    expect(built).toBe(true)
    expect(flopped).toBe(true)
    const g = makeTestGame(9, { age: 16, money: 10_000 })
    const film = cvInternals.PROJECTS.find((p) => p.id === 'film')!
    cvInternals.doProject(g, film)
    cvInternals.doProject(g, film)
    const before = g.character.money
    cvInternals.doProject(g, film)
    expect(g.character.money).toBe(before)
    expect(notices(g).at(-1)!.text).toMatch(/two projects/)
  })

  it('kids get their parents to pay, broke adults get a notice', () => {
    const kid = makeTestGame(3, { age: 13, money: 0 })
    const mom = createPerson(kid, { relation: 'parent', age: 40, money: 50_000, gender: 'female' })
    cvInternals.doProject(kid, cvInternals.PROJECTS.find((p) => p.id === 'film')!)
    expect(mom.money).toBeLessThan(50_000)
    const adult = makeTestGame(3, { age: 30, money: 0 })
    cvInternals.doProject(adult, cvInternals.PROJECTS.find((p) => p.id === 'film')!)
    expect(notices(adult).at(-1)!.title).toBe("Can't Afford It")
    expect(adult.yearActions['cv.project'] ?? 0).toBe(0)
  })

  it('volunteering at the same place grows one entry; competitions award winners', () => {
    const g = makeTestGame(4, { age: 15 })
    const shelter = cvInternals.VOLUNTEERING.find((v) => v.id === 'shelter')!
    cvInternals.volunteer(g, shelter)
    g.character.age += 1
    g.yearActions = {}
    cvInternals.volunteer(g, shelter)
    const vol = (g.character.cv ?? []).filter((x) => x.source === 'volunteer:shelter')
    expect(vol).toHaveLength(1)
    expect(vol[0].strength).toBe(3)
    expect(vol[0].org).toMatch(/Animal Shelter/)
    expect(g.counters.volunteered).toBe(2)

    let won = false
    for (let seed = 1; seed < 20 && !won; seed++) {
      const kid = makeTestGame(seed, { age: 15 })
      kid.character.stats.smarts = 100
      cvInternals.enterCompetition(kid, cvInternals.COMPETITIONS.find((c) => c.id === 'math')!)
      won = (kid.character.cv ?? []).some((x) => x.kind === 'award' && /Math Olympiad/.test(x.title))
    }
    expect(won).toBe(true)
  })

  it('the CV menu shows entries, build actions from 12, and is view-only in prison', () => {
    const kid = makeTestGame(1, { age: 11 })
    expect(cvMenu.visible!(kid)).toBe(false)
    const g = makeTestGame(1, { age: 14 })
    strongCv(g)
    const nodes = cvMenu.children(g)
    expect(nodes.some((n) => n.id === 'cv.entry.a1')).toBe(true)
    expect(nodes.some((n) => n.id === 'cv.projects')).toBe(true)
    const occ = occupationMenu.children(g).map((n) => n.id)
    expect(occ).toContain('cv.menu')
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    const jail = cvMenu.children(g)
    expect(jail.some((n) => n.id === 'cv.entry.a1')).toBe(true)
    expect(jail.some((n) => n.id === 'cv.projects')).toBe(false)
  })
})

describe('embellishment', () => {
  it('adds a fake line that can be caught, and coming clean removes it', () => {
    const g = makeTestGame(5, { age: 20 })
    cvInternals.embellish(g, cvInternals.FAKES[0])
    const fakes = embellishedEntries(g)
    expect(fakes).toHaveLength(1)
    expect(g.character.hidden.karma).toBeLessThan(50)
    expect(catchEmbellishment(g, 1)).toEqual(fakes[0])
    expect(catchEmbellishment(g, 0)).toBeNull()
    cvInternals.comeClean(g)
    expect(embellishedEntries(g)).toHaveLength(0)
  })

  it('background checks sometimes reject applicants with fake lines', () => {
    let caught = 0
    for (let seed = 1; seed <= 60; seed++) {
      const g = graduateAdult('us', seed)
      cvInternals.embellish(g, cvInternals.FAKES[0])
      cvInternals.embellish({ ...g, yearActions: {} } as GameState, cvInternals.FAKES[2])
      const app: ScreeningApp = { kind: 'job', job: { defId: 'accountant', title: 'Jr. Accountant', company: 'Apex', salary: 50000, category: 'fulltime' }, org: 'Apex', fit: 50, chance: 1 }
      applyScreening(g, app, { invite: true, reason: '' })
      if (notices(g).some((n) => n.title === 'Background Check')) caught++
    }
    expect(caught).toBeGreaterThan(3)
    expect(caught).toBeLessThan(50)
  })

  it('a lie on your CV can get you fired later', () => {
    let fired = false
    for (let seed = 1; seed <= 80 && !fired; seed++) {
      const g = graduateAdult('us', seed)
      g.character.job = { defId: 'accountant', title: 'Jr. Accountant', company: 'Apex', category: 'fulltime', salary: 50000, level: 0, performance: 80, yearsInRole: 1, yearsAtCompany: 1, data: {} }
      for (let i = 0; i < 4; i++) cvInternals.embellish({ ...g, yearActions: {} } as GameState, cvInternals.FAKES[i === 1 ? 0 : i])
      yearlyCareer(g)
      fired = !g.character.job && g.queue.some((m) => m.kind === 'choice' && /never happened/.test(m.text))
    }
    expect(fired).toBe(true)
  })
})

describe('scoring and university admissions', () => {
  it('clubs, leadership, volunteering, projects and awards raise university odds', () => {
    const plain = senior('us', 1)
    const strong = senior('us', 1)
    strongCv(strong)
    expect(cvScore(strong, universityTarget()).score).toBeGreaterThan(cvScore(plain, universityTarget()).score + 30)
    const top = universityOptions(plain)[0]
    expect(admissionChance(strong, top)).toBeGreaterThan(admissionChance(plain, top))
    const gaps = cvScore(plain, universityTarget()).lines.join(' ')
    expect(gaps).toMatch(/no volunteering/)
  })

  it('lists 5-8 ranked universities with tuition (free where university is free)', () => {
    for (const cid of COUNTRIES) {
      const g = senior(cid, 3)
      const opts = universityOptions(g)
      expect(opts.length, cid).toBeGreaterThanOrEqual(5)
      expect(opts.length, cid).toBeLessThanOrEqual(8)
      expect(new Set(opts.map((o) => o.name)).size).toBe(opts.length)
      for (let i = 1; i < opts.length; i++) expect(opts[i].rank.rank).toBeGreaterThanOrEqual(opts[i - 1].rank.rank)
      if (getCountry(cid).freeUniversity) expect(opts.every((o) => o.tuition === 0)).toBe(true)
      else expect(opts.every((o) => o.tuition > 0)).toBe(true)
      expect(universityOptions(g)).toEqual(opts)
      // The University menu lists them with rank, odds and tuition; majors are inside each one.
      const uni = findNode(educationMenuNodes(g), 'edu.uni.0', g) as MenuGroup
      expect(uni.label).toBe(opts[0].name)
      expect((uni.subtitle as (x: GameState) => string)(g)).toMatch(/^#[\d,]+ • \w+ • admits ~\d+% • .+ • You: /)
      expect(uni.header!(g)).toContain(rankLabel(opts[0].rank))
      expect(uni.children(g).some((n) => n.id === 'edu.uni.0.Biology')).toBe(true)
    }
  })

  it('admits strong applicants (AI off) across very different countries, screening selective schools first', () => {
    for (const cid of COUNTRIES) {
      let enrolled = false
      let screened = false
      for (let seed = 1; seed <= 12 && !enrolled; seed++) {
        const g = senior(cid, seed, 92)
        g.character.money = 2_000_000
        strongCv(g)
        const opts = universityOptions(g)
        const target = opts[seed % opts.length]
        applyToUniversity(g, 'Computer Science', { school: target.name })
        if (target.selective) {
          const task = g.queue.find((m) => m.kind === 'aiTask')
          expect(task && task.kind === 'aiTask' && task.task.type, cid).toBe('screenApplication')
          screened = true
        }
        settle(g)
        const tuition = choices(g, 'school.tuition')[0]
        if (tuition) runScript(g, 'school.tuition', 'cash', tuition.data, tuition)
        const cur = g.character.education.current
        if (cur) {
          enrolled = true
          expect(cur.level).toBe('university')
          expect(cur.school).toBe(target.name)
          if (getCountry(cid).freeUniversity) expect(cur.funding).toBe('free')
        } else {
          expect(notices(g).some((n) => n.title === 'Rejected'), cid).toBe(true)
        }
      }
      expect(enrolled, cid).toBe(true)
      void screened
    }
  })

  it('weak applicants to elite schools get rejected with a reason', () => {
    let rejected = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = senior('us', seed, 30)
      const elite = universityOptions(g)[0]
      applyToUniversity(g, 'History', { school: elite.name })
      settle(g, false)
      const r = notices(g).find((n) => n.title === 'Rejected')
      if (r) {
        rejected++
        expect(r.text.length).toBeGreaterThan(40)
      }
    }
    expect(rejected).toBeGreaterThan(14)
  })

  it('graduate schools read the CV too', () => {
    for (let seed = 1; seed < 30; seed++) {
      const g = graduateAdult('de', seed, 'Biology')
      g.character.stats.smarts = 95
      g.flags.lastGrades = 95
      strongCv(g)
      applyToGraduateSchool(g, 'medical')
      expect(g.queue.some((m) => m.kind === 'aiTask' && m.task.type === 'screenApplication')).toBe(true)
      settle(g)
      if (g.character.education.current) {
        expect(g.character.education.current.level).toBe('graduate')
        expect(g.character.education.current.funding).toBe('free')
        return
      }
    }
    throw new Error('never admitted to medical school')
  })
})

describe('job market and screening', () => {
  it('is deterministic per country and year and shows in the listings', () => {
    const g = graduateAdult('es', 1)
    const rng = g.rng
    const m1 = jobMarket(g)
    expect(jobMarket(g)).toEqual(m1)
    expect(g.rng).toBe(rng)
    expect(m1.line).toMatch(/^Job market: (hot|strong|decent|tough|brutal) — Spain .+; ~[\d,]+ applicants per opening/)
    const jobs = occupationMenu.children(g).find((n) => n.id === 'occupation.jobs') as MenuGroup
    expect(jobs.header!(g)).toContain('Job market:')
    expect(jobs.children(g).some((n) => n.id === 'jobs.market')).toBe(true)
    // Different years, different economies.
    const lines = new Set<number>()
    for (let y = 2000; y < 2040; y++) lines.add(jobMarket({ ...g, year: y }).score)
    expect(lines.size).toBeGreaterThan(5)
  })

  it('a tough market lowers the odds of an interview', () => {
    const def = getJobDef('accountant')!
    const g = graduateAdult('us', 1)
    const m = jobMarket(g)
    expect(jobScreenChance(def, 50, { ...m, score: 15 })).toBeLessThan(jobScreenChance(def, 50, { ...m, score: 85 }) - 0.3)
    expect(jobScreenChance(def, 10, m)).toBeLessThan(jobScreenChance(def, 90, m))
  })

  it('screens job applications (AI off) across very different countries before the interview', () => {
    for (const cid of COUNTRIES) {
      let invited = 0
      let rejected = 0
      for (let seed = 1; seed <= 25; seed++) {
        const g = graduateAdult(cid, seed)
        const listing = qualifiedListing(g)
        if (!listing) continue
        listing.run(g)
        const head = g.queue.at(-1)!
        if (head.kind === 'notice') continue // Greek-life shortcut or similar
        expect(head.kind === 'aiTask' && head.task.type, cid).toBe('screenApplication')
        if (head.kind !== 'aiTask' || head.task.type !== 'screenApplication') continue
        expect(head.task.app.market).toMatch(/Job market/)
        g.queue = []
        applyFallback(g, head.task)
        if (g.queue.some((m) => m.kind === 'aiTask' && m.task.type === 'interview')) invited++
        const no = notices(g).find((n) => n.title === 'No Interview')
        if (no) {
          rejected++
          expect(no.text).toMatch(/passed on your application/)
        }
      }
      expect(invited, cid).toBeGreaterThan(0)
      expect(invited + rejected, cid).toBeGreaterThan(5)
    }
  })

  it('applies the AI screener decision and reason through the director', async () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, baseUrl: 'http://lm.test/v1', model: 'test-model', disableThinking: false }
    const replies = [
      { invite: false, reason: 'Your robotics captaincy is great, but we need three years of accounting.' },
      { invite: true, reason: 'Your olympiad medal stood out.', question: 'What would you build first in our lab?', answers: [{ label: 'Something useful for students', score: 88 }, { label: 'A robot that does my homework', score: 20 }, { label: 'Not sure yet', score: 45 }] },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/chat/completions')) {
          const body = replies.shift()
          return new Response(JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(body) }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (url.endsWith('/v1/models')) return new Response(JSON.stringify({ object: 'list', data: [{ id: 'test-model', object: 'model' }] }), { status: 200 })
        return new Response('{}', { status: 404 })
      }),
    )
    const g = graduateAdult('us', 2)
    const job = { defId: 'accountant', title: 'Jr. Accountant', company: 'Apex', salary: 50000, category: 'fulltime' as const }
    const jobApp: ScreeningApp = { kind: 'job', job, org: 'Apex', fit: 30, chance: 0.4, market: jobMarket(g).line }
    const apply = await runAiTask(g, { type: 'screenApplication', app: jobApp }, settings, new AbortController().signal)
    const draft = structuredClone(g)
    apply(draft)
    expect(notices(draft).at(-1)!.text).toContain('we need three years of accounting')

    const kid = senior('us', 3, 90)
    const uni = universityOptions(kid)[0]
    const uniApp: ScreeningApp = { kind: 'university', org: uni.name, major: 'Computer Science', tier: uni.rank.tier, rankLabel: rankLabel(uni.rank), tuition: uni.tuition, years: 4, fit: 60, chance: 0.6, admit: 0.6 }
    const apply2 = await runAiTask(kid, { type: 'screenApplication', app: uniApp }, settings, new AbortController().signal)
    const d2 = structuredClone(kid)
    apply2(d2)
    const iv = choices(d2, 'school.admissionsInterview')[0]
    expect(iv.text).toContain('What would you build first in our lab?')
    expect(iv.choices).toHaveLength(3)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })
})

describe('AI layer', () => {
  it('validates screening replies leniently', () => {
    expect(validateScreening({ invite: 'yes', reason: 'Nice CV.' })).toEqual({ invite: true, reason: 'Nice CV.' })
    expect(validateScreening({ decision: 'rejected', why: 'Too many applicants.' }).invite).toBe(false)
    expect(() => validateScreening({ reason: 'hmm' })).toThrow()
    const withQ = validateScreening({ invite: true, reason: 'ok', question: 'Why our school, really?', answers: [{ label: 'A', score: 90 }, { label: 'B', score: 10 }, { label: 'C', score: 50 }] })
    expect(withQ.question?.answers).toHaveLength(3)
    expect(validateScreening({ invite: true, reason: 'ok', question: '', answers: [] }).question).toBeUndefined()
  })

  it('builds a compact screening prompt from the CV, target and market (never revealing fake flags)', () => {
    const g = graduateAdult('id', 4)
    strongCv(g)
    cvInternals.embellish(g, cvInternals.FAKES[0])
    const app: ScreeningApp = { kind: 'job', job: { defId: 'computer_programmer', title: 'Jr. Computer Programmer', company: 'Byte', salary: 20000, category: 'fulltime' }, org: 'Byte', fit: 55, chance: 0.5, market: jobMarket(g).line }
    const prompt = screenApplicationPrompt(g, app)
    expect(prompt).toContain('PlantPal')
    expect(prompt).toContain('Job market:')
    expect(prompt).toContain('CV fit 55/100')
    expect(prompt).toMatch(/never invent CV items/)
    expect(prompt).not.toMatch(/embellish|fake|made up/i)
    expect(prompt.length).toBeLessThan(4000)
    expect(cvSummary(g)).toContain('Club President, Robotics Club')
  })
})
