// Settings → Time Machine: how many jumps a life gets, and the Sandbox switch that removes the
// limit. Rendered by the Settings screen (uses its set-* classes).
import { sandboxTimeMachine, TIME_MACHINE_JUMPS, TIME_MACHINE_STOPS } from '../../game/timeMachine'
import type { Settings } from '../../settings'
import { updateSettings, useApp } from '../store'

/** The settings patch for the Sandbox switch (the field may be missing from older Settings). */
export function sandboxPatch(on: boolean): Partial<Settings> {
  return { sandboxTimeMachine: on }
}

export function TimeMachineSettingsSection() {
  const settings = useApp((s) => s.settings)
  const on = sandboxTimeMachine(settings)
  const title = 'Sandbox: unlimited Time Machine'
  return (
    <section className="al-card set-section">
      <h2>
        <span aria-hidden="true">⏳</span> Time Machine
      </h2>
      <p className="set-help">
        Every life can jump back to the start of one of its last {TIME_MACHINE_STOPS} years, {TIME_MACHINE_JUMPS} times. Handy after a
        disaster, a bad investment or an untimely death.
      </p>
      <div className="set-toggle-row">
        <div className="set-toggle-text">
          <div className="set-toggle-title">{title}</div>
          <div className="al-muted al-small">No limit on jumps, for experimenting. It makes every life a lot easier.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          className="set-switch"
          onClick={() => updateSettings(sandboxPatch(!on))}
        />
      </div>
    </section>
  )
}
