# Area E: news, events, dialogue and the year text

Method: read the code, then played 13 seeded lives through the real `ageUp` (10 lives 1925-2026, half given $50M at 20; 3 tycoons, 3 firms, $3B). Probes: `plan-audit/e/`. Numbers are measured.

## 1. What exists today

**Event engine** (`src/game/events/*`, 30,836 lines). `events.ts` (425) picks one popup a year (chance 0.72) from `EVENT_LIBRARY`: 372 defs (136 era-pack), 209 on the default 10-year cooldown, 65 `once`; 33-45 eligible at any adult age. Memory: `lastFired`, 15 `EVENT_KINDS` groups (3 years), same person 5 years. Each event ends in `res()` (`helpers.ts`): an outcome popup plus a log line.

**Text pools.** `flavor.ts` (673): 341 base plus 4,418 era-pack lines, 1-2 log lines a year, `flavorRecent` memory of 60 keys: the only line memory in the game. Elsewhere 785 inline `pick(g,[...])`, 168 `pick(g,CONST)`, 77 `eraPick`, 45 `v(g,...)`: uniform random, no memory, one `g.rng` draw each (text choice moves the simulation). Era `@gates` (`era.ts`) are reusable. No composer; the 30 traits barely touch text.

**Dialogue** is a summary: "You talked with your sister about {topic}. {He} enjoyed it." (`relationships.ts:2292`: 32 topics, 5 openers, 5 tails, 3 a person a year). No memory or voice; twenty talks with one person repeat a topic almost surely.

**Pacing is per engine:** wealth asks (`events/wealth*.ts`, about 60 defs, cooldown 1-12, cap 3), career kit `Budget {choices 1, notices 2}` (`special/kit/year.ts`), "one popup a year" in about 15 files. No global budget. 35 yearly hooks; 1,831 `notice()`, 1,917 `log()` sites.

**News.** `history/events.ts` (206): 1,505 hand-written headlines 1900-2026 (about 12 a year), 144 procedural after; only the top one is logged ("📰 1969: ...", 54 characters). Also an `investments.ts` priority popup, `market.news` (max 20, read only by the Heavy R&D menu), economy `causes` (logged on 3 triggers). No newspaper screen, outlets, bias or player stories; about 100 simulated countries run unreported.

**Year digest.** `history/digest*.ts`: one "📅 1985: culture... prices" line, mean 312 characters against a 110 cap, 41% of log characters in historical lives. The log (`LifeLog.tsx`) is flat: `{id,text,tone}`.

**Voice.** `docs/VOICE.md`, `scripts/voice/*`. The report misses 9 of 10 targets (1,014 fragment punchlines). The only hard guard is em-dashes at most 24 (`voice-guards.test.ts`). Per-area tests (lab, sector, model, ceo-letter, obituary) run copy tables through `unitFlags/staticLength`: the pattern to reuse.

**Measured clutter and repetition**

Ordinary / $50M / tycoon, adult years:
- Popups a year, mean / p90 / max: 1.8 / 3 / 8; 5.4 / 8 / 12; 8 / 12 / 13.
- Log lines a year, mean / p90 / max: 4.2 / 7 / 9; 6.4 / 9 / 12; 12.5 / 18 / 19.
- Log lines repeating an earlier line: 4-15%; 17-34%.
- Same line within 10 years, per life: 2-17; 13-66.
- Lines on a 3-word opener used 4+ times: 4-22%; 30-44%.
- One popup title in a life: 2-7; 18-19 (Charity Gala, Family Business).

Worst repeats: yearly status lines ("My sister N has been avoiding me ever since I lent her money", 48 times in 10 lives), wealth asks (about 75% of hook-made choices), two popups per event. The generic library is fine for ordinary lives (3-15 of 23-62 events recur).

## 2. Gaps

1. No line memory outside flavor; state lines print yearly; asks cycle every 2-4 years; text draws share `g.rng`.
2. No composer, no personality in wording, no per-person dialogue memory.
3. No year budget or priority: up to 13 popups and 19 log lines, in queue order.
4. Digest 3x its cap, unstructured.
5. News is one line a year, detached from the sim: no outlets, sections, fame scaling or hooks.
6. Showcase is coin-flip menu actions (`deeptech-menu.ts:846`).

## 3. Design

### 3.1 Non-repeating text (`src/game/text/`, about 12 files)
- **Fresh pick, the migration key.** `pickLine(g, lines, fam?)` draws exactly one `rand(g)` like `pick`, so no seeded run shifts until memory excludes a line. Pools of 12 or fewer are shuffle-bags; larger pools exclude the last floor(n/2), max 8. The family key defaults to a hash of the pool, so a codemod over 785+168 sites needs no names; `v()` and `eraPick` cover about 120 sites in two edits.
- **Memory** `g.flags.textMem` (optional, validated): 300 pools x 6 indexes, 120 families (last year, count in 10 years), reset per generation; per person `p.data.said` (8 topics). About 8 KB.
- **Presentation text** (news, digest) uses `hpick(lifeId, year, key)`, a hash like the CEO coda (`business/career.ts:399`), never `g.rng`.
- **Composer.** Frames with slots; fillers tagged by era, wealth tier, mood; 6 voices (warm, blunt, dry, anxious, grand, sly) mapped from the 30 traits, the speaker's weighted 3x. Dialogue = opener x topic (about 60 by age and era) x reaction (voice, relationship) x tail, last topic per person excluded: thousands of combinations from about 800 lines.
- **State lines** `stateLine(g,key,value)`: print on a threshold change or every 5 years, 3 variants.
- **Family pacing for every engine:** `family` on event and ask defs, one shared memory replacing `EVENT_KINDS`; weight x0.25 for a family seen in 5 years; an ask family at most once in 4 years unless a storyline.
- **Tests.** `text-kit` plays 4 lives to 90 (about 25 s; nightly 20): repeated lines at most 5% (8% rich); same line within 10 years 0 (state lines 1 per 5); any line at most 3 times; popup family at most 6 a life, gap 4+; shared 3-word openers at most 12% (20% rich); popups p90 at most 4; a person's last 8 topics distinct. A registry test runs every `defineLines` line through `unitFlags`.

### 3.2 Year digest
- `log()`/`notice()` gain optional `s` (source = yearly hook name, set by `aging.ts` around each hook: 35 sources, no call-site edits), `a` (amount), `w` (weight 0-3 from a 120-title table). +12 bytes a line.
- `closeYear(g)`, called from `store.ageUpAction`, not `ageUp`, so tests that read `g.queue` stay green. It keeps decisions in order and at most 3 notices (4-5 in a life-changing year) by weight then magnitude; folds the rest into the log, ids stable (the `news-${gen}-${year}` precedent); merges near-duplicates by (source, skeleton) with summed amounts ("3 companies lost $1.7M on $18M"); queues one digest notice (`NoticeModal.digest?`, no new modal kind). Weight 0-1 outcomes become log-only.
- **Order:** headline of the year (90 characters), three stories (90), money line from the ledger (a test checks it against the books), people (3), world line, then collapsed categories with counts, expand on demand. At most 8 lines by default; last 3 kept in `flags.yearBook`.
- **Budgets:** unrequested choices 3 a year; extras wait in `pendingAsks` (6, expire in 2 years). Targets: ordinary popups p90 3, max 5; $50M p90 4, max 6; tycoon mean 4 plus one "Your companies" card, visible log 12.5 to 8.
- Rewrite 127 culture lines to 110 (`voice-batch.mjs`); prices stay in the This Year menu. Swap the `isNewsLine` quiet test (`life.ts:1995`) for `s`.

### 3.3 News: the Paper
- **Facts, not strings.** `emit(g,{k,y,c,a,v,s})` from systems and from detectors over economy, markets, NPC companies, rivals, waves, nations (area A's journal should be the source). A stored story is about 70 bytes `{k,y,c,e,v,s,o,sec}`; headlines render at read time from fact, outlet and template.
- **Sections:** World, Nation, Business and Markets, Tech, Sport and Culture, Local, Gossip. Per edition: front page plus 33 stories; 3 editions in full, a 30-year archive of front pages and player stories; at most 30 KB. One edition a year, live through the year, sealed at age-up.
- **Sources:** history table (scripted layer; wars from B); economy detectors (recession, inflation over 8%, unemployment +2 points, rate +100 bp, currency -10%, housing -8%, bank stress, shortage); index moves and listed-company scandals, bankruptcies, takeovers (today seen only by holders); `market.news`; rivals; politics; crime; NPC lives.
- **Score:** severity x4 + nearness (city 3, country 2, partner 1) + player relevance (to 6) + first of kind 2, minus 2 per repeat.
- **Outlets and bias:** fictional only ("{City} Courier", "Meridian Wire", trade press) with lean, sensationalism, trust, era reach (`techOdds`) and regime control (`nation/regime.ts`: state outlets drop or spin). Tabloids round magnitudes up (cap 20%). Rumours read current state only, never the future. Exact figures need "check the story" (staff, money; area H).
- **Player stories by fame** (0-100): local 15, national 35, front page 60, world 85. Effects only through `fame`/`notoriety` (`addHidden` limits) and brand within its 16-point cap.
- **Hooks.** Offer (endorsement, interview, book, headhunter, takeover, contract), threat (exposé: deny, settle, sue, buy silence; regulator; boycott) or tip from realized facts. One popup a year; the rest wait in "Tips and Offers" (6 open, 2-year expiry). Money moves only with real counterparties (an NPC firm pays an endorsement, at most 2% of its marketing spend; legal fees go to an NPC firm) through the kernel.
- **Voice:** new `rules.mjs` roles `headline` (cap 70, aim 55) and `deck` (110, aim 90); old keys untouched.

### 3.4 Showcase hook (area F)
Fixed calendar of fictional fairs by sector (a schedule, not a forecast). Booth cost fixed by tier, never by cash. Reception = 0.4 quality edge over the field + 0.2 presenter staff + 0.15 price fit + 0.15 marketing (log returns) + 0.1 demo roll (the only `g.rng` draw). Outlets review it; buzz at most +8% pull for a year, halving yearly, cap +25%; hooks: preorders, distributor, acquirer, rival copy.

## 4. Work breakdown
Text: T1 kit (`pickLine`, memory, `hpick`, registry) M, K. T2 repetition harness, nightly probe M, K. T3 codemod `v`/`eraPick`/consts, state lines M. T4 composer, voices, dialogue memory, 800 lines L, D. T5 family pacing (library, wealth, business, kit) M, A. T6 variants for the top 60 events M. T7 voice roles, VOICE.md S.
Digest: D1 log `s/a/w`, weight table M. D2 `closeYear` (budget, fold, merge, digest) L, A, G. D3 digest card, collapsed log M, G. D4 127 culture lines S.
News: N1 facts, detectors L, A, B, C. N2 outlets, bias, templates (60 kinds x 3 classes) L, H. N3 editions, scoring, follow-ups M. N4 player stories, fame effects M, I. N5 hooks, conserved money L, A. N6 Paper screen, source chips, links L, G, H. N7 showcase hook M, F. N8 conservation, determinism, size tests M, K.
Order: T7, T1-T3, D1-D3, T5, T4, N1-N7. About 30k lines with tests.

## 5. Risks
- Changed text draws shift seeded tests: one draw per pick, one family per PR (about 31 test files mention `pick`); `uid()` shifts hashed picks, so derived lines get stable ids.
- Save size: log +12 KB, news and memory about 38 KB.
- Exploits: paying hooks need real NPC cash and a ceiling; buzz capped; no foresight in rumours. Idempotence: stories keyed `${year}:${kind}:${subject}`, `closeYear` stamped by year.
- Folding hides something important: review the weight-3 list; never fold a notice before a choice.

## 6. Open questions
1. Demote popups only in the store flow (recommended) or also in headless `ageUp`?
2. Fictional outlets only (recommended)?
3. Show scheduled future events (fairs, Olympics) in the Paper? Yes, never outcomes.
4. Digest as the last popup for 10 years, then an inline card (recommended)?
5. Weight 0-1 outcomes log-only (recommended)?
