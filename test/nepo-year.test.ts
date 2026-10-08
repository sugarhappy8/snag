// The year at the family business: pay out of company cash, learning, morale, the press, the heir.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { becomeCeo, ceoPayNorm, syncCeo } from '../src/game/business/career'
import { businessView } from '../src/game/business/manage'
import { designateStaff, designateSuccessor, fire, handOverToSuccessor, hireRelative, makeCeo } from '../src/game/business/nepo-actions'
import { readJob, readPast } from '../src/game/business/nepo-job'
import { ceilingOf } from '../src/game/business/nepo-model'
import { ABOVE_MARKET, marketPay } from '../src/game/business/nepo-roles'
import { employeesOf, readFamily, successorOf } from '../src/game/business/nepo-state'
import { familyYear } from '../src/game/business/nepo-year'
import { bizOf, findBusiness } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { killCharacter } from '../src/game/death'
import { incomeTax } from '../src/game/finance'
import { updateWl } from '../src/game/events/will-core'
import { continueAsChild } from '../src/game/life'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, MenuAction } from '../src/game/types'
import { all, drain, kid, world } from './nepo-kit'

function yearOn(g: ReturnType<typeof world>['g']): void {
  g.year += 1
  g.yearActions = {}
}

describe('pay comes out of company cash, honestly', () => {
  it('a salary leaves the company, is a company cost, and reaches the relative net of income tax', () => {
    const { g, a, b } = world(101)
    const p = kid(g, 25, { smarts: 70 })
    hireRelative(g, a, b, p, { rank: 1 }, { quiet: true })
    const pay = readJob(p)!.pay
    const cash = bizOf(g, a).cash
    const costs = bizOf(g, a).yearCosts
    const money = p.money
    yearOn(g)
    familyYear(g)
    drain(g)
    const cur = bizOf(g, a)
    expect(cur.cash).toBe(cash - pay)
    expect(cur.yearCosts).toBe(costs + pay)
    const net = pay - incomeTax('us', pay)
    expect(p.money).toBe(Math.round(money + net))
    // Money is not created: company cash plus the relative's wealth fell by the tax.
    expect(cur.cash + p.money).toBeLessThan(cash + money)
  })

  it('uses the demoted salary in the same yearly cleanup when an outside CEO displaced a relative', () => {
    const { g, a, b } = world(116)
    const p = kid(g, 40, { smarts: 80 })
    expect(hireRelative(g, a, b, p, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(makeCeo(g, a, b, p).ok).toBe(true)
    const formerPay = readJob(p)!.pay
    const expectedPay = Math.round(Math.min(formerPay, marketPay(b, 4) * 1.5))
    b.manager = { ...b.manager!, firstName: 'Outside', lastName: 'Hire' }
    delete b.manager.personId
    const money = p.money

    yearOn(g)
    familyYear(g)

    expect(readJob(p)).toMatchObject({ rank: 4, pay: expectedPay, groom: false })
    expect(p.money).toBe(Math.round(money + expectedPay - incomeTax('us', expectedPay)))
  })

  it('pay far above the going rate costs the company its tax deduction too: no cheap way to move money to the kids', () => {
    const { g, a, b } = world(102)
    const p = kid(g, 25, { smarts: 70 })
    hireRelative(g, a, b, p, { rank: 1 }, { quiet: true })
    const j = readJob(p)!
    j.pay = marketPay(b, 1) * 4
    p.data.nepo = { ...(p.data.nepo as Record<string, never>), pay: j.pay }
    const cash = bizOf(g, a).cash
    yearOn(g)
    familyYear(g)
    drain(g)
    expect(cash - bizOf(g, a).cash).toBeGreaterThan(j.pay)
    expect(j.pay).toBeGreaterThan(marketPay(b, 1) * ABOVE_MARKET)
  })

  it('a company with no cash pays what it can, never goes negative on family pay, and the relative notices', () => {
    const { g, a, b } = world(103)
    const p = kid(g, 25, { smarts: 70 })
    hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    bizOf(g, a).cash = 0
    yearOn(g)
    familyYear(g)
    drain(g)
    expect(bizOf(g, a).cash).toBeGreaterThanOrEqual(0)
    const j = readJob(p)
    if (j) expect(j.unpaid).toBe(1)
  })
})

describe('growing, burning out, leaving', () => {
  it('a bright kid in a junior job grows and is rated well; skill never passes the ceiling', () => {
    const { g, a, b } = world(111)
    const p = kid(g, 22, { smarts: 90, traits: ['ambitious', 'serious'] })
    hireRelative(g, a, b, p, { rank: 1 }, { quiet: true })
    const start = readJob(p)!.skill
    for (let y = 0; y < 6; y++) {
      yearOn(g)
      bizOf(g, a).cash = 3_000_000
      familyYear(g)
      drain(g)
      p.age += 1
      if (!readJob(p)) break
    }
    const j = readJob(p)
    if (j) {
      expect(j.skill).toBeGreaterThan(start)
      expect(j.skill).toBeLessThanOrEqual(ceilingOf(p) + 1)
      expect(j.perf).toBeGreaterThanOrEqual(0)
      expect(j.perf).toBeLessThanOrEqual(100)
    }
  })

  it('a kid far out of their depth burns out and leaves; the company is not left holding a corpse', () => {
    const { g, a, b } = world(112)
    const p = kid(g, 23, { smarts: 12, traits: ['lazy'] })
    hireRelative(g, a, b, p, { rank: 3 }, { quiet: true })
    let left = false
    for (let y = 0; y < 8 && !left; y++) {
      yearOn(g)
      bizOf(g, a).cash = 3_000_000
      familyYear(g)
      drain(g)
      p.age += 1
      left = !readJob(p)
    }
    expect(left).toBe(true)
    const past = readPast(p)
    expect(past).not.toBeNull()
    expect(['burnout', 'quit']).toContain(past!.how)
    expect(p.occupation).not.toMatch(/ at /)
  })

  it('a made-up job keeps the kid comfortable and spoils them, and the staff and the press notice', () => {
    const { g, a, b } = world(113)
    const p = kid(g, 26, { smarts: 40, entitlement: 20 })
    hireRelative(g, a, b, p, { rank: 3, kind: 'cushy' }, { quiet: true })
    let resent = 0
    let label = 0
    const morale0 = bizOf(g, a).morale
    for (let y = 0; y < 6; y++) {
      yearOn(g)
      bizOf(g, a).cash = 3_000_000
      familyYear(g)
      drain(g)
      p.age += 1
      resent = Math.max(resent, readFamily(bizOf(g, a).family).resent)
      label = Math.max(label, readFamily(bizOf(g, a).family).label)
    }
    expect(Number(p.data.entitlement)).toBeGreaterThan(20)
    expect(resent).toBeGreaterThan(10)
    expect(label).toBeGreaterThan(5)
    expect(bizOf(g, a).morale).toBeLessThanOrEqual(Math.max(morale0, 100))
    for (const v of [bizOf(g, a).morale, resent, label]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('jobs at a company that is gone end quietly', () => {
    const { g, a, b } = world(114)
    const p = kid(g, 25)
    hireRelative(g, a, b, p, { rank: 1 }, { quiet: true })
    g.assets = g.assets.filter((x) => x.id !== a.id)
    yearOn(g)
    familyYear(g)
    expect(readJob(p)).toBeNull()
    expect(readPast(p)?.how).toBe('closed')
    expect(p.occupation).toBe('Unemployed')
  })

  it('an estranged relative leaves the family company and cannot remain the successor', () => {
    const { g, a, b } = world(115)
    const p = kid(g, 30, { smarts: 80 })
    expect(hireRelative(g, a, b, p, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(designateSuccessor(g, a, bizOf(g, a), p, { quiet: true }).ok).toBe(true)
    updateWl(g, p, (w) => {
      w.estr = true
    })
    expect(successorOf(g, a, bizOf(g, a))).toBeNull()
    yearOn(g)
    familyYear(g)
    expect(readJob(p)).toBeNull()
    expect(p.occupation).toBe('Unemployed')
  })
})

describe('succession', () => {
  it('offers qualified relatives on the normal CEO shortlist and installs the selected relative', () => {
    const { g, a, b } = world(120)
    const p = kid(g, 34, { smarts: 88, traits: ['ambitious'] })
    expect(hireRelative(g, a, b, p, { rank: 2 }, { quiet: true }).ok).toBe(true)
    const row = all(g, businessView(g, a)).find((n) => n.id === `biz.stepDown.${a.id}`) as MenuAction | undefined
    expect(row).toBeDefined()
    row!.run(g)
    const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'business.manager')
    expect(modal).toBeDefined()
    const saved = JSON.parse(JSON.stringify(modal)) as ChoiceModal
    const choice = saved.choices.find((c) => c.label.includes(p.firstName) && c.label.includes(p.lastName))
    expect(choice).toBeDefined()
    runScript(g, 'business.manager', choice!.id, saved.data, saved)
    expect(bizOf(g, a).manager?.personId).toBe(p.id)
    expect(readJob(p)?.rank).toBe(5)
  })

  it('demotes each outgoing family CEO immediately when the normal shortlist replaces them', () => {
    const { g, a, b } = world(119)
    const first = kid(g, 36, { smarts: 82 })
    const second = kid(g, 34, { smarts: 88 })
    expect(hireRelative(g, a, b, first, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(hireRelative(g, a, b, second, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(makeCeo(g, a, b, first).ok).toBe(true)

    const replace = () => all(g, businessView(g, a)).find((node) => node.id === `biz.replaceManager.${a.id}`) as MenuAction | undefined
    const choose = (match: (label: string) => boolean) => {
      g.queue = []
      const row = replace()
      expect(row).toBeDefined()
      row!.run(g)
      const modal = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'business.manager')
      expect(modal).toBeDefined()
      const saved = JSON.parse(JSON.stringify(modal)) as ChoiceModal
      const choice = saved.choices.find((c) => c.id.startsWith('m') && match(c.label))
      expect(choice).toBeDefined()
      runScript(g, 'business.manager', choice!.id, saved.data, saved)
    }

    choose((label) => label.includes(second.firstName) && label.includes(second.lastName))
    expect(bizOf(g, a).manager?.personId).toBe(second.id)
    expect(readJob(first)).toMatchObject({ rank: 4, groom: false })
    expect(readJob(first)?.title).not.toBe('CEO')
    expect(first.occupation).not.toMatch(/^CEO(?:\s|$)/)
    expect(readJob(second)?.rank).toBe(5)

    choose((label) => !label.includes(first.firstName) && !label.includes(second.firstName))
    expect(bizOf(g, a).manager?.personId).toBeUndefined()
    expect(readJob(second)).toMatchObject({ rank: 4, groom: false })
    expect(readJob(second)?.title).not.toBe('CEO')
    expect(second.occupation).not.toMatch(/^CEO(?:\s|$)/)
    expect(employeesOf(g, a.id).filter((e) => e.job.rank === 5)).toHaveLength(0)
  })

  it('names a kid, and when the owner steps back the kid becomes CEO with their real skill (no random manager)', () => {
    const { g, a, b } = world(121)
    const p = kid(g, 30, { smarts: 85, traits: ['ambitious'] })
    hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    expect(designateSuccessor(g, a, bizOf(g, a), p, { quiet: true }).ok).toBe(true)
    expect(successorOf(g, a, bizOf(g, a))?.kind).toBe('person')
    expect(readJob(p)!.groom).toBe(true)
    // The owner retires from the CEO job: the next yearly sync installs the successor.
    g.character.job = null
    bizOf(g, a).ceo = 'owner'
    syncCeo(g)
    const cur = bizOf(g, a)
    expect(cur.ceo).toBe('manager')
    expect(cur.manager?.personId).toBe(p.id)
    expect(readJob(p)!.rank).toBe(5)
    expect(readFamily(cur.family).succ.kind).toBe('')
  })

  it('hands over on request, keeping the shares; a key employee can be the successor too', () => {
    const { g, a, b } = world(122)
    const p = kid(g, 33, { smarts: 80 })
    hireRelative(g, a, b, p, { rank: 3 }, { quiet: true })
    designateSuccessor(g, a, bizOf(g, a), p, { quiet: true })
    const share = bizOf(g, a).share
    expect(handOverToSuccessor(g, a, bizOf(g, a)).ok).toBe(true)
    expect(bizOf(g, a).manager?.personId).toBe(p.id)
    expect(bizOf(g, a).share).toBe(share)
    expect(g.character.job).toBeNull()
    // A key employee as successor.
    const w2 = world(123)
    w2.b.staff.push({ id: 'ks1', firstName: 'Una', lastName: 'Key', gender: 'female', age: 40, role: 'General Manager', focus: 'ops', skill: 82, salary: 90_000, trait: 'steady', morale: 70, years: 3 })
    expect(designateStaff(w2.g, w2.a, bizOf(w2.g, w2.a), 'ks1').ok).toBe(true)
    expect(handOverToSuccessor(w2.g, w2.a, bizOf(w2.g, w2.a)).ok).toBe(true)
    const cur = bizOf(w2.g, w2.a)
    expect(cur.manager?.firstName).toBe('Una')
    expect(cur.manager?.skill).toBe(82)
    expect(cur.staff.some((s) => s.id === 'ks1')).toBe(false)
  })

  it('an heir who was the CEO inherits the company and runs it as owner; a sibling heir keeps the kid CEO on', () => {
    for (const heirIsCeo of [true, false]) {
      const { g, a, b } = world(heirIsCeo ? 131 : 132, { age: 78 })
      const ceo = kid(g, 40, { smarts: 85 })
      const other = kid(g, 36, { smarts: 50 })
      hireRelative(g, a, b, ceo, { rank: 2 }, { quiet: true })
      expect(makeCeo(g, a, bizOf(g, a), ceo).ok).toBe(true)
      const heir = heirIsCeo ? ceo : other
      g.character.willBeneficiaries = [heir.id]
      killCharacter(g, 'Old Age')
      g.queue = []
      const n = continueAsChild(g, heir.id)
      expect(n.character.id).toBe(heir.id)
      expect(n.assets.some((x) => x.id === a.id)).toBe(true)
      n.queue = []
      syncCeo(n)
      const cur = bizOf(n, findBusiness(n, a.id)!)
      if (heirIsCeo) {
        expect(cur.ceo).toBe('owner')
        expect(cur.manager).toBeNull()
        expect(n.character.job?.defId).toBe('business_owner')
      } else {
        expect(cur.ceo).toBe('manager')
        expect(cur.manager?.personId).toBe(ceo.id)
        const sib = n.people.find((x) => x.id === ceo.id)!
        expect(sib.relation).toMatch(/[sS]ibling/)
        expect(readJob(sib)?.rank).toBe(5)
        // And the year runs cleanly.
        yearlyBusinessImpl(n)
        drain(n)
        familyYear(n)
        drain(n)
        expect(findBusiness(n, a.id)).toBeDefined()
      }
    }
  })

  it('a designated successor inherits the company intact when cash is split with another heir', () => {
    const { g, a, b } = world(130, { age: 78 })
    const successor = kid(g, 38, { smarts: 85 })
    const sibling = kid(g, 35, { smarts: 60 })
    expect(hireRelative(g, a, b, successor, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(designateSuccessor(g, a, bizOf(g, a), successor, { quiet: true }).ok).toBe(true)
    const succession = all(g, businessView(g, a)).find((n) => n.id === `nepo.${a.id}.succ.info`)
    expect(succession?.type).toBe('info')
    if (!succession || succession.type !== 'info') throw new Error('succession copy missing')
    const successionText = typeof succession.text === 'function' ? succession.text(g) : succession.text
    expect(successionText).toContain(`as designated successor, ${successor.firstName} would inherit the company intact`)
    expect(successionText).not.toMatch(/company would be sold/i)
    a.value = 10_000_000
    g.character.money = 1_000_000
    const ownMoney = successor.money
    killCharacter(g, 'Old Age')
    const cashAtDeath = g.character.money
    g.queue = []
    const n = continueAsChild(g, successor.id)
    expect(n.assets.some((x) => x.id === a.id)).toBe(true)
    expect(n.people.some((x) => x.id === sibling.id && /sibling/i.test(x.relation))).toBe(true)
    expect(n.character.money).toBeLessThanOrEqual(ownMoney + cashAtDeath)
    expect(n.queue.some((m) => m.kind === 'notice' && /designated successor/i.test(m.text))).toBe(true)
    const inherited = findBusiness(n, a.id)!
    expect(bizOf(n, inherited).ceo).toBe('owner')
    expect(bizOf(n, inherited).manager).toBeNull()
    expect(readFamily(bizOf(n, inherited).family).succ).toEqual({ kind: '', id: '' })
    expect(n.character.job?.defId).toBe('business_owner')
    expect(n.character.job?.data.assetId).toBe(a.id)
    syncCeo(n)
    expect(bizOf(n, inherited).ceo).toBe('owner')
    expect(bizOf(n, inherited).manager).toBeNull()
    drain(n)
    ageUp(n)
    drain(n)
    const afterYear = findBusiness(n, a.id)!
    expect(afterYear).toBeDefined()
    expect(bizOf(n, afterYear).ceo).toBe('owner')
    expect(bizOf(n, afterYear).manager).toBeNull()
    expect(n.character.job?.data.assetId).toBe(a.id)
    expect(JSON.parse(JSON.stringify(n))).toEqual(n)
  })

  it('gives a designated company only to its successor when a different sole will heir is selected', () => {
    const { g, a, b } = world(135, { age: 78 })
    const successor = kid(g, 39, { smarts: 88 })
    const willHeir = kid(g, 36, { smarts: 65 })
    expect(hireRelative(g, a, b, successor, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(designateSuccessor(g, a, bizOf(g, a), successor, { quiet: true }).ok).toBe(true)
    g.character.willBeneficiaries = [willHeir.id]

    const succession = all(g, businessView(g, a)).find((node) => node.id === `nepo.${a.id}.succ.info`)
    expect(succession?.type).toBe('info')
    if (!succession || succession.type !== 'info') throw new Error('succession copy missing')
    const text = typeof succession.text === 'function' ? succession.text(g) : succession.text
    expect(text).toContain(`${willHeir.firstName} would inherit the rest of the estate`)
    expect(text).toContain(`as designated successor, ${successor.firstName} would inherit the company intact`)

    a.value = 12_000_000
    g.character.money = 0
    const successorMoney = successor.money
    const companyEquity = Math.max(0, Math.round(a.value - (a.mortgage?.balance ?? 0)))
    killCharacter(g, 'Old Age')
    g.queue = []
    const asWillHeir = continueAsChild(g, willHeir.id)
    const asSuccessor = continueAsChild(g, successor.id)
    expect(findBusiness(asWillHeir, a.id)).toBeUndefined()
    expect(findBusiness(asSuccessor, a.id)).toBeDefined()
    const npcSuccessor = asWillHeir.people.find((p) => p.id === successor.id)
    expect(npcSuccessor?.occupation).toBe('Business Owner')
    expect(npcSuccessor?.data.nepo).toBeUndefined()
    expect(npcSuccessor?.money).toBe(successorMoney + companyEquity)
    expect(npcSuccessor?.notes.some((note) => /inherited .*designated successor/i.test(note))).toBe(true)
  })

  it.each(['no longer employed', 'disowned', 'estranged'] as const)('does not let a %s former successor inherit the company from a stale designation', (invalid) => {
    const { g, a, b } = world(134, { age: 78 })
    const former = kid(g, 38, { smarts: 85 })
    kid(g, 35, { smarts: 60 })
    expect(hireRelative(g, a, b, former, { rank: 2 }, { quiet: true }).ok).toBe(true)
    expect(designateSuccessor(g, a, bizOf(g, a), former, { quiet: true }).ok).toBe(true)
    if (invalid === 'no longer employed') delete former.data.nepo
    else if (invalid === 'disowned') former.data.disowned = true
    else {
      updateWl(g, former, (w) => {
        w.estr = true
      })
    }
    expect(readFamily(bizOf(g, a).family).succ).toEqual({ kind: 'person', id: former.id })
    expect(successorOf(g, a, bizOf(g, a))).toBeNull()
    killCharacter(g, 'Old Age')
    g.queue = []
    const n = continueAsChild(g, former.id)
    expect(findBusiness(n, a.id)).toBeUndefined()
    expect(n.queue.some((m) => m.kind === 'notice' && /designated successor/i.test(m.text))).toBe(false)
  })

  it('a CEO who dies while in the chair leaves an interim manager, not a ghost', () => {
    const { g, a, b } = world(133)
    const p = kid(g, 35, { smarts: 80 })
    hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    makeCeo(g, a, bizOf(g, a), p)
    p.alive = false
    yearOn(g)
    familyYear(g)
    drain(g)
    const cur = bizOf(g, a)
    expect(cur.manager?.personId).toBeUndefined()
    expect(cur.ceo).toBe('manager')
    expect(readJob(p)).toBeNull()
  })
})

describe('no free money, no loops', () => {
  it('hiring and firing the same kid over and over only costs money', () => {
    const { g, a, b } = world(141)
    const p = kid(g, 25, { smarts: 70 })
    const start = bizOf(g, a).cash + g.character.money + p.money
    for (let i = 0; i < 6; i++) {
      p.relationship = 70
      delete p.data.nepoGrudge
      delete p.data.nepoPast
      hireRelative(g, a, bizOf(g, a), p, { rank: 1 }, { quiet: true })
      yearOn(g)
      familyYear(g)
      drain(g)
      p.age += 0
      const j = readJob(p)
      if (j) {
        fire(g, a, bizOf(g, a), p)
        drain(g)
      }
    }
    void b
    expect(bizOf(g, a).cash + g.character.money + p.money).toBeLessThan(start)
  })
})

describe('forty years of dynasty', () => {
  it('plays forty years across heirs without a crash, a NaN or a negative cash hole', () => {
    let hires = 0
    for (const seed of [201, 202]) {
      let w = world(seed, { age: 45, money: 6_000_000 })
      let g = w.g
      for (let i = 0; i < 3; i++) kid(g, 6 + i * 5, { smarts: 40 + i * 20, traits: i === 0 ? ['ambitious'] : ['calm'] })
      const picks = [0, 1, 0, 2, 1]
      let n = 0
      for (let year = 0; year < 40; year++) {
        if (!g.character.alive) {
          const heir = g.people.filter((p) => p.alive && p.relation === 'child' && p.age >= 18).sort((x, y) => y.age - x.age)[0]
          if (!heir) break
          g = continueAsChild(g, heir.id)
          drain(g)
        }
        ageUp(g)
        drain(g, (m) => m.choices[picks[n++ % picks.length] % m.choices.length].id)
        for (const a of g.assets.filter((x) => x.kind === 'business')) {
          const b = bizOf(g, a)
          expect(Number.isFinite(b.cash)).toBe(true)
          expect(b.morale).toBeGreaterThanOrEqual(0)
          expect(b.morale).toBeLessThanOrEqual(100)
          const f = readFamily(b.family)
          expect(f.resent).toBeGreaterThanOrEqual(0)
          expect(f.label).toBeLessThanOrEqual(100)
        }
        for (const p of g.people) {
          const j = readJob(p)
          if (j) {
            expect(Number.isFinite(j.pay)).toBe(true)
            expect(j.skill).toBeGreaterThanOrEqual(0)
            expect(j.skill).toBeLessThanOrEqual(100)
            expect(j.pay).toBeLessThan(1e9)
          }
        }
        expect(g.yearActions['nepo.pop'] ?? 0).toBeLessThanOrEqual(2)
      }
      hires += g.counters.familyHires ?? 0
      void employeesOf
      void becomeCeo
      void ceoPayNorm
    }
    expect(hires).toBeGreaterThanOrEqual(0)
  }, 120_000)
})

describe('old saves and the press by era', () => {
  it('companies and people from before this feature load, play and survive a JSON round trip', () => {
    const { g, a } = world(301)
    const b = bizOf(g, a)
    delete (b as unknown as Record<string, unknown>).family
    const back = JSON.parse(JSON.stringify(g)) as typeof g
    back.year += 1
    familyYear(back)
    drain(back)
    expect(readFamily(undefined).resent).toBe(0)
    expect(readFamily({ succ: 5, resent: 'x', label: -4 } as never).label).toBe(0)
    const p = kid(back, 25)
    p.data.nepo = { assetId: 5 } as never
    expect(readJob(p)).toBeNull()
    p.data.nepo = { assetId: a.id, rank: 'high', pay: -5, skill: 900 } as never
    const j = readJob(p)!
    expect(j.rank).toBe(0)
    expect(j.pay).toBe(0)
    expect(j.skill).toBe(100)
    familyYear(back)
    expect(Number.isFinite(readJob(p)?.pay ?? 0)).toBe(true)
  })

  it('the press speaks the language of its year: no posts or nepo babies in 1960', () => {
    const { g, a, b } = world(302, { year: 1960 })
    const p = kid(g, 28, { smarts: 10, traits: ['lazy'] })
    hireRelative(g, a, b, p, { rank: 3, kind: 'cushy' }, { quiet: true })
    const seen: string[] = []
    for (let y = 0; y < 40; y++) {
      yearOn(g)
      bizOf(g, a).cash = 3_000_000
      readFamily(bizOf(g, a).family)
      const f = bizOf(g, a).family as { label?: number; pressYear?: number } | undefined
      if (f) {
        f.label = 90
        f.pressYear = 0
      }
      familyYear(g)
      for (const m of g.queue) if (m.kind === 'notice') seen.push(m.title + ' ' + m.text)
      drain(g)
      if (!readJob(p)) hireRelative(g, a, bizOf(g, a), p, { rank: 3, kind: 'cushy' }, { quiet: true })
    }
    const text = seen.join(' ')
    expect(text).toMatch(/papers|newspaper/i)
    expect(text).not.toMatch(/viral|post about|nepo baby|trending|comments/i)
  })
})
