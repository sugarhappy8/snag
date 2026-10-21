// The Quiet Mode inbox (R1-T6, G.11 step 2): the sheet behind the header bell. Routine notices that the store routed
// away from the popups wait here, newest first, grouped by the year and age they came in. Opening the sheet counts
// every row as seen; the rows that were unread when it opened keep a "New" mark for as long as it stays open.
//
// Everything on screen comes through readInbox, which clamps and repairs what a save holds, and React escapes the
// text, so a hostile row is plain text. The host (GameScreen, R1-N7) owns the open and close and the link handling.
import { useEffect, useRef, type ReactElement } from 'react'
import { inboxUnread, readInbox, type InboxItem, type InboxState } from '../../game/inbox'
import { quietModeOn } from '../../settings'
import { clearInbox, markInboxSeen, updateSettings, useApp } from '../store'
import { Sheet } from './Sheet'

export interface InboxSheetProps {
  onClose: () => void
  /** Called with the row's link ('assets/home/mortgage'); the host closes the sheet and opens that menu. Without it the Open buttons are not drawn. */
  onOpenLink?: (link: string) => void
}

export interface InboxGroup {
  key: string
  heading: string
  items: InboxItem[]
}

/** The rows grouped by year and age, the newest group first and the newest row first inside it. Pure: the state is not changed. */
export function inboxGroups(state: InboxState): InboxGroup[] {
  const groups: InboxGroup[] = []
  const byKey = new Map<string, InboxGroup>()
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i]
    const key = `${item.y}:${item.a}`
    let group = byKey.get(key)
    if (group === undefined) {
      group = { key, heading: `${item.y}, age ${item.a}`, items: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}

export function InboxSheet({ onClose, onOpenLink }: InboxSheetProps): ReactElement {
  const game = useApp((s) => s.game)
  const settings = useApp((s) => s.settings)
  const state = game ? readInbox(game) : { v: 1 as const, total: 0, seen: 0, items: [] }
  const quiet = quietModeOn(settings)

  // What was unread when the sheet opened stays marked "New" even after the sheet marks the inbox seen.
  const unreadAtOpen = useRef<number | null>(null)
  if (unreadAtOpen.current === null) unreadAtOpen.current = inboxUnread(game)
  const unread = unreadAtOpen.current

  useEffect(() => {
    if (unread > 0) markInboxSeen()
    // Once, on mount: the count is the one captured on the first render.
  }, [])

  const fresh = new Set(state.items.slice(Math.max(0, state.items.length - unread)).map((item) => item.id))
  const groups = inboxGroups(state)

  return (
    <Sheet
      title="Inbox"
      emoji="📥"
      onClose={onClose}
      footer={
        <div className="inbox-footer">
          {state.items.length > 0 ? (
            <button type="button" className="btn" onClick={() => clearInbox()}>
              Clear
            </button>
          ) : null}
          <p className="inbox-quiet">{quiet ? 'Quiet Mode is on.' : 'Quiet Mode is off.'}</p>
          <button type="button" className="btn btn-ghost" onClick={() => updateSettings({ quietMode: !quiet })}>
            {quiet ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      }
    >
      {groups.length === 0 ? (
        <p className="al-empty al-muted">Nothing here. Routine news waits here while Quiet Mode is on.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="inbox-group">
            <h3 className="inbox-heading">{group.heading}</h3>
            <ul className="inbox-list">
              {group.items.map((item) => {
                const link = item.l
                const isNew = fresh.has(item.id)
                return (
                  <li key={item.id} className={isNew ? 'inbox-row is-new' : 'inbox-row'}>
                    {isNew ? (
                      <>
                        {/* The word for a screen reader, and the same word as a badge for everyone else: the border colour alone is not enough. */}
                        <span className="sr-only">New</span>
                        <span className="inbox-new" aria-hidden>
                          New
                        </span>
                      </>
                    ) : null}
                    <span className="inbox-text">{item.t}</span>
                    {link !== undefined && onOpenLink ? (
                      <button type="button" className="btn btn-ghost inbox-open" onClick={() => onOpenLink(link)}>
                        Open
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </Sheet>
  )
}
