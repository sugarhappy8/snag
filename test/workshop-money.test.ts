// Workshop money and purity: a sold royalty stream pays once and ends, one big deal a year on
// every route, company-made inventions when the company is sold, closed or goes bankrupt, a
// hundred-year life with many inventions, and menus that never change state in any kind of life.
import { describe, expect, it } from 'vitest'
import { runScript } from '../src/game/scripts'
import { assetsMenu } from '../src/game/menus'
import { ageUp } from '../src/game/aging'
import { bizOf } from '../src/game/business/state'
import { closeBusiness, declareBankruptcy, sellBusiness } from '../src/game/business/exit'
import type { GameState } from '../src/game/types'
import { FUTURE } from '../src/game/workshop/catalog'
import { brainstorm, resolveBuild } from '../src/game/workshop/build'
import { acceptOffer, dealsLeft, filePatent, giveAway, launchBlock, license, makeInCompany, runCrowd, sellStream } from '../src/game/workshop/launch'
import { candidates, findInvention, inventions, mutWorkshop, readWorkshop } from '../src/game/workshop/notebook'
import { settleInventions, yearlyWorkshop } from '../src/game/workshop/yearly'
import { inventionNodes, workshopMenu } from '../src/game/workshop/menu'
import { NOTEBOOK_MAX } from '../src/game/workshop/state'
import { company, give, idea, inventor, nextYear, walk } from './workshop-fixtures'

describe('money', () => {
  it('a sold royalty stream pays once, stops the royalties and never comes back as an idea', () => {
    const g = inventor({ genius: true, year: 2000 })
    give(g, 'robot-mower', 80)
    license(g, idea('robot-mower'))
    nextYear(g)
    yearlyWorkshop(g)
    const o = inventions(g)[0]
    const money = g.character.money
    const paid = sellStream(g, o.a.id)
    expect(paid).toBe(o.a.value)
    expect(g.character.money - money).toBe(paid)
    expect(sellStream(g, o.a.id)).toBe(0)
    for (let y = 0; y < 3; y++) {
      nextYear(g)
      const before = g.character.money
      settleInventions(g, mutWorkshop(g))
      expect(g.character.money).toBe(before)
    }
    expect(candidates(g, readWorkshop(g)).some((d) => d.id === 'robot-mower')).toBe(false)
  })

  it('one big deal a year holds across every route, the company included', () => {
    const g = inventor({ genius: true, year: 2015, money: 2_000_000 })
    const c = company(g)
    for (const id of ['pocket-tool', 'robot-mower', 'cold-pack', 'pizza-scissors']) give(g, id, 80)
    expect(makeInCompany(g, idea('pocket-tool'), c.id)).not.toBeNull()
    expect(dealsLeft(g)).toBe(0)
    expect(license(g, idea('robot-mower'))).toBeNull()
    expect(giveAway(g, idea('cold-pack'))).toBe(false)
    expect(runCrowd(g, idea('cold-pack'), 0)).toBeNull()
    expect(acceptOffer(g, idea('cold-pack'), 'A buyer', 1_000)).toBe(false)
    expect(makeInCompany(g, idea('robot-mower'), c.id)).toBeNull()
    // A crowdfunding flop still used the year's deal.
    nextYear(g)
    for (let s = 0; s < 40; s++) {
      const h = structuredClone(g)
      h.rng = 1000 + s
      if (runCrowd(h, idea('cold-pack'), 2) !== 'flop') continue
      expect(dealsLeft(h)).toBe(0)
      expect(license(h, idea('robot-mower'))).toBeNull()
      return
    }
    throw new Error('no flop')
  })

  it('company-made inventions stop when the company is sold, closed or goes bankrupt, with no money to anyone', () => {
    for (const exit of ['sell', 'close', 'bankrupt'] as const) {
      const g = inventor({ genius: true, year: 2015, money: 2_000_000 })
      const c = company(g)
      give(g, 'pocket-tool', 85)
      const a = makeInCompany(g, idea('pocket-tool'), c.id)!
      nextYear(g)
      settleInventions(g, mutWorkshop(g))
      expect(findInvention(g, a.id)!.inv.companyEarned).toBeGreaterThan(0)
      const b = bizOf(g, c)
      if (exit === 'sell') sellBusiness(g, c, b, 1_000_000, 'A buyer')
      else if (exit === 'close') closeBusiness(g, c, b, 0)
      else declareBankruptcy(g, c, b, 'test')
      g.queue = []
      nextYear(g)
      const money = g.character.money
      settleInventions(g, mutWorkshop(g))
      expect(findInvention(g, a.id), exit).toBeNull()
      expect(g.character.money, exit).toBe(money)
      expect(g.flags.taxableIncome, exit).toBe(0)
    }
  })

  it('stays finite and consistent over a hundred-year life with many inventions', () => {
    const g = inventor({ genius: true, age: 8, year: 1920, money: 0, seed: 21 })
    for (let y = 0; y < 100; y++) {
      if (g.character.age >= 20) g.character.money += 60_000
      brainstorm(g)
      brainstorm(g)
      const ws = readWorkshop(g)
      for (const i of ws.ideas.slice(0, 5)) resolveBuild(g, idea(i.id), 'safe')
      const ready = readWorkshop(g).ideas.filter((i) => i.q >= 45)
      if (ready[0] && g.character.money > 100_000) filePatent(g, idea(ready[0].id), 'world')
      const bench = inventions(g).find((o) => o.inv.stage === 'patented')
      if (bench) license(g, { kind: 'asset', id: bench.a.id })
      for (const m of [...g.queue]) if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[0].id, m.data, m)
      nextYear(g)
      yearlyWorkshop(g)
      for (const m of [...g.queue]) if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[0].id, m.data, m)
      g.queue = []
      const w = readWorkshop(g)
      expect(Number.isFinite(g.character.money) && Number.isFinite(w.earned) && Number.isFinite(w.skill) && Number.isFinite(w.rep)).toBe(true)
      for (const o of inventions(g)) {
        for (const v of [o.a.value, o.inv.peak, o.inv.units, o.inv.earned, o.inv.lastIncome, o.inv.rate, o.inv.hit]) expect(Number.isFinite(v) && v >= 0, `${o.a.name} in ${g.year}`).toBe(true)
      }
      expect(w.ideas.length).toBeLessThanOrEqual(NOTEBOOK_MAX)
    }
    expect(readWorkshop(g).launches).toBeGreaterThan(5)
  }, 120_000)
})


describe('menus stay pure in every kind of life', () => {
  function lives(): [string, GameState][] {
    const out: [string, GameState][] = []
    const kid = inventor({ age: 9, money: 0, year: 1962 })
    give(kid, 'pizza-scissors', 0)
    out.push(['kid', kid])
    const teen = inventor({ age: 15, genius: true, money: 300, year: 1975 })
    give(teen, 'hist-color-cube', 70)
    out.push(['teen genius', teen])
    const adult = inventor({ age: 35, year: 1999 })
    give(adult, 'robot-mower', 45)
    out.push(['adult', adult])
    const main = inventor({ age: 40, talents: ['MainCharacter'], year: 2040 })
    give(main, FUTURE[0].id, 60)
    out.push(['main character', main])
    const broke = inventor({ age: 30, money: 0, year: 2020 })
    give(broke, 'flying-car', 35)
    out.push(['broke', broke])
    const prisoner = inventor({ age: 33, genius: true, year: 2001 })
    give(prisoner, 'robot-mower', 80)
    license(prisoner, idea('robot-mower'))
    prisoner.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    out.push(['prison', prisoner])
    const rich = inventor({ age: 50, genius: true, year: 2021, money: 50_000_000 })
    const c = company(rich)
    const ids = ['robot-mower', 'pocket-tool', 'cold-pack', 'pizza-scissors', 'translator-earpiece', 'flying-car', 'folding-bike']
    for (const id of ids) give(rich, id, 85)
    filePatent(rich, idea('cold-pack'), 'home')
    filePatent(rich, idea('flying-car'), 'world')
    license(rich, idea('robot-mower'))
    rich.yearActions = {}
    makeInCompany(rich, idea('pocket-tool'), c.id)
    rich.yearActions = {}
    nextYear(rich)
    yearlyWorkshop(rich)
    rich.queue = []
    out.push(['rich, many inventions', rich])
    const dead = structuredClone(rich)
    dead.character.alive = false
    out.push(['dead', dead])
    return out
  }

  it('render the Workshop and every invention screen without changing state or the RNG', () => {
    for (const [name, g] of lives()) {
      g.queue = []
      const before = JSON.stringify(g)
      const rng = g.rng
      walk(g, [workshopMenu])
      walk(g, assetsMenu.children(g))
      for (const a of g.assets.filter((x) => x.kind === 'invention')) walk(g, inventionNodes(g, a))
      expect(g.rng, name).toBe(rng)
      expect(JSON.stringify(g), name).toBe(before)
    }
  })

  it('show nothing to dead characters and block every action in prison', () => {
    const all = lives()
    const dead = all.find(([n]) => n === 'dead')![1]
    expect(workshopMenu.visible!(dead)).toBe(false)
    const prisoner = all.find(([n]) => n === 'prison')![1]
    const o = inventions(prisoner)[0]
    for (const n of inventionNodes(prisoner, o.a)) if (n.type === 'action') expect(n.disabledReason?.(prisoner)).toMatch(/behind bars/)
    expect(launchBlock(prisoner, idea('x'))).toMatch(/behind bars/)
  })
})


describe('ageUp integration', () => {
  it('a real age-up settles inventions once and taxes them', () => {
    const g = inventor({ genius: true, year: 2000, age: 40 })
    give(g, 'robot-mower', 80)
    license(g, idea('robot-mower'))
    g.queue = []
    ageUp(g)
    const o = inventions(g)[0]
    expect(o.inv.last).toBe(2000)
    expect(o.inv.earned).toBe(o.inv.lastIncome)
  })
})
