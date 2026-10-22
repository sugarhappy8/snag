// R3-H5 (H.2): the knowledge module. The assembly point (modules/index.ts) lists `knowledgeModule`; this file is everything it adds to the
// game and the one hook it binds:
//
//   yearly   `yearlyKnowledge`, aging seam, phase close, order 20: after the milestones, before the world settles the year.
//   menu     the Intelligence Briefing in assets.money at order 45, between the Money Team (40) and Banking (50).
//   sink     `applyReveals`, bound to the Effort track's reveal hook at load (effort/hooks.ts bindRevealed): what a finished piece of
//            research teaches about the keys the player already tracks.
//
// yearlyKnowledge returns at once for the dead and for a life with no record (a default life never gets one). Otherwise: prune what can no
// longer be read, run the standing orders, then settle the heat (risk.ts, which writes the year stamp `sy` the step is idempotent by), and
// let an empty record go. It draws nothing outside risk.ts and reads no information mode, so Exact and Realistic play the same years.
//
// applyReveals never runs in Exact mode, touches at most 12 stored rows a call (the stalest first), and draws nothing: a `lab` reading is
// the truth plus a hashed draw (intel.ts takeReading), once a year per key, so a replayed call narrows nothing twice. The sd follows the
// strength of the result: a faint hint is a weak read, a conclusive one reads at the lab floor.
import { bindRevealed } from '../effort/hooks'
import type { Reveal } from '../effort/types'
import type { ModuleDef } from '../kernel/registry'
import type { GameState } from '../types'
import { intelBriefingMenu } from './briefing'
import { takeReading } from './intel'
import { kindOfKey } from './kinds'
import { isExact } from './mode'
import { recordFor, tidyRecord } from './record'
import { settleHazard } from './risk'
import { rawRec, readRows, stampOf } from './rows'
import { runOrders } from './standing'
import { readingSd } from './sources'

/** The most stored rows one reveal call may sharpen. */
export const REVEAL_ROWS = 12

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Call an owner's hook; a hook that throws or answers badly is a hook with no answer. */
function ask<T>(f: () => T): T | null {
  try {
    return f()
  } catch {
    return null
  }
}

/** The yearly step: prune, run the standing orders, settle the heat. Idempotent by the record's year stamp. */
export function yearlyKnowledge(g: GameState): void {
  if (!g.character.alive) return
  const before = rawRec(g)
  if (!before || stampOf(before.sy, g.year) === g.year) return
  recordFor(g)
  runOrders(g)
  settleHazard(g)
  tidyRecord(g)
}

/**
 * What a finished piece of research teaches: each stored row whose key kind lists a researched field among its `revealedBy` gets a `lab`
 * reading of the key's truth, as sharp as the strongest matching reveal (strength 0 to 1). Never in Exact mode; nothing for a key with no
 * owner or no truth now; at most REVEAL_ROWS rows a call, the stalest first.
 */
export function applyReveals(g: GameState, reveals: readonly Reveal[]): void {
  if (isExact() || !g.character.alive || !Array.isArray(reveals) || reveals.length === 0) return
  const rec = rawRec(g)
  if (!rec) return
  let touched = 0
  for (const [key] of readRows(g, rec)) {
    if (touched >= REVEAL_ROWS) break
    const kind = kindOfKey(key)
    if (!kind || typeof kind.revealedBy !== 'function') continue
    const fields = ask(() => kind.revealedBy!(g, key))
    if (!Array.isArray(fields)) continue
    const strength = reveals.reduce((best, r) => (fields.includes(r.field) && finite(r.strength) ? Math.max(best, r.strength) : best), -1)
    if (strength < 0) continue
    const truth = ask(() => kind.truth(g, key))
    if (!finite(truth)) continue
    const scale = kind.scale ? ask(() => kind.scale!(g, key)) : null
    touched++
    takeReading(g, 'lab', key, truth, {
      sd: readingSd('lab', { quality: Math.min(1, strength) }),
      ...(finite(scale) && scale > 0 ? { scale } : {}),
    })
  }
}

export const knowledgeModule: ModuleDef = {
  id: 'knowledge.core',
  layer: 3,
  yearly: [{ seam: 'aging', phase: 'close', order: 20, run: yearlyKnowledge }],
  menus: [{ path: 'assets.money', order: 45, build: () => [intelBriefingMenu] }],
}

bindRevealed(applyReveals)
