// Birth, family, milestones and health read like the place you live: an Indonesian baby's
// parents elope to Bali, not Las Vegas; a German heir goes to a Gymnasium; Saudi teens don't
// get "you can drink now" on their 18th birthday. Americans keep every Americanism.
// Also checks that unprompted health and milestone events don't nag the same person every year.
import { describe, expect, it } from 'vitest'
import { localeOf } from '../src/game/data/locales'
import { killCharacter } from '../src/game/death'
import { checkDeath, contractCondition, doctorMenu, yearlyHealth } from '../src/game/health'
import { continueAsChild, createNewLife, TALENTS, yearlyMilestones } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, NoticeModal } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

const COUNTRIES = ['us', 'id', 'et', 'jp', 'br', 'in', 'ng', 'de', 'sa', 'mx', 'gb']
const NON_US = COUNTRIES.filter((c) => c !== 'us')

/** Things that only make sense in the United States (or where the local data says otherwise). */
function americanisms(countryId: string): RegExp[] {
  const loc = localeOf(countryId)
  const out = [
    /Las Vegas/,
    /Northgate/,
    /Meadowbrook/,
    /Maple Street/,
    /\bSATs?\b/,
    /\bDMV\b/,
    /Thanksgiving/,
    /Fourth of July/,
    /Super Bowl/,
    /early-bird/,
    /\bER doctor\b/,
    /gym teacher/,
    /20\/20/,
    /estate taxes/,
    /Caribbean/,
  ]
  if (!loc.terms.emergencyNumber.includes('911')) out.push(/\b911\b/)
  if (!/prom/i.test(loc.terms.schoolDance)) out.push(/\bprom\b/i)
  if (!loc.snow) out.push(/blizzard|snowed in|snow day|sledding/i)
  if (!['us', 'gb', 'ie'].includes(countryId)) out.push(/\bpint\b/)
  if (!['us', 'gb', 'lr', 'mm'].includes(countryId)) out.push(/\binches\b/)
  return out
}

/** Every player-visible line produced so far: the life log and everything queued. */
function texts(g: GameState): string[] {
  const out: string[] = []
  for (const y of g.log) for (const e of y.entries) out.push(e.text)
  for (const m of g.queue) {
    if (m.kind === 'notice') out.push(m.title, m.text)
    else if (m.kind === 'choice') out.push(m.title, m.text, ...m.choices.map((c) => c.label))
    else if (m.kind === 'input') out.push(m.title, m.text)
  }
  return out
}

function expectClean(lines: string[], countryId: string): void {
  const banned = countryId === 'us' ? [] : americanisms(countryId)
  for (const line of lines) {
    expect(line, `${countryId}: ${line}`).not.toMatch(/\{\w+\}|undefined|NaN|\[object/)
    for (const re of banned) expect(line, `${countryId}: ${line}`).not.toMatch(re)
  }
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function choices(g: GameState): ChoiceModal[] {
  return g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')
}

/** A grown-up living in a country's biggest city. */
function local(countryId: string, seed: number, age: number, money = 0): GameState {
  return makeTestGame(seed, { countryId, birthCountryId: countryId, city: getCountry(countryId).cities[0], age, money })
}

function runDoctor(g: GameState, path: string[]): void {
  let nodes: MenuNode[] = doctorMenu.children(g)
  for (let i = 0; i < path.length; i++) {
    const n = nodes.find((x) => 'id' in x && x.id === path[i])
    if (!n) throw new Error(`no menu node ${path[i]}`)
    if (i === path.length - 1) (n as MenuAction).run(g)
    else nodes = (n as MenuGroup).children(g)
  }
}

/** One year of this module's yearly hooks, without the rest of the engine. */
function liveYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  yearlyHealth(g)
  yearlyMilestones(g)
  checkDeath(g)
}

describe('birth backstories', () => {
  const births: Record<string, string> = {}
  for (const id of COUNTRIES) {
    const lines: string[] = []
    for (let seed = 1; seed <= 200; seed++) {
      const g = createNewLife({ seed, countryId: id })
      expect(g.character.countryId).toBe(id)
      lines.push(...texts(g))
    }
    births[id] = lines.join('\n')
  }

  // Millions of checks (every birth now also logs that year's news line): give it room on busy CI.
  it('never puts American places or weather in a non-American birth', () => {
    for (const id of NON_US) expectClean(births[id].split('\n'), id)
    expectClean(births.us.split('\n'), 'us')
  }, 30_000)

  it('sends eloping parents somewhere local', () => {
    expect(births.us).toMatch(/eloped to Las Vegas/)
    expect(births.id).toMatch(/eloped to Bali/)
    expect(births.id).not.toMatch(/Las Vegas/)
    for (const id of NON_US) {
      const elope = births[id].match(/eloped to ([^.]+)\./)
      if (elope) expect(localeOf(id).getaways, id).toContain(elope[1])
    }
  })

  it('fills family backstories with local getaways, sports and date spots', () => {
    const met = births.in.match(/My parents met cheering for rival (\w[\w ]*) teams\./)
    if (met) expect(met[1]).toBe('cricket')
    expect(births.us + births.id + births.in + births.br).toMatch(/My parents met /)
    // Tropical countries get storms, not blizzards.
    expect(births.ng).not.toMatch(/blizzard/)
  })

  it('gives Muslim-majority families cats more often than dogs', () => {
    const pets = (id: string, species: string) => (births[id].match(new RegExp(`family ${species} named`, 'g')) ?? []).length
    expect(pets('sa', 'cat')).toBeGreaterThan(pets('sa', 'dog'))
    expect(pets('us', 'dog')).toBeGreaterThan(pets('us', 'cat'))
  })
})

describe('growing up and growing old', () => {
  it('keeps a whole life of milestones and health local', () => {
    for (const id of COUNTRIES) {
      for (let seed = 1; seed <= 4; seed++) {
        const g = createNewLife({ seed: seed * 31, countryId: id })
        g.flags.latentTalent = TALENTS[(seed * 3) % TALENTS.length].id
        g.flags.talentAge = 8
        const popups: string[] = []
        for (let age = 1; age <= 100 && g.character.alive; age++) {
          liveYear(g)
          popups.push(...texts({ ...g, log: [] }))
          g.queue = []
        }
        expectClean([...popups, ...texts(g)], id)
      }
    }
  })

  it('only congratulates you on legal drinking where alcohol is legal', () => {
    const lines = (id: string, age: number) => {
      const g = local(id, 3, age - 1)
      g.flags.puberty = true
      g.flags.sexualityRealized = true
      g.character.age = age
      yearlyMilestones(g)
      return texts(g).join(' ')
    }
    expect(lines('sa', 18)).toMatch(/officially an adult/)
    expect(lines('sa', 18)).not.toMatch(/drink/)
    expect(lines('sa', 21)).not.toMatch(/drink/)
    expect(lines('us', 21)).toMatch(/old enough to drink legally/)
    expect(lines('de', 18)).toMatch(/You can legally drink now/)
  })

  it('reveals talents in local terms', () => {
    const reveal = (id: string, talent: string) => {
      const g = local(id, 5, 8)
      g.flags.latentTalent = talent
      g.flags.talentAge = 8
      yearlyMilestones(g)
      const text = notices(g).find((n) => n.title === 'Special Talent')?.text ?? ''
      expect(text, `${id} ${talent}`).not.toBe('')
      expectClean([text], id)
      return text
    }
    for (const id of COUNTRIES) for (const t of TALENTS) reveal(id, t.id)
    expect(reveal('us', 'Athletics')).toMatch(/gym teacher.*football coach/)
    expect(reveal('us', 'Modeling')).toMatch(/at the mall/)
    expect(reveal('in', 'Athletics')).toMatch(/PE teacher.*cricket coach/)
    expect(reveal('jp', 'Athletics')).toMatch(/baseball coach/)
    expect(reveal('de', 'Modeling')).toMatch(/on a busy street in Berlin/)
    const cook = reveal('id', 'Cooking')
    expect(localeOf('id').foods.some((f) => cook.includes(f))).toBe(true)
  })

  it('remembers the right school dance and runs off somewhere local in a mid-life crisis', () => {
    const crisis = (id: string) => {
      const out: string[] = []
      for (let seed = 1; seed <= 400; seed++) {
        const g = local(id, seed, 45, 50_000)
        g.flags.puberty = true
        g.flags.sexualityRealized = true
        g.flags.adultNotice = true
        yearlyMilestones(g)
        const popup = choices(g).find((c) => c.title === 'Mid-Life Crisis')
        if (!popup) continue
        out.push(popup.text)
        g.queue = []
        runScript(g, 'life.midlife', 'splurge', popup.data, popup)
        out.push(...texts(g))
      }
      expect(out.length, id).toBeGreaterThan(4)
      expectClean(out, id)
      return out.join('\n')
    }
    const us = crisis('us')
    const de = crisis('de')
    const id = crisis('id')
    expect(us).toMatch(/your high school prom\b/)
    expect(de).toMatch(/your Abiball/)
    expect(localeOf('id').getaways.some((p) => id.includes(`trip to ${p}`))).toBe(true)
  })

  it('sends a centenarian a card from the palace in a monarchy', () => {
    const card = (id: string) => {
      const g = local(id, 1, 100)
      g.flags.puberty = true
      g.flags.sexualityRealized = true
      g.flags.adultNotice = true
      g.flags.midlifeCrisis = true
      yearlyMilestones(g)
      return notices(g).find((n) => n.title === 'Centenarian')?.text ?? ''
    }
    expect(card('gb')).toMatch(/palace/)
    expect(card('us')).toMatch(/mayor/)
  })
})

describe('the next generation', () => {
  function heirOf(id: string, age: number, occupation?: string): GameState {
    const g = local(id, 7, 45, 100_000)
    const kid = createPerson(g, { relation: 'child', age, occupation, lastName: g.character.lastName, money: 0 })
    killCharacter(g, 'Old Age')
    return continueAsChild(g, kid.id)
  }

  it("enrolls a minor heir in their country's school system with a local school name", () => {
    const us = heirOf('us', 12).character.education
    expect(us).toMatchObject({ completed: ['elementary'] })
    expect(us.current).toMatchObject({ level: 'middle', year: 2, totalYears: 3 })
    expect(us.current?.school).toMatch(/Middle School|Junior High/)

    const de = heirOf('de', 12).character.education
    expect(de.completed).toEqual(['elementary'])
    expect(de.current).toMatchObject({ level: 'middle', year: 3, totalYears: 6 })
    expect(de.current?.school).not.toBe('Berlin Middle School')

    const gb = heirOf('gb', 12).character.education
    expect(gb.completed).toEqual(['elementary'])
    expect(gb.current).toMatchObject({ level: 'high', year: 2, totalYears: 7 })

    for (const id of NON_US) {
      const n = heirOf(id, 9)
      const city = n.character.city
      expect(n.character.education.current?.school, id).not.toBe(`${city} Elementary School`)
      expectClean(texts(n), id)
    }
  })

  it('gives an adult heir local diplomas and universities', () => {
    for (const id of COUNTRIES) {
      const n = heirOf(id, 40, 'Doctor')
      const degrees = n.character.education.degrees
      expect(degrees.map((d) => d.kind), id).toEqual(['highschool', 'bachelor', 'md'])
      expect(n.character.education.completed, id).toContain('high')
      expect(degrees[2].school, id).toBe(`${degrees[1].school} School of Medicine`)
      expectClean([...degrees.map((d) => `${d.name} ${d.school}`), ...texts(n)], id)
    }
    expect(heirOf('us', 40, 'Doctor').character.education.degrees[0].name).toBe('High School Diploma')
    expect(heirOf('de', 40, 'Doctor').character.education.degrees[0].name).toBe('Gymnasium Diploma')
  })
})

describe('local health care', () => {
  it('dials the local emergency number and calls the ER the ER only in America', () => {
    const visit = (id: string) => {
      const out: string[] = []
      for (let seed = 1; seed <= 40; seed++) {
        const g = local(id, seed, 30, 1_000_000)
        contractCondition(g, 'Bronchitis', { quiet: true, diagnosed: false })
        runDoctor(g, ['doctor.er'])
        out.push(...texts(g))
      }
      expectClean(out, id)
      return out.join('\n')
    }
    const us = visit('us')
    expect(us).toMatch(/called 911/)
    expect(us).toMatch(/The ER doctor/)
    const indo = visit('id')
    expect(indo).toMatch(/called 112/)
    expect(indo).toMatch(/The doctor on duty/)
    expect(visit('gb')).toMatch(/called 999/)
    for (const id of ['et', 'jp', 'br', 'in', 'ng', 'de', 'sa', 'mx']) visit(id)
  })

  it('only pays for plasma where plasma centers pay', () => {
    const us = local('us', 2, 30)
    runDoctor(us, ['doctor.plasma'])
    expect(us.character.money).toBeGreaterThan(0)
    for (const id of ['id', 'gb', 'ng', 'jp']) {
      const g = local(id, 2, 30)
      runDoctor(g, ['doctor.plasma'])
      expect(g.character.money, id).toBe(0)
      expect(g.counters.plasmaDonations, id).toBe(1)
      expectClean(texts(g), id)
    }
  })

  it('measures eyes and blood the local way', () => {
    for (const id of COUNTRIES) {
      for (let seed = 1; seed <= 12; seed++) {
        const g = local(id, seed, 30, 100_000)
        runDoctor(g, ['doctor.optometrist'])
        runDoctor(g, ['doctor.blood'])
        expectClean(texts(g), id)
      }
    }
  })

  it('keeps malaria in the tropics and Lyme disease out of the desert', () => {
    for (const id of ['de', 'jp', 'sa', 'gb', 'us']) {
      for (let seed = 1; seed <= 150; seed++) {
        const g = local(id, seed, 20)
        for (let y = 0; y < 10; y++) liveYear(g)
        expect(g.character.conditions.some((c) => c.name === 'Malaria'), id).toBe(false)
        if (id === 'sa') expect(g.character.conditions.some((c) => c.name === 'Lyme Disease')).toBe(false)
      }
    }
  })

  it("doesn't send cravers to a bar where alcohol is banned", () => {
    const lines: string[] = []
    for (let seed = 1; seed <= 30; seed++) {
      const g = local('sa', seed, 30, 10_000)
      contractCondition(g, 'Alcoholism', { kind: 'addiction', severity: 40, quiet: true })
      for (let y = 0; y < 6; y++) liveYear(g)
      lines.push(...choices(g).map((c) => c.text))
    }
    expect(lines.length).toBeGreaterThan(5)
    for (const l of lines) expect(l).not.toMatch(/bar on the corner|casino|going out for drinks/)
  })
})

describe('unprompted events cool down', () => {
  it('lets cravings skip a year and never repeats the same line twice in a row', () => {
    let fired = 0
    for (let seed = 1; seed <= 25; seed++) {
      const g = local('us', seed, 25, 10_000)
      contractCondition(g, 'Alcoholism', { kind: 'addiction', severity: 30, quiet: true })
      let lastAge = -9
      let lastText = ''
      for (let y = 0; y < 20; y++) {
        g.queue = []
        g.character.stats.health = 90
        liveYear(g)
        const popup = choices(g).find((c) => c.title === 'Cravings')
        if (!popup) continue
        fired++
        expect(g.character.age - lastAge).toBeGreaterThanOrEqual(2)
        expect(popup.text).not.toBe(lastText)
        lastAge = g.character.age
        lastText = popup.text
      }
    }
    expect(fired).toBeGreaterThan(20)
  })

  it('offers an old habit back at most every four years', () => {
    let fired = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = local('br', seed, 30, 10_000)
      g.flags.recoveredAddictions = ['Alcoholism']
      g.flags.knownAddictions = []
      let lastAge = -99
      for (let y = 0; y < 40; y++) {
        g.queue = []
        g.character.stats.health = 90
        liveYear(g)
        if (!choices(g).some((c) => c.title === 'Old Habits')) continue
        fired++
        expect(g.character.age - lastAge).toBeGreaterThanOrEqual(4)
        lastAge = g.character.age
      }
    }
    expect(fired).toBeGreaterThan(3)
  })

  it('never repeats a talent hint', () => {
    let total = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = local('id', seed, 1)
      g.flags.latentTalent = 'Art'
      g.flags.talentAge = 12
      const hints = TALENTS.find((t) => t.id === 'Art')?.hints ?? []
      const logged: { age: number; text: string }[] = []
      for (let age = 2; age < 12; age++) {
        g.character.age = age
        yearlyMilestones(g)
        const year = g.log.find((y) => y.age === age)
        for (const e of year?.entries ?? []) if (hints.includes(e.text)) logged.push({ age, text: e.text })
      }
      const lines = logged.map((l) => l.text)
      total += lines.length
      expect(new Set(lines).size).toBe(lines.length)
      for (let i = 1; i < logged.length; i++) expect(logged[i].age - logged[i - 1].age).toBeGreaterThanOrEqual(2)
    }
    expect(total).toBeGreaterThan(20)
  })

  it("doesn't warn about poor health every year it dips", () => {
    const g = local('jp', 4, 84)
    let warnings = 0
    for (let y = 0; y < 6; y++) {
      g.queue = []
      g.character.stats.health = y % 2 === 0 ? 14 : 45
      g.character.age += 1
      yearlyHealth(g)
      if (notices(g).some((n) => n.title === 'Feeling Weak')) warnings++
    }
    expect(warnings).toBe(2)
  })
})

describe('local neighbors', () => {
  it('fills poorer countries with local trades and keeps them out of the American job mix', () => {
    const jobs = (id: string) => {
      const g = local(id, 9, 30)
      for (let i = 0; i < 300; i++) createPerson(g, { relation: 'friend', age: 35 })
      return g.people.map((p) => p.occupation)
    }
    const trades = ['Market Vendor', 'Street Food Vendor', 'Tailor', 'Motorcycle Taxi Driver']
    expect(jobs('ng').some((j) => trades.includes(j))).toBe(true)
    expect(jobs('us').some((j) => trades.includes(j))).toBe(false)
  })
})
