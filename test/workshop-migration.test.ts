// Old saves → the Workshop: the old Inventor profile, personal invention IP, company invention
// products/research/patents and closed financial systems, built by hand in the old format.
// Migration must never throw, never grant money and never collapse (or inflate) a value.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { ageUp } from '../src/game/aging'
import { netWorth } from '../src/game/core'
import { killCharacter } from '../src/game/death'
import { continueAsChild } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { ownerKey } from '../src/game/special/common'
import { assetsMenu } from '../src/game/menus'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf } from '../src/game/business/state'
import { becomeCeo } from '../src/game/business/career'
import { equipmentValue, valuationOf } from '../src/game/business/economy'
import { applyFallback } from '../src/game/offline'
import type { Asset, GameState, Json, MenuNode } from '../src/game/types'
import { legacyInventionCapital } from '../src/game/workshop/legacy-capital'
import { migrateLegacy, needsMigration, readInv } from '../src/game/workshop/migrate'
import { addIdea, inventions, mutWorkshop, readWorkshop } from '../src/game/workshop/notebook'
import { yearlyWorkshop } from '../src/game/workshop/yearly'
import { workshopMenu } from '../src/game/workshop/menu'
import { catalogIdea } from '../src/game/workshop/catalog'
import { filePatent, license } from '../src/game/workshop/launch'

function oldLife(): GameState {
  const g = makeTestGame(21, { age: 40, money: 250_000, talents: ['Inventor'] })
  g.year = 2026
  g.lifeId = 'old-save'
  return g
}
function oldProfile(g: GameState): void {
  g.flags['special.inventor'] = {
    v: 2, owner: ownerKey(g), studies: [{ topic: 'solid-battery', points: 6, year: 2024 }],
    expertise: { energy: 62, materials: 10 }, reputation: 33, strain: 10, setbacks: 0,
    project: { id: 'invention-7', topic: 'solid-battery', name: 'Test Cell', kind: 'big', started: 2024, progress: 2, years: 4, budget: 500_000, country: 'us', approach: 'balanced', engineering: 60, validation: 40, model: 'career' },
    lastYear: 2025, work: [{ id: 'old-w', name: 'Old Filter', topic: 'water-filter', year: 2020, units: 0, royalties: 0, recognition: 0, contributors: '' }],
    journal: ['2024: Funded Test Cell.'], grant: null, lastCareerYear: 2025, event: null,
  } as unknown as Json
}
function oldIp(id: string, extra: Record<string, Json> = {}, value = 1_200): Asset {
  return {
    id, kind: 'invention', name: 'Self-cleaning coating', emoji: '\u{1F4A1}', purchasePrice: 5_000, value, condition: 100, purchasedAge: 30, upkeep: 0,
    details: { inventorIp: { v: 3, topic: 'smart-coating', field: 'materials', kind: 'small', created: 2023, country: 'us', budget: 12_000, unitPrice: 100, unitCost: 50, potential: 300, protections: [{ country: 'us', filed: 2023, expires: 2043 }], marketFit: 1.3, reliability: 1.1, evidenceBased: true, inventor: 'Test Player', ...extra } },
  }
}
function oldCompany(g: GameState): Asset {
  const b0 = newBiz(g, 'manufacturing', 'us', g.character.city, { cash: 3_000_000, founded: 2015 })
  const a = createBusinessAsset(g, 'Old Works', b0, 1_000_000)
  g.assets.push(a)
  becomeCeo(g, a, bizOf(g, a))
  g.queue = []
  const b = bizOf(g, a)
  b.inventionProducts = [
    { id: 'p1', ipId: 'p1', name: 'Quantum material', field: 'materials', kind: 'big', price: 1500, unitCost: 900, potential: 10_000, production: 100, inventory: 50, rights: 'owned', royalty: 0, expires: 0, protections: [{ country: 'us', filed: 2020, expires: 2040 }], started: 2020, lastYear: 2025, sold: 500, revenue: 750_000, costs: 500_000, fabCapacity: 1000, fabInvested: 400_000, upgradeInvested: 50_000, upgradeLevel: 1, marketFit: 1, reliability: 1 },
  ] as unknown as Json
  b.inventionStaff = 7
  b.employees += 7
  b.expansion = {
    strategies: [{ id: 'value', country: 'us', started: 2025, expires: 2028 }], studies: [{ country: 'us', year: 2025 }],
    research: { id: 'r1', name: 'Next-generation grid storage', kind: 'early', started: 2024, years: 3, odds: 1, budget: 100_000 },
    patents: [
      { id: 'p1', name: 'Quantum material', kind: 'big', launched: 2020, expires: 2040, protections: [{ country: 'us', filed: 2020, expires: 2040 }] },
      { id: 'p9', name: 'Old patent', kind: 'middle', launched: 2018, expires: 2038, protections: [{ country: 'us', filed: 2018, expires: 2038 }] },
    ],
    lastYear: 2025,
  } as unknown as Json
  b.inventionLicenses = [{ id: 'p1:industrial:2024', inventionId: 'p1', partner: 'industrial', country: 'us', started: 2024, expires: 2029, lastYear: 2025 }] as unknown as Json
  return a
}
function walk(g: GameState, nodes: MenuNode[], depth = 0): void {
  for (const n of nodes) {
    if (n.type === 'heading') continue
    if (n.type === 'info') { if (typeof n.text === 'function') n.text(g); continue }
    if (typeof n.subtitle === 'function') n.subtitle(g)
    n.disabledReason?.(g)
    n.hint?.(g)
    if (n.type === 'action') n.confirm?.(g)
    if (n.type === 'menu' && depth < 6) { n.header?.(g); walk(g, n.children(g), depth + 1) }
  }
}

describe('the old Inventor profile', () => {
  it('becomes skill, reputation and a notebook idea at a matching quality, with no refund', () => {
    const g = oldLife()
    oldProfile(g)
    const money = g.character.money
    const preview = readWorkshop(g) // pure reader, nothing written yet
    expect(g.flags.workshop).toBeUndefined()
    expect(preview.skill).toBe(62)
    expect(preview.rep).toBe(33)
    expect(preview.ideas).toHaveLength(1)
    expect(preview.ideas[0]).toMatchObject({ id: 'legacy-invention-7', q: 52, custom: { name: 'Test Cell', cat: 'energy', d: 4 } })
    expect(migrateLegacy(g)).toBe(true)
    expect(g.flags['special.inventor']).toBeUndefined()
    const ws = readWorkshop(g)
    expect(ws).toEqual({ ...preview, owner: ws.owner })
    expect(g.character.money).toBe(money)
    expect(migrateLegacy(g)).toBe(false)
    // The old project can now be built, patented and launched like any idea.
    expect(filePatent(g, { kind: 'idea', id: 'legacy-invention-7' }, 'home')).not.toBeNull()
    expect(inventions(g)[0].a.name).toBe('Test Cell')
  })

  it("ignores another character's profile and damaged data", () => {
    const g = oldLife()
    g.flags['special.inventor'] = { owner: 'someone-else', expertise: { energy: 99 } } as unknown as Json
    expect(readWorkshop(g).skill).toBe(0)
    g.flags['special.inventor'] = 'garbage' as unknown as Json
    g.flags.inventionImpact = { events: [{ junk: true }] } as unknown as Json
    expect(() => readWorkshop(g)).not.toThrow()
    expect(() => migrateLegacy(g)).not.toThrow()
    expect(g.flags.inventionImpact).toBeUndefined()
  })
})

describe('old personal invention IP', () => {
  it('becomes a patented, not-yet-launched invention with the same id and at least its old value', () => {
    const g = oldLife()
    g.assets.push(oldIp('invention-3'))
    const worth = netWorth(g)
    const view = readInv(g, g.assets[0])!
    expect(view).toMatchObject({ stage: 'patented', patent: { scope: 'home', country: 'us', filed: 2023, expires: 2043 }, q: 81, custom: { cat: 'home', d: 2, a: 4 } })
    migrateLegacy(g)
    const a = g.assets.find((x) => x.id === 'invention-3')!
    expect(a.details.inventorIp).toBeUndefined()
    expect(readInv(g, a)).toMatchObject({ stage: 'patented', q: 81, legacyValue: 1_200 })
    expect(a.value).toBeGreaterThanOrEqual(1_200)
    expect(netWorth(g)).toBeGreaterThanOrEqual(worth)
    expect(netWorth(g) - worth).toBeLessThan(250_000) // a sensible value, not a windfall
    expect(license(g, { kind: 'asset', id: a.id })).not.toBeNull()
  })

  it('keeps paying royalties when outside manufacturers held a licence', () => {
    const g = oldLife()
    const a = oldIp('invention-4')
    a.details.inventionLicenses = [{ id: 'invention-4:industrial:2024', inventionId: 'invention-4', partner: 'industrial', country: 'us', started: 2024, expires: 2029, lastYear: 2025, units: 100, sales: 10_000, royalties: 800 }] as unknown as Json
    g.assets.push(a)
    migrateLegacy(g)
    const inv = readInv(g, a)!
    expect(inv).toMatchObject({ stage: 'launched', route: 'license', rate: 0.08, launched: 2024, last: 2025 })
    const money = g.character.money
    g.year += 1
    g.flags.taxableIncome = 0
    yearlyWorkshop(g)
    expect(g.character.money).toBeGreaterThan(money)
    expect(g.flags.taxableIncome).toBe(g.character.money - money)
  })

  it('keeps a confidential financial model as an unpatented invention', () => {
    const g = oldLife()
    g.assets.push(oldIp('invention-5', { field: 'finance', topic: 'private-market-model', kind: 'big', closedLoop: true, protections: [] }, 9_000))
    migrateLegacy(g)
    expect(readInv(g, g.assets[0])).toMatchObject({ stage: 'patented', patent: null, custom: { cat: 'computing', d: 4 } })
    expect(g.assets[0].value).toBeGreaterThanOrEqual(9_000)
  })

  it('keeps unreadable old IP as a plain invention instead of throwing or dropping it', () => {
    const g = oldLife()
    const a = oldIp('invention-6', { field: 'nonsense', kind: 42 as unknown as Json }, 777)
    g.assets.push(a)
    expect(() => migrateLegacy(g)).not.toThrow()
    expect(g.assets).toHaveLength(1)
    expect(readInv(g, g.assets[0])!.legacyValue).toBe(777)
    expect(g.assets[0].value).toBeGreaterThanOrEqual(777)
  })
})

describe('old company inventions', () => {
  it('become "made in my company" inventions with no cash change and the factories still on the books', () => {
    const g = oldLife()
    const c = oldCompany(g)
    const b = bizOf(g, c)
    const cash = b.cash, equipment = equipmentValue(b), value = valuationOf(b), employees = b.employees
    expect(legacyInventionCapital(b)).toBe(450_000)
    expect(needsMigration(g)).toBe(true)
    migrateLegacy(g, g.year - 1)
    const after = bizOf(g, c)
    expect(after.cash).toBe(cash)
    expect(equipmentValue(after)).toBe(equipment)
    expect(valuationOf(after)).toBe(value)
    expect(after.employees).toBe(employees - 7)
    expect(after.inventionStaff).toBe(0)
    const x = after.expansion as Record<string, unknown>
    expect(x.research).toBeUndefined()
    expect(x.patents).toBeUndefined()
    expect(x.strategies).toHaveLength(1)
    const made = inventions(g)
    expect(made.map((o) => o.a.name).sort()).toEqual(['Next-generation grid storage', 'Old patent', 'Quantum material'])
    for (const o of made) {
      expect(o.inv).toMatchObject({ stage: 'launched', route: 'company', company: c.id })
      expect(o.a.value).toBe(0) // the company's value already holds it
    }
    expect(made.find((o) => o.a.name === 'Quantum material')!.inv).toMatchObject({ launched: 2020, last: 2025 })
    expect(made.find((o) => o.a.name === 'Next-generation grid storage')!.inv.launched).toBe(2027)
    // Idempotent.
    const snapshot = JSON.stringify(g)
    expect(migrateLegacy(g)).toBe(false)
    expect(JSON.stringify(g)).toBe(snapshot)
    expect(needsMigration(g)).toBe(false)
  })

  it('keeps selling through the company next year, booked as company income', () => {
    const g = oldLife()
    const c = oldCompany(g)
    g.year += 1
    g.yearActions = {}
    const cash = bizOf(g, c).cash
    yearlyWorkshop(g) // migrates (g.year - 2 settled) and settles fiscal g.year - 1
    const b = bizOf(g, c)
    expect(b.cash - cash).toBe(b.yearIncome)
    expect(b.yearIncome).toBeGreaterThan(0)
    expect(b.yearIncome).toBeLessThan(5_000_000)
  })

  it('leaves closed financial systems on a bank untouched and harmless', () => {
    const g = oldLife()
    const bank = createBusinessAsset(g, 'Old Bank', newBiz(g, 'bank', 'us', g.character.city, { cash: 50_000_000, founded: 2010 }), 1_000_000)
    g.assets.push(bank)
    bizOf(g, bank).closedInventions = [{ id: 'c1', name: 'Model', topic: 'private-market-model', created: 2020, updated: 2024, quality: 70 }] as unknown as Json
    const before = bizOf(g, bank).cash
    expect(() => migrateLegacy(g)).not.toThrow()
    expect(bizOf(g, bank).cash).toBe(before)
    expect(inventions(g)).toHaveLength(0)
  })
})

describe('an old save in play', () => {
  it('renders menus without migrating, then plays years without throwing or jumping in money', () => {
    const g = oldLife()
    oldProfile(g)
    g.assets.push(oldIp('invention-3'))
    oldCompany(g)
    g.queue.push({ kind: 'choice', id: 'old-popup', title: 'Strategic Technology Under Pressure', text: 'Old.', choices: [{ id: 'refuse', label: 'Refuse' }], source: 'script', scriptId: 'invention.strategicPressure', data: { id: 'x', token: 'y' } })
    const before = JSON.stringify(g)
    walk(g, [workshopMenu])
    walk(g, assetsMenu.children(g))
    expect(JSON.stringify(g)).toBe(before)
    const m = g.queue.pop()!
    expect(() => runScript(g, 'invention.strategicPressure', 'refuse', m.kind === 'choice' ? m.data : undefined, m)).not.toThrow()
    g.queue = []
    const worth = netWorth(g)
    for (let y = 0; y < 3 && g.character.alive; y++) {
      ageUp(g)
      for (let i = 0; i < 100 && g.queue.length; i++) {
        const q = g.queue.shift()!
        if (q.kind === 'choice' && q.scriptId) runScript(g, q.scriptId, q.choices[0].id, q.data, q)
        else if (q.kind === 'aiTask') applyFallback(g, q.task)
      }
      expect(Number.isFinite(g.character.money)).toBe(true)
    }
    expect(needsMigration(g)).toBe(false)
    expect(netWorth(g)).toBeLessThan(worth * 3 + 5_000_000)
    expect(readWorkshop(g).skill).toBeGreaterThanOrEqual(62)
  })
})

describe('heirs', () => {
  it('inherit inventions (still selling) but start a fresh notebook', () => {
    const g = makeTestGame(31, { age: 70, money: 100_000, talents: ['Inventor'] })
    g.year = 2026
    const ws = mutWorkshop(g)
    ws.skill = 90
    addIdea(g, ws, catalogIdea('robot-mower')!)
    addIdea(g, ws, catalogIdea('pocket-tool')!)
    ws.ideas.forEach((i) => (i.q = 80))
    license(g, { kind: 'idea', id: 'robot-mower' })
    g.queue = []
    const heir = createPerson(g, { relation: 'child', age: 40, money: 1_000 })
    killCharacter(g, 'Old Age')
    const n = continueAsChild(g, heir.id)
    expect(inventions(n)).toHaveLength(1)
    expect(readWorkshop(n).ideas).toHaveLength(0)
    expect(readWorkshop(n).skill).toBe(0)
    n.queue = []
    const money = n.character.money
    n.year += 1
    n.flags.taxableIncome = 0
    yearlyWorkshop(n)
    expect(n.character.money).toBeGreaterThan(money)
  })
})
