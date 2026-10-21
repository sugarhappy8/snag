// The net-worth line of a life (R1 charts, G.7): a small timeline of net worth by age, for the Profile and the Death screen.
// It sits outside the chart zone, so it reaches the chart only through the lazy gate and shows the summary as a plain line
// until the chunk is ready (and if it never is). It draws nothing unless chartKit is on and the life has a line to draw.
import { useMemo, type ReactElement } from 'react'
import { netWorthSpec } from '../../game/charts/networth'
import { flagOn } from '../../game/flags'
import type { GameState } from '../../game/types'
import { LazyChartView } from '../charts/lazy'
import '../styles/screens.css'

export function LifeLine(p: { g: GameState }): ReactElement | null {
  const { g } = p
  const enabled = flagOn('chartKit')
  // The line changes once a year, so it is built again only when the life, the age or the year moves.
  const spec = useMemo(() => (enabled ? netWorthSpec(g) : null), [enabled, g.lifeId, g.character.age, g.year])
  if (!spec) return null
  return (
    <div className="life-line">
      <LazyChartView spec={spec} fallback={<p className="life-line-text">{spec.summary}</p>} />
    </div>
  )
}

export default LifeLine
