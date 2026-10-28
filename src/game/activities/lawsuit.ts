// Lawsuit: sue people who wronged you (adults only, within the statute of limitations).
// Defendants come from recorded grievances (botched surgeons, assailants...; other modules
// may push to g.flags['lawsuit.grievances']) plus things we can read straight from state:
// recent firings / layoffs (wrongful termination) and a cheating ex-spouse.
// Pick one of three law firms, then how much to sue for: greed lowers your odds.
import { addMoney, addRelationship, addStat, count, getPerson, log, remember, scriptChoice, spend } from '../core'
import { notePerson } from '../people'
import { chance, pick, randInt } from '../rng'
import { pickLine } from '../text/pick'
import { defineScript } from '../scripts'
import type { GameState, Json, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import {
  brokeNotice,
  flagStrings,
  gate,
  grievances,
  localPrice,
  money,
  niceRound,
  priceLevel,
  pushFlagString,
  removeGrievance,
  result,
  stableName,
  stablePick,
  type GrievanceKind,
} from './common'
import { markSurgeonSued } from './surgery'
import { employerRef } from '../shops/everyday-brands'

const SUED_KEY = 'lawsuit.sued'
const EMOJI = '\u{2696}\u{FE0F}'

/** Years you have to file after being wronged. */
const LIMITATION: Record<GrievanceKind, number> = {
  assailant: 3,
  surgeon: 4,
  employer: 3,
  police: 5,
  coworker: 3,
  boss: 3,
  spouse: 4,
  other: 3,
}

/** US-dollar damage options by kind of case (scaled to the local price level). */
const DAMAGES: Record<GrievanceKind, number[]> = {
  assailant: [10_000, 50_000, 100_000, 500_000, 1_000_000],
  surgeon: [25_000, 100_000, 500_000, 1_000_000, 5_000_000],
  employer: [25_000, 100_000, 250_000, 1_000_000, 5_000_000],
  police: [50_000, 250_000, 1_000_000, 5_000_000, 10_000_000],
  coworker: [10_000, 50_000, 100_000, 500_000, 1_000_000],
  boss: [10_000, 50_000, 250_000, 500_000, 2_000_000],
  spouse: [10_000, 50_000, 100_000, 500_000, 1_000_000],
  other: [10_000, 25_000, 100_000, 250_000, 1_000_000],
}

/** How much asking for more hurts your odds (index = damage option). */
const GREED = [1.15, 1, 0.85, 0.65, 0.45]

const KIND_EMOJI: Record<GrievanceKind, string> = {
  assailant: '\u{1F44A}',
  surgeon: '\u{1F489}',
  employer: '\u{1F3E2}',
  police: '\u{1F46E}',
  coworker: '\u{1F9D1}\u{200D}\u{1F4BC}',
  boss: '\u{1F454}',
  spouse: '\u{1F494}',
  other: '\u{1F9D1}',
}

export interface Defendant {
  /** Stable key; also stored in the sued list so nobody gets sued twice. */
  key: string
  kind: GrievanceKind
  name: string
  detail: string
  /** 0-100. */
  strength: number
  /** Age when it happened. */
  age: number
  grievanceId?: string
  personId?: string
}

function within(g: GameState, kind: GrievanceKind, age: number): boolean {
  const c = g.character
  return age >= 18 && c.age - age <= LIMITATION[kind]
}

/** Everyone the player could sue right now. Pure. */
export function defendants(g: GameState): Defendant[] {
  const c = g.character
  const sued = new Set(flagStrings(g, SUED_KEY))
  const out: Defendant[] = []

  for (const gr of grievances(g)) {
    if (!within(g, gr.kind, gr.age)) continue
    const key = `gv:${gr.id}`
    if (sued.has(key)) continue
    out.push({
      key,
      kind: gr.kind,
      name: gr.name,
      detail: gr.detail ?? 'wronged you',
      strength: Math.max(5, Math.min(95, gr.strength)),
      age: gr.age,
      grievanceId: gr.id,
      personId: gr.personId,
    })
  }

  // Wrongful termination: recent firings and layoffs (age discrimination for older workers).
  c.careerHistory.forEach((r) => {
    if (r.reason !== 'fired' && r.reason !== 'laid off') return
    if (!within(g, 'employer', r.endAge)) return
    const key = `job:${r.company}:${r.title}:${r.endAge}`
    if (sued.has(key) || out.some((d) => d.key === key)) return
    const old = r.endAge >= 55
    out.push({
      key,
      kind: 'employer',
      // Never sue a real company in a game: a real brand becomes "your former employer".
      name: employerRef(r.company, 'Your former employer'),
      detail:
        r.reason === 'laid off'
          ? old
            ? `laid you off at ${r.endAge}, which smells like age discrimination`
            : `laid you off from your job as ${r.title}`
          : old
            ? `fired you from your job as ${r.title} at age ${r.endAge}`
            : `fired you from your job as ${r.title}`,
      strength: r.reason === 'laid off' ? (old ? 72 : 38) : old ? 50 : 22,
      age: r.endAge,
    })
  })

  // A spouse or ex-spouse who cheated on you.
  for (const p of g.people) {
    if (!p.alive || (p.relation !== 'spouse' && p.relation !== 'exSpouse')) continue
    if (!p.notes.some((n) => /cheated on the player/i.test(n))) continue
    const key = `person:${p.id}`
    if (sued.has(key) || p.data.sued === true) continue
    out.push({
      key,
      kind: 'spouse',
      name: `${p.firstName} ${p.lastName}`.trim(),
      detail: `cheated on you and ruined your marriage`,
      strength: 48,
      age: c.age,
      personId: p.id,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Law firms

interface Firm {
  tier: 0 | 1 | 2
  name: string
  fee: number
  /** Win-chance multiplier. */
  quality: number
}

const FIRM_SUFFIX = ['& Associates', 'Law Group', 'LLP', '& Partners', 'Legal', 'Law Offices']
const BUDGET_TAG = ['(they advertise on bus benches)', '(the office is above a laundromat)', '(their slogan rhymes)']

export function lawFirms(g: GameState, kind: GrievanceKind): Firm[] {
  const big = kind === 'police' || kind === 'surgeon' || kind === 'employer'
  const fees = (big ? [2_500, 12_000, 45_000] : [750, 4_000, 15_000]).map((f) => (g.character.countryId === 'us' ? f : Math.round(f * 0.4)))
  const suffixes = stablePick(g, 'lawFirmSuffix', FIRM_SUFFIX, 3)
  return ([0, 1, 2] as const).map((tier) => {
    const a = stableName(g, `lawyer.${tier}.a`)
    const b = stableName(g, `lawyer.${tier}.b`)
    const name = tier === 0 ? `${a.last} ${suffixes[tier]}` : `${a.last}, ${b.last} ${suffixes[tier]}`
    return { tier, name, fee: localPrice(g, fees[tier]), quality: [0.72, 1, 1.3][tier] }
  })
}

function damageOptions(g: GameState, kind: GrievanceKind): number[] {
  const scale = priceLevel(g)
  // Only American courts hand out jackpot verdicts; elsewhere judges award modest damages.
  const court = g.character.countryId === 'us' ? 1 : 0.2
  return DAMAGES[kind].map((d) => niceRound(d * scale * court))
}

export function winChance(g: GameState, d: Defendant, firm: Firm, amountIndex: number): number {
  const c = g.character
  let p = (d.strength / 100) * firm.quality * (GREED[amountIndex] ?? 0.45)
  p += (c.stats.smarts - 50) / 600
  if (c.criminalRecord.some((r) => r.convicted)) p -= 0.04
  return Math.max(0.04, Math.min(0.92, p))
}

// ---------------------------------------------------------------------------
// Filing

function findDefendant(g: GameState, key: string): Defendant | undefined {
  return defendants(g).find((d) => d.key === key)
}

function hire(g: GameState, key: string, tier: 0 | 1 | 2): void {
  const d = findDefendant(g, key)
  if (!d) {
    result(g, 'Lawsuit', "You can't think of anyone to sue right now.", EMOJI)
    return
  }
  const firm = lawFirms(g, d.kind)[tier]
  if (g.character.money < firm.fee) {
    brokeNotice(g, firm.fee, `a retainer at ${firm.name}`)
    return
  }
  const amounts = damageOptions(g, d.kind)
  scriptChoice(
    g,
    AMOUNT,
    'Damages',
    `${firm.name} will take your case against ${d.name} for ${money(firm.fee)}. How much do you want to sue for?`,
    [
      ...amounts.map((a, i) => ({ id: String(i), label: money(a), emoji: i >= 3 ? '\u{1F911}' : '\u{1F4B5}' })),
      { id: 'cancel', label: 'Never mind', emoji: '\u{1F645}' },
    ],
    { emoji: EMOJI, data: { key: d.key, tier } },
  )
}

const WIN_REACTIONS = [
  '{name} broke down in tears when the verdict was announced.',
  '{name} threatened you as you left the courtroom. The bailiff pretended not to hear.',
  '{name} yelled to everyone in the courtroom that you are a {insult}.',
  '{name} stared at the floor and muttered something about appealing.',
  "{name}'s lawyer was already on the phone with an insurance company before the gavel came down.",
]
const LOSE_REACTIONS = [
  '{name} laughed in your face on the courthouse steps.',
  '{name} called you a {insult} on the way out.',
  '{name} laughed in your face and called you a {insult}.',
  '{name} sent you a fruit basket. The card just said "Nice try."',
]
const INSULTS = ['snollygoster', 'nincompoop', 'scallywag', 'blithering ninny', 'lickspittle', 'dingbat', 'walking parking ticket', 'ambulance chaser']

function reaction(g: GameState, d: Defendant, won: boolean): string {
  const name = d.kind === 'employer' || d.kind === 'police' ? `A spokesperson for ${d.name}` : d.name
  return pick(g, won ? WIN_REACTIONS : LOSE_REACTIONS)
    .replace('{name}', name)
    .replace('{insult}', pickLine(g, INSULTS))
}

function markSued(g: GameState, d: Defendant, person: Person | undefined): void {
  pushFlagString(g, SUED_KEY, d.key)
  if (d.grievanceId) removeGrievance(g, d.grievanceId)
  if (d.kind === 'surgeon') markSurgeonSued(g, d.name)
  if (person) {
    person.data.sued = true
    addRelationship(g, person, -40)
    notePerson(person, 'Got sued by the player.')
  }
}

const AMOUNT = defineScript('act.lawsuit.amount', (g, choice, data) => {
  if (choice === 'cancel') return
  const o = (data ?? {}) as Record<string, Json>
  const key = typeof o.key === 'string' ? o.key : ''
  const tier = o.tier === 0 || o.tier === 1 || o.tier === 2 ? o.tier : 1
  const d = findDefendant(g, key)
  if (!d) return
  const idx = Math.max(0, Math.min(4, Number.parseInt(choice, 10) || 0))
  const firm = lawFirms(g, d.kind)[tier]
  const amount = damageOptions(g, d.kind)[idx]
  if (!spend(g, firm.fee, 'legal')) {
    brokeNotice(g, firm.fee, `a retainer at ${firm.name}`)
    return
  }
  const person = getPerson(g, d.personId)
  const won = chance(g, winChance(g, d, firm, idx))
  markSued(g, d, person)
  count(g, 'lawsuits')
  const vs = `${d.name}, who ${d.detail}`
  if (won) {
    addMoney(g, amount, 'legal')
    count(g, 'lawsuitsWon')
    addStat(g, 'happiness', randInt(g, 8, 18))
    remember(g, `Won a ${money(amount)} lawsuit against ${d.name}.`)
    log(g, `I sued ${d.name} and won ${money(amount)}!`, 'good')
    const opener = pick(g, [
      `${firm.name} delivered a closing argument so good the stenographer cried.`,
      g.character.countryId === 'us' ? `The jury deliberated for under an hour.` : `The judge ruled in your favor before lunch.`,
      `${firm.name} buried the other side in paperwork.`,
      `The judge looked at the evidence and sighed loudly at the defense.`,
    ])
    result(g, 'You Won!', `You sued ${vs}. ${opener} You were awarded ${money(amount)} in damages!\n\n${reaction(g, d, true)}`, '\u{1F3C6}', 'good')
    return
  }
  count(g, 'lawsuitsLost')
  addStat(g, 'happiness', -randInt(g, 4, 10))
  log(g, `I sued ${d.name} and lost.`, 'bad')
  const why =
    idx >= 3
      ? pick(g, g.character.countryId === 'us' ? ['The jury thought you were being greedy.', 'Asking for that much made the jury roll their eyes.'] : ['The judge thought you were being greedy.', 'Asking for that much made the judge laugh out loud.'])
      : pick(g, [g.character.countryId === 'us' ? "The jury didn't buy it." : "The judge didn't buy it.", 'The judge ruled there was not enough evidence.', `${firm.name} forgot to file a key document. Twice.`])
  result(g, 'You Lost', `You sued ${vs}. ${why} You're out the ${money(firm.fee)} you paid ${firm.name}.\n\n${reaction(g, d, false)}`, '\u{1F928}', 'bad')
})

// ---------------------------------------------------------------------------
// Menu

function firmAction(d: Defendant, firm: Firm): MenuAction {
  const tags = ['Budget', 'Reputable', 'Elite']
  return {
    type: 'action',
    id: `lawsuit.${d.key}.firm${firm.tier}`,
    label: firm.name,
    emoji: ['\u{1F9D1}\u{200D}\u{2696}\u{FE0F}', '\u{1F454}', '\u{1F48E}'][firm.tier],
    subtitle: `${tags[firm.tier]} · ${money(firm.fee)}${firm.tier === 0 ? ` ${BUDGET_TAG[firm.name.length % BUDGET_TAG.length]}` : ''}`,
    run: (g) => hire(g, d.key, firm.tier),
  }
}

function defendantMenu(d: Defendant): MenuGroup {
  return {
    type: 'menu',
    id: `lawsuit.${d.key}`,
    // "the FCA" reads right inside a sentence; as a menu row it starts a line.
    label: d.name.replace(/^the /, 'The '),
    emoji: KIND_EMOJI[d.kind],
    subtitle: `${d.detail.charAt(0).toUpperCase()}${d.detail.slice(1)}`,
    header: () => `Choose a law firm to sue ${d.name}. Better lawyers cost more but win more often. If you lose, the fee is gone.`,
    children: (g): MenuNode[] => lawFirms(g, d.kind).map((f) => firmAction(d, f)),
  }
}

export const lawsuitMenu: MenuGroup = {
  type: 'menu',
  id: 'lawsuit',
  label: 'Lawsuit',
  emoji: EMOJI,
  subtitle: 'Sue someone',
  disabledReason: (g) => gate(g, { minAge: 18, minAgeText: 'You must be at least 18 to sue someone.' }),
  header: (g) => (defendants(g).length ? 'Who do you want to sue?' : ''),
  children: (g): MenuNode[] => {
    const list = defendants(g)
    if (list.length === 0) {
      return [{ type: 'info', id: 'lawsuit.none', emoji: '\u{1F937}', text: "You can't think of anyone to sue right now." }]
    }
    return list.map(defendantMenu)
  },
}
