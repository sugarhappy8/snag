// What catches up with an official: journalists and auditors digging up case files, protests,
// coups, foreign sanctions, leaks from offshore accounts, removal votes, exile and trials after
// leaving office. Odds come from the country's institutions (strong courts and a free press catch
// more), the official's meters and the evidence on file. At most one popup a year from here.
import { addHidden, count, formatMoney, log, notice, remember, scriptChoice } from '../core'
import { arrestPlayer } from '../crime'
import { killCharacter } from '../death'
import { relocate } from '../activities/immigration-move'
import { marketOf } from '../data/markets'
import { chance, pick } from '../rng'
import { defineScript } from '../scripts'
import { stableRoll } from '../special/common'
import type { GameState } from '../types'
import { COUNTRIES, getCountry } from '../world'
import { institutionStrength } from './data'
import { governmentSeats } from './legislature'
import { adjustApproval, officeHooks, officeView, type OfficeView } from './office'
import { addCase, editMe, editPolicy, meView, note, policyOf, writeMe, writePolicy, bumpStat, type CaseFile, type Me } from './state'

const EXPOSE_SCRIPT = 'nation.exposed'
const PROTEST_SCRIPT = 'nation.protest'
const COUP_SCRIPT = 'nation.coup'
const REMOVAL_SCRIPT = 'nation.removal'

/** 0-1: how likely the country's press and auditors are to dig something up (pure). */
export function scrutiny(g: GameState, country = g.character.countryId): number {
  const p = policyOf(g, country)
  const me = meView(g)
  const strength = institutionStrength(country, g.year) / 100
  return Math.max(.02, Math.min(1, strength * (1 - p.institutions.mediaControl * .6) * (1 - p.institutions.courtPacked * .3) * (1 - me.fear / 250)))
}

/** Yearly chance an unknown case surfaces (pure; shown in the dashboard and rolled here). Heat
 * adds once a year to the strongest file, not to every file. */
export function exposureChance(g: GameState, cs: CaseFile, inOffice: boolean, withHeat = true): number {
  const me = meView(g)
  const base = cs.evidence * scrutiny(g, cs.country) * .12 + (withHeat ? me.heat / 800 : 0)
  return Math.max(0, Math.min(.5, inOffice ? base : base * 1.3))
}

/** Yearly chance prosecutors charge an exposed (pending) case once nothing protects you (pure). */
export function chargeChance(g: GameState, cs: CaseFile): number {
  const strength = institutionStrength(cs.country, g.year) / 100
  const p = policyOf(g, cs.country)
  return Math.max(.02, Math.min(.85, (.12 + .55 * cs.evidence) * strength * (1 - p.institutions.courtPacked * .6)))
}

/** Presidents (and leaders where courts answer to them) can't be charged while in office. */
export function immune(g: GameState, v: OfficeView | null): boolean {
  if (!v || !v.leader) return false
  const p = policyOf(g, g.character.countryId)
  return v.presidential || marketOf(g.character.countryId).corruption >= 60 || p.institutions.courtPacked >= .5 || p.institutions.regime === 'authoritarian'
}

function seize(me: Me, share: number): number {
  const taken = Math.round(me.dirty * share)
  me.dirty -= taken
  me.seized += taken
  return taken
}

/** Countries that rarely send anyone back. */
const HAVENS = ['ae', 'qa', 'sa', 'ru', 'by', 've', 'cu', 'pa', 'me', 'mv']
function havenFor(g: GameState): string {
  const ok = HAVENS.filter(id => id !== g.character.countryId && COUNTRIES.some(c => c.id === id))
  return ok[Math.floor(stableRoll(g, 'nation.haven') * ok.length) % ok.length] ?? 'ae'
}

/** Flee abroad: office ends, the slush fund at home is lost, offshore money comes along. */
export function goIntoExile(g: GameState, why: string): void {
  const v = officeView(g)
  const from = g.character.countryId
  const me = editMe(g)
  const lost = seize(me, 1)
  me.exile = from
  bumpStat(me, 'exiles')
  note(me, `${g.year}: fled ${getCountry(from).name}.`)
  writeMe(g, me)
  if (v) officeHooks().leaveOffice(g, 'other', `I fled ${getCountry(from).name} and left office as ${v.title}.`)
  const haven = havenFor(g)
  count(g, 'exiles')
  remember(g, `Fled ${getCountry(from).name} into exile.`)
  relocate(g, haven, 'asylum', { status: 'asylum', visa: 'protection' }, {
    title: 'Exile',
    opener: `${why} You landed in ${getCountry(haven).name}, which does not send people back.${lost > 0 ? ` The ${formatMoney(lost)} you hid at home stayed behind.` : ''}${me.offshore > 0 ? ` Your ${formatMoney(me.offshore)} abroad is still yours.` : ''} Going home means facing the courts.`,
    emoji: '✈️',
  })
}

// ---------------------------------------------------------------------------
// Case files surfacing

defineScript(EXPOSE_SCRIPT, (g, choice, data) => {
  const id = String((data as { id?: string } | undefined)?.id ?? '')
  const v = officeView(g)
  const me = editMe(g)
  const cs = me.cases.find(c => c.id === id && c.status !== 'closed')
  if (!cs) return
  const strength = institutionStrength(g.character.countryId, g.year) / 100
  if (choice === 'resign') {
    writeMe(g, me)
    if (v) officeHooks().leaveOffice(g, 'quit', `I resigned as ${v.title} over ${cs.label.toLowerCase()}.`)
    notice(g, 'Resigned', 'You resigned before the hearings. The prosecutors kept the file open.', { emoji: '🚪', tone: 'bad' })
    return
  }
  if (choice === 'lean') {
    const p = policyOf(g, g.character.countryId)
    const odds = Math.max(.1, Math.min(.9, (1 - strength) * .7 + p.institutions.courtPacked * .4 + me.fear / 300))
    me.legitimacy = Math.max(0, me.legitimacy - 10)
    me.fear = Math.min(100, me.fear + 6)
    addHidden(g, 'karma', -6)
    if (chance(g, odds)) {
      cs.status = 'closed'
      writeMe(g, me)
      log(g, 'The case against me was quietly dropped.', 'neutral')
      notice(g, 'Case Dropped', 'Prosecutors were reassigned and the file went missing. Critics noticed.', { emoji: '🗄️' })
      return
    }
    cs.evidence = Math.min(1, cs.evidence + .2)
    writeMe(g, me)
    adjustApproval(g, -8)
    notice(g, 'Obstruction', 'Your pressure on the prosecutors leaked. Now they are investigating that too.', { emoji: '📰', tone: 'bad' })
    return
  }
  if (choice === 'blame') {
    if (chance(g, .45)) {
      cs.evidence = Math.max(0, cs.evidence - .3)
      writeMe(g, me)
      adjustApproval(g, -3)
      notice(g, 'An Aide Took the Fall', 'A loyal aide confessed to everything. Most people believed it.', { emoji: '👉' })
      return
    }
    cs.evidence = Math.min(1, cs.evidence + .15)
    writeMe(g, me)
    adjustApproval(g, -9)
    notice(g, 'The Aide Talked', 'Your aide refused to take the fall and handed over the messages.', { emoji: '📱', tone: 'bad' })
    return
  }
  // Deny
  cs.evidence = Math.min(1, cs.evidence + .05)
  writeMe(g, me)
  adjustApproval(g, -5)
  notice(g, 'Denied', 'You denied everything. The story is not going away.', { emoji: '🙅', tone: 'bad' })
})

function surface(g: GameState, v: OfficeView | null, me: Me, cs: CaseFile): boolean {
  cs.status = 'pending'
  const seized = seize(me, .9)
  me.heat = Math.min(100, me.heat + 20)
  me.legitimacy = Math.max(0, me.legitimacy - 8)
  bumpStat(me, 'scandals')
  count(g, 'corruptionScandals')
  const paper = `The ${g.character.city} ${pick(g, ['Herald', 'Chronicle', 'Tribune', 'Courier', 'Gazette'])}`
  if (!v) {
    // Out of office: no hearings. The story runs; prosecutors decide (chargeChance) in later years.
    writeMe(g, me)
    if (me.exile && g.character.countryId !== me.exile) {
      notice(g, 'Wanted at Home', `${paper} published the file on ${cs.label.toLowerCase()}. ${getCountry(me.exile).name} wants you back. You are staying where you are.`, { emoji: '📰' })
      return true
    }
    adjustReputation(g)
    notice(g, 'Exposed', `${paper} published the file on ${cs.label.toLowerCase()} (${formatMoney(cs.amount)}). Prosecutors are reading it too.${seized > 0 ? ` Investigators froze ${formatMoney(seized)} of hidden cash.` : ''}`, { emoji: '📰', tone: 'bad' })
    return true
  }
  adjustApproval(g, -Math.round(8 + cs.evidence * 8))
  writeMe(g, me)
  const imm = immune(g, v)
  const options = [
    { id: 'deny', label: 'Deny everything', emoji: '🙅' },
    { id: 'blame', label: 'Blame an aide', emoji: '👉' },
    { id: 'lean', label: 'Lean on the prosecutors', emoji: '🗄️' },
    { id: 'resign', label: 'Resign', emoji: '🚪' },
  ]
  scriptChoice(g, EXPOSE_SCRIPT, 'Exposed!', `${paper} has the story: ${cs.label.toLowerCase()} (${formatMoney(cs.amount)}).${seized > 0 ? ` Investigators froze ${formatMoney(seized)} of hidden cash.` : ''}${imm ? ' While you hold this office you cannot be charged. The file waits.' : ''}`, options, { emoji: '📰', data: { id: cs.id } })
  return true
}

function severityOf(cs: CaseFile): number {
  const years = cs.amount / Math.max(1, marketOf(cs.country).gdpPerCapita)
  return years > 2000 ? 5 : years > 300 ? 4 : years > 40 ? 3 : 2
}

function charge(g: GameState, me: Me, cs: CaseFile, context: string): boolean {
  cs.status = 'closed'
  writeMe(g, me)
  remember(g, `Charged over ${cs.label.toLowerCase()}.`)
  arrestPlayer(g, 'Corruption', severityOf(cs), { evidence: Math.max(.3, Math.min(.95, cs.evidence)), context })
  return true
}

/**
 * Where corruption is the norm, the next government often goes after the last one: once out of
 * office, any file can become a weapon (pure; rolled yearly while files are open).
 */
export function purgeChance(g: GameState, me: Me): number {
  const corruption = marketOf(g.character.countryId).corruption
  const files = me.cases.filter(c => c.status === 'pending').length
  return corruption < 45 || !files ? 0 : Math.min(.1, .02 + .01 * files + (corruption - 45) / 600)
}

function cases(g: GameState, v: OfficeView | null, me: Me): boolean {
  const inOffice = !!v && v.rank >= 1
  const abroad = !!me.exile && g.character.countryId !== me.exile
  if (!inOffice && !abroad && chance(g, purgeChance(g, me))) {
    const cs = me.cases.filter(c => c.status === 'pending').sort((a, b) => b.evidence - a.evidence)[0]
    cs.evidence = Math.max(.5, cs.evidence)
    return charge(g, me, cs, `The new government reopened every file from your time in power, starting with ${cs.label.toLowerCase()}.`)
  }
  const strongest = me.cases.filter(c => c.status === 'open').reduce<CaseFile | null>((best, c) => (!best || c.evidence > best.evidence ? c : best), null)
  for (const cs of me.cases) {
    if (cs.status === 'closed') continue
    if (g.year - cs.year > (cs.status === 'pending' ? 20 : 15)) { cs.status = 'closed'; note(me, `${g.year}: the statute of limitations ran out (${cs.label.toLowerCase()}).`); continue }
    if (cs.status === 'open') cs.evidence = Math.max(0, cs.evidence - .03)
    if (abroad) continue
    if (cs.status === 'pending') {
      // Corrupt systems lose files; immunity makes prosecutors wait.
      if (chance(g, marketOf(cs.country).corruption / 400)) { cs.status = 'closed'; note(me, `${g.year}: the file on ${cs.label.toLowerCase()} was "lost in a flood".`); continue }
      if (inOffice && immune(g, v)) continue
      if (chance(g, chargeChance(g, cs) * (inOffice ? .35 : 1))) {
        if (inOffice && v) officeHooks().leaveOffice(g, 'fired', `I was charged over ${cs.label.toLowerCase()} and removed as ${v.title}.`)
        return charge(g, me, cs, inOffice ? `Prosecutors charged you over ${cs.label.toLowerCase()} while you were still in office.` : `Now that you hold no office, prosecutors came for you over ${cs.label.toLowerCase()}.`)
      }
      continue
    }
    if (chance(g, exposureChance(g, cs, inOffice, cs === strongest))) return surface(g, inOffice ? v : null, me, cs)
  }
  return false
}

function adjustReputation(g: GameState): void {
  addHidden(g, 'notoriety', 6)
}

// ---------------------------------------------------------------------------
// Protests, removal votes, coups, sanctions, leaks

/** Odds a crackdown holds when the protests have become a revolution (pure). */
export function crackdownOdds(g: GameState): number {
  const me = meView(g)
  return Math.max(.1, Math.min(.85, me.loyalty / 100 * .7 + me.fear / 400 - .1))
}

defineScript(PROTEST_SCRIPT, (g, choice, data) => {
  const v = officeView(g)
  if (!v) return
  const me = editMe(g)
  const revolution = (data as { revolution?: boolean } | undefined)?.revolution === true
  if (choice === 'crackdown' && revolution && !chance(g, crackdownOdds(g))) {
    bumpStat(me, 'overthrown')
    writeMe(g, me)
    count(g, 'overthrown')
    if (chance(g, .5)) { goIntoExile(g, 'The army refused to fire on the crowds. Your guards drove you to the airport.'); return }
    officeHooks().leaveOffice(g, 'fired', `I was overthrown as ${v.title}.`)
    remember(g, `Overthrown by a popular uprising as ${v.title}.`)
    arrestPlayer(g, 'Abuse of Power', 4, { evidence: .8, context: 'The army refused to fire on the crowds. The new authorities arrested you in the palace.' })
    return
  }
  if (choice === 'crackdown') {
    // Every order to fire on crowds costs some of the soldiers' loyalty.
    if (revolution) me.loyalty = Math.max(0, me.loyalty - 6)
    me.fear = Math.min(100, me.fear + 15)
    me.legitimacy = Math.max(0, me.legitimacy - 12)
    bumpStat(me, 'crackdowns')
    addHidden(g, 'karma', -10)
    writeMe(g, me)
    adjustApproval(g, -3)
    const sanctions = foreignReaction(g, .35)
    log(g, 'I ordered the security forces to clear the streets.', 'bad')
    notice(g, 'Crackdown', `The squares were cleared by morning. Fear rose; trust fell.${sanctions}`, { emoji: '🛡️', tone: 'bad' })
    return
  }
  if (choice === 'concede') {
    me.capital = Math.max(0, me.capital - 20)
    me.legitimacy = Math.min(100, me.legitimacy + 6)
    writeMe(g, me)
    adjustApproval(g, 5)
    notice(g, 'Concessions', 'You met the organizers and promised change. The crowds went home, for now.', { emoji: '🤝', tone: 'good' })
    return
  }
  if (choice === 'resign') {
    writeMe(g, me)
    officeHooks().leaveOffice(g, 'quit', `I resigned as ${v.title} as protests filled the streets.`)
    notice(g, 'Resigned', 'You resigned. The crowds cheered and went home.', { emoji: '🚪' })
    return
  }
  // Wait it out.
  if (chance(g, .5)) {
    writeMe(g, me)
    notice(g, 'It Blew Over', 'The protests fizzled out after a rainy week.', { emoji: '🌧️' })
    return
  }
  me.legitimacy = Math.max(0, me.legitimacy - 8)
  writeMe(g, me)
  adjustApproval(g, -6)
  notice(g, 'The Crowds Grew', 'Ignoring them made it worse. The protests spread to every big city.', { emoji: '📢', tone: 'bad' })
})

/** Big democracies sanction a repressive government (their own laws, in the world record). */
function foreignReaction(g: GameState, odds: number): string {
  const home = g.character.countryId
  if (!chance(g, odds)) return ''
  const by = ['us', 'gb', 'de', 'fr', 'jp', 'ca'].filter(id => id !== home && institutionStrength(id, g.year) >= 60).slice(0, 3)
  for (const id of by) {
    const p = editPolicy(g, id)
    if (!p.sanctions[home]) { p.sanctions[home] = g.year; p.since[`sanction.${home}`] = g.year; writePolicy(g, p) }
  }
  const me = editMe(g)
  const frozen = Math.round(me.offshore * .25)
  me.offshore -= frozen
  me.seized += frozen
  writeMe(g, me)
  return by.length ? ` ${by.map(id => getCountry(id).name).join(', ')} imposed sanctions${frozen > 0 ? ` and froze ${formatMoney(frozen)} of your money abroad` : ''}.` : ''
}

/** Odds of surviving a removal vote: the government's seats, approval, fear, packed courts. */
export function survivalOdds(g: GameState, v: OfficeView): number {
  const p = policyOf(g, g.character.countryId)
  if (p.institutions.regime === 'authoritarian') return .95
  const me = meView(g)
  // Strong institutions turn on a leader who has lost both the public and their legitimacy.
  const strength = institutionStrength(g.character.countryId, g.year) / 100
  return Math.max(.05, Math.min(.95, .1 + governmentSeats(g) * .6 + (v.approval - 35) / 80 + me.fear / 400 + p.institutions.courtPacked * .1 - strength * (1 - me.legitimacy / 100) * .6))
}

defineScript(REMOVAL_SCRIPT, (g, choice) => {
  const v = officeView(g)
  if (!v) return
  if (choice === 'resign') { officeHooks().leaveOffice(g, 'quit', `I resigned as ${v.title} before the vote.`); notice(g, 'Resigned', 'You resigned before the vote.', { emoji: '🚪', tone: 'bad' }); return }
  if (choice === 'flee') { goIntoExile(g, 'You boarded a night flight before the vote.'); return }
  if (chance(g, survivalOdds(g, v))) {
    adjustApproval(g, 3)
    log(g, `I survived a vote to remove me as ${v.title}.`, 'good')
    notice(g, 'Survived', 'Your coalition held. You survived the vote.', { emoji: '😅', tone: 'good' })
    return
  }
  count(g, 'impeached')
  officeHooks().leaveOffice(g, 'fired', `I was voted out of office as ${v.title}.`)
  remember(g, `Removed from office as ${v.title}.`)
  notice(g, 'Removed', `The vote went against you. You are no longer ${v.title}.`, { emoji: '🔨', tone: 'bad' })
})

defineScript(COUP_SCRIPT, (g, choice) => {
  const v = officeView(g)
  if (!v) return
  const me = editMe(g)
  if (choice === 'flee') { writeMe(g, me); goIntoExile(g, 'Soldiers surrounded the palace. You escaped through the kitchen.'); return }
  if (choice === 'negotiate') {
    for (const cs of me.cases) if (cs.status !== 'closed' && chance(g, .5)) cs.status = 'closed'
    writeMe(g, me)
    officeHooks().leaveOffice(g, 'quit', `I handed power to the generals and left office as ${v.title}.`)
    notice(g, 'Handed Over', 'You resigned in exchange for an amnesty. Some of your files were burned; not all.', { emoji: '🎖️', tone: 'bad' })
    return
  }
  const odds = Math.max(.1, Math.min(.9, me.loyalty / 100 + me.fear / 250))
  if (chance(g, odds)) {
    me.fear = Math.min(100, me.fear + 15)
    me.loyalty = Math.min(100, me.loyalty + 10)
    bumpStat(me, 'coupsSurvived')
    writeMe(g, me)
    log(g, 'I crushed a coup attempt.', 'good')
    notice(g, 'Coup Crushed', 'Loyal units held the capital. The plotters are in custody.', { emoji: '🛡️', tone: 'good' })
    return
  }
  writeMe(g, me)
  if (chance(g, .1)) { killCharacter(g, 'Killed in a coup'); return }
  goIntoExile(g, 'The coup succeeded. You were bundled onto a plane.')
})

function protests(g: GameState, v: OfficeView, me: Me): boolean {
  const odds = Math.max(0, Math.min(.5, (45 - v.approval) / 100 + (55 - me.legitimacy) / 150 - me.fear / 400))
  if (!chance(g, odds)) return false
  bumpStat(me, 'protests')
  writeMe(g, me)
  // Unpopular and illegitimate: the protests become an uprising, and a crackdown can fail.
  const revolution = v.rank >= 3 && v.approval < 35 && me.legitimacy < 25
  scriptChoice(g, PROTEST_SCRIPT, revolution ? 'Uprising' : 'Protests', `${revolution ? 'Hundreds of thousands' : 'Crowds'} fill the streets of ${g.character.city} demanding that you ${v.approval < 25 ? 'resign' : 'change course'}. Approval ${v.approval}%, legitimacy ${Math.round(me.legitimacy)}.`, [
    { id: 'wait', label: 'Wait it out (50%)', emoji: '⏳' },
    { id: 'concede', label: 'Make concessions (20 capital)', emoji: '🤝' },
    { id: 'crackdown', label: revolution ? `Order the army in (${Math.round(crackdownOdds(g) * 100)}% it obeys)` : 'Send in the security forces', emoji: '🛡️' },
    { id: 'resign', label: 'Resign', emoji: '🚪' },
  ], { emoji: '📢', data: { revolution } })
  return true
}

/** Yearly coup risk for a head of government (pure). Strong institutions all but rule it out. */
export function coupChance(g: GameState, v: OfficeView): number {
  if (!v.leader) return 0
  const me = meView(g)
  const p = policyOf(g, g.character.countryId)
  const strength = institutionStrength(g.character.countryId, g.year)
  const raw = (60 - me.loyalty) / 200 + (30 - v.approval) / 200 + (40 - me.legitimacy) / 300 + (p.institutions.regime === 'authoritarian' ? .03 : 0) + Math.max(0, marketOf(g.character.countryId).corruption - 40) / 1000
  return Math.max(0, Math.min(.25, raw)) * (strength >= 70 ? .05 : 1)
}

function coup(g: GameState, v: OfficeView, me: Me): boolean {
  if (!chance(g, coupChance(g, v))) return false
  writeMe(g, me)
  scriptChoice(g, COUP_SCRIPT, 'Coup!', `Tanks are rolling toward the capital. Security forces' loyalty: ${Math.round(me.loyalty)}/100.`, [
    { id: 'fight', label: `Order loyal units to fight (${Math.round(Math.max(.1, Math.min(.9, me.loyalty / 100 + me.fear / 250)) * 100)}%)`, emoji: '🛡️' },
    { id: 'negotiate', label: 'Resign in exchange for an amnesty', emoji: '🎖️' },
    { id: 'flee', label: 'Flee into exile', emoji: '✈️' },
  ], { emoji: '🪖' })
  return true
}

function removal(g: GameState, v: OfficeView, me: Me): boolean {
  // Low approval plus a weak coalition: a no-confidence or impeachment vote.
  if (v.rank < 3 || v.approval >= 25 || policyOf(g, g.character.countryId).institutions.regime === 'authoritarian') return false
  if (!chance(g, Math.max(0, (25 - v.approval) / 40 + (me.legitimacy < 40 ? .1 : 0)))) return false
  writeMe(g, me)
  const words = v.presidential ? 'Impeachment' : 'No-Confidence Vote'
  scriptChoice(g, REMOVAL_SCRIPT, words, `Lawmakers want you out. Your government holds ${Math.round(governmentSeats(g) * 100)}% of the seats.`, [
    { id: 'fight', label: `Fight the vote (${Math.round(survivalOdds(g, v) * 100)}%)`, emoji: '💪' },
    { id: 'resign', label: 'Resign', emoji: '🚪' },
    { id: 'flee', label: 'Flee abroad', emoji: '✈️' },
  ], { emoji: '🔨' })
  return true
}

function leaks(g: GameState, me: Me): boolean {
  if (me.offshore <= 0) return false
  const sanctioned = Object.values(policyOf(g, me.exile || g.character.countryId).sanctions).length > 0
  if (!chance(g, .02 + (sanctioned ? .04 : 0) + me.heat / 1000)) return false
  const frozen = Math.round(me.offshore * .4)
  me.offshore -= frozen
  me.seized += frozen
  addCase(g, me, { kind: 'offshore', label: 'Secret offshore accounts named in a leak', evidence: .45, amount: frozen * 2 })
  writeMe(g, me)
  notice(g, 'The Leak', `A leak of offshore bank records named you. Banks froze ${formatMoney(frozen)}.`, { emoji: '🗂️', tone: 'bad' })
  return true
}

/** The yearly reckoning. Returns true when it queued a popup. */
export function yearlyConsequences(g: GameState, v: OfficeView | null): boolean {
  if (!g.character.alive || g.character.prison) return false
  const me = editMe(g)
  // The big threats first: coups, removal votes and the street, then files and leaks.
  if (v && v.rank >= 2) {
    if (v.leader && coup(g, v, me)) return true
    if (removal(g, v, me)) return true
    if (protests(g, v, me)) return true
  }
  if (cases(g, v, me)) return true
  if (leaks(g, me)) return true
  if (v && v.rank >= 2) {
    if (v.leader && me.legitimacy < 30 && policyOf(g, g.character.countryId).institutions.regime !== 'democracy') {
      const line = foreignReaction(g, .2)
      if (line) { notice(g, 'Sanctions', `Foreign governments acted against your regime.${line}`, { emoji: '🌍', tone: 'bad' }); return true }
    }
  }
  writeMe(g, me)
  return false
}
