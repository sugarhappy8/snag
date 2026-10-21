// World flags across a generation handoff (R0-4). The flags that describe the world, not the character,
// must reach the heir: a President's laws, the world economy, market shocks and breakthroughs, the
// family's timeline, and so on. This table is the seed of the world-versus-personal classification of
// every flag key (the Living World programme, A.K0). Each row sets valid minimal flags on a parent,
// hands the line to a child through the real continueAsChild, and asserts the flags are still there
// and equal. Flags that pass through a validating reader (laws, Heavy R&D, tech waves, AI firsts) are
// compared with what that reader returns, never with the raw input, so a damaged flag can't survive.
import { describe, expect, it } from 'vitest'
import { benchWorldFlags, AI_FIRSTS_KEY } from '../src/game/business/ai-bench-claims'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { heavyWorldFlags } from '../src/game/business/heavy-rd'
import { waveWorldFlags } from '../src/game/business/tech-waves'
import { killCharacter } from '../src/game/death'
import { continueAsChild } from '../src/game/life'
import { editMe, editPolicy, meView, nationWorldFlags, policyOf, writeMe, writePolicy, ME_KEY, POLICY_KEY } from '../src/game/nation/state'
import { createPerson } from '../src/game/people'
import type { GameState, Json } from '../src/game/types'
import { adult } from './market-kit'

const J = (v: unknown): Json => v as Json

function parent(): { g: GameState; heirId: string } {
  const g = adult(21, 2030, 'us')
  g.character.age = 70
  const heir = createPerson(g, { relation: 'child', age: 40, lastName: g.character.lastName, money: 1_000 })
  return { g, heirId: heir.id }
}

function handOff(g: GameState, heirId: string): GameState {
  killCharacter(g, 'Old Age')
  g.queue = []
  const n = continueAsChild(g, heirId)
  expect(n).not.toBe(g)
  expect(n.generation).toBe(2)
  return n
}

interface Row {
  name: string
  /** Sets the flags on the parent. */
  set: (g: GameState) => void
  /** The keys the heir must have. */
  keys: string[]
  /** What the heir must have, when it is the validated form and not the raw value. Defaults to the parent's own flags. */
  expected?: (g: GameState) => Record<string, Json>
}

const ROWS: Row[] = [
  {
    name: 'nation.policy (a President\'s laws)',
    set: (g) => { const p = editPolicy(g, 'us'); p.national.taxes.income = 7; writePolicy(g, p) },
    keys: [POLICY_KEY],
  },
  {
    name: 'worldEconomy',
    set: (g) => { g.flags.worldEconomy = J({ v: 2, countries: { us: { year: 2030, priceScale: 1.5 } }, previous: {}, history: {} }) },
    keys: ['worldEconomy'],
  },
  {
    name: 'marketShocks',
    set: (g) => { g.flags.marketShocks = J([{ id: 'ms1', cause: 'ban', asset: 'stock', secId: 'x', exKey: 'us', slot: 0, year: 2029, mult: 0.5 }]) },
    keys: ['marketShocks'],
  },
  {
    name: 'marketBreakthroughs',
    set: (g) => { g.flags.marketBreakthroughs = J([{ id: 'mb1', name: 'The Wheel', year: 2029, mult: 1.2, exchanges: [], businesses: [] }]) },
    keys: ['marketBreakthroughs'],
  },
  {
    name: 'workshop.firsts',
    set: (g) => { g.flags['workshop.firsts'] = J(['idea-1', 'idea-2']) },
    keys: ['workshop.firsts'],
  },
  {
    name: 'business.confidence',
    set: (g) => { g.flags['business.confidence'] = J({ 'us:restaurant': 0.9 }); g.flags['business.confidenceYear'] = 2029 },
    keys: ['business.confidence', 'business.confidenceYear'],
  },
  {
    name: 'timelineForks',
    set: (g) => { g.flags.timelineForks = J([{ year: 2020, salt: 'abc' }]) },
    keys: ['timelineForks'],
  },
  {
    name: 'groupServices',
    set: (g) => {
      g.flags.groupServices = J([{ provider: 'a', customer: 'b', group: 'g' }])
      g.flags.groupServicesPrepared = 2029
      g.flags.groupServicesSettled = 2029
      g.flags.groupServiceResults = J([])
    },
    keys: ['groupServices', 'groupServicesPrepared', 'groupServicesSettled', 'groupServiceResults'],
  },
  {
    name: 'heavy.* (Heavy R&D records)',
    set: (g) => { g.flags['heavy.restaurant|us'] = J([{ family: breakthroughsFor('restaurant')[0].name, year: 2028, years: 4, quality: 80, cost: 3_000_000, by: 'biz1' }]) },
    keys: [],
    expected: (g) => heavyWorldFlags(g),
  },
  {
    name: 'techWaves',
    set: (g) => {
      g.flags.techWaves = J([{ id: 'deeptech:ai:2031:x', kind: 'ai', name: 'Frontier AI', source: 'deeptech', year: 2031, market: 'world', size: 0.5, hype: 0.8, delivery: 0.6, last: 2031 }])
    },
    keys: [],
    expected: (g) => waveWorldFlags(g),
  },
  {
    name: 'aiFirsts',
    set: (g) => { g.flags[AI_FIRSTS_KEY] = J({ 'language.1': { year: 2030, lab: 'Test Lab' } }) },
    keys: [],
    expected: (g) => benchWorldFlags(g),
  },
]

describe('world flags reach the heir', () => {
  for (const row of ROWS) {
    it(`${row.name} is handed off, present and equal`, () => {
      const { g, heirId } = parent()
      row.set(g)
      const want = row.expected ? row.expected(g) : Object.fromEntries(row.keys.map((k) => [k, g.flags[k]]))
      // The row really set something: a table of empty expectations would pass for any code.
      expect(Object.keys(want).length).toBeGreaterThan(0)
      const n = handOff(g, heirId)
      for (const [k, v] of Object.entries(want)) {
        expect(k in n.flags).toBe(true)
        expect(n.flags[k]).toEqual(v)
      }
    })
  }

  it('a President\'s law survives as a law, and the parent\'s personal record does not', () => {
    const { g, heirId } = parent()
    const p = editPolicy(g, 'us')
    p.national.taxes.income = 5
    writePolicy(g, p)
    const me = editMe(g)
    me.dirty = 50_000
    writeMe(g, me)
    const n = handOff(g, heirId)
    expect(policyOf(n, 'us').national.taxes.income).toBe(5)
    expect(meView(n).dirty).toBe(0)
    expect(ME_KEY in n.flags).toBe(false)
  })

  it('a world with no laws hands over with no policy flag', () => {
    const { g, heirId } = parent()
    expect(nationWorldFlags(g)).toEqual({})
    const n = handOff(g, heirId)
    expect(POLICY_KEY in n.flags).toBe(false)
    // An empty record is not a law either.
    const { g: h, heirId: heirH } = parent()
    h.flags[POLICY_KEY] = J({ v: 1, countries: {} })
    expect(nationWorldFlags(h)).toEqual({})
    expect(POLICY_KEY in handOff(h, heirH).flags).toBe(false)
  })

  it('a damaged policy flag does not survive', () => {
    const { g, heirId } = parent()
    g.flags[POLICY_KEY] = J({ v: 1, countries: { us: { national: { taxes: { income: 'x' } } } } })
    const n = handOff(g, heirId)
    expect(POLICY_KEY in n.flags).toBe(true)
    const raw = n.flags[POLICY_KEY] as { v: number; countries: Record<string, { v: number; country: string; national: { taxes: Record<string, unknown> }; tariffs: unknown[] }> }
    // The damaged tax is gone, not copied blindly; the rest of the record is the normalized shape.
    expect(raw.v).toBe(1)
    expect(raw.countries.us.v).toBe(1)
    expect(raw.countries.us.country).toBe('us')
    expect(raw.countries.us.tariffs).toEqual([])
    expect(raw.countries.us.national.taxes.income).toBeUndefined()
    expect(JSON.stringify(n.flags[POLICY_KEY])).not.toContain('"x"')
    expect(policyOf(n, 'us').national.taxes.income).toBeUndefined()
  })
})
