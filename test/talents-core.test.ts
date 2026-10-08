// Special talents (talents.ts + life.ts): picked before birth, active from day one, each with its
// own childhood discovery moment; a parent's pick may run in the family; the CV and the obituary
// see them all.
import { describe, expect, it } from 'vitest'
import { cvEntries } from '../src/game/cv'
import { fallbackObituary } from '../src/game/events'
import { continueAsChild, createNewLife, getTalent, yearlyMilestones } from '../src/game/life'
import { createPerson } from '../src/game/people'
import {
  characterTalents,
  hasTalent,
  HINT_EMOJI,
  isTalentId,
  MAX_START_TALENTS,
  normalizeTalents,
  pickedTalents,
  SPECIAL_TALENTS,
  talentEmoji,
  talentHint,
  talentMult,
} from '../src/game/talents'
import type { GameState, NoticeModal } from '../src/game/types'
import { makeTestGame } from './helpers'

function talentNotices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === 'Special Talent')
}

/** Age a fresh life through childhood with only the milestone hook, collecting talent popups per age. */
function growUp(g: GameState, toAge: number): Map<number, string[]> {
  const byAge = new Map<number, string[]>()
  for (let age = g.character.age + 1; age <= toAge; age++) {
    g.character.age = age
    g.log.push({ age, year: g.year + age, entries: [] })
    yearlyMilestones(g)
    byAge.set(
      age,
      talentNotices(g).map((n) => n.text),
    )
    g.queue = []
  }
  return byAge
}

describe('talents.ts helpers', () => {
  it('knows every pickable talent and has a childhood moment for each one', () => {
    // 16 gifts plus Main Character Syndrome (which has every childhood moment already, so none of its own).
    expect(SPECIAL_TALENTS.length).toBe(17)
    expect(new Set(SPECIAL_TALENTS.map((t) => t.id)).size).toBe(SPECIAL_TALENTS.length)
    for (const t of SPECIAL_TALENTS) {
      expect(isTalentId(t.id)).toBe(true)
      expect(t.perk.length).toBeGreaterThan(20)
      if (t.id === 'MainCharacter') continue
      const def = getTalent(t.id)
      expect(def, t.id).toBeDefined()
      expect(def!.hints.length).toBeGreaterThanOrEqual(2)
      expect(def!.discovery).toMatch(/special talent for/)
      expect(def!.weight).toBeGreaterThan(0)
    }
    expect(MAX_START_TALENTS).toBe(3)
    expect(isTalentId('Juggling')).toBe(false)
    expect(isTalentId(7)).toBe(false)
    expect(talentEmoji('Business')).toBe('\u{1F4BC}')
    expect(talentEmoji('Nonsense')).toBe('\u{1F31F}')
  })

  it('normalizes picks: known ids, no duplicates, capped', () => {
    expect(normalizeTalents(['Business', 'Business', 'Juggling', 3, null, 'Acting', 'Investing', 'Music'])).toEqual(['Business', 'Acting', 'Investing'])
    expect(normalizeTalents('Business')).toEqual([])
    expect(normalizeTalents(undefined)).toEqual([])
    expect(normalizeTalents(['Music', 'Art'], 1)).toEqual(['Music'])
  })

  it('hasTalent covers picked talents, the discovered one and old saves', () => {
    const g = makeTestGame()
    // An old save: no `talents` field at all.
    expect('talents' in g.character).toBe(false)
    expect(characterTalents(g)).toEqual([])
    expect(hasTalent(g, 'Business')).toBe(false)

    g.character.talent = 'Music'
    expect(hasTalent(g, 'Music')).toBe(true)
    expect(characterTalents(g)).toEqual(['Music'])

    g.character.talents = ['Business', 'Investing']
    expect(hasTalent(g, 'Business')).toBe(true)
    expect(hasTalent(g, 'Investing')).toBe(true)
    expect(hasTalent(g, 'Music')).toBe(true)
    expect(hasTalent(g, 'Acting')).toBe(false)
    expect(characterTalents(g)).toEqual(['Business', 'Investing', 'Music'])
    expect(pickedTalents(g)).toEqual(['Business', 'Investing'])

    // A hand-edited or corrupted save never crashes and never double counts.
    g.character.talents = 'Business' as unknown as string[]
    expect(characterTalents(g)).toEqual(['Music'])
    g.character.talents = ['Music', 'Music', 42 as unknown as string]
    expect(characterTalents(g)).toEqual(['Music'])
  })

  it('talentMult and talentHint only kick in with the talent', () => {
    const g = makeTestGame()
    expect(talentMult(g, 'Acting', 1.5)).toBe(1)
    expect(talentHint(g, 'Business', 'Raise prices.')).toBe('')
    g.character.talents = ['Acting', 'Business']
    expect(talentMult(g, 'Acting', 1.5)).toBe(1.5)
    expect(talentHint(g, 'Business', 'Raise prices.')).toBe(`${HINT_EMOJI} Raise prices.`)
  })
})

describe('createNewLife talents option', () => {
  it('stores the picks and starts with them active', () => {
    const g = createNewLife({ seed: 42, year: 2026, talents: ['Business', 'Acting', 'Investing'] })
    expect(g.character.talents).toEqual(['Business', 'Acting', 'Investing'])
    expect(hasTalent(g, 'Business')).toBe(true)
    expect(hasTalent(g, 'Acting')).toBe(true)
    expect(hasTalent(g, 'Investing')).toBe(true)
    expect(JSON.parse(JSON.stringify(g)).character.talents).toEqual(['Business', 'Acting', 'Investing'])
  })

  it('validates and caps: unknown ids and duplicates are dropped, at most three', () => {
    const g = createNewLife({ seed: 9, year: 2026, talents: ['Gaming', 'Gaming', 'Telekinesis', 'Leadership', 'Music', 'Art'] })
    expect(g.character.talents).toEqual(['Gaming', 'Leadership', 'Music'])
    const junk = createNewLife({ seed: 9, year: 2026, talents: ['Nope', '', 5 as unknown as string] })
    expect('talents' in junk.character).toBe(false)
    expect('talents' in createNewLife({ seed: 9, year: 2026, talents: [] }).character).toBe(false)
    expect('talents' in createNewLife({ seed: 9, year: 2026 }).character).toBe(false)
  })

  it('rolls the exact same family and destiny with or without picks', () => {
    for (const seed of [3, 1234, 99]) {
      const plain = createNewLife({ seed, year: 2026 })
      const gifted = createNewLife({ seed, year: 2026, talents: ['Comedy'] })
      expect(gifted.people).toEqual(plain.people)
      expect(gifted.log).toEqual(plain.log)
      expect(gifted.rng).toBe(plain.rng)
      expect({ ...gifted.character, talents: undefined }).toEqual({ ...plain.character, talents: undefined })
    }
  })

  it('keeps a random extra talent, unless it would duplicate a pick', () => {
    let duplicate = 0
    let extra = 0
    for (let seed = 1; seed <= 400 && (duplicate === 0 || extra === 0); seed++) {
      const plain = createNewLife({ seed, year: 2026 })
      const latent = plain.flags.latentTalent
      if (typeof latent !== 'string') continue
      const same = createNewLife({ seed, year: 2026, talents: [latent] })
      expect(same.flags.latentTalent).toBeUndefined()
      expect(same.flags.talentAge).toBeUndefined()
      duplicate++
      const other = SPECIAL_TALENTS.find((t) => t.id !== latent)!.id
      const different = createNewLife({ seed, year: 2026, talents: [other] })
      expect(different.flags.latentTalent).toBe(latent)
      expect(different.flags.talentAge).toBe(plain.flags.talentAge)
      extra++
    }
    expect(duplicate).toBeGreaterThan(0)
    expect(extra).toBeGreaterThan(0)
  })
})

describe('discovering picked talents in childhood', () => {
  it('gives every pick exactly one discovery moment between 5 and 10, one a year at most', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = makeTestGame(seed, { age: 0, talents: ['Business', 'Investing', 'Leadership'] })
      const byAge = growUp(g, 14)
      const all = [...byAge.values()].flat()
      expect(all.length, `seed ${seed}`).toBe(3)
      for (const [age, texts] of byAge) {
        expect(texts.length, `seed ${seed} age ${age}`).toBeLessThanOrEqual(1)
        if (texts.length) {
          expect(age).toBeGreaterThanOrEqual(5)
          expect(age).toBeLessThanOrEqual(10)
        }
      }
      expect(all.some((t) => /talent for business/.test(t))).toBe(true)
      expect(all.some((t) => /talent for investing/.test(t))).toBe(true)
      expect(all.some((t) => /talent for leadership/.test(t))).toBe(true)
      expect(g.flags.talentsRevealed).toEqual(expect.arrayContaining(['Business', 'Investing', 'Leadership']))
      // Picks stay picks: the childhood slot is still free for a random extra.
      expect(g.character.talent).toBeNull()
      const lines = g.log.flatMap((y) => y.entries.map((e) => e.text))
      expect(lines.filter((l) => /^I discovered I have a special talent for/.test(l))).toHaveLength(3)
      expect(g.character.memories.filter((m) => /special talent/.test(m))).toHaveLength(3)
    }
  })

  it("applies each talent's one-time bump exactly once", () => {
    const g = makeTestGame(5, { age: 0, talents: ['Academics'] })
    g.character.stats.smarts = 40
    growUp(g, 20)
    expect(g.character.stats.smarts).toBe(52)
  })

  it('never stacks a picked moment on top of a random talent discovery', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = makeTestGame(seed, { age: 0, talents: ['Gaming', 'Art'] })
      g.flags.latentTalent = 'Music'
      g.flags.talentAge = 5 + (seed % 6)
      const byAge = growUp(g, 13)
      for (const texts of byAge.values()) expect(texts.length).toBeLessThanOrEqual(1)
      expect([...byAge.values()].flat()).toHaveLength(3)
      expect(g.character.talent).toBe('Music')
      expect(characterTalents(g)).toEqual(['Gaming', 'Art', 'Music'])
    }
  })

  it('hints at picked talents in the journal before they surface, never two years running', () => {
    let total = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = makeTestGame(seed, { age: 0, talents: ['Business'] })
      const hints = getTalent('Business')!.hints
      growUp(g, 12)
      const logged = g.log.flatMap((y) => y.entries.filter((e) => hints.includes(e.text)).map((e) => ({ age: y.age, text: e.text })))
      total += logged.length
      expect(new Set(logged.map((l) => l.text)).size).toBe(logged.length)
      for (let i = 1; i < logged.length; i++) expect(logged[i].age - logged[i - 1].age).toBeGreaterThanOrEqual(2)
    }
    expect(total).toBeGreaterThan(5)
  })

  it('a picked talent found on someone past childhood is simply known, without a popup', () => {
    const g = makeTestGame(2, { age: 30, talents: ['Music'] })
    g.log = [{ age: 30, year: 2026, entries: [] }]
    yearlyMilestones(g)
    expect(talentNotices(g)).toHaveLength(0)
    expect(g.flags.talentsRevealed).toEqual(['Music'])
    expect(hasTalent(g, 'Music')).toBe(true)
  })

  it('reads well in every new discovery line (no leftover tokens)', () => {
    for (const id of ['Business', 'Investing', 'Leadership', 'Gaming']) {
      for (const country of ['us', 'jp', 'ng', 'de']) {
        const g = makeTestGame(1, { age: 10, countryId: country, talents: [id] })
        yearlyMilestones(g)
        const text = talentNotices(g)[0]?.text ?? ''
        expect(text, `${id} ${country}`).toMatch(new RegExp(`special talent for ${id.toLowerCase()}`))
        expect(text).not.toMatch(/\{\w+\}|undefined|NaN/)
      }
    }
  })
})

describe('heirs and talents', () => {
  /** A dead parent with picks and one child of the given age. */
  function family(seed: number, childAge: number, picks: string[] | undefined): { g: GameState; kid: string } {
    const g = makeTestGame(seed, { age: 60, money: 0, talents: picks })
    if (picks === undefined) delete g.character.talents
    const kid = createPerson(g, { relation: 'child', age: childAge, gender: 'female' })
    g.character.alive = false
    g.character.causeOfDeath = 'Heart Disease'
    return { g, kid: kid.id }
  }

  it("doesn't hand down the picks, but a gift can run in the family", () => {
    let inherited = 0
    let none = 0
    for (let seed = 1; seed <= 60; seed++) {
      const { g, kid } = family(seed, 30, ['Business', 'Investing', 'Acting'])
      const n = continueAsChild(g, kid)
      expect(n.character.id).toBe(kid)
      const got = n.character.talents
      if (got) {
        expect(got).toHaveLength(1)
        expect(['Business', 'Investing', 'Acting']).toContain(got[0])
        expect(n.character.talent).not.toBe(got[0])
        expect(n.flags.talentsRevealed).toEqual(got)
        const intro = n.queue.find((m) => m.kind === 'notice' && m.title.startsWith('Generation'))
        expect(intro && intro.kind === 'notice' ? intro.text : '').toMatch(new RegExp(`Like your father, you have a natural gift for ${got[0].toLowerCase()}`))
        expect(n.character.memories.some((m) => m.includes(`gift for ${got[0].toLowerCase()}`))).toBe(true)
        inherited++
      } else {
        none++
      }
      // The late parent keeps their own picks in the history.
      expect(g.character.talents).toEqual(['Business', 'Investing', 'Acting'])
    }
    expect(inherited).toBeGreaterThan(10)
    expect(none).toBeGreaterThan(10)
  })

  it('a young heir discovers an inherited gift in childhood', () => {
    let checked = 0
    for (let seed = 1; seed <= 40 && checked < 5; seed++) {
      const { g, kid } = family(seed, 3, ['Leadership'])
      const n = continueAsChild(g, kid)
      if (!n.character.talents) continue
      expect(n.flags.talentsRevealed).toBeUndefined()
      n.queue = []
      const texts = [...growUp(n, 12).values()].flat()
      expect(texts.filter((t) => /talent for leadership/.test(t))).toHaveLength(1)
      checked++
    }
    expect(checked).toBe(5)
  })

  it('leaves heirs of a life without picks exactly as before', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = family(seed, 25, undefined)
      const b = family(seed, 25, [])
      const na = continueAsChild(a.g, a.kid)
      const nb = continueAsChild(b.g, b.kid)
      expect('talents' in na.character).toBe(false)
      expect('talents' in nb.character).toBe(false)
      expect(na.character).toEqual(nb.character)
      expect(na.rng).toBe(nb.rng)
    }
  })
})

describe('talents on the CV and in the AI context', () => {
  it('adds a CV entry per talent except Crime, with matching tags', () => {
    const g = makeTestGame(1, { age: 25, talents: ['Business', 'Crime', 'Gaming'], talent: 'Music' })
    const entries = cvEntries(g).filter((e) => e.title.startsWith('Natural talent'))
    expect(entries.map((e) => e.title).sort()).toEqual(['Natural talent: Business', 'Natural talent: Gaming', 'Natural talent: Music'])
    const tags = (t: string) => entries.find((e) => e.title.endsWith(t))!.tags
    expect(tags('Business')).toEqual(['business', 'finance'])
    expect(tags('Gaming')).toEqual(['tech', 'arts'])
    expect(tags('Music')).toEqual(['music', 'arts'])
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length)
    expect(entries.find((e) => e.title.endsWith('Music'))!.detail).toBe('Discovered as a kid')
    expect(entries.find((e) => e.title.endsWith('Business'))!.detail).toBe('A gift since birth')
  })

  it('remembers every talent in the obituary', () => {
    const g = makeTestGame(1, { age: 25, talents: ['Investing', 'Leadership'], talent: 'Art' })
    g.character.alive = false
    g.character.causeOfDeath = 'Old Age'
    expect(fallbackObituary(g)).toContain('a real gift for investing, leadership and art')
    const plain = makeTestGame(1, { age: 25 })
    plain.character.alive = false
    plain.character.causeOfDeath = 'Old Age'
    expect(fallbackObituary(plain)).not.toContain('a real gift')
  })
})
