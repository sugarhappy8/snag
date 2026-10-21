# Dialogs, keyboard, saves at boot and lazy views

What v4.1.0 added under the screen, and the rules that keep it working. Read it before you add a dialog, a list of
tappable rows, a chart, a header button, or anything that touches how the game is saved or loaded. The tests named in each
section are the permanent guards; when one fails, the section says what it is protecting.

## 1. Dialogs: the modal kit

Code: `src/ui/a11y/focus.ts` (pure decisions), `modal.ts` (the controller and the `useModal` hook), `ModalSurface.tsx`.

A dialog that renders through `ModalSurface` gets four things for free. Tab stays inside it. Everything behind it is
inert, so neither Tab nor a screen reader reaches the page. Focus moves into it when it opens. Focus goes back to the
element that opened it when it closes. `Sheet`, `PopupFrame`, the Settings confirm dialog, the Ribbons detail and the
search palette already use it.

### Add a dialog

1. Render the card through `ModalSurface`: `<ModalSurface role="dialog" label="Search" className="palette">`. Use
   `role="alertdialog"` when it asks the player to confirm something. Give it a `label`. It renders the element that has
   `role`, `aria-modal="true"` and `tabindex="-1"`, and it stops clicks, so a tap inside the card never reaches the backdrop.
2. Put the backdrop outside the surface and keep its own `onClick` for closing, as `Sheet` does.
3. Mount it only while it is open. The kit opens on mount and closes on unmount.
4. Handle Escape yourself (`useEscape` in `Dialogs.tsx`, `useSheetEscape` in `MenuList.tsx`). The kit has no Escape.
5. An `autoFocus` child is left alone. With none, the surface takes focus. The opener is read during the first render,
   because React moves `autoFocus` focus during commit, before any effect runs.
6. Don't use a portal. `renderToStaticMarkup`, which every UI test uses, doesn't support them.

### Attributes and the shortcut guard

| Name | Where | What it does |
|---|---|---|
| `data-modal-exempt` | on a sibling of the dialog or one of its ancestors | Stays live while a dialog is open. Put it on anything that must still be announced: the save banner in `App.tsx` and the toast wrap in `Dialogs.tsx` have it. |
| `data-focus-home` | the "+ Age" button in `BottomBar.tsx` | Where focus lands when the opener is gone and no other dialog is open. Keep it on one element. |
| `isModalOpen()` | `src/ui/a11y/modal.ts` | True while any dialog is open. A keyboard shortcut returns early when it is true. `GameScreen.tsx` and `nav/shortcuts.ts` use it. |

Dialogs stack (a popup over a sheet). Each element made inert keeps a reference count, so closing the top dialog keeps
what the lower one still needs, and the last one to close releases everything. Only the top dialog handles keys.
Closing lifts inert first, because an inert element can't take focus, then restores focus. Focus that already moved to
another dialog is left alone.

Tests: `test/a11y-focus.test.ts` (Tab wrap, tabbable rules, which siblings go inert, the restore order),
`test/a11y-modal.test.ts` (the controller over a fake page of plain objects), `test/a11y-dialogs.test.ts` (the real
components render `aria-modal` and `tabindex`, and the attributes above are in the source).

## 2. Roving tabindex

Code: `src/ui/a11y/roving.ts`. Two pure functions.

- `rovingMove(count, index, key)` is the index to focus after a key, or `null` when it isn't a roving key. ArrowDown and
  ArrowUp wrap. Home and End jump. PageDown and PageUp move 8 and stop at the ends.
- `rovingStop(ids, activeId)` is the id that holds `tabindex="0"`: the active one when it is in the list, else the first.

Use it for a list of rows where tabbing through every row is a chore. A list becomes one Tab stop; the arrows move inside
it and Tab leaves it. `MenuRows` in `MenuList.tsx` does this for action and group rows: every row gets `data-roving` with
the same value, the stop gets `tabindex="0"` and the others `-1`. Heading and info rows get no `tabindex`. Disabled rows
stay in the order, because they are tappable and show their reason. The Annual Report tab row uses the same two
functions with Left and Right mapped to Down and Up (`bookModel.ts`, `ReportBook.tsx`).

Don't use it for a short row of buttons, or for a form. Native Tab order is right there. A `MenuRow` rendered without the
roving props keeps native Tab order, so other callers are unchanged.

Test: `test/a11y-roving.test.ts`.

## 3. Targets, focus ring and contrast

Tokens in `src/ui/styles/global.css`:

| Token | Value (light) | Use |
|---|---|---|
| `--target` | `44px` | Width and height of icon buttons and the header row. `.hdr-icon`, `.sheet-nav`, `.al-back` and the spacers that stand in for them use it. |
| `--focus-ring` | `#1556ab` (dark `#8fc0ff`) | The solid `:focus-visible` outline: 3px, offset 2px. On the blue headers the outline is white. |
| `--header-from`, `--header-to` | `#1a60c1`, `#154f9e` | The two ends of the header gradient (`.hdr`, `.sheet-header`, `.al-topbar`). |
| `--header-text`, `--header-soft`, `--header-money`, `--header-money-neg` | white, `#e6effc`, `#b9ffcf`, `#ffe1de` | Every text colour drawn on that gradient. Fainter text uses `--header-soft`, never `opacity`. |

A new header button takes the class `hdr-icon` and is 44px with no extra CSS. A new text colour on the gradient is a new
`--header-*` token and goes in the list below.

What the contrast tests check (`test/ui-contrast.test.ts`, which reads `global.css` as text through `test/contrast-kit.ts`).
The dark map is the light `:root` block overlaid with the `prefers-color-scheme: dark` block. There is no `[data-theme]`.

| Pairs | Surfaces | Needs |
|---|---|---|
| `text`, `muted` | `bg`, `card`, `card-2`, `chip-bg`, `page-bg` | 4.5:1 |
| `tone-good`, `tone-bad`, `tone-event`, `age-heading` | `bg`, `card`, `card-2`, `chip-bg` | 4.5:1 |
| `hint-text` | `hint-bg` | 4.5:1 |
| the four `header-*` text tokens | `header-from` and `header-to` | 4.5:1, both themes |
| `focus-ring` | `bg`, `card`, `card-2`, `chip-bg`, `page-bg` | 3:1, both themes |

Chart colours are in `test/chart-contrast.test.ts` (3:1 for marks). It imports `readThemeTokens` and `contrastRatio` from
the same kit. A new text token or gradient pair goes in one of these two tests, or in a test of its own that imports the kit.
`test/a11y-targets.test.ts` proves the rules use the tokens: 44px sizes, no `opacity` on header text, both `theme-color`
metas in `index.html`.

## 4. Saving at boot

Code: `src/game/save-hydrate.ts` (the boot step), `src/boot.ts`, `src/main.tsx`, `src/game/save-store.ts`,
`src/ui/components/SaveNotices.tsx`. Before the first render, `main.tsx` awaits `hydrateSaves({ idb: FLAGS.idbSaves })`,
then renders. The page shows "Loading your life" from `index.html` meanwhile. `hydrateSaves` never rejects; if it somehow
does, `bootApp` renders anyway and the page plays from whatever localStorage holds.

### What boot decides

1. **Backend.** With the flag on it opens IndexedDB (`anotherlife-save`) and reads the main record, all inside one budget of
   3,000 ms. If the open fails, is refused or hangs, or the first read hangs, the page uses localStorage, `fellBack` is
   true, and a late answer from the database is ignored: it never switches the backend back and never writes.
2. **Candidates.** The IndexedDB record, and the localStorage record next to it (the one v4.0.2 wrote, called legacy
   here; it has the same key name). With localStorage as the backend there is one candidate.
3. **A winner**, by this table. Read it top to bottom: the first row that fits applies. Every readable or damaged record
   that doesn't win is kept as a copy (step 4). A later version's save is never a loser; it stays where it is.

| IndexedDB holds | localStorage holds | Result |
|---|---|---|
| anything | a later version's save | This page plays from localStorage and leaves IndexedDB alone: whatever it holds, even a damaged record, is not copied or cleared. The localStorage record is protected as in the later-version row below. |
| nothing | nothing | New game. Plays from IndexedDB. |
| nothing | a readable save | Copied into IndexedDB, read back and compared. Only then is the localStorage record removed. If the copy fails, differs or takes over 3,000 ms, the page plays from localStorage and the record is untouched. |
| a readable save | nothing | Plays from IndexedDB. |
| a readable save | a readable save, same `lifeId` | The later `(year, age)` wins. A tie goes to IndexedDB. A winning localStorage record is imported over the IndexedDB one, which was copied first. |
| a readable save | a readable save, other `lifeId` | IndexedDB wins. |
| damaged or too old | anything else | The bad record is copied and cleared. The other plays if it can. |
| a later version's save | anything else | Stays where it is and is protected: the first save copies it before writing, and writing fails closed if the copy can't be made. A readable localStorage record becomes a copy. |

4. **Copies.** A losing record is copied byte for byte before anything can overwrite it, and cleared only after the copy is
   confirmed. Up to 5 copies are kept: 3 localStorage slots, and 2 more in IndexedDB that exist only while IndexedDB is
   open. A page on localStorage keeps at most 3. With the cap reached, the loser stays where it is. For a losing legacy
   record that has a consequence: if the player then abandons the IndexedDB life, the next boot finds that lone
   localStorage record and imports it. It needs five kept copies, both stores present and an abandon, and it is accepted.
   Home lists every copy with Download copy and Delete copy (`SaveNotices.tsx`); a save from a newer version offers Reload
   and Download copy, with no Delete. A record left in the main slot can be downloaded but not deleted from there.

Tests: `test/save-hydrate.test.ts` (the table, the fallbacks, the import checks, the v4.0.2 shape and the schema 1 fixture),
`test/save-boot.test.ts`, `test/save-notice.test.ts`. The fake database in `test/save-kit.ts` can fail to open, hang on
open or read, fail a write, corrupt a read-back, or answer late.

### The flag

`FLAGS.idbSaves` is `true` from v4.1.0. With it off, `hydrateSaves({ idb: false })` still diagnoses and keeps copies, but all
saving stays on localStorage and writes stay synchronous, as in v4.0.2. To see that path, open the game with
`?flags=-idbSaves` (see Rollback for the hazard). Tests set it with `withFlags({ idbSaves: true }, ...)` or `false`.

The parameter is read from the URL only; nothing remembers it. On a device whose save has moved, a visit with
`?flags=-idbSaves` or `?flags=none` finds Home empty and offers a new game while the life sits in IndexedDB. A visit
without the parameter brings the life back.

### After boot

With IndexedDB a write finishes after `saveRecord` returns, so the store mirrors `getSaveStatus().persistFailed` into
`saveError`, and "Progress isn't saved" shows when a write fails later. A Time Machine jump waits for `flushSave()` before
it counts as saved (`saveForTravel` in `ui/store.ts`). The queue is asked to run dry when the page hides.

### Rollback

After an import the localStorage key is gone. A v4.0.x build opened on the same address sees no save until the new build
returns. If a life was started there, the next boot keeps IndexedDB and files the other life as an older copy.

Don't switch the flag off again once players have imported. Off means "read localStorage only", which is empty by then,
so their lives stay in IndexedDB and Home offers a new game. Treat the flag as one way after release, and after a trial
on a device with a real save.

### How R2's chunk store plugs in

R2 splits a save into a core chunk and a world chunk and reads old single-record saves for one release. `main.tsx` keeps
awaiting `hydrateSaves` and the `HydrateOutcome` shape stays. Stored text is read and written in three places, and the
chunk code has to cover all of them:

- **Read at boot.** `chooseBackend` reads the main record, and `diagnoseRecord` is the boot-time place that turns stored
  text into a game (`decodeSnapshotRecord`, `JSON.parse`, `migrateSave`). Joining the chunks goes in front of `migrateSave`.
- **Read after boot.** `loadGame` in `save.ts` parses and migrates again, from `readRecord` in `save-store.ts`. With
  IndexedDB that is the in-memory cache: boot primes it with `primeCache` and each save replaces it. With localStorage (the
  flag off, or boot fell back) it is the live record, as the backend stored it. The same joining applies there.
- **Write.** `importLegacy` writes the one-time import. Every later save goes through `writeQueued` in `save-store.ts`
  (`encodeSnapshotRecord`, then `backend.write`), and a synchronous backend writes inside `saveRecord` itself. A chunk
  writer that only reached the import would chunk one save and leave all the others whole.

The decision table stays: a record that can't be joined is `damaged` and is copied like any other.

## 5. Lazy views

Code: `src/ui/lazy/lazyView.tsx`. The chart kit and the search palette load on demand, so they stay out of the first
download. It is not `React.lazy`: `renderToStaticMarkup` can't wait for a lazy component, so a test would only see the
fallback. `lazyView` keeps the loaded module in a cache and renders it at once when it is there.

### The gate-file rule

A chunk exists only if nothing reaches it statically. So each lazy zone has one gate file, and only the gate may import the
zone.

| Zone | Files | Gate |
|---|---|---|
| charts | everything in `src/ui/charts/` | `src/ui/charts/lazy.tsx` |
| palette | `Palette.tsx`, `paletteModel.ts`, `searchIndex.ts`, `searchRank.ts`, `useSearchIndex.ts` in `src/ui/nav/` | `src/ui/nav/lazy.tsx` |

Nothing outside a zone imports a zone file at run time except through its gate, and the gate imports the zone only with
`import()`. `import type` is free. A screen that needs a chart imports `LazyChartView`, `LazyKpiTile` or `LazySparkline`
from the gate, never from `src/ui/charts/*.tsx`. `test/lazy-zones.test.ts` (fast tier) enforces it from the first commit and
also checks that nothing a gate loads is in the static closure of `src/main.tsx`.

### Add a lazy view

1. In the zone's gate: `export const LazyThing: LazyView<ThingProps> = lazyView('thing', () => import('./Thing').then((m) => ({ default: m.Thing })))`.
   The loader must resolve `{ default: Component }`.
2. Use it where the text rows were, and pass those rows as `fallback`. They show while it loads and if the load fails.
   Pass `fallback={null}` for a decorative view in a row or tile: nothing shows until it's ready.
3. Test it by awaiting `LazyThing.preload()` and then rendering. A test that creates its own views with `lazyView` calls
   `resetLazyViewsForTests()` in `beforeEach`. The call empties the registry, so a gate view, which registers when the gate
   is imported, is forgotten by the first call only. A test that needs a gate view cold creates its own instead.
4. A new zone gets a `Zone` entry in `test/lazy-zones.test.ts` (its files, its gate, what the gate must load).

When a load fails, which a tab left open across a deploy gets (the old hashed file is gone and the server answers with
`index.html`), the fallback stays and "This view didn't load." appears under it with Try again. From the second failure it
offers Reload, which flushes the save first. Nothing reloads on its own. `App.tsx` calls `prefetchLazyViews()` once at
startup: it loads every registered view when the browser is idle, and skips Save-Data and 2g connections.

### The budget script

`npx vite build`, then `npm run size` (`node scripts/bundle-budget.mjs`). It takes the JS and CSS that `dist/index.html`
loads before any dynamic import (the module script, stylesheets and modulepreload links), sums their gzip size at level 9,
and compares it with `scripts/bundle-baseline.json`. It prints the delta, then every other JS file in `dist/assets` as a
lazy chunk, so you can see what moved out of the entry. It exits 1 when the initial bundle grew more than `allowGrowthBytes`,
which is 60,000 bytes. CI runs it in the `checks` job right after the build. A change to the limit goes through the lead.

The baseline is the v4.0.3 build, not the branch with R1 code in it. To capture or refresh it, build that release, run
`node scripts/bundle-budget.mjs --update` there and commit the file. A baseline of 0 means "not captured yet" and fails the
check on purpose. The committed baseline is 0 until the lead captures it, so the check, and the `checks` job that runs it,
fails until then. Test: `test/bundle-budget.test.ts`, which needs no build.
