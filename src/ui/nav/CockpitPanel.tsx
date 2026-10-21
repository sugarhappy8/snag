// The cockpit panel (G.5): the first thing at the root of Occupation, Assets, Relationships and Activities, above the list.
// It builds the model of the tab from the latest state and hands it to CockpitBody. Dark unless FLAGS.cockpits is on.
// Static, not a lazy shell: the model and the markup are small, and only the chart kit loads on demand (through kit.ts),
// so the tiles and cards show their words until it is ready.
import { useMemo, type ReactElement } from 'react'
import { FLAGS } from '../../game/flags'
import { cockpitOf, type CockpitTab } from '../../game/hubs/cockpit'
import type { GameState } from '../../game/types'
import { CockpitBody, jumpLinks } from './CockpitBody'
import { usePrefs } from './prefs'
import '../styles/nav.css'

export interface CockpitPanelProps {
  tab: CockpitTab
  g: GameState
  /** Open a screen: the group ids below the tab's root (what MenuSheet's openPath takes). */
  onOpen: (path: string[]) => void
}

// The hook lives in its own component, so CockpitPanel itself is a plain function: with the flag off nothing runs but a read.
// The model and the links are read again only when the state, the tab or the prefs change (a sheet renders again after every tap).
function Panel({ tab, g, onOpen }: CockpitPanelProps): ReactElement {
  const prefs = usePrefs()
  const model = useMemo(() => cockpitOf(tab, g), [tab, g])
  const jump = useMemo(() => jumpLinks(g, prefs, tab), [g, prefs, tab])
  return (
    <section className="cockpit-panel" aria-label="At a glance">
      <CockpitBody model={model} jump={jump} onOpen={onOpen} />
    </section>
  )
}

export function CockpitPanel(props: CockpitPanelProps): ReactElement | null {
  return FLAGS.cockpits ? <Panel {...props} /> : null
}
