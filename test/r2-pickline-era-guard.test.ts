// ci: fast
// R2 era guard. The pickline codemod (scripts/codemod-pickline.mjs) turned prose pick(g, POOL) sites into pickLine / pickSite
// (src/game/text/pick.ts). Those two draw a line and nothing else. A pool whose lines start with an '@gate' tag
// ('@texting,!smartphone We need to talk.') is meant for eraPick (events/era.ts) or v (events/helpers.ts): they drop the lines
// the year and country rule out and strip the tag. A tagged pool that reaches pickLine or pickSite shows the raw tag and loses the
// era gate, which is how the divorce line of love.ts showed '@texting,!smartphone' and a text message in 1985.
//
// Part 1 scans src/ with the scan kit: every pickLine / pickSite call, its pool read as an inline array, a const (same file or
// imported), a spread of consts, defineLines(id, pool), a ternary of pools or X.filter / slice / concat of one of them. A pool that
// holds a line starting with '@' fails, and so does a pool the scan cannot read (no silent pass). The two era helpers that call
// pickLine on an already filtered list are named below, with the reason. Part 2 checks that the scan itself catches each shape.
// Part 3 plays the divorce line in the years that matter.
import { dirname, posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import { divorce } from '../src/game/love'
import { createPerson } from '../src/game/people'
import { texting } from '../src/game/events/era'
import type { GameState, NoticeModal } from '../src/game/types'
import { K_PUNCT, K_STR, K_TMPL, closeParen, isId, isPunct, loadSources, splitArgs, toSource, type SourceFile, type Tok } from './scan-kit'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------------------------- the scan

/** Calls of pickLine / pickSite where the pool is read from a list that is already era filtered and tag free (file, then pool text). */
const ERA_AWARE_CALLERS: Record<string, string> = {
  'src/game/events/era.ts ok': 'eraPick: eraLines() already dropped the lines that do not fit and stripped the tags',
  'src/game/events/era.ts plain.length ? plain : lines': 'eraPick fallback: the untagged lines, or every line with the tag stripped on the way out',
  'src/game/events/helpers.ts from': 'v: the list was cut with eraOk and the result goes through eraStrip',
  'src/game/events/variants.ts [s.text, ...found]': 'withVariants: the pool is the original text and the scenes sceneCandidates kept, each gate checked with eraOk and its tag stripped with eraStrip',
}

/** Where the scan looks for pools: the kit itself (src/game/text/) is the picker, not a user of it. */
const KIT = 'src/game/text/'

interface Pool {
  /** Every string or template literal found in the pool, in order. */
  lines: string[]
  /** Parts of the pool the scan could not read, each with a short description. */
  unreadable: string[]
}

interface Decl {
  file: SourceFile
  init: Tok[]
}

interface Index {
  files: Map<string, SourceFile>
  /** file path -> const name -> its initializers (one per declaration of that name in the file). */
  decls: Map<string, Map<string, Tok[][]>>
  /** file path -> local name -> the module it is imported from and the name it has there. */
  imports: Map<string, Map<string, { from: string; name: string }>>
}

const OPEN = new Set(['(', '[', '{'])
const CLOSE = new Set([')', ']', '}'])
const CONTINUES = new Set(['.', '?.', '+', '-', '*', '/', '||', '&&', '??', '?', ':', ')', ']', '}', ',', '=>', '=', '|', '&'])

/** The index of the bracket that closes the one at toks[open], or -1. */
function closeAt(toks: readonly Tok[], open: number): number {
  const o = toks[open]
  if (!o || o.k !== K_PUNCT || !OPEN.has(o.v)) return -1
  let depth = 0
  for (let i = open; i < toks.length; i++) {
    const t = toks[i]
    if (t.k !== K_PUNCT) continue
    if (OPEN.has(t.v)) depth++
    else if (CLOSE.has(t.v) && --depth === 0) return i
  }
  return -1
}

/** The tokens of an initializer that starts at toks[start]: up to the `;` or the line that starts a new statement. */
function initializer(toks: readonly Tok[], start: number): Tok[] {
  let depth = 0
  let end = start
  for (; end < toks.length; end++) {
    const t = toks[end]
    if (t.k === K_PUNCT) {
      if (OPEN.has(t.v)) depth++
      else if (CLOSE.has(t.v)) {
        if (--depth < 0) break
      } else if (t.v === ';' && depth === 0) break
    }
    if (depth === 0 && end > start && t.nl) {
      const prev = toks[end - 1]
      const joins = (t.k === K_PUNCT && CONTINUES.has(t.v)) || (isId(t) && (t.v === 'as' || t.v === 'satisfies')) || (prev.k === K_PUNCT && CONTINUES.has(prev.v) && !CLOSE.has(prev.v))
      if (!joins) break
    }
  }
  return toks.slice(start, end)
}

/** Every `const NAME = ...` of a file (any depth: the scan is by name, which over-approximates and so can only be stricter). */
function declsOf(f: SourceFile): Map<string, Tok[][]> {
  const out = new Map<string, Tok[][]>()
  const toks = f.toks
  for (let i = 0; i < toks.length - 2; i++) {
    if (!(isId(toks[i], 'const') || isId(toks[i], 'let') || isId(toks[i], 'var')) || !isId(toks[i + 1])) continue
    let depth = 0
    let eq = -1
    for (let j = i + 2; j < toks.length && j < i + 80; j++) {
      const t = toks[j]
      if (t.k !== K_PUNCT) continue
      if (OPEN.has(t.v)) depth++
      else if (CLOSE.has(t.v)) depth--
      else if (t.v === ';' && depth <= 0) break
      else if (t.v === '=' && depth === 0) {
        eq = j
        break
      }
    }
    if (eq < 0) continue
    const list = out.get(toks[i + 1].v) ?? []
    list.push(initializer(toks, eq + 1))
    out.set(toks[i + 1].v, list)
  }
  return out
}

/** `import { a, b as c } from './x'` of a file: local name -> where it comes from. Only relative specifiers matter. */
function importsOf(f: SourceFile): Map<string, { from: string; name: string }> {
  const out = new Map<string, { from: string; name: string }>()
  const toks = f.toks
  for (let i = 0; i < toks.length; i++) {
    if (!isId(toks[i], 'import')) continue
    let j = i + 1
    if (isId(toks[j], 'type')) j++
    if (!isPunct(toks[j], '{')) continue
    const close = closeAt(toks, j)
    if (close < 0 || !isId(toks[close + 1], 'from') || toks[close + 2]?.k !== K_STR) continue
    const spec = toks[close + 2].v
    if (!spec.startsWith('.')) continue
    for (const arg of splitArgs(toks, j, close)) {
      const ids = arg.filter((t) => isId(t) && t.v !== 'type')
      if (ids.length === 1) out.set(ids[0].v, { from: spec, name: ids[0].v })
      else if (ids.length >= 2) out.set(ids[ids.length - 1].v, { from: spec, name: ids[0].v })
    }
  }
  return out
}

function indexOf(files: readonly SourceFile[]): Index {
  const idx: Index = { files: new Map(), decls: new Map(), imports: new Map() }
  for (const f of files) {
    idx.files.set(f.path, f)
    idx.decls.set(f.path, declsOf(f))
    idx.imports.set(f.path, importsOf(f))
  }
  return idx
}

/** The file a relative specifier of `from` names, among the indexed ones. */
function moduleFile(idx: Index, from: string, spec: string): SourceFile | undefined {
  const base = posix.normalize(posix.join(dirname(from), spec))
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const f = idx.files.get(cand)
    if (f) return f
  }
  return undefined
}

/** The const `name` as seen from file `at`: declared there, or imported from another indexed file. */
function lookup(idx: Index, at: string, name: string): Decl[] {
  const own = idx.decls.get(at)?.get(name)
  if (own) return own.map((init) => ({ file: idx.files.get(at)!, init }))
  const imp = idx.imports.get(at)?.get(name)
  const target = imp ? moduleFile(idx, at, imp.from) : undefined
  const there = target ? idx.decls.get(target.path)?.get(imp!.name) : undefined
  return there && target ? there.map((init) => ({ file: target, init })) : []
}

/** `a as const`, `a satisfies X`: the tokens before the first top-level `as` / `satisfies`. */
function withoutCast(toks: readonly Tok[]): Tok[] {
  const td = toks[0]?.td ?? 0
  let depth = 0
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.k === K_PUNCT) {
      if (OPEN.has(t.v)) depth++
      else if (CLOSE.has(t.v)) depth--
    } else if (depth === 0 && t.td === td && isId(t) && (t.v === 'as' || t.v === 'satisfies')) return toks.slice(0, i)
  }
  return [...toks]
}

/** The top-level index of the first punctuation token `v` (outside brackets and holes), or -1. */
function topLevel(toks: readonly Tok[], v: string, from = 0): number {
  const td = toks[0]?.td ?? 0
  let depth = 0
  for (let i = from; i < toks.length; i++) {
    const t = toks[i]
    if (t.k !== K_PUNCT || t.td !== td) continue
    if (OPEN.has(t.v)) depth++
    else if (CLOSE.has(t.v)) depth--
    else if (depth === 0 && t.v === v) return i
  }
  return -1
}

const BASE_ONLY = new Set(['filter', 'slice', 'toSorted', 'reverse'])

/** Reads a pool expression into its literal lines. Anything else is reported in `unreadable`. */
function readPool(idx: Index, at: string, toks0: readonly Tok[], seen: Set<string>, out: Pool): void {
  let toks = withoutCast(toks0)
  while (toks.length >= 2 && isPunct(toks[0], '(') && closeAt(toks, 0) === toks.length - 1) toks = withoutCast(toks.slice(1, -1))
  if (!toks.length) return
  const head = toks[0]

  // [ 'a', ...B, `c ${x}` ], and [ ... ].filter(...) / .slice(...) / .concat(A, B)
  if (isPunct(head, '[')) {
    const end = closeAt(toks, 0)
    const method = end > 0 && isPunct(toks[end + 1], '.') && isId(toks[end + 2]) && isPunct(toks[end + 3], '(') && closeAt(toks, end + 3) === toks.length - 1 ? toks[end + 2].v : ''
    if (end === toks.length - 1 || BASE_ONLY.has(method) || method === 'concat') {
      for (const el of splitArgs(toks, 0, end)) {
        if (isPunct(el[0], '...')) readPool(idx, at, el.slice(1), seen, out)
        else for (const t of el) if ((t.k === K_STR || t.k === K_TMPL) && t.td === head.td) out.lines.push(t.v)
      }
      if (method === 'concat') for (const arg of splitArgs(toks, end + 3, toks.length - 1)) readPool(idx, at, arg, seen, out)
      return
    }
  }

  // cond ? A : B
  const q = topLevel(toks, '?')
  if (q > 0 && !isPunct(toks[q - 1], '.')) {
    const c = topLevel(toks, ':', q + 1)
    if (c > q) {
      readPool(idx, at, toks.slice(q + 1, c), seen, out)
      readPool(idx, at, toks.slice(c + 1), seen, out)
      return
    }
  }

  // defineLines(id, pool)
  if (isId(head, 'defineLines') && isPunct(toks[1], '(') && closeAt(toks, 1) === toks.length - 1) {
    const args = splitArgs(toks, 1, toks.length - 1)
    if (args.length === 2) {
      readPool(idx, at, args[1], seen, out)
      return
    }
  }

  // NAME, NAME.filter(...), NAME.slice(...), NAME.concat(A, B)
  if (isId(head)) {
    const method = isPunct(toks[1], '.') && isId(toks[2]) && isPunct(toks[3], '(') && closeAt(toks, 3) === toks.length - 1 ? toks[2].v : ''
    if (toks.length === 1 || BASE_ONLY.has(method) || method === 'concat') {
      const found = lookup(idx, at, head.v)
      if (!found.length) {
        out.unreadable.push(`${head.v} (no const of that name in this file or its imports)`)
        return
      }
      const key = `${found[0].file.path}\u0001${head.v}`
      if (!seen.has(key)) {
        seen.add(key)
        for (const d of found) readPool(idx, d.file.path, d.init, seen, out)
      }
      if (method === 'concat') for (const arg of splitArgs(toks, 3, toks.length - 1)) readPool(idx, at, arg, seen, out)
      return
    }
  }
  out.unreadable.push(toks.slice(0, 8).map((t) => t.v).join(' '))
}

interface Site {
  path: string
  line: number
  callee: string
  pool: string
  gated: string[]
  unreadable: string[]
}

/** True when the token at i is a call of pickLine / pickSite of the text kit (not a method, not a declaration). */
function isKitCall(toks: readonly Tok[], i: number): boolean {
  const t = toks[i]
  if (!(isId(t, 'pickLine') || isId(t, 'pickSite')) || !isPunct(toks[i + 1], '(') || isPunct(toks[i - 1], '.')) return false
  const before = toks[i - 1]
  return !(before && isId(before) && ['function', 'const', 'let', 'var', 'class'].includes(before.v))
}

/** Every call of pickLine / pickSite outside the kit, with the lines of its pool that start with '@'. */
function scan(files: readonly SourceFile[]): Site[] {
  const idx = indexOf(files)
  const sites: Site[] = []
  for (const f of files) {
    if (f.path.startsWith(KIT)) continue
    f.toks.forEach((t, i) => {
      if (!isKitCall(f.toks, i)) return
      const close = closeParen(f.toks, i + 1)
      const args = close < 0 ? [] : splitArgs(f.toks, i + 1, close)
      if (args.length < 2) return
      const pool: Pool = { lines: [], unreadable: [] }
      readPool(idx, f.path, args[1], new Set(), pool)
      const text = f.text.slice(args[1][0].p, args[1][args[1].length - 1].e).replace(/\s+/g, ' ')
      const line = f.text.slice(0, t.p).split('\n').length
      sites.push({ path: f.path, line, callee: t.v, pool: text.length > 70 ? `${text.slice(0, 67)}...` : text, gated: pool.lines.filter((l) => l.startsWith('@')), unreadable: pool.unreadable })
    })
  }
  return sites
}

/** The pools that must not go through the kit: they hold an '@' line. */
function leaks(sites: readonly Site[]): string[] {
  return sites.filter((s) => s.gated.length).map((s) => `${s.path}:${s.line} ${s.callee}(g, ${s.pool}): ${s.gated.length} tagged line(s), e.g. ${JSON.stringify(s.gated[0].slice(0, 48))}`)
}

/** The pools the scan could not read and that are not one of the named era-aware callers. */
function blind(sites: readonly Site[]): string[] {
  return sites
    .filter((s) => s.unreadable.length && !(`${s.path} ${s.pool}` in ERA_AWARE_CALLERS))
    .map((s) => `${s.path}:${s.line} ${s.callee}(g, ${s.pool}): cannot read ${s.unreadable.join('; ')}`)
}

// ---------------------------------------------------------------------------------------------- part 1: the real tree

const src = loadSources()
const tree = scan(src)

describe('r2 pickline era guard: the real tree', () => {
  it('1: no pool that goes through pickLine or pickSite holds an @gate line (use eraPick or v, which filter and strip)', () => {
    expect(leaks(tree)).toEqual([])
  })

  it('2: every pool of pickLine / pickSite can be read by the scan, bar the named era-aware callers', () => {
    expect(blind(tree), 'write the pool as an array of strings or a const of one, or name the caller in ERA_AWARE_CALLERS with the reason').toEqual([])
  })

  it('3: every named era-aware caller still exists (no stale entry)', () => {
    const live = new Set(tree.filter((s) => s.unreadable.length).map((s) => `${s.path} ${s.pool}`))
    expect(Object.keys(ERA_AWARE_CALLERS).filter((k) => !live.has(k))).toEqual([])
    for (const reason of Object.values(ERA_AWARE_CALLERS)) expect(reason.length).toBeGreaterThan(10)
  })

  it('the scan is not vacuous: it reads hundreds of calls, and the tagged pools of the tree are all on the era pickers', () => {
    expect(tree.length).toBeGreaterThan(600)
    expect(tree.filter((s) => s.callee === 'pickSite').length).toBeGreaterThan(100)
    // Tagged pools exist in the tree (BREAKUP_THEM, the era packs), and each one is read by an era-aware path.
    const tagged = src.filter((f) => /['"`]@[\w!+,-]+ /.test(f.text))
    expect(tagged.length).toBeGreaterThan(30)
  })
})

// ---------------------------------------------------------------------------------------------- part 2: the scan sees each shape

describe('r2 pickline era guard: the scan fails on a synthetic violation', () => {
  const head = "import { pickLine, pickSite } from './text/pick'\nimport { eraPick } from './events/era'\n"
  const tagged = "'@texting We need to talk.', 'We grew apart.'"
  const bad = (path: string, body: string, ...more: SourceFile[]): string[] => leaks(scan([toSource(path, head + body), ...more]))

  it('1: an inline array, a const, a spread of a const and a pool of a template are all caught', () => {
    expect(bad('src/game/a.ts', `export const f = (g: never) => pickLine(g, [${tagged}])\n`)).toHaveLength(1)
    expect(bad('src/game/a.ts', `const POOL = [${tagged}]\nexport const f = (g: never) => pickLine(g, POOL)\n`)).toHaveLength(1)
    expect(bad('src/game/a.ts', `const POOL = [${tagged}] as const\nexport const f = (g: never) => pickLine(g, POOL)\n`)).toHaveLength(1)
    expect(bad('src/game/a.ts', `const BASE = [${tagged}]\nexport const f = (g: never) => pickLine(g, [...BASE, 'One more line.'])\n`)).toHaveLength(1)
    expect(bad('src/game/a.ts', `const A = [${tagged}]\nconst B = [...A, 'x']\nexport const f = (g: never) => pickSite(g, B, 0x1234)\n`)).toHaveLength(1)
    expect(bad('src/game/a.ts', 'export const f = (g: never, n: number) => pickSite(g, [`@tv You watched ${n} hours.`, `Another ${n}.`], 0x1)\n')).toHaveLength(1)
    expect(bad('src/game/a.ts', `export const f = (g: never, k: boolean) => pickLine(g, k ? [${tagged}] : ['a', 'b'])\n`)).toHaveLength(1)
    expect(bad('src/game/a.ts', `const POOL = [${tagged}]\nexport const f = (g: never) => pickLine(g, POOL.filter((l) => l.length > 3))\n`)).toHaveLength(1)
    expect(bad('src/game/a.ts', `const POOL = [${tagged}]\nexport const f = (g: never) => pickLine(g, ['x'].concat(POOL))\n`)).toHaveLength(1)
    expect(bad('src/game/a.ts', `import { defineLines } from './text/registry'\nconst POOL = defineLines('a.pool', [${tagged}])\nexport const f = (g: never) => pickLine(g, POOL)\n`)).toHaveLength(1)
  })

  it('2: a const imported from another file is followed, with or without a rename', () => {
    const pool = toSource('src/game/pool.ts', `export const THEM = [${tagged}]\n`)
    expect(bad('src/game/a.ts', "import { THEM } from './pool'\nexport const f = (g: never) => pickLine(g, THEM)\n", pool)).toHaveLength(1)
    expect(bad('src/game/a.ts', "import { THEM as MINE } from './pool'\nexport const f = (g: never) => pickLine(g, MINE)\n", pool)).toHaveLength(1)
    expect(bad('src/game/events/a.ts', "import { THEM } from '../pool'\nexport const f = (g: never) => pickLine(g, [...THEM])\n", pool)).toHaveLength(1)
  })

  it('3: the report names the file, the line and the first tagged line', () => {
    const out = bad('src/game/a.ts', `\nexport const f = (g: never) => pickLine(g, [${tagged}])\n`)
    expect(out[0]).toMatch(/^src\/game\/a\.ts:4 pickLine\(g, \[.*\]\): 1 tagged line\(s\), e\.g\. "@texting We need to talk\."$/)
  })

  it('4: untagged pools, eraPick and a line that only mentions an @ are fine', () => {
    expect(bad('src/game/a.ts', "export const f = (g: never) => pickLine(g, ['One line.', 'Two lines.'])\n")).toEqual([])
    expect(bad('src/game/a.ts', `const POOL = [${tagged}]\nexport const f = (g: never) => eraPick(g, POOL)\n`)).toEqual([])
    expect(bad('src/game/a.ts', `const POOL = [${tagged}]\nexport const f = (g: never) => eraPick(g, [...POOL, 'x'])\n`)).toEqual([])
    expect(bad('src/game/a.ts', "export const f = (g: never) => pickLine(g, ['You emailed me@home.', 'Two lines.'])\n")).toEqual([])
    // A method called pickLine and a declaration of a function of that name are not calls of the kit.
    expect(bad('src/game/a.ts', `const o = { pickLine: (a: string[]) => a[0] }\nexport const f = () => o.pickLine([${tagged}])\n`)).toEqual([])
    // The kit's own folder is the picker, not a user of it.
    expect(leaks(scan([toSource('src/game/text/x.ts', `export const f = (g: never) => pickLine(g, [${tagged}])\n`)]))).toEqual([])
  })

  it('5: a pool the scan cannot read is reported as blind, not passed', () => {
    const blindOf = (body: string): string[] => blind(scan([toSource('src/game/a.ts', head + body)]))
    expect(blindOf('export const f = (g: never, lines: string[]) => pickLine(g, lines)\n')).toHaveLength(1)
    expect(blindOf('declare function pools(): string[]\nexport const f = (g: never) => pickLine(g, pools())\n')).toHaveLength(1)
    expect(blindOf("export const f = (g: never) => pickLine(g, ['a', ...more(g)])\n")).toHaveLength(1)
    expect(blindOf("const POOL = ['a', 'b']\nexport const f = (g: never) => pickLine(g, POOL)\n")).toEqual([])
  })

  it('6: the era-aware callers are named by file and pool text; the same text in another file is not exempt', () => {
    const site = (path: string): string[] => blind(scan([toSource(path, `${head}export const f = (g: never, from: string[]) => pickLine(g, from)\n`)]))
    expect(site('src/game/events/helpers.ts')).toEqual([])
    expect(site('src/game/events/other.ts')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------------------------- part 3: the divorce line

/** A married life of `year` in `countryId` whose spouse files for divorce; the notice the player reads. */
function filedForDivorce(seed: number, year: number, countryId: string): { g: GameState; text: string } {
  const g = makeTestGame(seed, { age: 40, countryId, money: 0, residence: { status: 'owned' } })
  g.year = year
  g.lifeId = `divorce-${year}-${countryId}-${seed}`
  const wife = createPerson(g, { relation: 'spouse', gender: seed % 2 ? 'female' : 'male', age: 38, money: 0, data: { prenup: true, marriedAge: 28 } })
  divorce(g, wife, 'them')
  const note = g.queue.find((m): m is NoticeModal => m.kind === 'notice' && m.title === 'Divorce')
  if (!note) throw new Error('no Divorce notice')
  return { g, text: note.text }
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1)

describe('r2 pickline era guard: the divorce line a spouse leaves with', () => {
  it('1: never shows a tag, a pronoun hole or a doubled quote, in any era or country', () => {
    for (const [year, country] of [[1900, 'us'], [1935, 'gb'], [1985, 'us'], [1995, 'jp'], [2005, 'us'], [2005, 'ng'], [2026, 'us']] as const) {
      for (const seed of SEEDS) {
        const { text } = filedForDivorce(seed, year, country)
        expect(text, `${year} ${country} seed ${seed}`).not.toMatch(/@|\{|""/)
        expect(text, `${year} ${country} seed ${seed}`).toMatch(/filed for divorce\./)
      }
    }
  })

  it('2: in 2005 (texting yes, smartphones no) only the lines of that year show', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const { g, text } = filedForDivorce(seed, 2005, 'us')
      expect(texting(g)).toBe(true)
      expect(text, `seed ${seed}`).not.toMatch(/@|\{|Sent as a message|not home|ribbon/)
      if (/text message/.test(text)) seen.add('texting line')
    }
    // The 2005 line about a text message is still there: the gate did not just remove it.
    expect([...seen]).toEqual(['texting line'])
  })

  it('3: never speaks of texting where texting is not common yet (1985, 1900, and a country that is still on landlines in 2000)', () => {
    // A country where 2000 is still before texting; the rule is the game's own (texting() in events/era.ts), not a hand-written list.
    const late = ['ng', 'et', 'bd', 'ke', 'pk', 'in', 'id', 'eg'].find((c) => {
      const g = makeTestGame(1, { age: 40, countryId: c })
      g.year = 2000
      return !texting(g)
    })
    expect(late, 'one of these countries has no texting in 2000').toBeDefined()
    for (const [year, country] of [[1985, 'us'], [1900, 'us'], [2000, late!]] as const) {
      for (const seed of SEEDS) {
        const { g, text } = filedForDivorce(seed, year, country)
        expect(texting(g), `${year} ${country}`).toBe(false)
        expect(text, `${year} ${country} seed ${seed}`).not.toMatch(/\btext(s|ed|ing)?\b|message/i)
      }
    }
  })

  it('4: before smartphones the message line never shows; the letter line shows only where nobody has a telephone', () => {
    const letters = new Set<number>()
    for (const [year, country] of [[1900, 'us'], [1985, 'us']] as const) {
      for (const seed of SEEDS) {
        const { text } = filedForDivorce(seed, year, country)
        expect(text, `${year} seed ${seed}`).not.toMatch(/Sent as a message/)
        if (/polite letter/.test(text)) letters.add(year)
        if (/mother tell you/.test(text)) expect(year, 'the landline line needs a landline').toBe(1985)
      }
    }
    // 1900 has the letter and no landline line; 1985 has the landline line and no letter.
    expect([...letters]).toEqual([1900])
  })
})
