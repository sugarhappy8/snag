// R3-G12 (H.4 to H.11): the acceptance sweep of the Fog track, run once on the merged tree. Each task of the track proves its own
// screen (test/fog-*.test.ts); no task proves that they hold together, with the Knowledge, Effort, Quiet and Frontier tracks around
// them, in a life that is played and not built.
//
//   (a) screens   in Realistic every screen of the track has its chip or its Look closer row (market, rival, company card, hiring,
//                 chip scorecard, investing, politics) and in Exact none has either; a board vote says a word
//   (b) pure      every one of those screens builds on a deep-frozen copy, leaves the JSON and g.rng alone, and prints no NaN,
//                 undefined or dash
//   (c) owners    every key family of the track has an owner who can say what a key is called and what it really is
//   (d) bought    after a hire (with its background check) and a purchase from each source, on a life with the Business and Investing
//                 talents, every screen of the game still renders: no throw, no write, no hole in the text
//   (e) played    three industries are played in Realistic by the engine fuzzer, with every company screen rendered each year
//   (f) replay    the mode is a presentation switch: a life played with every screen walked in Realistic ends with the JSON of the
//                 same life played in Exact with none
//   (g) hints     the lens leaves Exact alone and moves a figure after "about" in Realistic, in the shape it had
//   (h) docs      docs/FOG.md names every export of the doors of the track, every key family, the rule and what is not fogged
//
// The goldens, the parity fixtures and the old saves are not in here: they run unchanged (test/golden-digest, kernel-parity,
// replay-purity, old-saves), because fog changes what is shown and nothing else. The suite runs in Exact (test/setup-exact.ts); a
// Realistic case goes through inFog, or through the file-wide override of the fuzz block, which restores Exact.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { oddsText, boardOddsKey } from '../src/game/business/board-vote'
import { businessAssets } from '../src/game/business/state'
import { SOURCE_IDS } from '../src/game/knowledge/sources'
import { investmentsMenu } from '../src/game/investments'
import { stockBetsMenu } from '../src/game/computer/money-stocks'
import { kindOf } from '../src/game/knowledge/kinds'
import { setInfoOverride, withInfoMode } from '../src/game/knowledge/mode'
import { readKnow, storedEstimates } from '../src/game/knowledge/contract'
import { markBest } from '../src/game/business/util'
import { withFlags } from '../src/game/flags'
import { specialJobNodes } from '../src/game/special'
import { HINT_EMOJI, talentHint } from '../src/game/talents'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, ChoiceOption, GameState, MenuNode, ModalItem } from '../src/game/types'
import { FailureLog, formatFailures, fuzzBusiness, renderAll as renderEverything } from './fuzz-kit'
import { deepFreeze, inFog } from './knowledge-kit'
import { adult, allNodes, company, marketNode, nextYear, renderAll as renderCompany } from './market-kit'
import { newLeader } from './politics-kit'
import { makeTestGame } from './helpers'
import { playLife } from './play-kit'
import { chipLab } from './silicon-kit'

const ROOT = join(__dirname, '..')
const BAD = /NaN|undefined|\[object|Infinity/
const DASH = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)

// ---------------------------------------------------------------------------------------------------------------------------------
// Reading a screen

/** Every visible node under some roots, menus opened, depth first. */
function walk(g: GameState, nodes: readonly MenuNode[], depth = 0): MenuNode[] {
  const out: MenuNode[] = []
  for (const n of nodes) {
    if (n.visible && !n.visible(g)) continue
    out.push(n)
    if (n.type === 'menu' && depth < 7) out.push(...walk(g, n.children(g), depth + 1))
  }
  return out
}

/** Every string a screen prints: labels, subtitles, hints, reasons, headers and info text. */
function textsOf(g: GameState, nodes: readonly MenuNode[]): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    else if (n.type === 'heading') out.push(n.label)
    else {
      out.push(n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''), n.hint?.(g) ?? '', n.disabledReason?.(g) ?? '')
      if (n.type === 'menu' && n.header) out.push(n.header(g))
    }
  }
  return out
}

const isLook = (n: MenuNode): boolean => n.id.startsWith('look.') || n.id.startsWith('biz.hire.look.')
const hasChip = (n: MenuNode): boolean => n.type !== 'heading' && n.conf !== undefined

/** The ids of the Look closer rows of a screen, and how many of its rows carry a confidence chip. */
function marks(g: GameState, roots: readonly MenuNode[]): { looks: string[]; chips: number; all: MenuNode[] } {
  const all = walk(g, roots)
  return { looks: all.filter(isLook).map((n) => n.id), chips: all.filter(hasChip).length, all }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The scenes: one life per family of screens

interface Scene {
  name: string
  g: GameState
  roots: (g: GameState) => MenuNode[]
  /** Look closer ids the screen must have in Realistic (prefixes), each at least once. */
  looks: readonly string[]
  /** The screen's rows carry a confidence chip in Realistic. */
  chips: boolean
  /** A phrase of the screen that says it is an estimate (Realistic only). */
  says?: RegExp
  /** A phrase that must not appear in Exact mode (the label of an estimate). */
  notExact?: RegExp
}

const lazy = <T>(make: () => T): (() => T) => {
  let v: T | undefined
  return () => (v ??= make())
}

/** A grown-up in the US with a software company, three years in, and no talent (the fogged life). */
const marketLife = lazy((): { g: GameState; a: Asset } => {
  const g = adult(5, 2015, 'us')
  g.character.talents = []
  const a = company(g, 'software')
  for (let i = 0; i < 3; i++) nextYear(g)
  return { g, a }
})

/** A grown-up in the US with a restaurant (a company that hires), in 2026. */
const hiringLife = lazy((): { g: GameState; a: Asset } => {
  const g = adult(41, 2026, 'us')
  g.character.talents = []
  const a = company(g, 'restaurant', { cash: 5_000_000 })
  for (let i = 0; i < 2; i++) nextYear(g) // a company that has traded has a valuation to read
  return { g, a }
})

const investLife = lazy((): GameState => {
  const g = makeTestGame(3, { age: 30, countryId: 'us', money: 5_000_000 })
  g.lifeId = 'fog-acceptance-invest'
  return g
})

const SCENES: readonly (() => Scene)[] = [
  () => {
    const { g, a } = marketLife()
    return { name: 'the market screens (rivals, a rival, scenarios, the hub)', g, roots: (x) => [marketNode(x, a)!], looks: ['look.biz.mkt.look.rivals.', 'look.biz.mkt.look.rival.', 'look.biz.mkt.look.scenarios.', 'look.biz.mkt.look.hub.'], chips: true }
  },
  () => {
    const { g, a } = hiringLife()
    return { name: 'the company card and the hiring menu', g, roots: (x) => businessAssetView(x, a), looks: ['look.val.', 'biz.hire.look.'], chips: true }
  },
  () => {
    const L = chipLab({ year: 2025, patch: { done: ['firstChip', 'volume', 'aiChip'] } })
    return { name: 'the chip scorecard', g: L.g, roots: (x) => businessAssetView(x, L.a), looks: [], chips: true, says: /\(estimated\)/, notExact: /\(estimated\)/ }
  },
  () => {
    const g = investLife()
    return { name: 'investing (the bets list and a security)', g, roots: (x) => [...stockBetsMenu().children(x), ...investmentsMenu.children(x)], looks: ['look.swing.'], chips: true }
  },
  () => {
    const g = newLeader(9, 'us', 2001)
    g.character.talents = []
    return { name: 'politics', g, roots: (x) => specialJobNodes(x), looks: ['look.'], chips: false, says: /\b(unlikely|a long shot|even money|likely|very likely|almost certain|almost no chance)\b/ }
  },
]

describe('(a) every screen of the track has its chip or its Look closer row in Realistic, and none in Exact', () => {
  for (const make of SCENES) {
    const scene = make()

    it(`${scene.name}: Realistic`, () => {
      inFog(() => {
        const m = marks(scene.g, scene.roots(scene.g))
        for (const prefix of scene.looks) expect(m.looks.some((id) => id.startsWith(prefix)), `a ${prefix} row among ${m.looks.join(', ')}`).toBe(true)
        if (scene.chips) expect(m.chips, 'rows with a chip').toBeGreaterThan(0)
        if (scene.says) expect(textsOf(scene.g, m.all).some((t) => scene.says!.test(t)), `the text says ${scene.says}`).toBe(true)
      })
    })

    it(`${scene.name}: Exact`, () => {
      withInfoMode('exact', () => {
        const m = marks(scene.g, scene.roots(scene.g))
        expect(m.looks, 'Look closer rows').toEqual([])
        expect(m.chips, 'rows with a chip').toBe(0)
        if (scene.notExact) expect(textsOf(scene.g, m.all).filter((t) => scene.notExact!.test(t)), 'text that says estimated').toEqual([])
      })
    })
  }

  it('a board vote says a word in Realistic and "about N%" in Exact, and the home market has no Look closer to offer', () => {
    const { g, a } = hiringLife()
    const key = boardOddsKey(a, 'ownerPay')
    expect(withInfoMode('exact', () => oddsText(0.65, g, key))).toBe('about 65%')
    expect(oddsText(0.65)).toBe('about 65%')
    inFog(() => {
      // the word is the player's reading of the chance (an honest, fallible estimate), so it is one of the seven and never a digit
      const word = oddsText(0.65, g, key)
      expect(['almost no chance', 'a long shot', 'unlikely', 'even money', 'likely', 'very likely', 'almost certain']).toContain(word)
      expect(word).not.toMatch(/\d/)
      expect(oddsText(0.65, g, key)).toBe(word)
    })
    // a company's own industry is the player's market: its screens keep their numbers, so its leaderboard and sizes carry no chip
    inFog(() => {
      const mk = marketLife()
      const root = marketNode(mk.g, mk.a)!
      const leaderboard = walk(mk.g, [root]).filter((n) => /leader|overview|segments|history/i.test(n.id) && n.type === 'menu')
      for (const n of leaderboard) expect(walk(mk.g, [n]).filter(isLook).length, n.id).toBe(0)
    })
  })
})

describe('(b) the screens are pure: frozen, no write, no draw, no hole in the text', () => {
  for (const make of SCENES) {
    const scene = make()
    it(`${scene.name}`, () => {
      inFog(() => {
        const copy = structuredClone(scene.g)
        const json = JSON.stringify(copy)
        const rng = copy.rng
        deepFreeze(copy)
        const all = walk(copy, scene.roots(copy))
        const texts = textsOf(copy, all)
        expect(texts.length).toBeGreaterThan(10)
        // (the game still prints its older en-dashes, "2015\u20132017"; the voice guard holds the count, and each task's own test the new text)
        for (const t of texts) expect(t).not.toMatch(BAD)
        expect(JSON.stringify(copy)).toBe(json)
        expect(copy.rng).toBe(rng)
        // twice is the same text: nothing on these screens is rolled
        expect(textsOf(copy, walk(copy, scene.roots(copy)))).toEqual(texts)
      })
    })
  }
})

describe('(c) every key family of the track has an owner', () => {
  it('riv, mkt, scn, odds, sec and val are registered once the game is loaded, each with a label and a truth; cmp and cand are read in place', () => {
    // the scenes above loaded every screen of the track
    for (const make of SCENES) make()
    for (const kind of ['riv', 'mkt', 'scn', 'odds', 'sec', 'val']) {
      const def = kindOf(kind)
      expect(def, kind).not.toBeNull()
      expect(typeof def!.label, kind).toBe('function')
      expect(typeof def!.truth, kind).toBe('function')
    }
    // A scorecard row and a shortlist have no Look closer group (a scorecard is read in place, a candidate by the background check in
    // the popup), so there is nothing for an owner to sell: both keys are still read through know() with their rule rows.
    expect(kindOf('cmp')).toBeNull()
    expect(kindOf('cand')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (d) a life that hired and bought from every source still renders

/** The Look closer groups of a set of roots. */
function looksOf(g: GameState, roots: readonly MenuNode[]): Extract<MenuNode, { type: 'menu' }>[] {
  return walk(g, roots).filter((n): n is Extract<MenuNode, { type: 'menu' }> => n.type === 'menu' && n.id.startsWith('look.'))
}

const isHire = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.hire'

describe('(d) a hire and a purchase from every source, on a Business and Investing life', () => {
  const rich = lazy(() => {
    const g = adult(11, 2026, 'us')
    g.character.talents = ['Business', 'Investing']
    const a = company(g, 'restaurant', { cash: 20_000_000 })
    const s = company(g, 'software', { cash: 20_000_000 })
    for (let i = 0; i < 2; i++) nextYear(g)
    return { g, a, s }
  })

  it('interviews, checks the backgrounds, hires, and buys from every source the screens offer', () => {
    inFog(() => {
      const { g, a, s } = rich()
      // a hire: interview, the background check, then the first candidate
      const row = allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'action' && n.id.startsWith(`biz.hire.${a.id}.`) && !n.disabledReason?.(g))
      expect(row, 'an open hiring row').toBeDefined()
      if (row?.type === 'action') row.run(g)
      const popup = g.queue.filter(isHire).at(-1)
      expect(popup, 'the shortlist').toBeDefined()
      runScript(g, popup!.scriptId!, 'vet', popup!.data, popup!)
      const again = g.queue.filter(isHire).at(-1)!
      expect(again.text).not.toMatch(/not clear yet/)
      runScript(g, again.scriptId!, 'c0', again.data, again)
      g.queue = []

      // a purchase from every source: each offer of each Look closer group, in turn (a source that cannot read a screen is not offered)
      const roots = (): MenuNode[] => [...businessAssetView(g, a), ...businessAssetView(g, s), ...stockBetsMenu().children(g), ...investmentsMenu.children(g)]
      let bought = 0
      for (let pass = 0; pass < 3; pass++) {
        for (const group of looksOf(g, roots())) {
          for (const offer of group.children(g)) {
            if (offer.type !== 'action' || offer.disabledReason?.(g)) continue
            const before = readKnow(g)
            offer.run(g)
            if (JSON.stringify(readKnow(g)) !== JSON.stringify(before)) bought++
            g.queue = []
          }
        }
      }
      expect(bought, 'purchases that kept a reading').toBeGreaterThan(5)
      // a row names the sources merged into it ('report+analyst'), so the sources are read out of the names
      const sources = new Set(storedEstimates(g).flatMap((e) => String(e.src).split('+')))
      for (const src of ['press', 'report', 'analyst', 'diligence', 'investigator', 'informant', 'hacker']) {
        expect(SOURCE_IDS, src).toContain(src)
        expect([...sources], `a reading from ${src}`).toContain(src)
      }
    })
  }, 120_000)

  it('then every screen of the game builds on a deep-frozen copy, writes nothing and draws nothing', () => {
    inFog(() => {
      const { g } = rich()
      const json = JSON.stringify(g)
      const rng = g.rng
      const log = new FailureLog()
      const nodes = renderEverything(g, log)
      expect(nodes, 'enabled actions seen').toBeGreaterThan(20)
      expect(formatFailures(log)).toBe('')
      expect(JSON.stringify(g)).toBe(json)
      expect(g.rng).toBe(rng)
      const frozen = deepFreeze(structuredClone(g))
      const companies = businessAssets(frozen)
      expect(companies.length).toBeGreaterThanOrEqual(2)
      for (const c of companies) for (const t of renderCompany(frozen, c)) expect(t).not.toMatch(BAD)
      expect(JSON.stringify(frozen)).toBe(json)
    })
  }, 120_000)
})

describe('(d) a life with every track on', () => {
  it('a founder played four years the way the store plays them (the year card on, Realistic), then every screen of the game renders', () => {
    withFlags({ yearCard: true }, () => {
      inFog(() => {
        const g = adult(17, 2026, 'us')
        g.character.talents = ['Business', 'Investing']
        company(g, 'restaurant', { cash: 10_000_000 })
        company(g, 'cafe', { cash: 10_000_000 })
        const answers = 4
        const played = playLife({ seed: answers, birthYear: 1996, from: g, close: true, untilAge: g.character.age + 4 })
        expect(played.years.length, 'years played').toBeGreaterThanOrEqual(3)
        const life = played.g
        expect(life.character.alive).toBe(true)
        const json = JSON.stringify(life)
        const rng = life.rng
        const log = new FailureLog()
        expect(renderEverything(life, log), 'enabled actions seen').toBeGreaterThan(20)
        expect(formatFailures(log)).toBe('')
        expect(JSON.stringify(life)).toBe(json)
        expect(life.rng).toBe(rng)
      })
    })
  }, 300_000)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (e) three industries played in Realistic
//
// A shop, a chip company and a bank, in lives the fuzzer picks by seed (a modern year for the first two). A software company is left out only
// for the clock: the fuzzer walks every screen again after each action, and a software market has well over a hundred rival screens, so four
// years take about 170 s in Realistic against 17 s in Exact. One screen costs about 5 ms and the whole market tree about 130 ms.

describe('(e) three industries played in Realistic by the engine fuzzer', () => {
  beforeAll(() => setInfoOverride('realistic'))
  afterAll(() => setInfoOverride('exact'))

  for (const [industry, seed] of [['restaurant', 11], ['semiconductor', 5], ['bank', 3]] as const) {
    it(`${industry}: five years, every company screen walked each year, no failure`, async () => {
      const log = new FailureLog()
      const stats = await fuzzBusiness(industry, seed, log, 5)
      expect(stats.years, 'years played').toBeGreaterThanOrEqual(3)
      expect(stats.menuNodes, 'menu rows walked').toBeGreaterThan(100)
      // 'note-' kinds are for a human to read (a big windfall), not failures
      const failures = log.list().filter((x) => !x.first.kind.startsWith('note-'))
      expect(failures.map((x) => `[${x.first.kind}] ${x.first.message.slice(0, 200)}`)).toEqual([])
    }, 300_000)
  }
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (f) the mode never changes a replay

describe('(f) the mode is a presentation switch', () => {
  /** A founder with two companies, six years through the real yearly step; in Realistic every company screen is walked each year. */
  function played(mode: 'exact' | 'realistic', walkScreens: boolean): { json: string; texts: number } {
    return withInfoMode(mode, () => {
      const g = adult(13, 2012, 'us')
      g.character.talents = ['Business', 'Investing']
      const a = company(g, 'software')
      const b = company(g, 'restaurant')
      let texts = 0
      for (let i = 0; i < 6; i++) {
        nextYear(g)
        if (walkScreens) {
          for (const c of [a, b]) texts += renderCompany(g, c).length
          texts += textsOf(g, walk(g, stockBetsMenu().children(g))).length + textsOf(g, walk(g, investmentsMenu.children(g))).length
        }
      }
      return { json: JSON.stringify(g), texts }
    })
  }

  it('a life played with every screen walked in Realistic ends with the JSON of the same life played in Exact with none', () => {
    const exact = played('exact', false)
    const fog = played('realistic', true)
    expect(fog.texts, 'text the walk read').toBeGreaterThan(500)
    expect(fog.json === exact.json).toBe(true)
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (g) hints

describe('(g) the hint lens', () => {
  it('leaves a hint alone in Exact and moves the figure after "about" in Realistic, in the shape it had', () => {
    const g = makeTestGame(7, { age: 40, money: 5_000_000, talents: ['Business'] })
    const text = 'Sell now: about $412K and about 62% to clear, in about 4 years, cap $50K'
    expect(talentHint(g, 'Business', text)).toBe(`${HINT_EMOJI} ${text}`)
    inFog(() => {
      const out = talentHint(g, 'Business', text)
      expect(out.startsWith(HINT_EMOJI)).toBe(true)
      expect(out).toMatch(/Sell now: about \$\d+K and about \d+% to clear, in about \d+ years?, cap \$50K$/)
      expect(out).toContain('cap $50K')
      const pct = Number(/about (\d+)% to clear/.exec(out)![1])
      expect(pct % 5).toBe(0)
      expect(talentHint(g, 'Business', text)).toBe(out)
    })
    // a life without the talent gets no hint at all
    expect(talentHint(makeTestGame(7, { age: 40, money: 5_000_000 }), 'Business', text)).toBe('')
  })

  it('markBest marks one of the options it was given, the same one twice, and the clear winner when the gap is wide', () => {
    const g = makeTestGame(7, { age: 40, money: 5_000_000, talents: ['Business'] })
    const value: Record<string, number> = { a: 10_000, b: 4_000_000, c: 20_000 }
    const options = (): ChoiceOption[] => ['a', 'b', 'c'].map((id) => ({ id, label: `Option ${id}` }))
    const marked = (): string[] => {
      const list = markBest(g, options(), (id) => value[id] ?? null)
      return list.filter((o) => o.hint).map((o) => o.id)
    }
    expect(withInfoMode('exact', marked)).toEqual(['b'])
    inFog(() => {
      expect(marked()).toEqual(['b'])
      expect(marked()).toEqual(['b'])
    })
    // without the talent nothing is marked
    expect(markBest(makeTestGame(7, { age: 40, money: 5_000_000 }), options(), (id) => value[id] ?? null).filter((o) => o.hint)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (h) docs

/** The names a module exports through `export { a, b as c } from` and `export type { T }`, plus direct declarations. */
function exportsOf(text: string): string[] {
  const names = new Set<string>()
  for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()!.trim().replace(/^type\s+/, '')
      if (name) names.add(name)
    }
  }
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:const|let|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]!)
  return [...names].sort()
}

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

describe('(h) docs/FOG.md', () => {
  const docs = (): string => read('docs/FOG.md')

  it('has no en-dash or em-dash, and none of the files of the track carries one', () => {
    expect(docs()).not.toMatch(DASH)
    for (const f of [
      'src/game/business/market-fog.ts',
      'src/game/business/staff-fog.ts',
      'src/game/business/valuation-fog.ts',
      'src/game/invest/swing.ts',
      'src/game/invest/contract.ts',
      'src/game/fog/odds/odds.ts',
      'src/game/fog/odds/contract.ts',
      'src/game/fog/hint/lens.ts',
      'src/game/fog/hint/contract.ts',
      'src/game/nation/odds-read.ts',
    ]) expect(read(f), f).not.toMatch(DASH)
  })

  it('names every export of the doors of the track (fog/odds, fog/hint, invest)', () => {
    const text = docs()
    for (const door of ['src/game/fog/odds/contract.ts', 'src/game/fog/hint/contract.ts', 'src/game/invest/contract.ts']) {
      const names = exportsOf(read(door))
      expect(names.length, door).toBeGreaterThanOrEqual(3)
      const missing = names.filter((n) => !new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(text))
      expect(missing, `${door} names missing from the docs`).toEqual([])
    }
  })

  it('names the key families, the market rule, the owners of the screens and what is not fogged', () => {
    const text = docs()
    for (const family of ['riv:', 'mkt:', 'scn:', 'cand:', 'cmp:', 'sec:', 'val:', 'odds:', 'hint:']) expect(text, family).toContain(`\`${family}`)
    for (const word of ['knownMarket', 'sd0', 'Look closer', 'lookCloser', 'registerKeyKind', 'oddsRead', 'rankNoise', 'talents.hintLens', 'intel.risk', 'withInfoMode', 'overrideKeyKind']) expect(text, word).toContain(word)
    for (const file of ['market-fog.ts', 'staff-fog.ts', 'scorecard.ts', 'valuation-fog.ts', 'invest/swing.ts', 'fog/odds/odds.ts', 'nation/odds-read.ts', 'fog/hint/lens.ts']) expect(text, file).toContain(file)
    for (const heading of ['What is fogged', 'What is not fogged', 'The market rule', 'Keys and sd0', 'How to add a screen', 'The hazard', 'The lens rule', 'Guards']) {
      expect(text, heading).toMatch(new RegExp(`^#{1,3} ${heading}`, 'm'))
    }
  })

  it('lists what waits for R4: the Annual Report demand band, net worth, segments, the best-option optimiser', () => {
    const text = docs().toLowerCase()
    for (const left of ['Annual Report', 'net worth', 'segments', 'optimiser']) expect(text, left).toContain(left.toLowerCase())
  })

  it('is linked from the docs of the tracks it leans on', () => {
    expect(read('docs/KNOWLEDGE.md')).toContain('docs/FOG.md')
  })
})
