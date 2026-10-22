// Boot, before the first render: choose where the save lives (IndexedDB, or localStorage when
// IndexedDB is missing, refuses or hangs), read what the stores hold and settle which record is the
// game to play. The record v4.0.2 left in localStorage is copied into IndexedDB and only then removed
// from localStorage; a record that can't be played (damaged, too old, a later version's, or beaten by
// a better one) is kept byte for byte as a copy before anything makes room for it. Nothing here
// rejects: every failure ends with the page playing from localStorage, as v4.0.2 did. A browser that
// has kept a life in IndexedDB is marked (idbMarked): from then on a record in the legacy key is a
// backup written because the database could not be reached or the page was closing, so it is the
// newer one, and when the database can't be reached a notice says the life is out of reach.
//
// R2-S7 (K.5): a record can be a HEAD plus CHUNK records (save-codec.ts). The boot reads the chunks a head names (from IndexedDB for
// the database's record, from the localStorage chunk store for the legacy and the local ones) before it judges the record, inside
// the same waits and the same budget as everything else. A chunk that is missing or hostile does not cost the life: the game plays
// with that part started fresh and a copy of what was lost is kept (a `partial` notice). A head whose core is unreadable is damaged
// and kept whole, as any damaged record is; a later version's head is newer before any chunk is read, and its chunks are never
// touched. A database that answers for the head and not for its chunks is out of reach as a whole, like one that hangs.
import type { AsyncChunkStore, AsyncSaveBackend, SaveBackend, SyncChunkStore } from './save-backends'
import { IDB_MARKER_KEY, idbMarked, idbSaveBackend, localSaveBackend, markIdbInUse, SAVE_KEY } from './save-backends'
import { assembleStored, type ChunkSource } from './save-chunk-read'
import { encodeSave, isChunkedHead, type LostChunk } from './save-codec'
import type { SaveNoticeKind } from './save-quarantine'
import { quarantineRecord, scanQuarantine } from './save-quarantine'
import { migrateSave, SAVE_SCHEMA } from './save-schema'
import { activeBackend, activeBackendName, addSaveNotice, primeCache, protectNewerRecord, savedThisSession, setSaveBackend } from './save-store'
import { decodeSnapshotRecord, encodeSnapshotRecord } from './snapshot-codec'
import type { GameState } from './types'

export type { ChunkSource }

/** What a stored record turned out to be. */
export type Diagnosis =
  | {
      kind: 'ready'
      game: GameState
      from: number
      /** Present when the record was a head with chunks: what of it did not load (empty when all of it did). The game plays without those parts. */
      lost?: readonly LostChunk[]
    }
  | { kind: 'newer' | 'tooOld'; version: number }
  | { kind: 'damaged' }

/**
 * Decode (plain, gz1 or gz2), JSON.parse, migrateSave. A head with chunks is first assembled from the chunks `opts.chunks` fetches
 * (without a source every chunk is missing); a later version's head is `newer` before any chunk is fetched. Any throw is 'damaged'.
 * Never rejects.
 */
export async function diagnoseRecord(raw: string, opts?: { minSchema?: number; chunks?: ChunkSource }): Promise<Diagnosis> {
  try {
    const value: unknown = JSON.parse(await decodeSnapshotRecord(raw))
    const minSchema = opts?.minSchema === undefined ? undefined : { minSchema: opts.minSchema }
    if (!isChunkedHead(value)) {
      const found = migrateSave(value, minSchema)
      return found.kind === 'invalid' ? { kind: 'damaged' } : found
    }
    // A later version's head is never read further: its chunks are not ours to fetch.
    const version = value.schemaVersion as number
    if (version > SAVE_SCHEMA) return { kind: 'newer', version }
    const assembled = await assembleStored(value, opts?.chunks)
    if (assembled.kind !== 'ready') return { kind: 'damaged' }
    const found = migrateSave(assembled.game, { ...minSchema, versions: assembled.versions })
    if (found.kind === 'invalid') return { kind: 'damaged' }
    return found.kind === 'ready' ? { ...found, lost: assembled.lost } : found
  } catch {
    return { kind: 'damaged' }
  }
}

/**
 * Both stores hold a readable game: the one to keep. The same life: the later (year, then age).
 * Different lives, or a tie: IndexedDB.
 */
export function newerOf(idb: GameState, legacy: GameState): 'idb' | 'legacy' {
  if (idb.lifeId !== legacy.lifeId) return 'idb'
  if (legacy.year !== idb.year) return legacy.year > idb.year ? 'legacy' : 'idb'
  return legacy.character.age > idb.character.age ? 'legacy' : 'idb'
}

export interface HydrateOptions {
  /** Tests: use exactly this backend and skip opening IndexedDB. */
  backend?: SaveBackend
  /** Tests: the IDBFactory to open (default globalThis.indexedDB). */
  factory?: IDBFactory
  /** false: do not use IndexedDB at all (the FLAGS.idbSaves switch). Default true. */
  idb?: boolean
  /** Budget for opening IndexedDB and reading its record, for reading the chunks it names, again for the import write, and for each copy and scan; default 3000. */
  timeoutMs?: number
  /** Budget for the whole boot; past it the page plays from localStorage. Default 8000. */
  budgetMs?: number
  /** Replaces MIN_SCHEMA (tests only). */
  minSchema?: number
}

export interface HydrateOutcome {
  backend: 'idb' | 'local' | 'memory'
  /** Where the playable record came from. */
  source: 'none' | 'idb' | 'legacy' | 'local'
  /** IndexedDB was wanted and failed, hung or refused the import, so this page uses localStorage. */
  fellBack: boolean
  /** The legacy localStorage record was copied into IndexedDB and removed from localStorage. */
  imported: boolean
  skipped?: 'already-saved'
}

const DEFAULT_TIMEOUT_MS = 3000
const DEFAULT_BUDGET_MS = 8000

/** The boot's own flag: once it is `over` the page has gone on without it, and a step still waiting must not change anything. */
interface Run {
  over: boolean
}

const ABANDONED = new Error('Boot gave up')

/** Never rejects. Awaited by main.tsx before the first render. */
export async function hydrateSaves(opts: HydrateOptions = {}): Promise<HydrateOutcome> {
  const run: Run = { over: false }
  const marked = idbMarked()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const budget = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), opts.budgetMs ?? DEFAULT_BUDGET_MS)
    })
    const outcome = await Promise.race([boot(opts, run, marked), budget])
    if (outcome !== TIMED_OUT) return outcome
    console.error('Loading the saved game took too long: playing from localStorage.')
  } catch (err) {
    console.error('Loading the saved game failed:', err)
  } finally {
    clearTimeout(timer)
  }
  run.over = true
  setSaveBackend(null)
  if (marked) addUnreachableNotice()
  return { backend: 'local', source: 'none', fellBack: true, imported: false }
}

/** The life this browser keeps in IndexedDB couldn't be reached: Home says so until the page is reloaded. */
function addUnreachableNotice(): void {
  addSaveNotice({ id: IDB_MARKER_KEY, kind: 'unreachable', bytes: 0 })
}

/**
 * Takes the localStorage record away, but only while it is still `raw`: another tab may have written a newer backup meanwhile.
 * With the record goes every chunk key of this generation: a head that is gone names none of them, and they would sit in the
 * site's quota for good.
 */
function removeLegacyIf(raw: string): void {
  const legacy = localSaveBackend()
  if (legacy.read() !== raw) return
  legacy.remove()
  legacy.chunks?.remove(legacy.chunks.ids())
}

// --- Waiting -------------------------------------------------------------------------------

const TIMED_OUT = Symbol('timed out')

/** `work`'s answer, or TIMED_OUT once `ms` have passed. A late answer, or a late failure, is dropped. */
function within<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

// --- The records ---------------------------------------------------------------------------

/** A record found in a store. Where it was found decides what becomes of it. */
interface Candidate {
  /** 'legacy' is the localStorage copy beside an IndexedDB backend; 'local' is the record of a synchronous backend. */
  readonly from: 'idb' | 'legacy' | 'local'
  readonly raw: string
  readonly found: Diagnosis
}
type Ready = Candidate & { readonly found: Extract<Diagnosis, { kind: 'ready' }> }

const isReady = (c: Candidate): c is Ready => c.found.kind === 'ready'
const versionOf = (c: Candidate): number | undefined => ('version' in c.found ? c.found.version : undefined)
/** A record that read fine but lost is a 'stale' copy; the others are kept as what they are. */
const kindOf = (c: Candidate): SaveNoticeKind => (c.found.kind === 'ready' ? 'stale' : c.found.kind)
/**
 * What is kept of a record that lost: the record itself, byte for byte. A head with chunks that read fine is kept as the whole game
 * instead, because the chunks it names go with it (the legacy ones are swept, the database's are swept by the next save) and a head
 * alone would be a copy that can't be played.
 */
const copyOf = (c: Candidate): string => (c.found.kind === 'ready' && c.found.lost !== undefined ? JSON.stringify(c.found.game) : c.raw)

/** The chunk records of a database as a ChunkSource: the rows by id. It rejects when the database fails. */
function databaseSource(store: AsyncChunkStore): ChunkSource {
  return async (ids) => {
    const rows = await store.get(ids)
    return new Map(ids.map((id, i) => [id, rows[i] ?? null] as const))
  }
}

/** The chunk records of localStorage (or of a synchronous backend) as a ChunkSource. */
function localSource(store: SyncChunkStore | undefined): ChunkSource | undefined {
  return store === undefined ? undefined : async (ids) => new Map(ids.map((id) => [id, store.get(id)] as const))
}

/**
 * The same, for the boot: a read that fails or goes unanswered for `timeoutMs` marks the database `silent` and answers with
 * nothing, and the boot throws that candidate away: a record whose chunks could not be read is not a record with missing chunks.
 */
function bootSource(store: AsyncChunkStore | undefined, timeoutMs: number, reach: { silent: boolean }): ChunkSource | undefined {
  if (store === undefined) return undefined
  const read = databaseSource(store)
  return async (ids) => {
    const rows = await within(read(ids), timeoutMs).catch((): typeof TIMED_OUT => TIMED_OUT)
    if (rows === TIMED_OUT) {
      reach.silent = true
      return new Map()
    }
    return rows
  }
}

interface Chosen {
  /** What the chosen backend holds in the main slot. */
  record: string | null
  fellBack: boolean
}

/**
 * Picks the backend with setSaveBackend and reads its record. IndexedDB that fails or hangs means
 * localStorage. A browser that has kept a life in IndexedDB (`marked`) uses it even with the switch
 * off: the switch decides whether a browser starts using the database, not whether a life that has
 * moved there stays visible.
 */
async function chooseBackend(opts: HydrateOptions, timeoutMs: number, marked: boolean, check: () => void): Promise<Chosen> {
  if (opts.backend === undefined && opts.idb === false && !marked) {
    setSaveBackend(null)
    return { record: await activeBackend().read(), fellBack: false }
  }
  const attempt = { abandoned: false }
  const open = async (): Promise<{ backend: SaveBackend; record: string | null }> => {
    const backend = opts.backend ?? (await idbSaveBackend(opts.factory, timeoutMs))
    // A database that answered after the fallback is never read, let alone switched to.
    if (attempt.abandoned) throw new Error('Boot gave up on the database')
    return { backend, record: await backend.read() }
  }
  const opened = await within(open(), timeoutMs).catch((): typeof TIMED_OUT => TIMED_OUT)
  check()
  if (opened === TIMED_OUT) {
    attempt.abandoned = true
    setSaveBackend(null)
    return { record: await activeBackend().read(), fellBack: true }
  }
  setSaveBackend(opened.backend)
  return { record: opened.record, fellBack: false }
}

/**
 * Copies the legacy game into IndexedDB and reads it back: true only when it came back identical,
 * and only then does the localStorage record go. Any failure, mismatch or silence past `timeoutMs`
 * is false and leaves localStorage as it was. A database with a chunk store gets the game as a head
 * with chunks (the chunks first, the head after them, so the head names only what the database
 * holds) and is read back through its own chunks; one without gets the one self-contained record.
 */
async function importLegacy(backend: AsyncSaveBackend, game: GameState, raw: string, timeoutMs: number, check: () => void): Promise<boolean> {
  const json = JSON.stringify(game)
  const attempt = { abandoned: false }
  const copy = async (): Promise<boolean> => {
    const store = backend.chunks
    if (store === undefined) {
      const record = await encodeSnapshotRecord(json)
      // Past the budget the page has gone back to localStorage: nothing more is written.
      if (attempt.abandoned) return false
      await backend.write(record)
      if (attempt.abandoned) return false
      const back = await backend.read()
      return back !== null && (await decodeSnapshotRecord(back)) === json
    }
    const enc = encodeSave(game)
    const entries: [id: string, record: string][] = []
    for (const [id, text] of enc.chunks) entries.push([id, await encodeSnapshotRecord(text)])
    const head = await encodeSnapshotRecord(enc.head)
    if (attempt.abandoned) return false
    if (entries.length > 0) await store.put(entries)
    if (attempt.abandoned) return false
    await backend.write(head)
    if (attempt.abandoned) return false
    const back = await backend.read()
    if (back === null) return false
    const found = await diagnoseRecord(back, { chunks: databaseSource(store) })
    return found.kind === 'ready' && found.lost?.length === 0 && JSON.stringify(found.game) === json
  }
  try {
    const stored = await within(copy(), timeoutMs)
    if (stored === TIMED_OUT) attempt.abandoned = true
    if (stored !== true) return false
  } catch {
    return false
  }
  check()
  primeCache(json)
  removeLegacyIf(raw)
  return true
}

/**
 * Keeps a record that lost (or can't be played) as a copy, and clears it from its store once the
 * copy is confirmed. False when no copy could be made (five are kept, or storage didn't answer in
 * time): the record stays where it is. An IndexedDB loser is not cleared when the legacy game is
 * about to be written over it. A record that is already kept, byte for byte, counts as copied.
 */
async function shelve(loser: Candidate, overwritten: boolean, timeoutMs: number, check: () => void): Promise<boolean> {
  const backend = activeBackend()
  const copy = await within(quarantineRecord(backend, copyOf(loser), kindOf(loser), versionOf(loser)), timeoutMs)
  check()
  if (copy === TIMED_OUT || copy === null) return false
  try {
    if (loser.from === 'legacy') {
      removeLegacyIf(loser.raw)
    } else if (!(loser.from === 'idb' && overwritten)) {
      await within(Promise.resolve(backend.remove()), timeoutMs)
      check()
    }
  } catch (err) {
    if (err === ABANDONED) throw err
    // The copy is safe; the record stays in its store and is not copied again next boot (it is kept already).
    console.error('Could not clear a record that was kept as a copy:', err)
  }
  return true
}

/** The notice for a record left in the main slot. */
function inPlace(c: Candidate): void {
  const kind = kindOf(c)
  const version = versionOf(c)
  addSaveNotice(version === undefined ? { id: SAVE_KEY, kind, bytes: c.raw.length } : { id: SAVE_KEY, kind, bytes: c.raw.length, version })
}

// --- A save that loaded in part ------------------------------------------------------------

/**
 * A kept copy of the part of a save that did not load begins with this, so that a rescan of the kept copies knows it without
 * parsing megabytes: `{ al: 'partial-save', head, chunks }`, the head as it was and the text of each hostile chunk by its id.
 */
const PARTIAL_PREFIX = '{"al":"partial-save",'
/** The most of one hostile chunk the copy keeps, and of all of them together (characters). */
const PARTIAL_CHUNK_CHARS = 2_000_000
const PARTIAL_TOTAL_CHARS = 3_000_000

const isPartialCopy = (raw: string): boolean => raw.startsWith(PARTIAL_PREFIX)

/** The copy of what a head lost: the head, and the hostile texts (never a missing one: there is no text). */
async function partialCopy(raw: string, lost: readonly LostChunk[]): Promise<string> {
  const head: unknown = JSON.parse(await decodeSnapshotRecord(raw))
  if (!isChunkedHead(head)) throw new Error('The record is not a head with chunks')
  const manifest = head.chunks as Record<string, unknown>
  const texts = new Map<string, string>()
  let total = 0
  for (const loss of lost) {
    if (loss.raw === undefined) continue
    const ref = manifest[loss.name]
    const id = typeof ref === 'object' && ref !== null ? (ref as { id?: unknown }).id : undefined
    if (typeof id !== 'string' || texts.has(id)) continue
    const text = loss.raw.length > PARTIAL_CHUNK_CHARS ? loss.raw.slice(0, PARTIAL_CHUNK_CHARS) : loss.raw
    if (total + text.length > PARTIAL_TOTAL_CHARS) continue
    texts.set(id, text)
    total += text.length
  }
  return JSON.stringify({ al: 'partial-save', head, chunks: Object.fromEntries(texts) })
}

/**
 * The game plays, with the parts that did not load started fresh, and a copy of what was lost is kept for the player to download.
 * Best effort and never in the winner's way: with five copies kept already, or no room, there is no copy and no notice.
 */
async function keepPartial(winner: Ready, timeoutMs: number, check: () => void): Promise<void> {
  const lost = winner.found.lost
  if (lost === undefined || lost.length === 0) return
  try {
    const copy = await within(partialCopy(winner.raw, lost).then((text) => quarantineRecord(activeBackend(), text, 'damaged')), timeoutMs)
    check()
    if (copy !== TIMED_OUT && copy !== null) addSaveNotice({ ...copy, partial: true })
  } catch (err) {
    if (err === ABANDONED) throw err
    console.error('Could not keep a copy of the part of the save that did not load:', err)
  }
}

// --- Boot ----------------------------------------------------------------------------------

/** The same game once migrated: a record and its copy (a backup the database caught up with) need no second copy. */
const sameGame = (a: Ready, b: Ready): boolean => JSON.stringify(a.found.game) === JSON.stringify(b.found.game)

async function boot(opts: HydrateOptions, run: Run, marked: boolean): Promise<HydrateOutcome> {
  if (savedThisSession()) return { backend: activeBackendName(), source: 'none', fellBack: false, imported: false, skipped: 'already-saved' }
  const check = (): void => {
    if (run.over) throw ABANDONED
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const minSchema = opts.minSchema === undefined ? undefined : { minSchema: opts.minSchema }
  // The legacy key first, then the database: a tab importing at the same moment writes the database before it
  // removes the key, so this order always finds the life in at least one of them.
  const legacyRaw = localSaveBackend().read()
  const chosen = await chooseBackend(opts, timeoutMs, marked, check)
  let fellBack = chosen.fellBack
  let backend = activeBackend()

  const candidates: Candidate[] = []
  const consider = async (from: Candidate['from'], raw: string | null, chunks: ChunkSource | undefined): Promise<void> => {
    if (raw) candidates.push({ from, raw, found: await diagnoseRecord(raw, { ...minSchema, chunks }) })
  }
  if (backend.kind === 'async') {
    const reach = { silent: false }
    await consider('idb', chosen.record, bootSource(backend.chunks, timeoutMs, reach))
    check()
    if (reach.silent) {
      // The database answered for the head and not for the chunks it names: it is out of reach as a whole, as one that hangs
      // is. Nothing it holds is judged, copied or removed; the page plays from localStorage.
      candidates.length = 0
      setSaveBackend(null)
      fellBack = true
      backend = activeBackend()
      if (backend.kind === 'sync') await consider('local', backend.read(), localSource(backend.chunks))
    } else {
      await consider('legacy', legacyRaw, localSource(localSaveBackend().chunks))
    }
  } else {
    await consider('local', chosen.record, localSource(backend.chunks))
  }
  check()

  let source: HydrateOutcome['source'] = 'none'
  let imported = false
  const legacyNewer = candidates.find((c) => c.from === 'legacy' && c.found.kind === 'newer')
  if (legacyNewer) {
    // A later version's save sits in localStorage: leave IndexedDB alone and play from localStorage.
    setSaveBackend(null)
    protectNewerRecord(legacyNewer.raw, versionOf(legacyNewer) ?? 0)
    inPlace(legacyNewer)
  } else {
    const keptNewer = candidates.find((c) => c.found.kind === 'newer')
    const ready = candidates.filter(isReady)
    let winner: Ready | null = null
    let duplicate: Candidate | null = null
    if (keptNewer) {
      protectNewerRecord(keptNewer.raw, versionOf(keptNewer) ?? 0)
      inPlace(keptNewer)
    } else if (ready.length === 2) {
      const [fromIdb, fromLegacy] = ready
      if (sameGame(fromIdb, fromLegacy)) {
        // The database caught up with a backup: one game in two places, so nothing is lost by dropping the backup.
        winner = fromIdb
        duplicate = fromLegacy
      } else if (marked) {
        // This browser keeps its life in the database, so a localStorage record was written because the database
        // could not be reached or the page was closing: it is the newer one, whatever year and age say.
        winner = fromLegacy
      } else {
        winner = newerOf(fromIdb.found.game, fromLegacy.found.game) === 'idb' ? fromIdb : fromLegacy
      }
    } else if (ready.length === 1) {
      winner = ready[0]
    }

    const importing = winner !== null && winner.from === 'legacy'
    let unkept = false
    for (const loser of candidates.filter((c) => c !== winner && c !== keptNewer)) {
      if (loser === duplicate) {
        removeLegacyIf(loser.raw)
        continue
      }
      if (await shelve(loser, importing, timeoutMs, check)) continue
      // Download of the main key reads the IndexedDB record, which would mislead for a legacy loser.
      if (loser.from === 'legacy') continue
      // The import would write over this one with no copy of it: play from localStorage instead.
      if (loser.from === 'idb' && importing) unkept = true
      else inPlace(loser)
    }

    // Before the import below can remove the legacy record and the chunks it names.
    if (winner !== null) await keepPartial(winner, timeoutMs, check)

    if (winner !== null && winner.from === 'idb') {
      // The database's chunks are known to be in storage, so the first save writes only what it changed (and sweeps the rest).
      const stored =
        backend.kind === 'async' && backend.chunks !== undefined ? await within(backend.chunks.ids(), timeoutMs).catch((): typeof TIMED_OUT => TIMED_OUT) : TIMED_OUT
      check()
      primeCache(JSON.stringify(winner.found.game), stored === TIMED_OUT ? undefined : stored)
      source = 'idb'
      markIdbInUse()
    } else if (winner !== null && winner.from === 'local') {
      source = 'local'
    } else if (winner !== null && winner.from === 'legacy' && backend.kind === 'async') {
      if (!unkept && (await importLegacy(backend, winner.found.game, winner.raw, timeoutMs, check))) {
        source = 'legacy'
        imported = true
        markIdbInUse()
      } else {
        check()
        setSaveBackend(null)
        fellBack = true
        source = 'local'
      }
    }
  }

  check()
  // The life this browser keeps in IndexedDB is out of reach: say so, because Home would otherwise look empty.
  if (marked && fellBack) addUnreachableNotice()
  await listKeptCopies(minSchema, timeoutMs, check)
  return { backend: activeBackendName(), source, fellBack, imported }
}

/** Lists the copies already kept, those made just now among them. A failure, or a store too slow to answer, changes nothing else. */
async function listKeptCopies(minSchema: { minSchema: number } | undefined, timeoutMs: number, check: () => void): Promise<void> {
  try {
    const diagnose = async (raw: string): Promise<{ kind: SaveNoticeKind; version?: number; partial?: true }> => {
      if (isPartialCopy(raw)) return { kind: 'damaged', partial: true }
      const found = await diagnoseRecord(raw, minSchema)
      if (found.kind === 'ready') return { kind: 'stale' }
      return found.kind === 'damaged' ? { kind: 'damaged' } : { kind: found.kind, version: found.version }
    }
    // Each notice is listed as it is found, so a slow overflow doesn't hold back the copies in the slots.
    const scan = scanQuarantine(activeBackend(), diagnose, (found) => {
      check()
      addSaveNotice(found)
    })
    await within(scan, timeoutMs)
    check()
  } catch (err) {
    if (err === ABANDONED) throw err
    console.error('Could not list the saved copies:', err)
  }
}
