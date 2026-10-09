import { describe, expect, it } from 'vitest'
import { BOARD_VERSION, boardOf, readBoard, takeDirectorKey } from '../src/game/business/board-state'
import { readMarket } from '../src/game/business/competition-state'
import { readCore, readMembership } from '../src/game/business/conglomerate-state'
import { techOf } from '../src/game/business/deeptech-core'
import { TECH_VERSION, nextDrugId, readTech } from '../src/game/business/deeptech-state'
import { expansionOf } from '../src/game/business/dynamics'
import { normalizeStudio } from '../src/game/business/gamestudio-state'
import { BIZ_VERSION, bizOf, normalizeBiz } from '../src/game/business/state'
import type { Asset, Json } from '../src/game/types'
import { makeTestGame } from './helpers'

describe('business save normalization', () => {
  it('upgrades current mutable saves through every strengthened normalizer', () => {
    const g = makeTestGame()
    const details = normalizeBiz({
      industry: 'restaurant', countryId: 'us', city: 'Chicago', outlets: [{ countryId: 'us', city: 'Chicago', count: 1, opened: 2020 }],
      staff: [{ id: 'same', role: 'Head Chef' }, { id: 'same', role: 'Head Chef' }],
    } as unknown as Record<string, Json>, g.year) as unknown as Record<string, Json>
    details.v = 1
    details.staff = [
      { id: 'same', role: 'Head Chef' },
      { id: 'same', role: 'Head Chef' },
    ]
    const asset = { details } as unknown as Asset
    const biz = bizOf(g, asset)
    expect(biz.v).toBe(BIZ_VERSION)
    expect(biz.staff).toHaveLength(1)

    biz.board = {
      ...readBoard({ members: [{ key: 1, seat: 'owner' }, { key: 1, seat: 'owner' }] } as unknown as Json),
      v: 1,
      members: [{ key: 1, firstName: 'First', lastName: '', gender: 'male', seat: 'owner', stance: 'growth', loyalty: 50, since: 2020 }, { key: 1, firstName: 'Duplicate', lastName: '', gender: 'male', seat: 'owner', stance: 'growth', loyalty: 50, since: 2020 }],
    } as unknown as Json
    expect(boardOf(biz)).toMatchObject({ v: BOARD_VERSION, members: [expect.objectContaining({ firstName: 'First' })] })

    biz.tech = {
      ...readTech({ programs: [{ id: 'train', key: 'train:1', name: 'First' }, { id: 'train', key: 'train:1', name: 'Newest' }] } as unknown as Json),
      v: 2,
      programs: [{ id: 'train', key: 'train:1', name: 'First' }, { id: 'train', key: 'train:1', name: 'Newest' }],
    } as unknown as Json
    expect(techOf(biz)).toMatchObject({ v: TECH_VERSION, programs: [expect.objectContaining({ name: 'Newest' })] })
  })

  it('drops non-finite dated records and rounds valid saved years', () => {
    const invalidYear = Number.NaN
    const infinity = Number.POSITIVE_INFINITY

    const biz = normalizeBiz({
      industry: 'restaurant',
      countryId: 'us',
      city: 'Chicago',
      founded: 2020,
      history: [
        { year: invalidYear, revenue: 9_999_999 },
        { year: 2024.6, revenue: 100 },
        { year: 2024.6, revenue: 200 },
      ],
      last: { year: infinity, revenue: 9_999_999 },
    } as unknown as Record<string, Json>, 2026)
    expect(biz.history).toEqual([expect.objectContaining({ year: 2025, revenue: 200 })])
    expect(biz.last).toBeNull()

    const board = readBoard({
      members: [
        { key: 1, firstName: 'First', seat: 'owner', stance: 'growth', since: 2020.6 },
        { key: 1, firstName: 'Duplicate', seat: 'owner', stance: 'growth', since: 2021.6 },
      ],
      votes: [{ year: invalidYear, what: 'bad' }, { year: 2024.6, what: 'valid', yes: 1 }, { year: 2024.6, what: 'valid', yes: 2 }],
      spentYear: 2023.6, letter: 2024.6, sued: 2022.6, refused: { payout: 2024.6 },
    } as unknown as Json)
    expect(board.members).toEqual([expect.objectContaining({ key: 1, firstName: 'First', since: 2021 })])
    expect(board.votes).toEqual([expect.objectContaining({ year: 2025, what: 'valid', yes: 2 })])
    expect(board).toMatchObject({ spentYear: 2024, letter: 2025, sued: 2023, refused: { payout: 2025 } })

    expect(readMarket({ history: [
      { year: infinity, share: 1 },
      { year: 2024.6, share: .2 },
    ] } as unknown as Json, 'world')?.history).toEqual([expect.objectContaining({ year: 2025, share: .2 })])

    const core = readCore({
      id: 'g1',
      founded: 2000.6,
      history: [{ year: invalidYear, profit: 100 }, { year: 2024.6, profit: 40 }, { year: 2024.6, profit: 50 }],
      synergy: { year: infinity, backOffice: 100 },
      manager: { firstName: 'Pat', lastName: 'Lee', since: 2020.6, equityAsked: 2023.6, asked: 2024.6 },
      ceo: 'manager',
    } as unknown as Json)
    expect(core?.history).toEqual([expect.objectContaining({ year: 2025, profit: 50 })])
    expect(core?.synergy).toBeNull()
    expect(core).toMatchObject({ founded: 2001, manager: { since: 2021, equityAsked: 2024, asked: 2025 } })
    expect(readMembership({
      id: 'g1',
      core: { id: 'g1' },
      joined: 2020.6,
      integrated: 2021.6,
      fx: { year: invalidYear, demand: .1 },
    } as unknown as Json)).toMatchObject({ joined: 2021, integrated: 2022, fx: null })

    const tech = readTech({
      last: { year: invalidYear, rd: 10 },
      oneOffs: [{ year: infinity, amount: 100 }, { year: 2024.6, amount: 50 }],
    } as unknown as Json)
    expect(tech.last).toBeNull()
    expect(tech.oneOffs).toEqual([{ year: 2025, amount: 50 }])

    expect(normalizeStudio({ report: { year: invalidYear, revenue: 100 } } as unknown as Json).report).toBeNull()
    expect(normalizeStudio({ report: { year: 2024.6, revenue: 100 } } as unknown as Json).report?.year).toBe(2025)
  })

  it('deduplicates recovered operating records that would otherwise stack effects', () => {
    const biz = normalizeBiz({
      industry: 'restaurant', countryId: 'us', city: 'Chicago', founded: 2020.6,
      outlets: [
        { countryId: 'us', city: 'Chicago', count: 2, opened: 2020.6 },
        { countryId: 'us', city: 'Chicago', count: 3, opened: 2021.4 },
      ],
      staff: [
        { id: 'staff1', role: 'Head Chef', years: 1.6 },
        { id: 'staff2', role: 'Head Chef', years: 3 },
      ],
      products: [{ name: 'Brunch', launched: 2022.6 }, { name: 'Brunch', launched: 2024 }],
      rd: [{ id: 'rd1', name: 'Brunch', started: 2024.6 }, { id: 'rd1', name: 'New Menu', started: 2024.6 }],
      manager: { firstName: 'Pat', lastName: 'Lee', since: 2021.6, equityAsked: 2024.6, asked: 2025.6 },
      ipoYear: 2023.6, raiseYear: 2024.6, lastEvent: 2025.6,
    } as unknown as Record<string, Json>, 2026)
    expect(biz.founded).toBe(2021)
    expect(biz.outlets).toEqual([{ countryId: 'us', city: 'Chicago', count: 5, opened: 2021 }])
    expect(biz.staff).toHaveLength(1)
    expect(biz.staff[0].years).toBe(2)
    expect(biz.products).toEqual([{ name: 'Brunch', launched: 2023, boost: .05 }])
    expect(biz.rd).toEqual([])
    expect(biz.manager).toMatchObject({ since: 2022, equityAsked: 2025, asked: 2026 })
    expect([biz.ipoYear, biz.raiseYear, biz.lastEvent]).toEqual([2024, 2025, 2026])

    biz.expansion = {
      strategies: [
        { id: 'value', country: 'us', started: 2020.4, expires: 2023.4 },
        { id: 'value', country: 'us', started: 2022.6, expires: 2026.6 },
      ],
      studies: [{ country: 'us', year: 2022 }, { country: 'us', year: 2024.6 }],
      patents: [
        { id: 'inv1', name: 'Old Copy', kind: 'big', launched: 2020, expires: 2040, protections: [{ country: 'us', filed: 2020, expires: 2040 }] },
        { id: 'inv1', name: 'Recovered', kind: 'big', launched: 2021.6, expires: 2041.6, protections: [{ country: 'us', filed: 2021, expires: 2041 }, { country: 'us', filed: 2022.6, expires: 2042.6 }] },
      ],
      lastYear: 2024.6,
    } as unknown as Json
    const expansion = expansionOf(biz)
    expect(expansion.strategies).toEqual([{ id: 'value', country: 'us', started: 2023, expires: 2027 }])
    expect(expansion.studies).toEqual([{ country: 'us', year: 2025 }])
    expect(expansion.patents).toEqual([expect.objectContaining({ id: 'inv1', name: 'Recovered', launched: 2022, expires: 2042, protections: [{ country: 'us', filed: 2023, expires: 2043 }] })])
    expect(expansion.lastYear).toBe(2025)

    const market = readMarket({
      key: 'world', year: 2024.6, edgeUntil: 2025.6,
      rivals: [['r1', .2], ['r1', .3]],
      history: [{ year: 2024, share: .1 }, { year: 2024, share: .2 }],
      extra: [{ id: 'x1', name: 'Old', hq: 'us', founded: 2020.6, ramp: 3.6 }, { id: 'x1', name: 'New', hq: 'us', founded: 2021.6, ramp: 4.6 }],
      gone: ['gone', 'gone'],
      entries: [{ country: 'jp', home: 'us', mode: 'export', year: 2020.6, until: 2022.6 }, { country: 'jp', home: 'us', mode: 'sub', year: 2022.6, until: 2026.6 }],
      campaigns: [{ country: 'fr', year: 2023.6, until: 2025.6 }, { country: 'fr', year: 2024.6, until: 2026.6 }],
      deals: [{ rivalId: 'r1', year: 2023.6, until: 2025.6 }, { rivalId: 'r1', year: 2024.6, until: 2026.6 }],
      acquired: [2023.6, 2023.6],
    } as unknown as Json, 'world')!
    expect(market.year).toBe(2025)
    expect(market.rivals).toEqual([['r1', .3]])
    expect(market.history).toEqual([expect.objectContaining({ year: 2024, share: .2 })])
    expect(market.extra).toEqual([expect.objectContaining({ id: 'x1', name: 'New', founded: 2022, ramp: 5 })])
    expect(market.gone).toEqual(['gone'])
    expect(market.entries).toEqual([{ country: 'jp', home: 'us', mode: 'sub', year: 2023, until: 2027 }])
    expect(market.campaigns).toEqual([{ country: 'fr', home: 'fr', year: 2025, until: 2027 }])
    expect(market.deals).toEqual([{ rivalId: 'r1', year: 2025, until: 2027 }])
    expect(market.acquired).toEqual([2024, 2024])

    const recoveredTech = readTech({
      programs: [{ id: 'train', key: 'train:1', name: 'Old', started: 2020.6 }, { id: 'train', key: 'train:1', name: 'New', started: 2021.6 }],
      rounds: [{ series: 1, year: 2020.6, raised: 10, investor: 'A' }, { series: 1, year: 2020.6, raised: 10, investor: 'A' }],
      grants: [{ id: 'grant', year: 2022.6, amount: 10 }, { id: 'grant', year: 2022.6, amount: 20 }],
      models: [{ gen: 1, name: 'Old', year: 2020.6 }, { gen: 1, name: 'New', year: 2021.6 }],
      drugs: [{ id: 'd7', name: 'Old', filed: 2020.6 }, { id: 'd7', name: 'New', filed: 2021.6 }],
      oneOffs: [{ year: 2024.6, amount: 10 }, { year: 2024.6, amount: 20 }],
      seq: 0,
    } as unknown as Json)
    expect(recoveredTech.programs).toEqual([expect.objectContaining({ key: 'train:1', name: 'New', started: 2022 })])
    expect(recoveredTech.rounds).toHaveLength(1)
    expect(recoveredTech.grants).toEqual([expect.objectContaining({ id: 'grant', year: 2023, amount: 20 })])
    expect(recoveredTech.models).toEqual([expect.objectContaining({ gen: 1, name: 'New', year: 2022 })])
    expect(recoveredTech.drugs).toEqual([expect.objectContaining({ id: 'd7', name: 'New', filed: 2022 })])
    expect(recoveredTech.oneOffs).toEqual([{ year: 2025, amount: 20 }])
    expect(recoveredTech.seq).toBe(7)
  })

  it('rebases unsafe local sequences before allocating another unique id', () => {
    const unsafe = Number.MAX_SAFE_INTEGER + 1
    const board = readBoard({
      seq: unsafe,
      members: [{ key: unsafe, firstName: 'Unsafe', seat: 'owner', stance: 'growth' }, { key: 0, firstName: 'Valid', seat: 'owner', stance: 'growth' }],
    } as unknown as Json)
    const directorKey = takeDirectorKey(board)
    expect(Number.isSafeInteger(board.seq)).toBe(true)
    expect(directorKey).not.toBe(board.members[0].key)

    const tech = readTech({
      seq: unsafe,
      drugs: [{ id: `d${unsafe}`, name: 'Recovered candidate' }],
    } as unknown as Json)
    const drugId = nextDrugId(tech)
    expect(Number.isSafeInteger(tech.seq)).toBe(true)
    expect(drugId).not.toBe(tech.drugs[0].id)
    expect(new Set([...tech.drugs.map((drug) => drug.id), drugId]).size).toBe(2)
  })
})
