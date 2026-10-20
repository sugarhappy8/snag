// The boot, before and after the first render. The saved game has to be hydrated (save-hydrate.ts picks the
// backend and fills the cache that an IndexedDB read answers from) before React renders anything that reads it,
// so main.tsx hands the pieces to bootApp as plain functions. A test drives them without a browser.

export interface BootEnv {
  /** Choose the backend and read what the stores hold. May reject: the page renders anyway. */
  hydrate: () => Promise<unknown>
  /** Mount the app. Called exactly once. */
  render: () => void
  /** Resolve once the save queue has run dry (flushSave). */
  flush: () => Promise<unknown>
  listen: (type: 'pagehide' | 'visibilitychange', fn: () => void) => void
  /** document.visibilityState === 'hidden' */
  hidden: () => boolean
}

/** Hydrate, then render, even when hydrate rejects; then flush the save when the page hides. */
export async function bootApp(env: BootEnv): Promise<void> {
  try {
    await env.hydrate()
  } catch (err) {
    // The page plays from whatever the default backend holds; a failed hydrate never blocks the first render.
    console.error('Loading the saved game failed:', err)
  }
  env.render()
  // flushSave starts no write of its own (a write starts when saveRecord runs), so these calls change nothing
  // that is written, and a promise can't hold a closing page open. The listeners only make sure the page does
  // not close with a queue that could still be drained: the queue is asked to run dry as the page hides.
  const flushNow = (): void => {
    void env.flush()
  }
  env.listen('pagehide', flushNow)
  env.listen('visibilitychange', () => {
    if (env.hidden()) flushNow()
  })
}
