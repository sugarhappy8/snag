// The charts barrel: re-exports, and chartInfo (R1-C13), the one function a menu uses to add a chart row.
// Each task of the Charts track adds its own line here.
import { flagOn } from '../flags'
import type { GameState, MenuInfo } from '../types'
import type { ChartSpec } from './spec'

export * from './spec'
export * from './reveal'
export * from './money'
export * from './pl'
export * from './books'
export * from './market'
export * from './ranks'
export * from './report'
export * from './networth'

/** What a chart row's text may be: the words themselves, or a function of the state and the spec the row built (null when it could not). */
export type ChartInfoText = string | ((g: GameState, spec: ChartSpec | null) => string)

/**
 * A menu row that carries a chart. The node is a plain `info` node: `text` is the accessible summary and what a text
 * layout reads, `chart` is the spec the menu draws when the kit is on. Nothing at all while chartKit is off, so a menu
 * can add its chart rows without a check of its own (the flag is read when the row is asked for).
 *
 * The spec is built once for one game object, however many times the text and the chart are read in a render: the memo
 * belongs to this node and is keyed by the game, so a new state always builds again. A function text receives the built
 * spec, so a row can say its summary (or a plain sentence when there is no spec) without building it a second time. A
 * builder that throws is reported once and reads as no spec: the row keeps its plain words.
 */
export function chartInfo(id: string, emoji: string, text: ChartInfoText, chart: (g: GameState) => ChartSpec | null): MenuInfo[] {
  if (!flagOn('chartKit')) return []
  const built = new WeakMap<GameState, ChartSpec | null>()
  const spec = (g: GameState): ChartSpec | null => {
    if (built.has(g)) return built.get(g) ?? null
    let out: ChartSpec | null = null
    try {
      out = chart(g)
    } catch (err) {
      console.error(`[menu] chart(${id}) failed:`, err)
    }
    built.set(g, out)
    return out
  }
  return [{ type: 'info', id, emoji, text: typeof text === 'string' ? text : (g) => text(g, spec(g)), chart: spec }]
}
