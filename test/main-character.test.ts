// Main Character Syndrome (talents.ts MainCharacter): every talent at once, one of the three
// start slots, no childhood reveal, and a gift that can run in the family.
import { describe, expect, it } from 'vitest'
import { TALENTS, continueAsChild, createNewLife, getTalent } from '../src/game/life'
import { ageUp } from '../src/game/aging'
import { writeObituary } from '../src/game/events/obituary'
import { talentMatches } from '../src/game/special/common'
import {
  ALL_TALENT_IDS,
  MAIN_CHARACTER,
  MAX_START_TALENTS,
  SPECIAL_TALENTS,
  characterTalents,
  effectiveTalents,
  hasMainCharacter,
  hasTalent,
  isTalentId,
  normalizeTalents,
  pickedTalents,
  shownTalents,
  specialTalent,
  talentEmoji,
  talentLabel,
  talentHint,
  talentMult,
  HINT_EMOJI,
} from '../src/game/talents'
import { makeTestGame } from './helpers'

const mcs = (age = 20, extra: Record<string, unknown> = {}) => makeTestGame(5, { age, talents: [MAIN_CHARACTER], ...extra })

describe('the talent', () => {
  it('is a special talent with the label, an emoji and the one-line perk', () => {
    const def = specialTalent('MainCharacter')!
    expect(def.label).toBe('Main Character Syndrome')
    expect(def.emoji.length).toBeGreaterThan(0)
    expect(def.perk).toContain('You have every talent, and anything you do once, you master.')
    expect(def.perk).toContain('Every child inherits it')
    expect(isTalentId('MainCharacter')).toBe(true)
    expect(SPECIAL_TALENTS.filter((t) => t.id === 'MainCharacter')).toHaveLength(1)
    expect(talentEmoji('MainCharacter')).toBe(def.emoji)
    // Inventor joins the existing fifteen gifts.
    expect(ALL_TALENT_IDS).toHaveLength(16)
    expect(ALL_TALENT_IDS).not.toContain('MainCharacter')
  })

  it('hasTalent is true for every talent id, special or not, only for a main character', () => {
    const g = mcs()
    for (const t of SPECIAL_TALENTS) expect(hasTalent(g, t.id), t.id).toBe(true)
    for (const t of TALENTS) expect(hasTalent(g, t.id), t.id).toBe(true)
    // Childhood talents that are not special talents (a kid who sings) count too.
    for (const id of ['Singing', 'Dancing', 'Chess', 'Anything at all']) expect(hasTalent(g, id), id).toBe(true)
    const plain = makeTestGame(5, { age: 20 })
    for (const t of SPECIAL_TALENTS) expect(hasTalent(plain, t.id), t.id).toBe(false)
    expect(hasTalent(plain, 'Singing')).toBe(false)
    // Another talent does not turn into this one.
    const gifted = makeTestGame(5, { age: 20, talents: ['Business', 'Music'] })
    expect(hasMainCharacter(gifted)).toBe(false)
    expect(hasTalent(gifted, 'Acting')).toBe(false)
  })

  it('works when it was only discovered, hand-edited into a save or mixed with other picks', () => {
    expect(hasTalent(makeTestGame(1, { age: 9, talent: MAIN_CHARACTER }), 'Gaming')).toBe(true)
    expect(hasTalent(makeTestGame(1, { age: 9, talents: ['Business', MAIN_CHARACTER] }), 'Comedy')).toBe(true)
    const old = makeTestGame(1, { age: 9 })
    delete old.character.talents
    expect(hasTalent(old, 'Business')).toBe(false)
    old.character.talents = ['Nonsense', 7 as unknown as string]
    expect(hasTalent(old, 'Business')).toBe(false)
    expect(() => characterTalents(old)).not.toThrow()
  })

  it('talentMult and talentHint follow hasTalent for any id', () => {
    const g = mcs()
    expect(talentMult(g, 'Programming', 1.5)).toBe(1.5)
    expect(talentMult(g, 'Singing', 2)).toBe(2)
    expect(talentHint(g, 'Investing', 'text')).toBe(`${HINT_EMOJI} text`)
    const plain = makeTestGame(5, { age: 20 })
    expect(talentMult(plain, 'Programming', 1.5)).toBe(1)
    expect(talentHint(plain, 'Investing', 'text')).toBe('')
  })

  it('summaries show the one talent, matching by name still sees all of them', () => {
    const g = mcs(20, { talent: 'Music' })
    expect(characterTalents(g)).toEqual([MAIN_CHARACTER])
    expect(shownTalents(g)).toEqual([MAIN_CHARACTER])
    expect(effectiveTalents(g)).toContain('Athletics')
    expect(effectiveTalents(g)).toContain(MAIN_CHARACTER)
    expect(talentMatches(g, /athlet/i)).toBe(true)
    expect(talentMatches(g, /music|sing/i)).toBe(true)
    expect(talentMatches(makeTestGame(5, { age: 20 }), /athlet/i)).toBe(false)
    // Without the talent nothing changed: picked first, then the discovered one.
    expect(characterTalents(makeTestGame(5, { age: 20, talents: ['Business'], talent: 'Music' }))).toEqual(['Business', 'Music'])
  })

  it('uses the display label in player-facing prose instead of the raw save id', () => {
    expect(talentLabel(MAIN_CHARACTER)).toBe('Main Character Syndrome')
    expect(talentLabel('OldCustomTalent')).toBe('OldCustomTalent')
    const g = mcs(80)
    g.character.alive = false
    g.character.causeOfDeath = 'Old Age'
    const text = writeObituary(g)
    expect(text).toContain('Gifted at main character syndrome.')
    expect(text).not.toContain('maincharacter')
  })
})

describe('normalizing and the three slots', () => {
  it('keeps it like any other pick: known, unique and counted as one of three', () => {
    expect(normalizeTalents(['MainCharacter'])).toEqual(['MainCharacter'])
    expect(normalizeTalents(['MainCharacter', 'MainCharacter', 'Business'])).toEqual(['MainCharacter', 'Business'])
    expect(normalizeTalents(['Business', 'Music', 'MainCharacter', 'Art'])).toEqual(['Business', 'Music', 'MainCharacter'])
    expect(normalizeTalents(['Business', 'Music', 'Art', 'MainCharacter'])).toEqual(['Business', 'Music', 'Art'])
    expect(MAX_START_TALENTS).toBe(3)
  })

  it('createNewLife stores it and trims to three', () => {
    const g = createNewLife({ seed: 7, year: 2026, talents: ['MainCharacter', 'Business', 'Music', 'Art'] })
    expect(g.character.talents).toEqual(['MainCharacter', 'Business', 'Music'])
    expect(pickedTalents(g)).toContain('MainCharacter')
    expect(hasMainCharacter(g)).toBe(true)
  })
})

describe('no childhood reveal', () => {
  it('a main character never gets the "Special Talent" moment or journal hints', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
      const g = createNewLife({ seed, year: 2026, talents: ['MainCharacter'] })
      expect(g.flags.latentTalent).toBeUndefined()
      expect(g.flags.talentAge).toBeUndefined()
      let popups = 0
      for (let age = 0; age < 14; age++) {
        g.queue = []
        ageUp(g)
        popups += g.queue.filter((m) => m.kind === 'notice' && m.title === 'Special Talent').length
        g.queue = []
      }
      expect(popups, `seed ${seed}`).toBe(0)
      expect(g.character.talent).toBeNull()
      expect(g.flags.talentHints).toBeUndefined()
    }
    // 280 full years (each runs the world economy): sized for a 2-core CI runner.
  }, 600_000)

  it('other lives still get the moment (the control)', () => {
    let seen = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const g = createNewLife({ seed, year: 2026, talents: ['Music'] })
      for (let age = 0; age < 14; age++) {
        g.queue = []
        ageUp(g)
        seen += g.queue.filter((m) => m.kind === 'notice' && m.title === 'Special Talent').length
      }
    }
    expect(seen).toBeGreaterThan(0)
    // 168 full years: sized for a 2-core CI runner.
  }, 300_000)

  it('has a stand-in definition so heirs can inherit it, but it is never rolled as a random talent', () => {
    expect(getTalent('MainCharacter')).toBeDefined()
    expect(TALENTS.some((t) => t.id === 'MainCharacter')).toBe(false)
  })
})

describe('the gift can run in the family', () => {
  it('every heir inherits Main Character Syndrome, without a childhood reveal roll', () => {
    let inherited = 0
    let plain = 0
    for (let seed = 1; seed <= 60; seed++) {
      const g = createNewLife({ seed, year: 2026, talents: ['MainCharacter', 'Business', 'Music'] })
      g.character.age = 50
      g.character.alive = false
      const kid = g.people.find((p) => p.relation === 'child')
      if (!kid) {
        // Give this life a grown child so the hand-off is tested.
        g.people.push({ ...g.people[0], id: `kid${seed}`, relation: 'child', age: 25, alive: true, firstName: 'Kid', lastName: g.character.lastName, relationship: 80, data: {} })
      }
      const heirId = (g.people.find((p) => p.relation === 'child') ?? g.people[g.people.length - 1]).id
      const next = continueAsChild(g, heirId)
      const picks = next.character.talents ?? []
      expect(picks.length).toBeLessThanOrEqual(1)
      if (picks.includes('MainCharacter')) {
        inherited++
        expect(next.flags.latentTalent).toBeUndefined()
        expect(hasTalent(next, 'Gaming')).toBe(true)
        const prose = [
          ...next.queue.map((m) => ('text' in m ? m.text : '')),
          ...next.log.flatMap((y) => y.entries.map((e) => e.text)),
        ].join(' ').toLowerCase()
        expect(prose).toContain('main character syndrome')
        expect(prose).not.toContain('maincharacter')
      } else plain++
    }
    expect(inherited).toBe(60)
    expect(plain).toBe(0)
  })
})
