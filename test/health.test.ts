import { describe, expect, it } from 'vitest'
import { checkDeath, conditionLabel, contractCondition, DISEASES, doctorMenu, getDiseaseDef, healthTarget, oldAgeHazard, yearlyHealth } from '../src/game/health'
import { createPerson } from '../src/game/people'
import { computeRibbon, getRibbon, RIBBONS } from '../src/game/ribbons'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

function node(nodes: MenuNode[], id: string): MenuNode {
  const n = nodes.find((x) => 'id' in x && x.id === id)
  if (!n) throw new Error(`no menu node ${id}`)
  return n
}

function doctorChildren(g: GameState): MenuNode[] {
  return doctorMenu.children(g)
}

function runAction(g: GameState, path: string[]): void {
  let nodes = doctorChildren(g)
  for (let i = 0; i < path.length; i++) {
    const n = node(nodes, path[i])
    if (i === path.length - 1) {
      const a = n as MenuAction
      expect(a.disabledReason?.(g) ?? null).toBeNull()
      a.run(g)
    } else nodes = (n as MenuGroup).children(g)
  }
}

function lastChoice(g: GameState): ChoiceModal {
  const m = [...g.queue].reverse().find((x): x is ChoiceModal => x.kind === 'choice')
  if (!m) throw new Error('no choice in queue')
  return m
}

function noticeTitles(g: GameState): string[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice').map((m) => m.title)
}

describe('disease catalog', () => {
  it('has sane, unique definitions', () => {
    const names = new Set<string>()
    for (const d of DISEASES) {
      expect(names.has(d.name)).toBe(false)
      names.add(d.name)
      expect(d.sev[0]).toBeLessThanOrEqual(d.sev[1])
      expect(d.cure).toBeGreaterThanOrEqual(0)
      expect(d.cure).toBeLessThanOrEqual(1)
      expect(d.symptoms.length).toBeGreaterThan(0)
      expect(d.ages[0]).toBeLessThanOrEqual(d.ages[1])
    }
    expect(DISEASES.length).toBeGreaterThan(60)
    expect(getDiseaseDef('pancreatic cancer')?.deadly).toBe('Pancreatic Cancer')
  })

  it('lowercases condition names for prose but keeps proper nouns', () => {
    expect(conditionLabel('Common Cold')).toBe('common cold')
    expect(conditionLabel("Alzheimer's Disease")).toBe("Alzheimer's disease")
    expect(conditionLabel('HIV')).toBe('HIV')
    expect(conditionLabel('Hepatitis C')).toBe('hepatitis C')
  })
})

describe('yearlyHealth', () => {
  it('keeps state plain JSON and stats in range over a long life', () => {
    const g = makeTestGame(21, { age: 0 })
    for (let age = 1; age <= 90 && g.character.alive; age++) {
      g.character.age = age
      g.yearActions = {}
      yearlyHealth(g)
      for (const m of g.queue) {
        if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[0].id, m.data, m)
      }
      g.queue = g.queue.filter((m) => m.kind !== 'choice')
      for (const v of Object.values(g.character.stats)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
    expect(g.counters.diseases ?? 0).toBeGreaterThan(0)
  })

  it('makes health decline in old age', () => {
    let total = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = makeTestGame(seed, { age: 85, stats: { happiness: 70, health: 80, smarts: 60, looks: 50 } })
      g.character.conditions = []
      for (let i = 0; i < 5; i++) {
        g.character.age++
        yearlyHealth(g)
      }
      total += g.character.stats.health
    }
    expect(total / 20).toBeLessThan(60)
    expect(healthTarget(30)).toBeGreaterThan(healthTarget(70))
  })

  it('hurts health with untreated serious illness', () => {
    const g = makeTestGame(3, { age: 40 })
    contractCondition(g, 'Lung Cancer', { severity: 60 })
    const before = g.character.stats.health
    g.character.age++
    yearlyHealth(g)
    expect(g.character.stats.health).toBeLessThan(before - 10)
    expect(g.character.conditions.find((c) => c.name === 'Lung Cancer')!.severity).toBeGreaterThan(60)
  })

  it('announces hidden illnesses with a symptoms popup', () => {
    const g = makeTestGame(3, { age: 40 })
    const cond = contractCondition(g, 'Lung Cancer')!
    expect(cond.diagnosed).toBe(false)
    const popup = lastChoice(g)
    expect(popup.scriptId).toBe('health.symptoms')
    expect(popup.text).toContain('feeling sick lately')
    g.queue = []
    runScript(g, 'health.symptoms', 'web', popup.data, popup)
    expect(noticeTitles(g)).toEqual(['Internet Diagnosis'])
    expect(cond.diagnosed).toBe(false)
  })

  it('makes addictions hurt and offers a craving choice', () => {
    const g = makeTestGame(5, { age: 30 })
    g.character.conditions.push({ id: 'a1', name: 'Alcohol Addiction', kind: 'addiction', severity: 50, yearsHad: 0, curable: true, diagnosed: true, age: 25 })
    const health = g.character.stats.health
    let sawCraving = false
    for (let i = 0; i < 6; i++) {
      g.character.age++
      yearlyHealth(g)
      const crave = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'health.addiction.craving')
      if (crave) {
        sawCraving = true
        runScript(g, 'health.addiction.craving', 'giveIn', crave.data, crave)
      }
      g.queue = []
    }
    expect(sawCraving).toBe(true)
    expect(g.character.stats.health).toBeLessThan(health)
  })

  it('remembers addictions cured elsewhere so they can relapse', () => {
    const g = makeTestGame(5, { age: 30 })
    g.character.conditions.push({ id: 'a1', name: 'Cocaine Addiction', kind: 'addiction', severity: 50, yearsHad: 0, curable: true, diagnosed: true, age: 25 })
    yearlyHealth(g)
    g.queue = []
    g.character.conditions = g.character.conditions.filter((c) => c.kind !== 'addiction') // rehab
    yearlyHealth(g)
    expect(g.flags.recoveredAddictions).toEqual(['Cocaine Addiction'])
    runScript(g, 'health.addiction.relapse', 'giveIn', { name: 'Cocaine Addiction' }, { kind: 'notice', id: 'x', title: '', text: '' })
    expect(g.character.conditions.some((c) => c.name === 'Cocaine Addiction')).toBe(true)
    expect(g.flags.recoveredAddictions).toEqual([])
  })

  it('has parents take babies to the doctor', () => {
    const g = makeTestGame(2, { age: 2 })
    createPerson(g, { relation: 'parent', age: 30, gender: 'female' })
    contractCondition(g, 'Measles', { quiet: true })
    for (let i = 0; i < 3; i++) yearlyHealth(g)
    expect(g.character.conditions.some((c) => c.name === 'Measles')).toBe(false)
  })

  it('does nothing for the dead', () => {
    const g = makeTestGame(1, { age: 50, alive: false })
    const before = JSON.stringify(g)
    yearlyHealth(g)
    checkDeath(g)
    expect(JSON.stringify(g)).toBe(before)
  })
})

describe('checkDeath', () => {
  it('kills at health 0 with the worst condition as the cause', () => {
    const g = makeTestGame(1, { age: 50 })
    contractCondition(g, 'Pancreatic Cancer', { quiet: true, severity: 80 })
    contractCondition(g, 'Common Cold', { quiet: true })
    g.character.stats.health = 0
    checkDeath(g)
    expect(g.character.alive).toBe(false)
    expect(g.character.causeOfDeath).toBe('Pancreatic Cancer')
    expect(g.ribbon).toBeTruthy()
    expect(g.queue.some((m) => m.kind === 'aiTask' && m.task.type === 'obituary')).toBe(true)
  })

  it('uses a generic cause when nothing is wrong', () => {
    const old = makeTestGame(1, { age: 88 })
    old.character.stats.health = 0
    checkDeath(old)
    expect(old.character.causeOfDeath).toBe('Old Age')
    const young = makeTestGame(1, { age: 30 })
    young.character.stats.health = 0
    checkDeath(young)
    expect(young.character.alive).toBe(false)
    expect(young.character.causeOfDeath).toMatch(/^[A-Z]/)
  })

  it('rarely kills healthy young people and usually kills the very old', () => {
    let youngDeaths = 0
    let oldDeaths = 0
    for (let seed = 1; seed <= 300; seed++) {
      const y = makeTestGame(seed, { age: 25 })
      checkDeath(y)
      if (!y.character.alive) youngDeaths++
      const o = makeTestGame(seed, { age: 99, stats: { happiness: 50, health: 30, smarts: 50, looks: 50 } })
      checkDeath(o)
      if (!o.character.alive) oldDeaths++
    }
    expect(youngDeaths).toBeLessThanOrEqual(1)
    expect(oldDeaths).toBeGreaterThan(80)
  })

  it('has an old-age hazard that rises with age and falls with health', () => {
    expect(oldAgeHazard(40, 80, 80)).toBe(0)
    expect(oldAgeHazard(75, 80, 80)).toBeLessThan(oldAgeHazard(85, 80, 80))
    expect(oldAgeHazard(85, 90, 80)).toBeLessThan(oldAgeHazard(85, 20, 80))
    expect(oldAgeHazard(130, 0, 0)).toBeLessThanOrEqual(0.9)
  })
})

describe('doctorMenu', () => {
  it('diagnoses hidden conditions and treats them for a fee', () => {
    const g = makeTestGame(4, { age: 30, money: 100_000 })
    const cond = contractCondition(g, 'Bronchitis', { quiet: true })!
    expect(cond.diagnosed).toBe(false)
    runAction(g, ['doctor.medical', 'doctor.medical.0'])
    expect(cond.diagnosed).toBe(true)
    expect(g.counters.doctorVisits).toBe(1)
    const popup = lastChoice(g)
    expect(popup.scriptId).toBe('health.doctor.treat')
    expect(popup.choices.map((c) => c.id)).toEqual([cond.id, 'leave'])
    const afterConsult = g.character.money
    expect(afterConsult).toBeLessThan(100_000)
    g.queue = []
    runScript(g, 'health.doctor.treat', cond.id, popup.data, popup)
    expect(g.character.money).toBeLessThan(afterConsult)
    expect(['Cured', 'Treatment Failed']).toContain(noticeTitles(g)[0])
  })

  it('cures easy illnesses most of the time', () => {
    let cured = 0
    for (let seed = 1; seed <= 40; seed++) {
      const g = makeTestGame(seed, { age: 30, money: 100_000 })
      const cond = contractCondition(g, 'Flu', { quiet: true })!
      runAction(g, ['doctor.medical', 'doctor.medical.1'])
      const popup = lastChoice(g)
      runScript(g, 'health.doctor.treat', cond.id, popup.data, popup)
      if (!g.character.conditions.some((c) => c.id === cond.id)) cured++
    }
    expect(cured).toBeGreaterThan(25)
  })

  it("won't let you spend money you don't have", () => {
    const g = makeTestGame(4, { age: 30, money: 0 })
    contractCondition(g, 'Bronchitis', { quiet: true })
    runAction(g, ['doctor.medical', 'doctor.medical.0'])
    expect(noticeTitles(g)).toEqual(["Can't Afford It"])
    expect(g.counters.doctorVisits ?? 0).toBe(0)
    expect(g.character.money).toBe(0)
  })

  it('is free for kids and in countries with public healthcare', () => {
    const kid = makeTestGame(4, { age: 10, money: 0 })
    contractCondition(kid, 'Tonsillitis', { quiet: true })
    runAction(kid, ['doctor.medical', 'doctor.medical.0'])
    expect(lastChoice(kid).scriptId).toBe('health.doctor.treat')
    expect(lastChoice(kid).choices[0].label).toContain('free')
    const brit = makeTestGame(4, { age: 30, money: 0, countryId: 'gb' })
    contractCondition(brit, 'Tonsillitis', { quiet: true })
    runAction(brit, ['doctor.medical', 'doctor.medical.0'])
    const popup = lastChoice(brit)
    runScript(brit, 'health.doctor.treat', popup.choices[0].id, popup.data, popup)
    expect(brit.character.money).toBe(0)
  })

  it('limits visits per year', () => {
    const g = makeTestGame(4, { age: 30, money: 100_000 })
    for (let i = 0; i < 4; i++) runAction(g, ['doctor.medical', 'doctor.medical.0'])
    g.queue = []
    runAction(g, ['doctor.medical', 'doctor.medical.0'])
    expect(g.counters.doctorVisits).toBe(4)
    expect(noticeTitles(g)).toEqual(['Doctor'])
  })

  it('respects age gates and prison', () => {
    const kid = makeTestGame(1, { age: 10 })
    const kids = doctorChildren(kid)
    expect((node(kids, 'doctor.witch') as MenuAction).disabledReason!(kid)).toMatch(/18/)
    expect((node(kids, 'doctor.alternative') as MenuGroup).disabledReason!(kid)).toMatch(/18/)
    const baby = makeTestGame(1, { age: 2 })
    expect(doctorMenu.disabledReason!(baby)).toBeTruthy()
    const con = makeTestGame(1, { age: 30, prison: { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 3, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 } })
    expect(doctorChildren(con).map((n) => ('id' in n ? n.id : ''))).toEqual(['doctor.prison'])
    const dead = makeTestGame(1, { age: 30, alive: false })
    expect(doctorMenu.visible!(dead)).toBe(false)
  })

  it('runs every adult service without errors', () => {
    const g = makeTestGame(6, { age: 40, money: 1_000_000 })
    contractCondition(g, 'Depression', { quiet: true })
    contractCondition(g, 'Arthritis', { quiet: true })
    g.flags.eyesight = 'poor'
    const paths = [
      ['doctor.alternative', 'doctor.alternative.acupuncture'],
      ['doctor.alternative', 'doctor.alternative.chiropractic'],
      ['doctor.alternative', 'doctor.alternative.colon'],
      ['doctor.alternative', 'doctor.alternative.homeopathy'],
      ['doctor.blood'],
      ['doctor.plasma'],
      ['doctor.er'],
      ['doctor.psychiatrist', 'doctor.psychiatrist.counseling'],
      ['doctor.psychiatrist', 'doctor.psychiatrist.shock'],
      ['doctor.optometrist'],
    ]
    for (const p of paths) {
      if (!g.character.alive) break
      runAction(g, p)
    }
    const glasses = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'health.glasses')
    expect(glasses).toBeDefined()
    runScript(g, 'health.glasses', 'contacts', glasses!.data, glasses!)
    expect(g.flags.eyewear).toBe('Contact lenses')
    expect(g.character.money).toBeLessThan(1_000_000)
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })

  it('the witch doctor is a real gamble', () => {
    const causes = new Set<string>()
    let cures = 0
    for (let seed = 1; seed <= 300; seed++) {
      const g = makeTestGame(seed, { age: 40, money: 10_000 })
      contractCondition(g, 'Migraines', { quiet: true })
      runAction(g, ['doctor.witch'])
      if (!g.character.alive) causes.add(g.character.causeOfDeath!)
      else if (g.character.conditions.length === 0) cures++
    }
    expect([...causes]).toEqual(['Witch Doctor Poisoning'])
    expect(cures).toBeGreaterThan(10)
  })
})

describe('ribbons', () => {
  function dead(overrides: Parameters<typeof makeTestGame>[1] = {}, cause = 'Old Age'): GameState {
    const g = makeTestGame(1, { age: 70, alive: false, causeOfDeath: cause, ...overrides })
    g.counters.jobs = 1
    return g
  }

  it('lists 40 unique ribbons, four of them secret', () => {
    expect(RIBBONS).toHaveLength(40)
    expect(new Set(RIBBONS.map((r) => r.id)).size).toBe(40)
    expect(RIBBONS.filter((r) => r.secret)).toHaveLength(4)
    for (const r of RIBBONS) {
      expect(r.name).not.toMatch(/bitlife|bitizen|candywriter|god mode/i)
      expect(r.description).not.toMatch(/bitlife|bitizen|candywriter|god mode/i)
      expect(getRibbon(r.id)).toBe(r)
    }
    expect(getRibbon('nope')).toBeUndefined()
  })

  it('always returns a valid ribbon', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = makeTestGame(seed, { age: seed * 5, alive: false, causeOfDeath: 'Old Age' })
      const id = computeRibbon(g)
      expect(id && getRibbon(id)).toBeTruthy()
    }
    expect(computeRibbon(dead())).toBe('mediocre')
  })

  it('picks fitting ribbons for distinctive lives', () => {
    expect(computeRibbon(dead({ age: 24 }, 'Lung Cancer'))).toBe('unlucky')
    expect(computeRibbon(dead({ money: 30_000_000 }))).toBe('loaded')
    expect(computeRibbon(dead({ money: 3_000_000 }))).toBe('rich')
    expect(computeRibbon(dead({ age: 121 }))).toBe('geriatric')
    expect(computeRibbon(dead({ age: 30 }, 'Suicide'))).toBe('wasteful')
    expect(computeRibbon(dead({ age: 30 }, 'Drug Overdose'))).toBe('stupid')
    const academic = dead()
    academic.character.education.degrees.push({ kind: 'master', name: "Master's in History", school: 'U', age: 25 })
    expect(computeRibbon(academic)).toBe('academic')
    const lazy = dead({ age: 60 })
    lazy.counters = {}
    expect(computeRibbon(lazy)).toBe('lazy')
    const killer = dead()
    killer.counters.murders = 6
    expect(computeRibbon(killer)).toBe('deadly')
    const con = dead()
    con.counters.prisonYears = 8
    con.counters.convictions = 1
    expect(computeRibbon(con)).toBe('scandalous')
    const repeat = dead()
    repeat.counters.convictions = 2
    repeat.counters.prisonYears = 3
    expect(computeRibbon(repeat)).toBe('jailbird')
    const addict = dead()
    for (const name of ['Alcohol Addiction', 'Gambling Addiction']) {
      addict.character.conditions.push({ id: name, name, kind: 'addiction', severity: 50, yearsHad: 5, curable: true, diagnosed: true, age: 30 })
    }
    expect(computeRibbon(addict)).toBe('addict')
    const party = dead()
    party.counters.nightlife = 15
    expect(computeRibbon(party)).toBe('rowdy')
    const fertile = dead()
    for (let i = 0; i < 8; i++) createPerson(fertile, { relation: 'child', age: 30 })
    expect(computeRibbon(fertile)).toBe('fertile')
    const star = dead()
    star.character.hidden.fame = 80
    expect(computeRibbon(star)).toBe('famous')
    const good = dead({ money: 400_000 })
    good.character.hidden.karma = 70
    expect(computeRibbon(good)).toBe('successful')
  })
})
