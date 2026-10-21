// ci: fast
// R2-A3 (D10): the pickline ratchet. After the codemod ran, a prose pool written with pick(g, ...) is a repeat waiting to happen
// (pick has no memory). The ratchet runs the codemod in dry-run over src/ and fails on any prose pool that is still written with
// pick and is not on scripts/codemod-pickline-skip.json, so the fix survives later tracks. The rule for every later track is one
// line: a prose pool is pickLine (pickSite when its lines have ${} holes); an identity pool (a name, a title, a thing stored on a
// Person or an Asset, a value the code branches on) stays pick, and a pool that the mutation test found in state is on the skip list.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rewrite, staleSkips, type CodemodSite, type SkipEntry, type SkipList } from '../scripts/codemod-pickline.mjs'
import { K_NUM, ROOT, closeParen, isId, isPunct, loadSources, splitArgs, toSource, type SourceFile } from './scan-kit'

const SKIP_FILE = join(ROOT, 'scripts', 'codemod-pickline-skip.json')
const SITE = /^(s[0-9a-f]{8}|const:[A-Za-z_$][A-Za-z0-9_$]*)$/
/** business/nepo-asks.ts declares its own local hash helper called pickLine (line 269): it is not the text kit's. */
const OWN_PICKLINE = new Set(['src/game/business/nepo-asks.ts'])

function readSkip(): SkipList {
  return JSON.parse(readFileSync(SKIP_FILE, 'utf8')) as SkipList
}

/** `path:line id` of every prose pool of these files that is still written with pick and is not on the skip list. */
function unconverted(files: readonly SourceFile[], skip: SkipList): string[] {
  const out: string[] = []
  for (const f of files) {
    for (const s of rewrite(f.path, f.text, { skip }).sites) {
      if (s.action !== 'keep') out.push(`${f.path}:${s.line} ${s.id}`)
    }
  }
  return out
}

/** The sites of every file, for the stale check. */
function allSites(files: readonly SourceFile[], skip: SkipList): CodemodSite[] {
  return files.flatMap((f) => rewrite(f.path, f.text, { skip }).sites)
}

/** The problems with the entries themselves: a bad site id, a short reason, a dash. */
function badEntries(skip: SkipList): string[] {
  const out: string[] = []
  for (const e of skip.skip) {
    const label = `${e.file} ${e.site}`
    if (!SITE.test(e.site)) out.push(`${label}: site must be 's' and 8 hex digits, or 'const:NAME'`)
    if (typeof e.reason !== 'string' || e.reason.trim().length < 6) out.push(`${label}: the reason needs at least 6 characters`)
    if (/[\u2013\u2014]/.test(`${e.file}${e.site}${e.reason}`)) out.push(`${label}: no em-dash or en-dash in a skip entry`)
  }
  return out
}

/** `key -> distinct pools` over every pickSite call of these files: a key is shared only by equal arrays of one file. */
function siteKeyClashes(files: readonly SourceFile[]): string[] {
  const pools = new Map<number, Set<string>>()
  for (const f of files) {
    if (f.path.startsWith('src/game/text/')) continue
    f.toks.forEach((t, i) => {
      if (!isId(t, 'pickSite') || !isPunct(f.toks[i + 1], '(') || isPunct(f.toks[i - 1], '.')) return
      const close = closeParen(f.toks, i + 1)
      const args = close < 0 ? [] : splitArgs(f.toks, i + 1, close)
      if (args.length !== 3 || args[2].length !== 1 || args[2][0].k !== K_NUM) return
      const key = Number(f.text.slice(args[2][0].p, args[2][0].e).replace(/_/g, ''))
      const raw = f.text.slice(args[1][0].p, args[1][args[1].length - 1].e)
      const set = pools.get(key) ?? new Set<string>()
      set.add(`${f.path}\u001f${raw}`)
      pools.set(key, set)
    })
  }
  return [...pools].filter(([, set]) => set.size > 1).map(([key, set]) => `0x${key.toString(16).padStart(8, '0')}: ${[...set].map((x) => x.split('\u001f')[0]).join(', ')}`)
}

/** `path:line` of every declaration of pickLine or pickSite outside src/game/text/. */
function ownDeclarations(files: readonly SourceFile[]): string[] {
  const out: string[] = []
  for (const f of files) {
    if (f.path.startsWith('src/game/text/') || OWN_PICKLINE.has(f.path)) continue
    f.toks.forEach((t, i) => {
      if (!isId(t, 'pickLine') && !isId(t, 'pickSite')) return
      const before = f.toks[i - 1]
      if (before && isId(before) && ['function', 'const', 'let', 'var', 'class'].includes(before.v)) out.push(`${f.path}:${t.v}`)
    })
  }
  return out
}

const src = loadSources()

describe('r2 pickline ratchet: the real tree', () => {
  const skip = readSkip()

  it('1: no prose pool of src/ is still written with pick unless it is on the skip list', () => {
    const left = unconverted(src, skip)
    expect(left, 'convert it (pickLine; pickSite when the lines have ${} holes), or keep pick and add a skip entry with the reason').toEqual([])
  })

  it('2: no skip entry is stale', () => {
    expect(staleSkips(skip, allSites(src, skip))).toEqual([])
  })

  it('3: every skip entry is well formed (site id, a reason of 6 or more characters, no dashes)', () => {
    expect(skip.v).toBe(1)
    expect(badEntries(skip)).toEqual([])
    const seen = new Set<string>()
    for (const e of skip.skip) {
      const k = `${e.file} ${e.site}`
      expect(seen.has(k), `duplicate skip entry ${k}`).toBe(false)
      seen.add(k)
    }
  })

  it('4: the numeric keys of all pickSite calls are distinct (equal arrays of one file share one on purpose)', () => {
    expect(siteKeyClashes(src)).toEqual([])
  })

  it('5: no file outside src/game/text/ declares its own pickLine or pickSite, bar business/nepo-asks.ts', () => {
    expect(ownDeclarations(src)).toEqual([])
    // The exemption is real: that file does declare its own.
    const nepo = src.find((f) => f.path === 'src/game/business/nepo-asks.ts')
    expect(nepo?.text).toMatch(/const pickLine = /)
  })

  it('the scan is not vacuous: the codemod still sees the pick calls that stay, and the tree has converted pools', () => {
    const sites = allSites(src, skip)
    expect(sites.length).toBeGreaterThan(300)
    expect(sites.filter((s) => s.reason === 'skip-list').length).toBeGreaterThanOrEqual(skip.skip.length)
    expect(src.filter((f) => /\bpickLine\(|\bpickSite\(/.test(f.text)).length).toBeGreaterThan(90)
  })
})

describe('r2 pickline ratchet: the checks fail on a synthetic violation', () => {
  const RNG = "import { pick } from './rng'\n"
  const prose = (path: string): SourceFile => toSource(path, `${RNG}export const f = (g: never) => pick(g, ['A line with words.', 'Another line with words.'])\n`)
  const none: SkipList = { v: 1, skip: [] }

  it('1: a new prose pick is reported, a skip entry silences it, an identity pool is never reported', () => {
    const f = prose('src/game/x.ts')
    const left = unconverted([f], none)
    expect(left).toHaveLength(1)
    const id = left[0].split(' ')[1]
    const skipped: SkipList = { v: 1, skip: [{ file: 'src/game/x.ts', site: id, reason: 'stored on a person' }] }
    expect(unconverted([f], skipped)).toEqual([])
    const identity = toSource('src/game/y.ts', `${RNG}export const g2 = (g: never) => { const name = pick(g, ['Mary Ann', 'Jo Beth']); return name }\n`)
    expect(unconverted([identity], none)).toEqual([])
    const converted = toSource('src/game/z.ts', "import { pickLine } from './text/pick'\nexport const h = (g: never) => pickLine(g, ['A line with words.', 'Another line with words.'])\n")
    expect(unconverted([converted], none)).toEqual([])
  })

  it('2: an entry that matches no live site is stale', () => {
    const f = prose('src/game/x.ts')
    const entry: SkipEntry = { file: 'src/game/x.ts', site: 's00000000', reason: 'gone for good' }
    expect(staleSkips({ v: 1, skip: [entry] }, allSites([f], { v: 1, skip: [entry] }))).toEqual([entry])
  })

  it('3: a short reason, a bad site and a dash are reported', () => {
    const bad: SkipList = {
      v: 1,
      skip: [
        { file: 'src/a.ts', site: 's1234abcd', reason: 'no' },
        { file: 'src/a.ts', site: 'oops', reason: 'a long enough reason' },
        { file: 'src/a.ts', site: 'const:POOL', reason: 'a long reason \u2014 with a dash' },
        { file: 'src/a.ts', site: 'const:POOL', reason: 'a long reason \u2013 with a short dash' },
        { file: 'src/a.ts', site: 'const:POOL', reason: 'a good reason' },
      ],
    }
    expect(badEntries(bad)).toHaveLength(4)
  })

  it('4: two different pools with one key are reported, two equal pools are not', () => {
    const call = (pool: string, key: string): string => `pickSite(g, [${pool}], ${key})`
    const mk = (path: string, body: string[]): SourceFile => toSource(path, `export const f = (g: never) => {\n${body.join('\n')}\n}\n`)
    const a = mk('src/game/a.ts', [call("`Hi ${1} there`, 'Two words'", '0x1'), call("`Hi ${1} there`, 'Two words'", '0x1')])
    expect(siteKeyClashes([a])).toEqual([])
    const b = mk('src/game/b.ts', [call("`Hi ${1} there`, 'Two words'", '0x1'), call("`Hi ${2} there`, 'Two words'", '0x1')])
    expect(siteKeyClashes([b])).toHaveLength(1)
    const c = mk('src/game/c.ts', [call("`Hi ${1} there`, 'Two words'", '0x1')])
    expect(siteKeyClashes([a, c])).toHaveLength(1)
  })

  it('5: a file that declares its own pickLine is reported, one that calls the kit is not', () => {
    expect(ownDeclarations([toSource('src/game/a.ts', 'function pickLine(xs: string[]) { return xs[0] }\n')])).toEqual(['src/game/a.ts:pickLine'])
    expect(ownDeclarations([toSource('src/game/a.ts', 'const pickSite = 3\n')])).toEqual(['src/game/a.ts:pickSite'])
    expect(ownDeclarations([toSource('src/game/a.ts', "import { pickLine } from './text/pick'\npickLine(g, L)\n")])).toEqual([])
    expect(ownDeclarations([toSource('src/game/business/nepo-asks.ts', 'function pickLine() {}\n')])).toEqual([])
    expect(ownDeclarations([toSource('src/game/text/pick.ts', 'export function pickLine() {}\n')])).toEqual([])
  })
})
