// Career kit, year: the idempotent yearly wrapper, the money ledger, the popup budget and the test-only
// audit sink. `settleYear` writes its marker before any roll or payment, so a replayed hook changes
// nothing. A career moves money only through `c.earn` and `c.pay`, and says things only through
// `careerSay`, `careerLog` and `offerChoice`, so the budget and the audit see all of it.
import { earnIncome, log, notice, scriptChoice, spend } from '../../core'
import type { BudgetLine } from '../../nation/data'
import { policyOf } from '../../nation/state'
import type { ChoiceOption, GameState, Json, Tone } from '../../types'
import { ownerKey, ownerMatches } from '../common'
import type { CrisisSet } from './crisis'
import { cool, standingOf, type RivalSpec, type Standing } from './rivals'
import { KIT_LIMITS, appointmentId, cap, claimSettle, int, rec, txt, type CareerBase, type CareerStore, type YearRow } from './state'

// ---------------------------------------------------------------------------
// Audit sink (tests only; null in production)

export type AuditEvent =
  | { t: 'earn' | 'pay'; career: string; label: string; amount: number }
  | { t: 'text'; career: string; role: 'log' | 'outcome' | 'scene' | 'title'; text: string }
  | { t: 'books'; career: string; where: string; delta: number; booked: number; moves: number }
  | { t: 'crisis'; career: string; id: string; stances: string[] }

let sink: ((e: AuditEvent) => void) | null = null

export function setCareerAudit(next: ((e: AuditEvent) => void) | null): void {
  sink = next
}

/** Emit one audit event (a no-op in production). The crisis helper and the menu helpers share the sink. */
export function careerAudit(e: AuditEvent): void {
  sink?.(e)
}

// ---------------------------------------------------------------------------
// Budget and context

export interface Budget { choices: number; notices: number }
/** From the yearly hook: 1 choice and 2 notices. Frozen: copy it per use (`{ ...YEARLY_BUDGET }`). */
export const YEARLY_BUDGET: Budget = Object.freeze({ choices: 1, notices: 2 })
/** Inside an action or a script: 3 choices and 6 notices. Frozen: copy it per use. */
export const ACTION_BUDGET: Budget = Object.freeze({ choices: 3, notices: 6 })

/** Career choices that may wait in the queue at once, across careers. */
const PENDING_MAX = 2
const MONEY_MAX = 1e13
const LABEL_MAX = 60
const TEXT_MAX = 400

export interface CareerCtx<S extends CareerBase = CareerBase> {
  readonly g: GameState
  readonly career: string
  readonly s: S
  readonly year: number
  readonly budget: Budget
  /** The peer ranking `settleYear` took before `run`; null in action and script contexts. */
  readonly field: Standing | null
  /** earnIncome(), rounded. 0 for an empty source, a non-finite amount or under 1. Audited. */
  earn(source: string, amount: number): number
  /** spend(), rounded. False and nothing moved when short, or for an empty sink or a bad amount. Audited. */
  pay(sink: string, amount: number): boolean
}

interface Ledger { earned: number; paid: number; moves: number }
const ledgers = new WeakMap<object, Ledger>()

function makeCtx<S extends CareerBase>(g: GameState, career: string, s: S, budget: Budget, field: Standing | null): CareerCtx<S> {
  const ledger: Ledger = { earned: 0, paid: 0, moves: 0 }
  const c: CareerCtx<S> = {
    g,
    career,
    s,
    year: g.year,
    budget,
    field,
    earn(source, amount) {
      const label = txt(source, LABEL_MAX)
      // A bad call is the career's bug: the audit sees the raw amount, so the playthrough tests fail on it.
      if (!label || !Number.isFinite(amount)) {
        careerAudit({ t: 'earn', career, label, amount })
        return 0
      }
      if (amount < 1 || !Number.isFinite(g.character.money)) return 0
      const n = Math.min(MONEY_MAX, Math.round(amount))
      earnIncome(g, n)
      ledger.earned += n
      ledger.moves += 1
      careerAudit({ t: 'earn', career, label, amount: n })
      return n
    },
    pay(sinkLabel, amount) {
      const label = txt(sinkLabel, LABEL_MAX)
      if (!label || !Number.isFinite(amount) || amount < 0) {
        careerAudit({ t: 'pay', career, label, amount })
        return false
      }
      const n = Math.min(MONEY_MAX, Math.round(amount))
      if (n < 1) return true
      if (!spend(g, n)) return false
      ledger.paid += n
      ledger.moves += 1
      careerAudit({ t: 'pay', career, label, amount: n })
      return true
    },
  }
  ledgers.set(c, ledger)
  return c
}

/** An action or script context: no peer ranking, a copy of ACTION_BUDGET unless one is given. */
export function careerCtx<S extends CareerBase>(g: GameState, career: string, s: S, budget: Budget = { ...ACTION_BUDGET }): CareerCtx<S> {
  return makeCtx(g, career, s, budget, null)
}

/** What a context has moved so far: earned and paid are the totals, moves the number of money moves. */
export function ledgerOf(c: CareerCtx): Readonly<Ledger> {
  return ledgers.get(c) ?? { earned: 0, paid: 0, moves: 0 }
}

/** Audit that cash moved exactly as much as the context booked since `cashBefore`. */
export function emitBooks(c: CareerCtx, where: string, cashBefore: number): void {
  if (!sink) return
  const l = ledgerOf(c)
  careerAudit({ t: 'books', career: c.career, where, delta: c.g.character.money - cashBefore, booked: l.earned - l.paid, moves: l.moves })
}

// ---------------------------------------------------------------------------
// Text

/** Cut at the last space within max characters, with no ellipsis. */
export function fit(text: string, max: number): string {
  if (!(max >= 1) || typeof text !== 'string') return ''
  const m = Math.floor(max)
  if (text.length <= m) return text
  const head = text.slice(0, m + 1)
  const space = head.lastIndexOf(' ')
  let out = space > 0 ? head.slice(0, space) : text.slice(0, m)
  const last = out.charCodeAt(out.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1)
  return out.replace(/[\s,;:]+$/, '')
}

/** A life-log line, fitted to 90 characters. */
export function careerLog(c: CareerCtx, text: string, tone?: Tone): void {
  const line = fit(text.trim(), KIT_LIMITS.line)
  if (!line) return
  careerAudit({ t: 'text', career: c.career, role: 'log', text: line })
  log(c.g, line, tone)
}

/**
 * A popup within the notice budget, else a log line. A free function so the voice tooling can find it.
 * True when it was a popup.
 */
export function careerSay(c: CareerCtx, title: string, text: string, emoji?: string, tone?: Tone): boolean {
  if (c.budget.notices < 1) {
    careerLog(c, text, tone)
    return false
  }
  c.budget.notices -= 1
  careerAudit({ t: 'text', career: c.career, role: 'title', text: title })
  careerAudit({ t: 'text', career: c.career, role: 'outcome', text })
  notice(c.g, title, text, { emoji, tone })
  return true
}

// ---------------------------------------------------------------------------
// Choices

/** Queued choices whose script starts with `career.`. */
export function pendingCareerChoices(g: GameState): number {
  if (!Array.isArray(g.queue)) return 0
  let n = 0
  for (const m of g.queue) if (m && m.kind === 'choice' && typeof m.scriptId === 'string' && m.scriptId.startsWith('career.')) n++
  return n
}

/** True while the context has choice budget left and fewer than 2 career choices wait in the queue. */
export function choiceRoom(c: CareerCtx): boolean {
  return c.budget.choices >= 1 && pendingCareerChoices(c.g) < PENDING_MAX
}

/** Queue a career choice within the budget and the pending cap; stamps the owner and the year on its data. */
export function offerChoice(c: CareerCtx, script: string, title: string, text: string, choices: ChoiceOption[], data: Record<string, Json>, emoji?: string): boolean {
  if (choices.length === 0 || !choiceRoom(c)) return false
  c.budget.choices -= 1
  careerAudit({ t: 'text', career: c.career, role: 'title', text: title })
  careerAudit({ t: 'text', career: c.career, role: 'scene', text })
  scriptChoice(c.g, script, title, text, choices, { emoji, data: { ...data, owner: ownerKey(c.g), year: c.g.year } })
  return true
}

/**
 * Accept a queued career choice: its stamped owner and year must match and `key` must be new in
 * `s.done`. True only the first time; a replay, another owner or another year changes nothing.
 */
export function claimChoice<S extends CareerBase>(g: GameState, s: S, data: Json | undefined, key: string): boolean {
  const d = rec(data)
  if (!ownerMatches(g, d.owner) || d.year !== g.year) return false
  const k = txt(key, LABEL_MAX) // the same cut the record applies to `done`, so the guard survives normalization
  if (!k || s.done.includes(k)) return false
  s.done = cap([...s.done, k], KIT_LIMITS.done)
  return true
}

// ---------------------------------------------------------------------------
// Policy

/** A national budget line as a multiplier, 1 when the country never set it. Read only. */
export function budgetLevel(g: GameState, line: BudgetLine, country: string = g.character.countryId): number {
  const v = policyOf(g, country).national.budget[line]
  return typeof v === 'number' && Number.isFinite(v) ? v : 1
}

// ---------------------------------------------------------------------------
// The yearly wrapper

export interface SettleOpts<S extends CareerBase> {
  career: string
  store: CareerStore<S>
  /** 'Bookings', 'Residuals', 'Stipend', 'Royalties': the word the report card puts before the money. */
  incomeLabel: string
  /** Pure: the career job is held right now. */
  active: (g: GameState) => boolean
  /** The year's body. `live` is false once the job is gone, so only what is already earned pays out. Returns the report note. */
  run: (c: CareerCtx<S>, live: boolean) => string | void
  peers?: { spec: RivalSpec; score: (g: GameState, s: S) => number }
  /** The settle only offers: a set's `odds` is for hints. */
  crises?: Pick<CrisisSet<S>, 'offer'>
  /** Default 'skip': nothing runs, and nothing is written, while in prison. */
  prison?: 'skip' | 'run'
}

/**
 * A yearly hook that is a pure no-op without the job and a record. Otherwise: the settle marker first,
 * then `run`, then a crisis offer (only while the job is held), then one report row, the cooled
 * memory and a `books` audit of the cash that moved.
 */
export function settleYear<S extends CareerBase>(o: SettleOpts<S>): (g: GameState) => void {
  const rank = (g: GameState, s: S): Standing | null => (o.peers ? standingOf(g, o.peers.spec, o.peers.score(g, s), s.memory) : null)
  return (g) => {
    if (!g.character.alive) return
    const live = o.active(g)
    if (!live && !o.store.has(g)) return
    if (g.character.prison && o.prison !== 'run') return
    const s = o.store.mut(g)
    if (!claimSettle(s, g)) return
    const before = g.character.money
    const c = makeCtx(g, o.career, s, { ...YEARLY_BUDGET }, rank(g, s))
    const note = o.run(c, live)
    const held = o.active(g)
    if (held) o.crises?.offer(c)
    const st = rank(g, s)
    const ranked = st !== null && st.top.length > 0 ? st : null // an empty field books rank 0 of 0
    s.standing = int(s.standing, 0, 0, 100)
    s.peak = Math.max(int(s.peak, 0, 0, 100), s.standing)
    const l = ledgerOf(c)
    const row: YearRow = {
      y: g.year,
      income: int(l.earned, 0, 0, 1e13),
      spent: int(l.paid, 0, 0, 1e13),
      rank: ranked?.rank ?? 0,
      of: ranked?.of ?? 0,
      standing: s.standing,
      note: txt(fit(typeof note === 'string' ? txt(note, TEXT_MAX) : '', KIT_LIMITS.line), KIT_LIMITS.line),
    }
    s.rows = cap([...s.rows, row], KIT_LIMITS.rows)
    s.memory = cool(s.memory, g.year)
    s.years = Math.min(9999, s.years + 1)
    s.appt = held ? appointmentId(g.character.job) : ''
    emitBooks(c, 'settle', before)
  }
}
