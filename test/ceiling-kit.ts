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
import { ECONOMY_VERSION, initialCountry } from '../src/game/economy/model'
import { typicalIncome, US_TYPICAL_INCOME } from '../src/game/events/wealth-core'
import { realWealthFactor } from '../src/game/history/events-people'
import { buySecurity, investmentHoldings, investmentListing, yearlyInvestments } from '../src/game/investments'
import { BURNS, LEDGER_CAPS, MINTS, book, bookBurn, bookMint, checkLedger, peekLedger, playerAcct, type AcctRef } from '../src/game/kernel/ledger'
import { REASONS, type BurnName, type MintName, type Reason } from '../src/game/kernel/reasons'
import { SPREADS, ask, bid } from '../src/game/kernel/spreads'
import { transactionsLevy } from '../src/game/nation/rates'
import { editPolicy, writePolicy } from '../src/game/nation/state'
import { authorAdaptationOffer } from '../src/game/special/author-career'
import { normalizeAuthor } from '../src/game/special/author-state'
import { ownerKey } from '../src/game/special/common'
import { yearlyFame } from '../src/game/special/fame'
import { gamersIn, nextTail, publisherCopiesCap, titleCopiesCap } from '../src/game/special/gamedev-core'
import type { ScopeId } from '../src/game/special/gamedev-data'
import { payScale } from '../src/game/special/pay-scale'
import { dealCeiling } from '../src/game/special/sports-core'
import type { GameState } from '../src/game/types'
import { COUNTRIES } from '../src/game/world'
import { readFirms } from '../src/game/world/firms'
import { readHomes } from '../src/game/world/homes'
import { FRONTIER_CAPS } from '../src/game/world/caps'
import { applyDisclosure, frontierLead, frontierRows, readFrontier } from '../src/game/world/frontier'
import { FIELD_IDS, FIELDS, fieldOfKind } from '../src/game/world/frontier-fields'
import { LOD_CAPS, lodSweep, promote, type LodKind } from '../src/game/world/lod'
import { readPeople } from '../src/game/world/people'
import '../src/game/world/shards'
import { makeTestGame } from './helpers'
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

/** Every row: the R0 and R1 growth terms, then the world rows. */
export const CEILING_PROBES: readonly CeilingProbe[] = [...LIFE_ROWS, ...WORLD_ROWS]
