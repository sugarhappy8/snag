// Fixtures shared by test/wave-insider.test.ts and test/wave-stocks-story.test.ts: a founder with a software company, the core or supply
// stocks of a wave kind that stay listed under one id, the case rows the politics profile keeps, and the exposure popup.
import type { RdProject } from '../src/game/business/state'
import { roleOf } from '../src/game/business/tech-waves'
import { anchor, fam } from '../src/game/computer/money-common'
import { listedTargets, type BetTarget } from '../src/game/computer/money-stocks'
import { exchangeInfo, exchangeYear } from '../src/game/invest/engine'
import { SECTOR_TRADE, sectorOfSec } from '../src/game/invest/wave-stocks'
import { yearlySpecial } from '../src/game/special'
import type { Asset, GameState } from '../src/game/types'
import { adult, company } from './market-kit'

export type Row = { cause: string; role?: string; note?: string; via: string; secId: string; status: string; gain: number; stake: number; evidence: number; title: string; office: string; held?: number }
export const rows = (g: GameState): Row[] => (g.flags['special.politics'] as unknown as { abuse?: { cases: Row[] } } | undefined)?.abuse?.cases ?? []
export const founder = (seed = 5, year = 2033): { g: GameState; a: Asset } => { const g = adult(seed, year, 'us'), a = company(g, 'software', { cash: 80_000_000 }); g.queue = []; return { g, a } }
export const warp = (g: GameState, year: number) => { g.character.age += year - g.year; g.year = year; g.yearActions = {} }
const roleFor = (kind: 'smartphone' | 'ai', secId: string) => { const s = sectorOfSec(secId), t = s ? SECTOR_TRADE[s] : null; return t ? roleOf(kind, t) : null }
/** Core or supply stocks of a kind that are listed under one id in every year given (as holdable() of test/insider-fairness.test.ts). */
export function holdable(g: GameState, years: number[], kind: 'smartphone' | 'ai' = 'smartphone'): BetTarget[] {
  const inf = exchangeInfo(g.character.countryId)
  return listedTargets(g).filter((t) => { const r = roleFor(kind, t.secId); return (r === 'core' || r === 'supply') && years.every((y) => exchangeYear(fam(g), anchor(g), inf, y).stocks[t.slot]?.id === t.secId) })
}
/** Years `from` to `to` with the yearly special hook; the exposure popup if one is raised (other popups are dropped). */
export const exposedIn = (g: GameState, from: number, to: number) => { for (let y = from; y <= to; y++) { warp(g, y); yearlySpecial(g); const m = g.queue.find((x) => x.kind === 'choice' && x.scriptId === 'special.pol.abuse.exposed'); if (m) return m; g.queue = [] } return undefined }
/** The finished heavy project of test/tech-waves-writers.test.ts, with the odds the caller picks. */
export const project = (g: GameState, name: string, odds: number): RdProject => ({ id: 'rd-w', name, budget: 2e6, years: 4, progress: 4, odds, boost: 0, quality: 80, family: name, kind: 'breakthrough', heavy: true, cost: 2e6, started: g.year - 4 })
