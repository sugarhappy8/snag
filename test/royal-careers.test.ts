import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { npcLife, saveNpcLife } from '../src/game/npc-state'
import { initializeNpc, npcCompany, refreshRoyalCareers, startNpcCompany, yearlyNpcLife } from '../src/game/npc-lives'
import { royalAppointment } from '../src/game/royal-careers'
import { markRoyalFamily, royalRule, royalStatus, yearlyRoyalty } from '../src/game/royalty'
import { loadGame, saveGame } from '../src/game/save'
import { typicalIncome } from '../src/game/events/wealth-core'
import type { GameState, Gender, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

afterEach(() => vi.unstubAllGlobals())

function court(country = 'ae', year = 2026, gender: Gender = 'male') {
  const g = makeTestGame(52, { countryId: country, birthCountryId: country, age: 20 })
  g.year = year
  const p = createPerson(g, { relation: 'parent', gender, age: 45, occupation: 'Railway Worker', money: 200000, stats: { smarts: 85 }, livesWithPlayer: true,
    data: { countryId: country, royalCountry: country, royalHouse: royalRule(country, year)!.house, royalTerritory: country === 'ae' ? 'Dubai' : '' } })
  const l = initializeNpc(g, p)
  l.education = 3; l.experience = 17; l.skill = 70; l.field = 'Finance'; l.achievements = ["Bachelor's in Finance", "Master's in Finance", 'Doctorate in Finance']
  saveNpcLife(p, l)
  return { g, p, l }
}

function appointed(id: string, country = 'ae', year = 2026, gender: Gender = 'male') {
  const f = court(country, year, gender)
  for (let i = 0; i < 100; i++) {
    f.p.id = `royal-${i}`
    if (royalAppointment(f.g, f.p, f.l)?.id === id) return f
  }
  throw new Error(`No eligible ${id} fixture`)
}

describe('country-appropriate royal family careers', () => {
  it('gives both parents royal appointments and consistent birth descriptions, including distant branches', () => {
    const titles = new Set<string>()
    let distant = 0
    for (let seed = 1; seed <= 24; seed++) {
      const g = createNewLife({ seed, countryId: 'ae', year: 2026, royalty: 'royal' })
      if (royalStatus(g)!.rank === 'extended') distant++
      for (const p of g.people.filter(p => p.relation === 'parent')) {
        expect(p.data.royalAppointment, `seed ${seed}: ${p.occupation}`).toBeDefined()
        expect(p.occupation).not.toMatch(/Railway Worker|Homemaker|Casual Laborer|Unemployed/)
        expect(g.log.flatMap(y => y.entries).some(e => e.text.includes(`${p.age} year old ${p.occupation}`))).toBe(true)
        expect(npcLife(p)!.employer).not.toBe('')
        titles.add(p.occupation)
      }
      expect(g.character.money).toBe(0)
    }
    expect(distant).toBeGreaterThan(0)
    expect([...titles].some(t => /Minist/.test(t))).toBe(true)
    expect(titles.size).toBeGreaterThan(5)
  }, 30000)

  it.each(['gb', 'jp', 'sa', 'ma', 'my'])('uses royal roles, not ordinary job rolls, in %s', countryId => {
    const g = createNewLife({ seed: 18, countryId, year: 2026, royalty: 'royal' })
    for (const p of g.people.filter(p => p.relation === 'parent')) {
      expect(p.data.royalAppointment).toBeDefined()
      for (let n = 0; n < 3; n++) { g.year++; p.age++; yearlyNpcLife(g, p); expect(p.data.royalAppointment).toBeDefined() }
      expect(p.occupation).not.toMatch(/Railway Worker|Homemaker|Unemployed/)
      if (countryId === 'gb' || countryId === 'jp') expect(p.occupation).not.toMatch(/Minister|Government Adviser/)
    }
  })

  it('keeps UAE ministries and universities behind their historical boundaries', () => {
    const minister = appointed('minister'), dean = appointed('dean')
    minister.g.year = 1970
    expect(royalAppointment(minister.g, minister.p, minister.l)!.title).not.toMatch(/Minist|University/)
    minister.g.year = 1971
    expect(royalAppointment(minister.g, minister.p, minister.l)!.title).toBe('Minister of Finance')
    dean.g.year = 1975
    expect(royalAppointment(dean.g, dean.p, dean.l)!.title).not.toMatch(/University/)
    dean.g.year = 1976
    expect(royalAppointment(dean.g, dean.p, dean.l)!.title).toBe('University Dean of Finance')
    const woman = appointed('minister', 'ae', 2026, 'female')
    woman.g.year = 2003
    expect(royalAppointment(woman.g, woman.p, woman.l)!.title).not.toMatch(/Minist/)
    woman.g.year = 2004
    expect(royalAppointment(woman.g, woman.p, woman.l)!.id).toBe('minister')
  })

  it('requires qualifications, experience and adulthood for senior posts', () => {
    const { g, p, l } = appointed('dean')
    l.education = 0
    expect(royalAppointment(g, p, l)!.id).not.toBe('dean')
    l.education = 3; l.experience = 0
    expect(royalAppointment(g, p, l)!.id).not.toBe('dean')
    l.experience = 17; p.age = 13
    expect(royalAppointment(g, p, l)).toMatchObject({ id: 'school', pay: 0 })
    const minister = appointed('minister'); minister.p.age = 22
    expect(royalAppointment(minister.g, minister.p, minister.l)!.id).not.toBe('minister')
    minister.p.age = 45; minister.l.education = 0
    expect(royalAppointment(minister.g, minister.p, minister.l)!.id).not.toBe('minister')
  })

  it('keeps roles year to year, pays once and never credits the player with their salary', () => {
    const { g, p } = appointed('minister')
    const cash = g.character.money
    yearlyNpcLife(g, p)
    expect(p.occupation).toBe('Minister of Finance')
    expect(npcLife(p)!.income).toBeCloseTo(typicalIncome(g, 'ae') * 3)
    expect(g.character.money).toBe(cash)
    const once = structuredClone(g); yearlyNpcLife(g, p); expect(g).toEqual(once)
    g.year++; p.age++; yearlyNpcLife(g, p)
    expect(p.occupation).toBe('Minister of Finance')
    expect(npcLife(p)!.experience).toBe(19)
  })

  it('lets royal students earn degrees over real years, then progress into academic appointments', () => {
    const { g, p, l } = appointed('dean')
    p.age = 18; p.occupation = 'Royal Student'; l.education = 0; l.experience = 0; l.study = 0; l.achievements = []
    saveNpcLife(p, l)
    for (let n = 0; n < 4; n++) { yearlyNpcLife(g, p); g.year++; p.age++ }
    expect(npcLife(p)!.education).toBe(1)
    for (let n = 0; n < 6; n++) { yearlyNpcLife(g, p); g.year++; p.age++ }
    expect(npcLife(p)!.education).toBe(3)
    expect(npcLife(p)!.achievements).toEqual(["Bachelor's in Finance", "Master's in Finance", 'Doctorate in Finance'])
    expect(p.occupation).toMatch(/University Lecturer/)
    for (let n = 0; n < 9; n++) { yearlyNpcLife(g, p); g.year++; p.age++ }
    expect(p.occupation).toBe('University Dean of Finance')
  })

  it('retires non-sovereigns into patronage without laying off the ruler', () => {
    const { g, p } = appointed('minister')
    p.age = 70; yearlyNpcLife(g, p)
    expect(p.occupation).toBe('Retired Royal Patron')
    expect(npcLife(p)!.income).toBeCloseTo(typicalIncome(g, 'ae') * .3)
    p.data.royalSovereign = true; p.data.royalRole = 'Ruling Sheikh'; g.year++
    yearlyNpcLife(g, p); expect(p.occupation).toBe('Ruling Sheikh')
  })

  it('ends official jobs after abolition and withholds domestic pay abroad', () => {
    const { g, p } = court('np', 2007)
    yearlyNpcLife(g, p); expect(p.data.royalAppointment).toBeDefined()
    g.year = 2008; refreshRoyalCareers(g)
    expect(p.data.royalAppointment).toBeUndefined()
    expect(npcLife(p)!.income).toBe(0)
    expect(p.occupation).toBe('Unemployed')
    const away = appointed('minister'); away.p.data.countryId = 'gb'
    yearlyNpcLife(away.g, away.p)
    expect(away.p.occupation).toBe('Royal Family Representative Abroad')
    expect(npcLife(away.p)!.income).toBe(0)
  })

  it('honors explicit company hiring and does not pay a second salary', () => {
    const { g, p } = appointed('minister')
    p.data.nepo = { assetId: 'boss', title: 'Finance Director', rank: 3, pay: 100000 }
    p.occupation = 'Finance Director'
    const cash = p.money
    refreshRoyalCareers(g); yearlyNpcLife(g, p)
    expect(p.occupation).toBe('Finance Director')
    expect(p.data.royalAppointment).toBeUndefined()
    expect(p.money).toBe(cash)
  })

  it('keeps a privately owned company separate from official employment and pay', () => {
    const { g, p } = appointed('minister'); p.money = 5000000
    expect(startNpcCompany(g, p, 'cafe')).toBe(true)
    refreshRoyalCareers(g); g.year++
    yearlyNpcLife(g, p)
    expect(p.occupation).toBe('Minister of Finance')
    expect(npcLife(p)!.employer).toBe('Ministry of Finance')
    expect(npcLife(p)!.income).toBeCloseTo(typicalIncome(g, 'ae') * 3)
    expect(npcCompany(p, g.year)!.b.last!.ownerPay).toBe(0)
  })

  it('marks biological royal children but not adopted or unrelated step-family', () => {
    const g = createNewLife({ seed: 5, countryId: 'ae', gender: 'male', year: 2026, royalty: 'royal' })
    g.character.age = 30; g.year += 30
    const child = createPerson(g, { relation: 'child', age: 5, biological: true })
    const adopted = createPerson(g, { relation: 'child', age: 5, biological: false })
    const step = createPerson(g, { relation: 'stepparent', age: 60 })
    yearlyRoyalty(g); markRoyalFamily(g); refreshRoyalCareers(g)
    expect(child.data.royalCountry).toBe('ae')
    expect(child.occupation).toBe('Royal Student')
    expect(npcLife(child)!.income).toBe(0)
    expect(adopted.data.royalHouse).toBeUndefined()
    expect(step.data.royalHouse).toBeUndefined()
  })

  it('upgrades old saves on load without cash, qualification, asset or RNG changes', () => {
    const g = createNewLife({ seed: 7, countryId: 'ae', year: 2026, royalty: 'royal' })
    for (const p of g.people) {
      delete p.data.royalAppointment
      delete p.data.royalCountry
      if (p.relation === 'parent' && p.gender === 'male') { p.occupation = 'Railway Worker'; p.data.royalSovereign = false }
      else { delete p.data.royalHouse; p.occupation = p.relation === 'parent' ? 'Homemaker' : p.occupation }
      if (p.relation === 'parent') {
        for (const entry of g.log[0].entries) if (entry.text.startsWith(`My ${p.gender === 'male' ? 'father' : 'mother'} is `)) entry.text = `My ${p.gender === 'male' ? 'father' : 'mother'} is ${p.firstName} ${p.lastName}, a ${p.age} year old ${p.occupation}.`
      }
    }
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
    expect(saveGame(g)).toBe(true)
    const loaded = loadGame()!
    expect(loaded).not.toBeNull()
    for (const p of loaded.people.filter(p => p.relation === 'parent')) {
      const old = g.people.find(x => x.id === p.id)!
      expect(p.data.royalAppointment).toBeDefined()
      expect(p.occupation).not.toMatch(/Railway Worker|Homemaker/)
      expect(p.money).toBe(old.money)
      expect(npcLife(p)!.education).toBe(npcLife(old)!.education)
      expect(loaded.log[0].entries.some(e => e.text.includes(`${p.age} year old ${p.occupation}`))).toBe(true)
    }
    expect(loaded.rng).toBe(g.rng)
    expect(loaded.character).toEqual(g.character)
    expect(loaded.assets).toEqual(g.assets)
    const once = structuredClone(loaded); refreshRoyalCareers(loaded); expect(loaded).toEqual(once)
    saveGame(loaded); expect(loadGame()).toEqual(loaded)
    const corrupt = { ...g, people: 'bad' } as unknown as GameState
    store.set('anotherlife.save.v1', JSON.stringify(corrupt)); expect(loadGame()).toBeNull()
  })

  it('can upgrade a distant branch after succession cleared the original parent pointer', () => {
    const g = createNewLife({ seed: 7, countryId: 'ae', year: 2026, royalty: 'royal' })
    const r = royalStatus(g)!; r.parentId = ''; r.rank = 'extended'; g.flags.royalty = r as unknown as Json
    const mother = g.people.find(p => p.relation === 'parent' && p.gender === 'female')!
    delete mother.data.royalHouse; delete mother.data.royalCountry; delete mother.data.royalAppointment
    mother.occupation = 'Homemaker'
    refreshRoyalCareers(g)
    expect(mother.data.royalAppointment).toBeDefined()
    expect(mother.occupation).not.toBe('Homemaker')
  })

  it('does not fabricate a degree for a legacy royal with no durable career record', () => {
    const { g, p } = appointed('dean')
    delete p.data.life
    p.occupation = 'Professor'
    const money = p.money, rng = g.rng
    refreshRoyalCareers(g)
    expect(npcLife(p)!.education).toBe(0)
    expect(npcLife(p)!.achievements).toEqual([])
    expect(p.occupation).not.toMatch(/Dean|Professor/)
    expect(p.money).toBe(money); expect(g.rng).toBe(rng)
  })

  it('does not alter ordinary lives or award titles to an unrelated family', () => {
    const g = createNewLife({ seed: 8, countryId: 'ae', royalty: 'nonRoyal' })
    const copy = structuredClone(g)
    refreshRoyalCareers(g); expect(g).toEqual(copy)
    g.flags.royalty = { country: 'ae', house: 'Al Maktoum', parentId: 'absent' } as Json
    markRoyalFamily(g)
    expect(g.people.every(p => !p.data.royalHouse)).toBe(true)
  })
})
