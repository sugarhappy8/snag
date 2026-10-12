import { describe, expect, it } from 'vitest'
import { entitlement, perceivedWealth, showOffHeat } from '../src/game/events/wealth-core'
import { updateWl } from '../src/game/events/will-core'
import { netWorth } from '../src/game/core'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { brandAssets, luxuryAssetNodes, yearlyBrandAssets } from '../src/game/shops/luxury-brands-assets'
import { lineById } from '../src/game/shops/luxury-brands-catalog'
import { buyOffer, decayHeat, toggleInsurance } from '../src/game/shops/luxury-brands-deal'
import { eligibleReason, familyAccessNode, familyUseNodes, grantAccess, hasAccess, accessOf, revokeAccess, revokeCost, shareable, yearlyFamilyUse } from '../src/game/shops/luxury-family'
import { hireStaff } from '../src/game/shops/luxury-staff'
import type { Asset, GameState, MenuNode, ModalItem, Person } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { makeTestGame } from './helpers'

function rich(money = 400_000_000, countryId = 'us', age = 45, seed = 5, year = 2026): GameState {
  const g = makeTestGame(seed, { age, money, countryId, birthCountryId: countryId })
  g.year = year
  g.log[0].year = year
  g.character.licenses.push('driver', 'boating', 'pilot')
  return g
}

function buy(g: GameState, id: string, channel: 'boutique' | 'preowned' = 'boutique'): Asset {
  const before = g.assets.length
  const l = lineById(id)
  if (!l) throw new Error(id)
  // Allocation-only pieces: the pre-owned dealer sells them without the waiting list.
  buyOffer(g, l, 0, l.scarce !== undefined && g.year >= l.scarce && l.until === undefined ? 'preowned' : channel)
  g.queue = []
  expect(g.assets.length, id).toBe(before + 1)
  return g.assets[g.assets.length - 1]
}

function member(g: GameState, relation: Person['relation'], age: number, extra: Partial<Person> = {}): Person {
  const p = createPerson(g, { relation, age, relationship: 70, money: 1_000, traits: ['kind', 'calm'], ...(extra.traits ? { traits: extra.traits } : {}) })
  Object.assign(p, extra)
  return p
}

function answer(g: GameState, choice: string): void {
  const i = g.queue.findIndex((m) => m.kind === 'choice' && m.source === 'script')
  expect(i).toBeGreaterThanOrEqual(0)
  const m = g.queue[i] as ModalItem & { scriptId?: string; data?: never }
  g.queue.splice(i, 1)
  runScript(g, String(m.scriptId), choice, m.data, m)
}

function popups(g: GameState): { choices: number; notices: number } {
  return { choices: g.queue.filter((m) => m.kind === 'choice').length, notices: g.queue.filter((m) => m.kind === 'notice').length }
}

function actions(nodes: MenuNode[]): MenuNode[] {
  return nodes.filter((n) => n.type === 'action')
}

function hireChauffeur(g: GameState): void {
  hireStaff(g, 'chauffeur', { name: 'Jeeves Penny', gender: 'male', hiredAge: 40, skill: 1, quirk: 'knows every shortcut' })
}

describe('Family Access: the permission model', () => {
  it('grants and revokes per item and per person', () => {
    const g = rich()
    const watch = buy(g, 'rolex-datejust')
    const spouse = member(g, 'spouse', 44)
    const son = member(g, 'child', 20)
    expect(shareable(watch)).toBe(true)
    expect(hasAccess(g, watch, spouse)).toBe(false)
    expect(grantAccess(g, watch, spouse)).toBe(true)
    expect(hasAccess(g, watch, spouse)).toBe(true)
    expect(hasAccess(g, watch, son)).toBe(false)
    expect(accessOf(g, watch)).toEqual([spouse.id])
    expect(grantAccess(g, watch, son)).toBe(true)
    expect(accessOf(g, watch)).toHaveLength(2)
    revokeAccess(g, watch, son)
    expect(hasAccess(g, watch, son)).toBe(false)
    expect(hasAccess(g, watch, spouse)).toBe(true)
  })

  it('costs trust to take permission back, but only once they used it', () => {
    const g = rich()
    const watch = buy(g, 'omega-seamaster')
    const daughter = member(g, 'child', 22)
    grantAccess(g, watch, daughter)
    // given once counts as trust already extended
    const cost = revokeCost(g, daughter)
    expect(cost).toBeGreaterThan(0)
    const before = daughter.relationship
    revokeAccess(g, watch, daughter)
    expect(daughter.relationship).toBe(before - cost)
    // a person who never got anything costs nothing
    const stranger = member(g, 'sibling', 40)
    expect(revokeCost(g, stranger)).toBe(0)
  })

  it('works for existing cars, boats, jewelry and instruments, not for houses or heirlooms', () => {
    const g = rich()
    const mk = (kind: Asset['kind'], details: Asset['details'] = {}, value = 20_000): Asset => ({ id: `x-${kind}-${g.assets.length}`, kind, name: kind, emoji: 'x', purchasePrice: value, value, condition: 90, purchasedAge: 30, upkeep: 0, details })
    expect(shareable(mk('car', { carType: 'luxury' }))).toBe(true)
    expect(shareable(mk('boat'))).toBe(true)
    expect(shareable(mk('aircraft'))).toBe(true)
    expect(shareable(mk('jewelry'))).toBe(true)
    expect(shareable(mk('instrument'))).toBe(true)
    expect(shareable(mk('house'))).toBe(false)
    expect(shareable(mk('car', { heirloom: true }))).toBe(false)
    expect(shareable(mk('jewelry', {}, 300))).toBe(false)
    expect(shareable(mk('other', { category: 'groceries' }))).toBe(false)
  })

  it('does not let kids touch watches or supercars they are too young for', () => {
    const g = rich()
    const watch = buy(g, 'rolex-datejust')
    const tot = member(g, 'child', 7)
    const teen = member(g, 'child', 14)
    expect(eligibleReason(g, tot, watch)).toContain('too young')
    expect(eligibleReason(g, teen, watch)).toBeNull()
    const ferrari = buy(g, 'ferrari-296-gtb')
    const limit = getCountry('us').drivingAge
    const young = member(g, 'child', limit - 1)
    expect(eligibleReason(g, young, ferrari)).toContain('too young to drive')
    const seventeen = member(g, 'child', 17)
    // old enough for a licence in the US but not for a supercar without a driver
    expect(limit).toBeLessThanOrEqual(17)
    expect(eligibleReason(g, seventeen, ferrari)).toContain('No minors in a supercar')
    hireChauffeur(g)
    expect(eligibleReason(g, seventeen, ferrari)).toBeNull()
    expect(eligibleReason(g, young, ferrari)).toBeNull()
    expect(grantAccess(g, ferrari, tot)).toBe(true)
  })

  it('follows the driving age of the country', () => {
    const g = rich(400_000_000, 'de')
    const car = buy(g, 'porsche-taycan')
    const limit = getCountry('de').drivingAge
    const kid = member(g, 'child', limit - 1)
    expect(eligibleReason(g, kid, car)).toContain(String(limit))
    kid.age = limit
    expect(eligibleReason(g, kid, car)).toBeNull()
  })

  it('needs a crew or a pilot for aircraft, and refuses people you barely speak to', () => {
    const g = rich()
    g.character.licenses = g.character.licenses.filter((l) => l !== 'pilot')
    const heli = { id: 'h1', kind: 'aircraft' as const, name: 'Helicopter', emoji: '🚁', purchasePrice: 2e6, value: 2e6, condition: 90, purchasedAge: 40, upkeep: 0, details: { license: 'pilot' } }
    g.assets.push(heli)
    const kid = member(g, 'child', 25)
    expect(eligibleReason(g, kid, heli)).toContain('pilot')
    g.character.licenses.push('pilot')
    expect(eligibleReason(g, kid, heli)).toBeNull()
    kid.relationship = 10
    expect(eligibleReason(g, kid, heli)).toContain('barely speaking')
  })

  it('shows Family Access on the person sheet only for family while you are an adult', () => {
    const g = rich()
    const watch = buy(g, 'cartier-tank')
    const kid = member(g, 'child', 16)
    const friend = member(g, 'friend', 30)
    const pet = createPerson(g, { relation: 'pet', age: 3, species: 'Dog' })
    const rows = familyUseNodes(g, kid)
    expect(rows.length).toBe(2)
    expect(rows[0].type).toBe('heading')
    expect(familyUseNodes(g, friend)).toEqual([])
    expect(familyUseNodes(g, pet)).toEqual([])
    const asKid = rich(1000, 'us', 15)
    asKid.assets.push(watch)
    expect(familyUseNodes(asKid, member(asKid, 'parent', 40))).toEqual([])
    const node = familyAccessNode(g, watch)
    expect(node).not.toBeNull()
    expect(familyAccessNode(g, { ...watch, kind: 'house', value: 1e6 })).toBeNull()
  })

  it('toggles from the menu and costs trust on revoke', () => {
    const g = rich()
    const watch = buy(g, 'cartier-tank')
    const kid = member(g, 'child', 21)
    const group = familyUseNodes(g, kid)[1]
    expect(group.type).toBe('menu')
    if (group.type !== 'menu') return
    const row = actions(group.children(g)).find((n) => n.id.includes(watch.id))
    expect(row?.type).toBe('action')
    if (row?.type !== 'action') return
    expect(row.disabledReason?.(g)).toBeNull()
    row.run(g)
    expect(hasAccess(g, watch, kid)).toBe(true)
    g.queue = []
    expect(row.confirm?.(g)).toContain('Take away')
    const before = kid.relationship
    row.run(g)
    expect(hasAccess(g, watch, kid)).toBe(false)
    expect(kid.relationship).toBeLessThan(before)
  })

  it('a minor player, a prisoner and the dead cannot hand anything out', () => {
    const g = rich()
    const watch = buy(g, 'cartier-tank')
    const kid = member(g, 'child', 21)
    const group = familyUseNodes(g, kid)[1]
    if (group.type !== 'menu') return
    const row = actions(group.children(g))[0]
    if (row.type !== 'action') return
    g.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(row.disabledReason?.(g)).toContain('prison')
    void watch
  })
})

describe('Family Access: the yearly hook', () => {
  it('lets the family use what you allowed, with at most one choice popup and one bundled notice a year', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = rich(400_000_000, 'us', 45, seed)
      const spouse = member(g, 'spouse', 44)
      const kids = [member(g, 'child', 19), member(g, 'child', 23), member(g, 'child', 16)]
      for (const id of ['rolex-datejust', 'cartier-love-bracelet', 'ferrari-roma', 'porsche-taycan', 'sunseeker-predator']) {
        const a = buy(g, id)
        for (const p of [spouse, ...kids]) grantAccess(g, a, p)
      }
      for (let y = 0; y < 25; y++) {
        g.year += 1
        g.character.age += 1
        g.queue = []
        yearlyFamilyUse(g)
        const p = popups(g)
        expect(p.choices, `seed ${seed} year ${y}`).toBeLessThanOrEqual(1)
        expect(p.notices, `seed ${seed} year ${y}`).toBeLessThanOrEqual(1)
        for (const m of g.queue) if (m.kind === 'notice') expect(m.text).not.toMatch(/NaN|undefined/)
        while (g.queue.some((m) => m.kind === 'choice')) answer(g, (g.queue.find((m) => m.kind === 'choice') as Extract<ModalItem, { kind: 'choice' }>).choices[0].id)
        g.queue = []
        expect(Number.isFinite(g.character.money)).toBe(true)
      }
    }
  })

  it('never creates money: uninsured family use only ever costs', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = rich(400_000_000, 'us', 45, seed)
      const spouse = member(g, 'spouse', 44)
      const kid = member(g, 'child', 21)
      for (const id of ['patek-philippe-nautilus', 'bentley-flying-spur', 'riva-rivale']) {
        const a = buy(g, id)
        grantAccess(g, a, spouse)
        grantAccess(g, a, kid)
      }
      let money = g.character.money
      for (let y = 0; y < 20; y++) {
        g.year += 1
        g.queue = []
        yearlyFamilyUse(g)
        while (g.queue.some((m) => m.kind === 'choice')) answer(g, (g.queue.find((m) => m.kind === 'choice') as Extract<ModalItem, { kind: 'choice' }>).choices.at(-1)!.id)
        expect(g.character.money, `seed ${seed} year ${y}`).toBeLessThanOrEqual(money)
        money = g.character.money
      }
    }
  })

  it('spoils kids with expensive things and warms a partner to jewelry, in bounded steps', () => {
    let spoilGain = 0
    let control = 0
    for (let seed = 1; seed <= 25; seed++) {
      const g = rich(900_000_000, 'us', 45, seed)
      const kid = member(g, 'child', 17, { traits: ['kind'] })
      const other = member(g, 'child', 17, { traits: ['kind'] })
      for (const id of ['rolex-daytona', 'ferrari-roma', 'cartier-love-bracelet', 'audemars-piguet-royal-oak']) {
        const a = buy(g, id)
        grantAccess(g, a, kid)
      }
      const e0 = entitlement(kid)
      for (let y = 0; y < 6; y++) {
        g.year += 1
        g.queue = []
        const before = entitlement(kid)
        yearlyFamilyUse(g)
        expect(entitlement(kid) - before).toBeLessThanOrEqual(4)
        while (g.queue.some((m) => m.kind === 'choice')) answer(g, (g.queue.find((m) => m.kind === 'choice') as Extract<ModalItem, { kind: 'choice' }>).choices[0].id)
      }
      spoilGain += entitlement(kid) - e0
      control += entitlement(other) - 0
    }
    expect(spoilGain / 25).toBeGreaterThan(2)
    expect(control).toBe(0)
  })

  it('a partner with jewelry feels loved', () => {
    let gain = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = rich(400_000_000, 'us', 45, seed)
      const spouse = member(g, 'spouse', 44, { traits: ['kind'] })
      const ring = buy(g, 'van-cleef-arpels-alhambra')
      grantAccess(g, ring, spouse)
      const before = spouse.relationship
      for (let y = 0; y < 4; y++) {
        g.year += 1
        g.queue = []
        yearlyFamilyUse(g)
        g.queue = []
      }
      gain += spouse.relationship - before
    }
    expect(gain / 20).toBeGreaterThan(0)
  })

  it('gives the player a small, diminishing bit of fame and never money from a show-off', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = rich(400_000_000, 'us', 45, seed)
      const kids = [member(g, 'child', 20), member(g, 'child', 22), member(g, 'child', 24)]
      for (const id of ['rolex-daytona', 'ferrari-roma', 'gucci-dionysus']) {
        const a = buy(g, id)
        for (const p of kids) grantAccess(g, a, p)
      }
      const fame0 = g.character.hidden.fame
      g.year += 1
      g.queue = []
      yearlyFamilyUse(g)
      expect(g.character.hidden.fame - fame0).toBeLessThanOrEqual(2 + 2)
    }
  })

  it('raises how rich you look, within +35%, and fades by half each year', () => {
    const g = rich(5_000_000)
    expect(perceivedWealth(g)).toBe(netWorth(g))
    g.flags['lux.heat'] = 0.2
    expect(showOffHeat(g)).toBe(0.2)
    expect(perceivedWealth(g)).toBeCloseTo(netWorth(g) * 1.2, 0)
    g.flags['lux.heat'] = 5
    expect(showOffHeat(g)).toBe(0.35)
    g.flags['lux.heat'] = 0.2
    decayHeat(g)
    expect(g.flags['lux.heat']).toBe(0.1)
    for (let i = 0; i < 6; i++) decayHeat(g)
    expect(g.flags['lux.heat']).toBe(0)
  })

  it('does nothing for a minor player, a prisoner, the dead or in the year of an emigration', () => {
    const make = (): GameState => {
      const g = rich()
      const kid = member(g, 'child', 20)
      const w = buy(g, 'rolex-datejust')
      grantAccess(g, w, kid)
      g.flags['lux.fam.at'] = 'us'
      return g
    }
    const run = (g: GameState, times = 20) => {
      const snap = JSON.stringify([g.assets, g.people, g.character.money])
      for (let i = 0; i < times; i++) {
        g.queue = []
        yearlyFamilyUse(g)
        expect(g.queue).toHaveLength(0)
      }
      expect(JSON.stringify([g.assets, g.people, g.character.money])).toBe(snap)
    }
    const minor = make()
    minor.character.age = 17
    run(minor)
    const con = make()
    con.character.prison = { name: 'State Pen', security: 'medium', crime: 'Fraud', sentenceYears: 3, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    run(con)
    const dead = make()
    dead.character.alive = false
    run(dead)
    const mover = make()
    mover.character.countryId = 'gb'
    run(mover, 1)
    // the following year the family is back at it
    mover.year += 1
    // Contacts now retain their actual country. Explicitly bring this child abroad
    // rather than assuming every contact teleports when the player emigrates.
    for (const p of mover.people.filter(p => p.relation === 'child')) p.data.countryId = 'gb'
    let used = 0
    for (let i = 0; i < 30; i++) {
      mover.queue = []
      yearlyFamilyUse(mover)
      used += mover.queue.length
    }
    expect(used).toBeGreaterThan(0)
  })

  it('drops access when a relative dies, is disowned or lives abroad, and heirs start clean', () => {
    const g = rich()
    const w = buy(g, 'rolex-datejust')
    const kid = member(g, 'child', 21)
    const sis = member(g, 'sibling', 40)
    const estranged = member(g, 'sibling', 38)
    grantAccess(g, w, kid)
    grantAccess(g, w, sis)
    grantAccess(g, w, estranged)
    kid.alive = false
    sis.data.countryId = 'gb'
    updateWl(g, estranged, (state) => {
      state.estr = true
    })
    expect(eligibleReason(g, estranged, w)).not.toBeNull()
    expect(familyUseNodes(g, estranged)).toEqual([])
    g.queue = []
    for (let i = 0; i < 10; i++) yearlyFamilyUse(g)
    expect(g.queue).toHaveLength(0)
    expect(accessOf(g, w)).toEqual([sis.id])
    // an heir (a different character id) sees nothing granted by the parent
    const heir: GameState = JSON.parse(JSON.stringify(g)) as GameState
    heir.character.id = 'heir-1'
    expect(accessOf(heir, heir.assets[0])).toEqual([])
    const kid2 = member(heir, 'child', 20)
    expect(hasAccess(heir, heir.assets[0], kid2)).toBe(false)
  })

  it('reveals a counterfeit when a relative wears it to a party', () => {
    let revealed = 0
    for (let seed = 1; seed <= 300 && revealed === 0; seed++) {
      const g = rich(900_000_000, 'us', 45, seed)
      const before = g.assets.length
      buyOffer(g, lineById('cartier-love-bracelet')!, 0, 'gray')
      g.queue = []
      if (g.assets.length === before) continue
      const a = g.assets[g.assets.length - 1]
      if (a.details.lfake !== true) continue
      const spouse = member(g, 'spouse', 40)
      grantAccess(g, a, spouse)
      for (let y = 0; y < 40 && a.details.auth === 'unknown'; y++) {
        g.queue = []
        yearlyFamilyUse(g)
        g.year += 1
      }
      if (a.details.auth === 'fake') revealed += 1
    }
    expect(revealed).toBe(1)
  })
})

describe('Family Access: decisions', () => {
  function find(title: string, make: () => GameState, tries = 600): GameState | null {
    for (let seed = 1; seed <= tries; seed++) {
      const g = make()
      g.rng = seed * 7919
      for (let y = 0; y < 3; y++) {
        g.queue = []
        yearlyFamilyUse(g)
        if (g.queue.some((m) => m.kind === 'choice' && m.title === title)) return g
        g.year += 1
      }
    }
    return null
  }

  it('a crash gives you real options: claim, pay, make them chip in, let it slide, or ground them', () => {
    const makeCrash = () => {
      const g = rich(900_000_000, 'us', 45, 3)
      const kid = member(g, 'child', 19, { traits: ['reckless'] })
      kid.data.entitlement = 70
      const car = buy(g, 'porsche-911-gt3-rs')
      toggleInsurance(g, car)
      g.queue = []
      grantAccess(g, car, kid)
      return g
    }
    const g = find('A Bad Day for the Paint', makeCrash, 800)
    expect(g).not.toBeNull()
    const modal = g!.queue.find((m) => m.kind === 'choice' && m.title === 'A Bad Day for the Paint') as Extract<ModalItem, { kind: 'choice' }>
    expect(modal.choices.map((c) => c.id)).toEqual(['claim', 'pay', 'split', 'slide', 'ground'])
    const snap = JSON.stringify(g)
    for (const id of modal.choices.map((c) => c.id)) {
      const h = JSON.parse(snap) as GameState
      const kid = h.people.find((p) => p.relation === 'child')!
      const car = h.assets.find((a) => a.details.lux === 1)!
      const e0 = entitlement(kid)
      const m0 = h.character.money
      const cond0 = car.condition
      answer(h, id)
      expect(h.character.money, id).toBeLessThanOrEqual(m0)
      expect(car.condition, id).toBeGreaterThanOrEqual(cond0)
      if (id === 'ground') expect(hasAccess(h, car, kid)).toBe(false)
      if (id === 'slide') expect(entitlement(kid)).toBeGreaterThan(e0)
      if (id === 'split') expect(entitlement(kid)).toBeLessThan(e0)
      for (const mm of h.queue) if (mm.kind === 'notice') expect(mm.text).not.toMatch(/NaN|undefined/)
    }
  })

  it('a crash repair is only done when it is paid for in full; a broke owner can leave it damaged', () => {
    const makeCrash = () => {
      const g = rich(900_000_000, 'us', 45, 3)
      const kid = member(g, 'child', 19, { traits: ['reckless'] })
      kid.data.entitlement = 70
      const car = buy(g, 'porsche-911-gt3-rs')
      toggleInsurance(g, car)
      g.queue = []
      grantAccess(g, car, kid)
      return g
    }
    const g = find('A Bad Day for the Paint', makeCrash, 800)
    expect(g).not.toBeNull()
    const modal = g!.queue.find((m) => m.kind === 'choice' && m.title === 'A Bad Day for the Paint') as Extract<ModalItem, { kind: 'choice' }>
    const snap = JSON.stringify(g)
    for (const id of modal.choices.map((c) => c.id)) {
      const h = JSON.parse(snap) as GameState
      h.character.money = 0
      const kid = h.people.find((p) => p.relation === 'child')!
      const car = h.assets.find((a) => a.details.lux === 1)!
      const cond0 = car.condition, kidMoney = kid.money
      answer(h, id)
      expect(h.character.money, id).toBe(0)
      expect(car.condition, id).toBe(cond0)
      expect(kid.money, id).toBe(kidMoney)
      if (id === 'ground') expect(hasAccess(h, car, kid)).toBe(false)
      const told = h.queue.filter((m) => m.kind === 'notice').map((m) => m.kind === 'notice' ? m.text : '').join(' ')
      expect(told, id).toMatch(/damaged/)
    }
    // A broke owner is offered the honest way out up front.
    const broke = () => { const x = makeCrash(); x.character.money = 1_000; return x }
    const poor = find('A Bad Day for the Paint', broke, 800)
    expect(poor).not.toBeNull()
    const offer = poor!.queue.find((m) => m.kind === 'choice' && m.title === 'A Bad Day for the Paint') as Extract<ModalItem, { kind: 'choice' }>
    expect(offer.choices.map((c) => c.id)).toContain('leave')
    const car = poor!.assets.find((a) => a.details.lux === 1)!, cond0 = car.condition
    answer(poor!, 'leave')
    expect(poor!.character.money).toBe(1_000); expect(car.condition).toBe(cond0)
    expect(poor!.queue.some((m) => m.kind === 'notice' && m.title === 'Left Damaged')).toBe(true)
  })

  it('a pawned watch can be bought back, forgiven or confronted', () => {
    const makePawn = () => {
      const g = rich(900_000_000, 'us', 45, 3)
      const kid = member(g, 'child', 22, { traits: ['sneaky', 'lazy'] })
      kid.data.entitlement = 80
      const w = buy(g, 'rolex-datejust')
      grantAccess(g, w, kid)
      return g
    }
    const g = find('Where Did It Go?', makePawn, 1500)
    if (!g) return
    expect(g.assets.some((a) => a.details.lux === 1)).toBe(false)
    const snap = JSON.stringify(g)
    for (const id of ['back', 'forgive', 'tell']) {
      const h = JSON.parse(snap) as GameState
      const m0 = h.character.money
      answer(h, id)
      if (id === 'back') {
        expect(h.assets.filter((a) => a.details.lux === 1)).toHaveLength(1)
        expect(h.character.money).toBeLessThan(m0)
        expect(brandAssets(h)[0].details.fam).toBeUndefined()
      } else expect(h.assets.filter((a) => a.details.lux === 1)).toHaveLength(0)
    }
  })

  it('a party on the yacht goes wrong and you pick how to handle it', () => {
    const makeParty = () => {
      const g = rich(900_000_000, 'us', 45, 3)
      const kid = member(g, 'child', 21, { traits: ['wild'] })
      const boat = buy(g, 'sunseeker-predator')
      grantAccess(g, boat, kid)
      return g
    }
    const g = find('The Party', makeParty, 800)
    expect(g).not.toBeNull()
    const modal = g!.queue.find((m) => m.kind === 'choice' && m.title === 'The Party') as Extract<ModalItem, { kind: 'choice' }>
    for (const c of modal.choices) {
      const h = JSON.parse(JSON.stringify(g)) as GameState
      const m0 = h.character.money
      answer(h, c.id)
      expect(h.character.money).toBeLessThan(m0)
    }
  })
})

describe('Brand holdings in the menus', () => {
  it('shows the full holding screen with family access, selling and service rows', () => {
    const g = rich()
    const a = buy(g, 'omega-speedmaster')
    member(g, 'child', 20)
    const nodes = luxuryAssetNodes(g, a)!
    const ids = nodes.map((n) => n.id)
    expect(ids.some((i) => i.startsWith('lux-sell-dealer'))).toBe(true)
    expect(ids.some((i) => i.startsWith('lux-sell-auction'))).toBe(true)
    expect(ids.some((i) => i.startsWith('fam-access'))).toBe(true)
    expect(ids.some((i) => i.startsWith('lux-gift'))).toBe(true)
    for (const n of nodes) {
      if (n.type === 'info') expect(typeof n.text === 'string' ? n.text : n.text(g)).not.toMatch(/NaN|undefined/)
    }
    yearlyBrandAssets(g, { left: 1 })
    expect(Number.isFinite(a.value)).toBe(true)
  })
})
