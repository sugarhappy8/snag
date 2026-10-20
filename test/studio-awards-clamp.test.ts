// R0-9: a studio game's awards count toward keeping it in the catalogue, but only up to two of
// them. The field has no live writer yet (the real ledger is F.10), so a hand-edited or future
// record with six awards must not out-score a hit and pin that game in the back catalogue forever.
import { describe, expect, it } from 'vitest'
import { normalizeStudio, readStudioGame, trimStudioGames, type StudioGame } from '../src/game/business/gamestudio-state'
import type { Json } from '../src/game/types'

/** The catalogue cap in gamestudio-state.ts (private there). */
const MAX_GAMES = 24

function liveGame(id: string, critic: number, copies: number, awards: string[] = []): Json {
  return { id, title: `Game ${id}`, stage: 'live', progress: 100, critic, copies, tail: 0, awards }
}

function read(raw: Json[]): StudioGame[] {
  return raw.map((x, i) => readStudioGame(x, i)).filter((x): x is StudioGame => !!x)
}

/** MAX_GAMES + 3 live games: `odd` first, then the hits (critic 80, 10,000 copies each: score 100). */
function catalogue(odd: Json): Json[] {
  const hits: Json[] = []
  for (let i = 0; i < MAX_GAMES + 2; i++) hits.push(liveGame(`hit${i}`, 80, 10_000))
  return [odd, ...hits]
}

const SIX = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `Award ${x}`)

describe('studio awards in the catalogue trim', () => {
  it('a hit (critic 80, 10,000 copies) scores 100 before awards', () => {
    const [hit] = read([liveGame('h', 80, 10_000)])
    expect(hit.critic + Math.log10(1 + hit.copies) * 5).toBeCloseTo(100, 2)
  })

  it('six awards on a critic-10, zero-copy game do not keep it: it is trimmed first', () => {
    const games = read(catalogue(liveGame('odd', 10, 0, SIX)))
    expect(games).toHaveLength(MAX_GAMES + 3)
    expect(games[0].awards).toHaveLength(6)
    const kept = trimStudioGames(games)
    expect(kept).toHaveLength(MAX_GAMES)
    expect(kept.some((x) => x.id === 'odd')).toBe(false)
  })

  it('two awards on the same game still leave it trimmed (score 70 against 100)', () => {
    const kept = trimStudioGames(read(catalogue(liveGame('odd', 10, 0, SIX.slice(0, 2)))))
    expect(kept).toHaveLength(MAX_GAMES)
    expect(kept.some((x) => x.id === 'odd')).toBe(false)
  })

  it('normalizeStudio trims a saved catalogue the same way', () => {
    const st = normalizeStudio({ games: catalogue(liveGame('odd', 10, 0, SIX)) })
    expect(st.games).toHaveLength(MAX_GAMES)
    expect(st.games.some((x) => x.id === 'odd')).toBe(false)
  })
})
