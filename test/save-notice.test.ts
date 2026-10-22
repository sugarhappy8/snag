// Home's notices for the copies the boot kept of saves it couldn't play (R1-A3): the wording, which
// buttons each notice gets, the download helpers, and Home itself after a damaged record at boot.
// The store is mocked as test/screens.test.ts mocks it; the save storage is the real one, behind the
// kit's localStorage in memory.
import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSaveStatus, readSaveCopy, type SaveNotice } from '../src/game/save'
import { IDB_MARKER_KEY, memorySaveBackend, SAVE_KEY } from '../src/game/save-backends'
import { hydrateSaves } from '../src/game/save-hydrate'
import { addSaveNotice, resetSaveStoreForTests } from '../src/game/save-store'
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
const { copySize, downloadSaveCopy, isDbUnreachable, newLifeWarning, noticeActions, noticeCopy, removeSaveCopy, saveWarningCopy, SaveNoticeList, SaveNotices } =
  await import('../src/ui/components/SaveNotices')
const { HomeScreen } = await import('../src/ui/screens/HomeScreen')

const SLOT = `${SAVE_KEY}.bad`

const damaged: SaveNotice = { id: SLOT, kind: 'damaged', bytes: 8 }
const tooOld: SaveNotice = { id: `${SLOT}.2`, kind: 'tooOld', bytes: 100, version: 1 }
const newer: SaveNotice = { id: `${SLOT}.3`, kind: 'newer', bytes: 100, version: 3 }
const stale: SaveNotice = { id: 'bad-1', kind: 'stale', bytes: 100 }
const unreachable: SaveNotice = { id: IDB_MARKER_KEY, kind: 'unreachable', bytes: 0 }
/** The copy of the part of a save that did not load (R2-S7): the game plays, that part started fresh. */
const partial: SaveNotice = { id: `${SLOT}.2`, kind: 'damaged', bytes: 3000, partial: true }

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

  it('says the database did not answer, and what a new life does meanwhile, for a life that is out of reach', () => {
    expect(noticeCopy(unreachable)).toEqual({
      title: 'Your saved life is out of reach',
      text: "This browser keeps it in a database that didn't answer. Reload to try again. A new life started now is kept apart from it.",
    })
  })

  it('says a part of the save started fresh, and that a copy is kept, for a partial load', () => {
    expect(noticeCopy(partial)).toEqual({
      title: "Part of your save didn't load",
      text: 'That part started fresh, and a copy is kept on this device. Download it if you want to look.',
    })
    // A damaged copy without the flag keeps its own words.
    expect(noticeCopy(damaged).title).toBe("Your save didn't load")
    const { title, text } = noticeCopy(partial)
    expect(title.length).toBeLessThanOrEqual(120)
    expect(text.length).toBeLessThanOrEqual(120)
  })

  it('keeps to the voice: straight apostrophes, no dashes', () => {
    for (const n of [damaged, tooOld, newer, stale, unreachable, partial]) {
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

  it('offers only a reload for a life that is out of reach: there is nothing to download or delete', () => {
    expect(noticeActions(unreachable)).toEqual(['reload'])
  })

  it('offers a download and a delete for a kept copy', () => {
    for (const n of [damaged, tooOld, stale, partial]) expect(noticeActions(n)).toEqual(['download', 'delete'])
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

  it('shows the partial variant for a copy of the part of a save that did not load, as an alert with both buttons', () => {
    const out = html([partial])
    expect(out).toContain('Part of your save didn&#x27;t load')
    expect(out).not.toContain('Your save didn&#x27;t load')
    expect(out).toContain('Download copy')
    expect(out).toContain('Delete copy')
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

describe('copySize', () => {
  it('says how big a copy is in words a player knows', () => {
    expect(copySize(0)).toBe('empty')
    expect(copySize(8)).toBe('8 characters')
    expect(copySize(1)).toBe('1 character')
    expect(copySize(2400)).toBe('2 KB')
    expect(copySize(1_260_000)).toBe('1.3 MB')
  })
})

describe('the buttons of a list of copies', () => {
  const props = { notices: [damaged, tooOld] as readonly SaveNotice[], onDownload: vi.fn(), onDelete: vi.fn(), onReload: vi.fn() }
  const labels = (notices: readonly SaveNotice[], extra: object = {}): string[] => {
    const out = renderToStaticMarkup(createElement(SaveNoticeList, { ...props, notices, ...extra }))
    return [...out.matchAll(/<button[^>]*aria-label="([^"]*)"/g)].map((m) => m[1].replaceAll('&#x27;', "'"))
  }

  it('gives each button a name that tells the copies apart and still starts with what the button says', () => {
    const names = labels([damaged, tooOld])
    expect(names).toEqual([
      "Download copy, Your save didn't load, 8 characters",
      "Delete copy, Your save didn't load, 8 characters",
      'Download copy, This save is too old to open, 100 characters',
      'Delete copy, This save is too old to open, 100 characters',
    ])
    expect(new Set(names).size).toBe(names.length)
    expect(labels([newer])).toEqual(['Reload, This save is from a newer version', 'Download copy, This save is from a newer version, 100 characters'])
    expect(labels([unreachable])).toEqual(['Reload, Your saved life is out of reach'])
  })

  it('keeps the visible label of every button as it was', () => {
    const out = renderToStaticMarkup(createElement(SaveNoticeList, { ...props }))
    expect(out.match(/>Download copy<\/button>/g)).toHaveLength(2)
    expect(out.match(/>Delete copy<\/button>/g)).toHaveLength(2)
  })

  it('asks before a copy goes: the notice being asked about shows the question in place of its buttons', () => {
    const out = renderToStaticMarkup(createElement(SaveNoticeList, { ...props, asking: damaged.id, onConfirmDelete: vi.fn(), onKeep: vi.fn() }))
    expect(out).toContain('Delete this copy? It can&#x27;t be brought back.')
    // The other notice is untouched, and the one being asked about offers only the two answers.
    expect(out.match(/>Download copy<\/button>/g)).toHaveLength(1)
    expect(out).toContain('>Delete it<')
    expect(out).toContain('>Keep it<')
  })

  it('passes the id to the answer that deletes, and nothing to the one that keeps', () => {
    const onConfirmDelete = vi.fn()
    const onKeep = vi.fn()
    const tree = SaveNoticeList({ ...props, asking: tooOld.id, onConfirmDelete, onKeep })
    const byLabel = new Map(buttonsOf(tree).map((b) => [b.label, b.press]))
    byLabel.get('Delete it')?.()
    expect(onConfirmDelete).toHaveBeenCalledExactlyOnceWith(tooOld.id)
    byLabel.get('Keep it')?.()
    expect(onKeep).toHaveBeenCalledExactlyOnceWith()
  })

  it('has a status line for what the page has to tell about a copy', () => {
    const out = renderToStaticMarkup(createElement(SaveNoticeList, { ...props, message: "That copy couldn't be read." }))
    expect(out).toContain('role="status"')
    expect(out).toContain('That copy couldn&#x27;t be read.')
  })
})

describe('isDbUnreachable and the New Life warning', () => {
  it('sees the notice for a life that is out of reach, and no other', () => {
    expect(isDbUnreachable()).toBe(false)
    addSaveNotice(damaged)
    expect(isDbUnreachable()).toBe(false)
    addSaveNotice(unreachable)
    expect(isDbUnreachable()).toBe(true)
  })

  it('warns about a living life as before, about a life out of reach, and about both', () => {
    expect(newLifeWarning(null, false)).toBeNull()
    expect(newLifeWarning('Ada Lovelace', false)).toEqual({
      title: 'Abandon your current life?',
      text: 'Ada Lovelace is still alive. Starting a new life ends theirs on the spot: no grave, no ribbon, no heirs.',
    })
    const out = newLifeWarning(null, true)
    expect(out?.title).toBe('Start a new life anyway?')
    expect(out?.text).toContain('Reload to try again first')
    expect(out?.text).toContain('out of reach')
    const both = newLifeWarning('Ada Lovelace', true)
    expect(both?.title).toBe('Abandon your current life?')
    expect(both?.text).toContain('Ada Lovelace is still alive')
    expect(both?.text).toContain('out of reach')
  })

  it('keeps to the voice: no dashes', () => {
    for (const w of [newLifeWarning('Ada Lovelace', true), newLifeWarning(null, true)]) {
      expect(`${w?.title} ${w?.text}`).not.toMatch(/[—–]/)
    }
  })

  it('Home shows the notice with a Reload button and no Download', () => {
    addSaveNotice(unreachable)
    const out = renderToStaticMarkup(createElement(HomeScreen))
    expect(out).toContain('Your saved life is out of reach')
    expect(out).toContain('>Reload<')
    expect(out).not.toContain('Download copy')
    expect(out).toContain('New Life')
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

  it('does nothing when the copy cannot be read, and says so', async () => {
    expect(await downloadSaveCopy(`${SAVE_KEY}.bad.3`)).toBe(false)
    expect(downloadText).not.toHaveBeenCalled()
  })

  it('says it handed the copy over when it did', async () => {
    await hydrateSaves({ backend: memorySaveBackend('not json') })
    const [kept] = getSaveStatus().notices
    expect(await downloadSaveCopy(kept.id)).toBe(true)
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
