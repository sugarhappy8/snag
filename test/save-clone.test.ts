// R2-S8 (K.5 h): act() builds its draft with cloneForAct (src/game/save-clone.ts), not structuredClone. The draft is the committed
// state with the core cloned and every `replace` root shared by reference (the world economy, the completed years of the life log,
// the shards of g.world), deep-frozen. A tap then costs a clone of the core and nothing for the roots, and the codec's identity
// cache (save-codec.ts) hits on them. The price is the write-discipline rule of the slice registry: a `replace` slice is never
// edited in place, and a stray in-place write is a TypeError here, not a stale save.
//
// What this file holds:
//   (a) the clone is the state: same JSON, same key order, deep-equal to structuredClone;
//   (b) what is shared and what is not, and a draft's writes never reach the state it came from;
//   (c) a write into a shared root throws, and a write into the in-place ledger shard does not;
//   (d) odd shapes clone (no economy, a one-year or empty log, no world, a world that is not an object);
//   (e) a deep-frozen state clones (the shape the fuzz kit hands over);
//   (f) the yearly step runs on shared roots and replaces them: six years through the clone equal six through structuredClone;
//   (g) the fuzz kit's action probe plays through the clone, and the detector it gives for an in-place writer works.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { addMoney } from '../src/game/core'
import { economyState } from '../src/game/economy/model'
import { checkLedger, ledgerChecksForTests } from '../src/game/kernel/ledger'
import { LOG_TAIL } from '../src/game/kernel/slices'
import { encodeSave } from '../src/game/save-codec'
import { cloneForAct } from '../src/game/save-clone'
import type { GameState, LogYear, MenuNode } from '../src/game/types'
import { FailureLog, deepFreeze, formatFailures, probeActions } from './fuzz-kit'
import { makeTestGame } from './helpers'
import { probeLife } from './probe-life'

// A fixed life as a constant, not a `seed: <digits>` pin (test/seed-pins.test.ts).
const CLONE_LIFE_SEED = 3

type Rec = Record<string, unknown>
const rec = (g: GameState): Rec => g as unknown as Rec
const worldOf = (g: GameState): Rec => rec(g).world as Rec
const json = (g: GameState): string => JSON.stringify(g)

const year = (age: number, lines = 2): LogYear => ({
  age,
  year: 2000 + age,
  entries: Array.from({ length: lines }, (_, i) => ({ id: `l${age}-${i}`, text: `I did thing ${i} at ${age}.`, tone: 'neutral' as const })),
})

/** A small state with an economy flag among other flags, a log of `ages + 1` years and a world with the ledger and two replace shards. */
function busy(ages = 12): GameState {
  const g = makeTestGame(1)
  g.flags = { before: 1, worldEconomy: { v: 2, year: 2026, countries: { us: { gdp: 1, rows: [1, 2] }, fr: { gdp: 2 } } }, after: { n: [1, 2, 3] } }
  g.log = Array.from({ length: ages + 1 }, (_, age) => year(age))
  g.character.age = ages
  rec(g).world = {
    ledger: { total: 5, rows: [1, 2] },
    people: { rows: [{ a: 1 }, { a: 2 }], index: { x: 1 } },
    firms: { rows: [{ b: 1 }] },
  }
  return g
}

let life: GameState | undefined
/** A 15-year life with two companies, built once and never edited (a test that edits it clones it first). */
function life15(): GameState {
  return (life ??= probeLife({ seed: CLONE_LIFE_SEED, birthYear: 1990, businesses: 2, years: 15 }))
}

describe('the clone is the state', () => {
  it('has the same JSON and the same key order as the state, and is deep-equal to a structured clone', () => {
    for (const g of [makeTestGame(1), busy(), life15()]) {
      const draft = cloneForAct(g)
      expect(json(draft)).toBe(json(g))
      expect(draft).toEqual(structuredClone(g))
      expect(Object.keys(draft)).toEqual(Object.keys(g))
      expect(Object.keys(draft.flags)).toEqual(Object.keys(g.flags))
    }
  }, 120_000)

  it('keeps the place of the economy among the flags and of the world container among the keys', () => {
    const g = busy()
    const draft = cloneForAct(g)
    expect(Object.keys(draft.flags)).toEqual(['before', 'worldEconomy', 'after'])
    expect(Object.keys(worldOf(draft))).toEqual(['ledger', 'people', 'firms'])
    expect(Object.keys(draft)).toEqual(Object.keys(g))
  })

  it('keeps what a structured clone keeps that JSON would not: an undefined member and NaN stay as they are', () => {
    const g = busy()
    rec(g).extra = { gone: undefined, bad: Number.NaN }
    const draft = cloneForAct(g)
    expect(rec(draft).extra).toStrictEqual(structuredClone(rec(g).extra))
    expect(Object.keys(rec(draft).extra as Rec)).toEqual(['gone', 'bad'])
  })

  it('does not touch the state it reads: same JSON before and after', () => {
    const g = busy()
    const before = json(g)
    cloneForAct(g)
    expect(json(g)).toBe(before)
  })
})

describe('what a draft shares with the state it came from', () => {
  it('shares the economy root, the completed log years and the world shards, and nothing else', () => {
    const g = busy()
    const draft = cloneForAct(g)
    expect(draft.flags.worldEconomy).toBe(g.flags.worldEconomy)
    expect(draft.log.length).toBe(g.log.length)
    for (let i = 0; i < g.log.length - LOG_TAIL; i++) expect(draft.log[i], `completed year ${i}`).toBe(g.log[i])
    const tail = g.log.length - 1
    expect(draft.log[tail]).not.toBe(g.log[tail])
    expect(draft.log[tail]).toEqual(g.log[tail])
    expect(draft.log).not.toBe(g.log)
    expect(worldOf(draft).people).toBe(worldOf(g).people)
    expect(worldOf(draft).firms).toBe(worldOf(g).firms)
    // The in-place ledger shard is cloned like the core: Ledger-world books into it on every tap.
    expect(worldOf(draft).ledger).not.toBe(worldOf(g).ledger)
    expect(worldOf(draft).ledger).toEqual(worldOf(g).ledger)
    expect(worldOf(draft)).not.toBe(worldOf(g))
    // The core is cloned: nothing else is the same object.
    expect(draft.character).not.toBe(g.character)
    expect(draft.people).not.toBe(g.people)
    expect(draft.assets).not.toBe(g.assets)
    expect(draft.flags).not.toBe(g.flags)
    expect(draft.flags.after).not.toBe(g.flags.after)
    expect(draft.counters).not.toBe(g.counters)
    expect(draft.queue).not.toBe(g.queue)
  })

  it('on a real life too: the economy root is the same object, the log years but the last are, the core is not', () => {
    const g = life15()
    const draft = cloneForAct(g)
    expect(draft.flags.worldEconomy).toBeDefined()
    expect(draft.flags.worldEconomy).toBe(g.flags.worldEconomy)
    expect(g.log.length).toBeGreaterThan(5)
    for (let i = 0; i < g.log.length - LOG_TAIL; i++) expect(draft.log[i]).toBe(g.log[i])
    expect(draft.log[g.log.length - 1]).not.toBe(g.log[g.log.length - 1])
    expect(draft.character).not.toBe(g.character)
    expect(draft.assets).not.toBe(g.assets)
    expect(draft.people).not.toBe(g.people)
  }, 120_000)

  it('freezes what it shares, and only that', () => {
    const g = busy()
    const draft = cloneForAct(g)
    expect(Object.isFrozen(draft.flags.worldEconomy)).toBe(true)
    expect(Object.isFrozen((draft.flags.worldEconomy as Rec).countries)).toBe(true)
    expect(Object.isFrozen(draft.log[0])).toBe(true)
    expect(Object.isFrozen(draft.log[0]!.entries)).toBe(true)
    expect(Object.isFrozen(worldOf(draft).people)).toBe(true)
    expect(Object.isFrozen(draft)).toBe(false)
    expect(Object.isFrozen(draft.flags)).toBe(false)
    expect(Object.isFrozen(draft.log)).toBe(false)
    expect(Object.isFrozen(draft.log[draft.log.length - 1])).toBe(false)
    expect(Object.isFrozen(draft.character)).toBe(false)
    expect(Object.isFrozen(worldOf(draft))).toBe(false)
    expect(Object.isFrozen(worldOf(draft).ledger)).toBe(false)
  })

  it('lets the draft change everything it owns without reaching the state it came from', () => {
    const g = busy()
    const before = json(g)
    const draft = cloneForAct(g)
    draft.character.money += 123
    draft.character.firstName = 'Changed'
    draft.people.push({ id: 'new' } as never)
    draft.assets.length = 0
    draft.flags.after = { n: [9] }
    draft.flags.fresh = true
    draft.counters.taps = 7
    draft.queue.length = 0
    draft.log[draft.log.length - 1]!.entries.push({ id: 'new', text: 'A new line.', tone: 'good' })
    draft.log.push(year(99))
    draft.log.splice(0, 1)
    draft.year += 1
    ;(worldOf(draft).ledger as Rec).total = 99
    ;(worldOf(draft).ledger as { rows: number[] }).rows.push(3)
    worldOf(draft).added = { rows: [1] }
    delete worldOf(draft).firms
    expect(json(g)).toBe(before)
  })

  it('shares across a chain of taps: the identity of each root survives every draft', () => {
    const g = busy()
    const first = cloneForAct(g)
    first.character.money += 1
    const second = cloneForAct(first)
    expect(second.flags.worldEconomy).toBe(g.flags.worldEconomy)
    expect(second.log[0]).toBe(g.log[0])
    expect(worldOf(second).people).toBe(worldOf(g).people)
    // The year the first draft ended on is a completed year once a second year starts.
    first.log.push(year(13))
    const third = cloneForAct(first)
    expect(third.log[12]).toBe(first.log[12])
    expect(third.log[13]).not.toBe(first.log[13])
  })
})

describe('a write into a shared root is a TypeError', () => {
  it('in the economy root, however deep', () => {
    const draft = cloneForAct(busy())
    const eco = draft.flags.worldEconomy as { year: number; countries: { us: { gdp: number; rows: number[] } } }
    expect(() => {
      eco.year = 2027
    }).toThrow(TypeError)
    expect(() => {
      eco.countries.us.gdp = 5
    }).toThrow(TypeError)
    expect(() => eco.countries.us.rows.push(3)).toThrow(TypeError)
    expect(() => {
      delete (eco as Partial<typeof eco>).year
    }).toThrow(TypeError)
    expect(eco.year).toBe(2026)
  })

  it('in a completed log year, its lines and the list of lines', () => {
    const draft = cloneForAct(busy())
    const done = draft.log[2]!
    expect(() => {
      done.age = 50
    }).toThrow(TypeError)
    expect(() => done.entries.push({ id: 'x', text: 'late', tone: 'neutral' })).toThrow(TypeError)
    expect(() => {
      done.entries[0]!.text = 'rewritten'
    }).toThrow(TypeError)
    expect(done.entries).toHaveLength(2)
  })

  it('in a world shard, but not in the ledger shard and not on the world container', () => {
    const draft = cloneForAct(busy())
    const people = worldOf(draft).people as { rows: { a: number }[]; index: Rec }
    expect(() => people.rows.push({ a: 3 })).toThrow(TypeError)
    expect(() => {
      people.rows[0]!.a = 9
    }).toThrow(TypeError)
    expect(() => {
      people.index.y = 2
    }).toThrow(TypeError)
    // Replacing a shard (the writer's way) and adding one is allowed; so is booking into the ledger.
    expect(() => {
      worldOf(draft).people = { rows: [], index: {} }
    }).not.toThrow()
    expect(() => {
      worldOf(draft).extra = { rows: [] }
    }).not.toThrow()
    expect(() => {
      ;(worldOf(draft).ledger as { total: number }).total += 1
    }).not.toThrow()
  })

  it('and the log array itself, the flags and the core stay writable', () => {
    const draft = cloneForAct(busy())
    expect(() => draft.log.push(year(50))).not.toThrow()
    expect(() => {
      draft.flags.worldEconomy = { v: 2, year: 2027, countries: {} }
    }).not.toThrow()
    expect(() => {
      draft.character.money = 1
    }).not.toThrow()
  })
})

describe('odd shapes clone', () => {
  it('a state with no economy flag', () => {
    const g = busy()
    delete g.flags.worldEconomy
    const draft = cloneForAct(g)
    expect(json(draft)).toBe(json(g))
    expect('worldEconomy' in draft.flags).toBe(false)
    expect(Object.keys(draft.flags)).toEqual(['before', 'after'])
  })

  it('an economy flag that is empty, or not an object, is cloned like any value', () => {
    for (const value of [{}, [], 0, 'x', null, true]) {
      const g = busy()
      g.flags.worldEconomy = value as never
      const draft = cloneForAct(g)
      expect(json(draft)).toBe(json(g))
    }
    const g = busy()
    g.flags.worldEconomy = {}
    // An empty object is still a root: it is shared (and frozen) too, so the rule reads the same for every root.
    expect(cloneForAct(g).flags.worldEconomy).toBe(g.flags.worldEconomy)
  })

  it('a log of one year, of none, and a log that is not a list', () => {
    const one = busy(0)
    expect(one.log).toHaveLength(1)
    const draftOne = cloneForAct(one)
    expect(json(draftOne)).toBe(json(one))
    expect(draftOne.log[0]).not.toBe(one.log[0])
    const none = busy()
    none.log = []
    expect(json(cloneForAct(none))).toBe(json(none))
    const odd = busy()
    rec(odd).log = 'not a list'
    expect(json(cloneForAct(odd))).toBe(json(odd))
    const nulls = busy()
    rec(nulls).log = [null, 3, 'x', year(2)]
    expect(json(cloneForAct(nulls))).toBe(json(nulls))
  })

  it('a state with no world, an empty world, and a world that is not an object', () => {
    const none = busy()
    delete rec(none).world
    const draftNone = cloneForAct(none)
    expect('world' in draftNone).toBe(false)
    expect(json(draftNone)).toBe(json(none))
    const empty = busy()
    rec(empty).world = {}
    const draftEmpty = cloneForAct(empty)
    expect(json(draftEmpty)).toBe(json(empty))
    expect(worldOf(draftEmpty)).not.toBe(worldOf(empty))
    for (const value of [null, 0, 'x', [], [{ a: 1 }]]) {
      const g = busy()
      rec(g).world = value
      expect(json(cloneForAct(g))).toBe(json(g))
    }
  })

  it('a shard that is a number or null, or has a name no slice row can take, is cloned with the core', () => {
    const g = busy()
    const w = worldOf(g)
    w.count = 7
    w.nothing = null
    w['Odd-Name'] = { rows: [1] }
    const draft = cloneForAct(g)
    expect(json(draft)).toBe(json(g))
    expect(worldOf(draft).count).toBe(7)
    expect(worldOf(draft)['Odd-Name']).not.toBe(w['Odd-Name'])
    expect(worldOf(draft).people).toBe(w.people)
  })

  it('a world with a __proto__ key from a parsed save does not poison the clone', () => {
    const g = busy()
    rec(g).world = JSON.parse('{"__proto__":{"polluted":true},"people":{"rows":[1]}}') as Rec
    const draft = cloneForAct(g)
    expect(({} as Rec).polluted).toBeUndefined()
    expect(Object.keys(worldOf(draft))).toEqual(['__proto__', 'people'])
    expect(worldOf(draft).people).toBe(worldOf(g).people)
    expect(json(draft)).toBe(json(g))
  })

  it('a state with an empty and a tiny core', () => {
    const g = makeTestGame(1)
    g.log = []
    g.flags = {}
    const draft = cloneForAct(g)
    expect(json(draft)).toBe(json(g))
  })
})

describe('a deep-frozen state clones (the shape the fuzz kit hands over)', () => {
  it('and the draft is writable except for the shared roots', () => {
    const g = deepFreeze(busy())
    const draft = cloneForAct(g)
    expect(json(draft)).toBe(json(g))
    expect(Object.isFrozen(draft.character)).toBe(false)
    expect(Object.isFrozen(draft.flags)).toBe(false)
    expect(Object.isFrozen(worldOf(draft))).toBe(false)
    expect(Object.isFrozen(draft.log)).toBe(false)
    expect(Object.isFrozen(draft.log[draft.log.length - 1])).toBe(false)
    expect(() => {
      draft.character.money += 5
      draft.log[draft.log.length - 1]!.entries.push({ id: 'n', text: 'ok', tone: 'neutral' })
      ;(worldOf(draft).ledger as { total: number }).total += 1
    }).not.toThrow()
    expect(draft.flags.worldEconomy).toBe(g.flags.worldEconomy)
    expect(() => {
      ;(draft.flags.worldEconomy as { year: number }).year = 1
    }).toThrow(TypeError)
  })

  it('a deep-frozen real life', () => {
    const g = deepFreeze(structuredClone(life15()))
    const draft = cloneForAct(g)
    expect(json(draft)).toBe(json(g))
    expect(() => {
      draft.character.money += 5
    }).not.toThrow()
  }, 120_000)
})

describe('the yearly step runs on shared roots and replaces them', () => {
  /** `years` years, each on a fresh draft of the one before; the economy root of every year is kept. */
  function play(start: GameState, years: number, clone: (g: GameState) => GameState): { end: GameState; roots: unknown[] } {
    let cur = start
    const roots: unknown[] = [start.flags.worldEconomy]
    for (let i = 0; i < years; i++) {
      const draft = clone(cur)
      draft.queue = []
      ageUp(draft)
      roots.push(draft.flags.worldEconomy)
      cur = draft
    }
    return { end: cur, roots }
  }

  it('six years through cloneForAct end where six years through structuredClone end', () => {
    const start = life15()
    expect(start.character.alive).toBe(true)
    const old = play(start, 6, (g) => structuredClone(g))
    const next = play(start, 6, cloneForAct)
    expect(next.end.character.alive).toBe(true)
    expect(next.end.year).toBe(start.year + 6)
    expect(json(next.end)).toBe(json(old.end))
  }, 240_000)

  it('writes a new economy root every year: no year reuses (or edits) the shared one', () => {
    const start = life15()
    const yearOfStart = (start.flags.worldEconomy as { year: number }).year
    const { roots } = play(start, 4, cloneForAct)
    expect(new Set(roots).size).toBe(roots.length)
    // Each earlier root was frozen when the next draft was made from it, and was not edited after.
    for (const root of roots.slice(0, -1)) expect(Object.isFrozen(root)).toBe(true)
    expect((roots[0] as { year: number }).year).toBe(yearOfStart)
    expect((roots[roots.length - 1] as { year: number }).year).toBe(yearOfStart + 4)
  }, 240_000)

  it('economyState of a draft is a new root each year, and reads the shared root without copying it', () => {
    const start = life15()
    const states: unknown[] = [economyState(start)]
    let cur = start
    for (let i = 0; i < 3; i++) {
      const draft = cloneForAct(cur)
      // Before the yearly step a draft reads the very same normalized state its source did: the identity cache hits.
      expect(economyState(draft)).toBe(economyState(cur))
      draft.queue = []
      ageUp(draft)
      states.push(economyState(draft))
      cur = draft
    }
    expect(new Set(states).size).toBe(states.length)
  }, 240_000)
})

describe('the fuzz kit plays its actions through the clone', () => {
  it('every enabled action of a mid-life state with three companies runs on a draft that shares frozen roots, and none writes into one', () => {
    const g = probeLife({ seed: CLONE_LIFE_SEED, birthYear: 1990, businesses: 3, years: 10, keepAlive: true })
    g.queue = []
    expect(g.character.age).toBe(40)
    const log = new FailureLog()
    const ran = probeActions(g, log, CLONE_LIFE_SEED, { depth: 1, max: 150 })
    expect(ran).toBeGreaterThan(20)
    expect(formatFailures(log)).toBe('')
    expect(log.list()).toEqual([])
  }, 120_000)

  it('catches an action that edits the economy root in place (the detector for a writer of a replace slice)', () => {
    const g = probeLife({ seed: CLONE_LIFE_SEED, birthYear: 1990, businesses: 1, years: 3, keepAlive: true })
    g.queue = []
    const poke: MenuNode = {
      type: 'action',
      id: 'poke.economy',
      label: 'Poke the economy',
      emoji: '*',
      run: (draft) => {
        ;(draft.flags.worldEconomy as { year: number }).year = 1
      },
    }
    const log = new FailureLog()
    expect(probeActions(g, log, 1, { depth: 1, roots: () => [poke] })).toBe(1)
    expect(log.list().map((f) => f.first.kind)).toEqual(['action-stale-throw'])
  }, 120_000)

  it('catches an action that edits a completed log year in place', () => {
    const g = probeLife({ seed: CLONE_LIFE_SEED, birthYear: 1990, businesses: 1, years: 3, keepAlive: true })
    g.queue = []
    const poke: MenuNode = {
      type: 'action',
      id: 'poke.log',
      label: 'Edit an old year',
      emoji: '*',
      run: (draft) => {
        draft.log[0]!.entries.push({ id: 'late', text: 'Late.', tone: 'neutral' })
      },
    }
    const log = new FailureLog()
    expect(probeActions(g, log, 1, { depth: 1, roots: () => [poke] })).toBe(1)
    expect(log.list().map((f) => f.first.kind)).toEqual(['action-stale-throw'])
  }, 120_000)
})

describe('the codec reads a draft as it reads the state', () => {
  it('a draft encodes to the head and chunks of the state, and a second encode stringifies nothing for the shared roots', () => {
    const g = life15()
    const first = encodeSave(g)
    const draft = cloneForAct(g)
    const again = encodeSave(draft)
    expect(again.head).toBe(first.head)
    expect([...again.chunks.keys()]).toEqual([...first.chunks.keys()])
    expect(again.stats.stringified).toBe(0)
  }, 120_000)
})

describe('the ledger shard in a draft', () => {
  it('is not checked again at the first booking of a tap: the committed shard was checked, and its clone is deep-equal', () => {
    const g = makeTestGame(1)
    expect(addMoney(g, 5, 'wage')).toBe(5)
    const before = ledgerChecksForTests()
    const draft = cloneForAct(g)
    expect(worldOf(draft).ledger).not.toBe(worldOf(g).ledger)
    expect(addMoney(draft, 7, 'wage')).toBe(7)
    expect(ledgerChecksForTests()).toBe(before)
    // And a tap later, from the draft that was committed.
    const next = cloneForAct(draft)
    expect(addMoney(next, 1, 'wage')).toBe(1)
    expect(ledgerChecksForTests()).toBe(before)
    expect(checkLedger(next).ok).toBe(true)
  })

  it('still checks a clone of a shard nothing had checked, and repairs it', () => {
    const g = makeTestGame(1)
    rec(g).world = { v: 1, ledger: { v: 1, y: 0, a: { bogus: 5, 'person:a': 3 }, m: { gift: 3 } } }
    const before = ledgerChecksForTests()
    const draft = cloneForAct(g)
    addMoney(draft, 2, 'wage')
    expect(ledgerChecksForTests()).toBeGreaterThan(before)
    expect(checkLedger(draft, { allowHeal: true }).ok).toBe(true)
    expect(Object.keys((worldOf(draft).ledger as { a: Rec }).a)).not.toContain('bogus')
  })
})
