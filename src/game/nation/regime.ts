// Keeping power (fictional and abstract): friendly media, packed courts, longer term limits,
// emergency powers, postponed or rigged elections, bought votes, gerrymanders, jailed or exiled
// rivals, a loyal security force and, at the end of the road, a self-coup. Every step costs
// legitimacy, raises fear and invites courts, protests, sanctions and coups (consequences.ts).
// Strong institutions make the worst of it impossible: the army and the courts would not go along.
import { addHidden, count, formatMoney, log, notice, useYearAction, yearActionsUsed } from '../core'
import { arrestPlayer } from '../crime'
import { typicalIncome } from '../events/wealth-core'
import { chance } from '../rng'
import type { GameState } from '../types'
import { institutionStrength } from './data'
import { strikeChance, voteOdds } from './legislature'
import { adjustApproval, officeHooks, officeView, powerFor, type OfficeView } from './office'
import { addCase, editMe, editPolicy, meView, note, policyOf, writeMe, writePolicy, bumpStat, type Rival } from './state'
import { goIntoExile } from './consequences'
import { decreeRule } from './govern'

export type RegimeId = 'buyMedia' | 'mediaLaw' | 'packCourts' | 'termLimits' | 'emergency' | 'postpone' | 'gerrymander' | 'security' | 'rig' | 'buyVotes' | 'selfCoup'

export interface RegimeDef {
  id: RegimeId
  label: string
  emoji: string
  blurb: string
  /** Needs a vote (and how big a majority), or is an order. */
  vote: 'none' | 'simple' | 'constitutional'
  /** How likely courts are to strike it down (0 = they can't). */
  court: number
  /** Institutions must be weaker than this (0-100) for it to be possible at all. */
  maxStrength: number
  legitimacy: number
  fear: number
}

export const REGIME: Record<RegimeId, RegimeDef> = {
  buyMedia: { id: 'buyMedia', label: 'Have friends buy the media', emoji: '📺', blurb: 'Friendly owners, friendlier headlines.', vote: 'none', court: 0, maxStrength: 101, legitimacy: -3, fear: 0 },
  mediaLaw: { id: 'mediaLaw', label: 'Put the press under state control', emoji: '🗞️', blurb: 'A "media responsibility" law with teeth.', vote: 'constitutional', court: .8, maxStrength: 65, legitimacy: -10, fear: 8 },
  packCourts: { id: 'packCourts', label: 'Pack the courts', emoji: '⚖️', blurb: 'Add judges until the judges agree with you.', vote: 'simple', court: .6, maxStrength: 70, legitimacy: -10, fear: 4 },
  termLimits: { id: 'termLimits', label: 'Extend the term limit', emoji: '⏳', blurb: 'One more term. For stability.', vote: 'constitutional', court: 1, maxStrength: 65, legitimacy: -12, fear: 3 },
  emergency: { id: 'emergency', label: 'Declare a state of emergency', emoji: '🚨', blurb: 'Rule by decree for two years.', vote: 'none', court: .7, maxStrength: 80, legitimacy: -10, fear: 10 },
  postpone: { id: 'postpone', label: 'Postpone the next election', emoji: '📅', blurb: 'Elections are "unsafe" during the emergency.', vote: 'none', court: .9, maxStrength: 60, legitimacy: -20, fear: 10 },
  gerrymander: { id: 'gerrymander', label: 'Redraw the electoral map', emoji: '🗺️', blurb: 'Districts shaped like your supporters.', vote: 'simple', court: .5, maxStrength: 101, legitimacy: -5, fear: 0 },
  security: { id: 'security', label: 'Buy the security forces\' loyalty', emoji: '🪖', blurb: 'Bonuses, promotions and a purge of doubters.', vote: 'none', court: 0, maxStrength: 101, legitimacy: -4, fear: 8 },
  rig: { id: 'rig', label: 'Prepare the vote count', emoji: '🗳️', blurb: 'Make sure the right numbers come out.', vote: 'none', court: 0, maxStrength: 60, legitimacy: 0, fear: 0 },
  buyVotes: { id: 'buyVotes', label: 'Buy votes', emoji: '💵', blurb: 'Cash and groceries for voters in the right districts.', vote: 'none', court: 0, maxStrength: 101, legitimacy: 0, fear: 0 },
  selfCoup: { id: 'selfCoup', label: 'Dissolve parliament and rule alone', emoji: '👑', blurb: 'The last step: no legislature, no limits.', vote: 'none', court: 0, maxStrength: 55, legitimacy: -30, fear: 20 },
}
export const REGIME_IDS = Object.keys(REGIME) as RegimeId[]

function strength(g: GameState): number {
  return institutionStrength(g.character.countryId, g.year)
}

export function mediaCost(g: GameState, v: OfficeView): number {
  return Math.round(typicalIncome(g) * (v.leader ? 250 : 60) / 1000) * 1000
}
export function securityCost(g: GameState): number {
  return Math.round(typicalIncome(g) * 120 / 1000) * 1000
}
export function voteCost(g: GameState): number {
  return Math.round(typicalIncome(g) * 40 / 1000) * 1000
}

/** Odds of a self-coup succeeding (pure): loyal troops and fear against the institutions. */
export function selfCoupOdds(g: GameState): number {
  const me = meView(g)
  return Math.max(.1, Math.min(.9, me.loyalty / 100 * .8 + me.fear / 250 - strength(g) / 200))
}

/** Odds of jailing (or exiling) a rival on trumped-up charges (pure). */
export function persecuteOdds(g: GameState, exile: boolean): number {
  const p = policyOf(g, g.character.countryId), me = meView(g)
  return Math.max(.05, Math.min(.9, (1 - strength(g) / 100) * .8 + p.institutions.courtPacked * .3 + me.fear / 300 - (exile ? .1 : 0)))
}

/** Why a step is impossible right now (menus AND the resolver). */
export function regimeBlock(g: GameState, id: RegimeId, v: OfficeView | null = officeView(g)): string | null {
  if (!v) return 'You need to hold office.'
  if (g.character.prison) return 'Not from prison.'
  const def = REGIME[id]
  const p = policyOf(g, g.character.countryId), me = meView(g)
  const leaderOnly = !['buyVotes', 'rig', 'buyMedia'].includes(id)
  if (leaderOnly && !v.leader) return 'Only the head of government can do that.'
  if (!leaderOnly && v.rank < 1) return 'You need an office worth keeping.'
  if (strength(g) >= def.maxStrength) return 'Not here: the courts, the army and your own party would never go along.'
  if (yearActionsUsed(g, `regime.${id}`) >= 1) return 'Once a year.'
  const inst = p.institutions
  switch (id) {
    case 'buyMedia': if (inst.mediaControl >= .85) return 'You already own the news.'; if (me.dirty + g.character.money < mediaCost(g, v)) return `Friends need ${formatMoney(mediaCost(g, v))} to buy outlets.`; break
    case 'mediaLaw': if (inst.mediaControl >= .85) return 'The press already answers to you.'; break
    case 'packCourts': if (inst.courtPacked >= .9) return 'The courts are already yours.'; break
    case 'termLimits': if (inst.extraTerms >= 99) return 'There is no limit left to lift.'; break
    case 'emergency':
      if (inst.emergencyUntil >= g.year) return 'Emergency powers are already in force.'
      if (!recentCrisis(g) && me.fear < 40) return 'You need a crisis to justify it (or a population too scared to object).'
      break
    case 'postpone':
      if (inst.emergencyUntil < g.year) return 'Only possible under emergency powers.'
      if (inst.postponedUntil >= g.year + 1) return 'The election is already postponed.'
      break
    case 'gerrymander': if (inst.gerrymander >= .04) return 'The map is already drawn your way.'; break
    case 'security': if (g.character.money + me.dirty < securityCost(g)) return `Bonuses for the generals cost ${formatMoney(securityCost(g))}.`; break
    case 'rig': if (v.termLeft > 1) return 'Only in the run-up to your re-election.'; if ((me.cool.rig ?? 0) >= g.year) return 'The count is already prepared.'; break
    case 'buyVotes': if (v.termLeft > 1) return 'Only in the run-up to your re-election.'; if (me.dirty + g.character.money < voteCost(g)) return `A vote-buying drive costs ${formatMoney(voteCost(g))}.`; break
    case 'selfCoup':
      if (inst.regime === 'authoritarian') return 'You already rule alone.'
      if (me.fear < 50) return 'Not enough fear: people would pour into the streets.'
      if (me.loyalty < 60) return 'The security forces are not loyal enough.'
      break
  }
  return null
}

function recentCrisis(g: GameState): boolean {
  const c = meView(g).cool
  return ['recession', 'banks'].some(k => (c[k] ?? -99) >= g.year - 1) || Object.entries(c).some(([k, y]) => (k.startsWith('war.') || k.startsWith('pandemic.')) && y >= g.year - 1)
}

/** The honest odds a step works (votes, courts and the dice), shown on the button. */
export function regimeOdds(g: GameState, id: RegimeId): number {
  const v = officeView(g)
  if (!v) return 0
  const def = REGIME[id]
  let pass = 1
  if (def.vote !== 'none' && !decreeRule(g)) {
    const power = powerFor(v, 'law', false)
    if (!power) return 0
    pass = voteOdds(g, v, power, { order: 1, liberty: -1 }, { constitutional: def.vote === 'constitutional' }).pass
  }
  if (id === 'selfCoup') pass *= selfCoupOdds(g)
  return pass * (1 - strikeChance(g, def.court))
}

function pay(g: GameState, me: ReturnType<typeof editMe>, cost: number): boolean {
  const fromDirty = Math.min(me.dirty, cost)
  if (fromDirty + Math.max(0, g.character.money) < cost) return false
  me.dirty -= fromDirty
  g.character.money -= cost - fromDirty
  return true
}

/** Take a step to keep power. */
export function takeStep(g: GameState, id: RegimeId): boolean {
  const v = officeView(g)
  const why = regimeBlock(g, id, v)
  if (why || !v) { notice(g, 'Not Possible', why ?? 'You need to hold office.', { emoji: '🚫' }); return false }
  const def = REGIME[id]
  useYearAction(g, `regime.${id}`, 1)
  const me = editMe(g)
  const p = editPolicy(g, g.character.countryId)
  addHidden(g, 'karma', -6)
  bumpStat(me, 'powerGrabs')
  // Money first.
  if (id === 'buyMedia' && !pay(g, me, mediaCost(g, v))) return false
  if (id === 'security' && !pay(g, me, securityCost(g))) return false
  if (id === 'buyVotes' && !pay(g, me, voteCost(g))) return false
  // Votes, then the dice, then the courts.
  if (def.vote !== 'none' && !decreeRule(g)) {
    const power = powerFor(v, 'law', false)!
    if (!chance(g, voteOdds(g, v, power, { order: 1, liberty: -1 }, { constitutional: def.vote === 'constitutional' }).pass)) {
      me.legitimacy = Math.max(0, me.legitimacy + def.legitimacy / 2)
      writeMe(g, me)
      adjustApproval(g, -3)
      notice(g, 'Voted Down', `The legislature refused: "${def.label}". Even some of your allies voted no.`, { emoji: '🗳️', tone: 'bad' })
      return false
    }
  }
  if (id === 'selfCoup' && !chance(g, selfCoupOdds(g))) {
    writeMe(g, me)
    if (chance(g, .5)) { goIntoExile(g, 'The army refused your orders and turned on you.'); return false }
    officeHooks().leaveOffice(g, 'fired', `My coup failed and I lost office as ${v.title}.`)
    arrestPlayer(g, 'Attempted Coup', 5, { evidence: .9, context: 'The generals stayed in their barracks, and the police came for you instead.' })
    return false
  }
  if (def.court > 0 && chance(g, strikeChance(g, def.court))) {
    me.legitimacy = Math.max(0, me.legitimacy + def.legitimacy / 2)
    writeMe(g, me)
    notice(g, 'Struck Down', `The courts struck down "${def.label}" as unconstitutional.`, { emoji: '⚖️', tone: 'bad' })
    return false
  }
  me.legitimacy = Math.max(0, Math.min(100, me.legitimacy + def.legitimacy))
  me.fear = Math.min(100, me.fear + def.fear)
  const inst = p.institutions
  let text = ''
  switch (id) {
    case 'buyMedia': inst.mediaControl = Math.min(.9, inst.mediaControl + .15); text = `Friendly owners bought ${g.year < 1950 ? 'two newspapers and a radio station' : g.year < 2000 ? 'a TV channel and two newspapers' : 'a TV channel, a news site and a crowd of influencers'}. Coverage of you warmed up overnight.`; addCase(g, me, { kind: 'media', label: 'Arranged friendly takeovers of the media', evidence: .1, amount: mediaCost(g, v) }); break
    case 'mediaLaw': inst.mediaControl = Math.min(.9, inst.mediaControl + .35); text = 'Editors now need a licence that you can revoke. Most found religion.'; break
    case 'packCourts': inst.courtPacked = Math.min(1, inst.courtPacked + .45); text = 'You added judges until the courts agreed with you.'; break
    case 'termLimits': inst.extraTerms = Math.min(99, inst.extraTerms + 1); text = 'You may now serve one more term than the law used to allow.'; break
    case 'emergency': inst.emergencyUntil = g.year + 2; text = 'You now rule by decree for two years. No votes needed.'; break
    case 'postpone': inst.postponedUntil = g.year + 2; text = 'The election is off for two years "for the safety of voters".'; break
    case 'gerrymander': inst.gerrymander = .05; text = 'The new districts give your party extra seats at the next election.'; break
    case 'security': me.loyalty = Math.min(100, me.loyalty + 12); text = 'Generals got bonuses; doubters got early retirement.'; break
    case 'rig': me.cool.rig = g.year; text = 'Your people will be counting the ballots. Nothing can go wrong. Probably.'; break
    case 'buyVotes': me.stats.voteBuy = (me.stats.voteBuy ?? 0) + voteCost(g); addCase(g, me, { kind: 'votes', label: 'Bought votes', evidence: .25, amount: voteCost(g) }); text = 'Envelopes, groceries and bus trips went out in the swing districts.'; count(g, 'votesBought'); break
    case 'selfCoup': inst.regime = 'authoritarian'; inst.extraTerms = 99; inst.emergencyUntil = g.year + 99; text = 'You dissolved the legislature. From now on, your word is law.'; count(g, 'selfCoups'); break
  }
  if (id === 'mediaLaw' || id === 'packCourts' || id === 'termLimits' || id === 'postpone') inst.regime = inst.regime === 'democracy' ? 'hybrid' : inst.regime
  note(me, `${g.year}: ${def.label.toLowerCase()}.`)
  writePolicy(g, p)
  writeMe(g, me)
  if (id === 'selfCoup' || id === 'postpone') adjustApproval(g, -8)
  log(g, `I took a step to keep power: ${def.label.toLowerCase()}.`, 'bad')
  notice(g, def.label, text, { emoji: def.emoji, tone: 'neutral' })
  return true
}


// ---------------------------------------------------------------------------
// Rivals

export function rivalTargets(g: GameState): Rival[] {
  return meView(g).rivals.filter(r => r.status === 'active' && r.role !== 'lobbyist')
}

export function persecuteBlock(g: GameState, exile: boolean): string | null {
  const v = officeView(g)
  if (!v?.leader) return 'Only the head of government can do that.'
  if (strength(g) >= (exile ? 55 : 65)) return 'Not here: the courts would laugh the case out of the room.'
  if (!rivalTargets(g).length) return 'No rival worth the trouble.'
  if (yearActionsUsed(g, 'regime.rival') >= 1) return 'Once a year.'
  return null
}

/** Jail (or drive into exile) a rival on trumped-up charges. */
export function persecute(g: GameState, rivalId: string, exile: boolean): boolean {
  const why = persecuteBlock(g, exile)
  if (why) { notice(g, 'Not Possible', why, { emoji: '🚫' }); return false }
  const me = editMe(g)
  const r = me.rivals.find(x => x.id === rivalId && x.status === 'active')
  if (!r) return false
  useYearAction(g, 'regime.rival', 1)
  addHidden(g, 'karma', -12)
  me.legitimacy = Math.max(0, me.legitimacy - 10)
  me.fear = Math.min(100, me.fear + 10)
  bumpStat(me, 'persecutions')
  if (chance(g, persecuteOdds(g, exile))) {
    r.status = exile ? 'exiled' : 'jailed'
    writeMe(g, me)
    log(g, `My rival ${r.name} was ${exile ? 'driven into exile' : 'jailed'}.`, 'bad')
    notice(g, exile ? 'Rival Exiled' : 'Rival Jailed', `${r.name} ${exile ? 'fled the country ahead of an arrest warrant' : 'was convicted of "financial irregularities" in a day-long trial'}. Their supporters are furious; the rest are scared.`, { emoji: exile ? '✈️' : '⛓️' })
    return true
  }
  r.strength = Math.min(100, r.strength + 10)
  writeMe(g, me)
  adjustApproval(g, -6)
  notice(g, 'Case Thrown Out', `A judge threw out the case against ${r.name} and called it "political theatre". ${r.name} is now a martyr.`, { emoji: '⚖️', tone: 'bad' })
  return false
}

// ---------------------------------------------------------------------------
// Elections

/** Extra points at the next election from bought votes, a captive press, missing rivals and the regime (pure). */
export function electionEdge(g: GameState): { bonus: number; rigged: boolean; text: string } {
  const me = meView(g)
  const p = policyOf(g, g.character.countryId)
  const inst = p.institutions
  let bonus = inst.mediaControl * 10
  const rigged = (me.cool.rig ?? 0) >= g.year - 1
  bonus += Math.min(10, (me.stats.voteBuy ?? 0) / Math.max(1, voteCost(g)) * 3)
  bonus += Math.min(8, me.rivals.filter(r => r.status === 'jailed' || r.status === 'exiled').length * 4)
  // A strong opposition leader costs votes; smearing or co-opting them pays off here.
  const opp = me.rivals.find(r => r.status === 'active' && r.role === 'opposition')
  if (opp) bonus -= Math.max(0, opp.strength - 50) / 8
  if (inst.regime === 'authoritarian') bonus += 35
  else if (inst.regime === 'hybrid') bonus += 6
  bonus += inst.gerrymander * 60
  return { bonus: Math.round(bonus), rigged, text: '' }
}

/**
 * The count (an action: rolls). A prepared count adds points; observers may expose it, and where
 * courts are independent an exposed rig voids the result.
 */
export function countVotes(g: GameState, share: number): { share: number; line: string } {
  const me = editMe(g)
  const p = policyOf(g, g.character.countryId)
  const rigged = (me.cool.rig ?? 0) >= g.year - 1
  me.stats.voteBuy = 0
  delete me.cool.rig
  if (!rigged) { writeMe(g, me); return { share, line: '' } }
  const strength = institutionStrength(g.character.countryId, g.year) / 100
  let out = share + (p.institutions.regime === 'authoritarian' ? 20 : 12)
  let line = ' The count went your way.'
  if (chance(g, Math.max(.05, Math.min(.85, strength * (1 - p.institutions.mediaControl * .6))))) {
    me.legitimacy = Math.max(0, me.legitimacy - 20)
    addCase(g, me, { kind: 'rigging', label: 'Rigged an election', evidence: .5, amount: 0 })
    if (strength >= .55 && p.institutions.courtPacked < .5) { out = Math.min(out, 45); line = ' Observers exposed the rigged count and the courts annulled the result.' }
    else line = ' Observers say the count was rigged. Crowds are gathering.'
  }
  writeMe(g, me)
  return { share: Math.max(3, Math.min(97, Math.round(out))), line }
}
