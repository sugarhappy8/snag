// The anachronism lint: plays many offline lives born across 1900-1995 (AI off, so every line is
// written by the built-in library) and scans every log line, popup and choice for things that
// didn't exist yet in that year and country: texting before mobile phones, apps before
// smartphones, streaming, selfies, Wi-Fi, ride-hailing, crypto... Lives born in PRESENT_YEAR keep
// their modern texts (the last block makes sure the modern variants still show up).
//
// Deeper local run: ANACHRONISM_LIVES=400 npx vitest run test/anachronism.test.ts
import { describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { personActions } from '../src/game/relationships'
import { runScript } from '../src/game/scripts'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import {
  anachronismsIn,
  byEra,
  eraLines,
  eraPick,
  gateHolds,
  homeMovies,
  kidPrize,
  newsSource,
  photoWord,
  reachVerb,
  screenThing,
} from '../src/game/events/era'
import type { AnnualReportData, GameState, MenuAction, MenuGroup, MenuNode, MinigameModal, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'
import { mergedSlices, ownedHere, readSlice, recordSlice, seedSlice } from './shard-kit'

// In CI each shard plays a slice of the lives (SLICE=i/n) and the merge step checks the whole set (test/shard-kit.ts).
const slice = readSlice()

function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  }
}
type Driver = ReturnType<typeof driver>

interface Seen {
  text: string
  year: number
  /** Countries the player lived in while this text was produced (either one may own it). */
  countries: string[]
  /** What produced it: the popup kind plus the action (or 'age up') that led there. */
  where: string
}

const TEXT_INPUTS = ['Go for a long run', 'Write a song about my cat', 'Steal a candy bar', 'Ask my boss for a raise', 'Call my mom', 'Watch a movie', 'Alex']

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
    const hi = Math.min(m.max ?? lo + 1000, lo + 100000)
    return String(d.int(lo, Math.max(lo, hi)))
  }
  return m.defaultValue || d.pick(TEXT_INPUTS)
}

function usable(g: GameState, n: MenuNode): boolean {
  if (n.type === 'info' || n.type === 'heading') return false
  if (n.visible && !n.visible(g)) return false
  if (n.disabledReason && n.disabledReason(g)) return false
  return !(n.type === 'action' && n.id === 'surrenderLife')
}

function collectActions(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
  if (depth > 4) return out
  for (const n of nodes) {
    if (!usable(g, n)) continue
    if (n.type === 'action') out.push(n)
    else if (n.type === 'menu') collectActions(g, n.children(g), depth + 1, out)
  }
  return out
}

/** Every visible label, subtitle and info line of a menu tree (what the player reads). */
function menuTexts(g: GameState, nodes: MenuNode[], depth = 0, out: string[] = []): string[] {
  if (depth > 3) return out
  for (const n of nodes) {
    if (n.visible && !n.visible(g)) continue
    if ('label' in n && n.label) out.push(n.label)
    if ('subtitle' in n && typeof n.subtitle === 'string') out.push(n.subtitle)
    if (n.type === 'info' && typeof n.text === 'string') out.push(n.text)
    if (n.type === 'menu') menuTexts(g, n.children(g), depth + 1, out)
  }
  return out
}

class Collector {
  seen: Seen[] = []
  countries: string[] = []
  context = 'birth'
  private logIds = new Set<string>()
  constructor(private g: () => GameState) {}
  begin(context: string): void {
    this.countries = [this.g().character.countryId]
    this.context = context
  }
  private here(): string[] {
    return [...new Set([...this.countries, this.g().character.countryId])]
  }
  add(text: string, kind: string): void {
    this.seen.push({ text, year: this.g().year, countries: this.here(), where: `${kind} <- ${this.context}` })
  }
  flushLog(): void {
    for (const y of this.g().log) {
      for (const e of y.entries) {
        if (this.logIds.has(e.id)) continue
        this.logIds.add(e.id)
        this.seen.push({ text: e.text, year: y.year, countries: this.here(), where: `log <- ${this.context}` })
      }
    }
  }
}

function drain(g: GameState, d: Driver, col: Collector): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    switch (m.kind) {
      case 'notice':
        col.add(`${m.title} :: ${m.text}`, 'notice')
        break
      case 'choice': {
        col.add(`${m.title} :: ${m.text}`, 'choice')
        for (const c of m.choices) col.add(c.label, `option of "${m.title}"`)
        const choice = d.pick(m.choices)
        if (m.source === 'script') runScript(g, m.scriptId!, choice.id, m.data, m)
        else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: choice.id })
        break
      }
      case 'input':
        col.add(`${m.title} :: ${m.text ?? ''}`, 'input')
        runScript(g, m.scriptId, inputValue(m, d), m.data, m)
        break
      case 'minigame':
        runScript(g, m.scriptId, minigameResult(m, d), m.data, m)
        break
      case 'aiTask':
        applyFallback(g, m.task)
        break
    }
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
  col.flushLog()
}

/** Picks a top-level section first (so small menus get played as often as big ones), then an action in it. */
function pickAction(g: GameState, d: Driver, menu: MenuGroup): MenuAction | undefined {
  const top = menu.children(g).filter((n) => usable(g, n))
  if (!top.length) return undefined
  const section = d.pick(top)
  if (section.type === 'action') return section
  if (section.type !== 'menu') return undefined
  const options = collectActions(g, section.children(g), 1)
  return options.length ? d.pick(options) : undefined
}

function playLife(seed: number, year: number, countryId: string | undefined, actionsPerYear: number, maxAge = 125): Seen[] {
  const d = driver(seed * 104729 + year)
  const g = createNewLife({ seed, year, countryId })
  const col = new Collector(() => g)
  col.begin('birth')
  drain(g, d, col)
  while (g.character.alive && g.character.age < maxAge) {
    const n = d.int(0, actionsPerYear)
    for (let i = 0; i < n && g.character.alive; i++) {
      const roll = d.next()
      let action: MenuAction | undefined
      if (roll < 0.3) {
        const living = g.people.filter((p) => p.alive)
        const person = living.length ? d.pick(living) : undefined
        if (person) {
          const nodes = personActions(g, person)
          col.begin(`${person.relation} menu`)
          for (const t of menuTexts(g, nodes)) col.add(t, 'menu text')
          action = d.pick([undefined, ...collectActions(g, nodes)])
        }
      } else {
        action = pickAction(g, d, d.pick([activitiesMenu, activitiesMenu, activitiesMenu, occupationMenu, assetsMenu]))
      }
      if (!action) continue
      col.begin(`action ${action.id}`)
      if (action.label) col.add(action.label, 'label')
      if (typeof action.subtitle === 'string') col.add(action.subtitle, 'subtitle')
      const input = action.input
        ? action.input.kind === 'number'
          ? String(d.int(action.input.min ?? 1, Math.min(action.input.max ?? 5000, (action.input.min ?? 1) + 5000)))
          : (action.input.defaultValue?.(g) ?? d.pick(TEXT_INPUTS))
        : undefined
      action.run(g, input)
      drain(g, d, col)
    }
    if (!g.character.alive) break
    col.begin('age up')
    ageUp(g)
    drain(g, d, col)
  }
  return col.seen
}

const COUNTRIES = [undefined, 'us', 'gb', 'in', 'ng', 'br', 'jp', 'de', 'mx', 'id', 'eg', 'fr', 'ru']
/** World headlines (the markets' year in review) speak of the whole world, so a technology counts once the richest countries have it. */
const WORLD_NEWS = /^Financial News :: /
const LIVES = Math.max(1, Number(process.env.ANACHRONISM_LIVES) || 48)

/** Lives 0 to lives - 1 by default; a slice passes its own indexes, and life i is the same life whatever else is listed. */
function lint(
  lives: number,
  first: number,
  last: number,
  actions: number,
  indexes: readonly number[] = Array.from({ length: lives }, (_, i) => i),
): { list: (Seen & { rules: string[] })[]; report: string } {
  const bad: Record<string, Seen & { rules: string[] }> = {}
  for (const i of indexes) {
    const year = first + Math.round((i * (last - first)) / Math.max(1, lives - 1))
    const country = COUNTRIES[i % COUNTRIES.length]
    for (const s of playLife(i + 1, year, country, actions)) {
      const rules = anachronismsIn(s.text, s.year, WORLD_NEWS.test(s.text) ? [...s.countries, 'us'] : s.countries)
      if (!rules.length) continue
      const key = `${rules.join(',')}|${s.text.slice(0, 160)}`
      if (!bad[key]) bad[key] = { ...s, rules }
    }
  }
  const list = Object.values(bad).sort((a, b) => a.rules[0].localeCompare(b.rules[0]))
  const report = list.map((v) => `[${v.rules.join(',')}] ${v.year} ${v.countries.join('/')} (${v.where}): ${v.text.slice(0, 220)}`).join('\n')
  if (list.length) console.log(`${list.length} anachronisms in ${indexes.length} of ${lives} lives:\n${report}`)
  return { list, report }
}

// The detector and vocabulary describes (about ten short tests) run in one owner slice only.
if (ownedHere('anachronism:units', slice)) describe('the anachronism detector', () => {
  it('flags modern words before their technology and lets them through after', () => {
    expect(anachronismsIn('I texted my mom.', 1950, ['us'])).toContain('texting')
    // Wondering whether anyone will walk on the moon is period talk; watching it happen is not.
    expect(anachronismsIn('You argued about whether anyone will ever walk on the moon.', 1950, ['us'])).toEqual([])
    expect(anachronismsIn('I watched the astronauts walk on the moon.', 1950, ['us'])).toContain('moon landing')
    expect(anachronismsIn('I texted my mom.', PRESENT_YEAR, ['us'])).toEqual([])
    expect(anachronismsIn('You posted a selfie online.', 1975, ['gb'])).toEqual(expect.arrayContaining(['selfie', 'internet']))
    expect(anachronismsIn('You posted a selfie online.', PRESENT_YEAR, ['gb'])).toEqual([])
    expect(anachronismsIn('We watched TV.', 1925, ['us'])).toContain('tv')
    expect(anachronismsIn('We watched TV.', 1965, ['us'])).toEqual([])
    // A country that adopts later is still judged by where the player lived.
    expect(anachronismsIn('We watched TV.', 1952, ['ng'])).toContain('tv')
    expect(anachronismsIn('We watched TV.', 1952, ['ng', 'us'])).toEqual([])
  })

  it('knows when the moon landing, color TV and e-bikes arrived', () => {
    // Review: a 1948 American life "bought a color set", and the 1948 Bike Shop sold e-bikes.
    expect(anachronismsIn('We bought a color set and watched everything.', 1948, ['us'])).toContain('color tv')
    expect(anachronismsIn('We bought a color set and watched everything.', 1975, ['us'])).toEqual([])
    expect(anachronismsIn('I drew a picture of the moon landing.', 1955, ['gb'])).toContain('moon landing')
    expect(anachronismsIn('I drew a picture of the moon landing.', 1969, ['gb'])).toEqual([])
    expect(anachronismsIn('Bikes, e-bikes and scooters', 1948, ['us'])).toContain('e-bike')
    expect(anachronismsIn('Bikes, e-bikes and scooters', PRESENT_YEAR, ['us'])).toEqual([])
  })

  it('does not trip on ordinary words that merely look modern', () => {
    for (const text of ['I read my textbook.', 'A storm of applause.', 'She sent a telegram.', 'The main character dies in act three.', 'A flight of stairs.', 'He hacked away at the weeds.']) {
      expect(anachronismsIn(text, 1910, ['us']), text).toEqual([])
    }
  })
})

if (ownedHere('anachronism:units', slice)) describe('era vocabulary', () => {
  it('speaks of letters and radios in 1925 and of messages and selfies today', () => {
    const old = makeTestGame(3, { countryId: 'us' })
    old.year = 1925
    const now = makeTestGame(3, { countryId: 'us' })
    expect(reachVerb(old)).toBe('wrote to')
    expect(reachVerb(now)).toBe('messaged')
    expect(photoWord(old)).toBe('photo')
    expect(photoWord(now)).toBe('selfie')
    expect(newsSource(old)).toBe('in the newspaper')
    expect(newsSource(now)).toBe('online')
    expect(screenThing(now)).toBe('phone')
    expect(kidPrize(now)).toBe('the tablet')
    expect(homeMovies(now)).toBe('a streaming service')
    old.year = 1993
    expect(reachVerb(old)).toBe('called')
    expect(kidPrize(old)).toBe('the game console')
    expect(homeMovies(old)).toBe('a rented videotape')
  })

  it('picks tagged lines only when their gates hold', () => {
    const g = makeTestGame(5, { countryId: 'us' })
    g.year = 1960
    const lines = ['@smartphone You checked your phone.', '@-1970 You wound the clock.', '@tv,1950 You watched the news.', 'You went to bed.']
    expect(eraLines(g, lines)).toEqual(['You wound the clock.', 'You watched the news.', 'You went to bed.'])
    for (let i = 0; i < 20; i++) expect(eraPick(g, lines)).not.toMatch(/@|phone/)
    expect(gateHolds(g, '!smartphone')).toBe(true)
    expect(gateHolds(g, '+internet')).toBe(false)
    expect(byEra(g, [['smartphone', 'app'], ['tv', 'set']], 'none')).toBe('set')
    g.year = PRESENT_YEAR
    expect(eraLines(g, lines)).toEqual(['You checked your phone.', 'You watched the news.', 'You went to bed.'])
    expect(byEra(g, [['smartphone', 'app'], ['tv', 'set']], 'none')).toBe('app')
  })
})

describe('anachronism lint (offline lives born 1900-1995)', () => {
  it('never mentions things before they existed', () => {
    // Zero findings is a per-life result, so a slice checks its own lives and the union is clean when every slice is.
    const { list, report } = lint(LIVES, 1900, 1995, 4, seedSlice(Array.from({ length: LIVES }, (_, i) => i), 'anachronism:lint', slice))
    expect(list.length, report.slice(0, 6000)).toBe(0)
  }, 900_000)
})

describe('lives born in PRESENT_YEAR', () => {
  const LIFE_COUNT = 8
  const mine = seedSlice(Array.from({ length: LIFE_COUNT }, (_, i) => i), 'anachronism:present', slice)
  /** One row per life played: how many of its texts are modern. */
  const hitsPerLife: number[] = []

  it('keep their modern texts (and stay clean)', () => {
    const modern = /\b(text(ed|ing)?|selfies?|online|social media|apps?|phone|group chat|streaming|posted)\b/i
    for (const i of mine) {
      let hits = 0
      for (const s of playLife(900 + i, PRESENT_YEAR, i % 2 ? 'us' : 'gb', 4, 45)) {
        if (s.year <= PRESENT_YEAR + 30 && modern.test(s.text)) hits++
        expect(anachronismsIn(s.text, s.year, s.countries), s.text).toEqual([])
      }
      hitsPerLife.push(hits)
    }
  }, 300_000)

  it('keep enough modern texts across the lives', () => {
    recordSlice('anachronism:present', hitsPerLife, slice)
    // A slice checks only that its own lives were played; the merge step checks the whole set.
    if (slice.mode === 'part') {
      expect(hitsPerLife).toHaveLength(mine.length)
      return
    }
    const all = slice.mode === 'merge' ? mergedSlices<number>('anachronism:present', slice) : hitsPerLife
    expect(all).toHaveLength(LIFE_COUNT)
    expect(all.reduce((total, hits) => total + hits, 0)).toBeGreaterThan(20)
  })
})
