// What the rest of the game may ask of the computer domain, and what it offers it, without importing a sibling (R2-K5, K.2a rule c).
//
// Game-making lives in Special Careers (special/gamedev-make.ts), which builds on the computer's own projects (computer/dev-projects.ts).
// The computer's "Make Games" row is only a shortcut to that menu, and importing it from here closed a cycle between the two files.
// The port is the shortcut's other end: the game industry binds its menu when it loads, and the computer asks for it each time the row
// is drawn.
import { definePort } from '../kernel/ports'
import type { MenuGroup } from '../types'

/**
 * Game Industry > Make Games, for the computer's shortcut to it. Bound by special/gamedev-make.ts. Unbound: null, and the shortcut
 * shows no children and no reason, which is a test that never loaded the game industry; the app loads it with `aging`.
 */
export const gameMakingMenu = definePort('computer.gameMakingMenu', (): MenuGroup | null => null)
