// R1-N5: the pins and recents store (src/ui/nav/prefs.ts). UI state in localStorage['anotherlife.ui.v1'], per life, bounded
// on every read: 6 lives, 12 pins and 8 recents each, 16 KB in all. Hostile stored data gives valid prefs and never throws.
// Pins and recents never enter GameState (act() clones the state every tap and the Time Machine would rewind them).
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFlags, setFlags } from '../src/game/flags'
import type { PlaceRef } from '../src/ui/nav/place'
import {
  MAX_LIVES,
  MAX_PINS,
  MAX_RECENTS,
  PINS_FULL_TEXT,
  UI_KEY,
  emptyPrefs,
  isPinned,
  lifeOf,
  loadPrefs,
  pushRecent,
  readUiPrefs,
  recordRecent,
  resetPrefsForTest,
  savePrefs,
  tabOf,
  togglePin,
  updatePrefs,
  usePrefs,
  type UiPrefs,
} from '../src/ui/nav/prefs'
import { NAV_OFF, navState } from './nav-kit'

// Built-in tasks resolve to nothing here (the pattern of test/ui-return.test.ts), so a new life starts quietly.
const offline = vi.hoisted(() => {
  const resolve = vi.fn()
  return { applyFallback: resolve, resolveTask: resolve, MAX_CUSTOM_ACTIONS_PER_YEAR: 5, CUSTOM_ACTION_KEY: 'doAnything' }
})
vi.mock('../src/game/offline', () => offline)

const store = await import('../src/ui/store')

const MAX_BYTES = 16_384

interface FakeStorage {
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
  data: Map<string, string>
}

function fakeStorage(initial?: string): FakeStorage {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(UI_KEY, initial)
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

const place = (id: string, path: string[] = ['computer']): PlaceRef => ({ tab: 'activities', path, id })
const group = (...path: string[]): PlaceRef => ({ tab: 'activities', path })

function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) freezeDeep(v)
  }
  return value
}

/** Every rule of a valid, bounded UiPrefs, in one place. */
function expectValid(p: UiPrefs): void {
  expect(p.v).toBe(1)
  expect(Object.getPrototypeOf(p.lives)).toBeNull()
  expect(Array.isArray(p.order)).toBe(true)
  expect(p.order.length).toBeLessThanOrEqual(MAX_LIVES)
  expect(new Set(p.order).size).toBe(p.order.length)
  expect(Object.keys(p.lives).sort()).toEqual([...p.order].sort())
  for (const id of p.order) {
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(id.length).toBeLessThanOrEqual(80)
    const life = p.lives[id]!
    expect(life.pins.length).toBeLessThanOrEqual(MAX_PINS)
    expect(life.recents.length).toBeLessThanOrEqual(MAX_RECENTS)
    for (const ref of [...life.pins, ...life.recents]) {
      expect(tabOf(ref.tab)).toBe(ref.tab)
      expect(ref.path.length).toBeLessThanOrEqual(12)
      for (const seg of ref.path) {
        expect(typeof seg).toBe('string')
        expect(seg.length).toBeGreaterThan(0)
        expect(seg.length).toBeLessThanOrEqual(80)
      }
      if (ref.id !== undefined) {
        expect(typeof ref.id).toBe('string')
        expect(ref.id.length).toBeGreaterThan(0)
        expect(ref.id.length).toBeLessThanOrEqual(80)
      }
    }
  }
  expect(JSON.stringify(p).length).toBeLessThanOrEqual(MAX_BYTES)
}

beforeEach(() => {
  setFlags(NAV_OFF)
  resetPrefsForTest()
})

afterEach(() => {
  resetFlags()
  resetPrefsForTest()
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('the constants and the shape', () => {
  it('uses the planned key and limits', () => {
    expect(UI_KEY).toBe('anotherlife.ui.v1')
    expect([MAX_PINS, MAX_RECENTS, MAX_LIVES]).toEqual([12, 8, 6])
    expect(PINS_FULL_TEXT).toBe("You've pinned 12. Unpin one first.")
  })

  it('emptyPrefs has a null-prototype lives object, so a life id of __proto__ is just a key', () => {
    const p = emptyPrefs()
    expect(p).toEqual({ v: 1, lives: {}, order: [] })
    expect(Object.getPrototypeOf(p.lives)).toBeNull()
    expect(emptyPrefs()).not.toBe(p)
  })

  it('tabOf accepts the four tabs and nothing else', () => {
    for (const tab of ['occupation', 'assets', 'relationships', 'activities']) expect(tabOf(tab)).toBe(tab)
    for (const bad of ['', 'Activities', 'profile', 'hub.company', 7, null, undefined, {}]) expect(tabOf(bad)).toBeNull()
  })
})

describe('1. save and load', () => {
  it('round-trips emptyPrefs', () => {
    const s = fakeStorage()
    expect(savePrefs(emptyPrefs(), s)).toBe(true)
    expect(s.data.has(UI_KEY)).toBe(true)
    const back = loadPrefs(s)
    expect(back).toEqual(emptyPrefs())
    expectValid(back)
  })

  it('round-trips pins and recents of two lives, newest first', () => {
    let p = emptyPrefs()
    p = togglePin(p, 'life-a', group('computer', 'ventures')).prefs
    p = pushRecent(p, 'life-a', place('ship'))
    p = pushRecent(p, 'life-b', place('buy', ['shopping']))
    const s = fakeStorage()
    expect(savePrefs(p, s)).toBe(true)
    const back = loadPrefs(s)
    expect(back).toEqual(p)
    expect(back.order).toEqual(['life-b', 'life-a'])
    expect(JSON.parse(s.data.get(UI_KEY)!)).toMatchObject({ v: 1, order: ['life-b', 'life-a'] })
    expectValid(back)
  })

  it('loads defaults when nothing is stored', () => {
    expect(loadPrefs(fakeStorage())).toEqual(emptyPrefs())
  })
})

describe('2. togglePin', () => {
  it('adds a new place at the front and removes a pinned one', () => {
    const a = group('computer')
    const b = group('doctor')
    const one = togglePin(emptyPrefs(), 'L', a)
    expect(one.ok).toBe(true)
    expect(one.reason).toBeUndefined()
    expect(isPinned(one.prefs, 'L', a)).toBe(true)
    const two = togglePin(one.prefs, 'L', b)
    expect(lifeOf(two.prefs, 'L').pins).toEqual([b, a])
    const gone = togglePin(two.prefs, 'L', a)
    expect(gone.ok).toBe(true)
    expect(lifeOf(gone.prefs, 'L').pins).toEqual([b])
    expect(isPinned(gone.prefs, 'L', a)).toBe(false)
  })

  it('treats the same path with and without an action id as two places', () => {
    const g = group('computer')
    const a = place('ship', ['computer'])
    const p = togglePin(togglePin(emptyPrefs(), 'L', g).prefs, 'L', a).prefs
    expect(lifeOf(p, 'L').pins).toEqual([a, g])
  })

  it('accepts 12 pins; the 13th returns full and leaves prefs equal', () => {
    let p = emptyPrefs()
    for (let i = 0; i < MAX_PINS; i++) {
      const r = togglePin(p, 'L', place(`a${i}`))
      expect(r.ok).toBe(true)
      p = r.prefs
    }
    expect(lifeOf(p, 'L').pins).toHaveLength(12)
    const full = togglePin(p, 'L', place('a-extra'))
    expect(full).toEqual({ prefs: p, ok: false, reason: 'full' })
    expect(full.prefs).toBe(p)
    expect(JSON.stringify(full.prefs)).toBe(JSON.stringify(p))
    // At 12, unpinning still works, and then a new place fits.
    const freed = togglePin(p, 'L', place('a3'))
    expect(freed.ok).toBe(true)
    expect(togglePin(freed.prefs, 'L', place('a-extra')).ok).toBe(true)
  })

  it('refuses a place that the reader would drop, and changes nothing', () => {
    const p = emptyPrefs()
    const wrongTab = { tab: 'profile', path: [] } as unknown as PlaceRef
    const longPath = group(...Array.from({ length: 13 }, (_, i) => `g${i}`))
    const longId = place('x'.repeat(81))
    for (const bad of [wrongTab, longPath, longId]) {
      const r = togglePin(p, 'L', bad)
      expect(r.ok).toBe(false)
      expect(r.reason).toBeUndefined()
      expect(r.prefs).toBe(p)
    }
    expect(togglePin(p, '', group('computer')).ok).toBe(false)
  })

  it('does not change its input (frozen prefs are fine)', () => {
    const p = freezeDeep(togglePin(emptyPrefs(), 'L', group('computer')).prefs)
    const before = JSON.stringify(p)
    togglePin(p, 'L', group('doctor'))
    togglePin(p, 'L', group('computer'))
    togglePin(p, 'M', group('doctor'))
    expect(JSON.stringify(p)).toBe(before)
  })

  it('drops a life that has nothing left, so it stops using one of the six slots', () => {
    const pinned = togglePin(emptyPrefs(), 'L', group('computer')).prefs
    const unpinned = togglePin(pinned, 'L', group('computer')).prefs
    expect(unpinned).toEqual(emptyPrefs())
  })
})

describe('3. pushRecent', () => {
  it('puts the newest first', () => {
    let p = emptyPrefs()
    p = pushRecent(p, 'L', place('one'))
    p = pushRecent(p, 'L', place('two'))
    p = pushRecent(p, 'L', group('doctor'))
    expect(lifeOf(p, 'L').recents).toEqual([group('doctor'), place('two'), place('one')])
  })

  it('moves an equal place to the front without growing the list', () => {
    let p = emptyPrefs()
    for (const id of ['one', 'two', 'three']) p = pushRecent(p, 'L', place(id))
    const again = pushRecent(p, 'L', place('one'))
    expect(lifeOf(again, 'L').recents).toEqual([place('one'), place('three'), place('two')])
    expect(lifeOf(again, 'L').recents).toHaveLength(3)
  })

  it('returns the same prefs when the newest place is pushed again', () => {
    const p = pushRecent(emptyPrefs(), 'L', place('one'))
    expect(pushRecent(p, 'L', place('one'))).toBe(p)
  })

  it('evicts the oldest on the 9th', () => {
    let p = emptyPrefs()
    for (let i = 1; i <= 9; i++) p = pushRecent(p, 'L', place(`r${i}`))
    const ids = lifeOf(p, 'L').recents.map((r) => r.id)
    expect(ids).toEqual(['r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r3', 'r2'])
    expect(ids).toHaveLength(MAX_RECENTS)
  })

  it('ignores a place the reader would drop, and does not change its input', () => {
    const p = freezeDeep(pushRecent(emptyPrefs(), 'L', place('one')))
    const before = JSON.stringify(p)
    expect(pushRecent(p, 'L', { tab: 'nope', path: [] } as unknown as PlaceRef)).toBe(p)
    expect(pushRecent(p, 'L', group(''))).toBe(p)
    pushRecent(p, 'L', place('two'))
    pushRecent(p, 'M', place('two'))
    expect(JSON.stringify(p)).toBe(before)
  })

  it('keeps a pin and a recent of the same place apart', () => {
    let p = togglePin(emptyPrefs(), 'L', place('one')).prefs
    p = pushRecent(p, 'L', place('one'))
    expect(lifeOf(p, 'L').pins).toHaveLength(1)
    expect(lifeOf(p, 'L').recents).toHaveLength(1)
  })
})

describe('4. one set of lists per life', () => {
  it('keeps lives apart; lifeOf of an unknown id returns empty lists', () => {
    let p = emptyPrefs()
    p = togglePin(p, 'life-a', group('computer')).prefs
    p = pushRecent(p, 'life-b', place('ship'))
    expect(lifeOf(p, 'life-a')).toEqual({ pins: [group('computer')], recents: [] })
    expect(lifeOf(p, 'life-b')).toEqual({ pins: [], recents: [place('ship')] })
    expect(lifeOf(p, 'life-zzz')).toEqual({ pins: [], recents: [] })
    expect(lifeOf(p, '__proto__')).toEqual({ pins: [], recents: [] })
    expect(lifeOf(p, 'constructor')).toEqual({ pins: [], recents: [] })
    expect(isPinned(p, 'life-b', group('computer'))).toBe(false)
  })

  it('an heir has its own life id, so starts empty; the same life id keeps its pins', () => {
    const p = togglePin(emptyPrefs(), 'life-2026-abc', group('computer')).prefs
    expect(lifeOf(p, 'life-2026-abc-g2').pins).toEqual([])
    expect(isPinned(p, 'life-2026-abc', group('computer'))).toBe(true)
  })

  it('a 7th life evicts the oldest life', () => {
    let p = emptyPrefs()
    for (let i = 1; i <= 7; i++) p = pushRecent(p, `life-${i}`, place(`r${i}`))
    expect(p.order).toEqual(['life-7', 'life-6', 'life-5', 'life-4', 'life-3', 'life-2'])
    expect(Object.keys(p.lives)).toHaveLength(MAX_LIVES)
    expect(lifeOf(p, 'life-1')).toEqual({ pins: [], recents: [] })
    expect(lifeOf(p, 'life-2').recents).toEqual([place('r2')])
  })

  it('using a life again makes it the newest, so it is not the one evicted', () => {
    let p = emptyPrefs()
    for (let i = 1; i <= 6; i++) p = pushRecent(p, `life-${i}`, place(`r${i}`))
    p = pushRecent(p, 'life-1', place('again'))
    p = pushRecent(p, 'life-7', place('r7'))
    expect(p.order[0]).toBe('life-7')
    expect(p.order).toContain('life-1')
    expect(p.order).not.toContain('life-2')
  })

  it('a life id of __proto__ is stored as a plain key and pollutes nothing', () => {
    const p = pushRecent(emptyPrefs(), '__proto__', place('one'))
    expect(lifeOf(p, '__proto__').recents).toEqual([place('one')])
    expect(({} as Record<string, unknown>)['recents']).toBeUndefined()
    const s = fakeStorage()
    savePrefs(p, s)
    const back = loadPrefs(s)
    expect(lifeOf(back, '__proto__').recents).toEqual([place('one')])
    expect(({} as Record<string, unknown>)['recents']).toBeUndefined()
    expect(Object.getPrototypeOf(back.lives)).toBeNull()
  })
})

describe('5. hostile stored data (D.11 criterion 4)', () => {
  const manyPins = Array.from({ length: 500 }, (_, i) => ({ tab: 'activities', path: ['computer'], id: `pin-${i}` }))
  const big = (i: number): PlaceRef => ({
    tab: 'activities',
    path: Array.from({ length: 12 }, (_, k) => String(i).padEnd(80, String.fromCharCode(97 + k))),
    id: String(i).padEnd(80, 'z'),
  })
  const life = (pins: unknown, recents: unknown = []) => ({ pins, recents })

  const objects: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['an array', []],
    ['a number', 42],
    ['NaN', Number.NaN],
    ['a string', '{"v":1}'],
    ['true', true],
    ['an empty object', {}],
    ['a wrong version', { v: 2, lives: { a: life([{ tab: 'assets', path: [] }]) }, order: ['a'] }],
    ['a version that is NaN', { v: Number.NaN, lives: {}, order: [] }],
    ['lives as an array', { v: 1, lives: [life([])], order: [] }],
    ['lives as a number', { v: 1, lives: 7, order: ['a'] }],
    ['500 pins and 500 recents in one life', { v: 1, lives: { a: life(manyPins, manyPins) }, order: ['a'] }],
    ['500 lives', { v: 1, lives: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`life-${i}`, life([{ tab: 'assets', path: [], id: `x${i}` }])])), order: Array.from({ length: 500 }, (_, i) => `life-${i}`) }],
    ['10,000 character strings', { v: 1, lives: { ['k'.repeat(10_000)]: life([{ tab: 'activities', path: ['p'.repeat(10_000)], id: 'i'.repeat(10_000) }]), a: life([{ tab: 'activities', path: ['ok'], id: 'i'.repeat(10_000) }]) }, order: ['k'.repeat(10_000), 'o'.repeat(10_000), 'a'] }],
    ['a 100 segment path', { v: 1, lives: { a: life([{ tab: 'activities', path: Array.from({ length: 100 }, (_, i) => `g${i}`) }]) }, order: ['a'] }],
    ['a wrong tab', { v: 1, lives: { a: life([{ tab: 'profile', path: [] }, { tab: 7, path: [] }, { tab: null, path: [] }]) }, order: ['a'] }],
    ['NaN and Infinity values', { v: 1, lives: { a: life([{ tab: 'assets', path: [Number.NaN, Infinity, -Infinity], id: Number.NaN }, { tab: Infinity, path: Infinity }, Number.NaN, Infinity]) }, order: [Number.NaN, Infinity, 'a'] }],
    ['null where strings belong (what JSON makes of NaN)', JSON.parse('{"v":1,"lives":{"a":{"pins":[{"tab":"assets","path":[null],"id":null}],"recents":[null,[],"x"]}},"order":[null,"a"]}')],
    ['empty and non-string segments', { v: 1, lives: { a: life([{ tab: 'assets', path: ['', 'ok'] }, { tab: 'assets', path: [1, 'ok'] }, { tab: 'assets', path: 'ok' }, { tab: 'assets', path: { length: 1, 0: 'ok' } }]) }, order: ['a'] }],
    ['pins that are not an array', { v: 1, lives: { a: life('pins', { length: 1e9 }) }, order: ['a'] }],
    ['an order that is not an array', { v: 1, lives: { a: life([{ tab: 'assets', path: [] }]) }, order: 'a' }],
    ['an order with ids that are not lives, and repeats', { v: 1, lives: { a: life([{ tab: 'assets', path: [] }]) }, order: ['x', 'a', 'a', 'x', 7, null, {}] }],
    ['lives that are not objects', { v: 1, lives: { a: 7, b: null, c: [], d: 'x', e: life([{ tab: 'assets', path: [] }]) }, order: ['a', 'b', 'c', 'd', 'e'] }],
    ['__proto__ as a life', JSON.parse('{"v":1,"lives":{"__proto__":{"pins":[1]}}}')],
    ['__proto__ with real pins', JSON.parse('{"v":1,"lives":{"__proto__":{"pins":[{"tab":"assets","path":["x"]}],"recents":[]}},"order":["__proto__"]}')],
    ['a polluting constructor key', JSON.parse('{"v":1,"lives":{"constructor":{"pins":[{"tab":"assets","path":["x"]}]},"prototype":{"pins":[]}},"order":["constructor"]}')],
    ['refs with extra keys', { v: 1, lives: { a: { pins: [{ tab: 'assets', path: ['x'], evil: 'y'.repeat(50_000) }], recents: [], extra: 'z'.repeat(50_000) } }, order: ['a'], more: 'w'.repeat(50_000) }],
    ['six lives of the largest valid places', { v: 1, lives: Object.fromEntries(Array.from({ length: 6 }, (_, n) => [`life-${n}`, life(Array.from({ length: 12 }, (_, i) => big(n * 100 + i)), Array.from({ length: 8 }, (_, i) => big(n * 100 + 50 + i)))])), order: Array.from({ length: 6 }, (_, n) => `life-${n}`) }],
    ['one life of the largest valid places', { v: 1, lives: { a: life(Array.from({ length: 12 }, (_, i) => big(i)), Array.from({ length: 8 }, (_, i) => big(50 + i))) }, order: ['a'] }],
  ]

  it.each(objects)('reads %s into valid, bounded prefs', (_name, value) => {
    expectValid(readUiPrefs(value))
  })

  it.each([
    ['text that is not JSON', 'not json {'],
    ['an empty string', ''],
    ['JSON null', 'null'],
    ['a JSON array', '[1,2,3]'],
    ['a JSON number', '42'],
    ['a JSON string', '"x"'],
    ['truncated JSON', '{"v":1,"lives":{"a":{"pins":[{"tab":"ass'],
    ['a __proto__ life as text', '{"v":1,"lives":{"__proto__":{"pins":[1]}}}'],
    ['text over the raw limit', JSON.stringify({ v: 1, lives: {}, order: [], pad: 'x'.repeat(200_000) })],
  ])('loads %s as valid, bounded prefs', (_name, text) => {
    expectValid(loadPrefs(fakeStorage(text)))
  })

  it('a __proto__ life leaves Object.prototype alone', () => {
    const p = readUiPrefs(JSON.parse('{"v":1,"lives":{"__proto__":{"pins":[1]}}}'))
    expect(({} as Record<string, unknown>)['pins']).toBeUndefined()
    expect(Object.getPrototypeOf(p.lives)).toBeNull()
    expect(lifeOf(p, '__proto__').pins).toEqual([])
  })

  it('keeps the valid places of a mixed list and drops the rest, in order, without repeats', () => {
    const p = readUiPrefs({
      v: 1,
      lives: { a: life([{ tab: 'assets', path: ['x'] }, { tab: 'nope', path: [] }, { tab: 'assets', path: ['x'] }, { tab: 'activities', path: ['y'], id: 'z' }, 5]) },
      order: ['a'],
    })
    expect(lifeOf(p, 'a').pins).toEqual([{ tab: 'assets', path: ['x'] }, { tab: 'activities', path: ['y'], id: 'z' }])
  })

  it('keeps no extra keys, whatever was stored beside the places', () => {
    const p = readUiPrefs({ v: 1, lives: { a: { pins: [{ tab: 'assets', path: ['x'], evil: 1 }], recents: [], extra: 1 } }, order: ['a'], more: 1 })
    expect(Object.keys(p).sort()).toEqual(['lives', 'order', 'v'])
    expect(Object.keys(lifeOf(p, 'a')).sort()).toEqual(['pins', 'recents'])
    expect(lifeOf(p, 'a').pins[0]).toEqual({ tab: 'assets', path: ['x'] })
  })

  it('lives that are not in the order come after the ones that are, and only six are kept', () => {
    const lives = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`l${i}`, life([{ tab: 'assets', path: [`p${i}`] }])]))
    const p = readUiPrefs({ v: 1, lives, order: ['l9', 'l8'] })
    expect(p.order).toHaveLength(6)
    expect(p.order.slice(0, 2)).toEqual(['l9', 'l8'])
    expectValid(p)
  })

  it('drops the oldest lives first when the text is over 16 KB', () => {
    const lives = Object.fromEntries(Array.from({ length: 6 }, (_, n) => [`life-${n}`, life(Array.from({ length: 12 }, (_, i) => big(n * 100 + i)), Array.from({ length: 8 }, (_, i) => big(n * 100 + 50 + i)))]))
    const p = readUiPrefs({ v: 1, lives, order: Object.keys(lives) })
    expect(p.order[0]).toBe('life-0')
    expect(p.order.length).toBeLessThan(6)
    expectValid(p)
  })

  it('keeps the newest lives that fit and drops the older ones whole', () => {
    const medium = (i: number): PlaceRef => ({ tab: 'activities', path: ['a', 'b', 'c'].map((s, k) => String(i).padEnd(80, s + k)), id: String(i).padEnd(80, 'z') })
    const lives = Object.fromEntries(Array.from({ length: 6 }, (_, n) => [`life-${n}`, life(Array.from({ length: 12 }, (_, i) => medium(n * 100 + i)), Array.from({ length: 8 }, (_, i) => medium(n * 100 + 50 + i)))]))
    const order = Object.keys(lives)
    const p = readUiPrefs({ v: 1, lives, order })
    expectValid(p)
    expect(p.order.length).toBeGreaterThanOrEqual(2)
    expect(p.order.length).toBeLessThan(6)
    expect(p.order).toEqual(order.slice(0, p.order.length))
    // Whole lives: each kept one is untouched.
    for (const id of p.order) expect(lifeOf(p, id).pins).toHaveLength(12)
    for (const id of p.order) expect(lifeOf(p, id).recents).toHaveLength(8)
  })

  it('trims a single life that is over 16 KB by itself, recents first', () => {
    const pins = Array.from({ length: 12 }, (_, i) => big(i))
    const recents = Array.from({ length: 8 }, (_, i) => big(50 + i))
    const p = readUiPrefs({ v: 1, lives: { a: life(pins, recents) }, order: ['a'] })
    expectValid(p)
    expect(p.order).toEqual(['a'])
    expect(lifeOf(p, 'a').pins).toHaveLength(12)
    expect(lifeOf(p, 'a').recents.length).toBeLessThan(8)
  })

  it('writers stay inside the bound too, even with the largest valid places', () => {
    let p = emptyPrefs()
    for (let i = 0; i < 40; i++) {
      p = pushRecent(p, `life-${i % 8}`, big(i))
      p = togglePin(p, `life-${i % 8}`, big(500 + i)).prefs
    }
    expectValid(p)
  })

  it('a getter that throws gives empty prefs and does not throw', () => {
    const trap = {}
    Object.defineProperty(trap, 'v', {
      get() {
        throw new Error('boom')
      },
    })
    expect(readUiPrefs(trap)).toEqual(emptyPrefs())
  })
})

describe('6. storage that fails', () => {
  it('gives emptyPrefs when getItem throws, and does not throw', () => {
    const s = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(loadPrefs(s)).toEqual(emptyPrefs())
  })

  it('gives emptyPrefs when getItem returns something that is not text', () => {
    expect(loadPrefs({ getItem: () => 5 as unknown as string })).toEqual(emptyPrefs())
    expect(loadPrefs({ getItem: () => undefined as unknown as string })).toEqual(emptyPrefs())
  })

  it('returns false when setItem throws (quota), and does not throw', () => {
    const s = {
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(savePrefs(emptyPrefs(), s)).toBe(false)
  })

  it('returns false for prefs that cannot be written as JSON', () => {
    const cyclic = emptyPrefs() as unknown as Record<string, unknown>
    cyclic['self'] = cyclic
    expect(savePrefs(cyclic as unknown as UiPrefs, fakeStorage())).toBe(false)
  })

  it('refuses to write more than 16 KB', () => {
    const s = fakeStorage()
    const huge = { v: 1 as const, lives: Object.assign(Object.create(null), { a: { pins: [], recents: [] } }), order: ['a'], pad: 'x'.repeat(20_000) }
    expect(savePrefs(huge as unknown as UiPrefs, s)).toBe(false)
    expect(s.data.has(UI_KEY)).toBe(false)
  })

  it('works with no localStorage at all (node, a private window): defaults, and false', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(loadPrefs()).toEqual(emptyPrefs())
    expect(savePrefs(emptyPrefs())).toBe(false)
  })

  it('reads the global lazily, inside the try: a global whose getter throws is also fine', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    expect(loadPrefs()).toEqual(emptyPrefs())
    expect(savePrefs(emptyPrefs())).toBe(false)
  })

  it('uses globalThis.localStorage by default', () => {
    const s = fakeStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true })
    const p = pushRecent(emptyPrefs(), 'L', place('one'))
    expect(savePrefs(p)).toBe(true)
    expect(loadPrefs()).toEqual(p)
    expect(s.data.get(UI_KEY)).toBe(JSON.stringify(p))
  })
})

describe('7. never in GameState (criterion 7)', () => {
  const PIN = group('pinned-marker-zq81', 'deep-marker-zq81')
  const RECENT = place('recent-marker-zq81', ['computer'])

  it('a canned state is byte-identical after pins and recents', () => {
    const g = navState('adult')
    const before = JSON.stringify(g)
    updatePrefs((p) => togglePin(p, g.lifeId, PIN).prefs)
    updatePrefs((p) => pushRecent(p, g.lifeId, RECENT))
    expect(JSON.stringify(g)).toBe(before)
    expect(before).not.toContain('marker-zq81')
    expect(isPinned(usePrefsNow(), g.lifeId, PIN)).toBe(true)
  })

  it('a store act() clone is byte-identical too, and holds none of the ids', () => {
    store.startNewLife({ seed: 7, year: 2026 })
    const lifeId = store.getApp().game!.lifeId
    store.act((g) => {
      g.queue = []
    })
    const before = JSON.stringify(store.getApp().game)
    updatePrefs((p) => togglePin(p, lifeId, PIN).prefs)
    updatePrefs((p) => pushRecent(p, lifeId, RECENT))
    store.act(() => {})
    const after = JSON.stringify(store.getApp().game)
    expect(after).toBe(before)
    expect(after).not.toContain('marker-zq81')
    expect(isPinned(usePrefsNow(), lifeId, PIN)).toBe(true)
  })

  it('no file under src/game imports from ui/nav, or mentions the storage key', () => {
    const root = fileURLToPath(new URL('../src/game', import.meta.url))
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f))
    expect(files.length).toBeGreaterThan(50)
    const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
    const offenders: string[] = []
    for (const f of files) {
      const text = readFileSync(`${root}/${f}`, 'utf8')
      for (const m of text.matchAll(specifier)) if (/(^|\/)ui\//.test(m[1]!)) offenders.push(`${f}: ${m[1]}`)
      if (text.includes(UI_KEY)) offenders.push(`${f}: ${UI_KEY}`)
    }
    expect(offenders).toEqual([])
  })

  it('the scan really sees an import (it would catch one)', () => {
    const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
    const text = "import { x } from '../../ui/nav/prefs'\nconst y = await import('../ui/nav/place')\nimport '../../ui/nav/nav.css'\n"
    const found = [...text.matchAll(specifier)].map((m) => m[1])
    expect(found).toEqual(['../../ui/nav/prefs', '../ui/nav/place', '../../ui/nav/nav.css'])
    expect(found.every((s) => /(^|\/)ui\//.test(s!))).toBe(true)
  })
})

/** The current snapshot, read the way a component does: through usePrefs inside a throwaway render. */
function usePrefsNow(): UiPrefs {
  let seen: UiPrefs | null = null
  const Probe = () => {
    seen = usePrefs()
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return seen as unknown as UiPrefs
}

describe('8. usePrefs and updatePrefs', () => {
  it('returns a stable snapshot between two reads, and a new one after updatePrefs', () => {
    const first = usePrefsNow()
    expect(usePrefsNow()).toBe(first)
    expect(first).toEqual(emptyPrefs())
    updatePrefs((p) => pushRecent(p, 'L', place('one')))
    const second = usePrefsNow()
    expect(second).not.toBe(first)
    expect(lifeOf(second, 'L').recents).toEqual([place('one')])
    expect(usePrefsNow()).toBe(second)
  })

  it('saves what it applies, and a later load sees it', () => {
    const s = fakeStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true })
    updatePrefs((p) => togglePin(p, 'L', group('computer')).prefs)
    expect(JSON.parse(s.data.get(UI_KEY)!)).toMatchObject({ v: 1, order: ['L'] })
    resetPrefsForTest()
    expect(isPinned(usePrefsNow(), 'L', group('computer'))).toBe(true)
  })

  it('keeps working in memory when the save fails', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
      },
    })
    expect(() => updatePrefs((p) => pushRecent(p, 'L', place('one')))).not.toThrow()
    expect(lifeOf(usePrefsNow(), 'L').recents).toEqual([place('one')])
  })

  it('keeps the same snapshot when the update changes nothing', () => {
    const a = usePrefsNow()
    updatePrefs((p) => p)
    expect(usePrefsNow()).toBe(a)
    updatePrefs((p) => pushRecent(p, 'L', place('one')))
    const b = usePrefsNow()
    expect(b).not.toBe(a)
    updatePrefs((p) => pushRecent(p, 'L', place('one')))
    expect(usePrefsNow()).toBe(b)
  })

  it('resetPrefsForTest drops the in-memory copy, so the next read comes from storage', () => {
    updatePrefs((p) => pushRecent(p, 'L', place('one')))
    resetPrefsForTest()
    expect(usePrefsNow()).toEqual(emptyPrefs())
  })
})

describe('recordRecent (the one write the sheets and the game screen make)', () => {
  it('does nothing while navPalette is off', () => {
    const before = usePrefsNow()
    recordRecent('L', place('one'))
    expect(usePrefsNow()).toBe(before)
    expect(lifeOf(usePrefsNow(), 'L').recents).toEqual([])
  })

  it('pushes the place for that life while navPalette is on, newest first', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    recordRecent('L', place('one'))
    recordRecent('L', group('computer'))
    recordRecent('M', place('two'))
    expect(lifeOf(usePrefsNow(), 'L').recents).toEqual([group('computer'), place('one')])
    expect(lifeOf(usePrefsNow(), 'M').recents).toEqual([place('two')])
  })

  it('leaves the snapshot alone when the same place is recorded again', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    recordRecent('L', place('one'))
    const first = usePrefsNow()
    recordRecent('L', place('one'))
    expect(usePrefsNow()).toBe(first)
  })

  it('ignores a place the reader would drop', () => {
    setFlags({ ...NAV_OFF, navPalette: true })
    const before = usePrefsNow()
    recordRecent('L', { tab: 'nope', path: [] } as unknown as PlaceRef)
    expect(usePrefsNow()).toBe(before)
  })
})
