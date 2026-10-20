import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { bootApp } from './boot'
import { FLAGS } from './game/flags'
import { hydrateSaves } from './game/save-hydrate'
import { flushSave } from './game/save-store'
import './ui/styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('AnotherLife: #root element is missing from index.html')

// The first render waits for the saves (up to 3 seconds if IndexedDB hangs); index.html shows a splash meanwhile.
void bootApp({
  hydrate: () => hydrateSaves({ idb: FLAGS.idbSaves }),
  render: () =>
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  flush: flushSave,
  listen: (type, fn) => {
    if (type === 'pagehide') window.addEventListener('pagehide', fn)
    else document.addEventListener('visibilitychange', fn)
  },
  hidden: () => document.visibilityState === 'hidden',
})
