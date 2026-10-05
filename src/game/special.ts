import type { GameState, MenuGroup, MenuNode } from './types'
const g0 = (id: string, label: string, emoji: string): MenuGroup => ({ type: 'menu', id, label, emoji, children: () => [{ type: 'info', id: id + '.i', text: 'Stub for smoke test.' }] })
export function yearlySpecial(_g: GameState): void {}
export const specialCareersMenu = g0('special', 'Special Careers', '🌟')
export const militaryMenu = g0('military', 'Military', '🎖️')
export function specialJobNodes(_g: GameState): MenuNode[] { return [] }
export const fameMenu = g0('fame', 'Fame', '⭐')
export const socialMediaMenu = g0('social', 'Social Media', '📱')
