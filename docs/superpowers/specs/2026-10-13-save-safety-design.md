# Save safety: IndexedDB + gzip, schema versions, bad-save quarantine (v2.5)

Part of the v2.5 program (the AnotherLife v2.5 Improvement Prompt, Part C #1–#3, order-of-work
step 1). Design approved in chat on 2026-10-13. This file is the written spec awaiting review.

## What was asked for

The v2.5 prompt puts three data-loss risks first:

1. The main save is 1.76 MB of plain JSON in localStorage (2.24 MB with businesses), 1.69 MB of it
   `flags.worldEconomy`. Safari counts localStorage in UTF-16 units, so long dynasty lives sit near
   the quota. Move the main save to IndexedDB with gzip.
2. `GAME_VERSION = 1` (`core.ts:21`) has never been bumped. `save.ts:498,507` reject any other
   version and `loadGame` returns null, so Home silently shows no Continue. Add a `schemaVersion`
   with a migration chain and an explicit "save from an older version" state.
3. `read()` (`save.ts:23-30`) swallows `JSON.parse` errors, Home shows no Continue, and the next
   New Life overwrites `anotherlife.save.v1`. On validation failure copy the raw blob to
   `anotherlife.save.v1.bad` and show a Home banner with a download button.

Rules that apply: old saves must still load, saved-game key names are migrated and never renamed,
seeded RNG only, no `any` or `@ts-ignore`, a test for every mechanic.

Assumptions: this ships as one green commit per subsystem on `claude/new-session-1vdxk8` with one
draft PR. The prompt's 400 KB target is measured on the stored (gzipped) size.

## Decision: the economy state does not change here

The prompt says to drop `previous` (recompute it from `history[-2]`) and keep only the player's
country and trading partners in full. An audit of every reader found that this is not safe.

- `ageUp` bumps the year (`aging.ts:96`), runs `yearlyEconomy` (`:104`), then every yearly hook.
  Business year-end books `fiscal = g.year - 1` (`yearly.ts:479`) and reads
  `economyOf(g, country, fiscal)`, which returns `state.previous[country]` (`model.ts:182`).
- `history` keeps 8 fields: year, growth, unemployment, inflation, rate, housing, market,
  priceScale. Only `market` and `housing` (`economyMarketFactor` already falls back to history,
  `index.ts:66-68`) and the bond `rate` read (`investments.ts:1850`) fit in them.
- A baseline overlay would give neutral values (spending 1, every sector factor 1, output gap 0
  outside history), so from fiscal 2026 on `economicCycle` is exactly 1 and recessions, shortages,
  tax shifts and wage moves vanish from every company's annual statement.
- The countries asked about are not only the player's: business homes and every outlet country,
  NPC company countries, rental countries, bond countries and exchange homes.
- In memory `previous` shares objects with last year's `countries` (`index.ts:28,31`). Only the
  JSON duplicates it, and gzip removes most of that.

So this sub-project leaves the economy state alone and gets its size win from gzip and
IndexedDB. The economy shrink moves to Part C #4 (tiering). See "Handoff to Part C #4".

Expected size: by estimate 250–450 KB stored for the audit's 100-year, 12-business life. The first
plan task measures it, so this sub-project does not promise the prompt's 400 KB. Part C #4's
tiering is what guarantees it.

## 1. Storage (`save-backends.ts`, `save-store.ts`, `save-quarantine.ts`, new)

**Record.** In IndexedDB the main save is the existing snapshot codec's string
(`encodeSnapshotRecord`): plain JSON below 100,000 characters or without `CompressionStream`,
otherwise `gz2:` gzip text.

**Backends**, tried in order:
- IndexedDB (async): database `anotherlife-save` with object stores `saves` and `quarantine`; the
  save is the record under key `anotherlife.save.v1` (same name). Separate from
  `anotherlife-timemachine`.
- localStorage (synchronous): the same key. The fallback keeps today's behavior exactly: it writes
  plain JSON inside `saveGame`, returns false on refusal, and reads live storage, so gzip is an
  IndexedDB-only feature and a save is readable the moment it is written. A legacy plain-JSON
  save in that key is a valid record, so this backend needs no separate legacy path.
- If localStorage is disabled too, writes fail and the existing "Progress isn't saved" warning
  shows, as today. A memory backend exists for tests only.

**Boot.** `hydrateSaves({ backend?, timeoutMs = 3000 })`, awaited by `main.tsx` before
`createRoot().render()`. A hung IndexedDB drops the session to localStorage after the timeout
instead of leaving a blank page.
1. Pick the backend. When it is IndexedDB, also read the legacy localStorage key.
2. Both present: IndexedDB wins and the legacy blob is copied to quarantine as `stale`.
3. Decode, parse, `migrateSave`, then the structural check (`isGameShell`, `isLoadableGame`).
4. A failure other than `newer`: quarantine the raw record (section 3), clear it from the main
   slot, leave the cache empty. `newer`: leave the record in place and the cache empty, and raise
   a `newer` notice.
5. Success: the cache holds the migrated game's JSON. If the record came from the legacy key or
   migration changed it, write the new record, read it back, compare, and only then delete the
   legacy key. A failed verification keeps the legacy key.

**Reads.** `loadGame()` keeps its signature (`GameState | null`): it parses, migrates and validates
the stored JSON, returns a fresh object, then runs `refreshRoyalCareers` and
`refreshFamilyTalents` as today. For localStorage the JSON is read live. For IndexedDB it comes
from a cache filled at boot and updated by each save: the newest save while writes are healthy,
and the last stored record after a failed write (what a reload would load, as today). Home calls
`loadGame()` once instead of `hasSavedGame()` then `loadGame()`. `loadGame()` has no side effects:
a damaged state saved by the running game is quarantined at the next boot.

**Writes.** `saveGame(g)` keeps its signature. It stringifies (false on a throw, as today). A
localStorage write happens inside the call and returns false when refused, as today. An IndexedDB
write updates the cache, queues the write and returns true.
- One IndexedDB write is in flight. A later save replaces the pending one (latest wins). A write is
  encode, then `put`. A failure sets `persistFailed`, and the next `saveGame` or `retrySave()`
  tries again. A refused localStorage write sets it too.
- `flushSave(): Promise<boolean>` resolves when the newest cached save is stored. The Time
  Machine jump awaits it and still calls off the trip on failure (`store.ts:310`). A `pagehide`
  and `visibilitychange: hidden` listener calls it.
- `clearSave()` empties the cache, bumps a generation counter and queues the removal after any
  write in flight. A write that sees the counter change discards itself, so abandoning a life can't
  be undone by a slow write. While a `newer` record sits in the main slot, `clearSave()` leaves
  that record alone.
- The localStorage backend keeps today's quota behavior: on `QuotaExceededError` it asks
  `save.ts` to evict a Time Machine local snapshot (`evictLocalSnapshot`) and retries.
- `getSaveStatus()` returns `{ notices, persistFailed }` and `subscribeSaveStatus` tells
  listeners. `store.ts` mirrors `persistFailed` into the existing `saveError` banner.

**Modules, no import cycles.**
- `save-schema.ts` (new): `SAVE_SCHEMA`, `migrateSave`, and `migrateLegacyAi`, `isGameShell`,
  `isLoadableGame` plus their helpers, moved from `save.ts` unchanged. `save.ts` re-exports
  `migrateLegacyAi`.
- `save-backends.ts` (new): the three backends and the `SAVE_KEY` constant.
- `save-quarantine.ts` (new): copies of unreadable records. Imports only `save-backends.ts`.
- `save-store.ts` (new): cache, write queue, hydrate, status. Imports the two modules above plus
  `save-schema.ts` and `snapshot-codec.ts`.
- `save.ts`: the public facade (`saveGame`, `loadGame`, `clearSave`, `flushSave`, `hydrateSaves`,
  `getSaveStatus`), ribbons, graveyard and Time Machine. Injects the quota evictor.
- New UI files `ui/components/SaveNotice.tsx` and `ui/download.ts`. Edits to `main.tsx`,
  `ui/store.ts` and `HomeScreen.tsx`.

## 2. Versioning (`save-schema.ts`)

- `GameState.schemaVersion?: number` (missing means 1). `SAVE_SCHEMA = 2`. `createNewLife` sets it.
  `GAME_VERSION` stays 1 as a frozen family marker, so a v2.4 build still recognises the shell.
- `migrateSave(raw)` returns `ready` (with the game and its source version), `newer`, `tooOld` or
  `invalid`. Steps sit in a table keyed by source version. Step 1→2 runs `migrateLegacyAi` and
  stamps `schemaVersion = 2`. Steps are idempotent and treat junk as `invalid`, never a throw.
- `tooOld` exists for the chain's floor (`MIN_SCHEMA = 1` today), tested with an injected floor.
- Rule for `ARCHITECTURE.md`: any change to the saved state's shape adds a migration step and a
  fixture test. A meta-test fails when a version below `SAVE_SCHEMA` has no fixture.
- Fixture: a real v2.4.0 save (age about 30, two businesses), generated with the unchanged engine
  before any other change and committed gzipped as `test/fixtures/save-v1.json.gz`.
- `loadSnapshot` uses `migrateSave` in place of its inline shell check plus `migrateLegacyAi`, so
  old Time Machine snapshots load through the same chain.

## 3. Quarantine and Home

**Triggers.** A decode error, a JSON parse error, `invalid`, `tooOld`, or a stale legacy blob (boot
step 2). A copy is byte-exact (the raw record string) and goes to the first free of
`anotherlife.save.v1.bad`, `.bad.2`, `.bad.3` in localStorage. If that write throws, or the three
slots are taken, it goes to an IndexedDB `quarantine` store in the save database. With five copies
already kept, a sixth record stays where it is, uncopied and uncleared, and the notice shows again
at each boot. The main slot is cleared only after the copy is confirmed. Nothing ever overwrites a
copy. Only "Delete copy" removes one.

**`newer`.** The main record is left untouched and never overwritten. Continue is hidden because
`loadGame()` returns null. When the player starts a New Life, the first write copies the newer
record to a quarantine slot, and fails closed (the save warning shows) if it can't.

**Notices.** `SaveNotice { id (the slot), kind: 'damaged' | 'tooOld' | 'newer' | 'stale', bytes,
version? }`. Home shows one per item above the menu with a title, one sentence, and buttons:
Download copy and Delete copy, or Reload and Download copy for `newer`. Draft copy, written to the
v2.5 house style (plain, contractions, no feelings, no disclaimers):

| Kind | Title | Sentence |
|---|---|---|
| damaged | Your save didn't load | A copy is kept on this device. Download it before you start a new life. |
| tooOld | This save is too old to open | It's from version {n}. A copy is kept. Download it. |
| newer | This save is from a newer version | Reload to update, or download a copy. New Life keeps a copy too. |
| stale | Found an older copy of your save | It's kept in case you need it. |

**Download.** `downloadText(filename, text)` builds a Blob and clicks an `<a download>`. The name is
`anotherlife-save-YYYY-MM-DD.json`, or `.txt` when the text isn't JSON. Part B #6's export reuses it.

`getSaveStatus()` feeds Home through the app store (`saveNotices`, refreshed after hydrate and
after each Delete). `loadGame()` stays `GameState | null`.

## Testing

All vitest in the existing node environment, with no new dependencies. The real IndexedDB backend
is tested against a hand-written fake of the few IndexedDB calls it uses.

- `test/save-schema.test.ts`: the v2.4.0 fixture migrates to `ready` at schema 2, passes
  `isLoadableGame` and survives three `ageUp` calls; missing `schemaVersion` means 1; junk is
  `invalid` without a throw; `schemaVersion: 3` is `newer`; an injected floor gives `tooOld`;
  migrating twice changes nothing; the fixture meta-test.
- `test/save-store.test.ts`: round trip below and above the gzip threshold; five rapid saves make
  at most two puts and the last wins; a failed write sets `persistFailed` and the next save retries;
  `flushSave` resolves false then true; `clearSave` during a write leaves no save; IndexedDB open
  failure falls back to localStorage, and a disabled localStorage makes writes fail so the warning
  shows; a hung IndexedDB falls back after the timeout (fake timers); legacy import deletes the legacy key only after read-back
  verification and keeps it on a mismatch; both present means IndexedDB wins and the legacy blob is
  quarantined as `stale`; a quota error calls the evictor and retries.
- `test/save-quarantine.test.ts`: corrupt JSON, truncated `gz2:`, bad alphabet, a validation
  failure and `tooOld` each leave the raw record byte-exact in `.bad` with the main slot cleared; a
  New Life afterwards keeps the copy; copies four and five overflow to IndexedDB and the sixth
  refuses and leaves the main record alone; `newer` is untouched until New Life copies it, and
  fails closed without room; Delete removes exactly one copy; the downloaded text equals the stored
  record.
- UI: `SaveNotice` markup per kind through `renderToStaticMarkup`; Home hides Continue without a
  loadable save.
- Existing tests keep passing untouched, because the localStorage path stays synchronous
  (`store.test.ts:101` and `time-machine.test.ts:647` depend on that). New tests share
  `test/save-kit.ts`: a fake IndexedDB, in-memory localStorage and a backend whose writes the test
  resolves or rejects by hand.
- Size probe: `scripts/save-size.ts` prints raw and stored sizes with a per-part breakdown for a
  seeded 100-year, 12-business life. The plan runs it before any change. A test asserts stored size
  at most the measured ratio plus 10% of raw. The numbers go in the release note.

## Docs

- `docs/ARCHITECTURE.md`: fix the `save.ts` entries, "Main saves remain plain JSON" and "State is
  plain JSON ... saved to localStorage", and add a Saving section (layers, hydrate, schema rule,
  quarantine).
- `docs/RELEASE-v2.5.0.md` (new): a Save safety entry. Later PRs add a line each.

## Risks and out of scope

- Hydrate adds an async step before first paint: tens of milliseconds on desktop, perhaps 300 ms
  on a phone. Part C #6's inline splash covers it.
- A tab killed within about 100 ms of a tap can lose that tap. Writes start at once and flush on
  `pagehide`.
- A rollback to an older build can't see the IndexedDB save until the new build returns.
- A hung IndexedDB degrades the session to localStorage. The both-present rule covers the next
  boot.
- Out of scope: any economy change (Part C #4), debounced saving (Part C #5), save slots and
  export/import (Part B #6), cross-tab coordination (two tabs are last-writer-wins, as today), a
  persistent-storage request, a service worker.

## Done when

- The v2.4.0 fixture loads and plays on.
- Corrupt, truncated, newer and invalid records are kept byte-exact and survive a New Life.
- An IndexedDB failure falls back, and a failed write shows the existing banner.
- `npm run typecheck`, `npm test` and `npm run build` are green.
- `ARCHITECTURE.md` and `docs/RELEASE-v2.5.0.md` are updated.
- The size probe's before and after numbers are recorded.

## Handoff to Part C #4

Part C #4's tiering must use these readers of last year's snapshot as its focus-set definition.
Everything it keeps in full has to cover them.

| Reader | Year asked | Fields | Countries |
|---|---|---|---|
| Business year-end: `economicCycle` (`economy.ts:970`), `nationalMarket` → `industryConditions` (`dynamics.ts:82`) | `g.year - 1` | outputGap, spending, sector demand, competition, costs | business home and outlets |
| Supply and trade (`supply.ts:79-85`) | closing year | sector availability and workforce, tradeNetwork, skills | outlets |
| Wages, rent, inflation, rate, credit, defaults, bankStress, confidence, taxShift (`economy.ts:669,716`, `gamestudio.ts:217,392,412`, `deeptech-sim.ts:107-156`, `bank-model.ts:68,239`, `fund-sim.ts:163`, `fund-model.ts:295`, `tax.ts:25`) | closing year | those fields | home and outlets; tax: every revenue country |
| Rentals (`landlord.ts:162`) | `g.year - 1` | confidence, sector demand, cohorts, unemployment | the rental's country |
| NPC companies (`npc-lives.ts:159`) and for-sale listings (`founding.ts:990-992`), via `simulateYear` and `planFor` | `g.year - 1` | all of the above | their countries |
| Bonds (`investments.ts:1850`) | `g.year - 1` | rate | the bond's country |
| Exchange factors (`investments.ts:673,1821`, `shocks.ts:281,307`) | `g.year - 1` | market, housing (history fallback exists) | the exchange's home |

Tests and code that touch `previous` and must change with it: `living-economy.test.ts:43,146`,
`world2-business-trade.test.ts:28`, `world2-population-integration.test.ts:24`,
`world2-rivals.test.ts:142,195` (`previousRivals`), `business/supply-resilience.ts:27-30`.
