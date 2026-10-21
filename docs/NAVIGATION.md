# Navigation, search and cockpits

What v4.1.0 ("See it") added for finding things and seeing them at a glance, and the rules that keep it safe. Read it before
you add a row to a root menu, a badge, a search word, a cockpit tile or anything that reads the pins. The test named in each
section is the permanent guard; when one fails, the section says what it protects.

Three build flags gate every screen below (`src/game/flags.ts`, dark until the lead's release commit). Read a flag where you
use it, never in a module-level const, and set it in tests with `withFlags` or `setFlags` plus `resetFlags`. Never mock the module.

| Flag | What it turns on | With it off |
|---|---|---|
| `navRegroup` | Activities in sections with Do Anything on top and Surrender last, the "Needs you" card and the badge pills, breadcrumbs under the header of a nested sheet | The v4.0.2 list and markup, row for row |
| `navPalette` | The header search button, the palette (Ctrl or Cmd+K, "/"), the keys 1 to 4 and A, pins (the star in the breadcrumbs), recents | No button, no listener, no write to storage |
| `cockpits` | The company screen as a short top plus four tiles, the cockpit above the list of each tab (wealth on Assets), the Needs you card on Relationships | The flat company list, no panel |

`test/nav-release.test.ts` runs the aggregate checks with all three on, so it passes now and after the flip. It also checks
that the legacy path (all three off) still equals v4.0.2.

## 1. The data-order rule

The menu data never changes order. `activitiesMenu`, `assetsMenu` and `occupationMenu` are the lists v4.0.2 had, and five
seeded simulation tests pick actions by position in them (`simulate`, `main-character-life`, `era-features`, `history`,
`anachronism`). A new order would move every seeded play.

So regrouping happens at render time. `regroupForDisplay` (`src/ui/nav/sections.ts`) puts the same node objects in section
order and adds headings, only inside `MenuSheet`; `resolveTrail`, the walkers and the search index keep reading the data list.
Which section a row sits in is the table `ACTIVITY_SECTION` in `src/game/hubs/sections.ts`, or the row's own `section`. A row
the table doesn't know lands in "More". `test/nav-sections.test.ts` pins the data order.

## 2. Hub groups and the `hub.` prefix

A cockpit tile on the company screen is a `MenuGroup` whose id starts with `hub.` (`HUB_PREFIX`, `src/game/hubs/company.ts`;
the ids come from `hubIds(assetId)`). The tiles hold the very nodes of the flat list in the flat order, so a walk that
leaves out the `hub.` segments sees the same action sequence with the flag off and on. The walker in `test/nav-kit.ts` does
that (`canonical`), and `test/fuzz-kit.ts` gives a `hub.` group no depth. Rules for a tile:

- Its `children` reads the latest state each time (the sheet re-resolves the open group on every render), so `businessScreen`
  hands the hub a `rebuild` function. A hub must not import `manage.ts`, `business.ts`, `career.ts`, `assets.ts` or `menus.ts`
  (import cycles; `test/architecture.test.ts` is the gate).
- Give a new group of your own an id that does not start with `hub.`. The prefix means "invisible in a path".

## 3. Badges and "Needs you"

A badge is a short word or a count (12 characters at most, `99+` over 99) that marks a row with something waiting. It is a pure
read of the committed state, run for every row on every render, so it never opens a menu, never draws, never reads a hint.

To add one, call `registerBadge(id, fn)` for one row or `registerBadgePrefix(prefix, fn)` for a family of rows
(`src/game/hubs/needs.ts`), or put `badge: (g) => ...` on the node. `fn` returns a string, a number or null. Don't touch the
menu that builds the row. `needsYou(nodes, g)` lists the visible, unlocked rows that have a badge, in data order, six at most.
`test/nav-needs.test.ts` holds the rules (and a string scan for `.children(` in `needs.ts`).

```ts
// src/game/hubs/needs.ts, next to the others: one row, then a family of rows
registerBadge('crime', (g) => (g.character.wantedLevel > 0 ? 'Wanted' : null))
registerBadgePrefix('biz.company.', (g, assetId) => companyBadge(g, assetId))
```

## 4. Search words

A row's search words come from its own `keywords` and from the table `KEYWORDS` in `src/game/hubs/keywords.ts` (lowercase, 24
characters at most, no duplicate inside a row). To make a row findable by a word a player would type, add a line to the table
keyed by the row's id; `keywordsOf(node)` reads both. `test/nav-people.test.ts` checks that every key is a real id.

```ts
// src/game/hubs/keywords.ts, inside ROWS: the words a player would type for the row with this id
pets: ['dog', 'cat', 'pet'],
```

The index (`src/ui/nav/searchIndex.ts`) is plain data: id paths, labels, keywords and breadcrumbs, never a closure. It reads
`children`, `visible`, `disabledReason` and `keywords`, never a hint, a subtitle or a header. A tap looks the live node up again.
It stops at 20,000 nodes and 6,000 entries, and `test/nav-release.test.ts` times the CEO state.

## 5. Pins, recents and where they live

Pins (12) and recents (8) are UI state in `localStorage['anotherlife.ui.v1']`, per life, validated and bounded (6 lives, 16 KB).
They never enter `GameState`: the store clones the state on every tap and the Time Machine would rewind them. Nothing under
`src/game` names `ui/nav` or the key; `test/nav-release.test.ts` scans for both and checks the game JSON after a pin.

## 6. The palette zone and the lazy gate

The palette is one lazy chunk. Its zone is five files: `Palette.tsx`, `paletteModel.ts`, `searchIndex.ts`, `searchRank.ts` and
`useSearchIndex.ts` (`PALETTE_ZONE` in `test/lazy-zones.test.ts`). The gate is `src/ui/nav/lazy.tsx` (`LazyPalette`, made with
`lazyView`, never `React.lazy`). Only the gate may import the zone at run time, and only with `import()`. Code outside the zone
that needs a place from the index uses `place.ts`, `reopen.ts` and `prefs.ts`, which are free of it. The chart kit has the same
rule in `src/ui/charts/`; cockpit code reaches it through `src/ui/nav/kit.ts`.

## 7. Cockpits

`cockpitOf(tab, g)` (`src/game/hubs/cockpit.ts`) gives a small model: a summary line, tiles, a net-worth chart and one card per
company from `companyCards(g)` (twelve at most). Occupation shows the job or the school, Assets the wealth view, and
Relationships and Activities stay thin until the full People and World cockpits arrive. Every number is one a screen already
prints, a number that isn't finite is 0 and never `NaN`, and nothing reads a year after `g.year`.
`test/nav-cockpit.test.ts` and `test/nav-company.test.ts` hold the shapes, including hostile and old histories.

## 8. Rules for every nav file

- Pure and `deepFreeze` safe: no `g.rng` draw, no `Math.random`, no write to the game, no foresight.
- No `earnIncome(`, `addMoney(`, `spend(`, `.money +=` or `.cash +=`. Nothing here moves a dollar.
- Plain narrator voice, contractions, and no em-dash or en-dash character anywhere. Tooltips are 120 characters at most.
- A saved field is optional, validated and bounded by its reader. This track added none; `SAVE_SCHEMA` stays 2.
- `test/nav-release.test.ts` also opens the real v4.0.2 save (`test/fixtures/save-v1.json.gz`) in every screen and expects no
  `NaN` or `undefined` on any label.

## 9. The flip

The lead turns on all eight flags and bumps the version in one commit (`test/flags.test.ts` fails on half of it). R1-N10
simulated the flip for the three nav defaults in a scratch copy, and only for the files its spec lists: the nav files,
`ui-return`, `ui-shell`, `time-machine`, `screens`, `talents-ui`, `main-character-ui`, `fidelity`, `company-dashboard`,
`business`, `conglomerate-play`, `gamedev-review`, `fuzz-regressions` and `workshop`, plus the five seeded simulation tests.
Those need no pinned number changed. That is a narrower claim than "CI stays green": it says nothing about a file outside
the list.

A second scratch pass ran 37 more files that call `businessAssetView` or `businessScreen` (the three defaults true, one file
at a time, every other flag at its default). Five failed (eight cases), all for the same cause. With `cockpits` on, `businessScreen`
returns a short top plus four tiles (`hub.run`, `hub.money`, `hub.lead`, `hub.exit`), so a node that used to sit in the
top-level list now sits inside a tile, and a test that finds or indexes it at the top level gets nothing back:

| File | Cases | What it reads at the top level |
|---|---|---|
| `test/devices-menu.test.ts` | "follows Products, for devices only" | `indexOf` of `biz.devices` next to `biz.products` (both are in the Run tile) |
| `test/deeptech-review.test.ts` | "keeps an underage owner (an heir) out of the boardroom" | `.find` for `dt.lab` (the Run tile) |
| `test/deeptech.test.ts` | "runs R&D programs that cost money every year..." and "shows Business-talent hints only with the talent" | a flat `nodes.find` for `dt.lab` (the Run tile), in both cases |
| `test/books-menu.test.ts` | three cases of "the chartKit flag" | `biz.books` next to `biz.economicReport` (both are in the Money tile) |
| `test/share-classes-menu.test.ts` | "is under Capital and beside Go Public" | `biz.ipo` and the row after it (the Exit tile) |

`test/competition-era.test.ts` passes, and so do `own-trade`, `silicon-menu`, `board`, `ceo`, `conglomerate` and the
`heavy-*` files, which read through deep walkers. Add these five files to the lead's pre-flip list, fix them in the release commit,
and say why in the message: the assertion stays, only the search goes through the tile (a deep walk of the groups, or the
tile's own `children`). Don't re-baseline anything. Before the flip, run every file that reads a company screen (grep the
tests for `businessAssetView(`, `businessScreen(` and `biz.`), flipped, one file at a time; other tracks add company rows
too, and the full suite in CI is the last word.
