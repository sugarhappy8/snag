// ci: fast
// R2-K7 (K.3 c): the bounded fact store. A fact that a module emits on the bus lands in g.world.facts (src/game/world/facts.ts): at most
// FACT_CAP (400) rows, at most FACTS_PER_KIND_YEAR (12) of one kind in one year, no row twice, oldest first. The reader is pure (it
// never creates g.world and never writes) and total (whatever a hostile or old save put there, it returns only valid rows, never
// more than the cap, and never throws). The writer replaces the shard root and writes nothing when it has nothing to store.
//
// What this file pins: the hostile reads, the cap and the per-kind-year limit, that a replay adds nothing (RF5), that a read is pure,
// the whole path emit -> '*' handler -> store under the own-slice guard, that an heir keeps the facts (RF3), the load-order rule of
// the shard registration, an old save that has no facts, and the size of the shard. No random number is drawn anywhere here.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { ageUp } from '../src/game/aging'
import { killCharacter } from '../src/game/death'
import type { Fact } from '../src/game/kernel/fact'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { migrateSave } from '../src/game/save-schema'
import type { GameState } from '../src/game/types'
import { FACT_CAP, FACTS_PER_KIND_YEAR, factsModule, normalizeFacts, readFacts, recordFact } from '../src/game/world/facts'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { loadModules, withGuard } from './kernel-kit'

const GOOD: Fact = { k: 'company.failed', y: 2026, c: 'company:1' }

/** A fresh state whose `world` is exactly `world` (undefined leaves it absent). */
function lifeWith(world?: unknown): GameState {
  const g = makeTestGame(1)
  if (world !== undefined) (g as { world?: unknown }).world = world
  return g
}

/** A fact that is distinct from every other `i`: its own kind and year, so neither the dedup nor the per-kind-year limit meets it. */
const distinct = (i: number): Fact => ({ k: `a.k${i}`, y: 1900 + i })

/** The newest `n` rows the way the spec says: by year, then by position, the last `n`. An independent version of what normalizeFacts does. */
const newest = (rows: readonly Fact[], n = FACT_CAP): Fact[] =>
  rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.y - b.r.y || a.i - b.i)
    .slice(-n)
    .map((x) => x.r)

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
function nodesOf(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length) {
    const item = stack.pop()
    n++
    if (item && typeof item === 'object') for (const c of Array.isArray(item) ? item : Object.values(item)) stack.push(c)
  }
  return n
}

describe('the constants', () => {
  it('keeps 400 rows, 12 of a kind in a year', () => {
    expect(FACT_CAP).toBe(400)
    expect(FACTS_PER_KIND_YEAR).toBe(12)
  })
})

describe('readFacts on a hostile world', () => {
  const garbage: [string, unknown][] = [
    ['a string where the shard goes', { v: 1, facts: 'x' }],
    ['a number', { v: 1, facts: 7 }],
    ['null', { v: 1, facts: null }],
    ['a list instead of a shard', { v: 1, facts: [GOOD] }],
    ['rows that are not facts', { v: 1, facts: { v: 1, rows: [null, 3, 'a', {}, { k: 'a.b', y: NaN }] } }],
    ['rows that is not a list', { v: 1, facts: { v: 1, rows: 'nope' } }],
    ['rows missing', { v: 1, facts: { v: 1 } }],
    ['a list of holes', { v: 1, facts: { v: 1, rows: new Array(1000) } }],
    ['a shard of another version', { v: 1, facts: { v: 2, rows: [GOOD] } }],
    ['a world of another version', { v: 2, facts: { v: 1, rows: [GOOD] } }],
    ['a world that is a string', 'world'],
    ['a world that is a list', [1, 2, 3]],
  ]
  for (const [name, world] of garbage) {
    it(`reads ${name} as empty and never throws`, () => {
      const g = lifeWith(world)
      expect(() => readFacts(g)).not.toThrow()
      expect(readFacts(g)).toEqual([])
    })
  }

  it('keeps the valid rows among the invalid ones', () => {
    const other: Fact = { k: 'bank.run', y: 2027 }
    const rows = [GOOD, null, { k: 'Bad Kind', y: 1 }, { k: 'a.b', y: 2026.5 }, [GOOD], 'x', other]
    expect(readFacts(lifeWith({ v: 1, facts: { v: 1, rows } }))).toEqual([GOOD, other])
  })

  it('returns the newest 400 of a 5,000-row list, oldest first', () => {
    const rows = Array.from({ length: 5000 }, (_, i): Fact => ({ k: `hostile.k${i}`, y: 1800 + (i % 300), c: `p${i}` }))
    const out = readFacts(lifeWith({ v: 1, facts: { v: 1, rows } }))
    expect(out).toHaveLength(FACT_CAP)
    expect(out).toEqual(newest(rows))
  })

  it('cuts nested objects and 10,000-character strings down to a fact', () => {
    const big = 'x'.repeat(10_000)
    const rows = [
      { k: 'a.b', y: 2026, c: big, a: big, v: 1e300, s: 1e9, extra: { deep: { deeper: [big, big] } } },
      { k: big, y: 2026 },
      { k: 'a.b', y: 2026, c: { nested: big } },
    ]
    const out = readFacts(lifeWith({ v: 1, facts: { v: 1, rows } }))
    expect(out).toEqual([
      { k: 'a.b', y: 2026, c: 'x'.repeat(40), a: 'x'.repeat(40), v: 1e15, s: 100 },
      { k: 'a.b', y: 2026 },
    ])
    expect(JSON.stringify(out).length).toBeLessThan(500)
  })

  it('does not change what is stored, not even the order of an unsorted list', () => {
    const rows = [{ k: 'a.b', y: 2030 }, { k: 'a.b', y: 2020, junk: 1 }, null, { k: 'a.b', y: 2025 }]
    const g = lifeWith({ v: 1, facts: { v: 1, rows } })
    const before = JSON.stringify(g.world)
    const out = readFacts(g)
    expect(out.map((f) => f.y)).toEqual([2020, 2025, 2030])
    expect(JSON.stringify(g.world)).toBe(before)
  })

  it('drops a row that throws when it is read and keeps the rest', () => {
    const trap = {
      get k(): string {
        throw new Error('a hostile getter')
      },
      y: 1,
    }
    const out = readFacts(lifeWith({ v: 1, facts: { v: 1, rows: [GOOD, trap, { k: 'a.b', y: 2027 }] } }))
    expect(out).toEqual([GOOD, { k: 'a.b', y: 2027 }])
  })

  it('reads an absent world as empty', () => {
    expect(readFacts(lifeWith())).toEqual([])
    expect(readFacts(lifeWith({ v: 1 }))).toEqual([])
  })
})

describe('normalizeFacts', () => {
  it('returns its input when it is already valid, so a read is free', () => {
    const shard = { v: 1, rows: [{ k: 'a.b', y: 2020 }, { k: 'a.b', y: 2021, c: 'company:2', v: 4.5, s: 10 }] }
    expect(normalizeFacts(shard)).toBe(shard)
    const g = lifeWith({ v: 1, facts: shard })
    expect(readFacts(g)).toBe(shard.rows)
    expect(readFacts(g)).toBe(readFacts(g))
  })

  it('returns a new shard, and leaves its input alone, when a row has to change', () => {
    const shard = { v: 1, rows: [{ k: 'a.b', y: 2021 }, { k: 'a.b', y: 2020 }, { k: 'a.b', y: 2022, extra: 1 }] }
    const before = JSON.stringify(shard)
    const out = normalizeFacts(shard)
    expect(out).not.toBe(shard)
    expect(out).toEqual({ v: 1, rows: [{ k: 'a.b', y: 2020 }, { k: 'a.b', y: 2021 }, { k: 'a.b', y: 2022 }] })
    expect(JSON.stringify(shard)).toBe(before)
    // and the result is its own fixed point
    expect(normalizeFacts(out)).toBe(out)
  })

  it('drops a key of the shard that is not v or rows, and keeps the rows array when they are fine', () => {
    const rows = [{ k: 'a.b', y: 2020 }]
    const out = normalizeFacts({ v: 1, rows, junk: { deep: [1, 2, 3] } })
    expect(out).toEqual({ v: 1, rows: [{ k: 'a.b', y: 2020 }] })
    expect(Object.keys(out)).toEqual(['v', 'rows'])
    expect(out.rows).toBe(rows)
  })

  it('is total: anything in, a bounded shard out', () => {
    for (const raw of [undefined, null, 0, NaN, 'rows', [], {}, { v: 1 }, { v: 1, rows: {} }, () => 1, Symbol('x'), 10n]) {
      const out = normalizeFacts(raw)
      expect(out).toEqual({ v: 1, rows: [] })
    }
  })
})

describe('recordFact: the cap and the per-kind-year limit', () => {
  it('leaves exactly the newest 400 of 450 distinct facts', () => {
    const g = makeTestGame(1)
    for (let i = 0; i < 450; i++) expect(recordFact(g, distinct(i)), `fact ${i}`).toBe(true)
    const rows = readFacts(g)
    expect(rows).toHaveLength(400)
    expect(rows[0]).toEqual(distinct(50))
    expect(rows[399]).toEqual(distinct(449))
    expect(rows).toEqual(Array.from({ length: 400 }, (_, i) => distinct(i + 50)))
  })

  it('refuses the 13th row of one kind in one year, and takes one of the next year or of another kind', () => {
    const g = makeTestGame(1)
    for (let i = 0; i < FACTS_PER_KIND_YEAR; i++) expect(recordFact(g, { k: 'bank.run', y: 2030, c: `bank:${i}` })).toBe(true)
    expect(recordFact(g, { k: 'bank.run', y: 2030, c: 'bank:99' })).toBe(false)
    expect(readFacts(g)).toHaveLength(12)
    expect(recordFact(g, { k: 'bank.run', y: 2031, c: 'bank:99' })).toBe(true)
    expect(recordFact(g, { k: 'bank.failed', y: 2030, c: 'bank:99' })).toBe(true)
    expect(readFacts(g)).toHaveLength(14)
  })

  it('orders by year and then by insertion', () => {
    const g = makeTestGame(1)
    for (const [k, y] of [['a.x', 2030], ['a.y', 2028], ['a.z', 2029], ['a.w', 2028], ['a.v', 2030]] as const) recordFact(g, { k, y })
    expect(readFacts(g).map((f) => `${f.y}:${f.k}`)).toEqual(['2028:a.y', '2028:a.w', '2029:a.z', '2030:a.x', '2030:a.v'])
  })

  it('does not store a fact that is older than all 400 rows it would push out, and says so', () => {
    const g = makeTestGame(1)
    for (let i = 0; i < FACT_CAP; i++) recordFact(g, distinct(i + 10))
    const before = JSON.stringify(g.world)
    expect(recordFact(g, distinct(0))).toBe(false)
    expect(JSON.stringify(g.world)).toBe(before)
  })

  it('stores a fact in the middle of a full list by dropping the oldest', () => {
    const g = makeTestGame(1)
    for (let i = 0; i < FACT_CAP; i++) recordFact(g, distinct(i + 10))
    expect(recordFact(g, { k: 'late.arrival', y: 1950 })).toBe(true)
    const rows = readFacts(g)
    expect(rows).toHaveLength(FACT_CAP)
    expect(rows[0]).toEqual(distinct(11))
    expect(rows.some((f) => f.k === 'late.arrival')).toBe(true)
  })
})

describe('recordFact: no row twice, nothing invalid, nothing written for nothing', () => {
  it('stores the same fact once however often it is recorded', () => {
    const g = makeTestGame(1)
    expect(recordFact(g, GOOD)).toBe(true)
    expect(recordFact(g, { ...GOOD })).toBe(false)
    expect(recordFact(g, GOOD)).toBe(false)
    expect(readFacts(g)).toEqual([GOOD])
  })

  it('keys a row by kind, year, subject and other party, and not by magnitude or severity', () => {
    const g = makeTestGame(1)
    expect(recordFact(g, { k: 'a.b', y: 2026, c: 'x', a: 'p', v: 1, s: 1 })).toBe(true)
    expect(recordFact(g, { k: 'a.b', y: 2026, c: 'x', a: 'p', v: 2, s: 9 })).toBe(false)
    expect(recordFact(g, { k: 'a.b', y: 2026, c: 'x', a: 'q' })).toBe(true)
    expect(recordFact(g, { k: 'a.b', y: 2026, c: 'y', a: 'p' })).toBe(true)
    expect(recordFact(g, { k: 'a.b', y: 2026, a: 'p' })).toBe(true)
    expect(recordFact(g, { k: 'a.b', y: 2027, c: 'x', a: 'p' })).toBe(true)
    expect(readFacts(g)).toHaveLength(5)
    expect(readFacts(g)[0]).toEqual({ k: 'a.b', y: 2026, c: 'x', a: 'p', v: 1, s: 1 })
  })

  it('refuses an invalid fact and creates no world for it', () => {
    const g = makeTestGame(1)
    for (const bad of [null, undefined, 3, 'a.b', [], {}, { k: 'Bad Kind', y: 2026 }, { k: 'a.b', y: NaN }, { k: 'a.b', y: 1.5 }, { k: 'a.b' }]) {
      expect(recordFact(g, bad as never)).toBe(false)
    }
    expect('world' in g).toBe(false)
  })

  it('stores a normalized copy: the caller keeps its object, the row has no stray keys', () => {
    const g = makeTestGame(1)
    const sent = { k: 'a.b', y: 2026, c: '  company:7  ', v: 1.23456, s: 250, junk: { deep: 1 } }
    expect(recordFact(g, sent as Fact)).toBe(true)
    expect(readFacts(g)).toEqual([{ k: 'a.b', y: 2026, c: 'company:7', v: 1.235, s: 100 }])
    expect(readFacts(g)[0]).not.toBe(sent)
    expect(sent.c).toBe('  company:7  ')
  })

  it('writes a new shard root and never edits the old one in place (a Save draft shares it)', () => {
    const g = makeTestGame(1)
    recordFact(g, distinct(1))
    const root = g.world!.facts as { v: 1; rows: Fact[] }
    const rowsBefore = root.rows
    const text = JSON.stringify(root)
    recordFact(g, distinct(2))
    expect(g.world!.facts).not.toBe(root)
    expect(root.rows).toBe(rowsBefore)
    expect(JSON.stringify(root)).toBe(text)
    expect(readFacts(g)).toHaveLength(2)
  })

  it('draws no random number', () => {
    const g = makeTestGame(7)
    const rng = g.rng
    for (let i = 0; i < 30; i++) recordFact(g, distinct(i))
    expect(g.rng).toBe(rng)
  })
})

describe('replays add nothing (RF5)', () => {
  /** A synthetic yearly step: books three facts for the year and stamps the year, the way every yearly step is made idempotent. */
  function stepper(stamped: boolean): (g: GameState) => void {
    const done = new Set<number>()
    return (g) => {
      if (stamped) {
        if (done.has(g.year)) return
        done.add(g.year)
      }
      for (const c of ['company:1', 'company:2', 'company:3']) recordFact(g, { k: 'company.failed', y: g.year, c })
    }
  }

  it('stores one set when the step runs twice in a year, with its year stamp', () => {
    const g = makeTestGame(1)
    const step = stepper(true)
    step(g)
    step(g)
    expect(readFacts(g)).toHaveLength(3)
  })

  it('stores one set even when the step has no stamp, because the store refuses a row it has', () => {
    const g = makeTestGame(1)
    const step = stepper(false)
    step(g)
    const text = JSON.stringify(g.world)
    step(g)
    expect(readFacts(g)).toHaveLength(3)
    expect(JSON.stringify(g.world)).toBe(text)
  })

  it('adds the next year as a second set, in order', () => {
    const g = makeTestGame(1)
    const step = stepper(true)
    step(g)
    g.year++
    step(g)
    step(g)
    expect(readFacts(g).map((f) => f.y)).toEqual([2026, 2026, 2026, 2027, 2027, 2027])
  })
})

describe('a read is pure', () => {
  it('returns [] on a deep-frozen state with no world, and creates none', () => {
    const g = deepFreeze(makeTestGame(1))
    expect(readFacts(g)).toEqual([])
    expect(g.world).toBeUndefined()
    expect('world' in g).toBe(false)
  })

  it('reads a deep-frozen shard, and the writer throws exactly where it would write', () => {
    const g = makeTestGame(1)
    recordFact(g, GOOD)
    deepFreeze(g)
    expect(readFacts(g)).toEqual([GOOD])
    // a duplicate and an invalid fact write nothing, so a frozen state is no problem for them
    expect(recordFact(g, GOOD)).toBe(false)
    expect(recordFact(g, { k: 'Bad', y: 1 })).toBe(false)
    // a new row has to write
    expect(() => recordFact(g, { k: 'a.b', y: 2026 })).toThrow(TypeError)
    expect(readFacts(g)).toEqual([GOOD])
  })

  it('throws on a frozen state with no world only when there is something to write', () => {
    const g = deepFreeze(makeTestGame(1))
    expect(recordFact(g, { k: 'Bad Kind', y: 1 })).toBe(false)
    expect(() => recordFact(g, GOOD)).toThrow(TypeError)
    expect(g.world).toBeUndefined()
  })
})

describe('the bus feeds the store', () => {
  /** A registry, a bus and a store of their own, with the recorder and a module that declares two kinds. */
  async function wired() {
    vi.resetModules()
    const reg = await import('../src/game/kernel/registry')
    const bus = await import('../src/game/kernel/bus')
    const facts = await import('../src/game/world/facts')
    reg.registerModule(facts.factsModule)
    reg.registerModule({ id: 'facts.test', layer: 3, facts: ['company.failed', 'company.audited'] })
    return { reg, bus, facts }
  }

  it('stores one row for one emit', async () => {
    const { bus, facts } = await wired()
    const g = makeTestGame(7)
    expect(bus.emit(g, { k: 'company.failed', y: 2026, c: 'company:7', v: 3 })).toBe(true)
    expect(facts.readFacts(g)).toEqual([{ k: 'company.failed', y: 2026, c: 'company:7', v: 3 }])
    expect(g.world).toMatchObject({ v: 1 })
  })

  it('stores every declared kind, in the order they came', async () => {
    const { bus, facts } = await wired()
    const g = makeTestGame(7)
    bus.emit(g, { k: 'company.failed', y: 2026, c: 'company:1' })
    bus.emit(g, { k: 'company.audited', y: 2026, c: 'company:2' })
    bus.emit(g, { k: 'company.failed', y: 2027, c: 'company:3' })
    expect(facts.readFacts(g).map((f) => `${f.y}:${f.k}:${f.c}`)).toEqual(['2026:company.failed:company:1', '2026:company.audited:company:2', '2027:company.failed:company:3'])
  })

  it('stores nothing for a kind no module declared, and creates no world', async () => {
    const { bus, facts } = await wired()
    const g = makeTestGame(7)
    expect(bus.emit(g, { k: 'company.unknown', y: 2026 })).toBe(false)
    expect(facts.readFacts(g)).toEqual([])
    expect('world' in g).toBe(false)
  })

  it('stores a replayed emit once', async () => {
    const { bus, facts } = await wired()
    const g = makeTestGame(7)
    bus.emit(g, { k: 'company.failed', y: 2026, c: 'company:7' })
    const text = JSON.stringify(g.world)
    bus.emit(g, { k: 'company.failed', y: 2026, c: 'company:7' })
    expect(facts.readFacts(g)).toHaveLength(1)
    expect(JSON.stringify(g.world)).toBe(text)
  })

  it('passes the own-slice guard: the recorder writes world.facts and nothing else', async () => {
    const { bus, facts } = await wired()
    const g = makeTestGame(7)
    expect(withGuard(() => bus.emit(g, { k: 'company.failed', y: 2026, c: 'company:7' }), bus)).toBe(true)
    expect(facts.readFacts(g)).toHaveLength(1)
    // and again with a world that already exists
    expect(withGuard(() => bus.emit(g, { k: 'company.audited', y: 2026, c: 'company:7' }), bus)).toBe(true)
    expect(facts.readFacts(g)).toHaveLength(2)
  })

  it('fails the guard for a handler of another slice that writes into world.facts', async () => {
    const { reg, bus, facts } = await wired()
    reg.registerModule({
      id: 'z.sneak',
      layer: 3,
      handles: [{ kind: 'company.audited', slice: 'flags.textMem', run: (g, f) => void facts.recordFact(g, { ...f, k: 'company.failed', c: 'company:sneak' }) }],
    })
    const g = makeTestGame(7)
    expect(() => withGuard(() => bus.emit(g, { k: 'company.audited', y: 2026, c: 'company:7' }), bus)).toThrow(/z\.sneak.*outside its slice flags\.textMem.*world/)
  })

  it('draws no random number', async () => {
    const { bus } = await wired()
    const g = makeTestGame(7)
    const rng = g.rng
    for (let i = 0; i < 20; i++) bus.emit(g, { k: 'company.failed', y: 2026 + i, c: `company:${i}` })
    expect(g.rng).toBe(rng)
  })
})

describe('the module', () => {
  it('is one L2 module that owns the slice world.facts and hears every kind', () => {
    expect(factsModule.id).toBe('world.facts')
    expect(factsModule.layer).toBe(2)
    expect(factsModule.slices).toEqual(['world.facts'])
    expect(factsModule.handles).toHaveLength(1)
    expect(factsModule.handles![0]).toMatchObject({ kind: '*', slice: 'world.facts' })
  })

  it('is in modules/index.ts, so loading the module list registers it, its slice and its handler', async () => {
    vi.resetModules()
    const reg = await import('../src/game/kernel/registry')
    const index = await loadModules()
    expect(index.MODULES.map((m) => m.id)).toContain('world.facts')
    expect(reg.moduleIds()).toContain('world.facts')
    expect(reg.registeredSlices()).toContain('world.facts')
    expect(reg.handlersFor('any.kind').map((h) => h.moduleId)).toContain('world.facts')
  })

  it('imports only the types, the fact, the registry (as a type) and the world root, and reads no clock and no random number', () => {
    const text = readFileSync('src/game/world/facts.ts', 'utf8')
    const specs = [...text.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((m) => m[1]!)
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) expect(['../types', '../kernel/fact', '../kernel/registry', './state'], `facts.ts imports ${s}`).toContain(s)
    expect(text).not.toMatch(/\bg\.rng\b|Math\.random|Date\.now|new Date\(/)
    expect(text).not.toContain('registerModule(')
  })
})

describe('the shard is registered when the store loads (the load-order rule)', () => {
  const valid = { v: 1, rows: [{ k: 'company.failed', y: 2026 }] }

  it('is dropped by normalizeWorld until facts.ts has been imported, and kept after', async () => {
    vi.resetModules()
    const state = await import('../src/game/world/state')
    expect(state.shardNames()).not.toContain('facts')
    expect(state.normalizeWorld({ v: 1, facts: valid }).facts).toBeUndefined()
    await import('../src/game/world/facts')
    expect(state.shardNames()).toContain('facts')
    expect(state.normalizeWorld({ v: 1, facts: valid }).facts).toEqual(valid)
  })

  it('is registered by the hub, world/shards.ts, which a process that loads a save imports for effect', async () => {
    vi.resetModules()
    const state = await import('../src/game/world/state')
    await import('../src/game/world/shards')
    expect(state.shardNames()).toContain('facts')
    expect(state.shardNames()).toContain('ledger')
    expect(state.normalizeWorld({ v: 1, facts: valid }).facts).toEqual(valid)
  })

  it('is registered by modules/index.ts too', async () => {
    vi.resetModules()
    const state = await import('../src/game/world/state')
    await loadModules()
    expect(state.shardNames()).toContain('facts')
  })

  it('cleans a garbage shard on the way through normalizeWorld', async () => {
    vi.resetModules()
    const state = await import('../src/game/world/state')
    await import('../src/game/world/facts')
    const junk = { v: 1, rows: [GOOD, null, { k: 'Bad Kind', y: 1 }, { ...GOOD, c: 'y'.repeat(500) }] }
    const out = state.normalizeWorld({ v: 1, facts: junk })
    expect(out.facts).toEqual({ v: 1, rows: [GOOD, { ...GOOD, c: 'y'.repeat(40) }] })
    expect(state.normalizeWorld({ v: 1, facts: 'x' }).facts).toEqual({ v: 1, rows: [] })
  })
})

describe('facts reach an heir (RF3) and survive a save', () => {
  function oldPlayer(): GameState {
    return makeTestGame(1, { age: 70, gender: 'female', firstName: 'Ruth', lastName: 'Stone', money: 500_000 })
  }

  it('carries the facts to the heir as an equal copy that shares nothing with the parent', () => {
    const g = oldPlayer()
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: 'Stone' })
    recordFact(g, GOOD)
    recordFact(g, { k: 'bank.run', y: 2027, c: 'bank:2', v: 12 })
    killCharacter(g, 'Old Age')
    const n = continueAsChild(g, kid.id)
    expect(n).not.toBe(g)
    expect(readFacts(n)).toEqual(readFacts(g))
    expect(readFacts(n)).toHaveLength(2)
    expect(readFacts(n)).not.toBe(readFacts(g))
    recordFact(n, { k: 'a.b', y: 2030 })
    expect(readFacts(n)).toHaveLength(3)
    expect(readFacts(g)).toHaveLength(2)
  })

  it('leaves an heir with no facts when the parent had none', () => {
    const g = oldPlayer()
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: 'Stone' })
    killCharacter(g, 'Old Age')
    expect(readFacts(continueAsChild(g, kid.id))).toEqual([])
  })

  it('reads the same facts after a JSON round trip', () => {
    const g = makeTestGame(1)
    for (let i = 0; i < 40; i++) recordFact(g, { k: 'a.b', y: 2000 + i, c: `company:${i}`, v: i / 7, s: i })
    const back = JSON.parse(JSON.stringify(g)) as GameState
    expect(readFacts(back)).toEqual(readFacts(g))
    expect(readFacts(back)).toHaveLength(40)
  })
})

describe('an old save has no facts and keeps playing', () => {
  it('reads as empty, and five years later still has no facts shard', () => {
    const raw = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>
    const r = migrateSave(structuredClone(raw))
    if (r.kind !== 'ready') throw new Error(`expected a ready save, got ${JSON.stringify(r)}`)
    const game = r.game
    expect(readFacts(game)).toEqual([])
    for (let i = 0; i < 5; i++) {
      game.queue = []
      expect(() => ageUp(game)).not.toThrow()
    }
    expect(readFacts(game)).toEqual([])
    // another step of the world may create g.world one day; none of them may put a facts shard there
    expect(game.world?.facts).toBeUndefined()
  }, 120_000)
})

describe('the size of the shard', () => {
  /** Every field at its limit: a 40-character kind and two 40-character refs, the largest magnitude, the top severity. Each is its own kind, so nothing refuses it. */
  const maximal = (i: number): Fact => ({
    k: `${'x'.repeat(30)}.${String(i).padStart(9, '0')}`,
    y: 2026 + (i % 40),
    c: 'company:'.padEnd(40, '9'),
    a: 'person:'.padEnd(40, '8'),
    v: -999_999_999_999_999.9,
    s: 100,
  })

  it('holds 400 maximal facts in about 2,800 JSON nodes and under 75 KB', () => {
    const g = makeTestGame(1)
    for (let i = 0; i < FACT_CAP; i++) expect(recordFact(g, maximal(i)), `fact ${i}`).toBe(true)
    const shard = g.world!.facts
    expect(readFacts(g)).toHaveLength(FACT_CAP)
    expect(Object.keys(readFacts(g)[0]!)).toEqual(['k', 'y', 'c', 'a', 'v', 's'])
    expect(nodesOf(shard)).toBeLessThanOrEqual(2810)
    // 0.6% of the 500,000 node cap of a save
    expect(nodesOf(shard) / 500_000).toBeLessThan(0.006)
    // a fact with every field at its limit is 182 bytes; the cap is the whole bound
    expect(JSON.stringify(shard).length).toBeLessThan(75_000)
  })

  it('holds 400 typical facts in under 60 KB', () => {
    const g = makeTestGame(1)
    for (let i = 0; i < FACT_CAP; i++) recordFact(g, { k: 'company.failed', y: 1900 + i, c: `company:${100_000 + i}`, a: `person:${i}`, v: 1_234_567.891, s: 40 })
    expect(readFacts(g)).toHaveLength(FACT_CAP)
    expect(JSON.stringify(g.world!.facts).length).toBeLessThan(60_000)
  })
})
