// Settings → Notices: the Quiet Mode switch (R1-T5, G.11 step 2). Routine news waits in the inbox instead of
// popping up; decisions, money, health and legal news always pop up (game/notice-policy.ts). The section is
// hidden while FLAGS.quietInbox is off, so no dead switch ships. Rendered by the Settings screen (uses its set-*
// classes), the same way TimeMachineSettingsSection is.
import type { ReactElement } from 'react'
import { FLAGS } from '../../game/flags'
import { quietModeOn, type Settings } from '../../settings'
import { updateSettings, useApp } from '../store'

/** The settings patch for the Quiet Mode switch. */
export function quietPatch(on: boolean): Partial<Settings> {
  return { quietMode: on }
}

function NoticeSettingsCard(): ReactElement {
  const settings = useApp((s) => s.settings)
  const on = quietModeOn(settings)
  const title = 'Quiet Mode'
  return (
    <section className="al-card set-section">
      <h2>
        <span aria-hidden="true">🔔</span> Notices
      </h2>
      <p className="set-help">
        Routine news waits in the inbox instead of popping up. Decisions, money, health and legal news always pop up.
      </p>
      <div className="set-toggle-row">
        <div className="set-toggle-text">
          <div className="set-toggle-title">{title}</div>
          <div className="al-muted al-small">On by default.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          className="set-switch"
          onClick={() => updateSettings(quietPatch(!on))}
        />
      </div>
    </section>
  )
}

/** The Notices card, or nothing while the quietInbox flag is off. */
export function NoticeSettingsSection(): ReactElement | null {
  return FLAGS.quietInbox ? <NoticeSettingsCard /> : null
}
