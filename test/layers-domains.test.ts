// ci: fast
// R2-K4 (K.2a b): domain contracts and eager reads, on the layer table of R2-K3 (test/layer-kit.ts).
//
// Rule (c): a domain (a directory of src/game, or the root files that belong to none) reaches another domain only through that
// domain's contract.ts. Today's cross-domain imports are the ceiling, kept per pair of domains in test/layers-baseline.json: a
// new pair, a higher count and a count that fell without the baseline following all fail.
//
// Rule (d): a module-level `const X = importedValue` runs while the module loads. When the file sits in an import cycle, the
// import may still be undefined at that moment (a load-order crash). Today's reads are the ceiling, kept per file, and the ones
// in a cycle (the real hazard) have their own ceiling below.
//
// The rules that must fail on a violation run on small synthetic graphs and token fixtures. The real src runs once, through the
// R1 graph (test/arch-kit.ts) and the lexer (test/scan-kit.ts).
//
// To shrink the baseline after a count fell or a read went away (one command updates every section; it only ever shrinks, and
// the first run writes the two sections that don't exist yet):
//   UPDATE_LAYER_BASELINE=1 npx vitest run --maxWorkers=1 test/layers.test.ts test/layers-domains.test.ts
// For the day a track built beside this one merges in, UPDATE_LAYER_BASELINE=rebase accepts growth once and prints each entry
// it added (see test/layers.test.ts).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readImportGraph, type Graph } from './arch-kit'
import {
  compareDomains,
  compareEager,
  contractPath,
  domainEdges,
  domainOf,
  domainPairs,
  eagerReads,
  gameDirs,
  layerOf,
  rebaseLayers,
  seedSections,
  shrinkLayers,
  type EagerRead,
  type LayerBaseline,
  type LayerViolation,
} from './layer-kit'
import { loadSources, toSource } from './scan-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE_PATH = join(ROOT, 'test', 'layers-baseline.json')
const EMPTY: LayerBaseline = { v: 1, upward: [], cycleDirEdges: [] }

/**
 * The most eager reads that may sit in files that are part of an import cycle. The plan measured 25 on v4.1.1 with a scan that
 * skipped the body of a function that is called at once; this scan reads that body, which adds one real hazard
 * (business/tech-waves.ts RIVAL_KINDS reads WAVE_KINDS while the module loads), so today's count is 26. A cut that takes a file
 * out of its cycle lowers the count; lower this number with it.
 */
const HAZARD_CEILING = 26

/** A graph from a plain object: module -> modules it imports. */
function graphOf(edges: Record<string, string[]>): Graph {
  return new Map(Object.entries(edges))
}

function readBaseline(): LayerBaseline {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as LayerBaseline
}

function writeBaseline(b: LayerBaseline): void {
  writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + '\n')
}

let realInputs: Promise<{ g: Graph; reads: EagerRead[] }> | null = null
/** One graph and one scan for the whole file: the bundle and the lexer are the slow part (a second or two between them). */
function realOnce(): Promise<{ g: Graph; reads: EagerRead[] }> {
  realInputs ??= readImportGraph(ROOT).then((g) => ({ g, reads: eagerReads(loadSources(ROOT, 'src'), g) }))
  return realInputs
}

/** Failure text for the real ratchet: the kind, the first entries, a few of the imports behind a domain pair, and what to do. */
function explain(g: Graph, violations: readonly LayerViolation[]): string[] {
  return violations.map((v) => {
    const shown = v.edges.slice(0, 8).join('; ') + (v.edges.length > 8 ? ` and ${v.edges.length - 8} more` : '')
    const lines = [`${v.kind}: ${shown}`]
    if (v.kind === 'new-domain-pair' || v.kind === 'more-domain-imports') {
      for (const e of v.edges.slice(0, 3)) {
        const pair = e.slice(0, e.indexOf(' '))
        lines.push(`  ${pair}: ${domainEdges(g, pair).slice(0, 4).join('; ')}`)
      }
    }
    lines.push(`  ${v.hint}`)
    return lines.join('\n')
  })
}

describe('domainOf', () => {
  const dirs = new Set(['business', 'computer', 'special', 'nation', 'data', 'kernel'])

  it('names the directory under src/game, and for a root file the hub it belongs to', () => {
    expect(domainOf('src/game/business/manage.ts', dirs)).toBe('business')
    expect(domainOf('src/game/business/deep/x.ts', dirs)).toBe('business')
    expect(domainOf('src/game/computer.ts', dirs)).toBe('computer') // the computer/ folder exists, so this is its hub
    expect(domainOf('src/game/special.ts', dirs)).toBe('special')
    expect(domainOf('src/game/nation/laws.ts', dirs)).toBe('nation')
  })

  it('puts a root file with no folder of its name in life', () => {
    expect(domainOf('src/game/crime.ts', dirs)).toBe('life')
    expect(domainOf('src/game/careers.ts', dirs)).toBe('life')
    expect(domainOf('src/game/effects.ts', dirs)).toBe('life')
  })

  it('is null for every module that is not in layer 3', () => {
    expect(domainOf('src/game/aging.ts', dirs)).toBeNull() // L4
    expect(domainOf('src/game/data/markets.ts', dirs)).toBeNull() // L1
    expect(domainOf('src/game/kernel/registry.ts', dirs)).toBeNull() // L0
    expect(domainOf('src/game/nation/state.ts', dirs)).toBeNull() // L2, though nation/ is a domain
    expect(domainOf('src/game/economy/index.ts', dirs)).toBeNull()
    expect(domainOf('src/ui/store.ts', dirs)).toBeNull() // L5
  })

  it('gameDirs lists the directories that hold a module of src/game', () => {
    const g = graphOf({
      'src/game/business/a.ts': [],
      'src/game/business/deep/b.ts': [],
      'src/game/computer.ts': [],
      'src/game/computer/c.ts': [],
      'src/game/crime.ts': [],
      'src/ui/x.ts': [],
      'src/other/y.ts': [],
    })
    expect([...gameDirs(g)].sort()).toEqual(['business', 'computer'])
  })
})

describe('contractPath', () => {
  it('matches a file named contract.ts or contract.tsx, at any depth', () => {
    expect(contractPath('src/game/business/contract.ts')).toBe(true)
    expect(contractPath('src/game/contract.ts')).toBe(true)
    expect(contractPath('contract.tsx')).toBe(true)
  })

  it('does not match a name that only ends or starts like it', () => {
    expect(contractPath('src/game/business/mycontract.ts')).toBe(false)
    expect(contractPath('src/game/business/contracts.ts')).toBe(false)
    expect(contractPath('src/game/business/contract-kit.ts')).toBe(false)
    expect(contractPath('src/game/business/contract.test.ts')).toBe(false)
    expect(contractPath('src/game/contract/x.ts')).toBe(false)
  })
})

describe('domainPairs (rule c) on synthetic graphs', () => {
  const AX = 'src/game/a/x.ts'
  const AZ = 'src/game/a/z.ts'
  const BY = 'src/game/b/y.ts'
  const BW = 'src/game/b/w.ts'

  it('counts each import that crosses from one domain to another, by pair', () => {
    expect(domainPairs(graphOf({ [AX]: [BY, BW], [AZ]: [BY], [BY]: [], [BW]: [] }))).toEqual({ 'a->b': 3 })
  })

  it('keeps the two directions apart and sorts the pairs', () => {
    const pairs = domainPairs(graphOf({ [BY]: [AX], [AX]: [BY], 'src/game/c/q.ts': [AX], [AZ]: [] }))
    expect(pairs).toEqual({ 'a->b': 1, 'b->a': 1, 'c->a': 1 })
    expect(Object.keys(pairs)).toEqual(['a->b', 'b->a', 'c->a'])
  })

  it('does not count an import inside one domain', () => {
    expect(domainPairs(graphOf({ [AX]: [AZ], [AZ]: [] }))).toEqual({})
  })

  it('does not count an import of a contract file', () => {
    const C = 'src/game/b/contract.ts'
    expect(domainPairs(graphOf({ [AX]: [C, BY], [C]: [], [BY]: [] }))).toEqual({ 'a->b': 1 })
  })

  it('never counts an import into layer 0, 1 or 2, or an import from layer 4 or 5', () => {
    const g = graphOf({
      [AX]: ['src/game/core.ts', 'src/game/data/markets.ts', 'src/game/economy/index.ts', 'src/game/world/state.ts'],
      'src/game/aging.ts': [AX, BY],
      'src/ui/store.ts': [AX, BY],
      'src/game/modules/index.ts': [AX],
      'src/game/core.ts': [],
      'src/game/data/markets.ts': [],
      'src/game/economy/index.ts': [],
      'src/game/world/state.ts': [],
      [BY]: [],
    })
    expect(domainPairs(g)).toEqual({})
  })

  it('treats the root files with no folder as one domain, life, and a hub file as its folder', () => {
    const g = graphOf({
      'src/game/crime.ts': [BY, 'src/game/careers.ts'],
      'src/game/careers.ts': [],
      'src/game/b.ts': [BY],
      [BY]: [],
    })
    expect(domainPairs(g)).toEqual({ 'life->b': 1 }) // b.ts is the hub of b/, so its own import is inside the domain
  })

  it('does not change the graph it reads', () => {
    const g = graphOf({ [AX]: [BY], [BY]: [] })
    const before = JSON.stringify([...g])
    domainPairs(g)
    expect(JSON.stringify([...g])).toBe(before)
  })

  it('domainEdges lists the imports behind one pair, sorted', () => {
    const g = graphOf({ [AZ]: [BY], [AX]: [BY, BW], [BY]: [], [BW]: [] })
    expect(domainEdges(g, 'a->b')).toEqual([`${AX} -> ${BW}`, `${AX} -> ${BY}`, `${AZ} -> ${BY}`])
    expect(domainEdges(g, 'b->a')).toEqual([])
  })
})

describe('compareDomains: a synthetic violation fails (rule c)', () => {
  const AX = 'src/game/a/x.ts'
  const BY = 'src/game/b/y.ts'
  const BW = 'src/game/b/w.ts'
  const one = graphOf({ [AX]: [BY], [BY]: [], [BW]: [] })

  it('an import between two domains that the baseline does not list is a new-domain-pair, with a hint', () => {
    const v = compareDomains(one, {})
    expect(v.map((x) => x.kind)).toEqual(['new-domain-pair'])
    expect(v[0]!.edges).toEqual(['a->b (1 import)'])
    expect(v[0]!.hint).toContain('contract.ts')
  })

  it('the same import into a contract file is not counted', () => {
    const C = 'src/game/b/contract.ts'
    expect(compareDomains(graphOf({ [AX]: [C], [C]: [] }), {})).toEqual([])
  })

  it('a baseline that lists the pair at its count passes', () => {
    expect(compareDomains(one, { 'a->b': 1 })).toEqual([])
  })

  it('a count above the baseline is more-domain-imports', () => {
    const two = graphOf({ [AX]: [BY, BW], [BY]: [], [BW]: [] })
    const v = compareDomains(two, { 'a->b': 1 })
    expect(v.map((x) => x.kind)).toEqual(['more-domain-imports'])
    expect(v[0]!.edges).toEqual(['a->b (baseline 1, now 2)'])
  })

  it('a count below the baseline is stale-domain-pair: the list may only shrink, and the hint names the update command', () => {
    const v = compareDomains(one, { 'a->b': 3 })
    expect(v.map((x) => x.kind)).toEqual(['stale-domain-pair'])
    expect(v[0]!.edges).toEqual(['a->b (baseline 3, now 1)'])
    expect(v[0]!.hint).toContain('UPDATE_LAYER_BASELINE=1')
    expect(v[0]!.hint).toContain('test/layers-baseline.json')
  })

  it('a pair that is gone is stale too (its count is 0)', () => {
    const v = compareDomains(graphOf({ [AX]: [], [BY]: [] }), { 'a->b': 2 })
    expect(v.map((x) => x.kind)).toEqual(['stale-domain-pair'])
    expect(v[0]!.edges).toEqual(['a->b (baseline 2, now 0)'])
  })

  it('reports new pairs, higher counts and stale pairs together, in that order', () => {
    const g = graphOf({ [AX]: [BY, BW], 'src/game/c/q.ts': [AX], [BY]: [], [BW]: [] })
    const v = compareDomains(g, { 'a->b': 1, 'z->y': 4 })
    expect(v.map((x) => x.kind)).toEqual(['new-domain-pair', 'more-domain-imports', 'stale-domain-pair'])
  })
})

describe('eagerReads (rule d): token fixtures', () => {
  const T = 'src/game/business/t.ts' // layer 3
  const DEP = 'src/game/business/dep.ts' // layer 3
  const HEAD = "import { IMPORTED, IMPORTED_FN, A, B } from './dep'\n"

  interface Opts {
    path?: string
    dep?: string
    head?: string
    cycle?: boolean
  }

  /** The scan of one fixture: a file that imports one module (and, when `cycle`, is imported back by it). */
  function scan(body: string, o: Opts = {}): EagerRead | undefined {
    const path = o.path ?? T
    const dep = o.dep ?? DEP
    const g = graphOf({ [path]: [dep], [dep]: o.cycle ? [path] : [] })
    return eagerReads([toSource(path, (o.head ?? HEAD) + body)], g)[0]
  }

  const flagged = (body: string, names: string[] = ['X'], o: Opts = {}): void => {
    expect(scan(body, o)?.names, body).toEqual(names)
  }
  const clean = (body: string, o: Opts = {}): void => {
    expect(scan(body, o), body).toBeUndefined()
  }

  describe('flagged', () => {
    it('a bare read, an array, an object value, a call', () => {
      flagged('const X = IMPORTED')
      flagged('const X = [A, B]')
      flagged('const X = { k: IMPORTED }')
      flagged('export const X = IMPORTED_FN()')
      flagged('const X = make(IMPORTED)')
      flagged('const X = new Map([[A, 1]])')
      flagged('const X = IMPORTED.k')
    })

    it('let and var count as well', () => {
      flagged('let X = IMPORTED')
      flagged('var X = IMPORTED')
    })

    it('a spread, a computed key and a shorthand property', () => {
      flagged('const X = { ...IMPORTED, k: 1 }')
      flagged('const X = { [IMPORTED]: 1 }')
      flagged('const X = { IMPORTED }')
      flagged('const X = [...IMPORTED]')
    })

    it('a template hole, a ternary branch', () => {
      flagged('const X = `a${IMPORTED}b`')
      flagged('const X = c ? IMPORTED : 1')
      flagged('const X = c ? 1 : IMPORTED')
    })

    it('a type annotation does not hide the read, and a destructuring names what it binds', () => {
      flagged('export const X: Record<string, number> = { a: IMPORTED }')
      flagged('const { a, b } = IMPORTED', ['a', 'b'])
      flagged('const [p, q] = IMPORTED', ['p', 'q'])
      flagged('const { a: renamed, b = 1, ...rest } = IMPORTED', ['b', 'renamed', 'rest'])
    })

    it('a multi-line initializer', () => {
      flagged("const X = [\n  'a',\n  'b',\n  IMPORTED,\n]")
      flagged('const X = {\n  a: 1,\n  b: {\n    c: IMPORTED,\n  },\n}')
      flagged('const X =\n  IMPORTED')
      flagged('const X = foo\n  .bar(IMPORTED)')
      flagged('const X = c\n  ? IMPORTED\n  : 1')
      flagged("const X = 'a' +\n  IMPORTED")
      flagged('const X = [1]\n  .concat(A)')
    })

    it('two consecutive consts with no semicolon: each is judged on its own', () => {
      flagged('const Y = 1\nconst X = IMPORTED')
      flagged('const X = IMPORTED\nconst Y = 1')
      flagged('const Y = 1\nconst Z = 2\nconst X = IMPORTED')
      flagged('const X = 1; const Y = IMPORTED', ['Y'])
      flagged('const X = [A]\nconst Y = [B]', ['X', 'Y'])
    })

    it('a statement does not swallow the next one when it ends in an operand', () => {
      flagged("const X = ['a'] as const\nconst Y = IMPORTED", ['Y'])
      flagged('const X = y as Record<string, number>\nconst Y = IMPORTED', ['Y'])
      flagged('const X = new Map<string, number>()\nconst Y = IMPORTED', ['Y'])
      flagged('let X: number\nconst Y = IMPORTED', ['Y'])
      flagged('const X = f(1)\n;[1, 2].forEach(g)\nconst Y = IMPORTED', ['Y'])
    })

    it('an imported name is flagged by its local name', () => {
      flagged('const X = Z', ['X'], { head: "import { IMPORTED as Z } from './dep'\n" })
      flagged('const X = NS.k', ['X'], { head: "import * as NS from './dep'\n" })
      flagged('const X = IMPORTED', ['X'], { head: "import IMPORTED from './dep'\n" })
      flagged('const X = B', ['X'], { head: "import IMPORTED, { A, B } from './dep'\n" })
    })

    it('the shape of special.ts: a typed array of tuples with a function type in the annotation', () => {
      flagged(
        [
          'const YEARLY: [string, (g: GameState) => void][] = [',
          "  ['military', IMPORTED],",
          "  ['actor', A],",
          ']',
        ].join('\n'),
        ['YEARLY'],
      )
    })

    it('the shape of menus.ts: an object that spreads an imported const and has lazy arrow members', () => {
      flagged(
        [
          'export const assetsMenu: MenuGroup = {',
          '  ...A,',
          '  children: (g) => {',
          "    const base = insertBefore(A.children(g), 'x', [B])",
          '    return base',
          '  },',
          '}',
        ].join('\n'),
        ['assetsMenu'],
      )
    })

    it('the shape of aging.ts: one bare function among arrows is a read', () => {
      flagged(
        [
          'export const YEARLY_HOOKS: [string, (g: GameState) => void][] = [',
          "  ['history', A],",
          "  ['royalCareers', (g) => IMPORTED(g)],",
          ']',
        ].join('\n'),
        ['YEARLY_HOOKS'],
      )
    })

    it('an immediately called function runs now, so its body reads count', () => {
      flagged('const X = (() => {\n  return IMPORTED\n})()')
      flagged('const X = (function () {\n  return IMPORTED\n})()')
      flagged('const X: ReadonlyMap<string, number> = (() => {\n  const m = new Map()\n  m.set("a", A)\n  return m\n})()')
      clean('const X = (() => {\n  return 1\n})()')
    })

    it('an immediately called function only reads what its own body reads, not what its inner functions read later', () => {
      clean('const X = (() => {\n  const f = (g) => IMPORTED(g)\n  return { f, h: () => A }\n})()')
      flagged('const X = (() => {\n  const f = (g) => IMPORTED(g)\n  return { f, v: A }\n})()')
    })

    it('a block that follows a condition is not a method: it runs in order', () => {
      flagged('const X = (() => {\n  for (const k of IMPORTED) {\n    log(k)\n  }\n  return 1\n})()')
      flagged('const X = (() => {\n  if (c) {\n    return A\n  }\n  return 1\n})()')
      flagged('const X = (() => {\n  while (c) {\n    B()\n  }\n})()')
      clean('const X = (() => {\n  for (const k of [1]) {\n    log(k)\n  }\n  return { m(a) { return IMPORTED } }\n})()')
    })

    it('a call that is not a grouped function is not an immediate call', () => {
      clean('const X = run((a) => IMPORTED(a))(1)')
    })

    it('the names of one file are sorted and unique, and a read is reported once per statement', () => {
      expect(scan('const Z = IMPORTED\nconst M = [A, B, IMPORTED]\nconst Q = 1')?.names).toEqual(['M', 'Z'])
    })

    it('a conditional arrow does not hide the other branch', () => {
      flagged('const X = c ? (g) => A(g) : IMPORTED')
      clean('const X = c ? (g) => A(g) : null')
      clean('const X = c ? (g) => (d ? A(g) : B(g)) : null')
    })
  })

  describe('not flagged', () => {
    it('anything inside a function: an arrow, a block, a function expression, a method', () => {
      clean('const X = (g) => IMPORTED(g)')
      clean('const X = () => IMPORTED')
      clean('const X = () => {\n  return IMPORTED\n}')
      clean('const X = async (g) => {\n  await IMPORTED(g)\n}')
      clean('const X = function () {\n  return IMPORTED\n}')
      clean('const X = function named(a: A): B {\n  return IMPORTED\n}')
      clean('const o = { m() { return IMPORTED } }')
      clean('const o = { m(a: A) { return IMPORTED }, get v() { return B } }')
      clean('const o = { async m() { return IMPORTED } }')
      clean('const X = [(g) => IMPORTED(g), (g) => A(g)]')
      clean('const X = { run: (g) => IMPORTED(g), other: (g) => {\n  A(g)\n} }')
    })

    it('an arrow with typed parameters and a return type: the types are not reads', () => {
      clean('const X = (a: A, b: B): void => {\n  a.run(b)\n}')
      clean('const X = (g: GameState): A => IMPORTED(g)')
      clean('const X = (m: Map<string, A>): Record<string, B> => ({})')
      clean('const X = (a: A = IMPORTED) => a')
    })

    it('a member or a key that happens to share the name', () => {
      clean('const X = obj.IMPORTED')
      clean('const X = obj?.IMPORTED')
      clean('const X = { IMPORTED: 1 }')
      clean('const X = { a: 1, IMPORTED: 2 }')
      clean('const X = { a: 1,\n  IMPORTED: 2 }')
    })

    it('a type position: as, satisfies, a generic argument, an annotation', () => {
      clean('const X = y as IMPORTED')
      clean('const X = y as unknown as Record<string, A[]>')
      clean('const X = y satisfies A')
      clean('const X = new Map<string, A>()')
      clean('const X = make<A, B>()')
      clean('const X: A = foo()')
      clean('const X: Array<A> = []')
      clean('const X = [1, 2] as readonly B[]')
    })

    it('a type-only import, and a type specifier', () => {
      clean('const X = IMPORTED', { head: "import type { IMPORTED } from './dep'\n" })
      clean('const X = IMPORTED', { head: "import type IMPORTED from './dep'\n" })
      clean('const X = IMPORTED', { head: "import { type IMPORTED, B } from './dep'\n" })
      flagged('const X = B', ['X'], { head: "import { type IMPORTED, B } from './dep'\n" })
    })

    it('an import from layer 0 or layer 1', () => {
      clean('const X = IMPORTED', { dep: 'src/game/data/lvl1.ts', head: "import { IMPORTED } from '../data/lvl1'\n" })
      clean('const X = IMPORTED', { dep: 'src/game/core.ts', head: "import { IMPORTED } from '../core'\n" })
      clean('const X = IMPORTED', { dep: 'src/game/kernel/ports.ts', head: "import { IMPORTED } from '../kernel/ports'\n" })
      clean('const X = IMPORTED', { dep: 'src/game/text/pick.ts', head: "import { IMPORTED } from '../text/pick'\n" })
    })

    it('a layer 2 import is above layer 1, so it is flagged', () => {
      flagged('const X = IMPORTED', ['X'], { dep: 'src/game/economy/index.ts', head: "import { IMPORTED } from '../economy/index'\n" })
    })

    it('a statement inside a function or a block, a declare, an enum', () => {
      clean('export function f() {\n  const x = IMPORTED\n  return x\n}')
      clean('if (c) {\n  const x = IMPORTED\n}')
      clean('declare const X: IMPORTED')
      clean('declare const X: A\nconst Y = 1')
      clean('const enum E {\n  Q = 1,\n}')
      clean('class K {\n  m() {\n    const x = IMPORTED\n  }\n}')
    })

    it('a const written in a comment, a string or a template', () => {
      clean("// const X = IMPORTED\nconst s = 'const X = IMPORTED'\nconst t = `const X = ${1}`")
      clean('/* const X = IMPORTED */\nconst u = 1')
    })

    it('no initializer, and nothing imported by name', () => {
      clean('let X: number\nconst Y = 2')
      clean('const X = 1', { head: '' })
      clean('const X = IMPORTED', { head: "import './dep'\n" })
    })

    it('an import that nothing at run time loads (the graph has no edge: it was only used as a type)', () => {
      const g = graphOf({ [T]: [], [DEP]: [] })
      expect(eagerReads([toSource(T, `${HEAD}const X = IMPORTED`)], g)).toEqual([])
    })
  })

  describe('imports and the graph', () => {
    it('resolves ./dep, a folder index, a tsx file and a parent folder; ignores a package and a json file', () => {
      const text = [
        "import { P } from './dep'",
        "import { Q } from './sub'",
        "import { R } from '../up/r'",
        "import { S } from './comp'",
        "import { react } from 'react'",
        "import data from './data.json'",
        'const X1 = P',
        'const X2 = Q',
        'const X3 = R',
        'const X4 = S',
        'const X5 = react',
        'const X6 = data',
      ].join('\n')
      const g = graphOf({
        [T]: [DEP, 'src/game/business/sub/index.ts', 'src/game/up/r.ts', 'src/game/business/comp.tsx'],
        [DEP]: [],
        'src/game/business/sub/index.ts': [],
        'src/game/up/r.ts': [],
        'src/game/business/comp.tsx': [],
      })
      expect(eagerReads([toSource(T, text)], g)[0]?.names).toEqual(['X1', 'X2', 'X3', 'X4'])
    })

    it('a dynamic import is not a static one', () => {
      clean('const X = import("./dep")')
      clean('const X = IMPORTED', { head: "const lazy = () => import('./dep')\n" })
    })

    it('a file that is not in the graph has no imports to read', () => {
      expect(eagerReads([toSource(T, `${HEAD}const X = IMPORTED`)], graphOf({}))).toEqual([])
    })
  })

  describe('exemption and hazard', () => {
    const L4 = 'src/game/aging.ts'
    const L5 = 'src/ui/panel.ts'

    it('a layer 3 file outside a cycle is reported, without the hazard flag', () => {
      const r = scan('const X = IMPORTED')
      expect(r).toEqual({ file: T, names: ['X'], hazard: false })
    })

    it('the same file in an import cycle is the hazard', () => {
      expect(scan('const X = IMPORTED', { cycle: true })).toEqual({ file: T, names: ['X'], hazard: true })
    })

    it('a layer 4 file outside any cycle is exempt (nothing can hold it half loaded)', () => {
      clean('const X = IMPORTED', { path: L4, head: "import { IMPORTED } from './business/dep'\n" })
      clean('const X = IMPORTED', { path: 'src/game/modules/index.ts', head: "import { IMPORTED } from '../business/dep'\n" })
    })

    it('the same layer 4 file inside a cycle is reported with hazard: true', () => {
      expect(scan('const X = IMPORTED', { path: L4, head: "import { IMPORTED } from './business/dep'\n", cycle: true })).toEqual({
        file: L4,
        names: ['X'],
        hazard: true,
      })
    })

    it('a layer 5 file is exempt outside a cycle and a hazard inside one', () => {
      const head = "import { IMPORTED } from '../game/business/dep'\n"
      clean('const X = IMPORTED', { path: L5, head })
      expect(scan('const X = IMPORTED', { path: L5, head, cycle: true })?.hazard).toBe(true)
    })

    it('the list is sorted by file', () => {
      const a = 'src/game/a/y.ts'
      const b = 'src/game/b/z.ts'
      const g = graphOf({ [b]: [DEP], [a]: [DEP], [DEP]: [] })
      const reads = eagerReads(
        [toSource(b, "import { A } from '../business/dep'\nconst Z = A"), toSource(a, "import { A } from '../business/dep'\nconst Y = A")],
        g,
      )
      expect(reads.map((r) => r.file)).toEqual([a, b])
    })
  })
})

describe('compareEager', () => {
  const F = 'src/game/business/t.ts'
  const read = (names: string[], hazard = false): EagerRead => ({ file: F, names, hazard })

  it('a read the baseline does not list is a new-eager-read, named by file', () => {
    const v = compareEager([read(['X', 'Y'])], { [F]: ['X'] })
    expect(v.map((x) => x.kind)).toEqual(['new-eager-read'])
    expect(v[0]!.edges).toEqual([`${F}: Y`])
  })

  it('a baseline that lists every read passes', () => {
    expect(compareEager([read(['X', 'Y'])], { [F]: ['Y', 'X'] })).toEqual([])
    expect(compareEager([], {})).toEqual([])
  })

  it('a listed read that is gone is stale-eager-read, and the hint names the update command', () => {
    const v = compareEager([read(['X'])], { [F]: ['X', 'Y'], 'src/game/b/gone.ts': ['Z'] })
    expect(v.map((x) => x.kind)).toEqual(['stale-eager-read'])
    expect(v[0]!.edges).toEqual([`${F}: Y`, 'src/game/b/gone.ts: Z'])
    expect(v[0]!.hint).toContain('UPDATE_LAYER_BASELINE=1')
    expect(v[0]!.hint).toContain('test/layers-baseline.json')
  })

  it('a new read in a file inside a cycle says why that is the dangerous kind', () => {
    const calm = compareEager([read(['X'])], {})
    const hazard = compareEager([read(['X'], true)], {})
    expect(calm[0]!.hint).not.toMatch(/cycle/)
    expect(hazard[0]!.hint).toMatch(/cycle/)
    expect(hazard[0]!.hint).toMatch(/undefined|load/)
  })

  it('says how to fix it: read the import inside a function, or go through a seam', () => {
    const v = compareEager([read(['X'])], {})
    expect(v[0]!.hint).toMatch(/inside a function/)
    expect(v[0]!.hint).toContain('registerModule')
  })

  it('reports new reads before stale ones', () => {
    const v = compareEager([read(['X'])], { 'src/game/b/gone.ts': ['Z'] })
    expect(v.map((x) => x.kind)).toEqual(['new-eager-read', 'stale-eager-read'])
  })
})

describe('the baseline sections: shrink, seed and rebase', () => {
  const AX = 'src/game/a/x.ts'
  const BY = 'src/game/b/y.ts'
  const BW = 'src/game/b/w.ts'
  const F = 'src/game/business/t.ts'
  const read = (names: string[]): EagerRead => ({ file: F, names, hazard: false })
  const two = graphOf({ [AX]: [BY, BW], [BY]: [], [BW]: [] })

  describe('shrinkLayers', () => {
    it('lowers a count that fell and drops a pair that reached 0', () => {
      const base: LayerBaseline = { ...EMPTY, domains: { 'a->b': 5, 'z->y': 2 } }
      expect(shrinkLayers(two, base).domains).toEqual({ 'a->b': 2 })
    })

    it('keeps the count when it is unchanged and keeps the order of the baseline', () => {
      const g = graphOf({ [AX]: [BY], 'src/game/c/q.ts': [BY], [BY]: [] })
      const base: LayerBaseline = { ...EMPTY, domains: { 'c->b': 1, 'a->b': 1 } }
      expect(Object.keys(shrinkLayers(g, base).domains!)).toEqual(['c->b', 'a->b'])
    })

    it('throws on a new pair, naming it', () => {
      expect(() => shrinkLayers(two, { ...EMPTY, domains: {} })).toThrow(/a->b/)
    })

    it('throws on a count above the baseline, naming it', () => {
      expect(() => shrinkLayers(two, { ...EMPTY, domains: { 'a->b': 1 } })).toThrow(/a->b/)
    })

    it('drops eager names that left, and a file with none left', () => {
      const base: LayerBaseline = { ...EMPTY, eager: { [F]: ['X', 'Y'], 'src/game/b/gone.ts': ['Z'] } }
      expect(shrinkLayers(graphOf({}), base, [read(['Y'])]).eager).toEqual({ [F]: ['Y'] })
    })

    it('throws on a new eager name, naming file and name', () => {
      const base: LayerBaseline = { ...EMPTY, eager: { [F]: ['X'] } }
      expect(() => shrinkLayers(graphOf({}), base, [read(['X', 'Q'])])).toThrow(/business\/t\.ts: Q/)
      expect(() => shrinkLayers(graphOf({}), base, [{ file: 'src/game/b/new.ts', names: ['N'], hazard: false }])).toThrow(/b\/new\.ts: N/)
    })

    it('leaves the eager section as given when it is not handed the reads, and leaves absent sections absent', () => {
      const eager = { [F]: ['X'] }
      expect(shrinkLayers(graphOf({}), { ...EMPTY, eager }).eager).toEqual(eager)
      const out = shrinkLayers(graphOf({}), EMPTY)
      expect('domains' in out).toBe(false)
      expect('eager' in out).toBe(false)
    })

    it('does not change its input', () => {
      const base: LayerBaseline = { ...EMPTY, domains: { 'a->b': 5 }, eager: { [F]: ['X', 'Y'] } }
      const before = JSON.stringify(base)
      shrinkLayers(two, base, [read(['X'])])
      expect(JSON.stringify(base)).toBe(before)
    })
  })

  describe('seedSections (the first run)', () => {
    it('adds the domains and the eager sections that the baseline does not have', () => {
      const out = seedSections(two, EMPTY, [read(['Y', 'X'])])
      expect(out.domains).toEqual({ 'a->b': 2 })
      expect(out.eager).toEqual({ [F]: ['X', 'Y'] })
      expect(Object.keys(out)).toEqual(['v', 'upward', 'cycleDirEdges', 'domains', 'eager'])
    })

    it('leaves a section that exists as it is, even when the graph differs', () => {
      const base: LayerBaseline = { ...EMPTY, domains: { 'a->b': 9 }, eager: { [F]: ['Q'] } }
      expect(seedSections(two, base, [read(['X'])])).toEqual(base)
    })

    it('adds only domains when it has no reads, and does not change its input', () => {
      const before = JSON.stringify(EMPTY)
      const out = seedSections(two, EMPTY)
      expect('eager' in out).toBe(false)
      expect(out.domains).toEqual({ 'a->b': 2 })
      expect(JSON.stringify(EMPTY)).toBe(before)
    })

    it('what it seeds then passes the comparisons', () => {
      const out = seedSections(two, EMPTY, [read(['X'])])
      expect(compareDomains(two, out.domains!)).toEqual([])
      expect(compareEager([read(['X'])], out.eager!)).toEqual([])
    })
  })

  describe('rebaseLayers', () => {
    it('takes a new pair and a higher count, and returns each addition for printing', () => {
      const base: LayerBaseline = { ...EMPTY, domains: { 'a->b': 1 } }
      const { baseline, added } = rebaseLayers(graphOf({ [AX]: [BY, BW], 'src/game/c/q.ts': [AX], [BY]: [], [BW]: [] }), base)
      expect(baseline.domains).toEqual({ 'a->b': 2, 'c->a': 1 })
      expect(added).toEqual(['domain: a->b (1 -> 2 imports)', 'domain: c->a (1 import)'])
    })

    it('also drops a pair that went away, and returns nothing when nothing grew', () => {
      const base: LayerBaseline = { ...EMPTY, domains: { 'a->b': 2, 'z->y': 3 } }
      const { baseline, added } = rebaseLayers(two, base)
      expect(baseline.domains).toEqual({ 'a->b': 2 })
      expect(added).toEqual([])
    })

    it('takes new eager reads when it has the reads, prints them, and drops what left', () => {
      const base: LayerBaseline = { ...EMPTY, eager: { [F]: ['X', 'Gone'] } }
      const { baseline, added } = rebaseLayers(graphOf({}), base, [read(['X', 'New'])])
      expect(baseline.eager).toEqual({ [F]: ['New', 'X'] })
      expect(added).toEqual([`eager: ${F}: New`])
    })

    it('leaves the eager section as given without the reads, and does not change its input', () => {
      const base: LayerBaseline = { ...EMPTY, domains: { 'a->b': 1 }, eager: { [F]: ['X'] } }
      const before = JSON.stringify(base)
      const { baseline } = rebaseLayers(two, base)
      expect(baseline.eager).toEqual({ [F]: ['X'] })
      expect(JSON.stringify(base)).toBe(before)
    })

    it('the result passes the comparisons it was made from', () => {
      const { baseline } = rebaseLayers(two, { ...EMPTY, domains: {}, eager: {} }, [read(['X'])])
      expect(compareDomains(two, baseline.domains!)).toEqual([])
      expect(compareEager([read(['X'])], baseline.eager!)).toEqual([])
    })
  })
})

describe('the real src', () => {
  it('no domain reaches another except through a contract, beyond the baseline', async () => {
    const { g, reads } = await realOnce()
    const mode = process.env.UPDATE_LAYER_BASELINE
    if (mode === '1' || mode === 'rebase') {
      const seeded = seedSections(g, readBaseline(), reads)
      if (mode === '1') {
        writeBaseline(shrinkLayers(g, seeded, reads))
      } else {
        const { baseline, added } = rebaseLayers(g, seeded, reads)
        writeBaseline(baseline)
        console.log(`layers baseline rebased: ${added.length} entr${added.length === 1 ? 'y' : 'ies'} added\n${added.join('\n')}`)
      }
    }
    const base = readBaseline()
    expect(base.domains, 'test/layers-baseline.json has no domains section: run the update command').toBeDefined()
    expect(explain(g, compareDomains(g, base.domains!))).toEqual([])
  }, 60_000)

  it('no module-level const reads an import that may not be loaded yet, beyond the baseline', async () => {
    const { g, reads } = await realOnce()
    const base = readBaseline()
    expect(base.eager, 'test/layers-baseline.json has no eager section: run the update command').toBeDefined()
    expect(explain(g, compareEager(reads, base.eager!))).toEqual([])
  }, 60_000)

  it('the reads that sit in an import cycle stay under the ceiling, even if the baseline was edited by hand', async () => {
    const { reads } = await realOnce()
    const hazard = reads.filter((r) => r.hazard).reduce((n, r) => n + r.names.length, 0)
    expect(hazard).toBeLessThanOrEqual(HAZARD_CEILING)
  }, 60_000)

  it('the scan finds a real population of reads, and exempts the assembly layer and the shell outside cycles', async () => {
    const { reads } = await realOnce()
    expect(reads.length).toBeGreaterThan(20)
    for (const r of reads) {
      expect(r.names.length, r.file).toBeGreaterThan(0)
      if (layerOf(r.file) >= 4) expect(r.hazard, r.file).toBe(true)
    }
    expect(reads.map((r) => r.file)).toEqual([...reads.map((r) => r.file)].sort())
  }, 60_000)

  it('the scan of all of src is quick', async () => {
    const { g } = await realOnce()
    const sources = loadSources(ROOT, 'src')
    const t0 = performance.now()
    eagerReads(sources, g)
    expect(performance.now() - t0).toBeLessThan(5000)
  }, 60_000)

  it('the rules fail on one violation added to the real tree (the synthetic violation)', async () => {
    const { g, reads } = await realOnce()
    const base = readBaseline()
    // two domains that nothing links yet: one import is a new pair, and it is counted once
    const added = new Map(g)
    added.set('src/game/zz-a/x.ts', ['src/game/zz-b/y.ts'])
    added.set('src/game/zz-b/y.ts', [])
    const fresh = compareDomains(added, base.domains!)
    expect(fresh.map((v) => v.kind)).toEqual(['new-domain-pair'])
    expect(fresh[0]!.edges).toEqual(['zz-a->zz-b (1 import)'])
    // the same import into a contract file is free
    const viaContract = new Map(g)
    viaContract.set('src/game/zz-a/x.ts', ['src/game/zz-b/contract.ts'])
    viaContract.set('src/game/zz-b/contract.ts', [])
    expect(compareDomains(viaContract, base.domains!)).toEqual([])
    // an eager read of an import in a new file, and the same file inside a cycle
    const text = "import { THING } from './dep'\nexport const TABLE = [THING]\n"
    const file = 'src/game/zz-a/table.ts'
    const dep = 'src/game/zz-a/dep.ts'
    const calm = eagerReads([toSource(file, text)], graphOf({ [file]: [dep], [dep]: [] }))
    expect(compareEager([...reads, ...calm], base.eager!).map((v) => v.kind)).toEqual(['new-eager-read'])
    const loop = eagerReads([toSource(file, text)], graphOf({ [file]: [dep], [dep]: [file] }))
    expect(loop[0]!.hazard).toBe(true)
  }, 60_000)
})

describe('the baseline sections in the file', () => {
  const pairKey = /^[a-z0-9][a-z0-9-]*->[a-z0-9][a-z0-9-]*$/

  it('domains: sorted pair keys between two different domains, with whole positive counts', () => {
    const base = readBaseline()
    const keys = Object.keys(base.domains ?? {})
    expect(keys.length).toBeGreaterThan(0)
    expect(keys).toEqual([...keys].sort())
    for (const k of keys) {
      expect(k).toMatch(pairKey)
      const [from, to] = k.split('->')
      expect(from, k).not.toBe(to)
      const n = base.domains![k]!
      expect(Number.isInteger(n) && n > 0, k).toBe(true)
    }
  })

  it('eager: sorted real files of src, each with sorted names and no repeats', async () => {
    const base = readBaseline()
    const { g } = await realOnce()
    const files = Object.keys(base.eager ?? {})
    expect(files.length).toBeGreaterThan(0)
    expect(files).toEqual([...files].sort())
    for (const f of files) {
      expect(g.has(f), f).toBe(true)
      const names = base.eager![f]!
      expect(names.length, f).toBeGreaterThan(0)
      expect(names, f).toEqual([...new Set(names)].sort())
    }
  }, 60_000)

  it('has the five sections the ratchet reads, in order', () => {
    expect(Object.keys(readBaseline())).toEqual(['v', 'upward', 'cycleDirEdges', 'domains', 'eager'])
    expect(existsSync(BASELINE_PATH)).toBe(true)
  })
})
