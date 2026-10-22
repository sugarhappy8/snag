// R3-H4 (H.2): buying a reading. buyIntel is what a Look closer row calls; takeReading is the same read for a caller that paid already
// (Effort's research reveals, a vet in hiring); ingestSignal is the free news; offersFor is what a screen lists before the player picks.
//
// What a purchase does, in this order (the first refusal wins, and a refusal writes nothing):
//   Exact mode (nothing to buy), the dead, a source that is not for sale, its era, the provider's truth for each key (the kind's
//   `truth`; a key it cannot read is left out), prison for an illegal source, a key already read from this source this year (when
//   every key is, "You already have this year's reading"), the year's time for the do-it-yourself read, cash.
// Then the fee is booked once through the ledger (reason `intel`, or `bribe` for an illegal source, a token of source, year and keys, so
// a replayed call books nothing), a reading is made for each key and kept (record.ts learn), heat is added for an illegal source and one
// line goes in the life log.
//
// A reading is the truth plus a hashed draw (normal.ts zOf of life, key, year, source) of the sd readingSd gives, floored at the
// source's floor. So two fresh lives read the same number, another year or source reads another, the band holds the truth about 80%
// of the time, and nothing here reads or moves g.rng. The fee is flat in the keys (a call reads at most MAX_KEYS) and follows the
// scope and the country's wealth, never the buyer's cash.
import { inPrison, log, shortMoney, spend, useYearAction, yearActionsUsed } from '../core'
import type { Why } from '../kernel/ledger'
import { hashKey } from '../kernel/streams'
import { pickLine } from '../text/pick'
import type { GameState } from '../types'
import { SD_MIN, agedSd, applyNoise, know, sharpFactor, spanOf } from './estimate'
import { kindOfKey, type KeyKind } from './kinds'
import { parseKey, ruleOf } from './keys'
import { isExact } from './mode'
import { zOf } from './normal'
import { addHeat } from './risk'
import { learn } from './record'
import { srcList, storedRow } from './rows'
import {
  MAX_COUNTRIES,
  SOURCES,
  SOURCE_IDS,
  eraBlock,
  isSourceId,
  priceOf,
  readingSd,
  reads,
  wealthOf,
  type Scope,
  type SourceId,
} from './sources'
import type { Estimate, Unit } from './types'

/** The most keys one purchase reads. A fee is flat in them, so the set is bounded: the key set of one screen. */
export const MAX_KEYS = 12
/** The do-it-yourself read takes one of this many actions a year (the yearly action counter of core.ts). */
export const OWN_USES = 3
const OWN_ACTION = 'intel.own'

/** The refusals, in plain words (a button's disabledReason: 70 characters at most). */
const WHY = {
  exact: 'Exact mode already shows every number.',
  notNow: 'Not now.',
  desk: 'The desk works through your standing orders.',
  notForSale: "That isn't for sale.",
  noSuch: 'No one sells that.',
  empty: "There's nothing to look into.",
  uncovered: "That source can't tell you about this.",
  noTruth: "There's nothing to read there yet.",
  prison: 'Not from a cell.',
  already: "You already have this year's reading.",
  paid: 'You already paid for that this year.',
  cash: "You can't afford that.",
  time: "You've run out of time for that this year.",
} as const

// The log line of each purchase: three wordings, 90 characters at most with the fee in. `{fee}` is the price in the player's money.
// `own` takes time and has no fee. Each pool is its own const so the pickline era guard (test/r2-pickline-era-guard.test.ts) can read it.
const OWN_LINES = [
  'I spent my evenings digging through filings and trade papers.',
  'I read up on it myself, one late night after another.',
  'I did my own homework on it, with a pot of coffee.',
] as const
const PRESS_LINES = [
  'I took out a year of the trade press for {fee}.',
  'A year of the trade paper cost me {fee}. It helps.',
  'I subscribed to the trade press for {fee}.',
] as const
const REPORT_LINES = [
  'I bought a market report for {fee}.',
  'A research firm sold me its report for {fee}.',
  'I paid {fee} for a proper market report.',
] as const
const ANALYST_LINES = [
  'I hired an analyst for {fee} to look into it.',
  'An analyst took my {fee} and came back with answers.',
  'I paid an analyst {fee} for a real opinion.',
] as const
const DILIGENCE_LINES = [
  'I paid {fee} for due diligence.',
  'The auditors went through the books for {fee}.',
  'I had the deal checked line by line for {fee}.',
] as const
const INVESTIGATOR_LINES = [
  'I hired a private investigator for {fee}.',
  'A quiet investigator took {fee} to find things out.',
  'I paid an investigator {fee} to ask around.',
] as const
const INFORMANT_LINES = [
  "A man I'd rather not name sold me what he knew for {fee}.",
  'I paid {fee} to someone on the inside. It felt wrong.',
  'I slipped an informant {fee} for what he heard.',
] as const
const HACKER_LINES = [
  "I paid a hacker {fee} to get me what I wasn't meant to see.",
  'A stranger online sold me stolen files for {fee}.',
  'I paid {fee} to someone who knows how to get in.',
] as const

/** The pools by source, for the tests that hold every wording to its length. */
export const LOG_POOLS: Readonly<Record<'own' | 'press' | 'report' | 'analyst' | 'diligence' | 'investigator' | 'informant' | 'hacker', readonly string[]>> = {
  own: OWN_LINES,
  press: PRESS_LINES,
  report: REPORT_LINES,
  analyst: ANALYST_LINES,
  diligence: DILIGENCE_LINES,
  investigator: INVESTIGATOR_LINES,
  informant: INFORMANT_LINES,
  hacker: HACKER_LINES,
}

/** One source for a set of keys, as a screen lists it. `block` is why it cannot be bought now (the words buyIntel would give), or null. */
export interface Offer {
  src: SourceId
  label: string
  price: number
  /** The relative sd the keys show now, and after this read (the mean over the keys). */
  sdFrom: number
  sdTo: number
  block: string | null
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A key the owner can read, with what a reading of it needs. */
interface Cand {
  key: string
  truth: number
  unit: Unit
  span: number
  scale: number | undefined
  kind: KeyKind
}

/** The well-formed keys of a request: strings that parse, no repeats, the first MAX_KEYS. Anything else (not a list, a number) is nothing. */
function keyList(keys: unknown): string[] {
  if (!Array.isArray(keys)) return []
  const out: string[] = []
  for (const k of keys) {
    if (out.length >= MAX_KEYS) break
    if (typeof k === 'string' && parseKey(k) !== null && !out.includes(k)) out.push(k)
  }
  return out
}

/** Call an owner's hook; a hook that throws or answers badly is a hook with no answer. */
function ask<T>(f: () => T): T | null {
  try {
    return f()
  } catch {
    return null
  }
}

function scaleOf(g: GameState, kind: KeyKind, key: string): number | undefined {
  const s = kind.scale ? ask(() => kind.scale!(g, key)) : null
  return finite(s) && s > 0 ? s : undefined
}

/** The keys this source can read, with their truths. A key whose kind has no owner, no rule or no unit, that the source does not cover, or that has no truth now, is left out. */
function reach(g: GameState, src: SourceId, keys: readonly string[]): { cands: Cand[]; covered: number } {
  const cands: Cand[] = []
  let covered = 0
  for (const key of keys) {
    const p = parseKey(key)
    const kind = kindOfKey(key)
    const rule = ruleOf(key)
    if (!p || !kind || !rule || rule.unit === null || !reads(src, p.kind)) continue
    covered++
    const truth = ask(() => kind.truth(g, key))
    if (!finite(truth)) continue
    const scale = scaleOf(g, kind, key)
    const span = spanOf(rule.unit, truth, scale)
    if (span === null) continue
    cands.push({ key, truth, unit: rule.unit, span, scale, kind })
  }
  return { cands, covered }
}

/** The scope of a set of keys: the biggest tier, the most countries and the biggest deal, in the wealthiest country named. */
function scopeOf(g: GameState, cands: readonly Cand[]): Scope {
  let tier: 1 | 2 | 3 = 1
  let countries = 1
  let deal = 0
  let country = g.character.countryId
  let wealth = -1
  for (const c of cands) {
    const s = c.kind.scope ? ask(() => c.kind.scope!(g, c.key)) : null
    if (!s || typeof s !== 'object') {
      const w = wealthOf(g.character.countryId)
      if (w > wealth) {
        wealth = w
        country = g.character.countryId
      }
      continue
    }
    if (s.tier === 2 || s.tier === 3) tier = Math.max(tier, s.tier) as 1 | 2 | 3
    if (finite(s.countries)) countries = Math.min(MAX_COUNTRIES, Math.max(countries, Math.round(s.countries)))
    if (finite(s.deal) && s.deal > deal) deal = s.deal
    const named = typeof s.country === 'string' ? s.country : g.character.countryId
    const w = wealthOf(named)
    if (w > wealth) {
      wealth = w
      country = named
    }
  }
  return { tier, countries, deal, country }
}

/** The relative sd one source reads this key with: its base at ordinary quality (smarts for `own`), x.8 on a talent key, never below its floor. */
function sourceSd(g: GameState, src: SourceId, key: string): number {
  const quality = src === 'own' ? Math.min(1, Math.max(0, g.character.stats.smarts / 100)) : 0.5
  return readingSd(src, { quality, talent: sharpFactor(g, key, 'source') < 1 })
}

/** Two independent reads as one sd (inverse variance), no sharper than SD_MIN. */
const mergedSd = (a: number, b: number): number => Math.max(SD_MIN, 1 / Math.sqrt(1 / (a * a) + 1 / (b * b)))

/** The sd a key shows now, and the one it would show after this source reads it. Pure; from the rule and the record, never the truth. */
function sdsOf(g: GameState, src: SourceId, c: Cand): [number, number] {
  const rule = ruleOf(c.key)!
  const passive = Math.max(SD_MIN, rule.sd0 * sharpFactor(g, c.key, 'passive'))
  const row = storedRow(g, c.key, c.unit)
  const held = row ? Math.max(SD_MIN, agedSd(row.sd, rule.drift, g.year - row.y)) : Number.POSITIVE_INFINITY
  const source = Math.max(SD_MIN, sourceSd(g, src, c.key))
  const after = row ? mergedSd(held, source) : source
  return [Math.min(passive, held), Math.min(passive, after)]
}

/** This year's reading from this source is already in the record. */
function readAlready(g: GameState, src: SourceId, c: Cand): boolean {
  const row = storedRow(g, c.key, c.unit)
  return row !== null && row.y === g.year && srcList(row.src).includes(src)
}

interface Plan {
  /** Why it cannot be done now, or null. */
  why: string | null
  /** Keys a source could read at all (the offer exists), before any other check. */
  reach: number
  /** What would be read and paid for. */
  use: Cand[]
  price: number
  sdFrom: number
  sdTo: number
}

/** The whole decision, pure: the same checks in the same order for an offer and for a purchase, so they can never disagree. */
function plan(g: GameState, src: SourceId, rawKeys: unknown, standing: boolean): Plan {
  const none = (why: string, reachN = 0, use: Cand[] = [], price = 0, sdFrom = 0, sdTo = 0): Plan => ({ why, reach: reachN, use, price, sdFrom, sdTo })
  if (!isSourceId(src)) return none(WHY.noSuch)
  if (isExact()) return none(WHY.exact)
  const keys = keyList(rawKeys)
  if (keys.length === 0) return none(WHY.empty)
  const def = SOURCES[src]
  const { cands, covered } = reach(g, src, keys)
  const open = def.buyable || (standing && src === 'desk')
  const fresh = cands.filter((c) => !readAlready(g, src, c))
  const basis = fresh.length > 0 ? fresh : cands
  const price = basis.length > 0 ? priceOf(src, scopeOf(g, basis), g.character.countryId) : 0
  const sd = basis.reduce<[number, number]>((acc, c) => {
    const [from, to] = sdsOf(g, src, c)
    return [acc[0] + from / basis.length, acc[1] + to / basis.length]
  }, [0, 0])
  const blocked = (why: string): Plan => none(why, cands.length, fresh, price, sd[0], sd[1])

  if (!g.character.alive) return blocked(WHY.notNow)
  if (!open) return blocked(src === 'desk' ? WHY.desk : WHY.notForSale)
  const era = eraBlock(g, src)
  if (era !== null) return blocked(era)
  if (cands.length === 0) return none(covered === 0 ? WHY.uncovered : WHY.noTruth)
  if (def.kind === 'illegal' && inPrison(g)) return blocked(WHY.prison)
  if (fresh.length === 0) return blocked(WHY.already)
  if (src === 'own' && yearActionsUsed(g, OWN_ACTION) >= OWN_USES) return blocked(WHY.time)
  if (!(g.character.money >= price)) return blocked(WHY.cash)
  return { why: null, reach: cands.length, use: fresh, price, sdFrom: sd[0], sdTo: sd[1] }
}

/**
 * What a screen can offer for these keys: one row per buyable source that can read at least one of them, in table order, with its
 * price, the sd the keys show now and after, and the reason it cannot be bought now. Empty in Exact mode. Pure.
 */
export function offersFor(g: GameState, keys: readonly string[]): Offer[] {
  if (isExact()) return []
  const list = keyList(keys)
  if (list.length === 0) return []
  const out: Offer[] = []
  for (const src of SOURCE_IDS) {
    const def = SOURCES[src]
    if (!def.buyable) continue
    const p = plan(g, src, list, false)
    if (p.reach === 0) continue
    out.push({ src, label: def.label, price: p.price, sdFrom: p.sdFrom, sdTo: p.sdTo, block: p.why })
  }
  return out
}

/** The reading of one key from one source this year: the truth plus a hashed draw of the source's sd. */
function readingOf(g: GameState, src: SourceId, c: Cand, sd: number): number {
  return applyNoise(c.unit, c.truth, sd, zOf(g, c.key, g.year, src), c.span)
}

/** One wording for a purchase, with the fee in the player's money. The news, the lab and the desk are never bought and have none. */
function lineFor(g: GameState, src: SourceId): string | null {
  switch (src) {
    case 'own':
      return pickLine(g, OWN_LINES)
    case 'press':
      return pickLine(g, PRESS_LINES)
    case 'report':
      return pickLine(g, REPORT_LINES)
    case 'analyst':
      return pickLine(g, ANALYST_LINES)
    case 'diligence':
      return pickLine(g, DILIGENCE_LINES)
    case 'investigator':
      return pickLine(g, INVESTIGATOR_LINES)
    case 'informant':
      return pickLine(g, INFORMANT_LINES)
    case 'hacker':
      return pickLine(g, HACKER_LINES)
    default:
      return null
  }
}

function logPurchase(g: GameState, src: SourceId, price: number): void {
  const line = lineFor(g, src)
  if (line !== null) log(g, line.replace('{fee}', shortMoney(price)))
}

/**
 * Buy a reading of `keys` (at most MAX_KEYS) from `src`. Returns { ok: true }, or { ok: false, why } with nothing booked, kept or
 * logged. `opts.standing` lets the standing orders (R3-H5) use the desk, which nobody can walk up to.
 */
export function buyIntel(g: GameState, src: SourceId, keys: readonly string[], opts: { standing?: boolean } = {}): { ok: boolean; why?: string } {
  const p = plan(g, src, keys, opts.standing === true)
  if (p.why !== null) return { ok: false, why: p.why }
  const def = SOURCES[src]
  const made = p.use.map((c) => {
    const sd = Math.max(def.floor, sourceSd(g, src, c.key))
    return { c, sd, mid: readingOf(g, src, c, sd) }
  })

  if (src === 'own') {
    if (!useYearAction(g, OWN_ACTION, OWN_USES)) return { ok: false, why: WHY.time }
  } else if (p.price > 0) {
    const token = `intel:${src}:${g.year}:${(hashKey(p.use.map((c) => c.key).sort().join('|')) >>> 0).toString(36)}`
    const why: Why = { reason: def.kind === 'illegal' ? 'bribe' : 'intel', token }
    if (!spend(g, p.price, why)) return { ok: false, why: WHY.paid }
  }
  for (const r of made) learn(g, r.c.key, { mid: r.mid, sd: r.sd, src })
  if (def.heat > 0) addHeat(g, def.heat)
  logPurchase(g, src, p.price)
  return { ok: true }
}

/**
 * A reading of `key` whose fee the caller already paid or that costs nothing (the lab, a vet, the news): no money booked, nothing
 * logged. The reading is `truth` plus a hashed draw of the source's sd, `opts.sd` instead when given, never below the source's floor;
 * `opts.scale` is what a `delta` key is measured against. It is kept and merged like a purchase. Null, with nothing written, in
 * Exact mode, when the source cannot read the key, the key has no rule or the truth cannot be read, or when this source already
 * read the key this year. Otherwise the estimate the key now stands on.
 */
export function takeReading(g: GameState, src: SourceId, key: string, truth: number, opts: { sd?: number; scale?: number } = {}): Estimate | null {
  if (isExact() || !isSourceId(src) || typeof key !== 'string') return null
  const p = parseKey(key)
  const rule = ruleOf(key)
  if (!p || !rule || rule.unit === null || !reads(src, p.kind) || !finite(truth)) return null
  const scale = finite(opts.scale) && opts.scale > 0 ? opts.scale : undefined
  const span = spanOf(rule.unit, truth, scale)
  if (span === null) return null
  const given = finite(opts.sd) && opts.sd > 0 ? opts.sd : sourceSd(g, src, key)
  const sd = Math.max(SOURCES[src].floor, given)
  const mid = applyNoise(rule.unit, truth, sd, zOf(g, key, g.year, src), span)
  if (learn(g, key, { mid, sd, src }) === null) return null
  return know(g, key, truth, scale !== undefined ? { scale } : {})
}

/**
 * The free news: an item says something about `key` whose value is `v`. It is kept as a reading from the `news` source (sd .30 unless
 * the item says more, never below .20), once a year per key. True when it was kept.
 */
export function ingestSignal(g: GameState, s: { key: string; v: number; sd?: number }): boolean {
  if (typeof s !== 'object' || s === null) return false
  return takeReading(g, 'news', s.key, s.v, finite(s.sd) && s.sd > 0 ? { sd: s.sd } : {}) !== null
}
