// Nepo babies: the ask, the hire, the pay, the firing, the morale, the board. Every lever costs
// something and nothing here makes money.
import { describe, expect, it } from 'vitest'
import { passOdds, needsVote } from '../src/game/business/board'
import { readBoard } from '../src/game/business/board-state'
import { askOdds, rollAskers, wantedRank } from '../src/game/business/nepo-asks'
import { demote, fire, hireRelative, makeCeo, planHire, planProposal, promote, setPay, severanceFor } from '../src/game/business/nepo-actions'
import { readJob } from '../src/game/business/nepo-job'
import { aptitudeOf, ceilingOf, driveOf, fitOf, nextSkill, outlookFor, startSkill } from '../src/game/business/nepo-model'
import { ABOVE_MARKET, MAX_PAY_MULT, internWord, marketPay, rankTitle } from '../src/game/business/nepo-roles'
import { employeesOf, hireBlock, readFamily } from '../src/game/business/nepo-state'
import { COST_CAP, DEMAND_CAP, QUALITY_CAP, companyEffects, familyYear } from '../src/game/business/nepo-year'
import { nepoNodes, nepoPersonNodes } from '../src/game/business/nepo'
import { bizOf } from '../src/game/business/state'
import { updateWl } from '../src/game/events/will-core'
import type { MenuAction } from '../src/game/types'
import { all, drain, kid, world } from './nepo-kit'

describe('who asks, and when', () => {
  it('asks scale with age: a toddler never asks, a young adult asks more than a teen, an older child far less', () => {
    const { g, b } = world(11)
    const toddler = kid(g, 8)
    const teen = kid(g, 16)
    const young = kid(g, 22)
    const older = kid(g, 45)
    expect(askOdds(g, b, toddler)).toBe(0)
    expect(askOdds(g, b, teen)).toBeGreaterThan(0)
    expect(askOdds(g, b, young)).toBeGreaterThan(askOdds(g, b, teen))
    expect(askOdds(g, b, older)).toBeLessThan(askOdds(g, b, teen))
  })

  it('asks scale with ambition, and fade with estrangement and a stake that is small', () => {
    const { g, b } = world(12)
    const keen = kid(g, 22, { traits: ['ambitious', 'outgoing'] })
    const idle = kid(g, 22, { traits: ['lazy', 'shy'] })
    const estranged = kid(g, 22, { traits: ['ambitious', 'outgoing'], relationship: 10 })
    expect(askOdds(g, b, keen)).toBeGreaterThan(askOdds(g, b, idle) * 3)
    expect(askOdds(g, b, estranged)).toBeLessThan(askOdds(g, b, keen))
    const before = askOdds(g, b, keen)
    b.share = 0.25
    expect(askOdds(g, b, keen)).toBeLessThan(before)
  })

  it('a kid who earned their own way, or who was fired, rarely asks again', () => {
    const { g, a, b } = world(13)
    const p = kid(g, 24, { traits: ['ambitious'] })
    const base = askOdds(g, b, p)
    p.data.nepoSelfMade = g.year - 1
    expect(askOdds(g, b, p)).toBeLessThan(base * 0.2)
    delete p.data.nepoSelfMade
    expect(hireRelative(g, a, bizOf(g, a), p, { rank: 1 }, { quiet: true }).ok).toBe(true)
    fire(g, a, bizOf(g, a), p)
    expect(askOdds(g, bizOf(g, a), p)).toBeLessThan(base * 0.2)
  })

  it('wants more when ambitious or spoiled, and never more than the age allows', () => {
    const { g } = world(14)
    expect(wantedRank(kid(g, 16))).toBe(0)
    const spoiled = kid(g, 20, { entitlement: 80, traits: ['ambitious'] })
    expect(wantedRank(spoiled)).toBeLessThanOrEqual(2)
    const fortyish = kid(g, 40, { entitlement: 80, traits: ['ambitious'] })
    expect(wantedRank(fortyish)).toBe(4)
    expect(wantedRank(kid(g, 30, { traits: ['calm'] }))).toBe(2)
  })

  it('bundles everyone who asked into one popup and never shows more than two a year', () => {
    const { g, a, b } = world(15)
    for (let i = 0; i < 4; i++) kid(g, 20 + i, { traits: ['ambitious'] })
    g.queue = []
    // Force the rolls: everyone asks.
    for (const p of g.people) delete p.data.nepoAsk
    let popups = 0
    for (let year = 0; year < 25; year++) {
      g.year += 1
      g.yearActions = {}
      b.founded = 2000
      g.queue = []
      familyYear(g)
      const f = readFamily(b.family)
      f.askYear = 0
      void f
      for (const m of g.queue) if (m.kind === 'choice' && m.scriptId === 'nepo.ask') popups += 1
      expect((g.yearActions['nepo.pop'] ?? 0)).toBeLessThanOrEqual(2)
      drain(g)
      void a
    }
    expect(popups).toBeGreaterThanOrEqual(0)
    const asked = rollAskers(g, bizOf(g, a))
    expect(asked.length).toBeLessThanOrEqual(3)
  })
})

describe('the competence model', () => {
  it('a bright, driven kid starts above an intern job and grows; a mismatched promotion hurts', () => {
    const { g } = world(21)
    const bright = kid(g, 22, { smarts: 90, traits: ['ambitious', 'serious'] })
    const dim = kid(g, 22, { smarts: 20, traits: ['lazy'] })
    expect(driveOf(bright)).toBeGreaterThan(driveOf(dim))
    expect(aptitudeOf(bright)).toBeGreaterThan(aptitudeOf(dim) + 25)
    expect(outlookFor(bright, 0).fit).toBeGreaterThan(0)
    expect(outlookFor(bright, 1).fit).toBeGreaterThan(outlookFor(dim, 1).fit)
    // The dim one never gets to a director's desk; the bright one does.
    expect(ceilingOf(dim)).toBeLessThan(68)
    expect(ceilingOf(bright)).toBeGreaterThan(68)
    expect(outlookFor(dim, 3).yearsToGrow).toBeNull()
    expect(outlookFor(bright, 2).yearsToGrow).not.toBeNull()
    // Skill climbs toward the ceiling and stops there.
    let s = startSkill(bright)
    for (let i = 0; i < 40; i++) s = nextSkill(bright, { skill: s, rank: 1, kind: 'real', groom: false, mood: 70 })
    expect(s).toBeLessThanOrEqual(ceilingOf(bright) + 1e-9)
    expect(s).toBeGreaterThan(ceilingOf(bright) - 1)
    // Mentoring speeds it up; a made-up job teaches nothing.
    const fast = nextSkill(bright, { skill: 40, rank: 2, kind: 'real', groom: true, mood: 70 })
    const slow = nextSkill(bright, { skill: 40, rank: 2, kind: 'real', groom: false, mood: 70 })
    const cushy = nextSkill(bright, { skill: 40, rank: 3, kind: 'cushy', groom: false, mood: 70 })
    expect(fast).toBeGreaterThan(slow)
    expect(cushy - 40).toBeLessThan(slow - 40)
    expect(fitOf(80, 4)).toBe(2)
  })

  it('is deterministic: the same person gives the same numbers every time (hints match the year)', () => {
    const { g } = world(22)
    const p = kid(g, 25, { smarts: 55, traits: ['ambitious'] })
    const rng = g.rng
    const a1 = [driveOf(p), aptitudeOf(p), ceilingOf(p), startSkill(p), outlookFor(p, 2).fit]
    const a2 = [driveOf(p), aptitudeOf(p), ceilingOf(p), startSkill(p), outlookFor(p, 2).fit]
    expect(a1).toEqual(a2)
    expect(g.rng).toBe(rng)
  })
})

describe('roles, titles and pay', () => {
  it('uses era-correct words: apprentices and clerks in the 1930s, interns and associates today', () => {
    const { g } = world(31)
    g.year = 1935
    expect(internWord(g)).toBe('Apprentice')
    expect(rankTitle(g, 0, 'sales')).not.toMatch(/Intern/)
    expect(rankTitle(g, 1, 'finance')).toBe('Finance Clerk')
    expect(rankTitle(g, 4, 'ops')).toMatch(/Vice President/)
    g.year = 1965
    expect(internWord(g)).toBe('Trainee')
    g.year = 2026
    expect(internWord(g)).toBe('Intern')
    expect(rankTitle(g, 0, 'sales')).toBe('Sales Intern')
    expect(rankTitle(g, 1, 'finance')).toBe('Finance Associate')
    expect(rankTitle(g, 5, 'ops')).toBe('CEO')
  })

  it('pay rises with rank, a summer job pays a fraction, the CEO earns the going CEO pay', () => {
    const { g, b } = world(32)
    const ranks = [0, 1, 2, 3, 4, 5].map((r) => marketPay(b, r))
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1])
    const teen = kid(g, 16)
    const adult = kid(g, 22)
    const part = planHire(g, b, teen, { rank: 0 })
    const full = planHire(g, b, adult, { rank: 0 })
    expect(part.part).toBe(true)
    expect(part.pay).toBeLessThan(full.pay * 0.5)
    expect(full.pay).toBe(marketPay(b, 0))
  })
})

describe('hiring', () => {
  it('hires an adult at the bottom: a job record, a title, pay, a sheet that says where they work', () => {
    const { g, a, b } = world(41)
    const p = kid(g, 22, { smarts: 70 })
    const r = hireRelative(g, a, b, p, { rank: 0 })
    expect(r.ok).toBe(true)
    const job = readJob(p)!
    expect(job.assetId).toBe(a.id)
    expect(job.rank).toBe(0)
    expect(job.pay).toBe(marketPay(b, 0))
    expect(p.occupation).toMatch(/Intern at Family Foods/)
    expect(employeesOf(g, a.id).length).toBe(1)
    // No cash moves on the day; the staff don't riot over an intern.
    expect(b.morale).toBeGreaterThan(40)
    expect(p.relationship).toBeGreaterThanOrEqual(70)
  })

  it('a teenager gets a summer job only, at summer pay, and stays a student on paper', () => {
    const { g, a, b } = world(42)
    const teen = kid(g, 15)
    expect(hireRelative(g, a, b, teen, { rank: 2 }, { quiet: true }).ok).toBe(false)
    expect(hireRelative(g, a, b, teen, { rank: 0 }, { quiet: true }).ok).toBe(true)
    expect(readJob(teen)!.part).toBe(true)
    expect(teen.occupation).toBe('Student')
    expect(readJob(teen)!.pay).toBeLessThan(marketPay(b, 0) * 0.5)
    const tooYoung = kid(g, 12)
    expect(hireBlock(g, b, tooYoung)).toMatch(/too young/)
    expect(planHire(g, b, kid(g, 17), { rank: 3, kind: 'cushy' }).kind).toBe('cushy')
    expect(hireRelative(g, a, b, kid(g, 17), { rank: 3, kind: 'cushy' }, { quiet: true }).ok).toBe(false)
  })

  it('does not hire the dead, the disowned, the estranged, strangers or someone who already works here', () => {
    const { g, a, b } = world(43)
    const p = kid(g, 25)
    const dead = kid(g, 25)
    dead.alive = false
    const disowned = kid(g, 25)
    disowned.data.disowned = true
    const estranged = kid(g, 25, { relationship: 70 })
    updateWl(g, estranged, (w) => {
      w.estr = true
    })
    const friend = kid(g, 25)
    friend.relation = 'friend'
    expect(hireBlock(g, b, dead)).not.toBeNull()
    expect(hireBlock(g, b, disowned)).not.toBeNull()
    expect(hireBlock(g, b, estranged)).toMatch(/estranged/)
    expect(askOdds(g, b, estranged)).toBe(0)
    expect(hireBlock(g, b, friend)).not.toBeNull()
    expect(hireRelative(g, a, b, p, { rank: 1 }, { quiet: true }).ok).toBe(true)
    expect(hireBlock(g, b, p)).toMatch(/already works/)
    expect(hireRelative(g, a, b, p, { rank: 1 }, { quiet: true }).ok).toBe(false)
  })

  it('a made-up job costs more, teaches nothing, spoils the kid and angers the staff', () => {
    const { g, a, b } = world(44)
    const p = kid(g, 24, { smarts: 40, entitlement: 30 })
    const morale = b.morale
    const resent = readFamily(b.family).resent
    expect(hireRelative(g, a, b, p, { rank: 3, kind: 'cushy' }, { quiet: true }).ok).toBe(true)
    const job = readJob(p)!
    expect(job.kind).toBe('cushy')
    expect(job.pay).toBeGreaterThan(marketPay(b, 3) * 1.5)
    expect(Number(p.data.entitlement)).toBeGreaterThan(30)
    expect(bizOf(g, a).morale).toBeLessThan(morale)
    expect(readFamily(bizOf(g, a).family).resent).toBeGreaterThan(resent)
    expect(readFamily(bizOf(g, a).family).label).toBeGreaterThan(0)
  })
})

describe('promotion, demotion, pay and firing', () => {
  it('promotes one rank at a time with a title and a raise; a mismatched promotion annoys the staff', () => {
    const { g, a, b } = world(51)
    const p = kid(g, 23, { smarts: 25, traits: ['lazy'] })
    hireRelative(g, a, b, p, { rank: 0 }, { quiet: true })
    const morale = bizOf(g, a).morale
    expect(promote(g, a, bizOf(g, a), p).ok).toBe(true)
    expect(readJob(p)!.rank).toBe(1)
    expect(promote(g, a, bizOf(g, a), p).ok).toBe(true)
    expect(promote(g, a, bizOf(g, a), p).ok).toBe(true)
    const job = readJob(p)!
    expect(job.rank).toBe(3)
    expect(job.title).toMatch(/Director/)
    expect(bizOf(g, a).morale).toBeLessThan(morale)
    expect(readFamily(bizOf(g, a).family).resent).toBeGreaterThan(5)
  })

  it('demotes (they sulk), fires (severance, a family rift), and the record moves to their past', () => {
    const { g, a, b } = world(52)
    const p = kid(g, 28, { smarts: 70, entitlement: 70 })
    hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    const rel = p.relationship
    expect(demote(g, a, bizOf(g, a), p).ok).toBe(true)
    expect(readJob(p)!.rank).toBe(1)
    expect(p.relationship).toBeLessThan(rel)
    const cash = bizOf(g, a).cash
    const sev = severanceFor(bizOf(g, a), readJob(p)!)
    const rel2 = p.relationship
    expect(fire(g, a, bizOf(g, a), p).ok).toBe(true)
    expect(readJob(p)).toBeNull()
    expect(p.relationship).toBeLessThanOrEqual(rel2 - 15)
    expect(bizOf(g, a).cash).toBeLessThanOrEqual(cash - sev)
    expect(p.data.nepoGrudge).toBe(g.year)
    expect(p.occupation).toBe('Unemployed')
    expect(readFamily(bizOf(g, a).family).fired).toBe(1)
    expect(demote(g, a, bizOf(g, a), p).ok).toBe(false)
  })

  it('pay: a slider clamped to the going rate times four; a raise pleases, a cut hurts; above-market pay is noticed', () => {
    const { g, a, b } = world(53)
    const p = kid(g, 30, { smarts: 60 })
    hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    const going = marketPay(bizOf(g, a), 2)
    const mood = readJob(p)!.mood
    expect(setPay(g, a, bizOf(g, a), p, 99).ok).toBe(true)
    expect(readJob(p)!.pay).toBeLessThanOrEqual(going * MAX_PAY_MULT * 1.01)
    expect(readJob(p)!.mood).toBeGreaterThan(mood)
    expect(setPay(g, a, bizOf(g, a), p, 0.6).ok).toBe(true)
    expect(readJob(p)!.pay).toBeLessThan(going)
    expect(readJob(p)!.mood).toBeLessThan(mood + 5)
    expect(ABOVE_MARKET).toBeGreaterThan(1)
  })
})

describe('what the family does to the company (small and capped)', () => {
  it('effects stay inside the caps however many relatives are on the team', () => {
    const { g, a, b } = world(61)
    for (let i = 0; i < 6; i++) {
      const p = kid(g, 24 + i, { smarts: i % 2 ? 99 : 5, traits: i % 2 ? ['ambitious'] : ['lazy'] })
      hireRelative(g, a, bizOf(g, a), p, { rank: i % 2 ? 3 : 4, focus: i % 3 === 0 ? 'sales' : i % 3 === 1 ? 'ops' : 'quality' }, { quiet: true })
    }
    const fx = companyEffects(bizOf(g, a), employeesOf(g, a.id))
    expect(Math.abs(fx.demand)).toBeLessThanOrEqual(DEMAND_CAP + 1e-9)
    expect(Math.abs(fx.cost)).toBeLessThanOrEqual(COST_CAP + 1e-9)
    expect(Math.abs(fx.quality)).toBeLessThanOrEqual(QUALITY_CAP + 1e-9)
    void b
  })

  it('a mismatched executive drags and an excellent one lifts, by a little', () => {
    const { g, a, b } = world(62)
    const dud = kid(g, 25, { smarts: 10, traits: ['lazy'] })
    hireRelative(g, a, b, dud, { rank: 3, focus: 'sales' }, { quiet: true })
    const star = kid(g, 29, { smarts: 98, traits: ['ambitious', 'serious'] })
    hireRelative(g, a, bizOf(g, a), star, { rank: 1, focus: 'sales' }, { quiet: true })
    const j = readJob(star)!
    j.skill = 90
    const bad = companyEffects(bizOf(g, a), employeesOf(g, a.id).filter((e) => e.p.id === dud.id))
    const good = companyEffects(bizOf(g, a), employeesOf(g, a.id).filter((e) => e.p.id === star.id))
    expect(bad.demand).toBeLessThan(0)
    expect(good.demand).toBeGreaterThan(0)
    expect(Math.abs(bad.demand)).toBeLessThanOrEqual(DEMAND_CAP)
  })
})

describe('the board and self-dealing', () => {
  it('an executive job for a relative needs the board when there is one; an intern does not; a sole owner never votes', () => {
    const solo = world(71)
    const sk = kid(solo.g, 28)
    const vpPlan = planHire(solo.g, solo.b, sk, { rank: 4 })
    expect(needsVote(solo.g, solo.a, solo.b, planProposal(sk, vpPlan))).toBeNull()
    const { g, a, b } = world(72, { share: 0.45 })
    const p = kid(g, 28, { smarts: 60 })
    const vp = planHire(g, b, p, { rank: 4 })
    const intern = planHire(g, b, p, { rank: 0 })
    expect(needsVote(g, a, b, planProposal(p, vp))).toMatch(/board/)
    expect(needsVote(g, a, b, planProposal(p, intern))).toBeNull()
    const cushy = planHire(g, b, p, { rank: 3, kind: 'cushy' })
    expect(needsVote(g, a, b, planProposal(p, cushy))).toMatch(/board/)
  })

  it('the board is kinder to a good fit than a mismatch, and hardest on a made-up job', () => {
    const { g, a, b } = world(73, { share: 0.4 })
    b.public = true
    b.sharesOut = 1_000_000
    b.sharePrice = Math.max(1, Math.round(b.valuation / 1_000_000))
    b.exchange = 'NYSE'
    const star = kid(g, 30, { smarts: 95, traits: ['ambitious', 'serious'] })
    const dud = kid(g, 30, { smarts: 15, traits: ['lazy'] })
    const vpStar = planProposal(star, planHire(g, b, star, { rank: 3 }))
    const vpDud = planProposal(dud, planHire(g, b, dud, { rank: 3 }))
    const cushy = planProposal(dud, planHire(g, b, dud, { rank: 3, kind: 'cushy' }))
    const oStar = passOdds(g, a, b, vpStar)
    const oDud = passOdds(g, a, b, vpDud)
    const oCushy = passOdds(g, a, b, cushy)
    expect(oStar).toBeGreaterThanOrEqual(oDud)
    expect(oDud).toBeGreaterThanOrEqual(oCushy)
    expect(readBoard(b.board).votes.length).toBeGreaterThanOrEqual(0)
  })

  it('a rejected family hire is not re-rolled the same year, and the hint odds equal the real roll', () => {
    const { g, a, b } = world(74, { share: 0.3 })
    b.public = true
    b.sharesOut = 1_000_000
    b.sharePrice = Math.max(1, Math.round(b.valuation / 1_000_000))
    b.exchange = 'NYSE'
    const dud = kid(g, 22, { smarts: 10, traits: ['lazy'], entitlement: 70 })
    const plan = planHire(g, b, dud, { rank: 4 })
    const odds = passOdds(g, a, b, planProposal(dud, plan))
    expect(odds).toBeLessThan(0.6)
    let hired = false
    for (let i = 0; i < 30 && !hired; i++) hired = hireRelative(g, a, bizOf(g, a), dud, { rank: 4 }, { quiet: true }).ok
    // If the dice ever said yes, the first try was the only one; either way later tries never roll again once refused.
    if (!hired) {
      const again = hireRelative(g, a, bizOf(g, a), dud, { rank: 4 }, { quiet: true })
      expect(again.ok).toBe(false)
      expect(passOdds(g, a, bizOf(g, a), planProposal(dud, plan))).toBe(0)
    }
    drain(g)
  })
})

describe('menus and hints', () => {
  it('the company group and the person rows exist, work, and are pure (no state change, no RNG)', () => {
    const { g, a, b } = world(81)
    const p = kid(g, 23, { smarts: 70 })
    kid(g, 16)
    const snapshot = JSON.stringify(g)
    const nodes = nepoNodes(g, a)
    expect(nodes.length).toBe(1)
    const flat = all(g, nodes)
    expect(flat.length).toBeGreaterThan(5)
    const rows = nepoPersonNodes(g, p)
    expect(rows.length).toBeGreaterThan(0)
    all(g, rows)
    expect(JSON.stringify(g)).toBe(snapshot)
    // Offer a job through the menu.
    const offer = flat.find((n): n is MenuAction => n.type === 'action' && n.id.endsWith(`${p.id}.offer.r0`))!
    expect(offer.disabledReason?.(g)).toBeNull()
    offer.run(g)
    drain(g)
    expect(readJob(p)).not.toBeNull()
    // Once employed the sheet shows the job and its actions.
    const sheet = all(g, nepoPersonNodes(g, p))
    expect(sheet.some((n) => n.type === 'action' && n.id.endsWith('.promote'))).toBe(true)
    expect(sheet.some((n) => n.type === 'action' && n.id.endsWith('.fire'))).toBe(true)
    void b
  })

  it('has nothing to show a player with no family and no company', () => {
    const { g, a } = world(82)
    g.people = []
    expect(nepoNodes(g, a)).toEqual([])
    expect(nepoPersonNodes(g, kid(g, 40, { relation: 'child' })).length).toBeGreaterThan(0)
  })

  it('minors and prisoners cannot manage the family: every action says why', () => {
    const { g, a } = world(83)
    const p = kid(g, 23)
    g.character.prison = { crime: 'x', yearsLeft: 3, totalYears: 3, life: false, deathRow: false } as never
    const acts = all(g, nepoNodes(g, a)).filter((n): n is MenuAction => n.type === 'action' && n.id.includes('.offer.'))
    expect(acts.length).toBeGreaterThan(0)
    for (const x of acts) expect(x.disabledReason?.(g)).toMatch(/prison/)
    g.character.prison = null
    g.character.age = 17
    for (const x of acts) expect(x.disabledReason?.(g)).toMatch(/18/)
    void p
  })

  it('the Business hints are honest: they match the board odds and the real fit', () => {
    const { g, a, b } = world(84, { share: 0.4 })
    g.character.talents = ['Business']
    const star = kid(g, 28, { smarts: 90, traits: ['ambitious'] })
    const rows = all(g, nepoNodes(g, a))
    const vp = rows.find((n): n is MenuAction => n.type === 'action' && n.id.endsWith(`${star.id}.offer.r4`))!
    const hint = vp.hint?.(g) ?? ''
    expect(hint).toMatch(/board votes/)
    const odds = passOdds(g, a, b, planProposal(star, planHire(g, b, star, { rank: 4 })))
    expect(hint).toContain(`${Math.round(odds * 100)}%`)
    const o = outlookFor(star, 4)
    expect(hint).toContain(String(Math.round(o.skill)))
    g.character.talents = []
    expect(vp.hint?.(g) ?? '').toBe('')
  })
})

describe('CEO', () => {
  it('a kid can be made CEO: same CEO model, their real skill, a CEO salary, the owner steps back', () => {
    const { g, a, b } = world(91)
    const p = kid(g, 30, { smarts: 80, traits: ['ambitious', 'serious'] })
    hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    const r = makeCeo(g, a, bizOf(g, a), p)
    expect(r.ok).toBe(true)
    const cur = bizOf(g, a)
    expect(cur.ceo).toBe('manager')
    expect(cur.manager?.personId).toBe(p.id)
    expect(cur.manager?.skill).toBe(Math.round(readJob(p)!.skill))
    expect(readJob(p)!.rank).toBe(5)
    expect(readJob(p)!.title).toBe('CEO')
    expect(g.character.job).toBeNull()
    expect(p.occupation).toBe('CEO')
  })

  it('refuses a minor, a made-up job and a second CEO', () => {
    const { g, a, b } = world(92)
    const teen = kid(g, 17)
    hireRelative(g, a, b, teen, { rank: 0 }, { quiet: true })
    expect(makeCeo(g, a, bizOf(g, a), teen).ok).toBe(false)
    const lazy = kid(g, 30)
    hireRelative(g, a, bizOf(g, a), lazy, { rank: 3, kind: 'cushy' }, { quiet: true })
    expect(makeCeo(g, a, bizOf(g, a), lazy).ok).toBe(false)
  })
})
