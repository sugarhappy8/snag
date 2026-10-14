// Business: start or buy a company in one of 33 industries (25 classic + 8 deep tech) and run it in
// its country's market
// (Occupation › Special Careers › Business, and Assets › Businesses). The engine lives in
// business/*.ts: industries, local economics, founding and buying, staff, management,
// events, exits (sale, IPO, bankruptcy) and the yearly simulation + Annual Report. This file
// is the public surface the rest of the game imports.
import { shortMoney } from './core'
import { shareSummary } from './business/competition'
import { conglomerateNodes, groupOfCompany, groupsOf, inGroup } from './business/conglomerate'
import { deepTechSummary } from './business/deeptech'
import { buyBusinessMenu, startBusinessMenu } from './business/founding'
import { industryDef } from './business/industries'
import { businessView } from './business/manage'
// Side effect: adds your listed companies to Investments > Stocks (registerOwnListings).
import './business/own-listing-menu'
import { businessAssets, ceoJob, findBusiness, readBiz, runsIt, totalOutlets } from './business/state'
import { industryNoun } from './business/util'
import { yearlyBusinessImpl } from './business/yearly'
import type { Asset, GameState, MenuGroup, MenuNode } from './types'

/** One owned company as a menu row that opens its management screen. */
function companyNode(g: GameState, a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.company.${a.id}`,
    label: a.name,
    emoji: a.emoji,
    subtitle: businessAssetSubtitle(g, a),
    // The sheet title already reads "☕ Name": no header box repeating it, unless it's gone.
    header: (gg) => (findBusiness(gg, a.id) ? '' : 'You no longer own this business.'),
    children: (gg) => {
      const cur = findBusiness(gg, a.id)
      return cur ? businessView(gg, cur) : [{ type: 'info', id: 'biz.gone', text: 'You no longer own this business.' }]
    },
  }
}

function companyNodes(g: GameState): MenuNode[] {
  const list = businessAssets(g)
  if (list.length === 0) return []
  // Conglomerates (business/conglomerate.ts): your groups (their divisions are on the group's
  // screen) and "Form a Conglomerate", then the companies that stand alone.
  const solo = list.filter((a) => !inGroup(g, a.details))
  return [{ type: 'heading', id: 'biz.yoursH', label: `Your Companies (${list.length})` }, ...conglomerateNodes(g), ...solo.map((a) => companyNode(g, a))]
}

function ownedSubtitle(g: GameState, fallback: string): string {
  const n = businessAssets(g).length
  return n ? `${n} ${n === 1 ? 'company' : 'companies'} · ${shortMoney(businessAssets(g).reduce((s, a) => s + a.value, 0))}` : fallback
}

/** Occupation › Special Careers › Business: start a company, or manage the one you run. */
export const businessCareerMenu: MenuGroup = {
  type: 'menu',
  id: 'business',
  label: 'Business',
  emoji: '\u{1F4BC}',
  subtitle: (g) => ownedSubtitle(g, 'Start or buy your own company'),
  visible: (g) => g.character.alive && !g.character.prison,
  header: () => 'Build a company from a food truck to a stock-market giant. Every country is its own market: taxes, wages, rents, red tape and what customers want all differ.',
  children: (g) => [startBusinessMenu, buyBusinessMenu, ...companyNodes(g)],
}

/** Assets › Businesses: every company you own, plus starting/buying one. */
export const businessesMenu: MenuGroup = {
  type: 'menu',
  id: 'businesses',
  label: 'Businesses',
  emoji: '\u{1F3E2}',
  subtitle: (g) => ownedSubtitle(g, 'Start or buy a company'),
  visible: (g) => g.character.alive && (!g.character.prison || businessAssets(g).length > 0),
  children: (g) => [...companyNodes(g), ...(g.character.prison ? [] : [startBusinessMenu, buyBusinessMenu])],
}

/** Occupation tab rows while the player works as CEO/owner of their own company. */
export function businessJobNodes(g: GameState): MenuNode[] {
  const job = ceoJob(g)
  if (!job) return []
  const a = findBusiness(g, typeof job.data.assetId === 'string' ? job.data.assetId : undefined)
  if (!a) return []
  return [companyNode(g, a)]
}

/** Owned-asset screen for a kind 'business' asset (registered in menus.ts). */
export function businessAssetView(g: GameState, a: Asset): MenuNode[] {
  return businessView(g, a)
}

export function businessAssetSubtitle(g: GameState, a: Asset): string {
  const b = readBiz(g, a)
  const group = groupOfCompany(g, a)
  return `${industryDef(b.industry).label} · ${b.city} · ${shortMoney(a.value)}${group ? ` · ${group.core.name}` : ''}`
}

/** Yearly hook (aging.ts, after special careers, before finance). */
export function yearlyBusiness(g: GameState): void {
  yearlyBusinessImpl(g)
}

/** One line about the player's companies for the profile ('' when none). */
export function businessSummary(g: GameState): string {
  const list = businessAssets(g)
  if (list.length === 0) return ''
  const groups = groupsOf(g)
  const chairs = groups.length ? ` Controls ${groups.map((x) => `${x.core.name} (a group of ${x.members.length} companies${x.core.listing ? `, listed on the ${x.core.listing.exchange}` : ''})`).join(' and ')}.` : ''
  const parts = list.slice(0, 3).map((a) => {
    const b = readBiz(g, a)
    const def = industryDef(b.industry)
    const profit = b.last ? `${b.last.net >= 0 ? '' : '-'}${shortMoney(Math.abs(b.last.net))} ${b.last.net >= 0 ? 'profit' : 'loss'} last year` : 'just opened'
    const role = runsIt(g, a) ? 'CEO' : 'owner'
    const tech = deepTechSummary(g, a)
    // Deep tech carries its market share in its own clause; everyone else gets it here.
    const share = tech ? '' : shareSummary(g, b)
    return `${a.name} (${industryNoun(def.label)}, ${b.city}, ${totalOutlets(b)} ${totalOutlets(b) === 1 ? def.site : def.sitePlural}, ${b.employees + b.staff.length} staff, ${profit}${share ? `, ${share}` : ''}${tech ? `; ${tech}` : ''}; ${role})`
  })
  return `Owns ${parts.join('; ')}${list.length > 3 ? ` and ${list.length - 3} more` : ''}${chairs ? `.${chairs}` : ''}`
}
