// R3-M4 (C.3): Operations R&D and the research team on the Effort engine. A program's odds, years and price come from `quote` with a
// fixed budget (kmax 1: money buys nothing here, the price is the whole lever), the scientists' labor shows as a `team` line, a
// failed program banks know-how on its track, and the words say why.
//
// What this file pins:
//   - every read of a program (odds, years, the why, the value, the menu row, the start) goes through the engine's `quote` (a spy on
//     it), and the legacy names are wrappers over it: opsOdds, opsYears, opsPrice keep their signatures and their numbers;
//   - parity against test/fixtures/effort-parity.json (recorded on v5.0.0): odds within 1 point, years and price exact, through the
//     legacy names and through the engine's own quote, and the scripted lifecycle byte for byte (g.rng, the levels, the cooldowns);
//   - the research team is a `team` line of the odds and still TEAM_ODDS times teamPower (lab-state.ts);
//   - a flop banks know-how on that track, so the next try there is higher by more than 0 and at most 15 points, another track's is
//     not, the reasons name it, the owner's notice says what went wrong and what was learned, and the draws stay where they were;
//   - the lab level is a view (opsKnowledge), never a second boost: the quote does not read it;
//   - the clamp (15% to 92%) and the budget (k 1) hold at 100x inputs, and the price never moves with cash, valuation or headcount;
//   - a hired CEO's company is steady, ambition 50 (D11), the player's own company is the player (ambition, posture);
//   - nothing here draws a number or writes the game (noDraw, a deep-frozen state), an NPC company banks nothing, a program from a
//     v5.0.0 save (no fx) resolves and banks, a damaged fx is dropped and a default life saves what v5.0.0 saved.
//
// No pinned seed: a life is the kit's own, with a tuple of arguments, and the flops are found with findSeed.
import { describe, expect, it, vi } from 'vitest'
import { bestLabMove, labAsset, opsGain, opsOdds, opsOffers, opsPrice, opsQuote, opsTask, opsValue, opsWhy, opsWhyLine, opsYears, teamValue } from '../src/game/business/lab-rules'
import { labMenus } from '../src/game/business/lab-menu'
import { LAB_LEVEL_MAX, OPS_PROGRAMS, OPS_TIER, opsProgram, RUNG_PENALTY, TEAM_ODDS } from '../src/game/business/lab-data'
import { OPS_ODDS_MAX, OPS_ODDS_MIN, opsField, opsKnowledge } from '../src/game/business/lab-effort'
import { applyWin, LAB_TRACKS, readLab, teamPower, type LabProgram, type LabTrack } from '../src/game/business/lab-state'
import { advanceLab, startOps } from '../src/game/business/lab-year'
import { bizWorth } from '../src/game/business/economy'
import { productIdeas } from '../src/game/business/products'
import { TOP_CEO_MAX_PTS, topCeoSteady } from '../src/game/business/ceo-edge'
import { advanceRd, bestRdIdea, launchP, rdReserve } from '../src/game/business/rd'
import { launchTeam } from '../src/game/business/research-effort'
import { readBiz, type BizState } from '../src/game/business/state'
import { clampN, money } from '../src/game/business/util'
import { quote } from '../src/game/effort/engine'
import { normalizeFx, newFx } from '../src/game/effort/fx'
import { KNOW_ODDS_MAX } from '../src/game/effort/limits'
import { ambitionOf, readYou, writeYou } from '../src/game/effort/persona'
import { isField } from '../src/game/effort/task'
import { rand } from '../src/game/rng'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { expectLifecycle, expectParity, setCompany, TOL, tradeFixture, type Input, type Point } from './effort-parity-kit'
import { ceoSlack } from './ceo-edge-kit'
import { deepFreeze } from './fuzz-kit'
import { noDraw, patchLab } from './lab-kit'
import { findSeed } from './seed-kit'

// The engine's `quote`, wrapped: the real one answers, the spy counts. Every import of it (the adapter's) sees the wrapper.
vi.mock('../src/game/effort/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/game/effort/engine')>()
  return { ...real, quote: vi.fn(real.quote) }
})
const spy = vi.mocked(quote)

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const LIFE = [5, 2030] as const
const ID = 'ops.cost.2'
const DEF = opsProgram(ID)!
const RUNGS = [1, 2, 3] as const
const TRADE_OF: Record<string, string> = { low: 'restaurant', mid: 'brewery', high: 'software' }

/** A restaurant at the default actor (ambition 50, steady, fatigue 0), its owner running it. */
function owned(life: readonly [number, number] = LIFE) {
  return tradeFixture('restaurant', life)
}

/** The same company with a hired manager of `skill` and a research team of `scientists`. */
function hired(skill: number, scientists = 0, life: readonly [number, number] = LIFE) {
  const f = owned(life)
  setCompany(f.g, f.b, { manager: skill, quality: 50, scientists, staff: 0, projects: 0 })
  return f
}

type Fixture = { g: GameState; a: Asset; b: BizState }

/** A program of `id` that finishes at the next year end, rolled against `odds`: started the way the menu starts one. */
function ready(f: Fixture, id = ID, odds = 0.02): LabProgram {
  if (startOps(f.g, f.a, f.b, id, true) === null) throw new Error('the program did not start')
  patchLab(f.b, (d) => {
    const p = d.programs.find((x) => x.id === id)!
    p.odds = odds
    p.progress = p.years - 1
  })
  f.g.queue = []
  return readLab(f.b).programs.find((x) => x.id === id)!
}

/** The measure of the oracle's ops grid, read through the engine's own quote instead of the legacy names. */
const engineMeasure = ({ g, a, b }: Point, input: Input) => {
  const def = opsProgram(input.program as string)!
  const q = opsQuote(g, b!, def.rung, def.track, a)
  return { odds: q.p, years: q.years, cost: q.spend }
}

const rowsOf = (g: GameState, a: Asset): MenuNode[] => (labMenus(a, readBiz(g, a))[0] as MenuGroup).children(g)
const rowOf = (g: GameState, a: Asset, id: string): MenuAction => rowsOf(g, a).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.mkt.lab.ops.${id}.${a.id}`)!
const textOf = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')

describe('every read of a program goes through the engine', () => {
  it('opsOdds, opsYears, opsQuote, opsWhy, opsGain and opsValue call quote, with a task in the track’s own field and a budget of one', () => {
    const { g, a, b } = owned()
    const reads = [
      () => opsOdds(g, b, 2, 'cost'),
      () => opsYears(b, 2),
      () => opsQuote(g, b, 2, 'cost'),
      () => opsWhy(g, b, 2, 'cost'),
      () => opsWhyLine(g, b, 2, 'cost'),
      () => opsGain(g, b, ID),
      () => opsValue(g, b, ID),
    ]
    for (const read of reads) {
      spy.mockClear()
      read()
      expect(spy).toHaveBeenCalled()
    }
    spy.mockClear()
    opsOdds(g, b, 2, 'yield', a)
    const [, task, input] = spy.mock.calls.at(-1)!
    expect(task.field).toBe('ops.yield')
    expect(task.mode).toBe('project')
    expect(task.kmax).toBe(1)
    expect(input.k).toBe(1)
    expect(opsTask(g, b, 3, 'quality', a).field).toBe('ops.quality')
    expect(opsTask(g, b, 3).field).toBe('ops')
  })

  it('startOps and the menu row quote the engine too, and the row says why', () => {
    const f = hired(100, 3)
    spy.mockClear()
    const row = rowOf(f.g, f.a, ID)
    const text = row.confirm?.(f.g) ?? ''
    expect(spy).toHaveBeenCalled()
    expect(text).toContain(`Start ${DEF.label}?`)
    expect(text).toMatch(/Odds \d+%: /)
    expect(text).toContain('team +')
    expect(text).toContain('skill +')
    spy.mockClear()
    expect(startOps(f.g, f.a, f.b, ID, true)).not.toBeNull()
    expect(spy).toHaveBeenCalled()
  })

  it('the know-how key of every track is a valid field of at most 40 characters, and no track is the lab-wide key', () => {
    const keys = new Set<string>()
    for (const t of LAB_TRACKS) {
      const key = opsField(t)
      expect(isField(key), t).toBe(true)
      expect(key.startsWith('ops.'), t).toBe(true)
      keys.add(key)
    }
    expect(keys.size).toBe(LAB_TRACKS.length)
    expect(opsField(undefined)).toBe('ops')
    expect(opsField('')).toBe('ops')
    expect(isField(opsField('!!! ???'))).toBe(true)
    expect(isField(opsField('x'.repeat(200)))).toBe(true)
  })
})

describe('parity with v5.0.0: odds within 1 point, years and price exact', () => {
  it('the legacy names give the recorded grid', () => {
    expectParity('ops', undefined, TOL, ceoSlack)
  })

  it('the engine’s own quote gives the recorded grid (odds, years, and spend equal to the price)', () => {
    expectParity('ops', engineMeasure, TOL, ceoSlack)
  })

  it('the scripted lifecycle is byte for byte the recorded one (g.rng, the levels, the cooldowns, the grant)', () => {
    expectLifecycle('ops')
  })

  it('the odds are the legacy formula at the default actor, over a grid of skills, teams, rungs and trades', () => {
    let n = 0
    for (const tier of ['low', 'mid', 'high'] as const) {
      const f = tradeFixture(TRADE_OF[tier], LIFE)
      for (const skill of [0, 20, 50, 80, 100]) {
        for (const scientists of [0, 1, 4, 6]) {
          setCompany(f.g, f.b, { manager: skill, quality: 50, scientists, staff: 0, projects: 0 })
          for (const rung of RUNGS) {
            // J.8: a hired manager rated 90 or more adds up to 3 points (ceo-edge.ts), kept under the legacy ceiling.
            const want = Math.min(0.92, clampN(0.9 * launchP(f.g, f.b) + OPS_TIER[tier].odds - RUNG_PENALTY[rung - 1], 0.15, 0.92) + (TOP_CEO_MAX_PTS * topCeoSteady(skill)) / 100)
            expect(opsOdds(f.g, f.b, rung), `${tier}/${skill}/${scientists}/${rung}`).toBeCloseTo(want, 12)
            expect(opsQuote(f.g, f.b, rung).spend).toBe(opsPrice(f.b, rung))
            n++
          }
        }
      }
    }
    expect(n).toBe(180)
  })

  it('the years are the trade’s usual project time times the rung’s, between 1 and 4, and the same for every track and every company', () => {
    for (const tier of ['low', 'mid', 'high'] as const) {
      const f = tradeFixture(TRADE_OF[tier], LIFE)
      for (const rung of RUNGS) {
        const years = opsYears(f.b, rung)
        expect(years).toBeGreaterThanOrEqual(1)
        expect(years).toBeLessThanOrEqual(4)
        for (const p of OPS_PROGRAMS.filter((x) => x.rung === rung)) expect(opsQuote(f.g, f.b, rung, p.track).years).toBe(years)
      }
    }
  })
})

describe('the research team is a line of the odds', () => {
  it('each scientist adds TEAM_ODDS times the one before’s share, shown as `team`, and launchTeam is still that', () => {
    const base = hired(60, 0)
    const none = opsOdds(base.g, base.b, 2, 'cost')
    expect(opsWhy(base.g, base.b, 2, 'cost').some((x) => x.key === 'team')).toBe(false)
    for (const n of [1, 2, 4, 6]) {
      expect(launchTeam(n)).toBe(TEAM_ODDS * teamPower(n))
      const f = hired(60, n)
      const team = opsWhy(f.g, f.b, 2, 'cost').find((x) => x.key === 'team')
      expect(team?.pts, `${n} scientists`).toBe(Math.round(100 * 0.9 * TEAM_ODDS * teamPower(n)))
      expect(team?.label).toBe('team')
      expect(opsOdds(f.g, f.b, 2, 'cost') - none, `${n} scientists`).toBeCloseTo(0.9 * TEAM_ODDS * teamPower(n), 10)
    }
  })

  it('the manager’s skill is a `skill` line, and a flat company (skill 50, quality 50, no team) has none', () => {
    const strong = hired(100, 0)
    const skill = opsWhy(strong.g, strong.b, 2, 'cost').find((x) => x.key === 'crew')
    expect(skill?.label).toBe('skill')
    expect(skill?.pts).toBeGreaterThan(0)
    const weak = hired(0, 0)
    expect(opsWhy(weak.g, weak.b, 2, 'cost').find((x) => x.key === 'crew')?.pts ?? 0).toBeLessThan(0)
    const flat = hired(50, 0)
    expect(opsWhy(flat.g, flat.b, 2, 'cost')).toEqual([])
  })
})

describe('a failed program banks know-how on its own track', () => {
  /** Plays one year-end on a program forced to a 2% chance; the result and what the company knows afterwards. */
  const play = (seed: number, make: (seed: number) => Fixture) => {
    const f = make(seed)
    const before = opsOdds(f.g, f.b, DEF.rung, DEF.track, f.a)
    const otherBefore = opsOdds(f.g, f.b, DEF.rung, 'yield', f.a)
    const plainBefore = opsOdds(f.g, f.b, DEF.rung)
    ready(f)
    const year = f.g.year
    advanceLab(f.g, f.b, year)
    return { ...f, before, otherBefore, plainBefore, year, won: readLab(f.b).done[ID] !== undefined }
  }
  const flopSeed = (label: string, make: (seed: number) => Fixture) => findSeed((seed) => !play(seed, make).won, { label, tries: 40 })

  it('the next try on that track is higher by more than 0 and at most 15 points, another track’s is not, and the reasons say so', () => {
    const make = (seed: number) => owned([seed, 2030])
    const seed = flopSeed('ops flop owner', make)
    const { g, a, b, before, otherBefore, plainBefore, won } = play(seed, make)
    expect(won).toBe(false)
    expect(b.knowHow?.[opsField('cost')]).toBeGreaterThan(0)
    const after = opsOdds(g, b, DEF.rung, DEF.track, a)
    const gained = (after - before) * 100
    expect(gained).toBeGreaterThan(0)
    expect(gained).toBeLessThanOrEqual(KNOW_ODDS_MAX + 1e-9)
    expect(opsOdds(g, b, DEF.rung, 'yield', a)).toBe(otherBefore)
    expect(opsOdds(g, b, DEF.rung, 'quality', a)).toBe(otherBefore)
    expect(opsOdds(g, b, DEF.rung)).toBe(plainBefore)
    const know = opsWhy(g, b, DEF.rung, DEF.track, a).find((x) => x.key === 'know')
    expect(know?.pts ?? 0).toBeGreaterThan(0)
    expect(opsWhy(g, b, DEF.rung, 'yield', a).some((x) => x.key === 'know')).toBe(false)
    expect(opsWhyLine(g, b, DEF.rung, DEF.track, a)).toMatch(/know-how \+\d+/)
    // Every rung of the track reads it (the key is the track's, not the program's), and the stored program is gone.
    for (const rung of RUNGS) expect(opsOdds(g, b, rung, 'cost', a)).toBeGreaterThanOrEqual(opsOdds(g, b, rung, 'cost', null))
    expect(readLab(b).programs).toEqual([])
  })

  it('the next start stores the better odds, and the menu row shows them', () => {
    const make = (seed: number) => owned([seed, 2030])
    const seed = flopSeed('ops flop owner', make)
    const { g, a, b, before } = play(seed, make)
    const row = rowOf(g, a, ID)
    const shown = Number(/(\d+)% odds/.exec(String(typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle))?.[1])
    expect(shown).toBe(Math.round(opsOdds(g, b, DEF.rung, DEF.track, a) * 100))
    expect(shown).toBeGreaterThan(Math.round(before * 100))
    expect(textOf(g, rowsOf(g, a).find((n) => n.id === `biz.labKnow.${a.id}`)!)).toMatch(/unit cost \d+/)
    b.cash = Math.max(b.cash, 100_000_000)
    const p = startOps(g, a, b, ID, true)
    expect(p?.odds).toBe(Math.round(opsOdds(g, b, DEF.rung, DEF.track, a) * 1000) / 1000)
    expect(p?.odds ?? 0).toBeGreaterThan(Math.round(before * 1000) / 1000)
  })

  it('the owner’s notice keeps the pinned words and gains a cause and what the failure taught, each sentence short', () => {
    const make = (seed: number) => owned([seed, 2030])
    const seed = flopSeed('ops flop owner', make)
    const { g, a } = play(seed, make)
    const note = g.queue.find((m) => m.kind === 'notice' && m.title === `${a.name}: Operations Results`)
    expect(note).toBeDefined()
    const text = note && note.kind === 'notice' ? note.text : ''
    expect(text).toContain(`${a.name}'s ${DEF.label} didn't work.`)
    expect(text).toMatch(/The failure (still )?taught you/)
    expect(text).toMatch(/know-how \d+/)
    expect(text).not.toMatch(DASH)
    for (const sentence of text.split(/(?<=\.)\s+/)) expect(sentence.length, sentence).toBeLessThanOrEqual(90)
    // The log keeps its one pinned line, and it is still the last one.
    expect(g.log.at(-1)!.entries.at(-1)!.text).toBe(`${a.name}'s ${DEF.label} didn't work.`)
  })

  it('goes through advanceRd the way the year end does', () => {
    const make = (seed: number) => owned([seed, 2030])
    const seed = flopSeed('ops flop owner', make)
    const f = make(seed)
    ready(f)
    advanceRd(f.g, f.b, f.g.year)
    expect(f.b.knowHow?.[opsField('cost')]).toBeGreaterThan(0)
    expect(f.g.queue.some((m) => m.kind === 'notice' && m.title === `${f.a.name}: Operations Results`)).toBe(true)
  })

  it('a company with a hired CEO banks in its own map too, and says nothing (nobody to tell)', () => {
    const make = (seed: number) => hired(60, 2, [seed, 2030])
    const seed = flopSeed('ops flop hired', make)
    const { g, a, b, before } = play(seed, make)
    expect(b.ceo).toBe('manager')
    expect(b.knowHow?.[opsField('cost')]).toBeGreaterThan(0)
    expect(opsOdds(g, b, DEF.rung, DEF.track, a)).toBeGreaterThan(before)
    expect(g.queue.some((m) => m.kind === 'notice' && m.title.endsWith('Operations Results'))).toBe(false)
  })

  it('an NPC company (no asset) banks nothing and writes no flag', () => {
    let lost = 0
    for (let seed = 1; seed <= 12 && lost < 3; seed++) {
      const f = owned([seed, 2030])
      ready(f)
      const npc = structuredClone(f.b)
      expect(labAsset(f.g, npc)).toBeNull()
      const flags = JSON.stringify(f.g.flags)
      advanceLab(f.g, npc, f.g.year)
      if (readLab(npc).done[ID] !== undefined) continue
      lost++
      expect(JSON.stringify(f.g.flags)).toBe(flags)
      expect(npc.knowHow).toBeUndefined()
      expect(f.g.queue.some((m) => m.kind === 'notice')).toBe(false)
    }
    expect(lost).toBe(3)
  })

  it('a win banks none, and an owner-run win lifts the owner’s ambition a little', () => {
    let won = 0
    for (let seed = 1; seed <= 40 && won < 3; seed++) {
      const f = owned([seed, 2030])
      ready(f, ID, 0.98)
      const shift = readYou(f.g).shift
      advanceLab(f.g, f.b, f.g.year)
      if (readLab(f.b).done[ID] === undefined) continue
      won++
      expect(f.b.knowHow).toBeUndefined()
      expect(readYou(f.g).shift).toBeGreaterThan(shift)
      expect(f.g.queue.some((m) => m.kind === 'notice')).toBe(false)
    }
    expect(won).toBe(3)
  })

  it('a program from a v5.0.0 save (no fx) resolves and banks, and one stepped this year is a replay that changes nothing', () => {
    const seed = flopSeed('ops flop owner', (s) => owned([s, 2030]))
    const f = owned([seed, 2030])
    const p = ready(f)
    expect(p.fx).toBeUndefined()
    advanceLab(f.g, f.b, f.g.year)
    expect(readLab(f.b).done[ID]).toBeUndefined()
    expect(f.b.knowHow?.[opsField('cost')]).toBeGreaterThan(0)

    const h = owned([seed, 2030])
    ready(h)
    patchLab(h.b, (d) => {
      d.programs[0].fx = { ...newFx(h.g.year), last: h.g.year }
    })
    expect(readLab(h.b).programs[0].fx?.last).toBe(h.g.year)
    advanceLab(h.g, h.b, h.g.year)
    expect(readLab(h.b).done[ID]).toBeUndefined()
    expect(h.b.knowHow).toBeUndefined()
    expect(h.g.queue.some((m) => m.kind === 'notice')).toBe(false)
  })

  it('a replayed year draws nothing and changes nothing, and a second flop in a year is not booked twice', () => {
    const seed = flopSeed('ops flop owner', (s) => owned([s, 2030]))
    const f = owned([seed, 2030])
    ready(f)
    const year = f.g.year
    advanceLab(f.g, f.b, year)
    const json = JSON.stringify(f.b)
    const rng = f.g.rng
    const queue = f.g.queue.length
    expect(noDraw(f.g, () => advanceLab(f.g, f.b, year))).toBe(true)
    advanceLab(f.g, f.b, year - 1)
    expect(JSON.stringify(f.b)).toBe(json)
    expect(f.g.rng).toBe(rng)
    expect(f.g.queue.length).toBe(queue)
  })

  it('keeps the draw order: one draw per finished program, in track order, whatever the outcome', () => {
    const f = owned()
    const ids = ['ops.cost.1', 'ops.yield.1', 'ops.quality.1']
    for (const id of ids) ready(f, id, 0.5)
    const twin = structuredClone(f.g)
    const draws = [rand(twin), rand(twin), rand(twin)]
    advanceLab(f.g, f.b, f.g.year)
    expect(f.g.rng).toBe(twin.rng)
    const st = readLab(f.b)
    expect([st.levels.cost.v > 0, st.levels.yield.v > 0, st.levels.quality.v > 0]).toEqual(draws.map((u) => u < 0.5))
  })
})

describe('the lab level is a view, never a second boost', () => {
  it('opsKnowledge is 0 at a fresh lab, rises with a win, fades with the years, and the odds never read it', () => {
    const f = owned()
    for (const t of LAB_TRACKS) expect(opsKnowledge(f.b, t), t).toBe(0)
    const before = LAB_TRACKS.map((t) => opsOdds(f.g, f.b, 2, t, f.a))
    patchLab(f.b, (d) => {
      applyWin(d, opsProgram('ops.cost.1')!, f.g.year)
    })
    const k = opsKnowledge(f.b, 'cost')
    expect(k).toBe(Math.round((100 * 0.3) / LAB_LEVEL_MAX))
    expect(opsKnowledge(f.b, 'yield')).toBe(0)
    expect(opsKnowledge(f.b, 'cost', f.g.year + 1)).toBe(k)
    expect(opsKnowledge(f.b, 'cost', f.g.year + 6)).toBeLessThan(k)
    expect(opsKnowledge(f.b, 'cost', f.g.year + 6)).toBeGreaterThan(0)
    patchLab(f.b, (d) => {
      applyWin(d, opsProgram('ops.cost.2')!, f.g.year + 3)
    })
    expect(opsKnowledge(f.b, 'cost')).toBeGreaterThan(k)
    expect(opsKnowledge(f.b, 'cost')).toBeLessThanOrEqual(100)
    // A win moved the track's channel (opsEffectsOf), and the quote of a program is what it was.
    expect(LAB_TRACKS.map((t) => opsOdds(f.g, f.b, 2, t, f.a))).toEqual(before)
    expect(noDraw(f.g, () => opsKnowledge(f.b, 'cost'))).toBe(true)
  })
})

describe('the engine’s caps hold at 100x', () => {
  it('odds stay inside 15% to 92% whatever the company is, knows or is told', () => {
    for (const tier of ['low', 'mid', 'high'] as const) {
      const f = tradeFixture(TRADE_OF[tier], LIFE)
      setCompany(f.g, f.b, { manager: 100, quality: 100, scientists: 6, staff: 1, projects: 0 })
      f.b.cash *= 100
      f.b.valuation *= 100
      f.b.employees *= 100
      f.b.knowHow = Object.fromEntries(LAB_TRACKS.map((t) => [opsField(t), 100]))
      for (const rung of RUNGS) {
        for (const t of LAB_TRACKS) {
          const q = opsQuote(f.g, f.b, rung, t, f.a)
          expect(q.p, `${tier}/${rung}/${t}`).toBeLessThanOrEqual(OPS_ODDS_MAX)
          expect(q.p).toBeGreaterThanOrEqual(OPS_ODDS_MIN)
          expect(q.k).toBe(1)
        }
      }
      const low = tradeFixture(TRADE_OF[tier], LIFE)
      setCompany(low.g, low.b, { manager: 0, quality: 0, scientists: 0, staff: 0, projects: 0 })
      for (const rung of RUNGS) expect(opsOdds(low.g, low.b, rung)).toBeGreaterThanOrEqual(OPS_ODDS_MIN)
    }
  })

  it('money buys nothing: a budget of 100 is cut to one, and cash, valuation and headcount leave the price alone', () => {
    const f = hired(60, 2)
    const task = opsTask(f.g, f.b, 2, 'cost', f.a)
    const asked = quote(f.g, task, { k: 100, people: [{ fte: 1000, skill: 100, morale: 100 }] })
    expect(asked.k).toBe(1)
    expect(asked.capped).toContain('k')
    expect(asked.spend).toBe(task.cost)
    const price = opsPrice(f.b, 2)
    expect(task.cost).toBe(price)
    const odds = opsOdds(f.g, f.b, 2, 'cost', f.a)
    f.b.cash *= 100
    f.b.valuation *= 100
    f.b.employees *= 100
    expect(opsPrice(f.b, 2)).toBe(price)
    expect(opsQuote(f.g, f.b, 2, 'cost', f.a).spend).toBe(price)
    expect(opsOdds(f.g, f.b, 2, 'cost', f.a)).toBe(odds)
  })

  it('a program a trade has no tier for still answers a quote (the price is only the spend)', () => {
    const f = hired(60, 0)
    expect(opsQuote(f.g, { ...f.b, industry: 'aiLab' } as BizState, 1).p).toBeGreaterThanOrEqual(OPS_ODDS_MIN)
  })
})

describe('who is working', () => {
  it('a hired CEO’s company is steady whatever the player is like; the player’s own is the player', () => {
    const calm = hired(60, 2)
    const bold = hired(60, 2)
    bold.g.character.hidden.willpower = 100
    bold.g.character.hidden.discipline = 100
    expect(opsOdds(bold.g, bold.b, 2, 'cost', bold.a)).toBe(opsOdds(calm.g, calm.b, 2, 'cost', calm.a))
    expect(opsWhy(bold.g, bold.b, 2, 'cost', bold.a).some((x) => x.key === 'bold')).toBe(false)

    const mine = owned()
    const eager = owned()
    eager.g.character.hidden.willpower = 100
    eager.g.character.hidden.discipline = 100
    expect(ambitionOf(eager.g)).toBeGreaterThan(80)
    expect(opsWhy(eager.g, eager.b, 2, 'cost', eager.a).some((x) => x.key === 'bold')).toBe(true)
    expect(opsWhy(mine.g, mine.b, 2, 'cost', mine.a).some((x) => x.key === 'bold')).toBe(false)
    expect(opsOdds(eager.g, eager.b, 2, 'cost', eager.a)).not.toBe(opsOdds(mine.g, mine.b, 2, 'cost', mine.a))
  })

  it('a display copy of the company is read as an NPC unless the asset is passed, and a hypothetical shallow copy finds its asset', () => {
    const f = owned()
    f.g.character.hidden.willpower = 100
    f.g.character.hidden.discipline = 100
    const copy = readBiz(f.g, f.a)
    expect(labAsset(f.g, f.b)).toBe(f.a)
    expect(labAsset(f.g, { ...f.b } as BizState)).toBe(f.a)
    expect(labAsset(f.g, copy)).toBeNull()
    expect(opsOdds(f.g, copy, 2, 'cost', f.a)).toBe(opsOdds(f.g, f.b, 2, 'cost'))
    expect(opsOdds(f.g, copy, 2, 'cost')).not.toBe(opsOdds(f.g, f.b, 2, 'cost'))
  })

  it('a lean owner takes a year longer at a one-year program, and opsYears is the default actor’s number', () => {
    const f = owned()
    expect(opsYears(f.b, 1)).toBe(1)
    expect(opsQuote(f.g, f.b, 1, 'cost', f.a).years).toBe(1)
    const you = readYou(f.g)
    writeYou(f.g, { ...you, posture: 'lean', effective: 'lean' })
    expect(opsQuote(f.g, f.b, 1, 'cost', f.a).years).toBe(2)
    expect(opsYears(f.b, 1)).toBe(1)
    // The start stores what the quote says, and the screen says the same.
    f.b.cash = Math.max(f.b.cash, 100_000_000)
    const p = startOps(f.g, f.a, f.b, 'ops.cost.1', true)
    expect(p?.years).toBe(2)
    const sub = rowOf(f.g, f.a, 'ops.cost.1').subtitle
    expect(typeof sub === 'function' ? sub(f.g) : sub).toContain('2 years')
  })

  it('the hints and the board’s numbers read the owner’s own actor: the row says what bestLabMove says, at a bold ambition', () => {
    const f = tradeFixture('brewery', [41, 2030])
    f.b.outlets[0].count = 40
    f.b.cash = 80_000_000
    f.g.character.hidden.willpower = 90
    f.g.character.hidden.discipline = 90
    expect(ambitionOf(f.g)).toBeGreaterThan(80)
    const w = bizWorth(f.g, f.b)
    const move = bestLabMove(f.g, f.b, f.b.cash, w, (v) => v)
    expect(move?.kind).toBe('ops')
    const best = move as Extract<NonNullable<typeof move>, { kind: 'ops' }>
    const hint = rowOf(f.g, f.a, best.id).hint?.(f.g) ?? ''
    expect(hint).toContain(money(best.value))
  })

  it('at a bold ambition teamValue is still the difference of the company with and without the scientist, read through the same door', () => {
    const f = tradeFixture('brewery', [53, 2030])
    f.b.outlets[0].count = 12
    f.g.character.hidden.willpower = 90
    f.g.character.hidden.discipline = 90
    const { g, b } = f
    const w = bizWorth(g, b)
    const room = Math.max(0, b.cash - rdReserve(b))
    const ideas = productIdeas(g, b, 4)
    const bests = (x: BizState) => ({ ordinary: bestRdIdea(g, x, ideas, room, w)?.value ?? 0, ops: Math.max(0, ...opsOffers(g, x).map((p) => opsValue(g, x, p.id, w))) })
    const now = bests(b)
    const more = { ...b } as BizState
    patchLab(more, (d) => {
      d.team.push(g.year)
    })
    const next = bests(more)
    expect(teamValue(g, b, w).gain).toBeCloseTo(next.ordinary - now.ordinary + (next.ops - now.ops), 6)
    expect(teamValue(g, b, w).gain).toBe(teamValue(g, b, w, f.a).gain)
  })
})

describe('reads draw nothing and write nothing', () => {
  it('noDraw around every read, and a deep-frozen state reads fine', () => {
    const f = hired(70, 3)
    f.b.knowHow = { [opsField('cost')]: 40 }
    const { g, a, b } = f
    expect(noDraw(g, () => opsOdds(g, b, 2, 'cost', a))).toBe(true)
    expect(noDraw(g, () => opsYears(b, 2))).toBe(true)
    expect(noDraw(g, () => opsQuote(g, b, 2, 'cost', a))).toBe(true)
    expect(noDraw(g, () => opsWhy(g, b, 2, 'cost', a))).toBe(true)
    expect(noDraw(g, () => opsWhyLine(g, b, 2, 'cost', a))).toBe(true)
    expect(noDraw(g, () => opsGain(g, b, ID, a))).toBe(true)
    expect(noDraw(g, () => opsValue(g, b, ID, undefined, a))).toBe(true)
    expect(noDraw(g, () => teamValue(g, b, undefined, a))).toBe(true)
    expect(noDraw(g, () => rowsOf(g, a).forEach((r) => (r.type === 'action' ? [r.subtitle, r.confirm?.(g), r.hint?.(g)] : null)))).toBe(true)
    const state = JSON.stringify(g)
    opsOdds(g, b, 2, 'cost', a)
    opsWhyLine(g, b, 2, 'cost', a)
    expect(JSON.stringify(g)).toBe(state)
    const frozen = hired(70, 3, [LIFE[0] + 1, LIFE[1]])
    frozen.b.knowHow = { [opsField('cost')]: 40 }
    deepFreeze(frozen.g)
    expect(opsOdds(frozen.g, frozen.b, 2, 'cost', frozen.a)).toBeGreaterThan(0)
    expect(opsWhy(frozen.g, frozen.b, 2, 'cost', frozen.a).length).toBeGreaterThan(0)
    expect(opsYears(frozen.b, 2)).toBeGreaterThan(0)
  })

  it('the why is a line of at most 110 characters that names the people, and nothing else a reader could not act on', () => {
    const f = hired(100, 4)
    const line = opsWhyLine(f.g, f.b, 2, 'cost', f.a)
    expect(line).toMatch(/^Odds \d+%: /)
    expect(line.length).toBeLessThanOrEqual(110)
    expect(line).toContain('skill +')
    expect(line).toContain('team +')
    expect(line).not.toMatch(DASH)
    const flat = hired(50, 0)
    expect(opsWhyLine(flat.g, flat.b, 2, 'cost', flat.a)).toMatch(/^Odds \d+%$/)
    // A flat company's confirm text does not repeat itself.
    expect(rowOf(flat.g, flat.a, ID).confirm?.(flat.g) ?? '').not.toMatch(/Odds \d+%/)
  })

  it('a fresh lab shows no know-how row', () => {
    const f = owned()
    expect(rowsOf(f.g, f.a).some((n) => n.id === `biz.labKnow.${f.a.id}`)).toBe(false)
  })
})

describe('what is saved', () => {
  it('a default life saves what v5.0.0 saved: no knowHow, no fx, the seven keys of a program', () => {
    const f = owned()
    const p = startOps(f.g, f.a, f.b, 'ops.cost.1', true)
    expect(p).not.toBeNull()
    expect(Object.keys(readLab(f.b).programs[0]!).sort()).toEqual(['grant', 'id', 'odds', 'price', 'progress', 'started', 'years'])
    expect('knowHow' in f.b).toBe(false)
    expect(f.b.lab).toBeDefined()
  })

  it('an fx is optional, bounded and validated on read: an absent one stays absent, a damaged one is dropped, a hostile one is cut', () => {
    const f = owned()
    ready(f, 'ops.cost.1', 0.5)
    const read = (fx: unknown): LabProgram | undefined => {
      patchLab(f.b, (d) => {
        d.programs[0]!.fx = fx as never
      })
      return readLab(f.b).programs[0]
    }
    expect('fx' in read(undefined)!).toBe(false)
    expect('fx' in read('hello')!).toBe(false)
    expect('fx' in read(7)!).toBe(false)
    expect('fx' in read([1, 2])!).toBe(false)
    const good = { ...newFx(2030), progress: 0.5, setbacks: 2, last: 2030 }
    expect(read(good)!.fx).toEqual(normalizeFx(good))
    const hostile = read({ v: 9, progress: 99, quality: 1e99, spent: -5, hours: Number.NaN, setbacks: 1e9, insight: 5000, fatigue: 1e6, last: 1e9, extra: 'x' })!.fx!
    expect(hostile).toEqual(normalizeFx(hostile))
    expect(hostile.progress).toBeLessThanOrEqual(1)
    expect(hostile.setbacks).toBeLessThanOrEqual(99)
    expect(hostile.insight).toBeLessThanOrEqual(100)
    expect(hostile.fatigue).toBeLessThanOrEqual(100)
    expect(Object.keys(hostile).sort()).toEqual(Object.keys(newFx(2030)).sort())
    // Whatever the save held, the game reads it twice the same way.
    expect(readLab(f.b).programs[0]!.fx).toEqual(hostile)
  })

  it('a v5.0.0 program (seven keys, no fx) is read as it was', () => {
    const f = owned()
    const old = { id: 'ops.cost.1', started: f.g.year, years: 1, progress: 0, odds: 0.7, price: 12_000, grant: 0 }
    patchLab(f.b, (d) => {
      d.programs = [old]
    })
    expect(readLab(f.b).programs).toEqual([old])
    expect('fx' in readLab(f.b).programs[0]!).toBe(false)
  })
})

describe('every track is a track', () => {
  it('the three tracks and their programs are all quoted, and none reads another track’s know-how', () => {
    // A company with room under the 92% clamp (a skilled owner of a low-tech trade sits on it at the first rung, where know-how adds nothing).
    const f = hired(40, 0)
    f.b.knowHow = { [opsField('cost')]: 60 }
    for (const p of OPS_PROGRAMS) {
      const q = opsQuote(f.g, f.b, p.rung, p.track, f.a)
      const know = q.reasons.some((x) => x.key === 'know')
      expect(know, p.id).toBe(p.track === 'cost')
    }
    const t: LabTrack = 'quality'
    expect(opsField(t)).toBe('ops.quality')
  })
})
