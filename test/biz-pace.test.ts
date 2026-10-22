// R3-Q10 (E.T5): the pace rule for company events, across the whole portfolio.
//   (a) the table: every company event (the base list, the competition events, the extras) is in one of 6 families, a family has 2 or
//       more events, and the families of every engine fit under PACE.maxFamilies;
//   (b) the weight: a family that hit one company lately weighs a quarter as much for every company, an event in no family does not,
//       it is relative (nothing else eligible and it is picked as often as ever), pure and never read back from a later year;
//   (c) the year ledger: at most 2 company choices a year across all companies (pace.biz), a miss takes no slot, a hit notes its family;
//   (d) lives: a 10-company founder over 30 years gets at most 2 company choices a year and fewer same-family events within 5 years
//       with the rule on than with it off (withPaceOff).
import { describe, expect, it } from 'vitest'
import { BIZ_EVENT_FAMILIES, bizPaceKey } from '../src/game/business/event-families'
import { businessEventInternals, eventChance, maybeBusinessEvent } from '../src/game/business/events'
import { businessAssets, bizOf, type BizState } from '../src/game/business/state'
import { yearActionsUsed } from '../src/game/core'
import { ASK_FAMILIES } from '../src/game/events/ask-families'
import { EVENT_LIBRARY, eventPaceFamily } from '../src/game/events'
import { KIT_FAMILIES } from '../src/game/special/kit/families'
import { readTextMem } from '../src/game/text/memory'
import { PACE, notePopup, paceKey, withPaceOff } from '../src/game/text/pace'
import type { Asset, GameState } from '../src/game/types'
import { probeLife } from './probe-life'

const IDS = businessEventInternals.ids()

/** The pace family of each family name with its members. */
function groups(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [id, fam] of Object.entries(BIZ_EVENT_FAMILIES)) out.set(fam, [...(out.get(fam) ?? []), id])
  return out
}

describe('the families table', () => {
  it('names every company event once and nothing else', () => {
    expect(IDS.length).toBeGreaterThanOrEqual(33)
    for (const id of IDS) expect(BIZ_EVENT_FAMILIES[id], `${id} has no family`).toBeDefined()
    for (const id of Object.keys(BIZ_EVENT_FAMILIES)) expect(IDS.includes(id), `${id} is not a company event`).toBe(true)
    expect(Object.keys(BIZ_EVENT_FAMILIES)).toHaveLength(new Set(IDS).size)
  })

  it('has 6 families or fewer, each with 2 or more real events', () => {
    const g = groups()
    expect(g.size).toBeLessThanOrEqual(6)
    for (const [fam, ids] of g) expect(ids.length, fam).toBeGreaterThanOrEqual(2)
  })

  it('groups the examples of the plan: inspection and audit are the regulator, the competitor is a rival', () => {
    expect(BIZ_EVENT_FAMILIES.inspection).toBe('regulator')
    expect(BIZ_EVENT_FAMILIES.audit).toBe('regulator')
    expect(BIZ_EVENT_FAMILIES.lawsuit).toBe('regulator')
    expect(BIZ_EVENT_FAMILIES.competitor).toBe('rivals')
    expect(BIZ_EVENT_FAMILIES.giantBid).toBe('rivals')
    expect(BIZ_EVENT_FAMILIES.strike).toBe('staff')
    expect(bizPaceKey('audit')).toBe(paceKey('biz', 'regulator'))
    expect(bizPaceKey('audit')).toBe('pop.biz.regulator')
    expect(bizPaceKey('not.an.event')).toBeUndefined()
  })

  it('fits, with the event, ask, company and career families, under the 60 the text memory leaves for popups', () => {
    const events = new Set(EVENT_LIBRARY.map((e) => eventPaceFamily(e.id)).filter((f): f is string => f !== undefined)).size
    const asks = new Set(Object.values(ASK_FAMILIES).map((e) => e.family)).size
    const biz = groups().size
    const kit = new Set(Object.values(KIT_FAMILIES)).size
    expect(events + asks + biz + kit).toBeLessThanOrEqual(PACE.maxFamilies)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Companies. probeLife builds a founder with a hired manager over distinct industries; no year is lived.

const SEED = 3
/** The seeds of the lives: one life holds about 20 company popups in 30 years, so the comparison sums a few. */
const LIFE_SEEDS = [3, 4, 5, 6, 7, 8, 9, 10] as const

function founder(businesses = 6): GameState {
  const g = probeLife({ seed: SEED, birthYear: 1975, businesses, years: 0 })
  g.queue = []
  return g
}

/** The company with the most event families open to it, with the families (the relative checks need at least two). */
function busiest(g: GameState): { a: Asset; b: BizState; families: string[] } {
  let best: { a: Asset; b: BizState; families: string[] } | null = null
  for (const a of businessAssets(g)) {
    const b = bizOf(g, a)
    const families = [...new Set(businessEventInternals.possible(g, b).map((id) => BIZ_EVENT_FAMILIES[id]))]
    if (!best || families.length > best.families.length) best = { a, b, families }
  }
  if (!best) throw new Error('no company')
  return best
}

describe('the weight of an event', () => {
  it('has a company with events of at least two families open to it (the setup of the checks below)', () => {
    expect(busiest(founder()).families.length).toBeGreaterThanOrEqual(2)
  })

  it('weighs a quarter as much, for every company, once a family hit any of them within 5 years', () => {
    const g = founder()
    const noted = busiest(g).families[0]
    // Every company of the portfolio that has the noted family and another one open (a family alone is relative, see below).
    const rows = businessAssets(g)
      .map((a) => bizOf(g, a))
      .map((b) => ({ b, open: businessEventInternals.possible(g, b) }))
      .filter(({ open }) => open.some((id) => BIZ_EVENT_FAMILIES[id] === noted) && open.some((id) => BIZ_EVENT_FAMILIES[id] !== noted))
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const before = rows.map(({ b, open }) => new Map(open.map((id) => [id, eventChance(g, b, id)])))
    notePopup(g, paceKey('biz', noted))
    rows.forEach(({ b, open }, i) => {
      const after = new Map(open.map((id) => [id, eventChance(g, b, id)]))
      for (const id of open) {
        if (BIZ_EVENT_FAMILIES[id] === noted) expect(after.get(id)!, `${b.industry}/${id}`).toBeLessThan(before[i].get(id)!)
        else expect(after.get(id)!, `${b.industry}/${id}`).toBeGreaterThan(before[i].get(id)!)
      }
      // The yearly roll is the same: the weights move the pick, not the chance that something happens.
      const sum = (m: Map<string, number>): number => [...m.values()].reduce((s, x) => s + x, 0)
      expect(sum(after), b.industry).toBeCloseTo(sum(before[i]), 12)
    })
  })

  it('is the base again 5 years later, and is not read back from a later year', () => {
    const g = founder()
    const { b, families } = busiest(g)
    const id = businessEventInternals.possible(g, b).find((x) => BIZ_EVENT_FAMILIES[x] === families[0])!
    notePopup(g, paceKey('biz', families[0]))
    // The same company in the same year without the note, at each year of the window and the one after it (a company's own weights
    // move with the calendar, so each year is compared with a twin that has no note).
    for (const step of [0, PACE.window - 1, PACE.window]) {
      const noted = structuredClone(g)
      noted.year += step
      const twin = structuredClone(g)
      twin.year += step
      delete twin.flags.textMem
      const asset = (game: GameState): Asset => businessAssets(game).find((x) => bizOf(game, x).industry === b.industry)!
      const withNote = eventChance(noted, bizOf(noted, asset(noted)), id)
      const without = eventChance(twin, bizOf(twin, asset(twin)), id)
      if (step < PACE.window) expect(withNote, `${step} years after`).toBeLessThan(without)
      else expect(withNote, `${step} years after`).toBeCloseTo(without, 12)
    }
    // A note from a year after g.year is not read: nothing changes for a life that has not got there.
    const later = founder()
    const lb = bizOf(later, businessAssets(later)[0])
    const lid = businessEventInternals.possible(later, lb)[0]
    const lbase = eventChance(later, lb, lid)
    later.year += 3
    notePopup(later, paceKey('biz', BIZ_EVENT_FAMILIES[lid]))
    later.year -= 3
    expect(eventChance(later, lb, lid)).toBeCloseTo(lbase, 12)
  })

  it('is relative: with every family noted the chances are the base, so an event with nothing else to beat is as likely as ever', () => {
    const g = founder()
    const { b } = busiest(g)
    const open = businessEventInternals.possible(g, b)
    const base = open.map((id) => eventChance(g, b, id))
    for (const fam of groups().keys()) notePopup(g, paceKey('biz', fam))
    open.forEach((id, i) => expect(eventChance(g, b, id), id).toBeCloseTo(base[i], 12))
  })

  it('draws nothing: a read leaves g.rng where it was, and nothing is noted by a read', () => {
    const g = founder()
    const { b } = busiest(g)
    const rng = g.rng
    for (const id of IDS) eventChance(g, b, id)
    expect(g.rng).toBe(rng)
    expect(Object.keys(readTextMem(g).f).filter((k) => k.startsWith('pop.'))).toEqual([])
  })

  it('is the base inside withPaceOff', () => {
    const g = founder()
    const { b, families } = busiest(g)
    const id = businessEventInternals.possible(g, b).find((x) => BIZ_EVENT_FAMILIES[x] === families[0])!
    const base = eventChance(g, b, id)
    notePopup(g, paceKey('biz', families[0]))
    expect(withPaceOff(() => eventChance(g, b, id))).toBe(base)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// The year ledger: pace.biz, 2 company choices a year across all companies.

/** Asks every company in turn, `rounds` times, to present an event this year (the companies are managed: a roll of 18%). */
function askAll(g: GameState, rounds: number): number {
  let fired = 0
  for (let round = 0; round < rounds; round++) {
    for (const a of businessAssets(g)) {
      const b = bizOf(g, a)
      b.lastEvent = 0
      if (maybeBusinessEvent(g, a, b, g.year, true)) fired++
    }
  }
  return fired
}

describe('the year ledger', () => {
  it('lets 2 company choices through a year, whatever the number of companies and rolls', () => {
    const g = founder(8)
    const fired = askAll(g, 12)
    expect(fired).toBe(2)
    expect(yearActionsUsed(g, 'pace.biz')).toBe(2)
    // The next age-up empties the year's actions: the ledger is open again.
    g.yearActions = {}
    g.year += 1
    expect(askAll(g, 12)).toBe(2)
  })

  it('takes a slot only when an event is presented, so a missed roll costs nothing', () => {
    const g = founder(8)
    let seen = 0
    let misses = 0
    for (let round = 0; round < 12 && seen < 2; round++) {
      for (const a of businessAssets(g)) {
        const b = bizOf(g, a)
        b.lastEvent = 0
        if (maybeBusinessEvent(g, a, b, g.year, true)) seen++
        else misses++
        expect(yearActionsUsed(g, 'pace.biz'), `after ${a.name}, round ${round}`).toBe(seen)
        if (seen === 2) break
      }
    }
    expect(seen).toBe(2)
    expect(misses).toBeGreaterThanOrEqual(1)
  })

  it('draws no g.rng once the ledger is full (the refusal is a read)', () => {
    const g = founder(4)
    g.yearActions['pace.biz'] = 2
    const rng = g.rng
    const a = businessAssets(g)[0]
    expect(maybeBusinessEvent(g, a, bizOf(g, a), g.year, false)).toBe(false)
    expect(g.rng).toBe(rng)
    expect(g.queue).toEqual([])
  })

  it('notes the family of the event it presented, once, and no other pace key', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = probeLife({ seed, birthYear: 1975, businesses: 3, years: 0 })
      g.queue = []
      if (askAll(g, 1) === 0) continue
      const keys = Object.keys(readTextMem(g).f).filter((k) => k.startsWith('pop.'))
      expect(keys.length, `seed ${seed}`).toBeGreaterThanOrEqual(1)
      for (const k of keys) {
        expect(k.startsWith('pop.biz.'), k).toBe(true)
        expect(readTextMem(g).f[k]).toBe(String(g.year))
      }
      return
    }
    throw new Error('no company event in 40 seeds')
  })

  it('notes nothing inside withPaceOff', () => {
    const g = founder(6)
    withPaceOff(() => askAll(g, 3))
    expect(Object.keys(readTextMem(g).f).filter((k) => k.startsWith('pop.'))).toEqual([])
  })

  it('is a year with nothing noted the same year with the rule on or off: the same events, the same g.rng', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const on = probeLife({ seed, birthYear: 1975, businesses: 3, years: 0 })
      const off = probeLife({ seed, birthYear: 1975, businesses: 3, years: 0 })
      on.queue = []
      off.queue = []
      const a = businessAssets(on)[0]
      const c = businessAssets(off)[0]
      const hitOn = maybeBusinessEvent(on, a, bizOf(on, a), on.year, true)
      const hitOff = withPaceOff(() => maybeBusinessEvent(off, c, bizOf(off, c), off.year, true))
      expect(hitOn, `seed ${seed}`).toBe(hitOff)
      expect(on.rng, `seed ${seed}`).toBe(off.rng)
      expect(on.queue.map((m) => m.kind === 'choice' && m.scriptId), `seed ${seed}`).toEqual(off.queue.map((m) => m.kind === 'choice' && m.scriptId))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Lives. A founder of 10 companies for 30 years through the real yearly loop.

const YEARS = 30
const TIMEOUT = 600_000

/** The family of a company event popup (the script ids of business/events*.ts and competition-events.ts), or undefined for anything else. */
function familyOfScript(scriptId: string | undefined): string | undefined {
  if (!scriptId) return undefined
  const ev = /^business\.ev\.(.+)$/.exec(scriptId)
  if (ev) return BIZ_EVENT_FAMILIES[ev[1]]
  // The competition events: bid, copycat, priceWar, scandal, rivalMove, newcomer (the antitrust case is a regulator's, not a roll).
  if (/^business\.comp\.(bid|copycat|priceWar|scandal|rivalMove|newcomer)$/.test(scriptId)) return 'rivals'
  return undefined
}

interface Lived {
  /** Each company event popup of the life: its year and family. */
  events: { year: number; family: string }[]
  /** The most company choices of the ledger in any one year. */
  ledgerMax: number
  /** The most company event popups queued in any one year. */
  perYearMax: number
}

function live(seed: number, off: boolean): Lived {
  const out: Lived = { events: [], ledgerMax: 0, perYearMax: 0 }
  const run = (): void => {
    probeLife({
      seed,
      birthYear: 1975,
      businesses: 10,
      years: YEARS,
      keepAlive: true,
      onYear: (g, played) => {
        if (played === 0) return
        let here = 0
        for (const m of g.queue) {
          if (m.kind !== 'choice') continue
          const family = familyOfScript(m.scriptId)
          if (family === undefined) continue
          out.events.push({ year: g.year, family })
          here++
        }
        out.perYearMax = Math.max(out.perYearMax, here)
        out.ledgerMax = Math.max(out.ledgerMax, yearActionsUsed(g, 'pace.biz'))
      },
    })
  }
  if (off) withPaceOff(run)
  else run()
  return out
}

/** Events of one family at most PACE.window - 1 years after the one before it, summed over every family. */
function closeRepeats(list: readonly { year: number; family: string }[]): number {
  const last = new Map<string, number>()
  let n = 0
  for (const { year, family } of list) {
    const before = last.get(family)
    if (before !== undefined && year - before < PACE.window) n++
    last.set(family, year)
  }
  return n
}

describe('lives', () => {
  const memo = new Map<string, Lived>()
  const lived = (seed: number, off: boolean): Lived => {
    const key = `${seed}:${off}`
    let l = memo.get(key)
    if (!l) {
      l = live(seed, off)
      memo.set(key, l)
    }
    return l
  }
  /** Every life of LIFE_SEEDS with the rule on or off: the events of each life apart (a repeat is within one life), and the totals. */
  const tally = (off: boolean): { repeats: number; events: number; ledgerMax: number; perYearMax: number } => {
    const lives = LIFE_SEEDS.map((seed) => lived(seed, off))
    return {
      repeats: lives.reduce((n, l) => n + closeRepeats(l.events), 0),
      events: lives.reduce((n, l) => n + l.events.length, 0),
      ledgerMax: Math.max(...lives.map((l) => l.ledgerMax)),
      perYearMax: Math.max(...lives.map((l) => l.perYearMax)),
    }
  }

  it(
    'gives a founder of 10 companies at most 2 company choices a year',
    () => {
      const on = tally(false)
      expect(on.events).toBeGreaterThanOrEqual(30)
      expect(on.ledgerMax).toBeLessThanOrEqual(2)
      expect(on.perYearMax).toBeLessThanOrEqual(2)
    },
    TIMEOUT,
  )

  it(
    'has fewer company events of one family within 5 years with the rule on than with it off',
    () => {
      const on = tally(false)
      const off = tally(true)
      console.log(`company event close repeats (same family within ${PACE.window} years): on ${on.repeats} of ${on.events}, off ${off.repeats} of ${off.events}`)
      expect(off.events).toBeGreaterThan(0)
      expect(off.repeats).toBeGreaterThan(0)
      // A rate, not a count: the two runs are different lives (the pick moves every later roll).
      expect(on.repeats / on.events).toBeLessThan((off.repeats / off.events) * 0.85)
    },
    TIMEOUT,
  )
})
