// Text kit, part 1 (R1-T1, E.T1): pickLine, the pick that remembers. Small pools are shuffle-bags, big pools
// exclude their last picks. In R1 nothing in src/ called it, which kept its one g.rng draw harmless; R2-A3 (E.T3) ran the
// codemod, so test 11 below now says the other half: hpick and defineLines are still unused, and whoever calls pickLine
// or pickSite gets it from the kit.
// R2-B2 (the rebaseline) moved its draw off g.rng onto the text stream (text/draw.ts): tests 1, 2, 5, the single-line test and
// 8 below used to say "exactly one g.rng draw, and with an empty memory the same line as pick()". They now say what the design
// says: zero g.rng draws, one step of the text cursor per call of two or more lines, the first pick is
// lines[floor(streamUnit(key, 0) * n)], and a one-line pool draws and writes nothing.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { streamKey, streamUnit } from '../src/game/kernel/streams'
import { textCursor } from '../src/game/text/draw'
import { candidateIndexes, defineLines, familyStats, pickLine, poolHash, readTextMem, ringRead, type PoolRecall } from '../src/game/text'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

const pool = (n: number, prefix = 'line'): string[] => Array.from({ length: n }, (_, i) => `${prefix} ${i}`)

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

describe('pickLine draws from the text stream', () => {
  /** The name of the text stream of g's year, written out by hand (no fork in these games). */
  const textKey = (g: GameState): string => streamKey(g.lifeId, 'text', g.year)

  it('1: the first pick is lines[floor(streamUnit(key, 0) * n)] and g.rng does not move, for 20 lives', () => {
    for (const n of [2, 3, 5, 12, 13, 16, 40]) {
      const lines = pool(n)
      for (let life = 1; life <= 20; life++) {
        // makeTestGame has one life id, so a seed no longer varies the text: the life id does.
        const g = makeTestGame(life)
        g.lifeId = `parity-life-${life}`
        const want = lines[Math.floor(streamUnit(textKey(g), 0) * n)]
        expect(pickLine(g, lines), `n=${n} life=${life}`).toBe(want)
        expect(g.rng).toBe(life)
        expect(textCursor(g)).toEqual({ year: g.year, n: 1 })
        // A named pool takes the same first pick.
        const h = makeTestGame(life)
        h.lifeId = g.lifeId
        expect(pickLine(h, lines, 'parity.named')).toBe(want)
      }
    }
  })

  it('2: one step of the text cursor per call of two or more lines, and no g.rng draw, over 500 mixed calls', () => {
    const sizes = [1, 2, 3, 5, 12, 13, 16, 40]
    const g = makeTestGame(7)
    let draws = 0
    for (let i = 0; i < 500; i++) {
      const n = sizes[i % sizes.length]
      const lines = pool(n, 'mix' + n)
      const out = i % 3 === 0 ? pickLine(g, lines) : i % 3 === 1 ? pickLine(g, lines, 'mix.' + n) : pickLine(g, lines, '9 not a name')
      expect(lines).toContain(out)
      if (n >= 2) draws++
      expect(g.rng, `call ${i}`).toBe(7)
      expect(textCursor(g), `call ${i}`).toEqual({ year: g.year, n: draws })
    }
  })

  it('a single-line list draws nothing and writes nothing', () => {
    const g = makeTestGame(3)
    expect(pickLine(g, ['only'])).toBe('only')
    expect(pickLine(g, ['only'], 'single.name')).toBe('only')
    expect(g.rng).toBe(3)
    expect(g.flags).toEqual({})
  })
})

describe('shuffle-bags and windows', () => {
  function run(n: number, count: number, seed: number, fam: string): number[] {
    const g = makeTestGame(seed)
    const lines = pool(n)
    return Array.from({ length: count }, () => lines.indexOf(pickLine(g, lines, fam)))
  }

  it('3: a bag deals every line once per block of n, and a block never starts on the last line of the one before', () => {
    for (const n of [5, 12]) {
      for (let seed = 1; seed <= 10; seed++) {
        const picks = run(n, 60, seed, 'bag.' + n)
        for (let b = 0; b * n < 60; b++) {
          const block = picks.slice(b * n, (b + 1) * n)
          if (block.length < n) break
          expect([...block].sort((a, c) => a - c), `n=${n} seed=${seed} block=${b}`).toEqual(pool(n).map((_, i) => i))
          if (b > 0) expect(block[0], `n=${n} seed=${seed} block=${b}`).not.toBe(picks[b * n - 1])
        }
      }
    }
  })

  it('3b: a bag of 2 alternates and a bag of 3 is a permutation each time', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const two = run(2, 20, seed, 'bag.two')
      for (let i = 1; i < two.length; i++) expect(two[i]).not.toBe(two[i - 1])
      const three = run(3, 30, seed, 'bag.three')
      for (let b = 0; b < 10; b++) expect([...three.slice(b * 3, b * 3 + 3)].sort()).toEqual([0, 1, 2])
    }
  })

  it('4: 12 lines is a bag and 13 is a window', () => {
    // A bag of 12 never repeats a line inside a block of 12 (above). A window of 13 excludes only 6, so
    // within some block of 13 picks a line must come back.
    let repeated = false
    for (let seed = 1; seed <= 20 && !repeated; seed++) {
      const picks = run(13, 26, seed, 'win.thirteen')
      for (let b = 0; b < 2; b++) if (new Set(picks.slice(b * 13, b * 13 + 13)).size < 13) repeated = true
    }
    expect(repeated).toBe(true)
    for (let seed = 1; seed <= 20; seed++) {
      const picks = run(12, 36, seed, 'bag.twelve')
      for (let b = 0; b < 3; b++) expect(new Set(picks.slice(b * 12, b * 12 + 12)).size).toBe(12)
    }
  })

  it('4b: a window never repeats any of the previous min(8, n / 2) picks', () => {
    for (const n of [13, 16, 40]) {
      const k = Math.min(8, n >> 1)
      expect(k).toBe(n === 13 ? 6 : 8)
      for (let seed = 1; seed <= 8; seed++) {
        const picks = run(n, 200, seed, 'win.' + n)
        for (let i = 0; i < picks.length; i++) {
          for (let j = Math.max(0, i - k); j < i; j++) expect(picks[i], `n=${n} seed=${seed} i=${i} j=${j}`).not.toBe(picks[j])
        }
      }
    }
  })

  it('4c: a window can still use every line over time', () => {
    const picks = run(40, 400, 3, 'win.cover')
    expect(new Set(picks).size).toBeGreaterThan(35)
  })
})

describe('candidateIndexes', () => {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i)

  it('is every index with no memory', () => {
    expect(candidateIndexes(5, null)).toEqual(range(5))
    expect(candidateIndexes(40, null)).toEqual(range(40))
    expect(candidateIndexes(1, null)).toEqual([0])
  })

  it('bag: the unused indexes, then everything but the last one when the bag is empty', () => {
    expect(candidateIndexes(5, { kind: 'bag', used: 0b10101, last: 4 })).toEqual([1, 3])
    expect(candidateIndexes(5, { kind: 'bag', used: 0b11111, last: 4 })).toEqual([0, 1, 2, 3])
    expect(candidateIndexes(5, { kind: 'bag', used: 0b11111, last: -1 })).toEqual(range(5))
    expect(candidateIndexes(2, { kind: 'bag', used: 3, last: 0 })).toEqual([1])
    expect(candidateIndexes(1, { kind: 'bag', used: 1, last: 0 })).toEqual([0])
  })

  it('bag: bits and a last index beyond the pool are ignored', () => {
    expect(candidateIndexes(3, { kind: 'bag', used: 0b1111000, last: 9 })).toEqual([0, 1, 2])
    expect(candidateIndexes(3, { kind: 'bag', used: 0b1111111, last: 9 })).toEqual([0, 1, 2])
  })

  it('window: all but the last min(8, n / 2) recent picks, ignoring indexes beyond the pool', () => {
    const recent = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(candidateIndexes(40, { kind: 'window', recent })).toEqual(range(40).filter((i) => i === 0 || i > 8))
    expect(candidateIndexes(13, { kind: 'window', recent })).toEqual(range(13).filter((i) => i < 3 || i > 8))
    expect(candidateIndexes(13, { kind: 'window', recent: [1, 99, 2, 77] })).toEqual(range(13).filter((i) => i !== 1 && i !== 2))
    expect(candidateIndexes(20, { kind: 'window', recent: [] })).toEqual(range(20))
  })

  it('is never empty', () => {
    const recalls: (PoolRecall | null)[] = [
      null,
      { kind: 'bag', used: 4095, last: 0 },
      { kind: 'bag', used: 0, last: 0 },
      { kind: 'window', recent: [0, 1, 2, 3, 4, 5, 6, 7] },
      { kind: 'window', recent: [0, 0, 0, 0, 0, 0, 0, 0] },
    ]
    for (const n of [1, 2, 3, 12, 13, 14, 16, 100]) {
      for (const recall of recalls) expect(candidateIndexes(n, recall).length, `n=${n}`).toBeGreaterThan(0)
    }
  })

  it('treats a recall of the wrong kind for the pool size as empty', () => {
    expect(candidateIndexes(5, { kind: 'window', recent: [0, 1, 2] })).toEqual(range(5))
    expect(candidateIndexes(20, { kind: 'bag', used: 3, last: 1 })).toEqual(range(20))
  })
})

describe('pickLine edge cases', () => {
  it('5: a one-line list returns the line, draws nothing and writes nothing to flags; an empty list throws before drawing', () => {
    const g = makeTestGame(4)
    const rng = g.rng
    expect(pickLine(g, ['solo'])).toBe('solo')
    expect(g.flags).toEqual({})
    expect(g.rng).toBe(rng)
    const h = makeTestGame(4)
    expect(() => pickLine(h, [])).toThrow('pickLine() from empty list')
    expect(h.rng).toBe(4)
    expect(h.flags).toEqual({})
  })

  it('6: a valid fam keys the memory and the family; an invalid one falls back to the pool hash', () => {
    const lines = pool(6)
    const g = makeTestGame(2)
    pickLine(g, lines, 'greet.hello')
    const mem = readTextMem(g)
    expect(Object.keys(mem.p)).toEqual(['greet.hello'])
    expect(familyStats(g, 'greet.hello')).toEqual({ last: g.year, count10: 1 })
    pickLine(g, lines, 'greet.hello')
    expect(familyStats(g, 'greet.hello').count10).toBe(2)

    for (const bad of ['', '1abc', 'has space', '_x', 'a'.repeat(49), 'café', 'a/b']) {
      const h = makeTestGame(2)
      pickLine(h, lines, bad)
      const m = readTextMem(h)
      expect(Object.keys(m.p), JSON.stringify(bad)).toEqual([poolHash(lines)])
      expect(m.f, JSON.stringify(bad)).toEqual({})
    }
    const long = makeTestGame(2)
    pickLine(long, lines, 'a'.repeat(48))
    expect(Object.keys(readTextMem(long).p)).toEqual(['a'.repeat(48)])
  })

  it('6b: without a name, the pool hash keys the memory and no family is noted', () => {
    const g = makeTestGame(2)
    pickLine(g, pool(30), undefined)
    expect(Object.keys(readTextMem(g).p)).toEqual([poolHash(pool(30))])
    expect(readTextMem(g).f).toEqual({})
  })

  it('6c: two arrays of different sizes under one name never crash and always return a member', () => {
    const g = makeTestGame(9)
    const big = pool(40, 'big')
    const mid = pool(13, 'mid')
    const small = pool(5, 'small')
    const tiny = pool(2, 'tiny')
    for (let i = 0; i < 400; i++) {
      const lines = [big, small, mid, tiny, small, big, mid][i % 7]
      expect(lines).toContain(pickLine(g, lines, 'shared.name'))
    }
    expect(Object.keys(readTextMem(g).p)).toEqual(['shared.name'])
    expect(readTextMem(g)).toEqual(g.flags.textMem)
  })

  it('6d: a pool that shrank from 12 to 5 still deals a full cycle', () => {
    const g = makeTestGame(5)
    const twelve = pool(12)
    for (let i = 0; i < 7; i++) pickLine(g, twelve, 'shrink')
    const five = pool(5)
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) seen.add(pickLine(g, five, 'shrink'))
    expect(seen.size).toBe(5)
  })

  it('7: a registered pool uses its id as the key and notes the family; the array is frozen', () => {
    const lines = defineLines('pick.test.registered', pool(8, 'reg'))
    expect(Object.isFrozen(lines)).toBe(true)
    const g = makeTestGame(2)
    for (let i = 0; i < 5; i++) expect(lines).toContain(pickLine(g, lines))
    expect(Object.keys(readTextMem(g).p)).toEqual(['pick.test.registered'])
    expect(familyStats(g, 'pick.test.registered').count10).toBe(5)
    // An explicit name wins over the registered id.
    const h = makeTestGame(2)
    pickLine(h, lines, 'other.name')
    expect(Object.keys(readTextMem(h).p)).toEqual(['other.name'])
  })

  it('7b: a registered id that is not a valid key falls back to the pool hash', () => {
    const lines = defineLines('9 not a valid key', pool(8, 'oddid'))
    const g = makeTestGame(2)
    pickLine(g, lines)
    expect(Object.keys(readTextMem(g).p)).toEqual([poolHash(lines)])
    expect(readTextMem(g).f).toEqual({})
  })

  it('writes the memory back as valid JSON the reader accepts unchanged', () => {
    const g = makeTestGame(11)
    for (let i = 0; i < 300; i++) pickLine(g, pool(1 + (i % 40), 'p' + (i % 40)), i % 2 ? 'name.' + (i % 9) : undefined)
    expect(JSON.parse(JSON.stringify(g.flags.textMem))).toEqual(g.flags.textMem)
    expect(readTextMem(g)).toEqual(g.flags.textMem)
  })
})

describe('hostile memory', () => {
  const many = (count: number, value: Json): Record<string, Json> => Object.fromEntries(Array.from({ length: count }, (_, i) => ['k' + i, value]))
  const HOSTILE: [string, Json][] = [
    ['a string', 'junk'],
    ['an array', [1, 2, 3]],
    ['a pool with a number', { p: { x: 5 } }],
    ['wrong types everywhere', { v: 1, p: { x: 5 }, f: { y: [1] }, r: { z: 'q' } }],
    ['5,000 valid pools', { v: 1, p: many(5000, 'w1,2,3'), f: {}, r: {} }],
    ['500 families', { v: 1, p: {}, f: many(500, '2025,2026'), r: {} }],
    ['NaN', Number.NaN],
    ['a 10 MB string', 'x'.repeat(10_000_000)],
    ['a 10 MB pool value', { v: 1, p: { k: 'b'.repeat(10_000_000) }, f: {}, r: {} }],
    ['a 10 MB ring key', { v: 1, p: {}, f: {}, r: { flavor: ['x'.repeat(10_000_000)] } }],
    ['a null', null],
    ['a nested bomb', { v: 1, p: { a: { b: { c: { d: {} } } } }, f: [[[[]]]], r: { x: [[['q']]] } }],
  ]

  it('8: pickLine still works, g.rng is unchanged, and the memory ends bounded and valid', () => {
    for (const [name, value] of HOSTILE) {
      const g = makeTestGame(6)
      g.flags.textMem = value
      for (let i = 0; i < 40; i++) {
        const lines = pool(2 + (i % 30), 'h' + (i % 30))
        expect(lines, name).toContain(pickLine(g, lines, i % 2 ? 'h.' + (i % 30) : undefined))
      }
      expect(g.rng, name).toBe(6)
      expect(textCursor(g), name).toEqual({ year: g.year, n: 40 })
      const mem = readTextMem(g)
      expect(Object.keys(mem.p).length, name).toBeLessThanOrEqual(300)
      expect(Object.keys(mem.f).length, name).toBeLessThanOrEqual(120)
      expect(Object.keys(mem.r).length, name).toBeLessThanOrEqual(4)
      expect(mem, name).toEqual(g.flags.textMem)
      expect(JSON.stringify(g.flags.textMem).length, name).toBeLessThan(50_000)
    }
  })

  it('8b: 5,000 stored pools are trimmed to 300 on the next pick, newest kept', () => {
    const g = makeTestGame(6)
    g.flags.textMem = { v: 1, p: many(5000, 'w1,2,3'), f: many(500, '2025'), r: {} }
    pickLine(g, pool(20), 'fresh.pool')
    const mem = readTextMem(g)
    expect(Object.keys(mem.p)).toHaveLength(300)
    expect(Object.keys(mem.p)[299]).toBe('fresh.pool')
    expect(Object.keys(mem.p)[298]).toBe('k4999')
    expect(Object.keys(mem.f)).toHaveLength(120)
  })

  it('8c: a ring in a hostile memory is read back clean', () => {
    const g = makeTestGame(6)
    g.flags.textMem = { v: 1, p: {}, f: {}, r: { flavor: ['ok', 5, 'x'.repeat(100), 'ok2'] } }
    expect(ringRead(g, 'flavor')).toEqual(['ok', 'ok2'])
  })
})

describe('purity', () => {
  it('9: readTextMem and familyStats on a frozen state do not throw and return the same JSON twice', () => {
    const g = makeTestGame(3)
    for (let i = 0; i < 60; i++) pickLine(g, pool(2 + (i % 20)), 'frozen.' + (i % 5))
    const frozen = deepFreeze(structuredClone(g))
    expect(Object.isFrozen(frozen.flags.textMem)).toBe(true)
    const first = JSON.stringify(readTextMem(frozen))
    const second = JSON.stringify(readTextMem(frozen))
    expect(second).toBe(first)
    expect(first).toContain('frozen.0')
    expect(JSON.stringify(familyStats(frozen, 'frozen.0'))).toBe(JSON.stringify(familyStats(frozen, 'frozen.0')))
    expect(familyStats(frozen, 'frozen.0').count10).toBeGreaterThan(0)
    expect(ringRead(frozen, 'flavor')).toBeNull()
    // The copy is the caller's: it is not frozen.
    expect(Object.isFrozen(readTextMem(frozen))).toBe(false)
    expect(JSON.stringify(frozen)).toBe(JSON.stringify(g))
  })

  it('9b: the readers also survive a frozen state with no memory at all', () => {
    const frozen = deepFreeze(makeTestGame(3))
    expect(readTextMem(frozen)).toEqual({ v: 1, p: {}, f: {}, r: {} })
    expect(familyStats(frozen, 'x')).toEqual({ last: null, count10: 0 })
    expect(ringRead(frozen, 'x')).toBeNull()
  })
})

describe('generations', () => {
  it('10: continueAsChild drops the memory with the rest of the flags', () => {
    const g: GameState = makeTestGame(5, { age: 70, gender: 'female', firstName: 'Ruth', lastName: 'Stone', money: 500_000 })
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: 'Stone' })
    for (let i = 0; i < 20; i++) pickLine(g, pool(3 + (i % 10)), 'gen.' + (i % 3))
    expect(g.flags.textMem).toBeDefined()
    killCharacter(g, 'Old Age')
    const n = continueAsChild(g, kid.id)
    expect(n).not.toBe(g)
    expect(n.generation).toBe(2)
    expect(n.flags.textMem).toBeUndefined()
    expect('textMem' in n.flags).toBe(false)
    expect(g.flags.textMem).toBeDefined()
  })
})

describe('no production caller', () => {
  const SRC = fileURLToPath(new URL('../src/', import.meta.url))
  const NAMES = ['pickLine', 'hpick', 'defineLines']

  /** The source with block and line comments blanked (newlines kept), so a mention in a comment is not a call. */
  function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
  }

  /**
   * Calls of the kit's names. A file that declares one of the names itself (business/nepo-asks.ts has its own
   * local pickLine, a hash pick that long predates the kit) is calling its own helper, not the kit.
   */
  function strays(file: string, src: string, names: readonly string[] = NAMES): string[] {
    const text = code(src)
    const foreign = names.filter((n) => !new RegExp(`\\b(?:const|let|var|function)\\s+${n}\\b`).test(text))
    const call = new RegExp(`\\b(?:${foreign.join('|')})\\s*\\(`)
    const out: string[] = []
    if (!foreign.length) return out
    text.split('\n').forEach((line, i) => {
      if (call.test(line)) out.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`)
    })
    return out
  }

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return walk(full)
      return /\.tsx?$/.test(name) ? [full] : []
    })
  }

  /** The import specifiers of `name` in a file: `import { a, name, b } from './x'` gives ['./x']. */
  function importedFrom(src: string, name: string): string[] {
    const out: string[] = []
    for (const m of code(src).matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      if (m[1].split(',').some((part) => part.trim().split(/\s+as\s+/)[0] === name)) out.push(m[2])
    }
    return out
  }

  /** Files that call pickLine or pickSite without importing it from the kit (a specifier ending in text/pick or /text). */
  function wrongSource(file: string, src: string): string[] {
    const own = strays(file, src, ['pickLine', 'pickSite'])
    if (!own.length) return []
    const text = code(src)
    return ['pickLine', 'pickSite']
      .filter((n) => new RegExp(`\\b${n}\\s*[(<]`).test(text) && !new RegExp(`\\b(?:const|let|var|function)\\s+${n}\\b`).test(text))
      .filter((n) => !importedFrom(src, n).some((spec) => /(?:^|\/)text\/pick$|\/text$/.test(spec)))
      .map((n) => `${file}: ${n} is not imported from the text kit`)
  }

  it('11: nothing in src/ outside src/game/text/ calls hpick or defineLines, and pickLine and pickSite come from the kit', () => {
    const files = walk(SRC).map((f) => relative(SRC, f).split(sep).join('/')).filter((f) => !f.startsWith('game/text/'))
    expect(files.length).toBeGreaterThan(100)
    const read = (f: string): string => readFileSync(join(SRC, f), 'utf8')
    // R1-T2 uses only ringRead and ringWrite; the registry helpers stay unused outside the kit.
    expect(files.flatMap((f) => strays(f, read(f), ['hpick', 'defineLines']))).toEqual([])
    // R2-A3: the codemod made pickLine and pickSite common. Each caller imports them from the kit; business/nepo-asks.ts
    // declares its own pickLine (a hash helper) and is not a caller. The ratchet (r2-pickline-ratchet) covers which pools convert.
    expect(files.flatMap((f) => wrongSource(f, read(f)))).toEqual([])
    expect(files.filter((f) => /\bpickLine\s*\(/.test(read(f)) && !/\bconst pickLine\b/.test(read(f))).length).toBeGreaterThan(50)
  })

  it('11c: the import check names a caller that takes pickLine from somewhere else, and passes the kit and its own helper', () => {
    expect(wrongSource('a.ts', "import { pickLine } from './text/pick'\npickLine(g, L)")).toEqual([])
    expect(wrongSource('a.ts', "import { pickSite, pickLine } from '../text'\npickSite(g, L, 1)")).toEqual([])
    expect(wrongSource('a.ts', "import {\n  pickLine,\n} from '../text/pick'\nx = pickLine(g, L)")).toEqual([])
    expect(wrongSource('a.ts', "import { pickLine } from './elsewhere'\npickLine(g, L)")).toEqual(['a.ts: pickLine is not imported from the text kit'])
    expect(wrongSource('a.ts', 'pickSite(g, L, 1)')).toEqual(['a.ts: pickSite is not imported from the text kit'])
    expect(wrongSource('a.ts', 'const pickLine = (xs: string[]) => xs[0]\nreturn pickLine(L)')).toEqual([])
    expect(wrongSource('a.ts', "// pickLine(g, L) in a comment\nconst x = 1")).toEqual([])
  })

  it('11b: the scan flags a call and passes comments and look-alike names', () => {
    expect(strays('a.ts', 'const x = pickLine(g, L)\nhpick (a, 1, k, L)\nexport const A = defineLines("a", [])')).toHaveLength(3)
    expect(strays('a.ts', '// pickLine(g, L) is the new way\n/* hpick(a)\n defineLines(b) */\nconst y = 1 // pickLine(g, L)')).toEqual([])
    expect(strays('a.ts', 'const a = mypickLine(g)\npickLines(g)\nwhpick(1)\nconst b = pickLineX(2)')).toEqual([])
    // A file with its own helper of that name is not using the kit; its other names are still watched.
    expect(strays('a.ts', 'const pickLine = (xs: string[]) => xs[0]\nreturn pickLine(LIST)')).toEqual([])
    expect(strays('a.ts', 'function hpick() {}\nhpick()\npickLine(g, L)')).toEqual(['a.ts:3: pickLine(g, L)'])
  })
})
