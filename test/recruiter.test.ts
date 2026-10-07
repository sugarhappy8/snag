// The CV-aware job recruiter (careers.ts) and job fit (cv.ts): openings ranked by how well the
// CV fits each one, interview odds, reach jobs with a gap analysis, and the pitch flowing into
// the regular screening / interview flow.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { fullTimeListings, jobRequirementProblem, occupationMenu, recruiterMatches, requirementGaps } from '../src/game/careers'
import { cvScore, fitContext, jobFit, jobMarket, jobTarget } from '../src/game/cv'
import { getJobDef } from '../src/game/data/jobs'
import type { DegreeKind, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

const COUNTRIES = ['us', 'jp', 'br', 'ng', 'de', 'in', 'gb', 'mx']

function grad(cid: string, major: string, kind: DegreeKind = 'bachelor', seed = 3): GameState {
  const g = makeTestGame(seed, { age: 27, countryId: cid, birthCountryId: cid })
  g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High', age: 18 })
  g.character.education.degrees.push({ kind, name: `Degree in ${major}`, major, school: 'Test University', age: 22 })
  return g
}

function coder(cid: string): GameState {
  const g = grad(cid, 'Computer Science')
  g.flags.codingSkill = 72
  g.character.careerHistory.push({ title: 'Jr. Computer Programmer', company: 'Byte Labs', startAge: 22, endAge: 26, reason: 'quit', salary: 60_000 })
  return g
}

function accountant(cid: string): GameState {
  const g = grad(cid, 'Accounting')
  g.character.careerHistory.push({ title: 'Jr. Accountant', company: 'Apex Holdings', startAge: 22, endAge: 26, reason: 'quit', salary: 50_000 })
  return g
}

function nobody(cid: string): GameState {
  return makeTestGame(3, { age: 27, countryId: cid, birthCountryId: cid })
}

function findNode(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

function recruiter(g: GameState): MenuGroup {
  const n = findNode(g, occupationMenu.children(g), 'occupation.recruiter')
  if (!n || n.type !== 'menu') throw new Error('no recruiter menu')
  return n
}

describe('job fit', () => {
  it('rates a matching CV far above an unrelated one for the same job', () => {
    for (const cid of COUNTRIES) {
      const dev = getJobDef('computer_programmer')!
      const acct = getJobDef('accountant')!
      const c = coder(cid)
      const a = accountant(cid)
      expect(jobFit(c, dev).fit, cid).toBeGreaterThan(jobFit(a, dev).fit + 25)
      expect(jobFit(a, acct).fit, cid).toBeGreaterThan(jobFit(c, acct).fit + 20)
      expect(jobFit(c, dev).strengths.join(' ')).toMatch(/Computer Science|Coding skill|years in tech/)
    }
  })

  it('counts experience, coding skill, certifications and school rank', () => {
    const dev = getJobDef('computer_programmer')!
    const base = grad('us', 'Computer Science')
    const f0 = jobFit(base, dev).fit
    const skilled = grad('us', 'Computer Science')
    skilled.flags.codingSkill = 80
    expect(jobFit(skilled, dev).fit).toBeGreaterThan(f0)
    const veteran = grad('us', 'Computer Science')
    veteran.character.careerHistory.push({ title: 'Jr. Computer Programmer', company: 'Byte Labs', startAge: 22, endAge: 27, reason: 'quit', salary: 60_000 })
    expect(jobFit(veteran, dev).fit).toBeGreaterThan(f0 + 8)
    const certified = grad('us', 'Computer Science')
    certified.character.cv = [{ id: 'x1', kind: 'certification', title: 'Cloud Certificate', org: 'Online', startAge: 24, endAge: 24, detail: '', strength: 4, embellished: false, tags: ['tech'] }]
    expect(jobFit(certified, dev).fit).toBeGreaterThan(f0)
    // A gap analysis for thin CVs.
    expect(jobFit(base, dev).gaps.join(' ')).toMatch(/experience|coding/i)
  })

  it('is deterministic and never touches the game state', () => {
    const g = coder('br')
    const before = JSON.stringify(g)
    const a = recruiterMatches(g)
    const b = recruiterMatches(g)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(g)).toBe(before)
    for (const m of [...a.top, ...a.reach]) {
      expect(Number.isFinite(m.fit) && m.fit >= 0 && m.fit <= 100).toBe(true)
      expect(m.odds).toBeGreaterThan(0)
      expect(m.odds).toBeLessThanOrEqual(0.97)
      expect(m.salary).toBeGreaterThan(0)
    }
  })
})

describe('the recruiter', () => {
  it('ranks relevant jobs first for matching CVs, in very different countries', () => {
    for (const cid of COUNTRIES) {
      const devGame = coder(cid)
      const dev = recruiterMatches(devGame).top
      expect(dev.length, cid).toBeGreaterThanOrEqual(3)
      expect(dev[0].def.industry, cid).toBe('tech')
      expect(dev.slice(0, 3).filter((m) => m.def.industry === 'tech').length, cid).toBeGreaterThanOrEqual(2)
      const acctGame = accountant(cid)
      const acct = recruiterMatches(acctGame).top
      expect(acct.slice(0, 3).some((m) => m.def.id === 'accountant' || m.def.id === 'internal_auditor'), cid).toBe(true)
      expect(acct.every((m) => m.def.industry !== 'tech'), cid).toBe(true)
      const nurse = recruiterMatches(grad(cid, 'Nursing', 'nursing')).top
      expect(nurse[0].def.id, cid).toBe('nurse')
      // Everything it suggests is a job you can actually get.
      for (const m of dev) expect(jobRequirementProblem(devGame, m.def), `${cid} ${m.def.id}`).toBeNull()
      for (const m of acct) expect(jobRequirementProblem(acctGame, m.def), `${cid} ${m.def.id}`).toBeNull()
    }
  })

  it('gets strong, relevant CVs better odds, better pay and sometimes a direct interview', () => {
    let direct = 0
    for (const cid of COUNTRIES) {
      const strong = recruiterMatches(coder(cid)).top.find((m) => m.def.id === 'computer_programmer')!
      const weakGame = grad(cid, 'Computer Science')
      const weak = recruiterMatches(weakGame).top.find((m) => m.def.id === 'computer_programmer')!
      expect(strong.fit, cid).toBeGreaterThan(weak.fit)
      expect(strong.odds, cid).toBeGreaterThanOrEqual(weak.odds)
      expect(strong.salary, cid).toBeGreaterThanOrEqual(weak.salary)
      if (strong.direct) direct++
    }
    expect(direct).toBeGreaterThan(0)
  })

  it('explains what is missing for reach jobs in your field', () => {
    const g = accountant('us')
    const { top, reach } = recruiterMatches(g)
    expect(reach.length).toBeGreaterThan(0)
    for (const m of reach) {
      expect(jobRequirementProblem(g, m.def)).not.toBeNull()
      expect(m.gaps.length).toBeGreaterThan(0)
      expect(m.salary).toBeGreaterThan(Math.max(...top.map((t) => t.salary)))
      expect(requirementGaps(g, m.def)).toEqual(expect.arrayContaining(m.gaps))
    }
    expect(reach.map((m) => m.gaps.join(' ')).join(' ')).toMatch(/Business School|experience/)
    // Tapping one pops up the whole checklist (a toast would squash the bullet list).
    const reachRow = recruiter(g).children(g).find((n): n is MenuAction => n.type === 'action' && n.id.startsWith('recruiter.reach.'))!
    expect(reachRow.disabledReason?.(g) ?? null).toBeNull()
    g.queue = []
    reachRow.run(g)
    const popup = g.queue.find((m) => m.kind === 'notice')
    expect(popup?.kind === 'notice' && popup.text).toMatch(/you still need:\n• /)
  })

  it('lists every requirement that is missing, not just the first', () => {
    const g = nobody('us')
    const gaps = requirementGaps(g, getJobDef('executive')!)
    expect(gaps.length).toBeGreaterThanOrEqual(2)
    expect(gaps.join(' ')).toMatch(/experience/)
  })

  it('a pitch goes through the screener (AI off) and on to the interview', () => {
    let interviews = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = grad('de', 'Accounting', 'bachelor', seed)
      const rows = recruiter(g).children(g).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('recruiter.match.'))
      expect(rows.length).toBeGreaterThan(0)
      expect(rows[0].confirm?.(g)).toMatch(/CV fit: \d+%/)
      rows[0].run(g)
      const task = g.queue.find((m) => m.kind === 'aiTask')
      expect(task).toBeDefined()
      if (task?.kind === 'aiTask' && task.task.type === 'screenApplication') {
        expect(task.task.app.fit).toBeGreaterThan(0)
        expect(task.task.app.market).toMatch(/Job market/)
        g.queue = []
        applyFallback(g, task.task)
      }
      if (g.queue.some((m) => m.kind === 'aiTask' && m.task.type === 'interview')) interviews++
    }
    expect(interviews).toBeGreaterThan(6)
  })

  it('is closed to students, prisoners and kids', () => {
    const g = coder('us')
    g.character.education.current = { level: 'university', school: 'Test University', year: 1, totalYears: 4, grades: 80, major: 'Physics', data: {} }
    expect(recruiter(g).disabledReason?.(g)).toMatch(/student/)
    const p = coder('us')
    p.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 }
    expect(findNode(p, occupationMenu.children(p), 'occupation.recruiter')).toBeUndefined()
    const kid = makeTestGame(1, { age: 15 })
    expect(recruiter(kid).visible?.(kid)).toBe(false)
  })
})

describe('job listings', () => {
  it('show your fit and use it when screening', () => {
    const g = coder('us')
    const listings = fullTimeListings(g)
    const jobs = findNode(g, occupationMenu.children(g), 'occupation.jobs') as MenuGroup
    const rows = jobs.children(g).filter((n): n is MenuAction => n.type === 'action')
    const ok = rows.find((r) => typeof r.subtitle === 'function' && /Fit \d+%/.test(r.subtitle(g)))
    expect(ok).toBeDefined()
    const listing = listings.find((l) => !jobRequirementProblem(g, l.def))!
    const market = jobMarket(g, listing.def.industry)
    const fit = jobFit(g, listing.def, fitContext(g), market).fit
    const row = rows.find((r) => r.id === `listing.${listing.key}`)!
    row.run(g)
    const task = g.queue.find((m) => m.kind === 'aiTask')
    if (task?.kind === 'aiTask' && task.task.type === 'screenApplication') expect(task.task.app.fit).toBe(fit)
  })
})

describe('review fixes', () => {
  it('a strong CV outside the field still counts for entry-level work (no screening regression)', () => {
    for (const cid of ['us', 'jp', 'br', 'ng']) {
      const g = makeTestGame(5, { age: 19, countryId: cid, birthCountryId: cid })
      g.character.education.degrees.push({ kind: 'highschool', name: 'High School Diploma', school: 'Test High', age: 18 })
      g.character.cv = [
        { id: 'a1', kind: 'leadership', title: 'Student council president', org: 'Test High', startAge: 16, endAge: 18, detail: '', strength: 6, embellished: false, tags: ['government'] },
        { id: 'a2', kind: 'activity', title: 'Chess club captain', org: 'Test High', startAge: 14, endAge: 18, detail: '', strength: 5, embellished: false, tags: ['academic'] },
        { id: 'a3', kind: 'volunteering', title: 'Food bank volunteer', org: 'Downtown Food Bank', startAge: 15, endAge: 18, detail: '', strength: 4, embellished: false, tags: ['service'] },
        { id: 'a4', kind: 'award', title: 'Science fair winner', org: 'Test High', startAge: 17, endAge: 17, detail: '', strength: 5, embellished: false, tags: ['science'] },
      ]
      for (const id of ['factory_worker', 'janitor', 'bus_driver', 'telemarketer']) {
        const def = getJobDef(id)!
        const general = cvScore(g, jobTarget(def)).score
        expect(general, `${cid} ${id}`).toBeGreaterThan(15)
        expect(jobFit(g, def).fit, `${cid} ${id}`).toBeGreaterThanOrEqual(Math.floor(general * 0.8))
      }
    }
  })

  it('still marks graduates down as overqualified for no-degree jobs', () => {
    const g = grad('us', 'Accounting')
    const f = jobFit(g, getJobDef('janitor')!)
    expect(f.gaps.join(' ')).toMatch(/Overqualified/)
    expect(f.fit).toBeLessThan(jobFit(g, getJobDef('accountant')!).fit - 20)
  })

  it('never says a relevant degree shows no interest in the field', () => {
    for (const cid of ['us', 'br']) {
      const g = grad(cid, 'Biology')
      const f = jobFit(g, getJobDef('biotechnologist') ?? getJobDef('microbiologist')!)
      expect(f.strengths.join(' ')).toMatch(/Biology/)
      expect(f.gaps.join(' ')).not.toMatch(/Nothing on your CV/)
    }
  })

  it('calls years in a neighboring industry related experience, not years in the field', () => {
    const g = coder('us')
    const f = jobFit(g, getJobDef('dental_hygienist')!)
    expect(f.strengths.join(' ')).not.toMatch(/years? in healthcare/)
  })

  it('a guaranteed interview still runs the background check on made-up CV lines', () => {
    let caught = 0
    let pitched = 0
    for (let seed = 1; seed <= 8; seed++) {
      const g = coder('us')
      g.rng = seed * 7919
      g.character.cv = Array.from({ length: 12 }, (_, i) => ({ id: `fake${i}`, kind: 'certification' as const, title: `Certified Cloud Wizard ${i + 1}`, org: 'Online', startAge: 24, endAge: 24, detail: '', strength: 6, embellished: true, tags: ['tech'] }))
      const rows = recruiter(g).children(g).filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('recruiter.match.'))
      const direct = rows.find((r) => typeof r.subtitle === 'string' && /Interview guaranteed/.test(r.subtitle))
      if (!direct) continue
      pitched++
      g.queue = []
      direct.run(g)
      if (g.queue.some((m) => m.kind === 'notice' && m.title === 'Background Check')) caught++
      else expect(g.queue.some((m) => m.kind === 'aiTask' && m.task.type === 'interview')).toBe(true)
    }
    expect(pitched).toBeGreaterThan(0)
    expect(caught).toBeGreaterThan(0)
  })
})
