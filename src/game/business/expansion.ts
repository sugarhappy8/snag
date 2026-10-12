// Actions, menus and yearly progression for national strategy and the Inventor talent.
import { count, formatMoney, log, notice } from '../core'
import { pick, randFloat, uid } from '../rng'
import { hasTalent } from '../talents'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { COUNTRIES, getCountry } from '../world'
import { STRATEGIES, expansionOf, nationalMarket, productDemand, protectedIn, saveExpansion, type Expansion, type Patent, type Research } from './dynamics'
import { INVENTION_TIERS, inventionNames, isInventionTier, isResearchKind, nationalPatentLaw, type InventionTier } from './inventions'
import { manageBlock } from './gate'
import { industryDef } from './industries'
import { bizOf, businessAssets, findBusiness, readBiz, type BizState } from './state'
import { industryNoun, money, pct } from './util'
import { inventionProductsOf, newInventionProduct, ownedInventionProductNodes, saveInventionProducts } from './invention-products'
import type { InventionField } from '../inventor-data'
import { registerInventionBreakthrough, inventionImpactNodes } from '../invention-impact'
import { externalInventionLicenseNodes } from './invention-licensing'

export function strategyCost(b: BizState): number { return Math.round(Math.max(5_000, (b.last?.revenue ?? 100_000) * .025)) }
export function studyCost(b: BizState): number { return Math.round(Math.max(2_000, (b.last?.revenue ?? 100_000) * .003)) }
function pay(b: BizState, cost: number): boolean {
  if (!Number.isFinite(cost) || cost < 0 || b.cash < cost) return false
  b.cash -= cost
  b.yearCosts += cost
  return true
}

export function studyMarket(g: GameState, assetId: string, country: string): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a) || !COUNTRIES.some(c => c.id === country)) return false
  const b = bizOf(g, a), x = expansionOf(b)
  if (x.studies.some(s => s.country === country && s.year === g.year) || !pay(b, studyCost(b))) return false
  x.studies = [...x.studies.filter(s => s.country !== country), { country, year: g.year }]
  saveExpansion(b, x)
  const n = nationalMarket(g, b.industry, country)
  log(g, `I studied the ${industryNoun(industryDef(b.industry).label)} market in ${getCountry(country).name}.`)
  notice(g, 'Market Study', `${n.label}. Customers currently favor ${n.taste}. Input costs are ${pct(n.costs - 1, 1)} relative to the normal local level. Use National Strategy to choose a response. Inventions now begin with personal specific-topic study in Activities > Inventor, funded from personal savings.`, { emoji: '🔎' })
  return true
}

export function adoptStrategy(g: GameState, assetId: string, country: string, id: string): boolean {
  const a = findBusiness(g, assetId), s = STRATEGIES.find(s => s.id === id)
  if (!a || !s || manageBlock(g, a)) return false
  const b = bizOf(g, a), x = expansionOf(b)
  const active = x.strategies.filter(p => p.country === country && p.expires > g.year)
  if (!b.outlets.some(o => o.countryId === country) || active.length >= 3 || active.some(p => p.id === id) || !pay(b, strategyCost(b))) return false
  x.strategies = [...x.strategies.filter(p => p.expires > g.year), { id, country, started: g.year, expires: g.year + s.term }]
  saveExpansion(b, x)
  log(g, `I started ${s.label.toLowerCase()} in ${getCountry(country).name} for ${a.name}.`)
  notice(g, s.label, `${formatMoney(strategyCost(b))} paid from company cash. ${s.brief}. Runs through ${g.year + s.term - 1}; the effect expires before trading in ${g.year + s.term}. Up to three programs can run in each country.`, { emoji: '🧭' })
  return true
}

/** These are explicitly alternate-history inventions, never factual launch-date claims. */
export function researchIdeas(b: BizState): { early: string; frontier: string } {
  if (/energy|fusion|battery|solar/.test(b.industry)) return { early: 'Next-generation grid storage', frontier: 'Stable cold-fusion power cell' }
  if (/bio|pharma|clinic|medical/.test(b.industry)) return { early: 'Precision regenerative treatment', frontier: 'Universal tissue-repair platform' }
  if (/software|ai|chip|quantum|robot|game/.test(b.industry)) return { early: 'Adaptive autonomous computing', frontier: 'Self-organizing cognitive substrate' }
  if (/farm|food|restaurant|cafe|bakery|grocery/.test(b.industry)) return { early: 'Closed-loop food production', frontier: 'Molecular nutrition synthesizer' }
  if (/logistic|auto|aero|space/.test(b.industry)) return { early: 'Autonomous transport network', frontier: 'Inertial transport drive' }
  return { early: `${industryDef(b.industry).label} adaptive production`, frontier: `${industryDef(b.industry).label} self-renewing materials` }
}

export function researchQuote(g: GameState, b: BizState, kind: Research['kind']): Research {
  if (isInventionTier(kind)) {
    const tier = INVENTION_TIERS[kind]
    return { name: `Random ${tier.label.toLowerCase()} invention`, kind, started: g.year, years: tier.years, odds: tier.odds,
      budget: Math.round(Math.max(tier.minimum, (b.last?.revenue ?? 0) * tier.revenueShare) + nationalPatentLaw(b.countryId, g.year + tier.years).filingCost) }
  }
  // Older saves and queued actions keep their original research contracts.
  const frontier = kind === 'frontier'
  return { name: researchIdeas(b)[kind], kind, started: g.year, years: frontier ? 5 : 3,
    budget: Math.round(Math.max(frontier ? 500_000 : 100_000, (b.last?.revenue ?? 0) * (frontier ? .35 : .15))),
    odds: 1 }
}

function randomIdeas(g: GameState, b: BizState, kind: InventionTier): string[] {
  const reserved = new Set<string>(Array.isArray(g.flags['business.inventionNames']) ? g.flags['business.inventionNames'].filter((n): n is string => typeof n === 'string') : [])
  for (const company of businessAssets(g)) {
    const x = expansionOf(readBiz(g, company))
    for (const patent of x.patents) reserved.add(patent.name)
    if (x.research) reserved.add(x.research.name)
  }
  const names = inventionNames(b, kind)
  for (let generation = 1; ; generation++) {
    const available = names.map(n => generation === 1 ? n : `${n}, generation ${generation}`).filter(n => !reserved.has(n))
    if (available.length) return available
  }
}

export function startInvention(g: GameState, assetId: string, kind: Research['kind']): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a) || !hasTalent(g, 'Inventor') || !isResearchKind(kind)) return false
  const b = bizOf(g, a), x = expansionOf(b), q = researchQuote(g, b, kind)
  if (x.research || !x.studies.some(s => s.country === b.countryId && s.year <= g.year && g.year - s.year <= 2) || x.patents.some(p => p.name === q.name && p.expires > g.year) || !pay(b, q.budget)) return false
  if (isInventionTier(kind)) {
    q.name = pick(g, randomIdeas(g, b, kind))
    q.id = uid(g, 'invention')
    const tier = INVENTION_TIERS[kind]
    q.demand = randFloat(g, tier.demand[0], tier.demand[1])
    q.efficiency = randFloat(g, tier.efficiency[0], tier.efficiency[1])
    const reserved = Array.isArray(g.flags['business.inventionNames']) ? g.flags['business.inventionNames'] : []
    g.flags['business.inventionNames'] = [...reserved, q.name]
  }
  x.research = q
  saveExpansion(b, x)
  count(g, 'inventionProjects')
  log(g, `I funded ${q.name} at ${a.name} for ${money(q.budget)}.`)
  if (q.years === 0) {
    finishInvention(g, a, b, x)
    saveExpansion(b, x)
  } else notice(g, 'Research Started', `${q.name}: ${q.years} ${q.years === 1 ? 'year' : 'years'}, guaranteed completion. This compatibility project keeps its existing paid budget and timeline. New projects begin in Activities > Inventor. Completion creates a concrete product with a manufacturing plan.`, { emoji: '💡' })
  return true
}

function inventionField(industry: string): InventionField {
  return /energy|solar|battery|fusion/.test(industry) ? 'energy' : /biotech|pharma|clinic/.test(industry) ? 'health'
    : /software|semiconductor|aiLab|quantum|robotics|gameStudio|cybersecurity/.test(industry) ? 'computing'
      : /farm|food|restaurant|cafe|bakery|grocery/.test(industry) ? 'food' : /logistics|autoShop|electricVehicles|spaceTech/.test(industry) ? 'transport' : 'materials'
}

function finishInvention(g: GameState, a: Asset, b: BizState, x: Expansion): void {
  const r = x.research
  if (!r) return
  x.research = null
  const modern = isInventionTier(r.kind)
  const expires = g.year + (modern ? nationalPatentLaw(b.countryId, g.year).term : r.kind === 'early' ? 15 : 20)
  const patent: Patent = { id: r.id ?? uid(g, 'invention'), name: r.name, kind: r.kind, launched: g.year, expires,
    ...(modern ? { ownerId: a.id, demand: r.demand ?? INVENTION_TIERS[r.kind as InventionTier].demand[0], efficiency: r.efficiency ?? 0,
      protections: [{ country: b.countryId, filed: g.year, expires }] } : {}) }
  x.patents.push(patent)
  const products = inventionProductsOf(b)
  if (!products.some(p => p.id === patent.id)) products.push(newInventionProduct(patent.id!, r.name, inventionField(b.industry), modern ? r.kind as InventionTier : r.kind === 'early' ? 'big' : 'generational', g.year))
  saveInventionProducts(b, products)
  count(g, 'inventions')
  registerInventionBreakthrough(g, { id: patent.id!, name: r.name, kind: modern ? r.kind as InventionTier : r.kind === 'early' ? 'big' : 'generational', field: inventionField(b.industry), created: g.year, country: b.countryId })
  notice(g, 'Breakthrough!', modern
    ? `${a.name} invented ${r.name}. The company now owns a concrete product; set its price and production under Owned Inventions. The patent belongs exclusively to ${a.name} in ${getCountry(b.countryId).name} until ${expires}. File abroad by ${g.year + 1} to protect other countries. After patents expire, you keep the technology but competitors can copy it. No sales occur without manufacturing capacity, staff and cash.`
    : `${a.name} invented ${r.name}. Your legacy worldwide exclusivity remains in force until ${expires}. The technology is now a concrete company-owned product: set its price and production under Owned Inventions. Staff, production costs and cash limit output; it no longer boosts unrelated sales. Competitors may copy the product after exclusivity expires.`, { emoji: '💡', tone: 'good' })
  log(g, `I brought ${r.name} to market through ${a.name}.`, 'good')
}

function patentEligibilityBlock(g: GameState, a: Asset, p: Patent): string | null {
  return manageBlock(g, a) ?? (!isInventionTier(p.kind) || p.ownerId !== a.id ? 'This company does not own a national patent for this invention.'
    : g.year < p.launched || g.year > p.launched + 1 ? 'The foreign patent filing window has ended.' : null)
}

export function patentFilingBlock(g: GameState, a: Asset, p: Patent, country: string): string | null {
  return patentEligibilityBlock(g, a, p) ?? (!COUNTRIES.some(c => c.id === country) ? 'Unknown country.'
    : p.protections?.some(t => t.country === country) ? 'Already filed in this country.'
    : readBiz(g, a).cash < nationalPatentLaw(country, g.year).filingCost ? 'Not enough company cash.' : null)
}

/** Pure, current quote: charge only missing national filings, never previously granted rights. */
export function allNationsPatentQuote(g: GameState, a: Asset, inventionId: string) {
  // Menu closures may hold an older asset snapshot after a save load or immutable state update.
  const current = findBusiness(g, a.id) ?? a
  const b = readBiz(g, current), p = expansionOf(b).patents.find(p => p.id === inventionId)
  const filed = new Set(p?.protections?.map(t => t.country) ?? [])
  const countries = p ? COUNTRIES.filter(c => !filed.has(c.id)) : []
  const cost = countries.reduce((sum, c) => sum + nationalPatentLaw(c.id, g.year).filingCost, 0)
  const block = manageBlock(g, a) ?? (!p ? 'This invention is no longer available.' : patentEligibilityBlock(g, a, p)
    ?? (!countries.length ? 'Already filed in all nations.' : b.cash < cost ? 'Not enough company cash for all remaining national filings.' : null))
  return { countries, cost, block }
}

/** One atomic payment and one notice; individual national terms and enforcement still apply. */
export function fileInventionPatentAllNations(g: GameState, assetId: string, inventionId: string): boolean {
  const a = findBusiness(g, assetId)
  if (!a) return false
  const quote = allNationsPatentQuote(g, a, inventionId)
  if (quote.block) return false
  const b = bizOf(g, a), x = expansionOf(b), p = x.patents.find(p => p.id === inventionId)
  if (!p || !pay(b, quote.cost)) return false
  p.protections ??= []
  p.protections.push(...quote.countries.map(c => ({ country: c.id, filed: g.year, expires: p.launched + nationalPatentLaw(c.id, p.launched).term })))
  saveExpansion(b, x)
  notice(g, 'Patents Filed in All Nations', `${a.name} paid ${formatMoney(quote.cost)} from company cash to protect ${p.name} in ${quote.countries.length} additional nations. Already-filed countries were not charged again. The invention is now patented in every game nation; each nation's original term and local enforcement still apply. Filing abroad does not restart the patent term.`, { emoji: '🌍', tone: 'good' })
  return true
}

/** National grants use the original invention date, so later filings cannot extend a monopoly. */
export function fileInventionPatent(g: GameState, assetId: string, inventionId: string, country: string): boolean {
  const a = findBusiness(g, assetId)
  if (!a) return false
  const b = bizOf(g, a), x = expansionOf(b), p = x.patents.find(p => p.id === inventionId)
  if (!p || patentFilingBlock(g, a, p, country)) return false
  const law = nationalPatentLaw(country, p.launched)
  if (!pay(b, nationalPatentLaw(country, g.year).filingCost)) return false
  p.protections ??= []
  p.protections.push({ country, filed: g.year, expires: p.launched + law.term })
  saveExpansion(b, x)
  notice(g, 'Patent Filed', `${a.name} now has exclusive rights to ${p.name} in ${getCountry(country).name} through ${p.launched + law.term - 1}. Local enforcement determines the commercial advantage. Rights in other countries are separate.`, { emoji: '📜', tone: 'good' })
  return true
}

export function inventionYear(g: GameState, a: Asset, b: BizState): void {
  const x = expansionOf(b)
  if (x.lastYear >= g.year) return
  x.lastYear = g.year
  // Convert existing company technologies to concrete SKUs without charging again
  // or changing their identifiers, grant dates, territorial rights or expiry.
  const products = inventionProductsOf(b)
  for (const patent of x.patents) {
    patent.id ??= uid(g, 'invention')
    if (!products.some(product => product.id === patent.id)) products.push(newInventionProduct(patent.id, patent.name, inventionField(b.industry), isInventionTier(patent.kind) ? patent.kind : patent.kind === 'early' ? 'big' : 'generational', patent.launched))
  }
  if (products.length) saveInventionProducts(b, products)
  const r = x.research
  if (r && g.year >= r.started + r.years) {
    finishInvention(g, a, b, x)
  }
  const expired = x.patents.flatMap(p => isInventionTier(p.kind) ? (p.protections ?? []).filter(t => t.expires === g.year).map(t => `${p.name} in ${getCountry(t.country).name}`) : p.expires === g.year ? [p.name] : [])
  if (expired.length) notice(g, 'Competitors Catch Up', `${expired.join(', ')}: patent protection has ended. You keep invented technologies, but competitors can now copy them in these markets.`, { emoji: '🌍' })
  saveExpansion(b, x)
}

function countryMenu(a: Asset, country: string): MenuGroup {
  return { type: 'menu', id: `biz.national.${a.id}.${country}`, label: getCountry(country).name, emoji: getCountry(country).flag,
    subtitle: g => { const n = nationalMarket(g, readBiz(g, a).industry, country); return `${n.label} · customers favor ${n.taste}` },
    children: g => {
      const b = readBiz(g, a), x = expansionOf(b), n = nationalMarket(g, b.industry, country)
      const active = x.strategies.filter(p => p.country === country && p.expires > g.year)
      return [
        { type: 'info', id: `national.summary.${a.id}.${country}`, text: `${g.year}: demand ${pct(n.demand)} of normal; input costs ${pct(n.costs)}; confidence ${pct(n.confidence)}. ${active.length}/3 programs active. Conditions change each year.`, emoji: '📊' },
        { type: 'action', id: `national.study.${a.id}.${country}`, label: 'Study This Market', emoji: '🔎', subtitle: `${money(studyCost(b))} from company cash`, disabledReason: gg => manageBlock(gg, a) ?? (expansionOf(readBiz(gg, a)).studies.some(s => s.country === country && s.year === gg.year) ? 'Already studied this year.' : readBiz(gg, a).cash < studyCost(readBiz(gg, a)) ? 'Not enough company cash.' : null), run: gg => { studyMarket(gg, a.id, country) } },
        ...STRATEGIES.map((s): MenuNode => ({ type: 'action', id: `national.strategy.${a.id}.${country}.${s.id}`, label: s.label, emoji: '🧭', subtitle: `${s.brief} · ${money(strategyCost(b))} · ${s.term} years`,
          disabledReason: gg => { const bb = readBiz(gg, a), active = expansionOf(bb).strategies.filter(p => p.country === country && p.expires > gg.year); return manageBlock(gg, a) ?? (!bb.outlets.some(o => o.countryId === country) ? 'Open a location here first using Expansion.' : active.some(p => p.id === s.id) ? `Active until ${active.find(p => p.id === s.id)!.expires}.` : active.length >= 3 ? 'Three programs are already active here.' : bb.cash < strategyCost(bb) ? 'Not enough company cash.' : null) },
          confirm: gg => `Spend ${money(strategyCost(readBiz(gg, a)))} of company cash on ${s.label.toLowerCase()} in ${getCountry(country).name}?`, run: gg => { adoptStrategy(gg, a.id, country, s.id) } })),
      ]
    } }
}

export function nationalStrategyMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `biz.national.${a.id}`, label: 'National Strategy', emoji: '🌍', subtitle: 'Annual conditions, market studies and 10 strategy programs', children: g => {
    const b = readBiz(g, a), present = new Set(b.outlets.map(o => o.countryId))
    return [
      ...COUNTRIES.filter(c => present.has(c.id)).map(c => countryMenu(a, c.id)),
      { type: 'menu', id: `biz.national.explore.${a.id}`, label: 'Compare Other Countries', emoji: '🗺️', subtitle: 'Open a location using Expansion to run local programs', children: gg => COUNTRIES.filter(c => !present.has(c.id)).map(c => {
        const n = nationalMarket(gg, readBiz(gg, a).industry, c.id)
        return { type: 'info', id: `national.compare.${a.id}.${c.id}`, emoji: c.flag, text: `${c.name}: ${n.label}; demand ${pct(n.demand)}; costs ${pct(n.costs)}; customers favor ${n.taste}.` }
      }) },
    ]
  } }
}

function inventionPatentMenu(a: Asset, p: Patent, index: number): MenuGroup {
  return { type: 'menu', id: `inventor.patent.${a.id}.${index}`, label: p.name, emoji: '📜', subtitle: 'Technology unlocked · demand and national patent rights', children: g => {
    const b = readBiz(g, a), current = expansionOf(b).patents.find(candidate => candidate.id === p.id) ?? p
    const territories = current.protections ?? []
    return [
      { type: 'info', id: `inventor.product.${p.id}`, emoji: '💡', text: `${a.name} owns this ${isInventionTier(p.kind) ? INVENTION_TIERS[p.kind].label.toLowerCase() : p.kind} invention. Technology unlocked in ${p.launched}; no further development is needed. ${inventionProductsOf(b).some(product => product.id === p.id) ? 'Its separate product has its own price, production, inventory and sales ledger above; patents protect that product, not unrelated company demand.' : `Legacy demand contribution: +${pct(productDemand(current, b.countryId, g.year), 1)}. It will convert to a concrete product on the next yearly update without losing patent rights.`} Actual sales require manufacturing capacity, staff and cash.` },
      ...territories.map((t): MenuNode => ({ type: 'info', id: `inventor.protection.${p.id}.${t.country}`, emoji: getCountry(t.country).flag, text: `${getCountry(t.country).name}: ${protectedIn(current, t.country, g.year) ? `exclusive to ${a.name} until ${t.expires}` : 'patent expired; competitors may copy'}. Filed ${t.filed}.` })),
      { type: 'info', id: `inventor.foreign.help.${p.id}`, emoji: '🌍', text: `Foreign filing deadline: ${p.launched + 1}. A patent protects only its country. Filing later does not restart the patent term. After expiry, your technology remains available with a smaller demand advantage.` },
      { type: 'action', id: `inventor.file.all.${p.id}`, label: 'Patent in All Nations', emoji: '🌐',
        subtitle: gg => { const q = allNationsPatentQuote(gg, a, p.id!); return q.countries.length ? `${q.countries.length} new national filings · ${money(q.cost)} from company cash` : 'Already filed in all nations' },
        disabledReason: gg => allNationsPatentQuote(gg, a, p.id!).block,
        confirm: gg => { const q = allNationsPatentQuote(gg, a, p.id!); return `Pay ${money(q.cost)} from ${a.name} to patent ${p.name} in all ${q.countries.length} remaining nations? Already-filed countries are skipped. Each nation's patent term and enforcement still apply; no term is extended.` },
        run: gg => { fileInventionPatentAllNations(gg, a.id, p.id!) } },
      { type: 'menu', id: `inventor.foreign.${p.id}`, label: 'File Patent in Another Country', emoji: '🌍', children: gg => {
        const bb = readBiz(gg, a), pp = expansionOf(bb).patents.find(candidate => candidate.id === p.id) ?? p
        const present = new Set(bb.outlets.map(o => o.countryId))
        return [...COUNTRIES].sort((left, right) => Number(present.has(right.id)) - Number(present.has(left.id))).map(c => ({ type: 'action', id: `inventor.file.${p.id}.${c.id}`, label: c.name, emoji: c.flag,
          subtitle: `${money(nationalPatentLaw(c.id, gg.year).filingCost)} · ${nationalPatentLaw(c.id, p.launched).term}-year national term${present.has(c.id) ? ' · operating here' : ''}`,
          disabledReason: ggg => patentFilingBlock(ggg, a, expansionOf(readBiz(ggg, a)).patents.find(candidate => candidate.id === p.id) ?? pp, c.id),
          confirm: ggg => `Pay ${money(nationalPatentLaw(c.id, ggg.year).filingCost)} from ${a.name} to protect ${p.name} in ${c.name}?`,
          run: ggg => { fileInventionPatent(ggg, a.id, p.id!, c.id) } }))
      } },
    ]
  } }
}

export function inventorMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `biz.inventor.${a.id}`, label: 'Owned Inventions', emoji: '💡', subtitle: 'Product manufacturing, licensing and national patents', children: g => {
    const b = readBiz(g, a), x = expansionOf(b)
    const nodes: MenuNode[] = [{ type: 'info', id: `inventor.help.${a.id}`, text: 'New inventions begin in Activities > Inventor with specific-topic study and personal research. Here, fund fabs from company cash, upgrade the technology, choose any nonnegative price and use a slider for annual production. Staff, paid fab capacity and working capital limit output. Outside manufacturers can license company-owned IP and fund their own factories. Breakthrough demand starts enormous but monopoly pricing and profits erode toward territorial patent expiry; upgrades never restart the patent clock. Inventions sell their own products, not unrelated company demand.', emoji: '🧪' }, ...ownedInventionProductNodes(g, a.id)]
    if (x.research) nodes.push({ type: 'info', id: `inventor.progress.${a.id}`, text: `${x.research.name}: legacy funded project completes in ${Math.max(0, x.research.started + x.research.years - g.year)} years, guaranteed. Budget ${money(x.research.budget)} already paid.`, emoji: '⏳' })
    for (const product of inventionProductsOf(b)) {
      if (product.rights === 'owned') nodes.push(...externalInventionLicenseNodes(g, { assetId: a.id, inventionId: product.id }))
      nodes.push(...inventionImpactNodes(g, product.ipId, a.id))
    }
    nodes.push(...x.patents.map((p, i): MenuNode => isInventionTier(p.kind) ? inventionPatentMenu(a, p, i) : ({ type: 'info', id: `inventor.patent.${a.id}.${i}`, text: `${p.name} · ${p.expires > g.year ? `exclusive until ${p.expires}` : 'competitors can now use it'}`, emoji: '📜' })))
    return nodes
  } }
}
