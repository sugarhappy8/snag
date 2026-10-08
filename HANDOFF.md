# AnotherLife v1.7.0 — handoff (delete this file before releasing)

Repo `sugarhappy8/snag`, branch `claude/fervent-cerf-1iuzn5` (based on `main` = v1.6.0, `cab532e`).
Stack: Vite + React 19 + TypeScript + Vitest. Pure engine in `src/game`, UI in `src/ui`. Read
`docs/ARCHITECTURE.md` first (golden rules: plain-JSON state, all randomness via `rng.ts`, menus never
mutate state or touch `g`'s RNG, engine money is constant 2026 US dollars shown via `formatMoney`).

## The request being implemented (user, verbatim)
1. More brands and luxury items to spend money on and your family with your permission can use them and show off.
2. Real brands not fake brands for everything even rival companies.
3. Make global market screen in business is better and expanded more and a bit more complex.
4. Make it so your kids would want to work for your company and become nepo babies.
5. Family get actually angry if you write them out of will.
6. Make the timeline/your in actually feel like that year.
7. New talent called "main character syndrome" that basically gives you all the talents and you can master anything after the first time.

## State right now (verified at commit c04d276)
- `npx tsc --noEmit` clean, `npx vitest run` 120 files / 1977 tests pass, `npm run build` OK.
  (Before the last builders' work: `test/anachronism.test.ts` was reported failing by agents on others'
  text, see "Open items"; it passed in the final full run, re-check.)
- All work is UNRELEASED and mostly UNREVIEWED by a human. Nothing is on `main`. No PR exists yet.
- Every push to the PR branch deploys to production (Cloudflare Git integration). Keep `[skip ci]` in
  WIP commit messages until verified.

### Built (each had a builder; all but #7 also had an adversarial reviewer)
| # | Feature | Main files | Status |
|---|---|---|---|
| 1 | Luxury brands + family use | `shops/luxury-brands-*.ts`, `shops/luxury-family*.ts`, `data/brands-luxury.ts` | built + reviewed; needs lead edits in `assets.ts` (below) |
| 2 | Real brands: rivals | `data/brands-rivals.ts` (~3,000 rows), `business/competition-roster.ts` | built + reviewed |
| 2 | Real brands: consumer | `data/brands-consumer*.ts` (~1,000 brands), `shops/everyday-brands.ts`, careers, fame, computer, finance | built + reviewed |
| 2 | Real brands: stocks | `invest/real.ts`, `invest/stocks-*.ts`, `invest/funds.ts`, `data/brands-stocks.ts` | built + reviewed |
| 3 | Global market screen | `business/market-*.ts`, `business/competition-menu.ts` | built + reviewed |
| 4 | Nepo babies | `business/nepo*.ts`, `events/nepo-life.ts`, board family-hire proposals | built + reviewed |
| 5 | Will anger | `activities/will.ts`, `events/will-*.ts`, `life.ts` inheritance | built + reviewed |
| 6 | Year feel | `events/era-pack-*.ts` (~160 files of lines + ~170 events), `history/digest*.ts`, era rules in careers/education/health/love/activities | built + reviewed |
| 7 | Main Character Syndrome | `talents.ts` (`MainCharacter`), `mastery.ts`, mastery hooks in activities/special/computer/careers/education, `ui/styles/main-character.css`, `test/main-character*.test.ts` | built, **its agent was stopped before it reported; NO adversarial review ran** |

The agents' full reports (summaries, review fixes, remaining issues, shared-change requests, docs notes)
are in `docs/V17-AGENT-REPORTS.md` — read it; it is the best map of the work. Delete it before release
or fold the useful parts into `docs/ARCHITECTURE.md`.

## To finish (in this order)
1. **Review feature #7 (Main Character Syndrome)** like the others: hasTalent true for every id incl.
   the childhood talents in `life.ts TALENTS`; first-time mastery in every skill family; luck games not
   rigged; honest purple hints; no money exploit (compare earnings with a normal life of the same seed);
   New Life picker shows it and says it uses 1 of the 3 slots; old saves.
2. **Apply the "sharedChangesNeeded" items** in `docs/V17-AGENT-REPORTS.md` (edits to files agents did not
   own). The important ones:
   - `assets.ts`: `ageAsset` must skip pieces with `a.details.lux === 1` (otherwise art can jump x2.5 and be
     sold at that value, and car upkeep/value drift); add `ASSET_NODE_HOOKS` seam in `assetNode` so brand
     pieces and Family Access show on existing cars/boats/aircraft/jewelry/instruments (details in the luxury reports).
   - `menus.ts`: add `thisYearMenu` (from `history/digest-menu`) to `activitiesMenu`; `activities.ts`: add
     `pastimesMenu` (from `activities/pastimes`) to `miscActivities` (the Hang Out menu is unreachable until then).
   - `history/digest.ts`: show sub-$10 amounts with cents (1900s lines print "$0 newspaper"), optionally filter
     culture/price lines by country (early text is US-flavoured).
   - Make `isEstranged(g, p)` (events/will-core) count like `p.data.disowned === true` in `events/wealth-ask.ts`,
     `wealth.ts payAllowances`, `wealth-menu.ts`, `shops/luxury-family.ts isFamilyMember`, `business/nepo.ts`;
     `wealth-kids.ts cutFromWill` should call `changeWill + removeHeir + queueTells`.
   - `life.ts continueAsChild`: a designated successor (`details.family.succ`, `readFamily` in
     `business/nepo-state.ts`) keeps the company even with several heirs; `manage.ts pickManager`: add relatives
     to the headhunter shortlist with `familyCandidates(...)` from `business/nepo-succession.ts`.
   - `crime.ts`: bank-robbery bank names collide with real registry banks ("First National", "Citizens") — rename.
   - `special/politics.ts announce()`: refuse negative moves against real registry companies.
   - Anachronism text hits (re-run `test/anachronism.test.ts`): `pol.run.school` ("selfie" in 1980),
     `sports.fight.socialCallout` ("online", "open your phone" in 1986), `special/politics.ts` "leaked group chat" in 1967.
   - vitest `testTimeout` higher than 5s in `vite.config.ts`: heavy suites (deeptech, conglomerate, market-events) sometimes time out under full load.
3. **Brand legal pass** (the user asked for real brands; the rules are in the header of `src/game/data/brands.ts`
   and the README disclaimer): spot-check facts (flagged unverified: Lufthansa 1966, Maersk 1965, Nokia 1915,
   Norsk Hydro 1927, Leumi 1953, Aeroflot 1994, Turkish Airlines 1990 listing years); confirm no real person's name,
   no tobacco/vape/firearms/gambling brand, alcohol only as adult goods, no invented negative claim about a real
   company, scam/penny/pump-and-dump content fictional. Update the README disclaimer to name companies, indices,
   funds and coins and say all prices/returns/events are simulated (requested by two reviewers).
4. **Docs**: fold the `docsNotes` from `docs/V17-AGENT-REPORTS.md` into `docs/ARCHITECTURE.md` (brands registry,
   market screen, luxury family use, nepo, will feuds, era packs + digest, Main Character, counters, layout).
5. **Verify**: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, headless playthroughs
   (`scripts/e2e-play.mjs`, instructions in its header; Chromium at `/opt/pw-browsers`), and play it at 390x844 in
   light and dark: market screen of a company, luxury shops, Family Access, hiring a kid, editing the will,
   a 1955 life and a 1992 life (This Year card, era lines), a Main Character life.
6. **Release** (only when the user asks): bump `package.json` + lockfile to 1.7.0, squash-merge the PR with a
   "(#N)" title, run the `release.yml` workflow with tag `v1.7.0` and hand-written notes. Remove `HANDOFF.md`
   and `docs/V17-AGENT-REPORTS.md` first.

## Known design gaps the agents flagged (decisions, not bugs)
- Universities, sports clubs, and job listings of real public institutions stayed fictional (large systems).
- Real brands/companies in foreign countries are offered somewhat uniformly (a Japanese life can be offered
  Barclays); per-country exits are modeled only for a few chains.
- Very rich players can get 2-3 wealth popups a year (cap exists); CEO letters bundle past two a year.
- Paying relatives at your company can move money out before death (bounded by tax, the board vote and the
  minority-shareholder suit); judged acceptable.
- Will: cutting a share to the 10% minimum does not count as being cut out; the default empty will leaves a
  spouse out (the menu warns).

## Rules for contributors
- Brands: real names only for brands/products/places; never real living people; nothing negative that isn't
  well-documented public history; fictional names for scams, penny stocks, scandals.
- Never skip, weaken or delete a test that guards an exploit. Menus must be pure (no RNG, no mutation).
- Keep old saves loading. Squash-merge with a "(#N)" title. Commit trailers:
  `Co-Authored-By: <model> <noreply@anthropic.com>` + `Claude-Session:` link if you are Claude.
