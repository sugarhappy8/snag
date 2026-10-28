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
import { readTies, typicalIncome, US_TYPICAL_INCOME } from '../src/game/events/wealth-core'
import { personCash } from '../src/game/cash'
import { killCharacter } from '../src/game/death'
import { DIVORCE_SHARE, DIVORCE_YEARS, openDivorceDebt, serveDivorceDebts } from '../src/game/divorce-debt'
import { strifeEdges, STRIFE } from '../src/game/events/will-strife'
import type { EstatePlan } from '../src/game/events/will-estate'
import { withFlags } from '../src/game/flags'
import { realWealthFactor } from '../src/game/history/events-people'
import { buySecurity, investmentHoldings, investmentListing, yearlyInvestments } from '../src/game/investments'
import { personFacts, DATA_STATS } from '../src/game/hubs/people-facts'
import { adoptChild, adoptSpouse } from '../src/game/kin'
import { memoryLines } from '../src/game/hubs/people-memory'
import { connectionsOf } from '../src/game/hubs/people-web'
import { KNOW_LIMITS, buyIntel, learn, offersFor, readKnow } from '../src/game/knowledge/contract'
import { kindOfKey } from '../src/game/knowledge/kinds'
import { withInfoMode } from '../src/game/knowledge/mode'
import { yearlyKnowledge } from '../src/game/knowledge/module'
import { SOURCES, SOURCE_IDS, priceOf, readingSd } from '../src/game/knowledge/sources'
import type { EntityRef } from '../src/game/kernel/ids'
import { personEntity } from '../src/game/kernel/person-ref'
import { BURNS, LEDGER_CAPS, MINTS, acctBalance, book, bookBurn, bookMint, checkLedger, flowsOf, peekLedger, playerAcct, type AcctRef } from '../src/game/kernel/ledger'
import { REASONS, type BurnName, type MintName, type Reason } from '../src/game/kernel/reasons'
import { SPREADS, ask, bid } from '../src/game/kernel/spreads'
import { transactionsLevy } from '../src/game/nation/rates'
import { continueAsChild } from '../src/game/life'
import { carryReceivables, keptContacts } from '../src/game/modules/heirs'
import { settleKinEstates } from '../src/game/modules/kin-estates'
import { initializeNpc, yearlyNpcLife } from '../src/game/npc-lives'
import { npcLife, saveNpcLife, type NpcLife } from '../src/game/npc-state'
import { PEOPLE_CAPS, exposureOf, lookKeysOf } from '../src/game/people-fog'
import { playerEdgeKey, runAct } from '../src/game/society/acts'
import { INTEREST_CEILING, debtsOf } from '../src/game/society/debt'
import { FAVOR_BOND, FAVOR_COOLDOWN, helpAct } from '../src/game/society/favor'
import { FEUD, feudOf, legalFee, stepFeuds } from '../src/game/society/feud'
import { HOP_CAP, MAX_TOLD, spread } from '../src/game/society/gossip'
import { LOAN_OPEN_MAX, lend, loanTerms, openLoans } from '../src/game/society/loan'
import { MENTOR, enrolMentor, mentorSettle, protegesOf } from '../src/game/society/mentor'
import { yearlyActs } from '../src/game/society/module'
import { LEAK, addSecret } from '../src/game/society/secret'
import { createPerson } from '../src/game/people'
import { editPolicy, writePolicy } from '../src/game/nation/state'
import { DEBT_KIND } from '../src/game/society/contract'
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
import { edgeKey, edgeMap, liveFeuds, normalizeEdges, openDebts, readEdge, type Edge } from '../src/game/world/edges'
import { readFacts } from '../src/game/world/facts'
import { KIN_CAPS, kinProblems, readKin } from '../src/game/world/kin'
import { LIFE_MAX_AGE, ageTo, type KinBase } from '../src/game/world/life-path'
import { stepEdges } from '../src/game/world/edge-step'
import { putEdge, putSecret, remember } from '../src/game/world/edge-write'
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
import { kinGame, kinSidsOf, married, SPOUSE_NAMES, withLife } from './kin-kit'
import { labGame, patchLab } from './lab-kit'
import { flowTotal } from './ledger-kit'
import { cast, socialGame } from './social-kit'

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

type Measure = ReturnType<CeilingProbe['run']>

/**
 * What each row has measured at each scale in this run. A deep row is minutes of work at 1000 times (met-caps takes about four minutes
 * by itself), so a test that wants the number a row has already given reads it here instead of running the row again. It is keyed by
 * the row itself and not by its id: the kit's own tests make several rows that share an id. It lives as long as the test file does.
 */
const MEASURED = new WeakMap<CeilingProbe, Map<number, Measure>>()

function keepAnswer(p: CeilingProbe, scale: number, r: Measure): void {
  let rows = MEASURED.get(p)
  if (rows === undefined) MEASURED.set(p, (rows = new Map()))
  rows.set(scale, r)
}

/**
 * What the row measures at `scale`: the answer of an earlier run when probeFailures (or this function) has made one, else the row is run
 * now and its answer kept. A row that throws is never kept, so asking again runs it again and it throws again. Only a run of the row
 * itself fills the cache: `probeFailures` always runs fresh, so a row's own test never passes on an answer it did not just get.
 */
export function measured(p: CeilingProbe, scale: number): Measure {
  const have = MEASURED.get(p)?.get(scale)
  if (have !== undefined) return have
  const r = p.run(scale)
  keepAnswer(p, scale, r)
  return r
}

/** One message for each scale where the row's value is not at most its limit, or where it threw. Empty when the row holds. Every run it makes is kept for `measured`. */
export function probeFailures(p: CeilingProbe, scales: readonly number[]): string[] {
  const out: string[] = []
  for (const scale of scales) {
    try {
      const r = p.run(scale)
      keepAnswer(p, scale, r)
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
// R4-E15: the social rows. The web of people is bounded in the edge map (1,200 edges, 4,000 memories, 40 debts, 12 feuds, 40 secrets), in the
// acts (a loan, a call-in, a leak, a suit, a mentor's bonus) and in what a year can cost the player. Each row feeds its terms `scale` times
// what a life reaches and reads the worst case against the cap its sentence promises.
const EDGE_SLICE_NODES = 24_000
const edgeKeyAt = (ego: string, i: number): string => `person:e${String(i).padStart(6, '0')}>${ego}`
const HOSTILE_MEMORIES = Array.from({ length: 8 }, (_, i) => Array.from({ length: 12 }, (_, j) => formatMemory({ kind: MEMORY_KINDS[(i + j) % MEMORY_KINDS.length]!, year: 2000 + ((i + j) % 25), w: (1 + ((i + j) % 3)) as 1 | 2 | 3, by: j % 2 === 0 ? 'ego' : 'them' })))
const memoriesFor = (i: number, n = EDGE_CAPS.memPerEdge): string[] =>
  Array.from({ length: n }, (_, j) => formatMemory({ kind: MEMORY_KINDS[(i + j) % MEMORY_KINDS.length]!, year: 2000 + ((i + j) % 25), w: (1 + ((i + j) % 3)) as 1 | 2 | 3, by: j % 2 === 0 ? 'ego' : 'them' }))

/** The counts of a stored edge map, read off the root and not off the normalizer. */
export function edgeCounts(map: unknown): { edges: number; debts: number; feuds: number; talk: number; secrets: number; memories: number; most: number; nodes: number; holders: number } {
  const out = { edges: 0, debts: 0, feuds: 0, talk: 0, secrets: 0, memories: 0, most: 0, nodes: jsonNodes(map), holders: 0 }
  if (map === null || typeof map !== 'object') return out
  for (const [k, v] of Object.entries(map as Record<string, Record<string, unknown>>)) {
    if (k.startsWith('secret:')) {
      out.secrets++
      out.holders = Math.max(out.holders, Array.isArray(v.h) ? v.h.length : 0)
      continue
    }
    out.edges++
    const m = Array.isArray(v.m) ? v.m.length : 0
    out.memories += m
    out.most = Math.max(out.most, m)
    if (v.dv !== undefined) out.debts++
    if (v.q !== undefined) out.feuds++
    if (v.n !== undefined || v.d !== undefined) out.talk++
  }
  return out
}

const rawEdges = (g: GameState): unknown => (g.world as { edges?: unknown } | undefined)?.edges

function readEdgeCaps(t: ReturnType<typeof tightest>, map: unknown, at: string): void {
  const c = edgeCounts(map)
  t.add(c.edges, EDGE_CAPS.edges, `${at}: edges`)
  t.add(c.debts, EDGE_CAPS.debts, `${at}: debts`)
  t.add(c.feuds, EDGE_CAPS.feuds, `${at}: feuds`)
  t.add(c.talk, EDGE_CAPS.talkEdges, `${at}: edges with talk`)
  t.add(c.secrets, EDGE_CAPS.secrets, `${at}: secrets`)
  t.add(c.holders, EDGE_CAPS.holders, `${at}: holders of one secret`)
  t.add(c.memories, EDGE_CAPS.memTotal, `${at}: memories in all`)
  t.add(c.most, EDGE_CAPS.memPerEdge, `${at}: memories on one edge`)
  t.add(c.nodes, EDGE_SLICE_NODES, `${at}: nodes of the slice`)
}

function edgeCapsRow(): CeilingProbe {
  return {
    id: 'edge-caps',
    cap: 'the edge map keeps at most 1,200 edges, 40 debts, 12 feuds, 120 edges with talk and 40 secrets of 6 holders, 8 memories an edge and 24,000 nodes, however many people are offered or loaded, and a world full of bound edges refuses a new one (R4-E15)',
    // 1,200 + 20 x scale edges are offered to the writer one at a time, each with eight memories, and a debt, a feud and talk on as many as the
    // scale asks for (the caps refuse what is over); 40 x scale secrets are offered; then a hostile map of 1,200 x scale edges and 40 x scale
    // secrets is read; then 20 x scale edges are offered to a world whose 1,200 edges are all bound (a link kind), which must refuse every one.
    run: (scale) => {
      const t = tightest()
      const g = lifeIn('us', 2030)
      stampSocial(g)
      const ego = playerRef(g)
      const offered = EDGE_CAPS.edges + 20 * scale
      for (let i = 0; i < offered; i++) {
        const extra: Partial<Edge> = { m: memoriesFor(i) }
        if (i < EDGE_CAPS.debts * scale) extra.dv = [1_000 + i, 8, 2029, 0, 0]
        if (i < EDGE_CAPS.feuds * scale) extra.q = [1 + (i % 4), 2029, 0]
        if (i < EDGE_CAPS.talkEdges * scale) Object.assign(extra, { n: [`cb${i}`], d: [i % 50] })
        // a refused write is the cap doing its work: the edge is simply not there
        putEdge(g, edgeKeyAt(ego, i), { t: 50, f: 20 + (i % 70), r: 50, s: i % 9, o: 0, y: 2029, l: 2030, ...extra })
        if (i % 500 === 0) readEdgeCaps(t, rawEdges(g), `${i + 1} edges offered`)
      }
      for (let i = 0; i < EDGE_CAPS.secrets * scale; i++) putSecret(g, `secret:${i + 1}`, { a: ego, k: i % 2 === 0 ? 'affair' : 'debt', v: 1 + (i % 5), h: Array.from({ length: 1 + (i % EDGE_CAPS.holders) }, (_, j) => `person:h${i}x${j}`), y: 2020 + (i % 10) } as never)
      readEdgeCaps(t, rawEdges(g), `${offered} edges and ${EDGE_CAPS.secrets * scale} secrets offered`)

      // The hostile map: every edge carries a debt, a feud, talk, a link kind and 12 memories (4 of them past the eight an edge keeps).
      const hostile: Record<string, unknown> = {}
      for (let i = 0; i < EDGE_CAPS.edges * scale; i++) {
        hostile[edgeKeyAt(ego, i)] = i < 4 * EDGE_CAPS.edges ? { t: 50, f: 50, r: 50, s: i % 100, o: 0, y: 2000, l: 2030, m: HOSTILE_MEMORIES[i % HOSTILE_MEMORIES.length], dv: [10 + i, 5, 2029, 0, 0], q: [1, 2029, 0], n: ['a', 'b'], d: [1, 2], k: 'kin', c: 2029 } : { t: 50, f: 50, r: 50, s: i % 100, o: 0, y: 2000, l: 2030 }
      }
      for (let i = 0; i < EDGE_CAPS.secrets * scale; i++) hostile[`secret:${i + 1}`] = { a: ego, k: 'affair', v: 3, h: Array.from({ length: 3 * EDGE_CAPS.holders }, (_, j) => `person:z${j}`), y: 2020 }
      readEdgeCaps(t, normalizeEdges(Object.fromEntries(Object.entries(hostile).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))), `a hostile map of ${EDGE_CAPS.edges * scale} edges`)

      const bound = lifeIn('us', 2030)
      stampSocial(bound)
      for (let i = 0; i < EDGE_CAPS.edges; i++) putEdge(bound, edgeKeyAt(ego, i), { t: 50, f: 50, r: 50, s: 0, o: 0, y: 2030, l: 2030, k: 'kin' })
      const before = JSON.stringify(rawEdges(bound))
      for (let i = 0; i < 20 * scale; i++) putEdge(bound, edgeKeyAt(ego, EDGE_CAPS.edges + i), { t: 50, f: 99, r: 50, s: 99, o: 0, y: 2030, l: 2030 })
      readEdgeCaps(t, rawEdges(bound), `${20 * scale} edges offered to ${EDGE_CAPS.edges} bound ones`)
      t.add(JSON.stringify(rawEdges(bound)) === before ? 0 : 1, 0, 'a bound edge was lost or a new one let in')
      return t.result()
    },
  }
}

function memoryTotalRow(): CeilingProbe {
  return {
    id: 'memory-total',
    cap: 'a memory moves trust, respect, resentment and obligation by at most 25 points at its full weight, an edge keeps 8 memories and the map 4,000, however many are made, and every number stays inside its range (R4-E15)',
    // One edge is offered 8 x scale memories (every kind, in 8 x scale / 8 years); then 50 x scale memories are made round the table across
    // 520 edges. After each: no edge holds more than 8, the map no more than 4,000, no one memory moved a number by more than 25 and every
    // number is inside its range.
    run: (scale) => {
      const t = tightest()
      const g = lifeIn('us', 2030)
      stampSocial(g)
      const ego = playerRef(g)
      const check = (who: EntityRef, at: string): void => {
        const e = readEdge(g, who, ego)
        if (e === null) return
        for (const f of ['t', 'r', 's'] as const) {
          t.add(e[f], 100, `${at}: ${f}`)
          t.add(100 - e[f], 100, `${at}: ${f} from 0`)
        }
        t.add(Math.abs(e.o), 100, `${at}: o`)
      }
      const one = 'person:solo' as EntityRef
      for (let n = 0; n < 8 * scale; n++) {
        g.year = 2030 + Math.floor(n / 8)
        const before = readEdge(g, one, ego)
        remember(g, one, MEMORY_KINDS[n % 8]!, { w: 3, by: n % 2 === 0 ? 'ego' : 'them' })
        const after = readEdge(g, one, ego)
        if (before !== null && after !== null) for (const f of ['t', 'r', 's', 'o'] as const) t.add(Math.abs(after[f] - before[f]), 25, `one memory, field ${f}`)
        if (n % 50 === 0 || n === 8 * scale - 1) {
          t.add(edgeCounts(rawEdges(g)).most, EDGE_CAPS.memPerEdge, `${n + 1} memories offered to one edge`)
          check(one, `${n + 1} memories offered to one edge`)
        }
      }
      const people = 520
      for (let n = 0; n < 50 * scale; n++) {
        g.year = 2030 + Math.floor(n / people)
        const who = `person:m${String(n % people).padStart(4, '0')}` as EntityRef
        remember(g, who, MEMORY_KINDS[(n * 7) % MEMORY_KINDS.length]!, { w: (1 + (n % 3)) as 1 | 2 | 3, by: n % 2 === 0 ? 'ego' : 'them' })
        if (n % 2_000 === 0) readEdgeCaps(t, rawEdges(g), `${n + 1} memories made`)
      }
      readEdgeCaps(t, rawEdges(g), `${50 * scale} memories made`)
      t.add(edgeCounts(rawEdges(g)).memories, EDGE_CAPS.memTotal, `${50 * scale} memories made across ${people} edges`)
      return t.result()
    },
  }
}

function loanCapRow(): CeilingProbe {
  return {
    id: 'loan-cap',
    cap: 'a loan is at most 2 typical incomes whatever the lender holds and a quarter of a small purse, the player carries 3 loans at most, and 40 years of default at the sharpest rate never pass 3 times the principal (R4-E15)',
    // Every country's wealth is scaled, so the typical income is; a lender holds 10^7 x scale or 40,000 x scale; 3 x scale lenders each lend
    // the most they will in one year; then the three loans taken go into 40 years of default at 60%.
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        const g = socialGame(1, { age: 30, money: 1_000 })
        const income = typicalIncome(g)
        const rich = cast(g, 70, 'friend', { money: 1e7 * scale })
        t.add(loanTerms(g, rich).cap, 2 * income, `a lender with ${1e7 * scale} dollars`)
        const small = cast(g, 70, 'friend', { money: 40_000 * scale })
        t.add(loanTerms(g, small).cap, 0.25 * small.money, `a lender with ${small.money} dollars`)
        t.add(loanTerms(g, small).cap, 2 * income, `a lender with ${small.money} dollars, against the income`)
        for (let i = 0; i < 3 * scale; i++) {
          const lender = cast(g, 70, 'friend', { money: 1e7 * scale, traits: ['sneaky'] })
          lend(g, lender, loanTerms(g, lender).cap)
          t.add(openLoans(g), LOAN_OPEN_MAX, `${i + 1} lenders asked`)
        }
        const ego = playerRef(g)
        const taken = debtsOf(g, ego).filter((r) => r.owedBy)
        for (const r of taken) {
          const e = readEdge(g, ego, r.key.slice(r.key.indexOf('>') + 1) as EntityRef)
          if (e?.dv !== undefined) putEdge(g, r.key, { dv: [e.dv[0], 60, e.dv[2], e.dv[3], e.dv[4]] })
        }
        const principal = new Map(taken.map((r) => [r.key, r.owed]))
        g.character.money = 0
        for (let y = 0; y < 40; y++) {
          g.year += 1
          yearlyActs(g)
          g.character.money = 0
        }
        for (const r of debtsOf(g, ego)) if (r.owedBy && principal.has(r.key)) t.add(r.owed, INTEREST_CEILING * principal.get(r.key)!, '40 years of default at 60 percent')
        t.add(taken.length, LOAN_OPEN_MAX, 'loans taken')
        return t.result()
      }),
  }
}

function favorCallinRow(): CeilingProbe {
  return {
    id: 'favor-callin',
    cap: 'a person is called in at most once in 3 years however often they are asked, a favor done adds 2 points of regard at most, and the player owes no one more than 100 (R4-E15)',
    // 40 friends are asked 100 x scale times a year for 3 years. Each does one favor, the regard gained is at most 2 each, and the
    // obligation never passes -100.
    run: (scale) => {
      const t = tightest()
      const g = socialGame(1, { age: 30 })
      const list = Array.from({ length: 40 }, () => cast(g, 70, 'friend'))
      const start = new Map(list.map((p) => [p.id, p.relationship]))
      const calls = new Map<string, number>()
      const y0 = g.year
      for (let year = y0; year < y0 + FAVOR_COOLDOWN; year++) {
        g.year = year
        for (let i = 0; i < 100 * scale; i++) {
          const p = list[i % list.length]!
          const key = playerEdgeKey(g, p)
          if (key !== null && runAct(g, helpAct, key, p) !== null) calls.set(p.id, (calls.get(p.id) ?? 0) + 1)
        }
      }
      t.add(Math.max(1, ...calls.values()), 1, `${100 * scale} asks a year for ${FAVOR_COOLDOWN} years, calls on one person`)
      for (const p of list) {
        t.add(p.relationship - start.get(p.id)!, FAVOR_BOND, `regard gained by ${p.firstName}`)
        const e = readEdge(g, personEntity(p), playerRef(g))
        t.add(Math.max(0, -(e?.o ?? 0)), 100, `obligation owed to ${p.firstName}`)
      }
      return t.result()
    },
  }
}

/** A small deterministic generator, so a hostile graph is the same graph every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function gossipHopsRow(): CeilingProbe {
  return {
    id: 'gossip-hops',
    cap: 'a leak goes 2 hops and tells 4 people at most, each once, over any circle, and no person loses more than 30 points of regard to leaks in a year however many secrets they hold (R4-E15)',
    // 10 x scale leaks over hostile graphs whose contact lists are 14 x scale long; then 40 x scale secrets are offered, 6 holders each, to a
    // circle of 14 who all hold a grudge, and the year step runs 4 times: the most any one person lost in a year is read against 30.
    run: (scale) => {
      const t = tightest()
      const r = lcg(7)
      for (let i = 0; i < 10 * scale; i++) {
        const n = 1 + Math.floor(r() * 30)
        const ids = Array.from({ length: n }, (_, k) => `p${k}`)
        const contacts = new Map(ids.map((id) => [id, Array.from({ length: Math.floor(r() * 14 * scale) }, () => (r() < 0.1 ? id : ids[Math.floor(r() * n)]!))]))
        const skip = new Set(ids.filter(() => r() < 0.1))
        const out = spread(ids[Math.floor(r() * n)]!, (id) => contacts.get(id) ?? [], skip)
        t.add(Math.max(0, ...out.map((x) => x.hop)), HOP_CAP, `leak ${i}: the deepest hop`)
        t.add(out.length, MAX_TOLD, `leak ${i}: people told`)
      }
      const g = socialGame(1, { age: 30 })
      const circle = Array.from({ length: 14 }, () => cast(g, 70, 'friend', { traits: ['sneaky', 'manipulative', 'jealous'] }))
      for (const p of circle) putEdge(g, `${personEntity(p)}>${playerRef(g)}`, { t: 60, f: p.relationship, r: 50, s: 100, o: 0, y: g.year, l: g.year })
      for (let i = 0; i < EDGE_CAPS.secrets * scale; i++) {
        g.year = 1990 + (i % 40)
        addSecret(g, playerRef(g), i % 2 === 0 ? 'affair' : 'debt', 5, circle.slice(i % 8, (i % 8) + EDGE_CAPS.holders))
      }
      g.year = 2030
      for (let y = 0; y < 4; y++) {
        const was = new Map(circle.map((p) => [p.id, p.relationship]))
        g.year += 1
        yearlyActs(g)
        for (const p of circle) t.add(was.get(p.id)! - p.relationship, LEAK.damageYear, `${p.firstName}, year ${y + 1} of leaks`)
      }
      return t.result()
    },
  }
}

function feudLiveRow(): CeilingProbe {
  return {
    id: 'feud-live',
    cap: "at most 12 feuds are live however many people hold a grudge, a suit costs at most 3 typical incomes and a quarter of the payer's cash whatever the net worth, and sabotage takes 3 happiness and 2 job performance a year in all (R4-E15)",
    // 12 + 3 x scale people hold a grudge of 100 (topped up each year, 100 x what the edge step would leave) for 12 years; a suit at rung 4 is
    // paid by a player whose cash is 10^6 x scale; and 12 feuds at rung 3 sabotage in one year.
    run: (scale) => {
      const t = tightest()
      const g = socialGame(1, { age: 30, money: 300_000 })
      const foes = Array.from({ length: 12 + 3 * scale }, () => cast(g, 30, 'friend'))
      for (let y = 0; y < 12; y++) {
        for (const p of foes) putEdge(g, `${personEntity(p)}>${playerRef(g)}`, { t: 30, f: 30, r: 40, s: 100, o: 0, y: g.year - 3, l: g.year, m: [formatMemory({ kind: 'betrayal', year: g.year - 1, w: 2, by: 'ego' })] })
        g.year += 1
        yearlyActs(g)
        t.add(liveFeuds(g), EDGE_CAPS.feuds, `${foes.length} people at resentment 100, year ${y + 1}`)
      }
      for (const cash of [1e5, 1e6 * scale]) {
        const h = socialGame(1, { age: 30, money: cash })
        const p = cast(h, 30, 'friend')
        putEdge(h, `${personEntity(p)}>${playerRef(h)}`, { t: 30, f: 30, r: 40, s: 90, o: 0, y: h.year - 3, l: h.year, q: [4, h.year - 6, 0] })
        const fee = legalFee(h, h.year - 6)
        t.add(fee, Math.min(3 * typicalIncome(h), FEUD.feeCash * cash), `a suit paid from ${cash} dollars`)
        const before = h.character.money
        stepFeuds(h)
        t.add(before - h.character.money, Math.min(3 * typicalIncome(h), FEUD.feeCash * cash), `the suit as booked, from ${cash} dollars`)
      }
      const s = socialGame(1, { age: 30, money: 1e6 })
      const wave = Array.from({ length: EDGE_CAPS.feuds }, () => cast(s, 30, 'friend'))
      for (const p of wave) putEdge(s, `${personEntity(p)}>${playerRef(s)}`, { t: 30, f: 30, r: 40, s: 30, o: 0, y: s.year - 3, l: s.year, q: [3, s.year - 2, 0] })
      const happy = s.character.stats.happiness
      stepFeuds(s)
      t.add(happy - s.character.stats.happiness, FEUD.sabotageHappiness, `${wave.length} feuds at rung 3 in one year`)
      return t.result()
    },
  }
}

function mentorGainRow(): CeilingProbe {
  return {
    id: 'mentor-gain',
    cap: 'the player mentors 3 people at most and each gains at most 15 percent more skill than the same year would have given alone, however large the yearly gain is (R4-E15)',
    // 3 + scale relatives are offered as proteges; the 3 enrolled each gain 10 x scale points a year for 5 years (clamped at 100 by the NPC
    // year) and the settle runs. The bonus of a year is read against 15 percent of the gain, the proteges against 3.
    run: (scale) => {
      const t = tightest()
      const g = socialGame(1, { age: 45 })
      const list = Array.from({ length: MENTOR.proteges + scale }, () => {
        const p = cast(g, 70, 'sibling', { age: 25 })
        initializeNpc(g, p)
        saveNpcLife(p, { ...npcLife(p)!, skill: 20 })
        return p
      })
      for (const p of list) enrolMentor(g, p)
      t.add(protegesOf(g).length, MENTOR.proteges, `${list.length} proteges offered`)
      for (let y = 0; y < 5; y++) {
        const before = list.map((p) => npcLife(p)!.skill)
        const gain = Math.min(10 * scale, 100)
        list.forEach((p, i) => saveNpcLife(p, { ...npcLife(p)!, skill: Math.min(100, before[i]! + gain) }))
        const raw = list.map((p) => npcLife(p)!.skill)
        mentorSettle(g)
        list.forEach((p, i) => {
          const asked = raw[i]! - before[i]!
          t.add(npcLife(p)!.skill - raw[i]!, MENTOR.bonus * Math.max(asked, 1e-9), `a gain of ${asked}, protege ${i + 1}`)
          t.add(npcLife(p)!.skill, 100, 'skill')
        })
      }
      return t.result()
    },
  }
}

const SOCIAL_ROWS: readonly CeilingProbe[] = [edgeCapsRow(), memoryTotalRow(), loanCapRow(), favorCallinRow(), gossipHopsRow(), feudLiveRow(), mentorGainRow()]

const PEOPLE_ROWS: readonly CeilingProbe[] = [peopleReadsRow()]

// R4-L12: the Life rows. The kin links, the estate, the debts and claims of a hand-over, the divorce debt, the contacts a hand-over keeps,
// the quarrel of the will, the life path of a record and the wages of NPCs are bounded by the constants named in test/ceiling-list.json,
// whatever a life holds. Each row feeds the term a hundred times what a life reaches (the plan's table: 40,000 adoptions over 400 anchors,
// 800 kin events in a year, debts 100 times the estate, 500 friends offered, 100 cut-out relatives, 100 times the people) and reports the
// tightest case against the limit its cap sentence promises. A load past 100 times is held at 100 times, because the readers look at 5,000
// entries and no more, so a bigger load adds time and nothing else (the same rule as met-caps).

/** The load of a row: `scale`, held at 100 (the deep run asks for 1,000). */
const loadOf = (scale: number): number => Math.max(1, Math.min(100, Math.floor(scale)))

/** A married sibling or friend of the player with a name for the spouse; nothing else is written. */
function kinAnchor(g: GameState, i: number, relation: 'sibling' | 'friend' = 'sibling'): Person {
  const a = cast(g, 60, relation, { age: 25 + (i % 30), gender: i % 2 === 0 ? 'female' : 'male', firstName: `A${i}`, lastName: 'Lee' })
  return married(g, a, SPOUSE_NAMES[i % SPOUSE_NAMES.length]!)
}

/** The sibling is dead the way handleDeath leaves them: not alive, the year and the cause written. Their cash is untouched. */
function passAway(g: GameState, p: Person): Person {
  p.alive = false
  p.causeOfDeath = 'Old Age'
  p.data.diedYear = g.year
  return p
}

/** A married sibling with a spouse and `kids` children on record and `cash` dollars booked to them from a pool. */
function kinFamily(g: GameState, kids: number, cash: number, i: number): { dead: Person; sids: string[] } {
  const dead = withLife(kinAnchor(g, i))
  const sids: string[] = []
  const spouse = adoptSpouse(g, dead, { gender: 'male' })
  if (spouse !== null) sids.push(spouse)
  for (let k = 0; k < kids; k++) {
    const kid = adoptChild(g, dead, { first: `Kid${k}`, last: 'Lee', gender: k % 2 === 0 ? 'female' : 'male' })
    if (kid !== null) sids.push(kid)
  }
  if (cash > 0) personCash(g, dead, cash, 'prize')
  return { dead, sids }
}

/** The people of the game that hold a given kin sid, in the order of the sids. */
const holdersOf = (g: GameState, sids: readonly string[]): Person[] => sids.flatMap((s) => g.people.filter((p) => p.data.sid === s))

function kinCapsRow(): CeilingProbe {
  return {
    id: 'kin-caps',
    cap: 'an anchor has one spouse and at most 6 kids, the Met shard holds at most 160 kin records, every record has its two edges and no half link is left, and a Met that is full of held people refuses the adoption, however many adoptions are asked (R4-L4)',
    // `400 x min(load, 10)` adoptions over `4 x load` anchors (4,000 over 400 at 100 times; the 160th record is the last one made, so every
    // later ask is a refusal, and test/kin-records.test.ts asks all 40,000 of the plan), a fifth of them weddings, then a Met shard whose
    // 400 records are all held (a debt stake each), where every adoption must be refused with nothing written.
    run: (scale) => {
      const t = tightest()
      const load = loadOf(scale)
      const g = kinGame(7, 0)
      const anchors = Array.from({ length: 4 * load }, (_, i) => kinAnchor(g, i, i % 4 === 0 ? 'friend' : 'sibling'))
      const asked = 400 * Math.min(load, 10)
      for (let i = 0; i < asked; i++) {
        const a = anchors[(i * 7) % anchors.length]!
        if (i % 5 === 0) adoptSpouse(g, a, { gender: 'female' })
        else adoptChild(g, a, { first: `K${i % 90}`, last: 'Lee', gender: i % 2 === 0 ? 'male' : 'female' })
      }
      const sids = kinSidsOf(g)
      t.add(sids.length, KIN_CAPS.records, `${asked} adoptions over ${anchors.length} anchors: kin records`)
      t.add(Object.keys(edgeMap(g)).length, KIN_CAPS.records * 2, 'edges of the links (two a record)')
      for (const a of anchors) {
        const raw: unknown = a.data.kidSids
        t.add(Array.isArray(raw) ? raw.length : 0, KIN_CAPS.kids, `kids of ${a.firstName}`)
        t.add(readKin(a).kids.length, KIN_CAPS.kids, `kids of ${a.firstName} as the reader keeps them`)
      }
      const faults = kinProblems(g)
      if (faults.length > 0) t.add(faults.length, 0, `kinProblems: ${faults[0]}`)

      // A Met shard that is full of held people refuses: no record, no link, no edge.
      const full = kinGame(8, 0)
      for (let i = 0; i < MET_CAPS.records; i++) {
        const sid = floodSid(i)
        if (touchMet(full, sid, { w: 5 })) markMet(full, sid, { fl: STAKE.debt })
      }
      const made = kinAnchor(full, 1)
      let got = 0
      for (let i = 0; i < 5 * Math.min(load, 10); i++) {
        if (adoptSpouse(full, made, { gender: 'female' }) !== null) got++
        if (adoptChild(full, made, { first: 'Sol', last: 'Lee', gender: 'female' }) !== null) got++
      }
      t.add(got, 0, 'adoptions into a Met that is full of held people')
      t.add(Object.keys(edgeMap(full)).filter((k) => k.includes('person:kin.')).length, 0, 'kin edges left by a refused adoption')
      const half = kinProblems(full)
      if (half.length > 0) t.add(half.length, 0, `kinProblems after a full Met: ${half[0]}`)
      return t.result()
    },
  }
}

function lifeFactsRow(): CeilingProbe {
  return {
    id: 'life-facts',
    cap: 'Life says at most 8 facts a year (a wedding, a baby, a death, an estate), however many kin events a year holds, and the estates of the dead keep to the same count (R4-L4, R4-L5)',
    // `8 x load` weddings and babies in one year (800 at 100 times, of which the 160-record cap lets 160 through), then the deaths of
    // `load` anchors with cash, settled in the same year. The facts stored for the year and the counter of the year are read against 8.
    run: (scale) => {
      const t = tightest()
      const load = loadOf(scale)
      const g = kinGame(9, 0)
      const events = 8 * load
      const anchors = Array.from({ length: Math.max(2, Math.ceil(events / 2)) }, (_, i) => kinAnchor(g, i))
      for (let i = 0; i < events; i++) {
        const a = anchors[Math.floor(i / 2) % anchors.length]!
        if (i % 2 === 0) adoptSpouse(g, a, { gender: 'female' })
        else adoptChild(g, a, { first: `K${i % 90}`, last: 'Lee', gender: 'male' })
      }
      const said = (): number => readFacts(g).filter((f) => f.y === g.year && f.k.startsWith('life.')).length
      t.add(said(), 8, `${events} kin events in a year: life facts stored`)
      t.add(g.yearActions['life.facts'] ?? 0, 8, `${events} kin events in a year: the counter`)
      const dying = anchors.slice(0, Math.min(anchors.length, 3 * load))
      for (const a of dying) {
        personCash(g, a, 1_000_000, 'prize')
        passAway(g, a)
      }
      settleKinEstates(g)
      t.add(said(), 8, `${dying.length} estates in the same year: life facts stored`)
      t.add(g.yearActions['life.facts'] ?? 0, 8, `${dying.length} estates in the same year: the counter`)
      return t.result()
    },
  }
}

/** A base for the life path: a kin sid, a birth year and a health. */
const lifeBase = (i: number): KinBase => ({ sid: makeSid({ kind: 'kin', place: 'us', cohort: 1900 + (i % 100), ord: i % 10_000 }), born: 1900 + (i % 100), health: 20 + (i % 80) })

function lifePathRow(): CeilingProbe {
  return {
    id: 'life-path-scan',
    cap: 'ageTo scans at most 130 years of a record, two draws a year and one more for the last, whatever year is asked (1e9 included), and a step that gives the year it last looked at asks for at most 3 draws a call; a base that is not one asks for none (R4-L2)',
    // The draws are counted at the door: every outcomeStream reads the Time Machine forks of the state once, and the state's flags are a
    // counting proxy. `10 x load` full scans (the year 1e9), `1000 x load` incremental calls (100,000 at 100 times), and the hostile bases.
    run: (scale) => {
      const t = tightest()
      const load = loadOf(scale)
      let draws = 0
      const flags = new Proxy({} as Record<string, never>, {
        get: (_target, key) => {
          if (key === 'timelineForks') draws++
          return undefined
        },
      })
      const g = { lifeId: 'life-path-ceiling', flags } as unknown as Parameters<typeof ageTo>[0]
      const call = (base: KinBase | Record<string, unknown>, year: number, opts?: { since?: number; died?: number }): number => {
        draws = 0
        ageTo(g, base as KinBase, year, opts)
        return draws
      }
      const full = 2 * LIFE_MAX_AGE + 1
      for (let i = 0; i < 10 * load; i++) t.add(call(lifeBase(i), 1e9), full, `base ${i} asked for the year 1e9`)
      for (let i = 0; i < 10 * load; i++) t.add(call(lifeBase(i), lifeBase(i).born + 60), full, `base ${i} asked for the age of 60`)
      for (let i = 0; i < 1000 * load; i++) {
        const b = lifeBase(i)
        const year = b.born + 1 + (i % 100)
        t.add(call(b, year, { since: year - 1 }), 3, `base ${i} stepped one year`)
      }
      for (const bad of [{ sid: '__proto__', born: 1900, health: 50 }, { sid: lifeBase(1).sid, born: 1e9, health: 50 }, { sid: lifeBase(1).sid, born: Number.NaN, health: 50 }, { sid: lifeBase(1).sid, born: 1900, health: 1e9 }, null, 7]) {
        t.add(call(bad as never, 2000), 0, `a hostile base ${JSON.stringify(bad)}`)
      }
      t.add(call(lifeBase(2), Number.NaN), 0, 'the year NaN')
      return t.result()
    },
  }
}

function kinEstateRow(): CeilingProbe {
  return {
    id: 'kin-estate',
    cap: 'a death pays its cash in whole dollars, split exactly among at most 7 heirs and never more than the ledger books at once (1e15), a year makes at most 12 relatives Persons and at most 30 kin Persons are alive, and a second pass pays nothing, whatever the estate (R4-L5)',
    // Three families of seven heirs, each with an estate of `1e10 x load` dollars (1e12 at 100 times), settled in one year: the first makes 7 Persons,
    // the second 5, the third none. Then fixed estates of 1e12, 1e15 and 5e15 (past the booking cap). Then four years of two families each, which
    // fill the 30 places. Then `20 x load` dead relatives with nobody to inherit, and a second pass over everything.
    run: (scale) => {
      const t = tightest()
      const load = loadOf(scale)
      const cash = 1e10 * load
      const g = kinGame(15, 0)
      const fams = [0, 1, 2].map((i) => kinFamily(g, 6, cash, i))
      for (const f of fams) passAway(g, f.dead)
      settleKinEstates(g)
      fams.forEach((f, i) => {
        const heirs = holdersOf(g, f.sids)
        t.add(heirs.length, KIN_CAPS.heirs, `family ${i}: heirs of one death`)
        if (heirs.length > 0) t.add(Math.abs(heirs.reduce((s, p) => s + p.money, 0) - cash), 0, `family ${i}: the split is not exact`)
        t.add(f.dead.money > 0 && heirs.length > 0 ? f.dead.money : 0, 0, `family ${i}: cash left on the dead`)
      })
      t.add(g.yearActions['kin.persons'] ?? 0, 12, 'Persons made in a year')
      const books = checkLedger(g)
      if (!books.ok) t.add(books.problems.length, 0, `books: ${books.problems[0]}`)
      const after = JSON.stringify(g.people.map((p) => p.money))
      settleKinEstates(g)
      t.add(JSON.stringify(g.people.map((p) => p.money)) === after ? 0 : 1, 0, 'a second pass in the same year paid')

      for (const big of [1e12, 1e15, 5e15]) {
        const e = kinGame(16, 0)
        const f = kinFamily(e, 2, 0, 0)
        f.dead.money = big
        passAway(e, f.dead)
        settleKinEstates(e)
        const paid = holdersOf(e, f.sids).reduce((s, p) => s + p.money, 0)
        t.add(paid, LEDGER_CAPS.maxBooking, `an estate of ${big}: cash paid`)
        t.add(Math.abs(paid + f.dead.money - big), 0, `an estate of ${big}: the dollars on both sides`)
      }

      const years = kinGame(17, 0)
      for (let y = 0; y < 4; y++) {
        years.year += 1
        years.yearActions = {}
        for (let k = 0; k < 2; k++) passAway(years, kinFamily(years, 6, 100_000, 10 * y + k).dead)
        settleKinEstates(years)
        t.add(years.yearActions['kin.persons'] ?? 0, 12, `year ${y + 1}: Persons made`)
        t.add(years.people.filter((p) => p.alive && typeof p.data.sid === 'string' && p.data.sid.startsWith('kin.')).length, KIN_CAPS.persons, `year ${y + 1}: kin Persons alive`)
      }

      const flood = kinGame(18, 0)
      const roster = 20 * load
      for (let i = 0; i < roster; i++) passAway(flood, withLife(cast(flood, 60, 'sibling', { age: 60, firstName: `D${i}`, lastName: 'Lee', money: 0 })))
      for (const p of flood.people) if (!p.alive) personCash(flood, p, 1_000_000, 'prize')
      settleKinEstates(flood)
      t.add(flood.yearActions['kin.persons'] ?? 0, 12, `${roster} dead relatives with nobody: Persons made`)
      const left = flood.people.filter((p) => !p.alive && p.money > 0).length
      t.add(left, 0, `${roster} dead relatives with nobody: estates left unpaid`)
      return t.result()
    },
  }
}

/** A stamped old player with `kids` adult children, `money` in cash and nothing else, alive and ready to be killed (the family of test/heir-debts.test.ts). */
function oldFamily(money: number): { g: GameState; heir: Person; sibs: Person[] } {
  const g = makeTestGame(1, { age: 78, money, countryId: 'us', residence: { status: 'renting', rent: 0 } })
  g.log = [{ age: g.character.age, year: g.year, entries: [] }]
  stampSocial(g)
  const kids = [50, 47, 44].map((age) => cast(g, 70, 'child', { age, money: 20_000, countryId: 'us', traits: ['kind', 'calm'] }))
  return { g, heir: kids[0]!, sibs: kids.slice(1) }
}

/** The late player owes `p` `owed` dollars of a kind since `since`: the edge player > person with its debt record. */
function owes(g: GameState, p: Person, owed: number, since: number, kind: number): boolean {
  const key = edgeKey(playerRef(g), personEntity(p))
  return key !== null && putEdge(g, key, { t: 50, f: 50, r: 50, s: 0, o: 0, y: g.year, l: g.year, dv: [owed, 0, since, kind, 0] })
}

function estateDebtsRow(): CeilingProbe {
  return {
    id: 'estate-debts',
    cap: 'the debts a hand-over pays out of the estate are at most the estate after the bank loans, oldest first, the heir is never liable and never loses cash they had, and every debt that was listed is closed, however large the debts (R4-L6)',
    // Four creditors, a divorce and three loans, owed `50,000 x scale / 4` each by a late player with 50,000 (debts 100 times the estate at 100 times).
    run: (scale) => {
      const t = tightest()
      const estate = 50_000
      const each = Math.max(1, Math.round((estate * Math.min(scale, 1e6)) / 4))
      const f = oldFamily(estate)
      const people = [0, 1, 2, 3].map(() => cast(f.g, 40, 'friend', { age: 40, money: 0 }))
      people.forEach((p, i) => owes(f.g, p, each, 2015 + i, i === 0 ? DEBT_KIND.divorce : DEBT_KIND.loan))
      killCharacter(f.g, 'Old Age')
      f.g.queue = f.g.queue.filter((m) => m.kind !== 'aiTask')
      const n = continueAsChild(f.g, f.heir.id)
      const paid = people.reduce((s, p) => s + acctBalance(n, personEntity(p)), 0)
      t.add(paid, estate, `debts of ${4 * each} against an estate of ${estate}: paid`)
      t.add(acctBalance(n, personEntity(people[0]!)), estate, 'the oldest creditor is paid first')
      t.add(Math.max(0, 20_000 - n.character.money), 0, 'cash the heir lost')
      t.add(openDebts(n), 0, 'debts still listed after the hand-over')
      t.add(Math.max(0, -n.character.money), 0, 'the heir in debt')
      const books = checkLedger(n)
      if (!books.ok) t.add(books.problems.length, 0, `books: ${books.problems[0]}`)
      return t.result()
    },
  }
}

function receivableRow(): CeilingProbe {
  return {
    id: 'receivable-carry',
    cap: 'a claim passes to the heir as the will\'s share of it, never more than the claim and never more than the trillion an edge can hold, whatever the claim (1e300 included) and whatever the share says (R4-L6)',
    // Three friends who owe the late player `1e10 x load` dollars (1e12 at 100 times) and one hostile claim of 1e300, carried at the shares 0 to 1,
    // and at shares that are not (2, -1, NaN).
    run: (scale) => {
      const t = tightest()
      const load = loadOf(scale)
      const claims = [1e10 * load, 1e300]
      const shares = [0, 0.25, 1 / 3, 0.5, 1, 2, -1, Number.NaN]
      const CAP = 1e12
      for (const claim of claims) {
        for (const share of shares) {
          const f = oldFamily(1)
          const friends = [0, 1, 2].map(() => withLife(cast(f.g, 50, 'friend', { age: 40, money: 0 })))
          for (const p of friends) p.data.w = { by: f.g.character.id, owes: claim, owesSince: 2020 } as never
          const n = structuredClone(f.g)
          const old = n.character
          n.character = { ...old, id: 'heir-id' }
          const r = carryReceivables(n, old, share)
          const s = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0
          const each = Math.min(claim, CAP)
          t.add(r.carried, 3 * (each * s + 0.5), `a claim of ${claim} at the share ${share}`)
          for (const p of friends) t.add(readTies(n, n.people.find((x) => x.id === p.id)!).owes, each, `the claim kept on ${p.firstName}`)
          if (!(Number.isFinite(r.carried) && Number.isFinite(r.forgiven) && r.forgiven >= 0)) t.add(1, 0, `a claim of ${claim} at the share ${share}: carried ${r.carried}, forgiven ${r.forgiven}`)
        }
      }
      return t.result()
    },
  }
}

function divorceDebtRow(): CeilingProbe {
  return {
    id: 'divorce-debt',
    cap: 'a divorce debt is at most the order, a year pays at most a fifth of the cash (k debts at most 1 - 0.8^k of it) and never takes the cash below 0, it lapses in the tenth year, and at most 40 debts stand at once, however rich the player is (R4-L7)',
    // The player holds `1e6 x load` dollars (net worth 100 times) and owes an ex five times that: twelve years of payments. Then 50 exes at once
    // (the table of debts holds 40) in one year.
    run: (scale) => {
      const t = tightest()
      const load = loadOf(scale)
      const cash = 1e6 * load
      const g = socialGame(21, { age: 50, money: cash, countryId: 'us' })
      const ex = cast(g, 15, 'exSpouse', { age: 48, money: 0 })
      const order = 5 * cash
      if (!openDivorceDebt(g, ex, order)) t.add(1, 0, 'the debt was not opened')
      let total = 0
      let open = true
      for (let year = 1; year <= DIVORCE_YEARS + 2; year++) {
        g.year += 1
        const before = g.character.money
        const paidBefore = acctBalance(g, personEntity(ex))
        serveDivorceDebts(g)
        const paid = acctBalance(g, personEntity(ex)) - paidBefore
        total += paid
        t.add(paid, DIVORCE_SHARE * before, `year ${year}: paid out of ${before}`)
        t.add(Math.max(0, -g.character.money), 0, `year ${year}: the cash went below 0`)
        t.add(total, order, `year ${year}: paid in all against an order of ${order}`)
        open = readEdge(g, playerRef(g), personEntity(ex))?.dv !== undefined
        if (year > DIVORCE_YEARS) t.add(open ? 1 : 0, 0, `year ${year}: the debt is still open past ${DIVORCE_YEARS} years`)
      }

      const many = socialGame(22, { age: 50, money: cash, countryId: 'us' })
      const exes = Array.from({ length: 50 }, () => cast(many, 15, 'exSpouse', { age: 48, money: 0 }))
      let opened = 0
      for (const e of exes) if (openDivorceDebt(many, e, order)) opened++
      t.add(opened, EDGE_CAPS.debts, `${exes.length} debts asked for`)
      t.add(openDebts(many), EDGE_CAPS.debts, 'debts that stand')
      many.year += 1
      const was = many.character.money
      serveDivorceDebts(many)
      t.add(was - many.character.money, was * (1 - Math.pow(1 - DIVORCE_SHARE, opened)), `${opened} debts served in one year`)
      t.add(Math.max(0, -many.character.money), 0, 'the cash after 40 debts went below 0')
      return t.result()
    },
  }
}

function keptContactsRow(): CeilingProbe {
  return {
    id: 'kept-contacts',
    cap: 'a hand-over adds at most 40 contacts to the old rule, the same ones in the same order each time and none that is already kept, however many friends the late player had (R4-L9)',
    // `5 x load` people (500 at 100 times) who were cut out of the will, which holds each of them to the late player, offered at once.
    run: (scale) => {
      const t = tightest()
      const load = loadOf(scale)
      const g = socialGame(3, { age: 70, money: 100_000, countryId: 'us', gender: 'male' })
      for (let i = 0; i < 5 * load; i++) {
        const p = cast(g, 70, 'friend', { age: 40, countryId: 'us' })
        p.data.wl = { by: g.character.id, cut: true }
      }
      const ego = playerRef(g)
      const taken = new Set<string>()
      const kept = keptContacts(g, 'nobody', ego, taken)
      t.add(kept.length, 40, `${5 * load} people offered`)
      t.add(new Set(kept.map((c) => c.person.id)).size === kept.length ? 0 : 1, 0, 'a contact kept twice')
      const again = keptContacts(g, 'nobody', ego, taken)
      t.add(JSON.stringify(again.map((c) => c.person.id)) === JSON.stringify(kept.map((c) => c.person.id)) ? 0 : 1, 0, 'the same offer in the same order')
      const some = new Set(kept.slice(0, 10).map((c) => c.person.id))
      t.add(keptContacts(g, 'nobody', ego, some).filter((c) => some.has(c.person.id)).length, 0, 'a contact that was taken already')
      return t.result()
    },
  }
}

function strifeEdgesRow(): CeilingProbe {
  return {
    id: 'strife-edges',
    cap: 'one reading of a will writes at most 3 quarrel edges for one relative and 36 in all, and at most 12 cold feuds live, whatever the plan holds: only the first 400 entries of a list are read; and the quarrels cool, so the 12 rungs of a reading do not keep the heir from starting a feud of their own (R4-L10, the whole-diff review)',
    // `load` relatives cut out of the will, each at an anger of 30 to 99, and four who take a quarter each (100 cut-out relatives at 100 times). Then
    // the real year steps (the edge step fades the grudges, the feud step cools the rungs that nobody plays) with `load` people who hold a grudge
    // of 100 and a betrayal against the heir: the 12 rungs hold every slot at first, and the heir's own feuds start once the rungs have gone.
    run: (scale) => {
      const t = tightest()
      const load = loadOf(scale)
      const n = socialGame(5, { age: 50, money: 1_000_000, countryId: 'us', firstName: 'Heir', residence: { status: 'renting' as const, rent: 0 } })
      const cut = Array.from({ length: load }, () => cast(n, 50, 'sibling', { age: 45, countryId: 'us', money: 20_000, traits: ['kind', 'calm'] }))
      const favored = Array.from({ length: 4 }, () => cast(n, 50, 'sibling', { age: 41, countryId: 'us', money: 20_000, traits: ['kind', 'calm'] }))
      const plan = {
        cutOut: cut.map((p, i) => ({ id: p.id, anger: 30 + (i % 70), filed: false, outcome: '', award: 0 })),
        recipients: favored.map((p) => ({ id: p.id, pct: 0.25 })),
      } as unknown as EstatePlan
      strifeEdges(n, plan, 'heir-before')
      const ids = new Set([...cut, ...favored].map((p) => personEntity(p) as string))
      const quarrels = Object.keys(edgeMap(n)).filter((k) => {
        const at = k.indexOf('>')
        return ids.has(k.slice(0, at)) && ids.has(k.slice(at + 1))
      })
      t.add(quarrels.length, STRIFE.total, `${load} relatives cut out: quarrel edges in one reading`)
      for (const p of cut) {
        const mine = quarrels.filter((k) => k.startsWith(`${personEntity(p)}>`)).length
        t.add(mine, STRIFE.perPerson, `quarrel edges of ${p.firstName}`)
      }
      t.add(liveFeuds(n), EDGE_CAPS.feuds, 'cold feuds that live')
      const wronged = Array.from({ length: load }, () => cast(n, 30, 'friend'))
      const YEARS = 40
      let firstOwn = 0
      for (let y = 1; y <= YEARS; y++) {
        for (const p of wronged) {
          const grudge = { t: 30, f: 30, r: 40, s: 100, o: 0, y: n.year - 3, l: n.year, m: [formatMemory({ kind: 'betrayal', year: n.year - 1, w: 2, by: 'ego' })] }
          if (!putEdge(n, `${personEntity(p)}>${playerRef(n)}`, grudge)) throw new Error('the grudge was refused')
        }
        n.year += 1
        stepEdges(n)
        yearlyActs(n)
        t.add(liveFeuds(n), EDGE_CAPS.feuds, `feuds that live in year ${y} with ${load} people at resentment 100`)
        if (firstOwn === 0 && wronged.some((p) => feudOf(n, p) !== null)) firstOwn = y
      }
      t.add(firstOwn === 0 ? Number.POSITIVE_INFINITY : firstOwn, YEARS, `years until the heir's own grudge started a feud, with the 12 rungs of a reading of ${load} cut-out relatives live`)
      return t.result()
    },
  }
}

/** The multiple of the typical income that one NPC's wage may be: measured over the grid below, 2.13 at the engine's neutral economy and 2.43 at the highest wage index three 100-year lives reached (1.13), written in at 2.5. */
const NPC_WAGE_MULTIPLE = 2.5

function npcWageRow(): CeilingProbe {
  return {
    id: 'npc-wage',
    cap: 'an NPC wage is booked from the pool of employers (or a firm), never from a mint, and is at most 2.5 times the typical income of the country, and all the NPC wages of a year are at most 2.5 times the typical income times the people who earned them, at 100 times the people (R4-L12, X37; the named employer is R6 A.K3)',
    // A grid of skill (0 to 99), education (0 to 3) and experience (0 to 60 years): `20 x load` NPCs with a life in each of three countries and three
    // eras (2,000 people each at 100 times), one yearly step each. The wage of a person is 0.8 of the income the step stored; the flow row of the
    // year says who paid.
    run: (scale) =>
      withWealth(scale, () => {
        const t = tightest()
        const load = loadOf(scale)
        const cells: { skill: number; education: number; experience: number }[] = []
        for (const skill of [0, 30, 60, 99]) for (const education of [0, 1, 2, 3]) for (const experience of [0, 6, 36, 60]) cells.push({ skill, education, experience })
        for (const [countryId, year] of [['us', 1950], ['ng', 2026], ['mc', 2100]] as const) {
          const g = makeTestGame(1, { age: 30, countryId, birthCountryId: countryId, money: 0 })
          g.year = year
          const people = 20 * load
          const typical = typicalIncome(g, countryId)
          const formula = 0.8 * (0.65 + 0.99 + 0.18 * 3 + 0.5)
          let sum = 0
          let worst = 0
          for (let i = 0; i < people; i++) {
            const cell = cells[i % cells.length]!
            const p = createPerson(g, { relation: 'sibling', age: 35, gender: 'female', firstName: `W${i}`, lastName: 'Lee', occupation: 'Clerk', traits: ['kind'], stats: { happiness: 60, health: 70, smarts: 90, looks: 50 }, relationship: 50, money: 0 })
            p.data.countryId = countryId
            saveNpcLife(p, { v: 1, lastYear: year - 1, country: countryId, field: 'Business', ...cell, study: 0, income: 0, debt: 0, investments: 0, housing: 0, ambition: 50, employer: 'Firm', history: [], achievements: [], housingQuality: 50 })
            yearlyNpcLife(g, p)
            const wage = 0.8 * (npcLife(p)?.income ?? 0)
            sum += wage
            worst = Math.max(worst, wage)
          }
          t.add(worst / typical, NPC_WAGE_MULTIPLE, `${countryId} in ${year}: the best wage of ${people} people, in typical incomes`)
          t.add(worst / typical, formula + 1e-9, `${countryId} in ${year}: the best wage against the formula of the step (0.8 x 2.68 at a wage index of 1)`)
          t.add(sum / (typical * people), NPC_WAGE_MULTIPLE, `${countryId} in ${year}: all the wages of a year, per person and per typical income`)
          const row = flowsOf(g, year).find((r) => r.reason === 'wage' && r.country === g.character.countryId)
          const net = row?.net
          // who paid: the pool of employers, in full; nothing was minted, burned or taken from the state, a bank or abroad
          t.add(Math.abs((net?.person ?? 0) + (net?.pool ?? 0) + (net?.firm ?? 0)), 0, `${countryId} in ${year}: the wage row does not net to zero`)
          t.add(Math.abs((net?.mint ?? 0)) + Math.abs(net?.burn ?? 0) + Math.abs(net?.gov ?? 0) + Math.abs(net?.bank ?? 0) + Math.abs(net?.abroad ?? 0), 0, `${countryId} in ${year}: a wage paid by a mint, a burn, the state, a bank or abroad`)
          t.add(Math.abs(acctBalance(g, 'pool:employers') + (net?.person ?? 0)), 0, `${countryId} in ${year}: pool:employers is not the counterparty of the wages`)
          const books = checkLedger(g)
          if (!books.ok) t.add(books.problems.length, 0, `${countryId} in ${year}: books: ${books.problems[0]}`)
        }
        return t.result()
      }),
  }
}

// R4-L12: the Life rows.
const KIN_ROWS: readonly CeilingProbe[] = [kinCapsRow(), lifeFactsRow(), lifePathRow(), kinEstateRow(), estateDebtsRow(), receivableRow(), divorceDebtRow(), keptContactsRow(), strifeEdgesRow(), npcWageRow()]

/** Every row: the R0 and R1 growth terms, the world rows, the effort rows (R3-E9, test/effort-ceilings.ts), the Knowledge rows (R3-H4), then the Social rows (R4-E15), the People rows (R4-U11), then the Life rows (R4-L12). */
export const CEILING_PROBES: readonly CeilingProbe[] = [...LIFE_ROWS, ...WORLD_ROWS, ...EFFORT_ROWS, ...KNOWLEDGE_ROWS, ...SOCIAL_ROWS, ...PEOPLE_ROWS, ...KIN_ROWS]
