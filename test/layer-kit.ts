// R2-K3 (K.2a a): the layer table and the rules built on it, shared by test/layers.test.ts. A layer is a number from 0 (the
// kernel, which imports nothing above it) to 5 (the UI); layerOf gives every module of src/ one. Rule (b): an import may point to
// the importer's own layer or a lower one, never a higher one. Rule (e): an import cycle may live inside one directory, but no
// edge of a cycle may cross a directory (the 85-module cycle of v4.1.1 was made of such edges). Both rules start from today's
// graph, kept in test/layers-baseline.json, and the list may only shrink. The kernel is stricter still: an upward import that
// starts in layer 0 fails even when the baseline lists it, and the baseline can never take one.
//
// The graph comes from test/arch-kit.ts (R1); this file shares nothing else with it. Pure functions, nothing here touches the
// simulation. layerOf is the contract that R3 and later tracks code against: a new directory under src/game is a domain
// (layer 3) unless it needs a row below, and everything under src outside src/game that the table does not name is the shell
// (layer 5), so a new top-level directory outside the game is presentation by default.
import { cycleComponents, type Graph } from './arch-kit'

export type LayerId = 0 | 1 | 2 | 3 | 4 | 5
export const LAYER_NAMES = ['kernel', 'data', 'world', 'domains', 'assembly', 'ui'] as const

/** Root files of src/game (names without .ts) by layer. A file row names one exact file: `core-extra.ts` is not `core.ts`. */
const KERNEL_FILES: ReadonlySet<string> = new Set([
  'types',
  'rng',
  'core',
  'scripts',
  'talents',
  'assetHooks',
  'flags',
  'world-flags',
  'notice-weights',
  'timeMachine',
])
const ASSEMBLY_FILES: ReadonlySet<string> = new Set([
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
])
const WORLD_NATION_FILES: ReadonlySet<string> = new Set(['state', 'effects', 'trade-policy'])
const SHELL_FILES: ReadonlySet<string> = new Set(['src/App.tsx', 'src/main.tsx', 'src/boot.ts', 'src/settings.ts'])

/** Directories of src/game (every file below them, however deep) by layer. */
const KERNEL_DIRS: ReadonlySet<string> = new Set(['kernel'])
const ASSEMBLY_DIRS: ReadonlySet<string> = new Set(['modules', 'hubs'])
const WORLD_DIRS: ReadonlySet<string> = new Set(['economy', 'world'])
const DATA_DIRS: ReadonlySet<string> = new Set(['data', 'history', 'text'])

const GAME = 'src/game/'

/**
 * The layer of a module. `path` is root-relative with forward slashes ('src/game/core.ts'). The rows apply in this order and
 * the first match wins:
 *   L5 ui        src/ui/**, src/App.tsx, src/main.tsx, src/boot.ts, src/settings.ts
 *   L0 kernel    src/game/kernel/**, and the root files types, rng, core, scripts, talents, assetHooks, flags, world-flags,
 *                notice-weights, timeMachine
 *   L4 assembly  src/game/modules/**, src/game/hubs/**, and the root files aging, menus, life, save, save-schema, save-backends,
 *                save-quarantine, save-hydrate, save-store, snapshot-codec, offline, birth-background, life-series, inbox,
 *                notice-policy
 *   L2 world     src/game/economy/**, src/game/world/**, src/game/nation/state.ts, effects.ts and trade-policy.ts
 *   L1 data      src/game/data/**, src/game/world.ts, src/game/history/**, src/game/text/**
 *   L3 domains   everything else under src/game
 * Anything under src outside src/game that no row names is the shell (L5). A path outside src throws.
 */
export function layerOf(path: string): LayerId {
  if (!path.startsWith('src/')) throw new Error(`layerOf: ${path} is not under src/ (paths are root-relative with forward slashes)`)
  if (path.startsWith('src/ui/') || SHELL_FILES.has(path)) return 5
  if (!path.startsWith(GAME)) return 5
  const rest = path.slice(GAME.length)
  const slash = rest.indexOf('/')
  const dir = slash < 0 ? null : rest.slice(0, slash)
  const stem = dir === null && rest.endsWith('.ts') ? rest.slice(0, -3) : null
  if ((dir !== null && KERNEL_DIRS.has(dir)) || (stem !== null && KERNEL_FILES.has(stem))) return 0
  if ((dir !== null && ASSEMBLY_DIRS.has(dir)) || (stem !== null && ASSEMBLY_FILES.has(stem))) return 4
  if (dir !== null && WORLD_DIRS.has(dir)) return 2
  if (dir === 'nation' && rest.endsWith('.ts') && rest.indexOf('/', slash + 1) < 0 && WORLD_NATION_FILES.has(rest.slice(slash + 1, -3))) return 2
  if ((dir !== null && DATA_DIRS.has(dir)) || stem === 'world') return 1
  return 3
}

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

const edge = (from: string, to: string): string => `${from} -> ${to}`

const fromOf = (e: string): string => e.slice(0, e.indexOf(' -> '))

/** 'from -> to' for every runtime import whose target layer is above the importer's, sorted. */
export function upwardEdges(g: Graph): string[] {
  const out: string[] = []
  for (const [from, targets] of g) {
    const lf = layerOf(from)
    for (const to of targets) if (layerOf(to) > lf) out.push(edge(from, to))
  }
  return out.sort(byPath)
}

/** 'from -> to' for every edge inside an import cycle whose two files sit in different directories, sorted. */
export function cycleDirEdges(g: Graph): string[] {
  const home = new Map<string, number>()
  cycleComponents(g).forEach((comp, i) => comp.forEach((m) => home.set(m, i)))
  const out: string[] = []
  for (const [from, targets] of g) {
    const hf = home.get(from)
    if (hf === undefined) continue
    for (const to of targets) {
      if (home.get(to) === hf && dirOf(from) !== dirOf(to)) out.push(edge(from, to))
    }
  }
  return out.sort(byPath)
}

/**
 * What the ratchet remembers. `upward` and `cycleDirEdges` are sorted lists of 'from -> to'. `domains` and `eager` belong to the
 * rules R2-K4 adds (domain-pair counts, eager reads); this file keeps them as given.
 */
export interface LayerBaseline {
  v: 1
  upward: string[]
  cycleDirEdges: string[]
  domains?: Record<string, number>
  eager?: Record<string, string[]>
}

export interface LayerViolation {
  kind: 'new-upward' | 'new-cycle-dir' | 'stale-upward' | 'stale-cycle-dir' | 'kernel-upward'
  edges: string[]
  hint: string
}

const UPDATE_COMMAND = 'UPDATE_LAYER_BASELINE=1 npx vitest run --maxWorkers=1 test/layers.test.ts'
const SEAMS = 'import downward, move the shared value into a lower module, or register through a seam (registerModule, a port from kernel/ports.ts)'

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

/** The edges in `a` that are not in `b`, in `a`'s order. */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set(b)
  return a.filter((e) => !seen.has(e))
}

/**
 * Failures of the ratchet, worst first: an upward import that starts in the kernel (never allowed, listed or not), a new upward
 * import, a new cross-directory cycle edge, then the listed edges that are gone (so the baseline must shrink). One edge is
 * reported once: a kernel edge is not also counted as new.
 */
export function compareLayers(g: Graph, base: LayerBaseline): LayerViolation[] {
  const up = upwardEdges(g)
  const cyc = cycleDirEdges(g)
  const kernel = up.filter((e) => layerOf(fromOf(e)) === 0)
  const fresh = minus(minus(up, base.upward), kernel)
  const freshCyc = minus(cyc, base.cycleDirEdges)
  const goneUp = minus(base.upward, up)
  const goneCyc = minus(base.cycleDirEdges, cyc)

  const out: LayerViolation[] = []
  if (kernel.length > 0) {
    out.push({
      kind: 'kernel-upward',
      edges: kernel,
      hint: `${kernel.length} ${plural(kernel.length, 'import starts', 'imports start')} in the kernel (layer 0) and ${plural(kernel.length, 'points', 'point')} up. The kernel is a leaf: the baseline can't excuse it. Fix it: move the code up out of the kernel, or the import out of it.`,
    })
  }
  if (fresh.length > 0) {
    out.push({
      kind: 'new-upward',
      edges: fresh,
      hint: `${fresh.length} ${plural(fresh.length, 'import points', 'imports point')} up the layers (a module may import its own layer or a lower one). Fix it: ${SEAMS}.`,
    })
  }
  if (freshCyc.length > 0) {
    out.push({
      kind: 'new-cycle-dir',
      edges: freshCyc,
      hint: `${freshCyc.length} import cycle ${plural(freshCyc.length, 'edge crosses', 'edges cross')} a directory (a cycle may live inside one directory, never across two). Fix it: ${SEAMS}.`,
    })
  }
  if (goneUp.length > 0) {
    out.push({
      kind: 'stale-upward',
      edges: goneUp,
      hint: `${goneUp.length} baseline ${plural(goneUp.length, 'edge is', 'edges are')} no longer an upward import. The list may only shrink, so run ${UPDATE_COMMAND} and commit test/layers-baseline.json.`,
    })
  }
  if (goneCyc.length > 0) {
    out.push({
      kind: 'stale-cycle-dir',
      edges: goneCyc,
      hint: `${goneCyc.length} baseline ${plural(goneCyc.length, 'edge is', 'edges are')} no longer a cross-directory cycle edge. The list may only shrink, so run ${UPDATE_COMMAND} and commit test/layers-baseline.json.`,
    })
  }
  return out
}

/**
 * The baseline after edges went away: each list keeps the entries that are still current, in the baseline's order. The other
 * sections are kept as given. Throws, naming them, when the graph has an edge the baseline doesn't list, so a regenerate can
 * never hide a new violation. Does not change its input.
 */
export function shrinkLayers(g: Graph, base: LayerBaseline): LayerBaseline {
  const up = upwardEdges(g)
  const cyc = cycleDirEdges(g)
  const added = [...minus(up, base.upward).map((e) => `upward ${e}`), ...minus(cyc, base.cycleDirEdges).map((e) => `cycle-dir ${e}`)]
  if (added.length > 0) {
    throw new Error(`The layer baseline can't take a new edge. Fix the import instead: ${added.join('; ')}`)
  }
  const liveUp = new Set(up)
  const liveCyc = new Set(cyc)
  return {
    ...base,
    upward: base.upward.filter((e) => liveUp.has(e)),
    cycleDirEdges: base.cycleDirEdges.filter((e) => liveCyc.has(e)),
  }
}

/**
 * The one way a baseline may grow, for the day a branch built beside this one merges in (UPDATE_LAYER_BASELINE=rebase): the full
 * current sets, sorted, plus `added`, the entries that were not in `base`, written 'upward: from -> to' and 'cycle-dir: from -> to'
 * (the commit message lists them). An upward import that starts in the kernel is refused even here. The other sections are kept
 * as given. Does not change its input.
 */
export function rebaseLayers(g: Graph, base: LayerBaseline): { baseline: LayerBaseline; added: string[] } {
  const up = upwardEdges(g)
  const cyc = cycleDirEdges(g)
  const kernel = up.filter((e) => layerOf(fromOf(e)) === 0)
  if (kernel.length > 0) {
    throw new Error(`The kernel (layer 0) may not import upward, in a rebase either. Fix the import instead: ${kernel.join('; ')}`)
  }
  const added = [...minus(up, base.upward).map((e) => `upward: ${e}`), ...minus(cyc, base.cycleDirEdges).map((e) => `cycle-dir: ${e}`)]
  return { baseline: { ...base, upward: up, cycleDirEdges: cyc }, added }
}
