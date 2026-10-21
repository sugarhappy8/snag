// Home's notices for the copies the boot kept of saves it couldn't play (R1-A3): the wording, which
// buttons each notice gets, the download helpers, and Home itself after a damaged record at boot.
// The store is mocked as test/screens.test.ts mocks it; the save storage is the real one, behind the
// kit's localStorage in memory.
import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSaveStatus, readSaveCopy, type SaveNotice } from '../src/game/save'
import { memorySaveBackend, SAVE_KEY } from '../src/game/save-backends'
import { hydrateSaves } from '../src/game/save-hydrate'
import { resetSaveStoreForTests } from '../src/game/save-store'
import { DEFAULT_SETTINGS } from '../src/settings'
import { memoryLocalStorage } from './save-kit'

const mock = vi.hoisted(() => ({
  state: {
    screen: 'home',
    previousScreen: 'home',
    game: null as unknown,
    settings: {} as Record<string, unknown>,
  },
}))

// Home reads the store; hasSavedGame is the real answer (the save in storage), so that a Home without a
// playable save really has none.
vi.mock('../src/ui/store', async () => {
  const { loadGame } = await import('../src/game/save')
  return {
    useApp: (sel: (s: typeof mock.state) => unknown) => sel(mock.state),
    getApp: () => mock.state,
    goTo: () => undefined,
    goBack: () => undefined,
    startNewLife: () => undefined,
    resumeSavedGame: () => false,
    hasSavedGame: () => loadGame() !== null,
    continueAs: () => undefined,
    abandonLife: () => undefined,
    updateSettings: () => undefined,
    act: () => undefined,
  }
})

// Only downloadText is replaced: saveCopyFilename stays real.
vi.mock('../src/ui/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/download')>()
  return { ...actual, downloadText: vi.fn() }
})

const { downloadText, saveCopyFilename } = await import('../src/ui/download')
const { downloadSaveCopy, noticeActions, noticeCopy, removeSaveCopy, saveWarningCopy, SaveNoticeList, SaveNotices } = await import('../src/ui/components/SaveNotices')
const { HomeScreen } = await import('../src/ui/screens/HomeScreen')

const SLOT = `${SAVE_KEY}.bad`

const damaged: SaveNotice = { id: SLOT, kind: 'damaged', bytes: 8 }
const tooOld: SaveNotice = { id: `${SLOT}.2`, kind: 'tooOld', bytes: 100, version: 1 }
const newer: SaveNotice = { id: `${SLOT}.3`, kind: 'newer', bytes: 100, version: 3 }
const stale: SaveNotice = { id: 'bad-1', kind: 'stale', bytes: 100 }

let storage: ReturnType<typeof memoryLocalStorage>

beforeEach(() => {
  resetSaveStoreForTests()
  storage = memoryLocalStorage()
  vi.stubGlobal('localStorage', storage)
  mock.state.settings = { ...DEFAULT_SETTINGS }
  mock.state.game = null
  vi.mocked(downloadText).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('noticeCopy', () => {
  it('says what the game promises for each kind of kept copy', () => {
    expect(noticeCopy(damaged)).toEqual({
      title: "Your save didn't load",
      text: 'A copy is kept on this device. Download it before you start a new life.',
    })
    expect(noticeCopy(newer)).toEqual({
      title: 'This save is from a newer version',
      text: 'Reload to update, or download a copy. New Life keeps a copy too.',
    })
    expect(noticeCopy(stale)).toEqual({
      title: 'Found an older copy of your save',
      text: "It's kept in case you need it.",
    })
  })

  it('names the version of a too old save, and leaves the sentence out when it is not known', () => {
    expect(noticeCopy(tooOld)).toEqual({
      title: 'This save is too old to open',
      text: "It's from version 1. A copy is kept. Download it.",
    })
    expect(noticeCopy({ id: SLOT, kind: 'tooOld', bytes: 100 })).toEqual({
      title: 'This save is too old to open',
      text: 'A copy is kept. Download it.',
    })
  })

  it('keeps to the voice: straight apostrophes, no dashes', () => {
    for (const n of [damaged, tooOld, newer, stale]) {
      const { title, text } = noticeCopy(n)
      expect(`${title} ${text}`).not.toMatch(/[\u2014\u2013\u2019]/)
    }
  })
})

describe('saveWarningCopy', () => {
  it('keeps the storage advice for a refused write, and names the database when it is the one at fault', () => {
    const ordinary = saveWarningCopy({ notices: [], persistFailed: true })
    expect(ordinary).toBe('Progress isn’t saved. Keep this tab open. Free some browser storage or allow site storage, then retry.')
    const database = saveWarningCopy({ notices: [], persistFailed: true, database: true })
    expect(database).toContain('database')
    expect(database).not.toContain('Free some browser storage')
    expect(database).toContain('Keep this tab open')
  })

  it('keeps to the voice: no dashes', () => {
    for (const status of [{ notices: [], persistFailed: true }, { notices: [], persistFailed: true, database: true }] as const) {
      expect(saveWarningCopy(status)).not.toMatch(/[\u2014\u2013]/)
    }
  })
})

describe('noticeActions', () => {
  it('lets a newer save reload, then download', () => {
    expect(noticeActions(newer)).toEqual(['reload', 'download'])
    expect(noticeActions({ ...newer, id: SAVE_KEY })).toEqual(['reload', 'download'])
  })

  it('offers only a download for a record still in the main slot', () => {
    for (const kind of ['damaged', 'tooOld', 'stale'] as const) {
      expect(noticeActions({ id: SAVE_KEY, kind, bytes: 5 })).toEqual(['download'])
    }
  })

  it('offers a download and a delete for a kept copy', () => {
    for (const n of [damaged, tooOld, stale]) expect(noticeActions(n)).toEqual(['download', 'delete'])
  })
})

describe('saveCopyFilename', () => {
  const day = new Date('2026-10-14T12:00:00Z')

  it('names a JSON copy by the day', () => {
    expect(saveCopyFilename(day, '{}')).toBe('anotherlife-save-2026-10-14.json')
  })

  it('falls back to .txt when the text is not JSON', () => {
    expect(saveCopyFilename(day, 'not json')).toBe('anotherlife-save-2026-10-14.txt')
    expect(saveCopyFilename(day, 'gz2:1f:abcd')).toBe('anotherlife-save-2026-10-14.txt')
    expect(saveCopyFilename(day, '')).toBe('anotherlife-save-2026-10-14.txt')
  })
})

/** The buttons of a rendered element tree, by label. The list is a plain function of its props, so a test can read it without a DOM. */
function buttonsOf(node: ReactNode): { label: string; press: () => void }[] {
  const found: { label: string; press: () => void }[] = []
  const walk = (n: ReactNode): void => {
    if (Array.isArray(n)) {
      n.forEach(walk)
      return
    }
    if (!isValidElement(n)) return
    const props = n.props as { children?: ReactNode; onClick?: () => void }
    if (n.type === 'button' && props.onClick) found.push({ label: String(props.children), press: props.onClick })
    walk(props.children)
  }
  walk(node)
  return found
}

describe('SaveNoticeList', () => {
  const props = { notices: [] as readonly SaveNotice[], onDownload: vi.fn(), onDelete: vi.fn(), onReload: vi.fn() }
  const html = (notices: readonly SaveNotice[]) => renderToStaticMarkup(createElement(SaveNoticeList, { ...props, notices }))

  it('draws nothing for an empty list', () => {
    expect(html([])).toBe('')
  })

  it('shows the title and both buttons for a kept copy of a damaged save', () => {
    const out = html([damaged])
    expect(out).toContain('aria-label="Save notices"')
    expect(out).toContain('Your save didn&#x27;t load')
    expect(out).toContain('Download copy')
    expect(out).toContain('Delete copy')
    expect(out).not.toContain('Reload')
    expect(out).toContain('role="alert"')
  })

  it('offers Reload and a download for a newer save, and only a status role for a stale copy', () => {
    const newerOut = html([newer])
    expect(newerOut).toContain('Reload')
    expect(newerOut).toContain('Download copy')
    expect(newerOut).not.toContain('Delete copy')
    expect(newerOut).toContain('role="alert"')
    const staleOut = html([stale])
    expect(staleOut).toContain('role="status"')
    expect(staleOut).not.toContain('role="alert"')
  })

  it('gives every button the 44px .btn class and lists the notices in order', () => {
    const out = html([damaged, stale])
    const buttons = out.match(/<button[^>]*>/g) ?? []
    expect(buttons).toHaveLength(4)
    for (const b of buttons) expect(b).toMatch(/class="btn[ "]/)
    expect(out.indexOf('Your save didn&#x27;t load')).toBeLessThan(out.indexOf('Found an older copy of your save'))
  })

  it('passes the notice id to the download and delete handlers, and Reload takes none', () => {
    const onDownload = vi.fn()
    const onDelete = vi.fn()
    const onReload = vi.fn()
    const tree = SaveNoticeList({ notices: [damaged, newer], onDownload, onDelete, onReload })
    const byLabel = new Map<string, (() => void)[]>()
    for (const b of buttonsOf(tree)) byLabel.set(b.label, [...(byLabel.get(b.label) ?? []), b.press])
    byLabel.get('Delete copy')?.[0]()
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(damaged.id)
    byLabel.get('Download copy')?.[1]()
    expect(onDownload).toHaveBeenCalledExactlyOnceWith(newer.id)
    byLabel.get('Reload')?.[0]()
    expect(onReload).toHaveBeenCalledExactlyOnceWith()
  })
})

describe('Home with a damaged save at boot', () => {
  it('lists the kept copy above the menu and offers no Continue', async () => {
    await hydrateSaves({ backend: memorySaveBackend('not json') })
    const out = renderToStaticMarkup(createElement(HomeScreen))
    expect(out).toContain('Your save didn&#x27;t load')
    expect(out).toContain('Download copy')
    expect(out).not.toContain('Continue Life')
    expect(out.indexOf('Save notices')).toBeGreaterThan(-1)
    expect(out.indexOf('Save notices')).toBeLessThan(out.indexOf('home-menu'))
    expect(out).toContain('New Life')
  })

  it('has no notice section when nothing is kept', () => {
    const out = renderToStaticMarkup(createElement(HomeScreen))
    expect(out).not.toContain('Save notices')
    expect(out).not.toContain('save-notice')
    expect(renderToStaticMarkup(createElement(SaveNotices))).toBe('')
  })
})

describe('downloadSaveCopy and removeSaveCopy', () => {
  it('hands the exact text of the kept copy to downloadText, under a dated name', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
    await hydrateSaves({ backend: memorySaveBackend('not json') })
    const [kept] = getSaveStatus().notices
    const text = await readSaveCopy(kept.id)
    expect(text).toBe('not json')
    await downloadSaveCopy(kept.id)
    expect(downloadText).toHaveBeenCalledExactlyOnceWith(saveCopyFilename(new Date('2026-10-14T12:00:00Z'), text ?? ''), 'not json')
    expect(vi.mocked(downloadText).mock.calls[0][0]).toBe('anotherlife-save-2026-10-14.txt')
  })

  it('does nothing when the copy cannot be read', async () => {
    await downloadSaveCopy(`${SAVE_KEY}.bad.3`)
    expect(downloadText).not.toHaveBeenCalled()
  })

  it('removes the copy and its notice', async () => {
    await hydrateSaves({ backend: memorySaveBackend('not json') })
    const [kept] = getSaveStatus().notices
    expect(storage.data.get(kept.id)).toBe('not json')
    await removeSaveCopy(kept.id)
    expect(getSaveStatus().notices).toEqual([])
    expect(storage.data.has(kept.id)).toBe(false)
  })

  it('leaves the notice in place when the copy could not be removed', async () => {
    await hydrateSaves({ backend: memorySaveBackend('not json') })
    const [kept] = getSaveStatus().notices
    vi.spyOn(storage, 'removeItem').mockImplementation(() => undefined)
    await removeSaveCopy(kept.id)
    expect(getSaveStatus().notices).toEqual([kept])
    expect(storage.data.get(kept.id)).toBe('not json')
  })
})

describe('downloadText', () => {
  it('clicks a temporary link to a Blob of the text, then lets the object URL go', async () => {
    const actual = await vi.importActual<typeof import('../src/ui/download')>('../src/ui/download')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const events: string[] = []
    const anchor = {
      href: '',
      download: '',
      style: {} as Record<string, string>,
      click: () => events.push(`click ${anchor.href} ${anchor.download}`),
      remove: () => events.push('remove'),
    }
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        events.push(`create ${tag}`)
        return anchor
      },
      body: { appendChild: () => events.push('append') },
    })
    let blob: Blob | null = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation((made) => {
      blob = made as Blob
      return 'blob:copy'
    })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    actual.downloadText('anotherlife-save-2026-10-14.json', '{"a":1}')

    expect(events).toEqual(['create a', 'append', 'click blob:copy anotherlife-save-2026-10-14.json', 'remove'])
    expect(await (blob as Blob | null)?.text()).toBe('{"a":1}')
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:copy')
  })
})
