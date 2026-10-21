#!/usr/bin/env node
// codemod-pickline.mjs - moves prose pools from pick to the text kit (R2-A2, E.T3).
//
//   node scripts/codemod-pickline.mjs [--apply] [--list] [--helpers] [--report <file.json>] [--root <dir>] [--only <path-substring>]
//
// A prose pool is an array of strings that read as sentences. pick(g, [...]) draws one line at random and repeats itself;
// pickLine(g, [...]) draws the same one number from g.rng and then skips the lines it said lately (src/game/text/pick.ts).
// A pool whose lines carry ${} holes has new text for every value of the holes, so it is written pickSite(g, [...], 0x1234abcd):
// the number names the pool in the text memory and never changes (the FNV of the file path and the array's own text).
//
//   default      a dry run: counts per action and per reason a call stays, and the receivers of the held-back sites.
//   --list       also prints `path:line:col action key id line-of-code` for every converted site (key: the pickSite number or `-`;
//                id: what a skip entry names, 's' + 8 hex digits or 'const:NAME').
//   --helpers    prints `path:line callee receiver pool` for every eraPick and v call whose pool is an array or a name: the
//                input of the helper review in R2-A3 (the codemod never edits those two helpers' call sites).
//   --apply      writes the changed files (one write per file) and prints their paths, one per line, on stdout.
//   --report f   writes everything (sites, helper sites, stale skip entries) as JSON.
//   --root dir   the tree to read (default: the repository this script is in). --only s: files whose path contains s.
//
// Exit codes: 0 ok, 2 bad usage. The skip list is <root>/scripts/codemod-pickline-skip.json when there is one, else the one next
// to this script: `{ "v": 1, "skip": [{ "file", "site", "reason" }] }`, the sites that must stay pick (identity strings).
//
// The rules (the lexer gives tokens, with offsets; nothing outside a token's range is ever edited):
//  1. A call is `pick` `(` IDENT `,` not after a `.`, in a file that imports `pick` (not `pick as x`) from a specifier ending
//     in /rng and has no `pick` of its own. IDENT is the state variable, whatever it is called: the rng import already makes
//     it a GameState and tsc checks it.
//  2. Exactly two arguments; the second is an array literal of strings and templates (a trailing `as const` is fine) or the name of
//     a module-level `const NAME = [...]` of the same kind.
//  3. Prose: at least one element's static text has whitespace. Names, kinds and ids (single words) stay pick.
//  4. Identity: the call is assigned to a receiver in IDENTITY_RECEIVERS (`p.firstName = pick(...)`, `title: pick(...)`).
//  4b. Decision: the result is compared, switched on, used as an index, or searched in (a bag of lines is a rotation, not a
//     dice roll, and code that branches on the outcome would change).
//  5. An inline array without holes, and every module array, becomes pickLine; an inline array with a hole becomes pickSite.
//  6. The new names are imported on a new line after the rng import; `pick` leaves that import when nothing else uses it.
//  7. A skip-list site stays; a skip entry that matches no site is stale.
//  8. The rewrite is idempotent.
//
// Dependency-free Node ESM: Node builtins and scripts/voice/lexer.mjs only (a .mjs cannot import the .ts kit, so fnv1a is
// copied from src/game/text/hash.ts; test/r2-codemod.test.ts pins that the two agree).
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { K_ID, K_NUM, K_PUNCT, K_STR, K_TMPL, lex } from './voice/lexer.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]+$/, '')
const SKIP_FILE = 'scripts/codemod-pickline-skip.json'
const DEFAULT_TEXT_MODULE = 'src/game/text/pick'

/** The names a result is stored under when it is an identity (what a thing is called), not prose. */
export const IDENTITY_RECEIVERS = Object.freeze([
  'name', 'firstName', 'lastName', 'company', 'brand', 'city', 'job', 'occupation', 'title', 'venue', 'team', 'org', 'client',
  'lender', 'injury', 'disease', 'crime', 'school', 'product', 'celeb', 'curse', 'std', 'condition',
])
const IDENTITY = new Set(IDENTITY_RECEIVERS)

// ---------------------------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------------------------

/** 32-bit FNV-1a of the UTF-16 code units, unsigned. A copy of fnv1a in src/game/text/hash.ts. */
function fnv1a(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function siteId(path, raw) {
  return fnv1a(path + '\u001f' + raw).toString(16).padStart(8, '0')
}

export function siteKey(path, raw) {
  return fnv1a(path + '\u001f' + raw)
}

export function relativeImport(fromFile, toModule) {
  const to = toModule.replace(/\\/g, '/').replace(/\.(?:[mc]?[jt]sx?)$/, '')
  const rel = posix.relative(posix.dirname(fromFile.replace(/\\/g, '/')), to)
  return rel.startsWith('.') ? rel : './' + rel
}

const isP = (t, v) => t !== undefined && t.k === K_PUNCT && t.v === v
const isI = (t, v) => t !== undefined && t.k === K_ID && (v === undefined || t.v === v)
/** The `.` or `?.` of a member access. */
const isMember = (t) => isP(t, '.') || isP(t, '?.')
const isDeclKw = (t) => isI(t) && (t.v === 'const' || t.v === 'let' || t.v === 'var')
const hex8 = (n) => n.toString(16).padStart(8, '0')

/** The index of the token that closes the bracket at toks[i], or -1. Counts only brackets of the same kind. */
function matchClose(toks, i) {
  const open = toks[i].v
  const close = open === '(' ? ')' : open === '[' ? ']' : '}'
  let depth = 0
  for (let k = i; k < toks.length; k++) {
    const t = toks[k]
    if (t.k !== K_PUNCT) continue
    if (t.v === open) depth++
    else if (t.v === close && --depth === 0) return k
  }
  return -1
}

/** The arguments of the call whose parentheses are toks[open] and toks[close], as [from, to) token ranges. A trailing comma adds none. */
function splitArgs(toks, open, close) {
  const args = []
  const base = toks[open].td
  let from = open + 1
  let depth = 0
  for (let k = open + 1; k < close; k++) {
    const t = toks[k]
    if (t.k !== K_PUNCT) continue
    if (t.v === '(' || t.v === '[' || t.v === '{') depth++
    else if (t.v === ')' || t.v === ']' || t.v === '}') depth--
    else if (t.v === ',' && depth === 0 && t.td === base) {
      args.push([from, k])
      from = k + 1
    }
  }
  if (from < close) args.push([from, close])
  return args
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

/** The static text of a string or template token: the value of a string, the parts of a template joined. */
const staticText = (t) => (t.k === K_TMPL ? t.parts.join('') : t.v)

/**
 * The elements of the array whose `[` is toks[open]: ok when every top-level element is exactly one string or template token
 * (anything else, a spread, a name, an object, a call, a concatenation, makes ok false). `close` is the index of the `]`.
 */
function arrayElems(toks, open) {
  const close = matchClose(toks, open)
  if (close < 0) return null
  const elems = []
  let ok = true
  let want = true
  for (let k = open + 1; k < close; ) {
    const t = toks[k]
    if (want && (t.k === K_STR || t.k === K_TMPL)) {
      elems.push(t)
      want = false
      k++
      // The tokens of a template's holes come after it, inside its range.
      while (k < close && toks[k].p < t.e) k++
    } else if (!want && isP(t, ',')) {
      want = true
      k++
    } else {
      ok = false
      break
    }
  }
  const prose = elems.some((t) => /\s/.test(staticText(t)))
  const holes = elems.some((t) => t.k === K_TMPL && t.nExpr > 0)
  return { close, elems, ok: ok && elems.length > 0, prose, holes }
}

/** What follows the `]` at toks[close] up to the token toks[last] (inclusive): nothing, or `as const`. */
function tailIsAsConst(toks, close, last) {
  if (close === last) return true
  return last === close + 2 && isI(toks[close + 1], 'as') && isI(toks[last], 'const')
}

// ---------------------------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------------------------

/** Every `import ... from '...'` at the top level of the file. */
function parseImports(toks) {
  const out = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (!isI(t, 'import') || t.td !== 0) continue
    let k = i + 1
    if (isP(toks[k], '(') || isP(toks[k], '.') || toks[k]?.k === K_STR) continue
    let typeOnly = false
    if (isI(toks[k], 'type') && (isP(toks[k + 1], '{') || isP(toks[k + 1], '*') || (isI(toks[k + 1]) && !isI(toks[k + 1], 'from')))) {
      typeOnly = true
      k++
    }
    const imp = { first: i, start: t.p, typeOnly, entries: [], braceOpen: -1, braceClose: -1, other: false, spec: '', specTok: -1, last: -1, end: 0 }
    let ok = false
    for (; k < toks.length; k++) {
      const u = toks[k]
      if (isP(u, '{')) {
        const close = matchClose(toks, k)
        if (close < 0) break
        imp.braceOpen = k
        imp.braceClose = close
        for (let j = k + 1; j < close; j++) {
          const from = j
          let isType = false
          if (isI(toks[j], 'type') && isI(toks[j + 1]) && !isI(toks[j + 1], 'as') && !isP(toks[j + 1], ',')) {
            isType = true
            j++
          }
          if (!isI(toks[j])) break
          const imported = toks[j].v
          let local = imported
          if (isI(toks[j + 1], 'as') && isI(toks[j + 2])) {
            local = toks[j + 2].v
            j += 2
          }
          imp.entries.push({ imported, local, isType, from, to: j })
          if (isP(toks[j + 1], ',')) j++
        }
        k = close
      } else if (isI(u, 'from')) {
        if (toks[k + 1]?.k === K_STR) {
          imp.specTok = k + 1
          imp.spec = toks[k + 1].v
          imp.last = k + 1
          imp.end = toks[k + 1].e
          if (isP(toks[k + 2], ';') && !toks[k + 2].nl) {
            imp.last = k + 2
            imp.end = toks[k + 2].e
          }
          ok = true
        }
        break
      } else if (isI(u) || isP(u, ',') || isP(u, '*')) {
        imp.other = true // a default or namespace import
      } else break
    }
    if (ok) out.push(imp)
  }
  return out
}

/** Names the file declares anywhere: const, let, var, function, class. */
function declaredNames(toks) {
  const names = new Map()
  for (let i = 0; i + 1 < toks.length; i++) {
    const t = toks[i]
    if (t.k !== K_ID) continue
    if (t.v === 'const' || t.v === 'let' || t.v === 'var' || t.v === 'function' || t.v === 'class') {
      let k = i + 1
      if (isP(toks[k], '*')) k++
      if (isI(toks[k])) names.set(toks[k].v, (names.get(toks[k].v) ?? 0) + 1)
    }
  }
  return names
}

/** Module-level `const NAME [: type] = [` ...: name -> index of the `[`, for names declared once in the file. */
function moduleArrays(toks, decls) {
  const map = new Map()
  let depth = 0
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.k === K_PUNCT) {
      if (t.v === '(' || t.v === '[' || t.v === '{') depth++
      else if (t.v === ')' || t.v === ']' || t.v === '}') depth--
      continue
    }
    if (depth !== 0 || !isI(t, 'const') || !isI(toks[i + 1])) continue
    const name = toks[i + 1].v
    let nest = 0
    for (let j = i + 2; j < toks.length && j < i + 40; j++) {
      const u = toks[j]
      if (u.k !== K_PUNCT) continue
      if (u.v === '(' || u.v === '[' || u.v === '{') nest++
      else if (u.v === ')' || u.v === ']' || u.v === '}') nest--
      else if (nest === 0 && u.v === ';') break
      else if (nest === 0 && u.v === '=') {
        if (isP(toks[j + 1], '[') && decls.get(name) === 1) map.set(name, j + 1)
        break
      }
    }
  }
  return map
}

/** True when the token after the `]` at toks[close] cannot continue the expression (a method call, an index, an operator). */
function endsStatement(toks, close) {
  const next = toks[close + 1]
  if (next === undefined || isP(next, ';')) return true
  if (isI(next, 'as') && isI(toks[close + 2], 'const')) return true
  if (!next.nl) return false
  if (next.k === K_STR || next.k === K_TMPL) return true
  if (isI(next)) return !['as', 'satisfies', 'instanceof', 'in', 'of'].includes(next.v)
  return isP(next, '}') || isP(next, '@')
}

/** The name declared by `const|let|var NAME [: type] =` when toks[eq] is the `=`, else null. */
function declaredAt(toks, eq) {
  if (isI(toks[eq - 1]) && isDeclKw(toks[eq - 2])) return toks[eq - 1].v
  for (let j = eq - 1; j > 1 && j > eq - 14; j--) {
    const t = toks[j]
    if (isP(t, ';') || isP(t, '=')) break
    if (isP(t, ':') && isI(toks[j - 1]) && isDeclKw(toks[j - 2])) return toks[j - 1].v
  }
  return null
}

/** The name a call at toks[i] is stored under: `x = call`, `o.name = call`, `const x: T = call`, `key: call`. */
function receiverAt(toks, i) {
  const prev = toks[i - 1]
  if (isP(prev, ':') && isI(toks[i - 2])) return toks[i - 2].v
  if (isP(prev, '=')) {
    const name = declaredAt(toks, i - 1)
    if (name) return name
    if (isI(toks[i - 2])) return toks[i - 2].v
  }
  return undefined
}

const DECISION_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'test', 'match'])
const COMPARISONS = new Set(['===', '!==', '==', '!='])
const NOT_AN_INDEXED = new Set(['return', 'case', 'in', 'of', 'typeof', 'new', 'void', 'delete', 'throw', 'yield', 'await', 'else', 'do', 'extends'])

/** Is the expression toks[a..b] an operand, subject, index, receiver or argument that the code branches on? */
function branchedOn(toks, a, b) {
  const before = toks[a - 1]
  const after = toks[b + 1]
  if (before !== undefined && before.k === K_PUNCT && COMPARISONS.has(before.v)) return true
  if (after !== undefined && after.k === K_PUNCT && COMPARISONS.has(after.v)) return true
  if (isI(before, 'case')) return true
  if (isP(before, '(') && isI(toks[a - 2], 'switch') && isP(after, ')')) return true
  if (isP(before, '[') && isP(after, ']')) {
    const owner = toks[a - 2]
    // REC[r] is an index; `return [r]` and `= [r]` are array literals.
    if ((isI(owner) && !NOT_AN_INDEXED.has(owner.v)) || isP(owner, ')') || isP(owner, ']')) return true
  }
  if (isMember(after) && isI(toks[b + 2]) && DECISION_METHODS.has(toks[b + 2].v) && isP(toks[b + 3], '(')) return true
  if (isP(before, '(') && isI(toks[a - 2]) && (toks[a - 2].v === 'includes' || toks[a - 2].v === 'indexOf') && isMember(toks[a - 3]) && (isP(after, ')') || isP(after, ','))) return true
  return false
}

/** Does the file branch on the variable `name` anywhere? It reads the whole file, not the scope: it only ever keeps more. */
function nameBranchedOn(toks, name, index) {
  for (const k of index.get(name) ?? []) {
    if (isMember(toks[k - 1])) continue
    if (branchedOn(toks, k, k)) return true
  }
  return false
}

// ---------------------------------------------------------------------------------------------
// The rewrite
// ---------------------------------------------------------------------------------------------

/** Where the text kit is imported from: a specifier that is, or ends in, the kit's own path or its folder. */
const isKitSpec = (spec) => /(^|\/)text(\/pick)?$/.test(spec)

/**
 * Pure. Reads one file and returns the rewritten text, one site per `pick(IDENT, ...)` call, and whether anything changed.
 * `path` is repo-relative with forward slashes ('src/game/events/x.ts'); it names the site keys and the import path.
 */
export function rewrite(path, source, opts = {}) {
  const skip = opts.skip ?? { v: 1, skip: [] }
  const textModule = opts.textModule ?? DEFAULT_TEXT_MODULE
  const { toks } = lex(source, path.endsWith('.tsx'))
  const imports = parseImports(toks)
  const decls = declaredNames(toks)
  const rngImport = imports.find((m) => !m.typeOnly && /\/rng$/.test(m.spec) && m.entries.some((e) => e.imported === 'pick' && e.local === 'pick' && !e.isType))
  const localPick = decls.has('pick')
  const consts = moduleArrays(toks, decls)
  const skipFor = new Map()
  for (const e of skip.skip) if (e.file === path) skipFor.set(e.site, e)
  const nameIndex = new Map()
  toks.forEach((t, k) => {
    if (t.k !== K_ID) return
    const list = nameIndex.get(t.v)
    if (list) list.push(k)
    else nameIndex.set(t.v, [k])
  })
  const kitSpec = relativeImport(path, textModule)
  const kitBound = new Set()
  const foreignBound = new Set()
  for (const m of imports) {
    if (m.typeOnly) continue
    for (const e of m.entries) {
      if (e.isType) continue
      if (isKitSpec(m.spec)) kitBound.add(e.local)
      else foreignBound.add(e.local)
    }
  }
  const clash = (name) => decls.has(name) || foreignBound.has(name)

  const sites = []
  const edits = [] // { from, to, text }, applied from the end
  const converted = [] // token indexes of the renamed `pick`
  const keys = new Map() // numeric key -> raw array text, for the collision check

  // Keys of pickSite calls already in the file (a second run, or hand-written ones), so a new site cannot collide with them.
  for (let i = 0; i + 3 < toks.length; i++) {
    if (!isI(toks[i], 'pickSite') || !isP(toks[i + 1], '(') || isMember(toks[i - 1])) continue
    const close = matchClose(toks, i + 1)
    if (close < 0) continue
    const args = splitArgs(toks, i + 1, close)
    if (args.length !== 3 || !isP(toks[args[1][0]], '[') || args[2][1] - args[2][0] !== 1 || toks[args[2][0]].k !== K_NUM) continue
    const arr = matchClose(toks, args[1][0])
    if (arr < 0 || !tailIsAsConst(toks, arr, args[1][1] - 1)) continue
    const num = Number(toks[args[2][0]].v)
    if (Number.isInteger(num)) keys.set(num, source.slice(toks[args[1][0]].p, toks[arr].e))
  }

  for (let i = 0; i + 3 < toks.length; i++) {
    const t = toks[i]
    if (t.k !== K_ID || t.v !== 'pick') continue
    if (isMember(toks[i - 1]) || isI(toks[i - 1], 'function')) continue
    if (!isP(toks[i + 1], '(') || !isI(toks[i + 2]) || !isP(toks[i + 3], ',')) continue
    const open = i + 1
    const close = matchClose(toks, open)
    if (close < 0) continue
    const { line, col } = lineCol(source, t.p)
    const site = { file: path, line, col, action: 'keep', id: '' }
    const receiver = receiverAt(toks, i)
    if (receiver !== undefined) site.receiver = receiver
    sites.push(site)
    const keep = (reason) => {
      site.action = 'keep'
      site.reason = reason
    }
    if (localPick) {
      keep('local-pick')
      continue
    }
    if (!rngImport) {
      keep('no-rng-import')
      continue
    }
    const args = splitArgs(toks, open, close)
    if (args.length !== 2) {
      keep(args.length > 2 ? 'extra-args' : 'argument')
      continue
    }
    // The pool: an inline array, or a module-level array named by an identifier.
    const [from, to] = args[1]
    let pool = null
    let inline = false
    let name = ''
    if (isP(toks[from], '[')) {
      const arr = arrayElems(toks, from)
      if (arr && tailIsAsConst(toks, arr.close, to - 1)) {
        pool = arr
        inline = true
      }
    } else if (to - from === 1 && isI(toks[from]) && consts.has(toks[from].v)) {
      const arr = arrayElems(toks, consts.get(toks[from].v))
      // A module array that goes on (`[...].map(f)`, `[...][0]`) is a call result, not an array literal.
      if (arr && endsStatement(toks, arr.close)) {
        pool = arr
        name = toks[from].v
      }
    }
    if (!pool) {
      keep('argument')
      continue
    }
    site.pool = inline ? 'inline' : 'const'
    site.id = inline ? 's' + siteId(path, source.slice(toks[from].p, toks[pool.close].e)) : 'const:' + name
    if (!pool.ok) {
      keep('not-strings')
      continue
    }
    if (!pool.prose) {
      keep('single-word')
      continue
    }
    if (skipFor.has(site.id)) {
      keep('skip-list')
      continue
    }
    if (receiver !== undefined && IDENTITY.has(receiver)) {
      keep('identity')
      continue
    }
    // `const r = pick(...)`, `let r: T = pick(...)`, and (a small step past the plan, which only keeps more) `r = pick(...)`.
    const eq = isP(toks[i - 1], '=') ? i - 1 : -1
    const declared = eq >= 0 ? (declaredAt(toks, eq) ?? (isI(toks[eq - 1]) && !isMember(toks[eq - 2]) ? toks[eq - 1].v : null)) : null
    if (branchedOn(toks, i, close) || (declared !== null && nameBranchedOn(toks, declared, nameIndex))) {
      keep('decision')
      continue
    }
    const holes = inline && pool.holes
    const target = holes ? 'pickSite' : 'pickLine'
    if (clash(target)) {
      keep('local-pick')
      continue
    }
    site.action = holes ? 'site' : 'line'
    edits.push({ from: t.p, to: t.e, text: target })
    converted.push(i)
    if (holes) {
      const raw = source.slice(toks[from].p, toks[pool.close].e)
      const key = siteKey(path, raw)
      const seen = keys.get(key)
      if (seen !== undefined && seen !== raw) {
        throw new Error(`codemod-pickline: site key collision in ${path}: two different pools give 0x${hex8(key)}. Add a space to one array.`)
      }
      keys.set(key, raw)
      site.key = key
      edits.push({ from: toks[to - 1].e, to: toks[to - 1].e, text: ', 0x' + hex8(key) })
    }
  }

  if (!converted.length) return { text: source, sites, changed: false }

  // Imports: the new names, then `pick` leaves the rng import when nothing else uses it.
  const need = ['pickLine', 'pickSite'].filter((n) => sites.some((s) => s.action !== 'keep' && (s.action === 'site' ? 'pickSite' : 'pickLine') === n))
  const missing = need.filter((n) => !kitBound.has(n))
  const own = imports.find((m) => !m.typeOnly && !m.other && m.spec === kitSpec && m.entries.length > 0)
  let newImport = null
  if (missing.length && own) {
    const last = own.entries[own.entries.length - 1]
    edits.push({ from: toks[last.to].e, to: toks[last.to].e, text: missing.map((n) => ', ' + n).join('') })
  } else if (missing.length) {
    const q = String.fromCharCode(toks[rngImport.specTok].q ?? 39)
    newImport = `import { ${missing.join(', ')} } from ${q}${kitSpec}${q}${isP(toks[rngImport.last], ';') ? ';' : ''}`
  }
  const renamed = new Set(converted)
  const importTokens = new Set()
  for (const m of imports) for (let k = m.first; k <= m.last; k++) importTokens.add(k)
  let stillUsed = false
  for (let k = 0; k < toks.length && !stillUsed; k++) {
    const u = toks[k]
    if (u.k !== K_ID || u.v !== 'pick' || renamed.has(k) || importTokens.has(k)) continue
    if (isMember(toks[k - 1])) continue
    if (isP(toks[k + 1], ':') && !isP(toks[k - 1], '?')) continue
    stillUsed = true
  }
  const entries = rngImport.entries
  const at = entries.findIndex((e) => e.imported === 'pick' && e.local === 'pick' && !e.isType)
  if (!stillUsed && !rngImport.other) {
    if (entries.length === 1) {
      // The whole statement goes, with its newline when the line holds nothing else; a new import takes its place.
      const rest = /^[ \t]*(\r?\n)?/.exec(source.slice(rngImport.end))
      const lineEnd = rngImport.end + (rest ? rest[0].length : 0)
      if (newImport !== null) {
        edits.push({ from: rngImport.start, to: rngImport.end, text: newImport })
        newImport = null
      } else if (rest && rest[1] !== undefined) edits.push({ from: rngImport.start, to: lineEnd, text: '' })
      else edits.push({ from: rngImport.start, to: rngImport.end, text: '' })
    } else if (at < entries.length - 1) {
      edits.push({ from: toks[entries[at].from].p, to: toks[entries[at + 1].from].p, text: '' })
    } else {
      edits.push({ from: toks[entries[at - 1].to].e, to: toks[entries[at].to].e, text: '' })
    }
  }
  if (newImport !== null) {
    const nl = source.indexOf('\n', rngImport.end)
    const pos = nl < 0 ? source.length : nl
    edits.push({ from: pos, to: pos, text: '\n' + newImport })
  }

  edits.sort((x, y) => y.from - x.from || y.to - x.to)
  let text = source
  for (const e of edits) text = text.slice(0, e.from) + e.text + text.slice(e.to)
  return { text, sites, changed: text !== source }
}

/** Skip entries that no site matched: an entry is live when a site of the same file and id was kept for the reason 'skip-list'. */
export function staleSkips(skip, sites) {
  const live = new Set(sites.filter((s) => s.action === 'keep' && s.reason === 'skip-list').map((s) => s.file + '\u001f' + s.id))
  return skip.skip.filter((e) => !live.has(e.file + '\u001f' + e.site))
}

// ---------------------------------------------------------------------------------------------
// The two routed helpers
// ---------------------------------------------------------------------------------------------

/** Calls of eraPick (from a specifier ending /era) and v (from one ending /helpers), for the human read in R2-A3. */
export function helperSites(path, source) {
  const { toks } = lex(source, path.endsWith('.tsx'))
  const imports = parseImports(toks)
  const decls = declaredNames(toks)
  const wanted = new Map()
  for (const m of imports) {
    if (m.typeOnly) continue
    for (const e of m.entries) {
      if (e.isType || e.imported !== e.local || decls.has(e.local)) continue
      if (e.local === 'eraPick' && /\/era$/.test(m.spec)) wanted.set('eraPick', true)
      if (e.local === 'v' && /\/helpers$/.test(m.spec)) wanted.set('v', true)
    }
  }
  if (!wanted.size) return []
  const consts = moduleArrays(toks, decls)
  const out = []
  for (let i = 0; i + 3 < toks.length; i++) {
    const t = toks[i]
    if (t.k !== K_ID || !wanted.has(t.v) || isMember(toks[i - 1])) continue
    if (!isP(toks[i + 1], '(') || !isI(toks[i + 2]) || !isP(toks[i + 3], ',')) continue
    const close = matchClose(toks, i + 1)
    if (close < 0) continue
    const args = splitArgs(toks, i + 1, close)
    if (args.length < 2) continue
    const [from, to] = args[1]
    let pool
    if (isP(toks[from], '[')) {
      const arr = arrayElems(toks, from)
      if (!arr || !tailIsAsConst(toks, arr.close, to - 1)) continue
      pool = !arr.ok ? 'other' : arr.holes ? 'inline-hole' : 'inline-static'
    } else if (to - from === 1 && isI(toks[from])) {
      pool = consts.has(toks[from].v) ? 'const' : 'other'
    } else continue
    const site = { file: path, line: lineCol(source, t.p).line, callee: t.v, pool }
    const receiver = receiverAt(toks, i)
    if (receiver !== undefined) site.receiver = receiver
    out.push(site)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// The command line
// ---------------------------------------------------------------------------------------------

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p)
  }
}

const KEEP_ORDER = ['single-word', 'not-strings', 'argument', 'extra-args', 'identity', 'decision', 'skip-list', 'local-pick', 'no-rng-import']

function usage(err) {
  err.write('usage: node scripts/codemod-pickline.mjs [--apply] [--list] [--helpers] [--report <file.json>] [--root <dir>] [--only <path-substring>]\n')
}

function loadSkip(root) {
  for (const file of [join(root, SKIP_FILE), join(HERE, 'codemod-pickline-skip.json')]) {
    if (!existsSync(file)) continue
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (!raw || raw.v !== 1 || !Array.isArray(raw.skip)) throw new Error(`${file}: expected { "v": 1, "skip": [...] }`)
    return raw
  }
  return { v: 1, skip: [] }
}

export function run(argv, { out = process.stdout, err = process.stderr } = {}) {
  const o = { apply: false, list: false, helpers: false, report: null, root: resolve(HERE, '..'), only: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') o.apply = true
    else if (a === '--list') o.list = true
    else if (a === '--helpers') o.helpers = true
    else if (a === '--report' || a === '--root' || a === '--only') {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) {
        usage(err)
        return 2
      }
      if (a === '--report') o.report = v
      else if (a === '--root') o.root = resolve(v)
      else o.only = v
    } else {
      usage(err)
      return 2
    }
  }
  if (!existsSync(join(o.root, 'src')) || !statSync(join(o.root, 'src')).isDirectory()) {
    err.write(`codemod-pickline: no src folder under ${o.root}\n`)
    return 2
  }
  const skip = loadSkip(o.root)
  const files = []
  walk(join(o.root, 'src'), files)
  const paths = files.map((f) => relative(o.root, f).split(sep).join('/')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const sites = []
  const helpers = []
  const changed = []
  const lines = []
  let scanned = 0
  for (const path of paths) {
    if (o.only !== null && !path.includes(o.only)) continue
    scanned++
    const source = readFileSync(join(o.root, path), 'utf8')
    const r = rewrite(path, source, { skip })
    sites.push(...r.sites)
    if (o.helpers || o.report) helpers.push(...helperSites(path, source))
    if (r.changed) {
      changed.push(path)
      if (o.apply) writeFileSync(join(o.root, path), r.text)
    }
    if (o.list) {
      const src = source.split('\n')
      for (const s of r.sites) {
        if (s.action === 'keep') continue
        lines.push(`${path}:${s.line}:${s.col} ${s.action} ${s.key === undefined ? '-' : '0x' + hex8(s.key)} ${s.id} ${src[s.line - 1].trim().slice(0, 80)}`)
      }
    }
  }
  const stale = o.only === null ? staleSkips(skip, sites) : []
  const nLine = sites.filter((s) => s.action === 'line').length
  const nSite = sites.filter((s) => s.action === 'site').length
  const summary = [`pickline codemod ${o.apply ? 'applied' : 'dry run'}, root ${o.root}`, `files scanned: ${scanned}`, `sites: ${sites.length}`, `converted: ${nLine + nSite} (line ${nLine}, site ${nSite}) in ${changed.length} files`]
  for (const reason of KEEP_ORDER) {
    const n = sites.filter((s) => s.action === 'keep' && s.reason === reason).length
    if (n) summary.push(`keep ${reason}: ${n}`)
  }
  const held = new Map()
  for (const s of sites) if (s.action === 'keep' && (s.reason === 'identity' || s.reason === 'decision') && s.receiver !== undefined) held.set(s.receiver, (held.get(s.receiver) ?? 0) + 1)
  if (held.size) {
    summary.push('receivers held back:')
    for (const [name, n] of [...held].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) summary.push(`  ${name} ${n}`)
  }
  summary.push(`stale skip entries: ${stale.length}`)
  for (const e of stale) summary.push(`  ${e.file} ${e.site} ${e.reason}`)
  if (o.report !== null) {
    writeFileSync(resolve(o.report), JSON.stringify({ v: 1, root: o.root, converted: nLine + nSite, sites, helpers, stale }, null, 1) + '\n')
  }
  const helperLines = helpers.map((h) => `${h.file}:${h.line} ${h.callee} ${h.receiver ?? '-'} ${h.pool}`)
  if (o.apply) {
    err.write(summary.join('\n') + '\n')
    if (o.list) out.write(lines.join('\n') + (lines.length ? '\n' : ''))
    if (o.helpers) out.write(helperLines.join('\n') + (helperLines.length ? '\n' : ''))
    out.write(changed.join('\n') + (changed.length ? '\n' : ''))
  } else {
    out.write(summary.join('\n') + '\n')
    if (o.list) out.write(lines.join('\n') + (lines.length ? '\n' : ''))
    if (o.helpers) out.write(helperLines.join('\n') + (helperLines.length ? '\n' : ''))
  }
  return 0
}

function isMain() {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (e) {
    process.stderr.write(`codemod-pickline: ${e instanceof Error ? e.message : String(e)}\n`)
    process.exitCode = 1
  }
}
