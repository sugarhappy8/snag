// R4 anachronism fixes: the two lines the nightly lint (test/anachronism.test.ts, 400 lives) finds on release/v5.3.0.
//   (a) The drone company in 2011. Drone & Air Taxi opens in 2005 (competition-data.ts), but 'drone' is no word before 2012
//       (events/era.ts), so the Start a Business row, the Name popup and the "You Need a Scientist" choice broke the lint in
//       slice 5 on main for five nights. A company in that trade says the word on every screen (rows, rivals, market, labs: more
//       than 45 flagged texts in a probe of three 2011 companies), so renaming the door would only move the finding. The founding waits until the
//       shared detector says the name fits (2012). The market, its curve and every company already running are untouched.
//   (b) The "Scouted!" scout "at the airport" in 1921. SCOUT_SPOTS held 'at the airport' with no year gate (the lint's air
//       travel rule starts in 1925). Latent since v1.4.0: an unstamped life reaches it too (164 of 926 scoutings in a probe of
//       3,000 lives). Before 1925 the pool is a twin with a stand-in in the airport's place, so it stays six lines in every year:
//       the text draw is the same one, and from 1925 the pool is the very array it was.
import { describe, expect, it } from 'vitest'
import { industryEraBlock, marketDef, sizeRatio } from '../src/game/business/competition-data'
import { industryProblem, startBusinessMenu, startFounding, tradeWordBlock } from '../src/game/business/founding'
import { INDUSTRIES } from '../src/game/business/industries'
import { INDUSTRY_IDS } from '../src/game/data/markets'
import { ERA_RULES, anachronismsIn } from '../src/game/events/era'
import { runScript } from '../src/game/scripts'
import { SCOUT_SPOTS, SCOUT_SPOTS_BEFORE_AIRPORTS, yearlyModel } from '../src/game/special/model'
import { textCursor } from '../src/game/text/draw'
import { pickLine } from '../src/game/text/pick'
import type { GameState, MenuAction, MenuNode, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------------------------- (a) the drone company

const DRONES = INDUSTRIES.drones

/** A rich founder with no technical background (so the "You Need a Scientist" choice comes up), in `year` and `countryId`. */
function founder(year: number, countryId: string): GameState {
  const g = makeTestGame(77, { age: 40, money: 500_000_000, countryId, stats: { happiness: 80, health: 90, smarts: 50, looks: 60 } })
  g.year = year
  g.lifeId = `drone-door-${year}-${countryId}`
  return g
}

function dronesRow(g: GameState): MenuAction {
  const row = startBusinessMenu.children(g).find((n: MenuNode): n is MenuAction => n.type === 'action' && n.id === 'biz.start.drones')
  expect(row, 'a row for drones').toBeTruthy()
  return row!
}

/** Plays the founding flow from the row to the registered company, taking the first way forward at each popup. Returns every text read. */
function found(g: GameState): string[] {
  const row = dronesRow(g)
  const read: string[] = [row.label, typeof row.subtitle === 'function' ? row.subtitle(g) : (row.subtitle ?? ''), row.hint?.(g) ?? '']
  g.queue = []
  row.run(g)
  for (let guard = 0; g.queue.length > 0; guard++) {
    expect(guard, 'the founding flow ends').toBeLessThan(40)
    const m: ModalItem = g.queue.shift()!
    switch (m.kind) {
      case 'notice':
        read.push(`${m.title} :: ${m.text}`)
        break
      case 'choice': {
        read.push(`${m.title} :: ${m.text}`, ...m.choices.map((c) => c.label))
        const way = m.choices.find((c) => c.id !== 'cancel')!
        runScript(g, m.scriptId!, way.id, m.data, m)
        break
      }
      case 'input':
        read.push(`${m.title} :: ${m.text ?? ''}`)
        runScript(g, m.scriptId, m.defaultValue ?? 'Rotora Aero', m.data, m)
        break
      default:
        throw new Error(`unexpected popup ${m.kind}`)
    }
  }
  read.push(...g.log.flatMap((y) => y.entries.map((e) => e.text)), ...g.character.memories)
  return read.filter((t) => t.trim() !== '')
}

describe('(a) the drone company is founded once the word exists', () => {
  const COUNTRIES = ['us', 'gb', 'de'] as const

  it('is closed from 2005 to 2011, where the market is already open: the row is greyed, the reason is the trade\'s own, and a tap founds nothing', () => {
    for (let year = 2005; year <= 2011; year++) {
      for (const countryId of COUNTRIES) {
        const g = founder(year, countryId)
        const where = `${countryId} ${year}`
        const reason = industryProblem(g, 'drones')
        expect(reason, where).toBe(marketDef('drones').notYet)
        const row = dronesRow(g)
        expect(row.disabledReason?.(g), where).toBe(reason)
        expect(typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle, where).toBe('Not invented yet')
        g.queue = []
        startFounding(g, 'drones')
        expect(g.queue.map((q) => q.kind), where).toEqual(['notice'])
        expect(g.assets, where).toEqual([])
      }
    }
  })

  it('opens in 2012, and from then on the popups are the ones it always had', () => {
    for (const year of [2012, 2013, 2026, 2060]) {
      const g = founder(year, 'us')
      expect(industryProblem(g, 'drones'), `${year}`).toBeNull()
      expect(dronesRow(g).disabledReason?.(g) ?? null, `${year}`).toBeNull()
      expect(dronesRow(g).label).toBe(DRONES.label)
      const read = found(g)
      expect(read, `${year}`).toContain(`Name Your ${DRONES.label} :: ${DRONES.blurb} What will you call it?`)
      expect(read.some((t) => t.startsWith('You Need a Scientist :: Investors only back a drone & air taxi company with a technical founder')), `${year}`).toBe(true)
      expect(read.some((t) => /^I founded .*, a drone & air taxi company in /.test(t)), `${year}`).toBe(true)
      expect(g.assets.some((a) => a.kind === 'business'), `${year}`).toBe(true)
    }
  })

  it('clears the lint in every popup, log line and memory of founding it, wherever and whenever it is open (1900-2060)', () => {
    let founded = 0
    const years = [1900, 1950, 2000, ...Array.from({ length: 17 }, (_, i) => 2004 + i), 2030, 2060]
    for (const year of years) {
      for (const countryId of COUNTRIES) {
        const g = founder(year, countryId)
        if (industryProblem(g, 'drones')) continue
        const read = found(g)
        founded++
        expect(g.assets.some((a) => a.kind === 'business'), `${countryId} ${year} owns the company`).toBe(true)
        const bad = read.flatMap((t) => {
          const hits = anachronismsIn(t, year, [countryId])
          return hits.length ? [`[${hits.join(',')}] ${t.slice(0, 160)}`] : []
        })
        expect(bad, `${countryId} ${year}`).toEqual([])
      }
    }
    expect(founded, 'companies founded').toBe(3 * 11)
  })

  it('only closes the door: the market still opens in 2005, so a company that is already running carries on', () => {
    expect(marketDef('drones').from).toBe(2005)
    for (let year = 2005; year <= 2011; year++) {
      expect(industryEraBlock('drones', 'us', year), `${year}`).toBeNull()
      expect(sizeRatio('drones', year), `${year}`).toBeGreaterThan(0)
    }
    expect(sizeRatio('drones', 2004)).toBe(0)
  })

  it('leaves every other trade alone, in every year', () => {
    for (const year of [1900, 1950, 1985, 2005, 2011, 2012, 2026]) {
      const g = founder(year, 'us')
      for (const id of INDUSTRY_IDS) if (id !== 'drones') expect(tradeWordBlock(g, id), `${id} ${year}`).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------------------------- (b) the scout

/** A 21-year-old with the Modeling talent and a face for it, in `year`: one yearly step is one chance of being scouted. */
function model(seed: number, year: number): GameState {
  const g = makeTestGame(seed, { age: 21, talents: ['Modeling'], stats: { happiness: 80, health: 90, smarts: 60, looks: 95 } })
  g.year = year
  g.lifeId = `scout-${year}-${seed}`
  return g
}

/** The "Scouted!" popup text the yearly step queued, or null when nobody stopped you. */
function scoutText(g: GameState): string | null {
  const m = g.queue.find((q) => q.kind === 'choice' && q.title === 'Scouted!')
  return m && m.kind === 'choice' ? m.text : null
}

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1)

const SIX = ['at the mall', 'at a coffee shop', 'on the train', 'at a music festival', 'at the airport', 'while you were crossing the street']

describe('(b) the scout stops you where there are places to stop you', () => {
  it('is never at the airport before airports, in 1921 or any year before 1925 (400 lives each)', () => {
    let scouted = 0
    for (const year of [1900, 1921, 1924]) {
      for (const seed of SEEDS) {
        const g = model(seed, year)
        yearlyModel(g)
        const text = scoutText(g)
        if (!text) continue
        scouted++
        expect(text, `seed ${seed} ${year}`).not.toMatch(/airport/)
        expect(anachronismsIn(text, year, ['us']), `seed ${seed} ${year}`).toEqual([])
      }
    }
    expect(scouted, 'the lives were scouted at all').toBeGreaterThan(200)
  })

  it('still happens at the airport once airports exist (1925 and later)', () => {
    for (const year of [1925, 1960, 2026]) {
      let airport = 0
      for (const seed of SEEDS) {
        const g = model(seed, year)
        yearlyModel(g)
        if (/stopped you at the airport and handed you a business card/.test(scoutText(g) ?? '')) airport++
      }
      expect(airport, `${year}: scouts at the airport in 400 lives`).toBeGreaterThan(5)
    }
  })

  it('keeps six spots in both pools, the old six and a twin that differs in the airport\'s place only', () => {
    expect(SCOUT_SPOTS).toEqual(SIX)
    expect(SCOUT_SPOTS_BEFORE_AIRPORTS.length).toBe(SIX.length)
    expect(SCOUT_SPOTS_BEFORE_AIRPORTS.map((s, i) => (s === SIX[i] ? null : [i, s, SIX[i]]))).toEqual([null, null, null, null, [4, 'outside the theater', 'at the airport'], null])
    for (const spot of [...SCOUT_SPOTS_BEFORE_AIRPORTS, ...SIX.filter((s) => s !== 'at the airport')]) expect(anachronismsIn(`stopped you ${spot}`, 1900, ['us']), spot).toEqual([])
  })

  it('switches in the year the lint says there are airports (1925), not a year of its own', () => {
    const year = ERA_RULES.find((r) => r.id === 'air travel')?.year
    expect(year).toBe(1925)
    expect(anachronismsIn('stopped you at the airport', 1924, ['us'])).toContain('air travel')
    expect(anachronismsIn('stopped you at the airport', 1925, ['us'])).toEqual([])
  })

  it('picks what the old six-line pool picked from 1925, and the same slot with the stand-in before it, on the same draws', () => {
    for (const year of [1900, 1921, 1924, 1925, 1960, 2026]) {
      for (const seed of SEEDS.slice(0, 200)) {
        const g = model(seed, year)
        const now = structuredClone(g)
        const was = structuredClone(g)
        const spot = pickLine(now, year >= 1925 ? SCOUT_SPOTS : SCOUT_SPOTS_BEFORE_AIRPORTS)
        const old = pickLine(was, SIX)
        expect(now.rng, `${year} seed ${seed}: g.rng`).toBe(was.rng)
        expect(textCursor(now), `${year} seed ${seed}: text draws`).toEqual(textCursor(was))
        if (year >= 1925) {
          expect(spot, `${year} seed ${seed}`).toBe(old)
          expect(now.flags, `${year} seed ${seed}: memory`).toEqual(was.flags)
        } else {
          expect(spot, `${year} seed ${seed}`).toBe(old === 'at the airport' ? 'outside the theater' : old)
        }
      }
    }
  })

  it('moves no draw: a scouting in 1921 takes the g.rng and text draws that one in 1930 takes (same life, same seed)', () => {
    let compared = 0
    for (const seed of SEEDS.slice(0, 150)) {
      const old = model(seed, 1921)
      const late = model(seed, 1930)
      // The same text stream for both: the life id is the only input that is not the year.
      old.lifeId = late.lifeId = `scout-draws-${seed}`
      const drawsBefore = [textCursor(old).n, textCursor(late).n]
      yearlyModel(old)
      yearlyModel(late)
      expect(old.rng, `seed ${seed}: g.rng`).toBe(late.rng)
      expect(textCursor(old).n - drawsBefore[0], `seed ${seed}: text draws`).toBe(textCursor(late).n - drawsBefore[1])
      if (scoutText(old)) compared++
    }
    expect(compared, 'scoutings compared').toBeGreaterThan(20)
  })
})
