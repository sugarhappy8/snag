// Player report: "Game studio is easy. Made over trillion." A hit's back catalog grew every year
// when the CEO, the sales team and the campaigns were strong (each year's boost fed next year's
// base), and nothing tied a title, or a whole publisher, to the number of people who play games.
import { describe, expect, it } from 'vitest'
import { becomeCeo } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { maxPipeline, saveStudio, studioInternals, studioOf } from '../src/game/business/gamestudio'
import { devGames } from '../src/game/business/gamestudio-state'
import { bizOf, findBusiness, type BizState } from '../src/game/business/state'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import { createNewLife } from '../src/game/life'
import { applyFallback } from '../src/game/offline'
import { runScript } from '../src/game/scripts'
import { sequelTitle } from '../src/game/special/gamedev-core'
import type { Asset, GameState } from '../src/game/types'
import { getCountry } from '../src/game/world'

/** The ceiling this test holds a studio to: the very top of the real industry earns tens of billions a year. */
const CEILING = 25e9
/** What the best sellers ever reached: a few hundred million copies, of three and a half billion players. */
const BEST_TITLE = 300e6

function drain(g: GameState): void {
  const prefer = ['decline', 'cover', 'loan', 'thank', 'embrace', 'patch', 'sponsor', 'change']
  for (let guard = 0; g.queue.length && guard < 400; guard++) {
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const ch = m.choices.find((c) => prefer.includes(c.id)) ?? m.choices[0]
      if (m.source === 'script') runScript(g, m.scriptId!, ch.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: ch.id })
    } else if (m.kind === 'input') runScript(g, m.scriptId, m.defaultValue || String(m.min ?? 1), m.data, m)
    else if (m.kind === 'minigame') runScript(g, m.scriptId, 'skip', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

/** A founder with the best CEO skill the game allows, running games with every lever pulled. */
function tycoon(seed: number, year: number): GameState {
  const g = createNewLife({ seed, year: 1990, countryId: 'us' })
  g.queue = []
  g.year = year
  const c = g.character
  c.age = 40
  c.money = 5e9
  c.talent = null
  c.talents = ['Business', 'Gaming']
  c.stats.smarts = 100
  c.hidden.discipline = 100
  c.education.degrees = [{ kind: 'mba' } as never]
  return g
}

function studio(g: GameState, name: string, offices: number, boost = 0): Asset {
  const city = getCountry('us').cities[0]
  const b0 = newBiz(g, 'gameStudio', 'us', city, {
    cash: 2e9, employees: offices * 120, quality: 100, brand: 100, morale: 100, marketingLevel: 1.5,
    founded: g.year - 25, campaignBoost: boost, outlets: [{ countryId: 'us', city, count: offices, opened: g.year - 25 }],
  })
  for (let i = 0; i < 4; i++) {
    b0.staff.push({ id: `s${i}`, firstName: 'Ada', lastName: 'Lee', gender: 'female', age: 40, role: 'Head of Sales', focus: 'sales', skill: 100, salary: 150_000, trait: 'visionary', morale: 100, years: 3 })
  }
  const a = createBusinessAsset(g, name, b0, 1e6)
  g.assets.push(a)
  if (g.assets.filter((x) => x.kind === 'business').length === 1) becomeCeo(g, a, b0)
  return a
}

/** Keep every desk busy on the biggest sequel of the best seller. */
function fillPipeline(g: GameState, a: Asset): void {
  const b: BizState = bizOf(g, a)
  const st = studioOf(a)
  for (let guard = 0; devGames(st).length < Math.min(maxPipeline(b), Math.floor(b.employees / 160)) && guard < 400; guard++) {
    const best = st.games.filter((x) => x.stage === 'live').sort((x, y) => y.copies - x.copies)[0]
    const franchise = best ? best.franchise || best.title : ''
    if (best && !best.franchise) best.franchise = franchise
    const title = best ? sequelTitle(franchise, st.games.filter((x) => x.franchise === franchise).length + 1) : `Game ${st.seq + 1}`
    studioInternals.addGame(st, g, { scope: 'aaa', genre: 'rpg', platform: 'multi', engine: 'cobalt', title, team: 160, franchise, sequelOf: best ? best.id : '' })
  }
  saveStudio(a, st)
}

/** One company year for every studio; returns each studio's booked revenue and copies. */
function playYear(g: GameState, assets: Asset[], pipeline = true): { revenue: number; copies: number }[] {
  if (pipeline) for (const a of assets) fillPipeline(g, a)
  g.year += 1
  g.character.age += 1
  yearlyBusinessImpl(g)
  drain(g)
  g.character.money = 5e9
  return assets.map((a) => {
    const cur = findBusiness(g, a.id)
    const s = cur ? bizOf(g, cur).last : null
    return { revenue: s?.revenue ?? 0, copies: s?.sold ?? 0 }
  })
}

describe('game studio scale', () => {
  it('a hit with a strong CEO, sales team and campaigns sells less every year, never more', () => {
    const g = tycoon(7, 2020)
    const a = studio(g, 'Tail Games', 1, 0.6)
    const st = studioOf(a)
    studioInternals.addGame(st, g, { scope: 'aaa', genre: 'rpg', platform: 'multi', engine: 'cobalt', title: 'Hit', team: 160, franchise: '', sequelOf: '' })
    Object.assign(st.games[0], { stage: 'live', progress: 100, released: g.year - 1, critic: 99, players: 99, copies: 20e6, tail: 20e6, price: 69.99, team: 0, quality: 90 })
    saveStudio(a, st)
    const sold: number[] = []
    for (let y = 0; y < 14; y++) {
      bizOf(g, findBusiness(g, a.id)!).campaignBoost = 0.6
      sold.push(playYear(g, [a], false)[0].copies)
    }
    const hit = studioOf(findBusiness(g, a.id)!).games[0]
    // The audience fades: the tenth year sells far less than the first, and no year beats the one before by much.
    expect(sold[9]).toBeLessThan(sold[0] * 0.5)
    for (let y = 1; y < sold.length; y++) expect(sold[y]).toBeLessThan(sold[y - 1] * 1.5)
    expect(hit.copies).toBeLessThan(BEST_TITLE)
    expect(Math.max(...sold) * 69.99).toBeLessThan(CEILING)
  })

  it('a hundred offices of AAA sequels stay under the best a real publisher has earned', () => {
    const g = tycoon(3, 2018)
    const a = studio(g, 'Colossus Games', 100)
    let peak = 0
    let biggest = 0
    for (let y = 0; y < 8; y++) {
      const [r] = playYear(g, [a])
      peak = Math.max(peak, r.revenue)
      for (const x of studioOf(findBusiness(g, a.id)!).games) biggest = Math.max(biggest, x.copies)
    }
    expect(peak).toBeLessThan(CEILING)
    expect(biggest).toBeLessThan(BEST_TITLE)
  }, 120_000)

  it('a group of studios shares one world of players', () => {
    const g = tycoon(5, 2018)
    const group = [studio(g, 'North Games', 30), studio(g, 'South Games', 30), studio(g, 'East Games', 30), studio(g, 'West Games', 30)]
    let peak = 0
    for (let y = 0; y < 6; y++) {
      const rows = playYear(g, group)
      peak = Math.max(peak, rows.reduce((s, r) => s + r.revenue, 0))
    }
    expect(peak).toBeLessThan(CEILING)
  }, 120_000)
})
