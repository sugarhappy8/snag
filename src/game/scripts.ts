// Registry for script-sourced modals (choice popups, inputs, minigame results).
// Modules register handlers at import time:
//
//   const SCRIPT = defineScript('school.bully', (g, choice, data) => { ... })
//   scriptChoice(g, SCRIPT, 'Bully', 'A bully stole your lunch.', [...])
//
// Handlers run with a mutable draft of the game state.
import type { GameState, Json, ModalItem, ScriptHandler } from './types'

const handlers = new Map<string, ScriptHandler>()
const RESOLVED_MODALS = 'core.resolvedScriptModals'
const MAX_RESOLVED_MODALS = 256

export function defineScript(id: string, handler: ScriptHandler): string {
  // A module re-evaluated by Vite hot reload registers its scripts again; let that replace them.
  if (handlers.has(id) && !import.meta.hot) throw new Error(`Duplicate script id: ${id}`)
  handlers.set(id, handler)
  return id
}

export function hasScript(id: string): boolean {
  return handlers.has(id)
}

export function runScript(g: GameState, id: string, choice: string, data: Json | undefined, modal: ModalItem): void {
  const handler = handlers.get(id)
  if (!handler) {
    console.warn(`No handler registered for script ${id}`)
    return
  }
  if (modal && modal.kind === 'choice' && modal.source === 'script' && modal.scriptId === id && !modal.choices.some((option) => option.id === choice)) return
  // The UI removes a modal before dispatching it, but damaged old saves can contain the same
  // popup twice and external callers can submit twice. Scripted popups are one-shot: remember a
  // bounded set of resolved ids so a replay cannot duplicate a charge, reward, birth, or event.
  if (modal && (modal.kind === 'choice' || modal.kind === 'input' || modal.kind === 'minigame') && modal.id) {
    const token = `${g.lifeId}\u0000${id}\u0000${modal.id}`
    const raw = g.flags[RESOLVED_MODALS]
    const recent = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(-(MAX_RESOLVED_MODALS - 1)) : []
    if (recent.includes(token)) return
    recent.push(token)
    g.flags[RESOLVED_MODALS] = recent
  }
  handler(g, choice, data, modal)
}

export function registeredScripts(): string[] {
  return [...handlers.keys()]
}
