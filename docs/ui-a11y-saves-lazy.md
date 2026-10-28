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
   true, and a late answer from the database is ignored: it never switches the backend back and never writes. The
   localStorage key is read first and the database second, so a tab that boots while another tab imports finds the life
   in at least one of them. A browser that has kept a life in IndexedDB carries a marker (`anotherlife.idb.v1`, set when the
   database holds a loaded or imported save or has taken a write): it uses IndexedDB even with the flag off, and when the
   database can't be reached Home shows a "Your saved life is out of reach" notice (Reload only), and New Life asks
   before it starts a life kept apart from it. The whole boot has a budget of 8,000 ms; past it the page plays from
   localStorage, and every step that was still waiting changes nothing when it finishes.
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
| a readable save | the same game | IndexedDB plays. The localStorage record is dropped without a copy: the database caught up with a backup. |
| a readable save | a readable save, and the marker is set | The localStorage record wins and is imported over the IndexedDB one, which was copied first. With the marker, a localStorage record is a backup written because the database could not be reached or the page was closing, so it is the newer one, whatever its year and age (a Time Machine jump goes back a year). |
| a readable save | a readable save, same `lifeId`, no marker | The later `(year, age)` wins. A tie goes to IndexedDB. A winning localStorage record is imported over the IndexedDB one, which was copied first. |
| a readable save | a readable save, other `lifeId`, no marker | IndexedDB wins. |
| damaged or too old | anything else | The bad record is copied and cleared. The other plays if it can. |
| a later version's save | anything else | Stays where it is and is protected: the first save copies it before writing, and writing fails closed if the copy can't be made. A readable localStorage record becomes a copy. |

4. **Copies.** A losing record is copied byte for byte before anything can overwrite it, and cleared only after the copy is
   confirmed. A record that is already kept, byte for byte, is not kept again (a boot that fails every visit would otherwise
   fill the five places with one record). The copy, the clearing and the listing each have 3,000 ms; a step that is too slow
   leaves the record where it is. Up to 5 copies are kept: 3 localStorage slots, and 2 more in IndexedDB that exist only while IndexedDB is
   open. A page on localStorage keeps at most 3. With the cap reached, the loser stays where it is. For a losing legacy
   record that has a consequence: if the player then abandons the IndexedDB life, the next boot finds that lone
   localStorage record and imports it. It needs five kept copies, both stores present and an abandon, and it is accepted.
   Home lists every copy with Download copy and Delete copy (`SaveNotices.tsx`); a save from a newer version offers Reload
   and Download copy, with no Delete. Delete copy asks "Delete this copy?" in place (Delete it, Keep it, Escape keeps) and
   focus lands on Keep it, then back on the button, or on the list after a delete. Every button is named for its copy
   ("Delete copy, Your save didn't load, 8 characters"), and a download that finds nothing says so. A record left in the main slot can be downloaded but not deleted from there.

Tests: `test/save-hydrate.test.ts` (the table, the fallbacks, the import checks, the v4.0.2 shape and the schema 1 fixture),
`test/save-boot.test.ts`, `test/save-notice.test.ts`. The fake database in `test/save-kit.ts` can fail to open, hang on
open or read, fail a write, corrupt a read-back, or answer late.

### The flag

`FLAGS.idbSaves` is `true` from v4.1.0. With it off, `hydrateSaves({ idb: false })` still diagnoses and keeps copies, but all
saving stays on localStorage and writes stay synchronous, as in v4.0.2, for a browser that has never kept a life in
IndexedDB. A browser that has (the marker is set) uses the database whatever the flag says: the flag decides whether a
browser starts using IndexedDB, not whether a life that has moved there stays visible. To see the localStorage path, open the
game with `?flags=-idbSaves` on a browser without a moved life. Tests set it with `withFlags({ idbSaves: true }, ...)` or `false`.

The flags come from the `?flags=` parameter if there is one, otherwise from the list stored under `anotherlife.flags` in
localStorage (`flags.ts`).

### After boot

With IndexedDB a write finishes after `saveRecord` returns, so the store mirrors `getSaveStatus().persistFailed` into
`saveError`, and "Progress isn't saved" shows when a write fails later. A Time Machine jump waits for `flushSave()` before
it counts as saved (`saveForTravel` in `ui/store.ts`).

A connection the browser drops (WebKit "Connection to Indexed Database server lost", or the site's data cleared in another
tab) is forgotten when it closes, and a call that fails because of it reopens the database once and runs again
(`idbBackend` in `save-backends.ts`). When a write still fails, or a step hangs for 20 seconds, the store also writes the
newest save, plain, to the legacy localStorage key as a backup, and the bar says the database is the problem
(`getSaveStatus().database`). The backup is taken away again as soon as the database has the newest save, and by
`removeRecord`. The next boot reads it beside the database record: it wins (see the table).

A promise can't hold a closing page open, and a queued save is only written after the codec has run, so when the page hides
(`pagehide`, or `visibilitychange` to hidden) `bootApp` calls `spillSave`: if the database does not have the newest save
yet, it is written synchronously, plain, to the legacy key, and the queue then runs dry if the page stays alive. A
same-year action made just before the tab closes is recovered from that backup at the next boot.

### Rollback

After an import the localStorage key is gone. A v4.0.x build opened on the same address sees no save until the new build
returns. If a life was started there, the next boot (the marker is set) keeps the localStorage life, imports it, and files the
IndexedDB life as an older copy that Home lists and offers to download.

Switching the flag off no longer hides a moved life: a browser with the marker keeps using IndexedDB. If the database can't be
reached on a visit, Home says so and New Life asks first. A life started then is kept apart from the saved one until the
database answers; the next visit that reaches it keeps the newer of the two and files the other as a copy.

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
| minigames | `Blackjack.tsx`, `HorseRace.tsx`, `Slots.tsx`, `Burglary.tsx`, `PrisonEscape.tsx`, `Pickpocket.tsx` in `src/ui/minigames/` | `src/ui/minigames/lazy.tsx` |
| people-profile | `PersonProfile.tsx`, `FactRow.tsx` in `src/ui/components/` | `src/ui/people/lazy.tsx` |

The minigames zone came with R3 (v5.1.0), when the fog and effort code put the initial bundle over the budget; it took 12,733
bytes out of the entry. MinigameCard draws a game inside its PopupFrame, so a game that has not loaded shows the busy box under the
title, and the idle prefetch normally has the six chunks in long before one is offered. The Annual Report and the Nation Report
stay in the entry: both come every year, and `test/annualReport.test.ts` pins `MINIGAMES.annualReport` to the component.

The people-profile zone came with R4 (v5.3.0, X48). A living person who is not a pet, read in Realistic with `peopleProfile` on, gets
`PersonProfile.tsx` (the rows of `personFacts`, drawn by `FactRow`); the facts builder, and later the connections and memory helpers, ride in
the same chunk because only the profile imports them. `PersonSheet` decides with `usesProfile` (`people-fog.ts`, eager) and draws the hero
alone while the chunk loads and if the load fails: the old bars would print the true stats. The chunk has to stay a leaf. `PersonProfile`
imports `PersonHero.tsx` (the hero, `personName` and `personSubtitle`, which `PersonSheet` re-exports) and never `PersonSheet`: a static import of
the sheet made the bundler move the game's screens into a shared chunk of their own, and the first download grew by about 5.5 KB of gzip
(`node scripts/bundle-budget.mjs`: +7.0 KB with the import, +1.5 KB without; the chunk itself is 3.0 KB).

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
