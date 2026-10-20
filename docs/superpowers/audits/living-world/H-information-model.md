# AREA H: information model (what the player knows, fog, research)

## 1. What exists today

**Verdict: almost fully omniscient.** Fog exists in a few small, unconnected spots; everything else prints the true value.

*Purple hints / talents.* `src/game/talents.ts` (194 lines), `ui/components/TalentHint.tsx` (30). `talentHint()` has 207 call sites in 65 files; 98 test files mention hints. Business hints (`business/util.ts markBest`, `manage.ts`, `market-menu-kit.ts hinting`, `yearly.ts planHint`) run the real optimiser on TRUE parameters (best price, R&D budget with exact odds, best market, board pass odds): an omniscient advisor, not a sharper estimate. Investing hints (`invest/instinct.ts`, 236 lines) read the realised return of g.year+1 and add calibrated noise (picks rise about 6 in 7). Specs call it the only documented foresight exception.

*Exact numbers shown to everyone, no research needed:*
- Market & Competition (`business/market-menu.ts` 746, `market-view.ts` 531, `competition-menu.ts` 308): size "about $X", share to 0.01%, "#3 of 9", HHI, antitrust chance, rival stars, and "Sells: Street Lighting (64)" with each rival line's exact quality. The only fog is a header, `approx()`.
- Scorecards (`scorecard.ts`; AI lab, devices, silicon): "Market 64, best 78, rank 3 of 9". "(modeled)" is a disclaimer for real-brand stand-ins, not uncertainty.
- Rival finances: `economy/menu.ts` Company Watch prints each rival's cash and debt.
- Hiring (`business/staff.ts` 637): interviews list exact "skill 73/100" and the trait ("shady", "nepo"), unlike the money team (`advisors/team.ts`), which already has `claimed` vs true skill.
- People (`ui/components/PersonSheet.tsx`): exact 0-100 bars for an NPC's happiness, health, smarts, looks, 15 personality stats and the relationship feeling. Only cash is gated ("Private" below relationship 35).
- Odds: 81 strings print "% odds/chance" (`rd.ts`, heavy R&D, board votes, `nation/menu.ts` caught/evidence/exposure %).
- Politics: exact approval, legitimacy, fear, security loyalty, capital, heat (`nation/menu.ts` 380). Economy: exact growth, unemployment, inflation, sector flows (`economy/menu.ts`).
- Annual Report: `expectedDemand` is one exact number and the projection sells to it (`yearly.ts reportData`). It is a `calm` model forecast on true parameters, last year's cycle.
- Stocks: true volatility ("swings ~X% a year", `money-stocks.ts`). The free Financial News analyst tip (`investments.ts seededTip`) reads `next.stocks[].ret`, right 2 in 3, with no talent. That contradicts "Investing is the only foresight" (advisor-manager spec D2).
- Careers kit (`special/kit/menu.ts`): exact peer scores and ranks. Crisis odds are already hidden unless the talent hints them (`crisis.ts`).

*Estimate patterns already in the engine (reuse):*
1. VC pitches (`fund-vc.ts`): hidden `q`, gut read with noise, `ddCost` buys "quality lo-hi".
2. `advisors/team.ts`: `claimed` vs `skill`, `advisorCatch`, `managerRead(skill)` (noise falls with skill); a better advisor shows more findings (`review.ts`).
3. `health.ts`: `diagnosed` flag, revealed by a doctor visit.
4. `oddsText` ("about 65%", nearest 5), `Person` "Private" gate, `planFor({calm:true})`.
5. Deterministic noise via `seeded(...)` (never `g.rng`) plus `outcomeTag` for Time Machine forks.
6. R&D pricing rule: cost follows the object studied, not the buyer's cash (`lab-rules.ts`).

*Rivals* (`economic-actors.ts`, `competition-moves.ts`) are statistics (pot x ramp x arc); no rival decision uses an estimate of the player.

## 2. Gaps

1. No estimate type: no value carries freshness, confidence or source.
2. No intel actions (market report, analyst, spy, audit, trade press, informant, event); only VC due diligence and the crooked-manager check.
3. Hints are answers, not sharpened estimates, so talents bypass any research layer.
4. Free analyst tip reads the future (invariant leak).
5. Hiring and NPC sheets reveal hidden quality instantly (no trial, references, reveal over time).
6. Odds are exact numbers in menus; only careers hide them.
7. Rivals neither observe nor misjudge the player; no counter-intel, bluffing, leaks.
8. Public data (macro stats) has no lag or revision; private data (rival cash) is as visible as public.
9. Menus are plain strings (`MenuInfo.text`): no way to show a range or chip.

## 3. Design: the Knowledge System

**Rule.** Every hidden quantity has a TRUE value (stays in the engine, untouched) and a KEY (`mkt:restaurant:us:size`, `riv:<id>:quality`, `ppl:<id>:smarts`, `cand:<id>:skill`, `odds:rd:<id>`, `pol:approval`). The player never reads truth for a hidden key; they read `know(g, key, truth)`, which returns an Estimate `{c, sd, y, src}` (center, relative standard deviation, year observed, source id).

**Defaults (player does nothing).** No stored record gives a *passive read*: `c = truth x exp(sd0 x z)`, z from `seeded(lifeId|key|year)`: stable within a year, so menus stay pure and deterministic. sd0 by visibility class: public/lagged macro 5%, local market 25%, rival product 30%, private rival cash 60%, a person's inner traits word-bands only. Experience tightens it (years in a trade, `yearsKnown`, relationship). Always known exactly: own books (cash, debt, statements, net worth), own products and prices, contracts, laws, posted quotes and rates, past realised prices, size classes (small/mid/major/giant), published leaderboards, headlines, anything directly observed.

**Research.** An intel action writes a record to `g.flags['know']` (optional, validated, 120 keys max, pruned by staleness). Update is an inverse-variance merge of the aged old estimate and the new reading. Reading noise is seeded per (key, year, source), so buying the same source twice in a year returns the same number (no averaging exploit). Every source has an sd floor; only audits, due diligence or ownership get near-exact.

**Sources.** Each is `{domains, cost basis, labor, sd floor, bias, delay, risk}`:
- free signals: news items with an optional structured `sig` (extends `MarketNews`), own experience, conversation;
- trade press subscription (annual, floor 20%); commissioned market report (one-off, 12%); consultant or analyst engagement (8%);
- in-house Intelligence desk: key staff plus a team using the `teamPower` curve from `lab-state.ts`, refreshing the top keys yearly;
- due diligence/audit (deal-bound, 3%, existing `ddCost`, 1-2% of deal);
- private investigator, spy, informant, hired hacker (sd 10 to 5%; heat, scandal, turned-source false data, existing `crime.ts` spy task and insider ledger);
- events and conferences (area F: product teardowns, ticket plus time); relationships (area D: sd by closeness and the contact's role; leaks may open insider cases).

**Cost and dependence.** Price is set by the scope studied (market tier, countries, wage level), never by buyer wealth (R&D rule). Reading sd = base x staffMult(1.5 - quality) x spendMult((spend/ref)^-0.35), floored by source. Do-it-yourself uses a yearly action slot and your smarts/skill. Ambition is the strategy-budget dial (money plus labor-hours). Area C's effort engine supplies inputs and diminishing returns; H defines the output as sd shrink, so invention progress and knowledge are one effort run with different sinks. Fees book as ordinary costs paid to a real consultancy entity (area A), so money-scan tests hold.

**Decay.** The stored center never moves; truth drifts away. Displayed sd = sqrt(sd^2 + (drift x sqrt(age))^2), drift per domain (market size 6%/yr, shares 15%, rival cash 35%, person feelings 20%, politics 25%). Events (rival acquired, scandal) double sd. Heirs keep company-bound records at age +5; personal ones reset.

**Rivals.** `rivalSees(g, rivalId, key)` is a pure seeded estimate of the player (price public, quality 30%, cash 50% unless listed; sd by rival tier and tech). Price wars, raids, copycats and buy-out offers use that estimate, so bluffing, PR, counter-intel and leaks matter. Nothing stored; no AI reads a rival's true hidden state.

**No-foresight.** Estimates read only present or past truth. Forecasts (expected demand, odds) are the existing `calm` model run on estimated inputs. Keep the Investing gut as the single documented exception but fence it: no purchasable source, advisor, fund manager or rival may read next year, and the free analyst tip moves behind the talent or becomes signal-based (tilt, wave stage, announced shocks).

**Talents.** A talent sharpens estimates: passive sd x0.6 and source sd x0.8 on its domain keys (Business: company/market/rival/staff; Investing: securities, valuations, funds; Acting/Modeling/etc.: casting and peers; MainCharacter: all). Purple hints keep the same helpers (`markBest`, `hinting`) but compute on the talent-precision estimate, so they stay honest but can be wrong.

**Showing it without clutter.** One formatter (`know/format.ts`): sd <=6% "$4.2M"; <=15% "about $4M"; <=30% range "$3M to $5M"; beyond that a rating word ("mid-sized", "long shot", "even money", "likely"). Odds default to words; percent (nearest 5) appears with the talent or a research read. A chip (3 dots, plus "as of 2023" only if 2 or more years old) shows on detail rows, never list rows. Add optional `conf?: 0|1|2|3` to `MenuBase` and `MenuInfo` (`types.ts`) and render it in `MenuList.tsx`. Each screen ends with one "Look closer" row listing its intel actions with cost and "sharpens +-25% to +-10%". An Intel Briefing hub lists estimates by freshness, with one-tap refresh and the budget dial.

**Testing and omniscient mode.** `know/mode.ts` holds a module switch `omniscient | fog` (same pattern as `core.ts setMoneyDisplay`). `vite.config.ts` gets `setupFiles` that sets omniscient, so every existing string-matching test passes unchanged (market-screen, scorecard, talent-*, lab-hints match exact text). Fog tests flip it per file. Settings > Information offers Realistic (default) or Exact.

**Migration order (screen by screen).** 1 kernel; 2 Market Overview, Leaderboard, Rival Profiles, Regions; 3 scorecards ("modeled" becomes "published" vs "estimated"); 4 Annual Report demand band; 5 R&D, board, deal odds to words; 6 hiring (resume vs interview vs trial, background check, trait revealed after a year); 7 PersonSheet word ladders and traits revealed one by one; 8 Company Watch and economy with lagged first-print figures; 9 politics (polls with margin, briefings by cabinet quality); 10 investing (ratings, volatility words, equity research, private valuation as appraisal range); 11 careers kit peers; 12 talents and the 207 hint sites.

## 4. Work breakdown

H1 Kernel: Estimate, keys, seeded noise, merge, decay, validators, omniscient switch (M; A, K).
H2 Source registry, intel actions, budget dial, booking, Briefing hub (L; C, A, E).
H3 UI: `conf` chip, formatter, Look-closer rows, Settings toggle (M; G).
H4 Market, competition, rival, scorecard migration (L; J).
H5 Hiring/staff/advisor claimed-vs-true, trial period (M; D).
H6 Odds to words plus research (R&D, board, deals, schemes) (M; C).
H7 People/NPC ladders and trait reveal (M; D).
H8 Investing: analyst fix, fundamentals, research, own valuation appraisal (M).
H9 Politics, macro lag, Company Watch (L; B).
H10 `rivalSees`, counter-intel, leaks, espionage risk (M; B, J).
H11 Talent rework: sharper estimates over 207 hint sites (M; H1).
H12 Intelligence careers: analyst, PI, journalist, spy, rating agency (L; I).
H13 Test harness: setupFiles, fog fuzz, coverage test, grep guard, long-run probe (M; K).

Order: H1+H13 and H3, then H4+H6, H5/H7/H8 in parallel, then H9/H10/H11, H2 grows alongside, H12 last.

## 5. Risks

- Frustration: fog everywhere feels like pixel-hunting; defaults stay readable (words) and research pays visibly.
- Exploits: averaging (blocked by per-source seeds), intel-selling loops, insider trading via informants (route through the insider ledger).
- Real companies: estimates stay stylised; keep "no opinions about real companies" (`seededTip`).
- Test churn: 98 test files mention hints; omniscient default contains it. Needed: coverage test (stated band holds truth about 80%), same-source-same-year equality, no `g.rng` in reads (fuzz `deepFreeze`), no-foresight test, money-scan with fees, long-run probe.
- Save: bounded, optional, SAVE_SCHEMA stays 2. Performance: memoise passive reads per (key, year).

## 6. Open questions

1. Keep the Investing gut as a documented foresight exception? Default: yes, fenced as above.
2. Should hints stay exact-best answers or become honest-but-fallible talent-precision estimates? Default: estimates.
3. Ship the Settings "Exact" mode? Default: yes (accessibility, and tests).
4. Allow illegal intel (spies, hackers) with real prison and scandal risk? Default: yes.
5. Fog strength at start: words only, or +-25% numbers? Default: numbers for own-industry markets, words elsewhere.
