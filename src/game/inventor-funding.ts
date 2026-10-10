import { formatMoney, spend } from './core'
import { inventionIndustryCompatible, inventionTopic } from './inventor-data'
import { ownerControls } from './business/board'
import { manageBlock } from './business/gate'
import { bizOf, findBusiness, readBiz } from './business/state'
import { closedInventions } from './business/closed-inventions'
import type { PersonalResearch } from './inventor-state'
import type { GameState } from './types'

export function researchSponsorBlock(g: GameState, sponsorId: string, topicId: string, cost = 0): string | null {
  const a = findBusiness(g, sponsorId), topic = inventionTopic(topicId)
  if (!a || !topic) return 'The sponsoring company is unavailable. Research is paused; you may shelve it.'
  const b = readBiz(g, a)
  return manageBlock(g, a) ?? (!ownerControls(g, a) ? 'A controlling owner must authorize company-funded research.'
    : !inventionIndustryCompatible(topic.field, b.industry) ? 'This company cannot use research in that field.'
      : b.ceo !== 'manager' || !b.manager ? 'Hire a CEO under company Leadership so you can serve as lead inventor.'
        : topic.field === 'finance' && closedInventions(b).some(row => row.topic === topicId) ? 'This company already has that private method; revalidate its existing system.'
        : b.cash < cost ? `${a.name} needs ${formatMoney(cost)} of its own cash. Client funds cannot finance research.` : null)
}

export function researchPaymentBlock(g: GameState, project: PersonalResearch, cost: number): string | null {
  return project.sponsorId ? researchSponsorBlock(g, project.sponsorId, project.topic, cost)
    : g.character.money < cost ? `You need ${formatMoney(cost)} in personal savings.` : null
}

/** Expense against exactly one payer. Client deposits and personal balances stay separate. */
export function payForResearch(g: GameState, project: PersonalResearch, cost: number): boolean {
  if (!Number.isFinite(cost) || cost < 0 || researchPaymentBlock(g, project, cost)) return false
  if (project.sponsorId) {
    const b = bizOf(g, findBusiness(g, project.sponsorId)!)
    b.cash -= cost; b.yearCosts += cost
    project.companyCost = (project.companyCost ?? 0) + cost
  } else {
    if (!spend(g, cost)) return false
    project.personalCost = (project.personalCost ?? project.budget) + cost
  }
  return true
}

export function researchPayer(g: GameState, project: PersonalResearch): string {
  return project.sponsorId ? `${findBusiness(g, project.sponsorId)?.name ?? 'Sponsoring company'} company funds` : 'your personal savings'
}
