// R2-K3 (K.2a a): the layer table and the rules built on it, shared by test/layers.test.ts. A layer is a number from 0 (the
// kernel, which imports nothing above it) to 5 (the UI); layerOf gives every module of src/ one. Rule (b): an import may point to
// the importer's own layer or a lower one, never a higher one. Rule (e): an import cycle may live inside one directory, but no
// edge of a cycle may cross a directory (the 85-module cycle of v4.1.1 was made of such edges). Both rules start from today's
// graph, kept in test/layers-baseline.json, and the list may only shrink. The kernel is stricter still: an upward import that
// starts in layer 0 fails even when the baseline lists it, and the baseline can never take one.
//
// R2-K4 added two more rules on the same footing. Rule (c): a domain (a directory of src/game, or the root files that belong to
// none) reaches another domain only through that domain's contract.ts, held to today's import counts per pair of domains. Rule
// (d): a module-level `const X = importedValue` runs while the module loads, so it is held to today's reads per file, and the
// ones in an import cycle (where the import may still be undefined) are called out. Both live in test/layers-baseline.json and
// can only shrink.
//
// The graph comes from test/arch-kit.ts (R1); this file shares nothing else with it. Pure functions, nothing here touches the
// simulation. layerOf is the contract that R3 and later tracks code against: a new directory under src/game is a domain
// (layer 3) unless it needs a row below, and everything under src outside src/game that the table does not name is the shell
// (layer 5), so a new top-level directory outside the game is presentation by default.
import { posix } from 'node:path'
import { cycleComponents, type Graph } from './arch-kit'
import { K_ID, K_PUNCT, K_STR, K_TMPL, isId, isPunct, type SourceFile, type Tok } from './scan-kit'

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
 * What the ratchet remembers. `upward` and `cycleDirEdges` are sorted lists of 'from -> to'. `domains` counts the imports from
 * one domain to another ('from->to' to a whole number, rule c). `eager` lists, per file, the module-level consts that read an
 * import while the module loads (rule d). A baseline may lack `domains` and `eager` (seedSections adds them on the first run).
 */
export interface LayerBaseline {
  v: 1
  upward: string[]
  cycleDirEdges: string[]
  domains?: Record<string, number>
  eager?: Record<string, string[]>
}

export interface LayerViolation {
  kind:
    | 'new-upward'
    | 'new-cycle-dir'
    | 'stale-upward'
    | 'stale-cycle-dir'
    | 'kernel-upward'
    | 'new-domain-pair'
    | 'more-domain-imports'
    | 'stale-domain-pair'
    | 'new-eager-read'
    | 'stale-eager-read'
  edges: string[]
  hint: string
}

const UPDATE_COMMAND = 'UPDATE_LAYER_BASELINE=1 npx vitest run --maxWorkers=1 test/layers.test.ts test/layers-domains.test.ts'
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

// ---------------------------------------------------------------------------------------------------------------------
// Rule (c): domains cross only through a contract
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The domain of a module, or null when it is not in layer 3. `dirs` is the set of directories that hold a module of src/game
 * (gameDirs). A module in a directory belongs to that directory ('src/game/business/manage.ts' is 'business'). A root file
 * belongs to the directory of its own name when there is one, because it is that directory's hub ('src/game/computer.ts' is
 * 'computer'); any other root file is 'life'.
 */
export function domainOf(path: string, dirs: ReadonlySet<string>): string | null {
  if (layerOf(path) !== 3) return null
  const rest = path.slice(GAME.length)
  const slash = rest.indexOf('/')
  if (slash >= 0) return rest.slice(0, slash)
  const stem = rest.replace(/\.tsx?$/, '')
  return dirs.has(stem) ? stem : 'life'
}

/** The directories (first path segment under src/game) that hold at least one module of the graph. */
export function gameDirs(g: Graph): Set<string> {
  const dirs = new Set<string>()
  for (const path of g.keys()) {
    if (!path.startsWith(GAME)) continue
    const rest = path.slice(GAME.length)
    const slash = rest.indexOf('/')
    if (slash > 0) dirs.add(rest.slice(0, slash))
  }
  return dirs
}

/** A file named contract.ts or contract.tsx, at any depth: the one door a domain offers the others. */
export function contractPath(path: string): boolean {
  return /(^|\/)contract\.tsx?$/.test(path)
}

/** Every import from one domain to another, as [pair, 'from -> to']: both modules in layer 3, a contract file as the target excluded. */
function crossDomainImports(g: Graph): [string, string][] {
  const dirs = gameDirs(g)
  const out: [string, string][] = []
  for (const [from, targets] of g) {
    const df = domainOf(from, dirs)
    if (df === null) continue
    for (const to of targets) {
      if (contractPath(to)) continue
      const dt = domainOf(to, dirs)
      if (dt !== null && dt !== df) out.push([`${df}->${dt}`, edge(from, to)])
    }
  }
  return out
}

/**
 * How many imports go from one domain to another, 'from->to' to a count, keys sorted. Only imports between two layer 3 modules
 * of different domains count, and an import of a contract file never does; imports into layers 0, 1 and 2, and imports made
 * by layers 4 and 5, are outside the rule.
 */
export function domainPairs(g: Graph): Record<string, number> {
  const counts = new Map<string, number>()
  for (const [pair] of crossDomainImports(g)) counts.set(pair, (counts.get(pair) ?? 0) + 1)
  return Object.fromEntries([...counts].sort(([a], [b]) => byPath(a, b)))
}

/** The imports behind one pair ('business->computer'), as 'from -> to', sorted: what to look at when the pair is over its count. */
export function domainEdges(g: Graph, pair: string): string[] {
  return crossDomainImports(g)
    .filter(([p]) => p === pair)
    .map(([, e]) => e)
    .sort(byPath)
}

const imports = (n: number): string => `${n} ${plural(n, 'import', 'imports')}`

/** The pairs of `now` that are new or above the baseline, written 'a->b (1 import)' and 'a->b (1 -> 2 imports)'. */
function domainGrowth(base: Readonly<Record<string, number>>, now: Readonly<Record<string, number>>): string[] {
  const out: string[] = []
  for (const [pair, n] of Object.entries(now)) {
    const was = base[pair]
    if (was === undefined) out.push(`${pair} (${imports(n)})`)
    else if (n > was) out.push(`${pair} (${was} -> ${imports(n)})`)
  }
  return out
}

/**
 * Failures of rule (c): a pair that has no count in the baseline, a count above it, and a count that fell (so the baseline must
 * shrink), in that order. A pair is written 'a->b (1 import)' (new), 'a->b (baseline 1, now 2)' (above) or the same shape (fell).
 */
export function compareDomains(g: Graph, base: Readonly<Record<string, number>>): LayerViolation[] {
  const now = domainPairs(g)
  const fresh: string[] = []
  const more: string[] = []
  const stale: string[] = []
  for (const [pair, n] of Object.entries(now)) {
    const was = base[pair]
    if (was === undefined) fresh.push(`${pair} (${imports(n)})`)
    else if (n > was) more.push(`${pair} (baseline ${was}, now ${n})`)
  }
  for (const [pair, was] of Object.entries(base)) {
    const n = now[pair] ?? 0
    if (n < was) stale.push(`${pair} (baseline ${was}, now ${n})`)
  }
  const fix = `go through the other domain's contract.ts (a port from kernel/ports.ts; an import of a contract file isn't counted), or register through a seam (registerModule)`
  const out: LayerViolation[] = []
  if (fresh.length > 0) {
    out.push({
      kind: 'new-domain-pair',
      edges: fresh,
      hint: `${fresh.length} ${plural(fresh.length, 'pair of domains has', 'pairs of domains have')} an import that the baseline doesn't list (a domain reaches another one only through its contract.ts). Fix it: ${fix}.`,
    })
  }
  if (more.length > 0) {
    out.push({
      kind: 'more-domain-imports',
      edges: more,
      hint: `${more.length} ${plural(more.length, 'pair of domains has', 'pairs of domains have')} more imports than the baseline allows. Fix it: ${fix}.`,
    })
  }
  if (stale.length > 0) {
    out.push({
      kind: 'stale-domain-pair',
      edges: stale,
      hint: `${stale.length} ${plural(stale.length, 'domain count is', 'domain counts are')} below the baseline. The list may only shrink, so run ${UPDATE_COMMAND} and commit test/layers-baseline.json.`,
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Rule (d): eager reads
// ---------------------------------------------------------------------------------------------------------------------

/** The module-level consts of one file that read an import from above layer 1 while the module loads. `hazard`: the file is in an import cycle. */
export interface EagerRead {
  file: string
  names: string[]
  hazard: boolean
}

// The scan is a heuristic over tokens, not a parser (the repo has no JS compiler API). It errs toward flagging: a false positive
// costs one baseline line, a miss costs a load-order crash nobody saw coming. Known limits, on purpose: no types (a name that is
// imported without `type` and used in a type position the scan doesn't recognise is read as a value), only the first declarator
// of `const a = 1, b = 2` is named, and a class body is not entered.
const OPEN = new Set(['(', '[', '{'])
const CLOSE = new Set([')', ']', '}'])
const DECLS = new Set(['const', 'let', 'var'])
/** Words whose parenthesis is a condition, not a parameter list, so a `{` after it is a block that runs in order. */
const BLOCK_WORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'await'])
/** Words that expect an operand next, so a line that ends in one goes on. */
const PREFIX_WORDS = new Set(['typeof', 'void', 'new', 'await', 'yield', 'delete', 'in', 'instanceof', 'of', 'extends', 'keyof', 'as', 'satisfies'])
/** Punctuation that can end an operand: a line that ends in anything else expects more. */
const OPERAND_END = new Set([')', ']', '}', '>', '++', '--', '!', ';'])
/** Tokens that carry an expression over a line break when they start the next line. */
const CONT_PUNCT = new Set(['.', '?.', '?', ':', '|', '&', ',', '>', '=>', '&&', '||', '??', '+', '-', '*', '/', '%', '**', '==', '===', '!=', '!==', '<=', '>=', '='])
const CONT_WORDS = new Set(['as', 'satisfies', 'in', 'instanceof', 'extends'])
/** Punctuation that may sit at the top level of a type (inside brackets anything goes). */
const TYPE_PUNCT = new Set(['|', '&', '.', '=>', '-'])
/** Punctuation that may sit inside the type arguments of a call. */
const TYPE_ARG_PUNCT = new Set([',', '.', '[', ']', '|', '&', '{', '}', '(', ')', '=>', '?', ':', ';', '-', '<', '>', '>>', '...'])

/** True when the token can be the last one of an operand, so a new line after it may start a new statement. */
function endsOperand(t: Tok | undefined): boolean {
  if (t === undefined) return false
  if (t.k === K_PUNCT) return OPERAND_END.has(t.v)
  if (t.k === K_ID) return !PREFIX_WORDS.has(t.v)
  return true
}

/**
 * Token k starts a line, at the top level of a statement: does the statement go on? The source has no semicolons, so this is
 * automatic semicolon insertion: it goes on when the line before ended in an operator (or a word that wants an operand), or when
 * this line starts with one of the tokens that can only continue an expression ( . ? : | & , as ...). A line that starts with
 * `(` or `[` starts a new statement, as the formatter keeps it.
 */
function continues(toks: readonly Tok[], k: number): boolean {
  if (!endsOperand(toks[k - 1])) return true
  const t = toks[k]!
  if (t.k === K_PUNCT) return CONT_PUNCT.has(t.v)
  if (t.k === K_ID) return CONT_WORDS.has(t.v)
  return false
}

/** The index of the bracket that closes the one at toks[open] (all three kinds count together), or `limit` when it never closes. */
function matchClose(toks: readonly Tok[], open: number, limit: number): number {
  let d = 0
  for (let k = open; k < limit; k++) {
    const t = toks[k]!
    if (t.k !== K_PUNCT) continue
    if (OPEN.has(t.v)) d++
    else if (CLOSE.has(t.v) && --d === 0) return k
  }
  return limit
}

/** Where the initializer that starts at `start` ends: a `;`, or the first line that does not continue, or a closing bracket that was never opened. */
function initializerEnd(toks: readonly Tok[], start: number): number {
  let d = 0
  for (let k = start; k < toks.length; k++) {
    const t = toks[k]!
    if (t.td > 0) continue
    if (d === 0 && t.nl && !continues(toks, k)) return k
    if (t.k !== K_PUNCT) continue
    if (OPEN.has(t.v)) d++
    else if (CLOSE.has(t.v)) {
      if (d === 0) return k
      d--
    } else if (d === 0 && t.v === ';') return k + 1
  }
  return toks.length
}

/** The end of a type that starts at `from` (after `as` or `satisfies`): the first token that cannot be part of it. */
function typeEnd(toks: readonly Tok[], from: number, end: number): number {
  let d = 0
  let ang = 0
  for (let k = from; k < end; k++) {
    const t = toks[k]!
    if (t.k === K_ID) {
      if (d === 0 && ang === 0 && (t.v === 'as' || t.v === 'satisfies' || t.v === 'in' || t.v === 'instanceof')) return k
      continue
    }
    if (t.k !== K_PUNCT) continue
    if (OPEN.has(t.v)) d++
    else if (CLOSE.has(t.v)) {
      if (d === 0) return k
      d--
    } else if (d > 0) continue
    else if (t.v === '<') ang++
    else if (t.v === '>') {
      if (ang === 0) return k
      ang--
    } else if (t.v === '>>') {
      if (ang < 2) return k
      ang -= 2
    } else if (ang === 0 && !TYPE_PUNCT.has(t.v)) return k
  }
  return end
}

/** `<` at toks[lt] opens the type arguments of a call (`make<A, B>(`, `new Map<K, V>(`): the index after the `>`, else `lt` (it is a comparison). */
function typeArgsEnd(toks: readonly Tok[], lt: number, end: number): number {
  const prev = toks[lt - 1]
  if (prev === undefined || prev.k !== K_ID || PREFIX_WORDS.has(prev.v) || toks[lt]!.nl) return lt
  let ang = 0
  for (let k = lt; k < end; k++) {
    const t = toks[k]!
    if (t.k !== K_PUNCT) continue
    if (t.v === '<') ang++
    else if (t.v === '>') ang--
    else if (t.v === '>>') ang -= 2
    else if (!TYPE_ARG_PUNCT.has(t.v)) return lt
    if (ang < 0) return lt
    if (ang === 0) {
      const next = toks[k + 1]
      return next !== undefined && (isPunct(next, '(') || next.k === K_TMPL) ? k + 1 : lt
    }
  }
  return lt
}

/**
 * toks[close] is a `)`: does it end the parameter list of an arrow function? Gives the index of that arrow's `=>`, or -1. The
 * `=>` follows at once (`(a, b) =>`) or after a return type (`(a): Type =>`), which may hold commas inside angle brackets.
 */
function arrowAfterParams(toks: readonly Tok[], close: number, end: number): number {
  const next = toks[close + 1]
  if (isPunct(next, '=>')) return close + 1
  if (!isPunct(next, ':')) return -1
  let d = 0
  let ang = 0
  for (let k = close + 2; k < end; k++) {
    const t = toks[k]!
    if (t.k !== K_PUNCT) continue
    if (OPEN.has(t.v)) d++
    else if (CLOSE.has(t.v)) {
      if (d === 0) return -1
      d--
    } else if (d > 0) continue
    else if (t.v === '<') ang++
    else if (t.v === '>') ang = Math.max(0, ang - 1)
    else if (t.v === '>>') ang = Math.max(0, ang - 2)
    else if (ang === 0) {
      if (t.v === '=>') return k
      if (t.v === ',' || t.v === ';' || t.v === '=') return -1
    }
  }
  return -1
}

/** The end of the body of the arrow whose `=>` is toks[arrow]: after its block, or at the comma, `:` of a conditional, `;`, line that doesn't continue, or closing bracket that ends its expression. */
function arrowEnd(toks: readonly Tok[], arrow: number, end: number): number {
  if (isPunct(toks[arrow + 1], '{')) return matchClose(toks, arrow + 1, end) + 1
  let d = 0
  let q = 0
  for (let k = arrow + 1; k < end; k++) {
    const t = toks[k]!
    if (t.td > toks[arrow]!.td) continue
    if (d === 0 && t.nl && !continues(toks, k)) return k // the next statement, when the arrow sits in a function body
    if (t.k !== K_PUNCT) continue
    if (OPEN.has(t.v)) d++
    else if (CLOSE.has(t.v)) {
      if (d === 0) return k
      d--
    } else if (d === 0) {
      if (t.v === ',' || t.v === ';') return k
      if (t.v === '?') q++
      else if (t.v === ':') {
        if (q === 0) return k
        q--
      }
    }
  }
  return end
}

/** The `{` that opens the body of the function expression that starts at toks[fn], or -1. */
function functionBody(toks: readonly Tok[], fn: number, end: number): number {
  let j = fn + 1
  while (j < end && !isPunct(toks[j], '(')) j++
  if (j >= end) return -1
  let b = matchClose(toks, j, end) + 1
  while (b < end && !isPunct(toks[b], '{')) b++
  return b < end ? b : -1
}

/**
 * A grouped function that is called at once, `(() => {...})()` or `(function () {...})()`: the token range of its body, which
 * runs now, or null when toks[from, to) holds no arrow or `function` at its top level.
 */
function iifeBody(toks: readonly Tok[], from: number, to: number): [number, number] | null {
  let d = 0
  for (let k = from; k < to; k++) {
    const t = toks[k]!
    if (t.k === K_PUNCT) {
      if (OPEN.has(t.v)) d++
      else if (CLOSE.has(t.v)) d--
      else if (d === 0 && t.v === '=>') return isPunct(toks[k + 1], '{') ? [k + 2, matchClose(toks, k + 1, to)] : [k + 1, to]
    } else if (d === 0 && isId(t, 'function')) {
      const body = functionBody(toks, k, to)
      return body < 0 ? null : [body + 1, matchClose(toks, body, to)]
    }
  }
  return null
}

/**
 * Does the initializer toks[start, end) read an imported name while it runs? Skipped, because they run later: the body of an
 * arrow (a block, or an expression up to its comma), the parameters of an arrow or method, a `function` body, a method body.
 * Skipped because they are not reads: `.name`, an object key, a type after `as` or `satisfies`, the type arguments of a call.
 * The body of a function that is called at once runs now, so it is read as if it were part of the initializer.
 */
function readsImport(toks: readonly Tok[], start: number, end: number, imported: ReadonlyMap<string, string>): boolean {
  for (let k = start; k < end; k++) {
    const t = toks[k]!
    if (t.k === K_PUNCT) {
      if (t.v === '(') {
        const close = matchClose(toks, k, end)
        if (close >= end) continue
        const prev = toks[k - 1]
        const condition = prev?.k === K_ID && BLOCK_WORDS.has(prev.v)
        const arrow = arrowAfterParams(toks, close, end)
        if (arrow >= 0) k = arrow - 1
        else if (isPunct(toks[close + 1], '{') && !condition) k = matchClose(toks, close + 1, end) // a method: its parameters and its body run later
        else if (isPunct(toks[close + 1], '(') && !endsOperand(prev)) {
          const body = iifeBody(toks, k + 1, close)
          if (body !== null) {
            if (readsImport(toks, body[0], body[1], imported)) return true
            k = close
          }
        }
      } else if (t.v === '=>') {
        k = arrowEnd(toks, k, end) - 1
      } else if (t.v === '<') {
        const after = typeArgsEnd(toks, k, end)
        if (after > k) k = after - 1
      }
      continue
    }
    if (t.k !== K_ID) continue
    if (t.v === 'function') {
      const body = functionBody(toks, k, end)
      if (body < 0) return false
      k = matchClose(toks, body, end)
      continue
    }
    if (t.v === 'as' || t.v === 'satisfies') {
      k = typeEnd(toks, k + 1, end) - 1
      continue
    }
    if (!imported.has(t.v)) continue
    const prev = toks[k - 1]
    if (isPunct(prev, '.') || isPunct(prev, '?.')) continue
    if (isPunct(toks[k + 1], ':') && (isPunct(prev, '{') || isPunct(prev, ','))) continue
    return true
  }
  return false
}

/** The names a declaration binds, from the tokens between `const` and `=`: `X`, `X: Type`, `{ a, b: c, d = 1, ...e }`, `[p, q]`. */
function bindingNames(toks: readonly Tok[], from: number, to: number): string[] {
  const first = toks[from]
  if (first === undefined || from >= to) return []
  if (first.k === K_ID) return [first.v]
  if (!isPunct(first, '{') && !isPunct(first, '[')) return []
  const close = matchClose(toks, from, to)
  const out: string[] = []
  let d = 0
  let skip = -1 // the level of a default value that is being skipped, or -1
  for (let k = from + 1; k < close; k++) {
    const t = toks[k]!
    if (t.k === K_PUNCT) {
      if (OPEN.has(t.v)) d++
      else if (CLOSE.has(t.v)) {
        d--
        if (skip > d) skip = -1
      } else if (t.v === ',' && d === skip) skip = -1
      else if (t.v === '=' && skip < 0) skip = d
      continue
    }
    if (skip >= 0 || t.k !== K_ID || isPunct(toks[k + 1], ':')) continue // a key, or the source of a rename
    out.push(t.v)
  }
  return out
}

/** The names a statement `const`, `let` or `var` at the top level of the file declares while reading an import: the declared names, in file order. */
function eagerNames(toks: readonly Tok[], imported: ReadonlyMap<string, string>): string[] {
  const out: string[] = []
  let depth = 0
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.td > 0) continue
    if (t.k === K_PUNCT) {
      if (OPEN.has(t.v)) depth++
      else if (CLOSE.has(t.v)) depth = Math.max(0, depth - 1)
      continue
    }
    if (depth !== 0 || t.k !== K_ID || !DECLS.has(t.v)) continue
    const prev = toks[i - 1]
    if (isId(prev, 'declare') || isId(prev, 'as') || isPunct(prev, '.') || isId(toks[i + 1], 'enum')) continue
    // The header runs to the first `=` outside brackets; a declaration with no initializer ends at a `;` or a new statement.
    let d = 0
    let eq = -1
    let k = i + 1
    for (; k < toks.length; k++) {
      const x = toks[k]!
      if (x.td > 0) continue
      if (d === 0 && k > i + 1 && x.nl && !continues(toks, k)) break
      if (x.k !== K_PUNCT) continue
      if (OPEN.has(x.v)) d++
      else if (CLOSE.has(x.v)) {
        if (d === 0) break
        d--
      } else if (d === 0 && x.v === ';') break
      else if (d === 0 && x.v === '=') {
        eq = k
        break
      }
    }
    if (eq < 0) {
      i = k - 1
      continue
    }
    const end = initializerEnd(toks, eq + 1)
    if (readsImport(toks, eq + 1, end, imported)) out.push(...bindingNames(toks, i + 1, eq))
    i = end - 1
  }
  return out
}

/** The module a relative import specifier points to, when the graph has it. */
function resolveSpec(from: string, spec: string, g: Graph): string | null {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null
  const base = posix.join(posix.dirname(from), spec)
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (g.has(c)) return c
  return null
}

/** The local names an import clause binds: `A`, `{ b, c as d, type E }`, `* as NS`, `A, { b }`. A `type` specifier binds no value. */
function clauseNames(toks: readonly Tok[], from: number, to: number): string[] {
  const names: string[] = []
  let j = from
  while (j < to) {
    const c = toks[j]!
    if (isPunct(c, '*')) {
      const local = toks[j + 2]
      if (isId(toks[j + 1], 'as') && local?.k === K_ID) names.push(local.v)
      j += 3
    } else if (isPunct(c, '{')) {
      j++
      while (j < to && !isPunct(toks[j], '}')) {
        const typeSpec = isId(toks[j], 'type') && toks[j + 1]?.k === K_ID && !isId(toks[j + 1], 'as')
        if (typeSpec) j++
        const name = toks[j]
        if (name?.k === K_ID) {
          const alias = isId(toks[j + 1], 'as') && toks[j + 2]?.k === K_ID
          if (!typeSpec) names.push(alias ? toks[j + 2]!.v : name.v)
          j += alias ? 3 : 1
        } else j++
        if (isPunct(toks[j], ',')) j++
      }
      j++
    } else {
      if (c.k === K_ID) names.push(c.v) // the default import
      j++
    }
  }
  return names
}

/**
 * The imports of one file that bind a value from a module above layer 1: local name to the module it comes from. A relative
 * import counts when the graph has an edge for it, which esbuild only keeps for an import that something uses as a value, so a
 * name that is only ever a type is not here. `import type` and `type` specifiers are never here.
 */
function importedNames(src: SourceFile, g: Graph): Map<string, string> {
  const out = new Map<string, string>()
  const toks = src.toks
  const runtime = new Set(g.get(src.path) ?? [])
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.td > 0 || !isId(t, 'import')) continue
    const n1 = toks[i + 1]
    if (n1 === undefined || n1.k === K_STR || isPunct(n1, '(') || isPunct(n1, '.')) continue // import 'x', import(), import.meta
    let from = -1
    for (let j = i + 1; j < toks.length && j < i + 400; j++) {
      if (isId(toks[j], 'from') && toks[j + 1]?.k === K_STR) {
        from = j
        break
      }
    }
    if (from < 0) continue
    const n2 = toks[i + 2]
    const typeOnly = isId(n1, 'type') && !isPunct(n2, ',') && !(isId(n2, 'from') && toks[i + 3]?.k === K_STR)
    const start = i + 1
    i = from + 1
    if (typeOnly) continue
    const target = resolveSpec(src.path, toks[from + 1]!.v, g)
    if (target === null || !runtime.has(target) || layerOf(target) <= 1) continue
    for (const name of clauseNames(toks, start, from)) out.set(name, target)
  }
  return out
}

/**
 * The module-level consts that read an import from above layer 1 while their module loads, by file, sorted. The scan is
 * described in the plan (R2-K4): it finds each top-level `const`, `let` or `var`, cuts the initializer at the end of the
 * statement (the source has no semicolons, so a line that doesn't continue ends it), skips what runs later (function bodies,
 * arrow bodies, parameters) and what is no read (`.name`, object keys, types), and asks whether an imported name is left.
 * A file in layer 4 or 5 that is in no import cycle is exempt: nothing can hold it half loaded. `hazard` marks a file in a
 * cycle, where the import may really be undefined at that moment.
 */
export function eagerReads(sources: readonly SourceFile[], g: Graph): EagerRead[] {
  const inCycle = new Set(cycleComponents(g).flat())
  const out: EagerRead[] = []
  for (const src of sources) {
    const hazard = inCycle.has(src.path)
    if (!hazard && layerOf(src.path) >= 4) continue
    const imported = importedNames(src, g)
    if (imported.size === 0) continue
    const names = [...new Set(eagerNames(src.toks, imported))].sort(byPath)
    if (names.length > 0) out.push({ file: src.path, names, hazard })
  }
  return out.sort((a, b) => byPath(a.file, b.file))
}

/** The eager section as the baseline stores it: file to its sorted names, files sorted. */
function eagerRecord(reads: readonly EagerRead[]): Record<string, string[]> {
  return Object.fromEntries(
    [...reads].sort((a, b) => byPath(a.file, b.file)).map((r) => [r.file, [...new Set(r.names)].sort(byPath)] as [string, string[]]),
  )
}

/** The reads that the baseline doesn't list, written 'file: NAME'. */
function eagerGrowth(base: Readonly<Record<string, readonly string[]>>, reads: readonly EagerRead[]): string[] {
  const out: string[] = []
  for (const r of reads) {
    const had = new Set(base[r.file] ?? [])
    for (const name of r.names) if (!had.has(name)) out.push(`${r.file}: ${name}`)
  }
  return out
}

/**
 * Failures of rule (d): a read the baseline doesn't list (the hint is sharper when the file is in an import cycle), then the
 * listed reads that are gone (so the baseline must shrink). Entries are written 'file: NAME'.
 */
export function compareEager(reads: readonly EagerRead[], base: Readonly<Record<string, readonly string[]>>): LayerViolation[] {
  const fresh = eagerGrowth(base, reads)
  const hazardous = reads.some((r) => r.hazard && eagerGrowth(base, [r]).length > 0)
  const live = new Map(reads.map((r) => [r.file, new Set(r.names)]))
  const stale: string[] = []
  for (const [file, names] of Object.entries(base)) {
    for (const name of names) if (!live.get(file)?.has(name)) stale.push(`${file}: ${name}`)
  }
  const out: LayerViolation[] = []
  if (fresh.length > 0) {
    const cycle = hazardous
      ? ' At least one of them is in a file that sits in an import cycle, so the import can still be undefined when the line runs, and the page fails to load.'
      : ''
    out.push({
      kind: 'new-eager-read',
      edges: fresh,
      hint: `${fresh.length} module-level ${plural(fresh.length, 'const reads', 'consts read')} an import while the module loads.${cycle} Fix it: read the import inside a function (const X = () => THING), or register through a seam (registerModule, a port from kernel/ports.ts).`,
    })
  }
  if (stale.length > 0) {
    out.push({
      kind: 'stale-eager-read',
      edges: stale,
      hint: `${stale.length} baseline ${plural(stale.length, 'read is', 'reads are')} no longer an eager read. The list may only shrink, so run ${UPDATE_COMMAND} and commit test/layers-baseline.json.`,
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// The baseline: shrink, seed, rebase
// ---------------------------------------------------------------------------------------------------------------------

/** The domain counts after some fell: a lowered count stays, a pair at 0 goes, the order of the baseline is kept. */
function shrinkDomains(base: Readonly<Record<string, number>>, now: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const pair of Object.keys(base)) {
    const n = now[pair] ?? 0
    if (n > 0) out[pair] = n
  }
  return out
}

/** The eager names after some left: a file with none left goes, the order of the baseline is kept. */
function shrinkEager(base: Readonly<Record<string, readonly string[]>>, reads: readonly EagerRead[]): Record<string, string[]> {
  const live = new Map(reads.map((r) => [r.file, new Set(r.names)]))
  const out: Record<string, string[]> = {}
  for (const [file, names] of Object.entries(base)) {
    const keep = names.filter((n) => live.get(file)?.has(n))
    if (keep.length > 0) out[file] = keep
  }
  return out
}

/**
 * The baseline after edges went away: each list keeps the entries that are still current, in the baseline's order; a domain
 * count that fell is lowered and a pair at 0 disappears; the eager names that left are dropped (when `reads` is handed in) and
 * a file with none left disappears. A section the baseline lacks stays absent (seedSections adds it), and the eager section is
 * kept as given when there are no `reads`. Throws, naming them, when the graph has an edge the baseline doesn't list, a domain
 * pair or count above it, or an eager name it doesn't list, so a regenerate can never hide a new violation. Does not change
 * its input.
 */
export function shrinkLayers(g: Graph, base: LayerBaseline, reads?: readonly EagerRead[]): LayerBaseline {
  const up = upwardEdges(g)
  const cyc = cycleDirEdges(g)
  const now = base.domains === undefined ? undefined : domainPairs(g)
  const added = [...minus(up, base.upward).map((e) => `upward ${e}`), ...minus(cyc, base.cycleDirEdges).map((e) => `cycle-dir ${e}`)]
  if (base.domains !== undefined && now !== undefined) added.push(...domainGrowth(base.domains, now).map((e) => `domain ${e}`))
  if (base.eager !== undefined && reads !== undefined) added.push(...eagerGrowth(base.eager, reads).map((e) => `eager ${e}`))
  if (added.length > 0) {
    throw new Error(`The layer baseline can't take anything new. Fix the code instead: ${added.join('; ')}`)
  }
  const liveUp = new Set(up)
  const liveCyc = new Set(cyc)
  const out: LayerBaseline = {
    ...base,
    upward: base.upward.filter((e) => liveUp.has(e)),
    cycleDirEdges: base.cycleDirEdges.filter((e) => liveCyc.has(e)),
  }
  if (base.domains !== undefined && now !== undefined) out.domains = shrinkDomains(base.domains, now)
  if (base.eager !== undefined && reads !== undefined) out.eager = shrinkEager(base.eager, reads)
  return out
}

/**
 * The first run: adds the `domains` section, and the `eager` section when `reads` is handed in, to a baseline that doesn't have
 * them yet, from today's graph. A section that exists is left exactly as it is. Does not change its input.
 */
export function seedSections(g: Graph, base: LayerBaseline, reads?: readonly EagerRead[]): LayerBaseline {
  const out: LayerBaseline = { ...base }
  if (out.domains === undefined) out.domains = domainPairs(g)
  if (out.eager === undefined && reads !== undefined) out.eager = eagerRecord(reads)
  return out
}

/**
 * The one way a baseline may grow, for the day a track that was built beside this one merges in (UPDATE_LAYER_BASELINE=rebase):
 * the full current sets, sorted, plus `added`, the entries that were not in `base`, written 'upward: from -> to', 'cycle-dir:
 * from -> to', 'domain: a->b (1 -> 2 imports)' and 'eager: file: NAME' (the commit message lists them). An upward import that
 * starts in the kernel is refused even here. The `domains` section is rebuilt when the baseline has it, and the `eager` section
 * when the baseline has it and `reads` is handed in; anything else is kept as given. Does not change its input.
 */
export function rebaseLayers(g: Graph, base: LayerBaseline, reads?: readonly EagerRead[]): { baseline: LayerBaseline; added: string[] } {
  const up = upwardEdges(g)
  const cyc = cycleDirEdges(g)
  const kernel = up.filter((e) => layerOf(fromOf(e)) === 0)
  if (kernel.length > 0) {
    throw new Error(`The kernel (layer 0) may not import upward, in a rebase either. Fix the import instead: ${kernel.join('; ')}`)
  }
  const added = [...minus(up, base.upward).map((e) => `upward: ${e}`), ...minus(cyc, base.cycleDirEdges).map((e) => `cycle-dir: ${e}`)]
  const baseline: LayerBaseline = { ...base, upward: up, cycleDirEdges: cyc }
  if (base.domains !== undefined) {
    const now = domainPairs(g)
    added.push(...domainGrowth(base.domains, now).map((e) => `domain: ${e}`))
    baseline.domains = now
  }
  if (base.eager !== undefined && reads !== undefined) {
    added.push(...eagerGrowth(base.eager, reads).map((e) => `eager: ${e}`))
    baseline.eager = eagerRecord(reads)
  }
  return { baseline, added }
}
