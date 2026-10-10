// Personal research: acquire expertise, test an idea, then commercialize verified IP.
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
import { INVENTION_FIELDS, INVENTION_TOPICS, inventionIndustryCompatible, inventionResearchRule, inventionTopic, PRODUCT_SPECS } from './inventor-data'
import { inventorView, personalInventions, readInventionIp, saveInventor, type PersonalResearch } from './inventor-state'
import { registerInventionBreakthrough, inventionImpactNodes, transferInventionImpact } from './invention-impact'
import { externalInventionLicenseNodes, transferExternalInventionLicenses } from './business/invention-licensing'
import { bound, economicRoll } from './economy'
import type { ResearchApproach } from './inventor-state'
import { applyInventorGrant, gainInventorExpertise, inventorBackground, inventorCareerNodes, inventorGrantQuote, inventorJournal, yearlyInventorCareer } from './inventor-career'
import { advanceInventorResearch, researchManagementNodes } from './inventor-research'
import { payForResearch, researchPayer, researchPaymentBlock, researchSponsorBlock } from './inventor-funding'
import { closedInventions, installClosedInvention } from './business/closed-inventions'
import { ownerControls } from './business/board'
import { leadershipPower } from './business/leadership'

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
  const expertiseGain = (online ? 5 : 3) + inventorBackground(g, topic.field)
  gainInventorExpertise(p, topic.field, expertiseGain)
  saveInventor(g, p)
  addStat(g, 'smarts', 1)
  notice(g, online ? 'Online Topic Research' : 'Library Topic Research', `You studied ${topic.name.toLowerCase()} ${online ? 'through online research' : 'at the library'}. Topic knowledge +${online ? 2 : 1}; ${topic.field} expertise +${expertiseGain}${inventorBackground(g, topic.field) ? ' including your relevant educational or professional background' : ''}. More ambitious work needs deeper preparation and suitable research infrastructure. Four study sessions per year are shared across all topics. You paid ${formatMoney(cost)}.`, { emoji: '📚' })
  return true
}

export function personalResearchQuote(g: GameState, topicId: string, approach: ResearchApproach = 'balanced', sponsorId = '') {
  const topic = inventionTopic(topicId)
  if (!topic) return null
  const tier = INVENTION_TIERS[topic.tier], rule = inventionResearchRule(topicId)!, p = inventorView(g)
  const method = RESEARCH_APPROACHES.find(a => a.id === approach) ?? RESEARCH_APPROACHES[1]
  const years = rule.years + (approach === 'frontier' ? 1 : 0)
  const sponsor = sponsorId ? findBusiness(g, sponsorId) : null
  const country = sponsor ? readBiz(g, sponsor).countryId : g.character.countryId
  const budget = Math.round(tier.minimum * method.cost) + (topic.field === 'finance' ? 0 : nationalPatentLaw(country, g.year + years).filingCost)
  const grant = !sponsorId && topic.field !== 'finance' && p.grant?.topic === topicId && p.grant.expires >= g.year ? Math.min(budget, p.grant.amount) : 0
  return { topic, years, budget, grant, personalCost: budget - grant, rule }
}
export function personalResearchBlock(g: GameState, topicId: string, approach: ResearchApproach = 'balanced', sponsorId = ''): string | null {
  const quote = personalResearchQuote(g, topicId, approach, sponsorId), p = inventorView(g)
  const study = p.studies.find(s => s.topic === topicId)
  return blocked(g, 16) ?? (!hasTalent(g, 'Inventor') ? 'Requires the Inventor talent.' : !quote ? 'Unknown research topic.'
    : p.project ? 'Finish your active personal research project first.'
      : p.work.some(work => work.topic === topicId) ? 'You already developed this idea. Upgrade its existing company product or explore another topic; renaming the same invention cannot restart its patent.'
      : g.year < quote.rule.availableFrom ? `The required research infrastructure becomes available in ${quote.rule.availableFrom}. Study the underlying field meanwhile.`
        : !study || study.points < quote.rule.study || study.year > g.year || g.year - study.year > 3 ? `Study this specific topic to ${quote.rule.study} points; the last study must be within three years.`
          : (p.expertise[quote.topic.field] ?? 0) < quote.rule.expertise ? `Build ${quote.topic.field} expertise to ${quote.rule.expertise}/100 through study, workshop practice and smaller projects.`
        : yearActionsUsed(g, 'inventor.project') >= 1 ? 'You already began a research project this year.'
          : sponsorId ? researchSponsorBlock(g, sponsorId, topicId, quote.budget)
          : g.character.money < quote.personalCost ? `Your personal contribution needs ${formatMoney(quote.personalCost)}.` : null)
}

export function startPersonalResearch(g: GameState, topicId: string, name?: string, approach: ResearchApproach = 'balanced', sponsorId = ''): boolean {
  const quote = personalResearchQuote(g, topicId, approach, sponsorId)
  if (!RESEARCH_APPROACHES.some(a => a.id === approach) || !quote || personalResearchBlock(g, topicId, approach, sponsorId)) return false
  const title = (name ?? quote.topic.name).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!title) return false
  const p = inventorView(g)
  const sponsor = sponsorId ? findBusiness(g, sponsorId)! : null
  const project: PersonalResearch = { id: '', topic: topicId, name: title, kind: quote.topic.tier, started: g.year, progress: 0, years: quote.years, budget: quote.budget, country: sponsor ? readBiz(g, sponsor).countryId : g.character.countryId, model: 'career', pace: 'balanced', revision: false, attempts: 0, setbacks: 0, personalCost: 0, grant: quote.grant, sponsorId, companyCost: 0 }
  if (!payForResearch(g, project, sponsorId ? quote.budget : quote.personalCost)) return false
  useYearAction(g, 'inventor.project', 1)
  project.id = uid(g, 'invention'); p.project = project
  p.project.approach = approach
  p.project.engineering = Math.min(100, 25 + (p.studies.find(s => s.topic === topicId)?.points ?? 2) * 3 + (p.expertise[quote.topic.field] ?? 0) * .35 + inventorBackground(g, quote.topic.field) * 2 + (approach === 'practical' ? 10 : 0))
  p.project.validation = approach === 'practical' ? 30 : approach === 'frontier' ? 10 : 20
  if (quote.grant > 0) p.grant = null
  inventorJournal(g, p, `Funded ${title}: ${formatMoney(sponsorId ? quote.budget : quote.personalCost)} from ${researchPayer(g, project)}${quote.grant ? ` and ${formatMoney(quote.grant)} restricted grant support` : ''}.`)
  p.lastYear = g.year
  saveInventor(g, p)
  count(g, 'inventionProjects')
  notice(g, sponsor ? 'Company Research Funded' : 'Personal Research Funded', `${title}: ${quote.years} planned research years, followed by ${quote.topic.field === 'finance' ? 'confidential validation on unseen data' : 'independent validation'}. Paid ${formatMoney(sponsor ? quote.budget : quote.personalCost)} from ${researchPayer(g, project)}${quote.grant ? `; the grant supplied ${formatMoney(quote.grant)}` : ''}. ${sponsor ? `${sponsor.name} owns the result and funds experiments, collaborators and redesigns. You are lead inventor; keep a hired CEO in place or research pauses. ` : 'You own the result. '}${quote.topic.field === 'finance' ? 'This system remains a closed-loop trade secret: no patent, public release or licensing.' : 'The prepaid program includes the home patent if successful.'} Failed tests may require a funded redesign. Prison pauses research.`, { emoji: '💡' })
  return true
}

function completePersonalResearch(g: GameState, project: PersonalResearch): void {
  const p = inventorView(g)
  if (!p.project || p.project.id !== project.id || g.assets.some(a => a.id === project.id)) return
  const topic = inventionTopic(project.topic)!, spec = PRODUCT_SPECS[project.kind]
  const marketRoll = economicRoll(`${g.lifeId}|research-fit|${project.id}`), engineering = project.engineering ?? 50, validation = project.validation ?? 35
  const practical = project.approach === 'practical', frontier = project.approach === 'frontier'
  const modern = project.model === 'career'
  const closedLoop = topic.field === 'finance'
  if (project.sponsorId && researchSponsorBlock(g, project.sponsorId, project.topic)) return
  const marketFit = modern ? bound((practical ? .25 + marketRoll * .45 : frontier ? .02 + marketRoll * 1.3 : .08 + marketRoll * .9) + validation * .004, .1, 1.6) : bound((practical ? .65 : frontier ? .2 + marketRoll * 1.4 : .55 + marketRoll * .6) + validation * .004, .2, 1.9)
  const reliability = bound(.55 + engineering * .006 + (practical ? .18 : frontier ? -.12 : 0), .45, 1.25)
  const ip = { v: modern ? 3 : 2, topic: project.topic, field: topic.field, kind: project.kind, created: g.year, country: project.country, budget: project.budget, unitPrice: spec.price, unitCost: Math.round(spec.cost / reliability), potential: spec.demand, marketFit, reliability, evidenceBased: modern, inventor: `${g.character.firstName} ${g.character.lastName}`, contributors: project.collaborator ?? '',
    closedLoop, protections: closedLoop ? [] : [{ country: project.country, filed: g.year, expires: g.year + nationalPatentLaw(project.country, g.year).term }] }
  g.assets.push({ id: project.id, kind: 'invention', name: project.name, emoji: '💡', purchasePrice: project.personalCost ?? project.budget, value: Math.round(project.budget * (modern ? .1 * marketFit : .5)), condition: 100, purchasedAge: g.character.age, upkeep: 0, details: { inventorIp: ip as unknown as Json } })
  p.work = [...p.work, { id: project.id, name: project.name, topic: project.topic, year: g.year, units: 0, royalties: 0, recognition: 0, contributors: project.collaborator ?? '' }].slice(-100)
  gainInventorExpertise(p, topic.field, 5)
  if (!closedLoop) p.reputation = Math.min(100, p.reputation + (project.kind === 'generational' ? 8 : project.kind === 'big' ? 5 : 2))
  inventorJournal(g, p, `${project.name} passed ${closedLoop ? 'confidential validation; the method stays secret' : 'replication; a working prototype and patent'}.`)
  p.project = null
  saveInventor(g, p)
  count(g, 'inventions')
  if (project.sponsorId) {
    assignPersonalInvention(g, project.id, project.sponsorId)
    log(g, `I led the research for ${project.name}; the sponsoring company owns the result.`, 'good')
    if (!closedLoop) registerInventionBreakthrough(g, { id: project.id, name: project.name, kind: project.kind, field: topic.field, created: g.year, country: project.country, evidenceBased: modern })
    return
  }
  if (closedLoop) {
    notice(g, 'Private Financial System Completed', `${project.name} passed confidential validation. You hold a trade secret, with no public announcement or patent. Assign it to a financial institution you control for exclusive internal use. No sales or money are created by completing research.`, { emoji: '🔒', tone: 'good' })
    return
  }
  registerInventionBreakthrough(g, { id: project.id, name: project.name, kind: project.kind, field: topic.field, created: g.year, country: project.country, evidenceBased: modern })
  log(g, `I invented ${project.name} and retained the intellectual property.`, 'good')
  log(g, `Prototype results: ${marketFit < .65 ? 'a narrow customer niche' : marketFit > 1.2 ? 'strong customer interest' : 'promising but unproven demand'}; ${reliability < .8 ? 'manufacturing needs extra care' : 'a reliable design'}.`, marketFit < .65 ? 'neutral' : 'good')
  notice(g, 'Invention Completed', `${project.name} is now your personally owned IP. You hold the ${getCountry(project.country).name} patent. Assign it to a compatible company, build fabs and set any price and slider-based output. Or retain ownership and license manufacturing to your companies or outside partners who fund their own fabs. Staff and working capital still limit actual output. Breakthrough demand and monopoly pricing fade as patents count down; technology upgrades do not extend them. Inventing alone creates no sales income. Foreign national or all-nations filings remain available through ${g.year + 1}.`, { emoji: '💡', tone: 'good' })
}

export function yearlyInventor(g: GameState): void {
  if (!g.character.alive) return
  yearlyInventorCareer(g)
  const p = inventorView(g)
  if (!p.project || p.lastYear >= g.year) return
  p.lastYear = g.year
  let completed = false
  if (!g.character.prison) {
    const sponsorBlock = p.project.sponsorId ? researchSponsorBlock(g, p.project.sponsorId, p.project.topic) : null
    if (sponsorBlock) p.project.notes = sponsorBlock
    else if (p.project.model === 'career') completed = advanceInventorResearch(g, p)
    else { p.project.progress += 1; completed = p.project.progress >= p.project.years }
  }
  saveInventor(g, p)
  if (completed) completePersonalResearch(g, p.project)
}

export function researchExperiment(g: GameState, kind: 'engineering' | 'customers'): boolean {
  const p = inventorView(g), project = p.project
  if (!project || blocked(g, 16) || project.experimentYear === g.year || !['engineering', 'customers'].includes(kind)) return false
  const cost = Math.max(100, Math.round(project.budget * .08))
  if (!payForResearch(g, project, cost)) return false
  const sponsor = project.sponsorId ? findBusiness(g, project.sponsorId) : null
  const team = sponsor ? leadershipPower(readBiz(g, sponsor), kind === 'engineering' ? 'quality' : inventionTopic(project.topic)?.field === 'finance' ? 'finance' : 'sales') : 0
  const gain = 10 + Math.round(team * 8) + Math.floor(economicRoll(`${g.lifeId}|experiment|${project.id}|${g.year}|${kind}`) * 14)
  project.experimentYear = g.year
  if (project.model === 'career') { gainInventorExpertise(p, inventionTopic(project.topic)!.field, 2); p.strain = Math.min(100, p.strain + 4) }
  if (kind === 'engineering') project.engineering = Math.min(100, (project.engineering ?? 50) + gain)
  else project.validation = Math.min(100, (project.validation ?? 35) + gain)
  saveInventor(g, p)
  const closedLoop = inventionTopic(project.topic)?.field === 'finance'
  notice(g, closedLoop ? 'Confidential Model Validation' : kind === 'engineering' ? 'Prototype Tested' : 'Customer Trial', `${formatMoney(cost)} from ${researchPayer(g, project)} funded ${closedLoop ? kind === 'engineering' ? 'internal stress tests and robustness checks' : 'validation against unseen historical data, without disclosing the model' : kind === 'engineering' ? 'durability and manufacturing experiments' : 'observations and interviews with potential customers'}. Evidence +${gain}${team ? ' including your leadership team’s contribution' : ''}. You can choose another experiment next year. Research schedules can slip.`, { emoji: '🔬' })
  return true
}

function personalPatentQuote(g: GameState, id: string, country: string | 'all') {
  const a = personalInventions(g).find(a => a.id === id), ip = a ? readInventionIp(a)! : null
  const countries = ip ? COUNTRIES.filter(c => (country === 'all' || c.id === country) && !ip.protections.some(t => t.country === c.id)) : []
  const cost = countries.reduce((sum, c) => sum + nationalPatentLaw(c.id, g.year).filingCost, 0)
  const reason = blocked(g, 16) ?? (!ip ? 'You no longer own this personal IP.' : ip.closedLoop ? 'Closed-loop financial systems are never patented or disclosed.' : g.year < ip.created || g.year > ip.created + 1 ? 'The foreign patent filing window has ended.' : !countries.length ? 'No new national filings remain.' : g.character.money < cost ? `You need ${formatMoney(cost)} in personal savings.` : null)
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
  if (ip.closedLoop) {
    if (license || !ownerControls(g, company) || !installClosedInvention(b, a)) return false
    g.assets = g.assets.filter(candidate => candidate.id !== id)
    notice(g, 'Private System Assigned', `${company.name} now owns ${a.name} for exclusive internal use. ${ip.inventor} remains credited as lead inventor. The method is never published, patented, sold as a product or licensed. View it under Financial Operations.`, { emoji: '🔒' })
    return true
  }
  if (!inventionIndustryCompatible(ip.field, b.industry) || (products.some(p => p.id === id && (p.rights === 'owned' || p.expires > g.year)))) return false
  // Assignment must not silently revoke licences already granted to another company.
  if (!license && businessAssets(g).some(company => inventionProductsOf(readBiz(g, company)).some(p => p.ipId === id && p.rights === 'license' && p.expires > g.year))) return false
  const product = newInventionProduct(id, a.name, ip.field, ip.kind, g.year)
  product.price = ip.unitPrice; product.unitCost = ip.unitCost; product.potential = ip.potential
  product.marketFit = ip.marketFit; product.reliability = ip.reliability; product.evidenceBased = ip.evidenceBased
  product.inventor = ip.inventor; product.contributors = ip.contributors
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
  if (ip.closedLoop) return [{ type: 'info', id: `inventor.secret.${id}`, text: `${a.name} · confidential financial IP. Lead inventor: ${ip.inventor}${ip.contributors ? `; collaborator: ${ip.contributors}` : ''}. No patents, public release, manufacturing or licensing. Permanently assign it to one financial institution you control for internal use.` },
    ...businessAssets(g).filter(company => inventionIndustryCompatible('finance', readBiz(g, company).industry)).map((company): MenuNode => ({ type: 'action', id: `inventor.secret.assign.${id}.${company.id}`, label: `Deploy privately at ${company.name}`, emoji: '🔒', subtitle: 'Company becomes exclusive owner · no licensing or public disclosure', disabledReason: gg => { const live = findBusiness(gg, company.id); return !live ? 'Company unavailable.' : manageBlock(gg, live) ?? (!ownerControls(gg, live) ? 'Requires company control.' : closedInventions(readBiz(gg, live)).some(row => row.topic === ip.topic) ? 'This company already uses that method.' : !personalInventions(gg).some(asset => asset.id === id) ? 'You no longer own this method.' : null) }, confirm: () => `Transfer ${a.name} permanently to ${company.name} for exclusive internal use?`, run: gg => { assignPersonalInvention(gg, id, company.id) } }))]
  const product = { ...newInventionProduct(id, a.name, ip.field, ip.kind, ip.created), price: ip.unitPrice, unitCost: ip.unitCost, potential: ip.potential, marketFit: ip.marketFit, reliability: ip.reliability, evidenceBased: ip.evidenceBased }
  const market = inventionMarketDemand(g, product, ip.country, g.year, ip.protections)
  const nodes: MenuNode[] = [{ type: 'info', id: `inventor.ip.info.${id}`, emoji: '💡', text: `${a.name}: personally owned ${ip.field} IP, invented ${ip.created}. Initial product price ${formatMoney(ip.unitPrice)}/unit; manufacturing cost ${formatMoney(ip.unitCost)}/unit. Current estimated home-market demand ${market.demand.toLocaleString('en-US')} units/year at that price; monopoly reference price ${formatMoney(market.referencePrice)}. Demand and willingness to pay decline with patent age, competition and leaks. Manufacture with a company and cash-built fabs, or license to outside manufacturers without owning a factory. These are estimates, not guaranteed sales. ${ip.protections.length} national patent filings. ${ip.protections.map(t => `${getCountry(t.country).name}: ${t.expires > g.year ? `protected through ${t.expires - 1}` : 'expired'}`).join('; ')}.` },
    { type: 'action', id: `inventor.ip.patent.all.${id}`, label: 'Patent in All Nations', emoji: '🌐', subtitle: gg => { const q = personalPatentQuote(gg, id, 'all'); return `${q.countries.length} new filings · ${formatMoney(q.cost)} personal funds` }, disabledReason: gg => personalPatentQuote(gg, id, 'all').reason, confirm: gg => `Pay ${formatMoney(personalPatentQuote(gg, id, 'all').cost)} from your savings for every missing national patent? Already-filed countries are skipped; patent terms are not extended.`, run: gg => { filePersonalInventionPatent(gg, id, 'all') } },
    { type: 'menu', id: `inventor.ip.patent.nations.${id}`, label: 'Patent in One Nation', emoji: '🌍', children: () => COUNTRIES.map(c => ({ type: 'action', id: `inventor.ip.patent.${id}.${c.id}`, label: c.name, emoji: c.flag, subtitle: formatMoney(nationalPatentLaw(c.id, g.year).filingCost), disabledReason: gg => personalPatentQuote(gg, id, c.id).reason, run: gg => { filePersonalInventionPatent(gg, id, c.id) } })) }]
  for (const company of businessAssets(g).filter(company => inventionIndustryCompatible(ip.field, readBiz(g, company).industry))) {
    for (const license of [true, false]) nodes.push({ type: 'action', id: `inventor.ip.${license ? 'license' : 'assign'}.${id}.${company.id}`, label: `${license ? 'License to' : 'Assign IP to'} ${company.name}`, emoji: '🏭', subtitle: license ? 'Retain personal IP · five-year licence · 5% of actual product sales' : 'Transfer ownership permanently to this company', disabledReason: gg => { const live = findBusiness(gg, company.id); return blocked(gg, 18) ?? (!personalInventions(gg).some(a => a.id === id) ? 'You no longer own this personal IP.' : !live ? 'This company is no longer yours.' : manageBlock(gg, live) ?? (inventionProductsOf(readBiz(gg, live)).some(p => p.id === id && (p.rights === 'owned' || p.expires > gg.year)) ? 'This company already has active rights.' : !license && businessAssets(gg).some(other => inventionProductsOf(readBiz(gg, other)).some(p => p.ipId === id && p.rights === 'license' && p.expires > gg.year)) ? 'Wait for active company licences to expire before transferring ownership.' : null)) }, confirm: () => license ? `License ${a.name} to ${company.name} for five years at 5% of actual product sales? You retain ownership.` : `Permanently assign ${a.name} and its patents to ${company.name}? The company, not you personally, will own this IP.`, run: gg => { assignPersonalInvention(gg, id, company.id, license) } })
  }
  if (ip.inventor) nodes.unshift({ type: 'info', id: `inventor.ip.credit.${id}`, text: `Invented by ${ip.inventor}${ip.contributors ? `, with ${ip.contributors}` : ''}. ${ip.evidenceBased ? 'Independently tested prototype. Early adoption starts with a small customer base and can grow as production proves itself.' : 'Previously completed IP; existing commercial terms are preserved.'}` })
  if (!businessAssets(g).some(company => inventionIndustryCompatible(ip.field, readBiz(g, company).industry))) nodes.push({ type: 'info', id: `inventor.ip.company.${id}`, text: 'Found or acquire a compatible production company to manufacture this invention, or license to outside manufacturers below without building your own fabs. Financial firms cannot manufacture products.' })
  nodes.push(...externalInventionLicenseNodes(g, { assetId: id, inventionId: id }), ...inventionImpactNodes(g, id))
  return nodes
}

const START_RESEARCH = defineScript('inventor.personal.start', (g, name, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.topic !== 'string') return
  const approach = data.approach === 'practical' || data.approach === 'frontier' ? data.approach : 'balanced'
  startPersonalResearch(g, data.topic, name, approach, typeof data.sponsorId === 'string' ? data.sponsorId : '')
})

function topicMenu(topicId: string): MenuGroup {
  const topic = inventionTopic(topicId)!, tier = INVENTION_TIERS[topic.tier], rule = inventionResearchRule(topicId)!
  return { type: 'menu', id: `inventor.topic.${topicId}`, label: topic.name, emoji: '🔬', subtitle: `${tier.label} · ${rule.years}+ years · ${rule.speculative ? 'speculative alternate history' : 'research, prototype, validation'}`, children: g => {
    const p = inventorView(g), study = p.studies.find(s => s.topic === topicId), quote = personalResearchQuote(g, topicId)!
    return [{ type: 'info', id: `inventor.topic.info.${topicId}`, text: `${topic.note} Topic knowledge ${study?.points ?? 0}/${rule.study}; ${topic.field} expertise ${Math.round(p.expertise[topic.field] ?? 0)}/100 (${rule.expertise ? `${rule.expertise} required` : 'beginner-friendly'}). Last studied ${study?.year ?? 'never'}. ${g.year < rule.availableFrom ? `Practical research infrastructure becomes available in ${rule.availableFrom}. ` : ''}Planned research ${rule.years}+ years; ${rule.engineering}/100 technical evidence and ${rule.validation}/100 ${topic.field === 'finance' ? 'held-out data validation. Private systems have no patent costs or public grants.' : 'customer evidence are needed before independent replication. Budget includes the home patent if successful.'} ${rule.speculative ? 'This is a fictional frontier research project; success is uncertain.' : ''}` },
      ...[false, true].map((online): MenuNode => ({ type: 'action', id: `inventor.study.${online ? 'online' : 'library'}.${topicId}`, label: online ? 'Research This Topic Online' : 'Study This Topic at the Library', emoji: online ? '💻' : '📚', subtitle: `${online ? '2 points · ' + formatMoney(30) : '1 point · ' + formatMoney(10)} · personal funds · ${yearActionsUsed(g, 'inventor.study')}/4 study sessions`, disabledReason: gg => blocked(gg, 8) ?? (!hasTalent(gg, 'Inventor') ? 'Requires the Inventor talent.' : online && gg.year < 1995 ? 'Online research opens in 1995.' : yearActionsUsed(gg, 'inventor.study') >= 4 ? 'You used all four topic-study sessions this year.' : gg.character.money < (online ? 30 : 10) ? 'Not enough personal savings.' : null), run: gg => { studyInventionTopic(gg, topicId, online) } })),
      ...RESEARCH_APPROACHES.map((method): MenuNode => ({ type: 'action', id: `inventor.research.${topicId}${method.id === 'balanced' ? '' : '.' + method.id}`, label: `Fund ${method.label}`, emoji: '💡',
        subtitle: `${formatMoney(personalResearchQuote(g, topicId, method.id)!.personalCost)} personal funds · ${personalResearchQuote(g, topicId, method.id)!.years}+ years · ${method.note}`,
        disabledReason: gg => personalResearchBlock(gg, topicId, method.id),
        confirm: gg => { const q = personalResearchQuote(gg, topicId, method.id)!; return `Spend ${formatMoney(q.personalCost)} of your savings${q.grant ? ` plus ${formatMoney(q.grant)} restricted grant support` : ''} on this ${q.years}-year research program? ${method.note} Experiments may fail and require more funding; neither completion nor sales are guaranteed. Spent funding is not refundable.` },
        run: gg => { if (personalResearchBlock(gg, topicId, method.id)) return; scriptInput(gg, { title: 'Your Invention Name', text: 'Use the suggested name or name your own idea in this research field.', emoji: '💡', input: 'text', defaultValue: topic.name, scriptId: START_RESEARCH, data: { topic: topicId, approach: method.id } }) },
      })),
      { type: 'menu', id: `inventor.sponsor.${topicId}`, label: 'Company-funded Research · You Lead', emoji: '🏢', subtitle: 'Hire a CEO · company pays and owns the result · retain inventor credit', children: gg => {
        const companies = businessAssets(gg).filter(a => inventionIndustryCompatible(topic.field, readBiz(gg, a).industry))
        if (!companies.length) return [{ type: 'info', id: `inventor.sponsor.none.${topicId}`, text: 'Found or acquire a compatible company, then hire a CEO under its Leadership menu. Financial research requires a bank or investment firm.' }]
        return companies.map((company): MenuNode => ({ type: 'menu', id: `inventor.sponsor.${topicId}.${company.id}`, label: company.name, emoji: '🏢', subtitle: 'Company ownership · you are lead inventor', children: () => RESEARCH_APPROACHES.map((method): MenuNode => ({ type: 'action', id: `inventor.sponsor.start.${topicId}.${company.id}.${method.id}`, label: `Fund ${method.label}`, emoji: '🔬', subtitle: `${formatMoney(personalResearchQuote(gg, topicId, method.id, company.id)!.budget)} company funds · ${personalResearchQuote(gg, topicId, method.id, company.id)!.years}+ years`, disabledReason: x => personalResearchBlock(x, topicId, method.id, company.id), confirm: x => `${company.name} pays ${formatMoney(personalResearchQuote(x, topicId, method.id, company.id)!.budget)} and owns the completed invention. You lead research and retain credit; a hired CEO must manage operations throughout. Further experiments and redesigns also use company cash.`, run: x => { if (personalResearchBlock(x, topicId, method.id, company.id)) return; scriptInput(x, { title: 'Company Research Project', text: 'Name the invention you will lead.', emoji: '🔬', input: 'text', defaultValue: topic.name, scriptId: START_RESEARCH, data: { topic: topicId, approach: method.id, sponsorId: company.id } }) } })) }))
      } },
      { type: 'action', id: `inventor.grant.${topicId}`, label: 'Apply for a Research Grant', emoji: '📋', subtitle: `${formatMoney(inventorGrantQuote(g, topicId)!.amount)} restricted support · ${Math.round(inventorGrantQuote(g, topicId)!.odds * 100)}% estimated acceptance · one application/year`, disabledReason: gg => { const q = inventorGrantQuote(gg, topicId); return q ? q.reason : 'Unknown topic.' }, run: gg => { applyInventorGrant(gg, topicId) } },
      ...(quote.grant ? [{ type: 'info' as const, id: `inventor.grant.award.${topicId}`, text: `Your restricted grant contributes ${formatMoney(quote.grant)} toward this program. Your balanced-research contribution is ${formatMoney(quote.personalCost)}.` }] : []),
    ]
  } }
}

export const personalInventorMenu: MenuGroup = {
  type: 'menu', id: 'inventor.personal', label: 'Inventor', emoji: '💡', visible: g => g.character.alive && hasTalent(g, 'Inventor'),
  subtitle: 'Build expertise · test ideas · find customers · make a name',
  header: g => { const p = inventorView(g); return p.project ? `${p.project.name}: ${p.project.progress.toFixed(1)}/${p.project.years} research years. ${p.project.sponsorId ? `Lead inventor for ${findBusiness(g, p.project.sponsorId)?.name ?? 'unavailable sponsor'}; company spending ${formatMoney(p.project.companyCost ?? 0)}.` : `Personal spending ${formatMoney(p.project.personalCost ?? p.project.budget)}.`} ${p.project.model === 'career' ? `Pace: ${p.project.pace}; strain ${Math.round(p.strain)}/100. Completion depends on evidence and validation.` : 'Previously funded project: its original completion schedule is preserved.'} Prison pauses progress.` : 'Observe a problem, develop a specialty, and test a solution. Fund your own work or lead company-funded research with a hired CEO managing the business.' },
  children: g => [...inventorCareerNodes(g), ...researchManagementNodes(g),
    ...(inventorView(g).project ? (['engineering', 'customers'] as const).map((kind): MenuNode => ({ type: 'action', id: `inventor.experiment.${kind}`, label: inventionTopic(inventorView(g).project!.topic)?.field === 'finance' ? kind === 'engineering' ? 'Stress-test the Private Model' : 'Validate on Unseen Market Data' : kind === 'engineering' ? 'Test the Prototype' : 'Run a Customer Trial', emoji: '🔬', subtitle: `${formatMoney(Math.max(100, Math.round(inventorView(g).project!.budget * .08)))} from ${researchPayer(g, inventorView(g).project!)} · one experiment per year`, disabledReason: gg => { const project = inventorView(gg).project; return blocked(gg, 16) ?? (!project ? 'No active project.' : project.experimentYear === gg.year ? 'An experiment was already funded this year.' : researchPaymentBlock(gg, project, Math.max(100, Math.round(project.budget * .08)))) }, run: gg => { researchExperiment(gg, kind) } })) : []),
    ...personalInventions(g).map((a): MenuNode => ({ type: 'menu', id: `inventor.ip.${a.id}`, label: a.name, emoji: readInventionIp(a)?.closedLoop ? '🔒' : '💡', subtitle: readInventionIp(a)?.closedLoop ? 'Confidential financial IP · exclusive internal deployment' : 'Personally owned IP · patents · assignment and licensing', children: gg => inventionAssetNodes(gg, a.id) })),
    ...INVENTION_FIELDS.map((field): MenuNode => ({ type: 'menu', id: `inventor.field.${field.id}`, label: field.label, emoji: '📚', subtitle: `${Math.round(inventorView(g).expertise[field.id] ?? 0)}/100 expertise · practical improvements to frontier research`, children: () => INVENTION_TOPICS.filter(topic => topic.field === field.id).map(topic => topicMenu(topic.id)) }))],
}
