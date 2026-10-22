// ci: fast
// R3-H9 (H.13, decision D12, cross-check D24): the foresight fence for the Knowledge folder and the Investing gut.
//
// Nothing in the game reads a year after g.year, except the Investing talent's gut (invest/instinct.ts), and
// test/foresight-scan.test.ts holds that line for every market reader. Knowledge (src/game/knowledge/**) is new code that
// shows the player estimates of the world, so it gets its own, stricter fence: no file there may reach the market at all.
// Its truths come in as arguments (`know(g, key, truth)`), so it has no need to.
//
//   1. A knowledge file may not import invest/instinct (the gut), may not import anything from invest/ (the market engine,
//      where every watched reader lives), and may not call or import a reader named in the WATCHED block of the foresight
//      test. That key list is read from the text of test/foresight-scan.test.ts by a regex, so the two lists cannot drift.
//   2. The real tree: every file under src/game/knowledge/** passes. It is a directory listing, so it is meaningful once
//      the lane that creates the folder merges; R3-H6 asserts the scan saw files.
//   3. The gut stays behind the talent: marketInstinct is null for 60 states without the Investing talent (every age
//      band, six countries) and for the dead, non-null for an adult who has it, and the files that import it are exactly
//      the four the foresight test lists. The gut does not spread to the advisors, the competition files or the funds.
//
// Limits, on purpose: the scan knows names and import paths, not types. A reader reached through a wrapper in a file that
// is not under invest/ would not be seen here; the runtime spy of the foresight test and the acceptance spy of R3-H6 are the
// second line for that.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { marketInstinct } from '../src/game/invest/instinct'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'
import { K_ID, K_STR, ROOT, isId, isPunct, lineOf, loadSources, toSource, type SourceFile } from './scan-kit'

// ---------------------------------------------------------------------------
// The lists, read from the foresight test

const FORESIGHT_PATH = 'test/foresight-scan.test.ts'
const foresightText = (): string => readFileSync(join(ROOT, FORESIGHT_PATH), 'utf8')

/** The reader names of `const WATCHED = { exchangeYear: 3, ... }` in the foresight test, with their year slots. */
function watchedFrom(text: string): Map<string, number> {
  const block = /const WATCHED\b[^=]*=\s*\{([^}]*)\}/.exec(text)
  const out = new Map<string, number>()
  if (!block) return out
  for (const m of block[1]!.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*(\d+)/g)) out.set(m[1]!, Number(m[2]))
  return out
}

/** The four files of `const INSTINCT_IMPORTERS = [...]` in the foresight test. */
function importersFrom(text: string): string[] {
  const block = /const INSTINCT_IMPORTERS\b[^=]*=\s*\[([^\]]*)\]/.exec(text)
  return block ? [...block[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!) : []
}

// ---------------------------------------------------------------------------
// The scan

const GUT = 'src/game/invest/instinct'
const INVEST_DIR = 'src/game/invest'
const KNOWLEDGE_DIR = 'src/game/knowledge/'

type Rule = 'gut' | 'invest' | 'reader'

interface Hit {
  file: string
  line: number
  rule: Rule
  text: string
}

const GUT_MESSAGE = 'knowledge never looks ahead: the Investing gut (invest/instinct.ts) stays behind its talent and out of this folder'
const INVEST_MESSAGE = 'knowledge takes its truths as arguments: it imports nothing from invest/ (the market engine and its year readers)'

const describeAll = (hits: readonly Hit[]): string[] => hits.map((h) => `${h.file}:${h.line} [${h.rule}] ${h.text}`)

/** The module a string token names when it follows `from`, `import`, `import(` or `require(`. */
function specifiers(src: SourceFile): { spec: string; at: number }[] {
  const out: { spec: string; at: number }[] = []
  src.toks.forEach((t, i) => {
    if (t.k !== K_STR || t.attr) return
    const p = src.toks[i - 1]
    const viaCall = isPunct(p, '(') && (isId(src.toks[i - 2], 'import') || isId(src.toks[i - 2], 'require'))
    if (isId(p, 'from') || isId(p, 'import') || viaCall) out.push({ spec: t.v, at: t.p })
  })
  return out
}

/** Repo-relative module path (no extension) that a relative specifier in `from` points at; null for a package. */
function resolveModule(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const dirs = from.split('/').slice(0, -1)
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') dirs.pop()
    else dirs.push(part)
  }
  return dirs.join('/').replace(/\.(?:tsx?|mjs|js)$/, '')
}

/** The names inside `import { a, b as c } from`, `import x, { a } from` and `export { a } from` / `export type { a }`. */
function importedNames(src: SourceFile): { name: string; at: number }[] {
  const out: { name: string; at: number }[] = []
  const { toks } = src
  for (let i = 0; i < toks.length; i++) {
    const isImport = isId(toks[i], 'import')
    if (!isImport && !isId(toks[i], 'export')) continue
    let j = i + 1
    if (isId(toks[j], 'type')) j++
    if (isImport && toks[j]?.k === K_ID && isPunct(toks[j + 1], ',')) {
      out.push({ name: toks[j]!.v, at: toks[j]!.p })
      j += 2
    }
    if (!isPunct(toks[j], '{')) continue
    for (j++; j < toks.length && !isPunct(toks[j], '}'); j++) {
      const t = toks[j]!
      if (t.k === K_ID && t.v !== 'type' && t.v !== 'as') out.push({ name: t.v, at: t.p })
    }
  }
  return out
}

const underInvest = (to: string): boolean => to === INVEST_DIR || to.startsWith(`${INVEST_DIR}/`)

/**
 * Every way a source reaches the market: an import of the gut, an import of anything under invest/, a call of a watched
 * reader (a declaration `function name(` is not a call), or an import of a watched reader's name.
 */
function fenceHits(sources: readonly SourceFile[], watched: ReadonlySet<string>): Hit[] {
  const out: Hit[] = []
  for (const src of sources) {
    for (const x of specifiers(src)) {
      const to = resolveModule(src.path, x.spec)
      if (to === null) continue
      const line = lineOf(src.text, x.at)
      if (to === GUT) out.push({ file: src.path, line, rule: 'gut', text: GUT_MESSAGE })
      else if (underInvest(to)) out.push({ file: src.path, line, rule: 'invest', text: INVEST_MESSAGE })
    }
    for (const n of importedNames(src)) {
      if (watched.has(n.name)) out.push({ file: src.path, line: lineOf(src.text, n.at), rule: 'reader', text: `${n.name} is imported` })
    }
    const { toks } = src
    for (let i = 0; i + 1 < toks.length; i++) {
      const t = toks[i]!
      if (t.k !== K_ID || !watched.has(t.v) || !isPunct(toks[i + 1], '(') || isId(toks[i - 1], 'function')) continue
      out.push({ file: src.path, line: lineOf(src.text, t.p), rule: 'reader', text: `${t.v} is called` })
    }
  }
  return out
}

/** The sources the fence guards: everything under src/game/knowledge/. */
const knowledgeSources = (sources: readonly SourceFile[]): SourceFile[] => sources.filter((s) => s.path.startsWith(KNOWLEDGE_DIR))

// ---------------------------------------------------------------------------
// The tests

const WATCHED = watchedFrom(foresightText())
const NAMES: ReadonlySet<string> = new Set(WATCHED.keys())

const inKnowledge = (code: string, path = 'src/game/knowledge/x.ts'): Hit[] => fenceHits([toSource(path, code)], NAMES)
const rulesOf = (code: string, path?: string): Rule[] => [...new Set(inKnowledge(code, path).map((h) => h.rule))].sort()

let realSources: SourceFile[] | null = null
const real = (): SourceFile[] => (realSources ??= loadSources())

describe('knowledge fence: the lists are the foresight test\'s own', () => {
  it('reads the watched readers and their year slots from the text of the foresight test', () => {
    expect(NAMES.size).toBeGreaterThanOrEqual(21)
    for (const name of ['exchangeYear', 'cryptoYear', 'goldYear', 'fxYear', 'indexMove', 'inflationRate', 'bondRate', 'reitYield']) expect(NAMES.has(name), name).toBe(true)
    expect(WATCHED.get('exchangeYear')).toBe(3)
    expect(WATCHED.get('goldYear')).toBe(2)
    expect(WATCHED.get('worldYear')).toBe(1)
  })

  it('reads a block of the same shape the same way, and nothing from a text without one', () => {
    const text = 'const WATCHED: Readonly<Record<string, number>> = {\n  aYear: 3,\n  bYear: 0,\n}\nconst OTHER = { cYear: 9 }'
    expect([...watchedFrom(text)]).toEqual([['aYear', 3], ['bYear', 0]])
    expect(watchedFrom('const NOTHING = { aYear: 3 }').size).toBe(0)
    expect(importersFrom("const INSTINCT_IMPORTERS: readonly string[] = [\n  'a.ts',\n  'b/c.ts',\n]")).toEqual(['a.ts', 'b/c.ts'])
    expect(importersFrom('const NOTHING = []')).toEqual([])
  })

  it('names readers that exist: each one is declared once in src/game/invest/engine.ts', () => {
    const engine = real().find((s) => s.path === 'src/game/invest/engine.ts')!
    expect(engine).toBeDefined()
    for (const name of NAMES) {
      const declared = engine.toks.filter((t, i) => isId(t, name) && isId(engine.toks[i - 1], 'function') && isPunct(engine.toks[i + 1], '(')).length
      expect(declared, `${name} is declared once in the market engine`).toBe(1)
    }
  })
})

describe('knowledge fence: the detector', () => {
  it('flags a knowledge file that imports the Investing gut, in every way to import', () => {
    for (const code of [
      "import { marketInstinct } from '../invest/instinct'",
      "import type { Instinct } from '../invest/instinct'",
      "import { marketInstinct } from '../invest/instinct.ts'",
      "export { marketInstinct } from '../invest/instinct'",
      "export * from '../invest/instinct'",
      "import '../invest/instinct'",
      "const m = await import('../invest/instinct')",
      "import { marketInstinct } from '../../game/invest/instinct'",
    ]) {
      expect(rulesOf(code), code).toEqual(['gut'])
    }
  })

  it('reports the gut import with its file, line and reason', () => {
    const hits = inKnowledge("import { a } from '../core'\n\nimport { marketInstinct } from '../invest/instinct'", 'src/game/knowledge/estimate.ts')
    expect(hits).toEqual([{ file: 'src/game/knowledge/estimate.ts', line: 3, rule: 'gut', text: GUT_MESSAGE }])
  })

  it('flags an import of anything else under invest/', () => {
    for (const mod of ['engine', 'era', 'funds', 'shocks', 'real', 'clock', 'liquidity', 'stocks-data']) {
      expect(rulesOf(`import { x } from '../invest/${mod}'`), mod).toEqual(['invest'])
    }
    expect(rulesOf("import type { ExInfo } from '../invest/engine'")).toEqual(['invest'])
    expect(rulesOf("import * as engine from '../invest/engine'")).toEqual(['invest'])
    expect(rulesOf("const e = await import('../invest/engine')")).toEqual(['invest'])
    expect(rulesOf("import { x } from '../../game/invest/era'")).toEqual(['invest'])
    // From a nested folder of knowledge the path changes, the target does not.
    expect(rulesOf("import { x } from '../../invest/engine'", 'src/game/knowledge/kinds/market.ts')).toEqual(['invest'])
  })

  it('flags a call of every watched reader, in any argument shape', () => {
    expect(NAMES.size).toBeGreaterThan(0)
    for (const name of NAMES) {
      expect(rulesOf(`const x = ${name}(f, a, g.year)`), name).toEqual(['reader'])
      expect(rulesOf(`const x = ${name}(f, a, i, y - 1)`), name).toEqual(['reader'])
      expect(rulesOf(`const x = ${name}(f, a, i, y + 1)`), name).toEqual(['reader'])
      expect(rulesOf(`const x = engine.${name}(f, a, i, y)`), name).toEqual(['reader'])
    }
  })

  it('flags an import of a watched reader by name, even through a rename or from another path', () => {
    expect(rulesOf("import { exchangeYear } from '../invest/engine'")).toEqual(['invest', 'reader'])
    expect(rulesOf("import { goldYear as gy } from '../elsewhere'")).toEqual(['reader'])
    expect(rulesOf("import { type ExInfo, indexMove } from '../elsewhere'")).toEqual(['reader'])
    expect(rulesOf("import world, { bondRate } from '../elsewhere'")).toEqual(['reader'])
    expect(rulesOf("export { reitYield } from '../elsewhere'")).toEqual(['reader'])
    expect(rulesOf("export type { fundFee } from '../elsewhere'")).toEqual(['reader'])
  })

  it('lets a clean knowledge source through: the kernel, the core, the world, a sibling, a package', () => {
    const clean = [
      "import { streamKey, streamUnit } from '../kernel/streams'",
      "import { hasTalent, hasMainCharacter } from '../talents'",
      "import { spend, log, notice, shortMoney } from '../core'",
      "import { getCountry } from '../world'",
      "import { pickLine } from '../text/pick'",
      "import type { GameState } from '../types'",
      "import { estimate } from './estimate'",
      "import { z } from 'zod'",
      "import { readKnow } from '../knowledge/record'",
      'export function know(g: GameState, key: string, truth: number) { return truth + g.year }',
      'const wealth = getCountry(id).wealth * Math.min(g.year, last)',
    ]
    for (const code of clean) expect(inKnowledge(code), code).toEqual([])
  })

  it('lets through a neighbour whose name only looks like the market folder', () => {
    expect(inKnowledge("import { a } from '../invest-notes'")).toEqual([])
    expect(inKnowledge("import { a } from '../investments-log'")).toEqual([])
    expect(inKnowledge("import { a } from './invest'")).toEqual([])
    expect(inKnowledge("import { a } from './instinct'")).toEqual([])
    expect(inKnowledge("import { a } from 'invest/engine'")).toEqual([])
  })

  it('does not count a declaration, a mention in a comment or a string, or a name that only starts the same', () => {
    expect(inKnowledge('export function fundFee(year: number) { return year }')).toEqual([])
    expect(inKnowledge('// exchangeYear(f, a, i, g.year)')).toEqual([])
    expect(inKnowledge('/* import { marketInstinct } from "../invest/instinct" */')).toEqual([])
    expect(inKnowledge("const s = 'goldYear(f, a, y)'")).toEqual([])
    expect(inKnowledge('const s = `import { x } from "../invest/engine"`')).toEqual([])
    expect(inKnowledge("const s = \"from '../invest/engine'\"")).toEqual([])
    expect(inKnowledge('const x = exchangeYear2(f, a, i, y)')).toEqual([])
    expect(inKnowledge('const x = myBondRate(a, b)')).toEqual([])
    expect(inKnowledge('const x = { bondRate: 0.04 }')).toEqual([])
  })

  it('guards the folder and nothing else: the selection is by path', () => {
    const files = ['src/game/knowledge/a.ts', 'src/game/knowledge/deep/b.ts', 'src/game/knowledgebase/c.ts', 'src/game/business/d.ts', 'src/ui/knowledge/e.tsx', 'src/game/invest/engine.ts'].map((p) => toSource(p, ''))
    expect(knowledgeSources(files).map((s) => s.path)).toEqual(['src/game/knowledge/a.ts', 'src/game/knowledge/deep/b.ts'])
  })

  it('sees the market in the rest of the tree when pointed at it: the four importers, and a good many reader calls', () => {
    const all = fenceHits(real().filter((s) => !s.path.startsWith(KNOWLEDGE_DIR)), NAMES)
    const gut = [...new Set(all.filter((h) => h.rule === 'gut').map((h) => h.file))].sort()
    expect(gut).toEqual([...importersFrom(foresightText())].sort())
    expect(all.filter((h) => h.rule === 'reader').length).toBeGreaterThan(30)
    expect(all.filter((h) => h.rule === 'invest').length).toBeGreaterThan(10)
    // The Investments menu is what the fence keeps out of knowledge: it is flagged when read as one.
    expect(all.some((h) => h.file === 'src/game/investments.ts' && h.rule === 'gut')).toBe(true)
  })
})

describe('knowledge fence: the real tree', () => {
  it('has no file under src/game/knowledge/** that reaches the market', () => {
    const guarded = knowledgeSources(real())
    expect(describeAll(fenceHits(guarded, NAMES))).toEqual([])
    // The listing is live: every path it holds is under the folder and in the tree.
    for (const s of guarded) expect(s.path.startsWith(KNOWLEDGE_DIR), s.path).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The gut stays behind the talent

const ADULT_AGES = [18, 25, 33, 45, 58, 70] as const
const AGES = [0, 4, 10, 17, 25, 38, 52, 66, 78, 90] as const
const COUNTRIES = ['us', 'gb', 'jp', 'de', 'br', 'ng'] as const
/** What a character without the Investing talent may hold: nothing, or other talents (never Main Character, which has all of them). */
const OTHER_TALENTS: readonly (string[] | undefined)[] = [undefined, ['Business'], ['Acting', 'Modeling']]

let lifeNo = 0
function stateOf(age: number, countryId: string, over: { talents?: string[]; alive?: boolean }): GameState {
  const g = makeTestGame(7 + lifeNo, { age, countryId, money: 2_000_000, alive: over.alive ?? true, ...(over.talents ? { talents: over.talents } : {}) })
  // marketInstinct caches by life and year, so every state is its own life.
  g.lifeId = `knowledge-fence-${countryId}-${age}-${lifeNo++}`
  return g
}

describe('knowledge fence: the Investing gut stays behind the talent', () => {
  it('is null for 60 states without the talent: ten ages by six countries, with other talents or none', () => {
    let n = 0
    for (const age of AGES) {
      for (const countryId of COUNTRIES) {
        const talents = OTHER_TALENTS[n % OTHER_TALENTS.length]
        const g = stateOf(age, countryId, { ...(talents ? { talents } : {}) })
        expect(marketInstinct(g), `${countryId} at ${age}, talents ${JSON.stringify(talents ?? [])}`).toBeNull()
        n++
      }
    }
    expect(n).toBe(60)
  })

  it('is null for the dead, with the talent or without it: 60 states each', () => {
    let n = 0
    for (const age of AGES) {
      for (const countryId of COUNTRIES) {
        expect(marketInstinct(stateOf(age, countryId, { alive: false, talents: ['Investing'] })), `dead ${countryId} at ${age}, Investing`).toBeNull()
        expect(marketInstinct(stateOf(age, countryId, { alive: false })), `dead ${countryId} at ${age}, no talent`).toBeNull()
        n++
      }
    }
    expect(n).toBe(60)
  })

  it('is non-null for a living adult who has the Investing talent, in each of the six countries', () => {
    for (const countryId of COUNTRIES) {
      for (const age of ADULT_AGES) {
        const inst = marketInstinct(stateOf(age, countryId, { talents: ['Investing'] }))
        expect(inst, `${countryId} at ${age}: the gut is shut for an adult with the talent`).not.toBeNull()
        expect(inst!.year, 'the gut is about next year, and only the gut').toBe(2027)
      }
    }
  })

  it('shuts again the moment the talent goes, even when the gut already answered for this life and year', () => {
    const g = stateOf(40, 'us', { talents: ['Investing'] })
    expect(marketInstinct(g)).not.toBeNull()
    g.character.talents = []
    expect(marketInstinct(g)).toBeNull()
    g.character.talents = ['Investing']
    expect(marketInstinct(g)).not.toBeNull()
    g.character.alive = false
    expect(marketInstinct(g)).toBeNull()
  })

  it('opens for Main Character Syndrome, which has every talent, and for no other reason', () => {
    expect(marketInstinct(stateOf(40, 'us', { talents: ['MainCharacter'] }))).not.toBeNull()
    expect(marketInstinct(stateOf(40, 'us', { talents: ['Business', 'Acting', 'Modeling'] }))).toBeNull()
  })
})

describe('knowledge fence: the files that import the gut', () => {
  /** The files among `sources` that import invest/instinct, sorted. */
  const importersOf = (sources: readonly SourceFile[]): string[] =>
    sources
      .filter((s) => specifiers(s).some((x) => resolveModule(s.path, x.spec) === GUT))
      .map((s) => s.path)
      .sort()

  // fund-events.ts is one of the four (it reads the gut for a fund manager's market call), so the plan's wording
  // "no business/fund-*.ts" cannot be literal: the rest of the fund and competition files are the fence.
  const GRANDFATHERED = ['src/game/business/fund-events.ts']

  /** The importers that sit where the gut must not spread: the advisors, the competition files and the other fund files. */
  const spreadOf = (paths: readonly string[]): string[] =>
    paths.filter((p) => !GRANDFATHERED.includes(p) && (p.startsWith('src/game/advisors/') || /^src\/game\/business\/(?:fund|competition)-[^/]+\.ts$/.test(p)))

  it('are exactly the four of the foresight test, read from its text', () => {
    const listed = importersFrom(foresightText())
    expect(listed).toHaveLength(4)
    expect(importersOf(real())).toEqual([...listed].sort())
  })

  it('are none of the advisors, the competition files or the funds, bar the one fund file that already held the gut', () => {
    expect(importersFrom(foresightText())).toEqual(expect.arrayContaining(GRANDFATHERED))
    expect(spreadOf(importersOf(real()))).toEqual([])
  })

  it('would catch a fifth importer in each of those places', () => {
    const gut = "import { marketInstinct } from '../invest/instinct'"
    const places = ['src/game/advisors/menu.ts', 'src/game/advisors/review.ts', 'src/game/business/competition-menu.ts', 'src/game/business/fund-menu.ts', 'src/game/business/fund-vc.ts']
    for (const path of places) {
      const withFifth = [...real(), toSource(path, gut)]
      expect(importersOf(withFifth), path).toContain(path)
      expect(importersOf(withFifth), path).not.toEqual([...importersFrom(foresightText())].sort())
      expect(spreadOf(importersOf(withFifth)), path).toEqual([path])
    }
    // The grandfathered file is not a fifth: it is one of the four.
    expect(spreadOf(importersOf(real()))).toEqual([])
    // A fifth importer anywhere else breaks the four, though it is not one of the three places.
    const fifth = toSource('src/game/menus.ts', "import { marketInstinct } from './invest/instinct'")
    expect(importersOf([...real(), fifth])).toHaveLength(5)
  })
})
