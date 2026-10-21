// Reading the chunks of a head back from storage (R2-S7, K.5 g). A store holds a chunk as a record (plain text, or gz1 or gz2 where
// IndexedDB compressed it); the codec (save-codec.ts assembleSave) wants the text and checks it against its manifest. This turns the
// one into the other, and it is shared by the boot (save-hydrate.ts), which reads a head to settle which game to play, and the copy
// of the main slot (save-store.ts), which hands the player a self-contained save. It touches no storage itself: the caller says how
// the records are fetched.
import { assembleSave, neededChunkIds, type Assembled } from './save-codec'
import { decodeSnapshotRecord } from './snapshot-codec'

/** Fetches stored chunk records by id (as stored); null for one the store does not hold. A store that can't be read rejects. */
export type ChunkSource = (ids: readonly string[]) => Promise<ReadonlyMap<string, string | null>>

/** How far past the length its manifest gives it a chunk may inflate: a little, so a record that claims more is refused as hostile. */
const SLACK_CHARS = 1024

/**
 * Fetches the chunks a head names through `source` and assembles the game. A record is inflated within the length the manifest gives
 * its chunk, so a hostile gz2 record cannot grow to the 20 MB cap; a record that will not inflate is handed on as it was found, which
 * the codec then finds hostile (its length is not the manifest's) and keeps whole for the quarantine copy. With no `source` every
 * chunk is missing. A `source` that rejects rejects here: whether that is an unreadable store is for the caller to say.
 */
export async function assembleStored(head: Record<string, unknown>, source: ChunkSource | undefined): Promise<Assembled> {
  const ids = neededChunkIds(head)
  const records = source === undefined || ids.length === 0 ? new Map<string, string | null>() : await source(ids)
  const manifest = head.chunks as Record<string, unknown>
  const texts = new Map<string, string | null>()
  for (const id of ids) {
    const record = records.get(id)
    if (typeof record !== 'string') {
      texts.set(id, null)
      continue
    }
    // The manifest entry is checked by neededChunkIds: its name is the id without the checksum, and its length a whole number.
    const ref = manifest[id.slice(0, id.lastIndexOf('.'))]
    const len = typeof ref === 'object' && ref !== null && typeof (ref as { len?: unknown }).len === 'number' ? (ref as { len: number }).len : 0
    try {
      texts.set(id, await decodeSnapshotRecord(record, len + SLACK_CHARS))
    } catch {
      texts.set(id, record)
    }
  }
  return assembleSave(head, texts)
}
