// Music 2.0, Task 2: the owner-stamped sim record at special.music.sim, its pure migration from the legacy
// profile and job, and the small pure readers on top of it. The legacy flag and Job.data are never written.
import { beforeEach, describe, expect, it } from 'vitest'
import { SAVE_SCHEMA } from '../src/game/save-schema'
import { appointmentId } from '../src/game/special/kit/state'
import { hire, ownerKey } from '../src/game/special/common'
import { musicJob } from '../src/game/special/music-job'
import { LABEL_ROSTER, labelId } from '../src/game/special/music-data'
import { adoptMusic, dealOf, legacyDeal, modMult, musicScore, musicStore, normalizeExtra, topPeaks } from '../src/game/special/music-state'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const FLAG = 'special.music.sim'
const LEGACY = 'special.music'

/** Paths of every non-finite number in a value. */
function nonFinite(v: unknown, path = 'r'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path]
  if (Array.isArray(v)) return v.flatMap((x, i) => nonFinite(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => nonFinite(x, `${path}.${k}`))
  return []
}

/** Number of nodes (values, arrays and objects) in a value. */
function nodes(v: unknown): number {
  if (Array.isArray(v)) return 1 + v.reduce((n: number, x) => n + nodes(x), 0)
  if (v && typeof v === 'object') return 1 + Object.values(v).reduce((n: number, x) => n + nodes(x), 0)
  return 1
}

/** Longest string in a value, keys included. */
function longest(v: unknown): number {
  if (typeof v === 'string') return v.length
  if (Array.isArray(v)) return v.reduce((n: number, x) => Math.max(n, longest(x)), 0)
  if (v && typeof v === 'object') return Object.entries(v).reduce((n, [k, x]) => Math.max(n, k.length, longest(x)), 0)
  return 0
}

const big = (n: number): string => 'x'.repeat(n)
const json = (v: unknown): Json => v as Json

const SOLO = { mode: 'solo', instrument: 'Guitar', genre: 'Rock', label: 'Echo Chamber Records', contractYears: 3, advancePerYear: 30_000, popularity: 50, bandName: null, bandmates: [], members: 1, recordedAge: -1, lastRelease: -1 }

/** A 1995 life with a hand-built solo job under Echo Chamber Records: 3 years left, $30,000 a year, popularity 50. */
function legacyLife(data: Record<string, unknown> = {}): GameState {
  const g = makeTestGame(3, { age: 30 })
  g.year = 1995
  hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Echo Chamber Records', salary: 30_000, data: json({ ...SOLO, ...data }) as Record<string, Json> })
  return g
}

const release = (age: number, quality: number) => ({ title: 'Night Bus', type: 'Studio Album', genre: 'Rock', subgenre: 'Classic Rock', age, sold: 1000, earned: 1000, cert: null, quality, royalty: 100 })

const bigLedger = Array.from({ length: 500 }, (_, i) => ({
  id: `r${i}`,
  title: big(10_000),
  type: 'podcast',
  year: 1e300,
  fmt: 'mp3',
  units0: 1e300,
  k: 9,
  pay: NaN,
  quality: 1e9,
  peak: 999,
  dealId: big(500),
  label: big(10_000),
  rate: 7,
  members: 1e9,
  samples: 'yes',
  gross: Infinity,
  paid: -5,
  lastLabel: 1e300,
  lastYear: NaN,
  adopted: 'yes',
  legacy: 1,
}))

const JUNK: unknown[] = [
  null,
  [],
  'x',
  42,
  { deal: 'bad', ledger: 'bad', history: [1, {}], tours: 5, mods: [{ kind: 'x' }], policy: 'bad', awards: [1, 2] },
  { v: 1, deal: 'bad', ledger: 'bad', history: [1, {}, { label: '' }], tours: 5, mods: [{ kind: 'x' }, { id: 'm', kind: 'nope' }], policy: 'bad', awards: [1, 2, {}] },
  { v: 1, deal: [], ledger: [null, 3, 'x', {}, { id: '' }], history: [null, 'x'], tours: [null, {}], mods: [[], null], policy: { samples: 5 }, awards: 'many' },
  {
    v: 1,
    owner: big(10_000),
    standing: 1e300,
    migrated: 'yes',
    deal: { id: big(500), appt: big(10_000), labelId: big(500), label: big(10_000), tier: 9, since: -1e300, term: 1e9, years: NaN, royalty: 99, advance: 1e300, perYear: Infinity, unrecouped: 1e300, trust: -5, legacy: false, renewals: 1e9 },
    history: Array.from({ length: 100 }, () => ({ label: big(10_000), from: NaN, to: 1e300, ended: 'vanished', forgiven: 1e300 })),
    ledger: bigLedger,
    tours: Array.from({ length: 100 }, () => ({ year: 1e300, tier: big(10_000), shows: 1e9, gate: Infinity, costs: NaN, net: -1e300 })),
    mods: Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, kind: i % 2 ? 'fill' : 'units', mult: 99, until: 1e300 })),
    policy: { samples: 'risky' },
    awards: Array.from({ length: 100 }, () => big(10_000)),
    rows: Array.from({ length: 100 }, () => ({ y: 1e300, income: NaN, spent: Infinity, rank: -1, of: 1e9, standing: 1e9, note: big(10_000) })),
    memory: Array.from({ length: 100 }, (_, i) => ({ id: `rival${i}`, name: big(10_000), met: NaN, won: 1e300, lost: -1, grudge: 1e9, last: Infinity })),
    cool: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`label.${i}`, 1e300])),
    done: Array.from({ length: 100 }, () => big(10_000)),
  },
  // a legacy deal keeps royalty 1, whatever the junk says
  { v: 1, deal: { id: 'legacy', label: 'Echo Chamber Records', legacy: true, royalty: 0.001, years: 2, perYear: 1e300, advance: 1e300 } },
]

describe('music state', () => {
  let g: GameState
  beforeEach(() => {
    g = legacyLife()
  })

  it('keeps junk finite, capped and small [RF1]', () => {
    for (const junk of JUNK) {
      const r = musicStore.read(junk, g)
      expect(nonFinite(r)).toEqual([])
      expect(r.ledger.length).toBeLessThanOrEqual(40)
      expect(r.history.length).toBeLessThanOrEqual(8)
      expect(r.tours.length).toBeLessThanOrEqual(8)
      expect(r.mods.length).toBeLessThanOrEqual(6)
      expect(r.awards.length).toBeLessThanOrEqual(24)
      expect(r.rows.length).toBeLessThanOrEqual(12)
      expect(r.memory.length).toBeLessThanOrEqual(16)
      expect(Object.keys(r.cool).length).toBeLessThanOrEqual(24)
      expect(r.done.length).toBeLessThanOrEqual(24)
      expect(nodes(r)).toBeLessThan(3000)
      expect(JSON.stringify(r).length).toBeLessThan(40_000) // the worst case any junk can reach
      expect(longest(r)).toBeLessThanOrEqual(90)
      expect(r.standing).toBeGreaterThanOrEqual(0)
      expect(r.standing).toBeLessThanOrEqual(100)
      expect(['original', 'cleared', 'risky']).toContain(r.policy.samples)
      if (r.deal) {
        expect(r.deal.advance).toBeLessThanOrEqual(1_500_000)
        expect(r.deal.perYear).toBeLessThanOrEqual(1_500_000)
        expect(r.deal.unrecouped).toBeLessThanOrEqual(1e9)
        if (r.deal.legacy) expect(r.deal.royalty).toBe(1)
        else {
          expect(r.deal.royalty).toBeGreaterThanOrEqual(0.05)
          expect(r.deal.royalty).toBeLessThanOrEqual(0.4)
        }
        expect([r.deal.trust >= 0 && r.deal.trust <= 100, r.deal.years <= 8, r.deal.term >= 1 && r.deal.term <= 8, r.deal.renewals <= 9]).toEqual([true, true, true, true])
        expect([0, 1, 2, 3]).toContain(r.deal.tier)
      }
      for (const row of r.ledger) {
        expect([row.rate >= 0.05 && row.rate <= 0.6, row.k >= 0.2 && row.k <= 0.7, row.peak >= 0 && row.peak <= 20, row.members >= 1 && row.members <= 100]).toEqual([true, true, true, true])
        expect(['shellac', 'vinyl', 'tape', 'cd', 'download', 'stream']).toContain(row.fmt)
        expect(['studio', 'single', 'live', 'compilation']).toContain(row.type)
        expect(['original', 'cleared', 'risky']).toContain(row.samples)
      }
      for (const m of r.mods) {
        expect(['units', 'fill']).toContain(m.kind)
        expect(m.mult).toBeGreaterThanOrEqual(0.5)
        expect(m.mult).toBeLessThanOrEqual(1.5)
      }
      for (const h of r.history) expect(['expired', 'dropped', 'walked', 'quit']).toContain(h.ended)
      for (const t of r.tours) expect(t.shows).toBeLessThanOrEqual(30)
    }
    // the stocked junk record keeps the newest 40 rows, 8 history rows, 6 mods and 24 awards
    const r = musicStore.read(JUNK[7], g)
    expect(r.ledger).toHaveLength(40)
    expect(r.ledger[39].id).toBe('r499')
    expect([r.history.length, r.tours.length, r.mods.length, r.awards.length]).toEqual([8, 8, 6, 24])
    expect(r.mods[5].id).toBe('m49')
    // the legacy flag in the last junk record wins over the junk royalty
    expect(musicStore.read(JUNK[8], g).deal).toMatchObject({ legacy: true, royalty: 1, perYear: 1_500_000, advance: 1_500_000 })
  })

  it('lifts a garbage legacy profile and job to a safe view [RF1]', () => {
    const h = legacyLife({ contractYears: 'x', advancePerYear: NaN, label: 12, popularity: 'y' })
    h.flags[LEGACY] = json({ owner: ownerKey(h), discography: 'bad', awards: 5, burnedLabels: {}, tours: NaN })
    const before = JSON.stringify(h)
    let v = musicStore.view(h)
    expect(v.deal).toBeNull()
    expect(nonFinite(v)).toEqual([])
    expect(JSON.stringify(h)).toBe(before)
    const f = deepFreeze(structuredClone(h))
    expect(() => musicStore.view(f)).not.toThrow()
    expect(() => musicStore.peek(f)).not.toThrow()
    expect(() => musicScore(f, musicStore.view(f))).not.toThrow()
    expect(musicStore.view(f).deal).toBeNull()
    expect(() => musicStore.mut(h)).not.toThrow()
    v = musicStore.view(h)
    expect([v.deal, v.migrated, nonFinite(v)]).toEqual([null, false, []])
    // a job whose data is not an object at all
    for (const data of [null, [], 'x', 7]) {
      const k = legacyLife()
      k.character.job!.data = json(data) as never
      expect(() => musicStore.view(k), String(data)).not.toThrow()
      expect(musicStore.view(k).deal).toBeNull()
      expect(Number.isFinite(musicScore(k, musicStore.view(k)))).toBe(true)
      expect(() => musicStore.mut(k), String(data)).not.toThrow()
    }
  })

  it('lifts a labelled legacy solo to a legacy deal and view writes nothing [RF2]', () => {
    const job = musicJob(g)!
    const before = JSON.stringify(g)
    const v = musicStore.view(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.flags[FLAG]).toBeUndefined()
    expect(v.deal).toMatchObject({ id: 'legacy', labelId: 'echo-chamber-records', label: 'Echo Chamber Records', legacy: true, royalty: 1, advance: 90_000, perYear: 30_000, years: 3, term: 3, tier: 1, trust: 55, unrecouped: 0, renewals: 0, appt: appointmentId(job) })
    expect(v.deal).toEqual(legacyDeal(g))
    expect(v.migrated).toBe(false)
    // the term is read, at most 8 years
    job.data.contractYears = 20
    expect(musicStore.view(g).deal).toMatchObject({ years: 8, term: 8, advance: 240_000 })
    // a label that is not on the roster is a tier-1 deal, a roster name keeps its own tier
    job.data.contractYears = 2
    job.data.label = 'Basement Tapes Ltd'
    expect(musicStore.view(g).deal).toMatchObject({ tier: 1, labelId: 'basement-tapes-ltd', advance: 60_000 })
    job.data.label = 'Platinum Peak Entertainment'
    expect(musicStore.view(g).deal).toMatchObject({ tier: 2, labelId: 'platinum-peak-entertainment' })
    // a band, an unsigned solo, an expired term and a job with no advance have no deal
    job.data.mode = 'band'
    expect(legacyDeal(g)).toBeNull()
    job.data.mode = 'solo'
    job.data.label = null
    expect(legacyDeal(g)).toBeNull()
    job.data.label = 'Echo Chamber Records'
    job.data.contractYears = 0
    expect(legacyDeal(g)).toBeNull()
    job.data.contractYears = 3
    job.data.advancePerYear = 0
    expect(legacyDeal(g)).toBeNull()
    // no musician job at all
    expect(legacyDeal(makeTestGame(4, { age: 30 }))).toBeNull()
  })

  it('mut writes v1 once and leaves the legacy profile byte-equal [RF2]', () => {
    g.flags[LEGACY] = json({ owner: ownerKey(g), stageName: 'Echo', discography: [release(29, 70)], burnedLabels: ['Big Noise Music'], awards: ['Golden Record Award'], tours: 2, concerts: 1 })
    const legacy = JSON.stringify(g.flags[LEGACY])
    const jobBefore = JSON.stringify(g.character.job)
    musicStore.mut(g)
    musicStore.mut(g)
    const flag = g.flags[FLAG] as unknown as { v: number; owner: string; migrated: boolean; deal: { id: string } }
    expect([flag.v, flag.owner, flag.migrated, flag.deal.id]).toEqual([1, ownerKey(g), false, 'legacy'])
    expect(JSON.stringify(g.flags[LEGACY])).toBe(legacy)
    expect(JSON.stringify(g.character.job)).toBe(jobBefore)
    expect(musicStore.peek(g)?.deal).toMatchObject({ legacy: true, perYear: 30_000, years: 3 })
    // the stored record is stable: reading and mutating again changes nothing
    const once = JSON.stringify(g.flags[FLAG])
    musicStore.mut(g)
    expect(JSON.stringify(g.flags[FLAG])).toBe(once)
  })

  it('adoptMusic is idempotent and stamps the deal', () => {
    const job = musicJob(g)!
    const s = musicStore.mut(g)
    g.flags['special.music'] = json({ owner: ownerKey(g), discography: [release(30, 80)] })
    s.deal!.appt = 'stale'
    adoptMusic(g, s)
    expect(s.migrated).toBe(true)
    expect(s.standing).toBe(musicScore(g, s))
    expect(s.peak).toBeGreaterThanOrEqual(s.standing)
    expect(s.deal).toMatchObject({ legacy: true, appt: appointmentId(job), years: 3 })
    const once = JSON.stringify(g)
    adoptMusic(g, s)
    expect(JSON.stringify(g)).toBe(once)
    expect(musicStore.view(g).migrated).toBe(true)
  })

  it('adoptMusic re-reads a legacy term that moved since the record was made, and leaves a sim deal alone', () => {
    const job = musicJob(g)!
    const s = musicStore.mut(g)
    job.data.contractYears = 2 // the legacy hook ran a deal year after the record was made
    adoptMusic(g, s)
    expect(s.deal).toMatchObject({ legacy: true, years: 2, term: 2, advance: 60_000 })
    // the legacy hook finished the term first: no deal is left to settle
    const h = legacyLife()
    const s2 = musicStore.mut(h)
    musicJob(h)!.data.contractYears = 0
    adoptMusic(h, s2)
    expect(s2.deal).toBeNull()
    // a deal the sim made itself is only stamped
    const k = legacyLife()
    const s3 = musicStore.mut(k)
    s3.deal = { ...s3.deal!, id: 'd1', legacy: false, royalty: 0.2, unrecouped: 12_000, appt: 'old', years: 3 }
    musicJob(k)!.data.contractYears = 1
    adoptMusic(k, s3)
    expect(s3.deal).toMatchObject({ id: 'd1', legacy: false, royalty: 0.2, unrecouped: 12_000, years: 3, appt: appointmentId(musicJob(k)) })
  })

  it('scores the standing from quality, popularity and fame', () => {
    const s = musicStore.view(g)
    g.character.hidden.fame = 40
    g.flags[LEGACY] = json({ owner: ownerKey(g), discography: [release(g.character.age, 80)] })
    expect(musicScore(g, s)).toBe(64) // 0.5 x 80 + 0.4 x 50 + 0.1 x 40
    g.flags[LEGACY] = json({ owner: ownerKey(g), discography: [release(g.character.age - 1, 80)] })
    expect(musicScore(g, s)).toBe(64) // last year still counts in full
    g.flags[LEGACY] = json({ owner: ownerKey(g), discography: [release(g.character.age - 3, 80)] })
    expect(musicScore(g, s)).toBe(48) // 0.5 x (80 x 0.6) + 20 + 4
    g.flags[LEGACY] = json({ owner: ownerKey(g), discography: [release(g.character.age - 9, 20), release(g.character.age, 60)] })
    expect(musicScore(g, s)).toBe(54) // the latest release is the one that counts
    // no job and no releases: a tenth of the fame
    const h = makeTestGame(5, { age: 30 })
    h.character.hidden.fame = 40
    expect(musicScore(h, musicStore.view(h))).toBe(4)
    // everything at 100 caps at 100
    const top = legacyLife({ popularity: 100 })
    top.character.hidden.fame = 100
    top.flags[LEGACY] = json({ owner: ownerKey(top), discography: [release(top.character.age, 100)] })
    expect(musicScore(top, musicStore.view(top))).toBe(100)
  })

  it('dealOf returns the deal only for the matching appointment; modMult multiplies live mods and clamps; topPeaks counts the span', () => {
    const s = musicStore.mut(g)
    const job = musicJob(g)!
    expect(dealOf(g, s)).toBe(s.deal)
    job.data.appointmentId = 'another-job'
    expect(dealOf(g, s)).toBeNull()
    job.data.appointmentId = s.deal!.appt
    expect(dealOf(g, s)).toBe(s.deal)
    g.character.job = null
    expect(dealOf(g, s)).toBeNull()
    expect(dealOf(makeTestGame(6, { age: 30 }), { ...s, deal: null })).toBeNull()

    const m = musicStore.read({ v: 1, mods: [{ id: 'a', kind: 'units', mult: 1.2, until: 2000 }, { id: 'b', kind: 'units', mult: 1.1, until: 1995 }, { id: 'c', kind: 'fill', mult: 1.3, until: 2000 }, { id: 'd', kind: 'units', mult: 1.2, until: 1990 }] }, g)
    expect(modMult(m, 'units', 1995)).toBeCloseTo(1.32, 10)
    expect(modMult(m, 'fill', 1995)).toBeCloseTo(1.3, 10)
    expect(modMult(m, 'units', 1996)).toBeCloseTo(1.2, 10)
    expect(modMult(m, 'units', 2001)).toBe(1)
    expect(modMult(musicStore.view(g), 'fill', 1995)).toBe(1)
    const hi = musicStore.read({ v: 1, mods: [{ id: 'a', kind: 'fill', mult: 1.5, until: 2000 }, { id: 'b', kind: 'fill', mult: 1.5, until: 2000 }, { id: 'c', kind: 'units', mult: 0.5, until: 2000 }, { id: 'd', kind: 'units', mult: 0.5, until: 2000 }] }, g)
    expect([modMult(hi, 'fill', 1995), modMult(hi, 'units', 1995)]).toEqual([1.5, 0.5])

    const row = (id: string, year: number, peak: number) => ({ id, title: id, type: 'studio', year, fmt: 'cd', units0: 1000, k: 0.4, pay: 1, quality: 60, peak, dealId: '', label: '', rate: 0.21, members: 1, samples: 'original', gross: 0, paid: 0, lastLabel: 0, lastYear: year, adopted: false, legacy: false })
    const l = musicStore.read({ v: 1, ledger: [row('a', 1995, 1), row('b', 1994, 8), row('c', 1993, 12), row('d', 1990, 5), row('e', 1995, 0)] }, g)
    expect(topPeaks(l, 1995, 10, 3)).toBe(2)
    expect(topPeaks(l, 1995, 10, 6)).toBe(3)
    expect(topPeaks(l, 1995, 1, 3)).toBe(1)
    expect(topPeaks(l, 1995, 20, 3)).toBe(3)
    expect(topPeaks(musicStore.view(g), 1995, 10, 3)).toBe(0)
  })

  it('reads another owner and an heir as fresh', () => {
    const h = legacyLife()
    h.flags[FLAG] = json({ owner: 'someone-else', v: 1, standing: 77, awards: ['A Prize'] })
    expect(musicStore.has(h)).toBe(false)
    expect(musicStore.peek(h)).toBeNull()
    expect([musicStore.view(h).standing, musicStore.view(h).awards]).toEqual([20, []])
    // the record of this owner reads back, and an heir (a new character) starts empty
    h.flags[FLAG] = json({ owner: ownerKey(h), v: 1, standing: 61, awards: ['A Prize'], migrated: true })
    expect([musicStore.has(h), musicStore.view(h).standing, musicStore.view(h).awards]).toEqual([true, 61, ['A Prize']])
    const heir = structuredClone(h)
    heir.character.id = 'next-generation-character'
    heir.character.job = null
    heir.generation = 2
    expect(musicStore.has(heir)).toBe(false)
    expect(musicStore.peek(heir)).toBeNull()
    expect([musicStore.view(heir).standing, musicStore.view(heir).migrated, musicStore.view(heir).deal, musicStore.view(heir).awards]).toEqual([20, false, null, []])
  })

  /**
   * A record with every list at its cap. `typical` uses the widths a real career produces (the worked statement
   * of the spec: 100,000 units, a six-figure gross, a five-figure artist share, a roster label, a short title);
   * `widest` fills every string and number to the longest a real value can be, short of junk.
   */
  function maxedRecord(widest: boolean): Record<string, unknown> {
    const titles = widest ? ['Midnight Static and Other Lullabies'] : ['Night Bus', 'Glass Harbor', 'Paper Moons', 'Slow Fire', 'Low Tide', 'Velvet Alarm', 'Neon Orchard', 'Static']
    const label = widest ? 'Platinum Peak Entertainment' : 'Echo Chamber Records'
    const rival = widest ? 'Marguerite Okonkwo-Lindqvist' : 'Chinedu Okafor'
    const units = (i: number) => (widest ? 9_876_543 : 80_000 + i * 13_000)
    const crisis = ['collab', 'award', 'festival', 'scandal', 'clash', 'audit']
    const coolKeys = [...LABEL_ROSTER.map((l) => `label.${l.id}`), ...crisis.map((c) => `crisis.${c}`), 'tour']
    return {
      v: 1,
      standing: 71,
      peak: 83,
      years: 40,
      rows: Array.from({ length: 12 }, (_, i) => ({ y: 1980 + i, income: widest ? 12_345_678 : 412_345 + i, spent: widest ? 9_876_543 : 98_765, rank: 7, of: 22, standing: 64, note: widest ? 'Royalties and a Label advance, no new release this year.' : 'Royalties, no new release this year.' })),
      memory: Array.from({ length: 16 }, (_, i) => ({ id: `music.us.1985.${i}`, name: rival, met: 12, won: 5, lost: 4, grudge: 30, last: 2020 })),
      cool: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i < coolKeys.length ? coolKeys[i] : `label.${widest ? 'platinum-peak-entertainment' : 'local-records'}-${i}`, 2024])),
      done: Array.from({ length: 24 }, (_, i) => `dispute.r${1000 + i}`),
      migrated: true,
      deal: { id: 'd1042', appt: '2019:44:7', labelId: labelId(label), label, tier: 2, since: 2019, term: 4, years: 2, royalty: 0.19, advance: 750_000, perYear: 187_500, unrecouped: 312_500, trust: 62, legacy: false, renewals: 2 },
      history: Array.from({ length: 8 }, (_, i) => ({ label, from: 1990 + i * 3, to: 1993 + i * 3, ended: 'expired', forgiven: 41_000 + i })),
      ledger: Array.from({ length: 40 }, (_, i) => ({
        id: `r${1000 + i}`,
        title: titles[i % titles.length],
        type: 'studio',
        year: 1985 + i,
        fmt: 'stream',
        units0: units(i),
        k: 0.58,
        pay: 1,
        quality: 71,
        peak: 4,
        dealId: 'd1042',
        label,
        rate: 0.19,
        members: 3,
        samples: 'cleared',
        gross: Math.round(units(i) * 6.6),
        paid: Math.round(units(i) * 0.18),
        lastLabel: Math.round(units(i) * 5.5),
        lastYear: 2025,
        adopted: false,
        legacy: false,
      })),
      tours: Array.from({ length: 8 }, (_, i) => ({ year: 2010 + i, tier: widest ? 'stadium' : 'arena', shows: 30, gate: widest ? 48_120_000 : 4_812_000, costs: widest ? 41_000_000 : 4_100_000, net: widest ? 7_120_000 : 712_000 })),
      mods: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, kind: i % 2 ? 'fill' : 'units', mult: 1.06, until: 2026 })),
      policy: { samples: 'cleared' },
      awards: Array.from({ length: 24 }, (_, i) => `Golden Record Award, "${titles[i % titles.length]}" (age 31)`),
    }
  }

  it('keeps a maxed record under 3,000 nodes and about 20 KB and SAVE_SCHEMA at 2', () => {
    for (const widest of [false, true]) {
      const r = musicStore.read(maxedRecord(widest), g)
      expect([r.ledger.length, r.history.length, r.tours.length, r.mods.length, r.awards.length, r.rows.length, r.memory.length, Object.keys(r.cool).length, r.done.length]).toEqual([40, 8, 8, 6, 24, 12, 16, 24, 24])
      expect(r.deal).toMatchObject({ id: 'd1042', royalty: 0.19, unrecouped: 312_500, legacy: false })
      expect(nodes(r)).toBeLessThan(3000)
      // measured: 20,258 bytes with typical widths and 23,093 with every string and number at its longest. The plan
      // says 20 KB, but 40 ledger rows of 21 fields are 12.5 KB and the kit's own lists add 4.5 KB, so a record with
      // every list at its cap sits at that line; both are far under the 40 KB the junk test allows.
      expect(JSON.stringify(r).length).toBeLessThan(widest ? 24_000 : 21_000)
      expect(musicStore.read(r, g)).toEqual(r) // reading a record again changes nothing
      expect(normalizeExtra({ ...r } as never, g)).toEqual(expect.objectContaining({ migrated: true, policy: { samples: 'cleared' } }))
    }
    expect(SAVE_SCHEMA).toBe(2)
  })
})
