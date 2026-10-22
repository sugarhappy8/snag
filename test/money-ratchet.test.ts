// ci: fast
// R2-L4 (A.K1 c): the reasoned-call ratchet. It replaces the R1 money ratchet (R1-P5, X.G1), which counted only the calls and
// the `+=` forms, so `g.character.money -= cost` and `b.cash = 0` slipped past it. Every dollar is booked once and booked with
// a reason; the places that skip the reason may only shrink. Per file of src/ (never tests, never .d.ts), by tokens only, it counts:
//
//   earnIncome(   addMoney(   spend(        calls with NO reason: no third argument, or `undefined`, `null`, 'unreasoned',
//                                           or an object literal with no top-level `reason`
//   .cash +=  -=  =  *=  /=                 raw writes on any receiver
//   .money +=  -=  =  *=  /=                (a line that carries the comment `ledger-ok: <why>` is not a purse and is not counted)
//
// A call with a reason is not counted: a string literal must be a key of REASONS (src/game/kernel/reasons.ts), an object literal
// names `reason`, any other expression (a variable `why`) is taken on trust. The receiver is not named on purpose: renaming
// `b.cash` to `biz.cash` must not dodge the ratchet.
//
// The rules: a count above the file's entry in test/money-ratchet.json fails, and so does a nonzero count in a file with no
// entry (a new file may call the three with a reason and may write no `.cash` or `.money`). Every path prefix in MIGRATED must hold
// no counted site at all: a migration batch (R2-L6 to R2-L12) appends its prefixes there first, and the failure lists
// file:line for each site left, which is the batch's work list. At most 12 `ledger-ok:` markers exist in src/, and none sits
// on a character, a Person or a company receiver.
//
// To shrink the baseline after sites are migrated (it refuses to raise or add):
//   UPDATE_MONEY_RATCHET=1 /Users/saeed/projects/anotherlife/wt/bin/vt test/money-ratchet.test.ts
// To write version 2 from the tree (only when the file is missing or still version 1, as it was at R2-L4):
//   UPDATE_MONEY_RATCHET=init /Users/saeed/projects/anotherlife/wt/bin/vt test/money-ratchet.test.ts
// A pure rename of a file means moving its entry by hand.
//
// Known gap: a money write through Object.assign, a destructuring or a bracket key is invisible to a token scan. The conservation
// probe (test/ledger-conservation.test.ts) measures that gap as drift.
//
// `core.ts`, `cash.ts` and the constructors that set an opening balance stay in the baseline for good: they are the primitives
// and the opening balances, not unbooked flows.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REASONS } from '../src/game/kernel/reasons'
import {
  K_ID,
  K_PUNCT,
  K_STR,
  ROOT,
  closeParen,
  isId,
  isPunct,
  lineOf,
  loadSources,
  splitArgs,
  toSource,
  type SourceFile,
  type Tok,
} from './scan-kit'

const BASELINE_PATH = join(ROOT, 'test', 'money-ratchet.json')

/** Path prefixes whose files hold no counted site. One per line; a migration batch appends its own (R2-L6 to R2-L12). */
const MIGRATED: readonly string[] = [
  // R2-L6: home, family, love, NPC lives
  'src/game/assets.ts',
  'src/game/birth-background.ts',
  'src/game/development.ts',
  'src/game/household.ts',
  'src/game/immigration.ts',
  'src/game/landlord.ts',
  'src/game/love.ts',
  'src/game/npc-lives.ts',
  'src/game/relationships.ts',
  'src/game/royalty.ts',
  // R2-L7: body, law, work, workshop, nation, advisors
  'src/game/advisors/year.ts',
  'src/game/careers.ts',
  'src/game/crime.ts',
  'src/game/cv.ts',
  'src/game/education.ts',
  'src/game/effects.ts',
  'src/game/finance.ts',
  'src/game/gambling.ts',
  'src/game/health.ts',
  'src/game/nation/drama.ts',
  'src/game/nation/govern.ts',
  'src/game/nation/graft.ts',
  'src/game/nation/regime.ts',
  'src/game/nation/yearly.ts',
  'src/game/prison.ts',
  'src/game/underworld.ts',
  'src/game/workshop/build.ts',
  'src/game/workshop/events.ts',
  'src/game/workshop/launch.ts',
  'src/game/workshop/yearly.ts',
  // R2-L8: events, activities, and the estate in life.ts
  'src/game/activities/',
  'src/game/events/',
  'src/game/life.ts',
  // R2-L9: shops and computer
  'src/game/computer/dev-common.ts',
  'src/game/computer/dev-learn.ts',
  'src/game/computer/dev-projects.ts',
  'src/game/computer/dev-venture.ts',
  'src/game/computer/money-common.ts',
  'src/game/computer/money-crypto.ts',
  'src/game/computer/money-options.ts',
  'src/game/computer/money-scams.ts',
  'src/game/computer/money-stocks.ts',
  'src/game/computer/online.ts',
  'src/game/shops/everyday.ts',
  'src/game/shops/fleet-operations.ts',
  'src/game/shops/luxury-brands-assets.ts',
  'src/game/shops/luxury-brands-deal.ts',
  'src/game/shops/luxury-brands-rooms.ts',
  'src/game/shops/luxury-family.ts',
  'src/game/shops/luxury-fleet.ts',
  'src/game/shops/luxury-islands.ts',
  'src/game/shops/luxury-pamper.ts',
  'src/game/shops/luxury-societies.ts',
  'src/game/shops/luxury-staff.ts',
  'src/game/shops/memberships-tickets.ts',
  'src/game/shops/memberships.ts',
  // R2-L10: special careers (special/kit/year.ts was done in R2-L3)
  'src/game/special/actor-pipeline.ts',
  'src/game/special/actor.ts',
  'src/game/special/astronaut.ts',
  'src/game/special/athlete.ts',
  'src/game/special/author-career.ts',
  'src/game/special/author-story.ts',
  'src/game/special/corruption.ts',
  'src/game/special/fame.ts',
  'src/game/special/gamedev-career.ts',
  'src/game/special/gamedev-make.ts',
  'src/game/special/hustler.ts',
  'src/game/special/military.ts',
  'src/game/special/model.ts',
  'src/game/special/music-rights.ts',
  'src/game/special/music.ts',
  'src/game/special/politics.ts',
  'src/game/special/social.ts',
  'src/game/special/sports-core.ts',
  'src/game/special/sports-esports.ts',
  'src/game/special/sports-fight.ts',
  'src/game/special/sports-individual.ts',
  'src/game/special/sports-legacy.ts',
  'src/game/special/sports-olympics.ts',
  'src/game/special/sports-prowrestling.ts',
  'src/game/special/sports-sumo.ts',
  // R2-L11: business A
  'src/game/business/bank-events.ts',
  'src/game/business/board-ceo.ts',
  'src/game/business/competition-events.ts',
  'src/game/business/conglomerate-actions.ts',
  'src/game/business/conglomerate-year.ts',
  'src/game/business/fund-events.ts',
  'src/game/business/gamestudio.ts',
  'src/game/business/hedge-fund.ts',
  'src/game/business/lab-year.ts',
  'src/game/business/manage.ts',
  'src/game/business/market-strategy.ts',
  'src/game/business/nepo-year.ts',
  'src/game/business/staff.ts',
  'src/game/business/yearly.ts',
  // R2-L12: business B (the other files of business/)
  'src/game/business/bank.ts',
  'src/game/business/bank-actions.ts',
  'src/game/business/board.ts',
  'src/game/business/board-menu.ts',
  'src/game/business/board-vote.ts',
  'src/game/business/career.ts',
  'src/game/business/competition-moves.ts',
  'src/game/business/conglomerate-family.ts',
  'src/game/business/conglomerate-management.ts',
  'src/game/business/deeptech-core.ts',
  'src/game/business/deeptech-funding.ts',
  'src/game/business/deeptech-manager.ts',
  'src/game/business/deeptech-sim.ts',
  'src/game/business/dynasty-ownership.ts',
  'src/game/business/economy.ts',
  'src/game/business/events.ts',
  'src/game/business/events-extra.ts',
  'src/game/business/exit.ts',
  'src/game/business/expansion.ts',
  'src/game/business/founding.ts',
  'src/game/business/franchise.ts',
  'src/game/business/fund-actions.ts',
  'src/game/business/fund-manager.ts',
  'src/game/business/fund-sim.ts',
  'src/game/business/gamestudio-engines.ts',
  'src/game/business/group-services.ts',
  'src/game/business/group-treasury.ts',
  'src/game/business/group-ventures.ts',
  'src/game/business/heavy-rd.ts',
  'src/game/business/hedge-company.ts',
  'src/game/business/nepo-actions.ts',
  'src/game/business/own-trade.ts',
  'src/game/business/rd.ts',
  'src/game/business/rescue.ts',
  'src/game/business/sector-core.ts',
  'src/game/business/state.ts',
  'src/game/business/supply-policy.ts',
  'src/game/business/venues.ts',
]

/** The comment that says a raw `.cash` or `.money` write is not a purse. */
const MARKER = 'ledger-ok:'
const MARKER_CAP = 12

const KEYS = [
  'earnIncome',
  'addMoney',
  'spend',
  '.cash +=',
  '.cash -=',
  '.cash =',
  '.cash *=',
  '.cash /=',
  '.money +=',
  '.money -=',
  '.money =',
  '.money *=',
  '.money /=',
] as const
type Key = (typeof KEYS)[number]
type Counts = Partial<Record<Key, number>>

interface Baseline {
  v: 2
  files: Record<string, Counts>
}

interface Violation {
  file: string
  key: Key | null
  count: number
  allowed: number
  text: string
}

const CALLS = new Set<string>(['earnIncome', 'addMoney', 'spend'])
const RAW_OPS = new Set<string>(['+=', '-=', '=', '*=', '/='])

/** The receivers of a character, a Person or a company in the tree (and the plan's `character`, `p`, `b`): a marker never sits on these. */
const PURSE_RECEIVERS = new Set<string>(['character', 'c', 'p', 'person', 'parent', 'heir', 'b', 'bb', 'biz'])

/** One place the scan looked at: a call to one of the three, or a raw write of `.cash` or `.money`. */
interface Site {
  key: Key
  line: number
  /** A raw write (false: a call). */
  raw: boolean
  /** What the ratchet counts: a call with no reason, or a raw write without a marker. */
  counted: boolean
  /** A raw write whose own line carries `ledger-ok:`. */
  marked: boolean
  /** A string literal reason that is not a key of REASONS. */
  unknown?: string
  /** The identifier before the `.` of a raw write, when there is one. */
  recv?: string
}

/** The third argument of a call, judged. `unknown` is a string literal that is not in REASONS (it counts as no reason). */
function judgeReason(arg: readonly Tok[] | undefined): { reasoned: boolean; unknown?: string } {
  if (!arg || arg.length === 0) return { reasoned: false }
  const literal = (t: Tok): { reasoned: boolean; unknown?: string } => {
    if (t.v === 'unreasoned') return { reasoned: false }
    return Object.hasOwn(REASONS, t.v) ? { reasoned: true } : { reasoned: false, unknown: t.v }
  }
  if (arg.length === 1) {
    const t = arg[0]!
    if (isId(t, 'undefined') || isId(t, 'null')) return { reasoned: false }
    if (t.k === K_STR) return literal(t)
    return { reasoned: true }
  }
  if (!isPunct(arg[0], '{')) return { reasoned: true }
  // An object literal: it names the reason at its top level, or it is no reason at all (`{ with: x }`).
  const base = arg[0]!.td
  let depth = 0
  for (let i = 0; i < arg.length; i++) {
    const t = arg[i]!
    if (t.k === K_PUNCT && (t.v === '(' || t.v === '[' || t.v === '{')) depth++
    else if (t.k === K_PUNCT && (t.v === ')' || t.v === ']' || t.v === '}')) depth--
    else if (depth === 1 && t.td === base && isId(t, 'reason') && (isPunct(arg[i - 1], '{') || isPunct(arg[i - 1], ','))) {
      const next = arg[i + 1]
      if (isPunct(next, ',') || isPunct(next, '}')) return { reasoned: true } // shorthand: { reason }
      if (!isPunct(next, ':')) continue
      const value = arg[i + 2]
      const end = arg[i + 3]
      const single = value !== undefined && (end === undefined || isPunct(end, ',') || isPunct(end, '}'))
      if (!single) return { reasoned: true }
      if (isId(value, 'undefined') || isId(value, 'null')) return { reasoned: false }
      if (value.k === K_STR) return literal(value)
      return { reasoned: true }
    }
  }
  return { reasoned: false }
}

const scans = new WeakMap<SourceFile, Site[]>()

/** Every call and raw write of one file, in source order. */
function scan(src: SourceFile): Site[] {
  const memo = scans.get(src)
  if (memo) return memo
  const out: Site[] = []
  const { toks, text } = src
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k === K_ID && CALLS.has(t.v) && isPunct(toks[i + 1], '(') && !isId(toks[i - 1], 'function')) {
      const close = closeParen(toks, i + 1)
      const why = judgeReason(close < 0 ? undefined : splitArgs(toks, i + 1, close)[2])
      out.push({ key: t.v as Key, line: lineOf(text, t.p), raw: false, counted: !why.reasoned, marked: false, unknown: why.unknown })
    } else if (t.k === K_PUNCT && RAW_OPS.has(t.v) && isPunct(toks[i - 2], '.')) {
      const name = toks[i - 1]!
      if (name.k !== K_ID || (name.v !== 'cash' && name.v !== 'money')) continue
      const from = text.lastIndexOf('\n', name.p) + 1
      const to = text.indexOf('\n', t.e)
      const marked = text.slice(from, to < 0 ? text.length : to).includes(MARKER)
      const recv = toks[i - 3]
      out.push({
        key: `.${name.v} ${t.v}` as Key,
        line: lineOf(text, name.p),
        raw: true,
        counted: !marked,
        marked,
        recv: recv !== undefined && recv.k === K_ID ? recv.v : undefined,
      })
    }
  }
  scans.set(src, out)
  return out
}

/** The nonzero counts of one file: calls with no reason, and raw writes without a marker. */
function countFile(src: SourceFile): Counts {
  const out: Counts = {}
  for (const s of scan(src)) if (s.counted) out[s.key] = (out[s.key] ?? 0) + 1
  return out
}

/** Counts per file, nonzero only, with the files in path order and the keys in KEYS order. */
function countAll(sources: readonly SourceFile[]): Record<string, Counts> {
  const out: Record<string, Counts> = {}
  for (const s of [...sources].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const c = countFile(s)
    if (KEYS.some((k) => c[k])) out[s.path] = Object.fromEntries(KEYS.filter((k) => c[k]).map((k) => [k, c[k]!])) as Counts
  }
  return out
}

/** Every call of the three in a file, reasoned or not, by name. */
function callTotals(src: SourceFile): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of scan(src)) if (!s.raw) out[s.key] = (out[s.key] ?? 0) + 1
  return out
}

function violations(current: Record<string, Counts>, base: Baseline): Violation[] {
  const out: Violation[] = []
  for (const [file, counts] of Object.entries(current)) {
    const allowed = base.files[file]
    for (const k of KEYS) {
      const n = counts[k] ?? 0
      const cap = allowed?.[k] ?? 0
      if (n <= cap) continue
      out.push({
        file,
        key: k,
        count: n,
        allowed: cap,
        text: allowed
          ? `${file}: ${k} is ${n}, the baseline is ${cap}`
          : `${file}: ${k} is ${n} in a file that has no entry (a new file moves money with no reason)`,
      })
    }
  }
  return out
}

/** One line per file that now books less than its entry says. */
function notes(current: Record<string, Counts>, base: Baseline): string[] {
  const out: string[] = []
  for (const [file, allowed] of Object.entries(base.files)) {
    const now = current[file] ?? {}
    const less = KEYS.filter((k) => (now[k] ?? 0) < (allowed[k] ?? 0))
    if (less.length) out.push(`${file}: ${less.map((k) => `${k} ${allowed[k]} -> ${now[k] ?? 0}`).join(', ')}`)
  }
  return out
}

/** One line per site of a migrated prefix that is still counted: the batch's work list. */
function migratedLeft(sources: readonly SourceFile[], migrated: readonly string[]): string[] {
  const out: string[] = []
  for (const s of sources) {
    if (!migrated.some((p) => s.path.startsWith(p))) continue
    for (const site of scan(s)) {
      if (site.counted) out.push(`${s.path}:${site.line}: ${site.raw ? `${site.key} is a raw write` : `${site.key} has no reason`}`)
    }
  }
  return out
}

/** A string literal reason that is not in REASONS, one line per call. */
function unknownReasons(sources: readonly SourceFile[]): string[] {
  const out: string[] = []
  for (const s of sources) for (const site of scan(s)) if (site.unknown !== undefined) out.push(`${s.path}:${site.line}: ${site.key} names the unknown reason '${site.unknown}'`)
  return out
}

/** How many `ledger-ok:` markers the sources carry. */
function markerCount(sources: readonly SourceFile[]): number {
  return sources.reduce((n, s) => n + s.text.split(MARKER).length - 1, 0)
}

/** A marker on a character, a Person or a company receiver is no way out of the ratchet. */
function purseMarkers(sources: readonly SourceFile[]): string[] {
  const out: string[] = []
  for (const s of sources) for (const site of scan(s)) if (site.marked && site.recv !== undefined && PURSE_RECEIVERS.has(site.recv)) out.push(`${s.path}:${site.line}: ${MARKER} on ${site.recv}${site.key.slice(0, site.key.indexOf(' '))}`)
  return out
}

/** The baseline with every entry lowered to the current counts. Throws on anything that would raise a count or add a file. */
function shrink(base: Baseline, current: Record<string, Counts>): Baseline {
  const up = violations(current, base)
  if (up.length) throw new Error(`the money ratchet only goes down:\n${up.map((v) => v.text).join('\n')}`)
  const files: Record<string, Counts> = {}
  for (const file of Object.keys(base.files).sort()) if (current[file]) files[file] = current[file]!
  return { v: 2, files }
}

/** One line per file, so a diff reads one file at a time. */
function format(b: Baseline): string {
  const rows = Object.entries(b.files).map(([file, c]) => `    ${JSON.stringify(file)}: { ${KEYS.filter((k) => c[k]).map((k) => `${JSON.stringify(k)}: ${c[k]}`).join(', ')} }`)
  return `{\n  "v": ${b.v},\n  "files": {\n${rows.join(',\n')}\n  }\n}\n`
}

function parse(raw: string | null): { v: number; files: Record<string, Counts> } | null {
  if (raw === null) return null
  try {
    const j = JSON.parse(raw) as { v?: unknown; files?: unknown }
    return typeof j.v === 'number' && j.files !== null && typeof j.files === 'object' ? { v: j.v, files: j.files as Record<string, Counts> } : null
  } catch {
    return null
  }
}

/** The text an UPDATE_MONEY_RATCHET run writes: `init` writes version 2 over a missing or version 1 file, `1` lowers a version 2 file. */
function rewritten(mode: string, raw: string | null, current: Record<string, Counts>): string {
  const had = parse(raw)
  if (mode === 'init') {
    if (had && had.v !== 1) throw new Error('UPDATE_MONEY_RATCHET=init writes version 2 only over a missing or version 1 file; use UPDATE_MONEY_RATCHET=1 to lower it')
    return format({ v: 2, files: current })
  }
  if (mode === '1') {
    if (!had || had.v !== 2) throw new Error('UPDATE_MONEY_RATCHET=1 lowers a version 2 baseline; run UPDATE_MONEY_RATCHET=init first')
    return format(shrink(had as Baseline, current))
  }
  throw new Error(`UPDATE_MONEY_RATCHET is 1 or init, not ${mode}`)
}

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
}

// The R1 counting function, kept as it was: the v2 scan must see everything it saw.
type LegacyKey = 'earnIncome' | 'addMoney' | 'spend' | '.cash +=' | '.money +='
function legacyCount(src: SourceFile): Partial<Record<LegacyKey, number>> {
  const out: Partial<Record<LegacyKey, number>> = {}
  const bump = (k: LegacyKey): void => {
    out[k] = (out[k] ?? 0) + 1
  }
  const { toks } = src
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k === K_ID && CALLS.has(t.v) && isPunct(toks[i + 1], '(') && !isId(toks[i - 1], 'function')) bump(t.v as LegacyKey)
    else if (t.k === K_PUNCT && t.v === '+=' && isPunct(toks[i - 2], '.') && toks[i - 1]!.k === K_ID) {
      if (toks[i - 1]!.v === 'cash') bump('.cash +=')
      else if (toks[i - 1]!.v === 'money') bump('.money +=')
    }
  }
  return out
}

let realSources: SourceFile[] | null = null
const real = (): SourceFile[] => (realSources ??= loadSources())
const countsOf = (code: string, path = 'src/game/fake.ts'): Counts => countFile(toSource(path, code))
const sitesOf = (code: string, path = 'src/game/fake.ts'): Site[] => scan(toSource(path, code))
const unknownOf = (code: string, path = 'src/game/fake.ts'): string[] => unknownReasons([toSource(path, code)])

describe('money ratchet: the real source', () => {
  it('moves no more money with no reason than the baseline, and none in a new file', () => {
    const current = countAll(real())
    const mode = process.env.UPDATE_MONEY_RATCHET
    if (mode) writeFileSync(BASELINE_PATH, rewritten(mode, existsSync(BASELINE_PATH) ? readFileSync(BASELINE_PATH, 'utf8') : null, current))
    const base = readBaseline()
    expect(base.v, 'test/money-ratchet.json is not version 2: run UPDATE_MONEY_RATCHET=init once').toBe(2)
    const sites = Object.values(current).reduce((sum, c) => sum + KEYS.reduce((s, k) => s + (c[k] ?? 0), 0), 0)
    console.info(`money ratchet: ${sites} counted sites in ${Object.keys(current).length} files`)
    expect(violations(current, base).map((v) => v.text)).toEqual([])
    for (const n of notes(current, base)) console.info(`money ratchet: ${n} (UPDATE_MONEY_RATCHET=1 lowers the baseline)`)
  })

  it('names only reasons the table knows', () => {
    expect(unknownReasons(real())).toEqual([])
  })

  it('leaves no counted site under a migrated prefix', () => {
    expect(migratedLeft(real(), MIGRATED)).toEqual([])
  })

  it('lists only migrated prefixes that exist', () => {
    for (const p of MIGRATED) expect(real().some((s) => s.path.startsWith(p)), `${p} matches no file of src/`).toBe(true)
  })

  it('looks at a good many places, reasoned or not, so an empty scan cannot pass', () => {
    // It counts every site the scan sees, not the counted ones, so a migration that gives every site a reason cannot trip it.
    const seen = real().map((s) => scan(s).length)
    expect(seen.reduce((a, b) => a + b, 0)).toBeGreaterThan(400)
    expect(seen.filter((n) => n > 0).length).toBeGreaterThan(100)
  })

  it('sees everything the R1 scan saw (every call, and at least every `+=`)', () => {
    const bad: string[] = []
    let calls = 0
    for (const s of real()) {
      const old = legacyCount(s)
      const now = callTotals(s)
      const adds = (k: '.cash +=' | '.money +='): number => scan(s).filter((x) => x.key === k).length
      for (const k of ['earnIncome', 'addMoney', 'spend'] as const) {
        calls += now[k] ?? 0
        if ((now[k] ?? 0) !== (old[k] ?? 0)) bad.push(`${s.path}: ${k} is ${now[k] ?? 0}, the R1 scan saw ${old[k] ?? 0}`)
      }
      for (const k of ['.cash +=', '.money +='] as const) if (adds(k) < (old[k] ?? 0)) bad.push(`${s.path}: ${k} is ${adds(k)}, the R1 scan saw ${old[k] ?? 0}`)
    }
    expect(bad).toEqual([])
    expect(calls).toBeGreaterThan(400)
  })

  it('keeps the markers to the cap, and none on a character, a Person or a company', () => {
    expect(markerCount(real())).toBeLessThanOrEqual(MARKER_CAP)
    expect(purseMarkers(real())).toEqual([])
  })
})

describe('money ratchet: what counts', () => {
  it('counts a call to each of the three with no reason, with or without a receiver', () => {
    expect(countsOf('earnIncome(g, 5)')).toEqual({ earnIncome: 1 })
    expect(countsOf('addMoney(g, 5); ctx.addMoney(g, 6)')).toEqual({ addMoney: 2 })
    expect(countsOf('spend(g, 5); spend(g, 1)')).toEqual({ spend: 2 })
    expect(countsOf('spend(g, 5, undefined)')).toEqual({ spend: 1 })
    expect(countsOf('earnIncome(g, 5, null)')).toEqual({ earnIncome: 1 })
    expect(countsOf("addMoney(g, 5, 'unreasoned')")).toEqual({ addMoney: 1 })
  })

  it('does not count a call that has a reason', () => {
    expect(countsOf("addMoney(g, 5, 'purchase')")).toEqual({})
    expect(countsOf('addMoney(g, 5, why)')).toEqual({})
    expect(countsOf("earnIncome(g, 5, { reason: 'wage', token: t })")).toEqual({})
    expect(countsOf("spend(g, f(a, b), { reason: 'rent', with: pool, country })")).toEqual({})
    expect(countsOf("addMoney(g, 1, { with: ref('gov', cid), reason: 'bond.redeem' })")).toEqual({})
    expect(countsOf('addMoney(g, 1, { reason })')).toEqual({})
    expect(countsOf('addMoney(g, 1, { reason: why(x), token })')).toEqual({})
    expect(countsOf("addMoney(g, 1, big ? 'prize' : 'luck')")).toEqual({})
    expect(countsOf("ctx.spend(g, 1, 'fine'); spend(g, 2, 'tuition')")).toEqual({})
  })

  it('counts an object with no reason of its own, and a `reason` that is only nested or undefined', () => {
    expect(countsOf('addMoney(g, 5, { with: x })')).toEqual({ addMoney: 1 })
    expect(countsOf('addMoney(g, 5, { ...base })')).toEqual({ addMoney: 1 })
    expect(countsOf("addMoney(g, 5, { with: f({ reason: 'wage' }) })")).toEqual({ addMoney: 1 })
    expect(countsOf("addMoney(g, 5, { token: 'reason' })")).toEqual({ addMoney: 1 })
    expect(countsOf("addMoney(g, 5, { reason: 'unreasoned' })")).toEqual({ addMoney: 1 })
    expect(countsOf('addMoney(g, 5, { reason: undefined })')).toEqual({ addMoney: 1 })
  })

  it('counts only the third argument, wherever a reason-looking string sits', () => {
    expect(countsOf("addMoney(g, 5, undefined, 'wage')")).toEqual({ addMoney: 1 })
    expect(countsOf("addMoney(g, f('wage', 'rent', 'fine'))")).toEqual({ addMoney: 1 })
    expect(countsOf("spend(g, [1, 2, 3], 'fine')")).toEqual({})
  })

  it('fails a string reason the table does not know, and names it', () => {
    expect(unknownOf("addMoney(g, 5, 'wages')")).toEqual(["src/game/fake.ts:1: addMoney names the unknown reason 'wages'"])
    expect(unknownOf("x\nspend(g, 5, { reason: 'bogus', token: t })")).toEqual(["src/game/fake.ts:2: spend names the unknown reason 'bogus'"])
    expect(unknownOf("addMoney(g, 5, 'constructor')")).toHaveLength(1)
    expect(countsOf("addMoney(g, 5, 'wages')")).toEqual({ addMoney: 1 })
  })

  it('knows every reason of the table, and the one it treats as none', () => {
    for (const r of Object.keys(REASONS)) expect(unknownOf(`addMoney(g, 5, '${r}')`), r).toEqual([])
    expect(unknownOf("addMoney(g, 5, 'unreasoned')")).toEqual([])
    expect(unknownOf("addMoney(g, 5, { reason: 'unreasoned' })")).toEqual([])
  })

  it('counts a raw write on any receiver, whichever of the five operators', () => {
    expect(countsOf('a.cash += 1')).toEqual({ '.cash +=': 1 })
    expect(countsOf('p.money += 2')).toEqual({ '.money +=': 1 })
    expect(countsOf('g.character.money -= 3')).toEqual({ '.money -=': 1 })
    expect(countsOf('c.money -= 1')).toEqual({ '.money -=': 1 })
    expect(countsOf('b.cash = 0')).toEqual({ '.cash =': 1 })
    expect(countsOf('c.money /= 2')).toEqual({ '.money /=': 1 })
    expect(countsOf('x.y.cash *= 3')).toEqual({ '.cash *=': 1 })
    expect(countsOf('b.cash+=1; biz.cash += 2')).toEqual({ '.cash +=': 2 })
    expect(countsOf('x.y.z.cash += 4; this.money = 5')).toEqual({ '.cash +=': 1, '.money =': 1 })
    expect(countsOf('g.character.money = Math.round(g.character.money - x)')).toEqual({ '.money =': 1 })
    expect(countsOf('(x as Biz).cash = 0; list[0].money -= 1')).toEqual({ '.cash =': 1, '.money -=': 1 })
  })

  it('does not count a read, a comparison, a bare name, a longer name, an object key or a declaration', () => {
    expect(countsOf('const x = a.cash + a.money; if (a.cash === 0 || a.money == 1 || a.cash >= 2 || a.money <= 3) f(a.cash)')).toEqual({})
    expect(countsOf('let cash = 0; cash += 5; money = 5; money -= 6')).toEqual({})
    expect(countsOf('a.cashier += 1; a.moneyBack = 1; a.moneys -= 1; a.cashOut *= 2')).toEqual({})
    expect(countsOf('const o = { money: 5, cash: 6 }; const { money } = o; const { cash = 0 } = o')).toEqual({})
    expect(countsOf('a.money %= 2; a.cash ||= 1; a.money ??= 3')).toEqual({})
    expect(countsOf('function spend(g: GameState, n: number) { return n }')).toEqual({})
    expect(countsOf('export async function earnIncome(g: GameState) {}')).toEqual({})
    expect(countsOf('overspend(g, 1)')).toEqual({})
    expect(countsOf('x.spent(1)')).toEqual({})
    expect(countsOf('myAddMoney(g, 1); spendable(g)')).toEqual({})
    expect(countsOf('const spend = 3; import { addMoney } from "./core"; export { earnIncome }')).toEqual({})
    expect(countsOf('const f = spend')).toEqual({})
  })

  it('does not count a mention in a comment, a string or a template', () => {
    expect(countsOf('// earnIncome(g, 5); a.cash += 1')).toEqual({})
    expect(countsOf('/* addMoney(g, 5) and spend(g, 1) and p.money -= 2 */')).toEqual({})
    expect(countsOf("const s = 'earnIncome(g, 5)'; const t = \"a.cash = 1\"")).toEqual({})
    expect(countsOf('const u = `spend(g, 1) then p.money += 2`')).toEqual({})
    expect(countsOf('const v = `${addMoney(g, 1)}`')).toEqual({ addMoney: 1 })
    expect(countsOf("const w = `${addMoney(g, 1, 'fine')}`")).toEqual({})
  })

  it('does not count a raw write whose own line carries the marker, and still counts the next one', () => {
    expect(countsOf('slice.cash = 0 // ledger-ok: local slice')).toEqual({})
    expect(countsOf('slice.cash = 0 /* ledger-ok: display struct */')).toEqual({})
    expect(countsOf('// ledger-ok: local slice\nslice.cash = 0')).toEqual({ '.cash =': 1 })
    expect(countsOf('slice.cash = 0 // ledger-ok: local slice\nb.cash = 1')).toEqual({ '.cash =': 1 })
    expect(countsOf('slice.cash += 1; b.cash += 2 // ledger-ok: both on this line')).toEqual({})
    expect(sitesOf('slice.cash = 0 // ledger-ok: local slice').map((s) => [s.key, s.marked])).toEqual([['.cash =', true]])
  })

  it('counts calls inside TSX, reports the line, and sorts files and keys when it totals a tree', () => {
    const tree = countAll([
      toSource('src/z.ts', 'spend(g, 1); earnIncome(g, 2); a.money += 3; a.cash = 0'),
      toSource('src/a.tsx', 'export const X = () => <b onClick={() => addMoney(g, 1)} />'),
      toSource('src/none.ts', 'export const y = 1'),
      toSource('src/reasoned.ts', "earnIncome(g, 2, 'wage')"),
    ])
    expect(Object.keys(tree)).toEqual(['src/a.tsx', 'src/z.ts'])
    expect(tree['src/z.ts']).toEqual({ earnIncome: 1, spend: 1, '.cash =': 1, '.money +=': 1 })
    expect(Object.keys(tree['src/z.ts']!)).toEqual(['earnIncome', 'spend', '.cash =', '.money +='])
    expect(tree['src/a.tsx']).toEqual({ addMoney: 1 })
    expect(sitesOf('a\n\nspend(g, 1)\nx.money -= 2').map((s) => s.line)).toEqual([3, 4])
  })
})

describe('money ratchet: failing on a violation', () => {
  const base: Baseline = { v: 2, files: { 'src/game/old.ts': { earnIncome: 2, spend: 1 } } }
  const check = (code: string, path: string): string[] => violations(countAll([toSource(path, code)]), base).map((v) => v.text)

  it('fails a new file that moves money with no reason (D.11 criterion 10)', () => {
    const out = check('addMoney(g, 5)', 'src/game/new.ts')
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('src/game/new.ts')
    expect(out[0]).toContain('no entry')
    expect(check('earnIncome(g, 5, undefined)', 'src/game/new.ts')).toHaveLength(1)
    expect(check("spend(g, 5, 'unreasoned')", 'src/game/new.ts')).toHaveLength(1)
    expect(check('p.money += 2', 'src/game/new.ts')).toHaveLength(1)
  })

  it('fails a raw write the R1 ratchet could not see', () => {
    expect(check('g.character.money -= cost', 'src/game/new.ts')).toHaveLength(1)
    expect(check('b.cash = 0', 'src/game/new.ts')).toHaveLength(1)
    expect(check('c.money /= 2', 'src/game/new.ts')).toHaveLength(1)
  })

  it('passes a new file that calls the three with a reason', () => {
    expect(check("addMoney(g, 5, 'purchase'); spend(g, 1, { reason: 'fine' }); earnIncome(g, 2, why)", 'src/game/new.ts')).toEqual([])
    expect(check('slice.cash = 0 // ledger-ok: local slice', 'src/game/new.ts')).toEqual([])
  })

  it('fails a baseline file one above its count, passes it at its count and below', () => {
    expect(check('earnIncome(g, 1); earnIncome(g, 2); earnIncome(g, 3); spend(g, 1)', 'src/game/old.ts')).toEqual(['src/game/old.ts: earnIncome is 3, the baseline is 2'])
    expect(check('earnIncome(g, 1); earnIncome(g, 2); spend(g, 1)', 'src/game/old.ts')).toEqual([])
    expect(check('earnIncome(g, 1)', 'src/game/old.ts')).toEqual([])
    expect(check('export const nothing = 1', 'src/game/old.ts')).toEqual([])
  })

  it('does not let a reasoned call pay for an unreasoned one, nor the other way round', () => {
    expect(check("earnIncome(g, 1); earnIncome(g, 2, 'wage'); earnIncome(g, 3, 'wage'); earnIncome(g, 4)", 'src/game/old.ts')).toEqual([])
    expect(check('earnIncome(g, 1); earnIncome(g, 2); earnIncome(g, 3)', 'src/game/old.ts')).toHaveLength(1)
  })

  it('fails a kind the file did not book before, even when the file is in the baseline', () => {
    expect(check('addMoney(g, 1)', 'src/game/old.ts')).toEqual(['src/game/old.ts: addMoney is 1, the baseline is 0'])
    expect(check('a.cash -= 1', 'src/game/old.ts')).toEqual(['src/game/old.ts: .cash -= is 1, the baseline is 0'])
  })

  it('notes a file that books less than its entry, and stays quiet otherwise', () => {
    expect(notes(countAll([toSource('src/game/old.ts', 'earnIncome(g, 1)')]), base)).toEqual(['src/game/old.ts: earnIncome 2 -> 1, spend 1 -> 0'])
    expect(notes(countAll([toSource('src/game/old.ts', "earnIncome(g, 1); earnIncome(g, 2); spend(g, 1); spend(g, 2, 'fine')")]), base)).toEqual([])
    expect(notes({}, base)).toEqual(['src/game/old.ts: earnIncome 2 -> 0, spend 1 -> 0'])
  })
})

describe('money ratchet: the migrated prefixes', () => {
  const code = "x\naddMoney(g, 5)\nok(g, 1, 'purchase')\nc.money -= 2\nslice.cash = 0 // ledger-ok: local slice\nspend(g, 1, 'fine')"

  it('lists file:line for every counted site under a prefix', () => {
    const out = migratedLeft([toSource('src/game/home/a.ts', code)], ['src/game/home/'])
    expect(out).toEqual(['src/game/home/a.ts:2: addMoney has no reason', 'src/game/home/a.ts:4: .money -= is a raw write'])
  })

  it('passes a file with a reason on every call and no raw write, a marked line included', () => {
    const clean = "addMoney(g, 5, 'purchase'); spend(g, 1, { reason: 'fine' })\nslice.cash = 0 // ledger-ok: local slice"
    expect(migratedLeft([toSource('src/game/home/b.ts', clean)], ['src/game/home/'])).toEqual([])
  })

  it('looks only under the prefixes, and takes a prefix as plain text', () => {
    const files = [toSource('src/game/home/a.ts', code), toSource('src/game/love.ts', code), toSource('src/game/lovely.ts', code), toSource('src/game/other.ts', code)]
    expect(migratedLeft(files, [])).toEqual([])
    expect(migratedLeft(files, ['src/game/love.ts']).map((l) => l.split(':')[0])).toEqual(['src/game/love.ts', 'src/game/love.ts'])
    expect(new Set(migratedLeft(files, ['src/game/home/', 'src/game/lov']).map((l) => l.split(':')[0]))).toEqual(new Set(['src/game/home/a.ts', 'src/game/love.ts', 'src/game/lovely.ts']))
  })
})

describe('money ratchet: the markers', () => {
  it('counts every marker, and the cap is twelve', () => {
    expect(MARKER_CAP).toBe(12)
    const one = 'a.cash = 0 // ledger-ok: local slice\n'
    expect(markerCount([toSource('src/a.ts', one.repeat(12))])).toBe(12)
    expect(markerCount([toSource('src/a.ts', one.repeat(7)), toSource('src/b.ts', one.repeat(6))])).toBe(13)
    expect(markerCount([toSource('src/a.ts', 'export const x = 1')])).toBe(0)
  })

  it('refuses a marker on a character, a Person or a company', () => {
    expect(purseMarkers([toSource('src/a.ts', 'g.character.money -= 1 // ledger-ok: no')])).toHaveLength(1)
    expect(purseMarkers([toSource('src/a.ts', 'p.money += 1 // ledger-ok: no')])).toHaveLength(1)
    expect(purseMarkers([toSource('src/a.ts', 'b.cash = 0 // ledger-ok: no')])).toHaveLength(1)
    expect(purseMarkers([toSource('src/a.ts', 'person.money = 0 // ledger-ok: no')])).toHaveLength(1)
    expect(purseMarkers([toSource('src/a.ts', 'slice.cash = 0 // ledger-ok: the will keeps a local slice')])).toEqual([])
    expect(purseMarkers([toSource('src/a.ts', 'p.money += 1')])).toEqual([])
  })
})

describe('money ratchet: updating the baseline', () => {
  const base: Baseline = { v: 2, files: { 'src/a.ts': { earnIncome: 3, spend: 1 }, 'src/b.ts': { addMoney: 2 }, 'src/gone.ts': { spend: 1 } } }

  it('lowers counts, drops a file that no longer moves money with no reason, and keeps the rest', () => {
    const now = countAll([toSource('src/a.ts', "earnIncome(g, 1); spend(g, 1); earnIncome(g, 2, 'wage')"), toSource('src/b.ts', 'addMoney(g, 1); addMoney(g, 2)')])
    expect(shrink(base, now)).toEqual({ v: 2, files: { 'src/a.ts': { earnIncome: 1, spend: 1 }, 'src/b.ts': { addMoney: 2 } } })
  })

  it('refuses to raise a count or add a file', () => {
    expect(() => shrink(base, countAll([toSource('src/b.ts', 'addMoney(g, 1); addMoney(g, 2); addMoney(g, 3)')]))).toThrow(/only goes down/)
    expect(() => shrink(base, countAll([toSource('src/new.ts', 'spend(g, 1)')]))).toThrow(/src\/new\.ts/)
    expect(() => shrink(base, countAll([toSource('src/b.ts', 'b.cash = 1')]))).toThrow(/\.cash =/)
  })

  it('writes one line per file and reads back what it wrote', () => {
    const text = format(base)
    expect(text.split('\n')).toHaveLength(Object.keys(base.files).length + 6)
    expect(JSON.parse(text)).toEqual(base)
    expect(format(JSON.parse(text) as Baseline)).toBe(text)
    expect(text).toContain('"src/a.ts": { "earnIncome": 3, "spend": 1 }')
    expect(format({ v: 2, files: { 'src/m.ts': { spend: 2, '.money =': 1, '.cash -=': 4 } } })).toContain('"src/m.ts": { "spend": 2, ".cash -=": 4, ".money =": 1 }')
  })

  it('init writes version 2 from the tree over a missing or version 1 file, and never over version 2', () => {
    const now = countAll([toSource('src/a.ts', 'earnIncome(g, 1); a.money -= 1')])
    const v2 = format({ v: 2, files: now })
    expect(rewritten('init', null, now)).toBe(v2)
    expect(rewritten('init', JSON.stringify({ v: 1, files: { 'src/a.ts': { earnIncome: 5 } } }), now)).toBe(v2)
    expect(() => rewritten('init', format(base), now)).toThrow(/only over a missing or version 1/)
  })

  it('the lowering mode needs a version 2 file, and a mode that is neither is refused', () => {
    const now = countAll([toSource('src/a.ts', 'earnIncome(g, 1)')])
    expect(rewritten('1', format(base), now)).toBe(format({ v: 2, files: { 'src/a.ts': { earnIncome: 1 } } }))
    expect(() => rewritten('1', null, now)).toThrow(/init/)
    expect(() => rewritten('1', JSON.stringify({ v: 1, files: {} }), now)).toThrow(/init/)
    expect(() => rewritten('1', 'not json', now)).toThrow(/init/)
    expect(() => rewritten('yes', null, now)).toThrow(/1 or init/)
  })
})

describe('money ratchet: the baseline file', () => {
  it('is version 2, sorted, has positive whole numbers, known keys in order, and points at files that exist', () => {
    const base = readBaseline()
    const sources = new Map(real().map((s) => [s.path, s]))
    expect(base.v).toBe(2)
    const files = Object.keys(base.files)
    expect(files.length).toBeGreaterThan(0)
    expect(files).toEqual([...files].sort())
    // The primitives and the booking helpers are in the baseline for good (they write the purses themselves).
    expect(files).toContain('src/game/core.ts')
    expect(files).toContain('src/game/cash.ts')
    for (const file of files) {
      expect(sources.has(file), `${file} is gone: move its entry by hand`).toBe(true)
      const keys = Object.keys(base.files[file]!)
      expect(keys.length).toBeGreaterThan(0)
      expect(keys, file).toEqual(KEYS.filter((k) => keys.includes(k)))
      for (const k of keys) {
        const n = base.files[file]![k as Key]!
        expect(Number.isInteger(n) && n > 0, `${file} ${k} = ${n}`).toBe(true)
      }
    }
  })

  it('is written the way the update writes it, so a diff shows only the files that changed', () => {
    expect(readFileSync(BASELINE_PATH, 'utf8')).toBe(format(readBaseline()))
  })

  it('is anchored to the guard lines of the roadmap (spot checks of the merged R0 tree, in calls, reasoned or not)', () => {
    const sources = new Map(real().map((s) => [s.path, s]))
    const at = (file: string, ...keys: ('earnIncome' | 'addMoney' | 'spend')[]): number => {
      const totals = callTotals(sources.get(file) ?? toSource(file, ''))
      return keys.reduce((sum, k) => sum + (totals[k] ?? 0), 0)
    }
    // R0-1: bought followers no longer pay, social.ts books three earnIncome calls.
    expect(at('src/game/special/social.ts', 'earnIncome')).toBe(3)
    // R0-7: one endorsement payout and one Olympic bonus, each booked once.
    expect(at('src/game/special/sports-core.ts', 'earnIncome')).toBe(1)
    expect(at('src/game/special/sports-olympics.ts', 'earnIncome')).toBe(1)
    // R0-12: military pay is one earn and one add, the Street Hustler takes are the other six.
    expect(at('src/game/special/military.ts', 'earnIncome', 'addMoney')).toBe(2)
    expect(at('src/game/special/hustler.ts', 'addMoney', 'spend')).toBe(6)
  })

  it('shows the scan a reasoned call in the real tree: the career kit books two, each with its reason', () => {
    const kit = real().find((s) => s.path === 'src/game/special/kit/year.ts')!
    expect(callTotals(kit)).toEqual({ earnIncome: 1, spend: 1 })
    expect(countFile(kit)).toEqual({})
  })
})
