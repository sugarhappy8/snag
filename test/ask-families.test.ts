// R3-Q9 (E.T5): wealth ask families. An ask family is offered at most once in PACE.askGap (4) years unless a storyline holds it, so
// the 57 asks stop cycling every 2 to 4 years.
//   (a) the table: every ask of the three catalogs has a family, none is stale, the families are few and fit under the pace cap;
//   (b) who may ask: a family that spoke 2 years ago is out of the candidates (a storyline ask is not), at 4 years it is back;
//   (c) what a year queues: one ask of a family a year, every presented ask (alone, in a bundle, or sent to a secretary) notes its
//       family, and the popup budget of a tier is the one it was;
//   (d) lives: across rich lives no ask family comes twice within 4 years bar the storylines, and with the rule off they do.
import { describe, expect, it } from 'vitest'
import { EVENT_LIBRARY, eventPaceFamily } from '../src/game/events'
import { ASK_FAMILIES, askIsStoryline, askPaceKey } from '../src/game/events/ask-families'
import { requestCandidates, popupBudget, yearlyWealth } from '../src/game/events/wealth'
import { askDefs } from '../src/game/events/wealth-catalog'
import { TIER_POPUP_CAP, WEALTH_POPUP_CAP, wealthTier } from '../src/game/events/wealth-core'
import { ASK_SCRIPT, BUNDLE_SCRIPT, readAsk } from '../src/game/events/wealth-resolve'
import { createPerson } from '../src/game/people'
import { hireStaff } from '../src/game/shops/luxury-staff'
import { pendingSecretaryRequests } from '../src/game/shops/luxury-secretary-state'
import { readTextMem } from '../src/game/text/memory'
import { PACE, notePopup, paceKey, withPaceOff } from '../src/game/text/pace'
import type { ChoiceModal, GameState, ModalItem } from '../src/game/types'
import { makeTestGame } from './helpers'
import { playLife, type PlayedYear } from './play-kit'

const IDS = askDefs().map((d) => d.id)

/** Family name to the ask ids in it. */
function families(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [id, entry] of Object.entries(ASK_FAMILIES)) {
    const list = out.get(entry.family)
    if (list) list.push(id)
    else out.set(entry.family, [id])
  }
  return out
}

describe('the ask families table', () => {
  it('names a family for every ask of the three catalogs, and no ask that is not there', () => {
    expect(IDS).toHaveLength(57)
    for (const id of IDS) expect(ASK_FAMILIES[id], `${id} has no family`).toBeDefined()
    const real = new Set(IDS)
    for (const id of Object.keys(ASK_FAMILIES)) expect(real.has(id), `${id} is not an ask`).toBe(true)
    expect(Object.keys(ASK_FAMILIES)).toHaveLength(IDS.length)
  })

  it('gives each family a valid pace key, and the key is what askPaceKey returns', () => {
    for (const [family, ids] of families()) {
      const key = paceKey('ask', family)
      expect(key).toBe(`pop.ask.${family}`)
      for (const id of ids) expect(askPaceKey(id), id).toBe(key)
    }
    expect(askPaceKey('not.an.ask')).toBeUndefined()
    expect(askPaceKey('toString')).toBeUndefined()
  })

  it('holds the crisis and the will as storylines, and nothing else', () => {
    const lines = Object.entries(ASK_FAMILIES).filter(([, e]) => e.storyline === true).map(([id]) => id).sort()
    expect(lines).toEqual(['kid.bail', 'kid.gamble', 'kid.inherit', 'kid.rehab', 'kid.willfight'])
    for (const id of lines) expect(askIsStoryline(id), id).toBe(true)
    expect(askIsStoryline('kid.toy')).toBe(false)
    expect(askIsStoryline('not.an.ask')).toBe(false)
  })

  it('groups the examples of the plan: allowance, gifts, wheels, trips, school, loan, wedding', () => {
    const fam = (id: string): string | undefined => ASK_FAMILIES[id]?.family
    expect(fam('kid.pocket')).toBe('allowance')
    for (const id of ['kid.toy', 'kid.console', 'kid.phone', 'kid.computer', 'kid.clothes', 'kid.concert', 'kid.party']) expect(fam(id), id).toBe('gifts')
    expect(['kid.car', 'kid.newcar'].map(fam)).toEqual(['wheels', 'wheels'])
    expect(['kid.trip', 'kid.camp', 'kid.vacation'].map(fam)).toEqual(['trips', 'trips', 'trips'])
    expect(['kid.tuition', 'kid.gradschool'].map(fam)).toEqual(['school', 'school'])
    expect(['kid.bail', 'kid.rehab', 'kid.gamble'].map(fam)).toEqual(['crisis', 'crisis', 'crisis'])
    expect(['kid.inherit', 'kid.willfight'].map(fam)).toEqual(['estate', 'estate'])
    expect(fam('friend.loan')).toBe(fam('sibling.rent'))
    expect(fam('friend.loan')).toBe('loan')
    expect(new Set(['kid.wedding', 'sibling.wedding', 'friend.wedding'].map(fam))).toEqual(new Set(['wedding']))
  })

  it('is few families, and with the event families still leaves room under 60 for company events and the career kit', () => {
    const asks = families().size
    const events = new Set(EVENT_LIBRARY.map((e) => eventPaceFamily(e.id)).filter((f): f is string => f !== undefined)).size
    expect(asks).toBeLessThanOrEqual(14)
    expect(asks + events).toBeLessThanOrEqual(PACE.maxFamilies - 14)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// A rich household with kids who ask for everything, at an age where the will and the early inheritance come up.

function richHome(seed: number): GameState {
  const g = makeTestGame(seed, { age: 62, money: 900_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.year = 2026
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  g.character.hidden.fame = 80
  for (const age of [17, 22, 30, 34]) {
    const kid = createPerson(g, { relation: 'child', age, relationship: 70, lastName: g.character.lastName, livesWithPlayer: age < 18 })
    kid.data.entitlement = age >= 22 ? 70 : 20
  }
  createPerson(g, { relation: 'spouse', age: 60, relationship: 75, livesWithPlayer: true })
  createPerson(g, { relation: 'parent', age: 88, relationship: 70, money: 3_000 })
  createPerson(g, { relation: 'sibling', age: 58, relationship: 60 })
  createPerson(g, { relation: 'sibling', age: 55, relationship: 60 })
  for (let i = 0; i < 6; i++) createPerson(g, { relation: 'friend', age: 40 + i * 4, relationship: 60 })
  return g
}

/** Pretend the family spoke `yearsAgo` years back. */
function spoke(g: GameState, family: string, yearsAgo: number): void {
  g.year -= yearsAgo
  notePopup(g, paceKey('ask', family))
  g.year += yearsAgo
}

const candidateIds = (g: GameState): Set<string> => new Set(requestCandidates(g, 4).map((c) => c.def.id))

describe('who may ask', () => {
  it('has a household that gives every family something to ask (the baseline of the cases below)', () => {
    const ids = candidateIds(richHome(3))
    const seen = new Set<string>()
    for (const id of ids) seen.add(ASK_FAMILIES[id].family)
    expect(seen.size).toBeGreaterThanOrEqual(10)
    for (const id of ['kid.bail', 'kid.rehab', 'kid.gamble', 'kid.inherit']) expect(ids.has(id), id).toBe(true)
  })

  it('drops the asks of a family that spoke 2 years ago, bar the storylines, and leaves every other family alone', () => {
    const base = candidateIds(richHome(3))
    let checked = 0
    for (const [family, members] of families()) {
      const here = members.filter((id) => base.has(id))
      if (here.length === 0) continue
      const g = richHome(3)
      spoke(g, family, 2)
      const after = candidateIds(g)
      for (const id of here) expect(after.has(id), `${id} (${family}, 2 years ago)`).toBe(askIsStoryline(id))
      for (const id of base) if (ASK_FAMILIES[id].family !== family) expect(after.has(id), `${id} after ${family}`).toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(10)
  })

  it('holds a family back for 4 years: out at 3, in again at 4 (the gap is 4 years, not 3)', () => {
    const base = candidateIds(richHome(3))
    for (const [family, years] of [['gifts', 3], ['wheels', 1], ['trips', 0]] as const) {
      const g = richHome(3)
      spoke(g, family, years)
      const after = candidateIds(g)
      const plain = [...base].filter((id) => ASK_FAMILIES[id].family === family && !askIsStoryline(id))
      expect(plain.length, family).toBeGreaterThan(0)
      for (const id of plain) expect(after.has(id), `${id} at ${years}`).toBe(false)
    }
    for (const family of ['gifts', 'wheels', 'trips']) {
      const g = richHome(3)
      spoke(g, family, PACE.askGap)
      expect(candidateIds(g), `${family} at ${PACE.askGap} years`).toEqual(base)
    }
  })

  it('keeps a storyline ask whatever the gap says, and the plain asks of its family wait', () => {
    const g = richHome(3)
    spoke(g, 'crisis', 1)
    spoke(g, 'estate', 1)
    const after = candidateIds(g)
    for (const id of ['kid.bail', 'kid.rehab', 'kid.gamble', 'kid.inherit']) expect(after.has(id), id).toBe(true)
    expect(after.has('partner.postnup')).toBe(false)
  })

  it('is not read back from a later year (no foresight): a note in 2029 does not hold an ask of 2026', () => {
    const base = candidateIds(richHome(3))
    const g = richHome(3)
    g.year += 3
    notePopup(g, paceKey('ask', 'gifts'))
    g.year -= 3
    expect(candidateIds(g)).toEqual(base)
  })

  it('draws nothing from g.rng and writes nothing: the candidate list is a read', () => {
    const g = richHome(5)
    const rng = g.rng
    const mem = JSON.stringify(g.flags.textMem ?? null)
    requestCandidates(g, 4)
    requestCandidates(g, 4)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g.flags.textMem ?? null)).toBe(mem)
  })

  it('ignores the rule inside withPaceOff', () => {
    const base = candidateIds(richHome(3))
    const g = richHome(3)
    spoke(g, 'gifts', 1)
    expect(withPaceOff(() => candidateIds(g))).toEqual(base)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// A year of the hook.

/** One wealth year: age everyone, run the hook, and return the popups it queued. */
function wealthYear(g: GameState): ModalItem[] {
  g.year += 1
  g.character.age += 1
  for (const p of g.people) if (p.alive) p.age += 1
  g.yearActions = {}
  const before = g.queue.length
  yearlyWealth(g)
  return g.queue.slice(before)
}

/** The ask ids in the wealth popups of a year (a bundle holds several). */
function askKinds(items: ModalItem[]): string[] {
  const out: string[] = []
  for (const m of items) {
    if (m.kind !== 'choice' || typeof m.scriptId !== 'string' || !m.scriptId.startsWith('wealth.')) continue
    const d = m.data as Record<string, unknown> | undefined
    if (d && Array.isArray(d.asks)) for (const a of d.asks) out.push(String((a as { k: string }).k))
    else {
      const a = readAsk(m.data)
      if (a) out.push(a.k)
    }
  }
  return out
}

const noted = (g: GameState, id: string): string | undefined => readTextMem(g).f[askPaceKey(id)!]

describe('what a year queues', () => {
  it('keeps the popup budget of every tier (TIER_POPUP_CAP and the prison letter)', () => {
    expect(TIER_POPUP_CAP).toEqual([0, 1, 2, 3, 3])
    expect(WEALTH_POPUP_CAP).toBe(3)
    const g = richHome(2)
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 1, 2, 3, 3])
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'tax evasion', sentenceYears: 5, yearsServed: 0, respect: 50, appealed: false, escapeAttempts: 0 }
    expect([0, 1, 2, 3, 4].map((t) => popupBudget(g, t))).toEqual([0, 1, 1, 1, 1])
  })

  it('notes the family of every ask it presents, the year it presents it, alone or in a bundle', () => {
    let asks = 0
    let bundled = 0
    for (let seed = 1; seed <= 16; seed++) {
      const g = richHome(seed)
      for (let y = 0; y < 8; y++) {
        const items = wealthYear(g)
        for (const m of items) {
          if (m.kind === 'choice' && m.scriptId === BUNDLE_SCRIPT) bundled += askKinds([m]).length
        }
        for (const id of askKinds(items)) {
          const years = noted(g, id)?.split(',') ?? []
          expect(years.at(-1), `${id} in ${g.year} (seed ${seed})`).toBe(String(g.year))
          asks++
        }
        g.queue = []
      }
    }
    expect(asks).toBeGreaterThan(20)
    expect(bundled, 'a bundle of small asks shows up in these years').toBeGreaterThanOrEqual(2)
  })

  it('offers one family once a year (a storyline bar), and the same family again only after 4 years', () => {
    let years = 0
    for (let seed = 1; seed <= 16; seed++) {
      const g = richHome(seed)
      const last = new Map<string, number>()
      for (let y = 0; y < 14; y++) {
        const kinds = askKinds(wealthYear(g))
        g.queue = []
        const plain = kinds.filter((k) => !askIsStoryline(k)).map((k) => ASK_FAMILIES[k].family)
        expect(new Set(plain).size, `${kinds.join(',')} in ${g.year} (seed ${seed})`).toBe(plain.length)
        for (const fam of plain) {
          const before = last.get(fam)
          if (before !== undefined) expect(g.year - before, `${fam} (seed ${seed})`).toBeGreaterThanOrEqual(PACE.askGap)
        }
        for (const k of kinds) last.set(ASK_FAMILIES[k].family, g.year)
        years++
      }
    }
    expect(years).toBe(16 * 14)
  })

  it('still notes the family when a secretary takes the ask (it goes to the inbox, not to a popup)', () => {
    let routed = 0
    for (let seed = 1; seed <= 8; seed++) {
      const g = richHome(seed)
      expect(hireStaff(g, 'secretary', { name: 'Test secretary', gender: 'female', hiredAge: g.character.age, skill: 1, quirk: 'extremely discreet' })).toBe(true)
      g.queue = []
      for (let y = 0; y < 6; y++) {
        const before = pendingSecretaryRequests(g).length
        const items = wealthYear(g)
        const inbox = pendingSecretaryRequests(g).slice(before)
        g.queue = []
        // A secretary-routed ask is no popup, but the family is noted all the same.
        expect(askKinds(items).filter((k) => !inbox.some((r) => (r.ask as { k?: unknown }).k === k))).toEqual([])
        for (const r of inbox) {
          const k = (r.ask as { k: string }).k
          expect(noted(g, k)?.split(',').at(-1), `${k} in ${g.year}`).toBe(String(g.year))
          routed++
        }
      }
    }
    expect(routed).toBeGreaterThan(5)
  })

  it('a household that was not asked lately sees the same first year with the rule on or off', () => {
    // Nothing is noted yet, so no family is held back: the pick, and the draws behind it, are the same.
    for (let seed = 1; seed <= 6; seed++) {
      const a = richHome(seed)
      const b = richHome(seed)
      expect(askKinds(wealthYear(a)), `seed ${seed}`).toEqual(askKinds(withPaceOff(() => wealthYear(b))))
      expect(a.rng, `seed ${seed}`).toBe(b.rng)
    }
  })

  it('is a household that earns its tier (the cases above need an ask-rich house)', () => {
    expect(wealthTier(richHome(1))).toBe(4)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Lives. A tuple is a seed, a birth year; the life is made rich at 25.

const LIVES: ReadonlyArray<readonly [number, number]> = [
  [4, 1975],
  [6, 1985],
]
const UNTIL_AGE = 70
const TIMEOUT = 240_000

interface Presented {
  year: number
  k: string
}

/** The asks a played life presented, by year: a passive wealth.ask choice, or the parts of a wealth.bundle choice. */
function presented(years: readonly PlayedYear[]): Presented[] {
  const out: Presented[] = []
  for (const y of years) {
    for (const p of y.popups) {
      const m = p.item
      if (!p.passive || m.kind !== 'choice') continue
      if (m.scriptId !== ASK_SCRIPT && m.scriptId !== BUNDLE_SCRIPT) continue
      for (const k of askKinds([m as ChoiceModal])) out.push({ year: y.year, k })
    }
  }
  return out
}

/** Plain (not storyline) asks that come within PACE.askGap years of an ask of their family in an earlier year, or twice in one year. */
function closeRepeats(list: readonly Presented[]): number {
  const last = new Map<string, number>()
  let bad = 0
  const byYear = new Map<number, Presented[]>()
  for (const p of list) byYear.set(p.year, [...(byYear.get(p.year) ?? []), p])
  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    const here = byYear.get(year)!
    const seen = new Set<string>()
    for (const { k } of here) {
      const entry = ASK_FAMILIES[k]
      if (!entry || entry.storyline) continue
      const before = last.get(entry.family)
      if ((before !== undefined && year - before < PACE.askGap) || seen.has(entry.family)) bad++
      seen.add(entry.family)
    }
    for (const { k } of here) if (ASK_FAMILIES[k]) last.set(ASK_FAMILIES[k].family, year)
  }
  return bad
}

describe('lives', () => {
  const memo = new Map<string, Presented[]>()
  const lived = (spec: readonly [number, number], off: boolean): Presented[] => {
    const key = `${spec.join(',')}:${off}`
    let p = memo.get(key)
    if (!p) {
      const run = (): Presented[] => presented(playLife({ seed: spec[0], birthYear: spec[1], untilAge: UNTIL_AGE, rich: true }).years)
      p = off ? withPaceOff(run) : run()
      memo.set(key, p)
    }
    return p
  }

  it(
    'show no plain ask family twice within 4 years in a rich life, and with the rule off they do',
    () => {
      let on = 0
      let off = 0
      let asksOn = 0
      let asksOff = 0
      for (const spec of LIVES) {
        const a = lived(spec, false)
        const b = lived(spec, true)
        on += closeRepeats(a)
        off += closeRepeats(b)
        asksOn += a.length
        asksOff += b.length
        expect(closeRepeats(a), `seed ${spec[0]}`).toBe(0)
      }
      console.log(`ask family repeats within ${PACE.askGap} years: on ${on} of ${asksOn} asks, off ${off} of ${asksOff}`)
      expect(asksOn, 'a rich life is still asked').toBeGreaterThan(20)
      expect(off, 'the rule off repeats families').toBeGreaterThan(0)
      expect(on).toBe(0)
    },
    TIMEOUT,
  )
})
