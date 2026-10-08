// Main Character Syndrome mastery (mastery.ts): the first time a main character does, learns or
// practices a thing it is mastered (to the top of its scale, or the practical top at that age and
// body). Nothing is mastered without doing it, other lives are untouched, luck is not skill.
import { describe, expect, it } from 'vitest'
import { craftSkill, creativeMenu } from '../src/game/activities/creative'
import { licensesMenu } from '../src/game/activities/licenses'
import { martialArtsMenu, styleProgress } from '../src/game/activities/martialArts'
import { instrumentSkill, mindBodyMenu } from '../src/game/activities/mindBody'
import { hireForJob } from '../src/game/careers'
import { codingCeiling, codingSkill, languageLevel } from '../src/game/computer/skills'
import { practice } from '../src/game/computer/dev-learn'
import { cvEntries, cvMenu } from '../src/game/cv'
import { createNewLife } from '../src/game/life'
import { lotteryMenu, settleBlackjack, slotPayout, slotRtp } from '../src/game/gambling'
import { markup } from '../src/game/computer/money-options'
import { createPerson } from '../src/game/people'
import { hasTalent } from '../src/game/talents'
import { anachronismsIn } from '../src/game/events/era'
import {
  ageCeiling,
  allMasteryTexts,
  bodyCeiling,
  crowdedField,
  experienceCap,
  isMastered,
  keepsSkill,
  liftSkill,
  masterFirstTime,
  masteredCount,
  masteredKeys,
  masteryCap,
  masteryLine,
  yearlyMainCharacter,
} from '../src/game/mastery'
import { ageUp } from '../src/game/aging'
import { runScript } from '../src/game/scripts'
import { flagSkill, masterInstrument } from '../src/game/special/common'
import type { ChoiceModal, GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

function life(age: number, main = true, seed = 11, extra: Record<string, unknown> = {}): GameState {
  const g = makeTestGame(seed, { age, money: 5_000_000, talents: main ? ['MainCharacter'] : undefined, ...extra })
  g.log = [{ age, year: 2026, entries: [] }]
  return g
}

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 6) return undefined
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function run(g: GameState, nodes: MenuNode[], id: string, input?: string): void {
  const n = findNode(g, nodes, id)
  if (!n || n.type !== 'action') throw new Error(`action ${id} not found`)
  const why = n.disabledReason?.(g)
  if (why) throw new Error(`action ${id} is disabled: ${why}`)
  ;(n as MenuAction).run(g, input)
}

function answer(g: GameState, choiceId: string): ChoiceModal {
  for (;;) {
    const m = g.queue.shift()
    if (!m) throw new Error('no choice in the queue')
    if (m.kind !== 'choice') continue
    const before = g.queue.length
    runScript(g, m.scriptId!, choiceId, m.data, m)
    g.queue.unshift(...g.queue.splice(before))
    return m
  }
}

const lines = (g: GameState) => g.log.flatMap((y) => y.entries.map((e) => e.text))
const momentPopups = (g: GameState) => g.queue.filter((m) => m.kind === 'notice' && m.title === 'Instant Mastery')

// ---------------------------------------------------------------------------

describe('first time per thing', () => {
  it('lifts a skill to the top, marks it, and says so once: a popup, a log line, a memory', () => {
    const g = life(30)
    expect(liftSkill(g, 'x.thing', 'creative', 'knitting', 0, 100)).toBe(100)
    expect(isMastered(g, 'x.thing')).toBe(true)
    expect(masteredCount(g)).toBe(1)
    expect(momentPopups(g)).toHaveLength(1)
    expect(lines(g).join(' ')).toMatch(/knitting/)
    expect(g.character.memories.length).toBe(1)
    // The second time is just upkeep: no new popup, no new line.
    const popups = g.queue.length
    const before = lines(g).length
    expect(liftSkill(g, 'x.thing', 'creative', 'knitting', 40, 100)).toBe(100)
    expect(g.queue.length).toBe(popups)
    expect(lines(g).length).toBe(before)
    // It never lowers a value and respects the ceiling given.
    expect(liftSkill(g, 'x.other', 'creative', 'weaving', 90, 40)).toBe(90)
    expect(liftSkill(g, 'x.third', 'creative', 'pottery', 10, 35)).toBe(35)
  })

  it('shows at most one popup a year; the rest are journal lines only', () => {
    const g = life(30)
    for (const key of ['a', 'b', 'c', 'd']) masterFirstTime(g, key, 'craft', `thing ${key}`)
    expect(momentPopups(g)).toHaveLength(1)
    expect(lines(g)).toHaveLength(4)
    g.year += 1
    masterFirstTime(g, 'e', 'craft', 'thing e')
    expect(momentPopups(g)).toHaveLength(2)
  })

  it('the lines are funny, second person in the popup and first person in the journal', () => {
    for (const fam of ['creative', 'instrument', 'sport', 'language', 'coding', 'martial', 'driving', 'school', 'job', 'stage', 'trading'] as const) {
      const text = masteryLine(fam, 'thing', fam)
      expect(text, fam).toMatch(/^(You|Your) /)
      expect(text, fam).not.toMatch(/\{s\}/)
    }
    const g = life(30)
    masterFirstTime(g, 'instrument.guitar', 'instrument', 'guitar')
    const popup = momentPopups(g)[0]
    expect(popup.kind === 'notice' && popup.text).toMatch(/guitar/)
    expect(lines(g)[0]).toMatch(/^I /)
  })

  it('is tagged with the character: an heir starts with nothing mastered', () => {
    const g = life(30)
    masterFirstTime(g, 'a', 'craft', 'a')
    const heir = life(18)
    heir.flags = structuredClone(g.flags)
    heir.character.id = 'heir'
    heir.character.firstName = 'Heir'
    expect(isMastered(heir, 'a')).toBe(false)
    expect(masteredCount(heir)).toBe(0)
  })

  it('does nothing for anybody else, and never touches the dice', () => {
    const g = life(30, false)
    const rng = g.rng
    expect(liftSkill(g, 'a', 'craft', 'a', 7, 100)).toBe(7)
    expect(masterFirstTime(g, 'a', 'craft', 'a')).toBe(false)
    expect(crowdedField(g)).toBe(false)
    yearlyMainCharacter(g)
    expect(experienceCap(g, 10)).toBe(100)
    expect(masteryCap(g, 'a')).toBe(100)
    expect(g.rng).toBe(rng)
    expect(g.flags['mcs.mastered']).toBeUndefined()
    expect(g.queue).toHaveLength(0)
    expect(keepsSkill(g, 'a')).toBe(false)
  })
})

describe('ceilings', () => {
  it('age and body ceilings only go down for the young and the old', () => {
    expect(ageCeiling(6, { from: 6, full: 18, floor: 25 })).toBe(25)
    expect(ageCeiling(12, { from: 6, full: 18, floor: 25 })).toBe(63)
    expect(ageCeiling(18)).toBe(100)
    expect(ageCeiling(40)).toBe(100)
    expect(ageCeiling(70, { slowFrom: 60 })).toBeLessThan(100)
    const young = life(25)
    const old = life(80)
    const sick = life(25, true, 11, { stats: { happiness: 50, health: 10, smarts: 50, looks: 50 } })
    expect(bodyCeiling(young, { peakEnd: 32 })).toBe(100)
    expect(bodyCeiling(old, { peakEnd: 32 })).toBeLessThan(60)
    expect(bodyCeiling(sick, { peakEnd: 32 })).toBeLessThan(100)
    expect(bodyCeiling(life(9), { peakEnd: 32 })).toBeLessThan(60)
  })

  it('the competitive level takes years: from the middle of the pack to the top', () => {
    const g = life(30)
    expect(experienceCap(g, 30)).toBeLessThan(50)
    expect(experienceCap(g, 25)).toBeGreaterThan(experienceCap(g, 30))
    expect(experienceCap(g, 0)).toBe(100)
    expect(experienceCap(g, null)).toBeLessThan(50)
  })
})

describe('creative arts', () => {
  it('writing a first poem is already mastery, and nobody else gets that', () => {
    const g = life(30)
    expect(craftSkill(g, 'writing')).toBe(0)
    run(g, creativeMenu.children(g), 'mb.creative.write')
    answer(g, 'poem')
    expect(craftSkill(g, 'writing')).toBe(100)
    expect(isMastered(g, 'craft.writing')).toBe(true)
    expect(momentPopups(g)).toHaveLength(1)
    const plain = life(30, false)
    run(plain, creativeMenu.children(plain), 'mb.creative.write')
    answer(plain, 'poem')
    expect(craftSkill(plain, 'writing')).toBeLessThan(15)
    expect(masteredCount(plain)).toBe(0)
  })

  it('a first screenplay is allowed to be a first thing (the skill gate does not lock a master out)', () => {
    const g = life(30)
    run(g, creativeMenu.children(g), 'mb.creative.write')
    answer(g, 'screenplay')
    expect(craftSkill(g, 'writing')).toBe(100)
  })

  it('art, cooking and stand-up each master on their own first go', () => {
    const g = life(30)
    run(g, creativeMenu.children(g), 'mb.creative.art')
    answer(g, g.queue.length ? (g.queue[0] as ChoiceModal).choices[0].id : 'paint')
    expect(craftSkill(g, 'art')).toBe(100)
    expect(craftSkill(g, 'cooking')).toBe(0)
    run(g, creativeMenu.children(g), 'mb.creative.cook')
    answer(g, (g.queue.find((m) => m.kind === 'choice') as ChoiceModal).choices[0].id)
    expect(craftSkill(g, 'cooking')).toBe(100)
    run(g, creativeMenu.children(g), 'mb.creative.standup')
    answer(g, (g.queue.find((m) => m.kind === 'choice') as ChoiceModal).choices[0].id)
    expect(craftSkill(g, 'comedy')).toBe(100)
    expect(masteredKeys(g).sort()).toEqual(['craft.art', 'craft.comedy', 'craft.cooking'])
    expect(lines(g).filter((l) => /^I /.test(l)).length).toBeGreaterThanOrEqual(3)
  })

  it('a child masters what a child can: the age ceiling holds, and grows with the years', () => {
    const kid = life(9)
    run(kid, creativeMenu.children(kid), 'mb.creative.write')
    answer(kid, 'poem')
    const skill = craftSkill(kid, 'writing')
    expect(skill).toBeGreaterThanOrEqual(30)
    expect(skill).toBeLessThan(60)
    // Grown up and practicing again, the skill follows the ceiling.
    kid.character.age = 25
    kid.year += 16
    kid.yearActions = {}
    run(kid, creativeMenu.children(kid), 'mb.creative.write')
    answer(kid, 'poem')
    expect(craftSkill(kid, 'writing')).toBe(100)
  })

  it('does not master anything just by looking: menus and subtitles never write', () => {
    const g = life(30)
    const before = JSON.stringify(g)
    for (const root of [creativeMenu, mindBodyMenu, licensesMenu, martialArtsMenu, cvMenu]) {
      const kids = root.children(g)
      for (const n of kids) {
        if (n.type === 'info' || n.type === 'heading') continue
        if ('subtitle' in n && typeof n.subtitle === 'function') n.subtitle(g)
        if ('hint' in n && typeof n.hint === 'function') n.hint(g)
        if (n.type === 'menu') n.children(g)
      }
    }
    expect(JSON.stringify(g)).toBe(before)
    expect(masteredCount(g)).toBe(0)
    expect(craftSkill(g, 'writing')).toBe(0)
  })
})

describe('instruments and lessons', () => {
  it('the first guitar lesson is mastery, with the guitar line', () => {
    const g = life(30)
    expect(instrumentSkill(g, 'Guitar')).toBe(0)
    run(g, mindBodyMenu.children(g), 'mb.instrument.Guitar')
    expect(instrumentSkill(g, 'Guitar')).toBe(100)
    expect(isMastered(g, 'instrument.Guitar')).toBe(true)
    expect(instrumentSkill(g, 'Piano')).toBe(0)
    const popup = momentPopups(g)[0]
    expect(popup.kind === 'notice' && popup.text).toMatch(/guitar/i)
    expect(g.counters.instrumentsMastered).toBe(1)
  })

  it('too many lessons never make a master worse', () => {
    const g = life(30)
    for (let i = 0; i < 6; i++) run(g, mindBodyMenu.children(g), 'mb.instrument.Guitar')
    expect(instrumentSkill(g, 'Guitar')).toBe(100)
  })

  it('a kid is capped by the age ceiling', () => {
    const kid = life(8, true, 11, { residence: { status: 'parents' } })
    masterInstrument(kid, 'Violin')
    expect(instrumentSkill(kid, 'Violin')).toBeLessThan(60)
    expect(instrumentSkill(kid, 'Violin')).toBeGreaterThanOrEqual(35)
    expect(masterInstrument(life(30), 'Voice')).toBe(100)
  })

  it('acting, voice and modeling lessons master too (and not for others)', () => {
    const g = life(30)
    for (const id of ['mb.lesson.acting', 'mb.lesson.voice', 'mb.lesson.modeling']) run(g, mindBodyMenu.children(g), id)
    expect(flagSkill(g, 'acting')).toBe(100)
    expect(flagSkill(g, 'voice')).toBe(100)
    expect(flagSkill(g, 'modeling')).toBe(100)
    const plain = life(30, false)
    run(plain, mindBodyMenu.children(plain), 'mb.lesson.acting')
    expect(flagSkill(plain, 'acting')).toBeLessThan(25)
  })
})

describe('coding and languages', () => {
  it('the first line of code is mastery, capped by age, language by language', () => {
    const g = life(30)
    const gains = practice(g, 4, 'python')
    expect(codingSkill(g)).toBe(100)
    expect(languageLevel(g, 'python')).toBe(100)
    expect(gains.skill).toBe(100)
    expect(gains.lang).toBe(100)
    expect(languageLevel(g, 'javascript')).toBe(0)
    practice(g, 4, 'javascript')
    expect(languageLevel(g, 'javascript')).toBe(100)
    expect(masteredKeys(g).sort()).toEqual(['code.javascript', 'code.python', 'coding'])
    const kid = life(10)
    practice(kid, 4, 'scratch')
    expect(codingSkill(kid)).toBe(codingCeiling(10))
    const plain = life(30, false)
    practice(plain, 4, 'python')
    expect(codingSkill(plain)).toBeLessThan(15)
  })

  it('coding skill does not rust for a master, but does for everyone else', () => {
    const g = life(40)
    practice(g, 4, 'python')
    for (let i = 0; i < 12; i++) {
      g.year += 1
      g.character.age += 1
      ageUp(g)
      g.queue = []
    }
    expect(codingSkill(g)).toBe(100)
    const plain = life(40, false)
    plain.flags.codingSkill = 80
    plain.flags.lastCodedAge = 40
    for (let i = 0; i < 12; i++) {
      plain.year += 1
      plain.character.age += 1
      ageUp(plain)
      plain.queue = []
    }
    expect(codingSkill(plain)).toBeLessThan(80)
  })

  it('a first spoken-language lesson is fluency (once a year, at the usual cost)', () => {
    const g = life(30)
    const money = g.character.money
    run(g, cvMenu.children(g), 'cv.language.Korean')
    const entry = cvEntries(g).find((e) => e.title.startsWith('Korean'))
    expect(entry?.title).toBe('Korean (Fluent)')
    expect(g.character.money).toBeLessThan(money)
    expect(isMastered(g, 'language.Korean')).toBe(true)
    // Not a second lesson in the same year.
    expect(() => run(g, cvMenu.children(g), 'cv.language.Korean')).toThrow()
    const plain = life(30, false)
    run(plain, cvMenu.children(plain), 'cv.language.Korean')
    expect(cvEntries(plain).find((e) => e.title.startsWith('Korean'))?.title).not.toBe('Korean (Fluent)')
  })
})

describe('martial arts, driving, school and work', () => {
  it('the first class is the black belt for an adult and a junior rank for a kid', () => {
    const g = life(30)
    run(g, martialArtsMenu.children(g), 'mb.martial.judo')
    expect(styleProgress(g, 'judo').belt).toBe(6)
    expect(g.counters.blackBelts).toBe(1)
    const kid = life(9)
    run(kid, martialArtsMenu.children(kid), 'mb.martial.judo')
    const belt = styleProgress(kid, 'judo').belt
    expect(belt).toBeGreaterThan(0)
    expect(belt).toBeLessThan(6)
    // Old and frail: not a miracle.
    const frail = life(78, true, 11, { stats: { happiness: 50, health: 25, smarts: 50, looks: 50 } })
    run(frail, martialArtsMenu.children(frail), 'mb.martial.judo')
    expect(styleProgress(frail, 'judo').belt).toBeLessThan(6)
    const plain = life(30, false)
    run(plain, martialArtsMenu.children(plain), 'mb.martial.judo')
    expect(styleProgress(plain, 'judo').belt).toBe(0)
  })

  it('the driving test is aced the first time; the age gate and the other tests still apply', () => {
    const g = life(30)
    run(g, licensesMenu.children(g), 'license.driver')
    expect(g.character.licenses).toContain('driver')
    expect(isMastered(g, 'drive.driver')).toBe(true)
    const teen = life(12)
    const why = (findNode(teen, licensesMenu.children(teen), 'license.driver') as MenuAction).disabledReason?.(teen)
    expect(why).toBeTruthy()
    const plain = life(30, false)
    run(plain, licensesMenu.children(plain), 'license.driver')
    expect(plain.queue.some((m) => m.kind === 'choice')).toBe(true)
    expect(plain.character.licenses).not.toContain('driver')
  })

  it('a pilot still needs the flight hours before the test', () => {
    const g = life(30)
    const test = findNode(g, licensesMenu.children(g), 'license.pilot.test') as MenuAction
    expect(test.disabledReason?.(g)).toMatch(/flight hours/)
    run(g, licensesMenu.children(g), 'license.pilot.hours.40')
    expect(isMastered(g, 'drive.pilot')).toBe(true)
    run(g, licensesMenu.children(g), 'license.pilot.test')
    expect(g.character.licenses).toContain('pilot')
  })

  it('school starts at the top of the class, and work starts as a star', () => {
    const g = createNewLife({ seed: 3, year: 2026, talents: ['MainCharacter'] })
    for (let i = 0; i < 7; i++) {
      ageUp(g)
      g.queue = []
    }
    const cur = g.character.education.current
    expect(cur?.level).toBe('elementary')
    expect(cur!.grades).toBeGreaterThanOrEqual(90)
    expect(isMastered(g, 'school.elementary')).toBe(true)
    const a = life(30)
    const job = hireForJob(a, { defId: 'barista', title: 'Barista', company: 'Corner Cafe', category: 'fulltime', salary: 30_000 } as never)
    expect(job.performance).toBeGreaterThanOrEqual(82)
    const b = life(30, false)
    expect(hireForJob(b, { defId: 'barista', title: 'Barista', company: 'Corner Cafe', category: 'fulltime', salary: 30_000 } as never).performance).toBeLessThan(71)
  })
})

describe('luck is not skill', () => {
  function flatten(g: GameState, nodes: MenuNode[], out: MenuAction[] = [], depth = 0): MenuAction[] {
    if (depth > 3) return out
    for (const n of nodes) {
      if (n.type === 'action') out.push(n)
      else if (n.type === 'menu') flatten(g, n.children(g), out, depth + 1)
    }
    return out
  }

  it('the lottery and the scratch cards roll exactly the same for a main character', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = life(30, true, seed)
      const b = life(30, false, seed)
      for (const g of [a, b]) {
        for (const act of flatten(g, lotteryMenu.children(g)).filter((x) => /-(1|10)$/.test(x.id))) {
          if (act.disabledReason?.(g)) continue
          act.run(g)
          g.queue = []
        }
      }
      expect(a.character.money, `seed ${seed}`).toBe(b.character.money)
      expect(a.rng).toBe(b.rng)
      expect(a.counters).toEqual(b.counters)
      expect(a.flags['mcs.mastered']).toBeUndefined()
    }
  })

  it('blackjack and slots settle by the cards and the reels alone', () => {
    for (const result of ['win', 'lose', 'push', 'blackjack']) {
      const a = life(30, true, 9)
      const b = life(30, false, 9)
      const data = { bet: 100, casino: 'Test Casino' }
      settleBlackjack(a, result, data)
      settleBlackjack(b, result, data)
      expect(a.character.money).toBe(b.character.money)
    }
    expect(slotPayout(['7', '7', '7'])).toBe(slotPayout(['7', '7', '7']))
    expect(slotRtp()).toBeLessThan(1)
  })

  it('trading skill tightens prices but the market is still a net cost', () => {
    // A mastered trader (85) pays a smaller markup than a beginner, and still a positive one.
    expect(markup(85, 'atm')).toBeLessThan(markup(0, 'atm'))
    expect(markup(100, 'atm')).toBeGreaterThan(0.05)
  })

  it('a contest a master "should" win is still shared with other masters now and then', () => {
    let lost = 0
    const g = life(30)
    for (let i = 0; i < 400; i++) if (crowdedField(g)) lost++
    expect(lost).toBeGreaterThan(40)
    expect(lost).toBeLessThan(140)
  })
})

describe('everyone else and old saves', () => {
  it('a life with no talents never touches the mastery record, the RNG or the popups', () => {
    const g = life(30, false)
    const rng = g.rng
    const before = JSON.stringify(g)
    masterInstrument(g, 'Guitar')
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
  })

  it('old saves without talents, with junk talents, or with a stale mastery record keep working', () => {
    const g = life(30, false)
    delete g.character.talents
    expect(hasTalent(g, 'Business')).toBe(false)
    g.character.talents = ['MainCharacter']
    g.flags['mcs.mastered'] = { owner: 'someone-else', done: { x: 3 }, noticeYear: 9999 }
    expect(isMastered(g, 'x')).toBe(false)
    masterFirstTime(g, 'x', 'craft', 'x')
    expect(isMastered(g, 'x')).toBe(true)
    g.flags['mcs.mastered'] = 'garbage'
    expect(masteredCount(g)).toBe(0)
    expect(() => masterFirstTime(g, 'y', 'craft', 'y')).not.toThrow()
    g.flags['mcs.mastered'] = { owner: `${g.character.id}:${g.year - g.character.age}`, done: null }
    expect(() => masterFirstTime(g, 'z', 'craft', 'z')).not.toThrow()
  })

  it('the lifestyle is light: tiny, bounded, no money', () => {
    const g = createNewLife({ seed: 9, year: 2026, talents: ['MainCharacter'] })
    const friend = createPerson(g, { relation: 'friend', age: 14, relationship: 70 })
    g.character.age = 14
    const startMoney = g.character.money
    const startHappy = g.character.stats.happiness
    let events = 0
    for (let age = 14; age < 74; age++) {
      g.character.age = age
      g.year = 2026 + (age - 14)
      const before = friend.relationship
      yearlyMainCharacter(g)
      for (const m of g.queue) if (m.kind === 'choice') events++
      g.queue = []
      expect(friend.relationship - before).toBeGreaterThanOrEqual(-3)
      friend.relationship = Math.max(friend.relationship, 40)
    }
    expect(g.character.money).toBe(startMoney)
    expect(events).toBeLessThanOrEqual(20)
    expect(Math.abs(g.character.stats.happiness - startHappy)).toBeLessThanOrEqual(100)
  })
})

describe('era and tone', () => {
  it('no line names something that did not exist yet, in any year or country', () => {
    const bad: string[] = []
    for (const text of allMasteryTexts()) {
      for (const year of [1900, 1915, 1930, 1945, 1960, 1975, 1990, 2000, 2026]) {
        for (const country of ['us', 'ng', 'in', 'jp']) {
          const hits = anachronismsIn(text, year, [country])
          if (hits.length) bad.push(`${year}/${country} ${hits.join(',')}: ${text}`)
        }
      }
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([])
  })

  it('stays teen-friendly: no profanity or slurs, no real people', () => {
    const all = allMasteryTexts().join('\n')
    expect(all).not.toMatch(/\b(fuck|shit|damn|bitch|asshole|nazi)\b/i)
  })
})
