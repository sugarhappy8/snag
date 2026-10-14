// Heavy R&D, the whole story through real code (spec 1 and 5): a company with cash and a few lines
// retires one, starts a breakthrough from the Products screen, the years pass through the real yearly
// flow, and the launch roll decides. Over several seeds both branches must happen, in a local trade
// (a restaurant, four years, a national market) and a tradable one (manufacturing, six years, the
// world market). A launch is in the news, lifts the whole trade and the company's own share, and
// rivals follow no sooner than the pioneer's own development time (a giant first, a small rival last).
// A flop loses the money and leaves nothing behind. The retired line never comes back as an idea.
// No rule is mocked.
import { beforeAll, describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { marketCtxFor, planFor } from '../src/game/business/economy'
import { breakthroughsFor } from '../src/game/business/heavy-data'
import { heavyBlock, heavyCost, heavyKey, heavyOffers, readHeavy } from '../src/game/business/heavy-rd'
import { industryDef } from '../src/game/business/industries'
import { fieldFor } from '../src/game/business/product-market'
import { classicIdeas, productIdeas } from '../src/game/business/products'
import { rdCost, roundBudget } from '../src/game/business/rd'
import { bizOf, type BizState, type RdProject } from '../src/game/business/state'
import { money } from '../src/game/business/util'
import { yearlyBusinessImpl } from '../src/game/business/yearly'
import type { Industry } from '../src/game/data/markets'
import { readMarketNews } from '../src/game/history/market-events'
import type { Asset, GameState, MenuAction, MenuNode } from '../src/game/types'
import { adult, allNodes, company, drain, nextYear } from './market-kit'

interface Case {
  trade: Industry
  /** The market its records live in: a country id, or 'world' for a tradable trade. */
  market: string
  /** The breakthrough the company develops. */
  name: string
  /** Where the market is named in the launch news. */
  where: string
}

const CASES: readonly Case[] = [
  { trade: 'restaurant', market: 'us', name: breakthroughsFor('restaurant')[1].name, where: 'United States' },
  { trade: 'manufacturing', market: 'world', name: breakthroughsFor('manufacturing')[1].name, where: 'worldwide' },
]
/** Seeds are played, trade by trade, until this many of each branch were seen (and at most MAX_SEEDS are played). */
const WANT_EACH = 2
const MAX_SEEDS = 60

interface Popup {
  id: string
  title: string
  text: string
}

interface Play {
  c: Case
  seed: number
  /** The company's asset id and name. */
  id: string
  name: string
  g: GameState
  /** The line that was retired from the Products screen before anything else. */
  retired: string
  /** What the breakthrough cost, and what a normal idea (the first classic one) costs to develop. */
  cost: number
  ideaCost: number
  /** The company's cash just before and after the cost was paid. */
  cashBefore: number
  cashAfter: number
  project: RdProject
  /** The year the project started. */
  start: number
  /** What the row said before anything was spent: its subtitle and the sentence that asked to confirm. */
  promise: { subtitle: string; confirm: string }
  /** Notices the year-ends queued (read before they were answered). */
  popups: Popup[]
  /** The world in the first year the line is on sale (launch branch only). */
  atLaunch?: GameState
  /** Fiscal years whose year-end reported a rival launching its own, after the launch (launch branch only). */
  followed: number[]
}

const textsOf = (g: GameState): string[] => g.log.flatMap((y) => y.entries.map((e) => e.text))

/** One real fiscal year, as market-kit's nextYear, but the notices it queued are read before they are answered. */
function step(g: GameState): Popup[] {
  g.year += 1
  g.character.age += 1
  g.yearActions = {}
  yearlyBusinessImpl(g)
  const seen = g.queue.flatMap((m): Popup[] => (m.kind === 'notice' ? [{ id: m.id, title: m.title, text: m.text }] : []))
  drain(g)
  return seen
}

function rows(g: GameState, a: Asset): MenuNode[] {
  return allNodes(g, businessAssetView(g, a))
}

function rowOf(g: GameState, a: Asset, prefix: string): MenuAction | null {
  const n = rows(g, a).find((x) => x.type === 'action' && x.id.startsWith(prefix))
  return n && n.type === 'action' ? n : null
}

/** The Products screen as text: headings, info lines and every row's label, subtitle and reason. */
function productsText(g: GameState, a: Asset): string {
  const menu = rows(g, a).find((n) => n.type === 'menu' && n.id === `biz.products.${a.id}`)
  if (!menu || menu.type !== 'menu') throw new Error('no products menu')
  const out: string[] = []
  for (const n of menu.children(g)) {
    if (n.type === 'info') out.push(typeof n.text === 'function' ? n.text(g) : n.text)
    else if (n.type === 'heading') out.push(n.label)
    else out.push(n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle ?? '', n.disabledReason?.(g) ?? '')
  }
  return out.join('\n')
}

const live = (g: GameState, id: string): { a: Asset; b: BizState } => {
  const a = g.assets.find((x) => x.id === id)
  if (!a) throw new Error('no company')
  return { a, b: bizOf(g, a) }
}

/**
 * The same world had the company never done the R&D: no record in the market and no breakthrough line on
 * sale. (The line goes too: a line of this name with no record reads as an ordinary mature kind that
 * every rival already sells, which is not a world without the breakthrough.)
 */
function withoutBreakthrough(world: GameState, p: Play): GameState {
  const clone = structuredClone(world)
  delete clone.flags[heavyKey(p.c.trade, p.c.market)]
  const b = live(clone, p.id).b
  b.products = b.products.filter((x) => x.name !== p.c.name)
  return clone
}

/** A grown-up with plenty of cash, six sites and three lines on sale, one year booked. */
function setup(c: Case, seed: number): { g: GameState; a: Asset } {
  const g = adult(seed, 2030, 'us')
  const a = company(g, c.trade, { cash: 400_000_000, outlets: 6 })
  nextYear(g)
  g.queue = []
  const b = bizOf(g, a)
  b.products = productIdeas(g, b, 3).map((name, i) => ({ name, launched: g.year - 3 + i, boost: 0, quality: 60 }))
  return { g, a }
}

function playSeed(c: Case, seed: number): Play {
  const { g, a } = setup(c, seed)
  const b = bizOf(g, a)
  const at = `${c.trade} seed ${seed}`
  expect(b.products, at).toHaveLength(3)

  // Retire one line from the Products screen: R&D never offers it again.
  const retired = b.products[0].name
  const retire = rowOf(g, a, `biz.retire.${retired}.`)
  if (!retire) throw new Error(`${at}: no retire row`)
  retire.run(g)
  expect(bizOf(g, a).products.map((p) => p.name), at).not.toContain(retired)
  g.queue = []

  // Start the breakthrough from its row.
  const row = rowOf(g, a, `biz.heavy.${c.name}.`)
  if (!row) throw new Error(`${at}: no Heavy R&D row`)
  expect(row.disabledReason?.(g) ?? null, at).toBeNull()
  const cost = heavyCost(g, b)
  if (cost === null) throw new Error(`${at}: no price`)
  const ideaCost = rdCost(b, classicIdeas(g, b)[0])
  const cashBefore = b.cash
  const start = g.year
  const promise = { subtitle: typeof row.subtitle === 'function' ? row.subtitle(g) : row.subtitle ?? '', confirm: row.confirm?.(g) ?? '' }
  row.run(g)
  const project = bizOf(g, a).rd?.find((p) => p.heavy === true)
  if (!project) throw new Error(`${at}: no project`)
  const cashAfter = bizOf(g, a).cash
  g.queue = []

  // Every year of the story, the retired line stays out of the ideas.
  const kept = (): void => {
    const now = bizOf(g, a)
    expect(now.retired, `${at} ${g.year}`).toContain(retired)
    expect(productIdeas(g, now, 300), `${at} ${g.year}`).not.toContain(retired)
  }

  // The project's years, through the real yearly flow.
  const popups: Popup[] = []
  for (let i = 0; i < project.years; i++) {
    popups.push(...step(g))
    kept()
  }

  const play: Play = { c, seed, id: a.id, name: a.name, g, retired, cost, ideaCost, cashBefore, cashAfter, project, start, promise, popups, followed: [] }
  if (readHeavy(g, c.trade, c.market).length === 0) return play

  // It launched: keep the world as it is in the first year of sales, then let the years run until a rival
  // follows, and three years more to see that it is said only once.
  play.atLaunch = structuredClone(g)
  const rec = readHeavy(g, c.trade, c.market)[0]
  const until = rec.year + rec.years * 2 + 2
  const reports = () => textsOf(g).filter((t) => t.endsWith(`launches its own ${c.name}.`)).length
  let after = 0
  while (g.year < until && after < 3) {
    const before = reports()
    step(g)
    kept()
    if (reports() > before) play.followed.push(g.year - 1)
    if (play.followed.length) after++
  }
  return play
}

const isLaunch = (p: Play): boolean => p.atLaunch !== undefined

let plays: Play[] = []

beforeAll(() => {
  const found: Play[] = []
  for (const c of CASES) {
    let launches = 0
    let flops = 0
    for (let seed = 1; seed <= MAX_SEEDS && !(launches >= WANT_EACH && flops >= WANT_EACH); seed++) {
      const p = playSeed(c, seed)
      found.push(p)
      if (isLaunch(p)) launches++
      else flops++
    }
  }
  plays = found
}, 480_000)

const launches = (): Play[] => plays.filter(isLaunch)
const flops = (): Play[] => plays.filter((p) => !isLaunch(p))
const tag = (p: Play, more = ''): string => `${p.c.trade} seed ${p.seed}${more}`

describe('the story of one breakthrough, over several seeds', () => {
  it('plays seeds until both branches happened, in each trade', () => {
    for (const c of CASES) {
      const own = plays.filter((p) => p.c === c)
      // Fails if either branch never happened within the cap.
      expect(own.filter(isLaunch).length, `${c.trade}: seeds that launched`).toBeGreaterThanOrEqual(WANT_EACH)
      expect(own.filter((p) => !isLaunch(p)).length, `${c.trade}: seeds that flopped`).toBeGreaterThanOrEqual(WANT_EACH)
      expect(own.length).toBeLessThanOrEqual(MAX_SEEDS)
    }
    // The two trades differ where it matters: the years it takes and the market it lives in.
    expect(new Set(plays.map((p) => p.project.years)).size).toBeGreaterThan(1)
  })

  it('every seed ends on exactly one of the two branches, with nothing half done', () => {
    for (const p of plays) {
      const { g, c } = p
      const { b } = live(g, p.id)
      const records = readHeavy(g, c.trade, c.market)
      const line = b.products.find((x) => x.name === c.name)
      // The project is decided and gone, and the five-year wait started in the year of the roll.
      expect(b.rd?.some((x) => x.id === p.project.id) ?? false, tag(p)).toBe(false)
      expect(b.heavyLast, tag(p)).toBe(p.start + p.project.years - 1)
      if (isLaunch(p)) {
        expect(records, tag(p)).toHaveLength(1)
        expect(line, tag(p)).toBeDefined()
        expect(readMarketNews(g).length, tag(p)).toBe(1)
        expect(textsOf(g), tag(p)).toContain(`${p.name} launched ${c.name}.`)
        expect(textsOf(g).some((t) => t.includes(c.name) && t.includes('flopped')), tag(p)).toBe(false)
      } else {
        expect(records, tag(p)).toEqual([])
        expect(line, tag(p)).toBeUndefined()
        expect(readMarketNews(g), tag(p)).toEqual([])
        expect(textsOf(g).some((t) => t.includes(`launched ${c.name}`)), tag(p)).toBe(false)
        expect(textsOf(g), tag(p)).toContain(`${p.name}'s ${c.name} flopped.`)
      }
    }
  })

  it('the retired line is never offered again, in any year of the story', () => {
    for (const p of plays) {
      const { a, b } = live(p.g, p.id)
      // (Every year of the story was checked while it was played, see playSeed.)
      expect(b.retired, tag(p)).toContain(p.retired)
      expect(b.products.some((x) => x.name === p.retired), tag(p)).toBe(false)
      expect(productIdeas(p.g, b, 300), tag(p)).not.toContain(p.retired)
      expect(rowOf(p.g, a, `biz.launch.${p.retired}.`), tag(p)).toBeNull()
      if (p.atLaunch) expect(productIdeas(p.atLaunch, live(p.atLaunch, p.id).b, 300), tag(p, ' at launch')).not.toContain(p.retired)
    }
  })

  it('the row said the cost, the years, the odds and when rivals could follow before anything was spent', () => {
    for (const p of plays) {
      const { subtitle, confirm } = p.promise
      const odds = `${Math.round(p.project.odds * 100)}% odds`
      expect(subtitle, tag(p)).toContain(money(p.cost))
      expect(subtitle, tag(p)).toContain(`${p.project.years} years`)
      expect(subtitle, tag(p)).toContain(odds)
      expect(subtitle, tag(p)).toContain(`rivals could follow about ${p.start + 2 * p.project.years}`)
      expect(confirm, tag(p)).toContain(money(p.cost))
      expect(confirm, tag(p)).toContain(`${p.project.years} years`)
      expect(confirm, tag(p)).toContain(odds)
      // And the promise holds: the first rival can't have one before the year it named.
      if (isLaunch(p)) {
        const rec = readHeavy(p.g, p.c.trade, p.c.market)[0]
        expect(rec.year + rec.years, tag(p)).toBe(p.start + 2 * p.project.years)
        expect(p.followed[0] + 1, tag(p)).toBeGreaterThanOrEqual(p.start + 2 * p.project.years)
      }
    }
  })

  it('starting took exactly the cost from company cash: 8 times a normal idea, in a project of 4 to 6 years', () => {
    for (const p of plays) {
      expect(p.cashAfter, tag(p)).toBe(p.cashBefore - p.cost)
      expect(p.cost, tag(p)).toBe(roundBudget(8 * p.ideaCost))
      expect(p.cost, tag(p)).toBeGreaterThan(7.5 * p.ideaCost)
      expect(p.project, tag(p)).toMatchObject({ heavy: true, family: p.c.name, kind: 'breakthrough', cost: p.cost, budget: p.cost })
      expect(p.project.years).toBeGreaterThanOrEqual(4)
      expect(p.project.years).toBeLessThanOrEqual(6)
      expect(p.project.odds).toBeGreaterThanOrEqual(0.08)
      expect(p.project.odds).toBeLessThanOrEqual(0.6)
    }
  })
})

describe('when it works', () => {
  it('writes the record, puts the line on sale and makes the news', () => {
    for (const p of launches()) {
      const g = p.atLaunch!
      const { c } = p
      const { a, b } = live(g, p.id)
      const rec = readHeavy(g, c.trade, c.market)[0]
      expect(rec, tag(p)).toMatchObject({ family: c.name, year: p.start + p.project.years, years: p.project.years, cost: p.cost, by: p.id })
      expect(g.year, tag(p)).toBe(rec.year)
      const line = b.products.find((x) => x.name === c.name)
      expect(line, tag(p)).toMatchObject({ family: c.name, kind: 'breakthrough', launched: rec.year, quality: rec.quality })
      expect(textsOf(g), tag(p)).toContain(`${a.name} launched ${c.name}.`)
      // The modal was queued once, with the title and id the news list carries.
      const title = `${c.name}: a New Kind of ${industryDef(c.trade).label}`
      const modals = p.popups.filter((m) => m.title === title)
      expect(modals, tag(p)).toHaveLength(1)
      expect(modals[0].text, tag(p)).toContain(c.name)
      expect(modals[0].text, tag(p)).toContain(c.where)
      expect(modals[0].text, tag(p)).toContain(String(rec.year + rec.years))
      const news = readMarketNews(g)
      expect(news, tag(p)).toHaveLength(1)
      expect(news[0], tag(p)).toMatchObject({ id: modals[0].id, year: rec.year, industry: c.trade, market: c.market, title })
    }
  })

  it('lifts demand for the whole trade for the next four years, above the same world with no record', () => {
    for (const p of launches()) {
      const world = p.atLaunch!
      const base = withoutBreakthrough(world, p)
      const rec = readHeavy(world, p.c.trade, p.c.market)[0]
      expect(readHeavy(base, p.c.trade, p.c.market), tag(p)).toEqual([])
      const ratios: number[] = []
      for (let y = rec.year; y < rec.year + 4; y++) {
        const pot = marketCtxFor(world, live(world, p.id).b, y).pot
        const flat = marketCtxFor(base, live(base, p.id).b, y).pot
        expect(Number.isFinite(pot) && Number.isFinite(flat) && flat > 0, tag(p, ` ${y}`)).toBe(true)
        expect(pot, tag(p, ` year ${y}`)).toBeGreaterThan(flat)
        ratios.push(pot / flat)
      }
      // The lift builds up over the first years and never passes the cap.
      expect(ratios[1], tag(p)).toBeGreaterThanOrEqual(ratios[0])
      expect(ratios[2], tag(p)).toBeGreaterThanOrEqual(ratios[1])
      for (const r of ratios) expect(r, tag(p)).toBeLessThanOrEqual(1.4 + 1e-9)
    }
  })

  it('raises the company’s own share and customers for the next four years, above the same world with no record', () => {
    for (const p of launches()) {
      const world = p.atLaunch!
      const base = withoutBreakthrough(world, p)
      const rec = readHeavy(world, p.c.trade, p.c.market)[0]
      for (let y = rec.year; y < rec.year + 4; y++) {
        const now = planFor(world, live(world, p.id).b, y, { calm: true }).market
        const was = planFor(base, live(base, p.id).b, y, { calm: true }).market
        if (!now || !was) throw new Error(`${tag(p, ` year ${y}`)}: no market`)
        expect(now.share, tag(p, ` year ${y}`)).toBeGreaterThan(was.share)
        expect(now.units, tag(p, ` year ${y}`)).toBeGreaterThan(was.units)
      }
    }
  })

  it('no rival offers it before the development time is over, a giant by one year after, a small one later still', () => {
    let giants = 0
    let smalls = 0
    for (const p of launches()) {
      const world = p.atLaunch!
      const { b } = live(world, p.id)
      const rec = readHeavy(world, p.c.trade, p.c.market)[0]
      const offers = (y: number) => {
        const ctx = marketCtxFor(world, b, y)
        const field = fieldFor(ctx)
        return { ctx, field, versions: field.versions(p.c.name) }
      }
      // Before the launch there is no such product at all.
      expect(offers(rec.year - 1).field.of(p.c.name).exists, tag(p)).toBe(false)
      // Nobody, big or small, has one before the pioneer's own development time has passed.
      for (let y = rec.year; y < rec.year + rec.years; y++) {
        const { field, versions } = offers(y)
        expect(field.of(p.c.name).exists, tag(p, ` ${y}`)).toBe(true)
        expect(field.of(p.c.name).offer, tag(p, ` ${y}`)).toBe(0)
        expect(versions.every((v) => v === -1), tag(p, ` ${y}`)).toBe(true)
      }
      // A giant has its own by launch + years + 1 (and keeps it).
      for (let y = rec.year + Math.ceil(rec.years * 1.0) + 1; y < rec.year + Math.ceil(rec.years * 1.0) + 4; y++) {
        const { ctx, versions } = offers(y)
        ctx.rivals.forEach((r, i) => {
          if (r.tier !== 'giant') return
          giants++
          expect(versions[i], tag(p, ` giant ${r.id} in ${y}`)).toBeGreaterThanOrEqual(0)
        })
      }
      // A small rival has none before launch + 2 x years.
      for (let y = rec.year; y < rec.year + Math.ceil(rec.years * 2.0); y++) {
        const { ctx, versions } = offers(y)
        ctx.rivals.forEach((r, i) => {
          if (r.tier !== 'small') return
          smalls++
          expect(versions[i], tag(p, ` small ${r.id} in ${y}`)).toBe(-1)
        })
      }
      // Whatever a rival has is a little worse than the pioneer's, never better.
      for (let y = rec.year; y < rec.year + 20; y++) for (const v of offers(y).versions) if (v >= 0) expect(v, tag(p, ` ${y}`)).toBeLessThanOrEqual(rec.quality)
    }
    // The checks above really looked at a giant and at a small rival.
    expect(giants).toBeGreaterThan(0)
    expect(smalls).toBeGreaterThan(0)
  })

  it('the first rival to follow is reported once, not before the development time, not long after', () => {
    for (const p of launches()) {
      const rec = readHeavy(p.g, p.c.trade, p.c.market)[0]
      expect(p.followed, tag(p)).toHaveLength(1)
      expect(p.followed[0], tag(p)).toBeGreaterThanOrEqual(rec.year + rec.years - 1)
      expect(p.followed[0], tag(p)).toBeLessThanOrEqual(rec.year + rec.years * 2 + 1)
      expect(typeof rec.rival, tag(p)).toBe('string')
      expect(textsOf(p.g).filter((t) => t.endsWith(`launches its own ${p.c.name}.`)), tag(p)).toHaveLength(1)
    }
  })

  it('the Products screen says when rivals can follow, and does not offer the launched breakthrough again', () => {
    let waiting = 0
    for (const p of launches()) {
      const world = p.atLaunch!
      const { a, b } = live(world, p.id)
      const rec = readHeavy(world, p.c.trade, p.c.market)[0]
      expect(productsText(world, a), tag(p)).toContain(`rivals can have their own from about ${rec.year + rec.years}`)
      expect(rowOf(world, a, `biz.heavy.${p.c.name}.`), tag(p)).toBeNull()
      expect(heavyOffers(world, b, p.id).map((x) => x.name), tag(p)).not.toContain(p.c.name)
      // The next breakthrough of the trade waits five years from the roll.
      for (const other of heavyOffers(world, b, p.id)) {
        waiting++
        expect(heavyBlock(world, b, other.name, p.id), tag(p)).toContain(`can start in ${p.start + p.project.years - 1 + 5}`)
      }
    }
    expect(waiting).toBeGreaterThan(0)
  })
})

describe('when it flops', () => {
  it('the money is gone for good, with no record, no line and no news', () => {
    for (const p of flops()) {
      const { c } = p
      const { b } = live(p.g, p.id)
      // The cost left company cash when the project started...
      expect(p.cashAfter, tag(p)).toBe(p.cashBefore - p.cost)
      // ...and nothing came back: the year-end that decided it says what was lost, and leaves no trace of the kind.
      const flop = p.popups.find((m) => m.title.endsWith('R&D Results'))
      expect(flop, tag(p)).toBeDefined()
      expect(flop!.text, tag(p)).toContain(`${c.name} flopped in testing (${money(p.cost)} of R&D)`)
      expect(readHeavy(p.g, c.trade, c.market), tag(p)).toEqual([])
      expect(p.g.flags[heavyKey(c.trade, c.market)], tag(p)).toBeUndefined()
      expect(b.products.some((x) => x.name === c.name), tag(p)).toBe(false)
      expect(readMarketNews(p.g), tag(p)).toEqual([])
      expect(p.popups.some((m) => m.title.includes('a New Kind of')), tag(p)).toBe(false)
      // The trade's demand is exactly what it was: no pulse.
      const flat = withoutBreakthrough(p.g, p)
      for (let y = p.g.year; y < p.g.year + 4; y++) expect(marketCtxFor(p.g, b, y).pot, tag(p, ` ${y}`)).toBe(marketCtxFor(flat, live(flat, p.id).b, y).pot)
    }
  })

  it('the breakthrough is still offered after the five-year wait, and not before', () => {
    for (const p of flops()) {
      const { b } = live(p.g, p.id)
      const roll = p.start + p.project.years - 1
      expect(heavyOffers(p.g, b, p.id).map((x) => x.name), tag(p)).toContain(p.c.name)
      // Waiting: the row is there but says when it can start.
      expect(heavyBlock(p.g, b, p.c.name, p.id), tag(p)).toContain(`can start in ${roll + 5}`)
      // After the wait, with the cash for it, nothing blocks it.
      const later = structuredClone(p.g)
      later.year = roll + 5
      const lb = live(later, p.id).b
      lb.cash = 500_000_000
      expect(heavyBlock(later, lb, p.c.name, p.id), tag(p)).toBeNull()
    }
  })
})
