// Silicon 2.0: the Chips & Fabs rows (goodwill, performance, quality, price, share), the lane price actions and
// the pricing policy. Menus only read; every write is re-checked inside run().
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { bestTechPlan, marketReference, siliconOf, techOf, techPlan, techView } from '../src/game/business/deeptech-core'
import { laneRow } from '../src/game/business/deeptech-menu'
import type { TechState } from '../src/game/business/deeptech-state'
import { rivalPriceIndex } from '../src/game/business/silicon'
import { CHIP_LANES, laneById } from '../src/game/business/silicon-data'
import { goodwillBand, laneSubtitle, policySubtitle, siliconRows } from '../src/game/business/silicon-text'
import { bizOf } from '../src/game/business/state'
import { runScript } from '../src/game/scripts'
import type { AnnualReportData, GameState, MenuNode, NoticeModal } from '../src/game/types'
import { adultIn } from './deeptech-kit'
import { act, chipLab, company, menuText, type Lab } from './silicon-kit'

const AI_CHIP = ['firstChip', 'volume', 'aiChip']
const BAD = /NaN|undefined|\[object|Infinity/
const EM_DASH = String.fromCharCode(0x2014)

function find(g: GameState, nodes: MenuNode[], id: string): MenuNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu') {
      const hit = find(g, n.children(g), id)
      if (hit) return hit
    }
  }
  return undefined
}

const live = (L: Lab) => ({ b: bizOf(L.g, L.a), t: techView(bizOf(L.g, L.a)) })
const sub = (L: Lab, id: string): string => {
  const s = act(L.g, L.a, id).subtitle
  return typeof s === 'function' ? s(L.g) : s ?? ''
}
const notices = (g: GameState): string[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice').map((m) => m.text)
const SILICON = { goodwill: 61, lanes: { accel: 0.2 }, launch: null, ceiling: 0.9, lead: 0, applied: 0, last: null }

describe('the Chips & Fabs rows', () => {
  it('are pure at every stage, year and country, and never more than 14', { timeout: 300_000 }, () => {
    for (const year of [1990, 2010, 2024, 2025, 2027, 2030]) {
      for (const country of ['us', 'jp', 'cn']) {
        for (let stage = 0; stage <= 4; stage++) {
          for (const silicon of [false, true]) {
            const g = adultIn(country, 50_000_000, 3, 95, year)
            const patch: Partial<TechState> = { stage, level: 30 + stage * 12, node: stage, plant: stage >= 2 ? 1 : 0, done: stage >= 2 ? AI_CHIP : [], ...(silicon ? { silicon: { ...SILICON, lanes: { ...SILICON.lanes } } } : {}) }
            const a = company(g, 'semiconductor', patch)
            const tag = `${year} ${country} stage ${stage} silicon ${silicon}`
            const before = JSON.stringify(g)
            const rng = g.rng
            const text = menuText(g, a)
            expect(menuText(g, a), tag).toEqual(text)
            expect(JSON.stringify(g), `${tag}: menus changed the state`).toBe(before)
            expect(g.rng, tag).toBe(rng)
            for (const x of text) expect(x, tag).not.toMatch(BAD)
            const screen = find(g, businessAssetView(g, a), `dt.screen.${a.id}`)
            expect(screen?.type, tag).toBe('menu')
            if (screen?.type === 'menu') expect(screen.children(g).length, tag).toBeLessThanOrEqual(14)
            if (stage < 2) expect(text.join(' '), tag).not.toContain('Goodwill')
            else expect(text.join(' '), tag).toContain('Goodwill')
          }
        }
      }
    }
  })

  it('show goodwill, performance, quality, price and share from stage 2, with the squeeze sentence only in the window', { timeout: 300_000 }, () => {
    const L = chipLab({ year: 2025, patch: { done: AI_CHIP } })
    const { b, t } = live(L)
    const rows = siliconRows(L.g, b, t)
    expect(rows.goodwill).toMatch(/^Goodwill \d+\/100, (angry|cool|neutral|warm|loyal|devoted)\. (It (adds|costs) \d\.\d brand a year\.|It doesn't move brand\.)/)
    expect(rows.goodwill).toContain('Chip supply is tight this year. Buyers notice who charges what.')
    expect(rows.perf).toMatch(/^Performance \d+\. Market \d+, best \d+, rank \d+ of \d+\.$/)
    expect(rows.quality).toMatch(/^Quality \d+\. Market \d+, best \d+, rank \d+ of \d+\.$/)
    expect(rows.price).toMatch(/^Price \d\.\d\dx\. Market \d\.\d\dx, best \d\.\d\dx, rank \d+ of \d+\.$/)
    expect(rows.share).toMatch(/^Share of segment \d+\.\d%\. Market \d+\.\d%, best \d+\.\d%, rank \d+ of \d+\.$/)
    // "best" is the cheapest, so it is never above yours.
    const p = /^Price (\d\.\d\d)x\. Market (\d\.\d\d)x, best (\d\.\d\d)x/.exec(rows.price)!
    expect(Number(p[3])).toBeLessThanOrEqual(Number(p[1]))
    const text = menuText(L.g, L.a)
    for (const line of [rows.goodwill, rows.perf, rows.quality, rows.price, rows.share]) expect(text).toContain(line)
    // The window is 2024 to 2027; no foresight before it and no tail after it.
    for (const [year, tight] of [[2023, false], [2024, true], [2027, true], [2028, false]] as const) {
      const M = chipLab({ year, patch: { done: AI_CHIP } })
      const r = siliconRows(M.g, bizOf(M.g, M.a), techView(bizOf(M.g, M.a)))
      expect(r.goodwill.includes('Chip supply is tight this year.'), `${year}`).toBe(tight)
      expect(r.goodwill, `${year}`).not.toMatch(BAD)
    }
  })

  it('say the market has no figures when there are no rivals, and stay clean', () => {
    const L = chipLab({ year: 1900 })
    const { b, t } = live(L)
    const rows = siliconRows(L.g, b, t)
    for (const key of ['perf', 'quality', 'price', 'share'] as const) {
      expect(rows[key], key).toMatch(/The market has no figures\.$/)
      expect(rows[key], key).not.toMatch(BAD)
    }
    expect(rows.goodwill).not.toMatch(BAD)
  })

  it('name the goodwill bands at their edges', () => {
    const at = (n: number) => goodwillBand(n)
    expect([29, 30, 44, 45, 55, 56, 69, 70, 84, 85].map(at)).toEqual(['angry', 'cool', 'cool', 'neutral', 'neutral', 'warm', 'warm', 'loyal', 'loyal', 'devoted'])
    expect([at(0), at(50), at(100)]).toEqual(['angry', 'neutral', 'devoted'])
  })

  it('give a rival a stable price index by tier, 7% lower while it cuts', () => {
    const r = (id: string, seg?: 'budget' | 'mass' | 'premium' | 'luxury'): Parameters<typeof rivalPriceIndex>[1] => ({ id, seg, quality: 60 })
    const idx = rivalPriceIndex('fam', r('x', 'premium'), 2025)
    expect(rivalPriceIndex('fam', r('x', 'premium'), 2025)).toBe(idx)
    expect(rivalPriceIndex('fam', r('y', 'budget'), 2025)).toBeLessThan(rivalPriceIndex('fam', r('y', 'premium'), 2025))
    expect(rivalPriceIndex('fam', r('x', 'premium'), 2025, true)).toBeCloseTo(idx * 0.93, 10)
    // Within 4% of the tier price, never NaN.
    for (const [seg, tier] of [['budget', 0.85], ['mass', 1], ['premium', 1.12], ['luxury', 1.25]] as const) {
      for (let year = 2020; year < 2040; year++) {
        const v = rivalPriceIndex('fam', r('z', seg), year)
        expect(v).toBeGreaterThanOrEqual(tier * 0.96 - 1e-9)
        expect(v).toBeLessThanOrEqual(tier * 1.04 + 1e-9)
      }
    }
    // With no tier the quality decides: below 46 is budget, 80 and up is luxury.
    expect(rivalPriceIndex('fam', { id: 'q', quality: 30 }, 2025)).toBeLessThan(rivalPriceIndex('fam', { id: 'q', quality: 90 }, 2025))
  })

  it('print a lane and the policy in plain words', () => {
    expect(policySubtitle(0.9)).toBe('Hired CEO prices at most 90% of the market')
    expect(policySubtitle(0)).toBe('Hired CEO plans by profit alone')
    const L = chipLab({ year: 2025, patch: { done: AI_CHIP } })
    const { b, t } = live(L)
    expect(laneSubtitle(L.g, b, t, laneById('accel')!)).toMatch(/^\$[\d,.]+ each, \d\.\d\dx the market, \d+% of your sales$/)
    expect(laneSubtitle(L.g, b, t, laneById('mem')!)).toBe('')                    // no fab: the lane isn't in the plan
  })
})

describe('the lane price action', () => {
  const setup = (): Lab => chipLab({ year: 2025, patch: { done: AI_CHIP } })
  const stored = (L: Lab): number | undefined => live(L).t.silicon?.lanes.accel

  it('stores a discount in steps of 5, clamped to 0 to 50, and tells the owner the new price', () => {
    const L = setup()
    const row = act(L.g, L.a, 'dt.lane.accel')
    expect(row.label).toBe('Price: Data-center accelerators')
    expect(sub(L, 'dt.lane.accel')).toMatch(/ each, \d\.\d\dx the market, \d+% of your sales$/)
    expect(row.disabledReason?.(L.g)).toBeNull()
    expect(row.input).toMatchObject({ kind: 'slider', label: 'Discount on accelerators', unit: '%', min: 0, max: 50, step: 5 })
    row.run(L.g, '30')
    expect(stored(L)).toBe(0.3)
    expect(notices(L.g)).toHaveLength(1)
    expect(notices(L.g)[0]).toMatch(/^Data-center accelerators priced at .+, \d\.\d\dx the market\.$/)
    expect(row.input?.defaultValue?.(L.g)).toBe('30')
    row.run(L.g, '999')
    expect(stored(L)).toBe(0.5)
    row.run(L.g, '33')
    expect(stored(L)).toBe(0.35)
    row.run(L.g, '-5')
    expect(stored(L)).toBeUndefined()
    row.run(L.g, '30')
    const before = JSON.stringify(L.g)
    row.run(L.g, 'abc')
    row.run(L.g, '')
    row.run(L.g)
    expect(JSON.stringify(L.g)).toBe(before)
    expect(stored(L)).toBe(0.3)
  })

  it('moves the price the row reports, and writes no dice', () => {
    const L = setup()
    const row = act(L.g, L.a, 'dt.lane.accel')
    const rng = JSON.stringify(L.g.rng)
    const idx = (): number => Number(/, (\d\.\d\d)x the market/.exec(sub(L, 'dt.lane.accel'))![1])
    const at0 = idx()
    row.run(L.g, '30')
    expect(idx()).toBeLessThan(at0)
    expect(JSON.stringify(L.g.rng)).toBe(rng)
  })

  it('leaves no silicon state behind for a zero discount nobody asked for', () => {
    const L = setup()
    expect(L.t.silicon).toBeUndefined()
    act(L.g, L.a, 'dt.lane.accel').run(L.g, '0')
    expect((bizOf(L.g, L.a).tech as { silicon?: unknown }).silicon).toBeUndefined()
  })

  it('has no row for a closed lane, and the action does nothing on one (Review Focus 2)', () => {
    const L = chipLab({ year: 2025, patch: { done: AI_CHIP, plant: 0, silicon: { ...SILICON, lanes: { mem: 0.3 } } } })
    expect(() => act(L.g, L.a, 'dt.lane.mem')).toThrow()
    const row = laneRow(L.a, laneById('mem')!)
    expect(row.disabledReason?.(L.g)).toBeTruthy()
    const before = JSON.stringify(L.g)
    row.run(L.g, '10')
    expect(JSON.stringify(L.g)).toBe(before)
    expect(notices(L.g)).toHaveLength(0)
  })

  it('does nothing when the fab goes away after the menu was built', () => {
    const L = chipLab({ year: 2025, patch: { done: AI_CHIP, plant: 1 } })
    const row = laneRow(L.a, laneById('mem')!)
    expect(row.disabledReason?.(L.g)).toBeNull()
    expect(act(L.g, L.a, 'dt.lane.mem').id).toBe(row.id)
    expect(techView(bizOf(L.g, L.a)).plant).toBe(1)
    techOf(bizOf(L.g, L.a)).plant = 0
    const before = JSON.stringify(L.g)
    row.run(L.g, '20')
    expect(JSON.stringify(L.g)).toBe(before)
  })

  it('is refused for a minor or a dead owner, and nothing changes', () => {
    for (const lock of [(g: GameState) => { g.character.age = 16 }, (g: GameState) => { g.character.alive = false }]) {
      const L = setup()
      const row = act(L.g, L.a, 'dt.lane.accel')
      lock(L.g)
      expect(row.disabledReason?.(L.g)).toBeTruthy()
      const before = JSON.stringify(L.g)
      row.run(L.g, '30')
      expect(JSON.stringify(L.g)).toBe(before)
    }
  })

  it('shows one row for each open extra lane and never for core', () => {
    const open = chipLab({ year: 2025, patch: { done: AI_CHIP, plant: 1 } })
    for (const lane of CHIP_LANES) {
      const there = (() => { try { act(open.g, open.a, `dt.lane.${lane.id}`); return true } catch { return false } })()
      expect(there, lane.id).toBe(lane.id !== 'core')
    }
  })
})

describe('the pricing policy action', () => {
  const setup = (): Lab => chipLab({ year: 2025, patch: { done: AI_CHIP } })
  const ceiling = (L: Lab): number => live(L).t.silicon?.ceiling ?? 0

  it('stores a cap in steps of 5, clamped to 70 to 130, and 130 means none', () => {
    const L = setup()
    const row = act(L.g, L.a, 'dt.policy')
    expect(row.label).toBe('Pricing Policy')
    expect(row.input).toMatchObject({ kind: 'slider', label: 'Highest price for a hired CEO (% of the market)', unit: '%', min: 70, max: 130, step: 5 })
    expect(row.input?.defaultValue?.(L.g)).toBe('130')
    expect(sub(L, 'dt.policy')).toBe('Hired CEO plans by profit alone')
    row.run(L.g, '90')
    expect(ceiling(L)).toBe(0.9)
    expect(notices(L.g)).toEqual(["Your hired CEO will price at most 90% of the market. You're not bound by it."])
    expect(sub(L, 'dt.policy')).toBe('Hired CEO prices at most 90% of the market')
    expect(row.input?.defaultValue?.(L.g)).toBe('90')
    row.run(L.g, '50')
    expect(ceiling(L)).toBe(0.7)
    row.run(L.g, '88')
    expect(ceiling(L)).toBe(0.9)
    row.run(L.g, '130')
    expect(ceiling(L)).toBe(0)
    expect(notices(L.g).at(-1)).toBe('No pricing limit. Your hired CEO plans by profit alone.')
    row.run(L.g, '90')
    const before = JSON.stringify(L.g)
    row.run(L.g, 'abc')
    row.run(L.g, '')
    row.run(L.g)
    expect(JSON.stringify(L.g)).toBe(before)
    expect(ceiling(L)).toBe(0.9)
  })

  it('opens its slider inside the range even when a saved cap sits under it', () => {
    const L = setup()
    siliconOf(techOf(bizOf(L.g, L.a))).ceiling = 0.6
    expect(act(L.g, L.a, 'dt.policy').input?.defaultValue?.(L.g)).toBe('70')
  })

  it('is refused for a minor or a dead owner, and nothing changes', () => {
    for (const lock of [(g: GameState) => { g.character.age = 16 }, (g: GameState) => { g.character.alive = false }]) {
      const L = setup()
      const row = act(L.g, L.a, 'dt.policy')
      lock(L.g)
      expect(row.disabledReason?.(L.g)).toBeTruthy()
      const before = JSON.stringify(L.g)
      row.run(L.g, '90')
      expect(JSON.stringify(L.g)).toBe(before)
    }
  })

  it("doesn't bind the owner: a higher price typed into the Annual Report is set (Review Focus 4)", () => {
    const L = setup()
    siliconOf(techOf(bizOf(L.g, L.a))).ceiling = 0.6
    L.g.queue = []
    act(L.g, L.a, 'biz.plan').run(L.g)
    const modal = L.g.queue.find((m) => m.kind === 'minigame')
    expect(modal?.kind).toBe('minigame')
    if (modal?.kind !== 'minigame') return
    const data = modal.data as unknown as AnnualReportData
    const b = bizOf(L.g, L.a)
    const ref = marketReference(L.g, b, techView(b), laneById('core')!, L.g.year)
    const limit = bestTechPlan(L.g, b, techView(b)).limit!
    expect(limit).toBeLessThan(data.suggestedPrice)
    expect(data.suggestedPrice).toBeGreaterThan(0.6 * ref)
    runScript(L.g, modal.scriptId, JSON.stringify({ price: data.suggestedPrice, production: data.production }), modal.data, modal)
    expect(bizOf(L.g, L.a).price).toBe(data.suggestedPrice)
    expect(techPlan(L.g, bizOf(L.g, L.a), techView(bizOf(L.g, L.a)), L.g.year).price).toBe(data.suggestedPrice)
  })
})

describe('the new text', () => {
  it('stays inside the voice caps and has no em-dash', { timeout: 300_000 }, () => {
    const L = chipLab({ year: 2025, patch: { done: AI_CHIP, plant: 1 } })
    const rows = siliconRows(L.g, bizOf(L.g, L.a), techView(bizOf(L.g, L.a)))
    for (const [k, v] of Object.entries(rows)) {
      expect(v.length, k).toBeLessThanOrEqual(180)
      expect(v.includes(EM_DASH), k).toBe(false)
    }
    for (const lane of CHIP_LANES.filter((l) => l.id !== 'core')) {
      const row = act(L.g, L.a, `dt.lane.${lane.id}`)
      row.run(L.g, '30')
      const s = typeof row.subtitle === 'function' ? row.subtitle(L.g) : row.subtitle ?? ''
      for (const x of [s, row.label, row.input?.label ?? '']) {
        expect(x.length, x).toBeLessThanOrEqual(180)
        expect(x.includes(EM_DASH)).toBe(false)
      }
    }
    act(L.g, L.a, 'dt.policy').run(L.g, '90')
    act(L.g, L.a, 'dt.policy').run(L.g, '130')
    const said = notices(L.g)
    expect(said.length).toBe(6)
    for (const x of said) {
      expect(x.length, x).toBeLessThanOrEqual(120)
      expect(x.includes(EM_DASH)).toBe(false)
      expect(x).not.toMatch(BAD)
    }
    for (const x of menuText(L.g, L.a)) expect(x.includes(EM_DASH)).toBe(false)
  })
})
