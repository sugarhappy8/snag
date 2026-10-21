// The gate of the palette chunk (G.9, G.14). The palette (Palette.tsx and the four modules it reads: paletteModel, searchIndex,
// searchRank, useSearchIndex) is fetched with a dynamic import() the first time it is opened, or when the browser is idle
// (prefetchLazyViews), so it stays out of the first download. This is the only file outside the palette zone that may name
// those modules, and only through that import(); the props type comes in with `import type`, which costs nothing.
//
// It is made with lazyView, never with the React lazy helper: renderToStaticMarkup cannot wait for one, so a test would only ever
// see the fallback. A test awaits LazyPalette.preload() and then renders the real thing. LazyPalette itself has no fallback
// (it opens on demand). PaletteGate is what the game screen uses: until the chunk is there, and if it never comes (a tab left
// open across a deploy, Save-Data), it draws a small bar fixed over the screen with Close and Try again, so the life log does
// not shift and the player is never stuck behind a palette that cannot open.
import { useEffect, useState, type ReactElement } from 'react'
import { lazyView } from '../lazy/lazyView'
import type { PaletteProps } from './Palette'
import '../styles/nav.css'

export type { PaletteProps }

export const LazyPalette = lazyView<PaletteProps>('palette', () => import('./Palette'))

export interface PaletteWaitingProps {
  /** The load failed (it is not just slow). */
  failed: boolean
  onClose: () => void
  onRetry: () => void
}

/** The bar shown while the palette loads, or after it failed. Fixed over the screen (see nav.css), never part of the layout. */
export function PaletteWaiting({ failed, onClose, onRetry }: PaletteWaitingProps): ReactElement {
  return (
    <div className="palette-wait" role={failed ? 'alert' : 'status'}>
      <span className="palette-wait-text">{failed ? "Search didn't load." : 'Opening search.'}</span>
      {failed ? (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
      <button type="button" className="btn" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

type Phase = 'loading' | 'failed' | 'ready'

/** The palette for the game screen: the real one when its chunk is there, the waiting bar (with a way out) until then. */
export function PaletteGate(props: PaletteProps): ReactElement {
  const { onClose } = props
  const [phase, setPhase] = useState<Phase>(() => (LazyPalette.isReady() ? 'ready' : 'loading'))
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (LazyPalette.isReady()) {
      setPhase('ready')
      return
    }
    let live = true
    setPhase('loading')
    void LazyPalette.preload().then((ok) => {
      if (live) setPhase(ok ? 'ready' : 'failed')
    })
    return () => {
      live = false
    }
  }, [round])

  // The palette closes itself on Escape once it is there; until then the bar does.
  useEffect(() => {
    if (phase === 'ready') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  return (
    <>
      <LazyPalette {...props} fallback={null} />
      {phase !== 'ready' && !LazyPalette.isReady() ? <PaletteWaiting failed={phase === 'failed'} onClose={onClose} onRetry={() => setRound((n) => n + 1)} /> : null}
    </>
  )
}
