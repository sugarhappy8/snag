# Area D digest: relationships and people

Read at v4.0.2 (plan-main). Line counts are physical lines.

## 1. WHAT EXISTS TODAY

**Real simulations (stateful, tested):**
- `events/will-*.ts` (2,730): per-relative anger meter (`Person.data.wl`), expectation of inheriting, escalation ladder (cold, gossip, confrontation, estrangement), contests and probate after death. The best relationship model in the repo.
- `events/wealth-*.ts` (4,151): asks by wealth tier, `WealthTies` per person (allowance, loans, boundaries), `entitlement` 0-100 that survives generations. Loans move real `Person.money`.
- `business/nepo-*.ts` (3,580) + `dynasty-ownership.ts` (209): relatives on the payroll. `driveOf`, `aptitudeOf`, `fitOf`, `expectedRating` are pure functions of traits plus a seeded per-person roll. Favoritism (`resent`), the press label, succession, family shares (`familyShares`) with heir routing. This is the model for "personality drives outcomes".
- `love.ts` (3,108): dating to divorce, pregnancy, adoption. `relationships.ts` (3,718): about 60 interactions, yearly drift, partner drama, NPC deaths.
- `npc-lives.ts` (449) + `npc-state.ts` (27): `NpcLife` (education, skill, ambition, debt, housing, moves, bankruptcy, founds a real `BizState` company, ambition 80+ launches a rival). Only for family, friends, lovers.
- `special/kit/rivals.ts` (386): the right pattern. Rivals derive from the family seed per career, country and 5-year cohort (pure, cached, no `g.rng`), with arcs and hidden yearly form; only a 16-row `MemoryRow {met, won, lost, grudge}` is stored. Heirs meet the same names.

**Thin spots (be honest):**
- `Person` (types.ts:378) is a flat record: one `relationship` number 0-100 (374 `addRelationship` call sites), 30 trait words read in only ~50 places, `notes` capped at 12 strings, free-form `data`. No NPC-to-NPC relations anywhere.
- An NPC's spouse is a string (`spouseName`), their kids are a count (`data.kids`); `dynasty-ownership.ts` admits "an NPC's own husband, wife or children only exist as a name and a count". Nieces, in-laws and cousins are not entities (cousins are generated per popup, `wealth-family.ts:52`).
- Throwaway people: dating `Candidate` (love.ts:252), `strangerName()` friends, election opponent is a string (`politics.ts:592`), `Me.rivals` (nation/state.ts:116, 8 max), `Director`, `KeyStaff`, `Manager`, nepo `Outsider`. At least 8 parallel "named person" shapes, none linked.
- Classmates and teachers are deleted when the school ends (`education.ts:877`). Coworkers are filed under a company name string (`contextId`), not an entity. Only boss relationship nudges work outcomes (`workplace/*`). No referrals except gamedev (`gamedev-career.ts:259`).
- Heir hand-over (`life.ts:1360-1420`) rebuilds every Person with `relationship = randInt(55,95)`, clears notes, drops friends, coworkers and enemies.
- Personality: three unconnected vocabularies (Person.traits, `STAFF_TRAITS`, Manager integrity) plus `NpcLife.ambition`. The player has none, only hidden karma, craziness, willpower, discipline.
- No reputation by group (only fame, notoriety, karma, workplace and brand reputation). Rumor (`relationships.ts:2829`) is a button: relation minus 8-15, karma minus 3, no spread. No secrets, no gossip.
- Money: NPC pockets are minted by `randomWealth`; `NpcLife.income` credits `p.money` with no paying employer. Transfers with the player balance; the world side does not.
- Separate popup budgets (wealth 3, nepo 2, will 1) across four yearly hooks (`aging.ts`).

## 2. GAPS vs the owner's asks

1. Relationships are one number plus cooldowns; no memory changes later dialogue or odds.
2. People are not entities that exist once: one banker cannot recur as rival, partner, minister.
3. No life stages for non-intimates; NPC marriages are not entities, so no in-laws or cousins.
4. No reputation by group, gossip, scandal, secrets, favors, feuds; staff loyalty is one number.
5. Personality does not drive choices or the player's text.
6. Relationships do not feed hiring, partners, politics, boards.
7. Heirs lose the social world: wealth passes, friendships and feuds do not.
8. What the player knows about a person is one `close` flag (`npcLifeNodes`).

## 3. DESIGN PROPOSAL: the Society layer (`src/game/society/`)

**3.1 Three tiers, so thousands exist but little is stored.**
- Latent (0 bytes): `latent(familySeed, slot)` is pure, via `seeded()`, never `g.rng`. A slot is (kind, country, cohort year, ordinal): school cohorts, company exec teams, election fields, career rosters, boards, dating pools. It returns `sid`, name, gender, born, axes, base skills, a deterministic life path. Same machinery as `rosterAt`; career rivals and directors become slots.
- Met (about 250 B each, cap 400): stored delta from latent, keyed by `sid`, in `g.flags['society.v1']` (optional, validated, owner-stamped like kit state). Created when the player interacts, hires, is rivalled, researches, or a company or office links them. Evicted by salience (|affection| + resentment + obligation + role weight), never with open debts, spouses, heirs or company links. A 12-byte tombstone (grudge, obligation) keeps the unpaid and the feuding; the same `sid` regenerates identically when met again.
- Intimate: today's `Person` in `g.people` (cap about 80). Add `data.sid`; `createPerson` becomes a wrapper that materializes a slot first, so the 55 call sites keep working. Ids stay per-life; `sid` is stable across heirs and the Time Machine.

**3.2 Personality.** Five axes 0-100: ambition, honesty, empathy, risk, steadiness. The 30 trait words become labels derived from axes (old saves infer axes from traits; no migration write). Readers move over: `NpcLife.ambition`, `Manager.integrity` (= honesty), `KeyStaff.trait`, will-core `temper()`, nepo `driveOf`. Player `persona` is optional, inferred from hidden stats plus counters, nudged 1-3 per choice (capped). It selects narrator pools, sets guilt costs for acting against honesty or empathy, and shapes how NPCs read the player. NPC decisions use their `known` view of the player (no foresight).

**3.3 Relationship state.** `Edge {a, b, trust, affection, respect, resentment, obligation(-100..100), since, last, mem[<=8], lines[<=6]}`. `Person.relationship` stays as the cached summary so tests keep their numbers; `addRelationship` becomes a shim onto affection/resentment. `WealthTies.owes` and `Wl.anger` migrate into obligation and resentment on first read. Memory kinds are an enum (about 40: loan_unpaid, saved_me, hired_me, beat_me, betrayal, cut_from_will). Weights decay unless reinforced; betrayal and rescue are pinned. Dialogue picks callbacks from `mem` and skips keys in `lines` (area E: no repeats). Edges exist player-centred plus structural kin and rival/company links; NPC-NPC edges only for pairs in a feud, marriage or shared company, cap 3 per Met person. Secrets: `{about, kind, severity, heldBy[<=6]}`, cap 40, leak odds from holder honesty, temper and resentment.

**3.4 Life stages.** Latent people are not stepped yearly: `ageTo(sid, year)` replays their deterministic path on touch (school, job, marriage, kids, move, illness, death), forking from stored deltas (hired by you in 2031 changes the path after 2031). Met and Intimate people (about 500 a year, O(1) each) run the `npc-lives.ts` loop on the axes, plus: NPC marriages and kids become real Met records (replacing `spouseName` and `kids`), illness via `npcMortality`, deaths through the existing estate path, notable events offered to news (area E, max 8 a year). Idempotent via a `lastYear` marker.

**3.5 Social acts with consequences** (typed `SocialAct`: preconditions from state, consequence patch, ledger lines). Favor (references, intros, votes, hires; capacity = their reach and wealth, decays). Loan (existing ties plus terms, default, mutual-friend gossip). Betrayal, gossip, scandal (a secret leaks, reputation moves after a delay), reconciliation (`peaceOdds` generalized), mentorship (protege growth capped at x1.15), rivalry and feud (ladder cold, gossip, sabotage, legal, generalized from `Wl.stage`; max 12 live, one popup a year). Staff loyalty: `KeyStaff` and `Manager` read edge plus morale; poaching and whistleblowing from honesty and resentment; wages stay company payroll.

**3.6 Reputation by group.** `rep[group]` 0-100 plus `heat`, groups: family, friends, press, city, country, up to 6 industries (cap 12). Each act has an audience and reach; reputation is the decayed sum of acts that group knows, so leaks matter. Effects capped near plus or minus 15% on odds: CV screening, loan terms, investor appetite, approval, ask frequency. NPCs and companies carry the same record (link `dynamics.ts` brand reputation).

**3.7 Consumers.** Hiring: candidate pools are latent people for that industry, city and year; referrals from edges; ex-coworkers persist and reappear as clients, investors, rivals. Co-founders: complementary skill; honesty and risk drive dispute events; `familyShares` and `executiveEquity` already take ids. Politics: opponents, cabinet, legislators, lobbyists come from slots with party tags, so the 2030 winner is a 2040 minister (area B). Heirs: edges are stored against the ego id; on heir switch kin edges copy at 0.5 of trust and affection, 0.6 of resentment, debts and favors survive via the estate; siblings, cousins and in-laws exist for will contests (extend `will-feud` with NPC-NPC edges).

**3.8 Information (area H).** Per Met person a `known` mask: job, wealth band, axes (confidence 0-3, "seems ambitious" until observed 3 times), secrets, health, ties. Revealed by time together, conversation, news, third parties (reliability by the gossiper's honesty) and research: a background check depends on investigator skill, money with diminishing returns, and time (area C). Generalizes today's `close` flag.

**3.9 Bounds, determinism, conservation.** Under about 250 KB raw: Met 400, edges 1,200, secrets 40, feuds 12, rep 12, memories 8 per edge. Pure reads; writes only in actions and the idempotent yearly step. Time Machine forks via `outcomeTag(g, year)` like `formOf`. Money: only `society/ledger.ts` touches `Person.money` (static scan like `career-money-scan.test.ts`); NPC wealth is latent and enters the world only when it moves; NPC wages need a paying entity (area A); estates settle once. Index `g.people` per year (`applyNpcRivals` scans it per planner call).

## 4. WORK BREAKDOWN

| # | Item | Size | Needs |
|---|---|---|---|
| D1 | Registry kernel: latent slots, `sid`, Met store, eviction, name uniqueness, Person bridge, validators | L | A, K |
| D2 | Persona axes, trait-label bridge, player persona, reader migration | M | D1 |
| D3 | Edge model, memory kinds, `addRelationship` shim, WealthTies/Wl migration | L | D1 |
| D4 | Social acts engine and ledger, feud ladder, staff loyalty | L | D3, A |
| D5 | Life stages: lazy `ageTo`, NPC marriage/kids as entities, illness, estates | L | D1, A |
| D6 | Cast bindings: career rivals, politics, directors, KeyStaff/Manager, coworkers/classmates persistence | L | D1, B, I |
| D7 | Reputation by group, gossip, secrets | M | D3, E, H |
| D8 | Consumers: hiring/referrals, co-founders, endorsements, votes | M-L | D4, J, B |
| D9 | Heirs and dynasty carryover, inheritance fights across NPC-NPC edges (also roadmap C-07) | M | D3, D5 |
| D10 | UI: person profile with known/unknown, relationship web, reputation panel | M | G, H |
| D11 | Dialogue memory callbacks, voice-compliant pools | M | E |
| D12 | Tests: determinism, money scan, 120-year probe, save-size, migration matrix | M | K |

About 20,000 source lines (XL). Slices: (1) D1-D3 behind shims, no behaviour change; (2) D5, D6; (3) D4, D7; (4) D8-D11.

## 5. RISKS

- **Exploits:** favor farming (cap by their reach, decay, one call-in per person per 3 years); marriage for wealth (shown wealth is not spendable); loan-shark spirals; gossip chains (hop cap 2); adopting NPCs to inherit (estates conserved and taxed); mentorship bonus capped.
- **Regression:** `relationship` shim touches 374 call sites and 131k test lines; keep numeric parity and add golden tests for relationships, love, wealth, will, nepo first.
- **Determinism:** latent slots key only on seed and slot, never mutable state.
- **Perf and save:** `g.people` scans; heir whitelist (C-07); Time Machine snapshot budget; one shared popup budget (E).
- **Tests:** `society/` money scan, 120-year seeded long-run (bounds, no NaN, conservation), yearly idempotence, old-save matrix, eviction keeps debts, heir-switch parity.

## 6. OPEN QUESTIONS

1. Visible NPC-NPC web? Default: player-centred plus kin, feuds, company links; shows only what the player knows.
2. Player personality explicit or inferred? Default: inferred, one line of narrator feedback, revealed via H.
3. Notables yearly or lazy? Default: Met and Intimate yearly (cap 500), latent lazy.
4. May family act against the player unprompted (affairs, lawsuits)? Default: yes, within a shared budget of 3 popups a year.
5. Violence or hits against NPCs? Default: out of scope; legal and social consequences only.
