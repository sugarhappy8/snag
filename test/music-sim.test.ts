// Music 2.0, Task 4: the yearly sim hook, the release booked through the ledger and the registry entry.
// The hook adopts on its first tick and leaves the legacy year whole, then pays the back catalogue once
// per (year, age); a release books through the same waterfall the catalogue settles with, so the cash
// always matches the audit.
import { afterEach, describe, expect, it } from 'vitest'
import { bindMoneyContext } from '../src/game/core'
import { runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { hire, leave, money, ownerKey } from '../src/game/special/common'
import { CAREER_SIMS } from '../src/game/special/kit/careers'
import { setCareerAudit, type AuditEvent } from '../src/game/special/kit/year'
import { formatMix, waterfall } from '../src/game/special/music-market'
import { musicCareerMenu, musicJobNodes, yearlyMusic } from '../src/game/special/music'
import { musicSim } from '../src/game/special/music-sim'
import { adoptMusic, musicScore, musicStore, type LedgerRow } from '../src/game/special/music-state'
import type { GameState, Json, NoticeModal } from '../src/game/types'
import { assertMenuPure, checkLedger, finiteJson, nextYear, voiceProblems } from './career-kit'
import { FailureLog, renderAll } from './fuzz-kit'
import { makeTestGame } from './helpers'

afterEach(() => setCareerAudit(null))

const SOLO_DATA = { mode: 'solo', instrument: 'Guitar', genre: 'Pop', label: 'Garage Door Records', contractYears: 3, advancePerYear: 10_000, popularity: 30, bandName: null, bandmates: [], members: 1, recordedAge: -1, lastRelease: -1 }
const BAND_DATA = { ...SOLO_DATA, mode: 'band', label: null, contractYears: 0, advancePerYear: 0, bandName: 'The Neon Wolves', bandmates: [], members: 3 }

/** A labelled legacy solo (Garage Door Records, 3 years, $10,000 a year), no sim record. */
function legacyLife(seed: number): GameState {
  const g = makeTestGame(seed, { age: 25 })
  g.flags.instruments = { Guitar: 55 }
  g.character.money = 100_000
  hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { ...SOLO_DATA } as Record<string, Json> })
  return g
}

/** A 1995 life with an unsigned job and an adopted record. */
function adopted(seed: number, data: Record<string, unknown> = SOLO_DATA, o: { label?: string | null } = {}): GameState {
  const g = makeTestGame(seed, { age: 30 })
  g.year = 1995
  g.flags.instruments = { Guitar: 55 }
  g.character.money = 1_000_000
  hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Independent', salary: 0, data: { ...data, label: o.label ?? null, contractYears: 0, advancePerYear: 0 } as Record<string, Json> })
  adoptMusic(g, musicStore.mut(g))
  return g
}

const yearOf = (g: GameState): void => nextYear(g, (x) => {
  yearlyMusic(x)
  musicSim.yearly(x)
})

function row(o: Partial<LedgerRow> = {}): LedgerRow {
  return { id: 'r1', title: 'Old Hit', type: 'studio', year: 1995, fmt: 'cd', units0: 100_000, k: 0.4, pay: 1, quality: 60, peak: 0, dealId: '', label: '', rate: 0.21, members: 1, samples: 'original', gross: 0, paid: 0, lastLabel: 0, lastYear: 1995, adopted: false, legacy: false, ...o }
}

const notices = (g: GameState, title: string): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice' && m.title === title)

describe('music sim hook', () => {
  it('is registered third, after the actor and the astronaut', () => {
    const ids = CAREER_SIMS.map((x) => x.id)
    expect(ids).toContain('music')
    expect(ids.indexOf('music')).toBeGreaterThan(ids.indexOf('astronaut'))
    expect(musicSim.id).toBe('music')
    expect(musicSim.key).toBe('music.sim')
  })

  it('is a pure no-op without a job and a record', () => {
    const g = makeTestGame(3, { age: 40 })
    g.year += 1
    g.character.age += 1
    const json = JSON.stringify(g)
    const rng = g.rng
    musicSim.yearly(g)
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
    // a legacy profile with no job and no record is just as quiet
    g.flags['special.music'] = { stageName: null, discography: [], burnedLabels: [], awards: [], tours: 0, concerts: 0 }
    const withProfile = JSON.stringify(g)
    musicSim.yearly(g)
    expect(JSON.stringify(g)).toBe(withProfile)
    expect(g.rng).toBe(rng)
    expect(musicStore.has(g)).toBe(false)
  })

  it('adopts on the first tick and returns, leaving the legacy year whole [RF2]', () => {
    const a = legacyLife(3)
    const b = structuredClone(a)
    for (const g of [a, b]) {
      g.year += 1
      g.character.age += 1
      g.yearActions = {}
      yearlyMusic(g)
    }
    musicSim.yearly(a)
    expect(a.character.money).toBe(b.character.money)
    expect(JSON.stringify(a.flags['special.music'])).toBe(JSON.stringify(b.flags['special.music']))
    expect(JSON.stringify(a.character.job)).toBe(JSON.stringify(b.character.job))
    expect(a.rng).toBe(b.rng)
    expect(a.queue.length).toBe(b.queue.length)
    const s = musicStore.peek(a)!
    expect(s.migrated).toBe(true)
    expect(s.standing).toBe(musicScore(a, s))
    expect(s.deal).toMatchObject({ id: 'legacy', legacy: true, royalty: 1, years: 2 })
  })

  it('settles once per (year, age) [RF3]', () => {
    const g = adopted(5)
    musicStore.mut(g).ledger.push(row({ units0: 100_000 }))
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    const m0 = g.character.money
    musicSim.yearly(g)
    expect(g.character.money).toBeGreaterThan(m0)
    const once = JSON.stringify(g)
    const rng = g.rng
    musicSim.yearly(g)
    expect(JSON.stringify(g)).toBe(once)
    expect(g.rng).toBe(rng)
  })

  it('keeps junk records harmless through yearlySpecial and every menu [RF1]', () => {
    const big = (n: number): string => 'x'.repeat(n)
    const bigLedger = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, title: big(10_000), type: 'podcast', year: 1e300, fmt: 'mp3', units0: 1e300, k: 9, pay: NaN, quality: 1e9, peak: 999, dealId: big(500), label: big(10_000), rate: 7, members: 1e9, samples: 'yes', gross: Infinity, paid: -5, lastLabel: 1e300, lastYear: NaN, adopted: 'yes', legacy: 1 }))
    const junk: unknown[] = [
      { v: 1, owner: 'placeholder', migrated: true, ledger: 'bad', deal: {}, history: 'x', tours: 5, mods: [null], policy: 7, awards: 5, rows: 'bad', memory: [1, 2], cool: 5, done: 'x', standing: 1e300 },
      { v: 1, owner: 'placeholder', migrated: true, ledger: bigLedger, deal: { id: big(500), label: big(10_000), royalty: 99, perYear: Infinity, advance: 1e300, unrecouped: 1e300, years: NaN }, awards: [big(10_000)], history: [big(10_000)], standing: -5 },
      { v: 1, owner: 'placeholder', migrated: false, ledger: bigLedger.slice(0, 3), deal: { id: 'legacy', legacy: true, years: 2, perYear: 1e300 } },
    ]
    for (const record of junk) {
      const g = adopted(7)
      g.flags['special.music.sim'] = { ...(record as Record<string, unknown>), owner: ownerKey(g) } as Json
      expect(() => yearOf(g)).not.toThrow()
      expect(() => nextYear(g, yearlySpecial)).not.toThrow()
      expect(finiteJson(g)).toEqual([])
      const log = new FailureLog()
      bindMoneyContext(g)
      try {
        renderAll(g, log, 7)
      } finally {
        bindMoneyContext(null)
      }
      expect(log.list().map((f) => f.first.message)).toEqual([])
      expect(() => assertMenuPure(g, (gg) => [musicCareerMenu, ...musicJobNodes(gg)])).not.toThrow()
    }
  })

  it('books a release through the ledger and the cash matches the audit [RF5]', () => {
    const g = adopted(11, BAND_DATA)
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    const before = g.character.money
    runScript(g, 'special.music.title', 'Night Bus', { type: 'studio', subgenre: 'Dance' }, g.queue[0])
    const s = musicStore.peek(g)!
    expect(s.ledger).toHaveLength(1)
    const r = (g.flags['special.music'] as { discography: { earned: number; sold: number; royalty: number }[] }).discography[0]
    expect(g.character.money - before).toBe(r.earned)
    expect(r.earned).toBe(s.ledger[0].paid)
    expect(r.royalty).toBe(0)
    expect(r.sold).toBe(s.ledger[0].units0)
    expect(s.ledger[0]).toMatchObject({ members: 3, dealId: '', legacy: false, year: 1995 })
    expect(checkLedger(events, g)).toEqual([])
    expect(events.filter((e) => e.t === 'books' && e.where === 'music.release')).toHaveLength(1)
    expect(events.some((e) => e.t === 'earn' && e.label === 'Royalties' && e.amount === r.earned)).toBe(r.earned > 0)
  })

  it('keeps a grandfathered release on the legacy numbers and pays the same cash', () => {
    const g = legacyLife(3)
    const before = g.character.money
    runScript(g, 'special.music.title', 'Night Bus', { type: 'studio', subgenre: 'Dance' }, g.queue[0])
    const r = (g.flags['special.music'] as { discography: { earned: number; sold: number; royalty: number }[] }).discography[0]
    expect(r).toMatchObject({ earned: 44_055, sold: 44_055, royalty: 6_608 })
    expect(g.character.money - before).toBe(44_055)
    const s = musicStore.peek(g)!
    expect(s.ledger[0]).toMatchObject({ legacy: true, gross: 44_055, paid: 44_055 })
    expect(s.deal?.legacy).toBe(true)
  })

  it('names the chart peak in the popup only when the release charted', () => {
    let charted = 0
    let off = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = adopted(seed, { ...SOLO_DATA, popularity: 90 })
      runScript(g, 'special.music.title', 'Night Bus', { type: 'studio', subgenre: 'Dance' }, g.queue[0])
      const peak = musicStore.peek(g)!.ledger[0].peak
      const popup = notices(g, 'Night Bus')[0]
      expect(popup).toBeDefined()
      if (peak > 0) {
        charted++
        expect(popup.text).toContain(`It peaked at #${peak}.`)
      } else {
        off++
        expect(popup.text).not.toContain('peaked')
      }
    }
    expect(charted + off).toBe(12)
    expect(charted).toBeGreaterThan(0)
  })

  it('pays the catalogue in later years, with the job gone, and says it once', () => {
    const g = adopted(13)
    musicStore.mut(g).ledger.push(row({ units0: 100_000, k: 0.4 }))
    leave(g, 'quit')
    expect(g.character.job).toBeNull()
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    const expected = waterfall(row(), 40_000, formatMix('us', 1996), null)
    expect(expected.paid).toBeGreaterThan(0)
    const m0 = g.character.money
    musicSim.yearly(g)
    expect(g.character.money - m0).toBe(expected.paid)
    const popups = notices(g, 'Royalty Statement')
    expect(popups).toHaveLength(1)
    const text = popups[0].text
    expect(voiceProblems(text, 'outcome')).toEqual([])
    expect(text.startsWith(`${money(expected.paid)} royalties.`)).toBe(true)
    expect(text).toContain(`kept ${money(expected.kept)}`)
    expect(text).not.toContain('recoup')
    expect(musicStore.peek(g)!.rows.at(-1)).toMatchObject({ y: 1996, income: expected.paid, note: '1 release paid royalties.' })
    // a second hook call in the same year adds none
    const json = JSON.stringify(g)
    musicSim.yearly(g)
    expect(notices(g, 'Royalty Statement')).toHaveLength(1)
    expect(JSON.stringify(g)).toBe(json)
  })

  it('says nothing and pays nothing when the catalogue is empty', () => {
    const g = adopted(14)
    g.year += 1
    g.character.age += 1
    g.yearActions = {}
    const m0 = g.character.money
    musicSim.yearly(g)
    expect(g.character.money).toBe(m0)
    expect(notices(g, 'Royalty Statement')).toHaveLength(0)
    expect(musicStore.peek(g)!.rows.at(-1)).toMatchObject({ y: 1996, income: 0, note: '' })
  })
})
