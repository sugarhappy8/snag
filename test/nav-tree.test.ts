// R1-N1: the menu tree of the four canned states (test/nav-kit.ts), checked as a whole.
//
//   - the walk is big enough to mean something, has no duplicate path and makes no menu callback complain;
//   - walking a frozen (committed) state neither throws nor changes it (RF5: menus are pure);
//   - the lint is a RATCHET, not a burn-down. Today's offenders (groups over 12 rows without a heading, and groups
//     with one row) sit in 100+ feature files; zeroing them is outside this track. The baseline can only shrink: a new
//     violation fails, and so does a baseline entry that no state violates any more.
//
// To rewrite the baseline after a deliberate change (say why in the commit message):
//   NAV_LINT_UPDATE=1 NODE_OPTIONS=--max-old-space-size=2048 npx vitest run --maxWorkers=1 test/nav-tree.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { canonical, frozen, isTruncated, lintOf, walkTree, walkTreeCached, type NavStateName, type Walked } from './nav-kit'

const NAMES: NavStateName[] = ['kid', 'adult', 'ceo', 'elder']
const BASELINE_PATH = fileURLToPath(new URL('./fixtures/nav-lint-baseline.json', import.meta.url))

/** Fewest nodes a state's walk must find. */
const MIN_NODES: Record<NavStateName, number> = { kid: 300, adult: 300, ceo: 4000, elder: 300 }

/**
 * Canonical paths that really are listed twice in a state (a sibling id used twice, say), with the reason.
 * Empty on purpose: criterion 6 wants no duplicate id path, so an entry needs a comment and a plan.
 */
const KNOWN_DUPES: Record<string, string> = {}

interface Baseline {
  tooLong: string[]
  single: string[]
}

/** The CEO walk (about 12,000 nodes) takes seconds; the default 10 s hook and 15 s test timeouts are too tight on a loaded CI box. */
const HEAVY = 120_000

const walks = new Map<NavStateName, Walked[]>()
const menuErrors: string[] = []

beforeAll(() => {
  // The first (and only cached) walk of each state happens here, with console.error watched.
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    menuErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ').slice(0, 300))
  })
  try {
    for (const name of NAMES) walks.set(name, walkTreeCached(name))
  } finally {
    spy.mockRestore()
  }
}, HEAVY)

function sorted(set: Iterable<string>): string[] {
  return [...set].sort()
}

function readBaseline(): Baseline {
  const base = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
  expect(Array.isArray(base.tooLong) && Array.isArray(base.single), 'baseline shape').toBe(true)
  return base
}

/** The union of the lint over the four canned states. */
function lintUnion(): { tooLong: Set<string>; single: Set<string> } {
  const tooLong = new Set<string>()
  const single = new Set<string>()
  for (const name of NAMES) {
    const found = lintOf(walks.get(name)!)
    for (const id of found.tooLong) tooLong.add(id)
    for (const id of found.single) single.add(id)
  }
  return { tooLong, single }
}

describe('menu tree of the canned states', () => {
  it('5. each walk is big enough, has no duplicate canonical path and no console.error from a menu callback', () => {
    for (const name of NAMES) {
      const walked = walks.get(name)!
      expect(walked.length, `${name}: nodes found`).toBeGreaterThan(MIN_NODES[name])
      const seen = new Map<string, number>()
      for (const w of walked) {
        // A hub group shares its parent's canonical path on purpose.
        if (w.type === 'menu' && w.ids[w.ids.length - 1].startsWith('hub.')) continue
        const key = canonical(w)
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
      const dupes = [...seen].filter(([key, n]) => n > 1 && !(`${name}:${key}` in KNOWN_DUPES)).map(([key, n]) => `${key} x${n}`)
      expect(dupes.slice(0, 20), `${name}: duplicate canonical paths (${dupes.length})`).toEqual([])
    }
    expect(menuErrors.slice(0, 10), 'console.error calls made by menu callbacks while walking').toEqual([])
  })

  it('5b. a walk that stops at the depth or node cap would be a quiet hole, so no group may sit at the depth cap', () => {
    for (const name of NAMES) {
      const walked = walks.get(name)!
      // A group in a list at the cap is listed but never entered; hub groups add no depth.
      const deepest = walked.filter((w) => w.type === 'menu').reduce((m, w) => Math.max(m, w.ids.filter((id) => !id.startsWith('hub.')).length), 0)
      expect(deepest, `${name}: deepest group`).toBeLessThan(8)
      expect(walked.length, `${name}: nodes found vs the cap`).toBeLessThan(30000)
      expect(isTruncated(walked), `${name}: the walk was cut by the depth or node cap`).toBe(false)
    }
  })

  it('6. walking a frozen state does not throw and does not change it (RF5)', () => {
    // The CEO tree is walked once per file (the cached walk in beforeAll, on a deep-frozen state, with console.error
    // watched: a write to a frozen object throws, the menuModel wrappers report it, and test 5 fails on it). The three
    // cheap states are walked again here to compare their JSON before and after.
    expect(menuErrors, 'ceo: a menu complained on the frozen state').toEqual([])
    expect(walks.get('ceo')!.length, 'ceo').toBeGreaterThan(MIN_NODES.ceo)
    for (const name of NAMES.filter((n) => n !== 'ceo')) {
      const g = frozen(name)
      const before = JSON.stringify(g)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      let walked: Walked[] = []
      try {
        expect(() => {
          walked = walkTree(g)
        }, name).not.toThrow()
        expect(spy.mock.calls.map((c) => String(c[0])).slice(0, 5), `${name}: a menu complained on a frozen state`).toEqual([])
      } finally {
        spy.mockRestore()
      }
      expect(walked.length, name).toBe(walks.get(name)!.length)
      expect(JSON.stringify(g) === before, `${name}: JSON changed by the walk`).toBe(true)
    }
  }, HEAVY)

  it('7. the lint ratchet: no new violation', () => {
    const { tooLong, single } = lintUnion()
    if (process.env.NAV_LINT_UPDATE === '1') {
      const out: Baseline = { tooLong: sorted(tooLong), single: sorted(single) }
      writeFileSync(BASELINE_PATH, `${JSON.stringify(out, null, 2)}\n`)
      return
    }
    const base = readBaseline()
    const fresh: string[] = []
    for (const id of tooLong) if (!base.tooLong.includes(id)) fresh.push(`${id} has more than 12 rows and no heading`)
    for (const id of single) if (!base.single.includes(id)) fresh.push(`${id} has a single row`)
    const way = 'Fix it by adding a heading (or merging the row into its parent). Only if the group has to stay as it is, run NAV_LINT_UPDATE=1 npx vitest run --maxWorkers=1 test/nav-tree.test.ts and say why in the commit message.'
    expect(fresh, `New menu lint violations. ${way}`).toEqual([])
  })

  it('7a. the lint ratchet: no stale baseline entry, so the list can only shrink', () => {
    const { tooLong, single } = lintUnion()
    const base = readBaseline()
    const stale: string[] = []
    for (const id of base.tooLong) if (!tooLong.has(id)) stale.push(`${id} (tooLong)`)
    for (const id of base.single) if (!single.has(id)) stale.push(`${id} (single)`)
    expect(stale, 'These baseline entries no longer violate in any canned state. Run NAV_LINT_UPDATE=1 npx vitest run --maxWorkers=1 test/nav-tree.test.ts to drop them').toEqual([])
  })

  it('7b. the baseline is sorted, unique and made of normalised ids', () => {
    const base = readBaseline()
    for (const list of [base.tooLong, base.single]) {
      expect(list).toEqual(sorted(new Set(list)))
      for (const id of list) expect(id).not.toMatch(/\d/)
    }
  })
})
