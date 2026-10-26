// R4-E6b (D.3, X6): the `social` stamp (src/game/world/social.ts). One small shard of the world, { v: 1, on: 1, y, fy } and two optional
// fields the acts write, `ay` (the year society.acts last ran) and `ms` (the mentor baseline, at most 3 [ref, skill] pairs). A life
// that has the shard plays the social track; every other life, every v5.2.0 save and every heir of one does not (X6). The key
// decides only whether a NEW life is stamped; createNewLife calls stampSocial in R4-E7, and nothing calls it here.
//
// What this file pins: stampSocial writes the shard once and a second call changes nothing; socialOn is pure and total on every
// hostile shard (a number, an array, a string, a future version, on: true, on: '1', a prototype key); the reader repairs a year it
// can repair and drops the shard when it cannot; `ms` keeps three valid pairs whatever is offered (100 x the cap); patchSocial is the
// one writer of y, ay and ms, replaces the root, keeps unchanged values by identity and runs on a deep-frozen root; the invariant
// and the budget meter name a shard written around its reader; the shard survives a clone, a reload and a play of years.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import type { EntityRef } from '../src/game/kernel/ids'
import { createNewLife } from '../src/game/life'
import type { GameState } from '../src/game/types'
import { worldBudget } from '../src/game/world/budget'
import { worldProblems } from '../src/game/world/invariants'
import '../src/game/world/shards'
import { SOCIAL_MS_MAX, normalizeSocial, patchSocial, readSocial, socialOn, socialProblems, stampSocial, type SocialShard } from '../src/game/world/social'
import { normalizeWorld, readWorld, shardNames, worldShard } from '../src/game/world/state'
import { trapRng } from './effort-kit'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { layerOf } from './layer-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const json = (x: unknown): string => JSON.stringify(x)

// A fixed life as a constant, not a pin of the form the seed ratchet counts (test/seed-pins.test.ts).
const LIFE_SEED = 3
const BIRTH_YEAR = 1990

const pr = (n: number | string): EntityRef => `person:p${n}`

/** A game with a world that holds exactly this raw `social` value. */
function withSocial(raw: unknown, year = 2030): GameState {
  const g = makeTestGame(1)
  g.year = year
  ;(g as { world?: unknown }).world = { v: 1, social: raw }
  return g
}

/** A stamped game: the stamp of this year. */
function stamped(year = 2030): GameState {
  const g = makeTestGame(1)
  g.year = year
  stampSocial(g)
  return g
}

const shardOf = (g: Pick<GameState, 'world'>): unknown => (g.world as Record<string, unknown> | undefined)?.social

describe('layer and files', () => {
  it('puts social.ts in layer 2, keeps the sources free of long dashes, and draws no number', () => {
    expect(layerOf('src/game/world/social.ts')).toBe(2)
    for (const f of ['src/game/world/social.ts', 'src/game/world/edge-write.ts', 'src/game/world/edges-slice.ts']) {
      const src = read(f)
      expect(DASH.test(src), f).toBe(false)
      expect(src, f).not.toMatch(/g\.rng|\brand\(|Math\.random|Date\.now|performance\.now/)
    }
  })

  it('registers the shard `social` (and `edges`) in the world hub', () => {
    expect(shardNames()).toContain('social')
    expect(shardNames()).toContain('edges')
    expect(read('src/game/world/shards.ts')).toMatch(/import '\.\/social'/)
    expect(read('src/game/world/shards.ts')).toMatch(/import '\.\/edges'/)
  })
})

describe('stampSocial and socialOn', () => {
  it('is off for a game with no world, an empty world and a world with no social shard', () => {
    expect(socialOn(makeTestGame(1))).toBe(false)
    const g = makeTestGame(1)
    ;(g as { world?: unknown }).world = { v: 1 }
    expect(socialOn(g)).toBe(false)
    ;(g as { world?: unknown }).world = { v: 1, people: { v: 1, rows: [], over: 0 } }
    expect(socialOn(g)).toBe(false)
  })

  it('writes { v: 1, on: 1, y, fy } for this year, makes the world for it, and then is on', () => {
    const g = makeTestGame(1)
    g.year = 2031
    expect(g.world).toBeUndefined()
    stampSocial(g)
    expect(g.world).toEqual({ v: 1, social: { v: 1, on: 1, y: 2031, fy: 2031 } })
    expect(socialOn(g)).toBe(true)
    expect(readSocial(g)).toEqual({ v: 1, on: 1, y: 2031, fy: 2031 })
  })

  it('is idempotent: a second call, in the same year or a later one, changes nothing and keeps the very root', () => {
    const g = stamped(2031)
    const before = shardOf(g)
    const text = json(g.world)
    stampSocial(g)
    expect(shardOf(g)).toBe(before)
    g.year = 2040
    stampSocial(g)
    expect(shardOf(g)).toBe(before)
    expect(json(g.world)).toBe(text)
    expect((before as SocialShard).fy).toBe(2031)
  })

  it('leaves every other shard of the world alone, by identity', () => {
    const g = makeTestGame(1)
    const people = { v: 1, rows: [{ id: pr(1), seen: 2030 }], over: 0 }
    ;(g as { world?: unknown }).world = { v: 1, y: 2030, people }
    stampSocial(g)
    expect(readWorld(g).people).toBe(people)
    expect(Object.keys(readWorld(g))).toEqual(['v', 'y', 'people', 'social'])
  })

  it('writes nothing for a year that is not a year', () => {
    for (const year of [0, 5, 1899, 100_001, 2030.5, NaN, Infinity]) {
      const g = makeTestGame(1)
      g.year = year
      stampSocial(g)
      expect(g.world, String(year)).toBeUndefined()
    }
  })

  it('replaces a world that is garbage, and a shard that is garbage, with a stamp', () => {
    const g = makeTestGame(1)
    g.year = 2030
    ;(g as { world?: unknown }).world = 42
    stampSocial(g)
    expect(g.world).toEqual({ v: 1, social: { v: 1, on: 1, y: 2030, fy: 2030 } })
    const h = withSocial('nope')
    stampSocial(h)
    expect(socialOn(h)).toBe(true)
    expect(readWorld(h).social).toEqual({ v: 1, on: 1, y: 2030, fy: 2030 })
  })

  const HOSTILE: readonly (readonly [string, unknown])[] = [
    ['a number', 42],
    ['a string', 'on'],
    ['null', null],
    ['an array', [1, 1, 2030, 2030]],
    ['on: 0', { v: 1, on: 0, y: 2030, fy: 2030 }],
    ['on: true', { v: 1, on: true, y: 2030, fy: 2030 }],
    ["on: '1'", { v: 1, on: '1', y: 2030, fy: 2030 }],
    ['on: 2', { v: 1, on: 2, y: 2030, fy: 2030 }],
    ['no on', { v: 1, y: 2030, fy: 2030 }],
    ['a future version', { v: 2, on: 1, y: 2030, fy: 2030 }],
    ['no years at all', { v: 1, on: 1 }],
    ['years that are text', { v: 1, on: 1, y: '2030', fy: '2030' }],
    ['years that are NaN', { v: 1, on: 1, y: NaN, fy: Infinity }],
    ['a Date', new Date(0)],
  ]

  it.each(HOSTILE)('socialOn is false and never throws for %s', (_name, raw) => {
    const g = withSocial(raw)
    expect(() => socialOn(g)).not.toThrow()
    expect(socialOn(g)).toBe(false)
    expect(readSocial(g)).toBeNull()
  })

  it('reads a prototype key as nothing: __proto__ and inherited fields never turn the stamp on', () => {
    const viaProto = JSON.parse('{"__proto__":{"v":1,"on":1,"y":2030,"fy":2030}}') as unknown
    expect(socialOn(withSocial(viaProto))).toBe(false)
    const inherited = Object.create({ v: 1, on: 1, y: 2030, fy: 2030 }) as unknown
    expect(socialOn(withSocial(inherited))).toBe(false)
  })

  it('is pure and total on a deep-frozen state with a trapped g.rng: no draw, no write', () => {
    const g = deepFreeze(trapRng(withSocial({ v: 1, on: 1, y: 2030, fy: 2028 })))
    const text = json(g.world)
    for (let i = 0; i < 50; i++) {
      expect(socialOn(g)).toBe(true)
      readSocial(g)
    }
    expect(json(g.world)).toBe(text)
    const off = deepFreeze(trapRng(makeTestGame(1)))
    expect(socialOn(off)).toBe(false)
    expect(off.world).toBeUndefined()
  })

  it('stamps a state whose world is frozen shard by shard, because the root of the world is the draft\'s own', () => {
    const g = makeTestGame(1)
    g.year = 2030
    ;(g as { world?: unknown }).world = { v: 1, y: 2030, people: deepFreeze({ v: 1, rows: [], over: 0 }) }
    stampSocial(g)
    expect(socialOn(g)).toBe(true)
  })
})

describe('the reader (normalizeSocial)', () => {
  const GOOD = { v: 1, on: 1, y: 2030, fy: 2028 }

  it('gives a valid shard back as itself, with and without its optional fields', () => {
    expect(normalizeSocial(GOOD)).toBe(GOOD)
    const full = { v: 1, on: 1, y: 2030, fy: 2028, ay: 2029, ms: [[pr(1), 40.5], [pr(2), 0]] }
    expect(normalizeSocial(full)).toBe(full)
  })

  it('is total: anything that is not a plain object is no shard', () => {
    for (const x of [undefined, null, 0, 'x', true, [], [GOOD], () => GOOD, new Date(), new Map(), Symbol('s')]) expect(normalizeSocial(x as unknown), String(typeof x)).toBeUndefined()
  })

  it('drops keys it does not know and keeps the rest', () => {
    const out = normalizeSocial({ ...GOOD, junk: 1, x: { deep: [1] } })!
    expect(out).toEqual(GOOD)
    expect(Object.keys(out)).toEqual(['v', 'on', 'y', 'fy'])
  })

  it('repairs one missing or bad year from the other, and drops the shard when both are bad', () => {
    expect(normalizeSocial({ v: 1, on: 1, y: 2030 })).toEqual({ v: 1, on: 1, y: 2030, fy: 2030 })
    expect(normalizeSocial({ v: 1, on: 1, fy: 2025, y: 'x' })).toEqual({ v: 1, on: 1, y: 2025, fy: 2025 })
    expect(normalizeSocial({ v: 1, on: 1, y: 1.5, fy: -3 })).toBeUndefined()
    expect(normalizeSocial({ v: 1, on: 1, y: 100_001, fy: 1899 })).toBeUndefined()
  })

  it('keeps `ay` only as a whole year', () => {
    expect(normalizeSocial({ ...GOOD, ay: 2029 })!.ay).toBe(2029)
    for (const ay of [0, 2029.5, '2029', NaN, null, -1, 1e300, {}]) expect(normalizeSocial({ ...GOOD, ay }), String(ay)).toEqual(GOOD)
  })

  it('keeps `ms` to three valid [person ref, skill] pairs: bad pairs go, a repeated ref counts once, a skill is cut to 0..100', () => {
    const ms = [[pr(1), 150], [pr(2), -4], [pr(1), 30], ['firm:f1', 50], [pr(3), NaN], [pr(4), 'x'], [pr(5)], 'junk', [pr(6), 61], [pr(7), 70]]
    const out = normalizeSocial({ ...GOOD, ms })!
    expect(out.ms).toEqual([[pr(1), 100], [pr(2), 0], [pr(6), 61]])
    expect(SOCIAL_MS_MAX).toBe(3)
  })

  it('leaves `ms` out when nothing in it is valid or it is not a list', () => {
    for (const ms of [[], 'x', 5, {}, [[1, 2]], [null]]) expect(normalizeSocial({ ...GOOD, ms }), json(ms)).toEqual(GOOD)
  })

  it('cuts 100 x the mentor pairs (300 offered) to three, and 100 x a hostile list scanned in bounded time', () => {
    const many = Array.from({ length: 300 }, (_, i) => [pr(i), i % 101])
    expect(normalizeSocial({ ...GOOD, ms: many })!.ms).toHaveLength(3)
    const huge = Array.from({ length: 200_000 }, (_, i) => [pr(i), 50])
    const t = performance.now()
    expect(normalizeSocial({ ...GOOD, ms: huge })!.ms).toHaveLength(3)
    expect(performance.now() - t).toBeLessThan(2_000)
  })

  it('never reads a prototype: an inherited ms is no ms', () => {
    const base = Object.create({ ms: [[pr(1), 50]], ay: 2029 }) as Record<string, unknown>
    Object.assign(base, GOOD)
    expect(normalizeSocial(base)).toEqual(GOOD)
  })

  it('is what the world reads through: normalizeWorld keeps a valid shard whole and drops a hostile one', () => {
    expect(normalizeWorld({ v: 1, social: GOOD }).social).toBe(GOOD)
    expect(normalizeWorld({ v: 1, social: { ...GOOD, on: 0 } })).toEqual({ v: 1 })
    expect(worldShard(withSocial({ ...GOOD, junk: 1 }), 'social')).toEqual(GOOD)
  })
})

describe('patchSocial: the one writer of y, ay and ms', () => {
  it('writes nothing for a life that is not stamped, and never makes the stamp', () => {
    const g = makeTestGame(1)
    expect(patchSocial(g, { y: 2031 })).toBe(false)
    expect(g.world).toBeUndefined()
    const h = withSocial({ v: 1, on: 0, y: 2030, fy: 2030 })
    expect(patchSocial(h, { y: 2031 })).toBe(false)
    expect(socialOn(h)).toBe(false)
  })

  it('sets y, ay and ms, replaces the root, and leaves the old root as it was', () => {
    const g = stamped(2030)
    const before = shardOf(g) as SocialShard
    expect(patchSocial(g, { y: 2031, ay: 2031, ms: [[pr(1), 40], [pr(2), 55.5]] })).toBe(true)
    const after = shardOf(g) as SocialShard
    expect(after).not.toBe(before)
    expect(after).toEqual({ v: 1, on: 1, y: 2031, fy: 2030, ay: 2031, ms: [[pr(1), 40], [pr(2), 55.5]] })
    expect(before).toEqual({ v: 1, on: 1, y: 2030, fy: 2030 })
    expect(readSocial(g)).toEqual(after)
  })

  it('is a no-op when nothing changes: the same root, and an equal list is the stored list', () => {
    const g = stamped(2030)
    patchSocial(g, { ay: 2030, ms: [[pr(1), 40]] })
    const root = shardOf(g) as SocialShard
    expect(patchSocial(g, { y: 2030, ay: 2030 })).toBe(false)
    expect(patchSocial(g, { ms: [[pr(1), 40]] })).toBe(false)
    expect(patchSocial(g, {})).toBe(false)
    expect(shardOf(g)).toBe(root)
  })

  it('keeps a value that did not change by identity when another one does', () => {
    const g = stamped(2030)
    patchSocial(g, { ms: [[pr(1), 40], [pr(2), 41]] })
    const ms = (shardOf(g) as SocialShard).ms
    expect(patchSocial(g, { y: 2031, ms: [[pr(1), 40], [pr(2), 41]] })).toBe(true)
    expect((shardOf(g) as SocialShard).ms).toBe(ms)
    expect((shardOf(g) as SocialShard).y).toBe(2031)
  })

  it('clears `ms` with null or an empty list, and leaves the other fields', () => {
    const g = stamped(2030)
    patchSocial(g, { ay: 2030, ms: [[pr(1), 40]] })
    expect(patchSocial(g, { ms: null })).toBe(true)
    expect(shardOf(g)).toEqual({ v: 1, on: 1, y: 2030, fy: 2030, ay: 2030 })
    patchSocial(g, { ms: [[pr(1), 40]] })
    expect(patchSocial(g, { ms: [] })).toBe(true)
    expect((shardOf(g) as SocialShard).ms).toBeUndefined()
  })

  it('refuses a year that is not a year, and writes nothing for the whole patch', () => {
    const g = stamped(2030)
    const root = shardOf(g)
    for (const y of [NaN, 2030.5, 0, 1e9, '2031', null, Infinity]) {
      expect(patchSocial(g, { y: y as number, ay: 2031 }), String(y)).toBe(false)
      expect(shardOf(g), String(y)).toBe(root)
    }
    expect(patchSocial(g, { ay: NaN })).toBe(false)
    expect(shardOf(g)).toBe(root)
  })

  it('cuts an `ms` that is too long or has bad pairs, the way the reader does (100 x offered)', () => {
    const g = stamped(2030)
    patchSocial(g, { ms: Array.from({ length: 300 }, (_, i) => [pr(i), 50] as const) })
    expect((shardOf(g) as SocialShard).ms).toHaveLength(3)
    patchSocial(g, { ms: [[pr(1), 1e300], ['nope' as EntityRef, 5]] })
    expect((shardOf(g) as SocialShard).ms).toEqual([[pr(1), 100]])
    expect(socialProblems(shardOf(g))).toEqual([])
  })

  it('cannot change on, v or fy, and ignores a key it does not know', () => {
    const g = stamped(2030)
    const root = shardOf(g)
    expect(patchSocial(g, { on: 0, v: 2, fy: 1999, junk: 1 } as never)).toBe(false)
    expect(shardOf(g)).toBe(root)
  })

  it('runs on a state whose shard root is deep-frozen: it replaces the root, and what it stores is frozen', () => {
    const g = makeTestGame(1)
    g.year = 2030
    ;(g as { world?: unknown }).world = { v: 1, social: deepFreeze({ v: 1, on: 1, y: 2030, fy: 2030, ms: [[pr(1), 40]] }) }
    const before = shardOf(g) as SocialShard
    expect(patchSocial(g, { y: 2031 })).toBe(true)
    const after = shardOf(g) as SocialShard
    expect(after).not.toBe(before)
    expect(after.ms).toBe(before.ms)
    expect(Object.isFrozen(after)).toBe(true)
    expect(() => {
      ;(after as { y: number }).y = 1
    }).toThrow(TypeError)
    expect(() => {
      ;(after.ms as unknown as unknown[]).push(1)
    }).toThrow(TypeError)
  })

  it('draws no number from g.rng', () => {
    const g = trapRng(stamped(2030))
    expect(() => patchSocial(g, { y: 2031, ay: 2031, ms: [[pr(1), 40]] })).not.toThrow()
  })
})

describe('socialProblems and the invariants', () => {
  it('has no problem for an absent shard and for a valid one', () => {
    expect(socialProblems(undefined)).toEqual([])
    expect(socialProblems({ v: 1, on: 1, y: 2030, fy: 2030 })).toEqual([])
    expect(socialProblems({ v: 1, on: 1, y: 2030, fy: 2030, ay: 2030, ms: [[pr(1), 40]] })).toEqual([])
  })

  it('names every way a stored shard is wrong, and is empty exactly when the reader gives it back as itself', () => {
    const cases: [string, unknown, RegExp][] = [
      ['not an object', 5, /not a plain object/],
      ['an array', [], /not a plain object/],
      ['v', { v: 2, on: 1, y: 2030, fy: 2030 }, /v must be 1/],
      ['on', { v: 1, on: 0, y: 2030, fy: 2030 }, /on must be 1/],
      ['y', { v: 1, on: 1, y: 2030.5, fy: 2030 }, /y must be a whole year/],
      ['fy', { v: 1, on: 1, y: 2030, fy: 'x' }, /fy must be a whole year/],
      ['ay', { v: 1, on: 1, y: 2030, fy: 2030, ay: NaN }, /ay must be a whole year/],
      ['an unknown field', { v: 1, on: 1, y: 2030, fy: 2030, zz: 1 }, /unknown field/],
      ['ms not a list', { v: 1, on: 1, y: 2030, fy: 2030, ms: {} }, /ms must be a list/],
      ['ms too long', { v: 1, on: 1, y: 2030, fy: 2030, ms: [[pr(1), 1], [pr(2), 1], [pr(3), 1], [pr(4), 1]] }, /ms has 4 pairs/],
      ['ms empty', { v: 1, on: 1, y: 2030, fy: 2030, ms: [] }, /ms is empty/],
      ['ms bad pair', { v: 1, on: 1, y: 2030, fy: 2030, ms: [[pr(1), 'x']] }, /ms holds a bad pair/],
      ['ms repeats a ref', { v: 1, on: 1, y: 2030, fy: 2030, ms: [[pr(1), 1], [pr(1), 2]] }, /ms names a ref twice/],
    ]
    for (const [name, raw, want] of cases) {
      const problems = socialProblems(raw)
      expect(problems.length, name).toBeGreaterThan(0)
      expect(problems.join('\n'), name).toMatch(want)
      const clean = normalizeSocial(raw)
      expect(clean === raw, name).toBe(false)
    }
  })

  it('is wired into worldProblems as "social: ..." lines, and a stamped life has none', () => {
    const g = stamped(2030)
    expect(worldProblems(g, { live: false })).toEqual([])
    const bad = withSocial({ v: 1, on: 1, y: 2030, fy: 2030, ms: [[pr(1), 1], [pr(2), 1], [pr(3), 1], [pr(4), 1]] })
    expect(worldProblems(bad, { live: false }).filter((p) => p.startsWith('social: ')).length).toBeGreaterThan(0)
  })

  it('is counted by the budget meter against its cap: a shard written around its reader shows', () => {
    const bad = withSocial({ v: 1, on: 1, y: 2030, fy: 2030, ms: Array.from({ length: 5 }, (_, i) => [pr(i), 1]) })
    expect(worldBudget(bad).over).toContain('social: 5 pairs pass the cap of 3')
    expect(worldBudget(stamped(2030)).over).toEqual([])
    expect(worldBudget(stamped(2030)).nodes.social).toBe(5)
  })
})

describe('a stamped life', () => {
  it('keeps the stamp through three played years, a clone and a JSON reload, and has no problem (y and ay follow the years)', () => {
    const g = createNewLife({ seed: LIFE_SEED, year: BIRTH_YEAR })
    expect(socialOn(g)).toBe(false)
    expect(g.world === undefined || !('social' in (g.world as object))).toBe(true)
    stampSocial(g)
    expect(json(shardOf(g))).toBe(json({ v: 1, on: 1, y: BIRTH_YEAR, fy: BIRTH_YEAR }))
    for (let i = 0; i < 3; i++) {
      g.queue = []
      g.character.stats.health = 100
      g.character.conditions = []
      ageUp(g)
    }
    // R4-E7: the yearly edge step is the writer of `y` (patchSocial), so it follows the calendar; the stamp itself (v, on, fy) never moves.
    // R4-E10a: the yearly entry of the acts (society.acts) is the writer of `ay`, the year it last ran, which follows the calendar too
    const stamp = json({ v: 1, on: 1, y: BIRTH_YEAR + 3, fy: BIRTH_YEAR, ay: BIRTH_YEAR + 3 })
    expect(socialOn(g)).toBe(true)
    expect(json(shardOf(g))).toBe(stamp)
    expect(worldProblems(g).filter((p) => !p.startsWith('ledger: '))).toEqual([])
    const copy = structuredClone(g)
    expect(socialOn(copy)).toBe(true)
    expect(json(shardOf(copy))).toBe(stamp)
    const back = JSON.parse(json(g)) as GameState
    expect(socialOn(back)).toBe(true)
    expect(normalizeWorld(back.world).social).toEqual(shardOf(g))
  }, 120_000)

  it('is unaffected for a life that was never stamped: no social key after three played years', () => {
    const g = createNewLife({ seed: LIFE_SEED, year: BIRTH_YEAR })
    for (let i = 0; i < 3; i++) {
      g.queue = []
      g.character.stats.health = 100
      g.character.conditions = []
      ageUp(g)
    }
    expect(socialOn(g)).toBe(false)
    expect(Object.keys(readWorld(g))).not.toContain('social')
    expect(Object.keys(readWorld(g))).not.toContain('edges')
  }, 120_000)
})
