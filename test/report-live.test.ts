// R1 visual check: the Annual Report is written under the money display on screen when it opens.
//
// The report is built when the year closes and waits in the saved modal queue. Its numbers are drawn when it opens (the
// axes, the tile values and chips, the waterfall rows, the price chip: all formatted live), but its sentences were written
// when it was built: the verdict, the tile notes, the market note and the statement lines. Opened under another money display
// than it was built under ("prices as they were" switched on or off, or a save made by another build), one screen printed
// "+ $8,803" on a tile beside "up $9,260" under it. reportDataNow (business/yearly.ts) writes the three texts again from the
// books when the card opens, and ModalHost hands the card the result.
//
// The cases build a report under one display and open it under the other, in both directions, and ask for the same thing
// each time: the page is exactly the page of a report that was built under the display it opens in.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { economicReportOf } from '../src/game/business/economic-report'
import { bizOf, readBiz, stakeValue } from '../src/game/business/state'
import { money, toJson } from '../src/game/business/util'
import { reportData, reportDataNow } from '../src/game/business/yearly'
import { bindMoneyContext, setMoneyDisplay, shortMoney } from '../src/game/core'
import { readReportCharts } from '../src/game/charts/report'
import { formatSigned } from '../src/ui/charts/format'
// Importing the currencies registers the real converter, as the game does at startup.
import '../src/game/data/currencies'
import { resetFlags, withFlags } from '../src/game/flags'
import { PRESENT_YEAR } from '../src/game/history/timeline'
import type { Json, MinigameModal } from '../src/game/types'
import { deepFreeze, ownerGame } from './charts-kit'

const mock = vi.hoisted(() => ({ state: { game: null as unknown } }))

vi.mock('../src/ui/store', () => ({
  useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
  getApp: () => mock.state,
  runMenuAction: () => {},
}))

const { ModalHost } = await import('../src/ui/components/ModalHost')
const { LazyReportBook } = await import('../src/ui/charts/lazy')

type Display = { mode: 'usd' | 'local'; nominal: boolean }
const TODAY: Display = { mode: 'usd', nominal: false }
const AS_LIVED: Display = { mode: 'usd', nominal: true }

let world: ReturnType<typeof ownerGame>

beforeAll(async () => {
  world = ownerGame({ years: 6 })
  await LazyReportBook.preload()
}, 120_000)

afterEach(() => {
  setMoneyDisplay(TODAY)
  bindMoneyContext(null)
  mock.state.game = null
  resetFlags()
})

/** The report data as the year's close queues it, built while the player reads money as `display`. */
function builtUnder(display: Display): Record<string, Json> {
  const { g, a } = world
  setMoneyDisplay(display)
  bindMoneyContext(g)
  return withFlags({ annualReport2: true }, () => toJson(reportData(g, a, bizOf(g, a)))) as Record<string, Json>
}

function modalOf(data: Json): MinigameModal {
  return { kind: 'minigame', id: 'm1', game: 'annualReport', title: 'Annual Report', scriptId: 'business.report', data }
}

/** The card ModalHost draws for `data`, with the player reading money as `display` (the book's Summary tab). */
function pageUnder(display: Display, data: Json): string {
  const { g } = world
  setMoneyDisplay(display)
  bindMoneyContext(g)
  const saved = g.queue
  g.queue = [modalOf(data)]
  mock.state.game = g
  try {
    return withFlags({ annualReport2: true }, () => renderToStaticMarkup(createElement(ModalHost)))
  } finally {
    g.queue = saved
  }
}

/** The three texts of a report. */
function textsOf(data: Record<string, Json>): { lines: Json; marketNote: Json; chart: Json } {
  return { lines: data.lines ?? null, marketNote: data.marketNote ?? null, chart: data.chart ?? null }
}

/** The tiles of the Summary tab: the chip (the signed change), the note under it and the big value, each as printed. */
function tilesOf(markup: string): { value?: string; chip?: string; note?: string }[] {
  return markup
    .split('class="ch-kpi"')
    .slice(1)
    .map((t) => ({
      value: /ch-kpi-value">([^<]*)</.exec(t)?.[1],
      chip: /ch-kpi-delta[^>]*><span[^>]*>[^<]*<\/span> ([^<]*?) <span/.exec(t)?.[1],
      note: /ch-kpi-note">([^<]*)</.exec(t)?.[1],
    }))
}

/** A dollar figure as the game prints it ("-$73K", "$1.2M", "$8,803") back to dollars, and how far the print can be from the truth. */
function unmoney(text: string): { value: number; half: number } {
  const m = /^(-?)\$([\d,]+)(\.\d+)?([KMBT]?)$/.exec(text)
  if (!m) throw new Error(`not money: ${text}`)
  const unit = ({ '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[m[4]!]!
  const digits = (m[3] ?? '').length === 0 ? 0 : m[3]!.length - 1
  return { value: (m[1] === '-' ? -1 : 1) * Number(`${m[2]!.replace(/,/g, '')}${m[3] ?? ''}`) * unit, half: (unit * 10 ** -digits) / 2 }
}

const verdictOf = (markup: string): string | undefined => /class="rb-verdict">([^<]*)</.exec(markup)?.[1]

const DIRECTIONS: [string, Display, Display][] = [
  ['built as lived, opened in today money', AS_LIVED, TODAY],
  ['built in today money, opened as lived', TODAY, AS_LIVED],
]

describe('an Annual Report opened under another money display than it was built under', () => {
  it('is a real mismatch to begin with: the two builds write different sentences', () => {
    const lived = builtUnder(AS_LIVED)
    const today = builtUnder(TODAY)
    expect(lived.marketNote).not.toBe(today.marketNote)
    expect(lived.lines).not.toEqual(today.lines)
    expect((lived.chart as Record<string, Json>).verdict).not.toBe((today.chart as Record<string, Json>).verdict)
  })

  for (const [name, built, opened] of DIRECTIONS) {
    describe(name, () => {
      it('prints the page of a report that was built under the display it opens in', () => {
        const stale = builtUnder(built)
        const fresh = builtUnder(opened)
        expect(pageUnder(opened, stale)).toBe(pageUnder(opened, fresh))
      })

      it('shows one dollar figure for one quantity: the chip, the verdict and the notes agree with the books', () => {
        const stale = builtUnder(built)
        const html = pageUnder(opened, stale)
        setMoneyDisplay(opened)
        bindMoneyContext(world.g)
        const b = readBiz(world.g, world.a)
        const r = economicReportOf(b)!
        const change = shortMoney(Math.abs(r.delta))
        const tiles = tilesOf(html)
        expect(tiles).toHaveLength(4)
        // The net profit change, once on the tile (the chip) and once in the verdict, in the prices the page names.
        expect(tiles[0]!.chip).toBe(change)
        expect(verdictOf(html)).toBe(`Net profit ${r.delta > 0 ? 'rose' : 'fell'} ${change} from ${r.previousYear}.`)
        expect(tiles[0]!.note ?? '').not.toContain(change)
        // The notes that carry money: the debt on the Cash tile and the stake on the Value tile.
        expect(tiles[2]!.note).toBe(`Debt ${shortMoney(b.debt)}`)
        if (tiles[3]!.note!.startsWith('Your stake')) expect(tiles[3]!.note).toBe(`Your stake ${shortMoney(stakeValue(b))}`)
        // The values are the books' own, in the same prices.
        expect(tiles[0]!.value).toBe(shortMoney(Math.abs(b.last!.net)))
        expect(tiles[2]!.value).toBe(shortMoney(b.cash))
      })

      // The P&L tab draws the bridge ("Sales after sales tax +$73K") and the Market tab prints the same drivers in words. They were
      // written five percent apart in the photo; now they are one number in one set of prices.
      it('prints the market note in the prices of the bridge on the P&L tab', () => {
        const stale = builtUnder(built)
        setMoneyDisplay(opened)
        bindMoneyContext(world.g)
        const now = reportDataNow(world.g, stale) as Record<string, Json>
        const note = now.marketNote as string
        const r = economicReportOf(readBiz(world.g, world.a))!
        expect(note).toContain(`Net profit ${r.delta > 0 ? 'rose' : 'fell'} ${money(Math.abs(r.delta))} from ${r.previousYear}.`)
        const bridge = readReportCharts(now.chart)!.bridge!
        const steps = bridge.steps!.filter((s) => s.kind === 'delta')
        expect(steps.length).toBeGreaterThan(1)
        const top = [...r.drivers].sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount)).slice(0, 3)
        for (const d of top) {
          const sign = d.amount >= 0 ? '+' : String.fromCharCode(0x2212)
          expect(note, d.label).toContain(`${d.label.toLowerCase()} ${sign}${money(Math.abs(d.amount))}`)
          const step = steps.find((s) => s.value === d.amount)
          expect(step, d.label).toBeDefined()
          // The tab's label for the row and the note's figure are the same amount, within the rounding of "$73K".
          const label = unmoney(formatSigned('money', step!.value))
          const printed = unmoney(money(Math.abs(d.amount))).value * (d.amount < 0 ? -1 : 1)
          expect(Math.abs(label.value - printed), `${formatSigned('money', step!.value)} against ${money(Math.abs(d.amount))}`).toBeLessThanOrEqual(label.half + 1e-6)
        }
      })

      it('writes the three texts again, and only those', () => {
        const stale = builtUnder(built)
        const fresh = builtUnder(opened)
        setMoneyDisplay(opened)
        bindMoneyContext(world.g)
        const now = reportDataNow(world.g, stale) as Record<string, Json>
        expect(textsOf(now)).toEqual(textsOf(fresh))
        // The charts name the prices the sentences are written in.
        expect((now.chart as { basis: number }).basis).toBe(opened.nominal ? world.g.year : PRESENT_YEAR)
        // The plan (ranges, price, production, the talent hint) stays as it was queued.
        const { lines: _l, marketNote: _m, chart: _c, ...queued } = stale
        const { lines: _l2, marketNote: _m2, chart: _c2, ...rest } = now
        expect(rest).toEqual(queued)
      })
    })
  }

  it('writes the Business instinct again too, since its text names prices', () => {
    const { g } = world
    g.character.talents = ['Business']
    try {
      const stale = builtUnder(AS_LIVED)
      const fresh = builtUnder(TODAY)
      expect(stale.talentHint).toBeDefined()
      expect((stale.talentHint as { text: string }).text).not.toBe((fresh.talentHint as { text: string }).text)
      setMoneyDisplay(TODAY)
      bindMoneyContext(g)
      expect((reportDataNow(g, stale) as Record<string, Json>).talentHint).toEqual(fresh.talentHint)
    } finally {
      g.character.talents = undefined
    }
  })

  it('is the same page when the display did not change', () => {
    for (const display of [TODAY, AS_LIVED]) {
      const data = builtUnder(display)
      expect(textsOf(reportDataNow(world.g, data) as Record<string, Json>)).toEqual(textsOf(data))
      expect(pageUnder(display, data)).toBe(pageUnder(display, builtUnder(display)))
    }
  })
})

describe('reportDataNow', () => {
  it('hands data back as it was when the company is gone, the year moved on, or the data is not a report', () => {
    const data = builtUnder(AS_LIVED)
    const g = world.g
    setMoneyDisplay(TODAY)
    bindMoneyContext(g)
    expect(reportDataNow(g, { ...data, assetId: 'nobody' })).toEqual({ ...data, assetId: 'nobody' })
    const later = { ...data, year: (data.year as number) + 1 }
    expect(reportDataNow(g, later)).toBe(later)
    for (const junk of [null, 7, 'x', [], {}, { assetId: 3 }]) expect(reportDataNow(g, junk as Json)).toBe(junk)
    // A fake game with no companies, the kind the card tests use.
    const fake = { queue: [], assets: [] } as unknown as typeof g
    expect(reportDataNow(fake, data)).toBe(data)
  })

  it('writes nothing, draws no random number and leaves the data it was given alone', () => {
    const { g } = world
    const data = builtUnder(AS_LIVED)
    const before = JSON.stringify(g)
    const dataBefore = JSON.stringify(data)
    const rng = g.rng
    setMoneyDisplay(TODAY)
    bindMoneyContext(g)
    reportDataNow(g, data)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
    expect(JSON.stringify(data)).toBe(dataBefore)
  })

  it('runs on a deep frozen game, as a render must: the card reads the game and never writes it', () => {
    const data = builtUnder(AS_LIVED)
    const frozen = deepFreeze(structuredClone(world.g))
    setMoneyDisplay(TODAY)
    bindMoneyContext(frozen)
    const now = reportDataNow(frozen, data) as Record<string, Json>
    // Not handed back untouched: the texts were really written again (a throw would have returned the data as it was).
    expect(now).not.toBe(data)
    expect(now.marketNote).not.toBe(data.marketNote)
    expect(textsOf(now)).toEqual(textsOf(builtUnder(TODAY)))
  })

  it('keeps a text-layout report a text-layout report: it gets no book it did not have', () => {
    const data = builtUnder(AS_LIVED)
    const { chart: _chart, ...plain } = data
    setMoneyDisplay(TODAY)
    bindMoneyContext(world.g)
    const now = reportDataNow(world.g, plain as Json) as Record<string, Json>
    expect('chart' in now).toBe(false)
    expect(now.marketNote).toBe(builtUnder(TODAY).marketNote)
  })
})
