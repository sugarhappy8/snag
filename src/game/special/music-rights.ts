// Optional independently funded master recordings alongside the existing label career.
// Every master is one transferable Asset; legacy discography royalties remain untouched.
import { addHidden, earnIncome, formatMoney, log, notice, useYearAction } from '../core'
import { gate, payForAction } from '../activities/common'
import { hasTech } from '../history/timeline'
import { economyOf } from '../economy'
import { chance, randFloat, uid } from '../rng'
import { instrumentSkill } from './common'
import { getCountry } from '../world'
import type { Asset, GameState, Json, MenuGroup, MenuNode } from '../types'

export interface MusicMaster {
  v: 1; author: string; created: number; country: string; stage: 'writing' | 'recording' | 'mastering' | 'ready' | 'released';
  quality: number; budget: number; spent: number; collaborator: string; producer: boolean; released: number; lastYear: number;
  audience: number; copies: number; receipts: number; lastGross: number; lastPaid: number; marketing: number;
  distribution: 'domestic' | 'international'; licenseUntil: number; unrecouped: number; advance: number
}
const n = (x: unknown, d = 0, max = 1e12, min = 0) => typeof x === 'number' && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : d
export function musicMaster(a: Asset): MusicMaster | null {
  const raw = a.details.musicMaster
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.author !== 'string' || !['writing', 'recording', 'mastering', 'ready', 'released'].includes(String(raw.stage))) return null
  return { v: 1, author: raw.author, created: n(raw.created, 1900, 100000), country: typeof raw.country === 'string' ? raw.country : 'us', stage: raw.stage as MusicMaster['stage'], quality: n(raw.quality, 30, 100), budget: n(raw.budget), spent: n(raw.spent), collaborator: typeof raw.collaborator === 'string' ? raw.collaborator : '', producer: raw.producer === true,
    released: n(raw.released, 0, 100000), lastYear: n(raw.lastYear, -1, 100000, -1), audience: n(raw.audience, 0, 1e8), copies: n(raw.copies), receipts: n(raw.receipts), lastGross: n(raw.lastGross), lastPaid: n(raw.lastPaid), marketing: n(raw.marketing, 0, 1), distribution: raw.distribution === 'international' ? 'international' : 'domestic', licenseUntil: n(raw.licenseUntil, 0, 100000), unrecouped: n(raw.unrecouped), advance: n(raw.advance) }
}
function save(a: Asset, m: MusicMaster) { a.details.musicMaster = m as unknown as Json }
function owned(g: GameState, id: string) { return gate(g, { minAge: 18 }) ? undefined : g.assets.find(a => a.id === id && musicMaster(a)) }
const skill = (g: GameState) => Math.max(...['Voice', 'Guitar', 'Piano', 'Violin', 'Drums', 'Keyboard', 'Bass Guitar', 'Saxophone', 'Cello'].map(i => instrumentSkill(g, i)))
export function musicProductionBlock(g: GameState): string | null {
  return gate(g, { minAge: 18 }) ?? ((g.yearActions['music.master.start'] ?? 0) >= 1 ? 'You can start one original master each year.' : skill(g) < 60 ? 'Reach 60 skill in an instrument or voice through Mind & Body lessons.' : g.assets.filter(a => musicMaster(a)).length >= 128 ? 'Sell an older master before expanding this 128-title catalogue.' : g.assets.filter(a => { const m = musicMaster(a); return m && m.stage !== 'released' }).length >= 3 ? 'Finish one of your three current masters first.' : null)
}
export function startMusicMaster(g: GameState, title: string): Asset | null {
  const clean = title.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
  if (!clean || musicProductionBlock(g) || (g.yearActions['music.master.start'] ?? 0) >= 1) return null
  const budget = Math.round(5000 * Math.max(.3, getCountry(g.character.countryId).wealth))
  if (!payForAction(g, budget)) return null
  useYearAction(g, 'music.master.start', 1)
  const m: MusicMaster = { v: 1, author: g.character.id, created: g.year, country: g.character.countryId, stage: 'writing', quality: skill(g) * .55, budget, spent: budget, collaborator: '', producer: false, released: 0, lastYear: g.year, audience: 0, copies: 0, receipts: 0, lastGross: 0, lastPaid: 0, marketing: 0, distribution: 'domestic', licenseUntil: 0, unrecouped: 0, advance: 0 }
  const a: Asset = { id: uid(g, 'master'), kind: 'other', name: clean, emoji: '🎼', purchasePrice: budget, value: Math.round(budget * .2), condition: 100, purchasedAge: g.character.age, upkeep: 0, details: {} }
  save(a, m); g.assets.push(a)
  notice(g, 'Master Recording Started', `${formatMoney(budget)} funded composition and basic studio access for “${clean}”. Develop it through writing, recording and mastering over at least two birthdays. You retain the master rights; this is separate from records commissioned by your label.`, { emoji: '🎼' }); return a
}
export function developMusicMaster(g: GameState, id: string, choice: 'craft' | 'producer'): boolean {
  const a = owned(g, id)
  if (!a || !['craft', 'producer'].includes(choice)) return false
  const m = musicMaster(a)!
  if (['ready', 'released'].includes(m.stage) || (g.yearActions[`music.master.work.${id}`] ?? 0) >= 1 || (m.stage !== 'writing' && m.lastYear >= g.year)) return false
  if (choice === 'craft' && skill(g) < 60) return false
  const cost = Math.round(m.budget * (choice === 'producer' ? .8 : .2))
  if (!payForAction(g, cost)) return false
  useYearAction(g, `music.master.work.${id}`, 1); m.spent += cost; m.lastYear = g.year; m.producer ||= choice === 'producer'
  // Commissioned collaborators receive fees, not an additional hidden ownership stream.
  m.collaborator = choice === 'producer' ? 'Commissioned session producer (fee paid; no master share)' : m.collaborator
  const setback = chance(g, choice === 'producer' ? .03 : .12)
  m.quality = Math.min(100, m.quality + (choice === 'producer' ? 17 : 10) + skill(g) / 25 - (setback ? 12 : 0))
  m.stage = m.stage === 'writing' ? 'recording' : m.stage === 'recording' ? 'mastering' : 'ready'
  a.purchasePrice = m.spent; a.value = Math.round(m.spent * .25); save(a, m)
  notice(g, 'Recording Session', `Paid ${formatMoney(cost)}. Quality ${Math.round(m.quality)}/100. ${setback ? 'A weak session hurt the final result. ' : ''}${m.stage === 'ready' ? 'The master is ready: choose distribution and release it.' : `Next stage: ${m.stage}, available next year.`}`, { emoji: '🎙️' }); return true
}
export function releaseMusicMaster(g: GameState, id: string, international = false): boolean {
  const a = owned(g, id)
  if (!a || (international && !hasTech(g, 'radio'))) return false
  const m = musicMaster(a)!
  if (m.stage !== 'ready' || (g.yearActions['music.master.release'] ?? 0) >= 1) return false
  const fee = Math.round(m.budget * (international ? .6 : .2))
  if (!payForAction(g, fee)) return false
  useYearAction(g, 'music.master.release', 1)
  m.stage = 'released'; m.released = g.year; m.lastYear = g.year; m.spent += fee; m.distribution = international ? 'international' : 'domestic'
  m.audience = Math.round((m.quality ** 2 * 4 + g.character.hidden.fame ** 2 * 8) * (international ? 2 : 1) * randFloat(g, .5, 1.5))
  a.purchasePrice = m.spent; a.value = Math.round(m.audience * .8); save(a, m)
  addHidden(g, 'fame', Math.min(5, m.quality / 25)); log(g, `I released my independently owned master “${a.name}”.`, 'good')
  notice(g, 'Master Released', `${formatMoney(fee)} paid for ${international ? 'international' : 'domestic'} distribution. Sales begin next year. You own the rights; distribution takes 25% of sales. Audience and catalogue demand can fall.`, { emoji: '💿' }); return true
}
export function licenseMusicMaster(g: GameState, id: string): boolean {
  const a = owned(g, id)
  if (!a) return false
  const m = musicMaster(a)!
  if (m.stage !== 'released' || m.licenseUntil > g.year || m.audience < 100) return false
  const advance = Math.round(m.audience * .12)
  m.advance = advance; m.unrecouped = advance; m.licenseUntil = g.year + 5
  earnIncome(g, advance); m.receipts += advance; a.value = Math.max(0, a.value - advance); save(a, m)
  notice(g, 'Five-Year Master License', `Advance ${formatMoney(advance)} paid now. You receive 35% of licensed sales; that share first recoups the advance. You keep ownership. Distribution rights revert in ${m.licenseUntil}; any unrecouped balance then expires without personal debt.`, { emoji: '📜' }); return true
}
export function marketMusicMaster(g: GameState, id: string): boolean {
  const a = owned(g, id)
  if (!a) return false
  const m = musicMaster(a)!
  if (m.stage !== 'released' || (g.yearActions[`music.master.market.${id}`] ?? 0) >= 1) return false
  const cost = Math.max(100, Math.round(m.audience * .05))
  if (!payForAction(g, cost)) return false
  useYearAction(g, `music.master.market.${id}`, 1); m.marketing = .2; m.spent += cost; save(a, m)
  notice(g, 'Catalogue Campaign', `Paid ${formatMoney(cost)} for a one-year audience campaign. It improves reach, not guaranteed profit.`, { emoji: '📣' }); return true
}
export function sellMusicMaster(g: GameState, id: string): boolean {
  const a = owned(g, id)
  if (!a) return false
  const value = Math.round(a.value * .7)
  // Advance obligations stay with the licensed master; a buyer discounts that claim.
  const price = Math.max(0, value)
  earnIncome(g, price); g.assets = g.assets.filter(x => x.id !== id)
  notice(g, 'Master Rights Sold', `Received ${formatMoney(price)} after the buyer discounted any unrecouped advance. Ownership and all future income transferred; you no longer collect royalties.`, { emoji: '📜' }); return true
}
export function yearlyMusicRights(g: GameState): void {
  if (!g.character.alive) return
  let paid = 0
  for (const a of g.assets) {
    const m = musicMaster(a)
    if (!m || m.stage !== 'released' || m.lastYear >= g.year) continue
    m.lastYear = g.year
    const licensed = m.licenseUntil >= g.year && m.licenseUntil > 0
    if (!licensed && m.licenseUntil) { m.licenseUntil = 0; m.unrecouped = 0; log(g, `Distribution rights to “${a.name}” reverted to me.`) }
    const e = economyOf(g, m.country)
    const units = Math.round(m.audience * Math.max(.2, Math.min(1.5, e.sectors.leisure.demand)) * (1 + m.marketing) * randFloat(g, .6, 1.2))
    const gross = units * (licensed ? .35 : .75), recoup = Math.min(m.unrecouped, gross), net = Math.round(gross - recoup)
    m.unrecouped -= recoup; m.lastGross = gross; m.lastPaid = net; m.copies += units; m.receipts += net; m.marketing = 0
    if (licensed && m.licenseUntil === g.year) { m.licenseUntil = 0; m.unrecouped = 0; log(g, `Distribution rights to “${a.name}” reverted to me after the final licensed year.`) }
    m.audience = Math.round(m.audience * (m.quality >= 85 ? .72 : .52)); a.value = Math.max(0, Math.round(m.audience * .8 - m.unrecouped))
    if (net > 0) earnIncome(g, net)
    paid += net; save(a, m)
  }
  if (paid > 0) log(g, `My owned master recordings paid ${formatMoney(paid)} after distribution and advance recoupment.`, 'good')
}
export function musicMasterNodes(g: GameState, a: Asset): MenuNode[] | null {
  const m = musicMaster(a)
  if (!m) return null
  const actions: MenuNode[] = [{ type: 'info', id: `master.info.${a.id}`, text: `Created ${m.created} · ${m.stage} · Quality ${Math.round(m.quality)}/100\nProduction spending ${formatMoney(m.spent)} · Lifetime cash receipts ${formatMoney(m.receipts)} · Units ${m.copies}\n${m.collaborator || 'Self-produced'}\n${m.licenseUntil > g.year ? `Licensed until ${m.licenseUntil}; unrecouped ${formatMoney(m.unrecouped)}.` : 'You own unencumbered distribution rights.'}\nLast distribution share ${formatMoney(m.lastGross)}; cash paid ${formatMoney(m.lastPaid)}.` }]
  if (!['ready', 'released'].includes(m.stage)) for (const choice of ['craft', 'producer'] as const) actions.push({ type: 'action', id: `master.work.${choice}.${a.id}`, label: choice === 'producer' ? 'Hire a Session Producer' : 'Develop It Yourself', emoji: '🎙️', subtitle: `Cost ${formatMoney(m.budget * (choice === 'producer' ? .8 : .2))} · one stage per year`, disabledReason: gg => m.stage !== 'writing' && m.lastYear >= gg.year ? 'Continue next year.' : choice === 'craft' && skill(gg) < 60 ? 'You need your own instrument or voice skill of 60; heirs can hire a producer instead.' : null, run: gg => { developMusicMaster(gg, a.id, choice) } })
  if (m.stage === 'ready') for (const international of [false, true]) actions.push({ type: 'action', id: `master.release.${international}.${a.id}`, label: international ? 'International Distribution' : 'Domestic Distribution', emoji: '💿', subtitle: `Distribution setup ${formatMoney(m.budget * (international ? .6 : .2))}`, disabledReason: gg => (gg.yearActions['music.master.release'] ?? 0) >= 1 ? 'You can release one original master each year.' : international && !hasTech(gg, 'radio') ? 'International mass distribution is not established here yet.' : null, run: gg => { releaseMusicMaster(gg, a.id, international) } })
  if (m.stage === 'released') actions.push({ type: 'action', id: `master.license.${a.id}`, label: 'License for Five Years', emoji: '📜', subtitle: `Advance ${formatMoney(Math.round(m.audience * .12))} · 35% royalty, recoupable`, disabledReason: gg => m.licenseUntil > gg.year ? 'Wait for the existing license to expire.' : m.audience < 100 ? 'The remaining audience is too small for a licensing offer.' : null, run: gg => { licenseMusicMaster(gg, a.id) } }, { type: 'action', id: `master.market.${a.id}`, label: 'Promote the Catalogue', emoji: '📣', subtitle: `One-year campaign ${formatMoney(Math.max(100, Math.round(m.audience * .05)))}`, disabledReason: gg => (gg.yearActions[`music.master.market.${a.id}`] ?? 0) >= 1 ? 'This year’s campaign is already funded.' : null, run: gg => { marketMusicMaster(gg, a.id) } })
  actions.push({ type: 'action', id: `master.sell.${a.id}`, label: 'Sell All Master Rights', emoji: '💸', subtitle: `Offer ${formatMoney(Math.max(0, Math.round(a.value * .7)))}`, confirm: () => 'Sell ownership and every future royalty? The buyer takes over any licensing contract.', run: gg => { sellMusicMaster(gg, a.id) } })
  return actions.map(n => n.type === 'action' ? { ...n, disabledReason: (gg: GameState) => gate(gg, { minAge: 18 }) ?? n.disabledReason?.(gg) ?? null } : n)
}
export const musicMastersMenu: MenuGroup = {
  type: 'menu', id: 'music.masters', label: 'Independent Masters & Rights', emoji: '🎼', header: () => 'Fund original recordings, develop them over several years, then retain or license the master. These assets can be sold or inherited. Existing label releases keep their original contracts.',
  children: g => [
    { type: 'action', id: 'music.master.start', label: 'Produce an Original Master', emoji: '🎼', subtitle: `Composition budget ${formatMoney(5000 * Math.max(.3, getCountry(g.character.countryId).wealth))}`, disabledReason: musicProductionBlock, input: { kind: 'text', label: 'Title', placeholder: 'Name your recording' }, run: (gg, value) => { startMusicMaster(gg, value ?? '') } },
    ...g.assets.filter(a => musicMaster(a)).map(a => ({ type: 'menu' as const, id: `music.master.${a.id}`, label: a.name, emoji: a.emoji, children: (gg: GameState) => { const live = gg.assets.find(x => x.id === a.id); return live ? musicMasterNodes(gg, live) ?? [] : [] } })),
  ],
}
