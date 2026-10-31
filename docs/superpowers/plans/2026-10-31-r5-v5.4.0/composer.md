# R5 plan, Offers, reputation, composer (track composer, task prefix O)

> Status: first pass, 2026-10-31. Base: `release/v5.4.0` = main at v5.3.0 (`1c73b31`). Code read at that commit in `/home/user/snag`; nothing under `src/`, `test/`, `scripts/` or `docs/` was edited and nothing was added to git. Plain hyphens only (no U+2014, no U+2013). A task re-greps its anchors before it edits, because other R5 tracks move lines. UNVERIFIED marks a claim I did not check. Section 6 lists the grep or command behind every anchor. Four facts in the roadmap's text for this track are out of date and are corrected where they matter: text draws left `g.rng` in R2-B2, `conversation()` is at line 2361 (not 2291), R3 shipped most of C.10, and `Edge.d` and `Edge.n` exist.

## 1. Track summary

**What ships.** Five items on the R4 base, plus the player-facing half of the persona (X18). Nothing here writes a fixture before its flip task (O14).

| Item | Roadmap | This plan | Tasks | What is left after R3 and R4 |
|---|---|---|---|---|
| D.11 dialogue memory | 800 | 800 | O2, O5 | `conversation()` and `pickTopic()` are one seam (relationships.ts:2353-2412). The store is `Edge.d` (8 topic ids) and `Edge.n` (6 callback keys), written by nobody |
| E.T4 composer, voices | 1,800 | 690 | O3, O4 | R2 and R3 moved the pools onto the text kit (`pickLine`, `stateLine`). Missing: frames, six voices, moods, callback phrases. Content is about 215 lines, not 800 |
| X18 persona, player half | n/a | 710 | O6, O7 | `personaOf`, `nudgePersona`, `inferAxes`, `voiceOf` have no caller; only `axesFromStaff` has one (business/staff-loyalty.ts:52) |
| D.7 reputation, scandal | 1,000 | 1,000 | O8, O9 | R4 owns secrets, `leakPass`, gossip with hop cap 2. R5 adds `rep[group]`, the press pick-up with a delay, and the story that runs |
| E.N5 Tips and Offers | 1,200 | 1,600 | O10, O11, O12 | nothing exists (grep "Tips and Offers" finds one unrelated perk id). Needs a store, a menu, an NPC-firm payer and the expose choices |
| C.10 disclosure feed | 900 | 150 | O13 | R3-F3 and F4 shipped `announceResearch`, `pushFromWave`, `pushResearch`, wave news and the insider rule. Left: facts for the Paper |
| platform | n/a | 320 | O1, O14 | the stamp, three build keys, caps; the flip, the acceptance probe, docs |

Total 5,270 source lines, about 7,050 test lines, about 900 docs lines, 14 tasks (the roadmap gives 15 for all four R5 tracks; the sizes follow the 1,100-line rule and the largest task is 600 lines, Q1). One Opus-fallback task: O8.

**Reads from earlier releases, by exact name.** R2: `moveCash`, `playerPurse`, `firmPurse`, `poolPurse` (cash.ts:135, 58, 104, 119), `outcomeStream`, `emit` (kernel/bus.ts:57), `ModuleDef.facts`, `readFacts`, `rankFirms` (world/firms.ts:82). R3: `stateLine` (text/state.ts:103), `askGapOk`, `notePopup`, `paceKey` (text/pace.ts), `YEAR_LIMITS.choices` (3), `DEFERRABLE_SCRIPTS` (hubs/year-close.ts:35), the wave leaf `pushFromWave`, `pushResearch` (business/frontier-waves.ts:36, 56). R4: `personaOf`, `nudgePersona`, `inferAxes` (world/persona-me.ts:277, 245, 152), `voiceOf`, `VOICES`, `axesFromStaff` (world/axes.ts:220, 202, 191), `axesOfPerson` (npc-state.ts:33), `Edge`, `putEdge`, `readEdge`, `edgesOf`, `memoriesOf`, `MEMORY_KINDS` (41, `heard_gossip` last), `remember`, `memoryOdds` (world/edge-odds.ts:144), `readSocial`, `patchSocial`, `socialOn`, `secretsOf`, `leakPass`, `actRoll` (society/acts.ts:119), the `legalFee` pattern (society/feud.ts:245), `npcCompany` (npc-company-state.ts:6).

**The player sees.** Talks that remember: a topic does not come back with the same person within 8 talks, a sister brings up the unpaid loan once, people speak in six voices and the narrator takes yours. A line now and then about who you are becoming ("I tell fewer lies than I did"). A small guilt when you act against your own honesty or empathy. People who read you from what they have seen. A standing in five groups (family, friends, press, city, country) in words, on the profile and in Tips and Offers. In Tips and Offers: an endorsement from an NPC firm, an interview, a tip from a realized fact, and a reporter at the door with a story about you (deny it, settle, sue, pay for silence, or let it run). Only lives created after v5.4.0 get any of it (Q2).

**State and bundle.** State: the `tips` flag (about 100 nodes), `rep` in the social shard (about 55), `ft` (1), text memory for 12 more pools (inside its cap). `Edge.d` and `Edge.n` sit inside R4's 24,000-node edge budget. About 200 nodes against the 6,000 R5 allotment, which the Paper keeps. Schema stays 3; every field is optional and read by its own normalizer. Bundle, in gzip bytes: about +25,000 (4,940 code lines at the measured 4.1 bytes a line, 330 lines of text at about 14), ceiling +29,000, measured at O14 on the tree after the Bundle track's diet. Levers if the lead needs bytes: the O4 tables as a data pack (needs the pack contract of R5-B1; an async read breaks `conversation()`, so not the default); the Tips screens are menu nodes, so there is no React to make lazy.

**How the house rules are kept.**
- Saves: every new field is optional with its own reader (`ft`, `rep` in world/social.ts and world/rep.ts; `tips` in society/tips.ts; `Edge.d`, `Edge.n` already). Old saves and v5.3.0 stamped saves have none and play unchanged (Q2).
- Determinism: nothing draws `g.rng`. Luck is `actRoll` (the stream `social`; ids `offer.make`, `offer.fee`, `scandal.press`, `scandal.delay`, `expose.deny`, `expose.sue`; no new tag, so no `stream-tap.ts` row and one sentence in docs/STREAMS.md). Text uses the text stream through `pickLine` or a hash (`hpick`). Menus, hints and the composer's reads are pure. Every yearly step is a step of the one `society.acts` entry (stamped by `social.ay`) and has a stamp of its own (`rep.y`, `tips.y`, the state-line record).
- Money: every dollar through `moveCash`, plus one new `moveIncome` in cash.ts that adds the taxable income, with a named counterparty and a token. No `earnIncome`, `spend` or `addMoney` in a new file; `test/social-money-scan.test.ts` gets the new society files. Every payer has a yearly budget: 2% of marketing for an NPC firm; for the player a priced object (a multiple of typical income held to a quarter of cash), never a share of wealth.
- Foresight: nothing reads year+1. A scandal `due` is a stored date compared with `<= g.year`; a firm's marketing is last fiscal year's statement; a tip reads facts dated `<= g.year`; a stored row dated after `g.year` is dropped by its reader.
- Popups: offers and exposes are not family acts (no relative is asked for anything), so they spend nothing of `fam.act` (3 a year). They are bounded by their own rule: one choice popup a year, and only when fewer than `YEAR_LIMITS.choices` (3) unrequested choices are already queued; otherwise the row waits in Tips and Offers. Pace families used: 3 of the 17 left after R4 (2.8).
- Text gates (thin: text-repeat 42 of 42, quiet-acceptance 7.32% of 8%, text-kit 4.7% of 5%): the composer replaces the conversation log line and adds none; persona lines are state lines (a band change, or once in 5 years, three variants); an offer logs only on accept (nine-line pool), a decline logs nothing; a story logs at severity 3 or more from an eight-line pool; the two new notice titles ('Story Ran', 'Reporter Calling') get `NOTICE_WEIGHTS` rows. O5 prints the repeated-line share on the four text-kit lives before and after and fails if it rises. No threshold is moved.
- Seeds: tests use `findSeed(pred)`; no `seed: N` line (`test/seed-pins.test.ts`). Fixtures: no task before O14 changes one, and each task says so.
- Models: Sonnet builds; O8 is the one task with an Opus mark.

## 2. Contracts

### 2.1 The stamp (O1, frozen at its merge)

```ts
// src/game/world/social.ts (R4 file; O1 adds, never renames)
export const FEATURE_BITS: { readonly talk: 1; readonly standing: 2; readonly tips: 4 }   // bit 8 stays unused: the Paper stamps `paper.fx` in its own shard (cross-check C4)
export type FeatureName = keyof typeof FEATURE_BITS
export interface SocialShard { /* v, on, y, fy, ay?, ms? as in R4 */ ft?: number /* 1..7 */; rep?: RepRecord }
export function stampFeatures(g: GameState): void          // called by createNewLife only (life.ts:1025) after stampSocial; reads flagOn('composer'|'standing'|'tips'); writes ft once; idempotent
export function featureOn(g: Pick<GameState, 'world'>, f: FeatureName): boolean   // socialOn(g) and the bit is set; pure, total
// src/game/flags.ts: new build keys composer, standing, tips (default false, ships '5.4.0'); the lead flips them with the version
// src/game/world/rep.ts (O1: types and normalizer only; it imports rows.ts and nothing from social.ts)
export interface RepRecord { v: 1; o: string /* `${generation}:${character.id}` */; y: number /* last year stepped */; g: Record<string, readonly [value: number, heat: number, last: number]> }
export const REP_GROUPS: readonly ['family', 'friends', 'press', 'city', 'country']      // rows ind.<id> are reserved for R6 and R9; 12 rows in all
export function normalizeRep(raw: unknown): RepRecord | undefined; export function repProblems(raw: unknown): string[]
// src/game/world/caps.ts: TALK_CAPS { topics: 8, callbacks: 6, perPersonYear: 3 }, REP_CAPS { rows: 12, step: 12, decay: 0.12, oddsMax: 0.05 }, TIPS_CAPS { open: 6, expiry: 2, popups: 1, pay: 6, choices: 3 }
```

### 2.2 Text: topics, composer, lines (O2 to O4; layer 1 `text/`; `import type` only from world/)

```ts
// src/game/text/topics.ts (O2). Ids are stored in Edge.d, so they never change or move: kid 100-111, gen 200-229, spicy 300-305, adult 400-409; a new topic appends to a class
export type TopicClass = 'kid' | 'gen' | 'spicy' | 'adult'
export interface Topic { readonly id: number; readonly text: string; readonly cls: TopicClass }   // text keeps its era tag ('@1950 ...')
export const TOPIC_COUNT: 58; export function topicTexts(cls: TopicClass): readonly string[]; export function topicById(id: unknown): Topic | null; export function topicIdOf(cls: TopicClass, text: string): number | null
// src/game/text/compose.ts (O3). One text draw per pick; reaction and callback wrap are hashed (hpick): no draw, no pool memory
export type Mood = 'warm' | 'neutral' | 'cool' | 'wary'
export type PartId = 'open' | 'react' | 'tail' | 'call'
export interface TalkIn { narrator: VoiceId; speaker: VoiceId; mood: Mood; rel: string; topic: string; phone: 'none' | 'call' | 'letters'; callback: string | null /* a CALLBACK_PHRASE already chosen */ }
export function speakerVoice(g: GameState, speaker: VoiceId, narrator: VoiceId): VoiceId   // one text draw; the speaker weighs 3, each other voice 1
export function composeTalk(g: GameState, t: TalkIn): { log: string; notice: string }     // base = opener + relation + topic (never longer than the legacy base); then react, call, tail are added only while the text stays within the cap (log 90, notice 120); dropped in the order tail, react, call
// src/game/text/dialogue-lines.ts (O4): OPEN_LINES[voice] (6 each, at most 24 characters; the log uses the first 3, at most 14), REACT_LINES[voice][mood] (3 each, at most 34), TAIL_LINES[voice] (5 each, at most 30), CALLBACK_PHRASE[MemoryKind] (41, at most 40), CALL_WRAP[voice][polarity] (3 each)
```

### 2.3 Talk (O2, O5; society domain, one door `society/contract.ts`)

```ts
// src/game/society/talk-memory.ts (O2)
export function saidTopics(g, p): readonly number[]; export function toldCallbacks(g, p): readonly string[]   // pure; Edge.d and Edge.n of person>player; [] without a talk bit or an edge
export function noteTalk(g: GameState, p: Person, topic: number, callback?: string): boolean   // the one writer, through putEdge; at the talker cap it clears d and n of the least salient other talker once and retries
// src/game/society/talk.ts (O5), exported by contract.ts
export function talkOn(g): boolean   // featureOn(g, 'talk')
export function moodOf(g, p): Mood   // warm at relationship 70 and up, cool under 40, wary when the person is honest (own axis 55+) and reads the player as not (perceived honesty 35 or less), else neutral
export function talkTopic(g: GameState, p: Person, cls: TopicClass): Topic          // not in the last 8 said; falls back to 'gen', then to the least recent
export function talkLines(g: GameState, p: Person, topic: Topic, phone: boolean): { log: string; notice: string; callback: string | null }
```
The callback token is `${kind}.${year}` (32 characters at most, the `Edge.n` token rule).

### 2.4 Persona (O6, O7) and who owns the stored fields

```ts
// src/game/world/persona-read.ts (O6, layer 2): how a person reads the player. Pure
export function perceivedAxes(g: Pick<GameState, 'world' | 'character' | 'flags' | 'year'>, p: Person): Axes   // 50 + (truth - 50) * exposure; exposure = clamp(0.25 + 0.075 * yearsKnown + 0.25 * f / 100, 0.25, 1)
export const READ_FX: Readonly<Record<OddsGroup, Partial<Record<AxisId, number>>>>   // a lead-read table, each entry at most 0.03
// src/game/world/axes.ts (O7 adds): axesOfStaff(s: Pick<KeyStaff,'trait'>): Axes (= axesFromStaff(s.trait)); axesOfManager(m: Pick<Manager,'integrity'>): Axes (honesty = integrity, the rest 50)
// src/game/society/persona-act.ts (O7): NUDGE_SITES (site id -> [axis, by][]), feelAct(g, site): { nudged: number; guilt: number }, GUILT { span: 40, max: 3, year: 4 }
```
**Owners (the question X18 left open).** `persona.me` (four nudges, 40 stamps): written only by `nudgePersona`, called only from `feelAct`; O7 owns it. `effort.you` (the ambition shift) stays with R3's effort module (`effort/persona.ts writeYou`); this track reads `ambitionOf` and writes nothing. `Manager.integrity` and `KeyStaff.trait` stay stored where they are. Their creators are fixed by a token-scan test (`integrity`: business/career.ts:89, board.ts:276, nepo-succession.ts:48 and :91; `trait`: board-ceo.ts:425 and :470, deeptech-found.ts:70, staff.ts:73), so a second writer fails. R5 gives them a read seam only (`axesOfStaff`, `axesOfManager`). The move of storage onto axes belongs to R6 D.6 (Cast and jobs): a KeyStaff or Manager has no `sid` and no Met record until D.6 makes them registry people (X24); before that the axes would be a copy of a copy (Q3).

### 2.5 Standing (O8, O9)

```ts
// src/game/world/rep.ts (O8 adds readers) and world/rep-write.ts (writers; imports social.ts. rep.ts must not import social.ts, or the shard reader and the writer form a cycle)
export function readRep(g): Readonly<RepRecord>   // owner-stamped: another life's record reads as neutral
export function repOf(g, group: string): { value: number; heat: number }; export function repWord(value: number): 'distrusted' | 'doubted' | 'unknown' | 'liked' | 'respected'
export function repOdds(g, group: OddsGroup): number    // within +-REP_CAPS.oddsMax (0.05); for R6 CV screening and R7 approval to call later
export function groupOfPerson(p: Person): 'family' | 'friends' | 'city' | 'country'
export function noteRep(g: GameState, group: string, delta: number, why: string, heat?: number): number   // the one writer; a group moves at most REP_CAPS.step (12) a year
// src/game/society/standing.ts (O8): repYear(g) (a step of society.acts); MEMORY_REP (kind -> group rule, delta and heat per weight), lead-read
// world/edge-odds.ts memoryOdds (O8 extends it; same signature, same TOTAL_ODDS_MAX 0.15 clamp): with featureOn(g,'standing') it adds repOdds and the perceivedAxes term
// src/game/society/scandal.ts (O9): scandalStep(g); the fact social.scandal (added to societyModule.facts)
```

### 2.6 Tips, offers, exposes (O10 to O12)

```ts
// src/game/society/tips.ts (O10). Personal flag `tips` = { v: 1, o: owner, y: last year stepped, rows: TipRow[] (<= 6), pay: [firmRef, year, paid][] (<= 6) }
export type TipKind = 'offer' | 'expose' | 'tip'
export interface TipRow { id: string /* `${y}:${f}:${r}` */; k: TipKind; f: string /* endorse | media | scandal | a TIP_KINDS fact kind */; y: number; d: number /* expiry, or the year a story runs */; r?: string; a?: number; v?: number }
export function readTips(g): readonly TipRow[]; openTip(g, row): TipRow | null; closeTip(g, id): boolean; onAnswer(kind: TipKind, fn: Resolver): void; popupOne(g): boolean; tipsYear(g): void
export function tipsMenu(g): MenuGroup    // Activities > Fame and Media; hidden unless featureOn(g,'tips'); never fewer than two rows (the standing words), for the nav lint
// src/game/cash.ts (O11): export function moveIncome(g, from: Purse, amount, reason: Reason, token?): number   // moveCash to playerPurse, then flags.taxableIncome += what was given
// src/game/npc-state.ts (O11): re-exports npcCompany; adds storeNpcCompany(p, a), so society/seam.ts still imports one life file and society->life stays at 2 (test/layers-baseline.json:92)
// src/game/society/offer.ts (O11): offersYear(g), endorseFee(g, firm), ENDORSE { share: 0.02, cashShare: 0.1, fameMult: 30, floor: 0.05 }
// src/game/society/expose.ts (O12): EXPOSE_TERMS (lead-read); the script `tips.answer` choices deny / settle / sue / silence / run
```

### 2.7 Facts this track emits (a module must declare a kind or the bus drops it)

| Kind | Emitter (task) | Fields | For |
|---|---|---|---|
| `tech.landed` | `pushFromWave`, player side (O13) | `c` field id, `a` market, `v` size, `s` 20 to 90 | the Paper's Tech and Business detectors; a tip |
| `tech.rival` | `pushFromWave`, `by: 'rival'` (O13) | same | the Paper |
| `tech.disclosed` | `pushResearch`, research without a wave (O13) | same | the Paper |
| `social.scandal` | `scandalStep` when a story runs (O9) | `c` player ref, `a` holder key, `v` people told, `s` 40 to 90 | the Paper's player stories (E.N4) |
| `offer.paid` | an accepted endorsement (O11) | `c` firm ref, `a` player ref, `v` dollars, `s` fame | the Paper's Business section |

The Paper track renders these; this track works without it. The names freeze at the merge of O13 and O9 and are listed for the cross-check (Q4).

### 2.8 Pace, pools, streams, reasons, flags, ordering

- Pace families (3 of the 17 left after R4; the Paper and R6 share the other 14): `pop.ask.endorse`, `pop.ask.media`, `pop.ask.scandal` (a storyline: exempt from the 4-year gap, not from the 6-a-life cap). `KEY_RE` and `PaceEngine` already accept `pop.ask.<name>`; `ASK_FAMILIES` is the wealth table, so these three are declared in `society/tips.ts` as `TIP_FAMILIES` and added to the sum in `test/kit-pace.test.ts:67` (events + asks + biz + kit + kin + tips at most 80).
- Pools. The composer uses 12 unnamed `pickLine` pools (6 open, 6 tail; key = pool hash, no family) and `hpick` for the rest, so it takes no slot in the 160-family memory that the 80 pace families already crowd. `defineLines` is allowed only under `text/` (test/text-pick.test.ts); O9, O11 and O12 each add one named pool to `text/pools.ts` (scandal, offer, expose: 5 pools in all), which is 5 of the families the text memory keeps for pools.
- Reasons: none added (64 of 80). Endorsement is `royalty`; settlement, silence and fees are `legal`; each with an explicit counterparty (`firm:<id>`, `person:<id>` or `pool:legal`).
- Build keys `composer`, `standing`, `tips`; flag `tips` is personal (world-flags.ts:93 list); `ft` and `rep` ride the world chunk.
- `society.acts` steps (module.ts:32) after R4: `[serviceDebts, leakPass, mentorSettle, stepFeuds]`. R5 appends in this order only: `repYear` (O8), `scandalStep` (O9), `offersYear` (O11), `tipsYear` (O10), `personaYear` (O6). Each is a no-op unless its bit is set. O1 writes the order into module.ts as a comment so five tasks append at known places whatever order they merge.
- Cycles track (Y): O13 edits `business/frontier-waves.ts`, a leaf that `architecture.test.ts` keeps out of the 59-module cycle, and adds a file under `modules/`. It does not edit `business/tech-waves.ts`, which Y2 edits (one import line). So no ordering is needed. If a later change of mine must touch tech-waves.ts, it lands before Y2, because Y runs last. Nothing else here edits a cycle member; `business/career.ts`, `board.ts` and `staff.ts` are only read by O7's test.

### 2.9 Freeze schedule

O1 (stamp, keys, caps, `RepRecord`) in the first hours; O2 and O3 next (topic ids, the composer signature); O10 (`TipRow`, `openTip`, `onAnswer`) before O9, O11 and O12 start. A name that moves after its freeze makes four tasks rework.

## 3. Tasks

### 3.0 Text draws and the tests that mention `pick`

The roadmap warned that changed text draws shift about 31 test files that mention `pick`. After R2-B2 that is not the mechanism: `pickLine` draws on the text stream (text/draw.ts), never `g.rng`, so a text change cannot move a roll. Today 56 of 741 test files mention `pickLine` or `pick(`. Three rules keep them still.
1. The new text exists only for lives with the `talk` bit, which only `createNewLife` with the build key on can set (default false until the flip). Every test that builds its game with `makeTestGame` or with the social parity kit (`stampSocial` only) sees v5.3.0 text.
2. In O5 the three `chance()` draws of `pickTopic` and every `randInt` of `conversation()` keep their order and count. Only text-stream draws change (3 become 4). `test/talk-parity.test.ts` proves it: bit on against bit off, same seed, 200 talks: `g.rng`, `g.nextId`, relationship, queue kinds and cash are equal.
3. One text family per PR: O5 is the only task that changes a pick of an existing site (the topic, the opener and the tail of `conversation()`). Every other line is a new site.

Tests that run a life through `createNewLife` and compare exact output move at the flip, not before: `golden-digest.test.ts` (`golden-digests.json`, slices text, world, character, rng, people), `r2-codemod-parity.test.ts` (`r2-parity.json`), `kernel-parity.test.ts` (`kernel-parity.json`; the menu trees gain a row), `social-lives-parity.test.ts` (`social-parity-lives.json` and `-deep.json`), `life-pins.test.ts` (`life-pins.json`; UNVERIFIED which blocks start from `createNewLife`), `people-ui-golden.test.ts` (`people-ui-exact.json`, only if a profile row changes), and the gates `text-kit`, `text-repeat`, `quiet-acceptance`, `notice-acceptance` (thresholds, no fixture). The scene-based oracles (`relationship-parity`, love, wealth, will, nepo, heir files) never get a bit and never move. A task that edits an existing test before the flip names it below.

### R5-O1 The stamp, three build keys, caps, the rep shape
- **Goal.** One switch per feature, stamped at creation, and the shapes later tasks share. Nothing visible. **Needs.** R4 merged at F1, the lead task P3 (the three keys and `test/flags.test.ts`) and B3 (the bundle headroom gate).
- **Files.** Modify `src/game/world/social.ts` (`SocialShard` :45, `FIELDS` :66, `normalizeSocial` :110, `socialProblems` :136, `stampSocial` :199, `patchSocial` :218: carry `ft` and `rep`, accept `rep` in `SocialPatch`); `src/game/world/budget.ts` `case 'social'` (:124, a second row `['rep rows', ..., REP_CAPS.rows]` beside `pairs`); `src/game/life.ts` :1025 (`if (flagOn('social')) { stampSocial(g); stampFeatures(g) }`); `src/game/world/caps.ts` after :81; `src/game/world-flags.ts` :93 (`tips`, personal); `src/game/society/module.ts` (a comment with the step order of 2.8). Create `src/game/world/rep.ts`.
- **Interfaces.** 2.1.
- **Steps.** Red: `test/features-stamp.test.ts`. A life made with the three keys on has `ft` 7; a v5.3.0 stamped fixture and an unstamped life have none and `featureOn` is false for each; `stampFeatures` twice changes nothing; an heir of a featured life keeps `ft`; a hostile `ft` (0, 8, -1, 1.5, '7', NaN) reads as no feature; a hostile `rep` (500 rows, wrong owner, NaN) normalizes to at most 12 rows or to undefined; `patchSocial` keeps `ft` and `rep` and still refuses a bad year; `socialProblems` names each fault. Then the code. Then the module comment.
- **Tests.** New: `features-stamp.test.ts` (fast). Edited: `test/world-social.test.ts` (add `ft` and `rep` cases; the unknown-field case at :374 uses `zz` and stays). Fixtures: none move (keys default false).
- **Size.** 260 source, 300 test. **Model.** Sonnet.

### R5-O2 Topic catalogue and the dialogue store
- **Goal.** Give the 58 topics fixed ids and a writer for `Edge.d` and `Edge.n`. **Needs.** O1.
- **Files.** Create `src/game/text/topics.ts`, `src/game/society/talk-memory.ts`, `test/text-topics.test.ts`, `test/talk-memory.test.ts`. No edit to relationships.ts here (O5 does it), so this task adds files only.
- **Interfaces.** 2.2 and 2.3.
- **Steps.** Red. The catalogue holds exactly the 12 + 30 + 6 + 10 lines now at relationships.ts:227-285, in that order, era tags kept (the test embeds the old order; O5 deletes the arrays). `topicById` is total (junk, 1e9, -1, '100' give null). A pin hash of id to text fails when an id moves. `noteTalk` on an edge `person>player` writes `d` (last 8, no repeat, newest last) and `n` (last 6 tokens). A person with no edge writes nothing and answers false. A hostile `d` (200 entries, strings) is cut by the edge normalizer (edges.ts:268). At the talker cap (`EDGE_CAPS.talkEdges` 120, edge-write.ts:333) it clears `d` and `n` of the least salient other talker once and retries, never more than once. `heirEdges` clears both (edge-heir.ts), so an heir starts fresh. Reads are pure under `deepFreeze` and draw nothing.
- **Tests.** New files above (fast). Ceiling row `talk-memory`: 8 topics, 6 callbacks and 120 talk edges whatever is offered, at 100 times the talks. Fixtures: none.
- **Size.** 340 source, 430 test. **Model.** Sonnet.

### R5-O3 The composer engine
- **Goal.** Frames, moods, voices, fitting, one draw per pick. **Needs.** B3 (the bundle headroom gate; the module is pure and needs no other task; `import type` of `VoiceId` from world/axes).
- **Files.** Create `src/game/text/compose.ts`, `test/text-compose.test.ts`.
- **Interfaces.** 2.2.
- **Steps.** Red. The fitting rule: the base (opener, relation, topic) is never longer than the legacy base for the same inputs (the legacy opener 'had a heart-to-heart with' is the longest, 24 characters, so no voice opener passes 24); react, call and tail are added only while the text stays within the cap (log 90, notice 120) and are dropped tail first, then react, then call, never the topic; where the base alone is over the cap (the longest topic with a long relation word, as in legacy) nothing is added. `speakerVoice` over 4,000 seeded draws gives the speaker 3/8 within a tolerance and each other voice 1/8. The same inputs and the same cursor give the same text. The engine moves `textCursor` by 1 for the voice, 1 for open and 1 for tail, 0 for react and call wrap, and draws nothing from `g.rng` or `uid()`. A pool of one line draws nothing (pick.ts `choose`). Distinctness probe: over 6 voices, 4 moods, 58 topics and 41 callbacks at least 5,000 different notices.
- **Tests.** New (fast). No fixture.
- **Size.** 360 source, 480 test. **Model.** Sonnet.

### R5-O4 Voice lines
- **Goal.** The words: 36 openers (6 voices of 6), 72 reactions (6 voices, 4 moods, 3 each), 30 tails (6 of 5), 41 callback phrases (one per `MemoryKind`), 36 callback wraps (6 voices, 2 polarities, 3 each): 215 lines. **Needs.** O3, B8, B9 (the lines are new text and are born under the voice gates).
- **Files.** Create `src/game/text/dialogue-lines.ts`, `test/dialogue-lines.test.ts`.
- **Steps.** Red. Every line through `unitFlags` and `staticLength` (`scripts/voice/rules.mjs`, as test/text-lines.test.ts does). Contractions, no em or en dash, no joke (VOICE.md rule 2), no list of three. Openers at most 24 characters, reactions 34, tails 30, callbacks 40. `CALLBACK_PHRASE` has a row for every `MEMORY_KINDS` entry and the test fails the day R6 appends a kind without one (the rule of `MEMORY_PHRASE`). The six voices are distinguishable: no line is shared by two voices, and no first word is more than 40% of a voice's openers. Era-tagged lines pass the era lint. The task ends with the tables printed in its hand-off and the lead reads the values before the merge (cross-check 3.3, X57).
- **Tests.** New (fast). `voice-guards.test.ts` (em-dash cap 24) is untouched: no dash is written. Gate protection: this file logs nothing by itself.
- **Size.** 330 source (data), 380 test. **Model.** Sonnet.

### R5-O5 The talk glue and the conversation seam
- **Goal.** `conversation()` and `pickTopic()` use the composer and the dialogue store on a life with the `talk` bit. **Needs.** O2, O4, O6 (the `wary` mood reads `perceivedAxes`).
- **Files.** Create `src/game/society/talk.ts`. Modify `src/game/society/contract.ts` (exports) and `src/game/relationships.ts`: delete the four topic arrays :227-285 and read `topicTexts(cls)` inside `pickTopic` (:2353; a module-level call would be an eager read, layer rule d); keep the `chance()` branches in their order, then `talkOn(g) ? talkTopic(...) : eraPick(g, topicTexts(cls))`; in `conversation()` (:2361) the success tail (:2397-2405) becomes `talkOn(g) ? talkLines(...) : legacy`. The legacy body is not edited. `rel.convo.argue` (:2407) is unchanged.
- **Steps.** Red first. `test/talk-legacy-twin.test.ts` holds a frozen copy of the old 58 strings and the old lines; with the bit off, 300 talks on three seeds give the same `g.rng`, log, queue and `textMem` as the twin. `test/talk-parity.test.ts`: bit on against bit off give equal `g.rng`, `g.nextId`, relationships, queue kinds and cash. `test/talk-compose.test.ts`: 30 talks with one person never repeat a topic inside any window of 8; a spicy streak on a 6-topic class falls back to `gen`; a person with a `loan_unpaid` memory of weight 2 or more brings it up and the token is in `Edge.n`, and not again before it leaves the last 6; no callback without a memory; phone and prison forms keep the legacy openers; the text is never longer than the cap unless its base is, and never longer than legacy for the same inputs; `moodOf` gives `wary` only in its stated case. Pool count: after 40 years of a text-kit life at most 12 more `textMem.p` keys than before. Print the repeated-line share of the four text-kit lives before and after; the new share is not above the old.
- **Tests.** New: the three files (`talk-parity` fast). Edited: none expected; `relationships.test.ts:346` and `relationship-parity.test.ts` rows are run and must stay green. Fixtures: none.
- **Size.** 460 source, 640 test. **Model.** Sonnet.

### R5-O6 How people read you, and the lines about who you are
- **Goal.** `perceivedAxes`, the yearly persona line, the narrator's voice. **Needs.** O1, B8, B9 (the state lines are new text and are born under the voice gates).
- **Files.** Create `src/game/world/persona-read.ts`, `src/game/society/persona-feel.ts`, `test/persona-read.test.ts`, `test/persona-feel.test.ts`. Modify `src/game/text/state-table.ts` (8 rows `persona.<axis>.<low|high>`, three variants each, `band: bandBy(...)`, `every: 5`, `gap: 5`; the table lint in test/text-lines.test.ts runs every row for free) and `society/module.ts` (step `personaYear`, last).
- **Steps.** Red. `perceivedAxes` equals the truth at full exposure, 50 at none, and moves with years known and affection; every `READ_FX` entry is at most 0.03. `personaYear` says at most one persona line a year (the axis that moved most), none for an axis within 15 of 50, and after saying it nothing for that key for 5 years unless the band changes. It writes only the state record and one log line, never a number. It is idempotent (a second run in a year adds nothing). A hostile `persona.me` reads as defaults. Lines follow VOICE.md ("I tell fewer lies than I did", not "You have become honest").
- **Tests.** New (fast). Ceiling row `persona-read`: perceived stays 0 to 100 and the read term at most 0.03. Fixtures: none. Text gate: state lines are the protected kind.
- **Size.** 330 source, 420 test. **Model.** Sonnet.

### R5-O7 Nudges, guilt, and the owners test
- **Goal.** Acts move the persona a little and cost a little guilt when they go against it. **Needs.** O1.
- **Files.** Create `src/game/society/persona-act.ts`, `test/persona-act.test.ts`, `test/persona-owners.test.ts`. Modify `src/game/world/axes.ts` (`axesOfStaff`, `axesOfManager`); `src/game/relationships.ts` (one line after the act in `doInsult` :2526, `prank` :2575, `startAssault` :2618, `hug` :2699, `giveMoney` :2811, `rumor` :2896, `makePeace` :3125, and the apologize and agree branches of `rel.convo.argue` :2407); `src/game/society/secret.ts` `betray` :257. Each call is `feelAct(g, 'insult')` and nothing else.
- **Interfaces.** 2.4.
- **Steps.** Red. `NUDGE_SITES` has at most 10 rows, each axis delta within +-3. `feelAct` calls `nudgePersona` once per (axis, reason, year) and never past +-15. Guilt is 0 unless the axis is at least 60 on the side the act opposes, then `round(3 * (axis - 60) / 40)`, at most 3 an act and `GUILT.year` (4) a year (`g.yearActions['guilt']`), applied with `addStat(g, 'happiness', -n)`. Nothing at all without the `talk` bit; no `g.rng`; 1,000 insults in a year cost at most 4. Owners test: a token scan over `src/game` finds `nudgePersona` called only from `persona-act.ts`, `.integrity` assigned only at the four creators and `trait:` only at the four, so a new writer fails.
- **Tests.** New (fast). Ceiling row `guilt-year`: at most 4 points a year at 100 times the acts. `relationship-ratchet.test.ts` counts relationship writes only and these lines add none (run it). Fixtures: none.
- **Size.** 380 source, 520 test. **Model.** Sonnet.

### R5-O8 Standing: reputation by group (Opus fallback)
- **Goal.** `rep[group]` with a yearly step, effects capped at +-15% on odds, a profile section. **Needs.** O1, O6.
- **Files.** Create `src/game/world/rep-write.ts`, `src/game/society/standing.ts`, `test/standing-store.test.ts`, `test/standing-year.test.ts`, `test/standing-odds.test.ts`. Modify `world/rep.ts` (readers), `world/edge-odds.ts` `memoryOdds` :144, `society/module.ts` (step `repYear`, first of the R5 steps), `hubs/people-facts.ts` (the `rep` section, :58), `src/ui/components/PersonProfile.tsx` :91 (replace the placeholder with up to two rows of words).
- **Steps.** Red. `noteRep` moves a group at most 12 a year and keeps 0 to 100. `repYear` reads the memories dated this year on the player's edges (`edgesOf`, `memoriesOf`) and maps each through `MEMORY_REP`: the group is the person's (`groupOfPerson`); a leak adds press and city by the number told; value decays 12% a year toward 50, heat by 40%; idempotent by `rep.y`. A record of another life's owner reads neutral, so an heir starts clean with no change to `continueAsChild`. `memoryOdds` keeps its signature and its clamp: with the `standing` bit it adds `repOdds` (at most 0.05) and the `READ_FX` term (at most 0.03), the total still within +-0.15; without the bit it returns exactly what it did (the table tests of `edge-odds.test.ts` stay green). The four callers (events/will-core.ts:590, events/wealth-core.ts:569, events/wealth.ts:343, society/feud.ts:413) change with no edit. The `rep` section shows words (`repWord`), never numbers.
- **Tests.** New (fast; the 100-year run is in the acceptance). Edited: `edge-odds.test.ts` only if its fixture builds a game with `ft`. Ceiling rows `rep-bounds` (step 12, 12 rows, 1000 times the notes) and `standing-odds` (total 0.15 with 100 memories and the max rep). `MEMORY_REP` and `READ_FX` are printed in the hand-off for the lead (X57). Fixtures: none.
- **Size.** 600 source, 760 test. **Model.** Sonnet; Opus fallback (state spread over four consumers behind one clamp).

### R5-O9 Scandal: the press, the delay, the story
- **Goal.** A leaked secret of severity 3 or more may reach the press; the story runs after one or two turns unless the player answers. **Needs.** O8, O10.
- **Files.** Create `src/game/society/scandal.ts`, `test/scandal.test.ts`. Modify `society/module.ts` (step `scandalStep`; `facts: [..., 'social.scandal']`), `text/pools.ts` (one named pool: 8 story lines and 6 call lines).
- **Steps.** Red. Only a secret with `p === g.year` and `v >= 3` is considered, once (the row id `${year}:scandal:${secret id}` is the guard). Odds `0.2 + 0.12 * (v - 3) + heat / 250` from `actRoll(g, 'scandal.press', id)`. Delay 0 or 1 from `scandal.delay`. The row is an `expose` tip with `d = year + delay`. A row with `d <= g.year` still open runs: press down 4 to 12 by severity, city down 2 to 8, friends and family by whom was told, the fact `social.scandal`, a log line (severity 3 and up), the notice 'Story Ran' for severity 4 and 5. A row the player closed never runs. A future `d` in a hostile save reads as `g.year`. Nothing here writes money. Idempotent by the row id and `social.ay`.
- **Tests.** New (fast). The money ceiling is in O12. Fixtures: none. Text gate: at most one story a year, eight lines, severity 3 and up.
- **Size.** 400 source, 520 test. **Model.** Sonnet.

### R5-O10 Tips and Offers: the store, the menu, the one popup
- **Goal.** The place offers and exposes live, and the rule that one of them a year may ask for an answer. **Needs.** O1.
- **Files.** Create `src/game/society/tips.ts`, `test/tips-store.test.ts`, `test/tips-menu.test.ts`. Modify `society/contract.ts`, `society/module.ts` (step `tipsYear`), `modules/menus-core.ts` (row `one('activities.items', 225, () => tipsMenu)`, near :79), `hubs/sections.ts` :23 (`tips: 'fame'`), `notice-weights.ts` (rows for the two titles).
- **Steps.** Red. `openTip` refuses a 7th row (the oldest informational row goes first, never an expose). Rows expire after 2 years (`tipsYear` is idempotent by `tips.y`). A row dated after `g.year`, a wrong owner, 500 rows or NaN fields normalize to at most 6 valid rows. `popupOne` allows one choice a year (`g.yearActions['tips.pop']`), only when fewer than `TIPS_CAPS.choices` unrequested choices are queued (a read of `g.queue`; a test pins the constant equal to `YEAR_LIMITS.choices`), and checks `askGapOk(paceKey('ask', family))`, then `notePopup`. Priority expose, endorsement, interview. A saturated year (3 queued) offers none; `fam.act` is unchanged by a tips popup (it is not a family act). The popup is a `scriptChoice` of the script `tips.answer` with a source, so the year close keeps and counts it first (it is outside `DEFERRABLE_SCRIPTS`) and never folds a notice before it. `tipsMenu` is pure (twice under `deepFreeze` gives the same JSON), shows the standing words and the open rows with Accept and Decline, and is `visible` only with the `tips` bit. Tree snapshot: the reachable action ids of a life without the bit are unchanged.
- **Tests.** New (fast). Edited: `test/kit-pace.test.ts:67` (adds `TIP_FAMILIES.length`; UNVERIFIED that the sum is 63 before). `notice-weight-table.test.ts` needs no edit (it asks for minimums and for a string literal in src). Ceiling row `tips-caps`: 6 rows, 1 popup, 2 years, at 500 offers a year. Fixtures: none (the menu row is hidden without the bit, so `kernel-parity.json` and `people-ui-exact.json` do not move before the flip).
- **Size.** 520 source, 560 test. **Model.** Sonnet.

### R5-O11 Offers: endorsement, interview, tip
- **Goal.** Money from a real NPC firm, within 2% of its marketing. **Needs.** O10, O8 (press standing scales the fee by at most 15%).
- **Files.** Create `src/game/society/offer.ts`, `src/game/world/firm-pay.ts` (layer 2: the firm's last-year marketing and cash, read raw like firms.ts, no clone; it keeps its own `isRecord` and imports nothing from `business/`, because `world/firms.ts -> business/util.ts` is an upward edge the baseline tolerates and a new file may not add one, layers-baseline.json:33), `test/offer-pay.test.ts`, `test/offer-gen.test.ts`. Modify `src/game/cash.ts` (`moveIncome`, after `payPerson` :190), `src/game/npc-state.ts` (re-export `npcCompany`, add `storeNpcCompany`), `society/seam.ts` and `society/acts.ts` (re-export `firmPurse`, `moveIncome`; acts.ts stays the one file that imports cash.ts), `society/module.ts` (step `offersYear`; `facts: [..., 'offer.paid']`), `text/pools.ts` (one named pool: 9 accepted lines, 6 offer lines).
- **Steps.** Red. The payer is a person with `npcFirmId` from `rankFirms(g).chosen` (form npc), never the player's own company. `budget = 0.02 * lastMarketing`, where lastMarketing is the firm's `details.last.marketing` of fiscal year `g.year - 1` (a firm with none offers nothing). `fee = min(budget - paidThisYear, 0.1 * cash, 30 * typicalIncome * (fame/100)^2)` and nothing below `0.05 * typicalIncome`; `paidThisYear` is read from `tips.pay`, so a second offer in a year from the same firm can use only what is left. Fame at least 20 for an endorsement, 15 for an interview. Accept pays `moveIncome(g, firmPurse(b, id, { tally: false }), fee, 'royalty', token)` with token `offer.endorse:<year>:<8 hex>`, stores the firm back with `storeNpcCompany`, raises fame by 1 to 3 (the `addHidden` limits, at most +4 a year) and adds taxable income (the year's tax rises). `checkLedger` is clean after 40 lives of 60 years. The interview pays nothing and moves fame and press by the player's honesty. A tip is built from a `tech.landed` fact of this or last year (`TIP_KINDS`, append-only) and never from a later one. Luck is `actRoll`. Frequency is printed, not asserted (Q5).
- **Tests.** New (fast; the 60-year money probe is in the acceptance). Ceiling row `endorse-fee`: a fee at most 2% of marketing and a firm's yearly total at most 2%, at marketing 100 times and 100 offers a year. Edited: `test/social-money-scan.test.ts` NAMED list. `money-ratchet.json` unchanged (no raw write). Fixtures: none.
- **Size.** 560 source, 640 test. **Model.** Sonnet.

### R5-O12 Exposes: deny, settle, sue, pay for silence
- **Goal.** The answer to a reporter, with money to named counterparties. **Needs.** O9, O10, O8.
- **Files.** Create `src/game/society/expose.ts`, `test/expose.test.ts`, `test/expose-money.test.ts`. Modify `text/pools.ts` (one named pool: 12 lines).
- **Steps.** Red. Labels at most 5 words ("Deny it", "Settle quietly", "Sue the paper", "Pay for silence", "Let it run"). Costs are priced by the object, never by wealth: settle `0.6 * v` typical incomes to the holder (`personPurse`), silence `1.0 * v` to the holder, a suit `1.5` to `legalPayee(g)` (an NPC firm in a legal trade from `rankFirms` if one exists, else `poolPurse('legal')`, as feud.ts does), each held to a quarter of the cash (as `legalFee` does). One token per (kind, year, row). A denial wins at `0.35 + 0.1 * (press - 50) / 50 + honesty term` from `actRoll(g, 'expose.deny', id)`, and a failed denial costs press 1.5 times the story. Settling ends the story at once with a smaller press cost. A won suit repairs half. Silence writes the memory `kept_secret` on the holder, closes the row and acts against honesty (`feelAct(g, 'silence')`). `Let it run` is the default at expiry. Every choice closes the row and writes memories through `remember`. `EXPOSE_TERMS` is printed for the lead.
- **Tests.** New (fast). Ceiling row `scandal-cost`: a cost at most `5 * typicalIncome` an answer and a quarter of the cash, at net worth 100 times. Fixtures: none.
- **Size.** 520 source, 620 test. **Model.** Sonnet.

### R5-O13 Disclosure feed (C.10)
- **Goal.** Research that reaches the frontier leaves a fact. **Needs.** O1 (and through it B3, the bundle headroom gate). The emit is gated by `featureOn(g, 'tips')` (cross-check C10): without the gate every life that pushes research or a wave would record `world.facts` rows and move the `world` slice of `golden-digests.json` before the flip, which no task before N11 may do.
- **Files.** Modify `src/game/business/frontier-waves.ts` (`pushFromWave` :36, `pushResearch` :56: `if (res.applied) emit(...)`; one import from `../kernel/bus`). Create `src/game/modules/waves-facts.ts` (a `ModuleDef` `world.disclosure`, layer 3, `facts: ['tech.landed','tech.rival','tech.disclosed']`), register it in `modules/index.ts` (the id sorts after `society.acts`), add a `HUBS` row `modules/waves-facts` to `test/hub-entry.test.ts` (a module that registers at load gets one), create `test/disclosure-facts.test.ts`. `tech-waves.ts` is not edited (2.8).
- **Steps.** Red. A new wave of the player's side emits `tech.landed` once, a rival wave `tech.rival`, a size under `EFFORT_WAVE_MIN` (0.2) `tech.disclosed`; a repeat, a refusal, a history kind and a year up to 2026 emit nothing; severity from size (20 to 90); the bus drops a kind nobody declared (the test removes the module and reads `busStats().dropped`); the facts store keeps first arrivals, 12 a kind-year (facts.ts), so a flood stops there; a life without the `tips` bit emits nothing and its `world` JSON equals the same life on the base commit (the digest slice test: `golden-digest.test.ts` stays green); the leaf stays out of the cycle (`architecture.test.ts` green, baseline unchanged). Dropped, and why: the economy receipt for a small disclosure (the economy module is in the 59-module cycle, so the leaf could not import it, and a wave under 0.2 has no demand effect by D17); `hasTech` for fictional future techs (148 call sites, calendar-pure, waits for the C.8 domains in R9); poaching (the destination of a poached person is not an entity until R6 A.K3).
- **Tests.** New (fast). `kernel-parity.test.ts` pins hook order and menus, not the fact list, and the new module has no yearly entry, so `log-view.test.ts:87` is unaffected (run both). Fixtures: none.
- **Size.** 150 source, 260 test. **Model.** Sonnet.

### R5-O14 The flip rehearsal, the acceptance probe, docs
- **Goal.** Prove the track whole, list what moves, write it down. **Needs.** O1 to O13.
- **Files.** Create `test/r5-composer-acceptance.test.ts`, `docs/COMPOSER.md`. Modify `docs/SOCIAL.md` (sections 22 to 24 after :885), `docs/ARCHITECTURE.md` (society section), `docs/STREAMS.md`, `docs/SAVE.md`, `docs/LEDGER.md`, `docs/VOICE.md` (the six voices, the fitting rule), `docs/CI.md`, `docs/QUIET.md`, `docs/PEOPLE.md` (the owner paragraph, :303). Check that all 8 ceiling rows exist in `test/ceiling-list.json` and `test/ceiling-kit.ts`: `talk-memory`, `persona-read`, `guilt-year`, `rep-bounds`, `standing-odds`, `scandal-cost`, `tips-caps`, `endorse-fee`.
- **Steps.** The acceptance (in the style of `social-acceptance.test.ts` and `social-accept-kit.ts`): three lives with the three keys forced on for 120 years, continued at year 60 by `structuredClone`, a JSON reload and a Time Machine jump; the first two end at the same JSON; `checkLedger` is clean every year; no NaN; the world stays under `WORLD_NODE_CAP`; `tips`, `rep` and `Edge.d` stay bounded. The v5.2.0 (`save-v5.2.0-social`) and v5.3.0 (`-heavy`, `-stamped`) fixtures load and play 5 years with every bit unset and produce no `Edge.d`, no `rep`, no tip and no composed line. A hostile `tips`, `rep`, `ft` and `Edge.d` load and render. Gates with the keys forced on: `text-kit` (repeated share, shared openers, popups), `text-repeat` (42 of 42), `quiet-acceptance` (worst life at most 8%), popups a year, a person's last 8 topics distinct, a popup family at most 6 a life with gaps of 4 or more. This task does NOT flip or re-record (cross-check C3): it runs the rehearsal on a scratch tree with the three keys forced on, prints, from a composer-only pass (its three keys forced on, `paper` off), which slices of `golden-digests.json` move (expected: `text`, `world`, `character`, `rng`, `people`, `flagsPersonal`; `assets`, `economy` or `flagsWorld` moving is unexpected and stops the flip) and which of `r2-parity.json`, `kernel-parity.json`, `social-parity-lives.json`, `social-parity-lives-deep.json`, `life-pins.json` and `people-ui-exact.json` would move and why, and hands that list and the reasons to the lead task N11, which sets the defaults, bumps the version and re-records once for the whole release. Measure the gzip delta with `npm run size` and report it against +29,000.
- **Tests.** New (there is no `ci: deep` marker in the repo: the years come from an environment variable read the way `old-saves.test.ts:38` reads its own, default 20 for a pull request; the nightly row is added to the `deep` matrix of `.github/workflows/nightly.yml`, to `nightlySizes` in `scripts/nightly-lib.mjs` and to `test/nightly-workflow.test.ts`, which pins the YAML against it, so those three files are edited by O14 and `docs/CI.md` says so). **Size.** 60 source (flag defaults), 520 test, about 900 docs. **Model.** Sonnet.

## 4. Risks

1. **The conversation seam.** If a refactor reorders a `chance()` in `pickTopic`, every seeded life moves. Mitigation: the legacy twin and the bit-on parity test run first in O5; the branches are kept as they are.
2. **`memoryOdds` has four callers.** The extension changes odds in the will, wealth, ask-weight and feud code at once, for lives with the bit. Mitigation: same signature and clamp, the bit off returns the old number exactly, and O8 is the Opus-fallback task.
3. **Talk memory is scarce by design.** `Edge.d` and `Edge.n` live on 120 edges at most, so in a large cast most people have none and fall back to the global pick window, which does not guarantee distinct topics per person. The text-kit lives are small casts. The limit is stated in docs/COMPOSER.md.
4. **Offers are rare.** The payer must be a real NPC firm, and few lives have an NPC firm and fame together. This is the rule, not a defect (Q5); the frequency is printed.
5. **Thin text gates.** 42 of 42, 7.32% of 8% and 4.7% of 5% leave little room. O5 measures first; a rise fails the task. Nothing adds a log line without a pool of 8 or more or a state line.
6. **Five tasks append to the `society.acts` steps and to `contract.ts`.** The order is fixed in 2.8 and each adds one line; conflicts are textual only. `society/module.ts` and `contract.ts` merge serially inside the track.
7. **Cross-track names.** The Paper track must read `tech.*`, `social.scandal` and `offer.paid` and add its own bit (8). If it renames a kind, O9 and O13 rework. The cross-check settles it before O9.
8. **Two kinds of life.** A life from v5.3.0 never gets the composer, standing or tips. This is intended (Q2) and goes in the release notes.
9. **The NPC firm record is written in place.** `storeNpcCompany` replaces `p.data.npcCompany` as `npc-lives.ts:133` does; the firm's float cash and the ledger's whole dollars differ by under a dollar, the slack cash.ts already documents.
10. **Bundle.** About +25,000 gzip bytes; the Bundle track's baseline re-capture decides whether that fits the new allowance (Q6).
11. **A tips popup beside three family choices.** Not a family act, so `fam.act` is untouched, but the year close keeps non-deferrable choices first. `popupOne` therefore checks the queue; the saturated-year test in O10 proves it.

## 5. Questions

| # | Question | Default | Who decides |
|---|---|---|---|
| Q1 | Task count: 14 against the roadmap's 15 for all of R5 | keep 14; the lead may merge O1+O2, O6+O7, O9+O12 | lead |
| Q2 | Do v5.3.0 stamped lives adopt the composer (text only, no `g.rng` change)? | No. Only lives created after v5.4.0 (the `ft` bits), so every old fixture plays unchanged | lead; the owner reads it in the release notes |
| Q3 | Who moves `Manager.integrity` and `KeyStaff.trait` onto axes? | R6 D.6 (Cast and jobs); R5 gives the read seam and the writers test | lead |
| Q4 | Fact kinds and the bit for the Paper | `tech.landed`, `tech.rival`, `tech.disclosed`, `social.scandal`, `offer.paid`; bit 8 and its key are the Paper's | lead at the cross-check, before O9 |
| Q5 | Offers only from a real NPC firm makes them rare. Accept it? | Yes (the rule is the acceptance line); a brand pool with a capped mint stays declined | owner |
| Q6 | The +25,000 gzip bytes against the post-diet allowance | Measure at O14; the O4 tables are the lever | lead with the Bundle track |
| Q7 | Reputation consumers wired in R5 | `memoryOdds` only (repay, peace, ask). CV screening (R6 D.6), approval (R7), investor appetite (R9) call `repOdds` later. Industry rows reserved, not written | lead |
| Q8 | Three build keys or one | Three (`composer`, `standing`, `tips`), flipped together; the lead can ship one dark | lead |
| Q9 | Endorsement income taxable | Yes, through `moveIncome` | lead |
| Q10 | Tips and Offers placement | Activities > Fame and Media, one row | lead |
| Q11 | Topic content | 58 topics, no new ones; the ids leave room to append | lead |
| Q12 | Who runs the flip | Settled: the lead task N11 (one commit for the whole release); O14 supplies this track's list and reasons and re-records nothing | lead |
| Q13 | The tables `EXPOSE_TERMS`, `MEMORY_REP`, `READ_FX` and the line tables of O4 | the lead reads the printed tables at each merge | lead |

## 6. Plan against code

| Claim | Where (checked at 1c73b31) | Command |
|---|---|---|
| Branch and head | release/v5.4.0, 1c73b31 | `git rev-parse --short HEAD; git branch --show-current` |
| Topic arrays and opener list | relationships.ts :227 KID, :241 TOPICS, :273 SPICY, :274 ADULT, :287 OPENERS; 12+30+6+10 = 58 lines | `grep -n "^const TOPICS\|^const OPENERS" src/game/relationships.ts` |
| `pickTopic` three `chance()` branches | :2353-2359 | `sed -n 2353,2360p src/game/relationships.ts` |
| `conversation()`, success tail, argue script | :2361-2412, `randInt(3,8)` :2397, `rel.convo.argue` :2407; action def :3270; `limit(...,3,...)` :2362 | `grep -n "function conversation\|rel.convo.argue\|conversation: ()" src/game/relationships.ts` |
| Act sites for nudges | doInsult :2526, prank :2575, startAssault :2618, hug :2699, giveMoney :2811, rumor :2896, makePeace :3125 | `grep -n "^function doInsult\|^function prank\|^function startAssault\|^function hug\|^function giveMoney\|^function rumor\|^function makePeace" src/game/relationships.ts` |
| Legacy text is `pickLine` and `eraPick` on the text stream | text/pick.ts `choose`; events/era.ts:115 | `sed -n 60,90p src/game/text/pick.ts` |
| Text draws never touch `g.rng` | text/draw.ts `textRand` | `grep -n "g.rng" src/game/text/draw.ts` |
| Relationship parity rows hold no text | relationship-parity.test.ts header; row `act|parent|25|3-2026|conversation` = [28], rng, nextId, ["notice"] | `sed -n 1,12p test/relationship-parity.test.ts` |
| `Edge.n`, `Edge.d`, caps, cleaners | world/edges.ts :54-55 fields, cleanTokens :259, cleanTopics :268; TOPIC_MAX 9999, TALK_KEYS 6; talkEdges 120 at caps.ts:81, edge-write.ts :333 and :426 | `grep -n "TALK_KEYS\|TOPIC_MAX\|talkEdges" src/game/world/*.ts` |
| 41 memory kinds | edge-memory.ts :28 `const KINDS` (`heard_gossip` last) | `sed -n 28,34p src/game/world/edge-memory.ts` |
| `memoryOdds` and its callers | edge-odds.ts :144, TOTAL_ODDS_MAX :38; callers will-core.ts:590, wealth-core.ts:569, wealth.ts:343, feud.ts:413 | `grep -rn "memoryOdds" src/game --include=*.ts` |
| Persona has no caller | persona-me.ts :152 :245 :277, axes.ts :191 :202 :220; only staff-loyalty.ts:52 calls `axesFromStaff` | `grep -rn "personaOf\|nudgePersona\|voiceOf\|axesFromStaff" src --include=*.ts` |
| Social shard fields and writers | social.ts :45 SocialShard, :66 FIELDS, :110 normalize, :199 stamp, :218 patch | `grep -n "^export\|^const FIELDS" src/game/world/social.ts` |
| Stamp site | life.ts :1025 `if (flagOn('social')) stampSocial(g)` | `grep -n "stampSocial" src/game/life.ts` |
| Build keys and rule | flags.ts :27 FLAG_DEFS, social :52, peopleProfile :56; test/flags.test.ts :89 | `sed -n 27,60p src/game/flags.ts` |
| Society steps and module | society/module.ts :32 steps, :47 societyModule, facts `social.leak`, `social.feud` | `sed -n 28,52p src/game/society/module.ts` |
| `leakPass`, `leak()` | secret.ts :304, :266 (sets `p`, hits, log, notice, fact) | `sed -n 266,300p src/game/society/secret.ts` |
| `actRoll` is the stream `social` | acts.ts :119 | `sed -n 116,122p src/game/society/acts.ts` |
| Pace: 80 families, `kin` closed list; the sum test | pace.ts :23 PACE, :43 KIN_FAMILIES; test/kit-pace.test.ts :63-67 | `sed -n 60,68p test/kit-pace.test.ts` |
| `defineLines` only under `text/`; 39 uses in src | test/text-pick.test.ts; pools.ts header | `grep -rn "defineLines(" src --include=*.ts \| wc -l` |
| Pool memory is LRU at 300; families 160 | memory.ts :14 TEXT_MEM_LIMITS, :206 `rememberPool` | `sed -n 14,34p src/game/text/memory.ts` |
| State lines: `stateLine`, `every`, `gap`; table lint | text/state.ts :20, :103; state-table.ts :85 row shape; test/text-lines.test.ts `lintStateRow` | `sed -n 85,90p src/game/text/state-table.ts` |
| Layers: `text` is layer 1, `world` 2, `society` and root files 3 | test/layer-kit.ts :59-93 | `sed -n 58,94p test/layer-kit.ts` |
| `society->life` is 2 | layers-baseline.json :92 | `grep -n "society->life" test/layers-baseline.json` |
| Money door and purses | cash.ts :58 playerPurse, :104 firmPurse, :119 poolPurse, :135 moveCash; core.ts:134 `earnIncome` adds taxableIncome | `grep -n "^export function" src/game/cash.ts` |
| NPC firm shape and store | npc-company-state.ts :6 (clone), npc-lives.ts :133 storeCompany, :225 npcBusinessYear, :509 `firmPurse(b, a.id, {tally:false})`; `BizState.last: Statement` state.ts :422, `Statement.marketing` :240 | `grep -n "storeCompany\|tally: false" src/game/npc-lives.ts` |
| NPC firm index | world/firms.ts :82 `rankFirms` (form `npc`, owner, person) | `sed -n 82,112p src/game/world/firms.ts` |
| Reasons: 64 of 80; `royalty` and `legal` exist | kernel/reasons.ts REASONS | bundle `reasons.ts` with esbuild and count `Object.keys(REASONS)` (done: 64) |
| Feud fee pattern | feud.ts :245 `legalFee`, :262 `payLawyers` (`moveCash` to `poolPurse('legal')`) | `sed -n 245,264p src/game/society/feud.ts` |
| Money scan covers society/ | test/social-money-scan.test.ts NAMED list | `sed -n 28,50p test/social-money-scan.test.ts` |
| Year close limits | hubs/year-plan.ts :30 YEAR_LIMITS choices 3; year-close.ts :35 DEFERRABLE_SCRIPTS | `sed -n 30,48p src/game/hubs/year-plan.ts` |
| Family budget key | society/budget.ts `ACT_KEY = 'fam.act'` :53; offers are not family acts | `sed -n 1,12p src/game/society/budget.ts` |
| Wave leaf and the cycle | frontier-waves.ts :36 `pushFromWave`, :56 `pushResearch` (leaf, header says so); tech-waves.ts :131 announceWave, :162 push, :201 announceResearch, :503 port | `sed -n 1,5p src/game/business/frontier-waves.ts` |
| No wave fact exists | only kin.ts:285, kin-estates.ts:150, secret.ts and feud.ts emit | `grep -rn "emit(" src/game --include=*.ts \| grep -v kernel` |
| Facts store caps | world/facts.ts FACT_CAP 400, 12 a kind-year | `sed -n 35,39p src/game/world/facts.ts` |
| `hasTech` has 148 outside callers | history/timeline.ts :172 | `grep -rn "hasTech" src/game --include=*.ts \| grep -v history/timeline \| wc -l` |
| Menu slots and sections | menus-core.ts :79-83 `activities.items`; sections.ts :23 | `sed -n 76,84p src/game/modules/menus-core.ts` |
| Profile `rep` is reserved | people-facts.ts :58; PersonProfile.tsx :91 | `grep -n "'rep'\|rep:" src/game/hubs/people-facts.ts src/ui/components/PersonProfile.tsx` |
| Personal flag list | world-flags.ts :93 (`pendingAsks`, `persona.me`) | `grep -n "persona.me" src/game/world-flags.ts` |
| Writers of the two stored persona fields | career.ts:89, board.ts:276, nepo-succession.ts:48 and :91; board-ceo.ts:425 and :470, deeptech-found.ts:70, staff.ts:73 | `grep -rn "integrity:\|trait:" src/game/business/*.ts` |
| Notice weight table asks only for minimums | test/notice-weight-table.test.ts :96-120 | `sed -n 96,120p test/notice-weight-table.test.ts` |
| Test and fixture counts | 741 `*.test.ts`; 56 mention `pickLine` or `pick(`; 104 use `createNewLife`; fixtures golden-digests, r2-parity, kernel-parity, social-parity-*, life-pins, people-ui-exact | `ls test/*.test.ts \| wc -l; grep -rln "pickLine\|pick(" test/*.test.ts \| wc -l` |
| Ceiling list has 53 rows | test/ceiling-list.json (`persona-nudge`, `edge-caps`) | `python3 -c "import json;print(len(json.load(open('test/ceiling-list.json'))))"` |
| World budget | caps.ts :29 WORLD_NODE_CAP 80,000, :36 WORLD_ALLOTMENT r5 6,000 | `sed -n 29,37p src/game/world/caps.ts` |
| Bundle numbers | bundle.md section 1 (3,023,099 gzip, +54,001) | `sed -n 1,30p docs/superpowers/plans/2026-10-31-r5-v5.4.0/bundle.md` |
| Cycles track runs last, touches tech-waves.ts once | cycles.md header and section 1 | `sed -n 1,6p docs/superpowers/plans/2026-10-31-r5-v5.4.0/cycles.md` |

## Cross-check amendments (2026-10-31, `00-crosscheck.md` wins over any line above)

1. **Flag keys are the lead's (P3).** `composer`, `standing`, `tips` are added with the Paper's `paper` in one edit of `flags.ts` and `test/flags.test.ts` (eleven keys become fifteen). O1 needs P3 and no longer edits either file.
2. **Q4 settled.** The five kinds `tech.landed`, `tech.rival`, `tech.disclosed`, `social.scandal`, `offer.paid` are listed in `NOT_NEWS` in `news/kinds.ts` by the Paper's N1, so the Paper does not headline them in 5.4.0; the names freeze when O9, O11 and O13 merge. Bit 8 of `ft` is not used by the Paper (it stamps `paper.fx`). The table in 2.7 reads "For: reserved for a later Paper release" until a row is promoted.
3. **Bundle headroom gate.** O1, O2 (through O1), O3 and O13 wait for B3 because the allowance has 5,999 bytes of room before the diet. Every later task follows them transitively.
4. **One flip.** O14 rehearses and reports; N11 flips and re-records.
5. **Shared files, order inside this track.** `society/module.ts` steps are appended in the order O1 (comment), O10, O6, O8, O9, O11 (O12 has no step); `society/contract.ts` by O5 and O10 (either first); `text/pools.ts` by O9, O11, O12; `test/ceiling-list.json` and `test/ceiling-kit.ts` by O2, O6, O7, O8, O10, O11, O12 (each appends one or two rows at the end; the Paper's six rows come in N10 after them). `relationships.ts`: O5 before O7.
6. **Voice baselines.** O5 deletes the four topic arrays and the legacy opener list from `relationships.ts`, so its counts in `test/voice-gate-baseline.json` fall: O5 runs `UPDATE_VOICE_BASELINE=1` (shrink only). The 58 topic strings were checked with `unitFlags` for the roles text, log and scene and carry no flag (64 strings, 0 hits), so copying them into `text/topics.ts` (new file, must be clean) is safe in O2.
7. **Fame.** Endorsements raise fame by up to 4 a year (O11) and the Paper's story effect by up to 2 (N7). Fame decays 1 to 3 a year (2 to 5 above 60) in `special/fame.ts:1018`, so the sum cannot run away; the flip rehearsal's 200-seed balance probe prints the fame percentiles.

