// Shared fixtures for the money team suites (advisors-*.test.ts): a rich adult client, a way to hold
// each kind of security the manager cares about, and a politician's job. Tasks 3 and 4 extend this file
// with their own exports; keep each export small and free of assertions beyond "the setup worked".
import { teamOf, writeTeam, type Team } from '../src/game/advisors/team'
import { coinTargets, stockTargets } from '../src/game/computer/money-stocks'
import { buySecurity, investmentHoldings, investmentListing } from '../src/game/investments'
import type { Asset, GameState } from '../src/game/types'
import { makeTestGame } from './helpers'

export interface ClientOptions {
  countryId?: string
  money?: number
  /** The year the game is set in. The character is `age` years old in that year. */
  year?: number
  age?: number
}

/**
 * An adult who rents, has `money` in the bank and no holdings. `lifeId` is `team-<seed>`, so markets are
 * the same on every run. With `year` the clock starts there (the age is the age in that year, so a 1946
 * client is still an adult; use `warp` to move an existing game and keep its birth year).
 */
export function client(seed = 11, opts: ClientOptions = {}): GameState {
  const countryId = opts.countryId ?? 'us'
  const age = opts.age ?? 40
  const g = makeTestGame(seed, { age, money: opts.money ?? 5_000_000, countryId, birthCountryId: countryId, residence: { status: 'renting', rent: 0 } })
  g.lifeId = `team-${seed}`
  if (opts.year !== undefined) {
    g.year = opts.year
    g.log = [{ age, year: opts.year, entries: [] }]
  }
  return g
}

/** Move the clock of a running game; the character keeps the same birth year. */
export function warp(g: GameState, year: number): void {
  g.character.age += year - g.year
  g.year = year
  g.yearActions = {}
}

export type OwnType = 'index' | 'bond' | 'savings' | 'term' | 'stock'

/** The id of the local product of `type` that a new order would buy today. */
export function secIdOf(g: GameState, type: OwnType): string {
  if (type === 'stock') {
    const t = stockTargets(g)[0]
    if (!t) throw new Error('no made-up company is listed')
    return t.secId
  }
  const rows = investmentListing(g)
  const row = rows.find((r) => (type === 'index' || type === 'bond' ? r.type === type : r.type === 'savings' && r.secId.startsWith(type === 'term' ? 'term:' : 'savings:')))
  if (!row) throw new Error(`nothing of type ${type} is listed`)
  return row.secId
}

/** Buy `dollars` of that kind of security by hand (loud, as a player would) and return the holding. */
export function own(g: GameState, type: OwnType, dollars: number): Asset {
  const secId = secIdOf(g, type)
  if (!buySecurity(g, secId, dollars)) throw new Error(`could not buy ${type}`)
  const a = investmentHoldings(g).find((x) => x.details.secId === secId)
  if (!a) throw new Error(`no holding for ${type}`)
  return a
}

const OFFICE: Record<'mayor' | 'governor' | 'leader', { title: string; level: number }> = {
  mayor: { title: 'Mayor', level: 1 },
  governor: { title: 'Governor', level: 2 },
  leader: { title: 'Leader', level: 3 },
}

/** Make the character a politician holding `office` (the same job shape as test/insider-fairness.test.ts). */
export function officeJob(g: GameState, office: 'mayor' | 'governor' | 'leader'): void {
  const { title, level } = OFFICE[office]
  g.character.job = {
    defId: 'politician',
    title,
    company: 'Somewhere',
    category: 'special',
    salary: 100_000,
    level,
    performance: 60,
    yearsInRole: 0,
    yearsAtCompany: 0,
    data: { office, party: 'centrist', approval: 60, termLeft: 4, terms: 1, hot: [], newsAge: -1, bills: [], warChest: 0, favors: 0, scandals: 0, termOver: false, startAge: g.character.age, roleStartAge: g.character.age },
  }
}

/**
 * Write a valid money team record, stamped for this character, through `writeTeam`. `over` is laid over the
 * record the game already has (an empty one when it has none), so two calls add to each other; pass a key as
 * `undefined` to clear it. A manager with no mandate gets the default one when the record is read.
 */
export function withTeam(g: GameState, over: Partial<Team> = {}): void {
  writeTeam(g, { ...teamOf(g), ...over })
}

/** The first made-up listed company of the local exchange (the kind a politician can move), as `own(g, 'stock', ...)` buys it. */
export function madeUpStock(g: GameState): { secId: string; name: string } {
  const t = stockTargets(g).find((x) => !x.real)
  if (!t) throw new Error('no made-up company is listed')
  return { secId: t.secId, name: t.name }
}

/** Buy `dollars` of the first coin that is not a stablecoin and return the holding. */
export function coinHolding(g: GameState, dollars: number): Asset {
  const t = coinTargets(g).find((x) => x.sector !== 'Stablecoin')
  if (!t) throw new Error('no coin is listed')
  if (!buySecurity(g, t.secId, dollars)) throw new Error('could not buy the coin')
  const a = investmentHoldings(g).find((x) => x.details.secId === t.secId)
  if (!a) throw new Error('no holding for the coin')
  return a
}
