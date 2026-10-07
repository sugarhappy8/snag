import { describe, expect, it } from 'vitest'
import { yearlyAssets } from '../src/game/assets'
import { netWorth } from '../src/game/core'
import { runScript } from '../src/game/scripts'
import { luxuryLifestyleMenu, yearlyLuxury } from '../src/game/shops/luxury'
import { LUXURY_NET_WORTH, luxuryAssets, luxuryBlock, luxuryReason, wealthLock } from '../src/game/shops/luxury-common'
import { buyJet, buyYacht, interiorsFor, jetCrewCost, jetListings, yachtListings, yearlyFleet, YACHT_INTERIORS } from '../src/game/shops/luxury-fleet'
import { buyIsland, ISLAND_MAX_PRICE, ISLAND_MIN_PRICE, ISLAND_PLANS, islandListings, regionsFor } from '../src/game/shops/luxury-islands'
import { attendVipEvent, haveTreatment, SPA_PER_YEAR, SPA_TREATMENTS, spaPrice } from '../src/game/shops/luxury-pamper'
import { joinReason, joinSociety, leaveSociety, membership, SOCIETIES, societyById } from '../src/game/shops/luxury-societies'
import { hireStaff, payroll, staffRoster, STAFF_ROLES, staffWage } from '../src/game/shops/luxury-staff'
import type { GameState, MenuGroup, MenuNode, ModalItem } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { makeTestGame } from './helpers'

function rich(money = 50_000_000, countryId = 'us', age = 40, seed = 3): GameState {
  return makeTestGame(seed, { age, money, countryId, birthCountryId: countryId })
}

function jail(g: GameState): void {
  g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
}

function titles(g: GameState): string[] {
  return g.queue.flatMap((m) => (m.kind === 'notice' || m.kind === 'choice' ? [m.title] : []))
}

/** Resolve the first pending script choice/input with `choice`. */
function answer(g: GameState, choice: string): void {
  const i = g.queue.findIndex((m) => (m.kind === 'choice' && m.source === 'script') || m.kind === 'input')
  expect(i).toBeGreaterThanOrEqual(0)
  const m = g.queue[i] as ModalItem & { scriptId?: string; data?: never }
  g.queue.splice(i, 1)
  runScript(g, String(m.scriptId), choice, m.data, m)
}

function text(v: string | ((g: GameState) => string) | undefined, g: GameState): string {
  return typeof v === 'function' ? v(g) : (v ?? '')
}

/** Walk a menu tree, evaluating every label, subtitle, header and reason. Returns all text. */
function walk(g: GameState, node: MenuNode, depth = 0, out: string[] = []): string[] {
  if (node.type === 'info') {
    out.push(text(node.text, g))
    return out
  }
  if (node.type === 'heading') {
    out.push(node.label)
    return out
  }
  out.push(node.label, text(node.subtitle, g), node.disabledReason?.(g) ?? '')
  if (node.type === 'menu' && depth < 4) {
    out.push(node.header?.(g) ?? '')
    for (const child of node.children(g)) walk(g, child, depth + 1, out)
  }
  return out
}

describe('Luxury Lifestyle gate', () => {
  it('locks below $5M net worth and says how much more is needed', () => {
    const g = rich(4_000_000)
    const reason = luxuryLifestyleMenu.disabledReason?.(g)
    expect(reason).toContain('$1,000,000 more')
    expect(luxuryLifestyleMenu.visible?.(g)).toBe(true)
    g.character.money = LUXURY_NET_WORTH
    expect(netWorth(g)).toBe(LUXURY_NET_WORTH)
    expect(luxuryLifestyleMenu.disabledReason?.(g)).toBeNull()
    expect(wealthLock(g)).toBeNull()
  })

  it('counts debts against the threshold', () => {
    const g = rich(6_000_000)
    g.character.loans.push({ id: 'l1', kind: 'personal', lender: 'Bank', balance: 2_000_000, yearlyPayment: 100_000, rate: 0.05 })
    expect(luxuryLifestyleMenu.disabledReason?.(g)).toContain('$1,000,000 more')
  })

  it('is hidden for kids, prisoners and the dead', () => {
    const kid = rich(80_000_000, 'us', 12)
    expect(luxuryLifestyleMenu.visible?.(kid)).toBe(false)
    expect(luxuryBlock(kid)).toContain('adults')
    const con = rich()
    jail(con)
    expect(luxuryLifestyleMenu.visible?.(con)).toBe(false)
    expect(luxuryBlock(con)).toContain('prison')
    const dead = rich()
    dead.character.alive = false
    expect(luxuryLifestyleMenu.visible?.(dead)).toBe(false)
    expect(luxuryBlock(dead)).toContain('dead')
  })

  it('stays open to manage holdings after net worth drops, but the shops lock', () => {
    const g = rich(60_000_000)
    const l = islandListings(g)[0]
    expect(buyIsland(g, l, null)).not.toBeNull()
    g.character.money = 0
    for (const a of g.assets) a.value = 1_000_000
    expect(netWorth(g)).toBeLessThan(LUXURY_NET_WORTH)
    expect(luxuryLifestyleMenu.disabledReason?.(g)).toBeNull()
    expect(luxuryReason(g)).toContain('more')
    const kids = luxuryLifestyleMenu.children(g)
    expect(kids.some((n) => n.id === 'lux-holdings')).toBe(true)
  })
})

describe('Island Realtor', () => {
  it('lists islands from $5M to $300M near the player', () => {
    const g = rich()
    const list = islandListings(g)
    expect(list.length).toBeGreaterThan(0)
    for (const l of list) {
      expect(l.price).toBeGreaterThanOrEqual(ISLAND_MIN_PRICE)
      expect(l.price).toBeLessThanOrEqual(ISLAND_MAX_PRICE)
      expect(Number.isFinite(l.upkeep) && l.upkeep > 0).toBe(true)
    }
    const us = regionsFor('us').map((r) => r.region.id)
    expect(us).toContain('exumas')
    expect(us).not.toContain('cyclades')
    const gr = regionsFor('gr').map((r) => r.region.id)
    expect(gr).toContain('cyclades')
    expect(gr).not.toContain('exumas')
    expect(regionsFor('au').map((r) => r.region.id)).toContain('whitsundays')
    expect(regionsFor('ae').map((r) => r.region.id)).toContain('gulf')
    expect(regionsFor('ke').map((r) => r.region.id)).toContain('zanzibar')
    expect(regionsFor('th').map((r) => r.region.id)).toContain('andaman')
  })

  it('has sensible listings in every country', () => {
    for (const country of COUNTRIES) {
      const g = rich(50_000_000, country.id)
      const list = islandListings(g)
      expect(list.length, country.id).toBeGreaterThan(0)
      for (const l of list) {
        expect(Number.isFinite(l.price), country.id).toBe(true)
        expect(l.name, country.id).not.toMatch(/undefined|NaN/)
      }
    }
  })

  it('buys an island with cash as a Private Island house that ages sensibly', () => {
    const g = rich(400_000_000)
    const l = islandListings(g)[0]
    const before = g.character.money
    const a = buyIsland(g, l, null)
    expect(a).not.toBeNull()
    expect(a?.kind).toBe('house')
    expect(a?.details.typeLabel).toBe('Private Island')
    expect(a?.details.acres).toBe(l.acres)
    expect(g.character.money).toBe(before - l.price)
    expect(islandListings(g).some((x) => x.id === l.id)).toBe(false)
    expect(titles(g)).toContain('Island Owner!')
    for (let i = 0; i < 5; i++) {
      g.character.age += 1
      g.year += 1
      yearlyAssets(g)
      yearlyLuxury(g)
      g.queue = []
    }
    const isle = g.assets.find((x) => x.id === a?.id)
    expect(isle).toBeDefined()
    expect(Number.isFinite(isle?.value) && (isle?.value ?? 0) > 0).toBe(true)
    expect(Number.isFinite(isle?.upkeep) && (isle?.upkeep ?? 0) > 0).toBe(true)
  })

  it('finances an island through a private bank', () => {
    const g = rich(30_000_000)
    g.character.job = { defId: 'ceo', title: 'CEO', company: 'Big Co', category: 'fulltime', salary: 3_000_000, level: 5, performance: 80, yearsInRole: 5, yearsAtCompany: 5, data: {} }
    const l = islandListings(g)[0]
    const a = buyIsland(g, l, ISLAND_PLANS[ISLAND_PLANS.length - 1])
    if (a) expect(a.mortgage?.balance).toBeGreaterThan(0)
    else expect(titles(g)).toContain('Loan Denied')
  })

  it('refuses kids, prisoners and the dead', () => {
    const kid = rich(400_000_000, 'us', 10)
    expect(buyIsland(kid, islandListings(kid)[0], null)).toBeNull()
    const con = rich(400_000_000)
    jail(con)
    expect(buyIsland(con, islandListings(con)[0], null)).toBeNull()
    expect(con.assets).toHaveLength(0)
  })
})

describe('Megayachts and custom jets', () => {
  it('builds a megayacht with a custom interior and ~10% upkeep', () => {
    const g = rich(1_000_000_000)
    const list = yachtListings(g)
    expect(list.length).toBeGreaterThan(0)
    for (const l of list) {
      expect(l.lengthM).toBeGreaterThanOrEqual(40)
      expect(l.lengthM).toBeLessThanOrEqual(180)
    }
    const l = list[list.length - 1]
    const gold = YACHT_INTERIORS.find((x) => x.id === 'gold')
    const before = g.character.money
    const a = buyYacht(g, l, 'gold')
    expect(a?.kind).toBe('boat')
    expect(a?.details.luxury).toBe('megayacht')
    expect(a?.details.interior).toBe('gold')
    const paid = before - g.character.money
    expect(paid).toBeGreaterThan(l.price * ((gold?.mult ?? 1) - 0.02))
    expect((a?.upkeep ?? 0) / paid).toBeGreaterThan(0.07)
    expect((a?.upkeep ?? 0) / paid).toBeLessThan(0.13)
    expect(Number(a?.details.crew)).toBeGreaterThan(5)
    expect(yachtListings(g).some((x) => x.id === l.id)).toBe(false)
  })

  it('only offers the submarine garage on big hulls', () => {
    expect(interiorsFor('megayacht', 45).some((x) => x.id === 'sub')).toBe(false)
    expect(interiorsFor('megayacht', 90).some((x) => x.id === 'sub')).toBe(true)
  })

  it('buys a jet whose crew costs less once you can fly it yourself', () => {
    const g = rich(1_000_000_000)
    const l = jetListings(g)[0]
    const a = buyJet(g, l, 'spa')
    expect(a?.kind).toBe('aircraft')
    expect(a?.details.luxury).toBe('jet')
    if (!a) return
    const withCrew = a.upkeep
    expect(jetCrewCost(g, a)).toBe(Number(a.details.crewCost))
    g.character.licenses.push('pilot')
    yearlyFleet(g)
    expect(a.upkeep).toBeLessThan(withCrew)
    expect(jetCrewCost(g, a)).toBeLessThan(Number(a.details.crewCost))
  })

  it('pays charter income as taxable income', () => {
    const g = rich(1_000_000_000)
    const a = buyYacht(g, yachtListings(g)[0], 'classic')
    if (!a) throw new Error('no yacht')
    a.details.chartered = true
    g.flags.taxableIncome = 0
    const before = g.character.money
    yearlyFleet(g)
    expect(g.character.money).toBeGreaterThan(before)
    expect(g.flags.taxableIncome).toBe(g.character.money - before)
  })

  it('refuses a broke buyer', () => {
    const g = rich(6_000_000)
    const l = yachtListings(g)[0]
    expect(buyYacht(g, l, 'classic')).toBeNull()
    expect(titles(g)).toContain('Insufficient Funds')
    expect(luxuryAssets(g)).toHaveLength(0)
  })
})

describe('Secret societies', () => {
  it('joins, pays dues every year and leaves', () => {
    const g = rich(60_000_000)
    const club = societyById('bookclub')
    if (!club) throw new Error('missing society')
    expect(joinReason(g, club)).toBeNull()
    expect(joinSociety(g, club)).toBe(true)
    expect(membership(g)?.id).toBe('bookclub')
    expect(joinReason(g, SOCIETIES.find((s) => s.id !== 'bookclub') ?? club)).toContain('Leave')
    const before = g.character.money
    g.character.age += 1
    g.year += 1
    yearlyLuxury(g)
    if (membership(g)) {
      expect(g.character.money).toBe(before - club.dues)
      expect(membership(g)?.years).toBe(1)
    }
    g.queue = []
    if (!membership(g)) joinSociety(g, societyById('croissant') ?? club)
    expect(leaveSociety(g)).toBe(true)
    expect(membership(g)).toBeNull()
    expect(JSON.parse(JSON.stringify(g.flags))).toEqual(g.flags)
  })

  it('runs the initiation popup: pass and join, or fail and wait a year', () => {
    let joined = 0
    let failed = 0
    for (let seed = 1; seed <= 12; seed++) {
      const g = rich(40_000_000, 'us', 40, seed)
      const node = (secretMenu(g).children(g).find((n) => n.id === 'lux-soc-owl') ?? null) as MenuNode | null
      expect(node?.type).toBe('action')
      if (node?.type !== 'action') return
      node.run(g)
      answer(g, 'stare')
      if (membership(g)?.id === 'owl') joined++
      else {
        failed++
        expect(joinReason(g, societyById('owl') ?? SOCIETIES[0])).toContain('next year')
      }
    }
    expect(joined).toBeGreaterThan(0)
    expect(joined + failed).toBe(12)
  })

  it('enforces requirements', () => {
    const g = rich(8_000_000)
    expect(joinReason(g, societyById('monocle') ?? SOCIETIES[0])).toContain('net worth')
    g.character.hidden.karma = 20
    expect(joinReason(g, societyById('midnight') ?? SOCIETIES[0])).toContain('good')
  })

  it('expels a member who cannot pay dues, and bans them', () => {
    const g = rich(30_000_000)
    const club = societyById('walrus')
    if (!club) throw new Error('missing society')
    joinSociety(g, club)
    g.character.money = 1_000
    yearlyLuxury(g)
    expect(membership(g)).toBeNull()
    expect(titles(g)).toContain('Expelled!')
    g.character.money = 100_000_000
    expect(joinReason(g, club)).toContain('expelled')
  })

  it('expels a member who goes to prison', () => {
    const g = rich(30_000_000)
    joinSociety(g, societyById('croissant') ?? SOCIETIES[0])
    jail(g)
    yearlyLuxury(g)
    expect(membership(g)).toBeNull()
  })
})

function secretMenu(g: GameState): MenuGroup {
  const node = luxuryLifestyleMenu.children(g).find((n) => n.id === 'luxurySocieties')
  if (!node || node.type !== 'menu') throw new Error('no societies menu')
  return node
}

describe('Personal staff', () => {
  it('pays wages that follow local labor costs', () => {
    const butler = STAFF_ROLES[0]
    const us = staffWage(rich(), butler)
    const india = staffWage(rich(50_000_000, 'in'), butler)
    const swiss = staffWage(rich(50_000_000, 'ch'), butler)
    expect(india).toBeLessThan(us)
    expect(swiss).toBeGreaterThan(india)
    expect(Number.isFinite(us) && us > 0).toBe(true)
  })

  it('hires through the agency, pays every birthday and quits when you are broke', () => {
    const g = rich(20_000_000)
    const chef = STAFF_ROLES.find((r) => r.id === 'chef')
    if (!chef) throw new Error('no chef')
    expect(hireStaff(g, 'chef', { name: 'Remy Ratatouille', gender: 'male', hiredAge: 40, skill: 1, quirk: 'puts foam on everything' })).toBe(true)
    expect(staffRoster(g)).toHaveLength(1)
    const wage = payroll(g)
    expect(wage).toBe(staffWage(g, chef))
    g.queue = []
    const before = g.character.money
    const health = g.character.stats.health
    yearlyLuxury(g)
    expect(g.character.money).toBe(before - wage)
    expect(g.character.stats.health).toBeGreaterThanOrEqual(Math.min(100, health))
    g.character.money = 10
    g.queue = []
    yearlyLuxury(g)
    expect(staffRoster(g)).toHaveLength(0)
    expect(titles(g)).toContain('Staff Walked Out')
    expect(g.character.money).toBe(10)
  })

  it('lets staff go when the player goes to prison', () => {
    const g = rich(20_000_000)
    hireStaff(g, 'bodyguard', { name: 'Big Tony', gender: 'male', hiredAge: 40, skill: 1.2, quirk: 'never smiles' })
    jail(g)
    yearlyLuxury(g)
    expect(staffRoster(g)).toHaveLength(0)
  })

  it('offers three candidates in a popup', () => {
    const g = rich(20_000_000)
    const staff = luxuryLifestyleMenu.children(g).find((n) => n.id === 'luxuryStaff')
    if (!staff || staff.type !== 'menu') throw new Error('no staff menu')
    const hire = staff.children(g).find((n) => n.id === 'lux-staff-hire-butler')
    if (!hire || hire.type !== 'action') throw new Error('no hire action')
    hire.run(g)
    const modal = g.queue.find((m) => m.kind === 'choice')
    expect(modal && modal.kind === 'choice' ? modal.choices.length : 0).toBe(4)
    answer(g, '2')
    expect(staffRoster(g)[0]?.role.id).toBe('butler')
  })
})

describe('Spa and VIP events', () => {
  it('limits spa treatments per year and scales prices locally', () => {
    const g = rich()
    for (let i = 0; i < SPA_PER_YEAR; i++) expect(haveTreatment(g, SPA_TREATMENTS[i].id)).toBe(true)
    expect(haveTreatment(g, SPA_TREATMENTS[0].id)).toBe(false)
    expect(spaPrice(rich(50_000_000, 'in'), SPA_TREATMENTS[0])).toBeLessThan(spaPrice(rich(), SPA_TREATMENTS[0]))
  })

  it('goes to each VIP event once a year; the gala raises karma', () => {
    const g = rich(100_000_000)
    g.character.hidden.karma = 40
    expect(attendVipEvent(g, 'gala', 'generous')).toBe(true)
    expect(g.character.hidden.karma).toBeGreaterThan(40)
    expect(attendVipEvent(g, 'gala')).toBe(false)
    for (const id of ['chefDinner', 'wedding', 'premiere', 'nightclub'] as const) expect(attendVipEvent(g, id)).toBe(true)
    expect(g.character.money).toBeLessThan(100_000_000)
  })
})

describe('Every country and age', () => {
  it('renders the whole luxury menu without NaN or undefined', () => {
    for (const country of COUNTRIES) {
      const g = rich(2_000_000_000, country.id)
      buyIsland(g, islandListings(g)[0], null)
      buyYacht(g, yachtListings(g)[0], 'classic')
      buyJet(g, jetListings(g)[0], 'boardroom')
      hireStaff(g, 'butler', { name: 'Alfred Penny', gender: 'male', hiredAge: 40, skill: 1, quirk: 'irons newspapers' })
      joinSociety(g, societyById('bookclub') ?? SOCIETIES[0])
      const all = walk(g, luxuryLifestyleMenu).join('\n')
      expect(all, country.id).not.toMatch(/NaN|undefined|\[object/)
      yearlyLuxury(g)
      expect(Number.isFinite(g.character.money), country.id).toBe(true)
    }
  })

  it('does nothing for the dead and stays quiet for kids', () => {
    const dead = rich()
    joinSociety(dead, societyById('bookclub') ?? SOCIETIES[0])
    dead.character.alive = false
    const money = dead.character.money
    yearlyLuxury(dead)
    expect(dead.character.money).toBe(money)
    const kid = rich(10_000_000, 'us', 8)
    yearlyLuxury(kid)
    expect(kid.queue).toHaveLength(0)
  })
})

/** Every action in a menu tree (depth-limited). */
function actions(g: GameState, node: MenuNode, depth = 0, out: MenuNode[] = []): MenuNode[] {
  if (node.type === 'action') out.push(node)
  if (node.type === 'menu' && depth < 4) for (const child of node.children(g)) actions(g, child, depth + 1, out)
  return out
}

describe('Fuzzing every luxury action and popup', () => {
  it('runs every action and every popup answer without NaN or crashes', () => {
    for (const country of ['us', 'gr', 'in']) {
      const base = rich(900_000_000, country, 45, 11)
      buyIsland(base, islandListings(base)[0], null)
      buyYacht(base, yachtListings(base)[yachtListings(base).length - 1], 'sub')
      buyJet(base, jetListings(base)[0], 'boardroom')
      hireStaff(base, 'bodyguard', { name: 'Big Tony', gender: 'male', hiredAge: 40, skill: 1.2, quirk: 'never smiles' })
      joinSociety(base, societyById('walrus') ?? SOCIETIES[0])
      base.queue = []
      const snapshot = JSON.stringify(base)
      for (const act of actions(base, luxuryLifestyleMenu)) {
        if (act.type !== 'action') continue
        const g = JSON.parse(snapshot) as GameState
        if (act.disabledReason?.(g)) continue
        act.run(g, 'Sea Biscuit')
        for (let step = 0; step < 3; step++) {
          const modal = g.queue.find((m) => (m.kind === 'choice' && m.source === 'script') || m.kind === 'input')
          if (!modal) break
          const options = modal.kind === 'choice' ? modal.choices.map((c) => c.id) : ['Sea Biscuit']
          for (const opt of options) {
            const h = JSON.parse(JSON.stringify(g)) as GameState
            answer(h, opt)
            expect(Number.isFinite(h.character.money), `${country} ${act.id} ${opt}`).toBe(true)
            for (const m of h.queue) if (m.kind === 'notice') expect(m.text, `${act.id} ${opt}`).not.toMatch(/NaN|undefined/)
          }
          answer(g, options[0])
        }
      }
      // Yearly popups over a long life, answering every popup with its first option.
      const g = JSON.parse(snapshot) as GameState
      for (let y = 0; y < 40; y++) {
        g.character.age += 1
        g.year += 1
        g.yearActions = {}
        yearlyLuxury(g)
        yearlyAssets(g)
        for (let k = 0; k < 4; k++) {
          const modal = g.queue.find((m) => m.kind === 'choice' && m.source === 'script')
          if (!modal || modal.kind !== 'choice') break
          answer(g, modal.choices[y % modal.choices.length].id)
        }
        for (const m of g.queue) if (m.kind === 'notice') expect(m.text).not.toMatch(/NaN|undefined/)
        g.queue = []
        expect(Number.isFinite(g.character.money)).toBe(true)
      }
      expect(JSON.parse(JSON.stringify(g.flags))).toEqual(g.flags)
    }
  })
})

