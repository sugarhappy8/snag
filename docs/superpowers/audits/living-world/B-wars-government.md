# Area B digest: wars, geopolitics, nations and government

## 1. What exists today

- `history/events-wars.ts` (526 lines): 67 hand-written `WarDef`s (1899 to 2025) with sides, join years, per-country `DraftRule`, flavor "fronts", `homeFront`, plus peacetime conscription spans. Past years only: `warsAt` returns [] for year >= 2026, and Ukraine and Gaza end at `PRESENT_YEAR - 1`, so 2026 and every future year are peaceful.
- The same wars are restated five more times, unlinked: 226 `'war'` headline rows, asylum rows (`data/immigration-blocs.ts`), oil-shock events (`history/market-events.ts`), a flat +0.3 trade restriction (`economy/trade.ts:105`), trade blocs (`business/market-trade.ts`). No alliance, UN or treaty entity.
- `special/military.ts` (1,082): five branches, ten ranks, pay, medals. Deployment is a minefield pick-a-path popup (one 80% x 40% death roll). The wartime draft (serve, objector, fake medical, flee) follows history. No theaters, command, casualty ledger, veteran benefits, PTSD or war crimes; a general commands nothing.
- Politics 2.0 (`nation/*` 4,600 lines, `special/politics.ts` 2,889, spec 2026-10-13): taxes, budget (`military` line, 1.8% of GDP, 50 to 200%), tariffs, deals, sanctions, export bans, retaliation, legislature odds, graft, coups, trials. **War for a President is one yearly popup** (`drama.ts:82`: mobilize +50% budget, talks, or stay quiet), only when history has the country at war. The player cannot declare war, sign a treaty or use the UN. Portfolios: Finance, Trade, Interior. NPC countries have no leaders or decisions.
- Economy (`economy/*`, 102 countries): history years follow `historicalCycle` data, so real wars' macro effects are already baked in. The future is procedural with no wars (`events-future.ts`: 68 lines in a pool).

Verdict: war is flavor data plus one popup; nations are statistics. Sanctions and tariffs (`nation/trade-policy.ts`) are the only live geopolitics: good plumbing.

## 2. Gaps

1. No nation entity (leader, army, opinion, relations, alliances). 2. No declaration or escalation, for player or NPC. 3. No UN, League, treaty, peacekeeping, tribunal. 4. War is not a state (phase, fronts, casualties, peace, reconstruction). 5. No war economy. 6. Present and future are peaceful. 7. Missing roles: defense and foreign minister, general, arms maker, journalist, protester, spy, investor. 8. Military research tied to nothing. 9. War facts live in six places. 10. No fog.

## 3. Design

**One conflict ledger, derived from the table.** `WarDef` rows stay canon and seed `Conflict` records; headlines, drafts, trade restriction, asylum rows and the President popup become reads of it. Invariant: a life that never touches foreign policy plays exactly as before (a test proves it).

**State** (optional, validated, one flag `world.geo`, SAVE_SCHEMA stays 2, sparse deltas):
- `Nation` (102): era data plus a delta: fictional `leader` {name, party, hawk}, `readiness`, `mobilization` 0-3, `warSupport`, `weariness`, `conduct`, sparse `relations` (|score| >= 15 or shared border, bloc or conflict; 12 per nation).
- `Pact` (defense, non-aggression, arms control, League or UN seat): members, years, clauses; seeded from history (NATO 1949, Warsaw Pact 1955 to 1991, ANZUS).
- `Conflict` (24 active, 60 archived one-liners): sides with join years, phase (tension, crisis, ultimatum, war, ceasefire, peace, reconstruction), intensity, 3 to 5 abstract theaters (names reuse the authored `fronts`; control -100..100, attrition), casualties and displaced as aggregates, `script` and `diverged` flags, cause chain.

**Yearly step** (idempotent, after economy): ensure scripted conflicts; drift relations (trade ties and democracy dampen, arms races and sanctions raise); escalation ladder driven by `hawk`, domestic weakness (diversionary war), pact triggers and deterrence (strength ratio times pact cover); each theater resolves from readiness x size x tech tier x supply (economy `industry` and `energy` availability) x terrain, noise from stable hashes (`economicRoll`), never `g.rng` in reads; then casualties, weariness, opinion (rally +8 max, gone in 3 years), ceasefire hazard (weariness, attrition, strain, UN pressure), peace, reconstruction, archive. At most one war popup a year.

**History versus freedom.** Before 2026 every scripted war happens on its dates for NPCs, and the war overlay is zero unless the player diverged (no double counting). The player gains power only through office. At a decision window (the year before a scripted entry) a President may enter early, late or stay out. A **divergence budget** bounds it: it changes the player's own country (draft, spending, shock, approval, allied momentum) and shifts the outcome date by a few years at most. Other nations' scripted wars still start unless the player built real deterrence over years (budget, pacts, strength ratio): no one-click prevention. 2026 conflicts become `open` (no invented outcome or crash in or before 2026). From 2027 geopolitics is procedural and seeded: pairs with existing tension, fictional leaders, neutral wording, a cap on concurrent wars, no nuclear use ever (a standoff ends in talks or backing down).

**President powers** (extend `powerFor` with `defense` and `foreign`; add Defense and Foreign Minister portfolios):
- Diplomacy: summit, treaties (add non-aggression, defense pact, arms control), embassies, aid; capital cost and an honest probability each.
- Sanctions: unilateral (exists), coalition or UN; asset freezes; arms and oil embargoes.
- Defense: readiness, mobilization, conscription law (your age band and odds replace `DraftRule`), procurement, officers.
- The ladder: ultimatum, deploy, limited strike, blockade, declare war, mediation, ceasefire, peace terms (territory, reparations at most 3% of GDP a year and ending, demilitarization, tribunals).
- War powers: a presidential system may decree a deployment for 2 years at approval and legitimacy cost; a declaration needs a legislature vote with honest odds (reuse `legislature.ts`); parliamentary systems need coalition and confidence; emergency rule decrees it but raises coup, protest and sanction risk.
- UN (League 1920 to 1945, UN from 1946): 5 permanent seats (history table, 1971 and 1991 changes) plus 10 rotating. Resolutions (condemn, sanction, peacekeepers, ceasefire, embargo) pass or are vetoed with shown odds; peacekeepers lower intensity and displacement.

**War economy** (pure overlay through `nationOverlay`/`shock` and `trade-policy`; no new aggregate state):
- Budget: military line passes 200% only in declared war (about 25% of GDP cap); funded by debt (cap 2.5 stays), war taxes (windfall tax exists) or printing (inflation shock, +0.15 max). War bonds: the player lends to the state; principal returns with interest.
- Conscription pulls workforce (unemployment down, wages up, then casualty and veteran cost). Rationing cuts inflation, lowers availability, feeds a black market.
- `industry`, `technology`, `energy` up in combatants and arms suppliers (new arms flow in `economy/trade.ts`); logistics, tourism, banks down; chokepoints via route `restriction`. A `defense` exposure tag joins the market tags; war news uses `marketShocks`.
- Refugees: `displaced` flows to neighbors by relations and immigration openness; hosts gain labor, lose approval in some voter groups; the asylum table becomes derived.

**Roles** (shown odds, real consequences):
- President/PM: all above. Defense Minister: procurement, appointments, conscription bill. Foreign Minister: treaties, UN, summit. Finance Minister: war financing.
- General (military 2.0 on the Careers kit, named rivals): rank sets command size; yearly doctrine (aggressive, attritional, defensive) with odds from theater math; inputs are staff quality, logistics, training, morale; exits: politics, contractor board, court-martial.
- Soldier/draftee: draft popup plus a theater posting, 1 to 3 year tours, wounds, PTSD as a chronic condition, medals, desertion and amnesty, veteran benefits from 1944 (education, pension from `transfers`). Odds come from the conflict's casualty rate, so one function serves player and aggregate.
- Arms maker: defense sector family; contracts bought from the military line (conserved); export licences gated by relations and embargoes; margin caps; plant seizure; selling to both sides is a crime.
- Journalist: verify, publish, self-censor, leak; moves war support within bounds, feeds tribunal evidence, risks capture. Protester: effect only through opinion, arrests by regime. Investor: defense and oil exposure, frozen holdings, bonds; trading ahead of a war decision opens an insider case (existing system, `war` cause).
- Refugee/civilian: displacement, rationing, relatives at war on the same casualty rate (extends `atWar`), asylum odds from host relations. Spy (area I): missions cut the error bar on a target; exposure means incidents.

**Casualties, veterans, courts.** Counts only (killed, wounded, displaced); veterans drive a decades-long transfer cost and a voter group. A conduct slider (restrained, standard, unrestricted) is a policy, not a button; it builds a case file (evidence 0 to 1) that surfaces after defeat or regime change (Nuremberg and Tokyo canon, ICC-style court from 2002).

**Information (H).** Every war number has a truth and a view (estimate, error, age) by channel: news (lagged, biased by media control), briefings (error shrinks with intelligence budget), rumor, spies. Totals are revised years later. Odds shown come from beliefs, labeled "estimate"; the roll uses the truth.

**Tech (C), news (E, G).** `techTier` per nation from military R&D budget, contracts and tech waves (staff quality, ambition, money, diminishing returns); strength effect capped at +-20%. Headlines come from phase changes; a War Record screen and an Annual Report war page.

## 4. Work breakdown

| # | Item | Size | Deps |
|---|---|---|---|
| B1 | Conflict ledger from `WARS`; unify headline, trade, asylum, popup reads; parity tests | L | A, K |
| B2 | Nation entity: fictional leaders, readiness, opinion, relations, Pact data | L | A, D |
| B3 | Tension, escalation, NPC decisions, divergence budget, deterrence | L | B1, B2 |
| B4 | Theaters, casualties, weariness, ceasefire, peace, reconstruction | L | B1, B3 |
| B5 | President and minister actions, war powers, portfolios | L | B3 |
| B6 | UN and League, treaties, tribunals | M | B2, B5 |
| B7 | War economy overlay, bonds, rationing, refugees, market exposure | L | A, B4 |
| B8 | Company effects, defense sector family, licences, embargoes | L | J, B7 |
| B9 | Military career 2.0 (theaters, general, veterans, PTSD, court-martial) | L | I, B4 |
| B10 | Journalist, protester, spy, refugee, investor hooks | XL | I, D, H |
| B11 | Fog of war and channel views | M | H |
| B12 | Military research tier | M | C |
| B13 | War Record UI, charts, Annual Report page, future headlines | M | E, G |
| B14 | Conservation scans, 120-year probes, fidelity and fuzz tests | L | K |

About 22,000 source lines. B1 to B5 give a playable President war loop first.

## 5. Risks

- **Exploits:** war profit via steered contracts (cap by military-line share, margin ceilings, detection rising with profit); insider trades on your own declaration; rally farming (decay, 4-year cooldown, treaty-breaking costs rating); conquest snowball (occupation burden, counterbalancing coalitions); one-click history rewrite (divergence budget, deterrence); reparation loops (one-way, capped, booked once); diplomacy spam (capital cost, diminishing returns).
- **Taste and safety:** non-graphic, aggregates only; no real living leaders; no atrocity button; no nuclear use; no ethnic framing; real present conflicts stay factual headlines; a detail toggle in settings.
- **Save and performance:** capped pair maps, sparse deltas (about 60 KB worst case); the yearly pass touches about 600 watched pairs.
- **Tests:** money scans (bonds, reparations, contracts, aid, frozen assets); casualties equal the sum of person outcomes; idempotent year; old saves load with no ledger; a life without office is byte-identical; 120-year seed probes (war count, debt, inflation, state size); hawk, dove and appeaser modes in `fuzz-politics`.

## 6. Open questions

1. May a President in a real historical year diverge for their own country (stay out of 1941)? Default: yes, within the divergence budget; other nations stay on script.
2. Ongoing 2026 conflicts? Default: `open`, no invented outcome until 2027; player decisions only from office.
3. Content level? Default: no nuclear use, aggregate casualties, a detail toggle.
4. Fog versus the honest-odds rule? Default: odds from what you know, labeled "estimate", rolled from the truth.
5. NPC leaders? Default: fictional everywhere; no real head of state named.
