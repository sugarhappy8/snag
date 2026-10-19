// Music 2.0 events: six crises the kit offers (35% of active years, one popup a year at most) and the claim
// dispute, which is custom because a claim must follow the risk the hint prints and the kit's offer roll would
// dilute it. Each rolled option has one `odds()` for the roll and the hint, or none when the outcome is fixed.
// Money moves only through the kit's `Effects.money`; record changes (popularity, deal trust, the balance, mods,
// awards) ride in `Branch.then`, which moves no money and draws no g.rng. Cast and claims come from `seeded`
// and the family seed, never from g.rng. This file imports the music data, job, state, market, label and tour
// modules, never music.ts.
import { seeded } from '../assets'
import { count, remember } from '../core'
import { US_TYPICAL_INCOME, typicalIncome } from '../events/wealth-core'
import { hasTech } from '../history/timeline'
import { defineScript } from '../scripts'
import { outcomeTag } from '../timeMachine'
import type { ChoiceOption, GameState, Job, Json } from '../types'
import { clamp100, money, ownerMatches } from './common'
import { applyEffects, bestStance, defineCrises, honest, oddsText, optionOdds, rollOption, type Branch, type CrisisDef, type CrisisSet, type Option, type Stance } from './kit/crisis'
import { activeField, beatOdds, familySeed } from './kit/rivals'
import { cap, flt, int, rec, txt, type Raw } from './kit/state'
import { careerAudit, careerCtx, careerSay, choiceRoom, claimChoice, fit, offerChoice, type CareerCtx } from './kit/year'
import { ceremonyAt, claimOdds, type ClaimKind } from './music-data'
import { md, mdView, musicJob, viewMusic, type MusicJob, type Release } from './music-job'
import { attentionOf } from './music-label'
import { MUSIC_SPEC } from './music-market'
import { dealOf, musicScore, musicStore, topPeaks, type LedgerRow, type MusicState } from './music-state'
import { tourBlock } from './music-tour'

export type { ClaimKind } from './music-data'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4

/** The chance the auditor finds money: one constant, hinted and rolled. */
export const AUDIT_ODDS = 0.55

const DISPUTE_SCRIPT = 'career.music.dispute'
const NAME_MAX = 40

// ---------------------------------------------------------------------------
// Small pure helpers

type Out = Branch<MusicState>

/** The held musician job and its normalized record; null with no job or a job whose data is not an object. */
function actOf(g: GameState): { job: Job; d: MusicJob } | null {
  const job = musicJob(g)
  if (!job || !job.data || typeof job.data !== 'object' || Array.isArray(job.data)) return null
  return { job, d: mdView(job) }
}

const popOf = (g: GameState): number => actOf(g)?.d.popularity ?? 0

/** Fees scale with the typical income of the country and year: about 45,000 in the US today. */
const typical = (g: GameState): number => typicalIncome(g)

function bumpPop(g: GameState, n: number): void {
  const a = actOf(g)
  if (a) md(a.job).popularity = clamp100(a.d.popularity + n)
}

function bumpTrust(g: GameState, s: MusicState, n: number): void {
  const deal = dealOf(g, s)
  if (deal) deal.trust = clamp(Math.round(deal.trust + n), 0, 100)
}

/** A mod replaces one of the same id; mods of past years are dropped as it is written. */
function setMod(g: GameState, s: MusicState, mod: MusicState['mods'][number]): void {
  s.mods = cap([...s.mods.filter((m) => m.id !== mod.id && m.until >= g.year), mod], 6)
}

const nothing = (): Out => ({ text: () => 'Nothing came of it.', fx: {} })

/** A branch that only counts while the deal it was offered under is still the live one. */
const onDeal = <D extends { dealId: string }>(make: (g: GameState, s: MusicState, d: D) => Out) => (g: GameState, s: MusicState, d: D): Out => (dealOf(g, s)?.id === d.dealId ? make(g, s, d) : nothing())

type Def<D extends Record<string, Json>> = CrisisDef<MusicState, D>
type Rated = { id: string; name: string; score: number }

const grudgeOf = (d: { id: string; name: string }, by: number): Pick<NonNullable<Out['fx']>, 'grudge'> => (d.id ? { grudge: { id: d.id, name: txt(d.name, NAME_MAX), by } } : {})

// ---------------------------------------------------------------------------
// collab

type CollabData = Rated

const collab: Def<CollabData> = {
  id: 'collab',
  title: 'The Feature',
  emoji: '\u{1F3A4}',
  weight: (g, s) => {
    const a = actOf(g)
    if (!a || g.character.prison || a.d.popularity < 25) return 0
    return activeField(g, MUSIC_SPEC, s.memory).length >= 8 ? 3 : 0
  },
  make: (g, s, r) => {
    // a partner ranked 6 to 24 on this year's field
    const pool = activeField(g, MUSIC_SPEC, s.memory).slice(5, 24)
    const x = pool.length > 0 ? r.pick(pool) : null
    return { id: x?.rival.id ?? '', name: txt(x?.rival.name ?? 'A rival act', NAME_MAX), score: x?.score ?? 0 }
  },
  scene: (_g, _s, d) => `${d.name} wants you on a track. You can record it or sell a verse outright. What will you do?`,
  options: {
    safe: { label: 'Turn it down', emoji: '\u{1F6AB}', good: () => ({ text: () => 'You turned it down.', fx: {} }) },
    bold: {
      label: 'Record the feature',
      emoji: '\u{1F3B6}',
      odds: (g, s, d) => beatOdds(musicScore(g, s), d.score, 20),
      good: () => ({
        text: () => 'The feature landed. Your next release sells a little better.',
        fx: { fame: 3 },
        then: (s, g) => {
          bumpPop(g, 4)
          setMod(g, s, { id: 'collab', kind: 'units', mult: 1.06, until: g.year + 1 })
        },
      }),
      bad: (_g, _s, d) => ({
        text: () => `The feature flopped and ${d.name} blamed your verse.`,
        fx: grudgeOf(d, 8),
        then: (_s, g) => bumpPop(g, -3),
      }),
    },
    cash: {
      label: 'Sell a verse',
      emoji: '\u{1F4B5}',
      good: (g) => ({ text: (r) => `You sold a verse outright and were paid ${money(r.earned)}.`, fx: { money: Math.round(0.15 * typical(g) * (1 + popOf(g) / 50)) } }),
    },
  },
}

// ---------------------------------------------------------------------------
// award

type AwardData = { title: string; category: string; quality: number; ceremony: string; nominees: Rated[] }

/** The latest discography entry when it came out last year: the same read the legacy awards block used. */
function lastYearsRelease(g: GameState): Release | null {
  const latest = viewMusic(g).discography.at(-1)
  return latest && latest.age === g.character.age - 1 ? latest : null
}

/** w = exp((x - 60) / 8): your release quality or a nominee's score. One nominee list, one function, for the roll and the hint. */
const wOf = (x: number): number => Math.exp((x - 60) / 8)
function winShare(d: AwardData): number {
  const mine = wOf(d.quality)
  return mine / (mine + d.nominees.reduce((n, x) => n + wOf(x.score), 0))
}

const awardLine = (d: AwardData, g: GameState): string => fit(`"${d.title}" won the ${d.ceremony} for ${d.category} at age ${g.character.age}.`, 90)

function awardBranch(d: AwardData, won: boolean, cost: number): Out {
  const t = fit(d.title, 40)
  const fx = { fame: won ? 6 : 2, ...(won ? { standing: 4 } : {}), ...(cost > 0 ? { money: -cost } : {}) }
  return {
    text: (r) => `"${t}" ${won ? 'won' : 'lost at'} the ${d.ceremony}.${r.paid > 0 ? ` The campaign cost ${money(r.paid)}.` : ''}`,
    fx,
    then: won
      ? (s, g) => {
          bumpPop(g, 5)
          s.awards = cap([...s.awards, awardLine(d, g)], 24)
          count(g, 'awards')
          remember(g, `Won the ${d.ceremony} for ${d.category}.`)
        }
      : undefined,
  }
}

const award: Def<AwardData> = {
  id: 'award',
  title: 'Award Night',
  emoji: '\u{1F3C6}',
  cool: 1,
  weight: (g) => {
    const a = actOf(g)
    const rel = lastYearsRelease(g)
    if (!a || g.character.prison || !rel || !ceremonyAt(g.character.countryId, g.year)) return 0
    return rel.quality >= 62 && a.d.popularity >= 40 ? 8 : 0
  },
  make: (g, s, r) => {
    const rel = lastYearsRelease(g)
    // four nominees drawn without replacement from the year's field
    const pool = activeField(g, MUSIC_SPEC, s.memory)
    const nominees: Rated[] = []
    while (nominees.length < 4 && pool.length > 0) {
      const x = pool.splice(r.int(0, pool.length - 1), 1)[0]
      nominees.push({ id: x.rival.id, name: txt(x.rival.name, NAME_MAX), score: x.score })
    }
    return {
      title: txt(rel?.title ?? 'Your record', 60),
      category: rel?.type === 'Single' ? 'Record of the Year' : 'Album of the Year',
      quality: rel?.quality ?? 0,
      ceremony: ceremonyAt(g.character.countryId, g.year)?.name ?? 'Music Awards',
      nominees,
    }
  },
  scene: (_g, _s, d) => `You're nominated for the ${d.ceremony}. The show is Saturday. What will you do?`,
  options: {
    safe: {
      label: 'Attend quietly',
      emoji: '\u{1F935}',
      odds: (_g, _s, d) => winShare(d),
      good: (_g, _s, d) => awardBranch(d, true, 0),
      bad: (_g, _s, d) => awardBranch(d, false, 0),
    },
    bold: {
      label: 'Campaign for votes',
      emoji: '\u{1F4E3}',
      odds: (_g, _s, d) => winShare(d) + 0.08,
      good: (g, _s, d) => awardBranch(d, true, Math.round(0.02 * typical(g))),
      bad: (g, _s, d) => awardBranch(d, false, Math.round(0.02 * typical(g))),
    },
    cash: { label: 'Skip it', emoji: '\u{1F6CB}\u{FE0F}', good: () => ({ text: () => 'You skipped the show.', fx: {} }) },
  },
}

// ---------------------------------------------------------------------------
// festival

type FeeData = { fee: number }

const festival: Def<FeeData> = {
  id: 'festival',
  title: 'Festival Slot',
  emoji: '\u{1F3AA}',
  cool: 3,
  weight: (g) => {
    const a = actOf(g)
    return a && !g.character.prison && g.year >= 1967 && a.d.popularity >= 20 && tourBlock(g) === null ? 3 : 0
  },
  make: (g) => ({ fee: Math.round(typical(g) * (0.3 + popOf(g) / 100)) }),
  scene: (_g, _s, d) => `A festival has a slot open. The side stage pays ${money(d.fee)}. The main stage is a gamble. What will you do?`,
  options: {
    safe: {
      label: 'Take the side stage',
      emoji: '\u{1F3B8}',
      good: (_g, _s, d) => ({ text: (r) => `You played the side stage and were paid ${money(r.earned)}.`, fx: { money: d.fee } }),
    },
    bold: {
      label: 'Push for the main stage',
      emoji: '\u{1F31F}',
      odds: (g, s) => clamp(0.25 + (popOf(g) - 40) / 100 + (topPeaks(s, g.year, 10, 2) > 0 ? 0.1 : 0), 0.1, 0.8),
      good: (_g, _s, d) => ({
        text: (r) => `You took the main stage and were paid ${money(r.earned)}.`,
        fx: { money: d.fee * 4, fame: 4 },
        then: (s, g) => {
          bumpPop(g, 3)
          setMod(g, s, { id: 'festival', kind: 'fill', mult: 1.05, until: g.year + 1 })
        },
      }),
      bad: () => ({ text: () => 'The main stage slot went to another act.', fx: { fame: -1 } }),
    },
  },
}

// ---------------------------------------------------------------------------
// scandal

const scandal: Def<FeeData> = {
  id: 'scandal',
  title: 'The Story',
  emoji: '\u{1F4F0}',
  cool: 6,
  weight: (g) => (actOf(g) && !g.character.prison && g.character.hidden.fame >= 20 ? 2 : 0),
  make: (g) => ({ fee: Math.round(0.3 * typical(g)) }),
  scene: (_g, _s, d) => `A story about you is going around. The press will pay ${money(d.fee)} for your side. What will you do?`,
  options: {
    safe: { label: 'Say nothing', emoji: '\u{1F910}', good: () => ({ text: () => 'You said nothing and the story ran without you.', fx: { fame: -1 } }) },
    bold: {
      label: 'Deny it',
      emoji: '\u{1F645}',
      odds: (g) => clamp(0.35 + popOf(g) / 200, 0.1, 0.85),
      good: () => ({ text: () => 'You denied it and the press moved on.', fx: { fame: 2 } }),
      bad: () => ({ text: () => 'The denial backfired and the story grew.', fx: { fame: -4 }, then: (_s, g) => bumpPop(g, -5) }),
    },
    cash: {
      label: 'Sell your side',
      emoji: '\u{1F4B5}',
      good: (_g, _s, d) => ({ text: (r) => `You sold your side for ${money(r.earned)} and lost some fame.`, fx: { money: d.fee, fame: -2 } }),
    },
  },
}

// ---------------------------------------------------------------------------
// clash

type ClashData = { dealId: string }

const clash: Def<ClashData> = {
  id: 'clash',
  title: 'Radio Edit',
  emoji: '\u{1F4FB}',
  cool: 4,
  weight: (g, s) => (actOf(g) && !g.character.prison && dealOf(g, s) && hasTech(g, 'radio') ? 3 : 0),
  make: (g, s) => ({ dealId: dealOf(g, s)?.id ?? '' }),
  scene: (g, s) => `${fit(dealOf(g, s)?.label ?? 'Your label', NAME_MAX)} wants a shorter radio edit of your next single. They won't drop it. What will you do?`,
  options: {
    safe: {
      label: 'Cut the radio edit',
      emoji: '\u{2702}\u{FE0F}',
      good: onDeal<ClashData>(() => ({ text: () => 'You cut the radio edit and the label eased up.', fx: {}, then: (s, g) => bumpTrust(g, s, 8) })),
    },
    bold: {
      label: 'Meet halfway',
      emoji: '\u{1F91D}',
      odds: (g, s) => {
        const deal = dealOf(g, s)
        return clamp(0.5 + ((deal ? attentionOf(g, s, deal) : 1) - 1) / 2, 0.2, 0.8)
      },
      good: onDeal<ClashData>(() => ({ text: () => 'You met halfway and the label took the deal.', fx: {}, then: (s, g) => bumpTrust(g, s, 3) })),
      bad: onDeal<ClashData>(() => ({ text: () => 'The compromise pleased neither side.', fx: {}, then: (s, g) => bumpTrust(g, s, -6) })),
    },
    cash: {
      label: 'Refuse flatly',
      emoji: '\u{270B}',
      good: onDeal<ClashData>(() => ({ text: () => 'You refused and the label took note.', fx: {}, then: (s, g) => bumpTrust(g, s, -12) })),
    },
  },
}

// ---------------------------------------------------------------------------
// audit

type AuditData = { dealId: string; share: number; fee: number }

/** The back-pay an audit finds: a share of the gross of the deal's own ledger rows. */
const backPay = (s: MusicState, d: AuditData): number => Math.round(d.share * s.ledger.filter((r) => r.dealId === d.dealId).reduce((n, r) => n + r.gross, 0))

const audit: Def<AuditData> = {
  id: 'audit',
  title: 'The Audit',
  emoji: '\u{1F9FE}',
  cool: 6,
  weight: (g, s) => {
    const deal = dealOf(g, s)
    return actOf(g) && !g.character.prison && deal && !deal.legacy && deal.unrecouped > 0 && deal.term - deal.years >= 2 ? 2 : 0
  },
  make: (g, s, r) => {
    const deal = dealOf(g, s)
    return {
      dealId: deal?.id ?? '',
      share: round4(0.08 + 0.12 * r.next()),
      fee: Math.round((4_000 * (1 + (deal?.tier ?? 1)) * typical(g)) / US_TYPICAL_INCOME),
    }
  },
  scene: (g, s, d) => `The numbers from ${fit(dealOf(g, s)?.label ?? 'your label', NAME_MAX)} don't add up. An auditor costs ${money(d.fee)}. What will you do?`,
  options: {
    safe: { label: 'Let it go', emoji: '\u{1F937}', good: onDeal<AuditData>(() => ({ text: () => 'You let it go.', fx: {} })) },
    bold: {
      label: 'Hire an auditor',
      emoji: '\u{1F50E}',
      odds: () => AUDIT_ODDS,
      good: onDeal<AuditData>((_g, s, d) => ({
        text: (r) => (r.earned > 0 ? `The audit found ${money(r.earned)} owed to you after fees.` : r.paid > 0 ? `The audit found less than it cost. You paid ${money(r.paid)}.` : 'The audit found nothing worth the fee.'),
        fx: { money: backPay(s, d) - d.fee },
        then: (s2, g) => bumpTrust(g, s2, -15),
      })),
      bad: onDeal<AuditData>((_g, _s, d) => ({
        text: (r) => `The auditor found nothing and charged ${money(r.paid)}.`,
        fx: { money: -d.fee },
        then: (s, g) => bumpTrust(g, s, -15),
      })),
    },
    cash: {
      label: 'Ask nicely',
      emoji: '\u{1F64F}',
      odds: () => 0.25,
      good: onDeal<AuditData>(() => ({
        text: () => 'The label shaved a tenth off what you owe.',
        fx: {},
        then: (s, g) => {
          const deal = dealOf(g, s)
          if (deal) deal.unrecouped = Math.round(deal.unrecouped * 0.9)
          bumpTrust(g, s, 3)
        },
      })),
      bad: onDeal<AuditData>(() => ({ text: () => "They wouldn't budge.", fx: {} })),
    },
  },
}

// ---------------------------------------------------------------------------
// The six defs and the kit's set

export const MUSIC_DEFS: readonly CrisisDef<MusicState, any>[] = [collab, award, festival, scandal, clash, audit]

export const musicCrises: CrisisSet<MusicState> = defineCrises({ career: 'music', store: musicStore, talent: 'Music', defs: MUSIC_DEFS })

// ---------------------------------------------------------------------------
// Claims (pure and seeded)

const CLAIM_KINDS: readonly ClaimKind[] = ['sample', 'plagiarism']

/**
 * Whether a release drew a claim: only a row one or two years old, a sample claim first (it needs a risky
 * release that charted), then a plagiarism claim (a top-10 peak). Each draw comes from its own seeded key, so
 * the answer is the same every time it is asked, on a clone, and in an heir's life. Pure.
 */
export function claimKind(g: GameState, row: LedgerRow): ClaimKind | null {
  const age = g.year - row.year
  if (!(age === 1 || age === 2)) return null
  for (const kind of CLAIM_KINDS) {
    if (kind === 'sample' && row.samples !== 'risky') continue
    const p = claimOdds(kind, row.peak)
    if (p <= 0) continue
    if (seeded(`${familySeed(g)}|claim|${row.id}|${kind}${outcomeTag(g, row.year)}`).next() < p) return kind
  }
  return null
}

/** What the claimant wants: 6% (a sample) or 15% (plagiarism) of the row's gross, at least 3,000 or 10,000 scaled by typical income. Pure. */
export function claimAmount(g: GameState, row: LedgerRow, kind: ClaimKind): number {
  const rate = kind === 'plagiarism' ? 0.15 : 0.06
  const least = Math.round(((kind === 'plagiarism' ? 10_000 : 3_000) * typicalIncome(g)) / US_TYPICAL_INCOME)
  return Math.min(1e9, Math.max(least, Math.round(rate * row.gross)))
}

/** The chance a fight is won: the hint and the roll both call this. Pure. */
export function winOdds(kind: ClaimKind, quality: number, evidence: number): number {
  const q = Number.isFinite(quality) ? quality : 0
  const e = Number.isFinite(evidence) ? evidence : 0.5
  return kind === 'plagiarism' ? clamp(0.7 - 0.6 * e + q / 500, 0.1, 0.85) : clamp(0.45 + q / 400, 0.05, 0.95)
}

// ---------------------------------------------------------------------------
// The dispute

/** The modal data of a claim. A type, not an interface, so it is assignable to the kit's Record<string, Json>. */
export type DisputeData = { rowId: string; kind: ClaimKind; claim: number; evidence: number; claimant: { id: string; name: string }; legacy: boolean }

const rowOf = (s: MusicState, id: string): LedgerRow | undefined => s.ledger.find((r) => r.id === id)

/** Rows with a claim that has not been answered, newest first. Pure. */
function claims(g: GameState, s: MusicState): { row: LedgerRow; kind: ClaimKind }[] {
  return s.ledger
    .map((row, i) => ({ row, i, kind: claimKind(g, row) }))
    .filter((x): x is { row: LedgerRow; i: number; kind: ClaimKind } => x.kind !== null && !s.done.includes(`dispute.${x.row.id}`))
    .sort((a, b) => b.row.year - a.row.year || b.i - a.i)
    .map(({ row, kind }) => ({ row, kind }))
}

/** The claim of one row: the amount, the evidence and the claimant (a named act of the year's field), all seeded. Pure. */
function disputeOf(g: GameState, s: MusicState, row: LedgerRow, kind: ClaimKind): DisputeData {
  const field = activeField(g, MUSIC_SPEC, s.memory)
  const who = field.length > 0 ? seeded(`${familySeed(g)}|claimant|${row.id}`).pick(field) : null
  return {
    rowId: row.id,
    kind,
    claim: claimAmount(g, row, kind),
    evidence: round4(0.3 + 0.5 * seeded(`${familySeed(g)}|evidence|${row.id}`).next()),
    claimant: who ? { id: who.rival.id, name: txt(who.rival.name, NAME_MAX) } : { id: '', name: 'A songwriter' },
    legacy: row.legacy,
  }
}

const NO_CLAIM: DisputeData = { rowId: '', kind: 'sample', claim: 0, evidence: 0.5, claimant: { id: '', name: 'A songwriter' }, legacy: false }

/** The stances a claim offers: a legacy row has no rate to credit away. */
const stancesOf = (d: DisputeData): Stance[] => (d.legacy ? ['safe', 'bold'] : ['safe', 'bold', 'cash'])

/** Win odds read from the row's own quality, so the hint and the roll cannot disagree. */
const fightOdds = (_g: GameState, s: MusicState, d: DisputeData): number => winOdds(d.kind, rowOf(s, d.rowId)?.quality ?? 50, d.evidence)

export const DISPUTE: CrisisDef<MusicState, DisputeData> = {
  id: 'dispute',
  title: 'The Claim',
  emoji: '\u{2696}\u{FE0F}',
  cool: 1,
  // never offered by defineCrises: stepDispute and career.music.dispute own it
  weight: () => 0,
  make: (g, s) => {
    const first = claims(g, s)[0]
    return first ? disputeOf(g, s, first.row, first.kind) : NO_CLAIM
  },
  scene: (_g, _s, d) => `${fit(d.claimant.name, NAME_MAX)} says your hook is theirs and wants ${money(d.claim)}. What will you do?`,
  options: {
    safe: {
      label: 'Settle',
      emoji: '\u{1F4DD}',
      good: (_g, _s, d) => ({ text: (r) => `You settled the claim and paid ${money(r.paid)}.`, fx: { money: -d.claim } }),
    },
    bold: {
      label: 'Fight it',
      emoji: '\u{1F528}',
      odds: fightOdds,
      good: (_g, _s, d) => ({ text: (r) => `You fought the claim and won. The lawyers cost ${money(r.paid)}.`, fx: { money: -Math.round(0.1 * d.claim) } }),
      bad: (_g, _s, d) => ({
        text: (r) => `You fought the claim and lost. It cost ${money(r.paid)}.`,
        fx: { money: -Math.round(1.8 * d.claim), ...(d.claimant.id ? { grudge: { id: d.claimant.id, name: d.claimant.name, by: 10 } } : {}) },
      }),
    },
    cash: {
      label: 'Credit them',
      emoji: '\u{1F91D}',
      good: (_g, _s, d) => ({
        text: () => `You credited ${fit(d.claimant.name, NAME_MAX)} and gave up some of the royalties.`,
        fx: {},
        then: (s) => {
          const row = rowOf(s, d.rowId)
          if (row && !row.legacy) row.rate = clamp(round4(row.rate * 0.85), 0.05, 0.6)
        },
      }),
    },
  },
}

/** A modal's data as a safe claim, or null when it is not one. */
function readDispute(raw: Raw): DisputeData | null {
  const rowId = txt(raw.rowId, 24)
  const kind = raw.kind === 'plagiarism' || raw.kind === 'sample' ? raw.kind : null
  if (!rowId || !kind) return null
  const who = rec(raw.claimant)
  return {
    rowId,
    kind,
    claim: int(raw.claim, 0, 0, 1e9),
    evidence: flt(raw.evidence, 0.5, 0.3, 0.8),
    claimant: { id: txt(who.id, 60), name: txt(who.name, NAME_MAX) || 'A songwriter' },
    legacy: raw.legacy === true,
  }
}

/**
 * Queues the claim of the newest unanswered row, in the yearly tick after the deal and before the generic
 * crisis. The one choice slot goes to a renewal first, and a claim that loses waits a year (it stays open for
 * two). True when queued. Settle bodies only: it reads the seeded claim and draws no g.rng.
 */
export function stepDispute(c: CareerCtx<MusicState>): boolean {
  const { g, s } = c
  if (!actOf(g) || !choiceRoom(c)) return false
  if (g.queue.some((m) => m.kind === 'choice' && m.scriptId === DISPUTE_SCRIPT)) return false
  const first = claims(g, s)[0]
  if (!first) return false
  const d = disputeOf(g, s, first.row, first.kind)
  const view: CrisisDef<MusicState, DisputeData> = d.legacy ? { ...DISPUTE, options: { safe: DISPUTE.options.safe, bold: DISPUTE.options.bold } } : DISPUTE
  const best = bestStance(g, s, d, view)
  const choices: ChoiceOption[] = []
  for (const stance of stancesOf(d)) {
    const opt: Option<MusicState, DisputeData> = DISPUTE.options[stance]!
    const base: ChoiceOption = { id: stance, label: opt.label, emoji: opt.emoji }
    if (stance !== best) {
      choices.push(base)
      continue
    }
    const p = optionOdds(g, s, d, opt)
    choices.push({ ...base, ...honest(g, 'Music', p === null ? 'Looks best on average.' : `Looks best: ${oddsText(p)} to go well.`) })
  }
  if (!offerChoice(c, DISPUTE_SCRIPT, DISPUTE.title, DISPUTE.scene(g, s, d), choices, d, DISPUTE.emoji)) return false
  careerAudit({ t: 'crisis', career: 'music', id: DISPUTE.id, stances: choices.map((x) => x.id) })
  return true
}

defineScript(DISPUTE_SCRIPT, (g, choice, data) => {
  if (choice !== 'safe' && choice !== 'bold' && choice !== 'cash') return
  const d = readDispute(rec(data))
  if (!d || (choice === 'cash' && d.legacy)) return
  // A stale modal must not create a record; a replay, another owner or another year must not write.
  const seen = musicStore.peek(g)
  const raw = rec(data)
  if (!seen || !ownerMatches(g, raw.owner) || raw.year !== g.year || seen.done.includes(`dispute.${d.rowId}`)) return
  const s = musicStore.mut(g)
  if (!claimChoice(g, s, data, `dispute.${d.rowId}`)) return
  const { good, p, branch } = rollOption(g, s, d, DISPUTE.options[choice]!)
  const c = careerCtx(g, 'music', s)
  const result = applyEffects(c, branch.fx, 'Dispute')
  branch.then?.(s, g)
  careerSay(c, DISPUTE.title, branch.text(result), DISPUTE.emoji, p === null ? 'neutral' : good ? 'good' : 'bad')
})
