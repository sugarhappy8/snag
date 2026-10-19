// Music 2.0, Task 3: the format mix, the waterfall, the rival chart and the two settlement paths
// (bookRelease for a release, stepCatalogue for the back catalogue). Every statement balances to the
// dollar, and a grandfathered release keeps the legacy numbers.
import { describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { allBrands } from '../src/game/data/brands'
import { typicalIncome } from '../src/game/events/wealth-core'
import { hire } from '../src/game/special/common'
import { activeField, rosterAt, standingOf } from '../src/game/special/kit/rivals'
import { appointmentId } from '../src/game/special/kit/state'
import { ACTION_BUDGET, careerCtx, type CareerCtx } from '../src/game/special/kit/year'
import { GENRE_NAMES, ROYALTY_BASE } from '../src/game/special/music-data'
import { musicJob } from '../src/game/special/music-job'
import {
  MUSIC_SPEC,
  chartBase,
  chartBonus,
  chartLen,
  dominantFormat,
  formatMix,
  genreAt,
  nextNet,
  planEffect,
  stepCatalogue,
  tailK,
  takePerUnit,
  waterfall,
  bookRelease,
  type BookDraft,
  type Mix,
} from '../src/game/special/music-market'
import { adoptMusic, dealOf, musicStore, type LabelDeal, type LedgerRow, type MusicState } from '../src/game/special/music-state'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const SOLO = { mode: 'solo', instrument: 'Guitar', genre: 'Pop', label: null, contractYears: 0, advancePerYear: 0, popularity: 40, bandName: null, bandmates: [], members: 1, recordedAge: -1, lastRelease: -1 }

interface Opts {
  year?: number
  country?: string
  data?: Record<string, unknown>
  money?: number
}

/** A US life in 1995 (or `year`) with a solo job and an adopted record. */
function newMusician(seed: number, o: Opts = {}): GameState {
  const g = makeTestGame(seed, { age: 30 })
  g.year = o.year ?? 1995
  if (o.country) g.character.countryId = o.country
  g.character.money = o.money ?? 1_000_000
  hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Independent', salary: 0, data: { ...SOLO, ...(o.data ?? {}) } as Record<string, Json> })
  adoptMusic(g, musicStore.mut(g))
  return g
}

const ctx = (g: GameState): CareerCtx<MusicState> => careerCtx(g, 'music', musicStore.mut(g), { ...ACTION_BUDGET })

const DRAFT: BookDraft = { typeId: 'studio', title: 'Night Bus', subgenre: 'Dance', quality: 60, sold: 100_000, onTrend: false }

/** Gives the live record a sim-made (not legacy) deal for the held job. */
function signLedgerDeal(g: GameState, o: Partial<LabelDeal> = {}): LabelDeal {
  const s = musicStore.mut(g)
  const deal: LabelDeal = { id: 'd1', appt: appointmentId(musicJob(g)), labelId: 'echo-chamber-records', label: 'Echo Chamber Records', tier: 1, since: g.year, term: 3, years: 3, royalty: 0.16, advance: 90_000, perYear: 30_000, unrecouped: 80_000, trust: 55, legacy: false, renewals: 0, ...o }
  s.deal = deal
  return deal
}

function row(o: Partial<LedgerRow> = {}): LedgerRow {
  return { id: 'r1', title: 'Old Hit', type: 'studio', year: 1995, fmt: 'cd', units0: 100_000, k: 0.4, pay: 1, quality: 60, peak: 0, dealId: '', label: '', rate: 0.21, members: 1, samples: 'original', gross: 0, paid: 0, lastLabel: 0, lastYear: 1995, adopted: false, legacy: false, ...o }
}

const COUNTRIES = ['us', 'ng', 'in', 'jp']

describe('format eras', () => {
  it('formatMix sums to 1 and follows the eras [RF7]', () => {
    for (const country of COUNTRIES) {
      for (let y = 1900; y <= 2040; y++) {
        const m = formatMix(country, y)
        const sum = Object.values(m).reduce((a, b) => a + b, 0)
        expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
        for (const share of Object.values(m)) expect(share).toBeGreaterThanOrEqual(0)
      }
    }
    for (let y = 1900; y < 2007; y++) expect(formatMix('us', y).stream).toBe(0)
    for (let y = 1962; y <= 2040; y++) expect(formatMix('us', y).shellac).toBe(0)
    expect(formatMix('us', 1999).cd).toBeGreaterThanOrEqual(0.5)
    expect(formatMix('ng', 1965).shellac).toBeGreaterThan(0)
    expect(formatMix('us', 1960).stream).toBe(0)
    expect(dominantFormat(formatMix('us', 1925))).toBe('shellac')
    expect(dominantFormat(formatMix('us', 1962))).toBe('vinyl')
    expect(dominantFormat(formatMix('us', 1995))).toBe('cd')
    expect(dominantFormat(formatMix('us', 2026))).toBe('stream')
  })

  it('prices the hand-checked take per unit, tier 1, US', () => {
    const snapshots: [number, number][] = [[1925, 0.69], [1955, 0.98], [1975, 1.21], [1995, 0.98], [2008, 0.94], [2026, 0.92]]
    for (const [y, v] of snapshots) expect(Math.abs(takePerUnit(formatMix('us', y)) - v), `year ${y}`).toBeLessThan(0.02)
  })

  it('keeps lifetime take per unit inside 0.6x to 2.0x of the legacy 1.3', () => {
    for (const country of COUNTRIES) {
      for (let y = 1900; y <= 2040; y += 5) {
        const mix = formatMix(country, y)
        for (let t = 0; t < 4; t++) {
          const ratio = takePerUnit(mix, ROYALTY_BASE[t]) / (1 - tailK(mix)) / 1.3
          expect(ratio, `${country} ${y} tier ${t}`).toBeGreaterThanOrEqual(0.6)
          expect(ratio, `${country} ${y} tier ${t}`).toBeLessThanOrEqual(2.0)
        }
      }
    }
  })
})

describe('waterfall', () => {
  it('keeps the identity and the recoup bound over 300 seeded inputs [RF5]', () => {
    const countries = ['us', 'ng', 'in', 'jp', 'gb']
    for (let i = 0; i < 300; i++) {
      const r = seeded(`wf${i}`)
      const mix = formatMix(r.pick(countries), r.int(1900, 2040))
      const units = r.int(50, 2_000_000)
      const deal = r.chance(0.7) ? { id: 'd1', unrecouped: r.int(0, 3_000_000) } : null
      const same = r.chance(0.8)
      const w = waterfall({ pay: r.pick([1, 0.45, 0.8]), rate: r.float(0.05, 0.6), members: r.int(1, 6), dealId: same ? 'd1' : 'other' }, units, mix, deal)
      expect(w.gross, `input ${i}`).toBe(w.costs + w.kept + w.recoup + w.bandCut + w.paid)
      for (const part of Object.values(w)) {
        expect(Number.isInteger(part), `input ${i}`).toBe(true)
        expect(part).toBeGreaterThanOrEqual(0)
      }
      expect(w.recoup).toBeLessThanOrEqual(deal ? deal.unrecouped : 0)
      if (!deal || !same) expect(w.recoup).toBe(0)
      expect(w.net).toBe(w.gross - w.costs)
      expect(w.pool).toBe(w.recoup + w.paid + w.bandCut)
    }
  })

  it('prints the worked statement to the dollar [RF5]', () => {
    const mix: Mix = { stream: 0.833, vinyl: 0.078, cd: 0.067, download: 0.022, shellac: 0, tape: 0 }
    const r = { pay: 1, rate: 0.16, members: 1, dealId: 'd1' }
    expect(waterfall(r, 100_000, mix, { id: 'd1', unrecouped: 80_000 })).toEqual({ gross: 661_300, costs: 87_746, net: 573_554, pool: 91_769, kept: 481_785, recoup: 73_415, group: 18_354, paid: 18_354, bandCut: 0 })
  })

  it('splits the group share between the members', () => {
    const mix = formatMix('us', 1995)
    const w = waterfall({ pay: 1, rate: 0.21, members: 4, dealId: '' }, 200_000, mix, null)
    expect(w.group).toBe(w.pool)
    expect(w.paid).toBe(Math.round(w.group / 4))
    expect(w.bandCut).toBe(w.group - w.paid)
    expect(w.recoup).toBe(0)
  })
})

describe('the rival chart', () => {
  it('MUSIC_SPEC has no field before 1900, the same cast for an heir, another by country, and no brand names', () => {
    const g = newMusician(2)
    expect(rosterAt(g, MUSIC_SPEC, 1899)).toEqual([])
    expect(MUSIC_SPEC.field(1899, 'us')).toBe(0)
    expect(activeField(g, MUSIC_SPEC, [], 1995).length).toBeGreaterThanOrEqual(10)
    const a = makeTestGame(1, { age: 30 })
    const b = makeTestGame(1, { age: 30 })
    a.lifeId = 'x'
    b.lifeId = 'x-g2'
    expect(activeField(b, MUSIC_SPEC, [], 1995)).toEqual(activeField(a, MUSIC_SPEC, [], 1995))
    const ng = makeTestGame(1, { age: 30 })
    ng.lifeId = 'x'
    ng.character.countryId = 'ng'
    expect(activeField(ng, MUSIC_SPEC, [], 1995).map((x) => x.rival.name)).not.toEqual(activeField(a, MUSIC_SPEC, [], 1995).map((x) => x.rival.name))
    const brands = new Set(allBrands().map((x) => x.name.toLowerCase()))
    for (const year of [1900, 1925, 1955, 1975, 1995, 2015, 2026]) for (const x of rosterAt(a, MUSIC_SPEC, year)) expect(brands.has(x.name.toLowerCase())).toBe(false)
    expect(MUSIC_SPEC.edges).toEqual(GENRE_NAMES)
  })

  it('genreAt hides later genres: a 1930 chart shows no Rap, Reggae, Alternative or Rock act [RF7]', () => {
    expect(genreAt('Rap', 1930)).toBe('Pop')
    expect(genreAt('Rap', 1995)).toBe('Rap')
    expect(genreAt('Rock', 1953)).toBe('Pop')
    expect(genreAt('Rock', 1954)).toBe('Rock')
    expect(genreAt('Folk', 1900)).toBe('Folk')
    const g = makeTestGame(7, { age: 30 })
    const field = activeField(g, MUSIC_SPEC, [], 1930)
    expect(field.length).toBeGreaterThan(0)
    // the raw roster does draw gated genres, so the filter is doing the work
    expect(rosterAt(g, MUSIC_SPEC, 1930).some((r) => ['Rap', 'Reggae', 'Alternative', 'Rock'].includes(r.edge))).toBe(true)
    for (const x of field) expect(['Rap', 'Reggae', 'Alternative', 'Rock']).not.toContain(genreAt(x.rival.edge, 1930))
  })

  it('chart and plan reads leave JSON and g.rng unchanged, also frozen [RF4]', () => {
    const g = newMusician(4, { data: { popularity: 50 } })
    signLedgerDeal(g)
    const s0 = musicStore.mut(g)
    s0.ledger.push(row())
    const reads = (x: GameState): void => {
      const s = musicStore.view(x)
      standingOf(x, MUSIC_SPEC, 50, s.memory)
      activeField(x, MUSIC_SPEC, s.memory)
      chartBase({ quality: 60, popularity: 50, onTrend: true, tier: 1 })
      planEffect(x, s)
      nextNet(x, s.ledger[0] ?? row())
      formatMix(x.character.countryId, x.year)
    }
    const json = JSON.stringify(g)
    const rng = g.rng
    reads(g)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
    const frozen = deepFreeze(structuredClone(g))
    reads(frozen)
    expect(JSON.stringify(frozen)).toBe(json)
    expect(frozen.rng).toBe(rng)
  })

  it('chartBonus is 1.25 at #1 of 20 and 1 off the chart; chartLen is 5 for a small field', () => {
    expect(chartBonus(1, 20)).toBeCloseTo(1.25, 10)
    expect(chartBonus(20, 20)).toBeCloseTo(1.0125, 10)
    expect(chartBonus(0, 20)).toBe(1)
    expect(chartLen(4)).toBe(5)
    expect(chartLen(0)).toBe(5)
    expect(chartLen(40)).toBe(20)
    expect(chartLen(60)).toBe(20)
    expect(chartLen(14)).toBe(7)
  })

  it('chartBase adds the tier bonus only when signed', () => {
    expect(chartBase({ quality: 60, popularity: 40, onTrend: false, tier: null })).toBeCloseTo(46, 10)
    expect(chartBase({ quality: 60, popularity: 40, onTrend: true, tier: null })).toBeCloseTo(52, 10)
    expect(chartBase({ quality: 60, popularity: 40, onTrend: false, tier: 0 })).toBeCloseTo(47, 10)
    expect(chartBase({ quality: 60, popularity: 40, onTrend: false, tier: 3 })).toBeCloseTo(51, 10)
  })
})

describe('bookRelease', () => {
  it('on legacy terms keeps sold, pays round(sold x pay) and sets the legacy tail', () => {
    const g = newMusician(5, { data: { label: 'Echo Chamber Records', contractYears: 3, advancePerYear: 30_000 } })
    const s = musicStore.mut(g)
    expect(s.deal?.legacy).toBe(true)
    const before = g.character.money
    const b = bookRelease(ctx(g), musicJob(g)!, DRAFT)
    expect(b.legacy).toBe(true)
    expect(b.sold).toBe(DRAFT.sold)
    expect(b.paid).toBe(100_000)
    expect(b.royalty).toBe(Math.round(b.paid * 0.15))
    expect(b.row.legacy).toBe(true)
    expect(b.row.gross).toBe(100_000)
    expect(b.row.units0).toBe(100_000)
    expect(g.character.money - before).toBe(b.paid)
    const g2 = newMusician(5, { data: { label: 'Echo Chamber Records', contractYears: 3, advancePerYear: 30_000 } })
    const single = bookRelease(ctx(g2), musicJob(g2)!, { ...DRAFT, typeId: 'single' })
    expect(single.paid).toBe(45_000)
    expect(single.row.type).toBe('single')
  })

  it('on ledger terms: reach .85 unsigned, the chart bonus, one noise draw on either terms [RF5]', () => {
    const g = newMusician(6)
    const field = standingOf(g, MUSIC_SPEC, 0).of - 1
    const len = chartLen(field)
    const before = g.character.money
    const rng0 = g.rng
    const b = bookRelease(ctx(g), musicJob(g)!, DRAFT)
    expect(b.legacy).toBe(false)
    expect(b.royalty).toBe(0)
    expect(b.row.lastYear).toBe(1995)
    expect(b.row.rate).toBe(0.21)
    expect(b.row.dealId).toBe('')
    expect(b.sold).toBe(Math.round(DRAFT.sold * 0.85 * chartBonus(b.peak, len)))
    expect(b.row.units0).toBe(b.sold)
    expect(g.character.money - before).toBe(b.paid)
    expect(b.paid).toBe(b.row.paid)
    expect(b.peak).toBeGreaterThanOrEqual(0)
    expect(b.peak).toBeLessThanOrEqual(20)
    expect(musicStore.mut(g).ledger.at(-1)).toEqual(b.row)
    expect(g.rng).not.toBe(rng0)
    // one noise draw whichever terms: the same seed ends at the same rng position
    const legacy = newMusician(6, { data: { label: 'Echo Chamber Records', contractYears: 3, advancePerYear: 30_000 } })
    bookRelease(ctx(legacy), musicJob(legacy)!, DRAFT)
    expect(legacy.rng).toBe(g.rng)
  })

  it('a signed deal recoups into deal.unrecouped and never into cash [RF5]', () => {
    const g = newMusician(8, { data: { label: 'Echo Chamber Records', popularity: 70 } })
    const s = musicStore.mut(g)
    s.deal = null
    signLedgerDeal(g)
    const before = g.character.money
    const b = bookRelease(ctx(g), musicJob(g)!, DRAFT)
    const w = waterfall(b.row, b.sold, formatMix('us', 1995), { id: 'd1', unrecouped: 80_000 })
    expect(w.recoup).toBeGreaterThan(0)
    expect(musicStore.mut(g).deal?.unrecouped).toBe(80_000 - w.recoup)
    expect(g.character.money - before).toBe(w.paid)
    expect(b.paid).toBe(w.paid)
    expect(b.row.dealId).toBe('d1')
    expect(b.row.label).toBe('Echo Chamber Records')
    expect(b.row.rate).toBe(0.16)
    expect(b.row.lastLabel).toBe(w.kept + w.recoup)
    expect(b.row.gross).toBe(w.gross)
    expect(b.royalty).toBe(0)
    expect(b.sold).toBeGreaterThanOrEqual(Math.round(DRAFT.sold * chartBonus(0, 20)))
  })

  it('before 1900 there is no chart and the peak is 0', () => {
    const g = newMusician(9, { year: 1899 })
    const b = bookRelease(ctx(g), musicJob(g)!, DRAFT)
    expect(b.peak).toBe(0)
    expect(b.row.peak).toBe(0)
    expect(b.sold).toBe(Math.round(DRAFT.sold * 0.85))
  })

  it('a band splits the share and keeps its members on the row', () => {
    const g = newMusician(10, { data: { mode: 'band', bandName: 'The Neon Wolves', members: 4, bandmates: [] } })
    const before = g.character.money
    const b = bookRelease(ctx(g), musicJob(g)!, DRAFT)
    expect(b.row.members).toBe(4)
    const w = waterfall(b.row, b.sold, formatMix('us', 1995), null)
    expect(g.character.money - before).toBe(w.paid)
  })

  it('writes the row title and type through the record caps', () => {
    const g = newMusician(11)
    const b = bookRelease(ctx(g), musicJob(g)!, { ...DRAFT, typeId: 'nonsense', title: 'x'.repeat(200) })
    expect(b.row.type).toBe('studio')
    expect(b.row.title.length).toBe(60)
    expect(musicStore.view(g).ledger.at(-1)).toEqual(b.row)
  })

  it('keeps the newest 40 rows', () => {
    const g = newMusician(12)
    const s = musicStore.mut(g)
    for (let i = 0; i < 45; i++) s.ledger.push(row({ id: `old${i}` }))
    const b = bookRelease(ctx(g), musicJob(g)!, DRAFT)
    const after = musicStore.mut(g).ledger
    expect(after.length).toBe(40)
    expect(after.at(-1)?.id).toBe(b.row.id)
  })
})

describe('the release plan', () => {
  it('planEffect prices each mode from one function', () => {
    const g = newMusician(13, { data: { popularity: 50 } })
    const s = musicStore.mut(g)
    expect(planEffect(g, s)).toEqual({ mode: 'original', cost: 0, quality: 0, sold: 1 })
    s.policy.samples = 'risky'
    expect(planEffect(g, s)).toEqual({ mode: 'risky', cost: 0, quality: 5, sold: 1.06 })
    s.policy.samples = 'cleared'
    expect(planEffect(g, s)).toEqual({ mode: 'cleared', cost: Math.round(3000 * (1 + 50 / 25) * (typicalIncome(g) / 45_000)), quality: 3, sold: 1.04 })
  })

  it('cleared falls back to original when cash is short, risky costs nothing', () => {
    const g = newMusician(14, { money: 0 })
    const s = musicStore.mut(g)
    s.policy.samples = 'cleared'
    const b = bookRelease(ctx(g), musicJob(g)!, DRAFT)
    expect(b.quality).toBe(DRAFT.quality)
    expect(b.row.samples).toBe('original')
    expect(g.character.money).toBe(b.paid)
    const r = newMusician(14)
    musicStore.mut(r).policy.samples = 'risky'
    const before = r.character.money
    const risky = bookRelease(ctx(r), musicJob(r)!, DRAFT)
    expect(risky.quality).toBe(DRAFT.quality + 5)
    expect(risky.row.samples).toBe('risky')
    expect(r.character.money - before).toBe(risky.paid)
  })

  it('cleared pays the vendors, lifts quality by 3 and sold by 4%', () => {
    const g = newMusician(15, { data: { popularity: 50 } })
    const s = musicStore.mut(g)
    s.policy.samples = 'cleared'
    const cost = planEffect(g, s).cost
    expect(cost).toBeGreaterThan(0)
    const before = g.character.money
    const rng = g.rng
    const b = bookRelease(ctx(g), musicJob(g)!, DRAFT)
    expect(b.quality).toBe(DRAFT.quality + 3)
    expect(b.row.samples).toBe('cleared')
    expect(g.character.money - before).toBe(b.paid - cost)
    expect(g.rng).not.toBe(rng)
    const len = chartLen(standingOf(g, MUSIC_SPEC, 0).of - 1)
    expect(b.sold).toBe(Math.round(DRAFT.sold * 0.85 * chartBonus(b.peak, len) * 1.04))
  })
})

describe('stepCatalogue', () => {
  it('pays each row once a year, exactly [RF3][RF5]', () => {
    const g = newMusician(16)
    signLedgerDeal(g, { unrecouped: 5_000 })
    const s = musicStore.mut(g)
    s.ledger.push(
      row({ id: 'a', year: 1995, units0: 100_000, k: 0.4, dealId: 'd1', rate: 0.16 }),
      row({ id: 'b', year: 1994, units0: 60_000, k: 0.3, dealId: '', rate: 0.21, members: 3 }),
      row({ id: 'tiny', year: 1993, units0: 40, k: 0.5 }),
      row({ id: 'adopted', adopted: true }),
      row({ id: 'legacy', legacy: true }),
    )
    g.year = 1996
    const mix = formatMix('us', 1996)
    const expectA = waterfall(s.ledger[0], Math.round(100_000 * 0.4), mix, { id: 'd1', unrecouped: 5_000 })
    const expectB = waterfall(s.ledger[1], Math.round(60_000 * 0.3 ** 2), mix, null)
    const before = g.character.money
    const t = stepCatalogue(ctx(g))
    expect(t.rows).toBe(2)
    expect(t.paid).toBe(expectA.paid + expectB.paid)
    expect(t.kept).toBe(expectA.kept + expectB.kept)
    expect(t.recoup).toBe(expectA.recoup)
    expect(g.character.money - before).toBe(t.paid)
    const after = musicStore.mut(g)
    expect(after.deal?.unrecouped).toBe(5_000 - expectA.recoup)
    const [a, b, tiny, adopted, legacy] = after.ledger
    expect(a.lastYear).toBe(1996)
    expect(a.lastLabel).toBe(expectA.kept + expectA.recoup)
    expect(a.gross).toBe(expectA.gross)
    expect(a.paid).toBe(expectA.paid)
    expect(b.lastYear).toBe(1996)
    expect(b.paid).toBe(expectB.paid)
    expect([tiny.lastYear, tiny.paid, adopted.paid, adopted.lastYear, legacy.paid, legacy.lastYear]).toEqual([1995, 0, 0, 1995, 0, 1995])
    // a second call in the same year pays nothing
    const money = g.character.money
    const json = JSON.stringify(g)
    expect(stepCatalogue(ctx(g))).toEqual({ paid: 0, kept: 0, recoup: 0, rows: 0 })
    expect(g.character.money).toBe(money)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('keeps paying with no deal and with no job, and never recoups then', () => {
    const g = newMusician(17)
    signLedgerDeal(g)
    const s = musicStore.mut(g)
    s.ledger.push(row({ id: 'a', year: 1995, units0: 200_000, dealId: 'd1', rate: 0.16 }))
    g.year = 1996
    const c = ctx(g)
    g.character.job = null
    expect(dealOf(g, s)).toBeNull()
    const before = g.character.money
    const t = stepCatalogue(c)
    const w = waterfall(s.ledger[0], 80_000, formatMix('us', 1996), null)
    expect(t.recoup).toBe(0)
    expect(t.paid).toBe(w.paid)
    expect(t.paid).toBeGreaterThan(0)
    expect(g.character.money - before).toBe(t.paid)
    expect(s.deal?.unrecouped).toBe(80_000)
  })

  it('stops paying under 50 units and follows the tail year by year', () => {
    const g = newMusician(18)
    const s = musicStore.mut(g)
    s.ledger.push(row({ id: 'a', year: 1995, units0: 5_000, k: 0.2 }))
    let paidYears = 0
    for (let y = 1996; y <= 2000; y++) {
      g.year = y
      const t = stepCatalogue(ctx(g))
      if (t.paid > 0) paidYears++
      const units = Math.round(5_000 * 0.2 ** (y - 1995))
      expect(t.rows).toBe(units >= 50 ? 1 : 0)
    }
    expect(paidYears).toBe(2)
  })

  it('nextNet is the net of next year units at this year mix, and pure', () => {
    const g = newMusician(19)
    const r = row({ id: 'a', year: 1995, units0: 100_000, k: 0.4 })
    const json = JSON.stringify(g)
    const rng = g.rng
    const expected = waterfall(r, Math.round(100_000 * 0.4 ** 1), formatMix('us', 1995), null).net
    expect(nextNet(g, r)).toBe(expected)
    expect(nextNet(g, row({ ...r, year: 1993 }))).toBe(waterfall(r, Math.round(100_000 * 0.4 ** 3), formatMix('us', 1995), null).net)
    expect(nextNet(g, r)).toBeGreaterThan(0)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
  })
})
