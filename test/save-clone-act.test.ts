// R2-S8 (K.5 h): act() in the UI store builds its draft with cloneForAct. The clone itself is tested in test/save-clone.test.ts; this
// file holds the wiring: a tap through the real store hands the draft the committed state's economy root (so the root keeps its
// identity from tap to tap), a write into a shared root throws out of act() and commits nothing, and a year played through the
// store replaces the root.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '../src/game/types'

// A minimal in-memory localStorage, installed before the store loads its settings and the save layer writes the game.
vi.hoisted(() => {
  const data = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
})

const store = await import('../src/ui/store')
const { ensureEconomy } = await import('../src/game/economy')

// A fixed life as a constant, not a `seed: <digits>` pin (test/seed-pins.test.ts).
const ACT_LIFE_SEED = 3
const BIRTH_YEAR = 2026

const game = (): GameState => store.getApp().game as GameState
const economyRoot = (g: GameState): { year: number } => g.flags.worldEconomy as { year: number }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store.startNewLife({ seed: ACT_LIFE_SEED, year: BIRTH_YEAR })
  store.act((g) => {
    g.queue = []
    g.character.age = 25
    ensureEconomy(g)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('act() in the store', () => {
  it('hands the draft the committed economy root: it keeps its identity from tap to tap, and is frozen', () => {
    const before = game()
    const root = economyRoot(before)
    expect(root).toBeDefined()
    store.act((g) => {
      g.character.money += 1
    })
    const after = game()
    expect(after).not.toBe(before)
    expect(after.character).not.toBe(before.character)
    expect(economyRoot(after)).toBe(root)
    expect(Object.isFrozen(root)).toBe(true)
    // A third tap keeps it too.
    store.act((g) => {
      g.character.money += 1
    })
    expect(economyRoot(game())).toBe(root)
  })

  it('throws a write into the shared economy root out of act(), and commits nothing', () => {
    const before = game()
    const text = JSON.stringify(before)
    expect(() =>
      store.act((g) => {
        economyRoot(g).year = 1
      }),
    ).toThrow(TypeError)
    expect(game()).toBe(before)
    expect(JSON.stringify(game())).toBe(text)
    // The store still plays on.
    store.act((g) => {
      g.character.money += 1
    })
    expect(game().character.money).toBe(before.character.money + 1)
  })

  it('throws a write into a finished year of the life log, and lets the current year take a line', () => {
    store.act((g) => {
      g.log.push({ age: 26, year: g.year, entries: [] })
    })
    const done = game().log.length - 2
    expect(() =>
      store.act((g) => {
        g.log[done]!.entries.push({ id: 'late', text: 'Late.', tone: 'neutral' })
      }),
    ).toThrow(TypeError)
    expect(() =>
      store.act((g) => {
        g.log[g.log.length - 1]!.entries.push({ id: 'now', text: 'Now.', tone: 'neutral' })
      }),
    ).not.toThrow()
  })

  it('plays a year through the store: the economy root is replaced, and the one the year started on is not edited', () => {
    const before = game()
    const root = economyRoot(before)
    const yearOfRoot = root.year
    const age = before.character.age
    store.ageUpAction()
    const after = game()
    expect(after.character.age).toBe(age + 1)
    expect(economyRoot(after)).not.toBe(root)
    expect(root.year).toBe(yearOfRoot)
    expect(Object.isFrozen(root)).toBe(true)
  })
})
