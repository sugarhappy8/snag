// R1-P6 (A.K0): the scan of GameState.flags access for test/world-flags.test.ts. Pure: it takes SourceFile[] (from
// loadSources, or toSource for a synthetic fixture), reads tokens with test/scan-kit.ts, and never touches the disk.
//
// It looks at every identifier `flags` and sorts the use into one of five forms:
//
//   literal    flags.name   flags?.name   flags['name']   flags?.['name']   `flags[`name`]`   'name' in X.flags
//   resolved   flags[NAME]  where NAME is a string constant: declared in the same file, or imported from a file that
//              declares it (a name that is re-exported is looked up in every file, first declaration wins)
//   template   flags[`prefix.${x}`]   the text before the first hole is the prefix (a template that starts with a hole
//              has none and counts as dynamic)
//   dynamic    flags[expr] with any other expr: a parameter, a call, a concatenation
//   whole      any other mention: a spread, Object.keys(g.flags), an alias, an object key, a type
//
// Limits, on purpose: it knows tokens, not types, so a `flags` that is not GameState.flags is counted all the same
// (src/ has none today), and a key built in another function and passed in is dynamic. The two counts that cannot be
// resolved are ratcheted, not guessed.
import { posix } from 'node:path'
import { K_ID, K_PUNCT, K_STR, K_TMPL, isId, isPunct, type SourceFile, type Tok } from './scan-kit'

export interface FlagScan {
  /** Key -> the files that use it, in the order the files were given. */
  literal: Map<string, string[]>
  /** The same, for keys behind a string constant. */
  resolved: Map<string, string[]>
  /** Template prefix -> files. */
  templates: Map<string, string[]>
  /** File -> number of `flags[expr]` sites whose key cannot be resolved. */
  dynamic: Record<string, number>
  /** File -> number of whole-object uses of `flags`, aliases included. */
  whole: Record<string, number>
  /** A constant name a flags site uses whose declarations disagree: name -> 'file=value' for each. */
  ambiguous: Record<string, string[]>
}

interface Decl {
  file: string
  value: string
}

interface Import {
  /** The name in the module it comes from. */
  name: string
  /** The specifier as written. */
  from: string
}

/** `const NAME = 'text'` and `export const NAME = 'text'` (also `as const`), by name, in file order. */
function stringConsts(src: SourceFile): Map<string, Decl[]> {
  const out = new Map<string, Decl[]>()
  const { toks } = src
  for (let i = 0; i + 3 < toks.length; i++) {
    if (!isId(toks[i], 'const') || toks[i + 1]!.k !== K_ID || !isPunct(toks[i + 2], '=') || toks[i + 3]!.k !== K_STR) continue
    // The string must be the whole value: `const A = 'x' + y` or `const B = 'x' ? 1 : 2` is not a constant string.
    const next = toks[i + 4]
    const whole = next === undefined || next.nl || isPunct(next, ';') || isPunct(next, ',') || isPunct(next, ')') || isId(next, 'as')
    if (!whole) continue
    const name = toks[i + 1]!.v
    const list = out.get(name) ?? []
    list.push({ file: src.path, value: toks[i + 3]!.v })
    out.set(name, list)
  }
  return out
}

/** The names a file imports, by local name: `import { A, B as C, type D } from './m'`. */
function importsOf(src: SourceFile): Map<string, Import> {
  const out = new Map<string, Import>()
  const { toks } = src
  for (let i = 0; i < toks.length; i++) {
    if (!isId(toks[i], 'import') || isPunct(toks[i + 1], '(') || isPunct(toks[i + 1], '.')) continue
    let j = i + 1
    const entries: string[][] = []
    let cur: string[] = []
    let inBraces = false
    for (; j < toks.length && toks[j]!.k !== K_STR; j++) {
      const t = toks[j]!
      if (isPunct(t, '{')) inBraces = true
      else if (isPunct(t, '}')) {
        if (cur.length > 0) entries.push(cur)
        cur = []
        inBraces = false
      } else if (isPunct(t, ',')) {
        if (inBraces && cur.length > 0) entries.push(cur)
        if (inBraces) cur = []
      } else if (inBraces && t.k === K_ID) cur.push(t.v)
      if (t.k === K_PUNCT && t.v === ';') break
    }
    const spec = toks[j]
    if (spec === undefined || spec.k !== K_STR) continue
    for (const ids of entries) {
      const own = ids[0] === 'type' && ids.length > 1 && ids[1] !== 'as' ? ids.slice(1) : ids
      if (own.length >= 3 && own[1] === 'as') out.set(own[2]!, { name: own[0]!, from: spec.v })
      else if (own.length >= 1) out.set(own[0]!, { name: own[0]!, from: spec.v })
    }
    i = j
  }
  return out
}

/** The src file a relative specifier points at, or null (a package, or no such file). */
function resolveSpec(fromFile: string, spec: string, known: ReadonlyMap<string, unknown>): string | null {
  if (!spec.startsWith('.')) return null
  const base = posix.normalize(posix.join(posix.dirname(fromFile), spec))
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (known.has(candidate)) return candidate
  }
  return null
}

function push(map: Map<string, string[]>, key: string, file: string): void {
  const list = map.get(key)
  if (list === undefined) map.set(key, [file])
  else if (!list.includes(file)) list.push(file)
}

function bump(counts: Record<string, number>, file: string): void {
  counts[file] = (counts[file] ?? 0) + 1
}

/** True when `flags` at toks[i] is the right-hand side of `'key' in <chain>.flags`. Returns the key, or null. */
function inOperatorKey(toks: readonly Tok[], i: number): string | null {
  let k = i
  while (isPunct(toks[k - 1], '.') && toks[k - 2]?.k === K_ID) k -= 2
  const op = toks[k - 1]
  const key = toks[k - 2]
  return isId(op, 'in') && key !== undefined && key.k === K_STR ? key.v : null
}

export function scanFlags(files: readonly SourceFile[]): FlagScan {
  const scan: FlagScan = { literal: new Map(), resolved: new Map(), templates: new Map(), dynamic: {}, whole: {}, ambiguous: {} }
  const consts = new Map<string, Map<string, Decl[]>>()
  const all = new Map<string, Decl[]>()
  for (const f of files) {
    const own = stringConsts(f)
    consts.set(f.path, own)
    for (const [name, decls] of own) all.set(name, [...(all.get(name) ?? []), ...decls])
  }

  /** The declarations a flags site means by NAME, or null when no constant string has that name. */
  const declsFor = (file: string, name: string, imports: ReadonlyMap<string, Import>): Decl[] | null => {
    const mine = consts.get(file)?.get(name)
    if (mine !== undefined) return mine
    const imp = imports.get(name)
    if (imp === undefined) return null
    const target = resolveSpec(file, imp.from, consts)
    const there = target === null ? undefined : consts.get(target)?.get(imp.name)
    return there ?? all.get(imp.name) ?? null
  }

  for (const f of files) {
    const { toks } = f
    const imports = importsOf(f)
    for (let i = 0; i < toks.length; i++) {
      if (!isId(toks[i], 'flags')) continue
      const next = toks[i + 1]
      // flags.name, flags?.name
      if ((isPunct(next, '.') || isPunct(next, '?.')) && toks[i + 2]?.k === K_ID) {
        push(scan.literal, toks[i + 2]!.v, f.path)
        continue
      }
      // flags[...] and flags?.[...]
      const open = isPunct(next, '[') ? i + 2 : isPunct(next, '?.') && isPunct(toks[i + 2], '[') ? i + 3 : -1
      if (open >= 0) {
        const key = toks[open]!
        const after = toks[open + 1]
        if (key.k === K_STR && isPunct(after, ']')) {
          push(scan.literal, key.v, f.path)
        } else if (key.k === K_TMPL && (key.nExpr ?? 0) === 0 && key.v !== '') {
          push(scan.literal, key.v, f.path)
        } else if (key.k === K_TMPL && (key.nExpr ?? 0) > 0 && key.parts?.[0]) {
          push(scan.templates, key.parts[0], f.path)
        } else {
          const decls = key.k === K_ID && isPunct(after, ']') ? declsFor(f.path, key.v, imports) : null
          if (decls === null) {
            bump(scan.dynamic, f.path)
          } else {
            // The first declaration is the one meant; a disagreement is reported so a reviewer sees it.
            push(scan.resolved, decls[0]!.value, f.path)
            if (new Set(decls.map((d) => d.value)).size > 1) scan.ambiguous[key.v] = decls.map((d) => `${d.file}=${d.value}`)
          }
        }
        continue
      }
      const asked = inOperatorKey(toks, i)
      if (asked !== null) push(scan.literal, asked, f.path)
      else bump(scan.whole, f.path)
    }
  }
  return scan
}
