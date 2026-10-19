import { beforeEach, describe, expect, it } from 'vitest'
import { allBrands } from '../src/game/data/brands'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import { SAVE_SCHEMA } from '../src/game/save-schema'
import { hire, ownerKey } from '../src/game/special/common'
import { careerCtx } from '../src/game/special/kit/year'
import { AGENCIES, DESIGNERS } from '../src/game/special/model'
import { BRAND_TIERS, circuitsAt, CIRCUITS, FACE_AGENCIES, FOCUSES, homeCircuit, housePool, KIND_IDS, KINDS, MAGAZINES, SEASON_CAP, SEASONS, TIER_FEE, TIER_PRESTIGE, TIER_REQ } from '../src/game/special/model-data'
import { modelStore, payOut, readContract, type MdContract, type MdOffer } from '../src/game/special/model-state'
import type { GameState, Json } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const FLAG = 'special.model.sim'
const LEGACY = 'special.model'

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

/** A 1995 life, age 22, looks 75, with a legacy profile (headshot 60, 10 gigs) and a Silhouette Models job on a 32,000 retainer. */
function legacyLife(): GameState {
  const g = makeTestGame(3, { age: 22 })
  g.year = 1995
  g.character.stats.looks = 75
  g.flags[LEGACY] = json({ owner: ownerKey(g), headshot: 60, headshotAge: 20, couture: [], gigs: 10, fashionWeeks: 1, rejectedBy: ['Icon Elite'] })
  hire(g, { defId: 'model', title: 'Model', company: 'Silhouette Models', salary: 32_000, level: 1, data: { tier: 1, gigsThisYear: 0, sabotaged: 0 } })
  return g
}

const bigOffers = Array.from({ length: 500 }, (_, i) => ({
  id: `o${i}`,
  kind: 'couture',
  season: 'couture',
  circuit: big(10_000),
  brand: big(10_000),
  house: big(10_000),
  fee: 1e300,
  days: 1e9,
  minLook: -5,
  minTitle: 99,
  abroad: 'yes',
  window: 1e9,
  rivals: Array.from({ length: 50 }, () => big(10_000)),
  status: 'booked',
  terms: { agency: big(10_000), commission: 1e9, mother: -4 },
}))
const bigRows = Array.from({ length: 500 }, (_, i) => ({ year: 1990 + (i % 40), src: big(10_000), gross: 1e300, agency: NaN, mother: -5, recoup: Infinity, net: 1e300 }))
const bigWindows = Array.from({ length: 500 }, (_, i) => ({ brand: big(10_000), category: big(10_000), until: 2000 + i }))
const bigProteges = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, name: big(10_000), born: 1990, look: 1e9, book: NaN, signed: -3 }))

const JUNK: unknown[] = [
  null,
  [],
  'x',
  42,
  { focus: 'swimming', board: 'bad', windows: 5, photographers: 'x', agencies: 7, ledger: 'bad', life: [], proteges: 3, mother: 'x', announced: 4 },
  { v: 1, board: { year: 'x', items: [null, 3, 'x', {}, { id: '' }, { id: 5 }] }, ledger: [null, [], { year: NaN }], windows: [1, null, {}], proteges: [{ id: '' }, { id: 1 }], mother: [], life: { gross: NaN, peak: 'x' } },
  {
    v: 1,
    owner: big(10_000),
    standing: 1e300,
    focus: big(100),
    focusYear: 1e300,
    restYear: -4,
    planYear: NaN,
    book: NaN,
    buzz: 1e300,
    rep: -1e300,
    strain: Infinity,
    mood: 'x',
    mother: { agency: big(10_000), booker: big(10_000), since: 1e300, overrideUntil: -9 },
    floor: 1e300,
    board: { year: 1e300, items: bigOffers },
    windows: bigWindows,
    photographers: Array.from({ length: 500 }, () => big(10_000)),
    agencies: Array.from({ length: 500 }, (_, i) => ({ name: big(10_000), from: 1e300, to: -i })),
    ledger: bigRows,
    life: { gross: 1e300, net: Infinity, agency: NaN, mother: -1, recoup: 'x', booked: 1e300, faces: -1, shows: 1e300, peak: 1e300, peakYear: 1e300 },
    proteges: bigProteges,
    exit: 'astronaut',
    likeness: 1e300,
    announced: Array.from({ length: 500 }, () => big(10_000)),
  },
]

describe('model state', () => {
  let g: GameState
  beforeEach(() => {
    g = legacyLife()
  })

  it('survives null, arrays, NaN, 500 rows and huge strings with every cap held [RF1]', () => {
    for (const junk of JUNK) {
      const r = modelStore.read(junk, g)
      expect(nonFinite(r)).toEqual([])
      expect(r.board.items.length).toBeLessThanOrEqual(8)
      expect(r.windows.length).toBeLessThanOrEqual(8)
      expect(r.photographers.length).toBeLessThanOrEqual(8)
      expect(r.agencies.length).toBeLessThanOrEqual(8)
      expect(r.ledger.length).toBeLessThanOrEqual(24)
      expect(r.proteges.length).toBeLessThanOrEqual(2)
      expect(r.announced.length).toBeLessThanOrEqual(8)
      expect(r.rows.length).toBeLessThanOrEqual(12)
      expect(r.memory.length).toBeLessThanOrEqual(16)
      expect(nodes(r)).toBeLessThan(3000)
      expect(JSON.stringify(r).length).toBeLessThan(40_000)
      expect(longest(r)).toBeLessThanOrEqual(90)
      expect(FOCUSES).toContain(r.focus)
      expect(['', 'photographer', 'label', 'agent']).toContain(r.exit)
      for (const k of [r.book, r.buzz, r.rep, r.strain, r.mood]) {
        expect(k).toBeGreaterThanOrEqual(0)
        expect(k).toBeLessThanOrEqual(100)
      }
      expect(r.floor).toBeGreaterThanOrEqual(0)
      expect(r.floor).toBeLessThanOrEqual(1e9)
      expect(r.likeness).toBeGreaterThanOrEqual(0)
      expect(r.likeness).toBeLessThanOrEqual(150_000)
      for (const o of r.board.items) {
        expect(KIND_IDS).toContain(o.kind)
        expect(SEASONS).toContain(o.season)
        expect(o.fee).toBeLessThanOrEqual(2_000_000)
        expect(o.days).toBeLessThanOrEqual(SEASON_CAP.year)
        expect(o.minTitle).toBeLessThanOrEqual(4)
        expect(o.rivals.length).toBeLessThanOrEqual(2)
        if (o.terms) expect([o.terms.commission >= 12, o.terms.commission <= 30]).toEqual([true, true])
      }
      for (const row of r.ledger) for (const n of [row.gross, row.agency, row.mother, row.recoup, row.net]) expect([n >= 0, n <= 6_000_000]).toEqual([true, true])
      for (const p of r.proteges) expect([p.look <= 100, p.book <= 100]).toEqual([true, true])
      expect(modelStore.read(r, g)).toEqual(r) // reading a record again changes nothing
    }
    // a 500-offer record keeps the newest 8 and a 500-row ledger the newest 24
    const r = modelStore.read(JUNK[JUNK.length - 1], g)
    expect(r.board.items.map((o) => o.id)).toEqual(['o492', 'o493', 'o494', 'o495', 'o496', 'o497', 'o498', 'o499'])
    expect(r.ledger).toHaveLength(24)
    expect(r.proteges).toHaveLength(2)
    // junk never throws through mut either
    for (const junk of JUNK) {
      const h = legacyLife()
      h.flags[FLAG] = json(junk && typeof junk === 'object' && !Array.isArray(junk) ? { ...junk, owner: ownerKey(h) } : junk)
      expect(() => modelStore.mut(h)).not.toThrow()
      expect(nonFinite(h.flags[FLAG])).toEqual([])
    }
  })

  it('migrates a legacy model life in memory [RF4]', () => {
    const before = JSON.stringify(g)
    const v = modelStore.view(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.flags[FLAG]).toBeUndefined()
    expect(modelStore.has(g)).toBe(false)
    // book = round(headshot x .35 + min(30, gigs x 1.5)) = round(21 + 15)
    expect([v.book, v.rep, v.strain, v.mood, v.buzz]).toEqual([36, 50, 10, 60, 0])
    expect([v.standing, v.peak, v.years]).toEqual([20, 20, 0])
    expect(v.focus).toBe('runway') // age 22, looks 75
    expect(v.mother).toEqual({ agency: 'Silhouette Models', booker: '', since: 1995, overrideUntil: 0 })
    expect(v.floor).toBe(32_000)
    expect([v.board.items, v.windows, v.photographers, v.agencies, v.ledger, v.proteges, v.announced]).toEqual([[], [], [], [], [], [], []])
    expect([v.exit, v.likeness, v.focusYear, v.restYear, v.planYear]).toEqual(['', 0, 0, 0, 0])
    expect(v.life).toEqual({ gross: 0, net: 0, agency: 0, mother: 0, recoup: 0, booked: 0, faces: 0, shows: 0, peak: 0, peakYear: 0 })

    const legacy = JSON.stringify(g.flags[LEGACY])
    const data = JSON.stringify(g.character.job?.data)
    modelStore.mut(g)
    modelStore.mut(g)
    expect((g.flags[FLAG] as unknown as { v: number }).v).toBe(1)
    expect(modelStore.has(g)).toBe(true)
    expect(modelStore.peek(g)?.book).toBe(36)
    expect(JSON.stringify(g.flags[LEGACY])).toBe(legacy)
    expect(JSON.stringify(g.character.job?.data)).toBe(data)
    // a re-read of the stored record is the same record
    const s = modelStore.view(g)
    expect(modelStore.read(s, g)).toEqual(s)

    // a runway focus needs age <= 25 and looks >= 70; the headshot and the gig count cap the book
    const old = legacyLife()
    old.character.age = 26
    expect(modelStore.view(old).focus).toBe('editorial')
    const plain = legacyLife()
    plain.character.stats.looks = 69
    expect(modelStore.view(plain).focus).toBe('editorial')
    const busy = legacyLife()
    busy.flags[LEGACY] = json({ owner: ownerKey(busy), headshot: 100, gigs: 500 })
    expect(modelStore.view(busy).book).toBe(65) // round(35 + 30)
    // no job: no mother agency and no floor
    const free = makeTestGame(5, { age: 20 })
    free.year = 1995
    const f = modelStore.view(free)
    expect([f.mother, f.floor, f.book, f.focus]).toEqual([null, 0, 0, 'editorial'])
  })

  it('reads a damaged legacy profile without throwing [RF1]', () => {
    for (const raw of [
      { credits: 'bad', rejectedBy: 'bad', couture: 'bad', headshot: 'bad', gigs: NaN },
      { headshot: 1e300, gigs: Infinity, headshotAge: 'x', rejectedBy: [1, null, {}] },
      { headshot: -5, gigs: -9 },
      [],
      7,
    ]) {
      const h = legacyLife()
      h.flags[LEGACY] = json(raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw, owner: ownerKey(h) } : raw)
      const v = modelStore.view(h)
      expect(nonFinite(v)).toEqual([])
      expect(v.book).toBeGreaterThanOrEqual(0)
      expect(v.book).toBeLessThanOrEqual(100)
      expect(() => modelStore.mut(h)).not.toThrow()
    }
    // a profile of another life reads as zeros
    const other = legacyLife()
    other.flags[LEGACY] = json({ owner: 'someone-else', headshot: 90, gigs: 40 })
    expect(modelStore.view(other).book).toBe(0)
  })

  it('starts an heir clean [RF2]', () => {
    const h = makeTestGame(9, { age: 30 })
    h.year = 1995
    h.flags[FLAG] = json({ owner: 'someone-else', v: 1, standing: 77, book: 88, rep: 90 })
    expect(modelStore.has(h)).toBe(false)
    expect(modelStore.peek(h)).toBeNull()
    expect([modelStore.view(h).standing, modelStore.view(h).book, modelStore.view(h).rep]).toEqual([20, 0, 50])
    // the name-based key of releases through v1.9.1 still matches after a rename
    const c = h.character
    h.flags[FLAG] = json({ owner: `${c.id}:${c.firstName}:${c.lastName}:${h.year - c.age}`, v: 1, standing: 61, book: 40 })
    c.lastName = 'Renamed'
    expect(modelStore.has(h)).toBe(true)
    expect(modelStore.view(h).book).toBe(40)
    // an heir (a new character) inherits no record, no ledger, no protege and no legacy profile
    const heir = structuredClone(g)
    modelStore.mut(heir)
    heir.character.id = 'heir'
    heir.character.job = null
    heir.generation = 2
    expect(modelStore.has(heir)).toBe(false)
    const v = modelStore.view(heir)
    expect([v.standing, v.book, v.rep, v.mother, v.floor, v.ledger, v.proteges, v.life.gross]).toEqual([20, 0, 50, null, 0, [], [], 0])
  })

  it('keeps SAVE_SCHEMA at 2', () => {
    expect(SAVE_SCHEMA).toBe(2)
    expect(modelStore.key).toBe('model.sim')
    expect(modelStore.version).toBe(1)
  })

  it('reads without writing, also on a frozen state [RF5]', () => {
    const f = deepFreeze(structuredClone(g))
    expect(() => modelStore.view(f)).not.toThrow()
    expect(() => modelStore.peek(f)).not.toThrow()
    expect(() => readContract(f.character.job, f)).not.toThrow()
    expect(JSON.stringify(f)).toBe(JSON.stringify(g))
    expect(modelStore.view(f).book).toBe(36)
    expect(readContract(f.character.job, f)?.agency).toBe('Silhouette Models')
  })

  it('keeps a record under 6,000 JSON nodes and 40 KB with every list full', () => {
    const r = modelStore.read(JUNK[JUNK.length - 1], g)
    expect(nodes(r)).toBeLessThan(6000)
    expect(JSON.stringify(r).length).toBeLessThan(40_000)
  })

  it('keeps the circuit, kind and agency tables of the design', () => {
    expect(FACE_AGENCIES['Hometown Faces']).toEqual({ from: 1925, book: 0 })
    expect(Object.keys(FACE_AGENCIES)).toEqual(AGENCIES.map((a) => a.name))
    expect(SEASON_CAP).toEqual({ couture: 8, aw: 12, ss: 12, year: 24 })
    expect(circuitsAt(1930).map((c) => c.city)).toEqual(['Paris'])
    expect(homeCircuit('us', 1950)?.city).toBe('New York')
    expect(homeCircuit('jp', 1999)?.city).toBe('Tokyo')
    expect(homeCircuit('jp', 1980)).toBeNull()
    expect(circuitsAt(2026).map((c) => c.city)).toEqual(['Paris', 'New York', 'Milan', 'Paris', 'London', 'Tokyo', 'Sao Paulo', 'Berlin'])
    expect(CIRCUITS.map((c) => [c.from, c.home])).toEqual([[1900, 'fr'], [1943, 'us'], [1958, 'it'], [1966, 'fr'], [1984, 'gb'], [1985, 'jp'], [1996, 'br'], [2007, 'de']])
    for (const c of CIRCUITS) expect(c.from).toBeLessThanOrEqual(PRESENT_YEAR)
    expect(KIND_IDS).toEqual(Object.keys(KINDS))
    for (const t of [BRAND_TIERS, TIER_REQ, TIER_PRESTIGE, TIER_FEE]) expect(t).toHaveLength(5)
    expect(TIER_REQ).toEqual([15, 28, 42, 58, 72])
    expect(TIER_PRESTIGE).toEqual([1.5, 2.5, 4, 6, 8])
  })

  it('takes clients only from registry categories and fictional houses from names outside the registry', () => {
    const categories = new Set(allBrands().map((b) => b.category))
    for (const def of Object.values(KINDS)) {
      expect(def.categories.length).toBeGreaterThan(0)
      for (const cat of def.categories) expect(categories.has(cat), `${def.id}: ${cat}`).toBe(true)
      expect(def.fee).toBeGreaterThan(0)
      expect(def.days[0]).toBeGreaterThanOrEqual(1)
      expect(def.days[1]).toBeGreaterThanOrEqual(def.days[0])
      for (const season of def.seasons) expect(SEASON_CAP[season]).toBeGreaterThanOrEqual(def.days[1])
      // the biggest fee a day can be paid stays under the offer cap
      expect(def.fee * TIER_FEE[4] * def.days[1] * 1.4 * 1.25 * 1.1).toBeLessThan(2_000_000)
    }
    const names = new Set(allBrands().map((b) => b.name.toLowerCase()))
    for (const house of [...MAGAZINES, ...DESIGNERS]) expect(names.has(house.toLowerCase()), house).toBe(false)
    expect(housePool('editorial')).toBe(MAGAZINES)
    expect(housePool('cover')).toBe(MAGAZINES)
    expect(housePool('runway')).toBe(DESIGNERS)
  })
})

describe('model contract', () => {
  it('reads a stored contract validated by the appointment id', () => {
    const g = legacyLife()
    const job = g.character.job!
    const id = job.data.appointmentId as string
    expect(readContract(null)).toBeNull()
    expect(readContract(job)).toBeNull() // nothing stored and no year to build one from
    job.data.contract = json({ appointmentId: id, agency: 'Icon Elite', tier: 3, commission: 24, guarantee: false, exclusive: false, since: 1994, until: 1998, advance: 6000, unrecouped: 2000, bookerId: 'b1', bookerName: 'Ines Duval' })
    const c = readContract(job) as MdContract
    expect(c).toEqual({ appointmentId: id, agency: 'Icon Elite', tier: 3, commission: 24, guarantee: false, exclusive: false, since: 1994, until: 1998, advance: 6000, unrecouped: 2000, bookerId: 'b1', bookerName: 'Ines Duval' })
    // a contract of another job (a changed appointment id) is ignored, with no legacy rebuild
    job.data.appointmentId = '1996:23:2'
    expect(readContract(job, g)).toBeNull()
    // a job with no stored appointment id derives one from its own fields
    const hand = { ...job, data: { startAge: 20 } as Record<string, Json> }
    expect(readContract(hand, g)?.appointmentId).toBe('model:Silhouette Models:20')
    hand.data.contract = json({ appointmentId: 'model:Silhouette Models:20', agency: 'X', commission: 99, since: 1990, until: 1991, advance: 5, unrecouped: 50 })
    const d = readContract(hand) as MdContract
    expect([d.commission, d.unrecouped, d.advance, d.tier, d.guarantee]).toEqual([30, 5, 5, 0, false])
    // junk never throws and stays bounded
    for (const junk of [null, 'x', 7, [], { appointmentId: 5 }, { appointmentId: id, agency: big(10_000), commission: NaN, since: 1e300, until: -1, advance: 1e300, unrecouped: Infinity, bookerName: big(10_000) }]) {
      const j = { ...job, data: { appointmentId: id, contract: json(junk) } as Record<string, Json> }
      expect(() => readContract(j, g)).not.toThrow()
      const r = readContract(j, g)
      if (r) {
        expect(nonFinite(r)).toEqual([])
        expect(longest(r)).toBeLessThanOrEqual(90)
        expect([r.commission >= 12, r.commission <= 30, r.until >= r.since, r.unrecouped <= r.advance]).toEqual([true, true, true, true])
      }
    }
  })

  it('builds the contract of a legacy job: guarantee, commission base + 3, two years [RF4]', () => {
    const g = legacyLife()
    const job = g.character.job!
    const before = JSON.stringify(g)
    const c = readContract(job, g) as MdContract
    expect(JSON.stringify(g)).toBe(before)
    expect(c).toEqual({ appointmentId: job.data.appointmentId, agency: 'Silhouette Models', tier: 1, commission: 23, guarantee: true, exclusive: true, since: 1995, until: 1997, advance: 0, unrecouped: 0, bookerId: '', bookerName: '' })
    // the tier comes from data.tier, else the AGENCIES row, else 0
    job.data.tier = 3
    expect([readContract(job, g)?.tier, readContract(job, g)?.commission]).toEqual([3, 25])
    delete job.data.tier
    expect(readContract(job, g)?.tier).toBe(1)
    job.company = 'Unknown House'
    expect([readContract(job, g)?.tier, readContract(job, g)?.commission]).toEqual([0, 21])
    // another career's job has no model contract
    job.defId = 'actor'
    expect(readContract(job, g)).toBeNull()
  })
})

describe('model payout', () => {
  it('pays the net once, books one ledger row and adds to the life totals', () => {
    const g = legacyLife()
    const s = modelStore.mut(g)
    const c = careerCtx(g, 'model', s)
    const cash = g.character.money
    // 20,000 fee, 25% agency, 5% mother, 2,000 unrecouped leaves 12,000
    const net = payOut(c, 'Client', 20_000, { agency: 5000, mother: 1000, recoup: 2000 })
    expect(net).toBe(12_000)
    expect(s.ledger).toEqual([{ year: 1995, src: 'Client', gross: 20_000, agency: 5000, mother: 1000, recoup: 2000, net: 12_000 }])
    expect(s.life).toMatchObject({ gross: 20_000, net: 12_000, agency: 5000, mother: 1000, recoup: 2000 })
    expect(g.character.money).toBeGreaterThan(cash)
    // the parts never exceed the gross, whatever the caller passes
    const n2 = payOut(c, 'Client', 1000, { agency: 900, mother: 900, recoup: 900 })
    const row = s.ledger[1]
    expect(row.gross).toBe(row.agency + row.mother + row.recoup + row.net)
    expect(n2).toBe(row.net)
    // bad input pays nothing and books nothing
    const len = s.ledger.length
    for (const bad of [NaN, -5, 0, 0.4, Infinity]) expect(payOut(c, 'Client', bad, { agency: 0, mother: 0, recoup: 0 })).toBe(0)
    expect(payOut(c, '', 5000, { agency: 0, mother: 0, recoup: 0 })).toBe(0)
    expect(s.ledger).toHaveLength(len)
    // the ledger keeps the newest 24 rows
    for (let i = 0; i < 30; i++) payOut(c, `Job ${i}`, 1000, { agency: 100, mother: 0, recoup: 0 })
    expect(s.ledger).toHaveLength(24)
    expect(s.ledger[23].src).toBe('Job 29')
  })

  it('holds paid gross to 6,000,000 a year', () => {
    const g = legacyLife()
    const s = modelStore.mut(g)
    const c = careerCtx(g, 'model', s)
    for (let i = 0; i < 5; i++) payOut(c, `Big ${i}`, 2_000_000, { agency: 0, mother: 0, recoup: 0 })
    const thisYear = s.ledger.filter((r) => r.year === 1995)
    expect(thisYear.reduce((n, r) => n + r.gross, 0)).toBeLessThanOrEqual(6_000_000)
    expect(s.life.gross).toBeLessThanOrEqual(6_000_000)
  })
})

describe('model offers', () => {
  it('reads an offer row from a stored board', () => {
    const g = legacyLife()
    const offer: MdOffer = { id: 'm1', kind: 'runway', season: 'aw', circuit: 'New York', brand: 'Client', house: 'Atelier Noir', fee: 12_000, days: 3, minLook: 50, minTitle: 2, abroad: false, window: 0, rivals: ['a', 'b'], status: 'open', terms: null }
    g.flags[FLAG] = json({ owner: ownerKey(g), v: 1, board: { year: 1995, items: [offer] } })
    expect(modelStore.view(g).board).toEqual({ year: 1995, items: [offer] })
  })
})
