// R2-L18 (A.K1, A.K2): the acceptance no single task of the ledger and world track owns. The oldest fixture runs five years with a
// world it never had, twelve hostile worlds load and stay bounded (RF4), a replay, a reload and a Time Machine fork give the same
// state byte for byte (RF5, the world half), an heir keeps every shard (RF3), every dollar the player holds is booked (strict drift,
// opt in) and the two docs name what the code has (docs/LEDGER.md, docs/WORLD.md).
//
// The strict drift run is opt in and long (forty lives of a hundred years, about 9 minutes on one worker). LEDGER_STRICT=1 plays all
// forty; LEDGER_STRICT=i/n plays slice i of n, so in four slices, one after another:
//   LEDGER_STRICT=1/4 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/world-acceptance.test.ts -t "strict drift"
// and then 2/4, 3/4 and 4/4. It does not use the CI seed-slice kit (SLICE): CI never runs it, so the file is not a sliced file.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { bindMoneyContext } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { acctBalance, checkLedger, normalizeLedger, peekLedger, playerAcct } from '../src/game/kernel/ledger'
import { BURNS, MINTS, REASONS } from '../src/game/kernel/reasons'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import { loadSnapshot, memorySnapshotBackend, setSnapshotBackend, snapshotWritesSettled, startTimeline, takeSnapshot } from '../src/game/save'
import type { GameState } from '../src/game/types'
import { WORLD_NODE_CAP } from '../src/game/world/caps'
import { worldProblems } from '../src/game/world/invariants'
import '../src/game/world/shards'
import { readWorld, shardNames } from '../src/game/world/state'
import { LEDGER_SEEDS, runLedgerLife } from './ledger-probe'
import { playLife } from './play-kit'
import { probeLife } from './probe-life'

const ROOT = join(__dirname, '..')

/** The oldest fixture: a schema 1 save written by v2.6.0 (six tests call it "the v4.0.2 fixture"). A fresh parse every time. */
function fixtureRaw(): Record<string, unknown> {
  return JSON.parse(gunzipSync(readFileSync(join(ROOT, 'test', 'fixtures', 'save-v1.json.gz'))).toString()) as Record<string, unknown>
}

function loaded(raw: unknown): GameState {
  const result = migrateSave(raw)
  if (result.kind !== 'ready') throw new Error(`the save did not load: ${result.kind}`)
  return result.game
}

/** One year the way a test plays it: no popup in the way. */
function year(g: GameState): void {
  g.queue = []
  ageUp(g)
}

function years(g: GameState, n: number): void {
  for (let i = 0; i < n; i++) year(g)
}

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
function nodes(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const item = stack.pop()
    n++
    if (item !== null && typeof item === 'object') for (const kid of Array.isArray(item) ? item : Object.values(item)) stack.push(kid)
  }
  return n
}

/** JSON with the keys of every object sorted: the content of a state, whatever order its parts were first written in. */
const canonical = (x: unknown): string =>
  JSON.stringify(x, (_key, v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v))

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The oldest fixture

describe('the oldest fixture, a save from before the ledger and the world', () => {
  it('loads, reads an absent world as empty and an absent ledger as the empty books', () => {
    const raw = fixtureRaw()
    expect(raw).not.toHaveProperty('world')
    const g = loaded(raw)
    expect(g.world).toBeUndefined()
    expect(readWorld(g)).toEqual({ v: 1 })
    expect(peekLedger(g)).toEqual(normalizeLedger(undefined))
    expect(peekLedger(g).k).toBe(0)
    // Reading wrote nothing.
    expect(g.world).toBeUndefined()
  })

  it('plays five years: the books balance, the world is indexed and stamped, and money was booked', () => {
    const g = loaded(fixtureRaw())
    const start = g.year
    for (let i = 0; i < 5; i++) {
      expect(() => year(g), `year ${i + 1}`).not.toThrow()
    }
    expect(g.year).toBe(start + 5)
    expect(g.character.alive).toBe(true)
    const books = checkLedger(g)
    expect(books.problems).toEqual([])
    expect(books.ok).toBe(true)
    expect(worldProblems(g)).toEqual([])
    expect(g.world?.y).toBe(g.year)
    expect(peekLedger(g).k).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Hostile worlds (RF4)

const NEVER_MADE = 'a world that no game wrote'

/** A valid, empty ledger shard to build the hostile ledgers from. */
const ledger = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ v: 1, y: 2029, a: {}, m: {}, b: {}, ym: {}, yb: {}, f: {}, r: [], c: [], l: [], k: 0, ...over })

interface Hostile {
  name: string
  /** The value for `world`. `room` is how many nodes the save may still add before the loader's cap. */
  make: (room: number) => unknown
}

const HOSTILE: Hostile[] = [
  { name: 'a number', make: () => 42 },
  { name: 'a string', make: () => NEVER_MADE },
  { name: 'an array', make: () => [1, 2, { v: 1 }] },
  { name: 'a future version', make: () => ({ v: 2, ledger: ledger() }) },
  {
    name: 'a ledger of 50,000 accounts',
    make: () => ({ v: 1, ledger: ledger({ a: Object.fromEntries(Array.from({ length: 50_000 }, (_, i) => [`person:s${i}`, i % 2 === 0 ? 7 : -7])) }) }),
  },
  {
    name: 'a people shard of 500 rows',
    make: () => ({ v: 1, people: { v: 1, over: 0, rows: Array.from({ length: 500 }, (_, i) => ({ id: `person:s${i}`, seen: 2020 })) } }),
  },
  { name: 'balances of 1e300 and minus 1e300', make: () => ({ v: 1, ledger: ledger({ a: { 'person:me1': 1e300, 'pool:other': -1e300 } }) }) },
  { name: 'a ledger whose identity is broken', make: () => ({ v: 1, ledger: ledger({ a: { 'person:me1': 5_000 } }) }) },
  { name: 'a holdings shard whose shares sum to 7', make: () => ({ v: 1, holdings: { v: 1, y: 2029, rows: [['person:me1', 'firm:biz1', 7]] } }) },
  { name: 'an lod shard of strings', make: () => ({ v: 1, lod: { v: 1, y: '2029', pooled: { person: '3', firm: '2', home: '1' }, demoted: '5' } }) },
  {
    name: 'a __proto__ key',
    make: () => JSON.parse('{"v":1,"__proto__":{"v":1,"ledger":{"v":1}},"people":{"v":1,"over":0,"rows":[]}}') as unknown,
  },
  {
    name: 'an unknown shard that fills the save',
    make: (room) => ({ v: 1, junk: { v: 1, rows: Array.from({ length: Math.min(499_000, room - 10) }, () => 1) } }),
  },
]

describe('hostile worlds put into the oldest fixture (RF4)', () => {
  it('has twelve of them', () => {
    expect(HOSTILE).toHaveLength(12)
  })

  it.each(HOSTILE.map((h) => [h.name, h] as const))('%s: loads, three years play, the world ends bounded and the books hold', (_name, hostile) => {
    const raw = fixtureRaw()
    const room = 500_000 - nodes(raw)
    raw.world = hostile.make(room)
    const g = loaded(raw)
    expect(isLoadableGame(g)).toBe(true)
    for (let i = 1; i <= 3; i++) {
      expect(() => year(g), `year ${i}`).not.toThrow()
      expect(g.character.alive, `alive after year ${i}`).toBe(true)
      expect(nodes(g.world), `world nodes after year ${i}`).toBeLessThan(WORLD_NODE_CAP)
      // Nothing the game does not know survives the first year.
      const known = new Set(['v', 'y', ...shardNames()])
      expect(Object.keys(g.world ?? {}).filter((k) => !known.has(k)), `unknown keys after year ${i}`).toEqual([])
      const books = checkLedger(g, { allowHeal: true })
      expect(books.problems, `books after year ${i}`).toEqual([])
      expect(books.ok).toBe(true)
    }
    // Whatever the world was, it is a world now.
    expect(readWorld(g).v).toBe(1)
    expect(worldProblems(g, { live: false }).filter((p) => !p.startsWith('ledger: '))).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3 to 5. Replay, reload and fork

/**
 * The lives of tests 3 to 5, each a function so that a test gets its own copy to play on. The first is the plan's replay life (it
 * dies at 37, which a replay must reproduce too); the others live on: a plain life from 1990, and a founder with two companies,
 * so that the firms, the holdings and the homes of the world have something in them. The seeds are constants of the probe kit.
 */
const REPLAYED = { seed: LEDGER_SEEDS[30]!, birthYear: 1990, untilAge: 45 } as const
const SUBJECTS: readonly (readonly [string, () => GameState])[] = [
  ['a plain life from 1990', () => playLife({ seed: LEDGER_SEEDS[1]!, birthYear: 1990, untilAge: 45 }).g],
  ['a founder of two companies', () => probeLife({ seed: LEDGER_SEEDS[8]!, birthYear: 1950, businesses: 2, years: 15, keepAlive: true })],
]

describe('replay, reload and fork give the same state', () => {
  it('plays a seeded life twice to the same JSON, the world and the books included', () => {
    const a = playLife({ ...REPLAYED }).g
    const b = playLife({ ...REPLAYED }).g
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    expect(peekLedger(a).k).toBeGreaterThan(0)
    for (const [name, make] of SUBJECTS) {
      const x = make()
      const y = make()
      expect(JSON.stringify(y), name).toBe(JSON.stringify(x))
      expect(x.world?.y, name).toBe(x.year)
    }
  }, 300_000)

  describe.each(SUBJECTS)('%s', (_name, make) => {
    let first: GameState

    beforeAll(() => {
      first = make()
      bindMoneyContext(first)
      expect(first.character.alive).toBe(true)
      expect(peekLedger(first).k).toBeGreaterThan(0)
    }, 300_000)

    it('reloads through the save loader and plays five more years exactly as the original does', () => {
      const json = JSON.stringify(first)
      const back = loaded(JSON.parse(json))
      expect(JSON.stringify(back)).toBe(json)
      const original = structuredClone(first)
      bindMoneyContext(original)
      years(original, 5)
      bindMoneyContext(back)
      years(back, 5)
      expect(back.year).toBeGreaterThan(first.year)
      expect(JSON.stringify(back)).toBe(JSON.stringify(original))
      expect(checkLedger(back).problems).toEqual([])
    }, 300_000)

    it('forks through the Time Machine: the restored state is the one that was saved, and three years from each agree', async () => {
      const g = structuredClone(first)
      setSnapshotBackend(memorySnapshotBackend())
      try {
        startTimeline(g.lifeId, null)
        await snapshotWritesSettled()
        expect(await takeSnapshot(g)).toBe(true)
        const restored = await loadSnapshot(g.lifeId, g.character.age)
        expect(restored).not.toBeNull()
        expect(canonical(restored)).toBe(canonical(g))
        expect(restored!.world).toEqual(g.world)
        bindMoneyContext(g)
        years(g, 3)
        bindMoneyContext(restored)
        years(restored!, 3)
        expect(canonical(restored)).toBe(canonical(g))
      } finally {
        setSnapshotBackend(null)
      }
    }, 300_000)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. Heirs

describe('the heir of a 40-year life with three companies keeps the world (RF3)', () => {
  it('keeps every shard, folds the dead player\'s account and leaves the world sound', () => {
    const g = probeLife({ seed: LEDGER_SEEDS[8]!, birthYear: 1950, businesses: 3, years: 40, keepAlive: true })
    expect(g.character.alive).toBe(true)
    expect(g.assets.filter((a) => a.kind === 'business').length).toBeGreaterThanOrEqual(1)
    const child = createPerson(g, { relation: 'child', age: 26, lastName: g.character.lastName, relationship: 80 })
    killCharacter(g, 'Old Age')
    g.queue = []
    const late = structuredClone(g)
    const deadAcct = playerAcct(late)
    const held = acctBalance(late, deadAcct)
    expect(held, 'the dead player has an account with something in it').not.toBe(0)
    const shards = Object.keys(readWorld(late)).filter((k) => k !== 'v' && k !== 'y')
    expect(shards).toEqual(expect.arrayContaining(['ledger', 'people', 'firms']))

    const heir = continueAsChild(g, child.id)
    expect(heir.character.id).toBe(child.id)
    const kept = Object.keys(readWorld(heir))
    for (const name of shards) expect(kept, `shard ${name}`).toContain(name)
    expect(acctBalance(heir, deadAcct), 'the dead player\'s account was folded').toBe(0)
    expect(worldProblems(heir)).toEqual([])
    expect(checkLedger(heir).problems).toEqual([])
    expect(heir.world?.y).toBe(heir.year)
  }, 300_000)
})

// ---------------------------------------------------------------------------------------------------------------------------
// 7. Strict drift (opt in)

const STRICT = process.env.LEDGER_STRICT ?? ''

/** The seeds this run plays: all forty for `1`, the contiguous share `i` of `n` for `i/n` (1-based), none for anything else. */
function strictLives(raw: string = STRICT): number[] {
  if (raw === '1') return [...LEDGER_SEEDS]
  const m = /^([1-9]\d?)\/([1-9]\d?)$/.exec(raw)
  const i = m ? Number(m[1]) - 1 : -1
  const n = m ? Number(m[2]) : 0
  if (!m || i >= n) return []
  return LEDGER_SEEDS.slice(Math.floor((i * LEDGER_SEEDS.length) / n), Math.floor(((i + 1) * LEDGER_SEEDS.length) / n))
}

describe('the strict run chooses its lives', () => {
  it('plays all forty for 1, a contiguous share for i/n, and nothing for anything else', () => {
    expect(strictLives('1')).toEqual([...LEDGER_SEEDS])
    const quarters = ['1/4', '2/4', '3/4', '4/4'].map((q) => strictLives(q))
    expect(quarters.map((q) => q.length)).toEqual([10, 10, 10, 10])
    expect(quarters.flat()).toEqual([...LEDGER_SEEDS])
    expect(strictLives('1/20')).toEqual(LEDGER_SEEDS.slice(0, 2))
    for (const bad of ['', '0', 'yes', '0/4', '5/4', '1/0', '1/100', '1/4/2', ' 1/4']) expect(strictLives(bad), bad).toEqual([])
  })
})

describe.skipIf(STRICT === '' || STRICT === '0')('strict drift: every change of the player\'s cash is booked (LEDGER_STRICT)', () => {
  const mine = strictLives()
  const played: number[] = []

  it('has lives to play: LEDGER_STRICT is 1 or i/n', () => {
    expect(mine.length, `LEDGER_STRICT=${STRICT}`).toBeGreaterThan(0)
  })

  it.each(mine)('plays seed %i with no drift', async (seed) => {
    const row = await runLedgerLife(seed)
    played.push(seed)
    const where = row.ledger.firstDrift
    const first = where ? `first in ${where.year} at age ${where.age}, ${where.delta} dollars` : 'none'
    console.info(`ledger strict: seed ${seed} ${row.years} years, ${row.ledger.bookings} bookings, drift ${row.ledger.drift}, first drift ${first}`)
    expect(row.failures, `seed ${seed}`).toEqual([])
    expect(row.ledger.drift, `seed ${seed}: drift ${row.ledger.drift}, first drift ${first}`).toBe(0)
  }, 300_000)

  it('played every life of its share', () => {
    expect(played).toEqual(mine)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 8. The docs

/** Every file of src/ (repo-relative, forward slashes) that is TypeScript. */
function sources(dir = 'src'): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sources(rel))
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(relative(ROOT, join(ROOT, rel)).split(sep).join('/'))
  }
  return out
}

/** The text of one `## ` section of a doc, from its heading to the next one. */
function section(doc: string, heading: string): string {
  const start = doc.indexOf(`## ${heading}`)
  if (start < 0) return ''
  const next = doc.indexOf('\n## ', start + 1)
  return doc.slice(start, next < 0 ? undefined : next)
}

describe('the docs name what the code has', () => {
  const ledgerDoc = existsSync(join(ROOT, 'docs', 'LEDGER.md')) ? readFileSync(join(ROOT, 'docs', 'LEDGER.md'), 'utf8') : ''
  const worldDoc = existsSync(join(ROOT, 'docs', 'WORLD.md')) ? readFileSync(join(ROOT, 'docs', 'WORLD.md'), 'utf8') : ''

  it('has both docs', () => {
    expect(ledgerDoc.length).toBeGreaterThan(2_000)
    expect(worldDoc.length).toBeGreaterThan(2_000)
  })

  it('lists every reason, every mint and every burn in docs/LEDGER.md', () => {
    const missing = [
      ...Object.keys(REASONS).filter((k) => !ledgerDoc.includes(`\`${k}\``)),
      ...Object.keys(MINTS).filter((k) => !ledgerDoc.includes(`mint:${k}`)),
      ...Object.keys(BURNS).filter((k) => !ledgerDoc.includes(`burn:${k}`)),
    ]
    expect(missing).toEqual([])
  })

  it('lists every registered shard in docs/WORLD.md', () => {
    expect(shardNames().length).toBeGreaterThanOrEqual(6)
    expect(shardNames().filter((name) => !worldDoc.includes(`\`${name}\``))).toEqual([])
  })

  it('lists every ledger-ok marker of src/ and every file of the ratchet baseline under "Known unbooked writers"', () => {
    const known = section(ledgerDoc, 'Known unbooked writers')
    expect(known.length).toBeGreaterThan(200)
    const markers = sources().filter((path) => readFileSync(join(ROOT, path), 'utf8').includes('ledger-ok:'))
    expect(markers.length).toBeGreaterThan(0)
    expect(markers.filter((path) => !known.includes(path))).toEqual([])
    const baseline = JSON.parse(readFileSync(join(ROOT, 'test', 'money-ratchet.json'), 'utf8')) as { files: Record<string, unknown> }
    expect(Object.keys(baseline.files).filter((path) => !known.includes(path))).toEqual([])
  })

  it('has no dash and no emoji in either doc', () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    const emoji = /\p{Extended_Pictographic}/u
    for (const [name, doc] of [['docs/LEDGER.md', ledgerDoc], ['docs/WORLD.md', worldDoc]] as const) {
      const lines = doc.split('\n')
      expect(lines.flatMap((line, i) => (dash.test(line) ? [`${name}:${i + 1}`] : []))).toEqual([])
      expect(lines.flatMap((line, i) => (emoji.test(line) ? [`${name}:${i + 1}`] : []))).toEqual([])
    }
  })
})
