// R2-L18 (found by the hostile-load matrix of test/world-acceptance.test.ts, RF4): the save loader does not look inside g.world and
// every reader normalizes, so a key the game does not know (a shard of another build, a `__proto__` that rode in on a save) or a
// world far past its node cap would sit in the save for good, and be saved again every time. The world step, once a year, replaces
// such a world with what normalizeWorld makes of it. A clean world is left exactly as it was.
import { describe, expect, it } from 'vitest'
import { addMoney } from '../src/game/core'
import { acctBalance, checkLedger, peekLedger, playerAcct } from '../src/game/kernel/ledger'
import type { GameState } from '../src/game/types'
import { WORLD_NODE_CAP } from '../src/game/world/caps'
import '../src/game/world/shards'
import { readWorld, shardNames } from '../src/game/world/state'
import { yearlyWorld } from '../src/game/world/yearly'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

/** Stores a world as a hostile save would hold it: raw, with no reader in between. */
const setWorld = (g: GameState, raw: unknown): void => {
  ;(g as { world?: unknown }).world = raw
}

const nodes = (x: unknown): number => {
  let n = 0
  const stack: unknown[] = [x]
  while (stack.length > 0) {
    const item = stack.pop()
    n++
    if (item !== null && typeof item === 'object') for (const kid of Array.isArray(item) ? item : Object.values(item)) stack.push(kid)
  }
  return n
}

const junk = (n: number): { v: 1; rows: number[] } => ({ v: 1, rows: Array.from({ length: n }, () => 1) })

/** A game with something booked and indexed, stamped with its year. */
function lived(): GameState {
  const g = makeTestGame(7, { age: 40, money: 50_000 })
  addMoney(g, 1_000, 'wage')
  yearlyWorld(g)
  return g
}

describe('the world step repairs a world that came in hostile', () => {
  it('drops a shard the game does not know and keeps the shards it does, the same objects', () => {
    const g = lived()
    const before = readWorld(g)
    const ledger = before.ledger
    g.year += 1
    ;(g.world as Record<string, unknown>).stranger = junk(10)
    yearlyWorld(g)
    expect(Object.keys(readWorld(g)).filter((k) => k !== 'v' && k !== 'y' && !shardNames().includes(k))).toEqual([])
    expect(g.world?.stranger).toBeUndefined()
    expect(g.world?.ledger).toBe(ledger)
    expect(readWorld(g).y).toBe(g.year)
  })

  it('drops a __proto__ key that came in with the JSON', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    setWorld(g, JSON.parse('{"v":1,"__proto__":{"v":1,"polluted":true}}'))
    expect(Object.keys(g.world ?? {})).toContain('__proto__')
    yearlyWorld(g)
    expect(Object.keys(g.world ?? {})).not.toContain('__proto__')
    expect(readWorld(g).y).toBe(g.year)
  })

  it('cuts a world far past the node cap down under it', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    setWorld(g, { v: 1, a: junk(300_000), b: junk(200_000) })
    expect(nodes(g.world)).toBeGreaterThan(WORLD_NODE_CAP * 10)
    yearlyWorld(g)
    expect(nodes(g.world)).toBeLessThan(WORLD_NODE_CAP)
    expect(readWorld(g).y).toBe(g.year)
  })

  it('repairs a world that already carries this year\'s stamp: the stamp does not hide it', () => {
    const g = lived()
    ;(g.world as Record<string, unknown>).stranger = junk(50_000)
    expect(readWorld(g).y).toBe(g.year)
    yearlyWorld(g)
    expect(g.world?.stranger).toBeUndefined()
    expect(nodes(g.world)).toBeLessThan(WORLD_NODE_CAP)
  })

  it('keeps the books whole: a world that held a ledger and junk loses only the junk', () => {
    const g = lived()
    const accounts = JSON.stringify(peekLedger(g).a)
    expect(acctBalance(g, playerAcct(g))).toBe(1_000)
    ;(g.world as Record<string, unknown>).stranger = junk(60_000)
    g.year += 1
    yearlyWorld(g)
    expect(JSON.stringify(peekLedger(g).a)).toBe(accounts)
    expect(checkLedger(g).ok).toBe(true)
  })

  it('leaves a clean world alone: the same root, the same shards, nothing written, a frozen world included', () => {
    const g = lived()
    const root = g.world
    const shards = Object.values(g.world ?? {})
    yearlyWorld(g)
    expect(g.world).toBe(root)
    expect(Object.values(g.world ?? {})).toEqual(shards)
    deepFreeze(g.world)
    expect(() => yearlyWorld(g)).not.toThrow()
    expect(g.world).toBe(root)
  })

  it('does not touch an absent or a garbage world (the first write replaces garbage)', () => {
    const g = makeTestGame(7, { age: 40, money: 50_000 })
    expect(g.world).toBeUndefined()
    for (const garbage of [5, 'x', [1, 2], null]) {
      setWorld(g, garbage)
      expect(() => yearlyWorld(g)).not.toThrow()
    }
  })
})
