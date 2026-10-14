// The save's schema version and migration chain, tested against a REAL v2.4.0 save
// (test/fixtures/save-v1.json.gz: `version: 1`, no `schemaVersion`), not a hand-built one.
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { isLoadableGame, migrateSave, MIN_SCHEMA, SAVE_SCHEMA } from '../src/game/save-schema'
import type { GameState } from '../src/game/types'

const fixture = JSON.parse(gunzipSync(readFileSync('test/fixtures/save-v1.json.gz')).toString()) as Record<string, unknown>

/** The migrated game, or a failure naming what came back instead. */
function migrated(raw: unknown): { game: GameState; from: number } {
  const result = migrateSave(raw)
  if (result.kind !== 'ready') throw new Error(`expected a ready save, got ${JSON.stringify(result)}`)
  return result
}

describe('migrateSave', () => {
  it('migrates the real v2.4.0 save and keeps it playable', () => {
    const { game, from } = migrated(structuredClone(fixture))
    expect(from).toBe(1)
    expect(game.schemaVersion).toBe(SAVE_SCHEMA)
    expect(isLoadableGame(game)).toBe(true)
    for (let i = 0; i < 3; i++) {
      game.queue = []
      ageUp(game)
    }
    expect(game.character.alive).toBe(true)
  })

  it('treats a missing schemaVersion as 1 and migrating twice changes nothing', () => {
    expect(fixture).not.toHaveProperty('schemaVersion')
    const first = migrated(structuredClone(fixture))
    expect(first.from).toBe(1)
    const second = migrated(JSON.parse(JSON.stringify(first.game)))
    expect(second.from).toBe(SAVE_SCHEMA)
    expect(JSON.stringify(second.game)).toBe(JSON.stringify(first.game))
  })

  it('still drops popups nothing could show from a save already at the current schema', () => {
    const current = migrated(structuredClone(fixture)).game
    current.queue = [
      { kind: 'notice', id: '', title: 'No id', text: 'Nothing could close this.' },
      { kind: 'notice', id: 'ok', title: 'Fine', text: 'Still readable.' },
    ]
    const again = migrated(JSON.parse(JSON.stringify(current)))
    expect(again.from).toBe(SAVE_SCHEMA)
    expect(again.game.queue.map((m) => m.id)).toEqual(['ok'])
  })

  it.each(['2', 2.5, NaN, 0, -1, null])('rejects an unusable schemaVersion as invalid without throwing: %o', (bad) => {
    const save = structuredClone(fixture)
    save.schemaVersion = bad
    expect(migrateSave(save)).toEqual({ kind: 'invalid' })
  })

  it('reports a newer schema without touching it, even for an unknown shape', () => {
    const junk = { version: 1, schemaVersion: SAVE_SCHEMA + 1, extra: { nested: true } }
    const before = JSON.stringify(junk)
    expect(migrateSave(junk)).toEqual({ kind: 'newer', version: SAVE_SCHEMA + 1 })
    expect(JSON.stringify(junk)).toBe(before)
  })

  it('reports tooOld below an injected floor', () => {
    expect(migrateSave(structuredClone(fixture), { minSchema: 2 })).toEqual({ kind: 'tooOld', version: 1 })
  })

  // One-element rows: a bare `[]` in the table would be read as a row with no arguments.
  const unplayable: unknown[][] = [[null], [5], ['x'], [[]], [{}], [{ version: 1, character: {} }]]
  it.each(unplayable)('returns invalid for non-objects and damaged shells: %o', (bad) => {
    expect(migrateSave(bad)).toEqual({ kind: 'invalid' })
  })

  it('has a fixture for every schema below the current one', () => {
    for (let v = MIN_SCHEMA; v < SAVE_SCHEMA; v++) {
      const path = `test/fixtures/save-v${v}.json.gz`
      expect(existsSync(path), path).toBe(true)
    }
  })
})
