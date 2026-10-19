// Ecosystem companies: the Devices & Chips screen. It follows Products for device companies only, holds at most 12 rows in every
// year (RF4), says what is true about the chips, the platform and each kind's specs, and never writes state or draws a number.
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { marketOfBiz, saveMarket } from '../src/game/business/competition'
import { chipBook, chipTerms, HARDWARE_FAMILIES, OS_FAMILY, OS_PULL_CAP, type ChipSupply } from '../src/game/business/devices-data'
import { devicesMenu } from '../src/game/business/devices-menu'
import { specLines, specSheet } from '../src/game/business/devices-specs'
import { marketCtxFor } from '../src/game/business/economy'
import { buildFabAction } from '../src/game/business/manage'
import { demandLevel } from '../src/game/business/product-data'
import { bizOf, type Product, type Statement } from '../src/game/business/state'
import { aPct, money } from '../src/game/business/util'
import type { Asset, GameState, MenuNode } from '../src/game/types'
import { adult, allNodes, company } from './market-kit'

const devices = (seed = 5, year = 2026, country = 'us') => {
  const g = adult(seed, year, country)
  const a = company(g, 'devices', { cash: 5e9 })
  return { g, a, b: bizOf(g, a) }
}

const core = (family: string, launched: number, quality = 60): Product => ({ name: family, launched, boost: 0, quality, family, kind: 'core' })

const infoText = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')
const rows = (g: GameState, a: Asset): MenuNode[] => devicesMenu(a, buildFabAction(a)).children(g)
const infos = (g: GameState, a: Asset): string[] => rows(g, a).filter((n) => n.type === 'info').map((n) => infoText(g, n))

/** Every text a node of the screen can show. */
function textsOf(g: GameState, nodes: MenuNode[]): string[] {
  const out: string[] = []
  for (const n of allNodes(g, nodes)) {
    if (n.type === 'info') out.push(infoText(g, n))
    else if (n.type === 'heading') out.push(n.label)
    else {
      out.push(n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '', n.hint?.(g) ?? '', n.disabledReason?.(g) ?? '')
      if (n.type === 'menu' && n.header) out.push(n.header(g))
    }
  }
  return out
}

const BOOKED = { year: 2025, revenue: 2e9, netRevenue: 2e9, cogs: 1e9, wages: 0, keyStaff: 0, rent: 0, upkeep: 0, marketing: 0, pbt: 1e6, corpTax: 0, net: 1e6, otherIncome: 0 } as Statement
const SISTER: ChipSupply = { year: 2025, from: 'sis1', name: 'Acme Silicon', stage: 3, node: 5, yield: 0.8, cover: 0.6 }

describe('the Devices & Chips menu', () => {
  it('follows Products, for devices only', () => {
    const { g, a } = devices()
    const ids = businessAssetView(g, a).flatMap((n) => (n.type === 'heading' ? [] : [n.id]))
    expect(ids.indexOf(`biz.devices.${a.id}`)).toBe(ids.indexOf(`biz.products.${a.id}`) + 1)
    expect(ids.indexOf(`biz.products.${a.id}`)).toBeGreaterThan(-1)
    const r = adult(5, 2026, 'us')
    const shop = company(r, 'restaurant', { cash: 1e7 })
    expect(businessAssetView(r, shop).some((n) => n.id.startsWith('biz.devices.'))).toBe(false)
    const node = businessAssetView(g, a).find((n) => n.id === `biz.devices.${a.id}`)
    expect(node?.type).toBe('menu')
    if (node?.type === 'menu') expect(node.label).toBe('Devices & Chips')
  })

  it('has at most 12 rows in every year, at home and in a late country', () => {
    const check = (country: string, year: number): void => {
      const { g, a, b } = devices(3, year, country)
      b.products = HARDWARE_FAMILIES.filter((f) => demandLevel(f, 'world', year).exists).map((f) => core(f, year - 1))
      const menu = devicesMenu(a, buildFabAction(a))
      const nodes = menu.children(g)
      expect(nodes.length).toBeLessThanOrEqual(12)
      const subs = nodes.filter((n) => n.type === 'menu')
      expect(subs.length).toBeLessThanOrEqual(7)
      expect(subs.length).toBe(b.products.length)
      if (!b.products.length) {
        expect(nodes.some((n) => infoText(g, n) === 'No device is on sale yet. Develop one under Products.')).toBe(true)
      }
      const rivalNames = marketCtxFor(g, b, g.year).rivals.map((r) => r.name)
      for (const t of textsOf(g, [menu])) {
        expect(t, `${country} ${year}`).not.toMatch(/NaN|undefined|null|Infinity/)
        expect(t.length, t).toBeLessThanOrEqual(180)
        expect(t).not.toMatch(/\u2014|\u2013/)
        for (const name of rivalNames) expect(t, `${country} ${year}: ${name}`).not.toContain(name)
      }
    }
    for (let y = 1977; y <= 2040; y++) check('us', y)
    for (const y of [1977, 1985, 1995, 2005, 2015, 2026, 2040]) check('in', y)
  })

  it('shows no sub-menu before a device is on sale, and all seven once they are', () => {
    for (const y of [1977, 1978, 1979]) {
      const { g, a, b } = devices(3, y)
      b.products = HARDWARE_FAMILIES.filter((f) => demandLevel(f, 'world', y).exists).map((f) => core(f, y - 1))
      expect(b.products).toHaveLength(0)
      const nodes = rows(g, a)
      expect(nodes.some((n) => n.type === 'menu')).toBe(false)
      expect(infos(g, a)).toContain('No device is on sale yet. Develop one under Products.')
    }
    const { g, a, b } = devices(3, 2026)
    b.products = HARDWARE_FAMILIES.map((f) => core(f, 2025))
    expect(rows(g, a).filter((n) => n.type === 'menu')).toHaveLength(7)
    expect(rows(g, a).length).toBeLessThanOrEqual(12)
  })

  it('opens with the header and the build row, in order', () => {
    const { g, a } = devices()
    const nodes = rows(g, a)
    expect(infoText(g, nodes[0])).toBe('Specs compare your best line of each kind with rivals that sell one. Better chips raise quality.')
    expect(nodes[1].type).toBe('info')
    expect(nodes[2].id).toBe(`biz.fab.${a.id}`)
    expect(nodes[2].type).toBe('action')
  })

  it('says where the chips come from', () => {
    const { g, a, b } = devices()
    expect(infoText(g, rows(g, a)[1])).toBe('Chips come from the open market. A fab or a sister chip company would cut their cost.')

    b.fabs = 2
    b.last = BOOKED
    const terms = chipTerms(b, g.year)
    const own = infoText(g, rows(g, a)[1])
    expect(own.startsWith('You run 2 chip fabs.')).toBe(true)
    expect(own).toContain('25%')
    expect(own).toContain(`${terms.perfBump.toFixed(1)} points faster`)
    expect(own).toContain(`quality by about ${terms.lift.toFixed(1)}`)
    expect(own).toContain(`At last year's volume that saves about ${money(chipBook(1e9, 0.25).saved)} a year.`)
    b.last = null
    expect(infoText(g, rows(g, a)[1])).not.toContain("At last year's volume")
    b.last = { ...BOOKED, cogs: 0 }
    expect(infoText(g, rows(g, a)[1])).not.toContain("At last year's volume")

    b.fabs = 1
    expect(infoText(g, rows(g, a)[1]).startsWith('You run 1 chip fab.')).toBe(true)
  })

  it('names the sister that makes the chips and what it saved', () => {
    const { g, a, b } = devices()
    b.chips = SISTER
    const bare = infoText(g, rows(g, a)[1])
    expect(bare.startsWith('Acme Silicon makes your chips.')).toBe(true)
    expect(bare).not.toContain('saved')
    g.flags.groupServiceResults = [{ group: 'g1', provider: 'sis1', customer: a.id, invoice: 1, saved: 4_200_000, year: 2025, chips: true }]
    const text = infoText(g, rows(g, a)[1])
    expect(text).toContain(`saved about ${money(4_200_000)} last year`)
    expect(text).toContain('Acme Silicon')
  })

  it('says what is true about the platform', () => {
    const { g, a, b } = devices()
    expect(infos(g, a)).toContain(`No operating system yet. One would add pull as your share grows, up to ${OS_PULL_CAP.toFixed(1)}x.`)
    const st = marketOfBiz(b)
    st.base = 0.5
    st.year = g.year - 1
    saveMarket(b, st)
    b.products = [{ name: OS_FAMILY, launched: 2025, boost: 0, quality: 80, family: OS_FAMILY, kind: 'core' }]
    const ctx = marketCtxFor(g, b, g.year)
    expect(infos(g, a)).toContain(`Your operating system keeps buyers. Pull is ${ctx.w.toFixed(2)}x at ${aPct(ctx.base)} share, up to ${OS_PULL_CAP.toFixed(1)}x.`)
    expect(ctx.w).toBeGreaterThan(1.7)
    // a line too far behind to keep anyone is not "no system", and it is not a boast either
    b.products = [{ name: OS_FAMILY, launched: 2025, boost: 0, quality: 30, family: OS_FAMILY, kind: 'core' }]
    const weak = infos(g, a).filter((t) => t.includes('operating system'))
    expect(weak).toHaveLength(1)
    expect(weak[0]).not.toContain('keeps buyers')
    expect(weak[0]).not.toContain('No operating system yet')
  })

  it('has one sub-menu per kind with the three spec lines', () => {
    const { g, a, b } = devices()
    b.products = [core('Smartphone', 2025, 62), core('Laptop', 2025, 58)]
    const subs = rows(g, a).filter((n) => n.type === 'menu')
    expect(subs.map((n) => n.id)).toEqual([`biz.devices.spec.${a.id}.laptop`, `biz.devices.spec.${a.id}.smartphone`])
    const sheet = specSheet(g, b, g.year, marketCtxFor(g, b, g.year))
    for (const sub of subs) {
      if (sub.type !== 'menu') throw new Error('not a menu')
      const spec = sheet.find((s) => sub.id.endsWith(s.family.toLowerCase()))
      expect(spec).toBeDefined()
      const subtitle = typeof sub.subtitle === 'function' ? sub.subtitle(g) : sub.subtitle ?? ''
      expect(subtitle).toMatch(/^Performance \d+ · (rank \d+ of \d+|the market has no figures)$/)
      expect(sub.label).toBe(spec!.family)
      expect(sub.children(g).map((n) => infoText(g, n))).toEqual(specLines(spec!))
      expect(sub.children(g)).toHaveLength(3)
    }
    const sub = subs[1]
    const sheetSmart = sheet[1]
    if (sub.type === 'menu') {
      const subtitle = typeof sub.subtitle === 'function' ? sub.subtitle(g) : sub.subtitle ?? ''
      expect(subtitle).toBe(`Performance ${Math.round(sheetSmart.perf.mine)} · rank ${sheetSmart.perf.rank} of ${sheetSmart.perf.of}`)
    }
  })

  it('slugs the kinds into stable ids', () => {
    const { g, a, b } = devices()
    b.products = ['Home Computer', 'Desktop PC', 'VR Headset', 'AR Glasses'].map((f) => core(f, 2025))
    expect(rows(g, a).filter((n) => n.type === 'menu').map((n) => n.id.split('.').pop())).toEqual(['home-computer', 'desktop-pc', 'vr-headset', 'ar-glasses'])
  })

  it('names the source and the fabs in its subtitle, and is blocked when the player can not run it', () => {
    const { g, a, b } = devices()
    const menu = devicesMenu(a, buildFabAction(a))
    const sub = () => (typeof menu.subtitle === 'function' ? menu.subtitle(g) : menu.subtitle ?? '')
    expect(sub()).toBe('Open-market chips · no fabs')
    b.fabs = 2
    expect(sub()).toBe('Chips from your own fabs · 2 fabs')
    // the sister is the source only while its cut is the larger one
    b.chips = SISTER
    expect(sub()).toBe('Chips from your own fabs · 2 fabs')
    b.fabs = 0
    expect(sub()).toBe('Chips from Acme Silicon · no fabs')
    b.fabs = 1
    expect(sub()).toBe('Chips from your own fabs · 1 fab')
    b.chips = { ...SISTER, cover: 1 }
    expect(sub()).toBe('Chips from Acme Silicon · 1 fab')
    expect(menu.disabledReason?.(g)).toBeNull()
    g.character.age = 17
    expect(menu.disabledReason?.(g)).toBe('You must be 18 to run a company. Its general manager makes these calls until then.')
  })

  it('is pure, even from a frozen state', () => {
    const { g, a, b } = devices()
    b.products = HARDWARE_FAMILIES.map((f) => core(f, 2025))
    b.fabs = 1
    b.chips = SISTER
    b.last = BOOKED
    const json = JSON.stringify(g)
    const rng = g.rng
    const menu = devicesMenu(a, buildFabAction(a))
    textsOf(g, [menu])
    expect(JSON.stringify(g)).toBe(json)
    expect(g.rng).toBe(rng)
    const freeze = (o: unknown): void => {
      if (!o || typeof o !== 'object' || Object.isFrozen(o)) return
      Object.freeze(o)
      for (const v of Object.values(o)) freeze(v)
    }
    freeze(g)
    expect(() => textsOf(g, [devicesMenu(a, buildFabAction(a))])).not.toThrow()
    expect(g.rng).toBe(rng)
  })
})
