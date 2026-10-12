// Inventor 2.0 — The Workshop: catalog, builds, patents, the six launch routes, sales, events,
// talent hints and menu purity.
import { describe, expect, it } from 'vitest'
import { makeTestGame } from './helpers'
import { counter, netWorth } from '../src/game/core'
import { anachronismsIn } from '../src/game/events/era'
import { brandById } from '../src/game/data/brands'
import { runScript } from '../src/game/scripts'
import { activitiesMenu, assetsMenu } from '../src/game/menus'
import { ageUp } from '../src/game/aging'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { bizOf, readBiz } from '../src/game/business/state'
import { becomeCeo } from '../src/game/business/career'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { SPECIAL_TALENTS } from '../src/game/talents'
import { TALENTS } from '../src/game/life'
import type { ChoiceModal, GameState, MenuAction, MenuNode } from '../src/game/types'
import { ALL_IDEAS, CATEGORIES, HISTORY, IDEAS, catalogIdea } from '../src/game/workshop/catalog'
import { APPROACHES, brainstorm, brainstormOdds, buildCost, buildOdds, buildLimit, resolveBuild, skillGain, startBuild, type Approach } from '../src/game/workshop/build'
import {
  benchFor, benchHint, crowdBlock, dealsLeft, filePatent, giveAway, launchBlock, license, makeInCompany, patentBlock, pitch, routeQuotes, runCrowd, sellStream, shopRights, subjectOf,
} from '../src/game/workshop/launch'
import { crowdOdds, curveAt, expectedPeak, licenseValue, patentFee, pitchOdds, trueAppeal } from '../src/game/workshop/market'
import { addIdea, candidates, findInvention, historyOpen, inventions, mutWorkshop, readWorkshop } from '../src/game/workshop/notebook'
import { settleInventions, yearlyWorkshop } from '../src/game/workshop/yearly'
import { workshopMenu } from '../src/game/workshop/menu'
import { fairOdds, fairOpen, sueOdds, yearlyWorkshopEvent } from '../src/game/workshop/events'
import { NOTEBOOK_MAX } from '../src/game/workshop/state'

function inventor(opts: { genius?: boolean; age?: number; money?: number; year?: number; seed?: number; country?: string } = {}): GameState {
  const g = makeTestGame(opts.seed ?? 11, { age: opts.age ?? 30, money: opts.money ?? 5_000_000, talents: opts.genius ? ['Inventor'] : [], countryId: opts.country ?? 'us' })
  g.year = opts.year ?? 2026
  g.lifeId = `ws-test-${opts.seed ?? 11}`
  return g
}
function give(g: GameState, id: string, q = 0): void {
  const ws = mutWorkshop(g)
  expect(addIdea(g, ws, catalogIdea(id)!)).toBe(true)
  ws.ideas.find((i) => i.id === id)!.q = q
}
const idea = (id: string) => ({ kind: 'idea' as const, id })
function nextYear(g: GameState): void {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  g.flags.taxableIncome = 0
  g.queue = []
}
function walk(g: GameState, nodes: MenuNode[], depth = 0): number {
  let n = 0
  for (const node of nodes) {
    n++
    if (node.type === 'heading') continue
    if (node.type === 'info') { if (typeof node.text === 'function') node.text(g); continue }
    if (typeof node.subtitle === 'function') node.subtitle(g)
    node.visible?.(g)
    node.disabledReason?.(g)
    node.hint?.(g)
    if (node.type === 'action') { node.confirm?.(g); node.input?.defaultValue?.(g) }
    if (node.type === 'menu' && depth < 7) { node.header?.(g); n += walk(g, node.children(g), depth + 1) }
  }
  return n
}

describe('the catalog', () => {
  it('has 120+ everyday ideas and a history race, with valid, unique entries', () => {
    expect(IDEAS.length).toBeGreaterThanOrEqual(120)
    expect(HISTORY.length).toBeGreaterThanOrEqual(25)
    expect(new Set(ALL_IDEAS.map((i) => i.id)).size).toBe(ALL_IDEAS.length)
    expect(new Set(ALL_IDEAS.map((i) => i.name)).size).toBe(ALL_IDEAS.length)
    for (const i of ALL_IDEAS) {
      expect(CATEGORIES[i.cat], i.id).toBeDefined()
      expect(i.d >= 1 && i.d <= 5 && i.a >= 1 && i.a <= 5, i.id).toBe(true)
      expect(i.name.length).toBeLessThanOrEqual(40)
      expect(i.blurb.length).toBeLessThanOrEqual(90)
      if (i.to !== undefined) expect(i.to).toBeGreaterThan(i.from)
    }
    for (const h of HISTORY) {
      expect(h.from).toBe(h.real! - 25)
      expect(h.to).toBe(h.real)
      expect(h.a).toBe(5)
    }
    // Every category has ideas, including plenty of silly ones.
    for (const cat of Object.keys(CATEGORIES)) expect(IDEAS.filter((i) => i.cat === cat).length, cat).toBeGreaterThanOrEqual(8)
  })

  it('never uses a word before its time, anywhere an idea is offered', () => {
    for (const i of ALL_IDEAS) {
      for (let y = Math.max(1900, i.from); y <= (i.to ?? 2030); y += i.real ? 1 : 3) {
        expect(anachronismsIn(`${i.name}. ${i.blurb}`, y, ['us']), `${i.id} in ${y}`).toEqual([])
      }
    }
  })

  it('only names real companies that are in the brand registry', () => {
    for (const [cat, def] of Object.entries(CATEGORIES)) for (const id of def.buyers) expect(brandById(id), `${cat}: ${id}`).toBeDefined()
  })

  it('never names a real inventor', () => {
    const people = /edison|tesla\b|bell\b|wright|jobs\b|gates\b|marconi|baird|farnsworth|spencer|biro|judson|sundback|morgan\b|strite|rohwedder|diemer|les paul|shaw\b|magee|land\b|de mestral|knerr|bohlin|maiman|pearsall|cooper\b|rubik|sasson|wozniak|ibuka|silver\b|fry\b|berners|brandenburg|johnson\b|whitcomb|wakefield/i
    for (const i of ALL_IDEAS) expect(people.test(`${i.name} ${i.blurb}`), i.id).toBe(false)
  })
})

describe('era gates', () => {
  it('offers no idea before its era and keeps the history race for geniuses (or skill 80+)', () => {
    for (const year of [1905, 1930, 1955, 1980, 2005, 2026]) {
      const g = inventor({ year, genius: false })
      const list = candidates(g, readWorkshop(g))
      expect(list.every((d) => !d.real && d.from <= year && (d.to === undefined || year <= d.to))).toBe(true)
      const genius = inventor({ year, genius: true })
      for (const d of candidates(genius, readWorkshop(genius))) {
        if (d.real) expect(year >= d.real - 25 && year <= d.real).toBe(true)
        else expect(d.from <= year).toBe(true)
      }
    }
    const g = inventor({ year: 1960 })
    expect(candidates(g, readWorkshop(g)).some((d) => d.real)).toBe(false)
    mutWorkshop(g).skill = 85
    expect(candidates(g, readWorkshop(g)).some((d) => d.id === 'hist-pocket-telephone')).toBe(true)
    g.year = 1974
    expect(candidates(g, readWorkshop(g)).some((d) => d.id === 'hist-pocket-telephone')).toBe(false)
  })

  it('closes a history idea after its real year: someone else got there', () => {
    const g = inventor({ genius: true, year: 1972 })
    give(g, 'hist-pocket-telephone', 50)
    expect(historyOpen(catalogIdea('hist-pocket-telephone')!, 1973)).toBe(true)
    nextYear(g)
    yearlyWorkshop(g)
    expect(readWorkshop(g).ideas.some((i) => i.id === 'hist-pocket-telephone')).toBe(true)
    nextYear(g)
    yearlyWorkshop(g)
    expect(readWorkshop(g).ideas.some((i) => i.id === 'hist-pocket-telephone')).toBe(false)
  })

  it('keeps crowdfunding for 2009+ adults and pitch shows for the television age', () => {
    const g = inventor({ year: 2005 })
    give(g, 'pizza-scissors', 60)
    expect(crowdBlock(g, idea('pizza-scissors'))).toMatch(/isn't a thing yet/)
    g.year = 2015
    expect(crowdBlock(g, idea('pizza-scissors'))).toBeNull()
    g.character.age = 15
    expect(crowdBlock(g, idea('pizza-scissors'))).toMatch(/18/)
  })
})

describe('building prototypes', () => {
  it('is deterministic per seed and costs what it says', () => {
    const run = (seed: number) => {
      const g = inventor({ seed })
      give(g, 'folding-bike', 0)
      const before = g.character.money
      const r = resolveBuild(g, idea('folding-bike'), 'bold')
      return { r, spent: before - g.character.money, ws: readWorkshop(g) }
    }
    const a = run(5), b = run(5)
    expect(a).toEqual(b)
    expect(a.spent).toBe(buildCost(inventor({ seed: 5 }), catalogIdea('folding-bike')!, 'bold'))
    const results = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => JSON.stringify(run(s).r)))
    expect(results.size).toBeGreaterThan(1)
  })

  it('rolls exactly the odds the purple hint shows', () => {
    const g = inventor({ genius: true })
    give(g, 'flying-car', 0)
    const ws = readWorkshop(g)
    for (const ap of ['safe', 'bold', 'cheap'] as Approach[]) {
      const o = buildOdds(g, ws, catalogIdea('flying-car')!, 0, ap)
      let kabooms = 0, masters = 0
      const N = 1500
      for (let s = 0; s < N; s++) {
        const h = inventor({ genius: true, seed: 1000 + s })
        give(h, 'flying-car', 0)
        const r = resolveBuild(h, idea('flying-car'), ap)!
        if (r.result === 'kaboom') kabooms++
        if (r.result === 'master') masters++
        if (r.result !== 'kaboom') expect(r.quality).toBeGreaterThanOrEqual(Math.max(0, Math.floor(o.low)))
      }
      expect(Math.abs(kabooms / N - o.kaboom), ap).toBeLessThan(0.035)
      expect(Math.abs(masters / N - o.master), ap).toBeLessThan(0.035)
    }
    startBuild(g, idea('flying-car'))
    const popup = g.queue.at(-1) as ChoiceModal
    const bold = popup.choices.find((c) => c.id === 'bold')!
    const o = buildOdds(g, ws, catalogIdea('flying-car')!, 0, 'bold')
    expect(bold.hint).toContain(`${Math.round(o.kaboom * 100)}%`)
    expect(bold.hint).toContain(`${Math.round(o.master * 100)}%`)
  })

  it('grows skill with diminishing returns, twice as fast for a genius, and limits builds per year', () => {
    const g = inventor()
    expect(skillGain(g, 0, 3, 'works')).toBeGreaterThan(skillGain(g, 50, 3, 'works'))
    expect(skillGain(g, 50, 3, 'works')).toBeGreaterThan(skillGain(g, 90, 3, 'works'))
    expect(skillGain(inventor({ genius: true }), 40, 3, 'works')).toBeCloseTo(skillGain(g, 40, 3, 'works') * 2)
    give(g, 'pocket-tool', 0)
    for (let i = 0; i < buildLimit(g); i++) expect(resolveBuild(g, idea('pocket-tool'), 'cheap')).not.toBeNull()
    expect(resolveBuild(g, idea('pocket-tool'), 'cheap')).toBeNull()
    expect(readWorkshop(g).skill).toBeGreaterThan(0)
    expect(counter(g, 'prototypes')).toBe(3)
    expect(buildLimit(inventor({ genius: true }))).toBe(5)
  })

  it('lets kids build easy things from scrap and makes genius prototypes much better', () => {
    const kid = inventor({ age: 10, money: 0 })
    give(kid, 'pizza-scissors')
    expect(buildCost(kid, catalogIdea('pizza-scissors')!, 'safe')).toBe(0)
    expect(buildCost(kid, catalogIdea('flying-car')!, 'safe')).toBeGreaterThan(100_000)
    expect(resolveBuild(kid, idea('pizza-scissors'), 'safe')).not.toBeNull()
    const normal = inventor(), genius = inventor({ genius: true })
    const def = catalogIdea('robot-mower')!
    const n = buildOdds(normal, readWorkshop(normal), def, 0, 'safe'), x = buildOdds(genius, readWorkshop(genius), def, 0, 'safe')
    expect(x.low - n.low).toBeCloseTo(20)
    expect(x.kaboom).toBeCloseTo(n.kaboom / 2, 3)
  })

  it('brainstorms twice a year at the shown odds and never overfills the notebook', () => {
    const g = inventor({ genius: true })
    expect(brainstormOdds(g, readWorkshop(g))).toBeGreaterThan(brainstormOdds(inventor(), readWorkshop(inventor())))
    brainstorm(g); brainstorm(g)
    expect(brainstorm(g)).toBeNull()
    const ws = mutWorkshop(g)
    for (const d of candidates(g, ws)) if (ws.ideas.length < NOTEBOOK_MAX) addIdea(g, ws, d)
    expect(addIdea(g, ws, IDEAS.find((d) => !ws.ideas.some((i) => i.id === d.id))!)).toBe(false)
    expect(readWorkshop(g).ideas).toHaveLength(NOTEBOOK_MAX)
  })
})

describe('patents', () => {
  it('turn a notebook idea into an asset that counts in net worth, for the shown fee', () => {
    const g = inventor()
    give(g, 'robot-mower', 35)
    expect(patentBlock(g, idea('robot-mower'), 'home')).toMatch(/40/)
    mutWorkshop(g).ideas[0].q = 70
    const money = g.character.money, worth = netWorth(g)
    const a = filePatent(g, idea('robot-mower'), 'home')!
    expect(a.kind).toBe('invention')
    expect(g.character.money).toBe(money - patentFee('us', g.year, 'home'))
    expect(readWorkshop(g).ideas).toHaveLength(0)
    expect(a.value).toBeGreaterThan(0)
    expect(netWorth(g)).toBe(worth - patentFee('us', g.year, 'home') + a.value)
    expect(counter(g, 'patents')).toBe(1)
    // Extending to worldwide charges only the difference, and only once.
    const before = g.character.money
    expect(filePatent(g, { kind: 'asset', id: a.id }, 'world')).not.toBeNull()
    expect(before - g.character.money).toBe(patentFee('us', g.year, 'world') - patentFee('us', g.year, 'home'))
    expect(patentBlock(g, { kind: 'asset', id: a.id }, 'world')).toMatch(/worldwide/)
    expect(findInvention(g, a.id)!.inv.patent!.scope).toBe('world')
  })
})

describe('launch routes and money', () => {
  it('license: royalties arrive once a year through taxable income, rise, peak, fade and end', () => {
    const g = inventor({ year: 2000 })
    give(g, 'robot-mower', 80)
    filePatent(g, idea('robot-mower'), 'world')
    const a = inventions(g)[0].a
    expect(license(g, { kind: 'asset', id: a.id })).not.toBeNull()
    expect(dealsLeft(g)).toBe(0)
    const yearly: number[] = []
    for (let y = 0; y < 50 && g.assets.some((x) => x.id === a.id); y++) {
      nextYear(g)
      const money = g.character.money
      yearlyWorkshop(g)
      const got = g.character.money - money
      expect(g.flags.taxableIncome).toBe(got)
      yearlyWorkshop(g) // a second call in the same year pays nothing
      expect(g.character.money - money).toBe(got)
      yearly.push(got)
    }
    expect(g.assets.some((x) => x.id === a.id)).toBe(false)
    const peak = Math.max(...yearly)
    expect(yearly[0]).toBeLessThan(peak)
    expect(yearly.at(-1)!).toBeLessThan(peak * 0.1)
    expect(yearly.every((x) => Number.isFinite(x) && x >= 0)).toBe(true)
    expect(readWorkshop(g).earned).toBe(yearly.reduce((s, x) => s + x, 0))
    expect(counter(g, 'inventions')).toBe(1)
  })

  it('sell the rights: real offers in a popup, paid once, taxed, one try a year', () => {
    const g = inventor()
    give(g, 'pocket-tool', 60)
    expect(shopRights(g, idea('pocket-tool'))).toBe(true)
    expect(shopRights(g, idea('pocket-tool'))).toBe(false)
    const m = g.queue.at(-1) as ChoiceModal
    expect(m.choices.length).toBeGreaterThanOrEqual(2)
    const money = g.character.money
    const offer = (m.data as { offers: { amount: number }[] }).offers[0].amount
    runScript(g, m.scriptId!, 'o0', m.data, m)
    expect(g.character.money - money).toBe(offer)
    expect(g.flags.taxableIncome).toBe(offer)
    expect(readWorkshop(g).ideas).toHaveLength(0)
    runScript(g, m.scriptId!, 'o0', m.data, m) // replayed popup pays nothing
    expect(g.character.money - money).toBe(offer)
    expect(readWorkshop(g).made[0]).toMatchObject({ id: 'pocket-tool', route: 'sold' })
  })

  it('pitch: a deal pays cash for a cut of royalties; walking away keeps the idea', () => {
    let deal: GameState | null = null, flop: GameState | null = null
    for (let s = 1; s < 60 && (!deal || !flop); s++) {
      const g = inventor({ seed: s })
      give(g, 'robot-mower', 70)
      pitch(g, idea('robot-mower'))
      const m = g.queue.at(-1)!
      if (m.kind === 'choice' && !deal) deal = g
      else if (m.kind === 'notice' && !flop) flop = g
    }
    expect(deal && flop).toBeTruthy()
    const g = deal!
    const m = g.queue.at(-1) as ChoiceModal
    const money = g.character.money
    runScript(g, m.scriptId!, 'deal', m.data, m)
    const cash = (m.data as { cash: number }).cash
    expect(g.character.money - money).toBe(cash)
    const o = inventions(g)[0]
    expect(o.inv.route).toBe('pitch')
    expect(o.inv.rate).toBeLessThan(0.1)
    expect(readWorkshop(flop!).ideas[0].pitched).toBe(flop!.year)
    expect(launchBlock(flop!, idea('robot-mower'))).toBeNull()
  })

  it('crowdfund: success pays pledges times the margin, a flop pays nothing', () => {
    const outcomes = new Set<string>()
    for (let s = 1; s < 80 && outcomes.size < 3; s++) {
      const g = inventor({ seed: s, year: 2020 })
      give(g, 'robot-mower', 70)
      const money = g.character.money
      const r = runCrowd(g, idea('robot-mower'), 2)
      outcomes.add(r!)
      if (r === 'flop') {
        expect(g.character.money).toBe(money)
        expect(readWorkshop(g).ideas).toHaveLength(1)
      } else {
        expect(inventions(g)[0].inv.route).toBe('crowd')
        if (r === 'delivered') expect(g.character.money - money).toBe(g.flags.taxableIncome)
        else expect(g.character.money).toBe(money)
      }
    }
    expect(outcomes.has('flop') && outcomes.has('delivered')).toBe(true)
    expect(crowdOdds(inventor(), 0)).toBeGreaterThan(crowdOdds(inventor(), 2))
  })

  it('make it in my company: the company books the margin once, as income in the right fiscal year', () => {
    const setup = (withInvention: boolean) => {
      const g = inventor({ year: 2021, money: 1_000_000 })
      const b0 = newBiz(g, 'manufacturing', 'us', g.character.city, { cash: 5_000_000, founded: 2015 })
      const c = createBusinessAsset(g, 'Gadget Works', b0, 1_000_000)
      g.assets.push(c)
      becomeCeo(g, c, bizOf(g, c))
      g.queue = []
      if (withInvention) {
        give(g, 'pocket-tool', 85)
        expect(makeInCompany(g, idea('pocket-tool'), c.id)).not.toBeNull()
      }
      return { g, c }
    }
    const a = setup(true), control = setup(false)
    expect(inventions(a.g)[0].inv.route).toBe('company')
    expect(inventions(a.g)[0].a.value).toBe(0)
    for (const x of [a, control]) { nextYear(x.g); x.g.queue = [] }
    const cashBefore = bizOf(a.g, a.c).cash, money = a.g.character.money
    settleInventions(a.g, mutWorkshop(a.g))
    const booked = bizOf(a.g, a.c).cash - cashBefore
    expect(booked).toBeGreaterThan(0)
    expect(bizOf(a.g, a.c).yearIncome).toBe(booked)
    expect(a.g.character.money).toBe(money) // nothing personal
    expect(findInvention(a.g, inventions(a.g)[0].a.id)!.inv.companyEarned).toBe(booked)
    bizOf(control.g, control.c).brand = bizOf(a.g, a.c).brand // the invention's +1 brand is not what we compare
    yearlyBusinessImpl(a.g)
    yearlyBusinessImpl(control.g)
    const s = readBiz(a.g, a.c).last!, sc = readBiz(control.g, control.c).last!
    expect(s.year).toBe(a.g.year - 1)
    expect(s.otherIncome - sc.otherIncome).toBe(booked)
    // Booked once: the cash difference is the invention profit minus the extra corporate tax.
    const extraTax = s.corpTax - sc.corpTax
    // (Booked twice would be ~2x; interest on the extra cash is the only other difference.)
    expect(Math.abs(readBiz(a.g, a.c).cash - readBiz(control.g, control.c).cash - (booked - extraTax))).toBeLessThan(booked * 0.05)
    expect(readBiz(a.g, a.c).yearIncome).toBe(0)
  })

  it('give it to the world: karma and fame, no money, idea gone', () => {
    const g = inventor()
    give(g, 'cold-pack', 50)
    const money = g.character.money, karma = g.character.hidden.karma
    expect(giveAway(g, idea('cold-pack'))).toBe(true)
    expect(g.character.money).toBe(money)
    expect(g.character.hidden.karma).toBeGreaterThan(karma)
    expect(inventions(g)).toHaveLength(0)
    expect(counter(g, 'openInventions')).toBe(1)
  })

  it('beating history is a moment: fame, reputation and a counter', () => {
    const g = inventor({ genius: true, year: 1970 })
    give(g, 'hist-color-cube', 80)
    const fame = g.character.hidden.fame
    license(g, idea('hist-color-cube'))
    expect(counter(g, 'historyFirsts')).toBe(1)
    expect(g.character.hidden.fame).toBeGreaterThan(fame + 15)
    expect(g.queue.some((m) => m.kind === 'notice' && /Beat History/.test(m.title))).toBe(true)
    expect(inventions(g)[0].inv.history).toBe(true)
    expect(readWorkshop(g).made[0].first).toBe(true)
  })

  it('sells a royalty stream for its value, taxed', () => {
    const g = inventor()
    give(g, 'robot-mower', 80)
    license(g, idea('robot-mower'))
    const o = inventions(g)[0]
    const money = g.character.money
    expect(sellStream(g, o.a.id)).toBe(o.a.value)
    expect(g.character.money - money).toBe(o.a.value)
    expect(g.flags.taxableIncome).toBe(o.a.value)
    expect(inventions(g)).toHaveLength(0)
  })

  it('allows one big deal a year', () => {
    const g = inventor({ genius: true })
    give(g, 'robot-mower', 80)
    give(g, 'pocket-tool', 80)
    license(g, idea('robot-mower'))
    expect(launchBlock(g, idea('pocket-tool'))).toMatch(/One big deal/)
    expect(license(g, idea('pocket-tool'))).toBeNull()
  })
})

describe('the market model', () => {
  it('values a launched invention as its remaining expected royalties and keeps every number finite', () => {
    const g = inventor({ genius: true })
    give(g, 'translator-earpiece', 95)
    filePatent(g, idea('translator-earpiece'), 'world')
    const a = inventions(g)[0].a
    license(g, { kind: 'asset', id: a.id })
    const o = inventions(g)[0]
    expect(o.inv.peak).toBeGreaterThan(0)
    for (let t = 0; t < 50; t++) expect(Number.isFinite(curveAt({ launched: 2026, rise: 2, plateau: 2, decay: 0.85, patent: o.inv.patent }, t))).toBe(true)
    expect(o.a.value).toBeGreaterThan(0)
    expect(expectedPeak(o.def, 95, 5, 'world', 'us', 2026, false)).toBeGreaterThan(expectedPeak(o.def, 95, 5, 'home', 'us', 2026, false))
    expect(expectedPeak(o.def, 95, 5, 'home', 'us', 1910, false)).toBeLessThan(expectedPeak(o.def, 95, 5, 'home', 'us', 2026, false))
  })
})

describe('talent effects and honest hints', () => {
  it('shows purple hints only to geniuses, computed from the resolver math', () => {
    const genius = inventor({ genius: true }), normal = inventor()
    for (const g of [genius, normal]) give(g, 'robot-mower', 70)
    const bg = benchFor(genius, readWorkshop(genius), idea('robot-mower'))!
    const bn = benchFor(normal, readWorkshop(normal), idea('robot-mower'))!
    expect(benchHint(normal, readWorkshop(normal), bn)).toBe('')
    const hint = benchHint(genius, readWorkshop(genius), bg)
    expect(hint).toMatch(/Real appeal/)
    const quotes = routeQuotes(genius, readWorkshop(genius), bg)
    const best = quotes.reduce((x, y) => (y.value > x.value ? y : x))
    expect(hint).toContain(best.label)
    const license = quotes.find((q) => q.route === 'license')!
    expect(license.value).toBeCloseTo(licenseValue(genius, subjectOf(genius, bg), trueAppeal(genius, bg.def), readWorkshop(genius).rep))
    // Expected-value hints never peek at the luck rolled at launch.
    const before = JSON.stringify(genius)
    benchHint(genius, readWorkshop(genius), bg)
    expect(JSON.stringify(genius)).toBe(before)
    expect(pitchOdds(genius, subjectOf(genius, bg), 5, 50)).toBeLessThan(1)
  })

  it('perk text and discovery point at the Workshop', () => {
    expect(SPECIAL_TALENTS.find((t) => t.id === 'Inventor')!.perk).toBe('Ideas strike constantly. Build better prototypes, race history to its greatest inventions, and see which ideas will sell.')
    expect(TALENTS.find((t) => t.id === 'Inventor')!.discovery).toMatch(/Inventor's Workshop/)
  })

  it('gives geniuses about three times as many ideas', () => {
    let genius = 0, normal = 0
    for (let s = 1; s <= 30; s++) {
      for (const [isGenius, add] of [[true, (n: number) => (genius += n)], [false, (n: number) => (normal += n)]] as const) {
        const g = inventor({ genius: isGenius, seed: s, age: 20 })
        for (let y = 0; y < 5; y++) {
          nextYear(g)
          yearlyWorkshop(g)
          for (const m of g.queue) if (m.kind === 'choice' && m.scriptId === 'workshop.spark') runScript(g, m.scriptId, 'write', m.data, m)
          g.queue = []
          brainstorm(g); brainstorm(g)
          const ws = mutWorkshop(g)
          add(ws.ideas.length)
          ws.ideas = []
        }
      }
    }
    expect(genius / normal).toBeGreaterThan(2.2)
    expect(genius / normal).toBeLessThan(4.5)
  })
})

describe('events', () => {
  function launched(seed: number, route: 'license' | 'company' = 'license', q = 70): GameState {
    const g = inventor({ seed, year: 2000 })
    give(g, 'robot-mower', q)
    if (route === 'license') license(g, idea('robot-mower'))
    return g
  }

  it('resolve every event popup without throwing, once each', () => {
    const seen = new Set<string>()
    for (let s = 1; s < 400 && seen.size < 7; s++) {
      const g = launched(s, 'license', s % 2 ? 40 : 75)
      g.character.age = s % 3 ? 30 : 12
      // Science fairs are for kids at school.
      if (g.character.age < 18) g.character.education.current = { level: 'middle', school: 'Test Middle School', year: 1, totalYears: 3, grades: 70, data: {} }
      mutWorkshop(g).rep = s % 5 ? 20 : 70
      mutWorkshop(g).skill = 50
      for (let y = 0; y < 6; y++) {
        nextYear(g)
        yearlyWorkshop(g)
        for (const m of [...g.queue]) {
          if (m.kind !== 'choice' || !m.scriptId?.startsWith('workshop.')) continue
          seen.add(m.scriptId)
          for (const c of m.choices) expect(() => runScript(structuredClone(g), m.scriptId!, c.id, m.data, m)).not.toThrow()
          runScript(g, m.scriptId, m.choices[0].id, m.data, m)
        }
        g.queue = []
      }
      for (const o of inventions(g)) expect(new Set(o.inv.done).size).toBe(o.inv.done.length)
      expect(Number.isFinite(g.character.money)).toBe(true)
    }
    for (const id of ['workshop.knockoff', 'workshop.recall', 'workshop.fair', 'workshop.spark']) expect(seen.has(id), id).toBe(true)
  }, 120_000)

  it('the lawsuit and science-fair hints are the handlers own odds', () => {
    const g = launched(3)
    const o = inventions(g)[0]
    expect(sueOdds(o, g.year)).toBe(0.1) // no patent
    const p = inventor({ year: 2000 })
    give(p, 'robot-mower', 80)
    filePatent(p, idea('robot-mower'), 'world')
    expect(sueOdds(inventions(p)[0], p.year)).toBeGreaterThan(0.5)
    expect(fairOdds(g, readWorkshop(g))).toBeGreaterThanOrEqual(0)
  })
})

describe('era details in events', () => {
  it('holds science fairs only for kids at school, from 1930', () => {
    const kid = inventor({ age: 12, year: 1950 })
    expect(fairOpen(kid)).toBe(false)
    kid.character.education.current = { level: 'middle', school: 'Test Middle School', year: 1, totalYears: 3, grades: 70, data: {} }
    expect(fairOpen(kid)).toBe(true)
    kid.year = 1925
    expect(fairOpen(kid)).toBe(false)
    kid.year = 1950
    kid.character.age = 18
    expect(fairOpen(kid)).toBe(false)
  })

  it('names patent trolls and buyers in words of their time', () => {
    const find = (year: number, script: string) => {
      for (let s = 1; s < 600; s++) {
        const g = inventor({ seed: s, year: year - 2 })
        give(g, 'pocket-tool', 80)
        filePatent(g, idea('pocket-tool'), 'world')
        license(g, { kind: 'asset', id: inventions(g)[0].a.id })
        nextYear(g)
        yearlyWorkshop(g)
        nextYear(g)
        settleInventions(g, mutWorkshop(g))
        g.queue = []
        const o = inventions(g)[0]
        o.inv.lastIncome = 50_000
        yearlyWorkshopEvent(g, mutWorkshop(g))
        const m = g.queue.find((x) => x.kind === 'choice' && x.scriptId === script)
        if (m && m.kind === 'choice') return m.text
      }
      throw new Error(`no ${script} in ${year}`)
    }
    expect(find(1975, 'workshop.troll')).not.toMatch(/LLC/)
    expect(find(2010, 'workshop.troll')).toMatch(/LLC/)
    expect(find(1975, 'workshop.buyout')).not.toMatch(/royalty fund/)
  }, 120_000)
})

describe('menus', () => {
  function richLife(): GameState {
    const g = inventor({ genius: true, year: 2020 })
    const b0 = newBiz(g, 'manufacturing', 'us', g.character.city, { cash: 5_000_000, founded: 2015 })
    const c = createBusinessAsset(g, 'Gadget Works', b0, 1_000_000)
    g.assets.push(c)
    becomeCeo(g, c, bizOf(g, c))
    g.queue = []
    for (const [id, q] of [['robot-mower', 80], ['pocket-tool', 50], ['pizza-scissors', 0], ['hist-touch-slate', 40], ['cold-pack', 60]] as const) give(g, id, q)
    filePatent(g, idea('cold-pack'), 'home')
    license(g, idea('robot-mower'))
    g.yearActions = {}
    makeInCompany(g, idea('pocket-tool'), c.id)
    g.yearActions = {}
    nextYear(g)
    yearlyWorkshop(g)
    g.queue = []
    return g
  }

  it('render the whole Workshop and every invention screen without changing state or using the RNG', () => {
    for (const g of [richLife(), inventor({ age: 9 }), inventor({ year: 1925, genius: true })]) {
      const before = JSON.stringify(g)
      expect(walk(g, [workshopMenu])).toBeGreaterThan(5)
      walk(g, assetsMenu.children(g))
      walk(g, activitiesMenu.children(g).filter((n) => n.id === 'workshop'))
      expect(JSON.stringify(g)).toBe(before)
    }
  })

  it('opens the Workshop for everyone from age 8', () => {
    expect(workshopMenu.visible!(inventor({ age: 7 }))).toBe(false)
    expect(workshopMenu.visible!(inventor({ age: 8 }))).toBe(true)
    expect(activitiesMenu.children(inventor({ age: 30 })).some((n) => n.id === 'workshop')).toBe(true)
  })
})

describe('a long life in the Workshop (monkey test)', () => {
  it('survives random play over decades with finite money and consistent state', () => {
    for (const seed of [3, 4]) {
      const g = inventor({ seed, age: 8, money: 2_000, year: 1960, genius: seed % 2 === 0 })
      let r = seed * 9973
      const roll = () => ((r = (r * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
      for (let y = 0; y < 70; y++) {
        if (g.character.age >= 22) g.character.money += 30_000
        for (let k = 0; k < 6; k++) {
          const ws = readWorkshop(g)
          const targets = [...ws.ideas.map((i) => idea(i.id)), ...inventions(g).filter((o) => o.inv.stage === 'patented').map((o) => ({ kind: 'asset' as const, id: o.a.id }))]
          const t = targets[Math.floor(roll() * targets.length)]
          const pickAction = Math.floor(roll() * 9)
          if (pickAction === 0) brainstorm(g)
          else if (!t) continue
          else if (pickAction <= 3) resolveBuild(g, t, (['safe', 'bold', 'cheap'] as const)[Math.floor(roll() * 3)])
          else if (pickAction === 4) filePatent(g, t, roll() < 0.5 ? 'home' : 'world')
          else if (pickAction === 5) license(g, t)
          else if (pickAction === 6) shopRights(g, t)
          else if (pickAction === 7) pitch(g, t)
          else runCrowd(g, t, Math.floor(roll() * 3))
          for (const m of [...g.queue]) if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[Math.floor(roll() * m.choices.length)].id, m.data, m)
          g.queue = []
        }
        nextYear(g)
        yearlyWorkshop(g)
        for (const m of [...g.queue]) if (m.kind === 'choice' && m.scriptId) runScript(g, m.scriptId, m.choices[Math.floor(roll() * m.choices.length)].id, m.data, m)
        g.queue = []
        const ws = readWorkshop(g)
        expect(Number.isFinite(g.character.money)).toBe(true)
        expect(ws.ideas.length).toBeLessThanOrEqual(NOTEBOOK_MAX)
        expect(ws.skill >= 0 && ws.skill <= 100 && ws.rep >= 0 && ws.rep <= 100).toBe(true)
        for (const o of inventions(g)) expect(Number.isFinite(o.a.value) && o.a.value >= 0).toBe(true)
        expect(JSON.parse(JSON.stringify(g))).toEqual(g)
      }
    }
  }, 120_000)
})

describe('a whole life through the real menus (monkey test)', () => {
  function enabled(g: GameState, nodes: MenuNode[], out: MenuAction[] = [], depth = 0): MenuAction[] {
    for (const n of nodes) {
      if (n.type === 'info' || n.type === 'heading' || (n.visible && !n.visible(g)) || n.disabledReason?.(g)) continue
      if (n.type === 'action') out.push(n)
      else if (depth < 5) enabled(g, n.children(g), out, depth + 1)
    }
    return out
  }
  it('plays decades of random Workshop actions with real age-ups, popups and taxes', () => {
    for (const [seed, year, talents] of [[17, 1950, ['Inventor']], [23, 1985, []]] as const) {
      const g = createNewLife({ seed, year, talents: [...talents] })
      let r = seed
      const roll = () => ((r = (r * 48271) % 2147483647) / 2147483647)
      const settle = () => {
        for (let i = 0; i < 200 && g.queue.length; i++) {
          const m = g.queue.shift()!
          const before = g.queue.length
          if (m.kind === 'choice') {
            const c = m.choices[Math.floor(roll() * m.choices.length)]
            if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
            else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
          } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || (m.input === 'number' ? String(m.min ?? 1) : 'Sam'), m.data, m)
          else if (m.kind === 'minigame') runScript(g, m.scriptId, 'lose', m.data, m)
          else if (m.kind === 'aiTask') applyFallback(g, m.task)
          const added = g.queue.splice(before)
          g.queue.unshift(...added)
        }
        g.queue = []
      }
      settle()
      for (let y = 0; y < 70 && g.character.alive; y++) {
        g.character.stats.health = Math.max(g.character.stats.health, 60)
        if (g.character.age >= 18) g.character.money += 25_000
        for (let k = 0; k < 4; k++) {
          const actions = enabled(g, [workshopMenu])
          if (!actions.length) break
          const a = actions[Math.floor(roll() * actions.length)]
          a.run(g, a.input?.defaultValue?.(g))
          settle()
        }
        ageUp(g)
        settle()
        expect(Number.isFinite(g.character.money)).toBe(true)
        const ws = readWorkshop(g)
        expect(ws.ideas.length).toBeLessThanOrEqual(NOTEBOOK_MAX)
        for (const o of inventions(g)) expect(Number.isFinite(o.a.value)).toBe(true)
      }
      expect(readWorkshop(g).builds + readWorkshop(g).launches).toBeGreaterThan(0)
    }
  }, 600_000)
})

describe('approach table', () => {
  it('cheap builds cost 40% and every approach has a label', () => {
    const g = inventor()
    const d = catalogIdea('flying-car')!
    expect(buildCost(g, d, 'cheap') / buildCost(g, d, 'safe')).toBeCloseTo(0.4, 3)
    expect(Object.values(APPROACHES).every((a) => a.label && a.emoji)).toBe(true)
  })
})
