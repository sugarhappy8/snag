import type { ChoiceModal, GameState } from './types'
import { log, notice } from './core'
export function queueFallbackYearEvents(g: GameState): void { log(g, 'A year passed quietly.') }
export function fallbackChoiceOutcome(g: GameState, _e: ChoiceModal, _c: string): void { notice(g, 'Outcome', 'Something happened.') }
export function fallbackCustomAction(g: GameState, text: string): void { notice(g, 'Done', 'You tried: ' + text) }
export function fallbackObituary(_g: GameState): string { return 'They lived.' }
