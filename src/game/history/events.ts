// World history as the character lives it: the headlines of each year (wars, crashes, firsts,
// pandemics, elections, sport), era-appropriate life events (drafts, rationing, the moon landing
// on the family TV...), and the era context the AI narrator gets so it never mentions a
// smartphone in 1985. CONTRACT STUB: the history builder owns this file and fills it in.
import type { GameState } from '../types'

export type WorldEventKind = 'war' | 'economy' | 'tech' | 'politics' | 'culture' | 'disaster' | 'sport' | 'health' | 'space'

export interface WorldEvent {
  year: number
  id: string
  /** One short headline, e.g. 'A man walks on the Moon'. No real living private individuals. */
  headline: string
  kind: WorldEventKind
  /** 'world', a continent name from world.ts, or a list of country ids it mainly concerns. */
  region: 'world' | string | string[]
  /** 0 trivia … 3 history-defining. */
  severity: 0 | 1 | 2 | 3
}

/** The year's headlines that matter where the character lives (world events + local ones). */
export function worldEvents(_year: number, _countryId: string): WorldEvent[] {
  return []
}

/** Yearly hook (aging.ts, first): world news in the log, era life events (drafts, rationing...). */
export function yearlyHistory(_g: GameState): void {}

/** One line for the AI prompt: the year, the era and what the world is like ('' = nothing to add). */
export function eraSummary(_g: GameState): string {
  return ''
}
