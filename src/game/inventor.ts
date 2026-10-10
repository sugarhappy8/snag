// One personal invention loop: study a specific topic, fund the work, finish a
// guaranteed invention, then retain/license its IP or assign it to a company.
import { addStat, count, formatMoney, log, notice, scriptInput, spend, useYearAction, yearActionsUsed } from './core'
import { uid } from './rng'
import { defineScript } from './scripts'
import { hasTalent } from './talents'
import { blocked } from './special/common'
import type { GameState, Json, MenuGroup, MenuNode } from './types'
import { COUNTRIES, getCountry } from './world'
import { INVENTION_TIERS, nationalPatentLaw } from './business/inventions'
import { expansionOf, saveExpansion } from './business/dynamics'
import { manageBlock } from './business/gate'
import { bizOf, businessAssets, findBusiness, readBiz } from './business/state'
import { inventionMarketDemand, inventionProductsOf, newInventionProduct, saveInventionProducts } from './business/invention-products'
import { INVENTION_TOPICS, inventionIndustryCompatible, inventionTopic, PRODUCT_SPECS } from './inventor-data'
import { inventorView, personalInventions, readInventionIp, saveInventor, type PersonalResearch } from './inventor-state'
import { registerInventionBreakthrough, inventionImpactNodes, transferInventionImpact } from './invention-impact'
import { externalInventionLicenseNodes, transferExternalInventionLicenses } from './business/invention-licensing'
import { bound, economicRoll } from './economy'
import type { ResearchApproach } from './inventor-state'

export const RESEARCH_APPROACHES = [
  { id: 'practical', label: 'Practical design', cost: .75, note: 'Lower research cost and dependable manufacturing; a smaller commercial upside.' },
  { id: 'balanced', label: 'Balanced research', cost: 1, note: 'Balance cost, product reliability and potential demand.' },
  { id: 'frontier', label: 'Frontier bet', cost: 1.6, note: 'More expensive, with a wider range of commercial outcomes. Extra testing matters.' },
] as const

export function studyInventionTopic(g: GameState, topicId: string, online = false): boolean {
  const topic = inventionTopic(topicId)
  if (!topic || blocked(g, 8) || !hasTalent(g, 'Inventor') || (online && g.year < 1995) || yearActionsUsed(g, 'inventor.study') >= 4) return false
  const cost = online ? 30 : 10
  if (!spend(g, cost)) return false
  useYearAction(g, 'inventor.study', 4)
  const p = inventorView(g), study = p.studies.find(s => s.topic === topicId)
  if (study) { study.points = Math.min(10, study.points + (online ? 2 : 1)); study.year = g.year }
  else p.studies.push({ topic: topicId, points: online ? 2 : 1, year: g.year })
  saveInventor(g, p)
  addStat(g, 'smarts', 1)
  notice(g, online ? 'Online Topic Research' : 'Library Topic Research', `You studied ${topic.name.toLowerCase()} ${online ? 'through online research' : 'at the library'}. ${online ? 2 : 1} research points gained. Two points and a recent study unlock this specific project; four study sessions per year are shared across all topics. Your personal account paid ${formatMoney(cost)}.`, { emoji: '📚' })
  return true
}

export function personalResearchQuote(g: GameState, topicId: string, approach: ResearchApproach = 'balanced') {
  const topic = inventionTopic(topicId)
  if (!topic) return null
  const tier = INVENTION_TIERS[topic.tier]
  const method = RESEARCH_APPROACHES.find(a => a.id === approach) ?? RESEARCH_APPROACHES[1]
  return { topic, years: tier.years, budget: Math.round(tier.minimum * method.cost) + nationalPatentLaw(g.character.countryId, g.year + tier.years).filingCost }
}
export function personalResearchBlock(g: GameState, topicId: string, approach: ResearchApproach = 'balanced'): string | null {
  const quote = personalResearchQuote(g, topicId, approach), p = inventorView(g)
  const study = p.studies.find(s => s.topic === topicId)
  return blocked(g, 16) ?? (!hasTalent(g, 'Inventor') ? 'Requires the Inventor talent.' : !quote ? 'Unknown research topic.'
    : p.project ? 'Finish your active personal research project first.'
      : !study || study.points < 2 || study.year > g.year || g.year - study.year > 3 ? 'Study this specific topic to two points; the last study must be within three years.'
        : yearActionsUsed(g, 'inventor.project') >= 1 ? 'You already began a research project this year.'
          : g.character.money < quote.budget ? `Your personal research budget needs ${formatMoney(quote.budget)}.` : null)
}

export function startPersonalResearch(g: GameState, topicId: string, name?: string, approach: ResearchApproach = 'balanced'): boolean {
  const quote = personalResearchQuote(g, topicId, approach)
  if (!RESEARCH_APPROACHES.some(a => a.id === approach) || !quote || personalResearchBlock(g, topicId, approach)) return false
  const title = (name ?? quote.topic.name).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!title || !spend(g, quote.budget)) return false
  useYearAction(g, 'inventor.project', 1)
  const p = inventorView(g)
  p.project = { id: uid(g, 'invention'), topic: topicId, name: title, kind: quote.topic.tier, started: g.year, progress: 0, years: quote.years, budget: quote.budget, country: g.character.countryId }
  p.project.approach = approach
  p.project.engineering = 25 + (p.studies.find(s => s.topic === topicId)?.points ?? 2) * 3 + g.character.stats.smarts * .2
  p.project.validation = approach === 'practical' ? 55 : approach === 'frontier' ? 15 : 35
  p.lastYear = g.year
  saveInventor(g, p)
  count(g, 'inventionProjects')
  if (!quote.years) completePersonalResearch(g, p.project)
  else notice(g, 'Personal Research Funded', `${title}: ${quote.years} active research years, guaranteed completion. ${formatMoney(quote.budget)} was paid from your personal savings, including the home patent. Commercial fit and reliability are uncertain. Each year, you may fund either an engineering experiment or a customer trial; doing so is optional. Prison pauses research.`, { emoji: '💡' })
  return true
}

function completePersonalResearch(g: GameState, project: PersonalResearch): void {
  const p = inventorView(g)
  if (!p.project || p.project.id !== project.id || g.assets.some(a => a.id === project.id)) return
  const topic = inventionTopic(project.topic)!, spec = PRODUCT_SPECS[project.kind]
  const marketRoll = economicRoll(`${g.lifeId}|research-fit|${project.id}`), engineering = project.engineering ?? 50, validation = project.validation ?? 35
  const practical = project.approach === 'practical', frontier = project.approach === 'frontier'
  const marketFit = bound((practical ? .65 : frontier ? .2 + marketRoll * 1.4 : .55 + marketRoll * .6) + validation * .004, .2, 1.9)
  const reliability = bound(.55 + engineering * .006 + (practical ? .18 : frontier ? -.12 : 0), .45, 1.25)
  const ip = { v: 2, topic: project.topic, field: topic.field, kind: project.kind, created: g.year, country: project.country, budget: project.budget, unitPrice: spec.price, unitCost: Math.round(spec.cost / reliability), potential: spec.demand, marketFit, reliability,
    protections: [{ country: project.country, filed: g.year, expires: g.year + nationalPatentLaw(project.country, g.year).term }] }
  g.assets.push({ id: project.id, kind: 'invention', name: project.name, emoji: '💡', purchasePrice: project.budget, value: Math.round(project.budget * .5), condition: 100, purchasedAge: g.character.age, upkeep: 0, details: { inventorIp: ip as unknown as Json } })
  p.project = null
  saveInventor(g, p)
  count(g, 'inventions')
  registerInventionBreakthrough(g, { id: project.id, name: project.name, kind: project.kind, field: topic.field, created: g.year, country: project.country })
  log(g, `I invented ${project.name} and retained the intellectual property.`, 'good')
  log(g, `Prototype results: ${marketFit < .65 ? 'a narrow customer niche' : marketFit > 1.2 ? 'strong customer interest' : 'promising but unproven demand'}; ${reliability < .8 ? 'manufacturing needs extra care' : 'a reliable design'}.`, marketFit < .65 ? 'neutral' : 'good')
  notice(g, 'Invention Completed', `${project.name} is now your personally owned IP. You hold the ${getCountry(project.country).name} patent. Assign it to a compatible company, build fabs and set any price and slider-based output. Or retain ownership and license manufacturing to your companies or outside partners who fund their own fabs. Staff and working capital still limit actual output. Breakthrough demand and monopoly pricing fade as patents count down; technology upgrades do not extend them. Inventing alone creates no sales income. Foreign national or all-nations filings remain available through ${g.year + 1}.`, { emoji: '💡', tone: 'good' })
}

export function yearlyInventor(g: GameState): void {
  if (!g.character.alive) return
  const p = inventorView(g)
  if (!p.project || p.lastYear >= g.year) return
  p.lastYear = g.year
  if (!g.character.prison) p.project.progress += 1
  saveInventor(g, p)
  if (!g.character.prison && p.project.progress >= p.project.years) completePersonalResearch(g, p.project)
}

export function researchExperiment(g: GameState, kind: 'engineering' | 'customers'): boolean {
  const p = inventorView(g), project = p.project
  if (!project || blocked(g, 16) || project.experimentYear === g.year || !['engineering', 'customers'].includes(kind)) return false
  const cost = Math.max(100, Math.round(project.budget * .08))
  if (!spend(g, cost)) return false
  const gain = 10 + Math.floor(economicRoll(`${g.lifeId}|experiment|${project.id}|${g.year}|${kind}`) * 14)
  project.experimentYear = g.year
  if (kind === 'engineering') project.engineering = Math.min(100, (project.engineering ?? 50) + gain)
  else project.validation = Math.min(100, (project.validation ?? 35) + gain)
  saveInventor(g, p)
  notice(g, kind === 'engineering' ? 'Prototype Tested' : 'Customer Trial', `${formatMoney(cost)} funded ${kind === 'engineering' ? 'durability and manufacturing experiments' : 'a trial with potential customers'}. ${kind === 'engineering' ? 'The results improved reliability and expected unit costs.' : 'Feedback improved the product’s fit to customer needs.'} You can choose another experiment next year; the original completion date and patent terms are unchanged.`, { emoji: '🔬' })
  return true
}

function personalPatentQuote(g: GameState, id: string, country: string | 'all') {
  const a = personalInventions(g).find(a => a.id === id), ip = a ? readInventionIp(a)! : null
  const countries = ip ? COUNTRIES.filter(c => (country === 'all' || c.id === country) && !ip.protections.some(t => t.country === c.id)) : []
  const cost = countries.reduce((sum, c) => sum + nationalPatentLaw(c.id, g.year).filingCost, 0)
  const reason = blocked(g, 16) ?? (!ip ? 'You no longer own this personal IP.' : g.year < ip.created || g.year > ip.created + 1 ? 'The foreign patent filing window has ended.' : !countries.length ? 'No new national filings remain.' : g.character.money < cost ? `You need ${formatMoney(cost)} in personal savings.` : null)
  return { a, ip, countries, cost, reason }
}

export function filePersonalInventionPatent(g: GameState, id: string, country: string | 'all'): boolean {
  const quote = personalPatentQuote(g, id, country)
  if (quote.reason || !quote.a || !quote.ip || !spend(g, quote.cost)) return false
  quote.ip.protections.push(...quote.countries.map(c => ({ country: c.id, filed: g.year, expires: quote.ip!.created + nationalPatentLaw(c.id, quote.ip!.created).term })))
  quote.a.details.inventorIp = quote.ip as unknown as Json
  notice(g, 'Personal Patents Filed', `${quote.a.name}: ${quote.countries.length} new national filings for ${formatMoney(quote.cost)} from your personal savings. Existing filings were not charged again. Original national patent terms are unchanged.`, { emoji: '🌍' })
  return true
}

export function assignPersonalInvention(g: GameState, id: string, assetId: string, license = false): boolean {
  const a = personalInventions(g).find(a => a.id === id), company = findBusiness(g, assetId)
  if (!a || !company || blocked(g, 18) || manageBlock(g, company)) return false
  const ip = readInventionIp(a)!, b = bizOf(g, company), products = inventionProductsOf(b)
  if (!inventionIndustryCompatible(ip.field, b.industry) || (products.some(p => p.id === id && (p.rights === 'owned' || p.expires > g.year)))) return false
  // Assignment must not silently revoke licences already granted to another company.
  if (!license && businessAssets(g).some(company => inventionProductsOf(readBiz(g, company)).some(p => p.ipId === id && p.rights === 'license' && p.expires > g.year))) return false
  const product = newInventionProduct(id, a.name, ip.field, ip.kind, g.year)
  product.price = ip.unitPrice; product.unitCost = ip.unitCost; product.potential = ip.potential
  product.marketFit = ip.marketFit; product.reliability = ip.reliability
  // Renewal preserves already-paid inventory, the production plan and the sales history.
  const existing = products.find(p => p.id === id)
  if (existing) Object.assign(product, { price: existing.price, production: existing.production, inventory: existing.inventory, sold: existing.sold, revenue: existing.revenue, costs: existing.costs, lastYear: existing.lastYear,
    fabCapacity: existing.fabCapacity, fabInvested: existing.fabInvested, upgradeLevel: existing.upgradeLevel, upgradeInvested: existing.upgradeInvested })
  product.rights = license ? 'license' : 'owned'; product.royalty = license ? .05 : 0; product.expires = license ? g.year + 5 : 0
  product.protections = ip.protections.map(t => ({ ...t }))
  saveInventionProducts(b, [...products.filter(p => p.id !== id), product])
  if (!license) {
    const x = expansionOf(b)
    x.patents.push({ id, name: a.name, kind: ip.kind, launched: ip.created, expires: ip.protections.find(p => p.country === ip.country)?.expires ?? ip.created, ownerId: company.id, demand: 0, efficiency: 0, protections: ip.protections })
    saveExpansion(b, x)
    transferExternalInventionLicenses(g, a, company, id)
    g.assets = g.assets.filter(candidate => candidate.id !== id)
    transferInventionImpact(g, id, company.id)
  }
  notice(g, license ? 'Product Licensed' : 'IP Assigned to Company', `${company.name} can manufacture ${a.name}. ${license ? 'You retain the IP and receive 5% of actual gross product sales for five years.' : 'The company now owns the IP, patent rights and any outside manufacturing contracts; it is no longer a separate personal asset.'} Under Owned Inventions, fund fab capacity, upgrade the technology, set any nonnegative price and plan output with a production slider. No product units or sales are created by signing this agreement.`, { emoji: '🏭' })
  return true
}

export function inventionAssetNodes(g: GameState, id: string): MenuNode[] {
  const a = personalInventions(g).find(a => a.id === id)
  if (!a) return []
  const ip = readInventionIp(a)!
  const product = { ...newInventionProduct(id, a.name, ip.field, ip.kind, ip.created), price: ip.unitPrice, unitCost: ip.unitCost, potential: ip.potential, marketFit: ip.marketFit, reliability: ip.reliability }
  const market = inventionMarketDemand(g, product, ip.country, g.year, ip.protections)
  const nodes: MenuNode[] = [{ type: 'info', id: `inventor.ip.info.${id}`, emoji: '💡', text: `${a.name}: personally owned ${ip.field} IP, invented ${ip.created}. Initial product price ${formatMoney(ip.unitPrice)}/unit; manufacturing cost ${formatMoney(ip.unitCost)}/unit. Current estimated home-market demand ${market.demand.toLocaleString('en-US')} units/year at that price; monopoly reference price ${formatMoney(market.referencePrice)}. Demand and willingness to pay decline with patent age, competition and leaks. Manufacture with a company and cash-built fabs, or license to outside manufacturers without owning a factory. These are estimates, not guaranteed sales. ${ip.protections.length} national patent filings. ${ip.protections.map(t => `${getCountry(t.country).name}: ${t.expires > g.year ? `protected through ${t.expires - 1}` : 'expired'}`).join('; ')}.` },
    { type: 'action', id: `inventor.ip.patent.all.${id}`, label: 'Patent in All Nations', emoji: '🌐', subtitle: gg => { const q = personalPatentQuote(gg, id, 'all'); return `${q.countries.length} new filings · ${formatMoney(q.cost)} personal funds` }, disabledReason: gg => personalPatentQuote(gg, id, 'all').reason, confirm: gg => `Pay ${formatMoney(personalPatentQuote(gg, id, 'all').cost)} from your savings for every missing national patent? Already-filed countries are skipped; patent terms are not extended.`, run: gg => { filePersonalInventionPatent(gg, id, 'all') } },
    { type: 'menu', id: `inventor.ip.patent.nations.${id}`, label: 'Patent in One Nation', emoji: '🌍', children: () => COUNTRIES.map(c => ({ type: 'action', id: `inventor.ip.patent.${id}.${c.id}`, label: c.name, emoji: c.flag, subtitle: formatMoney(nationalPatentLaw(c.id, g.year).filingCost), disabledReason: gg => personalPatentQuote(gg, id, c.id).reason, run: gg => { filePersonalInventionPatent(gg, id, c.id) } })) }]
  for (const company of businessAssets(g).filter(company => inventionIndustryCompatible(ip.field, readBiz(g, company).industry))) {
    for (const license of [true, false]) nodes.push({ type: 'action', id: `inventor.ip.${license ? 'license' : 'assign'}.${id}.${company.id}`, label: `${license ? 'License to' : 'Assign IP to'} ${company.name}`, emoji: '🏭', subtitle: license ? 'Retain personal IP · five-year licence · 5% of actual product sales' : 'Transfer ownership permanently to this company', disabledReason: gg => { const live = findBusiness(gg, company.id); return blocked(gg, 18) ?? (!personalInventions(gg).some(a => a.id === id) ? 'You no longer own this personal IP.' : !live ? 'This company is no longer yours.' : manageBlock(gg, live) ?? (inventionProductsOf(readBiz(gg, live)).some(p => p.id === id && (p.rights === 'owned' || p.expires > gg.year)) ? 'This company already has active rights.' : !license && businessAssets(gg).some(other => inventionProductsOf(readBiz(gg, other)).some(p => p.ipId === id && p.rights === 'license' && p.expires > gg.year)) ? 'Wait for active company licences to expire before transferring ownership.' : null)) }, confirm: () => license ? `License ${a.name} to ${company.name} for five years at 5% of actual product sales? You retain ownership.` : `Permanently assign ${a.name} and its patents to ${company.name}? The company, not you personally, will own this IP.`, run: gg => { assignPersonalInvention(gg, id, company.id, license) } })
  }
  if (nodes.length === 3) nodes.push({ type: 'info', id: `inventor.ip.company.${id}`, text: 'Found or acquire a compatible production company to manufacture this invention, or license to outside manufacturers below without building your own fabs. Financial firms cannot manufacture products.' })
  nodes.push(...externalInventionLicenseNodes(g, { assetId: id, inventionId: id }), ...inventionImpactNodes(g, id))
  return nodes
}

const START_RESEARCH = defineScript('inventor.personal.start', (g, name, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.topic !== 'string') return
  const approach = data.approach === 'practical' || data.approach === 'frontier' ? data.approach : 'balanced'
  startPersonalResearch(g, data.topic, name, approach)
})

function topicMenu(topicId: string): MenuGroup {
  const topic = inventionTopic(topicId)!, tier = INVENTION_TIERS[topic.tier]
  return { type: 'menu', id: `inventor.topic.${topicId}`, label: topic.name, emoji: '🔬', subtitle: `${topic.field} · ${tier.label} · ${tier.years ? `${tier.years} active years` : 'instant after study'} · 100% completion`, children: g => {
    const study = inventorView(g).studies.find(s => s.topic === topicId), quote = personalResearchQuote(g, topicId)!
    return [{ type: 'info', id: `inventor.topic.info.${topicId}`, text: `${topic.note} Study ${study?.points ?? 0}/2 points; last studied ${study?.year ?? 'never'}. Research budget ${formatMoney(quote.budget)}, paid personally, includes the home patent. You may give your invention a custom product name. Large discoveries are explicitly fictional alternate history.` },
      ...[false, true].map((online): MenuNode => ({ type: 'action', id: `inventor.study.${online ? 'online' : 'library'}.${topicId}`, label: online ? 'Research This Topic Online' : 'Study This Topic at the Library', emoji: online ? '💻' : '📚', subtitle: `${online ? '2 points · ' + formatMoney(30) : '1 point · ' + formatMoney(10)} · personal funds · ${yearActionsUsed(g, 'inventor.study')}/4 study sessions`, disabledReason: gg => blocked(gg, 8) ?? (!hasTalent(gg, 'Inventor') ? 'Requires the Inventor talent.' : online && gg.year < 1995 ? 'Online research opens in 1995.' : yearActionsUsed(gg, 'inventor.study') >= 4 ? 'You used all four topic-study sessions this year.' : gg.character.money < (online ? 30 : 10) ? 'Not enough personal savings.' : null), run: gg => { studyInventionTopic(gg, topicId, online) } })),
      ...RESEARCH_APPROACHES.map((method): MenuNode => ({ type: 'action', id: `inventor.research.${topicId}${method.id === 'balanced' ? '' : '.' + method.id}`, label: `Fund ${method.label}`, emoji: '💡',
        subtitle: `${formatMoney(personalResearchQuote(g, topicId, method.id)!.budget)} · ${method.note}`,
        disabledReason: gg => personalResearchBlock(gg, topicId, method.id),
        confirm: gg => `Commit ${formatMoney(personalResearchQuote(gg, topicId, method.id)!.budget)} of your savings? ${method.note} The invention completes in ${tier.years} active years; sales are not guaranteed.`,
        run: gg => { if (personalResearchBlock(gg, topicId, method.id)) return; scriptInput(gg, { title: 'Your Invention Name', text: 'Use the suggested name or name your own idea in this research field.', emoji: '💡', input: 'text', defaultValue: topic.name, scriptId: START_RESEARCH, data: { topic: topicId, approach: method.id } }) },
      }))]
  } }
}

export const personalInventorMenu: MenuGroup = {
  type: 'menu', id: 'inventor.personal', label: 'Inventor', emoji: '💡', visible: g => g.character.alive && hasTalent(g, 'Inventor'),
  subtitle: 'Specific-topic research · personal budgets · owned IP and products',
  header: g => { const p = inventorView(g); return p.project ? `${p.project.name}: ${p.project.progress}/${p.project.years} active research years. Budget ${formatMoney(p.project.budget)} already paid; completion guaranteed. Prison pauses progress.` : 'Study a specific topic at the library (or online from 1995), then personally fund its research. Completion is guaranteed; commercial success still needs a company, production, staff, cash and customers.' },
  children: g => [{ type: 'info', id: 'inventor.personal.help', text: 'Study a topic, choose a research approach, then turn the resulting IP into a business or a licensing deal. Research always yields an invention; customer fit, manufacturing cost and competing technology decide whether it becomes profitable.' },
    ...(inventorView(g).project ? (['engineering', 'customers'] as const).map((kind): MenuNode => ({ type: 'action', id: `inventor.experiment.${kind}`, label: kind === 'engineering' ? 'Test the Prototype' : 'Run a Customer Trial', emoji: '🔬', subtitle: `${formatMoney(Math.max(100, Math.round(inventorView(g).project!.budget * .08)))} · choose one experiment per year · ${kind === 'engineering' ? 'improve reliability and manufacturing cost' : 'improve customer fit'}`, disabledReason: gg => blocked(gg, 16) ?? (!inventorView(gg).project ? 'No active project.' : inventorView(gg).project!.experimentYear === gg.year ? 'An experiment was already funded this year.' : gg.character.money < Math.max(100, Math.round(inventorView(gg).project!.budget * .08)) ? 'Not enough savings.' : null), run: gg => { researchExperiment(gg, kind) } })) : []),
    ...personalInventions(g).map((a): MenuNode => ({ type: 'menu', id: `inventor.ip.${a.id}`, label: a.name, emoji: '💡', subtitle: 'Personally owned IP · patents · assignment and licensing', children: gg => inventionAssetNodes(gg, a.id) })),
    ...INVENTION_TOPICS.map(topic => topicMenu(topic.id))],
}
