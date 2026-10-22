// The history core: world headlines for every year (and the procedural future), the anachronism
// guard, era moments, wartime drafts and national service by era, era medicine and jobs, the New
// Life "Born in" control, and whole lives born in 1900 and 1950.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { netWorth } from '../src/game/core'
import { eraMoments } from '../src/game/events/history'
import {
  allHeadlines,
  isNewsLine,
  newsLine,
  warDraftAt,
  worldEvents,
  yearlyHistory,
} from '../src/game/history/events'
import { FUTURE_POOL_SIZE } from '../src/game/history/events-future'
import { eraSafe } from '../src/game/history/events-guard'
import { eraCureFactor, eraOldAgeFactor, eraSicknessBoost } from '../src/game/history/events-medicine'
import { eraOccupation, nameFitsYear } from '../src/game/history/events-people'
import { conscriptionAt, WARS } from '../src/game/history/events-wars'
import { HISTORY_START, PRESENT_YEAR } from '../src/game/history/timeline'
import { birthYearOf, createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { applyFallback } from '../src/game/offline'
import { randomOccupation } from '../src/game/people'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import { militaryJob, yearlyMilitary } from '../src/game/special/military'
import { STAT_KEYS, type AnnualReportData, type ChoiceModal, type GameState, type MenuAction, type MenuNode, type MinigameModal, type ModalItem } from '../src/game/types'
import { COUNTRIES, CONTINENTS } from '../src/game/world'
import { makeTestGame } from './helpers'

const { NewLifeScreen, BirthYearPicker, DECADE_CHIPS, chipActive, clampBirthYear, customLifeOptions, randomBirthYear, rollFirstName, RANDOM_PICKS } = await import('../src/ui/screens/NewLifeScreen')

const COUNTRY_IDS = new Set(COUNTRIES.map((c) => c.id))
const CONTINENT_NAMES = new Set<string>(CONTINENTS)

function gameAt(year: number, countryId: string, age: number, extra: Partial<GameState['character']> = {}, seed = 7): GameState {
  const g = makeTestGame(seed, { age, countryId, birthCountryId: countryId, ...extra })
  g.year = year
  g.log = [{ age, year, entries: [] }]
  return g
}

// ---------------------------------------------------------------------------

describe('world headlines', () => {
  it('every year from HISTORY_START to PRESENT_YEAR has a world headline', () => {
    for (let y = HISTORY_START; y <= PRESENT_YEAR; y++) {
      const world = allHeadlines(y).filter((e) => e.region === 'world')
      expect(world.length, `world headline in ${y}`).toBeGreaterThan(0)
    }
  })

  it('every country gets an era-appropriate news line every year', () => {
    for (const c of COUNTRIES) {
      for (let y = HISTORY_START; y <= PRESENT_YEAR + 30; y++) {
        const line = newsLine(y, c.id)
        expect(line, `${c.id} ${y}`).toMatch(new RegExp(`^\u{1F4F0} ${y}: .+[.!?'’"]$`, 'u'))
        expect(eraSafe(line, c.id, y), `${c.id} ${y}: ${line}`).toBe(true)
      }
    }
  }, 60_000)

  it('has clean data: unique ids, real regions, no brands, sane severities', () => {
    const ids = new Set<string>()
    const brands = /\b(iPhone|iPod|Google|Facebook|Apple|Microsoft|IBM|Ford|Coca-Cola|Disney|Nintendo|Sony|Amazon|Netflix|YouTube|Twitter|Tesla|SpaceX|Bitcoin|ChatGPT|OpenAI|Walkman|Napster|Wikipedia|Instagram|TikTok)\b/
    for (let y = HISTORY_START; y <= PRESENT_YEAR; y++) {
      for (const e of allHeadlines(y)) {
        expect(ids.has(e.id), e.id).toBe(false)
        ids.add(e.id)
        expect(e.year).toBe(y)
        expect(e.severity).toBeGreaterThanOrEqual(0)
        expect(e.severity).toBeLessThanOrEqual(3)
        expect(e.headline.length, e.headline).toBeLessThanOrEqual(110)
        expect(e.headline, e.headline).not.toMatch(brands)
        const parts = [...(Array.isArray(e.region) ? e.region : [e.region]), ...(e.except ?? [])]
        for (const p of parts) expect(p === 'world' || COUNTRY_IDS.has(p) || CONTINENT_NAMES.has(p), `${e.id}: region ${p}`).toBe(true)
      }
    }
    expect(ids.size).toBeGreaterThan(600)
  })

  it('shows local news first and leaves out what other countries get', () => {
    expect(worldEvents(1989, 'de')[0].headline).toMatch(/Berlin Wall/)
    expect(worldEvents(1989, 'jp').some((e) => /Velvet Revolution/.test(e.headline))).toBe(false)
    expect(worldEvents(1989, 'cz').some((e) => /Velvet Revolution/.test(e.headline))).toBe(true)
    // Uruguay gets its own World Cup headline, not the world's version of it.
    const uy = worldEvents(1930, 'uy').map((e) => e.headline)
    expect(uy).toContain('Uruguay wins the first World Cup in Montevideo')
    expect(uy).not.toContain('Uruguay hosts and wins the first World Cup')
    expect(newsLine(1969, 'us')).toBe('\u{1F4F0} 1969: Humans walk on the Moon for the first time.')
  })

  it('puts history-defining news first and gives every region its own headlines', () => {
    // A world-defining story beats a national one of the same year; local news wins among equals.
    expect(newsLine(2020, 'us')).toMatch(/coronavirus pandemic/)
    expect(newsLine(1945, 'us')).toMatch(/Second World War ends/)
    expect(newsLine(1945, 'jp')).toMatch(/Hiroshima/)
    expect(newsLine(1983, 'in')).toMatch(/Cricket World Cup/)
    expect(newsLine(1960, 'br')).toMatch(/Brasília/)
    // Big countries everywhere hear their own news in a good share of years, not just the world's.
    for (const id of ['in', 'cn', 'jp', 'id', 'br', 'mx', 'ng', 'eg', 'pk', 'ar', 'ca', 'au', 'tr', 'ir', 'kr']) {
      let own = 0
      for (let y = HISTORY_START; y < PRESENT_YEAR; y++) {
        if (worldEvents(y, id).some((e) => Array.isArray(e.region) && e.region.includes(id))) own++
      }
      expect(own, id).toBeGreaterThanOrEqual(15)
    }
    // Every continent has headlines of its own.
    for (const continent of CONTINENTS) {
      let n = 0
      for (let y = HISTORY_START; y < PRESENT_YEAR; y++) {
        n += allHeadlines(y).filter((e) => e.region === continent || (Array.isArray(e.region) && e.region.includes(continent))).length
      }
      expect(n, continent).toBeGreaterThanOrEqual(4)
    }
  })

  it('keeps inventions out of the news where they had not arrived', () => {
    expect(eraSafe('The World Wide Web goes public', 'us', 1991)).toBe(true)
    expect(eraSafe('The World Wide Web goes public', 'ng', 1991)).toBe(false)
    expect(eraSafe('Regular radio broadcasts begin', 'us', 1920)).toBe(true)
    expect(eraSafe('Regular radio broadcasts begin', 'ng', 1920)).toBe(false)
    expect(eraSafe('A test pilot breaks the sound barrier in a jet', 'us', 1947)).toBe(false)
    expect(newsLine(1991, 'ng')).not.toMatch(/Web/)
  })

  it('does not mistake the Deutsche Mark for a direct message', () => {
    // An outcome popup prints its cost in the player's money: 138 DM in Germany before the euro (events/sos.ts, 'Evacuated').
    expect(eraSafe('You evacuated in time and stayed somewhere safe until the flood passed. It cost you 138 DM.', 'de', 1991)).toBe(true)
    expect(eraSafe('It cost you 1,380 DM.', 'de', 1991)).toBe(true)
    // The messaging meaning is still caught where there were no smartphones.
    expect(eraSafe('Teams slid into your DMs.', 'de', 1991)).toBe(false)
    expect(eraSafe('You got 5 DMs overnight.', 'de', 1991)).toBe(false)
    expect(eraSafe('Send me a DM.', 'de', 1991)).toBe(false)
  })

  it('writes a procedural future that never repeats within a cycle', () => {
    const seen = new Set<string>()
    for (let y = PRESENT_YEAR + 1; y <= PRESENT_YEAR + FUTURE_POOL_SIZE; y++) {
      const items = allHeadlines(y)
      expect(items.length).toBeGreaterThan(0)
      const pool = items.filter((e) => e.region === 'world' && !/Olympics|World Cup/.test(e.headline))
      for (const e of pool) {
        expect(seen.has(e.headline), `${y}: ${e.headline}`).toBe(false)
        seen.add(e.headline)
      }
    }
    expect(newsLine(2028, 'us')).toMatch(/Los Angeles/)
    expect(newsLine(PRESENT_YEAR + 200, 'id').length).toBeGreaterThan(10)
  })
})

// ---------------------------------------------------------------------------

describe('yearly history', () => {
  it('logs one news line a year and touches nothing else in the present and future', () => {
    const g = createNewLife({ seed: 11, year: PRESENT_YEAR, countryId: 'us' })
    g.year = PRESENT_YEAR + 3
    g.character.age = 3
    const before = JSON.stringify({ rng: g.rng, flags: g.flags, queue: g.queue, people: g.people, character: g.character })
    yearlyHistory(g)
    yearlyHistory(g)
    const after = JSON.stringify({ rng: g.rng, flags: g.flags, queue: g.queue, people: g.people, character: g.character })
    expect(after).toBe(before)
    const lines = g.log[g.log.length - 1].entries.filter((e) => isNewsLine(e.text))
    expect(lines.length).toBe(1)
  })

  it('puts the birth year news in the birth log', () => {
    const g = createNewLife({ seed: 5, year: 1969, countryId: 'us' })
    expect(g.year).toBe(1969)
    expect(g.log[0].entries.some((e) => e.text === '\u{1F4F0} 1969: Humans walk on the Moon for the first time.')).toBe(true)
  })

  it('shows the Moon landing on the family TV, or on the radio where there was no TV', () => {
    const us = gameAt(1969, 'us', 10)
    eraMoments(us)
    const usMoon = us.queue.find((m) => m.kind === 'notice' && m.title === 'One Small Step')
    expect(usMoon && usMoon.kind === 'notice' && /TV/.test(usMoon.text)).toBe(true)
    const ng = gameAt(1969, 'ng', 10)
    eraMoments(ng)
    const ngMoon = ng.queue.find((m) => m.kind === 'notice' && m.title === 'One Small Step')
    expect(ngMoon && ngMoon.kind === 'notice' && !/TV/.test(ngMoon.text)).toBe(true)
  })

  it('remembers JFK, celebrates World Cup wins and never repeats a moment', () => {
    const g = gameAt(1963, 'us', 12)
    eraMoments(g)
    expect(g.log[0].entries.some((e) => /President Kennedy/.test(e.text))).toBe(true)
    const n = g.log[0].entries.length
    eraMoments(g)
    expect(g.log[0].entries.filter((e) => /President Kennedy/.test(e.text)).length).toBe(1)
    expect(g.log[0].entries.length).toBeGreaterThanOrEqual(n)
    const ar = gameAt(1978, 'ar', 20)
    eraMoments(ar)
    expect(ar.log[0].entries.some((e) => /We won the World Cup/.test(e.text))).toBe(true)
  })

  it('offers a lockdown choice in 2020 and resolves every option', () => {
    for (const choice of ['rules', 'bread', 'sneak']) {
      const g = gameAt(2020, 'gb', 30)
      eraMoments(g)
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.title === 'Lockdown')
      expect(m).toBeDefined()
      g.queue = []
      runScript(g, m!.scriptId!, choice, m!.data, m!)
      expect(g.queue.length + g.character.conditions.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------

function draftNotice(g: GameState): ChoiceModal | undefined {
  return g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.title === 'Draft Notice')
}

/** Run the military yearly hook for many seeds; how many of them got a draft notice. */
function draftCount(year: number, countryId: string, age: number, gender: 'male' | 'female' = 'male', seeds = 30): number {
  let n = 0
  for (let s = 1; s <= seeds; s++) {
    const g = gameAt(year, countryId, age, { gender, education: { current: null, degrees: [{ kind: 'highschool', name: 'Diploma', school: 'School', age: 18 }], completed: ['elementary', 'middle', 'high'], droppedOut: [], expelled: 0 } }, s)
    yearlyMilitary(g)
    if (draftNotice(g)) n++
  }
  return n
}

describe('drafts and national service by era', () => {
  it('drafts only in war years and warring countries', () => {
    expect(draftCount(1943, 'us', 24)).toBeGreaterThan(5)
    expect(draftCount(1938, 'us', 24)).toBe(0)
    expect(draftCount(1943, 'us', 24, 'female')).toBe(0)
    expect(draftCount(1943, 'se', 24)).toBe(0)
    expect(draftCount(1943, 'us', 50)).toBe(0)
    expect(draftCount(2023, 'ua', 30)).toBeGreaterThan(3)
    expect(draftCount(1916, 'au', 22)).toBe(0)
    for (const w of WARS) expect(w.to, w.id).toBeLessThan(PRESENT_YEAR)
    expect(warDraftAt('ua', PRESENT_YEAR)).toBeNull()
  })

  it('wartime call-ups offer four ways out, each resolving cleanly', () => {
    const g = gameAt(1943, 'us', 24, {}, 3)
    let notice: ChoiceModal | undefined
    for (let s = 1; s < 40 && !notice; s++) {
      g.rng = s
      g.queue = []
      g.flags = {}
      yearlyMilitary(g)
      notice = draftNotice(g)
    }
    expect(notice).toBeDefined()
    expect(notice!.choices.map((c) => c.id)).toEqual(['serve', 'objector', 'medical', 'flee'])
    for (const choice of ['serve', 'objector', 'medical', 'flee']) {
      const h = structuredClone(g)
      h.queue = []
      runScript(h, notice!.scriptId!, choice, notice!.data, notice!)
      expect(JSON.parse(JSON.stringify(h))).toEqual(h)
    }
    const served = structuredClone(g)
    runScript(served, notice!.scriptId!, 'serve', notice!.data, notice!)
    const job = militaryJob(served)
    expect(job?.title).toBe('Conscript')
    expect(job?.data.serviceLeft).toBe(3)
  })

  it('calls up citizens and permanent residents, not visitors, refugees or the undocumented', () => {
    const count = (extra: Partial<GameState['character']>) => {
      let n = 0
      for (let s = 1; s <= 30; s++) {
        const g = gameAt(1943, 'us', 24, extra, s)
        yearlyMilitary(g)
        if (draftNotice(g)) n++
      }
      return n
    }
    expect(count({ birthCountryId: 'mx', citizenships: ['mx'], immigration: { countryId: 'us', status: 'visa', since: 1940 } })).toBe(0)
    expect(count({ birthCountryId: 'mx', citizenships: ['mx'], immigration: { countryId: 'us', status: 'undocumented', since: 1940 } })).toBe(0)
    expect(count({ birthCountryId: 'mx', citizenships: ['mx'], immigration: { countryId: 'us', status: 'permanent', since: 1935 } })).toBeGreaterThan(5)
    expect(count({ birthCountryId: 'mx', citizenships: ['mx', 'us'] })).toBeGreaterThan(5)
    // A save from before passports were tracked: born abroad, nothing on file.
    expect(count({ birthCountryId: 'mx', citizenships: undefined })).toBe(0)
  })

  it('follows each era’s national service, men only where it was', () => {
    expect(draftCount(1952, 'gb', 18)).toBe(30)
    expect(draftCount(1965, 'gb', 18)).toBe(0)
    expect(draftCount(2005, 'de', 18)).toBe(30)
    expect(draftCount(1980, 'fr', 18, 'female')).toBe(0)
    expect(draftCount(1980, 'il', 18, 'female')).toBe(30)
    // The present day keeps today's rules (no draft in the US, national service in South Korea).
    expect(draftCount(PRESENT_YEAR, 'us', 18)).toBe(0)
    expect(draftCount(PRESENT_YEAR, 'kr', 18)).toBe(30)
    expect(conscriptionAt('us', 1960, false)).toBe(true)
    expect(conscriptionAt('us', 1980, false)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('era medicine and jobs', () => {
  it('is neutral from PRESENT_YEAR on and harder in the past', () => {
    expect(eraOldAgeFactor('us', PRESENT_YEAR)).toBe(1)
    expect(eraOldAgeFactor('ng', PRESENT_YEAR + 40)).toBe(1)
    expect(eraSicknessBoost('us', PRESENT_YEAR, 3)).toBe(0)
    expect(eraCureFactor('us', PRESENT_YEAR, 'Pneumonia', false)).toBe(1)
    expect(eraOldAgeFactor('us', 1900)).toBeGreaterThan(1.5)
    expect(eraCureFactor('us', 1930, 'Pneumonia', false)).toBeLessThan(0.5)
    expect(eraCureFactor('us', 1960, 'Pneumonia', false)).toBe(1)
    expect(eraCureFactor('ng', 1960, 'Pneumonia', false)).toBeLessThan(1)
  })

  it('names jobs as they were called back then', () => {
    expect(eraOccupation('Software Developer', 1950)).toBe('Keypunch Operator')
    expect(eraOccupation('Software Developer', 1990)).toBe('Programmer')
    expect(eraOccupation('Barista', PRESENT_YEAR)).toBe('Barista')
    const g = gameAt(1930, 'us', 30)
    const modern = new Set(['Software Developer', 'Barista', 'Personal Trainer', 'Graphic Designer', 'Marketing Manager'])
    for (let i = 0; i < 400; i++) expect(modern.has(randomOccupation(g, 35))).toBe(false)
  })

  it('names people as they were named back then', () => {
    expect(nameFitsYear('Jayden', 1950)).toBe(false)
    expect(nameFitsYear('Jayden', 2005)).toBe(true)
    expect(nameFitsYear('James', 1900)).toBe(true)
    for (let seed = 1; seed <= 30; seed++) {
      const g = createNewLife({ seed, year: 1915, countryId: seed % 2 ? 'us' : 'au' })
      expect(nameFitsYear(g.character.firstName, 1915), g.character.firstName).toBe(true)
      for (const p of g.people) if (p.relation !== 'pet') expect(nameFitsYear(p.firstName, 1915 - p.age), `${p.firstName}, ${p.age}`).toBe(true)
    }
    for (let i = 0; i < 200; i++) expect(nameFitsYear(rollFirstName('us', 'female', '', 1920), 1920)).toBe(true)
  })

  it('gives a 1920 baby an era family', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = createNewLife({ seed, year: 1920, countryId: 'us' })
      const text = g.log[0].entries.map((e) => e.text).join('\n')
      expect(text).not.toMatch(/test tube|Software Developer|Barista|Personal Trainer|TV/)
      for (const e of g.log[0].entries) expect(eraSafe(e.text, 'us', 1920), e.text).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Whole lives in the past (same driver as simulate.test.ts)

function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] }
}
type Driver = ReturnType<typeof driver>

function minigameResult(m: MinigameModal, d: Driver): string {
  switch (m.game) {
    case 'blackjack':
      return d.pick(['win', 'lose', 'push', 'blackjack'])
    case 'horseRace':
    case 'slots':
    case 'nationReport':
      return 'done'
    case 'burglary':
      return JSON.stringify({ loot: d.int(0, 5000), caught: d.next() < 0.3 })
    case 'prisonEscape':
      return d.pick(['escaped', 'caught'])
    case 'pickpocket':
      return d.pick(['success', 'fail'])
    case 'annualReport': {
      if (d.next() < 0.2) return 'skip'
      const r = m.data as unknown as AnnualReportData
      return JSON.stringify({ price: d.int(r.minPrice, r.maxPrice), production: d.int(0, r.maxProduction) })
    }
  }
}

function inputValue(m: Extract<ModalItem, { kind: 'input' }>, d: Driver): string {
  if (m.input === 'number') {
    const lo = m.min ?? 1
    return String(d.int(lo, Math.max(lo, Math.min(m.max ?? lo + 1000, lo + 100000))))
  }
  return m.defaultValue || 'Alex'
}

interface Seen {
  countryId: string
  year: number
  title: string
  text: string
}

function drain(g: GameState, d: Driver, texts: Seen[]): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains: ${JSON.stringify(g.queue[0]).slice(0, 200)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'notice') texts.push({ countryId: g.character.countryId, year: g.year, title: m.title, text: m.text })
    else if (m.kind === 'choice') {
      texts.push({ countryId: g.character.countryId, year: g.year, title: m.title, text: [m.text, ...m.choices.map((c) => c.label)].join(' | ') })
      const choice = d.pick(m.choices)
      if (m.source === 'script') runScript(g, m.scriptId!, choice.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, inputValue(m, d), m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, minigameResult(m, d), m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    g.queue.unshift(...g.queue.splice(before))
  }
}

function collect(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 4) return out
  for (const n of nodes) {
    if (n.type === 'info' || n.type === 'heading') continue
    if ((n.visible && !n.visible(g)) || (n.disabledReason && n.disabledReason(g))) continue
    if (n.type === 'action' && n.id === 'surrenderLife') continue
    if (n.type === 'action') out.push(n)
    else collect(g, n.children(g), depth + 1, out)
  }
  return out
}

function check(g: GameState): void {
  for (const k of STAT_KEYS) {
    expect(g.character.stats[k]).toBeGreaterThanOrEqual(0)
    expect(g.character.stats[k]).toBeLessThanOrEqual(100)
  }
  expect(Number.isFinite(g.character.money)).toBe(true)
  expect(Number.isFinite(netWorth(g))).toBe(true)
  const json = JSON.stringify(g)
  expect(JSON.stringify(JSON.parse(json))).toBe(json)
}

/** Plays a whole life from `year`; returns every popup text and the final state. */
function playFrom(seed: number, year: number, countryId: string): { g: GameState; texts: Seen[]; newsCountries: Map<number, string> } {
  const d = driver(seed * 31 + year)
  const g = createNewLife({ seed, year, countryId })
  const texts: Seen[] = []
  const newsCountries = new Map([[g.year, countryId]])
  try {
    drain(g, d, texts)
    while (g.character.alive) {
      if (g.character.age > 125) throw new Error('character never dies')
      for (let i = d.int(0, 3); i > 0 && g.character.alive; i--) {
        let action: MenuAction | undefined
        if (d.next() < 0.25) {
          const living = g.people.filter((p) => p.alive)
          if (living.length) action = d.pick([undefined, ...collect(g, personActions(g, d.pick(living)))])
        } else {
          const options = collect(g, d.pick([activitiesMenu, occupationMenu, assetsMenu]).children(g))
          if (options.length) action = d.pick(options)
        }
        if (!action) continue
        const input = action.input ? (action.input.kind === 'number' ? String(d.int(action.input.min ?? 1, Math.min(action.input.max ?? 5000, (action.input.min ?? 1) + 5000))) : (action.input.defaultValue?.(g) ?? 'Alex')) : undefined
        action.run(g, input)
        drain(g, d, texts)
        check(g)
      }
      if (!g.character.alive) break
      newsCountries.set(g.year + 1, g.character.countryId)
      ageUp(g)
      drain(g, d, texts)
      check(g)
    }
  } catch (err) {
    throw new Error(`seed ${seed}, born ${year} in ${countryId}, age ${g.character.age} (${g.year}): ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
  }
  return { g, texts, newsCountries }
}

describe('lives in the past', () => {
  it('a 1900-born and a 1950-born life simulate to death without errors', () => {
    const plan: [number, string][] = [
      [1900, 'us'], [1900, 'gb'], [1900, 'de'], [1900, 'ru'], [1900, 'in'],
      [1950, 'us'], [1950, 'jp'], [1950, 'ng'], [1950, 'kr'], [1950, 'fr'],
    ]
    const ages: number[] = []
    for (const [i, [year, country]] of plan.entries()) {
      const { g } = playFrom(i + 1, year, country)
      expect(g.character.alive).toBe(false)
      expect(g.obituary).toBeTruthy()
      ages.push(g.character.age)
      // One news line a year, every year.
      for (const y of g.log) expect(y.entries.filter((e) => isNewsLine(e.text)).length, `news in ${y.year}`).toBe(1)
    }
    ages.sort((a, b) => a - b)
    expect(ages[Math.floor(ages.length / 2)]).toBeGreaterThan(40)
    // Ten whole lives, each year running the world economy: sized for a 2-core CI runner.
  }, 600_000)

  it('history popups and news never mention things before their time', () => {
    const ours = /^(The Flu|Flu Season|Lockdown|Rationing|Air Raid|All Clear|Hit|Evacuated|One Small Step|Duck and Cover|Missile Crisis|Draft Notice|In Hiding|War at Home|Hard Times|Laid Off|The War Is Over!|Armistice|Partition|Gas Lines|The War Effort|Factory Work|Farm Work|Volunteer Nurse|The Home Front|Conscientious Objector|Medical Exemption|Caught Faking|Objection Rejected|Y2K)$/
    let checked = 0
    for (const [i, [year, country]] of ([[1905, 'gb'], [1925, 'us'], [1935, 'de'], [1945, 'in'], [1955, 'eg'], [1915, 'ru'], [1960, 'vn']] as [number, string][]).entries()) {
      const { g, texts, newsCountries } = playFrom(100 + i, year, country)
      for (const y of g.log) {
        for (const e of y.entries) if (isNewsLine(e.text)) expect(eraSafe(e.text, newsCountries.get(y.year)!, y.year), e.text).toBe(true)
      }
      for (const t of texts.filter((x) => ours.test(x.title))) {
        checked++
        expect(eraSafe(t.text, t.countryId, t.year), `${t.year} ${t.title}: ${t.text}`).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(3)
    // Seven whole lives: sized for a 2-core CI runner.
  }, 600_000)
})

// ---------------------------------------------------------------------------

describe('New Life: Born in', () => {
  it('passes the chosen year and clamps nonsense', () => {
    const form = { firstName: 'Ada', lastName: 'Lane', gender: 'female' as const, countryId: 'gb', city: '', sexuality: '' as const, picks: RANDOM_PICKS, talents: [], year: 1980 }
    expect(customLifeOptions(form).year).toBe(1980)
    expect(createNewLife({ ...customLifeOptions(form), seed: 4 }).year).toBe(1980)
    expect(birthYearOf(1850)).toBe(HISTORY_START)
    expect(birthYearOf(undefined)).toBe(PRESENT_YEAR)
    expect(birthYearOf(Number.NaN)).toBe(PRESENT_YEAR)
    expect(clampBirthYear(1800)).toBe(HISTORY_START)
    expect(clampBirthYear(3000)).toBe(PRESENT_YEAR)
    expect(randomBirthYear(() => 0)).toBe(HISTORY_START)
    expect(randomBirthYear(() => 0.99999)).toBe(PRESENT_YEAR)
    expect(chipActive(DECADE_CHIPS[3], 1985)).toBe(true)
    expect(chipActive(DECADE_CHIPS[5], PRESENT_YEAR)).toBe(true)
    expect(chipActive(DECADE_CHIPS[4], PRESENT_YEAR)).toBe(false)
  })

  it('renders the control with decade chips and an era preview', () => {
    const html = renderToStaticMarkup(createElement(NewLifeScreen))
    expect(html).toContain('Born in')
    expect(html).toContain('Random era')
    for (const chip of DECADE_CHIPS) expect(html).toContain(`>${chip.label}<`)
    const picker = renderToStaticMarkup(createElement(BirthYearPicker, { year: 1980, countryId: 'us', onChange: () => {} }))
    expect(picker).toContain('1980: no home internet yet')
    expect(picker).toMatch(/aria-pressed="true"[^>]*>1980s</)
  })
})
