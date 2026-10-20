// ci: fast
// R1-P4 (K.1): the import-cycle ratchet. v4.0.0 shipped a 60-module import cycle that grew to 177 modules before anyone
// saw it. Five cycles exist today (the baseline file); this test lets them shrink and fails when a module joins one or
// two of them fuse. It reads the real src/ through one esbuild graph (test/arch-kit.ts), and builds small graphs and a
// temp-directory fixture for the rules that must fail on a synthetic cycle (D.11 criterion 10).
//
// To shrink the baseline after a module leaves a cycle:
//   UPDATE_ARCH_BASELINE=1 npx vitest run --maxWorkers=1 test/architecture.test.ts
// The update only ever removes modules (shrinkBaseline throws on a new one). With no baseline file yet it writes the first.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  compareToBaseline,
  cycleComponents,
  cyclePath,
  readImportGraph,
  shrinkBaseline,
  type ArchBaseline,
  type Graph,
  type Violation,
} from './arch-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE_PATH = join(ROOT, 'test', 'architecture-baseline.json')

/** A graph from a plain object: module -> modules it imports. */
function graphOf(edges: Record<string, string[]>): Graph {
  return new Map(Object.entries(edges))
}

function readBaseline(): ArchBaseline {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as ArchBaseline
}

function writeBaseline(b: ArchBaseline): void {
  writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + '\n')
}

// One graph for the whole file: it is the slow part (a bundle of all of src, a fraction of a second).
let realGraph: Promise<Graph> | null = null
function realGraphOnce(): Promise<Graph> {
  realGraph ??= readImportGraph(ROOT)
  return realGraph
}

/** Failure text for the real ratchet: the modules, one shortest import path around the cycle, and what to do. */
function explain(g: Graph, baseline: ArchBaseline, violations: readonly Violation[]): string[] {
  const where = new Map<string, number>()
  baseline.components.forEach((c, i) => c.forEach((m) => where.set(m, i)))
  return violations.map((v) => {
    const shown = v.modules.slice(0, 8).join(', ') + (v.modules.length > 8 ? ` and ${v.modules.length - 8} more` : '')
    const lines = [`${v.kind}: ${shown}`]
    if (v.kind === 'merged') {
      const crossing: string[] = []
      for (const m of v.modules) {
        for (const to of g.get(m) ?? []) {
          if (where.has(to) && where.get(to) !== where.get(m) && v.modules.includes(to)) crossing.push(`${m} -> ${to}`)
        }
      }
      lines.push(`  imports that cross the old cycles (one of them closes the loop): ${crossing.slice(0, 6).join('; ')}`)
    } else if (v.kind === 'new-module') {
      lines.push(`  cycle: ${cyclePath(g, v.modules[0]!).join(' -> ')}`)
    }
    lines.push(`  ${v.hint}`)
    return lines.join('\n')
  })
}

describe('import-cycle ratchet on the real src', () => {
  it('reads a graph of the whole of src', async () => {
    const g = await realGraphOnce()
    expect(g.size).toBeGreaterThanOrEqual(500)
    expect(g.has('src/game/core.ts')).toBe(true)
    expect(g.has('src/ui/store.ts')).toBe(true)
    for (const [from, to] of g) {
      for (const t of to) {
        if (!g.has(t)) throw new Error(`${from} has an edge to ${t}, which is not a module in the graph`)
      }
    }
    // Keys are posix paths relative to the repository root, and nothing outside src is a module.
    for (const key of g.keys()) expect(key).toMatch(/^src\/[^\\]+\.tsx?$/)
  }, 60_000)

  it('no module joins an import cycle and no two cycles fuse', async () => {
    const g = await realGraphOnce()
    const current = cycleComponents(g)
    if (process.env.UPDATE_ARCH_BASELINE === '1') {
      writeBaseline(existsSync(BASELINE_PATH) ? shrinkBaseline(current, readBaseline()) : { v: 1, components: current })
    }
    const baseline = readBaseline()
    expect(explain(g, baseline, compareToBaseline(current, baseline))).toEqual([])
  }, 60_000)
})

describe('cycleComponents', () => {
  it('finds a two-module cycle and ignores modules outside it', () => {
    const g = graphOf({ 'src/a.ts': ['src/b.ts'], 'src/b.ts': ['src/a.ts'], 'src/c.ts': ['src/a.ts'] })
    expect(cycleComponents(g)).toEqual([['src/a.ts', 'src/b.ts']])
  })

  it('a chain with no way back is not a cycle', () => {
    const g = graphOf({ 'src/a.ts': ['src/b.ts'], 'src/b.ts': ['src/c.ts'], 'src/c.ts': [] })
    expect(cycleComponents(g)).toEqual([])
  })

  it('a module that imports itself counts, one that does not is not a component', () => {
    expect(cycleComponents(graphOf({ 'src/a.ts': ['src/a.ts'], 'src/b.ts': ['src/a.ts'] }))).toEqual([['src/a.ts']])
    expect(cycleComponents(graphOf({ 'src/a.ts': [] }))).toEqual([])
  })

  it('sorts each component, then the list by size (largest first) and first path', () => {
    const g = graphOf({
      'src/z.ts': ['src/y.ts'],
      'src/y.ts': ['src/z.ts'],
      'src/d.ts': ['src/c.ts'],
      'src/c.ts': ['src/b.ts'],
      'src/b.ts': ['src/d.ts'],
      'src/q.ts': ['src/p.ts'],
      'src/p.ts': ['src/q.ts'],
    })
    expect(cycleComponents(g)).toEqual([
      ['src/b.ts', 'src/c.ts', 'src/d.ts'],
      ['src/p.ts', 'src/q.ts'],
      ['src/y.ts', 'src/z.ts'],
    ])
  })

  it('a cycle that closes through a long chain stays one component', () => {
    const edges: Record<string, string[]> = {}
    const n = 20_000 // deep enough to overflow a recursive walk
    for (let i = 0; i < n; i++) edges[`src/m${String(i).padStart(5, '0')}.ts`] = [`src/m${String((i + 1) % n).padStart(5, '0')}.ts`]
    const comps = cycleComponents(graphOf(edges))
    expect(comps).toHaveLength(1)
    expect(comps[0]).toHaveLength(n)
  })

  it('tolerates an edge to a module that is not in the graph', () => {
    expect(cycleComponents(graphOf({ 'src/a.ts': ['src/gone.ts'] }))).toEqual([])
  })
})

describe('compareToBaseline: a synthetic cycle fails (D.11 criterion 10)', () => {
  const baseline: ArchBaseline = { v: 1, components: [['src/a.ts', 'src/b.ts']] }

  it('the baseline itself passes', () => {
    const g = graphOf({ 'src/a.ts': ['src/b.ts'], 'src/b.ts': ['src/a.ts'] })
    expect(compareToBaseline(cycleComponents(g), baseline)).toEqual([])
  })

  it('a module that left the cycle is stale, not new or merged', () => {
    const wide: ArchBaseline = { v: 1, components: [['src/a.ts', 'src/b.ts', 'src/c.ts']] }
    const g = graphOf({ 'src/a.ts': ['src/b.ts'], 'src/b.ts': ['src/a.ts'] })
    expect(compareToBaseline(cycleComponents(g), wide).map((v) => v.kind)).toEqual(['stale'])
  })

  it('a third module that joins the cycle is a new-module violation', () => {
    const g = graphOf({
      'src/a.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts', 'src/c.ts'],
      'src/c.ts': ['src/a.ts'],
    })
    const v = compareToBaseline(cycleComponents(g), baseline)
    expect(v).toHaveLength(1)
    expect(v[0]!.kind).toBe('new-module')
    expect(v[0]!.modules).toEqual(['src/c.ts'])
    expect(v[0]!.hint).toContain('type-only')
    expect(v[0]!.hint).toContain('YEARLY_HOOKS')
    expect(v[0]!.hint).toContain('registerFamily')
  })

  it('a brand new cycle elsewhere is a new-module violation', () => {
    const g = graphOf({
      'src/a.ts': ['src/b.ts'],
      'src/b.ts': ['src/a.ts'],
      'src/x.ts': ['src/y.ts'],
      'src/y.ts': ['src/x.ts'],
    })
    const v = compareToBaseline(cycleComponents(g), baseline)
    expect(v.map((x) => x.kind)).toEqual(['new-module'])
    expect(v[0]!.modules).toEqual(['src/x.ts', 'src/y.ts'])
  })

  it('two baseline cycles that fuse are a merged violation even though no module is new', () => {
    const two: ArchBaseline = { v: 1, components: [['src/a.ts', 'src/b.ts'], ['src/c.ts', 'src/d.ts']] }
    const apart = graphOf({
      'src/a.ts': ['src/b.ts', 'src/c.ts'],
      'src/b.ts': ['src/a.ts'],
      'src/c.ts': ['src/d.ts'],
      'src/d.ts': ['src/c.ts'],
    })
    // a one-way import from one cycle into the other is allowed
    expect(compareToBaseline(cycleComponents(apart), two)).toEqual([])
    const fused = graphOf({
      'src/a.ts': ['src/b.ts', 'src/c.ts'],
      'src/b.ts': ['src/a.ts'],
      'src/c.ts': ['src/d.ts'],
      'src/d.ts': ['src/c.ts', 'src/a.ts'],
    })
    const v = compareToBaseline(cycleComponents(fused), two)
    expect(v.map((x) => x.kind)).toEqual(['merged'])
    expect(v[0]!.modules).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'])
  })

  it('a self-import counts as a cycle', () => {
    const g = graphOf({ 'src/a.ts': ['src/b.ts'], 'src/b.ts': ['src/a.ts'], 'src/s.ts': ['src/s.ts'] })
    const v = compareToBaseline(cycleComponents(g), baseline)
    expect(v.map((x) => x.kind)).toEqual(['new-module'])
    expect(v[0]!.modules).toEqual(['src/s.ts'])
    const known: ArchBaseline = { v: 1, components: [['src/a.ts', 'src/b.ts'], ['src/s.ts']] }
    expect(compareToBaseline(cycleComponents(g), known)).toEqual([])
  })

  it('removing the edge that closes the cycle is a stale violation (the list may only shrink)', () => {
    const g = graphOf({ 'src/a.ts': ['src/b.ts'], 'src/b.ts': [] })
    const v = compareToBaseline(cycleComponents(g), baseline)
    expect(v.map((x) => x.kind)).toEqual(['stale'])
    expect(v[0]!.modules).toEqual(['src/a.ts', 'src/b.ts'])
    expect(v[0]!.hint).toContain('UPDATE_ARCH_BASELINE=1')
  })

  it('reports new-module, merged and stale together, in that order', () => {
    const base: ArchBaseline = {
      v: 1,
      components: [['src/a.ts', 'src/b.ts'], ['src/c.ts', 'src/d.ts'], ['src/e.ts', 'src/f.ts']],
    }
    const g = graphOf({
      'src/a.ts': ['src/b.ts', 'src/c.ts'],
      'src/b.ts': ['src/a.ts'],
      'src/c.ts': ['src/d.ts'],
      'src/d.ts': ['src/c.ts', 'src/a.ts'],
      'src/n.ts': ['src/o.ts'],
      'src/o.ts': ['src/n.ts'],
    })
    expect(compareToBaseline(cycleComponents(g), base).map((x) => x.kind)).toEqual(['new-module', 'merged', 'stale'])
  })
})

describe('shrinkBaseline', () => {
  const baseline: ArchBaseline = {
    v: 1,
    components: [
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      ['src/d.ts', 'src/e.ts'],
      ['src/f.ts', 'src/g.ts'],
    ],
  }

  it('keeps the intersection with the current cycles and preserves order', () => {
    const current = [['src/a.ts', 'src/c.ts'], ['src/f.ts', 'src/g.ts']]
    expect(shrinkBaseline(current, baseline)).toEqual({
      v: 1,
      components: [['src/a.ts', 'src/c.ts'], ['src/f.ts', 'src/g.ts']],
    })
  })

  it('drops a component that is gone and leaves the others alone', () => {
    expect(shrinkBaseline([], baseline)).toEqual({ v: 1, components: [] })
    expect(shrinkBaseline(baseline.components, baseline)).toEqual(baseline)
  })

  it('does not change its input', () => {
    const before = JSON.stringify(baseline)
    shrinkBaseline([['src/a.ts', 'src/b.ts']], baseline)
    expect(JSON.stringify(baseline)).toBe(before)
  })

  it('throws on a module that is not in the baseline, naming it', () => {
    expect(() => shrinkBaseline([['src/a.ts', 'src/b.ts', 'src/new.ts']], baseline)).toThrow(/src\/new\.ts/)
  })

  it('never writes a fusion into the baseline', () => {
    const fused = [['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts']]
    const out = shrinkBaseline(fused, baseline)
    expect(compareToBaseline(fused, out).map((x) => x.kind)).toEqual(['merged'])
  })
})

describe('cyclePath', () => {
  const g = graphOf({
    'src/a.ts': ['src/b.ts', 'src/c.ts'],
    'src/b.ts': ['src/a.ts'],
    'src/c.ts': ['src/d.ts'],
    'src/d.ts': ['src/a.ts'],
    'src/e.ts': ['src/a.ts'],
    'src/s.ts': ['src/s.ts'],
  })

  it('returns a closed path through the module, the shortest one', () => {
    expect(cyclePath(g, 'src/a.ts')).toEqual(['src/a.ts', 'src/b.ts', 'src/a.ts'])
    expect(cyclePath(g, 'src/d.ts')).toEqual(['src/d.ts', 'src/a.ts', 'src/c.ts', 'src/d.ts'])
    const p = cyclePath(g, 'src/c.ts')
    expect(p[0]).toBe('src/c.ts')
    expect(p[p.length - 1]).toBe('src/c.ts')
    for (let i = 0; i + 1 < p.length; i++) expect(g.get(p[i]!)).toContain(p[i + 1])
  })

  it('is a single step for a self-import', () => {
    expect(cyclePath(g, 'src/s.ts')).toEqual(['src/s.ts', 'src/s.ts'])
  })

  it('is empty for a module that is not in a cycle, or not in the graph', () => {
    expect(cyclePath(g, 'src/e.ts')).toEqual([])
    expect(cyclePath(g, 'src/missing.ts')).toEqual([])
  })
})

describe('readImportGraph on a fixture (type-only and dynamic imports are not edges)', () => {
  function withFixture(files: Record<string, string>, run: (dir: string) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'arch-kit-'))
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true })
      writeFileSync(join(dir, rel), text)
    }
    return run(dir).finally(() => rmSync(dir, { recursive: true, force: true }))
  }

  it('an import type back to a module is erased, so a value import plus a type import is no cycle', async () => {
    await withFixture(
      {
        'src/a.ts': "import type { T } from './b'\nexport const a = 1\nexport function f(x: T) { return x }\n",
        'src/b.ts': "import { a } from './a'\nexport type T = number\nexport const b = a + 1\n",
      },
      async (dir) => {
        const g = await readImportGraph(dir)
        expect([...g.keys()].sort()).toEqual(['src/a.ts', 'src/b.ts'])
        expect(g.get('src/a.ts')).toEqual([])
        expect(g.get('src/b.ts')).toEqual(['src/a.ts'])
        expect(cycleComponents(g)).toEqual([])
      },
    )
  })

  it('a plain import that is only used as a type is erased too', async () => {
    await withFixture(
      {
        'src/a.ts': "import { T } from './b'\nexport const a = 1\nexport function f(x: T) { return x }\n",
        'src/b.ts': "import { a } from './a'\nexport type T = number\nexport const b = a + 1\n",
      },
      async (dir) => {
        expect(cycleComponents(await readImportGraph(dir))).toEqual([])
      },
    )
  })

  it('two value imports are a cycle', async () => {
    await withFixture(
      {
        'src/a.ts': "import { b } from './b'\nexport const a = () => b\n",
        'src/b.ts': "import { a } from './a'\nexport const b = () => a\n",
      },
      async (dir) => {
        const g = await readImportGraph(dir)
        expect(cycleComponents(g)).toEqual([['src/a.ts', 'src/b.ts']])
        expect(cyclePath(g, 'src/a.ts')).toEqual(['src/a.ts', 'src/b.ts', 'src/a.ts'])
      },
    )
  })

  it('a self-import is a cycle of one', async () => {
    await withFixture({ 'src/a.ts': "import { a as me } from './a'\nexport const a = () => me\n" }, async (dir) => {
      expect(cycleComponents(await readImportGraph(dir))).toEqual([['src/a.ts']])
    })
  })

  it('a dynamic import() is not an edge', async () => {
    await withFixture(
      {
        'src/a.ts': "export const load = () => import('./b')\n",
        'src/b.ts': "import { load } from './a'\nexport const b = load\n",
      },
      async (dir) => {
        const g = await readImportGraph(dir)
        expect(g.get('src/a.ts')).toEqual([])
        expect(cycleComponents(g)).toEqual([])
      },
    )
  })

  it('packages, css and files outside src are not modules', async () => {
    await withFixture(
      {
        'src/a.tsx': "import './a.css'\nimport { useState } from 'react'\nexport const a = () => useState\n",
        'src/a.css': '.a { color: red }\n',
        'src/types.d.ts': 'export {}\n',
        'test/t.ts': 'export const t = 1\n',
      },
      async (dir) => {
        const g = await readImportGraph(dir)
        expect([...g.keys()]).toEqual(['src/a.tsx'])
        expect(g.get('src/a.tsx')).toEqual([])
      },
    )
  })

  it('takes an explicit file list, relative to the root', async () => {
    await withFixture(
      {
        'src/a.ts': "import { b } from './b'\nexport const a = b\n",
        'src/b.ts': 'export const b = 1\n',
        'src/c.ts': 'export const c = 2\n',
      },
      async (dir) => {
        const g = await readImportGraph(dir, ['src/a.ts'])
        expect([...g.keys()].sort()).toEqual(['src/a.ts', 'src/b.ts'])
        expect(g.get('src/a.ts')).toEqual(['src/b.ts'])
      },
    )
  })
})

describe('the baseline file', () => {
  it('is sorted, unique, real paths, and its sizes add up', () => {
    const b = readBaseline()
    expect(b.v).toBe(1)
    expect(b.components.length).toBeGreaterThan(0)
    const flat: string[] = []
    for (const c of b.components) {
      expect(c.length).toBeGreaterThan(0)
      expect([...c]).toEqual([...c].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)))
      expect(new Set(c).size).toBe(c.length)
      flat.push(...c)
    }
    // no module sits in two components, and every module is a file that exists
    expect(new Set(flat).size).toBe(flat.length)
    expect(b.components.reduce((n, c) => n + c.length, 0)).toBe(new Set(flat).size)
    for (const p of flat) expect(existsSync(join(ROOT, p)), p).toBe(true)
  })
})
