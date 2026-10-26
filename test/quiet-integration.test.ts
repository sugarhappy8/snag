// R3-Q13 (E.D2 and E.D3 together): the quiet lanes fit. The main lane wrote the year planner, the close and the store wiring; the ui lane wrote the
// year card and the collapsed log and read them as `unknown`, so the two never compiled against each other's types. They agree by shape
// (section 2 of the quiet plan), and this file is where the shape is checked end to end, on real lives:
//
//   1. the group table of the planner (game/hubs/year-plan.ts) is the group table of the log view (ui/components/logModel.ts), for the 36 yearly
//      hooks, the year events and the three sources of this release (decision D31);
//   2. a card made by closeYear on a real life passes cleanCard with no field changed, and the card popup and the inline card draw it;
//   3. a tycoon's real year folds to at most 8 lines in the log view, and nothing in it is lost;
//   4. the dark flag `yearCard` off leaves ageUpAction as it was, and on it closes the year;
//   5. the Settings sentence appears with the flag and not before it;
//   6. docs/QUIET.md has no dash and names every export the plan promised, and the kernel note points at it.
//
// No seed is pinned (test/seed-kit.ts finds each life). The numbers of the roadmap are asserted in test/quiet-acceptance.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { unitFlags } from '../scripts/voice/rules.mjs'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { resetFlags, setFlags, withFlags } from '../src/game/flags'
import { readYearBook } from '../src/game/hubs/year-book'
import { GROUP_OF_SOURCE as PLAN_GROUPS, YEAR_GROUP_ORDER, YEAR_LIMITS, groupOf as planGroupOf } from '../src/game/hubs/year-plan'
import { createNewLife } from '../src/game/life'
import { PACE } from '../src/game/text/pace'
import type { GameState, ModalItem, NoticeModal, YearCard } from '../src/game/types'
import { GROUP_LABEL, GROUP_ORDER, cleanCard, inlineCard, type CardView } from '../src/ui/components/yearCardModel'
import { GROUP_OF_SOURCE as VIEW_GROUPS, LOG_VISIBLE, groupOf as viewGroupOf, viewYearLog } from '../src/ui/components/logModel'
import { playLife, type PlayedYear } from './play-kit'
import { probeLife } from './probe-life'
import { findSeed } from './seed-kit'

// Minimal in-memory localStorage, installed before the store loads its settings (the way test/year-close-store.test.ts does).
vi.hoisted(() => {
  const data = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
})

const store = await import('../src/ui/store')
const { YearCardInline, YearCardPopup } = await import('../src/ui/components/YearCard')
const { NoticeSettingsSection } = await import('../src/ui/components/NoticeSettings')

const ROOT = join(__dirname, '..')
const src = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const TIMEOUT = 300_000
// Built from char codes, so that this file carries neither character itself.
const DASH = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)

/** What React writes for a text node: the five characters it escapes. */
const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

// ---------------------------------------------------------------------------------------------------------------
// 1. The two group tables

/** The 36 yearly hooks of the game, by name: the entries of src/game/modules/yearly-aging.ts. */
const HOOKS = [...src('src/game/modules/yearly-aging.ts').matchAll(/^ {2}hook\('([A-Za-z]+)'/gm)].map((m) => m[1]!)

/** The sources of this release's modules (D31): the Effort, Knowledge and Frontier tracks, and the edge step of R4 (X42). Their group is the plan's, written out. */
const MODULE_SOURCES: Readonly<Record<string, string>> = { 'effort.you': 'work', 'knowledge.core': 'money', 'society.acts': 'people', 'world.edges': 'people', 'world.frontier': 'world' }

describe('the planner and the log view agree on the groups', () => {
  it('have one table: the same keys and the same group for each', () => {
    expect({ ...VIEW_GROUPS }).toEqual({ ...PLAN_GROUPS })
  })

  it('name every yearly hook, the year events and the modules of this release, and none by accident', () => {
    expect(HOOKS).toHaveLength(36)
    for (const name of [...HOOKS, 'events', ...Object.keys(MODULE_SOURCES)]) {
      expect(Object.hasOwn(PLAN_GROUPS, name), `${name} in the planner`).toBe(true)
      expect(Object.hasOwn(VIEW_GROUPS, name), `${name} in the log view`).toBe(true)
      expect(viewGroupOf(name), name).toBe(planGroupOf(name))
    }
    for (const [name, group] of Object.entries(MODULE_SOURCES)) expect(planGroupOf(name), name).toBe(group)
    expect(planGroupOf('events')).toBe('life')
  })

  it('treat a missing, unknown or hostile source the same way: everyday', () => {
    for (const s of [undefined, null, '', 'nobody', 'Health', 7, {}, [], 'constructor', '__proto__', 'toString']) {
      expect(viewGroupOf(s), String(s)).toBe('life')
      expect(planGroupOf(s as string | undefined), String(s)).toBe('life')
    }
  })

  it('show the groups in the same order, and the card has a label for each', () => {
    expect([...GROUP_ORDER]).toEqual([...YEAR_GROUP_ORDER])
    for (const k of YEAR_GROUP_ORDER) expect(GROUP_LABEL[k], k).toMatch(/^[A-Z][A-Za-z ]+$/)
    expect(GROUP_LABEL.companies).toBe('Your companies')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// 2. The card, from the close to the screen

interface Closed {
  y: PlayedYear
  card: YearCard
  /** The card the Life tab would draw (flags.yearBook through inlineCard), read right after the year, as GameScreen does. */
  inline: CardView | null
}

/** Play a life the way the store does and keep every card the close made, with what the Life tab would read for the year. */
function cardsOf(opts: { seed: number; birthYear: number; untilAge: number; rich?: boolean; from?: GameState }): Closed[] {
  const inline: (CardView | null)[] = []
  const { years } = playLife({
    ...opts,
    close: true,
    onYear: (g, n) => {
      if (n > 0) inline.push(inlineCard(g.flags, g.year))
    },
  })
  const closed = years.slice(1)
  expect(closed.length, 'one record per year after birth').toBe(inline.length)
  return closed.flatMap((y, i) => (y.closed?.card ? [{ y, card: y.closed.card, inline: inline[i]! }] : []))
}

/** What cleanCard must give for a card the close wrote: every field the same, a missing list empty and a missing line ''. Written out here, not taken from the model. */
function expectedView(c: YearCard): CardView {
  return {
    year: c.year,
    age: c.age,
    head: c.head,
    stories: c.stories,
    money: c.money ?? '',
    people: c.people ?? [],
    world: c.world ?? '',
    groups: c.groups.map((x) => ({ k: x.k, label: GROUP_LABEL[x.k], n: x.n, lines: x.lines })),
    inline: c.inline === true,
    lineCount: 1 + c.stories.length + (c.money ? 1 : 0) + (c.people ?? []).length + (c.world ? 1 : 0),
  }
}

/** The lines of the card as the screen writes them, escaped. Every one must be in the markup. */
function cardTexts(c: YearCard): string[] {
  return [c.head, ...c.stories, ...(c.money ? [c.money] : []), ...(c.people ?? []), ...(c.world ? [c.world] : []), ...c.groups.flatMap((x) => [GROUP_LABEL[x.k], ...x.lines])].map(esc)
}

function seededRich(): Closed[] {
  const seed = findSeed((s) => createNewLife({ seed: s, year: 1990 }).character.alive, { from: 701, tries: 20, label: 'quiet integration: a rich life' })
  return cardsOf({ seed, birthYear: 1990, untilAge: 45, rich: true })
}

function seededFounder(): { seed: number; start: GameState } {
  const seed = findSeed(
    (s) => {
      try {
        probeLife({ seed: s, birthYear: 1990, businesses: 6, years: 0 })
        return true
      } catch {
        return false
      }
    },
    { from: 801, tries: 120, label: 'quiet integration: a founder of six companies' },
  )
  return { seed, start: probeLife({ seed, birthYear: 1990, businesses: 6, years: 0 }) }
}

describe('a card made by the close passes the reader and the screen', () => {
  let rich: Closed[] = []
  let founder: Closed[] = []
  beforeAll(() => {
    rich = seededRich()
    const { seed, start } = seededFounder()
    founder = cardsOf({ seed, birthYear: 1990, untilAge: 45, from: start })
  }, TIMEOUT)

  it('are real cards: the rich life has 45 years and the founder 15, the first 10 of a life are popups and the rest inline', () => {
    expect(rich.length).toBeGreaterThanOrEqual(40)
    expect(founder.length).toBeGreaterThanOrEqual(12)
    expect(rich.slice(0, 10).every((c) => c.card.inline !== true)).toBe(true)
    expect(rich.slice(10).every((c) => c.card.inline === true)).toBe(true)
    // Between them the lives had every part of a card: a headline and a money line each year, a news line, groups, and stories.
    const all = [...rich, ...founder].map((c) => c.card)
    expect(all.every((c) => c.head.length > 0)).toBe(true)
    expect(all.filter((c) => c.money !== undefined).length).toBeGreaterThan(all.length * 0.9)
    expect(all.filter((c) => c.world !== undefined).length).toBeGreaterThan(all.length * 0.9)
    expect(all.filter((c) => c.groups.length > 0).length).toBeGreaterThan(all.length * 0.9)
    expect(all.some((c) => c.stories.length > 0)).toBe(true)
  })

  it('cleanCard gives the same card back, field by field, for every card of both lives', () => {
    for (const { y, card } of [...rich, ...founder]) {
      const view = cleanCard(card)
      expect(view, `age ${y.age}`).not.toBeNull()
      expect(view, `age ${y.age}`).toEqual(expectedView(card))
    }
  })

  it('cleanCard reads the card from its JSON form too: what the save keeps is what the screen reads', () => {
    for (const { card } of [...rich, ...founder]) expect(cleanCard(JSON.parse(JSON.stringify(card)))).toEqual(expectedView(card))
  })

  it('the card popup draws every line and every group of the card the close queued', () => {
    let drawn = 0
    for (const { y, card } of [...rich, ...founder]) {
      const queued = y.popups.find((p) => p.card === true)
      if (card.inline === true) {
        expect(queued, `age ${y.age}: an inline card is not a popup`).toBeUndefined()
        continue
      }
      expect(queued, `age ${y.age}: a popup year queues its card`).toBeDefined()
      const modal = queued!.item as NoticeModal
      expect(modal.digest, `age ${y.age}`).toEqual(card)
      const html = renderToStaticMarkup(createElement(YearCardPopup, { modal }))
      for (const t of cardTexts(card)) expect(html, `age ${y.age}: ${t}`).toContain(t)
      expect(html.split('<button').length - 1, `age ${y.age}: one OK`).toBe(1)
      drawn++
    }
    expect(drawn).toBeGreaterThanOrEqual(20)
  })

  it('the Life tab reads an inline card from flags.yearBook and draws every line of it; a popup year gives it nothing', () => {
    let drawn = 0
    for (const { y, card, inline } of [...rich, ...founder]) {
      if (card.inline !== true) {
        expect(inline, `age ${y.age}: a popup year has no inline card`).toBeNull()
        continue
      }
      expect(inline, `age ${y.age}`).toEqual(expectedView(card))
      const html = renderToStaticMarkup(createElement(YearCardInline, { card: inline }))
      for (const t of cardTexts(card)) expect(html, `age ${y.age}: ${t}`).toContain(t)
      expect(html).not.toContain('<button')
      drawn++
    }
    expect(drawn).toBeGreaterThanOrEqual(30)
  })

  it('no card holds more than the card promises: 8 lines, 90 characters, 3 stories, 3 people, 6 lines a group', () => {
    for (const { y, card } of [...rich, ...founder]) {
      const v = cleanCard(card)!
      expect(v.lineCount, `age ${y.age}`).toBeLessThanOrEqual(8)
      for (const line of [v.head, ...v.stories, v.money, ...v.people, v.world, ...v.groups.flatMap((g) => g.lines)]) expect(line.length, `age ${y.age}: ${line}`).toBeLessThanOrEqual(90)
      expect(v.stories.length).toBeLessThanOrEqual(3)
      expect(v.people.length).toBeLessThanOrEqual(3)
      for (const g of v.groups) expect(g.lines.length).toBeLessThanOrEqual(6)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// 3. A tycoon's year in the log view

describe('a tycoon year in the log view', () => {
  let lived: PlayedYear[] = []
  beforeAll(() => {
    const { seed, start } = seededFounder()
    lived = playLife({ seed, birthYear: 1990, untilAge: 50, close: true, from: start }).years.filter((y) => y.closed !== undefined)
  }, TIMEOUT)

  it('is a real tycoon: six companies, a year of many lines, and companies on the card most years', () => {
    expect(lived.length).toBeGreaterThanOrEqual(15)
    const busy = lived.filter((y) => y.closed!.entries.length > LOG_VISIBLE)
    expect(busy.length, 'years that had more lines than the view shows').toBeGreaterThan(lived.length / 2)
    const withCompanies = lived.filter((y) => y.closed!.card?.groups.some((g) => g.k === 'companies'))
    expect(withCompanies.length).toBeGreaterThanOrEqual(Math.floor(lived.length * 0.9))
  })

  it('shows at most 8 lines in a year and keeps every line in view or in one folded row', () => {
    let folded = 0
    for (const y of lived) {
      const entries = y.closed!.entries
      const view = viewYearLog(entries)
      expect(view.shown.length, `age ${y.age}`).toBeLessThanOrEqual(LOG_VISIBLE)
      const inRows = view.collapsed.reduce((n, g) => n + g.n, 0)
      expect(view.shown.length + inRows, `age ${y.age}: nothing lost`).toBe(entries.length)
      const ids = [...view.shown, ...view.collapsed.flatMap((g) => g.lines)].map((e) => e.id)
      expect(new Set(ids).size, `age ${y.age}: each line once`).toBe(entries.length)
      folded += inRows
    }
    expect(folded, 'the view folded something').toBeGreaterThan(0)
  })

  it('goes from the audit year of about 12 lines to 8: the mean in view is at most 8 and the mean written is above it', () => {
    const shown = lived.map((y) => viewYearLog(y.closed!.entries).shown.length)
    const written = lived.map((y) => y.closed!.entries.length)
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(shown)).toBeLessThanOrEqual(8)
    expect(mean(written)).toBeGreaterThan(12)
  })

  it('folds the company lines first: a year with companies folds a companies row', () => {
    const rows = lived.flatMap((y) => viewYearLog(y.closed!.entries).collapsed.filter((g) => g.k === 'companies'))
    expect(rows.length).toBeGreaterThan(lived.length / 2)
    for (const g of rows) expect(g.label).toBe('Your companies')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// 4. The flag

function game(): GameState {
  return store.getApp().game as GameState
}

/** A new life at 25 with an empty queue, in the store. */
function freshLife(seed: number): void {
  store.startNewLife({ seed, year: 2026 })
  store.act((g) => {
    g.queue = []
    g.character.age = 25
  })
}

/** What the store does with a task at the head of the queue: resolve it, and its popups take its place. */
function resolveHeadTasks(g: GameState): void {
  while (g.queue[0]?.kind === 'aiTask') {
    const task = g.queue.shift() as Extract<ModalItem, { kind: 'aiTask' }>
    const rest = g.queue.length
    applyFallback(g, task.task)
    g.queue.unshift(...g.queue.splice(rest))
  }
}

describe('the yearCard flag', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    store.updateSettings({ quietMode: true })
  })
  afterEach(() => {
    resetFlags()
    store.updateSettings({ quietMode: true })
    vi.restoreAllMocks()
  })

  it('off, ageUpAction plays 12 years exactly as the headless loop does, with every lane merged: queue, log, character and the draws', () => {
    // setFlags replaces the overrides, so both are named: the inbox routing is its own test (test/quiet-routing.test.ts).
    setFlags({ yearCard: false, quietInbox: false })
    freshLife(3)
    const headless = structuredClone(game())
    for (let year = 1; year <= 12; year++) {
      store.ageUpAction()
      ageUp(headless)
      resolveHeadTasks(headless)
      const g = game()
      expect(JSON.stringify(g.queue), `year ${year}: queue`).toBe(JSON.stringify(headless.queue))
      expect(JSON.stringify(g.log), `year ${year}: log`).toBe(JSON.stringify(headless.log))
      expect(JSON.stringify(g.character), `year ${year}: character`).toBe(JSON.stringify(headless.character))
      expect(g.rng, `year ${year}: draws`).toBe(headless.rng)
      expect('yearBook' in g.flags, `year ${year}: no year book`).toBe(false)
      expect('pendingAsks' in g.flags, `year ${year}: no waiting asks`).toBe(false)
      // The player answers everything; both lives go on from an empty queue.
      store.act((d) => {
        d.queue = []
      })
      headless.queue = []
      if (!g.character.alive) break
    }
  })

  it('on, with Quiet Mode on, it closes the year: the book names the year and the card is the last popup', () => {
    setFlags({ yearCard: true })
    freshLife(3)
    store.ageUpAction()
    const g = game()
    expect(readYearBook(g).last).toBe(g.year)
    const last = g.queue[g.queue.length - 1]
    expect(last?.kind === 'notice' && last.digest !== undefined).toBe(true)
  })

  it('on with Quiet Mode off is the old way again: Quiet Mode is the other half of the switch', () => {
    setFlags({ yearCard: true })
    store.updateSettings({ quietMode: false })
    freshLife(3)
    store.ageUpAction()
    expect('yearBook' in game().flags).toBe(false)
    expect(game().queue.some((m) => m.kind === 'notice' && m.digest !== undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// 5. The Settings sentence

describe('the Settings sentence', () => {
  const SENTENCE = 'At the end of a year, routine news folds into one card.'
  const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim()

  it('is under Quiet Mode while the yearCard flag is on, and is not there while it is off', () => {
    const on = text(withFlags({ quietInbox: true, yearCard: true }, () => renderToStaticMarkup(createElement(NoticeSettingsSection))))
    const off = text(withFlags({ quietInbox: true, yearCard: false }, () => renderToStaticMarkup(createElement(NoticeSettingsSection))))
    expect(on).toContain(SENTENCE)
    expect(on.indexOf('Quiet Mode')).toBeLessThan(on.indexOf(SENTENCE))
    expect(off).not.toContain('card')
  })

  it('passes the voice rules and the tooltip length', () => {
    const flags = unitFlags(SENTENCE, 'tooltip').filter((f: string) => ['em-dash', 'chatbot', 'no-contraction'].includes(f))
    expect(flags).toEqual([])
    expect(SENTENCE.length).toBeLessThanOrEqual(120)
    expect(SENTENCE).not.toMatch(DASH)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// 6. The doc

/** The exports section 2 of the quiet plan promises, by file. A type is checked in the source text, a value too, so a rename fails here. */
const EXPORTS: ReadonlyArray<readonly [file: string, names: string]> = [
  ['src/game/types.ts', 'LogWeight LogEntry YearGroup YearCard'],
  ['src/game/core.ts', 'withLogSource currentLogSource LogOptions log'],
  ['src/game/notice-weights.ts', 'NOTICE_WEIGHTS noticeWeightOf noticeWeightFor'],
  ['src/game/hubs/year-plan.ts', 'YEAR_LIMITS GROUP_OF_SOURCE groupOf noticeWeight Story YearMoney moneyFacts moneyLine planNotices buildCard'],
  ['src/game/hubs/year-book.ts', 'YearBook PendingAsk readYearBook writeYearBook readPending writePending'],
  ['src/game/hubs/year-close.ts', 'DEFERRABLE_SCRIPTS CloseReport closeYear'],
  ['src/game/flags.ts', 'FLAG_DEFS'],
  ['src/game/text/pace.ts', 'PACE PaceEngine paceKey notePopup popupSeen paceWeight askGapOk'],
  ['src/game/events/families.ts', 'EVENT_FAMILIES eventFamily'],
  ['src/game/events/ask-families.ts', 'ASK_FAMILIES'],
  ['src/game/events/variants.ts', 'withVariants'],
  ['src/ui/components/yearCardModel.ts', 'CardView cleanCard cardOfModal inlineCard'],
  ['src/ui/components/logModel.ts', 'LOG_VISIBLE lineWeight viewYearLog'],
]

describe('docs/QUIET.md', () => {
  const doc = src('docs/QUIET.md')

  it('has no em-dash and no en-dash', () => {
    expect(doc).not.toMatch(DASH)
  })

  it('names every export of section 2 of the plan, and each one is exported by the file it comes from', () => {
    for (const [file, names] of EXPORTS) {
      const code = src(file)
      for (const name of names.split(' ')) {
        expect(code, `${file} exports ${name}`).toMatch(new RegExp(`^export (declare )?(const|function|interface|type|class) ${name}\\b`, 'm'))
        expect(doc, `docs/QUIET.md names ${name}`).toMatch(new RegExp(`\\b${name}\\b`))
        expect(doc, `docs/QUIET.md names ${file}`).toContain(file)
      }
    }
  })

  it('names the flag and the three things a reader needs to add a family: the table, the key and the cap', () => {
    for (const word of ['yearCard', 'EVENT_FAMILIES', 'ASK_FAMILIES', 'PACE.maxFamilies', 'DEFERRABLE_SCRIPTS', 'moved-tests.md']) expect(doc, word).toContain(word)
  })

  it('is pointed at from the kernel note, in section 9', () => {
    const kernel = src('docs/KERNEL.md')
    const at = kernel.indexOf('## 9.')
    expect(at).toBeGreaterThan(0)
    expect(kernel.slice(at)).toMatch(/^- `docs\/QUIET\.md` - .+$/m)
  })

  it('states the numbers the code has: the budget of the year, the pace window, weight, ask gap and family cap', () => {
    const L = YEAR_LIMITS
    expect(doc).toContain(`${L.choices} unrequested choices`)
    expect(doc).toContain(`${L.notices} notices`)
    expect(doc).toContain(`${L.pending} waiting asks`)
    expect(doc).toContain(`${L.pendingYears} years`)
    expect(doc).toContain(`${L.popupYears} years`)
    expect(doc).toContain(`${L.lines} lines`)
    expect(doc).toContain(`${PACE.window} years`)
    expect(doc).toContain(`x${PACE.weight}`)
    expect(doc).toContain(`${PACE.askGap} years`)
    expect(doc).toContain(`${PACE.maxFamilies} families`)
  })
})
