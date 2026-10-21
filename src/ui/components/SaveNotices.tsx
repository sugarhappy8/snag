// Home's notices for the copies the game kept of saves it couldn't play: what each is, and the
// buttons to download it, delete it or (for a save from a newer version) reload. The container reads
// the save status itself instead of going through ui/store.ts.
import { useSyncExternalStore, type ReactElement } from 'react'
import { deleteSaveCopy, getSaveStatus, readSaveCopy, subscribeSaveStatus, type SaveNotice, type SaveStatus } from '../../game/save'
import { SAVE_KEY } from '../../game/save-backends'
import { downloadText, saveCopyFilename } from '../download'

export type NoticeAction = 'download' | 'delete' | 'reload'

/** What the "Progress isn't saved" bar says: the storage advice for a refused write, or the database named when it is the one at fault. */
export function saveWarningCopy(status: SaveStatus): string {
  return status.database === true
    ? 'Progress isn’t reaching this browser’s database. A backup copy is kept on this device if there is room. Keep this tab open, then retry or reload.'
    : 'Progress isn’t saved. Keep this tab open. Free some browser storage or allow site storage, then retry.'
}

/** What a notice says. The version sentence of a too old save is left out when its version isn't known. */
export function noticeCopy(n: SaveNotice): { title: string; text: string } {
  switch (n.kind) {
    case 'damaged':
      return { title: "Your save didn't load", text: 'A copy is kept on this device. Download it before you start a new life.' }
    case 'tooOld':
      return {
        title: 'This save is too old to open',
        text: n.version === undefined ? 'A copy is kept. Download it.' : `It's from version ${n.version}. A copy is kept. Download it.`,
      }
    case 'newer':
      return { title: 'This save is from a newer version', text: 'Reload to update, or download a copy. New Life keeps a copy too.' }
    case 'stale':
      return { title: 'Found an older copy of your save', text: "It's kept in case you need it." }
  }
}

/** The buttons a notice gets. A record left in the main slot (its id is SAVE_KEY) can't be deleted from here. */
export function noticeActions(n: SaveNotice): readonly NoticeAction[] {
  if (n.kind === 'newer') return ['reload', 'download']
  if (n.id === SAVE_KEY) return ['download']
  return ['download', 'delete']
}

const LABELS: Record<NoticeAction, string> = { download: 'Download copy', delete: 'Delete copy', reload: 'Reload' }

export interface SaveNoticeListProps {
  notices: readonly SaveNotice[]
  onDownload(id: string): void
  onDelete(id: string): void
  onReload(): void
}

/** The list itself: nothing but its props. A damaged, too old or newer save is an alert; a stale copy is a status. */
export function SaveNoticeList({ notices, onDownload, onDelete, onReload }: SaveNoticeListProps): ReactElement | null {
  if (notices.length === 0) return null
  const press = (action: NoticeAction, id: string): void => {
    if (action === 'download') onDownload(id)
    else if (action === 'delete') onDelete(id)
    else onReload()
  }
  return (
    <section className="save-notices" aria-label="Save notices">
      {notices.map((n) => {
        const { title, text } = noticeCopy(n)
        return (
          <div key={n.id} className={`save-notice save-notice-${n.kind}`} role={n.kind === 'stale' ? 'status' : 'alert'}>
            <p className="save-notice-title">{title}</p>
            <p className="save-notice-text">{text}</p>
            <div className="save-notice-actions">
              {noticeActions(n).map((action) => (
                <button key={action} type="button" className="btn" onClick={() => press(action, n.id)}>
                  {LABELS[action]}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** Reads the copy kept under `id` and offers it as a file. Does nothing when there is no such copy. */
export async function downloadSaveCopy(id: string): Promise<void> {
  const text = await readSaveCopy(id)
  if (text === null) return
  downloadText(saveCopyFilename(new Date(), text), text)
}

/** Deletes the copy kept under `id`. Its notice goes with it; if the copy could not be removed, both stay. */
export async function removeSaveCopy(id: string): Promise<void> {
  await deleteSaveCopy(id)
}

const reload = (): void => {
  window.location.reload()
}

const notices = (): readonly SaveNotice[] => getSaveStatus().notices

/** Home's list, kept current from the save status. */
export function SaveNotices(): ReactElement | null {
  const kept = useSyncExternalStore(subscribeSaveStatus, notices, notices)
  return <SaveNoticeList notices={kept} onDownload={(id) => void downloadSaveCopy(id)} onDelete={(id) => void removeSaveCopy(id)} onReload={reload} />
}
