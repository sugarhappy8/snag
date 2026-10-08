// After you die: the reading of the will, contested wills (fees, delay, odds by role), charity,
// probate, the cut-out heir's choices, minors, and a full family simulated to death. Money is
// always conserved: every dollar of the estate ends up with someone, in the taxman's pocket, in
// legal fees, with charity, in probate or in a claim waiting for the court.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { killCharacter } from '../src/game/death'
import { addHeir, changeWill, removeHeir } from '../src/game/events/will-act'
import { CHARITY, readWill, readWl, updateWl, willSlices } from '../src/game/events/will-core'
import { contestAward, contestFee, contestOdds, planEstate, yearlyEstateTail } from '../src/game/events/will-estate'
import { continueAsChild, createNewLife } from '../src/game/life'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState, ModalItem, NoticeModal, Person } from '../src/game/types'
import { makeTestGame } from './helpers'

interface Fam {
  g: GameState
  spouse: Person
  a: Person
  b: Person
  c: Person
}

function fam(seed = 1, opts: { money?: number; age?: number } = {}): Fam {
  const g = makeTestGame(seed, { age: opts.age ?? 78, money: opts.money ?? 6_000_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.year = 2026
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  const mk = (relation: Person['relation'], age: number, relationship: number, traits: string[]): Person => {
    const p = createPerson(g, { relation, age, relationship, traits, money: 20_000, countryId: 'us' })
    p.yearsKnown = Math.min(age, 40)
    return p
  }
  return { g, spouse: mk('spouse', 76, 80, ['calm', 'loyal']), a: mk('child', 50, 75, ['kind', 'calm']), b: mk('child', 47, 70, ['hot-headed', 'jealous']), c: mk('child', 44, 60, ['funny', 'outgoing']) }
}

function cutKnown(g: GameState, p: Person, anger: number): void {
  changeWill(g, (gg, w) => removeHeir(gg, w, p))
  g.queue = []
  updateWl(g, p, (w) => {
    w.known = true
    w.how = 'leak'
    w.told = 'out'
    w.anger = anger
  })
}

function die(g: GameState): void {
  killCharacter(g, 'Old Age')
  g.queue = g.queue.filter((m) => m.kind !== 'aiTask')
}

function notices(g: GameState): NoticeModal[] {
  return g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
}

function choice(g: GameState, scriptId: string): ChoiceModal | undefined {
  return g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === scriptId)
}

function answer(g: GameState, scriptId: string, id: string): void {
  const i = g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === scriptId)
  if (i < 0) throw new Error(`no ${scriptId}`)
  const m = g.queue.splice(i, 1)[0] as ChoiceModal
  runScript(g, m.scriptId!, id, m.data, m)
}

/** Everything that left the estate, from a planEstate run on a copy (no new generation needed). */
function audit(g: GameState, heirId: string): { estate: number; out: number; plan: ReturnType<typeof planEstate> } {
  const n = structuredClone(g)
  const before = n.people.reduce((a, p) => a + p.money, 0)
  const estate = n.character.money
  const heir = n.people.find((p) => p.id === heirId)!
  const plan = planEstate(n, { estate, heirId, adult: heir.age >= 18, hasProperty: false, cashAfterDebts: estate })
  const after = n.people.reduce((a, p) => a + p.money, 0)
  const pot = plan.pot?.claim ?? 0
  const out = after - before + plan.heirCash + plan.held + plan.charityCash + plan.tax + plan.fees + pot
  return { estate, out, plan }
}

describe('estate math', () => {
  it('splits evenly among the children with no will, as it always did', () => {
    const f = fam(1, { money: 3_000_000 })
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    expect(n.character.money).toBe(f.a.money + Math.floor(3_000_000 / 3))
    expect(n.people.find((p) => p.id === f.b.id)!.money).toBe(20_000 + 1_000_000)
    expect(notices(n).map((m) => m.title)).not.toContain('The Reading of the Will')
  })

  it('conserves money in every shape of will, with and without a fight', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const f = fam(600 + seed, { money: 4_000_000 + seed * 900_000 })
      const kind = seed % 5
      if (kind === 1) cutKnown(f.g, f.b, 80)
      if (kind === 2) {
        changeWill(f.g, (gg, w) => {
          addHeir(gg, w, f.spouse, 100)
          w.charity = 25
        })
        cutKnown(f.g, f.c, 70)
      }
      if (kind === 3) {
        changeWill(f.g, (gg, w) => {
          gg.character.willBeneficiaries = [f.c.id]
          w.shares = {}
        })
      }
      if (kind === 4) f.g.character.money = 60_000_000
      f.g.queue = []
      die(f.g)
      for (const heir of [f.a, f.b, f.c]) {
        const { estate, out } = audit(f.g, heir.id)
        // Each heir is rounded down: at most a dollar each.
        expect(Math.abs(estate - out)).toBeLessThanOrEqual(6)
      }
    }
  })

  it('charity takes its share off the top and the heirs split the rest', () => {
    const f = fam(2, { money: 5_000_000 })
    changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.a.id, f.b.id]
      w.charity = 30
    })
    f.g.queue = []
    expect(willSlices(f.g).find((s) => s.id === CHARITY)!.pct).toBeCloseTo(0.3)
    die(f.g)
    const { plan } = audit(f.g, f.a.id)
    expect(plan.charityCash).toBe(1_500_000)
    expect(plan.heirCash).toBe(1_750_000)
    const n = continueAsChild(f.g, f.a.id)
    expect(n.character.money).toBe(f.a.money + 1_750_000)
    expect(n.people.find((p) => p.id === f.b.id)!.money).toBe(20_000 + 1_750_000)
    expect(n.people.find((p) => p.id === f.c.id)!.money).toBe(20_000)
  })

  it('keeps the estate tax above the threshold and takes fees off before anyone is paid', () => {
    const f = fam(3, { money: 50_000_000 })
    f.g.character.countryId = 'us'
    die(f.g)
    const { plan, estate, out } = audit(f.g, f.a.id)
    expect(plan.tax).toBe(Math.round((estate - 10_000_000) * 0.25))
    expect(Math.abs(estate - out)).toBeLessThanOrEqual(6)
  })

  it('weighted shares: a half share is half of an equal one', () => {
    const f = fam(4, { money: 3_500_000 })
    changeWill(f.g, (gg, w) => {
      addHeir(gg, w, f.a, 100)
      addHeir(gg, w, f.b, 50)
      gg.character.willBeneficiaries = [f.a.id, f.b.id]
    })
    f.g.queue = []
    die(f.g)
    const { plan } = audit(f.g, f.a.id)
    expect(plan.heirCash).toBe(2_333_333)
  })
})

describe('odds of a contest', () => {
  it('follow the role: a spouse or a young dependent child fares best', () => {
    const f = fam(5)
    const minor = createPerson(f.g, { relation: 'child', age: 12, relationship: 80 })
    const sis = createPerson(f.g, { relation: 'sibling', age: 70, relationship: 70 })
    const pal = createPerson(f.g, { relation: 'bestFriend', age: 70, relationship: 80 })
    const odds = (p: Person) => contestOdds(f.g, p)
    expect(odds(minor)).toBeGreaterThan(odds(f.spouse) - 0.001)
    expect(odds(f.spouse)).toBeGreaterThan(odds(f.a))
    expect(odds(f.a)).toBeGreaterThan(odds(sis))
    expect(odds(sis)).toBeGreaterThan(odds(pal))
    for (const p of [minor, f.spouse, f.a, sis, pal]) {
      expect(odds(p)).toBeGreaterThanOrEqual(0.03)
      expect(odds(p)).toBeLessThanOrEqual(0.85)
    }
  })

  it('rise for a very recent change and for a will that looks unduly influenced', () => {
    const f = fam(6)
    const base = contestOdds(f.g, f.a)
    changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.c.id]
      w.shares = {}
    })
    f.g.queue = []
    f.c.relationship = 95
    f.g.character.age = 84
    const recent = contestOdds(f.g, f.a)
    expect(recent).toBeGreaterThan(base + 0.15)
    f.g.year += 8
    f.g.character.age += 8
    const stale = contestOdds(f.g, f.a)
    expect(stale).toBeLessThan(recent - 0.15)
  })

  it('fall when you explained in advance or the spouse signed a prenup', () => {
    const f = fam(7)
    cutKnown(f.g, f.a, 60)
    const plain = contestOdds(f.g, f.a)
    updateWl(f.g, f.a, (w) => void (w.explained = 'kind'))
    expect(contestOdds(f.g, f.a)).toBeLessThan(plain)
    const before = contestOdds(f.g, f.spouse)
    f.spouse.data.prenup = true
    expect(contestOdds(f.g, f.spouse)).toBeLessThan(before - 0.15)
  })

  it('awards and fees are positive, bounded and scale with the estate', () => {
    const f = fam(8)
    expect(contestAward(f.spouse, 10_000_000, 3)).toBeGreaterThanOrEqual(2_000_000)
    expect(contestAward(f.a, 10_000_000, 3)).toBeLessThan(contestAward(f.spouse, 10_000_000, 3))
    expect(contestAward(f.a, 10_000_000, 3)).toBeLessThanOrEqual(2_500_000)
    const fee = contestFee(f.g, f.a, 10_000_000)
    expect(fee).toBeGreaterThan(0)
    expect(fee).toBeLessThanOrEqual(1_200_000)
    expect(contestFee(f.g, f.a, 0)).toBe(0)
  })
})

describe('a will that cuts someone close', () => {
  it('turns the reading into a scene and sometimes a court case that costs the estate', () => {
    let fought = 0
    let fees = 0
    let reading = 0
    let probate = 0
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      const f = fam(700 + seed, { money: 20_000_000 })
      f.b.traits = ['hot-headed', 'arrogant']
      f.b.data.entitlement = 80
      cutKnown(f.g, f.b, 85)
      f.g.queue = []
      die(f.g)
      const n = structuredClone(f.g)
      const heir = n.people.find((p) => p.id === f.a.id)!
      const plan = planEstate(n, { estate: n.character.money, heirId: heir.id, adult: true, hasProperty: false, cashAfterDebts: n.character.money })
      const cut = plan.cutOut.find((c) => c.id === f.b.id)
      expect(cut).toBeTruthy()
      expect(cut!.anger).toBeGreaterThan(0)
      if (cut!.filed) {
        fought += 1
        fees += plan.fees
        outcomes.add(cut!.outcome)
        expect(plan.fees).toBeGreaterThan(0)
        if (plan.held > 0) probate += 1
      }
      const next = continueAsChild(f.g, f.a.id)
      const titles = notices(next).map((m) => m.title)
      if (titles.includes('The Reading of the Will')) reading += 1
    }
    expect(reading).toBe(60)
    expect(fought).toBeGreaterThan(10)
    expect(fought).toBeLessThan(60)
    expect(fees).toBeGreaterThan(0)
    expect(probate).toBeGreaterThan(0)
    expect(outcomes.size).toBeGreaterThanOrEqual(2)
  })

  it('does not hand a contested heir their full cash at once, and releases probate after a year or three', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const f = fam(800 + seed, { money: 20_000_000 })
      f.b.traits = ['hot-headed', 'arrogant']
      cutKnown(f.g, f.b, 90)
      f.g.queue = []
      die(f.g)
      const n = continueAsChild(f.g, f.a.id)
      const esc = n.flags['will.escrow'] as { amount: number; year: number } | undefined
      if (!esc) continue
      expect(esc.amount).toBeGreaterThan(0)
      expect(esc.year).toBeGreaterThan(n.year - 1)
      expect(esc.year).toBeLessThanOrEqual(n.year + 3)
      const before = n.character.money
      n.queue = []
      n.character.age = Math.max(n.character.age, 18)
      while (n.year < esc.year) n.year += 1
      yearlyEstateTail(n)
      expect(n.character.money).toBe(before + esc.amount)
      expect(n.flags['will.escrow']).toBeUndefined()
      return
    }
    throw new Error('no contested estate in 80 seeds')
  })

  it('shapes what a cut-out sibling does to the heir: a slammed door, an angry sibling asking for a share', () => {
    let asked = false
    for (let seed = 1; seed <= 40 && !asked; seed++) {
      const f = fam(900 + seed, { money: 20_000_000 })
      f.b.traits = ['hot-headed', 'arrogant']
      cutKnown(f.g, f.b, 80)
      f.g.queue = []
      die(f.g)
      const n = continueAsChild(f.g, f.a.id)
      const ask = choice(n, 'will.estate.ask')
      if (!ask) continue
      asked = true
      const bro = n.people.find((p) => p.id === f.b.id)!
      expect(bro.relationship).toBeLessThan(75)
      const m0 = n.character.money
      const b0 = bro.money
      answer(n, 'will.estate.ask', 'half')
      const given = m0 - n.character.money
      expect(given).toBeGreaterThan(0)
      expect(bro.money - b0).toBe(given)
      expect(bro.relationship).toBeGreaterThan(40)
    }
    expect(asked).toBe(true)
  })

  it('keeping everything is a real choice with a price', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const f = fam(950 + seed, { money: 20_000_000 })
      f.b.traits = ['hot-headed', 'arrogant']
      cutKnown(f.g, f.b, 80)
      f.g.queue = []
      die(f.g)
      const n = continueAsChild(f.g, f.a.id)
      if (!choice(n, 'will.estate.ask')) continue
      const bro = n.people.find((p) => p.id === f.b.id)!
      const r0 = bro.relationship
      const m0 = n.character.money
      answer(n, 'will.estate.ask', 'keep')
      expect(n.character.money).toBe(m0)
      expect(bro.relationship).toBeLessThan(r0)
      return
    }
    throw new Error('never asked')
  })
})

describe('the heir who was written out', () => {
  function cutOutHeir(seed: number): GameState | null {
    const f = fam(seed, { money: 24_000_000 })
    f.a.traits = ['kind', 'calm']
    changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.b.id, f.c.id]
      w.shares = {}
    })
    f.g.queue = []
    updateWl(f.g, f.a, (w) => {
      w.known = true
      w.anger = 60
      w.told = 'out'
    })
    f.g.character.money = 24_000_000
    die(f.g)
    return continueAsChild(f.g, f.a.id)
  }

  it('is told so, offered honest odds and a choice', () => {
    const n = cutOutHeir(1001)!
    const m = choice(n, 'will.estate.heir')
    expect(m).toBeTruthy()
    expect(m!.text).toMatch(/about \d+% of the time/)
    expect(m!.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['talk', 'drop']))
    const odds = Math.round((n.flags['will.pot'] as { odds: number }).odds * 100)
    expect(m!.text).toContain(`${odds}%`)
    expect(n.log[0].entries.some((e) => /cut out/.test(e.text))).toBe(true)
  })

  it('can let it go: the held amount goes back to the siblings and nothing is lost', () => {
    const n = cutOutHeir(1002)!
    const pot = (n.flags['will.pot'] as { claim: number }).claim
    const sum0 = n.people.reduce((a, p) => a + p.money, 0)
    answer(n, 'will.estate.heir', 'drop')
    const sum1 = n.people.reduce((a, p) => a + p.money, 0)
    expect(Math.abs(sum1 - sum0 - pot)).toBeLessThanOrEqual(3)
    expect(n.flags['will.pot']).toBeUndefined()
  })

  it('can contest: pays the fees up front, waits years, then wins or loses with the money conserved', () => {
    let won = 0
    let lost = 0
    for (let seed = 0; seed < 40; seed++) {
      const n = cutOutHeir(1100 + seed)!
      const pot = n.flags['will.pot'] as { claim: number; odds: number }
      const contest = choice(n, 'will.estate.heir')!.choices.find((c) => c.id === 'contest')
      expect(contest).toBeTruthy()
      const claim = pot.claim
      const sibs = n.people.filter((p) => p.alive && (p.relation === 'sibling' || p.relation === 'halfSibling'))
      const sumSibs0 = sibs.reduce((a, p) => a + p.money, 0)
      const cash0 = n.character.money
      answer(n, 'will.estate.heir', 'contest')
      const fee = cash0 - n.character.money
      expect(fee).toBeGreaterThan(0)
      n.queue = []
      expect(n.flags['will.pot']).toBeTruthy()
      n.character.age = Math.max(n.character.age, 30)
      const after = n.character.money
      let guard = 0
      while (n.flags['will.pot'] && guard++ < 6) {
        n.year += 1
        yearlyEstateTail(n)
        n.queue = []
      }
      expect(n.flags['will.pot']).toBeUndefined()
      const gained = n.character.money - after
      const sumSibs1 = sibs.reduce((a, p) => a + p.money, 0)
      if (gained > 0) {
        won += 1
        expect(gained).toBe(claim)
        expect(sumSibs1).toBe(sumSibs0)
      } else {
        lost += 1
        expect(Math.abs(sumSibs1 - sumSibs0 - claim)).toBeLessThanOrEqual(3)
      }
    }
    expect(won).toBeGreaterThan(2)
    expect(lost).toBeGreaterThan(2)
  })

  it('cannot contest what it cannot pay for', () => {
    let checked = 0
    for (let seed = 0; seed < 30; seed++) {
      const f = fam(1201 + seed, { money: 24_000_000 })
      for (const p of [f.b, f.c]) {
        p.traits = ['jealous', 'arrogant', 'stingy']
        p.relationship = 20
      }
      changeWill(f.g, (gg, w) => {
        gg.character.willBeneficiaries = [f.b.id, f.c.id]
        w.shares = {}
      })
      f.g.queue = []
      f.a.money = 0
      die(f.g)
      const n = continueAsChild(f.g, f.a.id)
      const m = choice(n, 'will.estate.heir')!
      expect(m).toBeTruthy()
      if (n.character.money > 0) continue
      checked += 1
      expect(m.choices.some((c) => c.id === 'contest')).toBe(false)
      expect(m.text).toMatch(/can.t afford the fees/)
      expect(m.choices.map((c) => c.id)).toEqual(['talk', 'drop'])
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('a minor who was cut out is represented by a guardian: no popup, and the court sometimes restores a share', () => {
    let restored = 0
    let none = 0
    for (let seed = 0; seed < 60; seed++) {
      const f = fam(1301 + seed, { money: 20_000_000 })
      f.g.people = f.g.people.filter((p) => p.id !== f.c.id)
      const kid = createPerson(f.g, { relation: 'child', age: 15, relationship: 80, traits: ['kind'] })
      kid.yearsKnown = 15
      kid.money = 0
      changeWill(f.g, (gg, w) => {
        gg.character.willBeneficiaries = [f.a.id, f.b.id]
        w.shares = {}
      })
      f.g.queue = []
      die(f.g)
      const { estate, out } = audit(f.g, kid.id)
      expect(Math.abs(estate - out)).toBeLessThanOrEqual(6)
      const n = continueAsChild(f.g, kid.id)
      expect(n.character.age).toBe(15)
      expect(choice(n, 'will.estate.heir')).toBeUndefined()
      expect(Number.isFinite(n.character.money)).toBe(true)
      if (n.character.money > 0) restored += 1
      else none += 1
    }
    expect(restored).toBeGreaterThan(3)
    expect(none).toBeGreaterThan(3)
  })
})

describe('edge cases', () => {
  it('a sole adult heir still keeps the house and the cash untaxed', () => {
    const f = fam(15, { money: 500_000 })
    f.g.people = f.g.people.filter((p) => p.id === f.a.id)
    f.g.assets.push({ id: 'h1', kind: 'house', name: 'Family Home', emoji: '🏠', purchasePrice: 200_000, value: 400_000, condition: 80, purchasedAge: 30, upkeep: 2000, details: {} })
    f.g.character.residence = { status: 'owned', assetId: 'h1' }
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    expect(n.assets.map((a) => a.id)).toEqual(['h1'])
    expect(n.character.money).toBe(20_000 + 500_000)
  })

  it('a dead named heir drops out and the rest inherit; with nobody named it falls back to the children', () => {
    const f = fam(16, { money: 3_000_000 })
    changeWill(f.g, (gg, w) => {
      gg.character.willBeneficiaries = [f.a.id, f.b.id, f.c.id]
      w.shares = {}
    })
    f.g.queue = []
    f.b.alive = false
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    expect(n.character.money).toBe(20_000 + 1_500_000)
    const g2 = fam(17, { money: 3_000_000 })
    g2.g.character.willBeneficiaries = [g2.a.id]
    g2.a.alive = false
    die(g2.g)
    const m = continueAsChild(g2.g, g2.c.id)
    expect(m.character.money).toBe(20_000 + Math.floor(3_000_000 / 2))
  })

  it('a pending probate share becomes part of the estate when the player dies', () => {
    const f = fam(18, { money: 1_000_000 })
    f.g.flags['will.escrow'] = { amount: 400_000, year: f.g.year + 2 }
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    expect(n.character.money).toBe(20_000 + Math.floor(1_400_000 / 3))
    expect(n.flags['will.escrow']).toBeUndefined()
  })

  it('works for someone who dies in prison and for an heir abroad', () => {
    const f = fam(19, { money: 8_000_000 })
    cutKnown(f.g, f.b, 70)
    f.g.character.prison = { name: 'State Pen', security: 'medium', crime: 'fraud', sentenceYears: 20, yearsServed: 3, respect: 50, appealed: false, escapeAttempts: 0 }
    f.a.data.countryId = 'gb'
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    expect(Number.isFinite(n.character.money)).toBe(true)
    expect(n.character.prison).toBeNull()
    expect(JSON.parse(JSON.stringify(n))).toEqual(n)
  })

  it('does nothing odd with a dead player\'s old state: continueAsChild on a clean save', () => {
    const f = fam(20, { money: 0 })
    die(f.g)
    const n = continueAsChild(f.g, f.a.id)
    expect(n.character.money).toBe(20_000)
    expect(readWill(n).changes).toBe(0)
  })
})

// ---------------------------------------------------------------------------

function drain(g: GameState, chooser: (m: ChoiceModal) => string): void {
  for (let guard = 0; guard < 200 && g.queue.length > 0; guard++) {
    const m: ModalItem = g.queue.shift()!
    if (m.kind === 'notice' || m.kind === 'aiTask') continue
    if (m.kind === 'choice') {
      const id = chooser(m) || m.choices[0].id
      if (m.scriptId) runScript(g, m.scriptId, id, m.data, m)
    } else if (m.kind === 'input') {
      runScript(g, m.scriptId, m.defaultValue ?? String(m.min ?? 1), m.data, m)
    } else if (m.kind === 'minigame') {
      runScript(g, m.scriptId, 'lose', m.data, m)
    }
  }
}

describe('a whole family to the grave', () => {
  it('simulates generations with a will fight in the middle, without errors or odd numbers', () => {
    for (const seed of [11, 12, 13]) {
      let g = createNewLife({ seed, countryId: 'us', year: 1960 })
      let safety = 0
      while (g.character.alive && safety++ < 120) {
        ageUp(g)
        drain(g, (m) => {
          if (m.scriptId === 'will.confront') return 'refuse'
          if (m.scriptId === 'will.tell') return 'silent'
          if (m.scriptId === 'will.spouse') return 'bluff'
          return m.choices[0].id
        })
        if (g.character.age === 40 && g.character.alive) {
          g.character.money = 12_000_000
          const kids = [1, 2, 3].map((i) => {
            const p = createPerson(g, { relation: 'child', age: 14 + i * 3, relationship: 70, traits: i === 2 ? ['hot-headed', 'jealous'] : ['kind'] })
            p.yearsKnown = p.age
            return p
          })
          g.character.willBeneficiaries = []
          changeWill(g, (gg, w) => removeHeir(gg, w, kids[1]))
          drain(g, (m) => (m.scriptId === 'will.tell' ? 'silent' : m.choices[0].id))
          updateWl(g, kids[1], (w) => void (w.hard = 2))
        }
        for (const p of g.people) {
          expect(Number.isFinite(p.money)).toBe(true)
          expect(p.relationship).toBeGreaterThanOrEqual(0)
          expect(p.relationship).toBeLessThanOrEqual(100)
          const w = readWl(g, p)
          expect(w.anger).toBeGreaterThanOrEqual(0)
          expect(w.anger).toBeLessThanOrEqual(100)
        }
        expect(Number.isFinite(g.character.money)).toBe(true)
      }
      expect(g.character.alive).toBe(false)
      const kids = g.people.filter((p) => p.alive && (p.relation === 'child' || p.relation === 'stepchild'))
      if (kids.length) {
        const n = continueAsChild(g, kids[0].id)
        expect(Number.isFinite(n.character.money)).toBe(true)
        expect(n.character.money).toBeGreaterThanOrEqual(0)
        drain(n, (m) => m.choices[0].id)
        expect(JSON.parse(JSON.stringify(n))).toEqual(n)
      }
    }
  })
})
