// R2-P4 (K.7b e): every old save migrates and runs. The fixtures are the files of test/fixtures named save-*.json.gz, found by a
// directory listing, so a track that adds one (Save does) needs no edit here. For each one:
//   - migrateSave brings it up to date, the game is under the load limit of 500,000 JSON nodes, and migrating the result again
//     changes nothing;
//   - then it is played: for each reseed, YEARS times the queue is emptied and ageUp runs. After every year each number in the
//     state is finite, the state is plain JSON (no NaN, no undefined in an array, no Map, no class instance; an undefined
//     property passes, as JSON drops it), a JSON round trip gives the same text, the node count is still under the limit, and
//     the character is alive or the death was recorded (a ribbon).
// A reseed k of 0 keeps the saved rng; k above 0 puts a mix of k in g.rng, so the same old state is lived with other dice.
//
// A fixture that cannot run is the finding, not a flake: it goes to the track that owns the migration (Save).
// Env (the nightly sets both): OLD_SAVES_YEARS (default 5), OLD_SAVES_RESEEDS (default 1, the runs per fixture).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { migrateSave } from '../src/game/save-schema'
import type { GameState } from '../src/game/types'
import { countNodes, firstDiff } from '../scripts/r1-parity-lib.mjs'
import { writeMetrics } from './nightly-metrics'
import { ROOT } from './scan-kit'

const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')
const NODE_CAP = 500_000

/** A whole number from the environment, or the fallback when it is unset, empty or not a positive whole number. */
function envCount(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 ? n : fallback
}

const YEARS = envCount('OLD_SAVES_YEARS', 5)
const RESEEDS = envCount('OLD_SAVES_RESEEDS', 1)
const TIMEOUT = 120_000

const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((name) => /^save-.*\.json\.gz$/.test(name))
  .sort()

const texts = new Map<string, string>()
/** The fixture's JSON, parsed afresh every time: migrateSave changes what it is given. */
function readFixture(name: string): Record<string, unknown> {
  let text = texts.get(name)
  if (text === undefined) {
    text = gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()
    texts.set(name, text)
  }
  return JSON.parse(text) as Record<string, unknown>
}

/** The fixture brought up to date; a fixture that does not migrate fails whoever asks. */
function migrated(name: string): GameState {
  const r = migrateSave(readFixture(name))
  if (r.kind !== 'ready') throw new Error(`${name} did not migrate: ${JSON.stringify(r)}`)
  return r.game
}

/** The g.rng of reseed k: the saved one for k = 0, else a mix of k alone (a 32-bit state, as mulberry32 keeps). */
const reseeded = (saved: number, k: number): number => (k === 0 ? saved : Math.imul(k, 0x9e3779b1) | 0)

/**
 * The JSON pointer of the first value that a save would not carry back unchanged, or null. Allowed: null, a boolean, a string, a
 * finite number, an array, and an object whose prototype is Object.prototype or null, whose property may be undefined (JSON.stringify
 * drops that property, so the state reads back the same; the engine writes `hint: undefined` into popups). Not allowed: a
 * non-finite number, undefined in an array (it comes back null), a hole, a function, a symbol, a bigint, a Map, a Date or any other
 * instance.
 */
function firstNonJson(root: unknown): string | null {
  const stack: [unknown, string][] = [[root, '']]
  while (stack.length > 0) {
    const [v, at] = stack.pop()!
    if (v === null || typeof v === 'string' || typeof v === 'boolean') continue
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return `${at || '/'}: ${String(v)}`
      continue
    }
    if (typeof v !== 'object') return `${at || '/'}: ${typeof v}`
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) if (!(i in v)) return `${at}/${i}: a hole in an array`
      for (let i = v.length - 1; i >= 0; i--) stack.push([v[i], `${at}/${i}`])
      continue
    }
    const proto = Object.getPrototypeOf(v) as unknown
    if (proto !== Object.prototype && proto !== null) return `${at || '/'}: an instance of ${(proto as { constructor?: { name?: string } }).constructor?.name ?? 'a class'}`
    for (const key of Object.keys(v).reverse()) {
      const child = (v as Record<string, unknown>)[key]
      if (child !== undefined) stack.push([child, `${at}/${key}`])
    }
  }
  return null
}

/** What is wrong with the state after a year, or null: every property the header lists. */
function soundness(g: GameState): string | null {
  const bad = firstNonJson(g)
  if (bad) return `not plain finite JSON at ${bad}`
  const text = JSON.stringify(g)
  if (JSON.stringify(JSON.parse(text)) !== text) return 'a JSON round trip changes the text'
  const nodes = countNodes(g)
  if (nodes >= NODE_CAP) return `${nodes} JSON nodes, at or over the limit of ${NODE_CAP}`
  if (!g.character.alive && typeof g.ribbon !== 'string') return 'the character died and no ribbon was recorded'
  return null
}

let fixturesRun = 0
let yearsPlayed = 0
let failures = 0

/** Runs a body and counts a throw as a failure for the metrics (the throw goes on to fail the test). */
function counted(body: () => void): void {
  try {
    body()
  } catch (e) {
    failures++
    throw e
  }
}

afterAll(() => {
  writeMetrics('old-saves', { 'oldsaves.fixtures.sum': fixturesRun, 'oldsaves.years.sum': yearsPlayed, 'oldsaves.failures.sum': failures })
})

describe('old save fixtures: the list', () => {
  it('finds at least one, and the v2.4.0 save every earlier release ships is among them', () => {
    expect(FIXTURES.length).toBeGreaterThan(0)
    expect(FIXTURES).toContain('save-v1.json.gz')
  })

})

describe('the soundness check can fail', () => {
  const clean = (): GameState => migrated('save-v1.json.gz')

  it('accepts a migrated fixture', () => {
    expect(soundness(clean())).toBeNull()
  })

  it('names a NaN, an undefined, a Map, a Date and a hole', () => {
    const cases: [string, (g: GameState) => void, RegExp][] = [
      ['NaN', (g) => void (g.character.money = NaN), /\/character\/money: NaN/],
      ['Infinity', (g) => void (g.flags.x = Infinity as never), /\/flags\/x: Infinity/],
      ['undefined in an array', (g) => void (g.flags.u = [undefined] as never), /\/flags\/u\/0: undefined/],
      ['Map', (g) => void (g.flags.m = new Map() as never), /\/flags\/m: an instance of Map/],
      ['Date', (g) => void (g.flags.d = new Date(0) as never), /\/flags\/d: an instance of Date/],
      ['hole', (g) => void (g.flags.h = new Array(3) as never), /\/flags\/h\/0: a hole/],
    ]
    for (const [name, mutate, expected] of cases) {
      const g = clean()
      mutate(g)
      expect(soundness(g), name).toMatch(expected)
    }
  })

  it('lets an undefined property through, as JSON.stringify drops it and the state reads back the same', () => {
    const g = clean()
    g.flags.p = { kept: 1, dropped: undefined } as never
    expect(soundness(g)).toBeNull()
  })

  it('names a death with no ribbon, and a state at the node limit', () => {
    const dead = clean()
    dead.character.alive = false
    dead.ribbon = null
    expect(soundness(dead)).toMatch(/no ribbon/)
    const big = clean()
    big.flags.filler = Array.from({ length: NODE_CAP }, () => 0) as never
    expect(soundness(big)).toMatch(/JSON nodes/)
  })

  it('reseeds: 0 keeps the saved state, others differ from each other and from it', () => {
    expect(reseeded(12345, 0)).toBe(12345)
    expect(new Set([reseeded(12345, 1), reseeded(12345, 2), reseeded(12345, 3), 12345]).size).toBe(4)
    expect(reseeded(1, 5)).toBe(reseeded(99, 5))
  })
})

describe.each(FIXTURES)('old save %s', (name) => {
  it(
    'migrates to a ready game under the node limit, and migrating it again changes nothing',
    () =>
      counted(() => {
        const first = migrateSave(readFixture(name))
        expect(first.kind, `${name} did not migrate: ${JSON.stringify(first)}`).toBe('ready')
        if (first.kind !== 'ready') return
        expect(countNodes(first.game)).toBeLessThan(NODE_CAP)
        const again = migrateSave(structuredClone(first.game))
        expect(again.kind).toBe('ready')
        if (again.kind !== 'ready') return
        expect(firstDiff(first.game, again.game)).toBeNull()
        fixturesRun++
      }),
    TIMEOUT,
  )

  it.each(Array.from({ length: RESEEDS }, (_, k) => k))(
    `runs ${YEARS} years from reseed %i, sound after every one`,
    (k) =>
      counted(() => {
        const g = migrated(name)
        g.rng = reseeded(g.rng, k)
        for (let y = 1; y <= YEARS; y++) {
          g.queue = []
          ageUp(g)
          yearsPlayed++
          const problem = soundness(g)
          if (problem) throw new Error(`${name}, reseed ${k}, year ${y} (age ${g.character.age}, ${g.year}): ${problem}`)
          if (!g.character.alive) break
        }
      }),
    TIMEOUT,
  )
})
