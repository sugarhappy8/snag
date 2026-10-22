// ci: fast
// R2-K13 (K.3 and K.2a e): the Kernel track's acceptance sweep, one short case per promise of the track. The detail is proven in the
// files named in docs/KERNEL.md (kernel-registry, kernel-bus, kernel-ports, layers, layers-domains, architecture, kernel-parity,
// hub-entry, world-facts); this file holds the facts a later track can break without touching any of them: the registry's lists,
// the module layers, the yearly order, the ports, the two baselines, and the note every later track reads (docs/KERNEL.md).
//
// A track that adds a port adds its name to PORTS here and in test/hub-entry.test.ts. A track that adds a file to src/game/kernel adds
// one line for it to docs/KERNEL.md (the last case below). No pinned seed: nothing here plays a life.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DOC = join(ROOT, 'docs', 'KERNEL.md')
const KERNEL_DIR = join(ROOT, 'src', 'game', 'kernel')
const PORTS = ['activities.relocate', 'business.discloseResearch', 'business.revalueCompany', 'computer.gameMakingMenu', 'workplace.ordinaryJobs']

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const json = (...path: string[]): unknown => JSON.parse(readFileSync(join(ROOT, ...path), 'utf8'))
const doc = (): string => readFileSync(DOC, 'utf8')

/** What is wrong with a KERNEL.md text against the files of src/game/kernel: a file with no entry line, an entry or mention of a file that is not there, a repeat, an entry with no words. */
function kernelDocProblems(text: string, files: readonly string[]): string[] {
  const problems: string[] = []
  const entries = [...text.matchAll(/^- `src\/game\/kernel\/([A-Za-z0-9-]+\.tsx?)` - (\S.*)$/gm)].map((m) => m[1]!)
  for (const f of files) if (!entries.includes(f)) problems.push(`no entry for ${f}`)
  for (const f of new Set(entries)) if (entries.indexOf(f) !== entries.lastIndexOf(f)) problems.push(`two entries for ${f}`)
  for (const m of text.matchAll(/src\/game\/kernel\/([A-Za-z0-9-]+\.tsx?)/g)) if (!files.includes(m[1]!)) problems.push(`names ${m[1]}, which is not there`)
  return [...new Set(problems)]
}

describe('the registry after loading src/game/modules', () => {
  it('has a sorted list of slices with no duplicate, and every module has a layer from 0 to 4', async () => {
    vi.resetModules()
    const { registeredSlices, getModule } = await import('../src/game/kernel/registry')
    const { MODULES } = await import('../src/game/modules')
    const slices = [...registeredSlices()]
    expect(new Set(slices).size).toBe(slices.length)
    expect(slices).toEqual([...slices].sort(byCode))
    expect(slices).toContain('world.facts')
    expect(MODULES.length).toBeGreaterThan(0)
    for (const m of MODULES) {
      expect(getModule(m.id), `module ${m.id} is registered`).toBeDefined()
      expect([0, 1, 2, 3, 4], `layer of ${m.id}`).toContain(m.layer)
    }
  }, 120_000)

  it('runs the aging seam in strict (phase, order, id) order, every id a dotted name', async () => {
    vi.resetModules()
    const { yearlyEntries, YEARLY_PHASES } = await import('../src/game/kernel/registry')
    await import('../src/game/modules')
    const list = yearlyEntries('aging')
    expect(list.length).toBeGreaterThanOrEqual(36)
    const rank = (e: { phase: string; order: number; id: string }): [number, number, string] => [YEARLY_PHASES.aging.indexOf(e.phase as never), e.order, e.id]
    list.forEach((e, i) => {
      expect(e.id, `id of entry ${i}`).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+(#\d+)?$/)
      if (i === 0) return
      const [p0, o0, id0] = rank(list[i - 1]!)
      const [p1, o1, id1] = rank(e)
      expect(p1 - p0 || o1 - o0 || byCode(id1, id0), `${list[i - 1]!.id} then ${e.id}`).toBeGreaterThan(0)
    })
  }, 120_000)

  it('binds all four ports once the game is entered through aging and menus', async () => {
    vi.resetModules()
    await import('../src/game/aging')
    await import('../src/game/menus')
    const { portStatus } = await import('../src/game/kernel/ports')
    expect(portStatus()).toEqual(PORTS.map((name) => ({ name, bound: true })))
  }, 120_000)
})

/** What a registry list of slice keys holds that the save does not know: a key with no slice in the table, and a `world.<name>` with no registered shard. */
function slicesTheSaveLacks(registered: readonly string[], save: { hasSlice(key: string): boolean; shards: ReadonlySet<string> }): string[] {
  const problems: string[] = []
  for (const key of registered) {
    if (!save.hasSlice(key)) problems.push(`${key}: no slice of that key in the save table (save-slices.ts)`)
    else if (key.startsWith('world.') && !save.shards.has(key.slice('world.'.length))) problems.push(`${key}: not a registered world shard`)
  }
  return problems
}

describe('the slices the modules declare are slices the save knows (R2-K13 leftover)', () => {
  it('every key registeredSlices() holds is in the table save-slices.ts fills, and a world.<name> is a registered shard', async () => {
    vi.resetModules()
    const { registeredSlices } = await import('../src/game/kernel/registry')
    await import('../src/game/modules')
    const { ensureSliceTable } = await import('../src/game/save-slices')
    const { hasSlice } = await import('../src/game/kernel/slices')
    const { shardNames } = await import('../src/game/world/state')
    ensureSliceTable()
    const registered = registeredSlices()
    expect(registered.length, 'the module list owns at least the fact store').toBeGreaterThan(0)
    expect(slicesTheSaveLacks(registered, { hasSlice, shards: new Set(shardNames()) })).toEqual([])
  }, 120_000)

  it('names a slice the save does not know, and a world shard nobody registered', async () => {
    vi.resetModules()
    const { ensureSliceTable } = await import('../src/game/save-slices')
    const { hasSlice } = await import('../src/game/kernel/slices')
    const { shardNames } = await import('../src/game/world/state')
    ensureSliceTable()
    const save = { hasSlice, shards: new Set(shardNames()) }
    expect(slicesTheSaveLacks(['world.facts', 'flags.worldEconomy', 'character'], save)).toEqual([])
    expect(slicesTheSaveLacks(['nope'], save)).toEqual(['nope: no slice of that key in the save table (save-slices.ts)'])
    expect(slicesTheSaveLacks(['character.deep'], save)).toHaveLength(1)
    expect(slicesTheSaveLacks(['world.nosuchshard'], save)).toEqual(['world.nosuchshard: not a registered world shard'])
    // End to end: a module that declares a slice the save has no row for shows up in the registry's list, and the check names it.
    const { registerModule, registeredSlices } = await import('../src/game/kernel/registry')
    registerModule({ id: 'test.bogus', layer: 3, slices: ['bogus.slice'] })
    expect(slicesTheSaveLacks(registeredSlices(), save)).toEqual(['bogus.slice: no slice of that key in the save table (save-slices.ts)'])
  }, 120_000)
})

describe('the two ratchets stand where the track left them', () => {
  it('holds at most 90 modules in at most 8 import cycles', () => {
    const { components } = json('test', 'architecture-baseline.json') as { components: string[][] }
    expect(components.flat().length).toBeLessThanOrEqual(90)
    expect(components.length).toBeLessThanOrEqual(8)
  })

  it('has no import cycle edge that crosses a directory', () => {
    expect((json('test', 'layers-baseline.json') as { cycleDirEdges: string[] }).cycleDirEdges).toEqual([])
  })
})

describe('docs/KERNEL.md', () => {
  const files = readdirSync(KERNEL_DIR, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name)

  it('holds no em-dash and no en-dash', () => {
    expect(doc()).not.toMatch(/[\u2013\u2014]/)
  })

  it('has one line for every file of src/game/kernel and names no file that is not there', () => {
    expect(files.length).toBeGreaterThan(0)
    expect(kernelDocProblems(doc(), files)).toEqual([])
  })

  it('catches a missing entry, an entry for a missing file, a repeat and a mention of a missing file', () => {
    const line = (f: string): string => `- \`src/game/kernel/${f}\` - what it is`
    expect(kernelDocProblems([line('a.ts'), line('b.ts')].join('\n'), ['a.ts', 'b.ts'])).toEqual([])
    expect(kernelDocProblems(line('a.ts'), ['a.ts', 'b.ts'])).toEqual(['no entry for b.ts'])
    expect(kernelDocProblems([line('a.ts'), line('gone.ts')].join('\n'), ['a.ts'])).toEqual(['names gone.ts, which is not there'])
    expect(kernelDocProblems([line('a.ts'), line('a.ts')].join('\n'), ['a.ts'])).toEqual(['two entries for a.ts'])
    expect(kernelDocProblems(`${line('a.ts')}\nSee src/game/kernel/old.ts.`, ['a.ts'])).toEqual(['names old.ts, which is not there'])
    expect(kernelDocProblems('- `src/game/kernel/a.ts` -', ['a.ts'])).toEqual(['no entry for a.ts'])
  })

  it('lists every phase of the aging seam and then of the special seam, in run order, in its two phase tables', async () => {
    const { YEARLY_PHASES } = await import('../src/game/kernel/registry')
    const rows = [...doc().matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]!)
    expect(rows).toEqual([...YEARLY_PHASES.aging, ...YEARLY_PHASES.special])
  })

  it('names update commands that the tests really read', () => {
    const tests = ['architecture', 'layers', 'layers-domains', 'kernel-parity'].map((n) => readFileSync(join(ROOT, 'test', `${n}.test.ts`), 'utf8')).join('\n')
    const named = [...new Set([...doc().matchAll(/\b(UPDATE_[A-Z]+_BASELINE|RECORD_KERNEL_PARITY)\b/g)].map((m) => m[1]!))]
    expect(named.sort()).toEqual(['RECORD_KERNEL_PARITY', 'UPDATE_ARCH_BASELINE', 'UPDATE_LAYER_BASELINE'])
    for (const name of named) expect(tests, name).toContain(name)
  })
})
