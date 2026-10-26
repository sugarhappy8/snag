// R3-G4 (H.4): hiring reads estimates. An interview used to print a candidate's skill and trait exactly. In Realistic mode the shortlist
// shows what an interview can tell you, a range for the skill and "not clear yet" for the trait, and a background check (a choice in
// the popup) pays a small fee to read the skill much closer and to name the trait. Exact mode prints today's text, byte for byte.
//
//   skill   a read of the candidate's true skill on the key `cand:<shortlist>:<n>:skill` (know, rule row cand.skill: honest at
//           80%, stable for a year, sharper with the Business talent). The text is the band rounded outward to 5 (1 once a check
//           has sharpened it), so what is printed holds the truth at least as often as the band does
//   check   Knowledge's due diligence read (takeReading, a hashed draw, never g.rng), once per candidate; the fee is a share of the
//           role's local pay (vetFee), never the cash on hand, booked by the caller through the company's books
//   tidy    the readings live in flags.know only while the popup is open: the caller forgets them when the shortlist is settled
//
// A shortlist is named by shortlistId (asset, year, round of interviews this year, role), so two rounds for one role in one year
// never share a reading. The popup data carries that name (`ck`) and `vet` only in Realistic; Exact leaves the data as it was.
// The candidates in the data stay the true ones: you hired them. What the player reads of the one hired goes with the hire (R4-U6:
// hiredRead here, leader-fog.ts carryRead), and the sheet names the trait after a year or a check.
//
// R4-U7 uses the same check for the CEO shortlist (manage.ts): the list can hold more than the four a hire shortlist has (relatives
// first, then four or five from the search), so takeVet and dropVet take an optional `max` (CEO_VET_MAX covers the first eight; the
// hire path keeps CAND_MAX), and ceoFooter says what the check does for a CEO (a CEO's style is on the list already).
//
// No KeyKind owner is registered for `cand`: a popup cannot hold a Look closer group, so the check above is the one way to read a
// candidate. An owner would also make the rows trackable by the standing orders and buyable from every source, for a number that is
// gone when the shortlist is. The family has a rule row (cand.skill) and takeReading takes the truth as an argument, so neither
// needs one.
import { localPay } from '../data/local-pay'
import { forget, isExact, know, takeReading } from '../knowledge/contract'
import { fnv1a } from '../text/hash'
import type { ChoiceOption, GameState, Json, MenuInfo } from '../types'
import { traitOf } from './flavor'
import type { RoleDef } from './industries'
import { skillText, staffFog, type HiredRead } from './leader-fog'
import type { BizState } from './state'
import { money } from './util'

/** A background check has been paid for on this shortlist (1) or not (0). */
export type Vet = 0 | 1

/** What a screen prints for a fogged number, and how sure the read is (undefined in Exact mode). The same shape the market lane uses. */
export interface Fogged {
  text: string
  conf?: 0 | 1 | 2 | 3
}

/** The skill as a screen prints it (`text`), and the trait: the label in lower case, or 'not clear yet' until a check names it. */
export interface CandidateRead {
  skill: Fogged
  trait: string
}

/** A background check costs this share of the role's local pay. */
export const VET_RATE = 0.03
/** candidatesFor draws two to four candidates. */
export const CAND_MAX = 4
/** A CEO shortlist can hold more (relatives first, then four or five from the search): a background check covers the first eight. */
export const CEO_VET_MAX = 8

const CONF_WORDS = ['a rough guess', 'a fair estimate', 'a good estimate', 'close to exact'] as const
const SHORTLIST_ID = /^[0-9a-z]{1,10}$/
const LOOK_EMOJI = '\u{1F50E}'

/** The fee of one background check: a share of the role's local pay, so it follows the role and the country, never the cash on hand. */
export function vetFee(b: Pick<BizState, 'countryId'>, role: RoleDef): number {
  return Math.max(1, Math.round(localPay(b.countryId, role.pay) * VET_RATE))
}

/** The name of one shortlist: its asset, the year, which round of interviews this year it was, and the role (the canonical title). */
export function shortlistId(assetId: string, year: number, round: number, role: string): string {
  return fnv1a(`${assetId}|${year}|${round}|${role}`).toString(36)
}

/** The key of candidate `i` of a shortlist (at most 64 characters: kind, two ids and a field). */
export const candKey = (id: string, i: number): string => `cand:${id}:${i}:skill`

/** A shortlist name read from popup data: a short run of lower case letters and digits, or null. */
export function validId(v: Json | undefined): string | null {
  return typeof v === 'string' && SHORTLIST_ID.test(v) ? v : null
}

/**
 * What the player may read of candidate `i` of shortlist `id`: Exact mode, today's text; otherwise a range for the skill with its
 * confidence, and the trait only once a check has been paid for (`vet`). Pure: the same candidate in the same year reads the same.
 */
export function candidateRead(g: GameState, id: string, i: number, c: { skill: number; trait: string }, vet: Vet): CandidateRead {
  const label = traitOf(c.trait).label.toLowerCase()
  if (isExact()) return { skill: { text: `${c.skill}/100` }, trait: label }
  const e = know(g, candKey(id, i), c.skill)
  return { skill: { text: skillText(e, c.skill), conf: e.conf }, trait: vet === 1 ? label : 'not clear yet' }
}

/**
 * The read of candidate `i` of shortlist `id` as the popup showed it, for the one you hire (R4-U6): the middle and sd of the estimate,
 * and whether a background check made it. It is taken before the settled shortlist forgets its checks, and carried to the sheet of the
 * new hire (leader-fog.ts carryRead). Null unless staffFog() (Exact and a flag-off life carry nothing).
 */
export function hiredRead(g: GameState, id: string, i: number, skill: number): HiredRead | null {
  if (!staffFog()) return null
  const e = know(g, candKey(id, i), skill)
  return e.exact ? null : { mid: e.mid, sd: e.sd, checked: e.src.split('+').includes('diligence') }
}

/** One line of the shortlist text. Exact: today's "• Dana Lee, 34: skill 73/100, asks $60K, steady." */
export function candidateLine(c: { firstName: string; lastName: string; age: number }, r: CandidateRead, asks: string): string {
  const trait = isExact() ? r.trait : `trait ${r.trait}`
  return `• ${c.firstName} ${c.lastName}, ${c.age}: skill ${r.skill.text}, asks ${asks}, ${trait}.`
}

/** The choice label of a candidate. Exact: today's "Dana Lee · 73/100 · $60K". */
export function candidateLabel(c: { firstName: string; lastName: string }, r: CandidateRead, asks: string): string {
  return `${c.firstName} ${c.lastName} · ${r.skill.text} · ${asks}`
}

/** The background check as a choice of the popup, before "Hire nobody". */
export function vetChoice(fee: number): ChoiceOption {
  return { id: 'vet', label: `Check backgrounds · ${money(fee)}`, emoji: LOOK_EMOJI }
}

/**
 * The words under the shortlist: how sure the skill reads are (the same four words the confidence chip uses, standing in for the chip a
 * popup cannot draw) and what a check does. Empty in Exact mode. `fee` is null when the company cannot pay for a check now.
 */
export function hireFooter(reads: readonly CandidateRead[], vet: Vet, fee: number | null): string {
  if (isExact() || reads.length === 0) return ''
  if (vet === 1) return '\nBackground checks are in: the traits are named and the skill reads are tighter.'
  const word = CONF_WORDS[Math.min(3, ...reads.map((r) => r.skill.conf ?? 3))]
  if (fee === null) return `\nSkill reads are ${word}. Traits stay unclear until you check backgrounds.`
  return `\nSkill reads are ${word}. A background check (${money(fee)}) sharpens them and names each trait.`
}

/**
 * The words under a CEO shortlist (R4-U7): how sure the skill reads are, and what a check does. A CEO's style is on the list already, so
 * the check only sharpens the skill. `confs` are the chips of the reads; `fee` is null when nobody can pay for a check now. Empty without reads.
 */
export function ceoFooter(confs: readonly (0 | 1 | 2 | 3 | undefined)[], vet: Vet, fee: number | null, covered: number): string {
  if (confs.length === 0) return ''
  const first = confs.length > covered ? ` It covers the first ${covered}.` : ''
  if (vet === 1) return `Background checks are in. The skill reads are tighter.${first}`
  const word = CONF_WORDS[Math.min(3, ...confs.map((c) => c ?? 3))]
  if (fee === null) return `Skill reads are ${word}.`
  return `Skill reads are ${word}. A background check (${money(fee)}) sharpens them.${first}`
}

/**
 * The background check of a shortlist: one due diligence reading per candidate, kept in the record until the shortlist is settled.
 * True when any reading was new (the caller then charges the fee); false when every candidate had been checked this year already, so
 * a repeat of the choice reads and costs nothing. Writes only through Knowledge's record; nothing here draws from g.rng.
 */
export function takeVet(g: GameState, id: string, list: readonly { skill: number }[], max = CAND_MAX): boolean {
  let fresh = false
  list.slice(0, Math.max(0, max)).forEach((c, i) => {
    if (takeReading(g, 'diligence', candKey(id, i), c.skill) !== null) fresh = true
  })
  return fresh
}

/** Forget the readings of a settled shortlist, so a hire never leaves rows in the Briefing. `max` is how many candidates a check covers. */
export function dropVet(g: GameState, id: string, n: number, max = CAND_MAX): void {
  for (let i = 0; i < Math.min(max, Math.max(0, n)); i++) forget(g, candKey(id, i))
}

/** The Look closer row of the Hire Key Staff menu (Realistic only): the check is a choice in the interview popup. */
export function hireLookRow(assetId: string): MenuInfo | null {
  if (isExact()) return null
  return {
    type: 'info',
    id: `biz.hire.look.${assetId}`,
    emoji: LOOK_EMOJI,
    text: `Look closer: after an interview, background checks (${Math.round(VET_RATE * 100)}% of the role's pay) name each trait and narrow the skill read.`,
  }
}
