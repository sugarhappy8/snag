// Era rules that change behavior, not just text (1980-2026): how people courted, how easy it was to
// stay in touch, what leisure cost and where it existed, how the home computer got online. Each
// rule is a pure function or a menu the player can open, so it is tested the way it is played.
import { describe, expect, it } from 'vitest'
import { pastimesAvailable, pastimesMenu, runPastime, scrollMood, winOdds } from '../src/game/activities/pastimes'
import { computerMenu } from '../src/game/computer'
import { broadbandAvailable, dialupBill, linkOf, meteredCalls, onlineNodes, yearlyOnline } from '../src/game/computer/online'
import { formatMoney } from '../src/game/core'
import { eraPrice } from '../src/game/events/era-late-kit'
import { breakUp, breakupFallout, cheatDetectionOdds, courtshipShift, loveMenu } from '../src/game/love'
import { createPerson } from '../src/game/people'
import { driftRelationships, stayInTouchFactor } from '../src/game/relationships'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

function life(year: number, age: number, countryId = 'us', money = 20_000): GameState {
  const g = makeTestGame(9, { countryId, birthCountryId: countryId, age, money })
  g.year = year
  return g
}

function flat(g: GameState, nodes: MenuNode[], depth = 0, out: MenuNode[] = []): MenuNode[] {
  for (const n of nodes) {
    if ('visible' in n && n.visible && !n.visible(g)) continue
    out.push(n)
    if (n.type === 'menu' && depth < 3) flat(g, n.children(g), depth + 1, out)
  }
  return out
}

function ids(g: GameState): string[] {
  return flat(g, pastimesMenu.children(g)).map((n) => n.id)
}

describe('dating by era', () => {
  const app = (g: GameState) => (flat(g, loveMenu.children(g)).find((n) => n.id === 'datingApp') as MenuAction | undefined)?.label

  it('names the dating service people really used', () => {
    expect(app(life(1975, 25))).toMatch(/Personal Ad/)
    expect(app(life(2002, 25))).toBe('Match.com (Dating Website)')
    expect(app(life(2010, 25))).toBe('OkCupid (Dating App)')
    expect(app(life(2018, 25))).toBe('Tinder (Dating App)')
    expect(app(life(2018, 25, 'jp'))).toBe('Pairs (Dating App)')
    expect(app(life(2018, 25, 'cn'))).toBe('Momo (Dating App)')
  })

  it('makes a hook-up behind a partner’s back easier to find out as everything leaves a trace', () => {
    expect(cheatDetectionOdds(life(1915, 30))).toBe(0.1)
    expect(cheatDetectionOdds(life(1950, 30))).toBe(0.15)
    expect(cheatDetectionOdds(life(1975, 30))).toBe(0.15)
    expect(cheatDetectionOdds(life(2003, 30))).toBeGreaterThan(0.15)
    expect(cheatDetectionOdds(life(2026, 30))).toBe(0.25)
    let last = 0
    for (let y = 1930; y <= 2026; y += 4) {
      const o = cheatDetectionOdds(life(y, 30))
      expect(o).toBeGreaterThanOrEqual(last)
      last = o
    }
  })

  it('charges a landline-era teenager for the parent who picks up, and lets a good name travel in the feed age', () => {
    const teen = life(1985, 15)
    const crush = createPerson(teen, { relation: 'classmate', age: 15 })
    expect(courtshipShift(teen, crush)).toBeLessThan(0)
    const adult = life(1985, 25)
    expect(courtshipShift(adult, createPerson(adult, { relation: 'classmate', age: 25 }))).toBe(0)
    const nowTeen = life(2024, 15)
    const mate = createPerson(nowTeen, { relation: 'classmate', age: 15 })
    nowTeen.character.hidden.karma = 90
    const good = courtshipShift(nowTeen, mate)
    nowTeen.character.hidden.karma = 10
    const bad = courtshipShift(nowTeen, mate)
    expect(good).toBeGreaterThan(0)
    expect(bad).toBeLessThan(0)
    expect(Math.abs(good)).toBeLessThanOrEqual(0.06)
  })

  it('lets a break-up get around (corridor, then feed) without touching the dice', () => {
    const rolls = (year: number): number => {
      let n = 0
      for (let i = 0; i < 80; i++) {
        const g = life(year, 16)
        g.lifeId = `life-${i}`
        const ex = createPerson(g, { relation: 'partner', age: 16 })
        const h0 = g.character.stats.happiness
        const rng0 = g.rng
        breakupFallout(g, ex, 'them')
        expect(g.rng).toBe(rng0)
        if (g.character.stats.happiness < h0) n++
      }
      return n
    }
    expect(rolls(2022)).toBeGreaterThan(rolls(1985))
    expect(rolls(1985)).toBeGreaterThan(0)
    // It happens inside a real break-up too.
    const g = life(2022, 16)
    const ex = createPerson(g, { relation: 'partner', age: 16, relationship: 60 })
    breakUp(g, ex, 'them')
    expect(ex.relation).toBe('ex')
  })
})

describe('staying in touch', () => {
  it('is harder with a letter and a stamp than with a group chat', () => {
    expect(stayInTouchFactor(life(1910, 30))).toBeGreaterThan(stayInTouchFactor(life(1975, 30)))
    expect(stayInTouchFactor(life(1975, 30))).toBeGreaterThan(stayInTouchFactor(life(2002, 30)))
    expect(stayInTouchFactor(life(2002, 30))).toBeGreaterThan(stayInTouchFactor(life(2022, 30)))
  })

  it('makes faraway friends drift apart faster in the age of letters', () => {
    const drift = (year: number): number => {
      let total = 0
      for (let i = 0; i < 60; i++) {
        const g = life(year, 30)
        g.lifeId = `d-${i}`
        g.rng = 1000 + i
        const f = createPerson(g, { relation: 'friend', age: 30, relationship: 80 })
        f.data.lastInteractionAge = -50
        f.yearsKnown = 10
        const before = f.relationship
        driftRelationships(g)
        total += before - f.relationship
      }
      return total
    }
    expect(drift(1915)).toBeGreaterThan(drift(2022))
  })
})

describe('Activities › Hang Out', () => {
  it('has an arcade in 1986 but not in 2015, and a feed in 2015 but not in 1986', () => {
    expect(pastimesAvailable(life(1986, 15))).toContain('arcade')
    expect(pastimesAvailable(life(2015, 15))).not.toContain('arcade')
    expect(pastimesAvailable(life(2015, 15))).toContain('scroll')
    expect(pastimesAvailable(life(1986, 15))).not.toContain('scroll')
    expect(pastimesAvailable(life(1986, 15))).not.toContain('stream')
    expect(pastimesAvailable(life(2018, 15))).toContain('stream')
    expect(pastimesAvailable(life(1900, 15))).toEqual([])
  })

  it('gives a 1998 Lagos teen a cyber cafe and an American one a LAN party, not the other way around', () => {
    const lagos = life(1998, 15, 'ng')
    const texas = life(1998, 15, 'us')
    expect(pastimesAvailable(lagos)).toContain('cafe')
    expect(pastimesAvailable(lagos)).not.toContain('lan')
    expect(pastimesAvailable(texas)).toContain('lan')
    expect(pastimesAvailable(texas)).not.toContain('cafe')
    expect(ids(lagos)).toContain('pastimes.cafe')
  })

  it('charges period prices in engine dollars and respects the yearly limit', () => {
    const g = life(1987, 14, 'us', 100)
    const before = g.character.money
    runPastime(g, 'arcade')
    expect(g.character.money).toBe(before - eraPrice(g, 3))
    const g2 = life(1987, 14, 'us', 100_000)
    for (let i = 0; i < 6; i++) runPastime(g2, 'arcade')
    expect(g2.yearActions['act.pastime.arcade']).toBe(4)
    expect(formatMoney(eraPrice(g2, 3))).toMatch(/\d/)
  })

  it('refuses what you cannot afford, and keeps the little ones with someone', () => {
    const poor = life(1987, 14, 'us', 0)
    runPastime(poor, 'arcade')
    expect(poor.yearActions['act.pastime.arcade'] ?? 0).toBe(0)
    expect(poor.queue.some((m) => m.kind === 'notice' && /afford/i.test(m.text))).toBe(true)
    const kid = life(1987, 8, 'us', 500)
    runPastime(kid, 'mall')
    expect(kid.yearActions['act.pastime.mall'] ?? 0).toBe(0)
  })

  it('quotes a purple Gaming hint with the exact odds the outcome rolls', () => {
    const g = life(1987, 14, 'us', 100)
    g.character.talent = 'Gaming'
    const arcade = pastimesMenu.children(g).find((n) => n.id === 'pastimes.arcade') as MenuGroup
    const hint = arcade.hint?.(g) ?? ''
    expect(hint).toContain(`${Math.round(winOdds(g, 0.2) * 100)}%`)
    g.character.talent = null
    expect(arcade.hint?.(g) ?? '').toBe('')
  })

  it('makes the feed pay back less every hour', () => {
    expect(scrollMood(0)).toBe(3)
    expect(scrollMood(1)).toBe(1)
    expect(scrollMood(2)).toBe(-1)
    expect(scrollMood(10)).toBe(-3)
    const g = life(2018, 15, 'us')
    const h0 = g.character.stats.happiness
    for (let i = 0; i < 6; i++) runPastime(g, 'scroll')
    // 3 + 1 - 1 - 3 - 3 - 3: the later hours cost more than the first ones gave.
    expect(g.character.stats.happiness).toBeLessThan(h0)
    expect(g.yearActions['act.pastime.scroll']).toBe(6)
  })

  it('keeps people in touch through the family chat only once phones carry one', () => {
    expect(pastimesAvailable(life(1990, 20))).not.toContain('groupChat')
    expect(pastimesAvailable(life(2018, 20))).toContain('groupChat')
    const g = life(2018, 20)
    const mom = createPerson(g, { relation: 'parent', age: 50, relationship: 30 })
    runPastime(g, 'groupChat')
    expect(mom.relationship).toBeGreaterThan(30)
  })
})

describe('getting online', () => {
  it('goes from a modem and a bulletin board to dial-up to broadband, later in poorer countries', () => {
    expect(linkOf(life(1979, 20))).toBe('none')
    expect(linkOf(life(1988, 20))).toBe('bbs')
    expect(linkOf(life(1998, 20))).toBe('dialup')
    expect(linkOf(life(2015, 20))).toBe('broadband')
    expect(linkOf(life(2005, 20, 'ng'))).not.toBe('broadband')
    expect(linkOf(life(2026, 20, 'ng'))).toBe('broadband')
  })

  it('bills dial-up by the minute outside North America', () => {
    expect(meteredCalls(life(1998, 30, 'gb'))).toBe(true)
    expect(meteredCalls(life(1998, 30, 'us'))).toBe(false)
    expect(dialupBill(life(1998, 30, 'gb'))).toBeGreaterThan(0)
    expect(dialupBill(life(1998, 30, 'us'))).toBe(0)
    expect(dialupBill(life(2015, 30, 'gb'))).toBe(0)
  })

  const withComputer = (g: GameState): GameState => {
    g.assets.push({ id: 'pc', kind: 'other', name: 'Desktop PC', emoji: '\u{1F5A5}\u{FE0F}', purchasePrice: 1000, value: 500, condition: 100, purchasedAge: g.character.age, upkeep: 0, details: {} })
    return g
  }

  it('shows a board in 1988, the early web in 1998 and the app store in 2012, never before their time', () => {
    const rows = (g: GameState): string[] => flat(g, onlineNodes(g)).map((n) => n.id)
    expect(rows(withComputer(life(1988, 16)))).toContain('computer.online.bbs')
    expect(rows(withComputer(life(1988, 16)))).not.toContain('computer.online.web')
    expect(rows(withComputer(life(1998, 16)))).toContain('computer.online.web')
    expect(rows(withComputer(life(1998, 16)))).not.toContain('computer.online.apps')
    expect(rows(withComputer(life(2012, 16)))).toContain('computer.online.apps')
    expect(rows(life(1998, 16))).toEqual([])
    expect(rows(withComputer(life(1970, 16)))).toEqual([])
  })

  it('lets a household upgrade to broadband once, ending the phone bill', () => {
    const g = withComputer(life(2001, 30, 'gb', 100_000))
    expect(broadbandAvailable(g)).toBe(true)
    expect(linkOf(g)).toBe('dialup')
    const upgrade = flat(g, onlineNodes(g)).find((n) => n.id === 'computer.online.upgrade') as MenuAction
    const before = g.character.money
    upgrade.run(g)
    expect(linkOf(g)).toBe('broadband')
    expect(g.character.money).toBeLessThan(before)
    expect(dialupBill(g)).toBe(0)
    const again = g.character.money
    upgrade.run(g)
    expect(g.character.money).toBe(again)
  })

  it('charges the dial-up phone bill at the year end, never below zero', () => {
    const g = withComputer(life(1998, 30, 'gb', 10_000))
    yearlyOnline(g)
    expect(g.character.money).toBeLessThan(10_000)
    const broke = withComputer(life(1998, 30, 'gb', 5))
    yearlyOnline(broke)
    expect(broke.character.money).toBeGreaterThanOrEqual(0)
    const kid = withComputer(life(1998, 12, 'gb', 10_000))
    yearlyOnline(kid)
    expect(kid.character.money).toBe(10_000)
  })

  it('shows the Connection menu in the Computer menu for owners', () => {
    const g = withComputer(life(1998, 30, 'us'))
    const labels = flat(g, computerMenu.children(g)).map((n) => ('label' in n ? n.label : ''))
    expect(labels).toContain('Connection')
  })
})
