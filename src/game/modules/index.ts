// The module list (R2, K.3): the assembly point, layer L4. Every module of the game is a ModuleDef (kernel/registry.ts) and
// this is the file that registers them. Nothing below L4 imports it, so it sits outside every import cycle; an entry point
// (aging.ts for the yearly list, menus.ts for the menus) imports it for the effect, and that is what guarantees the modules
// are loaded before anything asks the registry for a list.
//
// A track adds its module here with one line, and nowhere else. Keep the list sorted by id, one module per line;
// test/kernel-registry.test.ts fails on an unsorted or repeated id. R2-K7 added the fact recorder; R2-K9 added the yearly hooks of
// ageUp (yearly-aging.ts, one module per hook, itself sorted by id); R2-K10 to R2-K12 convert the special careers, the menus and
// the company view.
import { effortModule } from '../effort/module'
import { registerModules, type ModuleDef } from '../kernel/registry'
import { factsModule } from '../world/facts'
import { MENU_MODULES } from './menus-core'
import { YEARLY_AGING } from './yearly-aging'

export const MODULES: readonly ModuleDef[] = [
  effortModule, // the player's effort: the yearly settle of posture, overtime, fading know-how and burnout (R3-E6)
  ...MENU_MODULES, // the rows of the Assets, Shopping and Activities menus (menus.ts imports this file for them)
  factsModule,
  ...YEARLY_AGING,
]

registerModules(MODULES)
