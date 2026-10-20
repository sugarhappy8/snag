// R1-A8: a small static-import scanner for test/lazy-zones.test.ts. It reads source as text (about 100 ms for all of
// src), so the lazy-chunk and zone rules run in the fast tier. Only what a bundler would have to follow counts:
// `import type` and `export type` are erased, and so is an import whose every name is `type X`. A dynamic import() with
// a string literal starts a chunk. Pure functions over files; nothing here writes.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'

/** The source with block comments and `//` comments blanked, so an import in a comment is not an import. */
function stripComments(source: string): string {
  return source
    .replace(/(^|[\s;{}(),])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

/** True for `type X`, `type { X }` and `{ type X, type Y }`: nothing there exists at run time. */
function typeOnly(clause: string): boolean {
  const c = clause.trim()
  if (/^type\s/.test(c)) return true
  const names = /^\{([\s\S]*)\}$/.exec(c)
  if (!names) return false
  const parts = names[1].split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length > 0 && parts.every((s) => /^type\s/.test(s))
}

/** The specifiers a module loads when it runs: `import x from`, `import '...'`, `export ... from`. */
export function staticSpecifiers(source: string): string[] {
  const text = stripComments(source)
  const out: string[] = []
  for (const m of text.matchAll(/^[ \t]*import\s*['"]([^'"\n]+)['"]/gm)) out.push(m[1])
  // The clause stops at a `;`, a quote, an `=` or a `(`, and never runs on into the next import or export line.
  const clause = /^[ \t]*(?:import|export)\b((?:(?!\n[ \t]*(?:import|export)\b)[^;'"=(])*?)\bfrom\s*['"]([^'"\n]+)['"]/gm
  for (const m of text.matchAll(clause)) {
    if (!typeOnly(m[1])) out.push(m[2])
  }
  return out
}

/**
 * The specifiers of `import('...')` calls with a string literal that run. The type-position forms, `typeof import('./x')`
 * and `import('./x').Name` (finance.ts and others use them), are erased by the compiler and start no chunk, so they are
 * skipped; `.then`, `.catch` and `.finally` mark a call that runs. Outside a zone, `import type` is still the way to
 * name a zone type; this only keeps a type written through import() from being mistaken for a chunk.
 */
export function dynamicSpecifiers(source: string): string[] {
  const call = /(?<!\btypeof\s+)\bimport\(\s*['"]([^'"\n]+)['"]\s*\)(?!\s*\.\s*(?!then\b|catch\b|finally\b)[A-Za-z_$])/g
  return [...stripComments(source).matchAll(call)].map((m) => m[1])
}

interface Scan {
  stamp: string
  statics: string[]
  dynamics: string[]
}

/** One parse per file and process (the checks of a test file all walk the same src); a changed size or mtime parses again. */
const scans = new Map<string, Scan>()

function scan(file: string): Scan {
  const info = statSync(file)
  const stamp = `${info.size}:${info.mtimeMs}`
  const kept = scans.get(file)
  if (kept && kept.stamp === stamp) return kept
  const source = readFileSync(file, 'utf8')
  const fresh = { stamp, statics: staticSpecifiers(source), dynamics: dynamicSpecifiers(source) }
  scans.set(file, fresh)
  return fresh
}

export function staticImports(file: string): string[] {
  return scan(file).statics
}

export function dynamicImports(file: string): string[] {
  return scan(file).dynamics
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * The module file a relative specifier names, as an absolute path, or null: a package, a stylesheet or other asset,
 * or a file that is not there. Tries the path as written (.ts, .tsx), a .js name for a .ts or .tsx file, the same
 * with .ts or .tsx added, and a directory's index.ts or index.tsx.
 */
export function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolvePath(dirname(from), spec)
  const bare = base.replace(/\.js$/, '')
  const candidates = [base, bare + '.ts', bare + '.tsx', base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')]
  return candidates.find((c) => /\.tsx?$/.test(c) && isFile(c)) ?? null
}

/** Every file reached by static imports from `entry`, mapped to the file that first reached it ('' for the entry). */
export function closure(entry: string): Map<string, string> {
  const reached = new Map<string, string>()
  if (!isFile(entry)) return reached
  reached.set(entry, '')
  const queue = [entry]
  for (let i = 0; i < queue.length; i++) {
    const file = queue[i]
    for (const spec of staticImports(file)) {
      const to = resolve(file, spec)
      if (to && !reached.has(to)) {
        reached.set(to, file)
        queue.push(to)
      }
    }
  }
  return reached
}

/** Every .ts and .tsx file under `dir`, as absolute paths, sorted. */
export function listSources(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(e.name)) out.push(full)
    }
  }
  walk(dir)
  return out.sort()
}
