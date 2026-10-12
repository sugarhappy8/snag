// Era gating, part two: the clinic, the university, company names, car lots and hangars, the
// attic, concerts and festivals, fame merchandise and game studios all follow the calendar, and
// the era-gated menus never mention things that didn't exist yet (checked with the shared
// anachronism detector from events/era.ts). Lives in PRESENT_YEAR keep everything.
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { searchAttic, vehicleListings, electronicsStoreMenu } from '../src/game/assets'
import { companyName, fullTimeListings, hiringFreeze, layoffPressure, occupationMenu, partTimeListings } from '../src/game/careers'
import { computerMenu } from '../src/game/computer'
import { computerModel, computersExist } from '../src/game/computer/era'
import { CODING_LANGUAGES, languageBlurb } from '../src/game/computer/skills'
import { COMPANY_WORDS, companyWordsIn } from '../src/game/data/jobs'
import { applyToUniversity, majorsInEra } from '../src/game/education'
import { anachronismsIn } from '../src/game/events/era'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { fertilityMenu, loveMenu } from '../src/game/love'
import { shoppingMenu } from '../src/game/menus'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { ticketEvents } from '../src/game/shops/memberships-tickets'
import { fameMenu, socialMediaMenu } from '../src/game/special'
import { studioEngineFor, studioPlatformFor, teamScale } from '../src/game/special/gamedev-data'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function adult(year: number, countryId = 'us', age = 30, money = 5_000_000): GameState {
  const g = makeTestGame(17, { age, countryId, money })
  g.year = year
  g.log = [{ age, year, entries: [] }]
  return g
}

function visibleIds(g: GameState, nodes: MenuNode[]): string[] {
  return nodes.filter((n) => !n.visible || n.visible(g)).map((n) => n.id)
}

describe('family planning by era', () => {
  it('opens IVF, donors and surrogates only once medicine has them', () => {
    const g = adult(1955)
    g.character.gender = 'female'
    const at = (year: number) => {
      g.year = year
      return visibleIds(g, fertilityMenu.children(g))
    }
    expect(at(1955)).not.toContain('ivf')
    expect(at(1955)).not.toContain('surrogate')
    expect(at(1955)).not.toContain('insemination')
    expect(at(1955)).toContain('birthControl')
    expect(at(1980)).toContain('ivf')
    expect(at(1980)).not.toContain('surrogate')
    expect(at(PRESENT_YEAR)).toEqual(expect.arrayContaining(['birthControl', 'ivf', 'insemination', 'surrogate', 'sterilize']))
    // Poorer countries get IVF later, but everyone has it today.
    const poor = adult(1982, 'ng')
    expect(visibleIds(poor, fertilityMenu.children(poor))).not.toContain('ivf')
    poor.year = PRESENT_YEAR
    expect(visibleIds(poor, fertilityMenu.children(poor))).toContain('ivf')
  })
})

describe('universities by era', () => {
  it('offers no computer science degree before computers', () => {
    expect(majorsInEra(1950, 'us')).not.toContain('Computer Science')
    expect(majorsInEra(PRESENT_YEAR, 'us')).toContain('Computer Science')
    const g = adult(1950, 'us', 18)
    g.character.education.degrees = [{ kind: 'highschool', name: 'High School Diploma', school: 'Lincoln High School', age: 18 }]
    applyToUniversity(g, 'Computer Science')
    const n = g.queue.find((m) => m.kind === 'notice')
    expect(n && n.kind === 'notice' ? n.text : '').toMatch(/Nobody teaches Computer Science/)
    expect(g.character.education.current).toBeNull()
  })
})

describe('company names by era', () => {
  it('names employers with the words of the day', () => {
    expect(companyWordsIn(COMPANY_WORDS.techSuffix, 1976)).not.toContain('Apps')
    expect(companyWordsIn(COMPANY_WORDS.techSuffix, 1976)).not.toContain('Cloud')
    expect(companyWordsIn(COMPANY_WORDS.techSuffix, PRESENT_YEAR)).toEqual(COMPANY_WORDS.techSuffix)
    const g = adult(1930)
    let seed = 1
    const r = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 60; i++) {
      expect(companyName(g, 'mall', r)).not.toMatch(/Mall/)
      expect(companyName(g, 'tech', r)).not.toMatch(/Apps|Cloud|Digital|Networks|Software/)
    }
    g.year = 1976
    for (let i = 0; i < 8; i++) {
      g.flags.jobListingSeed = 300 + i * 41
      for (const l of [...fullTimeListings(g), ...partTimeListings(g)]) expect(l.company).not.toMatch(/ (Apps|Cloud|Digital)$/)
    }
  })
})

describe('recessions in the job market', () => {
  it('freezes hiring and lays people off in real downturns, never in the present', () => {
    const at = (year: number) => {
      const g = adult(year)
      return { freeze: hiringFreeze(g), tech: layoffPressure(g, 'tech'), bank: layoffPressure(g, 'bank') }
    }
    expect(at(1931).freeze).toBe(true)
    expect(at(1931).bank).toBeGreaterThan(1)
    expect(at(2001).tech).toBeGreaterThan(0.5)
    expect(at(2009).freeze).toBe(true)
    expect(at(2008).bank).toBeGreaterThan(1)
    for (const y of [1929, 2010, 2025, PRESENT_YEAR, PRESENT_YEAR + 5]) expect(at(y).freeze, String(y)).toBe(false)
    for (const y of [PRESENT_YEAR, PRESENT_YEAR + 5]) {
      expect(at(y).tech).toBe(0)
      expect(at(y).bank).toBe(0)
    }
    // A freeze means fewer openings on the board.
    const slump = adult(1932)
    const boom = adult(1928)
    expect(fullTimeListings(slump).length).toBeLessThan(fullTimeListings(boom).length)
  })
})

describe('shops, hangars, the attic and the box office by era', () => {
  it('sells the boats and aircraft of the day', () => {
    const g = adult(1930)
    const names = [...vehicleListings(g, 'aircraft'), ...vehicleListings(g, 'boat')].map((l) => l.label)
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) expect(n).not.toMatch(/Jet|Helicopter|Ultralight|Vintage Biplane|Superyacht/)
    g.year = PRESENT_YEAR
    expect(vehicleListings(g, 'aircraft').length).toBeGreaterThan(0)
    // The electronics store describes its own era.
    g.year = 1930
    expect(String(typeof electronicsStoreMenu.subtitle === 'function' ? electronicsStoreMenu.subtitle(g) : electronicsStoreMenu.subtitle)).not.toMatch(/phone|laptop|console/i)
    g.year = PRESENT_YEAR
    expect(typeof electronicsStoreMenu.subtitle === 'function' ? electronicsStoreMenu.subtitle(g) : electronicsStoreMenu.subtitle).toBe('Phones, laptops, consoles and gadgets')
  })

  it('never finds tomorrow in the attic', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const g = makeTestGame(seed, { age: 12 })
      g.year = 1950
      const found = searchAttic(g)
      if (found) expect(found.name).not.toMatch(/Pager|1987|1993|2007|2010|World Cup|Retro Game Console|VHS|Moonwalker|Digital Telescope|December 31, 1999/)
    }
  })

  it('books the concerts, festivals and parks of the day', () => {
    const g = adult(1950)
    for (let y = 1950; y < 1955; y++) {
      g.year = y
      const concerts = ticketEvents(g, 'concert')
      for (const e of concerts) expect(e.genre).not.toMatch(/^(hiphop|edm|kpop|metal|indie|rock|pop)$/)
      for (const e of ticketEvents(g, 'themepark')) {
        expect(e.title).not.toMatch(/Water Park/)
        expect(e.where).toMatch(/Amusement park/)
      }
      for (const e of ticketEvents(g, 'festival')) expect(e.title).not.toMatch(/Dustbowl|Sunset Valley/)
    }
    g.year = PRESENT_YEAR
    expect(ticketEvents(g, 'themepark').every((e) => !/Amusement park/.test(e.where))).toBe(true)
  })

  it('makes fame merchandise of the era', () => {
    const g = adult(1950)
    g.character.hidden.fame = 90
    const merch = fameMenu.children(g).find((n) => n.id === 'fame.merch') as MenuAction
    merch.run(g)
    const offer = g.queue.find((m) => m.kind === 'choice')
    const labels = offer && offer.kind === 'choice' ? offer.choices.map((c) => c.label).join(' ') : ''
    expect(labels).toMatch(/Postcards/)
    expect(labels).not.toMatch(/Energy Drink|Hoodies/)
  })
})

describe('coding words and game studios by era', () => {
  it('describes languages in the words of the year', () => {
    const java = CODING_LANGUAGES.find((l) => l.id === 'java')!
    const g = adult(1998)
    expect(languageBlurb(g, java)).not.toMatch(/phone apps/)
    g.year = PRESENT_YEAR
    expect(languageBlurb(g, java)).toBe(java.good)
  })

  it('picks platforms, engines and team sizes a studio could have had', () => {
    expect(studioPlatformFor(4, 1985)).not.toBe('multi')
    expect(studioPlatformFor(4, PRESENT_YEAR)).toBe('multi')
    expect(studioPlatformFor(3, PRESENT_YEAR)).toBe('console')
    expect(studioPlatformFor(1, PRESENT_YEAR)).toBe('pc')
    expect(studioEngineFor(3, 1990)).toBe('homebrew')
    expect(studioEngineFor(3, PRESENT_YEAR)).toBe('titan')
    expect(studioEngineFor(1, PRESENT_YEAR)).toBe('cobalt')
    expect(teamScale(1985)).toBeLessThan(teamScale(2005))
    expect(teamScale(PRESENT_YEAR)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// The anachronism guard for the era-gated menus

function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return { pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)], int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) }
}

/**
 * Menus owned by other features (they have their own era checks). computer.none is computer.ts's
 * own "you don't have a computer" line (era wording lives in computer/era.ts noComputerText).
 */
const FOREIGN = /^(cv\.|special|military|biz|business|investments|gameIndustry|computer\.none$)/

function texts(g: GameState, nodes: MenuNode[], out: { text: string; where: string }[], acts: MenuAction[], path: string, depth = 0): void {
  if (depth > 5) return
  for (const n of nodes) {
    if (FOREIGN.test(n.id)) continue
    if (n.visible && !n.visible(g)) continue
    const where = `${path}>${n.id}`
    if ('label' in n && typeof n.label === 'string') out.push({ text: n.label, where })
    if ('subtitle' in n) out.push({ text: typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''), where })
    if (n.type === 'info') out.push({ text: typeof n.text === 'function' ? n.text(g) : n.text, where })
    const blocked = 'disabledReason' in n && n.disabledReason ? n.disabledReason(g) : null
    if (blocked) {
      out.push({ text: blocked, where })
      continue
    }
    if (n.type === 'menu') {
      if (n.header) out.push({ text: n.header(g), where })
      texts(g, n.children(g), out, acts, where, depth + 1)
    } else if (n.type === 'action') acts.push(n)
  }
}

function drainTexts(g: GameState, out: { text: string; where: string }[], where: string, d: ReturnType<typeof driver>): void {
  for (let guard = 0; g.queue.length > 0 && guard < 100; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'notice') out.push({ text: `${m.title} :: ${m.text}`, where })
    else if (m.kind === 'choice') {
      out.push({ text: `${m.title} :: ${m.text}`, where })
      for (const c of m.choices) out.push({ text: c.label, where })
      const c = d.pick(m.choices)
      if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
    } else if (m.kind === 'input') {
      out.push({ text: `${m.title} :: ${m.text ?? ''}`, where })
      runScript(g, m.scriptId, m.input === 'number' ? String(d.int(m.min ?? 1, Math.min(m.max ?? 1000, (m.min ?? 1) + 1000))) : m.defaultValue || 'Alex', m.data, m)
    } else if (m.kind === 'minigame') runScript(g, m.scriptId, m.game === 'annualReport' ? 'skip' : 'done', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
  for (const y of g.log) for (const e of y.entries) out.push({ text: e.text, where: `${where} (log)` })
}

describe('anachronism guard for the era-gated menus', () => {
  it('never mentions things that did not exist yet', () => {
    const menus: [string, MenuGroup][] = [
      ['computer', computerMenu],
      ['social', socialMediaMenu],
      ['fame', fameMenu],
      ['love', loveMenu],
      ['occupation', occupationMenu],
      ['shopping', shoppingMenu],
    ]
    const bad = new Map<string, string>()
    let seed = 0
    for (const year of [1915, 1948, 1972, 1989, 2001]) {
      for (const countryId of ['us', 'in']) {
        for (const age of [15, 34]) {
          seed++
          const d = driver(seed)
          for (const [name, menu] of menus) {
            const base = adult(year, countryId, age)
            base.character.hidden.fame = 85
            base.flags.codingSkill = 70
            if (age < 18) for (const gender of ['male', 'female'] as const) createPerson(base, { relation: 'parent', age: age + 28, gender, relationship: 80, livesWithPlayer: true, money: 90_000 })
            else base.character.residence = { status: 'renting', rent: 12_000 }
            // A computer only where home computers exist (nobody owns one in 1915).
            if (computersExist(base)) base.assets.push({ id: 'pc', kind: 'other', name: computerModel(base).name, emoji: '\u{1F5A5}\u{FE0F}', purchasePrice: 1000, value: 500, condition: 100, purchasedAge: age, upkeep: 0, details: {} })
            const seen: { text: string; where: string }[] = []
            const acts: MenuAction[] = []
            texts(base, menu.children(base), seen, acts, name)
            for (const a of acts) {
              if (a.id === 'surrenderLife') continue
              const g = structuredClone(base)
              const input = a.input ? (a.input.kind === 'number' ? String(d.int(a.input.min ?? 1, Math.min(a.input.max ?? 5000, (a.input.min ?? 1) + 5000))) : (a.input.defaultValue?.(g) ?? 'Alex')) : undefined
              a.run(g, input)
              drainTexts(g, seen, `${name}>${a.id}`, d)
            }
            for (const s of seen) {
              // A celebrity name from special/common.ts, not a jet.
              const rules = anachronismsIn(s.text.replace(/Jasmine Jetset/g, 'Jasmine'), year, [countryId])
              if (rules.length) bad.set(`${rules.join(',')}|${s.text.slice(0, 120)}`, `[${rules.join(',')}] ${year} ${countryId} (${s.where}): ${s.text.slice(0, 200)}`)
            }
          }
        }
      }
    }
    const report = [...bad.values()].join('\n')
    expect(bad.size, report.slice(0, 4000)).toBe(0)
  }, 300_000)
})

describe('club application rejections follow the calendar', () => {
  it('a 1962 committee asks around instead of searching your name online', async () => {
    const { joinMembership } = await import('../src/game/shops/memberships')
    const texts = (year: number): string[] => {
      const out: string[] = []
      for (let seed = 1; seed <= 80; seed++) {
        const g = makeTestGame(seed, { age: 45, money: 50_000_000 })
        g.year = year
        g.character.hidden.notoriety = 60
        joinMembership(g, 'golf', 'full')
        for (const m of g.queue) if (m.kind === 'notice' && m.title === 'Application Rejected') out.push(m.text)
      }
      return out
    }
    const early = texts(1962), modern = texts(2020)
    expect(early.length).toBeGreaterThan(10)
    expect(early.some((t) => /online/.test(t))).toBe(false)
    expect(early.some((t) => /asked around/.test(t))).toBe(true)
    expect(modern.some((t) => /searched your name online/.test(t))).toBe(true)
  })
})
