// ci: fast
// R1-A8 (G.14): the lazy-zone guard. A chunk only exists if nothing reaches it statically, so this test reads src as
// text (test/lazy-kit.ts) and checks three things. Every module a gate file imports dynamically is absent from the
// static closure of src/main.tsx. Nothing outside the chart zone (src/ui/charts/) and the palette zone (the five
// files in PALETTE_ZONE) imports a zone file at run time except through its gate (src/ui/charts/lazy.tsx and
// src/ui/nav/lazy.tsx, made with lazyView), and a gate imports no zone file statically. `import type` is free.
// The fence is live from a zone's first file, but the gate is only required once the zone's dispatcher exists
// (src/ui/charts/ChartView.tsx, src/ui/nav/Palette.tsx): the chart helpers of R1-C2 to R1-C8 land before the gate of
// R1-C9, and this test has to stay green in every merge order. Each rule is also run on a synthetic tree in
// os.tmpdir() to prove it can fail.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { closure, dynamicImports, dynamicSpecifiers, listSources, resolve, staticImports, staticSpecifiers } from './lazy-kit'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The palette zone (G.9): the one lazy chunk's modules. `place.ts`, `prefs.ts`, `shortcuts.ts`, `reopen.ts`, `Breadcrumbs.tsx`,
 *  `NeedsYouCard.tsx`, `CockpitBody.tsx` and `hubs/*` are outside it and may use `import type` from it, nothing else. */
const PALETTE_ZONE = [
  'src/ui/nav/Palette.tsx',
  'src/ui/nav/paletteModel.ts',
  'src/ui/nav/searchIndex.ts',
  'src/ui/nav/searchRank.ts',
  'src/ui/nav/useSearchIndex.ts',
]

interface Zone {
  name: string
  inZone(path: string): boolean
  /** The gate: the only file outside the zone that may import it, and only dynamically. */
  gate: string
  /** True when the zone modules that exist mean the gate must exist too. */
  needsGate(members: readonly string[]): boolean
  /** A module the gate must import dynamically; any dynamic import will do when this is absent. */
  loads?: string
}

const CHARTS: Zone = {
  name: 'charts',
  inZone: (p) => p.startsWith('src/ui/charts/'),
  gate: 'src/ui/charts/lazy.tsx',
  // The dispatcher, as the palette zone has Palette.tsx: R1-C2 to R1-C8 add chart files before R1-C9 lands ChartView.tsx
  // and lazy.tsx together, so a gate required from the first file could not go green in any merge order.
  needsGate: (members) => members.includes('src/ui/charts/ChartView.tsx'),
  loads: 'src/ui/charts/ChartView.tsx',
}

const PALETTE: Zone = {
  name: 'palette',
  inZone: (p) => PALETTE_ZONE.includes(p),
  gate: 'src/ui/nav/lazy.tsx',
  needsGate: (members) => members.includes('src/ui/nav/Palette.tsx'),
  loads: 'src/ui/nav/Palette.tsx',
}

/** A path relative to the root, with forward slashes. */
function rel(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

/** A file that starts chunks: any lazy.tsx, and the files of src/ui/lazy/. */
function isGate(path: string): boolean {
  return /(^|\/)lazy\.tsx$/.test(path) || /^src\/ui\/lazy\/[^/]+\.tsx$/.test(path)
}

/** Test 7: every module a gate imports dynamically must be out of the static closure of src/main.tsx. */
function chunkViolations(root: string): string[] {
  const reached = closure(join(root, 'src', 'main.tsx'))
  const out: string[] = []
  for (const gate of listSources(join(root, 'src'))) {
    if (!isGate(rel(root, gate))) continue
    for (const spec of dynamicImports(gate)) {
      const to = resolve(gate, spec)
      if (to && reached.has(to)) {
        const via = reached.get(to) ?? ''
        out.push(`${rel(root, to)} is a chunk of ${rel(root, gate)} but src/main.tsx reaches it statically (from ${via ? rel(root, via) : 'src/main.tsx'})`)
      }
    }
  }
  return out
}

/** Tests 8 and 9: who may import a zone, and what the gate must do. */
function zoneViolations(root: string, zone: Zone): string[] {
  const files = listSources(join(root, 'src'))
  const out: string[] = []
  const members = files.map((f) => rel(root, f)).filter((p) => zone.inZone(p) && p !== zone.gate)
  const isMember = (file: string | null): file is string => file !== null && members.includes(rel(root, file))
  for (const file of files) {
    const path = rel(root, file)
    if (zone.inZone(path) && path !== zone.gate) continue // zone files may import each other
    for (const spec of staticImports(file)) {
      const to = resolve(file, spec)
      if (isMember(to)) {
        const who = path === zone.gate ? `the ${zone.name} gate ${path} imports` : `${path} imports`
        out.push(`${who} ${rel(root, to)} at run time: go through ${zone.gate} (or use import type)`)
      }
    }
    if (path === zone.gate) continue
    for (const spec of dynamicImports(file)) {
      const to = resolve(file, spec)
      if (isMember(to)) out.push(`${path} imports ${rel(root, to)} dynamically: only ${zone.gate} may start that chunk`)
    }
  }
  if (zone.needsGate(members)) {
    const gate = files.find((f) => rel(root, f) === zone.gate)
    if (!gate) {
      out.push(`${zone.gate} is missing: ${members[0]} needs a gate made with lazyView`)
    } else {
      const loaded = dynamicImports(gate).map((s) => resolve(gate, s))
      if (loaded.length === 0) out.push(`${zone.gate} has no dynamic import()`)
      else if (zone.loads && !loaded.some((t) => t !== null && rel(root, t) === zone.loads)) {
        out.push(`${zone.gate} never imports ${zone.loads} dynamically`)
      }
    }
  }
  return out
}

let trees: string[] = []

/** A source tree in os.tmpdir(): { 'src/main.tsx': '...' }. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'lazy-zones-'))
  trees.push(root)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
  return root
}

afterEach(() => {
  for (const t of trees) rmSync(t, { recursive: true, force: true })
  trees = []
})

describe('the scanner on the real src', () => {
  it('follows the static imports from src/main.tsx', () => {
    const reached = closure(join(ROOT, 'src', 'main.tsx'))
    expect(reached.size).toBeGreaterThan(100)
    expect(reached.has(join(ROOT, 'src', 'App.tsx'))).toBe(true)
    expect(reached.has(join(ROOT, 'src', 'ui', 'store.ts'))).toBe(true)
    expect(reached.has(join(ROOT, 'src', 'ui', 'lazy', 'lazyView.tsx'))).toBe(true)
  })

  it('resolves every relative import in src to a file (or to a stylesheet)', () => {
    const lost: string[] = []
    for (const file of listSources(join(ROOT, 'src'))) {
      for (const spec of [...staticImports(file), ...dynamicImports(file)]) {
        if (spec.startsWith('.') && !/\.(css|svg|png|json|gz)$/.test(spec) && resolve(file, spec) === null) {
          lost.push(`${rel(ROOT, file)}: ${spec}`)
        }
      }
    }
    expect(lost).toEqual([])
  })
})

describe('lazy chunks and zones in the real src', () => {
  it('7: every module a gate imports dynamically is a chunk of its own', () => {
    expect(chunkViolations(ROOT)).toEqual([])
  })

  it('8: only src/ui/charts/lazy.tsx reaches the chart zone, and it does so dynamically', () => {
    expect(zoneViolations(ROOT, CHARTS)).toEqual([])
  })

  it('9: only src/ui/nav/lazy.tsx reaches the palette zone, and it does so dynamically', () => {
    expect(zoneViolations(ROOT, PALETTE)).toEqual([])
  })
})

describe('10: the checks fail on a synthetic violation', () => {
  it('7: a module that is both a chunk and in the static closure', () => {
    const direct = tree({
      'src/main.tsx': "import { Heavy } from './ui/charts/Heavy'\nconsole.log(Heavy)\n",
      'src/ui/charts/Heavy.tsx': 'export const Heavy = 1\n',
      'src/ui/charts/lazy.tsx': "export const load = () => import('./Heavy')\n",
    })
    const found = chunkViolations(direct)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('src/ui/charts/Heavy.tsx')
    expect(found[0]).toContain('src/ui/charts/lazy.tsx')

    const deep = tree({
      'src/main.tsx': "import './ui/a'\n",
      'src/ui/a.ts': "export * from './b'\n",
      'src/ui/b.ts': "import { Deep } from '../deep/Deep'\nexport const b = Deep\n",
      'src/deep/Deep.ts': 'export const Deep = 1\n',
      'src/ui/lazy/gate.tsx': "export const load = () => import('../../deep/Deep')\n",
    })
    const through = chunkViolations(deep)
    expect(through).toHaveLength(1)
    expect(through[0]).toContain('src/ui/b.ts')
  })

  it('7: a chunk that only the gate reaches is fine', () => {
    const root = tree({
      'src/main.tsx': "import { load } from './ui/charts/lazy'\nconsole.log(load)\n",
      'src/ui/charts/Heavy.tsx': 'export const Heavy = 1\n',
      'src/ui/charts/lazy.tsx': "export const load = () => import('./Heavy')\n",
    })
    expect(chunkViolations(root)).toEqual([])
  })

  it('7: an import in a comment, or a type-only import, does not put a chunk in the closure', () => {
    const root = tree({
      'src/main.tsx': "// import { Heavy } from './ui/charts/Heavy'\nimport type { Heavy } from './ui/charts/Heavy'\nimport { type Heavy as H } from './ui/charts/Heavy'\nimport './ui/charts/lazy'\n",
      'src/ui/charts/Heavy.tsx': 'export type Heavy = number\n',
      'src/ui/charts/lazy.tsx': "export const load = () => import('./Heavy')\n",
    })
    expect(chunkViolations(root)).toEqual([])
  })

  const heavy = { 'src/ui/charts/Heavy.tsx': 'export const Heavy = 1\nexport type Spec = number\n', 'src/ui/charts/lazy.tsx': "export const load = () => import('./Heavy')\n" }

  it('8: a file outside the chart zone that imports a chart module at run time', () => {
    const forms: Record<string, string> = {
      named: "import { Heavy } from '../charts/Heavy'\nconsole.log(Heavy)\n",
      default: "import Heavy from '../charts/Heavy'\nconsole.log(Heavy)\n",
      namespace: "import * as H from '../charts/Heavy'\nconsole.log(H)\n",
      bare: "import '../charts/Heavy'\n",
      multiline: "import {\n  Heavy,\n  type Spec,\n} from '../charts/Heavy'\nconsole.log(Heavy)\n",
      star: "export * from '../charts/Heavy'\n",
      reexport: "export { Heavy } from '../charts/Heavy'\n",
      dynamic: "export const load = () => import('../charts/Heavy')\n",
    }
    for (const [form, body] of Object.entries(forms)) {
      const root = tree({ ...heavy, 'src/ui/screens/A.tsx': body })
      const found = zoneViolations(root, CHARTS)
      expect(found, form).toHaveLength(1)
      expect(found[0], form).toContain('src/ui/screens/A.tsx')
      expect(found[0], form).toContain('src/ui/charts/Heavy.tsx')
    }
  })

  it('8: type-only imports, comments and the gate itself are allowed', () => {
    const allowed: Record<string, string> = {
      typeImport: "import type { Spec } from '../charts/Heavy'\nexport const a: Spec = 1\n",
      inlineType: "import { type Spec } from '../charts/Heavy'\nexport const a: Spec = 1\n",
      inlineTypes: "import { type Spec, type Spec as S2 } from '../charts/Heavy'\nexport const a: S2 = 1\n",
      typeReexport: "export type { Spec } from '../charts/Heavy'\n",
      comment: "// import { Heavy } from '../charts/Heavy'\n/* import('../charts/Heavy') */\nexport const a = 1\n",
      gate: "import { load } from '../charts/lazy'\nexport const a = load\n",
      siblingExport: "export type { Spec } from '../charts/Heavy'\nexport * from './other'\n",
      typeAccess: "export type H = import('../charts/Heavy').Spec\n",
      typeofImport: "export type M = typeof import('../charts/Heavy')\n",
    }
    for (const [form, body] of Object.entries(allowed)) {
      const root = tree({ ...heavy, 'src/ui/screens/A.tsx': body, 'src/ui/screens/other.ts': 'export const o = 1\n' })
      expect(zoneViolations(root, CHARTS), form).toEqual([])
    }
  })

  it('8: the gate may not import a chart module statically, and chart modules may import each other', () => {
    const root = tree({
      'src/ui/charts/Heavy.tsx': "import { Helper } from './Helper'\nexport const Heavy = Helper\n",
      'src/ui/charts/Helper.ts': 'export const Helper = 1\n',
      'src/ui/charts/lazy.tsx': "import { Helper } from './Helper'\nexport const load = () => import('./Heavy')\nexport const h = Helper\n",
    })
    const found = zoneViolations(root, CHARTS)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('gate')
    expect(found[0]).toContain('src/ui/charts/Helper.ts')
    const typeOnly = tree({
      ...heavy,
      'src/ui/charts/lazy.tsx': "import type { Spec } from './Heavy'\nexport const load = (): Promise<unknown> => import('./Heavy')\nexport type S = Spec\n",
    })
    expect(zoneViolations(typeOnly, CHARTS)).toEqual([])
  })

  it('8: the chart gate is required once ChartView.tsx exists, and the zone is vacuous before that', () => {
    expect(zoneViolations(tree({ 'src/main.tsx': 'export {}\n' }), CHARTS)).toEqual([])
    expect(zoneViolations(tree({ 'src/ui/charts/lazy.tsx': 'export const a = 1\n' }), CHARTS)).toEqual([])

    const noGate = zoneViolations(tree({ 'src/ui/charts/ChartView.tsx': 'export default function ChartView() { return null }\n' }), CHARTS)
    expect(noGate).toHaveLength(1)
    expect(noGate[0]).toContain('src/ui/charts/lazy.tsx is missing')

    const noDynamic = zoneViolations(
      tree({ 'src/ui/charts/ChartView.tsx': 'export default function ChartView() { return null }\n', 'src/ui/charts/lazy.tsx': 'export const a = 1\n' }),
      CHARTS,
    )
    expect(noDynamic).toHaveLength(1)
    expect(noDynamic[0]).toContain('no dynamic import')

    const wrongChunk = zoneViolations(
      tree({
        'src/ui/charts/ChartView.tsx': 'export default function ChartView() { return null }\n',
        'src/ui/charts/Sparkline.tsx': 'export const Sparkline = 1\n',
        'src/ui/charts/lazy.tsx': "export const load = () => import('./Sparkline')\n",
      }),
      CHARTS,
    )
    expect(wrongChunk).toHaveLength(1)
    expect(wrongChunk[0]).toContain('never imports src/ui/charts/ChartView.tsx')

    const whole = tree({
      'src/ui/charts/ChartView.tsx': 'export default function ChartView() { return null }\n',
      'src/ui/charts/lazy.tsx': "export const load = () => import('./ChartView')\n",
    })
    expect(zoneViolations(whole, CHARTS)).toEqual([])
  })

  it('8: chart helpers that land before the dispatcher need no gate yet, but are fenced from the first file', () => {
    // R1-C2 puts these four in src/ui/charts/ and R1-C7 and R1-C8 add more before R1-C9 brings ChartView.tsx and lazy.tsx.
    const early = {
      'src/ui/charts/format.ts': 'export const fmt = 1\n',
      'src/ui/charts/geometry.ts': "import { fmt } from './format'\nexport const geo = fmt\n",
      'src/ui/charts/table.ts': 'export const table = 1\n',
      'src/ui/charts/useScrub.ts': 'export const useScrub = 1\n',
    }
    expect(zoneViolations(tree(early), CHARTS)).toEqual([])

    const leaky = zoneViolations(tree({ ...early, 'src/ui/screens/A.tsx': "import { fmt } from '../charts/format'\nexport const a = fmt\n" }), CHARTS)
    expect(leaky).toHaveLength(1)
    expect(leaky[0]).toContain('src/ui/screens/A.tsx')
    expect(leaky[0]).toContain('src/ui/charts/format.ts')

    const typeOnly = tree({ ...early, 'src/ui/screens/A.tsx': "import type { fmt } from '../charts/format'\nexport type A = typeof fmt\n" })
    expect(zoneViolations(typeOnly, CHARTS)).toEqual([])
  })

  const palette = {
    'src/ui/nav/Palette.tsx': "import { model } from './paletteModel'\nimport { index } from './searchIndex'\nexport default function Palette() { return model + index }\n",
    'src/ui/nav/paletteModel.ts': "import { rank } from './searchRank'\nexport const model = rank\n",
    'src/ui/nav/searchIndex.ts': 'export const index = 1\n',
    'src/ui/nav/searchRank.ts': 'export const rank = 1\n',
    'src/ui/nav/useSearchIndex.ts': "import { index } from './searchIndex'\nexport const useSearchIndex = () => index\n",
    'src/ui/nav/lazy.tsx': "export const load = () => import('./Palette')\n",
  }

  it('9: the palette zone as it should be passes', () => {
    expect(zoneViolations(tree(palette), PALETTE)).toEqual([])
  })

  it('9: a file outside the zone that imports a zone file at run time', () => {
    for (const [name, body] of Object.entries({
      place: "import { index } from './searchIndex'\nexport const p = index\n",
      reopen: "import { useSearchIndex } from './useSearchIndex'\nexport const r = useSearchIndex\n",
      hub: "import { rank } from '../searchRank'\nexport const h = rank\n",
    })) {
      const path = name === 'hub' ? 'src/ui/nav/hubs/hub.ts' : `src/ui/nav/${name}.ts`
      const found = zoneViolations(tree({ ...palette, [path]: body }), PALETTE)
      expect(found, name).toHaveLength(1)
      expect(found[0], name).toContain(path)
    }
    const typeOnly = tree({ ...palette, 'src/ui/nav/place.ts': "import type { index } from './searchIndex'\nexport type P = typeof index\n" })
    expect(zoneViolations(typeOnly, PALETTE)).toEqual([])
  })

  it('9: the gate must load Palette.tsx dynamically and import no zone file statically', () => {
    const staticGate = tree({ ...palette, 'src/ui/nav/lazy.tsx': "import Palette from './Palette'\nexport const load = () => import('./Palette')\nexport const P = Palette\n" })
    const found = zoneViolations(staticGate, PALETTE)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('gate')

    const wrongChunk = tree({ ...palette, 'src/ui/nav/lazy.tsx': "export const load = () => import('./searchIndex')\n" })
    const wrong = zoneViolations(wrongChunk, PALETTE)
    expect(wrong.some((v) => v.includes('never imports src/ui/nav/Palette.tsx'))).toBe(true)

    const { 'src/ui/nav/lazy.tsx': _gate, ...noGate } = palette
    const missing = zoneViolations(tree(noGate), PALETTE)
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain('src/ui/nav/lazy.tsx is missing')
  })

  it('9: nothing is required until Palette.tsx exists', () => {
    const early = tree({ 'src/ui/nav/searchIndex.ts': 'export const index = 1\n', 'src/ui/nav/searchRank.ts': 'export const rank = 1\n' })
    expect(zoneViolations(early, PALETTE)).toEqual([])
    const leaky = tree({ 'src/ui/nav/searchIndex.ts': 'export const index = 1\n', 'src/ui/nav/place.ts': "import { index } from './searchIndex'\nexport const p = index\n" })
    expect(zoneViolations(leaky, PALETTE)).toHaveLength(1)
  })
})

describe('the scanner', () => {
  it('finds the static imports that run, and none that are erased or commented out', () => {
    const source = [
      "import a from './a'",
      'import { b } from "./b"',
      "import * as c from './c'",
      "import d, { e } from './d'",
      "import './f.css'",
      "import type { T } from './t1'",
      "import { type U } from './t2'",
      "import { type V, type W } from './t3'",
      "import { x, type Y } from './mix'",
      "export * from './g'",
      "export * as ns from './g2'",
      "export { h } from './h'",
      "export type { I } from './i'",
      "export type { Local }",
      "export * from './after-local-type'",
      'export type J = string',
      'export const k = 1',
      'import {',
      '  l,',
      '  m,',
      "} from './multi'",
      "// import z from './comment'",
      "/* import q from './block' */",
      "const s = 'import r from \"./string\"'",
      "export function f() { return import('./dynamic') }",
    ].join('\n')
    expect(staticSpecifiers(source).sort()).toEqual(
      ['./a', './after-local-type', './b', './c', './d', './f.css', './g', './g2', './h', './mix', './multi'].sort(),
    )
  })

  it('finds dynamic imports with a string literal and nothing else', () => {
    const source = [
      "const a = () => import('./a')",
      'const b = () => import("./b")',
      "const c = () => import( './c' )",
      "const d = () => import(/* webpackChunkName: 'd' */ './d')",
      'const e = (name: string) => import(name)',
      "// const f = () => import('./f')",
      "const g = 'a glob like src/**/*.ts and import(x)'",
    ].join('\n')
    expect(dynamicSpecifiers(source)).toEqual(['./a', './b', './c', './d'])
  })

  it('ignores import() in a type position, which is erased, and keeps the ones that run', () => {
    const source = [
      "export type A = import('./a').T",
      "const b: import('./b').Props = x",
      "type C = typeof import('./c')",
      "type D = ReturnType<typeof import('./d').make>",
      "type E = Record<string, import('./e').Row>",
      "const f = () => import('./f')",
      "const g = import('./g').then((m) => m.G)",
      "const h = import('./h').catch(() => null)",
      "const i = import('./i')\n  .then((m) => m.I)",
      "const j = (await import('./j')).J",
      "const { k } = await import('./k')",
      "const l = import('./l').finally(() => undefined)",
    ].join('\n')
    expect(dynamicSpecifiers(source)).toEqual(['./f', './g', './h', './i', './j', './k', './l'])
  })

  it('resolves relative specifiers to .ts, .tsx, .js names and directory indexes, and skips the rest', () => {
    const root = tree({
      'src/x.ts': '',
      'src/a.ts': '',
      'src/b.tsx': '',
      'src/c.ts': '',
      'src/dir/index.ts': '',
      'src/dir2/index.tsx': '',
      'src/style.css': '',
      'src/sub/y.ts': '',
    })
    const from = join(root, 'src', 'x.ts')
    const at = (p: string) => join(root, 'src', ...p.split('/'))
    expect(resolve(from, './a')).toBe(at('a.ts'))
    expect(resolve(from, './a.ts')).toBe(at('a.ts'))
    expect(resolve(from, './b')).toBe(at('b.tsx'))
    expect(resolve(from, './b.tsx')).toBe(at('b.tsx'))
    expect(resolve(from, './c.js')).toBe(at('c.ts'))
    expect(resolve(from, './dir')).toBe(at('dir/index.ts'))
    expect(resolve(from, './dir/')).toBe(at('dir/index.ts'))
    expect(resolve(from, './dir2')).toBe(at('dir2/index.tsx'))
    expect(resolve(join(root, 'src', 'sub', 'y.ts'), '../a')).toBe(at('a.ts'))
    expect(resolve(from, './style.css')).toBeNull()
    expect(resolve(from, './missing')).toBeNull()
    expect(resolve(from, 'react')).toBeNull()
    expect(resolve(from, '/etc/passwd')).toBeNull()
  })

  it('computes a static closure that ends on cycles and ignores dynamic and type imports', () => {
    const root = tree({
      'src/main.tsx': "import './a'\n",
      'src/a.ts': "import { b } from './b'\nexport const a = b\n",
      'src/b.ts': "import { a } from './a'\nimport type { T } from './t'\nexport const b = () => a\nexport const later = () => import('./c')\n",
      'src/c.ts': 'export const c = 1\n',
      'src/t.ts': 'export type T = number\n',
    })
    const reached = closure(join(root, 'src', 'main.tsx'))
    expect([...reached.keys()].map((f) => rel(root, f)).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/main.tsx'])
    expect(rel(root, reached.get(join(root, 'src', 'b.ts')) ?? '')).toBe('src/a.ts')
    expect(closure(join(root, 'src', 'nothing.ts')).size).toBe(0)
  })
})
