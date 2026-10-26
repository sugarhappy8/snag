// ci: fast
// R2-B2 (D1, D3, D5): the text stream. Text draws no longer come from g.rng. A counter in flags.textMem.c ('<year>,<n>') picks the
// n-th value of the stream named by the life, the outcome tag and the year (kernel/streams.ts textUnit), so "the n-th text draw of
// year Y" is a pure function. These cases pin that: g.rng is never touched, the cursor moves once per real draw, a one-line pool
// draws nothing, reload, replay and a structuredClone continue identically, a Time Machine jump re-rolls the year it lands in,
// an heir starts fresh, and a hostile cursor or memory is repaired and stays bounded.
import { describe, expect, it } from 'vitest'
import { killCharacter } from '../src/game/death'
import { outcomeTag } from '../src/game/kernel/forks'
import { streamUnit } from '../src/game/kernel/streams'
import { continueAsChild, createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { migrateSave } from '../src/game/save-schema'
import { arriveInPast } from '../src/game/timeMachine'
import { readTextMem, writableTextMem } from '../src/game/text/memory'
import { pickLine, pickSite, withPickMode } from '../src/game/text/pick'
import { skipTextDraws, textCursor, textLineId, textRand, textRng } from '../src/game/text/draw'
import type { GameState, Json } from '../src/game/types'
import { makeTestGame } from './helpers'
import { playLife } from './play-kit'

const pool = (n: number, prefix = 'line'): string[] => Array.from({ length: n }, (_, i) => `${prefix} ${i}`)

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v as object)) deepFreeze(x)
  }
  return v
}

/** Every value in a JSON tree, containers and leaves alike. */
function nodes(v: unknown): number {
  if (v === null || typeof v !== 'object') return 1
  let n = 1
  for (const x of Object.values(v)) n += nodes(x)
  return n
}

/** The name of the text stream of `year`, written out by hand: life id, outcome tag, tag 'text', year, empty id, joined with U+001F. */
function handKey(g: Pick<GameState, 'lifeId' | 'flags'>, year: number): string {
  return [g.lifeId + outcomeTag(g, year), 'text', String(year), ''].join('\u001f')
}

/** A life of one seed played to age 10 through the real loop. */
const LIFE = [21, 1990] as const

describe('the text stream and its cursor', () => {
  it('1: 500 mixed pickLine and pickSite calls leave g.rng alone and move the cursor once per call of two or more lines', () => {
    const sizes = [1, 2, 3, 12, 13, 40]
    const g = makeTestGame(7)
    let draws = 0
    for (let i = 0; i < 500; i++) {
      const n = sizes[i % sizes.length]
      const lines = pool(n, 'mix' + n)
      const out = i % 2 === 0 ? pickLine(g, lines, i % 4 === 0 ? 'mix.' + n : undefined) : pickSite(g, lines, 0x1000 + n)
      expect(lines).toContain(out)
      if (n >= 2) draws++
      expect(g.rng, `call ${i}`).toBe(7)
      expect(textCursor(g), `call ${i}`).toEqual({ year: g.year, n: draws })
    }
    expect(draws).toBeGreaterThan(400)
  })

  it('2: a one-line pool draws nothing and writes nothing, whatever the name or the site', () => {
    const g = makeTestGame(3)
    expect(pickLine(g, ['only'])).toBe('only')
    expect(pickLine(g, ['only'], 'single.name')).toBe('only')
    expect(pickSite(g, ['only'], 12345)).toBe('only')
    expect(g.rng).toBe(3)
    expect(g.flags).toEqual({})
    expect(textCursor(g)).toEqual({ year: g.year, n: 0 })
  })

  it('2b: an empty list throws before anything is drawn or written', () => {
    const g = makeTestGame(3)
    expect(() => pickLine(g, [])).toThrow('pickLine() from empty list')
    expect(() => pickSite(g, [], 1)).toThrow('pickSite() from empty list')
    expect(g.rng).toBe(3)
    expect(g.flags).toEqual({})
  })

  it('3: the cursor restarts at 0 in a new year, and textCursor is a pure read of a frozen state', () => {
    const g = makeTestGame(1)
    for (let i = 0; i < 3; i++) pickLine(g, pool(5))
    expect(textCursor(g)).toEqual({ year: 2026, n: 3 })
    g.year = 2027
    expect(textCursor(g)).toEqual({ year: 2027, n: 0 })
    pickLine(g, pool(5))
    expect(g.flags.textMem).toMatchObject({ c: '2027,1' })
    // Going back to a year the cursor has left reads as a fresh year.
    g.year = 2026
    expect(textCursor(g)).toEqual({ year: 2026, n: 0 })
    g.year = 2027
    const before = JSON.stringify(g)
    const frozen = deepFreeze(structuredClone(g))
    expect(textCursor(frozen)).toEqual({ year: 2027, n: 1 })
    expect(textCursor(frozen)).toEqual({ year: 2027, n: 1 })
    expect(JSON.stringify(frozen)).toBe(before)
    expect(textCursor(deepFreeze(makeTestGame(1)))).toEqual({ year: 2026, n: 0 })
  })

  it('4: the n-th draw of a year is streamUnit of the hand-written key, with and without a Time Machine fork', () => {
    const CASES: ({ year: number; salt: string }[] | undefined)[] = [undefined, [{ year: 2020, salt: 'abc' }], [{ year: 2020, salt: 'abc' }, { year: 2026, salt: 'k7' }]]
    for (const forks of CASES) {
      const g = makeTestGame(3)
      g.lifeId = 'life-x'
      if (forks) g.flags.timelineForks = forks.map((f) => ({ year: f.year, salt: f.salt }))
      const key = handKey(g, 2026)
      for (let n = 0; n < 12; n++) expect(textRand(g), `n=${n}`).toBe(streamUnit(key, n))
      expect(g.rng).toBe(3)
      // A fork after the year does not touch it; one at or before it does (outcomeTag looks at year + 1).
      if (forks && forks.length === 1) expect(key.startsWith('life-x~abc')).toBe(true)
      if (forks && forks.length === 2) expect(key.startsWith('life-x~k7')).toBe(true)
      if (!forks) expect(key.startsWith('life-x\u001f')).toBe(true)
    }
    // The first pick of a pool on an empty memory is lines[floor(unit * n)], for every pool size.
    for (const n of [2, 3, 5, 12, 13, 16, 40]) {
      const g = makeTestGame(9)
      const lines = pool(n)
      expect(pickLine(g, lines, 'hand.' + n)).toBe(lines[Math.floor(streamUnit(handKey(g, 2026), 0) * n)])
      const h = makeTestGame(9)
      expect(pickSite(h, lines, 77)).toBe(lines[Math.floor(streamUnit(handKey(h, 2026), 0) * n)])
    }
  })

  it('5: reload and structuredClone continue with the same lines and the same cursor', () => {
    const g = createNewLife({ seed: LIFE[0], year: LIFE[1] })
    const sizes = [2, 5, 13, 40, 3, 12]
    const step = (x: GameState, i: number): string => pickLine(x, pool(sizes[i % sizes.length], 'rl' + (i % sizes.length)), 'reload.' + (i % 4))
    for (let i = 0; i < 9; i++) step(g, i)
    expect(textCursor(g).n).toBe(9)

    const res = migrateSave(JSON.parse(JSON.stringify(g)))
    if (res.kind !== 'ready') throw new Error('expected a ready save, got ' + res.kind)
    const reloaded = res.game
    const cloned = structuredClone(g)
    expect(textCursor(reloaded)).toEqual(textCursor(g))
    expect(textCursor(cloned)).toEqual(textCursor(g))

    for (let i = 9; i < 60; i++) {
      const want = step(g, i)
      expect(step(reloaded, i), `reload ${i}`).toBe(want)
      expect(step(cloned, i), `clone ${i}`).toBe(want)
    }
    expect(JSON.stringify(reloaded.flags.textMem)).toBe(JSON.stringify(g.flags.textMem))
    expect(JSON.stringify(cloned.flags.textMem)).toBe(JSON.stringify(g.flags.textMem))
    expect(reloaded.rng).toBe(g.rng)
  })

  it('6: replay: two fresh lives of one seed give identical JSON after 10 years, and the text stream was used', () => {
    const a = playLife({ seed: LIFE[0], birthYear: LIFE[1], untilAge: 10 }).g
    const b = playLife({ seed: LIFE[0], birthYear: LIFE[1], untilAge: 10 }).g
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.character.age).toBe(10)
    expect(readTextMem(a).c).toMatch(/^\d{4},\d+$/)
  })

  it('7: Time Machine: the jumped-to year draws new text, every earlier year draws what it drew, and the cursor carries on', () => {
    const snaps = new Map<number, GameState>()
    const { g } = playLife({ seed: LIFE[0], birthYear: LIFE[1], untilAge: 8, onYear: (x, n) => void snaps.set(n, structuredClone(x)) })
    const snap = snaps.get(3)!
    expect(g.year).toBeGreaterThan(snap.year)
    const back = arriveInPast(g, snap)
    expect(back.year).toBe(snap.year)

    for (let n = 0; n < 6; n++) {
      // The year it jumped to: new luck. Every year before it: the original luck.
      expect(streamUnit(handKey(back, snap.year), n)).not.toBe(streamUnit(handKey(g, snap.year), n))
      expect(streamUnit(handKey(back, snap.year - 1), n)).toBe(streamUnit(handKey(g, snap.year - 1), n))
      expect(streamUnit(handKey(back, snap.year - 2), n)).toBe(streamUnit(handKey(g, snap.year - 2), n))
    }
    // The draws made so far stay counted: the jump neither rewinds nor resets the cursor.
    expect(textCursor(back)).toEqual(textCursor(snap))
    // And through the real picks: the same pools after the jump read a different text stream than a snapshot that never jumped.
    const stay = structuredClone(snap)
    const picks = (x: GameState): string[] => Array.from({ length: 8 }, (_, i) => pickLine(x, pool(40, 'tm'), 'tm.pool' + (i % 2)))
    expect(picks(back)).not.toEqual(picks(stay))
    // arriveInPast stirs g.rng by design; the text does not depend on it, so two copies with different dice read the same lines.
    const dice = structuredClone(back)
    dice.rng = back.rng ^ 0x5a5a5a
    expect(picks(dice)).toEqual(picks(structuredClone(back)))
  })

  it('8: an heir has a fresh cursor and a stream of its own, year for year', () => {
    const g: GameState = makeTestGame(5, { age: 70, gender: 'female', firstName: 'Ruth', lastName: 'Stone', money: 500_000 })
    const kid = createPerson(g, { relation: 'child', age: 30, lastName: 'Stone' })
    for (let i = 0; i < 12; i++) pickLine(g, pool(3 + (i % 10)), 'heir.' + (i % 3))
    expect(textCursor(g).n).toBe(12)
    killCharacter(g, 'Old Age')
    const heir = continueAsChild(g, kid.id)
    expect(heir.lifeId).not.toBe(g.lifeId)
    expect(textCursor(heir)).toEqual({ year: heir.year, n: 0 })
    expect(heir.flags.textMem).toBeUndefined()
    for (const year of [heir.year, heir.year + 1, heir.year + 7]) {
      for (let n = 0; n < 8; n++) expect(streamUnit(handKey(heir, year), n), `${year} n=${n}`).not.toBe(streamUnit(handKey(g, year), n))
    }
    // Real picks of one pool in one year: the two lives do not read the same lines.
    const parent = makeTestGame(5)
    const child = makeTestGame(5)
    child.lifeId = heir.lifeId
    const seq = (x: GameState): string[] => Array.from({ length: 10 }, () => pickLine(x, pool(40, 'hp'), 'heir.same'))
    expect(seq(child)).not.toEqual(seq(parent))
  })

  const BAD_CURSORS: [string, unknown][] = [
    ['a word', 'x'],
    ['a trailing comma', '1,'],
    ['an eight digit year', '99999999,1'],
    ['a ten digit count', '2026,1234567890'],
    ['a negative year', '-5,1'],
    ['a decimal', '2026,1.5'],
    ['a number', 5],
    ['an object', { a: 1 }],
    ['an array', ['2026,1']],
    ['null', null],
    ['a 10 MB string', 'x'.repeat(10_000_000)],
  ]

  it('9: a hostile cursor reads as empty and the next draw repairs it', () => {
    for (const [name, bad] of BAD_CURSORS) {
      const g = makeTestGame(1)
      g.flags.textMem = { v: 1, p: {}, f: {}, r: {}, c: bad as Json }
      expect(textCursor(g), name).toEqual({ year: g.year, n: 0 })
      expect(readTextMem(g), name).toEqual({ v: 1, p: {}, f: {}, r: {} })
      const first = textRand(g)
      expect(first, name).toBe(streamUnit(handKey(g, g.year), 0))
      expect((g.flags.textMem as { c?: string }).c, name).toBe(`${g.year},1`)
      expect(textCursor(g), name).toEqual({ year: g.year, n: 1 })
    }
    // A memory that is not an object at all is replaced, and the cursor starts again.
    for (const junk of ['junk', 7, null, [1], { v: 2, c: '2026,5' }] as Json[]) {
      const g = makeTestGame(1)
      g.flags.textMem = junk
      expect(textCursor(g)).toEqual({ year: g.year, n: 0 })
      textRand(g)
      expect(textCursor(g)).toEqual({ year: g.year, n: 1 })
    }
    // A good cursor survives a read, and a cursor on another year is not this year's.
    const ok = makeTestGame(1)
    ok.flags.textMem = { v: 1, p: {}, f: {}, r: {}, c: '2026,41' }
    expect(textCursor(ok)).toEqual({ year: 2026, n: 41 })
    expect(readTextMem(ok).c).toBe('2026,41')
    ok.flags.textMem = { v: 1, p: {}, f: {}, r: {}, c: '2025,41' }
    expect(textCursor(ok)).toEqual({ year: 2026, n: 0 })
  })

  it('9b: after 2,000 draws over 400 pools the memory stays inside its caps and under 700 JSON nodes', () => {
    const g = makeTestGame(2)
    for (let i = 0; i < 2000; i++) {
      const k = (i * 7) % 400
      pickLine(g, pool(2 + (k % 39), 'cap' + k), i % 3 === 0 ? 'fam.' + (k % 200) : undefined)
      if (i % 40 === 39) g.year++
    }
    const mem = readTextMem(g)
    expect(Object.keys(mem.p).length).toBeLessThanOrEqual(300)
    expect(Object.keys(mem.f).length).toBeLessThanOrEqual(160)
    expect(mem).toEqual(g.flags.textMem)
    expect(nodes(g.flags.textMem)).toBeLessThanOrEqual(700)
    expect(JSON.parse(JSON.stringify(g.flags.textMem))).toEqual(g.flags.textMem)
  })

  it('9c: a year outside 0 to 999999 never throws, draws the first value and writes no cursor', () => {
    for (const year of [-3, 1_000_000, 2026.5, Number.NaN]) {
      const g = makeTestGame(1)
      g.year = year
      expect(() => textRand(g)).not.toThrow()
      expect(textCursor(g)).toEqual({ year, n: 0 })
      expect(readTextMem(g).c, String(year)).toBeUndefined()
      expect(g.rng).toBe(1)
    }
  })

  it('10: the validity cache: a stored memory is cleaned once, a hit returns the same object, a structuredClone is cleaned again', () => {
    const hostile = JSON.parse(JSON.stringify({ v: 1, p: { ok: 'w1,2', bad: 5, worse: 'b'.repeat(500) }, f: { x: [1] }, r: { z: 'q' }, c: 'nope', extra: [1, 2, 3] })) as Json
    const g = makeTestGame(1)
    g.flags.textMem = hostile
    const first = writableTextMem(g)
    expect(first).toEqual({ v: 1, p: { ok: 'w1,2' }, f: {}, r: {} })
    expect(g.flags.textMem).toBe(first)
    // Written by hand into the object it returned: the next call hits the cache and hands the same object back, unchanged.
    first.p.planted = 5 as unknown as string
    const second = writableTextMem(g)
    expect(second).toBe(first)
    expect((second.p as Record<string, unknown>).planted).toBe(5)
    // A draw goes through the same call, so it keeps the planted value too: the cache means no second pass.
    textRand(g)
    expect((writableTextMem(g).p as Record<string, unknown>).planted).toBe(5)
    // A structuredClone (what act() in the store does on every action) is a new object: it is validated once, and cleaned.
    const cloned = structuredClone(g)
    const third = writableTextMem(cloned)
    expect(third).not.toBe(first)
    expect((third.p as Record<string, unknown>).planted).toBeUndefined()
    expect(third.p.ok).toBe('w1,2')
    expect(third.c).toBe('2026,1')
    // And so is a JSON round trip.
    const loaded = JSON.parse(JSON.stringify(g)) as GameState
    expect((writableTextMem(loaded).p as Record<string, unknown>).planted).toBeUndefined()
    // A shallow copy of the state with its own flags (supply-resilience.ts scenario() does this) shares the memory object but does not
    // own it: it gets a copy of its own, and what it draws never reaches the original.
    const shallow: GameState = { ...g, flags: { ...g.flags } }
    const own = writableTextMem(shallow)
    expect(own).not.toBe(first)
    expect(shallow.flags.textMem).toBe(own)
    expect(g.flags.textMem).toBe(first)
    const cursorBefore = textCursor(g)
    textRand(shallow)
    textRand(shallow)
    expect(textCursor(g)).toEqual(cursorBefore)
    expect(textCursor(shallow).n).toBe(cursorBefore.n + 2)
    // A memory that was never stored by the writer is not trusted, even when it looks right.
    const h = makeTestGame(1)
    const looksRight = { v: 1, p: { a: 5 }, f: {}, r: {} } as unknown as Json
    h.flags.textMem = looksRight
    expect(writableTextMem(h)).not.toBe(looksRight)
    expect(writableTextMem(h).p).toEqual({})
  })

  it('11: skipTextDraws(g, year + 1, 1) makes the first draw of the next year the second draw of an untouched run', () => {
    const a = makeTestGame(1)
    const b = makeTestGame(1)
    textRand(a)
    textRand(b)
    skipTextDraws(a, a.year + 1, 1)
    expect(a.rng).toBe(1)
    a.year++
    b.year++
    expect(textCursor(a)).toEqual({ year: 2027, n: 1 })
    expect(textCursor(b)).toEqual({ year: 2027, n: 0 })
    const first = textRand(a)
    const untouched = [textRand(b), textRand(b)]
    expect(first).toBe(untouched[1])
    expect(first).toBe(streamUnit(handKey(a, 2027), 1))
    // Skipping on the year the cursor is already on adds to it; on another year it starts from n.
    skipTextDraws(a, 2027, 3)
    expect(textCursor(a)).toEqual({ year: 2027, n: 5 })
    skipTextDraws(a, 2030, 2)
    expect(a.flags.textMem).toMatchObject({ c: '2030,2' })
    // A frozen state throws exactly where rand(g) did, and nothing else changes.
    expect(() => skipTextDraws(deepFreeze(makeTestGame(1)), 2027, 1)).toThrow()
  })
})

describe('textLineId and textRng', () => {
  it('12: textLineId consumes one draw and names it t<year>.<n>', () => {
    const g = makeTestGame(1)
    expect(textLineId(g)).toBe('t2026.0')
    expect(textLineId(g)).toBe('t2026.1')
    pickLine(g, pool(4))
    expect(textLineId(g)).toBe('t2026.3')
    expect(textCursor(g)).toEqual({ year: 2026, n: 4 })
    g.year = 2031
    expect(textLineId(g)).toBe('t2031.0')
    expect(g.rng).toBe(1)
    expect(g.nextId).toBe(0)
  })

  it('13: textRng: next is textRand, int is inclusive and swaps, chance is next < p, pick and shuffle follow rng.ts', () => {
    const units = (n: number): number[] => {
      const g = makeTestGame(1)
      return Array.from({ length: n }, () => textRand(g))
    }
    const u = units(40)
    const g = makeTestGame(1)
    const t = textRng(g)
    let at = 0
    expect(t.next()).toBe(u[at++])
    expect(t.int(3, 9)).toBe(3 + Math.floor(u[at++] * 7))
    expect(t.int(9, 3)).toBe(3 + Math.floor(u[at++] * 7))
    expect(t.int(4, 4)).toBe(4)
    at++
    expect(t.chance(0.5)).toBe(u[at++] < 0.5)
    expect(t.chance(0)).toBe(false)
    at++
    expect(t.chance(1)).toBe(true)
    at++
    const items = ['a', 'b', 'c', 'd', 'e']
    expect(t.pick(items)).toBe(items[Math.floor(u[at++] * 5)])
    expect(t.pick(['solo'])).toBe('solo')
    at++ // pick draws once even for one item, like rng.ts pick
    const want = [...items]
    for (let i = want.length - 1; i > 0; i--) {
      const j = Math.floor(u[at++] * (i + 1))
      ;[want[i], want[j]] = [want[j], want[i]]
    }
    expect(t.shuffle(items)).toEqual(want)
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(() => t.pick([])).toThrow('pick() from empty list')
    expect(g.rng).toBe(1)
    expect(textCursor(g).n).toBe(at) // every call above made the draws counted in `at`; the failed pick made none
  })

  it('14: the test hook: plain takes lines[floor(unit * n)], rotate the next one, both still draw once and keep no pool memory', () => {
    const lines = pool(7)
    for (const [mode, shift] of [['plain', 0], ['rotate', 1]] as const) {
      const g = makeTestGame(4)
      const out = withPickMode(mode, () => pickLine(g, lines, 'hook.pool'))
      expect(out).toBe(lines[(Math.floor(streamUnit(handKey(g, 2026), 0) * 7) + shift) % 7])
      expect(textCursor(g)).toEqual({ year: 2026, n: 1 })
      expect(readTextMem(g).p).toEqual({})
      expect(g.rng).toBe(4)
    }
  })
})
