// Shared shapes for the world-history data files (events-1900/1946/1990.ts, events-future.ts).
// Kept separate so the data files and events.ts don't import each other.

export type WorldEventKind = 'war' | 'economy' | 'tech' | 'politics' | 'culture' | 'disaster' | 'sport' | 'health' | 'space'

/**
 * One headline as written in the data files:
 * [year, kind, severity 0 trivia … 3 history-defining, region, headline].
 * region: 'world', a continent name from world.ts ('Europe', 'North America'...), or a
 * comma-separated list of country ids and/or continent names ('us,gb', 'Europe,us').
 * Headlines name no brands or companies and no living private people.
 */
export type HeadlineRow = readonly [year: number, kind: WorldEventKind, severity: 0 | 1 | 2 | 3, region: string, headline: string]
