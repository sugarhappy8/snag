// ci: fast
// R2-S12 (K.5, the world adapter): the slice table reads `world` and `world.ledger` through the world's own readers (normalizeWorld
// and normalizeLedger), and importing the table registers every shard of the world's hub. This file imports nothing of the game
// but the codec, the table and the world root, on purpose: a process that reads a save without loading the game's modules (a
// script, the boot before aging.ts) must still keep every shard, because normalizeWorld drops a shard nobody registered (R2-K7's
// load-order rule). A file that imports the whole game would register them by accident and prove nothing.
import { describe, expect, it } from 'vitest'
import { assembleSave } from '../src/game/save-codec'
import { shardNames } from '../src/game/world/state'

type Rec = Record<string, unknown>

/** A head with no chunks, so the world container is read straight from the core, the way a restore reads it. */
function headWith(world: unknown): Rec {
  return { version: 1, schemaVersion: 3, lifeId: 'adapter', flags: {}, world, chunks: {}, sv: {} }
}

function read(world: unknown): Rec {
  const r = assembleSave(headWith(world), new Map())
  if (r.kind !== 'ready') throw new Error(r.reason)
  return r.game
}

describe('the slice table and the world hub', () => {
  it('registers every shard of the hub when the table is imported alone', () => {
    expect(shardNames()).toEqual(['edges', 'facts', 'firms', 'frontier', 'holdings', 'homes', 'ledger', 'lod', 'met', 'people', 'social'])
  })

  it('keeps a registered shard of a saved world as it was, and drops a name nobody registered', () => {
    const people = { v: 1, rows: [{ id: 'person:a1', seen: 2030 }], over: 0 }
    const game = read({ v: 1, mystery: { x: 1 }, people, y: 2030 })
    expect(JSON.stringify(game.world)).toBe(JSON.stringify({ v: 1, people, y: 2030 }))
  })

  it('reads a root that is not a world as the empty world, and a value that is not an object as no world at all', () => {
    expect(read({ a: 1, people: { v: 1, rows: [], over: 0 } }).world).toEqual({ v: 1 })
    expect(read({ v: 2, people: { v: 1, rows: [], over: 0 } }).world).toEqual({ v: 1 })
    expect(read('x')).not.toHaveProperty('world')
    expect(read([1, 2])).not.toHaveProperty('world')
  })

  it('repairs a ledger that does not balance with the books\' own reader, and leaves a balanced one alone', () => {
    const empty = read({ v: 1, ledger: { v: 1, y: 2030, a: {}, m: {}, b: {}, ym: {}, yb: {}, f: {}, r: [], c: [], l: [], k: 0 } }).world as Rec
    expect(empty.ledger).toMatchObject({ v: 1, k: 0, a: {} })
    // An account of 5 with no mint behind it: the books' reader heals it with a mint of its own and a log row, never a silent value.
    const broken = read({ v: 1, ledger: { v: 1, y: 2030, a: { 'person:a1': 5 }, m: {}, b: {}, ym: {}, yb: {}, f: {}, r: [], c: [], l: [], k: 1 } }).world as { ledger: { m: Record<string, number>; l: unknown[] } }
    expect(broken.ledger.m.heal).toBe(5)
    expect(broken.ledger.l.length).toBe(1)
  })
})
