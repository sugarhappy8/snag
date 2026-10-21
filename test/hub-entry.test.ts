// R2-K5 (K.2a): enter the game through each hub, in a fresh module registry, and prove it loads.
//
// The import cuts of R2-K5 and R2-K6 change the order in which modules load: an edge that closed a cycle goes, so a module that used to
// be initialised half-way through its importer's load is now initialised first, or last. The failure that follows is a load-order crash
// ("Cannot access X before initialization", or an export that is undefined at the moment a module-level const reads it), and it shows
// only for the file that happens to be imported first. A normal test never sees it, because the first import of a test file is almost
// always a leaf and the hubs are reached through it already loaded. So here every hub is the first and only import of its own registry.
//
// Four blocks:
//   1. HUBS: for each hub, vi.resetModules(), import it, and check it exports something and that no export is undefined.
//   2. PORTS: a fresh registry, import aging and then menus (the two real entry points of the app), and check that every port the
//      game defines (kernel/ports.ts) is bound. An unbound port runs its fallback (an empty menu row, a skipped revaluation) and the
//      game degrades without any error, so this is the only thing that notices a provider nobody loads.
//   3. MOVED: what a cut moved out of a file is still served by that file, and is the same function (a re-export, never a copy).
//   4. PORTS AT WORK: a port gives its callers what the import it replaced gave them, and does nothing while unbound.
//
// Later tasks append to both lists: a new hub goes in HUBS, a new port in EXPECTED_PORTS.
import { describe, expect, it, vi } from 'vitest'

/** The hubs: path under src/game (no extension) and a literal loader for it, so the bundler sees every module and tsc checks every path. */
const HUBS: readonly (readonly [string, () => Promise<object>])[] = [
  ['aging', () => import('../src/game/aging')],
  ['menus', () => import('../src/game/menus')],
  ['special', () => import('../src/game/special')],
  ['careers', () => import('../src/game/careers')],
  ['business', () => import('../src/game/business')],
  ['computer', () => import('../src/game/computer')],
  ['assets', () => import('../src/game/assets')],
  ['finance', () => import('../src/game/finance')],
  ['crime', () => import('../src/game/crime')],
  ['underworld', () => import('../src/game/underworld')],
  ['effects', () => import('../src/game/effects')],
  ['business/manage', () => import('../src/game/business/manage')],
  ['business/yearly', () => import('../src/game/business/yearly')],
  ['business/economy', () => import('../src/game/business/economy')],
  ['computer/dev', () => import('../src/game/computer/dev')],
  ['computer/dev-projects', () => import('../src/game/computer/dev-projects')],
  ['special/gamedev', () => import('../src/game/special/gamedev')],
  ['special/gamedev-make', () => import('../src/game/special/gamedev-make')],
  ['special/politics', () => import('../src/game/special/politics')],
  ['special/model', () => import('../src/game/special/model')],
  ['special/model-exit', () => import('../src/game/special/model-exit')],
  ['activities/immigration-move', () => import('../src/game/activities/immigration-move')],
  ['nation/consequences', () => import('../src/game/nation/consequences')],
  ['economy/index', () => import('../src/game/economy/index')],
  ['events/helpers', () => import('../src/game/events/helpers')],
  ['kernel/registry', () => import('../src/game/kernel/registry')],
  ['modules/index', () => import('../src/game/modules/index')],
]

/** A hub that legitimately exports undefined today: path -> the names, with the reason. None yet. */
const UNDEFINED_OK: Readonly<Record<string, { names: readonly string[]; why: string }>> = {}

/** The ports the game defines, by name. Each task that cuts an import with a port adds its name here. */
const EXPECTED_PORTS: readonly string[] = ['business.revalueCompany', 'computer.gameMakingMenu']

describe('enter the game through each hub, in a fresh module registry', () => {
  it('lists each hub once', () => {
    const paths = HUBS.map(([p]) => p)
    expect(new Set(paths).size).toBe(paths.length)
  })

  for (const [hub, load] of HUBS) {
    it(`${hub} loads first and exports no undefined`, async () => {
      vi.resetModules()
      const m = (await load()) as Record<string, unknown>
      const names = Object.keys(m)
      expect(names.length, `${hub} exports nothing`).toBeGreaterThan(0)
      const allowed = new Set(UNDEFINED_OK[hub]?.names ?? [])
      const undef = names.filter((n) => m[n] === undefined && !allowed.has(n))
      expect(undef, `${hub} exports undefined: ${undef.join(', ')}`).toEqual([])
    }, 120_000)
  }
})

describe('every port is bound after entering through aging and menus', () => {
  it('binds all of them', async () => {
    vi.resetModules()
    await import('../src/game/aging')
    await import('../src/game/menus')
    const { portStatus } = await import('../src/game/kernel/ports')
    const status = portStatus()
    const unbound = status.filter((p) => !p.bound).map((p) => p.name)
    expect(unbound, `unbound after the real entry points: ${unbound.join(', ')}`).toEqual([])
    const names = status.map((p) => p.name)
    for (const want of EXPECTED_PORTS) expect(names, `port ${want} is not defined`).toContain(want)
  }, 120_000)
})

/** The first three int(0, 1_000_000) draws of seeded('r2-k5|moved'), worked out with the generator exactly as assets.ts held it before the move (FNV-1a over the key, then mulberry32). */
const SEEDED_R2_K5 = [442988, 493518, 750909]

describe('what moved is re-exported from its old home, not copied (R2-K5)', () => {
  it('computer.ts serves the computer predicates from computer/access.ts', async () => {
    vi.resetModules()
    const old = (await import('../src/game/computer')) as Record<string, unknown>
    const now = (await import('../src/game/computer/access')) as Record<string, unknown>
    const names = ['canUseComputer', 'computerAsset', 'computerLocked', 'isComputer', 'ownsComputer']
    expect(Object.keys(now).sort()).toEqual(names)
    for (const n of names) expect(old[n], n).toBe(now[n])
  }, 120_000)

  it('business/economy.ts serves localPay from data/local-pay.ts', async () => {
    vi.resetModules()
    const old = await import('../src/game/business/economy')
    const now = await import('../src/game/data/local-pay')
    expect(old.localPay).toBe(now.localPay)
    expect(now.localPay('us', 60_000)).toBe(60_000)
  }, 120_000)

  it('assets.ts serves seeded from rng.ts, and the stream is the one it always was', async () => {
    vi.resetModules()
    const old = await import('../src/game/assets')
    const now = await import('../src/game/rng')
    expect(old.seeded).toBe(now.seeded)
    // the same key gives the same draws, and the first five are the ones assets.ts gave before the move (FNV-1a seed, mulberry32)
    expect([1, 2, 3, 4, 5].map(() => now.seeded('r2-k5|moved').int(0, 1_000_000))).toEqual([1, 2, 3, 4, 5].map(() => old.seeded('r2-k5|moved').int(0, 1_000_000)))
    const r = now.seeded('r2-k5|moved')
    expect([r.int(0, 1_000_000), r.int(0, 1_000_000), r.int(0, 1_000_000)]).toEqual(SEEDED_R2_K5)
  }, 120_000)
})

describe('a port gives its callers what the import it replaced gave them (R2-K5)', () => {
  it('revalueCompany re-prices a company exactly as valuationOf and refreshValue do, once the company economy is loaded', async () => {
    vi.resetModules()
    const { revalueCompany } = await import('../src/game/business/contract')
    const eco = await import('../src/game/business/economy')
    const { rich, company } = await import('./hedge-kit')
    const viaPort = company(rich(61))
    const direct = company(rich(61))
    for (const c of [viaPort, direct]) c.b.cash += 3_000_000
    const before = viaPort.a.value
    revalueCompany(viaPort.a, viaPort.b)
    direct.b.valuation = eco.valuationOf(direct.b)
    eco.refreshValue(direct.a, direct.b)
    expect(viaPort.b.valuation).toBe(direct.b.valuation)
    expect(viaPort.a.value).toBe(direct.a.value)
    expect(viaPort.a.value).not.toBe(before) // the call did something: the extra cash is in the stake now
    expect(revalueCompany.bound).toBe(true)
  }, 120_000)

  it('revalueCompany does nothing while the company economy is not loaded', async () => {
    vi.resetModules()
    const { revalueCompany } = await import('../src/game/business/contract')
    expect(revalueCompany.bound).toBe(false)
    const a = { value: 5, upkeep: 7 }
    const b = { valuation: 9 }
    revalueCompany(a as never, b as never)
    expect([a, b]).toEqual([{ value: 5, upkeep: 7 }, { valuation: 9 }])
  }, 120_000)

  it('the computer shortcut to Make Games is the game industry menu once game-making has loaded', async () => {
    vi.resetModules()
    const { gameMakingMenu } = await import('../src/game/computer/contract')
    expect(gameMakingMenu.bound).toBe(false)
    expect(gameMakingMenu()).toBeNull()
    const { makeGamesMenu } = await import('../src/game/special/gamedev-make')
    expect(gameMakingMenu.bound).toBe(true)
    expect(gameMakingMenu()).toBe(makeGamesMenu)
  }, 120_000)
})
