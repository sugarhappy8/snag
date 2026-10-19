// The sector record (BizState.sector): which trades have a family, a reader that clamps whatever is
// stored, foreign records that are never read or overwritten, and the one extra key role per trade.
import { describe, expect, it } from 'vitest'
import { INDUSTRIES } from '../src/game/business/industries'
import { SECTOR_ROLES, sectorRoleBlurb } from '../src/game/business/sector-data'
import {
  addDiary, blankRecord, clampRecord, FAMILY_TRADES, familyOf, readSector, saveSector, SEC_KEYS, sectorOwnsEvent, sectorSlot,
  type FamilyId, type FoodState, type SectorState,
} from '../src/game/business/sector-state'
import { roleBlurb, maxKeyStaff } from '../src/game/business/staff'
import { BIZ_VERSION, bizOf, normalizeBiz } from '../src/game/business/state'
import { SAVE_SCHEMA } from '../src/game/core'
import type { Json } from '../src/game/types'
import { adult, company } from './market-kit'

type Holder = { industry: string; sector?: Json }
const holder = (industry: string, sector?: unknown): Holder => ({ industry, ...(sector === undefined ? {} : { sector: sector as Json }) })
const readOf = (h: Holder) => readSector(h as Parameters<typeof readSector>[0])
const slotOf = (h: Holder) => sectorSlot(h as Parameters<typeof sectorSlot>[0])
const saveOf = (h: Holder, st: SectorState) => saveSector(h as Parameters<typeof saveSector>[0], st)

describe('familyOf', () => {
  it('maps exactly the 18 trades', () => {
    for (const t of ['restaurant', 'foodTruck', 'cafe', 'bakery']) expect(familyOf(t)).toBe('food')
    for (const t of ['clinic', 'education', 'gym', 'salon', 'petCare', 'homeCare', 'autoShop']) expect(familyOf(t)).toBe('care')
    for (const t of ['energy', 'solar', 'water', 'telecom', 'dataCenter', 'farm', 'logistics']) expect(familyOf(t)).toBe('util')
    for (const t of ['bar', 'brewery', 'grocery', 'software', 'bank', 'semiconductor']) expect(familyOf(t)).toBeNull()
    expect(FAMILY_TRADES.food).toHaveLength(4)
    expect(FAMILY_TRADES.care).toHaveLength(7)
    expect(FAMILY_TRADES.util).toHaveLength(7)
  })
})

describe('readSector', () => {
  it('clamps a hostile record', () => {
    const food = holder('restaurant', {
      v: 1, family: 'food', hygiene: NaN, rating: 99, menu: 7, channel: -1, hours: 'x', audit: 1e12,
      diary: Array.from({ length: 100 }, (_, i) => `${i}`.padEnd(500, 'x')),
      ledger: Array.from({ length: 1000 }, () => ({ income: 1e30, costs: -5, demand: 9, capLoss: 5 })),
      pending: { token: 't'.repeat(200), id: 5, year: NaN },
    })
    const f = readOf(food) as FoodState
    expect(f.family).toBe('food')
    expect([f.hygiene, f.rating, f.menu, f.channel, f.hours, f.audit]).toEqual([71, 5, 2, 0, 0, 0])
    expect(f.diary).toHaveLength(6)
    for (const line of f.diary) expect(line.length).toBeLessThanOrEqual(90)
    expect(f.ledger).toHaveLength(4)
    for (const row of f.ledger) {
      expect(row.income).toBeLessThanOrEqual(1e15)
      expect(row.costs).toBeGreaterThanOrEqual(0)
      expect(row.demand).toBeLessThanOrEqual(2)
      expect(row.capLoss).toBeLessThanOrEqual(1)
    }
    expect(f.pending).toBeNull()

    const care = readOf(holder('clinic', { v: 1, family: 'care', loyal: NaN, plans: .26, planTarget: 9, payer: -1, acc: 1e9, intake: 5, program: 'x' }))
    expect(care).toMatchObject({ family: 'care', loyal: .72, plans: .3, planTarget: .6, payer: 0, acc: 100, intake: 2, program: 0 })

    const util = readOf(holder('energy', { v: 1, family: 'util', condition: -5, contract: NaN, hedge: 5, cover: 3, overhaul: 1e12, outages: 99 }))
    expect(util).toMatchObject({ family: 'util', condition: 0, contract: .5, hedge: .8, cover: 1, overhaul: 0, outages: 7 })
  })

  it('snaps plans and payer to tenths and targets to fifths without losing .6', () => {
    const care = readOf(holder('gym', { v: 1, family: 'care', plans: .6, planTarget: .6, payer: .6 }))
    expect(care).toMatchObject({ plans: .6, planTarget: .6, payer: .6 })
    const odd = readOf(holder('gym', { v: 1, family: 'care', plans: .14, planTarget: .15, payer: .37 }))
    expect(odd).toMatchObject({ plans: .1, planTarget: .2, payer: .4 })
  })

  it('keeps pending only with a short token and id', () => {
    const ok = readOf(holder('cafe', { v: 1, family: 'food', pending: { token: 'abc', id: 'inspection', year: 2024 } })) as FoodState
    expect(ok.pending).toEqual({ token: 'abc', id: 'inspection', year: 2024 })
    const bad = readOf(holder('cafe', { v: 1, family: 'food', pending: { token: '', id: 'x', year: 2024 } })) as FoodState
    expect(bad.pending).toBeNull()
  })

  it('never reads or overwrites a foreign record', () => {
    for (const sec of [{ v: 2, family: 'food' }, { v: 1, family: 'care' }]) {
      const h = holder('restaurant', sec)
      expect(readOf(h)).toBeNull()
      expect(slotOf(h)).toBe('foreign')
      saveOf(h, blankRecord('food', 2020))
      expect(h.sector).toEqual(sec)
    }
    expect(slotOf(holder('restaurant', {}))).toBe('none')
    expect(slotOf(holder('restaurant'))).toBe('none')
    expect(slotOf(holder('restaurant', { v: 1 }))).toBe('none')
    expect(readOf(holder('restaurant', { v: 1 }))).toBeNull()
    const h = holder('restaurant', {})
    saveOf(h, blankRecord('food', 2020))
    expect(slotOf(h)).toBe('own')
    expect(readOf(h)).not.toBeNull()
  })

  it('treats a record on a trade without a family as nothing to read', () => {
    expect(readOf(holder('software', { v: 1, family: 'food' }))).toBeNull()
    expect(readOf(holder('software'))).toBeNull()
  })

  it('round trips', () => {
    const cases: [string, FamilyId][] = [['restaurant', 'food'], ['clinic', 'care'], ['energy', 'util']]
    for (const [trade, fam] of cases) {
      const h = holder(trade)
      saveOf(h, blankRecord(fam, 2020))
      expect(readOf(h)).toEqual(blankRecord(fam, 2020))
      expect(JSON.parse(JSON.stringify(h.sector))).toEqual(h.sector)
    }
  })

  it('clampRecord keeps a clean record as it is', () => {
    for (const fam of ['food', 'care', 'util'] as const) {
      const st = blankRecord(fam, 2020)
      expect(clampRecord(st)).toEqual(st)
    }
  })
})

describe('addDiary', () => {
  it('keeps the newest six lines of at most 90 characters', () => {
    const st = blankRecord('food', 2020)
    for (let i = 0; i < 10; i++) addDiary(st, `${i}`.padEnd(200, 'y'))
    expect(st.diary).toHaveLength(6)
    for (const line of st.diary) expect(line.length).toBeLessThanOrEqual(90)
    expect(st.diary[5].startsWith('9')).toBe(true)
    expect(st.diary[0].startsWith('4')).toBe(true)
  })
})

describe('normalizeBiz', () => {
  it('keeps only a plain object', () => {
    const g = adult(1, 2024, 'us')
    const a = company(g, 'restaurant')
    const base = JSON.parse(JSON.stringify(a.details)) as Record<string, Json>
    delete base.sector
    expect(normalizeBiz({ ...base, sector: { v: 1, family: 'food' } }, 2024).sector).toEqual({ v: 1, family: 'food' })
    for (const bad of [[], 7, 'x', null]) expect('sector' in normalizeBiz({ ...base, sector: bad as Json }, 2024)).toBe(false)
    expect('sector' in normalizeBiz({ ...base }, 2024)).toBe(false)
    expect(SAVE_SCHEMA).toBe(2)
    expect(BIZ_VERSION).toBe(2)
  })
})

describe('sectorOwnsEvent', () => {
  const live = { ...blankRecord('food', 2020), lastYear: 2021 }
  it('is true for inspection and critic on a restaurant with a live record', () => {
    const h = holder('restaurant', live)
    expect(sectorOwnsEvent(h as never, 'inspection')).toBe(true)
    expect(sectorOwnsEvent(h as never, 'critic')).toBe(true)
    expect(sectorOwnsEvent(h as never, 'bid')).toBe(false)
  })
  it('is false in the observation year, without a record, on a version 2 record and for a bar', () => {
    expect(sectorOwnsEvent(holder('restaurant', blankRecord('food', 2020)) as never, 'inspection')).toBe(false)
    expect(sectorOwnsEvent(holder('restaurant') as never, 'inspection')).toBe(false)
    expect(sectorOwnsEvent(holder('restaurant', { v: 2 }) as never, 'inspection')).toBe(false)
    expect(sectorOwnsEvent(holder('bar', live) as never, 'inspection')).toBe(false)
  })
  it('is false for every id on care and util records', () => {
    const care = { ...blankRecord('care', 2020), lastYear: 2021 }
    const util = { ...blankRecord('util', 2020), lastYear: 2021 }
    for (const id of ['inspection', 'critic', 'review', 'storm']) {
      expect(sectorOwnsEvent(holder('clinic', care) as never, id)).toBe(false)
      expect(sectorOwnsEvent(holder('energy', util) as never, id)).toBe(false)
    }
  })
})

describe('SEC_KEYS', () => {
  it('names the fields an event may touch', () => {
    expect(SEC_KEYS.food).toEqual(['hygiene', 'rating', 'menu', 'channel', 'hours', 'audit'])
    expect(SEC_KEYS.care).toEqual(['loyal', 'plans', 'planTarget', 'payer', 'acc', 'intake', 'program'])
    expect(SEC_KEYS.util).toEqual(['condition', 'contract', 'hedge', 'cover', 'overhaul', 'outages'])
  })
})

describe('key roles', () => {
  it('adds one extra key role to the 18 trades', () => {
    expect(Object.keys(SECTOR_ROLES)).toHaveLength(18)
    for (const [id, role] of Object.entries(SECTOR_ROLES)) {
      const roles = INDUSTRIES[id as keyof typeof INDUSTRIES].roles
      expect(roles.at(-1), id).toEqual({ title: role.title, focus: role.focus, pay: role.pay })
      expect(new Set(roles.map((r) => r.title)).size, id).toBe(roles.length)
      expect(role.blurb.length).toBeLessThanOrEqual(50)
      expect(familyOf(id), id).not.toBeNull()
    }
    expect(INDUSTRIES.restaurant.roles).toHaveLength(7)
    expect(INDUSTRIES.foodTruck.roles).toHaveLength(4)
    expect(INDUSTRIES.cafe.roles).toHaveLength(6)
    expect(INDUSTRIES.bakery.roles).toHaveLength(5)
    expect(INDUSTRIES.bar.roles).toHaveLength(5)
  })

  it('has the roles the spec names', () => {
    const pick = (id: string) => SECTOR_ROLES[id]
    expect(pick('restaurant')).toMatchObject({ title: 'Food Safety Lead', focus: 'quality', pay: 52_000 })
    expect(pick('clinic')).toMatchObject({ title: 'Clinical Governance Lead', focus: 'quality', pay: 110_000 })
    expect(pick('gym')).toMatchObject({ title: 'Member Experience Lead', focus: 'sales', pay: 48_000 })
    expect(pick('energy')).toMatchObject({ title: 'Reliability Engineer', focus: 'ops', pay: 130_000 })
    expect(pick('logistics')).toMatchObject({ title: 'Fleet Maintenance Chief', focus: 'ops', pay: 70_000 })
  })

  it('raises the key staff cap of a small multi-site company', () => {
    const g = adult(1, 2024, 'us')
    const a = company(g, 'foodTruck')
    const b = bizOf(g, a)
    expect(maxKeyStaff(b)).toBe(3)
    b.outlets[0].count = 3
    expect(maxKeyStaff(b)).toBe(4)
  })

  it('names the score a sector role moves and leaves the other roles alone', () => {
    const role = INDUSTRIES.restaurant.roles.at(-1)
    if (!role) throw new Error('restaurant has no roles')
    expect(roleBlurb({ industry: 'restaurant' }, role)).toBe(sectorRoleBlurb('restaurant', role.title))
    expect(roleBlurb({ industry: 'restaurant' }, role)).toBe('Raises hygiene and quality')
    const chef = INDUSTRIES.restaurant.roles.find((r) => r.title === 'Head Chef')
    if (!chef) throw new Error('no Head Chef')
    expect(roleBlurb({ industry: 'restaurant' }, chef)).toBe('Raises quality')
    expect(sectorRoleBlurb('restaurant', 'Head Chef')).toBeNull()
    expect(sectorRoleBlurb('bar', 'Food Safety Lead')).toBeNull()
  })
})
