// R2-P4 (K.7b f, F.1 Ceilings): the probe rows behind test/ceiling-probe.test.ts. test/ceiling-list.json names every growth term
// that has a real-world cap; this file has one row for each, which feeds the term inputs a hundred times what a life reaches (a
// country's wealth, a book's readers, a podcast's audience, a year far in the future) and reports the worst value it saw against the
// limit the cap sentence promises. The rows call the game's exported functions only, so another track moving a module's insides
// does not touch them.
//
// A row's `run(scale)` returns the tightest case it found, the one with the highest value over limit; `value` must be at most
// `limit`. `at` says which case that was ("ng in 1950"), so a failure points at the input and not only at the term.
//
// To cover a new cap: add the entry to test/ceiling-list.json and a row here in the same commit.
import { WAVE_KINDS, type WaveKind } from '../src/game/business/tech-wave-data'
import { announceWave, readTechWaves, type WaveInput } from '../src/game/business/tech-waves'
import { TOP_CEO_MAX_PTS } from '../src/game/business/ceo-edge'
import { heavyOdds, heavyQuote } from '../src/game/business/heavy-rd'
import { opsOdds, opsQuote } from '../src/game/business/lab-rules'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { classicIdeas } from '../src/game/business/products'
import { bizOf } from '../src/game/business/state'
import { valKey } from '../src/game/business/valuation-fog'
import { rdCost, rdQuote } from '../src/game/business/rd'
import { ECONOMY_VERSION, initialCountry } from '../src/game/economy/model'
import { typicalIncome, US_TYPICAL_INCOME } from '../src/game/events/wealth-core'
import { withFlags } from '../src/game/flags'
import { realWealthFactor } from '../src/game/history/events-people'
import { buySecurity, investmentHoldings, investmentListing, yearlyInvestments } from '../src/game/investments'
import { personFacts, DATA_STATS } from '../src/game/hubs/people-facts'
import { memoryLines } from '../src/game/hubs/people-memory'
import { connectionsOf } from '../src/game/hubs/people-web'
import { KNOW_LIMITS, buyIntel, learn, offersFor, readKnow } from '../src/game/knowledge/contract'
import { kindOfKey } from '../src/game/knowledge/kinds'
import { withInfoMode } from '../src/game/knowledge/mode'
import { yearlyKnowledge } from '../src/game/knowledge/module'
import { SOURCES, SOURCE_IDS, priceOf, readingSd } from '../src/game/knowledge/sources'
import { personEntity } from '../src/game/kernel/person-ref'
import { BURNS, LEDGER_CAPS, MINTS, book, bookBurn, bookMint, checkLedger, peekLedger, playerAcct, type AcctRef } from '../src/game/kernel/ledger'
import { REASONS, type BurnName, type MintName, type Reason } from '../src/game/kernel/reasons'
import { SPREADS, ask, bid } from '../src/game/kernel/spreads'
import { transactionsLevy } from '../src/game/nation/rates'
import { saveNpcLife, type NpcLife } from '../src/game/npc-state'
import { PEOPLE_CAPS, exposureOf, lookKeysOf } from '../src/game/people-fog'
import { createPerson } from '../src/game/people'
import { editPolicy, writePolicy } from '../src/game/nation/state'
import { authorAdaptationOffer } from '../src/game/special/author-career'
import { normalizeAuthor } from '../src/game/special/author-state'
import { ownerKey } from '../src/game/special/common'
import { yearlyFame } from '../src/game/special/fame'
import { gamersIn, nextTail, publisherCopiesCap, titleCopiesCap } from '../src/game/special/gamedev-core'
import type { ScopeId } from '../src/game/special/gamedev-data'
import { payScale } from '../src/game/special/pay-scale'
import { dealCeiling } from '../src/game/special/sports-core'
import type { GameState, Person } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { readFirms } from '../src/game/world/firms'
import { readHomes } from '../src/game/world/homes'
import { EDGE_CAPS, FRONTIER_CAPS, MET_CAPS } from '../src/game/world/caps'
import { formatMemory, MEMORY_KINDS } from '../src/game/world/edge-memory'
import { putEdge } from '../src/game/world/edge-write'
import { applyDisclosure, frontierLead, frontierRows, readFrontier } from '../src/game/world/frontier'
import { FIELD_IDS, FIELDS, fieldOfKind } from '../src/game/world/frontier-fields'
import { LOD_CAPS, lodSweep, promote, type LodKind } from '../src/game/world/lod'
import { isTomb, normalizeMet, readMet } from '../src/game/world/met'
import { markMet, STAKE, sweepMet, tombstoneMet, touchMet } from '../src/game/world/met-ops'
import { AT_MAX, NUDGE_AXES, NUDGE_MAX, nudgePersona, personaOf, readPersona } from '../src/game/world/persona-me'
import { playerRef, readPeople } from '../src/game/world/people'
import { makeSid } from '../src/game/world/sid'
import { stampSocial } from '../src/game/world/social'
import { APPROACHES, MAX_OVERTIME_BUILDS, buildLimit, resolveBuild } from '../src/game/workshop/build'
import { catalogIdea, type Level } from '../src/game/workshop/catalog'
import { HELPER_CENTRE_MAX, WORKSHOP_TOOLS_MAX, buildNumbers } from '../src/game/workshop/effort'
import { addIdea, mutWorkshop } from '../src/game/workshop/notebook'
import '../src/game/world/shards'
import { EFFORT_ROWS } from './effort-ceilings'
import { makeTestGame } from './helpers'
import { labGame, patchLab } from './lab-kit'
import { flowTotal } from './ledger-kit'

export interface CeilingProbe {
  /** An id of test/ceiling-list.json, or 'extra.<name>' for a probe the list does not name. */
  id: string
  /** The sentence the cap protects. */
  cap: string
  /** Inputs scaled by `scale`; `value` must be at most `limit`. `at` names the case that came closest. */
  run: (scale: number) => { value: number; limit: number; at?: string }
  /** A reason, when no function-level probe is possible. At most MAX_EXEMPT rows may have one. */
  exempt?: string
}

/** The scales a pull request runs, and the nightly (CEILING_PROBE=deep). */
export const SCALES: { light: readonly number[]; deep: readonly number[] } = { light: [1, 100], deep: [1, 10, 100, 1000] }

/** How many rows may be exempt. A ratchet: a fourth needs the lead. */
export const MAX_EXEMPT = 3

export const isExempt = (p: CeilingProbe): boolean => p.exempt !== undefined

// ---------------------------------------------------------------------------------------------- the harness

/** One message for each scale where the row's value is not at most its limit, or where it threw. Empty when the row holds. */
export function probeFailures(p: CeilingProbe, scales: readonly number[]): string[] {
  const out: string[] = []
  for (const scale of scales) {
    try {
      const r = p.run(scale)
      if (!(r.value <= r.limit)) {
        out.push(`${p.id} at ${scale}x: the value ${String(r.value)} is not at most the limit ${String(r.limit)}${r.at ? ` (${r.at})` : ''}. The cap: ${p.cap}`)
      }
    } catch (e) {
      out.push(`${p.id} at ${scale}x: the probe threw: ${e instanceof Error ? e.message : String(e)}. The cap: ${p.cap}`)
    }
  }
  return out
}

/** What is wrong with the set of rows against the ids of test/ceiling-list.json, one message each. Empty when it is sound. */
export function guardProblems(probes: readonly CeilingProbe[], listIds: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of probes) {
    if (seen.has(p.id)) out.push(`${p.id}: the row appears twice`)
    seen.add(p.id)
    if (!listIds.includes(p.id) && !p.id.startsWith('extra.')) out.push(`${p.id}: not in test/ceiling-list.json (a probe of your own takes an id that starts with extra.)`)
    if (p.cap.trim().length === 0) out.push(`${p.id}: the cap sentence is empty`)
    if (isExempt(p)) {
      const why = (p.exempt ?? '').trim()
      if (why.length < 20 || why.split(/\s+/).length < 4) out.push(`${p.id}: exempt without a reason (write a sentence of at least four words)`)
    }
  }
  for (const id of listIds) if (!seen.has(id)) out.push(`${id}: test/ceiling-list.json has it and CEILING_PROBES has no row for it (write one, or exempt it with a reason)`)
  const exempt = probes.filter(isExempt).length
  if (exempt > MAX_EXEMPT) out.push(`${exempt} rows are exempt, more than the ${MAX_EXEMPT} the ratchet allows: ask the lead`)
  return out
}

/** Keeps the case with the highest value over limit; a NaN value counts as the worst there is. */
function tightest(): { add: (value: number, limit: number, at: string) => void; result: () => { value: number; limit: number; at: string } } {
  let best = { value: 0, limit: 1, at: 'no case' }
  let bestRatio = -Infinity
  return {
    add(value, limit, at) {
      const ratio = Number.isNaN(value) ? Infinity : value / limit
      if (ratio > bestRatio) {
        bestRatio = ratio
        best = { value, limit, at }
      }
    },
    result: () => best,
  }
}

/** Runs `fn` with every country's wealth multiplied by `scale`, and puts each one back, even when `fn` throws. */
export function withWealth<T>(scale: number, fn: () => T): T {
  const saved = COUNTRIES.map((c) => c.wealth)
  try {
    for (const c of COUNTRIES) c.wealth *= scale
    return fn()
  } finally {
    COUNTRIES.forEach((c, i) => {
      c.wealth = saved[i]
    })
  }
}

// ---------------------------------------------------------------------------------------------- the rows

const ERAS = [1900, 1950, 2000, 2026, 2100] as const
/** Every year of the span the studio and Olympic rows read, and the one `scale` times today (far past any life). */
const yearsAt = (from: number, to: number, scale: number): number[] => [...Array.from({ length: to - from + 1 }, (_, i) => from + i), 2026 * scale]

/** A life of 30 in a country and year, with nothing else in it. Only its country and year are read. */
function lifeIn(countryId: string, year: number): GameState {
  const g = makeTestGame(1, { age: 30, countryId, birthCountryId: countryId, money: 0 })
  g.year = year
  return g
}

function adaptationRow(id: string, cap: string, pick: 'fee' | 'annual'): CeilingProbe {
  const multiple = pick === 'fee' ? 150 : 15
  return {
    id,
    cap,
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        for (const [countryId, year] of [['us', 2026], ['mc', 2026], ['us', 1930], ['ng', 2026]] as const) {
          const g = lifeIn(countryId, year)
          const readers = 5_000_000 * scale
          const work = normalizeAuthor({
            works: [{ title: 'Probe', format: 'novel', genre: 'mystery', promise: 'mystery', stage: 'published', countryId, started: year - 2, released: year - 1, quality: 95, copies: readers, readers, adaptedUntil: 0 }],
          }).works[0]
          const offer = authorAdaptationOffer(g, work)
          t.add(offer[pick], multiple * typicalIncome(g, work.countryId), `${countryId} in ${year}`)
        }
        return t.result()
      }),
  }
}

/** `x` to nine decimals, so a float that lands one step past a round limit does not read as over it. */
const to9 = (x: number): number => Math.round(x * 1e9) / 1e9

/**
 * R3-M9: builds a year. An ordinary inventor and a genius with `scale` times the money build until the Workshop refuses; the count is at
 * most the year's limit plus the two overtime builds.
 */
function workshopOvertimeRow(): CeilingProbe {
  return {
    id: 'workshop-overtime',
    cap: "a year's builds stop at the pool's limit plus two overtime builds, whatever the weeks, money or skill (R3-M9)",
    run: (scale) => {
      const t = tightest()
      for (const genius of [false, true]) {
        const g = makeTestGame(7, { age: 30, money: 5_000_000 * scale, talents: genius ? ['Inventor'] : [], countryId: 'us' })
        g.year = 2026
        addIdea(g, mutWorkshop(g), catalogIdea('pocket-tool')!)
        let made = 0
        while (made < 1000 && resolveBuild(g, { kind: 'idea', id: 'pocket-tool' }, 'cheap')) made += 1
        t.add(made, buildLimit(g) + MAX_OVERTIME_BUILDS, `${genius ? 'a genius' : 'an ordinary inventor'} with ${scale}x the money`)
      }
      return t.result()
    },
  }
}

/**
 * R3-M9: what the bench adds to a build. Lab access and an assistant are fed `scale` times their full value (and Infinity is read as full);
 * the quality centre gains at most 5 and 3 points, and the blow-up chance falls by at most 1 - 0.85 x 0.92.
 */
function workshopToolsRow(): CeilingProbe {
  return {
    id: 'workshop-tools',
    cap: 'lab access adds at most 5 quality points to a build and an assistant at most 3, and blow-ups never fall below 78 percent of their chance (R3-M9)',
    run: (scale) => {
      const t = tightest()
      const g = lifeIn('us', 2026)
      for (const ap of Object.values(APPROACHES)) {
        for (const d of [1, 3, 5] as Level[]) {
          const def = { cat: 'gadget' as const, d }
          const base = { skill: 0, smarts: 50, genius: false, builds: 0 }
          const none = buildNumbers(g, base, def, ap)
          const full = buildNumbers(g, { ...base, tools: scale, helper: scale }, def, ap)
          t.add(to9((full.low + full.high - (none.low + none.high)) / 2), to9(WORKSHOP_TOOLS_MAX + HELPER_CENTRE_MAX), `the quality centre at ${scale}x, difficulty ${d}`)
          t.add(to9(1 - full.kaboom / none.kaboom), to9(1 - 0.85 * 0.92), `the blow-up cut at ${scale}x, difficulty ${d}`)
        }
      }
      return t.result()
    },
  }
}

/** A saved fame profile in a life of fame 100, one year of fame upkeep, and what the profile holds after it. */
function fameYear(profile: Record<string, unknown>): { podcast: { listeners: number } | null; books: { earned: number; royalty: number }[] } {
  const g = makeTestGame(1, { age: 30, money: 0 })
  g.character.hidden.fame = 100
  g.flags['special.fame'] = { owner: ownerKey(g), books: [], podcast: null, merchLines: 0, commercials: 0, ...profile } as never
  yearlyFame(g)
  return g.flags['special.fame'] as never
}

const TAIL_SCOPES: readonly ScopeId[] = ['jam', 'small', 'indie', 'aa', 'aaa']

const LIFE_ROWS: readonly CeilingProbe[] = [
  {
    id: 'pay-scale',
    cap: 'pay follows the era and country typical income, and the country wealth stops at 1.6 (R0-12)',
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        const g = lifeIn('us', 2026)
        for (const c of COUNTRIES) {
          for (const year of ERAS) {
            g.character.countryId = c.id
            g.year = year
            t.add(payScale(g), 1.6, `payScale in ${c.id} in ${year}`)
            t.add(typicalIncome(g, c.id, year), US_TYPICAL_INCOME * 1.6, `typicalIncome in ${c.id} in ${year}`)
          }
        }
        return t.result()
      }),
  },
  {
    id: 'top-ceo-edge',
    cap: "a top hired CEO adds at most 3 odds points to a company's research and moves no money (R3, J.8)",
    run: (scale) => {
      const t = tightest()
      // A company of a hundred times the cash, the value, the head count and the rating a life reaches, and a budget a hundred times the cost.
      const f = labGame(11, 'restaurant', { year: 2030, cash: 80_000_000 * scale })
      const { g, b } = f
      b.valuation *= scale
      patchLab(b, (d) => {
        d.team = Array.from({ length: 3 * scale }, () => g.year - 1)
      })
      const idea = classicIdeas(g, b)[0]!
      for (const skill of [89, 90, 95, 100, 100 * scale]) {
        b.ceo = 'manager'
        b.manager = { firstName: 'Ada', lastName: 'Grid', gender: 'female', skill, salary: 100_000, since: g.year - 1 }
        const at = `skill ${skill}`
        t.add(heavyQuote(g, b).reasons.find((x) => x.key === 'ceo')?.pts ?? 0, TOP_CEO_MAX_PTS, `a breakthrough at ${at}`)
        t.add(opsQuote(g, b, 3, 'cost').reasons.find((x) => x.key === 'ceo')?.pts ?? 0, TOP_CEO_MAX_PTS, `an Operations program at ${at}`)
        const r = rdQuote(g, b, idea, rdCost(b, idea) * 100 * scale)
        t.add(r.why.find((x) => x.key === 'ceo')?.pts ?? 0, TOP_CEO_MAX_PTS, `a product at ${at}`)
        // The odds stay under the legacy clamp of each system: .6, .92, .95.
        t.add(heavyOdds(g, b), 0.6, `breakthrough odds at ${at}`)
        t.add(opsOdds(g, b, 1), 0.92, `program odds at ${at}`)
        t.add(r.odds, 0.95, `product odds at ${at}`)
      }
      return t.result()
    },
  },
  {
    id: 'endorsement-deal',
    cap: "an endorsement pays at most 40 times the typical income, scaled by the brand's fame (R0-7)",
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        const g = lifeIn('us', 2026)
        for (const c of COUNTRIES) {
          for (const year of ERAS) {
            g.character.countryId = c.id
            g.year = year
            const deal = dealCeiling(g, { fame: 10 })
            t.add(deal / typicalIncome(g), 400, `deal over typical income in ${c.id} in ${year}`)
            t.add(deal, 400 * US_TYPICAL_INCOME * 1.6, `deal in ${c.id} in ${year}`)
          }
        }
        return t.result()
      }),
  },
  {
    id: 'olympic-bonus',
    cap: 'a medal bonus follows the real wealth of the year and the country (R0-7)',
    run: (scale) => {
      const t = tightest()
      for (const year of yearsAt(1800, 3000, scale)) t.add(realWealthFactor(year), 1, `year ${year}`)
      return t.result()
    },
  },
  {
    id: 'studio-title-copies',
    cap: "one title sells to at most 8 percent of the era's gamers (v4.0.1)",
    run: (scale) => {
      const t = tightest()
      for (const year of yearsAt(1900, 3000, scale)) t.add(titleCopiesCap(year) / gamersIn(year), 0.0801, `year ${year}`)
      return t.result()
    },
  },
  {
    id: 'studio-publisher-copies',
    cap: "one owner's studios sell to at most 10 percent of the era's gamers a year (v4.0.1)",
    run: (scale) => {
      const t = tightest()
      for (const year of yearsAt(1900, 3000, scale)) t.add(publisherCopiesCap(year) / gamersIn(year), 0.1001, `year ${year}`)
      return t.result()
    },
  },
  {
    id: 'studio-tail',
    // The quarter a hit may rise in a year (TAIL_SWING) is a constant of the yearly loop in gamestudio.ts; the life-level probe of
    // the nightly (R2-P5) covers it. This row holds the share of buyers who return, which is clamped at 0.6.
    cap: "a hit's next-year sales rise at most a quarter (v4.0.1 trillion fix)",
    run: (scale) => {
      const t = tightest()
      const copies = 1_000_000 * scale
      for (const scope of TAIL_SCOPES) {
        for (let players = 0; players <= 100; players += 5) t.add(nextTail(copies, players, scope), 0.6 * copies, `${scope} at ${players} players`)
      }
      return t.result()
    },
  },
  adaptationRow('adaptation-fee', 'an adaptation fee stops at 150 times the typical income (R0-8)', 'fee'),
  adaptationRow('adaptation-royalty', 'adaptation royalties stop at 15 times the typical income a year (R0-8)', 'annual'),
  workshopOvertimeRow(),
  workshopToolsRow(),
  {
    id: 'podcast-audience',
    cap: '30,000,000 listeners (R0-14)',
    run: (scale) => {
      const after = fameYear({ podcast: { name: 'Probe', listeners: 30_000_000 * scale, episodes: 10, startedAge: 20 } })
      return { value: after.podcast?.listeners ?? 0, limit: 30_000_000, at: 'one year of upkeep' }
    },
  },
  {
    id: 'fame-ledger',
    cap: '1e12 on every fame ledger value, so no income term compounds past it',
    run: (scale) => {
      const after = fameYear({ books: [{ title: 'Probe', age: 30, verdict: 'a bestseller', earned: 1e12 * scale, royalty: 1e12 * scale }] })
      const t = tightest()
      after.books.forEach((b, i) => {
        t.add(b.earned, 1e12, `book ${i} earned`)
        t.add(b.royalty, 1e12, `book ${i} royalty`)
      })
      return t.result()
    },
  },
]

// ---------------------------------------------------------------------------------------------- the world rows (R2-P11)
// The seven caps Ledger-world adds to the list (R2-L2, R2-L13, R2-L16). Each row feeds the cap's input `scale` times what a life
// reaches and reads the number the cap protects from the module's own books, so a moved internal does not move the row.

/** The mints and the burns by name, in table order. */
const MINT_NAMES = Object.keys(MINTS) as MintName[]
const BURN_NAMES = Object.keys(BURNS) as BurnName[]
/** What a sink with a yearly cap of 0 is offered, per booking, to see that it takes none. */
const OFFER_TO_AN_OFF_SINK = 1_000_000_000

/** A fresh life in 2026 whose ledger is empty. */
const ledgerLife = (): GameState => lifeIn('us', 2026)

/**
 * Offers a sink `scale` times its yearly cap, two ways: one booking of the whole volume (as far as a booking may go, 1e15) and
 * `scale` bookings of one cap each. Reads what the sink created or destroyed this year from the ledger's own yearly counter.
 */
function sinkRow(id: string, cap: string, names: readonly string[], limitOf: (name: string) => number, offer: (g: GameState, name: string, acct: AcctRef, amount: number) => number, yearly: (g: GameState, name: string) => number): CeilingProbe {
  return {
    id,
    cap,
    run: (scale) => {
      const t = tightest()
      for (const name of names) {
        const g = ledgerLife()
        const limit = limitOf(name)
        const step = limit > 0 ? limit : OFFER_TO_AN_OFF_SINK
        offer(g, name, playerAcct(g), Math.min(LEDGER_CAPS.maxBooking, step * scale))
        for (let i = 0; i < scale; i++) offer(g, name, playerAcct(g), step)
        t.add(yearly(g, name), limit, `${name} offered ${scale} times its cap`)
      }
      return t.result()
    },
  }
}

/** Two-year volumes of a row: the number of years it is replayed for at `scale` (a roll must not let a cap reset early). */
const yearsFor = (scale: number): number => Math.max(1, Math.min(30, Math.round(Math.log10(scale * 10))))

/** A scratch person id (the ledger needs a valid ref), and the same for any other kind. */
const refOf = (kind: string, i: number): AcctRef => `${kind}:s${i}` as AcctRef

/** A bond held for one more year at `scale * 1_000` units with a mark `scale` times par, and what the government paid on redemption. */
function bondRedemption(scale: number): { paid: number; units: number; face: number } {
  const g = makeTestGame(7, { age: 30, money: 100_000, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.lifeId = 'ceiling-bond'
  const bond = investmentListing(g).find((q) => q.type === 'bond')
  if (!bond) throw new Error('no bond for sale in 2026')
  if (!buySecurity(g, bond.secId, 10_000, true)) throw new Error('the probe cannot buy a bond')
  const held = investmentHoldings(g)[0]!
  const face = bond.price
  const units = scale * 1_000
  const d = held.details
  d.units = units
  d.price = face * scale
  d.yield = 0
  d.maturity = g.year + 1
  held.value = units * face * scale
  // The next year, with prices flat (inflation 0, so dep is 0): the live economy of the country says so.
  const next = g.year + 1
  const flat = { ...initialCountry('us', next), inflation: 0 }
  g.flags.worldEconomy = { v: ECONOMY_VERSION, year: next, countries: { us: flat }, previous: {}, history: {} } as never
  g.year = next
  g.character.age += 1
  g.yearActions = {}
  g.queue = []
  yearlyInvestments(g)
  return { paid: -flowTotal(g, 'bond.redeem', 'gov'), units, face }
}

/** The most ids the probe walks through `promote` itself: it rewrites a shard on every call (about 125 microseconds), so 400,000 calls take a minute. */
const PROMOTE_WALK = 1_000

/** The rows the reader of each shard keeps (the hard bound of a hostile load), and the rows the yearly sweep leaves (what R2 names of the kind). */
const READ_CAP: Readonly<Record<LodKind, number>> = { person: LOD_CAPS.people, firm: LOD_CAPS.firms, home: LOD_CAPS.homes }
const SWEEP_CAP: Readonly<Record<LodKind, number>> = { person: LOD_CAPS.intimate, firm: LOD_CAPS.firms, home: LOD_CAPS.homes }
const READERS = { person: readPeople, firm: readFirms, home: readHomes } as const
const SHARD_OF = { person: 'people', firm: 'firms', home: 'homes' } as const

/** Promotes up to PROMOTE_WALK made-up ids of one kind through `promote`, then sweeps, and reports the rows the shard holds before and after the sweep. */
function lodWalk(kind: LodKind, count: number): { before: number; after: number } {
  const g = ledgerLife()
  for (let i = 0; i < Math.min(count, PROMOTE_WALK); i++) promote(g, kind, refOf(kind, i) as never)
  const before = READERS[kind](g).rows.length
  lodSweep(g)
  return { before, after: READERS[kind](g).rows.length }
}

/** A world that came in with `count` rows of one kind (a hostile or damaged save): what the reader keeps, then what the sweep leaves. */
function lodFlood(kind: LodKind, count: number): { read: number; after: number } {
  const g = ledgerLife()
  const owner = refOf('person', 0)
  const rows = Array.from({ length: count }, (_, i) => {
    const id = refOf(kind, i)
    return kind === 'person' ? { id, seen: g.year } : kind === 'firm' ? { id, form: 'npc', owner, seen: g.year } : { id, owner, seen: g.year }
  })
  g.world = { v: 1, [SHARD_OF[kind]]: { v: 1, rows, over: 0 } } as never
  const read = READERS[kind](g).rows.length
  lodSweep(g)
  return { read, after: READERS[kind](g).rows.length }
}

/** Every value is one node, the way the save loader counts (save-schema.ts finiteJsonTree). */
function jsonNodes(value: unknown): number {
  let n = 0
  const stack: unknown[] = [value]
  while (stack.length > 0) {
    const item = stack.pop()
    n++
    if (item !== null && typeof item === 'object') for (const kid of Array.isArray(item) ? item : Object.values(item)) stack.push(kid)
  }
  return n
}

/** The nodes of a Met record at its fullest (itself, 12 fields, the axes list and five axes, the died year, the role tag and the job ref) and of a tombstone (the list and seven). */
const MET_RECORD_NODES = 22
const MET_TOMB_NODES = 8
/** The worst case of the whole shard: 400 full records, 200 tombstones and the map root (world/caps.ts MET_CAPS, docs/PEOPLE.md). */
const MET_SHARD_NODES = MET_CAPS.records * MET_RECORD_NODES + MET_CAPS.tombs * MET_TOMB_NODES + 1

/** The i-th person of a flood: a sid for every i, different for each up to a million people (the cohort cycles every 100, the ord counts the cycles). */
const floodSid = (i: number): string => makeSid({ kind: i % 2 === 0 ? 'cls' : 'cow', place: 'us', cohort: 1900 + (i % 100), ord: Math.floor(i / 100) % 10_000 })

/** The raw shard of a hostile save: `count` full records of fields far outside their ranges, keyed in code-unit order. */
function hostileMet(count: number): Record<string, unknown> {
  const rows = Array.from({ length: count }, (_, i): [string, unknown] => [floodSid(i), { f: `F${i}`, l: `L${i}`, g: 1, b: 1e300, c: 'us', k: 99, a: [1e9, -1e9, 50, 50, 50], y: -5, s: 1e300, w: 1e9, fl: 1e9, gr: -1e9, ob: 1e300, d: 1e300, r: 'x'.repeat(100), j: 'y'.repeat(100) }])
  return Object.fromEntries(rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
}

const WORLD_ROWS: readonly CeilingProbe[] = [
  sinkRow(
    'mint-caps',
    'every mint has a yearly cap: lending 1e12 (it was 2.5e9 until the R2-L5 probe saw founding loans of 40e9), printing 0, immigrants 5e8, revaluation 1e12 (R2-L2)',
    MINT_NAMES,
    (n) => MINTS[n as MintName].cap,
    (g, n, acct, amount) => bookMint(g, n as MintName, acct, amount),
    (g, n) => peekLedger(g).ym[n] ?? 0,
  ),
  sinkRow(
    'burn-caps',
    'every burn has a yearly cap of 1e12: emigration, inflation, writeoff (R2-L2)',
    BURN_NAMES,
    (n) => BURNS[n as BurnName].cap,
    (g, n, acct, amount) => bookBurn(g, n as BurnName, acct, amount),
    (g, n) => peekLedger(g).yb[n] ?? 0,
  ),
  {
    id: 'ledger-caps',
    cap: '500 accounts, 480 flow rows, 1e15 per booking, 9e15 per balance (R2-L2)',
    run: (scale) => {
      const t = tightest()
      const g = ledgerLife()
      const reasons = Object.keys(REASONS) as Reason[]
      const accounts = LEDGER_CAPS.accounts * scale
      // Every booking pairs a new person with a new firm, so a booking opens two accounts, and a new country opens a new flow key.
      for (let i = 0; i < accounts / 2; i++) book(g, 'gift', refOf('person', i), refOf('firm', i), 1)
      // The roll below folds the smallest accounts, so the peak is read here, before any year changes.
      t.add(checkLedger(g).accounts, LEDGER_CAPS.accounts, `${accounts} accounts offered, before a roll`)
      // A flow key is (year, country, reason): offer `480 * scale` of them in one year.
      const flows = LEDGER_CAPS.flowRows * scale
      for (let i = 0; i < flows; i++) book(g, reasons[i % reasons.length]!, 'pool:other', 'abroad', 1, undefined, `c${Math.floor(i / reasons.length)}`)
      t.add(checkLedger(g).flowRows, LEDGER_CAPS.flowRows, `${flows} flow keys offered, in one year`)
      // And across years, so the roll that keeps two years is exercised: the rows of a year never pass the cap either.
      let widest = 0
      for (let y = 1; y <= yearsFor(scale); y++) {
        g.year += 1
        for (let i = 0; i < 40; i++) book(g, reasons[(i + y) % reasons.length]!, 'pool:other', refOf('person', i), 1, undefined, `y${y}c${i % 12}`)
        widest = Math.max(widest, checkLedger(g).flowRows)
      }
      const r = checkLedger(g)
      t.add(r.accounts, LEDGER_CAPS.accounts, `${accounts} accounts offered`)
      t.add(Math.max(r.flowRows, widest), LEDGER_CAPS.flowRows, `${flows} flow keys offered`)
      if (!r.ok) t.add(1, 0, `the books after the bookings do not balance: ${r.problems.join('; ')}`)
      t.add(Object.keys(peekLedger(g).a).length, LEDGER_CAPS.accounts, 'accounts held')
      return t.result()
    },
  },
  {
    id: 'pool-spreads',
    cap: 'no pool round trip is free: a buy then a sale to the same pool loses the spread twice (R2-L2)',
    // The value is the least the round trip has to lose (twice the spread of the mid price); the limit is what it did lose. A loss
    // short of it, or a pool with no spread at all, puts the value over the limit. The 1e-9 is the noise of two float products.
    run: (scale) => {
      const t = tightest()
      const mid = scale * 10_000
      for (const [pool, s] of Object.entries(SPREADS)) {
        const lost = ask(mid, pool as keyof typeof SPREADS) - bid(mid, pool as keyof typeof SPREADS)
        t.add(2 * s * mid * (1 - 1e-9), lost, `a round trip of ${mid} in pool ${pool}`)
        if (!(s > 0)) t.add(1, 0, `pool ${pool} has no spread`)
      }
      return t.result()
    },
  },
  {
    id: 'bond-par',
    cap: 'a bond redeems at its eroded face value, never at its marked price, and the face never passes three times the issue (F37, R2-L13)',
    run: (scale) => {
      const { paid, units, face } = bondRedemption(scale)
      return { value: paid, limit: units * face, at: `${units} units marked at ${scale} times par, redeemed with prices flat` }
    },
  },
  {
    id: 'transaction-levy',
    cap: '0.1 percent of a trade per level of the law, levels 0 to 3 (R2-L13)',
    run: (scale) => {
      const t = tightest()
      // A damaged level (99) is held to 3, so no law reads more than 0.3 percent. Whole dollars round half a dollar either way.
      for (const level of [0, 1, 2, 3, 99]) {
        const g = lifeIn('us', 2026)
        const p = editPolicy(g, 'us')
        p.newTaxes.transactions = { level, industry: '' }
        writePolicy(g, p)
        for (const amount of [1, 999, 1_234, 100_000, 7_654_321, 123_456_789_012]) {
          t.add(transactionsLevy(g, amount * scale), 0.003 * amount * scale + 0.5, `level ${level} on ${amount * scale}`)
        }
      }
      return t.result()
    },
  },
  {
    id: 'lod-caps',
    cap: '400 people (80 intimate), 60 firms (20 full), 150 homes, 600 job slots: no list of named entities grows past these (R2-L16)',
    run: (scale) => {
      const t = tightest()
      const ids = scale * 400
      for (const kind of ['person', 'firm', 'home'] as const) {
        const walk = lodWalk(kind, ids)
        t.add(walk.before, SWEEP_CAP[kind], `${Math.min(ids, PROMOTE_WALK)} ${kind} ids through promote`)
        t.add(walk.after, SWEEP_CAP[kind], `${Math.min(ids, PROMOTE_WALK)} ${kind} ids through promote, then the yearly sweep`)
        const flood = lodFlood(kind, ids)
        t.add(flood.read, READ_CAP[kind], `a save with ${ids} ${kind} rows, as the reader keeps it`)
        t.add(flood.after, SWEEP_CAP[kind], `a save with ${ids} ${kind} rows, after the yearly sweep`)
      }
      return t.result()
    },
  },
  {
    id: 'frontier-caps',
    cap: 'a research field is at most 12 years ahead of the calendar and gains at most 2 of them in a year, public research stops at 18 points and one disclosure adds at most 6, and a field keeps at most 24 rows (R3-F1)',
    // 20 x scale disclosures of size 1 and shield open (the most spill), by both sides, across `scale` years: 20 a year over the 12 lead
    // fields, six markets, far more than the 2 or 3 a life writes. Every year each field's lead is read against 12 years, its gain
    // of the year against 2, its public research against 18 points, the spill of one disclosure against 6 and its rows against 24.
    run: (scale) => {
      const t = tightest()
      const g = lifeIn('us', 2027)
      const leads = FIELD_IDS.filter((f) => FIELDS[f].lead)
      const leadMax = FRONTIER_CAPS.leadYears
      const rowsMax = FRONTIER_CAPS.rowsPerMarket * FRONTIER_CAPS.marketsPerField
      for (let i = 0; i < scale; i++) {
        const year = 2027 + i
        g.year = year
        const before = leads.map((f) => frontierLead(g, f))
        for (let k = 0; k < 20; k++) {
          const field = leads[k % leads.length]!
          const r = applyDisclosure(g, { field, year, size: 1, origin: `ceil|${year}|${k}`, by: k % 2 === 0 ? 'you' : 'rival', market: `m${k % 6}`, shield: 'open' })
          if (r.applied) t.add(r.spill, FRONTIER_CAPS.spillPerDisclosure * 10, `one disclosure of size 1, shield open, in ${field}, tenths of a point`)
          else t.add(1, 0, `a disclosure of ${field} in ${year} was refused: ${r.why}`)
        }
        leads.forEach((f, j) => {
          const lead = frontierLead(g, f)
          t.add(lead, leadMax, `${f} after ${i + 1} years of 20 disclosures a year`)
          t.add(Math.round((lead - before[j]!) * 100) / 100, FRONTIER_CAPS.yearYears, `${f} in year ${i + 1} of the run`) // the lead is in whole centi-years, so cents are exact
          t.add((readFrontier(g).f[f]?.pub ?? 0) / 10, FRONTIER_CAPS.spillPoints, `${f} public research after ${i + 1} years`)
          t.add(frontierRows(g, f).length, rowsMax, `${f} rows after ${i + 1} years`)
        })
      }
      return t.result()
    },
  },
  {
    id: 'met-caps',
    cap: 'the Met store keeps at most 400 records and 200 tombstones, 24 nodes in a record and 10,401 in all, however many people are touched, so 40,000 touches leave the same bounded shard and a held record is never the one dropped (R4-S11)',
    // `200 x scale` people are touched and made tombstones (20,000 asked for 200 places at 100 times); then `400 x scale` more are touched in
    // the same year, three of them with a debt on them (40,000, and the cap turns most away); a hostile shard of `400 x scale` entries is
    // read, and the sweep runs for 30 years. The shard is read against its caps after each step, and the three held people must still
    // have an entry: a record, or a tombstone that keeps what they are owed.
    run: (scale) => {
      const t = tightest()
      const g = lifeIn('us', 2030)
      const held: string[] = []
      const read = (at: string): void => {
        const shard = readMet(g)
        const keys = Object.keys(shard)
        const records = keys.filter((k) => !isTomb(shard[k]))
        t.add(records.length, MET_CAPS.records, `${at}: records`)
        t.add(keys.length - records.length, MET_CAPS.tombs, `${at}: tombstones`)
        t.add(jsonNodes(shard), MET_SHARD_NODES, `${at}: nodes of the shard`)
        for (const k of records) t.add(jsonNodes(shard[k]), MET_CAPS.nodes, `${at}: nodes of one record`)
        for (const k of held) if (!Object.prototype.hasOwnProperty.call(shard, k)) t.add(1, 0, `${at}: the held person ${k} has no entry`)
      }
      const owed = MET_CAPS.tombs * scale
      for (let j = 0; j < owed; j++) {
        const sid = floodSid(j)
        if (touchMet(g, sid)) tombstoneMet(g, sid, { ob: 5, gr: 30 })
      }
      read(`${owed} tombstones asked for`)
      const touches = MET_CAPS.records * scale
      for (let i = 0; i < touches; i++) {
        const sid = floodSid(owed + i)
        touchMet(g, sid, { w: i % 10 })
        if (held.length < 3 && i % 50 === 0 && markMet(g, sid, { fl: STAKE.debt })) held.push(sid)
      }
      read(`${touches} touches`)
      // The reader looks at 5,000 entries and no more, so a hostile shard past 100 times the cap adds nothing but memory: it stops at 40,000.
      const hostile = Math.min(touches, MET_CAPS.records * 100)
      const raw = normalizeMet(hostileMet(hostile))
      t.add(Object.keys(raw).length, MET_CAPS.records + MET_CAPS.tombs, `a hostile shard of ${hostile} entries, as the reader keeps it`)
      t.add(jsonNodes(raw), MET_SHARD_NODES, `a hostile shard of ${hostile} entries, nodes as the reader keeps it`)
      for (let y = 1; y <= 30; y++) {
        g.year += 1
        sweepMet(g)
      }
      read('30 yearly sweeps on')
      return t.result()
    },
  },
  {
    id: 'persona-nudge',
    cap: "the player's nudges add up to at most 15 points an axis either way and the record keeps at most 40 year stamps, however many nudges are made, and no axis leaves 0 to 100 (R4-S11)",
    // `100 x scale` nudges (10,000 at 100 times) of +3, then of -3, spread over the four axes and over up to 100 years (a nudge is once for
    // an axis, a reason and a year), with every lifetime counter at `1e9 x scale` or minus that. After each year every axis of the nudges
    // is read against 15, the stamps against 40, the stored record against its nodes, and the persona against 0 and 100.
    run: (scale) => {
      const t = tightest()
      const recordNodes = 3 + (1 + NUDGE_AXES.length) + (1 + AT_MAX)
      for (const sign of [1, -1]) {
        const g = lifeIn('us', 2030)
        for (const id of ['crimes', 'thefts', 'cheated', 'murders', 'fights', 'insults', 'sabotage', 'donated', 'livesSaved', 'lotteryTickets']) g.counters[id] = sign * 1e9 * scale
        const batches = Math.max(1, Math.min(scale, 100))
        for (let b = 0; b < batches; b++) {
          g.year = 2030 + b
          for (let i = 0; i < 100 * Math.ceil(scale / batches); i++) nudgePersona(g, NUDGE_AXES[i % NUDGE_AXES.length]!, sign * 3, `r${i}`)
          const rec = readPersona(g)
          for (const axis of NUDGE_AXES) t.add(Math.abs(rec.n[axis] ?? 0), NUDGE_MAX, `${sign > 0 ? 'plus' : 'minus'} 3 nudges, ${axis}, batch ${b + 1}`)
          t.add(Object.keys(rec.at).length, AT_MAX, `year stamps after batch ${b + 1}`)
          t.add(jsonNodes(g.flags['persona.me']), recordNodes, `nodes of the stored record after batch ${b + 1}`)
          const axes = personaOf(g)
          for (const [axis, v] of Object.entries(axes)) {
            t.add(v, 100, `the ${axis} axis with counters of ${g.counters.crimes}`)
            t.add(100 - v, 100, `the ${axis} axis (distance from 0) with counters of ${g.counters.crimes}`)
          }
        }
      }
      return t.result()
    },
  },
  {
    id: 'waves-per-year',
    cap: "at most 2 tech waves a year come from the player's side, whatever the source and however many are announced (R3-F3)",
    // 2 x scale distinct waves from the player's side in one year, for each source in turn and then all the sources mixed, over the
    // 12 future-facing kinds. The stored waves of that year that are not a rival's are read against 2.
    run: (scale) => {
      const t = tightest()
      const kinds = (Object.keys(WAVE_KINDS) as WaveKind[]).filter((k) => fieldOfKind(k) !== null)
      const sources = ['deeptech', 'heavy', 'workshop', 'race', 'effort'] as const
      const announce = (source: (typeof sources)[number], i: number): WaveInput => ({
        kind: kinds[i % kinds.length]!,
        source,
        origin: source === 'heavy' ? `energy|world#ceil ${i}` : `ceil ${source} ${i}`,
        name: 'Probe wave',
        size: 0.5,
        market: 'world',
      })
      for (const only of [...sources, 'mixed'] as const) {
        const g = lifeIn('us', 2030)
        for (let i = 0; i < 2 * scale; i++) announceWave(g, announce(only === 'mixed' ? sources[i % sources.length]! : only, i))
        const stored = readTechWaves(g).filter((w) => w.source !== 'rival' && w.year === 2030).length
        t.add(stored, 2, `${2 * scale} ${only} waves announced in one year`)
      }
      return t.result()
    },
  },
]

// R4-U11: the People UI and fog track. A profile, a Look closer and the research record are bounded by PEOPLE_CAPS and by the Knowledge
// record's 120 rows, whatever the data holds: the fifteen stats of a sheet and 15 x scale more keys, kin links (kids, stakes in companies, an ex,
// another parent, a debt, a cut-off), the memories of one edge, 12 x scale people each bought from, and the people who then leave.
const PEOPLE_LIFE: NpcLife = {
  v: 1, lastYear: 2025, country: 'us', field: 'Engineering', education: 2, study: 0, skill: 62, experience: 8, income: 90_000, debt: 0,
  investments: 0, housing: 0, ambition: 70, employer: '', history: [], achievements: [], housingQuality: 50,
}

/** A friend with every field given. `data` is laid over the fifteen stats of the sheet. */
function peopleFriend(g: GameState, over: Partial<Parameters<typeof createPerson>[1]> = {}): Person {
  return createPerson(g, { relation: 'friend', age: 31, gender: 'female', firstName: 'Dana', lastName: 'Reed', occupation: 'Nurse', money: 40_000, traits: ['kind', 'proud', 'calm'], stats: { happiness: 60, health: 70, smarts: 55, looks: 65 }, relationship: 60, ...over })
}

function peopleReadsRow(): CeilingProbe {
  return {
    id: 'people-reads',
    cap: "a profile shows at most 6 personality words, 6 connection rows and 3 memory lines, Look closer offers at most 5 keys at a fee that never follows the player's cash, the yearly step forgets at most 12 research rows of people who left, the research record keeps its 120 rows and exposure stays between 0 and 1, however many data stats, kin links, memories, purchases or people a life has (R4-U11)",
    run: (scale) => {
      const t = tightest()
      const real = <T,>(fn: () => T): T => withFlags({ peopleProfile: true }, () => withInfoMode('realistic', fn))
      return real(() => {
        // Data stats, kin links and the connections card: the fifteen stats and 15 x scale keys of junk, `scale` kids, `scale` companies that hold a
        // stake in the person, a debt, a cut-off, a spouse, another parent and an ex. Seven rows are true; the card shows six.
        const g = makeTestGame(1, { age: 40, countryId: 'us', money: 1e9 })
        const other = peopleFriend(g, { firstName: 'Sam', lastName: 'Reed' })
        const stats = Object.fromEntries(DATA_STATS.map(([key], i) => [key, 10 + ((i * 7) % 90)]))
        const junk = Object.fromEntries(Array.from({ length: 15 * scale }, (_, i) => [`junk${i}`, i % 100]))
        const dana = peopleFriend(g, {
          otherParentId: other.id,
          data: {
            countryId: 'us', ...stats, ...junk, married: true, spouseName: 'Sam Reed', kids: scale, exSpouseId: other.id,
            wl: { by: g.character.id, cut: true, cutY: 2021, known: true, how: 'external', knownY: 2022, anger: 70, estr: true, estrY: 2023 },
            w: { by: g.character.id, owes: 12_000 * scale, owesSince: 2023, given: 12_000, yes: 1, no: 0, asked: 2023, bound: 0, marks: {}, car: null, history: [] },
          },
        })
        for (let i = 0; i < scale; i++) g.assets.push({ id: `ceil${i}`, kind: 'business', name: `Probe Company ${i}`, details: { familyShares: [{ id: dana.id, share: 0.01 }] } } as never)
        const facts = personFacts(g, dana)
        const words = (facts?.rows ?? []).filter((r) => r.id.startsWith('personality.') && r.state === 'estimate').length
        t.add(words, PEOPLE_CAPS.personality, `${15 + 15 * scale} data stats on one person`)
        const rows = connectionsOf(g, dana)
        t.add(rows.length, PEOPLE_CAPS.connections, `kin links: ${scale} kids and ${scale} companies with a stake`)
        t.add(Math.max(0, ...rows.map((r) => r.text.length)), 90, 'the longest connection row')
        t.add(Math.max(0, ...(facts?.rows ?? []).map((r) => r.text.length)), 90, 'the longest fact row')

        // The memories of one edge: every kind, `scale` times what an edge can hold.
        const s = makeTestGame(1, { age: 40, countryId: 'us', money: 1e9 })
        stampSocial(s)
        const friend = peopleFriend(s, { firstName: 'Marisol', lastName: 'Vale' })
        const memories = Array.from({ length: EDGE_CAPS.memPerEdge * scale }, (_, i) => formatMemory({ kind: MEMORY_KINDS[i % MEMORY_KINDS.length]!, year: 2000 + (i % 26), w: (1 + (i % 3)) as 1 | 2 | 3, by: i % 2 === 0 ? 'ego' : 'them' }))
        putEdge(s, `${personEntity(friend)}>${playerRef(s)}`, { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2000, l: 2026, m: memories })
        t.add(memoryLines(s, friend).length, PEOPLE_CAPS.memories, `${memories.length} memories on one edge`)
        t.add(memoryLines(s, friend, 3 * scale).length, EDGE_CAPS.memPerEdge, `${3 * scale} lines asked for`)

        // Look closer: five keys for a person with a life and the fee for a poor and a rich player, and a person read at 100 times the years.
        const poor = makeTestGame(1, { age: 40, countryId: 'us', money: 200_000 })
        const rich = makeTestGame(1, { age: 40, countryId: 'us', money: 200_000 * scale })
        const fee = (x: GameState, p: Person): number => offersFor(x, lookKeysOf(x, p))[0]?.price ?? 0
        const pa = peopleFriend(poor)
        const pb = peopleFriend(rich)
        saveNpcLife(pa, PEOPLE_LIFE)
        saveNpcLife(pb, PEOPLE_LIFE)
        t.add(lookKeysOf(rich, pb).length, PEOPLE_CAPS.lookKeys, 'keys a person with a life and a lot of data is offered')
        t.add(fee(rich, pb), fee(poor, pa), `the fee when the player's cash is ${scale} times as much`)
        t.add(exposureOf({ yearsKnown: 8 * scale, relationship: 100 * scale, livesWithPlayer: true }), 1, `exposure at ${8 * scale} years and a feeling of ${100 * scale}`)
        t.add(1 - exposureOf({ yearsKnown: -8 * scale, relationship: -100 * scale, livesWithPlayer: false }), 1, 'a stranger with a negative record (1 less the exposure, so below 0 shows)')

        // Purchases: 12 x scale people are each bought from the same year; the record keeps 120 rows. Then they all leave, and the yearly
        // step forgets 12.
        const buyer = makeTestGame(1, { age: 40, countryId: 'us', money: 1e12 })
        for (let i = 0; i < 12 * scale; i++) {
          const p = peopleFriend(buyer, { firstName: `N${i}`, lastName: 'Probe' })
          buyIntel(buyer, 'investigator', lookKeysOf(buyer, p))
        }
        const kept = Object.keys(readKnow(buyer)?.k ?? {})
        t.add(kept.length, KNOW_LIMITS.keys, `${12 * scale} people bought from, 5 keys each`)
        buyer.people = []
        yearlyKnowledge(buyer)
        const left = Object.keys(readKnow(buyer)?.k ?? {}).length
        t.add(kept.length - left, PEOPLE_CAPS.forgetPerStep, `${kept.length} rows of people who all left`)
        return t.result()
      })
    },
  }
}

/** A private company of the player's, worth `valuation`, and the key of its valuation (what an audit of it reads). */
function firmWorth(valuation: number): { g: GameState; key: string } {
  const g = lifeIn('us', 2026)
  const c = g.character
  const a = createBusinessAsset(g, 'Probe Cafe', newBiz(g, 'cafe', c.countryId, c.city, { cash: 400_000, quality: 70, brand: 40 }), 0)
  g.assets.push(a)
  bizOf(g, a).valuation = valuation
  return { g, key: valKey(a.id) }
}

// R3-H4: the Knowledge rows. A source never reads sharper than its floor; a fee follows the scope and the country, not the buyer; the
// research record never keeps more than its cap of keys.
const KNOWLEDGE_ROWS: readonly CeilingProbe[] = [
  {
    id: 'intel-floors',
    cap: 'no source reads sharper than its floor whatever the spend, the quality or the talent: press 20 percent, report 12, analyst 8, due diligence 3, an illegal source at least 5 (R3-H4)',
    run: (scale) => {
      const t = tightest()
      for (const id of SOURCE_IDS) {
        for (const quality of [0, 0.5, 1, 5]) {
          for (const talent of [false, true]) {
            // `scale` times the ordinary spend: the term that could in principle make a read arbitrarily sharp.
            t.add(SOURCES[id].floor, readingSd(id, { quality, talent, spend: 1e6 * scale, ref: 1 }), `${id} at quality ${quality}${talent ? ' with a talent' : ''}`)
          }
        }
      }
      return t.result()
    },
  },
  {
    id: 'intel-price',
    cap: "a fee follows the scope and the country's wealth, at most 4.5 x 2.75 x 1.5 times the base price, and never the buyer's cash or the wealth of the world; due diligence on a deal is the greater of 8,000 x wealth and 2 percent of the deal, and an audit of the player's own company is 8,000 x wealth however much it is worth (R3-H4, R3-G10)",
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        for (const id of ['press', 'report', 'analyst', 'investigator', 'informant', 'hacker'] as const) {
          for (const country of ['us', 'mc', 'ng', 'ch']) {
            // The widest scope there is, `scale` times as many countries as a life spans (the term counts at most 8).
            t.add(priceOf(id, { tier: 3, countries: 8 * scale, country }), SOURCES[id].price * 4.5 * 2.75 * 1.5 + 50, `${id} in ${country}`)
          }
        }
        for (const country of ['us', 'mc', 'ng']) {
          const deal = 5_000_000 * scale
          t.add(priceOf('diligence', { tier: 3, countries: 8 * scale, country, deal }), Math.max(8_000 * 1.5, deal * 0.02) + 500, `diligence in ${country} on a deal of ${deal}`)
        }
        // The audit the player is offered for their own company (the `val` kind): the object is their own asset, so a hundred times its valuation
        // is the same fee, and the limit does not grow with `scale`.
        const own = firmWorth(5_000_000 * scale)
        const scope = kindOfKey(own.key)!.scope!(own.g, own.key)
        t.add(priceOf('diligence', scope, own.g.character.countryId), 8_000 * 1.5 + 500, `an audit of the player's own company worth ${5_000_000 * scale}`)
        return t.result()
      }),
  },
  {
    id: 'know-keys',
    cap: 'the research record keeps at most 120 keys, however many a life reads (R3-H4)',
    run: (scale) => {
      const g = lifeIn('us', 2026)
      const n = KNOW_LIMITS.keys * scale
      for (let i = 0; i < n; i++) learn(g, `mkt:c${i}:size`, { mid: 1e6 + i, sd: 0.2, src: 'press' })
      return { value: Object.keys(readKnow(g)?.k ?? {}).length, limit: KNOW_LIMITS.keys, at: `${n} keys learned in one year` }
    },
  },
]

// R4-U11: the People UI and fog track.
const PEOPLE_ROWS: readonly CeilingProbe[] = [peopleReadsRow()]

/** Every row: the R0 and R1 growth terms, the world rows, the effort rows (R3-E9, test/effort-ceilings.ts), the Knowledge rows (R3-H4), then the People rows (R4-U11). */
export const CEILING_PROBES: readonly CeilingProbe[] = [...LIFE_ROWS, ...WORLD_ROWS, ...EFFORT_ROWS, ...KNOWLEDGE_ROWS, ...PEOPLE_ROWS]
