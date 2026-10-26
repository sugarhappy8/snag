#!/usr/bin/env node
// codemod-addrel.mjs - gives every relationship write a game argument (R4-E5, D.3, X22).
//
//   node scripts/codemod-addrel.mjs [--apply] [--list] [--root <dir>] [--only <path-substring>]
//
// v5.2.0 wrote a relationship as addRelationship(p, delta). R4 puts every write behind one door that also takes the game, so the
// Edge mirror can follow it (core.ts addRelationship(g, p, delta, kind?), kernel/relations.ts): this script turns
//
//   addRelationship(p, d)          into   addRelationship(g, p, d)
//   bumpRelationship(p, d)         into   bumpRelationship(g, p, d)       (events/wealth-core.ts; the four-argument one of
//                                                                           activities/common.ts is another function and stays)
//
// where `g` is whatever the enclosing function calls its GameState. It only inserts text: the argument list, the order of the
// arguments and every other character of the call stay as they were. The 43 raw writes (p.relationship = x) are not its business:
// each is turned into setRelationship(g, p, x) by hand.
//
//   default      a dry run: counts, and the sites it cannot place.
//   --list       also prints `path:line:col callee g` for every site it rewrites.
//   --apply      writes the changed files (one write per file) and prints their paths, one per line, on stdout.
//   --root dir   the tree to read (default: the repository this script is in). --only s: files whose path contains s.
//
// Idempotent: a call that already has a game argument (three arguments, or four for addRelationship) is left alone, so a second
// run changes nothing. Every open branch runs `node scripts/codemod-addrel.mjs --apply` once after R4-E5 merges, and `tsc` then
// finds any call of the old shape that is left.
//
// Exit codes: 0 ok, 1 when a site could not be placed (the others are still written with --apply), 2 bad usage. The sites it lists
// are placed by hand: a helper that has no game (add a parameter and pass it from its callers), a call outside any function. A call
// with a spread argument (`addRelationship(...a)`) is left as it is: its arity is not known to a reader of tokens, and tsc checks it.
//
// How `g` is found (the lexer gives tokens with offsets; nothing outside the inserted text is ever edited):
//  1. The innermost enclosing function (declaration, method, arrow, callback) with a parameter typed GameState gives its name.
//     A rest parameter, a tuple, an array or a function type never counts. A closer function that has a parameter of the same
//     name but another type shadows it, and the site is listed instead.
//  2. Failing that, the innermost enclosing function with a parameter called `g` and no type: a callback whose type comes from
//     its context (a defineScript answer, a menu action).
//  3. Failing that, a `const g`, `let g` or `var g` declared earlier in a block that contains the call (a test).
//
// A .mjs cannot import the .ts kit, and TypeScript 7 ships no JavaScript compiler API, so this reads tokens
// (scripts/voice/lexer.mjs, checked against the real parser) and knows brackets and commas, not types: `tsc` is the proof.
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { K_ID, K_PUNCT, lex } from './voice/lexer.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]+$/, '')
const CALLEES = new Set(['addRelationship', 'bumpRelationship'])
/** Words that can stand before `(` and a `{` without making the parenthesis a parameter list. */
const NOT_A_NAME = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'typeof', 'in', 'of', 'await', 'void', 'delete', 'new', 'throw', 'yield', 'case', 'else', 'do', 'instanceof'])
/** Words that start a statement: an expression body written without a semicolon ends before one of them on a new line. */
const STATEMENT_START = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'for', 'while', 'switch', 'throw', 'break', 'continue', 'export', 'import', 'class', 'type', 'interface', 'try', 'do', 'enum'])
const TYPE_PUNCT_BEFORE_BRACE = new Set([':', '|', '&', ',', '<', '(', '[', '='])

const isP = (t, v) => t !== undefined && t.k === K_PUNCT && t.v === v
const isI = (t, v) => t !== undefined && t.k === K_ID && (v === undefined || t.v === v)
const isOpen = (t) => t !== undefined && t.k === K_PUNCT && (t.v === '(' || t.v === '[' || t.v === '{')
const isClose = (t) => t !== undefined && t.k === K_PUNCT && (t.v === ')' || t.v === ']' || t.v === '}')

/** For every bracket token its partner's index (open and close alike); -1 for an unmatched one. */
function matchTable(toks) {
  const match = new Array(toks.length).fill(-1)
  const stack = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.k !== K_PUNCT) continue
    if (t.v === '(' || t.v === '[' || t.v === '{') stack.push(i)
    else if (t.v === ')' || t.v === ']' || t.v === '}') {
      const open = stack.pop()
      if (open === undefined) continue
      match[open] = i
      match[i] = open
    }
  }
  return match
}

/** The parameters inside the parenthesis at toks[open]..toks[close]: { name | null, typed, rest }. */
function parseParams(toks, open, close) {
  const params = []
  let from = open + 1
  let depth = 0
  let angle = 0
  let colon = false
  const flush = (to) => {
    if (to <= from) return
    let k = from
    let rest = false
    while (isI(toks[k]) && ['public', 'private', 'protected', 'readonly', 'override'].includes(toks[k].v) && isI(toks[k + 1])) k++
    if (isP(toks[k], '...')) {
      rest = true
      k++
    }
    const name = isI(toks[k]) ? toks[k].v : null
    let typed = false
    let annotated = false
    if (name !== null && !rest) {
      let c = k + 1
      if (isP(toks[c], '?')) c++
      if (isP(toks[c], ':')) {
        annotated = true
        let ok = false
        let plain = true
        for (let q = c + 1; q < to; q++) {
          const t = toks[q]
          if (isI(t, 'GameState')) ok = true
          else if (t.k === K_PUNCT && (t.v === '[' || t.v === '{' || t.v === '(' || t.v === '=>')) plain = false
          else if (isP(t, '=')) break
        }
        typed = ok && plain
      }
    }
    params.push({ name, typed, annotated, rest })
  }
  for (let k = open + 1; k < close; k++) {
    const t = toks[k]
    if (t.k !== K_PUNCT) continue
    if (t.v === '(' || t.v === '[' || t.v === '{') depth++
    else if (t.v === ')' || t.v === ']' || t.v === '}') depth--
    else if (depth === 0 && t.v === ':') colon = true
    else if (depth === 0 && colon && t.v === '<') angle++
    else if (depth === 0 && colon && t.v === '>' && angle > 0) angle--
    else if (depth === 0 && angle === 0 && t.v === ',') {
      flush(k)
      from = k + 1
      colon = false
    }
  }
  flush(close)
  return params
}

/** The index of the last token of an arrow function's expression body that starts at toks[start]. */
function expressionEnd(toks, match, start) {
  let k = start
  for (; k < toks.length; k++) {
    const t = toks[k]
    if (isOpen(t)) {
      if (match[k] < 0) return toks.length - 1
      k = match[k]
      continue
    }
    if (isClose(t)) return k - 1
    if (isP(t, ',') || isP(t, ';')) return k - 1
    if (t.nl && k > start && isI(t) && STATEMENT_START.has(t.v)) return k - 1
  }
  return toks.length - 1
}

/** Words that can stand right before a method's name. */
const BEFORE_NAME = new Set(['function', 'async', 'static', 'get', 'set', 'public', 'private', 'protected', 'readonly', 'override', 'abstract', 'export', 'default'])

/**
 * Is the parenthesis at toks[open] the parameter list of a function declaration, a function expression or a method, rather than
 * the arguments of a call (`cond ? pick(g, xs) : ys` is a call followed by a colon)? A name that follows `function`, a modifier or
 * a separator, or that starts a line, is a definition.
 */
function isHeader(toks, open) {
  const prev = toks[open - 1]
  if (isI(prev, 'function') || isP(prev, '>')) return true
  if (!isI(prev) || NOT_A_NAME.has(prev.v)) return false
  const before = toks[open - 2]
  return before === undefined || prev.nl || (isI(before) && BEFORE_NAME.has(before.v)) || isP(before, '*') || isP(before, '{') || isP(before, '}') || isP(before, ',') || isP(before, ';')
}

/** Every function-like thing of the file: { params, bodyStart, bodyEnd } (token indexes, the body inclusive). */
function functionScopes(toks, match) {
  const scopes = []
  const bodyOf = (bodyStart) => (isP(toks[bodyStart], '{') && match[bodyStart] >= 0 ? match[bodyStart] : expressionEnd(toks, match, bodyStart))
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (isP(t, '=>')) {
      // `x => body`, `async x => body`; the parenthesised form is found from its `(` below.
      const prev = toks[i - 1]
      if (isI(prev) && !NOT_A_NAME.has(prev.v)) scopes.push({ params: [{ name: prev.v, typed: false, annotated: false, rest: false }], bodyStart: i + 1, bodyEnd: bodyOf(i + 1) })
      continue
    }
    if (!isP(t, '(') || match[i] < 0) continue
    const close = match[i]
    const prev = toks[i - 1]
    const header = isHeader(toks, i)
    // An arrow's `(` follows `=`, `,`, `(`, `:`, `?`, `return` or `async`, never the name of a call.
    const arrowOk = !(isI(prev) && !NOT_A_NAME.has(prev.v) && prev.v !== 'async') && !isP(prev, ')') && !isP(prev, ']')
    const next = toks[close + 1]
    let bodyStart = -1
    if (isP(next, '=>')) bodyStart = close + 2
    else if (isP(next, '{') && header) bodyStart = close + 1
    else if (isP(next, ':') && (header || arrowOk)) {
      // A return type: `(g: GameState): Person[] => ...` or `function f(g): T {`. Walk it, skipping bracketed parts; a `{` after
      // a type punctuation is an object type and is stepped over; the first other `{` is the body.
      for (let k = close + 2; k < toks.length; k++) {
        const u = toks[k]
        if (isP(u, '=>')) {
          if (arrowOk) bodyStart = k + 1
          break
        }
        if (isP(u, '{')) {
          if (match[k] < 0) break
          if (TYPE_PUNCT_BEFORE_BRACE.has(toks[k - 1].v) && toks[k - 1].k === K_PUNCT) {
            k = match[k]
            continue
          }
          if (header) bodyStart = k
          break
        }
        if (isOpen(u)) {
          if (match[k] < 0) break
          k = match[k]
          continue
        }
        if (isClose(u) || isP(u, ';') || isP(u, ',') || isP(u, '=') || (u.nl && isI(u) && STATEMENT_START.has(u.v))) break
      }
    }
    if (bodyStart < 0 || bodyStart >= toks.length) continue
    scopes.push({ params: parseParams(toks, i, close), bodyStart, bodyEnd: bodyOf(bodyStart) })
  }
  return scopes
}

/** Does toks[d] declare `g`: `const g`, `let g`, `var g`, or `g` inside `const { ... }`? */
function declaresG(toks, d) {
  if (!isI(toks[d], 'g')) return false
  if (isI(toks[d - 1], 'const') || isI(toks[d - 1], 'let') || isI(toks[d - 1], 'var')) return true
  if (!(isP(toks[d - 1], '{') || isP(toks[d - 1], ',')) || !(isP(toks[d + 1], '}') || isP(toks[d + 1], ','))) return false
  let depth = 0
  for (let k = d - 1; k >= 0; k--) {
    if (isP(toks[k], '}')) depth++
    else if (isP(toks[k], '{')) {
      if (depth === 0) return isI(toks[k - 1], 'const') || isI(toks[k - 1], 'let') || isI(toks[k - 1], 'var')
      depth--
    }
  }
  return false
}

/** The nearest declaration of `g` before toks[at] in a block that also holds toks[at], or -1. */
function localGame(toks, match, at) {
  for (let d = at - 1; d >= 1; d--) {
    if (!declaresG(toks, d)) continue
    // The block that holds the declaration: walk back to the `{` that is not closed before d (for `const { g } = c`, from before
    // the pattern's own brace).
    let from = d - 1
    if (!(isI(toks[d - 1], 'const') || isI(toks[d - 1], 'let') || isI(toks[d - 1], 'var'))) {
      let nest = 0
      for (let k = d - 1; k >= 0; k--) {
        if (isP(toks[k], '}')) nest++
        else if (isP(toks[k], '{')) {
          if (nest === 0) {
            from = k - 1
            break
          }
          nest--
        }
      }
    }
    let depth = 0
    let open = -1
    for (let k = from; k >= 0; k--) {
      const u = toks[k]
      if (isP(u, '}')) depth++
      else if (isP(u, '{')) {
        if (depth === 0) {
          open = k
          break
        }
        depth--
      }
    }
    if (open < 0 || (match[open] >= 0 && match[open] > at)) return d
  }
  return -1
}

/** The name of the game at toks[at], or { reason } when it cannot be told. */
function gameAt(toks, match, scopes, at) {
  const around = scopes.filter((s) => s.bodyStart <= at && at <= s.bodyEnd).sort((a, b) => b.bodyStart - a.bodyStart)
  for (let n = 0; n < around.length; n++) {
    const typed = around[n].params.find((p) => p.typed && p.name !== null)
    if (typed === undefined) continue
    // A closer parameter of the same name and another declared type hides the game. One with no type at all is a callback whose
    // type comes from its context (run: (g, q) => ...), and is the live game under the same name.
    const shadow = around.slice(0, n).some((s) => s.params.some((p) => p.name === typed.name && p.annotated))
    return shadow ? { reason: `${typed.name} is shadowed by a closer parameter` } : { g: typed.name }
  }
  for (const s of around) if (s.params.some((p) => p.name === 'g' && !p.typed && !p.rest)) return { g: 'g' }
  if (localGame(toks, match, at) >= 0) return { g: 'g' }
  return { reason: around.length === 0 ? 'outside any function' : 'no game in scope' }
}

/** 1-based line and column of an offset. */
function lineCol(src, offset) {
  let line = 1
  let last = -1
  for (let i = src.indexOf('\n'); i >= 0 && i < offset; i = src.indexOf('\n', i + 1)) {
    line++
    last = i
  }
  return { line, col: offset - last }
}

/** Number of top-level arguments of the call whose parentheses are toks[open] and toks[close]; null when one is a spread. */
function countArgs(toks, open, close) {
  if (close === open + 1) return 0
  let depth = 0
  let n = 1
  let spread = false
  for (let k = open + 1; k < close; k++) {
    const t = toks[k]
    if (t.k !== K_PUNCT) continue
    if (t.v === '(' || t.v === '[' || t.v === '{') depth++
    else if (t.v === ')' || t.v === ']' || t.v === '}') depth--
    else if (depth === 0 && t.v === ',') {
      if (k === close - 1) break // a trailing comma adds no argument
      n++
    } else if (depth === 0 && t.v === '...') spread = true
  }
  return spread ? null : n
}

/**
 * Pure. Reads one file and returns the rewritten text, one entry per call of addRelationship or bumpRelationship, and whether
 * anything changed. `path` is repo-relative with forward slashes; it only names the sites.
 * Site actions: 'rewrite' (g inserted), 'keep' (already has its game argument, the four-argument bumpRelationship, or a spread),
 * 'unplaced' (reason says why; the text is not touched there).
 */
export function rewrite(path, source) {
  const { toks } = lex(source, path.endsWith('.tsx'))
  const match = matchTable(toks)
  const scopes = functionScopes(toks, match)
  const sites = []
  const edits = []
  for (let i = 0; i + 1 < toks.length; i++) {
    const t = toks[i]
    if (t.k !== K_ID || !CALLEES.has(t.v) || !isP(toks[i + 1], '(') || match[i + 1] < 0) continue
    const prev = toks[i - 1]
    if (isP(prev, '.') || isP(prev, '?.') || isI(prev, 'function')) continue // a method of something else, or a definition
    const open = i + 1
    const close = match[open]
    const { line, col } = lineCol(source, t.p)
    const site = { file: path, line, col, callee: t.v, action: 'keep' }
    sites.push(site)
    const args = countArgs(toks, open, close)
    if (args === null) {
      site.reason = 'a spread argument, left to tsc' // its arity is unknown here; the tuple or the signature says whether it is right
      continue
    }
    if (args >= 3) continue
    if (args !== 2) {
      site.action = 'unplaced'
      site.reason = `${args} argument${args === 1 ? '' : 's'}`
      continue
    }
    const where = gameAt(toks, match, scopes, i)
    if (where.g === undefined) {
      site.action = 'unplaced'
      site.reason = where.reason
      continue
    }
    site.action = 'rewrite'
    site.g = where.g
    edits.push({ at: toks[open + 1].p, text: `${where.g}, ` })
  }
  let text = source
  for (const e of edits.sort((a, b) => b.at - a.at)) text = text.slice(0, e.at) + e.text + text.slice(e.at)
  return { text, changed: edits.length > 0, sites }
}

/** Every .ts and .tsx file under `dir` of `root`, not .d.ts, as root-relative posix paths, sorted. */
function sourceFiles(root, dir) {
  const out = []
  const walk = (abs) => {
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const next = join(abs, e.name)
      if (e.isDirectory()) walk(next)
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(relative(root, next).split(sep).join('/'))
    }
  }
  walk(join(root, dir))
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Runs the codemod over `src` and `test` of `root`. Returns the sites and the files it wrote (empty unless `apply`). */
export function run(root, opts = {}) {
  const sites = []
  const written = []
  for (const dir of ['src', 'test']) {
    for (const path of sourceFiles(root, dir)) {
      if (opts.only !== undefined && !path.includes(opts.only)) continue
      const source = readFileSync(join(root, path), 'utf8')
      if (!/addRelationship|bumpRelationship/.test(source)) continue
      const r = rewrite(path, source)
      sites.push(...r.sites)
      if (r.changed && opts.apply) {
        writeFileSync(join(root, path), r.text)
        written.push(path)
      }
    }
  }
  return { sites, written }
}

function main(argv) {
  const opts = { apply: false, list: false, root: resolve(HERE, '..'), only: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') opts.apply = true
    else if (a === '--list') opts.list = true
    else if (a === '--root' && argv[i + 1] !== undefined) opts.root = resolve(argv[++i])
    else if (a === '--only' && argv[i + 1] !== undefined) opts.only = argv[++i]
    else {
      process.stderr.write(`codemod-addrel: unknown argument ${a}\nusage: node scripts/codemod-addrel.mjs [--apply] [--list] [--root <dir>] [--only <path-substring>]\n`)
      return 2
    }
  }
  const { sites, written } = run(opts.root, opts)
  const count = (action) => sites.filter((s) => s.action === action).length
  const files = new Set(sites.filter((s) => s.action === 'rewrite').map((s) => s.file))
  if (opts.list) for (const s of sites) if (s.action === 'rewrite') process.stdout.write(`${s.file}:${s.line}:${s.col} ${s.callee} ${s.g}\n`)
  for (const p of written) process.stdout.write(`${p}\n`)
  const unplaced = sites.filter((s) => s.action === 'unplaced')
  for (const s of unplaced) process.stderr.write(`cannot place: ${s.file}:${s.line}:${s.col} ${s.callee} (${s.reason})\n`)
  process.stderr.write(
    `codemod-addrel: ${count('rewrite')} calls ${opts.apply ? 'rewritten' : 'to rewrite'} in ${files.size} files, ${count('keep')} already have their game argument, ${unplaced.length} cannot be placed${opts.apply ? '' : ' (dry run: --apply writes)'}\n`,
  )
  return unplaced.length > 0 ? 1 : 0
}

const isMain = (() => {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (isMain) process.exitCode = main(process.argv.slice(2))
