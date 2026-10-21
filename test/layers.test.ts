// ci: fast
// R2-K3 (K.2a a): the layer ratchet. Every module of src/ has a layer (test/layer-kit.ts, the table in layerOf), an import may
// point down or sideways but never up, and no import cycle may cross a directory. Both rules start from today's graph (the
// baseline file) and can only shrink: a new upward import or a new cross-directory cycle edge fails, and so does an edge that
// went away without the baseline being regenerated. The kernel (layer 0) is held harder: an import that starts in it and points
// up fails even when the baseline lists it, and the baseline can never take one.
//
// The real src is read through the R1 graph (test/arch-kit.ts, one esbuild bundle). The rules that must fail on a violation run
// on small synthetic graphs, and once on the real graph with one edge added.
//
// To shrink the baseline after an edge goes away:
//   UPDATE_LAYER_BASELINE=1 npx vitest run --maxWorkers=1 test/layers.test.ts
// The update only ever removes edges (shrinkLayers throws on a new one). With no baseline file yet it writes the first.
// R2-K4 added the domains and eager sections, which test/layers-domains.test.ts also writes: run both files to update them all.
// One more mode exists for the day a track that was built beside this one merges in:
//   UPDATE_LAYER_BASELINE=rebase npx vitest run --maxWorkers=1 --silent=false test/layers.test.ts
// It accepts growth once, prints every entry it added (the commit message lists them; `git diff test/layers-baseline.json`
// shows the same), and refuses an edge out of the kernel.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cyclePath, readImportGraph, type Graph } from './arch-kit'
import {
  LAYER_NAMES,
  compareLayers,
  cycleDirEdges,
  layerOf,
  rebaseLayers,
  shrinkLayers,
  upwardEdges,
  type LayerBaseline,
  type LayerViolation,
} from './layer-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE_PATH = join(ROOT, 'test', 'layers-baseline.json')
const EMPTY: LayerBaseline = { v: 1, upward: [], cycleDirEdges: [] }

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

// One graph for the whole file: it is the slow part (a bundle of all of src, a fraction of a second).
let realGraph: Promise<Graph> | null = null
function realGraphOnce(): Promise<Graph> {
  realGraph ??= readImportGraph(ROOT)
  return realGraph
}

/** Failure text for the real ratchet: the kind, the first edges, one shortest cycle for a cycle edge, and what to do. */
function explain(g: Graph, violations: readonly LayerViolation[]): string[] {
  return violations.map((v) => {
    const shown = v.edges.slice(0, 8).join('; ') + (v.edges.length > 8 ? ` and ${v.edges.length - 8} more` : '')
    const lines = [`${v.kind}: ${shown}`]
    if (v.kind === 'new-cycle-dir') lines.push(`  cycle: ${cyclePath(g, v.edges[0]!.split(' -> ')[0]!).join(' -> ')}`)
    lines.push(`  ${v.hint}`)
    return lines.join('\n')
  })
}

// Synthetic modules, one per layer.
const L0 = 'src/game/kernel/ports.ts'
const L1 = 'src/game/data/markets.ts'
const L2 = 'src/game/economy/index.ts'
const L3 = 'src/game/business/manage.ts'
const L3b = 'src/game/business/util.ts'
const L4 = 'src/game/aging.ts'
const L5 = 'src/ui/store.ts'

describe('layerOf: the table', () => {
  const rows: Record<number, string[]> = {
    5: ['src/ui/store.ts', 'src/ui/deep/dir/panel.tsx', 'src/App.tsx', 'src/main.tsx', 'src/boot.ts', 'src/settings.ts'],
    0: [
      'src/game/kernel/streams.ts',
      'src/game/kernel/deep/x.ts',
      ...['types', 'rng', 'core', 'scripts', 'talents', 'assetHooks', 'flags', 'world-flags', 'notice-weights', 'timeMachine'].map(
        (n) => `src/game/${n}.ts`,
      ),
    ],
    4: [
      'src/game/modules/index.ts',
      'src/game/modules/deep/x.ts',
      'src/game/hubs/company.ts',
      ...[
        'aging',
        'menus',
        'life',
        'save',
        'save-schema',
        'save-backends',
        'save-quarantine',
        'save-hydrate',
        'save-store',
        'snapshot-codec',
        'offline',
        'birth-background',
        'life-series',
        'inbox',
        'notice-policy',
      ].map((n) => `src/game/${n}.ts`),
    ],
    2: [
      'src/game/economy/index.ts',
      'src/game/economy/deep/x.ts',
      'src/game/world/state.ts',
      'src/game/nation/state.ts',
      'src/game/nation/effects.ts',
      'src/game/nation/trade-policy.ts',
    ],
    1: ['src/game/data/markets.ts', 'src/game/data/deep/x.ts', 'src/game/world.ts', 'src/game/history/index.ts', 'src/game/text/pick.ts'],
    3: [
      'src/game/business/manage.ts',
      'src/game/crime.ts',
      'src/game/nation/laws.ts',
      'src/game/nation/menu.ts',
      'src/game/effects.ts',
      'src/game/computer/dev.ts',
      'src/game/special.ts',
    ],
  }

  it('puts every row of the table in its layer', () => {
    for (const [layer, paths] of Object.entries(rows)) {
      for (const p of paths) expect(layerOf(p), p).toBe(Number(layer))
    }
  })

  it('answers the examples the plan names', () => {
    expect(layerOf('src/game/timeMachine.ts')).toBe(0)
    expect(layerOf('src/game/data/markets.ts')).toBe(1)
    expect(layerOf('src/game/economy/index.ts')).toBe(2)
    expect(layerOf('src/game/business/manage.ts')).toBe(3)
    expect(layerOf('src/game/aging.ts')).toBe(4)
    expect(layerOf('src/ui/store.ts')).toBe(5)
    expect(layerOf('src/game/modules/index.ts')).toBe(4)
    expect(layerOf('src/game/hubs/company.ts')).toBe(4)
  })

  it('names the six layers by id', () => {
    expect(LAYER_NAMES).toEqual(['kernel', 'data', 'world', 'domains', 'assembly', 'ui'])
  })

  it('applies a file row to that exact file, not to a name that starts the same way', () => {
    for (const p of [
      'src/game/kernels.ts',
      'src/game/core-extra.ts',
      'src/game/datamart.ts',
      'src/game/world-extra.ts',
      'src/game/life-extra.ts',
      'src/game/aging2.ts',
      'src/game/nation/effects-more.ts',
      'src/game/nation/state2.ts',
      'src/game/economy.ts',
      'src/game/text.ts',
      'src/game/modules.ts',
    ]) {
      expect(layerOf(p), p).toBe(3)
    }
    // a directory row applies to the directory, so a root file of the same stem is a different module
    expect(layerOf('src/game/world.ts')).toBe(1)
    expect(layerOf('src/game/world/state.ts')).toBe(2)
    expect(layerOf('src/game/world-flags.ts')).toBe(0)
  })

  it('makes a new directory under src/game a domain, and the rest of src the shell', () => {
    expect(layerOf('src/game/newcomer/x.ts')).toBe(3)
    expect(layerOf('src/game/newcomer.ts')).toBe(3)
    expect(layerOf('src/telemetry.ts')).toBe(5)
    expect(layerOf('src/other/x.ts')).toBe(5)
  })

  it('refuses a path that is not under src', () => {
    expect(() => layerOf('test/helpers.ts')).toThrow(/src/)
    expect(() => layerOf('scripts/x.mjs')).toThrow(/src/)
  })
})

describe('upwardEdges (rule b) on synthetic graphs', () => {
  it('lets an import point sideways or down, and lets the shell import anything', () => {
    const g = graphOf({
      [L3]: [L3b, L1, L2, L0],
      [L3b]: [],
      [L2]: [L1, L0],
      [L1]: [L0],
      [L0]: [],
      [L4]: [L3, L2, L1, L0],
      [L5]: [L4, L3, L2, L1, L0],
    })
    expect(upwardEdges(g)).toEqual([])
  })

  it('names an import that points up as "from -> to", sorted', () => {
    const g = graphOf({
      [L3]: [L4],
      [L2]: [L3b],
      [L1]: [L3b, L2],
      [L0]: [],
      [L3b]: [],
      [L4]: [],
    })
    expect(upwardEdges(g)).toEqual([`${L3} -> ${L4}`, `${L1} -> ${L3b}`, `${L1} -> ${L2}`, `${L2} -> ${L3b}`])
  })

  it('does not change the graph it reads', () => {
    const g = graphOf({ [L3]: [L4], [L4]: [] })
    const before = JSON.stringify([...g])
    upwardEdges(g)
    cycleDirEdges(g)
    expect(JSON.stringify([...g])).toBe(before)
  })
})

describe('compareLayers: a synthetic violation fails (rule b)', () => {
  const up = graphOf({ [L3]: [L4], [L4]: [] })

  it('an L3 module that imports an L4 module is new-upward, with a hint on how to fix it', () => {
    const v = compareLayers(up, EMPTY)
    expect(v.map((x) => x.kind)).toEqual(['new-upward'])
    expect(v[0]!.edges).toEqual([`${L3} -> ${L4}`])
    expect(v[0]!.hint).toContain('registerModule')
  })

  it('a baseline that lists the edge passes', () => {
    expect(compareLayers(up, { ...EMPTY, upward: [`${L3} -> ${L4}`] })).toEqual([])
  })

  it('deleting the import makes the listed edge stale, and the hint names the update command', () => {
    const gone = graphOf({ [L3]: [], [L4]: [] })
    const v = compareLayers(gone, { ...EMPTY, upward: [`${L3} -> ${L4}`] })
    expect(v.map((x) => x.kind)).toEqual(['stale-upward'])
    expect(v[0]!.edges).toEqual([`${L3} -> ${L4}`])
    expect(v[0]!.hint).toContain('UPDATE_LAYER_BASELINE=1')
    expect(v[0]!.hint).toContain('test/layers-baseline.json')
  })

  it('an L0 module with any upward import is kernel-upward even when the baseline lists it', () => {
    const k = graphOf({ [L0]: [L3], [L3]: [] })
    const unlisted = compareLayers(k, EMPTY)
    expect(unlisted.map((x) => x.kind)).toEqual(['kernel-upward'])
    expect(unlisted[0]!.edges).toEqual([`${L0} -> ${L3}`])
    const listed = compareLayers(k, { ...EMPTY, upward: [`${L0} -> ${L3}`] })
    expect(listed.map((x) => x.kind)).toEqual(['kernel-upward'])
    expect(listed[0]!.hint).toMatch(/kernel/)
  })

  it('a root kernel file counts as the kernel: core.ts importing a data file is kernel-upward', () => {
    const k = graphOf({ 'src/game/core.ts': [L1], [L1]: [] })
    expect(compareLayers(k, EMPTY).map((x) => x.kind)).toEqual(['kernel-upward'])
  })

  it('reports each edge once: a kernel edge is not also new-upward', () => {
    const g = graphOf({ [L0]: [L3], [L3]: [L4], [L4]: [] })
    const v = compareLayers(g, EMPTY)
    expect(v.map((x) => x.kind)).toEqual(['kernel-upward', 'new-upward'])
    expect(v[0]!.edges).toEqual([`${L0} -> ${L3}`])
    expect(v[1]!.edges).toEqual([`${L3} -> ${L4}`])
  })

  it('reports kernel-upward, new edges and stale edges together, in that order', () => {
    const g = graphOf({
      [L0]: [L3],
      [L3]: [L4],
      [L4]: [],
      'src/game/a/x.ts': ['src/game/b/y.ts'],
      'src/game/b/y.ts': ['src/game/a/x.ts'],
    })
    const base: LayerBaseline = { v: 1, upward: [`${L1} -> ${L3b}`], cycleDirEdges: ['src/game/c/p.ts -> src/game/d/q.ts'] }
    expect(compareLayers(g, base).map((x) => x.kind)).toEqual([
      'kernel-upward',
      'new-upward',
      'new-cycle-dir',
      'stale-upward',
      'stale-cycle-dir',
    ])
  })
})

describe('cycleDirEdges (rule e) on synthetic graphs', () => {
  const X = 'src/game/a/x.ts'
  const Y = 'src/game/b/y.ts'

  it('a two-module cycle across two directories gives both edges', () => {
    expect(cycleDirEdges(graphOf({ [X]: [Y], [Y]: [X] }))).toEqual([`${X} -> ${Y}`, `${Y} -> ${X}`])
  })

  it('a cycle inside one directory gives none', () => {
    expect(cycleDirEdges(graphOf({ 'src/game/a/p.ts': ['src/game/a/q.ts'], 'src/game/a/q.ts': ['src/game/a/p.ts'] }))).toEqual([])
  })

  it('an edge between two directories that is not on a cycle gives none', () => {
    expect(cycleDirEdges(graphOf({ [X]: [Y], [Y]: [] }))).toEqual([])
  })

  it('in a three-module cycle only the hops that cross a directory count', () => {
    const P = 'src/game/a/p.ts'
    const g = graphOf({ [X]: [P], [P]: [Y], [Y]: [X] })
    expect(cycleDirEdges(g)).toEqual([`${P} -> ${Y}`, `${Y} -> ${X}`])
  })

  it('an edge into a cycle from outside it is not a cycle edge, even across directories', () => {
    const Z = 'src/game/c/z.ts'
    expect(cycleDirEdges(graphOf({ [X]: [Y], [Y]: [X], [Z]: [X] }))).toEqual([`${X} -> ${Y}`, `${Y} -> ${X}`])
  })

  it('a root file and a file in a directory differ by dirname', () => {
    const g = graphOf({ 'src/game/a.ts': ['src/game/a/b.ts'], 'src/game/a/b.ts': ['src/game/a.ts'] })
    expect(cycleDirEdges(g)).toHaveLength(2)
  })

  it('a module that imports itself is not a cross-directory edge', () => {
    expect(cycleDirEdges(graphOf({ [X]: [X] }))).toEqual([])
  })

  it('baseline semantics: unlisted is new, listed passes, a removed edge is stale', () => {
    const g = graphOf({ [X]: [Y], [Y]: [X] })
    const both = [`${X} -> ${Y}`, `${Y} -> ${X}`]
    const fresh = compareLayers(g, EMPTY)
    expect(fresh.map((v) => v.kind)).toEqual(['new-cycle-dir'])
    expect(fresh[0]!.edges).toEqual(both)
    expect(compareLayers(g, { ...EMPTY, cycleDirEdges: both })).toEqual([])
    const broken = graphOf({ [X]: [Y], [Y]: [] })
    const stale = compareLayers(broken, { ...EMPTY, cycleDirEdges: both })
    expect(stale.map((v) => v.kind)).toEqual(['stale-cycle-dir'])
    expect(stale[0]!.edges).toEqual(both)
    expect(stale[0]!.hint).toContain('UPDATE_LAYER_BASELINE=1')
  })
})

describe('shrinkLayers', () => {
  const E1 = `${L3} -> ${L4}`
  const E2 = `${L2} -> ${L3b}`
  const C1 = 'src/game/a/x.ts -> src/game/b/y.ts'
  const C2 = 'src/game/b/y.ts -> src/game/a/x.ts'
  const base: LayerBaseline = { v: 1, upward: [E2, E1], cycleDirEdges: [C1, C2] }

  it('keeps the intersection with the current edges and preserves order', () => {
    const g = graphOf({ [L3]: [L4], [L4]: [], 'src/game/a/x.ts': ['src/game/b/y.ts'], 'src/game/b/y.ts': [] })
    expect(shrinkLayers(g, base)).toEqual({ v: 1, upward: [E1], cycleDirEdges: [] })
    const both = graphOf({ [L3]: [L4], [L2]: [L3b], [L3b]: [], [L4]: [] })
    expect(shrinkLayers(both, base).upward).toEqual([E2, E1])
  })

  it('shrinks the domains section with the graph, and leaves the eager section as given without the reads (R2-K4 owns both now)', () => {
    const wide: LayerBaseline = { ...base, domains: { 'a->b': 3 }, eager: { 'src/game/x.ts': ['NAME'] } }
    const out = shrinkLayers(graphOf({}), wide)
    expect(out.domains).toEqual({}) // no import between two domains is left, so the pair goes
    expect(out.eager).toEqual({ 'src/game/x.ts': ['NAME'] })
    expect(out.upward).toEqual([])
  })

  it('does not change its input', () => {
    const before = JSON.stringify(base)
    shrinkLayers(graphOf({ [L3]: [L4], [L4]: [] }), base)
    expect(JSON.stringify(base)).toBe(before)
  })

  it('throws on a new upward edge, naming it', () => {
    const g = graphOf({ [L3]: [L4], [L3b]: [L4], [L4]: [] })
    expect(() => shrinkLayers(g, base)).toThrow(/business\/util\.ts -> src\/game\/aging\.ts/)
  })

  it('throws on a new cross-directory cycle edge, naming it', () => {
    const g = graphOf({ 'src/game/c/p.ts': ['src/game/d/q.ts'], 'src/game/d/q.ts': ['src/game/c/p.ts'] })
    expect(() => shrinkLayers(g, base)).toThrow(/c\/p\.ts -> src\/game\/d\/q\.ts/)
  })

  it('never writes an edge the baseline did not have, so a regenerate cannot hide a violation', () => {
    const g = graphOf({ [L3]: [L4], [L3b]: [L4], [L4]: [] })
    let out: LayerBaseline | null = null
    try {
      out = shrinkLayers(g, base)
    } catch {
      out = null
    }
    expect(out).toBeNull()
  })
})

describe('rebaseLayers', () => {
  const E1 = `${L3} -> ${L4}`
  const base: LayerBaseline = { v: 1, upward: [E1], cycleDirEdges: [] }

  it('adds the new edge, keeps the old one, and returns the addition for printing', () => {
    const g = graphOf({ [L3]: [L4], [L2]: [L3b], [L3b]: [], [L4]: [] })
    const { baseline, added } = rebaseLayers(g, base)
    expect(baseline.upward).toEqual([E1, `${L2} -> ${L3b}`])
    expect(added).toEqual([`upward: ${L2} -> ${L3b}`])
    expect(compareLayers(g, baseline)).toEqual([])
  })

  it('adds a cross-directory cycle edge too, by section', () => {
    const g = graphOf({ [L3]: [L4], [L4]: [], 'src/game/a/x.ts': ['src/game/b/y.ts'], 'src/game/b/y.ts': ['src/game/a/x.ts'] })
    const { baseline, added } = rebaseLayers(g, base)
    expect(baseline.cycleDirEdges).toEqual(['src/game/a/x.ts -> src/game/b/y.ts', 'src/game/b/y.ts -> src/game/a/x.ts'])
    expect(added).toEqual([
      'cycle-dir: src/game/a/x.ts -> src/game/b/y.ts',
      'cycle-dir: src/game/b/y.ts -> src/game/a/x.ts',
    ])
  })

  it('also drops what went away, and returns nothing when nothing grew', () => {
    const { baseline, added } = rebaseLayers(graphOf({ [L3]: [], [L4]: [] }), base)
    expect(baseline.upward).toEqual([])
    expect(added).toEqual([])
  })

  it('refuses an upward edge that starts in the kernel, and says so', () => {
    expect(() => rebaseLayers(graphOf({ [L0]: [L3], [L3]: [] }), EMPTY)).toThrow(/kernel/)
    expect(() => rebaseLayers(graphOf({ [L0]: [L3], [L3]: [] }), EMPTY)).toThrow(/kernel\/ports\.ts -> src\/game\/business\/manage\.ts/)
  })

  it('rebuilds the domains section from the graph, leaves the eager section as given without the reads, and does not change its input (R2-K4 owns both now)', () => {
    const wide: LayerBaseline = { ...base, domains: { 'a->b': 3 }, eager: { 'src/game/x.ts': ['NAME'] } }
    const before = JSON.stringify(wide)
    const { baseline } = rebaseLayers(graphOf({ [L3]: [L4], [L4]: [] }), wide)
    expect(baseline.domains).toEqual({})
    expect(baseline.eager).toEqual({ 'src/game/x.ts': ['NAME'] })
    expect(JSON.stringify(wide)).toBe(before)
  })
})

describe('the real src', () => {
  it('gives every module a layer', async () => {
    const g = await realGraphOnce()
    expect(g.size).toBeGreaterThanOrEqual(500)
    for (const key of g.keys()) expect([0, 1, 2, 3, 4, 5], key).toContain(layerOf(key))
  }, 60_000)

  it('the table names real files (a rename would otherwise move a file to the domains by accident)', async () => {
    const g = await realGraphOnce()
    const named = [
      ...['types', 'rng', 'core', 'scripts', 'talents', 'assetHooks', 'flags', 'world-flags', 'notice-weights', 'timeMachine'],
      ...[
        'aging',
        'menus',
        'life',
        'save',
        'save-schema',
        'save-backends',
        'save-quarantine',
        'save-hydrate',
        'save-store',
        'snapshot-codec',
        'offline',
        'birth-background',
        'life-series',
        'inbox',
        'notice-policy',
      ],
      'world',
    ].map((n) => `src/game/${n}.ts`)
    for (const p of [...named, 'src/game/nation/state.ts', 'src/game/nation/effects.ts', 'src/game/nation/trade-policy.ts']) {
      expect(g.has(p), p).toBe(true)
    }
    for (const p of ['src/App.tsx', 'src/main.tsx', 'src/boot.ts', 'src/settings.ts']) expect(g.has(p), p).toBe(true)
  }, 60_000)

  it('no import points up a layer and no cycle edge crosses a directory, beyond the baseline', async () => {
    const g = await realGraphOnce()
    const mode = process.env.UPDATE_LAYER_BASELINE
    const from = existsSync(BASELINE_PATH) ? readBaseline() : EMPTY
    if (mode === '1') {
      writeBaseline(existsSync(BASELINE_PATH) ? shrinkLayers(g, from) : rebaseLayers(g, from).baseline)
    } else if (mode === 'rebase') {
      const { baseline, added } = rebaseLayers(g, from)
      writeBaseline(baseline)
      console.log(`layers baseline rebased: ${added.length} entr${added.length === 1 ? 'y' : 'ies'} added\n${added.join('\n')}`)
    }
    expect(explain(g, compareLayers(g, readBaseline()))).toEqual([])
  }, 60_000)

  it('no import that starts in the kernel points up (the kernel is a leaf)', async () => {
    const g = await realGraphOnce()
    expect(upwardEdges(g).filter((e) => layerOf(e.split(' -> ')[0]!) === 0)).toEqual([])
  }, 60_000)

  it('src/game/modules is imported only from the assembly layer and the shell', async () => {
    const g = await realGraphOnce()
    const bad: string[] = []
    for (const [from, targets] of g) {
      for (const to of targets) {
        if (to.startsWith('src/game/modules/') && layerOf(from) < 4) bad.push(`${from} -> ${to}`)
      }
    }
    expect(bad).toEqual([])
  }, 60_000)

  it('the ratchet fails on one edge added to the real graph (the synthetic violation)', async () => {
    const g = await realGraphOnce()
    const base = readBaseline()
    const withEdge = (from: string, to: string): Graph => new Map([...g, [from, [...(g.get(from) ?? []), to]]])
    // business/util.ts only reaches the kernel, so an import of it from a data file adds an upward edge and closes no cycle
    const up = compareLayers(withEdge('src/game/data/markets.ts', 'src/game/business/util.ts'), base)
    expect(up.map((v) => v.kind)).toEqual(['new-upward'])
    expect(up[0]!.edges).toEqual(['src/game/data/markets.ts -> src/game/business/util.ts'])
    const kernel = compareLayers(withEdge('src/game/core.ts', 'src/game/business/manage.ts'), base)
    expect(kernel.map((v) => v.kind)).toContain('kernel-upward')
    // a cycle across directories: close a loop between two domain files that nothing imports yet
    const loop = new Map(g)
    loop.set('src/game/zz-a/x.ts', ['src/game/zz-b/y.ts'])
    loop.set('src/game/zz-b/y.ts', ['src/game/zz-a/x.ts'])
    const cyc = compareLayers(loop, base)
    expect(cyc.map((v) => v.kind)).toEqual(['new-cycle-dir'])
    expect(cyc[0]!.edges).toHaveLength(2)
  }, 60_000)
})

describe('the baseline file', () => {
  const sorted = (xs: readonly string[]): boolean => xs.every((x, i) => i === 0 || xs[i - 1]! < x)

  it('is sorted, unique, made of edges between real modules, and holds no edge out of the kernel', async () => {
    const b = readBaseline()
    const g = await realGraphOnce()
    expect(b.v).toBe(1)
    for (const list of [b.upward, b.cycleDirEdges]) {
      expect(sorted(list)).toBe(true) // sorted and no repeats
      for (const edge of list) {
        const [from, to] = edge.split(' -> ')
        expect(edge).toMatch(/^src\/\S+ -> src\/\S+$/)
        expect(g.has(from!), edge).toBe(true)
        expect(g.has(to!), edge).toBe(true)
      }
    }
    for (const edge of b.upward) expect(layerOf(edge.split(' -> ')[0]!), edge).not.toBe(0)
    for (const edge of b.upward) {
      const [from, to] = edge.split(' -> ')
      expect(layerOf(to!), edge).toBeGreaterThan(layerOf(from!))
    }
    for (const edge of b.cycleDirEdges) {
      const [from, to] = edge.split(' -> ')
      expect(from!.slice(0, from!.lastIndexOf('/')), edge).not.toBe(to!.slice(0, to!.lastIndexOf('/')))
    }
  }, 60_000)

  it('holds a small upward list (a table that put many files wrong would write a long one)', () => {
    expect(readBaseline().upward.length).toBeLessThanOrEqual(150)
  })

  it('every cross-directory cycle edge in the baseline closes a real import path', async () => {
    const g = await realGraphOnce()
    for (const edge of readBaseline().cycleDirEdges) {
      const [from, to] = edge.split(' -> ')
      expect(g.get(from!), edge).toContain(to)
      expect(cyclePath(g, from!).length, edge).toBeGreaterThan(0)
    }
  }, 60_000)
})
