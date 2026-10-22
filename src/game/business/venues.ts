// Owner-facing hospitality stories. Entertainment businesses keep their normal corporate
// accounts; these choices change service, staff welfare, reputation and licensed operations.
import { firmCash } from '../cash'
import { addStat, formatMoney, log, notice, scriptChoice, useYearAction, yearActionsUsed } from '../core'
import { isIndustryLegal } from '../data/markets'
import { chance, pick, uid } from '../rng'
import { defineScript } from '../scripts'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { manageBlock } from './gate'
import { bizOf, findBusiness, readBiz, runsIt, totalOutlets, type BizState } from './state'
import { clampN, num, rec, str, toJson } from './util'
import { isVenue } from './venues-data'

type Policy = 'welcoming' | 'curated' | 'members'
type SceneKind = 'guest' | 'staff' | 'neighbour' | 'performer' | 'floor' | 'supplier'
interface VenueScene { token: string; year: number; kind: SceneKind; title: string; text: string }
export interface VenueState {
  v: number; lastYear: number; hospitality: number; safety: number; entertainment: number;
  welfare: number; members: number; visits: number; policy: Policy; pending: VenueScene | null; diary: string[]
}
const SCENE_KINDS: SceneKind[] = ['guest', 'staff', 'neighbour', 'performer', 'floor', 'supplier']

export function venueView(a: Asset): VenueState {
  const r = rec(a.details.venueOwner) ?? {}
  const p = rec(r.pending)
  return {
    v: 1, lastYear: num(r.lastYear, -1), hospitality: clampN(num(r.hospitality, 50), 0, 100),
    safety: clampN(num(r.safety, 55), 0, 100), entertainment: clampN(num(r.entertainment, 50), 0, 100),
    welfare: clampN(num(r.welfare, 60), 0, 100), members: Math.round(clampN(num(r.members), 0, 1e9)),
    visits: Math.round(clampN(num(r.visits), 0, 1e9)),
    policy: ['welcoming', 'curated', 'members'].includes(str(r.policy)) ? r.policy as Policy : 'welcoming',
    pending: p && str(p.token) && SCENE_KINDS.includes(p.kind as SceneKind)
      ? { token: str(p.token), year: num(p.year), kind: p.kind as SceneKind, title: str(p.title).slice(0, 100), text: str(p.text).slice(0, 600) } : null,
    diary: Array.isArray(r.diary) ? r.diary.filter((x): x is string => typeof x === 'string').slice(-8) : [],
  }
}

function save(a: Asset, v: VenueState): void { a.details.venueOwner = toJson(v) }
function diary(v: VenueState, line: string): void { v.diary = [...v.diary, line].slice(-8) }

function current(g: GameState, id: string): { a: Asset; b: BizState; v: VenueState } | null {
  const a = findBusiness(g, id)
  if (!a || manageBlock(g, a)) return null
  const b = readBiz(g, a)
  if (!isVenue(b.industry) || !isIndustryLegal(b.countryId, b.industry, g)) return null
  return { a, b: bizOf(g, a), v: venueView(a) }
}

function atVenue(g: GameState, b: BizState): boolean {
  return b.outlets.some(o => o.count > 0 && o.countryId === g.character.countryId && o.city === g.character.city)
}

function locationNotice(g: GameState, b: BizState): void {
  notice(g, 'Visit the Venue', `Travel to an owned outlet in ${getCountry(b.countryId).name} to meet guests and staff in person. Your manager can handle operations while you are away.`, { emoji: '🌍' })
}

function spendCompany(g: GameState, a: Asset, b: BizState, cost: number): boolean {
  if (!Number.isFinite(cost) || cost <= 0 || b.cash < cost) return false
  firmCash(g, b, -cost, 'capex', a.id); b.yearCosts += cost
  return true
}

export function venueUpgradeCost(b: BizState): number {
  return Math.round(Math.max(2_000, (b.last?.revenue ?? 150_000) * .006) * Math.sqrt(Math.max(1, totalOutlets(b))))
}

const SCENES: Record<SceneKind, { title: string; text: string }> = {
  guest: { title: 'Someone Asked for the Owner', text: 'A regular has brought a group for an important celebration. The host says, “They asked if the owner could come say hello.”' },
  staff: { title: 'The Staff Room', text: 'Your shift leader catches you before opening. “We love the place, but the schedule is wearing people down. Can we talk?”' },
  neighbour: { title: 'A Knock Before Opening', text: 'A neighbour asks to speak to the owner about noise, late crowds and keeping the street pleasant for everyone.' },
  performer: { title: 'Backstage Conversation', text: 'An adult performer asks for clearer boundaries, secure backstage access and fair scheduling. The team is waiting for your answer.' },
  floor: { title: 'The Floor Manager Calls', text: 'A guest disputes a charge and the room is getting tense. Your manager asks whether you want to handle the complaint yourself.' },
  supplier: { title: 'A Local Collaboration', text: 'A local artist proposes a themed evening. They have a loyal following, but the booking and extra staff need a real budget.' },
}

function present(g: GameState, a: Asset, b: BizState, scene: VenueScene): void {
  const cost = venueUpgradeCost(b)
  scriptChoice(g, OWNER_SCRIPT, scene.title, `${a.name}\n\n${scene.text}`, [
    { id: 'listen', label: 'Show up, listen and find a fair solution', emoji: '🤝' },
    ...(b.cash >= cost ? [{ id: 'invest', label: `Back the solution with ${formatMoney(cost)} of company cash`, emoji: '💼' }] : []),
    { id: 'delegate', label: 'Ask the manager to handle it professionally', emoji: '📋' },
    { id: 'dismiss', label: 'Dismiss the request', emoji: '🚪' },
  ], { emoji: a.emoji, data: { assetId: a.id, token: scene.token } })
}

const OWNER_SCRIPT = defineScript('venue.owner.scene', (g, choice, data) => {
  if (!['listen', 'invest', 'delegate', 'dismiss'].includes(choice)) return
  const d = rec(data), live = current(g, str(d?.assetId))
  if (!live) return
  const { a, b, v } = live, scene = v.pending
  if (!scene || scene.token !== d?.token || scene.year !== g.year) return
  if (!atVenue(g, b)) return locationNotice(g, b)
  if (choice === 'invest' && !spendCompany(g, a, b, venueUpgradeCost(b))) {
    notice(g, 'Company Budget Changed', 'The company can no longer fund that option. The request remains in Owner Conversations; you can still listen or delegate.', { emoji: '📋' })
    return
  }
  v.pending = null
  let answer = ''
  if (choice === 'dismiss') {
    v.hospitality = Math.max(0, v.hospitality - 6); v.welfare = Math.max(0, v.welfare - 3)
    b.morale = Math.max(0, b.morale - 3); b.brand = Math.max(0, b.brand - 2)
    answer = 'You made it clear you did not want to hear about it. The conversation ended, but the frustration did not.'
  } else if (choice === 'delegate') {
    const skill = b.manager?.skill ?? b.staff.filter(s => s.focus === 'ops').reduce((best, s) => Math.max(best, s.skill), 40)
    const gain = skill >= 75 ? 5 : 2
    v.hospitality = Math.min(100, v.hospitality + gain)
    answer = skill >= 75 ? 'Your manager resolved the issue and sent a thoughtful follow-up. Delegation paid off.' : 'The team handled the immediate problem, although a personal follow-up would have meant more.'
  } else {
    const gain = choice === 'invest' ? 9 : 4
    v.hospitality = Math.min(100, v.hospitality + gain)
    if (scene.kind === 'staff' || scene.kind === 'performer') {
      v.welfare = Math.min(100, v.welfare + gain); b.morale = Math.min(100, b.morale + 3)
    } else if (scene.kind === 'neighbour' || scene.kind === 'floor') v.safety = Math.min(100, v.safety + gain)
    else if (scene.kind === 'supplier') v.entertainment = Math.min(100, v.entertainment + gain)
    else { v.members += 5; b.brand = Math.min(100, b.brand + 1) }
    answer = choice === 'invest' ? 'You listened, agreed on a practical improvement and funded it. The people doing the work noticed.' : 'You showed up and listened. A small, fair compromise did more for the room than a grand speech.'
    addStat(g, 'happiness', 1)
  }
  diary(v, `${g.year}: ${scene.title} — ${choice}.`); save(a, v)
  log(g, `At ${a.name}, ${scene.title.toLowerCase()}: I chose to ${choice}.`)
  notice(g, 'Being the Owner', `${answer}\n\nHospitality ${Math.floor(v.hospitality)} · safety ${Math.floor(v.safety)} · staff welfare ${Math.floor(v.welfare)}.`, { emoji: a.emoji, tone: choice === 'dismiss' ? 'bad' : 'good' })
})

export function visitVenue(g: GameState, assetId: string, requested?: SceneKind): void {
  const live = current(g, assetId)
  if (!live || (requested !== undefined && !SCENE_KINDS.includes(requested))) return
  const { a, b, v } = live
  if (requested === 'performer' && b.industry !== 'stripClub') return
  if (!atVenue(g, b)) return locationNotice(g, b)
  if (v.pending?.year === g.year) return present(g, a, b, v.pending)
  if (!useYearAction(g, `venue.visit.${a.id}`, 6)) return
  const kinds = b.industry === 'stripClub' ? SCENE_KINDS : SCENE_KINDS.filter(k => k !== 'performer')
  const kind = requested ?? pick(g, kinds)
  const description = SCENES[kind]
  const scene = { token: uid(g, 'venueScene'), year: g.year, kind, ...description }
  v.pending = scene; v.visits += 1; save(a, v); present(g, a, b, scene)
}

export function improveVenue(g: GameState, assetId: string, what: 'safety' | 'entertainment' | 'welfare'): void {
  if (!['safety', 'entertainment', 'welfare'].includes(what)) return
  const live = current(g, assetId)
  if (!live) return
  const { a, b, v } = live
  if (yearActionsUsed(g, `venue.improve.${a.id}`) >= 2) return
  const cost = venueUpgradeCost(b)
  if (!spendCompany(g, a, b, cost)) return notice(g, 'Venue Budget', `The improvement needs ${formatMoney(cost)} in company cash.`, { emoji: '💼' })
  useYearAction(g, `venue.improve.${a.id}`, 2)
  v[what] = Math.min(100, v[what] + 12)
  if (what === 'welfare') b.morale = Math.min(100, b.morale + 4)
  if (what === 'entertainment') b.quality = Math.min(100, b.quality + 2)
  diary(v, `${g.year}: Funded ${what} improvements.`); save(a, v)
  notice(g, 'A Better Night Out', `${formatMoney(cost)} paid by ${a.name}. ${what === 'safety' ? 'Staff trained on de-escalation, access checks and guest safety.' : what === 'welfare' ? 'Fairer scheduling, rest breaks and a trusted staff contact are now in place.' : 'The venue has a stronger entertainment program and upgraded production.'} ${what} is now ${Math.floor(v[what])}/100.`, { emoji: a.emoji, tone: 'good' })
}

export function setVenuePolicy(g: GameState, assetId: string, policy: Policy): void {
  if (!['welcoming', 'curated', 'members'].includes(policy)) return
  const live = current(g, assetId)
  if (!live) return
  live.v.policy = policy; save(live.a, live.v)
  notice(g, 'Guest Experience', `Next year: ${policy === 'welcoming' ? 'welcoming public access: broader appeal' : policy === 'curated' ? 'curated reservations: balanced service and exclusivity' : 'members-first service: smaller crowds, more repeat guests'}. All guests and workers at adult entertainment venues must be adults; policies never waive consent or safety.`, { emoji: '🎟️' })
}

/** Apply one year's hospitality effect before the normal corporate simulation. */
export function prepareVenueYear(g: GameState, a: Asset, b: BizState, year: number): void {
  if (!isVenue(b.industry) || !g.character.alive) return
  const v = venueView(a)
  if (v.lastYear >= year || b.founded > year) return
  v.lastYear = year
  if (!isIndustryLegal(b.countryId, b.industry, g)) {
    b.openFraction = 0
    log(g, `${a.name} cannot trade under this country's simulated venue-licensing rules.`, 'bad')
    save(a, v); return
  }
  const service = (v.hospitality + v.safety + v.entertainment + v.welfare) / 4
  const policy = v.policy === 'welcoming' ? 1.04 : v.policy === 'members' ? .93 : 1
  b.demandShock *= clampN((.8 + service / 250) * policy, .75, 1.25)
  b.morale = clampN(b.morale + (v.welfare - 50) / 12, 0, 100)
  v.members = Math.max(0, Math.round(v.members * .94 + Math.max(0, service - 40) * (v.policy === 'members' ? 4 : 1.5)))
  v.safety = Math.max(0, v.safety - 2); v.entertainment = Math.max(0, v.entertainment - 2); v.welfare = Math.max(0, v.welfare - 1)
  if (v.pending && v.pending.year < g.year) { diary(v, `${g.year}: An unanswered owner request expired.`); v.pending = null }
  if (v.safety < 30 && chance(g, .25)) {
    const cost = Math.min(Math.max(0, b.cash), venueUpgradeCost(b) * 2)
    if (cost > 0) { firmCash(g, b, -cost, 'inputs', a.id); b.yearCosts += cost }
    b.brand = Math.max(0, b.brand - 5)
    diary(v, `${g.year}: A safety complaint cost ${formatMoney(cost)}.`)
    log(g, `${a.name} lost guests after a safety complaint and paid ${formatMoney(cost)} for remediation.`, 'bad')
  }
  save(a, v)
}

export function maybeVenueOwnerEvent(g: GameState, a: Asset, b: BizState, _year: number, managed: boolean): boolean {
  if (!isVenue(b.industry) || !g.character.alive || g.character.prison || g.character.age < 18 || !isIndustryLegal(b.countryId, b.industry, g)) return false
  const v = venueView(a)
  if (managed || !runsIt(g, a) || !atVenue(g, b) || v.pending || !chance(g, .3)) return false
  visitVenue(g, a.id)
  return !!venueView(a).pending
}

export function venueOwnerMenu(a: Asset): MenuGroup {
  return {
    type: 'menu', id: `venue.owner.${a.id}`, label: 'Life as the Owner', emoji: a.emoji,
    subtitle: 'Staff conversations, guest requests, bookings and the floor',
    visible: g => { const cur = findBusiness(g, a.id); return !!cur && isVenue(readBiz(g, cur).industry) },
    disabledReason: g => manageBlock(g, a),
    header: g => {
      const cur = findBusiness(g, a.id)
      if (!cur) return 'You no longer own this venue.'
      const v = venueView(cur)
      return `Hospitality ${Math.floor(v.hospitality)} · safety ${Math.floor(v.safety)} · entertainment ${Math.floor(v.entertainment)} · welfare ${Math.floor(v.welfare)}\n${v.members} members · ${v.policy} service${v.diary.length ? `\n${v.diary.slice(-3).join('\n')}` : ''}`
    },
    children: g => {
      const cur = findBusiness(g, a.id)
      if (!cur) return []
      const v = venueView(cur), b = readBiz(g, cur)
      const actions: [string, string, SceneKind | undefined][] = [
        ['visit', 'Spend an Evening at Your Venue', undefined], ['guest', 'Someone Asked for the Owner', 'guest'],
        ['staff', 'Talk with the Shift Leader', 'staff'], ['floor', b.industry === 'casino' ? 'Walk the Casino Floor' : 'Meet the Guests', 'floor'],
        ['supplier', 'Book a Local Collaboration', 'supplier'], ['neighbour', 'Meet the Neighbours', 'neighbour'],
      ]
      if (b.industry === 'stripClub') actions.push(['performer', 'Hear the Performers', 'performer'])
      const nodes: MenuNode[] = actions.map(([key, label, kind]) => ({
        type: 'action', id: `venue.${key}.${a.id}`, label: key === 'visit' && v.pending?.year === g.year ? 'Continue the Owner Conversation' : label, emoji: '🤝',
        subtitle: `${yearActionsUsed(g, `venue.visit.${a.id}`)}/6 owner visits this year`,
        disabledReason: gg => manageBlock(gg, a) ?? (yearActionsUsed(gg, `venue.visit.${a.id}`) >= 6 && !venueView(cur).pending ? 'You have spent six evenings with the venue this year.' : null),
        run: gg => visitVenue(gg, a.id, kind),
      }))
      for (const what of ['safety', 'entertainment', 'welfare'] as const) nodes.push({
        type: 'action', id: `venue.upgrade.${what}.${a.id}`, label: what === 'safety' ? 'Train Security & Guest Safety' : what === 'welfare' ? 'Improve Staff & Performer Welfare' : 'Upgrade the Entertainment Program', emoji: '🛠️',
        subtitle: `${formatMoney(venueUpgradeCost(b))} · ${v[what]}/100 · two improvements/year`,
        disabledReason: gg => manageBlock(gg, a) ?? (yearActionsUsed(gg, `venue.improve.${a.id}`) >= 2 ? 'Both venue improvements are used this year.' : null),
        confirm: () => `Pay ${formatMoney(venueUpgradeCost(b))} from company cash for ${what}?`, run: gg => improveVenue(gg, a.id, what),
      })
      for (const policy of ['welcoming', 'curated', 'members'] as const) nodes.push({
        type: 'action', id: `venue.policy.${policy}.${a.id}`, label: `${policy === v.policy ? '✓ ' : ''}${policy === 'welcoming' ? 'Welcoming Public Access' : policy === 'curated' ? 'Curated Reservations' : 'Members-First Service'}`, emoji: '🎟️',
        disabledReason: gg => manageBlock(gg, a), run: gg => setVenuePolicy(gg, a.id, policy),
      })
      return nodes
    },
  }
}
