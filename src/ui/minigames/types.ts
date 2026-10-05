import type { MinigameModal } from '../../game/types'

export interface MinigameProps {
  modal: MinigameModal
  /** Report the result string; it is passed to the modal's script as `choice`. */
  onDone: (result: string) => void
}
