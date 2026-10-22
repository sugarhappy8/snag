// R3-G10 (H.8): a private company's valuation is not a number the owner can read off a ticker. In Realistic mode the company screen, its
// fact sheet, the sale screens and the group screens print it as an appraisal range with a confidence chip, and a Look closer group
// (an analyst's appraisal, an audit) sharpens it for a fee. A listed company's market cap is a posted quote and stays exact; offers
// to buy are quotes of the real valuation. A reading is honest (the band holds the truth about 80% of the time), stable (the same
// number all year, a repeat buy changes nothing) and pure (no dice, no writes). In Exact mode every row is today's text.
import { describe, expect, it } from 'vitest'
import { dashboardRows } from '../src/game/business/dashboard'
import { formGroup } from '../src/game/business/conglomerate-actions'
import { initFund } from '../src/game/business/fund'
import { formGroupMenu, groupView } from '../src/game/business/conglomerate-menu'
import { groupsOf } from '../src/game/business/conglomerate-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { businessScreen, businessView, infoRows, shopCompany } from '../src/game/business/manage'
import { bizOf, readBiz, stakeValue } from '../src/game/business/state'
import { money, pct } from '../src/game/business/util'
import { stakeText, valKey, valueChip, valueLook, valueRead, valueText } from '../src/game/business/valuation-fog'
import { buyIntel, isExact, know, lookCloser, offersFor, readKnow, takeReading, wordsFor } from '../src/game/knowledge/contract'
import { parseKey, ruleOf } from '../src/game/knowledge/keys'
import { kindOfKey, labelOfKey } from '../src/game/knowledge/kinds'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode, ModalItem } from '../src/game/types'
import { getCountry } from '../src/game/world'
import { coverage, deepFreeze, fogGame, inFog, unitAt } from './knowledge-kit'

// ---------------------------------------------------------------------------------------------------------------------------------
// Lives and screens

/** A grown-up in 2026 with money and no foothold anywhere else. */
function owner(seed: number, over: { talent?: boolean; money?: number } = {}): GameState {
  const g = createNewLife({ seed, year: 1996, countryId: 'us' })
  g.queue = []
  g.year = 2026
  const c = g.character
  c.age = 30
  c.money = over.money ?? 50_000_000
  c.stats.smarts = 60
  c.city = getCountry('us').cities[0]
  c.licenses = ['driver']
  c.talent = null
  c.talents = over.talent ? ['Investing'] : []
  return g
}

/** A company with a known valuation (the figure the fog hides), no debt and nothing public about it. */
function addFirm(g: GameState, over: { name?: string; valuation?: number; share?: number; industry?: 'cafe' | 'restaurant'; public?: boolean } = {}): Asset {
  const c = g.character
  const b = newBiz(g, over.industry ?? 'cafe', c.countryId, c.city, { cash: 400_000, quality: 70, brand: 40 })
  const a = createBusinessAsset(g, over.name ?? 'Maple Cafe', b, 0)
  g.assets.push(a)
  const live = bizOf(g, a)
  live.valuation = over.valuation ?? 4_200_000
  live.debt = 0
  live.share = over.share ?? 1
  if (over.public) {
    live.public = true
    live.exchange = 'NYSE'
    live.sharePrice = 12.5
    live.sharesOut = 1_000_000
  }
  return a
}

function firm(seed: number, over: Parameters<typeof addFirm>[1] & { talent?: boolean; money?: number } = {}): { g: GameState; a: Asset } {
  const g = owner(seed, { talent: over.talent, money: over.money })
  return { g, a: addFirm(g, over) }
}

const textOf = (n: MenuInfo, g: GameState): string => (typeof n.text === 'function' ? n.text(g) : n.text)
const subOf = (n: MenuAction | MenuGroup, g: GameState): string => (typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''))

function walk(g: GameState, nodes: readonly MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...walk(g, n.children(g))] : [n]))
}

function dashMoney(g: GameState, a: Asset): MenuInfo {
  const row = dashboardRows(g, a).find((n): n is MenuInfo => n.type === 'info' && n.id === `biz.dash.money.${a.id}`)
  if (!row) throw new Error('no money row')
  return row
}

function detailsValue(g: GameState, a: Asset): MenuInfo {
  const row = infoRows(g, a).find((n): n is MenuInfo => n.type === 'info' && /^(Valuation|Market cap) /.test(textOf(n, g)))
  if (!row) throw new Error('no valuation row')
  return row
}

function sellRow(g: GameState, a: Asset): MenuAction {
  const row = walk(g, businessView(g, a)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.sell.${a.id}`)
  if (!row) throw new Error('no sell row')
  return row
}

const lookIn = (nodes: readonly MenuNode[], prefix: string): MenuGroup | undefined => nodes.find((n): n is MenuGroup => n.type === 'menu' && n.id.startsWith(prefix))

/** A group of two private companies, with the group menus' rows. */
function groupLife(seed: number): { g: GameState; a: Asset; b: Asset; gid: string } {
  const g = owner(seed)
  const a = addFirm(g, { name: 'Maple Cafe', valuation: 4_200_000 })
  const b = addFirm(g, { name: 'Elm Diner', valuation: 7_800_000, industry: 'restaurant' })
  expect(formGroup(g, [a.id, b.id], 'Maple Holdings')).toBe(true)
  g.queue = []
  const grp = groupsOf(g)[0]!
  return { g, a, b, gid: grp.core.id }
}

/** Everything the company screen and its fact sheet say, as text with the chips: what a stability or purity case compares. */
function render(g: GameState, a: Asset): string[] {
  const out: string[] = []
  for (const n of walk(g, businessView(g, a))) {
    if (n.type === 'info') out.push(`${n.id}|${textOf(n, g)}|${n.conf ?? '-'}|${n.asOf ?? '-'}`)
    else if (n.type === 'heading') out.push(n.label)
    else out.push(`${n.id}|${n.label}|${subOf(n, g)}|${n.conf ?? '-'}|${n.asOf ?? '-'}|${n.disabledReason?.(g) ?? ''}`)
  }
  return out
}

/** The true figure as the old code wrote it. */
const MONEY_RANGE = /^(about )?\$[\d.,]+[KMB]?( to \$[\d.,]+[KMB]?)?$|^in the [a-z ]+$/

// ---------------------------------------------------------------------------------------------------------------------------------

describe('the suite runs in Exact', () => {
  it("starts in Exact, so every row below is today's text unless a case flips the mode", () => {
    expect(isExact()).toBe(true)
  })
})

describe("Exact mode: every row is today's text", () => {
  it('the helpers say the old words and no confidence', () => {
    const { g, a } = firm(1)
    const b = readBiz(g, a)
    expect(valueRead(g, a, b)).toEqual({ text: money(b.valuation) })
    expect(valueText(g, a, b)).toBe(money(b.valuation))
    expect(valueText(g, a, b, 'worth')).toBe(`worth ${money(b.valuation)}`)
    expect(valueText(g, a, b, 'Valued at', { about: true })).toBe(`Valued at about ${money(b.valuation)}`)
    expect(valueChip(g, a, b)).toEqual({})
    expect(valueLook(g, a, b)).toBeNull()
    expect(stakeText(g, a, b)).toBe(money(stakeValue(b)))
  })

  it('the dashboard, the fact sheet and the sale row equal the old builders, with no chip', () => {
    const { g, a } = firm(2, { share: 0.6 })
    const b = readBiz(g, a)
    const dash = dashMoney(g, a)
    expect(textOf(dash, g)).toBe(`Cash ${money(b.cash)} \u{00B7} value ${money(b.valuation)} \u{00B7} your 60%: ${money(stakeValue(b))}`)
    expect(dash.conf).toBeUndefined()
    const details = detailsValue(g, a)
    expect(textOf(details, g)).toBe(`Valuation ${money(b.valuation)} (your stake ${money(stakeValue(b))}) \u{00B7} cash ${money(b.cash)}`)
    expect(details.conf).toBeUndefined()
    const sell = sellRow(g, a)
    expect(subOf(sell, g)).toBe(`Valued at about ${money(b.valuation)} (your ${pct(b.share)}: ${money(b.valuation * b.share)}) \u{00B7} the board must agree`)
    expect(sell.conf).toBeUndefined()
    expect(lookIn(walk(g, businessView(g, a)), 'look.val.')).toBeUndefined()
  })

  it('a company you own outright, and a listed one, read as they always did', () => {
    const { g, a } = firm(3)
    const b = readBiz(g, a)
    expect(textOf(dashMoney(g, a), g)).toBe(`Cash ${money(b.cash)} \u{00B7} value ${money(b.valuation)} \u{00B7} all yours`)
    const listed = firm(4, { public: true, share: 0.4 })
    const lb = readBiz(listed.g, listed.a)
    expect(textOf(dashMoney(listed.g, listed.a), listed.g)).toContain(`market cap ${money(lb.valuation)}`)
    expect(textOf(detailsValue(listed.g, listed.a), listed.g)).toMatch(new RegExp(`^Market cap ${money(lb.valuation).replace('$', '\\$')}`))
  })

  it('the sale popup and the group rows keep their numbers', () => {
    const { g, a } = firm(5)
    const b = bizOf(g, a)
    shopCompany(g, a, b)
    const m = g.queue.pop() as Extract<ModalItem, { kind: 'choice' }>
    expect(m.text).toContain(`(valued at about ${money(b.valuation)})`)

    const grp = groupLife(6)
    const view = groupView(grp.g, grp.gid)
    const spin = view.find((n): n is MenuGroup => n.type === 'menu' && n.id === `biz.group.spin.${grp.gid}`)!
    const sell = view.find((n): n is MenuGroup => n.type === 'menu' && n.id === `biz.group.sell.${grp.gid}`)!
    const x = readBiz(grp.g, grp.a)
    const spinRow = spin.children(grp.g).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.group.spin.${grp.a.id}.${grp.gid}`)!
    expect(subOf(spinRow, grp.g)).toContain(`worth ${money(x.valuation)}`)
    const sellRow2 = sell.children(grp.g).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.group.sell.${grp.a.id}.${grp.gid}`)!
    expect(subOf(sellRow2, grp.g)).toBe(`Valued at about ${money(x.valuation)} \u{00B7} your share ${pct(x.share, 1)}`)
    expect(sell.children(grp.g).some((n) => n.id.startsWith('look.val.'))).toBe(false)
  })
})

describe('Realistic mode: a private company reads as an appraisal range', () => {
  it('the dashboard says a range with a confidence of 1, never the figure', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { g, a } = firm(seed)
      inFog(() => {
        const b = readBiz(g, a)
        const read = valueRead(g, a, b)
        expect(read.text, `seed ${seed}`).toMatch(MONEY_RANGE)
        expect(read.text).not.toBe(money(b.valuation))
        expect(read.conf).toBe(1)
        const row = dashMoney(g, a)
        expect(textOf(row, g)).toBe(`Cash ${money(b.cash)} \u{00B7} value ${read.text} \u{00B7} all yours`)
        expect(row.conf).toBe(1)
        expect(row.asOf).toBeUndefined()
        expect(textOf(row, g)).not.toContain(money(b.valuation))
      })
    }
  })

  it('the fact sheet and the sale rows say the same range, with the chip', () => {
    const { g, a } = firm(7)
    inFog(() => {
      const b = readBiz(g, a)
      const read = valueRead(g, a, b)
      const details = detailsValue(g, a)
      expect(textOf(details, g)).toBe(`Valuation ${read.text} \u{00B7} cash ${money(b.cash)}`)
      expect(details.conf).toBe(1)
      const sell = sellRow(g, a)
      expect(subOf(sell, g)).toBe(`Valued at ${read.text}`)
      expect(sell.conf).toBe(1)
    })
  })

  it('a share under 100% shows the stake as the same band times the share', () => {
    const { g, a } = firm(8, { share: 0.6 })
    inFog(() => {
      const b = readBiz(g, a)
      const e = know(g, valKey(a.id), b.valuation)
      expect(e.exact).toBe(false)
      const r = stakeValue(b) / b.valuation
      const want = wordsFor('money', { mid: e.mid * r, lo: e.lo * r, hi: e.hi * r, conf: e.conf })
      expect(stakeText(g, a, b)).toBe(want)
      expect(stakeText(g, a, b)).not.toBe(money(stakeValue(b)))
      expect(textOf(dashMoney(g, a), g)).toBe(`Cash ${money(b.cash)} \u{00B7} value ${valueRead(g, a, b).text} \u{00B7} your 60%: ${want}`)
      expect(textOf(detailsValue(g, a), g)).toBe(`Valuation ${valueRead(g, a, b).text} (your stake ${want}) \u{00B7} cash ${money(b.cash)}`)
      expect(subOf(sellRow(g, a), g)).toBe(`Valued at ${valueRead(g, a, b).text} (your 60%: ${stakeText(g, a, b, b.valuation * b.share)}) \u{00B7} the board must agree`)
      // The stake band holds the true stake exactly when the valuation band holds the true valuation.
      expect(e.lo <= b.valuation && b.valuation <= e.hi).toBe(e.lo * r <= stakeValue(b) + 1e-6 && stakeValue(b) <= e.hi * r + 1e-6)
    })
  })

  it('a listed company prints its market cap exactly, with no chip and no Look closer', () => {
    const { g, a } = firm(9, { public: true })
    inFog(() => {
      const b = readBiz(g, a)
      expect(valueRead(g, a, b)).toEqual({ text: money(b.valuation) })
      expect(valueChip(g, a, b)).toEqual({})
      expect(valueLook(g, a, b)).toBeNull()
      const row = dashMoney(g, a)
      expect(textOf(row, g)).toContain(`market cap ${money(b.valuation)}`)
      expect(row.conf).toBeUndefined()
      expect(textOf(detailsValue(g, a), g)).toMatch(new RegExp(`^Market cap ${money(b.valuation).replace('$', '\\$')}`))
      expect(detailsValue(g, a).conf).toBeUndefined()
      expect(lookIn(walk(g, businessView(g, a)), 'look.val.')).toBeUndefined()
    })
  })

  it('a company worth nothing has nothing to blur', () => {
    const { g, a } = firm(10, { valuation: 0 })
    inFog(() => {
      expect(valueRead(g, a, readBiz(g, a))).toEqual({ text: money(0) })
      expect(valueLook(g, a, readBiz(g, a))).toBeNull()
    })
  })

  it('the same screen twice is the same text, and another life reads another number', () => {
    const { g, a } = firm(11)
    inFog(() => {
      expect(render(g, a)).toEqual(render(g, a))
      const texts = new Set<string>()
      for (let seed = 20; seed < 40; seed++) {
        const f = firm(seed)
        texts.add(valueRead(f.g, f.a, readBiz(f.g, f.a)).text)
      }
      expect(texts.size).toBeGreaterThan(5)
    })
  })

  it('reads purely: no dice, no writes, and a frozen life builds the screens without a throw', () => {
    const { g, a } = firm(12, { share: 0.7 })
    inFog(() => {
      const before = JSON.stringify(g)
      const rng = g.rng
      render(g, a)
      valueRead(g, a, readBiz(g, a))
      stakeText(g, a, readBiz(g, a))
      expect(JSON.stringify(g)).toBe(before)
      expect(g.rng).toBe(rng)
    })
    const f = firm(13)
    const frozen = deepFreeze(f.g)
    inFog(() => {
      expect(() => render(frozen, f.a)).not.toThrow()
      expect(() => valueLook(frozen, f.a, readBiz(frozen, f.a))).not.toThrow()
    })
  })

  it('reads on the same number all year and another number next year', () => {
    const { g, a } = firm(14)
    inFog(() => {
      const b = readBiz(g, a)
      const first = valueRead(g, a, b).text
      expect(valueRead(g, a, b).text).toBe(first)
      const later = { ...g, year: g.year + 1 }
      const seen = new Set<string>()
      for (let i = 0; i < 8; i++) {
        const other = { ...later, lifeId: `later-${i}` }
        seen.add(valueRead(other, a, b).text)
      }
      expect(seen.size).toBeGreaterThan(1)
    })
  })

  it('the Investing talent narrows the plain read, and the chip stays honest', () => {
    const plain = firm(15)
    const gifted = firm(15, { talent: true })
    inFog(() => {
      const p = know(plain.g, valKey(plain.a.id), 4_200_000)
      const t = know(gifted.g, valKey(gifted.a.id), 4_200_000)
      expect(t.sd).toBeLessThan(p.sd)
      expect(valueRead(plain.g, plain.a, readBiz(plain.g, plain.a)).conf).toBe(1)
    })
  })
})

describe('selling still uses the true valuation', () => {
  it('the offers do not change with the mode, and the popup says the range', () => {
    const base = firm(16)
    const exact = structuredClone(base.g)
    const fogged = structuredClone(base.g)
    shopCompany(exact, base.a, bizOf(exact, base.a))
    const me = exact.queue.pop() as Extract<ModalItem, { kind: 'choice' }>
    inFog(() => shopCompany(fogged, base.a, bizOf(fogged, base.a)))
    const mf = fogged.queue.pop() as Extract<ModalItem, { kind: 'choice' }>
    expect((mf.data as { offers: unknown }).offers).toEqual((me.data as { offers: unknown }).offers)
    expect(fogged.rng).toEqual(exact.rng)
    const b = readBiz(base.g, base.a)
    expect(me.text).toContain(`(valued at about ${money(b.valuation)})`)
    inFog(() => {
      expect(mf.text).toContain(`(valued at ${valueRead(fogged, base.a, readBiz(fogged, base.a)).text})`)
      expect(mf.text).not.toContain(money(b.valuation))
    })
  })
})

describe('Realistic mode: Look closer', () => {
  it('the company screen gets one group, offering an appraisal and an audit', () => {
    const { g, a } = firm(17)
    inFog(() => {
      const nodes = walk(g, businessView(g, a))
      const groups = nodes.filter((n) => n.type === 'menu' && n.id.startsWith('look.val.'))
      expect(groups.map((n) => n.id)).toEqual([`look.val.${a.id}`])
      const look = groups[0] as MenuGroup
      expect(look.label).toBe('Look closer')
      const ids = look.children(g).map((n) => n.id)
      expect(ids).toContain(`${look.id}.analyst`)
      expect(ids).toContain(`${look.id}.diligence`)
      expect(dashboardRows(g, a).at(-1)?.id).toBe(look.id)
    })
  })

  it('a finance firm gets the same row and group on its short card', () => {
    const g = owner(30)
    const c = g.character
    const b = newBiz(g, 'investmentFirm', c.countryId, c.city, { cash: 400_000, quality: 70, brand: 40 })
    initFund(g, b, 'asset')
    const a = createBusinessAsset(g, 'Oak Capital', b, 0)
    g.assets.push(a)
    bizOf(g, a).valuation = 6_000_000
    inFog(() => {
      const rows = dashboardRows(g, a)
      expect(rows.map((n) => n.id)).toEqual([`biz.dash.who.${a.id}`, `biz.dash.money.${a.id}`, `biz.dash.results.${a.id}`, `look.val.${a.id}`])
      const money1 = rows[1] as MenuInfo
      expect(money1.conf).toBe(1)
      expect(textOf(money1, g)).toContain(`value ${valueRead(g, a, readBiz(g, a)).text}`)
    })
    expect(dashboardRows(g, a).map((n) => n.id)).toEqual([`biz.dash.who.${a.id}`, `biz.dash.money.${a.id}`, `biz.dash.results.${a.id}`])
  })

  it('sits straight under the card, on the cockpit screen as on the flat list', () => {
    const { g, a } = firm(29)
    inFog(() => {
      for (const list of [businessView(g, a), businessScreen(g, a)]) {
        const at = list.findIndex((n) => n.type === 'menu' && n.id === `look.val.${a.id}`)
        expect(at).toBeGreaterThan(0)
        expect(list[at - 1]!.id).toBe(`biz.dash.health.${a.id}`)
      }
    })
  })

  it('an appraisal narrows the range, books its fee once, and a repeat buy is refused and changes nothing', () => {
    const { g, a } = firm(18)
    inFog(() => {
      const b = readBiz(g, a)
      const key = valKey(a.id)
      const before = valueRead(g, a, b)
      const wide = know(g, key, b.valuation)
      const group = lookIn(walk(g, businessView(g, a)), 'look.val.')!
      const analyst = group.children(g).find((n): n is MenuAction => n.type === 'action' && n.id === `${group.id}.analyst`)!
      expect(analyst.label).toBe('An analyst')
      expect(analyst.disabledReason?.(g) ?? null).toBeNull()
      const price = offersFor(g, [key]).find((o) => o.src === 'analyst')!.price
      expect(price).toBeGreaterThan(0)

      const cash = g.character.money
      analyst.run(g)
      expect(g.character.money).toBe(cash - price)
      const sharp = know(g, key, b.valuation)
      expect(sharp.src).toBe('analyst')
      expect(sharp.conf).toBe(2)
      expect(Math.log(sharp.hi / sharp.lo)).toBeLessThan(Math.log(wide.hi / wide.lo) * 0.6)
      const after = valueRead(g, a, b)
      expect(after.text).not.toBe(before.text)
      expect(after.conf).toBe(2)
      expect(textOf(dashMoney(g, a), g)).toContain(`value ${after.text}`)
      expect(dashMoney(g, a).conf).toBe(2)
      expect(readKnow(g)?.k[key]?.src).toBe('analyst')

      const text = render(g, a)
      const again = buyIntel(g, 'analyst', [key])
      expect(again.ok).toBe(false)
      expect(again.why).toBe("You already have this year's reading.")
      expect(g.character.money).toBe(cash - price)
      expect(render(g, a)).toEqual(text)
    })
  })

  it('an audit reads sharper still, to within about 7%', () => {
    const { g, a } = firm(19)
    inFog(() => {
      const b = readBiz(g, a)
      const key = valKey(a.id)
      expect(buyIntel(g, 'diligence', [key]).ok).toBe(true)
      const e = know(g, key, b.valuation)
      expect(e.src).toBe('diligence')
      expect(e.conf).toBe(3)
      expect(valueRead(g, a, b).conf).toBe(3)
      expect(e.lo <= b.valuation && b.valuation <= e.hi).toBe(true)
      expect(Math.log(e.hi / e.lo)).toBeLessThan(0.14)
    })
  })

  it('the fees follow the company and the country, never the cash in hand', () => {
    const poor = firm(21, { money: 500_000 })
    const rich = firm(21, { money: 50_000_000_000 })
    inFog(() => {
      for (const src of ['analyst', 'diligence'] as const) {
        const a = offersFor(poor.g, [valKey(poor.a.id)]).find((o) => o.src === src)!
        const b = offersFor(rich.g, [valKey(rich.a.id)]).find((o) => o.src === src)!
        expect(b.price, src).toBe(a.price)
      }
    })
  })

  it('a listed company, or none at all, has no group', () => {
    const listed = firm(22, { public: true })
    inFog(() => {
      expect(lookCloser(listed.g, { id: 'val.x', keys: [valKey(listed.a.id)] })).toBeNull()
      expect(lookCloser(listed.g, { id: 'val.y', keys: [valKey('nope')] })).toBeNull()
    })
  })
})

describe('Realistic mode: the group screens', () => {
  it('the add, form, spin and sell rows read ranges with the chip and end with a Look closer group', () => {
    const grp = groupLife(23)
    inFog(() => {
      const g = grp.g
      const ra = valueRead(g, grp.a, readBiz(g, grp.a))
      const rb = valueRead(g, grp.b, readBiz(g, grp.b))
      expect(ra.conf).toBe(1)
      const view = groupView(g, grp.gid)
      const spin = view.find((n): n is MenuGroup => n.type === 'menu' && n.id === `biz.group.spin.${grp.gid}`)!
      const sell = view.find((n): n is MenuGroup => n.type === 'menu' && n.id === `biz.group.sell.${grp.gid}`)!
      const spinRows = spin.children(g)
      const sellRows = sell.children(g)
      const sa = spinRows.find((n): n is MenuAction => n.type === 'action' && n.id === `biz.group.spin.${grp.a.id}.${grp.gid}`)!
      expect(subOf(sa, g)).toContain(`worth ${ra.text}`)
      expect(sa.conf).toBe(1)
      const xa = sellRows.find((n): n is MenuAction => n.type === 'action' && n.id === `biz.group.sell.${grp.a.id}.${grp.gid}`)!
      expect(subOf(xa, g)).toBe(`Valued at ${ra.text} \u{00B7} your share ${pct(readBiz(g, grp.a).share, 1)}`)
      expect(xa.conf).toBe(1)
      const xb = sellRows.find((n): n is MenuAction => n.type === 'action' && n.id === `biz.group.sell.${grp.b.id}.${grp.gid}`)!
      expect(subOf(xb, g)).toContain(rb.text)
      expect(sellRows[sellRows.length - 1]!.id.startsWith('look.val.')).toBe(true)
      expect(spinRows[spinRows.length - 1]!.id.startsWith('look.val.')).toBe(true)
      for (const rows of [spinRows, sellRows]) {
        expect(rows.filter((n) => n.id.startsWith('look.val.'))).toHaveLength(1)
        expect(JSON.stringify(rows.map((n) => (n.type === 'action' ? subOf(n, g) : '')))).not.toContain(money(readBiz(g, grp.a).valuation))
      }
    })
  })

  it('the form screen lists each standalone company with a range and the chip', () => {
    const g = owner(24)
    const a = addFirm(g, { name: 'Maple Cafe', valuation: 4_200_000 })
    const b = addFirm(g, { name: 'Elm Diner', valuation: 7_800_000, industry: 'restaurant' })
    inFog(() => {
      const rows = formGroupMenu.children(g)
      const pick = rows.filter((n): n is MenuAction => n.type === 'action' && n.id.startsWith('biz.groupPick.'))
      expect(pick).toHaveLength(2)
      for (const [row, asset] of [
        [pick[0]!, a],
        [pick[1]!, b],
      ] as const) {
        expect(subOf(row, g)).toContain(`worth ${valueRead(g, asset, readBiz(g, asset)).text}`)
        expect(row.conf).toBe(1)
      }
      expect(rows.filter((n) => n.id.startsWith('look.val.'))).toHaveLength(1)
    })
    expect(formGroupMenu.children(g).some((n) => n.id.startsWith('look.val.'))).toBe(false)
  })
})

describe('the band is honest', () => {
  it('holds the valuation about 80% of 10,000 passive reads, and 80% for the Investing talent too', () => {
    inFog(() => {
      const plain = coverage(10_000, (i) => {
        const truth = 20_000 * Math.pow(500, unitAt('val', i))
        return { est: know(fogGame(i), valKey(`biz${(i % 90) + 1}`), truth), truth }
      })
      expect(plain).toBeGreaterThan(0.77)
      expect(plain).toBeLessThan(0.83)
      const gifted = coverage(10_000, (i) => {
        const truth = 20_000 * Math.pow(500, unitAt('val2', i))
        return { est: know(fogGame(i, { talents: ['Investing'] }), valKey(`biz${(i % 90) + 1}`), truth), truth }
      })
      expect(gifted).toBeGreaterThan(0.77)
      expect(gifted).toBeLessThan(0.83)
    })
  })

  it('holds the valuation at least 75% of 3,000 reads after an appraisal or an audit, and the bands are tighter', () => {
    inFog(() => {
      for (const [src, tighter] of [
        ['analyst', 0.6],
        ['diligence', 0.3],
      ] as const) {
        let width = 0
        const hit = coverage(3_000, (i) => {
          const truth = 20_000 * Math.pow(500, unitAt(`val3${src}`, i))
          const g = { ...fogGame(i), flags: {} }
          const est = takeReading(g, src, valKey(`biz${(i % 90) + 1}`), truth)!
          expect(est.src).toBe(src)
          width += Math.log(est.hi / est.lo)
          return { est, truth }
        })
        expect(hit, src).toBeGreaterThanOrEqual(0.75)
        expect(hit, src).toBeLessThan(0.87)
        const passive = 2 * 1.298 * 0.3
        expect(width / 3_000, src).toBeLessThan(passive * tighter)
      }
    })
  })

  it('the range printed for a firm holds its valuation about 80% of the time over 300 lives', () => {
    let hit = 0
    let n = 0
    inFog(() => {
      for (let seed = 100; seed < 400; seed++) {
        const g = fogGame(seed)
        const a: Asset = { id: `biz${seed}`, kind: 'business', name: 'x', emoji: 'x', purchasePrice: 0, value: 0, condition: 100, purchasedAge: 30, upkeep: 0, details: {} }
        const truth = 50_000 * Math.pow(400, unitAt('firm', seed))
        const e = know(g, valKey(a.id), truth)
        n++
        if (e.lo <= truth && truth <= e.hi) hit++
      }
    })
    expect(hit / n).toBeGreaterThan(0.72)
    expect(hit / n).toBeLessThan(0.88)
  })
})

describe('the key and its kind', () => {
  it('is a valid key of at most 64 characters with the money rule row, and an odd id is hashed to a valid one', () => {
    const { a } = firm(25)
    for (const id of [a.id, 'biz9', 'x'.repeat(80), 'has space', 'a:b', '']) {
      const key = valKey(id)
      expect(parseKey(key), key).not.toBeNull()
      expect(key.length).toBeLessThanOrEqual(64)
      expect(key.startsWith('val:')).toBe(true)
      expect(key.endsWith(':value')).toBe(true)
      expect(ruleOf(key)?.unit).toBe('money')
      expect(ruleOf(key)?.sd0).toBe(0.3)
    }
    expect(valKey('biz9')).toBe('val:biz9:value')
    expect(valKey('has space')).not.toBe(valKey('has_space'))
  })

  it('finds the truth of a private company, and none for a listed one or a stranger', () => {
    const { g, a } = firm(26)
    const key = valKey(a.id)
    const kind = kindOfKey(key)
    expect(kind).not.toBeNull()
    expect(kind!.kind).toBe('val')
    expect(kind!.truth(g, key)).toBe(4_200_000)
    expect(kind!.truth(g, valKey('nobody'))).toBeNull()
    expect(labelOfKey(g, key)).toBe('Maple Cafe valuation')
    expect(kind!.scope?.(g, key)).toEqual({ tier: 1, country: 'us', deal: 4_200_000 })
    const listed = firm(27, { public: true })
    expect(kindOfKey(valKey(listed.a.id))!.truth(listed.g, valKey(listed.a.id))).toBeNull()
  })

  it('a bought reading keeps the label in the Briefing, and a changed valuation moves the truth with the books', () => {
    const { g, a } = firm(28)
    inFog(() => {
      const key = valKey(a.id)
      expect(buyIntel(g, 'analyst', [key]).ok).toBe(true)
      expect(labelOfKey(g, key)).toBe('Maple Cafe valuation')
      bizOf(g, a).valuation = 9_000_000
      expect(kindOfKey(key)!.truth(g, key)).toBe(9_000_000)
    })
  })
})
