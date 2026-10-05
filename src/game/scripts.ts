// Registry for script-sourced modals (choice popups, inputs, minigame results).
// Modules register handlers at import time:
//
//   const SCRIPT = defineScript('school.bully', (g, choice, data) => { ... })
//   scriptChoice(g, SCRIPT, 'Bully', 'A bully stole your lunch.', [...])
//
// Handlers run with a mutable draft of the game state.
import type { GameState, Json, ModalItem, ScriptHandler } from './types'

const handlers = new Map<string, ScriptHandler>()

export function defineScript(id: string, handler: ScriptHandler): string {
  if (handlers.has(id)) throw new Error(`Duplicate script id: ${id}`)
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
  handler(g, choice, data, modal)
}

export function registeredScripts(): string[] {
  return [...handlers.keys()]
}
