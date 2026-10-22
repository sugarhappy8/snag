// ci: fast
// R2-A2: the pickline codemod (scripts/codemod-pickline.mjs). It rewrites prose pools from pick to pickLine (a static pool,
// or a module-level array) or pickSite (a pool with ${} holes, named by a numeric site key), and never edits text outside token
// ranges. These cases pin every rule on small synthetic sources; the real tree is read by the dry run and, from R2-A3, by
// test/r2-pickline-ratchet.test.ts.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'
import { afterAll, describe, expect, it } from 'vitest'
import { fnv1a } from '../src/game/text/hash'
import {
  IDENTITY_RECEIVERS,
  helperSites,
  relativeImport,
  rewrite,
  siteId,
  siteKey,
  staleSkips,
  type CodemodSite,
  type KeepReason,
  type SkipList,
} from '../scripts/codemod-pickline.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, '..', 'scripts', 'codemod-pickline.mjs')
const PATH = 'src/game/x.ts'
const RNG = "import { pick } from './rng'\n"
const hex8 = (n: number): string => n.toString(16).padStart(8, '0')

/** A source with the rng import in front, rewritten as src/game/x.ts. */
const run = (body: string, path = PATH, head = RNG) => rewrite(path, head + body)
const reasons = (sites: readonly CodemodSite[]): (KeepReason | CodemodSite['action'] | undefined)[] => sites.map((s) => (s.action === 'keep' ? s.reason : s.action))

describe('rule 5: what converts', () => {
  it('1: a static prose pool becomes pickLine, and pick leaves the rng import when nothing else uses it', () => {
    const r = run("export const f = (g: any) => pick(g, ['Hello there.', 'Good day to you.'])\n")
    expect(r.text).toBe("import { pickLine } from './text/pick'\nexport const f = (g: any) => pickLine(g, ['Hello there.', 'Good day to you.'])\n")
    expect(r.changed).toBe(true)
    expect(r.sites).toHaveLength(1)
    const s = r.sites[0]
    expect(s).toMatchObject({ file: PATH, line: 2, action: 'line', pool: 'inline' })
    expect(s.col).toBe("export const f = (g: any) => pick(".indexOf('pick') + 1)
    expect(s.id).toBe('s' + siteId(PATH, "['Hello there.', 'Good day to you.']"))
    expect(s.key).toBeUndefined()
  })

  it('2: a pool with ${} holes becomes pickSite with a stable numeric key', () => {
    const arr = "[`You owe ${n} dollars.`, 'You are broke.']"
    const body = `export const f = (g: any, n: number) => pick(g, ${arr})\n`
    const r = run(body)
    const key = siteKey(PATH, arr)
    expect(r.text).toBe(`import { pickSite } from './text/pick'\nexport const f = (g: any, n: number) => pickSite(g, ${arr}, 0x${hex8(key)})\n`)
    expect(r.sites[0]).toMatchObject({ action: 'site', pool: 'inline', key })
    expect(run(body).text).toBe(r.text) // the same on a second run
    // One character of the array, or the path, gives another key.
    const other = run(body.replace('broke', 'brake'))
    expect(other.sites[0].key).not.toBe(key)
    expect(rewrite('src/game/y.ts', RNG + body).sites[0].key).not.toBe(key)
    expect(rewrite('src/game/y.ts', RNG + body).sites[0].key).toBe(siteKey('src/game/y.ts', arr))
  })

  it('2b: the key goes after the whole array, also for a multi-line pool with a trailing comma and an as const tail', () => {
    const body = ['export const f = (g: any, n: number) =>', '  pick(g, [', '    `One ${n} thing.`,', "    'Two things.',", '  ],', '  )', ''].join('\n')
    const r = run(body)
    const arr = ['[', '    `One ${n} thing.`,', "    'Two things.',", '  ]'].join('\n')
    expect(r.text).toContain(`pickSite(g, ${arr}, 0x${hex8(siteKey(PATH, arr))},\n  )`)
    const c = run("export const f = (g: any, n: number) => pick(g, [`Got ${n} items.`, 'Got none.'] as const)\n")
    expect(c.text).toContain("] as const, 0x")
    expect(c.text).toContain('pickSite(g, [')
  })

  it('3: a single-word pool, a name pool and pools with a spread, an identifier or an object stay', () => {
    const cases: [string, KeepReason][] = [
      ["pick(g, ['red', 'green', 'blue'])", 'single-word'],
      ["pick(g, ['Mary', 'Anna'])", 'single-word'],
      ["pick(g, [...OTHER, 'a b'])", 'not-strings'],
      ["pick(g, ['a b', OTHER])", 'not-strings'],
      ["pick(g, [{ a: 'x y' }, { a: 'z w' }])", 'not-strings'],
      ['pick(g, [1, 2, 3])', 'not-strings'],
      ['pick(g, [])', 'not-strings'],
      ["pick(g, [(x: number) => 'a b', (x: number) => 'c d'])", 'not-strings'],
    ]
    for (const [call, reason] of cases) {
      const r = run(`export const f = (g: any) => ${call}\n`)
      expect(r.changed, call).toBe(false)
      expect(r.text).toBe(RNG + `export const f = (g: any) => ${call}\n`)
      expect(reasons(r.sites), call).toEqual([reason])
    }
  })

  it('4: a module const converts; a function-local const, a let, an imported name, a member list and a call result stay', () => {
    const r = run("const LINES = ['a b', 'c d']\nexport const f = (g: any) => pick(g, LINES)\n")
    expect(r.text).toContain('pickLine(g, LINES)')
    expect(r.sites[0]).toMatchObject({ action: 'line', pool: 'const', id: 'const:LINES' })
    const stays: [string, string][] = [
      ["export function f(g: any) {\n  const LOCAL = ['a b', 'c d']\n  return pick(g, LOCAL)\n}\n", 'function-local const'],
      ["let LINES = ['a b', 'c d']\nexport const f = (g: any) => pick(g, LINES)\n", 'let'],
      ["import { LINES } from './data'\nexport const f = (g: any) => pick(g, LINES)\n", 'imported name'],
      ['export const f = (g: any, x: any) => pick(g, x.names)\n', 'member list'],
      ['export const f = (g: any) => pick(g, mk())\n', 'call result'],
      ["const LINES = ['a b', 'c d']\nexport function f(g: any) {\n  const LINES = ['e f']\n  return pick(g, LINES)\n}\n", 'shadowed name'],
    ]
    for (const [body, what] of stays) {
      const out = run(body)
      expect(out.changed, what).toBe(false)
      expect(reasons(out.sites), what).toEqual(['argument'])
    }
  })

  it('4b: a module const of single words, or of something else, stays for its own reason', () => {
    expect(reasons(run("const KINDS = ['red', 'blue']\nexport const f = (g: any) => pick(g, KINDS)\n").sites)).toEqual(['single-word'])
    expect(reasons(run("const KINDS = [1, 2]\nexport const f = (g: any) => pick(g, KINDS)\n").sites)).toEqual(['not-strings'])
    // A name that is not a module-level array at all.
    expect(reasons(run("const KINDS = new Set(['a b'])\nexport const f = (g: any) => pick(g, KINDS)\n").sites)).toEqual(['argument'])
    // An array that goes on is a call result, not a literal.
    expect(reasons(run("const KINDS = ['a b', 'c d'].map((s) => s)\nexport const f = (g: any) => pick(g, KINDS)\n").sites)).toEqual(['argument'])
    expect(reasons(run("const KINDS = ['a b', 'c d']\n  .concat(OTHER)\nexport const f = (g: any) => pick(g, KINDS)\n").sites)).toEqual(['argument'])
  })

  it('5: an identity receiver keeps the call, an ordinary one converts', () => {
    const r = run("export function f(g: any, p: any) {\n  p.firstName = pick(g, ['Mary Ann', 'Jo Beth'])\n  const text = pick(g, ['It was fine.', 'It was not.'])\n  return text\n}\n")
    expect(reasons(r.sites)).toEqual(['identity', 'line'])
    expect(r.sites[0].receiver).toBe('firstName')
    expect(r.sites[1].receiver).toBe('text')
    expect(r.text).toContain("p.firstName = pick(g, ['Mary Ann', 'Jo Beth'])")
    expect(r.text).toContain("const text = pickLine(g, ['It was fine.', 'It was not.'])")
    // pick is still used by the identity site, so the rng import keeps it.
    expect(r.text.startsWith("import { pick } from './rng'\nimport { pickLine } from './text/pick'\n")).toBe(true)
  })

  it('5b: object keys, annotated declarations and bare assignments are receivers too', () => {
    const forms = [
      "const o = { title: pick(g, ['The Big Show', 'The Small Show']) }",
      "const name: string = pick(g, ['Mary Ann', 'Jo Beth'])",
      "let company = pick(g, ['Acme Corp', 'Beta Corp'])",
      "x.venue = pick(g, ['Town Hall', 'Old Mill'])",
      "const curse: string = pick(g, ['Cold Feet', 'Bad Luck'])",
    ]
    for (const form of forms) {
      const r = run(`export function f(g: any, x: any) {\n  ${form}\n}\n`)
      expect(reasons(r.sites), form).toEqual(['identity'])
      expect(r.changed).toBe(false)
    }
  })

  it('5c: the identity list is the 19 receivers of the plan plus celeb, curse, std and condition', () => {
    for (const n of ['name', 'firstName', 'lastName', 'company', 'brand', 'city', 'job', 'occupation', 'title', 'venue', 'team', 'org', 'client', 'lender', 'injury', 'disease', 'crime', 'school', 'product', 'celeb', 'curse', 'std', 'condition']) {
      expect(IDENTITY_RECEIVERS).toContain(n)
    }
    expect(IDENTITY_RECEIVERS).toHaveLength(23)
  })

  it('6: method calls, a seeded stream, and text inside a string, a template or a comment are untouched', () => {
    const body = [
      "export function f(g: any, k: any, rng: any) {",
      "  const a = rng.pick(g, ['a b', 'c d'])",
      "  const b = seeded(k).pick(g, ['a b', 'c d'])",
      "  const c = k?.pick(g, ['a b', 'c d'])",
      "  const s = \"pick(g, ['a b', 'c d'])\"",
      "  const t = `pick(g, ['a b', 'c d']) ${s}`",
      "  // pick(g, ['a b', 'c d'])",
      "  /* pick(g, ['a b', 'c d']) */",
      "  return [a, b, c, s, t]",
      "}",
      '',
    ].join('\n')
    const r = run(body)
    expect(r.changed).toBe(false)
    expect(r.text).toBe(RNG + body)
    expect(r.sites).toEqual([])
  })

  it('6b: a call inside a template hole is read as code', () => {
    const r = run("export const f = (g: any) => `Said: ${pick(g, ['one two', 'three four'])}.`\n")
    expect(r.text).toContain("`Said: ${pickLine(g, ['one two', 'three four'])}.`")
  })

  it('7: a file with its own pick, no rng import, a renamed import, or its own pickLine is untouched', () => {
    const lines = "['a b', 'c d']"
    const local: [string, string, KeepReason][] = [
      [`function pick(g: any, xs: string[]) { return xs[0] }\nexport const f = (g: any) => pick(g, ${lines})\n`, RNG, 'local-pick'],
      [`export function f(g: any) {\n  const pick = (g: any, xs: string[]) => xs[0]\n  return pick(g, ${lines})\n}\n`, RNG, 'local-pick'],
      [`export function f(g: any) {\n  let pick = Math.max\n  return pick(g, ${lines})\n}\n`, RNG, 'local-pick'],
      [`export const f = (g: any) => pick(g, ${lines})\n`, '', 'no-rng-import'],
      [`export const f = (g: any) => pick(g, ${lines})\n`, "import { pick } from './other'\n", 'no-rng-import'],
      [`export const f = (g: any) => pick(g, ${lines})\n`, "import { pick as choose } from './rng'\n", 'no-rng-import'],
      [`export const f = (g: any) => pick(g, ${lines})\n`, "import type { pick } from './rng'\n", 'no-rng-import'],
      [`export function f(g: any) {\n  const pickLine = (xs: string[]) => xs[0]\n  return pick(g, ${lines})\n}\n`, RNG, 'local-pick'],
    ]
    for (const [body, head, reason] of local) {
      const r = rewrite(PATH, head + body)
      expect(r.changed, body).toBe(false)
      expect(r.text).toBe(head + body)
      expect(reasons(r.sites), body).toEqual([reason])
    }
  })

  it('8: the new import goes on a new line after the rng import, with the right relative path', () => {
    const body = "export const f = (g: any) => pick(g, ['a b', 'c d'])\n"
    const at = (path: string, spec: string): string => rewrite(path, `import { pick } from '${spec}'\n` + body).text.split('\n')[0]
    expect(at('src/game/x.ts', './rng')).toBe("import { pickLine } from './text/pick'")
    expect(at('src/game/special/kit/y.ts', '../../rng')).toBe("import { pickLine } from '../../text/pick'")
    expect(at('src/game/events/z.ts', '../rng')).toBe("import { pickLine } from '../text/pick'")
    // Semicolons and double quotes are kept.
    expect(rewrite('src/game/events/z.ts', 'import { pick } from "../rng";\n' + body).text.split('\n')[0]).toBe('import { pickLine } from "../text/pick";')
  })

  it('8b: pick leaves a longer rng import and keeps the others, whatever its place in the list', () => {
    const body = "export const f = (g: any) => chance(g, 0.5) ? rand(g) : pick(g, ['a b', 'c d'])\n"
    const after = (names: string): string => rewrite('src/game/events/z.ts', `import { ${names} } from '../rng'\nimport type { GameState } from '../types'\n` + body).text.split('\n').slice(0, 3).join('\n')
    const tail = "\nimport { pickLine } from '../text/pick'\nimport type { GameState } from '../types'"
    expect(after('chance, pick, rand')).toBe("import { chance, rand } from '../rng'" + tail)
    expect(after('pick, chance, rand')).toBe("import { chance, rand } from '../rng'" + tail)
    expect(after('chance, rand, pick')).toBe("import { chance, rand } from '../rng'" + tail)
    expect(after('chance, rand, pick,')).toBe("import { chance, rand, } from '../rng'" + tail)
  })

  it('8c: pick leaves a multi-line rng import without leaving a blank line', () => {
    const body = "export const f = (g: any) => chance(g, 0.5) ? rand(g) : pick(g, ['a b', 'c d'])\n"
    const cases: [string, string][] = [
      ['  chance,\n  pick,\n  rand,\n', '  chance,\n  rand,\n'],
      ['  pick,\n  chance,\n  rand,\n', '  chance,\n  rand,\n'],
      ['  chance,\n  rand,\n  pick,\n', '  chance,\n  rand,\n'],
      ['  chance,\n  rand,\n  pick\n', '  chance,\n  rand\n'],
    ]
    for (const [list, kept] of cases) {
      const r = rewrite('src/game/events/z.ts', `import {\n${list}} from '../rng'\n` + body)
      expect(r.text.startsWith(`import {\n${kept}} from '../rng'\nimport { pickLine } from '../text/pick'\nexport const f`), list).toBe(true)
    }
  })

  it('8d: pick stays in the import while anything still refers to it, and a property named pick is not a reference', () => {
    const conv = "export const f = (g: any) => pick(g, ['a b', 'c d'])\n"
    const kept = "export const h = (g: any, items: string[]) => pick(g, items)\n"
    const r = run(conv + kept)
    expect(r.text.split('\n').slice(0, 2)).toEqual(["import { pick } from './rng'", "import { pickLine } from './text/pick'"])
    const prop = run(conv + "export const o = { pick: 1 }\n")
    expect(prop.text.split('\n')[0]).toBe("import { pickLine } from './text/pick'")
    const passed = run(conv + 'export const m = [1].map(pick as any)\n')
    expect(passed.text.split('\n')[0]).toBe("import { pick } from './rng'")
  })

  it('8e: an existing import of the kit is extended, not repeated', () => {
    const head = "import { pick } from './rng'\nimport { pickLine } from './text/pick'\n"
    const body = "export const f = (g: any, n: number) => pick(g, [`n is ${n}`, 'n is big'])\nexport const h = (g: any) => pick(g, ['a b', 'c d'])\n"
    const r = rewrite(PATH, head + body)
    expect(r.text.split('\n').slice(0, 2)).toEqual(["import { pickLine, pickSite } from './text/pick'", expect.stringContaining('export const f')])
    expect(r.text.match(/from '\.\/text\/pick'/g)).toHaveLength(1)
    // A name that is already imported from the kit is not imported twice.
    const twice = rewrite(PATH, "import { pick } from './rng'\nimport { pickLine } from './text/pick'\nexport const h = (g: any) => pick(g, ['a b', 'c d'])\n")
    expect(twice.text).toBe("import { pickLine } from './text/pick'\nexport const h = (g: any) => pickLine(g, ['a b', 'c d'])\n")
  })

  it('8f: both names are imported on one line, in a fixed order', () => {
    const r = run("export const f = (g: any, n: number) => [pick(g, [`n ${n} x`, 'm n']), pick(g, ['a b', 'c d'])]\n")
    expect(r.text.split('\n')[0]).toBe("import { pickLine, pickSite } from './text/pick'")
  })

  it('9: a second run changes nothing', () => {
    for (const src of SAMPLES) {
      const once = rewrite(PATH, src)
      const twice = rewrite(PATH, once.text)
      expect(twice.changed, src).toBe(false)
      expect(twice.text).toBe(once.text)
      expect(twice.sites.filter((s) => s.action !== 'keep'), src).toEqual([])
    }
  })

  it('10: a skip entry keeps its site and is not stale; one that matches nothing is stale', () => {
    const arr = "['a b', 'c d']"
    const src = `${RNG}export const f = (g: any) => pick(g, ${arr})\nconst L = ['e f', 'g h']\nexport const h = (g: any) => pick(g, L)\n`
    const id = 's' + siteId(PATH, arr)
    const skip: SkipList = { v: 1, skip: [{ file: PATH, site: id, reason: 'typed result' }, { file: PATH, site: 'const:L', reason: 'identity list' }, { file: PATH, site: 'sdeadbeef', reason: 'gone now' }, { file: 'src/game/gone.ts', site: id, reason: 'file removed' }] }
    const r = rewrite(PATH, src, { skip })
    expect(r.changed).toBe(false)
    expect(reasons(r.sites)).toEqual(['skip-list', 'skip-list'])
    expect(staleSkips(skip, r.sites).map((e) => e.site + '@' + e.file)).toEqual(['sdeadbeef@' + PATH, id + '@src/game/gone.ts'])
    expect(staleSkips({ v: 1, skip: [] }, r.sites)).toEqual([])
    // Without the list the same sites convert.
    expect(reasons(rewrite(PATH, src).sites)).toEqual(['line', 'line'])
  })

  it('11: every rewritten source still parses', async () => {
    for (const src of SAMPLES) {
      const out = rewrite(PATH, src).text
      await expect(transform(out, { loader: 'ts' }), out).resolves.toBeTruthy()
    }
    const tsx = "import { pick } from './rng'\nexport const A = ({ g }: { g: any }) => <p>{pick(g, ['one two', 'three four'])}</p>\n"
    const t = rewrite('src/ui/A.tsx', tsx)
    expect(t.text).toContain('pickLine(g, ')
    expect(t.text.split('\n')[0]).toBe("import { pickLine } from '../game/text/pick'")
    await expect(transform(t.text, { loader: 'tsx' })).resolves.toBeTruthy()
  })

  it('12: two equal arrays in one file share a key; two different texts with one key throw', () => {
    const arr = "[`a ${n} b`, 'c d']"
    const r = run(`export const f = (g: any, n: number) => [pick(g, ${arr}), pick(g, ${arr})]\n`)
    expect(r.sites.map((s) => s.action)).toEqual(['site', 'site'])
    expect(r.sites[0].key).toBe(r.sites[1].key)
    const [a, b] = findCollision(PATH)
    expect(a).not.toBe(b)
    expect(siteKey(PATH, a)).toBe(siteKey(PATH, b))
    expect(() => run(`export const f = (g: any, n: number) => [pick(g, ${a}), pick(g, ${b})]\n`)).toThrow(/collision/i)
    // A pickSite that is already in the file counts too: its key is read back from the third argument.
    const old = `export const f = (g: any, n: number) => pickSite(g, ${a}, 0x${hex8(siteKey(PATH, a))})\n`
    expect(() => rewrite(PATH, RNG + old + `export const h = (g: any, n: number) => pick(g, ${b})\n`)).toThrow(/collision/i)
    expect(rewrite(PATH, RNG + old + `export const h = (g: any, n: number) => pick(g, ${a})\n`).sites[0].key).toBe(siteKey(PATH, a))
  })

  it('14: any bare identifier is the state argument; a call or a member is not', () => {
    const pool = "['a b', 'c d']"
    const r = run(`export const f = (gg: any, n: any, g2: any) => [pick(gg, ${pool}), pick(n, ${pool}), pick(g2, ${pool})]\n`)
    expect(reasons(r.sites)).toEqual(['line', 'line', 'line'])
    const no = run(`export const f = (g: any) => [pick(f(), ${pool}), pick(g.x, ${pool}), pick(new G(), ${pool})]\n`)
    expect(no.changed).toBe(false)
    expect(no.sites).toEqual([])
  })

  it('15: a typed const and an as-const pool convert; an array of lambdas stays', () => {
    const r = run("const A: readonly string[] = ['a b', 'c d']\nconst B = ['e f', 'g h'] as const\nconst C = [(n: number) => `x ${n}`, (n: number) => `y ${n}`]\nexport const f = (g: any) => [pick(g, A), pick(g, B), pick(g, ['i j', 'k l'] as const), pick(g, C)(1)]\n")
    expect(reasons(r.sites)).toEqual(['line', 'line', 'line', 'not-strings'])
    expect(r.text).toContain('pickLine(g, A)')
    expect(r.text).toContain('pickLine(g, B)')
    expect(r.text).toContain("pickLine(g, ['i j', 'k l'] as const)")
    expect(r.text).toContain('pick(g, C)(1)')
  })

  it('15b: extra arguments keep the call', () => {
    const r = run("export const f = (g: any) => pick(g, ['a b', 'c d'], 3)\n")
    expect(reasons(r.sites)).toEqual(['extra-args'])
    expect(r.changed).toBe(false)
  })

  it('16: a result that the code branches on is a decision and stays', () => {
    const decisions: [string, string][] = [
      ["const r = pick(g, ['a b', 'c d'])\n  if (r === 'a b') go()", '==='],
      ["const r = pick(g, ['a b', 'c d'])\n  if ('a b' !== r) go()", '!== on the left'],
      ["let r = pick(g, ['a b', 'c d'])\n  if (r != null) go()", '!='],
      ["const r = pick(g, ['a b', 'c d'])\n  switch (r) { case 'a b': go() }", 'switch'],
      ["const r = pick(g, ['a b', 'c d'])\n  const x = REC[r]", 'index'],
      ["const r: string = pick(g, ['a b', 'c d'])\n  const x = r.includes('b')", 'includes receiver and an annotation'],
      ["const r = pick(g, ['a b', 'c d'])\n  const x = r.startsWith('a')", 'startsWith'],
      ["const r = pick(g, ['a b', 'c d'])\n  const x = r.endsWith('a')", 'endsWith'],
      ["const r = pick(g, ['a b', 'c d'])\n  const x = r.indexOf('a')", 'indexOf'],
      ["const r = pick(g, ['a b', 'c d'])\n  const x = /a/.test(r) ? r.match(/b/) : null", 'match'],
      ["const r = pick(g, ['a b', 'c d'])\n  const x = LIST.includes(r)", 'argument of includes'],
      ["const r = pick(g, ['a b', 'c d'])\n  const x = LIST.indexOf(r)", 'argument of indexOf'],
      ["const r = pick(g, ['a b', 'c d'])\n  switch (go()) { case r: go() }", 'case'],
      ["let r: string\n  r = pick(g, ['a b', 'c d'])\n  if (r === 'a b') go()", 'a bare assignment'],
      ["if (pick(g, ['a b', 'c d']) === 'a b') go()", 'the call as an operand'],
      ["if ('a b' == pick(g, ['a b', 'c d'])) go()", 'the call on the right'],
      ["const x = pick(g, ['a b', 'c d']).includes('a')", 'the call as a receiver'],
      ["const x = REC[pick(g, ['a b', 'c d'])]", 'the call as an index'],
      ["const x = LIST.includes(pick(g, ['a b', 'c d']))", 'the call as an argument'],
      ["switch (pick(g, ['a b', 'c d'])) { case 'a b': go() }", 'the call as a switch subject'],
    ]
    for (const [code, what] of decisions) {
      const r = run(`export function f(g: any) {\n  ${code}\n}\n`)
      expect(reasons(r.sites), what).toEqual(['decision'])
      expect(r.changed, what).toBe(false)
    }
    // A result that only reaches a template converts, and so does one that is only passed on.
    const ok = run("export function f(g: any) {\n  const r = pick(g, ['a b', 'c d'])\n  notice(g, 'Title', `You said ${r}.`)\n  return r\n}\n")
    expect(reasons(ok.sites)).toEqual(['line'])
    // The check reads the whole file: the name branched on in another function still holds the call back.
    const wide = run("export function f(g: any) {\n  const r = pick(g, ['a b', 'c d'])\n  return r\n}\nexport function h(r: string) {\n  return r === 'x'\n}\n")
    expect(reasons(wide.sites)).toEqual(['decision'])
  })

  it('18: the report counts a site once and gives every one a 1-based line and column', () => {
    const r = run("export const f = (g: any) => [\n  pick(g, ['a b', 'c d']),\n  pick(g, ['e f', 'g h']),\n]\n")
    expect(r.sites.map((s) => [s.line, s.col])).toEqual([[3, 3], [4, 3]])
  })
})

describe('helperSites (the routed helpers, for the A3 review)', () => {
  it('17: classifies eraPick and v calls by their pool', () => {
    const src = [
      "import { eraPick, eraLines } from './era'",
      "import { v } from './helpers'",
      "const POOL = ['a b', 'c d']",
      'export function f(g: any, x: any, o: any) {',
      "  const a = eraPick(g, ['a b', 'c d'])",
      "  const b = eraPick(g, [`a ${x} b`, 'c d'])",
      '  const c = eraPick(g, POOL)',
      '  const d = eraPick(g, other)',
      "  const e = v(g, ['a b'])",
      "  const h = eraPick(g.x, ['a b'])",
      '  const i = eraPick(g, x.lines)',
      "  o.occupation = eraPick(g, ['a b', 'c d'])",
      '  const j = v(g, [{ a: 1 }, { a: 2 }])',
      '  return eraLines(g, POOL)',
      '}',
      '',
    ].join('\n')
    const sites = helperSites('src/game/events/z.ts', src)
    expect(sites.map((s) => [s.line, s.callee, s.pool, s.receiver])).toEqual([
      [5, 'eraPick', 'inline-static', 'a'],
      [6, 'eraPick', 'inline-hole', 'b'],
      [7, 'eraPick', 'const', 'c'],
      [8, 'eraPick', 'other', 'd'],
      [9, 'v', 'inline-static', 'e'],
      [12, 'eraPick', 'inline-static', 'occupation'],
      [13, 'v', 'other', 'j'],
    ])
    expect(sites[0].file).toBe('src/game/events/z.ts')
  })

  it('returns nothing for a file that declares its own v or eraPick, or imports neither', () => {
    expect(helperSites('src/game/a.ts', "const v = (g: any, xs: string[]) => xs[0]\nexport const f = (g: any) => v(g, ['a b'])\n")).toEqual([])
    expect(helperSites('src/game/a.ts', "import { v } from './helpers'\nfunction v2() {}\nexport const f = (g: any) => w(g, ['a b'])\n")).toEqual([])
    expect(helperSites('src/game/a.ts', "import { v } from './other'\nexport const f = (g: any) => v(g, ['a b'])\n")).toEqual([])
    expect(helperSites('src/game/a.ts', "export const f = (g: any) => eraPick(g, ['a b'])\n")).toEqual([])
    expect(helperSites('src/game/a.ts', "import { v } from '../events/helpers'\nfunction v(g: any, x: any) { return x }\nexport const f = (g: any) => v(g, ['a b'])\n")).toEqual([])
  })
})

describe('the helpers of the script', () => {
  it('13: relativeImport', () => {
    const pairs: [string, string, string][] = [
      ['src/game/x.ts', 'src/game/text/pick', './text/pick'],
      ['src/game/events/z.ts', 'src/game/text/pick', '../text/pick'],
      ['src/game/special/kit/y.ts', 'src/game/text/pick', '../../text/pick'],
      ['src/ui/A.tsx', 'src/game/text/pick', '../game/text/pick'],
      ['src/game/text/index.ts', 'src/game/text/pick', './pick'],
      ['src/game/rng.ts', 'src/game/text/pick.ts', './text/pick'],
    ]
    for (const [from, to, want] of pairs) expect(relativeImport(from, to), from).toBe(want)
  })

  it('siteId is the FNV-1a of path, U+001F and the array text, as eight lowercase hex digits, like the kit hash', () => {
    const cases: [string, string][] = [
      ['src/game/a.ts', "['a b', 'c d']"],
      ['src/game/special/kit/y.ts', '[`x ${n} y`]'],
      ['', ''],
      ['src/game/é.ts', "['café au lait', 'naïve idea']"],
      ['src/game/z.ts', "['😀 smile', 'frown :(']"],
    ]
    for (const [path, raw] of cases) {
      const want = fnv1a(path + '\u001f' + raw).toString(16).padStart(8, '0')
      expect(siteId(path, raw), path).toBe(want)
      expect(siteKey(path, raw)).toBe(fnv1a(path + '\u001f' + raw))
      expect(siteId(path, raw)).toMatch(/^[0-9a-f]{8}$/)
    }
  })
})

describe('the command line', () => {
  const dirs: string[] = []
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

  function tree(): string {
    const root = mkdtempSync(join(tmpdir(), 'codemod-'))
    dirs.push(root)
    const put = (rel: string, text: string): void => {
      mkdirSync(dirname(join(root, rel)), { recursive: true })
      writeFileSync(join(root, rel), text)
    }
    put('src/game/a.ts', "import { pick } from './rng'\nexport const a = (g: any) => pick(g, ['One two.', 'Three four.'])\nexport const n = (g: any, o: any) => { o.name = pick(g, ['Mary Ann', 'Jo Beth']) }\n")
    put('src/game/events/b.ts', "import { pick } from '../rng'\nexport const b = (g: any, n: number) => pick(g, [`Got ${n} now.`, 'Got none.'])\nexport const w = (g: any) => pick(g, ['red', 'blue'])\nexport const p = (g: any, o: any) => { o.firstName = pick(g, ['Mary Ann', 'Jo Beth']) }\n")
    put('src/game/events/c.ts', "import { eraPick } from './era'\nimport { v } from './helpers'\nexport const c = (g: any) => [eraPick(g, ['a b', 'c d']), v(g, ['e f', 'g h'])]\n")
    put('src/game/text/pick.ts', "export const pickLine = 1\n")
    return root
  }

  const cli = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

  it('a dry run counts and writes nothing', () => {
    const root = tree()
    const before = readFileSync(join(root, 'src/game/a.ts'), 'utf8')
    const r = cli(['--root', root])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('converted: 2 (line 1, site 1) in 2 files')
    expect(r.stdout).toContain('keep identity: 2')
    expect(r.stdout).toContain('keep single-word: 1')
    expect(r.stdout).toContain('firstName 1')
    expect(r.stdout).toContain('name 1')
    expect(r.stdout).toContain('stale skip entries: 0')
    expect(readFileSync(join(root, 'src/game/a.ts'), 'utf8')).toBe(before)
  })

  it('--list prints one line per converted site and --helpers one per helper site', () => {
    const root = tree()
    const list = cli(['--root', root, '--list']).stdout.split('\n').filter((l) => /^src\/\S+:\d+:\d+ (line|site) /.test(l))
    expect(list).toHaveLength(2)
    expect(list[0]).toMatch(/^src\/game\/a\.ts:2:\d+ line - s[0-9a-f]{8} /)
    // The key and the id are the same eight digits, so a skip entry can be written from either.
    expect(list[1]).toMatch(/^src\/game\/events\/b\.ts:2:\d+ site 0x([0-9a-f]{8}) s\1 /)
    const helpers = cli(['--root', root, '--helpers']).stdout.split('\n').filter((l) => l.startsWith('src/'))
    expect(helpers).toEqual(['src/game/events/c.ts:3 eraPick - inline-static', 'src/game/events/c.ts:3 v - inline-static'])
  })

  it('--only narrows the files, and --report writes the sites as JSON', () => {
    const root = tree()
    const out = join(root, 'report.json')
    const r = cli(['--root', root, '--only', 'events/', '--report', out])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('converted: 1 (line 0, site 1) in 1 files')
    const rep = JSON.parse(readFileSync(out, 'utf8')) as { sites: CodemodSite[]; stale: unknown[] }
    expect(rep.sites.every((s) => s.file.includes('events/'))).toBe(true)
    expect(rep.stale).toEqual([])
  })

  it('--apply writes the changed files once, prints their paths, and a second apply prints none', () => {
    const root = tree()
    const r = cli(['--root', root, '--apply'])
    expect(r.status).toBe(0)
    expect(r.stdout.trim().split('\n')).toEqual(['src/game/a.ts', 'src/game/events/b.ts'])
    expect(readFileSync(join(root, 'src/game/a.ts'), 'utf8')).toContain('pickLine(g, [')
    expect(readFileSync(join(root, 'src/game/events/b.ts'), 'utf8')).toMatch(/pickSite\(g, \[`Got \$\{n\} now\.`, 'Got none\.'\], 0x[0-9a-f]{8}\)/)
    expect(readFileSync(join(root, 'src/game/events/c.ts'), 'utf8')).toContain("eraPick(g, ['a b', 'c d'])")
    expect(readFileSync(join(root, 'src/game/text/pick.ts'), 'utf8')).toBe('export const pickLine = 1\n')
    const again = cli(['--root', root, '--apply'])
    expect(again.status).toBe(0)
    expect(again.stdout.trim()).toBe('')
  })

  it('exits 2 on bad usage', () => {
    expect(cli(['--nope']).status).toBe(2)
    expect(cli(['--report']).status).toBe(2)
    expect(cli(['--root']).status).toBe(2)
    expect(cli(['--root', '/definitely/not/here']).status).toBe(2)
  })
})

/**
 * A pair of different array texts that give the same siteId for the path. FNV-32 collides after about 77,000 random texts, but not
 * for texts that differ only in a run of decimal digits (they never collide), so the varying part is a base-36 string.
 */
function findCollision(path: string): [string, string] {
  const seen = new Map<string, string>()
  for (let i = 0; i < 800_000; i++) {
    const raw = '[`a ${x} ' + (i * 7919).toString(36) + "`, 'b c']"
    const id = siteId(path, raw)
    const prev = seen.get(id)
    if (prev !== undefined) return [prev, raw]
    seen.set(id, raw)
  }
  throw new Error('no collision found')
}

/** Sources for the idempotence and parse cases: every kind of site, held-back sites, imports of both shapes. */
const SAMPLES: string[] = [
  "import { pick } from './rng'\nexport const f = (g: any) => pick(g, ['a b', 'c d'])\n",
  "import { chance, pick, rand } from './rng'\nexport const f = (g: any, n: number) => chance(g, 0.1) ? pick(g, [`n ${n} here`, 'n none']) : pick(g, ['a b', 'c d']) + rand(g)\n",
  "import {\n  chance,\n  pick,\n} from './rng'\nconst L = ['a b', 'c d']\nexport const f = (g: any, p: any, xs: string[]) => {\n  p.name = pick(g, ['Mary Ann', 'Jo Beth'])\n  const r = pick(g, ['x y', 'z w'])\n  if (r === 'x y') return chance(g, 0.5)\n  return [pick(g, L), pick(g, xs), pick(g, ['red', 'blue'])]\n}\n",
  "import { pick } from './rng';\nexport const f = (g: any) => `Said: ${pick(g, ['one two', 'three four'])}.`;\n",
  "import { pick } from './rng'\nexport const f = (g: any, n: number) => [\n  pick(g, [\n    `One ${n} thing.`,\n    'Two things.',\n  ]),\n  pick(g, ['a b'] as const),\n]\n",
]
