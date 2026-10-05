// The risky side of the home computer: crypto pump-and-dumps (money-crypto.ts), options trading
// (money-options.ts) and online scams (money-scams.ts). computer.ts assembles the menu and calls
// the yearly hook; shared state and helpers live in money-common.ts (g.flags.computerMoney).
import type { GameState, MenuNode } from '../types'
import { cap, isRecord, moneyState, readState, STATE_KEY, type News } from './money-common'
import { coinProbeNews, cryptoMenu, cryptoSummary } from './money-crypto'
import { compulsiveTrading, optionsMenu, optionsSummary, settleOptions } from './money-options'
import { coolHeat, scamNews, SCAMS_MIN_AGE, scamsMenu, scamsSummary } from './money-scams'

/** Menu rows for Activities › Computer (crypto, options, scams...). */
export function moneyNodes(g: GameState): MenuNode[] {
  const c = g.character
  if (!c.alive || c.prison || c.age < SCAMS_MIN_AGE) return []
  return [{ type: 'heading', id: 'computer.money.heading', label: 'Risky Business' }, cryptoMenu(), optionsMenu(), scamsMenu()]
}

/**
 * Yearly hook (after shops, before finance): open options settle on this year's index move,
 * regulators and the cybercrime unit catch up, scam heat cools. At most one popup per year;
 * everything else goes to the life log. Nothing for the dead; prison pauses investigations.
 */
export function yearlyMoney(g: GameState): void {
  const c = g.character
  if (!c.alive) return
  // Never touched the risky side: nothing to do, and nothing gets written to old saves.
  if (!isRecord(g.flags[STATE_KEY])) return
  const st = moneyState(g)
  const news: News[] = []

  // Contracts expire on schedule, even for traders behind bars.
  const opt = settleOptions(g, st)
  if (opt) news.push(opt)

  if (c.prison) {
    // Investigations wait for you to get out; the heat cools while you're away.
    for (const p of st.probes) if (p.dueAge <= c.age) p.dueAge = c.age + 1
    coolHeat(g, st)
    for (const n of news) n.quiet(g)
    return
  }

  const probe = coinProbeNews(g, st)
  if (probe) news.push(probe)
  const scam = scamNews(g, st)
  if (scam) news.push(scam)
  compulsiveTrading(g, st)
  coolHeat(g, st)

  news.sort((a, b) => b.priority - a.priority)
  const [top, ...rest] = news
  if (top) top.popup(g)
  for (const n of rest) n.quiet(g)
}

/** One compact line for the AI context ('' when nothing to say). */
export function moneySummary(g: GameState): string {
  if (!isRecord(g.flags[STATE_KEY])) return ''
  const st = readState(g)
  return cap([optionsSummary(st), cryptoSummary(st), scamsSummary(st)].filter(Boolean).join('; '))
}
