import { addStat, earnIncome, formatMoney, log, notice, spend, useYearAction, yearActionsUsed } from './core'
import { bound, economicRoll } from './economy'
import { INVENTION_FIELDS, inventionResearchRule, inventionTopic, isInventionField, type InventionField } from './inventor-data'
import { inventorView, saveInventor, type InventorEvent, type InventorProfile } from './inventor-state'
import { INVENTION_TIERS, nationalPatentLaw } from './business/inventions'
import { addFame, blocked, ownerKey } from './special/common'
import { hasTalent } from './talents'
import { recordInventionAdoption } from './invention-adoption'
import type { GameState, MenuNode } from './types'

export function inventorJournal(g: GameState, p: InventorProfile, message: string): void {
  p.journal = [...p.journal, `${g.year}: ${message}`].slice(-12)
}
export function gainInventorExpertise(p: InventorProfile, field: InventionField, amount: number): void {
  p.expertise[field] = bound((p.expertise[field] ?? 0) + amount, 0, 100)
}
const BACKGROUNDS: Record<InventionField, RegExp> = {
  finance: /finance|econom|account|mathematic|statistic|bank|invest|quant/i,
  energy: /electrical|mechanical|energy|physics|electrician|power/i,
  materials: /materials|mechanical|chemistry|chemical|machinist|carpenter/i,
  computing: /computer|software|electronic|program|data|mathematic/i,
  health: /medical|medicine|biolog|biomed|nurs|doctor|physiotherap/i,
  food: /agricultur|food|botan|horticultur|farm|chemical/i,
  transport: /mechanical|aero|automotive|transport|mechanic|aviation/i,
  consumer: /design|industrial|mechanical|engineer|plumb|carpen/i,
}
/** Formal education and relevant practical work help; a degree is not compulsory. */
export function inventorBackground(g: GameState, field: InventionField): number {
  const pattern = BACKGROUNDS[field], c = g.character
  const degree = c.education.degrees.some(d => pattern.test(`${d.name} ${d.major ?? ''}`))
  const job = !!c.job && pattern.test(`${c.job.title} ${c.job.defId}`)
  return (degree ? 2 : 0) + (job ? 2 : 0)
}
export function tinkerInvention(g: GameState, field: InventionField): boolean {
  if (!isInventionField(field) || blocked(g, 8) || !hasTalent(g, 'Inventor') || yearActionsUsed(g, 'inventor.tinker') >= 2) return false
  const p = inventorView(g)
  useYearAction(g, 'inventor.tinker', 2)
  gainInventorExpertise(p, field, 4); addStat(g, 'smarts', 1)
  inventorJournal(g, p, field === 'finance' ? 'Practiced probability, bookkeeping and paper portfolios using public historical data.' : `Repaired and studied everyday ${field} equipment; learned from what failed.`)
  saveInventor(g, p)
  notice(g, 'A Working Notebook', `${field === 'finance' ? 'Using public records and a paper portfolio, you practiced risk estimation and tested your assumptions without investing real money.' : `Using borrowed tools and discarded parts, you learned how a real ${field} problem works.`} Field expertise +4. This practice is free; it creates knowledge rather than a patent or a sale.`, { emoji: '🛠️' })
  return true
}

export function inventorGrantQuote(g: GameState, topicId: string) {
  const topic = inventionTopic(topicId), rule = inventionResearchRule(topicId), p = inventorView(g)
  if (!topic || !rule) return null
  if (topic.field === 'finance') return { amount: 0, odds: 0, reason: 'Closed-loop research stays confidential and uses personal or company funds, without public grants.' }
  const expertise = p.expertise[topic.field] ?? 0, study = p.studies.find(s => s.topic === topicId)
  const amount = Math.round(INVENTION_TIERS[topic.tier].minimum * .65 + nationalPatentLaw(g.character.countryId, g.year).filingCost)
  const odds = bound(.3 + expertise * .004 + p.reputation * .003 - (rule.speculative ? .2 : 0), .1, .9)
  if (p.work.some(work => work.topic === topicId)) return { amount, odds, reason: 'You already developed this idea; research grants fund new work.' }
  const reason = blocked(g, 16) ?? (!hasTalent(g, 'Inventor') ? 'Requires the Inventor talent.' : p.project ? 'Finish or shelve your active project before applying.' : p.grant && p.grant.expires >= g.year ? 'Use your existing restricted research grant first.' : g.year < rule.availableFrom ? `The required research infrastructure becomes available in ${rule.availableFrom}.` : !study || study.points < rule.study || g.year - study.year > 3 || study.year > g.year ? `Your proposal needs ${rule.study} recent topic-study points.` : expertise < Math.max(12, rule.expertise) ? `Build field expertise to ${Math.max(12, rule.expertise)} before submitting a proposal.` : yearActionsUsed(g, 'inventor.grant') ? 'One grant application per year; improve the proposal and retry next year.' : null)
  return { amount, odds, reason }
}
export function applyInventorGrant(g: GameState, topicId: string): boolean {
  const q = inventorGrantQuote(g, topicId)
  if (!q || q.reason) return false
  useYearAction(g, 'inventor.grant', 1)
  const p = inventorView(g), approved = economicRoll(`${g.lifeId}|${ownerKey(g)}|inventor-grant|${g.year}|${topicId}`) < q.odds
  if (approved) p.grant = { topic: topicId, amount: q.amount, expires: g.year + 2 }
  else gainInventorExpertise(p, inventionTopic(topicId)!.field, 2)
  inventorJournal(g, p, approved ? `A research fund committed ${formatMoney(q.amount)} to ${inventionTopic(topicId)!.name}.` : 'Reviewers declined my grant proposal; their feedback improved my understanding.')
  saveInventor(g, p)
  notice(g, approved ? 'Research Grant Awarded' : 'Proposal Declined', approved ? `A research fund will pay up to ${formatMoney(q.amount)} directly toward this topic's next project. You retain the IP. The award expires after ${g.year + 2}; it cannot be withdrawn as personal cash, moved to another topic, or refunded after spending. Choose your research approach to see your remaining contribution.` : 'The panel was not persuaded by the evidence. You gained 2 field-expertise points from its feedback. You may fund the work yourself, strengthen the proposal, or apply next year.', { emoji: '📋', tone: approved ? 'good' : 'neutral' })
  return true
}

/** Called only inside an already-claimed product/royalty settlement. Credit follows
 * the creator's career even after company assignment, never the inheriting player. */
export function recordInventorAdoption(g: GameState, id: string, units: number, royalties = 0, evidenceBased = false, fiscal = g.year): void {
  if (!Number.isFinite(units) || units < 0 || !Number.isFinite(royalties) || royalties < 0) return
  if (evidenceBased) recordInventionAdoption(g, id, units, fiscal)
  const p = inventorView(g), work = p.work.find(w => w.id === id)
  if (!work) return
  work.units = Math.min(1e15, work.units + units); work.royalties = Math.min(1e15, work.royalties + royalties)
  const recognition = work.units >= 1_000_000 ? 3 : work.units >= 10_000 ? 2 : work.units >= 100 ? 1 : 0
  if (recognition > work.recognition) {
    const gain = recognition - work.recognition
    work.recognition = recognition; p.reputation = Math.min(100, p.reputation + gain * 10); addFame(g, gain * 3)
    inventorJournal(g, p, `${work.name} reached ${Math.floor(work.units).toLocaleString('en-US')} users; my practical work earned recognition.`)
    log(g, `${work.name} is being used in the real world. My reputation as an inventor grew.`, 'good')
  }
  saveInventor(g, p)
}

function eventText(event: InventorEvent): string {
  switch (event.kind) {
    case 'mentor': return 'An experienced maker offers to work through your notebook and explain the experiments that failed in their own career.'
    case 'conference': return 'A technical society has invited you to demonstrate your patented work. Honest results could connect you with engineers and customers.'
    case 'consulting': return 'A manufacturer wants a paid, short consulting engagement. The fee compensates real work; it will take time and energy away from your own research.'
    case 'credit': return 'A research collaborator says a profile of your work left out their contribution. Your patents are intact, but your professional reputation is at stake.'
    case 'promoter': return 'A promotion agency promises to get your invention in front of major buyers if you first pay a large marketing fee. It has supplied no verified sales record.'
  }
}
function eventOptions(g: GameState, event: InventorEvent) {
  const p = inventorView(g)
  switch (event.kind) {
    case 'mentor': return [{ id: 'accept', label: 'Work with the mentor', cost: 0 }, { id: 'decline', label: 'Keep working independently', cost: 0 }]
    case 'conference': return [{ id: 'accept', label: 'Show the evidence and credit the team', cost: 300 }, { id: 'decline', label: 'Decline the invitation', cost: 0 }]
    case 'consulting': return [{ id: 'accept', label: `Do the work for ${formatMoney(1000 + p.reputation * 150)}`, cost: 0 }, { id: 'decline', label: 'Protect time for my own research', cost: 0 }]
    case 'credit': return [{ id: 'credit', label: 'Correct the profile and credit the collaborator', cost: 0 }, { id: 'review', label: 'Commission an independent notebook review', cost: 500 }, { id: 'claim', label: 'Insist I deserve all the credit', cost: 0 }]
    case 'promoter': return [{ id: 'verify', label: 'Pay for independent due diligence', cost: 150 }, { id: 'accept', label: 'Pay the unproven promotion fee', cost: 2500 }, { id: 'decline', label: 'Decline the offer', cost: 0 }]
  }
}
export function resolveInventorEvent(g: GameState, token: string, choice: string): boolean {
  const p = inventorView(g), event = p.event
  if (!event || event.token !== token || event.year !== g.year || blocked(g, event.kind === 'mentor' ? 8 : 18)) return false
  const option = eventOptions(g, event).find(o => o.id === choice)
  if (!option || !spend(g, option.cost)) return false
  let result = 'I declined the offer and kept my time and money.'
  if (event.kind === 'mentor' && choice === 'accept') { gainInventorExpertise(p, event.field, 8); p.strain = Math.max(0, p.strain - 5); result = 'A mentor helped me understand failed experiments. Field expertise +8; strain -5.' }
  if (event.kind === 'conference' && choice === 'accept') { p.reputation += 5; gainInventorExpertise(p, event.field, 3); result = 'I presented reproducible results and met potential partners. Reputation +5; expertise +3. The demonstration itself made no sales.' }
  if (event.kind === 'consulting' && choice === 'accept') { const fee = 1000 + p.reputation * 150; earnIncome(g, fee); p.strain += 18; result = `I completed the consulting work and earned ${formatMoney(fee)} in taxable fees. Strain +18.` }
  if (event.kind === 'credit') {
    if (choice === 'claim') { p.reputation -= 12; p.strain += 10; result = 'The collaborator showed their dated research notes. My claim to sole credit damaged trust. Reputation -12; strain +10.' }
    else { p.reputation += choice === 'credit' ? 6 : 3; result = choice === 'credit' ? 'I corrected the record and credited the collaborator. Reputation +6; IP ownership did not change.' : 'An independent review confirmed the shared contribution. The correction cost money but preserved professional trust. Reputation +3.' }
  }
  if (event.kind === 'promoter' && choice === 'verify') result = 'Independent checks found no substantiated buyer introductions. I avoided the larger fee and retained all my rights.'
  if (event.kind === 'promoter' && choice === 'accept') { p.strain += 8; result = 'The agency delivered a generic brochure, but no buyers. The promotion fee is gone. Strain +8; I still own my IP.' }
  p.reputation = bound(p.reputation, 0, 100); p.strain = bound(p.strain, 0, 100); p.event = null
  inventorJournal(g, p, result); saveInventor(g, p); log(g, result, choice === 'claim' || event.kind === 'promoter' && choice === 'accept' ? 'bad' : 'neutral')
  notice(g, 'Life as an Inventor', result, { emoji: '💡' })
  return true
}

export function yearlyInventorCareer(g: GameState): void {
  const p = inventorView(g)
  if (!g.character.alive || p.lastCareerYear >= g.year || !p.studies.length && !Object.keys(p.expertise).length && !p.work.length) return
  p.lastCareerYear = g.year
  if (p.grant && p.grant.expires < g.year) p.grant = null
  if (p.event && p.event.year < g.year) p.event = null
  if (!p.project || g.character.prison) p.strain = Math.max(0, p.strain - 18)
  if (!blocked(g, 8) && economicRoll(`${g.lifeId}|${ownerKey(g)}|inventor-career|${g.year}`) < .35) {
    const field = Object.entries(p.expertise).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as InventionField | undefined
    const kinds: InventorEvent['kind'][] = ['mentor']
    if (p.work.some(w => inventionTopic(w.topic)?.field !== 'finance') && g.character.age >= 18) kinds.push('conference', 'promoter')
    if (p.reputation >= 20 && g.character.age >= 18) kinds.push('consulting')
    if (p.work.some(w => w.contributors && inventionTopic(w.topic)?.field !== 'finance') && g.character.age >= 18) kinds.push('credit')
    const kind = kinds[Math.floor(economicRoll(`${g.lifeId}|inventor-event-kind|${g.year}`) * kinds.length)]
    p.event = { kind, field: field ?? 'consumer', token: `${ownerKey(g)}:${g.year}:${kind}`, year: g.year }
    notice(g, 'An Inventor’s Opportunity', `${eventText(p.event)} Open Activities → Inventor → Life as an Inventor to respond this year.`, { emoji: '💡' })
  }
  saveInventor(g, p)
}

export function inventorCareerNodes(g: GameState): MenuNode[] {
  const p = inventorView(g)
  return [
    { type: 'info', id: 'inventor.career.summary', text: `Reputation ${Math.round(p.reputation)}/100 · research strain ${Math.round(p.strain)}/100 · ${p.work.length} completed projects · ${p.setbacks} setbacks learned from. ${p.work.reduce((sum, w) => sum + w.units, 0).toLocaleString('en-US')} recorded product sales; ${formatMoney(p.work.reduce((sum, w) => sum + w.royalties, 0))} earned in personal royalties. Patents do not guarantee income or recognition.` },
    { type: 'menu', id: 'inventor.practice', label: 'Workshop & Field Skills', emoji: '🛠️', subtitle: 'Free hands-on practice from age 8 · two sessions per year', children: gg => INVENTION_FIELDS.map(field => ({ type: 'action', id: `inventor.tinker.${field.id}`, label: field.label, emoji: '🔧', subtitle: `${Math.round(inventorView(gg).expertise[field.id] ?? 0)}/100 expertise · +4 from practice${inventorBackground(gg, field.id) ? ` · relevant background adds +${inventorBackground(gg, field.id)} to study gains` : ''}`, disabledReason: ggg => blocked(ggg, 8) ?? (!hasTalent(ggg, 'Inventor') ? 'Requires the Inventor talent.' : yearActionsUsed(ggg, 'inventor.tinker') >= 2 ? 'Both workshop sessions used this year.' : null), run: ggg => { tinkerInvention(ggg, field.id) } })) },
    { type: 'menu', id: 'inventor.career', label: 'Life as an Inventor', emoji: '📓', subtitle: 'Invitations, collaborators, reputation and your research notebook', children: gg => {
      const live = inventorView(gg), event = live.event
      const nodes: MenuNode[] = live.journal.map((line, i) => ({ type: 'info', id: `inventor.journal.${i}`, text: line }))
      if (event?.year === gg.year) {
        nodes.unshift({ type: 'info', id: 'inventor.event', text: eventText(event) })
        nodes.push(...eventOptions(gg, event).map((option): MenuNode => ({ type: 'action', id: `inventor.event.${option.id}`, label: option.label, emoji: '💬', subtitle: option.cost ? formatMoney(option.cost) : undefined, disabledReason: ggg => blocked(ggg, event.kind === 'mentor' ? 8 : 18) ?? (inventorView(ggg).event?.token !== event.token || ggg.year !== event.year ? 'This opportunity has ended.' : ggg.character.money < option.cost ? 'Not enough personal savings.' : null), run: ggg => { resolveInventorEvent(ggg, event.token, option.id) } })))
      }
      if (!nodes.length) nodes.push({ type: 'info', id: 'inventor.journal.empty', text: 'Keep a notebook, develop a specialty and test your ideas. Your work and professional encounters will appear here.' })
      return nodes
    } },
  ]
}
