// ci: fast
// R4-E1 (X4): the mutation check. The oracle gate is worth something only if the oracle can fail. R4-E5 moves 373 calls behind a
// shim whose body is "the old expression verbatim"; this file wraps addRelationship the three ways a careless move would break it and
// proves the oracle sees each one:
//
//   delta   the delta plus one point                    (a rounding or an off-by-one in the shim)
//   rand    one extra rand(g) before the change         (a shim that rolls: every later draw of the life moves)
//   clamp   the clamp to 0..100 skipped                 (a shim that forgets the bounds)
//
// The wrapper is vi.mock of src/game/core.ts, which 63 files import (R4-E1 tried it first: it holds, the real relationships.ts
// actions below see the wrapper as well as the kit's applyDelta does). It finds the delta by its type and the person by its
// `relationship`, so it does not care whether the call takes (p, delta) as in v5.2.0 or (g, p, delta, kind) after R4-E5; the extra
// draw comes from the game of the scene made last (the kit keeps it in a global slot).
//
// Two proofs. The first runs here, on the kit's own reference scene (referenceRows): the kit's rows go red under each mutation, at
// the first row the mutation can move, and the real actions of relationships.ts move too. The second runs the parity files of
// R4-E2 to R4-E4 (relationship-parity, wealth-parity, nepo-parity, heir-parity, social-lives-parity) in a vitest of their own with
// the same wrapper in a setup file, and expects each of them to fail under each mutation and none to fail under the control. R4-E4
// enabled it: it runs the files that exist on the tree it is run on (the area files of E2 and E3 join as they merge) and switches
// itself on once the scripted lives are there, the last file to land, so a tree with only some of them still proves those go red.
// SOCIAL_MUTATION_FILES=a,b,c names other files (and runs when all of them exist).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { rand } from '../src/game/rng'
import { ROOT } from './scan-kit'
import { GAME_SLOT, compareRows, currentGame, referenceRows } from './social-parity-kit'

type Mode = 'none' | 'delta' | 'rand' | 'clamp'
const MODES = ['delta', 'rand', 'clamp'] as const

/**
 * The wrapper. Self-contained on purpose (the second proof writes its source into a setup file): everything it needs comes in as an
 * argument. `real` is core.ts's addRelationship, `args` the call's arguments, `deps` the draw and the game of the scene made last.
 */
function mutate(real: (...a: unknown[]) => void, mode: string, args: unknown[], deps: { rand: (g: never) => number; game: () => unknown }): void {
  const at = args.findIndex((a) => typeof a === 'number')
  const who = args.find((a) => typeof a === 'object' && a !== null && 'relationship' in a) as { relationship: number } | undefined
  if (mode === 'delta') {
    const next = [...args]
    next[at] = (args[at] as number) + 1
    real(...next)
  } else if (mode === 'rand') {
    const g = deps.game()
    if (g !== null && g !== undefined) deps.rand(g as never)
    real(...args)
  } else if (mode === 'clamp') {
    const delta = args[at] as number
    if (who === undefined || !Number.isFinite(who.relationship) || !Number.isFinite(delta)) return
    who.relationship = Math.round(who.relationship + delta)
  } else {
    real(...args)
  }
}

const hook = vi.hoisted(() => ({ mode: 'none' as string, mutate: null as null | ((real: (...a: unknown[]) => void, mode: string, args: unknown[]) => void) }))

vi.mock('../src/game/core', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/core')>()
  const shim = real.addRelationship as (...a: unknown[]) => void
  return { ...real, addRelationship: (...args: unknown[]) => (hook.mutate ? hook.mutate(shim, hook.mode, args) : shim(...args)) }
})

hook.mutate = (real, mode, args) => mutate(real, mode, args, { rand: rand as (g: never) => number, game: currentGame })

/** The reference scene played under a mutation. */
function played(mode: Mode): ReturnType<typeof referenceRows> {
  hook.mode = mode
  try {
    return referenceRows()
  } finally {
    hook.mode = 'none'
  }
}

describe('the oracle sees a one-point drift', () => {
  const base = played('none')

  it('plays the same rows with the wrapper in place and nothing mutated', () => {
    expect(compareRows(base, played('none')).same).toBe(true)
    expect(base.find((r) => r.label === 'hug|mom|25')!.rel[0]).toBeGreaterThanOrEqual(27)
  })

  it.each([
    ['delta', /^#1 table\|1\|7: rel\[1\] 8 -> 9/],
    ['rand', /^#0 table\|0\|-5: rng 11 -> \d+/],
    ['clamp', /^#0 table\|0\|-5: rel\[1\] 0 -> -5/],
  ] as const)('goes red under %s, at the first row the mutation can move', (mode, first) => {
    const report = compareRows(base, played(mode))
    expect(report.same).toBe(false)
    expect(report.first).toMatch(first)
  })

  it.each(MODES)("moves the real actions of relationships.ts under %s, not only the kit's applyDelta", (mode) => {
    const fromActions = compareRows(base.slice(-4), played(mode).slice(-4))
    expect(fromActions.same).toBe(false)
    expect(fromActions.moved).toBeGreaterThanOrEqual(1)
  })

  it('moves the first hug by exactly one point when the delta is one point off', () => {
    const hug = (rows: typeof base): number => rows.find((r) => r.label === 'hug|mom|25')!.rel[0] as number
    expect(hug(played('delta')) - hug(base)).toBe(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The parity files of R4-E2 to R4-E4

const AREA_FILES = [
  'test/relationship-parity.test.ts', // R4-E2
  'test/wealth-parity.test.ts', // R4-E3
  'test/nepo-parity.test.ts', // R4-E4
  'test/heir-parity.test.ts', // R4-E4
  'test/social-lives-parity.test.ts', // R4-E4
]
const here = (f: string): boolean => existsSync(join(ROOT, f))
const PARITY_FILES = (process.env.SOCIAL_MUTATION_FILES ?? AREA_FILES.filter(here).join(',')).split(',').filter((f) => f !== '')
/** On when the scripted lives are on the tree (or the caller named the files and all of them are). */
const ENABLED = PARITY_FILES.length > 0 && PARITY_FILES.every(here) && (process.env.SOCIAL_MUTATION_FILES !== undefined || PARITY_FILES.includes('test/social-lives-parity.test.ts'))

/** Runs the files in a vitest of their own with the wrapper in a setup file; returns each file's status. */
function runUnder(mode: Mode, files: readonly string[]): Map<string, string> {
  const dir = join(ROOT, 'test', `.social-mutation-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  try {
    const setup = join(dir, 'setup.ts')
    writeFileSync(
      setup,
      [
        `import { vi } from 'vitest'`,
        `import { rand } from ${JSON.stringify(join(ROOT, 'src/game/rng'))}`,
        `const game = () => globalThis[${JSON.stringify(GAME_SLOT)}] ?? null`,
        `const mutate = ${mutate.toString()}`,
        `vi.mock(${JSON.stringify(join(ROOT, 'src/game/core'))}, async (importOriginal) => {`,
        `  const real = await importOriginal()`,
        `  return { ...real, addRelationship: (...args) => mutate(real.addRelationship, process.env.SOCIAL_MUTATION ?? 'none', args, { rand, game }) }`,
        `})`,
        ``,
      ].join('\n'),
    )
    const config = join(dir, 'config.ts')
    writeFileSync(
      config,
      [
        `import { mergeConfig } from 'vitest/config'`,
        `import base from ${JSON.stringify(join(ROOT, 'vite.config.ts'))}`,
        `export default mergeConfig(base, { test: { setupFiles: [${JSON.stringify(setup)}], maxWorkers: 1 } })`,
        ``,
      ].join('\n'),
    )
    const out = join(dir, 'out.json')
    const run = spawnSync(process.execPath, [join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', '--config', config, '--root', ROOT, '--reporter=json', '--outputFile', out, ...files], {
      cwd: ROOT,
      env: { ...process.env, SOCIAL_MUTATION: mode },
      encoding: 'utf8',
      timeout: 540_000,
    })
    if (!existsSync(out)) throw new Error(`the vitest of the ${mode} run wrote no report (exit ${run.status}):\n${run.stderr.slice(-2000)}`)
    const json = JSON.parse(readFileSync(out, 'utf8')) as { testResults: { name: string; status: string }[] }
    return new Map(json.testResults.map((r) => [r.name.slice(ROOT.length + 1), r.status]))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe.runIf(ENABLED)('the parity files go red under each mutation', () => {
  it('stay green with the wrapper in place and nothing mutated', { timeout: 600_000 }, () => {
    const status = runUnder('none', PARITY_FILES)
    expect([...status.entries()].filter(([, s]) => s !== 'passed')).toEqual([])
    expect([...status.keys()].sort()).toEqual([...PARITY_FILES].sort())
  })

  it.each(MODES)('fail under %s, every one of them', { timeout: 600_000 }, (mode) => {
    const status = runUnder(mode, PARITY_FILES)
    expect(Object.fromEntries(PARITY_FILES.map((f) => [f, status.get(f)]))).toEqual(Object.fromEntries(PARITY_FILES.map((f) => [f, 'failed'])))
  })
})
