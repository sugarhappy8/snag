// Era rules of daily life, 1900-1979: when children could leave school and what the strap looked like,
// which doors were closed to whom and how pay compared across trades, the old trades on the job board,
// the doctor's house call and the TB rest cure. Every rule is exactly neutral in modern years.
import { describe, expect, it } from 'vitest'
import { eraAccessProblem, eraMinAge, eraPayShape, fullTimeListings, hireForJob, jobRequirementProblem, partTimeListings, yearlyCareer } from '../src/game/careers'
import { educationMenuNodes, eraDiscipline, finalExam, eraDropOutAge, educationInternals, leaveSchoolToWork, meetsEducation, schoolLeavingAge, schoolSystem, schoolWarning } from '../src/game/education'
import { getJobDef } from '../src/game/data/jobs'
import { contractCondition, doctorMenu, yearlyHealth } from '../src/game/health'
import { createPerson } from '../src/game/people'
import { yearlyMilitary } from '../src/game/special/military'
import { EARLY_FULLTIME_JOBS, EARLY_PARTTIME_JOBS, earlyJobDef } from '../src/game/history/events-jobs'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { typicalMarriageAge } from '../src/game/history/events-people'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

function at(year: number, countryId: string, age: number, extra: Partial<GameState['character']> = {}): GameState {
  const g = makeTestGame(7, { countryId, age, ...extra })
  g.year = year
  return g
}

describe('school-leaving ages by era', () => {
  it('gives the right leaving age in the right year', () => {
    expect(eraDropOutAge('us', 1920, 16)).toBe(14)
    expect(eraDropOutAge('us', 1950, 16)).toBe(15)
    expect(eraDropOutAge('us', 1965, 16)).toBe(16)
    expect(eraDropOutAge('gb', 1910, 16)).toBe(12)
    expect(eraDropOutAge('gb', 1935, 16)).toBe(14)
    expect(eraDropOutAge('gb', 1960, 16)).toBe(15)
    expect(eraDropOutAge('gb', 1975, 16)).toBe(16)
    expect(eraDropOutAge('jp', 1935, 15)).toBe(12)
    expect(eraDropOutAge('jp', 1960, 15)).toBe(15)
    expect(eraDropOutAge('in', 1950, 14)).toBeLessThan(14)
    expect(eraDropOutAge('ng', 1955, 15)).toBeLessThan(15)
  })

  it('is never above today\'s value and exactly today\'s from 1985', () => {
    for (const id of ['us', 'gb', 'jp', 'in', 'ng', 'br', 'de', 'cn', 'au']) {
      const modern = schoolSystem(id).dropOutAge
      for (let y = 1900; y <= 2030; y += 5) {
        const a = eraDropOutAge(id, y, modern)
        expect(a, `${id} ${y}`).toBeLessThanOrEqual(modern)
        expect(a).toBeGreaterThanOrEqual(10)
        if (y >= 1985) expect(a).toBe(modern)
      }
    }
  })

  it('the game uses the era age and lets a child leave school to work', () => {
    const g = at(1925, 'us', 14)
    expect(schoolLeavingAge(g)).toBe(14)
    expect(at(PRESENT_YEAR, 'us', 14).year).toBe(PRESENT_YEAR)
    expect(schoolLeavingAge(at(PRESENT_YEAR, 'us', 14))).toBe(16)
    g.character.education.current = { level: 'high', school: 'Test High', year: 1, totalYears: 4, grades: 60, funding: 'free', data: {} } as never
    expect(leaveSchoolToWork(g)).toBe(true)
    expect(g.character.education.current).toBeNull()
    expect(g.character.education.droppedOut).toContain('high')
    expect(leaveSchoolToWork(g)).toBe(false)
    // Too young to leave.
    const young = at(1925, 'us', 11)
    young.character.education.current = { level: 'elementary', school: 'Test', year: 3, totalYears: 6, grades: 60, funding: 'free', data: {} } as never
    expect(leaveSchoolToWork(young)).toBe(false)
    expect(young.character.education.current).not.toBeNull()
  })

  it('counts eight grades as enough for a clerk in 1930, but not in the present', () => {
    const g = at(1930, 'us', 19)
    g.character.education.droppedOut = ['elementary']
    expect(meetsEducation(g, 'highschool')).toBe(true)
    const modern = at(PRESENT_YEAR, 'us', 19)
    modern.character.education.droppedOut = ['elementary']
    expect(meetsEducation(modern, 'highschool')).toBe(false)
    const still = at(1930, 'us', 19)
    still.character.education.droppedOut = ['elementary']
    still.character.education.current = { level: 'community', school: 'X', year: 1, totalYears: 2, grades: 60, funding: 'free', data: {} } as never
    expect(meetsEducation(still, 'highschool')).toBe(false)
  })
})

describe('school discipline by era', () => {
  it('has the strap in 1930, the paddle in 1960 and nothing in the present', () => {
    expect(eraDiscipline(at(1930, 'us', 10))).toMatch(/strap/)
    expect(eraDiscipline(at(1960, 'us', 10))).toMatch(/paddle/)
    expect(eraDiscipline(at(1930, 'gb', 10))).toMatch(/cane/)
    expect(eraDiscipline(at(1960, 'gb', 10))).toMatch(/slipper/)
    expect(eraDiscipline(at(1965, 'ng', 10))).toMatch(/stick/)
    expect(eraDiscipline(at(1990, 'gb', 10))).toBe('')
    expect(eraDiscipline(at(PRESENT_YEAR, 'us', 10))).toBe('')
    expect(eraDiscipline(at(1955, 'jp', 10))).toBe('')
  })

  it('puts it into the principal\'s office notice and costs a little happiness, but only before 1985', () => {
    for (const [year, expected] of [[1930, true], [PRESENT_YEAR, false]] as const) {
      const g = at(year, 'us', 10)
      g.character.education.current = { level: 'elementary', school: 'Test', year: 3, totalYears: 6, grades: 60, funding: 'free', data: { principal: 'Mr. Smith' } } as never
      g.character.stats.happiness = 70
      schoolWarning(g, 'talking in class')
      const text = g.queue.map((m) => ('text' in m ? m.text : '')).join(' ')
      expect(/strap/.test(text), String(year)).toBe(expected)
      expect(g.character.stats.happiness).toBe(expected ? 68 : 70)
    }
    expect(educationInternals).toBeTruthy()
  })
})

describe('the old job board', () => {
  it('has well-formed old trades with unique ids', () => {
    const ids = new Set<string>()
    for (const def of [...EARLY_FULLTIME_JOBS, ...EARLY_PARTTIME_JOBS]) {
      expect(ids.has(def.id), def.id).toBe(false)
      ids.add(def.id)
      expect(getJobDef(def.id), `${def.id} must not collide with the board's own jobs`).toBeUndefined()
      expect(earlyJobDef(def.id)).toBe(def)
      expect(def.ladder.length).toBeGreaterThan(0)
      for (const r of def.ladder) {
        expect(r.salary).toBeGreaterThan(0)
        expect(r.title.length).toBeGreaterThan(3)
      }
      if (def.category === 'parttime') expect(def.hourly! * def.hours!).toBeGreaterThan(0)
      expect(def.until === undefined || def.until < PRESENT_YEAR, def.id).toBe(true)
    }
    expect(EARLY_FULLTIME_JOBS.length).toBeGreaterThanOrEqual(15)
  })

  it('offers them in their years and not in modern ones', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 12; seed++) {
      const g = at(1925, 'us', 19)
      g.lifeId = `life-${seed}`
      for (const l of [...fullTimeListings(g), ...partTimeListings(g)]) if (earlyJobDef(l.def.id)) seen.add(l.def.id)
    }
    expect(seen.size).toBeGreaterThanOrEqual(8)
    const modern = at(PRESENT_YEAR, 'us', 25)
    for (const l of [...fullTimeListings(modern), ...partTimeListings(modern)]) expect(earlyJobDef(l.def.id), l.def.id).toBeUndefined()
    // Munitions work only in the world wars.
    const quiet = at(1925, 'us', 22)
    const munitions = earlyJobDef('munitions_worker')!
    expect(jobRequirementProblem(quiet, munitions)).toMatch(/Nobody hires|exist/)
    expect(jobRequirementProblem(at(1916, 'gb', 22), munitions)).toBeNull()
  })

  it('can hire the player into an old trade and pay them', () => {
    const g = at(1950, 'gb', 22, { money: 100 })
    const def = earlyJobDef('mill_hand')!
    expect(jobRequirementProblem(g, def)).toBeNull()
    const job = hireForJob(g, { defId: def.id, title: 'Mill Hand', company: 'Calder Mills', salary: 9000, category: 'fulltime' })
    expect(g.character.job).toBe(job)
    const before = g.character.money
    yearlyCareer(g)
    expect(Number.isFinite(g.character.money)).toBe(true)
    expect(g.character.money).toBeGreaterThan(before)
  })

  it('pays the trades in proportion: a miner out-earns a maid, a steelworker a clerk', () => {
    const maid = earlyJobDef('domestic_servant')!
    const miner = earlyJobDef('coal_miner')!
    const steel = earlyJobDef('steelworker')!
    const stenographer = earlyJobDef('stenographer')!
    expect(miner.ladder[0].salary).toBeGreaterThan(maid.ladder[0].salary)
    expect(steel.ladder[0].salary).toBeGreaterThan(stenographer.ladder[0].salary)
    expect(earlyJobDef('telegram_messenger')!.ladder[0].salary).toBeLessThan(miner.ladder[0].salary)
  })
})

describe('era access and age', () => {
  it('lets children take no-degree jobs at the era\'s age and keeps modern rules', () => {
    const factory = getJobDef('factory_worker')!
    const kid = at(1925, 'us', 14)
    expect(eraMinAge(kid, factory)).toBe(14)
    expect(jobRequirementProblem(kid, factory)).toBeNull()
    expect(eraMinAge(at(PRESENT_YEAR, 'us', 14), factory)).toBe(18)
    expect(jobRequirementProblem(at(PRESENT_YEAR, 'us', 14), factory)).toMatch(/at least 18/)
    // Still enrolled in school: the modern minimum.
    const student = at(1925, 'us', 14)
    student.character.education.current = { level: 'elementary', school: 'T', year: 5, totalYears: 6, grades: 60, funding: 'free', data: {} } as never
    expect(eraMinAge(student, factory)).toBe(18)
    // Degree jobs keep their age, and so do explicit ages.
    expect(eraMinAge(kid, getJobDef('accountant')!)).toBe(18)
    expect(eraMinAge(kid, getJobDef('casino')!)).toBe(21)
  })

  it('keeps the professions, the cloth and the fire brigade for adults even in the school-leaving era', () => {
    const kid = at(1905, 'gb', 14, { gender: 'male' })
    for (const id of ['firefighter', 'priest', 'monk', 'nun', 'mail_carrier', 'security_guard', 'zookeeper', 'insurance_agent', 'bill_collector', 'wedding_planner', 'jeweler', 'exorcist']) {
      const def = getJobDef(id)
      if (!def) continue
      expect(eraMinAge(kid, def), id).toBe(def.minAge ?? 18)
    }
    // The shop floor, the mill and the messenger's bicycle still take fourteen-year-olds.
    for (const id of ['factory_worker', 'cashier', 'typist', 'dishwasher', 'construction']) expect(eraMinAge(kid, getJobDef(id)!), id).toBe(14)
    expect(eraMinAge(kid, earlyJobDef('mill_hand')!)).toBe(14)
  })

  it('closes the historical doors, tactfully, and only until they opened', () => {
    const pilot = getJobDef('pilot')!
    const woman = (y: number, c = 'us') => at(y, c, 30, { gender: 'female' })
    expect(eraAccessProblem(woman(1955), pilot)).toMatch(/did not yet hire women/)
    expect(eraAccessProblem(woman(1975), pilot)).toBeNull()
    expect(eraAccessProblem(woman(1955, 'ru'), pilot)).toBeNull()
    expect(eraAccessProblem(at(1955, 'us', 30, { gender: 'male' }), pilot)).toBeNull()
    expect(eraAccessProblem(woman(PRESENT_YEAR), pilot)).toBeNull()
    expect(eraAccessProblem(woman(1950), getJobDef('police')!)).toMatch(/Police forces/)
    expect(eraAccessProblem(woman(1960), getJobDef('stockbroker')!)).toMatch(/stock exchanges/)
    expect(eraAccessProblem(woman(1960), getJobDef('bartender')!)).toMatch(/tending bar/)
    expect(jobRequirementProblem(woman(1955), pilot)).toMatch(/women as pilots/)
    for (const text of ['pilot', 'police', 'firefighter', 'stockbroker', 'bartender', 'horse_jockey', 'judge', 'lawyer']) {
      const reason = eraAccessProblem(woman(1900), getJobDef(text)!)
      if (reason) expect(reason).not.toMatch(/fault|stupid|weak|inferior|can't/i)
    }
  })

  it('shapes pay by trade and era and is exactly 1 from 1980', () => {
    expect(eraPayShape(1960, 'factory')).toBeGreaterThan(eraPayShape(1960, 'retail'))
    expect(eraPayShape(1925, 'hotel')).toBeLessThan(eraPayShape(1925, 'law'))
    expect(eraPayShape(1925, 'corporate')).toBe(1)
    for (const ind of ['factory', 'retail', 'hospital', 'tech', 'bank'] as const) {
      expect(eraPayShape(1980, ind)).toBe(1)
      expect(eraPayShape(PRESENT_YEAR, ind)).toBe(1)
    }
    const mean = (['factory', 'trades', 'retail', 'hotel', 'corporate', 'bank', 'school'] as const).reduce((s, i) => s + eraPayShape(1960, i), 0) / 7
    expect(mean).toBeGreaterThan(0.9)
    expect(mean).toBeLessThan(1.1)
  })
})

describe('era health', () => {
  it('sends the doctor to the house in 1930 and to the surgery in the present', () => {
    function visitText(year: number, countryId: string, age: number): string {
      const g = at(year, countryId, age, { money: 50_000 })
      if (age < 18) {
        const parent = createPerson(g, { relation: 'parent', age: 38, gender: 'female', livesWithPlayer: true })
        parent.money = 20_000
      }
      contractCondition(g, 'Pneumonia', { diagnosed: false, quiet: true })
      const medical = doctorMenu.children(g).find((n) => n.type === 'menu' && n.id === 'doctor.medical')
      if (!medical || medical.type !== 'menu') throw new Error('no medical doctor menu')
      const visit = medical.children(g)[0]
      if (visit.type !== 'action') throw new Error('no visit action')
      visit.run(g)
      return g.queue.map((m) => ('text' in m ? m.text : '')).join(' ')
    }
    expect(visitText(1930, 'us', 30)).toMatch(/house call, black bag/)
    expect(visitText(1930, 'gb', 9)).toMatch(/sent for Dr\. .*, who came to the house with a black bag/)
    expect(visitText(1930, 'ng', 30)).not.toMatch(/black bag/)
    expect(visitText(1975, 'us', 30)).not.toMatch(/black bag/)
    expect(visitText(PRESENT_YEAR, 'us', 30)).not.toMatch(/black bag/)
    expect(visitText(PRESENT_YEAR, 'us', 9)).toMatch(/took you to see/)
  })

  it('treats TB with the rest cure before streptomycin, and not after', () => {
    function run(year: number, countryId: string): { health: number; logged: boolean } {
      const g = at(year, countryId, 30)
      g.character.stats.health = 80
      g.character.stats.happiness = 70
      const cond = contractCondition(g, 'Tuberculosis', { diagnosed: true, quiet: true, severity: 25 })!
      expect(cond).toBeTruthy()
      yearlyHealth(g)
      const logged = g.log.some((y) => y.entries.some((e) => /sanatorium/i.test(e.text)))
      return { health: g.character.stats.health, logged }
    }
    expect(run(1930, 'us').logged).toBe(true)
    expect(run(1930, 'gb').logged).toBe(true)
    expect(run(1930, 'ng').logged).toBe(false)
    expect(run(1975, 'us').logged).toBe(false)
    expect(run(PRESENT_YEAR, 'us').logged).toBe(false)
  })
})

describe('the draft-era college', () => {
  it('notes a student deferment once, without touching the dice', () => {
    const g = at(1968, 'us', 20, { gender: 'male' })
    g.character.education.current = { level: 'university', school: 'State U', year: 2, totalYears: 4, grades: 70, funding: 'loans', major: 'English', data: {} } as never
    const rng = g.rng
    yearlyMilitary(g)
    yearlyMilitary(g)
    const lines = g.log.flatMap((y) => y.entries.map((e) => e.text)).filter((t) => /student deferment/.test(t))
    expect(lines.length).toBe(1)
    expect(lines[0]).toMatch(/Vietnam War/)
    expect(g.queue.length).toBe(0)
    // Nothing in this path rolls (the draft's own dice come after the deferment check).
    expect(g.rng).toBe(rng)
  })
})

describe('who married when', () => {
  it('married young in the boom years and late before and after', () => {
    expect(typicalMarriageAge(1900, 'male')).toBeCloseTo(25.9, 1)
    expect(typicalMarriageAge(1955, 'female')).toBeLessThan(21)
    expect(typicalMarriageAge(1955, 'male')).toBeLessThan(typicalMarriageAge(1900, 'male'))
    expect(typicalMarriageAge(PRESENT_YEAR, 'female')).toBe(28)
    expect(typicalMarriageAge(2200, 'male')).toBe(30)
    for (let y = 1880; y < 2100; y += 7) {
      for (const sex of ['male', 'female'] as const) {
        const age = typicalMarriageAge(y, sex)
        expect(age).toBeGreaterThan(19)
        expect(age).toBeLessThan(31)
      }
      expect(typicalMarriageAge(y, 'male')).toBeGreaterThan(typicalMarriageAge(y, 'female'))
    }
  })
})

describe('finishing school as a grown-up', () => {
  function label(year: number, country: string): string {
    const g = at(year, country, 26, { money: 5000 })
    const nodes = educationMenuNodes(g)
    const group = nodes[0]
    if (!group || group.type !== 'menu') throw new Error('no education menu')
    const ged = group.children(g).find((n) => n.id === 'edu.ged')
    if (!ged || ged.type !== 'action') throw new Error('no equivalency action')
    return ged.label
  }

  it('is night school before 1942, the GED after, and the local certificate abroad', () => {
    expect(label(1930, 'us')).toBe('Attend Night School')
    expect(label(1960, 'us')).toBe('Get Your GED')
    expect(label(1960, 'gb')).toBe('Take the Equivalency Exam')
  })

  it('names the school-leaving exam in the era\'s words', () => {
    expect(finalExam(at(1910, 'us', 17))).toBe('the College Board exams')
    expect(finalExam(at(1930, 'us', 17))).toBe(finalExam(at(PRESENT_YEAR, 'us', 17)))
    expect(finalExam(at(1930, 'gb', 17))).toBe('the School Certificate')
    expect(finalExam(at(1935, 'ng', 17))).toBe('the school certificate exams')
    expect(finalExam(at(1930, 'cn', 17))).toBe('the university entrance exam')
    expect(finalExam(at(1980, 'kr', 17))).toBe('the national entrance exam')
    expect(finalExam(at(1960, 'gb', 17))).toBe(finalExam(at(PRESENT_YEAR, 'gb', 17)))
    expect(finalExam(at(1930, 'de', 17))).toBe(finalExam(at(PRESENT_YEAR, 'de', 17)))
  })
})
