// localStorage persistence: the current life, the ribbon collection and the graveyard.
import { GAME_VERSION } from './core'
import type { AncestorSummary, GameState } from './types'

const SAVE_KEY = 'anotherlife.save.v1'
const RIBBONS_KEY = 'anotherlife.ribbons.v1'
const GRAVEYARD_KEY = 'anotherlife.graveyard.v1'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota exceeded / storage disabled
  }
}

export function saveGame(g: GameState): void {
  write(SAVE_KEY, g)
}

export function loadGame(): GameState | null {
  const g = read<GameState>(SAVE_KEY)
  if (!g || g.version !== GAME_VERSION || !g.character) return null
  return g
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}

/** Ribbon id -> times earned. */
export function loadRibbons(): Record<string, number> {
  return read<Record<string, number>>(RIBBONS_KEY) ?? {}
}

export function recordRibbon(id: string): void {
  const all = loadRibbons()
  all[id] = (all[id] ?? 0) + 1
  write(RIBBONS_KEY, all)
}

export interface GraveyardEntry extends AncestorSummary {
  lifeId: string
  obituary: string | null
}

export function loadGraveyard(): GraveyardEntry[] {
  return read<GraveyardEntry[]>(GRAVEYARD_KEY) ?? []
}

export function addToGraveyard(entry: GraveyardEntry): void {
  const all = loadGraveyard().filter((e) => e.lifeId !== entry.lifeId)
  all.unshift(entry)
  write(GRAVEYARD_KEY, all.slice(0, 100))
}

export function removeFromGraveyard(lifeId: string): void {
  write(GRAVEYARD_KEY, loadGraveyard().filter((e) => e.lifeId !== lifeId))
}

/** Forget every earned ribbon and past life (Settings → Danger zone). */
export function clearRibbonsAndGraveyard(): void {
  try {
    localStorage.removeItem(RIBBONS_KEY)
    localStorage.removeItem(GRAVEYARD_KEY)
  } catch {
    // storage disabled
  }
}
