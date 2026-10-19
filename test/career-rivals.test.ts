import { beforeEach, describe, expect, it } from 'vitest'
import { allBrands } from '../src/game/data/brands'
import { nameFitsYear } from '../src/game/history/events-people'
import type { MemoryRow } from '../src/game/special/kit/state'
import {
  activeField,
  beatOdds,
  cool,
  familySeed,
  formOf,
  grudgeBonus,
  noteRival,
  remember,
  rollScore,
  rosterAt,
  standingOf,
  strengthAt,
  type CareerRival,
  type RivalSpec,
  type Standing,
} from '../src/game/special/kit/rivals'
import type { GameState } from '../src/game/types'
import { namePoolOf } from '../src/game/world'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const spec: RivalSpec = { career: 'probe', edges: ['a', 'b'], field: (y) => (y < 1950 ? 0 : 16) }
const spec40: RivalSpec = { career: 'probe40', edges: ['a', 'b'], field: (y) => (y < 1950 ? 0 : 40) }

const row = (id: string, o: Partial<MemoryRow> = {}): MemoryRow => ({ id, name: `Name ${id}`, met: 0, won: 0, lost: 0, grudge: 0, last: 2000, ...o })
const standing = (top: { id: string; name: string; score: number }[], o: Partial<Standing> = {}): Standing => ({ rank: 1 + top.length, of: top.length + 1, me: 50, top, beat: [], lostTo: null, ...o })

describe('career rivals', () => {
  let g: GameState
  beforeEach(() => {
    g = makeTestGame(7, { age: 30 })
    g.lifeId = 'x'
  })

  it('gives heirs the same roster and other countries a different one [RF2]', () => {
    const heir = structuredClone(g)
    heir.lifeId = 'x-g2'
    heir.generation = 2
    expect(familySeed(heir)).toBe(familySeed(g))
    expect(familySeed(heir)).toBe('x')
    const a = rosterAt(g, spec, 2026, 'us')
    expect(a.length).toBeGreaterThan(5)
    expect(rosterAt(heir, spec, 2026, 'us')).toEqual(a)
    expect(rosterAt(g, spec, 2026, 'fr').map((r) => r.name)).not.toEqual(a.map((r) => r.name))
    const other = structuredClone(g)
    other.lifeId = 'y'
    expect(rosterAt(other, spec, 2026, 'us').map((r) => r.name)).not.toEqual(a.map((r) => r.name))
  })

  it('names a rival the same way in every year it is active', () => {
    const seen = new Map<string, string>()
    for (let y = 1950; y <= 2040; y++) {
      for (const r of rosterAt(g, spec, y, 'us')) {
        expect(seen.get(r.id) ?? r.name).toBe(r.name)
        seen.set(r.id, r.name)
      }
    }
    expect(seen.size).toBeGreaterThan(30)
  })

  it('is empty before the field exists and shows at most 24', () => {
    expect(rosterAt(g, spec, 1949)).toEqual([])
    expect(activeField(g, spec, [], 1949)).toEqual([])
    const roster = rosterAt(g, spec40, 2026, 'us')
    expect(roster.length).toBeGreaterThan(24)
    const field = activeField(g, spec40)
    expect(field.length).toBeLessThanOrEqual(24)
    expect(field.length).toBeGreaterThan(0)
    expect(standingOf(g, spec40, 0).of).toBe(roster.length + 1)
  })

  it('tracks the wanted field size within reason', () => {
    for (const year of [1960, 1985, 2010, 2026]) {
      const n = rosterAt(g, spec, year, 'us').length
      expect(n).toBeGreaterThanOrEqual(6)
      expect(n).toBeLessThanOrEqual(32)
    }
  })

  it('names are unique, fictional and era-fitting', () => {
    const brands = new Set(allBrands().map((b) => b.name.toLowerCase()))
    for (const country of ['us', 'fr', 'jp', 'ng', 'in']) {
      for (const year of [1960, 1975, 2000, 2026]) {
        const roster = rosterAt(g, spec40, year, country)
        expect(roster.length).toBeGreaterThan(0)
        expect(new Set(roster.map((r) => r.name)).size).toBe(roster.length)
        expect(new Set(roster.map((r) => r.id)).size).toBe(roster.length)
        for (const r of roster) {
          expect(brands.has(r.name.toLowerCase())).toBe(false)
          expect(r.name.length).toBeGreaterThan(3)
          expect(r.name.length).toBeLessThanOrEqual(40)
          const pool = namePoolOf(r.country)
          const firsts = [...pool.male, ...pool.female].filter((f) => r.name.startsWith(`${f} `))
          expect(firsts.length).toBeGreaterThan(0)
          expect(firsts.some((f) => nameFitsYear(f, r.born))).toBe(true)
          expect(r.born).toBeLessThan(r.debut)
          expect(r.exit).toBeGreaterThan(r.debut)
          expect(['a', 'b']).toContain(r.edge)
        }
      }
    }
  })

  it('names no rival like another in a long run of years', () => {
    const byName = new Map<string, string>()
    for (let y = 1950; y <= 2060; y += 3) {
      for (const r of rosterAt(g, spec40, y, 'us')) {
        const id = byName.get(r.name)
        expect(id ?? r.id).toBe(r.id)
        byName.set(r.name, r.id)
      }
    }
  })

  it('keeps strength within 0..peak and 0 outside [debut, exit)', () => {
    const rivals = new Map<string, CareerRival>()
    for (let y = 1950; y <= 2060; y++) for (const r of rosterAt(g, spec, y, 'us')) rivals.set(r.id, r)
    expect(rivals.size).toBeGreaterThan(30)
    for (const r of rivals.values()) {
      for (let y = r.debut - 3; y < r.exit + 3; y++) {
        const s = strengthAt(r, y)
        if (y < r.debut || y >= r.exit) expect(s).toBe(0)
        else {
          expect(s).toBeGreaterThanOrEqual(0.35 * r.peak - 1e-9)
          expect(s).toBeLessThanOrEqual(r.peak + 1e-9)
        }
        expect(Number.isFinite(s)).toBe(true)
      }
      expect(r.peak).toBeGreaterThanOrEqual(35)
      expect(r.peak).toBeLessThanOrEqual(95)
    }
  })

  it('uses the arcs the spec gives, about .30 .30 .20 .20', () => {
    const arcs = { rising: 0, steady: 0, comet: 0, late: 0 }
    const seen = new Set<string>()
    for (let y = 1950; y <= 2100; y += 5) {
      for (const r of rosterAt(g, spec40, y, 'us')) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        arcs[r.arc]++
      }
    }
    const n = seen.size
    expect(n).toBeGreaterThan(200)
    expect(arcs.rising / n).toBeGreaterThan(0.2)
    expect(arcs.rising / n).toBeLessThan(0.4)
    expect(arcs.steady / n).toBeGreaterThan(0.2)
    expect(arcs.steady / n).toBeLessThan(0.4)
    expect(arcs.comet / n).toBeGreaterThan(0.12)
    expect(arcs.comet / n).toBeLessThan(0.28)
    expect(arcs.late / n).toBeGreaterThan(0.12)
    expect(arcs.late / n).toBeLessThan(0.28)
  })

  it('honours debut age, length, peak and foreign share from the spec', () => {
    const tight: RivalSpec = { career: 'tight', edges: ['z'], field: () => 20, debutAge: [20, 21], length: [10, 11], peak: [60, 61], foreignShare: 0 }
    const seen = new Map<string, CareerRival>()
    for (let y = 1980; y <= 2030; y++) for (const r of rosterAt(g, tight, y, 'de')) seen.set(r.id, r)
    expect(seen.size).toBeGreaterThan(20)
    for (const r of seen.values()) {
      expect(r.debut - r.born).toBeGreaterThanOrEqual(20)
      expect(r.debut - r.born).toBeLessThanOrEqual(21)
      expect(r.exit - r.debut).toBeGreaterThanOrEqual(10)
      expect(r.exit - r.debut).toBeLessThanOrEqual(11)
      expect([60, 61]).toContain(r.peak)
      expect(r.country).toBe('de')
      expect(r.edge).toBe('z')
    }
    const foreign: RivalSpec = { ...tight, career: 'foreign', foreignShare: 1 }
    const abroad = rosterAt(g, foreign, 2020, 'de')
    expect(abroad.length).toBeGreaterThan(5)
    expect(abroad.every((r) => r.country !== 'de')).toBe(true)
  })

  it('survives a junk spec without throwing or looping', () => {
    const junk: RivalSpec = { career: 'junk', edges: ['q'], field: () => NaN, length: [0, 0], debutAge: [5, 1], peak: [200, -5] }
    expect(rosterAt(g, junk, 2026)).toEqual([])
    const wild: RivalSpec = { ...junk, career: 'wild', field: () => 1e9 }
    const r = rosterAt(g, wild, 2026)
    expect(r.length).toBeLessThanOrEqual(400)
    for (const x of r) expect(Number.isFinite(strengthAt(x, 2026))).toBe(true)
    const none: RivalSpec = { career: 'none', edges: [], field: () => 10 }
    expect(() => rosterAt(g, none, 2026)).not.toThrow()
  })

  it('never touches g.rng or JSON, also on a frozen state [RF5]', () => {
    const before = JSON.stringify(g)
    const rng = g.rng
    const f = deepFreeze(structuredClone(g))
    for (const h of [g, f]) {
      const roster = rosterAt(h, spec)
      expect(roster.length).toBeGreaterThan(0)
      activeField(h, spec, [row(roster[0].id, { grudge: 4 })])
      standingOf(h, spec, 40, [])
      formOf(h, spec, roster[0])
    }
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(f)).toBe(before)
  })

  it('keeps form an integer from -8 to 8 that is fixed for a year and rerolls with the year', () => {
    const roster = rosterAt(g, spec, 2026)
    const forms = roster.map((r) => formOf(g, spec, r, 2026))
    expect(forms).toEqual(roster.map((r) => formOf(g, spec, r, 2026)))
    for (const f of forms) {
      expect(Number.isInteger(f)).toBe(true)
      expect(Math.abs(f)).toBeLessThanOrEqual(8)
    }
    expect(new Set(forms).size).toBeGreaterThan(3)
    const next = roster.map((r) => formOf(g, spec, r, 2027))
    expect(next).not.toEqual(forms)
  })

  it('scores a rival by strength, depth, form and grudge, clamped to 0..100', () => {
    const roster = rosterAt(g, spec, 2026)
    const plain = activeField(g, spec)
    expect(plain.length).toBe(Math.min(24, roster.length))
    for (const { rival, score } of plain) {
      const expected = strengthAt(rival, 2026) + formOf(g, spec, rival, 2026)
      expect(Math.abs(score - Math.max(0, Math.min(100, expected)))).toBeLessThanOrEqual(0.5)
    }
    for (let i = 1; i < plain.length; i++) expect(plain[i - 1].score).toBeGreaterThanOrEqual(plain[i].score)

    const target = plain[plain.length - 1].rival
    const angry = activeField(g, spec, [row(target.id, { grudge: 50 })]).find((x) => x.rival.id === target.id)!
    expect(angry.score).toBeGreaterThanOrEqual(plain[plain.length - 1].score + 8)

    const deep = activeField(g, { ...spec, depth: () => 1.3 })
    const shallow = activeField(g, { ...spec, depth: () => 0.5 })
    expect(deep[0].score).toBeGreaterThan(shallow[0].score)
    const absurd = activeField(g, { ...spec, depth: () => 99 })
    expect(absurd.every((x) => x.score <= 100)).toBe(true)
    const nan = activeField(g, { ...spec, depth: () => NaN })
    expect(nan.every((x) => Number.isFinite(x.score))).toBe(true)
  })

  it('ranks by score; an empty field is rank 1 of 1; beatOdds is clamp((me - rival + 10) / 20)', () => {
    expect([beatOdds(50, 50), beatOdds(80, 50), beatOdds(10, 50)]).toEqual([0.5, 1, 0])
    expect(beatOdds(55, 50, 5)).toBe(1)
    expect(beatOdds(NaN, 50)).toBe(0)

    const empty = standingOf(g, { ...spec, career: 'empty', field: () => 0 }, 33)
    expect(empty).toEqual({ rank: 1, of: 1, me: 33, top: [], beat: [], lostTo: null })

    const field = activeField(g, spec)
    expect(field.length).toBeLessThanOrEqual(24)
    const top = standingOf(g, spec, 100)
    expect([top.rank, top.of]).toEqual([1, field.length + 1])
    expect(top.lostTo).toBeNull()
    expect(top.top.length).toBe(5)

    const bottom = standingOf(g, spec, 0)
    expect(bottom.rank).toBe(bottom.of)
    expect(bottom.lostTo).toBe(field[0].rival.id)
    expect(bottom.beat).toEqual([])

    const me = field[Math.floor(field.length / 2)].score
    const mid = standingOf(g, spec, me)
    expect(mid.rank).toBe(1 + field.filter((x) => x.score > me).length)
    expect(mid.top.map((t) => t.id)).toEqual(field.slice(0, 5).map((x) => x.rival.id))
    expect(mid.top.map((t) => t.score)).toEqual(field.slice(0, 5).map((x) => x.score))
    expect(mid.beat.length).toBeLessThanOrEqual(5)
    const below = field.filter((x) => x.score <= me)
    expect(mid.beat).toEqual(below.slice(0, 5).map((x) => x.rival.id))
    expect(mid.lostTo).toBe(field[0].score > me ? field[0].rival.id : null)
  })

  it('treats a junk strength as zero', () => {
    const s = standingOf(g, spec, NaN)
    expect(s.me).toBe(0)
    expect(s.rank).toBe(s.of)
  })

  it('rollScore adds -10..10 and draws g.rng once', () => {
    const rolls = new Set<number>()
    for (let i = 0; i < 200; i++) {
      const before = g.rng
      const r = rollScore(g, 50)
      expect(g.rng).not.toBe(before)
      expect(r).toBeGreaterThanOrEqual(40)
      expect(r).toBeLessThanOrEqual(60)
      rolls.add(r)
    }
    expect(rolls.size).toBeGreaterThan(10)
  })

  it('remembers at most 16 and fades grudge', () => {
    let rows: MemoryRow[] = []
    for (let i = 0; i < 40; i++) rows = remember(rows, standing([{ id: `r${i}`, name: `Rival ${i}`, score: 60 }]), 2000 + i)
    expect(rows.length).toBe(16)
    expect(new Set(rows.map((r) => r.id)).size).toBe(16)

    // eviction: lowest met + 2 * grudge goes first, then the oldest
    const full: MemoryRow[] = [row('keep', { met: 5, grudge: 3 }), row('weak', { met: 1, last: 1999 }), ...Array.from({ length: 14 }, (_, i) => row(`m${i}`, { met: 3, last: 2000 }))]
    const next = remember(full, standing([{ id: 'new', name: 'New Face', score: 70 }]), 2001)
    expect(next.length).toBe(16)
    expect(next.some((r) => r.id === 'weak')).toBe(false)
    expect(next.some((r) => r.id === 'keep')).toBe(true)

    expect(cool([row('a', { grudge: 3, last: 2000 })], 2002)[0].grudge).toBe(2)
    expect(cool([row('a', { grudge: 3, last: 2001 })], 2002)[0].grudge).toBe(3)
    expect(cool([row('a', { grudge: 0, last: 1990 })], 2002)[0].grudge).toBe(0)
    expect([grudgeBonus({ grudge: 5 } as MemoryRow), grudgeBonus({ grudge: 1 } as MemoryRow), grudgeBonus(undefined)]).toEqual([9, 3, 0])
  })

  it('remember counts meetings, the loss to the top rival and wins over known rivals', () => {
    const st = standing(
      [
        { id: 'a', name: 'Ann A', score: 80 },
        { id: 'b', name: 'Bo B', score: 60 },
      ],
      { me: 55, lostTo: 'a', beat: ['c', 'zz'] },
    )
    const before = [row('c', { met: 1 })]
    const frozen = JSON.stringify(before)
    const rows = remember(before, st, 2005)
    expect(JSON.stringify(before)).toBe(frozen)
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect([by.a.met, by.a.lost, by.a.won, by.a.last]).toEqual([1, 1, 0, 2005])
    expect([by.b.met, by.b.lost]).toEqual([1, 0])
    expect([by.c.won, by.c.last]).toEqual([1, 2005])
    expect(by.zz).toBeUndefined()
    expect(by.a.name).toBe('Ann A')
    const again = remember(rows, st, 2006)
    expect(again.find((r) => r.id === 'a')?.met).toBe(2)
    expect(again.find((r) => r.id === 'a')?.lost).toBe(2)
  })

  it('noteRival creates then updates one named row, clamps grudge to 0-100 and evicts like remember', () => {
    const a = noteRival([], { id: 'r1', name: 'Rae One' }, 2003, { met: 1, grudge: 10 })
    expect(a).toEqual([{ id: 'r1', name: 'Rae One', met: 1, won: 0, lost: 0, grudge: 10, last: 2003 }])
    const b = noteRival(a, { id: 'r1', name: 'Rae One' }, 2004, { lost: 1, grudge: 10 })
    expect(b).toEqual([{ id: 'r1', name: 'Rae One', met: 1, won: 0, lost: 1, grudge: 20, last: 2004 }])
    expect(a[0].grudge).toBe(10)
    expect(noteRival(b, { id: 'r1', name: 'Rae One' }, 2004, { grudge: 200 })[0].grudge).toBe(100)
    expect(noteRival(b, { id: 'r1', name: 'Rae One' }, 2004, { grudge: -500 })[0].grudge).toBe(0)
    expect(noteRival(b, { id: 'r1', name: 'Rae One' }, 2004, { won: -50 })[0].won).toBe(0)
    expect(noteRival([], { id: 'r2', name: 'x'.repeat(100) }, 2004, {})[0].name.length).toBe(40)
    expect(noteRival(b, { id: '', name: 'No Id' }, 2004, { met: 1 })).toEqual(b)

    let rows: MemoryRow[] = []
    for (let i = 0; i < 40; i++) rows = noteRival(rows, { id: `n${i}`, name: `Name ${i}` }, 2000 + i, { met: 1, grudge: i % 3 })
    expect(rows.length).toBe(16)
    expect(new Set(rows.map((r) => r.id)).size).toBe(16)
    for (const r of rows) expect(r.grudge).toBeLessThanOrEqual(100)
  })
})
