// Keeping the search index warm (G.9). The walk of the menus is cut into small slices that run when the browser is idle
// (requestIdleCallback, else a 16 ms timer), so a phone is never held up by it. While a new index is being read, the one
// from the cache, or the last one built for an older state, is served; the palette re-reads each row it shows anyway.
//
// Part of the palette zone (test/lazy-zones.test.ts): only Palette.tsx and the gate import this file at run time. Nothing in
// src/game imports it.
import { useCallback, useEffect, useState } from 'react'
import type { GameState } from '../../game/types'
import {
  cachedIndex,
  clearIndexCache,
  finishIndex,
  indexKey,
  startIndexJob,
  stepIndexJob,
  storeIndex,
  type IndexRoots,
  type SearchIndex,
} from './searchIndex'

/** How long one slice may run. */
export const SLICE_MS = 8
/** The wait before a slice when the browser has no idle callback. */
const FALLBACK_MS = 16

export type Cancel = () => void
/** Runs `run` later, once; the returned function takes it back. */
export type Schedule = (run: () => void) => Cancel

/** requestIdleCallback where there is one, else a 16 ms timer. */
export function idleSchedule(run: () => void): Cancel {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run())
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(run, FALLBACK_MS)
  return () => clearTimeout(id)
}

export interface IndexJobOptions {
  schedule?: Schedule
  /** Milliseconds per slice; 0 walks one group per slice. */
  budgetMs?: number
  roots?: IndexRoots
  now?: () => number
}

/**
 * Walk the menus for `g` in slices. When the walk is over the index is put in the cache and handed to `done`. The returned
 * function stops it (nothing is stored, `done` is not called).
 */
export function runIndexJob(g: GameState, done: (index: SearchIndex) => void, opts: IndexJobOptions = {}): Cancel {
  const schedule = opts.schedule ?? idleSchedule
  const budget = opts.budgetMs ?? SLICE_MS
  const job = startIndexJob(g, opts.roots)
  let cancelled = false
  let cancelNext: Cancel = () => {}
  const tick = (): void => {
    if (cancelled) return
    if (stepIndexJob(job, budget, opts.now)) {
      const index = finishIndex(job)
      storeIndex(index)
      done(index)
      return
    }
    cancelNext = schedule(tick)
  }
  cancelNext = schedule(tick)
  return () => {
    cancelled = true
    cancelNext()
  }
}

/**
 * The last index built or found, so an older one can be served while a new one is read. It is served only inside the life it
 * was built for: person ids (p3) and company ids repeat from life to life, so another life's names would open the wrong rows.
 */
let latest: { lifeId: string; index: SearchIndex } | null = null

/** Forget the cache and the last index. For tests. */
export function resetSearchIndexForTest(): void {
  latest = null
  clearIndexCache()
}

export interface SearchIndexView {
  /** The index for this state when it is there, else the last one built for this life (it may be out of date), else null. */
  index: SearchIndex | null
  /** `index` was built for this state. */
  ready: boolean
  /** Drop the cache and read the menus again. */
  refresh: () => void
}

/** Starts the read when there is no index for this state yet. With `enabled` false it does nothing and gives no index. */
export function useSearchIndex(g: GameState, enabled: boolean): SearchIndexView {
  const [round, setRound] = useState(0)
  const [, setBuilt] = useState<SearchIndex | null>(null)
  const key = indexKey(g)
  const fresh = enabled ? cachedIndex(g) : null
  if (fresh) latest = { lifeId: g.lifeId, index: fresh }

  // `g` is read when the effect starts: a new key (the state moved on) or a refresh starts the read over.
  useEffect(() => {
    if (!enabled || cachedIndex(g) !== null) return
    return runIndexJob(g, (index) => {
      latest = { lifeId: g.lifeId, index }
      setBuilt(index)
    })
  }, [enabled, key, round])

  const refresh = useCallback(() => {
    clearIndexCache()
    setRound((n) => n + 1)
  }, [])

  const older = latest !== null && latest.lifeId === g.lifeId ? latest.index : null
  return { index: enabled ? (fresh ?? older) : null, ready: fresh !== null && fresh.complete, refresh }
}
