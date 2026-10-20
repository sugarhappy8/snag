// ci: fast
// R1-P5 (X.G1): the scan kit that the foresight scan, the money ratchet and the ceiling list share. It reads the real
// src/ through the validated lexer (scripts/voice/lexer.mjs), so a call written inside a string, a template or a
// comment is never seen as a call. The cases here are the ones the guards lean on.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { lex } from '../scripts/voice/lexer.mjs'
import { K_ID, K_NUM, K_PUNCT, K_STR, K_TMPL, ROOT, closeParen, isId, isPunct, lineOf, loadSources, splitArgs, toSource, type SourceFile, type Tok } from './scan-kit'

/** The index of the first token that is the identifier `name` followed by `(`. */
function openOf(src: SourceFile, name: string): number {
  const i = src.toks.findIndex((t, n) => isId(t, name) && isPunct(src.toks[n + 1], '('))
  if (i < 0) throw new Error(`no call to ${name} in the fixture`)
  return i + 1
}

/** The source text of one argument (its tokens may end before a template's closing backtick, so take the furthest end). */
function textOf(src: SourceFile, arg: readonly Tok[]): string {
  return src.text.slice(arg[0]!.p, Math.max(...arg.map((t) => t.e)))
}

const temps: string[] = []
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true })
})

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'scan-kit-'))
  temps.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('loadSources', () => {
  const real = loadSources()

  it('reads every source file of the real tree: more than 600, sorted, lexed without a single error', () => {
    expect(real.length).toBeGreaterThan(600)
    const paths = real.map((f) => f.path)
    expect(paths).toEqual([...paths].sort())
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.every((p) => p.startsWith('src/') && !p.includes('\\'))).toBe(true)
    expect(paths.some((p) => p.endsWith('.d.ts'))).toBe(false)
    expect(paths).toContain('src/game/core.ts')
    expect(paths.some((p) => p.endsWith('.tsx'))).toBe(true)
    const bad = real.map((f) => ({ path: f.path, errors: lex(f.text, f.path.endsWith('.tsx')).errors })).filter((x) => x.errors.length > 0)
    expect(bad).toEqual([])
    expect(real.every((f) => f.toks.length > 0 || f.text.trim() === '')).toBe(true)
  })

  it('names the repository root and takes a root and a directory', () => {
    expect(existsSync(join(ROOT, 'package.json'))).toBe(true)
    expect(real.length).toBe(loadSources(ROOT, 'src').length)
    const root = fixture({
      'pkg/b.ts': 'export const b = 1',
      'pkg/a/z.tsx': 'export const z = <i />',
      'pkg/a/types.d.ts': 'export type T = 1',
      'pkg/a/notes.js': 'var x',
      'other/c.ts': 'export const c = 1',
    })
    expect(loadSources(root, 'pkg').map((f) => f.path)).toEqual(['pkg/a/z.tsx', 'pkg/b.ts'])
    expect(loadSources(root, 'other').map((f) => f.path)).toEqual(['other/c.ts'])
    expect(loadSources(root, 'missing')).toEqual([])
  })
})

describe('toSource', () => {
  it('does not see a call inside a string, a template, a line comment or a block comment', () => {
    const src = toSource(
      'src/x.ts',
      [
        "const a = 'exchangeYear(f, a, i, y + 1)'",
        'const b = "cryptoYear(f, a, y + 1)"',
        'const c = `goldYear(f, a, y + 1)`',
        '// fxYear(f, c, g.year + 1)',
        '/* exchangeYear(f, a, i, g.year + 2) */',
        'const d = `plain ${goldYear(f, a, y)} text`',
      ].join('\n'),
    )
    const ids = src.toks.filter((t) => t.k === K_ID).map((t) => t.v)
    expect(ids).not.toContain('exchangeYear')
    expect(ids).not.toContain('cryptoYear')
    expect(ids).not.toContain('fxYear')
    // The only goldYear that is code is the one inside the ${ } hole.
    expect(ids.filter((v) => v === 'goldYear')).toHaveLength(1)
    expect(src.toks.some((t) => t.k === K_STR)).toBe(true)
    expect(src.toks.some((t) => t.k === K_TMPL)).toBe(true)
    expect(src.toks.some((t) => t.k === K_PUNCT)).toBe(true)
    expect(src.toks.some((t) => t.k === K_NUM)).toBe(false)
  })

  it('decides TSX from the extension, so a call inside a JSX expression is seen', () => {
    const tsx = toSource('src/ui/x.tsx', 'export const X = () => <div title="goldYear(a)">{goldYear(f, a, y)}</div>')
    expect(tsx.toks.filter((t) => isId(t, 'goldYear'))).toHaveLength(1)
    expect(tsx.path).toBe('src/ui/x.tsx')
    expect(tsx.text).toContain('<div')
  })
})

describe('isId and isPunct', () => {
  const src = toSource('src/x.ts', "foo(1, 'a')")
  it('match by kind, and by text when given one', () => {
    expect(isId(src.toks[0])).toBe(true)
    expect(isId(src.toks[0], 'foo')).toBe(true)
    expect(isId(src.toks[0], 'bar')).toBe(false)
    expect(isPunct(src.toks[1], '(')).toBe(true)
    expect(isPunct(src.toks[1], ')')).toBe(false)
    expect(isId(src.toks[1])).toBe(false)
    expect(isPunct(src.toks[0], 'foo')).toBe(false)
  })
  it('answer false for a missing token and for a string that looks like one', () => {
    expect(isId(undefined)).toBe(false)
    expect(isPunct(undefined, '(')).toBe(false)
    const str = toSource('src/x.ts', "const s = 'foo'").toks[3]
    expect(str!.k).toBe(K_STR)
    expect(isId(str, 'foo')).toBe(false)
    expect(isPunct(toSource('src/x.ts', "const s = '('").toks[3], '(')).toBe(false)
  })
})

describe('closeParen and splitArgs', () => {
  const code = 'f(a, g(b, c), [1, 2], (x, y) => x + y, `t${h(1, 2)}u`, { k: 1, j: [3, 4] }, "q,)")'
  const src = toSource('src/x.ts', code)
  const open = openOf(src, 'f')

  it('find the close paren through nested calls, arrays, arrows, templates, objects and strings', () => {
    const close = closeParen(src.toks, open)
    expect(close).toBeGreaterThan(open)
    expect(src.toks[close]!.p).toBe(code.lastIndexOf(')'))
    expect(isPunct(src.toks[close], ')')).toBe(true)
  })

  it('split the top-level arguments and nothing deeper', () => {
    const close = closeParen(src.toks, open)
    const args = splitArgs(src.toks, open, close)
    expect(args.map((a) => textOf(src, a))).toEqual(['a', 'g(b, c)', '[1, 2]', '(x, y) => x + y', '`t${h(1, 2)}u`', '{ k: 1, j: [3, 4] }', '"q,)"'])
  })

  it('keep a comma inside a template hole in its argument', () => {
    const t = toSource('src/x.ts', 'f(`${[1, 2].length}`, b)')
    const o = openOf(t, 'f')
    const args = splitArgs(t.toks, o, closeParen(t.toks, o))
    expect(args).toHaveLength(2)
    expect(textOf(t, args[1]!)).toBe('b')
  })

  it('give no arguments for an empty list and ignore one trailing comma', () => {
    const e = toSource('src/x.ts', 'f()')
    expect(splitArgs(e.toks, openOf(e, 'f'), closeParen(e.toks, openOf(e, 'f')))).toEqual([])
    const t = toSource('src/x.ts', 'f(a, b,)')
    const o = openOf(t, 'f')
    expect(splitArgs(t.toks, o, closeParen(t.toks, o))).toHaveLength(2)
  })

  it('answer -1 for a call that never closes and for a token that is not an open paren', () => {
    const cut = toSource('src/x.ts', 'f(a, (b, c)')
    expect(closeParen(cut.toks, openOf(cut, 'f'))).toBe(-1)
    expect(closeParen(src.toks, 0)).toBe(-1)
    expect(closeParen(src.toks, 9999)).toBe(-1)
  })

  it('work on a call that sits inside another call and inside a template hole', () => {
    const t = toSource('src/x.ts', 'outer(`${inner(a, b)}`, inner(c))')
    const first = t.toks.findIndex((x) => isId(x, 'inner')) + 1
    expect(splitArgs(t.toks, first, closeParen(t.toks, first)).map((a) => textOf(t, a))).toEqual(['a', 'b'])
    const o = openOf(t, 'outer')
    expect(splitArgs(t.toks, o, closeParen(t.toks, o))).toHaveLength(2)
  })
})

describe('lineOf', () => {
  const text = 'one\ntwo\n\nfour'
  it('counts lines from 1 by the newlines before the offset', () => {
    expect(lineOf(text, 0)).toBe(1)
    expect(lineOf(text, text.indexOf('two'))).toBe(2)
    expect(lineOf(text, text.indexOf('\n\n') + 1)).toBe(3)
    expect(lineOf(text, text.indexOf('four'))).toBe(4)
    expect(lineOf(text, text.length)).toBe(4)
  })
  it('puts the newline character itself on the line it ends', () => {
    expect(lineOf(text, 3)).toBe(1)
    expect(lineOf(text, 4)).toBe(2)
  })
  it('agrees with a token offset', () => {
    const src = toSource('src/x.ts', 'a\n\nb\nc')
    const b = src.toks.find((t) => isId(t, 'b'))!
    expect(lineOf(src.text, b.p)).toBe(3)
  })
})
