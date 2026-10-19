// Actor 2.0 legacy: the likeness trust. One Asset of kind other holds a stream of the credits' residuals
// and the actor's name as a license, modeled on music-rights.ts: `details.actorLikeness` (version 1,
// tolerant of junk), paid once a year per asset to whoever holds it, divisible property in
// continueAsChild (an heir keeps it and collects, with an empty career record; nothing here needs a life.ts
// edit). Every cash move goes through the kit's c.earn / c.pay. Imports from actor.ts are used inside
// function bodies only (actor.ts reaches this file through actor-menu.ts and actor-sim.ts).
import { fullName, useYearAction, yearActionsUsed } from '../core'
import { economyOf } from '../economy/model'
import { uid } from '../rng'
import type { Asset, GameState, Json, MenuNode } from '../types'
import { getCountry } from '../world'
import { actorJob } from './actor'
import { INDUSTRIES, type IndustryId } from './actor-data'
import { actorStore, adoptLegacy, type ActorState } from './actor-state'
import { industryOf, scaleOf } from './actor-world'
import { blocked, money } from './common'
import { KIT_LIMITS, cap, int, txt } from './kit/state'
import { ACTION_BUDGET, YEARLY_BUDGET, careerCtx, careerLog, careerSay, emitBooks, type CareerCtx } from './kit/year'

export interface Likeness {
  v: 1
  author: string
  actor: string
  country: string
  industry: IndustryId
  streams: number
  likeness: number
  classics: number
  licenseUntil: number
  advance: number
  unrecouped: number
  receipts: number
  lastPaid: number
  lastYear: number
}

const FILM = '\u{1F39E}\u{FE0F}'
const NAME_MAX = 60
const MONEY_MAX = 1e12
const TOTAL_MAX = 1e13
const INDUSTRY_KEYS = Object.keys(INDUSTRIES) as IndustryId[]

/** What setting the trust up costs at scale 1. */
const TRUST_FEE = 25_000
/** The share of a sale price, of the license advance in years of licensing, of licensing a licensee leaves you. */
const SALE_SHARE = 0.7
const ADVANCE_YEARS = 3
const LICENSE_SHARE = 0.35
const LICENSE_YEARS = 5
const LICENSING_MIN_LIKENESS = 20
const PROMOTE_SHARE = 0.05
const PROMOTE_GAIN = 8
const HEIR_LOSS = 5

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)

// ---------------------------------------------------------------------------
// The record

/** The likeness an asset holds, junk-tolerant: null for anything without a text author. Every number is finite and capped. */
export function likenessOf(a: Asset): Likeness | null {
  const details = a && typeof a === 'object' ? a.details : null
  const raw = details && typeof details === 'object' && !Array.isArray(details) ? details.actorLikeness : null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const author = typeof r.author === 'string' ? txt(r.author, NAME_MAX) : ''
  if (!author) return null
  return {
    v: 1,
    author,
    actor: txt(r.actor, NAME_MAX) || 'An actor',
    country: txt(r.country, 8) || 'us',
    industry: typeof r.industry === 'string' && (INDUSTRY_KEYS as string[]).includes(r.industry) ? (r.industry as IndustryId) : 'domestic',
    streams: int(r.streams, 0, 0, MONEY_MAX),
    likeness: int(r.likeness, 0, 0, 100),
    classics: int(r.classics, 0, 0, 64),
    licenseUntil: int(r.licenseUntil, 0, 0, 9999),
    advance: int(r.advance, 0, 0, MONEY_MAX),
    unrecouped: int(r.unrecouped, 0, 0, MONEY_MAX),
    receipts: int(r.receipts, 0, 0, TOTAL_MAX),
    lastPaid: int(r.lastPaid, 0, 0, MONEY_MAX),
    lastYear: int(r.lastYear, 0, 0, 9999),
  }
}

function save(a: Asset, m: Likeness): void {
  a.details.actorLikeness = m as unknown as Json
}

/** streams x 6 + likeness x 400 x scale, a whole number of dollars. */
export function trustValue(m: Likeness, scale: number): number {
  const v = fin(m.streams) * 6 + fin(m.likeness) * 400 * fin(scale)
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
}

/** A classic: a credit with quality 85 or more, or one named in an award. */
function isClassic(s: Pick<ActorState, 'awards'>, c: { quality: number; title: string }): boolean {
  return c.quality >= 85 || (c.title.length > 0 && s.awards.some((a) => a.includes(`"${c.title}"`)))
}

/** min(100, 0.45 peak star + 3 awards + 4 classics + 0.5 credits). Pure. */
export function likenessAtCreation(s: Pick<ActorState, 'peak' | 'awards' | 'credits'>): number {
  const classics = s.credits.filter((c) => isClassic(s, c)).length
  return clamp(0.45 * fin(s.peak) + 3 * s.awards.length + 4 * classics + 0.5 * s.credits.length, 0, 100)
}

/** The leisure demand of the trust's country this year, clamped 0.7 to 1.3. A hostile country id reads as the default one. */
function demandOf(g: GameState, m: Likeness): number {
  try {
    return clamp(fin(economyOf(g, getCountry(m.country).id, g.year).sectors.leisure.demand, 1), 0.7, 1.3)
  } catch {
    return 1
  }
}

/** A year of licensing: likeness x 150 x scale x leisure demand, from a likeness of 20. */
export function licensingOf(g: GameState, m: Likeness): number {
  if (m.likeness < LICENSING_MIN_LIKENESS) return 0
  const v = m.likeness * 150 * scaleOf(g, m.industry) * demandOf(g, m)
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
}

const licensedNow = (g: GameState, m: Likeness): boolean => m.licenseUntil > 0 && m.licenseUntil >= g.year

/** The asset's value follows the trust: what it is worth less a license advance still unrecouped. */
function reprice(g: GameState, a: Asset, m: Likeness): void {
  a.value = Math.max(0, trustValue(m, scaleOf(g, m.industry)) - m.unrecouped)
}

// ---------------------------------------------------------------------------
// Contexts for an asset's actions

/**
 * An action context for an asset row. A holder with a career record writes to it; an heir has none, and
 * an asset action must not give them one, so they get a throwaway copy (nothing in the actions below
 * writes the record). Books the cash that moved as one audit event.
 */
function act(g: GameState, where: string, fn: (c: CareerCtx<ActorState>) => void): void {
  const c = careerCtx(g, 'actor', actorStore.has(g) ? actorStore.mut(g) : actorStore.view(g), { ...ACTION_BUDGET })
  const before = g.character.money
  fn(c)
  emitBooks(c, where, before)
}

/** The trust asset this life holds under `id`, or undefined. */
const held = (g: GameState, id: string): Asset | undefined => (typeof id === 'string' && id ? g.assets.find((a) => a.id === id && likenessOf(a)) : undefined)

const refuse = (c: CareerCtx<ActorState>, text: string): void => void careerSay(c, 'Likeness Trust', text, FILM)

// ---------------------------------------------------------------------------
// Creating the trust

/** Retired and out of work: the one setup fee that is waived. */
function waived(g: GameState, s: ActorState): boolean {
  return s.done.includes('retired') && !actorJob(g)
}

/** What setting the trust up costs this life: 25,000 x the industry scale, nothing once retired. */
export function trustFee(g: GameState, s: ActorState): number {
  return waived(g, s) ? 0 : Math.round(TRUST_FEE * scaleOf(g, industryOf(g)))
}

/**
 * Why this life can't set a trust up right now, or null. One trust a life, at 18, with a credit not yet in a
 * trust, for the fee. The life's `done` list remembers it, so selling the rights does not open a second trust
 * (and a second waived fee) over the same name.
 */
export function trustBlock(g: GameState, s: ActorState): string | null {
  const why = blocked(g, 18)
  if (why) return why
  if (s.credits.length === 0) return 'You need a credit to put in a trust.'
  if (g.assets.some((a) => likenessOf(a)?.author === g.character.id)) return 'You already have a likeness trust.'
  if (s.done.includes('trust')) return 'You have already had a likeness trust this life.'
  if (!s.credits.some((cr) => !cr.trust)) return 'Every credit is already in a trust.'
  if (g.character.money < trustFee(g, s)) return "You can't cover the setup fee."
  return null
}

/**
 * Sets up the trust: pays the fee (waived once after Retire), takes the legacy record over so the sim owns
 * the residuals, moves every credit in (its residual now pays through the trust and stops paying you), and
 * hands you the asset. Null, with nothing changed, when the rules refuse.
 */
export function createTrust(c: CareerCtx<ActorState>): Asset | null {
  const { g, s } = c
  const why = trustBlock(g, s)
  if (why) {
    refuse(c, why)
    return null
  }
  const industry = industryOf(g)
  const scale = scaleOf(g, industry)
  const fee = trustFee(g, s)
  if (fee >= 1 && !c.pay('Likeness trust', fee)) {
    refuse(c, "You can't cover the setup fee.")
    return null
  }
  adoptLegacy(g, s)
  const streams = s.credits.reduce((n, cr) => n + (!cr.trust && cr.residual >= 25 ? cr.residual : 0), 0)
  const classics = s.credits.filter((cr) => isClassic(s, cr)).length
  const m: Likeness = {
    v: 1,
    author: g.character.id,
    actor: txt(fullName(g.character), NAME_MAX) || 'An actor',
    country: g.character.countryId,
    industry,
    streams: Math.min(MONEY_MAX, Math.round(streams)),
    likeness: Math.round(likenessAtCreation(s)),
    classics: Math.min(64, classics),
    licenseUntil: 0,
    advance: 0,
    unrecouped: 0,
    receipts: 0,
    lastPaid: 0,
    lastYear: g.year, // this year's cheque is not due: the hook for it has already run
  }
  for (const cr of s.credits) cr.trust = true
  s.done = cap([...s.done.filter((x) => x !== 'trust'), 'trust'], KIT_LIMITS.done)
  const value = trustValue(m, scale)
  const a: Asset = { id: uid(g, 'likeness'), kind: 'other', name: `${m.actor} Likeness Trust`.slice(0, 80), emoji: FILM, purchasePrice: fee, value, condition: 100, purchasedAge: g.character.age, upkeep: 0, details: {} }
  save(a, m)
  g.assets.push(a)
  careerLog(c, 'I put my credits into a likeness trust.', 'good')
  careerSay(c, 'Likeness Trust', `Your credits are in a trust worth ${money(value)}. It pays every year, and an heir can collect it.`, FILM, 'good')
  return a
}

// ---------------------------------------------------------------------------
// The yearly cheque

/**
 * Pays every trust this life holds, once a year each (the asset's own `lastYear`), to whoever holds it: the
 * author, an heir with no career record, a retired actor. The stream pays in full and decays by
 * 0.88 + 0.015 x min(4, classics) (under 25 it zeroes); licensing pays in full, or at 35% while a license
 * runs, the share going to the advance first, and a license's unrecouped rest expires with it, never as debt.
 * An heir's likeness fades by 5 a year. Draws no g.rng and never writes the career record.
 */
export function yearlyLikeness(g: GameState): void {
  if (!g.character.alive) return
  const due = g.assets.filter((a) => {
    const m = likenessOf(a)
    return !!m && m.lastYear < g.year
  })
  if (due.length === 0) return
  const c = careerCtx(g, 'actor', actorStore.view(g), { ...YEARLY_BUDGET })
  const before = g.character.money
  let paid = 0
  for (const a of due) {
    const m = likenessOf(a)
    if (!m) continue
    m.lastYear = g.year
    if (m.licenseUntil > 0 && !licensedNow(g, m)) {
      m.licenseUntil = 0
      m.unrecouped = 0
    }
    const licensed = licensedNow(g, m)
    const lic = licensingOf(g, m)
    const share = licensed ? Math.round(lic * LICENSE_SHARE) : lic
    const recoup = Math.min(m.unrecouped, share)
    m.unrecouped -= recoup
    const pay = Math.min(MONEY_MAX, m.streams + share - recoup)
    m.lastPaid = pay
    m.receipts = Math.min(TOTAL_MAX, m.receipts + pay)
    if (licensed && m.licenseUntil <= g.year) {
      m.licenseUntil = 0
      m.unrecouped = 0
      careerLog(c, `The license on ${m.actor}'s likeness ran out.`)
    }
    const next = Math.round(m.streams * (0.88 + 0.015 * Math.min(4, m.classics)))
    m.streams = next < 25 ? 0 : next
    if (m.author !== g.character.id) m.likeness = Math.max(0, m.likeness - HEIR_LOSS)
    reprice(g, a, m)
    save(a, m)
    paid += c.earn('Likeness trust', pay)
  }
  if (paid > 0) careerLog(c, `My likeness trust paid ${money(paid)}.`, 'good')
  emitBooks(c, 'likeness', before)
}

// ---------------------------------------------------------------------------
// The trust's levers (called by the asset rows and the likeness menu; every gate is inside)

/** Advance of 3 x a year of licensing now; for five years you get 35% of licensing, first against the advance, and the unrecouped rest expires. */
export function licenseFive(c: CareerCtx<ActorState>, id: string): void {
  const { g } = c
  const a = held(g, id)
  const why = blocked(g, 18)
  if (why) return refuse(c, why)
  if (!a) return refuse(c, "You don't hold that trust.")
  const m = likenessOf(a)!
  if (m.likeness < LICENSING_MIN_LIKENESS) return refuse(c, 'The likeness is too faint for a licensing offer.')
  if (licensedNow(g, m)) return refuse(c, 'Wait for the current license to run out.')
  const advance = ADVANCE_YEARS * licensingOf(g, m)
  if (advance < 1) return refuse(c, 'No studio is offering for this likeness.')
  const got = c.earn('Likeness license', advance)
  m.advance = got
  m.unrecouped = got
  m.licenseUntil = Math.min(9999, g.year + LICENSE_YEARS)
  m.receipts = Math.min(TOTAL_MAX, m.receipts + got)
  reprice(g, a, m)
  save(a, m)
  careerLog(c, 'I licensed my likeness for five years.', 'good')
  careerSay(c, 'License Signed', `You took ${money(got)} up front. For five years you get 35% of licensing, first against that advance.`, FILM, 'good')
}

/** 5% of the value (at least 1), likeness +8 to 100, once a year per trust. */
export function promoteEstate(c: CareerCtx<ActorState>, id: string): void {
  const { g } = c
  const a = held(g, id)
  const why = blocked(g, 18)
  if (why) return refuse(c, why)
  if (!a) return refuse(c, "You don't hold that trust.")
  const m = likenessOf(a)!
  const key = `actor.promote.${a.id}`
  if (m.likeness >= 100) return refuse(c, 'The name can get no bigger.')
  if (yearActionsUsed(g, key) >= 1) return refuse(c, "You've already promoted the estate this year.")
  const cost = Math.max(1, Math.round(PROMOTE_SHARE * trustValue(m, scaleOf(g, m.industry))))
  if (!c.pay('Estate promotion', cost)) return refuse(c, "You can't afford a campaign right now.")
  useYearAction(g, key, 1)
  m.likeness = Math.min(100, m.likeness + PROMOTE_GAIN)
  reprice(g, a, m)
  save(a, m)
  careerLog(c, 'I promoted my estate.')
  careerSay(c, 'Estate Promotion', `The campaign put the name back in front of people. Likeness is ${m.likeness} of 100.`, FILM, 'good')
}

/** Pays 70% of the value (less a license advance still unrecouped), booked as income, and removes the asset. A running license holds the sale back. */
export function sellRights(c: CareerCtx<ActorState>, id: string): void {
  const { g } = c
  const a = held(g, id)
  const why = blocked(g, 18)
  if (why) return refuse(c, why)
  if (!a) return refuse(c, "You don't hold that trust.")
  const m = likenessOf(a)!
  if (licensedNow(g, m)) return refuse(c, 'Wait for the current license to run out before you sell.')
  const price = Math.round(SALE_SHARE * Math.max(0, trustValue(m, scaleOf(g, m.industry)) - m.unrecouped))
  const got = c.earn('Likeness rights', price)
  g.assets = g.assets.filter((x) => x.id !== a.id)
  careerLog(c, 'I sold the rights to my likeness.')
  careerSay(c, 'Rights Sold', `You sold the trust for ${money(got)}. The buyer collects from now on.`, FILM)
}

// ---------------------------------------------------------------------------
// The asset view

/** The nodes of a trust asset (the hook in menus.ts), or null for any other asset. Pure: it reads the asset and the state. */
export function actorLikenessNodes(g: GameState, a: Asset): MenuNode[] | null {
  const m0 = likenessOf(a)
  if (!m0) return null
  const id = a.id
  const scale = scaleOf(g, m0.industry)
  /** Always the live record, so a row never reads a copy that a run has since changed. */
  const live = (gg: GameState): Likeness | null => {
    const x = held(gg, id)
    return x ? likenessOf(x) : null
  }
  const age = (gg: GameState): string | null => blocked(gg, 18)
  const lines: string[] = [
    `${m0.actor}. Likeness ${m0.likeness} of 100, worth ${money(trustValue(m0, scale))}.`,
    `Streams ${money(m0.streams)} a year. Licensing ${money(licensingOf(g, m0))} a year.`,
    licensedNow(g, m0) ? `Licensed until ${m0.licenseUntil}. Unrecouped ${money(m0.unrecouped)}.` : 'No license is running.',
    `Paid ${money(m0.lastPaid)} last year, ${money(m0.receipts)} in all.`,
  ]
  const nodes: MenuNode[] = lines.map((text, i) => ({ type: 'info' as const, id: `likeness.info.${id}.${i}`, text }))
  nodes.push(
    {
      type: 'action',
      id: `likeness.license.${id}`,
      label: 'License for Five Years',
      emoji: '\u{1F4DC}',
      subtitle: (gg) => {
        const m = live(gg)
        return m ? `Advance ${money(ADVANCE_YEARS * licensingOf(gg, m))}, then 35% of licensing` : ''
      },
      disabledReason: (gg) => {
        const m = live(gg)
        return age(gg) ?? (!m ? "You don't hold that trust." : m.likeness < LICENSING_MIN_LIKENESS ? 'The likeness is too faint for a licensing offer.' : licensedNow(gg, m) ? 'Wait for the current license to run out.' : null)
      },
      confirm: () => 'License your likeness for five years? The advance is recouped from your share.',
      run: (gg) => act(gg, 'likeness.license', (c) => licenseFive(c, id)),
    },
    {
      type: 'action',
      id: `likeness.promote.${id}`,
      label: 'Promote the Estate',
      emoji: '\u{1F4E3}',
      subtitle: (gg) => {
        const m = live(gg)
        return m ? `Cost ${money(Math.max(1, Math.round(PROMOTE_SHARE * trustValue(m, scale))))}, likeness +${PROMOTE_GAIN}` : ''
      },
      disabledReason: (gg) => {
        const m = live(gg)
        return age(gg) ?? (!m ? "You don't hold that trust." : m.likeness >= 100 ? 'The name can get no bigger.' : yearActionsUsed(gg, `actor.promote.${id}`) >= 1 ? "You've already promoted the estate this year." : null)
      },
      run: (gg) => act(gg, 'likeness.promote', (c) => promoteEstate(c, id)),
    },
    {
      type: 'action',
      id: `likeness.sell.${id}`,
      label: 'Sell All Rights',
      emoji: '\u{1F4B8}',
      subtitle: (gg) => {
        const m = live(gg)
        return m ? `Offer ${money(Math.round(SALE_SHARE * Math.max(0, trustValue(m, scale) - m.unrecouped)))}` : ''
      },
      disabledReason: (gg) => {
        const m = live(gg)
        return age(gg) ?? (!m ? "You don't hold that trust." : licensedNow(gg, m) ? 'Wait for the current license to run out before you sell.' : null)
      },
      confirm: () => 'Sell the trust and every future cheque?',
      run: (gg) => act(gg, 'likeness.sell', (c) => sellRights(c, id)),
    },
  )
  return nodes
}

/** Every trust this life holds, for the likeness menu. */
export function trustsOf(g: GameState): Asset[] {
  return cap(
    g.assets.filter((a) => likenessOf(a)),
    128,
  )
}
