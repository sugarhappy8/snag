// The yearly settle of the player's effort (R3, C.2), registered as one module in the aging seam: phase `life`, order 35, so it runs
// right after the household (order 30) has booked the closing year's fatigue and before anything of the new year begins.
//
// What it does, once a year (idempotent by the record's `last` stamp):
//   - the pace chosen in Life Priorities comes into force (`effective`), and it is steady under 18;
//   - the closing year's overtime weeks are cleared (the household has already turned them into fatigue);
//   - know-how in a field that nobody worked on last year keeps 95% of itself, and a stamp that no longer matters is let go;
//   - if the body gave out (fatigue 85 or more), ambition drops a point, the year ahead is lean, and the player is told, at most once
//     in three years: "You pushed past your limit. You're easing off this year."
//
// It does nothing for a life that never touched the record: no key, no change, so an untouched life is byte for byte what it was. A
// record that ends the settle carrying nothing but its own stamp is dropped. It draws no random number and books no dollar.
import { notice } from '../core'
import type { GameState } from '../types'
import type { ModuleDef } from '../kernel/registry'
import { fadeKnowHow } from './knowhow'
import { AGE_REVEAL } from './limits'
import { hasOwn } from './num'
import { YOU_KEY, blankYou, burnedOut, hasYou, readYou, recordBurnout, writeYou } from './persona'

/** The words of the burnout notice, plain and short. */
const BURNOUT_TEXT = "You pushed past your limit. You're easing off this year."

/** Settles the closing year of the player's effort. A no-op without a record, for a stamp already made this year, or for the dead. */
export function yearlyEffort(g: GameState): void {
  if (!g.character.alive || !hasYou(g)) return
  const y = readYou(g)
  // Only this very year's stamp is a settle already made. A stamp from a later year can only come from a hand-edited save, and it must
  // not freeze the settle for the rest of the life: the settle runs and writes this year over it.
  if (y.last === g.year) return
  y.last = g.year
  y.effective = g.character.age >= AGE_REVEAL ? y.posture : 'steady'
  y.over = 0
  // A field is idle when it was not stepped in the year just closed (the stamp of the closing year is this year minus one).
  const recent = g.year - 1
  fadeKnowHow(y.fieldK, Object.keys(y.fieldK).filter((f) => !(hasOwn(y.at, f) && y.at[f]! >= recent)))
  for (const f of Object.keys(y.at)) if (!hasOwn(y.fieldK, f) && y.at[f]! < recent) delete y.at[f]
  writeYou(g, y)

  if (burnedOut(g)) {
    const burn = recordBurnout(g)
    if (burn.recorded && burn.notice) notice(g, 'Burnout', BURNOUT_TEXT, { emoji: '\u{1F62E}\u{200D}\u{1F4A8}', tone: 'bad' })
  }

  // A record with nothing in it but the stamp of this settle is not worth a key.
  const now = readYou(g)
  if (JSON.stringify({ ...now, last: -1 }) === JSON.stringify(blankYou(g))) delete g.flags[YOU_KEY]
}

/** The module: one yearly entry in the aging seam, after the household. Layer 2, so the domains above may import the effort files. */
export const effortModule: ModuleDef = {
  id: 'effort.you',
  layer: 2,
  yearly: [{ seam: 'aging', phase: 'life', order: 35, run: yearlyEffort }],
}
