// AI Lab 2.0 text builders. Pure reads over a lab's models and the rival board: nothing here touches g.rng,
// the game or its saved state, so menus, popups and reports can share one source for what they say.
// Legacy models (no rating, or trained before 2012) keep today's wording, read at the model's own year.
import { bestRival, modelLead } from './ai-bench-market'
import { frontierScore } from './deeptech-data'
import type { AiModel } from './deeptech-state'

/**
 * The release popup text. A rated model names its own year and the best rival of that year; any other
 * model keeps today's wording with the frontier line read at its own year. Both say what a hold costs.
 */
export function releaseText(m: AiModel, fam: string, models: readonly AiModel[]): string {
  const rival = m.rating ? bestRival(fam, m.year, models) : null
  if (rival) return `${m.name} scored ${m.score} on the ${m.year} benchmarks. The best rival scored ${rival.score}. Closed earns API money, open earns fans but cuts it. A held model earns nothing.`
  return `${m.name} scored ${m.score} on the benchmarks (the best anyone has is about ${frontierScore(m.year)}). How do you release it? Closed models earn API money; open weights win fans, talent and hype but undercut your own API. A held model earns nothing until you release it.`
}

/** The launch line of a closed release: a model that leads the best rival of its year is the best in the world. */
export function launchText(m: AiModel, fam: string, models: readonly AiModel[]): string {
  const lead = m.rating ? modelLead(fam, models, m) : null
  const leads = lead !== null ? lead > 0 : m.score >= frontierScore(m.year)
  return leads ? 'Tech journalists are calling it the best model in the world.' : 'Reviews are solid.'
}
