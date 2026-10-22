// ci: fast
// R2-K10 (K.3 f): src/game/special.ts registers its 13 yearly hooks, 11 career menus and 11 job-node lists with the kernel registry
// (modules special.<name>), and yearlySpecial, specialCareersMenu and specialJobNodes read the registry back.
//
// test/kernel-parity.test.ts holds what the conversion must not change: the hook names and their order, the state after N seeded years,
// the menu trees. This file holds what parity cannot see:
//   - the phase and order each entry sits in (a track that inserts between two picks its own by them);
//   - that each entry calls the function it is named for (parity sees the entry's name, and a life that never takes the career never
//     runs its hook), checked by spying on the 13 hooks and the 11 job lists;
//   - that importing special.ts alone is enough: the registry is filled by special.ts itself, not by modules/index.ts;
//   - that a track extends the yearly seam, the careers menu and the jobs list with one registration, and that a dead character
//     stops the yearly loop before the next hook, as it always did;
//   - the "unknown special job" fallback, which no other test reaches.
//
// No pinned seed: the games are makeTestGame's own, with a tuple of arguments.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { collectMenu, getModule, menuEntries, withYearly, yearlyEntries } from '../src/game/kernel/registry'
import { specialCareersMenu, specialJobNodes, yearlySpecial } from '../src/game/special'
import * as actor from '../src/game/special/actor'
import * as astronaut from '../src/game/special/astronaut'
import * as author from '../src/game/special/author'
import * as gamedev from '../src/game/special/gamedev'
import * as hustler from '../src/game/special/hustler'
import * as careersKit from '../src/game/special/kit/careers'
import * as military from '../src/game/special/military'
import * as model from '../src/game/special/model'
import * as music from '../src/game/special/music'
import * as politics from '../src/game/special/politics'
import * as social from '../src/game/special/social'
import * as sports from '../src/game/special/sports'
import * as fame from '../src/game/special/fame'
import * as business from '../src/game/business'
import type { GameState, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'
import { navState } from './nav-kit'

type Seam = readonly [phase: string, order: number]

/**
 * The pinned table (R2 Kernel plan, K10): name, the yearly entry (phase, order) or null, the `special.careers` order or null, the
 * `special.jobs` order or null. Each module has at most one entry in each seam or slot, so an entry's id is its module's id.
 */
const TABLE: readonly (readonly [name: string, yearly: Seam | null, careers: number | null, jobs: number | null])[] = [
  ['military', ['service', 10], null, 10],
  ['actor', ['careers', 10], 10, 20],
  ['astronaut', ['careers', 80], 20, 90],
  ['author', ['careers', 50], 30, 60],
  ['social', ['public', 10], 40, null],
  ['model', ['careers', 60], 50, 70],
  ['music', ['careers', 20], 60, 30],
  ['politics', ['careers', 70], 70, 80],
  ['sports', ['careers', 30], 80, 40],
  ['gamedev', ['careers', 40], 90, 50],
  ['hustler', ['careers', 100], 100, 100],
  ['business', null, 110, 110],
  ['careers2', ['careers', 90], null, null],
  ['fame', ['public', 20], null, null],
]

/** The 13 hooks as special.ts ran them before the registry: this order is the one fixed in test/fixtures/kernel-parity.json. */
const OLD_YEARLY = ['military', 'actor', 'music', 'sports', 'gamedev', 'author', 'model', 'politics', 'astronaut', 'careers2', 'hustler', 'social', 'fame']

/** The job lists in the order specialJobNodes called them. */
const OLD_JOBS = ['military', 'actor', 'music', 'sports', 'gamedev', 'author', 'model', 'politics', 'astronaut', 'hustler', 'business']

/** The career menus in the order specialCareersMenu listed them (`influencer` is special.ts's own). */
const OLD_CAREERS = ['actor', 'astronaut', 'author', 'influencer', 'model', 'music', 'politics', 'sports', 'gamedev', 'hustler', 'business']

const ids = (nodes: readonly MenuNode[]): string[] => nodes.map((n) => n.id)
const special = (names: readonly string[]): string[] => names.map((n) => `special.${n}`)

function adult(): GameState {
  return makeTestGame(7, { age: 30, money: 50_000 })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('special.ts registers the careers as modules in the pinned phases', () => {
  it('there are 14 modules special.<name>, each in the table: layer 3, its yearly entry, its two menu entries', () => {
    expect(TABLE).toHaveLength(14)
    for (const [name, yearly, careers, jobs] of TABLE) {
      const def = getModule(`special.${name}`)
      expect(def, `module special.${name}`).toBeDefined()
      expect(def!.layer, name).toBe(3)
      expect(def!.yearly, name).toEqual(yearly ? [{ seam: 'special', phase: yearly[0], order: yearly[1], run: expect.any(Function) }] : undefined)
      const menus = [
        ...(careers === null ? [] : [{ path: 'special.careers', order: careers, build: expect.any(Function) }]),
        ...(jobs === null ? [] : [{ path: 'special.jobs', order: jobs, build: expect.any(Function) }]),
      ]
      expect(def!.menus, name).toEqual(menus.length > 0 ? menus : undefined)
    }
  })

  it('the 13 yearly entries are in today\'s order, named by their module ids (13 modules have one, business has none)', () => {
    expect(yearlyEntries('special').map((e) => e.id)).toEqual(special(OLD_YEARLY))
    expect(yearlyEntries('special').every((e) => e.seam === 'special')).toBe(true)
  })

  it('the career menus are in today\'s order (11) and the job lists too (11), by module', () => {
    expect(menuEntries('special.careers').map((e) => e.id)).toEqual(special(OLD_CAREERS.map((n) => (n === 'influencer' ? 'social' : n))))
    expect(menuEntries('special.jobs').map((e) => e.id)).toEqual(special(OLD_JOBS))
  })

  it('the orders are multiples of ten, so a track can insert between two, and the phases are phases of the special seam', () => {
    for (const [name, yearly, careers, jobs] of TABLE) {
      for (const o of [yearly?.[1], careers, jobs]) if (o !== null && o !== undefined) expect(o % 10, name).toBe(0)
    }
    for (const [name, yearly] of TABLE) if (yearly) expect(['service', 'careers', 'public'], name).toContain(yearly[0])
  })
})

describe('each entry calls the function it is named for', () => {
  it('yearlySpecial runs yearlyMilitary, yearlyActor, ... yearlyFame once each, in the old order', () => {
    const trace: string[] = []
    const probe = (name: string) => (): void => void trace.push(name)
    vi.spyOn(military, 'yearlyMilitary').mockImplementation(probe('military'))
    vi.spyOn(actor, 'yearlyActor').mockImplementation(probe('actor'))
    vi.spyOn(music, 'yearlyMusic').mockImplementation(probe('music'))
    vi.spyOn(sports, 'yearlySports').mockImplementation(probe('sports'))
    vi.spyOn(gamedev, 'yearlyGameDev').mockImplementation(probe('gamedev'))
    vi.spyOn(author, 'yearlyAuthor').mockImplementation(probe('author'))
    vi.spyOn(model, 'yearlyModel').mockImplementation(probe('model'))
    vi.spyOn(politics, 'yearlyPolitics').mockImplementation(probe('politics'))
    vi.spyOn(astronaut, 'yearlyAstronaut').mockImplementation(probe('astronaut'))
    vi.spyOn(careersKit, 'yearlyCareerSims').mockImplementation(probe('careers2'))
    vi.spyOn(hustler, 'yearlyHustler').mockImplementation(probe('hustler'))
    vi.spyOn(social, 'yearlySocial').mockImplementation(probe('social'))
    vi.spyOn(fame, 'yearlyFame').mockImplementation(probe('fame'))
    yearlySpecial(adult())
    expect(trace).toEqual(OLD_YEARLY)
  })

  it('specialJobNodes asks military, actor, music, sports, gamedev, author, model, politics, astronaut, hustler and business, in that order', () => {
    const probe = (name: string) => (): MenuNode[] => [{ type: 'info', id: `probe.${name}`, text: name }]
    vi.spyOn(military, 'militaryJobNodes').mockImplementation(probe('military'))
    vi.spyOn(actor, 'actorJobNodes').mockImplementation(probe('actor'))
    vi.spyOn(music, 'musicJobNodes').mockImplementation(probe('music'))
    vi.spyOn(sports, 'sportsJobNodes').mockImplementation(probe('sports'))
    vi.spyOn(gamedev, 'gameDevJobNodes').mockImplementation(probe('gamedev'))
    vi.spyOn(author, 'authorJobNodes').mockImplementation(probe('author'))
    vi.spyOn(model, 'modelJobNodes').mockImplementation(probe('model'))
    vi.spyOn(politics, 'politicsJobNodes').mockImplementation(probe('politics'))
    vi.spyOn(astronaut, 'astronautJobNodes').mockImplementation(probe('astronaut'))
    vi.spyOn(hustler, 'hustlerJobNodes').mockImplementation(probe('hustler'))
    vi.spyOn(business, 'businessJobNodes').mockImplementation(probe('business'))
    const g = adult()
    g.character.job = { defId: 'ghost', title: 'Ghost', company: 'Nowhere Ltd', category: 'special', salary: 0, level: 0, performance: 50, yearsInRole: 0, yearsAtCompany: 0, data: {} }
    expect(ids(specialJobNodes(g))).toEqual(OLD_JOBS.map((n) => `probe.${n}`))
    expect(ids(collectMenu('special.jobs', g))).toEqual(OLD_JOBS.map((n) => `probe.${n}`))
  })

  it('collectMenu(\'special.careers\') is the 11 career menus themselves, not copies, in the old order', () => {
    const nodes = collectMenu('special.careers', adult())
    expect(nodes).toHaveLength(11)
    expect(nodes[0]).toBe(actor.actorCareerMenu)
    expect(nodes[1]).toBe(astronaut.astronautCareerMenu)
    expect(nodes[2]).toBe(author.authorCareerMenu)
    expect(nodes[3]!.id).toBe('special.influencer')
    expect(nodes[4]).toBe(model.modelCareerMenu)
    expect(nodes[5]).toBe(music.musicCareerMenu)
    expect(nodes[6]).toBe(politics.politicsCareerMenu)
    expect(nodes[7]).toBe(sports.sportsCareerMenu)
    expect(nodes[8]).toBe(gamedev.gameIndustryMenu)
    expect(nodes[9]).toBe(hustler.hustlerCareerMenu)
    expect(nodes[10]).toBe(business.businessCareerMenu)
  })
})

describe('the Special Careers menu', () => {
  it('lists the 11 career menus, Influencer fourth, in a real adult life (navState)', () => {
    const g = navState('adult')
    const want = ids(collectMenu('special.careers', g))
    expect(want).toHaveLength(11)
    expect(want[3]).toBe('special.influencer')
    expect(want.slice(0, 3)).toEqual(['special.actor', 'special.astronaut', 'special.author'])
    expect(ids(specialCareersMenu.children(g))).toEqual(want)
  })

  it('children builds a new list on every call, so a caller that edits one changes nothing', () => {
    const g = adult()
    const a = specialCareersMenu.children(g)
    const b = specialCareersMenu.children(g)
    expect(a).not.toBe(b)
    a.pop()
    expect(specialCareersMenu.children(g)).toHaveLength(11)
  })
})

describe('specialJobNodes', () => {
  it('is empty for a character with no job, a dead one and one in prison', () => {
    const g = adult()
    expect(specialJobNodes(g)).toEqual([])
    g.character.job = { defId: 'ghost', title: 'Ghost', company: 'Nowhere Ltd', category: 'special', salary: 0, level: 0, performance: 50, yearsInRole: 0, yearsAtCompany: 0, data: {} }
    g.character.alive = false
    expect(specialJobNodes(g)).toEqual([])
    g.character.alive = true
    g.character.prison = { name: 'County Jail', security: 'minimum', crime: 'fraud', sentenceYears: 2, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 }
    expect(specialJobNodes(g)).toEqual([])
  })

  it('is empty for an ordinary job no special module owns (no fallback: it is not a special job)', () => {
    const g = adult()
    g.character.job = { defId: 'clerk', title: 'Clerk', company: 'Acme', category: 'fulltime', salary: 40_000, level: 0, performance: 50, yearsInRole: 1, yearsAtCompany: 1, data: {} }
    expect(specialJobNodes(g)).toEqual([])
  })

  for (const category of ['special', 'military'] as const) {
    it(`keeps the Quit fallback for a ${category} job no module recognizes, and Quit ends it`, () => {
      const g = adult()
      g.character.job = { defId: 'ghost', title: 'Ghost', company: 'Nowhere Ltd', category, salary: 0, level: 0, performance: 50, yearsInRole: 0, yearsAtCompany: 0, data: {} }
      const nodes = specialJobNodes(g)
      expect(ids(nodes)).toEqual(['special.unknown', 'special.unknown.quit'])
      const quit = nodes[1]
      if (quit?.type !== 'action') throw new Error('the fallback has no Quit action')
      expect(quit.label).toBe('Quit')
      quit.run(g)
      expect(g.character.job).toBeNull()
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// A fresh registry that holds only what special.ts itself registered, and what a track adds to it
// ---------------------------------------------------------------------------------------------------------------------

describe('special.ts alone fills the registry, and a track extends it with one registration', () => {
  type Registry = typeof import('../src/game/kernel/registry')
  type SpecialModule = typeof import('../src/game/special')
  let reg: Registry
  let sp: SpecialModule
  let base: { yearly: string[]; careers: string[]; jobs: string[] }

  beforeAll(async () => {
    vi.resetModules()
    reg = await import('../src/game/kernel/registry')
    sp = await import('../src/game/special')
    base = {
      yearly: reg.yearlyEntries('special').map((e) => e.id),
      careers: reg.menuEntries('special.careers').map((e) => e.id),
      jobs: reg.menuEntries('special.jobs').map((e) => e.id),
    }
  }, 60_000)

  it('after importing special.ts and nothing else, the registry has the 13 yearly entries and the 11 + 11 menu entries, in order', () => {
    expect(base.yearly).toEqual(special(OLD_YEARLY))
    expect(base.careers).toEqual(special(OLD_CAREERS.map((n) => (n === 'influencer' ? 'social' : n))))
    expect(base.jobs).toEqual(special(OLD_JOBS))
    expect(reg.getModule('special.fame')).toBeDefined()
  })

  it('a module on special.careers with order 45 sits between Influencer and Model, in the real menu', () => {
    const node: MenuNode = { type: 'info', id: 'ext.k10.careerrow', text: 'An extra career' }
    reg.registerModule({ id: 'ext.k10careers', layer: 3, menus: [{ path: 'special.careers', order: 45, build: () => [node] }] })
    const g = adult()
    const shown = ids(sp.specialCareersMenu.children(g))
    expect(shown).toHaveLength(12)
    expect(shown.indexOf('ext.k10.careerrow')).toBe(shown.indexOf('special.influencer') + 1)
    expect(shown[shown.indexOf('ext.k10.careerrow') + 1]).toBe('special.model')
  })

  it('a module on special.jobs with order 55 sits between Gamedev and Author, in the real job list', () => {
    const row: MenuNode = { type: 'info', id: 'ext.k10.jobrow', text: 'An extra job row' }
    reg.registerModule({ id: 'ext.k10jobs', layer: 3, menus: [{ path: 'special.jobs', order: 55, build: () => [row] }] })
    const g = adult()
    g.character.job = { defId: 'ghost', title: 'Ghost', company: 'Nowhere Ltd', category: 'special', salary: 0, level: 0, performance: 50, yearsInRole: 0, yearsAtCompany: 0, data: {} }
    // the ghost job is unrecognized by every module, but the extension answers, so the fallback is not offered
    expect(ids(sp.specialJobNodes(g))).toEqual(['ext.k10.jobrow'])
    expect(reg.menuEntries('special.jobs').map((e) => e.id)).toEqual([...base.jobs.slice(0, 5), 'ext.k10jobs', ...base.jobs.slice(5)])
  })

  it('a module on the special yearly seam in phase public with order 15 runs once a year between social and fame', () => {
    const seen: string[] = []
    reg.registerModule({ id: 'ext.k10between', layer: 3, yearly: [{ seam: 'special', phase: 'public', order: 15, run: () => void seen.push('ext') }] })
    const list = reg.yearlyEntries('special').map((e) => e.id)
    expect(list.indexOf('ext.k10between')).toBe(list.indexOf('special.social') + 1)
    expect(list.indexOf('ext.k10between')).toBe(list.indexOf('special.fame') - 1)
    // the real loop: yearlySpecial walks the registry, so the extension runs in place
    const trace: string[] = []
    const g = adult()
    reg.withYearly(
      'special',
      reg.yearlyEntries('special').map((e) => ({
        ...e,
        run: (gg: GameState) => {
          trace.push(e.id)
          e.run(gg)
        },
      })),
      () => sp.yearlySpecial(g),
    )
    expect(seen).toEqual(['ext'])
    expect(trace.slice(-3)).toEqual(['special.social', 'ext.k10between', 'special.fame'])
    expect(trace).toHaveLength(14)
  })

  it('a dead character runs no hook, and a death part-way stops the loop before the next hook', () => {
    const trace: string[] = []
    let kill = false
    reg.registerModule({
      id: 'ext.k10probe',
      layer: 3,
      yearly: [
        { seam: 'special', phase: 'service', order: 0, run: () => void trace.push('first') },
        { seam: 'special', phase: 'careers', order: 5, run: (g) => void (kill ? (g.character.alive = false) : trace.push('mid')) },
        { seam: 'special', phase: 'public', order: 17, run: () => void trace.push('late') },
      ],
    })
    const dead = adult()
    dead.character.alive = false
    sp.yearlySpecial(dead)
    expect(trace).toEqual([])

    sp.yearlySpecial(adult())
    expect(trace).toEqual(['first', 'mid', 'late'])

    trace.length = 0
    kill = true
    const g = adult()
    sp.yearlySpecial(g)
    expect(g.character.alive).toBe(false)
    expect(trace).toEqual(['first'])
  })
})

describe('the registry is the only list', () => {
  it('withYearly on the special seam changes what yearlySpecial runs, and puts it back', () => {
    const trace: string[] = []
    const only = { seam: 'special' as const, phase: 'public', order: 10, run: () => void trace.push('only') }
    withYearly('special', [only], () => yearlySpecial(adult()))
    expect(trace).toEqual(['only'])
    expect(yearlyEntries('special')).toHaveLength(13)
  })
})
