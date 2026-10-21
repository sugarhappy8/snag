// R1-N10: the release sweep of the Navigation track. The three flags (navRegroup, navPalette, cockpits) ship dark and the
// lead turns them on in one release commit, so every check here runs with them ON (withFlags) and passes now and after
// that commit. The checks are the aggregate ones no single task owns:
//
//   - purity (RF5): the builders of search, regrouping, Needs you, the cockpits and the company screen read a frozen
//     state and leave it, its rng and Math.random alone;
//   - no leakage: pins and recents are UI state, so nothing under src/game names them and the game JSON never holds them;
//   - the money, voice and per-tap rules of the new files, as string scans and call counts;
//   - the cost of the index, and the legacy path (flags off equals v4.0.2);
//   - a real v4.0.2 save opens in all of it without a NaN or an undefined on screen.
//
// A CEO state is about 12,000 menu nodes, so the index of each canned state is built once per file (probe).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { businessScreen, businessView } from '../src/game/business/manage'
import { businessAssets } from '../src/game/business/state'
import { FLAG_DEFS, FLAGS, resetFlags, withFlags, type FlagKey, type FlagOverrides } from '../src/game/flags'
import { cockpitOf, type CockpitTab } from '../src/game/hubs/cockpit'
import { needsYou } from '../src/game/hubs/needs'
import { peopleMenu } from '../src/game/hubs/people'
import { companyCards } from '../src/game/hubs/wealth'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { migrateSave } from '../src/game/save-schema'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { groupChildren, infoText, nodeBadge, nodeSubtitle, nodeVisible } from '../src/ui/components/menuModel'
import type { PlaceRef } from '../src/ui/nav/place'
import { lifeOf, recordRecent, resetPrefsForTest, togglePin, updatePrefs, type UiPrefs } from '../src/ui/nav/prefs'
import { regroupForDisplay } from '../src/ui/nav/sections'
import { buildIndex, INDEX_LIMITS, type SearchIndex } from '../src/ui/nav/searchIndex'
import { search } from '../src/ui/nav/searchRank'
import { buildIndexCached, frozen, navState, type NavStateName } from './nav-kit'

// Built-in tasks resolve to nothing here (the pattern of test/ui-return.test.ts), so only what a test queues shows up.
const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const store = await import('../src/ui/store')
const { MenuSheet } = await import('../src/ui/components/MenuSheet')
const { RelationshipsSheet } = await import('../src/ui/components/RelationshipsSheet')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b/
/** An index of the CEO state, a walk of a company tree and a real save take seconds on a loaded box. */
const HEAVY = 120_000

const NAMES: readonly NavStateName[] = ['kid', 'adult', 'ceo', 'elder']
const TABS: readonly CockpitTab[] = ['occupation', 'assets', 'relationships', 'activities']
const ROOTS: readonly MenuGroup[] = [occupationMenu, assetsMenu, activitiesMenu, peopleMenu]
const FLAG_KEYS: readonly FlagKey[] = ['navRegroup', 'navPalette', 'cockpits']
const ALL_ON: FlagOverrides = { navRegroup: true, navPalette: true, cockpits: true }
const ALL_OFF: FlagOverrides = { navRegroup: false, navPalette: false, cockpits: false }
const QUERIES = ['doctor', 'bitcoin', 'marry', 'mortgage', 'computer ventures', 'job', 'house', 'friend', 'tax', 'zzzzqq']

/** Run fn with the three flags on, like the lead's release commit leaves them. */
function on<T>(fn: () => T): T {
  return withFlags(ALL_ON, fn)
}

beforeEach(() => {
  resetFlags()
  resetPrefsForTest()
})

afterEach(() => {
  resetFlags()
  resetPrefsForTest()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers

/** Every file under `dir` (absolute), sorted. */
function filesUnder(dir: string): string[] {
  const out: string[] = []
  const walk = (abs: string): void => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const next = join(abs, e.name)
      if (e.isDirectory()) walk(next)
      else out.push(next)
    }
  }
  walk(dir)
  return out.sort()
}

const rel = (abs: string): string => relative(ROOT, abs).split(sep).join('/')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

/** The files this track added: the hubs (game layer) and the nav folder (UI). */
const NEW_FILES: readonly string[] = [...filesUnder(join(ROOT, 'src/game/hubs')), ...filesUnder(join(ROOT, 'src/ui/nav'))].map(rel)

/** Replace the store's game with a canned state (the way a load would), dropping every key the starting life had. */
function install(g: GameState): void {
  store.startNewLife({ seed: 7, year: 2026 })
  store.act((cur) => {
    const bag = cur as unknown as Record<string, unknown>
    for (const k of Object.keys(bag)) delete bag[k]
    Object.assign(cur, structuredClone(g))
    cur.queue = []
  })
}

const render = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el)

/** Every number in a value is finite and no string says NaN, undefined or Infinity. */
function expectClean(v: unknown, where: string): void {
  if (typeof v === 'number') {
    expect(Number.isFinite(v), `${where} is ${v}`).toBe(true)
  } else if (typeof v === 'string') {
    expect(v, where).not.toMatch(BAD)
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => expectClean(x, `${where}[${i}]`))
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) expectClean(x, `${where}.${k}`)
  }
}

/** The words a list shows: labels, info text and subtitles, and the rows inside a cockpit tile (a `hub.` group). */
function nodeTexts(nodes: readonly MenuNode[], g: GameState): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.type === 'info') {
      out.push(infoText(n, g))
    } else if (n.type === 'heading') {
      out.push(n.label)
    } else {
      out.push(n.label)
      const sub = nodeSubtitle(n, g)
      if (sub) out.push(sub)
      if (n.type === 'menu' && n.id.startsWith('hub.')) out.push(...nodeTexts(groupChildren(n, g), g))
    }
  }
  return out
}

interface Probe {
  index: SearchIndex
  /** Milliseconds the one real build took. */
  ms: number
  randomCalls: number
  errors: number
}

const probes = new Map<NavStateName, Probe>()

/**
 * The index of a frozen canned state, built once per file through the memoised helper (so a write would have thrown),
 * with Math.random and console.error watched and the build timed. Call it inside on() only.
 *
 * The first frozen('ceo') also creates the life, two companies and four simulated years (navState, memoised). That is
 * the fixture, not the index, so navState runs before the clock starts (still under the spies) and ms is the clone, the
 * freeze and buildIndex. Otherwise a loaded box could fail the 8 second guard on a healthy index.
 */
function probe(name: NavStateName): Probe {
  let hit = probes.get(name)
  if (!hit) {
    const random = vi.spyOn(Math, 'random')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    navState(name)
    const t0 = performance.now()
    const index = buildIndexCached(name)
    const ms = performance.now() - t0
    hit = { index, ms, randomCalls: random.mock.calls.length, errors: errors.mock.calls.length }
    random.mockRestore()
    errors.mockRestore()
    probes.set(name, hit)
  }
  return hit
}

// ---------------------------------------------------------------------------

describe('1. the flags', () => {
  it('on() turns the three flags on and puts them back', () => {
    const before = FLAG_KEYS.map((k) => FLAGS[k])
    on(() => {
      for (const k of FLAG_KEYS) expect(FLAGS[k], k).toBe(true)
    })
    expect(FLAG_KEYS.map((k) => FLAGS[k])).toEqual(before)
  })

  it('FLAG_DEFS still lists navRegroup, navPalette and cockpits (the lead flips their defaults, nobody removes them)', () => {
    for (const k of FLAG_KEYS) {
      expect(FLAG_DEFS, k).toHaveProperty(k)
      expect(typeof FLAG_DEFS[k].default, `${k} default`).toBe('boolean')
      expect(FLAG_DEFS[k].ships, `${k} ships`).toBe('4.1.0')
    }
  })
})

describe('2. aggregate purity (RF5)', () => {
  for (const name of NAMES) {
    it(`${name}: index, search, regrouping, Needs you, cockpits, cards, company screens and people leave the state alone`, () =>
      on(() => {
        const built = probe(name)
        const g = frozen(name)
        const json = JSON.stringify(g)
        const rng = g.rng
        const random = vi.spyOn(Math, 'random')
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(built.index.entries.length, 'index entries').toBeGreaterThan(50)
        for (const q of QUERIES) search(built.index, q, { pins: [], recents: [] })
        for (const root of ROOTS) {
          const kids = root.children(g)
          regroupForDisplay(root.id, kids, g)
          needsYou(kids, g)
          for (const n of kids) if (n.type === 'action' || n.type === 'menu') nodeBadge(n, g)
        }
        for (const tab of TABS) cockpitOf(tab, g)
        companyCards(g)
        for (const a of businessAssets(g)) {
          for (const n of businessScreen(g, a)) if (n.type === 'menu') groupChildren(n, g)
        }
        peopleMenu.children(g)

        // A write to the frozen state would throw, and the menu wrappers swallow a throw into console.error.
        expect(errors.mock.calls, 'console.error from a builder').toEqual([])
        expect(built.errors, 'console.error while indexing').toBe(0)
        expect(random).not.toHaveBeenCalled()
        expect(built.randomCalls, 'Math.random while indexing').toBe(0)
        expect(g.rng).toBe(rng)
        expect(JSON.stringify(g)).toBe(json)
      }), HEAVY)
  }
})

describe('3. no leakage', () => {
  it('no file under src/game names the UI folder or the storage key of pins and recents', () => {
    const files = filesUnder(join(ROOT, 'src/game'))
    expect(files.length).toBeGreaterThan(100)
    const bad = files.filter((f) => {
      const text = readFileSync(f, 'utf8')
      return text.includes('ui/nav') || text.includes('anotherlife.ui.v1')
    })
    expect(bad.map(rel)).toEqual([])
  })

  for (const name of NAMES) {
    it(`${name}: after a pin and a recent the game JSON holds neither the pinned id nor "pins"`, () =>
      on(() => {
        const g0 = navState(name)
        expect(JSON.stringify(g0), 'before').not.toContain('pins')
        install(g0)
        const lifeId = (store.getApp().game as GameState).lifeId
        const mark = 'zz.pinned.probe.77'
        const pinned: PlaceRef = { tab: 'activities', path: [mark], id: `${mark}.act` }
        updatePrefs((p) => togglePin(p, lifeId, pinned).prefs)
        recordRecent(lifeId, { tab: 'assets', path: [mark], id: `${mark}.seen` })

        // The pin and the recent exist, so the check below is not about an empty store.
        const box: { prefs?: UiPrefs } = {}
        updatePrefs((p) => {
          box.prefs = p
          return p
        })
        expect(lifeOf(box.prefs as UiPrefs, lifeId).pins).toEqual([pinned])
        expect(lifeOf(box.prefs as UiPrefs, lifeId).recents).toHaveLength(1)

        for (const json of [JSON.stringify(store.getApp().game), JSON.stringify(g0)]) {
          expect(json).not.toContain(mark)
          expect(json).not.toContain('pins')
          expect(json).not.toContain('recents')
          expect(json).not.toContain('anotherlife.ui.v1')
        }
      }))
  }
})

describe('4. money ratchet (preview of criterion 10)', () => {
  const CALLS = ['earnIncome(', 'addMoney(', 'spend(', '.money +=', '.cash +=']

  it('scans the hubs and the nav folder, and they are really there', () => {
    expect(NEW_FILES).toContain('src/game/hubs/company.ts')
    expect(NEW_FILES).toContain('src/ui/nav/searchIndex.ts')
    expect(NEW_FILES.length).toBeGreaterThan(20)
  })

  it('no new file books a dollar', () => {
    const hits: string[] = []
    for (const f of NEW_FILES) {
      const text = read(f)
      for (const call of CALLS) if (text.includes(call)) hits.push(`${f}: ${call}`)
    }
    expect(hits).toEqual([])
  })
})

describe('5. voice', () => {
  it('no em-dash or en-dash in the new files, the stylesheet or the docs', () => {
    const files = [...NEW_FILES, 'src/ui/styles/nav.css', 'docs/NAVIGATION.md']
    const hits = files.filter((f) => DASH.test(read(f)))
    expect(hits).toEqual([])
  })

  it('docs/NAVIGATION.md covers the flags, the data order, the hub prefix, badges, keywords, the palette zone and the lazy gate', () => {
    const doc = read('docs/NAVIGATION.md')
    for (const word of ['navRegroup', 'navPalette', 'cockpits', 'regroupForDisplay', 'hub.', 'registerBadge', 'KEYWORDS', 'anotherlife.ui.v1', 'src/ui/nav/lazy.tsx', 'PALETTE_ZONE']) {
      expect(doc, word).toContain(word)
    }
    expect(doc.split('\n').length).toBeGreaterThan(80)
  })
})

describe('6. per-tap cost (criterion 12)', () => {
  /** A copy of a list in which every group counts the calls to its `children`. */
  function counted(nodes: MenuNode[], calls: Map<string, number>): MenuNode[] {
    return nodes.map((n) => {
      if (n.type !== 'menu') return n
      const real = n.children
      return {
        ...n,
        children: (gg: GameState) => {
          calls.set(n.id, (calls.get(n.id) ?? 0) + 1)
          return real(gg)
        },
      }
    })
  }

  const total = (calls: Map<string, number>): number => [...calls.values()].reduce((a, b) => a + b, 0)

  for (const root of [occupationMenu, assetsMenu, activitiesMenu]) {
    it(`${root.id}: the root list, the badges, Needs you and the regrouping call no children of a child group`, () =>
      on(() => {
        install(navState('adult'))
        const g = store.getApp().game as GameState
        const calls = new Map<string, number>()
        const real = root.children
        const spy = vi.spyOn(root, 'children').mockImplementation((gg) => counted(real(gg), calls))
        try {
          const kids = groupChildren(root, g)
          expect(kids.filter((n) => n.type === 'menu').length, 'groups under the root').toBeGreaterThan(0)
          regroupForDisplay(root.id, kids, g)
          needsYou(kids, g)
          for (const n of kids) if (n.type === 'action' || n.type === 'menu') nodeBadge(n, g)
          expect(total(calls)).toBe(0)
          expect(spy).toHaveBeenCalledTimes(1)

          // The sheet at its root: the root list once, and nothing below it.
          spy.mockClear()
          const html = render(createElement(MenuSheet, { root, onClose: () => {} }))
          expect(html).toContain('cockpit-panel')
          expect(spy).toHaveBeenCalledTimes(1)
          expect(total(calls)).toBe(0)
        } finally {
          spy.mockRestore()
        }
      }))
  }

  it('relationships: the sheet reads the people list once and opens no person', () =>
    on(() => {
      install(navState('adult'))
      const g = store.getApp().game as GameState
      const calls = new Map<string, number>()
      const real = peopleMenu.children
      const spy = vi.spyOn(peopleMenu, 'children').mockImplementation((gg) => counted(real(gg), calls))
      try {
        const html = render(createElement(RelationshipsSheet, { onClose: () => {} }))
        expect(html).toContain('cockpit-panel')
        expect(spy).toHaveBeenCalledTimes(1)
        expect(total(calls)).toBe(0)
        expect(real(g).some((n) => n.type === 'menu')).toBe(true)
      } finally {
        spy.mockRestore()
      }
    }))
})

describe('7. index cost guard', () => {
  it('buildIndex(ceo) visits at most 20,000 nodes and finishes in under 8 seconds', () =>
    on(() => {
      const { index, ms } = probe('ceo')
      expect(INDEX_LIMITS.nodes).toBeLessThanOrEqual(20_000)
      expect(index.complete).toBe(true)
      expect(index.nodes).toBeLessThanOrEqual(20_000)
      expect(index.nodes).toBeGreaterThan(1000)
      expect(ms).toBeLessThan(8000)
    }), HEAVY)
})

describe('8. the legacy path stays (flags off equals v4.0.2)', () => {
  const labels = (html: string): string[] =>
    [...html.matchAll(/<span class="menu-row-label">(.*?)<\/span>/g)].map((m) =>
      m[1]!.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    )

  it('the three roots list the same ids with the flags on and off, and Activities is still Do Anything, the rest by label, Surrender', () => {
    for (const name of NAMES) {
      const g = frozen(name)
      for (const root of [occupationMenu, assetsMenu, activitiesMenu, peopleMenu]) {
        const off = withFlags(ALL_OFF, () => root.children(g).map((n) => n.id))
        const onIds = on(() => root.children(g).map((n) => n.id))
        expect(onIds, `${name}/${root.id}`).toEqual(off)
      }
    }
    const adult = frozen('adult')
    const rows = withFlags(ALL_OFF, () => activitiesMenu.children(adult)).filter((n): n is MenuAction | MenuGroup => n.type === 'action' || n.type === 'menu')
    const middle = rows.filter((n) => n.id !== 'doAnything' && n.id !== 'surrenderLife').map((n) => n.label)
    expect(rows[0]!.id).toBe('doAnything')
    expect(rows[rows.length - 1]!.id).toBe('surrenderLife')
    expect(middle).toEqual([...middle].sort((a, b) => a.localeCompare(b)))
  })

  it('the three sheets show the v4.0.2 markup: no card, pill, section, cockpit or strip, rows in data order', () => {
    install(navState('adult'))
    store.act((g) => {
      g.character.wantedLevel = 2
    })
    const g = store.getApp().game as GameState
    withFlags(ALL_OFF, () => {
      for (const root of [occupationMenu, assetsMenu, activitiesMenu]) {
        const html = render(createElement(MenuSheet, { root, onClose: () => {} }))
        for (const word of ['needs-card', 'menu-row-badge', 'menu-heading', 'cockpit', 'crumbs']) {
          if (word === 'menu-heading' && root.id !== 'activities') continue
          expect(html, `${root.id}: ${word}`).not.toContain(word)
        }
        const expected = root
          .children(g)
          .filter((n) => nodeVisible(n, g) && (n.type === 'action' || n.type === 'menu'))
          .map((n) => (n as { label: string }).label)
        expect(labels(html), root.id).toEqual(expected)
      }
      // One level down the header is followed by the body: no strip.
      const deeper = render(createElement(MenuSheet, { root: activitiesMenu, onClose: () => {}, initial: { path: ['computer'], scrolls: [0, 0] } }))
      expect(deeper).toContain('</header><div class="sheet-body">')
      expect(deeper).not.toContain('crumbs')
    })
  })

  it('the company screen is the flat list, row for row', () => {
    withFlags(ALL_OFF, () => {
      const g = frozen('ceo')
      const companies = businessAssets(g)
      expect(companies).toHaveLength(2)
      for (const a of companies) {
        expect(businessScreen(g, a).map((n) => n.id)).toEqual(businessView(g, a).map((n) => n.id))
      }
    })
  })
})

describe('9. a real v4.0.2 save opens in all of it (criterion 13)', () => {
  it('migrates to a ready game, then every root, cockpit, company screen and the index read clean', () =>
    on(() => {
      const raw = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'test/fixtures/save-v1.json.gz'))).toString()) as unknown
      const result = migrateSave(structuredClone(raw))
      expect(result.kind).toBe('ready')
      if (result.kind !== 'ready') return
      const game = result.game
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

      install(game)
      const g = store.getApp().game as GameState
      const roots: readonly (readonly [string, MenuGroup])[] = [
        ['occupation', occupationMenu],
        ['assets', assetsMenu],
        ['activities', activitiesMenu],
      ]
      for (const [tab, root] of roots) {
        const html = render(createElement(MenuSheet, { root, onClose: () => {} }))
        expect(html, `${tab} sheet`).toContain('cockpit-panel')
        expect(html, `${tab} sheet`).not.toMatch(BAD)
      }
      const people = render(createElement(RelationshipsSheet, { onClose: () => {} }))
      expect(people).toContain('cockpit-panel')
      expect(people).not.toMatch(BAD)

      for (const tab of TABS) expectClean(cockpitOf(tab, g), `cockpit ${tab}`)
      const companies = businessAssets(g)
      expect(companies.length, 'the save owns companies').toBeGreaterThan(0)
      for (const a of companies) {
        for (const text of nodeTexts(businessScreen(g, a), g)) expect(text, `screen of ${a.name}`).not.toMatch(BAD)
      }
      for (const card of companyCards(g)) expectClean(card, `card ${card.name}`)

      const index = buildIndex(g)
      expect(index.entries.length).toBeGreaterThan(50)
      expect(index.complete).toBe(true)
      for (const e of index.entries) {
        expect(e.label, `index label ${e.key}`).not.toMatch(BAD)
        expect(e.crumbs.join(' '), `index crumbs ${e.key}`).not.toMatch(BAD)
      }
      expect(errors.mock.calls, 'console.error').toEqual([])
    }), HEAVY)
})
