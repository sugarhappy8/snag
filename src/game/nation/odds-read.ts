// R3-G8 (H.6): the odds the politics screens print. A coup, a charge, how likely a case surfaces, a scheme's risk, a contract that
// gets noticed, laundering, the offshore wire, a power grab, jailing or exiling a rival: the player cannot know these, so the rows
// read them through the odds helper (fog/odds). Exact mode prints today's percent; Realistic prints a word, or "about N%" (nearest
// 5, honest and fallible) with the talent or after a read of that very number.
//
//   keys      one key per number: `odds:<id>:<kind>:p`, the id a country, a case, a scheme, a company or a step of the regime
//   owners    each kind registers how to find its true value (registerOddsOwner), so the Look closer row of a screen can buy a read
//   screens   the keys a screen asks about, at most 12 each (a purchase reads at most 12), for its "Commission a risk briefing" row
//   domains   Leadership shows the percent of the political odds (a cabinet post, a coup, a power grab, a rival); Crime shows the
//             ones about getting caught (a charge, a case surfacing, a scheme, a contract, laundering, the wire)
//
// Pure: nothing here draws a random number or writes the game. The owners read the same functions the actions resolve with.
import { chanceRead, evidenceRead, oddsKey, oddsLook, registerOddsOwner } from '../fog/odds/contract'
import type { GameState, MenuGroup } from '../types'
import { launderFronts, launderQuote, offshoreCaught, schemeQuote, SCHEMES, steerQuote, steerTargets } from './graft'
import { coupChance, chargeChance, exposureChance } from './consequences'
import { legislatureOf } from './legislature'
import { officeView, type OfficeView } from './office'
import { persecuteOdds, REGIME, REGIME_IDS, regimeBlock, regimeOdds, rivalTargets } from './regime'
import { meView, type CaseFile, type Me } from './state'

/** The talent that shows the percent of the political odds. */
export const POWER = 'Leadership'
/** The talent that shows the percent of the odds of getting caught. */
export const GUILE = 'Crime'
/** The greed a scheme's key reads at: the slider's own default (30%). A reading is carried from here to the slider's value. */
export const SCHEME_GREED = 0.3
/** The label of the Look closer row of every screen of hazards. */
export const BRIEFING = 'Commission a risk briefing'
/** The most cases the dashboard lists. */
export const CASES_SHOWN = 4
/** A purchase reads at most this many keys (knowledge/intel.ts MAX_KEYS), so a screen asks about no more. */
const SCREEN_KEYS = 12

// ---------------------------------------------------------------------------------------------------------------------------------
// The odds of a cabinet post (here so the key owner and the row read one function)

/** Odds the head of government gives you a portfolio (pure). */
export function cabinetOdds(g: GameState, v: OfficeView): number {
  const leg = legislatureOf(g, g.character.countryId)
  if (!leg.gov.includes(v.party)) return 0
  const me = meView(g)
  return Math.max(.05, Math.min(.85, .15 + (v.approval - 50) / 120 + me.capital / 250 + (v.terms - 1) * .08))
}

/** The player can ask for a cabinet post: a member of the legislature or a regional head with no portfolio. */
const seeksCabinet = (v: OfficeView | null): v is OfficeView => !!v && (v.legislator || v.regionalHead) && !v.portfolio

// ---------------------------------------------------------------------------------------------------------------------------------
// Keys

const country = (g: GameState): string => g.character.countryId

export const cabinetKey = (g: GameState): string => oddsKey(country(g), 'cabinet')
export const coupKey = (g: GameState): string => oddsKey(country(g), 'coup')
export const chargeKey = (c: Pick<CaseFile, 'id'>): string => oddsKey(c.id, 'charge')
export const surfaceKey = (c: Pick<CaseFile, 'id'>): string => oddsKey(c.id, 'surface')
export const proofKey = (c: Pick<CaseFile, 'id'>): string => oddsKey(c.id, 'proof')
export const flaggedKey = (schemeId: string): string => oddsKey(schemeId, 'flagged')
export const traceKey = (schemeId: string): string => oddsKey(schemeId, 'trace')
export const steerKey = (assetId: string): string => oddsKey(assetId, 'steer')
export const launderKey = (assetId: string): string => oddsKey(assetId, 'launder')
export const offshoreKey = (g: GameState): string => oddsKey(country(g), 'offshore')
export const regimeKey = (stepId: string): string => oddsKey(stepId, 'regime')
export const jailKey = (g: GameState): string => oddsKey(country(g), 'jail')
export const exileKey = (g: GameState): string => oddsKey(country(g), 'exile')

// ---------------------------------------------------------------------------------------------------------------------------------
// What the rows print

/** A chance of the politics screens: today's percent in Exact mode (`digits` decimals), a word or "about N%" in Realistic. */
export function chanceText(g: GameState, key: string, p: number, domain: string, opts: { digits?: number; base?: number } = {}): string {
  return chanceRead(g, key, p, domain, opts)
}

/** The evidence of a case or a scheme: today's percent in Exact mode, a word or "about N%" in Realistic. */
export function proof(g: GameState, key: string, e: number, domain: string, base?: number): string {
  return evidenceRead(g, key, e, domain, base)
}

/** The cases the dashboard lists, most urgent first: the ones prosecutors already know of, then by evidence. Closed cases are not listed. */
export function openCases(me: Me): CaseFile[] {
  return me.cases.filter((c) => c.status !== 'closed').sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.evidence - a.evidence)
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The keys of each screen

const caseKeys = (c: CaseFile): string[] => (c.status === 'pending' ? [chargeKey(c)] : [surfaceKey(c), proofKey(c)])

/** The Politics Dashboard: the coup, and the first cases it lists. */
export function dashKeys(g: GameState): string[] {
  const v = officeView(g)
  if (!v) return []
  const keys: string[] = v.leader ? [coupKey(g)] : []
  for (const c of openCases(meView(g)).slice(0, CASES_SHOWN)) keys.push(...caseKeys(c))
  return keys.slice(0, SCREEN_KEYS)
}

/** Line Your Pockets: the schemes on offer, then the contracts the state would give your companies. */
export function pocketKeys(g: GameState): string[] {
  if (!officeView(g)) return []
  const keys = SCHEMES.filter((s) => g.year >= s.from).map((s) => flaggedKey(s.id))
  for (const a of steerTargets(g)) keys.push(steerKey(a.id))
  return keys.slice(0, SCREEN_KEYS)
}

/** Dirty Money: the offshore wire and the companies that could launder. */
export function dirtyKeys(g: GameState): string[] {
  if (!officeView(g)) return []
  const keys = [offshoreKey(g)]
  for (const a of launderFronts(g)) keys.push(launderKey(a.id))
  return keys.slice(0, SCREEN_KEYS)
}

/** Keep Power: the rival rows first, then the steps that are not blocked today. */
export function keepKeys(g: GameState): string[] {
  const v = officeView(g)
  if (!v) return []
  const keys: string[] = rivalTargets(g).length ? [jailKey(g), exileKey(g)] : []
  for (const id of REGIME_IDS) if (!regimeBlock(g, id, v)) keys.push(regimeKey(id))
  return keys.slice(0, SCREEN_KEYS)
}

/** Govern: a cabinet post, for a member of the legislature who has none. */
export function governKeys(g: GameState): string[] {
  return seeksCabinet(officeView(g)) ? [cabinetKey(g)] : []
}

/** Every key the politics screens ask about, once each (for the tests and the Briefing). */
export function allNationKeys(g: GameState): string[] {
  const keys = new Set<string>([...dashKeys(g), ...pocketKeys(g), ...dirtyKeys(g), ...keepKeys(g), ...governKeys(g)])
  for (const c of meView(g).cases) for (const k of caseKeys(c)) keys.add(k)
  return [...keys]
}

/** The Look closer row of a screen of hazards, or null (Exact mode, no key to read, every source blocked). */
export function riskBriefing(g: GameState, id: string, keys: readonly string[]): MenuGroup | null {
  return oddsLook(g, { id, keys, label: BRIEFING })
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The owners: what each kind of key is and what its true value is today

const mine = (g: GameState, id: string): boolean => id === country(g)
const caseOf = (g: GameState, id: string): CaseFile | undefined => meView(g).cases.find((c) => c.id === id)
const schemeOf = (id: string) => SCHEMES.find((s) => s.id === id)

registerOddsOwner('cabinet', {
  tier: 2,
  label: () => 'Your odds of a cabinet post',
  truth: (g, id) => {
    const v = officeView(g)
    return seeksCabinet(v) && mine(g, id) ? cabinetOdds(g, v) : null
  },
})

registerOddsOwner('coup', {
  tier: 2,
  label: () => 'Coup risk this year',
  truth: (g, id) => {
    const v = officeView(g)
    return v && v.leader && mine(g, id) ? coupChance(g, v) : null
  },
})

registerOddsOwner('charge', {
  tier: 2,
  label: (g, id) => `Charges over ${caseOf(g, id)?.label ?? 'a case'}`,
  truth: (g, id) => {
    const c = caseOf(g, id)
    return c && c.status === 'pending' ? chargeChance(g, c) : null
  },
})

registerOddsOwner('surface', {
  tier: 2,
  label: (g, id) => `Chance ${caseOf(g, id)?.label ?? 'a case'} surfaces`,
  truth: (g, id) => {
    const c = caseOf(g, id)
    return c && c.status === 'open' ? exposureChance(g, c, true, false) : null
  },
})

registerOddsOwner('proof', {
  tier: 2,
  label: (g, id) => `Evidence in ${caseOf(g, id)?.label ?? 'a case'}`,
  truth: (g, id) => {
    const c = caseOf(g, id)
    return c && c.status === 'open' ? c.evidence : null
  },
})

registerOddsOwner('flagged', {
  tier: 2,
  label: (_g, id) => `Risk an auditor flags ${schemeOf(id)?.label.toLowerCase() ?? 'a scheme'}`,
  truth: (g, id) => {
    const v = officeView(g)
    const def = schemeOf(id)
    return v && def ? schemeQuote(g, v, def, SCHEME_GREED).caught : null
  },
})

registerOddsOwner('trace', {
  tier: 2,
  label: (_g, id) => `Evidence left by ${schemeOf(id)?.label.toLowerCase() ?? 'a scheme'}`,
  truth: (g, id) => {
    const v = officeView(g)
    const def = schemeOf(id)
    return v && def ? schemeQuote(g, v, def, SCHEME_GREED).evidence : null
  },
})

registerOddsOwner('steer', {
  tier: 2,
  label: (g, id) => `Risk reporters notice a contract for ${steerTargets(g).find((a) => a.id === id)?.name ?? 'a company'}`,
  truth: (g, id) => {
    const v = officeView(g)
    const a = steerTargets(g).find((x) => x.id === id)
    return v && a ? steerQuote(g, v, a).caught : null
  },
})

registerOddsOwner('launder', {
  tier: 2,
  label: (g, id) => `Risk of laundering through ${launderFronts(g).find((a) => a.id === id)?.name ?? 'a company'}`,
  truth: (g, id) => {
    const a = launderFronts(g).find((x) => x.id === id)
    return a ? launderQuote(g, a).caught : null
  },
})

registerOddsOwner('offshore', {
  tier: 2,
  label: () => 'Risk the offshore wire is stopped',
  truth: (g, id) => (officeView(g) && mine(g, id) ? offshoreCaught(g) : null),
})

registerOddsOwner('regime', {
  tier: 2,
  label: (_g, id) => `Chance it works: ${REGIME[id as keyof typeof REGIME]?.label ?? 'a power grab'}`,
  truth: (g, id) => {
    const step = (REGIME_IDS as string[]).includes(id) ? (id as (typeof REGIME_IDS)[number]) : null
    return step && !regimeBlock(g, step) ? regimeOdds(g, step) : null
  },
})

registerOddsOwner('jail', {
  tier: 2,
  label: () => 'Chance the charges stick on a rival',
  truth: (g, id) => (mine(g, id) && rivalTargets(g).length ? persecuteOdds(g, false) : null),
})

registerOddsOwner('exile', {
  tier: 2,
  label: () => 'Chance a rival flees into exile',
  truth: (g, id) => (mine(g, id) && rivalTargets(g).length ? persecuteOdds(g, true) : null),
})
