// R3-G3 (H.4): the market screens that show estimates end with one "Look closer" row, the way to pay for a sharper number.
//
// The row is Knowledge's (lookCloser); the screens only hand it the keys they show. What this file pins: where the row sits (last, one
// per screen, none in Exact mode, none on a screen that shows only numbers the player owns), which keys each screen asks about, that a
// bought report narrows the rows it was bought for, that the same source twice in a year changes nothing, that an illegal source is
// flagged, that every key family has an owner who can say what it is called and what it really is, and that building all of it
// leaves the state and the dice alone.
import { describe, expect, it } from 'vitest'
import { marketViewOf } from '../src/game/business/competition'
import {
  lineKey, marketShareKey, marketSizeKey, marketTruth, rivalKey, rivalLinesOf, rivalRead, rivalTruth, scenarioKey, scenarioScope,
  unknownMarket, FORECAST_FLOOR, LINES_SHOWN, LOOK_RIVALS,
} from '../src/game/business/market-fog'
import { lookFor } from '../src/game/business/market-menu-kit'
import { countryRows, localRows, scenarioRows, scenarioTruth } from '../src/game/business/market-menu'
import { countryDetail, localField } from '../src/game/business/market-view'
import { readBiz } from '../src/game/business/state'
import { COUNTRIES } from '../src/game/world'
import { readKnow, storedEstimates } from '../src/game/knowledge/contract'
import { kindOf, labelOfKey } from '../src/game/knowledge/kinds'
import { ILLEGAL_CONFIRM } from '../src/game/knowledge/look'
import { withInfoMode } from '../src/game/knowledge/mode'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { deepFreeze, inFog } from './knowledge-kit'
import { adult, allNodes, company, marketNode, nextYear, renderAll } from './market-kit'

type Industry = Parameters<typeof company>[1]

/** The id a Look closer group has: Knowledge prefixes the screen's id with `look.`. */
const LOOK = 'look.biz.mkt.look.'

const LIVES = [
  ['software', 'us', 2015, 5],
  ['restaurant', 'jp', 2010, 7],
  ['semiconductor', 'us', 1990, 11],
] as const

/** A grown-up with a company, three years in. `talents` empty is a life without the Business talent. */
function setup(ind: Industry, cid: string, year: number, seed: number, talents: string[] = ['Business']): { g: GameState; a: Asset } {
  const g = adult(seed, year, cid)
  g.character.talents = talents
  const a = company(g, ind)
  for (let i = 0; i < 3; i++) nextYear(g)
  return { g, a }
}

const idOf = (n: MenuNode): string => ('id' in n ? n.id : '')
/** The Look closer rows among some children. */
const looks = (nodes: readonly MenuNode[]): MenuNode[] => nodes.filter((n) => idOf(n).startsWith(LOOK))

/** The menu of a market screen with this id. */
function screen(g: GameState, a: Asset, id: string): MenuGroup {
  const m = marketNode(g, a)
  const n = m ? allNodes(g, [m]).find((x) => x.type === 'menu' && x.id === id) : undefined
  expect(n, id).toBeDefined()
  return n as MenuGroup
}

/** The one Look closer group among some children, which must be the last of them. */
function lastLook(_g: GameState, nodes: readonly MenuNode[], what: string): MenuGroup {
  const rows = looks(nodes)
  expect(rows.length, `${what}: one Look closer row`).toBe(1)
  expect(nodes[nodes.length - 1], `${what}: it is the last row`).toBe(rows[0])
  const row = rows[0]!
  expect(row.type, what).toBe('menu')
  expect((row as MenuGroup).label, what).toBe('Look closer')
  return row as MenuGroup
}

/** The offer of one source in a Look closer group. */
function offer(g: GameState, look: MenuGroup, src: string): MenuAction {
  const o = look.children(g).find((n) => idOf(n).endsWith(`.${src}`))
  expect(o, `${look.id} offers ${src}`).toBeDefined()
  expect(o!.type).toBe('action')
  return o as MenuAction
}

const keysOfRecord = (g: GameState): string[] => storedEstimates(g).map((e) => e.key).sort()

/** The first scenario rows that carry a forecast, the way the screen asks about them. */
function forecastRows(g: GameState, a: Asset) {
  return scenarioRows(g, a).filter((r) => r.value !== null && !r.block)
}

// ---------------------------------------------------------------------------------------------------------------------
describe('lookFor', () => {
  it('is empty in Exact mode, for no keys, and for keys nobody can read', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const r = marketViewOf(g, b).rivals[0]!
    const keys = [rivalKey(b, r.id, 'quality')]
    withInfoMode('exact', () => expect(lookFor(g, a, 'x', keys)).toEqual([]))
    inFog(() => {
      expect(lookFor(g, a, 'x', [])).toEqual([])
      expect(lookFor(g, a, 'x', ['riv:nosuch:quality'])).toEqual([])
      expect(lookFor(g, a, 'x', ['not a key'])).toEqual([])
    })
  })

  it('is one Look closer group, named for the screen and the company, when the keys can be read', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const r = marketViewOf(g, b).rivals[0]!
    inFog(() => {
      const rows = lookFor(g, a, 'x', [rivalKey(b, r.id, 'quality')])
      expect(rows.length).toBe(1)
      expect(rows[0]!.type).toBe('menu')
      expect(idOf(rows[0]!)).toBe(`look.biz.mkt.look.x.${a.id}`)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('every key family on the market screens has an owner who knows what it is', () => {
  it('riv, mkt and scn keys have a label, a truth and a scope; the truths are the engine\'s', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    const r = v.rivals[0]!
    const line = rivalLinesOf(g, b, r)[0]!
    const d = countryDetail(g, b, v, 'us')!
    const sc = forecastRows(g, a)[0]!
    const keys = [
      rivalKey(b, r.id, 'quality'), rivalKey(b, r.id, 'tech'), lineKey(b, r.id, line.family),
      marketSizeKey('software', 'us'), marketShareKey('software', 'us'), marketShareKey('software', 'us', d.row.leader!.name),
      scenarioKey(scenarioScope(a), sc.id),
    ]
    for (const key of keys) {
      const kind = kindOf(key.split(':')[0]!)
      expect(kind, key).not.toBeNull()
      const label = labelOfKey(g, key)
      expect(label, `${key} has a name`).not.toBe(key)
      expect(label.length, label).toBeLessThanOrEqual(60)
      expect(label, label).not.toMatch(/[\u{2013}\u{2014}]/u)
      expect(kind!.truth(g, key), key).not.toBeNull()
      expect(Number.isFinite(kind!.truth(g, key)!), key).toBe(true)
      const scope = kind!.scope?.(g, key)
      expect(scope, key).toBeDefined()
      expect([1, 2, 3]).toContain(scope!.tier)
    }
    expect(labelOfKey(g, rivalKey(b, r.id, 'quality'))).toContain(r.name)
    expect(kindOf('riv')!.truth(g, rivalKey(b, r.id, 'quality'))).toBe(rivalTruth(g, rivalKey(b, r.id, 'quality')))
    expect(kindOf('mkt')!.truth(g, marketSizeKey('software', 'us'))).toBe(marketTruth(g, marketSizeKey('software', 'us')))
    expect(kindOf('scn')!.truth(g, scenarioKey(scenarioScope(a), sc.id))).toBe(scenarioTruth(g, scenarioKey(scenarioScope(a), sc.id)))
  })

  it('a forecast is measured against the same scale the screen reads it with, so a bought reading and the passive one share a ruler', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    for (const r of forecastRows(g, a)) {
      const key = scenarioKey(scenarioScope(a), r.id)
      const want = Math.max(Math.abs(r.value!), Math.max(0, b.last?.revenue ?? 0) * FORECAST_FLOOR)
      expect(kindOf('scn')!.scale!(g, key), r.id).toBe(want)
    }
  })

  it('a champion\'s key finds the leader of a country too, when the leader is not one of the champions', () => {
    const { g, a } = setup('software', 'us', 2015, 5)
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    let outside = 0
    for (const { id: c } of COUNTRIES) {
      const d = countryDetail(g, b, v, c)
      if (!d || !d.row.leader) continue
      const lead = d.row.leader
      expect(marketTruth(g, marketShareKey('software', c, lead.name)), `${c} leader ${lead.name}`).toBe(lead.share)
      if (!d.champions.some((x) => x.name === lead.name)) outside++
    }
    expect(outside, 'a leader that is no champion exists in this life').toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('Look closer rows in Realistic mode', () => {
  for (const [ind, cid, year, seed] of LIVES) {
    it(`${ind}: the rivals list, a rival, the scenarios and the hub each end with one`, () => {
      const { g, a } = setup(ind, cid, year, seed)
      inFog(() => {
        const rivals = screen(g, a, `biz.mkt.rivals.${a.id}`)
        const list = rivals.children(g)
        expect(lastLook(g, list, 'rivals list').id).toBe(`look.biz.mkt.look.rivals.${a.id}`)
        const first = list.find((n) => n.type === 'menu' && idOf(n).startsWith(`biz.mkt.rival.${a.id}.`)) as MenuGroup
        const one = first.children(g)
        expect(lastLook(g, one, 'one rival').id).toBe(`look.biz.mkt.look.rival.${idOf(first).split('.').pop()}.${a.id}`)
        expect(lastLook(g, screen(g, a, `biz.mkt.scenarios.${a.id}`).children(g), 'scenarios').id).toBe(`look.biz.mkt.look.scenarios.${a.id}`)
        expect(lastLook(g, screen(g, a, `biz.market.${a.id}`).children(g), 'hub').id).toBe(`look.biz.mkt.look.hub.${a.id}`)
      })
    })

    it(`${ind}: no screen of numbers the player owns has one, and no list is giant`, () => {
      const { g, a } = setup(ind, cid, year, seed)
      inFog(() => {
        const m = marketNode(g, a)!
        for (const n of allNodes(g, [m])) {
          if (n.type !== 'menu' || n.id.startsWith('look.')) continue
          const kids = n.children(g)
          expect(kids.length, `${n.label} has ${kids.length} rows`).toBeLessThanOrEqual(16)
          const l = looks(kids)
          const mine = n.id === `biz.market.${a.id}` || n.id === `biz.mkt.rivals.${a.id}` || n.id === `biz.mkt.scenarios.${a.id}` || n.id.startsWith(`biz.mkt.rival.${a.id}.`)
          if (!mine) expect(l, `${n.id} should not have a Look closer row`).toEqual([])
        }
        for (const n of ['overview', 'leaders', 'segments', 'regions', 'history']) expect(looks(screen(g, a, `biz.mkt.${n}.${a.id}`).children(g)), n).toEqual([])
      })
    })
  }
})

describe('Look closer rows in Exact mode', () => {
  for (const [ind, cid, year, seed] of LIVES) {
    it(`${ind}: there are none, anywhere on the market screen`, () => {
      const { g, a } = setup(ind, cid, year, seed)
      const m = marketNode(g, a)!
      for (const n of allNodes(g, [m])) expect(idOf(n).startsWith('look.'), idOf(n)).toBe(false)
      const text = renderAll(g, a).join('\n')
      expect(text).not.toContain('Look closer')
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
describe('which keys each screen asks about', () => {
  it('the rivals list reads the quality of its top five; one rival reads quality, technology and the lines it shows; scenarios the first three forecasts', () => {
    const { g, a } = setup('software', 'us', 2015, 5, [])
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    inFog(() => {
      // The rivals list.
      const list = lastLook(g, screen(g, a, `biz.mkt.rivals.${a.id}`).children(g), 'rivals list')
      expect(offer(g, list, 'report').disabledReason?.(g)).toBeNull()
      offer(g, list, 'report').run(g, '')
      const top = v.rivals.slice(0, LOOK_RIVALS).map((r) => rivalKey(b, r.id, 'quality')).sort()
      expect(keysOfRecord(g)).toEqual(top)
    })
    // One rival.
    const two = setup('software', 'us', 2015, 5, [])
    inFog(() => {
      const r = marketViewOf(two.g, readBiz(two.g, two.a)).rivals[0]!
      const bb = readBiz(two.g, two.a)
      const rows = screen(two.g, two.a, `biz.mkt.rival.${two.a.id}.${r.id}`).children(two.g)
      offer(two.g, lastLook(two.g, rows, 'one rival'), 'report').run(two.g, '')
      const shown = rivalLinesOf(two.g, bb, r).slice(0, LINES_SHOWN).map((l) => lineKey(bb, r.id, l.family))
      expect(keysOfRecord(two.g)).toEqual([rivalKey(bb, r.id, 'quality'), rivalKey(bb, r.id, 'tech'), ...shown].sort())
    })
    // The scenarios.
    const three = setup('software', 'us', 2015, 5, [])
    inFog(() => {
      const rows = screen(three.g, three.a, `biz.mkt.scenarios.${three.a.id}`).children(three.g)
      offer(three.g, lastLook(three.g, rows, 'scenarios'), 'report').run(three.g, '')
      const want = forecastRows(three.g, three.a).slice(0, 3).map((r) => scenarioKey(scenarioScope(three.a), r.id)).sort()
      expect(want.length).toBeGreaterThan(0)
      expect(keysOfRecord(three.g)).toEqual(want)
    })
  })

  it('the hub reads the union of those, the first six', () => {
    const { g, a } = setup('software', 'us', 2015, 5, [])
    const b = readBiz(g, a)
    inFog(() => {
      const rows = screen(g, a, `biz.market.${a.id}`).children(g)
      offer(g, lastLook(g, rows, 'hub'), 'report').run(g, '')
      const rivals = marketViewOf(g, b).rivals.slice(0, LOOK_RIVALS).map((r) => rivalKey(b, r.id, 'quality'))
      const fc = forecastRows(g, a).slice(0, 3).map((r) => scenarioKey(scenarioScope(a), r.id))
      expect(keysOfRecord(g)).toEqual([...rivals, ...fc].slice(0, 6).sort())
    })
  })

  it('a national market reads the same way: the rivals of a restaurant in Japan', () => {
    const { g, a } = setup('restaurant', 'jp', 2010, 7, [])
    const b = readBiz(g, a)
    inFog(() => {
      offer(g, lastLook(g, screen(g, a, `biz.mkt.rivals.${a.id}`).children(g), 'rivals list'), 'press').run(g, '')
      const top = marketViewOf(g, b).rivals.slice(0, LOOK_RIVALS).map((r) => rivalKey(b, r.id, 'quality')).sort()
      expect(keysOfRecord(g)).toEqual(top)
    })
  })

  it('a country and a national market the player does not know end with one, asking about the demand and the shares shown', () => {
    // No real screen shows a market of an industry the player has no company in (D27), so the builders are called as a screen would.
    const w = setup('software', 'us', 2015, 5, [])
    const bw = readBiz(w.g, w.a)
    const vw = marketViewOf(w.g, bw)
    const dc = countryDetail(w.g, bw, vw, 'jp')!
    const fog = { g: w.g, b: bw, industry: 'software' }
    inFog(() => {
      const rows = countryRows(w.a, dc, fog)
      offer(w.g, lastLook(w.g, rows, 'country'), 'report').run(w.g, '')
      const want = [marketSizeKey('software', 'jp'), ...(dc.row.leader ? [marketShareKey('software', 'jp', dc.row.leader.name)] : []), ...dc.champions.map((c) => marketShareKey('software', 'jp', c.name))]
      expect(keysOfRecord(w.g)).toEqual([...new Set(want)].sort())
      // Without a fog context the same builder has no row.
      expect(looks(countryRows(w.a, dc))).toEqual([])
    })
    const l = setup('restaurant', 'jp', 2010, 7, [])
    const bl = readBiz(l.g, l.a)
    const vl = marketViewOf(l.g, bl)
    const f = localField(l.g, bl, vl, 'us')
    inFog(() => {
      const rows = localRows(l.a, f, vl, { g: l.g, b: bl, industry: 'restaurant' })
      offer(l.g, lastLook(l.g, rows, 'national market'), 'report').run(l.g, '')
      const want = [marketSizeKey('restaurant', 'us'), ...f.top.map((t) => marketShareKey('restaurant', 'us', t.name))]
      expect(keysOfRecord(l.g)).toEqual([...new Set(want)].sort())
      expect(looks(localRows(l.a, f, vl))).toEqual([])
    })
    // The helper a real screen would call is what it says: nothing for the player's own industry.
    inFog(() => expect(unknownMarket(w.g, bw, 'jp')).toBeUndefined())
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('what a purchase does on these screens', () => {
  it('a bought report narrows the rival rows it was bought for, and the same source again in the year changes nothing', () => {
    const { g, a } = setup('software', 'us', 2015, 5, [])
    const b = readBiz(g, a)
    const rivals = marketViewOf(g, b).rivals.slice(0, LOOK_RIVALS)
    inFog(() => {
      const width = (): number => rivals.reduce((s, r) => s + (rivalRead(g, b, r, 'quality').hi - rivalRead(g, b, r, 'quality').lo), 0)
      const rowsBefore = renderAll(g, a).join('\n')
      const before = width()
      const cash = g.character.money
      const look = lastLook(g, screen(g, a, `biz.mkt.rivals.${a.id}`).children(g), 'rivals list')
      const report = offer(g, look, 'report')
      expect(report.disabledReason?.(g)).toBeNull()
      report.run(g, '')
      expect(g.character.money).toBeLessThan(cash)
      for (const r of rivals) expect(rivalRead(g, b, r, 'quality').src, r.id).toBe('report')
      const after = width()
      expect(after).toBeLessThan(before)
      expect(renderAll(g, a).join('\n')).not.toBe(rowsBefore)

      // The same source twice in a year: blocked on the rebuilt screen, and a stale click changes nothing.
      const again = lastLook(g, screen(g, a, `biz.mkt.rivals.${a.id}`).children(g), 'rivals list')
      expect(offer(g, again, 'report').disabledReason?.(g)).toMatch(/already/i)
      const text = renderAll(g, a).join('\n')
      const cash2 = g.character.money
      const keep = JSON.stringify(readKnow(g))
      report.run(g, '')
      offer(g, again, 'report').run(g, '')
      expect(g.character.money).toBe(cash2)
      expect(JSON.stringify(readKnow(g))).toBe(keep)
      expect(renderAll(g, a).join('\n')).toBe(text)
      expect(width()).toBe(after)
    })
  })

  it('a source reads the same rows another year, and a new year is a new purchase', () => {
    const { g, a } = setup('software', 'us', 2015, 5, [])
    inFog(() => {
      offer(g, lastLook(g, screen(g, a, `biz.mkt.rivals.${a.id}`).children(g), 'rivals list'), 'report').run(g, '')
      nextYear(g)
      const look = lastLook(g, screen(g, a, `biz.mkt.rivals.${a.id}`).children(g), 'rivals list')
      expect(offer(g, look, 'report').disabledReason?.(g)).toBeNull()
    })
  })

  it('an illegal source is listed with its risk, asks first, and adds heat; a legal one asks nothing', () => {
    const { g, a } = setup('software', 'us', 2015, 5, [])
    inFog(() => {
      const look = lastLook(g, screen(g, a, `biz.mkt.rivals.${a.id}`).children(g), 'rivals list')
      const informant = offer(g, look, 'informant')
      expect(informant.confirm?.(g)).toBe(ILLEGAL_CONFIRM)
      expect(informant.subtitle).toBeTruthy()
      expect(offer(g, look, 'report').confirm).toBeUndefined()
      expect(readKnow(g)?.h ?? 0).toBe(0)
      informant.run(g, '')
      expect(readKnow(g)?.h ?? 0).toBeGreaterThan(0)
      expect(Object.keys(readKnow(g)!.k).length).toBeGreaterThan(0)
    })
  })

  it('a source that does not exist yet is listed and blocked, with the reason', () => {
    const { g, a } = setup('semiconductor', 'us', 1985, 11, [])
    inFog(() => {
      const look = lastLook(g, screen(g, a, `biz.mkt.rivals.${a.id}`).children(g), 'rivals list')
      const hacker = offer(g, look, 'hacker')
      expect(hacker.disabledReason?.(g)).toBeTruthy()
      const before = g.character.money
      hacker.run(g, '')
      expect(g.character.money).toBe(before)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------
describe('building the screens with Look closer rows leaves the state and the dice alone', () => {
  for (const [ind, cid, year, seed] of LIVES) {
    it(`${ind}: twice equal, nothing written, a frozen state works, and the text has no holes`, () => {
      const { g, a } = setup(ind, cid, year, seed)
      inFog(() => {
        const before = JSON.stringify(g)
        const rng = JSON.stringify(g.rng)
        const one = renderAll(g, a)
        const two = renderAll(g, a)
        expect(two).toEqual(one)
        expect(JSON.stringify(g)).toBe(before)
        expect(JSON.stringify(g.rng)).toBe(rng)
        expect(one.join('\n')).toContain('Look closer')
        expect(one.join('\n')).not.toMatch(/NaN|undefined|Infinity|\[object/)
        expect(renderAll(deepFreeze(structuredClone(g)), a)).toEqual(one)
      })
    })
  }
})
