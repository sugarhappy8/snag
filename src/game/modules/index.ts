// The module list (R2, K.3): the assembly point, layer L4. Every module of the game is a ModuleDef (kernel/registry.ts) and
// this is the file that registers them. Nothing below L4 imports it, so it sits outside every import cycle; an entry point
// (aging.ts for the yearly list, menus.ts for the menus) imports it for the effect, and that is what guarantees the modules
// are loaded before anything asks the registry for a list.
//
// A track adds its module here with one line, and nowhere else. Keep the list sorted by id, one module per line;
// test/kernel-registry.test.ts fails on an unsorted or repeated id. No module is registered yet: R2-K7 adds the facts shard,
// R2-K9 to R2-K12 convert the yearly hooks, the special careers, the menus and the company view.
import { registerModules, type ModuleDef } from '../kernel/registry'

export const MODULES: readonly ModuleDef[] = []

registerModules(MODULES)
