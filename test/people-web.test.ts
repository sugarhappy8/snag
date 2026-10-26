// ci: fast
// R4-U9 (People UI and fog track, D.10): the connections card and the kin word. "How you're connected" is a short card of what the
// player already knows about one person's ties: a debt, a cut-off, a spouse by name, a count of kids, the other parent, a job at one
// of your companies and a stake in one. connectionsOf builds it (src/game/hubs/people-web.ts) and PersonProfile.tsx draws it with
// FactRow after the personality card. relationLabel (core.ts) reads `data.kin` for a friend, so a niece or a sister-in-law who became a
// Person reads as such and not as "Friend" (X38).
//
//   gate        Exact, the flag off, a pet and the dead have no card (usesProfile of people-fog.ts is the one gate)
//   rows        each row appears for its fixture and not otherwise; the order is fixed; there are at most PEOPLE_CAPS.connections
//   known       a row prints a fact the player has (never a stat, a secret or the number of a will); no row names a person who is not
//               in g.people unless the record stores the name (a spouse's name is stored, an ex's is looked up)
//   bounded     hostile records (no data, NaN, 500 characters, 500 companies that all hold a stake) give rows within the caps
//   pure        a frozen game, no draw of g.rng, no g.nextId, the same rows twice
//   page        PersonProfile draws the card between the personality card and the shared history, and not at all without rows
//   label       a friend with `data.kin` reads as the word; a hostile value, any other relation and every v5.2.0 fixture read as today
//
// The suite runs in Exact (test/setup-exact.ts). A Realistic case goes through inFog; the flag is always named with withFlags.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { installManager } from '../src/game/business/career'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { liveGroup, saveGroup } from '../src/game/business/conglomerate-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { writeJob, type FamilyJob } from '../src/game/business/nepo-job'
import { bizOf } from '../src/game/business/state'
import { relationLabel } from '../src/game/core'
import { withFlags } from '../src/game/flags'
import { PERSON_SECTIONS } from '../src/game/hubs/people-facts'
import { personGroup } from '../src/game/hubs/people'
import { connectionsOf } from '../src/game/hubs/people-web'
import { createPerson, type PersonOptions } from '../src/game/people'
import { PEOPLE_CAPS } from '../src/game/people-fog'
import { migrateSave } from '../src/game/save-schema'
import type { Asset, GameState, Json, Person, RelationKind } from '../src/game/types'
import { PersonProfile } from '../src/ui/components/PersonProfile'
import { PersonDetails } from '../src/ui/components/PersonSheet'
import { deepFreeze, inFog } from './knowledge-kit'
import { makeTestGame } from './helpers'
import { LIVING_KEYS, adultGame, angryAboutWill, buildKit, estrange, lend, type Kit, type KitKey } from './people-ui-kit'
import { socialGame } from './social-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const ON = { peopleProfile: true } as const
const OFF = { peopleProfile: false } as const
/** Realistic with the flag on: the only state in which the card exists. */
const profile = <T>(fn: () => T): T => withFlags(ON, () => inFog(fn))
const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)
const CAP = PEOPLE_CAPS.connections

type Row = ReturnType<typeof connectionsOf>[number]

const personIn = (g: GameState, id: string): Person => {
  const p = g.people.find((x) => x.id === id)
  if (!p) throw new Error(`no person ${id}`)
  return p
}
const personOf = (kit: Kit, key: KitKey, g: GameState = kit.g): Person => personIn(g, kit.ids[key])

/** The card of one person in Realistic with the flag on. */
const rowsOf = (g: GameState, p: Person): Row[] => profile(() => connectionsOf(g, p))
const idsOf = (rows: readonly Row[]): string[] => rows.map((r) => r.id)
const textOf = (rows: readonly Row[], id: string): string | undefined => rows.find((r) => r.id === id)?.text

/** A person with every field given, so building one draws nothing. */
function add(g: GameState, relation: RelationKind, over: Partial<PersonOptions> = {}): Person {
  const p = createPerson(g, { relation, age: 36, gender: 'female', firstName: 'Nora', lastName: 'Vale', occupation: 'Teacher', money: 20_000, relationship: 60, traits: ['kind', 'proud'], stats: { happiness: 60, health: 70, smarts: 55, looks: 65 }, ...over })
  p.yearsKnown = 8
  return p
}

/** The words of a rendered tree: tags dropped, the entities React writes turned back, white space collapsed. */
function plain(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** What every card must hold, whoever the person is: known rows of the connections section, in words, within the caps. */
function sound(rows: readonly Row[], label: string): void {
  expect(rows.length, label).toBeLessThanOrEqual(CAP)
  expect(new Set(idsOf(rows)).size, `${label}: ids are unique`).toBe(rows.length)
  for (const r of rows) {
    const where = `${label}: ${r.id}`
    expect(r.id.startsWith('connections.'), where).toBe(true)
    expect(PERSON_SECTIONS, where).toContain(r.id.split('.')[0])
    expect(r.state, where).toBe('known')
    expect(r.conf, where).toBeUndefined()
    expect(r.asOf, where).toBeUndefined()
    expect(r.bar, where).toBeUndefined()
    for (const field of [r.label, r.text, r.how ?? '']) {
      expect(typeof field, where).toBe('string')
      expect(field, where).not.toMatch(/NaN|undefined|null|Infinity|\[object/)
      expect(field, where).not.toMatch(DASHES)
    }
    expect(r.label.trim(), where).not.toBe('')
    expect(r.text.trim(), where).not.toBe('')
    expect(r.text.length, where).toBeLessThanOrEqual(90)
    expect((r.how ?? '').length, where).toBeLessThanOrEqual(120)
    expect(r.label.length, where).toBeLessThanOrEqual(40)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Fixtures: a company, a family job, a stake, a group

function business(g: GameState, id: string, name: string, details: Record<string, Json> = {}): Asset {
  const a: Asset = { id, kind: 'business', name, emoji: '🏭', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 30, upkeep: 0, details: { industry: 'restaurant', ...details } }
  g.assets.push(a)
  return a
}

const jobAt = (g: GameState, assetId: string, over: Partial<FamilyJob> = {}): FamilyJob => ({
  assetId, rank: 2, focus: 'ops', kind: 'real', title: 'Manager', since: 2020, rankSince: 2020, pay: 60_000, skill: 50, mood: 70, perf: 55, raised: 0, unpaid: 0, burn: 0, part: false, groom: false, by: g.character.id, kin: '', ...over,
})

/** A real company the player runs (Kit Co), built the way the game builds one. */
function companyWith(g: GameState, name: string): Asset {
  const b = newBiz(g, 'restaurant', 'us', 'Chicago', { cash: 1_000_000, quality: 70, brand: 40, founded: 2020, outlets: [{ countryId: 'us', city: 'Chicago', count: 2, opened: 2020 }] })
  const a = createBusinessAsset(g, name, b, 100_000)
  g.assets.push(a)
  return a
}

/** A real group of two divisions, named Atlas. */
function groupGame(): { g: GameState; id: string } {
  const g = makeTestGame(123, { age: 45, money: 1e9 })
  g.character.talents = []
  for (const [i, industry] of (['solar', 'logistics'] as const).entries()) {
    const b = newBiz(g, industry, 'us', 'Chicago', { cash: 200e6, founded: g.year - 5, valuation: 220e6 })
    installManager(g, b, { firstName: 'Ana', lastName: 'Div', gender: 'female', skill: 70 + i, salary: 200_000, since: g.year - 5, style: 'steady', integrity: 90 })
    g.assets.push(createBusinessAsset(g, `Division ${i}`, b, 1e6))
  }
  if (!formGroup(g, g.assets.map((x) => x.id), 'Atlas')) throw new Error('the group did not form')
  const grp = liveGroup(g, g.assets.map((a) => (a.details.group as { id?: string } | undefined)?.id).find((x) => typeof x === 'string') ?? '')
  if (!grp) throw new Error('no group')
  return { g, id: grp.core.id }
}

/** Every fixture of the card on a copy of the game: the person it is for, and the row it must give. */
interface Case {
  name: string
  id: string
  label: string
  text: string
  /** Builds the game and the person that must give exactly this one row. */
  make: () => { g: GameState; p: Person }
  /** Builds near misses that must give no row at all. */
  misses: Record<string, () => { g: GameState; p: Person }>
}

const base = (): GameState => adultGame()

const CASES: readonly Case[] = [
  {
    name: 'estranged since the year',
    id: 'connections.estranged',
    label: 'Estranged',
    text: 'Since 2023',
    make: () => {
      const g = base()
      const p = add(g, 'sibling')
      estrange(g, p)
      return { g, p }
    },
    misses: {
      'angry about the will but not estranged': () => {
        const g = base()
        const p = add(g, 'sibling')
        angryAboutWill(g, p)
        return { g, p }
      },
      'a record of another life': () => {
        const g = base()
        const p = add(g, 'sibling')
        estrange(g, p)
        ;(p.data.wl as Record<string, Json>).by = 'someone else'
        return { g, p }
      },
    },
  },
  {
    name: 'owes you',
    id: 'connections.owes',
    label: 'Owes you',
    text: '$12K',
    make: () => {
      const g = base()
      const p = add(g, 'friend')
      lend(g, p, 12_000)
      return { g, p }
    },
    misses: {
      'repaid (owes nothing)': () => {
        const g = base()
        const p = add(g, 'friend')
        lend(g, p, 0)
        return { g, p }
      },
      'a loan of another life': () => {
        const g = base()
        const p = add(g, 'friend')
        lend(g, p, 12_000)
        ;(p.data.w as Record<string, Json>).by = 'someone else'
        return { g, p }
      },
    },
  },
  {
    name: 'a spouse by name (a sibling who married)',
    id: 'connections.spouse',
    label: 'Married to',
    text: 'Dana Moss',
    make: () => {
      const g = base()
      const p = add(g, 'sibling', { data: { married: true, spouseName: 'Dana Moss' } })
      return { g, p }
    },
    misses: {
      'not married': () => {
        const g = base()
        return { g, p: add(g, 'sibling', { data: { married: false, spouseName: 'Dana Moss' } }) }
      },
      'no name': () => {
        const g = base()
        return { g, p: add(g, 'sibling', { data: { married: true } }) }
      },
      'a name that is not text': () => {
        const g = base()
        return { g, p: add(g, 'sibling', { data: { married: true, spouseName: 42 } }) }
      },
      'your own spouse (the name is yours)': () => {
        const g = base()
        return { g, p: add(g, 'spouse', { data: { married: true, spouseName: 'Dana Moss' } }) }
      },
    },
  },
  {
    name: 'a count of kids',
    id: 'connections.kids',
    label: 'Kids',
    text: '3 kids',
    make: () => {
      const g = base()
      return { g, p: add(g, 'sibling', { data: { kids: 3 } }) }
    },
    misses: {
      none: () => {
        const g = base()
        return { g, p: add(g, 'sibling', { data: { kids: 0 } }) }
      },
      'not a number': () => {
        const g = base()
        return { g, p: add(g, 'sibling', { data: { kids: '3' } }) }
      },
      'not finite': () => {
        const g = base()
        return { g, p: add(g, 'sibling', { data: { kids: 1e999 } }) }
      },
      negative: () => {
        const g = base()
        return { g, p: add(g, 'sibling', { data: { kids: -2 } }) }
      },
    },
  },
  {
    name: 'the other parent of a stepchild',
    id: 'connections.other',
    label: 'Other parent',
    text: 'Maya Chen',
    make: () => {
      const g = base()
      const other = add(g, 'spouse', { firstName: 'Maya', lastName: 'Chen' })
      return { g, p: add(g, 'stepchild', { age: 9, otherParentId: other.id }) }
    },
    misses: {
      'a parent who is not in the game': () => {
        const g = base()
        return { g, p: add(g, 'stepchild', { age: 9, otherParentId: 'p404' }) }
      },
      'a child (the facts card already says Mother or Father)': () => {
        const g = base()
        const other = add(g, 'spouse', { firstName: 'Maya', lastName: 'Chen' })
        return { g, p: add(g, 'child', { age: 9, otherParentId: other.id }) }
      },
    },
  },
  {
    name: 'who a parent split from',
    id: 'connections.ex',
    label: 'Split from',
    text: 'Walter Reed',
    make: () => {
      const g = base()
      const dad = add(g, 'parent', { firstName: 'Walter', lastName: 'Reed', gender: 'male' })
      return { g, p: add(g, 'parent', { age: 60, data: { divorced: true, exSpouseId: dad.id } }) }
    },
    misses: {
      'an ex who is not in the game': () => {
        const g = base()
        return { g, p: add(g, 'parent', { age: 60, data: { divorced: true, exSpouseId: 'p404' } }) }
      },
      'an id that is not text': () => {
        const g = base()
        return { g, p: add(g, 'parent', { age: 60, data: { divorced: true, exSpouseId: 7 } }) }
      },
    },
  },
  {
    name: 'a job at one of your companies',
    id: 'connections.job',
    label: 'Your company',
    text: 'Works at Kit Co',
    make: () => {
      const g = base()
      const a = companyWith(g, 'Kit Co')
      const p = add(g, 'sibling')
      writeJob(p, jobAt(g, a.id))
      return { g, p }
    },
    misses: {
      'a company you no longer own': () => {
        const g = base()
        const a = companyWith(g, 'Kit Co')
        const p = add(g, 'sibling')
        writeJob(p, jobAt(g, a.id))
        g.assets = []
        return { g, p }
      },
      'an asset that is not a company': () => {
        const g = base()
        const p = add(g, 'sibling')
        g.assets.push({ id: 'house1', kind: 'house', name: 'Kit Co', emoji: '🏠', purchasePrice: 1, value: 1, condition: 100, purchasedAge: 30, upkeep: 0, details: {} })
        writeJob(p, jobAt(g, 'house1'))
        return { g, p }
      },
      'no job': () => {
        const g = base()
        companyWith(g, 'Kit Co')
        return { g, p: add(g, 'sibling') }
      },
    },
  },
  {
    name: 'a family stake in a company',
    id: 'connections.stake',
    label: 'Family stake',
    text: 'Kit Co',
    make: () => {
      const g = base()
      const a = companyWith(g, 'Kit Co')
      const p = add(g, 'parent')
      bizOf(g, a).familyShares = [{ id: p.id, share: 0.2 }]
      return { g, p }
    },
    misses: {
      'a share of nothing': () => {
        const g = base()
        const a = companyWith(g, 'Kit Co')
        const p = add(g, 'parent')
        bizOf(g, a).familyShares = [{ id: p.id, share: 0 }]
        return { g, p }
      },
      'somebody else holds it': () => {
        const g = base()
        const a = companyWith(g, 'Kit Co')
        const p = add(g, 'parent')
        bizOf(g, a).familyShares = [{ id: 'p404', share: 0.2 }]
        return { g, p }
      },
    },
  },
]

// ---------------------------------------------------------------------------------------------------------------------

describe('the gate: Exact, the flag off, a pet and the dead have no card', () => {
  it('gives nothing in Exact, with the flag on or off, for all twelve living people of the kit', () => {
    const kit = buildKit(50)
    for (const key of LIVING_KEYS) {
      const p = personOf(kit, key)
      p.data = { ...p.data, married: true, spouseName: 'Dana Moss', kids: 2 }
      lend(kit.g, p, 5_000)
      for (const flags of [ON, OFF]) expect(withFlags(flags, () => connectionsOf(kit.g, p)), `${key}, peopleProfile ${String(flags.peopleProfile)}`).toEqual([])
    }
  })

  it('gives nothing in Realistic with the flag off', () => {
    for (const { make, name } of CASES) {
      const { g, p } = make()
      expect(withFlags(OFF, () => inFog(() => connectionsOf(g, p))), name).toEqual([])
      expect(rowsOf(g, p).length, `${name}: the same person gives a row with the flag on`).toBeGreaterThan(0)
    }
  })

  it('gives nothing for a pet and for the dead', () => {
    const { g, p } = CASES[0]!.make()
    p.alive = false
    expect(rowsOf(g, p)).toEqual([])
    const dog = add(g, 'pet', { species: 'Dog', breed: 'Beagle', data: { kids: 4, married: true, spouseName: 'Rex Moss' } })
    expect(rowsOf(g, dog)).toEqual([])
  })
})

describe('the rows: each one appears for its fixture and not otherwise', () => {
  for (const c of CASES) {
    it(`${c.name}: exactly ${c.id} with its words`, () => {
      const { g, p } = c.make()
      const rows = rowsOf(g, p)
      sound(rows, c.name)
      expect(idsOf(rows)).toEqual([c.id])
      expect(rows[0]!.label).toBe(c.label)
      expect(rows[0]!.text).toBe(c.text)
      expect(rows[0]!.emoji.length).toBeGreaterThan(0)
    })

    for (const [miss, make] of Object.entries(c.misses)) {
      it(`${c.name}: no row for ${miss}`, () => {
        const { g, p } = make()
        expect(idsOf(rowsOf(g, p))).toEqual([])
      })
    }
  }

  it('a person with nothing to say has an empty card, at every level of the kit', () => {
    for (const level of [20, 50, 90]) {
      const kit = buildKit(level)
      for (const key of LIVING_KEYS) {
        const rows = rowsOf(kit.g, personOf(kit, key))
        sound(rows, `${key} at ${level}`)
        // The kit's child has an other parent, and the facts card already says so.
        expect(idsOf(rows), `${key} at ${level}`).toEqual([])
      }
    }
  })

  it('says 1 kid for one and 3 kids for three, and never more than 99', () => {
    const g = base()
    const text = (kids: unknown) => textOf(rowsOf(g, add(g, 'sibling', { data: { kids: kids as Json } })), 'connections.kids')
    expect(text(1)).toBe('1 kid')
    expect(text(2)).toBe('2 kids')
    expect(text(2.9)).toBe('2 kids')
    expect(text(0.9)).toBeUndefined()
    expect(text(99)).toBe('99 kids')
    expect(text(1e9)).toBe('99 kids')
  })

  it('shows a debt as the short money the other screens use, and an estrangement without the number of years', () => {
    const g = base()
    const p = add(g, 'friend')
    lend(g, p, 1_234_567)
    estrange(g, p)
    const rows = rowsOf(g, p)
    expect(textOf(rows, 'connections.owes')).toBe('$1.2M')
    expect(textOf(rows, 'connections.estranged')).toBe('Since 2023')
    // The will's anger, its peak and the loan's history are the person's own business: none of it is on the card.
    expect(JSON.stringify(rows)).not.toMatch(/70|anger|history|2023-|given/)
  })

  it('names the group, once, for a stake in a group and not for each division', () => {
    const { g, id } = groupGame()
    const p = add(g, 'parent')
    const grp = liveGroup(g, id)!
    grp.core.familyShares = [{ id: p.id, share: 0.15 }]
    saveGroup(g, grp)
    const rows = rowsOf(g, p)
    expect(idsOf(rows)).toEqual(['connections.stake'])
    expect(textOf(rows, 'connections.stake')).toBe('Atlas')
  })

  it('counts the other companies of a stake: the first by name and the rest as a number', () => {
    const g = base()
    const p = add(g, 'parent')
    for (const [i, name] of ['Alpha Foods', 'Beta Labs', 'Gamma Works'].entries()) business(g, `b${i}`, name, { familyShares: [{ id: p.id, share: 0.1 }] })
    expect(textOf(rowsOf(g, p), 'connections.stake')).toBe('Alpha Foods and 2 more')
  })
})

describe('the sibling who married: the spouse by name and the kids, with the stamp on or off', () => {
  it('shows "Married to Dana Moss" and "1 kid", and the same rows either way', () => {
    const rows = (g: GameState): Row[] => {
      const sib = add(g, 'sibling', { firstName: 'Marcus', lastName: 'Reed', gender: 'male', data: { married: true, spouseName: 'Dana Moss', kids: 1 } })
      return rowsOf(g, sib)
    }
    const off = rows(makeTestGame(7, { age: 40, money: 250_000 }))
    const on = rows(socialGame(7, { age: 40, money: 250_000 }))
    expect(on).toEqual(off)
    expect(idsOf(on)).toEqual(['connections.spouse', 'connections.kids'])
    expect(on.map((r) => `${r.label}: ${r.text}`)).toEqual(['Married to: Dana Moss', 'Kids: 1 kid'])
  })
})

describe('the order and the cap', () => {
  /** A sibling who has every row: estranged, in debt, married, with kids, an other parent, an ex, a job and a stake. */
  function everything(): { g: GameState; p: Person } {
    const g = base()
    const a = companyWith(g, 'Kit Co')
    const other = add(g, 'spouse', { firstName: 'Maya', lastName: 'Chen' })
    const ex = add(g, 'parent', { firstName: 'Walter', lastName: 'Reed', gender: 'male' })
    const p = add(g, 'stepchild', { age: 30, otherParentId: other.id, data: { married: true, spouseName: 'Dana Moss', kids: 2, exSpouseId: ex.id } })
    estrange(g, p)
    lend(g, p, 3_000)
    writeJob(p, jobAt(g, a.id))
    bizOf(g, a).familyShares = [{ id: p.id, share: 0.1 }]
    return { g, p }
  }

  it('has eight rows to give and shows the first six, the debt and the cut-off before the rest', () => {
    const { g, p } = everything()
    const rows = rowsOf(g, p)
    sound(rows, 'everything')
    expect(CAP).toBe(6)
    expect(idsOf(rows)).toEqual(['connections.estranged', 'connections.owes', 'connections.spouse', 'connections.kids', 'connections.other', 'connections.ex'])
  })

  it('with the job and the stake instead of the family rows, those two show', () => {
    const { g, p } = everything()
    p.data = { ...p.data, married: false, kids: 0 }
    delete p.data.exSpouseId
    p.otherParentId = undefined
    expect(idsOf(rowsOf(g, p))).toEqual(['connections.estranged', 'connections.owes', 'connections.job', 'connections.stake'])
  })

  it('a person with 500 links gives six rows at most: 500 companies that all hold a stake, 500 holders, 500 people', () => {
    const { g, p } = everything()
    for (let i = 0; i < 500; i++) business(g, `many${i}`, `Company ${i} ${'x'.repeat(200)}`, { familyShares: [{ id: p.id, share: 0.001 }] })
    for (let i = 0; i < 500; i++) add(g, 'friend', { firstName: `Friend${i}` })
    const rows = rowsOf(g, p)
    sound(rows, '500 links')
    expect(rows.length).toBeLessThanOrEqual(CAP)
    expect(idsOf(rowsOf(g, p))).toEqual(idsOf(rows))
    const g2 = base()
    const q = add(g2, 'parent')
    for (let i = 0; i < 500; i++) business(g2, `many${i}`, `Company ${i} ${'x'.repeat(200)}`, { familyShares: Array.from({ length: 50 }, (_, k) => ({ id: k === 49 ? q.id : `other${k}`, share: 0.001 })) })
    const stake = textOf(rowsOf(g2, q), 'connections.stake')!
    expect(stake.length).toBeLessThanOrEqual(90)
    expect(stake).toMatch(/and 499 more$/)
  })
})

describe('what the card knows: only people of the game, only stored names', () => {
  it('names a person only when the game holds them, and never prints an id', () => {
    const g = base()
    const gone = add(g, 'stepchild', { age: 9, otherParentId: 'p404' })
    expect(rowsOf(g, gone)).toEqual([])
    const other = add(g, 'spouse', { firstName: 'Maya', lastName: 'Chen', data: { sid: 'kin.US.1980.3' } })
    const kid = add(g, 'stepchild', { age: 9, otherParentId: other.id, data: { sid: 'kin.US.2010.4' } })
    const rows = rowsOf(g, kid)
    expect(textOf(rows, 'connections.other')).toBe('Maya Chen')
    // Neither the game's ids nor the sids of the registry (S1) are for the player to read.
    expect(JSON.stringify(rows)).not.toMatch(new RegExp(`\\b${other.id}\\b|\\b${kid.id}\\b|kin\\.US`))
    // The other parent may be dead: they are still in the game, and the name is still true.
    other.alive = false
    expect(textOf(rowsOf(g, kid), 'connections.other')).toBe('Maya Chen')
  })

  it('a spouse is named from the record that stores the name, in a game with nobody else', () => {
    const g = base()
    const sib = add(g, 'sibling', { data: { married: true, spouseName: 'Dana Moss' } })
    expect(g.people.map((x) => x.id)).toEqual([sib.id])
    expect(textOf(rowsOf(g, sib), 'connections.spouse')).toBe('Dana Moss')
  })

  it('a long name is cut, a long dash is written as a hyphen and white space is collapsed', () => {
    const g = base()
    const dash = String.fromCharCode(0x2014)
    const sib = add(g, 'sibling', { data: { married: true, spouseName: `Dana ${dash} Moss\n\n  ${'Q'.repeat(300)}` } })
    const text = textOf(rowsOf(g, sib), 'connections.spouse')!
    expect(text.length).toBeLessThanOrEqual(90)
    expect(text).not.toMatch(DASHES)
    expect(text).not.toMatch(/\s{2}|\n/)
    expect(text.startsWith('Dana - Moss Q')).toBe(true)
  })
})

describe('hostile records never throw and stay within the caps', () => {
  it('survives a person with no data, bad numbers, odd types and 500-character text', () => {
    const g = base()
    const cases: Record<string, (p: Person) => void> = {
      noData: (p) => { (p as { data?: unknown }).data = undefined },
      dataIsText: (p) => { (p as { data?: unknown }).data = 'married' },
      dataIsList: (p) => { (p as { data?: unknown }).data = [1, 2, 3] },
      nanEverything: (p) => { p.data = { married: true, spouseName: NaN as unknown as Json, kids: NaN, nepo: NaN as unknown as Json, w: NaN as unknown as Json, wl: NaN as unknown as Json } },
      infinite: (p) => { p.data = { kids: Infinity, w: { by: 'player', owes: Infinity }, wl: { by: 'player', estr: true, estrY: Infinity } } },
      hugeDebt: (p) => { p.data = { w: { by: g.character.id, owes: 1e300 } } },
      yearOfNothing: (p) => { p.data = { wl: { by: g.character.id, estr: true, estrY: 'long ago' } } },
      futureYear: (p) => { p.data = { wl: { by: g.character.id, estr: true, estrY: 99_999 } } },
      longText: (p) => { p.data = { married: true, spouseName: 'S'.repeat(500), kids: 2 }; p.firstName = 'F'.repeat(500) },
      protoKeys: (p) => { p.data = JSON.parse('{"__proto__":{"kids":9},"constructor":{"married":true},"nepo":{"__proto__":{"assetId":"x"}}}') as Record<string, Json> },
      nepoGarbage: (p) => { p.data = { nepo: { assetId: 7, title: ['x'] } } },
      otherParentIsObject: (p) => { (p as { otherParentId?: unknown }).otherParentId = { id: 'p1' } },
      relationIsOdd: (p) => { (p as { relation: unknown }).relation = 'marsupial' },
      strangeStats: (p) => { (p as { stats?: unknown }).stats = null },
    }
    for (const [name, patch] of Object.entries(cases)) {
      const p = add(g, 'sibling')
      patch(p)
      let rows: Row[] = []
      expect(() => { rows = rowsOf(g, p) }, name).not.toThrow()
      sound(rows, name)
    }
  })

  it('survives a game with hostile assets and people', () => {
    const g = base()
    const p = add(g, 'sibling', { data: { kids: 1 } })
    ;(g as { assets: unknown }).assets = [null, 7, 'a', { kind: 'business' }, { kind: 'business', details: null }, { kind: 'business', name: 7, details: { familyShares: 'x', group: { core: null } } }, { kind: 'business', name: 'Okay Co', details: { familyShares: [null, 3, { id: p.id, share: NaN }, { id: p.id, share: 0.2 }] } }]
    expect(idsOf(rowsOf(g, p))).toEqual(['connections.kids', 'connections.stake'])
    ;(g as { assets: unknown }).assets = undefined
    expect(idsOf(rowsOf(g, p))).toEqual(['connections.kids'])
    ;(g as { people: unknown }).people = undefined
    expect(() => rowsOf(g, p)).not.toThrow()
  })
})

describe('pure: a frozen game, the same rows twice, no draw', () => {
  it('builds the card on a deep-frozen copy and writes nothing', () => {
    const g = base()
    const a = companyWith(g, 'Kit Co')
    const p = add(g, 'sibling', { data: { married: true, spouseName: 'Dana Moss', kids: 2 } })
    estrange(g, p)
    lend(g, p, 3_000)
    writeJob(p, jobAt(g, a.id))
    bizOf(g, a).familyShares = [{ id: p.id, share: 0.1 }]
    const rng = g.rng
    const nextId = g.nextId
    const before = JSON.stringify(g)
    const frozen = deepFreeze(structuredClone(g))
    const first = rowsOf(frozen, personIn(frozen, p.id))
    const second = rowsOf(frozen, personIn(frozen, p.id))
    expect(first.length).toBeGreaterThanOrEqual(5)
    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    rowsOf(g, p)
    expect(g.rng).toBe(rng)
    expect(g.nextId).toBe(nextId)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('the rows are plain JSON: nothing a screen could mutate or a save could carry wrongly', () => {
    const { g, p } = CASES[2]!.make()
    const rows = rowsOf(g, p)
    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows)
  })
})

describe('the card on the page', () => {
  const draw = (g: GameState, p: Person): string => profile(() => renderToStaticMarkup(createElement(PersonProfile, { g, person: p })))

  it('draws the heading and the rows after the personality card and before the shared history', () => {
    const kit = buildKit(50)
    const p = personOf(kit, 'dataStats')
    p.data = { ...p.data, married: true, spouseName: 'Dana Moss', kids: 2 }
    p.notes = ['Met at a concert.']
    lend(kit.g, p, 4_000)
    const words = plain(draw(kit.g, p))
    const at = (s: string): number => words.indexOf(s)
    expect(at('Personality'), 'the personality card is there').toBeGreaterThan(0)
    expect(at("How you're connected")).toBeGreaterThan(at('Personality'))
    expect(at('Shared history')).toBeGreaterThan(at("How you're connected"))
    const card = words.slice(at("How you're connected"), at('Shared history'))
    expect(card).toContain('Owes you')
    expect(card).toContain('$4,000')
    expect(card).toContain('Married to')
    expect(card).toContain('Dana Moss')
    expect(card).toContain('Kids')
    expect(card).toContain('2 kids')
    expect(card.indexOf('Owes you')).toBeLessThan(card.indexOf('Married to'))
  })

  it('draws each row as a fact row and the whole card as a card, with no bar, chip, button or true number', () => {
    const kit = buildKit(50)
    const p = personOf(kit, 'sibling')
    p.data = { ...p.data, married: true, spouseName: 'Dana Moss', kids: 1 }
    const markup = draw(kit.g, p)
    const withoutCard = (() => {
      const g = structuredClone(kit.g)
      const q = personOf(kit, 'sibling', g)
      q.data = { ...q.data }
      delete q.data.married
      delete q.data.spouseName
      delete q.data.kids
      return draw(g, q)
    })()
    const rowsAdded = (markup.match(/class="fact-row/g) ?? []).length - (withoutCard.match(/class="fact-row/g) ?? []).length
    expect(rowsAdded).toBe(2)
    expect(markup).toContain('class="menu-heading"')
    expect(markup).not.toMatch(/<button|tabindex|role="dialog"|aria-modal/)
    expect((markup.match(/class="conf-chip"/g) ?? []).length).toBe((withoutCard.match(/class="conf-chip"/g) ?? []).length)
    expect(plain(markup)).toContain("How you're connected")
    expect(plain(withoutCard)).not.toContain("How you're connected")
  })

  it('draws no card for a friend with nothing to show, and the page is the one U4 drew', () => {
    const kit = buildKit(50)
    const markup = draw(kit.g, personOf(kit, 'friend'))
    expect(plain(markup)).not.toContain("How you're connected")
    expect(markup).toContain('fact-row')
  })

  it('draws no card in Exact or for a pet or the dead: the hero alone, or today\'s sheet', () => {
    const kit = buildKit(50)
    const p = personOf(kit, 'sibling')
    p.data = { ...p.data, married: true, spouseName: 'Dana Moss', kids: 1 }
    lend(kit.g, p, 4_000)
    const exact = withFlags(ON, () => renderToStaticMarkup(createElement(PersonProfile, { g: kit.g, person: p })))
    expect(plain(exact)).not.toContain("How you're connected")
    expect(plain(exact)).not.toContain('Dana Moss')
    const sheet = withFlags(ON, () => renderToStaticMarkup(createElement(PersonDetails, { g: kit.g, person: p })))
    expect(plain(sheet)).not.toContain("How you're connected")
    for (const key of ['pet', 'deadParent'] as const) {
      const q = personOf(kit, key)
      q.data = { ...q.data, married: true, spouseName: 'Dana Moss', kids: 1 }
      expect(plain(draw(kit.g, q)), key).not.toContain("How you're connected")
    }
  })

  it('is the same markup twice on a frozen game, for all twelve living people with every row switched on', () => {
    const kit = buildKit(50)
    for (const key of LIVING_KEYS) {
      const p = personOf(kit, key)
      p.data = { ...p.data, married: key !== 'spouse', spouseName: 'Dana Moss', kids: 2 }
    }
    const frozen = deepFreeze(structuredClone(kit.g))
    for (const key of LIVING_KEYS) {
      const p = personOf(kit, key, frozen)
      expect(draw(frozen, p), key).toBe(draw(frozen, p))
    }
  })
})

describe('relationLabel reads data.kin for a friend (C19, X38)', () => {
  const friend = (kin: unknown, gender: Person['gender'] = 'female'): Person => {
    const g = base()
    const p = add(g, 'friend', { gender })
    if (kin !== undefined) p.data = { ...p.data, kin: kin as Json }
    return p
  }

  it('reads a niece as Niece and a sister-in-law as Sister-in-law', () => {
    expect(relationLabel(friend('niece'))).toBe('Niece')
    expect(relationLabel(friend('nephew', 'male'))).toBe('Nephew')
    expect(relationLabel(friend('sister-in-law'))).toBe('Sister-in-law')
    expect(relationLabel(friend('brother-in-law', 'male'))).toBe('Brother-in-law')
    expect(relationLabel(friend('daughter-in-law'))).toBe('Daughter-in-law')
    expect(relationLabel(friend('great aunt'))).toBe('Great aunt')
  })

  it('takes the word whatever the gender of the person says: the word is the fact', () => {
    expect(relationLabel(friend('niece', 'male'))).toBe('Niece')
    expect(relationLabel(friend('nephew', 'female'))).toBe('Nephew')
  })

  it('reads the rule of KIN.md: a lower-case letter, then letters, spaces and hyphens, 20 characters at most', () => {
    expect(relationLabel(friend('a'.repeat(20)))).toBe(`A${'a'.repeat(19)}`)
    expect(relationLabel(friend('a'.repeat(21)))).toBe('Friend')
    expect(relationLabel(friend('x'))).toBe('X')
  })

  it('reads a hostile value as Friend, as before', () => {
    const hostile: unknown[] = [
      'x'.repeat(500), '__proto__', 'toString', 'Niece', 'NIECE', '1niece', '-niece', ' niece', 'nie_ce', 'niece!', 'niece.', 'nièce', '', ' ',
      'niece\n', 'niece\nfriend', '<b>niece</b>', 42, 0, NaN, true, false, null, ['niece'], { kin: 'niece' }, () => 'niece', Symbol.iterator,
    ]
    for (const kin of hostile) expect(relationLabel(friend(kin)), String(typeof kin === 'symbol' ? 'symbol' : kin).slice(0, 30)).toBe('Friend')
    expect(relationLabel(friend(undefined))).toBe('Friend')
  })

  it('reads a person with no data, or data that is not a record, as Friend', () => {
    for (const data of [undefined, null, 'niece', 7, ['niece']]) {
      const p = friend(undefined)
      ;(p as { data?: unknown }).data = data
      expect(relationLabel(p), String(data)).toBe('Friend')
    }
  })

  it('changes no other relation: a niece in data.kin on any other relation reads as it does today', () => {
    const typesText = readFileSync(join(ROOT, 'src/game/types.ts'), 'utf8')
    const block = /export type RelationKind =([\s\S]*?)\n\nexport interface Person/.exec(typesText)![1]!
    const relations = [...block.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]!) as RelationKind[]
    expect(relations.length).toBeGreaterThanOrEqual(24)
    expect(relations).toContain('friend')
    for (const relation of relations) {
      for (const gender of ['male', 'female'] as const) {
        const bare = friend(undefined, gender)
        bare.relation = relation
        const kin = friend('niece', gender)
        kin.relation = relation
        if (relation === 'friend') {
          expect(relationLabel(bare)).toBe('Friend')
          expect(relationLabel(kin)).toBe('Niece')
        } else {
          expect(relationLabel(kin), `${relation} ${gender}`).toBe(relationLabel(bare))
        }
      }
    }
  })

  it('a nepo coworker with data.kin is a Coworker, as before; the Life track makes the friends', () => {
    const p = friend('cousin')
    p.relation = 'coworker'
    expect(relationLabel(p)).toBe('Coworker')
  })

  it('every screen that prints a relation gets it: the hero, the sheet, the Relationships group and the lower-case sentences', () => {
    const g = base()
    const niece = add(g, 'friend', { age: 12, firstName: 'Ivy', lastName: 'Reed', data: { kin: 'niece' } })
    const subtitle = (p: Person): string => {
      const sub = personGroup(p).subtitle
      return typeof sub === 'function' ? sub(g) : (sub ?? '')
    }
    expect(subtitle(niece)).toBe('Niece · 12 years old')
    expect(plain(renderToStaticMarkup(createElement(PersonDetails, { g, person: niece })))).toContain('Niece · 12 years old')
    niece.alive = false
    expect(subtitle(niece)).toBe('Niece · Deceased (age 12)')
    expect(relationLabel(niece).toLowerCase()).toBe('niece')
  })

  it('there is one table of relation words in the game: core.ts', () => {
    const files = ['src/game/core.ts']
    for (const file of files) expect(readFileSync(join(ROOT, file), 'utf8')).toContain("'Friend'")
    const found: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(entry.name) && readFileSync(join(ROOT, rel), 'utf8').includes("'Friend'")) found.push(rel)
      }
    }
    walk('src')
    expect(found).toEqual(files)
  })
})

describe('no v5.2.0 fixture changes a label', () => {
  const DIR = join(ROOT, 'test', 'fixtures')
  /** The fixtures of releases before 5.3.0 (the file name carries the version): the stamped ones of 5.3.0 hold kin on purpose (L5). */
  const OLD = readdirSync(DIR)
    .filter((n) => /^save-.*\.json\.gz$/.test(n))
    .filter((n) => {
      const v = /^save-v(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(n)
      return v !== null && (Number(v[1]) < 5 || (Number(v[1]) === 5 && Number(v[2] ?? 0) < 3))
    })
    .sort()

  it('finds the old fixtures, among them v4.0.2 and the v5.2.0 social one', () => {
    expect(OLD).toContain('save-v4.0.2.json.gz')
    expect(OLD).toContain('save-v5.2.0-social.json.gz')
    expect(OLD.length).toBeGreaterThanOrEqual(7)
  })

  it('has no friend with data.kin in any of them (nepo kin are coworkers), so every label is the one of v5.2.0', { timeout: 180_000 }, () => {
    for (const name of OLD) {
      const raw = JSON.parse(gunzipSync(readFileSync(join(DIR, name))).toString()) as Record<string, unknown>
      const r = migrateSave(raw)
      if (r.kind !== 'ready') throw new Error(`${name} did not migrate`)
      const people = r.game.people
      const kinFriends = people.filter((p) => p.relation === 'friend' && p.data != null && typeof p.data.kin === 'string')
      expect(kinFriends.map((p) => `${p.id} ${String(p.data.kin)}`), name).toEqual([])
      for (const p of people) {
        const bare: Person = { ...p, data: Object.fromEntries(Object.entries(p.data ?? {}).filter(([k]) => k !== 'kin')) }
        expect(relationLabel(p), `${name} ${p.id}`).toBe(relationLabel(bare))
      }
    }
  })
})

describe('the file', () => {
  it('people-web.ts, PersonProfile.tsx and this test hold no long dash; people-web.ts draws nothing and writes nothing', () => {
    for (const file of ['src/game/hubs/people-web.ts', 'src/ui/components/PersonProfile.tsx', 'test/people-web.test.ts']) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toMatch(DASHES)
    }
    const web = readFileSync(join(ROOT, 'src/game/hubs/people-web.ts'), 'utf8')
    expect(web).not.toMatch(/Math\.random|\bg\.rng|\.nextId|\.money\b|\.cash\b|addMoney|moveCash|spend/)
    expect(web).not.toMatch(/\b[gpa]\.[\w.]+\s*(=|\+=|-=)[^=]|\b[gpa]\.[\w.]+\.(push|splice|sort|reverse|unshift|pop|shift)\(|\bdelete\s|Object\.assign\(/)
  })
})
