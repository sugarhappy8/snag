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
  /** Write the newest save synchronously to a backup when the queue has not caught up (spillSave). */
  spill: () => unknown
  listen: (type: 'pagehide' | 'visibilitychange', fn: () => void) => void
  /** document.visibilityState === 'hidden' */
  hidden: () => boolean
}

/** Hydrate, then render, even when hydrate rejects; then back the save up and flush it when the page hides. */
export async function bootApp(env: BootEnv): Promise<void> {
  try {
    await env.hydrate()
  } catch (err) {
    // The page plays from whatever the default backend holds; a failed hydrate never blocks the first render.
    console.error('Loading the saved game failed:', err)
  }
  env.render()
  // A promise can't hold a closing or frozen page open, and a queued save is written after an encode step, so
  // the save queue may not get to run. The part that can help is synchronous: spill writes the newest save, plain,
  // to a backup in localStorage when the database hasn't got it yet (the next boot reconciles the two). flush
  // starts no write of its own; it only lets the queue run dry if the page stays alive.
  const leaving = (): void => {
    try {
      env.spill()
    } catch (err) {
      console.error('Backing up the save as the page hid failed:', err)
    }
    void env.flush()
  }
  env.listen('pagehide', leaving)
  env.listen('visibilitychange', () => {
    if (env.hidden()) leaving()
  })
}
