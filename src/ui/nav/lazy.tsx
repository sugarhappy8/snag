// The gate of the palette chunk (G.9, G.14). The palette (Palette.tsx and the four modules it reads: paletteModel, searchIndex,
// searchRank, useSearchIndex) is fetched with a dynamic import() the first time it is opened, or when the browser is idle
// (prefetchLazyViews), so it stays out of the first download. This is the only file outside the palette zone that may name
// those modules, and only through that import(); the props type comes in with `import type`, which costs nothing.
//
// It is made with lazyView, never with the React lazy helper: renderToStaticMarkup cannot wait for one, so a test would only ever
// see the fallback. A test awaits LazyPalette.preload() and then renders the real thing. The palette has no text fallback
// (it opens on demand), so until the chunk is there lazyView draws its own empty box.
import { lazyView } from '../lazy/lazyView'
import type { PaletteProps } from './Palette'

export type { PaletteProps }

export const LazyPalette = lazyView<PaletteProps>('palette', () => import('./Palette'))
