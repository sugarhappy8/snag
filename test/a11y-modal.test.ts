// R1-A4: the modal controller (G.12). openModal runs against a fake ModalEnv over plain objects that records every
// focus and setInert call, so the order of "lift inert, then restore focus" is asserted, and refuses to focus
// an inert element the way a browser does. domModalEnv is checked once against a hand-made document. There is no DOM
// in these tests.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TABBABLE_SELECTOR } from '../src/ui/a11y/focus'
import { domModalEnv, isModalOpen, openModal, type ModalEnv, type ModalHandle } from '../src/ui/a11y/modal'
import { ModalSurface } from '../src/ui/a11y/ModalSurface'

interface El {
  readonly name: string
  parent: El | null
  readonly kids: El[]
  tab: boolean
  exempt: boolean
  inert: boolean
  connected: boolean
  disabled: boolean
}

function el(name: string, over: Partial<Pick<El, 'tab' | 'exempt' | 'disabled'>> = {}): El {
  return { name, parent: null, kids: [], tab: false, exempt: false, inert: false, connected: true, disabled: false, ...over }
}
function add<T extends El>(parent: El, child: T): T {
  child.parent = parent
  parent.kids.push(child)
  return child
}
const descendants = (e: El): El[] => e.kids.flatMap((k) => [k, ...descendants(k)])
const inside = (outer: El, inner: El): boolean => {
  for (let n: El | null = inner; n; n = n.parent) if (n === outer) return true
  return false
}
const isInert = (e: El): boolean => {
  for (let n: El | null = e; n; n = n.parent) if (n.inert) return true
  return false
}

/**
 * root > [banner (exempt), game > [content > opener, bar > home]]. Sheets and popups are added to `game` the way
 * GameScreen mounts them, so a later one is not a sibling of an earlier one's targets when the earlier one opened.
 */
function makeWorld() {
  const log: string[] = []
  const body = el('body')
  const root = add(body, el('root'))
  add(root, el('banner', { exempt: true }))
  const game = add(root, el('game'))
  const content = add(game, el('content'))
  const opener = add(content, el('opener', { tab: true }))
  const bar = add(game, el('bar'))
  let homeEl: El | null = add(bar, el('home', { tab: true }))
  let active: El | null = body

  const env: ModalEnv<El> = {
    root,
    tree: { parentOf: (n) => n.parent, childrenOf: (n) => n.kids, exempt: (n) => n.exempt },
    active: () => active,
    contains: inside,
    tabbables: (c) => descendants(c).filter((e) => e.tab && e.connected && !e.disabled && !isInert(e)),
    focus: (e) => {
      log.push(`focus:${e.name}`)
      if (e.connected && !isInert(e)) active = e
    },
    setInert: (e, on) => {
      log.push(`inert:${e.name}:${on}`)
      e.inert = on
    },
    usable: (e) => e.connected && !e.disabled && !isInert(e) && e !== body,
    isBody: (e) => e === body,
    home: () => homeEl,
  }

  function dialog(prefix: string, labels: string[]) {
    const backdrop = add(game, el(`${prefix}Backdrop`))
    const box = add(backdrop, el(prefix))
    const kids = labels.map((l) => add(box, el(l, { tab: true })))
    return { backdrop, box, kids }
  }
  const world = {
    log,
    body,
    game,
    content,
    opener,
    bar,
    env,
    active: () => active,
    setActive: (e: El | null) => {
      active = e
    },
    dropHome: () => {
      homeEl = null
    },
    home: () => homeEl,
    addSheet: () => dialog('sheet', ['s1', 's2', 's3']),
    addPopup: () => dialog('popup', ['ok', 'cancel']),
    /** Any dialog by name: Relationships mounts the list sheet and the person sheet, and a popup from runner.overlay, in one commit. */
    addDialog: dialog,
    /** Take a subtree out of the page, as React does before an unmount cleanup runs. Focus in it falls to the body. */
    detach: (e: El) => {
      if (e.parent) e.parent.kids.splice(e.parent.kids.indexOf(e), 1)
      const mark = (n: El): void => {
        n.connected = false
        n.kids.forEach(mark)
      }
      mark(e)
      if (active && !active.connected) active = body
    },
    inertNames: () =>
      descendants(body)
        .filter((e) => e.inert)
        .map((e) => e.name)
        .sort(),
    count: (entry: string) => log.filter((l) => l === entry).length,
  }
  return world
}
type World = ReturnType<typeof makeWorld>

const handles: ModalHandle[] = []
function open(w: World, container: El, opener: El | null): ModalHandle {
  const h = openModal(w.env, container, opener)
  handles.push(h)
  return h
}
afterEach(() => {
  for (const h of handles.splice(0)) h.close()
  vi.unstubAllGlobals()
})

function press(h: ModalHandle, key: string, shiftKey = false): boolean {
  let prevented = false
  h.handleKey({
    key,
    shiftKey,
    preventDefault: () => {
      prevented = true
    },
  })
  return prevented
}

describe('openModal: opening', () => {
  it('isolates the siblings along the path and focuses the container', () => {
    const w = makeWorld()
    const s = w.addSheet()
    expect(isModalOpen()).toBe(false)
    open(w, s.box, null)
    expect(isModalOpen()).toBe(true)
    expect(w.log).toEqual(['inert:content:true', 'inert:bar:true', 'focus:sheet'])
    expect(w.active()).toBe(s.box)
    // The dialog, its backdrop and its ancestors stay live, and so does the exempt banner.
    expect(w.inertNames()).toEqual(['bar', 'content'])
    expect(w.opener.inert).toBe(false) // only its parent is inert; the attribute sits on the subtree root
  })

  it('leaves a child that already has focus alone, as React autoFocus leaves it', () => {
    const w = makeWorld()
    const s = w.addSheet()
    w.setActive(s.kids[1] as El)
    open(w, s.box, null)
    expect(w.log).toEqual(['inert:content:true', 'inert:bar:true'])
    expect(w.active()).toBe(s.kids[1])
  })

  it('pulls focus in when it is on the body, on nothing, or on an element outside', () => {
    for (const start of ['body', 'null', 'outside'] as const) {
      const w = makeWorld()
      const s = w.addSheet()
      w.setActive(start === 'body' ? w.body : start === 'null' ? null : w.opener)
      open(w, s.box, null)
      expect(w.log).toContain('focus:sheet')
      expect(w.active()).toBe(s.box)
      for (const h of handles.splice(0)) h.close()
    }
  })

  it('reports a modal open until the last one closes', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const hA = open(w, a.box, null)
    const b = w.addPopup()
    const hB = open(w, b.box, null)
    expect(isModalOpen()).toBe(true)
    hB.close()
    expect(isModalOpen()).toBe(true)
    hA.close()
    expect(isModalOpen()).toBe(false)
  })
})

describe('openModal: the Tab trap', () => {
  it('wraps Tab on the last node to the first and Shift+Tab on the first to the last', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const [s1, s2, s3] = s.kids as [El, El, El]
    const h = open(w, s.box, null)
    w.setActive(s3)
    expect(press(h, 'Tab')).toBe(true)
    expect(w.active()).toBe(s1)
    expect(press(h, 'Tab', true)).toBe(true)
    expect(w.active()).toBe(s3)
    // The middle of the list is the browser's to move.
    w.setActive(s2)
    const before = w.log.length
    expect(press(h, 'Tab')).toBe(false)
    expect(press(h, 'Tab', true)).toBe(false)
    expect(w.log.length).toBe(before)
    expect(w.active()).toBe(s2)
  })

  it('takes focus from the container itself to either end', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const [s1, , s3] = s.kids as [El, El, El]
    const h = open(w, s.box, null)
    expect(w.active()).toBe(s.box)
    expect(press(h, 'Tab')).toBe(true)
    expect(w.active()).toBe(s1)
    w.setActive(s.box)
    expect(press(h, 'Tab', true)).toBe(true)
    expect(w.active()).toBe(s3)
  })

  it('holds focus on the container when nothing inside can take it', () => {
    const w = makeWorld()
    const s = w.addSheet()
    for (const k of s.kids) k.disabled = true
    const h = open(w, s.box, null)
    w.setActive(s.box)
    w.log.length = 0
    expect(press(h, 'Tab')).toBe(true)
    expect(press(h, 'Tab', true)).toBe(true)
    expect(w.log).toEqual(['focus:sheet', 'focus:sheet'])
  })

  it('ignores every key but Tab', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, null)
    w.setActive(s.kids[2] as El)
    w.log.length = 0
    for (const key of ['Enter', 'Escape', 'ArrowDown', ' ']) expect(press(h, key)).toBe(false)
    expect(w.log).toEqual([])
  })

  it("ignores the keydown of a lower modal while another is on top", () => {
    const w = makeWorld()
    const a = w.addSheet()
    const hA = open(w, a.box, null)
    const b = w.addPopup()
    const hB = open(w, b.box, null)
    const [ok, cancel] = b.kids as [El, El]
    // Focus is in the popup. The sheet's handler must not drag it into the sheet.
    w.setActive(cancel)
    w.log.length = 0
    expect(press(hA, 'Tab')).toBe(false)
    expect(press(hA, 'Tab', true)).toBe(false)
    expect(w.log).toEqual([])
    expect(w.active()).toBe(cancel)
    expect(press(hB, 'Tab')).toBe(true)
    expect(w.active()).toBe(ok)
    // Once the popup closes, the sheet's handler is live again.
    hB.close()
    w.setActive(a.kids[2] as El)
    expect(press(hA, 'Tab')).toBe(true)
    expect(w.active()).toBe(a.kids[0])
  })

  it('does nothing after close', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, null)
    w.setActive(s.kids[2] as El)
    h.close()
    w.log.length = 0
    expect(press(h, 'Tab')).toBe(false)
    h.refocus()
    expect(w.log).toEqual([])
  })
})

describe('openModal: stacked modals', () => {
  it('keeps the shared targets inert when the top modal closes, and frees the lower modal', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const hA = open(w, a.box, null)
    expect(w.inertNames()).toEqual(['bar', 'content'])
    const b = w.addPopup()
    const hB = open(w, b.box, null)
    // The popup isolates the sheet's backdrop too; the shared targets are inerted once, not twice.
    expect(w.inertNames()).toEqual(['bar', 'content', 'sheetBackdrop'])
    expect(w.count('inert:content:true')).toBe(1)
    expect(w.count('inert:bar:true')).toBe(1)

    hB.close()
    expect(w.inertNames()).toEqual(['bar', 'content'])
    expect(w.count('inert:sheetBackdrop:false')).toBe(1)
    expect(w.count('inert:content:false')).toBe(0)
    expect(w.count('inert:bar:false')).toBe(0)

    hA.close()
    expect(w.inertNames()).toEqual([])
    expect(w.count('inert:content:false')).toBe(1)
    expect(w.count('inert:bar:false')).toBe(1)
    expect(w.count('inert:content:true')).toBe(1)
  })

  it('releases everything exactly once when the lower modal closes first', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const hA = open(w, a.box, null)
    const b = w.addPopup()
    const hB = open(w, b.box, null)
    hA.close()
    // The popup still needs the page and the sheet's backdrop inert.
    expect(w.inertNames()).toEqual(['bar', 'content', 'sheetBackdrop'])
    expect(isModalOpen()).toBe(true)
    hB.close()
    expect(w.inertNames()).toEqual([])
    expect(w.count('inert:content:false')).toBe(1)
    expect(w.count('inert:bar:false')).toBe(1)
    expect(w.count('inert:sheetBackdrop:false')).toBe(1)
    expect(isModalOpen()).toBe(false)
  })

  it('counts a second close of the same handle as nothing', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const hA = open(w, a.box, null)
    const b = w.addPopup()
    const hB = open(w, b.box, null)
    hB.close()
    hB.close()
    expect(w.inertNames()).toEqual(['bar', 'content'])
    hA.close()
    hA.close()
    expect(w.inertNames()).toEqual([])
    expect(isModalOpen()).toBe(false)
  })

  // Relationships reopened on a person (the "Back to" chip) mounts the list sheet and the person sheet in one commit, so the
  // second dialog is already in the page when the first one opens and lands among the first one's targets.
  it('keeps a dialog live that was already in the page when the one below it opened', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const b = w.addPopup()
    const hA = open(w, a.box, null)
    expect(w.inertNames()).toEqual(['bar', 'content', 'popupBackdrop'])
    const hB = open(w, b.box, null)
    // The top dialog is the one the player can use; the one below it is isolated, along with the page.
    expect(isInert(b.box)).toBe(false)
    expect(isInert(b.kids[0]!)).toBe(false)
    expect(w.active()).toBe(b.box)
    expect(w.inertNames()).toEqual(['bar', 'content', 'sheetBackdrop'])

    hB.close()
    expect(w.inertNames()).toEqual(['bar', 'content'])
    expect(isInert(a.box)).toBe(false)
    hA.close()
    expect(w.inertNames()).toEqual([])
    expect(isModalOpen()).toBe(false)
  })

  // R4-U4: the person sheet is the one place three dialogs share a commit. Relationships mounts its list sheet and the person's
  // sheet together, and an action on the person (a PersonSheet runner.overlay) puts a popup in the same tree. The profile inside the
  // person sheet is a lazy chunk and opens nothing of its own (test/person-facts-ui.test.ts), but vitest cannot see the freeze that
  // v5.2.0 fixed, so the stacking is pinned here with all three in the page before the first one opens.
  describe('a list sheet, a person sheet and a popup that all mount in one commit', () => {
    function three(w: World) {
      const list = w.addDialog('list', ['l1', 'l2'])
      const person = w.addDialog('person', ['p1', 'p2', 'p3'])
      const popup = w.addDialog('popup', ['ok', 'cancel'])
      const hList = open(w, list.box, null)
      const hPerson = open(w, person.box, null)
      const hPopup = open(w, popup.box, null)
      return { list, person, popup, hList, hPerson, hPopup }
    }

    it('keeps the top one live and isolates the two below it with the page', () => {
      const w = makeWorld()
      const d = three(w)
      for (const live of [d.popup.box, ...d.popup.kids]) expect(isInert(live)).toBe(false)
      expect(w.active()).toBe(d.popup.box)
      expect(w.inertNames()).toEqual(['bar', 'content', 'listBackdrop', 'personBackdrop'])
      expect(isInert(d.person.box)).toBe(true)
      expect(isInert(d.list.box)).toBe(true)
      // The popup's own backdrop was isolated by the list sheet, and the person sheet gave it back before the popup opened.
      expect(w.count('inert:popupBackdrop:true')).toBe(1)
      expect(w.count('inert:popupBackdrop:false')).toBe(1)
    })

    it('hands the page back one dialog at a time, top first', () => {
      const w = makeWorld()
      const d = three(w)
      d.hPopup.close()
      expect(w.inertNames()).toEqual(['bar', 'content', 'listBackdrop'])
      expect(isInert(d.person.box)).toBe(false)
      expect(isInert(d.person.kids[0]!)).toBe(false)
      d.hPerson.close()
      expect(w.inertNames()).toEqual(['bar', 'content'])
      expect(isInert(d.list.box)).toBe(false)
      d.hList.close()
      expect(w.inertNames()).toEqual([])
      expect(isModalOpen()).toBe(false)
      expect(w.count('inert:content:true')).toBe(1)
      expect(w.count('inert:content:false')).toBe(1)
      expect(w.count('inert:bar:true')).toBe(1)
      expect(w.count('inert:bar:false')).toBe(1)
    })

    it('frees the page exactly once when the dialogs close from the bottom up', () => {
      const w = makeWorld()
      const d = three(w)
      d.hList.close()
      expect(w.inertNames()).toEqual(['bar', 'content', 'listBackdrop', 'personBackdrop'])
      expect(isInert(d.popup.box)).toBe(false)
      d.hPerson.close()
      expect(isInert(d.popup.box)).toBe(false)
      expect(w.inertNames()).toEqual(['bar', 'content', 'listBackdrop', 'personBackdrop'])
      d.hPopup.close()
      expect(w.inertNames()).toEqual([])
      expect(isModalOpen()).toBe(false)
      expect(w.count('inert:content:true')).toBe(1)
      expect(w.count('inert:content:false')).toBe(1)
      expect(w.count('inert:bar:true')).toBe(1)
      expect(w.count('inert:bar:false')).toBe(1)
    })

    it('lets focus return to the person sheet when the popup closes', () => {
      const w = makeWorld()
      const d = three(w)
      d.hPopup.close()
      expect(w.active()).toBe(d.person.box)
      expect(isInert(w.active() as El)).toBe(false)
    })
  })

  it('frees the page exactly once when the lower of two same-commit dialogs closes first', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const b = w.addPopup()
    const hA = open(w, a.box, null)
    const hB = open(w, b.box, null)
    hA.close()
    expect(w.inertNames()).toEqual(['bar', 'content', 'sheetBackdrop'])
    expect(isInert(b.box)).toBe(false)
    hB.close()
    expect(w.inertNames()).toEqual([])
    expect(w.count('inert:content:false')).toBe(1)
    expect(w.count('inert:bar:false')).toBe(1)
    expect(isModalOpen()).toBe(false)
  })

  it('keeps counts per element, so a later modal after a full release isolates again', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const hA = open(w, a.box, null)
    hA.close()
    expect(w.inertNames()).toEqual([])
    const hA2 = open(w, a.box, null)
    expect(w.inertNames()).toEqual(['bar', 'content'])
    expect(w.count('inert:content:true')).toBe(2)
    hA2.close()
    expect(w.inertNames()).toEqual([])
  })
})

describe('openModal: close restores focus', () => {
  it('lifts inert first and then returns focus to the opener', () => {
    const w = makeWorld()
    const s = w.addSheet()
    w.setActive(w.opener)
    const h = open(w, s.box, w.opener)
    w.setActive(s.kids[0] as El)
    w.log.length = 0
    h.close()
    expect(w.log).toEqual(['inert:content:false', 'inert:bar:false', 'focus:opener'])
    // The fake refuses to focus inside an inert subtree, so landing on the opener proves the order.
    expect(w.active()).toBe(w.opener)
  })

  it('restores when the focused element went away with the modal and focus fell to the body', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, w.opener)
    w.setActive(s.kids[1] as El)
    w.detach(s.backdrop)
    expect(w.active()).toBe(w.body)
    h.close()
    expect(w.active()).toBe(w.opener)
  })

  it("goes to the next modal's container when the opener is gone", () => {
    const w = makeWorld()
    const a = w.addSheet()
    open(w, a.box, null)
    const b = w.addPopup()
    const gone = add(a.box, el('gone', { tab: true }))
    const hB = open(w, b.box, gone)
    w.setActive(b.kids[0] as El)
    w.detach(gone)
    w.detach(b.backdrop)
    w.log.length = 0
    hB.close()
    // The sheet's backdrop was inert under the popup; it is released before the sheet takes focus.
    expect(w.log).toEqual(['inert:sheetBackdrop:false', 'focus:sheet'])
    expect(w.active()).toBe(a.box)
  })

  it('goes to the focus home when the opener and every modal are gone', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, w.opener)
    w.setActive(s.kids[0] as El)
    w.detach(w.opener)
    w.log.length = 0
    h.close()
    expect(w.log).toEqual(['inert:content:false', 'inert:bar:false', 'focus:home'])
    expect(w.active()).toBe(w.home())
  })

  it('also falls back to the home when there was no opener at all', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, null)
    h.close()
    expect(w.active()).toBe(w.home())
  })

  it('skips an opener that cannot take focus', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, w.opener)
    w.opener.disabled = true
    h.close()
    expect(w.log).not.toContain('focus:opener')
    expect(w.active()).toBe(w.home())
  })

  it('focuses nothing when no candidate is usable', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, w.opener)
    w.setActive(s.kids[0] as El)
    w.detach(w.opener)
    w.dropHome()
    w.log.length = 0
    h.close()
    expect(w.log).toEqual(['inert:content:false', 'inert:bar:false'])
  })

  it('does not move focus that is already somewhere else', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, w.opener)
    // Focus went to an element outside the modal, and it is not the body.
    w.setActive(w.bar)
    w.log.length = 0
    h.close()
    expect(w.log.some((l) => l.startsWith('focus:'))).toBe(false)
    expect(w.active()).toBe(w.bar)
  })

  it('does not take focus from the modal on top when a lower modal closes', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const hA = open(w, a.box, w.opener)
    const b = w.addPopup()
    open(w, b.box, null)
    w.setActive(b.kids[1] as El)
    w.log.length = 0
    hA.close()
    expect(w.log.some((l) => l.startsWith('focus:'))).toBe(false)
    expect(w.active()).toBe(b.kids[1])
  })

  it('prefers the opener inside the lower modal to the lower modal itself', () => {
    const w = makeWorld()
    const a = w.addSheet()
    open(w, a.box, null)
    const b = w.addPopup()
    const trigger = a.kids[1] as El
    const hB = open(w, b.box, trigger)
    w.setActive(b.kids[0] as El)
    hB.close()
    expect(w.active()).toBe(trigger)
  })
})

describe('openModal: refocus', () => {
  it('moves focus to the container when focus was lost and the modal is on top', () => {
    const w = makeWorld()
    const s = w.addSheet()
    const h = open(w, s.box, null)
    w.setActive(s.kids[0] as El)
    w.log.length = 0
    h.refocus()
    expect(w.log).toEqual([]) // focus is inside: leave it
    w.setActive(w.body)
    h.refocus()
    expect(w.active()).toBe(s.box)
    w.setActive(null)
    h.refocus()
    expect(w.active()).toBe(s.box)
    w.setActive(w.bar)
    h.refocus()
    expect(w.active()).toBe(s.box)
    expect(w.log).toEqual(['focus:sheet', 'focus:sheet', 'focus:sheet'])
  })

  it('does nothing for a modal that is not on top', () => {
    const w = makeWorld()
    const a = w.addSheet()
    const hA = open(w, a.box, null)
    const b = w.addPopup()
    const hB = open(w, b.box, null)
    w.setActive(w.body)
    w.log.length = 0
    hA.refocus()
    expect(w.log).toEqual([])
    hB.refocus()
    expect(w.log).toEqual(['focus:popup'])
    hB.close()
    w.setActive(w.body)
    w.log.length = 0
    hA.refocus()
    expect(w.log).toEqual(['focus:sheet'])
  })
})

describe('ModalSurface', () => {
  it('renders the dialog attributes and the class, and does not throw without a document', () => {
    expect(typeof document).toBe('undefined')
    const html = renderToStaticMarkup(
      createElement(ModalSurface, { role: 'dialog', label: 'Menu', className: 'sheet', children: createElement('p', null, 'Inside') }),
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Menu"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('class="sheet"')
    expect(html).toContain('<p>Inside</p>')
  })

  it('takes alertdialog, and leaves out aria-label and class when it has none', () => {
    const html = renderToStaticMarkup(createElement(ModalSurface, { role: 'alertdialog', children: 'Sure?' }))
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('tabindex="-1"')
    expect(html).not.toContain('aria-label')
    expect(html).not.toContain('class=')
    expect(html).toContain('Sure?')
  })

  it('has no environment to open without a document', () => {
    expect(domModalEnv()).toBeNull()
  })
})

// A hand-made document, just rich enough for domModalEnv. The point is the mapping from DOM properties to the
// ModalEnv answers, not the browser.
const NATIVE_TAB_STOP = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'])
class StubEl {
  readonly children: StubEl[] = []
  parentElement: StubEl | null = null
  readonly attrs = new Map<string, string>()
  hidden = false
  rects = 1
  isContentEditable = false
  isConnected = true
  disabled = false
  focusCalls = 0
  constructor(
    readonly tagName: string,
    readonly name = tagName,
  ) {}
  append(...kids: StubEl[]): this {
    for (const k of kids) {
      k.parentElement = this
      this.children.push(k)
    }
    return this
  }
  attr(n: string, v = ''): this {
    this.attrs.set(n, v)
    return this
  }
  hasAttribute(n: string): boolean {
    return this.attrs.has(n)
  }
  getAttribute(n: string): string | null {
    return this.attrs.get(n) ?? null
  }
  setAttribute(n: string, v: string): void {
    this.attrs.set(n, v)
  }
  removeAttribute(n: string): void {
    this.attrs.delete(n)
  }
  get tabIndex(): number {
    const v = this.attrs.get('tabindex')
    return v === undefined ? (NATIVE_TAB_STOP.has(this.tagName) ? 0 : -1) : Number(v)
  }
  get type(): string {
    return this.attrs.get('type') ?? 'text'
  }
  contains(other: StubEl): boolean {
    for (let n: StubEl | null = other; n; n = n.parentElement) if (n === this) return true
    return false
  }
  closest(sel: string): StubEl | null {
    expect(sel).toBe('[inert]')
    for (let n: StubEl | null = this; n; n = n.parentElement) if (n.attrs.has('inert')) return n
    return null
  }
  matches(sel: string): boolean {
    expect(sel).toBe(':disabled')
    return this.disabled
  }
  getClientRects(): { length: number } {
    return { length: this.rects }
  }
  querySelectorAll(sel: string): StubEl[] {
    expect(sel).toBe(TABBABLE_SELECTOR)
    const out: StubEl[] = []
    const walk = (e: StubEl): void => {
      for (const c of e.children) {
        out.push(c)
        walk(c)
      }
    }
    walk(this)
    return out
  }
  focus(): void {
    this.focusCalls++
    doc.activeElement = this
  }
}
interface StubDoc {
  body: StubEl
  activeElement: StubEl | null
  byId: Map<string, StubEl>
  home: StubEl | null
  getElementById(id: string): StubEl | null
  querySelector(sel: string): StubEl | null
}
const doc: StubDoc = {
  body: new StubEl('BODY'),
  activeElement: null,
  byId: new Map(),
  home: null,
  getElementById: (id: string) => doc.byId.get(id) ?? null,
  querySelector: (sel: string) => (sel === '[data-focus-home]' ? doc.home : null),
}
const dom = (e: StubEl): HTMLElement => e as unknown as HTMLElement
function installDocument(withRoot: boolean): { root: StubEl; env: ModalEnv<HTMLElement> } {
  doc.body = new StubEl('BODY')
  doc.activeElement = doc.body
  doc.byId = new Map()
  doc.home = null
  const root = new StubEl('DIV', 'root')
  doc.body.append(root)
  if (withRoot) doc.byId.set('root', root)
  vi.stubGlobal('document', doc)
  const env = domModalEnv()
  if (!env) throw new Error('domModalEnv returned null with a document')
  return { root, env }
}

describe('domModalEnv', () => {
  it('uses #root, or the body when there is no #root', () => {
    const withRoot = installDocument(true)
    expect(withRoot.env.root).toBe(dom(withRoot.root))
    const noRoot = installDocument(false)
    expect(noRoot.env.root).toBe(dom(doc.body))
  })

  it('walks the tree through parentElement and children, and exempts live regions and non-visual tags', () => {
    const { root, env } = installDocument(true)
    const toast = new StubEl('DIV', 'toast').attr('data-modal-exempt')
    const plain = new StubEl('DIV', 'plain')
    const tags = ['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].map((t) => new StubEl(t))
    root.append(toast, plain, ...tags)
    expect(env.tree.parentOf(dom(plain))).toBe(dom(root))
    expect(env.tree.parentOf(dom(doc.body))).toBeNull()
    expect(env.tree.childrenOf(dom(root)).map((k) => (k as unknown as StubEl).name)).toEqual([
      'toast',
      'plain',
      'SCRIPT',
      'STYLE',
      'LINK',
      'TEMPLATE',
    ])
    expect(env.tree.exempt(dom(toast))).toBe(true)
    for (const t of tags) expect(env.tree.exempt(dom(t))).toBe(true)
    expect(env.tree.exempt(dom(plain))).toBe(false)
  })

  it('filters the candidates with isTabbable, reading each property the way the browser reports it', () => {
    const { root, env } = installDocument(true)
    const box = new StubEl('DIV', 'box')
    const ok = new StubEl('BUTTON', 'ok')
    const disabled = new StubEl('BUTTON', 'disabled')
    disabled.disabled = true
    const hidden = new StubEl('BUTTON', 'hidden')
    hidden.rects = 0
    const flagged = new StubEl('BUTTON', 'flagged')
    flagged.hidden = true
    const skipped = new StubEl('BUTTON', 'skipped').attr('tabindex', '-1')
    const stop = new StubEl('DIV', 'stop').attr('tabindex', '0')
    const loose = new StubEl('DIV', 'loose')
    const link = new StubEl('A', 'link').attr('href', '/x')
    const bare = new StubEl('A', 'bare')
    const secret = new StubEl('INPUT', 'secret').attr('type', 'hidden')
    const field = new StubEl('INPUT', 'field')
    const editor = new StubEl('DIV', 'editor')
    editor.isContentEditable = true
    const wrap = new StubEl('DIV', 'wrap').attr('inert')
    const behindWrap = new StubEl('BUTTON', 'behindWrap')
    wrap.append(behindWrap)
    box.append(ok, disabled, hidden, flagged, skipped, stop, loose, link, bare, secret, field, editor, wrap)
    root.append(box)
    expect(env.tabbables(dom(box)).map((e) => (e as unknown as StubEl).name)).toEqual(['ok', 'stop', 'link', 'field', 'editor'])
  })

  it('reads the active element, containment, the body, and the focus home from the document', () => {
    const { root, env } = installDocument(true)
    const a = new StubEl('BUTTON', 'a')
    const home = new StubEl('BUTTON', 'home').attr('data-focus-home')
    root.append(a, home)
    doc.home = home
    expect(env.active()).toBe(dom(doc.body))
    expect(env.isBody(dom(doc.body))).toBe(true)
    expect(env.isBody(dom(a))).toBe(false)
    expect(env.contains(dom(root), dom(a))).toBe(true)
    expect(env.contains(dom(a), dom(root))).toBe(false)
    expect(env.home()).toBe(dom(home))
    env.focus(dom(a))
    expect(a.focusCalls).toBe(1)
    expect(env.active()).toBe(dom(a))
    doc.home = null
    expect(env.home()).toBeNull()
  })

  it('toggles the inert attribute', () => {
    const { root, env } = installDocument(true)
    const page = new StubEl('DIV', 'page')
    root.append(page)
    env.setInert(dom(page), true)
    expect(page.hasAttribute('inert')).toBe(true)
    env.setInert(dom(page), false)
    expect(page.hasAttribute('inert')).toBe(false)
  })

  it('calls an element usable when it is connected, enabled, not inert and not the body', () => {
    const { root, env } = installDocument(true)
    const good = new StubEl('BUTTON', 'good')
    const off = new StubEl('BUTTON', 'off')
    off.disabled = true
    const gone = new StubEl('BUTTON', 'gone')
    gone.isConnected = false
    const wrap = new StubEl('DIV', 'wrap').attr('inert')
    const under = new StubEl('BUTTON', 'under')
    wrap.append(under)
    root.append(good, off, gone, wrap)
    expect(env.usable(dom(good))).toBe(true)
    expect(env.usable(dom(off))).toBe(false)
    expect(env.usable(dom(gone))).toBe(false)
    expect(env.usable(dom(under))).toBe(false)
    expect(env.usable(dom(doc.body))).toBe(false)
  })

  it('runs a whole open and close through the DOM environment', () => {
    const { root, env } = installDocument(true)
    const page = new StubEl('DIV', 'page')
    const opener = new StubEl('BUTTON', 'opener')
    page.append(opener)
    const backdrop = new StubEl('DIV', 'backdrop')
    const box = new StubEl('DIV', 'box').attr('tabindex', '-1')
    const first = new StubEl('BUTTON', 'first')
    const last = new StubEl('BUTTON', 'last')
    box.append(first, last)
    backdrop.append(box)
    root.append(page, backdrop)
    opener.focus()
    const h = openModal(env, dom(box), dom(opener))
    handles.push(h)
    expect(page.hasAttribute('inert')).toBe(true)
    expect(backdrop.hasAttribute('inert')).toBe(false)
    expect(doc.activeElement).toBe(box)
    doc.activeElement = last
    let prevented = false
    h.handleKey({ key: 'Tab', shiftKey: false, preventDefault: () => (prevented = true) })
    expect(prevented).toBe(true)
    expect(doc.activeElement).toBe(first)
    h.close()
    expect(page.hasAttribute('inert')).toBe(false)
    expect(doc.activeElement).toBe(opener)
  })
})
