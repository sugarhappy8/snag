// Share classes, task 3: changing the classes from Capital & Ownership. A private company keeps a plan for its
// IPO for free; a listed one asks the board, once a year, and its price moves by the difference.
import { describe, expect, it } from 'vitest'
import { boardOf, ownerSeats, seatPlan } from '../src/game/business/board-state'
import { needsVote, passOdds, refusedThisYear, type Proposal } from '../src/game/business/board-vote'
import { ipoRetain } from '../src/game/business/exit'
import { classBlock, classesKey, classOption, CLASS_CHOICES, changeClasses, currentChoice, recapProposal, type ClassChoice } from '../src/game/business/share-classes-menu'
import { ownerVotes, votesAfterIpo } from '../src/game/business/share-classes'
import { bizOf, readBiz } from '../src/game/business/state'
import { yearActionsUsed } from '../src/game/core'
import type { GameState } from '../src/game/types'
import { deepFreeze } from './fuzz-kit'
import { founder, listed, listedGroup, privateCompany } from './own-listing-kit'

function noticesTitled(g: GameState, title: string): string[] {
  const out: string[] = []
  for (const m of g.queue) if (m.kind === 'notice' && m.title === title) out.push(m.text)
  return out
}

describe('changing the classes', () => {
  it('a private company keeps a plan, free', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    const json = JSON.stringify(g.rng)
    expect(changeClasses(g, a.id, 'ab')).toBe(true)
    expect(b.classes).toEqual({ kind: 'ab', hi: 1 })
    expect(yearActionsUsed(g, classesKey(a.id))).toBe(0)
    expect(JSON.stringify(g.rng)).toBe(json)
    expect(changeClasses(g, a.id, 'nv')).toBe(true)
    expect(b.classes).toEqual({ kind: 'nv', hi: 1 })
    expect(changeClasses(g, a.id, 'single')).toBe(true)
    expect('classes' in b).toBe(false)
    expect(yearActionsUsed(g, classesKey(a.id))).toBe(0)

    expect(changeClasses(g, a.id, 'single')).toBe(false)
    expect(noticesTitled(g, 'Share Classes')).toContain('It already has this structure.')
    expect(changeClasses(g, a.id, 'ab')).toBe(true)
    expect(changeClasses(g, a.id, 'ab')).toBe(false)
  })

  it('a private change tells the votes and the price cost', () => {
    const g = founder()
    const { a } = privateCompany(g)
    changeClasses(g, a.id, 'ab')
    const text = noticesTitled(g, 'Share Classes')[0]
    expect(text).toContain(`${a.name} will list with founder shares.`)
    expect(text).toContain('of the votes after a 25% float.')
    expect(text).toContain('The market pays 4% less.')
    changeClasses(g, a.id, 'nv')
    expect(noticesTitled(g, 'Share Classes')[1]).toContain('The market pays 7% less.')
    changeClasses(g, a.id, 'single')
    expect(noticesTitled(g, 'Share Classes')[2]).not.toContain('The market pays')
  })

  it('a listed company: vote, year key, price, seats', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = founder(seed)
      const { a, b } = listed(g, { share: 0.9 })
      const price = b.sharePrice
      expect(passOdds(g, a, b, recapProposal(a, 'ab')), `seed ${seed}`).toBeGreaterThan(0.99)
      expect(changeClasses(g, a.id, 'ab'), `seed ${seed}`).toBe(true)
      expect(b.classes).toEqual({ kind: 'ab', hi: b.share })
      expect(Math.abs(b.sharePrice - price * 0.96)).toBeLessThan(0.011)
      expect(b.valuation).toBe(Math.round(b.sharePrice * b.sharesOut))
      expect(yearActionsUsed(g, classesKey(a.id))).toBe(1)
      const plan = seatPlan(g, b)
      expect(ownerSeats(boardOf(b))).toBe(plan.owner + plan.group)
      expect(noticesTitled(g, 'Share Classes').at(-1)).toContain(`${a.name} now has founder shares. You hold`)
      expect(a.value).toBe(Math.round(b.valuation * b.share))
    }
  })

  it('once a year', () => {
    const g = founder(3)
    const { a } = listed(g, { share: 0.9 })
    expect(changeClasses(g, a.id, 'ab')).toBe(true)
    expect(changeClasses(g, a.id, 'nv')).toBe(false)
    expect(noticesTitled(g, 'Share Classes')).toContain('Classes change once a year.')
    g.yearActions = {}
    expect(changeClasses(g, a.id, 'nv')).toBe(true)
    expect(readBiz(g, a).classes).toEqual({ kind: 'nv', hi: readBiz(g, a).share })
  })

  it('back to one class restores the price', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = founder(seed)
      const { a, b } = listed(g, { share: 0.9 })
      const price = b.sharePrice
      expect(changeClasses(g, a.id, 'ab'), `seed ${seed}`).toBe(true)
      g.yearActions = {}
      expect(changeClasses(g, a.id, 'single'), `seed ${seed}`).toBe(true)
      expect('classes' in b).toBe(false)
      expect(Math.abs(b.sharePrice - price)).toBeLessThan(0.021)
    }
  })

  it('a board that says no changes nothing', () => {
    let yes = 0
    let no = 0
    for (let seed = 1; seed <= 30; seed++) {
      const g = founder(seed)
      const { a, b } = listed(g, { share: 0.45 })
      const odds = passOdds(g, a, b, recapProposal(a, 'ab'))
      expect(odds, `seed ${seed}`).toBeGreaterThan(0.2)
      expect(odds, `seed ${seed}`).toBeLessThan(0.8)
      const price = b.sharePrice
      const valuation = b.valuation
      const done = changeClasses(g, a.id, 'ab')
      if (!done) {
        no++
        expect('classes' in b, `seed ${seed}`).toBe(false)
        expect(b.sharePrice).toBe(price)
        expect(b.valuation).toBe(valuation)
        expect(yearActionsUsed(g, classesKey(a.id))).toBe(0)
        expect(refusedThisYear(g, b, 'recap')).toBe(true)
        expect(refusedThisYear(g, b, 'merge')).toBe(false)
      } else {
        yes++
        expect(b.classes).toEqual({ kind: 'ab', hi: b.share })
        expect(Math.abs(b.sharePrice - price * 0.96)).toBeLessThan(0.011)
        expect(yearActionsUsed(g, classesKey(a.id))).toBe(1)
      }
    }
    expect(yes).toBeGreaterThan(0)
    expect(no).toBeGreaterThan(0)
  })

  it('a refused recap can not be put again the same year, and the odds say so', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = founder(seed)
      const { a, b } = listed(g, { share: 0.45 })
      if (changeClasses(g, a.id, 'ab')) continue
      expect(passOdds(g, a, b, recapProposal(a, 'ab'))).toBe(0)
      expect(classOption(g, a, b, 'ab').odds).toBe(0)
      expect(changeClasses(g, a.id, 'ab')).toBe(false)
      expect(yearActionsUsed(g, classesKey(a.id))).toBe(0)
      return
    }
    throw new Error('no seed refused the recap')
  })

  it('a proposal of this kind needs the board', () => {
    const g = founder()
    const { a, b } = listed(g)
    const recap: Proposal = recapProposal(a, 'ab')
    expect(recap.kind).toBe('recap')
    expect(recap.by).toBe('owner')
    expect(needsVote(g, a, b, recap)).toBe('The board decides this.')
    expect(recap.merit).toBe(-1)
    expect(recapProposal(a, 'nv').merit).toBe(-1.3)
    expect(recapProposal(a, 'single').merit).toBe(0.3)
  })

  it('blocked reasons', () => {
    const g = founder()
    const { members } = listedGroup(g, 'us', 0.6)
    const member = members[0]
    const mb = bizOf(g, member)
    mb.public = true
    expect(classBlock(g, member, mb, 'ab')).toBe("A division can't have its own share classes.")
    expect(changeClasses(g, member.id, 'ab')).toBe(false)
    expect(noticesTitled(g, 'Share Classes')).toContain("A division can't have its own share classes.")
    expect('classes' in mb).toBe(false)

    const g2 = founder()
    const { a, b } = privateCompany(g2)
    g2.character.age = 17
    expect(classBlock(g2, a, b, 'ab')).toMatch(/18/)
    g2.character.age = 45
    g2.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 2, yearsServed: 0, respect: 20, appealed: false, escapeAttempts: 0 }
    expect(classBlock(g2, a, b, 'ab')).toMatch(/prison/)
    g2.character.prison = null
    g2.character.alive = false
    expect(classBlock(g2, a, b, 'ab')).toBeTruthy()
    g2.character.alive = true
    expect(classBlock(g2, a, b, 'ab')).toBeNull()
    expect(classBlock(g2, a, b, 'single')).toBe('It already has this structure.')
  })

  it('no asset, a bad choice and a blocked change leave the company alone', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    const queued = g.queue.length
    expect(changeClasses(g, 'nope', 'ab')).toBe(false)
    expect(g.queue.length).toBe(queued)
    expect(changeClasses(g, a.id, 'xx' as ClassChoice)).toBe(false)
    expect(changeClasses(g, a.id, undefined as never)).toBe(false)
    expect('classes' in b).toBe(false)
    expect(yearActionsUsed(g, classesKey(a.id))).toBe(0)
  })

  it('a damaged record is read as one class', () => {
    const g = founder()
    const { a, b } = privateCompany(g)
    for (const bad of [7, 'ab', null, [], { kind: 'zz', hi: 1 }]) {
      b.classes = bad as never
      expect(currentChoice(b)).toBe('single')
      expect(classBlock(g, a, b, 'single')).toBe('It already has this structure.')
    }
    b.classes = { kind: 'zz', hi: 1 } as never
    expect(changeClasses(g, a.id, 'ab')).toBe(true)
    expect(b.classes).toEqual({ kind: 'ab', hi: 1 })
  })

  it('the choices are the three structures', () => {
    expect([...CLASS_CHOICES]).toEqual(['single', 'ab', 'nv'])
  })

  it('options say what the choice would do', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.15 })
    const ab = classOption(g, a, b, 'ab')
    expect(ab.votes).toBeCloseTo(0.6383, 4)
    expect(ab.controls).toBe(true)
    expect(ab.factor).toBeCloseTo(0.96, 12)
    expect(ab.current).toBe(false)
    expect(ab.reason).toBeNull()
    expect(ab.odds).toBe(passOdds(g, a, b, recapProposal(a, 'ab')))
    const single = classOption(g, a, b, 'single')
    expect(single.current).toBe(true)
    expect(single.reason).toBe('It already has this structure.')
    expect(single.votes).toBeCloseTo(0.15, 12)
    expect(single.controls).toBe(false)
    expect(classOption(g, a, b, 'nv').votes).toBe(1)
    expect(classOption(g, a, b, 'nv').factor).toBeCloseTo(0.93, 12)

    // A company already on founder shares: going back to one class raises the price.
    b.classes = { kind: 'ab', hi: 0.15 }
    expect(classOption(g, a, b, 'single').factor).toBeCloseTo(1 / 0.96, 12)
    expect(classOption(g, a, b, 'nv').factor).toBeCloseTo(0.93 / 0.96, 12)
    expect(classOption(g, a, b, 'ab').current).toBe(true)

    const g2 = founder()
    const priv = privateCompany(g2)
    const opt = classOption(g2, priv.a, priv.b, 'ab')
    expect(opt.votes).toBeCloseTo(votesAfterIpo(priv.b, ipoRetain(g2, priv.b, 25, 'ab'), 'ab'), 12)
    expect(opt.odds).toBeNull()
    expect(opt.factor).toBeCloseTo(0.96, 12)
    expect(classOption(g2, priv.a, priv.b, 'single').votes).toBeCloseTo(votesAfterIpo(priv.b, ipoRetain(g2, priv.b, 25, null), null), 12)
  })

  it('options are pure', () => {
    const g = founder()
    const { a, b } = listed(g, { share: 0.15 })
    b.classes = { kind: 'ab', hi: 0.15 }
    const priv = privateCompany(g, 'us', 'Plan Co')
    const json = JSON.stringify(g)
    const rng = g.rng
    for (const choice of CLASS_CHOICES) {
      classOption(g, a, b, choice)
      classOption(g, priv.a, priv.b, choice)
    }
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)

    const frozen = deepFreeze(JSON.parse(JSON.stringify(g)) as GameState)
    const snapshot = JSON.stringify(frozen)
    for (const asset of [a, priv.a]) {
      const fa = frozen.assets.find((x) => x.id === asset.id)
      expect(fa).toBeDefined()
      if (!fa) return
      const fb = readBiz(frozen, fa)
      for (const choice of CLASS_CHOICES) expect(() => classOption(frozen, fa, fb, choice)).not.toThrow()
    }
    expect(JSON.stringify(frozen)).toBe(snapshot)
    expect(frozen.rng).toBe(rng)
  })

  it('a recap converts the owner whole stake, as a listing does', () => {
    const g = founder(2)
    const { a, b } = listed(g, { share: 0.9, family: [{ id: 'p1', share: 0.05 }], executive: 0.02 })
    expect(changeClasses(g, a.id, 'nv')).toBe(true)
    expect(b.classes).toEqual({ kind: 'nv', hi: b.share })
    // The relatives hold the founders' class too; the executives and the float do not.
    expect(ownerVotes(b)).toBeCloseTo(0.9 / (0.9 + 0.05), 9)
  })
})
