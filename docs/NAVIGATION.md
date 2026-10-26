# Navigation, search and cockpits

What v4.1.0 ("See it") added for finding things and seeing them at a glance, and the rules that keep it safe. Read it before
you add a row to a root menu, a badge, a search word, a cockpit tile or anything that reads the pins. The test named in each
section is the permanent guard; when one fails, the section says what it protects.

Three build flags gate every screen below (`src/game/flags.ts`, on by default from v4.1.0). Read a flag where you
use it, never in a module-level const, and set it in tests with `withFlags` or `setFlags` plus `resetFlags`. Never mock the module.

| Flag | What it turns on | With it off |
|---|---|---|
| `navRegroup` | Activities in sections with Do Anything on top and Surrender last, the "Needs you" card and the badge pills, breadcrumbs under the header of a nested sheet | The v4.0.2 list and markup, row for row |
| `navPalette` | The header search button, the palette (Ctrl or Cmd+K, "/"), the keys 1 to 4 and A, pins (the star in the breadcrumbs), recents | No button, no listener, no write to storage |
| `cockpits` | The company screen as a short top plus four tiles, the cockpit above the list of each tab (wealth on Assets), the Needs you card on Relationships | The flat company list, no panel |

`test/nav-release.test.ts` runs the aggregate checks with all three on. It also checks that the legacy path (all three off)
still equals v4.0.2.

A fourth build flag, `peopleProfile` (R4, off until the release commit flips it), gates the People tiles of the Relationships
cockpit and the badge words `Estranged` and `Owes you`, and nothing else on these screens. It reads the flag and not the mode, so it
works the same in Exact and Realistic. With it off the Relationships tab is what the three flags above made it. A test of the
People cockpit or badges names the flag with `withFlags`, on or off, and never leans on the default.

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
that (`canonical`), `test/fuzz-kit.ts` gives a `hub.` group no depth, and so does the search index: `IndexEntry.depth` and the depth cap
count the ids of a path that are not `hub.` tiles (the path itself keeps them, the resolver needs them). Rules for a tile:

- Its `children` reads the latest state each time (the sheet re-resolves the open group on every render), so `businessScreen`
  hands the hub a `rebuild` function. A hub must not import `manage.ts`, `business.ts`, `career.ts`, `assets.ts` or `menus.ts`
  (import cycles; `test/architecture.test.ts` is the gate).
- Give a new group of your own an id that does not start with `hub.`. The prefix means "invisible in a path".

## 3. Badges and "Needs you"

A badge is a short word or a count (12 characters at most, `99+` over 99) that marks a row with something waiting. It is a pure
read of the committed state, run for every row on every render, so it never opens a menu, never draws, never reads a hint.

A person row (`personGroup` in `src/game/hubs/people.ts`) takes its word from `personBadge(g, p)`: `Estranged` when they cut
contact over the will, else `Owes you` when a loan of yours is still out, else `Drifting` (a living parent, partner, spouse, fiance,
child or best friend under 25). The first two need `peopleProfile`; with it off only `Drifting` shows, as in v4.1.0. All three are
facts the player can already see on the person's sheet, and none is saved.

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
company from `companyCards(g)` (twelve at most). Occupation shows the job or the school, Assets the wealth view. Activities
stays thin until the full World cockpit arrives: a summary line and no tiles. Relationships gets four tiles behind
`peopleProfile`, built from facts the player already has: Closest (the person with the highest relationship bar, who opens on
tap), Drifting (how many people the Drifting rule flags, the same rule as the badge, opening the one with the lowest bar), Owed
to you (what the living still owe you) and Estranged (how many have cut contact). A tile with nothing to say is left out, so
there are four at most; a tie goes to the lower person id, and the order of the list never matters. No tile shows an estimate, a
hidden stat, a trait or a person's cash. With the flag off the cockpit is the summary line and no tiles. Every number is one a
screen already prints, a number that isn't finite is 0 and never `NaN`, and nothing reads a year after `g.year`.
`test/nav-cockpit.test.ts` and `test/nav-company.test.ts` hold the shapes, including hostile and old histories, and
`test/people-cockpit.test.ts` holds the People tiles and badges.

## 8. Rules for every nav file

- Pure and `deepFreeze` safe: no `g.rng` draw, no `Math.random`, no write to the game, no foresight.
- No `earnIncome(`, `addMoney(`, `spend(`, `.money +=` or `.cash +=`. Nothing here moves a dollar.
- Plain narrator voice, contractions, and no em-dash or en-dash character anywhere. Tooltips are 120 characters at most.
- A saved field is optional, validated and bounded by its reader. This track added none; `SAVE_SCHEMA` stays 2.
- `test/nav-release.test.ts` also opens the real v4.0.2 save (`test/fixtures/save-v1.json.gz`) in every screen and expects no
  `NaN` or `undefined` on any label.

## 9. The flip

The eight flags went on in one commit with the version bump (`test/flags.test.ts` fails on half of it). Most tests already pinned
the flag they test with `withFlags`. The ones that read a company screen at the top level did not, and the flip showed it: with
`cockpits` on, `businessScreen` returns a short top plus four tiles (`hub.run`, `hub.money`, `hub.lead`, `hub.exit`), so a row
that used to sit in the top-level list now sits inside a tile, and a test that finds it, or checks where it sits, gets nothing back.

`openTiles(g, nodes)` in `test/helpers.ts` opens every `hub.` tile in place, which gives the old flat list in the old order. The
assertions stayed; only the search goes through the tiles (`books-menu`, `devices-menu`, `deeptech`, `deeptech-review` and
`share-classes-menu`). A test that looks for the absence of a row must open the tiles too, or it passes for the wrong reason.

The chart rows are the other change a test can see. With `chartKit` on, a list that used to hold three info rows can hold a
fourth, the chart row. `devices-menu` pins `chartKit` off for the case that counts three spec lines and has a case for the chart row.

When you add company rows, run the files that read a company screen (grep the tests for `businessAssetView(`, `businessScreen(`
and `biz.`) with the defaults, not only with a flag pinned.
