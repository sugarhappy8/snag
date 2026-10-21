// ci: fast
// R2-P1 (K.7b a): the golden kit. sliceDigests(g) turns a played state into one canonical-JSON FNV digest per slice, so a
// golden run that moved names the slice that moved (rng, character, people, assets, world, economy, flagsWorld,
// flagsPersonal, text), and explainMove names the first path inside it. These tests pin the kit itself: the nine names, the
// partition of the state (every key lands in one slice, none is lost), the sensitivity (one change moves one slice), the
// canonical text and the hash, and that a read changes nothing.
//
// The lives are fixed specs, not outcomes: the seed is a named constant, so the seed-pin ratchet of test/seed-pins.test.ts
// has nothing to count.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState, Json } from '../src/game/types'
import { classifyFlag } from '../src/game/world-flags'
import { deepFreeze } from './fuzz-kit'
import {
  SLICES,
  TOP_KEYS,
  canonicalJson,
  explainMove,
  fnv,
  movedSlices,
  sliceDigests,
  sliceView,
  sliceViews,
  unclassified,
  type SliceName,
} from './golden-kit'
import { makeTestGame } from './helpers'
import { playLife } from './play-kit'

const PLAN_SEED = 1
const DASH_EM = String.fromCharCode(0x2014)
const DASH_EN = String.fromCharCode(0x2013)

// One life, played once: 12 years through the kit's own popup driver, so the log, the queue, the people and the flags are
// real. Every test clones it, so nobody sees another's edit.
let lifeCache: GameState | null = null
function life(): GameState {
  if (!lifeCache) lifeCache = playLife({ seed: PLAN_SEED, birthYear: 1990, untilAge: 12 }).g
  return structuredClone(lifeCache)
}

/** The synthetic flags the sensitivity cases edit: one per slice that a flag can reach. */
function withFlags(g: GameState): GameState {
  g.flags.worldEconomy = { year: 1990 }
  g.flags.marketShocks = []
  g.flags.diet = 'none'
  g.flags.flavorRecent = ['a']
  g.flags.textMem = { c: 1 }
  return g
}

/** Reads the digests, applies one edit, reads them again and returns what moved. */
function moved(g: GameState, edit: (g: GameState) => void): SliceName[] {
  const before = sliceDigests(g)
  edit(g)
  return movedSlices(before, sliceDigests(g))
}

const asRecord = (g: GameState): Record<string, unknown> => g as unknown as Record<string, unknown>

describe('SLICES and TOP_KEYS', () => {
  it('SLICES is the lead\'s nine names, in that order', () => {
    expect([...SLICES]).toEqual(['rng', 'character', 'people', 'assets', 'world', 'economy', 'flagsWorld', 'flagsPersonal', 'text'])
  })

  it('TOP_KEYS covers every key of a test game and of a played-in life, and names no slice that does not exist', () => {
    const born = createNewLife({ seed: PLAN_SEED, year: 1990 })
    for (let i = 0; i < 3; i++) ageUp(born)
    for (const g of [makeTestGame(), born, life()]) {
      expect(unclassified(g).topKeys, 'a top-level key of GameState that TOP_KEYS does not place').toEqual([])
    }
    for (const dest of Object.values(TOP_KEYS)) expect([...SLICES, 'flags', 'ignore']).toContain(dest)
  })

  it('the version constants are ignored, so a schema bump moves no digest', () => {
    expect(TOP_KEYS.version).toBe('ignore')
    expect(TOP_KEYS.schemaVersion).toBe('ignore')
  })
})

describe('canonicalJson', () => {
  it('does not depend on key order, and equals JSON.stringify of a hand-ordered copy', () => {
    const a = { z: 1, a: { y: [3, { q: 1, b: 2 }], c: 'x' }, m: null }
    const b = { m: null, a: { c: 'x', y: [3, { b: 2, q: 1 }] }, z: 1 }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
    expect(canonicalJson(a)).toBe(JSON.stringify({ a: { c: 'x', y: [3, { b: 2, q: 1 }] }, m: null, z: 1 }))
  })

  it('sorts keys by code unit', () => {
    expect(canonicalJson({ b: 1, B: 2, a: 3, 10: 4, 9: 5 })).toBe('{"10":4,"9":5,"B":2,"a":3,"b":1}')
  })

  it('skips an undefined member of an object and writes null in an array, like JSON.stringify', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}')
    expect(canonicalJson([1, undefined, 3])).toBe('[1,null,3]')
    expect(canonicalJson({ f: () => 1, s: Symbol('x'), n: 1n, ok: 1 })).toBe('{"ok":1}')
    expect(canonicalJson([() => 1, 1n])).toBe('[null,null]')
    expect(canonicalJson(undefined)).toBe('null')
  })

  it('writes -0 as 0 and a non-finite number as a string, so NaN never hides as null', () => {
    expect(canonicalJson(-0)).toBe('0')
    expect(canonicalJson({ a: -0 })).toBe(canonicalJson({ a: 0 }))
    expect(canonicalJson(NaN)).not.toBe(canonicalJson(null))
    expect(canonicalJson(NaN)).toBe('"__num:NaN"')
    expect(canonicalJson(Infinity)).toBe('"__num:Infinity"')
    expect(canonicalJson(-Infinity)).toBe('"__num:-Infinity"')
    expect(canonicalJson([NaN])).not.toBe(canonicalJson([null]))
  })

  it('writes strings, booleans and nested arrays as JSON does', () => {
    const v = { s: 'a"b\\c\n', t: true, f: false, e: [], o: {}, deep: [[1, [2]], { k: [null] }] }
    expect(canonicalJson(v)).toBe(JSON.stringify({ deep: [[1, [2]], { k: [null] }], e: [], f: false, o: {}, s: 'a"b\\c\n', t: true }))
  })

  it('walks a state as deep as the load limit (128) without trouble, and refuses a cycle with a clear error', () => {
    let deep: unknown = 1
    for (let i = 0; i < 128; i++) deep = { n: deep }
    expect(canonicalJson(deep).length).toBeGreaterThan(128)
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    expect(() => canonicalJson(cyc)).toThrow(/too deep|cycle/i)
  })
})

describe('fnv', () => {
  it('is 16 lower-case hex characters, and stable', () => {
    for (const s of ['', 'a', 'hello world', '{"a":1}']) expect(fnv(s)).toMatch(/^[0-9a-f]{16}$/)
    expect(fnv('abc')).toBe(fnv('abc'))
    // Pinned once, after the kit was written: a change of the hash moves every golden digest, so it is a deliberate act.
    expect(fnv('hello world')).toBe('d6353bc45419ab71')
  })

  it('tells apart a one-character change, a swap, the empty string and a different length', () => {
    const seen = new Set([fnv(''), fnv('ab'), fnv('ba'), fnv('ac'), fnv('abc'), fnv('a'), fnv('aa'), fnv('aaa')])
    expect(seen.size).toBe(8)
  })

  it('has no collision among 20,000 distinct strings', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20_000; i++) seen.add(fnv(`state-${i}-${(i * 2654435761) % 4294967296}`))
    expect(seen.size).toBe(20_000)
  })
})

describe('the partition of the state', () => {
  it('puts every flag key in exactly one of economy, flagsWorld, flagsPersonal and text', () => {
    const g = life()
    const keys = Object.keys(g.flags)
    expect(keys.length, 'a played life has flags').toBeGreaterThan(5)
    const views = sliceViews(g)
    const part = (name: SliceName): string[] => Object.keys(((views[name] as { flags?: Record<string, unknown> }).flags ?? {}))
    const lists = [part('economy'), part('flagsWorld'), part('flagsPersonal'), part('text')]
    const all = lists.flat()
    expect(new Set(all).size, 'no key is in two slices').toBe(all.length)
    expect([...all].sort()).toEqual([...keys].sort())
  })

  it('files worldEconomy under economy, textMem and cache flags under text, and the rest by classifyFlag', () => {
    const g = withFlags(life())
    g.flags.zzNew = 1
    expect(classifyFlag('zzNew')).toBeNull()
    expect(classifyFlag('flavorRecent')).toBe('cache')
    expect(classifyFlag('marketShocks')).toBe('world')
    expect(classifyFlag('diet')).toBe('personal')
    const flagsOf = (name: SliceName): string[] => Object.keys((sliceView(g, name) as { flags?: Record<string, unknown> }).flags ?? {})
    expect(flagsOf('economy')).toContain('worldEconomy')
    expect(flagsOf('text')).toEqual(expect.arrayContaining(['textMem', 'flavorRecent']))
    expect(flagsOf('flagsWorld')).toContain('marketShocks')
    expect(flagsOf('flagsWorld')).not.toContain('worldEconomy')
    expect(flagsOf('flagsPersonal')).toContain('diet')
    expect(flagsOf('flagsPersonal')).toContain('zzNew')
    expect(flagsOf('flagsPersonal')).not.toContain('textMem')
    expect(unclassified(g).flags).toContain('zzNew')
    expect(unclassified(g).flags).not.toContain('diet')
  })

  it('files an unknown top-level key under world, and lists it', () => {
    const g = life()
    expect(unclassified(g).topKeys).toEqual([])
    asRecord(g).zzNewState = { n: 1 }
    expect(unclassified(g).topKeys).toEqual(['zzNewState'])
    expect(moved(g, (x) => { asRecord(x).zzNewState = { n: 2 } })).toEqual(['world'])
    expect(JSON.stringify(sliceView(g, 'world'))).toContain('zzNewState')
  })

  it('takes the notes out of people and the memories out of character, and puts both under text', () => {
    const g = life()
    g.people[0].notes.push('shared a joke')
    g.character.memories.push('a first memory')
    expect(JSON.stringify(sliceView(g, 'people'))).not.toContain('shared a joke')
    expect(JSON.stringify(sliceView(g, 'character'))).not.toContain('a first memory')
    expect(JSON.stringify(sliceView(g, 'text'))).toContain('shared a joke')
    expect(JSON.stringify(sliceView(g, 'text'))).toContain('a first memory')
  })
})

describe('sensitivity: one change moves one slice', () => {
  it('character', () => {
    expect(moved(life(), (g) => { g.character.money += 1 })).toEqual(['character'])
    expect(moved(life(), (g) => { g.year += 1 })).toEqual(['character'])
    expect(moved(life(), (g) => { g.counters.zzTest = 1 })).toEqual(['character'])
  })

  it('people', () => {
    expect(moved(life(), (g) => { g.people[0].relationship += 1 })).toEqual(['people'])
  })

  it('assets', () => {
    const asset = { id: 'zz', kind: 'car', name: 'Car', emoji: 'c', purchasePrice: 1, value: 1, condition: 1, purchasedAge: 1, upkeep: 0, details: {} } as unknown as Asset
    expect(moved(life(), (g) => { g.assets.push(asset) })).toEqual(['assets'])
  })

  it('rng', () => {
    expect(moved(life(), (g) => { g.rng += 1 })).toEqual(['rng'])
    expect(moved(life(), (g) => { g.nextId += 1 })).toEqual(['rng'])
  })

  it('economy, flagsWorld and flagsPersonal', () => {
    expect(moved(withFlags(life()), (g) => { (g.flags.worldEconomy as { year: number }).year += 1 })).toEqual(['economy'])
    expect(moved(withFlags(life()), (g) => { (g.flags.marketShocks as Json[]).push(1) })).toEqual(['flagsWorld'])
    expect(moved(withFlags(life()), (g) => { g.flags.diet = 'keto' })).toEqual(['flagsPersonal'])
    expect(moved(withFlags(life()), (g) => { g.flags.zzNew = 1 })).toEqual(['flagsPersonal'])
  })

  it('world', () => {
    expect(moved(life(), (g) => { asRecord(g).world = { x: 1 } })).toEqual(['world'])
  })

  it('text: a log line, a person note, a memory, a queue entry, the obituary, textMem and a cache flag move text only', () => {
    expect(moved(life(), (g) => { g.log[0].entries.push({ id: 'zz', text: 'x', tone: 'neutral' }) })).toEqual(['text'])
    expect(moved(life(), (g) => { g.people[0].notes.push('a note') })).toEqual(['text'])
    expect(moved(life(), (g) => { g.character.memories.push('a memory') })).toEqual(['text'])
    expect(moved(life(), (g) => { g.obituary = 'He lived.' })).toEqual(['text'])
    expect(moved(withFlags(life()), (g) => { g.flags.textMem = { c: 2 } })).toEqual(['text'])
    expect(moved(withFlags(life()), (g) => { (g.flags.flavorRecent as string[]).push('b') })).toEqual(['text'])
    expect(moved(life(), (g) => { g.queue.push({ kind: 'notice', id: 'zz', title: 't', text: 'x' } as unknown as GameState['queue'][number]) })).toEqual(['text'])
  })

  it('a changed log line text moves text only', () => {
    const g = life()
    const year = g.log.find((y) => y.entries.length > 0)
    expect(year, 'a played life has a log').toBeDefined()
    expect(moved(g, () => { year!.entries[0].text += '!' })).toEqual(['text'])
  })

  it('version and schemaVersion move nothing', () => {
    expect(moved(life(), (g) => { g.version += 1 })).toEqual([])
    expect(moved(life(), (g) => { g.schemaVersion = (g.schemaVersion ?? 1) + 7 })).toEqual([])
  })

  it('movedSlices lists the moved slices in SLICES order', () => {
    const a = sliceDigests(life())
    const b = { ...a, text: 'x', rng: 'y' }
    expect(movedSlices(a, b)).toEqual(['rng', 'text'])
    expect(movedSlices(a, a)).toEqual([])
  })
})

describe('g.world', () => {
  it('absent, undefined and null agree', () => {
    const absent = life()
    const undef = life()
    asRecord(undef).world = undefined
    const nul = life()
    asRecord(nul).world = null
    const d = sliceDigests(absent).world
    expect(sliceDigests(undef).world).toBe(d)
    expect(sliceDigests(nul).world).toBe(d)
    expect(sliceDigests(absent)).toEqual(sliceDigests(nul))
  })

  it('an empty world is not an absent one', () => {
    const g = life()
    const d = sliceDigests(g).world
    asRecord(g).world = {}
    expect(sliceDigests(g).world).not.toBe(d)
  })
})

describe('purity', () => {
  it('reads a deep-frozen state without throwing, equals the unfrozen digests, and leaves the state as it was', () => {
    const g = withFlags(life())
    g.people[0].notes.push('a note')
    const plain = sliceDigests(g)
    const json = JSON.stringify(g)
    const frozen = deepFreeze(structuredClone(g))
    expect(() => sliceDigests(frozen)).not.toThrow()
    expect(sliceDigests(frozen)).toEqual(plain)
    expect(() => sliceViews(frozen)).not.toThrow()
    expect(() => explainMove(frozen, frozen, 'text')).not.toThrow()
    expect(JSON.stringify(frozen)).toBe(json)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('digests of two clones of one state are equal, and survive a JSON round trip', () => {
    const g = life()
    expect(sliceDigests(structuredClone(g))).toEqual(sliceDigests(g))
    expect(sliceDigests(JSON.parse(JSON.stringify(g)) as GameState)).toEqual(sliceDigests(g))
  })
})

describe('explainMove', () => {
  it('names the first path inside the slice, with both values', () => {
    const a = life()
    const b = life()
    b.people[0].relationship += 3
    const text = explainMove(a, b, 'people')
    expect(text.startsWith('/people/0/'), text).toBe(true)
    expect(text).toContain('/people/0/relationship')
    expect(text).toContain(String(a.people[0].relationship))
    expect(text).toContain(String(b.people[0].relationship))
  })

  it('roots the other slices at their own state paths', () => {
    const a = withFlags(life())
    const edit = (slice: SliceName, f: (g: GameState) => void): string => {
      const b = structuredClone(a)
      f(b)
      return explainMove(a, b, slice)
    }
    expect(edit('rng', (g) => { g.rng += 1 }).startsWith('/rng')).toBe(true)
    expect(edit('character', (g) => { g.character.money += 1 }).startsWith('/character/money')).toBe(true)
    expect(edit('assets', (g) => { g.assets.push({ id: 'zz' } as unknown as Asset) }).startsWith('/assets/')).toBe(true)
    expect(edit('economy', (g) => { (g.flags.worldEconomy as { year: number }).year += 1 }).startsWith('/flags/worldEconomy/year')).toBe(true)
    expect(edit('flagsPersonal', (g) => { g.flags.diet = 'keto' }).startsWith('/flags/diet')).toBe(true)
    expect(edit('text', (g) => { g.character.memories.push('m') }).startsWith('/character/memories/')).toBe(true)
    expect(edit('text', (g) => { g.people[0].notes.push('n') }).startsWith('/people/0/notes/')).toBe(true)
    expect(edit('world', (g) => { asRecord(g).world = { x: 1 } }).startsWith('/world')).toBe(true)
  })

  it('cuts both values to 120 characters, and says so when nothing differs', () => {
    const a = life()
    const b = life()
    b.character.memories.push('x'.repeat(500))
    const text = explainMove(a, b, 'text')
    for (const part of text.split(': ').slice(1).join(': ').split(' -> ')) expect(part.length).toBeLessThanOrEqual(120)
    expect(explainMove(a, a, 'text')).toMatch(/no difference/i)
  })

  it('the kit and its own messages carry neither dash', () => {
    const text = explainMove(life(), (() => { const b = life(); b.rng += 1; return b })(), 'rng')
    expect(text.includes(DASH_EM) || text.includes(DASH_EN)).toBe(false)
  })
})
