import { afterEach, describe, expect, it } from 'vitest'
import { allBrands, brandAvailable } from '../src/game/data/brands'
import { rand } from '../src/game/rng'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { hire, leave, ownerKey } from '../src/game/special/common'
import { CAREER_SIMS } from '../src/game/special/kit/careers'
import { setCareerAudit, type AuditEvent } from '../src/game/special/kit/year'
import { modelJobNodes, yearlyModel } from '../src/game/special/model'
import { agencyRows, ensureContract, RENEWAL_SCRIPT } from '../src/game/special/model-agency'
import { retireModel } from '../src/game/special/model-exit'
import { buildBoard, boardOf, modelRows } from '../src/game/special/model-board'
import { CIRCUITS, agencyOpen, FACE_AGENCIES, homeCircuit } from '../src/game/special/model-data'
import { modelSim } from '../src/game/special/model-sim'
import { modelStore, readContract, type MdOffer, type ModelState } from '../src/game/special/model-state'
import type { ChoiceModal, GameState, Json, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { assertMenuPure, careerRoots, checkLedger, finiteJson, nextYear } from './career-kit'
import { makeTestGame } from './helpers'

const FLAG = 'special.model.sim'
const LEGACY = 'special.model'

afterEach(() => setCareerAudit(null))

const json = (v: unknown): Json => v as Json
const nodesIn = (v: unknown): number => (Array.isArray(v) ? 1 + v.reduce((n: number, x) => n + nodesIn(x), 0) : v && typeof v === 'object' ? 1 + Object.values(v).reduce((n: number, x) => n + nodesIn(x), 0) : 1)

const offer = (o: Partial<MdOffer> = {}): MdOffer => ({
  id: 'x1',
  kind: 'catalogue',
  season: 'year',
  circuit: '',
  brand: '',
  house: 'The client',
  fee: 20_000,
  days: 2,
  minLook: 0,
  minTitle: 0,
  abroad: false,
  window: 0,
  rivals: [],
  status: 'open',
  terms: null,
  ...o,
})

/** A hand-built legacy life like the one special-common-safety pins: an unknown company, salary 10,000, no record. */
function handLife(o: { year?: number; age?: number; salary?: number; looks?: number; money?: number; country?: string } = {}): GameState {
  const age = o.age ?? 30
  const g = makeTestGame(1001, { age, money: o.money ?? 0, countryId: o.country ?? 'us' })
  g.year = o.year ?? 1995
  g.log = [{ age, year: g.year, entries: [] }]
  g.character.stats.looks = o.looks ?? 90
  g.character.job = {
    defId: 'model',
    title: 'Model',
    company: 'Test Agency',
    category: 'special',
    salary: o.salary ?? 10_000,
    level: 0,
    performance: 90,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { tier: 0, gigsThisYear: 0, sabotaged: 0 },
  }
  return g
}

/** Puts a board of booked offers (fee, commission 25%, mother 5%) on this year's record. */
function book(g: GameState, fees: number[], terms: MdOffer['terms'] = { agency: 'Test Agency', commission: 25, mother: 5 }): ModelState {
  const s = modelStore.mut(g)
  s.board = { year: g.year, items: fees.map((fee, i) => offer({ id: `b${i}`, fee, status: 'booked', terms })) }
  return s
}

describe('model yearly settle', () => {
  it('settles once per (year, age) and pays each booked fee once [RF3]', () => {
    const g = handLife()
    book(g, [20_000, 30_000])
    nextYear(g)
    yearlySpecial(g)
    const s = modelStore.view(g)
    // 14,000 + 21,000 of net fees over the 10,000 retainer the legacy hook already paid: the sim adds 25,000
    expect(g.character.money).toBe(35_000)
    expect(s.ledger.map((r) => [r.src, r.gross, r.agency, r.mother, r.recoup, r.net])).toEqual([
      ['The client', 20_000, 5_000, 1_000, 10_000, 4_000],
      ['The client', 30_000, 7_500, 1_500, 0, 21_000],
    ])
    for (const r of s.ledger) expect(r.gross).toBe(r.agency + r.mother + r.recoup + r.net)
    expect(s.life).toMatchObject({ gross: 50_000, net: 25_000, agency: 12_500, mother: 2_500, recoup: 10_000, booked: 2 })
    const once = JSON.stringify(g)
    const rng = g.rng
    yearlySpecial(g)
    expect(JSON.stringify(g)).toBe(once)
    expect(g.rng).toBe(rng)
    expect(g.character.money).toBe(35_000)
  })

  it('never pays a fee already paid', () => {
    const g = handLife()
    const s = modelStore.mut(g)
    s.board = { year: g.year, items: [offer({ fee: 50_000, status: 'paid', terms: { agency: 'Test Agency', commission: 20, mother: 0 } })] }
    nextYear(g)
    yearlySpecial(g)
    expect(g.character.money).toBe(10_000)
    expect(modelStore.view(g).ledger).toEqual([])
  })

  it('offsets the retainer so total = max(floor, net fees)', () => {
    // no bookings: the legacy retainer is the whole pay
    const quiet = handLife()
    nextYear(quiet)
    yearlySpecial(quiet)
    expect(quiet.character.money).toBe(10_000)
    expect(modelStore.view(quiet).ledger).toEqual([])
    // net fees of 25,000 over a floor of 10,000: 15,000 on top
    const busy = handLife()
    book(busy, [31_250], { agency: 'Test Agency', commission: 20, mother: 0 })
    nextYear(busy)
    yearlySpecial(busy)
    expect(busy.character.money).toBe(25_000)
    expect(modelStore.view(busy).ledger[0]).toMatchObject({ gross: 31_250, agency: 6_250, recoup: 10_000, net: 15_000 })
    // net fees under the floor: the floor is all there is
    const thin = handLife()
    book(thin, [6_250], { agency: 'Test Agency', commission: 20, mother: 0 })
    nextYear(thin)
    yearlySpecial(thin)
    expect(thin.character.money).toBe(10_000)
    // the rewritten floor is next tick's retainer
    expect(modelStore.view(thin).floor).toBe(10_000)
  })

  it('pays the whole net of a booked fee once the job is gone: a stale floor covers nothing', () => {
    const ends: [string, (g: GameState) => void][] = [
      ['retire', (g) => retireModel(g)],
      ['walk away or fired', (g) => leave(g, 'fired')],
      ['quit', (g) => leave(g, 'quit')],
    ]
    for (const [name, end] of ends) {
      const g = handLife()
      book(g, [100_000], { agency: 'Test Agency', commission: 20, mother: 0 })
      expect(modelStore.view(g).floor, name).toBe(10_000) // the guarantee's retainer, owed by the next legacy tick
      end(g)
      expect(g.character.job, name).toBeNull()
      const cash = g.character.money
      nextYear(g)
      yearlySpecial(g)
      // no job, so the legacy tick paid no retainer: nothing of the 80,000 net is covered
      expect(g.character.money - cash, name).toBe(80_000)
      expect(modelStore.view(g).ledger.at(-1), name).toMatchObject({ gross: 100_000, agency: 20_000, recoup: 0, net: 80_000 })
      expect(modelStore.view(g).floor, name).toBe(0)
    }
    // a model who stays still gets the max(floor, net) total
    const stay = handLife()
    book(stay, [100_000], { agency: 'Test Agency', commission: 20, mother: 0 })
    const before = stay.character.money
    nextYear(stay)
    yearlySpecial(stay)
    expect(stay.character.money - before).toBe(80_000)
  })

  it('sets a commission-only salary to 0 and offsets nothing', () => {
    const g = handLife()
    const s = modelStore.mut(g)
    const job = g.character.job!
    const k = ensureContract(g, job)!
    job.data.contract = json({ ...k, guarantee: false, exclusive: false, commission: 18 })
    s.floor = 0
    s.board = { year: g.year, items: [offer({ fee: 20_000, status: 'booked', terms: { agency: 'Test Agency', commission: 18, mother: 0 } })] }
    nextYear(g)
    yearlySpecial(g)
    // the legacy hook paid the 10,000 it still saw on the job; nothing is offset against the 16,400 net
    expect(g.character.money).toBe(10_000 + 16_400)
    expect(g.character.job!.salary).toBe(0)
    expect(modelStore.view(g).floor).toBe(0)
  })

  it('keeps the legacy yearlyModel pin: unknown company pays exactly 10,000 and leaves g.rng on replay', () => {
    const g = handLife()
    yearlyModel(g)
    expect(g.character.money).toBe(10_000)
    const g2 = handLife()
    yearlySpecial(g2)
    expect(g2.character.money).toBe(10_000)
    const rng = g2.rng
    g2.character.lastName = 'Changed'
    yearlySpecial(g2)
    expect(g2.character.money).toBe(10_000)
    expect(g2.rng).toBe(rng)
  })

  it('is a no-op for a life with no model job and no record', () => {
    const g = makeTestGame(3, { age: 30 })
    const before = JSON.stringify(g)
    const rng = g.rng
    modelSim.yearly(g)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(rng)
    expect(CAREER_SIMS.map((x) => x.id)).toContain('model')
  })

  it('books the ledger to the cent through the audit sink', () => {
    const g = handLife()
    book(g, [20_000, 30_000])
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    nextYear(g)
    yearlySpecial(g)
    expect(checkLedger(events, g)).toEqual([])
    const books = events.filter((e) => e.t === 'books')
    expect(books).toHaveLength(1)
    expect(books[0]).toMatchObject({ career: 'model', where: 'settle', delta: 25_000, booked: 25_000 })
  })

  it('writes the new board at the settle once a board was worked, and nothing for an idle record', () => {
    const worked = handLife()
    book(worked, [20_000])
    nextYear(worked)
    const board = modelStore.view(worked).board
    expect(board.year).toBe(worked.year)
    expect(board.items.length).toBeGreaterThan(0)
    expect(board.items.every((o) => o.status === 'open')).toBe(true)
    expect(board.items).toEqual(buildBoard(worked, modelStore.view(worked)))
    const idle = handLife()
    nextYear(idle)
    expect(modelStore.view(idle).board).toEqual({ year: 0, items: [] })
  })

  it('pays an unsigned model the fees booked last year, with no retainer to offset', () => {
    const g = handLife()
    g.character.job = null
    book(g, [10_000], null)
    nextYear(g)
    expect(g.character.money).toBe(10_000)
    const s = modelStore.view(g)
    expect(s.ledger).toHaveLength(1)
    expect(s.ledger[0]).toMatchObject({ gross: 10_000, agency: 0, mother: 0, recoup: 0, net: 10_000 })
    expect(s.floor).toBe(0)
    const once = JSON.stringify(g)
    yearlySpecial(g)
    expect(JSON.stringify(g)).toBe(once)
  })

  it('keeps board, ledger, windows and rows in caps over 40 years and the record under 6,000 JSON nodes and 40 KB', () => {
    const g = handLife({ age: 20, looks: 100 })
    for (let year = 0; year < 40; year++) {
      const s = modelStore.mut(g)
      s.board = { year: g.year, items: Array.from({ length: 8 }, (_, i) => offer({ id: `y${year}.${i}`, fee: 5_000 + 1_000 * i, status: 'booked', brand: `Brand ${i}`, terms: { agency: 'Test Agency', commission: 20, mother: 5 } })) }
      s.windows = Array.from({ length: 12 }, (_, i) => ({ brand: `Brand ${i}`, category: 'watch', until: g.year + 1 }))
      g.character.stats.looks = 100
      nextYear(g)
      for (const m of g.queue.filter((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === RENEWAL_SCRIPT)) runScript(g, RENEWAL_SCRIPT, 'renew', m.data, m)
      g.queue = []
      g.character.alive = true
    }
    const s = modelStore.view(g)
    expect(s.board.items.length).toBeLessThanOrEqual(8)
    expect(s.ledger.length).toBeLessThanOrEqual(24)
    expect(s.windows.length).toBeLessThanOrEqual(8)
    expect(s.rows.length).toBeLessThanOrEqual(12)
    expect(s.agencies.length).toBeLessThanOrEqual(8)
    expect(nodesIn(g.flags[FLAG])).toBeLessThan(6_000)
    expect(JSON.stringify(g.flags[FLAG]).length).toBeLessThan(40_000)
    expect(finiteJson(g)).toEqual([])
  })
})

describe('model season board', () => {
  it('builds the same board after burning g.rng, and the same JSON for the same seed twice', () => {
    const a = handLife({ year: 1999, country: 'jp' })
    const b = handLife({ year: 1999, country: 'jp' })
    const first = buildBoard(a, modelStore.view(a))
    for (let i = 0; i < 40; i++) rand(a)
    const rngBefore = a.rng
    expect(buildBoard(a, modelStore.view(a))).toEqual(first)
    expect(a.rng).toBe(rngBefore)
    expect(JSON.stringify(buildBoard(b, modelStore.view(b)))).toBe(JSON.stringify(first))
    expect(first.length).toBeGreaterThan(0)
    expect(first.length).toBeLessThanOrEqual(8)
    expect(new Set(first.map((o) => o.id)).size).toBe(first.length)
  })

  it('reads the stored board of this year and derives a fresh one for any other year', () => {
    const g = handLife()
    const s = modelStore.mut(g)
    expect(s.board.items).toEqual([])
    const derived = boardOf(g, s)
    expect(derived.length).toBeGreaterThan(0)
    s.board = { year: g.year, items: [offer({ id: 'mine' })] }
    expect(boardOf(g, s).map((o) => o.id)).toEqual(['mine'])
    g.year += 1
    expect(boardOf(g, s).map((o) => o.id)).not.toContain('mine')
  })

  it('gates by era and country', () => {
    const kindsIn = (year: number, country: string, seeds = 6): MdOffer[] => {
      const out: MdOffer[] = []
      for (let seed = 1; seed <= seeds; seed++) {
        const g = handLife({ year, country })
        g.lifeId = `era-${seed}`
        out.push(...buildBoard(g, modelStore.view(g)))
      }
      return out
    }
    // 1935: no television, no social media, no faces, no runway week yet
    const old = kindsIn(1935, 'us')
    expect(old.length).toBeGreaterThan(0)
    for (const o of old) expect(['commercial', 'digital', 'face', 'runway']).not.toContain(o.kind)
    // 1950 US: the home circuit is New York, the only open show week outside Paris couture
    expect(homeCircuit('us', 1950)?.id).toBe('new-york')
    const fifties = kindsIn(1950, 'us').filter((o) => o.kind === 'runway')
    for (const o of fifties) {
      expect(o.circuit).toBe('new-york')
      expect(o.abroad).toBe(false)
    }
    // 1999 JP: Tokyo is home; every other week is abroad
    expect(homeCircuit('jp', 1999)?.id).toBe('tokyo')
    const nineties = kindsIn(1999, 'jp', 10).filter((o) => o.kind === 'runway')
    expect(nineties.length).toBeGreaterThan(0)
    for (const o of nineties) expect(o.abroad).toBe(o.circuit !== 'tokyo')
    expect(nineties.some((o) => o.circuit === 'tokyo')).toBe(true)
    // no agencies before 1925: the switch rows list none
    for (const name of Object.keys(FACE_AGENCIES)) expect(agencyOpen(name, 1924)).toBe(false)
    const early = handLife({ year: 1924 })
    const switchMenu = modelRows(early).find((n) => n.type === 'menu' && n.id === 'model.switch')
    const switchRows = switchMenu && switchMenu.type === 'menu' ? switchMenu.children(early) : []
    expect(switchRows.filter((n) => n.type === 'action')).toEqual([])
    // every brand is on sale in the player's country that year; nothing is dated after 2026
    for (const country of ['us', 'fr', 'jp', 'br']) {
      for (const year of [1930, 1950, 1975, 1999, 2010, 2025]) {
        for (const o of kindsIn(year, country, 3)) {
          if (!o.brand) continue
          expect(allBrands().some((b) => b.id === o.brand && b.name === o.house && brandAvailable(b, country, year) && b.founded <= year), `${o.brand} ${country} ${year}`).toBe(true)
          if (o.circuit) expect(CIRCUITS.find((c) => c.id === o.circuit)!.from).toBeLessThanOrEqual(year)
        }
      }
    }
    expect(CIRCUITS.every((c) => c.from <= 2026)).toBe(true)
  })

  it('closes abroad shows and trims the board in the war years, couture still posting', () => {
    const peace = handLife({ year: 1950, country: 'us' })
    const war = handLife({ year: 1944, country: 'us' })
    expect(buildBoard(war, modelStore.view(war)).length).toBeLessThanOrEqual(buildBoard(peace, modelStore.view(peace)).length)
    for (let seed = 1; seed <= 8; seed++) {
      war.lifeId = `war-${seed}`
      const board = buildBoard(war, modelStore.view(war))
      expect(board.length).toBeLessThanOrEqual(6)
      for (const o of board) if (o.kind === 'runway') expect(o.abroad).toBe(false)
    }
  })
})

describe('model records and menus', () => {
  const JUNK: unknown[] = [
    null,
    [],
    'x',
    42,
    { board: 'bad', ledger: 'bad', windows: 5, agencies: 7, proteges: 3, mother: 'x', life: [], focus: 'swimming' },
    { v: 1, board: { year: 'x', items: [null, 3, 'x', {}, { id: '' }, { id: 5 }] }, ledger: [null, [], { year: NaN }], windows: [1, null, {}], mother: [], strain: NaN, mood: Infinity },
    {
      v: 1,
      standing: 1e300,
      book: NaN,
      floor: 1e300,
      focus: 'x'.repeat(100),
      board: { year: 1995, items: Array.from({ length: 500 }, (_, i) => ({ id: `o${i}`, kind: 'couture', status: 'booked', fee: 1e300, days: 1e9, terms: { agency: 'x'.repeat(10_000), commission: 1e9, mother: -4 } })) },
      ledger: Array.from({ length: 500 }, () => ({ year: 1990, src: 'x'.repeat(10_000), gross: 1e300, agency: NaN, mother: -5, recoup: Infinity, net: 1e300 })),
    },
  ]

  it('keeps junk sim records harmless, with a junk legacy profile too [RF1][RF5]', () => {
    for (const junk of JUNK) {
      const g = handLife()
      g.flags[LEGACY] = json({ owner: ownerKey(g), headshot: 'bad', headshotAge: 'bad', couture: 'bad', gigs: 'bad', fashionWeeks: 'bad', rejectedBy: 'bad' })
      g.flags[FLAG] = json(junk && typeof junk === 'object' && !Array.isArray(junk) ? { owner: ownerKey(g), ...junk } : junk)
      expect(() => assertMenuPure(g, careerRoots('model')), 'menus').not.toThrow()
      for (let y = 0; y < 2; y++) {
        expect(() => {
          nextYear(g)
          g.queue = []
        }).not.toThrow()
      }
      expect(finiteJson(g)).toEqual([])
      const s = modelStore.view(g)
      expect(s.board.items.length).toBeLessThanOrEqual(8)
      expect(s.ledger.length).toBeLessThanOrEqual(24)
      expect(nodesIn(s)).toBeLessThan(3_000)
      expect(() => assertMenuPure(g, careerRoots('model'))).not.toThrow()
    }
  })

  it('keeps a junk job and a junk contract harmless [RF1]', () => {
    const contracts: unknown[] = ['bad', [1, 2], 7, { appointmentId: 5 }, { appointmentId: 'x', commission: NaN, until: 'soon', guarantee: 'yes' }, { until: 1e300, advance: -4, unrecouped: 1e300, bookerName: 'x'.repeat(10_000) }]
    for (const contract of contracts) {
      const g = handLife()
      const job = g.character.job!
      job.salary = NaN
      job.level = 1e9
      job.data.contract = json(contract)
      expect(() => assertMenuPure(g, careerRoots('model'))).not.toThrow()
      expect(() => {
        nextYear(g)
        g.queue = []
      }).not.toThrow()
      expect(finiteJson(g)).toEqual([])
      expect(() => assertMenuPure(g, careerRoots('model'))).not.toThrow()
    }
  })

  it('resolves legacy special.model.scout and booking modals queued before the first sim tick [RF4]', () => {
    const g = makeTestGame(9, { age: 24, money: 5_000 })
    g.year = 1995
    g.log = [{ age: 24, year: 1995, entries: [] }]
    g.character.stats.looks = 80
    const fake = (id: string): ModalItem => ({ kind: 'notice', id, title: '', text: '' })
    expect(() => runScript(g, 'special.model.scout', 'accept', json({ agency: 'Hometown Faces' }), fake('n1'))).not.toThrow()
    expect(g.character.job?.defId).toBe('model')
    expect(g.flags[FLAG]).toBeUndefined()
    expect(() => runScript(g, 'special.model.booking', 'catalog', undefined, fake('n2'))).not.toThrow()
    const legacy = g.flags[LEGACY] as Record<string, unknown> | undefined
    for (const key of Object.keys(legacy ?? {})) expect(['owner', 'headshot', 'headshotAge', 'couture', 'gigs', 'fashionWeeks', 'rejectedBy']).toContain(key)
  })

  it('still resolves a queued scout modal after the sim has a record, then adopts the job it signs [RF4]', () => {
    const g = makeTestGame(9, { age: 24, money: 5_000 })
    g.year = 1995
    g.log = [{ age: 24, year: 1995, entries: [] }]
    g.character.stats.looks = 80
    modelStore.mut(g)
    const fake = (id: string): ModalItem => ({ kind: 'notice', id, title: '', text: '' })
    runScript(g, 'special.model.scout', 'accept', json({ agency: 'Hometown Faces' }), fake('n1'))
    expect(g.character.job?.company).toBe('Hometown Faces')
    const legacy = JSON.stringify(g.flags[LEGACY])
    expect(() => nextYear(g)).not.toThrow()
    g.queue = []
    expect(readContract(g.character.job, g)).toMatchObject({ agency: 'Hometown Faces', guarantee: true, exclusive: true })
    expect(JSON.stringify(g.flags[LEGACY])).toBe(legacy)
    expect(modelStore.view(g).agencies.map((a) => a.name)).toEqual(['Hometown Faces'])
  })

  it('keeps a legacy model life byte-identical until its first sim tick adopts it [RF4]', () => {
    const g = makeTestGame(3, { age: 22 })
    g.year = 1995
    g.log = [{ age: 22, year: 1995, entries: [] }]
    g.character.stats.looks = 75
    g.flags[LEGACY] = json({ owner: ownerKey(g), headshot: 60, headshotAge: 20, couture: [], gigs: 10, fashionWeeks: 1, rejectedBy: ['Icon Elite'] })
    hire(g, { defId: 'model', title: 'Model', company: 'Silhouette Models', salary: 32_000, level: 1, data: { tier: 1, gigsThisYear: 0, sabotaged: 0 } })
    const before = JSON.stringify(g)
    modelStore.view(g)
    assertMenuPure(g, careerRoots('model'))
    for (const n of modelJobNodes(g)) if (n.type === 'menu') n.children(g)
    expect(JSON.stringify(g)).toBe(before)
    const legacy = JSON.stringify(g.flags[LEGACY])
    nextYear(g)
    g.queue = []
    const sim = g.flags[FLAG] as Record<string, unknown>
    expect(sim.v).toBe(1)
    expect(JSON.stringify(g.flags[LEGACY])).toBe(legacy)
    const written = JSON.stringify(sim)
    yearlySpecial(g)
    expect(JSON.stringify(g.flags[FLAG])).toBe(written)
  })

  it('lists the board, direction, contract, switch, rest and shoot rows for a signed model', () => {
    const g = handLife()
    const ids = modelRows(g).map((n) => ('id' in n ? n.id : ''))
    for (const id of ['model.board', 'model.focus', 'model.contract', 'model.switch', 'model.rest', 'model.shoot']) expect(ids).toContain(id)
    expect(agencyRows(g).map((n) => ('id' in n ? n.id : ''))).toEqual(['model.contract', 'model.switch'])
    const action = (nodes: MenuNode[]): MenuAction[] => nodes.filter((n): n is MenuAction => n.type === 'action')
    const board = modelRows(g).find((n) => n.type === 'menu' && n.id === 'model.board')
    expect(board && board.type === 'menu' ? action(board.children(g)).every((a) => a.id.startsWith('model.cast.')) : false).toBe(true)
  })
})
