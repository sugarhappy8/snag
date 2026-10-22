// R3-Q8 (E.T5): the pace families of the event library and what they do to real lives.
//   (a) the table: every id is a real event, a family has 2 or more events, an id is in one family, the families are few;
//   (b) the weight: a family that popped up lately weighs a quarter as much, an event in no family does not, a pick notes its family;
//   (c) lives: through the real yearly loop, the same lives with the rule on have fewer same-family popups within 5 years than with
//       it off (withPaceOff), and no popup title shows up more than 6 times a life.
// Q9 and Q10 add the ask, company and career families to the cap in (a) and the same measure in (c) through their own files.
import { describe, expect, it } from 'vitest'
import { EVENT_LIBRARY, eventKind, eventPaceFamily, eventWeight, queueRandomEvent } from '../src/game/events'
import { EVENT_FAMILIES, eventFamily } from '../src/game/events/families'
import { EVENT_SCRIPT } from '../src/game/events/helpers'
import { readTextMem } from '../src/game/text/memory'
import { PACE, notePopup, paceKey, withPaceOff } from '../src/game/text/pace'
import type { GameState } from '../src/game/types'
import { makeTestGame } from './helpers'
import { playLife, type PlayedYear } from './play-kit'
import { DESIGN_THRESHOLDS, textMetrics, type LifeTrace } from './text-metrics'

const IDS = new Set(EVENT_LIBRARY.map((e) => e.id))

/** Every pace family of the library with its members: the 15 kinds and the themes. */
function groups(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const ev of EVENT_LIBRARY) {
    const fam = eventPaceFamily(ev.id)
    if (fam === undefined) continue
    const list = out.get(fam)
    if (list) list.push(ev.id)
    else out.set(fam, [ev.id])
  }
  return out
}

describe('the families table', () => {
  it('names only real events, each in one family', () => {
    const seen = new Set<string>()
    for (const id of Object.keys(EVENT_FAMILIES)) {
      expect(IDS.has(id), `${id} is not an event`).toBe(true)
      expect(seen.has(id), `${id} twice`).toBe(false)
      seen.add(id)
    }
  })

  it('keeps the theme ids apart from the 15 kinds: a kind member is paced by its kind', () => {
    let kinds = 0
    for (const ev of EVENT_LIBRARY) {
      const kind = eventKind(ev.id)
      if (kind === ev.id) continue
      kinds++
      expect(eventFamily(ev.id), `${ev.id} is in kind ${kind} and in a theme`).toBeUndefined()
      expect(eventPaceFamily(ev.id)).toBe(kind)
    }
    expect(kinds).toBeGreaterThan(40)
  })

  it('has 2 or more real events in every family and a valid key for each', () => {
    const all = groups()
    for (const [fam, ids] of all) {
      expect(ids.length, fam).toBeGreaterThanOrEqual(2)
      expect(() => paceKey('ev', fam), fam).not.toThrow()
    }
  })

  it('maps every event to a family or to itself (an event in no family has only its own cooldown)', () => {
    let alone = 0
    for (const ev of EVENT_LIBRARY) {
      const fam = eventPaceFamily(ev.id)
      expect(typeof (fam ?? ev.id)).toBe('string')
      if (fam === undefined) alone++
    }
    // The families cover most of the library; what is left has a family of one.
    expect(alone).toBeLessThan(EVENT_LIBRARY.length / 2)
  })

  it('is at most 40 event families, leaving room for asks, company events and the career kit under 60', () => {
    const n = groups().size
    expect(n).toBeLessThanOrEqual(40)
    expect(n).toBeLessThanOrEqual(PACE.maxFamilies)
  })
})

/** A life at an age where the library has a lot to say, with the family record empty. */
function adult(seed = 7, age = 30): GameState {
  return makeTestGame(seed, { age, money: 25_000 })
}

describe('the weight of a pick', () => {
  const scam = EVENT_LIBRARY.find((e) => e.id === 'adult.phoneScam')!
  const mail = EVENT_LIBRARY.find((e) => e.id === 'adult.emailScam')!
  const alone = EVENT_LIBRARY.find((e) => eventPaceFamily(e.id) === undefined && e.minAge <= 30 && e.maxAge >= 30 && typeof e.weight !== 'function' && !e.once)!

  it('is a quarter within 5 years of the family and the base after', () => {
    const g = adult()
    const base = eventWeight(g, scam)
    expect(base).toBeGreaterThan(0)
    notePopup(g, paceKey('ev', 'scam'))
    expect(eventWeight(g, scam)).toBe(base * PACE.weight)
    expect(eventWeight(g, mail)).toBe(eventWeight(adult(), mail) * PACE.weight)
    g.year += 4
    expect(eventWeight(g, scam)).toBe(base * PACE.weight)
    g.year += 1
    expect(eventWeight(g, scam)).toBe(base)
  })

  it('leaves an event in no family alone, and another family alone', () => {
    const g = adult()
    const base = eventWeight(g, alone)
    notePopup(g, paceKey('ev', 'scam'))
    expect(eventWeight(g, alone)).toBe(base)
    expect(eventWeight(g, EVENT_LIBRARY.find((e) => e.id === 'adult.neighborNoise')!)).toBe(eventWeight(adult(), EVENT_LIBRARY.find((e) => e.id === 'adult.neighborNoise')!))
  })

  it('is not read back from a later year', () => {
    const g = adult()
    g.year += 3
    notePopup(g, paceKey('ev', 'scam'))
    g.year -= 3
    expect(eventWeight(g, scam)).toBe(eventWeight(adult(), scam))
  })

  it('makes a pick note its family, once, and an event in no family writes no pace key', () => {
    let hit = 0
    let none = 0
    for (let seed = 1; seed <= 60 && (hit < 3 || none < 3); seed++) {
      const g = adult(seed)
      const id = queueRandomEvent(g)
      if (id === null) continue
      const fam = eventPaceFamily(id)
      const keys = Object.keys(readTextMem(g).f).filter((k) => k.startsWith('pop.'))
      if (fam === undefined) {
        expect(keys, id).toEqual([])
        none++
      } else {
        expect(keys, id).toEqual([paceKey('ev', fam)])
        expect(readTextMem(g).f[paceKey('ev', fam)]).toBe(String(g.year))
        hit++
      }
    }
    expect(hit).toBeGreaterThanOrEqual(3)
    expect(none).toBeGreaterThanOrEqual(1)
  })

  it('notes nothing inside withPaceOff', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = adult(seed)
      const id = withPaceOff(() => queueRandomEvent(g))
      if (id === null) continue
      expect(Object.keys(readTextMem(g).f).filter((k) => k.startsWith('pop.')), id).toEqual([])
    }
  })

  it('draws the same number of times from g.rng with the rule on or off (the pick moves, not the rolls)', () => {
    // A year with nothing noted is the same year with the rule on or off: same pick, same g.rng.
    for (let seed = 1; seed <= 12; seed++) {
      const a = adult(seed)
      const b = adult(seed)
      const ida = queueRandomEvent(a)
      const idb = withPaceOff(() => queueRandomEvent(b))
      expect(ida, `seed ${seed}`).toBe(idb)
      expect(a.rng, `seed ${seed}`).toBe(b.rng)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Lives. A tuple is a seed, a birth year and whether the life is made rich at 25 (the lives of test/text-kit.test.ts).

const LIVES: ReadonlyArray<readonly [number, number, boolean]> = [
  [1, 1950, false],
  [2, 1990, false],
  [3, 2005, false],
  [4, 1975, true],
  [5, 1960, false],
  [6, 1985, true],
]
const UNTIL_AGE = 80
const TIMEOUT = 180_000

/** The event library's popups of a played life: a passive choice of the random-event script (not a follow-up the player asked for). */
function eventPopups(years: readonly PlayedYear[]): { year: number; id: string; title: string }[] {
  const out: { year: number; id: string; title: string }[] = []
  for (const y of years) {
    for (const p of y.popups) {
      const m = p.item
      if (!p.passive || m.kind !== 'choice' || m.scriptId !== EVENT_SCRIPT) continue
      const id = (m.data as { eventId?: unknown } | undefined)?.eventId
      if (typeof id === 'string') out.push({ year: y.year, id, title: p.title })
    }
  }
  return out
}

/** Popups of one family at most PACE.window - 1 years after the one before it, summed over every family. */
function closeRepeats(list: readonly { year: number; id: string }[]): number {
  const last = new Map<string, number>()
  let n = 0
  for (const { year, id } of list) {
    const fam = eventPaceFamily(id)
    if (fam === undefined) continue
    const before = last.get(fam)
    if (before !== undefined && year - before < PACE.window) n++
    last.set(fam, year)
  }
  return n
}

interface Played {
  popups: { year: number; id: string; title: string }[]
  trace: LifeTrace
}

function play([seed, birthYear, rich]: readonly [number, number, boolean]): Played {
  const { years } = playLife({ seed, birthYear, untilAge: UNTIL_AGE, rich })
  const popups = eventPopups(years)
  // The same trace with only the event popups, so textMetrics counts the event library and nothing else.
  const only: PlayedYear[] = years.map((y) => ({ ...y, popups: y.popups.filter((p) => p.passive && p.item.kind === 'choice' && p.item.scriptId === EVENT_SCRIPT) }))
  return { popups, trace: { seed, birthYear, rich, years: only } }
}

describe('lives', () => {
  const memo = new Map<string, Played>()
  const lived = (spec: readonly [number, number, boolean], off: boolean): Played => {
    const key = `${spec.join(',')}:${off}`
    let p = memo.get(key)
    if (!p) {
      p = off ? withPaceOff(() => play(spec)) : play(spec)
      memo.set(key, p)
    }
    return p
  }

  it(
    'have fewer popups of one family within 5 years with the rule on than with it off',
    () => {
      // A rate, not a count: the two runs are different lives (the pick moves every later roll), so they live and die at different ages.
      const tally = (off: boolean): { repeats: number; popups: number } => {
        let repeats = 0
        let popups = 0
        for (const spec of LIVES) {
          const p = lived(spec, off).popups
          repeats += closeRepeats(p)
          popups += p.length
        }
        return { repeats, popups }
      }
      const on = tally(false)
      const off = tally(true)
      console.log(`close repeats (same family within ${PACE.window} years): on ${on.repeats} of ${on.popups} popups, off ${off.repeats} of ${off.popups}`)
      expect(off.repeats).toBeGreaterThan(0)
      expect(on.repeats / on.popups).toBeLessThan((off.repeats / off.popups) * 0.75)
    },
    TIMEOUT,
  )

  it(
    'show no popup title more than 6 times a life',
    () => {
      for (const spec of LIVES) {
        const m = textMetrics(lived(spec, false).trace)
        expect(m.popupFamilies.maxPerLife, `seed ${spec[0]}`).toBeLessThanOrEqual(DESIGN_THRESHOLDS.popupFamilyMax)
        expect(m.popupFamilies.over6, `seed ${spec[0]}`).toBe(0)
      }
    },
    TIMEOUT,
  )
})
