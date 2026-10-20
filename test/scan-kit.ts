// R1-P5 (X.G1): the scan kit. Lexer-based scans of src/ for the guard tests (foresight scan, money ratchet, ceiling
// list, and later R2's reasoned-call ratchet). It reads tokens, not text, so a call that is written inside a string, a
// template or a comment is never seen as a call. The lexer (scripts/voice/lexer.mjs) was checked against the real
// TypeScript parser and lexes the whole of src/ in well under a second.
//
// Limits, on purpose: the kit knows brackets and commas, not types. A comma inside type arguments
// (`f<A, B>(x)`) would split an argument list in the wrong place, and no guard here writes a call like that.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { K_ID, K_PUNCT, lex, type LexToken } from '../scripts/voice/lexer.mjs'

export { K_ID, K_NUM, K_PUNCT, K_STR, K_TMPL } from '../scripts/voice/lexer.mjs'

export type Tok = LexToken

export interface SourceFile {
  /** Repo-relative, posix separators, e.g. 'src/game/core.ts'. */
  path: string
  text: string
  toks: Tok[]
}

/** The repository root. */
export const ROOT: string = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** A source file from text, for synthetic fixtures. TSX is decided by the extension, as in loadSources. */
export function toSource(path: string, text: string): SourceFile {
  return { path, text, toks: lex(text, path.endsWith('.tsx')).toks }
}

/** Every .ts and .tsx file under `dir` (default 'src') of `root`, not .d.ts, sorted by path. Paths are relative to `root`. */
export function loadSources(root: string = ROOT, dir = 'src'): SourceFile[] {
  const paths: string[] = []
  const walk = (abs: string): void => {
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const next = join(abs, e.name)
      if (e.isDirectory()) walk(next)
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) paths.push(relative(root, next).split(sep).join('/'))
    }
  }
  walk(join(root, dir))
  paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return paths.map((path) => toSource(path, readFileSync(join(root, path), 'utf8')))
}

/** True when the token is an identifier (and has the text `v`, when given). */
export function isId(t: Tok | undefined, v?: string): boolean {
  return t !== undefined && t.k === K_ID && (v === undefined || t.v === v)
}

/** True when the token is punctuation with the text `v`. A string that happens to read "(" is not punctuation. */
export function isPunct(t: Tok | undefined, v: string): boolean {
  return t !== undefined && t.k === K_PUNCT && t.v === v
}

/** The index of the `)` that closes the `(` at toks[open], or -1 when toks[open] is not a `(` or the list never closes. */
export function closeParen(toks: readonly Tok[], open: number): number {
  if (!isPunct(toks[open], '(')) return -1
  let depth = 0
  for (let i = open; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k !== K_PUNCT) continue
    if (t.v === '(') depth++
    else if (t.v === ')' && --depth === 0) return i
  }
  return -1
}

/**
 * The arguments between toks[open] (the `(`) and toks[close] (its `)`), split at the commas that sit at the top level:
 * not inside (), [] or {}, and not inside a template's `${ }` hole. No arguments gives []; a trailing comma adds none.
 */
export function splitArgs(toks: readonly Tok[], open: number, close: number): Tok[][] {
  const args: Tok[][] = []
  let cur: Tok[] = []
  let depth = 0
  const base = toks[open]?.td ?? 0
  for (let i = open + 1; i < close; i++) {
    const t = toks[i]!
    if (t.k === K_PUNCT) {
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++
      else if (t.v === ')' || t.v === ']' || t.v === '}') depth--
      else if (t.v === ',' && depth === 0 && t.td === base) {
        args.push(cur)
        cur = []
        continue
      }
    }
    cur.push(t)
  }
  if (cur.length > 0) args.push(cur)
  return args
}

/** The 1-based line of a character offset: one more than the newlines before it. */
export function lineOf(text: string, offset: number): number {
  let line = 1
  const end = Math.min(offset, text.length)
  for (let i = text.indexOf('\n'); i >= 0 && i < end; i = text.indexOf('\n', i + 1)) line++
  return line
}
