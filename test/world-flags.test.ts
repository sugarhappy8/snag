// ci: fast
// R1-P6 (A.K0, review focus RF3): every key of GameState.flags is classified as world, personal or cache, and the
// classification is proven against the code that hands a life to an heir (continueAsChild).
//
//   world     survives the handoff: the world's own state (laws, markets, the family's firsts).
//   personal  the parent's life; the heir starts clean.
//   cache     derived or regenerable; the heir starts clean too.
//
// What the tests hold:
//   1. Every key that src/ reads or writes with a literal or a declared constant is classified, and every
//      template prefix has a prefix rule. A new `g.flags.thing` fails here until it is added to
//      src/game/world-flags.ts in the same commit.
//   2. No rule is stale (every rule is seen in src/, bar the declared exceptions).
//   3. The sites no scan can resolve (`flags[expr]`) and the whole-object uses of `flags` may not grow.
//   4. Heir survival: a world key reaches the heir through the real continueAsChild; no personal or cache key does.
//
// The scan is test/world-flags-kit.ts (on test/scan-kit.ts). To add a key, add it to WORLD, PERSONAL or CACHE in
// src/game/world-flags.ts; a world key also needs a sample, or a `covered` helper name that the heir table in
// test/heir-world-flags.test.ts mentions.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import type { GameState, Json } from '../src/game/types'
import { DECLARED_AHEAD, DYNAMIC_FLAG_SITES, WHOLE_FLAGS_SITES, WORLD_FLAG_RULES, classifyFlag, type FlagRule } from '../src/game/world-flags'
import { makeTestGame } from './helpers'
import { ROOT, loadSources, toSource, type SourceFile } from './scan-kit'
import { scanFlags, type FlagScan } from './world-flags-kit'

const SOURCES: SourceFile[] = loadSources(ROOT, 'src')
const SCAN: FlagScan = scanFlags(SOURCES)

const WHERE = 'add it to src/game/world-flags.ts (world, personal or cache)'

/** Keys the scan cannot see on purpose, with the reason. Everything else in the rule table must be found in src/. */
const NOT_SEEN: Readonly<Record<string, string>> = {
  // Written only inside the `n.flags = { ... }` literal of continueAsChild, never read: an object key, not an access.
  previousGeneration: 'object-literal key in continueAsChild',
  // Built by heavyKey(industry, market) ('heavy.restaurant|us'), so every access is a dynamic call site (counted by the
  // ratchet below), never a literal. The other helper keys (market.news, techWaves, techBase, aiFirsts, nation.policy)
  // are also read by literal or constant, so the scan sees them.
  'heavy.': 'built by heavyKey()',
}

/** Exact keys that the scan finds, literal or constant. */
function seenKeys(scan: FlagScan): Set<string> {
  return new Set([...scan.literal.keys(), ...scan.resolved.keys()])
}

function exactRules(): FlagRule[] {
  return WORLD_FLAG_RULES.filter((r) => !r.prefix)
}

function prefixRules(): FlagRule[] {
  return WORLD_FLAG_RULES.filter((r) => r.prefix)
}

describe('every flags key is classified', () => {
  it('the scan really reads src (a guard that sees nothing proves nothing)', () => {
    expect(SOURCES.length).toBeGreaterThan(300)
    expect(seenKeys(SCAN).size).toBeGreaterThan(150)
    expect(SCAN.templates.size).toBeGreaterThanOrEqual(8)
  })

  it('every literal and declared-constant key in src is classified', () => {
    const missing: string[] = []
    for (const map of [SCAN.literal, SCAN.resolved]) {
      for (const [key, files] of map) {
        if (classifyFlag(key) === null) missing.push(`  ${JSON.stringify(key)} in ${files.join(', ')}`)
      }
    }
    expect(missing, `Unclassified flag keys; ${WHERE}:\n${[...new Set(missing)].join('\n')}`).toEqual([])
  })

  it('every template prefix in src has a prefix rule', () => {
    const rules = prefixRules()
    const missing: string[] = []
    for (const [prefix, files] of SCAN.templates) {
      if (!rules.some((r) => prefix.startsWith(r.match))) missing.push(`  ${JSON.stringify(prefix)} in ${files.join(', ')}`)
    }
    expect(missing, `Template flag keys with no prefix rule; ${WHERE} as a prefix:\n${missing.join('\n')}`).toEqual([])
  })

  it('no constant name that a flags site uses is declared twice with different values', () => {
    expect(SCAN.ambiguous, 'Rename one of the constants so each flags site resolves to one key').toEqual({})
  })

  it('no rule is stale: every rule is seen in src, bar the declared exceptions', () => {
    const seen = seenKeys(SCAN)
    const prefixes = [...SCAN.templates.keys()]
    const skip = new Set<string>([...DECLARED_AHEAD, ...Object.keys(NOT_SEEN)])
    const stale: string[] = []
    for (const r of WORLD_FLAG_RULES) {
      if (skip.has(r.match)) continue
      const found = r.prefix
        ? [...seen].some((k) => k.startsWith(r.match)) || prefixes.some((p) => p.startsWith(r.match))
        : seen.has(r.match)
      if (!found) stale.push(`  ${r.prefix ? 'prefix ' : ''}${JSON.stringify(r.match)} (${r.cls})`)
    }
    expect(stale, `Rules that nothing in src/ reads or writes any more; remove them from src/game/world-flags.ts:\n${stale.join('\n')}`).toEqual([])
  })

  it('the keys declared ahead are personal and are rules already', () => {
    expect([...DECLARED_AHEAD].sort()).toEqual(['inbox', 'lifeSeries', 'textMem'])
    for (const key of DECLARED_AHEAD) expect(classifyFlag(key)).toBe('personal')
  })
})

describe('the sites no scan can resolve may not grow', () => {
  const ratchet = (found: Readonly<Record<string, number>>, baseline: Readonly<Record<string, number>>, what: string, fix: string): void => {
    const over: string[] = []
    for (const [file, count] of Object.entries(found)) {
      const allowed = baseline[file] ?? 0
      if (count > allowed) over.push(`  ${file}: ${count} ${what}, baseline ${allowed}`)
    }
    expect(over, `${fix}\n${over.join('\n')}`).toEqual([])
  }

  it('flags[expr] sites with a key that is a variable or a call stay at the baseline', () => {
    ratchet(SCAN.dynamic, DYNAMIC_FLAG_SITES, 'dynamic flags[expr] sites', 'Use a declared constant key, or add a prefix rule and a template key:')
  })

  it('whole-object uses of flags (spreads, key walks, aliases) stay at the baseline', () => {
    ratchet(SCAN.whole, WHOLE_FLAGS_SITES, 'whole-object flags uses', 'Read the flags you need by key (a whole-object use hides keys from the scan):')
  })

  it('the baselines name only files that exist and have a count', () => {
    const paths = new Set(SOURCES.map((s) => s.path))
    for (const table of [DYNAMIC_FLAG_SITES, WHOLE_FLAGS_SITES]) {
      for (const [file, count] of Object.entries(table)) {
        expect(paths.has(file), file).toBe(true)
        expect(Number.isInteger(count) && count > 0, `${file}: ${count}`).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Heir survival

/** A dead parent of 70 and a living child of 40, through the real death and handoff code. */
function deadParent(): { g: GameState; heirId: string } {
  const g = makeTestGame(1, { age: 70 })
  const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
  return { g, heirId: heir.id }
}

function handOff(g: GameState, heirId: string): GameState {
  killCharacter(g, 'Old Age')
  g.queue = []
  const n = continueAsChild(g, heirId)
  expect(n).not.toBe(g)
  expect(n.generation).toBe(2)
  return n
}

function handOffWith(values: ReadonlyMap<string, Json>): GameState {
  const { g, heirId } = deadParent()
  for (const [key, value] of values) g.flags[key] = value
  return handOff(g, heirId)
}

const byMatch = new Map<string, FlagRule>(WORLD_FLAG_RULES.map((r) => [r.match, r]))

describe('world keys reach the heir', () => {
  const sampled = exactRules().filter((r) => r.cls === 'world' && r.sample !== undefined)

  it('there are world rules with samples to test', () => {
    expect(sampled.length).toBeGreaterThanOrEqual(13)
  })

  for (const rule of sampled) {
    it(`${rule.match} is handed to the heir${rule.loose ? ' (present and a string)' : ' unchanged'}`, () => {
      const values = new Map<string, Json>([[rule.match, rule.sample as Json]])
      if (rule.needs !== undefined) {
        // The handoff carries a companion only when its main key is truthy: set the main key too.
        const main = byMatch.get(rule.needs)
        expect(main, `${rule.match} needs ${rule.needs}, which is not a rule`).toBeDefined()
        expect(main!.sample, `${rule.needs} needs a sample`).toBeDefined()
        values.set(rule.needs, main!.sample as Json)
      }
      const n = handOffWith(values)
      expect(rule.match in n.flags).toBe(true)
      if (rule.loose) expect(typeof n.flags[rule.match]).toBe('string')
      else expect(n.flags[rule.match]).toEqual(rule.sample)
    })
  }

  it('a world key without a sample is covered by the heir table of R0-4', () => {
    const table = readFileSync(join(ROOT, 'test', 'heir-world-flags.test.ts'), 'utf8')
    const bare = WORLD_FLAG_RULES.filter((r) => r.cls === 'world' && r.sample === undefined)
    expect(bare.length).toBeGreaterThan(0)
    for (const rule of bare) {
      expect(rule.covered, `${rule.match} has neither a sample nor a covered helper name`).toBeTruthy()
      expect(table.includes(rule.covered!), `${rule.match}: test/heir-world-flags.test.ts must mention ${rule.covered}`).toBe(true)
    }
  })
})

describe('personal and cache keys stay with the parent', () => {
  const PARENT = '__parent__'
  const LEAK: Json = { __leak: true }

  /** Every personal and cache key: exact keys as they are, prefixes with an 'x' on the end. */
  const keys: string[] = WORLD_FLAG_RULES.filter((r) => r.cls !== 'world').map((r) => (r.prefix ? r.match + 'x' : r.match))

  // A key that makes the handoff throw even with an object value is a hostile-flag robustness bug in continueAsChild,
  // not a classification error. It is listed here, with the reason, for the lead. Shrink this list when it is fixed.
  const HANDOFF_THROWS: readonly string[] = []

  function throws(values: ReadonlyMap<string, Json>): boolean {
    try {
      handOffWith(values)
      return false
    } catch {
      return true
    }
  }

  /** The smallest sets of keys that make the handoff throw when set to `value`, found by halving. */
  function throwers(list: readonly string[], value: Json): string[] {
    if (list.length === 0 || !throws(new Map(list.map((k) => [k, value] as const)))) return []
    if (list.length === 1) return [...list]
    const mid = list.length >> 1
    const found = [...throwers(list.slice(0, mid), value), ...throwers(list.slice(mid), value)]
    // Both halves are fine alone but not together: report the set.
    return found.length > 0 ? found : [...list]
  }

  it('the keys under test are all classified personal or cache', () => {
    expect(keys.length).toBeGreaterThan(150)
    for (const key of keys) expect(['personal', 'cache']).toContain(classifyFlag(key))
  })

  it('one handoff with every one of them set leaves none on the heir', () => {
    // The handoff itself works on a plain parent, so a throw below is caused by a flag.
    expect(() => handOffWith(new Map())).not.toThrow()
    const values = new Map<string, Json>(keys.map((k) => [k, PARENT] as const))
    // The common case is one game and one handoff. Only a throw sends us looking for the key that caused it.
    let n: GameState | null = null
    try {
      n = handOffWith(values)
    } catch {
      const hard: string[] = []
      for (const key of throwers(keys, PARENT)) {
        if (throws(new Map([[key, LEAK]]))) hard.push(key)
        else values.set(key, LEAK)
      }
      const unlisted = hard.filter((k) => !HANDOFF_THROWS.includes(k))
      expect(unlisted, `The handoff throws for these keys even with an object value; list them in HANDOFF_THROWS with a reason:\n${unlisted.join('\n')}`).toEqual([])
      for (const key of hard) values.delete(key)
    }
    const heir: GameState = n ?? handOffWith(values)
    const leaked = [...values].filter(([k, v]) => k in heir.flags && JSON.stringify(heir.flags[k]) === JSON.stringify(v)).map(([k]) => k)
    expect(leaked, `These flags reached the heir; either they are world state (make them a world rule with a sample) or the handoff must not copy them:\n${leaked.join('\n')}`).toEqual([])
    // The same handoff did build the heir's own flags: the test is not passing because nothing was written.
    expect(Object.keys(heir.flags).length).toBeGreaterThan(0)
  })

  it('every key listed in HANDOFF_THROWS still throws (the list only shrinks)', () => {
    for (const key of HANDOFF_THROWS) expect(throws(new Map([[key, LEAK]])), key).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// The kit, on synthetic sources

function scanOf(...files: Array<[path: string, text: string]>): FlagScan {
  return scanFlags(files.map(([path, text]) => toSource(path, text)))
}

describe('the flags scan', () => {
  it('reads dot, optional-chain and bracket-string access as literal keys', () => {
    const s = scanOf(['src/a.ts', "g.flags.alpha = 1\nconst b = g.flags?.beta\nconst c = g.flags['gamma.x']\nconst d = g.flags?.['delta']\nconst e = flags.epsilon"])
    expect([...s.literal.keys()].sort()).toEqual(['alpha', 'beta', 'delta', 'epsilon', 'gamma.x'])
    expect(s.literal.get('alpha')).toEqual(['src/a.ts'])
    expect(s.dynamic).toEqual({})
    expect(s.whole).toEqual({})
  })

  it('reads the key before a further property, and a static template, as a literal key', () => {
    const s = scanOf(['src/a.ts', 'const a = g.flags.alpha.length\nconst b = g.flags[`beta`]\nconst c = g.flags.gamma?.list'])
    expect([...s.literal.keys()].sort()).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('lists each file once per key', () => {
    const s = scanOf(['src/a.ts', 'g.flags.one = 1\nreturn g.flags.one'], ['src/b.ts', 'g.flags.one = 2'])
    expect(s.literal.get('one')).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('resolves a constant declared in the same file', () => {
    const s = scanOf(['src/a.ts', "const KEY = 'worldThing'\nexport const OTHER = 'second.key'\nreturn g.flags[KEY] ?? g.flags[OTHER]"])
    expect([...s.resolved.keys()].sort()).toEqual(['second.key', 'worldThing'])
    expect(s.literal.size).toBe(0)
    expect(s.dynamic).toEqual({})
  })

  it('resolves an imported constant to the module it comes from, even when another file reuses the name', () => {
    const s = scanOf(
      ['src/nation/state.ts', "export const FLAG = 'nation.policy'"],
      ['src/other/state.ts', "export const FLAG = 'something.else'"],
      ['src/nation/use.ts', "import { FLAG } from './state'\nreturn g.flags[FLAG]"],
      ['src/nation/alias.ts', "import { FLAG as K } from './state'\nreturn g.flags[K]"],
    )
    expect([...s.resolved.keys()].sort()).toEqual(['nation.policy'])
    expect(s.resolved.get('nation.policy')).toEqual(['src/nation/use.ts', 'src/nation/alias.ts'])
    expect(s.ambiguous).toEqual({})
    expect(s.dynamic).toEqual({})
  })

  it('does not resolve a parameter to a constant of the same name in another file', () => {
    const s = scanOf(
      ['src/a.ts', "export function f() {\n  const key = 'special.card'\n  return g.flags[key]\n}"],
      ['src/b.ts', 'export function read(g, key: string) {\n  return g.flags[key]\n}'],
    )
    expect([...s.resolved.keys()]).toEqual(['special.card'])
    expect(s.dynamic).toEqual({ 'src/b.ts': 1 })
  })

  it('reports a name that two declarations give different values, and takes the first', () => {
    const s = scanOf(
      ['src/a.ts', "export const KEY = 'first'"],
      ['src/b.ts', "export const KEY = 'second'"],
      ['src/c.ts', "export { KEY } from './a'\n"],
      ['src/d.ts', "import { KEY } from './c'\nreturn g.flags[KEY]"],
    )
    expect(s.resolved.has('first')).toBe(true)
    expect(Object.keys(s.ambiguous)).toEqual(['KEY'])
    expect(s.ambiguous.KEY!.join(' ')).toContain('src/b.ts')
  })

  it('reads a template key as a prefix, and a template that starts with a hole as dynamic', () => {
    const s = scanOf(['src/a.ts', 'return g.flags[`skill.${id}`] ?? g.flags[`own.${a}.${b}`] ?? g.flags[`${a}.tail`]'])
    expect([...s.templates.keys()].sort()).toEqual(['own.', 'skill.'])
    expect(s.templates.get('skill.')).toEqual(['src/a.ts'])
    expect(s.dynamic).toEqual({ 'src/a.ts': 1 })
  })

  it('counts a variable, a call and a concatenation as dynamic sites, per file', () => {
    const s = scanOf(
      ['src/a.ts', "g.flags[key] = 1\nreturn g.flags[heavyKey(a, b)] ?? g.flags['x' + id] ?? g.flags[PREFIX + id]"],
      ['src/b.ts', 'return g.flags?.[name]'],
    )
    expect(s.dynamic).toEqual({ 'src/a.ts': 4, 'src/b.ts': 1 })
    expect(s.literal.size).toBe(0)
  })

  it("reads 'key' in flags as a literal, not as a whole-object use", () => {
    const s = scanOf(['src/a.ts', "if ('recordedGrave' in g.flags) return\nif ('b' in n.character.flags) return"])
    expect([...s.literal.keys()].sort()).toEqual(['b', 'recordedGrave'])
    expect(s.whole).toEqual({})
  })

  it('counts spreads, key walks, aliases, object keys and types as whole-object uses', () => {
    const s = scanOf(
      ['src/a.ts', 'const copy = { ...g.flags }\nfor (const k of Object.keys(g.flags)) use(k)\nconst raw = g.flags'],
      ['src/b.ts', 'export const blank = { flags: {}, year: 1 }\ninterface S { flags: Record<string, Json> }'],
    )
    expect(s.whole).toEqual({ 'src/a.ts': 3, 'src/b.ts': 2 })
    expect(s.literal.size).toBe(0)
  })

  it('ignores a mention in a comment or a string', () => {
    const s = scanOf([
      'src/a.ts',
      "// g.flags.ghost and flags['ghost2']\n/* flags.ghost3 */\nconst text = 'g.flags.ghost4'\nconst t = `see flags.ghost5`\nreturn 1",
    ])
    expect(s.literal.size).toBe(0)
    expect(s.resolved.size).toBe(0)
    expect(s.templates.size).toBe(0)
    expect(s.dynamic).toEqual({})
    expect(s.whole).toEqual({})
  })

  it('reads TSX files too', () => {
    const s = scanOf(['src/ui/a.tsx', 'export function A({ g }) {\n  return <div title="x">{g.flags.shown ? 1 : 0}</div>\n}'])
    expect([...s.literal.keys()]).toEqual(['shown'])
  })
})

describe('classifyFlag', () => {
  it('knows a world key, a personal key, a cache key and a prefixed key', () => {
    expect(classifyFlag('worldEconomy')).toBe('world')
    expect(classifyFlag('puberty')).toBe('personal')
    expect(classifyFlag('flavorRecent')).toBe('cache')
    expect(classifyFlag('heavy.restaurant|us')).toBe('world')
    expect(classifyFlag('skill.voice')).toBe('personal')
  })

  it('returns null for a key nobody classified', () => {
    expect(classifyFlag('definitelyNotAFlag')).toBeNull()
    expect(classifyFlag('')).toBeNull()
  })

  it('an exact rule beats a prefix rule, and the longest prefix wins', () => {
    for (const e of exactRules()) {
      const covering = prefixRules().filter((p) => e.match.startsWith(p.match))
      if (covering.length > 0) expect(classifyFlag(e.match), e.match).toBe(e.cls)
    }
    for (const p of prefixRules()) {
      const longer = prefixRules().filter((q) => q !== p && q.match.startsWith(p.match))
      for (const q of longer) expect(classifyFlag(q.match + 'x'), q.match).toBe(q.cls)
    }
  })

  it('a prefix rule matches the keys that start with it and not the bare word', () => {
    for (const p of prefixRules()) expect(classifyFlag(p.match + 'anything'), p.match).not.toBeNull()
    // 'heavy.' is the Heavy R&D prefix; the word without the dot is not a key of it.
    expect(classifyFlag('heavy.restaurant|us')).toBe('world')
    expect(classifyFlag('heavy')).toBeNull()
  })

  it('rules have unique matches, so no key is both world and cache (or personal)', () => {
    const matches = WORLD_FLAG_RULES.map((r) => r.match)
    expect(matches.filter((m, i) => matches.indexOf(m) !== i)).toEqual([])
    for (const r of exactRules()) expect(classifyFlag(r.match), r.match).toBe(r.cls)
  })

  it('the extra fields sit only on world rules and make sense', () => {
    for (const r of WORLD_FLAG_RULES) {
      if (r.cls !== 'world') {
        expect(r.sample, r.match).toBeUndefined()
        expect(r.needs, r.match).toBeUndefined()
        expect(r.loose, r.match).toBeUndefined()
        expect(r.covered, r.match).toBeUndefined()
        continue
      }
      if (r.prefix) {
        expect(r.sample, r.match).toBeUndefined()
        expect(r.covered, r.match).toBeTruthy()
      } else {
        // A world key has a sample, or a helper name, and not both.
        expect((r.sample !== undefined) !== (r.covered !== undefined), r.match).toBe(true)
      }
      if (r.needs !== undefined) {
        expect(byMatch.get(r.needs)?.cls, r.match).toBe('world')
        expect(byMatch.get(r.needs)?.sample, r.match).toBeDefined()
      }
      if (r.loose) expect(typeof r.sample, r.match).toBe('string')
    }
  })

  it('the rule table is not empty and every class is used', () => {
    const classes = new Set(WORLD_FLAG_RULES.map((r) => r.cls))
    expect([...classes].sort()).toEqual(['cache', 'personal', 'world'])
    expect(WORLD_FLAG_RULES.length).toBeGreaterThan(200)
  })
})
