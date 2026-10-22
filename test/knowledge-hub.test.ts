// R3-H5 (H.2): Look closer and the Intelligence Briefing hub.
//
//   lookCloser   a group a Fog screen puts at the end of its list: one action per source that can sharpen the keys of the screen, each
//                with its price and how far it sharpens, greyed out with the reason when it cannot be bought. Null in Exact mode, when
//                no key has an owner, and when every offer is blocked.
//   the hub      `intel.briefing`: what the player has researched (stalest first, at most 12 rows and a "N more"), a Refresh for each,
//                the standing orders dial (a slider, 0 to 3, with a live caption) and the heat in words. Hidden in a default life and in
//                Exact mode; the dial and the heat keep it visible in Exact so they can be cancelled.
//
// Every read is pure: the menus are rendered under deepFreeze. The suite runs in Exact (test/setup-exact.ts); every Realistic case
// goes through inFog (test/knowledge-kit.ts).
import { describe, expect, it } from 'vitest'
import { checkLedger } from '../src/game/kernel/ledger'
import { getModule, menuEntries } from '../src/game/kernel/registry'
import { collectMenu } from '../src/game/kernel/registry'
import { MODULES } from '../src/game/modules'
import { intelBriefingMenu, learn, lookCloser, readKnow } from '../src/game/knowledge/contract'
import { buyIntel } from '../src/game/knowledge/intel'
import { overrideKeyKind } from '../src/game/knowledge/kinds'
import { DIAL_MAX } from '../src/game/knowledge/rows'
import { setDial } from '../src/game/knowledge/standing'
import { assetsMenu } from '../src/game/menus'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../src/game/types'
import { FailureLog, renderAll } from './fuzz-kit'
import { deepFreeze, inFog } from './knowledge-kit'
import { makeTestGame } from './helpers'
import { flowTotal } from './ledger-kit'

const TRUTH = new Map<string, number>()
for (const kind of ['mkt', 'riv', 'cand']) {
  overrideKeyKind({
    kind,
    label: (_g, key) => `Number ${key.split(':')[1]}`,
    truth: (_g, key) => TRUTH.get(key) ?? null,
    scope: () => ({ tier: 1, country: 'us' }),
  })
}
const MKT = (i: number): string => `mkt:c${String(i).padStart(3, '0')}:size`
const RIV = (i: number): string => `riv:r${String(i).padStart(3, '0')}:quality`
for (let i = 0; i < 40; i++) {
  TRUTH.set(MKT(i), 2e6 * (1 + (i % 17)) * 1.37 ** (i % 5))
  TRUTH.set(RIV(i), 20 + ((i * 7) % 60))
  TRUTH.set(`cand:k${i}:skill`, 30 + ((i * 5) % 50))
}

function life(over: { money?: number; year?: number; lifeId?: string } = {}): GameState {
  const g = makeTestGame(1, { age: 40, money: over.money ?? 5_000_000 })
  if (over.year) g.year = over.year
  if (over.lifeId) g.lifeId = over.lifeId
  return g
}

const keysOf = (n: number, f: (i: number) => string = MKT, from = 0): string[] => Array.from({ length: n }, (_, i) => f(from + i))
const actions = (nodes: readonly MenuNode[]): MenuAction[] => nodes.filter((n): n is MenuAction => n.type === 'action')
const infos = (nodes: readonly MenuNode[]): MenuInfo[] => nodes.filter((n): n is MenuInfo => n.type === 'info')
const textOf = (n: MenuInfo, g: GameState): string => (typeof n.text === 'function' ? n.text(g) : n.text)
const hubRows = (g: GameState): MenuNode[] => intelBriefingMenu.children(g)
const shown = (g: GameState): boolean => (intelBriefingMenu.visible ? intelBriefingMenu.visible(g) : true)
const row = (g: GameState, key: string) => readKnow(g)?.k[key] ?? null

describe('lookCloser: one row per source that can sharpen the keys', () => {
  it('is null in Exact mode, with no key an owner reads, with no keys, and for keys that do not parse', () => {
    const g = life()
    expect(lookCloser(g, { id: 'market', keys: keysOf(3) })).toBeNull() // Exact (the suite default)
    inFog(() => {
      expect(lookCloser(g, { id: 'market', keys: ['val:a:value'] })).toBeNull() // no owner for `val`
      expect(lookCloser(g, { id: 'market', keys: [] })).toBeNull()
      expect(lookCloser(g, { id: 'market', keys: ['nonsense'] })).toBeNull()
      expect(lookCloser(g, { id: 'market', keys: 'mkt:c001:size' as unknown as string[] })).toBeNull()
    })
  })

  it('is a "Look closer" group with an action per offer, a price and the sharpening in the subtitle', () => {
    const g = life()
    const grp = inFog(() => lookCloser(g, { id: 'market', keys: keysOf(3) }))
    expect(grp).not.toBeNull()
    expect(grp!.type).toBe('menu')
    expect(grp!.id).toBe('look.market')
    expect(grp!.label).toBe('Look closer')
    expect(grp!.emoji).toBe('\u{1F50E}')
    const kids = inFog(() => actions(grp!.children(g)))
    expect(kids.length).toBeGreaterThanOrEqual(5)
    for (const k of kids) {
      const sub = typeof k.subtitle === 'function' ? k.subtitle(g) : (k.subtitle ?? '')
      expect(sub, k.id).toMatch(/^(Free|\S+) · (sharpens ±\d+% to ±\d+%|stays at ±\d+%)$/)
      expect(sub.length, k.id).toBeLessThanOrEqual(70)
      expect(k.id.startsWith('look.market.')).toBe(true)
    }
    const press = kids.find((k) => k.id === 'look.market.press')!
    expect(press.label).toBe('A year of the trade press')
    // the press reads at 30%, and a market is guessed at 25% to begin with: it cannot sharpen what you already see
    expect(typeof press.subtitle === 'function' ? press.subtitle(g) : press.subtitle).toBe('$1,200 · stays at ±25%')
    const report = kids.find((k) => k.id === 'look.market.report')!
    expect(typeof report.subtitle === 'function' ? report.subtitle(g) : report.subtitle).toBe('$9,000 · sharpens ±25% to ±18%')
    // the offers a market can use: not the ones that read people only
    expect(kids.some((k) => k.id === 'look.market.investigator')).toBe(false)
    expect(kids.some((k) => k.id === 'look.market.diligence')).toBe(false)
  })

  it('asks before an illegal source, and says nothing of the kind for a legal one', () => {
    const g = life()
    const kids = inFog(() => actions(lookCloser(g, { id: 'market', keys: keysOf(3) })!.children(g)))
    const informant = kids.find((k) => k.id === 'look.market.informant')!
    expect(informant.confirm).toBeTypeOf('function')
    expect(informant.confirm!(g)).toBe("It's illegal. If it comes out, expect trouble.")
    for (const k of kids.filter((x) => x.id !== 'look.market.informant' && x.id !== 'look.market.hacker')) expect(k.confirm, k.id).toBeUndefined()
  })

  it('greys out what cannot be bought, with the reason, and the run does nothing then', () => {
    const g = life({ money: 500 })
    const kids = inFog(() => actions(lookCloser(g, { id: 'market', keys: keysOf(3) })!.children(g)))
    const report = kids.find((k) => k.id === 'look.market.report')!
    expect(report.disabledReason!(g)).toBe("You can't afford that.")
    const own = kids.find((k) => k.id === 'look.market.own')!
    expect(own.disabledReason!(g)).toBeNull()
    const json = JSON.stringify(g)
    inFog(() => report.run(g))
    expect(JSON.stringify(g)).toBe(json)
  })

  it('is null once every offer is blocked (nothing left to buy this year)', () => {
    const g = life()
    inFog(() => buyIntel(g, 'own', [MKT(1)]))
    g.character.money = 0
    // the free homework was done for this key, and nothing else can be paid for
    expect(inFog(() => lookCloser(g, { id: 'one', keys: [MKT(1)] }))).toBeNull()
    // another key still has the free read open
    expect(inFog(() => lookCloser(g, { id: 'two', keys: [MKT(2)] }))).not.toBeNull()
  })

  it('a run buys: the fee is booked once, the reading is kept and the row says it was read', () => {
    const g = life()
    const keys = keysOf(3)
    const cash = g.character.money
    const grp = inFog(() => lookCloser(g, { id: 'market', keys }))!
    const report = actions(inFog(() => grp.children(g))).find((k) => k.id === 'look.market.report')!
    expect(report.stayOpen).toBe(true)
    inFog(() => report.run(g))
    expect(cash - g.character.money).toBeGreaterThan(0)
    for (const key of keys) expect(row(g, key)!.src).toBe('report')
    expect(flowTotal(g, 'intel', 'pool')).toBe(cash - g.character.money)
    expect(checkLedger(g).ok).toBe(true)
    // the same row now says why not
    const again = actions(inFog(() => grp.children(g))).find((k) => k.id === 'look.market.report')!
    expect(again.disabledReason!(g)).toBe("You already have this year's reading.")
    const json = JSON.stringify(g)
    inFog(() => again.run(g))
    expect(JSON.stringify(g)).toBe(json)
  })

  it('reads of the screen are pure: nothing is written or drawn, even on a frozen state', () => {
    const g = life()
    inFog(() => buyIntel(g, 'press', keysOf(2)))
    const json = JSON.stringify(g)
    const rng = g.rng
    deepFreeze(g)
    const grp = inFog(() => lookCloser(g, { id: 'market', keys: keysOf(3) }))!
    inFog(() => grp.children(g))
    inFog(() => actions(grp.children(g)).forEach((a) => a.disabledReason?.(g)))
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
  })
})

describe('the Briefing hub: what you know, how fresh, what you pay to keep it so', () => {
  it('is a group `intel.briefing`, hidden in a default life and in Exact mode', () => {
    const g = life()
    expect(intelBriefingMenu.type).toBe('menu')
    expect(intelBriefingMenu.id).toBe('intel.briefing')
    expect(inFog(() => shown(g))).toBe(false) // no record
    inFog(() => buyIntel(g, 'report', keysOf(2)))
    expect(inFog(() => shown(g))).toBe(true)
    expect(shown(g)).toBe(false) // Exact hides the rows of a record
  })

  it('stays visible in Exact mode while the dial or the heat is above 0, so they can be cancelled', () => {
    const dial = life()
    inFog(() => buyIntel(dial, 'report', keysOf(1)))
    setDial(dial, 2)
    expect(shown(dial)).toBe(true)
    setDial(dial, 0)
    expect(shown(dial)).toBe(false)

    const heat = life()
    inFog(() => buyIntel(heat, 'informant', keysOf(1)))
    expect(readKnow(heat)!.h).toBe(3)
    expect(shown(heat)).toBe(true)
    const kids = hubRows(heat)
    expect(infos(kids).some((n) => n.id === 'intel.heat')).toBe(true)
    // Exact lists no estimate rows (they are shown as they are elsewhere)
    expect(kids.some((n) => n.id.startsWith('intel.row.'))).toBe(false)
  })

  it('lists one info row per stored estimate, stalest first, with the chip and "as of" in fog', () => {
    const g = life({ year: 2020 })
    inFog(() => buyIntel(g, 'report', [MKT(1)]))
    g.year = 2023
    inFog(() => buyIntel(g, 'press', [MKT(2)]))
    g.year = 2025
    inFog(() => buyIntel(g, 'analyst', [MKT(3)]))
    g.year = 2026
    const kids = inFog(() => hubRows(g))
    const rows = infos(kids).filter((n) => n.id.startsWith('intel.row.'))
    expect(rows.map((n) => n.id)).toEqual([`intel.row.${MKT(1)}`, `intel.row.${MKT(2)}`, `intel.row.${MKT(3)}`])
    // conf from the sd the aged reading shows now, the year only at 2 years or more
    expect(rows[0]!.asOf).toBe(2020)
    expect(rows[1]!.asOf).toBe(2023)
    expect(rows[2]!.asOf).toBeUndefined()
    expect(rows[2]!.conf).toBe(2)
    expect(rows[0]!.conf).toBeLessThan(rows[2]!.conf!)
    expect(textOf(rows[0]!, g)).toMatch(/^Number c001: /)
    // the headings and the standing orders come with it
    expect(kids.some((n) => n.type === 'action' && n.id === 'intel.orders')).toBe(true)
  })

  it('buying changes the row: more confidence, a new year, no "as of" when fresh', () => {
    const g = life({ year: 2022 })
    inFog(() => buyIntel(g, 'press', [MKT(1)]))
    g.year = 2026
    const before = infos(inFog(() => hubRows(g))).find((n) => n.id === `intel.row.${MKT(1)}`)!
    expect(before.conf).toBe(0)
    expect(before.asOf).toBe(2022)
    inFog(() => buyIntel(g, 'analyst', [MKT(1)]))
    const after = infos(inFog(() => hubRows(g))).find((n) => n.id === `intel.row.${MKT(1)}`)!
    expect(after.conf).toBe(2)
    expect(after.asOf).toBeUndefined()
    expect(textOf(after, g)).not.toBe(textOf(before, g))
  })

  it('shows at most 12 rows and a "N more" row', () => {
    const g = life()
    for (let i = 0; i < 30; i += 10) inFog(() => buyIntel(g, 'report', keysOf(10, MKT, i)))
    const kids = inFog(() => hubRows(g))
    expect(infos(kids).filter((n) => n.id.startsWith('intel.row.'))).toHaveLength(12)
    const more = infos(kids).find((n) => n.id === 'intel.more')!
    expect(textOf(more, g)).toBe('18 more.')
  })

  it('Refresh is the cheapest legal offer that is open: the free homework first, and once a year', () => {
    const g = life({ year: 2024 })
    inFog(() => buyIntel(g, 'report', [MKT(1)]))
    g.year = 2026
    const cash = g.character.money
    const refresh = actions(inFog(() => hubRows(g))).find((n) => n.id === `intel.refresh.${MKT(1)}`)!
    expect(refresh.stayOpen).toBe(true)
    expect(refresh.disabledReason!(g)).toBeNull()
    const sub = typeof refresh.subtitle === 'function' ? refresh.subtitle(g) : (refresh.subtitle ?? '')
    expect(sub).toMatch(/^Do the homework yourself · Free · sharpens ±\d+% to ±\d+%$/)
    inFog(() => refresh.run(g))
    expect(g.character.money).toBe(cash) // the homework takes time, not cash
    expect(row(g, MKT(1))!.y).toBe(2026)
    expect(row(g, MKT(1))!.src).toBe('own')
    // a row that is fresh this year has nothing to refresh, and a click does nothing
    const json = JSON.stringify(g)
    const again = actions(inFog(() => hubRows(g))).find((n) => n.id === `intel.refresh.${MKT(1)}`)!
    expect(again.disabledReason!(g)).toBe('Already fresh this year.')
    inFog(() => again.run(g))
    inFog(() => refresh.run(g))
    expect(JSON.stringify(g)).toBe(json)
  })

  it('Refresh pays the fee once through the ledger when the free read is used up', () => {
    const g = life({ year: 2024 })
    inFog(() => buyIntel(g, 'report', [MKT(1)]))
    g.year = 2026
    g.yearActions = {}
    for (let i = 0; i < 3; i++) inFog(() => buyIntel(g, 'own', [MKT(20 + i)]))
    expect(g.yearActions['intel.own']).toBe(3)
    const cash = g.character.money
    const refresh = actions(inFog(() => hubRows(g))).find((n) => n.id === `intel.refresh.${MKT(1)}`)!
    inFog(() => refresh.run(g))
    const paid = cash - g.character.money
    expect(paid).toBe(1_200)
    expect(flowTotal(g, 'intel', 'pool')).toBeGreaterThanOrEqual(1_200)
    expect(row(g, MKT(1))!.src).toBe('press')
    expect(checkLedger(g).ok).toBe(true)
    const again = actions(inFog(() => hubRows(g))).find((n) => n.id === `intel.refresh.${MKT(1)}`)!
    const after = g.character.money
    inFog(() => again.run(g))
    expect(g.character.money).toBe(after)
  })

  it('Refresh never picks an illegal source by itself', () => {
    const g = life({ year: 2024 })
    inFog(() => buyIntel(g, 'report', [RIV(1)]))
    g.year = 2026
    g.yearActions = { 'intel.own': 3 }
    g.character.money = 7_000 // enough for an informant (6,000) and the press (1,200), not the report
    const refresh = actions(inFog(() => hubRows(g))).find((n) => n.id === `intel.refresh.${RIV(1)}`)!
    inFog(() => refresh.run(g))
    expect(readKnow(g)!.h).toBeUndefined()
    expect(g.character.money).toBe(7_000 - 1_200)
  })

  it('has no Refresh for a key nobody can read (no owner), and none for a key with nothing to read now', () => {
    const g = life()
    inFog(() => buyIntel(g, 'report', [MKT(1)]))
    learn(g, 'val:a1:value', { mid: 1e6, sd: 0.2, src: 'press' }) // a reading kept from before an owner went away
    TRUTH.delete(MKT(1))
    try {
      const kids = inFog(() => hubRows(g))
      expect(actions(kids).some((n) => n.id === 'intel.refresh.val:a1:value')).toBe(false)
      const r = actions(kids).find((n) => n.id === `intel.refresh.${MKT(1)}`)
      // nothing to read: either no row or a greyed one, but never a live purchase
      if (r) expect(r.disabledReason!(g)).not.toBeNull()
    } finally {
      TRUTH.set(MKT(1), 2e6 * 2 * 1.37)
    }
  })

  it('shows the heat in words, never as a number, and nothing without heat', () => {
    const g = life()
    inFog(() => buyIntel(g, 'report', [MKT(1)]))
    expect(infos(inFog(() => hubRows(g))).some((n) => n.id === 'intel.heat')).toBe(false)
    inFog(() => buyIntel(g, 'informant', [MKT(2)]))
    const calm = textOf(infos(inFog(() => hubRows(g))).find((n) => n.id === 'intel.heat')!, g)
    expect(calm).not.toMatch(/\d/)
    inFog(() => buyIntel(g, 'hacker', [RIV(1)]))
    const hot = textOf(infos(inFog(() => hubRows(g))).find((n) => n.id === 'intel.heat')!, g)
    expect(hot).not.toMatch(/\d/)
    expect(hot).not.toBe(calm)
  })

  it('standing orders: a slider from 0 to 3 with a live caption, and the run sets the dial', () => {
    const g = life()
    inFog(() => buyIntel(g, 'report', keysOf(4)))
    const orders = actions(inFog(() => hubRows(g))).find((n) => n.id === 'intel.orders')!
    expect(orders.input!.kind).toBe('slider')
    expect(orders.input!.min).toBe(0)
    expect(orders.input!.max).toBe(DIAL_MAX)
    expect(DIAL_MAX).toBe(3)
    expect(orders.input!.step).toBe(1)
    expect(orders.stayOpen).toBe(true)
    expect(orders.input!.defaultValue!(g)).toBe('0')
    const caps = [0, 1, 2, 3].map((v) => inFog(() => orders.input!.preview!(g, v)))
    expect(caps[0]).toMatch(/no standing orders/i)
    expect(caps[1]).toMatch(/press/i)
    expect(caps[2]).toMatch(/analyst/i)
    expect(caps[3]).toMatch(/desk/i)
    for (const c of caps.slice(1)) expect(c).toMatch(/a year/)
    expect(new Set(caps).size).toBe(4)
    inFog(() => orders.run(g, '2'))
    expect(readKnow(g)!.d).toBe(2)
    expect(orders.input!.defaultValue!(g)).toBe('2')
    inFog(() => orders.run(g, '0'))
    expect(readKnow(g)!.d).toBeUndefined()
    inFog(() => orders.run(g, 'junk'))
    expect(readKnow(g)!.d).toBeUndefined()
    inFog(() => orders.run(g, '9'))
    expect(readKnow(g)!.d).toBe(3)
  })

  it('the caption fee is the scope, not the wealth: equal at 1x and 100x cash', () => {
    const caption = (money: number, level: number): string => {
      const g = life({ money })
      inFog(() => buyIntel(g, 'report', keysOf(4)))
      g.character.money = money
      const orders = actions(inFog(() => hubRows(g))).find((n) => n.id === 'intel.orders')!
      return inFog(() => orders.input!.preview!(g, level))
    }
    for (const level of [1, 2, 3]) expect(caption(5e6, level)).toBe(caption(5e8, level))
  })
})

describe('rendering', () => {
  it('every menu of a fog life with a record, orders and heat renders on a deep-frozen state without a failure', () => {
    const g = life({ year: 2024 })
    inFog(() => buyIntel(g, 'report', keysOf(8)))
    inFog(() => buyIntel(g, 'informant', keysOf(2)))
    setDial(g, 3)
    g.year = 2026
    const log = new FailureLog()
    const before = JSON.stringify(g)
    const seen = inFog(() => renderAll(g, log, 4))
    expect(log.list().map((f) => f.first.message)).toEqual([])
    expect(JSON.stringify(g)).toBe(before)
    // the walk really went into the hub: it saw its enabled actions (a Refresh for each of the 8 rows that is not fresh, and the dial)
    const bare = structuredClone(g)
    delete bare.flags.know
    const seenBare = inFog(() => renderAll(bare, new FailureLog(), 4))
    expect(seen - seenBare, `${seen} against ${seenBare}`).toBeGreaterThanOrEqual(9)
  })

  it('the hub sits in the Assets tab between the money team and banking', () => {
    const g = life()
    inFog(() => buyIntel(g, 'report', keysOf(2)))
    const ids = inFog(() => assetsMenu.children(g)).map((n) => n.id)
    const at = ids.indexOf('intel.briefing')
    expect(at).toBeGreaterThan(0)
    expect(ids[at - 1]).toBe('money-team')
  })
})

describe('the module', () => {
  it('registers as knowledge.core: a close-phase yearly step at 20 and the hub in assets.money at 45', () => {
    const def = getModule('knowledge.core')!
    expect(def).toBeDefined()
    expect(def.layer).toBe(3)
    expect(def.yearly).toEqual([{ seam: 'aging', phase: 'close', order: 20, run: expect.any(Function) }])
    expect(def.menus).toEqual([{ path: 'assets.money', order: 45, build: expect.any(Function) }])
    expect(menuEntries('assets.money').map((e) => e.order)).toEqual([10, 20, 30, 40, 45, 50, 60])
    const nodes = collectMenu('assets.money', life())
    expect(nodes.some((n) => n.id === 'intel.briefing')).toBe(true)
  })

  it('MODULES lists it first, the ids ascend and are unique', () => {
    const ids = MODULES.map((m) => m.id)
    expect(ids[0]).toBe('knowledge.core')
    for (let i = 1; i < ids.length; i++) expect(ids[i - 1]! < ids[i]!, `${ids[i - 1]} before ${ids[i]}`).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    const g: MenuGroup = intelBriefingMenu
    expect(g.label).toBe('Intelligence Briefing')
  })
})
