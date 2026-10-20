// R1-A5: Sheet, PopupFrame and the two screen dialogs render through ModalSurface (G.12). The output gains
// aria-modal and tabindex and nothing else; the classes the older UI tests match stay as they were. There is no DOM
// here, so the focus behaviour is covered by test/a11y-modal.test.ts and these tests look at the markup and the source.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The Settings screen imports the app store; the dialog under test needs none of it.
vi.mock('../src/ui/store', () => ({
  useApp: () => ({}),
  getApp: () => ({}),
  goBack: () => undefined,
  hasSavedGame: () => false,
  abandonLife: () => undefined,
  updateSettings: () => undefined,
}))

const { Sheet } = await import('../src/ui/components/Sheet')
const { PopupFrame, Toast } = await import('../src/ui/components/Dialogs')
const { ConfirmDialog } = await import('../src/ui/screens/SettingsScreen')

const src = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const noop = (): void => undefined

describe('Sheet', () => {
  const sheet = (props: Record<string, unknown> = {}): string =>
    renderToStaticMarkup(createElement(Sheet, { title: 'Assets', onClose: noop, children: createElement('p', null, 'Body'), ...props }))

  it('is a modal dialog with a label and a script-only focus stop', () => {
    const html = sheet()
    expect(html).toContain('class="sheet"')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Assets"')
    expect(html).toContain('tabindex="-1"')
  })

  it('keeps the backdrop outside the card and the header, body and close button inside it', () => {
    const html = sheet({ emoji: '💰' })
    expect(html.startsWith('<div class="sheet-backdrop">')).toBe(true)
    expect(html.indexOf('class="sheet-backdrop"')).toBeLessThan(html.indexOf('class="sheet"'))
    expect(html).toContain('<header class="sheet-header">')
    expect(html).toContain('<span class="sheet-emoji">💰</span>')
    expect(html).toContain('<h2 class="sheet-title">')
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('<div class="sheet-body"><p>Body</p></div>')
  })

  it('shows a Back button only with onBack, a spacer otherwise', () => {
    expect(sheet()).not.toContain('aria-label="Back"')
    expect(sheet()).toContain('sheet-nav-spacer')
    const nested = sheet({ onBack: noop })
    expect(nested).toContain('aria-label="Back"')
    expect(nested).not.toContain('sheet-nav-spacer')
  })

  it('renders the footer only when given', () => {
    expect(sheet()).not.toContain('sheet-footer')
    expect(sheet({ footer: createElement('button', null, 'Save') })).toContain('<footer class="sheet-footer"><button>Save</button></footer>')
  })

  it('adds nothing but aria-modal and tabindex to the old card markup', () => {
    const html = sheet()
    const card = html.match(/<div class="sheet"[^>]*>/)?.[0] ?? ''
    expect(card).toBe('<div class="sheet" role="dialog" aria-modal="true" aria-label="Assets" tabindex="-1">')
  })
})

describe('PopupFrame', () => {
  const popup = (props: Record<string, unknown> = {}): string =>
    renderToStaticMarkup(createElement(PopupFrame, { label: 'Notice', children: createElement('p', null, 'Hi'), ...props }))

  it('is a modal dialog with a script-only focus stop', () => {
    const html = popup()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Notice"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('<div class="popup-scroll"><p>Hi</p></div>')
  })

  it('keeps the plain class string, and adds wide, dialog and the extra class as before', () => {
    expect(popup()).toContain('class="popup-backdrop"')
    expect(popup()).toContain('class="popup"')
    const all = popup({ wide: true, dialog: true, className: 'tone-good', onBackdrop: noop })
    expect(all).toContain('class="popup-backdrop is-dialog"')
    expect(all).toContain('class="popup is-wide tone-good"')
  })

  it('wraps the card in the backdrop, with or without an onBackdrop handler', () => {
    for (const html of [popup(), popup({ onBackdrop: noop })]) {
      expect(html.startsWith('<div class="popup-backdrop">')).toBe(true)
      expect(html.indexOf('popup-backdrop')).toBeLessThan(html.indexOf('class="popup"'))
      expect(html.endsWith('</div></div></div>')).toBe(true)
    }
  })
})

describe('Toast', () => {
  it('stays announceable while a dialog is open', () => {
    const html = renderToStaticMarkup(createElement(Toast, { message: 'Saved', onDone: noop }))
    expect(html).toContain('class="toast-wrap"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('data-modal-exempt')
    expect(html).toContain('Saved')
  })
})

describe('screen dialogs', () => {
  it('ConfirmDialog in Settings is a modal alertdialog and keeps its focused confirm button', () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, { title: 'Start over?', text: 'This clears it.', confirmLabel: 'Clear', onConfirm: noop, onCancel: noop }),
    )
    expect(html).toContain('class="al-dialog-backdrop"')
    expect(html).toContain('class="al-dialog"')
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Start over?"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('Clear')
    expect(html).toContain('Cancel')
  })

  it('the Settings and Ribbons dialogs render through ModalSurface with the al-dialog class', () => {
    const settings = src('src/ui/screens/SettingsScreen.tsx')
    expect(settings).toContain("from '../a11y/ModalSurface'")
    expect(settings).toMatch(/<ModalSurface role="alertdialog" label=\{title\} className="al-dialog">/)
    expect(settings).not.toContain('role="alertdialog" aria-label')

    const ribbons = src('src/ui/screens/RibbonsScreen.tsx')
    expect(ribbons).toContain("from '../a11y/ModalSurface'")
    expect(ribbons).toMatch(/<ModalSurface role="dialog" label=\{selected\.name\} className="al-dialog">/)
    expect(ribbons).not.toContain('role="dialog" aria-label')
  })

  it('both keep autoFocus on the button the player answers with', () => {
    expect(src('src/ui/screens/SettingsScreen.tsx')).toMatch(/onClick=\{onConfirm\} autoFocus/)
    expect(src('src/ui/screens/RibbonsScreen.tsx')).toMatch(/onClick=\{\(\) => setSelected\(null\)\} autoFocus/)
  })
})

describe('wiring the kit needs', () => {
  it('Sheet and PopupFrame import ModalSurface and no longer hand-roll the dialog attributes', () => {
    const sheet = src('src/ui/components/Sheet.tsx')
    expect(sheet).toContain("from '../a11y/ModalSurface'")
    expect(sheet).toMatch(/<ModalSurface role="dialog" label=\{title\} className="sheet">/)
    expect(sheet).not.toContain('role="dialog" aria-label')

    const dialogs = src('src/ui/components/Dialogs.tsx')
    expect(dialogs).toContain("from '../a11y/ModalSurface'")
    expect(dialogs).toMatch(/<ModalSurface\s+role="dialog"\s+label=\{label\}/)
  })

  it('the save banner is exempt from inert, so it stays announceable', () => {
    const app = src('src/App.tsx')
    expect(app).toMatch(/<aside className="save-warning" role="alert" data-modal-exempt>/)
  })

  it('the Age button is the focus home when the opener has gone', () => {
    const bar = src('src/ui/components/BottomBar.tsx')
    expect(bar).toMatch(/className="bb-age"[^>]*data-focus-home/)
  })

  it('the Toast wrapper carries data-modal-exempt in the source too', () => {
    expect(src('src/ui/components/Dialogs.tsx')).toMatch(/className="toast-wrap" role="status" aria-live="polite" data-modal-exempt/)
  })

  it('the dialog containers lose the focus outline, and the global :focus-visible rule stays for controls', () => {
    const css = src('src/ui/styles/global.css')
    expect(css).toMatch(/\.sheet:focus,\s*\.popup:focus,\s*\.al-dialog:focus\s*\{\s*outline:\s*none;?\s*\}/)
    expect(css).toMatch(/^:focus-visible\s*\{/m)
    // The new rule sits beside .sheet, not in the header or token blocks.
    expect(css.indexOf('.sheet:focus')).toBeGreaterThan(css.indexOf('\n.sheet {'))
    expect(css.indexOf('.sheet:focus')).toBeLessThan(css.indexOf('\n.sheet-header {'))
  })

  it('the class strings other tests match are untouched', () => {
    const sheet = src('src/ui/components/Sheet.tsx')
    expect(sheet).toContain('className="sheet-title"')
    const dialogs = src('src/ui/components/Dialogs.tsx')
    expect(dialogs).toContain("dialog ? 'popup-backdrop is-dialog' : 'popup-backdrop'")
    expect(dialogs).toContain("['popup', wide ? 'is-wide' : '', className ?? ''].filter(Boolean).join(' ')")
  })

  it('has no em-dash or en-dash in the files this task wrote', () => {
    // BottomBar.tsx has one older comment with an em-dash (line 6); this task leaves that line alone.
    const files = [
      'src/ui/components/Sheet.tsx',
      'src/ui/components/Dialogs.tsx',
      'src/ui/screens/SettingsScreen.tsx',
      'src/ui/screens/RibbonsScreen.tsx',
      'src/App.tsx',
      'test/a11y-dialogs.test.ts',
    ]
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    for (const f of files) expect(src(f), f).not.toMatch(dashes)
  })
})
