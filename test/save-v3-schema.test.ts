// R2-S2 (K.5 b): SAVE_SCHEMA 3, the dual-read chain and the four fixtures.
//
// A save is read for one release in both shapes: a v2 record (the plain JSON every build up to v4.1.1 wrote) is brought up by
// STEPS[2], a v3 record (what this build writes) is left as it is, and the slice versions a v3 head names (`sv`) reach the slices'
// `migrate`. Until the store writes chunks (R2-S6) the game writes the inline v3 form: plain JSON with schemaVersion 3.
//
// The fixtures are real old saves written by the engine that made them (scripts/save-fixtures.ts), never regenerated from this tree:
//   save-v1.json.gz           v2.4.0, no schemaVersion (schema 1)
//   save-v4.0.2.json.gz       v4.0.2, a 12-year life, schema 2 (save-v2.json.gz is the same bytes: the schema-2 slot that
//                             test/save-schema.test.ts asks for)
//   save-v4.1.1-heavy.json.gz v4.1.1, a 20-year life with four companies, schema 2
//   tm-v4.1.1.json.gz         v4.1.1 Time Machine: its index, its backend entries and the state at each of four snapshots
//   idb-v4.1.1.json.gz        v4.1.1 as IndexedDB held it: the gz2 record, the localStorage marker and the plain JSON
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { SAVE_KEY } from '../src/game/save-backends'
import { economyState } from '../src/game/economy/model'
import { defineSlice } from '../src/game/kernel/slices'
import { createNewLife } from '../src/game/life'
import { isLoadableGame, migrateSave, SAVE_SCHEMA } from '../src/game/save-schema'
import { decodeSnapshotRecord } from '../src/game/snapshot-codec'
import type { GameState } from '../src/game/types'

const FIXTURES = 'test/fixtures'
// A fixed life as a constant, not a `seed: <digits>` pin (test/seed-pins.test.ts).
const LIFE_SEED = 3
/** The schema of the build before this one (v4.1.1): what an older build files as `newer`. */
const OLDER_BUILD_SCHEMA = 2

function bytes(name: string): Buffer {
  return readFileSync(`${FIXTURES}/${name}`)
}

function load(name: string): Record<string, unknown> {
  return JSON.parse(gunzipSync(bytes(name)).toString()) as Record<string, unknown>
}

type Ready = { game: GameState; from: number }

/** The migrated game, or a failure naming what came back instead. */
function ready(raw: unknown, opts?: Parameters<typeof migrateSave>[1]): Ready {
  const result = migrateSave(raw, opts)
  if (result.kind !== 'ready') throw new Error(`expected a ready save, got ${JSON.stringify(result)}`)
  return result
}

/** Five years the way the store plays them: the popups cleared, then ageUp. */
function playFive(game: GameState): void {
  for (let i = 0; i < 5; i++) {
    game.queue = []
    ageUp(game)
  }
}

function expectPlayable(game: GameState, startYear: number): void {
  expect(game.schemaVersion).toBe(SAVE_SCHEMA)
  expect(SAVE_SCHEMA).toBeGreaterThan(OLDER_BUILD_SCHEMA)
  expect(isLoadableGame(game)).toBe(true)
  playFive(game)
  expect(game.character.alive).toBe(true)
  expect(game.year).toBe(startYear + 5)
  const economy = economyState(game)
  expect(economy).not.toBeNull()
  expect(economy?.year).toBe(game.year)
}

/** A slice the test owns: every migrate call lands in `calls` with the stored version it was given. */
const calls: number[] = []
const PROBE_KEY = 'schemaProbe'
defineSlice({
  key: PROBE_KEY,
  version: 2,
  chunk: 'core',
  caps: { nodes: 10, chars: 100 },
  normalize: (raw) => raw,
  migrate: (from) => {
    calls.push(from)
    return undefined
  },
})

/** A v3 record as the store reads one: the migrated fixture, serialized and parsed again. */
function v3Record(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(ready(load('save-v4.0.2.json.gz')).game)) as Record<string, unknown>
}

describe('the fixtures load and run five years', () => {
  it('the v4.0.2 save is schema 2 and becomes schema 3', () => {
    const raw = load('save-v4.0.2.json.gz')
    expect(raw.schemaVersion).toBe(OLDER_BUILD_SCHEMA)
    const { game, from } = ready(raw)
    expect(from).toBe(2)
    expectPlayable(game, game.year)
  })

  it('the v2.4.0 save (no schemaVersion) becomes schema 3 and plays', () => {
    const raw = load('save-v1.json.gz')
    expect(raw).not.toHaveProperty('schemaVersion')
    const { game, from } = ready(raw)
    expect(from).toBe(1)
    expectPlayable(game, game.year)
  })

  // One `it`: the heavy fixture takes a few seconds to play five years.
  it('the heavy v4.1.1 save migrates, still carries the economy diet candidates, and plays', () => {
    const raw = load('save-v4.1.1-heavy.json.gz')
    expect(raw.schemaVersion).toBe(OLDER_BUILD_SCHEMA)
    const { game, from } = ready(raw)
    expect(from).toBe(2)
    // R2-S10 prunes `previous` to the countries a reader can name and changes this assertion, on purpose.
    const world = game.flags.worldEconomy as { previous: Record<string, unknown> }
    expect(Object.keys(world.previous).length).toBeGreaterThan(100)
    expectPlayable(game, game.year)
  })

  it('the schema-2 slot is the v4.0.2 save, byte for byte', () => {
    expect(bytes('save-v2.json.gz').equals(bytes('save-v4.0.2.json.gz'))).toBe(true)
  })
})

describe('the Time Machine and IndexedDB fixtures are what the generator says', () => {
  it('the Time Machine fixture holds four schema-2 snapshots, an idb index and their entries', () => {
    const tm = load('tm-v4.1.1.json.gz') as { lifeId: string; index: string; entries: Record<string, string>; states: Record<string, string> }
    expect(Object.keys(tm).sort()).toEqual(['entries', 'index', 'lifeId', 'states'])
    const index = JSON.parse(tm.index) as { v: number; lifeId: string; where: string; stops: { age: number; rec: string; chunks: string[] }[] }
    expect([index.v, index.lifeId, index.where]).toEqual([1, tm.lifeId, 'idb'])
    const ages = Object.keys(tm.states).map(Number).sort((a, b) => a - b)
    expect(ages).toHaveLength(4)
    expect(index.stops.map((s) => s.age)).toEqual(ages)
    for (const stop of index.stops) {
      expect(tm.entries[`s|${tm.lifeId}|${stop.rec}`], `record of age ${stop.age}`).toBeTypeOf('string')
      for (const id of stop.chunks) expect(tm.entries[`l|${tm.lifeId}|${id}`], `chunk ${id}`).toBeTypeOf('string')
      const state = JSON.parse(tm.states[String(stop.age)]!) as GameState
      expect([state.schemaVersion, state.lifeId, state.character.age]).toEqual([OLDER_BUILD_SCHEMA, tm.lifeId, stop.age])
      expect(ready(state).from).toBe(2)
    }
  })

  it('the IndexedDB fixture holds a gz2 record that inflates to its plain state', async () => {
    const idb = load('idb-v4.1.1.json.gz') as { saves: Record<string, string>; marker: string; state: string }
    expect(Object.keys(idb).sort()).toEqual(['marker', 'saves', 'state'])
    expect(idb.marker).toBe('1')
    expect(Object.keys(idb.saves)).toEqual([SAVE_KEY])
    const record = idb.saves[SAVE_KEY]!
    expect(record.startsWith('gz2:')).toBe(true)
    expect(await decodeSnapshotRecord(record)).toBe(idb.state)
    const state = JSON.parse(idb.state) as GameState
    expect(state.schemaVersion).toBe(OLDER_BUILD_SCHEMA)
    expect(ready(state).from).toBe(2)
  })
})

describe('migrateSave on schema 3', () => {
  it('migrating twice changes nothing, and a re-serialized game loads as schema 3', () => {
    for (const name of ['save-v4.0.2.json.gz', 'save-v1.json.gz']) {
      const first = ready(load(name))
      const text = JSON.stringify(first.game)
      const again = ready(first.game)
      expect(again.from, name).toBe(SAVE_SCHEMA)
      expect(JSON.stringify(again.game), name).toBe(text)
      const reloaded = ready(JSON.parse(text))
      expect(reloaded.from, name).toBe(SAVE_SCHEMA)
      expect(JSON.stringify(reloaded.game), name).toBe(text)
    }
  })

  it('a schema above the current one is newer, whatever else is in the record', () => {
    expect(migrateSave({ version: 1, schemaVersion: SAVE_SCHEMA + 1, extra: { nested: true } })).toEqual({ kind: 'newer', version: SAVE_SCHEMA + 1 })
    expect(migrateSave({ ...v3Record(), schemaVersion: SAVE_SCHEMA + 1 })).toEqual({ kind: 'newer', version: SAVE_SCHEMA + 1 })
  })

  it('an unusable schemaVersion is invalid, and a junk shape at the current schema is invalid without a throw', () => {
    for (const bad of [2.5, '3', NaN, 0, -1, null]) expect(migrateSave({ ...v3Record(), schemaVersion: bad }), String(bad)).toEqual({ kind: 'invalid' })
    const junk: unknown[] = [
      { version: 1, schemaVersion: SAVE_SCHEMA, character: {} },
      { schemaVersion: SAVE_SCHEMA },
      { version: 1, schemaVersion: SAVE_SCHEMA, chunks: { core: 1 }, sv: { character: 1 } },
      { ...v3Record(), character: null },
    ]
    for (const raw of junk) expect(migrateSave(raw)).toEqual({ kind: 'invalid' })
  })

  it('a head with a chunks key and no sv passes through untouched (the codec owns it)', () => {
    const record = { ...v3Record(), chunks: { world: { id: 'world.abc', chars: 12, sum: 'abc' } } }
    const text = JSON.stringify(record)
    const result = ready(JSON.parse(text))
    expect(result.from).toBe(SAVE_SCHEMA)
    expect(JSON.stringify(result.game)).toBe(text)
  })

  it('every record this code writes is above the schema an older build reads, so that build files it as newer and keeps it', () => {
    // v4.1.1 (save-schema.ts:48) returns `newer` for a schemaVersion above its own before it looks at the shape (:50), and a
    // newer save is kept as it is. Those two lines, on the records this build writes.
    const olderBuildFiles = (rec: Record<string, unknown>): string => {
      const version = rec.schemaVersion === undefined ? 1 : rec.schemaVersion
      if (!Number.isSafeInteger(version) || (version as number) < 1) return 'invalid'
      return (version as number) > OLDER_BUILD_SCHEMA ? 'newer' : 'shell check'
    }
    expect(SAVE_SCHEMA).toBeGreaterThan(OLDER_BUILD_SCHEMA)
    const written = [
      JSON.parse(JSON.stringify(createNewLife({ seed: LIFE_SEED, year: 2026 }))) as Record<string, unknown>,
      v3Record(),
      { ...v3Record(), chunks: { world: { id: 'world.abc', chars: 12, sum: 'abc' } }, sv: { 'flags.worldEconomy': 1 } },
    ]
    for (const rec of written) {
      expect(rec.schemaVersion).toBe(SAVE_SCHEMA)
      expect(olderBuildFiles(rec)).toBe('newer')
    }
    // And the shape of a v2 record is what that build reads as a game.
    expect(olderBuildFiles(load('save-v4.0.2.json.gz'))).toBe('shell check')
  })
})

/** The calls to the probe slice's migrate made by one load of `raw`. A v3 record is built first: building it migrates a v2 one. */
function migrateCalls(raw: unknown, opts?: Parameters<typeof migrateSave>[1]): number[] {
  calls.length = 0
  ready(raw, opts)
  return [...calls]
}

describe('the slice versions of a v3 head (opts.versions)', () => {
  it('a real map reaches the slices: a slice below its version migrates from the stored one', () => {
    expect(migrateCalls(v3Record(), { versions: { [PROBE_KEY]: 1 } })).toEqual([1])
  })

  it('a slice at its version, or a record that names none, is not migrated', () => {
    expect(migrateCalls(v3Record(), { versions: { [PROBE_KEY]: 2 } })).toEqual([])
    expect(migrateCalls(v3Record(), { versions: {} })).toEqual([])
    expect(migrateCalls(v3Record())).toEqual([])
  })

  it.each([
    ['a string', 'x'],
    ['a number', 5],
    ['null', null],
    ['an array', [1, 1, 1]],
    ['zero', { [PROBE_KEY]: 0 }],
    ['negative', { [PROBE_KEY]: -1 }],
    ['a fraction', { [PROBE_KEY]: 1.5 }],
    ['a string value', { [PROBE_KEY]: 'x' }],
    ['one above the bound', { [PROBE_KEY]: 1001 }],
    ['a null value', { [PROBE_KEY]: null }],
    ['a nested value', { [PROBE_KEY]: { n: 1 } }],
  ])('versions that are %s are ignored: the record counts as current', (_name, versions) => {
    expect(migrateCalls(v3Record(), { versions })).toEqual([])
  })

  it('a bad entry does not cost the good ones, and a hostile key names no prototype', () => {
    const hostile = JSON.parse(`{"__proto__":1,"constructor":1,"${PROBE_KEY}":1,"other":0}`) as unknown
    expect(migrateCalls(v3Record(), { versions: hostile })).toEqual([1])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('a v2 record migrates its slices from version 1, once, and ignores a versions map (it has no sv)', () => {
    expect(migrateCalls(load('save-v4.0.2.json.gz'))).toEqual([1])
    expect(migrateCalls(load('save-v4.0.2.json.gz'), { versions: { [PROBE_KEY]: 1 } })).toEqual([1])
    expect(migrateCalls(load('save-v1.json.gz'))).toEqual([1])
  })
})
