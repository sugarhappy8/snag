// R1-P4 (K.1): the import graph of src/ and the cycle ratchet's rules, shared by test/architecture.test.ts. The graph
// comes from one esbuild bundle over every module in src (about a quarter of a second). It follows static imports that
// run at load time: an `import type` is erased, an import used only as a type is erased, and a dynamic import() runs
// later, so none of them is an edge. Pure functions after readImportGraph; nothing here touches the simulation.
import { existsSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { build } from 'esbuild'

/** 'src/game/a.ts' -> the modules it imports at runtime (sorted, no repeats). Every target is also a key. */
export type Graph = ReadonlyMap<string, readonly string[]>

export interface ArchBaseline {
  v: 1
  components: string[][]
}

export interface Violation {
  kind: 'new-module' | 'merged' | 'stale'
  modules: string[]
  hint: string
}

const SEAMS = 'make the import type-only, move the shared value into a leaf module, or register through a seam (see registerModule in kernel/registry.ts, the old YEARLY_HOOKS, and registerFamily)'
const UPDATE_COMMAND = 'UPDATE_ARCH_BASELINE=1 npx vitest run --maxWorkers=1 test/architecture.test.ts'

/** The stdin entry only exists to pull every module into one bundle. esbuild keys it by this name, relative to wherever it runs. */
const ENTRY = '.arch-entry.ts'

function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function toPosix(path: string): string {
  return path.split('\\').join('/')
}

function isModule(path: string): boolean {
  return /\.tsx?$/.test(path) && !path.endsWith('.d.ts')
}

/** Every .ts and .tsx file under `dir`, as root-relative posix paths. */
function listModules(root: string, dir: string, out: string[]): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) listModules(root, full, out)
    else if (isModule(entry.name)) out.push(toPosix(relative(root, full)))
  }
  return out
}

/**
 * The runtime import graph. By default the modules are every .ts and .tsx file under `<root>/src` (not .d.ts); `files`
 * (paths relative to `root`, or absolute) replaces that list. A module reached by an import is a node even when it is
 * not listed. Packages, css and other assets are not nodes.
 */
export async function readImportGraph(root: string, files?: readonly string[]): Promise<Graph> {
  const listed = files
    ? files.map((f) => toPosix(isAbsolute(f) ? relative(root, f) : f))
    : listModules(root, join(root, 'src'), [])
  listed.sort(byPath)
  const graph = new Map<string, string[]>()
  if (listed.length === 0) return graph

  const tsconfig = join(root, 'tsconfig.json')
  const result = await build({
    stdin: {
      contents: listed.map((f) => `import ${JSON.stringify(toPosix(join(root, f)))}`).join('\n'),
      resolveDir: root,
      sourcefile: ENTRY,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
    packages: 'external',
    outdir: join(root, '.arch-out'), // never created: write is false
    loader: { '.css': 'empty' },
    ...(existsSync(tsconfig) ? { tsconfig } : {}),
    absWorkingDir: root,
  })

  const inputs = result.metafile.inputs
  const nodes = new Set<string>()
  for (const key of Object.keys(inputs)) {
    const path = toPosix(key)
    if (!path.endsWith(ENTRY) && path !== '<stdin>' && isModule(path)) nodes.add(path)
  }
  for (const key of [...nodes].sort(byPath)) graph.set(key, [])
  for (const [key, input] of Object.entries(inputs)) {
    const from = toPosix(key)
    if (!nodes.has(from)) continue
    const targets = new Set<string>()
    for (const imp of input.imports) {
      const to = toPosix(imp.path)
      if (imp.kind === 'import-statement' && !imp.external && nodes.has(to)) targets.add(to)
    }
    graph.set(from, [...targets].sort(byPath))
  }
  return graph
}

/**
 * The import cycles: strongly connected components with more than one module, or one module that imports itself.
 * Each component is sorted; the list runs largest first, then by first path.
 */
export function cycleComponents(g: Graph): string[][] {
  // Tarjan's algorithm with an explicit stack, so a long chain cannot overflow the call stack.
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []
  let counter = 0

  const open = (v: string, work: [string, number][]): void => {
    index.set(v, counter)
    low.set(v, counter)
    counter++
    stack.push(v)
    onStack.add(v)
    work.push([v, 0])
  }

  for (const start of g.keys()) {
    if (index.has(start)) continue
    const work: [string, number][] = []
    open(start, work)
    while (work.length > 0) {
      const frame = work[work.length - 1]!
      const v = frame[0]
      const next = g.get(v) ?? []
      if (frame[1] < next.length) {
        const w = next[frame[1]++]!
        if (!g.has(w)) continue
        if (!index.has(w)) open(w, work)
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!))
        continue
      }
      work.pop()
      const parent = work[work.length - 1]
      if (parent) low.set(parent[0], Math.min(low.get(parent[0])!, low.get(v)!))
      if (low.get(v) !== index.get(v)) continue
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        comp.push(w)
      } while (w !== v)
      if (comp.length > 1 || next.includes(v)) found.push(comp.sort(byPath))
    }
  }
  return found.sort((a, b) => b.length - a.length || byPath(a[0]!, b[0]!))
}

/** Failures of the ratchet, worst first: a module joined a cycle, cycles fused, a module left (so the list must shrink). */
export function compareToBaseline(current: readonly string[][], baseline: ArchBaseline): Violation[] {
  const home = new Map<string, number>()
  baseline.components.forEach((comp, i) => comp.forEach((m) => home.set(m, i)))

  const inCycle = new Set<string>()
  const fresh: string[] = []
  const fused: { modules: string[]; sizes: number[] }[] = []
  for (const comp of current) {
    const known = comp.filter((m) => home.has(m))
    for (const m of comp) {
      inCycle.add(m)
      if (!home.has(m)) fresh.push(m)
    }
    const parts = new Set(known.map((m) => home.get(m)!))
    if (parts.size > 1) {
      fused.push({ modules: known.sort(byPath), sizes: [...parts].map((i) => baseline.components[i]!.length).sort((a, b) => b - a) })
    }
  }

  const out: Violation[] = []
  if (fresh.length > 0) {
    out.push({
      kind: 'new-module',
      modules: fresh.sort(byPath),
      hint: `${fresh.length} module${fresh.length === 1 ? '' : 's'} joined an import cycle that the baseline doesn't allow. Fix it: ${SEAMS}.`,
    })
  }
  for (const f of fused) {
    out.push({
      kind: 'merged',
      modules: f.modules,
      hint: `${f.sizes.length} import cycles (${f.sizes.join(', ')} modules) are now one, though no module is new. Fix it: ${SEAMS}.`,
    })
  }
  const stale = [...home.keys()].filter((m) => !inCycle.has(m)).sort(byPath)
  if (stale.length > 0) {
    out.push({
      kind: 'stale',
      modules: stale,
      hint: `${stale.length} baseline module${stale.length === 1 ? ' is' : 's are'} no longer in a cycle. The list may only shrink, so run ${UPDATE_COMMAND} and commit test/architecture-baseline.json.`,
    })
  }
  return out
}

/**
 * The baseline after modules left the cycles: each baseline component keeps only the modules still in a cycle, in the
 * baseline's order, and a component that is empty goes. Throws when a current cycle holds a module the baseline doesn't,
 * so a regenerate can never hide a new cycle. The components keep the baseline's grouping, so a fusion is still a fusion.
 */
export function shrinkBaseline(current: readonly string[][], baseline: ArchBaseline): ArchBaseline {
  const known = new Set(baseline.components.flat())
  const live = new Set(current.flat())
  const added = [...live].filter((m) => !known.has(m)).sort(byPath)
  if (added.length > 0) {
    throw new Error(`The baseline can't take a new module into an import cycle. Fix the import instead: ${added.join(', ')}`)
  }
  return { v: 1, components: baseline.components.map((c) => c.filter((m) => live.has(m))).filter((c) => c.length > 0) }
}

/**
 * The baseline split into the current components (R2-K6): one entry per real cycle, in the order given (largest first, as
 * cycleComponents lists them), each sorted. R1's shrinkBaseline keeps the baseline's grouping, so a cut that splits a cycle in two
 * leaves the two halves in one baseline group, and a later import between them would pass as "the same cycle"; this writes the
 * halves apart, so joining them is a fusion again. Throws on a module the baseline doesn't hold, and on a cycle whose modules sit
 * in two baseline groups (a fusion), so a regenerate can never write a new cycle or hide a merge. Never changes its input.
 */
export function splitBaseline(current: readonly string[][], baseline: ArchBaseline): ArchBaseline {
  const home = new Map<string, number>()
  baseline.components.forEach((comp, i) => comp.forEach((m) => home.set(m, i)))
  const added = current.flat().filter((m) => !home.has(m)).sort(byPath)
  if (added.length > 0) {
    throw new Error(`The baseline can't take a new module into an import cycle. Fix the import instead: ${added.join(', ')}`)
  }
  for (const comp of current) {
    const parts = new Set(comp.map((m) => home.get(m)!))
    if (parts.size > 1) {
      throw new Error(`${parts.size} baseline cycles now fuse into one (${[...comp].sort(byPath).slice(0, 4).join(', ')} and others). Fix the import instead; a split never writes a fusion.`)
    }
  }
  return { v: 1, components: current.map((comp) => [...comp].sort(byPath)) }
}

/** One shortest import path from `from` back to itself ([from, ..., from]), or [] when `from` is not in a cycle. */
export function cyclePath(g: Graph, from: string): string[] {
  if (!g.has(from)) return []
  const before = new Map<string, string>()
  const seen = new Set<string>([from])
  const queue: string[] = [from]
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!
    for (const w of g.get(u) ?? []) {
      if (w === from) {
        const middle: string[] = []
        for (let c = u; c !== from; c = before.get(c)!) middle.push(c)
        return [from, ...middle.reverse(), from]
      }
      if (seen.has(w) || !g.has(w)) continue
      seen.add(w)
      before.set(w, u)
      queue.push(w)
    }
  }
  return []
}
