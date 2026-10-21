import type { StripRow } from '../../game/charts/books'
import type { MinigameModal } from '../../game/types'

export interface MinigameProps {
  modal: MinigameModal
  /** Report the result string; it is passed to the modal's script as `choice`. */
  onDone: (result: string) => void
  /** The player's companies, best first (companyStrip). Only the Annual Report reads it; the Summary tab shows it from two rows (R1-C12). */
  strip?: StripRow[]
}
