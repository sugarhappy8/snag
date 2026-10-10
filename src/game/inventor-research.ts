import { addStat, formatMoney, log, notice, spend } from './core'
import { bound, economicRoll } from './economy'
import { inventionResearchRule, inventionTopic } from './inventor-data'
import { gainInventorExpertise, inventorJournal } from './inventor-career'
import { inventorView, saveInventor, type InventorProfile, type PersonalResearch, type ResearchPace } from './inventor-state'
import { blocked } from './special/common'
import type { GameState, MenuNode } from './types'

export function researchReadiness(g: GameState, project: PersonalResearch, profile = inventorView(g)) {
  const topic = inventionTopic(project.topic)!, rule = inventionResearchRule(topic.id)!
  const expertise = profile.expertise[topic.field] ?? 0
  const engineering = project.engineering ?? 0, validation = project.validation ?? 0
  const odds = bound(.35 + engineering * .0035 + expertise * .003 + validation * .001 - (rule.speculative ? .2 : 0) - (project.approach === 'frontier' ? .08 : 0), .1, .97)
  const reason = project.revision ? 'A failed test needs a funded redesign.' : project.progress < project.years ? 'The funded research program is still underway.' : engineering < rule.engineering ? `Technical evidence needs ${rule.engineering}/100; test the prototype.` : validation < rule.validation ? `User validation needs ${rule.validation}/100; run a customer trial.` : null
  const stage = project.revision ? 'Redesign needed' : project.progress < project.years * .35 ? 'Research & proof of concept' : project.progress < project.years * .8 ? 'Building a prototype' : 'Independent validation'
  return { odds, reason, stage, engineering: rule.engineering, validation: rule.validation }
}

/** One prepaid research year. Finite funding stops automatic progress at the
 * planned review; additional experiments and redesigns require explicit spending. */
export function advanceInventorResearch(g: GameState, p: InventorProfile): boolean {
  const project = p.project!
  if (project.pace === 'rest') { p.strain = Math.max(0, p.strain - 25); project.notes = 'Taking a year off; no research progress or automatic spending.'; return false }
  if (p.strain >= 80) {
    p.strain = Math.max(0, p.strain - 30); addStat(g, 'health', -3); addStat(g, 'happiness', -5)
    project.notes = 'Burnout forced a year away from the lab. Lower the pace or rest before continuing.'
    inventorJournal(g, p, project.notes); log(g, project.notes, 'bad'); return false
  }
  if (project.revision) { p.strain = Math.max(0, p.strain - 8); return false }
  const topic = inventionTopic(project.topic)!, rule = inventionResearchRule(topic.id)!
  const working = project.progress < project.years
  if (working) {
    const intensive = project.pace === 'intensive'
    p.strain = bound(p.strain + (intensive ? 18 : 3) + (g.character.job && intensive ? 6 : 0), 0, 100)
    gainInventorExpertise(p, topic.field, 3)
    const risk = bound(.12 + (rule.speculative ? .13 : 0) + (project.approach === 'frontier' ? .08 : 0) - (p.expertise[topic.field] ?? 0) * .001, .02, .35)
    if (economicRoll(`${g.lifeId}|research-setback|${project.id}|${g.year}`) < risk) {
      project.revision = true; project.setbacks = (project.setbacks ?? 0) + 1; p.setbacks++
      project.notes = 'A repeat experiment contradicted the design. Knowledge is retained; fund a redesign or shelve this approach.'
      gainInventorExpertise(p, topic.field, 4); inventorJournal(g, p, `${project.name}: ${project.notes}`)
      log(g, `${project.name}: a failed experiment revealed a flaw. I learned from it, but need to revise the design.`, 'neutral')
      return false
    }
    project.progress = Math.min(project.years, project.progress + (intensive ? 1.35 : 1))
    project.engineering = Math.min(100, (project.engineering ?? 0) + 8 + (project.collaborator ? 3 : 0))
    project.validation = Math.min(100, (project.validation ?? 0) + 4)
    project.notes = `${researchReadiness(g, project, p).stage}: the latest experiment was reproducible.`
  }
  const review = researchReadiness(g, project, p)
  if (review.reason) { if (project.progress >= project.years) project.notes = review.reason; return false }
  project.attempts = (project.attempts ?? 0) + 1
  if (economicRoll(`${g.lifeId}|research-review|${project.id}|${project.attempts}`) < review.odds) return true
  project.revision = true; project.setbacks = (project.setbacks ?? 0) + 1; p.setbacks++
  gainInventorExpertise(p, topic.field, 5)
  project.notes = 'Independent replication failed. No patent-ready invention yet. Revise the design and test again; the notebook and expertise remain yours.'
  inventorJournal(g, p, `${project.name}: independent replication failed; I gained new field knowledge.`)
  log(g, project.notes, 'neutral')
  return false
}

export function setResearchPace(g: GameState, pace: ResearchPace): boolean {
  const p = inventorView(g)
  if (blocked(g, 16) || p.project?.model !== 'career' || !['balanced', 'intensive', 'rest'].includes(pace)) return false
  p.project.pace = pace; saveInventor(g, p)
  notice(g, 'Research Schedule', pace === 'rest' ? 'Your project will pause while research strain falls by 25 per year. No new money will be spent automatically.' : pace === 'intensive' ? 'You will work faster, at a cost of 18 strain per active year, plus 6 if you also hold a job. At 80 strain, burnout forces a recovery year and affects health and happiness.' : 'You will work at a sustainable pace: one funded research year per year, with 3 strain from lab work. Experiments add some strain too.', { emoji: '🗓️' })
  return true
}
export function researchSupportQuote(g: GameState, action: 'collaborator' | 'revise') {
  const p = inventorView(g), project = p.project
  const cost = project ? Math.max(250, Math.round(project.budget * (action === 'collaborator' ? .15 : .12))) : 0
  const reason = blocked(g, 16) ?? (!project || project.model !== 'career' ? 'No active research-career project.' : action === 'collaborator' && project.collaborator ? 'A specialist already joined this project.' : action === 'revise' && !project.revision ? 'The current design does not need a funded redesign.' : g.character.money < cost ? `You need ${formatMoney(cost)} in personal savings.` : null)
  return { cost, reason }
}
export function supportPersonalResearch(g: GameState, action: 'collaborator' | 'revise'): boolean {
  if (!['collaborator', 'revise'].includes(action)) return false
  const q = researchSupportQuote(g, action), p = inventorView(g), project = p.project
  if (q.reason || !project || !spend(g, q.cost)) return false
  project.personalCost = (project.personalCost ?? project.budget) + q.cost
  const topic = inventionTopic(project.topic)!
  if (action === 'collaborator') {
    project.collaborator = `Independent ${topic.field} engineering specialist`
    project.engineering = Math.min(100, (project.engineering ?? 0) + 15); project.validation = Math.min(100, (project.validation ?? 0) + 8)
    gainInventorExpertise(p, topic.field, 5)
    project.notes = 'A specialist joined on a fixed-fee IP-assignment contract. You retain ownership; their contribution stays credited.'
  } else {
    project.revision = false; project.progress = Math.min(project.progress, Math.max(0, project.years - 1))
    project.engineering = Math.min(100, (project.engineering ?? 0) + 10); p.strain = Math.min(100, p.strain + 5)
    project.notes = 'Redesign funded, including another research year and a fresh replication attempt.'
  }
  inventorJournal(g, p, `${project.name}: ${project.notes}`); saveInventor(g, p)
  notice(g, action === 'collaborator' ? 'Research Collaboration' : 'Design Revised', `${project.notes} You paid ${formatMoney(q.cost)} from your savings.`, { emoji: '🔬' })
  return true
}
export function shelvePersonalResearch(g: GameState): boolean {
  const p = inventorView(g), project = p.project
  if (blocked(g, 16) || !project) return false
  inventorJournal(g, p, `Shelved ${project.name}; ${formatMoney(project.personalCost ?? project.budget)} spent personally. Expertise and the notebook were retained.`)
  p.project = null; p.strain = Math.max(0, p.strain - 10); saveInventor(g, p)
  notice(g, 'Project Shelved', 'You stopped this research direction. Spent funding is not refunded, but all topic study and field expertise remain. You can begin a different project when your annual project slot is available.', { emoji: '📓' })
  return true
}

export function researchManagementNodes(g: GameState): MenuNode[] {
  const project = inventorView(g).project
  if (!project) return []
  const nodes: MenuNode[] = []
  if (project.model === 'career') {
    const ready = researchReadiness(g, project)
    nodes.push({ type: 'info', id: 'inventor.research.evidence', text: `${ready.stage} · engineering ${Math.round(project.engineering ?? 0)}/${ready.engineering} · customer evidence ${Math.round(project.validation ?? 0)}/${ready.validation}. Independent replication: about ${Math.round(ready.odds * 100)}% chance once ready. ${project.notes || ''}` })
    nodes.push(...(['balanced', 'intensive', 'rest'] as const).map((pace): MenuNode => ({ type: 'action', id: `inventor.pace.${pace}`, label: pace === 'rest' ? 'Take a Research Break' : pace === 'intensive' ? 'Work Intensively' : 'Keep a Balanced Schedule', emoji: '🗓️', subtitle: pace === project.pace ? 'Current schedule' : pace === 'intensive' ? '35% faster · higher strain, especially alongside a job' : pace === 'rest' ? 'Pause progress · recover 25 strain per year' : 'Normal progress · lower strain', disabledReason: gg => blocked(gg, 16) ?? (!inventorView(gg).project ? 'No active project.' : null), run: gg => { setResearchPace(gg, pace) } })))
    nodes.push(...(['collaborator', 'revise'] as const).map((action): MenuNode => ({ type: 'action', id: `inventor.support.${action}`, label: action === 'collaborator' ? 'Hire a Research Collaborator' : 'Fund a Redesign', emoji: '🤝', subtitle: `${formatMoney(researchSupportQuote(g, action).cost)} · ${action === 'collaborator' ? 'technical expertise, shared credit; retain IP ownership' : 'learn from the setback and finance another attempt'}`, disabledReason: gg => researchSupportQuote(gg, action).reason, run: gg => { supportPersonalResearch(gg, action) } })))
  }
  nodes.push({ type: 'action', id: 'inventor.shelve', label: 'Shelve This Project', emoji: '📓', subtitle: 'Keep knowledge; spent funding is not refunded', disabledReason: gg => blocked(gg, 16) ?? (!inventorView(gg).project ? 'No active project.' : null), confirm: () => 'Stop this project permanently? Its spent budget is not refunded. Your field expertise and study notes stay with you.', run: gg => { shelvePersonalResearch(gg) } })
  return nodes
}
