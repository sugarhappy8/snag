// Music 2.0, Task 9: the close. A release through the real ledger pays 0.7x to 1.6x of the legacy $1.30 a
// unit over its life in every era, the record stays small after 40 simulated years of real play, the three
// spec scenarios (1962 US, 1995, 2026 Nigeria) play end to end, and an old labelled save keeps its value
// until its term ends. Fixed seeds; years step through nextYear.
import { afterEach, describe, expect, it } from 'vitest'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { hire } from '../src/game/special/common'
import { activeField } from '../src/game/special/kit/rivals'
import { appointmentId } from '../src/game/special/kit/state'
import { careerCtx, setCareerAudit, type AuditEvent } from '../src/game/special/kit/year'
import { ROYALTY_BASE, ceremonyAt, labelId } from '../src/game/special/music-data'
import { mdView, musicJob } from '../src/game/special/music-job'
import { baseRoyalty, labelsAt, offerDeal } from '../src/game/special/music-label'
import { MUSIC_SPEC, bookRelease, dominantFormat, formatMix, genreAt, stepCatalogue, waterfall } from '../src/game/special/music-market'
import { buybackListed, chartsMenu, labelMenu } from '../src/game/special/music-menu'
import { musicMaster, yearlyMusicRights } from '../src/game/special/music-rights'
import { adoptMusic, dealOf, musicStore, type MusicState } from '../src/game/special/music-state'
import type { ChoiceModal, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { namePoolOf } from '../src/game/world'
import { careerRoots, checkLedger, collectActions, drainCareer, finiteJson, nextYear } from './career-kit'
import { makeTestGame } from './helpers'

afterEach(() => setCareerAudit(null))

const SOLO = { mode: 'solo', instrument: 'Guitar', genre: 'Pop', label: null, contractYears: 0, advancePerYear: 0, popularity: 40, bandName: null, bandmates: [], members: 1, recordedAge: -1, lastRelease: -1 }

/** Number of nodes (values, arrays and objects) in a value. */
function nodes(v: unknown): number {
  if (Array.isArray(v)) return 1 + v.reduce((n: number, x) => n + nodes(x), 0)
  if (v && typeof v === 'object') return 1 + Object.values(v).reduce((n: number, x) => n + nodes(x), 0)
  return 1
}

const sOf = (g: GameState): MusicState => musicStore.peek(g)!

/** A life in a year and country with a guitar and cash, no job and no record. */
function lifeIn(seed: number, year: number, country: string, age = 30): GameState {
  const g = makeTestGame(seed, { age })
  g.year = year
  g.character.countryId = country
  g.character.money = 1_000_000
  g.flags.instruments = { Guitar: 60 }
  return g
}

/** Offers a deal through the negotiation and signs it: the modal leaves the queue, then its script runs. */
function signWith(g: GameState, name: string, tier: 0 | 1 | 2 | 3, advance = 90_000, years = 3): void {
  expect(offerDeal(g, { instrument: 'Guitar', labelId: labelId(name), label: name, tier, genre: 'Rock', advance, years, goingSolo: false })).toBe(true)
  const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'career.music.deal')
  expect(modal).toBeDefined()
  g.queue = g.queue.filter((m) => m !== modal)
  runScript(g, modal!.scriptId!, 'sign', modal!.data, modal!)
}

const release = (g: GameState, title: string, type = 'studio'): void => runScript(g, 'special.music.title', title, { type, subgenre: 'Dance' }, g.queue[0])

// ---------------------------------------------------------------------------

describe('the lifetime take of a release', () => {
  const ERAS = [1925, 1955, 1975, 1995, 2008, 2026]
  const LEGACY_PER_UNIT = 1.3

  /** A tier-1 deal with nothing unrecouped; one release of 200,000 sold, then the catalogue for 35 years. */
  function lifetime(year: number): { ratio: number; units: number; total: number; cash: number } {
    const g = makeTestGame(5, { age: 30 })
    g.year = year
    g.character.money = 100_000_000
    const { job } = hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Echo Chamber Records', salary: 0, data: { ...SOLO } as Record<string, Json> })
    const s = musicStore.mut(g)
    adoptMusic(g, s)
    s.deal = { id: 'd1', appt: appointmentId(job), labelId: 'echo-chamber-records', label: 'Echo Chamber Records', tier: 1, since: year, term: 3, years: 3, royalty: ROYALTY_BASE[1], advance: 0, perYear: 0, unrecouped: 0, trust: 55, legacy: false, renewals: 0 }
    const cash0 = g.character.money
    const booked = bookRelease(careerCtx(g, 'music', s), musicJob(g)!, { typeId: 'studio', title: 'Night Bus', subgenre: 'Dance', quality: 60, sold: 200_000, onTrend: false })
    let total = booked.paid
    for (let i = 0; i < 35; i++) {
      g.year += 1
      total += stepCatalogue(careerCtx(g, 'music', musicStore.mut(g))).paid
    }
    return { ratio: total / booked.row.units0, units: booked.row.units0, total, cash: g.character.money - cash0 }
  }

  it('a release pays 0.7x to 1.6x of the legacy 1.3 a unit over its life, in every era [RF5]', () => {
    for (const year of ERAS) {
      const r = lifetime(year)
      expect(r.cash, `${year} cash moved by exactly what the ledger paid`).toBe(r.total)
      expect(r.ratio, `${year} lifetime take per unit`).toBeGreaterThanOrEqual(LEGACY_PER_UNIT * 0.7)
      expect(r.ratio, `${year} lifetime take per unit`).toBeLessThanOrEqual(LEGACY_PER_UNIT * 1.6)
    }
  })
})

// ---------------------------------------------------------------------------

describe('the record after 40 years of play', () => {
  /** One release and one tour a year for 40 years through the real yearly hook, every popup answered by stance. */
  function fortyYears(seed: number, strategy: 'steady' | 'reckless'): { g: GameState; audit: AuditEvent[]; text: string[] } {
    const g = lifeIn(seed, 1995, 'us', 24)
    const audit: AuditEvent[] = []
    const text: string[] = []
    setCareerAudit((e) => audit.push(e))
    signWith(g, 'Echo Chamber Records', 1)
    for (let y = 0; y < 40; y++) {
      // a label that dropped the artist, or a walked-away renewal: audition again
      if (!musicJob(g)) signWith(g, 'Echo Chamber Records', 1)
      release(g, `Night Bus ${y}`)
      const tour = collectActions(g, careerRoots('music')(g)).find((a: MenuAction) => a.id === 'music.tour')
      if (tour) tour.run(g)
      drainCareer(g, strategy, text, audit)
      nextYear(g)
      drainCareer(g, strategy, text, audit)
    }
    return { g, audit, text }
  }

  for (const [seed, strategy] of [[11, 'steady'], [12, 'reckless']] as const) {
    it(
      `keeps the record under 3,000 JSON nodes and 20 KB after 40 simulated years, seed ${seed} [RF5]`,
      () => {
        const { g, audit, text } = fortyYears(seed, strategy)
        const s = sOf(g)
        const raw = g.flags['special.music.sim']
        expect(s.ledger.length).toBe(40) // a release a year for 40 years fills the ledger to its cap
        expect(s.history.length).toBeLessThanOrEqual(8)
        expect(s.tours.length).toBeGreaterThan(0) // the road was played, so the tour cap is exercised
        expect(s.tours.length).toBeLessThanOrEqual(8)
        expect(s.mods.length).toBeLessThanOrEqual(6)
        expect(s.awards.length).toBeLessThanOrEqual(24)
        expect(s.memory.length).toBeLessThanOrEqual(16)
        expect(Object.keys(s.cool).length).toBeLessThanOrEqual(24)
        expect(Object.keys(s.done).length).toBeLessThanOrEqual(24)
        expect(s.rows.length).toBeLessThanOrEqual(12)
        for (const row of s.ledger) {
          expect(row.k).toBeGreaterThanOrEqual(0.2)
          expect(row.k).toBeLessThanOrEqual(0.7)
          expect(row.rate).toBeGreaterThanOrEqual(0.05)
          expect(row.rate).toBeLessThanOrEqual(0.6)
          expect(row.peak).toBeLessThanOrEqual(20)
        }
        if (s.deal) {
          expect(s.deal.advance).toBeLessThanOrEqual(1_500_000)
          expect(s.deal.royalty).toBeGreaterThanOrEqual(0.05)
          expect(s.deal.royalty).toBeLessThanOrEqual(0.4)
        }
        expect(nodes(s)).toBeLessThan(3000)
        expect(nodes(raw)).toBeLessThan(3000)
        expect(JSON.stringify(s).length).toBeLessThan(20_000)
        expect(JSON.stringify(raw).length).toBeLessThan(20_000)
        expect(finiteJson(g)).toEqual([])
        expect(text).toEqual([])
        expect(checkLedger(audit, g).filter((l) => !l.startsWith('note-'))).toEqual([])
      },
      120_000,
    )
  }
})

// ---------------------------------------------------------------------------

describe('plays 1962, 1995 and 2026 Nigeria as the spec scenarios', () => {
  const statement = (g: GameState): string[] => (chartsMenu().children(g) as MenuNode[]).filter((n) => n.type === 'info').map((n) => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : ''))

  it('1962 US: a label, a vinyl statement, a chart of named acts, no streaming, no rap, the Golden Record Award', () => {
    const g = lifeIn(21, 1962, 'us')
    // the roster of the year: Echo Chamber Records (1950) is open, Garage Door (1965) and Big Noise (1975) are not
    const names = labelsAt(1962, 'us', g.character.city).map((l) => l.name)
    expect(names).toContain('Echo Chamber Records')
    expect(names).not.toContain('Garage Door Records')
    expect(names).not.toContain('Big Noise Music')
    signWith(g, 'Echo Chamber Records', 1)
    expect(dealOf(g, sOf(g))).toMatchObject({ label: 'Echo Chamber Records', tier: 1, years: 3, legacy: false })
    // a strong act, so the single has a real chance to chart
    const job = musicJob(g)!
    ;(job.data as Record<string, Json>).popularity = 90
    g.flags.instruments = { Guitar: 100 }
    const cash0 = g.character.money
    release(g, 'Night Bus', 'single')
    const row = sOf(g).ledger.at(-1)!
    expect(row).toMatchObject({ title: 'Night Bus', type: 'single', year: 1962, fmt: 'vinyl', dealId: sOf(g).deal!.id, legacy: false })
    expect(row.peak).toBeGreaterThan(0)
    expect(g.character.money - cash0).toBe(row.paid)
    // no streaming and no shellac this year
    const mix = formatMix('us', 1962)
    expect(mix.stream).toBe(0)
    expect(mix.shellac).toBe(0)
    expect(dominantFormat(mix)).toBe('vinyl')
    // the chart has named acts and no genre that is not open yet
    const field = activeField(g, MUSIC_SPEC, sOf(g).memory)
    expect(field.length).toBeGreaterThanOrEqual(10)
    for (const f of field) {
      expect(f.rival.name.trim().length).toBeGreaterThan(0)
      expect(['Rap', 'Reggae', 'Alternative']).not.toContain(genreAt(f.rival.edge, 1962))
    }
    const seen = statement(g)
    expect(seen.some((t) => /^1\. .+, score \d+$/.test(t))).toBe(true)
    expect(seen.join('\n')).not.toMatch(/, (Rap|Reggae|Alternative),/)
    expect(seen.find((t) => t.startsWith('Formats: '))).toMatch(/vinyl/)
    expect(seen.find((t) => t.startsWith('Formats: '))).not.toMatch(/stream|shellac/)
    expect(seen).toContain(`Your last peak: #${row.peak}.`)
    // the Golden Record Award starts in 1959
    expect(ceremonyAt('us', 1958)).toBeNull()
    expect(ceremonyAt('us', 1962)?.name).toBe('Golden Record Award')
  })

  it('1995: a three-year deal pays its advance yearly and the first release recoups 80% of the pool', () => {
    const g = lifeIn(31, 1995, 'us')
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    signWith(g, 'Echo Chamber Records', 1, 450_000, 3)
    const deal = sOf(g).deal!
    expect(deal).toMatchObject({ advance: 450_000, perYear: 150_000, term: 3, years: 3, royalty: baseRoyalty(1), unrecouped: 0, legacy: false })
    // year 1: the advance arrives once, through the ledger, and the label books it as owed
    const cash1 = g.character.money
    nextYear(g)
    expect(g.character.money - cash1).toBe(150_000)
    expect(sOf(g).deal).toMatchObject({ years: 2, unrecouped: 150_000 })
    expect(events.filter((e) => e.t === 'earn' && e.label === 'Label advance')).toHaveLength(1)
    g.queue = []
    // the first release: the label recoups 80% of the pool, the artist is paid the rest, cash moves by exactly that
    ;(musicJob(g)!.data as Record<string, Json>).popularity = 20
    const before = sOf(g).deal!.unrecouped
    const cash2 = g.character.money
    release(g, 'Night Bus')
    const row = sOf(g).ledger.at(-1)!
    const w = waterfall(row, row.units0, formatMix('us', g.year), { id: deal.id, unrecouped: before })
    expect(row).toMatchObject({ fmt: 'cd', dealId: deal.id, rate: baseRoyalty(1), legacy: false })
    expect(before).toBeGreaterThan(Math.round(w.pool * 0.8)) // the 80% rule binds, not the balance
    expect(w.recoup).toBe(Math.round(w.pool * 0.8))
    expect(row.paid).toBe(w.paid)
    expect(g.character.money - cash2).toBe(w.paid)
    expect(sOf(g).deal!.unrecouped).toBe(before - w.recoup)
    expect(w.gross).toBe(w.costs + w.kept + w.recoup + w.bandCut + w.paid)
    expect(row.lastLabel).toBe(w.kept + w.recoup)
    // it charts against that year's named acts
    expect(row.peak).toBeGreaterThanOrEqual(0)
    expect(row.peak).toBeLessThanOrEqual(20)
    expect(activeField(g, MUSIC_SPEC, sOf(g).memory).length).toBeGreaterThanOrEqual(10)
    expect(checkLedger(events, g)).toEqual([])
    // years 2 and 3 pay the advance again and the term runs out into the renewal screen with a push
    ;(musicJob(g)!.data as Record<string, Json>).popularity = 60
    nextYear(g)
    g.queue = []
    nextYear(g)
    expect(events.filter((e) => e.t === 'earn' && e.label === 'Label advance')).toHaveLength(3)
    const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'career.music.deal')
    expect(modal).toBeDefined()
    expect(modal!.choices.map((c) => c.id)).toEqual(['sign', 'push', 'walk'])
    expect(modal!.data).toMatchObject({ renew: true, dealId: deal.id })
  })

  it('2026 Nigeria: a stream statement, Nigerian acts, the Naija Sound, and a master bought back and left to an heir', () => {
    const g = lifeIn(41, 2026, 'ng')
    signWith(g, 'Big Noise Music', 1)
    ;(musicJob(g)!.data as Record<string, Json>).popularity = 60
    release(g, 'Lagos Night')
    const row = sOf(g).ledger.at(-1)!
    expect(row).toMatchObject({ title: 'Lagos Night', year: 2026, fmt: 'stream', legacy: false })
    expect(dominantFormat(formatMix('ng', 2026))).toBe('stream')
    expect(statement(g).find((t) => t.startsWith('Formats: '))).toMatch(/stream/)
    // the chart is Nigerian: most acts carry names from the Nigerian pool, the rest come from abroad
    const pool = namePoolOf('ng')
    const field = activeField(g, MUSIC_SPEC, sOf(g).memory)
    expect(field.length).toBeGreaterThanOrEqual(10)
    const home = field.filter((f) => f.rival.country === 'ng')
    expect(home.length / field.length).toBeGreaterThanOrEqual(0.5)
    for (const f of home) {
      expect([...pool.male, ...pool.female].some((first) => f.rival.name.startsWith(`${first} `)), f.rival.name).toBe(true)
      expect(pool.last.some((last) => f.rival.name.endsWith(` ${last}`)), f.rival.name).toBe(true)
    }
    // the ceremony of the country opens in 2000
    expect(ceremonyAt('ng', 1999)).toBeNull()
    expect(ceremonyAt('ng', 2026)?.name).toBe('Naija Sound')
    // two years on the label still holds the master: buy it back into an asset
    nextYear(g)
    g.queue = []
    nextYear(g)
    g.queue = []
    const live = sOf(g).ledger.find((r) => r.id === row.id)!
    expect(buybackListed(g, live)).toBe(true)
    const buy = (labelMenu().children(g) as MenuNode[]).find((n): n is MenuAction => n.type === 'action' && n.id === `music.buyback.${row.id}`)
    expect(buy).toBeDefined()
    const cash = g.character.money
    buy!.run(g)
    expect(g.character.money).toBeLessThan(cash)
    const mine = g.assets.find((a) => musicMaster(a))
    expect(mine).toBeTruthy()
    expect(musicMaster(mine!)!.stage).toBe('released')
    expect(sOf(g).ledger.find((r) => r.id === row.id)!.adopted).toBe(true)
    // it goes to the heir with the will, and pays the heir
    const heir = createPerson(g, { relation: 'child', age: 25, firstName: 'Heir', livesWithPlayer: true })
    heir.relationship = 90
    g.character.willBeneficiaries = [heir.id]
    g.character.alive = false
    const n = continueAsChild(g, heir.id)
    expect(n).not.toBe(g)
    const inherited = n.assets.find((a) => a.id === mine!.id && musicMaster(a))
    expect(inherited).toBeTruthy()
    expect(musicStore.has(n)).toBe(false)
    n.queue = []
    n.year += 1
    n.yearActions = {}
    const heirCash = n.character.money
    yearlyMusicRights(n)
    expect(n.character.money).toBeGreaterThan(heirCash)
  })
})

// ---------------------------------------------------------------------------

describe('an old labelled save', () => {
  const LEGACY_DATA = { ...SOLO, label: 'Garage Door Records', contractYears: 3, advancePerYear: 10_000, popularity: 30 }

  /** The hand-built life of test/music-legacy.test.ts (seed 3): a labelled solo, no sim record. */
  function legacyLife(data: Record<string, unknown> = LEGACY_DATA): GameState {
    const g = makeTestGame(3, { age: 25 })
    g.flags.instruments = { Guitar: 55 }
    g.character.money = 100_000
    hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: data as Record<string, Json> })
    return g
  }

  it('leaves an old labelled save its value until the term ends [RF2]', () => {
    // a release inside the term returns the legacy numbers (the golden of test/music-legacy.test.ts, seed 3)
    const a = legacyLife()
    const cash0 = a.character.money
    release(a, 'Night Bus')
    const r = (a.flags['special.music'] as { discography: { sold: number; earned: number; royalty: number; quality: number }[] }).discography[0]
    expect(r).toMatchObject({ quality: 57, sold: 44_055, earned: 44_055, royalty: 6_608 })
    expect(a.character.money - cash0).toBe(44_055)
    expect(sOf(a).ledger[0]).toMatchObject({ legacy: true, units0: 44_055, gross: 44_055, paid: 44_055, dealId: 'legacy' })
    expect(sOf(a).deal).toMatchObject({ id: 'legacy', legacy: true, royalty: 1, perYear: 10_000, unrecouped: 0 })
    // each year the advance pays once and the legacy tail halves; nothing is recouped
    let tail = r.royalty
    for (let y = 1; y <= 3; y++) {
      const before = a.character.money
      nextYear(a)
      a.queue = a.queue.filter((m) => m.kind === 'choice' && m.scriptId === 'career.music.deal')
      expect(a.character.money - before, `year ${y}`).toBe(10_000 + (tail >= 25 ? tail : 0))
      tail = tail >= 25 ? Math.round(tail / 2) : 0
      if (y < 3) expect(sOf(a).deal).toMatchObject({ legacy: true, unrecouped: 0, years: 3 - y })
    }
    expect(sOf(a).ledger[0].paid).toBe(44_055) // the legacy row never settles again
    // this act ended the term below popularity 35: the old rule drops it, the last advance paid and nothing owed
    expect(sOf(a).deal).toBeNull()
    expect(sOf(a).history.at(-1)).toMatchObject({ label: 'Garage Door Records', ended: 'dropped', forgiven: 0 })

    // a life that never acts: the advance pays three times across the adoption tick, then the renewal opens clear
    const g = legacyLife({ ...LEGACY_DATA, popularity: 70 })
    expect(musicStore.has(g)).toBe(false)
    for (let y = 1; y <= 3; y++) {
      const before = g.character.money
      nextYear(g)
      expect(g.character.money - before, `year ${y}`).toBe(10_000)
      expect(mdView(musicJob(g)!).contractYears).toBe(3 - y)
    }
    expect(sOf(g).deal).toMatchObject({ id: 'legacy', legacy: true, years: 0, unrecouped: 0 })
    const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'career.music.deal')
    expect(modal).toBeDefined()
    expect(modal!.data).toMatchObject({ renew: true, dealId: 'legacy', tier: 0, carry: 0, pushed: false })
    expect((modal!.data as { royalty: number }).royalty).toBeCloseTo(baseRoyalty(0) + 0.02, 3)
    // signing it leaves a ledger deal at the new royalty with nothing carried
    g.queue = g.queue.filter((m) => m !== modal)
    runScript(g, modal!.scriptId!, 'sign', modal!.data, modal!)
    expect(sOf(g).deal).toMatchObject({ legacy: false, unrecouped: 0, renewals: 1 })
    expect(sOf(g).deal!.royalty).toBeCloseTo(baseRoyalty(0) + 0.02, 3)
  })
})
