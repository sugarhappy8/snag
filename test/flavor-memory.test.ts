// events/flavor.ts on the shared text memory (R1-T2, E.T1 part 2). The 60-key window of recent lines moves from
// g.flags.flavorRecent into the ring g.flags.textMem.r.flavor. Nothing about the life log may change: the golden below
// was recorded from the file as it stood before the move, and it holds g.rng after every year, so one stray draw or one
// different exclusion shows up as a changed hash.
// R2-B2 (the rebaseline) moved every flavor draw onto the text stream (text/draw.ts). The golden keeps its shape and is
// re-recorded once, under the new rule: g.rng is now constant over each life (the hash still holds it, so a stray g.rng draw
// shows up), and the lines are the text stream's. FLAVOR_GOLDEN=1 rewrites it, as before.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { ERA_PACKS, eraFlavorPools } from '../src/game/events/era-life'
import { FLAVOR_POOLS, addFlavorLines } from '../src/game/events/flavor'
import { continueAsChild, createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { fnv1a } from '../src/game/text/hash'
import { readTextMem, ringRead, ringWrite } from '../src/game/text/memory'
import type { GameState, Json } from '../src/game/types'

type GoldenCase = { seed: number; birth: number; steps: string[] }
type Golden = { v: 1; cases: GoldenCase[] }

const CASES = [
  { seed: 11, birth: 1925 },
  { seed: 12, birth: 1960 },
  { seed: 13, birth: 1990 },
  { seed: 14, birth: 2012 },
] as const
const FIXTURE = fileURLToPath(new URL('./fixtures/flavor-golden.json', import.meta.url))

function allLines(g: GameState): string[] {
  return g.log.flatMap((y) => y.entries.map((e) => e.text))
}

/** One hash per year of age 1 to 85: g.rng after the call, then the lines the call added. */
function record(seed: number, birth: number): string[] {
  const g = createNewLife({ seed, year: birth })
  g.queue = []
  const rng = g.rng
  const steps: string[] = []
  for (let age = 1; age <= 85; age++) {
    g.character.age = age
    g.year = birth + age
    const before = allLines(g).length
    addFlavorLines(g)
    // R2-B2: flavor draws only from the text stream, so g.rng is the same after every one of the 85 years.
    expect(g.rng, `seed ${seed} age ${age}`).toBe(rng)
    const added = allLines(g).slice(before)
    steps.push(fnv1a(`${g.rng}|${added.join('\n')}`).toString(16).padStart(8, '0'))
  }
  return steps
}

describe('flavor golden (text stream, g.rng unchanged)', () => {
  it('matches test/fixtures/flavor-golden.json for four lives of 85 years', () => {
    const fresh: Golden = { v: 1, cases: CASES.map((c) => ({ seed: c.seed, birth: c.birth, steps: record(c.seed, c.birth) })) }
    // FLAVOR_GOLDEN=1 rewrites the fixture. Only ever run it on a flavor.ts that is known to be right.
    if (process.env.FLAVOR_GOLDEN) writeFileSync(FIXTURE, JSON.stringify(fresh, null, 1) + '\n')
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden
    expect(golden.v).toBe(1)
    expect(golden.cases.map((c) => [c.seed, c.birth])).toEqual(CASES.map((c) => [c.seed, c.birth]))
    for (const c of golden.cases) expect(c.steps).toHaveLength(85)
    for (let i = 0; i < CASES.length; i++) expect(fresh.cases[i].steps, `seed ${CASES[i].seed}`).toEqual(golden.cases[i].steps)
  })
})

/** A grown-up in a year before the first era pack, so the plain pools are the only ones in play. */
function adultGame(seed = 21): GameState {
  const g = createNewLife({ seed, year: 1990 })
  g.queue = []
  g.character.age = 25
  g.year = 2015
  return g
}

/** An eleven-year-old in 1850: no milestones (age over 8), no era pool, and the pet pool off, so only the child pool is eligible. */
function childGame(): GameState {
  const g = createNewLife({ seed: 41, year: 1950 })
  g.queue = []
  g.people = g.people.filter((p) => p.relation !== 'pet')
  g.character.age = 11
  g.year = 1850
  return g
}

function flavorKey(g: GameState): string[] | null {
  return ringRead(g, 'flavor')
}

describe('flavor memory: a v4.0.2 save', () => {
  it('excludes exactly the keys in flags.flavorRecent, then moves them into the ring and drops the old flag', () => {
    const g = childGame()
    expect(eraFlavorPools(g)).toHaveLength(0)
    const pool = FLAVOR_POOLS.child
    // The one line left over must be able to show up in any year: no era tag, no token.
    const keep = pool.findIndex((l) => !l.startsWith('@') && !l.includes('{'))
    expect(keep).toBeGreaterThanOrEqual(0)
    const legacy = pool.map((_, i) => `child:${i}`).filter((k) => k !== `child:${keep}`)
    for (let i = 0; legacy.length < 60; i++) legacy.unshift(`other:${i}`)
    expect(legacy).toHaveLength(60)
    g.flags.flavorRecent = legacy

    const before = g.log.flatMap((y) => y.entries).length
    addFlavorLines(g)

    // Every other child line was excluded, so the one left is the only line that can have been logged.
    const added = g.log.flatMap((y) => y.entries).length - before
    expect(added).toBe(1)
    expect(g.flags.flavorRecent).toBeUndefined()
    expect('flavorRecent' in g.flags).toBe(false)
    const ring = flavorKey(g)
    expect(ring).not.toBeNull()
    expect(ring!.length).toBeLessThanOrEqual(60)
    expect(ring![ring!.length - 1]).toBe(`child:${keep}`)
    // The window slid by one: the oldest legacy key fell out, the other 59 kept their order.
    expect(ring!.slice(0, -1)).toEqual(legacy.slice(1))
    expect(readTextMem(g).r.flavor!.length).toBeLessThanOrEqual(60)
  })

  it('reads the same window from the legacy flag as from the ring: same lines, same draws', () => {
    const keys = [...FLAVOR_POOLS.adult.map((_, i) => `adult:${i}`), ...FLAVOR_POOLS.work.map((_, i) => `work:${i}`), ...FLAVOR_POOLS.elder.map((_, i) => `elder:${i}`)].slice(0, 60)
    expect(keys).toHaveLength(60)
    const legacy = adultGame()
    legacy.flags.flavorRecent = [...keys]
    const ring = adultGame()
    ringWrite(ring, 'flavor', keys, 60)
    for (let i = 0; i < 20; i++) {
      for (const g of [legacy, ring]) {
        g.character.age = 25 + (i % 30)
        g.year = 2015 + i
        addFlavorLines(g)
      }
    }
    expect(ring.log).toEqual(legacy.log)
    expect(ring.rng).toBe(legacy.rng)
    expect(flavorKey(legacy)).toEqual(flavorKey(ring))
    expect(legacy.flags.flavorRecent).toBeUndefined()
  })

  it('prefers the ring when both exist, and ignores non-string legacy entries', () => {
    const g = childGame()
    ringWrite(g, 'flavor', ['child:1', 'child:2'], 60)
    g.flags.flavorRecent = ['child:3']
    addFlavorLines(g)
    const ring = flavorKey(g)!
    expect(ring.slice(0, 2)).toEqual(['child:1', 'child:2'])
    expect(ring).not.toContain('child:3')
    expect(g.flags.flavorRecent).toBeUndefined()

    const h = childGame()
    h.flags.flavorRecent = [1, null, { a: 1 }, 'child:5'] as Json
    addFlavorLines(h)
    expect(flavorKey(h)!.slice(0, 1)).toEqual(['child:5'])
    expect(flavorKey(h)!.every((k) => typeof k === 'string')).toBe(true)
  })
})

describe('flavor memory: the ring', () => {
  it('holds at most 60 keys over 120 calls and its newest entries are the keys of the lines just logged', () => {
    // Ages 9 to 85 (no toddler milestones, so every logged line is a flavor line), twice over, so the pools change and the window fills.
    const g = createNewLife({ seed: 22, year: 1925 })
    g.queue = []
    let grew = 0
    for (let i = 0; i < 120; i++) {
      g.character.age = 9 + (i % 77)
      g.year = 1925 + g.character.age
      const prior = flavorKey(g) ?? []
      const before = g.log.flatMap((y) => y.entries).length
      addFlavorLines(g)
      const added = g.log.flatMap((y) => y.entries).length - before
      const ring = flavorKey(g)
      expect(ring, `call ${i}`).not.toBeNull()
      expect(ring!.length).toBeLessThanOrEqual(60)
      expect(ring!.length).toBe(Math.min(60, prior.length + added))
      const fresh = ring!.slice(ring!.length - added)
      expect(fresh).toHaveLength(added)
      // New keys are real pool keys, were not in the window, and the rest of the window is the old tail.
      for (const k of fresh) {
        expect(prior, `call ${i}`).not.toContain(k)
        const m = /^(era:[^:]+|[a-zA-Z]+):(\d+)$/.exec(k)
        expect(m, k).not.toBeNull()
        if (!k.startsWith('era:')) expect(Number(m![2])).toBeLessThan(FLAVOR_POOLS[m![1]].length)
      }
      expect(ring!.slice(0, ring!.length - added)).toEqual(prior.slice(prior.length + added - ring!.length))
      expect(g.flags.flavorRecent).toBeUndefined()
      if (ring!.length > grew) grew = ring!.length
    }
    expect(grew).toBe(60)
    // Plain JSON: the state survives a save round trip.
    expect(JSON.parse(JSON.stringify(g.flags.textMem))).toEqual(g.flags.textMem)
  })

  it('keeps the flavor ring key short enough for the memory to store (80 characters)', () => {
    const longest = (pool: string, lines: readonly string[]) => `${pool}:${lines.length - 1}`.length
    for (const [name, lines] of Object.entries(FLAVOR_POOLS)) expect(longest(name, lines), name).toBeLessThanOrEqual(80)
    for (const pack of ERA_PACKS) for (const p of pack.flavor) expect(longest(`era:${p.key}`, p.lines), p.key).toBeLessThanOrEqual(80)
  })
})

describe('flavor memory: heirs', () => {
  it('starts every generation with an empty memory', () => {
    const g = adultGame(31)
    addFlavorLines(g)
    expect(g.flags.textMem).toBeDefined()
    g.character.age = 70
    const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName })
    killCharacter(g, 'Old Age')
    g.queue = []
    const n = continueAsChild(g, heir.id)
    expect(n).not.toBe(g)
    expect(n.generation).toBe(2)
    expect(n.flags.textMem).toBeUndefined()
    expect(n.flags.flavorRecent).toBeUndefined()
    expect(ringRead(n, 'flavor')).toBeNull()
    // The old life keeps its own memory.
    expect(ringRead(g, 'flavor')).not.toBeNull()
  })
})

describe('flavor memory: hostile rings', () => {
  const hostile: [string, Json][] = [
    ['numbers', [1, 2, 3, 1e308, -1, 0.5]],
    ['10,000 strings', Array.from({ length: 10_000 }, (_, i) => `adult:${i}`)],
    ['an object', { 0: 'adult:1', length: 3 }],
    ['strings too long to store', Array.from({ length: 70 }, (_, i) => 'x'.repeat(81) + i)],
    ['mixed junk', ['adult:1', null, 7, { a: 1 }, ['adult:2'], true, 'adult:3']],
  ]
  for (const [name, ring] of hostile) {
    it(`survives ${name} in r.flavor: no throw, the ring ends up at 60 keys or fewer, all strings`, () => {
      const g = adultGame()
      g.flags.textMem = { v: 1, p: {}, f: {}, r: { flavor: ring } }
      expect(() => addFlavorLines(g)).not.toThrow()
      const out = flavorKey(g)
      expect(out).not.toBeNull()
      expect(out!.length).toBeLessThanOrEqual(60)
      expect(out!.every((k) => typeof k === 'string' && k.length <= 80)).toBe(true)
      expect(g.flags.flavorRecent).toBeUndefined()
      // A second call still works on what the first one left.
      g.year++
      expect(() => addFlavorLines(g)).not.toThrow()
      expect(flavorKey(g)!.length).toBeLessThanOrEqual(60)
    })
  }

  it('survives a textMem that is not an object', () => {
    for (const bad of ['junk', 7, null, [1, 2], { v: 2, r: { flavor: ['adult:1'] } }] as Json[]) {
      const g = adultGame()
      g.flags.textMem = bad
      expect(() => addFlavorLines(g)).not.toThrow()
      expect(flavorKey(g)!.length).toBeLessThanOrEqual(60)
    }
  })
})
