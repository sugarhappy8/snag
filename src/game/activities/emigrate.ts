// Emigrate: pick a country and see every way in for you, this year: free movement, points tests,
// sponsored work, study, marriage, family, golden visas, retirement and remote-worker visas,
// asylum, lotteries (and why the closed ones are closed), with the odds, the costs, the wait and
// the road to permanent residency and citizenship. Apply, or sneak in. "Your Status" shows the
// passports you hold and your legal status where you live; countries that won't let their
// citizens leave get exit-visa and escape options instead.
// Moving ends your jobs (a remote job comes along), brings your partner (if they agree) and minor
// kids, and leaves the rest of the family behind (person.data.countryId = the old country).
import { lawOf, passportStrength, passportWord, type InvestKind } from '../data/immigration'
import { localTerm } from '../data/locales'
import { offerCitizenship, yearsToCitizenship } from '../immigration'
import { chance } from '../rng'
import { COUNTRIES, CONTINENTS, getCountry, type Country } from '../world'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { firstReason, gate, money } from './common'
import {
  appliedThisYear,
  applyRoute,
  attemptEscape,
  escapeOdds,
  exitPermitOdds,
  requestExitPermit,
  sneakHint,
  sneakIn,
  sneakOdds,
  upfrontCost,
} from './immigration-apply'
import { deport, homeCountryFor, leaveFor, lockAssets, movingFamily, relocationCost } from './immigration-move'
import { bestRoute, bestRouteHint, investHint, investKindWord, natzYearsFor, routesTo, type RouteEval } from './immigration-routes'
import {
  bestPassport,
  citizenshipsOf,
  exitRegime,
  exitWindow,
  immState,
  isBanned,
  isCitizenOf,
  personCitizenships,
  setStatus,
  statusLabel,
  statusOf,
  updateImm,
  expandCitizenships,
} from './immigration-state'
import { currentPartner, log, notice } from '../core'

export { relocationCost }

function schoolBlock(g: GameState): string | null {
  const cur = g.character.education.current
  if (!cur) return null
  if (cur.level === 'high' || cur.level === 'middle' || cur.level === 'elementary' || cur.level === 'preschool') {
    return `You need to finish (or drop out of) ${localTerm(g, 'high')} before you can emigrate.`
  }
  return 'You need to finish (or drop out of) school before you can emigrate.'
}

export function emigrateBlock(g: GameState): string | null {
  return firstReason(gate(g, { minAge: 18 }), schoolBlock(g))
}

// ---------------------------------------------------------------------------
// Route evaluation, cached per committed state (menus re-ask the same questions many times)

const routeCache = new WeakMap<GameState, { sig: string; byDest: Map<string, RouteEval[]> }>()

function stateSig(g: GameState): string {
  const c = g.character
  const p = currentPartner(g)
  return [
    g.year,
    c.age,
    c.money,
    c.countryId,
    g.assets.length,
    g.assets.reduce((s, a) => s + a.value, 0),
    g.people.length,
    p ? `${p.id}:${p.relation}` : '',
    c.criminalRecord.length,
    c.job?.defId ?? '',
    c.job?.salary ?? 0,
    c.education.degrees.length,
    (c.citizenships ?? []).join(','),
    c.immigration ? `${c.immigration.status}:${c.immigration.visa ?? ''}` : '',
    JSON.stringify(g.flags.imm ?? null),
    c.pension,
    c.wantedLevel,
  ].join('|')
}

function routesFor(g: GameState, dest: string): RouteEval[] {
  const sig = stateSig(g)
  let hit = routeCache.get(g)
  if (!hit || hit.sig !== sig) {
    hit = { sig, byDest: new Map() }
    routeCache.set(g, hit)
  }
  let list = hit.byDest.get(dest)
  if (!list) {
    list = routesTo(g, dest)
    hit.byDest.set(dest, list)
  }
  return list
}

function routeFor(g: GameState, dest: string, key: string): RouteEval | undefined {
  return routesFor(g, dest).find((r) => r.key === key)
}

const pct = (p: number) => `${Math.round(p * 100)}%`

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function waitText(r: RouteEval): string {
  return r.wait === 0 ? 'decided now' : `decision in ${r.wait} yr`
}

function prText(r: RouteEval): string {
  if (r.result === 'citizen') return 'passport on arrival'
  if (r.toPr === 0) return 'PR on arrival'
  if (r.toPr === null) return 'no PR path'
  return `PR in ${r.toPr} yr`
}

function routeSubtitle(r: RouteEval): string {
  if (!r.ok) return r.why.length > 90 ? `${r.why.slice(0, 87)}...` : r.why
  const cost = r.fee + r.invest
  const bits = [r.id === 'citizen' ? 'no visa needed' : `${pct(r.odds)} odds`, cost > 0 ? `${money(cost)}${r.invest > 0 ? ' incl. investment' : ' fees'}` : r.id === 'citizen' ? '' : 'no fee', waitText(r), prText(r)]
  if (r.id === 'citizen') bits.splice(2, 1)
  return bits.filter(Boolean).join(' · ')
}

function confirmText(g: GameState, r: RouteEval): string {
  const country = getCountry(r.dest)
  const cost = upfrontCost(g, r)
  const lines: string[] = []
  if (r.wait > 0 || !r.moves) {
    lines.push(`${r.id === 'lottery' ? `Enter the ${r.noun}` : `Apply for ${article(r.noun)} ${r.noun} to ${country.name}`}?${r.fee > 0 ? ` Fees: ${money(r.fee)} (non-refundable).` : ''} The decision comes in ${g.year + Math.max(1, r.wait)}; if approved, you'll be asked whether to move.`)
  } else if (r.id === 'asylum') {
    lines.push(`Travel to ${country.name} and claim asylum? Getting there costs about ${money(cost.reloc)}. You'll wait there for the decision.`)
  } else {
    lines.push(`${r.id === 'citizen' ? `Move to ${country.name}` : `Apply for ${article(r.noun)} ${r.noun} to ${country.name}`}? Odds: ${pct(r.odds)}.`)
    const parts = [r.fee > 0 ? `${money(r.fee)} in fees (non-refundable)` : '', r.invest > 0 ? `${money(r.invest)} ${r.investKind === 'fee' ? 'payment' : `locked in ${investKindWord(r.investKind as InvestKind)} for ${r.lockYears} years`}` : '', `${money(cost.reloc)} to move`, cost.tax > 0 ? `${money(cost.tax)} in exit tax` : ''].filter(Boolean)
    lines.push(`If approved you pay ${parts.join(', ')}.`)
  }
  if (r.proof > 0) lines.push(`You must show ${money(r.proof)} in the bank (you keep it).`)
  if (!r.keepJob && (g.character.job || g.character.partTimeJob) && r.moves) lines.push('Moving ends your current job.')
  return lines.join(' ')
}

/** The best open route and a one-line summary for the country row. */
function countrySubtitle(g: GameState, country: Country): string {
  const routes = routesFor(g, country.id)
  const best = bestRoute(routes)
  if (!best) return isBanned(g, country.id) ? `Banned until ${(isBanned(g, country.id) ?? g.year) + 1}` : 'No open route for you'
  if (best.id === 'citizen') return `${best.label} · no visa needed`
  const more = routes.filter((r) => r.ok).length - 1
  return `${best.label} · ${pct(best.odds)}${more > 0 ? ` · +${more} more` : ''}`
}

function countryFacts(g: GameState, country: Country): MenuNode[] {
  const year = g.year
  const law = lawOf(country.id)
  const pass = bestPassport(g)
  const natz = natzYearsFor(g, country.id)
  const nodes: MenuNode[] = []
  nodes.push({ type: 'info', id: `imm.facts.${country.id}.pass`, emoji: '\u{1F6C2}', text: `Your ${getCountry(pass.id).demonym} passport is ${passportWord(pass.strength)} (${pass.strength}/100). ${pass.strength < 45 ? 'Weak passports mean lower odds and slower checks.' : ''}`.trim() })
  const dual = expandCitizenships(citizenshipsOf(g), year).includes(country.id)
    ? ''
    : natz === null
      ? `${country.name} practically never naturalizes foreigners.`
      : `Citizenship after about ${natz} year${natz === 1 ? '' : 's'}${law.natzFrom === 'pr' ? ' as a permanent resident' : ' of residence'}; dual citizenship ${dualWord(country.id, year)}.`
  if (dual) nodes.push({ type: 'info', id: `imm.facts.${country.id}.natz`, emoji: '\u{1F5F3}\u{FE0F}', text: dual })
  return nodes
}

function dualWord(id: string, year: number): string {
  const rule = (lawOf(id).dual.filter(([y]) => year >= y).pop() ?? lawOf(id).dual[0])[1]
  return rule === 'yes' ? 'allowed' : rule === 'no' ? 'not allowed (you give up your other passports)' : 'only allowed in some cases'
}

function routeAction(dest: string, r: RouteEval): MenuAction {
  const key = r.key
  return {
    type: 'action',
    id: `emigrate.${dest}.${key}`,
    label: r.label,
    emoji: r.emoji,
    subtitle: (s) => {
      const cur = routeFor(s, dest, key)
      return cur ? routeSubtitle(cur) : ''
    },
    disabledReason: (s) => {
      const cur = routeFor(s, dest, key)
      if (!cur) return 'Not available anymore.'
      if (!cur.ok) return cur.why
      if (appliedThisYear(s, dest, cur)) return `${getCountry(dest).name} already reviewed your application this year.`
      return null
    },
    hint: (s) => {
      const cur = routeFor(s, dest, key)
      if (!cur || !cur.ok) return null
      return investHint(s, cur) || null
    },
    confirm: (s) => {
      const cur = routeFor(s, dest, key)
      return cur ? confirmText(s, cur) : null
    },
    run: (d) => applyRoute(d, dest, key),
  }
}

function sneakAction(dest: string): MenuAction {
  const country = getCountry(dest)
  return {
    type: 'action',
    id: `emigrate.${dest}.sneak`,
    label: 'Get in without a visa',
    emoji: '\u{1F977}',
    visible: (s) => !isCitizenOf(s, dest) && !exitBlocked(s),
    subtitle: (s) => {
      const o = sneakOdds(s, dest)
      return `${o.overstay ? 'Fly in as a tourist and never leave' : 'Sneak across the border'} · about ${pct(o.odds)} · undocumented life`
    },
    disabledReason: (s) => ((s.yearActions[`imm.sneak.${dest}`] ?? 0) > 0 ? "You've already tried that this year." : null),
    hint: (s) => sneakHint(s, dest) || null,
    confirm: () => `Try to get into ${country.name} without permission? You'd live there undocumented: no legal job, the risk of deportation every year, and a ban if you're caught.`,
    run: (d) => sneakIn(d, dest),
  }
}

function escapeAction(dest: string): MenuAction {
  const country = getCountry(dest)
  return {
    type: 'action',
    id: `emigrate.${dest}.escape`,
    label: 'Escape across the border',
    emoji: '\u{1F3C3}',
    visible: (s) => exitBlocked(s) && !isCitizenOf(s, dest),
    subtitle: (s) => `About ${pct(escapeOdds(s, dest))} · if caught, you're arrested`,
    disabledReason: (s) => ((s.yearActions[`imm.escape.${dest}`] ?? 0) > 0 ? "You've already tried to escape this year." : null),
    confirm: () => `Try to escape to ${country.name}? Getting caught at the border means prison.`,
    run: (d) => attemptEscape(d, dest),
  }
}

function exitBlocked(g: GameState): boolean {
  return !!exitRegime(g.character.countryId, g.year) && immState(g).exitPermit !== g.year
}

function countryNode(country: Country): MenuGroup {
  return {
    type: 'menu',
    id: `emigrate.${country.id}`,
    label: country.name,
    emoji: country.flag,
    subtitle: (s) => countrySubtitle(s, country),
    hint: (s) => bestRouteHint(s, routesFor(s, country.id)) || null,
    header: (s) => {
      const fam = movingFamily(s)
      const bits = [fam.partner ? fam.partner.firstName : '', fam.kids.length ? `${fam.kids.length} kid${fam.kids.length > 1 ? 's' : ''}` : ''].filter(Boolean)
      return `${country.flag} Every way into ${country.name} for you in ${s.year}. Moving costs about ${money(relocationCost(s, country))}${bits.length ? ` (with ${bits.join(' and ')})` : ''}.`
    },
    children: (s) => {
      const routes = routesFor(s, country.id)
      const nodes: MenuNode[] = [...countryFacts(s, country)]
      const open = routes.filter((r) => r.ok)
      const shut = routes.filter((r) => !r.ok)
      if (open.length) nodes.push({ type: 'heading', id: `imm.h.open.${country.id}`, label: 'Routes Open to You' })
      for (const r of open) nodes.push(routeAction(country.id, r))
      if (shut.length) nodes.push({ type: 'heading', id: `imm.h.shut.${country.id}`, label: 'Closed to You (and Why)' })
      for (const r of shut) nodes.push(routeAction(country.id, r))
      if (!routes.length) nodes.push({ type: 'info', id: `imm.none.${country.id}`, emoji: '\u{1F6AB}', text: `No legal route into ${country.name} applies to you right now.` })
      nodes.push({ type: 'heading', id: `imm.h.other.${country.id}`, label: 'Other Ways In' })
      nodes.push(sneakAction(country.id), escapeAction(country.id))
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Your status

function statusNodes(g: GameState): MenuNode[] {
  const c = g.character
  const s = statusOf(g)
  const st = immState(g)
  const held = citizenshipsOf(g)
  const here = getCountry(c.countryId)
  const nodes: MenuNode[] = []
  const passLine = held.map((id) => `${getCountry(id).flag} ${getCountry(id).demonym} (${passportStrength(id, g.year)}/100)`).join(', ')
  nodes.push({ type: 'info', id: 'imm.st.pass', emoji: '\u{1F6C2}', text: `Passport${held.length > 1 ? 's' : ''}: ${passLine}` })
  nodes.push({ type: 'info', id: 'imm.st.status', emoji: '\u{1F4CD}', text: `In ${here.name}: ${statusLabel(s)}${s.status !== 'citizen' ? ` since ${s.status === 'undocumented' ? st.arrived : s.since}` : ''}. You pay taxes here (taxes follow where you live).` })
  if (s.status !== 'citizen') {
    const y = yearsToCitizenship(g)
    nodes.push({ type: 'info', id: 'imm.st.natz', emoji: '\u{1F5F3}\u{FE0F}', text: y === null ? (s.status === 'undocumented' ? 'No path to citizenship without papers.' : `${here.name} offers you no path to citizenship on this status.`) : y === 0 ? 'You can apply for citizenship now.' : `Citizenship possible in about ${y} year${y === 1 ? '' : 's'}.` })
  }
  if (s.status === 'undocumented') nodes.push({ type: 'info', id: 'imm.st.undoc', emoji: '\u{26A0}\u{FE0F}', text: 'Without papers you can only work cash-in-hand jobs, and immigration agents could catch up with you any year.' })
  for (const a of st.apps) nodes.push({ type: 'info', id: `imm.st.app.${a.id}`, emoji: '\u{1F4E8}', text: `${a.label} → ${getCountry(a.dest).name}: decision in ${a.decide}.` })
  for (const a of lockAssets(g)) nodes.push({ type: 'info', id: `imm.st.lock.${a.id}`, emoji: '\u{1F512}', text: `${a.name}: worth ${money(a.value)}, unlocks in ${typeof a.details.until === 'number' ? a.details.until : g.year}.` })
  for (const [id, until] of Object.entries(st.bans)) if (until >= g.year) nodes.push({ type: 'info', id: `imm.st.ban.${id}`, emoji: '\u{26D4}', text: `Banned from ${getCountry(id).name} until ${until + 1}.` })
  const partner = currentPartner(g)
  if (partner && partner.alive) nodes.push({ type: 'info', id: 'imm.st.partner', emoji: '\u{1F491}', text: `${partner.firstName}: ${personCitizenships(g, partner).map((id) => getCountry(id).demonym).join(' and ')} citizen.` })

  nodes.push({
    type: 'action',
    id: 'imm.st.citizenship',
    label: 'Apply for citizenship',
    emoji: '\u{1F5F3}\u{FE0F}',
    visible: (x) => statusOf(x).status === 'permanent' && yearsToCitizenship(x) === 0,
    disabledReason: (x) => (x.character.age < 18 ? 'You must be an adult to naturalize.' : (immState(x).citizenAsk ?? 0) > x.year ? `You can apply again in ${immState(x).citizenAsk}.` : null),
    run: (d) => offerCitizenship(d),
  })
  nodes.push({
    type: 'action',
    id: 'imm.st.marriage',
    label: 'Legalize through your marriage',
    emoji: '\u{1F48D}',
    visible: (x) => {
      const p = currentPartner(x)
      return statusOf(x).status === 'undocumented' && !!p && p.relation === 'spouse' && expandCitizenships(personCitizenships(x, p), x.year).includes(x.character.countryId)
    },
    subtitle: (x) => `About ${pct(marriageOdds(x))} · ${money(marriageFee(x))}`,
    disabledReason: (x) => ((x.yearActions['imm.legalize'] ?? 0) > 0 ? 'Your case is already with the immigration office this year.' : null),
    confirm: (x) => `Apply for papers through your marriage for ${money(marriageFee(x))}? If it fails, you've told the government exactly where you live.`,
    run: (d) => legalizeByMarriage(d),
  })
  nodes.push({
    type: 'action',
    id: 'imm.st.leave',
    label: `Go home to ${getCountry(homeCountryFor(g)).name}`,
    emoji: '\u{1F9F3}',
    visible: (x) => statusOf(x).status !== 'citizen' && homeCountryFor(x) !== x.character.countryId,
    confirm: (x) => {
      const ban = overstayBan(x)
      return `Leave ${getCountry(x.character.countryId).name} and move to ${getCountry(homeCountryFor(x)).name}?${ban > 0 ? ` After your time without papers, you'll be banned from coming back for ${ban} years.` : ''}`
    },
    run: (d) => {
      const home = homeCountryFor(d)
      if (home === d.character.countryId) return
      if (d.character.money < relocationCost(d, getCountry(home))) {
        notice(d, 'Going Home', `You can't afford the ${money(relocationCost(d, getCountry(home)))} it costs to move.`, { emoji: '\u{1F4B8}', tone: 'bad' })
        return
      }
      d.character.money = Math.round(d.character.money - relocationCost(d, getCountry(home)))
      leaveFor(d, home, `You decided it was time to go home.`, overstayBan(d))
    },
  })
  return nodes
}

function overstayBan(g: GameState): number {
  const s = statusOf(g)
  if (s.status !== 'undocumented') return 0
  const yrs = g.year - immState(g).arrived
  if (yrs < 1) return 0
  return g.character.countryId === 'us' || g.character.countryId === 'pr' ? 10 : 5
}

function marriageFee(g: GameState): number {
  return Math.round(1_500 * Math.max(0.5, getCountry(g.character.countryId).wealth) / 50) * 50
}

function marriageOdds(g: GameState): number {
  const st = immState(g)
  const usBorder = (g.character.countryId === 'us' || g.character.countryId === 'pr') && st.entry !== 'overstay'
  const crimes = g.character.criminalRecord.some((r) => r.convicted)
  return Math.max(0.05, (usBorder ? 0.3 : st.entry === 'overstay' ? 0.8 : 0.6) * (crimes ? 0.5 : 1))
}

function legalizeByMarriage(g: GameState): void {
  const c = g.character
  const fee = marriageFee(g)
  if (c.money < fee) {
    notice(g, 'Legal Fees', `You need ${money(fee)} for the application and the lawyer.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  g.yearActions['imm.legalize'] = 1
  c.money = Math.round(c.money - fee)
  const country = getCountry(c.countryId)
  if (chance(g, marriageOdds(g))) {
    const direct = ['us', 'pr', 'ca', 'nz'].includes(c.countryId)
    setStatus(g, direct ? { status: 'permanent', since: g.year } : { status: 'visa', visa: 'spouse', since: g.year, expires: g.year + 2 })
    updateImm(g, (s) => {
      s.entry = undefined
      s.visaSince = g.year
      if (direct) s.prSince = g.year
    })
    log(g, `I got legal status in ${country.name} through my marriage.`, 'good')
    notice(g, 'Papers at Last', direct ? `Your marriage-based application was approved: you're a permanent resident of ${country.name}.` : `Your marriage-based application was approved: you have a spouse visa.`, { emoji: '\u{1F48D}', tone: 'good' })
    return
  }
  if (chance(g, 0.25)) {
    deport(g, 'Your marriage-based application was denied, and the denial came with a removal order.', 10)
    return
  }
  log(g, `My marriage-based application in ${country.name} was denied.`, 'bad')
  notice(g, 'Application Denied', 'Your marriage-based application was denied. At least they didn\'t come knocking. Yet.', { emoji: '\u{1F4ED}', tone: 'bad' })
}

function showStatusGroup(g: GameState): boolean {
  const c = g.character
  return statusOf(g).status !== 'citizen' || citizenshipsOf(g).length > 1 || immState(g).apps.length > 0 || lockAssets(g).length > 0 || (c.birthCountryId !== '' && c.birthCountryId !== c.countryId)
}

// ---------------------------------------------------------------------------
// Exit regimes

function exitNodes(g: GameState): MenuNode[] {
  const regime = exitRegime(g.character.countryId, g.year)
  if (!regime) return []
  const w = exitWindow(regime, g.year)
  const permit = immState(g).exitPermit === g.year
  const nodes: MenuNode[] = [{ type: 'info', id: 'imm.exit.note', emoji: permit ? '\u{2705}' : '\u{1F6A7}', text: permit ? 'Your exit visa is good for this year. Apply to move abroad before it runs out.' : `${regime.note}${w ? ` ${w.note}` : ''}` }]
  if (!permit) {
    nodes.push({
      type: 'action',
      id: 'imm.exit.permit',
      label: 'Apply for an exit visa',
      emoji: '\u{1F4DC}',
      subtitle: (x) => `About ${pct(exitPermitOdds(x))} · refusal can cost you your job`,
      disabledReason: (x) => ((x.yearActions['imm.exitpermit'] ?? 0) > 0 ? 'The ministry already answered you this year.' : null),
      run: (d) => requestExitPermit(d),
    })
  }
  return nodes
}

// ---------------------------------------------------------------------------
// The menu

/** The easiest destinations for this character, best odds first (excluding where they live). */
function easiest(g: GameState, n: number): Country[] {
  const scored: { c: Country; score: number }[] = []
  for (const c of COUNTRIES) {
    if (c.id === g.character.countryId) continue
    const best = bestRoute(routesFor(g, c.id))
    if (!best) continue
    scored.push({ c, score: best.odds - best.wait * 0.05 + (best.toPr === 0 ? 0.05 : 0) + (c.wealth ?? 0) * 0.08 })
  }
  return scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)).slice(0, n).map((x) => x.c)
}

export const emigrateMenu: MenuGroup = {
  type: 'menu',
  id: 'emigrate',
  label: 'Emigrate',
  emoji: '\u{1F6C2}',
  subtitle: 'Move to another country',
  disabledReason: emigrateBlock,
  header: (g) => {
    const fam = movingFamily(g)
    const bits = [fam.partner ? `${fam.partner.firstName}` : '', fam.kids.length ? `${fam.kids.length} kid${fam.kids.length > 1 ? 's' : ''}` : ''].filter(Boolean)
    const held = citizenshipsOf(g).map((id) => getCountry(id).demonym).join(' and ')
    return `Pick a country to see every way in for a ${held} passport holder in ${g.year}: the odds, the costs and the wait. Moving ends your job${bits.length ? ` and includes ${bits.join(' and ')}` : ''}.`
  },
  children: (g): MenuNode[] => {
    const nodes: MenuNode[] = []
    if (showStatusGroup(g)) {
      nodes.push({
        type: 'menu',
        id: 'emigrate.status',
        label: 'Your Status',
        emoji: '\u{1F4C7}',
        subtitle: (x) => `${statusLabel(statusOf(x))} in ${getCountry(x.character.countryId).name}`,
        children: statusNodes,
      })
    }
    nodes.push(...exitNodes(g))
    const top = easiest(g, 6)
    if (top.length) {
      nodes.push({ type: 'heading', id: 'emigrate.h.easy', label: 'Easiest Moves for You' })
      for (const c of top) nodes.push(countryNode(c))
    }
    nodes.push({ type: 'heading', id: 'emigrate.h.all', label: 'All Countries' })
    for (const cont of CONTINENTS) {
      const list = COUNTRIES.filter((c) => c.continent === cont && c.id !== g.character.countryId).sort((a, b) => a.name.localeCompare(b.name))
      if (!list.length) continue
      nodes.push({
        type: 'menu',
        id: `emigrate.cont.${cont}`,
        label: cont,
        emoji: CONTINENT_EMOJI[cont] ?? '\u{1F30D}',
        subtitle: `${list.length} countries`,
        children: (x) => COUNTRIES.filter((c) => c.continent === cont && c.id !== x.character.countryId).sort((a, b) => a.name.localeCompare(b.name)).map(countryNode),
      })
    }
    return nodes
  },
}

const CONTINENT_EMOJI: Record<string, string> = {
  'North America': '\u{1F5FD}',
  'South America': '\u{1F99C}',
  Europe: '\u{1F3F0}',
  Africa: '\u{1F981}',
  'Middle East': '\u{1F54C}',
  Asia: '\u{1F3EF}',
  Oceania: '\u{1F3DD}\u{FE0F}',
}
