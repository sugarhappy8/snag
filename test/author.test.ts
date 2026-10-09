// The Author career: durable owner-scoped state, career/work gates, complete book and serial
// loops, publishing money, residuals, adaptations, menu scripts and adversarial stale actions.
import { describe, expect, it } from 'vitest'
import { craftSkill } from '../src/game/activities/creative'
import { cvEntries } from '../src/game/cv'
import { runScript } from '../src/game/scripts'
import { specialCareersMenu, specialJobNodes, yearlySpecial } from '../src/game/special'
import {
  abandonAuthorWork,
  authorAdaptationOffer,
  authorCareerBlock,
  authorPublisherOffer,
  authorSelfPublishCost,
  authorWorkBlock,
  endAuthorSeries,
  licenseAuthorAdaptation,
  practiceAuthor,
  publishAuthorWork,
  quitAuthorCareer,
  setAuthorFocus,
  setAuthorPace,
  startAuthorCareer,
  startAuthorWork,
  toggleAuthorHiatus,
  workOnAuthorWork,
  yearlyAuthor,
} from '../src/game/special/author-career'
import { AUTHOR_FORMATS, formatAvailable } from '../src/game/special/author-data'
import { authorMut, authorView, normalizeAuthor, saveAuthor, type AuthorProfile, type AuthorWork } from '../src/game/special/author-state'
import { ownerKey } from '../src/game/special/common'
import { authorCareerMenu, authorJobNodes } from '../src/game/special/author'
import type { GameState, Json, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

function game(seed = 1, countryId = 'us'): GameState {
  const g = makeTestGame(seed, { age: 30, countryId, birthCountryId: countryId, city: 'Test City', money: 1_000_000 })
  g.log = [{ age: 30, year: g.year, entries: [] }]
  return g
}

function nextYear(g: GameState): void {
  g.character.age += 1
  g.year += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.log.push({ age: g.character.age, year: g.year, entries: [] })
}

function clearQueue(g: GameState): void {
  g.queue = []
}

function skills(g: GameState, writing = 100, art = 100): void {
  g.flags['skill.writing'] = writing
  g.flags['skill.art'] = art
}

function becomeAuthor(g: GameState, writing = 100, art = 100): void {
  skills(g, writing, art)
  startAuthorCareer(g)
  clearQueue(g)
  expect(g.character.job?.defId).toBe('author')
}

function beginWork(
  g: GameState,
  format: AuthorWork['format'] = 'novella',
  title = `Story ${g.year}`,
  promise: AuthorWork['promise'] = 'characters',
): AuthorWork {
  startAuthorWork(g, { format, genre: 'fantasy', promise, title })
  clearQueue(g)
  const work = authorView(g).works.find((candidate) => candidate.title === title)
  if (!work) throw new Error(`work was not created: ${title}`)
  return work
}

function finishDraft(g: GameState, id: string, sessions: number): AuthorWork {
  for (let i = 0; i < sessions; i++) {
    if (i > 0 && i % 2 === 0) nextYear(g)
    workOnAuthorWork(g, id)
    clearQueue(g)
  }
  const work = authorView(g).works.find((candidate) => candidate.id === id)
  if (!work) throw new Error(`work disappeared: ${id}`)
  return work
}

function visible(g: GameState, node: MenuNode): boolean {
  return !node.visible || node.visible(g)
}

function findNode(g: GameState, root: MenuNode, id: string, depth = 6): MenuNode | undefined {
  if (root.id === id) return root
  if (root.type !== 'menu' || depth <= 0) return undefined
  for (const child of root.children(g).filter((node) => visible(g, node))) {
    const found = findNode(g, child, id, depth - 1)
    if (found) return found
  }
  return undefined
}

function menuAction(g: GameState, root: MenuNode, id: string): MenuAction {
  const node = findNode(g, root, id)
  if (!node || node.type !== 'action') throw new Error(`author menu action not found: ${id}`)
  return node
}

function takeModal<K extends ModalItem['kind']>(g: GameState, kind: K): Extract<ModalItem, { kind: K }> {
  const index = g.queue.findIndex((modal) => modal.kind === kind)
  if (index < 0) throw new Error(`no pending ${kind} modal`)
  return g.queue.splice(index, 1)[0] as Extract<ModalItem, { kind: K }>
}

function answerModal(g: GameState, modal: Extract<ModalItem, { kind: 'choice' | 'input' }>, value: string): void {
  runScript(g, modal.scriptId!, value, modal.data, modal)
}

function inspectMenu(g: GameState, node: MenuNode, depth = 6): void {
  if (!visible(g, node)) return
  if ('subtitle' in node && typeof node.subtitle === 'function') node.subtitle(g)
  if ('disabledReason' in node) node.disabledReason?.(g)
  if ('hint' in node) node.hint?.(g)
  if (node.type === 'action') node.confirm?.(g)
  if (node.type === 'info' && typeof node.text === 'function') node.text(g)
  if (node.type === 'menu' && depth > 0) {
    node.header?.(g)
    for (const child of node.children(g)) inspectMenu(g, child, depth - 1)
  }
}

function workPatch(overrides: Partial<AuthorWork> = {}): AuthorWork {
  return {
    id: 'aw1',
    title: 'The Glass Harbor',
    format: 'novel',
    genre: 'mystery',
    promise: 'mystery',
    stage: 'published',
    countryId: 'us',
    started: 2025,
    released: 2026,
    progress: 100,
    quality: 85,
    chapters: 0,
    readers: 20_000,
    trust: 70,
    hooks: 0,
    arcs: 0,
    volumes: 1,
    copies: 20_000,
    tail: 5_000,
    gross: 100_000,
    earned: 100_000,
    publisher: '',
    share: 1,
    recoup: 0,
    spent: 0,
    focus: 'characters',
    pace: 'steady',
    hiatus: false,
    hiatuses: 0,
    lastYear: 2026,
    adaptedUntil: 0,
    adaptationBase: 0,
    adaptationEarned: 0,
    ...overrides,
  }
}

describe('author state and catalogue data', () => {
  it('defines every format with the intended effort and skill thresholds', () => {
    expect(AUTHOR_FORMATS.map(({ id, effort, minWriting, minArt, serial }) => ({ id, effort, minWriting, minArt, serial }))).toEqual([
      { id: 'novella', effort: 2, minWriting: 10, minArt: 0, serial: false },
      { id: 'novel', effort: 4, minWriting: 30, minArt: 0, serial: false },
      { id: 'saga', effort: 6, minWriting: 60, minArt: 0, serial: false },
      { id: 'manga', effort: 2, minWriting: 25, minArt: 35, serial: true },
      { id: 'manhwa', effort: 2, minWriting: 25, minArt: 35, serial: true },
    ])
  })

  it('gates only new regional comics, without conflating manga and manhwa markets', () => {
    for (const country of ['us', 'gb', 'ae', 'fr']) {
      const g = game(1, country)
      expect(formatAvailable(g, 'manga')).toBe(false)
      expect(formatAvailable(g, 'manhwa')).toBe(false)
      expect(formatAvailable(g, 'novel')).toBe(true)
    }
    expect(formatAvailable(game(1, 'jp'), 'manga')).toBe(true)
    expect(formatAvailable(game(1, 'jp'), 'manhwa')).toBe(false)
    for (const country of ['kr', 'kp', 'cn']) expect(formatAvailable(game(1, country), 'manhwa')).toBe(true)
    expect(formatAvailable(game(1, 'kr'), 'manga')).toBe(false)
  })

  it('normalizes malformed saves into finite bounded plain JSON and repairs duplicate ids', () => {
    const bad = {
      v: 99,
      seq: -5,
      audience: Number.POSITIVE_INFINITY,
      reputation: 500,
      burnout: -20,
      lastYear: Number.NaN,
      awards: ['', '  Finalist  ', 4, 'Winner'],
      works: [
        {
          ...workPatch(),
          id: 'aw9',
          title: '  Valid Work  ',
          format: 'invalid',
          genre: 'invalid',
          promise: 'invalid',
          stage: 'invalid',
          progress: Number.NaN,
          quality: 999,
          readers: -10,
          trust: Number.POSITIVE_INFINITY,
          share: 8,
          recoup: -50,
          pace: 'invalid',
          focus: 'invalid',
        },
        { ...workPatch(), id: 'aw9', title: 'Duplicate' },
        { ...workPatch(), id: '', title: 'Third' },
        { ...workPatch(), id: 'drop', title: '   ' },
      ],
    }
    const p = normalizeAuthor(bad as unknown as Json)
    expect(p).toMatchObject({ v: 1, audience: 0, reputation: 100, burnout: 0, lastYear: -1, awards: ['Finalist', 'Winner'] })
    expect(p.seq).toBeGreaterThanOrEqual(11)
    expect(p.works).toHaveLength(3)
    expect(new Set(p.works.map((w) => w.id)).size).toBe(3)
    expect(p.works[0]).toMatchObject({ id: 'aw9', title: 'Valid Work', format: 'novella', genre: 'fantasy', promise: 'characters', stage: 'draft', progress: 0, quality: 100, readers: 0, trust: 50, share: 1, recoup: 0, focus: 'characters', pace: 'steady' })
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
    expect(JSON.stringify(p)).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('keeps read-only views pure and owner-scopes the profile across generations', () => {
    const g = game(7)
    const emptySnapshot = JSON.stringify(g)
    expect(authorView(g)).toEqual({ v: 1, seq: 0, works: [], audience: 0, reputation: 0, burnout: 0, lastYear: -1, awards: [] })
    expect(JSON.stringify(g)).toBe(emptySnapshot)

    const profile: AuthorProfile = { ...authorView(g), seq: 1, audience: 123, works: [workPatch()] }
    saveAuthor(g, profile)
    const saved = JSON.stringify(g.flags['special.author'])
    const view = authorView(g)
    view.audience = 999
    view.works[0].title = 'Mutated copy'
    expect(JSON.stringify(g.flags['special.author'])).toBe(saved)
    expect(authorView(g).works[0].title).toBe('The Glass Harbor')

    g.character.id = 'next-player'
    g.character.firstName = 'Next'
    expect(authorView(g).works).toEqual([])
    expect(authorView(g).audience).toBe(0)
    const next = authorMut(g)
    next.audience = 5
    expect(authorView(g).audience).toBe(5)
    expect(authorView(g).works).toEqual([])
  })

  it('normalizes write-through mutations and explicit saves', () => {
    const g = game(9)
    g.flags['special.author'] = {
      owner: `${g.character.id}:${g.character.firstName}:${g.character.lastName}:${g.year - g.character.age}`,
      v: 0,
      seq: 1,
      audience: -4,
      reputation: 200,
      burnout: Number.NaN,
      lastYear: -1,
      awards: [],
      works: [{ ...workPatch(), quality: -50 }],
    } as unknown as Json
    const p = authorMut(g)
    expect(p).toMatchObject({ v: 1, audience: 0, reputation: 100, burnout: 0 })
    expect(p.works[0].quality).toBe(0)
    p.works.push(workPatch({ id: 'aw2', title: 'Second' }))
    saveAuthor(g, p)
    expect(authorView(g).works.map((w) => w.id)).toEqual(['aw1', 'aw2'])
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })
})

describe('author career and shared craft skills', () => {
  it('enforces life, age, and writing gates and replaces an existing job at the exact threshold', () => {
    const g = game(11)
    skills(g, 100)
    g.character.age = 15
    expect(authorCareerBlock(g)).toMatch(/16|older/i)
    startAuthorCareer(g)
    expect(g.character.job).toBeNull()

    g.character.age = 16
    skills(g, 19)
    expect(authorCareerBlock(g)).toMatch(/writing skill.*20/i)
    startAuthorCareer(g)
    expect(g.character.job).toBeNull()

    g.character.job = {
      defId: 'clerk', title: 'Clerk', company: 'Old Office', category: 'fulltime', salary: 30_000,
      level: 0, performance: 50, yearsInRole: 2, yearsAtCompany: 2, data: {},
    }
    skills(g, 20)
    expect(authorCareerBlock(g)).toBeNull()
    startAuthorCareer(g)
    expect(g.character.job).toMatchObject({ defId: 'author', title: 'Independent Author', salary: 0, category: 'special' })
    expect(g.character.careerHistory.at(-1)).toMatchObject({ title: 'Clerk', company: 'Old Office' })
    expect(authorCareerBlock(g)).toMatch(/already/i)

    const dead = game(12)
    skills(dead, 100)
    dead.character.alive = false
    expect(authorCareerBlock(dead)).toMatch(/alive|longer/i)
    startAuthorCareer(dead)
    expect(dead.character.job).toBeNull()

    const jailed = game(13)
    skills(jailed, 100)
    jailed.character.prison = {} as never
    expect(authorCareerBlock(jailed)).toMatch(/prison|bars/i)
    startAuthorCareer(jailed)
    expect(jailed.character.job).toBeNull()
  })

  it('shares Creative Arts skills and the three-practice yearly allowance across writing and art', () => {
    const g = game(14)
    g.character.age = 8
    expect(craftSkill(g, 'writing')).toBe(0)
    expect(craftSkill(g, 'art')).toBe(0)
    practiceAuthor(g, 'writing')
    practiceAuthor(g, 'art')
    practiceAuthor(g, 'writing')
    const afterThree = { writing: craftSkill(g, 'writing'), art: craftSkill(g, 'art') }
    expect(afterThree.writing).toBeGreaterThan(0)
    expect(afterThree.art).toBeGreaterThan(0)
    expect(g.yearActions['author.practice']).toBe(3)
    practiceAuthor(g, 'art')
    expect({ writing: craftSkill(g, 'writing'), art: craftSkill(g, 'art') }).toEqual(afterThree)

    nextYear(g)
    practiceAuthor(g, 'art')
    expect(craftSkill(g, 'art')).toBeGreaterThanOrEqual(afterThree.art)

    const tooYoung = game(15)
    tooYoung.character.age = 7
    practiceAuthor(tooYoung, 'writing')
    expect(craftSkill(tooYoung, 'writing')).toBe(0)
    expect(tooYoung.yearActions['author.practice']).toBeUndefined()
  })

  it('applies the matching starting talent to skill growth without creating a parallel author skill', () => {
    for (const [craft, talent] of [['writing', 'Writing'], ['art', 'Art']] as const) {
      const plain = game(16)
      const gifted = game(16)
      plain.character.age = gifted.character.age = 18
      gifted.character.talents = [talent]
      for (let i = 0; i < 3; i++) {
        practiceAuthor(plain, craft)
        practiceAuthor(gifted, craft)
      }
      expect(craftSkill(gifted, craft)).toBeGreaterThan(craftSkill(plain, craft))
      expect(gifted.flags[`skill.${craft}`]).toBe(craftSkill(gifted, craft))
      expect(gifted.flags[`author.${craft}`]).toBeUndefined()
    }
  })

  it('quitting stops career actions but preserves the owner-scoped catalogue', () => {
    const g = game(17)
    becomeAuthor(g)
    const work = beginWork(g)
    quitAuthorCareer(g)
    clearQueue(g)
    expect(g.character.job).toBeNull()
    expect(authorView(g).works.map((entry) => entry.id)).toEqual([work.id])
    expect(authorWorkBlock(g)).toMatch(/author career/i)
    const before = authorView(g)
    workOnAuthorWork(g, work.id)
    expect(authorView(g)).toEqual(before)
  })
})

describe('manuscript state machine and regional rules', () => {
  it('requires the Author job, the format skills, and the correct country for new illustrated serials', () => {
    const g = game(21, 'us')
    skills(g, 100, 100)
    expect(authorWorkBlock(g, 'novella')).toMatch(/author career/i)
    startAuthorCareer(g)

    skills(g, 9, 100)
    expect(authorWorkBlock(g, 'novella')).toMatch(/writing skill 10/i)
    skills(g, 100, 34)
    expect(authorWorkBlock(g, 'manga')).toMatch(/Japan/i)

    g.character.countryId = 'jp'
    expect(authorWorkBlock(g, 'manga')).toMatch(/art skill 35/i)
    skills(g, 24, 100)
    expect(authorWorkBlock(g, 'manga')).toMatch(/writing skill 25/i)
    skills(g, 25, 35)
    expect(authorWorkBlock(g, 'manga')).toBeNull()
    expect(authorWorkBlock(g, 'manhwa')).toMatch(/Korea|China/i)

    g.character.countryId = 'cn'
    expect(authorWorkBlock(g, 'manhwa')).toBeNull()
    expect(authorWorkBlock(g, 'manga')).toMatch(/Japan/i)
  })

  it('sanitizes titles, rejects invalid specs and duplicates, and permits only one active work', () => {
    const g = game(22)
    becomeAuthor(g)
    const snapshot = authorView(g)
    startAuthorWork(g, { format: 'bad' as never, genre: 'fantasy', promise: 'characters', title: 'Bad' })
    startAuthorWork(g, { format: 'novella', genre: 'bad' as never, promise: 'characters', title: 'Bad' })
    startAuthorWork(g, { format: 'novella', genre: 'fantasy', promise: 'bad' as never, title: 'Bad' })
    expect(authorView(g)).toEqual(snapshot)

    startAuthorWork(g, { format: 'novella', genre: 'fantasy', promise: 'characters', title: '  <The>\u0000   Long Harbor  ' })
    expect(authorView(g).works[0].title).toBe('The Long Harbor')
    expect(authorWorkBlock(g)).toMatch(/current work/i)
    startAuthorWork(g, { format: 'novella', genre: 'mystery', promise: 'mystery', title: 'Another' })
    expect(authorView(g).works).toHaveLength(1)

    const p = authorView(g)
    p.works[0].stage = 'published'
    saveAuthor(g, p)
    nextYear(g)
    startAuthorWork(g, { format: 'novella', genre: 'mystery', promise: 'mystery', title: 'the long harbor' })
    expect(authorView(g).works).toHaveLength(1)
  })

  it('does not refund the yearly creation slot or work sessions when a manuscript is abandoned', () => {
    const g = game(23)
    becomeAuthor(g)
    const first = beginWork(g, 'novella', 'First Draft')
    workOnAuthorWork(g, first.id)
    const writingAfterOne = authorView(g).works[0].progress
    abandonAuthorWork(g, first.id)
    clearQueue(g)
    expect(authorView(g).works).toEqual([])
    startAuthorWork(g, { format: 'novella', genre: 'fantasy', promise: 'characters', title: 'Replacement' })
    expect(authorView(g).works).toEqual([])
    expect(g.yearActions['author.startWork']).toBe(1)
    expect(g.yearActions['author.write']).toBe(1)
    expect(writingAfterOne).toBe(50)
  })

  it.each([
    ['novella', 'us', 2],
    ['novel', 'us', 4],
    ['saga', 'us', 6],
    ['manga', 'jp', 2],
    ['manhwa', 'kr', 2],
  ] as const)('needs exactly %s effort and no more than two work sessions per year', (format, country, effort) => {
    const g = game(30 + effort, country)
    becomeAuthor(g)
    const work = beginWork(g, format, `${format} loop`)
    workOnAuthorWork(g, work.id)
    workOnAuthorWork(g, work.id)
    const afterTwo = authorView(g).works[0]
    expect(afterTwo.progress).toBeCloseTo(Math.min(100, 200 / effort), 8)
    const beforeThird = JSON.stringify(afterTwo)
    workOnAuthorWork(g, work.id)
    expect(JSON.stringify(authorView(g).works[0])).toBe(beforeThird)

    let sessions = 2
    while (authorView(g).works[0].stage !== 'ready' && sessions < effort) {
      nextYear(g)
      for (let i = 0; i < 2 && sessions < effort; i++, sessions++) workOnAuthorWork(g, work.id)
    }
    expect(sessions).toBe(effort)
    expect(authorView(g).works[0]).toMatchObject({ progress: 100, stage: 'ready' })
  })

  it('lets a started regional series travel, while blocking new out-of-region works', () => {
    const g = game(40, 'jp')
    becomeAuthor(g)
    const manga = beginWork(g, 'manga', 'Traveling Panels')
    g.character.countryId = 'us'
    finishDraft(g, manga.id, 2)
    const cost = authorSelfPublishCost(g, authorView(g).works[0])
    publishAuthorWork(g, manga.id, 'self')
    expect(authorView(g).works[0]).toMatchObject({ stage: 'serial', countryId: 'jp', spent: cost })

    nextYear(g)
    const completed = authorView(g)
    completed.works[0].stage = 'ended'
    saveAuthor(g, completed)
    expect(authorWorkBlock(g, 'manga')).toMatch(/Japan/i)
    g.character.countryId = 'kr'
    expect(authorWorkBlock(g, 'manhwa')).toBeNull()
  })

  it('ignores stale ids and a former generation catalogue rather than mutating either owner', () => {
    const g = game(41)
    becomeAuthor(g)
    const work = beginWork(g, 'novella', 'Old Life Story')
    const oldRaw = JSON.stringify(g.flags['special.author'])
    workOnAuthorWork(g, 'missing')
    abandonAuthorWork(g, 'missing')
    publishAuthorWork(g, 'missing', 'self')
    expect(JSON.stringify(g.flags['special.author'])).toBe(oldRaw)

    g.character.id = 'successor'
    g.character.firstName = 'Successor'
    workOnAuthorWork(g, work.id)
    abandonAuthorWork(g, work.id)
    publishAuthorWork(g, work.id, 'self')
    expect(authorView(g).works).toEqual([])
    expect(JSON.stringify(g.flags['special.author'])).not.toBe(oldRaw)
    expect(g.flags['special.author']).toMatchObject({ owner: ownerKey(g), works: [] })
  })
})

describe('publishing, series control, and adaptation contracts', () => {
  it('completes a full self-published novella loop and charges the cost exactly once', () => {
    const g = game(51)
    becomeAuthor(g)
    const draft = beginWork(g, 'novella', 'A Small Complete Book')
    const ready = finishDraft(g, draft.id, 2)
    expect(ready.stage).toBe('ready')
    const cost = authorSelfPublishCost(g, ready)
    const moneyBefore = g.character.money
    publishAuthorWork(g, ready.id, 'self')
    const published = authorView(g).works[0]
    expect(published).toMatchObject({ stage: 'published', released: g.year, publisher: '', share: .7, recoup: 0, spent: cost })
    expect(published.tail).toBeGreaterThan(0)
    expect(g.character.money).toBe(moneyBefore - cost)
    expect(g.counters.authorPublications).toBe(1)
    expect(g.counters.books).toBe(1)
    publishAuthorWork(g, ready.id, 'self')
    expect(g.character.money).toBe(moneyBefore - cost)
    expect(g.counters.authorPublications).toBe(1)
  })

  it('plays a regional serial from pilot through publication, annual chapters, finale, and back catalogue', () => {
    const g = game(511, 'jp')
    becomeAuthor(g)
    const pilot = beginWork(g, 'manga', 'One Complete Serial')
    const ready = finishDraft(g, pilot.id, 2)
    expect(ready.stage).toBe('ready')
    publishAuthorWork(g, ready.id, 'self')
    clearQueue(g)
    expect(authorView(g).works[0]).toMatchObject({ stage: 'serial', chapters: 0, released: 2026 })

    g.character.countryId = 'us'
    nextYear(g)
    yearlyAuthor(g)
    const serialized = authorView(g).works[0]
    expect(serialized.chapters).toBe(24)
    expect(serialized.volumes).toBeGreaterThan(0)
    expect(serialized.readers).toBeGreaterThan(0)

    endAuthorSeries(g, pilot.id)
    expect(authorView(g).works[0].stage).toBe('ended')
    const chapters = authorView(g).works[0].chapters
    nextYear(g)
    yearlyAuthor(g)
    expect(authorView(g).works[0].chapters).toBe(chapters)
  })

  it('keeps a ready manuscript intact when the author cannot afford self-publication', () => {
    const g = game(52)
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({ stage: 'ready', released: 0, progress: 100, quality: 75, earned: 0, copies: 0, readers: 0, tail: 0, lastYear: -1 })]
    saveAuthor(g, p)
    g.character.money = 0
    publishAuthorWork(g, 'aw1', 'self')
    expect(authorView(g).works[0]).toMatchObject({ stage: 'ready', released: 0, spent: 0 })
    expect(g.counters.authorPublications).toBeUndefined()
  })

  it('makes publisher offers deterministic and pays one advance that future royalties must recoup', () => {
    const g = game(53)
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.reputation = 100
    p.works = [workPatch({ stage: 'ready', released: 0, progress: 100, quality: 100, earned: 0, copies: 0, readers: 0, tail: 0, lastYear: -1 })]
    saveAuthor(g, p)

    let offer = authorPublisherOffer(g, authorView(g).works[0])
    for (let guard = 0; !offer.available && guard < 50; guard++) {
      nextYear(g)
      offer = authorPublisherOffer(g, authorView(g).works[0])
    }
    expect(offer.available).toBe(true)
    const rng = g.rng
    expect(authorPublisherOffer(g, authorView(g).works[0])).toEqual(offer)
    expect(authorPublisherOffer(g, authorView(g).works[0])).toEqual(offer)
    expect(g.rng).toBe(rng)

    const moneyBefore = g.character.money
    publishAuthorWork(g, 'aw1', 'publisher')
    const published = authorView(g).works[0]
    expect(published).toMatchObject({ stage: 'published', publisher: offer.label, share: offer.share, recoup: offer.advance, earned: offer.advance })
    expect(g.character.money).toBe(moneyBefore + offer.advance)
    expect(g.character.job?.salary).toBe(0)
    publishAuthorWork(g, 'aw1', 'publisher')
    expect(g.character.money).toBe(moneyBefore + offer.advance)
  })

  it('requires a current Author job for serial controls and applies valid focus, pace, and hiatus transitions', () => {
    const g = game(54, 'jp')
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({ format: 'manga', stage: 'serial', countryId: 'jp', focus: 'characters', pace: 'steady', hiatus: false })]
    saveAuthor(g, p)

    setAuthorFocus(g, 'aw1', 'cliffhanger')
    setAuthorPace(g, 'aw1', 'crunch')
    toggleAuthorHiatus(g, 'aw1')
    expect(authorView(g).works[0]).toMatchObject({ focus: 'cliffhanger', pace: 'crunch', hiatus: true, hiatuses: 1 })
    toggleAuthorHiatus(g, 'aw1')
    expect(authorView(g).works[0]).toMatchObject({ hiatus: false, hiatuses: 1 })

    setAuthorFocus(g, 'aw1', 'invalid' as never)
    setAuthorPace(g, 'aw1', 'invalid' as never)
    expect(authorView(g).works[0]).toMatchObject({ focus: 'cliffhanger', pace: 'crunch' })
    quitAuthorCareer(g)
    clearQueue(g)
    toggleAuthorHiatus(g, 'aw1')
    setAuthorFocus(g, 'aw1', 'payoff')
    expect(authorView(g).works[0]).toMatchObject({ focus: 'cliffhanger', hiatus: false })
  })

  it('blocks an early finale and rewards a resolved, trusted ending while preserving the catalogue', () => {
    const g = game(55, 'jp')
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.reputation = 40
    p.works = [workPatch({ format: 'manga', stage: 'serial', countryId: 'jp', chapters: 11, hooks: 0, trust: 60, quality: 80, arcs: 2 })]
    saveAuthor(g, p)
    endAuthorSeries(g, 'aw1')
    expect(authorView(g).works[0].stage).toBe('serial')

    const eligible = authorView(g)
    eligible.works[0].chapters = 12
    eligible.works[0].hiatus = true
    saveAuthor(g, eligible)
    endAuthorSeries(g, 'aw1')
    expect(authorView(g)).toMatchObject({ reputation: 46 })
    expect(authorView(g).works[0]).toMatchObject({ stage: 'ended', quality: 84, arcs: 3, hooks: 0, hiatus: false })
  })

  it('penalizes a loose-thread finale at the same twelve-chapter threshold', () => {
    const g = game(56, 'kr')
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.reputation = 40
    p.works = [workPatch({ format: 'manhwa', stage: 'serial', countryId: 'kr', chapters: 12, hooks: 31, trust: 54, quality: 80, arcs: 2 })]
    saveAuthor(g, p)
    endAuthorSeries(g, 'aw1')
    expect(authorView(g)).toMatchObject({ reputation: 32 })
    expect(authorView(g).works[0]).toMatchObject({ stage: 'ended', quality: 70, arcs: 2, hooks: 31 })
  })

  it('uses exact adaptation thresholds, keeps offers pure, and licenses each work only once', () => {
    const g = game(57)
    becomeAuthor(g)
    const belowQuality = workPatch({ quality: 79.99, copies: 10_000 })
    const belowReach = workPatch({ quality: 80, copies: 9_999, readers: 9_999 })
    expect(authorAdaptationOffer(g, belowQuality).available).toBe(false)
    expect(authorAdaptationOffer(g, belowReach).available).toBe(false)

    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({ quality: 80, copies: 10_000, readers: 0, earned: 0, adaptedUntil: 0, adaptationBase: 0, adaptationEarned: 0 })]
    saveAuthor(g, p)
    const rng = g.rng
    const offer = authorAdaptationOffer(g, authorView(g).works[0])
    expect(offer).toMatchObject({ available: true, years: 5, label: 'Screen adaptation license' })
    expect(offer.fee).toBeGreaterThan(0)
    expect(offer.annual).toBeGreaterThan(0)
    expect(g.rng).toBe(rng)

    const before = g.character.money
    licenseAuthorAdaptation(g, 'aw1')
    const licensed = authorView(g).works[0]
    expect(licensed).toMatchObject({ adaptedUntil: g.year + 4, adaptationBase: offer.annual, adaptationEarned: offer.fee, earned: offer.fee })
    expect(g.character.money).toBe(before + offer.fee)
    expect(g.counters.authorAdaptations).toBe(1)
    licenseAuthorAdaptation(g, 'aw1')
    expect(g.character.money).toBe(before + offer.fee)
    expect(g.counters.authorAdaptations).toBe(1)
  })

  it('rejects adaptation licensing for dead, jailed, or underage owners without changing a valid catalogue', () => {
    for (const mode of ['dead', 'jailed', 'child'] as const) {
      const g = game(60)
      const p = authorView(g)
      p.seq = 1
      p.works = [workPatch({ quality: 90, copies: 20_000, adaptedUntil: 0, earned: 0, adaptationEarned: 0 })]
      saveAuthor(g, p)
      if (mode === 'dead') g.character.alive = false
      if (mode === 'jailed') g.character.prison = {} as never
      if (mode === 'child') g.character.age = 15
      const before = JSON.stringify(authorView(g))
      const moneyBefore = g.character.money
      licenseAuthorAdaptation(g, 'aw1')
      expect(JSON.stringify(authorView(g))).toBe(before)
      expect(g.character.money).toBe(moneyBefore)
    }
  })
})

describe('yearly author simulation and accounting', () => {
  it('never pays launch income retrospectively in the creation year and settles it once after age-up', () => {
    const g = game(71)
    becomeAuthor(g)
    const draft = beginWork(g, 'novella', 'No Time Travel Royalties')
    const ready = finishDraft(g, draft.id, 2)
    publishAuthorWork(g, ready.id, 'self')
    clearQueue(g)
    const afterPublishing = g.character.money
    expect(authorView(g).works[0]).toMatchObject({ released: 2026, copies: 0, lastYear: -1 })

    yearlyAuthor(g)
    expect(g.character.money).toBe(afterPublishing)
    expect(authorView(g)).toMatchObject({ lastYear: 2025 })
    expect(authorView(g).works[0]).toMatchObject({ copies: 0, lastYear: -1 })
    expect(g.character.job?.salary).toBe(0)

    nextYear(g)
    yearlyAuthor(g)
    const settled = authorView(g)
    expect(settled.works[0].copies).toBeGreaterThan(0)
    expect(settled.works[0].earned).toBeGreaterThan(0)
    expect(g.character.money).toBeGreaterThan(afterPublishing)
    expect(g.character.job?.salary).toBe(settled.works[0].earned)
    const snapshot = JSON.stringify(g)
    yearlyAuthor(g)
    expect(JSON.stringify(g)).toBe(snapshot)
  })

  it('repairs a malformed future settlement marker instead of freezing the catalogue', () => {
    const g = game(98)
    const p = authorView(g)
    p.seq = 1
    p.lastYear = 100_000
    p.works = [workPatch({
      started: 2020, released: 2020, quality: 75, tail: 1_000, copies: 0,
      gross: 0, earned: 0, lastYear: 100_000,
    })]
    saveAuthor(g, p)

    yearlyAuthor(g)

    expect(authorView(g).lastYear).toBe(g.year - 1)
    expect(authorView(g).works[0].lastYear).toBe(g.year - 1)
    expect(authorView(g).works[0].copies).toBeGreaterThan(0)
  })

  it('recoups a publisher advance from author royalties without negative pay, then pays only the excess', () => {
    const g = game(72)
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({
      stage: 'published', started: 2024, released: 2025, quality: 90, publisher: 'Northbound Books',
      share: .12, recoup: 1_000_000_000, tail: 10_000, copies: 0, gross: 0, earned: 15_000, lastYear: -1,
    })]
    saveAuthor(g, p)
    const moneyBefore = g.character.money
    yearlyAuthor(g)
    let work = authorView(g).works[0]
    const firstRoyalty = Math.round(work.gross * work.share)
    expect(firstRoyalty).toBeGreaterThan(0)
    expect(work.recoup).toBe(1_000_000_000 - firstRoyalty)
    expect(work.earned).toBe(15_000)
    expect(g.character.money).toBe(moneyBefore)
    expect(g.character.job?.salary).toBe(0)
    expect(work.recoup).toBeGreaterThanOrEqual(0)

    const profile = authorView(g)
    profile.works[0].recoup = 1
    profile.works[0].tail = 10_000
    saveAuthor(g, profile)
    const grossBefore = profile.works[0].gross
    nextYear(g)
    yearlyAuthor(g)
    work = authorView(g).works[0]
    const grossThisYear = work.gross - grossBefore
    const royaltyThisYear = Math.round(grossThisYear * work.share)
    const paid = Math.max(0, royaltyThisYear - 1)
    expect(work.recoup).toBe(0)
    expect(work.earned).toBe(15_000 + paid)
    expect(g.character.money).toBe(moneyBefore + paid)
    expect(g.character.job?.salary).toBe(paid)
  })

  it.each([
    ['careful', 0, 12],
    ['steady', 0, 24],
    ['crunch', 0, 40],
    ['careful', 80, 7],
    ['steady', 80, 14],
    ['crunch', 80, 24],
  ] as const)('serializes a %s schedule from burnout %i into exactly %i chapters', (pace, burnout, expected) => {
    const g = game(80 + expected, 'us')
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.burnout = burnout
    p.works = [workPatch({
      format: 'manga', stage: 'serial', countryId: 'jp', started: 2024, released: 2025,
      chapters: 0, copies: 0, readers: 20_000, tail: 0, pace, lastYear: -1,
    })]
    saveAuthor(g, p)
    yearlyAuthor(g)
    expect(authorView(g).works[0].chapters).toBe(expected)
  })

  it('makes focus fulfill or break the reader promise through trust, hooks, and paid-off arcs', () => {
    function annualFocus(focus: AuthorWork['focus'], promise: AuthorWork['promise'], hooks = 15): AuthorWork {
      const g = game(91, 'jp')
      becomeAuthor(g)
      const p = authorView(g)
      p.seq = 1
      p.works = [workPatch({
        format: 'manga', stage: 'serial', countryId: 'jp', started: 2024, released: 2025,
        promise, focus, pace: 'steady', chapters: 0, readers: 10_000, copies: 0, tail: 0,
        trust: 50, hooks, arcs: 0, lastYear: -1,
      })]
      saveAuthor(g, p)
      yearlyAuthor(g)
      return authorView(g).works[0]
    }

    expect(annualFocus('characters', 'characters')).toMatchObject({ trust: 58, hooks: 17, arcs: 0 })
    expect(annualFocus('characters', 'mystery')).toMatchObject({ trust: 53, hooks: 17, arcs: 0 })
    expect(annualFocus('world', 'spectacle')).toMatchObject({ trust: 57, hooks: 21, arcs: 0 })
    expect(annualFocus('cliffhanger', 'mystery')).toMatchObject({ trust: 45, hooks: 35, arcs: 0 })
    expect(annualFocus('payoff', 'mystery', 40)).toMatchObject({ trust: 64, hooks: 10, arcs: 1 })
  })

  it('pauses chapters and recovers burnout on hiatus, then resumes the selected pace', () => {
    const g = game(92, 'kr')
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.burnout = 60
    p.works = [workPatch({
      format: 'manhwa', stage: 'serial', countryId: 'kr', started: 2024, released: 2025,
      chapters: 0, readers: 10_000, copies: 0, tail: 0, trust: 70, hiatus: true, hiatuses: 1,
      pace: 'steady', lastYear: -1,
    })]
    saveAuthor(g, p)
    yearlyAuthor(g)
    expect(authorView(g)).toMatchObject({ burnout: 48 })
    expect(authorView(g).works[0]).toMatchObject({ chapters: 0, readers: 9_200, trust: 69 })

    toggleAuthorHiatus(g, 'aw1')
    clearQueue(g)
    nextYear(g)
    yearlyAuthor(g)
    expect(authorView(g).works[0].chapters).toBe(24)
  })

  it('keeps published residuals after quitting and in prison, while active serial production stops', () => {
    const quit = game(93)
    becomeAuthor(quit)
    const bookProfile = authorView(quit)
    bookProfile.seq = 1
    bookProfile.works = [workPatch({ started: 2024, released: 2025, tail: 2_000, copies: 0, gross: 0, earned: 0, lastYear: -1 })]
    saveAuthor(quit, bookProfile)
    quitAuthorCareer(quit)
    clearQueue(quit)
    const quitMoney = quit.character.money
    yearlyAuthor(quit)
    expect(quit.character.job).toBeNull()
    expect(authorView(quit).works[0].copies).toBeGreaterThan(0)
    expect(quit.character.money).toBeGreaterThan(quitMoney)

    const jailed = game(94, 'jp')
    becomeAuthor(jailed)
    const serialProfile = authorView(jailed)
    serialProfile.seq = 1
    serialProfile.works = [workPatch({
      format: 'manga', stage: 'serial', countryId: 'jp', started: 2024, released: 2025,
      chapters: 12, readers: 10_000, copies: 0, tail: 2_000, gross: 0, earned: 0, lastYear: -1,
    })]
    saveAuthor(jailed, serialProfile)
    jailed.character.prison = {} as never
    const jailedMoney = jailed.character.money
    yearlyAuthor(jailed)
    expect(authorView(jailed).works[0].chapters).toBe(12)
    expect(authorView(jailed).works[0].readers).toBe(8_000)
    expect(authorView(jailed).works[0].copies).toBeGreaterThan(0)
    expect(jailed.character.money).toBeGreaterThan(jailedMoney)
  })

  it('does absolutely nothing for a dead owner, including residuals and random state', () => {
    const g = game(95)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({ started: 2024, released: 2025, tail: 20_000, lastYear: -1 })]
    saveAuthor(g, p)
    g.character.alive = false
    const snapshot = JSON.stringify(g)
    yearlyAuthor(g)
    expect(JSON.stringify(g)).toBe(snapshot)
  })

  it('pays exactly five adaptation fiscal years, never twice in one year and never a sixth', () => {
    const g = game(96)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({
      started: 2020, released: 2020, tail: 0, copies: 10_000, readers: 0, share: 0,
      gross: 0, earned: 0, lastYear: -1, adaptedUntil: 2029, adaptationBase: 10_000, adaptationEarned: 0,
    })]
    saveAuthor(g, p)
    const yearlyAdaptationTotals: number[] = []
    for (let payment = 0; payment < 5; payment++) {
      yearlyAuthor(g)
      yearlyAdaptationTotals.push(authorView(g).works[0].adaptationEarned)
      const snapshot = JSON.stringify(g)
      yearlyAuthor(g)
      expect(JSON.stringify(g)).toBe(snapshot)
      nextYear(g)
    }
    expect(yearlyAdaptationTotals[0]).toBeGreaterThan(0)
    for (let i = 1; i < yearlyAdaptationTotals.length; i++) {
      expect(yearlyAdaptationTotals[i]).toBeGreaterThan(yearlyAdaptationTotals[i - 1])
    }
    yearlyAuthor(g)
    expect(authorView(g).works[0].adaptationEarned).toBe(yearlyAdaptationTotals.at(-1))
  })

  it('does not manufacture fame or refresh fame activity from an inert lifetime bestseller', () => {
    const g = game(97)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({
      started: 2020, released: 2020, quality: 90, copies: 100_000, readers: 0, tail: 0,
      gross: 1_000_000, earned: 700_000, lastYear: -1, adaptedUntil: 0, adaptationBase: 0,
    })]
    saveAuthor(g, p)
    expect(g.character.hidden.fame).toBe(0)
    expect(g.flags['special.own.fameActiveAge']).toBeUndefined()
    yearlyAuthor(g)
    expect(g.character.hidden.fame).toBe(0)
    expect(g.flags['special.own.fameActiveAge']).toBeUndefined()
    expect(g.counters.authorAwards).toBeUndefined()
  })

  it('allows current successful serial activity to earn fame and mark the active age', () => {
    const g = game(98, 'jp')
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({
      format: 'manga', stage: 'serial', countryId: 'jp', started: 2024, released: 2025,
      quality: 90, chapters: 12, readers: 100_000, copies: 0, tail: 0, lastYear: -1,
    })]
    saveAuthor(g, p)
    yearlyAuthor(g)
    expect(g.character.hidden.fame).toBeGreaterThan(0)
    expect(g.flags['special.own.fameActiveAge']).toMatchObject({ value: g.character.age })
  })

  it('is deterministic from identical game state, including sales, serials, and notices', () => {
    const left = game(99, 'jp')
    becomeAuthor(left)
    const p = authorView(left)
    p.seq = 2
    p.audience = 20_000
    p.reputation = 70
    p.works = [
      workPatch({ id: 'aw1', title: 'Deterministic Book', started: 2024, released: 2025, tail: 5_000, copies: 0, gross: 0, earned: 0, lastYear: -1 }),
      workPatch({ id: 'aw2', title: 'Deterministic Serial', format: 'manga', stage: 'serial', countryId: 'jp', started: 2024, released: 2025, chapters: 8, readers: 15_000, copies: 0, tail: 100, gross: 0, earned: 0, lastYear: -1 }),
    ]
    saveAuthor(left, p)
    const right = structuredClone(left)
    yearlyAuthor(left)
    yearlyAuthor(right)
    expect(right).toEqual(left)
  })

  it('runs from the global special-career hook and remains profile-idempotent there too', () => {
    const g = game(100)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({ started: 2024, released: 2025, tail: 1_000, copies: 0, gross: 0, earned: 0, lastYear: -1 })]
    saveAuthor(g, p)
    yearlySpecial(g)
    expect(authorView(g)).toMatchObject({ lastYear: 2025 })
    expect(authorView(g).works[0].copies).toBeGreaterThan(0)
    const snapshot = JSON.stringify(authorView(g))
    yearlySpecial(g)
    expect(JSON.stringify(authorView(g))).toBe(snapshot)
  })
})

describe('author menus, script flow, CV, and integration wiring', () => {
  it('renders the whole career and catalogue without mutating state or advancing RNG', () => {
    const newcomer = game(111, 'jp')
    skills(newcomer, 25, 35)
    const newcomerSnapshot = JSON.stringify(newcomer)
    inspectMenu(newcomer, authorCareerMenu)
    inspectMenu(newcomer, authorCareerMenu)
    expect(JSON.stringify(newcomer)).toBe(newcomerSnapshot)

    const active = game(112, 'jp')
    becomeAuthor(active)
    const p = authorView(active)
    p.seq = 3
    p.audience = 12_345
    p.reputation = 55
    p.works = [
      workPatch({ id: 'aw1', title: 'Draft', stage: 'draft', released: 0, progress: 50, copies: 0, readers: 0 }),
      workPatch({ id: 'aw2', title: 'Series', format: 'manga', stage: 'serial', countryId: 'jp', chapters: 24 }),
      workPatch({ id: 'aw3', title: 'Book', stage: 'published' }),
    ]
    saveAuthor(active, p)
    const activeSnapshot = JSON.stringify(active)
    inspectMenu(active, authorCareerMenu)
    for (const node of authorJobNodes(active)) inspectMenu(active, node)
    expect(JSON.stringify(active)).toBe(activeSnapshot)
  })

  it('runs the real format → genre → promise → title menu script into a regional serial', () => {
    const g = game(113, 'jp')
    becomeAuthor(g)
    const create = menuAction(g, authorCareerMenu, 'author.create')
    expect(create.disabledReason?.(g)).toBeNull()
    create.run(g)

    const format = takeModal(g, 'choice')
    expect(format.scriptId).toBe('author.create.format')
    expect(format.choices.map((choice) => choice.id)).toEqual(expect.arrayContaining(['novella', 'novel', 'saga', 'manga', 'cancel']))
    expect(format.choices.map((choice) => choice.id)).not.toContain('manhwa')
    answerModal(g, format, 'manga')

    const genre = takeModal(g, 'choice')
    expect(genre.scriptId).toBe('author.create.genre')
    answerModal(g, genre, 'adventure')
    const promise = takeModal(g, 'choice')
    expect(promise.scriptId).toBe('author.create.promise')
    answerModal(g, promise, 'spectacle')
    const title = takeModal(g, 'input')
    expect(title.scriptId).toBe('author.create.name')
    answerModal(g, title, '  <Panel>\u0000   Dream  ')

    expect(authorView(g).works).toHaveLength(1)
    expect(authorView(g).works[0]).toMatchObject({
      title: 'Panel Dream', format: 'manga', genre: 'adventure', promise: 'spectacle', focus: 'world', stage: 'draft', countryId: 'jp',
    })
  })

  it('revalidates country and career ownership when a queued creation step becomes stale', () => {
    const moved = game(114, 'jp')
    becomeAuthor(moved)
    menuAction(moved, authorCareerMenu, 'author.create').run(moved)
    const format = takeModal(moved, 'choice')
    moved.character.countryId = 'us'
    answerModal(moved, format, 'manga')
    expect(authorView(moved).works).toEqual([])
    expect(moved.queue.some((modal) => modal.kind === 'notice' && /Japan/i.test(modal.text))).toBe(true)

    const quit = game(115)
    becomeAuthor(quit)
    menuAction(quit, authorCareerMenu, 'author.create').run(quit)
    answerModal(quit, takeModal(quit, 'choice'), 'novella')
    answerModal(quit, takeModal(quit, 'choice'), 'mystery')
    answerModal(quit, takeModal(quit, 'choice'), 'mystery')
    const name = takeModal(quit, 'input')
    quitAuthorCareer(quit)
    answerModal(quit, name, 'Stale Manuscript')
    expect(authorView(quit).works).toEqual([])
  })

  it('runs focus and pace scripts, but ignores them after the job or target work changes', () => {
    const g = game(116, 'jp')
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({ format: 'manga', stage: 'serial', countryId: 'jp', focus: 'characters', pace: 'steady' })]
    saveAuthor(g, p)

    menuAction(g, authorCareerMenu, 'author.work.aw1.focus').run(g)
    const focus = takeModal(g, 'choice')
    expect(focus.scriptId).toBe('author.work.focus')
    expect(focus.choices.map((choice) => choice.id)).toEqual(expect.arrayContaining(['characters', 'world', 'cliffhanger', 'payoff']))
    answerModal(g, focus, 'payoff')
    expect(authorView(g).works[0].focus).toBe('payoff')

    menuAction(g, authorCareerMenu, 'author.work.aw1.pace').run(g)
    const pace = takeModal(g, 'choice')
    expect(pace.scriptId).toBe('author.work.pace')
    answerModal(g, pace, 'crunch')
    expect(authorView(g).works[0].pace).toBe('crunch')

    menuAction(g, authorCareerMenu, 'author.work.aw1.focus').run(g)
    const staleCareer = takeModal(g, 'choice')
    quitAuthorCareer(g)
    answerModal(g, staleCareer, 'cliffhanger')
    expect(authorView(g).works[0].focus).toBe('payoff')

    startAuthorCareer(g)
    clearQueue(g)
    menuAction(g, authorCareerMenu, 'author.work.aw1.pace').run(g)
    const staleWork = takeModal(g, 'choice')
    const empty = authorView(g)
    empty.works = []
    saveAuthor(g, empty)
    answerModal(g, staleWork, 'careful')
    expect(authorView(g).works).toEqual([])
  })

  it('keeps captured work actions safe after the underlying work is abandoned', () => {
    const g = game(117)
    becomeAuthor(g)
    const work = beginWork(g, 'novella', 'Soon Shelved')
    const write = menuAction(g, authorCareerMenu, `author.work.${work.id}.write`)
    const abandon = menuAction(g, authorCareerMenu, `author.work.${work.id}.abandon`)
    abandon.run(g)
    clearQueue(g)
    const before = JSON.stringify(authorView(g))
    expect(write.disabledReason?.(g)).toMatch(/no longer|catalogue/i)
    write.run(g)
    expect(JSON.stringify(authorView(g))).toBe(before)
  })

  it('wires the Author menu, occupation nodes, and non-Author library access into global menus', () => {
    const g = game(118)
    skills(g)
    expect(specialCareersMenu.children(g).map((node) => node.id)).toContain('special.author')
    expect(authorCareerMenu.visible?.(g)).toBe(true)
    g.character.alive = false
    expect(authorCareerMenu.visible?.(g)).toBe(false)
    g.character.alive = true
    becomeAuthor(g)
    const ids = specialJobNodes(g).map((node) => node.id)
    expect(ids).toContain('author.job.summary')
    expect(ids).toContain('author.create')
    expect(ids).not.toContain('special.unknown')

    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({ quality: 90, copies: 20_000, adaptedUntil: 0 })]
    saveAuthor(g, p)
    quitAuthorCareer(g)
    clearQueue(g)
    expect(findNode(g, authorCareerMenu, 'author.library')).toBeDefined()
    const adaptation = menuAction(g, authorCareerMenu, 'author.work.aw1.adapt')
    expect(adaptation.disabledReason?.(g)).toBeNull()
  })

  it('shows lifetime receipts once when adaptation receipts are already included in earned', () => {
    const g = game(119)
    const p = authorView(g)
    p.seq = 1
    p.works = [workPatch({ earned: 123, adaptationEarned: 77 })]
    saveAuthor(g, p)
    const library = findNode(g, authorCareerMenu, 'author.library')
    if (!library || library.type !== 'menu') throw new Error('author library menu missing')
    const header = library.header?.(g) ?? ''
    expect(header).toContain('$123')
    expect(header).not.toContain('$200')
  })

  it('derives CV publications only from released owner-scoped works and tags the live Author job', () => {
    const g = game(120)
    becomeAuthor(g)
    const p = authorView(g)
    p.seq = 5
    p.works = [
      workPatch({ id: 'aw1', title: 'Draft Hidden', stage: 'draft', released: 0 }),
      workPatch({ id: 'aw2', title: 'Ready Hidden', stage: 'ready', released: 0 }),
      workPatch({ id: 'aw3', title: 'Published Book', stage: 'published', publisher: '', released: 2025 }),
      workPatch({ id: 'aw4', title: 'Live Serial', format: 'manga', stage: 'serial', publisher: 'Paper Crane Weekly', released: 2025 }),
      workPatch({ id: 'aw5', title: 'Future Save', stage: 'published', released: 2030 }),
    ]
    saveAuthor(g, p)
    let entries = cvEntries(g)
    expect(entries.filter((entry) => entry.id.startsWith('d:author:')).map((entry) => entry.id).sort()).toEqual(['d:author:aw3', 'd:author:aw4'])
    expect(entries.find((entry) => entry.id === 'd:author:aw3')).toMatchObject({ title: 'Published "Published Book"', org: 'Self-published', kind: 'project' })
    expect(entries.find((entry) => entry.id === 'd:author:aw4')).toMatchObject({ org: 'Paper Crane Weekly' })
    expect(entries.find((entry) => entry.id === 'd:job')?.tags).toEqual(expect.arrayContaining(['writing', 'arts', 'media']))

    g.character.id = 'new-owner'
    g.character.firstName = 'New'
    entries = cvEntries(g)
    expect(entries.some((entry) => entry.id.startsWith('d:author:'))).toBe(false)
  })
})
