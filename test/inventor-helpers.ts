import { expect } from 'vitest'
import { researchExperiment, studyInventionTopic, yearlyInventor } from '../src/game/inventor'
import { inventionResearchRule, inventionTopic } from '../src/game/inventor-data'
import { inventorView } from '../src/game/inventor-state'
import { setResearchPace, supportPersonalResearch } from '../src/game/inventor-research'
import { tinkerInvention } from '../src/game/inventor-career'
import type { GameState } from '../src/game/types'

export function inventorNextYear(g: GameState): void { g.year++; g.character.age++; g.yearActions = {}; yearlyInventor(g) }
export function prepareInventor(g: GameState, topicId = 'heat-recovery'): void {
  const rule = inventionResearchRule(topicId)!, topic = inventionTopic(topicId)!
  for (let i = 0; i < 30; i++) {
    const p = inventorView(g), study = p.studies.find(s => s.topic === topicId)
    if ((study?.points ?? 0) >= rule.study && study && g.year - study.year <= 3 && (p.expertise[topic.field] ?? 0) >= rule.expertise) return
    studyInventionTopic(g, topicId, g.year >= 1995)
    tinkerInvention(g, topic.field)
    if (i % 2 === 1) inventorNextYear(g)
  }
  throw new Error('Could not prepare a research topic')
}
/** Plays the public research actions, including recovery, rather than forcing a success roll. */
export function finishInventorProject(g: GameState): void {
  for (let i = 0; i < 60; i++) {
    const p = inventorView(g), project = p.project
    if (!project) return
    if (project.model === 'career') {
      if (p.strain >= 65) setResearchPace(g, 'rest')
      else {
        setResearchPace(g, 'balanced')
        if (project.revision) expect(supportPersonalResearch(g, 'revise')).toBe(true)
        if (!project.collaborator) expect(supportPersonalResearch(g, 'collaborator')).toBe(true)
        researchExperiment(g, (inventorView(g).project?.engineering ?? 0) < 85 ? 'engineering' : 'customers')
      }
    }
    inventorNextYear(g)
  }
  throw new Error('Prepared research did not finish within 60 years')
}
