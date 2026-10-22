// R2-K8 (K.3 d): the kernel parity test. R2-K9 to R2-K12 convert the yearly hooks, the menu trees and the company view to registered
// modules; this test holds the line: the same hooks in the same order, the same state after N seeded years, the same menu trees,
// the same company views. The fixture (test/fixtures/kernel-parity.json) was recorded on the code before any conversion, and the
// conversions change only the accessor bodies in test/parity-kit.ts, never this file's expectations and never the fixture.
//
// Re-recording is for a legitimate change to the simulation, a menu or a company view, never for a conversion:
//
//   RECORD_KERNEL_PARITY=1 npx vitest run --maxWorkers=1 test/kernel-parity.test.ts     (under Node 22, the CI version)
//
// writes the fixture with the current short git sha in `base`. Without the variable the test only compares, and a missing fixture
// is a failure that names this command: it never writes silently. Say why in the commit message. The kit's header says why the
// seeds are pinned here.
//
// About 10 to 45 s on a free machine (four lives, the v4.0.2 save, four menu walks, a company view for every industry and five special
// companies), so it is not in the fast tier.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import {
  KERNEL_LIFE_IDS,
  MENU_STATES,
  PARITY_FILE,
  V1_YEARS,
  VIEW_KEYS,
  VIEW_VARIANTS,
  freshNavState,
  lifeOf,
  menuParity,
  tracedLife,
  v1Life,
  viewParity,
  yearly,
  type Digest,
  type LivesParity,
} from './parity-kit'
import { compareTraces, traceLife, type Divergence, type ParityTrace } from './r2-parity-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FIXTURE = join(ROOT, PARITY_FILE)
const TIMEOUT = 120_000
const RECORD = process.env.RECORD_KERNEL_PARITY === '1'
const RECORD_COMMAND = 'RECORD_KERNEL_PARITY=1 npx vitest run --maxWorkers=1 test/kernel-parity.test.ts'

interface Fixture {
  v: 1
  base: string
  aging: string[]
  special: string[]
  lives: LivesParity
  menus: Record<string, Record<string, Digest>>
  views: Record<string, Digest>
}

// ---------------------------------------------------------------------------------------------------------------------
// What was computed in this file, once each (a case that needs a result computes it, the next one reuses it)
// ---------------------------------------------------------------------------------------------------------------------

const memo = new Map<string, unknown>()
function once<T>(key: string, make: () => T): T {
  if (!memo.has(key)) memo.set(key, make())
  return memo.get(key) as T
}

const lifeResult = (id: string) => once(`life:${id}`, () => tracedLife(lifeOf(id)))
const v1Result = () => once('v1', () => v1Life())
const menuResult = (name: (typeof MENU_STATES)[number]) => once(`menu:${name}`, () => menuParity(name))
const viewResult = (key: string) => once(`view:${key}`, () => viewParity(key))

function computeAll(): Omit<Fixture, 'v' | 'base'> {
  const hooks: Record<string, Digest> = {}
  for (const id of KERNEL_LIFE_IDS) hooks[id] = lifeResult(id).hooks
  hooks.v1 = v1Result().hooks
  return {
    aging: yearly.names('aging'),
    special: yearly.names('special'),
    lives: { traces: KERNEL_LIFE_IDS.map((id) => lifeResult(id).trace), v1: v1Result().rows, hooks },
    menus: Object.fromEntries(MENU_STATES.map((n) => [n, menuResult(n)])),
    views: Object.fromEntries(VIEW_KEYS.map((k) => [k, viewResult(k)])),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The fixture file
// ---------------------------------------------------------------------------------------------------------------------

function baseSha(): string {
  const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()
  const dirty = execSync('git status --porcelain -- src', { cwd: ROOT, encoding: 'utf8' }).trim() !== ''
  return dirty ? `${sha}+dirty` : sha
}

const line = (v: unknown): string => JSON.stringify(v)
const digestMap = (m: Record<string, Digest>, pad: string): string =>
  Object.keys(m)
    .map((k) => `${pad}${line(k)}: ${line(m[k])}`)
    .join(',\n')

/** The fixture as text: one row per year, one digest per line, so a moved digest is a one-line diff. */
function fixtureText(f: Fixture): string {
  const traces = f.lives.traces.map((t) => `      { "id": ${line(t.id)}, "years": [\n${t.years.map((r) => `        ${line(r)}`).join(',\n')}\n      ] }`).join(',\n')
  const menus = Object.keys(f.menus)
    .map((n) => `    ${line(n)}: {\n${digestMap(f.menus[n]!, '      ')}\n    }`)
    .join(',\n')
  return [
    '{',
    '  "v": 1,',
    `  "base": ${line(f.base)},`,
    `  "aging": ${line(f.aging)},`,
    `  "special": ${line(f.special)},`,
    '  "lives": {',
    `    "traces": [\n${traces}\n    ],`,
    `    "v1": [\n${f.lives.v1.map((r) => `      ${line(r)}`).join(',\n')}\n    ],`,
    `    "hooks": {\n${digestMap(f.lives.hooks, '      ')}\n    }`,
    '  },',
    `  "menus": {\n${menus}\n  },`,
    `  "views": {\n${digestMap(f.views, '    ')}\n  }`,
    '}',
    '',
  ].join('\n')
}

function loadFixture(): Fixture {
  if (!existsSync(FIXTURE)) throw new Error(`${PARITY_FILE} is missing (no fixture). Record it on the code before any conversion: ${RECORD_COMMAND}`)
  const f = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
  if (f.v !== 1) throw new Error(`${PARITY_FILE} has v ${String(f.v)}, expected 1`)
  return f
}

// ---------------------------------------------------------------------------------------------------------------------
// Comparing
// ---------------------------------------------------------------------------------------------------------------------

function describeMoves(life: string, moves: Divergence[], recorded: number, played: number): string {
  const first = moves
    .slice(0, 5)
    .map((d) => `year ${d.year}: ${d.slices.join(', ')}`)
    .join('; ')
  const more = moves.length > 5 ? ` (and ${moves.length - 5} more years)` : ''
  const length = recorded === played ? '' : ` The life has ${played} rows, the fixture ${recorded}.`
  return `life ${life} moved. First divergence, by year and slice: ${first}${more}.${length}`
}

/** The moves of a played trace against its recorded one: the years both have are compared, and a different length is a move too. */
function movesOf(id: string, want: ParityTrace['years'], got: ParityTrace['years']): string[] {
  const n = Math.min(want.length, got.length)
  const moves = compareTraces([{ id, years: want.slice(0, n) }], [{ id, years: got.slice(0, n) }])
  return moves.length > 0 || want.length !== got.length ? [describeMoves(id, moves, want.length, got.length)] : []
}

/** The keys whose digest differs, appears or is gone, as "key: want -> got" lines. */
function digestMoves(want: Record<string, Digest>, got: Record<string, Digest>): string[] {
  const out: string[] = []
  for (const k of [...new Set([...Object.keys(want), ...Object.keys(got)])].sort()) {
    const a = want[k]
    const b = got[k]
    if (!a) out.push(`${k}: not in the fixture, now ${b!.n} items`)
    else if (!b) out.push(`${k}: gone (the fixture has ${a.n} items)`)
    else if (a.n !== b.n || a.h !== b.h) out.push(`${k}: ${a.n} items ${a.h} -> ${b.n} items ${b.h}`)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------------------------------------------------

describe('kernel parity: the fixture', () => {
  it(
    RECORD ? 'records the fixture (RECORD_KERNEL_PARITY=1)' : 'is there, and has the shape this test reads',
    () => {
      if (RECORD) writeFileSync(FIXTURE, fixtureText({ v: 1, base: baseSha(), ...computeAll() }))
      const f = loadFixture()
      expect(f.base).toMatch(/^[0-9a-f]{7,}(\+dirty)?$/)
      expect(f.lives.traces.map((t) => t.id)).toEqual([...KERNEL_LIFE_IDS])
      expect(Object.keys(f.lives.hooks).sort()).toEqual([...KERNEL_LIFE_IDS, 'v1'].sort())
      expect(f.lives.v1).toHaveLength(V1_YEARS)
      expect(Object.keys(f.menus)).toEqual([...MENU_STATES])
      expect(Object.keys(f.views)).toEqual([...VIEW_KEYS])
    },
    TIMEOUT,
  )
})

describe('kernel parity: the yearly lists', () => {
  it('the aging hooks are the recorded ones, in the recorded order', () => {
    expect(yearly.names('aging')).toEqual(loadFixture().aging)
  })

  it('the special hooks are the recorded ones, in the recorded order', () => {
    expect(yearly.names('special')).toEqual(loadFixture().special)
  })

  it('the fixture lists at least the 35 aging hooks of v4.1.1 and the 13 special ones', () => {
    const f = loadFixture()
    expect(f.aging.length).toBeGreaterThanOrEqual(35)
    expect(f.special).toHaveLength(13)
    expect(new Set(f.aging).size).toBe(f.aging.length)
    expect(f.aging.slice(0, 3)).toEqual(['history', 'digest', 'household'])
  })
})

describe('kernel parity: lives', () => {
  for (const id of KERNEL_LIFE_IDS) {
    it(
      `${id}: every slice of every year and the executed hooks match`,
      () => {
        const f = loadFixture()
        const want = f.lives.traces.find((t) => t.id === id)
        if (!want) throw new Error(`${PARITY_FILE} has no trace for life ${id}`)
        const got = lifeResult(id)
        expect(movesOf(id, want.years, got.trace.years)).toEqual([])
        expect(got.hooks).toEqual(f.lives.hooks[id])
      },
      TIMEOUT,
    )
  }

  it(
    'the v4.0.2 save: five years of every slice and the executed hooks match',
    () => {
      const f = loadFixture()
      const got = v1Result()
      expect(movesOf('v1', f.lives.v1, got.rows)).toEqual([])
      expect(got.hooks).toEqual(f.lives.hooks.v1)
    },
    TIMEOUT,
  )
})

describe('kernel parity: menus', () => {
  for (const name of MENU_STATES) {
    it(
      `${name}: every tab and top group of the walked tree has the recorded digest`,
      () => {
        expect(digestMoves(loadFixture().menus[name]!, menuResult(name))).toEqual([])
      },
      TIMEOUT,
    )
  }
})

describe('kernel parity: company views', () => {
  it(
    'the view of a company in each industry (every id of INDUSTRY_IDS) has the recorded digest',
    () => {
      const want = loadFixture().views
      const industries = VIEW_KEYS.filter((k) => !(k in VIEW_VARIANTS))
      expect(industries).toEqual([...INDUSTRY_IDS])
      expect(digestMoves(Object.fromEntries(industries.map((k) => [k, want[k]!])), Object.fromEntries(industries.map((k) => [k, viewResult(k)])))).toEqual([])
    },
    TIMEOUT,
  )

  it(
    'the view of each special company (hired CEO with a board, listed, group division, deep-tech lab, in the red) has the recorded digest',
    () => {
      const want = loadFixture().views
      const variants = Object.keys(VIEW_VARIANTS)
      expect(variants).toHaveLength(5)
      expect(digestMoves(Object.fromEntries(variants.map((k) => [k, want[k]!])), Object.fromEntries(variants.map((k) => [k, viewResult(k)])))).toEqual([])
    },
    TIMEOUT,
  )
})

describe('kernel parity: the kit is sensitive and deterministic', () => {
  // Short lives (copies of PARITY_LIVES entries) so the checks are fast. Measured at the recording: in a founder life (1 or 3
  // companies, 10 years) none of the 34 adjacent swaps of aging hooks moves a slice, because the hooks that touch a founder do not
  // touch each other. In a child's life the swap of `health` and `education` does (from age 3). The executed-hooks digest sees every
  // swap, whatever the state does; the slice digests see the ones that matter to the life they play.
  const FOUNDER = { ...lifeOf('f1950-1x25'), id: 'f1950-1x25-5y', years: 5 }
  const CHILD = { ...lifeOf('b2000-rich'), id: 'b2000-rich-6y', untilAge: 6 }

  /** Swaps two adjacent hooks, found by name so the test survives a hook added elsewhere in the list. */
  const swap = (a: string, b: string) => (names: string[]) => {
    const i = names.indexOf(a)
    expect(names[i + 1], `${a} is followed by ${b}`).toBe(b)
    names[i] = b
    names[i + 1] = a
    return names
  }

  it(
    'swapping two adjacent aging hooks changes the hook digest, and the slices when the hooks touch each other',
    () => {
      const plain = tracedLife(CHILD)
      const swapped = tracedLife(CHILD, swap('health', 'education'))
      expect(swapped.hooks.n).toBe(plain.hooks.n)
      expect(swapped.hooks.h).not.toBe(plain.hooks.h)
      const moves = compareTraces([plain.trace], [swapped.trace])
      expect(moves.length).toBeGreaterThan(0)
      expect(moves[0]!.slices.length).toBeGreaterThan(0)
      // a swap that does not touch a founder's state still changes the digest of the hooks that ran
      const f = tracedLife(FOUNDER)
      const g = tracedLife(FOUNDER, swap('business', 'techWaves'))
      expect(g.hooks.h).not.toBe(f.hooks.h)
      // and the hook lists are back as they were
      expect(yearly.names('aging')).toEqual(loadFixture().aging)
      expect(yearly.names('special')).toEqual(loadFixture().special)
    },
    TIMEOUT,
  )

  it('reordering to something that is not a permutation throws, and leaves the list alone', () => {
    const before = yearly.names('aging')
    expect(() => yearly.reordered((names) => names.slice(1), () => undefined)).toThrow(/permutation/)
    expect(() => yearly.reordered((names) => [...names.slice(1), names[1]!], () => undefined)).toThrow(/permutation/)
    expect(yearly.names('aging')).toEqual(before)
  })

  it('traced puts the lists back even when the run throws', () => {
    const before = [yearly.names('aging'), yearly.names('special')]
    expect(() =>
      yearly.traced([], () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect([yearly.names('aging'), yearly.names('special')]).toEqual(before)
  })

  it('traced names every hook of a year in the order of the lists: aging as `name`, special as `special.name`', () => {
    const out: string[] = []
    const trace = yearly.traced(out, () => traceLife({ ...FOUNDER, years: 1 }))
    expect(trace.years).toHaveLength(2)
    const special = yearly.names('special').map((n) => `special.${n}`)
    // one year of a founder who stays alive: every aging hook ran once, the special ones inside `special`
    expect(out).toEqual(yearly.names('aging').flatMap((n) => (n === 'special' ? ['special', ...special] : [n])))
  })

  it(
    'each builder gives the same answer twice: a short life, the v4.0.2 save, the menus of two states, every company view',
    () => {
      const a = tracedLife(FOUNDER)
      const b = tracedLife(FOUNDER)
      expect(b.trace.years).toEqual(a.trace.years)
      expect(b.hooks).toEqual(a.hooks)
      const x = v1Life()
      const y = v1Life()
      expect(y.rows).toEqual(x.rows)
      expect(y.hooks).toEqual(x.hooks)
      for (const name of ['kid', 'adult'] as const) expect(menuParity(name, freshNavState)).toEqual(menuParity(name, freshNavState))
      for (const key of VIEW_KEYS) expect(viewParity(key), key).toEqual(viewParity(key))
    },
    TIMEOUT,
  )

  it('the short founder life is the first rows of the recorded 25-year life of the same seed', () => {
    const recorded = loadFixture().lives.traces.find((t) => t.id === 'f1950-1x25')!
    const short = tracedLife(FOUNDER).trace
    expect(short.years).toEqual(recorded.years.slice(0, short.years.length))
  })

  it('the menu digests cover real trees (a population of groups, none empty) and the views are not all one tree', () => {
    for (const name of MENU_STATES) {
      const groups = Object.entries(menuResult(name))
      expect(groups.length, name).toBeGreaterThanOrEqual(3)
      for (const [key, d] of groups) expect(d.n, `${name} ${key}`).toBeGreaterThan(0)
    }
    const hashes = new Set(VIEW_KEYS.map((k) => viewResult(k).h))
    expect(hashes.size).toBeGreaterThan(5)
    for (const k of VIEW_KEYS) expect(viewResult(k).n, k).toBeGreaterThan(5)
  })
})
