// Settings → Information: Realistic or Exact (R3-H1, H.3). Realistic, the default, shows estimates, ranges and words until the
// player looks closer; Exact shows every number, as the game always did. It is a presentation switch (game/knowledge/mode.ts):
// the simulation never reads it, so changing it never changes a life. Rendered by the Settings screen (uses its set-* and
// al-seg classes), the same way NoticeSettingsSection is, and always shown: both choices are real.
import type { ReactElement } from 'react'
import { infoSettingOf, type InfoSetting, type Settings } from '../../settings'
import { updateSettings, useApp } from '../store'

const OPTIONS: { id: InfoSetting; label: string }[] = [
  { id: 'realistic', label: 'Realistic' },
  { id: 'exact', label: 'Exact' },
]

/**
 * The settings patch for a radio. Realistic is the absence of the key, so it patches an explicit undefined (the store spreads the
 * patch over the settings and normalizeSettings then drops the key); Exact stores 'exact'.
 */
export function infoPatch(id: InfoSetting): Partial<Settings> {
  return id === 'exact' ? { info: 'exact' } : { info: undefined }
}

export function InfoSettingsSection(): ReactElement {
  const settings = useApp((s) => s.settings)
  const chosen = infoSettingOf(settings)
  return (
    <section className="al-card set-section">
      <h2>
        <span aria-hidden="true">🔎</span> Information
      </h2>
      <p className="set-help">Realistic: estimates, ranges and words until you look closer. Exact: every number, as before.</p>
      <div className="al-field">
        <span className="al-label">Numbers</span>
        <div className="al-seg" role="radiogroup" aria-label="Information">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen === o.id}
              aria-pressed={chosen === o.id}
              onClick={() => updateSettings(infoPatch(o.id))}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
