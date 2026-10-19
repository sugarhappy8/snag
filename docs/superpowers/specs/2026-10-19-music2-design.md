# Music 2.0, one slice: label deal, format eras, chart, tour, events, legacy (design)

Date: 2026-10-19
Status: approved by standing instruction (the user approved the scope in advance; the orchestrator cut the digest to this slice). Path: architectural, on top of the careers kit.
Branch: `claude/music-2` (off `eefda33`: the kit, Actor 2.0 and part of Astronaut 2.0 exist). Ships with the integration release. Release notes, version bump and the full suite run happen there, not in this slice.
Inputs: the music digest (`/tmp/claude-0/-home-user-snag/91204518-72c3-5880-a3f8-357fc9b44d53/scratchpad/careers-research/music.md`, a design of about 4,000 lines with tests), the kit digest, `docs/superpowers/specs/2026-10-19-careers-slice1-design.md` and its plan, and the code as it stands. Where the digest and the real kit disagree, the real kit wins (4.1 lists every resolution).
Naming: `(new)` marks a name that does not exist yet; so does every name listed in the file table of section 3 (except the moved ones). Every other name in this document was grepped in the worktree. Line numbers are at `eefda33`.

## 1. What the player asked for

Music should get the layers Business has (record, rivals, ledger, era, events, exits) without becoming nonsensical. One play session per scenario:

1. **1962, United States.** Sign with a label. The first statement says vinyl. A single charts against named rival acts. The Golden Record Award exists (it starts in 1959). Nothing streaming appears.
2. **1995.** Sign a three-year deal. The advance arrives yearly and the label recoups 80% of royalties until it is paid back. The release charts against that year's acts. A tour has a real profit and loss. At expiry a renewal screen offers a push for more royalty with a stated chance.
3. **2026, Nigeria.** A streaming-era statement, a chart of Nigerian-named acts, the Naija Sound ceremony (since 2000), a master bought back from the label and left to an heir.
4. **An existing labelled save** keeps its advance salary and its $1 a copy until the current term ends, loses nothing, and meets the new screen only at renewal.
5. In all of them a hint states odds from the function that rolls, money balances to the dollar, and no genre, format or event from the wrong era appears.

Assumptions (mine): "as big as Business" means the same layers, not the same line count. "Nonsensical" means money from nowhere, a streaming deal in 1960, a rap act in 1930, or a hint that promises a roll.

## 2. What the audit found

Rubric from the careers spec (0 to 5, one point per layer): loop, choices, world, rivals, arcs. Music scores **2**: layers 1 and 2 exist, layer 3 is nearly absent, layers 4 and 5 are absent or thin. Target after this slice: **4**.

- **One file does everything.** `src/game/special/music.ts` (1,116 lines) holds the profile, labels, releases, concerts, tours, band flows and the yearly hook. `src/game/special/music-rights.ts` (138 lines) is the only business-grade part.
- **Nothing reads era or country.** Only `venueLabel` (625) checks `countryId === 'us'`. All nine `GENRES` (59) and every subgenre are open in every year (Rap in 1925). `LABELS` (77) are six fixed labels in tiers 0 to 2.
- **Release money has no structure.** `release()` (554) computes `sold` at 566, `perUnit = 1 * type.pay` at 567, and pays all of it to the player with `earnIncome` (571). The label changes nothing. The tail is `Release.royalty`, 15% of the share, halving yearly while at least 25 (1028 to 1033). `CERTS` (93) are fixed counts.
- **The contract is a salary.** `contractScript` (261) splits the advance into `advancePerYear`, which the solo block of `yearlyMusic` pays with `earnIncome` (1047 to 1074). Nothing is owed, recouped or negotiated. `contractRenewScript` (999) offers `popularity^2 * 60 * years` once.
- **Touring is free money.** `tourAction` (659) pays `popularity^2 * cities * (20 + rand * 40)` with no cost: about $3.5M a tour at popularity 50 and $560k at popularity 25, in any year and country, with no venue and no risk.
- **No rivals, one award.** The awards block (1098 to 1115) is one "Golden Record Award" in every year and country. The losers are `pick` strings, one of them "an AI-generated lullaby" in any year. No named act exists.
- **Rights are a good pattern.** `music-rights.ts` has the owner-checked `MusicMaster` asset (`musicMaster`), a five-year licence with recoup (`licenseMusicMaster`), a sale at 70% of value (`sellMusicMaster`), and `yearlyMusicRights` with its own `lastYear` marker. This slice extends it and never rewrites it.
- **Heirs.** `continueAsChild` (`life.ts` 1135) rebuilds `n.flags` from an explicit list (1507), so every `special.*` flag is lost. Only assets travel, so the catalogue that matters to an heir is the `MusicMaster` asset.

## 3. Scope and cut list

**In, in priority order** (about 1,850 new source lines in 8 files, about 200 more moved, about 2,000 test lines in about 80 cases, 9 plan tasks, section 9):

1. A versioned, owner-stamped state `special.music.sim` with a pure migration from the legacy profile and job. The legacy flag is left intact. Every legacy script id `special.music.*` stays registered.
2. A **label relationship**: negotiated terms, an advance paid yearly, a recoupment ledger, renewal, exits. Existing labelled saves are **grandfathered** on their old terms for the rest of the current term.
3. **Format eras**: shellac, vinyl, tape, CD, download, streaming, by year and country. They change the unit price, the cost, the artist take and how long a release keeps selling.
4. A derived, seeded **chart** against rival acts by era and country, built on the kit's rivals helper.
5. A **touring P&L** with accounting conservation, by venue tier.
6. **Seven events** with two or three choices each: collaboration, sample or plagiarism dispute, award by country, festival, scandal, label clash, royalty audit.
7. **Honest hints** from the roll's own math.
8. **Legacy through `music-rights.ts`**: buy a master back from the label or distributor into an inheritable asset.

**New files** (`src/game/special/`, all new unless noted):

| file | role | lines |
|---|---|---|
| `music-job.ts` | pure move out of `music.ts`: types, normalizers, `musicJob`, `md`, `mdView`, `removeBand`, `signDeal` | 200 moved |
| `music-data.ts` | pure tables: `GENRES`, `RELEASE_TYPES`, `CERTS` (moved), `FORMATS`, `LABEL_ROSTER`, `CEREMONIES`, `TOUR_TIERS`, `GENRE_FROM`, `SUBGENRE_FROM` | 190 |
| `music-state.ts` | `LabelDeal`, `LedgerRow`, `MusicState`, normalizers, `musicStore`, migration, `adoptMusic`, `musicScore` | 250 |
| `music-market.ts` | `formatMix`, economics, `waterfall`, `MUSIC_SPEC`, chart, `bookRelease`, `stepCatalogue` | 250 |
| `music-label.ts` | roster filter, offer, negotiation, deal tick, expiry, exits, Release Plan | 290 |
| `music-tour.ts` | tiers, `tourModel`, the tour picker and its P&L | 170 |
| `music-events.ts` | six crisis defs, `musicCrises`, the custom dispute, awards by country | 300 |
| `music-menu.ts` | report card, Label & Contract, Charts & Finances, buy-back rows | 200 |
| `music-sim.ts` | the `settleYear` hook and `musicSim` | 90 |
| `music-rights.ts` (edit) | `adoptMaster(g, spec, price)` | 50 |
| `music.ts` (edit) | imports, two guards, six call sites (4.9, 4.10); net about 60 new lines after the move | |

**Cut, with the reason** (the digest's design minus this slice):

- A **player-run label or publishing company** (a business trade), **sync licensing**, **music videos**, **fan clubs**: later releases, as the player said. No business trade, no `INDUSTRY_IDS` change, no `MinigameKind`, no `src/ui` change.
- **Deal depth:** 360, control, publishing and masters terms, push control or 360, buyout, walkaway price, dormant deals, shelving (`slack`), albums owed and forced extensions. One negotiated number (royalty) plus advance and term.
- **Market depth** (digest names): `marketScale` by population and penetration, `certsFor`, tour support from the label, Release Plan promo budget, label roster competition inside `sold`, rival boosts and moods, features as a menu action (collaboration is an event instead).
- **Events:** payola, file sharing, censorship, playlist, cover version, lockdown, catalogue buyer. Also the hall of fame, Lifetime Achievement, farewell tour, integrity and `lastStatement`.
- **Players and places:** band label deals (bands stay unsigned), international tours, local-scene genres, per-country genre lists, release-window clashes, per-track albums, merch lines.
- **Shared files not touched:** `business/economy.ts`, `dynamics.ts`, `state.ts`, `yearly.ts`, `heavy-rd.ts`, `deeptech-*.ts`, `life.ts`, `history/market-events.ts`, `special.ts`, `special/common.ts`, `menus.ts` and every kit file. Edited: `kit/careers.ts` (one import, one array entry), `docs/ARCHITECTURE.md` (one short section), and four test files (6).

## 4. The design

### 4.1 State and the real kit (`music-state.ts`)

Store `musicStore` (new) = `defineCareerState`, key `music.sim` (flag `special.music.sim`), version 1, start standing 20. Resolutions of the digest:

- **Key.** `music.sim`, not `musicbiz`: the kit rule is `<id>.sim`, and a store on a legacy key would prune legacy fields on `mut`.
- **Base fields replace the digest's copies.** `standing` is chart standing. `rows` are the year reports. `memory` is the rival memory (the digest's `rivals`). `cool` holds label and event cooldowns (keys `label.<id>`, `tour`, `crisis.<id>`). `done` holds answered disputes (`dispute.<rowId>`).
- **The real kit differs from the digest** in four ways this design uses: `Effects.grudge` is `{id, name, by}`, `Branch.then(s, g)` exists, `Option.odds` is optional (a fixed outcome prints no percentage), and `settleYear.run` returns the report note.
- **Fields dropped** with the cuts (digest names): `integrity`, `feature`, `hall`, `farewell`, `lastStatement`, `policy.promo`, `disputes`, and the deal fields 360, control, publishing, masters, slack, extended, owed.

```ts
export type FormatId = 'shellac' | 'vinyl' | 'tape' | 'cd' | 'download' | 'stream'   // (new)
export type SampleMode = 'original' | 'cleared' | 'risky'                            // (new)
export interface LabelDeal {                        // (new)
  id: string; appt: string                          // appt = appointmentId(job); a mismatch means the deal is over
  labelId: string; label: string; tier: 0 | 1 | 2 | 3
  since: number; term: number; years: number       // years left; term at signing
  royalty: number                                   // artist share of net, 0.05-0.40
  advance: number; perYear: number                  // total, paid yearly through c.earn
  unrecouped: number; trust: number                 // trust 0-100, 55 at signing
  legacy: boolean                                   // grandfathered terms until years reach 0
  renewals: number                                  // 0-9
}
export interface LedgerRow {                        // (new) one release in the ledger
  id: string; title: string; type: 'studio' | 'single' | 'live' | 'compilation'
  year: number; fmt: FormatId; units0: number; k: number        // k 0.2-0.7, mix-weighted at release
  pay: number; quality: number; peak: number                    // pay = RELEASE_TYPES pay; peak 0 = no chart, else 1-20
  dealId: string; label: string; rate: number; members: number  // rate = artist share of net 0.05-0.60
  samples: SampleMode
  gross: number; paid: number; lastLabel: number; lastYear: number
  adopted: boolean; legacy: boolean                             // legacy rows keep the chart peak and never settle
}
export interface MusicExtra {                       // (new) the career part of the record
  migrated: boolean; deal: LabelDeal | null
  history: { label: string; from: number; to: number; ended: 'expired' | 'dropped' | 'walked' | 'quit'; forgiven: number }[]   // 8
  ledger: LedgerRow[]                                                                                                                    // 40
  tours: { year: number; tier: string; shows: number; gate: number; costs: number; net: number }[]                                 // 8
  mods: { id: string; kind: 'units' | 'fill'; mult: number; until: number }[]                                                      // 6
  policy: { samples: SampleMode }; awards: string[]                                                                                // awards 24
}
export type MusicState = CareerBase & MusicExtra    // (new)
```

- `normalizeExtra` (new) clamps every field and never throws. `adoptMusic(g, s)` (new) is the one place the sim takes over from the legacy hook (like `adoptLegacy` in `actor-state.ts`): it sets `migrated`, stamps `deal.appt` and sets `standing`.
- `musicScore(g, s)` (new) is the standing: `round(0.5 * last release quality (x 0.6 when none in two years) + 0.4 * popularity + 0.1 * fame)`, 0 to 100, read from `viewMusic`, `mdView` and `fameOf`.
- **Imports.** The new modules import `music-job.ts` (new), never `music.ts`. `music-job.ts` is a pure move out of `music.ts` of `Release`, `MusicProfile`, `MusicJob`, `initMusic`, `musicNumber`, `musicText`, `normalizedMusic`, `musicProfile`, `viewMusic`, `musicJob`, `mdView`, `md`, `artistName`, `musicTalent`, `effectiveSkill`, `trendingSubgenre` and `removeBand`, plus (new) `signDeal(g, offer, data)`: the body of `contractScript` extracted, so the legacy script and the new sign handler share it. `music.ts` imports them back and re-exports `musicJob`. `GENRES`, `RELEASE_TYPES` and `CERTS` move to `music-data.ts` (new).

### 4.2 Format eras (`music-data.ts`, `music-market.ts`)

`formatMix(country, year)` (new, pure) returns shares that sum to 1.

- Physical anchors (US year: share, linear between, flat outside) are read at `year - (1 - clamp(wealth, 0.05, 1)) * 12`, so poorer countries lag.
- Download share is its anchor times `min(1, techAdoption(country, 'internet', year) / 0.5)`.
- Streaming share is `techAdoption(country, 'streaming', year)` (0 before 2007, cap 0.85).
- The rest are rescaled to fill `1 - stream`. The dominant format names the release.

| format | US anchors | gross per unit | cost rate | tail k | take per unit, tier 1 |
|---|---|---|---|---|---|
| shellac | 1900:1, 1948:.85, 1962:0 | 7 | .38 | .25 | .69 |
| vinyl | 1948:0, 1958:.6, 1972:.8, 1992:.05, 2008:.01, 2025:.07 | 12 | .34 | .38 | 1.27 |
| tape | 1966:0, 1986:.5, 2002:0 | 9 | .29 | .33 | 1.02 |
| cd | 1982:0, 1999:.85, 2014:.2, 2025:.06 | 8 | .26 | .42 | .95 |
| download | 2003:0, 2010:.25, 2025:.02 | 6.5 | .14 | .42 | .89 |
| stream | `techAdoption` | 6 | .08 | .58 | .88 |

- The table is `FORMATS` (new). A unit is one album-equivalent (1,500 streams). Cost rate folds in pressing, distribution, collection and publishing.
- `unitGross(mix)` = sum of share x gross. `costRate(mix)` is weighted by gross. `k(mix)` is share-weighted. Take per unit = gross x (1 - cost) x 0.16 (the tier 1 royalty).
- Hand-checked snapshots, US, tier 1, as take per unit (lifetime take per unit as a multiple of the legacy 1.3): 1925 shellac .69 (0.71x); 1955 shellac and vinyl .98 (1.10x); 1975 vinyl 1.21 (1.47x); 1995 CD .98 (1.25x); 2008 CD .94 (1.25x); **2026 .92 (1.57x)** with stream .83, vinyl .08, CD .07, download .02.
- All numbers live in `music-data.ts` for one-file tuning. The legacy 1.3 is $1 a unit plus the 15% halving tail (about 0.3 over its life).

### 4.3 The label deal (`music-label.ts`)

**Roster** (`LABEL_ROSTER` (new), all invented, tested against `allBrands()`):

- Tier 0: Garage Door Records (from 1965), Indigo Basement Music (1985).
- Tier 1: Echo Chamber Records (1950), Big Noise Music (1975).
- Tier 2: Velvet Records (1925), Platinum Peak Entertainment (1955).
- Tier 3, majors: Meridian Sound Group (us, 1900), Crown & Anchor Music Group (gb, ca, au, 1900), Pacific Rim Music Co (jp, kr, 1951).
- A tier-0 `${city} Records` floor always exists, so no year and country is empty. `labelsAt(year, country, city)` (new, pure) replaces `LABELS` in `chooseLabel`. Audition need stays `60 + 10 * tier` (tier 3: 90).

**Offer** (`offerDeal(g, offer)` (new)):

- `auditionForLabel` keeps its audition and its advance and term draws unchanged, then calls `offerDeal` instead of queuing `contractScript`.
- Advance = `[25k, 80k, 250k, 750k][tier] * (1 + fame/30 + pop/50) * (0.7 + rand * 0.6) * talentMult(Music, 1.25)`, rounded to 1,000, at most $1.5M a deal.
- Royalty = `0.16 * [0.9, 1, 1.12, 1.25][tier]` (a push adds 0.03, hard cap 0.40). Term 2 to 4 years. Masters stay with the label, and the menu says so.
- If `offerChoice` has no room, the legacy `contractScript` modal is queued instead, so an offer is never lost.

**Negotiation** `career.music.deal` (new, a non-crisis script, three options in this order):

- `sign` Sign the deal, `push` Push for royalty, `walk` Walk away.
- Pure `pushOdds(g, tier)` (new) = `clamp(0.30 + (leverage - need) / 80, 0.10, 0.85)`, with leverage = popularity + 0.5 * fame and need = `40 + 12 * tier`. The resolver rolls `chance(g, pushOdds(...))`.
- A hit adds 0.03 royalty, once per offer. A miss withdraws the offer and cools that label 2 years (`cool['label.<id>']`). `walk` cools it 3 years. `chooseLabel` hides cooled labels, read through `musicStore.peek`.
- `sign` calls `signDeal`, writes the `LabelDeal`, sets `Job.data.contractYears`, `label` and `advancePerYear = 0`, and `job.salary = perYear` for display.

**Yearly deal tick** (`stepDeal(c)` (new), live only, before everything else):

- Pay `perYear` with `c.earn('Label advance', perYear)`. A ledger deal adds it to `unrecouped`; a legacy deal adds nothing.
- `years -= 1`, mirror `contractYears`. Trust +3 if the artist released this or last year, else -4 (0 to 100).
- An `appt` mismatch or a missing job closes the deal with a history row.

**Expiry** (years 0):

- Popularity >= 35 and trust >= 25 opens the renewal on the same screen (`career.music.deal` with `renew`). Royalty +0.02 when `unrecouped` is 0, half of `unrecouped` carries over, advance = the legacy renewal formula `pop^2 * 60 * years * (0.7 + rand * 0.6)`. The 2 to 4 year term and the luck come from `g.rng` in the yearly tick, as the legacy renewal drew them.
- Otherwise `leave(g, 'fired')` and a history row. A renewal that cannot queue waits a year. Declining calls `leave(g, 'quit')`, like `contractRenewScript`.

**Exits** (`endDeal(c, how)` (new)):

- A history row, `unrecouped` forgiven (never a personal debt, never an heir debt), the label cooled 3 years, ledger rows keep paying at their `rate`. `quitMusic` calls it first.
- The legacy `special.music.renew` still resolves a queued old modal. It writes `Job.data`, and the next tick re-derives a legacy-terms deal from it (4.10).

**Release Plan** (`music.plan` (new) row, `career.music.plan` (new) script, options original, cleared, risky):

- Cleared costs `3,000 * (1 + pop/25)` scaled by `typicalIncome / 45,000`, adds 3 quality and x1.04 to `sold`. Risky is free, adds 5 quality and x1.06 to `sold`, and carries the claim risk of 4.7.
- The cost is paid by `c.pay` inside the release and falls back to original when cash is short. The `sold` effect applies on ledger terms only. Menu text is built from the same `planEffect(g, s)` (new), so it never overstates.

### 4.4 Releases, ledger and waterfall (`music-market.ts`)

`bookRelease(c, job, draft)` (new) replaces `earnIncome` in `release()` (564 to 576). The legacy lines for `quality` and `sold` run first and unchanged, and their rng draws keep their order.

1. **Chart.** `base = 0.5 * quality + 0.4 * popularity + 6 if on trend + [1, 2, 4, 5][tier] if signed`. `score = rollScore(g, base)` (the kit's one `randInt(-10, 10)` draw, after the legacy draws). `st = standingOf(g, MUSIC_SPEC, score, s.memory)`. `peak = rank` when `rank <= chartLen`, else 0, with `chartLen = min(20, max(5, round(field / 2)))` and `field = st.of - 1` (the roster can run a few over 40, so the cap is explicit). `s.memory = rememberRivals(s.memory, st, year)` (the kit's `remember`, imported under that alias because `core.ts` has its own `remember`).
2. **Legacy terms** (a grandfathered deal): `sold` is the legacy figure, byte for byte. `share = round(sold * pay / members)` is paid by `c.earn('Royalties', share)`. `Release.royalty` keeps its legacy value. The row is `legacy: true` with `gross = round(sold * pay)`, so a later claim has a base.
3. **Ledger terms:** `sold' = round(sold * reach * chartBonus * plan * mods)`.
   - `reach` is 0.85 unsigned (a band, or a solo with no deal) and 1 signed.
   - `chartBonus = 1 + max(0, chartLen + 1 - peak) / (4 * chartLen)` (up to +25%), and 1 when `peak` is 0.
   - `mods` are the active `units` mods.
   - Format = dominant of `formatMix(country, year)`, `k` = mix-weighted. Rate = `deal.royalty`, or 0.21 unsigned.
   - `Release.royalty` is set to 0, so the legacy tail does not pay twice. The first year settles at once with the same waterfall as the tail.
4. **Waterfall** `waterfall(row, units, mix, deal, members)` (new, pure, shared by the release and the catalogue, so a statement cannot disagree with a payment):

```
gross   = round(units * unitGross(mix) * row.pay)       costs  = round(gross * costRate(mix))
net     = gross - costs                                 pool   = round(net * row.rate)
kept    = net - pool                                    recoup = deal && row.dealId === deal.id ? min(deal.unrecouped, round(pool * 0.8)) : 0
group   = pool - recoup                                 paid   = round(group / row.members)      bandCut = group - paid
identity: gross = costs + kept + recoup + bandCut + paid        cash moves by exactly `paid`
```

5. **Catalogue** (`stepCatalogue(c)` (new), each yearly tick, any job state). For each row not adopted, not legacy, with `lastYear < year`:
   - `units = round(units0 * k^(year - row.year))`, skipped under 50. The waterfall prices at that year's mix.
   - `c.earn('Royalties', paid)`, `deal.unrecouped -= recoup`, `lastYear = year`.
   - Rows keep paying after the deal ends (with no recoup then) and while the job is gone.
6. **Per-unit target.** Tier 1 pays $0.92 a unit in 2026 against the legacy $1.00. Unsigned pays 0.21 x 0.85 x 5.74 = $1.02 per legacy-sold unit, which keeps bands near parity. Lifetime per sold unit across eras is 0.7x to 1.6x of the legacy 1.3, asserted in a test (section 7).

**Worked statement** (2026 US mix, tier 1 royalty 0.16, a solo with $80,000 unrecouped, a release of 100,000 units): gross $661,300 (unit gross 6.613), costs $87,746, net $573,554, pool $91,769, label kept $481,785, recouped $73,415 (80% of the pool), paid to the player $18,354. Check: 87,746 + 481,785 + 73,415 + 18,354 = 661,300. The player's first release of a new deal pays about a fifth of its per-unit take until the advance is recouped, which is the point of the ledger and the first thing the Label & Contract menu shows.

### 4.5 Chart and rivals (`MUSIC_SPEC` in `music-market.ts`)

`MUSIC_SPEC` (new) is a kit `RivalSpec`:

- `career 'music'`, `edges` the nine `GENRES` names, `debutAge [17, 28]`, `length [6, 22]`, `peak [40, 96]`, `foreignShare 0.2`.
- `field(year, country)` = 0 before 1900, else `round(lerp(1900:10, 1930:16, 1955:24, 1975:32, 1995:38, 2015:40) * (0.4 + 0.6 * wealth))`, clamped 0 to 40.
- Rivals are the kit's: named from the country's pool (`namePoolOf`), era-fitting first names, never a brand, no biography. They derive from the family seed, so an heir meets the same acts.

Era rules for what the chart shows and what the player can pick:

- `genreAt(edge, year)` (new) shows `Pop` when `GENRE_FROM[edge]` (new, in `music-data.ts`; `gamedev-data.ts` has its own table of that name) is later than the year (`Rock` 1954, `Reggae` 1964, `Rap` 1979, `Alternative` 1980; `Rock` is a small addition to the digest). A 1930 chart shows no rap act.
- `SUBGENRE_FROM` (new: Rockabilly 1954, Ska 1964, Disco 1974, Punk 1975, Electro 1981, Grunge 1989, Reggaeton 1995, Crunk 1996, Trap 2003, Mumble Rap 2014) filters the subgenre picker and the audition genre pick. Modern lives lose nothing, and the draw count is unchanged.

Standing and memory:

- Standing for the report card and the year row: `standingOf(g, MUSIC_SPEC, musicScore(g, s), s.memory)`.
- Rivals react through the kit's memory (`remember`, `noteRival`, `grudgeBonus`): a rival who beat you or took a dispute grudge scores up to 9 higher against you.
- No hint, menu or sim step reads another year's cohort or a roll.

### 4.6 Touring (`music-tour.ts`)

`music.tour` keeps its id and becomes a `gatedAction` that opens `career.music.tour` (new): one option per open tier. The resolver re-checks every gate and rolls, and calls `useYearAction(g, 'music.tour', 1)` inside itself, so a cancelled picker costs nothing.

| tier (`TOUR_TIERS` (new)) | seats | shows | min popularity | crew | travel a show | production a show | gate |
|---|---|---|---|---|---|---|---|
| club | 500 | 24 | 10 | 4 | $1,500 | $1,000 | open |
| theater | 2,500 | 24 | 30 | 10 | $10,000 | $18,000 | open |
| arena | 15,000 | 30 | 55 | 40 | $60,000 | $180,000 | 1955 on, wealth >= 0.3 |
| stadium | 55,000 | 20 | 75 | 120 | $200,000 | $700,000 | 1965 on, wealth >= 0.5 |

Crew costs $300 a head a show.

**Model** `tourModel(g, s, tier, opts)` (new, pure; `run()` and the hints both call it):

- `fill = clamp((pop + 20 - minPop) / 60 + 0.2 * u + 0.03 * min(3, top-10 peaks in two years) + fill mods, 0.05, 1)`.
- `ticket = (8 + 0.6 * pop) * wealth^0.7 * ticketEra * leisure`. `ticketEra` is 1 rising to 1.35 over 1995 to 2015. `leisure = clamp(economyOf(g, country).sectors.leisure.demand, 0.8, 1.2)`, the reader `music-rights.ts` uses.
- `gate = seats * fill * shows * ticket`. The promoter takes 25% of gate. `merch = heads * (4 + 0.12 * pop) * merchFactor` (0.15 before 1965, 0.6 before 1985, else 1) at 45% cost.

**Settlement:**

- `net = gate - promoter - crew - travel - production + merch - cogs`. The player gets `net / members`; the rest is `bandCut`.
- Net >= 0 is `c.earn('Tour', ...)`. Net < 0 is `c.pay('Tour costs', ...)` up to cash on hand. A loss beyond cash is absorbed by the promoter (a named source in the identity) and cools tours 2 years.
- Identity: `gate + merch + absorbed = promoter + crew + travel + production + cogs + playerNet + bandCut`.
- Preflight inside the resolver: a cash cushion of 10% of costs divided by members, so a tour cannot push cash below 0.

**Luck and incidents** (`g.rng` in the resolver only): `u = rand(g)`, then one roll `x`. Under 0.08 weather (gate x0.94), under 0.14 illness (15% of shows cancelled), under 0.22 surge (fill +0.10). Neither is ever shown or hinted.

**Blocks:** 2020 and 2021 (venues shut), and any year `warsAt(country, year)` has a war with `homeFrontAt`. Each block gives its reason on the row.

**Aftermath** keeps the legacy shape: popularity +2 to 5 on a profit (+1 on a loss), fame +1 or +2, health -3 to -8, happiness +8 (+2 on a loss), `musicProfile(g).tours += 1`, the `special.music.tour75` flag at age 75 and up. A tour row is kept (8).

**Break-even** with u = 0.1, merch factor 1, wealth 1: club about popularity 16, theater 37, arena 60, stadium 76. Below those a tour loses money, and the hint says so. A club tour at popularity 25 nets about $64,000 (legacy $560,000).

### 4.7 Events (`music-events.ts`)

Six events use the kit's `defineCrises({ career: 'music', store: musicStore, talent: 'Music', defs })`: script ids `career.music.<id>`, at most 1 choice a year, `CRISIS_ODDS` 0.35, each option's `odds` the only probability source, stances `safe`, `bold`, `cash`.

- Money moves only through `Effects.money` (the label is the event title). `Branch.then(s, g)` writes record changes (no money, no rng): popularity (on `Job.data`), deal trust, `unrecouped`, mods and awards. A fixed stance with no effect named in the table says so in one line and moves nothing.
- Fees scale with `typicalIncome(g)` (about $45,000 in the US today). Every `weight` is 0 while `g.character.prison`.

| id | weight and gate | stances and odds |
|---|---|---|
| `collab` | 3; popularity >= 25, field >= 8; partner ranked 6 to 24 from `activeField`, picked by the seeded `make` | safe Turn it down (fixed). bold Record the feature: `beatOdds(score, partner, 20)`; good pop +4, fame +3, a `units` mod x1.06 to next year; bad pop -3, grudge +8. cash Sell a verse (fixed): `0.15 * typical * (1 + pop/50)` |
| `award` | 8; the country has a ceremony this year, last year's release has critic (= quality) >= 62, popularity >= 40; cool 1 | safe Attend quietly: `p = w_me / (w_me + sum w_rival)`, `w = exp((x - 60) / 8)` where x is the release quality for you and the nominee's score for a rival, four seeded rival nominees from `activeField`; good fame +6, standing +4, pop +5, an award line; bad fame +2. bold Campaign for votes: `p + 0.08`, costs `0.02 * typical`, same good and bad. cash Skip it (fixed) |
| `festival` | 3; year >= 1967, popularity >= 20, tours open; cool 3 | safe Take the side stage (fixed): `typical * (0.3 + pop/100)`. bold Push for the main stage: `clamp(0.25 + (pop - 40)/100 + 0.1 if a top-10 peak, 0.10, 0.80)`; good fee x4, fame +4, pop +3, a `fill` mod x1.05; bad fame -1 |
| `scandal` | 2; fame >= 20; cool 6 | safe Say nothing (fixed): fame -1. bold Deny it: `clamp(0.35 + pop/200, 0.10, 0.85)`; good fame +2; bad fame -4, pop -5. cash Sell your side (fixed): `0.3 * typical`, fame -2 |
| `clash` | 3; an active deal and `hasTech(g, 'radio')`; cool 4 | safe Cut the radio edit (fixed): trust +8. bold Meet halfway: `clamp(0.5 + (attention - 1)/2, 0.20, 0.80)`; good trust +3; bad trust -6. cash Refuse flatly (fixed): trust -12. `attention = clamp(1 + (score - [38, 52, 66, 74][tier]) / 100, 0.5, 1.3)` |
| `audit` | 2; a ledger deal with `unrecouped > 0` and 2 deal years gone; cool 6 | safe Let it go (fixed). bold Hire an auditor: 0.55 (one constant, `AUDIT_ODDS` (new)); good net back-pay of 8 to 20% of the deal's gross (seeded) minus the fee `4,000 * (1 + tier)`, trust -15; bad pays the fee, trust -15. cash Ask nicely: 0.25; good `unrecouped` x0.9, trust +3; bad no effect |

**Dispute** (custom, `career.music.dispute` (new)):

- It is not in `defineCrises`, because a claim must follow the risk the hint prints and the kit's offer roll would dilute it. It uses the kit's `offerChoice`, `claimChoice`, `rollOption`, `applyEffects` and `careerSay`.
- `claimKind(g, row)` (new, pure, seeded from `${familySeed}|claim|${row.id}|${kind}` plus `outcomeTag`) says whether a row drew a claim. A sample claim needs `samples: 'risky'` and a chart peak, with p = 0.40 for a top-10 peak and 0.15 for a peak of 11 to 20 (no row charts lower than 20). A plagiarism claim has p = 0.04 for any top-10 peak. Only rows one or two years old count.
- `stepDispute(c)` (new) offers it in the yearly tick after the renewal and before the generic crisis. The one choice slot goes to the forced choices first, and a loser waits a year.
- Choices: **Settle** (fixed, pays the claim: 6% of the row's gross for a sample, 15% for plagiarism, at least $3,000 or $10,000 scaled by `typicalIncome / 45,000`). **Fight it** (`winOdds` (new): sample `clamp(0.45 + quality/400, 0.05, 0.95)`, plagiarism `clamp(0.7 - 0.6 * evidence + quality/500, 0.10, 0.85)`, evidence 0.3 to 0.8 seeded; a win pays a fee of 10% of the claim, a loss 1.8x). **Credit them** (fixed: the row's `rate` x0.85 for good).
- The claimant is a named rival from the field. A lost fight adds grudge +10.

**Awards by country** (`CEREMONIES` (new), all invented and tested against `allBrands()`):

- us Golden Record Award 1959 (the existing name), ca Maple Disc 1970, gb Silver Disc 1977, au Southern Cross 1987, jp Sakura Music Prize 1959, kr Hanbit 1992, br Troféu Sol 1990, ng Naija Sound 2000, any other country National Music Awards 1975.
- Before a country's year there is no ceremony. A win writes the line to `s.awards` and calls `count(g, 'awards')`. `discographyMenu` lists it with the legacy `awards`.

### 4.8 Honest hints and text

Purple hints come from `honest(g, 'Music', ...)` or `withHint(talentHint(...))`, so only with the talent:

- **Negotiation `push`:** "About N% to land", `N = round(100 * pushOdds(...))`. The resolver rolls the same function.
- **Every event:** the kit marks `bestStance` with `oddsText` from the option's own `odds`.
- **Tour tier rows:** "Break-even about N a night, you should draw about M", `N = ceil(costs per show / margin per head)`, `M` = heads at `u = 0.1`, both from `tourModel`. The luck draw and the incident roll are never shown.
- **Release Plan risky:** "About N% claim risk if it charts top 10", from the table in 4.7.
- **Chart (menu info):** "You chart about #r today" for everyone. "The act at #r sits near T" only with the talent, from `musicScore` and `standingOf`.
- No hint reveals a rival's next cohort, an incident, a claim roll or another year's trend. The legacy trending-subgenre hint stays.

Text shapes (`docs/VOICE.md` caps; money holes count zero):

- Scene: "Echo Chamber Records offers 3 years, {money} paid yearly, and 16% of net. What will you do?" and "{name} says your hook is theirs and wants {money}. What will you do?" and "You're nominated for the {ceremony}. The show is Saturday. What will you do?"
- Outcome: "{money} royalties. Your label or distributor kept {money}." and, only when a recoup happened, " {money} went to recoup." (a plain "the label kept" would be false for an unsigned artist).
- Log: "I signed with {label} for {n} years."
- Choice labels, all five words or fewer: Sign the deal, Push for royalty, Walk away, Turn it down, Record the feature, Sell a verse, Attend quietly, Campaign for votes, Skip it, Take the side stage, Push for the main stage, Say nothing, Deny it, Sell your side, Cut the radio edit, Meet halfway, Refuse flatly, Let it go, Hire an auditor, Ask nicely, Settle, Fight it, Credit them, Write it fresh, Clear every sample, Skip clearances.

### 4.9 Menus and where they plug in (`music-menu.ts`)

All rows read `musicStore.view`, `standingOf`, `activeField`, `formatMix` and `tourModel`. None writes or draws `g.rng`. Rows that act are kit `gatedAction`s, so the gate and the cost are checked again inside `run()`.

- `music.standing` (new): `standingMenu` with label "Chart standing", income label "Royalties", peers `MUSIC_SPEC` and `musicScore`.
- `music.label` (new) "Label & Contract": label, years left, royalty %, advance paid of total, unrecouped, trust, attention, a "legacy terms" line while grandfathered (the royalty, advance and unrecouped lines are then left out), past deals (8), and one `music.buyback.<rowId>` row per row two or more years old that is not legacy, not adopted and still has 50 or more units next year (the label or distributor holds it).
- `music.charts` (new) "Charts & Finances": this year's top 10 (name, genre through `genreAt`, score), your last peak, the format mix in percent, this year's statement, the ledger (newest 6: units, paid, label kept).
- `music.plan` (new) and `music.tour` (same id as before).

Plug-in points in `music.ts` (line numbers at `eefda33`):

| call site | change |
|---|---|
| `musicJobNodes` (853) | spread the new nodes after the `music.status` info row (859 to 864); replace `tourAction` (903) |
| `discographyMenu` (806) | add the sim awards and the chart peak |
| `quitMusic` (834) | call `endDeal` first |
| `auditionForLabel` (339) | call `offerDeal` |
| `chooseLabel` (361) | use `labelsAt` |
| `release` (564 to 576) | call `bookRelease` |
| `yearlyMusic` (1017) | two guards (4.10) |

No `special.ts` or `menus.ts` edit: `special.ts` already runs `yearlyCareerSims` (`careers2`), and `musicMasterNodes` already serves adopted masters.

### 4.10 Migration, grandfathering and the legacy hook

**`migrate[0]`** (pure, reads `viewMusic`, `mdView` and the job) lifts a legacy musician:

- `migrated false`. A solo job with `label` set, `contractYears > 0` and `advancePerYear > 0` gets `LabelDeal { id: 'legacy', legacy: true, royalty: 1, advance: advancePerYear * years, perYear: advancePerYear, unrecouped: 0, trust: 55, years: contractYears (at most 8), tier: from the roster name (unknown = 1), appt: appointmentId(job) }`.
- Bands and unsigned soloists get no deal. Old discography rows get no ledger row and keep the legacy royalty tail.
- `adoptMusic` is also the first line of `offerDeal` and `bookRelease`, so a life that acts is adopted at once (a brand-new deal needs no legacy to lift). A life that never acts is adopted on its first yearly tick.
- `view` of a legacy life is the legacy state plus this derived record, written nowhere. The first `mut` writes v1 once. The legacy flag is never converted.

**Grandfathered terms** mean, for the rest of the current term only:

- The advance salary keeps paying (now through `c.earn` in `stepDeal`), and releases pay the legacy $1 x `type.pay` with the legacy `sold`. Nothing is recouped.
- At expiry the renewal opens on the new screen with `unrecouped` 0 and royalty +0.02, so the first new deal is not worse than a fresh one.
- A stale legacy modal that resolves later (`special.music.renew`, `special.music.contract`) leaves `contractYears > 0` with no matching deal, and the next tick synthesizes a legacy-terms deal again.

**Legacy hook guards** (`yearlyMusic`, 1017). After `yearlyMusicRights(g)` and `claimYearly`:

```ts
const sim = musicStore.peek(g)?.migrated === true          // (new) read through the store, pure
// solo block, 1048:   if (d.contractYears > 0)   becomes   if (!sim && d.contractYears > 0)
// awards block, 1099: if (latest && ...)         becomes   if (!sim && latest && ...)
```

- When `sim`, the sim owns the deal year and the awards. Popularity drift, the legacy royalty tail, band income and breakup stay legacy.
- The first tick after adoption is legacy in full: the sim adopts and returns, like `actorSim`.
- `music.ts:1102` holds one of the 24 string em-dashes. It stays exactly where it is.

**Sim hook** (`music-sim.ts`): `settleYear({ career: 'music', store: musicStore, incomeLabel: 'Royalties', active: (g) => !!musicJob(g), run, peers: { spec: MUSIC_SPEC, score: musicScore }, crises: musicCrises, prison: 'run' })`, registered as `musicSim` (new) in `kit/careers.ts` after `astronautSim`.

- Run order: adopt (first tick, return). Then, when free and live: `stepDeal`, `stepDispute`. Then always `stepCatalogue`. Then the year row note and the "Royalty Statement" notice (`careerSay`, within the budget of 2 notices). The kit offers the generic crisis last.

### 4.11 Money rules

- **Sources:** fans and platforms (gross), the label (advance, audit back-pay), promoters (gate), event partners and organisers (fees), the promoter (absorbed tour loss).
- **Sinks, each with a named payee:** costs and the label's kept share (inside the waterfall), crew, venues and carriers, lawyers and auditors, claimants, campaign and clearance vendors, the label or distributor on a master buy-back.
- No cash moves except `c.earn`, `c.pay` and `Effects.money`. Nothing in `music-*.ts` calls `earnIncome`, `spend`, `addMoney` or `payForAction`. `music-rights.ts` keeps its own legacy calls and is not scanned.
- **Recoup is a repayment to the label, never income.** Advances are paid yearly, so quitting stops them: there is no lump sum to walk away with. Forgiven balances create no money.
- **Buy-back** (`music.buyback.<rowId>`):
  - Price `max(2,000, row.lastLabel)`, paid by `c.pay('Master buy-back', price)`. Then `adoptMaster(g, spec, price)` (new, in `music-rights.ts`, no import from the music state) creates a released `MusicMaster` asset with `audience = round(1.6 * next year's net)`.
  - The row stops paying through the ledger, and `yearlyMusicRights` pays 75% of its sales from then on. Sale value (`value = audience * 0.8`, sold at 70%) stays below the price, so there is no flip. By hand the purchase pays back within the life only for long-tail rows (about +20% at the streaming tail k of 0.55, about 0% for CD, a loss for shellac), so for the rest it buys control and an asset an heir can inherit. The row shows the price and the expected first payment from the same function.
  - The asset is divisible property and reaches an heir through the existing estate path. Label-held rows end with the life.
- **Taxes:** `earnIncome` feeds `taxableIncome` as today. Tours are taxed on net, never gross. Amounts are constant present-year dollars, and text goes through `money()` at call time, never at module load.

### 4.12 Caps

- Ledger 40 rows, history 8, tours 8, mods 6, awards 24, `memory` 16, `cool` 24, `done` 24 (kit).
- Advance at most $1.5M a deal, royalty 0.05 to 0.40, rate 0.05 to 0.60, 30 shows, `k` 0.2 to 0.7, units under 50 stop paying.
- One release, one tour and one dispute a year (concerts stay two).
- The record stays under 3,000 JSON nodes and 20 KB after 40 simulated years (tested).

## 5. Determinism, saves, voice

- **Determinism.** Rivals, award nominees, event data and disputes come from `seeded` and the family seed (`familySeed`), keyed with `outcomeTag`, so a Time Machine jump rerolls hidden form and never the cast.
- **`g.rng`** is drawn only in actions, scripts and yearly bodies after `claimSettle`: the quality and `sold` draws (legacy, unchanged), the chart noise draw, the push, tour luck and incidents, and event rolls. Menus, hints and peeks never draw it. Catalogue settlement is exact arithmetic with no luck. Lives without a musician job or record are byte-identical (the sim hook is a no-op).
- **Saves.** `SAVE_SCHEMA` stays 2 and no `STEPS` entry is added: the record is an optional flag, normalized by its reader, absent in every old save including `test/fixtures/save-v1.json.gz`. It is owner-stamped (`ownerKey`), versioned, bounded and finite. The legacy `special.music` profile and `Job.data` keep their shape.
- **Voice.** `docs/VOICE.md`: log 90, outcome 120, scene 140 ending "What will you do?", tooltips 120, choice labels five words or fewer and imperative, contractions, no encouragement, no disclaimers, no em-dash or en-dash literal. `voice-guards` caps string em-dashes at 24 and it is exactly 24: this slice adds none and removes none. Real brands appear only in neutral or positive lines. Rival acts carry no biography or brand. Hints say "about N%", never "will".

## 6. Pinned legacy behaviour

Must keep passing unchanged, run singly while building.

- `test/talent-perks.test.ts` describe "Music": "instrument lessons teach faster" (lessons only) and "records come out better and chart higher".
  - The second runs `special.music.title` on a hand-built job (`label: 'Garage Door Records'`, `contractYears: 2`, `advancePerYear: 10_000`) and reads raw `g.flags['special.music'].discography` `quality` and `sold` (gifted `sold` above 1.2x plain).
  - It holds because a grandfathered release keeps the legacy `sold` byte for byte, and the chart draw comes after the legacy draws.
- `test/special.test.ts` "special careers menu" > "lists every special career" (menu id `special.music`, `toContain`, no length).
- `test/fuzz-regressions.test.ts` "a musician's and an esports pro's rows render from a frozen state": a hand-written legacy job (`label: null`) with no sim record renders under `deepFreeze`. Every new row reads `musicStore.view`.
- `test/special-common-safety.test.ts` "does not crash yearly settlement on incomplete legacy career profiles": its key list gains `'music.sim'` (a junk record must not break `yearlySpecial` or menus).
- Rights: `test/gameplay-creative-society.test.ts` describe "owned recordings" (3 tests: "requires ability, funding and real production years; menus are pure", "recoups advances, pays each year once and reverts after five paid years", "does not expose international distribution before the shared radio-era gate") and "passes giving stewardship and retained IP through the real estate flow, not personal training" (an heir keeps the master asset).
- Rights, persistence: `test/gameplay-persistence.test.ts` "handles missing and malformed optional records without creating money or consuming RNG" and "remains bounded over a century of idle and depleted commitments", and `test/gameplay-integration.test.ts` "shows insufficient-funds notices for new funded projects and does not consume their annual slots". `yearlyMusicRights`, `startMusicMaster` and `musicMaster` keep their signatures, their one `randFloat` per released master and their `lastYear` marker.
- `test/voice-guards.test.ts` "em-dashes in strings stay at 24 or fewer".
- `test/careers-balance.test.ts` "has a setup for every registered sim": the registry entry and `CAREER_SETUPS.music` land in one task.
- `test/career-menu.test.ts` "runs from yearlySpecial, after the legacy astronaut hook and before the hustler": it pins the `special.ts` YEARLY text, which this slice does not touch.
- `test/save-schema.test.ts` (SAVE_SCHEMA 2, the v1 fixture) and `test/currency-static.test.ts` (no money text at module load).

Ids kept:

- **Script ids registered:** `special.music.contract`, `.label`, `.soloInstrument`, `.bandJoin`, `.bandInstrument`, `.title`, `.subgenre`, `.type`, `.concert`, `.kick`, `.bandName`, `.renew`.
- **Menu ids kept:** `music.tour`, `music.album`, `music.concert`, `music.practice`, `music.stageName`, `music.discography`, `music.band`, `music.kick`, `music.bandName`, `music.goSolo`, `music.quit`, `music.status`, `music.solo`, `music.bandSearch`, `music.masters`, `music.master.start`.
- **Flags kept:** `special.music`, `special.music.diamond`, `.hoedown`, `.tour75`.
- **New ids:** scripts `career.music.*`, menus `music.standing`, `.label`, `.charts`, `.plan`, `.buyback.<rowId>`.

Test edits (the only ones): `test/special-common-safety.test.ts` (key `'music.sim'`), `test/career-kit.ts` (`CareerId` and `CAREER_SETUPS.music`), `test/career-money-scan.test.ts` (scan `music-*.ts` except `music-rights.ts`), `test/astronaut-flight.test.ts` (one assertion: "is registered after the actor" compares the whole `CAREER_SIMS` id list to `['actor', 'astronaut']`, so a third sim breaks it; it becomes an order check), plus the new files in section 7.

## 7. Tests

Targeted vitest only, fixed seeds, `makeTestGame` and `nextYear` (no `createNewLife` or `ageUp` outside `playCareer`), `deepFreeze` and `voiceProblems` from `test/fuzz-kit.ts` and `test/career-kit.ts`.

- **`test/music-legacy.test.ts` (new, Task 1, written first and run against HEAD).**
  - Golden literals captured before any change: a hand-built legacy solo job over 3 seeds gives the first release's `quality`, `sold`, `earned`, `royalty` and the money delta through `special.music.title`. A 5-year `yearlyMusic` run (called directly, no record) gives the money, `contractYears`, popularity and profile.
  - They must stay identical after every task for a grandfathered job (not the rng position).
  - Also: all 12 legacy script ids registered, the `special.music.contract` accept path produces the same job data as HEAD, and a grep test that no `src/game/special/music-*.ts` imports `from './music'`.
- **`test/music-state.test.ts`.**
  - `normalizeExtra` on null, arrays, NaN, huge numbers, 500-row ledgers and 10,000-character strings is finite and capped. Another owner reads fresh.
  - The legacy job lifts to a legacy deal and `view` writes nothing (JSON equal, `deepFreeze` safe). `mut` writes v1 once and leaves `special.music` byte-equal. Adoption is idempotent. An heir reads an empty record.
  - `SAVE_SCHEMA` is 2. 40 simulated years stay under 3,000 nodes and 20 KB.
- **`test/music-market.test.ts`.**
  - `formatMix` sums to 1 within 1e-9 for 1900 to 2040 in us, ng, in, jp. No streaming before 2007, no shellac after 1962 plus the lag, CD at least 0.5 in 1999 US, poorer countries later. The per-era table of 4.2 by hand.
  - `MUSIC_SPEC`: field 0 before 1900, identical rosters for `x` and `x-g2`, different by country, names not in `allBrands()`, `genreAt` hides rap in 1930. Chart and menu reads leave JSON and `g.rng` unchanged.
  - The waterfall identity and `delta money = paid` over 300 seeded inputs across formats, deals and band sizes. Recoup never exceeds `unrecouped`. The worked statement of 4.4 to the dollar. The lifetime-per-unit bracket (0.6x to 2.0x of 1.3) over formats and tiers. A legacy-terms release equals the golden numbers.
- **`test/music-label.test.ts`.**
  - Roster by year and country (a tier-0 floor always). The `pushOdds` hint equals the resolver over `n = 1500` seeds (tolerance 0.045). A failed push cools the label. Sign writes the deal and the job mirror.
  - The advance pays once a year through `c.earn` and `unrecouped` follows. Renewal carries half. Expiry drops under popularity 35 or trust 25. Exits forgive and write one history row.
  - A stale legacy renewal modal re-derives a legacy deal. `yearlyCareerSims` twice in one tick equals once. A 10-year clone replay is equal.
- **`test/music-tour.test.ts`.**
  - The P&L identity to the dollar and `delta money = playerNet`. The preflight refuses and changes nothing. Blocked in 2020, 2021 and a home-front war year. No stadium in 1960, no arena in 1950.
  - Band split by members. An absorbed loss cools tours. The hint's break-even and draw equal `tourModel` with `u = 0.1`.
- **`test/music-events.test.ts`.**
  - Each of the 6 defs and the dispute, every stance, 40 seeds: no NaN, no negative cash, a stale year, deal or owner is ignored. `assertHonestOdds` (n = 1500, tolerance 0.045).
  - Gates: no clash before radio, no festival in 1950, no award before the country's year. The dispute claim is seeded and stable across calls. At most one popup a year.
  - Every string passes `voiceProblems` (scene ends "What will you do?", labels five words or fewer, no em-dash).
- **`test/music-menu.test.ts`.**
  - A double render of every music menu leaves JSON and `g.rng` unchanged, also frozen.
  - The buy-back charges exactly the price, `musicMaster(a)` is non-null, the row stops paying, and the heir inherits the asset (as `gameplay-creative-society.test.ts` does). The discography menu shows sim awards.
- **`test/music-sim.test.ts` (Task 4).** A no-op without job and record; first-tick adoption leaves the legacy year whole; one settle per (year, age); junk records through `yearlySpecial` and every menu; a release through the ledger matches the audit; the catalogue pays with the job gone and says so once.
- **`test/music-lifetime.test.ts` (Task 9).** Lifetime pay per unit through `bookRelease` and `stepCatalogue` in six US years (0.7x to 1.6x of 1.3); the 40-year record bound through real play; the three spec scenarios; a grandfathered life over its last term.
- **Matrix and docs.** `careers-balance` gains music (steady and reckless, seeds 11 and 12, 10 years). The fixture is an unsigned solo at popularity 0 and fame 0 with no releases, so the idle record, whose `standing` follows popularity, stays still (a band could break up, 2.5% a year, which clears `appt` and changes the record). `docs/ARCHITECTURE.md` gets one short Music 2.0 section.

## 8. Risks and mitigations

- **Balance is the biggest risk.** Targets: $0.92 a unit in 2026 (legacy $1.00), lifetime per sold unit 0.7x to 1.6x of legacy across eras, bands near parity (4.4). Mitigation: all numbers sit in `music-data.ts`, the bracket test fails loudly, and tuning touches `FORMATS`, the base royalty and the tier multipliers, never the legacy `sold` formula.
- **Existing saves.**
  - Labelled lives lose nothing until the term ends, then renew at +0.02 with no balance carried.
  - Honest costs that remain: a 1925 shellac life takes 0.71x per unit, and a recouped advance is no longer free money on top of royalties.
  - Bands and unsigned soloists are not grandfathered (they have no term to run out). Their take is about 0.8x to 1.4x of legacy by era with a longer tail, so the change is small.
  - A new deal's first release pays about a fifth of its per-unit take (the worked statement), because the label recoups first.
  - **Tours drop sharply at low popularity** (legacy about $560k at popularity 25, a club tour nets about $64k), because the legacy tour was the audit's free-money finding. Tours are not grandfathered. The hint and break-even rows say so, and the integration release notes must too.
- **RNG order.** One extra draw per release (the chart noise), after the legacy draws, so the legacy `sold` and quality are unchanged and only later numbers shift. A fixture pinning exact later numbers re-baselines; none is known.
- **Import cycle.** New modules never import `music.ts`. `music-job.ts` is moved first with every test green, then data, state, market, label, tour, events and menu, in that order. A grep test pins it.
- **Legacy guards.** Two guards in `yearlyMusic` are the only legacy-hook change. A JSON-equality test on a no-record life (the hook called directly) pins it, as `hedge-year` does for aging.
- **Money truthfulness.** The year row shows only what the yearly hook moved (advance and catalogue). First-year release income, tours and event money are booked by their own actions, so the card says "Royalties" and never implies total earnings.
- **Hint honesty.** One function per roll (`pushOdds`, `tourModel`, `winOdds`, claim odds, option `odds`). The statistical test flakes about 0.1% unless seeds are fixed, so they are.
- **Names and years.** Rival names may coincide with a real person by chance (no biography). Invented labels and ceremonies are tested against `allBrands()`. Ceremony and anchor years are approximate and used only as gates. A bad name is one line in `music-data.ts`.
- **Time.** Nine tasks. Cut ladder if late: events `festival`, `scandal`, `collab`; then the Release Plan and the claim path; then the Charts menu body; then the buy-back. Never cut state, migration, the ledger and grandfathering, formats, the chart or the tour.
- **Cross-track drift.** Only `special/music*.ts`, `kit/careers.ts` (one entry), four test files, new tests and docs change. Reads are `economyOf`, `techAdoption`, `warsAt` and `homeFrontAt`, all read only.

## 9. Build order

Each task ends with `npm run typecheck` plus the named files run as `npx vitest run --maxWorkers=1 <files>`. Nothing runs the full suite. `LEGACY` = `test/special.test.ts test/special-common-safety.test.ts test/talent-perks-review.test.ts test/fuzz-regressions.test.ts test/voice-guards.test.ts`; the two Music tests of `test/talent-perks.test.ts` run apart as `-t Music` (the whole file takes about 3 minutes and its other tests pin other talents, so it is never run in full here), and the rights suites join in Tasks 1, 8 and 9. The plan has the exact commands. Sonnet for every task (the project `CLAUDE.md`); Opus only for Task 5 or 7 after Sonnet has failed on it, one run at a time. Commits use explicit pathspecs.

1. **Pure move, data, golden pin.** Write `test/music-legacy.test.ts` against HEAD first. Create `music-job.ts` (move, about 200 lines including `signDeal`) and `music-data.ts` (190). `music.ts` imports them back and filters genres and subgenres by year. Check: `music-legacy` plus `LEGACY`.
2. **State and migration.** `music-state.ts` (250), `test/music-state.test.ts`, the `'music.sim'` key in `special-common-safety`. Check: `music-state`, `music-legacy`, `fuzz-regressions`, `special-common-safety`, `save-schema`.
3. **Market.** `music-market.ts` (250): `formatMix`, economics, `waterfall`, `MUSIC_SPEC`, chart, `bookRelease`, `stepCatalogue`; `test/music-market.test.ts`. Check: `music-market`, `music-legacy`.
4. **Sim hook, release wiring and registry.** `music-sim.ts` (90, first with adoption and the catalogue only), the `release` edit in `music.ts`, the `kit/careers.ts` entry, `CAREER_SETUPS.music` in `test/career-kit.ts`, the money scan widening, the `astronaut-flight` order assertion; `test/music-sim.test.ts`. Check: `music-sim`, `music-legacy`, `career-money-scan`, `careers-balance`, `career-menu`, `LEGACY`.
5. **Label.** `music-label.ts` (290): roster, offer, negotiation, `stepDeal`, expiry, `endDeal`, plan, run into the sim. Edits in `music.ts`: `auditionForLabel`, `chooseLabel`, `quitMusic`, the first `yearlyMusic` guard (the deal year), so the guard lands with the code that replaces the line it skips. `test/music-label.test.ts`. Check: `music-label`, `music-legacy`, `talent-perks -t Music`.
6. **Tour.** `music-tour.ts` (170) replaces `tourAction`; `test/music-tour.test.ts`. Check: `music-tour`, `careers-balance`.
7. **Events.** `music-events.ts` (300): six defs, the dispute, awards, registered in the sim, and the second `yearlyMusic` guard (the awards); `test/music-events.test.ts`. Check: `music-events`, `career-crisis`, `voice-guards`.
8. **Menus and legacy.** `music-menu.ts` (200), `adoptMaster` in `music-rights.ts` (about 50), the `musicJobNodes` and `discographyMenu` edits; `test/music-menu.test.ts`. Check: `music-menu`, `gameplay-creative-society`, `gameplay-persistence`, `fuzz-regressions`.
9. **Close.** The lifetime bracket test, the matrix with music, the `docs/ARCHITECTURE.md` section, one pass of `LEGACY`, `save-schema`, `currency-static`, `career-menu`. No release notes, no version bump.
