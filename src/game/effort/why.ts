// The words of research (R3, C.11): the odds line ("Odds 62%: team +9, funding +7, hard field -12, tired -4"), one short line for
// each term, the cause of a failure, what a result paid, and the info rows a menu shows. Every function here is pure text from a
// quote, an outcome or a step result. Nothing draws a number, reads a clock, books a dollar or changes the game.
//
// What the player may see is the reveal policy (hooks.ts). With nothing bound it is EXACT_POLICY: every number shows, which is also
// what the test suite runs under. Fog binds a realistic one: the odds read "about 60%", and a term the player doesn't know shows
// as "unknown factors" with no number, in the odds line and in the reasons alike, so a hidden term never leaks through either.
// A value that isn't a policy is read as the exact one, the same fallback as `revealPolicyOf`.
//
// Copy follows docs/VOICE.md: contractions, no dash, a log line at most 90 characters, the odds line at most 110. Labels come from
// the quote (`Reason.label`), cleaned of any dash a caller put in; a table here only names a term in a sentence.
import type { GameState, MenuInfo } from '../types'
import { EXACT_POLICY, revealPolicyOf } from './hooks'
import type { RevealPolicy } from './hooks'
import { KNOW_MAX, TERM_LABEL } from './limits'
import { clampNum, hasOwn, isRecord } from './num'
import type { CauseKind, Outcome, OutcomeKind, Quote, StepResult, Task } from './types'

/** The odds line is never longer than this. */
const LINE_MAX = 110
/** The most terms the odds line names before it folds the rest into "other". */
const TERMS_SHOWN = 4
/** A sentence is never longer than a life-log line. */
const SENTENCE_MAX = 90
/** The longest label or field name the lines will print. */
const NAME_MAX = 24
/** A point value is shown up to this size (a hostile quote can't make a long line). */
const PTS_MAX = 999

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`, 'g')

/** One non-zero line of the odds, as the player may read it. */
interface Term {
  key: string
  label: string
  pts: number
}

/** `s` with any en-dash or em-dash turned into a plain hyphen and the spaces tidied. */
function clean(s: string): string {
  return s.replace(DASH, '-').replace(/\s+/g, ' ').trim()
}

/** The policy to read with: the one given when it has the shape of one, else the exact one. */
function policyOf(p: unknown): RevealPolicy {
  const ok = isRecord(p) && typeof p.exact === 'boolean' && typeof p.knows === 'function' && typeof p.band === 'function'
  return ok ? (p as unknown as RevealPolicy) : EXACT_POLICY
}

/** Whole points with a sign: +9, -12. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `-${-n}`
}

/** "1 point", "5 points". */
function points(n: number): string {
  return n === 1 ? '1 point' : `${n} points`
}

function capital(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** The lines of a quote that moved the odds, in the quote's order: whole points, never zero, a label that is clean and short. */
function termsOf(q: unknown): Term[] {
  const out: Term[] = []
  const reasons = isRecord(q) && Array.isArray(q.reasons) ? (q.reasons as unknown[]) : []
  for (const r of reasons) {
    if (!isRecord(r) || typeof r.key !== 'string') continue
    const pts = Math.round(clampNum(r.pts, -PTS_MAX, PTS_MAX, 0))
    if (pts === 0) continue
    const own = typeof r.label === 'string' ? clean(r.label).slice(0, NAME_MAX) : ''
    const label = own !== '' ? own : hasOwn(TERM_LABEL, r.key) ? TERM_LABEL[r.key as keyof typeof TERM_LABEL] : r.key.slice(0, NAME_MAX)
    out.push({ key: r.key, label, pts })
  }
  return out
}

/** The terms the player may read, and whether any term is hidden from them. */
function split(terms: readonly Term[], policy: RevealPolicy): { known: Term[]; hidden: boolean } {
  const known: Term[] = []
  let hidden = false
  for (const t of terms) {
    if (policy.knows(t.key as never)) known.push(t)
    else hidden = true
  }
  return { known, hidden }
}

/** The text after "Odds ": the policy's words for the chance, or the exact percent if it gives none. */
function bandOf(q: unknown, policy: RevealPolicy): string {
  const p = clampNum(isRecord(q) ? q.p : 0, 0, 1, 0)
  const s = policy.band(p)
  const text = typeof s === 'string' ? clean(s).slice(0, NAME_MAX + 8) : ''
  return text !== '' ? text : EXACT_POLICY.band(p)
}

/** The line with the `n` largest terms named (in the quote's order, a tie to the earlier) and every other known term folded in. */
function compose(head: string, known: readonly Term[], n: number, hidden: boolean): string {
  const bySize = known.map((_, i) => i).sort((a, b) => Math.abs(known[b]!.pts) - Math.abs(known[a]!.pts) || a - b)
  const shown = new Set(bySize.slice(0, n))
  const parts: string[] = []
  let rest = 0
  known.forEach((t, i) => {
    if (shown.has(i)) parts.push(`${t.label} ${signed(t.pts)}`)
    else rest += t.pts
  })
  if (rest !== 0) parts.push(`other ${signed(rest)}`)
  if (hidden) parts.push('unknown factors')
  return parts.length > 0 ? `${head}: ${parts.join(', ')}` : head
}

/**
 * The odds and why, in one line: "Odds 62%: team +9, funding +7, hard field -12, tired -4". It names the four terms that moved the
 * odds most (in the quote's order) and folds the rest into "other +2", left out when it adds to zero. A term the policy hides
 * becomes "unknown factors", once and with no number. The whole line is at most 110 characters: when it would run longer, fewer
 * terms are named and more fold into "other". With no policy every number shows.
 */
export function oddsLine(q: Quote, policy?: RevealPolicy): string {
  const pol = policyOf(policy)
  const head = `Odds ${bandOf(q, pol)}`
  const { known, hidden } = split(termsOf(q), pol)
  for (let n = TERMS_SHOWN; n >= 0; n--) {
    const line = compose(head, known, n, hidden)
    if (line.length <= LINE_MAX) return line
  }
  return head.slice(0, LINE_MAX)
}

/**
 * The chance a piece of research works, written as the reveal policy writes it (the text that follows "Odds " in the odds line):
 * "62%" in Exact mode, a word ("likely") or "about 60%" in a realistic one. The one rule for every screen that repeats the chance,
 * so a notice, a subtitle or a confirm never hands back the figure the odds line hides: a percent next to "unknown factors" gives the
 * hidden terms away by subtraction.
 */
export function researchOdds(g: GameState, p: number): string {
  return revealPolicyOf(g).band(p)
}

/**
 * The chance of research as a chip in a row or a subtitle: "62% odds" when every number shows (the row as it always read), "odds
 * likely" or "odds about 60%" when it doesn't. `label` is the noun when it is not plain odds ("base odds").
 */
export function oddsChip(g: GameState, p: number, label: string = 'odds'): string {
  const policy = revealPolicyOf(g)
  return policy.exact ? `${policy.band(p)} ${label}` : `${label} ${policy.band(p)}`
}

/**
 * The chance of research inside a purple hint: the exact percent when every number shows; otherwise "about N%", so the hint lens
 * reads it as it reads every figure after "about" (a fallible reading in the talent's own sd) and the hint is fogged once, not twice.
 */
export function hintOdds(g: GameState, p: number): string {
  const policy = revealPolicyOf(g)
  return policy.exact ? policy.band(p) : `about ${EXACT_POLICY.band(p)}`
}

/** How a term is named in a sentence, for a gain and for a loss. */
const SUBJECT: Readonly<Record<string, readonly [gain: string, loss: string]>> = {
  team: ['Your team', 'Your team'],
  funding: ['The budget', 'The budget'],
  crew: ['The crew', 'The crew'],
  tools: ['The tools', 'The tools'],
  know: ['Know-how', 'Know-how'],
  hard: ['The easy field', 'The hard field'],
  rival: ['Weak rivals', 'Rival pressure'],
  spill: ['Public research', 'Public research'],
  bold: ['The bold plan', 'The bold plan'],
  tired: ['Being rested', 'Being tired'],
  ceo: ['The steady CEO', 'The steady CEO'],
}

/**
 * One short line for each term that moved the odds, in the quote's order: "Your team added 9 points." A term the policy hides is
 * not named; one last line, "Unknown factors moved the odds.", stands for all of them.
 */
export function whyLines(q: Quote, policy?: RevealPolicy): string[] {
  const pol = policyOf(policy)
  const { known, hidden } = split(termsOf(q), pol)
  const lines = known.map((t) => {
    const row = hasOwn(SUBJECT, t.key) ? SUBJECT[t.key]! : null
    const subject = row !== null ? row[t.pts > 0 ? 0 : 1] : capital(t.label)
    return `${subject} ${t.pts > 0 ? 'added' : 'cost'} ${points(Math.abs(t.pts))}.`
  })
  if (hidden) lines.push('Unknown factors moved the odds.')
  return lines
}

/** A field key or a display name as words for a sentence: 'rd.beverage' is "beverage", 'dt.aiLab.cap.codeGen' is "code gen". */
function fieldWords(field: unknown): string {
  if (typeof field !== 'string') return ''
  const name = clean(field)
  if (name.includes(' ')) return name.slice(0, NAME_MAX)
  const last = name.split('.').filter((s) => s !== '').pop() ?? ''
  return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().slice(0, NAME_MAX)
}

/** The sentence for each cause; the ones about a field name it when the caller gave one. */
const CAUSE_LINE: Readonly<Record<CauseKind, (field: string) => string>> = {
  deadEnd: (f) => (f !== '' ? `The ${f} work hit a dead end.` : 'The work hit a dead end.'),
  starved: () => 'The budget was too thin for a field this hard.',
  churn: () => 'The crew changed too often to finish it.',
  shortcut: () => 'A shortcut backfired.',
  rival: (f) => (f !== '' ? `A rival got to ${f} first.` : 'A rival got there first.'),
  tired: () => 'You were too worn out to see it through.',
}

/**
 * Why a piece of work failed, in one sentence: "The budget was too thin for a field this hard." `field` is the know-how key or a
 * display name ("rd.beverage" reads as "beverage"). A cause this table doesn't know reads as a dead end.
 */
export function causeLine(cause: CauseKind, field: string): string {
  const f = fieldWords(field)
  const make = typeof cause === 'string' && hasOwn(CAUSE_LINE, cause) ? CAUSE_LINE[cause] : CAUSE_LINE.deadEnd
  return make(f).slice(0, SENTENCE_MAX)
}

const OUTCOME_KINDS: readonly OutcomeKind[] = ['fail', 'partial', 'works', 'hit']

/**
 * What a result paid, one sentence, for every outcome: "You learned the field better: know-how 34." A failure that banked know-how
 * says so, and one that taught nothing new says that too, so a run always shows what it left behind. Study and practice speak as
 * such. `result` is what `step` returned; the know-how shown is its level after the run, a whole number.
 */
export function payoffLine(task: Task, outcome: Outcome, result: StepResult): string {
  const kind = isRecord(outcome) && OUTCOME_KINDS.includes(outcome.kind) ? outcome.kind : null
  const k = Math.round(clampNum(isRecord(result) ? result.knowledge : 0, 0, KNOW_MAX, 0))
  const learned = isRecord(result) && clampNum(result.learned, 0, KNOW_MAX, 0) > 0 && k > 0
  const mode = isRecord(task) ? task.mode : 'project'
  if (kind === 'fail') {
    if (learned) return `The failure still taught you the field: know-how ${k}.`
    return k > 0 ? `The failure taught you little new: know-how ${k}.` : 'The failure taught you nothing yet.'
  }
  if (kind === 'partial') {
    if (learned) return `Half a result still taught you the field: know-how ${k}.`
    return k > 0 ? `Half a result taught you little new: know-how ${k}.` : 'Half a result, and no know-how yet.'
  }
  if (kind === 'works') {
    if (learned && mode === 'study') return `Your study paid off: know-how ${k}.`
    if (learned && mode === 'practice') return `The practice paid off: know-how ${k}.`
    if (learned) return `You learned the field better: know-how ${k}.`
    return k > 0 ? `It worked. Know-how in the field holds at ${k}.` : "It worked, though you're still new to the field."
  }
  if (kind === 'hit') {
    if (learned) return `A hit. You learned the field better: know-how ${k}.`
    return k > 0 ? `A hit. Know-how in the field holds at ${k}.` : "A hit, though you're still new to the field."
  }
  if (learned) return `You learned the field better: know-how ${k}.`
  return k > 0 ? `Know-how in the field holds at ${k}.` : 'You have no know-how in the field yet.'
}

/**
 * The rows a menu shows under a piece of research: the odds line first, then one row for each line of `whyLines`. What the player
 * may see comes from the bound reveal policy (EXACT_POLICY while nothing is bound). Pure: it reads the policy and nothing else of
 * the game. `idPrefix` keeps two projects' rows apart in one list; the ids are `<prefix>.odds`, `<prefix>.0`, `<prefix>.1` and so on.
 */
export function whyNodes(g: GameState, q: Quote, idPrefix: string = 'effort.why'): MenuInfo[] {
  const policy = revealPolicyOf(g)
  const rows: MenuInfo[] = [{ type: 'info', id: `${idPrefix}.odds`, emoji: '🎯', text: oddsLine(q, policy) }]
  whyLines(q, policy).forEach((text, i) => rows.push({ type: 'info', id: `${idPrefix}.${i}`, text }))
  return rows
}
