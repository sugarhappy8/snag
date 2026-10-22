// R3-H1 (H.3): the information mode. Realistic (estimates, ranges and words) is the player's default; Exact (every number, as
// before) is what the whole suite runs in, through vite.config.ts setupFiles -> test/setup-exact.ts, so every existing hint
// test passes unchanged while the Fog track grows. The mode is a presentation switch: the simulation never reads it.
//
// Fog tests flip the mode with withInfoMode(m, fn) (or inFog from test/knowledge-kit.ts), never with setInfoMode: the suite
// override beats the player's setting, on purpose, so a test file that imports the store (which applies the setting) is still
// Exact.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { infoMode, isExact, setInfoMode, setInfoOverride, withInfoMode } from '../src/game/knowledge/mode'

const ROOT = join(__dirname, '..')

// Put the switch back the way the file found it (what setup-exact.ts left), whatever a case did. Restoring a fixed 'exact'
// instead would hide a missing setup file from every case after the first.
const SLOT = Symbol.for('anotherlife.infoMode')
const home = globalThis as unknown as Record<symbol, unknown>
let found: unknown
beforeEach(() => {
  infoMode() // make sure the shared state exists
  found = { ...(home[SLOT] as object) }
})
afterEach(() => {
  home[SLOT] = found
})

describe('the suite runs in Exact mode', () => {
  it('a fresh test file reports exact (setupFiles installs the override)', () => {
    expect(infoMode()).toBe('exact')
    expect(isExact()).toBe(true)
  })

  it('the setup file exists and vite.config.ts lists it', () => {
    expect(existsSync(join(ROOT, 'test/setup-exact.ts'))).toBe(true)
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')
    expect(config).toMatch(/setupFiles:\s*\[\s*'\.\/test\/setup-exact\.ts'\s*\]/)
  })

  it('stays exact after vi.resetModules() and a fresh import (the state lives on globalThis)', async () => {
    vi.resetModules()
    const fresh = await import('../src/game/knowledge/mode')
    expect(fresh.infoMode).not.toBe(infoMode) // really a second copy of the module
    expect(fresh.infoMode()).toBe('exact')
    expect(fresh.isExact()).toBe(true)
    // and the two copies share one switch
    fresh.setInfoOverride('realistic')
    expect(infoMode()).toBe('realistic')
    expect(isExact()).toBe(false)
  })
})

describe('withInfoMode', () => {
  it('flips the mode for the call, hands back the result and restores it', () => {
    const seen = withInfoMode('realistic', () => infoMode())
    expect(seen).toBe('realistic')
    expect(infoMode()).toBe('exact')
    expect(withInfoMode('exact', () => 42)).toBe(42)
  })

  it('restores the mode when the call throws', () => {
    expect(() =>
      withInfoMode('realistic', () => {
        expect(infoMode()).toBe('realistic')
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(infoMode()).toBe('exact')
  })

  it('nests: the inner call wins inside, the outer one comes back after it', () => {
    const trail: string[] = []
    withInfoMode('realistic', () => {
      trail.push(infoMode())
      withInfoMode('exact', () => {
        trail.push(infoMode())
        withInfoMode('realistic', () => trail.push(infoMode()))
        trail.push(infoMode())
      })
      trail.push(infoMode())
    })
    trail.push(infoMode())
    expect(trail).toEqual(['realistic', 'exact', 'realistic', 'exact', 'realistic', 'exact'])
  })

  it('also restores a cleared override, not just a set one', () => {
    setInfoOverride(null)
    withInfoMode('exact', () => expect(infoMode()).toBe('exact'))
    expect(infoMode()).toBe('realistic')
  })
})

describe('the setting and the override', () => {
  it('Realistic is the default when there is no override and no setting', () => {
    setInfoOverride(null)
    setInfoMode('realistic')
    expect(infoMode()).toBe('realistic')
    expect(isExact()).toBe(false)
  })

  it('setInfoMode does not beat the override', () => {
    setInfoMode('realistic')
    expect(infoMode()).toBe('exact')
    setInfoMode('exact')
    expect(infoMode()).toBe('exact')
  })

  it('with the override cleared the setting rules', () => {
    setInfoOverride(null)
    setInfoMode('exact')
    expect(infoMode()).toBe('exact')
    setInfoMode('realistic')
    expect(infoMode()).toBe('realistic')
  })

  it('the override beats the setting the other way too', () => {
    setInfoMode('exact')
    setInfoOverride('realistic')
    expect(infoMode()).toBe('realistic')
    setInfoOverride(null)
    expect(infoMode()).toBe('exact')
  })

  it('junk is Realistic for the setting and no override for the override', () => {
    setInfoOverride(null)
    setInfoMode('exact')
    setInfoMode('EXACT' as never)
    expect(infoMode()).toBe('realistic')
    setInfoMode('exact')
    setInfoOverride('banana' as never)
    expect(infoMode()).toBe('exact') // no override, so the setting
    setInfoMode('realistic')
    expect(infoMode()).toBe('realistic')
  })

  it('a damaged shared state is replaced, not trusted', () => {
    home[SLOT] = 'junk'
    expect(infoMode()).toBe('realistic')
    setInfoOverride('exact')
    expect(infoMode()).toBe('exact')
    home[SLOT] = { setting: 'exact', override: 'banana' }
    expect(infoMode()).toBe('realistic') // replaced by a fresh state, not half trusted
  })
})

// ---------------------------------------------------------------------------
// The simulation never reads the mode.

const SIM_FILES = ['src/game/aging.ts', 'src/game/life.ts', 'src/game/core.ts', 'src/game/modules/yearly-aging.ts']
const SIM_DIRS = ['src/game/economy', 'src/game/world', 'src/game/kernel']

/** True when the source imports (static, side-effect, dynamic or require) anything under a knowledge/ folder. */
function importsKnowledge(src: string): boolean {
  return /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](?:[^'"]*\/)?knowledge(?:\/|['"])/.test(src)
}

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) filesUnder(rel, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(rel)
  }
  return out
}

describe('presentation only: the simulation never imports the knowledge folder', () => {
  it('the scan itself sees every way of importing it', () => {
    expect(importsKnowledge("import { isExact } from '../knowledge/mode'")).toBe(true)
    expect(importsKnowledge("import { know } from './knowledge/contract'")).toBe(true)
    expect(importsKnowledge("import '../knowledge/mode'")).toBe(true)
    expect(importsKnowledge("const m = await import('../knowledge/mode')")).toBe(true)
    expect(importsKnowledge("const m = require('../knowledge')")).toBe(true)
    expect(importsKnowledge("import { x } from '../knowledge'")).toBe(true)
    expect(importsKnowledge("import { x } from '../kernel/streams'")).toBe(false)
    expect(importsKnowledge("import { x } from '../self-knowledge'")).toBe(false)
    expect(importsKnowledge('// the knowledge of the world')).toBe(false)
  })

  it('aging, life, core, the aging module and economy/, world/, kernel/ do not import it', () => {
    const files = [...SIM_FILES, ...SIM_DIRS.flatMap((d) => filesUnder(d))]
    // The scan is not vacuous: every named file exists and the three folders hold files.
    for (const f of SIM_FILES) expect(existsSync(join(ROOT, f)), f).toBe(true)
    for (const d of SIM_DIRS) expect(filesUnder(d).length, d).toBeGreaterThan(0)
    const hits = files.filter((f) => importsKnowledge(readFileSync(join(ROOT, f), 'utf8')))
    expect(hits).toEqual([])
  })
})
